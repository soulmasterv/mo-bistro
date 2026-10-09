import "server-only";
import { NextResponse } from "next/server";
import { currentStaff } from "@/lib/staff-auth";

export async function requireReceptionStaff() {
  const staff = await currentStaff();
  if (!staff || !["manager", "reception"].includes(staff.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

export function rejectCrossOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return null;
  const host = request.headers.get("host");
  try {
    const parsed = new URL(origin);
    if (!host || parsed.host.toLowerCase() !== host.toLowerCase() ||
        !["http:", "https:"].includes(parsed.protocol)) {
      return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  }
  return null;
}
