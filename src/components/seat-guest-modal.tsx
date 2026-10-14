"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useStaffDialog } from "@/lib/use-staff-dialog";
import { X, Armchair } from "lucide-react";

type Table = {
  id: number;
  name: string;
  seats: number;
  area: string;
};

type Guest = {
  id: number;
  name: string;
  party_size: number;
  seating_preference: string;
};

export default function SeatGuestModal({
  guest,
  onClose,
  onSuccess,
}: {
  guest: Guest;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [mode, setMode] = useState<"simple" | "detailed">("detailed");
  const [areas, setAreas] = useState<
    Array<{
      area: "indoor" | "outdoor";
      free_tables: number;
      max_party_size: number;
    }>
  >([]);
  const [selectedArea, setSelectedArea] = useState<"indoor" | "outdoor" | null>(
    null,
  );
  const [tables, setTables] = useState<Table[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const dialog = useRef<HTMLDivElement>(null);
  useStaffDialog(true, dialog, onClose);

  const load = useCallback(async (signal?: AbortSignal) => {
    await fetch(`/api/seating?guest_id=${guest.id}`, { cache: "no-store", signal })
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || "Unable to load tables");
        return data;
      })
      .then((data) => {
        if (signal?.aborted) return;
        setMode(data.mode === "simple" ? "simple" : "detailed");
        setTables(data.tables ?? []);
        setAreas(data.areas ?? []);
      })
      .finally(() => { if (!signal?.aborted) setLoading(false); });
  }, [guest.id]);
  useEffect(() => {
    let controller: AbortController | null = null;
    const refresh = () => {
      controller?.abort();
      const current = new AbortController(); controller = current;
      void load(current.signal).catch((e) => { if (!current.signal.aborted) setError(e.message); });
    };
    const initial = window.setTimeout(refresh, 0);
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") refresh(); }, 5000);
    window.addEventListener("mo-bistro-tables-changed", refresh);
    return () => { controller?.abort(); window.clearTimeout(initial); window.clearInterval(timer); window.removeEventListener("mo-bistro-tables-changed", refresh); };
  }, [load]);
  const validSelection = mode === "simple"
    ? areas.some((area) => area.area === selectedArea && area.free_tables > 0 && area.max_party_size >= guest.party_size)
    : tables.some((table) => table.id === selected);

  async function confirm() {
    if (busy || loading || !validSelection)
      return;
    setBusy(true);
    setError("");

    try {
      const response = await fetch("/api/seating", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          guest_id: guest.id,
          ...(mode === "simple"
            ? { area: selectedArea }
            : { table_id: selected }),
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to seat guest");

      window.dispatchEvent(new Event("mo-bistro-tables-changed"));
      onSuccess();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Assignment failed");
      await load().catch(() => {});
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bistro-dialog-scope fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4">
      <div
        ref={dialog}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Assign table"
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/10 bg-[#17202A] p-6 text-white shadow-2xl"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Assign table</h2>
          <button onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>

        <p className="mt-3 text-sm text-slate-300">
          {guest.name} · {guest.party_size} guests ·{" "}
          {guest.seating_preference || "any"} preference
        </p>

        {loading && (
          <p role="status" className="mt-5 text-sm text-slate-400">
            Finding the right table…
          </p>
        )}
        {mode === "simple" && (
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {areas.map((area) => (
              <button
                type="button"
                key={area.area}
                onClick={() => setSelectedArea(area.area)}
                aria-pressed={selectedArea === area.area}
                className={`min-h-20 rounded-xl border p-4 text-left ${selectedArea === area.area ? "border-[#C5A77B] bg-[#C5A77B]/10" : "border-white/15"}`}
              >
                <span className="block font-semibold capitalize">
                  {area.area}
                </span>
                <span className="mt-1 block text-sm text-slate-300">
                  {area.free_tables} available · up to {area.max_party_size}{" "}
                  guests
                </span>
              </button>
            ))}
          </div>
        )}
        <div className="mt-5 space-y-2">
          {tables.map((table) => {
            const preferred =
              guest.seating_preference === "any" ||
              guest.seating_preference === table.area;

            return (
              <button
                key={table.id}
                type="button"
                onClick={() => setSelected(table.id)}
                className={`flex w-full items-center justify-between rounded-xl border p-4 text-left ${
                  selected === table.id
                    ? "border-[#C5A77B] bg-[#C5A77B]/10"
                    : "border-white/10 bg-[#0D1218]"
                }`}
              >
                <div className="flex items-center gap-3">
                  <Armchair size={20} className="text-[#C5A77B]" />
                  <div>
                    <p className="font-semibold">{table.name}</p>
                    <p className="text-xs text-slate-400">
                      {table.seats} seats · {table.area}
                    </p>
                  </div>
                </div>
                <span className="text-xs text-[#C5A77B]">
                  {preferred ? "Preferred" : "Other area"}
                </span>
              </button>
            );
          })}
        </div>

        {(mode === "simple" ? areas.length === 0 : tables.length === 0) &&
          !error &&
          !loading && (
            <p className="mt-5 text-sm text-slate-400">
              {mode === "simple" ? "No suitable free tables in Simple Mode. Check the area's configured capacity in Management, or wait for a table to be released." : "No suitable free tables currently available."}
            </p>
          )}

        {error && (
          <p role="alert" className="mt-4 text-sm text-red-300">
            {error}
          </p>
        )}

        <button
          onClick={() => void confirm()}
          disabled={
            busy ||
            loading || !validSelection
          }
          className="mt-6 w-full rounded-xl bg-[#C5A77B] px-5 py-3 font-semibold text-[#101820] disabled:opacity-40"
        >
          {busy
            ? "Seating…"
            : mode === "simple"
              ? "Seat guest in area"
              : "Assign table & seat guest"}
        </button>
      </div>
    </div>
  );
}
