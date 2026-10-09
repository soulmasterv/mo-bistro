import "server-only";
import postgres from "postgres";
import { createHash, timingSafeEqual } from "node:crypto";

let client: ReturnType<typeof postgres> | undefined;
let adminClient: ReturnType<typeof postgres> | undefined;

export function licenseDb() {
  const url = process.env.MO_BISTRO_POSTGRES_URL || process.env.DATABASE_URL;

  if (!url) {
    throw new Error("DATABASE_URL is not configured");
  }

  client ??= postgres(url, {
    max: 3,
    connect_timeout: 10,
    ssl: "require",
  });

  return client;
}

export function licenseAdminDb() {
  const url = process.env.LICENSE_ADMIN_DATABASE_URL;

  if (!url) {
    throw new Error("LICENSE_ADMIN_DATABASE_URL is not configured");
  }

  adminClient ??= postgres(url, {
    max: 2,
    connect_timeout: 10,
    ssl: "require",
  });

  return adminClient;
}

export function authorizedOwner(request: Request) {
  const expected = process.env.LICENSE_ADMIN_KEY_SHA256;
  const authorization = request.headers.get("authorization") ?? "";

  if (
    !expected ||
    !/^[a-f0-9]{64}$/i.test(expected) ||
    !authorization.startsWith("Bearer ")
  ) {
    return false;
  }

  const token = authorization.slice(7);

  if (!/^[a-f0-9]{64}$/i.test(token)) {
    return false;
  }

  const actual = createHash("sha256").update(token).digest();
  const stored = Buffer.from(expected, "hex");

  return timingSafeEqual(actual, stored);
}

export async function licenseStatus() {
  const sql = licenseDb();

  const rows = await sql`
    SELECT status, plan, expires_at,
           expires_at > NOW() AS not_expired
    FROM restaurant_license
    WHERE id = 1
  `;

  if (!rows.length) {
    return {
      licensed: false,
      status: "unconfigured",
      plan: null,
      expires_at: null,
    };
  }

  const row = rows[0];

  const status =
    row.status === "suspended"
      ? "suspended"
      : row.not_expired
        ? "active"
        : "expired";

  return {
    licensed: status === "active",
    status,
    plan: row.plan,
    expires_at: row.expires_at,
  };
}
