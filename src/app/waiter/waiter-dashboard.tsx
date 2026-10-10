"use client";
import Link from "next/link";
import WaiterRequestNotifications from "@/components/waiter-request-notifications";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Clock3,
  RefreshCw,
  UtensilsCrossed,
} from "lucide-react";

type RestaurantTable = {
  id: number;
  name: string;
  seats: number;
  area: string;
  status: string;
};

type Filter = "all" | "occupied" | "free";

export default function WaiterPage() {
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [pendingTableIds, setPendingTableIds] = useState<number[]>([]);
  const [viewMode, setViewMode] = useState<"simple" | "detailed">("detailed");
  const [filter, setFilter] = useState<Filter>("all");
  const [areaFilter, setAreaFilter] = useState<"all" | "indoor" | "outdoor">("all");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [confirmTable, setConfirmTable] = useState<RestaurantTable | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [unauthorized, setUnauthorized] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/tables", {
        cache: "no-store",
        credentials: "same-origin",
      });

      if (response.status === 401 || response.status === 403) {
        setUnauthorized(true);
        throw new Error("Please sign in with your staff account.");
      }

      if (!response.ok) {
        throw new Error("Could not load restaurant tables.");
      }

      const data: unknown = await response.json();

      const record =
        data && typeof data === "object"
          ? (data as Record<string, unknown>)
          : {};

      const raw = Array.isArray(data)
        ? data
        : Array.isArray(record.tables)
          ? record.tables
          : Array.isArray(record.data)
            ? record.data
            : null;

      if (!raw) {
        throw new Error("Unexpected table API response.");
      }

      const normalized: RestaurantTable[] = raw
        .filter(
          (item): item is Record<string, unknown> =>
            !!item && typeof item === "object" && !Array.isArray(item)
        )
        .map((item) => ({
          id: Number(item.id),
          name: String(item.name ?? `Table ${item.id}`),
          seats: Number(item.seats ?? 0),
          area: String(item.area ?? "indoor").toLowerCase(),
          status: String(item.status ?? "free").toLowerCase(),
        }))
        .filter((table) => Number.isSafeInteger(table.id));

      setTables(normalized);
      const requestResponse = await fetch("/api/waiter/table-requests", {
        cache: "no-store",
        credentials: "same-origin",
      });
      if (requestResponse.ok) {
        const requestData = await requestResponse.json();
        const pendingIds = (Array.isArray(requestData.requests) ? requestData.requests : [])
          .filter((request: { status: string }) => request.status === "pending")
          .map((request: { table_id: number }) => Number(request.table_id));
        setPendingTableIds(pendingIds);
      }
      setError("");
      setUnauthorized(false);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to refresh tables."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    let running = false;

    async function update() {
      if (!active || running || document.visibilityState !== "visible") {
        return;
      }

      running = true;

      try {
        await refresh();
      } finally {
        running = false;
      }
    }

    function onVisibilityChange() {
      if (document.visibilityState === "visible") {
        void update();
      }
    }

    void update();

    const timer = window.setInterval(() => {
      void update();
    }, 3000);

    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      active = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [refresh]);

  const occupied = tables.filter((t) => t.status === "occupied").length;
  const free = tables.filter((t) => t.status === "free").length;

  const visible = useMemo(
    () =>
      tables.filter(
        (table) =>
          (filter === "all" || table.status === filter) &&
          (areaFilter === "all" || table.area === areaFilter)
      ),
    [tables, filter, areaFilter]
  );

  async function markReady(table: RestaurantTable) {
    if (busyId !== null || table.status !== "occupied") return;

    setConfirmTable(null);

    setBusyId(table.id);
    setError("");
    setNotice("");

    try {
      const response = await fetch(
        `/api/waiter/tables/${table.id}/request-ready`,
        {
          method: "POST",
          credentials: "same-origin",
        }
      );

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(result.error || "Unable to request table approval.");
      }

      setNotice(`${table.name}: request sent to reception. Awaiting approval.`);
      await refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to mark table ready."
      );
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main className="min-h-screen bg-[#F4F0E9] text-[#30362B]">
      <header className="bg-[#30362B] px-5 pb-8 pt-6 text-[#F9F4E9] sm:px-8">
        <div className="mx-auto max-w-6xl">
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={async () => {
                try {
                  const response = await fetch("/api/auth/logout", { method: "POST" });
                  if (!response.ok) throw new Error("Logout failed.");
                  window.location.href = "/login";
                } catch {
                  setError("Could not log out. Please try again.");
                }
              }}
              className="flex min-h-11 items-center gap-2 text-sm text-[#E4DDCD]"
            >
              Log Out
            </button>

            <span className="rounded-full border border-[#777D6B] px-3 py-2 text-[10px] font-semibold tracking-[0.2em]">
              DISTRICT 5
            </span>
          </div>

          <div className="mt-7 flex items-center gap-3">
            <UtensilsCrossed size={22} className="text-[#D6B681]" />
            <span className="text-xs font-semibold tracking-[0.25em] text-[#D6B681]">
              MO BISTRO
            </span>
          </div>

          <h1 className="mt-4 font-serif text-4xl sm:text-5xl">
            Table management.
          </h1>

          <p className="mt-3 max-w-lg text-sm leading-6 text-[#D9D9CF]">
            Keep reception informed. Mark a table ready once it has
            been cleared and prepared for the next guests.
          </p>

          <div className="mt-7 grid grid-cols-3 gap-2 sm:max-w-xl sm:gap-4">
            {[
              { label: "Total", value: tables.length },
              { label: "Available", value: free },
              { label: "Occupied", value: occupied },
            ].map((stat) => (
              <div
                key={stat.label}
                className="rounded-2xl border border-[#666D5E] bg-[#3D4436] p-3 sm:p-5"
              >
                <div className="font-serif text-3xl text-[#F9F4E9]">
                  {stat.value}
                </div>
                <div className="mt-1 text-xs text-[#D5D4C7]">
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-4 py-6 sm:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-serif text-2xl">Restaurant floor</h2>
            <p className="mt-1 text-xs text-[#77796F]">
              Live updates · Every 3 seconds
            </p>
          </div>

          <button
            type="button"
            onClick={() => void refresh()}
            className="flex min-h-11 items-center gap-2 rounded-full border border-[#C9C8BD] px-4 text-sm"
          >
            <RefreshCw size={16} />
            Refresh
          </button>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2" role="group" aria-label="Table view mode">
          {(["simple", "detailed"] as const).map((mode) => (
            <button key={mode} type="button" onClick={() => setViewMode(mode)}
              aria-pressed={viewMode === mode}
              className={`min-h-11 rounded-full px-5 text-sm font-semibold ${viewMode === mode ? "bg-[#30362B] text-white" : "border border-[#D7D3C8] bg-white text-[#30362B]"}`}>
              {mode === "simple" ? "Simple view" : "Detailed view"}
            </button>
          ))}
        </div>

        <div className="mt-6 flex gap-2 overflow-x-auto pb-2">
          {(
            [
              ["all", "All tables"],
              ["occupied", "Occupied"],
              ["free", "Available"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setFilter(value)}
              className={`min-h-11 shrink-0 rounded-full px-5 text-sm font-medium ${
                filter === value
                  ? "bg-[#30362B] text-white"
                  : "border border-[#D7D3C8] bg-white text-[#30362B]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="mt-2 flex gap-2 overflow-x-auto pb-2">
          {(
            [
              ["all", "All areas"],
              ["indoor", "Indoor"],
              ["outdoor", "Outdoor"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setAreaFilter(value)}
              className={`min-h-11 shrink-0 rounded-full px-5 text-sm font-medium ${
                areaFilter === value
                  ? "bg-[#30362B] text-white"
                  : "border border-[#D7D3C8] bg-white text-[#30362B]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {error && (
          <div
            role="alert"
            className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
          >
            {error}
            {unauthorized && (
              <Link href="/login" className="ml-2 font-semibold underline">
                Sign in
              </Link>
            )}
          </div>
        )}

        {notice && (
          <div
            role="status"
            className="mt-4 rounded-xl border border-[#CBD8BE] bg-[#E8F1DF] p-4 text-sm"
          >
            {notice}
          </div>
        )}

        {loading ? (
          <p className="py-12 text-center text-sm">Loading tables...</p>
        ) : visible.length === 0 ? (
          <p className="py-12 text-center text-sm text-[#77796F]">
            No tables in this category.
          </p>
        ) : viewMode === "simple" ? (
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {visible.map((table) => {
              const pending = table.status === "occupied" && pendingTableIds.includes(table.id);
              return (
                <article key={table.id} className={`rounded-xl border p-4 text-center ${pending ? "border-amber-300 bg-amber-50" : table.status === "occupied" ? "border-[#E4CBA8] bg-[#F5E9D8]" : "border-[#CBD8BE] bg-[#E9F0E3]"}`}>
                  <h3 className="break-words font-semibold">{table.name}</h3>
                  <p className="mt-2 text-xs">{pending ? "Awaiting approval" : table.status === "occupied" ? "Occupied" : "Available"}</p>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="mt-5 grid grid-cols-1 gap-3 min-[390px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {visible.map((table) => {
              const isOccupied = table.status === "occupied";
              const isPending = isOccupied && pendingTableIds.includes(table.id);

              return (
                <article
                  key={table.id}
                  className="flex min-w-0 flex-col rounded-2xl border border-[#DDD8CB] bg-[#FFFCF7] p-4 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="break-words font-serif text-2xl">
                        {table.name}
                      </h3>
                      <p className="mt-1 text-xs capitalize text-[#85867C]">
                        {table.area} · {table.seats} seats
                      </p>
                    </div>

                    {isOccupied ? (
                      <Clock3
                        size={22}
                        className="shrink-0 text-[#B28B55]"
                      />
                    ) : (
                      <CheckCircle2
                        size={22}
                        className="shrink-0 text-[#66815E]"
                      />
                    )}
                  </div>

                  <div
                    className={`mt-5 rounded-lg px-3 py-2 text-center text-xs font-semibold ${
                      isOccupied
                        ? "bg-[#F5E9D8] text-[#8D6234]"
                        : "bg-[#E9F0E3] text-[#55704B]"
                    }`}
                  >
                    {isPending ? "Awaiting reception approval" : isOccupied ? "Occupied" : "Available"}
                  </div>

                  <button
                    type="button"
                    disabled={!isOccupied || isPending || busyId !== null}
                    onClick={() => setConfirmTable(table)}
                    className={`mt-3 min-h-12 w-full rounded-xl text-sm font-semibold ${
                      isOccupied
                        ? "bg-[#30362B] text-white disabled:opacity-50"
                        : "cursor-default bg-[#E8E8E0] text-[#7B8175]"
                    }`}
                  >
                    {busyId === table.id
                      ? "Sending request..."
                      : isPending
                        ? "Awaiting approval"
                      : isOccupied
                        ? "Request table ready"
                        : "Already ready"}
                  </button>
                </article>
              );
            })}
          </div>
        )}
      </section>
      {confirmTable && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="presentation">
          <div role="dialog" aria-modal="true" aria-labelledby="ready-confirm-title" className="w-full max-w-sm rounded-3xl bg-[#FFFCF7] p-7 text-[#30362B] shadow-2xl">
            <h2 id="ready-confirm-title" className="font-serif text-3xl">Table ready?</h2>
            <p className="mt-3 text-sm leading-6 text-[#666D5E]">Send a request to reception to mark <strong>{confirmTable.name}</strong> as available? The table will remain occupied until reception approves.</p>
            <div className="mt-7 flex gap-3">
              <button type="button" onClick={() => setConfirmTable(null)} className="min-h-12 flex-1 rounded-xl border border-[#C9C8BD] font-semibold">Cancel</button>
              <button type="button" disabled={busyId !== null} onClick={() => void markReady(confirmTable)} className="min-h-12 flex-1 rounded-xl bg-[#30362B] px-3 font-semibold text-white disabled:opacity-50">Send request</button>
            </div>
          </div>
        </div>
      )}
      <WaiterRequestNotifications />
    </main>
  );
}
