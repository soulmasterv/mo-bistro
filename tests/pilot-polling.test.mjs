import test from 'node:test';
import assert from 'node:assert/strict';
import {load,harness,request,requireDependency} from './handler-harness.mjs';
const {PGlite}=requireDependency('@electric-sql/pglite');

test('fixed-window limiter isolates booking tokens, allows 30/minute and preserves shared-IP ceiling',async()=>{
 const db=new PGlite();let now=1_800_000_000_000;
 try{
  await db.exec('CREATE TABLE api_rate_limits(key_hash text PRIMARY KEY,request_count integer NOT NULL CHECK(request_count>=1),window_start bigint NOT NULL,expires_at bigint NOT NULL)');
  const sql=async(strings,...values)=>{let query='';strings.forEach((part,i)=>{query+=part;if(i<values.length)query+='$'+(i+1);});return(await db.query(query,values)).rows;};
  const limiter=load('src/lib/api-rate-limit.ts',{'@/lib/postgres-db':{getPostgres:()=>sql}},
   {Date:class extends Date{static now(){return now;}},process:{env:{MO_BISTRO_DB:'postgres',STAFF_SESSION_SECRET:'x'.repeat(64)}}});
  const token='a'.repeat(64),req=new Request('https://pilot.test',{headers:{'x-vercel-forwarded-for':'192.0.2.1'}});
  for(let i=0;i<30;i++)assert.equal(await limiter.checkRateLimit(req,'pilot-status-token',30,60,token),null);
  assert.equal((await limiter.checkRateLimit(req,'pilot-status-token',30,60,token)).status,429);
  assert.equal(await limiter.checkRateLimit(req,'pilot-status-token',30,60,'b'.repeat(64)),null);
  now+=60000;assert.equal(await limiter.checkRateLimit(req,'pilot-status-token',30,60,token),null);
  for(let i=0;i<600;i++)assert.equal(await limiter.checkRateLimit(req,'pilot-status-shared-ip',600,60),null);
  assert.equal((await limiter.checkRateLimit(req,'pilot-status-shared-ip',600,60)).status,429);
  const rows=(await db.query('SELECT key_hash FROM api_rate_limits')).rows;
  assert.equal(rows.length,3);assert.ok(rows.every(r=>r.key_hash!==token));
 }finally{await db.close();}
});

test('status handler has token and shared-IP budgets, rejects invalid tokens, and join throttling logs no personal data',async()=>{
 const h=harness();const limits=[],warnings=[];
 h.mocks['./config']=load('src/lib/pilot/config.ts');
 h.mocks['@/lib/api-rate-limit']={checkRateLimit:async(_r,name,max,seconds,subject)=>{
  limits.push({name,max,seconds,hasSubject:!!subject});return name==='pilot-join'?Response.json({error:'Slow down'},{status:429}):null;}};
 const store=load('src/lib/pilot/store.ts',h.mocks);
 h.mocks['@/lib/pilot/store']={...store,partyStatus:async()=>({id:1,status:'waiting',position:1,whatsapp_consent:false})};
 const status=load('src/app/api/pilot/status/route.ts',h.mocks);
 assert.equal((await status.GET(new Request('https://pilot.test/api/pilot/status?token='+'a'.repeat(64)))).status,200);
 assert.equal(limits.length,2);assert.equal(limits[0].max,600);assert.equal(limits[1].max,30);assert.equal(limits[1].hasSubject,true);
 assert.equal((await status.GET(new Request('https://pilot.test/api/pilot/status?token=invalid'))).status,400);
 limits.length=0;
 const join=load('src/app/api/pilot/join/route.ts',h.mocks,{console:{warn:(...args)=>warnings.push(args)}});
 const r=await join.POST(request('POST',{name:'Synthetic Guest',phone:'01000000001',party_size:2,preference:'indoor'}));
 assert.equal(r.status,429);assert.equal(limits[0].max,60);assert.equal(limits[0].seconds,600);
 assert.equal(warnings[0][1].scope,'ip');assert.doesNotMatch(JSON.stringify(warnings),/01000000001|Synthetic Guest/);
});

test('backoff grows, respects Retry-After, caps growth, and adds bounded jitter',()=>{
 const {pollRetryDelay}=load('src/lib/pilot/polling.ts');
 assert.equal(pollRetryDelay(1,0,()=>0),12000);assert.equal(pollRetryDelay(2,0,()=>0),24000);
 assert.equal(pollRetryDelay(3,0,()=>0),48000);assert.equal(pollRetryDelay(20,0,()=>0),60000);
 assert.equal(pollRetryDelay(1,30000,()=>.5),31500);
 assert.ok(pollRetryDelay(1,0,()=>.999)>=12000&&pollRetryDelay(1,0,()=>.999)<15000);
});
