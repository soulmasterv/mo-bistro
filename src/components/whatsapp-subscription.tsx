"use client";
import { useCallback, useEffect, useState } from "react";
import { MessageCircle, Phone } from "lucide-react";
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
  const [awaitingReply, setAwaitingReply] = useState(false);
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
          : "WhatsApp updates"}
      </p>
      {subscription.subscribed ? (
        <p className="guest-small-note">
          You’ll receive booking updates on WhatsApp.
        </p>
      ) : (
        <p className="guest-small-note">
          Includes booking updates and one review request after seating.
        </p>
      )}
      {!subscription.subscribed && allowSubscribe && subscription.url && (
        <a
          href={subscription.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => setAwaitingReply(true)}
          className="flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-center font-medium"
          style={{ backgroundColor: "#242424", color: "#ffffff" }}
        >
          <span aria-hidden="true" className="relative inline-flex items-center justify-center" style={{ color: "#25D366" }}>
            <MessageCircle size={21} />
            <Phone size={10} className="absolute" />
          </span>
          Get WhatsApp updates
        </a>
      )}
      {!subscription.subscribed && awaitingReply && <p role="status" className="guest-small-note">Waiting for WhatsApp confirmation…</p>}
      {subscription.subscribed && subscription.feedbackConsent && (
        <p className="guest-review-status">Review requests enabled</p>
      )}
    </section>
  );
}
