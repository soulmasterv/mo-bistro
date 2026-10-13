import test from "node:test";
import assert from "node:assert/strict";
import {createHmac} from "node:crypto";
import {load} from "./handler-harness.mjs";
const env={MO_BISTRO_DB:"postgres",WHATSAPP_ENABLED:"true",VERCEL_ENV:"preview",WHATSAPP_PREVIEW_TEST_ENABLED:"true",WHATSAPP_MODE:"test",WHATSAPP_ALLOW_LIVE_SEND:"false",WHATSAPP_TEST_RECIPIENT:"201000000000",META_WHATSAPP_PHONE_NUMBER_ID:"1234",META_APP_SECRET:"offline-synthetic-secret"};
function setup(failingRelation, overrides={}) {
 const queries=[],logs=[];let providers=0,dispatches=0;
 const sql=async(strings,...values)=>{
  const query=strings.join("?");queries.push({query,values});
  if(failingRelation && query.includes(failingRelation)) throw Object.assign(Error("private connection information"),{code:"42P01"});
  return [];
 };
 sql.begin=fn=>fn(sql);
 const handler=load("src/app/api/whatsapp/webhook/route.ts",{
  "@/lib/postgres-db":{getPostgres:()=>sql},
  "@/lib/whatsapp/transport":{requestMetaTemplate:()=>{providers++;throw Error("Provider forbidden");}},
  "@/lib/whatsapp/service":{dispatchOutbox:()=>{dispatches++;},scheduleAlmostReady:()=>{},scheduleReview:()=>{}},
  "next/server":{after:()=>{throw Error("Queue dispatch forbidden");}}
 },{process:{env:{...env,...overrides}},console:{error:(...args)=>logs.push(args)}});
 return {handler,queries,logs,providers:()=>providers,dispatches:()=>dispatches};
}
function request(kind="inbound",signed=true) {
 const value={metadata:{phone_number_id:"1234"}};
 if(kind==="inbound") value.messages=[{id:"synthetic-inbound",from:"201000000000",timestamp:String(Math.floor(Date.now()/1000)-60),type:"text",text:{body:"Hello"}}];
 else value.statuses=[{id:"synthetic-status",status:"delivered",timestamp:String(Math.floor(Date.now()/1000)-60)}];
 const raw=JSON.stringify({object:"whatsapp_business_account",entry:[{changes:[{field:"messages",value}]}]});
 const headers={"content-type":"application/json"};if(signed) headers["x-hub-signature-256"]="sha256="+createHmac("sha256",env.META_APP_SECRET).update(raw).digest("hex");
 return new Request("https://preview.test/api/whatsapp/webhook",{method:"POST",headers,body:raw});
}
for(const [kind,relation] of [["inbound","whatsapp_preview_inbound"],["delivery","whatsapp_preview_tests"]])
 test(`missing ${relation} reproduces signed Meta POST 503 without provider or queue calls`,async()=>{
  const h=setup(relation);const r=await h.handler.POST(request(kind));
  assert.equal(r.status,503);assert.equal((await r.json()).error,"Webhook processing unavailable");
  assert.match(JSON.stringify(h.logs),/42P01/);assert.doesNotMatch(JSON.stringify(h.logs),/private|synthetic-inbound|201000000000|offline-synthetic-secret/);
  assert.equal(h.providers(),0);assert.equal(h.dispatches(),0);
 });
test("existing Preview relations accept verified test inbound without touching customer tables",async()=>{
 const h=setup(null);assert.equal((await h.handler.POST(request())).status,200);
 assert.equal(h.queries.length,1);assert.match(h.queries[0].query,/whatsapp_preview_inbound/);assert.equal(h.providers(),0);assert.equal(h.dispatches(),0);
});
test("disabled configuration is a separate 503 before SQL",async()=>{
 const h=setup(null,{WHATSAPP_ENABLED:"false"});const r=await h.handler.POST(request());assert.equal(r.status,503);assert.equal((await r.json()).error,"Disabled");assert.equal(h.queries.length,0);
});
test("unsigned webhook remains 401 with no SQL",async()=>{
 const h=setup(null);assert.equal((await h.handler.POST(request("inbound",false))).status,401);assert.equal(h.queries.length,0);
});
