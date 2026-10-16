"use client";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, FilePenLine } from "lucide-react";
import styles from "./guest-booking-editor.module.css";

type Values = { name: string; party_size: number; seating_preference: string; notes: string; revision: number };
type Data = { booking: Values & { status: string }; history: {
  id: number | string; actor: string | null; created_at: string; before_values: Values; after_values: Values;
}[] };
const fields = { name: "Guest name", party_size: "Party size", seating_preference: "Seating preference", notes: "Staff notes" } as const;

export default function GuestBookingEditor({ guestId, disabled, onSaved, onBusyChange }: {
  guestId: number; disabled: boolean; onSaved: () => void; onBusyChange: (busy: boolean) => void;
}) {
  const [data, setData] = useState<Data | null>(null);
  const [values, setValues] = useState<Values | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const pending = useRef(false);
  async function load(signal?: AbortSignal) {
    try {
      const response = await fetch(`/api/guests/${guestId}/staff-details`, { cache: "no-store", signal });
      const result = await response.json();
      if (!response.ok) throw Error(result.error || "Unable to load staff notes.");
      if (signal?.aborted) return;
      setData(result); setValues(result.booking); setError("");
    } catch (e) {
      if (!signal?.aborted) setError(e instanceof Error ? e.message : "Unable to load staff notes.");
    }
  }
  useEffect(() => {
    const controller = new AbortController();
    async function initial() {
      try {
        const response = await fetch(`/api/guests/${guestId}/staff-details`, { cache: "no-store", signal: controller.signal });
        const result = await response.json();
        if (!response.ok) throw Error(result.error || "Unable to load staff notes.");
        if (!controller.signal.aborted) { setData(result); setValues(result.booking); }
      } catch (e) {
        if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Unable to load staff notes.");
      }
    }
    void initial();
    return () => controller.abort();
  }, [guestId]);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (pending.current || disabled || !values) return;
    pending.current = true; setSaving(true); onBusyChange(true); setMessage(""); setError("");
    try {
      const response = await fetch(`/api/guests/${guestId}/staff-details`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revision: values.revision, name: values.name,
          party_size: values.party_size, seating_preference: values.seating_preference, notes: values.notes }),
      });
      const result = await response.json();
      if (!response.ok) throw Error(result.error || "Unable to save changes.");
      setValues({ ...values, revision: result.revision });
      setMessage("Changes saved."); onSaved(); await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to save changes. Reload before trying again."); }
    finally { pending.current = false; setSaving(false); onBusyChange(false); }
  }
  const editable = data && ["waiting", "called"].includes(data.booking.status);
  const closed = data && !["waiting", "called", "seated"].includes(data.booking.status);
  return <details className={`queue-booking-details ${styles.editor}`}>
    <summary><span><FilePenLine size={16} aria-hidden="true" /> Staff notes &amp; booking</span><ChevronDown className="queue-details-chevron" size={17} aria-hidden="true" /></summary>
    <p className={styles.hint}>Notes are private to reception and managers. They are never shown to guests or included in WhatsApp messages.</p>
    {!data && !error && <p role="status">Loading booking…</p>}
    {error && <p role="alert" className="bistro-alert">{error}</p>}
    {values && <form onSubmit={save}>
      <fieldset disabled={disabled || saving || !!closed} className={styles.fields}>
        <label>Staff notes<textarea rows={3} maxLength={1000} value={values.notes}
          placeholder="Allergies, special requests or handover details…"
          onChange={e => setValues({ ...values, notes: e.target.value })} /></label>
        <small className={styles.hint}>{values.notes.length} / 1,000 characters</small>
        <details className={styles.editDetails}>
          <summary>Edit booking details</summary>
          {!editable && <p className={styles.hint}>This guest is seated. You can still update staff notes.</p>}
          <fieldset disabled={!editable} className={styles.fields}>
            <label>Guest name<input required minLength={2} maxLength={100} value={values.name} onChange={e => setValues({ ...values, name: e.target.value })} /></label>
            <div className={styles.row}>
              <label>Party size<input type="number" required min={1} max={30} value={values.party_size} onChange={e => setValues({ ...values, party_size: Number(e.target.value) })} /></label>
              <label>Seating preference<select value={values.seating_preference} onChange={e => setValues({ ...values, seating_preference: e.target.value })}>
                <option value="any">Any seating</option><option value="indoor">Indoor</option><option value="outdoor">Outdoor</option>
              </select></label>
            </div>
          </fieldset>
        </details>
        <button className="bistro-button" type="submit">{saving ? "Saving changes…" : "Save changes"}</button>
      </fieldset>
    </form>}
    <button type="button" disabled={disabled || saving} className={styles.reload} onClick={() => { setMessage(""); void load(); }}>Reload latest (replaces draft)</button>
    {message && <p role="status">{message}</p>}
    {!!data?.history.length && <details className={styles.history}>
      <summary>Recent changes ({data.history.length})</summary>
      <ol>{data.history.map(change => <li key={change.id}>
        <strong>{change.actor || "Former staff member"}</strong><time dateTime={change.created_at}>{new Date(change.created_at).toLocaleString()}</time>
        {Object.entries(fields).filter(([key]) => change.before_values[key as keyof typeof fields] !== change.after_values[key as keyof typeof fields]).map(([key, label]) => <div key={key}>
          <strong>{label}</strong><p>Before: {String(change.before_values[key as keyof typeof fields] || "Empty")}</p><p>After: {String(change.after_values[key as keyof typeof fields] || "Empty")}</p>
        </div>)}
      </li>)}</ol>
    </details>}
  </details>;
}
