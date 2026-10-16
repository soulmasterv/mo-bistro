import test from "node:test";
import assert from "node:assert/strict";
import {load} from "./handler-harness.mjs";
const base={MO_BISTRO_DB:"postgres",WHATSAPP_ENABLED:"true",WHATSAPP_MODE:"live",WHATSAPP_ALLOW_LIVE_SEND:"true",WHATSAPP_WINDOW_TEXT_ENABLED:"true",VERCEL_ENV:"preview",WHATSAPP_TEST_RECIPIENT:"201000000000",META_WHATSAPP_PHONE_NUMBER_ID:"1234",WHATSAPP_ASSOCIATION_SECRET:"synthetic-association-secret-long-enough",WHATSAPP_ALMOST_READY_TEXT:"Hi {name}, your booking {booking_id} is almost ready."};
function setup(options={}) {
 const state={open:true,claimed:false,status:"pending",providerResult:{state:"sent",messageId:"mock-id"},...options};const calls=[],queries=[];
 const booking={id:"notification-id",kind:"almost_ready",guest_id:1,revision:1,attempts:1,phone:"201000000000",name:"Guest",confirmation_consent:true,feedback_consent:true,subscribed_at:new Date(),unsubscribed_at:null,opted_out_at:null,guest_status:"waiting",eta_at:new Date(Date.now()+5*60000),seated_at:null,subscription_expires_at:new Date(Date.now()+86400000),tracking_token_hash:"hash",...options.booking};
 const sql=async(strings,...values)=>{const q=strings.join("?");queries.push({q,values});
  if(q.includes("UPDATE whatsapp_notifications SET status='sending'")){if(state.claimed)return [];state.claimed=true;return [{guest_id:1}];}
  if(q.includes("SELECT due_at,status"))return [{status:state.status,due_at:new Date(Date.now()-60000),revision:1}];
  if(q.includes("SELECT phone FROM"))return [{phone:booking.phone}];
  if(q.includes("SELECT n.id"))return [booking];
  if(q.includes("FROM whatsapp_customer_windows")){if(state.schemaError)throw Error("missing");return state.open?[{last_inbound_at:new Date()}]:[];}
  if(q.includes("UPDATE whatsapp_notifications SET status=?"))state.status=values[0];
  return [];
 };sql.begin=fn=>fn(sql);
 const transport={requestMetaTemplate:async p=>{calls.push(p);return state.providerResult;},sendTemplate:async p=>{calls.push(p);return state.providerResult;},templatePayload:job=>{if(!state.template)throw Error("missing template");return {type:"template",job};},publishJob:()=>{throw Error("not used");}};
 const globals={process:{env:{...base,...options.env}}};
 const mocks={"@/lib/postgres-db":{getPostgres:()=>sql},"@/lib/whatsapp/transport":transport};
 const service=load("src/lib/whatsapp/service.ts",mocks,globals);
 const window=load("src/lib/whatsapp/customer-window.ts",mocks,globals);
 return {state,calls,queries,sql,service,window};
}
test("open verified window sends existing event as text once and logs delivery",async()=>{
 const h=setup();await h.service.deliverNotification("notification-id",1);await h.service.deliverNotification("notification-id",1);
 assert.equal(h.calls.length,1);assert.equal(h.calls[0].type,"text");assert.match(h.calls[0].text.body,/booking 1/);assert.equal(h.state.status,"sent");assert.ok(h.queries.some(q=>q.q.includes("INSERT INTO whatsapp_delivery_logs")));
 const proof=h.queries.find(q=>q.q.includes("FROM whatsapp_customer_windows"));assert.deepEqual(Array.from(proof.values),["201000000000","1234"]);assert.match(proof.q,/24 hours/);assert.match(proof.q,/last_inbound_at<=clock_timestamp/);
});
test("expired window falls back only to configured applicable template",async()=>{
 const h=setup({open:false,template:true});await h.service.deliverNotification("notification-id",1);assert.equal(h.calls[0].type,"template");
 const skip=setup({open:false});await skip.service.deliverNotification("notification-id",1);assert.equal(skip.calls.length,0);assert.equal(skip.state.status,"skipped");assert.ok(skip.queries.some(q=>q.values.includes("customer_window_closed_template_unconfigured")));
});

test("almost-ready has default window text without a configured template or text override",async()=>{
 const h=setup({env:{WHATSAPP_ALMOST_READY_TEXT:undefined}});
 await h.service.deliverNotification('notification-id',1);
 await h.service.deliverNotification('notification-id',1);
 assert.equal(h.calls.length,1);
 assert.equal(h.calls[0].type,'text');
 assert.match(h.calls[0].text.body,/Hi Guest/);
 assert.match(h.calls[0].text.body,/booking #1/);
 assert.match(h.calls[0].text.body,/reception will confirm/);
 assert.match(h.calls[0].text.body,/UNSUBSCRIBE or STOP/);
 assert.equal(h.state.status,'sent');
 const closed=setup({open:false,env:{WHATSAPP_ALMOST_READY_TEXT:undefined}});
 await closed.service.deliverNotification('notification-id',1);
 assert.equal(closed.calls.length,0);
 assert.equal(closed.state.status,'skipped');
});

test("subscribed confirmation sends a thank-you once without asking the guest to subscribe again",async()=>{
 const h=setup({booking:{kind:'confirmation'}});
 await h.service.deliverNotification('notification-id',1);
 await h.service.deliverNotification('notification-id',1);
 assert.equal(h.calls.length,1);
 assert.equal(h.calls[0].type,'text');
 assert.match(h.calls[0].text.body,/Thanks for booking with Mo Bistro, Guest!/);
 assert.match(h.calls[0].text.body,/booking #1/);
 assert.match(h.calls[0].text.body,/subscribed to WhatsApp updates/);
 assert.match(h.calls[0].text.body,/UNSUBSCRIBE or STOP/);
 assert.ok(!h.calls[0].text.body.includes('SUBSCRIBE 1'));
 assert.ok(!h.calls[0].text.body.includes('{'));
});
test("missing consent, STOP and unsubscribe block open-window sends",async()=>{
 for(const booking of [{subscribed_at:null},{opted_out_at:new Date()},{unsubscribed_at:new Date()},{kind:"confirmation",confirmation_consent:false},{kind:"review",guest_status:"seated",seated_at:new Date(Date.now()-3600000),feedback_consent:false}]) {
 const h=setup({booking});await h.service.deliverNotification("notification-id",1);assert.equal(h.calls.length,0);
 }
});
test("false live allowance and test mode never call provider",async()=>{
 for(const env of [{WHATSAPP_ALLOW_LIVE_SEND:"false"},{WHATSAPP_MODE:"test"}]){const h=setup({env});await h.service.deliverNotification("notification-id",1);assert.equal(h.calls.length,0);assert.equal(h.state.status,"simulated");}
});
test("Preview recipient mismatch and missing schema fail closed",async()=>{
 for(const options of [{booking:{phone:"201000000001"}},{schemaError:true}]){const h=setup(options);await h.service.deliverNotification("notification-id",1);assert.equal(h.calls.length,0);assert.equal(h.state.status,"skipped");}
});
test("provider uncertainty/definitive failures never resend on duplicate callbacks",async()=>{
 for(const providerResult of [{state:"unknown",error:"meta_network_acceptance_unknown"},{state:"failed",error:"meta_rejected_400"}]){const h=setup({providerResult});await h.service.deliverNotification("notification-id",1);await h.service.deliverNotification("notification-id",1);assert.equal(h.calls.length,1);assert.equal(h.state.status,providerResult.state);}
});
test("window tracking is monotonic, business-bound and rejects future timestamps",async()=>{
 const h=setup();await h.window.recordCustomerWindow(h.sql,"201000000000",Math.floor(Date.now()/1000)-60);assert.ok(h.queries[0].q.includes("GREATEST"));assert.equal(h.queries[0].values[1],"1234");const count=h.queries.length;await h.window.recordCustomerWindow(h.sql,"201000000000",Math.floor(Date.now()/1000)+3600);assert.equal(h.queries.length,count);
});

test("explicit rate limiting retries remain bounded to existing six attempts",async()=>{
 const result={state:"pending",error:"meta_rate_limited"};
 const h=setup({providerResult:result});assert.equal(await h.service.deliverNotification("notification-id",1),"retry");
 const exhausted=setup({providerResult:result,booking:{attempts:6}});assert.equal(await exhausted.service.deliverNotification("notification-id",1),"done");assert.equal(exhausted.state.status,"failed");
});


test("only verified business-matched webhook messages reach window tracking",async()=>{
 let recorded=0;
 const sql=()=>{throw Error("No customer database query expected in isolated Preview fixture");};
 const env={META_WHATSAPP_PHONE_NUMBER_ID:"1234"};
 const webhook=load("src/lib/whatsapp/webhook.ts",{
  "@/lib/postgres-db":{getPostgres:()=>sql},
  "@/lib/whatsapp/customer-window":{recordCustomerWindow:async()=>{recorded++;}},
  "@/lib/whatsapp/preview-test":{recordPreviewInbound:async()=>true},
  "@/lib/whatsapp/service":{},
 },{process:{env}});
 const payload=business=>({object:"whatsapp_business_account",entry:[{changes:[{field:"messages",value:{metadata:{phone_number_id:business},messages:[{id:"signed-message",from:"201000000000",timestamp:String(Math.floor(Date.now()/1000)),type:"text",text:{body:"Hello"}}]}}]}]});
 await webhook.processMetaWebhook(payload("other-business"));assert.equal(recorded,0);
 await webhook.processMetaWebhook(payload("1234"));assert.equal(recorded,1);
});
