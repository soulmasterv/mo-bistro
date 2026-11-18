"use client";
import ReceptionGuestCard from "@/components/reception/guest-card";
import { deriveReceptionQueue, type ReceptionGuest as Guest, type GuestAction as Action } from "@/lib/reception-queue";
import {checkReception,receptionRead,refreshReception,watchReception} from "@/lib/reception-feed";

import { useConfirmation } from "@/components/confirmation-provider";
import TrackingHandoff from "@/components/tracking-handoff";
import NextGuestPanel from "@/components/next-guest-panel";
import ReceptionServiceStrip from "@/components/reception-service-strip";
import ReceptionTableRequests from "@/components/reception-table-requests";

import GuestDetailSheet from "@/components/guest-detail-sheet";
import SeatGuestModal from "@/components/seat-guest-modal";

import TableAvailability from "@/components/table-availability";
import RestaurantWaitSlider from "@/components/restaurant-wait-slider";
import { useStaffDialog } from "@/lib/use-staff-dialog";

import { useCallback, useEffect, useRef, useState } from "react";
import RegistrationQrDialog from "@/components/reception/registration-qr-dialog";
import { createPortal } from "react-dom";
import {
  Users,
  Plus,
  Search,
  QrCode,
  ArrowUp,
  XCircle,
  RefreshCw,
  Armchair,
} from "lucide-react";

export default function Home() {
  const confirmAction = useConfirmation();
  const guestsController = useRef<AbortController | null>(null);
  const [guests, setGuests] = useState<Guest[]>([]);
  const [guestsLoaded, setGuestsLoaded] = useState(false);
  const [seatingGuest, setSeatingGuest] = useState<Guest | null>(null);
  const [search, setSearch] = useState("");
  const [queueFilter, setQueueFilter] = useState<
    "all" | "waiting" | "seated"
  >("all");
  const [showRequests, setShowRequests] = useState(false);
  const [requestCount, setRequestCount] = useState(0);
  useEffect(() => {
    const toggle = () => setShowRequests(open => !open);
    const update = (event: Event) => setRequestCount((event as CustomEvent<number>).detail);
    window.addEventListener("mo-bistro-open-requests", toggle);
    window.addEventListener("mo-bistro-requests-changed", update);
    return () => {
      window.removeEventListener("mo-bistro-open-requests", toggle);
      window.removeEventListener("mo-bistro-requests-changed", update);
    };
  }, []);
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("mo-bistro-requests-view", { detail: showRequests }));
  }, [showRequests]);
  const [openGuestMenu, setOpenGuestMenu] = useState<number | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [trackingUrl,setTrackingUrl]=useState("");
  const addDialog = useRef<HTMLDivElement>(null);
  useStaffDialog(showAdd, addDialog, () => setShowAdd(false));
  const [showQR, setShowQR] = useState(false);
  const [headerTools, setHeaderTools] = useState<HTMLElement | null>(null);
  const [showBackToTop, setShowBackToTop] = useState(false);
  useEffect(() => {
    const update = () => setShowBackToTop(window.scrollY > 240);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setHeaderTools(document.getElementById("reception-header-tools")), 0);
    return () => window.clearTimeout(timer);
  }, []);
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
  const [pendingAction, setPendingAction] = useState<{id:number;action:Exclude<Action,"seat">} | null>(null);
  const actionInFlight = useRef(false);
  const tablesDialog = useRef<HTMLDivElement>(null);
  useStaffDialog(showTables, tablesDialog, () => setShowTables(false));
  const loadGuests = useCallback(async (force = false) => {
    if(force)await refreshReception().catch(()=>{});
    if (guestsController.current && !force) return;
    guestsController.current?.abort();
    const controller = new AbortController();
    guestsController.current = controller;
    try {
      const response = await receptionRead("/api/guests", {
        cache: "no-store",
        signal: controller.signal,
      });
      if (!response.ok) throw new Error("Unable to load guests");
      const data = await response.json();
      if (!controller.signal.aborted) {
        setGuests(data);
        setGuestsLoaded(true);
        setError("");
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
    const unsubscribe=watchReception(()=>void loadGuests());
    return () => {
      window.clearTimeout(initial);
      guestsController.current?.abort();
      guestsController.current = null;
      unsubscribe();
    };
  }, [loadGuests]);

  function openQR() {
    setShowQR(true);
  }

  async function performAction(id: number, action: Action) {
    if (busy || actionInFlight.current) return;
    if (action === "seat") {
      const guest = guests.find((g) => g.id === id);
      if (guest) {
        setSeatingGuest(guest);
      }
      return;
    }
    actionInFlight.current = true;
    try {
      if (action === "no_show" || action === "cancel") {
        const guest = guests.find((g) => g.id === id);
        const message =
          action === "no_show"
            ? `Mark ${guest?.name || "this guest"} as no-show? They will leave the active queue.`
            : `Cancel ${guest?.name || "this guest"}'s booking? They will leave the active queue.`;
        if (!await confirmAction({ title: action === "no_show" ? "Mark guest as no-show?" : "Cancel booking?", message, confirmLabel: action === "no_show" ? "Mark no-show" : "Cancel booking", destructive: true })) return;
      }
      setBusy(true);
      setPendingAction({id,action});
      setError("");
      const response = await fetch(`/api/guests/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Action failed");
      if (action === "cancel" || action === "no_show") {
        setOpenGuestMenu(current => current === id ? null : current);
        setGuests(current => current.map(guest => guest.id === id ? {...guest,status:action === "cancel" ? "cancelled" : "no_show"} : guest));
      }
      await loadGuests(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(false);
      setPendingAction(null);
      actionInFlight.current = false;
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

  const { waiting, seated, active, queueGuests, filtered, positions } = deriveReceptionQueue(guests, search, queueFilter);

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
              onClick={() => void checkReception().catch(()=>{})}
              title="Refresh queue"
              aria-label="Refresh queue"
            >
              <RefreshCw size={18} />
            </button>
            <button
              type="button"
              className="bistro-button bistro-button-secondary reception-header-tables"
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
        {error && (
          <div role="alert" className="bistro-alert">
            <span>{error}</span>
            <button onClick={() => setError("")}>Dismiss</button>
          </div>
        )}
        <NextGuestPanel />
        <div className="bistro-reception-grid">
          <section id="reception-queue" className="bistro-panel bistro-queue">
            <div className="bistro-panel-heading reception-queue-heading">
              <div>
                <h2>
                  Waiting queue{" "}
                  <span className="bistro-count">{guestsLoaded ? active.length : "—"}</span>
                </h2>
              </div>
              <div className="bistro-tabs" aria-label="Queue status">
                {(
                  [
                    ["all", "All guests"],
                    ["waiting", "Waiting"],
                    ["seated", "Seated"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    aria-pressed={!showRequests && queueFilter === value}
                    onClick={() => { setShowRequests(false); setQueueFilter(value); }}
                  >
                    {label} (
                    {!guestsLoaded ? "—" : value === "all"
                      ? active.length
                      : value === "waiting"
                        ? waiting
                        : seated}
                    )
                  </button>
                ))}
                <button type="button" className="reception-requests-tab" aria-pressed={showRequests} aria-controls="table-request-notifications" onClick={() => setShowRequests(true)}>
                  Table Requests ({requestCount})
                </button>
              </div>
            </div>
            <ReceptionTableRequests open={showRequests} />
            {!showRequests && <>
            <div className="bistro-queue-controls reception-queue-toolbar">
              <div className="bistro-search">
                <Search size={18} />
                <input
                  aria-label="Search guests"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search a guest or phone number"
                />
              </div>
              <ReceptionServiceStrip />
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
              {filtered.map(guest => (
                <ReceptionGuestCard
                  key={guest.id}
                  guest={guest}
                  position={positions.get(guest.id) ?? 0}
                  isNext={active[0]?.id === guest.id}
                  busy={busy}
                  menuOpen={openGuestMenu === guest.id}
                  clock={queueClock}
                  onDetails={() => setOpenGuestMenu(guest.id)}
                  onSeat={() => void performAction(guest.id, "seat")}
                  onToggleMenu={() => setOpenGuestMenu(current => current === guest.id ? null : guest.id)}
                />
              ))}
              {!guestsLoaded && <p role="status">{error ? "Waitlist unavailable. Please refresh." : "Loading waitlist…"}</p>}
              {guestsLoaded && filtered.length === 0 && (
                <div className="bistro-empty">
                  <Users size={30} />
                  <h3>{search || queueFilter !== "all" ? "No matching guests." : "Queue is empty."}</h3>
                  <p>{search || queueFilter !== "all" ? "Change the search or filter to see other guests." : "New arrivals will appear here."}</p>
                </div>
              )}
            </div>
            <footer className="bistro-panel-footer">
              <span>{guestsLoaded ? `${filtered.length} parties shown` : "Loading parties…"}</span>
              <span>
                <i className="bistro-dot" /> Refreshes every 5 seconds
              </span>
            </footer>
            </>}
          </section>
        </div>
        <footer className="bistro-page-footer">
          <span>
            MO BISTRO <span> / District 5</span>
          </span>
          <span>Thoughtful service, from arrival to goodbye.</span>
        </footer>
      </div>
      {showBackToTop && (
        <button type="button" className="reception-back-to-top" onClick={() => {
          window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
        }}>
          <ArrowUp size={16} aria-hidden="true" /> Back to top
        </button>
      )}
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
          pendingAction={pendingAction?.id === selectedGuest.id ? pendingAction.action : null}
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
      {showQR && <RegistrationQrDialog onClose={() => setShowQR(false)} />}

      {showAdd && (
        <div className="bistro-dialog-scope fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 p-4">
          <div
            ref={addDialog}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label="Add guest"
            className="bistro-add-card max-h-full w-full max-w-md overflow-y-auto rounded-2xl border border-white/10 bg-[#17202A] p-6 shadow-2xl"
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
            <form id="staff-add-guest-form" onSubmit={addGuest} className="space-y-4">
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
