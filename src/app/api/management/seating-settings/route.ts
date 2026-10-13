import { getPostgres } from "@/lib/postgres-db";
import { requireActiveLicense } from "@/lib/licensing/enforce";
import { NextResponse } from "next/server";
import db from "@/lib/db";
import { currentStaff } from "@/lib/staff-auth";
import { getSetting, setupSeating } from "@/lib/seating-v3";

export async function GET() {
  const staff = await currentStaff();
  if (staff?.role !== "manager") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (process.env.MO_BISTRO_DB === "postgres") {
    const rows =
      await getPostgres()`SELECT key,value FROM seating_settings WHERE key='allow_area_override'`;
    const settings = Object.fromEntries(
      rows.map((row) => [row.key, row.value === "true"]),
    );
    return NextResponse.json({
      allow_area_override: settings.allow_area_override ?? true,
    });
  }

  return NextResponse.json({
    allow_area_override: getSetting("allow_area_override"),
  });
}

export async function PATCH(request: Request) {
  const staff = await currentStaff();
  if (staff?.role !== "manager") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const licenseError = await requireActiveLicense();
  if (licenseError) return licenseError;

  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);

  if (typeof body?.allow_area_override !== "boolean") {
    return NextResponse.json({ error: "Invalid settings" }, { status: 400 });
  }

  if (process.env.MO_BISTRO_DB === "postgres") {
    const sql = getPostgres();
    await sql.begin(async (tx) => {
      for (const key of ["allow_area_override"] as const) {
        await tx`
          INSERT INTO seating_settings(key,value) VALUES (${key},${String(body[key])})
          ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value
        `;
      }
    });
    return NextResponse.json({ success: true });
  }

  setupSeating();

  const update = db.prepare(`
    INSERT INTO seating_settings(key,value)
    VALUES (?,?)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value
  `);

  db.transaction(() => {
    update.run("allow_area_override", String(body.allow_area_override));
  })();

  return NextResponse.json({ success: true });
}
