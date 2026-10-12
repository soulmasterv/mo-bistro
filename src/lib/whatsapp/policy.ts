import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export type NotificationKind = "confirmation" | "almost_ready" | "review";
export const CONSENT_VERSION = "whatsapp-v1-2026-10-12";
export function whatsappEnabled() {
  return process.env.WHATSAPP_ENABLED === "true" && process.env.MO_BISTRO_DB === "postgres";
}
export function liveSendingEnabled() {
  return whatsappEnabled() && process.env.WHATSAPP_MODE === "live" &&
    process.env.WHATSAPP_ALLOW_LIVE_SEND === "true";
}
export function normalizePhone(value: string) {
  const phone = value.replace(/[\s+()-]/g, "");
  const normalized = /^01[0125]\d{8}$/.test(phone) ? `2${phone}` : phone;
  if (!/^[1-9]\d{7,14}$/.test(normalized)) throw new Error("Invalid WhatsApp phone");
  return normalized;
}
export function hashCode(code: string) {
  return createHash("sha256").update(code).digest("hex");
}
export function subscriptionCode(guestId: number, trackingHash: string) {
  const secret = process.env.WHATSAPP_ASSOCIATION_SECRET;
  if (!secret || secret.length < 32) throw new Error("WhatsApp association secret is missing");
  return createHmac("sha256", secret).update(`subscribe:v1:${guestId}:${trackingHash}`).digest("hex");
}
export function safeEqual(a: string, b: string) {
  const aa = Buffer.from(a), bb = Buffer.from(b);
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}
export function verifyMetaSignature(raw: string, signature: string | null) {
  const secret = process.env.META_APP_SECRET;
  if (!secret || !signature || !/^sha256=[a-f0-9]{64}$/.test(signature)) return false;
  return safeEqual(signature, `sha256=${createHmac("sha256", secret).update(raw).digest("hex")}`);
}
export function parseSubscription(message: string) {
  const match = /^(?:subscribe:|SUBSCRIBE\s+)(\d+)(?::|\s+)([a-f0-9]{64})$/i.exec(message.trim());
  if (!match || !Number.isSafeInteger(Number(match[1])) || Number(match[1]) < 1) return null;
  return { guestId: Number(match[1]), code: match[2].toLowerCase() };
}
export function isStop(text: string) {
  return /^(stop|unsubscribe|cancel updates|إلغاء|الغاء)$/iu.test(text.trim());
}
export function dueTime(kind: NotificationKind, reference: Date) {
  return new Date(reference.getTime() + (kind === "review" ? 60 : kind === "almost_ready" ? -10 : 0) * 60_000);
}
export type Eligibility = {
  kind: NotificationKind; confirmation_consent: boolean; feedback_consent: boolean;
  subscribed_at: Date | null; unsubscribed_at: Date | null; opted_out_at: Date | null;
  guest_status: string; eta_at: Date | null; seated_at: Date | null;
};
export function eligible(row: Eligibility) {
  if (row.opted_out_at || row.unsubscribed_at) return false;
  if (row.kind === "confirmation") return row.confirmation_consent && ["waiting", "called"].includes(row.guest_status);
  if (!row.subscribed_at) return false;
  if (row.kind === "review") return row.feedback_consent && row.guest_status === "seated" && !!row.seated_at;
  return ["waiting", "called"].includes(row.guest_status) && !!row.eta_at;
}
export function callbackUrl(path: string) {
  const base = new URL(process.env.WHATSAPP_CALLBACK_BASE_URL || "");
  if (base.protocol !== "https:" || base.username || base.password || base.search || base.hash) {
    throw new Error("WhatsApp callback base must be a canonical HTTPS URL");
  }
  return new URL(path, base.origin).toString();
}
