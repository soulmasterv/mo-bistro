import { createBookingPostgres } from "@/lib/booking-creation";
import { confirmationRequired } from "@/lib/confirmation-policy";
import {
  initializeTracking,
  newTrackingToken,
  hashTrackingToken,
} from "@/lib/guest-tracking";
import { hasGuestEtaColumn } from "@/lib/guest-eta-support";
import { getPostgres } from "@/lib/postgres-db";
import { requireActiveLicense } from "@/lib/licensing/enforce";
import { NextResponse } from "next/server";
import {after} from 'next/server';
import {advancedEnabled} from '@/lib/advanced/flags';
import {availableFit} from '@/lib/advanced/tables';
import {dispatchReminders} from '@/lib/advanced/reminders';
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
    const required = await confirmationRequired();
    const fits=advancedEnabled('tableOverride')?await availableFit(guests.map(g=>({id:Number(g.id),party_size:Number(g.party_size),seating_preference:String(g.seating_preference),status:String(g.status)}))):null;
    if(advancedEnabled('reminders'))after(async()=>{try{await dispatchReminders();}catch{console.error('Advanced reminder dispatch deferred');}});
    return NextResponse.json(
      guests.map((guest) => ({
        ...guest,
        confirmation_required: required,
        ...(fits?{fits_available:fits.has(guest.id)}:{}),
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

  const required = await confirmationRequired();
  return NextResponse.json(
    guests.map((guest) => ({
      ...(guest as Record<string, unknown>),
      confirmation_required: required,
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
      const result = await createBookingPostgres(body.data, {
        source: "staff",
      });
      if(!('error' in result)&&advancedEnabled('reminders'))after(async()=>{try{await dispatchReminders();}catch{console.error('Advanced reminder dispatch deferred');}});
      return "error" in result
        ? NextResponse.json(
            {
              error:
                result.error === "full"
                  ? "The waitlist is currently full."
                  : "This phone number is already on the active waitlist.",
            },
            { status: 409 },
          )
        : NextResponse.json(
            { success: true, ...result },
            {
              status: 201,
              headers: {
                "Cache-Control": "no-store",
                "Referrer-Policy": "no-referrer",
              },
            },
          );
    }

    initializeTracking();
    const token = newTrackingToken();
    const result = db.transaction(() => {
      const [capacityRow] = db
        .prepare(
          "SELECT value FROM restaurant_settings WHERE key='queue_capacity'",
        )
        .all() as { value: string }[];
      const capacity = Number(capacityRow?.value ?? 50);
      const active = db
        .prepare(
          "SELECT COUNT(*) AS count FROM guests WHERE status IN ('waiting','called')",
        )
        .get() as { count: number };
      if (active.count >= capacity)
        return { error: "The waitlist is currently full." };
      const duplicate = db
        .prepare(
          "SELECT id FROM guests WHERE phone=? AND status IN ('waiting','called') LIMIT 1",
        )
        .get(phone);
      if (duplicate)
        return {
          error: "This phone number is already on the active waitlist.",
        };
      const created = db
        .prepare(
          "INSERT INTO guests(name,phone,party_size,seating_preference,confirmed,source,tracking_token_hash) VALUES (?,?,?,?,1,'staff',?)",
        )
        .run(
          name,
          phone,
          party_size,
          seating_preference,
          hashTrackingToken(token),
        );
      return { id: Number(created.lastInsertRowid), token, success: true };
    })();
    return NextResponse.json(result, {
      status: "error" in result ? 409 : 201,
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json({ error: "Unable to add guest" }, { status: 500 });
  }
}
