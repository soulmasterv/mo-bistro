import { NextResponse } from "next/server";
import { getQRPermit } from "@/lib/qr-registration-permit";
import { getSettingPostgres } from "@/lib/staff-auth-postgres";
import { getSetting } from "@/lib/staff-auth";

export async function GET(request: Request) {
  const code = new URL(request.url).searchParams.get("code");
  try {
    const required = process.env.MO_BISTRO_DB === "postgres"
      ? await getSettingPostgres("qr_required", "false")
      : getSetting("qr_required", "false");

    if (required !== "true") {
      return NextResponse.json(
        { valid: true, expiresAt: null },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    if (process.env.MO_BISTRO_DB !== "postgres") {
      return NextResponse.json(
        { valid: false },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    const permit = code
      ? await getQRPermit(code)
      : null;

    return NextResponse.json(
      {
        valid: Boolean(permit),
        expiresAt: permit?.expires_at ?? null,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    return NextResponse.json(
      { valid: false },
      {
        status: 503,
        headers: { "Cache-Control": "no-store" },
      }
    );
  }
}
