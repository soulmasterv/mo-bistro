import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";

const dataDir = path.join(process.cwd(), "data");

function openSqlite() {
  if (process.env.MO_BISTRO_DB === "postgres") {
    throw new Error("SQLite access is disabled in PostgreSQL mode");
  }

  fs.mkdirSync(dataDir, { recursive: true });

  const connection = new Database(path.join(dataDir, "waitlist.sqlite"));
  connection.pragma("journal_mode = WAL");
  connection.pragma("busy_timeout = 5000");
  connection.exec(`
    CREATE TABLE IF NOT EXISTS guests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      party_size INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'waiting',
      confirmed INTEGER NOT NULL DEFAULT 0,
      source TEXT NOT NULL DEFAULT 'staff',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  
    CREATE INDEX IF NOT EXISTS idx_guests_queue
      ON guests(status, created_at, id);
  `);
  return connection;
}

let sqlite: Database.Database | undefined;

function getSqlite(): Database.Database {
  return sqlite ??= openSqlite();
}

const db = new Proxy({} as Database.Database, {
  get(_target, property) {
    const connection = getSqlite();
    const value = Reflect.get(connection, property);
    return typeof value === "function" ? value.bind(connection) : value;
  },
});



export default db;
