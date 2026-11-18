"use client";
import { useEffect, useRef } from "react";
import { useConfirmation } from "@/components/confirmation-provider";
import { Clock3, MessageCircle, Phone, Users, X } from "lucide-react";
import {
  failureDetail,
  messageFailed,
  messageLabel,
  needsPhone,
  partyTime,
  partyWhatsApp,
  subscriptionLabel,
  type Party,
  type ActionHandler,
} from "@/lib/pilot/queue";
import { Primary, Seat, Undo } from "./queue-controls";
import styles from "./pilot.module.css";
export function PilotDrawer({
  party,
  now,
  busy,
  onAction,
  onClose,
}: {
  party: Party;
  now: number;
  busy: boolean;
  onAction: ActionHandler;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const confirm = useConfirmation();
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    element.showModal();
    return () => {
      element.close();
      document.body.style.overflow = previous;
    };
  }, []);
  const disabled = busy || !!party.pending_exit_kind;
  async function removeGuest(noShow: boolean) {
    if (disabled || !dialog.current) return;
    const confirmed = await confirm({
      title: noShow ? "Mark guest as no-show?" : "Cancel booking?",
      message: noShow
        ? `Mark ${party.name} as no-show? They will leave the active queue.`
        : `Cancel ${party.name}'s booking? They will leave the active queue.`,
      confirmLabel: noShow ? "Mark no-show" : "Cancel booking",
      destructive: true,
      container: dialog.current,
    });
    if (confirmed) onAction(party.id, noShow ? "no_show" : "cancel");
  }
  return (
    <dialog
      ref={dialog}
      className={styles.drawer}
      aria-labelledby="pilot-guest-heading"
      onClose={(e) => {
        if (!e.currentTarget.open) onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          const r = e.currentTarget.getBoundingClientRect();
          if (
            e.clientX < r.left ||
            e.clientX > r.right ||
            e.clientY < r.top ||
            e.clientY > r.bottom
          )
            onClose();
        }
      }}
    >
      <header className={styles.drawerHeader}>
        <div>
          <h2 id="pilot-guest-heading">{party.name}</h2>
          <p>
            {party.called_at
              ? `Notified ${partyTime(party.called_at)}`
              : "Waiting"}{" "}
            · Booking #{party.id}
          </p>
        </div>
        <button
          className={styles.iconButton}
          onClick={onClose}
          aria-label="Close guest details"
        >
          <X size={21} />
        </button>
      </header>
      <dl className={styles.drawerFacts}>
        <div>
          <dt>
            <Users size={17} />
            Party
          </dt>
          <dd>
            {party.party_size} guests · {party.preference}
          </dd>
        </div>
        <div>
          <dt>
            <Phone size={17} />
            Phone
          </dt>
          <dd>
            <a
              href={"tel:" + party.phone}
              onClick={(e) => {
                if (disabled) e.preventDefault();
                else onAction(party.id, "phone_call");
              }}
            >
              {party.phone}
            </a>
          </dd>
        </div>
        <div>
          <dt>
            <MessageCircle size={17} />
            WhatsApp
          </dt>
          <dd className={messageFailed(party) ? styles.failed : ""}>
            {subscriptionLabel(party)}
            {party.message_status && (
              <>
                <br />
                {messageLabel(party)}
              </>
            )}
          </dd>
        </div>
        <div>
          <dt>
            <Clock3 size={17} />
            Joined
          </dt>
          <dd>{partyTime(party.joined_at)}</dd>
        </div>
      </dl>
      {needsPhone(party) && (
        <p className={styles.callNotice}>
          {failureDetail(party) ||
            "No WhatsApp subscription. Call this guest directly."}
        </p>
      )}
      <div className={styles.drawerControls} aria-busy={busy}>
        <Seat party={party} busy={busy} onAction={onAction} />
        {party.status === "waiting" && (
          <Primary party={party} busy={busy} onAction={onAction} />
        )}
        <div className={styles.two}>
          <a
            href={"tel:" + party.phone}
            aria-disabled={disabled}
            onClick={(e) => {
              if (disabled) e.preventDefault();
              else onAction(party.id, "phone_call");
            }}
            className={`${styles.secondary} ${needsPhone(party) ? styles.callProminent : ""}`}
          >
            <Phone size={17} />
            Call guest
          </a>
          <a
            className={styles.secondary}
            href={partyWhatsApp(party)}
            target="_blank"
            rel="noreferrer"
            aria-disabled={disabled}
            onClick={(e) => {
              if (disabled) e.preventDefault();
            }}
          >
            <MessageCircle size={17} />
            Open WhatsApp
          </a>
        </div>
        {party.status === "waiting" && needsPhone(party) && (
          <>
            <button
              className={styles.secondary}
              disabled={disabled}
              onClick={() => onAction(party.id, "guest_informed")}
            >
              Guest informed
            </button>
            <small className={styles.hint}>
              Confirm only after speaking to the guest in person or by phone.
              Seating does not require a call or message.
            </small>
          </>
        )}
        {!party.whatsapp_consent && (
          <small className={styles.hint}>
            Guest script: “Scan your status link, then send the prepared
            WhatsApp message to get your table-ready text.”
          </small>
        )}
      </div>
      <div className={styles.drawerDanger}>
        <Undo party={party} now={now} busy={busy} onAction={onAction} />
        <div className={styles.two}>
          <button
            type="button"
            className={styles.danger}
            disabled={disabled}
            onClick={() => void removeGuest(true)}
          >
            No-show
          </button>
          <button
            type="button"
            className={styles.danger}
            disabled={disabled}
            onClick={() => void removeGuest(false)}
          >
            Cancel booking
          </button>
        </div>
      </div>
    </dialog>
  );
}
