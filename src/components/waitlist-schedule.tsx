"use client";
import {useEffect,useState} from "react";

type Schedule = {enabled:boolean;open:string;close:string;cutoff:string};
export default function WaitlistSchedule({endpoint}: {endpoint:string}) {
  const [schedule,setSchedule] = useState<Schedule>();
  const [message,setMessage] = useState("");
  const [saving,setSaving] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch(endpoint,{signal:controller.signal}).then(r => r.json()).then(data => setSchedule(data.schedule)).catch(() => {});
    return () => controller.abort();
  },[endpoint]);
  if (!schedule) return null;
  return <details className="rounded-xl border border-white/20 p-4 text-sm">
    <summary className="cursor-pointer font-semibold">Waitlist hours</summary>
    <form className="mt-4 space-y-4" onSubmit={async event => {
      event.preventDefault();
      setSaving(true);
      setMessage("");
      try {
        const response = await fetch(endpoint,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(schedule)});
        const data = await response.json();
        setMessage(response.ok ? "Hours saved." : data.error || "Could not save hours.");
      } catch {setMessage("Could not save hours.");}
      finally {setSaving(false);}
    }}>
      <p>Daily Cairo time. Reception can still add walk-ins after cutoff.</p>
      <label className="flex items-center gap-2"><input type="checkbox" checked={schedule.enabled} onChange={e=>setSchedule({...schedule,enabled:e.target.checked})}/> Turn on waitlist hours</label>
      <div className="flex flex-wrap gap-4">
        {([["open","Restaurant opens"],["close","Restaurant closes"],["cutoff","Last registration"]] as const).map(([key,label])=>
          <label className="grid gap-1" key={key}>{label}<input required type="time" value={schedule[key]} className="rounded border border-neutral-500 bg-neutral-800 p-2 text-white" onChange={e=>setSchedule({...schedule,[key]:e.target.value})}/></label>)}
      </div>
      <button className="rounded bg-[#dfbd84] px-4 py-2 font-semibold text-[#222]" disabled={saving}>{saving?"Saving…":"Save hours"}</button>
      {message&&<p role="status">{message}</p>}
    </form>
  </details>;
}
