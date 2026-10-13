import "server-only";

import { getPostgres } from "@/lib/postgres-db";
import {
  COOKIE_NAME,
  type StaffSession,
} from "@/lib/staff-session-shared";
import {
  createHmac,
  randomBytes,
} from "node:crypto";
import { cookies } from "next/headers";

function hashSession(token: string) {
  const secret = process.env.STAFF_SESSION_SECRET;

  if (!secret || secret.length < 32) {
    throw new Error("STAFF_SESSION_SECRET is missing");
  }

  return createHmac("sha256", secret)
    .update(token)
    .digest("hex");
}

export async function initStaffPostgres() {
  const sql = getPostgres();

  const defaults = [
    ["qr_rotation_seconds", "300"],
    ["qr_required", "false"],
    ["approval_required", "true"],
    ["queue_capacity", "50"],
    ["restaurant_name", "The Restaurant"],
  ];

  for (const [key, value] of defaults) {
    if(key==="approval_required") {
      await sql`INSERT INTO restaurant_settings(key,value)
        VALUES ('approval_required',COALESCE((SELECT value FROM restaurant_settings WHERE key='require_confirmation'),'true'))
        ON CONFLICT(key) DO NOTHING`;
      continue;
    }
    await sql`
      INSERT INTO restaurant_settings (key, value)
      VALUES (${key}, ${value})
      ON CONFLICT (key) DO NOTHING
    `;
  }
}

export async function createSessionPostgres(staffId: number) {
  const sql = getPostgres();

  const token = randomBytes(32).toString("hex");
  const expiresAt = Date.now() + 12 * 60 * 60 * 1000;

  await sql`
    INSERT INTO staff_sessions (id_hash, staff_id, expires_at)
    VALUES (${hashSession(token)}, ${staffId}, ${expiresAt})
  `;

  return { token, expiresAt };
}

export async function currentStaffPostgres(): Promise<StaffSession | null> {
  const token = (await cookies()).get(COOKIE_NAME)?.value;

  if (!token || !/^[a-f0-9]{64}$/.test(token)) {
    return null;
  }

  const sql = getPostgres();

  const rows = await sql<StaffSession[]>`
    SELECT u.id, u.username, u.role
    FROM staff_sessions s
    JOIN staff_users u ON u.id = s.staff_id
    WHERE s.id_hash = ${hashSession(token)}
      AND s.expires_at > ${Date.now()}
      AND u.active = 1
    LIMIT 1
  `;

  return rows[0] ?? null;
}

export async function clearSessionPostgres() {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;

  if (token && /^[a-f0-9]{64}$/.test(token)) {
    const sql = getPostgres();

    await sql`
      DELETE FROM staff_sessions
      WHERE id_hash = ${hashSession(token)}
    `;
  }

  jar.delete(COOKIE_NAME);
}

export async function getSettingPostgres(
  key: string,
  fallback = ""
): Promise<string> {
  const sql = getPostgres();

  const rows = await sql<{ value: string }[]>`
    SELECT value
    FROM restaurant_settings
    WHERE key = ${key}
    LIMIT 1
  `;

  return rows[0]?.value ?? fallback;
}
