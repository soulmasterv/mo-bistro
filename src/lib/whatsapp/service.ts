import "server-only";
import { randomUUID } from "node:crypto";
import type { TransactionSql } from "postgres";
import { getPostgres } from "@/lib/postgres-db";
import { CONSENT_VERSION, whatsappEnabled, normalizePhone, subscriptionCode, hashCode,
  eligible, dueTime, subscriptionMessage, type NotificationKind, type Eligibility } from "@/lib/whatsapp/policy";
import { sendWindowNotification } from "@/lib/whatsapp/customer-window";
import { publishJob } from "@/lib/whatsapp/transport";
import { schedulerErrorCode } from "@/lib/whatsapp/scheduler-error";
type DeliveryBooking = Eligibility & { id: string; guest_id: number; name: string; phone: string;
  revision: number; attempts: number; tracking_token_hash: string; subscription_expires_at: Date; eta_snapshot_at?: string | null };

export type BookingConsent = { whatsapp_confirmation_consent?: boolean; whatsapp_feedback_consent?: boolean };
export async function recordBookingConsent(tx: TransactionSql, guestId: number, phone: string,
  trackingHash: string, consent: BookingConsent) {
  if (!whatsappEnabled()) return;
  const code = subscriptionCode(guestId, trackingHash);
  await tx`INSERT INTO whatsapp_booking_consents (guest_id,phone,confirmation_consent,feedback_consent,
    consent_version,subscription_token_hash,subscription_expires_at)
    VALUES (${guestId},${normalizePhone(phone)},${!!consent.whatsapp_confirmation_consent},
      ${!!consent.whatsapp_feedback_consent},${CONSENT_VERSION},${hashCode(code)},NOW()+INTERVAL '30 days')`;
  if (consent.whatsapp_confirmation_consent) await queueNotification(tx, guestId, "confirmation", new Date());
}
export async function queueNotification(tx: TransactionSql, guestId: number, kind: NotificationKind, due: Date) {
  await tx`INSERT INTO whatsapp_notifications (id,guest_id,kind,due_at)
    VALUES (${randomUUID()},${guestId},${kind},${due})
    ON CONFLICT (guest_id,kind) WHERE kind NOT IN ('eta_update','almost_ready') DO UPDATE SET due_at=EXCLUDED.due_at,
      revision=whatsapp_notifications.revision+1,status='pending',qstash_message_id=NULL,
      publish_lease_until=NULL,updated_at=NOW()
    WHERE whatsapp_notifications.status IN ('pending','scheduled','skipped')`;
}
export async function scheduleEtaUpdate(tx: TransactionSql, guestId: number, eta: Date | null, requestId: string) {
  if (!whatsappEnabled()) return;
  // Supersede only jobs which have not started. Unknown or in-flight sends are never rearmed.
  await tx`UPDATE whatsapp_notifications SET status='skipped',revision=revision+1,last_error='eta_superseded',updated_at=NOW()
    WHERE guest_id=${guestId} AND kind='eta_update' AND status IN ('pending','scheduled')`;
  if (!eta) return;
  const [consent] = await tx`SELECT subscribed_at,unsubscribed_at FROM whatsapp_booking_consents WHERE guest_id=${guestId}`;
  if (!consent?.subscribed_at || consent.unsubscribed_at) return;
  await tx`INSERT INTO whatsapp_notifications(id,guest_id,kind,due_at,event_key,eta_snapshot_at)
    VALUES (${randomUUID()},${guestId},'eta_update',NOW(),${requestId},${eta})
    ON CONFLICT(event_key) WHERE event_key IS NOT NULL DO NOTHING`;
}
export async function scheduleAlmostReady(tx: TransactionSql, guestId: number, eta: Date | null) {
  if (!whatsappEnabled()) return;
  const [consent] = await tx`SELECT subscribed_at,unsubscribed_at FROM whatsapp_booking_consents WHERE guest_id=${guestId}`;
  const [schema] = await tx`SELECT to_regclass('public.guest_eta_changes') IS NOT NULL AS eta_updates`;
  if (schema?.eta_updates) {
    if (!eta || !consent?.subscribed_at || consent.unsubscribed_at) {
      await tx`UPDATE whatsapp_notifications SET status='skipped',revision=revision+1,updated_at=NOW()
        WHERE guest_id=${guestId} AND kind='almost_ready' AND status IN ('pending','scheduled')`;
      return;
    }
    const digest = hashCode(`almost-ready:${guestId}:${eta.toISOString()}`);
    const eventKey = `${digest.slice(0,8)}-${digest.slice(8,12)}-4${digest.slice(13,16)}-8${digest.slice(17,20)}-${digest.slice(20,32)}`;
    await tx`UPDATE whatsapp_notifications SET status='skipped',revision=revision+1,last_error='eta_superseded',updated_at=NOW()
      WHERE guest_id=${guestId} AND kind='almost_ready' AND event_key IS DISTINCT FROM ${eventKey}::uuid
        AND status IN ('pending','scheduled')`;
    await tx`INSERT INTO whatsapp_notifications(id,guest_id,kind,due_at,event_key,eta_snapshot_at)
      VALUES (${randomUUID()},${guestId},'almost_ready',${dueTime('almost_ready',eta)},${eventKey},${eta})
      ON CONFLICT(event_key) WHERE event_key IS NOT NULL DO UPDATE SET
        due_at=EXCLUDED.due_at,status='pending',revision=whatsapp_notifications.revision+1,
        qstash_message_id=NULL,publish_lease_until=NULL,updated_at=NOW()
      WHERE whatsapp_notifications.status IN ('pending','scheduled','skipped')`;
    return;
  }
  if (eta && consent?.subscribed_at && !consent?.unsubscribed_at) {
    await queueNotification(tx, guestId, "almost_ready", dueTime("almost_ready", eta));
  } else await tx`UPDATE whatsapp_notifications SET status='skipped',revision=revision+1,updated_at=NOW()
    WHERE guest_id=${guestId} AND kind='almost_ready' AND status IN ('pending','scheduled')`;
}
export async function scheduleReview(tx: TransactionSql, guestId: number, seated: Date) {
  if (!whatsappEnabled()) return;
  const due = dueTime("review", seated);
  // Late opt-in must not create a new feedback message after its intended window.
  // An already queued job may still be delivered late after a transient outage.
  if (due.getTime() <= Date.now()) return;
  const [consent] = await tx`SELECT subscribed_at,unsubscribed_at,feedback_consent FROM whatsapp_booking_consents WHERE guest_id=${guestId}`;
  if (consent?.subscribed_at && !consent.unsubscribed_at && consent.feedback_consent) {
    await queueNotification(tx, guestId, "review", due);
  }
}

export async function dispatchOutbox() {
  if (!whatsappEnabled()) return;
  const sql = getPostgres();
  // A dead worker may have sent a message: fail closed, never send it again automatically.
  await sql`UPDATE whatsapp_notifications SET status='unknown',last_error='worker_interrupted',updated_at=NOW()
    WHERE status='sending' AND updated_at < NOW()-INTERVAL '2 minutes'`;
  // Recover a published job whose provider retries exhausted before a DB claim.
  // A new revision invalidates old callbacks; 'sending'/'unknown' are never retried.
  await sql`UPDATE whatsapp_notifications SET status='pending',revision=revision+1,
    qstash_message_id=NULL,publish_lease_until=NULL,updated_at=NOW()
    WHERE status='scheduled' AND due_at<NOW()-INTERVAL '5 minutes'
      AND updated_at<NOW()-INTERVAL '5 minutes'`;
  const jobs = await sql`UPDATE whatsapp_notifications SET publish_lease_until=NOW()+INTERVAL '1 minute'
    WHERE id IN (SELECT id FROM whatsapp_notifications WHERE status='pending'
      AND (publish_lease_until IS NULL OR publish_lease_until<NOW())
      ORDER BY due_at LIMIT 25 FOR UPDATE SKIP LOCKED)
    RETURNING id,revision,due_at`;
  for (const job of jobs) {
    try {
      const result = await publishJob(job.id, job.revision, new Date(job.due_at));
      await sql`UPDATE whatsapp_notifications SET status='scheduled',qstash_message_id=${result.messageId},
        publish_lease_until=NULL,updated_at=NOW() WHERE id=${job.id} AND revision=${job.revision} AND status='pending'`;
      if (result.messageId.startsWith("test:") && new Date(job.due_at).getTime() <= Date.now()) {
        await deliverNotification(job.id, job.revision);
      }
    } catch (error) {
      const code = schedulerErrorCode(error);
      console.error("WhatsApp scheduler publication failed", { code });
      await sql`UPDATE whatsapp_notifications SET publish_lease_until=NULL,last_error=${code}
        WHERE id=${job.id} AND revision=${job.revision} AND status='pending'`;
    }
  }
  // Test mode has no provider scheduler. Authenticated drain simulates due jobs only.
  if (process.env.WHATSAPP_MODE !== "live" || process.env.WHATSAPP_ALLOW_LIVE_SEND !== "true") {
    const due = await sql`SELECT id,revision FROM whatsapp_notifications WHERE status='scheduled' AND due_at<=NOW() LIMIT 25`;
    for (const job of due) await deliverNotification(job.id, job.revision);
  }
}

export async function deliverNotification(id: string, revision: number): Promise<"done" | "retry"> {
  if (!whatsappEnabled()) return "done";
  const sql = getPostgres();
  const claimed = await sql`UPDATE whatsapp_notifications SET status='sending',attempts=attempts+1,updated_at=NOW()
    WHERE id=${id} AND revision=${revision} AND status IN ('pending','scheduled') AND due_at<=NOW()
    RETURNING guest_id`;
  if (!claimed.length) {
    const [early] = await sql`SELECT due_at,status,revision FROM whatsapp_notifications WHERE id=${id}`;
    return early && early.revision === revision && ["pending","scheduled"].includes(early.status) &&
      new Date(early.due_at).getTime() > Date.now() ? "retry" : "done";
  }
  // Claim is durable before network work. A transaction failure leaves 'sending', not a resendable job.
  return sql.begin(async tx => {
    const [contact] = await tx`SELECT phone FROM whatsapp_booking_consents WHERE guest_id=${claimed[0].guest_id}`;
    if (contact) await tx`SELECT pg_advisory_xact_lock(hashtext(${contact.phone}))`;
    const [booking] = await tx<DeliveryBooking[]>`SELECT n.id,n.kind,n.guest_id,n.revision,n.attempts,
      c.phone,c.confirmation_consent,c.feedback_consent,c.subscribed_at,c.unsubscribed_at,
      c.subscription_token_hash,c.subscription_expires_at,g.name,g.status AS guest_status,
      g.eta_at,g.seated_at,g.tracking_token_hash,p.opted_out_at,to_jsonb(n)->>'eta_snapshot_at' AS eta_snapshot_at
      FROM whatsapp_notifications n JOIN whatsapp_booking_consents c ON c.guest_id=n.guest_id
      JOIN guests g ON g.id=n.guest_id LEFT JOIN whatsapp_contact_preferences p ON p.phone=c.phone
      WHERE n.id=${id} AND n.revision=${revision} AND n.status='sending' FOR UPDATE OF n,c`;
    if (!booking) {
      await tx`UPDATE whatsapp_notifications SET status='skipped',updated_at=NOW() WHERE id=${id} AND status='sending'`;
      return "done";
    }
    const kind = booking.kind as NotificationKind;
    if ((kind === "eta_update" || (kind === "almost_ready" && booking.eta_snapshot_at)) &&
        (!booking.eta_snapshot_at || !booking.eta_at || new Date(booking.eta_snapshot_at).getTime() !== new Date(booking.eta_at).getTime())) {
      await tx`UPDATE whatsapp_notifications SET status='skipped',last_error='eta_superseded',updated_at=NOW() WHERE id=${id}`;
      return "done";
    }
    const currentDue = kind === "review" && booking.seated_at ? dueTime(kind,new Date(booking.seated_at)) :
      kind === "almost_ready" && booking.eta_at ? dueTime(kind,new Date(booking.eta_at)) : null;
    if (eligible({ ...booking, kind }) && currentDue && currentDue.getTime() > Date.now()) {
      await tx`UPDATE whatsapp_notifications SET status='pending',revision=revision+1,due_at=${currentDue},
        qstash_message_id=NULL,publish_lease_until=NULL,updated_at=NOW() WHERE id=${id}`;
      return "done";
    }
    if (!eligible({ ...booking, kind }) ||
        (["almost_ready","eta_update"].includes(kind) && (!booking.eta_at || new Date(booking.eta_at).getTime() < Date.now())) ||
        (kind === "confirmation" && new Date(booking.subscription_expires_at).getTime() < Date.now())) {
      await tx`UPDATE whatsapp_notifications SET status='skipped',last_error='consent_or_booking_ineligible',updated_at=NOW() WHERE id=${id}`;
      return "done";
    }
    let result;
    try {
      result = await sendWindowNotification(tx,{ id,kind,guest_id:booking.guest_id },booking,
        subscriptionCode(booking.guest_id,booking.tracking_token_hash));
    } catch { result = { state: "failed" as const,error: "notification_configuration_missing" }; }
    const retry = result.state === "pending" && booking.attempts < 6;
    const state = result.state === "pending" && !retry ? "failed" : result.state;
    await tx`UPDATE whatsapp_notifications SET status=${state},provider_message_id=${result.messageId ?? null},
      last_error=${result.error ?? null},publish_lease_until=NULL,updated_at=NOW() WHERE id=${id}`;
    await tx`INSERT INTO whatsapp_delivery_logs (notification_id,event_key,event,provider_message_id,error_code)
      VALUES (${id},${`send:${id}:${booking.attempts}`},${state},${result.messageId ?? null},${result.error ?? null})
      ON CONFLICT (event_key) DO NOTHING`;
    return retry ? "retry" : "done";
  });
}

export async function subscriptionState(trackingToken: string) {
  if (!whatsappEnabled()) return { available: false };
  const sql = getPostgres();
  const [booking] = await sql`SELECT c.*,g.tracking_token_hash,g.status,g.seated_at,
    EXISTS (SELECT 1 FROM whatsapp_notifications n WHERE n.guest_id=c.guest_id AND n.kind='review'
      AND n.status IN ('sent','sending','unknown')) AS review_dispatched FROM whatsapp_booking_consents c
    JOIN guests g ON g.id=c.guest_id WHERE g.tracking_token_hash=${hashCode(trackingToken)}`;
  if (!booking) return { available: false };
  const subscribed = !!booking.subscribed_at && !booking.unsubscribed_at;
  const number = process.env.WHATSAPP_BUSINESS_NUMBER;
  const available = !!number && /^[1-9]\d{7,14}$/.test(number) &&
    (subscribed || new Date(booking.subscription_expires_at).getTime() > Date.now()) &&
    ["waiting","called","seated"].includes(booking.status);
  const code = available && !subscribed ? subscriptionCode(booking.guest_id,booking.tracking_token_hash) : null;
  const feedbackEditable = available && !booking.review_dispatched &&
    (!booking.seated_at || new Date(booking.seated_at).getTime() + 60*60_000 > Date.now());
  return { available,subscribed,feedbackConsent: booking.feedback_consent,feedbackEditable,
    url: available && !subscribed ? `https://wa.me/${number}?text=${encodeURIComponent(subscriptionMessage(booking.guest_id,code!))}` : null };
}
