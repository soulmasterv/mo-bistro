"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { UserPlus } from "lucide-react";

type Role = "manager" | "reception" | "waiter";

type Employee = {
  id: number;
  username: string;
  role: Role;
  active: number;
  has_pin: boolean;
};

export default function StaffAccountManager() {
  const [username, setUsername] = useState("");
  const [credential, setCredential] = useState("");
  const [role, setRole] = useState<Role>("waiter");
  const [busy, setBusy] = useState(false);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [staffError, setStaffError] = useState("");
  const [staffMessage, setStaffMessage] = useState("");
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  const loadEmployees = useCallback(async () => {
    try {
      const response = await fetch("/api/management/staff-pin/users", {
        credentials: "same-origin",
        cache: "no-store",
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.error || "Unable to load employees.");
      }
      setEmployees(Array.isArray(result.users) ? result.users : []);
      setStaffError("");
    } catch (error) {
      setStaffError(error instanceof Error ? error.message : "Unable to load employees.");
    }
  }, []);

  useEffect(() => {
    void loadEmployees();
    window.addEventListener("staff-account-created", loadEmployees);
    return () => window.removeEventListener("staff-account-created", loadEmployees);
  }, [loadEmployees]);

  async function updateStatus(employee: Employee) {
    if (updatingId !== null) return;

    const next = employee.active === 1 ? 0 : 1;
    const action = next === 1 ? "reactivate" : "disable";

    if (!window.confirm(`${action === "disable" ? "Disable" : "Reactivate"} ${employee.username}?`)) {
      return;
    }

    setUpdatingId(employee.id);
    setStaffError("");
    setStaffMessage("");

    try {
      const response = await fetch("/api/management/staff", {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ staff_id: employee.id, active: next }),
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Unable to update employee.");

      setStaffMessage(`${employee.username} ${next === 1 ? "reactivated" : "disabled"}.`);
      await loadEmployees();
    } catch (error) {
      setStaffError(error instanceof Error ? error.message : "Unable to update employee.");
    } finally {
      setUpdatingId(null);
    }
  }
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
      <p className="mt-2 text-sm text-slate-400">Create Manager, Reception and Waiter accounts. Only Managers can manage staff.</p>
      <form onSubmit={submit} className="mt-6 grid gap-4">
        <label className="text-sm">Username<input required minLength={3} maxLength={32} pattern="[A-Za-z0-9_.-]+" autoComplete="off" value={username} onChange={e => setUsername(e.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-[#0D1218] p-4" placeholder="e.g. waiter1" /></label>
        <label className="text-sm">Role<select value={role} onChange={e => setRole(e.target.value as Role)} className="mt-2 w-full rounded-xl border border-white/10 bg-[#0D1218] p-4"><option value="waiter">Waiter</option><option value="manager">Manager</option><option value="reception">Reception</option></select></label>
        <label className="text-sm">Password<input required type="password" minLength={4} maxLength={256} autoComplete="new-password" value={credential} onChange={e => setCredential(e.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-[#0D1218] p-4" placeholder="Employee password" /></label>
        {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
        {message && <p role="status" className="text-sm text-emerald-300">{message}</p>}
        <button type="submit" disabled={busy} className="rounded-xl bg-[#C5A77B] p-4 font-semibold text-[#101820] disabled:opacity-50">{busy ? "Creating..." : "Create employee"}</button>
      </form>

      <div className="mt-8 border-t border-white/10 pt-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-lg font-semibold">Existing employees</h3>
          <button
            type="button"
            onClick={() => void loadEmployees()}
            className="rounded-lg border border-white/20 px-3 py-2 text-sm"
          >
            Refresh
          </button>
        </div>

        {staffError && <p role="alert" className="mt-3 text-sm text-red-300">{staffError}</p>}
        {staffMessage && <p role="status" className="mt-3 text-sm text-emerald-300">{staffMessage}</p>}

        <div className="mt-4 space-y-3">
          {employees.map(employee => (
            <div
              key={employee.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-[#0D1218] p-4"
            >
              <div>
                <p className="font-medium">{employee.username}</p>
                <p className="text-xs capitalize text-slate-400">
                  {employee.role} · {employee.active === 1 ? "Active" : "Disabled"} · {employee.has_pin ? "PIN assigned" : "No PIN"}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <a
                  href="/management/staff-pins"
                  className="rounded-lg border border-white/20 px-3 py-2 text-xs font-medium"
                >
                  {employee.has_pin ? "Reset PIN" : "Set PIN"}
                </a>
                <button
                  type="button"
                  disabled={updatingId !== null}
                  onClick={() => void updateStatus(employee)}
                  className="rounded-lg border border-white/20 px-3 py-2 text-xs font-medium disabled:opacity-50"
                >
                  {updatingId === employee.id
                    ? "Updating..."
                    : employee.active === 1 ? "Disable" : "Reactivate"}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
