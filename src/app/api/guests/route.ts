import { hasGuestEtaColumn } from "@/lib/guest-eta-support";
import { getPostgres } from "@/lib/postgres-db";
import { requireActiveLicense } from "@/lib/licensing/enforce";
import { NextResponse } from "next/server";
import db from "@/lib/db";
import { z } from "zod";
import {
  requireReceptionStaff,
  rejectCrossOrigin,
} from "@/lib/guest-api-security";

const GuestSchema = z.object({
  name: z.string().trim().min(2).max(100),
  phone: z
    .string()
    .trim()
    .regex(
      /^01[0125][0-9]{8}$/,
      "Enter a valid 11-digit Egyptian mobile number.",
    ),
  party_size: z.number().int().min(1).max(30),
  seating_preference: z.enum(["indoor", "outdoor", "any"]).default("any"),
});

export async function GET() {
  const denied = await requireReceptionStaff();
  if (denied) return denied;
  if (process.env.MO_BISTRO_DB === "postgres") {
    const sql = getPostgres();
    const hasEta = await hasGuestEtaColumn();
    const guests = hasEta
      ? await sql`
      SELECT id, name, phone, party_size, seating_preference, status,
        confirmed, table_id, created_at, updated_at, eta_at FROM guests
      ORDER BY created_at ASC, id ASC
    `
      : await sql`
      SELECT id, name, phone, party_size, seating_preference, status,
        confirmed, table_id, created_at, updated_at, NULL AS eta_at FROM guests
      ORDER BY created_at ASC, id ASC
    `;
    const [confirmation] =
      await sql`SELECT value FROM restaurant_settings WHERE key='require_confirmation'`;
    return NextResponse.json(
      guests.map((guest) => ({
        ...guest,
        confirmation_required: confirmation?.value !== "false",
      })),
      { headers: { "Cache-Control": "no-store" } },
    );
  }
  const guests = db
    .prepare(
      `
    SELECT id, name, phone, party_size, seating_preference, status, confirmed, table_id, created_at, updated_at FROM guests
    ORDER BY created_at ASC, id ASC
  `,
    )
    .all();

  const confirmation = db
    .prepare("SELECT value FROM restaurant_settings WHERE key = ?")
    .get("require_confirmation") as { value: string } | undefined;
  return NextResponse.json(
    guests.map((guest) => ({
      ...(guest as Record<string, unknown>),
      confirmation_required: confirmation?.value !== "false",
    })),
    {
      headers: { "Cache-Control": "no-store" },
    },
  );
}

export async function POST(request: Request) {
  const denied = await requireReceptionStaff();
  if (denied) return denied;
  const badOrigin = rejectCrossOrigin(request);
  if (badOrigin) return badOrigin;
  const licenseError = await requireActiveLicense();
  if (licenseError) return licenseError;

  try {
    const body = GuestSchema.safeParse(await request.json());

    if (!body.success) {
      return NextResponse.json(
        { error: "Invalid guest details" },
        { status: 400 },
      );
    }

    const { name, phone, party_size, seating_preference } = body.data;

    if (process.env.MO_BISTRO_DB === "postgres") {
      const sql = getPostgres();
      const rows = await sql.begin(async (tx) => {
        // Serialize registrations by phone, preventing concurrent duplicates.
        await tx`SELECT pg_advisory_xact_lock(hashtext(${phone}))`;
        const existing = await tx`
          SELECT id FROM guests WHERE phone = ${phone}
          AND status IN ('waiting', 'called') LIMIT 1
        `;
        if (existing.length) return null;
        const created = await tx`
          INSERT INTO guests (name, phone, party_size, seating_preference, confirmed)
          VALUES (${name}, ${phone}, ${party_size}, ${seating_preference}, 1)
          RETURNING id
        `;
        return created[0];
      });
      return rows
        ? NextResponse.json({ id: rows.id, success: true }, { status: 201 })
        : NextResponse.json(
            { error: "This phone number is already on the active waitlist." },
            { status: 409 },
          );
    }

    const duplicate = db
      .prepare(
        `
      SELECT id FROM guests
      WHERE phone = ?
        AND status IN ('waiting', 'called')
      LIMIT 1
    `,
      )
      .get(phone);

    if (duplicate) {
      return NextResponse.json(
        { error: "This phone number is already on the active waitlist." },
        { status: 409 },
      );
    }

    const result = db
      .prepare(
        `
      INSERT INTO guests (name, phone, party_size, seating_preference, confirmed)
      VALUES (?, ?, ?, ?, 1)
    `,
      )
      .run(name, phone, party_size, seating_preference);

    return NextResponse.json(
      { id: result.lastInsertRowid, success: true },
      { status: 201 },
    );
  } catch {
    return NextResponse.json({ error: "Unable to add guest" }, { status: 500 });
  }
}
