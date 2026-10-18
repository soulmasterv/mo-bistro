import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {load} from './handler-harness.mjs';
const baseEnv={MO_BISTRO_DB:'postgres',VERCEL_ENV:'preview'};
function adapter(executor){const sql=async(strings,...values)=>{
 const text=strings.reduce((all,part,i)=>all+(i?'$'+i:'')+part,'');
 if(text.includes('pg_advisory_xact_lock'))return [];
 return(await executor.query(text,values.map(v=>v instanceof Date?v.toISOString():v))).rows;
};sql.begin=cb=>executor.transaction(tx=>cb(adapter(tx)));return sql;}
async function setup(){const db=new PGlite();
 for(const file of ['001_postgres_schema.sql','20261012_whatsapp_notifications.sql','20261013_whatsapp_customer_windows.sql','20261018_advanced_preview_features.sql'])await db.exec(fs.readFileSync('migrations/'+file,'utf8'));
 return {db,sql:adapter(db)};
}

test('four flags default OFF and cannot enable these features outside Advanced Preview',()=>{
 for(const env of [baseEnv,{...baseEnv,ADV_WA_WAIT_ESTIMATE:'true',VERCEL_ENV:'production'}]){
  const flags=load('src/lib/advanced/flags.ts',{}, {process:{env}});
  for(const key of ['waitEstimate','reminders','tableOverride','tableEditor'])assert.equal(flags.advancedEnabled(key),false);
 }
 const config=load('src/lib/advanced/flags.ts',{}, {process:{env:{...baseEnv,ADV_WA_PRE_NOTIFY_MAX_MESSAGES:'4'}}}).advancedConfig();
 assert.equal(config.preNotifyMax,4);assert.equal(config.minSamples,10);
});

test('additive migration creates feature data without rewriting original records',async()=>{
 const db=new PGlite();try{
  for(const file of ['001_postgres_schema.sql','20261012_whatsapp_notifications.sql'])await db.exec(fs.readFileSync('migrations/'+file,'utf8'));
  await db.query("INSERT INTO restaurant_tables(name,seats,area) VALUES('Existing',4,'indoor')");
  const before=(await db.query('SELECT id,name,seats,area,status,updated_at FROM restaurant_tables')).rows;
  const migration=fs.readFileSync('migrations/20261018_advanced_preview_features.sql','utf8');
  assert.doesNotMatch(migration,/\b(?:DELETE\s+FROM|TRUNCATE|DROP\s+TABLE|UPDATE\s+public\.)/i);
  await db.exec(migration);assert.deepEqual((await db.query('SELECT id,name,seats,area,status,updated_at FROM restaurant_tables')).rows,before);
 }finally{await db.close();}
});

test('fewer than ten matching completed parties yields plain acknowledgement; median snapshot is stable',async()=>{
 const {db,sql}=await setup();try{
  const env={...baseEnv,ADV_WA_WAIT_ESTIMATE:'true'};
  const estimates=load('src/lib/advanced/estimates.ts',{}, {process:{env}});
  const [guest]=await sql`INSERT INTO guests(name,phone,party_size,seating_preference) VALUES('Synthetic','01000000001',2,'indoor') RETURNING id`;
  const makeJob=async()=>{const id=randomUUID();await sql`INSERT INTO whatsapp_notifications(id,guest_id,kind,due_at) VALUES(${id},${guest.id},'confirmation',NOW())`;return id;};
  // A different size must not contribute to this booking's cohort.
  await db.exec("INSERT INTO guests(name,phone,party_size,seating_preference,status,created_at,seated_at) SELECT 'History','01000000002',4,'indoor','seated',(NOW()-INTERVAL '25 minutes')::text,NOW() FROM generate_series(1,20)");
  for(let n=0;n<9;n++)await db.exec("INSERT INTO guests(name,phone,party_size,seating_preference,status,created_at,seated_at) VALUES('History','01000000003',2,'indoor','seated',(NOW()-INTERVAL '25 minutes')::text,NOW())");
  const first=await makeJob();assert.equal(await estimates.confirmationEstimate(sql,first,guest.id),null);
  const [snapshot]=await sql`SELECT sample_count,reason FROM advanced_wait_estimates WHERE notification_id=${first}`;
  assert.equal(snapshot.sample_count,9);assert.equal(snapshot.reason,'insufficient_history');
  const payloads=[];
  const windowSender=load('src/lib/whatsapp/customer-window.ts',{'@/lib/whatsapp/transport':{requestMetaTemplate:async payload=>{payloads.push(payload);return {state:'sent'};}}},
   {process:{env:{...reminderEnv,ADV_WA_WAIT_ESTIMATE:'true'}}});
  await sql`INSERT INTO whatsapp_customer_windows(phone,phone_number_id,last_inbound_at) VALUES('201000000001','1234',NOW())`;
  const booking={name:'Synthetic',phone:'201000000001',subscribed_at:new Date()};
  await windowSender.sendWindowNotification(sql,{id:first,guest_id:guest.id,kind:'confirmation'},booking,'unused');
  assert.match(payloads[0].text.body,/thanks for joining/i);assert.doesNotMatch(payloads[0].text.body,/Estimated wait|an estimate/);
  await db.exec("INSERT INTO guests(name,phone,party_size,seating_preference,status,created_at,seated_at) VALUES('History','01000000004',2,'indoor','seated',(NOW()-INTERVAL '25 minutes')::text,NOW())");
  // Existing acknowledgement stays plain on retries, even if history changes.
  assert.equal(await estimates.confirmationEstimate(sql,first,guest.id),null);
  await sql`DELETE FROM whatsapp_notifications WHERE id=${first}`;
  const second=await makeJob();const text=await estimates.confirmationEstimate(sql,second,guest.id);
  assert.match(text,/about 20-30 min \(an estimate\)/);
  await windowSender.sendWindowNotification(sql,{id:second,guest_id:guest.id,kind:'confirmation'},booking,'unused');
  assert.match(payloads[1].text.body,/Estimated wait: about 20-30 min \(an estimate\)/);
 }finally{await db.close();}
});

const reminderEnv={...baseEnv,ADV_WA_REMINDERS:'true',WHATSAPP_ENABLED:'true',WHATSAPP_MODE:'live',WHATSAPP_ALLOW_LIVE_SEND:'true',WHATSAPP_WINDOW_TEXT_ENABLED:'true',WHATSAPP_TEST_RECIPIENT:'201000000001',META_WHATSAPP_PHONE_NUMBER_ID:'1234'};
async function reminderFixture(){
 const {db,sql}=await setup(),sent=[];
 const [guest]=await sql`INSERT INTO guests(name,phone,party_size,seating_preference,confirmed,created_at)
  VALUES('Synthetic','01000000001',2,'indoor',1,(NOW()-INTERVAL '11 minutes')::text) RETURNING id`;
 await sql`INSERT INTO whatsapp_booking_consents(guest_id,phone,confirmation_consent,consent_version,subscription_token_hash,subscription_expires_at,subscribed_at)
  VALUES(${guest.id},'201000000001',TRUE,'test','test',NOW()+INTERVAL '1 day',NOW())`;
 await sql`INSERT INTO whatsapp_customer_windows(phone,phone_number_id,last_inbound_at) VALUES('201000000001','1234',NOW())`;
 const env={...reminderEnv};
 const mocks={'@/lib/postgres-db':{getPostgres:()=>sql},'@/lib/confirmation-policy':{confirmationRequired:async()=>true},
  '@/lib/whatsapp/transport':{requestMetaTemplate:async payload=>{sent.push(payload);return {state:'sent',messageId:'synthetic:'+sent.length};},publishAdvancedReminder:async()=>({messageId:'synthetic-schedule'})}};
 const reminders=load('src/lib/advanced/reminders.ts',mocks,{process:{env}});
 return {db,sql,guest,sent,reminders,env,mocks};
}

test('position becomes one twice: one next job and one send; reminder contains no estimate',async()=>{
 const {db,sql,guest,sent,reminders}=await reminderFixture();try{
  await reminders.prepareReminderJobs();
  await reminders.prepareReminderJobs();
  const jobs=await sql`SELECT id FROM advanced_reminder_jobs WHERE guest_id=${guest.id} AND kind='next'`;
  assert.equal(jobs.length,1);
  await reminders.deliverReminder(jobs[0].id);await reminders.deliverReminder(jobs[0].id);
  // Leaving/re-entering first position must not rearm the one-per-party notification.
  await sql`UPDATE guests SET status='called' WHERE id=${guest.id}`;
  await reminders.prepareReminderJobs();
  await sql`UPDATE guests SET status='waiting' WHERE id=${guest.id}`;
  await reminders.prepareReminderJobs();await reminders.deliverReminder(jobs[0].id);
  assert.equal(sent.length,1);assert.match(sent[0].text.body,/next in the queue/);
  assert.doesNotMatch(sent[0].text.body,/estimate|\d+\s*(?:min|minute)|ETA/i);
  const events=await sql`SELECT state FROM advanced_reminder_events WHERE job_id=${jobs[0].id}`;
  assert.deepEqual(events.map(e=>e.state),['sent']);
 }finally{await db.close();}
});

test('acknowledgement plus two reminders respects the configurable pre-Notify cap',async()=>{
 const {db,sql,guest,sent,reminders,env,mocks}=await reminderFixture();try{
  await sql`INSERT INTO whatsapp_notifications(id,guest_id,kind,due_at,status) VALUES(${randomUUID()},${guest.id},'confirmation',NOW(),'sent')`;
  await reminders.dispatchReminders();assert.equal(sent.length,2);
  assert.equal(await reminders.preNotifyBudget(sql,guest.id),false);
  const lower=load('src/lib/advanced/reminders.ts',mocks,{process:{env:{...env,ADV_WA_PRE_NOTIFY_MAX_MESSAGES:'2'}}});
  await sql`UPDATE advanced_reminder_jobs SET status='pending' WHERE kind='timer'`;
  const [timer]=await sql`SELECT id FROM advanced_reminder_jobs WHERE kind='timer'`;
  await lower.deliverReminder(timer.id);assert.equal(sent.length,2);
  const [row]=await sql`SELECT status,reason FROM advanced_reminder_jobs WHERE id=${timer.id}`;
  assert.equal(row.status,'skipped');assert.equal(row.reason,'pre_notify_budget_exhausted');
 }finally{await db.close();}
});

test('STOP, opt-out, closed/wrong-business windows, non-waiting and Preview recipient gates log skips',async()=>{
 const {db,sql,guest,sent,reminders,env}=await reminderFixture();try{
  const cases=[
   ["UPDATE whatsapp_booking_consents SET subscribed_at=NULL",'no_opt_in'],
   ["UPDATE whatsapp_booking_consents SET unsubscribed_at=NOW()",'no_opt_in'],
   ["INSERT INTO whatsapp_contact_preferences(phone,opted_out_at) VALUES('201000000001',NOW())",'opted_out'],
   ["UPDATE whatsapp_customer_windows SET last_inbound_at=NOW()-INTERVAL '25 hours'",'customer_window_closed'],
   ["UPDATE whatsapp_customer_windows SET phone_number_id='another-business'",'customer_window_closed'],
   ["UPDATE guests SET status='called'",'not_waiting'],
  ];
  for(const [mutation,reason] of cases){
   try{
    await db.exec(mutation);
    const id=randomUUID();await sql`INSERT INTO advanced_reminder_jobs(id,guest_id,kind,due_at) VALUES(${id},${guest.id},'timer',NOW())`;
    await reminders.deliverReminder(id);
    const [row]=await sql`SELECT status,reason FROM advanced_reminder_jobs WHERE id=${id}`;
    assert.equal(row.status,'skipped');assert.equal(row.reason,reason);
    assert.equal((await sql`SELECT reason FROM advanced_reminder_events WHERE job_id=${id}`)[0].reason,reason);
   }finally{await db.exec("DELETE FROM advanced_reminder_jobs; DELETE FROM whatsapp_contact_preferences; UPDATE guests SET status='waiting'; UPDATE whatsapp_booking_consents SET subscribed_at=NOW(),unsubscribed_at=NULL; UPDATE whatsapp_customer_windows SET last_inbound_at=NOW(),phone_number_id='1234'");}
  }
  env.WHATSAPP_TEST_RECIPIENT='201000000002';
  await reminders.prepareReminderJobs();
  const [job]=await sql`SELECT id FROM advanced_reminder_jobs WHERE kind='next'`;
  await reminders.deliverReminder(job.id);
  assert.equal((await sql`SELECT reason FROM advanced_reminder_jobs WHERE id=${job.id}`)[0].reason,'preview_recipient_not_allowed');
  assert.equal(sent.length,0);
 }finally{await db.close();}
});

test('future timer is durably scheduled, early callback retries, duplicate callback sends once',async()=>{
 const fixture=await reminderFixture();const {db,sql,guest,sent,env,mocks}=fixture;try{
  await sql`UPDATE guests SET created_at=NOW()::text WHERE id=${guest.id}`;
  const published=[];mocks['@/lib/whatsapp/transport'].publishAdvancedReminder=async(id,due)=>{published.push({id,due});return {messageId:'test:'+id};};
  const reminders=load('src/lib/advanced/reminders.ts',mocks,{process:{env}});
  await reminders.dispatchReminders();await reminders.dispatchReminders();
  const [timer]=await sql`SELECT id,qstash_message_id,due_at FROM advanced_reminder_jobs WHERE kind='timer'`;
  assert.ok(timer.qstash_message_id);assert.equal(published.filter(p=>p.id===timer.id).length,1);
  assert.equal(await reminders.deliverReminder(timer.id),'retry');
  await sql`UPDATE advanced_reminder_jobs SET due_at=NOW() WHERE id=${timer.id}`;
  await reminders.deliverReminder(timer.id);await reminders.deliverReminder(timer.id);
  assert.equal(sent.length,2);assert.doesNotMatch(sent[1].text.body,/estimate|ETA|\d+\s*min/i);
 }finally{await db.close();}
});

test('table add/edit/archive and override are audited; occupied tables and stale edits are rejected',async()=>{
 const {db,sql}=await setup();try{
  const actor={id:1,username:'synthetic-manager',role:'manager'};
  const tables=load('src/lib/advanced/tables.ts',{'@/lib/postgres-db':{getPostgres:()=>sql}});
  const added=await tables.changeTable(actor,{name:'Synthetic table',seats:4,area:'indoor'});
  await tables.changeTable(actor,{name:'Renamed',seats:6,area:'outdoor'},added.id,0);
  await assert.rejects(tables.changeTable(actor,{name:'Stale',seats:2,area:'indoor'},added.id,0),/changed/);
  await sql`UPDATE restaurant_tables SET status='occupied' WHERE id=${added.id}`;
  await assert.rejects(tables.changeTable(actor,null,added.id,1),/free/);
  await sql`UPDATE restaurant_tables SET status='free' WHERE id=${added.id}`;
  const override=await tables.setTableOverride(actor,'outdoor',2,0);assert.equal(override.revision,1);
  await assert.rejects(tables.setTableOverride(actor,'outdoor',1,0),/changed/);
  const guests=[{id:1,party_size:4,seating_preference:'outdoor',status:'waiting'},{id:2,party_size:8,seating_preference:'outdoor',status:'waiting'},{id:3,party_size:2,seating_preference:'indoor',status:'waiting'}];
  assert.deepEqual([...await tables.availableFit(guests)],[1]);
  await tables.changeTable(actor,null,added.id,1);
  assert.deepEqual([...await tables.availableFit(guests)],[]);
  const audit=await sql`SELECT action,actor_staff_id,actor_username,before_value,after_value FROM advanced_table_events ORDER BY id`;
  assert.deepEqual(audit.map(r=>r.action),['add','edit','override','archive']);
  assert.ok(audit.every(r=>r.actor_staff_id===1&&r.actor_username===actor.username));
  assert.equal(audit[1].before_value.name,'Synthetic table');assert.equal(audit[1].after_value.name,'Renamed');
  assert.ok((await sql`SELECT advanced_archived_at FROM restaurant_tables WHERE id=${added.id}`)[0].advanced_archived_at);
 }finally{await db.close();}
});

test('new endpoints are disabled by default, role-gated, origin-checked and callbacks require signatures',async()=>{
 let actor={id:1,username:'synthetic',role:'waiter'},sqlCalls=0;
 const env={...baseEnv};
 const mocks={
  '@/lib/postgres-db':{getPostgres:()=>{sqlCalls++;throw Error('Should not reach DB');}},
  '@/lib/staff-auth':{currentStaff:async()=>actor},
  '@/lib/licensing/enforce':{requireActiveLicense:async()=>null},
  '@/lib/whatsapp/transport':{verifyQstash:async()=>false},
 };
 const tables=load('src/app/api/advanced/tables/route.ts',mocks,{process:{env}});
 const overrides=load('src/app/api/advanced/table-overrides/route.ts',mocks,{process:{env}});
 assert.equal((await tables.GET()).status,404);assert.equal((await overrides.GET()).status,404);
 env.ADV_TABLE_EDITOR='true';env.ADV_TABLE_OVERRIDE='true';env.ADV_WA_REMINDERS='true';
 assert.equal((await tables.GET()).status,403);assert.equal((await overrides.GET()).status,403);
 actor={...actor,role:'reception'};assert.equal((await tables.POST(new Request('https://preview.example/api/advanced/tables',{method:'POST'}))).status,403);
 actor={...actor,role:'manager'};
 const crossSite=()=>new Request('https://preview.example/api/advanced/tables',{method:'POST',headers:{'sec-fetch-site':'cross-site'}});
 assert.equal((await tables.POST(crossSite())).status,403);assert.equal((await overrides.PUT(crossSite())).status,403);
 const callback=load('src/app/api/advanced/reminders/jobs/route.ts',mocks,{process:{env}});
 assert.equal((await callback.POST(new Request('https://preview.example/api/advanced/reminders/jobs',{method:'POST',body:JSON.stringify({reminderId:randomUUID()})}))).status,401);
 assert.equal(sqlCalls,0);
});

test('definitive failures and uncertain reminder sends are logged and never automatically resent',async()=>{
 const {db,sql,guest,sent,env,mocks}=await reminderFixture();try{
  let attempts=0;
  mocks['@/lib/whatsapp/transport'].requestMetaTemplate=async()=>{attempts++;return attempts===1?{state:'failed',error:'meta_rejected_400'}:{state:'unknown',error:'meta_network_acceptance_unknown'};};
  const reminders=load('src/lib/advanced/reminders.ts',mocks,{process:{env}});
  await reminders.prepareReminderJobs();
  for(const job of await sql`SELECT id FROM advanced_reminder_jobs WHERE guest_id=${guest.id} ORDER BY kind`){await reminders.deliverReminder(job.id);await reminders.deliverReminder(job.id);}
  assert.equal(attempts,2);assert.equal(sent.length,0);
  const events=await sql`SELECT state,reason FROM advanced_reminder_events ORDER BY id`;
  assert.deepEqual(events.map(e=>e.state),['failed','unknown']);
  assert.deepEqual(events.map(e=>e.reason),['meta_rejected_400','meta_network_acceptance_unknown']);
 }finally{await db.close();}
});
