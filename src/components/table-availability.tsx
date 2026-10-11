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

type Mode = "simple" | "detailed";

export default function TableAvailability() {
  const [tables, setTables] = useState<Table[]>([]);
  const [mode, setMode] = useState<Mode>("detailed");
  const [canManage, setCanManage] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [tableResponse, modeResponse] = await Promise.all([
      fetch("/api/tables", { cache: "no-store" }),
      fetch("/api/table-view-mode", { cache: "no-store" }),
    ]);

    if (!tableResponse.ok || !modeResponse.ok) {
      throw new Error("Unable to load table availability.");
    }

    const [tableData, modeData] = await Promise.all([
      tableResponse.json(),
      modeResponse.json(),
    ]);

    setTables(tableData);
    setMode(modeData.mode === "simple" ? "simple" : "detailed");
    setCanManage(modeData.can_manage === true);
    setError("");
  }, []);

  useEffect(() => {
    void load().catch(err => setError(String(err)));

    const timer = window.setInterval(() => {
      void load().catch(() => {});
    }, 5000);

    const onTablesChanged = () => { void load().catch(() => {}); };
    window.addEventListener("mo-bistro-tables-changed", onTablesChanged);
    return () => { window.clearInterval(timer); window.removeEventListener("mo-bistro-tables-changed", onTablesChanged); };
  }, [load]);

  async function changeMode(next: Mode) {
    if (!canManage || busy || next === mode) return;

    setBusy(true);
    setError("");

    try {
      const response = await fetch("/api/table-view-mode", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: next }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Unable to save mode.");
      }

      setMode(next);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to save mode."
      );
    } finally {
      setBusy(false);
    }
  }

  const [releaseId, setReleaseId] = useState<number | null>(null);
  const [selected, setSelected] = useState<Record<string, number>>({});
  const [notice, setNotice] = useState("");
  async function release(tableId: number) {
    if (releaseId !== null) return;
    setReleaseId(tableId);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/waiter/tables/" + tableId + "/free", { method: "POST", credentials: "same-origin" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to release table.");
      setTables(previous => previous.map(table => table.id === tableId ? { ...table, status: "free" } : table));
      setSelected({});
      setNotice("Table is now free.");
      window.dispatchEvent(new Event("mo-bistro-tables-changed"));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to release table.");
      void load().catch(() => {});
    } finally { setReleaseId(null); }
  }

  const free = tables.filter(t => t.status === "free").length;

  const summary = (area: "indoor" | "outdoor") => {
    const areaTables = tables.filter(t => t.area === area);

    return {
      total: areaTables.length,
      free: areaTables.filter(t => t.status === "free").length,
      occupied: areaTables.filter(t => t.status === "occupied").length,
    };
  };

  return (
    <section className="mb-5 rounded-xl border border-white/10 bg-[#17202A] p-3 sm:p-4">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Table availability</h2>
          <p className="mt-1 text-sm text-slate-400">
            {free} free / {tables.length} total
          </p>
        </div>

        <button
          type="button"
          onClick={() => void load().catch(err => setError(String(err)))}
          className="rounded-xl border border-white/10 p-3"
          aria-label="Refresh tables"
        >
          <RefreshCw size={18} />
        </button>
      </div>

      {canManage ? (
        <div className="mb-5 flex flex-wrap gap-2">
          {(["simple", "detailed"] as const).map(next => (
            <button
              key={next}
              type="button"
              disabled={busy}
              onClick={() => void changeMode(next)}
              aria-pressed={mode === next}
              className={`rounded-xl px-4 py-2.5 text-sm font-semibold ${
                mode === next
                  ? "bg-[#C5A77B] text-[#17202A]"
                  : "border border-white/20 text-white"
              } disabled:opacity-50`}
            >
              {next === "simple" ? "Simple" : "Detailed"}
            </button>
          ))}
        </div>
      ) : (
        <p className="mb-5 text-xs text-slate-400">
          {mode === "simple" ? "Simple view" : "Detailed view"}
          {" · "}Controlled by management
        </p>
      )}

      {error && (
        <p role="alert" className="mb-4 text-sm text-red-300">
          {error}
        </p>
      )}

      {mode === "simple" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {(["indoor", "outdoor"] as const).map(area => {
            const counts = summary(area);

            return (
              <div
                key={area}
                className="rounded-xl border border-white/10 bg-[#0D1218] p-3"
              >
                <div className="flex items-center gap-3">
                  <Armchair size={22} className="text-[#C5A77B]" />
                  <h3 className="text-lg font-semibold capitalize">
                    {area}
                  </h3>
                </div>

                <p className="mt-5 text-3xl font-semibold text-emerald-300">
                  {counts.free}
                  <span className="ml-2 text-sm font-normal text-slate-400">
                    available
                  </span>
                </p>

                <div className="mt-4 flex justify-between text-sm text-slate-400">
                  <span>{counts.occupied} occupied</span>
                  <span>{counts.total} total</span>
                </div>
                {counts.occupied > 0 && <div className="mt-3 flex gap-2">
                  <select aria-label={"Occupied " + area + " table"} value={selected[area] || ""} onChange={event => setSelected(previous => ({ ...previous, [area]: Number(event.target.value) }))} className="min-h-11 min-w-0 flex-1 rounded-lg bg-[#17202A] px-2 text-sm">
                    <option value="">Choose occupied table</option>
                    {tables.filter(table => table.area === area && table.status === "occupied").map(table => <option key={table.id} value={table.id}>{table.name}</option>)}
                  </select>
                  <button type="button" disabled={!selected[area] || releaseId !== null} onClick={() => void release(selected[area])} className="min-h-11 rounded-lg bg-[#C5A77B] px-3 text-sm font-semibold text-[#101820] disabled:opacity-40">Free</button>
                </div>}

              </div>
            );
          })}
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

              <p className="text-xs text-slate-400">
                {table.seats} seats · {table.area}
              </p>

              {table.status === "occupied" && <button type="button" disabled={releaseId !== null} onClick={() => void release(table.id)} aria-label={"Mark " + table.name + " free"} className="mt-3 min-h-11 w-full rounded-lg bg-[#C5A77B] px-3 text-sm font-semibold text-[#101820] disabled:opacity-40">{releaseId === table.id ? "Releasing…" : "Mark free"}</button>}

            </div>
          ))}
        </div>
      )}

      {notice && <p role="status" className="mt-3 text-sm text-emerald-300">{notice}</p>}
      {tables.length === 0 && (
        <p className="mt-4 text-sm text-slate-400">
          No tables yet. A manager can add tables in Settings.
        </p>
      )}
    </section>
  );
}
