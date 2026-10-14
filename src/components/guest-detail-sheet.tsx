"use client";
import GuestEtaEditor from "@/components/guest-eta-editor";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, Phone, Users, MessageCircle, Clock, ChevronDown, CheckCircle2 } from "lucide-react";
import { guestDialHref } from "@/lib/guest-phone";
import { useStaffDialog } from "@/lib/use-staff-dialog";

type Guest = {
  id: number;
  name: string;
  phone: string;
  party_size: number;
  seating_preference: string;
  status: string;
  confirmed: number;
  confirmation_required?: boolean;
  created_at: string;
  source?: string;
  eta_at?: string | null;
};
type WhatsApp = {
  available: boolean;
  subscribed?: boolean;
  feedback_consent?: boolean;
  confirmation_consent?: boolean;
  opted_out?: boolean;
};
export default function GuestDetailSheet({
  guest,
  busy,
  pendingAction,
  error,
  onClose,
  onSeat,
  onAction,
  onRefresh,
}: {
  guest: Guest;
  busy: boolean;
  pendingAction?: "call" | "confirm" | "cancel" | "no_show" | null;
  error: string;
  onClose: () => void;
  onRefresh: () => void;
  onSeat: () => void;
  onAction: (action: "call" | "confirm" | "cancel" | "no_show") => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useStaffDialog(true, ref, onClose);
  const [whatsapp, setWhatsapp] = useState<WhatsApp | null>(null);
  const [whatsappError, setWhatsappError] = useState("");
  useEffect(() => {
    let controller: AbortController | null = null;
    async function refresh() {
    controller?.abort();
    const current = new AbortController();
    controller = current;
    await fetch(`/api/whatsapp/guests/${guest.id}`, {
      cache: "no-store",
      signal: current.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw Error("WhatsApp status unavailable");
        return response.json();
      })
      .then((data) => {
        if (!current.signal.aborted) { setWhatsapp(data); setWhatsappError(""); }
      })
      .catch(() => {
        if (!current.signal.aborted)
          setWhatsappError("WhatsApp status unavailable");
      });
    }
    const initial = window.setTimeout(() => void refresh(), 0);
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, 5000);
    const focused = () => { if (document.visibilityState === "visible") void refresh(); };
    window.addEventListener("focus", focused);
    return () => { controller?.abort(); window.clearTimeout(initial); window.clearInterval(timer); window.removeEventListener("focus", focused); };
  }, [guest.id]);
  const dial = guestDialHref(guest.phone);
  const egypt = /^01[0125]\d{8}$/.test(guest.phone)
    ? "2" + guest.phone
    : guest.phone.replace(/^00/, "").replace(/^\+/, "");
  const whatsappHref = /^[1-9]\d{7,14}$/.test(egypt)
    ? "https://wa.me/" + egypt
    : null;
  const joined = new Date(guest.created_at);
  return createPortal(
    <div
      className="bistro-dialog-scope queue-sheet-overlay"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="guest-sheet-title"
        tabIndex={-1}
        className="queue-guest-sheet"
      >
        <div className="queue-sheet-handle" aria-hidden="true" />
        <header>
          <div>
            <h2 id="guest-sheet-title">{guest.name}</h2>
            <p>
              {guest.status === "seated" ? "Seated" : guest.status === "called" ? "Called" : "Waiting"} · Booking #
              {guest.id}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close guest details"
          >
            <X size={22} />
          </button>
        </header>
        <dl className="queue-guest-facts">
          <div>
            <dt>
              <Users size={17} />
              Party
            </dt>
            <dd>
              {guest.party_size} guests ·{" "}
              {guest.seating_preference === "any"
                ? "Any seating"
                : guest.seating_preference}
            </dd>
          </div>
          <div>
            <dt>
              <Phone size={17} />
              Phone
            </dt>
            <dd>{guest.phone || "Not provided"}</dd>
          </div>
          <div>
            <dt>
              <MessageCircle size={17} />
              WhatsApp
            </dt>
            <dd>
              {whatsappError ||
                (!whatsapp
                  ? "Loading…"
                  : !whatsapp.available
                    ? "Not enabled"
                    : whatsapp.opted_out
                      ? "Unsubscribed"
                      : whatsapp.subscribed
                        ? "Subscribed to updates"
                        : "Not subscribed")}
            </dd>
          </div>
          {!Number.isNaN(joined.getTime()) && (
            <div>
              <dt>
                <Clock size={17} />
                Joined
              </dt>
              <dd>
                {joined.toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </dd>
            </div>
          )}
        </dl>
        {busy && <p role="status" className="queue-sheet-progress">{pendingAction === "cancel" ? "Cancelling booking…" : pendingAction === "no_show" ? "Marking no-show…" : pendingAction === "call" ? "Marking called…" : pendingAction === "confirm" ? "Confirming booking…" : "Updating booking…"} Please wait.</p>}
        <fieldset disabled={busy} aria-busy={busy} className="queue-sheet-controls">
        <button
          type="button"
          className="bistro-button queue-sheet-seat"
          disabled={busy || guest.status === "seated"}
          onClick={onSeat}
        >
          Seat guest
        </button>
        <div className="queue-sheet-contact">
          {dial && (
            <a className="bistro-button bistro-button-secondary" href={busy ? undefined : dial} aria-disabled={busy} tabIndex={busy ? -1 : undefined}>
              <Phone size={16} />
              Call guest
            </a>
          )}
          {whatsappHref && (
            <a
              className="bistro-button bistro-button-secondary"
              href={busy ? undefined : whatsappHref}
              aria-disabled={busy}
              tabIndex={busy ? -1 : undefined}
              target="_blank"
              rel="noopener noreferrer"
            >
              <MessageCircle size={16} />
              Open WhatsApp
            </a>
          )}
        </div>
        <details className="queue-booking-details">
          <summary>Booking details <ChevronDown className="queue-details-chevron" size={17} aria-hidden="true" /></summary>
          <p>Seating preference: {guest.seating_preference}</p>
          <p>
            {guest.confirmation_required === false
              ? "Confirmation is not required"
              : guest.confirmed === 1
                ? "Booking confirmed"
                : "Awaiting confirmation"}
          </p>
          {guest.eta_at && (
            <p>
              Expected readiness:{" "}
              {new Date(guest.eta_at).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          )}
          {whatsapp?.available && (
            <p>
              Review permission:{" "}
              {whatsapp.feedback_consent ? "Given" : "Not given"}. Automatic
              updates require a guest subscription reply.
            </p>
          )}
          <p>
            Opening WhatsApp does not subscribe this guest or send a message
            automatically.
          </p>
        </details>
        {["waiting","called"].includes(guest.status) && <GuestEtaEditor guestId={guest.id} onSaved={onRefresh} />}
        {guest.status === "waiting" && (
          <button
            type="button"
            disabled={busy}
            className="queue-sheet-text-action"
            onClick={() => onAction("call")}
          >
            <CheckCircle2 size={17} aria-hidden="true" /> {pendingAction === "call" ? "Marking called…" : "Mark called"}
          </button>
        )}
        {guest.confirmation_required !== false && guest.confirmed !== 1 && (
          <button
            type="button"
            disabled={busy || guest.status === "seated"}
            className="queue-sheet-text-action"
            onClick={() => onAction("confirm")}
          >
            {pendingAction === "confirm" ? "Confirming…" : "Confirm booking"}
          </button>
        )}
        {error && (
          <p role="alert" className="bistro-alert">
            {error}
          </p>
        )}
        <div className="queue-sheet-destructive">
          <button
            type="button"
            disabled={busy || guest.status === "seated"}
            onClick={() => onAction("no_show")}
          >
            {pendingAction === "no_show" ? "Marking no-show…" : "No-show"}
          </button>
          <button
            type="button"
            disabled={busy || guest.status === "seated"}
            onClick={() => onAction("cancel")}
          >
            {pendingAction === "cancel" ? "Cancelling…" : "Cancel booking"}
          </button>
        </div>
        </fieldset>
      </div>
    </div>,
    document.body,
  );
}
