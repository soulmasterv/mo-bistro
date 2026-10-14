"use client";
import WhatsAppPreviewTest from "@/components/whatsapp-preview-test";
import ManagementDangerZone from "@/components/management-danger-zone";
import StaffAccountManager from "@/components/staff-account-manager";
import StaffShiftScheduler from "@/components/staff-shift-scheduler";
import DemoControls from "@/components/demo-controls";
import SeatingSettings from "@/components/seating-settings";

import ManagementExtras from "@/components/management-extras";

import { useEffect, useState } from "react";
import {
  Settings2,
  Save,
  Users,
  SlidersHorizontal,
  Armchair,
  ArrowUpRight,
  TriangleAlert,
} from "lucide-react";

type Settings = {
  qr_rotation_seconds: string;
  qr_required: boolean;
  approval_required: boolean;
  queue_capacity: number;
  restaurant_name: string;
};

export default function ManagementPage({showDemo=false}:{showDemo?:boolean}) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const refreshStaff = () => {
      fetch("/api/management", { cache: "no-store" })
        .then(async (response) => {
          if (!response.ok) throw new Error("Manager access required.");
          return response.json();
        })
        .then((data) => {
          setSettings(data.settings);
        })
        .catch((err) => setError(err.message));
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
    <main className="bistro-app bistro-management">
      <div className="bistro-container">
        <header className="bistro-page-heading">
          <div>
            <p className="bistro-eyebrow">RESTAURANT OPERATIONS / MANAGEMENT</p>
            <h1>Management</h1>
            <p>Restaurant settings, staff and seating.</p>
          </div>
          <span className="bistro-live">
            <i /> Manager workspace
          </span>
        </header>
        <WhatsAppPreviewTest />
        <section className="bistro-management-overview">
          <article>
            <span className="bistro-overview-icon">
              <Settings2 size={21} />
            </span>
            <div>
              <p>Restaurant</p>
              <strong>{settings?.restaurant_name || "Loading…"}</strong>
            </div>
          </article>
          <article>
            <span className="bistro-overview-icon">
              <Users size={21} />
            </span>
            <div>
              <p>Queue capacity</p>
              <strong>
                {settings?.queue_capacity ?? "—"}
                <small> parties</small>
              </strong>
            </div>
          </article>
          <article>
            <span className="bistro-overview-icon">
              <SlidersHorizontal size={21} />
            </span>
            <div>
              <p>Reception approval</p>
              <strong>
                {settings
                  ? settings.approval_required
                    ? "Required"
                    : "Optional"
                  : "—"}
              </strong>
            </div>
          </article>
        </section>
        <div className="bistro-management-grid">
          <aside className="bistro-management-nav">
            <p className="bistro-eyebrow">YOUR CONTROL ROOM</p>
            <a href="#restaurant-settings">
              <Settings2 size={18} /> Restaurant <ArrowUpRight size={14} />
            </a>
            <a href="#team-settings">
              <Users size={18} /> Team & shifts <ArrowUpRight size={14} />
            </a>
            <a href="#floor-settings">
              <Armchair size={18} /> Floor & seating <ArrowUpRight size={14} />
            </a>
            <a href="#danger-zone">
              <TriangleAlert size={18} /> Danger zone <ArrowUpRight size={14} />
            </a>
            <div className="bistro-nav-note">
              <span>Service, your way.</span>
              <p>Fine-tune the details. Keep the experience seamless.</p>
            </div>
          </aside>
          <div className="bistro-management-content">
            {error && (
              <p
                role="alert"
                className="mb-5 rounded-xl bg-red-500/10 p-4 text-red-300"
              >
                {error}
              </p>
            )}

            {message && (
              <p className="mb-5 rounded-xl bg-emerald-500/10 p-4 text-emerald-300">
                {message}
              </p>
            )}

            {settings && (
              <section
                id="restaurant-settings"
                className="bistro-settings-card space-y-6 rounded-2xl border border-white/10 bg-[#17202A] p-6"
              >
                <div className="bistro-panel-heading">
                  <div>
                    <p className="bistro-eyebrow">THE GUEST EXPERIENCE</p>
                    <h2>Restaurant settings</h2>
                    <p className="bistro-muted">
                      A few details that shape every visit.
                    </p>
                  </div>
                  <Settings2 size={22} />
                </div>
                <label className="block text-sm">
                  Restaurant name
                  <input
                    value={settings.restaurant_name}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        restaurant_name: e.target.value,
                      })
                    }
                    className="mt-2 w-full rounded-xl border border-white/10 bg-[#0D1218] p-3"
                  />
                </label>

                <label className="block text-sm">
                  QR rotation interval
                  <select
                    value={settings.qr_rotation_seconds}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        qr_rotation_seconds: e.target.value,
                      })
                    }
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
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        qr_required: e.target.checked,
                      })
                    }
                  />
                  Require a valid rotating QR to register
                </label>

                <label className="flex items-center gap-3 text-sm">
                  <input
                    type="checkbox"
                    checked={settings.approval_required}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        approval_required: e.target.checked,
                      })
                    }
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
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        queue_capacity: Number(e.target.value),
                      })
                    }
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

            <section id="team-settings" className="bistro-settings-group">
              <div className="bistro-group-heading">
                <p className="bistro-eyebrow">PEOPLE MAKE THE EXPERIENCE</p>
                <h2>Your team, in sync.</h2>
                <p className="bistro-muted">
                  Accounts, access, and a well-planned week.
                </p>
              </div>
              <StaffAccountManager />
              <StaffShiftScheduler />
            </section>
            <section id="floor-settings" className="bistro-settings-group">
              <div className="bistro-group-heading">
                <p className="bistro-eyebrow">A WELL-ORCHESTRATED FLOOR</p>
                <h2>Room for everyone.</h2>
                <p className="bistro-muted">
                  Configure your tables and how guests find their seats.
                </p>
              </div>
              <ManagementExtras />
              <SeatingSettings />
              {showDemo && <DemoControls />}
            </section>
            <ManagementDangerZone />
          </div>
        </div>
        <footer className="bistro-page-footer">
          <span>
            MO BISTRO <span>/ District 5</span>
          </span>
          <span>Built for thoughtful hospitality.</span>
        </footer>
      </div>
    </main>
  );
}
