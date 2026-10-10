import { NextResponse } from "next/server";
import { currentStaff } from "@/lib/staff-auth";
import { getPostgres } from "@/lib/postgres-db";
import { getSettingPostgres } from "@/lib/staff-auth-postgres";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const staff = await currentStaff();
  if (!staff || !["manager", "reception"].includes(staff.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (process.env.MO_BISTRO_DB !== "postgres") {
    return NextResponse.json({ error: "PostgreSQL required" }, { status: 503 });
  }

  const id = Number(new URL(request.url).searchParams.get("table_id"));
  if (!Number.isSafeInteger(id) || id < 1) {
    return NextResponse.json({ error: "Invalid table" }, { status: 400 });
  }

  try {
    const sql = getPostgres();
    const [table] = await sql`
      SELECT id, name, seats, area, status
      FROM restaurant_tables WHERE id = ${id}
    `;
    if (!table || table.status !== "free") {
      return NextResponse.json({ error: "Table is not available" }, { status: 409 });
    }

    const override = (await getSettingPostgres("allow_area_override", "false")) === "true";
    const guests = await sql`
      SELECT id, name, party_size, seating_preference
      FROM guests
      WHERE status IN ('waiting', 'called')
        AND party_size <= ${table.seats}
        AND (${override} OR seating_preference = 'any' OR seating_preference = ${table.area})
      ORDER BY created_at ASC, id ASC
      LIMIT 1
    `;

    return NextResponse.json({
      table: { id: table.id, name: table.name },
      guest: guests[0] ?? null
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Unable to find next guest" }, { status: 503 });
  }
}
