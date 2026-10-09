import { isAllowedQROrigin } from "@/lib/qr-origin";
import { checkRateLimit } from "@/lib/api-rate-limit";
import { NextResponse } from "next/server";
import { verifyQR } from "@/lib/rotating-qr";
import { issueQRPermit } from "@/lib/qr-registration-permit";
import { getSettingPostgres } from "@/lib/staff-auth-postgres";
import { getSetting } from "@/lib/staff-auth";

export async function POST(request: Request) {
  if (!isAllowedQROrigin(request)) {
    return NextResponse.json(
      { error: "Invalid request origin." },
      { status: 403 }
    );
  }

  const limited = await checkRateLimit(
    request, "verify", 30, 60
  );
  if (limited) return limited;

  try {
    const { qr_code } = await request.json();

    const required = process.env.MO_BISTRO_DB === "postgres"
      ? await getSettingPostgres("qr_required", "false")
      : getSetting("qr_required", "false");

    if (required !== "true") {
      return NextResponse.json({ valid: true });
    }

    const valid = process.env.MO_BISTRO_DB === "postgres"
      ? await issueQRPermit(qr_code)
      : await verifyQR(qr_code);

    return NextResponse.json(
      { valid },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    return NextResponse.json(
      { valid: false },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}
