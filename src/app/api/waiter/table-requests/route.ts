import { NextResponse } from "next/server";
import { currentStaff } from "@/lib/staff-auth";
import { getPostgres } from "@/lib/postgres-db";

export const runtime = "nodejs";

export async function GET() {
  const staff = await currentStaff();
  if (!staff || !["waiter", "manager"].includes(staff.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (process.env.MO_BISTRO_DB !== "postgres") {
    return NextResponse.json({ error: "PostgreSQL required" }, { status: 503 });
  }

  try {
    const requests = await getPostgres()`
      SELECT
        r.id,
        COALESCE(to_jsonb(r)->>'inventory_mode', 'detailed') AS inventory_mode,
        r.table_id,
        COALESCE(t.area, NULLIF(to_jsonb(r)->>'area', '')) AS area,
        COALESCE(t.name, INITCAP(NULLIF(to_jsonb(r)->>'area', '')) || ' area') AS table_name,
        r.status,
        r.requested_at,
        r.reviewed_at
      FROM table_ready_requests r
      LEFT JOIN restaurant_tables t ON t.id = r.table_id
      WHERE r.requested_by = ${staff.id}
        AND r.requested_at > NOW() - INTERVAL '24 hours'
      ORDER BY r.requested_at DESC, r.id DESC
      LIMIT 30
    `;

    return NextResponse.json({ requests }, {
      headers: { "Cache-Control": "no-store" }
    });
  } catch (error) {
    console.error("Waiter request lookup failed:", error);
    return NextResponse.json(
      { error: "Unable to load table requests" },
      { status: 503 }
    );
  }
}
