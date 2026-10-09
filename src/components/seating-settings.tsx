"use client";

import { useEffect, useState } from "react";

export default function SeatingSettings() {
  const [required, setRequired] = useState(true);
  const [override, setOverride] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch("/api/management/seating-settings")
      .then(r => r.json())
      .then(d => {
        if (typeof d.require_table_assignment === "boolean")
          setRequired(d.require_table_assignment);
        if (typeof d.allow_area_override === "boolean")
          setOverride(d.allow_area_override);
      })
      .catch(() => setMessage("Could not load settings"));
  }, []);

  async function save() {
    setMessage("");

    const response = await fetch("/api/management/seating-settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        require_table_assignment: required,
        allow_area_override: override
      })
    });

    setMessage(response.ok ? "Settings saved." : "Could not save settings.");
  }

  return (
    <section className="mt-7 rounded-2xl border border-white/10 bg-[#17202A] p-6">
      <h2 className="text-xl font-semibold">Seating preferences</h2>

      <label className="mt-5 flex items-center gap-3 text-sm">
        <input
          type="checkbox"
          checked={required}
          onChange={e => setRequired(e.target.checked)}
        />
        Require table assignment before seating a guest
      </label>

      <label className="mt-4 flex items-center gap-3 text-sm">
        <input
          type="checkbox"
          checked={override}
          onChange={e => setOverride(e.target.checked)}
        />
        Allow seating in a different area if preferred area is unavailable
      </label>

      <button
        onClick={() => void save()}
        className="mt-5 rounded-xl bg-[#C5A77B] px-5 py-3 font-semibold text-[#101820]"
      >
        Save seating settings
      </button>

      {message && <p className="mt-3 text-sm">{message}</p>}
    </section>
  );
}
