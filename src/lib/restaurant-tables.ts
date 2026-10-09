import "server-only";
import db from "@/lib/db";

export type RestaurantTable = {
  id: number;
  name: string;
  seats: number;
  area: "indoor" | "outdoor";
  status: "free" | "occupied";
  updated_at: string;
};

export function initializeTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS restaurant_tables (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE COLLATE NOCASE,
      seats INTEGER NOT NULL CHECK(seats BETWEEN 1 AND 30),
      status TEXT NOT NULL DEFAULT 'free'
        CHECK(status IN ('free','occupied')),
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

export function listTables(): RestaurantTable[] {
  initializeTables();

  return db.prepare(`
    SELECT id,name,seats,area,status,updated_at
    FROM restaurant_tables
    ORDER BY id
  `).all() as RestaurantTable[];
}
