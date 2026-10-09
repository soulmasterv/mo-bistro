import { NextResponse } from "next/server";
import { currentStaff } from "@/lib/staff-auth";
import { getPostgres } from "@/lib/postgres-db";

export const runtime = "nodejs";

export async function GET() {
  const staff = await currentStaff();

  if (!staff || !["manager", "reception"].includes(staff.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (process.env.MO_BISTRO_DB !== "postgres") {
    return NextResponse.json({ error: "PostgreSQL required" }, { status: 503 });
  }

  try {
    const requests = await getPostgres()`
      SELECT
        r.id,
        r.table_id,
        r.status,
        r.requested_at,
        t.name AS table_name,
        t.area,
        t.seats,
        u.username AS requested_by
      FROM table_ready_requests r
      JOIN restaurant_tables t ON t.id = r.table_id
      JOIN staff_users u ON u.id = r.requested_by
      WHERE r.status = 'pending'
      ORDER BY r.requested_at ASC
    `;

    return NextResponse.json(requests, {
      headers: { "Cache-Control": "no-store" }
    });
  } catch (error) {
    console.error("Failed to load table requests:", error);
    return NextResponse.json(
      { error: "Unable to load requests" },
      { status: 503 }
    );
  }
}
