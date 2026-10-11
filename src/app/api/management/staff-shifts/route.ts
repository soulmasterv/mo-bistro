import { NextResponse } from "next/server";
import { z } from "zod";
import { currentStaff } from "@/lib/staff-auth";
import { getPostgres } from "@/lib/postgres-db";
import { rejectCrossOrigin } from "@/lib/guest-api-security";
import { requireActiveLicense } from "@/lib/licensing/enforce";

export const runtime = "nodejs";

const shiftSchema = z.object({
  staff_id: z.number().int().positive(),
  weekday: z.number().int().min(0).max(6),
  is_off: z.boolean(),
  start_time: z.string().regex(/^([01]\\d|2[0-3]):[0-5]\\d$/).nullable(),
  end_time: z.string().regex(/^([01]\\d|2[0-3]):[0-5]\\d$/).nullable(),
}).refine(value =>
  value.is_off
    ? value.start_time === null && value.end_time === null
    : value.start_time !== null && value.end_time !== null,
  { message: "Invalid shift hours." }
);

export async function GET() {
  const staff = await currentStaff();
  if (staff?.role !== "manager") {
    return NextResponse.json({ error: "Manager access required." }, { status: 403 });
  }
  if (process.env.MO_BISTRO_DB !== "postgres") {
    return NextResponse.json({ error: "PostgreSQL required." }, { status: 503 });
  }

  try {
    const shifts = await getPostgres()`
      SELECT staff_id, weekday,
             to_char(start_time, 'HH24:MI') AS start_time,
             to_char(end_time, 'HH24:MI') AS end_time,
             is_off
      FROM staff_shifts
      ORDER BY staff_id, weekday
    `;
    return NextResponse.json({ shifts });
  } catch (error) {
    console.error("Staff shifts load failed:", error);
    return NextResponse.json({ error: "Unable to load shifts. Apply the test migration first." }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const originError = rejectCrossOrigin(request);
  if (originError) return originError;

  const staff = await currentStaff();
  if (staff?.role !== "manager") {
    return NextResponse.json({ error: "Manager access required." }, { status: 403 });
  }

  const licenseError = await requireActiveLicense();
  if (licenseError) return licenseError;

  if (process.env.MO_BISTRO_DB !== "postgres") {
    return NextResponse.json({ error: "PostgreSQL required." }, { status: 503 });
  }

  const parsed = shiftSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid shift details." }, { status: 400 });
  }

  const { staff_id, weekday, is_off, start_time, end_time } = parsed.data;

  try {
    const sql = getPostgres();
    const users = await sql`
      SELECT id FROM staff_users WHERE id = ${staff_id}
    `;
    if (!users.length) {
      return NextResponse.json({ error: "Employee not found." }, { status: 404 });
    }

    await sql`
      INSERT INTO staff_shifts (staff_id, weekday, is_off, start_time, end_time)
      VALUES (${staff_id}, ${weekday}, ${is_off}, ${start_time}, ${end_time})
      ON CONFLICT (staff_id, weekday)
      DO UPDATE SET
        is_off = EXCLUDED.is_off,
        start_time = EXCLUDED.start_time,
        end_time = EXCLUDED.end_time
    `;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Staff shift save failed:", error);
    return NextResponse.json({ error: "Unable to save shift." }, { status: 500 });
  }
}
