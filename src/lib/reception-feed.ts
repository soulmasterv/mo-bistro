'use client';
const sections:Record<string,string>={
 '/api/guests':'guests','/api/tables':'tables','/api/reception/table-requests':'requests',
 '/api/reception/next-guest?areas=all':'next','/api/table-view-mode':'mode','/api/wait-estimate':'wait','/api/simple-tables':'simple',
};
export type FeedState={updating:boolean;updatedAt:number;stopped:boolean};
type Options={fetch:typeof fetch;now:()=>number;random:()=>number;setTimeout:typeof setTimeout;clearTimeout:typeof clearTimeout;visible:()=>boolean};
export function createReceptionFeed(options:Options){
 let data:Record<string,unknown>|null=null,inFlight:Promise<void>|null=null,controller:AbortController|null=null;
 let timer:ReturnType<typeof setTimeout>|null=null,failures=0,active=false,stopped=false,dirty=false,version=0;
 let state:FeedState={updating:false,updatedAt:0,stopped:false};
 const listeners=new Set<()=>void>();
 const publish=()=>{for(const listener of listeners)listener();};
 function schedule(){
  if(timer)options.clearTimeout(timer);
  timer=null;
  if(!active||stopped||!options.visible())return;
  const delay=failures?Math.min(60000,5000*2**Math.min(failures,4))*(.8+options.random()*.4):5000;
  timer=options.setTimeout(()=>{void refresh().catch(()=>{});},delay);
 }
 async function refresh(invalidate=false):Promise<void>{
  if(stopped)throw Error('Reception session ended.');
  if(invalidate){dirty=true;version++;}
  if(inFlight){
   await inFlight;
   if(dirty&&!stopped&&options.visible())return refresh();
   return;
  }
  if(!options.visible())return;
  if(timer){options.clearTimeout(timer);timer=null;}
  const generation=version;dirty=false;const current=new AbortController();controller=current;
  let timedOut=false;
  const timeout=options.setTimeout(()=>{timedOut=true;current.abort();},15000);
  inFlight=(async()=>{
   try{
    const response=await options.fetch('/api/reception/dashboard',{cache:'no-store',credentials:'same-origin',signal:current.signal});
    if(response.status===401||response.status===403){data=null;stopped=true;state={updating:false,updatedAt:0,stopped:true};throw Error('Please sign in again.');}
    if(!response.ok)throw Error('Reception is updating.');
    const next=await response.json();
    if(!next||!Array.isArray(next.guests)||!Array.isArray(next.tables)||!Array.isArray(next.requests)||!Array.isArray(next.next?.areas)||!['simple','detailed'].includes(next.mode?.mode)||!next.simple||!next.wait)throw Error('Invalid reception response.');
    if(current.signal.aborted)return;
    // Never publish a snapshot started before a mutation invalidated it.
    if(generation===version){data=next;failures=0;state={updating:false,updatedAt:options.now(),stopped:false};}
   }catch(error){
    if((!current.signal.aborted||timedOut)&&!stopped){failures++;state={...state,updating:true};}
    throw error;
   }finally{
    options.clearTimeout(timeout);
    if(controller===current){controller=null;inFlight=null;publish();schedule();}
   }
  })();
  return inFlight;
 }
 return {
  refresh,
  start(){active=true;stopped=false;void refresh().catch(()=>{});return()=>{active=false;version++;controller?.abort();controller=null;inFlight=null;if(timer)options.clearTimeout(timer);timer=null;data=null;state={updating:false,updatedAt:0,stopped:false};};},
  visibilityChanged(){if(options.visible()){void refresh().catch(()=>{});}else{if(timer)options.clearTimeout(timer);timer=null;}},
  subscribe(callback:()=>void){listeners.add(callback);return()=>{listeners.delete(callback);};},
  state:()=>state,
  async read(url:string,init?:RequestInit){
   if(!data&&!state.updating&&!stopped)await refresh();
   if(init?.signal?.aborted)throw new DOMException('Aborted','AbortError');
   const key=sections[url];if(!key)throw Error('Unsupported reception read.');
   if(!data)throw Error('Reception is updating.');
   return Response.json(data[key]);
  },
 };
}
let feed:ReturnType<typeof createReceptionFeed>|null=null;
export function receptionFeed(){
 if(!feed)feed=createReceptionFeed({fetch:(...args)=>fetch(...args),now:Date.now,random:Math.random,setTimeout,clearTimeout,visible:()=>document.visibilityState==='visible'});
 return feed;
}
export const receptionRead=(url:string,init?:RequestInit)=>receptionFeed().read(url,init);
let invalidation:Promise<void>|null=null;
export function refreshReception(){
 if(invalidation)return invalidation;
 invalidation=Promise.resolve().then(()=>{invalidation=null;return receptionFeed().refresh(true);});
 return invalidation;
}
export const watchReception=(callback:()=>void)=>receptionFeed().subscribe(callback);
