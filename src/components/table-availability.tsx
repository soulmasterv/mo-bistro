"use client";

import { useCallback, useEffect, useState } from "react";
import { Armchair, RefreshCw } from "lucide-react";

type Table = {
  id: number;
  name: string;
  seats: number;
  area: "indoor" | "outdoor";
  status: "free" | "occupied";
};

export default function TableAvailability() {
  const [tables, setTables] = useState<Table[]>([]);
  const [viewMode, setViewMode] = useState<"simple" | "detailed">("detailed");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<number | null>(null);

  const load = useCallback(async () => {
    const response = await fetch("/api/tables", { cache: "no-store" });
    if (!response.ok) throw new Error("Unable to load tables");
    setTables(await response.json());
  }, []);

  useEffect(() => {
    void load().catch(e => setError(e.message));

    const timer = setInterval(() => {
      void load().catch(() => {});
    }, 5000);

    return () => clearInterval(timer);
  }, [load]);

  async function change(table: Table) {
    setBusy(table.id);
    setError("");

    try {
      const isOccupied = table.status === "occupied";
      if (isOccupied) throw new Error("Approve the waiter request to release this table.");

      const response = await fetch(
        isOccupied
          ? `/api/waiter/tables/${table.id}/free`
          : "/api/tables",
        {
          method: isOccupied ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          ...(!isOccupied
            ? { body: JSON.stringify({ id: table.id, status: "occupied" }) }
            : {}),
        }
      );

      if (!response.ok) throw new Error("Unable to update table");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusy(null);
    }
  }

  const free = tables.filter(t => t.status === "free").length;

  return (
    <section className="mb-9 rounded-2xl border border-white/10 bg-[#17202A] p-6">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Table availability</h2>
          <p className="mt-1 text-sm text-slate-400">
            {free} free / {tables.length} total
          </p>
        </div>
        <button
          onClick={() => void load().catch(e => setError(e.message))}
          className="rounded-xl border border-white/10 p-3"
          title="Refresh tables"
        >
          <RefreshCw size={18} />
        </button>
      </div>

      {error && (
        <p role="alert" className="mb-4 text-sm text-red-300">
          {error}
        </p>
      )}

      <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Table view mode">
        {(["simple", "detailed"] as const).map(mode => (
          <button key={mode} type="button" onClick={() => setViewMode(mode)}
            aria-pressed={viewMode === mode}
            className={`min-h-11 rounded-xl px-4 text-sm font-semibold ${viewMode === mode ? "bg-[#C5A77B] text-[#17202A]" : "border border-white/20 text-white"}`}>
            {mode === "simple" ? "Simple view" : "Detailed view"}
          </button>
        ))}
      </div>

      {viewMode === "simple" ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {tables.map(table => (
            <div key={table.id} className={`rounded-xl border p-4 text-center ${table.status === "free" ? "border-emerald-700 bg-emerald-950/40" : "border-amber-700 bg-amber-950/40"}`}>
              <p className="font-semibold">{table.name}</p>
              <p className="mt-2 text-xs text-slate-300">{table.status === "free" ? "Available" : "Occupied"}</p>
            </div>
          ))}
        </div>
      ) : (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {tables.map(table => (
          <div
            key={table.id}
            className="rounded-xl border border-white/10 bg-[#0D1218] p-4"
          >
            <div className="flex items-center justify-between">
              <Armchair className="text-[#C5A77B]" size={22} />
              <span
                className={
                  table.status === "free"
                    ? "text-xs text-emerald-300"
                    : "text-xs text-amber-300"
                }
              >
                {table.status === "free" ? "Free" : "Occupied"}
              </span>
            </div>

            <p className="mt-4 text-lg font-semibold">{table.name}</p>
            <p className="text-xs text-slate-400">{table.seats} seats · {table.area}</p>

            <button
              disabled={busy !== null || table.status === "occupied"}
              onClick={() => void change(table)}
              className="mt-4 w-full rounded-lg border border-white/10 px-3 py-2 text-xs hover:bg-white/10 disabled:opacity-40"
            >
              {busy === table.id
                ? "Updating..."
                : table.status === "free"
                  ? "Mark occupied"
                  : "Awaiting waiter request"}
            </button>
          </div>
        ))}
      </div>

      )}

      {tables.length === 0 && (
        <p className="text-sm text-slate-400">
          No tables yet. A manager can add tables in Settings.
        </p>
      )}
    </section>
  );
}
