"use client";
import ReceptionTableRequests from "@/components/reception-table-requests";
import TableReadyNotifications from "@/components/table-ready-notifications";

import SeatGuestModal from "@/components/seat-guest-modal";

import { Cog } from "lucide-react";
import { guestDialHref } from "@/lib/guest-phone";
import TableAvailability from "@/components/table-availability";
import RestaurantWaitSlider from "@/components/restaurant-wait-slider";


import { useCallback, useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { createPortal } from "react-dom";
import {
  Users, CheckCircle2, Plus, Phone,
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
  const guestsController = useRef<AbortController | null>(null);
  const [guests, setGuests] = useState<Guest[]>([]);
  const [isManager, setIsManager] = useState(false);
  const [seatingGuest, setSeatingGuest] = useState<Guest | null>(null);
  const [search, setSearch] = useState("");
  const [openGuestMenu, setOpenGuestMenu] = useState<number | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const qrDialog = useRef<HTMLDivElement>(null);
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
  const loadGuests = useCallback(async (force = false) => {
    if (guestsController.current && !force) return;
    guestsController.current?.abort();
    const controller = new AbortController();
    guestsController.current = controller;
    try {
      const response = await fetch("/api/guests", { cache: "no-store", signal: controller.signal });
      if (!response.ok) throw new Error("Unable to load guests");
      const data = await response.json();
      if (!controller.signal.aborted) setGuests(data);
    } catch {
      if (!controller.signal.aborted) setError("Could not refresh the waitlist.");
    } finally {
      if (guestsController.current === controller) guestsController.current = null;
    }
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => void loadGuests(), 0);
    const timer = setInterval(() => { if (document.visibilityState === "visible") void loadGuests(); }, 5000);
    const onTablesChanged = () => { void loadGuests(true); };
    window.addEventListener("mo-bistro-tables-changed", onTablesChanged);
    return () => { window.clearTimeout(initial); guestsController.current?.abort(); guestsController.current = null; clearInterval(timer); window.removeEventListener("mo-bistro-tables-changed", onTablesChanged); };
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

  useEffect(() => {
    if (!showQR) return;

    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = qrDialog.current;
    dialog?.querySelector<HTMLButtonElement>("button")?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setShowQR(false);
      if (event.key === "Tab" && dialog) {
        const controls = [...dialog.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input, select, [tabindex="0"]')];
        const first = controls[0], last = controls[controls.length - 1];
        if (!first) { event.preventDefault(); dialog.focus(); }
        else if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
          event.preventDefault(); last.focus();
        } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog)) {
          event.preventDefault(); first.focus();
        }
      }
    };

    document.addEventListener("keydown", closeOnEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [showQR]);

  useEffect(() => {
    if (openGuestMenu === null) return;

    function dismiss(event: PointerEvent) {
      const target = event.target;
      if (target instanceof Element && !target.closest("[data-guest-menu]")) {
        setOpenGuestMenu(null);
      }
    }

    function escape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpenGuestMenu(null);
    }

    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);

    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, [openGuestMenu]);

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
      await loadGuests(true);
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
      await loadGuests(true);
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
      <div className="mx-auto max-w-7xl px-3 py-4 sm:px-5 md:px-10">
        <header className="mb-5 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.3em] text-[#C5A77B]">
              Mo Bistro
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
                  window.location.replace("/login");
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


        <section className="min-w-0 rounded-xl border border-white/10 bg-[#17202A]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 p-3">
            <div>
              <h2 className="text-xl font-semibold">Waiting queue</h2>
              <p className="mt-1 text-sm text-slate-400">
                {waiting} waiting · {called} called
              </p>
            </div>
            <button
              onClick={() => { setAddError(""); setShowAdd(true); }}
              className="flex items-center gap-2 rounded-xl bg-[#C5A77B] px-4 py-3 text-sm font-semibold text-[#101820] hover:bg-[#D8BC91]"
            >
              <Plus size={18} /> Add guest
            </button>
          </div>

          <div className="border-b border-white/10 p-3">
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

          <div className="max-h-[65dvh] sm:max-h-[560px] divide-y divide-white/10 overflow-y-auto overscroll-contain touch-pan-y px-3 pb-16">
      {filtered.map((guest) => {
        const position = active.findIndex(g => g.id === guest.id) + 1;
        const dialHref = guestDialHref(guest.phone);
        return (
          <div key={guest.id} className="grid min-w-0 grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-2 py-3 sm:gap-3">
            <span className="text-lg font-bold text-[#C5A77B]" aria-label={"Queue position " + position}>#{position}</span>
            <div className="min-w-0">
              <h3 className="break-words font-semibold leading-tight">{guest.name}</h3>
              <p className="mt-1 text-xs text-slate-300">{guest.party_size} guests · {guest.seating_preference === "any" ? "Any seating" : guest.seating_preference === "indoor" ? "Indoor" : "Outdoor"}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-sm font-semibold ${guest.status === "called" ? "bg-[#C5A77B]/20 text-[#E9CFA8]" : "bg-white/10 text-slate-200"}`}>
                  <Bell size={15} aria-hidden="true" />{guest.status === "waiting" ? "Uncalled" : labels[guest.status]}
                </span>
                {guest.confirmed === 1 && <span className="text-xs text-emerald-300">Confirmed</span>}
              </div>
            </div>
            <div className="flex items-center gap-1">
              {dialHref ? (
                <a
                  href={dialHref}
                  aria-label={"Call " + guest.name}
                  className="flex min-h-9 items-center gap-1 rounded-lg border border-white/15 px-2 text-xs text-white hover:bg-white/10 sm:min-h-11 sm:px-3"
                >
                  <Phone size={14} />
                  <span className="hidden min-[390px]:inline">Call</span>
                </a>
              ) : (
                <span className="px-1 text-xs text-slate-500">No phone</span>
              )}

              <div className="relative" data-guest-menu>
                <button
                  type="button"
                  aria-label={"More actions for " + guest.name}
                  aria-expanded={openGuestMenu === guest.id}
                  onClick={() => setOpenGuestMenu(current => current === guest.id ? null : guest.id)}
                  className="flex min-h-11 min-w-10 items-center justify-center rounded-lg border border-white/10 text-xl hover:bg-white/10"
                >
                  ···
                </button>
                {openGuestMenu === guest.id && (
                  <div className="absolute right-0 top-full z-30 mt-1 w-48 origin-top-right animate-in fade-in duration-150 rounded-xl border border-white/15 bg-[#17202A] p-1 shadow-xl">
                    {guest.status === "waiting" && (
                      <button type="button" disabled={busy} onClick={() => { setOpenGuestMenu(null); void performAction(guest.id, "call"); }} className="block min-h-11 w-full rounded-lg px-3 text-left text-sm hover:bg-white/10 disabled:opacity-40">Mark called</button>
                    )}
                    {guest.confirmed !== 1 && (
                      <button type="button" disabled={busy} onClick={() => { setOpenGuestMenu(null); void performAction(guest.id, "confirm"); }} className="block min-h-11 w-full rounded-lg px-3 text-left text-sm hover:bg-white/10 disabled:opacity-40">Confirm booking</button>
                    )}
                    <div className="my-1 border-t border-white/10" />
                    <button type="button" disabled={busy} onClick={() => { setOpenGuestMenu(null); void performAction(guest.id, "no_show"); }} className="block min-h-11 w-full rounded-lg px-3 text-left text-sm text-amber-200 hover:bg-white/10 disabled:opacity-40">No-show</button>
                    <button type="button" disabled={busy} onClick={() => { setOpenGuestMenu(null); void performAction(guest.id, "cancel"); }} className="block min-h-11 w-full rounded-lg px-3 text-left text-sm text-red-300 hover:bg-white/10 disabled:opacity-40">Cancel booking</button>
                  </div>
                )}
              </div>

              <button
                type="button"
                disabled={busy}
                onClick={() => void performAction(guest.id, "seat")}
                className="min-h-11 rounded-lg bg-[#C5A77B] px-3 text-sm font-semibold text-[#101820] disabled:opacity-40"
                aria-label={"Seat " + guest.name}
              >
                Seat
              </button>
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

      {showQR && createPortal(
        <div
          ref={qrDialog}
          tabIndex={-1}
          role="dialog"
          aria-describedby="qr-instructions"
          aria-modal="true"
          aria-label="Guest registration QR code"
          className="fixed inset-0 z-[9999] flex h-[100dvh] w-screen items-center justify-center overflow-y-auto bg-[#0D1218] p-4 text-white"
        >
          <div className="my-auto w-full max-w-md rounded-2xl border border-white/10 bg-[#17202A] p-5 text-center shadow-2xl sm:p-7">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.25em] text-[#C5A77B]">
              Mo Bistro
            </p>
            <h2 className="text-2xl font-semibold">Guest Registration</h2>
            <p id="qr-instructions" className="mt-2 text-sm text-slate-400">
              Scan this QR code to join the waitlist.
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
                disabled={!registrationUrl}
                className="flex-1 rounded-xl border border-white/20 p-3 text-sm hover:bg-white/10 disabled:opacity-40"
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
      , document.body)}

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
