import { NextResponse } from "next/server";
import { currentStaff } from "@/lib/staff-auth";
import { requireActiveLicense } from "@/lib/licensing/enforce";
import { rejectCrossOrigin } from "@/lib/guest-api-security";
import { getPostgres } from "@/lib/postgres-db";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const staff = await currentStaff();

  if (!staff || !["waiter", "reception", "manager"].includes(staff.role)) {
    return NextResponse.json(
      { error: "Staff access required" },
      { status: 403 }
    );
  }

  const originError = rejectCrossOrigin(request);
  if (originError) return originError;

  const licenseError = await requireActiveLicense();
  if (licenseError) return licenseError;

  if (process.env.MO_BISTRO_DB !== "postgres") {
    return NextResponse.json(
      { error: "Table requests require PostgreSQL" },
      { status: 503 }
    );
  }

  const { id } = await context.params;
  const tableId = Number(id);

  if (!Number.isSafeInteger(tableId) || tableId <= 0) {
    return NextResponse.json(
      { error: "Invalid table ID" },
      { status: 400 }
    );
  }

  try {
    const sql = getPostgres();

    const result = await sql.begin(async (tx) => {
      await tx`SELECT pg_advisory_xact_lock(741122)`;

      const [table] = await tx`
        SELECT id, status
        FROM restaurant_tables
        WHERE id = ${tableId}
        FOR UPDATE
      `;

      if (!table) {
        return { error: "Table not found", status: 404 };
      }

      if (table.status !== "occupied") {
        return { error: "Table is not occupied", status: 409 };
      }

      const rows = await tx`
        INSERT INTO table_ready_requests(table_id, requested_by)
        VALUES (${tableId}, ${staff.id})
        ON CONFLICT (table_id) WHERE status = 'pending'
        DO NOTHING
        RETURNING id
      `;

      if (!rows.length) {
        return { error: "A request is already pending", status: 409 };
      }

      return { success: true, request_id: rows[0].id };
    });

    if ("error" in result) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status }
      );
    }

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error("Table request failed:", error);

    return NextResponse.json(
      { error: "Unable to submit table request" },
      { status: 503 }
    );
  }
}
