"use client";

import { ArrowUpRight, CheckCircle2, Phone, Users } from "lucide-react";
import { calledLabel } from "@/lib/called-label";
import { guestDialHref } from "@/lib/guest-phone";
import { elapsedWait, guestStatusLabels, type ReceptionGuest } from "@/lib/reception-queue";

type Props = {
  guest: ReceptionGuest;
  position: number;
  isNext: boolean;
  busy: boolean;
  menuOpen: boolean;
  clock: number;
  onDetails: () => void;
  onSeat: () => void;
  onToggleMenu: () => void;
};

export default function ReceptionGuestCard({ guest, position, isNext, busy, menuOpen, clock, onDetails, onSeat, onToggleMenu }: Props) {
  const dialHref = guestDialHref(guest.phone);
  return (
    <article
      className={`bistro-guest-card ${guest.status === "called" ? "is-called" : ""} ${isNext ? "is-next-guest" : ""}`}
    >
      <div className="bistro-guest-main">
        <span
          className="bistro-position"
          aria-label={"Queue position " + position}
        >
          {position.toString().padStart(2, "0")}
        </span>
        <div className="bistro-guest-copy">
          <h3>
            <button
              type="button"
              className="queue-guest-name"
              aria-label={"Guest details for " + guest.name}
              onClick={onDetails}
            >
              {guest.name}
            </button>
            {guest.fits_available&&<span className="queue-next-badge">Table fits</span>}
            {isNext && <span className="queue-next-badge" aria-label="Next guest">Next</span>}
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
            <span className="queue-called-marker">{calledLabel(guest.called_at, clock)}</span>
          )}
        </div>
        <span
          className={`bistro-status ${guest.status === "called" ? "status-called" : guest.status === "seated" ? "status-seated" : "status-waiting"}`}
        >
          <i />
          {guest.status === "waiting"
            ? "Waiting"
            : guestStatusLabels[guest.status]}
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
        <span>{elapsedWait(guest, clock)}</span>
        <span
          className={`reception-status-pill pill-${guest.status}`}
        >
          {guestStatusLabels[guest.status]}
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
          {dialHref ? (
            <a
              href={dialHref}
              aria-label={"Call " + guest.name}
              className="bistro-button bistro-button-secondary"
            >
              <Phone size={15} /> Call
            </a>
          ) : (
            <button
              type="button"
              disabled
              aria-label={"No callable phone number for " + guest.name}
              className="bistro-button bistro-button-secondary"
            >
              <Phone size={15} /> Call
            </button>
          )}
          <button
            disabled={busy || guest.status === "seated"}
            onClick={onSeat}
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
              aria-expanded={menuOpen}
              onClick={onToggleMenu}
            >
              ···
            </button>
          </div>
        </div>
      </div>
    </article>

  );
}
