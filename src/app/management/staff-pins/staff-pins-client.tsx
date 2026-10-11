"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type StaffUser = {
  id: number;
  username: string;
  role: string;
  active: number;
  has_pin: boolean;
};

export default function StaffPinsPage() {
  const [users, setUsers] = useState<StaffUser[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadUsers = useCallback(async () => {
    const response = await fetch("/api/management/staff-pin/users", {
      credentials: "same-origin",
      cache: "no-store",
    });

    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(result.error || "Unable to load staff.");
    }

    setUsers(Array.isArray(result.users) ? result.users : []);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        await loadUsers();
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Unable to load staff.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [loadUsers]);

  const selected = users.find(user => String(user.id) === selectedId);

  async function savePin() {
    if (saving) return;

    setError("");
    setNotice("");

    if (!selected) {
      setError("Select a staff member.");
      return;
    }

    if (!/^\d{6}$/.test(pin)) {
      setError("Enter a six-digit PIN.");
      return;
    }

    if (pin !== confirmPin) {
      setError("PINs do not match.");
      return;
    }

    if (
      !window.confirm(
        `${selected.has_pin ? "Replace" : "Set"} the PIN for ${selected.username}?`
      )
    ) {
      return;
    }

    setSaving(true);

    try {
      const response = await fetch("/api/management/staff-pin", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          staff_id: selected.id,
          pin,
        }),
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(result.error || "Unable to save PIN.");
      }

      setPin("");
      setConfirmPin("");
      setNotice(`PIN updated for ${selected.username}.`);

      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save PIN.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#F6F2E9] px-4 py-8 text-[#293126]">
      <div className="mx-auto max-w-xl">
        <Link
          href="/management"
          className="text-sm font-semibold underline"
        >
          ← Back to Manager
        </Link>

        <header className="mt-7">
          <h1 className="font-serif text-4xl">Staff PINs</h1>
          <p className="mt-2 text-sm text-[#727568]">
            Assign or reset individual staff sign-in PINs.
          </p>
        </header>

        <section className="mt-7 rounded-2xl border border-[#D8D1C3] bg-[#FFFCF7] p-5 shadow-sm">
          {loading ? (
            <p>Loading staff...</p>
          ) : (
            <>
              <label className="block text-sm font-semibold">
                Staff member
                <select
                  value={selectedId}
                  onChange={event => {
                    setSelectedId(event.target.value);
                    setPin("");
                    setConfirmPin("");
                    setError("");
                    setNotice("");
                  }}
                  className="mt-2 min-h-12 w-full rounded-xl border border-[#C9C8BD] bg-white px-3"
                >
                  <option value="">Choose staff...</option>
                  {users.map(user => (
                    <option
                      key={user.id}
                      value={user.id}
                      disabled={!user.active}
                    >
                      {user.username} — {user.role}
                      {user.has_pin ? " (PIN set)" : " (No PIN)"}
                      {!user.active ? " (Inactive)" : ""}
                    </option>
                  ))}
                </select>
              </label>

              {selected && (
                <>
                  <div className="mt-5 rounded-xl bg-[#F1EBDF] p-4 text-sm">
                    <p className="font-semibold">{selected.username}</p>
                    <p className="mt-1 capitalize">{selected.role}</p>
                    <p className="mt-1 text-[#727568]">
                      {selected.has_pin
                        ? "PIN configured — saving will replace it."
                        : "No PIN configured yet."}
                    </p>
                  </div>

                  <label className="mt-5 block text-sm font-semibold">
                    New six-digit PIN
                    <input
                      type="password"
                      inputMode="numeric"
                      autoComplete="new-password"
                      pattern="[0-9]{6}"
                      maxLength={6}
                      value={pin}
                      onChange={event =>
                        setPin(event.target.value.replace(/\D/g, "").slice(0, 6))
                      }
                      className="mt-2 min-h-12 w-full rounded-xl border border-[#C9C8BD] bg-white px-4 text-lg tracking-widest"
                    />
                  </label>

                  <label className="mt-4 block text-sm font-semibold">
                    Confirm PIN
                    <input
                      type="password"
                      inputMode="numeric"
                      autoComplete="new-password"
                      pattern="[0-9]{6}"
                      maxLength={6}
                      value={confirmPin}
                      onChange={event =>
                        setConfirmPin(event.target.value.replace(/\D/g, "").slice(0, 6))
                      }
                      className="mt-2 min-h-12 w-full rounded-xl border border-[#C9C8BD] bg-white px-4 text-lg tracking-widest"
                    />
                  </label>

                  <button
                    type="button"
                    onClick={() => void savePin()}
                    disabled={saving || pin.length !== 6 || confirmPin.length !== 6}
                    className="mt-6 min-h-12 w-full rounded-xl bg-[#293126] font-semibold text-white disabled:opacity-40"
                  >
                    {saving ? "Saving..." : selected.has_pin ? "Replace PIN" : "Set PIN"}
                  </button>
                </>
              )}
            </>
          )}

          {error && (
            <p role="alert" className="mt-4 text-sm text-red-700">
              {error}
            </p>
          )}

          {notice && (
            <p role="status" className="mt-4 text-sm text-green-800">
              {notice}
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
