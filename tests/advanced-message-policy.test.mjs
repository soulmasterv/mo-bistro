import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {load,harness,request,context} from './handler-harness.mjs';
const envBase={MO_BISTRO_DB:'postgres',VERCEL_ENV:'preview',WHATSAPP_ENABLED:'true',WHATSAPP_MODE:'live',WHATSAPP_ALLOW_LIVE_SEND:'true',WHATSAPP_WINDOW_TEXT_ENABLED:'true',WHATSAPP_TEST_RECIPIENT:'201000000001',META_WHATSAPP_PHONE_NUMBER_ID:'1234',WHATSAPP_ASSOCIATION_SECRET:'synthetic-only-association-key-at-least-32'};
function adapter(db){const sql=async(strings,...values)=>{const text=strings.reduce((all,p,i)=>all+(i?'$'+i:'')+p,'');if(text.includes('pg_advisory_xact_lock'))return [];return(await db.query(text,values.map(v=>v instanceof Date?v.toISOString():v))).rows;};sql.begin=cb=>db.transaction(tx=>cb(adapter(tx)));return sql;}
async function fixture(){
 const db=new PGlite();for(const file of ['001_postgres_schema.sql','20261010_guest_manual_eta.sql','20261012_whatsapp_notifications.sql','20261013_whatsapp_customer_windows.sql','20261015_whatsapp_eta_updates.sql','20261018_advanced_preview_features.sql'])await db.exec(fs.readFileSync('migrations/'+file,'utf8'));
 const sql=adapter(db),env={...envBase},sent=[],afters=[];
 const [guest]=await sql`INSERT INTO guests(name,phone,party_size,tracking_token_hash,seating_preference,confirmed,eta_at)
  VALUES('Omar Mohsen','01000000001',2,${'a'.repeat(64)},'indoor',1,NOW()+INTERVAL '15 minutes') RETURNING id,eta_at`;
 await sql`INSERT INTO whatsapp_booking_consents(guest_id,phone,confirmation_consent,feedback_consent,consent_version,subscription_token_hash,subscription_expires_at,subscribed_at)
  VALUES(${guest.id},'201000000001',TRUE,TRUE,'test','test',NOW()+INTERVAL '1 day',NOW())`;
 await sql`INSERT INTO whatsapp_customer_windows(phone,phone_number_id,last_inbound_at) VALUES('201000000001','1234',NOW())`;
 const h=harness();Object.assign(h.mocks,{'@/lib/guest-eta-support':{hasGuestEtaColumn:async()=>true},'@/lib/postgres-db':{getPostgres:()=>sql},'@/lib/whatsapp/transport':{
  requestMetaTemplate:async payload=>{sent.push(payload);return {state:'sent',messageId:'synthetic:'+sent.length};},publishJob:async()=>({messageId:'synthetic-job'}),publishAdvancedReminder:async()=>({messageId:'synthetic-reminder'}),
 },'next/server':{NextResponse:{json:(body,init)=>Response.json(body,init)},after:callback=>afters.push(callback)}});
 const module=file=>load(file,h.mocks,{process:{env}});
 const service=module('src/lib/whatsapp/service.ts'),manual=module('src/lib/advanced/manual-nearly-ready.ts');
 const job=async(kind,options={})=>{const id=randomUUID();await sql`INSERT INTO whatsapp_notifications(id,guest_id,kind,due_at,event_key,eta_snapshot_at)
  VALUES(${id},${guest.id},${kind},NOW(),${options.event??(kind==='eta_update'?randomUUID():null)},${kind==='eta_update'||kind==='almost_ready'?guest.eta_at:null})`;return id;};
 return {db,sql,guest,env,sent,service,manual,module,job,afters};
}

test('greetings handle Arabic, emoji, URLs, missing names and very long names without changing stored names',()=>{
 const copy=load('src/lib/advanced/message-copy.ts');
 for(const [value,expected] of [['Omar Mohsen','Hi Omar,'],['أحمد محمد','Hi أحمد,'],['😊 Omar Mohsen','Hi Omar,'],['https://evil.example/x Omar','Hi Omar,'],['www.evil.example Omar','Hi Omar,'],['Omar evil.example/x','Hi Omar,'],[null,'Hi there,'],['','Hi there,'],['😊 https://evil.example','Hi there,']])assert.equal(copy.greeting(value),expected);
 assert.equal(Array.from(copy.firstName('أ'.repeat(300))).length,24);
 const texts=[copy.acknowledgement('Omar Mohsen',98,'about 20-30 min (an estimate)'),copy.reminderCopy('timer','Omar Mohsen',98),copy.reminderCopy('next','Omar Mohsen',98),copy.etaCopy('Omar Mohsen',98,15),copy.nearlyReadyCopy('Omar Mohsen',98),copy.reviewCopy('Omar Mohsen'),copy.tableReadyCopy('Omar Mohsen',98)];
 assert.ok(texts.every(t=>t.startsWith('Hi Omar,')&&!t.includes('Mohsen')&&!/UNSUBSCRIBE|reply STOP/.test(t)));
 assert.match(texts[0],/20-30 min \(an estimate\)/);assert.match(texts[3],/about 15 minutes \(an estimate\)/);assert.doesNotMatch(texts[3],/AM|PM|\d:\d/);
 assert.match(texts[6],/come to reception and mention booking #98/);assert.doesNotMatch(texts[6],/hold|reserve/i);
});

test('relative ETA sends once, uses a safe first name and has no unsubscribe footer',async()=>{
 const f=await fixture();try{
  const id=await f.job('eta_update');await f.service.deliverNotification(id,1);await f.service.deliverNotification(id,1);
  assert.equal(f.sent.length,1);assert.match(f.sent[0].text.body,/Hi Omar,/);assert.match(f.sent[0].text.body,/about 15 minutes \(an estimate\)/);
  assert.doesNotMatch(f.sent[0].text.body,/Mohsen|UNSUBSCRIBE|STOP|\d:\d/);
  assert.equal((await f.sql`SELECT event FROM whatsapp_delivery_logs WHERE notification_id=${id} ORDER BY id DESC LIMIT 1`)[0].event,'sent');
 }finally{await f.db.close();}
});

test('no automatic nearly-ready scheduling; old automatic callbacks skip with a logged reason',async()=>{
 const f=await fixture();try{
  await f.service.scheduleAlmostReady(f.sql,f.guest.id,new Date(f.guest.eta_at));
  assert.equal((await f.sql`SELECT count(*)::int AS count FROM whatsapp_notifications`)[0].count,0);
  const id=await f.job('almost_ready');await f.service.deliverNotification(id,1);assert.equal(f.sent.length,0);
  assert.equal((await f.sql`SELECT status,last_error FROM whatsapp_notifications WHERE id=${id}`)[0].last_error,'manual_only');
  assert.equal((await f.sql`SELECT error_code FROM whatsapp_delivery_logs WHERE notification_id=${id}`)[0].error_code,'manual_only');
 }finally{await f.db.close();}
});

test('staff manual nearly-ready saves ten minutes, sends immediately once and logs the staff request',async()=>{
 const f=await fixture();try{
  const route=f.module('src/app/api/guests/[id]/eta/route.ts'),requestId=randomUUID();
  let response=await route.PATCH(request('PATCH',{minutes:10,message:'almost_ready',requestId}),context(f.guest.id));
  assert.equal(response.status,200);const first=await response.json();assert.equal(first.manual_nearly_ready,'queued');
  const repeat=await route.PATCH(request('PATCH',{minutes:10,message:'almost_ready',requestId:randomUUID()}),context(f.guest.id));
  assert.equal(repeat.status,200);assert.equal((await repeat.json()).eta_at,first.eta_at);
  const [job]=await f.sql`SELECT id,event_key FROM whatsapp_notifications WHERE guest_id=${f.guest.id}`;
  assert.equal(job.event_key,f.manual.manualNearlyReadyKey(f.guest.id));
  await f.service.deliverNotification(job.id,1);await f.service.deliverNotification(job.id,1);assert.equal(f.sent.length,1);
  assert.match(f.sent[0].text.body,/about 10 minutes \(an estimate\)/);
  response=await route.PATCH(request('PATCH',{minutes:10,message:'almost_ready',requestId}),context(f.guest.id));assert.equal(response.status,200);
  response=await route.PATCH(request('PATCH',{minutes:10,message:'almost_ready',requestId:randomUUID()}),context(f.guest.id));assert.equal(response.status,200);assert.equal((await response.json()).manual_nearly_ready,'already_requested_or_disabled');
  assert.equal((await f.sql`SELECT count(*)::int AS count FROM whatsapp_notifications`)[0].count,1);
  assert.ok((await f.sql`SELECT event FROM whatsapp_delivery_logs WHERE notification_id=${job.id}`).some(row=>row.event==='manual_requested_by_staff:1'));
 }finally{await f.db.close();}
});

test('a delayed nearly-ready request skips rather than repeating a stale ten-minute promise',async()=>{
 const f=await fixture();try{
  const [row]=await f.sql`UPDATE guests SET eta_at=NOW()+INTERVAL '5 minutes' WHERE id=${f.guest.id} RETURNING eta_at`;
  await f.manual.queueManualNearlyReady(f.sql,f.guest.id,new Date(row.eta_at),1,randomUUID());
  const [job]=await f.sql`SELECT id FROM whatsapp_notifications`;await f.service.deliverNotification(job.id,1);
  assert.equal(f.sent.length,0);assert.equal((await f.sql`SELECT last_error FROM whatsapp_notifications WHERE id=${job.id}`)[0].last_error,'manual_estimate_stale');
 }finally{await f.db.close();}
});

test('all pre-Notify kinds share the cap, including reminders sent before their flag was turned OFF',async()=>{
 const f=await fixture();try{
  await f.sql`INSERT INTO whatsapp_notifications(id,guest_id,kind,due_at,status) VALUES(${randomUUID()},${f.guest.id},'confirmation',NOW(),'sent')`;
  for(const kind of ['timer','next'])await f.sql`INSERT INTO advanced_reminder_jobs(id,guest_id,kind,due_at,status) VALUES(${randomUUID()},${f.guest.id},${kind},NOW(),'sent')`;
  const id=await f.job('eta_update');await f.service.deliverNotification(id,1);assert.equal(f.sent.length,0);
  assert.equal((await f.sql`SELECT last_error FROM whatsapp_notifications WHERE id=${id}`)[0].last_error,'pre_notify_budget_exhausted');
  const module=f.module('src/lib/advanced/reminders.ts');assert.equal(await module.preNotifyBudget(f.sql,f.guest.id),false);
 }finally{await f.db.close();}
});

test('review only sends once after actual seating with feedback consent, open window and no STOP; button has no link',async()=>{
 const f=await fixture();try{
  const id=await f.job('review');
  const cases=[
   ["UPDATE guests SET status='no_show'",'consent_or_booking_ineligible'],
   ["UPDATE guests SET status='cancelled'",'consent_or_booking_ineligible'],
   ["UPDATE guests SET status='seated',seated_at=NOW()-INTERVAL '61 minutes'; UPDATE whatsapp_booking_consents SET feedback_consent=FALSE",'consent_or_booking_ineligible'],
   ["UPDATE whatsapp_customer_windows SET last_inbound_at=NOW()-INTERVAL '25 hours'",'customer_window_closed'],
   ["INSERT INTO whatsapp_contact_preferences(phone,opted_out_at) VALUES('201000000001',NOW())",'consent_or_booking_ineligible'],
  ];
  for(const [mutation,reason] of cases){
   await f.db.exec(mutation);await f.service.deliverNotification(id,1);assert.equal(f.sent.length,0);
   assert.equal((await f.sql`SELECT last_error FROM whatsapp_notifications WHERE id=${id}`)[0].last_error,reason);
   await f.db.exec("UPDATE guests SET status='seated',seated_at=NOW()-INTERVAL '61 minutes'; UPDATE whatsapp_booking_consents SET feedback_consent=TRUE; UPDATE whatsapp_customer_windows SET last_inbound_at=NOW(); DELETE FROM whatsapp_contact_preferences; UPDATE whatsapp_notifications SET status='pending'");
  }
  await f.service.deliverNotification(id,1);await f.service.deliverNotification(id,1);assert.equal(f.sent.length,1);
  const payload=f.sent[0];assert.equal(payload.type,'interactive');assert.equal(payload.interactive.action.buttons[0].reply.id,'review_placeholder');assert.doesNotMatch(JSON.stringify(payload),/https?:\/\//);
 }finally{await f.db.close();}
});

test('STOP between scheduling and sending blocks a queued manual message; expiry logs instead of template fallback',async()=>{
 const f=await fixture();try{
  await f.manual.queueManualNearlyReady(f.sql,f.guest.id,new Date(f.guest.eta_at),1,randomUUID());
  const [job]=await f.sql`SELECT id FROM whatsapp_notifications`;
  await f.sql`INSERT INTO whatsapp_contact_preferences(phone,opted_out_at) VALUES('201000000001',NOW())`;
  await f.service.deliverNotification(job.id,1);assert.equal(f.sent.length,0);
  await f.sql`DELETE FROM whatsapp_contact_preferences`;
  const eta=await f.job('eta_update');await f.sql`UPDATE whatsapp_customer_windows SET last_inbound_at=NOW()-INTERVAL '25 hours'`;
  await f.service.deliverNotification(eta,1);assert.equal(f.sent.length,0);
  assert.equal((await f.sql`SELECT error_code FROM whatsapp_delivery_logs WHERE notification_id=${eta}`)[0].error_code,'customer_window_closed');
 }finally{await f.db.close();}
});
