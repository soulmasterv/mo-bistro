"use client";
import MoBistroMenuCard from "@/components/mo-bistro-menu-card";
import RestaurantWaitDisplay from "@/components/restaurant-wait-display";

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
  guest: {
    name: string;
    party_size: number;
    status: string;
    confirmed: boolean;
    created_at: string;
  };
  queue_position: number | null;
  guests_ahead: number | null;
};


function StatusContent() {
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
        { cache: "no-store" }
      );

      if (!response.ok) {
        throw new Error("Unable to find this registration.");
      }

      const result = await response.json();
      setData(result);
      setError("");
      localStorage.setItem(STORAGE_KEY, token);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to refresh."
      );
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void refresh();

    const timer = setInterval(() => {
      void refresh();
    }, 5000);

    return () => clearInterval(timer);
  }, [refresh]);

async function cancel() {
    if (!token || busy) return;

    if (!window.confirm("Leave the restaurant waitlist?")) {
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
      setError(
        err instanceof Error ? err.message : "Cancellation failed."
      );
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
    <main className="flex min-h-screen items-center justify-center bg-[#F7F4EE] px-5 py-10 text-[#242424]">
      <div className="w-full max-w-md rounded-3xl border border-[#E3DBCE] bg-white p-8 shadow-xl">
        <div className="mb-8 text-center">
          <UtensilsCrossed
            className="mx-auto mb-4 text-[#A78A60]"
            size={32}
          />
          <p className="text-xs uppercase tracking-[0.3em] text-[#A78A60]">
            Mo Bistro
          </p>
          <h1 className="mt-3 text-2xl font-semibold">
            Your table is worth the wait
          </h1>
        </div>

        <RestaurantWaitDisplay />

        {loading && !data ? (
          <p className="text-center text-sm text-[#77716A]">
            Loading your registration...
          </p>
        ) : error && !data ? (
          <p role="alert" className="text-center text-red-600">
            {error}
          </p>
        ) : data ? (
          <div className="space-y-6">
            <div className="rounded-2xl bg-[#F7F4EE] p-6 text-center">
              {status === "called" ? (
                <Bell
                  className="mx-auto mb-3 text-[#A78A60]"
                  size={36}
                />
              ) : status === "seated" ? (
                <CheckCircle2
                  className="mx-auto mb-3 text-emerald-600"
                  size={36}
                />
              ) : active ? (
                <Clock3
                  className="mx-auto mb-3 text-[#A78A60]"
                  size={36}
                />
              ) : (
                <XCircle
                  className="mx-auto mb-3 text-[#77716A]"
                  size={36}
                />
              )}

              <h2 className="text-xl font-semibold">
                {statusText[status || ""] || "Status unavailable"}
              </h2>

              <p className="mt-2 text-sm text-[#77716A]">
                {status === "called"
                  ? "Please approach reception."
                  : status === "waiting"
                    ? "We'll update this page when reception calls you."
                    : "Thank you for visiting."}
              </p>
            </div>

            <div className="space-y-4">
              <div className="flex justify-between border-b border-[#EAE4D9] pb-3">
                <span className="text-[#77716A]">Guest</span>
                <strong>{data.guest.name}</strong>
              </div>

              <div className="flex justify-between border-b border-[#EAE4D9] pb-3">
                <span className="flex items-center gap-2 text-[#77716A]">
                  <Users size={16} /> Party size
                </span>
                <strong>{data.guest.party_size}</strong>
              </div>

              <div className="flex justify-between border-b border-[#EAE4D9] pb-3">
                <span className="text-[#77716A]">
                  Queue position
                </span>
                <strong>
                  {data.queue_position === null
                    ? "—"
                    : `#${data.queue_position}`}
                </strong>
              </div>

              <div className="flex justify-between border-b border-[#EAE4D9] pb-3">
                <span className="text-[#77716A]">
                  Guests ahead
                </span>
                <strong>
                  {data.guests_ahead === null
                    ? "—"
                    : data.guests_ahead}
                </strong>
              </div>


              <div className="flex justify-between">
                <span className="text-[#77716A]">
                  Reception confirmation
                </span>
                <strong>
                  {data.guest.confirmed ? "Confirmed" : "Pending"}
                </strong>
              </div>
            </div>

            <p className="text-center text-xs text-[#88817A]">
              Queue information refreshes every 5 seconds.
              Seating order is determined by reception.
            </p>

            {error && (
              <p role="alert" className="text-sm text-red-600">
                {error}
              </p>
            )}

            <button
              type="button"
              onClick={() => void refresh()}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#DDD5C9] p-3 font-medium"
            >
              <RefreshCw size={17} /> Refresh status
            </button>

            {active && (
              <button
                type="button"
                onClick={() => window.alert("Our menu is coming soon.")}
                className="w-full rounded-xl border border-[#DDD5C9] p-3 font-medium text-[#A78A60]"
              >
                Explore Mo Bistro's menu
              </button>
            )}

            {active && (
              <button
                type="button"
                onClick={() => void cancel()}
                disabled={busy}
                className="w-full rounded-xl p-3 text-sm font-medium text-red-600 disabled:opacity-50"
              >
                {busy ? "Cancelling..." : "Leave waitlist"}
              </button>
            )}

            {!active && (
              <button
                type="button"
                onClick={() => {
                  localStorage.removeItem(STORAGE_KEY);
                  router.push("/join");
                }}
                className="w-full rounded-xl bg-[#242424] p-3 font-medium text-white"
              >
                New registration
              </button>
            )}
          </div>
        ) : null}
      </div>
    </main>
  );
}

export default function StatusPage() {
  return (
    <Suspense fallback={
      <main className="min-h-screen bg-[#F4F0E9] px-4 py-8 text-[#302D28] sm:px-6 lg:py-16">
      <div className="mx-auto grid max-w-[1050px] items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
        Loading...
              </div>
        <MoBistroMenuCard />
      </div>
    </main>
    }>
      <StatusContent />
    </Suspense>
  );
}
