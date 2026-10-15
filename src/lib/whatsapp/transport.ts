import "server-only";
import { Receiver } from "@upstash/qstash";
import { callbackUrl, liveSendingEnabled, type NotificationKind } from "@/lib/whatsapp/policy";

export function templatePayload(job: { id: string; kind: NotificationKind; guest_id: number },
  booking: { phone: string; name: string; eta_at?: Date | null }, code: string) {
  const keys: Record<NotificationKind, string> = {
    confirmation: "WHATSAPP_CONFIRMATION_TEMPLATE", almost_ready: "WHATSAPP_ALMOST_READY_TEMPLATE",
    review: "WHATSAPP_REVIEW_TEMPLATE",
    eta_update: "WHATSAPP_ETA_UPDATE_TEMPLATE",
  };
  const name = process.env[keys[job.kind]];
  if (!name || !/^[a-z0-9_]+$/.test(name)) throw new Error("WhatsApp approved template is not configured");
  const parameters = [
    { type: "text", text: booking.name }, { type: "text", text: String(job.guest_id) },
  ];
  if (job.kind === "eta_update") {
    if (!booking.eta_at) throw Error("Expected readiness time missing");
    parameters.push({type:"text",text:new Intl.DateTimeFormat("en-GB", {timeZone:"Africa/Cairo",hour:"numeric",minute:"2-digit",hour12:true}).format(new Date(booking.eta_at))});
  }
  const components: object[] = [{ type: "body", parameters }];
  if (job.kind === "confirmation") components.push({
    type: "button", sub_type: "quick_reply", index: "0",
    parameters: [{ type: "payload", payload: `subscribe:${job.guest_id}:${code}` }],
  });
  return { messaging_product: "whatsapp", to: booking.phone, type: "template",
    biz_opaque_callback_data: job.id,
    template: { name, language: { code: process.env.WHATSAPP_TEMPLATE_LANGUAGE || "en" }, components } };
}

// Only explicitly live mode touches providers. Test mode never publishes or sends.
export async function publishJob(id: string, revision: number, due: Date) {
  if (!liveSendingEnabled()) return { messageId: `test:${id}:${revision}` };
  const token = process.env.QSTASH_TOKEN;
  if (!token) throw new Error("QStash token is missing");
  const destination = callbackUrl("/api/whatsapp/jobs");
  const base = new URL(process.env.QSTASH_URL || "https://qstash.upstash.io");
  if (base.protocol !== "https:" || !base.hostname.endsWith(".upstash.io")) throw new Error("Invalid QStash URL");
  const response = await fetch(`${base.origin}/v2/publish/${encodeURIComponent(destination)}`, {
    method: "POST", signal: AbortSignal.timeout(10_000),
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json",
      "Upstash-Not-Before": String(Math.ceil(due.getTime() / 1000)), "Upstash-Retries": "5",
      "Upstash-Deduplication-Id": `${id}:${revision}` },
    body: JSON.stringify({ notificationId: id, revision }),
  });
  if (!response.ok) throw new Error(`QStash publish rejected (${response.status})`);
  const body = await response.json();
  if (typeof body.messageId !== "string") throw new Error("Invalid QStash publish response");
  return body as { messageId: string };
}

export async function verifyQstash(raw: string, signature: string | null, path: string) {
  const current = process.env.QSTASH_CURRENT_SIGNING_KEY, next = process.env.QSTASH_NEXT_SIGNING_KEY;
  if (!current || !next || !signature) return false;
  try { return await new Receiver({ currentSigningKey: current, nextSigningKey: next })
    .verify({ signature, body: raw, url: callbackUrl(path) }); } catch { return false; }
}

export type SendResult = { state: "sent" | "simulated" | "pending" | "failed" | "unknown" | "skipped";
  messageId?: string; providerStatus?: number; error?: string };
export async function sendTemplate(payload: ReturnType<typeof templatePayload>): Promise<SendResult> {
  if (!liveSendingEnabled()) return { state: "simulated" };
  return requestMetaTemplate(payload);
}

// Internal transport shared by the normal policy-gated sender and isolated Preview test.
export type MetaTextPayload = { messaging_product: "whatsapp"; to: string; type: "text"; text: { body: string }; biz_opaque_callback_data: string };
export async function requestMetaTemplate(payload: ReturnType<typeof templatePayload> | MetaTextPayload): Promise<SendResult> {
  const access = process.env.META_WHATSAPP_ACCESS_TOKEN, phoneId = process.env.META_WHATSAPP_PHONE_NUMBER_ID;
  const version = process.env.META_GRAPH_API_VERSION;
  if (!access || !phoneId || !/^\d+$/.test(phoneId) || !/^v\d+\.\d+$/.test(version || "")) {
    return { state: "failed", error: "meta_configuration_missing" };
  }
  try {
    const response = await fetch(`https://graph.facebook.com/${version}/${phoneId}/messages`, {
      method: "POST", headers: { Authorization: `Bearer ${access}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload), signal: AbortSignal.timeout(10_000),
    });
    const body = await response.json().catch(() => null);
    if (response.ok && typeof body?.messages?.[0]?.id === "string") {
      return { state: "sent", providerStatus: response.status, messageId: body.messages[0].id };
    }
    // Ambiguous acceptance must not be blindly retried: Meta has no send idempotency key.
    if (response.status >= 500 || response.ok) return { state: "unknown", providerStatus: response.status, error: "meta_acceptance_unknown" };
    if (response.status === 429 && body?.error) return { state: "pending", providerStatus: response.status, error: "meta_rate_limited" };
    return { state: "failed", providerStatus: response.status, error: `meta_rejected_${response.status}` };
  } catch { return { state: "unknown", error: "meta_network_acceptance_unknown" }; }
}
