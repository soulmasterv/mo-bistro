import test from 'node:test';
import assert from 'node:assert/strict';
import {load} from './handler-harness.mjs';

function publisher(overrides={},response=()=>Response.json({messageId:'mock-publication',privateField:'discard'})) {
  const calls=[];
  const env={MO_BISTRO_DB:'postgres',WHATSAPP_ENABLED:'true',WHATSAPP_MODE:'live',WHATSAPP_ALLOW_LIVE_SEND:'true',
    QSTASH_TOKEN:'synthetic-scheduler-token',WHATSAPP_CALLBACK_BASE_URL:'https://preview.mo-bistro.labbing.space',...overrides};
  const globals={process:{env},AbortSignal,fetch:async(url,init)=>{calls.push({url,init});return response();}};
  return {calls,transport:load('src/lib/whatsapp/transport.ts',{},globals)};
}

test('QStash publish uses the documented destination path and retains deduplication',async()=>{
  const h=publisher(); const due=new Date('2026-10-16T13:00:00Z');
  const result=await h.transport.publishJob('synthetic-job',3,due);
  assert.deepEqual(JSON.parse(JSON.stringify(result)),{messageId:'mock-publication'});
  assert.equal(h.calls.length,1);
  const {url,init}=h.calls[0];
  assert.equal(url,'https://qstash.upstash.io/v2/publish/https://preview.mo-bistro.labbing.space/api/whatsapp/jobs');
  assert.equal(init.headers['Upstash-Deduplication-Id'],'synthetic-job:3');
  assert.equal(init.headers['Upstash-Not-Before'],String(Math.ceil(due.getTime()/1000)));
  assert.equal(init.redirect,'error');
  assert.deepEqual(JSON.parse(init.body),{notificationId:'synthetic-job',revision:3});
});

test('safe configuration checks prevent token forwarding to unintended destinations',async()=>{
  for(const [env,code] of [
    [{QSTASH_TOKEN:''},'scheduler_token_missing'],
    [{WHATSAPP_CALLBACK_BASE_URL:'http://example.test'},'scheduler_callback_invalid'],
    ...['https://example.test','https://qstash.upstash.io.evil.test','https://user:password@qstash.upstash.io',
      'https://qstash.upstash.io/path','https://qstash.upstash.io?token=secret'].map(QSTASH_URL=>[{QSTASH_URL},'scheduler_url_invalid'])
  ]) {
    const h=publisher(env);
    await assert.rejects(()=>h.transport.publishJob('job',1,new Date()),error=>error.message===code);
    assert.equal(h.calls.length,0);
  }
  const regional=publisher({QSTASH_URL:'https://qstash-eu-central-1.upstash.io'});
  await regional.transport.publishJob('job',1,new Date());
  assert.ok(regional.calls[0].url.startsWith('https://qstash-eu-central-1.upstash.io/v2/publish/https://'));
});

test('publication errors contain bounded codes rather than provider bodies or credentials',async()=>{
  for(const status of [400,401,403,404,429,500]) {
    const h=publisher({},()=>new Response('private-provider-response',{status}));
    await assert.rejects(()=>h.transport.publishJob('job',1,new Date()),error=>error.message===`scheduler_http_${status}`);
  }
  for(const [response,code] of [
    [()=>{throw Error('private-network-details');},'scheduler_network_failed'],
    [()=>new Response('not JSON'),'scheduler_response_invalid'],
    [()=>Response.json({error:'private-provider-details'}),'scheduler_response_invalid'],
    [()=>Response.json({messageId:''}),'scheduler_response_invalid']
  ]) {
    const h=publisher({},response);
    await assert.rejects(()=>h.transport.publishJob('job',1,new Date()),error=>error.message===code);
  }
});

test('test mode and disabled live permission never call the scheduler',async()=>{
  for(const env of [{WHATSAPP_MODE:'test'},{WHATSAPP_ALLOW_LIVE_SEND:'false'}]) {
    const h=publisher(env);
    assert.equal((await h.transport.publishJob('job',2,new Date())).messageId,'test:job:2');
    assert.equal(h.calls.length,0);
  }
});
