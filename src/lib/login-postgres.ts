import { rejectCrossOrigin } from "@/lib/guest-api-security";
import { checkRateLimit } from "@/lib/api-rate-limit";
import "server-only";

import { createHash } from "node:crypto";
import { getPostgres } from "@/lib/postgres-db";
import {
  verifyCredential,
  setSessionCookie,
} from "@/lib/staff-auth-utils";
import type { StaffRole } from "@/lib/staff-session-shared";
import { createSessionPostgres } from "@/lib/staff-auth-postgres";
import { NextResponse } from "next/server";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;

function response(error: string, status: number) {
  return NextResponse.json(
    { error },
    { status, headers: { "Cache-Control": "no-store" } }
  );
}

export async function loginPostgres(request: Request) {
  const limited = await checkRateLimit(
    request, "staff-login", 10, 900
  );
  if (limited) return limited;

  try {
    const originError=rejectCrossOrigin(request);
    if(originError) return originError;

    const body = await request.json().catch(() => null);
    const username = body?.username;
    const credential = body?.credential;

    if (
      typeof username !== "string" ||
      typeof credential !== "string" ||
      username.trim().length === 0 ||
      username.length > 32 ||
      credential.length === 0 ||
      credential.length > 256
    ) {
      return response("Invalid login details.", 400);
    }

    const sql = getPostgres();
    const normalized = username.trim().toLowerCase();
    const key = createHash("sha256")
      .update(normalized)
      .digest("hex");

    const now = Date.now();


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
          status: 429,
          message: "Too many login attempts. Try again in 15 minutes.",
        };
      }

      const users = await tx<{
        id: number;
        username: string;
        role: StaffRole;
        credential_hash: string;
      }[]>`
        SELECT id, username, role, credential_hash
        FROM staff_users
        WHERE LOWER(username) = ${normalized}
          AND active = 1
        LIMIT 1
      `;

      const user = users[0];

      const valid = user
        ? verifyCredential(credential, user.credential_hash)
        : false;

      if (!user || !valid) {
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
          status: locked ? 429 : 401,
          message: locked
            ? "Too many login attempts. Try again in 15 minutes."
            : "Incorrect username or credentials.",
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
      return response(outcome.message, outcome.status);
    }

    const session = await createSessionPostgres(outcome.user.id);
    await setSessionCookie(session.token, session.expiresAt);

    return NextResponse.json(
      {
        success: true,
        role: outcome.user.role,
        username: outcome.user.username,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("PostgreSQL login error:", error);
    return response("Unable to log in.", 500);
  }
}
