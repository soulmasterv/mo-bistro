import "server-only";
import { randomUUID } from "node:crypto";
import type { TransactionSql } from "postgres";
import { getPostgres } from "@/lib/postgres-db";
import { whatsappEnabled } from "@/lib/whatsapp/policy";
import {
  sendPilotText,
  type PilotMessageParty,
} from "@/lib/pilot/message-delivery";

export async function queuePilotBookingMessage(
  tx: TransactionSql,
  partyId: number,
  kind: "subscription" | "seated",
) {
  if (!whatsappEnabled()) return;
  await tx`INSERT INTO public.pilot_booking_messages(id,party_id,kind)
    VALUES(${randomUUID()},${partyId},${kind}) ON CONFLICT(party_id,kind) DO NOTHING`;
}

/** A durable claim prevents duplicate sends, even when the provider result is uncertain. */
export async function dispatchPilotBookingMessages(partyId?: number) {
  if (!whatsappEnabled()) return;
  const sql = getPostgres();
  await sql`UPDATE public.pilot_booking_messages SET status='unknown',last_error='send_interrupted',updated_at=NOW()
    WHERE status='sending' AND updated_at<NOW()-INTERVAL '1 minute'`;
  const jobs =
    await sql`SELECT id FROM public.pilot_booking_messages WHERE status='pending'
    AND (${partyId ?? null}::integer IS NULL OR party_id=${partyId ?? null}) ORDER BY created_at,id LIMIT 8`;
  for (const job of jobs) await deliverPilotBookingMessage(job.id);
}

export async function deliverPilotBookingMessage(id: string) {
  if (!whatsappEnabled()) return;
  const sql = getPostgres();
  const [job] =
    await sql`UPDATE public.pilot_booking_messages SET status='sending',updated_at=NOW()
    WHERE id=${id} AND status='pending' RETURNING party_id,kind`;
  if (!job) return;
  await sql.begin(async (tx) => {
    const [party] = await tx<
      PilotMessageParty[]
    >`SELECT * FROM public.guests WHERE id=${job.party_id} FOR UPDATE`;
    let result;
    const validState =
      party &&
      !party.pending_exit_kind &&
      (job.kind === "seated"
        ? party.status === "seated" &&
          !!party.whatsapp_seated_consent_at &&
          !!party.seated_at &&
          new Date(party.seated_at).getTime() > Date.now() - 15 * 60_000
        : ["waiting", "called"].includes(party.status));
    if (!validState)
      result = {
        state: "skipped",
        error: "booking_ineligible",
        messageId: undefined,
      };
    else
      result = await sendPilotText(
        tx,
        party,
        id,
        job.kind === "subscription"
          ? `You're on the Mo Bistro waitlist (booking #${party.id}). We'll message you here when your table is ready.`
          : "You're seated. Enjoy your meal at Mo Bistro!",
      );
    // A definite failed send stays visible for inspection; uncertain sends are never rearmed.
    const state = result.state === "pending" ? "failed" : result.state;
    await tx`UPDATE public.pilot_booking_messages SET status=${state},provider_message_id=${result.messageId ?? null},
      last_error=${result.error ?? null},updated_at=NOW() WHERE id=${id}`;
  });
}
