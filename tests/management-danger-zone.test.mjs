import test from 'node:test';
import assert from 'node:assert/strict';
import {harness,request} from './handler-harness.mjs';
import {licenseHarness} from './license-control-harness.mjs';

test('a saved suspension blocks bulk cancellation before any booking SQL; reactivation restores the action',async()=>{
  const license=await licenseHarness();
  try {
    await license.db.exec("INSERT INTO restaurant_license(id,status,plan,expires_at) VALUES(1,'suspended','monthly',NOW()+INTERVAL '1 month')");
    const h=harness({query:q=>q.startsWith('UPDATE guests')?[{id:8}]:[]});
    h.mocks['@/lib/licensing/enforce']=license.enforce;
    const denied=await h.route('management/danger-zone').POST(request('POST',{action:'cancel_queue',confirm:true}));
    assert.equal(denied.status,403);assert.equal((await denied.json()).license_status,'suspended');
    assert.equal(h.queries.length,0);
    await license.db.exec("UPDATE restaurant_license SET status='active' WHERE id=1");
    const allowed=await h.route('management/danger-zone').POST(request('POST',{action:'cancel_queue',confirm:true}));
    assert.equal(allowed.status,200);assert.equal((await allowed.json()).cancelled,1);
  } finally {await license.close();}
});

test('bulk actions reject anonymous/non-manager, cross-origin, inactive license and malformed requests before SQL',async()=>{
  for(const actor of [null,{id:2,role:'reception'},{id:3,role:'waiter'}]) {
    const h=harness({actor});
    assert.equal((await h.route('management/danger-zone').POST(request('POST',{action:'free_tables',confirm:true}))).status,actor?403:401);
    assert.equal(h.queries.length,0);
  }
  for(const body of [{action:'free_tables'}, {action:'free_tables',confirm:false},
    {action:'delete_all',confirm:true},{action:'free_tables',confirm:true,recipient:'other'}]) {
    const h=harness();assert.equal((await h.route('management/danger-zone').POST(request('POST',body))).status,400);assert.equal(h.queries.length,0);
  }
  const h=harness();
  assert.equal((await h.route('management/danger-zone').POST(request('POST',{action:'free_tables',confirm:true},{origin:'https://other.test'}))).status,403);
  assert.equal(h.queries.length,0);
  const inactive=harness({license:false});
  assert.equal((await inactive.route('management/danger-zone').POST(request('POST',{action:'free_tables',confirm:true}))).status,403);
  assert.equal(inactive.queries.length,0);
});

test('queue cancellation targets active bookings, invalidates pending jobs and does not delete or dispatch',async()=>{
  const h=harness({query:q=>q.startsWith('UPDATE guests')?[{id:8},{id:9}]:q.includes('to_regclass')?[{available:true}]:[]});
  const response=await h.route('management/danger-zone').POST(request('POST',{action:'cancel_queue',confirm:true}));
  assert.equal(response.status,200);assert.equal((await response.json()).cancelled,2);
  assert.match(h.queries[0].query,/741122/);assert.match(h.queries[1].query,/91401283/);
  const guests=h.queries.find(q=>q.query.startsWith('UPDATE guests'));
  assert.match(guests.query,/WHERE status IN \('waiting','called'\)/);
  const jobs=h.queries.find(q=>q.query.startsWith('UPDATE whatsapp_notifications'));
  assert.match(jobs.query,/status IN \('pending','scheduled'\)/);assert.match(jobs.query,/revision=revision\+1/);
  assert.deepEqual(Array.from(jobs.values[0]),[8,9]);
  assert.equal(h.queries.some(q=>/DELETE|TRUNCATE|whatsapp_booking_consents|whatsapp_contact_preferences/.test(q.query)),false);
});

test('free all includes named and anonymous inventory, preserves guest status and authoritative seating time',async()=>{
  const h=harness({query:q=>q.includes('to_regclass')?[{simple_capacity:true,simple_events:true,ready_requests:true}]:
    q.startsWith('SELECT area,occupied_tables')?[{area:'indoor',occupied_tables:2},{area:'outdoor',occupied_tables:3}]:
    q.startsWith('UPDATE restaurant_tables')?[{id:1},{id:2}]:[]});
  const response=await h.route('management/danger-zone').POST(request('POST',{action:'free_tables',confirm:true}));
  assert.equal(response.status,200);assert.equal((await response.json()).freed,7);
  assert.ok(h.queries.some(q=>q.query.includes("SET occupied_tables=0")));
  assert.equal(h.queries.filter(q=>q.query.includes('INSERT INTO simple_table_events')).length,2);
  assert.ok(h.queries.some(q=>q.query.includes("UPDATE seating_history SET released_at=")));
  const guestUpdate=h.queries.find(q=>q.query.startsWith('UPDATE guests')).query;
  assert.match(guestUpdate,/SET table_id=NULL/);assert.doesNotMatch(guestUpdate,/SET status|seated_at/);
  assert.ok(h.queries.some(q=>q.query.includes("UPDATE table_ready_requests SET status='cancelled'")));
});

test('schema conflict fails before inventory updates and SQL errors are safe failures',async()=>{
  const h=harness({query:q=>q.includes('to_regclass')?[{simple_capacity:true,simple_events:false,ready_requests:true}]:[]});
  assert.equal((await h.route('management/danger-zone').POST(request('POST',{action:'free_tables',confirm:true}))).status,503);
  assert.equal(h.queries.some(q=>q.query.startsWith('UPDATE')||q.query.startsWith('INSERT')),false);
  const broken=harness({query:()=>{throw Error('synthetic private connection detail');}});
  const response=await broken.route('management/danger-zone').POST(request('POST',{action:'cancel_queue',confirm:true}));
  assert.equal(response.status,503);assert.equal((await response.text()).includes('private connection'),false);
});
