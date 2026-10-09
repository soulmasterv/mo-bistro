import { checkRateLimit } from "@/lib/api-rate-limit";
import { getPostgres } from "@/lib/postgres-db";
import { NextResponse } from "next/server";
import db from "@/lib/db";
import { initStaff } from "@/lib/staff-auth";

type Booking = {
  id: number;
  name: string;
  party_size: number;
  status: string;
  seating_preference: string | null;
  created_at: string;
  queue_position: number | null;
};

export async function POST(request: Request) {
  const limited = await checkRateLimit(
    request, "booking-lookup", 10, 900
  );
  if (limited) return limited;

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

    const search = query.trim();
    const isPhone = /^01[0125][0-9]{8}$/.test(search);

    if (!isPhone && !/^[\p{L}\p{M} .'-]{2,100}$/u.test(search)) {
      return NextResponse.json(
        { error: "Enter a valid name or 11-digit mobile number." },
        { status: 400 }
      );
    }

    let bookings: Booking[];

    if (process.env.MO_BISTRO_DB === "postgres") {
      const sql = getPostgres();

      const rows = await sql`
        WITH active AS (
          SELECT
            id, name, phone, party_size, status,
            seating_preference, created_at,
            NULL::integer AS queue_position
          FROM guests
          WHERE status IN ('waiting', 'called')
        )
        SELECT
          id, name, party_size, status,
          seating_preference, created_at, queue_position
        FROM active
        WHERE (
          ${isPhone} AND phone = ${search}
        ) OR (
          ${!isPhone} AND LOWER(name) = LOWER(${search})
        )
        ORDER BY id DESC
        LIMIT 10
      `;

      bookings = rows.map(row => ({
        id: Number(row.id),
        name: String(row.name),
        party_size: Number(row.party_size),
        status: String(row.status),
        seating_preference: row.seating_preference
          ? String(row.seating_preference)
          : null,
        created_at: String(row.created_at),
        queue_position: row.queue_position === null
          ? null
          : Number(row.queue_position),
      }));
    } else {
      initStaff();

      const rows = db.prepare(`
        SELECT
          id, name, party_size, status,
          seating_preference, created_at
        FROM guests
        WHERE status IN ('waiting', 'called')
          AND (
            (? = 1 AND phone = ?)
            OR (? = 0 AND LOWER(name) = LOWER(?))
          )
        ORDER BY id DESC
        LIMIT 10
      `).all(
        isPhone ? 1 : 0, search,
        isPhone ? 1 : 0, search
      ) as Omit<Booking, "queue_position">[];

      bookings = rows.map(row => ({
        ...row,
        queue_position: null,
      }));
    }

    return NextResponse.json(
      { bookings },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Booking lookup error:", error);

    return NextResponse.json(
      { error: "Unable to look up bookings right now." },
      { status: 500 }
    );
  }
}
