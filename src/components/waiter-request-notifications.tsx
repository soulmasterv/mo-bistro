"use client";

import { useEffect, useRef, useState } from "react";

type RequestItem = {
  id: number;
  table_name: string;
  status: string;
};

export default function WaiterRequestNotifications() {
  const [requests, setRequests] = useState<RequestItem[]>([]);
  const [message, setMessage] = useState("");
  const previous = useRef<Map<number, string> | null>(null);
  const audio = useRef<AudioContext | null>(null);
  const soundEnabled = useRef(false);
  const [soundOn, setSoundOn] = useState(false);

  async function toggleSound() {
    if (soundEnabled.current) {
      soundEnabled.current = false;
      setSoundOn(false);
      return;
    }
    try {
      const ctx = audio.current ?? new AudioContext();
      await ctx.resume();
      audio.current = ctx;
      soundEnabled.current = true;
      setSoundOn(true);
    } catch {
      setMessage("Sound is unavailable in this browser.");
    }
  }

  function chime() {
    const ctx = audio.current;
    if (!soundEnabled.current || !ctx || ctx.state !== "running") return;
    [660, 880].forEach((frequency, index) => {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = ctx.currentTime + index * 0.17;
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.12, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.25);
      oscillator.connect(gain).connect(ctx.destination);
      oscillator.start(start);
      oscillator.stop(start + 0.26);
    });
  }

  useEffect(() => {
    let active = true;

    async function refresh() {
      try {
        const response = await fetch("/api/waiter/table-requests", {
          cache: "no-store",
        });
        if (!response.ok) return;

        const data = await response.json();
        const list: RequestItem[] = Array.isArray(data.requests) ? data.requests : [];
        if (!active) return;

        const current = new Map(list.map(item => [item.id, item.status]));
        if (previous.current) {
          for (const item of list) {
            const oldStatus = previous.current.get(item.id);
            if (oldStatus === "pending" && item.status === "approved") {
              setMessage(`${item.table_name} approved by reception. Table is now available.`);
              chime();
            } else if (oldStatus === "pending" && item.status === "rejected") {
              setMessage(`${item.table_name} request rejected by reception.`);
            }
          }
        }
        previous.current = current;
        setRequests(list);
      } catch {
        // Keep the last known status during temporary connection failures.
      }
    }

    void refresh();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 3000);

    return () => {
      active = false;
      window.clearInterval(timer);
      void audio.current?.close();
    };
  }, []);

  const pending = requests.filter(item => item.status === "pending");

  return (
    <div className="fixed bottom-4 right-4 z-40 w-[min(360px,calc(100vw-32px))] rounded-2xl border border-[#D6B681] bg-[#30362B] p-4 text-white shadow-xl">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">My table requests</h2>
        <div className="flex items-center gap-2">
          <span className="text-xs text-[#D6B681]">{pending.length} pending</span>
          <button type="button" onClick={() => void toggleSound()} className="rounded-lg border border-white/20 px-2 py-2 text-xs">
            {soundOn ? "Mute" : "Enable sound"}
          </button>
        </div>
      </div>
      {message && (
        <div role="status" className="mt-3 rounded-lg bg-white/10 p-3 text-sm">
          {message}
          <button onClick={() => setMessage("")} className="ml-3 text-xs underline">Dismiss</button>
        </div>
      )}
      {pending.length > 0 && (
        <div className="mt-3 space-y-1 text-xs text-slate-300">
          {pending.map(item => <p key={item.id}>{item.table_name} · Awaiting reception</p>)}
        </div>
      )}
    </div>
  );
}
