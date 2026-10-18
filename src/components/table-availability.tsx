"use client";
import {receptionRead,refreshReception,watchReception} from "@/lib/reception-feed";


import { useCallback, useEffect, useRef, useState } from "react";
import { Armchair, RefreshCw } from "lucide-react";

type Table = {
  id: number;
  name: string;
  seats: number;
  area: "indoor" | "outdoor";
  status: "free" | "occupied";
};

type Pool = {
  area: "indoor" | "outdoor";
  total_tables: number;
  occupied_tables: number;
  free_tables: number;
  max_party_size: number;
};
type Mode = "simple" | "detailed";

export default function TableAvailability() {
  const [tables, setTables] = useState<Table[]>([]);
  const [mode, setMode] = useState<Mode>("detailed");
  const loadController = useRef<AbortController | null>(null);
  const [pools, setPools] = useState<Pool[]>([]);
  const [busyArea, setBusyArea] = useState<string | null>(null);
  const releaseOperation = useRef<
    Partial<Record<"indoor" | "outdoor", string>>
  >({});
  const [error, setError] = useState("");

  const load = useCallback(async (force = false) => {
    if(force)await refreshReception();
    if (loadController.current && !force) return;
    loadController.current?.abort();
    const controller = new AbortController();
    loadController.current = controller;
    try {
      const modeResponse = await receptionRead("/api/table-view-mode", {
        cache: "no-store",
        signal: controller.signal,
      });
      if (!modeResponse.ok) throw new Error("Unable to load table view mode.");
      const modeData = await modeResponse.json();
      const nextMode = modeData.mode === "simple" ? "simple" : "detailed";
      const response = await receptionRead(
        nextMode === "simple" ? "/api/simple-tables" : "/api/tables",
        { cache: "no-store", signal: controller.signal },
      );
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Unable to load table availability.");
      if (data.blocked_by_named_inventory) throw new Error(data.warning);
      if (controller.signal.aborted) return;
      setMode(nextMode);
      setTables(nextMode === "detailed" ? data : []);
      setPools(nextMode === "simple" ? data.areas : []);
      setError("");
    } catch (err) {
      if (!controller.signal.aborted) throw err;
    } finally {
      if (loadController.current === controller) loadController.current = null;
    }
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => {
      void load().catch((err) => setError(String(err)));
    }, 0);

    const unsubscribe=watchReception(()=>{void load().catch(err=>setError(err instanceof Error?err.message:"Unable to refresh tables."));});
    return () => { window.clearTimeout(initial);loadController.current?.abort();loadController.current=null;unsubscribe(); };
  }, [load]);

  const [releaseId, setReleaseId] = useState<number | null>(null);
  const [notice, setNotice] = useState("");
  async function release(tableId: number) {
    if (releaseId !== null) return;
    if (
      !tables.some(
        (table) => table.id === tableId && table.status === "occupied",
      )
    ) {
      setError("Choose a currently occupied table.");
      return;
    }
    setReleaseId(tableId);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/waiter/tables/" + tableId + "/free", {
        method: "POST",
        credentials: "same-origin",
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Unable to release table.");
      loadController.current?.abort();
      setTables((previous) =>
        previous.map((table) =>
          table.id === tableId ? { ...table, status: "free" } : table,
        ),
      );
      setNotice("Table is now free.");
      window.dispatchEvent(
        new CustomEvent("mo-bistro-tables-changed", {
          detail: "table-availability",
        }),
      );
      await load(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to release table.");
      void load().catch(() => {});
    } finally {
      setReleaseId(null);
    }
  }

  async function freeArea(area: "indoor" | "outdoor") {
    if (busyArea) return;
    const operationId = releaseOperation.current[area] ?? crypto.randomUUID();
    releaseOperation.current[area] = operationId;
    setBusyArea(area);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/simple-tables", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ area, operation_id: operationId }),
      });
      const data = await response.json();
      if (!response.ok) {
        if (response.status < 500) delete releaseOperation.current[area];
        throw new Error(data.error || "Unable to free area capacity.");
      }
      delete releaseOperation.current[area];
      loadController.current?.abort();
      setPools((current) =>
        current.map((pool) =>
          pool.area === area && !data.repeated
            ? {
                ...pool,
                occupied_tables: Math.max(0, pool.occupied_tables - 1),
                free_tables: Math.min(pool.total_tables, pool.free_tables + 1),
              }
            : pool,
        ),
      );
      setNotice(
        `${area === "indoor" ? "Indoor" : "Outdoor"} availability updated.`,
      );
      window.dispatchEvent(
        new CustomEvent("mo-bistro-tables-changed", {
          detail: "table-availability",
        }),
      );
      await load(true);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to free area capacity.",
      );
    } finally {
      setBusyArea(null);
    }
  }
  const free =
    mode === "simple"
      ? pools.reduce((count, pool) => count + pool.free_tables, 0)
      : tables.filter((t) => t.status === "free").length;
  const total =
    mode === "simple"
      ? pools.reduce((count, pool) => count + pool.total_tables, 0)
      : tables.length;

  const summary = (area: "indoor" | "outdoor") => {
    if (mode === "simple") {
      const pool = pools.find((item) => item.area === area);
      return {
        total: pool?.total_tables ?? 0,
        free: pool?.free_tables ?? 0,
        occupied: pool?.occupied_tables ?? 0,
      };
    }
    const areaTables = tables.filter((t) => t.area === area);

    return {
      total: areaTables.length,
      free: areaTables.filter((t) => t.status === "free").length,
      occupied: areaTables.filter((t) => t.status === "occupied").length,
    };
  };

  return (
    <section className="bistro-panel bistro-availability">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Table availability</h2>
          <p className="mt-1 text-sm text-slate-400">
            {free} free / {total} total
          </p>
        </div>

        <button
          type="button"
          onClick={() => void load().catch((err) => setError(String(err)))}
          className="rounded-xl border border-white/10 p-3"
          aria-label="Refresh tables"
        >
          <RefreshCw size={18} />
        </button>
      </div>

      <p className="mb-4 text-xs text-slate-400">
        {mode === "simple" ? "Simple view" : "Detailed view"}
        {" · "}Managed in Settings
      </p>

      {error && (
        <p role="alert" className="mb-4 text-sm text-red-300">
          {error}
        </p>
      )}

      {mode === "simple" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {(["indoor", "outdoor"] as const).map((area) => {
            const counts = summary(area);

            return (
              <div
                key={area}
                className="rounded-xl border border-white/10 bg-[#0D1218] p-3"
              >
                <div className="flex items-center gap-3">
                  <Armchair size={22} className="text-[#C5A77B]" />
                  <h3 className="text-lg font-semibold capitalize">{area}</h3>
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
                <button
                  type="button"
                  disabled={counts.occupied === 0 || busyArea !== null}
                  onClick={() => void freeArea(area)}
                  className="mt-4 min-h-12 w-full rounded-xl bg-[#C5A77B] px-4 font-semibold text-[#101820] disabled:opacity-40"
                >
                  {busyArea === area ? "Updating…" : "Table free"}
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="grid gap-3 grid-cols-2">
          {tables.map((table) => (
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

              {table.status === "occupied" && (
                <button
                  type="button"
                  disabled={releaseId !== null}
                  onClick={() => void release(table.id)}
                  aria-label={"Clear " + table.name}
                  className="mt-3 min-h-11 w-full rounded-lg bg-[#C5A77B] px-3 text-sm font-semibold text-[#101820] disabled:opacity-40"
                >
                  {releaseId === table.id ? "Clearing…" : "Clear Table"}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {notice && (
        <p role="status" className="mt-3 text-sm text-emerald-300">
          {notice}
        </p>
      )}
      {total === 0 && (
        <p className="mt-4 text-sm text-slate-400">
          No tables yet. A manager can add tables in Settings.
        </p>
      )}
    </section>
  );
}
