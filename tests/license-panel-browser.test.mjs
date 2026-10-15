import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {createRequire,registerHooks} from 'node:module';
import {pathToFileURL} from 'node:url';
import {licenseHarness,TEST_KEY} from './license-control-harness.mjs';
import {createLicenseControlClient} from '../integrations/subscription-control/license-control-client.mjs';
const dependency=createRequire(import.meta.url);
const argument=name=>{const index=process.argv.indexOf(name);return index<0?null:process.argv[index+1];};
const panelDeps=argument('--panel-deps'),playwright=argument('--playwright'),screenshots=argument('--screenshots');

test('real panel routes and custom confirmations wire to real license handlers on synthetic embedded PostgreSQL',
  {skip:!panelDeps||!playwright},async()=>{
  const {chromium}=dependency(playwright);
  const panelRequire=createRequire(path.resolve(panelDeps,'../package.json'));
  const resolved=Object.fromEntries(['express','helmet','express-rate-limit'].map(name=>[name,pathToFileURL(panelRequire.resolve(name)).href]));
  const hooks=registerHooks({resolve(specifier,context,next){
    return Object.hasOwn(resolved,specifier) ? next(resolved[specifier],context) : next(specifier,context);
  }});
  let createApp;
  try {({createApp}=await import('../integrations/subscription-control/app.js'));} finally {hooks.deregister();}
  const h=await licenseHarness();
  const client=createLicenseControlClient({baseUrl:'https://preview.mo-bistro.labbing.space',adminKey:TEST_KEY,fetchImpl:h.backendFetch});
  let mutations=0,hold=false,release;
  const app=createApp({publicDir:path.resolve('integrations/subscription-control/public'),
    authorize:(req,res,next)=>{
      if(req.get('x-synthetic-owner')!=='yes') return res.status(401).json({error:'Synthetic authentication required'});
      req.adminEmail='synthetic-owner@example.test';next();
    },client:{...client,act:async(...args)=>{mutations++;if(hold)await new Promise(resolve=>{release=resolve;});return client.act(...args);}}});
  let origin;
  const server=http.createServer((req,res)=>{
    // Only this localhost fixture maps its own browser Origin to the deployed panel Origin.
    if(req.headers.origin===origin) req.headers.origin='https://subscribtion.labbing.space';
    app(req,res);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  origin=`http://127.0.0.1:${server.address().port}`;
  const browser=await chromium.launch({headless:true});
  const ownerHeaders={'x-synthetic-owner':'yes','cf-access-jwt-assertion':'synthetic-session-only'};
  try {
    assert.equal((await fetch(origin+'/api/license')).status,401);
    const first=await fetch(origin+'/api/license',{headers:ownerHeaders});
    assert.match(first.headers.get('content-security-policy'),/script-src 'self'/);
    const state=await first.json();assert.equal(state.ready,true);assert.equal(JSON.stringify(state).includes(TEST_KEY),false);
    for(const extra of [{Origin:'https://evil.test','X-CSRF-Token':state.csrfToken},{Origin:'https://subscribtion.labbing.space'}]) {
      assert.equal((await fetch(origin+'/api/license/action',{method:'POST',headers:{...ownerHeaders,...extra,'Content-Type':'application/json'},body:JSON.stringify({action:'activate',version:state.version,confirm:true})})).status,403);
    }
    assert.equal(mutations,0);
    const page=await browser.newPage({viewport:{width:390,height:844},extraHTTPHeaders:ownerHeaders});
    const dialogs=[];page.on('dialog',dialog=>{dialogs.push(dialog.type());void dialog.dismiss();});
    await page.goto(origin);
    await page.waitForFunction(()=>!document.getElementById('activate').disabled);
    await page.getByRole('button',{name:'Activate',exact:true}).click();
    await page.getByRole('alertdialog').getByRole('button',{name:'Cancel',exact:true}).click();assert.equal(mutations,0);
    await page.getByRole('button',{name:'Activate',exact:true}).click();hold=true;
    await page.getByRole('alertdialog').getByRole('button',{name:'Activate',exact:true}).click();
    await page.getByRole('alertdialog').getByRole('button',{name:'Activating…',exact:true}).waitFor();
    assert.equal(await page.getByRole('alertdialog').getByRole('button',{name:'Cancel',exact:true}).isDisabled(),true);
    while(!release)await new Promise(resolve=>setTimeout(resolve,10));
    assert.equal(mutations,1);hold=false;release();release=null;
    await page.waitForFunction(()=>document.getElementById('status').textContent==='active');
    const prior=await client.inspect();
    await page.getByRole('button',{name:'Renew one month',exact:true}).click();
    await page.getByRole('alertdialog').getByRole('button',{name:'Renew one month',exact:true}).click();
    await page.getByText('License action completed. Current status refreshed.',{exact:true}).waitFor();
    await page.waitForFunction(()=>document.getElementById('confirmation').hidden);
    const renewed=await client.inspect();assert.notEqual(renewed.license.expires_at,prior.license.expires_at);
    // A stale manual/browser retry cannot add a second month.
    const freshCsrf=await (await fetch(origin+'/api/license',{headers:ownerHeaders})).json();
    const stale=await fetch(origin+'/api/license/action',{method:'POST',headers:{...ownerHeaders,Origin:'https://subscribtion.labbing.space','Content-Type':'application/json','X-CSRF-Token':freshCsrf.csrfToken},
      body:JSON.stringify({action:'renew',version:prior.version,confirm:true})});
    assert.equal(stale.status,412);assert.equal((await client.inspect()).license.expires_at,renewed.license.expires_at);
    await page.getByRole('button',{name:'Suspend',exact:true}).click();await page.getByRole('alertdialog').getByRole('button',{name:'Suspend',exact:true}).click();
    await page.waitForFunction(()=>document.getElementById('status').textContent==='suspended');
    assert.equal((await h.enforce.requireActiveLicense()).status,403);
    await page.getByRole('button',{name:'Reactivate',exact:true}).click();await page.getByRole('alertdialog').getByRole('button',{name:'Reactivate',exact:true}).click();
    await page.waitForFunction(()=>document.getElementById('status').textContent==='active');
    assert.equal((await client.inspect()).license.expires_at,renewed.license.expires_at);
    await page.getByRole('button',{name:'View history',exact:true}).click();await page.getByRole('heading',{name:'Audit history',exact:true}).waitFor();
    assert.equal(await page.locator('.audit-entry').count(),4);assert.deepEqual(dialogs,[]);
    if(screenshots) fs.mkdirSync(screenshots,{recursive:true});
    for(const width of [390,1440]) {
      await page.setViewportSize({width,height:900});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      if(screenshots) await page.screenshot({path:path.join(screenshots,`license-panel-${width}.png`),fullPage:true});
    }
    await page.close();
  } finally {await browser.close();await new Promise(resolve=>server.close(resolve));await h.close();}
});
