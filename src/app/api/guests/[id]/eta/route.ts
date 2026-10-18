import { hasGuestEtaColumn } from "@/lib/guest-eta-support";
import { randomUUID } from "node:crypto";
import { currentStaff } from "@/lib/staff-auth";
import { setActivityActor } from "@/lib/staff-activity";
import { NextResponse, after } from "next/server";
import { scheduleEtaUpdate, scheduleAlmostReady, dispatchOutbox } from "@/lib/whatsapp/service";
import { liveSendingEnabled, whatsappEnabled } from "@/lib/whatsapp/policy";
import { z } from "zod";
import { getPostgres } from "@/lib/postgres-db";
import { requireActiveLicense } from "@/lib/licensing/enforce";
import { requireReceptionStaff, rejectCrossOrigin } from "@/lib/guest-api-security";
import {advancedPreview} from '@/lib/advanced/flags';
import {queueManualNearlyReady,manualNearlyReadyKey} from '@/lib/advanced/manual-nearly-ready';

export const runtime = "nodejs";

const EtaSchema = z.object({
  minutes: z.number().int().min(1).max(240).nullable(),
  requestId: z.uuid().optional(),
  message:z.enum(['eta_update','almost_ready']).default('eta_update'),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const denied = await requireReceptionStaff();
  if (denied) return denied;

  const badOrigin = rejectCrossOrigin(request);
  if (badOrigin) return badOrigin;

  const licenseError = await requireActiveLicense();
  if (licenseError) return licenseError;

  if (process.env.MO_BISTRO_DB !== "postgres") {
    return NextResponse.json(
      { error: "PostgreSQL required for manual ETAs" },
      { status: 503 }
    );
  }

  const { id } = await context.params;
  const guestId = Number(id);

  if (!Number.isSafeInteger(guestId) || guestId < 1) {
    return NextResponse.json({ error: "Invalid guest ID" }, { status: 400 });
  }

  const payload = await request.json().catch(() => null);
  const parsed = EtaSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Enter 1–240 minutes, or null to clear the ETA" },
      { status: 400 }
    );
  }

  try {
    const sql = getPostgres();
    if (!(await hasGuestEtaColumn())) {
      return NextResponse.json(
        { error: "Manual ETA is not enabled in the database yet." },
        { status: 503 }
      );
    }


    const minutes = parsed.data.minutes;
    const actor = await currentStaff();
    const requestId = parsed.data.requestId ?? randomUUID();
    const [schema] = await sql`SELECT to_regclass('public.guest_eta_changes') IS NOT NULL AS eta_updates`;
    const etaUpdates = schema?.eta_updates === true;
    const manual=parsed.data.message==='almost_ready';
    if(manual&&(!advancedPreview()||!etaUpdates||minutes!==10))return NextResponse.json({error:'Manual nearly-ready requires Advanced Preview, ETA setup and a 10-minute estimate.'},{status:400});
    if(manual&&!actor)return NextResponse.json({error:'Unauthorized'},{status:401});

    const updated = await sql.begin(async tx => {
      await setActivityActor(tx, actor?.id);
      // Serialize duplicate requests and seating against the same authoritative guest row.
      await tx`SELECT id FROM guests WHERE id=${guestId} FOR UPDATE`;
      if (etaUpdates) {
        const previous = await tx`SELECT guest_id,minutes,eta_at FROM public.guest_eta_changes WHERE request_id=${requestId}`;
        if (previous.length) {
          if (previous[0].guest_id !== guestId || previous[0].minutes !== minutes)
            throw new Error("ETA request ID already used");
          return [{ id:guestId,eta_at:previous[0].eta_at,replayed:true }];
        }
      }
      if(manual){
        const [existing]=await tx`SELECT n.id,g.eta_at FROM whatsapp_notifications n JOIN guests g ON g.id=n.guest_id
          WHERE n.guest_id=${guestId} AND n.event_key=${manualNearlyReadyKey(guestId)}`;
        if(existing){
          await tx`INSERT INTO whatsapp_delivery_logs(notification_id,event_key,event)
            VALUES(${existing.id},${'manual:'+requestId},${'manual_duplicate_by_staff:'+actor?.id}) ON CONFLICT(event_key) DO NOTHING`;
          return [{id:guestId,eta_at:existing.eta_at,replayed:true,manualQueued:false}];
        }
      }
      const rows = await tx`
      UPDATE guests
      SET eta_at = CASE
        WHEN ${minutes}::integer IS NULL THEN NULL
        ELSE NOW() + (${minutes}::integer * INTERVAL '1 minute')
      END,
      updated_at = CURRENT_TIMESTAMP
      WHERE id = ${guestId}
        AND status IN ('waiting', 'called')
      RETURNING id, eta_at
    `;
      if (rows.length && etaUpdates) await tx`INSERT INTO public.guest_eta_changes(request_id,guest_id,minutes,eta_at)
        VALUES (${requestId},${guestId},${minutes},${rows[0].eta_at})`;
      let manualQueued=false;
      if (rows.length && whatsappEnabled()) {
        const eta = rows[0].eta_at ? new Date(rows[0].eta_at) : null;
        if(manual&&eta&&actor){
          await scheduleEtaUpdate(tx,guestId,null,requestId);
          manualQueued=await queueManualNearlyReady(tx,guestId,eta,actor.id,requestId);
        }else if (etaUpdates) await scheduleEtaUpdate(tx,guestId,eta,requestId);
        // <=10 minutes: the immediate ETA update covers the imminent alert too.
        await scheduleAlmostReady(tx,guestId,etaUpdates && eta && eta.getTime()-Date.now()<=10*60_000 ? null : eta);
      }
      return rows.map(row=>({id:row.id,eta_at:row.eta_at,replayed:false,manualQueued}));
    });

    if (updated.length) {
      if (whatsappEnabled() && (!updated[0].replayed||manual)) after(async () => {
        try { await dispatchOutbox(); } catch { console.error("WhatsApp outbox dispatch deferred"); }
      });
      return NextResponse.json({
        success: true,
        eta_at: updated[0].eta_at,
        manual_nearly_ready:manual?('manualQueued' in updated[0]&&updated[0].manualQueued?'queued':'already_requested_or_disabled'):undefined,
        whatsapp: !etaUpdates ? "migration_required" : !whatsappEnabled() ? "disabled" : liveSendingEnabled() ? "queued_if_subscribed" : "simulated_if_subscribed",
      });
    }

    const existing = await sql`
      SELECT id FROM guests WHERE id = ${guestId}
    `;

    return NextResponse.json(
      {
        error: existing.length
          ? "ETA can only be changed for waiting or called guests"
          : "Guest not found",
      },
      { status: existing.length ? 409 : 404 }
    );
  } catch (error) {
    console.error("Unable to update guest ETA:", error);
    return NextResponse.json(
      { error: "Unable to update ETA. Check that the migration has been applied." },
      { status: 503 }
    );
  }
}
