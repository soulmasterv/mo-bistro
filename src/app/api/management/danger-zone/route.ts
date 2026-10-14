import { randomUUID } from "node:crypto";
import { currentStaff } from "@/lib/staff-auth";
import { requireActiveLicense } from "@/lib/licensing/enforce";
import { rejectCrossOrigin } from "@/lib/guest-api-security";
import { getPostgres } from "@/lib/postgres-db";
import { recordBulkActivity, setActivityActor } from "@/lib/staff-activity";

export const runtime = "nodejs";
const headers = { "Cache-Control": "no-store" };
export async function POST(request: Request) {
  const staff = await currentStaff();
  if (!staff) return Response.json({ error: "Sign in required" }, { status: 401, headers });
  if (staff.role !== "manager") return Response.json({ error: "Manager access required" }, { status: 403, headers });
  const origin = rejectCrossOrigin(request);
  if (origin) return origin;
  const license = await requireActiveLicense();
  if (license) return license;
  const body = await request.json().catch(() => null);
  if (!body || Object.keys(body).length !== 2 || body.confirm !== true ||
      !["free_tables", "cancel_queue"].includes(body.action)) {
    return Response.json({ error: "Choose an action and explicitly confirm it" }, { status: 400, headers });
  }
  if (process.env.MO_BISTRO_DB !== "postgres") {
    return Response.json({ error: "Bulk reset requires PostgreSQL" }, { status: 503, headers });
  }
  try {
    const result = await getPostgres().begin(async tx => {
      // Same locks as seating/mode changes and public/staff registrations.
      await tx`SELECT pg_advisory_xact_lock(741122)`;
      await tx`SELECT pg_advisory_xact_lock(91401283)`;
      await setActivityActor(tx, staff.id);
      await recordBulkActivity(tx, staff.id, body.action === "free_tables" ? "free_all_tables" : "cancel_queue");
      if (body.action === "cancel_queue") {
        const cancelled = await tx`UPDATE guests SET status='cancelled',updated_at=CURRENT_TIMESTAMP
          WHERE status IN ('waiting','called') RETURNING id`;
        const [schema] = await tx`SELECT to_regclass('public.whatsapp_notifications') IS NOT NULL AS available`;
        if (schema?.available && cancelled.length) {
          const ids = cancelled.map(row => Number(row.id));
          await tx`UPDATE whatsapp_notifications SET status='skipped',revision=revision+1,
            last_error='management_queue_cancelled',publish_lease_until=NULL,updated_at=NOW()
            WHERE guest_id=ANY(${ids}::integer[]) AND status IN ('pending','scheduled')`;
        }
        return { cancelled: cancelled.length };
      }
      const [schema] = await tx`SELECT
        to_regclass('public.simple_table_capacity') IS NOT NULL AS simple_capacity,
        to_regclass('public.simple_table_events') IS NOT NULL AS simple_events,
        to_regclass('public.table_ready_requests') IS NOT NULL AS ready_requests`;
      if (schema?.simple_capacity !== schema?.simple_events) throw Error("Incomplete Simple Mode schema");
      let anonymous = 0;
      if (schema?.simple_capacity) {
        const pools = await tx`SELECT area,occupied_tables FROM simple_table_capacity WHERE occupied_tables>0 FOR UPDATE`;
        const operation = randomUUID();
        for (const pool of pools) {
          anonymous += Number(pool.occupied_tables);
          await tx`INSERT INTO simple_table_events(operation_id,area,kind,actor_id)
            SELECT ${operation} || ':' || ${pool.area} || ':' || n,${pool.area},'released',${staff.id}
            FROM generate_series(1,${Number(pool.occupied_tables)}::integer) AS n`;
        }
        await tx`UPDATE simple_table_capacity SET occupied_tables=0 WHERE occupied_tables>0`;
      }
      await tx`UPDATE seating_history SET released_at=CURRENT_TIMESTAMP WHERE released_at IS NULL`;
      await tx`UPDATE guests SET table_id=NULL,updated_at=CURRENT_TIMESTAMP WHERE status='seated' AND table_id IS NOT NULL`;
      const named = await tx`UPDATE restaurant_tables SET status='free',updated_at=CURRENT_TIMESTAMP
        WHERE status='occupied' RETURNING id`;
      if (schema?.ready_requests) {
        await tx`UPDATE table_ready_requests SET status='cancelled',reviewed_by=${staff.id},reviewed_at=NOW() WHERE status='pending'`;
      }
      return { freed: named.length + anonymous };
    });
    // No provider call or outbox dispatch is performed by this endpoint.
    return Response.json({ success: true, ...result }, { headers });
  } catch {
    return Response.json({ error: "Reset failed. No partial reset was committed. Check database availability and schema." }, { status: 503, headers });
  }
}
