"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { STOP_INSTRUCTION } from "@/lib/advanced/message-copy";
type Subscription = {
  available: boolean;
  subscribed?: boolean;
  feedbackConsent?: boolean;
  feedbackEditable?: boolean;
  url?: string | null;
};
export default function WhatsappSubscription({
  token,
  allowSubscribe = true,
}: {
  token: string;
  allowSubscribe?: boolean;
}) {
  const [subscription, setSubscription] = useState<Subscription>({
    available: false,
  });
  const [error, setError] = useState("");
  const [awaitingReply, setAwaitingReply] = useState(false);
  const [checking, setChecking] = useState(false);
  const checkingRef = useRef(false);
  const refresh = useCallback(async () => {
    const response = await fetch(
      `/api/whatsapp/subscription?token=${encodeURIComponent(token)}`,
      { cache: "no-store" },
    );
    if (!response.ok)
      throw new Error("WhatsApp options are temporarily unavailable.");
    setSubscription(await response.json());
  }, [token]);
  useEffect(() => {
    const initial = window.setTimeout(() => void refresh().catch(() => {}), 0);
    const timer = window.setInterval(
      () => void refresh().catch(() => {}),
      10000,
    );
    const focused = () => { if (document.visibilityState === "visible") void refresh().catch(() => {}); };
    window.addEventListener("focus", focused);
    document.addEventListener("visibilitychange", focused);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
      window.removeEventListener("focus", focused);
      document.removeEventListener("visibilitychange", focused);
    };
  }, [refresh]);
  if (!subscription.available || (!subscription.subscribed && !allowSubscribe))
    return null;
  return (
    <section
      className="guest-whatsapp-card space-y-3 rounded-xl border border-[#DDD5C9] p-4 text-sm"
      aria-label="WhatsApp updates"
    >
      <p>
        {subscription.subscribed
          ? "WhatsApp updates enabled"
          : "Get WhatsApp updates for this booking"}
      </p>
      {subscription.subscribed ? (
        <p className="guest-small-note">
          You’ll receive booking updates on WhatsApp.
        </p>
      ) : (
        <p className="guest-small-note">
          Subscribe for booking updates and one review request 60 minutes after seating. Open WhatsApp and send your booking message to enable both.
        </p>
      )}
      {!subscription.subscribed && allowSubscribe && subscription.url && (
        <a
          href={subscription.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => setAwaitingReply(true)}
          className="block rounded-xl bg-[#242424] px-4 py-3 text-center font-medium text-white"
        >
          Get WhatsApp updates
        </a>
      )}
      {!subscription.subscribed && awaitingReply && <p role="status" className="guest-small-note">Waiting for WhatsApp confirmation. Your subscription activates after we receive your booking-specific reply.</p>}
      {!subscription.subscribed && (
        <button
          type="button"
          className="guest-subscription-refresh"
          disabled={checking}
          aria-busy={checking}
          onClick={async () => {
            if (checkingRef.current) return;
            checkingRef.current = true;
            setChecking(true);
            setError("");
            try {
              await refresh();
            } catch (err) {
              setError(err instanceof Error ? err.message : "Could not check your subscription.");
            } finally {
              checkingRef.current = false;
              setChecking(false);
            }
          }}
        >
          <RefreshCw size={15} aria-hidden="true" />
          {checking ? "Checking subscription…" : "Check subscription status"}
        </button>
      )}
      {subscription.subscribed && subscription.feedbackConsent && (
        <p className="guest-review-status">Review requests enabled</p>
      )}
      <p className="text-xs text-[#77716A]">
        {!subscription.subscribed && (
          <>
            Open WhatsApp, then send the message to enable
            updates.{" "}
          </>
        )}
        {STOP_INSTRUCTION}
      </p>
      {error && (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      )}
    </section>
  );
}
