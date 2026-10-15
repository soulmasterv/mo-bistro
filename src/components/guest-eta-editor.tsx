"use client";
import { useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
export default function GuestEtaEditor({
  guestId,
  onSaved,
}: {
  guestId: number;
  onSaved: () => void;
}) {
  const [minutes, setMinutes] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const pending = useRef(false);
  const attempt = useRef<{value:number|null;id:string}|null>(null);
  async function save(value: number | null) {
    if (pending.current) return;
    pending.current = true;
    if (!attempt.current || attempt.current.value !== value) attempt.current = {value,id:crypto.randomUUID()};
    setBusy(true);
    setMessage("");
    try {
      const r = await fetch(`/api/guests/${guestId}/eta`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ minutes: value, requestId:attempt.current.id }),
      });
      const data = await r.json();
      if (!r.ok) throw Error(data.error || "Unable to save ETA.");
      attempt.current = null;
      setMessage(
        value === null
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
    <details className="queue-booking-details">
      <summary>Expected table readiness <ChevronDown className="queue-details-chevron" size={17} aria-hidden="true" /></summary>
      <p className="my-3 text-sm">
        Updates this guest’s status page and queues a WhatsApp time update for eligible subscribers.
        Almost Ready follows 10 minutes before; under 10 minutes, one immediate alert covers both.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save(Number(minutes));
        }}
      >
        <label className="block text-sm">
          Minutes from now
          <input
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
      </form>
      <p role="status" className="mt-3 text-sm">
        {message}
      </p>
    </details>
  );
}
