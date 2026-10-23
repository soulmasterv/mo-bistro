import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {harness,request,context,requireDependency} from './handler-harness.mjs';
const {PGlite}=requireDependency('@electric-sql/pglite');
function adapter(db){const sql=async(strings,...values)=>{let q='';strings.forEach((s,i)=>{q+=s;if(i<values.length)q+='$'+(i+1);});return(await db.query(q,values)).rows;};sql.begin=cb=>db.transaction(tx=>cb(adapter(tx)));return sql;}

test('Detailed lifecycle: public join, call, seating, waiter readiness, approval, release and reuse',async()=>{
 const db=new PGlite();
 try{
  for(const file of ['001_postgres_schema.sql','20261013_core_support.sql','20261010_area_table_requests.sql','20261010_table_ready_requests.sql','20261012_request_schema_repair.sql','20261012_simple_inventory.sql'])await db.exec(fs.readFileSync('migrations/'+file,'utf8'));
  await db.exec("INSERT INTO staff_users(id,username,role,credential_hash) VALUES(1,'manager','manager','fixture'),(2,'reception','reception','fixture'),(3,'waiter','waiter','fixture'); INSERT INTO restaurant_tables(id,name,seats,area) VALUES(1,'Indoor Four',4,'indoor'),(2,'Outdoor Two',2,'outdoor'),(3,'Outdoor Four',4,'outdoor'); INSERT INTO seating_settings(key,value) VALUES('table_view_mode','detailed'),('allow_area_override','false');");
  const h=harness();h.mocks['@/lib/postgres-db']={getPostgres:()=>adapter(db)};
  h.mocks['@/lib/whatsapp/policy']={whatsappEnabled:()=>false};
  h.mocks['@/lib/whatsapp/service']={recordBookingConsent:async()=>{},scheduleReview:async()=>{},dispatchOutbox:async()=>{throw Error('No outbound worker allowed');}};
  h.mocks['@/lib/qr-origin']={isAllowedQROrigin:()=>true};
  h.mocks['@/lib/advanced/flags']={advancedEnabled:()=>false};
  const join=h.route('join'),seat=h.route('seating'),track=h.route('track');
  for(let cycle=1;cycle<=3;cycle++){
   const phone='01000000'+String(cycle).padStart(3,'0');
   const input={name:'Synthetic Guest',phone,party_size:3,seating_preference:'indoor'};
   const joined=await join.POST(request('POST',input));assert.equal(joined.status,201);
   const booking=await joined.json();
   const [guest]=(await db.query('SELECT id,tracking_token_hash FROM guests WHERE phone=$1',[phone])).rows;
   const token=booking.token||new URL(booking.tracking_url,'https://bistro.test').searchParams.get('token');
   const tracked=await track.GET(new Request('https://bistro.test/api/track?token='+token));
   assert.equal((await tracked.json()).guest.seating_preference,'indoor');
   const called=await h.route('guests/[id]').PATCH(request('PATCH',{action:'call'}),context(guest.id));assert.equal(called.status,200,await called.clone().text());
   const choices=await seat.GET(new Request('https://bistro.test/api/seating?guest_id='+guest.id));
   assert.deepEqual((await choices.json()).tables.map(t=>t.id),[1]);
   assert.equal((await seat.POST(request('POST',{guest_id:guest.id,table_id:2}))).status,409);
   assert.equal((await seat.POST(request('POST',{guest_id:guest.id,table_id:3}))).status,409,'area policy is enforced even with sufficient seats');
   assert.equal((await seat.POST(request('POST',{guest_id:guest.id,table_id:1}))).status,200);
   assert.equal((await seat.POST(request('POST',{guest_id:guest.id,table_id:1}))).status,409);
   const next=await db.query("INSERT INTO guests(name,phone,party_size,seating_preference) VALUES('Other Guest',$1,2,'indoor') RETURNING id",['01100000'+String(cycle).padStart(3,'0')]);
   assert.equal((await seat.POST(request('POST',{guest_id:next.rows[0].id,table_id:1}))).status,409,'occupied table cannot be reassigned');
   h.state.actor={id:3,role:'waiter'};
   const waiterTables=await h.route('tables').GET();assert.equal((await waiterTables.json()).find(t=>t.id===1).status,'occupied');
   assert.equal((await h.route('waiter/tables/[id]/free').POST(request('POST'),context(1))).status,403);
   const ready=await h.route('waiter/tables/[id]/request-ready').POST(request('POST'),context(1));assert.equal(ready.status,201,await ready.clone().text());
   const pending=(await db.query("SELECT id FROM table_ready_requests WHERE status='pending' AND table_id=1")).rows[0];assert.ok(pending);
   h.state.actor={id:2,role:'reception'};
   const approval=await h.route('reception/table-requests/[id]').PATCH(request('PATCH',{action:'approve'}),context(pending.id));assert.equal(approval.status,200,await approval.clone().text());
   assert.equal((await h.route('reception/table-requests/[id]').PATCH(request('PATCH',{action:'approve'}),context(pending.id))).status,409);
   const [released]=(await db.query('SELECT status,table_id FROM guests WHERE id=$1',[guest.id])).rows;
   assert.equal(released.status,'seated','historical booking status is retained');assert.equal(released.table_id,null);
   assert.equal((await db.query('SELECT released_at FROM seating_history WHERE guest_id=$1',[guest.id])).rows[0].released_at!==null,true);
   for(const role of ['reception','waiter']){h.state.actor={id:role==='waiter'?3:2,role};const snapshot=await h.route('tables').GET();assert.equal((await snapshot.json()).find(t=>t.id===1).status,'free');}
   h.state.actor={id:1,role:'manager'};
   await db.query("UPDATE guests SET status='cancelled' WHERE id=$1",[next.rows[0].id]);
  }
  assert.equal((await db.query('SELECT COUNT(*)::integer AS n FROM seating_history WHERE released_at IS NOT NULL')).rows[0].n,3);
 }finally{await db.close();}
});

test('Invalid public phone receives format-specific feedback before any SQL',async()=>{
 const h=harness();h.mocks['@/lib/qr-origin']={isAllowedQROrigin:()=>true};
 const response=await h.route('join').POST(request('POST',{name:'Synthetic Guest',phone:'123',party_size:2}));
 assert.equal(response.status,400);assert.match((await response.json()).error,/11-digit Egyptian mobile/);assert.equal(h.queries.length,0);
});
