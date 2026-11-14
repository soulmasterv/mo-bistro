import { getPostgres } from "@/lib/postgres-db";
import { getSetting } from "@/lib/staff-auth";
import db from "@/lib/db";
export async function GET() {
  const headers = { "Cache-Control": "no-store" };
  try {
    const state = process.env.MO_BISTRO_DB === "postgres"
      ? (await getPostgres()`SELECT
          (SELECT value FROM restaurant_settings WHERE key='public_waitlist_paused') AS paused,
          COALESCE((SELECT value FROM restaurant_settings WHERE key='queue_capacity'), '50') AS capacity,
          (SELECT COUNT(*)::integer FROM guests WHERE status IN ('waiting','called')) AS active`)[0]
      : db.transaction(() => ({
          paused: getSetting("public_waitlist_paused", "false"),
          capacity: getSetting("queue_capacity", "50"),
          active: (db.prepare("SELECT COUNT(*) AS count FROM guests WHERE status IN ('waiting','called')").get() as { count: number }).count,
        }))();
    const capacity = Number(state.capacity);
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 500) throw Error("Invalid capacity");
    return Response.json({ paused: state.paused === "true", full: Number(state.active) >= capacity }, { headers });
  } catch { return Response.json({ error: "Waitlist availability unavailable" }, { status: 503, headers }); }
}
