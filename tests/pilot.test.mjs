import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {load,harness,request,context,requireDependency} from './handler-harness.mjs';
const {PGlite}=requireDependency('@electric-sql/pglite');
function adapter(db){const sql=async(strings,...values)=>{let q='';strings.forEach((s,i)=>{q+=s;if(i<values.length)q+='$'+(i+1);});return(await db.query(q,values)).rows;};sql.begin=cb=>db.transaction(tx=>cb(adapter(tx)));return sql;}
async function setup(){const db=new PGlite();await db.exec(fs.readFileSync('migrations/20261016_queue_pilot.sql','utf8'));const h=harness({actor:{id:1,username:'OmarMohsen',role:'manager'}});h.mocks['@/lib/postgres-db']={getPostgres:()=>adapter(db)};
 const config=load('src/lib/pilot/config.ts');h.mocks['./config']=config;
 h.mocks['next/server']={after:()=>{},NextResponse:{json:(body,init)=>Response.json(body,init)}};
 h.mocks['@/lib/pilot/whatsapp']={publishPilotCalls:async()=>{}};
 return {db,h,store:load('src/lib/pilot/store.ts',h.mocks)};}
const input={name:'Synthetic Guest',phone:'01000000001',party_size:2,preference:'indoor',whatsapp_consent:true};
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
 assert.equal((await store.partyStatus(second.token)).position,1);
 await action.PATCH(request('PATCH',{action:'seated'}),context(first.id));
 await action.PATCH(request('PATCH',{action:'left'}),context(second.id));
 assert.equal((await action.PATCH(request('PATCH',{action:'call'}),context(first.id))).status,409);
 assert.equal((await store.listQueue()).length,0);
 const rows=await store.exportRows();assert.ok(rows[0].joined_at&&rows[0].called_at&&rows[0].seated_at);assert.ok(rows[1].left_at);assert.equal(rows[1].source,'walk_in');
 const csv=store.csv(rows);assert.match(csv,/joined_at,called_at,seated_at,left_at/);assert.doesNotMatch(csv,/Synthetic|0100000000|tracking_hash|name|phone/);
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
 await db.exec('CREATE TABLE whatsapp_contact_preferences(phone text PRIMARY KEY,opted_out_at timestamptz); CREATE TABLE whatsapp_customer_windows(phone text,phone_number_id text,last_inbound_at timestamptz);');
 let sends=0;const payloads=[];h.mocks['@/lib/whatsapp/transport']={requestMetaTemplate:async p=>{sends++;payloads.push(p);return {state:'sent',messageId:'synthetic-provider-id'};}};
 const globals={process:{env:{MO_BISTRO_DB:'postgres',WHATSAPP_ENABLED:'true',WHATSAPP_MODE:'live',WHATSAPP_ALLOW_LIVE_SEND:'true',VERCEL_ENV:'preview',WHATSAPP_TEST_RECIPIENT:'01000000001',WHATSAPP_WINDOW_TEXT_ENABLED:'true',META_WHATSAPP_PHONE_NUMBER_ID:'123'}}};
 const sender=load('src/lib/pilot/whatsapp.ts',h.mocks,globals);
 const party=await store.createParty(input,'qr');await store.transition(party.id,'call');const id=(await db.query('SELECT id FROM pilot_ready_messages')).rows[0].id;
 await db.query("INSERT INTO whatsapp_customer_windows VALUES('201000000001','123',clock_timestamp())");
 await sender.deliverPilotCall(id);await sender.deliverPilotCall(id);assert.equal(sends,1);assert.equal(payloads[0].type,'text');assert.match(payloads[0].text.body,/your table is ready/);
 await store.transition(party.id,'left');const next=await store.createParty({...input,whatsapp_consent:false},'qr');await store.transition(next.id,'call');const job=(await db.query('SELECT id FROM pilot_ready_messages WHERE party_id=$1',[next.id])).rows[0].id;
 await sender.deliverPilotCall(job);assert.equal(sends,1);assert.equal((await db.query('SELECT last_error FROM pilot_ready_messages WHERE id=$1',[job])).rows[0].last_error,'guest_not_opted_in');
 }finally{await db.close();}});
