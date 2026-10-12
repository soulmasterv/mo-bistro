import { rejectCrossOrigin } from "@/lib/guest-api-security";
import { requireActiveLicense } from "@/lib/licensing/enforce";
import { NextResponse } from "next/server";
import { currentStaff } from "@/lib/staff-auth";
import { releaseTable } from "@/lib/seating-v3";
import { releaseTablePostgres } from "@/lib/seating-postgres";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const staff = await currentStaff();
  if (!staff || !["manager","reception","waiter"].includes(staff.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const licenseError = await requireActiveLicense();
  if (licenseError) return licenseError;


  const originError = rejectCrossOrigin(request);
  if (originError) return originError;

  const { id } = await context.params;
  const tableId = Number(id);

  if (!Number.isSafeInteger(tableId) || tableId < 1) {
    return NextResponse.json({ error: "Invalid table" }, { status: 400 });
  }

  try {
    const result = process.env.MO_BISTRO_DB === "postgres"
      ? await releaseTablePostgres(tableId)
      : releaseTable(tableId);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to release" },
      { status: 409 }
    );
  }
}
