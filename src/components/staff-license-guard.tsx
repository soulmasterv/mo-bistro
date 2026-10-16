"use client";
import { useEffect, useRef, useState } from "react";
import { Clock3, ShieldCheck, UtensilsCrossed } from "lucide-react";
type State="checking"|"active"|"grace"|"suspended"|"expired"|"unconfigured"|"unavailable";
type Snapshot={state:State;due:string|null;server:number;received:number};
export default function StaffLicenseGuard(){
 const dialog=useRef<HTMLDialogElement>(null);
 const [snapshot,setSnapshot]=useState<Snapshot>({state:"checking",due:null,server:0,received:0});
 const [elapsed,setElapsed]=useState(0),[acknowledged,setAcknowledged]=useState<string|null>(null);
 const [signingOut,setSigningOut]=useState(false),[error,setError]=useState("");
 useEffect(()=>{
  let controller:AbortController|null=null,stopped=false;
  async function refresh(){
   if(controller||stopped)return;
   const current=new AbortController();controller=current;
   const timeout=window.setTimeout(()=>current.abort(),10000);
   try{
    const response=await fetch("/api/license/status",{cache:"no-store",credentials:"same-origin",signal:current.signal});
    if(response.status===401){window.location.replace("/login?reason=session-expired");return;}
    const data=await response.json();if(stopped)return;
    const validGrace=data.status==="grace"&&Number.isFinite(Date.parse(data.suspension_due_at))&&Number.isFinite(Date.parse(data.server_now));
    const state:State=response.ok&&data.licensed===true&&data.status==="active"?"active":response.ok&&data.licensed===true&&validGrace?"grace":response.status===403&&["suspended","expired","unconfigured"].includes(data.status)?data.status:"unavailable";
    setSnapshot({state,due:validGrace?data.suspension_due_at:null,server:Date.parse(data.server_now)||Date.now(),received:performance.now()});
    if(validGrace){try{if(sessionStorage.getItem("mo-bistro-grace-notice")===data.suspension_due_at)setAcknowledged(data.suspension_due_at);}catch{/* Storage never controls access. */}}
   }catch{if(!stopped)setSnapshot(s=>({...s,state:"unavailable"}));}
   finally{window.clearTimeout(timeout);if(controller===current)controller=null;}
  }
  const focused=()=>{if(document.visibilityState==="visible")void refresh();};void refresh();
  const poll=window.setInterval(focused,15000),tick=window.setInterval(()=>setElapsed(performance.now()),1000);
  window.addEventListener("focus",focused);document.addEventListener("visibilitychange",focused);
  return()=>{stopped=true;controller?.abort();window.clearInterval(poll);window.clearInterval(tick);window.removeEventListener("focus",focused);document.removeEventListener("visibilitychange",focused);};
 },[]);
 // The database clock defines the deadline. Every protected mutation independently enforces it.
 const remaining=snapshot.due?Math.max(0,Date.parse(snapshot.due)-snapshot.server-Math.max(0,elapsed-snapshot.received)):0;
 const state=snapshot.state==="grace"&&remaining<=0?"suspended":snapshot.state,grace=state==="grace";
 // A pending request runs silently; only a verified notice or failed check opens the dialog.
 // Protected mutations still check the license on the server during this initial request.
 const noticeOpen=state!=="checking"&&state!=="active"&&(!grace||acknowledged!==snapshot.due);
 const minutes=Math.ceil(remaining/60000),countdown=`${Math.floor(minutes/60)}h ${String(minutes%60).padStart(2,"0")}m`;
 useEffect(()=>{const element=dialog.current;if(!element)return;if(!noticeOpen)element.close();else if(!element.open)element.showModal();},[noticeOpen]);
 function continueWorking(){setAcknowledged(snapshot.due);try{sessionStorage.setItem("mo-bistro-grace-notice",snapshot.due!);}catch{/* Acknowledgement never changes the deadline. */}}
 async function signOut(){if(signingOut)return;setSigningOut(true);setError("");try{const response=await fetch("/api/auth/logout",{method:"POST",credentials:"same-origin"});if(!response.ok)throw Error();window.location.replace("/login");}catch{setError("Could not sign out. Please try again.");setSigningOut(false);}}
 const title=grace?"Your service will pause":state==="suspended"?"Subscription suspended":state==="expired"?"Subscription expired":state==="unconfigured"?"Subscription not configured":state==="checking"?"Checking subscription…":"Subscription check unavailable";
 return <>
  {grace&&!noticeOpen&&<div className="staff-license-banner" role="status"><div><strong>Service pauses in {countdown}</strong><span>Contact the account owner. Normal operations remain available until the deadline.</span></div><button type="button" className="bistro-button" onClick={()=>{setAcknowledged(null);try{sessionStorage.removeItem("mo-bistro-grace-notice");}catch{/* Keep the notice open without storage. */}}}>View notice</button></div>}
  <dialog ref={dialog} data-license-state={state} className={`staff-license-notice ${grace?"license-grace":"license-blocked"}`} aria-labelledby="staff-license-title" aria-describedby="staff-license-description" onCancel={event=>event.preventDefault()}>
   {grace?<div className="license-grace-icon"><Clock3 size={23} aria-hidden="true"/></div>:<div className="license-signature"><UtensilsCrossed size={22} aria-hidden="true"/><span>MO BISTRO</span></div>}
   <div className="license-notice-content">
    {grace&&<p className="license-eyebrow">24-HOUR GRACE PERIOD</p>}
    <h1 id="staff-license-title">{title}</h1>
    <p id="staff-license-description">{grace?"You can keep working for now. Please contact the account owner to restore the subscription before the deadline.":state==="checking"?"Please wait while we verify access.":state==="unavailable"?"We cannot verify your subscription right now. We’ll check again automatically.":"Please contact the account owner to restore your subscription."}</p>
    {grace&&<div className="license-deadline"><span>Service pauses in</span><strong>{countdown}</strong><span>{new Date(snapshot.due!).toLocaleString("en-GB",{timeZone:"Africa/Cairo",dateStyle:"medium",timeStyle:"short"})} · Cairo time</span></div>}
    {!grace&&state!=="checking"&&<p className="license-return">This workspace will reopen automatically once access is restored.</p>}
    {state!=="checking"&&<div className="license-actions">{grace?<button type="button" className="bistro-button bistro-button-gold" onClick={continueWorking}>Continue working</button>:<button type="button" className="bistro-button bistro-button-gold" disabled={signingOut} onClick={()=>void signOut()}>{signingOut?"Signing out…":"Sign out"}</button>}</div>}
    <p className="license-preserved"><ShieldCheck size={15} aria-hidden="true"/>Your bookings, tables and history are preserved.</p>
    {error&&<p role="alert">{error}</p>}
   </div>
  </dialog>
 </>;
}
