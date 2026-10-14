import { WorkflowError } from "@/lib/workflow-error";
import "server-only";
import { randomUUID } from "node:crypto";
import { getPostgres } from "@/lib/postgres-db";
import type { TransactionSql } from "postgres";
import { whatsappEnabled } from "@/lib/whatsapp/policy";
import { scheduleReview } from "@/lib/whatsapp/service";
import { setActivityActor } from "@/lib/staff-activity";
export type Area = "indoor" | "outdoor";
export type SimpleCapacity = {
  area: Area;
  total_tables: number;
  occupied_tables: number;
  max_party_size: number;
  free_tables: number;
};
type Tx = TransactionSql<Record<string, never>>;

export async function listSimpleTables() {
  return getPostgres()<
    SimpleCapacity[]
  >`SELECT area,total_tables,occupied_tables,max_party_size,
    total_tables-occupied_tables AS free_tables FROM simple_table_capacity ORDER BY area`;
}
export async function requireSimpleInventory(tx: Tx) {
  const [mode] =
    await tx`SELECT value FROM seating_settings WHERE key='table_view_mode'`;
  if (mode?.value !== "simple")
    throw new WorkflowError("This action requires Simple Mode.");
  const named =
    await tx`SELECT id FROM restaurant_tables WHERE status='occupied' LIMIT 1`;
  if (named.length)
    throw new WorkflowError(
      "Named tables are occupied. Switch to Detailed Mode and reconcile them before using Simple Mode.",
    );
}
/** Caller holds the shared seating advisory lock. No named-table writes. */
export async function freeSimpleTableInTransaction(
  tx: Tx,
  area: Area,
  actorId: number,
  operationId: string,
) {
  await setActivityActor(tx, actorId);
  await requireSimpleInventory(tx);
  const [existing] =
    await tx`SELECT area,kind,actor_id FROM simple_table_events WHERE operation_id=${operationId}`;
  if (existing) {
    if (
      existing.area !== area ||
      existing.kind !== "released" ||
      existing.actor_id !== actorId
    )
      throw new WorkflowError(
        "This operation ID was already used for another action.",
      );
    return { success: true, area, repeated: true };
  }
  const changed =
    await tx`UPDATE simple_table_capacity SET occupied_tables=occupied_tables-1
    WHERE area=${area} AND occupied_tables>0 RETURNING area`;
  if (!changed.length)
    throw new WorkflowError("No occupied anonymous tables in this area.");
  await tx`INSERT INTO simple_table_events(operation_id,area,kind,actor_id)
    VALUES (${operationId},${area},'released',${actorId})`;
  return { success: true, area, repeated: false };
}
export async function freeSimpleTable(
  area: Area,
  actorId: number,
  operationId: string,
) {
  return getPostgres().begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(741122)`;
    return freeSimpleTableInTransaction(tx, area, actorId, operationId);
  });
}
export async function assignSimpleTable(
  guestId: number,
  area: Area,
  actorId: number,
) {
  return getPostgres().begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(741122)`;
    await setActivityActor(tx, actorId);
    await requireSimpleInventory(tx);
    const [guest] =
      await tx`SELECT id,status,party_size,seating_preference FROM guests WHERE id=${guestId} FOR UPDATE`;
    if (!guest || !["waiting", "called"].includes(guest.status))
      throw new WorkflowError("Only waiting guests can be seated.");
    const [pool] =
      await tx`SELECT total_tables,occupied_tables,max_party_size FROM simple_table_capacity WHERE area=${area} FOR UPDATE`;
    if (!pool || pool.occupied_tables >= pool.total_tables)
      throw new WorkflowError("No free table is available in this area. Availability may have changed; refresh and try another area, or check Simple Mode capacity in Management.");
    if (guest.party_size > pool.max_party_size)
      throw new WorkflowError(
        "This party exceeds the area's anonymous table capacity.",
      );
    const [setting] =
      await tx`SELECT value FROM seating_settings WHERE key='allow_area_override'`;
    if (
      (setting?.value ?? "true") !== "true" &&
      guest.seating_preference !== "any" &&
      guest.seating_preference !== area
    )
      throw new WorkflowError("Area does not match seating preference.");
    await tx`UPDATE simple_table_capacity SET occupied_tables=occupied_tables+1 WHERE area=${area}`;
    const [seated] = await tx`UPDATE guests SET status='seated',table_id=NULL,
      seated_at=COALESCE(seated_at,NOW()),updated_at=CURRENT_TIMESTAMP WHERE id=${guestId} RETURNING seated_at`;
    if (whatsappEnabled()) await scheduleReview(tx,guestId,new Date(seated.seated_at));
    await tx`INSERT INTO simple_table_events(operation_id,area,kind,actor_id,guest_id)
      VALUES (${randomUUID()},${area},'occupied',${actorId},${guestId})`;
    return { success: true, area, guest_id: guestId, inventory_mode: "simple" };
  });
}
