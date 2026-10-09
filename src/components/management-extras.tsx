"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2, Users, Armchair } from "lucide-react";

type Table = {
  id: number;
  name: string;
  seats: number;
  area: "indoor" | "outdoor";
  status: "free" | "occupied";
};

type Staff = {
  id: number;
  username: string;
  role: string;
  active: number;
};

export default function ManagementExtras() {
  const [tables, setTables] = useState<Table[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [username, setUsername] = useState("");
  const [credential, setCredential] = useState("");
  const [role, setRole] = useState<"manager" | "reception">("reception");
  const [tableName, setTableName] = useState("");
  const [seats, setSeats] = useState(4);
  const [area, setArea] = useState<"indoor" | "outdoor">("indoor");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [tablesResponse, managementResponse] = await Promise.all([
      fetch("/api/management/tables", { cache: "no-store" }),
      fetch("/api/management", { cache: "no-store" }),
    ]);

    if (!tablesResponse.ok || !managementResponse.ok) {
      throw new Error("Manager access required");
    }

    setTables(await tablesResponse.json());
    const data = await managementResponse.json();
    setStaff(data.users);
  }, []);

  useEffect(() => {
    void load().catch(e => setMessage(e.message));
  }, [load]);

  async function send(
    url: string,
    method: string,
    payload: object
  ) {
    setBusy(true);
    setMessage("");

    try {
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Request failed");
      }

      await load();
      setMessage("Changes saved successfully.");
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Request failed");
      return false;
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-7 space-y-7">
      <section className="rounded-2xl border border-white/10 bg-[#17202A] p-6">
        <div className="mb-5 flex items-center gap-3">
          <Users className="text-[#C5A77B]" />
          <h2 className="text-xl font-semibold">Staff management</h2>
        </div>

        <form
          className="grid gap-3 md:grid-cols-3"
          onSubmit={async e => {
            e.preventDefault();
            const ok = await send("/api/management/staff", "POST", {
              username,
              credential,
              role,
            });
            if (ok) {
              setUsername("");
              setCredential("");
            }
          }}
        >
          <input
            required
            minLength={3}
            placeholder="Username"
            value={username}
            onChange={e => setUsername(e.target.value)}
            className="rounded-xl border border-white/10 bg-[#0D1218] p-3"
          />
          <input
            required
            type="password"
            minLength={4}
            placeholder="Password / PIN (min. 4)"
            value={credential}
            onChange={e => setCredential(e.target.value)}
            className="rounded-xl border border-white/10 bg-[#0D1218] p-3"
          />
          <select
            value={role}
            onChange={e => setRole(e.target.value as typeof role)}
            className="rounded-xl border border-white/10 bg-[#0D1218] p-3"
          >
            <option value="reception">Reception</option>
            <option value="manager">Manager</option>
          </select>
          <button
            disabled={busy}
            className="flex items-center justify-center gap-2 rounded-xl bg-[#C5A77B] p-3 font-semibold text-[#101820] disabled:opacity-50 md:col-span-3"
          >
            <Plus size={17} /> Add staff account
          </button>
        </form>

        <div className="mt-5 divide-y divide-white/10">
          {staff.map(user => (
            <div key={user.id} className="flex justify-between py-3 text-sm">
              <span>{user.username}</span>
              <span className="capitalize text-[#C5A77B]">{user.role}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-[#17202A] p-6">
        <div className="mb-5 flex items-center gap-3">
          <Armchair className="text-[#C5A77B]" />
          <h2 className="text-xl font-semibold">Restaurant tables</h2>
        </div>

        <form
          className="flex flex-wrap gap-3"
          onSubmit={async e => {
            e.preventDefault();
            const ok = await send("/api/management/tables", "POST", {
              name: tableName,
              seats,
              area,
            });
            if (ok) setTableName("");
          }}
        >
          <input
            required
            placeholder="Table name, e.g. T01"
            value={tableName}
            onChange={e => setTableName(e.target.value)}
            className="min-w-0 flex-1 rounded-xl border border-white/10 bg-[#0D1218] p-3"
          />
          <input
            type="number"
            min={1}
            max={30}
            value={seats}
            onChange={e => setSeats(Number(e.target.value))}
            className="w-24 rounded-xl border border-white/10 bg-[#0D1218] p-3"
            aria-label="Seats"
          />
          <select
            value={area}
            onChange={e => setArea(e.target.value as "indoor" | "outdoor")}
            className="rounded-xl border border-white/10 bg-[#0D1218] p-3"
            aria-label="Table area"
          >
            <option value="indoor">Indoor</option>
            <option value="outdoor">Outdoor</option>
          </select>
          <button
            disabled={busy}
            className="flex items-center gap-2 rounded-xl bg-[#C5A77B] px-4 py-3 font-semibold text-[#101820]"
          >
            <Plus size={17} /> Add table
          </button>
        </form>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {tables.map(table => (
            <div
              key={table.id}
              className="flex items-center justify-between rounded-xl border border-white/10 p-4"
            >
              <div>
                <p className="font-semibold">{table.name}</p>
                <p className="text-xs text-slate-400">
                  {table.seats} seats · {table.area} · {table.status}
                </p>
              </div>
              <button
                type="button"
                disabled={busy || table.status !== "free"}
                onClick={() => {
                  if (window.confirm(`Remove ${table.name}?`)) {
                    void send("/api/management/tables", "DELETE", {
                      id: table.id,
                    });
                  }
                }}
                className="rounded-lg p-2 text-red-300 disabled:opacity-30"
                title="Remove free table"
              >
                <Trash2 size={18} />
              </button>
            </div>
          ))}
        </div>
      </section>

      {message && (
        <p role="status" className="rounded-xl border border-white/10 p-4 text-sm">
          {message}
        </p>
      )}
    </div>
  );
}
