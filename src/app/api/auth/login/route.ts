import { loginPostgres } from "@/lib/login-postgres";
import { NextResponse } from "next/server";
import db from "@/lib/db";
import {
  initStaff,
  verifyCredential,
  createSession,
  setSessionCookie,
  type StaffRole,
} from "@/lib/staff-auth";
import { createHash } from "node:crypto";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;

function response(error: string, status: number) {
  return NextResponse.json(
    { error },
    {
      status,
      headers: { "Cache-Control": "no-store" },
    }
  );
}

export async function POST(request: Request) {
  if (process.env.MO_BISTRO_DB === "postgres") {
    return loginPostgres(request);
  }
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

    initStaff();

    db.exec(`
      CREATE TABLE IF NOT EXISTS staff_login_attempts (
        username_hash TEXT PRIMARY KEY,
        failures INTEGER NOT NULL DEFAULT 0,
        locked_until INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL
      )
    `);

    const normalized = username.trim().toLowerCase();
    const key = createHash("sha256")
      .update(normalized)
      .digest("hex");

    const now = Date.now();

    const attempt = db.prepare(`
      SELECT failures, locked_until, updated_at
      FROM staff_login_attempts
      WHERE username_hash=?
    `).get(key) as {
      failures: number;
      locked_until: number;
      updated_at: number;
    } | undefined;

    if (attempt && attempt.locked_until > now) {
      return response(
        "Too many login attempts. Try again in 15 minutes.",
        429
      );
    }

    const user = db.prepare(`
      SELECT id, username, role, credential_hash
      FROM staff_users
      WHERE username=? AND active=1
    `).get(username.trim()) as {
      id: number;
      username: string;
      role: StaffRole;
      credential_hash: string;
    } | undefined;

    const valid = user
      ? verifyCredential(credential, user.credential_hash)
      : false;

    if (!user || !valid) {
      const failures =
        attempt && now - attempt.updated_at < WINDOW_MS
          ? attempt.failures + 1
          : 1;

      const lockedUntil =
        failures >= MAX_FAILURES ? now + WINDOW_MS : 0;

      db.prepare(`
        INSERT INTO staff_login_attempts
          (username_hash, failures, locked_until, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(username_hash) DO UPDATE SET
          failures=excluded.failures,
          locked_until=excluded.locked_until,
          updated_at=excluded.updated_at
      `).run(key, failures, lockedUntil, now);

      return response(
        failures >= MAX_FAILURES
          ? "Too many login attempts. Try again in 15 minutes."
          : "Incorrect username or credentials.",
        failures >= MAX_FAILURES ? 429 : 401
      );
    }

    db.prepare(`
      DELETE FROM staff_login_attempts
      WHERE username_hash=?
    `).run(key);

    const session = createSession(user.id);
    await setSessionCookie(session.token, session.expiresAt);

    return NextResponse.json({
      success: true,
      role: user.role,
      username: user.username,
    }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("Login error:", error);
    return response("Unable to log in.", 500);
  }
}
