import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {requireDependency} from './handler-harness.mjs';
const arg=name=>{const i=process.argv.indexOf(name);return i<0?null:process.argv[i+1];};
const playwright=arg('--playwright');

test('open staff sessions visibly lock on suspension, recover on reactivation and fail safely on unavailable verification',
  {skip:!playwright},async()=>{
  const ts=requireDependency('typescript');
  const {webpack}=requireDependency('next/dist/compiled/webpack/webpack');
  const {chromium}=requireDependency(playwright);
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'bistro-license-ui-'));
  const component=ts.transpileModule(fs.readFileSync('src/components/staff-license-guard.tsx','utf8'),{
    compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX},
  }).outputText;
  fs.writeFileSync(path.join(temp,'guard.js'),component);
  fs.writeFileSync(path.join(temp,'entry.js'),`import React from 'react';import {createRoot} from 'react-dom/client';import Guard from './guard.js';createRoot(document.getElementById('root')).render(React.createElement(Guard));`);
  await new Promise((resolve,reject)=>{
    const compiler=webpack({mode:'development',devtool:false,entry:path.join(temp,'entry.js'),
      resolve:{modules:['node_modules',path.resolve('node_modules')]},output:{path:temp,filename:'bundle.js'}});
    compiler.run((error,stats)=>compiler.close(()=>error||stats.hasErrors()?reject(error||Error(stats.toString({all:false,errors:true}))):resolve()));
  });
  let state='active',fail=false,due=Date.now()+86400000;
  const css=fs.readFileSync('src/app/globals.css','utf8').replace('@import "tailwindcss";','');
  const server=http.createServer((req,res)=>{
    if(req.url==='/bundle.js'){res.setHeader('Content-Type','application/javascript');return res.end(fs.readFileSync(path.join(temp,'bundle.js')));}
    if(req.url==='/api/license/status'){
      const licensed=['active','grace'].includes(state);
      res.setHeader('Content-Type','application/json');res.statusCode=fail?503:licensed?200:403;
      return res.end(JSON.stringify(fail?{error:'unavailable'}:{licensed,status:state,server_now:new Date().toISOString(),suspension_due_at:state==='grace'?new Date(due).toISOString():null}));
    }
    res.setHeader('Content-Type','text/html');res.end(`<style>${css}body{margin:0;font-family:Arial,sans-serif}</style><button id="underlying">Seat guest</button><div id="root"></div><script src="/bundle.js"></script>`);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser=await chromium.launch({headless:true});
  try {
    const page=await browser.newPage({viewport:{width:390,height:844}});
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.waitForFunction(()=>document.querySelector('dialog')&&!document.querySelector('dialog').open);
    state='suspended';await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
    await page.getByRole('heading',{name:'Subscription suspended',exact:true}).waitFor();
    assert.equal(await page.locator('dialog').evaluate(e=>e.matches(':modal')),true);
    await page.keyboard.press('Escape');assert.equal(await page.locator('dialog').evaluate(e=>e.open),true);
    await page.keyboard.press('Tab');assert.equal(await page.locator('#underlying').evaluate(e=>e===document.activeElement),false);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    assert.equal(await page.getByRole('button',{name:'Check again',exact:true}).count(),0);
    assert.equal(await page.getByRole('button',{name:'Sign out',exact:true}).count(),1);
    const screenshots=arg('--screenshots');
    if(screenshots){fs.mkdirSync(screenshots,{recursive:true});await page.screenshot({path:path.join(screenshots,'subscription-suspended-mobile.png')});}
    state='active';await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
    await page.waitForFunction(()=>!document.querySelector('dialog').open);
    state='expired';await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
    await page.getByRole('heading',{name:'Subscription expired',exact:true}).waitFor();
    fail=true;await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
    await page.getByRole('heading',{name:'Subscription check unavailable',exact:true}).waitFor();
    fail=false;state='active';await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
    await page.waitForFunction(()=>!document.querySelector('dialog').open);
    state='grace';await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
    await page.getByRole('heading',{name:'Your service will pause',exact:true}).waitFor();
    await page.getByRole('button',{name:'Continue working',exact:true}).click();
    await page.getByText(/Service pauses in 24h/).waitFor();
    assert.equal(await page.locator('dialog').evaluate(e=>e.open),false);
    await page.reload();await page.getByRole('button',{name:'View notice',exact:true}).waitFor();
    assert.equal(await page.locator('dialog').evaluate(e=>e.open),false); // Same deadline acknowledgement survives reload.
    await page.getByRole('button',{name:'View notice',exact:true}).click();
    await page.getByRole('button',{name:'Continue working',exact:true}).waitFor();
    if(screenshots)await page.screenshot({path:path.join(screenshots,'subscription-grace-mobile.png')});
    due=Date.now()+1300;await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
    await page.getByRole('button',{name:'Continue working',exact:true}).click();
    await page.getByRole('heading',{name:'Subscription suspended',exact:true}).waitFor({timeout:5000});
    assert.equal(await page.locator('dialog').evaluate(e=>e.matches(':modal')),true);
    state='active';await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
    await page.waitForFunction(()=>!document.querySelector('dialog').open);
    assert.deepEqual(errors,[]);
  } finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
});
