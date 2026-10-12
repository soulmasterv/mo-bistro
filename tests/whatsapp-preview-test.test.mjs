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
test('Preview transport enforces configured recipient and synthetic booking', async () => {
  let payload;
  const env={MO_BISTRO_DB:'postgres',VERCEL_ENV:'preview',WHATSAPP_MODE:'test',WHATSAPP_PREVIEW_TEST_ENABLED:'true',WHATSAPP_TEST_RECIPIENT:'+201012345678',WHATSAPP_CONFIRMATION_TEMPLATE:'booking_confirmation',WHATSAPP_TEMPLATE_LANGUAGE:'en'};
  const mod=load('src/lib/whatsapp/preview-test.ts',{'@/lib/whatsapp/transport':{templatePayload:(job,booking,code)=>({job,booking,code}),requestMetaTemplate:async p=>{payload=p;return {state:'sent'};}}},{process:{env}});
  await mod.sendPreviewTest(); assert.equal(payload.booking.phone,'201012345678'); assert.equal(payload.job.guest_id,0);
});
