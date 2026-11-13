"use client";
import {receptionRead,watchReception} from "@/lib/reception-feed";


import { useEffect, useState } from "react";

type Availability = Record<"indoor" | "outdoor", { free: number; total: number }>;

async function readJson(url: string, signal: AbortSignal) {
  const response = await receptionRead(url, { cache: "no-store", signal });
  if (!response.ok) throw new Error("Service overview unavailable");
  return response.json();
}

async function readAvailability(signal: AbortSignal): Promise<Availability> {
  const mode = await readJson("/api/table-view-mode", signal);
  if (mode.mode !== "simple" && mode.mode !== "detailed") throw new Error("Unknown table mode");
  const data = await readJson(mode.mode === "simple" ? "/api/simple-tables" : "/api/tables", signal);
  const counts: Availability = { indoor: { free: 0, total: 0 }, outdoor: { free: 0, total: 0 } };
  if (mode.mode === "simple") {
    if (data.blocked_by_named_inventory || !Array.isArray(data.areas)) throw new Error("Simple inventory unavailable");
    for (const area of ["indoor", "outdoor"] as const) {
      const pool = data.areas.find((pool: { area: string }) => pool.area === area);
      if (!pool || !Number.isSafeInteger(pool.total_tables) || !Number.isSafeInteger(pool.free_tables) ||
          pool.free_tables < 0 || pool.total_tables < pool.free_tables) throw new Error("Invalid capacity");
      counts[area] = { free: pool.free_tables, total: pool.total_tables };
    }
  } else {
    if (!Array.isArray(data)) throw new Error("Table inventory unavailable");
    for (const table of data) {
      if ((table.area !== "indoor" && table.area !== "outdoor") ||
          (table.status !== "free" && table.status !== "occupied")) throw new Error("Invalid table inventory");
      const area = table.area as keyof Availability;
      counts[area].total++;
      if (table.status === "free") counts[area].free++;
    }
  }
  return counts;
}

export default function ReceptionServiceStrip() {
  const [minutes, setMinutes] = useState<number | null>(null);
  const [availability, setAvailability] = useState<Availability | null>(null);
  useEffect(() => {
    let controller: AbortController | null = null;
    async function refresh(force = false) {
      if (controller && !force) return;
      controller?.abort();
      const current = new AbortController();
      controller = current;
      const results = await Promise.allSettled([
        readJson("/api/wait-estimate", current.signal), readAvailability(current.signal),
      ]);
      if (!current.signal.aborted) {
        const wait = results[0], tables = results[1];
        setMinutes(wait.status === "fulfilled" && Number.isSafeInteger(wait.value.minutes) &&
          wait.value.minutes >= 0 && wait.value.minutes <= 240 ? wait.value.minutes : null);
        setAvailability(tables.status === "fulfilled" ? tables.value : null);
      }
      if (controller === current) controller = null;
    }
    const initial = window.setTimeout(() => void refresh(), 0);
    const unsubscribe=watchReception(()=>void refresh());
    return () => { controller?.abort(); window.clearTimeout(initial); unsubscribe(); };
  }, []);
  const eta = minutes === null ? "—" : minutes >= 60
    ? `${Math.floor(minutes / 60)}h${minutes % 60 ? ` ${minutes % 60}m` : ""}` : `${minutes}m`;
  return (
    <dl className="reception-service-strip" aria-label="Service overview">
      <div><dt>Current ETA</dt><dd title={minutes === null ? "Wait estimate unavailable" : "Estimated restaurant wait"}>{eta}</dd></div>
      {(["indoor", "outdoor"] as const).map(area => (
        <div key={area}><dt>{area === "indoor" ? "Indoor" : "Outdoor"}</dt>
          <dd title={availability ? undefined : "Table availability unavailable"}>
            {availability ? <>{availability[area].free} / {availability[area].total} <small>free</small></> : "—"}
          </dd>
        </div>
      ))}
    </dl>
  );
}
