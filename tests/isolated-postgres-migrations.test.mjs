// Offline checks: mocked bootstrap guard and empty in-memory PGlite schema.
// No PostgreSQL network client is imported or connected by this file.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { ACK, validateTarget } from "./isolated-postgres-target.mjs";
import { MIGRATION_SEQUENCE, initializeQa, readMigrations, seedQaFixtures } from "./isolated-postgres-migrations.mjs";
import { load } from "./handler-harness.mjs";

const config={url:"postgres://synthetic:synthetic@localhost/mo_bistro_qa_disposable",
  databaseName:"mo_bistro_qa_disposable",host:"localhost",ack:ACK,ssl:false};
const target=validateTarget(config);
function bootstrapMock(change={},objects={},failureAt=-1) {
  const identity={database_name:target.database,role_name:target.user,schema_name:"public",schemas:["public"],pid:123,recovery:false,...change};
  const calls=[],writes=[];
  const sql=async strings=>{
    const q=strings.join("?"); calls.push(q);
    if(q.includes("current_database")) return [identity];
    if(q.includes("AS relations")) return [{relations:0,routines:0,types:0,extra_schemas:0,...objects}];
    return [];
  };
  sql.unsafe=async statement=>{
    writes.push(statement);
    if(statement!=="ROLLBACK" && writes.length-1===failureAt) throw Object.assign(Error("synthetic failure"),{code:"42P01"});
  };
  return {sql,calls,writes};
}
test("QA options require authorization, credentials and one host without query overrides",()=>{
  for(const invalid of [
    {...config,ack:undefined}, {...config,host:"wrong"},
    {...config,url:"postgres://synthetic:synthetic@localhost/mo_bistro_2",databaseName:"mo_bistro_2"},
    {...config,url:"postgres://localhost/mo_bistro_qa_disposable"},
    {...config,url:config.url+"?search_path=other"}, {...config,url:config.url+"?sslmode=disable"},
  ]) assert.throws(()=>validateTarget(invalid));
  assert.throws(()=>validateTarget(config,[config.url]));
  assert.throws(()=>validateTarget({...config,url:config.url.replace("localhost","qa-pooler.neon.tech"),host:"qa-pooler.neon.tech",ssl:true},
    [config.url.replace("localhost","qa.neon.tech")]));
  assert.throws(()=>validateTarget({...config,url:config.url.replace("localhost","qa-pooler.neon.tech"),host:"qa-pooler.neon.tech",ssl:true}),/direct QA endpoint/);
  assert.throws(()=>validateTarget({...config,url:config.url.replace("localhost","qa.neon.tech"),host:"qa.neon.tech",ssl:true},
    [config.url.replace("localhost","qa-pooler.neon.tech")]));
  assert.equal(target.options.database,config.databaseName);
  assert.deepEqual(target.options.host,[config.host]);
  assert.equal(target.options.user,"synthetic");
});
test("bootstrap rejects missing authorization before any SQL",async()=>{
  const mock=bootstrapMock();
  await assert.rejects(initializeQa(mock.sql,{...target,authorization:undefined}));
  assert.equal(mock.calls.length,0);assert.equal(mock.writes.length,0);
});
test("bootstrap rejects unverified identity before migration writes",async()=>{
  for(const change of [{database_name:"mo_bistro_2"},{role_name:"other"},{schema_name:"other"},
    {schemas:["public","other"]},{pid:null},{recovery:true}]) {
    const mock=bootstrapMock(change);
    await assert.rejects(initializeQa(mock.sql,target));
    assert.equal(mock.writes.length,0);
  }
});
test("any existing relation, routine, type or extra schema prevents migration writes",async()=>{
  for(const kind of ["relations","routines","types","extra_schemas"]) {
    const mock=bootstrapMock({}, {[kind]:1});
    await assert.rejects(initializeQa(mock.sql,target),/not empty/);
    assert.equal(mock.writes.length,0);
    assert.ok(mock.calls.at(-1).includes("pg_advisory_unlock"));
  }
});
test("bootstrap executes exact documented migration bytes in order",async()=>{
  const readme=fs.readFileSync("README.md","utf8"),migrations=readMigrations(),mock=bootstrapMock();
  assert.deepEqual([...readme.matchAll(/^\d+\. `migrations\/(.+\.sql)`/gm)].map(match=>match[1]),MIGRATION_SEQUENCE);
  assert.deepEqual(await initializeQa(mock.sql,target),MIGRATION_SEQUENCE);
  assert.deepEqual(mock.writes,migrations.map(migration=>migration.sql));
  assert.ok(mock.calls.indexOf(mock.calls.find(q=>q.includes("AS relations")))>0);
});
test("migration failure rolls back that transaction, stops sequence and does not drop data",async()=>{
  const mock=bootstrapMock({}, {},2);
  await assert.rejects(initializeQa(mock.sql,target),/20261010_guest_manual_eta.sql failed \(42P01\)/);
  assert.equal(mock.writes.length,4);
  assert.equal(mock.writes.at(-1),"ROLLBACK");
  assert.ok(mock.calls.at(-1).includes("pg_advisory_unlock"));
});
test("changed backend identity stops before the next migration",async()=>{
  const mock=bootstrapMock();let reads=0;
  const sql=async strings=>{
    const result=await mock.sql(strings);
    if(strings.join("?").includes("current_database") && ++reads===3)
      return [{...result[0],pid:999}];
    return result;
  };
  sql.unsafe=mock.sql.unsafe;
  await assert.rejects(initializeQa(sql,target),/connection changed/);
  assert.equal(mock.writes.length,1);
});
test("altered migration order is refused before any DDL",async()=>{
  const mock=bootstrapMock();
  await assert.rejects(initializeQa(mock.sql,target,readMigrations().reverse()),/Unexpected migration sequence/);
  assert.equal(mock.writes.length,0);
});
function adapter(database) {
  const sql=async(strings,...values)=>{
    const query=strings.reduce((text,part,index)=>text+(index ? "$"+index : "")+part,"");
    // Embedded single connection does not prove PostgreSQL advisory locking.
    if(query.includes("pg_advisory_xact_lock")) return [];
    return (await database.query(query,values)).rows;
  };
  sql.begin=callback=>database.transaction(tx=>callback(adapter(tx)));
  return sql;
}
test("unmodified migration sequence supports fixtures and serial seating/release in embedded SQL",async()=>{
  const database=new PGlite();
  try {
    for(const migration of readMigrations()) await database.exec(migration.sql);
    const types=(await database.query("SELECT column_name,data_type FROM information_schema.columns WHERE table_name='guests' AND column_name IN ('eta_at','seated_at') ORDER BY column_name")).rows;
    assert.deepEqual(types,[{column_name:"eta_at",data_type:"timestamp with time zone"},{column_name:"seated_at",data_type:"timestamp with time zone"}]);
    await database.exec("ALTER SEQUENCE staff_users_id_seq RESTART WITH 41; ALTER SEQUENCE restaurant_tables_id_seq RESTART WITH 101");
    const sql=adapter(database),{actorId,tableIds}=await seedQaFixtures(sql);
    assert.equal(actorId,41);assert.deepEqual(tableIds,[101,102]);
    assert.equal((await sql`SELECT COUNT(*)::integer AS count FROM simple_table_capacity`)[0].count,2);
    const mocks={"@/lib/postgres-db":{getPostgres:()=>sql},"@/lib/whatsapp/policy":{whatsappEnabled:()=>false},"@/lib/whatsapp/service":{scheduleReview:async()=>{}}};
    const named=load("src/lib/seating-postgres.ts",mocks),simple=load("src/lib/simple-table-postgres.ts",mocks);
    const [guest]=await sql`INSERT INTO guests(name,phone,party_size) VALUES ('Synthetic','01000000001',2) RETURNING id`;
    await named.assignTablePostgres(guest.id,tableIds[0]);
    await sql`INSERT INTO table_ready_requests(table_id,requested_by) VALUES (${tableIds[0]},${actorId})`;
    await named.releaseTablePostgres(tableIds[0]);
    assert.equal((await sql`SELECT status FROM table_ready_requests`)[0].status,"cancelled");
    assert.ok((await sql`SELECT seated_at FROM guests WHERE id=${guest.id}`)[0].seated_at);
    await sql`UPDATE seating_settings SET value='simple' WHERE key='table_view_mode'`;
    const [other]=await sql`INSERT INTO guests(name,phone,party_size) VALUES ('Synthetic','01000000002',2) RETURNING id`;
    await simple.assignSimpleTable(other.id,"indoor",actorId);
    await simple.freeSimpleTable("indoor",actorId,"offline-release");
    assert.equal((await sql`SELECT occupied_tables FROM simple_table_capacity WHERE area='indoor'`)[0].occupied_tables,0);
  } finally { await database.close(); }
});
