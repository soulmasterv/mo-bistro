import { currentStaff } from "@/lib/staff-auth";
import { getPostgres } from "@/lib/postgres-db";
import { whatsappEnabled } from "@/lib/whatsapp/policy";
export const runtime = "nodejs";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const staff = await currentStaff();
  if (!staff) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!["manager", "reception"].includes(staff.role))
    return Response.json(
      { error: "Reception access required" },
      { status: 403 },
    );
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id < 1)
    return Response.json({ error: "Invalid guest" }, { status: 400 });
  const headers = { "Cache-Control": "no-store" };
  if (!whatsappEnabled())
    return Response.json({ available: false }, { headers });
  try {
    const [row] =
      await getPostgres()`SELECT c.confirmation_consent,c.feedback_consent,c.subscribed_at,c.unsubscribed_at,p.opted_out_at
   FROM guests g LEFT JOIN whatsapp_booking_consents c ON c.guest_id=g.id
   LEFT JOIN whatsapp_contact_preferences p ON p.phone=c.phone WHERE g.id=${id}`;
    if (!row)
      return Response.json(
        { error: "Guest not found" },
        { status: 404, headers },
      );
    const optedOut = !!row.unsubscribed_at || !!row.opted_out_at;
    return Response.json(
      {
        available: true,
        subscribed: !!row.subscribed_at && !optedOut,
        opted_out: optedOut,
        confirmation_consent: !!row.confirmation_consent,
        feedback_consent: !!row.feedback_consent,
      },
      { headers },
    );
  } catch {
    return Response.json(
      { error: "WhatsApp status unavailable" },
      { status: 503, headers },
    );
  }
}
