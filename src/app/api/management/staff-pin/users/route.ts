import { NextResponse } from "next/server";
import { currentStaff } from "@/lib/staff-auth";
import { getPostgres } from "@/lib/postgres-db";
import { databaseFailure, databaseErrorCode } from "@/lib/database-errors";
import { requireActiveLicense } from "@/lib/licensing/enforce";

export const runtime = "nodejs";

export async function GET() {
  try {
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

    const sql = getPostgres();

    const [schema] = await sql`
      SELECT EXISTS (SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = 'staff_users'
          AND column_name = 'pin_hash') AS pin_supported
    `;
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
        (NULLIF(to_jsonb(staff_users)->>'pin_hash', '') IS NOT NULL) AS has_pin
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
      { users, current_staff_id: staff.id, pin_supported: Boolean(schema.pin_supported),
        warning: schema.pin_supported ? null : "Staff PINs are unavailable until migrations/20261010_staff_pin_login.sql is reviewed and applied by an administrator." },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Unable to list staff PIN accounts:", databaseErrorCode(error) ?? "unavailable");
    const failure = databaseFailure(error, "Unable to load staff accounts.", "migrations/20261010_staff_pin_login.sql");

    return NextResponse.json(
      { error: failure.error },
      { status: failure.status }
    );
  }
}
