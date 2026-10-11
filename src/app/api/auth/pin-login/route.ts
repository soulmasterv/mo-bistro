import "server-only";

import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { checkRateLimit } from "@/lib/api-rate-limit";
import { getPostgres } from "@/lib/postgres-db";
import { verifyCredential, setSessionCookie } from "@/lib/staff-auth-utils";
import { createSessionPostgres } from "@/lib/staff-auth-postgres";

export const runtime = "nodejs";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;

function fail(message: string, status: number) {
  return NextResponse.json(
    { error: message },
    {
      status,
      headers: { "Cache-Control": "no-store" },
    }
  );
}

export async function POST(request: Request) {
  const limited = await checkRateLimit(
    request,
    "staff-pin-login",
    10,
    900
  );

  if (limited) return limited;

  const origin = request.headers.get("origin");
  const host = request.headers.get("host");

  if (origin) {
    try {
      if (!host || new URL(origin).host !== host) {
        return fail("Invalid origin", 403);
      }
    } catch {
      return fail("Invalid origin", 403);
    }
  }

  if (process.env.MO_BISTRO_DB !== "postgres") {
    return fail("PIN login is not configured for this database.", 503);
  }

  const body = await request.json().catch(() => null);
  const username = body?.username;
  const pin = body?.pin;

  if (
    typeof username !== "string" ||
    username.trim().length < 1 ||
    username.length > 32 ||
    typeof pin !== "string" ||
    !/^\d{6}$/.test(pin)
  ) {
    return fail("Invalid login details.", 400);
  }

  try {
    const sql = getPostgres();
    const normalized = username.trim().toLowerCase();

    // Share the same account lockout as password login.
    const key = createHash("sha256")
      .update(normalized)
      .digest("hex");

    const now = Date.now();


    // staff-pin-login-lock-v1
    const outcome = await sql.begin(async tx => {
      await tx`
        SELECT pg_advisory_xact_lock(
          hashtext(${`staff-pin:${key}`})::bigint
        )
      `;

      const attempts = await tx<{
        failures: number;
        locked_until: number;
        updated_at: number;
      }[]>`
        SELECT failures, locked_until, updated_at
        FROM staff_login_attempts
        WHERE username_hash = ${key}
      `;

      const attempt = attempts[0];

      if (attempt && Number(attempt.locked_until) > now) {
        return {
          ok: false as const,
          message: "Too many login attempts. Try again in 15 minutes.",
          status: 429,
        };
      }

      const users = await tx<{
        id: number;
        username: string;
        role: string;
        pin_hash: string | null;
      }[]>`
        SELECT id, username, role, pin_hash
        FROM staff_users
        WHERE LOWER(username) = ${normalized}
          AND active = 1
        LIMIT 1
      `;

      const user = users[0];

      const valid = Boolean(
        user?.pin_hash &&
        verifyCredential(pin, user.pin_hash)
      );

      if (!valid) {
        const result = await tx<{
          locked_until: number;
        }[]>`
          INSERT INTO staff_login_attempts
            (username_hash, failures, locked_until, updated_at)
          VALUES (${key}, 1, 0, ${now})
          ON CONFLICT (username_hash) DO UPDATE SET
            failures = CASE
              WHEN staff_login_attempts.updated_at < ${now - WINDOW_MS}
                THEN 1
              ELSE staff_login_attempts.failures + 1
            END,
            updated_at = ${now},
            locked_until = CASE
              WHEN staff_login_attempts.locked_until > ${now}
                THEN staff_login_attempts.locked_until
              WHEN staff_login_attempts.updated_at < ${now - WINDOW_MS}
                THEN 0
              WHEN staff_login_attempts.failures + 1 >= ${MAX_FAILURES}
                THEN ${now + WINDOW_MS}
              ELSE 0
            END
          RETURNING locked_until
        `;

        const locked = Number(result[0].locked_until) > now;

        return {
          ok: false as const,
          message: locked
            ? "Too many login attempts. Try again in 15 minutes."
            : "Incorrect username or PIN.",
          status: locked ? 429 : 401,
        };
      }

      await tx`
        DELETE FROM staff_login_attempts
        WHERE username_hash = ${key}
      `;

      return {
        ok: true as const,
        user,
      };
    });

    if (!outcome.ok) {
      return fail(outcome.message, outcome.status);
    }

    const session = await createSessionPostgres(outcome.user.id);

    await setSessionCookie(session.token, session.expiresAt);

    return NextResponse.json(
      {
        success: true,
        username: outcome.user.username,
        role: outcome.user.role,
      },
      {
        headers: { "Cache-Control": "no-store" },
      }
    );
  } catch (error) {
    console.error("PIN login error:", error);

    return fail("Unable to log in.", 500);
  }
}
