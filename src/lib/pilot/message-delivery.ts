import "server-only";
import type { TransactionSql } from "postgres";
import { usesKapso, whatsappPhoneId } from "@/lib/whatsapp/kapso";
import {
  liveSendingEnabled,
  normalizePhone,
  whatsappEnabled,
} from "@/lib/whatsapp/policy";
import { requestMetaTemplate, type SendResult } from "@/lib/whatsapp/transport";

export type PilotMessageParty = {
  id: number;
  name: string;
  status: string;
  seated_at: Date | string | null;
  pending_exit_kind: string | null;
  pending_exit_at: Date | string | null;
  phone: string;
  whatsapp_consent_at: Date | string | null;
  whatsapp_inbound_after_opt_in_at: Date | string | null;
  whatsapp_seated_consent_at?: Date | string | null;
};

/** All Pilot text types share the same consent, recipient, and window checks. */
export async function sendPilotText(
  tx: TransactionSql,
  party: PilotMessageParty,
  id: string,
  body: string,
): Promise<SendResult> {
  if (!party.whatsapp_consent_at)
    return { state: "skipped", error: "guest_not_opted_in" };
  if (!whatsappEnabled())
    return { state: "skipped", error: "whatsapp_disabled" };
  if (!liveSendingEnabled()) return { state: "simulated" };
  if (usesKapso() && !party.whatsapp_inbound_after_opt_in_at)
    return { state: "skipped", error: "guest_reply_required" };
  const phone = normalizePhone(party.phone);
  await tx`SELECT pg_advisory_xact_lock(hashtext(${phone}))`;
  const [stop] = usesKapso()
    ? []
    : await tx`SELECT opted_out_at FROM public.whatsapp_contact_preferences WHERE phone=${phone}`;
  if (
    stop?.opted_out_at &&
    new Date(stop.opted_out_at) >= new Date(party.whatsapp_consent_at)
  )
    return { state: "skipped", error: "guest_unsubscribed" };
  if (process.env.VERCEL_ENV !== "production") {
    let testPhone: string | null = null;
    try {
      testPhone = normalizePhone(process.env.WHATSAPP_TEST_RECIPIENT || "");
    } catch {}
    if (phone !== testPhone)
      return { state: "skipped", error: "preview_recipient_not_allowed" };
  }
  const [window] =
    await tx`SELECT last_inbound_at FROM public.whatsapp_customer_windows WHERE phone=${phone}
    AND phone_number_id=${whatsappPhoneId() || ""}
    AND last_inbound_at>clock_timestamp()-INTERVAL '24 hours'+INTERVAL '10 seconds'
    AND last_inbound_at<=clock_timestamp()`;
  if (!window)
    return { state: "skipped", error: "customer_service_window_closed" };
  if (process.env.WHATSAPP_WINDOW_TEXT_ENABLED !== "true")
    return { state: "skipped", error: "window_text_disabled" };
  return requestMetaTemplate({
    messaging_product: "whatsapp",
    to: phone,
    type: "text",
    biz_opaque_callback_data: id,
    text: { body },
  });
}
