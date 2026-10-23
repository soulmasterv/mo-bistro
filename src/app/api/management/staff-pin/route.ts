import { databaseFailure, databaseErrorCode } from "@/lib/database-errors";
import { NextResponse } from "next/server";
import { currentStaff } from "@/lib/staff-auth";
import { hashCredential } from "@/lib/staff-auth-utils";
import { getPostgres } from "@/lib/postgres-db";
import { rejectCrossOrigin } from "@/lib/guest-api-security";

export const runtime = "nodejs";

export async function PATCH(request: Request) {
  const staff = await currentStaff();

  if (!staff || staff.role !== "manager") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const originError = rejectCrossOrigin(request);
  if (originError) return originError;


  if (process.env.MO_BISTRO_DB !== "postgres") {
    return NextResponse.json(
      { error: "PostgreSQL required" },
      { status: 503 }
    );
  }

  const body = await request.json().catch(() => null);
  const staffId = body?.staff_id;
  const pin = body?.pin;

  if (
    !Number.isSafeInteger(staffId) ||
    staffId < 1 ||
    typeof pin !== "string" ||
    !/^\d{6}$/.test(pin)
  ) {
    return NextResponse.json(
      { error: "Provide a valid staff ID and six-digit PIN." },
      { status: 400 }
    );
  }

  // Prevent trivial PINs.
  if (
    /^(\d)\1{5}$/.test(pin) ||
    ["123456", "654321", "012345"].includes(pin)
  ) {
    return NextResponse.json(
      { error: "Choose a less predictable PIN." },
      { status: 400 }
    );
  }

  try {
    const sql = getPostgres();
    const hash = hashCredential(pin);


    const updated = await sql.begin(async tx => {
      const rows = await tx<{ id: number }[]>`
        UPDATE staff_users
        SET pin_hash = ${hash}
        WHERE id = ${staffId}
          AND active = 1
        RETURNING id
      `;

      if (!rows.length) return false;

      await tx`
        DELETE FROM staff_sessions
        WHERE staff_id = ${staffId}
      `;

      return true;
    });

    if (!updated) {
      return NextResponse.json(
        { error: "Active staff member not found." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Staff PIN updated.",
    });
  } catch (error) {
    console.error("PIN assignment failed:", databaseErrorCode(error) ?? "unavailable");
    const failure=databaseFailure(error,"Unable to update PIN.","migrations/20261012_staff_schema_repair.sql");

    return NextResponse.json(
      { error: failure.error },
      { status: failure.status }
    );
  }
}
