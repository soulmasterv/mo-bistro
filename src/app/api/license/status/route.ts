import { NextResponse } from "next/server";
import { currentStaff } from "@/lib/staff-auth";
import {
  authorizedOwner,
  licenseStatus,
  licenseVersion,
} from "@/lib/licensing/core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!authorizedOwner(request) && !await currentStaff()) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  try {
    const license = await licenseStatus();

    return NextResponse.json(license, {
      status: license.licensed ? 200 : 403,
      headers: { "Cache-Control": "no-store", ETag:licenseVersion(license) },
    });
  } catch {
    return NextResponse.json(
      { error: "License service unavailable" },
      { status: 503 }
    );
  }
}
