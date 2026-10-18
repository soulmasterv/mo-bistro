import "server-only";
import {confirmationEstimate} from '@/lib/advanced/estimates';
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
  booking: { phone: string; name: string; eta_at?: Date | null; subscribed_at?: Date | null },
  code: string,
): Promise<SendResult> {
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
  if (!customerWindowEnabled())
    return sendTemplate(templatePayload(job, booking, code));
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
    eta_update: "WHATSAPP_ETA_UPDATE",
  }[job.kind];
  const subscribedConfirmation = job.kind === "confirmation" && !!booking.subscribed_at;
  const text = subscribedConfirmation
    ? "Thanks for booking with Mo Bistro, {name}! Your booking #{booking_id} is on our waitlist. You're subscribed to WhatsApp updates. We'll let you know when your table is nearly ready."
    : process.env[prefix + "_TEXT"] ?? (job.kind === "eta_update"
    ? "Mo Bistro update: your table is expected to be ready at {eta_time}. This is an estimate; reception will confirm when your table is ready."
    : job.kind === "almost_ready"
    ? "Hi {name}, your table for Mo Bistro booking #{booking_id} is expected to be ready in about 10 minutes. Please stay nearby; reception will confirm when your table is ready."
    : job.kind === "review"
    ? "Thank you for joining us at Mo Bistro, {name}! We hope you're enjoying your visit. Our review page is coming soon."
    : undefined);
  if (open && text) {
    let body = text
      .replaceAll("{name}", booking.name)
      .replaceAll("{booking_id}", String(job.guest_id))
      .replaceAll("{eta_time}", booking.eta_at ? new Intl.DateTimeFormat("en-GB", { timeZone:"Africa/Cairo",hour:"numeric",minute:"2-digit",hour12:true }).format(new Date(booking.eta_at)) : "")
      .replaceAll("{subscribe_command}", `SUBSCRIBE ${job.guest_id} ${code}`);
    if(job.kind==='confirmation'){
      const estimate=await confirmationEstimate(sql,job.id,job.guest_id);
      if(estimate)body+='\n\nEstimated wait: '+estimate+'.';
    }
    if (
      body.length > 4096 ||
      /\{(?:name|booking_id|subscribe_command|eta_time)\}/.test(body)
    )
      return { state: "skipped", error: "notification_text_invalid" };
    // Confirmation must preserve the explicit reply path when the guest is not yet subscribed.
    if (job.kind === "confirmation" && !subscribedConfirmation && !text.includes("{subscribe_command}"))
      return {
        state: "skipped",
        error: "confirmation_subscription_copy_missing",
      };
    const optOut =
      "To unsubscribe at any time, reply UNSUBSCRIBE or STOP on WhatsApp.";
    if (!body.includes(optOut)) body += "\n\n" + optOut;
    if (body.length > 4096)
      return { state: "skipped", error: "notification_text_invalid" };
    if (job.kind === "review") {
      if (body.length > 1024)
        return { state: "skipped", error: "notification_text_invalid" };
      // Temporary reply button: no URL, review submission or subscription action.
      return requestMetaTemplate({
        messaging_product: "whatsapp", to: booking.phone, type: "interactive",
        biz_opaque_callback_data: job.id,
        interactive: { type: "button", body: { text: body }, action: { buttons: [
          { type: "reply", reply: { id: "review_placeholder", title: "Leave a review" } },
        ] } },
      });
    }
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
