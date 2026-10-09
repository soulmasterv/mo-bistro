import { getPostgres } from "@/lib/postgres-db";
import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import db from "@/lib/db";
import { initStaff } from "@/lib/staff-auth";

export async function POST(request: Request) {
  try {
    const { query } = await request.json();

    if (
      typeof query !== "string" ||
      query.trim().length < 2 ||
      query.length > 100
    ) {
      return NextResponse.json(
        { error: "Enter a name or phone number." },
        { status: 400 }
      );
    }

    if (process.env.MO_BISTRO_DB !== "postgres") initStaff();

    const normalized = query.trim().toLowerCase();
    const hash = createHash("sha256").update(normalized).digest("hex");
    const now = Date.now();

    if (process.env.MO_BISTRO_DB === "postgres") {
      const sql = getPostgres();
      await sql`DELETE FROM booking_recovery_requests
        WHERE created_at < ${now - 86400000}`;
      await sql`INSERT INTO booking_recovery_requests(query_hash,created_at)
        VALUES (${hash},${now})`;
    } else {
    db.prepare(`
      DELETE FROM booking_recovery_requests
      WHERE created_at < ?
    `).run(now - 86400000);

    db.prepare(`
      INSERT INTO booking_recovery_requests(query_hash,created_at)
      VALUES (?,?)
    `).run(hash, now);
    }

    return NextResponse.json({
      message:
        "Please ask reception to look up your registration using the name or phone number you entered. For privacy, booking details are not displayed here.",
    });
  } catch {
    return NextResponse.json(
      { error: "Unable to process your request." },
      { status: 500 }
    );
  }
}
