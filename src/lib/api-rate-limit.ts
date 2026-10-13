import "server-only";
import { createHmac } from "node:crypto";
import { getPostgres } from "@/lib/postgres-db";
import { NextResponse } from "next/server";

export async function checkRateLimit(
  request: Request,
  endpoint: string,
  maxRequests: number,
  windowSeconds: number,
  subject?: string
) {
  if (process.env.MO_BISTRO_DB !== "postgres") return null;

  const secret = process.env.STAFF_SESSION_SECRET;
  if (!secret || secret.length < 32) {
    return NextResponse.json(
      { error: "Service unavailable." },
      { status: 503 }
    );
  }

  // Vercel supplies this header at its trusted edge.
  const ip = request.headers.get("x-vercel-forwarded-for");

  if (!ip) {
    return NextResponse.json(
      { error: "Unable to verify request origin." },
      { status: 503 }
    );
  }

  const key = createHmac("sha256", secret)
    .update(`${endpoint}:${subject ?? ip}`)
    .digest("hex");

  const now = Date.now();
  const expires = now + windowSeconds * 1000;

  const sql = getPostgres();

  const rows = await sql<{ request_count: number }[]>`
    INSERT INTO api_rate_limits
      (key_hash, request_count, window_start, expires_at)
    VALUES (${key}, 1, ${now}, ${expires})
    ON CONFLICT (key_hash) DO UPDATE SET
      request_count = CASE
        WHEN api_rate_limits.expires_at <= ${now} THEN 1
        ELSE api_rate_limits.request_count + 1
      END,
      window_start = CASE
        WHEN api_rate_limits.expires_at <= ${now} THEN ${now}
        ELSE api_rate_limits.window_start
      END,
      expires_at = CASE
        WHEN api_rate_limits.expires_at <= ${now} THEN ${expires}
        ELSE api_rate_limits.expires_at
      END
    RETURNING request_count
  `;

  if (Number(rows[0].request_count) > maxRequests) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      {
        status: 429,
        headers: {
          "Cache-Control": "no-store",
          "Retry-After": String(windowSeconds),
        },
      }
    );
  }

  return null;
}
