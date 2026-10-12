"use client";
import StaffAccountManager from "@/components/staff-account-manager";
import StaffShiftScheduler from "@/components/staff-shift-scheduler";
import DemoControls from "@/components/demo-controls";
import SeatingSettings from "@/components/seating-settings";

import ManagementExtras from "@/components/management-extras";


import { useEffect, useState } from "react";
import Link from "next/link";
import { Settings2, ArrowLeft, Save } from "lucide-react";

type Settings = {
  qr_rotation_seconds: string;
  qr_required: boolean;
  approval_required: boolean;
  queue_capacity: number;
  restaurant_name: string;
};

export default function ManagementPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const refreshStaff = () => {
      fetch("/api/management", { cache: "no-store" })
        .then(async response => {
          if (!response.ok) throw new Error("Manager access required.");
          return response.json();
        })
        .then(data => {
          setSettings(data.settings);
        })
        .catch(err => setError(err.message));
    };
    refreshStaff();

  }, []);

  async function save() {
    if (!settings) return;

    setBusy(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/management", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });

      if (!response.ok) throw new Error("Could not save settings.");

      setMessage("Settings saved successfully.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#0D1218] px-5 py-10 text-white">
      <div className="mx-auto max-w-3xl">
        <Link href="/" className="mb-8 inline-flex items-center gap-2 text-sm text-[#C5A77B]">
          <ArrowLeft size={16} /> Back to waitlist
        </Link>

        <div className="mb-8 flex items-center gap-3">
          <Settings2 className="text-[#C5A77B]" size={30} />
          <div>
            <h1 className="text-3xl font-semibold">Management</h1>
            <p className="mt-1 text-sm text-slate-400">
              Restaurant settings and staff accounts
            </p>
          </div>
        </div>

        {error && (
          <p role="alert" className="mb-5 rounded-xl bg-red-500/10 p-4 text-red-300">
            {error}
          </p>
        )}

        {message && (
          <p className="mb-5 rounded-xl bg-emerald-500/10 p-4 text-emerald-300">
            {message}
          </p>
        )}

        {settings && (
          <section className="space-y-6 rounded-2xl border border-white/10 bg-[#17202A] p-6">
            <label className="block text-sm">
              Restaurant name
              <input
                value={settings.restaurant_name}
                onChange={e => setSettings({
                  ...settings,
                  restaurant_name: e.target.value,
                })}
                className="mt-2 w-full rounded-xl border border-white/10 bg-[#0D1218] p-3"
              />
            </label>

            <label className="block text-sm">
              QR rotation interval
              <select
                value={settings.qr_rotation_seconds}
                onChange={e => setSettings({
                  ...settings,
                  qr_rotation_seconds: e.target.value,
                })}
                className="mt-2 w-full rounded-xl border border-white/10 bg-[#0D1218] p-3"
              >
                <option value="60">Every minute</option>
                <option value="300">Every 5 minutes</option>
                <option value="900">Every 15 minutes</option>
                <option value="86400">Daily</option>
              </select>
            </label>

            <label className="flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={settings.qr_required}
                onChange={e => setSettings({
                  ...settings,
                  qr_required: e.target.checked,
                })}
              />
              Require a valid rotating QR to register
            </label>

            <label className="flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={settings.approval_required}
                onChange={e => setSettings({
                  ...settings,
                  approval_required: e.target.checked,
                })}
              />
              Require reception confirmation
            </label>

            <label className="block text-sm">
              Maximum waiting parties
              <input
                type="number"
                min={1}
                max={500}
                value={settings.queue_capacity}
                onChange={e => setSettings({
                  ...settings,
                  queue_capacity: Number(e.target.value),
                })}
                className="mt-2 w-full rounded-xl border border-white/10 bg-[#0D1218] p-3"
              />
            </label>

            <button
              onClick={() => void save()}
              disabled={busy}
              className="flex items-center gap-2 rounded-xl bg-[#C5A77B] px-5 py-3 font-semibold text-[#101820] disabled:opacity-50"
            >
              <Save size={17} /> {busy ? "Saving..." : "Save settings"}
            </button>
          </section>
        )}

        <StaffAccountManager />
        <StaffShiftScheduler />
        <ManagementExtras />
        <SeatingSettings />
        <DemoControls />
      </div>
    </main>
  );
}
