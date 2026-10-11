import { NextResponse } from "next/server";
import { currentStaff } from "@/lib/staff-auth";
import { getPostgres } from "@/lib/postgres-db";
import { requireActiveLicense } from "@/lib/licensing/enforce";

export const runtime = "nodejs";

export async function GET() {
  const staff = await currentStaff();

  if (!staff || staff.role !== "manager") {
    return NextResponse.json(
      { error: "Forbidden" },
      { status: 403 }
    );
  }

  const licenseError = await requireActiveLicense();
  if (licenseError) return licenseError;

  if (process.env.MO_BISTRO_DB !== "postgres") {
    return NextResponse.json(
      { error: "PostgreSQL required" },
      { status: 503 }
    );
  }

  try {
    const sql = getPostgres();

    const users = await sql<{
      id: number;
      username: string;
      role: string;
      active: number;
      has_pin: boolean;
    }[]>`
      SELECT
        id,
        username,
        role,
        active,
        (pin_hash IS NOT NULL) AS has_pin
      FROM staff_users
      ORDER BY
        CASE role
          WHEN 'manager' THEN 0
          WHEN 'reception' THEN 1
          ELSE 2
        END,
        LOWER(username)
    `;

    return NextResponse.json(
      { users },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Unable to list staff PIN accounts:", error);

    return NextResponse.json(
      { error: "Unable to load staff accounts." },
      { status: 500 }
    );
  }
}
