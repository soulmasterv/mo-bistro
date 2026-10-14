"use client";
import { useConfirmation } from "@/components/confirmation-provider";
import RestaurantWaitDisplay from "@/components/restaurant-wait-display";
import WhatsappSubscription from "@/components/whatsapp-subscription";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  CheckCircle2,
  Clock3,
  Users,
  Bell,
  UtensilsCrossed,
  XCircle,
  RefreshCw,
} from "lucide-react";

const STORAGE_KEY = "restaurant_guest_tracking_token";

type Tracking = {
  confirmation_required: boolean;
  guest: {
    name: string;
    party_size: number;
    status: string;
    confirmed: boolean;
    created_at: string;
    eta_at?: string | null;
  };
  queue_position: number | null;
  guests_ahead: number | null;
};

function StatusContent() {
  const confirmAction = useConfirmation();
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token");

  const [data, setData] = useState<Tracking | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!token) {
      setError("Missing tracking link.");
      setLoading(false);
      return;
    }

    try {
      const response = await fetch(
        `/api/track?token=${encodeURIComponent(token)}`,
        { cache: "no-store" },
      );

      if (!response.ok) {
        throw new Error("Unable to find this registration.");
      }

      const result = await response.json();
      setData(result);
      setError("");
      localStorage.setItem(STORAGE_KEY, token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to refresh.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    const initial = window.setTimeout(() => void refresh(), 0);

    const timer = setInterval(() => {
      void refresh();
    }, 5000);

    return () => {
      window.clearTimeout(initial);
      clearInterval(timer);
    };
  }, [refresh]);

  async function cancel() {
    if (!token || busy) return;

    if (!await confirmAction({ title: "Leave the waitlist?", message: "Your booking will be cancelled and your place in the queue will be released.", confirmLabel: "Leave waitlist", destructive: true })) {
      return;
    }

    setBusy(true);

    try {
      const response = await fetch("/api/track", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, action: "cancel" }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Cancellation failed.");
      }

      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cancellation failed.");
    } finally {
      setBusy(false);
    }
  }

  const status = data?.guest.status;
  const active = status === "waiting" || status === "called";

  const statusText: Record<string, string> = {
    waiting: "You're on the waitlist",
    called: "Reception is calling you!",
    seated: "Enjoy your visit!",
    cancelled: "Registration cancelled",
    no_show: "Registration closed",
  };

  return (
    <main className="guest-status-page">
      <div className="guest-status-shell">
        <header className="guest-brand">
          <UtensilsCrossed size={30} />
          <span>MO BISTRO</span>
        </header>
        <div className="guest-status-layout">
          <section className="guest-status-main">
            <h1>
              {status === "seated"
                ? "You’re seated!"
                : active || !data
                  ? "Your table is worth the wait"
                  : statusText[status || ""] || "Your booking"}
            </h1>
            <p className="guest-intro">
              {status === "seated"
                ? "Enjoy your visit."
                : active
                  ? "We’ll let you know when your table is ready."
                  : "Thank you for choosing Mo Bistro."}
            </p>
            {active && (
              <div className="guest-estimate">
                {data?.guest.eta_at && Number.isFinite(Date.parse(data.guest.eta_at)) ? (
                  <div className="restaurant-wait-display">
                    <p>Expected table readiness</p>
                    <p className="text-2xl font-semibold">
                      {new Date(data.guest.eta_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                    </p>
                    <p className="text-sm">An estimate for your booking. Reception will confirm when your table is ready.</p>
                  </div>
                ) : <RestaurantWaitDisplay />}
              </div>
            )}
            {loading && !data ? (
              <p role="status">Loading your booking…</p>
            ) : error && !data ? (
              <p role="alert">{error}</p>
            ) : data ? (
              <>
                <div
                  className={`guest-current-status ${status === "seated" ? "is-seated" : ""}`}
                >
                  {status === "seated" ? (
                    <CheckCircle2 size={42} />
                  ) : status === "called" ? (
                    <Bell size={30} />
                  ) : active ? (
                    <Clock3 size={28} />
                  ) : (
                    <XCircle size={28} />
                  )}
                  <div>
                    <h2>
                      {status === "seated"
                        ? "Your table is ready"
                        : statusText[status || ""]}
                    </h2>
                    <p>
                      {status === "seated"
                        ? "Our team has seated you. Enjoy your meal!"
                        : status === "called"
                          ? "Please make your way to reception."
                          : active
                            ? "Your place is saved. We’ll update this page when you’re called."
                            : "This booking is now closed."}
                    </p>
                  </div>
                </div>
                <dl className="guest-booking-facts">
                  <div>
                    <dt>Guest</dt>
                    <dd>{data.guest.name}</dd>
                  </div>
                  <div>
                    <dt>
                      <Users size={16} /> Party size
                    </dt>
                    <dd>{data.guest.party_size}</dd>
                  </div>
                  {active && (
                    <>
                      <div>
                        <dt>Queue position</dt>
                        <dd>
                          {data.queue_position === null
                            ? "—"
                            : `#${data.queue_position}`}
                        </dd>
                      </div>
                      <div>
                        <dt>Parties ahead</dt>
                        <dd>{data.guests_ahead ?? "—"}</dd>
                      </div>
                      <div>
                        <dt>Reception confirmation</dt>
                        <dd
                          className={
                            data.guest.confirmed ? "guest-confirmed" : ""
                          }
                        >
                          {data.guest.confirmed
                            ? "Confirmed"
                            : data.confirmation_required
                              ? "Pending"
                              : "Not required"}
                        </dd>
                      </div>
                    </>
                  )}
                </dl>
                {active && (
                  <>
                    <p className="guest-small-note">
                      Queue information updates automatically. Seating order is
                      managed by your host team.
                    </p>
                    <button
                      type="button"
                      className="guest-outline-button"
                      onClick={() => void refresh()}
                    >
                      <RefreshCw size={17} /> Refresh status
                    </button>
                  </>
                )}
                {status === "seated" && (
                  <div className="guest-help">
                    <UtensilsCrossed size={24} />
                    <div>
                      <strong>Need anything?</strong>
                      <p>
                        Our team is here to help. Enjoy your dining experience
                        at Mo Bistro.
                      </p>
                    </div>
                  </div>
                )}
                {error && <p role="alert">{error}</p>}
                <a href="/menu" className="guest-outline-button">
                  Explore Mo Bistro’s menu
                </a>
                {active && (
                  <button
                    type="button"
                    onClick={() => void cancel()}
                    disabled={busy}
                    className="guest-leave-button"
                  >
                    {busy ? "Leaving…" : "Leave waitlist"}
                  </button>
                )}
                {!active && status !== "seated" && (
                  <button
                    className="guest-outline-button"
                    onClick={() => {
                      localStorage.removeItem(STORAGE_KEY);
                      router.push("/join");
                    }}
                  >
                    New registration
                  </button>
                )}
              </>
            ) : null}
          </section>
          <aside className="guest-status-aside">
            <div className="guest-welcome-card">
              <UtensilsCrossed size={38} />
              <p>MO BISTRO · DISTRICT 5</p>
              <h2>
                Good food.
                <br />
                Good company.
              </h2>
              <p>A little time, well spent.</p>
              <a href="/menu">Discover our menu →</a>
            </div>
            {token && data && (
              <WhatsappSubscription token={token} allowSubscribe={active} />
            )}
          </aside>
        </div>
      </div>
    </main>
  );
}

export default function StatusPage() {
  return (
    <Suspense
      fallback={
        <main className="guest-status-page">
          <p role="status">Loading your booking…</p>
        </main>
      }
    >
      <StatusContent />
    </Suspense>
  );
}
