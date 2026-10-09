import { getPostgres } from "@/lib/postgres-db";
import { requireActiveLicense } from "@/lib/licensing/enforce";
import { NextResponse } from "next/server";
import db from "@/lib/db";
import { currentStaff } from "@/lib/staff-auth";
import { initializeTables, listTables } from "@/lib/restaurant-tables";

export async function GET() {
  if (!(await currentStaff())) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  if (process.env.MO_BISTRO_DB === "postgres") {
    const rows = await getPostgres()`SELECT id,name,seats,area,status,updated_at FROM restaurant_tables ORDER BY id`;
    return NextResponse.json(rows, { headers: { "Cache-Control": "no-store" } });
  }

  if (process.env.MO_BISTRO_DB === "postgres") {
    const tables = await getPostgres()`SELECT id,name,seats,area,status,updated_at FROM restaurant_tables ORDER BY id`;
    return NextResponse.json(tables, { headers: { "Cache-Control": "no-store" } });
  }

  return NextResponse.json(listTables(), {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function PATCH(request: Request) {
  const staff = await currentStaff();

  if (!staff || !["manager", "reception"].includes(staff.role)) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }
  const licenseError = await requireActiveLicense();
  if (licenseError) return licenseError;


  const origin = request.headers.get("origin");
  const host = request.headers.get("host");

  if (origin) {
    let originHost: string;

    try {
      originHost = new URL(origin).host;
    } catch {
      return NextResponse.json(
        { error: "Invalid origin" },
        { status: 403 }
      );
    }

    if (!host || originHost !== host) {
      return NextResponse.json(
        { error: "Invalid origin" },
        { status: 403 }
      );
    }
  }

  const body = await request.json().catch(() => null);

  if (
    !body ||
    !Number.isSafeInteger(body.id) ||
    body.id < 1 ||
    body.status !== "occupied"
  ) {
    return NextResponse.json(
      { error: "Invalid table update" },
      { status: 400 }
    );
  }

  if (process.env.MO_BISTRO_DB === "postgres") {
    const rows = await getPostgres()`
      UPDATE restaurant_tables
      SET status='occupied', updated_at=CURRENT_TIMESTAMP
      WHERE id=${body.id}
      RETURNING id
    `;
    return NextResponse.json(
      rows.length ? { success: true, status: "occupied" } : { error: "Table not found" },
      { status: rows.length ? 200 : 404 }
    );
  }

  if (process.env.MO_BISTRO_DB === "postgres") {
    const rows = await getPostgres()`
      UPDATE restaurant_tables SET status='occupied',updated_at=CURRENT_TIMESTAMP
      WHERE id=${body.id} RETURNING id
    `;
    return NextResponse.json(rows.length
      ? { success: true, status: "occupied" }
      : { error: "Table not found" }, { status: rows.length ? 200 : 404 });
  }

  initializeTables();

  const result = db.prepare(`
    UPDATE restaurant_tables
    SET status='occupied', updated_at=CURRENT_TIMESTAMP
    WHERE id=?
  `).run(body.id);

  return NextResponse.json(
    result.changes
      ? { success: true, status: "occupied" }
      : { error: "Table not found" },
    { status: result.changes ? 200 : 404 }
  );
}
