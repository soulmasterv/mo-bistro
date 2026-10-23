import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const tools=process.env.MO_BISTRO_TEST_TOOLS;
const playwright=process.env.MO_BISTRO_TEST_PLAYWRIGHT;

// Real components/CSS, loopback HTTP only. No application DB or transport loads.
test('Advanced readiness: delayed loads, separate inventories, wait estimate and guest fit',
 {skip:!tools||!playwright},async t=>{
 const root=process.cwd(),temp=fs.mkdtempSync(path.join(os.tmpdir(),'readiness-ui-'));
 const {build}=require(path.join(tools,'esbuild'));
 await build({stdin:{loader:'tsx',resolveDir:root,contents:`
 import React from 'react';import {createRoot} from 'react-dom/client';
 import Reception from './src/app/reception-dashboard';import Status from './src/app/status/page';
 import Menu from './src/app/menu/page';import Tables from './src/components/table-availability';
 import Slider from './src/components/restaurant-wait-slider';import Display from './src/components/restaurant-wait-display';import Seat from './src/components/seat-guest-modal';
 import {ConfirmationProvider} from './src/components/confirmation-provider';
 const p=location.pathname;createRoot(document.getElementById('root')).render(<ConfirmationProvider>{p==='/status'?<Status/>:p==='/menu'?<Menu/>:p==='/tables'?<Tables/>:p==='/wait'?<><Slider/><Display/></>:p==='/seat'?<Seat guest={{id:1,name:'Synthetic Party',party_size:12,seating_preference:'any'}} onClose={()=>{}} onSuccess={()=>{}}/>:<Reception/>}</ConfirmationProvider>);`},
 bundle:true,jsx:'automatic',outfile:path.join(temp,'app.js'),nodePaths:[path.join(root,'node_modules')],
 plugins:[{name:'fixture',setup(b){
 b.onResolve({filter:/^next\/(navigation|link)$/},a=>({path:a.path,namespace:'fixture'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},a=>({loader:'tsx',resolveDir:root,contents:a.path==='next/link'?'import React from "react";export default function Link(p){return <a {...p}/>}':'export function useRouter(){return {push(){},replace(){},refresh(){}}}export function useSearchParams(){return new URLSearchParams(location.search)}export function usePathname(){return location.pathname}'}));
 b.onResolve({filter:/^@\//},a=>{const base=path.join(root,'src',a.path.slice(2));return {path:['.ts','.tsx'].map(e=>base+e).find(f=>fs.existsSync(f))};});
 }}]});
 const css=fs.readdirSync('.next/static/chunks').filter(f=>f.endsWith('.css')).map(f=>fs.readFileSync(path.join('.next/static/chunks',f),'utf8')).join('\n');
 let mode='simple',delay=true,waitMinutes=45,waitUnavailable=false;
 const areas=[{area:'indoor',total_tables:12,occupied_tables:12,free_tables:0,max_party_size:4},{area:'outdoor',total_tables:12,occupied_tables:5,free_tables:7,max_party_size:4}];
 const server=http.createServer((req,res)=>{
  if(req.method==='PATCH'&&req.url==='/api/wait-estimate'){
   let body='';req.on('data',chunk=>body+=chunk);req.on('end',()=>{waitMinutes=JSON.parse(body).minutes;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({minutes:waitMinutes}));});return;
  }
  if(req.method!=='GET'){res.writeHead(405);res.end();return;}
  const send=data=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(data));};
  if(req.url==='/api/table-view-mode'){setTimeout(()=>send({mode}),delay?800:0);return;}
  if(req.url==='/api/simple-tables'){send({areas});return;}
  if(req.url==='/api/tables'){send([{id:1,name:'Named table',seats:4,area:'indoor',status:'free'}]);return;}
  if(req.url==='/api/wait-estimate'){if(waitUnavailable){res.statusCode=503;send({error:'Fixture unavailable'});}else setTimeout(()=>send({minutes:waitMinutes}),delay?800:0);return;}
  if(req.url==='/api/guests'){setTimeout(()=>send([{id:1,name:'Synthetic Guest',phone:'01000000001',party_size:2,status:'waiting',seating_preference:'outdoor',created_at:new Date().toISOString()}]),delay?1000:0);return;}
  if(req.url.startsWith('/api/track?')){send({guest:{name:'Synthetic Guest',party_size:2,status:'seated',seating_preference:'outdoor'},queue_position:null,guests_ahead:null});return;}
  if(req.url.startsWith('/api/seating?')){send({mode:'simple',areas:[],tables:[]});return;}
  if(req.url.startsWith('/api/')){send({requests:[],suggestions:[],enabled:false,subscribed:false});return;}
  if(req.url==='/app.js'){res.setHeader('Content-Type','text/javascript');res.end(fs.readFileSync(path.join(temp,'app.js')));return;}
  if(req.url==='/app.css'){res.setHeader('Content-Type','text/css');res.end(css+'\n'+(fs.existsSync(path.join(temp,'app.css'))?fs.readFileSync(path.join(temp,'app.css')):''));return;}
  res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script src="/app.js"></script></body></html>');
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const origin=`http://127.0.0.1:${server.address().port}`;
 const browser=await require(playwright).chromium.launch({headless:true});
 try{
  const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
  await t.test('Reception distinguishes loading and filtered empty results',async()=>{
   await page.goto(origin);await page.getByText('Loading waitlist…',{exact:true}).waitFor();
   assert.equal(await page.getByText('Queue is empty.',{exact:true}).count(),0);
   await page.getByText('Synthetic Guest',{exact:true}).first().waitFor();
   await page.getByPlaceholder(/Search/).fill('absent');
   await page.getByText('No matching guests.',{exact:true}).waitFor();
  });
  await t.test('Simple capacity never flashes named 0/0; Detailed keeps named inventory',async()=>{
   await page.goto(origin+'/tables');await page.getByText('Loading table availability…').waitFor();
   assert.equal(await page.getByText('0 free / 0 total',{exact:true}).count(),0);
   assert.equal(await page.getByText('No tables yet.',{exact:true}).count(),0);
   await page.getByText('7 free / 24 total',{exact:true}).waitFor();
   await page.getByText(/Aggregate area capacity/).waitFor();
   mode='detailed';delay=false;await page.reload();await page.getByText('1 free / 1 total',{exact:true}).waitFor();
  });
  await t.test('Wait slider waits for saved 45 instead of showing 30',async()=>{
   delay=true;await page.goto(origin+'/wait');await page.getByText('Loading estimate…').waitFor();
   assert.equal(await page.getByRole('slider').isDisabled(),true);
   assert.equal(await page.getByText('30 mins',{exact:true}).count(),0);
   await page.getByText('45 mins',{exact:true}).first().waitFor();assert.equal(await page.getByRole('slider').inputValue(),'45');
  });
  await t.test('Oversized seating explains the missing path',async()=>{
   await page.goto(origin+'/seat');await page.getByText(/No compatible free area/).waitFor();
   assert.equal(await page.getByRole('button',{name:'Seat guest in area'}).isDisabled(),true);
  });
  delay=false;
  await t.test('Saved estimate updates other display and an outage never invents 30',async()=>{
   await page.goto(origin+'/wait');await page.getByRole('slider').waitFor();
   await page.getByText('45 mins',{exact:true}).first().waitFor();
   await page.getByRole('slider').fill('60');await page.getByRole('button',{name:'Save estimate',exact:true}).click();
   await page.getByText('1 hour',{exact:true}).nth(1).waitFor();
   waitUnavailable=true;await page.reload();await page.getByRole('button',{name:'Retry estimate'}).waitFor();
   assert.equal(await page.getByRole('slider').isDisabled(),true);assert.equal(await page.getByText('30 mins',{exact:true}).count(),0);
   waitUnavailable=false;await page.getByRole('button',{name:'Retry estimate'}).click();await page.getByRole('button',{name:'Saved',exact:true}).waitFor();
  });
  for(const width of [320,390,650,832,1024,1440]){
   await t.test(`Guest content fits ${width}px`,async()=>{
    await page.setViewportSize({width,height:900});
    for(const route of ['/status?token=synthetic','/menu']){
     await page.goto(origin+route);
     if(route.startsWith('/status')){await page.getByText('Outdoor',{exact:true}).waitFor();}
     const metrics=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,outside:[...document.querySelectorAll('.guest-welcome-card,.guest-menu-actions a,.guest-booking-facts')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&(r.right>innerWidth+1||r.left< -1);}).map(e=>e.className)}));
     if(process.env.MO_BISTRO_UI_SCREENSHOTS){fs.mkdirSync(process.env.MO_BISTRO_UI_SCREENSHOTS,{recursive:true});await page.screenshot({path:path.join(process.env.MO_BISTRO_UI_SCREENSHOTS,`guest-${route.startsWith('/status')?'status':'menu'}-${width}.png`)});}
     assert.ok(metrics.scroll<=width+1,JSON.stringify(metrics));assert.deepEqual(metrics.outside,[]);
    }
   });
  }
  assert.deepEqual(errors,[]);
 }finally{await browser.close();await new Promise(r=>server.close(r));fs.rmSync(temp,{recursive:true,force:true});}
});
