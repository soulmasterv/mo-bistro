"use client";
import { useCallback,useEffect,useRef,useState } from 'react';
import { useRouter } from 'next/navigation';
import { QRCodeSVG } from 'qrcode.react';
import { PILOT_ORIGIN } from '@/lib/pilot/config';
import PartyForm from './party-form';
import JoinQR from './join-qr';
import {PilotQueue,PilotDrawer,observedPartyTime,type Party,type QueueAction} from './queue';
import styles from './pilot.module.css';
async function fetchWithTimeout(url:string,options:RequestInit,ms:number){
 const controller=new AbortController();
 const parent=options.signal;
 const abort=()=>controller.abort();
 let timedOut=false;
 if(parent?.aborted)abort();
 else parent?.addEventListener('abort',abort,{once:true});
 const timer=window.setTimeout(()=>{timedOut=true;abort();},ms);
 try{return await fetch(url,{...options,signal:controller.signal});}
 catch(error){if(timedOut){const timeout=new Error('Request timed out.');timeout.name='TimeoutError';throw timeout;}throw error;}
 finally{window.clearTimeout(timer);parent?.removeEventListener('abort',abort);}
}
function eventId(){
 if(typeof crypto.randomUUID==='function')return crypto.randomUUID();
 const b=crypto.getRandomValues(new Uint8Array(16));
 b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;
 const hex=Array.from(b,n=>('0'+n.toString(16)).slice(-2)).join('');
 return [hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join('-');
}
export default function PilotReception({username}:{username:string}){
 const router=useRouter();const [now,setNow]=useState(0);
 const [parties,setParties]=useState<Party[]>([]),[error,setError]=useState(''),[loaded,setLoaded]=useState(false);
 const [busy,setBusy]=useState<number[]>([]),[handoff,setHandoff]=useState<{id:number;token:string}|null>(null);
 const [openParty,setOpenParty]=useState<number|null>(null);
 const [showWalkIn,setShowWalkIn]=useState(false);
 const [showQR,setShowQR]=useState(false);
 const pending=useRef(new Set<number>());
 const refreshVersion=useRef(0);
 const refreshing=useRef(false);
 const refreshQueued=useRef(false);
 const refresh=useCallback(async(signal?:AbortSignal,afterAction=false):Promise<void>=>{
  if(refreshing.current){if(afterAction)refreshQueued.current=true;return;}
  refreshing.current=true;
  try{do{
   refreshQueued.current=false;const version=++refreshVersion.current;
   try{
   const r=await fetchWithTimeout('/api/pilot/queue',{cache:'no-store',signal},15000);
   if(r.status===401){router.replace('/login');return;}
   const data=await r.json();if(!r.ok)throw Error(data.error||'Queue unavailable.');
   if(!signal?.aborted&&version===refreshVersion.current){const received_at=Date.now();setParties(data.map((p:Party)=>({...p,received_at})));setNow(received_at);setLoaded(true);setError('');}
  }catch(e){if(!signal?.aborted&&version===refreshVersion.current)setError(e instanceof Error&&e.name==='TimeoutError'?'Queue update timed out. Retrying…':e instanceof Error?e.message:'Queue unavailable.');}
  }while(refreshQueued.current&&!signal?.aborted);}finally{refreshing.current=false;}
 },[router]);
 useEffect(()=>{const controller=new AbortController();void Promise.resolve().then(()=>refresh(controller.signal));const timer=window.setInterval(()=>{if(document.visibilityState==='visible')void refresh(controller.signal);},5000);const clock=window.setInterval(()=>setNow(Date.now()),250);return()=>{controller.abort();window.clearInterval(timer);window.clearInterval(clock);};},[refresh]);
 async function action(id:number,value:QueueAction,reason?:string){
  if(pending.current.has(id))return;pending.current.add(id);refreshVersion.current++;setBusy([...pending.current]);setError('');
  try{const undo_token=value==='undo'?parties.find(p=>p.id===id)?.pending_exit_token:undefined;const r=await fetchWithTimeout(`/api/pilot/parties/${id}`,{method:'PATCH',keepalive:true,headers:{'Content-Type':'application/json'},body:JSON.stringify({action:value,...(undo_token?{undo_token}:{}),...(reason?{reason}:{}),...(['phone_call','retry'].includes(value)?{event_id:eventId()}:{})})},20000);const data=await r.json();if(!r.ok)throw Error(data.error||'Action failed.');await refresh(undefined,true);}catch(e){setError(e instanceof Error&&e.name==='TimeoutError'?'The action is taking longer than expected. The queue will refresh its result.':e instanceof Error?e.message:'Action failed.');}finally{pending.current.delete(id);setBusy([...pending.current]);}
 }
 const waiting=parties.filter(p=>p.status==='waiting');
 const called=parties.filter(p=>p.status==='called').length;
 const oldest=waiting.reduce((max,p)=>Math.max(max,Math.floor((observedPartyTime(p,now)-Date.parse(p.joined_at))/60000)),0);
 const selected=parties.find(p=>p.id===openParty);
 return <main className={`${styles.page} ${styles.receptionPage}`} data-pilot-reception><div className={styles.wrap}>
  <header className={styles.header}><div><p className={styles.brand}>Mo Bistro - District 5</p><small>Reception · {username}</small></div>
   <div className={styles.headerActions}>
    <button type="button" className={styles.secondary} onClick={()=>setShowQR(true)} aria-haspopup="dialog">QR join</button>
   <details className={styles.menu} onKeyDown={event=>{if(event.key==='Escape'){event.currentTarget.open=false;event.currentTarget.querySelector('summary')?.focus();}}}>
    <summary aria-label="Reception menu" title="Reception menu"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg></summary>
    <nav className={styles.menuItems} aria-label="Reception options">
     <a href="/api/pilot/export" onClick={event=>{const details=event.currentTarget.closest('details');if(details)details.open=false;}}>Export CSV</a>
     <button onClick={()=>void fetch('/api/auth/logout',{method:'POST'}).then(()=>{router.replace('/login');router.refresh();})}>Sign out</button>
    </nav>
   </details>
   </div>
  </header>
  <div className={styles.entryTools}>
   <div className={styles.entryBar}>
    <button type="button" className={styles.button} aria-expanded={showWalkIn} aria-controls="pilot-walk-in" onClick={()=>setShowWalkIn(!showWalkIn)}>Add walk-in</button>
    <dl className={styles.queueStats} aria-label="Queue stats">
     <div><dt>Waiting</dt><dd>{loaded?waiting.length:'—'}</dd></div>
     <div><dt>Called</dt><dd>{loaded?called:'—'}</dd></div>
     <div><dt>Oldest wait</dt><dd>{waiting.length?oldest+' min':'—'}</dd></div>
    </dl>
   </div>
   <section id="pilot-walk-in" aria-label="Walk-in form" className={styles.panel} hidden={!showWalkIn}><PartyForm staff onCreated={party=>{setHandoff(party);void refresh(undefined,true);}}/></section>
  </div>
  {handoff&&<section className={styles.panel}><strong>Ticket #{handoff.id} added</strong><p className={styles.hint}>Ask the guest to scan their private status link.</p><div className={styles.qr}><QRCodeSVG value={PILOT_ORIGIN+'/status?token='+handoff.token} size={130}/><button className={styles.secondary} onClick={()=>setHandoff(null)}>Done</button></div></section>}
  <div className={styles.title}><h1>Waiting queue</h1><button className={styles.secondary} onClick={()=>void refresh()}>Refresh</button></div>
  {error&&<p className={styles.notice} role="alert">{error}</p>}
  {!loaded&&!error&&<p role="status">Loading queue…</p>}
  {loaded&&!parties.length&&<p className={styles.empty}>The waiting queue is empty.</p>}
  {!!parties.length&&<PilotQueue parties={parties} now={now} busy={busy} onAction={(id,value,reason)=>void action(id,value,reason)} onOpen={setOpenParty}/>}
  {selected&&<PilotDrawer key={selected.id} party={selected} now={now} busy={busy.includes(selected.id)} onAction={(id,value,reason)=>void action(id,value,reason)} onClose={()=>setOpenParty(null)}/>}
  {showQR&&<JoinQR onClose={()=>setShowQR(false)}/>}
 </div></main>;
}
