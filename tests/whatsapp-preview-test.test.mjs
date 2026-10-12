import test from 'node:test';
import assert from 'node:assert/strict';
import { harness, request, load } from './handler-harness.mjs';
function setup(actor = {role:'manager'}) {
  const h = harness({actor}); let calls = 0;
  h.mocks['@/lib/guest-api-security'] = {rejectCrossOrigin: () => null};
  h.mocks['@/lib/whatsapp/preview-test'] = {previewTestRecipient: () => '201012345678', sendPreviewTest: async () => {calls++; return {state:'sent', providerStatus:200, messageId:'mock-id'};}};
  return {h, calls:()=>calls};
}
test('test endpoint denies anonymous, reception and waiter without sending', async () => {
  for(const actor of [null,{role:'reception'},{role:'waiter'}]) {
    const {h,calls}=setup(actor);
    const r=await h.route('whatsapp/test').POST(request('POST',{confirm:true},{'sec-fetch-site':'same-origin'}));
    assert.equal(r.status,actor?403:401); assert.equal(calls(),0);
  }
});
test('rejects recipient override, absent consent and cross-site requests', async () => {
  const {h,calls}=setup();
  for(const body of [{confirm:true,to:'other'}, {}, {confirm:false}])
    assert.equal((await h.route('whatsapp/test').POST(request('POST',body,{'sec-fetch-site':'same-origin'}))).status,400);
  assert.equal((await h.route('whatsapp/test').POST(request('POST',{confirm:true}))).status,403);
  assert.equal(calls(),0);
});
test('explicit action sends once with no SQL or outbox', async () => {
  const {h,calls}=setup();
  const r=await h.route('whatsapp/test').POST(request('POST',{confirm:true},{'sec-fetch-site':'same-origin'}));
  assert.equal(r.status,200); assert.equal((await r.json()).providerStatus,200);
  assert.equal(calls(),1); assert.equal(h.queries.length,0);
});
test('production, live mode and missing recipient never invoke provider', async () => {
  for(const env of [{VERCEL_ENV:'production'},{VERCEL_ENV:'preview',WHATSAPP_MODE:'live'},{VERCEL_ENV:'preview',WHATSAPP_MODE:'test'}]) {
    let calls=0;
    const mod=load('src/lib/whatsapp/preview-test.ts',{'@/lib/whatsapp/transport':{requestMetaTemplate:()=>{calls++;}}},{process:{env}});
    await assert.rejects(mod.sendPreviewTest()); assert.equal(calls,0);
  }
});

test('plain text requires verified 24-hour inbound and never loads templates', async () => {
  let payload, queries=[];
  const env={MO_BISTRO_DB:'postgres',VERCEL_ENV:'preview',WHATSAPP_MODE:'test',WHATSAPP_PREVIEW_TEST_ENABLED:'true',WHATSAPP_TEST_RECIPIENT:'+201012345678',META_WHATSAPP_PHONE_NUMBER_ID:'1234'};
  let windowOpen=false;
  const sql=async (strings,...values)=>{const query=strings.join('?'); queries.push({query,values});return query.includes('SELECT message_id')&&windowOpen?[{message_id:'signed-inbound'}]:[];};
  const mod=load('src/lib/whatsapp/preview-test.ts',{'@/lib/postgres-db':{getPostgres:()=>sql},'@/lib/whatsapp/transport':{requestMetaTemplate:async p=>{payload=p;return {state:'sent'};}}},{process:{env}});
  assert.equal((await mod.sendPreviewTest()).state,'failed'); assert.equal(payload,undefined);
  windowOpen=true;await mod.sendPreviewTest();
  assert.equal(payload.to,'201012345678');assert.equal(payload.type,'text');assert.equal(payload.messaging_product,'whatsapp');
  assert.equal(payload.text.body,'Hello! 👋 This is a test message from Mo Bistro. Your WhatsApp integration is working successfully!');
  assert.equal(payload.template,undefined);
  const check=queries.find(q=>q.query.includes('SELECT message_id'));
  assert.deepEqual(Array.from(check.values),['201012345678','1234']);
  assert.match(check.query,/24 hours/); assert.match(check.query,/provider_timestamp <= NOW/);
});
test('missing verification storage fails closed before provider', async()=>{
  let calls=0;
  const env={MO_BISTRO_DB:'postgres',VERCEL_ENV:'preview',WHATSAPP_MODE:'test',WHATSAPP_PREVIEW_TEST_ENABLED:'true',WHATSAPP_TEST_RECIPIENT:'201012345678',META_WHATSAPP_PHONE_NUMBER_ID:'1234'};
  const mod=load('src/lib/whatsapp/preview-test.ts',{'@/lib/postgres-db':{getPostgres:()=>()=>{throw Error('schema unavailable');}},'@/lib/whatsapp/transport':{requestMetaTemplate:()=>{calls++;}}},{process:{env}});
  await assert.rejects(mod.sendPreviewTest());assert.equal(calls,0);
});
test('rate limit exhaustion prevents sending',async()=>{
  const {h,calls}=setup();h.mocks['@/lib/api-rate-limit']={checkRateLimit:async()=>Response.json({error:'Limited'},{status:429})};
  assert.equal((await h.route('whatsapp/test').POST(request('POST',{confirm:true},{'sec-fetch-site':'same-origin'}))).status,429);
  assert.equal(calls(),0);
});
test('isolated signed test webhook never drains the customer outbox',async()=>{
  const {h}=setup();let dispatched=0,processed=0;
  h.mocks['@/lib/whatsapp/policy']={whatsappEnabled:()=>true,verifyMetaSignature:()=>true};
  h.mocks['@/lib/whatsapp/preview-test']={previewTestEnabled:()=>true};
  h.mocks['@/lib/whatsapp/webhook']={processMetaWebhook:async()=>{processed++;}};
  h.mocks['@/lib/whatsapp/service']={dispatchOutbox:async()=>{dispatched++;}};
  h.mocks['next/server']={after:fn=>fn()};
  const r=await h.route('whatsapp/webhook').POST(request('POST',{object:'whatsapp_business_account',entry:[]}));
  assert.equal(r.status,200);assert.equal(processed,1);assert.equal(dispatched,0);
});
