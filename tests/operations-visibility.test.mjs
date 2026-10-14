import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {load,harness,request,requireDependency} from './handler-harness.mjs';
const {PGlite}=requireDependency('@electric-sql/pglite');
function adapter(db) {
  const sql=async(strings,...values)=>{
    const query=strings.reduce((q,p,i)=>q+p+(i<values.length?'$'+(i+1):''),'');
    if(query.includes('pg_advisory_xact_lock')) return []; // Embedded SQL test, not a concurrent-session test.
    return (await db.query(query,values)).rows;
  };
  sql.begin=fn=>db.transaction(tx=>fn(adapter(tx)));
  return sql;
}
test('migration-backed wait samples, staff attribution, pause enforcement and secret-safe diagnostics',async()=>{
  const db=new PGlite();
  try {
    for(const file of ['001_postgres_schema.sql','20261013_core_support.sql','20261010_guest_manual_eta.sql','20261012_simple_inventory.sql','20261012_whatsapp_notifications.sql','20261013_whatsapp_customer_windows.sql','20261014_operations_visibility.sql'])
      await db.exec(fs.readFileSync('migrations/'+file,'utf8'));
    await db.exec(`INSERT INTO staff_users(id,username,role,credential_hash) VALUES (1,'Test manager','manager','fake');
      INSERT INTO restaurant_tables(name,seats,status,area) VALUES ('QA 1',4,'free','indoor');
      INSERT INTO guests(id,name,phone,party_size,status,created_at,eta_at) VALUES
       (1,'Synthetic guest','01012345678',2,'waiting',(NOW()-INTERVAL '60 minutes')::text,NOW()-INTERVAL '5 minutes'),
       (2,'Synthetic second','01012345679',2,'waiting',(NOW()-INTERVAL '20 minutes')::text,NULL),
       (3,'Legacy invalid time','01012345670',2,'waiting','invalid time',NULL);
      INSERT INTO restaurant_settings VALUES ('queue_capacity','50');`);
    const sql=adapter(db);
    const mocks={'@/lib/postgres-db':{getPostgres:()=>sql},'@/lib/staff-auth':{},'@/lib/staff-auth-postgres':{},'@/lib/db':{}};
    const seating=load('src/lib/seating-postgres.ts',mocks);
    await seating.assignTablePostgres(1,1,1);
    let samples=(await db.query('SELECT * FROM wait_accuracy_samples')).rows;
    assert.equal(samples.length,1);
    assert.ok(Math.abs(samples[0].actual_wait_minutes-60)<1);
    assert.ok(Math.abs(samples[0].eta_error_minutes-5)<1);
    let events=(await db.query("SELECT * FROM staff_activity_events WHERE guest_id=1")).rows;
    assert.equal(events[0].actor_id,1);
    assert.equal(events[0].details.to_status,'seated');
    assert.equal(JSON.stringify(events).includes('Synthetic guest'),false);
    await seating.releaseTablePostgres(1,1);
    await db.exec("INSERT INTO seating_settings VALUES ('table_view_mode','simple'); UPDATE simple_table_capacity SET total_tables=3,max_party_size=4 WHERE area='indoor'");
    const simple=load('src/lib/simple-table-postgres.ts',mocks);
    await simple.assignSimpleTable(2,'indoor',1);
    await simple.assignSimpleTable(3,'indoor',1); // Malformed legacy join timestamp must not break seating.
    samples=(await db.query('SELECT * FROM wait_accuracy_samples ORDER BY booking_id')).rows;
    assert.equal(samples.length,2); assert.equal(samples[1].eta_error_minutes,null);
    // Transaction-local identity never leaks to a later system mutation.
    await db.exec("UPDATE guests SET confirmed=1 WHERE id=2");
    events=(await db.query("SELECT * FROM staff_activity_events WHERE guest_id=2 ORDER BY id DESC LIMIT 1")).rows;
    assert.equal(events[0].actor_id,null);
    const globals={process:{env:{MO_BISTRO_DB:'postgres',WHATSAPP_MODE:'test',WHATSAPP_ALLOW_LIVE_SEND:'false'}}};
    const route=load('src/app/api/management/operations/route.ts',{
      ...mocks,'@/lib/staff-auth':{currentStaff:async()=>({id:1,role:'manager'})},
      '@/lib/licensing/enforce':{requireActiveLicense:async()=>null}
    },globals);
    assert.equal((await route.PATCH(request('PATCH',{paused:true,confirm:true}))).status,200);
    const creator=load('src/lib/booking-creation.ts',mocks);
    const guest={name:'Synthetic walkin',phone:'01012345677',party_size:2,seating_preference:'any'};
    assert.equal((await creator.createBookingPostgres(guest,{source:'qr'})).error,'paused');
    await db.exec("SELECT setval(pg_get_serial_sequence('guests','id'),100)");
    assert.ok((await creator.createBookingPostgres(guest,{source:'staff'})).id);
    await db.exec(`INSERT INTO whatsapp_booking_consents(guest_id,phone,consent_version,subscription_token_hash,subscription_expires_at,subscribed_at)
      VALUES (1,'201012345678','test','fake',NOW(),NOW());
      INSERT INTO whatsapp_notifications(id,guest_id,kind,due_at,status,last_error)
      VALUES ('00000000-0000-4000-8000-000000000001',1,'review',NOW(),'failed','secret-do-not-expose');`);
    const response=await route.GET();assert.equal(response.status,200);
    const body=await response.json();
    assert.equal(body.paused,true);assert.equal(body.accuracy.samples,2);assert.equal(body.accuracy.estimated_samples,1);
    assert.equal(body.whatsapp.configured.live,false);
    assert.ok(body.whatsapp.blockers.some(s=>s.includes('simulated')));
    assert.equal(body.whatsapp.jobs[0].window_open,false);
    assert.equal(body.whatsapp.jobs[0].delivery,null);
    assert.equal(JSON.stringify(body).includes('secret-do-not-expose'),false);
    assert.equal(JSON.stringify(body).includes('201012345678'),false);
    const pauseEvent=body.activity.find(e=>e.event==='public_waitlist_changed');
    assert.equal(pauseEvent.actor,'Test manager');
    assert.equal((await route.PATCH(request('PATCH',{paused:false,confirm:true}))).status,200);
    assert.equal((await (await route.GET()).json()).paused,false);
    // Raw guest cleanup does not erase non-identifying accuracy samples.
    await db.exec('DELETE FROM guests WHERE id=1');
    assert.equal((await db.query('SELECT COUNT(*)::int AS n FROM wait_accuracy_samples')).rows[0].n,2);
    const bulk=load('src/lib/staff-activity.ts',mocks);
    await sql.begin(tx=>bulk.recordBulkActivity(tx,1,'cancel_queue'));
    assert.equal((await db.query("SELECT actor_id FROM staff_activity_events WHERE event='cancel_queue'")).rows[0].actor_id,1);
    await db.exec(`CREATE FUNCTION fail_synthetic_audit() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'synthetic audit failure'; END $$;
      CREATE TRIGGER fail_synthetic_audit BEFORE INSERT ON staff_activity_events
      FOR EACH ROW EXECUTE FUNCTION fail_synthetic_audit();`);
    await assert.rejects(db.exec('UPDATE guests SET confirmed=1 WHERE id=3'),/synthetic audit failure/);
    assert.equal((await db.query('SELECT confirmed FROM guests WHERE id=3')).rows[0].confirmed,0);
  } finally { await db.close(); }
});

test('operations endpoint rejects unauthorized users, cross-origin mutations and unconfirmed changes',async()=>{
  for(const actor of [null,{id:2,role:'waiter'},{id:3,role:'reception'}]) {
    const h=harness({actor});
    assert.equal((await h.route('management/operations').GET()).status,403);
    assert.equal((await h.route('management/operations').PATCH(request('PATCH',{paused:true,confirm:true}))).status,403);
    assert.equal(h.queries.length,0);
  }
  for(const body of [{paused:true},{paused:'true',confirm:true},{paused:true,confirm:true,actor_id:1}]) {
    const h=harness();assert.equal((await h.route('management/operations').PATCH(request('PATCH',body))).status,400);assert.equal(h.queries.length,0);
  }
  const h=harness();assert.equal((await h.route('management/operations').PATCH(request('PATCH',{paused:true,confirm:true},{origin:'https://evil.test'}))).status,403);
  assert.equal(h.queries.length,0);
  const inactive=harness({license:false});assert.equal((await inactive.route('management/operations').PATCH(request('PATCH',{paused:true,confirm:true}))).status,403);
});

test('missing operations migration reports unavailable sections without claiming historic activity',async()=>{
  const h=harness({query:q=>q.includes('to_regclass')?[{activity:false,accuracy:false,notifications:false,delivery:false,consents:false,windows:false}]:[]});
  const response=await h.route('management/operations').GET();assert.equal(response.status,200);
  const body=await response.json();assert.equal(body.accuracy,null);assert.equal(body.activityAvailable,false);assert.deepEqual(body.activity,[]);
  assert.equal(h.queries.some(q=>q.query.includes('FROM public.wait_accuracy_samples')),false);
});
