import { NextResponse } from "next/server";
import { currentStaff } from "@/lib/staff-auth";

export async function GET() {
  const staff = await currentStaff();

  return NextResponse.json(
    staff || { error: "Not authenticated" },
    { status: staff ? 200 : 401 }
  );
}
