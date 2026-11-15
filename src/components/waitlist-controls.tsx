"use client";

import { useEffect, useRef, useState } from "react";
import { useConfirmation } from "@/components/confirmation-provider";

type Settings = { paused: boolean; canPause: boolean; receptionAllowed?: boolean };
const endpoint = "/api/staff/waitlist";

export default function WaitlistControls({ management = false }: { management?: boolean }) {
  const confirm = useConfirmation();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch(endpoint, { cache: "no-store", signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw Error("Could not load public waitlist settings.");
        setSettings(await response.json());
      })
      .catch(error => { if (!controller.signal.aborted) setError(error.message); });
    return () => controller.abort();
  }, []);

  async function save(changes: { paused: boolean; confirm: true } | { receptionAllowed: boolean }) {
    if (locked.current) return;
    locked.current = true;
    try {
      if ("paused" in changes && !await confirm({
        title: changes.paused ? "Pause public registrations?" : "Reopen public registrations?",
        message: changes.paused ? "Guests will no longer be able to join through the public page." : "Guests will be able to join through the public page.",
        confirmLabel: changes.paused ? "Pause registrations" : "Reopen registrations",
      })) return;
      setBusy(true);
      setError("");
      const response = await fetch(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(changes),
      });
      if (!response.ok) throw Error((await response.json().catch(() => null))?.error || "Could not save waitlist settings.");
      setSettings(current => current && { ...current, ...changes });
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not save waitlist settings.");
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }

  if (!management && !settings?.canPause) return null;
  if (!management && settings) return (
    <>
      <button type="button" className="workspace-option" disabled={busy} onClick={() => void save({ paused: !settings.paused, confirm: true })}>
        {busy ? "Saving…" : settings.paused ? "Reopen public registrations" : "Pause public registrations"}
      </button>
      {error && <p role="alert" className="px-3 text-sm">{error}</p>}
    </>
  );
  return (
    <section className="bistro-panel space-y-3 p-5" aria-label="Public waitlist">
      <h2>Public waitlist</h2>
      {settings && <>
        <div className="flex flex-wrap items-center gap-3">
          <p role="status">{busy ? "Saving…" : settings.paused ? "Registrations paused" : "Registrations open"}</p>
          <button type="button" className="bistro-button" disabled={busy} onClick={() => void save({ paused: !settings.paused, confirm: true })}>
            {settings.paused ? "Reopen registrations" : "Pause registrations"}
          </button>
        </div>
        {management && typeof settings.receptionAllowed === "boolean" && (
          <label className="flex items-center gap-3 text-sm">
            <input type="checkbox" checked={settings.receptionAllowed} disabled={busy} onChange={event => void save({ receptionAllowed: event.target.checked })} />
            Allow Reception to pause and reopen registrations
          </label>
        )}
      </>}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
