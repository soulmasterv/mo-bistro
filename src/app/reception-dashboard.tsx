"use client";
import TrackingHandoff from "@/components/tracking-handoff";
import NextGuestPanel from "@/components/next-guest-panel";
import ReceptionTableRequests from "@/components/reception-table-requests";
import TableReadyNotifications from "@/components/table-ready-notifications";

import GuestDetailSheet from "@/components/guest-detail-sheet";
import SeatGuestModal from "@/components/seat-guest-modal";

import { guestDialHref } from "@/lib/guest-phone";
import TableAvailability from "@/components/table-availability";
import RestaurantWaitSlider from "@/components/restaurant-wait-slider";
import { useStaffDialog } from "@/lib/use-staff-dialog";

import { useCallback, useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { createPortal } from "react-dom";
import {
  Users,
  CheckCircle2,
  Plus,
  Phone,
  Bell,
  Search,
  QrCode,
  ArrowUpRight,
  XCircle,
  RefreshCw,
  Armchair,
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
  confirmation_required?: boolean;
  source: string;
  created_at: string;
  eta_at?: string | null;
};

type Action = "call" | "seat" | "no_show" | "cancel" | "confirm";

function elapsedWait(guest: Guest, clock: number) {
  if (guest.status === "seated") return "—";
  const joined = new Date(guest.created_at).getTime();
  if (!clock || !Number.isFinite(joined)) return "—";
  const minutes = Math.max(0, Math.floor((clock - joined) / 60000));
  return minutes >= 60
    ? `${Math.floor(minutes / 60)}h ${minutes % 60}m`
    : `${minutes} min`;
}

const labels: Record<GuestStatus, string> = {
  waiting: "Waiting",
  called: "Called",
  seated: "Seated",
  no_show: "No-show",
  cancelled: "Cancelled",
};

export default function Home() {
  const guestsController = useRef<AbortController | null>(null);
  const [guests, setGuests] = useState<Guest[]>([]);
  const [seatingGuest, setSeatingGuest] = useState<Guest | null>(null);
  const [search, setSearch] = useState("");
  const [queueFilter, setQueueFilter] = useState<
    "all" | "waiting" | "called" | "seated"
  >("all");
  const [openGuestMenu, setOpenGuestMenu] = useState<number | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [trackingUrl,setTrackingUrl]=useState("");
  const addDialog = useRef<HTMLDivElement>(null);
  useStaffDialog(showAdd, addDialog, () => setShowAdd(false));
  const qrDialog = useRef<HTMLDivElement>(null);
  const [showQR, setShowQR] = useState(false);
  useStaffDialog(showQR, qrDialog, () => setShowQR(false));
  const [headerTools, setHeaderTools] = useState<HTMLElement | null>(null);
  const [nextGuestIds, setNextGuestIds] = useState<number[]>([]);
  useEffect(() => {
    const timer = window.setTimeout(() => setHeaderTools(document.getElementById("reception-header-tools")), 0);
    return () => window.clearTimeout(timer);
  }, []);
  const [registrationUrl, setRegistrationUrl] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [party, setParty] = useState(2);
  const [seatingPreference, setSeatingPreference] = useState<
    "indoor" | "outdoor" | "any"
  >("any");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [addError, setAddError] = useState("");
  const [showTables, setShowTables] = useState(false);
  const [queueClock, setQueueClock] = useState(0);
  const tablesDialog = useRef<HTMLDivElement>(null);
  useStaffDialog(showTables, tablesDialog, () => setShowTables(false));
  const loadGuests = useCallback(async (force = false) => {
    if (guestsController.current && !force) return;
    guestsController.current?.abort();
    const controller = new AbortController();
    guestsController.current = controller;
    try {
      const response = await fetch("/api/guests", {
        cache: "no-store",
        signal: controller.signal,
      });
      if (!response.ok) throw new Error("Unable to load guests");
      const data = await response.json();
      if (!controller.signal.aborted) {
        setGuests(data);
        setQueueClock(Date.now());
      }
    } catch {
      if (!controller.signal.aborted)
        setError("Could not refresh the waitlist.");
    } finally {
      if (guestsController.current === controller)
        guestsController.current = null;
    }
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => void loadGuests(), 0);
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void loadGuests();
    }, 5000);
    const onTablesChanged = () => {
      void loadGuests(true);
    };
    window.addEventListener("mo-bistro-tables-changed", onTablesChanged);
    return () => {
      window.clearTimeout(initial);
      guestsController.current?.abort();
      guestsController.current = null;
      clearInterval(timer);
      window.removeEventListener("mo-bistro-tables-changed", onTablesChanged);
    };
  }, [loadGuests]);

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
      const guest = guests.find((g) => g.id === id);
      if (guest) {
        setSeatingGuest(guest);
      }
      return;
    }
    if (action === "no_show" || action === "cancel") {
      const guest = guests.find((g) => g.id === id);
      const message =
        action === "no_show"
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
        body: JSON.stringify({ action }),
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
          seating_preference: seatingPreference,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to add guest");
      setName("");
      setPhone("");
      setParty(2);
      setSeatingPreference("any");
      setShowAdd(false);
      if(typeof result.token==="string" && /^[a-f0-9]{64}$/.test(result.token))setTrackingUrl(`${window.location.origin}/status?token=${encodeURIComponent(result.token)}`);
      await loadGuests(true);
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Unable to add guest");
    } finally {
      setBusy(false);
    }
  }

  const waiting = guests.filter((g) => g.status === "waiting").length;
  const called = guests.filter((g) => g.status === "called").length;
  const seated = guests.filter((g) => g.status === "seated").length;
  const active = guests.filter((g) => ["waiting", "called"].includes(g.status));
  const queueGuests = guests.filter((g) =>
    ["waiting", "called", "seated"].includes(g.status),
  );
  const filtered = queueGuests.filter(
    (g) =>
      `${g.name} ${g.phone}`.toLowerCase().includes(search.toLowerCase()) &&
      (queueFilter === "all"
        ? g.status === "waiting" || g.status === "called"
        : g.status === queueFilter),
  );

  const selectedGuest = queueGuests.find((guest) => guest.id === openGuestMenu);
  return (
    <main className="bistro-app bistro-reception queue-first reception-reference">
      <nav className="reception-sidebar" aria-label="Reception sections">
        <a href="#reception-queue" aria-current="page">
          <Users size={20} /> Queue
        </a>
        <button type="button" onClick={() => setShowTables(true)}>
          <Armchair size={20} /> Active Tables
        </button>
      </nav>
      <div className="bistro-container">
        <section
          className="bistro-notification-center"
          aria-label="Service notifications"
        >
          <ReceptionTableRequests />
          <TableReadyNotifications />
        </section>
        <header className="bistro-page-heading">
          <div>
            <p className="bistro-eyebrow">GUEST EXPERIENCE / RECEPTION</p>
            <h1>Reception</h1>
            <p>Manage the queue and seat guests.</p>
          </div>
          {headerTools ? createPortal(<div className="bistro-toolbar">
            <span className="bistro-live">
              <i /> Live service
            </span>
            <button
              className="bistro-icon-button"
              onClick={() => void loadGuests(true)}
              title="Refresh queue"
              aria-label="Refresh queue"
            >
              <RefreshCw size={18} />
            </button>
            <button
              type="button"
              className="bistro-button bistro-button-secondary"
              onClick={() => setShowTables(true)}
            >
              <Armchair size={18} />
              Tables
            </button>
            <button
              type="button"
              onClick={openQR}
              className="bistro-button bistro-button-secondary"
            >
              <QrCode size={18} /> QR Code
            </button>
            <button
              type="button"
              onClick={() => {
                setAddError("");
                setShowAdd(true);
              }}
              className="bistro-button"
            >
              <Plus size={18} /> Add guest
            </button>
          </div>, headerTools) : null}
        </header>
        <section className="bistro-stat-grid" aria-label="Service statistics">
          {[
            {
              label: "Waiting guests",
              value: waiting,
              caption: "Waiting for a table",
              icon: Users,
              tone: "gold",
            },
            {
              label: "Called guests",
              value: called,
              caption: "On their way to reception",
              icon: Bell,
              tone: "blue",
            },
            {
              label: "Seated guests",
              value: seated,
              caption: "Currently seated",
              icon: CheckCircle2,
              tone: "green",
            },
            {
              label: "Active parties",
              value: active.length,
              caption: "In today’s live queue",
              icon: Users,
              tone: "forest",
            },
          ].map((stat) => (
            <article
              className={`bistro-stat bistro-stat-${stat.tone}`}
              key={stat.label}
            >
              <div className="bistro-stat-top">
                <span>{stat.label}</span>
                <stat.icon size={18} />
              </div>
              <strong>{stat.value.toString().padStart(2, "0")}</strong>
              <p>{stat.caption}</p>
            </article>
          ))}
        </section>
        {error && (
          <div role="alert" className="bistro-alert">
            <span>{error}</span>
            <button onClick={() => setError("")}>Dismiss</button>
          </div>
        )}
        <NextGuestPanel onRecommendations={setNextGuestIds} />
        <div className="bistro-reception-grid">
          <section id="reception-queue" className="bistro-panel bistro-queue">
            <div className="bistro-panel-heading">
              <div>
                <p className="bistro-eyebrow">THE NEXT GREAT EXPERIENCE</p>
                <h2>
                  Waiting queue{" "}
                  <span className="bistro-count">{active.length}</span>
                </h2>
              </div>
              <span className="bistro-muted">
                Manage the waiting queue and seating.
              </span>
            </div>
            <div className="bistro-queue-controls">
              <div className="bistro-search">
                <Search size={18} />
                <input
                  aria-label="Search guests"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search a guest or phone number"
                />
              </div>
              <div className="bistro-tabs" aria-label="Queue status">
                {(
                  [
                    ["all", "All guests"],
                    ["waiting", "Waiting"],
                    ["called", "Called"],
                    ["seated", "Seated"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    aria-pressed={queueFilter === value}
                    onClick={() => setQueueFilter(value)}
                  >
                    {label} (
                    {value === "all"
                      ? active.length
                      : value === "waiting"
                        ? waiting
                        : value === "called"
                          ? called
                          : seated}
                    )
                  </button>
                ))}
              </div>
            </div>
            <div className="reception-table-head" aria-hidden="true">
              <span># · Guest</span>
              <span>Party size</span>
              <span>Preference</span>
              <span>Wait time</span>
              <span>Status</span>
              <span>Actions</span>
            </div>
            <div
              className="bistro-guest-list"
              role="region"
              aria-label="Guest queue"
              tabIndex={0}
            >
              {filtered.map((guest) => {
                const position =
                  (guest.status === "seated" ? queueGuests.filter((g) => g.status === "seated") : active).findIndex((g) => g.id === guest.id) + 1;
                const dialHref = guestDialHref(guest.phone);
                return (
                  <article
                    key={guest.id}
                    className={`bistro-guest-card ${guest.status === "called" ? "is-called" : ""} ${nextGuestIds.includes(guest.id) && ["waiting", "called"].includes(guest.status) ? "is-next-guest" : ""}`}
                  >
                    <div className="bistro-guest-main">
                      <span
                        className="bistro-position"
                        aria-label={"Queue position " + position}
                      >
                        {position.toString().padStart(2, "0")}
                      </span>
                      <div className="bistro-avatar">
                        {guest.name
                          .split(" ")
                          .map((s) => s[0])
                          .slice(0, 2)
                          .join("")}
                      </div>
                      <div className="bistro-guest-copy">
                        <h3>
                          <button
                            type="button"
                            className="queue-guest-name"
                            aria-label={"Guest details for " + guest.name}
                            onClick={() => setOpenGuestMenu(guest.id)}
                          >
                            {guest.name}
                          </button>
                          {nextGuestIds.includes(guest.id) && ["waiting", "called"].includes(guest.status) && <span className="queue-next-badge">Next guest</span>}
                        </h3>
                        <p>
                          <Users size={13} /> {guest.party_size} guests{" "}
                          <span>·</span>{" "}
                          {guest.seating_preference === "any"
                            ? "Any seating"
                            : guest.seating_preference === "indoor"
                              ? "Indoor"
                              : "Outdoor"}
                        </p>
                        {guest.status === "called" && (
                          <span className="queue-called-marker">Called</span>
                        )}
                        <span className="bistro-phone">{guest.phone}</span>
                      </div>
                      <span
                        className={`bistro-status ${guest.status === "called" ? "status-called" : guest.status === "seated" ? "status-seated" : "status-waiting"}`}
                      >
                        <i />
                        {guest.status === "waiting"
                          ? "Waiting"
                          : labels[guest.status]}
                      </span>
                    </div>
                    <div className="reception-row-facts">
                      <span>
                        <Users size={14} /> {guest.party_size}
                      </span>
                      <span>
                        {guest.seating_preference === "any"
                          ? "Any"
                          : guest.seating_preference === "indoor"
                            ? "Indoor"
                            : "Outdoor"}
                      </span>
                      <span>{elapsedWait(guest, queueClock)}</span>
                      <span
                        className={`reception-status-pill pill-${guest.status}`}
                      >
                        {labels[guest.status]}
                      </span>
                    </div>
                    <div className="bistro-guest-bottom">
                      <span className="bistro-muted queue-guest-confirmation">
                        {guest.confirmation_required === false ? (
                          "Booking active"
                        ) : guest.confirmed === 1 ? (
                          <>
                            <CheckCircle2 size={14} /> Confirmed booking
                          </>
                        ) : (
                          <>Awaiting confirmation</>
                        )}
                        {guest.eta_at && (
                          <>
                            {" "}
                            · ETA{" "}
                            {new Date(guest.eta_at).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </>
                        )}
                      </span>
                      <div className="bistro-guest-actions">
                        {dialHref && (
                          <a
                            href={dialHref}
                            aria-label={"Call " + guest.name}
                            className="bistro-button bistro-button-secondary"
                          >
                            <Phone size={15} /> Call
                          </a>
                        )}
                        <button
                          disabled={busy || guest.status === "seated"}
                          onClick={() => void performAction(guest.id, "seat")}
                          aria-label={"Seat " + guest.name}
                          className="bistro-button"
                        >
                          Seat <ArrowUpRight size={15} />
                        </button>
                        <div className="bistro-guest-menu" data-guest-menu>
                          <button
                            type="button"
                            className="bistro-icon-button"
                            aria-label={"More actions for " + guest.name}
                            aria-expanded={openGuestMenu === guest.id}
                            onClick={() =>
                              setOpenGuestMenu((current) =>
                                current === guest.id ? null : guest.id,
                              )
                            }
                          >
                            ···
                          </button>
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
              {filtered.length === 0 && (
                <div className="bistro-empty">
                  <Users size={30} />
                  <h3>Queue is empty.</h3>
                  <p>No active guests found. New arrivals will appear here.</p>
                </div>
              )}
            </div>
            <footer className="bistro-panel-footer">
              <span>{filtered.length} parties shown</span>
              <span>
                <i className="bistro-dot" /> Refreshes every 5 seconds
              </span>
            </footer>
          </section>
        </div>
        <footer className="bistro-page-footer">
          <span>
            MO BISTRO <span> / District 5</span>
          </span>
          <span>Thoughtful service, from arrival to goodbye.</span>
        </footer>
      </div>
      <nav className="queue-bottom-bar" aria-label="Queue tools">
        <button type="button" onClick={() => setShowTables(true)}>
          <Armchair size={20} />
          <span>Tables</span>
        </button>
        <button type="button" onClick={openQR}>
          <QrCode size={20} />
          <span>QR Code</span>
        </button>
        <button
          type="button"
          className="queue-add-guest"
          onClick={() => {
            setAddError("");
            setShowAdd(true);
          }}
        >
          <Plus size={20} />
          <span>Add guest</span>
        </button>
      </nav>
      {selectedGuest && (
        <GuestDetailSheet
          onRefresh={()=>void loadGuests(true)}
          key={selectedGuest.id}
          guest={selectedGuest}
          busy={busy}
          error={error}
          onClose={() => setOpenGuestMenu(null)}
          onSeat={() => {
            setOpenGuestMenu(null);
            void performAction(selectedGuest.id, "seat");
          }}
          onAction={(action) => void performAction(selectedGuest.id, action)}
        />
      )}
      {showTables &&
        createPortal(
          <div
            className="bistro-dialog-scope queue-sheet-overlay"
            onClick={(event) => {
              if (event.target === event.currentTarget) setShowTables(false);
            }}
          >
            <div
              ref={tablesDialog}
              role="dialog"
              aria-modal="true"
              aria-labelledby="tables-sheet-title"
              tabIndex={-1}
              className="queue-guest-sheet queue-tables-sheet"
            >
              <header>
                <h2 id="tables-sheet-title">Tables</h2>
                <button
                  type="button"
                  aria-label="Close tables"
                  onClick={() => setShowTables(false)}
                >
                  <XCircle size={22} />
                </button>
              </header>
              <TableAvailability />
              <RestaurantWaitSlider />
            </div>
          </div>,
          document.body,
        )}
      {showQR &&
        createPortal(
          <div
            ref={qrDialog}
            tabIndex={-1}
            role="dialog"
            aria-labelledby="qr-heading"
            aria-describedby="qr-instructions"
            aria-modal="true"
            aria-label="Guest registration QR code"
            className="bistro-dialog-scope bistro-qr-overlay fixed inset-0 z-[9999] flex h-[100dvh] w-full items-center justify-center overflow-y-auto bg-black/80 p-4 text-white"
          >
            <div className="bistro-qr-card my-auto w-full max-w-md rounded-3xl border border-white/10 bg-[#17202A] p-5 text-center shadow-2xl sm:p-7">
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-[#C5A77B]">
                Welcome to the table
              </p>
              <h2
                id="qr-heading"
                className="text-3xl font-semibold tracking-tight"
              >
                Mo Bistro
              </h2>
              <p id="qr-instructions" className="mt-2 text-sm text-slate-400">
                Scan this QR code to join the waitlist.
              </p>

              <div className="mx-auto my-6 w-fit max-w-full rounded-2xl bg-white p-4 sm:p-6">
                {registrationUrl ? (
                  <QRCodeSVG
                    value={registrationUrl}
                    size={220}
                    level="M"
                    marginSize={4}
                    title="Mo Bistro waitlist QR code"
                    className="h-auto max-w-full"
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
          </div>,
          document.body,
        )}

      {showAdd && (
        <div className="bistro-dialog-scope fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div
            ref={addDialog}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label="Add guest"
            className="bistro-add-card w-full max-w-md rounded-2xl border border-white/10 bg-[#17202A] p-6 shadow-2xl"
          >
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-xl font-semibold">Add guest</h2>
              <button
                onClick={() => setShowAdd(false)}
                aria-label="Close add guest"
                className="text-slate-400 hover:text-white"
              >
                <XCircle size={22} />
              </button>
            </div>
            <form onSubmit={addGuest} className="space-y-4">
              {addError && (
                <div
                  role="alert"
                  className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200"
                >
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
                  onChange={(e) => setName(e.target.value)}
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
                  onChange={(e) => setPhone(e.target.value)}
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
                  onChange={(e) => setParty(Number(e.target.value))}
                  className="mt-2 w-full rounded-xl border border-white/10 bg-[#0D1218] p-3 outline-none focus:border-[#C5A77B]"
                />
              </label>
              <div className="block text-sm">
                <label htmlFor="staff-seating-preference">
                  Seating preference
                </label>
                <select
                  id="staff-seating-preference"
                  className="mt-2 w-full rounded-xl p-3"
                  value={seatingPreference}
                  onChange={(e) =>
                    setSeatingPreference(
                      e.target.value as typeof seatingPreference,
                    )
                  }
                >
                  <option value="any">No preference</option>
                  <option value="indoor">Indoor</option>
                  <option value="outdoor">Outdoor</option>
                </select>
              </div>
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

      {trackingUrl && <TrackingHandoff url={trackingUrl} onClose={()=>setTrackingUrl("")}/>}
      {seatingGuest && (
        <SeatGuestModal
          guest={seatingGuest}
          onClose={() => setSeatingGuest(null)}
          onSuccess={() => {
            void loadGuests();
          }}
        />
      )}
    </main>
  );
}
