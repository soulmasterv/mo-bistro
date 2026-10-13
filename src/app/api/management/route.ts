import { confirmationRequired } from "@/lib/confirmation-policy";
import { getPostgres } from "@/lib/postgres-db";
import { getSettingPostgres, initStaffPostgres } from "@/lib/staff-auth-postgres";
import { requireActiveLicense } from "@/lib/licensing/enforce";
import { rejectCrossOrigin } from "@/lib/guest-api-security";
import { NextResponse } from "next/server";
import { z } from "zod";
import db from "@/lib/db";
import {
  currentStaff,
  getSetting,
  initStaff,
} from "@/lib/staff-auth";

const schema = z.object({
  qr_rotation_seconds: z.enum(["60", "300", "900", "86400"]),
  qr_required: z.boolean(),
  approval_required: z.boolean(),
  queue_capacity: z.number().int().min(1).max(500),
  restaurant_name: z.string().trim().min(2).max(80),
});

async function managerOnly() {
  const staff = await currentStaff();
  return staff?.role === "manager";
}

export async function GET() {
  if (!(await managerOnly())) {
    return NextResponse.json(
      { error: "Forbidden" }, { status: 403 }
    );
  }

  if (process.env.MO_BISTRO_DB === "postgres") {
    await initStaffPostgres();
    const sql = getPostgres();
    const users = await sql`SELECT id,username,role,active,created_at FROM staff_users ORDER BY id`;
    return NextResponse.json({
      settings: {
        qr_rotation_seconds: await getSettingPostgres("qr_rotation_seconds", "300"),
        qr_required: (await getSettingPostgres("qr_required", "false")) === "true",
        approval_required: await confirmationRequired(),
        queue_capacity: Number(await getSettingPostgres("queue_capacity", "50")),
        restaurant_name: await getSettingPostgres("restaurant_name", "The Restaurant"),
      },
      users,
    });
  }

  initStaff();

  const users = db.prepare(`
    SELECT id,username,role,active,created_at
    FROM staff_users
    ORDER BY id
  `).all();

  return NextResponse.json({
    settings: {
      qr_rotation_seconds: getSetting("qr_rotation_seconds", "300"),
      qr_required: getSetting("qr_required", "false") === "true",
      approval_required:
        await confirmationRequired(),
      queue_capacity: Number(getSetting("queue_capacity", "50")),
      restaurant_name: getSetting("restaurant_name", "The Restaurant"),
    },
    users,
  });
}

export async function PATCH(request: Request) {
  const badOrigin = rejectCrossOrigin(request);
  if (badOrigin) return badOrigin;

  if (!(await managerOnly())) {
    return NextResponse.json(
      { error: "Forbidden" }, { status: 403 }
    );
  }
  const licenseError = await requireActiveLicense();
  if (licenseError) return licenseError;


  try {
    const parsed = schema.safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid settings." }, { status: 400 }
      );
    }

    if (process.env.MO_BISTRO_DB === "postgres") {
      const sql = getPostgres();
      await sql.begin(async (tx) => {
        await tx`SELECT pg_advisory_xact_lock(91401283)`;
        for (const [key, value] of Object.entries(parsed.data)) {
          await tx`
            INSERT INTO restaurant_settings(key,value) VALUES (${key},${String(value)})
            ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value
          `;
        }
      });
      return NextResponse.json({ success: true });
    }

    const update = db.prepare(`
      INSERT INTO restaurant_settings(key,value)
      VALUES (?,?)
      ON CONFLICT(key) DO UPDATE SET value=excluded.value
    `);

    const transaction = db.transaction(() => {
      for (const [key, value] of Object.entries(parsed.data)) {
        update.run(key, String(value));
      }
    });

    transaction();

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Unable to save settings." }, { status: 500 }
    );
  }
}
