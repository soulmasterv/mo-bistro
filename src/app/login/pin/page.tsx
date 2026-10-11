"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function StaffPinLogin() {
  const router = useRouter();

  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function addDigit(digit: string) {
    if (loading) return;
    setPin(previous => (previous + digit).slice(0, 6));
    setError("");
  }

  async function signIn() {
    if (!username.trim() || pin.length !== 6 || loading) return;

    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/auth/pin-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          username: username.trim(),
          pin,
        }),
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(result.error || "Unable to sign in.");
      }

      const destination =
        result.role === "manager"
          ? "/management"
          : result.role === "waiter"
            ? "/waiter"
            : "/reception";

      router.replace(destination);
      router.refresh();
    } catch (err) {
      setPin("");
      setError(
        err instanceof Error ? err.message : "Unable to sign in."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F6F2E9] px-4 py-8 text-[#293126]">
      <section className="w-full max-w-sm rounded-3xl border border-[#D8D1C3] bg-[#FFFCF7] p-6 shadow-xl">
        <div className="text-center">
          <h1 className="font-serif text-4xl">Mo Bistro</h1>
          <p className="mt-2 text-sm text-[#727568]">
            Staff PIN sign-in
          </p>
        </div>

        <label className="mt-8 block text-sm font-semibold">
          Staff username
          <input
            value={username}
            onChange={event => setUsername(event.target.value)}
            autoComplete="username"
            maxLength={32}
            className="mt-2 min-h-12 w-full rounded-xl border border-[#C9C8BD] bg-white px-4 text-base"
            placeholder="Enter username"
          />
        </label>

        <div className="mt-7 flex justify-center gap-3" aria-label="PIN length">
          {Array.from({ length: 6 }, (_, index) => (
            <span
              key={index}
              className={`h-3 w-3 rounded-full ${
                index < pin.length ? "bg-[#293126]" : "bg-[#D8D1C3]"
              }`}
            />
          ))}
        </div>

        <div className="mt-7 grid grid-cols-3 gap-3">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map(digit => (
            <button
              key={digit}
              type="button"
              disabled={loading}
              onClick={() => addDigit(digit)}
              className="min-h-16 rounded-xl bg-[#F1EBDF] text-2xl font-semibold active:bg-[#D6B681] disabled:opacity-50"
            >
              {digit}
            </button>
          ))}

          <button
            type="button"
            disabled={loading}
            onClick={() => setPin("")}
            className="min-h-16 rounded-xl text-sm font-semibold"
          >
            Clear
          </button>

          <button
            type="button"
            disabled={loading}
            onClick={() => addDigit("0")}
            className="min-h-16 rounded-xl bg-[#F1EBDF] text-2xl font-semibold active:bg-[#D6B681]"
          >
            0
          </button>

          <button
            type="button"
            disabled={loading}
            onClick={() => setPin(previous => previous.slice(0, -1))}
            className="min-h-16 rounded-xl text-xl font-semibold"
            aria-label="Delete last digit"
          >
            ⌫
          </button>
        </div>

        {error && (
          <p role="alert" className="mt-5 text-center text-sm text-red-700">
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={() => void signIn()}
          disabled={loading || !username.trim() || pin.length !== 6}
          className="mt-6 min-h-12 w-full rounded-xl bg-[#293126] font-semibold text-white disabled:opacity-40"
        >
          {loading ? "Signing in..." : "Sign in"}
        </button>

        <div className="mt-5 text-center">
          <Link href="/login" className="text-sm underline">
            Use regular login instead
          </Link>
        </div>
      </section>
    </main>
  );
}
