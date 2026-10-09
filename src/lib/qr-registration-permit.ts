import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { getPostgres } from "@/lib/postgres-db";
import { getCurrentQR, verifyQR } from "@/lib/rotating-qr";

const COOKIE = "mo_bistro_qr_permit";
const GRACE_MS = 3 * 60 * 1000;

function hash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function issueQRPermit(code: unknown) {
  if (!(await verifyQR(code))) return false;

  const qr = await getCurrentQR();

  // Reject a QR that rotated during verification.
  if (typeof code !== "string" || code !== qr.code) {
    return false;
  }

  // Reuse a valid permit for this exact QR instead of replacing it.
  const existing = await getQRPermit(code);
  if (existing) return true;

  const token = randomBytes(32).toString("hex");
  const expiresAt = qr.expiresAt + GRACE_MS;

  const sql = getPostgres();

  await sql`
    INSERT INTO qr_registration_permits
      (token_hash, qr_code_hash, qr_expires_at, expires_at)
    VALUES (${hash(token)}, ${hash(code)}, ${qr.expiresAt}, ${expiresAt})
  `;

  const cookieStore = await cookies();

  cookieStore.set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: new Date(expiresAt),
  });

  return true;
}

export async function getQRPermit(code?: string) {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE)?.value;

  if (!token || !/^[a-f0-9]{64}$/.test(token)) {
    return null;
  }

  const sql = getPostgres();
  const rows = await sql<{
    id: number;
    expires_at: number;
  }[]>`
    SELECT id, expires_at
    FROM qr_registration_permits
    WHERE token_hash = ${hash(token)}
      AND used_at IS NULL
      AND expires_at > ${Date.now()}
      AND (
        ${code ?? null}::text IS NULL
        OR qr_code_hash = ${code ? hash(code) : null}
      )
    LIMIT 1
  `;

  return rows[0] ?? null;
}

export async function clearQRPermit() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE);
}
