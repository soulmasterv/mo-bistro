import { NextResponse } from "next/server";
import { currentStaff } from "@/lib/staff-auth";
import { getCurrentQR } from "@/lib/rotating-qr";

export async function GET(request: Request) {
  if (!(await currentStaff())) {
    return NextResponse.json(
      { error: "Unauthorized" }, { status: 401 }
    );
  }

  const qr = await getCurrentQR();
  const origin = new URL(request.url).origin;

  return NextResponse.json({
    url: `${origin}/join?code=${encodeURIComponent(qr.code)}`,
    expiresAt: qr.expiresAt,
    interval: qr.interval,
  }, {
    headers: { "Cache-Control": "no-store" },
  });
}
