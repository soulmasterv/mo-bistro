import "server-only";
import postgres from "postgres";
import { createHash, timingSafeEqual } from "node:crypto";

let client: ReturnType<typeof postgres> | undefined;
let adminClient: ReturnType<typeof postgres> | undefined;
const licenseReadUrl = () => process.env.MO_BISTRO_DB === "postgres"
  ? process.env.MO_BISTRO_POSTGRES_URL : process.env.MO_BISTRO_POSTGRES_URL || process.env.DATABASE_URL;

export function licenseTargetsMatch() {
  try {
    const read = new URL(licenseReadUrl() || "");
    const write = new URL(process.env.LICENSE_ADMIN_DATABASE_URL || "");
    const target = (url: URL) => {
      if (!["postgres:","postgresql:"].includes(url.protocol) || url.pathname.length < 2) throw Error("Invalid database target");
      if (["host","hostaddr","port","database","dbname","options","service"].some(key=>url.searchParams.has(key))) throw Error("Ambiguous database routing");
      const host = url.hostname.endsWith(".neon.tech") ? url.hostname.replace(/-pooler(?=\.)/, "") : url.hostname;
      return `${host}:${url.port || "5432"}/${decodeURIComponent(url.pathname.slice(1))}`;
    };
    return target(read) === target(write);
  } catch { return false; }
}

type LicenseVersionRow = { status?: string; raw_status?: string; plan?: string | null; expires_at?: Date | string | null;
  suspension_due_at?: Date | string | null; license_revision?: string | number | null };
export function licenseVersion(row?: LicenseVersionRow) {
  const canonical = { status: row?.raw_status ?? (["expired", "grace"].includes(row?.status ?? "") ? "active" : row?.status ?? "unconfigured"),
    plan: row?.plan ?? null, expires_at: row?.expires_at ? new Date(row.expires_at).toISOString() : null,
    suspension_due_at: row?.suspension_due_at ? new Date(row.suspension_due_at).toISOString() : null,
    license_revision: String(row?.license_revision ?? 0) };
  return `"license-${createHash("sha256").update(JSON.stringify(canonical)).digest("hex")}"`;
}

export function licenseDb() {
  const url = licenseReadUrl();

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
  if (!licenseTargetsMatch()) throw new Error("License read/write database targets do not match");

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
    SELECT status, plan, expires_at, NOW() AS server_now,
      to_jsonb(l)->>'suspension_due_at' AS suspension_due_at,
      to_jsonb(l)->>'license_revision' AS license_revision
    FROM public.restaurant_license l
    WHERE id = 1
  `;

  if (!rows.length) {
    return {
      licensed: false,
      status: "unconfigured",
      plan: null,
      expires_at: null,
      suspension_due_at: null,
      license_revision: "0",
      server_now: new Date().toISOString(),
    };
  }

  const row = rows[0];

  const now = new Date(row.server_now).getTime();
  const due = row.suspension_due_at ? new Date(row.suspension_due_at).getTime() : null;
  // An owner-issued grace period explicitly allows operations until this one
  // database deadline. No client clock, browser acknowledgement or cron controls access.
  const status = row.status === "suspended" ? "suspended"
    : due !== null ? (due > now ? "grace" : "suspended")
    : new Date(row.expires_at).getTime() > now ? "active" : "expired";

  return {
    licensed: status === "active" || status === "grace",
    status,
    raw_status: row.status,
    plan: row.plan,
    expires_at: row.expires_at,
    suspension_due_at: row.suspension_due_at,
    license_revision: row.license_revision ?? "0",
    server_now: row.server_now,
  };
}
