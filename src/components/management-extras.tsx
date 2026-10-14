"use client";
import { useConfirmation } from "@/components/confirmation-provider";

import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2, Armchair } from "lucide-react";

type Table = {
  id: number;
  name: string;
  seats: number;
  area: "indoor" | "outdoor";
  status: "free" | "occupied";
};

export default function ManagementExtras() {
  const confirmAction = useConfirmation();
  const [tables, setTables] = useState<Table[]>([]);
  const [tableName, setTableName] = useState("");
  const [seats, setSeats] = useState(4);
  const [area, setArea] = useState<"indoor" | "outdoor">("indoor");
  const [failed, setFailed] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch("/api/management/tables", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Unable to load restaurant tables.");
    setTables(data);
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => { void load().catch(e => { setFailed(true); setMessage(e.message); }); }, 0);
    return () => window.clearTimeout(initial);
  }, [load]);

  async function send(
    url: string,
    method: string,
    payload: object
  ) {
    if (busy) return false;
    setBusy(true);
    setFailed(false);
    setMessage("");

    try {
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Request failed");
      }

      await load();
      setMessage("Changes saved successfully.");
      return true;
    } catch (error) {
      setFailed(true);
      setMessage(error instanceof Error ? error.message : "Request failed");
      return false;
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-7 space-y-7">
      <section className="rounded-2xl border border-white/10 bg-[#17202A] p-6">
        <div className="mb-5 flex items-center gap-3">
          <Armchair className="text-[#C5A77B]" />
          <h2 className="text-xl font-semibold">Restaurant tables</h2>
        </div>

        <form
          className="flex flex-wrap gap-3"
          onSubmit={async e => {
            e.preventDefault();
            const ok = await send("/api/management/tables", "POST", {
              name: tableName,
              seats,
              area,
            });
            if (ok) setTableName("");
          }}
        >
          <input
            required
            placeholder="Table name, e.g. T01"
            value={tableName}
            onChange={e => setTableName(e.target.value)}
            className="min-w-0 flex-1 rounded-xl border border-white/10 bg-[#0D1218] p-3"
          />
          <input
            type="number"
            min={1}
            max={30}
            value={seats}
            onChange={e => setSeats(Number(e.target.value))}
            className="w-24 rounded-xl border border-white/10 bg-[#0D1218] p-3"
            aria-label="Seats"
          />
          <select
            value={area}
            onChange={e => setArea(e.target.value as "indoor" | "outdoor")}
            className="rounded-xl border border-white/10 bg-[#0D1218] p-3"
            aria-label="Table area"
          >
            <option value="indoor">Indoor</option>
            <option value="outdoor">Outdoor</option>
          </select>
          <button
            disabled={busy}
            className="flex items-center gap-2 rounded-xl bg-[#C5A77B] px-4 py-3 font-semibold text-[#101820]"
          >
            <Plus size={17} /> Add table
          </button>
        </form>

        {message && (
          <p role={failed ? "alert" : "status"} className="mt-4 rounded-xl border border-white/10 p-4 text-sm">
            {message}
          </p>
        )}

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {tables.map(table => (
            <div
              key={table.id}
              className="flex items-center justify-between rounded-xl border border-white/10 p-4"
            >
              <div>
                <p className="font-semibold">{table.name}</p>
                <p className="text-xs text-slate-400">
                  {table.seats} seats · {table.area} · {table.status}
                </p>
              </div>
              <button
                type="button"
                disabled={busy || table.status !== "free"}
                onClick={async () => {
                  if (await confirmAction({ title: "Remove table?", message: `Remove ${table.name}? This removes it from the floor inventory.`, confirmLabel: "Remove table", destructive: true })) {
                    void send("/api/management/tables", "DELETE", {
                      id: table.id,
                    });
                  }
                }}
                className="rounded-lg p-2 text-red-300 disabled:opacity-30"
                title="Remove free table"
              >
                <Trash2 size={18} />
              </button>
            </div>
          ))}
        </div>
      </section>


    </div>
  );
}
