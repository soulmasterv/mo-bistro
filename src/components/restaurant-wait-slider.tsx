"use client";

import { useCallback, useEffect, useState } from "react";

function formatWait(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (!hours) return `${remainder} mins`;
  const label = `${hours} ${hours === 1 ? "hour" : "hours"}`;
  return remainder ? `${label} ${remainder} mins` : label;
}

export default function RestaurantWaitSlider() {
  const [minutes, setMinutes] = useState<number | null>(null);
  const [saved, setSaved] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/wait-estimate", { cache: "no-store" });
      if (!response.ok) throw new Error();
      const data = await response.json();
      if (Number.isSafeInteger(data.minutes) && data.minutes >= 15 && data.minutes <= 240) {
        setSaved(data.minutes);
        setMinutes(data.minutes);
        setError("");
      } else throw new Error("Invalid wait estimate");
    } catch {
      setError("Could not load the restaurant wait estimate.");
    }
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(initial);
  }, [refresh]);

  async function save() {
    if (minutes === null || busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/wait-estimate", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ minutes }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Unable to save.");
      }
      setSaved(minutes);
      window.dispatchEvent(new Event("mo-bistro-wait-changed"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="my-6 rounded-2xl border border-[#C5A77B]/25 bg-[#17202A] p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Estimated restaurant wait</h2>
          <p className="mt-1 text-sm text-slate-400">
            One estimate for everyone. Not a guest-specific countdown.
          </p>
        </div>
        <span className="text-2xl font-semibold text-[#C5A77B]">
          {minutes === null ? error ? "Estimate unavailable" : "Loading estimate…" : formatWait(minutes)}
        </span>
      </div>

      <input
        type="range"
        min={15}
        max={240}
        step={15}
        value={minutes ?? 15}
        disabled={minutes === null || busy}
        onChange={event => setMinutes(Number(event.target.value))}
        aria-label="Restaurant estimated wait in minutes"
        className="mt-6 w-full accent-[#C5A77B]"
      />

      <div className="mt-2 flex justify-between text-xs text-slate-400">
        <span>15 mins</span>
        <span>4 hours</span>
      </div>

      <div className="mt-5 flex items-center gap-3">
        <button
          type="button"
          onClick={() => void save()}
          disabled={busy || minutes === null || minutes === saved}
          className="rounded-xl bg-[#C5A77B] px-5 py-2.5 text-sm font-semibold text-[#101820] disabled:opacity-40"
        >
          {busy ? "Saving..." : minutes === null ? "Estimate unavailable" : minutes === saved ? "Saved" : "Save estimate"}
        </button>
        {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
        {minutes === null && error && <button type="button" onClick={() => void refresh()}>Retry estimate</button>}
      </div>
    </section>
  );
}
