import { NextResponse } from "next/server";
import { currentStaff } from "@/lib/staff-auth";
import { rejectCrossOrigin } from "@/lib/guest-api-security";
import { getPostgres } from "@/lib/postgres-db";
import db from "@/lib/db";
import { setupSeating } from "@/lib/seating-v3";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KEY = "table_view_mode";

type Mode = "simple" | "detailed";

function normalize(value: unknown): Mode {
  return value === "simple" ? "simple" : "detailed";
}

export async function GET() {
  const staff = await currentStaff();

  if (!staff) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    let value: unknown;

    if (process.env.MO_BISTRO_DB === "postgres") {
      const rows = await getPostgres()`
        SELECT value
        FROM seating_settings
        WHERE key = ${KEY}
        LIMIT 1
      `;
      value = rows[0]?.value;
    } else {
      setupSeating();

      const row = db
        .prepare("SELECT value FROM seating_settings WHERE key = ?")
        .get(KEY) as { value: string } | undefined;

      value = row?.value;
    }

    return NextResponse.json(
      {
        mode: normalize(value),
        can_manage: staff.role === "manager",
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Table view mode lookup failed:", error);

    return NextResponse.json(
      { error: "Unable to load table view mode" },
      { status: 503 },
    );
  }
}

export async function PATCH(request: Request) {
  const staff = await currentStaff();

  if (staff?.role !== "manager") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const originError = rejectCrossOrigin(request);
  if (originError) return originError;


  const body = await request.json().catch(() => null);

  if (body?.mode !== "simple" && body?.mode !== "detailed") {
    return NextResponse.json(
      { error: "Invalid table view mode" },
      { status: 400 },
    );
  }

  try {
    if (process.env.MO_BISTRO_DB === "postgres") {
      const result = await getPostgres().begin(async (tx) => {
        await tx`SELECT pg_advisory_xact_lock(741122)`;
        const [existing] =
          await tx`SELECT value FROM seating_settings WHERE key=${KEY}`;
        const previous = normalize(existing?.value);
        if (previous !== body.mode) {
          const [capacity] =
            await tx`SELECT COALESCE(SUM(occupied_tables),0)::integer AS occupied FROM simple_table_capacity`;
          if (capacity.occupied > 0)
            return {
              error:
                "Clear anonymous occupied tables before switching inventory modes.",
            };
          const [requests] =
            await tx`SELECT COUNT(*)::integer AS count FROM table_ready_requests WHERE status='pending'`;
          if (requests.count > 0)
            return {
              error:
                "Review pending requests before switching inventory modes.",
            };
          if (body.mode === "simple") {
            const occupied =
              await tx`SELECT id FROM restaurant_tables WHERE status='occupied' LIMIT 1`;
            if (occupied.length)
              return {
                error:
                  "Clear named occupied tables in Detailed Mode before switching to Simple Mode.",
              };
          }
        }
        await tx`INSERT INTO seating_settings(key,value) VALUES (${KEY},${body.mode})
          ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value`;
        return { mode: body.mode };
      });
      return NextResponse.json(result, {
        status: "error" in result ? 409 : 200,
      });
    } else {
      if (body.mode === "simple")
        return NextResponse.json(
          { error: "Anonymous inventory requires PostgreSQL." },
          { status: 503 },
        );
      setupSeating();

      db.prepare(
        `
        INSERT INTO seating_settings(key, value)
        VALUES (?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
      `,
      ).run(KEY, body.mode);
    }

    return NextResponse.json({ mode: body.mode });
  } catch (error) {
    console.error("Table view mode update failed:", error);

    return NextResponse.json(
      { error: "Unable to save table view mode" },
      { status: 503 },
    );
  }
}
