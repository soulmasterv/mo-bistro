"use client";
import { useEffect, useRef, useState } from "react";
import { useConfirmation } from "@/components/confirmation-provider";

type CleanupState = {
  available: boolean;
  enabled?: boolean;
  schedulerConfigured?: boolean;
  lastResult?: { completedAt: string; deletedGuests: number } | null;
};
export default function ManagementCleanup({ blocked = false }: { blocked?: boolean }) {
  const [state, setState] = useState<CleanupState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const locked = useRef(false);
  const confirm = useConfirmation();
  useEffect(() => {
    let active = true;
    fetch("/api/management/cleanup", { cache: "no-store" }).then(async response => {
      if (!response.ok) throw new Error("Cleanup settings unavailable.");
      const data = await response.json();
      if (active) setState(data);
    }).catch(() => { if (active) setError("Cleanup settings unavailable."); });
    return () => { active = false; };
  }, []);
  async function toggle() {
    if (!state || locked.current) return;
    locked.current = true;
    const enabled = !state.enabled;
    try {
      if (!await confirm({ title: enabled ? "Enable automatic cleanup?" : "Pause automatic cleanup?",
        confirmLabel: enabled ? "Enable cleanup" : "Pause cleanup", destructive: enabled,
        message: enabled
          ? "Scheduled cleanup will permanently delete seated bookings older than 72 hours, their customer details and booking-linked WhatsApp history. Active bookings, occupied named tables and unsubscribe protections are kept. This cannot be undone."
          : "Scheduled cleanup will stop deleting records. Existing deletions cannot be undone." })) return;
      setBusy(true); setError("");
      const response = await fetch("/api/management/cleanup", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled, confirm: true }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save cleanup settings.");
      setState({ ...state, enabled: data.enabled });
    } catch (err) { setError(err instanceof Error ? err.message : "Could not save cleanup settings."); }
    finally { locked.current = false; setBusy(false); }
  }
  if (state && !state.available) return null;
  return <div className="space-y-3 border-t border-current/15 pt-4" aria-label="Automatic database cleanup">
    <h3 className="font-semibold">Automatic database cleanup</h3>
    <p>Remove seated bookings and customer details after 3 days, plus expired QR permits, sessions and temporary security records.</p>
    <p className="bistro-muted">Waiting and called guests, occupied named tables, inventory and WhatsApp unsubscribe protections are kept. Missing seating timestamps and unresolved message deliveries are held for review.</p>
    {state && <>
      <p role="status">{state.enabled ? "Enabled — waiting for scheduled runs" : "Paused — no automatic deletion"}</p>
      {!state.schedulerConfigured && <p className="bistro-muted">Private scheduler setup is required before enabling cleanup.</p>}
      {state.lastResult && <p>Last cleanup: {new Date(state.lastResult.completedAt).toLocaleString()} · {state.lastResult.deletedGuests} seated bookings removed.</p>}
      <button type="button" className="bistro-button bistro-button-danger"
        disabled={blocked || busy || (!state.enabled && !state.schedulerConfigured)} onClick={() => void toggle()}>
        {busy ? "Saving…" : state.enabled ? "Pause automatic cleanup" : "Enable automatic cleanup"}
      </button>
    </>}
    {error && <p role="alert">{error}</p>}
  </div>;
}
