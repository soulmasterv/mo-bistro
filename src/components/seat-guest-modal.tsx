"use client";

import { useEffect, useState } from "react";
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
  onSuccess
}: {
  guest: Guest;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [tables, setTables] = useState<Table[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch(`/api/seating?guest_id=${guest.id}`, { cache: "no-store" })
      .then(async r => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || "Unable to load tables");
        return data;
      })
      .then(data => setTables(data.tables))
      .catch(e => setError(e.message));
  }, [guest.id]);

  async function confirm() {
    if (selected === null || busy) return;
    setBusy(true);
    setError("");

    try {
      const response = await fetch("/api/seating", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          guest_id: guest.id,
          table_id: selected
        })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to seat guest");

      window.dispatchEvent(new Event("mo-bistro-tables-changed"));
      onSuccess();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Assignment failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4">
      <div
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

        <div className="mt-5 space-y-2">
          {tables.map(table => {
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

        {tables.length === 0 && !error && (
          <p className="mt-5 text-sm text-slate-400">
            No suitable free tables currently available.
          </p>
        )}

        {error && <p role="alert" className="mt-4 text-sm text-red-300">{error}</p>}

        <button
          onClick={() => void confirm()}
          disabled={selected === null || busy}
          className="mt-6 w-full rounded-xl bg-[#C5A77B] px-5 py-3 font-semibold text-[#101820] disabled:opacity-40"
        >
          {busy ? "Assigning..." : "Assign table & seat guest"}
        </button>
      </div>
    </div>
  );
}
