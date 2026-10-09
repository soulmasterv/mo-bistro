import db from "@/lib/db";
import { createHash, randomBytes } from "node:crypto";

export function initializeTracking() {
  const columns = db
    .prepare("PRAGMA table_info(guests)")
    .all() as { name: string }[];

  if (!columns.some((column) => column.name === "tracking_token_hash")) {
    db.exec("ALTER TABLE guests ADD COLUMN tracking_token_hash TEXT");
  }

  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_guests_tracking_token
    ON guests(tracking_token_hash)
  `);
}

export function newTrackingToken() {
  return randomBytes(32).toString("hex");
}

export function hashTrackingToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function validTrackingToken(token: unknown): token is string {
  return typeof token === "string" && /^[a-f0-9]{64}$/.test(token);
}
