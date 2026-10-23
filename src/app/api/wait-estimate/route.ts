import { NextResponse } from "next/server";
import { getPostgres } from "@/lib/postgres-db";
import db from "@/lib/db";
import { currentStaff } from "@/lib/staff-auth";
import { setupSeating } from "@/lib/seating-v3";

export const dynamic = "force-dynamic";

const KEY = "restaurant_wait_minutes";
const DEFAULT_MINUTES = 30;

function validMinutes(value: unknown): value is number {
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 15 &&
    value <= 240 &&
    value % 15 === 0;
}

export async function GET() {
  try {
    let value: string | undefined;

    if (process.env.MO_BISTRO_DB === "postgres") {
      const rows = await getPostgres()`
        SELECT value FROM seating_settings WHERE key = ${KEY} LIMIT 1
      `;
      value = rows[0]?.value;
    } else {
      setupSeating();
      const row = db.prepare(
        "SELECT value FROM seating_settings WHERE key = ?"
      ).get(KEY) as { value: string } | undefined;
      value = row?.value;
    }

    const parsed = value === undefined ? DEFAULT_MINUTES : Number(value);

    return NextResponse.json(
      { minutes: validMinutes(parsed) ? parsed : DEFAULT_MINUTES },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    return NextResponse.json(
      { error: "Wait estimate unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}

export async function PATCH(request: Request) {
  const staff = await currentStaff();
  if (!staff || !["manager", "reception"].includes(staff.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  }


  const body = await request.json().catch(() => null);
  if (!validMinutes(body?.minutes)) {
    return NextResponse.json(
      { error: "Choose a 15-minute increment between 15 and 240 minutes." },
      { status: 400 }
    );
  }

  try {
    if (process.env.MO_BISTRO_DB === "postgres") {
      await getPostgres()`
        INSERT INTO seating_settings (key, value)
        VALUES (${KEY}, ${String(body.minutes)})
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
      `;
    } else {
      setupSeating();
      db.prepare(`
        INSERT INTO seating_settings (key, value)
        VALUES (?, ?)
        ON CONFLICT (key) DO UPDATE SET value = excluded.value
      `).run(KEY, String(body.minutes));
    }

    return NextResponse.json({ minutes: body.minutes });
  } catch {
    return NextResponse.json(
      { error: "Unable to save wait estimate" },
      { status: 500 }
    );
  }
}
