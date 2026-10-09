"use client";

import { useState } from "react";
import Link from "next/link";
import { Search, ArrowLeft } from "lucide-react";

export default function LookupPage() {
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");

    try {
      const response = await fetch("/api/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Lookup failed.");
      }

      setMessage(result.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lookup failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F7F4EE] px-5 text-[#242424]">
      <div className="w-full max-w-md rounded-3xl bg-white p-8 shadow-xl">
        <Link href="/join" className="mb-7 inline-flex items-center gap-2 text-sm text-[#A78A60]">
          <ArrowLeft size={16} /> Back
        </Link>

        <Search size={32} className="mb-4 text-[#A78A60]" />
        <h1 className="text-2xl font-semibold">Find my booking</h1>
        <p className="mt-2 text-sm text-[#77716A]">
          Enter the name or mobile number used to register.
        </p>

        <form onSubmit={submit} noValidate className="mt-7 space-y-4">
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Name or 01xxxxxxxxx"
            className="w-full rounded-xl border border-[#DDD5C9] p-4 outline-none focus:border-[#A78A60]"
          />

          {error && <p className="text-sm text-red-600">{error}</p>}

          {message && (
            <p className="rounded-xl bg-[#F7F4EE] p-4 text-sm">
              {message}
            </p>
          )}

          <button
            disabled={busy}
            className="w-full rounded-xl bg-[#242424] p-4 font-semibold text-white"
          >
            {busy ? "Checking..." : "Find my booking"}
          </button>
        </form>
      </div>
    </main>
  );
}
