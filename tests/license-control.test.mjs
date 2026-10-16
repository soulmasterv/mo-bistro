import test from 'node:test';
import assert from 'node:assert/strict';
import {licenseHarness,TEST_KEY} from './license-control-harness.mjs';
import {createLicenseControlClient} from '../integrations/subscription-control/license-control-client.mjs';

test('one database deadline grants 24 hours, rejects reset/replay and blocks at expiry without a cron or browser acknowledgement',async()=>{
  const h=await licenseHarness();
  const client=createLicenseControlClient({baseUrl:'https://preview.mo-bistro.labbing.space',adminKey:TEST_KEY,fetchImpl:h.backendFetch});
  try {
    let setup=await client.inspect();assert.equal(setup.graceReady,true);
    await client.act('activate',setup.version);setup=await client.inspect();const activeVersion=setup.version;
    const expiry=setup.license.expires_at;
    await client.act('suspend-notice',setup.version);setup=await client.inspect();
    assert.equal(setup.license.status,'grace');assert.equal(setup.license.licensed,true);
    assert.ok(Math.abs(Date.parse(setup.license.suspension_due_at)-Date.parse(setup.license.server_now)-86400000)<2000);
    const due=setup.license.suspension_due_at;
    assert.equal(await h.enforce.requireActiveLicense(),null);
    await assert.rejects(client.act('suspend-notice',setup.version),e=>e.status===409);
    await assert.rejects(client.act('suspend-notice',activeVersion),e=>e.status===412);
    assert.equal((await client.inspect()).license.suspension_due_at,due);
    // Explicit owner grace remains usable even if normal billing expiry passes.
    await h.db.exec("UPDATE restaurant_license SET expires_at=NOW()-INTERVAL '1 second'");
    assert.equal(await h.enforce.requireActiveLicense(),null);
    await h.db.exec("UPDATE restaurant_license SET suspension_due_at=NOW()-INTERVAL '1 millisecond'");
    assert.equal((await h.enforce.requireActiveLicense()).status,403);
    setup=await client.inspect();assert.equal(setup.license.status,'suspended');
    await assert.rejects(client.act('suspend-notice',setup.version),e=>e.status===409);
    await assert.rejects(client.act('activate',setup.version),e=>e.status===409); // Expired billing requires renewal.
    await client.act('renew',setup.version);setup=await client.inspect();
    assert.equal(setup.license.status,'active');assert.equal(setup.license.suspension_due_at,null);
    await client.act('suspend-notice',setup.version);setup=await client.inspect();
    const beforeImmediate=setup.license.expires_at;
    await client.act('suspend',setup.version);setup=await client.inspect();
    assert.equal(setup.license.status,'suspended');assert.equal(setup.license.suspension_due_at,null);
    assert.equal((await h.enforce.requireActiveLicense()).status,403);
    await client.act('activate',setup.version);setup=await client.inspect();
    assert.equal(setup.license.expires_at,beforeImmediate);assert.notEqual(setup.version,activeVersion);
    await assert.rejects(client.act('renew',activeVersion),e=>e.status===412);
    const audit=await client.audit();assert.ok(audit.entries.some(e=>e.details.mode==='grace'));
    assert.notEqual(expiry,null);
  }finally{await h.close();}
});

test('legacy licensing schema keeps immediate suspension working but refuses 24-hour notices explicitly',async()=>{
  const h=await licenseHarness({grace:false});
  const client=createLicenseControlClient({baseUrl:'https://preview.mo-bistro.labbing.space',adminKey:TEST_KEY,fetchImpl:h.backendFetch});
  try {
    let setup=await client.inspect();assert.equal(setup.graceReady,false);
    await client.act('activate',setup.version);setup=await client.inspect();
    await assert.rejects(client.act('suspend-notice',setup.version),e=>e.status===409);
    await client.act('suspend',setup.version);assert.equal((await client.inspect()).license.status,'suspended');
  }finally{await h.close();}
});

test('server-to-server panel client activates, renews, rejects repeated versions, suspends and reactivates without extending expiry',async()=>{
  const h=await licenseHarness();
  try {
    const client=createLicenseControlClient({baseUrl:'https://preview.mo-bistro.labbing.space',adminKey:TEST_KEY,fetchImpl:h.backendFetch});
    let setup=await client.inspect();assert.equal(setup.ready,true);assert.equal(setup.license.status,'unconfigured');
    assert.equal(h.queries.some(q=>/^\s*(INSERT|UPDATE|DELETE)\b/.test(q)),false); // Privilege-name strings inside SELECT are read-only.
    const activation=await client.act('activate',setup.version);assert.equal(activation.success,true);
    setup=await client.inspect();assert.equal(setup.license.licensed,true);
    const initialExpiry=new Date(setup.license.expires_at).getTime();
    const version=setup.version;
    await client.act('renew',version);
    const renewed=await client.inspect();assert.ok(new Date(renewed.license.expires_at).getTime()>initialExpiry+27*86400000);
    await assert.rejects(client.act('renew',version),error=>error.status===412);
    assert.equal((await client.inspect()).license.expires_at,renewed.license.expires_at);
    await client.act('suspend',renewed.version);
    setup=await client.inspect();assert.equal(setup.license.status,'suspended');assert.equal(setup.license.licensed,false);
    assert.equal((await h.enforce.requireActiveLicense()).status,403);
    assert.equal((await h.status.GET(new Request('https://bistro.test/api/license/status',{headers:{Authorization:`Bearer ${TEST_KEY}`}}))).status,403);
    await client.act('activate',setup.version); // Panel's Reactivate action.
    setup=await client.inspect();assert.equal(setup.license.licensed,true);assert.equal(setup.license.expires_at,renewed.license.expires_at);
    assert.equal(await h.enforce.requireActiveLicense(),null);
    await h.db.exec("UPDATE restaurant_license SET expires_at=NOW()-INTERVAL '1 day',status='suspended'");
    setup=await client.inspect();await assert.rejects(client.act('activate',setup.version),error=>error.status===409);
    await client.act('renew',setup.version);setup=await client.inspect();
    assert.equal(setup.license.licensed,true);assert.ok(new Date(setup.license.expires_at).getTime()>Date.now()+27*86400000);
    const audit=await client.audit();assert.equal(audit.entries.length,5); // Repeated/stale/rejected operations add no audit entry.
    assert.equal(JSON.stringify(audit).includes(TEST_KEY),false);
    const beforeFailure=setup.license.expires_at;
    await h.db.exec(`CREATE FUNCTION reject_synthetic_license_audit() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'synthetic audit unavailable'; END $$;
      CREATE TRIGGER reject_synthetic_license_audit BEFORE INSERT ON license_audit_log
      FOR EACH ROW EXECUTE FUNCTION reject_synthetic_license_audit();`);
    await assert.rejects(client.act('renew',setup.version),error=>error.status===503&&error.uncertain);
    assert.equal((await client.inspect()).license.expires_at,beforeFailure);
    assert.equal((await client.audit()).entries.length,5);
  } finally {await h.close();}
});

test('owner auth, no-browser writes and explicit version preconditions fail before license writes',async()=>{
  const h=await licenseHarness();
  try {
    const endpoint='https://bistro.test/api/license/admin/renew';
    for(const [headers,expected] of [
      [{},401],[{Authorization:'Bearer '+'cd'.repeat(32)},401],
      [{Authorization:`Bearer ${TEST_KEY}`,Origin:'https://subscribtion.labbing.space'},403],
      [{Authorization:`Bearer ${TEST_KEY}`},428],
      [{Authorization:`Bearer ${TEST_KEY}`,'If-Match':'*'},428]]) {
      const response=await h.admin.POST(new Request(endpoint,{method:'POST',headers}),{params:Promise.resolve({action:'renew'})});
      assert.equal(response.status,expected);
    }
    assert.equal(h.queries.length,0);
    assert.equal((await h.admin.GET(new Request(endpoint),{params:Promise.resolve({action:'setup'})})).status,401);
    const original=h.env.LICENSE_ADMIN_DATABASE_URL;
    for(const other of [original.replace('mo_bistro_2','production_db'),original.replace('ep-test-pooler','ep-another-pooler'),original+'?host=evil.example']) {
      h.env.LICENSE_ADMIN_DATABASE_URL=other;assert.equal(h.core.licenseTargetsMatch(),false);
      assert.throws(()=>h.core.licenseAdminDb(),/do not match/);
    }
    h.env.LICENSE_ADMIN_DATABASE_URL=original;assert.equal(h.core.licenseTargetsMatch(),true);
  } finally {await h.close();}
});

test('panel client forbids off-target/Production destinations and never retries an uncertain action',async()=>{
  for(const baseUrl of ['https://mo-bistro.labbing.space','http://preview.mo-bistro.labbing.space','https://evil.example','https://preview.mo-bistro.labbing.space/path','https://preview.mo-bistro.labbing.space/?token=x'])
    assert.throws(()=>createLicenseControlClient({baseUrl,adminKey:TEST_KEY}),/approved/);
  let calls=0;
  const client=createLicenseControlClient({baseUrl:'https://preview.mo-bistro.labbing.space',adminKey:TEST_KEY,fetchImpl:async()=>{calls++;throw Error('synthetic private failure');}});
  await assert.rejects(client.act('renew','"license-'+'a'.repeat(64)+'"'),error=>error.uncertain===true && !error.message.includes(TEST_KEY));
  assert.equal(calls,1);
});
