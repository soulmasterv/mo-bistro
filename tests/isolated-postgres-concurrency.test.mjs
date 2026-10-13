// Synthetic writes only after explicit approval; never uses an app URL as its target.
import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes, createHash } from "node:crypto";
import { load, harness, request, context } from "./handler-harness.mjs";
import { ACK, configuredTarget, validateTarget } from "./isolated-postgres-target.mjs";
import { initializeQa, readMigrations, seedQaFixtures } from "./isolated-postgres-migrations.mjs";

test("isolated target rejects Preview, missing approval, host mismatch and app URLs before connecting", () => {
  const c = { url: "postgres://synthetic:synthetic@localhost/mo_bistro_qa_disposable",
    databaseName: "mo_bistro_qa_disposable", host: "localhost", ack: ACK, ssl: false };
  assert.equal(validateTarget(c).database,c.databaseName);
  assert.throws(()=>validateTarget({...c,ack:undefined}));
  assert.throws(()=>validateTarget({...c,host:"different"}));
  assert.throws(()=>validateTarget({...c,url:"postgres://localhost/mo_bistro_2",databaseName:"mo_bistro_2"}));
  assert.throws(()=>validateTarget(c,[c.url]));
  assert.throws(()=>validateTarget({...c,url:"postgres://remote/mo_bistro_qa_disposable",host:"remote"}));
  assert.throws(()=>validateTarget({...c,url:c.url+"?search_path=other"}));
  assert.throws(()=>validateTarget({...c,url:"postgres://localhost/mo_bistro_qa_disposable"}));
  assert.throws(()=>validateTarget({...c,url:c.url+"?sslmode=disable"}));
});
const config = configuredTarget();
test("actual isolated PostgreSQL booking, permits, seating and queue concurrency", {skip:!config}, async t => {
  const target=validateTarget(config,[process.env.MO_BISTRO_POSTGRES_URL,process.env.DATABASE_URL,process.env.LICENSE_ADMIN_DATABASE_URL]);
  const {default:postgres}=await import("postgres");
  const migrations=readMigrations();
  const connection={search_path:"public",statement_timeout:15000,lock_timeout:5000,
    application_name:"mo_bistro_qa_concurrency"};
  const options={...target.options,connect_timeout:10,prepare:false,fetch_types:false,debug:false,
    target_session_attrs:"read-write",connection};
  const admin=postgres({...options,max:1});
  let sql,reserved;
  try {
    // With fetch_types disabled, postgres.js can leave a cold reserve pending.
    // Open the connection with a read-only identity check before reserving it.
    const [initialIdentity]=await admin`SELECT current_database() AS database_name,
      current_user AS role_name,current_schema() AS schema_name`;
    assert.equal(initialIdentity.database_name,target.database);
    assert.equal(initialIdentity.role_name,target.user);
    assert.equal(initialIdentity.schema_name,"public");
    reserved=await admin.reserve();
    const applied=await initializeQa(reserved,target,migrations);
    console.log("QA migrations applied in documented order:",applied.join(", "));
    reserved.release(); reserved=undefined;
    sql=postgres({...options,max:4});
    const pids=await Promise.all(Array.from({length:4},()=>sql.begin(async tx=>{
      const [identity]=await tx`SELECT current_database() AS database_name,current_user AS role_name,
        current_schema() AS schema_name,pg_backend_pid() AS pid,pg_sleep(0.1)`;
      assert.equal(identity.database_name,target.database);
      assert.equal(identity.role_name,target.user);
      assert.equal(identity.schema_name,"public");
      return identity.pid;
    })));
    assert.ok(new Set(pids).size>=2,"Independent QA backends unavailable; no fixtures inserted");
    const {actorId,tableIds}=await seedQaFixtures(sql);
    const [tableOne,tableTwo]=tableIds;
    const mocks={"@/lib/postgres-db":{getPostgres:()=>sql},"@/lib/staff-auth":{},"@/lib/staff-auth-postgres":{},
      "@/lib/guest-tracking":{newTrackingToken:()=>randomBytes(32).toString("hex"),hashTrackingToken:token=>createHash("sha256").update(token).digest("hex")},
      "@/lib/whatsapp/policy":{whatsappEnabled:()=>false},"@/lib/whatsapp/service":{recordBookingConsent:async()=>{},scheduleReview:async()=>{}}};
    const {createBookingPostgres:create}=load("src/lib/booking-creation.ts",mocks);
    const named=load("src/lib/seating-postgres.ts",mocks),simple=load("src/lib/simple-table-postgres.ts",mocks);
    const h=harness({actor:{id:actorId,username:"synthetic",role:"manager"}});
    h.mocks["@/lib/postgres-db"]=mocks["@/lib/postgres-db"];
    const queue=h.route("guests/[id]"),management=h.route("management");
    let serial=0;
    const guest=()=>({name:"Synthetic Guest",phone:"010"+String(++serial).padStart(8,"0"),party_size:2,seating_preference:"any"});
    const book=async()=>{const r=await create(guest(),{source:"staff"});assert.ok("id" in r);return r.id;};
    const successes=results=>{
      for(const r of results) if(r.status==="rejected") assert.equal(r.reason?.name,"WorkflowError");
      return results.filter(r=>r.status==="fulfilled").length;
    };
    async function reset(mode="detailed",capacity=50) {
      await sql`DELETE FROM table_ready_requests`;
      await sql`DELETE FROM simple_table_events`; await sql`DELETE FROM seating_history`; await sql`DELETE FROM guests`;
      await sql`DELETE FROM qr_registration_permits`; await sql`UPDATE restaurant_tables SET status='free'`;
      await sql`UPDATE simple_table_capacity SET occupied_tables=0`;
      await sql`UPDATE seating_settings SET value=${mode} WHERE key='table_view_mode'`;
      await sql`UPDATE restaurant_settings SET value=${String(capacity)} WHERE key='queue_capacity'`;
    }
    await t.test("uses independent PostgreSQL backends",async()=>{
      assert.ok(new Set(pids).size>=2);
    });
    await t.test("mixed QR/staff joins enforce capacity",async()=>{
      await reset("detailed",2);
      const rs=await Promise.all(Array.from({length:12},(_,i)=>create(guest(),{source:i%2 ? "qr":"staff"})));
      assert.equal(rs.filter(r=>"id" in r).length,2);assert.equal(rs.filter(r=>r.error==="full").length,10);
      assert.equal((await sql`SELECT COUNT(*)::integer AS count FROM guests`)[0].count,2);
    });
    await t.test("same phone has one active booking",async()=>{
      await reset();const input=guest(),rs=await Promise.all(Array.from({length:6},(_,i)=>create(input,{source:i%2 ? "qr":"staff"})));
      assert.equal(rs.filter(r=>"id" in r).length,1);assert.equal(rs.filter(r=>r.error==="duplicate").length,5);
    });
    await t.test("QR permit once-only and rollback after insertion failure",async()=>{
      await reset();const tokenHash="a".repeat(64),codeHash="b".repeat(64),expiry=Date.now()+60000,permit={tokenHash,codeHash};
      await sql`INSERT INTO qr_registration_permits(token_hash,qr_code_hash,qr_expires_at,expires_at) VALUES (${tokenHash},${codeHash},${expiry},${expiry})`;
      await assert.rejects(create({...guest(),name:null},{source:"qr",permit}));
      assert.equal((await sql`SELECT used_at FROM qr_registration_permits`)[0].used_at,null);
      const rs=await Promise.all([create(guest(),{source:"qr",permit}),create(guest(),{source:"qr",permit})]);
      assert.equal(rs.filter(r=>"id" in r).length,1);assert.equal(rs.filter(r=>r.error==="expired").length,1);
    });
    await t.test("capacity changes coordinate with creation",async()=>{
      await reset("detailed",1);
      const settings={qr_rotation_seconds:"300",qr_required:false,approval_required:false,queue_capacity:2,restaurant_name:"Synthetic Restaurant"};
      const rs=await Promise.all([create(guest(),{source:"staff"}),management.PATCH(request("PATCH",settings)),create(guest(),{source:"qr"})]);
      assert.equal(rs[1].status,200);assert.ok((await sql`SELECT COUNT(*)::integer AS count FROM guests`)[0].count<=2);
    });
    await t.test("two guests cannot claim one named table",async()=>{
      await reset();const ids=[await book(),await book()];
      assert.equal(successes(await Promise.allSettled(ids.map(id=>named.assignTablePostgres(id,tableOne)))),1);
      assert.equal((await sql`SELECT COUNT(*)::integer AS count FROM guests WHERE status='seated'`)[0].count,1);
      assert.ok((await sql`SELECT seated_at FROM guests WHERE status='seated'`)[0].seated_at);
    });
    await t.test("one guest cannot claim two named tables",async()=>{
      await reset();const id=await book();
      assert.equal(successes(await Promise.allSettled([named.assignTablePostgres(id,tableOne),named.assignTablePostgres(id,tableTwo)])),1);
      assert.equal((await sql`SELECT COUNT(*)::integer AS count FROM restaurant_tables WHERE status='occupied'`)[0].count,1);
    });
    await t.test("cancel/seat and call/cancel preserve final state",async()=>{
      await reset();const id=await book();
      const race=await Promise.allSettled([named.assignTablePostgres(id,tableOne),queue.PATCH(request("PATCH",{action:"cancel"}),context(id))]);
      if(race[0].status==="rejected") assert.equal(race[0].reason?.name,"WorkflowError");
      assert.equal(race[1].status,"fulfilled");
      assert.ok([200,409].includes(race[1].value.status));
      assert.equal(Number(race[0].status==="fulfilled")+Number(race[1].value.status===200),1);
      const [row]=await sql`SELECT status FROM guests WHERE id=${id}`,[table]=await sql`SELECT status FROM restaurant_tables WHERE id=${tableOne}`;
      assert.ok(["seated","cancelled"].includes(row.status));assert.equal(table.status,row.status==="seated" ? "occupied":"free");
      const other=await book(),rs=await Promise.all([queue.PATCH(request("PATCH",{action:"call"}),context(other)),queue.PATCH(request("PATCH",{action:"cancel"}),context(other))]);
      assert.ok(rs.every(r=>[200,409].includes(r.status)));assert.equal((await sql`SELECT status FROM guests WHERE id=${other}`)[0].status,"cancelled");
    });
    await t.test("duplicate named releases preserve seated_at",async()=>{
      await reset();const id=await book();await named.assignTablePostgres(id,tableOne);
      const [before]=await sql`SELECT seated_at FROM guests WHERE id=${id}`;
      assert.equal(successes(await Promise.allSettled([named.releaseTablePostgres(tableOne),named.releaseTablePostgres(tableOne)])),1);
      const [after]=await sql`SELECT seated_at,table_id FROM guests WHERE id=${id}`;
      assert.equal(new Date(after.seated_at).getTime(),new Date(before.seated_at).getTime());assert.equal(after.table_id,null);
    });
    await t.test("Simple Mode capacity and retry-safe release",async()=>{
      await reset("simple");const ids=[await book(),await book()];
      assert.equal(successes(await Promise.allSettled(ids.map(id=>simple.assignSimpleTable(id,"indoor",actorId)))),1);
      const rs=await Promise.all([simple.freeSimpleTable("indoor",actorId,"synthetic-release"),simple.freeSimpleTable("indoor",actorId,"synthetic-release")]);
      assert.equal(rs.filter(r=>r.repeated).length,1);assert.equal((await sql`SELECT occupied_tables FROM simple_table_capacity WHERE area='indoor'`)[0].occupied_tables,0);
    });
  } finally {
    try { if(sql) await sql.end({timeout:5}); }
    finally {
      if(reserved) reserved.release();
      // Keep the migrated QA database/fixtures for inspection. Never auto-drop
      // public, any schema or the database, including after a migration failure.
      await admin.end({timeout:5});
    }
  }
});
