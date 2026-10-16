"use client";
import { useCallback,useEffect,useRef,useState } from 'react';
import { useRouter } from 'next/navigation';
import { QRCodeSVG } from 'qrcode.react';
import { PILOT_ORIGIN } from '@/lib/pilot/config';
import PartyForm from './party-form';
import {PilotQueue,PilotDrawer,type Party,type QueueAction} from './queue';
import styles from './pilot.module.css';
export default function PilotReception({username}:{username:string}){
 const router=useRouter();const [now,setNow]=useState(0);
 const [parties,setParties]=useState<Party[]>([]),[error,setError]=useState(''),[loaded,setLoaded]=useState(false);
 const [busy,setBusy]=useState<number[]>([]),[handoff,setHandoff]=useState<{id:number;token:string}|null>(null);
 const [openParty,setOpenParty]=useState<number|null>(null);
 const pending=useRef(new Set<number>());
 const refreshVersion=useRef(0);
 const refresh=useCallback(async(signal?:AbortSignal)=>{const version=++refreshVersion.current;try{const r=await fetch('/api/pilot/queue',{cache:'no-store',signal});if(r.status===401){router.replace('/login');return;}const data=await r.json();if(!r.ok)throw Error(data.error||'Queue unavailable.');if(!signal?.aborted&&version===refreshVersion.current){setParties(data);setNow(Date.now());setLoaded(true);setError('');}}catch(e){if(!signal?.aborted&&version===refreshVersion.current)setError(e instanceof Error?e.message:'Queue unavailable.');}},[router]);
 useEffect(()=>{const controller=new AbortController();void Promise.resolve().then(()=>refresh(controller.signal));const timer=window.setInterval(()=>{if(document.visibilityState==='visible')void refresh(controller.signal);},2000);const clock=window.setInterval(()=>setNow(Date.now()),250);return()=>{controller.abort();window.clearInterval(timer);window.clearInterval(clock);};},[refresh]);
 async function action(id:number,value:QueueAction){
  if(pending.current.has(id))return;pending.current.add(id);refreshVersion.current++;setBusy([...pending.current]);setError('');
  try{const undo_token=value==='undo'?parties.find(p=>p.id===id)?.pending_exit_token:undefined;const r=await fetch(`/api/pilot/parties/${id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:value,...(undo_token?{undo_token}:{})})});const data=await r.json();if(!r.ok)throw Error(data.error||'Action failed.');await refresh();}catch(e){setError(e instanceof Error?e.message:'Action failed.');}finally{pending.current.delete(id);setBusy([...pending.current]);}
 }
 const selected=parties.find(p=>p.id===openParty);
 return <main className={styles.page}><div className={styles.wrap}>
  <header className={styles.header}><div><p className={styles.brand}>Mo Bistro - District 5</p><small>Reception · {username}</small></div>
   <details className={styles.menu} onKeyDown={event=>{if(event.key==='Escape'){event.currentTarget.open=false;event.currentTarget.querySelector('summary')?.focus();}}}>
    <summary aria-label="Reception menu" title="Reception menu"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg></summary>
    <nav className={styles.menuItems} aria-label="Reception options">
     <a href="/api/pilot/export" onClick={event=>{const details=event.currentTarget.closest('details');if(details)details.open=false;}}>Export CSV</a>
     <button onClick={()=>void fetch('/api/auth/logout',{method:'POST'}).then(()=>{router.replace('/login');router.refresh();})}>Sign out</button>
    </nav>
   </details>
  </header>
  <div className={styles.two}>
   <details className={styles.panel}><summary>Add walk-in</summary><PartyForm staff onCreated={party=>{setHandoff(party);void refresh();}}/></details>
   <details className={styles.panel}><summary>QR join</summary><div className={styles.qr}><QRCodeSVG value={PILOT_ORIGIN+'/join'} size={140}/><a className={styles.secondary} href="/join" target="_blank" rel="noreferrer">Open join page</a></div></details>
  </div>
  {handoff&&<section className={styles.panel}><strong>Ticket #{handoff.id} added</strong><p className={styles.hint}>Ask the guest to scan their private status link.</p><div className={styles.qr}><QRCodeSVG value={PILOT_ORIGIN+'/status?token='+handoff.token} size={130}/><button className={styles.secondary} onClick={()=>setHandoff(null)}>Done</button></div></section>}
  <div className={styles.title}><h1>Waiting queue <span className={styles.count}>{parties.length}</span></h1><button className={styles.secondary} onClick={()=>void refresh()}>Refresh</button></div>
  {error&&<p className={styles.notice} role="alert">{error}</p>}
  {!loaded&&!error&&<p role="status">Loading queue…</p>}
  {loaded&&!parties.length&&<p className={styles.empty}>The waiting queue is empty.</p>}
  {!!parties.length&&<PilotQueue parties={parties} now={now} busy={busy} onAction={(id,value)=>void action(id,value)} onOpen={setOpenParty}/>}
  {selected&&<PilotDrawer key={selected.id} party={selected} now={now} busy={busy.includes(selected.id)} onAction={(id,value)=>void action(id,value)} onClose={()=>setOpenParty(null)}/>}
 </div></main>;
}
