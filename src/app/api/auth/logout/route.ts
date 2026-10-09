import { clearSessionPostgres } from "@/lib/staff-auth-postgres";
import { rejectCrossOrigin } from "@/lib/guest-api-security";
import { NextResponse } from "next/server";
import { clearSession } from "@/lib/staff-auth";

export async function POST(request: Request) {
  const badOrigin = rejectCrossOrigin(request);
  if (badOrigin) return badOrigin;

  if (process.env.MO_BISTRO_DB === "postgres") {
    await clearSessionPostgres();
  } else {
    await clearSession();
  }
  return NextResponse.json({ success: true });
}
