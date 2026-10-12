"use client";
import { useEffect, useState } from "react";
type Capacity = {
  area: "indoor" | "outdoor";
  total_tables: number;
  occupied_tables: number;
  max_party_size: number;
};
export default function SimpleCapacitySettings() {
  const [areas, setAreas] = useState<Capacity[]>([]),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    fetch("/api/simple-tables", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok)
          throw new Error(data.error || "Unable to load area capacity.");
        return data;
      })
      .then((data) => {
        if (active) {
          setAreas(data.areas);
          if (data.warning) setError(data.warning);
        }
      })
      .catch((err) => {
        if (active) setError(err.message);
      });
    return () => {
      active = false;
    };
  }, []);
  async function save(area: Capacity) {
    if (busy) return;
    setBusy(area.area);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/simple-tables", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          area: area.area,
          total_tables: area.total_tables,
          max_party_size: area.max_party_size,
        }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Unable to save area capacity.");
      setMessage(
        `${area.area === "indoor" ? "Indoor" : "Outdoor"} capacity saved.`,
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to save area capacity.",
      );
    } finally {
      setBusy(null);
    }
  }
  function update(area: string, changes: Partial<Capacity>) {
    setAreas((current) =>
      current.map((item) =>
        item.area === area ? { ...item, ...changes } : item,
      ),
    );
  }
  return (
    <section className="mt-6 rounded-xl border border-white/10 p-4">
      <h3 className="font-semibold">Simple Mode capacity</h3>
      <p className="mt-2 text-sm text-slate-400">
        Anonymous table counts are independent of named tables. Clear occupied
        inventory and review requests before changing modes.
      </p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {areas.map((area) => (
          <form
            key={area.area}
            onSubmit={(event) => {
              event.preventDefault();
              void save(area);
            }}
            className="rounded-xl bg-[#0D1218] p-4"
          >
            <h4 className="font-semibold capitalize">{area.area}</h4>
            <p className="mt-1 text-sm text-slate-400">
              {area.occupied_tables} occupied
            </p>
            <label className="mt-3 block text-sm">
              Total anonymous tables
              <input
                type="number"
                required
                min={area.occupied_tables}
                max={500}
                value={area.total_tables}
                disabled={busy !== null}
                onChange={(event) =>
                  update(area.area, {
                    total_tables: Number(event.target.value),
                  })
                }
                className="mt-2 min-h-11 w-full rounded-lg border border-white/15 p-3"
              />
            </label>
            <label className="mt-3 block text-sm">
              Guests per table
              <input
                type="number"
                required
                min={1}
                max={30}
                value={area.max_party_size}
                disabled={busy !== null}
                onChange={(event) =>
                  update(area.area, {
                    max_party_size: Number(event.target.value),
                  })
                }
                className="mt-2 min-h-11 w-full rounded-lg border border-white/15 p-3"
              />
            </label>
            <button
              disabled={busy !== null}
              className="mt-4 min-h-11 rounded-lg bg-[#C5A77B] px-4 font-semibold text-[#101820] disabled:opacity-40"
            >
              {busy === area.area ? "Saving…" : "Save capacity"}
            </button>
          </form>
        ))}
      </div>
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-300">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="mt-3 text-sm text-emerald-300">
          {message}
        </p>
      )}
    </section>
  );
}
