"use client";
import {useEffect,useState} from "react";

type Schedule = {enabled:boolean;open:string;close:string;cutoff:string};
export default function WaitlistSchedule({endpoint}: {endpoint:string}) {
  const [schedule,setSchedule] = useState<Schedule>();
  const [message,setMessage] = useState("");
  const [saving,setSaving] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch(endpoint,{signal:controller.signal}).then(async response => {
      const data = await response.json();
      if (!response.ok || !data.schedule) throw new Error("Could not load waitlist hours.");
      setSchedule(data.schedule);
    }).catch(() => {
      if (!controller.signal.aborted) setMessage("Could not load waitlist hours. Refresh to try again.");
    });
    return () => controller.abort();
  },[endpoint]);
  return <section aria-labelledby="waitlist-hours-title" className="rounded-2xl border border-[#353636] bg-[#191a1a] p-5 text-sm sm:p-7">
    <h2 id="waitlist-hours-title" className="text-xl font-semibold">Waitlist hours</h2>
    <p className="mt-2 text-[#bdb8ae]">Daily Cairo time. Reception can still add walk-ins after cutoff.</p>
    {!schedule ? <p role="status" className="mt-5">{message || "Loading waitlist hours…"}</p> :
    <form className="mt-5 space-y-5" onSubmit={async event => {
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
      <label className="flex min-h-11 items-center gap-3 rounded-lg border border-[#454644] px-3 font-medium"><input type="checkbox" className="size-4 accent-[#dfbd84]" checked={schedule.enabled} onChange={e=>setSchedule({...schedule,enabled:e.target.checked})}/> Turn on waitlist hours</label>
      <div className="grid gap-4 sm:grid-cols-3">
        {([["open","Restaurant opens"],["close","Restaurant closes"],["cutoff","Last registration"]] as const).map(([key,label])=>
          <label className="grid min-w-0 gap-2 font-medium" key={key}>{label}<input required type="time" value={schedule[key]} className="min-h-11 w-full min-w-0 rounded-lg border border-neutral-500 bg-[#252626] px-3 text-white [color-scheme:dark] focus-visible:outline-2 focus-visible:outline-[#dfbd84]" onChange={e=>setSchedule({...schedule,[key]:e.target.value})}/></label>)}
      </div>
      <button className="min-h-11 rounded-lg bg-[#dfbd84] px-5 font-semibold text-[#222] disabled:opacity-60" disabled={saving}>{saving?"Saving…":"Save hours"}</button>
      {message&&<p role="status">{message}</p>}
    </form>}
  </section>;
}
