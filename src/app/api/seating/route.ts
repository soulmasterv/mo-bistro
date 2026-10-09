import { requireActiveLicense } from "@/lib/licensing/enforce";
import { NextResponse } from "next/server";
import { currentStaff } from "@/lib/staff-auth";
import { getAssignableTables, assignTable } from "@/lib/seating-v3";
import { getAssignableTablesPostgres, assignTablePostgres } from "@/lib/seating-postgres";

export async function GET(request: Request) {
  if (!(await currentStaff())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const id = Number(new URL(request.url).searchParams.get("guest_id"));
  if (!Number.isSafeInteger(id) || id < 1) {
    return NextResponse.json({ error: "Invalid guest" }, { status: 400 });
  }

  const result = process.env.MO_BISTRO_DB === "postgres"
    ? await getAssignableTablesPostgres(id)
    : getAssignableTables(id);
  if (!result) {
    return NextResponse.json({ error: "Guest not found" }, { status: 404 });
  }

  return NextResponse.json(result);
}

export async function POST(request: Request) {
  if (!(await currentStaff())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const licenseError = await requireActiveLicense();
  if (licenseError) return licenseError;


  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host")
    || request.headers.get("host");

  if (origin && (!host || new URL(origin).host !== host)) {
    return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  if (
    !Number.isSafeInteger(body?.guest_id) ||
    !Number.isSafeInteger(body?.table_id) ||
    body.guest_id < 1 ||
    body.table_id < 1
  ) {
    return NextResponse.json({ error: "Invalid assignment" }, { status: 400 });
  }

  try {
    const result = process.env.MO_BISTRO_DB === "postgres"
      ? await assignTablePostgres(body.guest_id, body.table_id)
      : assignTable(body.guest_id, body.table_id);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Assignment failed" },
      { status: 409 }
    );
  }
}
