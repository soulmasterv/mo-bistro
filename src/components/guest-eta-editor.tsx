"use client";
import { useState } from "react";
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
  async function save(value: number | null) {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      const r = await fetch(`/api/guests/${guestId}/eta`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ minutes: value }),
      });
      const data = await r.json();
      if (!r.ok) throw Error(data.error || "Unable to save ETA.");
      setMessage(
        value === null
          ? "Expected readiness cleared."
          : "Expected readiness saved.",
      );
      onSaved();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Unable to save ETA.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="queue-booking-details">
      <summary>Expected table readiness</summary>
      <p className="my-3 text-sm">
        Set this guest’s expected readiness. Almost Ready uses this time; the
        restaurant-wide estimate stays separate.
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
