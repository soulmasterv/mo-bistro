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
    const globalCss=fs.readdirSync('.next/static',{recursive:true}).filter(file=>file.endsWith('.css'))
      .map(file=>fs.readFileSync(path.join('.next/static',file),'utf8')).join('\n');
    assert.ok(globalCss.length>0,'Production CSS is required');
    const parties=Array.from({length:135},(_,i)=>({id:i+1,name:`Synthetic QA Guest ${i+1}`,
      phone:'01000000001',party_size:2,preference:i%2?'outdoor':'indoor',status:'waiting',
      joined_at:'2026-10-22T15:00:00Z',called_at:null,whatsapp_consent:false,message_status:null,
      message_error:null,pending_exit_kind:null,pending_exit_at:null,pending_exit_token:null,
      phone_call_taps:0,informed_via:null}));
    let status='waiting';
    const mutations=[];
    const server=http.createServer((req,res)=>{
      if(req.method==='PATCH'&&/^\/api\/pilot\/parties\/\d+$/.test(req.url)) {
        let body='';req.on('data',chunk=>body+=chunk);req.on('end',()=>{
          const action=JSON.parse(body).action;mutations.push(action);
          const p=parties.find(p=>p.id===Number(req.url.split('/').at(-1)));
          if(!p||!['seated','guest_informed'].includes(action)){res.writeHead(400);res.end('{}');return;}
          p.status=action==='seated'?'seated':'called';if(action==='guest_informed'){p.called_at=new Date().toISOString();p.informed_via='staff_confirmed';}
          res.setHeader('Content-Type','application/json');res.end('{"success":true}');
        });return;
      }
      if(req.method!=='GET') {mutations.push('UNEXPECTED');res.writeHead(405);res.end();return;}
      if(req.url==='/api/pilot/queue') {res.setHeader('Content-Type','application/json');res.end(JSON.stringify(parties.filter(p=>p.status!=='seated')));}
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
            assert.equal(await page.evaluate(()=>window.scrollY),0,'The page stays fixed while the queue scrolls');
            const scroller=page.getByRole('region',{name:'Scrollable reception queue'});
            assert.ok(await scroller.evaluate(el=>el.scrollTop)>0,'Queue tail is reached with internal scrolling');
            await scroller.evaluate(el=>el.scrollTop=0);
            if(expanded&&viewport.width>650){
              const panels=await page.locator('details').evaluateAll(els=>els.filter(el=>['Add walk-in','QR join'].includes(el.querySelector('summary')?.textContent)).map(el=>el.getBoundingClientRect().height));
              assert.ok(Math.abs(panels[0]-panels[1])<2,'Entry panels have balanced heights');
              if(viewport.width>=966&&viewport.height>=700){
                const submit=await page.getByRole('button',{name:'Add walk-in',exact:true}).boundingBox();
                const qr=await page.getByRole('link',{name:'Open join page',exact:true}).boundingBox();
                const bottom=await page.locator('details').filter({has:page.locator('summary').filter({hasText:'QR join'})}).evaluate(el=>el.parentElement.getBoundingClientRect().bottom);
                assert.ok(submit.y+submit.height<=bottom+1&&qr.y+qr.height<=bottom+1,'Desktop entry actions are visible without scrolling the tools');
              }
            }
            if(expanded) assert.equal(await page.getByLabel('Name',{exact:true}).inputValue(),'Preserved walk-in draft');
          }
          await page.screenshot({path:path.join(temp,`reception-${viewport.width}.png`)});
          // Resizing a populated page must not leave a cream gap or stale offset.
          await page.setViewportSize({width:viewport.width,height:viewport.height+100});
          assert.equal(await page.locator('[data-pilot-reception]').evaluate(el=>el.getBoundingClientRect().top),0);
        });
      }
      await t.test('Waiting and failed-message guests can be seated directly and informed in person',async()=>{
        await page.setViewportSize({width:1280,height:720});parties[0].message_status='failed';parties[0].message_error='whatsapp_disabled';
        await page.goto(origin);
        const firstRow=page.getByRole('row').filter({has:page.getByRole('button',{name:'Synthetic QA Guest 1',exact:true})});
        assert.deepEqual(await firstRow.locator('td').last().locator('a,button').allTextContents(),['Call','Seat','']);
        const actionTops=await firstRow.locator('td').last().locator('a,button').evaluateAll(els=>els.map(el=>el.getBoundingClientRect().top));
        assert.ok(Math.max(...actionTops)-Math.min(...actionTops)<2,'Call, Seat and details remain on one line');
        await page.getByRole('button',{name:'Seat guest Synthetic QA Guest 1',exact:true}).click();
        await page.getByRole('button',{name:'Synthetic QA Guest 1',exact:true}).waitFor({state:'detached'});
        await page.getByRole('button',{name:'Synthetic QA Guest 2',exact:true}).click();
        const drawer=page.getByRole('dialog');
        assert.equal(await drawer.getByRole('button',{name:'Guest informed',exact:true}).isEnabled(),true);
        assert.equal(await drawer.getByRole('button',{name:'Seat guest Synthetic QA Guest 2',exact:true}).isEnabled(),true);
        await drawer.getByRole('button',{name:'Guest informed',exact:true}).click();
        await drawer.getByRole('button',{name:'Guest informed',exact:true}).waitFor({state:'detached'});
        await drawer.getByRole('button',{name:'Seat guest Synthetic QA Guest 2',exact:true}).click();
        await drawer.waitFor({state:'detached'});
      });
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
      assert.deepEqual(mutations,['seated','guest_informed','seated'],'Only intended actions hit the local fixture; no notify/call/WhatsApp action');
      assert.deepEqual(errors,[]);
      console.log(`Pilot UI screenshots: ${temp}`);
    } finally {
      await browser?.close();
      await new Promise(resolve=>server.close(resolve));
    }
  });
