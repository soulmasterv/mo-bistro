import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {harness,request} from './handler-harness.mjs';

test('application has no license runtime, API, control panel or blocking UI',()=>{
  for(const file of ['src/lib/licensing/core.ts','src/lib/licensing/enforce.ts',
    'src/app/api/license/status/route.ts','src/app/api/license/admin/[action]/route.ts',
    'src/components/staff-license-guard.tsx','integrations/subscription-control/package.json'])
    assert.equal(fs.existsSync(file),false,file);
  function scan(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    const file=path.join(dir,entry.name);
    if(entry.isDirectory())scan(file);
    else if(/\.(tsx?|css)$/.test(file)) assert.doesNotMatch(fs.readFileSync(file,'utf8'),
      /requireActiveLicense|StaffLicenseGuard|LICENSE_(?:DATABASE|ADMIN|ENFORCEMENT)|restaurant_license|license_audit_log/,file);
  }}
  scan('src');
});

test('authenticated manager mutations work with no licensing module or schema',async()=>{
  const h=harness({query:q=>q.startsWith('UPDATE guests')?[{id:8}]:[]});
  const response=await h.route('management/danger-zone').POST(request('POST',{action:'cancel_queue',confirm:true}));
  assert.equal(response.status,200);
  assert.equal((await response.json()).cancelled,1);
  assert.ok(h.queries.length>0);
  assert.ok(h.queries.every(q=>!/restaurant_license|license_audit_log/.test(q.query)));
});
