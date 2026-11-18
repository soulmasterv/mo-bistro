import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { requireDependency } from './handler-harness.mjs';
const { PGlite } = requireDependency('@electric-sql/pglite');

test('Pilot isolation preserves Advanced records and retargets named SQL functions', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE TABLE guests(id integer PRIMARY KEY);
      INSERT INTO guests VALUES (101);
      CREATE TABLE pilot_parties(id integer PRIMARY KEY);
      INSERT INTO pilot_parties VALUES (202);
      CREATE TABLE pilot_ready_messages(party_id integer REFERENCES pilot_parties(id));
      INSERT INTO pilot_ready_messages VALUES (202);
      CREATE FUNCTION demo_queue_advanced_counts() RETURNS bigint LANGUAGE sql
        AS 'SELECT count(*) FROM public.guests';
      CREATE FUNCTION pilot_count() RETURNS bigint LANGUAGE sql
        AS 'SELECT count(*) FROM public.pilot_parties';
    `);
    await db.exec(fs.readFileSync('migrations/20261118_standardize_guests.sql', 'utf8'));
    assert.deepEqual((await db.query('SELECT id FROM public.guests')).rows, [{id:202}]);
    assert.deepEqual((await db.query('SELECT id FROM archived_advanced.guests')).rows, [{id:101}]);
    assert.equal((await db.query('SELECT pilot_count()::integer AS count')).rows[0].count, 1);
    assert.equal((await db.query('SELECT demo_queue_advanced_counts()::integer AS count')).rows[0].count, 1);
    assert.match((await db.query("SELECT pg_get_functiondef('demo_queue_advanced_counts()'::regprocedure) AS def")).rows[0].def,
      /archived_advanced\.guests/);
    await assert.rejects(db.exec('INSERT INTO pilot_ready_messages VALUES (101)'), /foreign key/);
    await assert.rejects(db.exec(fs.readFileSync('migrations/20261118_standardize_guests.sql', 'utf8')),
      /Expected Pilot source table is missing/);
  } finally { await db.close(); }
});
