"use client";
import { useEffect,useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {Bell,CheckCircle2,Clock3,UtensilsCrossed,XCircle} from 'lucide-react';
type Status={id:number;status:string;position:number|null;whatsapp_consent:boolean;whatsapp_url?:string|null};
export default function PilotStatus(){
 const token=useSearchParams().get('token')||'';const [party,setParty]=useState<Status|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 async function enable(){if(busy)return;setBusy(true);try{const r=await fetch('/api/pilot/status',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,consent:true})});if(!r.ok)throw Error('Could not enable your message. Please try again.');const next=await fetch('/api/pilot/status?token='+encodeURIComponent(token),{cache:'no-store'});if(!next.ok)throw Error('Please refresh your status.');setParty(await next.json());setError('');}catch(e){setError(e instanceof Error?e.message:'Please try again.');}finally{setBusy(false);}}
 useEffect(()=>{const controller=new AbortController();async function refresh(){try{const r=await fetch('/api/pilot/status?token='+encodeURIComponent(token),{cache:'no-store',signal:controller.signal});const data=await r.json();if(!r.ok)throw Error(data.error||'Status unavailable.');if(!controller.signal.aborted){setParty(data);setError('');}}catch(e){if(!controller.signal.aborted)setError(e instanceof Error?e.message:'Status unavailable.');}}void refresh();const timer=window.setInterval(()=>{if(document.visibilityState==='visible')void refresh();},5000);return()=>{controller.abort();window.clearInterval(timer);};},[token]);
 const status=party?.status;
 const labels:Record<string,string>={waiting:"You're on the waitlist",called:'Reception is calling you!',seated:"You're seated!",left:'Booking closed'};
 return <main className="guest-status-page"><div className="guest-status-shell">
  <header className="guest-brand"><UtensilsCrossed size={28}/><span>MO BISTRO · DISTRICT 5</span></header>
  <div className="guest-status-layout"><section className="guest-status-main">
   <h1>{status==='seated'?"You’re seated!":status==='left'?'Thank you for visiting':'Your table is worth the wait'}</h1>
   <p className="guest-intro">{status==='called'?'Please make your way to reception.':status==='seated'?'Enjoy your visit.':'Follow your place in the queue here.'}</p>
   {error&&<p role="alert" className="guest-small-note">{error}</p>}{!party&&!error&&<p role="status">Loading your booking…</p>}
   {party&&<>
    <div className={`guest-current-status ${status==='seated'?'is-seated':''}`} role="status">
     {status==='seated'?<CheckCircle2 size={32}/>:status==='called'?<Bell size={30}/>:status==='waiting'?<Clock3 size={28}/>:<XCircle size={28}/>}
     <div><h2>{labels[party.status]||'Your booking'}</h2><p>{status==='waiting'?'Your place is saved. This page updates when reception calls you.':status==='called'?'Your table is ready. Please come to reception.':status==='seated'?'Our team has seated you. Enjoy your meal!':'This booking is now closed.'}</p></div>
    </div>
    <dl className="guest-booking-facts">
     <div><dt>Booking number</dt><dd>#{party.id}</dd></div>
     <div><dt>Status</dt><dd>{status==='waiting'?'Waiting':status==='called'?'Called':status==='seated'?'Seated':'Closed'}</dd></div>
     {status==='waiting'&&<><div><dt>Queue position</dt><dd>#{party.position}</dd></div><div><dt>Parties ahead</dt><dd>{Math.max(0,(party.position||1)-1)}</dd></div></>}
    </dl>
    <p className="guest-small-note">Queue information refreshes automatically. Keep your private booking link to yourself.</p>
   </>}
  </section><aside className="guest-status-aside">
   <div className="guest-welcome-card"><UtensilsCrossed size={38}/><p>MO BISTRO · DISTRICT 5</p><h2>Good food.<br/>Good company.</h2><p>A little time, well spent.</p></div>
   {party&&status==='waiting'&&<section className="guest-whatsapp-card space-y-3 rounded-xl" aria-label="WhatsApp table-ready alert">
    <p>Get your table-ready message</p>
    <p className="guest-small-note">Receive one WhatsApp message when reception calls your party. No marketing.</p>
    {!party.whatsapp_consent&&<button disabled={busy} className="guest-subscription-refresh" onClick={()=>void enable()}>{busy?'Enabling…':'Enable WhatsApp alert'}</button>}
    {party.whatsapp_consent&&party.whatsapp_url&&<><p className="guest-small-note">Open WhatsApp and send the prepared message to receive your alert.</p><a className="block rounded-xl bg-[#34382E] px-4 py-3 text-center font-medium text-white" href={party.whatsapp_url} rel="noreferrer">Open WhatsApp</a></>}
    {party.whatsapp_consent&&!party.whatsapp_url&&<p className="guest-small-note">Your choice is saved. Please keep this page open for updates.</p>}
    <p className="guest-small-note">To unsubscribe, reply STOP on WhatsApp.</p>
   </section>}
  </aside></div>
 </div></main>;
}
