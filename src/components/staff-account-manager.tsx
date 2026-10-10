"use client";

import { useState, type FormEvent } from "react";
import { UserPlus } from "lucide-react";

type Role = "reception" | "waiter";

export default function StaffAccountManager() {
  const [username, setUsername] = useState("");
  const [credential, setCredential] = useState("");
  const [role, setRole] = useState<Role>("waiter");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/management/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ username: username.trim(), credential, role }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not create account.");
      setMessage(`Created ${result.username} (${result.role}).`);
      setUsername("");
      setCredential("");
      window.dispatchEvent(new Event("staff-account-created"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Account creation failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-6 rounded-2xl border border-white/10 bg-[#17202A] p-6 text-white">
      <div className="flex items-center gap-3"><UserPlus className="text-[#C5A77B]" /><h2 className="text-xl font-semibold">Add employee</h2></div>
      <p className="mt-2 text-sm text-slate-400">Create Reception and Waiter accounts. Manager accounts cannot be created here.</p>
      <form onSubmit={submit} className="mt-6 grid gap-4">
        <label className="text-sm">Username<input required minLength={3} maxLength={32} pattern="[A-Za-z0-9_.-]+" autoComplete="off" value={username} onChange={e => setUsername(e.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-[#0D1218] p-4" placeholder="e.g. waiter1" /></label>
        <label className="text-sm">Role<select value={role} onChange={e => setRole(e.target.value as Role)} className="mt-2 w-full rounded-xl border border-white/10 bg-[#0D1218] p-4"><option value="waiter">Waiter</option><option value="reception">Reception</option></select></label>
        <label className="text-sm">Password<input required type="password" minLength={4} maxLength={256} autoComplete="new-password" value={credential} onChange={e => setCredential(e.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-[#0D1218] p-4" placeholder="Employee password" /></label>
        {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
        {message && <p role="status" className="text-sm text-emerald-300">{message}</p>}
        <button type="submit" disabled={busy} className="rounded-xl bg-[#C5A77B] p-4 font-semibold text-[#101820] disabled:opacity-50">{busy ? "Creating..." : "Create employee"}</button>
      </form>
    </section>
  );
}
