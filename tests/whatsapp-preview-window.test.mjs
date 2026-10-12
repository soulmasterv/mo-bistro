import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { load } from "./handler-harness.mjs";
const db=new PGlite();
await db.exec(fs.readFileSync("migrations/20261012_whatsapp_preview_test.sql","utf8"));
const sql=async(strings,...values)=>(await db.query(strings.reduce((q,s,i)=>q+(i?"$"+i:"")+s,""),values.map(v=>v instanceof Date?v.toISOString():v))).rows;
const env={VERCEL_ENV:"preview",WHATSAPP_MODE:"test",MO_BISTRO_DB:"postgres",WHATSAPP_PREVIEW_TEST_ENABLED:"true",WHATSAPP_TEST_RECIPIENT:"201012345678",META_WHATSAPP_PHONE_NUMBER_ID:"1234"};
let sent=[];
const mod=load("src/lib/whatsapp/preview-test.ts",{"@/lib/postgres-db":{getPostgres:()=>sql},"@/lib/whatsapp/transport":{requestMetaTemplate:async payload=>{sent.push(payload);return {state:"sent",providerStatus:200,messageId:"mock-id"};}}},{process:{env}});
test("actual SQL blocks missing, stale, future, wrong sender and wrong business evidence",async()=>{
  for(const [phone,business,age] of [["201012345678","1234",25*3600],["201012345678","1234",-3600],["201000000000","1234",60],["201012345678","9999",60]]) {
    await db.exec("TRUNCATE whatsapp_preview_inbound,whatsapp_preview_tests");
    await sql`INSERT INTO whatsapp_preview_inbound VALUES ('inbound',${phone},${business},${new Date(Date.now()-age*1000)},NOW())`;
    assert.equal((await mod.sendPreviewTest()).state,"failed");
  }
  assert.equal(sent.length,0);
});
test("fresh verified inbound permits exact text, stores safe result and reconciles delivery",async()=>{
  await db.exec("TRUNCATE whatsapp_preview_inbound,whatsapp_preview_tests");
  const timestamp=Math.floor(Date.now()/1000)-60;
  assert.equal(await mod.recordPreviewInbound("signed-inbound","201012345678",timestamp),true);
  assert.equal(await mod.recordPreviewInbound("wrong-sender","201000000000",timestamp),false);
  await mod.sendPreviewTest();assert.equal(sent.length,1);assert.equal(sent[0].text.body,mod.TEST_TEXT);
  await mod.recordPreviewDelivery("mock-id","delivered",timestamp+60);
  await mod.recordPreviewDelivery("mock-id","sent",timestamp+59);
  assert.equal((await mod.previewTestState()).result.delivery_status,"delivered");
  assert.equal((await db.query("SELECT count(*) FROM whatsapp_preview_inbound")).rows[0].count,1);
});
test.after(async()=>db.close());
