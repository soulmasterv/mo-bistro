"use client";
import Link from "next/link";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, RefreshCw, UtensilsCrossed } from "lucide-react";

type RestaurantTable = {
  id: number;
  name: string;
  seats: number;
  area: string;
  status: string;
};

type Filter = "all" | "occupied" | "free";

export default function WaiterPage() {
  const [pools, setPools] = useState<
    Array<{
      area: string;
      total_tables: number;
      occupied_tables: number;
      free_tables: number;
    }>
  >([]);
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [pendingTableIds, setPendingTableIds] = useState<number[]>([]);
  const [pendingAreas, setPendingAreas] = useState<string[]>([]);
  const [busyArea, setBusyArea] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"simple" | "detailed">("detailed");
  const [filter, setFilter] = useState<Filter>("all");
  const [areaFilter, setAreaFilter] = useState<"all" | "indoor" | "outdoor">(
    "all",
  );
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [unauthorized, setUnauthorized] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const modeResponse = await fetch("/api/table-view-mode", {
        cache: "no-store",
        credentials: "same-origin",
      });
      if (modeResponse.status === 401 || modeResponse.status === 403)
        setUnauthorized(true);
      const modeData = await modeResponse.json();
      if (!modeResponse.ok)
        throw new Error(modeData.error || "Could not load table mode.");
      const mode = modeData.mode === "simple" ? "simple" : "detailed";
      const response = await fetch(
        mode === "simple" ? "/api/simple-tables" : "/api/tables",
        { cache: "no-store", credentials: "same-origin" },
      );
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Could not load table availability.");
      if (data.blocked_by_named_inventory) throw new Error(data.warning);
      setViewMode(mode);
      setPools(mode === "simple" ? data.areas : []);
      setTables(mode === "detailed" ? data : []);
      const requestResponse = await fetch("/api/waiter/table-requests", {
        cache: "no-store",
        credentials: "same-origin",
      });
      if (requestResponse.ok) {
        const requestData = await requestResponse.json();
        const pendingIds = (
          Array.isArray(requestData.requests) ? requestData.requests : []
        )
          .filter((request: { status: string }) => request.status === "pending")
          .map((request: { table_id: number }) => Number(request.table_id));
        setPendingTableIds(pendingIds);
        setPendingAreas(
          (Array.isArray(requestData.requests) ? requestData.requests : [])
            .filter(
              (request: { status: string; area?: string }) =>
                request.status === "pending" && !!request.area,
            )
            .map((request: { area: string }) => request.area),
        );
      }
      setError("");
      setUnauthorized(false);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to refresh tables.",
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

  const occupied =
    viewMode === "simple"
      ? pools.reduce((count, pool) => count + pool.occupied_tables, 0)
      : tables.filter((t) => t.status === "occupied").length;
  const free =
    viewMode === "simple"
      ? pools.reduce((count, pool) => count + pool.free_tables, 0)
      : tables.filter((t) => t.status === "free").length;
  const total =
    viewMode === "simple"
      ? pools.reduce((count, pool) => count + pool.total_tables, 0)
      : tables.length;

  const visible = useMemo(
    () =>
      tables.filter(
        (table) =>
          (filter === "all" || table.status === filter) &&
          (areaFilter === "all" || table.area === areaFilter),
      ),
    [tables, filter, areaFilter],
  );

  async function requestAreaReady(area: "indoor" | "outdoor") {
    if (busyArea || pendingAreas.includes(area)) return;

    setBusyArea(area);
    setError("");
    setNotice("");

    try {
      const response = await fetch("/api/waiter/area-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ area }),
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(result.error || "Unable to send area request.");
      }

      setNotice(
        `${area === "indoor" ? "Indoor" : "Outdoor"} request sent to Reception.`,
      );
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed.");
    } finally {
      setBusyArea(null);
    }
  }

  async function markReady(table: RestaurantTable) {
    if (busyId !== null || table.status !== "occupied") return;

    setBusyId(table.id);
    setError("");
    setNotice("");

    try {
      const response = await fetch(
        `/api/waiter/tables/${table.id}/request-ready`,
        {
          method: "POST",
          credentials: "same-origin",
        },
      );

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(result.error || "Unable to request table approval.");
      }

      setNotice(`${table.name}: request sent to reception. Awaiting approval.`);
      await refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to mark table ready.",
      );
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main className="bistro-app">
      <div className="bistro-container">
        <header className="bistro-page-heading">
          <div>
            <p className="bistro-eyebrow">SERVICE OPERATIONS / WAITER</p>
            <h1>
              The floor,
              <br />
              <span>at a glance.</span>
            </h1>
            <p>A clear view of every table. A better flow for every guest.</p>
          </div>
          <div className="bistro-toolbar">
            <span className="bistro-live">
              <i /> Live floor
            </span>
            <button
              className="bistro-button bistro-button-secondary"
              onClick={() => void refresh()}
            >
              <RefreshCw size={17} /> Refresh
            </button>
          </div>
        </header>
        <section className="bistro-stat-grid" aria-label="Floor statistics">
          {[
            {
              label: "Total tables",
              value: total,
              tone: "forest",
              caption: "Across both seating areas",
            },
            {
              label: "Available",
              value: free,
              tone: "green",
              caption: "Ready for the next arrival",
            },
            {
              label: "Occupied",
              value: occupied,
              tone: "gold",
              caption: "Guests are enjoying their visit",
            },
            {
              label: "Pending approval",
              value:
                viewMode === "simple"
                  ? pendingAreas.length
                  : pendingTableIds.length,
              tone: "blue",
              caption: "Waiting for Reception",
            },
          ].map((stat) => (
            <article
              key={stat.label}
              className={`bistro-stat bistro-stat-${stat.tone}`}
            >
              <div className="bistro-stat-top">
                <span>{stat.label}</span>
                <UtensilsCrossed size={18} />
              </div>
              <strong>{stat.value.toString().padStart(2, "0")}</strong>
              <p>{stat.caption}</p>
            </article>
          ))}
        </section>
        <section className="bistro-panel bistro-floor-panel">
          <div className="bistro-panel-heading">
            <div>
              <p className="bistro-eyebrow">CLEAR. PREPARE. WELCOME.</p>
              <h2 id="restaurant-floor">Table is ready</h2>
            </div>
            <span className="bistro-status status-waiting">
              {viewMode === "simple" ? "Simple view" : "Detailed view"}
            </span>
          </div>
          <div className="bistro-floor-toolbar">
            <p className="bistro-muted">
              Send a readiness request once the table has been cleared.
            </p>
            {viewMode === "detailed" && (
              <div className="bistro-filter-groups">
                <div className="bistro-tabs" aria-label="Table status">
                  {(
                    [
                      ["all", "All tables"],
                      ["occupied", "Occupied"],
                      ["free", "Available"],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      aria-pressed={filter === value}
                      onClick={() => setFilter(value)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="bistro-tabs" aria-label="Seating area">
                  {(
                    [
                      ["all", "All areas"],
                      ["indoor", "Indoor"],
                      ["outdoor", "Outdoor"],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      aria-pressed={areaFilter === value}
                      onClick={() => setAreaFilter(value)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          {error && (
            <div role="alert" className="bistro-alert">
              {error}
              {unauthorized && <Link href="/login">Sign in</Link>}
            </div>
          )}
          {notice && (
            <div role="status" className="bistro-success">
              <CheckCircle2 size={17} />
              {notice}
            </div>
          )}
          {loading ? (
            <div className="bistro-empty">Loading your restaurant floor…</div>
          ) : (viewMode === "detailed" ? visible.length === 0 : total === 0) ? (
            <div className="bistro-empty">
              <UtensilsCrossed size={30} />
              <h3>No tables in this category.</h3>
              <p>Choose another filter to see the rest of the floor.</p>
            </div>
          ) : viewMode === "simple" ? (
            <div className="bistro-area-grid">
              {(["indoor", "outdoor"] as const).map((area) => {
                const pool = pools.find((item) => item.area === area);
                const available = pool?.free_tables ?? 0;
                const used = pool?.occupied_tables ?? 0;
                return (
                  <article key={area} className="bistro-area-card">
                    <div className="bistro-area-top">
                      <span className="bistro-area-emblem">
                        {area === "indoor" ? "I" : "O"}
                      </span>
                      <span className="bistro-status status-free">
                        {available} available
                      </span>
                    </div>
                    <h3>
                      {area === "indoor" ? "The dining room" : "The terrace"}
                    </h3>
                    <p className="bistro-muted capitalize">
                      {area} · {pool?.total_tables ?? 0} tables
                    </p>
                    <div className="bistro-area-figures">
                      <strong>
                        {available.toString().padStart(2, "0")}
                        <span>Available</span>
                      </strong>
                      <strong>
                        {used.toString().padStart(2, "0")}
                        <span>Occupied</span>
                      </strong>
                    </div>
                    <div className="bistro-capacity-track">
                      <span
                        style={{
                          width: `${pool?.total_tables ? (used / pool.total_tables) * 100 : 0}%`,
                        }}
                      />
                    </div>
                    <button
                      className="bistro-button"
                      disabled={
                        used === 0 ||
                        busyArea !== null ||
                        pendingAreas.includes(area)
                      }
                      onClick={() => void requestAreaReady(area)}
                    >
                      {busyArea === area
                        ? "Sending..."
                        : pendingAreas.includes(area)
                          ? "Awaiting Reception approval"
                          : `Table is ready — ${area === "indoor" ? "Indoor" : "Outdoor"}`}
                    </button>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="bistro-floor-grid">
              {visible.map((table) => {
                const occupied = table.status === "occupied";
                const pending = occupied && pendingTableIds.includes(table.id);
                return (
                  <article
                    key={table.id}
                    className={`bistro-table-card ${occupied ? "table-occupied" : "table-free"}`}
                  >
                    <div className="bistro-table-top">
                      <span
                        className={`bistro-status ${pending ? "status-called" : occupied ? "status-waiting" : "status-free"}`}
                      >
                        <i />
                        {pending
                          ? "Awaiting approval"
                          : occupied
                            ? "Occupied"
                            : "Available"}
                      </span>
                      <span className="bistro-muted">{table.seats} seats</span>
                    </div>
                    <div className="bistro-table-visual" aria-hidden="true">
                      <span className="table-chair chair-n" />
                      <span className="table-chair chair-s" />
                      <span className="table-chair chair-e" />
                      <span className="table-chair chair-w" />
                      <span className="table-surface">
                        <UtensilsCrossed size={23} />
                      </span>
                    </div>
                    <h3>{table.name}</h3>
                    <p className="bistro-muted capitalize">
                      {table.area === "indoor" ? "Dining room" : "Terrace"} ·{" "}
                      {table.area}
                    </p>
                    <button
                      disabled={!occupied || pending || busyId !== null}
                      onClick={() => void markReady(table)}
                      className={`bistro-button ${occupied ? "" : "bistro-button-secondary"}`}
                    >
                      {busyId === table.id
                        ? "Sending request..."
                        : pending
                          ? "Awaiting approval"
                          : occupied
                            ? "Table is ready"
                            : "Already ready"}
                    </button>
                  </article>
                );
              })}
            </div>
          )}
          <footer className="bistro-panel-footer">
            <span>Reception approves table-readiness requests.</span>
            <span>
              <i className="bistro-dot" /> Updates every 3 seconds
            </span>
          </footer>
        </section>
        <footer className="bistro-page-footer">
          <span>
            MO BISTRO <span>/ District 5</span>
          </span>
          <span>Good service starts with a clear floor.</span>
        </footer>
      </div>
    </main>
  );
}
