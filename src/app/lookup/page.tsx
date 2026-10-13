"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
export default function LookupPage() {
  const [phone, setPhone] = useState("");
  const [active, setActive] = useState<boolean | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    setActive(null);
    try {
      const response = await fetch("/api/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: phone.trim() }),
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok) throw Error(data.error || "Unable to check booking.");
      setActive(data.active === true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to check booking.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F7F4EE] px-5 py-10 text-[#242424]">
      <div className="w-full max-w-md rounded-3xl bg-white p-8 shadow-xl">
        <Link href="/join" className="text-sm text-[#A78A60]">
          Back to registration
        </Link>
        <h1 className="mt-6 text-2xl font-semibold">Check my registration</h1>
        <p className="mt-3 text-sm text-[#77716A]">
          Enter your mobile number. Your private tracking link shows your
          booking details.
        </p>
        <form className="mt-6 space-y-4" onSubmit={submit}>
          <label className="block text-sm">
            Mobile number
            <input
              required
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              pattern="01[0125][0-9]{8}"
              maxLength={11}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="01xxxxxxxxx"
              className="mt-2 w-full rounded-xl border border-[#DDD5C9] p-4 text-base"
            />
          </label>
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-xl bg-[#242424] p-4 font-semibold text-white disabled:opacity-60"
          >
            {busy ? "Checking…" : "Check registration"}
          </button>
        </form>
        {error && (
          <p role="alert" className="mt-4 text-sm text-red-700">
            {error}
          </p>
        )}
        {active !== null && (
          <div role="status" className="mt-6 rounded-xl bg-[#F7F4EE] p-5">
            <p className="font-medium">
              {active
                ? "An active registration was found"
                : "No active registration found"}
            </p>
            <p className="mt-2 text-sm">
              {active
                ? "Use your private tracking link, or ask reception for help. Booking details are kept private."
                : "Check your number or ask reception for help."}
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
