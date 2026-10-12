import "server-only";
import { getPostgres } from "@/lib/postgres-db";

export async function getAssignableTablesPostgres(guestId: number) {
  const sql = getPostgres();
  const [guest] = await sql`SELECT id,party_size,seating_preference FROM guests WHERE id=${guestId}`;
  if (!guest) return null;
  const [setting] = await sql`SELECT value FROM seating_settings WHERE key='allow_area_override'`;
  const allowOverride = (setting?.value ?? "true") === "true";
  const tables = await sql`
    SELECT t.id,t.name,t.seats,t.area,t.status FROM restaurant_tables t
    WHERE t.status='free' AND t.seats >= ${guest.party_size}
      AND NOT EXISTS (SELECT 1 FROM guests g WHERE g.table_id=t.id AND g.status='seated')
    ORDER BY CASE WHEN ${guest.seating_preference}='any' OR t.area=${guest.seating_preference}
      THEN 0 ELSE 1 END, t.seats ASC, t.id ASC
  `;
  return {
    guest,
    tables: tables.filter(t => allowOverride || guest.seating_preference === "any" || t.area === guest.seating_preference),
  };
}

export async function assignTablePostgres(guestId: number, tableId: number) {
  const sql = getPostgres();
  return sql.begin(async tx => {
    // Serialize all seating changes to avoid double assignments across requests.
    await tx`SELECT pg_advisory_xact_lock(741122)`;
    const [guest] = await tx`SELECT id,status,party_size,seating_preference,table_id FROM guests WHERE id=${guestId} FOR UPDATE`;
    if (!guest) throw new Error("Guest not found");
    if (!["waiting", "called"].includes(guest.status)) throw new Error("Only waiting guests can be seated");
    const [table] = await tx`SELECT id,seats,area,status FROM restaurant_tables WHERE id=${tableId} FOR UPDATE`;
    if (!table) throw new Error("Table not found");
    if (table.status !== "free") throw new Error("Table is occupied");
    if (table.seats < guest.party_size) throw new Error("Table is too small for this party");
    const [setting] = await tx`SELECT value FROM seating_settings WHERE key='allow_area_override'`;
    if ((setting?.value ?? "true") !== "true" && guest.seating_preference !== "any" && guest.seating_preference !== table.area) {
      throw new Error("Table does not match seating preference");
    }
    const occupied = await tx`SELECT id FROM guests WHERE table_id=${tableId} AND status='seated' LIMIT 1`;
    if (occupied.length) throw new Error("Table is already assigned");
    await tx`UPDATE restaurant_tables SET status='occupied',updated_at=CURRENT_TIMESTAMP WHERE id=${tableId}`;
    await tx`UPDATE guests SET status='seated',table_id=${tableId},updated_at=CURRENT_TIMESTAMP WHERE id=${guestId}`;
    await tx`INSERT INTO seating_history(guest_id,table_id) VALUES (${guestId},${tableId})`;
    return { success: true, guest_id: guestId, table_id: tableId };
  });
}

export async function releaseTablePostgres(tableId: number) {
  const sql = getPostgres();
  return sql.begin(async tx => {
    await tx`SELECT pg_advisory_xact_lock(741122)`;
    const [table] = await tx`SELECT id,status FROM restaurant_tables WHERE id=${tableId} FOR UPDATE`;
    if (!table) throw new Error("Table not found");
    if (table.status !== "occupied") throw new Error("Table is no longer occupied");
    await tx`UPDATE seating_history SET released_at=CURRENT_TIMESTAMP WHERE table_id=${tableId} AND released_at IS NULL`;
    await tx`UPDATE guests SET table_id=NULL,updated_at=CURRENT_TIMESTAMP WHERE table_id=${tableId} AND status='seated'`;
    await tx`UPDATE restaurant_tables SET status='free',updated_at=CURRENT_TIMESTAMP WHERE id=${tableId}`;
    // Older databases may not yet have the optional request workflow installed.
    const [schema] = await tx`SELECT to_regclass('public.table_ready_requests') IS NOT NULL AS available`;
    if (schema.available) {
      await tx`UPDATE table_ready_requests SET status='cancelled',reviewed_at=NOW()
        WHERE table_id=${tableId} AND status='pending'`;
    }
    return { success: true, table_id: tableId, status: "free" };
  });
}
