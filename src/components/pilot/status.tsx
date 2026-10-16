"use client";
import { useEffect,useState } from 'react';
import { useSearchParams } from 'next/navigation';
import styles from './pilot.module.css';
type Status={id:number;status:string;position:number|null;whatsapp_consent:boolean;whatsapp_url?:string|null};
export default function PilotStatus(){
 const token=useSearchParams().get('token')||'';const [party,setParty]=useState<Status|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 async function enable(){if(busy)return;setBusy(true);try{const r=await fetch('/api/pilot/status',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,consent:true})});if(!r.ok)throw Error('Could not enable your message. Please try again.');const next=await fetch('/api/pilot/status?token='+encodeURIComponent(token),{cache:'no-store'});if(!next.ok)throw Error('Please refresh your status.');setParty(await next.json());setError('');}catch(e){setError(e instanceof Error?e.message:'Please try again.');}finally{setBusy(false);}}
 useEffect(()=>{const controller=new AbortController();async function refresh(){try{const r=await fetch('/api/pilot/status?token='+encodeURIComponent(token),{cache:'no-store',signal:controller.signal});const data=await r.json();if(!r.ok)throw Error(data.error||'Status unavailable.');if(!controller.signal.aborted){setParty(data);setError('');}}catch(e){if(!controller.signal.aborted)setError(e instanceof Error?e.message:'Status unavailable.');}}void refresh();const timer=window.setInterval(()=>{if(document.visibilityState==='visible')void refresh();},5000);return()=>{controller.abort();window.clearInterval(timer);};},[token]);
 return <main className={styles.page}><section className={`${styles.panel} ${styles.guest}`}><p className={styles.brand}>mo bistro.</p>
  {error&&<p role="alert" className={styles.notice}>{error}</p>}{!party&&!error&&<p role="status">Loading your place…</p>}
  {party&&<><p className={styles.hint}>Ticket #{party.id}</p><h1>{party.status==='waiting'?'Waiting':party.status==='called'?'Called':party.status==='seated'?'Seated':'Booking closed'}</h1>
   {party.status==='waiting'&&<><div className={styles.position}>{party.position}</div><p>Your position in the waiting queue</p></>}
   {party.status==='called'&&<p>Your table is ready. Please come to reception.</p>}{party.status==='seated'&&<p>Enjoy your visit.</p>}
   {party.status==='waiting'&&!party.whatsapp_consent&&<><p className={styles.hint}>Choose one WhatsApp message when reception calls your party. No marketing. Reply STOP to unsubscribe.</p><button disabled={busy} className={styles.secondary} onClick={()=>void enable()}>{busy?'Saving…':'Enable table-ready message'}</button></>}
   {party.status==='waiting'&&party.whatsapp_url&&<><p className={styles.hint}>Open WhatsApp and send the prepared message to enable your table-ready alert.</p><a className={styles.button} href={party.whatsapp_url} rel="noreferrer">Open WhatsApp</a></>}
   <p className={styles.hint}>This page refreshes automatically. Keep your private link to yourself.</p>
  </>}
 </section></main>;
}
