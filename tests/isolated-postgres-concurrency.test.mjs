// Opt-in only. Never accepts the application's Production/database environment variables.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { randomBytes, createHash } from "node:crypto";
import { load } from "./handler-harness.mjs";
const approved =
  process.env.MO_BISTRO_ISOLATED_DB_TEST_ACK ===
  "I_APPROVE_SYNTHETIC_SCHEMA_WRITES";
const url = process.env.MO_BISTRO_ISOLATED_TEST_URL;
test(
  "isolated PostgreSQL: cross-connection QR/walk-in capacity and duplicate protection",
  { skip: !approved || !url },
  async () => {
    const { default: postgres } = await import("postgres");
    const schema = "mo_bistro_qa_" + randomBytes(8).toString("hex");
    assert.match(schema, /^mo_bistro_qa_[a-f0-9]{16}$/);
    const admin = postgres(url, {
      max: 1,
      ssl: "require",
      connect_timeout: 10,
    });
    let sql;
    try {
      await admin.unsafe(`CREATE SCHEMA "${schema}"`);
      sql = postgres(url, {
        max: 4,
        ssl: "require",
        connect_timeout: 10,
        connection: { search_path: schema },
      });
      await sql.unsafe(
        fs.readFileSync("migrations/001_postgres_schema.sql", "utf8"),
      );
      await sql`INSERT INTO restaurant_settings(key,value) VALUES ('queue_capacity','1'),('approval_required','false')`;
      const { createBookingPostgres } = load("src/lib/booking-creation.ts", {
        "@/lib/postgres-db": { getPostgres: () => sql },
        "@/lib/staff-auth": {},
        "@/lib/staff-auth-postgres": {},
        "@/lib/guest-tracking": {
          newTrackingToken: () => randomBytes(32).toString("hex"),
          hashTrackingToken: (t) =>
            createHash("sha256").update(t).digest("hex"),
        },
        "@/lib/whatsapp/service": { recordBookingConsent: async () => {} },
      });
      const guest = {
        name: "Synthetic Guest",
        phone: "01012345678",
        party_size: 2,
        seating_preference: "any",
      };
      const capacity = await Promise.all([
        createBookingPostgres(guest, { source: "qr" }),
        createBookingPostgres(
          { ...guest, phone: "01012345679" },
          { source: "staff" },
        ),
      ]);
      assert.equal(capacity.filter((r) => "id" in r).length, 1);
      assert.equal(capacity.filter((r) => r.error === "full").length, 1);
      await sql`DELETE FROM guests`;
      await sql`UPDATE restaurant_settings SET value='5' WHERE key='queue_capacity'`;
      const duplicate = await Promise.all([
        createBookingPostgres(guest, { source: "qr" }),
        createBookingPostgres(guest, { source: "staff" }),
      ]);
      assert.equal(duplicate.filter((r) => "id" in r).length, 1);
      assert.equal(duplicate.filter((r) => r.error === "duplicate").length, 1);
      const [count] = await sql`SELECT COUNT(*)::integer AS count FROM guests`;
      assert.equal(count.count, 1);
    } finally {
      if (sql) await sql.end();
      // Only our generated temporary schema can be removed. No public schema/table is modified.
      await admin.unsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await admin.end();
    }
  },
);
