"use client";
import { useCallback, useEffect, useState } from "react";
type Subscription = { available: boolean; subscribed?: boolean; feedbackConsent?: boolean; feedbackEditable?: boolean; url?: string | null };
export default function WhatsappSubscription({ token }: { token: string }) {
  const [subscription, setSubscription] = useState<Subscription>({available:false});
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const refresh = useCallback(async () => {
    const response = await fetch(`/api/whatsapp/subscription?token=${encodeURIComponent(token)}`, {cache:"no-store"});
    if (!response.ok) throw new Error("WhatsApp options are temporarily unavailable.");
    setSubscription(await response.json());
  }, [token]);
  useEffect(() => {
    const initial = window.setTimeout(() => void refresh().catch(() => {}), 0);
    const timer = window.setInterval(() => void refresh().catch(() => {}), 10000);
    return () => { window.clearTimeout(initial);window.clearInterval(timer); };
  }, [refresh]);
  if (!subscription.available) return null;
  return <section className="space-y-3 rounded-xl border border-[#DDD5C9] p-4 text-sm" aria-label="Optional WhatsApp updates">
    <p>{subscription.subscribed ? "WhatsApp updates enabled" :
      "Want WhatsApp updates? Send the prefilled message to subscribe for this booking."}</p>
    {!subscription.subscribed && subscription.url && <a href={subscription.url} target="_blank" rel="noopener noreferrer"
      className="block rounded-xl bg-[#34382E] px-4 py-3 text-center font-medium text-white">Subscribe to WhatsApp updates</a>}
    {subscription.subscribed && subscription.feedbackEditable && <label className="flex items-start gap-3">
      <input type="checkbox" checked={!!subscription.feedbackConsent} disabled={saving}
        onChange={async e => {
          const value=e.target.checked;setSaving(true);setError("");
          try {
            const response=await fetch("/api/whatsapp/subscription", {method:"PATCH",headers:{"Content-Type":"application/json"},
              body:JSON.stringify({token,feedbackConsent:value})});
            if(!response.ok)throw new Error("Could not save your review preference.");
            await refresh();
          }catch(err){setError(err instanceof Error?err.message:"Could not save preference.");}
          finally{setSaving(false);}
        }} />
      <span>Optional: send me one review request 60 minutes after seating.</span>
    </label>}
    <p className="text-xs text-[#77716A]">{!subscription.subscribed && <>Opening WhatsApp doesn’t subscribe you. Send the message to confirm. </>}To unsubscribe at any time, reply UNSUBSCRIBE or STOP on WhatsApp.</p>
    {error && <p role="alert" className="text-red-700">{error}</p>}
  </section>;
}
