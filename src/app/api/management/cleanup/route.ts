import { currentStaff } from "@/lib/staff-auth";
import { rejectCrossOrigin } from "@/lib/guest-api-security";
import { getPostgres } from "@/lib/postgres-db";
import { cleanupAvailable, CLEANUP_ENABLED_KEY, CLEANUP_RESULT_KEY } from "@/lib/database-cleanup";

export const runtime = "nodejs";
const headers = { "Cache-Control": "no-store" };
async function authorize() {
  const staff = await currentStaff();
  if (!staff) return Response.json({ error: "Sign in required" }, { status: 401, headers });
  if (staff.role !== "manager") return Response.json({ error: "Manager access required" }, { status: 403, headers });
  return null;
}
export async function GET() {
  const denied = await authorize();
  if (denied) return denied;
  if (!cleanupAvailable()) return Response.json({ available: false }, { headers });
  try {
    const rows = await getPostgres()`SELECT key,value FROM public.restaurant_settings
      WHERE key IN (${CLEANUP_ENABLED_KEY},${CLEANUP_RESULT_KEY})`;
    const settings = Object.fromEntries(rows.map(row => [row.key, row.value]));
    return Response.json({ available: true, enabled: settings[CLEANUP_ENABLED_KEY] === "true",
      schedulerConfigured: (process.env.DATABASE_CLEANUP_SECRET?.length ?? 0) >= 32,
      lastResult: settings[CLEANUP_RESULT_KEY] ? JSON.parse(settings[CLEANUP_RESULT_KEY]) : null }, { headers });
  } catch { return Response.json({ error: "Cleanup settings unavailable" }, { status: 503, headers }); }
}
export async function PATCH(request: Request) {
  const denied = await authorize();
  if (denied) return denied;
  const origin = rejectCrossOrigin(request);
  if (origin) return origin;
  if (!cleanupAvailable()) return Response.json({ error: "Preview PostgreSQL only" }, { status: 403, headers });
  const body = await request.json().catch(() => null);
  if (!body || Object.keys(body).length !== 2 || typeof body.enabled !== "boolean" || body.confirm !== true)
    return Response.json({ error: "Explicit confirmation required" }, { status: 400, headers });
  if (body.enabled && (process.env.DATABASE_CLEANUP_SECRET?.length ?? 0) < 32)
    return Response.json({ error: "Configure the private cleanup scheduler first" }, { status: 409, headers });
  try {
    await getPostgres().begin(async tx => {
      const [identity] = await tx`SELECT current_database() AS name`;
      if (identity?.name !== "mo_bistro_2") throw new Error("Unexpected database");
      await tx`INSERT INTO public.restaurant_settings(key,value)
        VALUES (${CLEANUP_ENABLED_KEY},${String(body.enabled)})
        ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value`;
    });
    return Response.json({ enabled: body.enabled }, { headers });
  } catch { return Response.json({ error: "Could not save cleanup settings" }, { status: 503, headers }); }
}
