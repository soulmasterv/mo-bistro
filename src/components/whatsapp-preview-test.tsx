"use client";
import { useEffect, useState } from "react";
export default function WhatsAppPreviewTest() {
  const [enabled, setEnabled] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [attemptId, setAttemptId] = useState("");
  const [result, setResult] = useState("");
  useEffect(() => { fetch("/api/whatsapp/test", {cache:"no-store"})
    .then(r => r.ok ? r.json() : null).then(v => { setEnabled(v?.enabled === true); if(v?.enabled && !v.window_open) setResult("Blocked: send an incoming message to the Meta test number first (within 24 hours)."); }).catch(() => {}); }, []);
  useEffect(() => {
    if (!attemptId) return;
    const timer = setInterval(() => {
      fetch("/api/whatsapp/test",{cache:"no-store"}).then(r=>r.ok?r.json():null).then(v=>{
        if(v?.result?.id === attemptId && v?.result?.delivery_status) setResult(`Meta HTTP ${v.result.provider_status ?? "unavailable"}: ${v.result.state}. Delivery: ${v.result.delivery_status}. No automatic retry.`);
      }).catch(()=>{});
    },5000);
    return () => clearInterval(timer);
  },[attemptId]);
  if (!enabled) return null;
  async function send() {
    if (attempted || !window.confirm("Send one real plain-text test message to the configured verified test recipient?")) return;
    setAttempted(true); setResult("Sending one test message…");
    try {
      const response = await fetch("/api/whatsapp/test", {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({confirm:true})});
      const value = await response.json();
      if(value.attemptId) setAttemptId(value.attemptId);
      setResult(value.error || `Meta HTTP ${value.providerStatus ?? "unavailable"}: ${value.state}. ${value.messageId ? `Message ID: ${value.messageId}. ` : ""}Accepted does not confirm delivery. No automatic retry.`);
    } catch { setResult("Result unknown. No automatic retry; check Meta before another attempt."); }
  }
  return <section className="bistro-panel"><h2>Preview WhatsApp test</h2>
    <p>One real plain-text test message to the configured test recipient. Customer notifications remain simulated. First send an incoming message to the Meta test number to open the 24-hour window.</p>
    <button type="button" disabled={attempted} onClick={send}>Send Test WhatsApp</button>
    <p role="status">{result}</p></section>;
}
