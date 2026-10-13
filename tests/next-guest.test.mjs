import test from "node:test";
import assert from "node:assert/strict";
import {harness} from "./handler-harness.mjs";
const req=area=>new Request("https://bistro.test/api/reception/next-guest?area="+area);
test("recommendations deny unauthorized actors before SQL",async()=>{
 for(const actor of [null,{role:"waiter"}]){const h=harness({actor});assert.equal((await h.route("reception/next-guest").GET(req("indoor"))).status,403);assert.equal(h.queries.length,0);}
});
test("Simple Mode selects next fitting guest only with free capacity",async()=>{
 let free=true;
 const h=harness({query:q=>q.includes("SELECT key,value")?[{key:"table_view_mode",value:"simple"},{key:"allow_area_override",value:"false"}]:q.includes("FROM simple_table_capacity")?(free?[{max_party_size:4}]:[]):q.includes("FROM guests")?[{id:2,name:"Next Guest",party_size:2}]:[]});
 const r=await h.route("reception/next-guest").GET(req("indoor"));assert.equal((await r.json()).guest.name,"Next Guest");
 const query=h.queries.find(q=>q.query.includes("FROM guests"));assert.match(query.query,/ORDER BY created_at ASC,id ASC/);assert.match(query.query,/party_size<=/);assert.ok(query.values.includes(false));
 free=false;assert.equal((await(await h.route("reception/next-guest").GET(req("indoor"))).json()).available,false);
 assert.ok(h.queries.every(q=>q.query.startsWith("SELECT")));
});
test("Detailed Mode handles no matching guest and invalid area",async()=>{
 const h=harness({query:q=>q.includes("MAX(seats)")?[{seats:6}]:[]});
 assert.equal((await h.route("reception/next-guest").GET(req("invalid"))).status,400);
 const data=await(await h.route("reception/next-guest").GET(req("outdoor"))).json();assert.equal(data.available,true);assert.equal(data.guest,null);
});
