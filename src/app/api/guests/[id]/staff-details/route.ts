import { NextResponse } from "next/server";
import { z } from "zod";
import { currentStaff } from "@/lib/staff-auth";
import { rejectCrossOrigin } from "@/lib/guest-api-security";
import { requireActiveLicense } from "@/lib/licensing/enforce";
import { getPostgres } from "@/lib/postgres-db";
import { setActivityActor } from "@/lib/staff-activity";

const Changes = z.object({
  revision: z.number().int().min(0).max(2147483646),
  name: z.string().trim().min(2).max(100).refine(value => !/[\x00-\x1f\x7f]/.test(value)),
  party_size: z.number().int().min(1).max(30),
  seating_preference: z.enum(["indoor", "outdoor", "any"]),
  notes: z.string().trim().max(1000).refine(value => !value.includes("\0")),
}).strict();
type Context = { params: Promise<{ id: string }> };
type Snapshot = { name: string; party_size: number; seating_preference: string; notes: string };

async function access(context: Context) {
  const actor = await currentStaff();
  if (!actor || !["manager", "reception"].includes(actor.role))
    return { denied: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const id = Number((await context.params).id);
  if (!Number.isSafeInteger(id) || id < 1)
    return { denied: NextResponse.json({ error: "Invalid guest ID" }, { status: 400 }) };
  return { actor, id };
}
async function ready() {
  if (process.env.MO_BISTRO_DB !== "postgres") return false;
  const [schema] = await getPostgres()`SELECT to_regclass('public.guest_staff_details') IS NOT NULL
    AND to_regclass('public.guest_booking_changes') IS NOT NULL AS ready`;
  return schema?.ready === true;
}
function unavailable() {
  return NextResponse.json({ error: "Staff notes and booking edits need database setup." }, { status: 503 });
}

export async function GET(_request: Request, context: Context) {
  const auth = await access(context);
  if (auth.denied) return auth.denied;
  try {
    if (!await ready()) return unavailable();
    const sql = getPostgres();
    const [booking] = await sql`SELECT g.id,g.name,g.party_size,g.seating_preference,g.status,
      COALESCE(s.notes,'') AS notes,COALESCE(s.revision,0) AS revision
      FROM public.guests g LEFT JOIN public.guest_staff_details s ON s.guest_id=g.id WHERE g.id=${auth.id}`;
    if (!booking) return NextResponse.json({ error: "Guest not found" }, { status: 404 });
    const history = await sql`SELECT c.id,c.before_values,c.after_values,c.created_at,c.actor_label AS actor
      FROM public.guest_booking_changes c
      WHERE c.guest_id=${auth.id} ORDER BY c.id DESC LIMIT 10`;
    return NextResponse.json({ booking, history }, { headers: { "Cache-Control": "no-store" } });
  } catch { return unavailable(); }
}

export async function PATCH(request: Request, context: Context) {
  const auth = await access(context);
  if (auth.denied) return auth.denied;
  const origin = rejectCrossOrigin(request);
  if (origin) return origin;
  const license = await requireActiveLicense();
  if (license) return license;
  let payload: unknown;
  try { payload = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const parsed = Changes.safeParse(payload);
  if (!parsed.success) return NextResponse.json({ error: "Check the name, party size, seating preference and notes (up to 1,000 characters)." }, { status: 400 });
  try {
    if (!await ready()) return unavailable();
    const input = parsed.data;
    const result = await getPostgres().begin(async tx => {
      // Seating also locks this row before checking current size/preference.
      const [guest] = await tx`SELECT id,name,party_size,seating_preference,status FROM public.guests WHERE id=${auth.id} FOR UPDATE`;
      if (!guest) return { error: "Guest not found", status: 404 };
      if (!["waiting", "called", "seated"].includes(guest.status))
        return { error: "This booking is closed and cannot be edited.", status: 409 };
      const [details] = await tx`SELECT notes,revision FROM public.guest_staff_details WHERE guest_id=${auth.id}`;
      if ((details?.revision ?? 0) !== input.revision)
        return { error: "Another staff member updated this booking. Reload the latest version before saving.", status: 409 };
      const before: Snapshot = { name: guest.name, party_size: guest.party_size,
        seating_preference: guest.seating_preference, notes: details?.notes ?? "" };
      const after: Snapshot = { name: input.name, party_size: input.party_size,
        seating_preference: input.seating_preference, notes: input.notes };
      const bookingChanged = before.name !== after.name || before.party_size !== after.party_size || before.seating_preference !== after.seating_preference;
      if (guest.status === "seated" && bookingChanged)
        return { error: "This guest is seated. Only staff notes can be changed.", status: 409 };
      if (!bookingChanged && before.notes === after.notes) return { success: true, revision: input.revision };
      await setActivityActor(tx, auth.actor.id);
      if (bookingChanged) await tx`UPDATE public.guests SET name=${after.name},party_size=${after.party_size},
        seating_preference=${after.seating_preference},updated_at=CURRENT_TIMESTAMP WHERE id=${auth.id}`;
      const [saved] = await tx`INSERT INTO public.guest_staff_details(guest_id,notes,revision)
        VALUES (${auth.id},${after.notes},1) ON CONFLICT(guest_id) DO UPDATE
        SET notes=EXCLUDED.notes,revision=guest_staff_details.revision+1 RETURNING revision`;
      await tx`INSERT INTO public.guest_booking_changes(guest_id,actor_id,actor_label,before_values,after_values)
        VALUES (${auth.id},${auth.actor.id},${auth.actor.username},${JSON.stringify(before)}::jsonb,${JSON.stringify(after)}::jsonb)`;
      return { success: true, revision: saved.revision };
    });
    return NextResponse.json(result, { status: "error" in result ? result.status : 200 });
  } catch { return NextResponse.json({ error: "Unable to save booking changes. Reload before trying again." }, { status: 503 }); }
}
