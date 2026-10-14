import { getSettingPostgres } from "@/lib/staff-auth-postgres";
import { getSetting } from "@/lib/staff-auth";
export async function GET() {
  const headers = { "Cache-Control": "no-store" };
  try {
    const paused = process.env.MO_BISTRO_DB === "postgres"
      ? (await getSettingPostgres("public_waitlist_paused", "false")) === "true"
      : getSetting("public_waitlist_paused", "false") === "true";
    return Response.json({ paused }, { headers });
  } catch { return Response.json({ error: "Waitlist availability unavailable" }, { status: 503, headers }); }
}
