"use client";
import ReceptionTableRequests from "@/components/reception-table-requests";
import TableReadyNotifications from "@/components/table-ready-notifications";

import SeatGuestModal from "@/components/seat-guest-modal";

import { Cog } from "lucide-react";
import TableAvailability from "@/components/table-availability";
import RestaurantWaitSlider from "@/components/restaurant-wait-slider";


import { useCallback, useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  Users, Clock3, CheckCircle2, Plus, Phone,
  Bell, Search, QrCode,
  ArrowUpRight, XCircle, RefreshCw
} from "lucide-react";

type GuestStatus = "waiting" | "called" | "seated" | "no_show" | "cancelled";

type Guest = {
  id: number;
  name: string;
  phone: string;
  party_size: number;
  seating_preference: "indoor" | "outdoor" | "any";
  status: GuestStatus;
  confirmed: number;
  source: string;
  created_at: string;
  eta_at?: string | null;
};

type Action = "call" | "seat" | "no_show" | "cancel" | "confirm";

const labels: Record<GuestStatus, string> = {
  waiting: "Waiting",
  called: "Called",
  seated: "Seated",
  no_show: "No-show",
  cancelled: "Cancelled"
};

export default function Home() {
  const [guests, setGuests] = useState<Guest[]>([]);
  const [isManager, setIsManager] = useState(false);
  const [seatingGuest, setSeatingGuest] = useState<Guest | null>(null);
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [registrationUrl, setRegistrationUrl] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [party, setParty] = useState(2);
  const [seatingPreference, setSeatingPreference] =
    useState<"indoor" | "outdoor" | "any">("any");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [addError, setAddError] = useState("");
  const loadGuests = useCallback(async () => {
    try {
      const response = await fetch("/api/guests", { cache: "no-store" });
      if (!response.ok) throw new Error("Unable to load guests");
      setGuests(await response.json());
    } catch {
      setError("Could not refresh the waitlist.");
    }
  }, []);

  useEffect(() => {
    void loadGuests();
    const timer = setInterval(() => void loadGuests(), 5000);
    return () => clearInterval(timer);
  }, [loadGuests]);

  useEffect(() => {
    fetch("/api/auth/me", { cache: "no-store" })
      .then(async response => {
        if (!response.ok) {
          window.location.replace("/login");
          return null;
        }
        return response.json();
      })
      .then(data => {
        if (data) setIsManager(data.role === "manager");
      })
      .catch(() => window.location.replace("/login"));
  }, []);

  async function refreshQR() {
    try {
      const response = await fetch("/api/qr", { cache: "no-store" });
      if (!response.ok) throw new Error("Unable to load QR code");
      const data = await response.json();
      setRegistrationUrl(data.url);
    } catch {
      setRegistrationUrl("");
    }
  }

  async function openQR() {
    setRegistrationUrl("");
    setShowQR(true);
    await refreshQR();
  }

  useEffect(() => {
    if (!showQR) return;
    const timer = window.setInterval(refreshQR, 15000);
    return () => window.clearInterval(timer);
  }, [showQR]);

  async function performAction(id: number, action: Action) {
    if (action === "seat") {
      const guest = guests.find(g => g.id === id);
      if (guest) {
        setSeatingGuest(guest);
      }
      return;
    }
    if (action === "no_show" || action === "cancel") {
      const guest = guests.find(g => g.id === id);
      const message = action === "no_show"
        ? `Mark ${guest?.name || "this guest"} as no-show? They will leave the active queue.`
        : `Cancel ${guest?.name || "this guest"}'s booking? They will leave the active queue.`;
      if (!window.confirm(message)) return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/guests/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Action failed");
      await loadGuests();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  async function addGuest(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setAddError("");
    try {
      const response = await fetch("/api/guests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          phone: phone.trim(),
          party_size: party,
          seating_preference: seatingPreference
        })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to add guest");
      setName("");
      setPhone("");
      setParty(2);
      setSeatingPreference("any");
      setShowAdd(false);
      await loadGuests();
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Unable to add guest");
    } finally {
      setBusy(false);
    }
  }

  const waiting = guests.filter(g => g.status === "waiting").length;
  const called = guests.filter(g => g.status === "called").length;
  const seated = guests.filter(g => g.status === "seated").length;
  const active = guests.filter(g => ["waiting", "called"].includes(g.status));
  const filtered = active.filter(g =>
    `${g.name} ${g.phone}`.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <main className="min-h-screen bg-[#0D1218] text-white">
      <div className="mx-auto max-w-7xl px-5 py-8 md:px-10">
        <header className="mb-10 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.3em] text-[#C5A77B]">
              Restaurant Concierge
            </p>
            <h1 className="text-4xl font-semibold tracking-tight">Waitlist</h1>
            <p className="mt-2 text-sm text-slate-400">
              Reception management dashboard
            </p>
          </div>
          <div className="flex gap-3">
              <button
                type="button"
                onClick={async () => {
                  await fetch("/api/auth/logout", { method: "POST" });
                  window.location.href = "/login";
                }}
                className="rounded-xl border border-white/10 px-4 text-sm hover:bg-white/10"
              >
                Log out
              </button>
            <button
              onClick={() => void loadGuests()}
              className="rounded-xl border border-white/10 bg-white/5 p-3 hover:bg-white/10"
              title="Refresh queue"
            >
              <RefreshCw size={20} />
            </button>
            {isManager && (
              <a
                href="/management"
                className="flex items-center justify-center rounded-xl border border-white/10 bg-white/5 p-3 hover:bg-white/10"
                title="Manager settings"
                aria-label="Manager settings"
              >
                <Cog size={20} />
              </a>
            )}

<button
  type="button"
  onClick={openQR}
  className="flex items-center gap-2 rounded-xl bg-[#C5A77B] px-5 py-3 font-semibold text-[#101820] hover:bg-[#D8BC91]"
>
  <QrCode size={18} /> QR Code
</button>
          </div>
        </header>

        <section className="mb-9 grid gap-4 md:grid-cols-3">
          {[
            { label: "Waiting guests", value: waiting, icon: Users },
            { label: "Called guests", value: called, icon: Bell },
            { label: "Seated guests", value: seated, icon: CheckCircle2 }
          ].map(stat => (
            <div key={stat.label} className="rounded-2xl border border-white/10 bg-[#17202A] p-6">
              <div className="mb-6 flex items-center justify-between">
                <span className="text-sm text-slate-400">{stat.label}</span>
                <stat.icon size={20} className="text-[#C5A77B]" />
              </div>
              <div className="text-4xl font-semibold">{stat.value}</div>
            </div>
          ))}
        </section>

        {error && (
          <div role="alert" className="mb-5 flex items-center justify-between rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
            <span>{error}</span>
            <button onClick={() => setError("")}>Dismiss</button>
          </div>
        )}


        <section className="overflow-hidden rounded-2xl border border-white/10 bg-[#17202A]">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 p-6">
            <div>
              <h2 className="text-xl font-semibold">Current queue</h2>
              <p className="mt-1 text-sm text-slate-400">
                First come, first served · {active.length} active parties
              </p>
            </div>
            <button
              onClick={() => { setAddError(""); setShowAdd(true); }}
              className="flex items-center gap-2 rounded-xl bg-[#C5A77B] px-4 py-3 text-sm font-semibold text-[#101820] hover:bg-[#D8BC91]"
            >
              <Plus size={18} /> Add guest
            </button>
          </div>

          <div className="border-b border-white/10 p-5">
            <div className="flex max-w-md items-center gap-3 rounded-xl border border-white/10 bg-[#0D1218] px-4 py-3">
              <Search size={18} className="text-slate-500" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search name or phone..."
                className="w-full bg-transparent text-sm text-white outline-none placeholder:text-slate-500"
              />
            </div>
          </div>

          <div className="divide-y divide-white/10">
            {filtered.map((guest) => {
              const position = active.findIndex(g => g.id === guest.id) + 1;
              const dialNumber = guest.phone.replace(/[^+\\d]/g, "");

              return (
                <div
                  key={guest.id}
                  className="p-4 sm:p-5 hover:bg-white/[0.025]"
                >
                  <div className="flex flex-col gap-4">

                    <div className="flex items-start gap-3 sm:gap-4">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#C5A77B] font-bold text-[#101820]">
                        #{position}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-semibold text-white">
                            {guest.name}
                          </h3>

                          <span className="rounded-full bg-white/10 px-2.5 py-1 text-xs text-slate-300">
                            {labels[guest.status]}
                          </span>

                          {guest.confirmed === 1 && (
                            <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-300">
                              Confirmed
                            </span>
                          )}
                        </div>

                        <p className="mt-2 text-sm text-slate-400">
                          {guest.party_size} {guest.party_size === 1 ? "guest" : "guests"}
                          {" · "}
                          <span className="capitalize">
                            {guest.seating_preference || "any"} seating
                          </span>
                        </p>

                        <p className="mt-1 text-xs text-slate-500">
                          Queue position #{position}
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                      <a
                        href={`tel:${dialNumber}`}
                        aria-label={`Call ${guest.name}`}
                        className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#C5A77B]/40 px-4 py-2.5 text-sm font-medium text-[#C5A77B] hover:bg-[#C5A77B]/10"
                      >
                        <Phone size={16} />
                        Call Guest
                      </a>

                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void performAction(guest.id, "seat")}
                        className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#C5A77B] px-4 py-2.5 text-sm font-semibold text-[#101820] hover:bg-[#D8BC91] disabled:opacity-40"
                      >
                        Seat Guest
                      </button>
                    </div>

                    <details className="group rounded-xl border border-white/10 bg-[#0D1218]/60">
                      <summary className="cursor-pointer list-none px-4 py-3 text-sm text-slate-300 hover:text-white [&::-webkit-details-marker]:hidden">
                        <span className="flex items-center justify-between">
                          More actions
                          <span className="text-[#C5A77B] group-open:rotate-180">
                            &#9662;
                          </span>
                        </span>
                      </summary>

                      <div className="flex flex-wrap gap-2 border-t border-white/10 p-3">
                        {guest.status === "waiting" && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void performAction(guest.id, "call")}
                            className="rounded-lg border border-white/15 px-3 py-2 text-sm hover:bg-white/10 disabled:opacity-40"
                          >
                            Mark Called
                          </button>
                        )}

                        {guest.confirmed !== 1 && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void performAction(guest.id, "confirm")}
                            className="rounded-lg border border-white/15 px-3 py-2 text-sm hover:bg-white/10 disabled:opacity-40"
                          >
                            Confirm Booking
                          </button>
                        )}

                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void performAction(guest.id, "no_show")}
                          className="rounded-lg border border-amber-500/25 px-3 py-2 text-sm text-amber-200 hover:bg-amber-500/10 disabled:opacity-40"
                        >
                          No-show
                        </button>

                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void performAction(guest.id, "cancel")}
                          className="rounded-lg border border-red-500/25 px-3 py-2 text-sm text-red-300 hover:bg-red-500/10 disabled:opacity-40"
                        >
                          Cancel Booking
                        </button>
                      </div>
                    </details>

                  </div>
                </div>
              );
            })}

            {filtered.length === 0 && (
              <p className="p-8 text-center text-sm text-slate-400">
                No active guests found.
              </p>
            )}
          </div>
        </section>

        <div className="mt-8">
          <RestaurantWaitSlider />
        <TableAvailability />
        </div>

        <footer className="mt-8 flex items-center justify-between text-xs text-slate-500">
          <span>Mo Bistro · Reception</span>
          <span className="flex items-center gap-1">
            <ArrowUpRight size={13} /> Auto-refresh every 5s
          </span>
        </footer>
      </div>

      {showQR && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#17202A] p-7 text-center shadow-2xl">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.25em] text-[#C5A77B]">
              Restaurant Concierge
            </p>
            <h2 className="text-2xl font-semibold">Guest Registration</h2>
            <p className="mt-2 text-sm text-slate-400">
              Ask your guest to scan this code to join the waitlist.
            </p>

            <div className="mx-auto my-7 w-fit rounded-2xl bg-white p-5">
              {registrationUrl ? (
                <QRCodeSVG
                  value={registrationUrl}
                  size={220}
                  level="M"
                  marginSize={0}
                />
              ) : (
                <div className="flex h-[220px] w-[220px] items-center justify-center text-center text-sm text-slate-600">
                  Loading QR code... If it does not appear, close and reopen.
                </div>
              )}
            </div>

            <p className="break-all text-xs text-slate-400">
              {registrationUrl}
            </p>

            <div className="mt-6 flex gap-3">
              <button
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(registrationUrl);
                  } catch {
                    window.prompt("Copy registration link:", registrationUrl);
                  }
                }}
                className="flex-1 rounded-xl border border-white/20 p-3 text-sm hover:bg-white/10"
              >
                Copy link
              </button>
              <button
                onClick={() => setShowQR(false)}
                className="flex-1 rounded-xl bg-[#C5A77B] p-3 text-sm font-semibold text-[#101820] hover:bg-[#D8BC91]"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#17202A] p-6 shadow-2xl">
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-xl font-semibold">Add guest</h2>
              <button
                onClick={() => setShowAdd(false)}
                className="text-slate-400 hover:text-white"
              >
                <XCircle size={22} />
              </button>
            </div>
            <form onSubmit={addGuest} className="space-y-4">
              {addError && (
                <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
                  {addError}
                </div>
              )}
              <label className="block text-sm">
                Full name
                <input
                  required
                  minLength={2}
                  maxLength={100}
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="mt-2 w-full rounded-xl border border-white/10 bg-[#0D1218] p-3 outline-none focus:border-[#C5A77B]"
                />
              </label>
              <label className="block text-sm">
                Phone number
                <input
                  required
                  type="tel"
                  minLength={7}
                  maxLength={25}
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  className="mt-2 w-full rounded-xl border border-white/10 bg-[#0D1218] p-3 outline-none focus:border-[#C5A77B]"
                />
              </label>
              <label className="block text-sm">
                Party size
                <input
                  required
                  type="number"
                  min={1}
                  max={30}
                  value={party}
                  onChange={e => setParty(Number(e.target.value))}
                  className="mt-2 w-full rounded-xl border border-white/10 bg-[#0D1218] p-3 outline-none focus:border-[#C5A77B]"
                />
              </label>
              <button
                disabled={busy}
                type="submit"
                className="w-full rounded-xl bg-[#C5A77B] p-3 font-semibold text-[#101820] hover:bg-[#D8BC91] disabled:opacity-40"
              >
                {busy ? "Saving..." : "Add to waitlist"}
              </button>
            </form>
          </div>
        </div>
      )}

      {seatingGuest && (
        <SeatGuestModal
          guest={seatingGuest}
          onClose={() => setSeatingGuest(null)}
          onSuccess={() => {
            void loadGuests();
          }}
        />
      )}
      <TableReadyNotifications />
      <ReceptionTableRequests />
    </main>
  );
}
