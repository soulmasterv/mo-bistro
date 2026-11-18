"use client";
import { calledLabel } from "@/lib/called-label";
import { MoreHorizontal, Phone, Users } from "lucide-react";
import {
  messageFailed,
  messageLabel,
  needsPhone,
  observedPartyTime,
  partyWait,
  type Party,
  type ActionHandler,
} from "@/lib/pilot/queue";
import { Seat, Undo } from "./queue-controls";
import styles from "./pilot.module.css";
const waitStyle = (minutes: number) =>
  minutes >= 30 ? styles.waitRed : minutes >= 15 ? styles.waitAmber : "";
export function PilotQueue({
  parties,
  nextPartyId,
  now,
  busy,
  onAction,
  onOpen,
}: {
  parties: Party[];
  nextPartyId?: number;
  now: number;
  busy: number[];
  onAction: ActionHandler;
  onOpen: (id: number) => void;
}) {
  return (
    <div
      className={styles.tableWrap}
      role="region"
      aria-label="Scrollable reception queue"
      tabIndex={0}
    >
      <table className={styles.queueTable} aria-label="Reception queue">
        <thead>
          <tr>
            <th># · Guest</th>
            <th>Party size</th>
            <th>Preference</th>
            <th>Wait time</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {parties.map((p, index) => {
            const disabled = busy.includes(p.id) || !!p.pending_exit_kind;
            const minutes = partyWait(p, now);
            return (
              <tr
                key={p.id}
                className={p.id === nextPartyId ? styles.nextRow : ""}
              >
                <td className={styles.guestCell}>
                  <span className={styles.rowNumber}>
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <div className={styles.guestName}>
                      <button onClick={() => onOpen(p.id)}>{p.name}</button>
                      {p.id === nextPartyId && (
                        <span className={styles.nextTag}>Next</span>
                      )}
                    </div>
                  </div>
                </td>
                <td data-label="Party">
                  <span className={styles.inline}>
                    <Users size={14} />
                    {p.party_size}
                  </span>
                </td>
                <td data-label="Preference">
                  {p.preference === "indoor"
                    ? "Indoor"
                    : p.preference === "outdoor"
                      ? "Outdoor"
                      : "Any"}
                </td>
                <td data-label="Wait time">
                  <span className={waitStyle(minutes)}>{minutes} min</span>
                </td>
                <td data-label="Status">
                  <div className={styles.statusCell}>
                    <span
                      className={`${styles.pill} ${p.status === "called" ? styles.pillNotified : ""}`}
                    >
                      {p.status === "called"
                        ? calledLabel(p.called_at, observedPartyTime(p, now))
                        : "Waiting"}
                    </span>
                    {messageFailed(p) && (
                      <small title={messageLabel(p)} className={styles.failed}>
                        {messageLabel(p, true)}
                      </small>
                    )}
                  </div>
                </td>
                <td className={styles.rowActions}>
                  <div
                    className={styles.actions}
                    aria-busy={busy.includes(p.id)}
                  >
                    <a
                      href={"tel:" + p.phone}
                      aria-label={`Call ${p.name}`}
                      className={`${styles.secondary} ${needsPhone(p) ? styles.callProminent : ""}`}
                      aria-disabled={disabled}
                      onClick={(e) => {
                        if (disabled) e.preventDefault();
                        else onAction(p.id, "phone_call");
                      }}
                    >
                      <Phone size={15} />
                      Call
                    </a>
                    <Seat
                      party={p}
                      busy={busy.includes(p.id)}
                      onAction={onAction}
                      compact
                    />
                    <button
                      className={styles.secondary}
                      aria-label={`Guest details for ${p.name}`}
                      onClick={() => onOpen(p.id)}
                    >
                      <MoreHorizontal size={18} />
                    </button>
                  </div>
                  <Undo
                    party={p}
                    now={now}
                    busy={busy.includes(p.id)}
                    onAction={onAction}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
