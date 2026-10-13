import { checkRateLimit } from "@/lib/api-rate-limit";
import { getPostgres } from "@/lib/postgres-db";
import { NextResponse } from "next/server";
import { rejectCrossOrigin } from "@/lib/guest-api-security";
import db from "@/lib/db";
export async function POST(request: Request) {
  const badOrigin = rejectCrossOrigin(request);
  if (badOrigin) return badOrigin;
  const limited = await checkRateLimit(request, "booking-lookup", 10, 900);
  if (limited) return limited;
  const body = await request.json().catch(() => null);
  const phone = typeof body?.query === "string" ? body.query.trim() : "";
  if (!/^01[0125][0-9]{8}$/.test(phone))
    return NextResponse.json(
      { error: "Enter the 11-digit mobile number used to register." },
      { status: 400 },
    );
  const phoneLimit = await checkRateLimit(
    request,
    "booking-lookup-phone",
    5,
    900,
    phone,
  );
  if (phoneLimit) return phoneLimit;
  try {
    const exists =
      process.env.MO_BISTRO_DB === "postgres"
        ? (
            await getPostgres()`SELECT 1 AS present FROM guests WHERE phone=${phone} AND status IN ('waiting','called') LIMIT 1`
          ).length > 0
        : Boolean(
            db
              .prepare(
                "SELECT 1 FROM guests WHERE phone=? AND status IN ('waiting','called') LIMIT 1",
              )
              .get(phone),
          );
    return NextResponse.json(
      { active: exists },
      {
        headers: {
          "Cache-Control": "no-store",
          "Referrer-Policy": "no-referrer",
        },
      },
    );
  } catch {
    return NextResponse.json(
      { error: "Unable to check registration right now." },
      { status: 503 },
    );
  }
}
