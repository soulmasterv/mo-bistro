"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LockKeyhole, ShieldCheck } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [credential, setCredential] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, credential }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Login failed.");
      }

      router.replace("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0D1218] px-5 text-white">
      <form
        onSubmit={submit}
        noValidate
        className="w-full max-w-sm rounded-3xl border border-white/10 bg-[#17202A] p-8 shadow-2xl"
      >
        <ShieldCheck className="mb-5 text-[#C5A77B]" size={38} />
        <p className="text-xs uppercase tracking-[0.3em] text-[#C5A77B]">
          Restaurant Concierge
        </p>
        <h1 className="mt-3 text-3xl font-semibold">Staff Login</h1>
        <p className="mt-2 text-sm text-slate-400">
          Managers use their password. Reception staff use their PIN.
        </p>

        <label className="mt-8 block text-sm">
          Username
          <input
            value={username}
            onChange={e => setUsername(e.target.value)}
            autoComplete="username"
            className="mt-2 w-full rounded-xl border border-white/10 bg-[#0D1218] p-3 outline-none focus:border-[#C5A77B]"
          />
        </label>

        <label className="mt-5 block text-sm">
          Password or PIN
          <input
            type="password"
            value={credential}
            onChange={e => setCredential(e.target.value)}
            autoComplete="current-password"
            className="mt-2 w-full rounded-xl border border-white/10 bg-[#0D1218] p-3 outline-none focus:border-[#C5A77B]"
          />
        </label>

        {error && (
          <p role="alert" className="mt-4 text-sm text-red-400">
            {error}
          </p>
        )}

        <button
          disabled={loading}
          className="mt-7 flex w-full items-center justify-center gap-2 rounded-xl bg-[#C5A77B] p-4 font-semibold text-[#101820] disabled:opacity-50"
        >
          <LockKeyhole size={17} />
          {loading ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </main>
  );
}
