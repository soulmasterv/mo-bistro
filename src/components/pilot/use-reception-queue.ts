"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { retryAfterMilliseconds } from "@/lib/retry-after";
import { eventId, fetchWithTimeout } from "@/lib/pilot/client-request";
import type { Party, QueueAction } from "@/lib/pilot/queue";
/** One owner for queue polling, clock updates, and per-guest mutations. */
export function useReceptionQueue() {
  const router = useRouter();
  const [now, setNow] = useState(0);
  const [parties, setParties] = useState<Party[]>([]),
    [error, setError] = useState(""),
    [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<number[]>([]);
  const pending = useRef(new Set<number>());
  // A mutation invalidates any older response so it cannot restore stale rows.
  const refreshVersion = useRef(0);
  const refreshing = useRef(false);
  // Coalesce action-triggered refreshes while one request is already running.
  const refreshQueued = useRef(false);
  const retryAt = useRef(0);
  const scheduleRefresh = useRef<() => void>(() => {});
  const [updatedAt, setUpdatedAt] = useState(0);
  const refresh = useCallback(
    async (signal?: AbortSignal, afterAction = false): Promise<void> => {
      if (signal?.aborted || Date.now() < retryAt.current) return;
      if (refreshing.current) {
        if (afterAction) refreshQueued.current = true;
        return;
      }
      refreshing.current = true;
      try {
        do {
          refreshQueued.current = false;
          const version = ++refreshVersion.current;
          try {
            const r = await fetchWithTimeout(
              "/api/pilot/queue",
              { cache: "no-store", signal },
              15000,
            );
            if (r.status === 401) {
              router.replace("/login");
              return;
            }
            if (r.status === 429) {
              const now = Date.now();
              retryAt.current =
                now +
                (retryAfterMilliseconds(r.headers.get("Retry-After"), now) ||
                  10000);
              throw Error("Queue refresh paused. Retrying automatically…");
            }
            const data = await r.json();
            if (!r.ok) throw Error(data.error || "Queue unavailable.");
            if (!signal?.aborted && version === refreshVersion.current) {
              const received_at = Date.now();
              setParties(data.map((p: Party) => ({ ...p, received_at })));
              setNow(received_at);
              setUpdatedAt(received_at);
              setLoaded(true);
              setError("");
            }
          } catch (e) {
            if (!signal?.aborted && version === refreshVersion.current)
              setError(
                e instanceof Error && e.name === "TimeoutError"
                  ? "Queue update timed out. Retrying…"
                  : e instanceof Error
                    ? e.message
                    : "Queue unavailable.",
              );
          }
        } while (
          refreshQueued.current &&
          !signal?.aborted &&
          Date.now() >= retryAt.current
        );
      } finally {
        refreshing.current = false;
        scheduleRefresh.current();
      }
    },
    [router],
  );
  useEffect(() => {
    const controller = new AbortController();
    let timer: number | undefined;
    const schedule = () => {
      window.clearTimeout(timer);
      if (controller.signal.aborted || document.visibilityState !== "visible")
        return;
      timer = window.setTimeout(
        () => void refresh(controller.signal),
        Math.max(5000, retryAt.current - Date.now()),
      );
    };
    scheduleRefresh.current = schedule;
    const onVisibility = () => {
      if (
        document.visibilityState === "visible" &&
        Date.now() >= retryAt.current
      )
        void refresh(controller.signal);
      else schedule();
    };
    document.addEventListener("visibilitychange", onVisibility);
    void Promise.resolve().then(onVisibility);
    const clock = window.setInterval(() => setNow(Date.now()), 250);
    return () => {
      controller.abort();
      scheduleRefresh.current = () => {};
      window.clearTimeout(timer);
      window.clearInterval(clock);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refresh]);
  async function action(id: number, value: QueueAction, reason?: string) {
    if (pending.current.has(id)) return;
    pending.current.add(id);
    refreshVersion.current++;
    setBusy([...pending.current]);
    setError("");
    try {
      const undo_token =
        value === "undo"
          ? parties.find((p) => p.id === id)?.pending_exit_token
          : undefined;
      const r = await fetchWithTimeout(
        `/api/pilot/parties/${id}`,
        {
          method: "PATCH",
          keepalive: true,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: value,
            ...(undo_token ? { undo_token } : {}),
            ...(reason ? { reason } : {}),
            ...(["phone_call", "retry"].includes(value)
              ? { event_id: eventId() }
              : {}),
          }),
        },
        20000,
      );
      const data = await r.json();
      if (!r.ok) throw Error(data.error || "Action failed.");
      await refresh(undefined, true);
    } catch (e) {
      setError(
        e instanceof Error && e.name === "TimeoutError"
          ? "The action is taking longer than expected. The queue will refresh its result."
          : e instanceof Error
            ? e.message
            : "Action failed.",
      );
    } finally {
      pending.current.delete(id);
      setBusy([...pending.current]);
    }
  }

  return { parties, error, loaded, busy, now, updatedAt, refresh, action };
}
