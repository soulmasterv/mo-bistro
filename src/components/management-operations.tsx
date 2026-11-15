"use client";
import { useCallback, useEffect, useRef, useState } from "react";


type Job = {guest_id:number; kind:string; status:string; due_at:string; delivery:string|null; subscribed:boolean; window_open:boolean; reason:string|null};
type Insights = {available:boolean;paused:boolean;accuracy:{samples:number;estimated_samples:number;average_wait:string|null;average_error:string|null;signed_error:string|null;within_ten:number}|null;
  whatsapp:{configured:Record<string,boolean>;blockers:string[];jobs:Job[]}};
const time = (value:string) => new Date(value).toLocaleString();
export default function ManagementOperations() {
  const [data,setData]=useState<Insights|null>(null);
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);
  const locked=useRef(false);

  const refresh=useCallback(async()=>{
    const response=await fetch("/api/management/operations",{cache:"no-store"});
    if(!response.ok) throw Error("Operations insights are temporarily unavailable.");
    setData(await response.json());
  },[]);
  useEffect(()=>{const timer=setTimeout(()=>void refresh().catch(err=>setError(err.message)),0);return()=>clearTimeout(timer);},[refresh]);
  async function action() {
    if(locked.current) return;
    locked.current=true;
    try {
      setBusy(true);setError("");
      await refresh();
    } catch(err) {setError(err instanceof Error?err.message:"Operations unavailable.");}
    finally {locked.current=false;setBusy(false);}
  }
  return <section id="service-controls" className="bistro-settings-group space-y-5" aria-label="Service controls">
    <div className="bistro-panel-heading"><div><h2>Service controls</h2><p className="bistro-muted">Availability, wait accuracy and notification visibility.</p></div>
      <button type="button" className="bistro-button bistro-button-secondary" disabled={busy} onClick={()=>void action()}>{busy?"Updating…":"Refresh insights"}</button></div>
    {error && <p role="alert">{error}</p>}
    {data && !data.available && <p>These insights require PostgreSQL.</p>}
    {data?.available && <>
      <article className="bistro-panel space-y-3 p-5"><h3>Wait-time accuracy</h3>
        {!data.accuracy ? <p>Recording requires the operations visibility migration. No historical results have been invented.</p>
          : data.accuracy.samples===0 ? <p>No seating samples yet. New seatings will build this view.</p> : <>
          <p>Last 30 days · {data.accuracy.samples} seating samples</p>
          <p><strong>{data.accuracy.average_wait} min</strong> average actual wait</p>
          {data.accuracy.estimated_samples>0 ? <>
            <p><strong>{data.accuracy.average_error} min</strong> average difference from the last booking ETA · {data.accuracy.estimated_samples} estimates</p>
            <p>{data.accuracy.within_ten} seated within 10 minutes of their last ETA.</p>
            <p className="bistro-muted">On average, guests were seated {Math.abs(Number(data.accuracy.signed_error))} minutes {Number(data.accuracy.signed_error)>=0?"later":"earlier"} than estimated. Use this to refine reception estimates.</p>
          </> : <p>No personal ETA comparisons yet.</p>}
          <p className="bistro-muted">Uses recorded join/seating timestamps and the last personal ETA. Estimates are not adjusted automatically.</p>
        </>}
      </article>
      <article className="bistro-panel space-y-3 p-5" aria-label="WhatsApp health"><h3>WhatsApp health</h3>
        <p><strong>{data.whatsapp.configured.live?"Live sending permitted by configuration":"Automatic sending is disabled or simulated"}</strong></p>
        <p className="bistro-muted">Notifications: {data.whatsapp.configured.enabled?"enabled":"disabled"} · Live mode: {data.whatsapp.configured.modeLive?"on":"off"} · Live-send permission: {data.whatsapp.configured.livePermission?"on":"off"}</p>
        {data.whatsapp.blockers.map(reason=><p key={reason} className="bistro-muted">{reason}</p>)}
        <p className="bistro-muted">ETA changes: an immediate time update, then Almost Ready 10 minutes before. Under 10 minutes, one immediate update covers both. Reviews: 60 minutes after seating for customers who subscribed with review permission. Subscribing and marking called do not send an immediate update.</p>
        <div className="operations-scroll" aria-label="Recent WhatsApp notifications" tabIndex={0}>
          {data.whatsapp.jobs.length===0 ? <p>No notification jobs to display. Check subscription and a personal booking ETA first.</p> : data.whatsapp.jobs.map((job,i)=><div className="operations-entry" key={`${job.guest_id}-${job.kind}-${i}`}>
            <strong>Booking #{job.guest_id} · {job.kind.replaceAll("_"," ")}</strong>
            <p>{job.status} · Delivery: {job.delivery??"not confirmed"}</p>
            <p>Due: {time(job.due_at)} · {job.subscribed?"Subscribed":"Not subscribed / opted out"} · {job.window_open?"24-hour window open":"24-hour window closed or unverified"}</p>
            {job.reason && <p>{job.reason}</p>}
          </div>)}
        </div>
        <p className="bistro-muted">Setup checks do not send messages or retry jobs. The isolated manual test remains separate.</p>
      </article>
    </>}
  </section>;
}
