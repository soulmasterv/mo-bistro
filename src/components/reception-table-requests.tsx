"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import SeatGuestModal from "@/components/seat-guest-modal";
import { reconcileRequestIds } from "@/lib/request-notifications";

type RequestItem = {
  id: number;
  inventory_mode?: "simple" | "detailed";
  table_id: number | null;
  request_area?: "indoor" | "outdoor" | null;
  table_name?: string;
  requested_by?: string;
  requested_at?: string;
};

type SuggestedGuest = {
  id: number;
  name: string;
  party_size: number;
  seating_preference: string;
};
type ApprovedTable = { name: string; guest: SuggestedGuest | null };

export default function ReceptionTableRequests() {
  const [requests, setRequests] = useState<RequestItem[]>([]);
  const [notificationPanelOpen, setNotificationPanelOpen] = useState(false);
  const [unreadRequestIds, setUnreadRequestIds] = useState<Set<number>>(
    new Set(),
  );
  const unreadIdsRef = useRef(new Set<number>());
  const refreshController = useRef<AbortController | null>(null);
  const unreadRequestCount = unreadRequestIds.size;
  const knownRequestIds = useRef<Set<number> | null>(null);
  const notificationPanelOpenRef = useRef(false);
  const [tables, setTables] = useState<
    Array<{
      id: number;
      name: string;
      area: string;
      status: string;
    }>
  >([]);
  const [selectedTables, setSelectedTables] = useState<Record<number, number>>(
    {},
  );
  const [approved, setApproved] = useState<ApprovedTable | null>(null);
  const [seatingGuest, setSeatingGuest] = useState<SuggestedGuest | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const audio = useRef<AudioContext | null>(null);
  const soundRef = useRef(false);

  function chime() {
    if (!soundRef.current || !audio.current) return;
    const ctx = audio.current;
    if (ctx.state !== "running") return;
    for (const [index, frequency] of [660, 880].entries()) {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = ctx.currentTime + index * 0.17;
      oscillator.frequency.value = frequency;
      oscillator.type = "sine";
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.3, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.25);
      oscillator.connect(gain).connect(ctx.destination);
      oscillator.start(start);
      oscillator.stop(start + 0.26);
    }
  }

  async function enableSound() {
    try {
      const ctx = audio.current ?? new AudioContext();
      await ctx.resume();
      audio.current = ctx;
      soundRef.current = true;
      setSoundEnabled(true);
      localStorage.setItem("mo-bistro-reception-sound", "on");
      chime();
    } catch {
      setError("Audio is unavailable in this browser.");
    }
  }

  function mute() {
    soundRef.current = false;
    setSoundEnabled(false);
    localStorage.setItem("mo-bistro-reception-sound", "off");
  }

  const refresh = useCallback(async (force = false) => {
    if (refreshController.current && !force) return;
    refreshController.current?.abort();
    const controller = new AbortController();
    refreshController.current = controller;
    try {
      const response = await fetch("/api/reception/table-requests", {
        signal: controller.signal,
        cache: "no-store",
        credentials: "same-origin",
      });
      if (!response.ok) {
        const failure = await response.json().catch(() => ({}));
        throw new Error(failure.error || "Unable to load table requests.");
      }
      const data = await response.json();
      const raw: RequestItem[] = Array.isArray(data)
        ? data
        : Array.isArray(data.requests)
          ? data.requests
          : [];
      const list = [
        ...new Map(
          raw.map((item) => [
            Number(item.id),
            {
              ...item,
              id: Number(item.id),
              table_id: item.table_id === null ? null : Number(item.table_id),
            },
          ]),
        ).values(),
      ].filter((item) => Number.isSafeInteger(item.id) && item.id > 0);
      if (controller.signal.aborted) return;
      const currentIds = new Set(list.map((item) => item.id));
      const reconciled = reconcileRequestIds(
        currentIds,
        knownRequestIds.current,
        unreadIdsRef.current,
        notificationPanelOpenRef.current,
      );
      if (reconciled.added.length > 0) chime();
      unreadIdsRef.current = reconciled.unread;
      setUnreadRequestIds(reconciled.unread);
      knownRequestIds.current = currentIds;
      setRequests(list);

      if (
        !list.some(
          (item) => item.request_area && item.inventory_mode !== "simple",
        )
      ) {
        setTables([]);
        setError("");
        return;
      }
      const tablesResponse = await fetch("/api/tables", {
        signal: controller.signal,
        cache: "no-store",
        credentials: "same-origin",
      });

      if (!tablesResponse.ok)
        throw new Error("Unable to load occupied tables for area requests.");
      if (tablesResponse.ok) {
        const tableData = await tablesResponse.json();
        if (!controller.signal.aborted)
          setTables(
            Array.isArray(tableData) ? tableData : (tableData.tables ?? []),
          );
      }
      if (!controller.signal.aborted) setError("");
    } catch (err) {
      if (!controller.signal.aborted)
        setError(
          err instanceof Error ? err.message : "Unable to refresh requests.",
        );
    } finally {
      if (refreshController.current === controller)
        refreshController.current = null;
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 3000);
    const onChanged = (event: Event) => {
      if ((event as CustomEvent).detail !== "reception-requests")
        void refresh(true);
    };
    window.addEventListener("mo-bistro-tables-changed", onChanged);
    return () => {
      clearInterval(timer);
      refreshController.current?.abort();
      refreshController.current = null;
      window.removeEventListener("mo-bistro-tables-changed", onChanged);
    };
  }, [refresh]);

  useEffect(() => {
    if (localStorage.getItem("mo-bistro-reception-sound") !== "on") return;
    let active = true;
    async function unlock() {
      try {
        const ctx = audio.current ?? new AudioContext();
        await ctx.resume();
        if (!active) {
          if (!audio.current) void ctx.close();
          return;
        }
        audio.current = ctx;
        soundRef.current = true;
        setSoundEnabled(true);
        cleanup();
      } catch {
        // A later user interaction can retry.
      }
    }
    function cleanup() {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    }
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    return () => {
      active = false;
      cleanup();
    };
  }, []);

  useEffect(
    () => () => {
      void audio.current?.close();
    },
    [],
  );

  async function review(id: number, decision: "approve" | "reject") {
    if (busyId !== null) return;
    const item = requests.find((entry) => entry.id === id);

    if (
      decision === "approve" &&
      item?.request_area &&
      item.inventory_mode !== "simple" &&
      !selectedTables[id]
    ) {
      setError("Select the occupied table to release.");
      return;
    }

    setBusyId(id);
    try {
      if (
        decision === "approve" &&
        item?.request_area &&
        item.inventory_mode !== "simple"
      ) {
        const latestResponse = await fetch("/api/tables", {
          cache: "no-store",
          credentials: "same-origin",
        });

        if (!latestResponse.ok) {
          throw new Error("Unable to verify current table availability.");
        }

        const latestData = await latestResponse.json();
        const latestTables = Array.isArray(latestData)
          ? latestData
          : Array.isArray(latestData.tables)
            ? latestData.tables
            : [];

        const selected = latestTables.find(
          (table: { id: number; status: string; area: string }) =>
            Number(table.id) === selectedTables[id],
        );

        if (
          !selected ||
          selected.status !== "occupied" ||
          String(selected.area).toLowerCase() !== item.request_area
        ) {
          setTables(latestTables);
          setSelectedTables((previous) => {
            const next = { ...previous };
            delete next[id];
            return next;
          });
          throw new Error(
            "That table is no longer occupied. Select another occupied table.",
          );
        }
      }

      const response = await fetch(`/api/reception/table-requests/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          action: decision,
          ...(item?.request_area ? { table_id: selectedTables[id] } : {}),
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        await refresh(true);
        setSelectedTables((previous) => {
          const next = { ...previous };
          delete next[id];
          return next;
        });
        throw new Error(result.error || "Request update failed.");
      }
      window.dispatchEvent(
        new CustomEvent("mo-bistro-tables-changed", {
          detail: "reception-requests",
        }),
      );
      await refresh(true);
      if (decision === "approve") {
        if (item?.inventory_mode === "simple") {
          setApproved({
            name: `${item.request_area === "outdoor" ? "Outdoor" : "Indoor"} area`,
            guest: null,
          });
          return;
        }
        if (item) {
          const actualId = item.request_area
            ? selectedTables[id]
            : item.table_id;

          const actualTable = tables.find((table) => table.id === actualId);
          const actualName =
            actualTable?.name || item.table_name || `Table ${actualId}`;

          setApproved({ name: actualName, guest: null });
          try {
            const next = await fetch(
              `/api/reception/next-guest?table_id=${actualId}`,
              { cache: "no-store" },
            );
            if (!next.ok) throw new Error("Unable to check the guest queue.");
            const data = await next.json();
            setApproved({ name: actualName, guest: data.guest ?? null });
          } catch {
            setError(
              "Table approved, but the next guest could not be checked. Use the regular reception queue.",
            );
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request update failed.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      {approved && (
        <aside
          role="status"
          aria-live="polite"
          className="mb-4 w-full rounded-2xl border border-[#D6B681] bg-[#FFFCF7] p-5 text-[#293126] shadow-2xl"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-serif text-2xl">Table is free!</h2>
              <p className="mt-1 text-sm">
                {approved.name} is available for the next guest.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setApproved(null)}
              aria-label="Close confirmation"
              className="rounded-lg border border-[#C9C8BD] px-3 py-1.5 text-sm"
            >
              ✕
            </button>
          </div>

          {approved.guest ? (
            <div className="mt-4 rounded-xl bg-[#F1EBDF] p-4">
              <p className="text-xs font-semibold uppercase tracking-wider">
                Next eligible guest
              </p>

              <p className="mt-2 text-lg font-semibold">
                {approved.guest.name}
              </p>

              <p className="text-sm">
                {approved.guest.party_size} guests ·{" "}
                {approved.guest.seating_preference}
              </p>

              <button
                type="button"
                onClick={() => {
                  setSeatingGuest(approved.guest);
                  setApproved(null);
                }}
                className="mt-4 min-h-11 w-full rounded-xl bg-[#293126] px-4 font-semibold text-white"
              >
                Seat Guest
              </button>
            </div>
          ) : (
            <p className="mt-4 text-sm text-[#666A60]">
              Choose the next eligible party from the reception queue.
            </p>
          )}
        </aside>
      )}
      {seatingGuest && (
        <SeatGuestModal
          guest={seatingGuest}
          onClose={() => setSeatingGuest(null)}
          onSuccess={() => {
            setSeatingGuest(null);
            window.dispatchEvent(new Event("guest-seated"));
          }}
        />
      )}

      {requests.length === 0 && error && (
        <p role="alert" className="bistro-alert">
          {error}
        </p>
      )}
      {requests.length > 0 && (
        <div className="bistro-panel bistro-readiness-heading">
          {error && !notificationPanelOpen && (
            <p
              role="alert"
              className="max-w-xs rounded-lg bg-[#17202A] p-3 text-sm text-red-200"
            >
              {error}
            </p>
          )}
          <div>
            <h2 className="font-semibold">Table readiness</h2>
            <p className="mt-1 text-sm text-slate-400">
              Review waiter requests and keep the floor moving.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              const next = !notificationPanelOpenRef.current;
              notificationPanelOpenRef.current = next;
              setNotificationPanelOpen(next);

              if (next) {
                unreadIdsRef.current = new Set();
                setUnreadRequestIds(new Set());
              }
            }}
            aria-label={`Table requests: ${requests.length} pending, ${unreadRequestCount} unread`}
            aria-controls="table-request-notifications"
            aria-expanded={notificationPanelOpen}
            className="flex min-h-12 items-center gap-3 rounded-xl border border-[#C5A77B] bg-[#17202A] px-4 py-3 text-base font-semibold text-white shadow-xl"
          >
            <span className="relative" aria-hidden="true">
              🔔
              {unreadRequestCount > 0 && (
                <span className="absolute -right-2 -top-2 flex h-6 min-w-6 items-center justify-center rounded-full bg-red-500 px-1 text-xs font-bold text-white">
                  {unreadRequestCount > 9 ? "9+" : unreadRequestCount}
                </span>
              )}
            </span>
            <span>
              {requests.length > 0
                ? `${requests.length} pending`
                : "Table-ready requests"}
            </span>
          </button>
        </div>
      )}

      {requests.length > 0 && notificationPanelOpen && (
        <section
          id="table-request-notifications"
          className="bistro-panel bistro-request-panel"
        >
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-semibold">
              Table-ready requests ({requests.length})
            </h2>
            <button
              onClick={soundEnabled ? mute : () => void enableSound()}
              className="rounded-lg border border-white/20 px-3 py-2 text-xs"
            >
              {soundEnabled ? "Mute" : "Enable sound"}
            </button>
          </div>
          {error && (
            <p role="alert" className="mt-3 text-sm text-red-300">
              {error}
            </p>
          )}
          {requests.length === 0 ? (
            <p className="mt-3 text-sm text-slate-300">
              No pending table requests.
            </p>
          ) : (
            <div className="mt-4 space-y-3">
              {requests.map((item) => (
                <div
                  key={item.id}
                  className="rounded-lg border border-white/10 p-3"
                >
                  <p className="font-semibold">
                    {item.table_name || `Table ${item.table_id}`}
                  </p>
                  <p className="mt-1 text-xs text-slate-300">
                    Ready to clear · {item.requested_by || "staff"}
                  </p>

                  {item.request_area && item.inventory_mode !== "simple" && (
                    <label className="mt-3 block text-xs text-white">
                      Select the occupied {item.request_area} table
                      <select
                        value={selectedTables[item.id] || ""}
                        onChange={(event) =>
                          setSelectedTables((previous) => ({
                            ...previous,
                            [item.id]: Number(event.target.value),
                          }))
                        }
                        className="mt-2 w-full rounded-lg bg-white p-3 text-sm text-[#293126]"
                      >
                        <option value="">Choose table...</option>
                        {tables
                          .filter(
                            (table) =>
                              table.area?.toLowerCase() === item.request_area &&
                              table.status === "occupied",
                          )
                          .map((table) => (
                            <option key={table.id} value={table.id}>
                              {table.name}
                            </option>
                          ))}
                      </select>
                    </label>
                  )}
                  <div className="mt-3 flex gap-2">
                    <button
                      disabled={busyId !== null}
                      onClick={() => void review(item.id, "approve")}
                      className="flex-1 rounded-lg bg-[#D6B681] p-3 font-semibold text-[#293126] disabled:opacity-50"
                    >
                      Approve
                    </button>
                    <button
                      disabled={busyId !== null}
                      onClick={() => void review(item.id, "reject")}
                      className="flex-1 rounded-lg border border-white/30 p-3 disabled:opacity-50"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </>
  );
}
