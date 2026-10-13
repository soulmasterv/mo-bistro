import "server-only";
import type { Sql, TransactionSql } from "postgres";
import {
  liveSendingEnabled,
  normalizePhone,
  type NotificationKind,
} from "@/lib/whatsapp/policy";
import {
  requestMetaTemplate,
  templatePayload,
  sendTemplate,
  type SendResult,
} from "@/lib/whatsapp/transport";
export function customerWindowEnabled() {
  return process.env.WHATSAPP_WINDOW_TEXT_ENABLED === "true";
}
export async function recordCustomerWindow(
  sql: Sql,
  phone: string,
  timestamp: number,
) {
  if (!customerWindowEnabled() || timestamp * 1000 > Date.now()) return;
  const business = process.env.META_WHATSAPP_PHONE_NUMBER_ID;
  if (!business) throw Error("Business number missing");
  await sql`INSERT INTO whatsapp_customer_windows (phone,phone_number_id,last_inbound_at)
 VALUES (${phone},${business},${new Date(timestamp * 1000)})
 ON CONFLICT (phone,phone_number_id) DO UPDATE SET last_inbound_at=GREATEST(whatsapp_customer_windows.last_inbound_at,EXCLUDED.last_inbound_at)`;
}
export async function sendWindowNotification(
  sql: TransactionSql,
  job: { id: string; kind: NotificationKind; guest_id: number },
  booking: { phone: string; name: string },
  code: string,
): Promise<SendResult> {
  if (!customerWindowEnabled())
    return sendTemplate(templatePayload(job, booking, code));
  if (!liveSendingEnabled()) return { state: "simulated" };
  if (process.env.VERCEL_ENV === "preview") {
    try {
      if (
        normalizePhone(process.env.WHATSAPP_TEST_RECIPIENT || "") !==
        booking.phone
      )
        return { state: "skipped", error: "preview_recipient_not_allowed" };
    } catch {
      return { state: "skipped", error: "preview_recipient_not_configured" };
    }
  }
  const business = process.env.META_WHATSAPP_PHONE_NUMBER_ID;
  if (!business)
    return { state: "skipped", error: "business_number_not_configured" };
  let open = false;
  try {
    const [window] =
      await sql`SELECT last_inbound_at FROM whatsapp_customer_windows WHERE phone=${booking.phone}
    AND phone_number_id=${business} AND last_inbound_at>clock_timestamp()-INTERVAL '24 hours' + INTERVAL '10 seconds' AND last_inbound_at<=clock_timestamp()`;
    open = !!window;
  } catch {
    return { state: "skipped", error: "customer_window_schema_unavailable" };
  }
  const prefix = {
    confirmation: "WHATSAPP_CONFIRMATION",
    almost_ready: "WHATSAPP_ALMOST_READY",
    review: "WHATSAPP_REVIEW",
  }[job.kind];
  const text = process.env[prefix + "_TEXT"];
  if (open && text) {
    let body = text
      .replaceAll("{name}", booking.name)
      .replaceAll("{booking_id}", String(job.guest_id))
      .replaceAll("{subscribe_command}", `SUBSCRIBE ${job.guest_id} ${code}`);
    if (
      body.length > 4096 ||
      /\{(?:name|booking_id|subscribe_command)\}/.test(body)
    )
      return { state: "skipped", error: "notification_text_invalid" };
    // Confirmation must preserve the explicit reply path when the guest is not yet subscribed.
    if (job.kind === "confirmation" && !text.includes("{subscribe_command}"))
      return {
        state: "skipped",
        error: "confirmation_subscription_copy_missing",
      };
    const optOut =
      "To unsubscribe at any time, reply UNSUBSCRIBE or STOP on WhatsApp.";
    if (!body.includes(optOut)) body += "\n\n" + optOut;
    if (body.length > 4096)
      return { state: "skipped", error: "notification_text_invalid" };
    return requestMetaTemplate({
      messaging_product: "whatsapp",
      to: booking.phone,
      type: "text",
      text: { body },
      biz_opaque_callback_data: job.id,
    });
  }
  try {
    return await sendTemplate(templatePayload(job, booking, code));
  } catch {
    return {
      state: "skipped",
      error: open
        ? "notification_content_unconfigured"
        : "customer_window_closed_template_unconfigured",
    };
  }
}
