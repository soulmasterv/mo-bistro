"use client";
import { useEffect, useRef, useState } from "react";
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
    [busy, setBusy] = useState<Capacity["area"][]>([]);
  const saving = useRef(new Set<Capacity["area"]>());
  const queued = useRef(new Map<Capacity["area"], Capacity>());
  const saved = useRef(new Map<Capacity["area"], string>());
  const capacityKey = (area: Capacity) => JSON.stringify([area.total_tables, area.max_party_size]);
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
          for (const area of data.areas as Capacity[]) saved.current.set(area.area, capacityKey(area));
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
    if (saving.current.has(area.area)) {
      queued.current.set(area.area, area);
      return;
    }
    if (saved.current.get(area.area) === capacityKey(area)) return;
    saving.current.add(area.area);
    setBusy([...saving.current]);
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
      saved.current.set(area.area, capacityKey(area));
      setMessage(
        `${area.area === "indoor" ? "Indoor" : "Outdoor"} capacity saved.`,
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to save area capacity.",
      );
    } finally {
      saving.current.delete(area.area);
      setBusy([...saving.current]);
      const next = queued.current.get(area.area);
      queued.current.delete(area.area);
      if (next) void save(next);
    }
  }
  function saveForm(form: HTMLFormElement, area: Capacity) {
    if (!form.reportValidity()) return;
    const values = new FormData(form);
    void save({
      ...area,
      total_tables: Number(values.get("total_tables")),
      max_party_size: Number(values.get("max_party_size")),
    });
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
              saveForm(event.currentTarget, area);
            }}
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget)) saveForm(event.currentTarget, area);
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
                name="total_tables" defaultValue={area.total_tables}
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
                name="max_party_size" defaultValue={area.max_party_size}
                className="mt-2 min-h-11 w-full rounded-lg border border-white/15 p-3"
              />
            </label>
            {busy.includes(area.area) && <p role="status">Saving…</p>}
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
