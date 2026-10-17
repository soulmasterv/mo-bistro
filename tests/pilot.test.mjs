import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {load,harness,request,context,requireDependency} from './handler-harness.mjs';
const {PGlite}=requireDependency('@electric-sql/pglite');
function adapter(db){const sql=async(strings,...values)=>{let q='';strings.forEach((s,i)=>{q+=s;if(i<values.length)q+='$'+(i+1);});return(await db.query(q,values)).rows;};sql.begin=cb=>db.transaction(tx=>cb(adapter(tx)));return sql;}
async function setup(){const db=new PGlite();await db.exec(fs.readFileSync('migrations/20261016_queue_pilot.sql','utf8'));await db.exec(fs.readFileSync('migrations/20261016_pilot_reception_actions.sql','utf8'));await db.exec(fs.readFileSync('migrations/20261017_pilot_measurement.sql','utf8'));await db.exec('CREATE TABLE whatsapp_contact_preferences(phone text PRIMARY KEY,opted_out_at timestamptz); CREATE TABLE whatsapp_customer_windows(phone text,phone_number_id text,last_inbound_at timestamptz);');const h=harness({actor:{id:1,username:'OmarMohsen',role:'manager'}});h.mocks['@/lib/postgres-db']={getPostgres:()=>adapter(db)};
 const config=load('src/lib/pilot/config.ts');h.mocks['./config']=config;
 h.mocks['next/server']={after:()=>{},NextResponse:{json:(body,init)=>Response.json(body,init)}};
 h.mocks['@/lib/pilot/whatsapp']={publishPilotCalls:async()=>{}};
 return {db,h,store:load('src/lib/pilot/store.ts',h.mocks)};}
const input={name:'Synthetic Guest',phone:'01000000001',party_size:2,preference:'indoor',whatsapp_consent:true};
test('Undo countdown uses database time even when the reception device clock is ahead',()=>{
 const {observedPartyTime}=load('src/components/pilot/queue.tsx');const server=Date.parse('2026-10-17T12:00:00Z');
 const party={server_now:new Date(server).toISOString(),received_at:server+28000};
 assert.equal(observedPartyTime(party,server+28000),server);
 assert.equal(observedPartyTime(party,server+30000),server+2000);
 assert.equal(Math.ceil((server+5000-observedPartyTime(party,server+30000))/1000),3);
});
test('Immediate Notify drains pending and legacy scheduled jobs without a scheduler callback, once only',async()=>{
 const {db,h,store}=await setup();try{
  await db.query("INSERT INTO whatsapp_customer_windows VALUES('201000000001','123',clock_timestamp())");
  let sends=0,schedulerRequests=0;
  h.mocks['@/lib/whatsapp/transport']={requestMetaTemplate:async()=>{sends++;return {state:'sent',messageId:'test-accepted'};}};
  const env={MO_BISTRO_DB:'postgres',WHATSAPP_ENABLED:'true',WHATSAPP_MODE:'live',WHATSAPP_ALLOW_LIVE_SEND:'true',WHATSAPP_WINDOW_TEXT_ENABLED:'true',VERCEL_ENV:'preview',WHATSAPP_TEST_RECIPIENT:input.phone,META_WHATSAPP_PHONE_NUMBER_ID:'123'};
  const sender=load('src/lib/pilot/whatsapp.ts',h.mocks,{process:{env},fetch:async()=>{schedulerRequests++;throw Error('No scheduler required');}});
  const p=await store.createParty(input,'qr');await store.transition(p.id,'notify');
  const id=(await db.query('SELECT id FROM pilot_ready_messages')).rows[0].id;
  await db.query("UPDATE pilot_ready_messages SET status='scheduled' WHERE id=$1",[id]);
  await sender.publishPilotCalls(p.id);await sender.deliverPilotCall(id);await sender.publishPilotCalls();
  assert.equal(schedulerRequests,0);assert.equal(sends,1);
  assert.equal((await store.partyStatus(p.token)).status,'called');
  await store.transition(p.id,'seated');
  const next=await store.createParty(input,'qr');await store.transition(next.id,'notify');
  await db.query("UPDATE pilot_ready_messages SET status='sending',attempts=1,updated_at=clock_timestamp()-INTERVAL '2 minutes' WHERE party_id=$1",[next.id]);
  await sender.publishPilotCalls();assert.equal(sends,1);
  assert.equal((await db.query('SELECT status FROM pilot_ready_messages WHERE party_id=$1',[next.id])).rows[0].status,'unknown');
 }finally{await db.close();}
});
test('Failures stay Waiting; definite rejection retries once, unknown acceptance requires a phone fallback',async()=>{
 const {db,h,store}=await setup();try{
  await db.query("INSERT INTO whatsapp_customer_windows VALUES('201000000001','123',clock_timestamp())");
  let sends=0;h.mocks['@/lib/whatsapp/transport']={requestMetaTemplate:async()=>{sends++;return {state:sends===1?'failed':sends===2?'unknown':'sent',error:'synthetic-result',messageId:undefined};}};
  const sender=load('src/lib/pilot/whatsapp.ts',h.mocks,{process:{env:{MO_BISTRO_DB:'postgres',WHATSAPP_ENABLED:'true',WHATSAPP_MODE:'live',WHATSAPP_ALLOW_LIVE_SEND:'true',WHATSAPP_WINDOW_TEXT_ENABLED:'true',VERCEL_ENV:'preview',WHATSAPP_TEST_RECIPIENT:input.phone,META_WHATSAPP_PHONE_NUMBER_ID:'123'}}});
  const party=await store.createParty(input,'qr');await store.transition(party.id,'notify');
  const job=(await db.query('SELECT id FROM pilot_ready_messages')).rows[0].id;
  assert.equal((await store.partyStatus(party.token)).status,'waiting');
  await sender.deliverPilotCall(job);assert.equal((await store.partyStatus(party.token)).status,'waiting');
  assert.equal((await db.query('SELECT called_at FROM pilot_parties')).rows[0].called_at,null);
  const retryId='11111111-1111-4111-8111-111111111112';
  assert.ok((await store.transition(party.id,'retry',undefined,retryId)).success);
  await store.transition(party.id,'retry',undefined,retryId);
  await sender.deliverPilotCall(job);assert.equal(sends,1,'old callback cannot send again');
  await sender.deliverPilotCall(retryId);assert.equal(sends,2);
  assert.equal((await store.transition(party.id,'retry',undefined,'11111111-1111-4111-8111-111111111113')).status,409);
  assert.equal((await store.transition(party.id,'guest_informed')).status,409);
  const callId='11111111-1111-4111-8111-111111111114';
  await store.transition(party.id,'phone_call',undefined,callId);await store.transition(party.id,'phone_call',undefined,callId);
  let row=(await db.query('SELECT * FROM pilot_parties')).rows[0];assert.equal(row.phone_call_taps,1);assert.equal(row.status,'waiting');
  await store.transition(party.id,'guest_informed');row=(await db.query('SELECT * FROM pilot_parties')).rows[0];
  assert.equal(row.status,'called');assert.equal(row.informed_via,'staff_confirmed');assert.ok(row.called_at);
  await sender.deliverPilotCall(retryId);assert.equal(sends,2);
  const exported=(await store.exportRows())[0];assert.equal(exported.notification_attempts,2);assert.equal(exported.notification_outcomes,'failed | unknown');
 }finally{await db.close();}
});
test('All four reasons work from either active state; duplicates remain stored but do not enter measurement CSV',async()=>{
 const {db,store}=await setup();try{
  for(const state of ['waiting','called'])for(const reason of ['guest_cancelled','left_unannounced','no_response','duplicate_test']){
   const p=await store.createParty(input,'qr');
   if(state==='called')await db.query("UPDATE pilot_parties SET status='called',called_at=clock_timestamp() WHERE id=$1",[p.id]);
   const pending=await store.transition(p.id,'remove',reason);assert.ok(pending.undo_token);
   await store.undoExit(p.id,pending.undo_token);assert.equal((await store.partyStatus(p.token)).status,state);
   await store.transition(p.id,'remove',reason);
   await db.query("UPDATE pilot_parties SET pending_exit_at=clock_timestamp()-INTERVAL '1 second' WHERE id=$1",[p.id]);
   await store.finalizePendingExits();
   const row=(await db.query('SELECT * FROM pilot_parties WHERE id=$1',[p.id])).rows[0];assert.equal(row.exit_state,state);assert.equal(row.exit_reason,reason);
  }
  assert.equal((await db.query('SELECT count(*)::int n FROM pilot_parties')).rows[0].n,8);
  const rows=await store.exportRows();assert.equal(rows.length,6);assert.doesNotMatch(store.csv(rows),/duplicate_test|Synthetic Guest|01000000001/);
 }finally{await db.close();}
});
test('Opt-in is idempotent and export distinguishes choice from observed inbound without exposing personal data',async()=>{
 const {db,h,store}=await setup();try{
  const p=await store.createParty({...input,whatsapp_consent:false},'qr');await store.enableReadyAlert(p.token);
  const first=(await db.query('SELECT whatsapp_consent_at FROM pilot_parties')).rows[0].whatsapp_consent_at;
  await store.enableReadyAlert(p.token);assert.equal(String((await db.query('SELECT whatsapp_consent_at FROM pilot_parties')).rows[0].whatsapp_consent_at),String(first));
  assert.equal((await store.partyStatus(p.token)).whatsapp_reply_observed,false);
  await db.query("INSERT INTO whatsapp_customer_windows VALUES('201000000001','123',clock_timestamp())");
  assert.equal((await store.partyStatus(p.token)).whatsapp_reply_observed,false,'wrong business must not count');
  await db.query("INSERT INTO whatsapp_customer_windows VALUES('201000000001','',clock_timestamp()-INTERVAL '1 day')");
  assert.equal((await store.partyStatus(p.token)).whatsapp_reply_observed,false,'old inbound must not count');
  await db.query("UPDATE whatsapp_customer_windows SET last_inbound_at=clock_timestamp() WHERE phone_number_id=''");
  assert.equal((await store.partyStatus(p.token)).whatsapp_reply_observed,true);
  const rows=await store.exportRows();assert.ok(rows[0].whatsapp_consent_at&&rows[0].whatsapp_inbound_after_opt_in_at);
  assert.doesNotMatch(store.csv(rows),/Synthetic Guest|01000000001|tracking_hash/);
  assert.equal((await h.route('pilot/parties/[id]').PATCH(request('PATCH',{action:'phone_call'}),context(p.id))).status,400);
 }finally{await db.close();}
});
test('Pilot records lifecycle, arrival position, source, private status and anonymized CSV',async()=>{const {db,h,store}=await setup();try{
 const first=await store.createParty(input,'qr'),second=await store.createParty({...input,phone:'01000000002'},'walk_in');
 assert.equal(await store.createParty(input,'qr'),null);
 assert.equal((await store.partyStatus(second.token)).position,2);
 assert.equal((await store.partyStatus(second.token)).whatsapp_consent,false);
 assert.equal((await store.partyStatus(first.token)).whatsapp_consent,true);
 assert.equal(await store.enableReadyAlert(second.token),true);
 assert.equal((await db.query('SELECT count(*)::int n FROM pilot_ready_messages')).rows[0].n,0);
 const action=h.route('pilot/parties/[id]');
 assert.equal((await action.PATCH(request('PATCH',{action:'call'}),context(first.id))).status,200);
 const called=(await db.query('SELECT called_at FROM pilot_parties WHERE id=$1',[first.id])).rows[0].called_at;
 await action.PATCH(request('PATCH',{action:'call'}),context(first.id));
 assert.equal(String((await db.query('SELECT called_at FROM pilot_parties WHERE id=$1',[first.id])).rows[0].called_at),String(called));
 assert.equal((await db.query('SELECT count(*)::int n FROM pilot_ready_messages')).rows[0].n,1);
 assert.equal((await store.partyStatus(first.token)).status,'waiting');assert.equal(called,null);
 await store.transition(first.id,'phone_call',undefined,'11111111-1111-4111-8111-111111111111');await db.query("UPDATE pilot_ready_messages SET status='failed' WHERE party_id=$1",[first.id]);await store.transition(first.id,'guest_informed');
 assert.equal((await store.partyStatus(second.token)).position,1);
 await action.PATCH(request('PATCH',{action:'seated'}),context(first.id));
 await action.PATCH(request('PATCH',{action:'left'}),context(second.id));
 await db.query("UPDATE pilot_parties SET pending_exit_at=clock_timestamp()-INTERVAL '1 second' WHERE id=$1",[second.id]);
 assert.equal((await action.PATCH(request('PATCH',{action:'call'}),context(first.id))).status,409);
 assert.equal((await store.listQueue()).length,0);
 const rows=await store.exportRows();assert.ok(rows[0].joined_at&&rows[0].called_at&&rows[0].seated_at);assert.ok(rows[1].left_at);assert.equal(rows[1].source,'walk_in');
 const csv=store.csv(rows);assert.match(csv,/joined_at,called_at,seated_at,left_at/);assert.doesNotMatch(csv,/Synthetic|0100000000|tracking_hash|,name,|,phone,/);
 const statusResponse=await h.route('pilot/status').GET(new Request('https://bistro.test/api/pilot/status?token='+first.token));
 assert.equal(statusResponse.status,200);assert.equal(statusResponse.headers.get('cache-control'),'no-store');assert.doesNotMatch(await statusResponse.text(),/Synthetic|0100000000|tracking_hash/);
 }finally{await db.close();}});
test('Pilot rejects invalid/public staff actions, cross-origin joins and other staff accounts',async()=>{const {db,h}=await setup();try{
 for(const data of [{...input,party_size:0},{...input,phone:'bad'},{...input,preference:'any'},{...input,name:'x'},{...input,role:'manager'}])assert.equal((await h.route('pilot/join').POST(request('POST',data))).status,400);
 assert.equal((await h.route('pilot/join').POST(request('POST',input,{origin:'https://evil.test'}))).status,403);
 h.mocks['@/lib/api-rate-limit']={checkRateLimit:async()=>Response.json({error:'Slow down'},{status:429})};assert.equal((await h.route('pilot/join').POST(request('POST',input))).status,429);
 h.state.actor=null;assert.equal((await h.route('pilot/export').GET()).status,401);assert.equal((await h.route('pilot/queue').POST(request('POST',input))).status,401);
 h.state.actor={username:'SomeoneElse',role:'manager'};assert.equal((await h.route('pilot/queue').GET()).status,401);
 }finally{await db.close();}});
test('Pilot only exposes selected routes',()=>{const {pilotPathAllowed}=load('src/lib/pilot/config.ts');for(const p of ['/','/join','/status','/login','/api/pilot/queue','/api/auth/login'])assert.equal(pilotPathAllowed(p),true,p);for(const p of ['/management','/waiter','/api/whatsapp/jobs','/api/guests','/api/internal/database-cleanup','/api/simple-tables','/api/license/status','/api/auth/pin-login'])assert.equal(pilotPathAllowed(p),false,p);});
test('Ready sender is consent-gated and claims each Call at most once',async()=>{const {db,h,store}=await setup();try{

 let sends=0;const payloads=[];h.mocks['@/lib/whatsapp/transport']={requestMetaTemplate:async p=>{sends++;payloads.push(p);return {state:'sent',messageId:'synthetic-provider-id'};}};
 const globals={process:{env:{MO_BISTRO_DB:'postgres',WHATSAPP_ENABLED:'true',WHATSAPP_MODE:'live',WHATSAPP_ALLOW_LIVE_SEND:'true',WHATSAPP_WINDOW_TEXT_ENABLED:'true',VERCEL_ENV:'preview',WHATSAPP_TEST_RECIPIENT:'01000000001',META_WHATSAPP_PHONE_NUMBER_ID:'123'}}};
 const sender=load('src/lib/pilot/whatsapp.ts',h.mocks,globals);
 const party=await store.createParty(input,'qr');await store.transition(party.id,'call');const id=(await db.query('SELECT id FROM pilot_ready_messages')).rows[0].id;
 await db.query("INSERT INTO whatsapp_customer_windows VALUES('201000000001','123',clock_timestamp())");
 await sender.deliverPilotCall(id);await sender.deliverPilotCall(id);assert.equal(sends,1);assert.equal(payloads[0].type,'text');assert.match(payloads[0].text.body,/your table is ready/);
 const accepted=(await db.query('SELECT status,called_at,informed_via FROM pilot_parties WHERE id=$1',[party.id])).rows[0];assert.equal(accepted.status,'called');assert.ok(accepted.called_at);assert.equal(accepted.informed_via,'whatsapp_accepted');
 await store.transition(party.id,'left');await db.query("UPDATE pilot_parties SET pending_exit_at=clock_timestamp()-INTERVAL '1 second' WHERE id=$1",[party.id]);const next=await store.createParty({...input,whatsapp_consent:false},'qr');await store.transition(next.id,'call');const job=(await db.query('SELECT id FROM pilot_ready_messages WHERE party_id=$1',[next.id])).rows[0].id;
 await sender.deliverPilotCall(job);assert.equal(sends,1);assert.equal((await db.query('SELECT last_error FROM pilot_ready_messages WHERE id=$1',[job])).rows[0].last_error,'guest_not_opted_in');
 }finally{await db.close();}});
test('Removal has a durable five-second undo, keeps timestamps on undo, and records distinct outcomes',async()=>{
 const {db,h,store}=await setup();try{
 const party=await store.createParty(input,'qr');const api=h.route('pilot/parties/[id]');
 assert.equal((await api.PATCH(request('PATCH',{action:'remove'}),context(party.id))).status,400);
 const begin=await api.PATCH(request('PATCH',{action:'cancel'}),context(party.id));assert.equal(begin.status,200);const pending=await begin.json();assert.ok(pending.undo_token&&pending.undo_until);
 const repeat=await(await api.PATCH(request('PATCH',{action:'cancel'}),context(party.id))).json();assert.equal(repeat.undo_token,pending.undo_token);assert.equal(repeat.undo_until,pending.undo_until);
 assert.equal((await api.PATCH(request('PATCH',{action:'notify'}),context(party.id))).status,409);
 assert.equal((await api.PATCH(request('PATCH',{action:'undo',undo_token:'11111111-1111-4111-8111-111111111111'}),context(party.id))).status,409);
 assert.equal((await api.PATCH(request('PATCH',{action:'undo',undo_token:pending.undo_token}),context(party.id))).status,200);
 let row=(await db.query('SELECT * FROM pilot_parties WHERE id=$1',[party.id])).rows[0];assert.equal(row.status,'waiting');assert.equal(row.left_at,null);assert.equal(row.exit_reason,null);
 assert.equal((await api.PATCH(request('PATCH',{action:'notify'}),context(party.id))).status,200);
 await db.query("UPDATE pilot_parties SET status='called',called_at=clock_timestamp() WHERE id=$1",[party.id]);
 const noShow=await(await api.PATCH(request('PATCH',{action:'no_show'}),context(party.id))).json();
 assert.equal((await store.listQueue()).length,1);await db.query("UPDATE pilot_parties SET pending_exit_at=clock_timestamp()-INTERVAL '1 second' WHERE id=$1",[party.id]);
 assert.equal((await api.PATCH(request('PATCH',{action:'undo',undo_token:noShow.undo_token}),context(party.id))).status,409);
 assert.equal((await store.listQueue()).length,0);row=(await store.exportRows())[0];assert.equal(row.exit_reason,'no_response');assert.equal(row.exit_state,'called');assert.ok(row.called_at&&row.left_at);
 const second=await store.createParty(input,'qr');await store.transition(second.id,'cancel');await db.query("UPDATE pilot_parties SET pending_exit_at=clock_timestamp()-INTERVAL '1 second' WHERE id=$1",[second.id]);
 const csv=store.csv(await store.exportRows());assert.match(csv,/no_response/);assert.match(csv,/guest_cancelled/);assert.doesNotMatch(csv,/Synthetic Guest|01000000001/);
 }finally{await db.close();}
});
test('Notify requires an inbound window and holds delivery during a pending no-show',async()=>{
 const {db,h,store}=await setup();try{
 let sends=0;
 h.mocks['@/lib/whatsapp/transport']={requestMetaTemplate:async()=>{sends++;return {state:'sent',messageId:'test-id'};}};
 const env={MO_BISTRO_DB:'postgres',WHATSAPP_ENABLED:'true',WHATSAPP_MODE:'live',WHATSAPP_ALLOW_LIVE_SEND:'true',WHATSAPP_WINDOW_TEXT_ENABLED:'true',VERCEL_ENV:'preview',WHATSAPP_TEST_RECIPIENT:input.phone};
 const sender=load('src/lib/pilot/whatsapp.ts',h.mocks,{process:{env}});
 const party=await store.createParty(input,'qr');await store.transition(party.id,'notify');const id=(await db.query('SELECT id FROM pilot_ready_messages')).rows[0].id;
 const pending=await store.transition(party.id,'no_show');await sender.deliverPilotCall(id);assert.equal(sends,0);assert.equal((await db.query('SELECT status FROM pilot_ready_messages')).rows[0].status,'pending');
 await store.undoExit(party.id,pending.undo_token);await sender.deliverPilotCall(id);assert.equal(sends,0);assert.equal((await db.query('SELECT last_error FROM pilot_ready_messages')).rows[0].last_error,'customer_service_window_closed');
 }finally{await db.close();}
});
test('Opt-in alone, expired windows, wrong business number and STOP never send',async()=>{
 const {db,h,store}=await setup();try{

 let sends=0;h.mocks['@/lib/whatsapp/transport']={requestMetaTemplate:async()=>{sends++;return {state:'sent',messageId:'test-id'};}};
 const env={MO_BISTRO_DB:'postgres',WHATSAPP_ENABLED:'true',WHATSAPP_MODE:'live',WHATSAPP_ALLOW_LIVE_SEND:'true',WHATSAPP_WINDOW_TEXT_ENABLED:'true',VERCEL_ENV:'preview',WHATSAPP_TEST_RECIPIENT:input.phone,META_WHATSAPP_PHONE_NUMBER_ID:'123',WHATSAPP_READY_TEMPLATE:'must_not_be_used'};
 const sender=load('src/lib/pilot/whatsapp.ts',h.mocks,{process:{env}});
 for(const scenario of ['missing','expired','wrong_business','future','disabled','stopped']){
  env.WHATSAPP_WINDOW_TEXT_ENABLED=scenario==='disabled'?'false':'true';
  const party=await store.createParty(input,'qr');await store.transition(party.id,'notify');
  const id=(await db.query('SELECT id FROM pilot_ready_messages WHERE party_id=$1',[party.id])).rows[0].id;
  await db.query('DELETE FROM whatsapp_customer_windows');
  if(scenario==='expired')await db.query("INSERT INTO whatsapp_customer_windows VALUES('201000000001','123',clock_timestamp()-INTERVAL '25 hours')");
  if(scenario==='wrong_business')await db.query("INSERT INTO whatsapp_customer_windows VALUES('201000000001','456',clock_timestamp())");
  if(scenario==='future')await db.query("INSERT INTO whatsapp_customer_windows VALUES('201000000001','123',clock_timestamp()+INTERVAL '1 hour')");
  if(scenario==='disabled')await db.query("INSERT INTO whatsapp_customer_windows VALUES('201000000001','123',clock_timestamp())");
  if(scenario==='stopped'){await db.query("INSERT INTO whatsapp_customer_windows VALUES('201000000001','123',clock_timestamp())");await db.query("INSERT INTO whatsapp_contact_preferences VALUES('201000000001',clock_timestamp())");}
  await sender.deliverPilotCall(id);assert.equal(sends,0,scenario);
  assert.equal((await db.query('SELECT last_error FROM pilot_ready_messages WHERE id=$1',[id])).rows[0].last_error,scenario==='stopped'?'guest_unsubscribed':scenario==='disabled'?'window_text_disabled':'customer_service_window_closed');
  await store.transition(party.id,'seated');
 }
 }finally{await db.close();}
});
