import "server-only";
import type { TransactionSql } from "postgres";
// Transaction-local context only. Triggers never trust an actor supplied by the browser.
export async function setActivityActor(tx: TransactionSql, actorId?: number) {
  await tx`SELECT set_config('mo_bistro.actor_id',${actorId ? String(actorId) : ""},true)`;
}
export async function recordBulkActivity(tx: TransactionSql, actorId: number, event: "free_all_tables" | "cancel_queue") {
  const [schema] = await tx`SELECT to_regclass('public.staff_activity_events') IS NOT NULL AS activity`;
  if (schema?.activity) await tx`INSERT INTO public.staff_activity_events(actor_id,event) VALUES (${actorId},${event})`;
}
