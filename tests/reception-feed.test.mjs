import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {performance} from 'node:perf_hooks';
import {PGlite} from '@electric-sql/pglite';
import {load,harness,request,context} from './handler-harness.mjs';
const payload=(name='Guest')=>({guests:[{id:1,name}],tables:[],requests:[],next:{areas:[]},mode:{mode:'simple'},simple:{areas:[]},wait:{minutes:30}});
const settle=async()=>{for(let n=0;n<20;n++)await Promise.resolve();};
test('browser singleton binds native timers to the browser global, not the feed options',async()=>{
 const browser={},tasks=new Map();let sequence=0,reads=0;
 const loadedFeed=load('src/lib/reception-feed.ts',{}, {
  globalThis:browser,document:{visibilityState:'visible'},
  fetch:async()=>{reads++;return Response.json(payload());},
  setTimeout:function(fn,delay){assert.equal(this,browser,'native setTimeout receiver');const id=++sequence;tasks.set(id,{fn,delay});return id;},
  clearTimeout:function(id){assert.equal(this,browser,'native clearTimeout receiver');tasks.delete(id);},
 });
 const feed=loadedFeed.receptionFeed();
 await feed.refresh();
 assert.equal(reads,1);assert.equal((await(await feed.read('/api/guests')).json())[0].name,'Guest');
 const stop=feed.start();await settle();
 assert.ok([...tasks.values()].some(task=>task.delay===5000));
 stop();assert.equal(tasks.size,0);
});
function fixture(handler=async()=>Response.json(payload())){
 let now=0,visible=true,sequence=0;const tasks=new Map(),calls=[];
 const options={fetch:async(...args)=>{calls.push({time:now,args});return handler(...args);},now:()=>now,random:()=>.5,visible:()=>visible,
  setTimeout:(fn,delay)=>{const id=++sequence;tasks.set(id,{fn,time:now+delay});return id;},clearTimeout:id=>tasks.delete(id)};
 const {createReceptionFeed}=load('src/lib/reception-feed.ts',{}, {DOMException});
 const feed=createReceptionFeed(options);
 return {feed,calls,tasks,hide(){visible=false;feed.visibilityChanged();},show(){visible=true;feed.visibilityChanged();},async advance(ms){const end=now+ms;while(true){const next=[...tasks].sort((a,b)=>a[1].time-b[1].time)[0];if(!next||next[1].time>end)break;now=next[1].time;tasks.delete(next[0]);next[1].fn();await settle();}now=end;await settle();}};
}
test('seven consumers share one request per five seconds: 13 requests including initial load over 60 seconds',async()=>{
 const h=fixture(),stop=h.feed.start();await settle();
 const urls=['/api/guests','/api/tables','/api/reception/table-requests','/api/reception/next-guest?areas=all','/api/table-view-mode','/api/wait-estimate','/api/simple-tables'];
 const unsubscribe=h.feed.subscribe(()=>{for(const url of urls)void h.feed.read(url).catch(()=>{});});
 await Promise.all(urls.map(url=>h.feed.read(url)));assert.equal(h.calls.length,1);
 await h.advance(60000);assert.equal(h.calls.length,13);assert.ok(h.calls.every(c=>c.args[0]==='/api/reception/dashboard'));
 unsubscribe();stop();
});
test('hidden tab pauses and visible tab refreshes immediately; unmount clears timers and private data',async()=>{
 const h=fixture(),stop=h.feed.start();await settle();h.hide();await h.advance(60000);assert.equal(h.calls.length,1);
 h.show();await settle();assert.equal(h.calls.length,2);stop();await h.advance(60000);assert.equal(h.calls.length,2);assert.equal(h.tasks.size,0);
});
test('failed polls retain data, back off with jitter, and do not restart a retry storm from readers',async()=>{
 let fail=false;const h=fixture(async()=>{if(fail)throw Error('offline');return Response.json(payload());});
 const stop=h.feed.start();await settle();fail=true;
 const unsubscribe=h.feed.subscribe(()=>{void h.feed.read('/api/guests').catch(()=>{});});
 await h.advance(5000);assert.equal(h.feed.state().updating,true);
 assert.equal((await(await h.feed.read('/api/guests')).json())[0].name,'Guest');
 await h.advance(9999);assert.equal(h.calls.length,2);await h.advance(1);assert.equal(h.calls.length,3);
 fail=false;await h.advance(20000);assert.equal(h.feed.state().updating,false);unsubscribe();stop();
});
test('initial failure retries on the timer, not on every subscriber read; authorization loss clears private snapshot',async()=>{
 let response=503;const h=fixture(async()=>Response.json(response===200?payload():{error:'unavailable'},{status:response}));
 const stop=h.feed.start();const unsubscribe=h.feed.subscribe(()=>{void h.feed.read('/api/guests').catch(()=>{});});
 await settle();assert.equal(h.calls.length,1);await h.advance(9999);assert.equal(h.calls.length,1);
 response=200;await h.advance(1);assert.equal(h.calls.length,2);
 response=403;await h.advance(5000);assert.equal(h.feed.state().stopped,true);
 await assert.rejects(h.feed.read('/api/guests'));await h.advance(60000);assert.equal(h.calls.length,3);unsubscribe();stop();
});
test('a mutation during an in-flight poll forces one fresh snapshot and never publishes the stale response',async()=>{
 const pending=[];const h=fixture(()=>new Promise(resolve=>pending.push(resolve)));
 const published=[];h.feed.subscribe(()=>published.push(h.feed.state().updatedAt));
 const poll=h.feed.refresh();const invalidated=h.feed.refresh(true);const anotherReader=h.feed.refresh();
 assert.equal(h.calls.length,1);pending[0](Response.json(payload('Old')));await settle();assert.equal(h.calls.length,2);
 pending[1](Response.json(payload('Fresh')));await Promise.all([poll,invalidated,anotherReader]);
 assert.equal((await(await h.feed.read('/api/guests')).json())[0].name,'Fresh');assert.equal(h.calls.length,2);
});
test('hung requests time out without overlaps and retry with backoff',async()=>{
 let hung=false;
 const h=fixture(async(_url,init)=>hung?new Promise((_resolve,reject)=>init.signal.addEventListener('abort',()=>reject(Error('timeout')))):Response.json(payload()));
 const stop=h.feed.start();await settle();hung=true;
 await h.advance(5000);assert.equal(h.calls.length,2);
 await h.advance(14999);assert.equal(h.calls.length,2);
 await h.advance(1);assert.equal(h.feed.state().updating,true);
 assert.equal((await(await h.feed.read('/api/guests')).json())[0].name,'Guest');
 await h.advance(10000);assert.equal(h.calls.length,3);stop();
});

function adapter(db,queries){const sql=async(strings,...values)=>{const text=strings.reduce((a,p,i)=>a+(i?'$'+i:'')+p,'');queries.push(text);return(await db.query(text,values)).rows;};sql.begin=callback=>db.transaction(tx=>callback(adapter(tx,queries)));return sql;}
test('combined snapshot reuses five reads, matches both inventory modes, and performs no writes or pilot reads',async()=>{
 const db=new PGlite(),queries=[];try{
  for(const file of ['001_postgres_schema.sql','20261013_core_support.sql','20261012_simple_inventory.sql'])await db.exec(fs.readFileSync('migrations/'+file,'utf8'));
  await db.exec("INSERT INTO staff_users(username,role,credential_hash) VALUES('Synthetic','manager','test'); INSERT INTO restaurant_tables(name,seats,area,status) VALUES('Indoor',4,'indoor','free'),('Outdoor',2,'outdoor','occupied'); INSERT INTO guests(name,phone,party_size,seating_preference,confirmed) VALUES('Small','01000000001',2,'indoor',1),('Large','01000000002',8,'outdoor',1); INSERT INTO table_ready_requests(table_id,requested_by) SELECT id,1 FROM restaurant_tables WHERE name='Outdoor'; INSERT INTO seating_settings(key,value) VALUES('table_view_mode','detailed') ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value;");
  const sql=adapter(db,queries),h=harness();h.mocks['@/lib/postgres-db']={getPostgres:()=>sql};const snapshot=load('src/lib/reception-snapshot.ts',h.mocks);
  const detailed=await snapshot.receptionSnapshot();assert.equal(detailed.guests.length,2);assert.equal(detailed.requests[0].table_name,'Outdoor');assert.equal(detailed.next.areas[0].guest.name,'Small');
  assert.equal(queries.filter(q=>/^SELECT/.test(q.trim())).length,4);assert.equal(queries.filter(q=>q.includes('FROM guests g')).length,1);assert.equal(queries.filter(q=>q.includes('FROM restaurant_tables')).length,1);
  assert.ok(queries.every(q=>!q.includes('pilot_')&&!/\b(?:UPDATE|INSERT|DELETE)\b/.test(q)));
  await db.exec("UPDATE seating_settings SET value='simple' WHERE key='table_view_mode'");queries.length=0;
  const simple=await snapshot.receptionSnapshot();assert.equal(simple.simple.blocked_by_named_inventory,true);assert.ok(simple.next.areas.every(a=>!a.available));assert.equal(queries.filter(q=>/^SELECT/.test(q.trim())).length,5);
  await db.exec("UPDATE restaurant_tables SET status='free'");
  const free=await snapshot.receptionSnapshot();assert.equal(free.simple.blocked_by_named_inventory,false);
  const times=[];for(let n=0;n<25;n++){const start=performance.now();await snapshot.receptionSnapshot();times.push(performance.now()-start);}times.sort((a,b)=>a-b);
  console.log(JSON.stringify({measurement:'local in-memory PostgreSQL snapshot, not hosted HTTP',samples:times.length,p95Ms:Number(times[Math.ceil(times.length*.95)-1].toFixed(2)),queriesPerSimpleSnapshot:5}));
  const staffRoute=h.route('guests/[id]'),actions=[];
  for(let n=0;n<25;n++){
   await db.exec("UPDATE guests SET status='waiting' WHERE name='Small'");
   const start=performance.now();const response=await staffRoute.PATCH(request('PATCH',{action:'call'}),context(1));
   assert.equal(response.status,200);actions.push(performance.now()-start);
  }
  actions.sort((a,b)=>a-b);
  console.log(JSON.stringify({measurement:'local staff-action handler with in-memory PostgreSQL and mocked authentication, not hosted HTTP',samples:actions.length,p95Ms:Number(actions[Math.ceil(actions.length*.95)-1].toFixed(2))}));
 }finally{await db.close();}
});
test('combined endpoint denies anonymous and waiter before any database work',async()=>{
 for(const staff of [null,{role:'waiter'}]){
  const route=load('src/app/api/reception/dashboard/route.ts',{'@/lib/staff-auth':{currentStaff:async()=>staff},'@/lib/reception-snapshot':{receptionSnapshot:()=>{throw Error('must not read');}}});
  assert.equal((await route.GET()).status,403);
 }
});
