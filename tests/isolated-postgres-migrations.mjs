import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { ACK } from "./isolated-postgres-target.mjs";

export const MIGRATION_SEQUENCE = Object.freeze([
  "001_postgres_schema.sql",
  "002_licensing.sql",
  "20261010_guest_manual_eta.sql",
  "20261012_staff_schema_repair.sql",
  "20261012_simple_inventory.sql",
  "20261013_core_support.sql",
]);
export function readMigrations() {
  return MIGRATION_SEQUENCE.map(name => ({ name,
    sql: fs.readFileSync(fileURLToPath(new URL("../migrations/" + name, import.meta.url)), "utf8") }));
}
// Called only on the reserved connection from a locally validated QA target.
// Identity/emptiness reads precede DDL. Session lock serializes harness startup.
export async function initializeQa(sql, target, migrations = readMigrations()) {
  assert.equal(target?.authorization,ACK,"Synthetic-write authorization missing; no SQL executed");
  assert.match(target.database,/^mo_bistro_qa_[a-z0-9_]+$/,"Non-QA target; no SQL executed");
  const [identity] = await sql`SELECT current_database() AS database_name,current_user AS role_name,
    current_schema() AS schema_name,to_json(current_schemas(false)) AS schemas,
    pg_backend_pid() AS pid,pg_is_in_recovery() AS recovery`;
  assert.equal(identity?.database_name,target.database,"QA database identity mismatch; no migration executed");
  assert.equal(identity?.role_name,target.user,"QA role identity mismatch; no migration executed");
  assert.equal(identity?.schema_name,"public","QA creation schema must be public");
  assert.deepEqual(identity.schemas,["public"],"QA search path must be public only");
  assert.equal(identity.recovery,false,"QA must be a writable primary");
  assert.ok(Number.isInteger(identity.pid),"QA backend identity unavailable");
  await sql`SELECT pg_advisory_lock(91401284)`;
  let failed=false;
  try {
    const [objects] = await sql`SELECT
      (SELECT COUNT(*)::integer FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
       WHERE left(n.nspname,3)<>'pg_' AND n.nspname<>'information_schema') AS relations,
      (SELECT COUNT(*)::integer FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
       WHERE left(n.nspname,3)<>'pg_' AND n.nspname<>'information_schema') AS routines,
      (SELECT COUNT(*)::integer FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
       WHERE left(n.nspname,3)<>'pg_' AND n.nspname<>'information_schema' AND t.typtype IN ('c','d','e')) AS types,
      (SELECT COUNT(*)::integer FROM pg_namespace n WHERE left(n.nspname,3)<>'pg_'
       AND n.nspname NOT IN ('public','information_schema')) AS extra_schemas`;
    for(const kind of ["relations","routines","types","extra_schemas"])
      assert.equal(objects?.[kind],0,`QA database is not empty (${kind}); no migration executed`);
    assert.deepEqual(migrations.map(item=>item.name),MIGRATION_SEQUENCE,"Unexpected migration sequence");
    for(const migration of migrations) {
      const [current] = await sql`SELECT current_database() AS database_name,current_user AS role_name,
        current_schema() AS schema_name,pg_backend_pid() AS pid`;
      assert.equal(current.database_name,identity.database_name);
      assert.equal(current.role_name,identity.role_name);
      assert.equal(current.schema_name,"public");
      assert.equal(current.pid,identity.pid,"QA connection changed; migration stopped");
      try { await sql.unsafe(migration.sql); }
      catch(error) {
        // A failed script may leave its BEGIN transaction aborted. Roll back
        // that script only; prior committed migrations remain for inspection.
        try { await sql.unsafe("ROLLBACK"); } catch {}
        const code=typeof error?.code==="string" && /^[A-Z0-9]{5}$/.test(error.code) ? error.code : "unavailable";
        // Do not expose raw SQL, URLs or provider errors in runner output.
        throw Error(`QA migration ${migration.name} failed (${code}); retain this database for inspection`);
      }
    }
    return MIGRATION_SEQUENCE;
  } catch(error) {
    failed=true;
    throw error;
  } finally {
    try { await sql`SELECT pg_advisory_unlock(91401284)`; }
    catch { if(!failed) throw Error("QA initialization lock release failed; stop and inspect the database"); }
  }
}
export async function seedQaFixtures(sql) {
  const [actor] = await sql`INSERT INTO staff_users(username,role,credential_hash)
    VALUES ('synthetic','manager','synthetic') RETURNING id`;
  await sql`INSERT INTO restaurant_settings(key,value) VALUES ('queue_capacity','50'),('approval_required','false')`;
  await sql`INSERT INTO seating_settings(key,value) VALUES ('table_view_mode','detailed')`;
  const tables=await sql`INSERT INTO restaurant_tables(name,seats,area)
    VALUES ('Synthetic 1',4,'indoor'),('Synthetic 2',4,'indoor') RETURNING id`;
  // The actual migration already seeded these pools at zero, before named fixtures.
  const pools=await sql`UPDATE simple_table_capacity SET total_tables=1,occupied_tables=0,max_party_size=4
    WHERE area IN ('indoor','outdoor') RETURNING area`;
  assert.equal(pools.length,2);
  assert.ok(Number.isInteger(actor?.id));
  assert.equal(tables.length,2);
  return { actorId:actor.id,tableIds:tables.map(row=>row.id) };
}
