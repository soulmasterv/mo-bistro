import { NextResponse } from "next/server";
import { currentStaff } from "@/lib/staff-auth";
import { requireActiveLicense } from "@/lib/licensing/enforce";
import { getPostgres } from "@/lib/postgres-db";

export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const staff = await currentStaff();

  if (!staff || !["manager", "reception"].includes(staff.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const origin = request.headers.get("origin");
  const host = request.headers.get("host");

  if (origin) {
    let originHost: string;
    try {
      originHost = new URL(origin).host;
    } catch {
      return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
    }

    if (!host || originHost !== host) {
      return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
    }
  }

  const licenseError = await requireActiveLicense();
  if (licenseError) return licenseError;

  if (process.env.MO_BISTRO_DB !== "postgres") {
    return NextResponse.json({ error: "PostgreSQL required" }, { status: 503 });
  }

  const { id } = await context.params;
  const requestId = Number(id);
  const body = await request.json().catch(() => null);
  const action = body?.action;

  if (
    !Number.isSafeInteger(requestId) ||
    requestId < 1 ||
    !["approve", "reject"].includes(action)
  ) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  try {
    const sql = getPostgres();

    const result = await sql.begin(async (tx) => {
      // Same lock used by the existing seating/release functions.
      await tx`SELECT pg_advisory_xact_lock(741122)`;

      const [pending] = await tx`
        SELECT id, table_id, area, status
        FROM table_ready_requests
        WHERE id = ${requestId}
        FOR UPDATE
      `;

      if (!pending) {
        return { error: "Request not found", status: 404 };
      }

      if (pending.status !== "pending") {
        return { error: "Request already processed", status: 409 };
      }

      if (action === "approve") {
        let selectedTableId = pending.table_id;

        if (pending.area) {
          const supplied = Number(body?.table_id);

          if (!Number.isSafeInteger(supplied) || supplied < 1) {
            return { error: "Select an occupied table before approving", status: 400 };
          }

          selectedTableId = supplied;
        }

        const [table] = await tx`
          SELECT id, status, area
          FROM restaurant_tables
          WHERE id = ${selectedTableId}
          FOR UPDATE
        `;

        if (!table || table.status !== "occupied") {
          return { error: "Table is no longer occupied", status: 409 };
        }

        if (pending.area && String(table.area).toLowerCase() !== pending.area) {
          return { error: "Selected table is in the wrong area", status: 409 };
        }

        // Preserve the existing releaseTablePostgres behavior.
        await tx`
          UPDATE seating_history
          SET released_at = CURRENT_TIMESTAMP
          WHERE table_id = ${selectedTableId}
            AND released_at IS NULL
        `;

        await tx`
          UPDATE guests
          SET table_id = NULL, updated_at = CURRENT_TIMESTAMP
          WHERE table_id = ${selectedTableId}
            AND status = 'seated'
        `;

        await tx`
          UPDATE restaurant_tables
          SET status = 'free', updated_at = CURRENT_TIMESTAMP
          WHERE id = ${selectedTableId}
        `;
      }

      const newStatus = action === "approve" ? "approved" : "rejected";

      await tx`
        UPDATE table_ready_requests
        SET status = ${newStatus},
            reviewed_by = ${staff.id},
            reviewed_at = NOW()
        WHERE id = ${requestId}
      `;

      return {
        success: true,
        request_id: requestId,
        status: newStatus,
        table_id: action === "approve" ? Number(body?.table_id || pending.table_id) : pending.table_id
      };
    });

    if ("error" in result) {
      return NextResponse.json(
        { error: result.error },
        { status: typeof result.status === "number" ? result.status : 409 }
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Table approval failed:", error);
    return NextResponse.json(
      { error: "Unable to process request" },
      { status: 503 }
    );
  }
}
