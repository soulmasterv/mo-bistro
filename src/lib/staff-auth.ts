export { hashCredential, verifyCredential, setSessionCookie } from "@/lib/staff-auth-utils";
import { currentStaffPostgres } from "@/lib/staff-auth-postgres";
import "server-only";
import db from "@/lib/db";
import {
  createHmac,
  randomBytes,
} from "node:crypto";
import { cookies } from "next/headers";

import {
  COOKIE_NAME,
  type StaffSession,
} from "@/lib/staff-session-shared";

export {
  COOKIE_NAME,
  type StaffRole,
  type StaffSession,
} from "@/lib/staff-session-shared";

export function initStaff() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS staff_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE COLLATE NOCASE,
      role TEXT NOT NULL CHECK(role IN ('manager','reception')),
      credential_hash TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS restaurant_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS staff_sessions (
      id_hash TEXT PRIMARY KEY,
      staff_id INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      FOREIGN KEY(staff_id) REFERENCES staff_users(id)
    );

    CREATE TABLE IF NOT EXISTS booking_recovery_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      query_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
  `);

  db.prepare(`
    INSERT OR IGNORE INTO restaurant_settings(key,value)
    VALUES ('qr_rotation_seconds','300')
  `).run();

  db.prepare(`
    INSERT OR IGNORE INTO restaurant_settings(key,value)
    VALUES ('qr_required','false')
  `).run();

  db.prepare(`
    INSERT OR IGNORE INTO restaurant_settings(key,value)
    VALUES ('approval_required',COALESCE((SELECT value FROM restaurant_settings WHERE key='require_confirmation'),'true'))
  `).run();

  db.prepare(`
    INSERT OR IGNORE INTO restaurant_settings(key,value)
    VALUES ('queue_capacity','50')
  `).run();

  db.prepare(`
    INSERT OR IGNORE INTO restaurant_settings(key,value)
    VALUES ('restaurant_name','The Restaurant')
  `).run();
}





function hashSession(token: string) {
  const secret = process.env.STAFF_SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("STAFF_SESSION_SECRET is missing");
  }

  return createHmac("sha256", secret).update(token).digest("hex");
}

export function createSession(staffId: number) {
  initStaff();

  const token = randomBytes(32).toString("hex");
  const expiresAt = Date.now() + 12 * 60 * 60 * 1000;

  db.prepare(`
    INSERT INTO staff_sessions(id_hash,staff_id,expires_at)
    VALUES (?,?,?)
  `).run(hashSession(token), staffId, expiresAt);

  return { token, expiresAt };
}



export async function currentStaff(): Promise<StaffSession | null> {
  if (process.env.MO_BISTRO_DB === "postgres") {
    return currentStaffPostgres();
  }

  initStaff();

  const token = (await cookies()).get(COOKIE_NAME)?.value;

  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;

  const staff = db.prepare(`
    SELECT u.id,u.username,u.role
    FROM staff_sessions s
    JOIN staff_users u ON u.id=s.staff_id
    WHERE s.id_hash=?
      AND s.expires_at>?
      AND u.active=1
  `).get(hashSession(token), Date.now()) as StaffSession | undefined;

  return staff || null;
}

export async function clearSession() {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;

  if (token && /^[a-f0-9]{64}$/.test(token)) {
    db.prepare("DELETE FROM staff_sessions WHERE id_hash=?")
      .run(hashSession(token));
  }

  jar.delete(COOKIE_NAME);
}

export function getSetting(key: string, fallback = ""): string {
  initStaff();

  const row = db.prepare(
    "SELECT value FROM restaurant_settings WHERE key=?"
  ).get(key) as { value: string } | undefined;

  return row?.value ?? fallback;
}
