import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { load, requireDependency, request } from './handler-harness.mjs';
const { PGlite } = requireDependency('@electric-sql/pglite');
const env = { VERCEL_ENV:'preview', MO_BISTRO_DB:'postgres', DATABASE_CLEANUP_SECRET:'synthetic-test-secret-with-32-characters' };
function adapter(db, options={}) {
  const sql=async(strings,...values)=>{
    const query=strings.reduce((text,part,i)=>text+part+(i<values.length?'$'+(i+1):''),'');
    if(query.includes('pg_advisory_xact_lock')) return []; // Embedded PG has no concurrent sessions; not a concurrency test.
    if(query.includes('current_database()')) return [{name: options.database ?? 'mo_bistro_2'}];
    if(options.fail && query.includes('DELETE FROM public.qr_registration_permits')) throw Error('Synthetic failure');
    return (await db.query(query,values)).rows;
  };
  sql.begin=fn=>db.transaction(tx=>fn(adapter(tx,options)));
  return sql;
}
function service(sql, environment=env) {
  return load('src/lib/database-cleanup.ts',{'@/lib/postgres-db':{getPostgres:()=>sql}}, {process:{env:environment}});
}

test('migration-backed cleanup removes only eligible history; preserves live data, suppression, deduplication and capacity',async()=>{
  const db=new PGlite();
  try {
    for(const name of ['001_postgres_schema.sql','20261013_core_support.sql','20261012_simple_inventory.sql','20261012_whatsapp_notifications.sql','20261013_whatsapp_customer_windows.sql'])
      await db.exec(fs.readFileSync('migrations/'+name,'utf8'));
    await db.exec(`INSERT INTO staff_users(username,role,credential_hash) VALUES ('synthetic','manager','fake');
      INSERT INTO restaurant_tables(name,seats,status) VALUES ('Held table',4,'occupied');
      INSERT INTO guests(id,name,phone,party_size,status,seated_at,table_id) VALUES
       (1,'Old seated','201000000001',2,'seated',NOW()-INTERVAL '4 days',NULL),
       (2,'Recent seated','201000000002',2,'seated',NOW()-INTERVAL '2 days',NULL),
       (3,'Waiting','201000000003',2,'waiting',NOW()-INTERVAL '4 days',NULL),
       (4,'Called','201000000004',2,'called',NOW()-INTERVAL '4 days',NULL),
       (5,'Missing timestamp','201000000005',2,'seated',NULL,NULL),
       (6,'Occupied','201000000006',2,'seated',NOW()-INTERVAL '4 days',1),
       (7,'Unknown delivery','201000000007',2,'seated',NOW()-INTERVAL '4 days',NULL),
       (8,'Queued review','201000000008',2,'seated',NOW()-INTERVAL '4 days',NULL),
       (9,'Still sending','201000000009',2,'seated',NOW()-INTERVAL '4 days',NULL),
       (10,'Unreleased history','201000000010',2,'seated',NOW()-INTERVAL '4 days',NULL);
      INSERT INTO seating_history(guest_id,table_id,released_at) VALUES (1,1,CURRENT_TIMESTAMP),(10,1,NULL);
      INSERT INTO whatsapp_booking_consents(guest_id,phone,consent_version,subscription_token_hash,subscription_expires_at)
        SELECT id,phone,'test','test',NOW() FROM guests;
      UPDATE whatsapp_booking_consents SET phone='201000000003' WHERE guest_id=8;
      INSERT INTO whatsapp_notifications(id,guest_id,kind,due_at,status) VALUES
       ('00000000-0000-4000-8000-000000000001',1,'review',NOW(),'sent'),
       ('00000000-0000-4000-8000-000000000007',7,'review',NOW(),'unknown'),
       ('00000000-0000-4000-8000-000000000008',8,'review',NOW(),'scheduled'),
       ('00000000-0000-4000-8000-000000000009',9,'review',NOW(),'sending');
      INSERT INTO whatsapp_delivery_logs(notification_id,event_key,event)
       VALUES ('00000000-0000-4000-8000-000000000001','test-delivery','sent');
      INSERT INTO whatsapp_inbound_events(message_id,phone,guest_id,action)
       VALUES ('original-message','201000000001',1,'subscribe');
      INSERT INTO whatsapp_contact_preferences(phone,opted_out_at) VALUES ('201000000001',NOW());
      INSERT INTO whatsapp_customer_windows(phone,phone_number_id,last_inbound_at)
        VALUES ('201000000001','123',NOW()),('201000000003','123',NOW());
      UPDATE simple_table_capacity SET total_tables=3,occupied_tables=2 WHERE area='indoor';
      INSERT INTO simple_table_events(operation_id,area,kind,actor_id,guest_id) VALUES ('test-event','indoor','occupied',1,1);
      INSERT INTO qr_registration_permits(token_hash,qr_code_hash,qr_expires_at,expires_at)
        VALUES (repeat('a',64),repeat('c',64),1,2),(repeat('b',64),repeat('c',64),1,9999999999999);
      INSERT INTO api_rate_limits VALUES (repeat('a',64),1,1,2),(repeat('b',64),1,1,9999999999999);
      INSERT INTO staff_sessions VALUES ('expired',1,1),('live',1,9999999999999);
      INSERT INTO booking_recovery_requests(query_hash,created_at) VALUES ('old',1),('new',9999999999999);`);
    const sql=adapter(db);
    assert.equal((await service(sql).runDatabaseCleanup()).skipped,true);
    const settingsRoute=load('src/app/api/management/cleanup/route.ts',{
      '@/lib/staff-auth':{currentStaff:async()=>({id:1,role:'manager'})},
      '@/lib/postgres-db':{getPostgres:()=>sql},
    },{process:{env}});
    assert.equal((await (await settingsRoute.GET()).json()).enabled,false);
    assert.equal((await settingsRoute.PATCH(request('PATCH',{enabled:true,confirm:true}))).status,200);
    assert.equal((await (await settingsRoute.GET()).json()).enabled,true);
    // An identity mismatch or later SQL failure must not partially delete anything.
    await assert.rejects(service(adapter(db,{database:'wrong_database'})).runDatabaseCleanup(),/Unexpected/);
    await assert.rejects(service(adapter(db,{fail:true})).runDatabaseCleanup(),/Synthetic/);
    assert.equal((await db.query('SELECT COUNT(*)::int AS n FROM guests')).rows[0].n,10);
    const result=await service(sql).runDatabaseCleanup();
    assert.equal(result.deletedGuests,2);
    assert.equal(result.expiredQrPermits,1); assert.equal(result.expiredRateLimits,1);
    assert.equal(result.expiredSessions,1); assert.equal(result.oldRecoveryRequests,1);
    assert.deepEqual((await db.query('SELECT id FROM guests ORDER BY id')).rows.map(r=>r.id),[2,3,4,5,6,7,9,10]);
    assert.equal((await db.query('SELECT * FROM whatsapp_delivery_logs')).rows.length,0);
    assert.deepEqual((await db.query('SELECT guest_id FROM whatsapp_notifications ORDER BY guest_id')).rows.map(r=>r.guest_id),[7,9]);
    const inbound=(await db.query('SELECT * FROM whatsapp_inbound_events')).rows[0];
    assert.equal(inbound.message_id,'original-message'); assert.equal(inbound.phone,''); assert.equal(inbound.guest_id,null);
    assert.equal((await db.query('SELECT * FROM whatsapp_contact_preferences')).rows.length,1);
    assert.deepEqual((await db.query('SELECT phone FROM whatsapp_customer_windows')).rows.map(r=>r.phone),['201000000003']);
    assert.equal((await db.query('SELECT guest_id FROM simple_table_events')).rows[0].guest_id,null);
    assert.equal((await db.query("SELECT occupied_tables FROM simple_table_capacity WHERE area='indoor'")).rows[0].occupied_tables,2);
    assert.equal((await db.query('SELECT status FROM restaurant_tables')).rows[0].status,'occupied');
    assert.equal((await service(sql).runDatabaseCleanup()).deletedGuests,0);
    assert.equal((await (await settingsRoute.GET()).json()).lastResult.deletedGuests,0);
    assert.equal((await settingsRoute.PATCH(request('PATCH',{enabled:false,confirm:true}))).status,200);
    assert.equal((await service(sql).runDatabaseCleanup()).skipped,true);
  } finally { await db.close(); }
});

test('cleanup scheduler rejects Production, missing secret, bad authorization; never contacts providers',async()=>{
  let runs=0;
  for(const [environment,authorization,expected] of [
    [{...env,VERCEL_ENV:'production'},null,403], [{...env,DATABASE_CLEANUP_SECRET:''},null,503],
    [env,null,401],[env,'Bearer wrong',401],[env,'Bearer '+env.DATABASE_CLEANUP_SECRET,200]]) {
    const realPolicy=service(()=>{throw Error('No database allowed');},environment);
    const route=load('src/app/api/internal/database-cleanup/route.ts',{'@/lib/database-cleanup':{
      cleanupAvailable:realPolicy.cleanupAvailable,runDatabaseCleanup:async()=>{runs++;return {deletedGuests:0};}
    }},{process:{env:environment}});
    assert.equal((await route.POST(request('POST',undefined,authorization?{authorization}:{}))).status,expected);
  }
  assert.equal(runs,1);
  await assert.rejects(service(()=>{throw Error('No SQL');},{...env,VERCEL_ENV:'production'}).runDatabaseCleanup(),/restricted/);
});

test('cleanup preference requires manager, same origin and explicit confirmation',async()=>{
  for(const [actor,body,origin,expected] of [
    [null,{enabled:true,confirm:true},'https://bistro.test',401],
    [{role:'reception'},{enabled:true,confirm:true},'https://bistro.test',403],
    [{role:'manager'},{enabled:true,confirm:true},'https://evil.test',403],
    [{role:'manager'},{enabled:true},'https://bistro.test',400],
    [{role:'manager'},{enabled:true,confirm:true,days:1},'https://bistro.test',400]]) {
    const route=load('src/app/api/management/cleanup/route.ts',{
      '@/lib/staff-auth':{currentStaff:async()=>actor},
      '@/lib/postgres-db':{getPostgres:()=>{throw Error('No SQL allowed');}},
    },{process:{env}});
    assert.equal((await route.PATCH(request('PATCH',body,{origin}))).status,expected);
  }
});
