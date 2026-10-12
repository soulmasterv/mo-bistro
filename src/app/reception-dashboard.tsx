"use client";
import ReceptionTableRequests from "@/components/reception-table-requests";
import TableReadyNotifications from "@/components/table-ready-notifications";

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
  cancelled: "Cancelled",
};

export default function Home() {
  const guestsController = useRef<AbortController | null>(null);
  const [guests, setGuests] = useState<Guest[]>([]);
  const [seatingGuest, setSeatingGuest] = useState<Guest | null>(null);
  const [search, setSearch] = useState("");
  const [queueFilter, setQueueFilter] = useState<"all" | "waiting" | "called">(
    "all",
  );
  const [openGuestMenu, setOpenGuestMenu] = useState<number | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const addDialog = useRef<HTMLDivElement>(null);
  useStaffDialog(showAdd, addDialog, () => setShowAdd(false));
  const qrDialog = useRef<HTMLDivElement>(null);
  const [showQR, setShowQR] = useState(false);
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
      if (!controller.signal.aborted) setGuests(data);
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

  useEffect(() => {
    if (!showQR) return;

    const previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const dialog = qrDialog.current;
    dialog?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setShowQR(false);
      if (event.key === "Tab" && dialog) {
        const controls = [
          ...dialog.querySelectorAll<HTMLElement>(
            'button:not(:disabled), a[href], input, select, [tabindex="0"]',
          ),
        ];
        const first = controls[0],
          last = controls[controls.length - 1];
        if (!first) {
          event.preventDefault();
          dialog.focus();
        } else if (
          event.shiftKey &&
          (document.activeElement === first ||
            document.activeElement === dialog)
        ) {
          event.preventDefault();
          last.focus();
        } else if (
          !event.shiftKey &&
          (document.activeElement === last || document.activeElement === dialog)
        ) {
          event.preventDefault();
          first.focus();
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
  const filtered = active.filter(
    (g) =>
      `${g.name} ${g.phone}`.toLowerCase().includes(search.toLowerCase()) &&
      (queueFilter === "all" || g.status === queueFilter),
  );

  return (
    <main className="bistro-app">
      <div className="bistro-container">
        <header className="bistro-page-heading">
          <div>
            <p className="bistro-eyebrow">GUEST EXPERIENCE / RECEPTION</p>
            <h1>
              A warm welcome.
              <br />
              <span>A smooth service.</span>
            </h1>
            <p>Every arrival, every table, all in one place.</p>
          </div>
          <div className="bistro-toolbar">
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
          </div>
        </header>
        <section className="bistro-stat-grid" aria-label="Service statistics">
          {[
            {
              label: "Waiting guests",
              value: waiting,
              caption: "Ready for a warm welcome",
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
              caption: "Enjoying their visit",
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
        <div className="bistro-reception-grid">
          <section className="bistro-panel bistro-queue">
            <div className="bistro-panel-heading">
              <div>
                <p className="bistro-eyebrow">THE NEXT GREAT EXPERIENCE</p>
                <h2>
                  Waiting queue{" "}
                  <span className="bistro-count">{active.length}</span>
                </h2>
              </div>
              <span className="bistro-muted">Arrival order</span>
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
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    aria-pressed={queueFilter === value}
                    onClick={() => setQueueFilter(value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="bistro-guest-list">
              {filtered.map((guest) => {
                const position = active.findIndex((g) => g.id === guest.id) + 1;
                const dialHref = guestDialHref(guest.phone);
                return (
                  <article
                    key={guest.id}
                    className={`bistro-guest-card ${guest.status === "called" ? "is-called" : ""}`}
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
                        <h3>{guest.name}</h3>
                        <p>
                          <Users size={13} /> {guest.party_size} guests{" "}
                          <span>·</span>{" "}
                          {guest.seating_preference === "any"
                            ? "Any seating"
                            : guest.seating_preference === "indoor"
                              ? "Indoor"
                              : "Outdoor"}
                        </p>
                        <span className="bistro-phone">{guest.phone}</span>
                      </div>
                      <span
                        className={`bistro-status ${guest.status === "called" ? "status-called" : "status-waiting"}`}
                      >
                        <i />
                        {guest.status === "waiting"
                          ? "Uncalled"
                          : labels[guest.status]}
                      </span>
                    </div>
                    <div className="bistro-guest-bottom">
                      <span className="bistro-muted">
                        {guest.confirmed === 1 ? (
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
                          disabled={busy}
                          onClick={() => void performAction(guest.id, "seat")}
                          aria-label={"Seat " + guest.name}
                          className="bistro-button"
                        >
                          Seat guest <ArrowUpRight size={15} />
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
                          {openGuestMenu === guest.id && (
                            <div className="bistro-dropdown">
                              {guest.status === "waiting" && (
                                <button
                                  disabled={busy}
                                  onClick={() => {
                                    setOpenGuestMenu(null);
                                    void performAction(guest.id, "call");
                                  }}
                                >
                                  Mark called
                                </button>
                              )}
                              {guest.confirmed !== 1 && (
                                <button
                                  disabled={busy}
                                  onClick={() => {
                                    setOpenGuestMenu(null);
                                    void performAction(guest.id, "confirm");
                                  }}
                                >
                                  Confirm booking
                                </button>
                              )}
                              <button
                                disabled={busy}
                                onClick={() => {
                                  setOpenGuestMenu(null);
                                  void performAction(guest.id, "no_show");
                                }}
                              >
                                No-show
                              </button>
                              <button
                                className="bistro-danger"
                                disabled={busy}
                                onClick={() => {
                                  setOpenGuestMenu(null);
                                  void performAction(guest.id, "cancel");
                                }}
                              >
                                Cancel booking
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
              {filtered.length === 0 && (
                <div className="bistro-empty">
                  <Users size={30} />
                  <h3>A little room to breathe.</h3>
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
          <aside className="bistro-service-column">
            <ReceptionTableRequests />
            <TableAvailability />
            <RestaurantWaitSlider />
          </aside>
        </div>
        <footer className="bistro-page-footer">
          <span>
            MO BISTRO <span> / District 5</span>
          </span>
          <span>Thoughtful service, from arrival to goodbye.</span>
        </footer>
      </div>
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
    </main>
  );
}
