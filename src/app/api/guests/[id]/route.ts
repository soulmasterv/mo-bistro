import { getPostgres } from "@/lib/postgres-db";
import { currentStaff } from "@/lib/staff-auth";
import { setActivityActor } from "@/lib/staff-activity";
import { NextResponse } from "next/server";
import {after} from 'next/server';
import {advancedEnabled} from '@/lib/advanced/flags';
import {dispatchReminders} from '@/lib/advanced/reminders';
import db from "@/lib/db";
import { z } from "zod";
import { requireReceptionStaff, rejectCrossOrigin } from "@/lib/guest-api-security";


const ActionSchema = z.object({
  action: z.enum([
    "call",
    "no_show",
    "cancel",
    "confirm"
  ]),
});

type Guest = {
  id: number;
  status: string;
  confirmed: number;
};

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const denied = await requireReceptionStaff();
  if (denied) return denied;
  const badOrigin = rejectCrossOrigin(request);
  if (badOrigin) return badOrigin;


  const { id } = await context.params;
  const guestId = Number(id);

  if (!Number.isSafeInteger(guestId) || guestId < 1) {
    return NextResponse.json(
      { error: "Invalid guest ID" },
      { status: 400 }
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON" },
      { status: 400 }
    );
  }

  const parsed = ActionSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid action" },
      { status: 400 }
    );
  }

  if (process.env.MO_BISTRO_DB === "postgres") {
    const sql = getPostgres();
    const action = parsed.data.action;
    const statuses: Record<string, string> = {
      call: "called", no_show: "no_show", cancel: "cancelled",
    };
    const permitted: Record<string, string[]> = {
      call: ["waiting"], no_show: ["waiting", "called"],
      cancel: ["waiting", "called"], confirm: ["waiting", "called"],
    };
    const allowed = permitted[action];
    const actor = await currentStaff();
    const updated = await sql.begin(async tx => {
      await setActivityActor(tx, actor?.id);
      return action === "confirm" ? await tx`
      UPDATE guests SET confirmed = 1, updated_at = CURRENT_TIMESTAMP
      WHERE id = ${guestId} AND status=ANY(${allowed}::text[]) RETURNING id
    ` : await tx`
      UPDATE guests SET status = ${statuses[action]}, updated_at = CURRENT_TIMESTAMP
      WHERE id = ${guestId} AND status=ANY(${allowed}::text[]) RETURNING id
    `;
    });
    if (updated.length) {
      if(advancedEnabled('reminders'))after(async()=>{try{await dispatchReminders();}catch{console.error('Advanced reminder dispatch deferred');}});
      return NextResponse.json({ success: true });
    }
    const existing = await sql`SELECT id FROM guests WHERE id = ${guestId}`;
    return NextResponse.json({ error: existing.length ? "Action not allowed for current status" : "Guest not found" },
      { status: existing.length ? 409 : 404 });
  }

  const guest = db.prepare(
    "SELECT id, status, confirmed FROM guests WHERE id = ?"
  ).get(guestId) as Guest | undefined;

  if (!guest) {
    return NextResponse.json(
      { error: "Guest not found" },
      { status: 404 }
    );
  }

  const action = parsed.data.action;

  const allowed: Record<string, string[]> = {
    call: ["waiting"],
    no_show: ["waiting", "called"],
    cancel: ["waiting", "called"],
    confirm: ["waiting", "called"],
  };

  if (!allowed[action].includes(guest.status)) {
    return NextResponse.json(
      { error: "Action not allowed for current status" },
      { status: 409 }
    );
  }

  if (action === "confirm") {
    db.prepare(`
      UPDATE guests
      SET confirmed = 1, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(guestId);
  } else {
    const statuses: Record<string, string> = {
      call: "called",
      no_show: "no_show",
      cancel: "cancelled",
    };

    db.prepare(`
      UPDATE guests
      SET status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(statuses[action], guestId);
  }

  return NextResponse.json({ success: true });
}
