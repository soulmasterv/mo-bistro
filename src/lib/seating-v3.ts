import "server-only";
import db from "@/lib/db";

export function setupSeating() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS seating_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guest_id INTEGER NOT NULL,
      table_id INTEGER NOT NULL,
      assigned_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      released_at TEXT
    );
    CREATE TABLE IF NOT EXISTS seating_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    INSERT OR IGNORE INTO seating_settings(key,value)
      VALUES ('require_table_assignment','true');
    INSERT OR IGNORE INTO seating_settings(key,value)
      VALUES ('allow_area_override','true');
  `);
}

export function getSetting(key: string) {
  setupSeating();
  const row = db.prepare(
    "SELECT value FROM seating_settings WHERE key=?"
  ).get(key) as { value: string } | undefined;
  return row?.value === "true";
}

export function getAssignableTables(guestId: number) {
  setupSeating();

  const guest = db.prepare(`
    SELECT id,party_size,seating_preference
    FROM guests WHERE id=?
  `).get(guestId) as {
    id: number;
    party_size: number;
    seating_preference: string;
  } | undefined;

  if (!guest) return null;

  const allowOverride = getSetting("allow_area_override");

  const tables = db.prepare(`
    SELECT t.id,t.name,t.seats,t.area,t.status
    FROM restaurant_tables t
    WHERE t.status='free'
      AND t.seats >= ?
      AND NOT EXISTS (
        SELECT 1 FROM guests g
        WHERE g.table_id=t.id AND g.status='seated'
      )
    ORDER BY
      CASE WHEN ?='any' OR t.area=? THEN 0 ELSE 1 END,
      t.seats ASC,
      t.id ASC
  `).all(
    guest.party_size,
    guest.seating_preference,
    guest.seating_preference
  ) as Array<{
    id: number;
    name: string;
    seats: number;
    area: string;
    status: string;
  }>;

  return {
    guest,
    tables: tables.filter(t =>
      allowOverride ||
      guest.seating_preference === "any" ||
      t.area === guest.seating_preference
    )
  };
}

export function assignTable(guestId: number, tableId: number) {
  setupSeating();

  const transaction = db.transaction(() => {
    const guest = db.prepare(`
      SELECT id,status,party_size,seating_preference,table_id
      FROM guests WHERE id=?
    `).get(guestId) as {
      id: number;
      status: string;
      party_size: number;
      seating_preference: string;
      table_id: number | null;
    } | undefined;

    if (!guest) throw new Error("Guest not found");
    if (!["waiting", "called"].includes(guest.status)) {
      throw new Error("Only waiting guests can be seated");
    }

    const table = db.prepare(`
      SELECT id,seats,area,status
      FROM restaurant_tables WHERE id=?
    `).get(tableId) as {
      id: number;
      seats: number;
      area: string;
      status: string;
    } | undefined;

    if (!table) throw new Error("Table not found");
    if (table.status !== "free") throw new Error("Table is occupied");
    if (table.seats < guest.party_size) {
      throw new Error("Table is too small for this party");
    }

    if (
      !getSetting("allow_area_override") &&
      guest.seating_preference !== "any" &&
      guest.seating_preference !== table.area
    ) {
      throw new Error("Table does not match seating preference");
    }

    const occupied = db.prepare(`
      SELECT id FROM guests
      WHERE table_id=? AND status='seated'
      LIMIT 1
    `).get(tableId);

    if (occupied) throw new Error("Table is already assigned");

    db.prepare(`
      UPDATE restaurant_tables
      SET status='occupied',updated_at=CURRENT_TIMESTAMP
      WHERE id=?
    `).run(tableId);

    db.prepare(`
      UPDATE guests
      SET status='seated',table_id=?,updated_at=CURRENT_TIMESTAMP
      WHERE id=?
    `).run(tableId, guestId);

    db.prepare(`
      INSERT INTO seating_history(guest_id,table_id)
      VALUES (?,?)
    `).run(guestId, tableId);

    return { success: true, guest_id: guestId, table_id: tableId };
  });

  return transaction();
}

export function releaseTable(tableId: number) {
  setupSeating();

  const transaction = db.transaction(() => {
    const table = db.prepare(
      "SELECT id,status FROM restaurant_tables WHERE id=?"
    ).get(tableId) as { id: number; status: string } | undefined;

    if (!table) throw new Error("Table not found");
    if (table.status !== "occupied") throw new Error("Table is no longer occupied");

    db.prepare(`
      UPDATE seating_history
      SET released_at=CURRENT_TIMESTAMP
      WHERE table_id=? AND released_at IS NULL
    `).run(tableId);

    db.prepare(`
      UPDATE guests
      SET table_id=NULL,updated_at=CURRENT_TIMESTAMP
      WHERE table_id=? AND status='seated'
    `).run(tableId);

    db.prepare(`
      UPDATE restaurant_tables
      SET status='free',updated_at=CURRENT_TIMESTAMP
      WHERE id=?
    `).run(tableId);

    return { success: true, table_id: tableId, status: "free" };
  });

  return transaction();
}
