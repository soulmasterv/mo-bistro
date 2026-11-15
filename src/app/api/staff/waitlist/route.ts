import { currentStaff } from "@/lib/staff-auth";
import { getPostgres } from "@/lib/postgres-db";
import { rejectCrossOrigin } from "@/lib/guest-api-security";
import { setActivityActor } from "@/lib/staff-activity";

const headers = { "Cache-Control": "private, no-store" };

export async function GET() {
  const staff = await currentStaff();
  if (staff?.role !== "manager" && staff?.role !== "reception") return Response.json({ error: "Forbidden" }, { status: 403, headers });
  if (process.env.MO_BISTRO_DB !== "postgres") return Response.json({ error: "Waitlist controls unavailable." }, { status: 503, headers });
  try {
    const rows = await getPostgres()`SELECT key,value FROM restaurant_settings
      WHERE key IN ('public_waitlist_paused','reception_can_pause_waitlist')`;
    const enabled = (key: string) => rows.some(row => row.key === key && row.value === "true");
    const receptionAllowed = enabled("reception_can_pause_waitlist");
    return Response.json({
      paused: enabled("public_waitlist_paused"),
      canPause: staff.role === "manager" || receptionAllowed,
      ...(staff.role === "manager" ? { receptionAllowed } : {}),
    }, { headers });
  } catch {
    return Response.json({ error: "Waitlist controls unavailable." }, { status: 503, headers });
  }
}

export async function PATCH(request: Request) {
  const origin = rejectCrossOrigin(request);
  if (origin) return origin;
  const staff = await currentStaff();
  if (staff?.role !== "manager" && staff?.role !== "reception") return Response.json({ error: "Forbidden" }, { status: 403, headers });
  if (process.env.MO_BISTRO_DB !== "postgres") return Response.json({ error: "Waitlist controls unavailable." }, { status: 503, headers });
  const body = await request.json().catch(() => null);
  const changingPermission = typeof body?.receptionAllowed === "boolean" && Object.keys(body).length === 1;
  const changingPause = typeof body?.paused === "boolean" && body.confirm === true && Object.keys(body).length === 2;
  if (!changingPermission && !changingPause) return Response.json({ error: "Invalid waitlist setting." }, { status: 400, headers });
  if (changingPermission && staff.role !== "manager") return Response.json({ error: "Forbidden" }, { status: 403, headers });
  try {
    const saved = await getPostgres().begin(async tx => {
      await tx`SELECT pg_advisory_xact_lock(91401283)`;
      if (staff.role === "reception") {
        const [permission] = await tx`SELECT value FROM restaurant_settings WHERE key='reception_can_pause_waitlist'`;
        if (permission?.value !== "true") return false;
      }
      const key = changingPermission ? "reception_can_pause_waitlist" : "public_waitlist_paused";
      const value = changingPermission ? body.receptionAllowed : body.paused;
      await setActivityActor(tx, staff.id);
      await tx`INSERT INTO restaurant_settings(key,value) VALUES (${key},${String(value)})
        ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value`;
      return true;
    });
    return saved ? Response.json({ saved }, { headers }) : Response.json({ error: "Reception cannot change the public waitlist." }, { status: 403, headers });
  } catch {
    return Response.json({ error: "Could not save waitlist settings." }, { status: 503, headers });
  }
}
