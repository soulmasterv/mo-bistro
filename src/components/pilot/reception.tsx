"use client";
import { useCallback,useEffect,useRef,useState } from 'react';
import { useRouter } from 'next/navigation';
import { QRCodeSVG } from 'qrcode.react';
import { PILOT_ORIGIN } from '@/lib/pilot/config';
import PartyForm from './party-form';
import styles from './pilot.module.css';
type Party={id:number;name:string;phone:string;party_size:number;preference:string;status:string;joined_at:string;called_at:string|null;message_status:string|null;message_error:string|null};
function message(p:Party){if(p.status!=='called')return '';if(p.message_status==='sent')return 'Ready message accepted by WhatsApp';if(p.message_status==='simulated')return 'Test mode: no WhatsApp sent';if(['failed','unknown','skipped'].includes(p.message_status||'')||p.message_error)return 'WhatsApp needs attention — contact this guest directly';return 'Ready message queued';}
export default function PilotReception({username}:{username:string}){
 const router=useRouter();const [now,setNow]=useState(0);
 const [parties,setParties]=useState<Party[]>([]),[error,setError]=useState(''),[loaded,setLoaded]=useState(false);
 const [busy,setBusy]=useState<number[]>([]),[handoff,setHandoff]=useState<{id:number;token:string}|null>(null);
 const pending=useRef(new Set<number>());
 const refresh=useCallback(async(signal?:AbortSignal)=>{try{const r=await fetch('/api/pilot/queue',{cache:'no-store',signal});if(r.status===401){router.replace('/login');return;}const data=await r.json();if(!r.ok)throw Error(data.error||'Queue unavailable.');if(!signal?.aborted){setParties(data);setNow(Date.now());setLoaded(true);setError('');}}catch(e){if(!signal?.aborted)setError(e instanceof Error?e.message:'Queue unavailable.');}},[router]);
 useEffect(()=>{const controller=new AbortController();void Promise.resolve().then(()=>refresh(controller.signal));const timer=window.setInterval(()=>{if(document.visibilityState==='visible')void refresh(controller.signal);},4000);return()=>{controller.abort();window.clearInterval(timer);};},[refresh]);
 async function action(id:number,value:'call'|'seated'|'left'){
  if(pending.current.has(id))return;pending.current.add(id);setBusy([...pending.current]);setError('');
  try{const r=await fetch(`/api/pilot/parties/${id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:value})});const data=await r.json();if(!r.ok)throw Error(data.error||'Action failed.');await refresh();}catch(e){setError(e instanceof Error?e.message:'Action failed.');}finally{pending.current.delete(id);setBusy([...pending.current]);}
 }
 return <main className={styles.page}><div className={styles.wrap}>
  <header className={styles.header}><div><p className={styles.brand}>mo bistro.</p><small>Reception · {username}</small></div><div className={styles.tools}>
   <a className={styles.secondary} href="/api/pilot/export">Export CSV</a><button className={styles.secondary} onClick={()=>void fetch('/api/auth/logout',{method:'POST'}).then(()=>{router.replace('/login');router.refresh();})}>Sign out</button>
  </div></header>
  <div className={styles.two}>
   <details className={styles.panel}><summary>Add walk-in</summary><PartyForm staff onCreated={party=>{setHandoff(party);void refresh();}}/></details>
   <details className={styles.panel}><summary>QR join</summary><div className={styles.qr}><QRCodeSVG value={PILOT_ORIGIN+'/join'} size={140}/><a className={styles.secondary} href="/join" target="_blank" rel="noreferrer">Open join page</a></div></details>
  </div>
  {handoff&&<section className={styles.panel}><strong>Ticket #{handoff.id} added</strong><p className={styles.hint}>Ask the guest to scan their private status link.</p><div className={styles.qr}><QRCodeSVG value={PILOT_ORIGIN+'/status?token='+handoff.token} size={130}/><button className={styles.secondary} onClick={()=>setHandoff(null)}>Done</button></div></section>}
  <div className={styles.title}><h1>Waiting queue <span className={styles.count}>{parties.length}</span></h1><button className={styles.secondary} onClick={()=>void refresh()}>Refresh</button></div>
  <p className={styles.hint}>Arrival order. Call marks the party ready and requests one WhatsApp message.</p>
  {error&&<p className={styles.notice} role="alert">{error}</p>}
  {!loaded&&!error&&<p role="status">Loading queue…</p>}
  {loaded&&!parties.length&&<p className={styles.empty}>The waiting queue is empty.</p>}
  <ol className={styles.list}>{parties.map(p=><li key={p.id} className={styles.party}>
   <span className={styles.ticket}>#{p.id}</span><div><h2>{p.name} {p.status==='called'&&<small className={styles.called}>· Called</small>}</h2>
   <p>{p.party_size} guests · {p.preference} · {Math.max(0,Math.floor(((p.called_at?new Date(p.called_at).getTime():now)-new Date(p.joined_at).getTime())/60000))} min waited</p>
   <p><a href={'tel:'+p.phone}>{p.phone}</a></p>{message(p)&&<p role="status">{message(p)}</p>}</div>
   <div className={styles.actions} aria-busy={busy.includes(p.id)}><button className={styles.button} disabled={busy.includes(p.id)||p.status==='called'} onClick={()=>void action(p.id,'call')}>{busy.includes(p.id)?'Saving…':'Call'}</button>
    <button className={styles.secondary} disabled={busy.includes(p.id)} onClick={()=>void action(p.id,'seated')}>Seated</button><button className={styles.secondary} disabled={busy.includes(p.id)} onClick={()=>void action(p.id,'left')}>Left</button></div>
  </li>)}</ol>
 </div></main>;
}
