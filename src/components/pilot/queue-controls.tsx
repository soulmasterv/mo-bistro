"use client";
import { ArrowUpRight } from "lucide-react";
import {
  observedPartyTime,
  type Party,
  type ActionHandler,
} from "@/lib/pilot/queue";
import styles from "./pilot.module.css";
export function Primary({
  party,
  busy,
  onAction,
}: {
  party: Party;
  busy: boolean;
  onAction: ActionHandler;
}) {
  const action = party.message_status ? "retry" : "notify";
  const sending = ["pending", "scheduled", "sending"].includes(
    party.message_status || "",
  );
  const unsafe =
    party.status === "waiting" && party.message_status === "unknown";
  const label = sending
    ? "Sending…"
    : unsafe
      ? "Send unconfirmed"
      : action === "retry"
        ? "Retry"
        : "Notify";
  return (
    <button
      className={styles.secondary}
      disabled={
        busy ||
        !!party.pending_exit_kind ||
        (party.status === "waiting" && (sending || unsafe))
      }
      onClick={() => onAction(party.id, action)}
      aria-label={`${label} ${party.name}`}
    >
      {busy ? "Saving…" : label}
      <ArrowUpRight size={15} />
    </button>
  );
}
export function Seat({
  party,
  busy,
  onAction,
  compact = false,
}: {
  party: Party;
  busy: boolean;
  onAction: ActionHandler;
  compact?: boolean;
}) {
  return (
    <button
      className={styles.button}
      disabled={busy || !!party.pending_exit_kind}
      onClick={() => onAction(party.id, "seated")}
      aria-label={`Seat guest ${party.name}`}
    >
      {busy ? "Saving…" : compact ? "Seat" : "Seat guest"}
      <ArrowUpRight size={15} aria-hidden="true" />
    </button>
  );
}
export function Undo({
  party,
  now,
  busy,
  onAction,
}: {
  party: Party;
  now: number;
  busy: boolean;
  onAction: ActionHandler;
}) {
  if (!party.pending_exit_kind) return null;
  const seconds = Math.max(
    0,
    Math.ceil(
      (new Date(party.pending_exit_at!).getTime() -
        observedPartyTime(party, now)) /
        1000,
    ),
  );
  return (
    <div className={styles.undo} role="status">
      <span>Removal {seconds ? "pending" : "saving…"}</span>
      <button
        className={styles.secondary}
        disabled={busy || !seconds}
        onClick={() => onAction(party.id, "undo")}
      >
        Undo{seconds ? ` (${seconds}s)` : ""}
      </button>
    </div>
  );
}
