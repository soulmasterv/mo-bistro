import { getPostgres } from "@/lib/postgres-db";
import { requireActiveLicense } from "@/lib/licensing/enforce";
import { NextResponse } from "next/server";
import db from "@/lib/db";
import { currentStaff } from "@/lib/staff-auth";
import { databaseFailure } from "@/lib/database-errors";
import { rejectCrossOrigin } from "@/lib/guest-api-security";
import { initializeTables, listTables } from "@/lib/restaurant-tables";

export async function GET() {
  if (!(await currentStaff())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (process.env.MO_BISTRO_DB === "postgres") {
    const rows =
      await getPostgres()`SELECT id,name,seats,area,status,updated_at FROM restaurant_tables ORDER BY id`;
    return NextResponse.json(rows, {
      headers: { "Cache-Control": "no-store" },
    });
  }

  return NextResponse.json(listTables(), {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function PATCH(request: Request) {
  const staff = await currentStaff();

  if (!staff || !["manager", "reception"].includes(staff.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const licenseError = await requireActiveLicense();
  if (licenseError) return licenseError;

  const originError = rejectCrossOrigin(request);
  if (originError) return originError;

  const body = await request.json().catch(() => null);

  if (
    !body ||
    !Number.isSafeInteger(body.id) ||
    body.id < 1 ||
    body.status !== "occupied"
  ) {
    return NextResponse.json(
      { error: "Invalid table update" },
      { status: 400 },
    );
  }

  if (process.env.MO_BISTRO_DB === "postgres") {
    try {
      const result = await getPostgres().begin(async (tx) => {
        await tx`SELECT pg_advisory_xact_lock(741122)`;
        const [mode] =
          await tx`SELECT value FROM seating_settings WHERE key='table_view_mode'`;
        if (mode?.value === "simple")
          return {
            error: "Named-table updates require Detailed Mode.",
            status: 409,
          };
        const rows =
          await tx`UPDATE restaurant_tables SET status='occupied',updated_at=CURRENT_TIMESTAMP WHERE id=${body.id} AND status='free' RETURNING id`;
        return rows.length
          ? { success: true, status: 200 }
          : { error: "Table is unavailable or not found.", status: 409 };
      });
      return NextResponse.json(result, { status: result.status });
    } catch (error) {
      const failure = databaseFailure(
        error,
        "Unable to update table.",
        "migrations/001_postgres_schema.sql",
      );
      return NextResponse.json(
        { error: failure.error },
        { status: failure.status },
      );
    }
  }
  initializeTables();

  const result = db
    .prepare(
      `
    UPDATE restaurant_tables
    SET status='occupied', updated_at=CURRENT_TIMESTAMP
    WHERE id=?
  `,
    )
    .run(body.id);

  return NextResponse.json(
    result.changes
      ? { success: true, status: "occupied" }
      : { error: "Table not found" },
    { status: result.changes ? 200 : 404 },
  );
}
