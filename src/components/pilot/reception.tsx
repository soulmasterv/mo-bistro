"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import {
  Plus,
  QrCode,
  RefreshCw,
  Search,
  Users,
  UtensilsCrossed,
} from "lucide-react";
import type { ReactNode } from "react";
import { PILOT_ORIGIN } from "@/lib/pilot/config";
import PartyForm from "./party-form";
import JoinQR from "./join-qr";
import { PilotQueue } from "./queue";
import { PilotDrawer } from "./guest-drawer";
import { useReceptionQueue } from "./use-reception-queue";
import styles from "./pilot.module.css";
export default function PilotReception({
  username,
  role = "reception",
  children,
}: {
  username: string;
  role?: string;
  children?: ReactNode;
}) {
  const router = useRouter();
  const { parties, error, loaded, busy, now, updatedAt, refresh, action } =
    useReceptionQueue();
  const [handoff, setHandoff] = useState<{ id: number; token: string } | null>(
    null,
  );
  const [openParty, setOpenParty] = useState<number | null>(null);
  const [showWalkIn, setShowWalkIn] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [filter, setFilter] = useState<"all" | "waiting" | "called">("all");
  const [search, setSearch] = useState("");
  const menu = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    function dismiss(event: Event) {
      if (
        menu.current?.open &&
        event.target instanceof Node &&
        !menu.current.contains(event.target)
      )
        menu.current.open = false;
    }
    document.addEventListener("click", dismiss, true);
    return () => document.removeEventListener("click", dismiss, true);
  }, []);
  const waiting = parties.filter((p) => p.status === "waiting");
  const called = parties.filter((p) => p.status === "called").length;
  const query = search.trim().toLowerCase();
  const visible = parties.filter(
    (p) =>
      (filter === "all" || p.status === filter) &&
      (p.name.toLowerCase().includes(query) || p.phone.includes(query)),
  );
  const selected = parties.find((p) => p.id === openParty);
  return (
    <main
      className={`${styles.page} ${styles.receptionPage}`}
      data-pilot-reception
    >
      <div className={styles.wrap}>
        <header className={styles.header}>
          <div className={styles.receptionBrand}>
            <UtensilsCrossed size={20} aria-hidden="true" /> MO BISTRO
          </div>
          <div className={styles.headerActions}>
            <button
              type="button"
              className={styles.secondary}
              aria-label="Refresh queue"
              onClick={() => void refresh()}
            >
              <RefreshCw size={16} />
            </button>
            <button
              type="button"
              className={`${styles.secondary} ${styles.qrButton}`}
              onClick={() => setShowQR(true)}
              aria-haspopup="dialog"
            >
              <QrCode size={18} aria-hidden="true" /> QR Code
            </button>
            <button
              type="button"
              className={styles.button}
              aria-expanded={showWalkIn}
              aria-controls="pilot-walk-in"
              onClick={() => setShowWalkIn(!showWalkIn)}
            >
              <Plus size={16} aria-hidden="true" /> Add guest
            </button>
            <details
              ref={menu}
              className={styles.menu}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.currentTarget.open = false;
                  event.currentTarget.querySelector("summary")?.focus();
                }
              }}
            >
              <summary
                aria-label="Reception menu"
                title="Reception menu"
                className={styles.accountTrigger}
              >
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  aria-hidden="true"
                >
                  <path d="M4 6h16M4 12h16M4 18h16" />
                </svg>
                <span>
                  <strong>{username}</strong>
                  <small>{role}</small>
                </span>
              </summary>
              <nav className={styles.menuItems} aria-label="Reception options">
                {role === "manager" && <a href="/management">Management</a>}
                <button
                  onClick={() =>
                    void fetch("/api/auth/logout", { method: "POST" }).then(
                      () => {
                        router.replace("/login");
                        router.refresh();
                      },
                    )
                  }
                >
                  Sign out
                </button>
              </nav>
            </details>
          </div>
        </header>
        {updatedAt > 0 && !error && (
          <p className={styles.receptionUpdated}>
            Last updated {new Date(updatedAt).toLocaleTimeString()}
          </p>
        )}
        <div className={styles.receptionLayout}>
          <aside className={styles.receptionSidebar}>
            <a href="/queue" aria-current="page">
              <Users size={18} aria-hidden="true" /> Queue
            </a>
          </aside>
          <div className={styles.receptionContent}>
            <div className={styles.entryTools}>
              <section
                id="pilot-walk-in"
                aria-label="Walk-in form"
                className={styles.panel}
                hidden={!showWalkIn}
              >
                <PartyForm
                  staff
                  onCreated={(party) => {
                    setHandoff(party);
                    void refresh(undefined, true);
                  }}
                />
              </section>
            </div>
            {handoff && (
              <section className={styles.panel}>
                <strong>Ticket #{handoff.id} added</strong>
                <p className={styles.hint}>
                  Ask the guest to scan their private status link.
                </p>
                <div className={styles.qr}>
                  <QRCodeSVG
                    value={PILOT_ORIGIN + "/status?token=" + handoff.token}
                    size={130}
                  />
                  <button
                    className={styles.secondary}
                    onClick={() => setHandoff(null)}
                  >
                    Done
                  </button>
                </div>
              </section>
            )}
            <section
              className={styles.receptionQueue}
              aria-labelledby="pilot-queue-title"
            >
              <div className={styles.receptionQueueHeader}>
                <div className={styles.title}>
                  <h1 id="pilot-queue-title">
                    Waiting queue{" "}
                    <span className={styles.queueCount}>
                      {loaded ? parties.length : "—"}
                    </span>
                  </h1>
                  <div
                    className={styles.receptionTabs}
                    aria-label="Queue status"
                  >
                    {(
                      [
                        ["all", "All guests", parties.length],
                        ["waiting", "Waiting", waiting.length],
                        ["called", "Called", called],
                      ] as const
                    ).map(([value, label, count]) => (
                      <button
                        type="button"
                        key={value}
                        aria-pressed={filter === value}
                        onClick={() => setFilter(value)}
                      >
                        {label} ({loaded ? count : "—"})
                      </button>
                    ))}
                  </div>
                </div>
                <label className={styles.receptionSearch}>
                  <Search size={16} aria-hidden="true" />
                  <input
                    type="search"
                    aria-label="Search a guest or phone number"
                    placeholder="Search a guest or phone number"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                  />
                </label>
              </div>
              {error && (
                <p className={styles.notice} role="alert">
                  {error}
                </p>
              )}
              {!loaded && !error && <p role="status">Loading queue…</p>}
              {loaded && !visible.length && (
                <div className={styles.receptionEmpty}>
                  <Users size={26} aria-hidden="true" />
                  <p>
                    {parties.length ? "No guests match." : "Queue is empty."}
                  </p>
                  {!parties.length && (
                    <small>New arrivals will appear here.</small>
                  )}
                </div>
              )}
              {!!visible.length && (
                <PilotQueue
                  parties={visible}
                  nextPartyId={parties[0]?.id}
                  now={now}
                  busy={busy}
                  onAction={(id, value, reason) =>
                    void action(id, value, reason)
                  }
                  onOpen={setOpenParty}
                />
              )}
            </section>
            {children}
          </div>
        </div>
        {selected && (
          <PilotDrawer
            key={selected.id}
            party={selected}
            now={now}
            busy={busy.includes(selected.id)}
            onAction={(id, value, reason) => void action(id, value, reason)}
            onClose={() => setOpenParty(null)}
          />
        )}
        {showQR && <JoinQR onClose={() => setShowQR(false)} />}
      </div>
    </main>
  );
}
