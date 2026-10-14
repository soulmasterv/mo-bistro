import { confirmationRequired } from "@/lib/confirmation-policy";
import { hasGuestEtaColumn } from "@/lib/guest-eta-support";
import { getPostgres } from "@/lib/postgres-db";
import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/api-rate-limit";
import { rejectCrossOrigin } from "@/lib/guest-api-security";
import db from "@/lib/db";
import {
  initializeTracking,
  hashTrackingToken,
  validTrackingToken,
} from "@/lib/guest-tracking";

type Guest = {
  id: number;
  name: string;
  party_size: number;
  status: string;
  confirmed: number;
  created_at: string;
  eta_at?: string | null;
};

function findGuest(token: string): Guest | undefined {
  return db.prepare(`
    SELECT id, name, party_size, status, confirmed, created_at
    FROM guests
    WHERE tracking_token_hash = ?
  `).get(hashTrackingToken(token)) as Guest | undefined;
}

function json(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET(request: Request) {
  const limited = await checkRateLimit(request, "guest-track", 30, 60);
  if (limited) return limited;

  const url = new URL(request.url);
  const token = url.searchParams.get("token");

  if (!validTrackingToken(token)) {
    return json({ error: "Invalid tracking link." }, 400);
  }

  const requiresConfirmation = await confirmationRequired();

  if (process.env.MO_BISTRO_DB === "postgres") {
    const sql = getPostgres();
    const hasEta = await hasGuestEtaColumn();
    const guests = hasEta ? await sql<Guest[]>`
      SELECT id, name, party_size, status, confirmed, created_at, eta_at
      FROM guests WHERE tracking_token_hash = ${hashTrackingToken(token)} LIMIT 1
    ` : await sql<Guest[]>`
      SELECT id, name, party_size, status, confirmed, created_at, NULL AS eta_at
      FROM guests WHERE tracking_token_hash = ${hashTrackingToken(token)} LIMIT 1
    `;
    const guest = guests[0];
    if (!guest) return json({ error: "Tracking link not found." }, 404);
    const ahead = guest.status === "waiting" ? Number((await sql`
      SELECT COUNT(*)::integer AS count FROM guests
      WHERE status IN ('waiting', 'called')
      AND (created_at < ${guest.created_at}
           OR (created_at = ${guest.created_at} AND id < ${guest.id}))
    `)[0].count) : null;
    return json({
      confirmation_required: requiresConfirmation,
      guest: { name: guest.name, party_size: guest.party_size,
        status: guest.status, confirmed: Boolean(guest.confirmed),
        created_at: guest.created_at,
        eta_at: ["waiting", "called"].includes(guest.status) ? guest.eta_at ?? null : null },
      queue_position: ahead === null ? null : ahead + 1,
      guests_ahead: ahead,
    });
  }

  initializeTracking();

  const guest = findGuest(token);

  if (!guest) {
    return json({ error: "Tracking link not found." }, 404);
  }

  const ahead = guest.status === "waiting"
    ? (
        db.prepare(`
          SELECT COUNT(*) AS count
          FROM guests
          WHERE status IN ('waiting', 'called')
          AND (
            created_at < ?
            OR (created_at = ? AND id < ?)
          )
        `).get(guest.created_at, guest.created_at, guest.id) as {
          count: number;
        }
      ).count
    : null;

  return json({
    confirmation_required: requiresConfirmation,
    guest: {
      name: guest.name,
      party_size: guest.party_size,
      status: guest.status,
      confirmed: Boolean(guest.confirmed),
      created_at: guest.created_at,
        eta_at: ["waiting", "called"].includes(guest.status)
          ? guest.eta_at ?? null
          : null,
    },
    queue_position: ahead === null ? null : ahead + 1,
    guests_ahead: ahead,
  });
}

export async function PATCH(request: Request) {
  const limited = await checkRateLimit(request, "guest-cancel", 5, 600);
  if (limited) return limited;

  const badOrigin = rejectCrossOrigin(request);
  if (badOrigin) return badOrigin;

  try {
    const body = await request.json();

    if (
      !validTrackingToken(body.token) ||
      body.action !== "cancel"
    ) {
      return json({ error: "Invalid request." }, 400);
    }

    if (process.env.MO_BISTRO_DB === "postgres") {
      const sql = getPostgres();
      const rows = await sql`
        UPDATE guests SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
        WHERE tracking_token_hash = ${hashTrackingToken(body.token)}
        AND status IN ('waiting', 'called') RETURNING id
      `;
      return rows.length ? json({ success: true })
        : json({ error: "This registration cannot be cancelled." }, 409);
    }

    initializeTracking();

    const result = db.prepare(`
      UPDATE guests
      SET status = 'cancelled',
          updated_at = CURRENT_TIMESTAMP
      WHERE tracking_token_hash = ?
      AND status IN ('waiting', 'called')
    `).run(hashTrackingToken(body.token));

    if (result.changes === 0) {
      return json(
        { error: "This registration cannot be cancelled." },
        409
      );
    }

    return json({ success: true });
  } catch {
    return json({ error: "Unable to update registration." }, 500);
  }
}
