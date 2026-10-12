"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Eye,
  EyeOff,
  LockKeyhole,
  ShieldCheck,
  UtensilsCrossed,
} from "lucide-react";

type StaffRole = "manager" | "reception" | "waiter";

const destinations: Record<StaffRole, string> = {
  manager: "/manager",
  reception: "/",
  waiter: "/waiter",
};

export default function LoginPage() {
  const router = useRouter();

  const [username, setUsername] = useState("");
  const [credential, setCredential] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (loading) return;

    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ username, credential }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Unable to sign in.");
      }

      const role = result.role as StaffRole;

      if (!Object.prototype.hasOwnProperty.call(destinations, role)) {
        throw new Error("Your account has an unsupported role.");
      }

      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      router.replace(destinations[role]);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#EDECE5] px-4 py-10">
      <form
        onSubmit={submit}
        className="w-full max-w-md rounded-3xl bg-[#2D352A] p-7 text-[#F5F0E7] shadow-2xl sm:p-10"
      >
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#46513F]">
            <UtensilsCrossed size={27} className="text-[#D6B681]" />
          </div>

          <p className="text-xs font-semibold tracking-[0.35em] text-[#D6B681]">
            MO BISTRO
          </p>

          <h1 className="mt-5 text-3xl font-semibold">
            Staff sign in.
          </h1>

          <p className="mt-3 text-sm text-[#D0D3C9]">
            Welcome back. Enter your staff credentials.
          </p>
        </div>

        <label className="block text-sm font-medium">
          Username
          <input
            required
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username"
            placeholder="Your username"
            className="mt-2 min-h-12 w-full rounded-xl border border-transparent bg-[#F5F1E9] px-4 text-[#293126] outline-none placeholder:text-[#81877D] focus:border-[#D6B681]"
          />
        </label>

        <label className="mt-5 block text-sm font-medium">
          Password
          <div className="relative mt-2">
            <input
              required
              type={showPassword ? "text" : "password"}
              value={credential}
              onChange={(event) => setCredential(event.target.value)}
              autoComplete="current-password"
              placeholder="Enter your password"
              className="min-h-12 w-full rounded-xl border border-transparent bg-[#F5F1E9] px-4 pr-14 text-[#293126] outline-none placeholder:text-[#81877D] focus:border-[#D6B681]"
            />

            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-[#697366]"
            >
              {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>
          </div>
        </label>

        {error && (
          <p
            role="alert"
            className="mt-5 rounded-xl bg-red-950/40 p-3 text-sm text-red-200"
          >
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="mt-7 flex min-h-13 w-full items-center justify-center gap-2 rounded-xl bg-[#D6B681] px-5 py-4 font-semibold text-[#293126] transition hover:bg-[#E6C99A] disabled:opacity-60"
        >
          {loading ? "Signing in..." : "Sign in"}
          {!loading && <ArrowRight size={19} />}
        </button>

        <div className="mt-7 flex items-center justify-center gap-2 text-xs text-[#D0D3C9]">
          <ShieldCheck size={15} />
          Authorized staff only
          <LockKeyhole size={13} />
        </div>
      </form>
    </main>
  );
}
