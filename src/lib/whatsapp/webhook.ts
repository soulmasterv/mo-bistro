import "server-only";
import { getPostgres } from "@/lib/postgres-db";
import { hashCode, isStop, normalizePhone, parseSubscription } from "@/lib/whatsapp/policy";
import { scheduleAlmostReady, scheduleReview } from "@/lib/whatsapp/service";

type InboundMessage = { id: string; from: string; timestamp: string; type: string;
  text?: { body?: string }; button?: { payload?: string }; context?: { id?: string } };
type DeliveryStatus = { id: string; status: string; timestamp: string; biz_opaque_callback_data?: string;
  errors?: { code?: number }[] };
export type MetaPayload = { object?: string; entry?: { changes?: { field?: string; value?: {
  metadata?: { phone_number_id?: string }; messages?: InboundMessage[]; statuses?: DeliveryStatus[];
} }[] }[] };

export async function processMetaWebhook(payload: MetaPayload) {
  if (payload.object !== "whatsapp_business_account" || !Array.isArray(payload.entry)) throw new Error("Invalid Meta envelope");
  const sql = getPostgres();
  for (const entry of payload.entry) for (const change of entry.changes || []) {
    if (change.field !== "messages") continue;
    const value = change.value;
    if (!process.env.META_WHATSAPP_PHONE_NUMBER_ID ||
        value?.metadata?.phone_number_id !== process.env.META_WHATSAPP_PHONE_NUMBER_ID) continue;
    for (const message of value.messages || []) {
      if (typeof message.id !== "string" || message.id.length > 256 ||
          typeof message.from !== "string" || !/^\d{8,15}$/.test(message.from)) continue;
      const phone = normalizePhone(message.from);
      const timestamp = Number(message.timestamp);
      if (!Number.isSafeInteger(timestamp) || timestamp <= 0 || timestamp * 1000 > Date.now()+300_000) continue;
      const text = message.type === "button" ? message.button?.payload || "" :
        message.type === "text" ? message.text?.body || "" : "";
      const stopped = message.type === "text" && isStop(text);
      const subscription = parseSubscription(text);
      await sql.begin(async tx => {
        // Same phone lock as the sender: STOP and send decisions have a defined order.
        await tx`SELECT pg_advisory_xact_lock(hashtext(${phone}))`;
        const recorded = await tx`INSERT INTO whatsapp_inbound_events (message_id,phone,action)
          VALUES (${message.id},${phone},'ignored') ON CONFLICT (message_id) DO NOTHING RETURNING message_id`;
        if (!recorded.length) return;
        if (stopped) {
          await tx`INSERT INTO whatsapp_contact_preferences (phone,opted_out_at) VALUES (${phone},NOW())
            ON CONFLICT (phone) DO UPDATE SET opted_out_at=NOW()`;
          await tx`UPDATE whatsapp_booking_consents SET unsubscribed_at=NOW(),feedback_consent=FALSE WHERE phone=${phone}`;
          await tx`UPDATE whatsapp_notifications SET status='skipped',revision=revision+1,updated_at=NOW()
            WHERE guest_id IN (SELECT guest_id FROM whatsapp_booking_consents WHERE phone=${phone})
              AND status IN ('pending','scheduled')`;
          await tx`UPDATE whatsapp_inbound_events SET action='stop' WHERE message_id=${message.id}`;
          return;
        }
        if (!subscription) return;
        const [booking] = await tx`SELECT c.*,g.status,g.eta_at,g.seated_at FROM whatsapp_booking_consents c
          JOIN guests g ON g.id=c.guest_id WHERE c.guest_id=${subscription.guestId} AND c.phone=${phone}
            AND c.subscription_token_hash=${hashCode(subscription.code)} AND c.subscription_expires_at>NOW()
          FOR UPDATE OF c`;
        if (!booking || !["waiting","called","seated"].includes(booking.status)) return;
        const [preference] = await tx`SELECT opted_out_at FROM whatsapp_contact_preferences WHERE phone=${phone}`;
        if (preference?.opted_out_at && timestamp*1000 <= new Date(preference.opted_out_at).getTime()) return;
        if (message.type === "button") {
          if (!message.context?.id) return;
          const confirmation = await tx`SELECT id FROM whatsapp_notifications WHERE guest_id=${booking.guest_id}
            AND kind='confirmation' AND provider_message_id=${message.context.id} AND status='sent'`;
          if (!confirmation.length) return;
        } else if (message.type !== "text") return;
        await tx`INSERT INTO whatsapp_contact_preferences (phone,opted_out_at) VALUES (${phone},NULL)
          ON CONFLICT (phone) DO UPDATE SET opted_out_at=NULL`;
        await tx`UPDATE whatsapp_booking_consents SET subscribed_at=COALESCE(subscribed_at,NOW()),
          unsubscribed_at=NULL,subscribed_message_id=${message.id} WHERE guest_id=${booking.guest_id}`;
        await tx`UPDATE whatsapp_inbound_events SET guest_id=${booking.guest_id},action='subscribe' WHERE message_id=${message.id}`;
        await scheduleAlmostReady(tx,booking.guest_id,booking.eta_at ? new Date(booking.eta_at) : null);
        if (booking.seated_at) await scheduleReview(tx,booking.guest_id,new Date(booking.seated_at));
      });
    }
    for (const status of value.statuses || []) {
      if (typeof status.id !== "string" || status.id.length > 256 ||
          !["sent","delivered","read","failed"].includes(status.status)) continue;
      const timestamp = Number(status.timestamp);
      if (!Number.isSafeInteger(timestamp) || timestamp <= 0) continue;
      await sql.begin(async tx => {
        // The opaque job ID reconciles an accepted send whose HTTP response was lost.
        const jobId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(status.biz_opaque_callback_data || "")
          ? status.biz_opaque_callback_data! : null;
        const [notification] = await tx`SELECT id FROM whatsapp_notifications WHERE
          provider_message_id=${status.id} OR (id=${jobId}::uuid AND status IN ('unknown','sending','sent'))
          LIMIT 1 FOR UPDATE`;
        if (!notification) return;
        await tx`INSERT INTO whatsapp_delivery_logs (notification_id,event_key,event,provider_message_id,provider_timestamp,error_code)
          VALUES (${notification.id},${`meta:${status.id}:${status.status}:${timestamp}`},${status.status},
            ${status.id},${timestamp},${status.errors?.[0]?.code?.toString() ?? null})
          ON CONFLICT (event_key) DO NOTHING`;
        await tx`UPDATE whatsapp_notifications SET provider_message_id=COALESCE(provider_message_id,${status.id}),
          status=CASE WHEN ${status.status}='failed' THEN 'failed' ELSE 'sent' END,updated_at=NOW()
          WHERE id=${notification.id} AND status IN ('unknown','sending')`;
      });
    }
  }
}
