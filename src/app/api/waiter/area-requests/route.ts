import { NextResponse } from "next/server";
import { currentStaff } from "@/lib/staff-auth";
import { rejectCrossOrigin } from "@/lib/guest-api-security";
import { databaseFailure, databaseErrorCode } from "@/lib/database-errors";
import { WorkflowError } from "@/lib/workflow-error";
import { requireSimpleInventory } from "@/lib/simple-table-postgres";
import { getPostgres } from "@/lib/postgres-db";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const staff = await currentStaff();
  if (!staff || !["waiter", "manager"].includes(staff.role)) {
    return NextResponse.json(
      { error: "Waiter or manager access required" },
      { status: 403 },
    );
  }

  const originError = rejectCrossOrigin(request);
  if (originError) return originError;


  if (process.env.MO_BISTRO_DB !== "postgres") {
    return NextResponse.json({ error: "PostgreSQL required" }, { status: 503 });
  }

  const body = await request.json().catch(() => null);
  const area = body?.area;

  if (area !== "indoor" && area !== "outdoor") {
    return NextResponse.json(
      { error: "Invalid seating area" },
      { status: 400 },
    );
  }

  try {
    const sql = getPostgres();

    const result = await sql.begin(async (tx) => {
      await tx`SELECT pg_advisory_xact_lock(741122)`;

      const [modeSetting] =
        await tx`SELECT value FROM seating_settings WHERE key='table_view_mode'`;
      const mode = modeSetting?.value === "simple" ? "simple" : "detailed";
      if (mode === "simple") {
        await requireSimpleInventory(tx);
        const [pool] =
          await tx`SELECT occupied_tables FROM simple_table_capacity WHERE area=${area}`;
        if (!pool || pool.occupied_tables === 0)
          return {
            error: "No occupied anonymous tables in this area",
            status: 409,
          };
      } else {
        const [occupied] =
          await tx`SELECT id FROM restaurant_tables WHERE LOWER(area)=${area} AND status='occupied' LIMIT 1`;
        if (!occupied)
          return { error: "No occupied tables in this area", status: 409 };
      }

      const [existing] = await tx`
        SELECT id
        FROM table_ready_requests
        WHERE area = ${area}
          AND requested_by = ${staff.id}
          AND status = 'pending'
        LIMIT 1
      `;

      if (existing) {
        return {
          error: "You already have a pending request for this area",
          status: 409,
        };
      }

      const [created] = await tx`
        INSERT INTO table_ready_requests(area, requested_by, inventory_mode)
        VALUES (${area}, ${staff.id}, ${mode})
        ON CONFLICT (area, requested_by) WHERE status = 'pending' AND area IS NOT NULL
        DO NOTHING
        RETURNING id
      `;

      if (!created)
        return {
          error: "You already have a pending request for this area",
          status: 409,
        };
      return { success: true, request_id: created.id };
    });

    if ("error" in result) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status },
      );
    }

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof WorkflowError)
      return NextResponse.json({ error: error.message }, { status: 409 });
    console.error(
      "Area request failed:",
      databaseErrorCode(error) ?? "unavailable",
    );
    const failure = databaseFailure(
      error,
      "Unable to submit area request.",
      "migrations/20261012_request_schema_repair.sql and migrations/20261012_simple_inventory.sql",
    );

    return NextResponse.json(
      { error: failure.error },
      { status: failure.status },
    );
  }
}
