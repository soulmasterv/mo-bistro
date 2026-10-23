import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHmac} from 'node:crypto';
import {load,requireDependency} from './handler-harness.mjs';
const token='a'.repeat(64),secret='synthetic-session-secret-32-characters';
const url='postgresql://fixture:synthetic-password@ep-still-wind-b4036sdr-pooler.eu-central-1.aws.neon.tech/mo_bistro_2?sslmode=require&channel_binding=require';
const base={VERCEL_ENV:'preview',MO_BISTRO_DB:'postgres',MO_BISTRO_POSTGRES_URL:url,STAFF_SESSION_SECRET:secret,
 VERCEL_GIT_COMMIT_SHA:'b'.repeat(40),VERCEL_DEPLOYMENT_ID:'dpl_Fixture',WHATSAPP_ENABLED:'false',WHATSAPP_MODE:'simulation',WHATSAPP_ALLOW_LIVE_SEND:'false'};
const headers={origin:'https://bistro.test'};
function fixture({env={},cookie=token,manager=true,identity={},failure,timeout=false}={}){
 const state={env:{...base,...env},clients:[],queries:[],ends:0,begins:[],cookieReads:0,timeouts:[]};
 const query=async(strings,...values)=>{
  const text=strings.join('?');state.queries.push({text,values});
  if(failure)throw Error(failure);
  if(text.startsWith('SET LOCAL'))return [];
  if(text.includes('staff_sessions'))return manager?[{id:1}]:[];
  return [{database:'mo_bistro_2',schema:'public',read_only:'on',...identity}];
 };
 const client={begin:async(options,fn)=>{state.begins.push(options);return timeout?new Promise(()=>{}):fn(query);},end:async options=>{assert.equal(options.timeout,0);state.ends++;}};
 const mocks={postgres:options=>{state.clients.push(options);return client;},'next/headers':{cookies:async()=>{state.cookieReads++;return {get:()=>cookie==null?undefined:{value:cookie}};}}};
 const globals={process:{env:state.env},setTimeout:(fn,ms)=>{state.timeouts.push(ms);return setTimeout(fn,timeout?1:ms);},clearTimeout};
 state.route=load('src/app/api/management/release-safety/route.ts',mocks,globals);
 state.get=(method='GET',extra={})=>state.route.GET(new Request('https://bistro.test/api/management/release-safety',{method,headers:{...headers,...extra}}));
 return state;
}

test('Production, non-Preview and non-Postgres are hidden before cookies or connections',async()=>{
 for(const env of [{VERCEL_ENV:'production'},{VERCEL_ENV:'development'},{VERCEL_ENV:''},{MO_BISTRO_DB:'sqlite'}]){
  const f=fixture({env});const response=await f.get();assert.equal(response.status,404);assert.equal(f.clients.length,0);assert.equal(f.cookieReads,0);
 }
});

test('Only approved endpoint/database/port accepted; URL and ambient redirects cannot bypass guard',async()=>{
 const variants=[url.replace('ep-still-wind-b4036sdr','ep-production'),url.replace('mo_bistro_2','production'),
  url.replace('mo_bistro_2','mo_bistro_2/'),url.replace('/mo_bistro_2','/%6do_bistro_2'),
  url.replace('.neon.tech','.neon.tech.attacker.test'),url.replace('.neon.tech','.neon.tech:5433'),
  url.replace('postgresql:','https:'),url+'#secret',url+'&host=production',url+'&database=production',
  url+'&options=-csearch_path=private',url+'&sslmode=disable',url+'&sslmode=require',
  url.replace('fixture:synthetic-password','fixture'),url.replace('fixture:synthetic-password','%XX:password'),
  ' '+url,url.replace('eu-central-1.aws.neon.tech','evil.test'),url.replace('.neon.tech','@evil.test'),'',undefined];
 for(const value of variants){const f=fixture({env:{MO_BISTRO_POSTGRES_URL:value}});assert.equal((await f.get()).status,404);assert.equal(f.clients.length,0);}
 const f=fixture({env:{PGHOST:'production.invalid',PGDATABASE:'production',PGPORT:'5433',DATABASE_URL:'postgres://production.invalid/production'}});
 assert.equal((await f.get()).status,200);assert.match(f.clients[0].host,/^ep-still-wind-b4036sdr-pooler\./);assert.equal(f.clients[0].database,'mo_bistro_2');assert.equal(f.clients[0].port,5432);
 const direct=fixture({env:{MO_BISTRO_POSTGRES_URL:url.replace('-pooler','')}});assert.equal((await direct.get()).status,200);
 const clustered=fixture({env:{MO_BISTRO_POSTGRES_URL:url.replace('.eu-central-1.','.c-2.eu-central-1.')}});assert.equal((await clustered.get()).status,200);
});

test('Missing/malformed session and missing session secret never connect',async()=>{
 for(const cookie of [null,'', 'bad', 'f'.repeat(63), 'g'.repeat(64)]){const f=fixture({cookie});assert.equal((await f.get()).status,404);assert.equal(f.clients.length,0);}
 const f=fixture({env:{STAFF_SESSION_SECRET:''}});assert.equal((await f.get()).status,404);assert.equal(f.clients.length,0);
});

test('Invalid/non-manager session receives no identity or policy information',async()=>{
 const f=fixture({manager:false});const r=await f.get();assert.equal(r.status,404);assert.deepEqual(await r.json(),{error:'Not found'});
 assert.equal(f.queries.length,4);const auth=f.queries[3];assert.match(auth.text,/role='manager'/);assert.match(auth.text,/u.active=1/);assert.match(auth.text,/s.expires_at>/);
 assert.equal(auth.values[0],createHmac('sha256',secret).update(token).digest('hex'));assert.equal(f.ends,1);
});

test('Only same-origin GET can inspect; HEAD and mutations never connect',async()=>{
 const route=fixture().route;assert.deepEqual(Object.keys(route).sort(),['GET','dynamic','maxDuration','runtime']);
 for(const method of ['HEAD','POST','PATCH','DELETE','PUT','OPTIONS']){const f=fixture();assert.equal((await f.get(method)).status,405);assert.equal(f.clients.length,0);}
 for(const extra of [{origin:'https://attacker.test'},{'sec-fetch-site':'cross-site'}]){const f=fixture();assert.equal((await f.get('GET',extra)).status,404);assert.equal(f.clients.length,0);}
});

test('Manager response is minimal; read-only, TLS, timeouts and connection closure are enforced',async()=>{
 const f=fixture();const r=await f.get();assert.equal(r.status,200);assert.match(r.headers.get('Cache-Control'),/private, no-store/);assert.equal(r.headers.get('Vary'),'Cookie');
 const data=await r.json();assert.deepEqual(data,{database:{endpoint:'ep-still-wind-b4036sdr',database:'mo_bistro_2',schema:'public',matches_expected:true},deployment:{commit:'b'.repeat(40),id:'dpl_Fixture'},messaging:{normal_sending_allowed:false,manual_preview_test_sending_allowed:false,window_sending_allowed:false,pending_job_delivery_live_allowed:false,all_reviewed_sending_paths_disabled:true}});
 const serialized=JSON.stringify(data);for(const privateValue of [token,secret,'synthetic-password','fixture:',url])assert.ok(!serialized.includes(privateValue));
 assert.deepEqual(f.begins,['read only']);assert.equal(f.ends,1);assert.equal(f.queries.length,5);
 assert.deepEqual(f.queries.slice(0,3).map(q=>q.text),["SET LOCAL statement_timeout = '2s'","SET LOCAL lock_timeout = '500ms'","SET LOCAL idle_in_transaction_session_timeout = '3s'"]);
 assert.ok(f.queries.slice(3).every(q=>/^SELECT\s/.test(q.text)));
 const options=f.clients[0];assert.equal(options.ssl,'verify-full');assert.equal(options.max,1);assert.equal(options.fetch_types,false);assert.equal(options.connect_timeout,3);
 assert.equal(options.connection.application_name,'mo-bistro-release-safety');assert.deepEqual(f.timeouts,[8000]);
});

test('Mismatched runtime identity, driver errors and deadline fail closed without secrets',async()=>{
 for(const input of [{identity:{database:'production'}},{identity:{schema:'private'}},{identity:{read_only:'off'}},{failure:url+' '+token+' '+secret},{timeout:true}]){
  const f=fixture(input);const r=await f.get();assert.equal(r.status,503);assert.deepEqual(await r.json(),{error:'Diagnostic unavailable'});assert.equal(f.ends,1);
 }
 const f=fixture({env:{VERCEL_GIT_COMMIT_SHA:secret,VERCEL_DEPLOYMENT_ID:url}});const data=await(await f.get()).json();assert.deepEqual(data.deployment,{commit:null,id:null});
});

test('Messaging matrix matches actual normal and separate Preview-test policies without importing senders',()=>{
 for(const mode of ['live','test','simulation'])for(const enabled of ['true','false'])for(const permission of ['true','false'])for(const manual of ['true','false'])for(const window of ['true','false']){
  const env={...base,WHATSAPP_MODE:mode,WHATSAPP_ENABLED:enabled,WHATSAPP_ALLOW_LIVE_SEND:permission,WHATSAPP_PREVIEW_TEST_ENABLED:manual,WHATSAPP_WINDOW_TEXT_ENABLED:window};
  const globals={process:{env}};
  const {releaseMessagingPolicy}=load('src/lib/release-safety.ts',{postgres:()=>{throw Error('No DB');}},globals);
  const policy=load('src/lib/whatsapp/policy.ts',{},globals);
  const preview=load('src/lib/whatsapp/preview-test.ts',{'@/lib/postgres-db':{},'@/lib/whatsapp/transport':{}},globals);
  const result=releaseMessagingPolicy(env);assert.equal(result.normal_sending_allowed,policy.liveSendingEnabled());assert.equal(result.manual_preview_test_sending_allowed,preview.previewTestEnabled());
  assert.equal(result.pending_job_delivery_live_allowed,result.normal_sending_allowed);assert.equal(result.window_sending_allowed,result.normal_sending_allowed&&window==='true');assert.equal(result.all_reviewed_sending_paths_disabled,!policy.liveSendingEnabled()&&!preview.previewTestEnabled());
 }
});

test('Authentication predicates run in a real isolated read-only engine; expired, inactive and non-manager rejected',async()=>{
 const {PGlite}=requireDependency('@electric-sql/pglite');const db=new PGlite();
 try{
  await db.exec('CREATE TABLE staff_users(id int,role text,active int); CREATE TABLE staff_sessions(staff_id int,id_hash text,expires_at bigint);');
  const idHash=createHmac('sha256',secret).update(token).digest('hex');
  for(const [role,active,expires,allowed] of [['manager',1,Date.now()+60000,true],['waiter',1,Date.now()+60000,false],['reception',1,Date.now()+60000,false],['manager',0,Date.now()+60000,false],['manager',1,0,false]]){
   await db.exec('DELETE FROM staff_sessions;DELETE FROM staff_users;');await db.query('INSERT INTO staff_users VALUES(1,$1,$2)',[role,active]);await db.query('INSERT INTO staff_sessions VALUES(1,$1,$2)',[idHash,expires]);
   const factory=()=>({end:async()=>{},begin:async(options,fn)=>{assert.equal(options,'read only');return db.transaction(async tx=>{
    await tx.exec('SET TRANSACTION READ ONLY');
    const sql=async(strings,...values)=>{let q='';strings.forEach((s,i)=>{q+=s;if(i<values.length)q+='$'+(i+1);});if(q.includes('current_database()')){assert.equal((await tx.query("SELECT current_setting('transaction_read_only') AS ro")).rows[0].ro,'on');return [{database:'mo_bistro_2',schema:'public',read_only:'on'}];}return(await tx.query(q,values)).rows;};
    return fn(sql);
   });}});
   const mod=load('src/lib/release-safety.ts',{postgres:factory},{process:{env:base},setTimeout,clearTimeout});
   const result=await mod.inspectReleaseSafety(mod.approvedReleaseTarget(base),token,base);assert.equal(result!==null,allowed);
  }
  await assert.rejects(db.transaction(async tx=>{await tx.exec('SET TRANSACTION READ ONLY');await tx.exec("INSERT INTO staff_users VALUES(9,'manager',1)");}),e=>e.code==='25006');
 }finally{await db.close();}
});

test('Diagnostic imports no application pool or worker and Pilot exposes only its exact private route',()=>{
 const helper=fs.readFileSync('src/lib/release-safety.ts','utf8');const route=fs.readFileSync('src/app/api/management/release-safety/route.ts','utf8');
 assert.ok(!/from ["']@\/lib\/(?:db|postgres-db|staff-auth|whatsapp|advanced)/.test(helper+route));
 assert.ok(!/dispatchOutbox|dispatchReminders|publishPilotCalls|sendPreviewTest|fetch\(/.test(helper+route));
 if(fs.existsSync('src/lib/pilot/config.ts')){
  const {pilotPathAllowed}=load('src/lib/pilot/config.ts');assert.equal(pilotPathAllowed('/api/management/release-safety'),true);
  for(const p of ['/api/management/release-safety/extra','/api/management/release-safety-copy','/api/management/operations','/api/whatsapp/test'])assert.equal(pilotPathAllowed(p),false);
 }
});
