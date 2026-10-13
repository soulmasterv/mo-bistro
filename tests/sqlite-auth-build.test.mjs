import test from "node:test";
import assert from "node:assert/strict";
import { load } from "./handler-harness.mjs";
function auth(token, cookieError, postgres = false) {
  const calls = [];
  const db = {
    exec() { calls.push("initialize"); },
    prepare(query) {
      return { run() {}, get() {
        assert.match(query, /expires_at>\?/);
        assert.match(query, /u.active=1/);
        return { id: 1, username: "synthetic", role: "manager" };
      } };
    },
  };
  const authModule = load("src/lib/staff-auth.ts", {
    "@/lib/db": { __esModule: true, default: db },
    "@/lib/staff-auth-utils": {},
    "@/lib/staff-auth-postgres": { currentStaffPostgres: async () => { calls.push("postgres"); return null; } },
    "next/headers": { cookies: async () => {
      calls.push("cookies"); if (cookieError) throw cookieError;
      return { get: () => token ? { value: token } : undefined };
    } },
  }, { process: { env: { MO_BISTRO_DB: postgres ? "postgres" : "sqlite", STAFF_SESSION_SECRET: "synthetic-session-secret-at-least-32-characters" } } });
  return { module: authModule, calls };
}
test("absent or malformed SQLite session never initializes the database", async () => {
  for (const token of [undefined, "invalid"]) {
    const h = auth(token);
    assert.equal(await h.module.currentStaff(), null);
    assert.deepEqual(h.calls, ["cookies"]);
  }
});
test("request-time prerender boundary occurs before SQLite access", async () => {
  const boundary = Error("synthetic request-time boundary");
  const h = auth(undefined, boundary);
  await assert.rejects(h.module.currentStaff(), error => error === boundary);
  assert.deepEqual(h.calls, ["cookies"]);
});
test("valid SQLite session preserves existing active and expiry checks", async () => {
  const h = auth("a".repeat(64));
  assert.equal((await h.module.currentStaff()).role, "manager");
  assert.deepEqual(h.calls, ["cookies", "initialize"]);
});
test("PostgreSQL authentication delegation is unchanged", async () => {
  const h = auth(undefined, undefined, true);
  assert.equal(await h.module.currentStaff(), null);
  assert.deepEqual(h.calls, ["postgres"]);
});
