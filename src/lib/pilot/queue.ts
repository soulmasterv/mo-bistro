export type Party = {
  id: number;
  name: string;
  phone: string;
  party_size: number;
  preference: string;
  status: string;
  joined_at: string;
  called_at: string | null;
  whatsapp_consent: boolean;
  whatsapp_subscription?: "subscribed" | "awaiting_reply" | "not_subscribed";
  message_status: string | null;
  message_error: string | null;
  pending_exit_kind: string | null;
  pending_exit_at: string | null;
  pending_exit_token: string | null;
  phone_call_taps: number;
  informed_via: string | null;
  server_now?: string;
  received_at?: number;
};
export type QueueAction =
  | "notify"
  | "retry"
  | "seated"
  | "cancel"
  | "no_show"
  | "phone_call"
  | "guest_informed"
  | "undo";
export type ActionHandler = (
  id: number,
  action: QueueAction,
  reason?: string,
) => void;
const failedStates = ["failed", "unknown", "skipped", "simulated"];
export const messageFailed = (p: Party) =>
  failedStates.includes(p.message_status || "") || !!p.message_error;
export const needsPhone = (p: Party) => !p.whatsapp_consent || messageFailed(p);
export function subscriptionLabel(party: Party) {
  switch (party.whatsapp_subscription) {
    case "subscribed":
      return "Subscribed";
    case "awaiting_reply":
      return "Awaiting WhatsApp reply";
    case "not_subscribed":
      return "Not subscribed";
    default:
      return party.whatsapp_consent
        ? "Subscription unverified"
        : "Not subscribed";
  }
}
export function messageLabel(p: Party, compact = false) {
  if (p.informed_via === "staff_confirmed")
    return compact ? "Informed" : "Guest informed by staff";
  if (p.message_status === "sent")
    return compact ? "Accepted" : "Message accepted · delivery unconfirmed";
  if (p.message_status === "simulated")
    return compact ? "Test only" : "Test mode — message not sent";
  if (p.message_status === "unknown")
    return compact ? "Unconfirmed" : "Send unconfirmed — call guest";
  if (messageFailed(p))
    return compact ? "Failed · call" : "Message failed — call guest";
  return p.message_status
    ? "Sending message…"
    : p.whatsapp_consent
      ? "WhatsApp enabled"
      : "Not subscribed";
}
export function failureDetail(p: Party) {
  if (p.message_status === "simulated")
    return "Live WhatsApp sending is off. Call this guest directly.";
  const reasons: Record<string, string> = {
    guest_not_opted_in:
      "Guest has not subscribed to WhatsApp. Call them directly.",
    guest_unsubscribed: "Guest unsubscribed. Call them directly.",
    customer_service_window_closed:
      "The guest needs to send a new WhatsApp message before we can reply. Call them directly.",
    window_text_disabled: "WhatsApp text sending is disabled. Call this guest.",
    preview_recipient_not_allowed:
      "Dev can message only the configured test number. Call this guest.",
    scheduler_unavailable: "Message scheduling failed. Call this guest.",
    whatsapp_disabled: "WhatsApp is disabled. Call this guest.",
  };
  return p.message_error
    ? reasons[p.message_error] ||
        "The message could not be confirmed. Call this guest."
    : "";
}
export const partyTime = (value: string) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Cairo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
export const partyWhatsApp = (p: Party) =>
  "https://wa.me/" + (p.phone.startsWith("0") ? "2" + p.phone : p.phone);
export const observedPartyTime = (
  p: Pick<Party, "server_now" | "received_at">,
  now: number,
) =>
  p.server_now && p.received_at !== undefined
    ? new Date(p.server_now).getTime() + Math.max(0, now - p.received_at)
    : now;
export const partyWait = (p: Party, now: number) =>
  Math.max(
    0,
    Math.floor(
      (observedPartyTime(p, now) - new Date(p.joined_at).getTime()) / 60000,
    ),
  );
