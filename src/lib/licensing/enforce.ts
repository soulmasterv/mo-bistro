import "server-only";
import { NextResponse } from "next/server";
import { licenseStatus } from "@/lib/licensing/core";

export async function requireActiveLicense() {
  if (
    process.env.NODE_ENV === "development" &&
    process.env.LICENSE_ENFORCEMENT === "false"
  ) {
    return null;
  }

  try {
    const license = await licenseStatus();

    if (license.licensed) return null;

    return NextResponse.json(
      {
        error: "Subscription inactive",
        license_status: license.status,
      },
      {
        status: 403,
        headers: { "Cache-Control": "no-store" },
      }
    );
  } catch {
    return NextResponse.json(
      { error: "License verification unavailable" },
      { status: 503 }
    );
  }
}
