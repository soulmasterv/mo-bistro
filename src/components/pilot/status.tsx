"use client";
import { useEffect,useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {Bell,CheckCircle2,MessageCircle,Phone,UtensilsCrossed,XCircle} from 'lucide-react';
import { pollRetryDelay } from '@/lib/pilot/polling';
type Status={id:number;status:string;position:number|null;whatsapp_consent:boolean;whatsapp_reply_observed:boolean;whatsapp_url?:string|null};
export default function PilotStatus(){
 const token=useSearchParams().get('token')||'';const [party,setParty]=useState<Status|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[updating,setUpdating]=useState(false);
 async function enable(){if(busy)return;setBusy(true);try{const r=await fetch('/api/pilot/status',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,consent:true})});if(!r.ok)throw Error('Could not enable your message. Please try again.');const next=await fetch('/api/pilot/status?token='+encodeURIComponent(token),{cache:'no-store'});if(!next.ok)throw Error('Please refresh your status.');setParty(await next.json());setError('');}catch(e){setError(e instanceof Error?e.message:'Please try again.');}finally{setBusy(false);}}
 useEffect(()=>{
  let stopped=false,failures=0,timer:ReturnType<typeof setTimeout>|undefined;
  let active:AbortController|null=null;
  async function refresh(){
   if(stopped)return;
   if(document.visibilityState!=='visible'||active)return;
   active=new AbortController();const deadline=setTimeout(()=>active?.abort(),15000);
   let retryAfterMs=0;
   try{
    const r=await fetch('/api/pilot/status?token='+encodeURIComponent(token),{cache:'no-store',signal:active.signal});
    const retry=r.headers.get('retry-after');
    if(retry){const seconds=Number(retry);retryAfterMs=Number.isFinite(seconds)?Math.max(0,seconds*1000):Math.max(0,Date.parse(retry)-Date.now())||0;}
    if(!r.ok)throw Error('Poll unavailable');
    const data=await r.json();
    if(!stopped){setParty(data);setUpdating(false);failures=0;}
   }catch{if(!stopped){setUpdating(true);failures++;}}
   finally{
    clearTimeout(deadline);
    active=null;
    if(!stopped&&document.visibilityState==='visible')timer=setTimeout(()=>void refresh(),failures?pollRetryDelay(failures,retryAfterMs):12000);
   }
  }
  function visibility(){clearTimeout(timer);if(document.visibilityState==='visible')void refresh();}
  document.addEventListener('visibilitychange',visibility);
  void refresh();return()=>{stopped=true;active?.abort();clearTimeout(timer);document.removeEventListener('visibilitychange',visibility);};
 },[token]);
 const status=party?.status;
 const labels:Record<string,string>={waiting:"You're on the waitlist",called:'Reception is calling you!',seated:"You're seated!",left:'Booking closed'};
 return <main className="guest-status-page"><div className="guest-status-shell">
  <header className="guest-brand"><UtensilsCrossed size={28}/><span>MO BISTRO</span></header>
  <div className="guest-status-layout"><section className="guest-status-main">
   <h1>{status==='waiting'?"You're on the waitlist":status==='called'?'Your table is ready':status==='seated'?"You’re seated!":status==='left'?'Thank you for visiting':'Your booking'}</h1>
   <p className="guest-intro">{status==='called'?'Please make your way to reception.':status==='seated'?'Enjoy your visit.':status==='left'?'This booking is closed. Please speak with reception if you need help.':"We'll let you know when your table is ready."}</p>
   {error&&<p role="alert" className="guest-small-note">{error}</p>}
   {updating&&<p role="status" className="guest-small-note">Updating…{party?' Showing your last known status.':''}</p>}
   {!party&&!error&&!updating&&<p role="status">Loading your booking…</p>}
   {party&&<>
    {status!=='waiting'&&<div className={`guest-current-status ${status==='seated'?'is-seated':''}`} role="status">
     {status==='seated'?<CheckCircle2 size={32}/>:status==='called'?<Bell size={30}/>:<XCircle size={28}/>}
     <div><h2>{labels[party.status]||'Your booking'}</h2><p>{status==='called'?'Your table is ready. Please come to reception.':status==='seated'?'Our team has seated you. Enjoy your meal!':'This booking is now closed.'}</p></div>
    </div>}
    {status==='waiting'&&<section className="guest-whatsapp-card pilot-status-whatsapp space-y-3 rounded-xl" aria-label="WhatsApp table-ready alert">
     <p>{party.whatsapp_reply_observed?"You're all set!":"WhatsApp updates"}</p>
     <p className="guest-small-note">{party.whatsapp_reply_observed?"We'll message you here when your table is ready.":"Get one WhatsApp alert when your table is ready."}</p>
     {!party.whatsapp_consent&&<button disabled={busy} className="pilot-status-whatsapp-button" onClick={()=>void enable()}><WhatsAppIcon/>{busy?'Enabling…':'Get WhatsApp updates'}</button>}
     {party.whatsapp_consent&&!party.whatsapp_reply_observed&&party.whatsapp_url&&<><p className="guest-small-note">Send the prepared message to finish setting up your alert.</p><a className="pilot-status-whatsapp-button" href={party.whatsapp_url} rel="noreferrer"><WhatsAppIcon/>Open WhatsApp</a></>}
     {party.whatsapp_consent&&!party.whatsapp_reply_observed&&!party.whatsapp_url&&<p className="guest-small-note">Your choice is saved. Please keep this page open for updates.</p>}
    </section>}
    <dl className="guest-booking-facts">
     <div><dt>Booking number</dt><dd>#{party.id}</dd></div>
     <div><dt>Status</dt><dd>{status==='waiting'?'Waiting':status==='called'?'Called':status==='seated'?'Seated':'Closed'}</dd></div>
     {status==='waiting'&&<><div><dt>Queue position</dt><dd>#{party.position}</dd></div><div><dt>Parties ahead</dt><dd>{Math.max(0,(party.position||1)-1)}</dd></div></>}
    </dl>
    <p className="guest-small-note">Queue information refreshes automatically. Keep your private booking link to yourself.</p>
   </>}
  </section><aside className="guest-status-aside">
   <div className="guest-welcome-card"><UtensilsCrossed size={38}/><p>MO BISTRO · DISTRICT 5</p><h2>Goodness since 2022.</h2><p>Quality dishes cooked with passion &amp; served with a smile.</p></div>
  </aside></div>
 </div></main>;
}

function WhatsAppIcon() {
 return <span className="pilot-status-whatsapp-icon" aria-hidden="true"><MessageCircle size={19}/><Phone size={9}/></span>;
}
