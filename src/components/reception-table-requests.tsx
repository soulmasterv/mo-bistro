"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import SeatGuestModal from "@/components/seat-guest-modal";

type RequestItem = {
  id: number;
  table_id: number;
  table_name?: string;
  requested_by?: string;
  requested_at?: string;
};

type SuggestedGuest = { id: number; name: string; party_size: number; seating_preference: string };
type ApprovedTable = { name: string; guest: SuggestedGuest | null };

export default function ReceptionTableRequests() {
  const [requests, setRequests] = useState<RequestItem[]>([]);
  const [approved, setApproved] = useState<ApprovedTable | null>(null);
  const [seatingGuest, setSeatingGuest] = useState<SuggestedGuest | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const seen = useRef<Set<number> | null>(null);
  const audio = useRef<AudioContext | null>(null);
  const soundRef = useRef(false);

  function chime() {
    if (!soundRef.current || !audio.current) return;
    const ctx = audio.current;
    if (ctx.state !== "running") return;
    for (const [index, frequency] of [660, 880].entries()) {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = ctx.currentTime + index * 0.17;
      oscillator.frequency.value = frequency;
      oscillator.type = "sine";
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.12, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.25);
      oscillator.connect(gain).connect(ctx.destination);
      oscillator.start(start);
      oscillator.stop(start + 0.26);
    }
  }

  async function enableSound() {
    try {
      const ctx = audio.current ?? new AudioContext();
      await ctx.resume();
      audio.current = ctx;
      soundRef.current = true;
      setSoundEnabled(true);
      chime();
    } catch {
      setError("Audio is unavailable in this browser.");
    }
  }

  function mute() {
    soundRef.current = false;
    setSoundEnabled(false);
  }

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/reception/table-requests", {
        cache: "no-store",
        credentials: "same-origin",
      });
      if (!response.ok) throw new Error("Unable to load table requests.");
      const data = await response.json();
      const list: RequestItem[] = Array.isArray(data) ? data :
        Array.isArray(data.requests) ? data.requests : [];
      const ids = new Set(list.map(item => Number(item.id)));
      if (seen.current !== null && [...ids].some(id => !seen.current!.has(id))) {
        chime();
      }
      seen.current = ids;
      setRequests(list);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to refresh requests.");
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 3000);
    return () => clearInterval(timer);
  }, [refresh]);

  useEffect(() => () => { void audio.current?.close(); }, []);

  async function review(id: number, decision: "approve" | "reject") {
    if (busyId !== null) return;
    setBusyId(id);
    try {
      const response = await fetch(`/api/reception/table-requests/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ action: decision }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Request update failed.");
      await refresh();
      if (decision === "approve") {
        const item = requests.find(entry => entry.id === id);
        if (item) {
          setApproved({ name: item.table_name || `Table ${item.table_id}`, guest: null });
          try {
            const next = await fetch(`/api/reception/next-guest?table_id=${item.table_id}`, { cache: "no-store" });
            if (!next.ok) throw new Error("Unable to check the guest queue.");
            const data = await next.json();
            setApproved({ name: item.table_name || `Table ${item.table_id}`, guest: data.guest ?? null });
          } catch {
            setError("Table approved, but the next guest could not be checked. Use the regular reception queue.");
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request update failed.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
    {approved && (
      <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4">
        <div role="dialog" aria-modal="true" aria-label="Table approved" className="w-full max-w-sm rounded-2xl bg-[#FFFCF7] p-6 text-[#293126] shadow-2xl">
          <h2 className="font-serif text-3xl">Table is free!</h2>
          <p className="mt-2 text-sm">{approved.name} is available for the next guest.</p>
          {approved.guest ? (
            <div className="mt-5 rounded-xl bg-[#F1EBDF] p-4">
              <p className="text-xs font-semibold uppercase tracking-wider">Next eligible guest</p>
              <p className="mt-2 text-xl font-semibold">{approved.guest.name}</p>
              <p className="text-sm">{approved.guest.party_size} guests · {approved.guest.seating_preference}</p>
              <button onClick={() => { setSeatingGuest(approved.guest); setApproved(null); }} className="mt-4 w-full rounded-xl bg-[#293126] p-3 font-semibold text-white">Seat Guest</button>
            </div>
          ) : (
            <p className="mt-4 text-sm">No eligible guests currently waiting for this table.</p>
          )}
          <button onClick={() => setApproved(null)} className="mt-4 w-full rounded-xl border border-[#C9C8BD] p-3 font-semibold">Close</button>
        </div>
      </div>
    )}
    {seatingGuest && <SeatGuestModal guest={seatingGuest} onClose={() => setSeatingGuest(null)} onSuccess={() => { setSeatingGuest(null); window.dispatchEvent(new Event("guest-seated")); }} />}
    <section className="fixed bottom-4 right-4 z-50 w-[min(420px,calc(100vw-32px))] rounded-2xl border border-[#D6B681] bg-[#293126] p-5 text-white shadow-2xl">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold">Table-ready requests ({requests.length})</h2>
        <button onClick={soundEnabled ? mute : () => void enableSound()} className="rounded-lg border border-white/20 px-3 py-2 text-xs">
          {soundEnabled ? "Mute" : "Enable sound"}
        </button>
      </div>
      {error && <p role="alert" className="mt-3 text-sm text-red-300">{error}</p>}
      {requests.length === 0 ? (
        <p className="mt-3 text-sm text-slate-300">No pending table requests.</p>
      ) : (
        <div className="mt-4 max-h-72 space-y-3 overflow-y-auto">
          {requests.map(item => (
            <div key={item.id} className="rounded-xl bg-white/10 p-4">
              <p className="font-semibold">{item.table_name || `Table ${item.table_id}`}</p>
              <p className="mt-1 text-xs text-slate-300">Requested by {item.requested_by || "staff"}</p>
              <div className="mt-3 flex gap-2">
                <button disabled={busyId !== null} onClick={() => void review(item.id, "approve")} className="flex-1 rounded-lg bg-[#D6B681] p-3 font-semibold text-[#293126] disabled:opacity-50">Approve</button>
                <button disabled={busyId !== null} onClick={() => void review(item.id, "reject")} className="flex-1 rounded-lg border border-white/30 p-3 disabled:opacity-50">Reject</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
    </>
  );
}
