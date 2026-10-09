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
    const origin = request.headers.get("origin");
    const host = request.headers.get("host");

    if (origin) {
      let originHost: string;

      try {
        originHost = new URL(origin).host;
      } catch {
        return response("Invalid origin", 403);
      }

      if (!host || originHost !== host) {
        return response("Invalid origin", 403);
      }
    }

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

    const attempts = await sql<{
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
      return response(
        "Too many login attempts. Try again in 15 minutes.",
        429
      );
    }

    const users = await sql<{
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
      const result = await sql<{ failures: number; locked_until: number }[]>`
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
        RETURNING failures, locked_until
      `;

      const locked = Number(result[0].locked_until) > now;

      return response(
        locked
          ? "Too many login attempts. Try again in 15 minutes."
          : "Incorrect username or credentials.",
        locked ? 429 : 401
      );
    }

    await sql`
      DELETE FROM staff_login_attempts
      WHERE username_hash = ${key}
    `;

    const session = await createSessionPostgres(user.id);
    await setSessionCookie(session.token, session.expiresAt);

    return NextResponse.json(
      {
        success: true,
        role: user.role,
        username: user.username,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("PostgreSQL login error:", error);
    return response("Unable to log in.", 500);
  }
}
