import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const option = name => {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
};
const tools = option('--tools');
const playwright = option('--playwright');

// Real Pilot components, global production CSS and CSS modules; fixture HTTP
// responses only. Never start the application server or connect to a database.
test('Pilot QA: expanded reception layout, dark scrolling and booking subtitles',
  {skip: !tools || !playwright}, async t => {
    const {build} = require(path.join(tools, 'esbuild'));
    const {chromium} = require(playwright);
    const root = process.cwd();
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-ui-'));
    await build({
      stdin: {contents: `import React from 'react';import {createRoot} from 'react-dom/client';
        import Reception from './src/components/pilot/reception';
        import Status from './src/components/pilot/status';
        createRoot(document.getElementById('root')).render(location.pathname==='/status'?<Status/>:<Reception username="Synthetic Reception"/>);`,
      loader:'tsx', resolveDir:root},
      bundle:true, outfile:path.join(temp,'app.js'), jsx:'automatic',
      nodePaths:[path.join(root,'node_modules')],
      plugins:[{name:'fixture-navigation',setup(build) {
        build.onResolve({filter:/^next\/navigation$/}, () => ({path:'navigation',namespace:'fixture'}));
        build.onLoad({filter:/.*/,namespace:'fixture'}, () => ({contents:
          'const router={replace(){throw Error("Unexpected navigation")},refresh(){}};export function useRouter(){return router}export function useSearchParams(){return new URLSearchParams(location.search)}'}));
        build.onResolve({filter:/^@\//}, args => {
          const base=path.join(root,'src',args.path.slice(2));
          return {path:['.ts','.tsx'].map(ext=>base+ext).find(file=>fs.existsSync(file))};
        });
      }}],
    });
    const globalCss=fs.readdirSync('.next/static/chunks').filter(file=>file.endsWith('.css'))
      .map(file=>fs.readFileSync(path.join('.next/static/chunks',file),'utf8')).join('\n');
    const parties=Array.from({length:135},(_,i)=>({id:i+1,name:`Synthetic QA Guest ${i+1}`,
      phone:'01000000001',party_size:2,preference:i%2?'outdoor':'indoor',status:'waiting',
      joined_at:'2026-10-22T15:00:00Z',called_at:null,whatsapp_consent:false,message_status:null,
      message_error:null,pending_exit_kind:null,pending_exit_at:null,pending_exit_token:null,
      phone_call_taps:0,informed_via:null}));
    let status='waiting';
    const mutations=[];
    const server=http.createServer((req,res)=>{
      if(req.method!=='GET') {mutations.push(req.url);res.writeHead(405);res.end();return;}
      if(req.url==='/api/pilot/queue') {res.setHeader('Content-Type','application/json');res.end(JSON.stringify(parties));}
      else if(req.url.startsWith('/api/pilot/status?')) {res.setHeader('Content-Type','application/json');res.end(JSON.stringify({id:1,status,position:1,whatsapp_consent:false,whatsapp_reply_observed:false}));}
      else if(req.url==='/app.js') {res.setHeader('Content-Type','text/javascript');res.end(fs.readFileSync(path.join(temp,'app.js')));}
      else if(req.url==='/app.css') {res.setHeader('Content-Type','text/css');res.end(globalCss+'\n'+fs.readFileSync(path.join(temp,'app.css'),'utf8'));}
      else {res.setHeader('Content-Type','text/html');res.end('<!doctype html><html class="h-full"><head><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><link rel="stylesheet" href="/app.css"></head><body class="min-h-full flex flex-col"><div id="root" style="display:contents"></div><script src="/app.js"></script></body></html>');}
    });
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const origin=`http://127.0.0.1:${server.address().port}`;
    let browser;
    try {
      browser=await chromium.launch({headless:true});
      const page=await browser.newPage();
      const errors=[];
      page.on('pageerror',error=>errors.push(error.message));
      await page.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
      for(const viewport of [{width:320,height:700},{width:390,height:844},{width:768,height:1024},
        {width:966,height:870},{width:1280,height:720},{width:1440,height:900},{width:844,height:390}]) {
        await t.test(`Reception ${viewport.width}x${viewport.height}`,async()=>{
          await page.setViewportSize(viewport);
          await page.goto(origin);
          await page.getByRole('button',{name:'Synthetic QA Guest 135',exact:true}).waitFor();
          for(const expanded of [false,true]) {
            if(expanded) {
              await page.getByText('Add walk-in',{exact:true}).first().click();
              await page.getByText('QR join',{exact:true}).click();
              await page.getByLabel('Name',{exact:true}).fill('Preserved walk-in draft');
            }
            await page.evaluate(()=>window.scrollTo(0,0));
            const metrics=await page.evaluate(()=>{
              const main=document.querySelector('[data-pilot-reception]');
              const header=main.querySelector('header');
              return {rootBackground:getComputedStyle(document.documentElement).backgroundColor,
                bodyBackground:getComputedStyle(document.body).backgroundColor,
                scheme:getComputedStyle(document.documentElement).colorScheme,
                scrollbar:getComputedStyle(document.documentElement).scrollbarColor,
                bodyOverflow:getComputedStyle(document.body).overflowY,
                mainTop:main.getBoundingClientRect().top,headerTop:header.getBoundingClientRect().top,
                width:document.documentElement.scrollWidth,innerWidth};
            });
            assert.equal(metrics.rootBackground,'rgb(16, 17, 17)');
            assert.equal(metrics.bodyBackground,'rgb(16, 17, 17)');
            assert.equal(metrics.scheme,'dark');
            assert.equal(metrics.scrollbar,'rgb(115, 116, 110) rgb(16, 17, 17)');
            assert.notEqual(metrics.bodyOverflow,'hidden');
            assert.equal(metrics.mainTop,0,'No blank region before the dashboard');
            assert.ok(metrics.headerTop>=16&&metrics.headerTop<=24,'Header stays at normal page padding');
            assert.ok(metrics.width<=viewport.width+1&&metrics.innerWidth<=viewport.width+1,'No horizontal expansion');
            await page.getByRole('button',{name:'Synthetic QA Guest 135',exact:true}).scrollIntoViewIfNeeded();
            assert.ok(await page.evaluate(()=>window.scrollY)>0,'Document still scrolls to the populated queue tail');
            await page.mouse.wheel(0,-100000);
            await page.waitForFunction(()=>window.scrollY===0);
            if(expanded) assert.equal(await page.getByLabel('Name',{exact:true}).inputValue(),'Preserved walk-in draft');
          }
          await page.screenshot({path:path.join(temp,`reception-${viewport.width}.png`)});
          // Resizing a populated page must not leave a cream gap or stale offset.
          await page.setViewportSize({width:viewport.width,height:viewport.height+100});
          assert.equal(await page.locator('[data-pilot-reception]').evaluate(el=>el.getBoundingClientRect().top),0);
        });
      }
      await t.test('Guest wording and reception theme do not leak between routes',async()=>{
        for(const [next,subtitle] of [
          ['waiting','Follow your place in the queue here.'],
          ['called','Please make your way to reception.'],
          ['seated','Enjoy your visit.'],
          ['left','This booking is closed. Please speak with reception if you need help.'],
        ]) {
          status=next;
          await page.goto(origin+'/status?token=synthetic-only');
          await page.locator('.guest-booking-facts').waitFor();
          assert.equal(await page.locator('.guest-intro').textContent(),subtitle);
          assert.equal(await page.locator('html').evaluate(el=>getComputedStyle(el).colorScheme),'light');
          if(next==='left') {
            await page.getByRole('heading',{name:'Booking closed',exact:true}).waitFor();
            assert.equal(await page.getByText('Follow your place in the queue here.',{exact:true}).count(),0);
            assert.equal(await page.getByText('Queue position',{exact:true}).count(),0);
          }
        }
      });
      assert.deepEqual(mutations,[],'No action or WhatsApp mutation was sent');
      assert.deepEqual(errors,[]);
      console.log(`Pilot UI screenshots: ${temp}`);
    } finally {
      await browser?.close();
      await new Promise(resolve=>server.close(resolve));
    }
  });
