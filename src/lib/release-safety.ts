import "server-only";
import postgres from "postgres";
import { createHmac } from "node:crypto";

type Environment = Record<string, string | undefined>;
export const RELEASE_SAFETY_ENDPOINT = "ep-still-wind-b4036sdr";
const DATABASE = "mo_bistro_2";

// Diagnostic-only operator attestation. No default: a role existing in Neon is
// not evidence that it is approved for either deployed application.
function approvedRole(env: Environment) {
  const role = env.RELEASE_SAFETY_EXPECTED_DB_ROLE;
  return role && /^[a-z][a-z0-9_]{0,62}$/.test(role) &&
    !/^(?:postgres|neondb_owner|neon_superuser|pg_.*)$/.test(role) ? role : null;
}

// Accept only one endpoint. Never pass URL query options or PG* overrides to a client.
export function approvedReleaseTarget(env: Environment) {
  if (env.VERCEL_ENV !== "preview" || env.MO_BISTRO_DB !== "postgres") return null;
  const role = approvedRole(env);
  if (!role) return null;
  try {
    const raw = env.MO_BISTRO_POSTGRES_URL;
    if (!raw || raw.trim() !== raw || /[\s\\]/.test(raw)) return null;
    const url = new URL(raw);
    if (!["postgres:", "postgresql:"].includes(url.protocol) || url.hash ||
        !/^ep-still-wind-b4036sdr(?:-pooler)?\.(?:c-[0-9]+\.)?[a-z0-9-]+\.(?:aws|azure|gcp)\.neon\.tech$/.test(url.hostname) ||
        (url.port && url.port !== "5432") || url.pathname !== "/" + DATABASE ||
        !url.username || !url.password || decodeURIComponent(url.username) !== role) return null;
    for (const [key, value] of url.searchParams) {
      if (!(key === "sslmode" && ["require", "verify-full"].includes(value)) &&
          !(key === "channel_binding" && value === "require")) return null;
      if (url.searchParams.getAll(key).length !== 1) return null;
    }
    return { host: url.hostname, database: DATABASE, port: 5432,
      username: decodeURIComponent(url.username), password: decodeURIComponent(url.password) };
  } catch { return null; }
}

export function releaseMessagingPolicy(env: Environment) {
  const normal = env.WHATSAPP_ENABLED === "true" && env.MO_BISTRO_DB === "postgres" &&
    env.WHATSAPP_MODE === "live" && env.WHATSAPP_ALLOW_LIVE_SEND === "true";
  // This separate path deliberately bypasses the normal live-send guard.
  const manual = env.VERCEL_ENV === "preview" && env.MO_BISTRO_DB === "postgres" &&
    env.WHATSAPP_MODE === "test" && env.WHATSAPP_PREVIEW_TEST_ENABLED === "true" &&
    env.WHATSAPP_ALLOW_LIVE_SEND !== "true";
  return { normal_sending_allowed: normal, manual_preview_test_sending_allowed: manual,
    window_sending_allowed: normal && env.WHATSAPP_WINDOW_TEXT_ENABLED === "true",
    pending_job_delivery_live_allowed: normal,
    all_reviewed_sending_paths_disabled: !normal && !manual };
}

export async function inspectReleaseSafety(target: NonNullable<ReturnType<typeof approvedReleaseTarget>>,
  token: string, env: Environment) {
  const secret = env.STAFF_SESSION_SECRET;
  if (!secret || secret.length < 32) return null;
  const idHash = createHmac("sha256", secret).update(token).digest("hex");
  // A dedicated connection avoids a previously initialized application pool.
  // Explicit host/port/database/credentials prevent ambient PG* variables redirecting it.
  const sql = postgres({ ...target, ssl: "verify-full", max: 1, prepare: false,
    fetch_types: false, connect_timeout: 3, idle_timeout: 1, max_lifetime: 10,
    onnotice: () => {}, debug: false,
    connection: { application_name: "mo-bistro-release-safety" } });
  let deadline: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      sql.begin("read only", async tx => {
        // Transaction-local limits also work through poolers that restrict startup parameters.
        await tx`SET LOCAL statement_timeout = '2s'`;
        await tx`SET LOCAL lock_timeout = '500ms'`;
        await tx`SET LOCAL idle_in_transaction_session_timeout = '3s'`;
        const managers = await tx`SELECT u.id FROM public.staff_sessions s
          JOIN public.staff_users u ON u.id=s.staff_id
          WHERE s.id_hash=${idHash} AND s.expires_at>${Date.now()}
            AND u.active=1 AND u.role='manager' LIMIT 1`;
        if (managers.length !== 1) return null;
        const [identity] = await tx`SELECT current_database() AS database, current_schema() AS schema,
          current_user AS current_role, session_user AS session_role,
          current_setting('transaction_read_only') AS read_only,
          r.rolsuper, r.rolcreatedb, r.rolcreaterole, r.rolreplication, r.rolbypassrls,
          EXISTS (SELECT 1 FROM pg_catalog.pg_roles elevated
            WHERE (elevated.rolsuper OR elevated.rolcreatedb OR elevated.rolcreaterole OR
              elevated.rolreplication OR elevated.rolbypassrls OR elevated.rolname='neon_superuser')
              AND pg_catalog.pg_has_role(current_user, elevated.oid, 'MEMBER')) AS elevated_membership
          FROM pg_catalog.pg_roles r WHERE r.rolname=current_user`;
        if (identity?.database !== DATABASE || identity?.schema !== "public" || identity?.read_only !== "on" ||
            identity?.current_role !== target.username || identity?.session_role !== target.username ||
            target.username !== approvedRole(env) ||
            [identity.rolsuper, identity.rolcreatedb, identity.rolcreaterole,
              identity.rolreplication, identity.rolbypassrls, identity.elevated_membership].some(value => value !== false))
          throw new Error("Identity mismatch");
        return {
          database: { endpoint: RELEASE_SAFETY_ENDPOINT, database: DATABASE, schema: "public", matches_expected: true,
            configured_role_matches_policy: true, current_user_matches_configured_role: true,
            session_user_matches_configured_role: true, direct_role_admin_flags_disabled: true,
            elevated_role_membership_disabled: true },
          deployment: {
            commit: /^[a-f0-9]{40}$/.test(env.VERCEL_GIT_COMMIT_SHA ?? "") ? env.VERCEL_GIT_COMMIT_SHA : null,
            id: /^dpl_[a-zA-Z0-9]+$/.test(env.VERCEL_DEPLOYMENT_ID ?? "") ? env.VERCEL_DEPLOYMENT_ID : null,
          },
          messaging: releaseMessagingPolicy(env),
        };
      }),
      new Promise<never>((_, reject) => { deadline = setTimeout(() => reject(new Error("Timeout")), 8000); }),
    ]);
  } finally {
    clearTimeout(deadline);
    await sql.end({ timeout: 0 });
  }
}
