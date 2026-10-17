// Black-box hosted tests. Requires the isolated project origin and synthetic auth.
// Never spoof forwarded IP headers or weaken rate limits to obtain larger numbers.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {randomUUID} from 'node:crypto';
const origin=process.env.PILOT_LOAD_ORIGIN;
assert.equal(new URL(origin).hostname,'mo-bistro-pilot-loadtest.vercel.app','Only isolated load-test project is allowed');
assert.equal(process.env.PILOT_HTTP_LOAD_ACK,'I_APPROVE_ISOLATED_HTTP_LOAD');
const records=[],checks=[],failures=[];let cookie='',sent=0;
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function call(label,path,{method='GET',body,staff=false,headers={}}={}) {
 if(++sent>5000)throw Error('Hard request budget reached');
 const began=performance.now();
 try {
  const r=await fetch(origin+path,{method,headers:{Origin:origin,...(body?{'Content-Type':'application/json'}:{}),...(staff?{Cookie:cookie}:{}),...headers},
   ...(body?{body:JSON.stringify(body)}:{}),redirect:'manual',signal:AbortSignal.timeout(20000)});
  const text=await r.text();let data;try{data=JSON.parse(text);}catch{data=text;}
  const timing=Object.fromEntries((r.headers.get('server-timing')||'').split(',').map(item=>{const match=item.trim().match(/^([\w_]+);dur=([\d.]+)/);return match?[match[1],Number(match[2])]:[];}).filter(pair=>pair.length));
  records.push({label,status:r.status,ms:Math.round(performance.now()-began),timing,
   first_handler:r.headers.get('x-pilot-handler-first'),process_age_ms:Number(r.headers.get('x-pilot-process-age-ms'))||null});
  return {status:r.status,data,cookie:r.headers.get('set-cookie'),headers:r.headers};
 } catch(error) {records.push({label,status:0,ms:Math.round(performance.now()-began)});throw Error('Request failed: '+error.name);}
}
const must=(name,condition)=>{assert.ok(condition,name);checks.push({name,passed:true});};
async function batch(count,concurrency,fn){let next=0;return Promise.all(Array.from({length:concurrency},async()=>{
 while(next<count){const id=next++;await fn(id);}
}));}
try {
 const login=await call('login','/api/auth/login',{method:'POST',body:{username:'omarmohsen',credential:process.env.PILOT_LOAD_PASSWORD}});
 must('synthetic_login',login.status===200&&!!login.cookie);cookie=login.cookie.split(';')[0];
 must('authenticated_me',(await call('me','/api/auth/me',{staff:true})).status===200);
 must('queue_denies_anonymous',(await call('unauthorized','/api/pilot/queue')).status===401);
 must('advanced_routes_blocked',(await call('blocked_legacy','/api/guests',{staff:true})).status===404);
 must('cross_origin_join_denied',(await call('csrf','/api/pilot/join',{method:'POST',body:{},headers:{Origin:'https://invalid.example'}})).status===403);
 must('invalid_token_rejected',(await call('invalid_token','/api/pilot/status?token=invalid')).status===400);
 must('unknown_token_not_found',(await call('unknown_token','/api/pilot/status?token='+'0'.repeat(64))).status===404);
 const parties=[];
 await batch(15,3,async i=>{
  const r=await call('public_join','/api/pilot/join',{method:'POST',body:{name:'HTTP Load Synthetic',phone:'01299'+String(i).padStart(6,'0'),party_size:2,preference:i%2?'indoor':'outdoor',whatsapp_consent:false}});
  assert.equal(r.status,201,'Public join must succeed');parties.push(r.data);
 });
 must('15_same_ip_qr_joins_all_accepted',new Set(parties.map(p=>p.id)).size===15);
 const duplicate=await call('duplicate_join','/api/pilot/join',{method:'POST',body:{name:'HTTP Load Synthetic',phone:'01299000000',party_size:2,preference:'indoor',whatsapp_consent:false}});
 must('duplicate_active_phone_rejected',duplicate.status===409);
 for(let i=0;i<3;i++)assert.equal((await call('phone_flood_duplicate','/api/pilot/join',{method:'POST',body:{name:'HTTP Load Synthetic',phone:'01299000000',party_size:2,preference:'indoor',whatsapp_consent:false}})).status,409);
 must('phone_flood_throttled',(await call('phone_flood_throttle','/api/pilot/join',{method:'POST',body:{name:'HTTP Load Synthetic',phone:'01299000000',party_size:2,preference:'indoor',whatsapp_consent:false}})).status===429);
 const walkins=[];
 await batch(25,5,async i=>{
  const r=await call('staff_walkin','/api/pilot/queue',{staff:true,method:'POST',body:{name:'HTTP Walkin Synthetic',phone:'01599'+String(i).padStart(6,'0'),party_size:3,preference:'indoor',whatsapp_consent:false}});
  assert.equal(r.status,201);walkins.push(r.data);
 });
 const path=p=>'/api/pilot/parties/'+p.id;
 const notify=await call('notify_no_consent',path(walkins[0]),{staff:true,method:'PATCH',body:{action:'notify'}});
 must('notify_without_consent_returns_without_hanging',notify.status===200);
 const status=await call('status_control','/api/pilot/status?token='+encodeURIComponent(walkins[0].token));
 must('notify_without_consent_stays_waiting',status.status===200&&status.data.status==='waiting');
 const phoneEvent=randomUUID();
 await batch(10,5,async()=>assert.equal((await call('repeat_call_event',path(walkins[0]),{staff:true,method:'PATCH',body:{action:'phone_call',event_id:phoneEvent}})).status,200));
 must('phone_fallback_confirmation',(await call('guest_informed',path(walkins[0]),{staff:true,method:'PATCH',body:{action:'guest_informed'}})).status===200);
 await batch(10,5,async()=>assert.equal((await call('repeat_seat',path(walkins[0]),{staff:true,method:'PATCH',body:{action:'seated'}})).status,200));
 const removed=await call('remove',path(walkins[1]),{staff:true,method:'PATCH',body:{action:'remove',reason:'duplicate_test'}});
 must('remove_has_undo_token',removed.status===200&&!!removed.data.undo_token);
 must('undo_before_deadline',(await call('undo',path(walkins[1]),{staff:true,method:'PATCH',body:{action:'undo',undo_token:removed.data.undo_token}})).status===200);
 const guestParties=[...parties,...walkins];
 // Re-seat controls use a token in this group too; seated status remains private and pollable.
 must('40_distinct_guest_status_links',guestParties.length===40);
 console.log(JSON.stringify({functional_checks:checks.length,phase:'40 guests, one IP, 12-second polling, actual ten-minute soak'}));
 const start=performance.now();
 await Promise.all([
  ...guestParties.map((p,i)=>(async()=>{for(let round=0;round<50;round++){
   await sleep(Math.max(0,start+round*12000+i*20-performance.now()));
   const r=await call('guest_poll_shared_ip','/api/pilot/status?token='+encodeURIComponent(p.token));assert.equal(r.status,200,'Every legitimate guest poll must succeed');
  }})()),
  (async()=>{for(let round=0;round<120;round++){
   await sleep(Math.max(0,start+round*5000-performance.now()));
   assert.equal((await call('staff_poll','/api/pilot/queue',{staff:true})).status,200);
  }})(),
  (async()=>{for(let minute=1;minute<=10;minute++){await sleep(Math.max(0,start+minute*60000-performance.now()));console.log(JSON.stringify({soak_minute:minute,requests:records.length,guest_429:records.filter(r=>r.label==='guest_poll_shared_ip'&&r.status===429).length}));}})()
 ]);
 must('2000_guest_polls_zero_throttles',records.filter(r=>r.label==='guest_poll_shared_ip'&&r.status===200).length===2000);
 console.log(JSON.stringify({phase:'mixed run: 30 polling guests, 3 simultaneous joins, two staff actions per round'}));
 const mixedStart=performance.now();
 await Promise.all([
  ...guestParties.slice(0,30).map((p,i)=>(async()=>{for(let round=0;round<5;round++){
   await sleep(Math.max(0,mixedStart+round*12000+i*20-performance.now()));
   assert.equal((await call('mixed_guest_poll','/api/pilot/status?token='+encodeURIComponent(p.token))).status,200);
  }})()),
  batch(3,3,async i=>{assert.equal((await call('mixed_join','/api/pilot/join',{method:'POST',body:{name:'Mixed Synthetic',phone:'01098'+String(i).padStart(6,'0'),party_size:2,preference:'outdoor',whatsapp_consent:false}})).status,201);}),
  (async()=>{for(let round=0;round<5;round++){
   await sleep(Math.max(0,mixedStart+round*12000-performance.now()));
   await Promise.all(walkins.slice(2,4).map(async p=>{
    assert.equal((await call('staff_action_phone',path(p),{staff:true,method:'PATCH',body:{action:'phone_call',event_id:randomUUID()}})).status,200);
    assert.equal((await call('staff_action_refresh','/api/pilot/queue',{staff:true})).status,200);
   }));
  }})()
 ]);
 for(const concurrency of [10,25]) await batch(concurrency,concurrency,async()=>assert.equal((await call('staff_queue_burst_'+concurrency,'/api/pilot/queue',{staff:true})).status,200));
 const probe=[];await batch(31,5,async()=>{probe.push((await call('token_budget_probe','/api/pilot/status?token='+encodeURIComponent(parties[0].token))).status);});
 must('one_token_cannot_flood_polls',probe.includes(429)&&probe.every(status=>[200,429].includes(status)));
 must('token_throttle_does_not_block_other_booking',(await call('other_token_control','/api/pilot/status?token='+encodeURIComponent(parties[1].token))).status===200);
 const exported=await call('export','/api/pilot/export',{staff:true});
 must('csv_export_succeeds',exported.status===200&&typeof exported.data==='string');
 must('csv_has_no_names_or_phones',!exported.data.includes('Synthetic')&&!exported.data.includes('01299000000'));
 must('logout',(await call('logout','/api/auth/logout',{staff:true,method:'POST'})).status===200);
 must('revoked_session_denied',(await call('revoked','/api/pilot/queue',{staff:true})).status===401);
}catch(error){failures.push({type:error.name,message:error.message});}
const groups={};
for(const r of records)(groups[r.label]??=[]).push(r);
const percentile=(rows,p)=>{const s=rows.map(r=>r.ms).sort((a,b)=>a-b);return s[Math.ceil(s.length*p)-1]??null;};
const summary=Object.fromEntries(Object.entries(groups).map(([label,rows])=>[label,{requests:rows.length,statuses:rows.reduce((a,r)=>(a[r.status]=(a[r.status]||0)+1,a),{}),p50_ms:percentile(rows,.5),p95_ms:percentile(rows,.95),max_ms:Math.max(...rows.map(r=>r.ms)),
 slowest:rows.toSorted((a,b)=>b.ms-a.ms).slice(0,3)}]));
const report={at:new Date().toISOString(),origin,methodology:'real hosted HTTP; one source IP; 40 guests at 12-second cadence for ten real minutes; one staff screen every five seconds; mixed run of 30 guests plus three joins and paired staff actions; no WhatsApp credentials',checks,failures,summary,total_requests:records.length,
 readiness_issues:records.some(r=>r.label==='guest_poll_shared_ip'&&r.status===429)?['Guests sharing one public IP are throttled by the current global status polling limit.']:[]};
if(process.env.PILOT_HTTP_REPORT)fs.writeFileSync(process.env.PILOT_HTTP_REPORT,JSON.stringify(report,null,2));
console.log(JSON.stringify(report));if(failures.length)process.exitCode=1;
