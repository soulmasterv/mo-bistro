import { hasGuestEtaColumn } from "@/lib/guest-eta-support";
import { NextResponse, after } from "next/server";
import { scheduleAlmostReady, dispatchOutbox } from "@/lib/whatsapp/service";
import { whatsappEnabled } from "@/lib/whatsapp/policy";
import { z } from "zod";
import { getPostgres } from "@/lib/postgres-db";
import { requireActiveLicense } from "@/lib/licensing/enforce";
import { requireReceptionStaff, rejectCrossOrigin } from "@/lib/guest-api-security";

export const runtime = "nodejs";

const EtaSchema = z.object({
  minutes: z.number().int().min(1).max(240).nullable(),
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

    const updated = await sql.begin(async tx => {
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
      if (rows.length && whatsappEnabled()) await scheduleAlmostReady(tx,guestId,
        rows[0].eta_at ? new Date(rows[0].eta_at) : null);
      return rows;
    });

    if (updated.length) {
      if (whatsappEnabled()) after(async () => {
        try { await dispatchOutbox(); } catch { console.error("WhatsApp outbox dispatch deferred"); }
      });
      return NextResponse.json({
        success: true,
        eta_at: updated[0].eta_at,
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
