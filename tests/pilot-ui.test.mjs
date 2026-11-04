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
        import Login from './src/components/pilot/login';
        createRoot(document.getElementById('root')).render(location.pathname==='/login'?<Login/>:location.pathname==='/status'?<Status/>:<Reception username="Synthetic Reception"/>);`,
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
      browser=await chromium.launch({headless:true, executablePath:process.env.PILOT_TEST_BROWSER});
      const page=await browser.newPage();
      await page.addInitScript(()=>{
        Object.defineProperty(AbortSignal,'timeout',{value:undefined});
        Object.defineProperty(AbortSignal,'any',{value:undefined});
        Object.defineProperty(Crypto.prototype,'randomUUID',{value:undefined});
      });
      const errors=[];
      page.on('pageerror',error=>errors.push(error.message));
      await page.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
      for(const viewport of [{width:320,height:700},{width:390,height:844},{width:768,height:1024},
        {width:966,height:870},{width:1280,height:720},{width:1440,height:900},{width:844,height:390}]) {
        await t.test(`Reception ${viewport.width}x${viewport.height}`,async()=>{
          await page.setViewportSize(viewport);
          await page.goto(origin);
          await page.getByRole('button',{name:'Synthetic QA Guest 135',exact:true}).waitFor();
          const statsList=page.locator('dl[aria-label="Queue stats"]');
          assert.deepEqual(await statsList.locator('dd').allTextContents().then(values=>values.slice(0,2)),['135','0']);
          assert.match(await statsList.locator('dd').last().textContent(),/^\d+ min$/);
          assert.equal(await page.getByRole('heading',{name:'Waiting queue',exact:true}).evaluate(el=>getComputedStyle(el).fontWeight),'700');
          assert.equal(await page.locator('header').getByRole('button',{name:'QR join'}).count(),1);
          for(const expanded of [false,true]) {
            if(expanded) {
              await page.getByRole('button',{name:'Add walk-in',exact:true}).first().click();
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
            const trigger=page.getByRole('button',{name:'QR join',exact:true});
            await trigger.click();const qrDialog=page.getByRole('dialog',{name:'Mo Bistro'});
            await qrDialog.waitFor();
            assert.equal(await qrDialog.getByRole('link',{name:/development\.mo-bistro\.labbing\.space/}).getAttribute('href'),'https://development.mo-bistro.labbing.space/join');
            await qrDialog.getByRole('button',{name:'Copy link'}).waitFor();
            const qrMetrics=await qrDialog.evaluate(el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,background:getComputedStyle(el).backgroundColor,modal:el.matches(':modal'),focusInside:el.contains(document.activeElement)};});
            assert.equal(qrMetrics.x,0);assert.equal(qrMetrics.y,0);
            assert.equal(qrMetrics.width,viewport.width);assert.equal(qrMetrics.height,viewport.height);
            assert.equal(qrMetrics.background,'rgb(16, 17, 17)','Opaque screen covers all guest details');
            assert.equal(qrMetrics.modal,true,'Background staff controls are inert');assert.equal(qrMetrics.focusInside,true);
            if(expanded&&[390,1280].includes(viewport.width))await page.screenshot({path:path.join(temp,`qr-overlay-${viewport.width}.png`)});
            for(let key=0;key<4;key++){await page.keyboard.press('Tab');assert.equal(await qrDialog.evaluate(el=>el.contains(document.activeElement)),true);}
            await qrDialog.getByRole('button',{name:'Close',exact:true}).click();await qrDialog.waitFor({state:'detached'});
            assert.equal(await trigger.evaluate(el=>el===document.activeElement),true,'Focus returns to QR opener');
            await trigger.click();await page.keyboard.press('Escape');await qrDialog.waitFor({state:'detached'});
            if(expanded) {
              assert.equal(await page.getByLabel('Name',{exact:true}).inputValue(),'Preserved walk-in draft');
              const toggle=page.getByRole('button',{name:'Add walk-in',exact:true}).first();
              await toggle.click();
              await page.getByRole('region',{name:'Walk-in form'}).waitFor({state:'hidden'});
              await toggle.click();
              assert.equal(await page.getByLabel('Name',{exact:true}).inputValue(),'Preserved walk-in draft');
            }
          }
          await page.screenshot({path:path.join(temp,`reception-${viewport.width}.png`)});
          // Resizing a populated page must not leave a cream gap or stale offset.
          await page.setViewportSize({width:viewport.width,height:viewport.height+100});
          assert.equal(await page.locator('[data-pilot-reception]').evaluate(el=>el.getBoundingClientRect().top),0);
        });
      }
      await t.test('Pilot login fills an Android-sized viewport and keeps fields styled',async()=>{
        await page.setViewportSize({width:360,height:740});
        await page.goto(origin+'/login');
        const main=page.locator('[data-pilot-login]');
        await main.waitFor();
        assert.ok(await main.evaluate(el=>el.getBoundingClientRect().bottom>=innerHeight));
        for(const label of ['Username','Password']){
          const field=page.getByLabel(label,{exact:true});
          assert.equal(await field.evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(16, 17, 17)');
          assert.ok((await field.boundingBox()).height>=46);
        }
      });
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
