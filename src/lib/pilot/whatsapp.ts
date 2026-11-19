import "server-only";
import { Receiver } from "@upstash/qstash";
import { getPostgres } from "@/lib/postgres-db";

import { PILOT_ORIGIN, PILOT_JOB_PATH } from "./config";
import { finalizePendingExits } from "@/lib/pilot/store";
import {
  sendPilotText,
  type PilotMessageParty,
} from "@/lib/pilot/message-delivery";
import { dispatchPilotBookingMessages } from "@/lib/pilot/booking-messages";

export async function verifyPilotJob(raw: string, signature: string | null) {
  const current = process.env.QSTASH_CURRENT_SIGNING_KEY,
    next = process.env.QSTASH_NEXT_SIGNING_KEY;
  if (!current || !next || !signature) return false;
  try {
    return await new Receiver({
      currentSigningKey: current,
      nextSigningKey: next,
    }).verify({ signature, body: raw, url: PILOT_ORIGIN + PILOT_JOB_PATH });
  } catch {
    return false;
  }
}
// Pilot Notify is immediate: do not wait for an external scheduling callback.
// Leases avoid waste; the durable delivery claim remains the at-most-once boundary.
export async function publishPilotCalls(partyId?: number) {
  const sql = getPostgres();
  await sql`UPDATE public.pilot_ready_messages SET status='unknown',last_error='send_interrupted',updated_at=NOW()
 WHERE status='sending' AND updated_at<NOW()-INTERVAL '1 minute'`;
  const jobs =
    await sql`UPDATE public.pilot_ready_messages SET publish_lease_until=NOW()+INTERVAL '30 seconds'
 WHERE id IN (SELECT id FROM public.pilot_ready_messages WHERE status IN ('pending','scheduled')
 AND (${partyId ?? null}::integer IS NULL OR party_id=${partyId ?? null})
 AND publish_retry_at<=NOW() AND (publish_lease_until IS NULL OR publish_lease_until<NOW())
 ORDER BY created_at LIMIT 2 FOR UPDATE SKIP LOCKED) RETURNING id`;
  await Promise.all(jobs.map((job) => deliverPilotCall(job.id)));
  await dispatchPilotBookingMessages(partyId);
}
export async function deliverPilotCall(id: string) {
  await finalizePendingExits();
  const sql = getPostgres();
  const claimed =
    await sql`UPDATE public.pilot_ready_messages SET status='sending',attempts=attempts+1,updated_at=NOW()
 WHERE id=${id} AND status IN ('pending','scheduled') RETURNING party_id`;
  if (!claimed.length) return;
  await sql.begin(async (tx) => {
    const [party] = await tx<
      PilotMessageParty[]
    >`SELECT * FROM public.guests WHERE id=${claimed[0].party_id} FOR UPDATE`;
    if (party?.pending_exit_at) {
      await tx`UPDATE public.pilot_ready_messages SET status='pending',attempts=attempts-1,publish_retry_at=${party.pending_exit_at},publish_lease_until=NULL,updated_at=NOW() WHERE id=${id}`;
      return;
    }
    const result =
      !party || party.status !== "waiting"
        ? { state: "skipped", error: "party_not_waiting", messageId: undefined }
        : await sendPilotText(
            tx,
            party,
            id,
            `Hi ${party.name}, your table is ready at Mo Bistro. Please come to reception for booking #${party.id}.`,
          );
    const state = result.state === "pending" ? "failed" : result.state;
    const error = result.error ?? null;
    const messageId = result.messageId ?? null;
    await tx`UPDATE public.pilot_ready_messages SET status=${state},last_error=${error},provider_message_id=${messageId},updated_at=NOW() WHERE id=${id}`;
    if (state === "sent")
      await tx`UPDATE public.guests SET status='called',called_at=clock_timestamp(),informed_via='whatsapp_accepted' WHERE id=${party.id} AND status='waiting'`;
  });
}
