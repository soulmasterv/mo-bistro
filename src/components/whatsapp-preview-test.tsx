"use client";
import { useConfirmation } from "@/components/confirmation-provider";
import { useCallback, useEffect, useState } from "react";
export default function WhatsAppPreviewTest() {
  const confirmAction = useConfirmation();
  const [enabled, setEnabled] = useState(false);
  const [visible, setVisible] = useState(false);
  const [windowOpen, setWindowOpen] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [attemptId, setAttemptId] = useState("");
  const [result, setResult] = useState("");
  const [checking, setChecking] = useState(false);
  const [setupChecks, setSetupChecks] = useState(0);
  const [automatic, setAutomatic] = useState<{ live: boolean; windowTextEnabled: boolean; isolatedTestEnabled: boolean } | null>(null);
  const checkSetup = useCallback(async () => {
    setChecking(true);
    try {
      const response = await fetch("/api/whatsapp/test", { cache: "no-store" });
      if (!response.ok) throw new Error("Setup unavailable");
      const v = await response.json();
      setVisible(v?.visible === true);
      setEnabled(v?.enabled === true);
      setWindowOpen(v?.window_open === true);
      setAutomatic(v?.automaticNotifications ?? null);
      setResult(
        v?.reason ||
          (v?.window_open
            ? "Ready for one manually confirmed test."
            : "Blocked: send an incoming message to the Meta test number first (within 24 hours)."),
      );
    } catch {
      setEnabled(false);
      setWindowOpen(false);
      setResult("Unable to check Preview test setup.");
    } finally {
      setChecking(false);
      setSetupChecks(count => count + 1);
    }
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => void checkSetup(), 0);
    return () => clearTimeout(timer);
  }, [checkSetup]);
  useEffect(() => {
    if (!attemptId) return;
    const timer = setInterval(() => {
      fetch("/api/whatsapp/test", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((v) => {
          if (v?.result?.id === attemptId && v?.result?.delivery_status)
            setResult(
              `Meta HTTP ${v.result.provider_status ?? "unavailable"}: ${v.result.state}. Delivery: ${v.result.delivery_status}. No automatic retry.`,
            );
        })
        .catch(() => {});
    }, 5000);
    return () => clearInterval(timer);
  }, [attemptId]);
  if (!visible) return null;
  async function send() {
    if (
      !enabled ||
      !windowOpen ||
      attempted ||
      !await confirmAction({ title: "Send test WhatsApp?", message: "Send one real plain-text test message to the configured verified test recipient? No automatic retries.", confirmLabel: "Send test message" })
    )
      return;
    setAttempted(true);
    setResult("Sending one test message…");
    try {
      const response = await fetch("/api/whatsapp/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true }),
      });
      const value = await response.json();
      if (value.attemptId) setAttemptId(value.attemptId);
      setResult(
        value.error ||
          `Meta HTTP ${value.providerStatus ?? "unavailable"}: ${value.state}. ${value.messageId ? `Message ID: ${value.messageId}. ` : ""}Accepted does not confirm delivery. No automatic retry.`,
      );
    } catch {
      setResult(
        "Result unknown. No automatic retry; check Meta before another attempt.",
      );
    }
  }
  return (
    <section
      className="bistro-panel mb-6 space-y-3 p-5"
      aria-label="Preview WhatsApp test"
    >
      <h2>Preview WhatsApp test</h2>
      <p>
        One real plain-text test message to the configured test recipient. This
        isolated test requires customer notifications to remain simulated. First
        send an incoming message to the Meta test number to open the 24-hour
        window.
      </p>
      {!attempted && (
        <button
          className="bistro-button bistro-button-secondary"
          type="button"
          disabled={checking}
          onClick={() => void checkSetup()}
        >
          {checking ? "Checking setup…" : "Check setup"}
        </button>
      )}
      <button
        className="bistro-button"
        type="button"
        disabled={checking || !enabled || !windowOpen || attempted}
        onClick={send}
      >
        Send Test WhatsApp
      </button>
      <p role="status">{result}</p>
      <p role="status" aria-live="polite">
        {checking ? "Checking Preview configuration…" : setupChecks > 0 ? `Setup check ${setupChecks} complete. No message sent by this check.` : ""}
      </p>
      {automatic && (
        <div aria-label="Automatic WhatsApp notifications" className="space-y-2">
          <p>{automatic.live
            ? "Automatic booking delivery is enabled. Consent, recipient and message-window checks still apply."
            : "Automatic booking messages are not sent to WhatsApp: live sending is disabled. A delivered test message does not enable booking updates."}</p>
          {automatic.isolatedTestEnabled && <p>Isolated test mode is active. Incoming messages from the test recipient do not subscribe a booking.</p>}
          {!automatic.windowTextEnabled && <p>Automatic plain-text messages within the 24-hour window are disabled.</p>}
        </div>
      )}
    </section>
  );
}
