import { NextResponse } from "next/server";
import { currentStaff } from "@/lib/staff-auth";
import { WorkflowError } from "@/lib/workflow-error";
import { setActivityActor } from "@/lib/staff-activity";
import {
  freeSimpleTableInTransaction,
  type Area,
} from "@/lib/simple-table-postgres";
import { databaseErrorCode, databaseFailure } from "@/lib/database-errors";
import { rejectCrossOrigin } from "@/lib/guest-api-security";
import { getPostgres } from "@/lib/postgres-db";

export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const staff = await currentStaff();

  if (!staff || !["manager", "reception"].includes(staff.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const originError = rejectCrossOrigin(request);
  if (originError) return originError;


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
      await setActivityActor(tx, staff.id);

      const [pending] = await tx`
        SELECT id, table_id, NULLIF(to_jsonb(table_ready_requests)->>'area', '') AS area, COALESCE(to_jsonb(table_ready_requests)->>'inventory_mode','detailed') AS inventory_mode, status
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

      const requestMode =
        pending.inventory_mode === "simple" ? "simple" : "detailed";
      const [mode] =
        await tx`SELECT value FROM seating_settings WHERE key='table_view_mode'`;
      if (action === "approve" && (mode?.value ?? "detailed") !== requestMode)
        return {
          error:
            "Request belongs to a different inventory mode. Reject it before switching modes.",
          status: 409,
        };
      let selectedTableId = pending.table_id;
      if (action === "approve" && pending.inventory_mode === "simple") {
        if (pending.area !== "indoor" && pending.area !== "outdoor")
          return { error: "Invalid request area", status: 400 };
        await freeSimpleTableInTransaction(
          tx,
          pending.area as Area,
          staff.id,
          `request-${requestId}`,
        );
      } else if (action === "approve") {
        if (pending.area) {
          const supplied = Number(body?.table_id);

          if (!Number.isSafeInteger(supplied) || supplied < 1) {
            return {
              error: "Select an occupied table before approving",
              status: 400,
            };
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

      if (action === "approve" && pending.inventory_mode !== "simple") {
        await tx`UPDATE table_ready_requests SET status='cancelled', reviewed_by=${staff.id}, reviewed_at=NOW()
          WHERE table_id=${selectedTableId} AND id <> ${requestId} AND status='pending'`;
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
        table_id: selectedTableId === null ? null : Number(selectedTableId),
        area: pending.area,
        inventory_mode: pending.inventory_mode,
      };
    });

    if ("error" in result) {
      return NextResponse.json(
        { error: result.error },
        { status: typeof result.status === "number" ? result.status : 409 },
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof WorkflowError)
      return NextResponse.json({ error: error.message }, { status: 409 });
    console.error(
      "Table approval failed:",
      databaseErrorCode(error) ?? "unavailable",
    );
    const failure = databaseFailure(
      error,
      "Unable to process request.",
      "migrations/20261012_simple_inventory.sql",
    );
    return NextResponse.json(
      { error: failure.error },
      { status: failure.status },
    );
  }
}
