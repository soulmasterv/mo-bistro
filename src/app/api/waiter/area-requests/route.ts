import { NextResponse } from "next/server";
import { currentStaff } from "@/lib/staff-auth";
import { requireActiveLicense } from "@/lib/licensing/enforce";
import { rejectCrossOrigin } from "@/lib/guest-api-security";
import { getPostgres } from "@/lib/postgres-db";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const staff = await currentStaff();
  if (!staff || staff.role !== "waiter") {
    return NextResponse.json(
      { error: "Waiter access required" },
      { status: 403 }
    );
  }

  const originError = rejectCrossOrigin(request);
  if (originError) return originError;

  const licenseError = await requireActiveLicense();
  if (licenseError) return licenseError;

  if (process.env.MO_BISTRO_DB !== "postgres") {
    return NextResponse.json(
      { error: "PostgreSQL required" },
      { status: 503 }
    );
  }

  const body = await request.json().catch(() => null);
  const area = body?.area;

  if (area !== "indoor" && area !== "outdoor") {
    return NextResponse.json(
      { error: "Invalid seating area" },
      { status: 400 }
    );
  }

  try {
    const sql = getPostgres();

    const result = await sql.begin(async tx => {
      await tx`SELECT pg_advisory_xact_lock(741122)`;

      const [occupied] = await tx`
        SELECT id
        FROM restaurant_tables
        WHERE LOWER(area) = ${area}
          AND status = 'occupied'
        LIMIT 1
      `;

      if (!occupied) {
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
        return { error: "You already have a pending request for this area", status: 409 };
      }

      const [created] = await tx`
        INSERT INTO table_ready_requests(area, requested_by)
        VALUES (${area}, ${staff.id})
        RETURNING id
      `;

      return { success: true, request_id: created.id };
    });

    if ("error" in result) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status }
      );
    }

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error("Area request failed:", error);

    return NextResponse.json(
      { error: "Unable to submit area request. Check that the migration has been applied." },
      { status: 503 }
    );
  }
}
