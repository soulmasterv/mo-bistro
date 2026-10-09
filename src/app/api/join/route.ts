import { isAllowedQROrigin } from "@/lib/qr-origin";
import { checkRateLimit } from "@/lib/api-rate-limit";
import { getPostgres } from "@/lib/postgres-db";
import { getSettingPostgres } from "@/lib/staff-auth-postgres";
import { requireActiveLicense } from "@/lib/licensing/enforce";
import { getSetting } from "@/lib/staff-auth";
import { verifyQR } from "@/lib/rotating-qr";
import { cookies } from "next/headers";
import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import db from "@/lib/db";
import {
  initializeTracking,
  newTrackingToken,
  hashTrackingToken,
} from "@/lib/guest-tracking";

const schema = z.object({
  name: z.string().trim().min(2).max(100),
  phone: z.string().trim().regex(
    /^01[0125][0-9]{8}$/,
    "Enter a valid 11-digit Egyptian mobile number."
  ),
  party_size: z.number().int().min(1).max(30),
  seating_preference: z.enum(["indoor", "outdoor", "any"]).default("any"),
  qr_code: z.string().optional(),
});

export async function POST(request: Request) {
  if (!isAllowedQROrigin(request)) {
    return NextResponse.json(
      { error: "Invalid request origin." },
      { status: 403 }
    );
  }

  const limited = await checkRateLimit(
    request, "join", 5, 600
  );
  if (limited) return limited;

  const licenseError = await requireActiveLicense();
  if (licenseError) return licenseError;

  try {
    const body = schema.safeParse(await request.json());

    if (!body.success) {
      return NextResponse.json(
        { error: "Please check your registration details." },
        { status: 400 }
      );
    }

    const setting = async (key: string, fallback: string) =>
      process.env.MO_BISTRO_DB === "postgres"
        ? getSettingPostgres(key, fallback) : getSetting(key, fallback);

    const qrRequired = (await setting("qr_required", "false")) === "true";
    const postgresMode = process.env.MO_BISTRO_DB === "postgres";

    // PostgreSQL registrations use a server-issued permit.
    // SQLite retains its existing QR verification behavior.
    if (
      qrRequired &&
      !postgresMode &&
      !(await verifyQR(body.data.qr_code))
    ) {
      return NextResponse.json(
        { error: "This QR code has expired. Please scan the current code at reception." },
        { status: 403 }
      );
    }

    if (process.env.MO_BISTRO_DB !== "postgres") initializeTracking();

    const { name, phone, party_size, seating_preference } = body.data;

    const capacity = Number(await setting("queue_capacity", "50"));
    if (process.env.MO_BISTRO_DB === "postgres") {
      const sql = getPostgres();
      const token = newTrackingToken();
      const tokenHash = hashTrackingToken(token);
      const approval = (await setting("approval_required", "true")) === "true" ? 0 : 1;
      const permitToken = qrRequired
        ? (await cookies()).get("mo_bistro_qr_permit")?.value
        : undefined;

      const permitHash = permitToken && /^[a-f0-9]{64}$/.test(permitToken)
        ? createHash("sha256").update(permitToken).digest("hex")
        : null;

      const qrCodeHash = body.data.qr_code
        ? createHash("sha256").update(body.data.qr_code).digest("hex")
        : null;

      if (qrRequired && !permitHash) {
        return NextResponse.json(
          { error: "Your QR registration has expired. Please scan the current QR code." },
          { status: 403 }
        );
      }

      const result = await sql.begin(async (tx) => {
        // Serialize queue registration and capacity checks.
        await tx`SELECT pg_advisory_xact_lock(91401283)`;
        const active = await tx`
          SELECT COUNT(*)::integer AS count FROM guests
          WHERE status IN ('waiting', 'called')
        `;
        if (Number(active[0].count) >= capacity) return { error: "full" };
        const existing = await tx`
          SELECT id FROM guests WHERE phone = ${phone}
          AND status IN ('waiting', 'called') LIMIT 1
        `;
        if (existing.length) return { error: "duplicate" };
        if (qrRequired) {
          // Lock and consume the permit within the guest-creation transaction.
          // If insertion fails, the entire transaction rolls back.
          const consumed = await tx`
            UPDATE qr_registration_permits
            SET used_at = NOW()
            WHERE token_hash = ${permitHash}
              AND qr_code_hash = ${qrCodeHash}
              AND used_at IS NULL
              AND expires_at > ${Date.now()}
            RETURNING id
          `;

          if (consumed.length !== 1) return { error: "expired" };
        }

        const created = await tx`
          INSERT INTO guests (name, phone, party_size, status, confirmed,
            source, tracking_token_hash, seating_preference)
          VALUES (${name}, ${phone}, ${party_size}, 'waiting', ${approval},
            'qr', ${tokenHash}, ${seating_preference}) RETURNING id
        `;
        return { id: created[0].id };
      });
      if ("error" in result) return NextResponse.json({ error: result.error === "full"
        ? "The waitlist is currently full."
        : result.error === "expired"
        ? "Your QR registration has expired. Please scan the current QR code."
        : "This phone number already has an active registration. Please ask reception for assistance." },
        { status: result.error === "expired" ? 403 : 409 });
      return NextResponse.json({ success: true, id: result.id, token },
        { status: 201, headers: { "Cache-Control": "no-store" } });
    }
    const activeCount = (
      db.prepare("SELECT COUNT(*) AS count FROM guests WHERE status IN ('waiting','called')")
        .get() as { count: number }
    ).count;

    if (activeCount >= capacity) {
      return NextResponse.json(
        { error: "The waitlist is currently full." },
        { status: 409 }
      );
    }
    const token = newTrackingToken();
    const tokenHash = hashTrackingToken(token);

    const createGuest = db.transaction(() => {
      const duplicate = db.prepare(`
        SELECT id FROM guests
        WHERE phone = ?
        AND status IN ('waiting', 'called')
        LIMIT 1
      `).get(phone);

      if (duplicate) return null;

      const result = db.prepare(`
        INSERT INTO guests (
          name, phone, party_size, status,
          confirmed, source, tracking_token_hash, seating_preference
        )
        VALUES (?, ?, ?, 'waiting', ?, 'qr', ?, ?)
      `).run(
        name,
        phone,
        party_size,
        getSetting("approval_required", "true") === "true" ? 0 : 1,
        tokenHash,
        seating_preference
      );

      return result.lastInsertRowid;
    });

    const id = createGuest();

    if (id === null) {
      return NextResponse.json(
        {
          error:
            "This phone number already has an active registration. Please ask reception for assistance.",
        },
        { status: 409 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        id: Number(id),
        token,
      },
      {
        status: 201,
        headers: { "Cache-Control": "no-store" },
      }
    );
  } catch (error) {
    console.error("Guest registration error:", error);

    return NextResponse.json(
      { error: "Unable to join the waitlist right now." },
      { status: 500 }
    );
  }
}
