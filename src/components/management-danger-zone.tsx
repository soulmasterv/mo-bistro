"use client";
import { useRef, useState } from "react";
import { useConfirmation } from "@/components/confirmation-provider";

type Action = "free_tables" | "cancel_queue";
export default function ManagementDangerZone() {
  const confirm = useConfirmation();
  const locked = useRef(false);
  const [busy, setBusy] = useState<Action | null>(null);
  const [message, setMessage] = useState("");
  async function run(action: Action) {
    if (locked.current) return;
    locked.current = true;
    try {
      if (!await confirm(action === "free_tables" ? {
        title: "Free all tables?", confirmLabel: "Free all tables", destructive: true,
        message: "This releases every occupied table in both seating modes and cancels pending table-ready requests. Seated bookings and seating history are preserved. Only proceed after checking the floor.",
      } : {
        title: "Cancel the entire waiting queue?", confirmLabel: "Cancel all waiting bookings", destructive: true,
        message: "All waiting and called bookings will be cancelled and removed from the active queue. Seated guests are kept. Pending notifications for cancelled bookings will be stopped. This cannot be undone here.",
      })) return;
      setBusy(action);
      setMessage("");
      const response = await fetch("/api/management/danger-zone", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, confirm: true }),
      });
      const data = await response.json();
      if (!response.ok) throw Error(data.error || "Reset failed.");
      setMessage(action === "free_tables" ? `${data.freed} tables freed. Seated bookings were preserved.` : `${data.cancelled} waiting/called bookings cancelled. Seated guests were preserved.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Result unavailable. Check the queue and tables before trying again.");
    } finally {
      setBusy(null);
      locked.current = false;
    }
  }
  return <section id="danger-zone" className="bistro-panel space-y-4 p-5" aria-label="Danger zone">
    <h2 className="text-xl font-semibold">Danger zone</h2>
    <p>Manager-only actions affecting the whole restaurant. Confirm each action separately.</p>
    <div className="flex flex-wrap gap-3">
      <button type="button" className="bistro-button bistro-button-danger" disabled={busy !== null} onClick={() => void run("free_tables")}>{busy === "free_tables" ? "Freeing tables…" : "Free all tables"}</button>
      <button type="button" className="bistro-button bistro-button-danger" disabled={busy !== null} onClick={() => void run("cancel_queue")}>{busy === "cancel_queue" ? "Cancelling bookings…" : "Cancel all waiting bookings"}</button>
    </div>
    <p role="status">{message}</p>
  </section>;
}
