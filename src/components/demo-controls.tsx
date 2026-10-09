"use client";

import { useState } from "react";

export default function DemoControls() {
  const [message, setMessage] = useState("");

  async function generate() {
    setMessage("");

    const response = await fetch("/api/management/demo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "generate" })
    });

    const data = await response.json();
    setMessage(
      response.ok
        ? `Created ${data.created} demo guests.`
        : data.error || "Could not generate demo data"
    );
  }

  return (
    <section className="mt-7 rounded-2xl border border-white/10 bg-[#17202A] p-6">
      <h2 className="text-xl font-semibold">Demo mode</h2>
      <p className="mt-2 text-sm text-slate-400">
        Generate five sample waiting guests to test table assignment.
      </p>
      <button
        onClick={() => void generate()}
        className="mt-4 rounded-xl bg-[#C5A77B] px-5 py-3 font-semibold text-[#101820]"
      >
        Generate test guests
      </button>
      {message && <p className="mt-3 text-sm">{message}</p>}
    </section>
  );
}
