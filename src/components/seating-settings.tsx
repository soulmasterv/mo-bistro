"use client";

import SimpleCapacitySettings from "@/components/simple-capacity-settings";
import { useEffect, useRef, useState } from "react";

export default function SeatingSettings() {
  const [override, setOverride] = useState<boolean | null>(null);
  const [savingOverride, setSavingOverride] = useState(false);
  const overridePending = useRef(false);
  const [message, setMessage] = useState("");
  const [tableMode, setTableMode] = useState<"simple" | "detailed">("detailed");
  const [modeBusy, setModeBusy] = useState(false);

  useEffect(() => {
    fetch("/api/management/seating-settings")
      .then(r => r.json())
      .then(d => {
        if (typeof d.allow_area_override === "boolean")
          setOverride(d.allow_area_override);
      })
      .catch(() => setMessage("Could not load settings"));
  }, []);

  useEffect(() => {
    fetch("/api/table-view-mode", { cache: "no-store" })
      .then(async response => {
        if (!response.ok) throw new Error("Could not load table mode");
        return response.json();
      })
      .then(data => {
        setTableMode(data.mode === "simple" ? "simple" : "detailed");
      })
      .catch(() => setMessage("Could not load table mode."));
  }, []);

  async function saveTableMode(mode: "simple" | "detailed") {
    if (modeBusy || mode === tableMode) return;

    setModeBusy(true);
    setMessage("");

    try {
      const response = await fetch("/api/table-view-mode", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Could not save table mode.");
      }

      setTableMode(mode);
      setMessage("Table view updated for Reception and Waiter.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save table mode.");
    } finally {
      setModeBusy(false);
    }
  }

  async function saveOverride(value: boolean) {
    if (override === null || overridePending.current) return;
    overridePending.current = true;
    setSavingOverride(true);
    setOverride(value);
    setMessage("Saving…");

    try {
      const response = await fetch("/api/management/seating-settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        allow_area_override: value
      })
    });

      if (!response.ok) throw new Error("Could not save seating settings.");
      setMessage("Seating settings saved.");
    } catch {
      setOverride(override);
      setMessage("Could not save seating settings. Try again.");
    } finally {
      overridePending.current = false;
      setSavingOverride(false);
    }
  }

  return (
    <section className="mt-7 rounded-2xl border border-white/10 bg-[#17202A] p-6">
      <h2 className="text-xl font-semibold">Seating preferences</h2>

      <div className="mt-6 rounded-xl border border-white/10 p-4">
        <h3 className="font-semibold">Staff table view</h3>
        <p className="mt-1 text-sm text-slate-400">
          Detailed Mode manages named tables. Simple Mode manages independent anonymous area capacity.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {(["simple", "detailed"] as const).map(mode => (
            <button
              key={mode}
              type="button"
              disabled={modeBusy}
              aria-pressed={tableMode === mode}
              onClick={() => void saveTableMode(mode)}
              className={`rounded-xl px-4 py-3 text-sm font-semibold disabled:opacity-50 ${
                tableMode === mode
                  ? "bg-[#C5A77B] text-[#17202A]"
                  : "border border-white/20 text-white"
              }`}
            >
              {mode === "simple" ? "Simple — Indoor / Outdoor" : "Detailed — Individual tables"}
            </button>
          ))}
        </div>
      </div>

      <SimpleCapacitySettings />
      <label className="mt-4 flex items-center gap-3 text-sm">
        <input
          type="checkbox"
          checked={override ?? false}
          disabled={override === null || savingOverride}
          onChange={e => void saveOverride(e.target.checked)}
        />
        Allow seating in a different area if preferred area is unavailable
      </label>

      {message && <p role="status" className="mt-3 text-sm">{message}</p>}
    </section>
  );
}
