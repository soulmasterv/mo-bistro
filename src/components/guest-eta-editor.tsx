"use client";
import { useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { useConfirmation } from "@/components/confirmation-provider";
export default function GuestEtaEditor({
  guestId,
  onSaved,
  manualNearlyReady=false,
  canMessage=false,
  presetsOpen=false,
  onPresetsToggle,
}: {
  guestId: number;
  onSaved: () => void;
  manualNearlyReady?:boolean;
  canMessage?:boolean;
  presetsOpen?:boolean;
  onPresetsToggle?:(open:boolean)=>void;
}) {
  const [minutes, setMinutes] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [preset, setPreset] = useState('almost_ready');
  const confirmAction = useConfirmation();
  const pending = useRef(false);
  const attempt = useRef<{value:number|null;id:string;kind:string}|null>(null);
  async function save(value: number | null,kind='eta_update') {
    if (pending.current) return;
    pending.current = true;
    if (!attempt.current || attempt.current.value !== value||attempt.current.kind!==kind) attempt.current = {value,id:crypto.randomUUID(),kind};
    setBusy(true);
    setMessage("");
    try {
      const r = await fetch(`/api/guests/${guestId}/eta`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ minutes: value, requestId:attempt.current.id,message:kind }),
      });
      const data = await r.json();
      if (!r.ok) throw Error(data.error || "Unable to save ETA.");
      attempt.current = null;
      setMessage(
        kind==='almost_ready'?(data.manual_nearly_ready==='queued'?'10-minute estimate saved and nearly-ready update queued for sending checks.':'Nearly-ready update was already requested, or WhatsApp is disabled.'):value === null
          ? "Expected readiness cleared."
          : "Expected readiness saved." + (data.whatsapp === "migration_required" ? " Immediate WhatsApp updates require database setup." : data.whatsapp === "simulated_if_subscribed" ? " WhatsApp is currently simulated." : data.whatsapp === "disabled" ? " Automatic WhatsApp is disabled." : data.whatsapp === "queued_if_subscribed" ? " WhatsApp update queued for eligible subscribers." : ""),
      );
      onSaved();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Unable to save ETA.");
    } finally {
      setBusy(false);
      pending.current = false;
    }
  }
  return (
    <details className="queue-booking-details" open={presetsOpen || undefined} onToggle={event=>onPresetsToggle?.(event.currentTarget.open)}>
      <summary>Expected table readiness <ChevronDown className="queue-details-chevron" size={17} aria-hidden="true" /></summary>
      <p className="my-3 text-sm">
        Updates this guest’s status page and queues a WhatsApp time update for eligible subscribers.
        {manualNearlyReady?' Updates use minutes from now. Nearly-ready messages are sent only when you press the button below.':' Almost Ready follows 10 minutes before; under 10 minutes, one immediate alert covers both.'}
      </p>
      <form
        className="guest-eta-form"
        onSubmit={(e) => {
          e.preventDefault();
          void save(Number(minutes));
        }}
      >
        <label className="block text-sm">
          Minutes from now
          <input
            id="guest-eta-minutes"
            type="number"
            min={1}
            max={240}
            required
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
            className="mt-2 w-full rounded-xl border p-3"
          />
        </label>
        <div className="mt-3 flex gap-3">
          <button type="submit" className="bistro-button" disabled={busy}>
            Save ETA
          </button>
          <button
            type="button"
            className="bistro-button bistro-button-secondary"
            disabled={busy}
            onClick={() => void save(null)}
          >
            Clear ETA
          </button>
        </div>
        {manualNearlyReady&&<div className="mt-4">
          <label className="block text-sm">Preset WhatsApp message
            <select id="guest-message-preset" value={preset} onChange={event=>setPreset(event.target.value)} disabled={busy || !canMessage}>
              <option value="almost_ready">Nearly ready · about 10 minutes</option>
              <option value="eta_update">Updated wait time · use minutes above</option>
            </select>
          </label>
          <button type="button" className="bistro-button bistro-button-secondary mt-3" disabled={busy || !canMessage}
            onClick={async()=>{
              if(!canMessage || busy)return;
              const value=preset==='almost_ready'?10:Number(minutes);
              if(!Number.isInteger(value)||value<1||value>240){setMessage('Enter a wait time between 1 and 240 minutes.');return;}
              if(!await confirmAction({title:'Send this update?',confirmLabel:'Send update',message:preset==='almost_ready'
                ?'This sets a 10-minute estimate. Send only if reception expects a table in about 10 minutes.'
                :`This sets an estimated wait of ${value} minutes and queues the update for sending checks.`}))return;
              setMinutes(String(value));void save(value,preset);
            }}>
            Send preset update
          </button>
          {!canMessage&&<p className="mt-2 text-sm">WhatsApp updates are unavailable until this guest subscribes.</p>}
        </div>}
      </form>
      <p role="status" className="mt-3 text-sm">
        {message}
      </p>
    </details>
  );
}
