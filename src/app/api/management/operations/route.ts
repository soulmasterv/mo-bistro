import { currentStaff } from "@/lib/staff-auth";
import { getPostgres } from "@/lib/postgres-db";
import { requireActiveLicense } from "@/lib/licensing/enforce";
import { rejectCrossOrigin } from "@/lib/guest-api-security";
import { setActivityActor } from "@/lib/staff-activity";
import { callbackUrl, liveSendingEnabled, whatsappEnabled } from "@/lib/whatsapp/policy";
import { previewTestEnabled } from "@/lib/whatsapp/preview-test";

export const runtime = "nodejs";
const headers = { "Cache-Control": "no-store" };
async function manager() {
  const staff = await currentStaff();
  return staff?.role === "manager" ? staff : null;
}
const safeReason = (value: unknown) => {
  const known: Record<string,string> = {
    consent_or_booking_ineligible: "Consent or booking is no longer eligible",
    worker_interrupted: "Worker interrupted — inspect before retrying",
    publish_failed: "Scheduler could not accept the job",
    notification_configuration_missing: "Notification configuration is incomplete",
    management_queue_cancelled: "Booking cancelled by Management",
    meta_network_acceptance_unknown: "Meta acceptance unknown — no blind retry",
    meta_acceptance_unknown: "Meta acceptance unknown — inspect delivery logs",
    customer_window_closed: "Customer's 24-hour window is closed",
    outside_customer_window_no_applicable_template: "24-hour window closed and no applicable approved template",
    preview_recipient_restricted: "Recipient is outside the configured Preview test restriction",
    meta_configuration_missing: "Meta sending configuration is incomplete",
    preview_recipient_not_allowed: "Recipient is outside the configured Preview test restriction",
    preview_recipient_not_configured: "Preview test recipient is not configured",
    business_number_not_configured: "Meta business phone number is not configured",
    customer_window_schema_unavailable: "Verified customer-window table is unavailable",
    customer_window_closed_no_template: "24-hour window closed and no applicable approved template",
    customer_window_closed_template_unconfigured: "24-hour window closed and no applicable approved template",
    notification_content_unconfigured: "No valid notification text or applicable template is configured",
    confirmation_subscription_copy_missing: "Confirmation is missing the required subscription instructions",
  };
  return typeof value === "string" && value ? known[value] ?? "Provider, eligibility or configuration issue — inspect safe delivery status" : null;
};
export async function GET() {
  if (!await manager()) return Response.json({ error: "Manager access required" }, { status: 403, headers });
  if (process.env.MO_BISTRO_DB !== "postgres") return Response.json({ available: false }, { headers });
  try {
    const sql = getPostgres();
    const [schema] = await sql`SELECT
      to_regclass('public.staff_activity_events') IS NOT NULL AS activity,
      to_regclass('public.wait_accuracy_samples') IS NOT NULL AS accuracy,
      to_regclass('public.whatsapp_notifications') IS NOT NULL AS notifications,
      to_regclass('public.whatsapp_delivery_logs') IS NOT NULL AS delivery,
      to_regclass('public.whatsapp_booking_consents') IS NOT NULL AS consents,
      to_regclass('public.whatsapp_contact_preferences') IS NOT NULL AS preferences,
      to_regclass('public.whatsapp_customer_windows') IS NOT NULL AS windows`;
    const [setting] = await sql`SELECT value FROM restaurant_settings WHERE key='public_waitlist_paused'`;
    const accuracy = schema.accuracy ? (await sql`SELECT COUNT(*)::integer AS samples,
      COUNT(eta_error_minutes)::integer AS estimated_samples,
      ROUND(AVG(actual_wait_minutes)::numeric,1) AS average_wait,
      ROUND(AVG(ABS(eta_error_minutes))::numeric,1) AS average_error,
      ROUND(AVG(eta_error_minutes)::numeric,1) AS signed_error,
      COUNT(*) FILTER (WHERE ABS(eta_error_minutes)<=10)::integer AS within_ten
      FROM public.wait_accuracy_samples WHERE seated_at>=NOW()-INTERVAL '30 days'`)[0] : null;
    const activity = schema.activity ? await sql`SELECT e.id,e.event,e.guest_id,e.details,e.created_at,
      u.username AS actor FROM public.staff_activity_events e LEFT JOIN public.staff_users u ON u.id=e.actor_id
      ORDER BY e.created_at DESC,e.id DESC LIMIT 100` : [];
    let callbackValid = false;
    try { callbackUrl("/api/whatsapp/jobs"); callbackValid = true; } catch {}
    const configured: Record<string,boolean> = {
      enabled: whatsappEnabled(), live: liveSendingEnabled(),
      modeLive: process.env.WHATSAPP_MODE === "live",
      livePermission: process.env.WHATSAPP_ALLOW_LIVE_SEND === "true",
      windowText: process.env.WHATSAPP_WINDOW_TEXT_ENABLED === "true",
      scheduler: !!(process.env.QSTASH_TOKEN && process.env.QSTASH_CURRENT_SIGNING_KEY && process.env.QSTASH_NEXT_SIGNING_KEY && callbackValid),
      meta: !!(process.env.META_WHATSAPP_ACCESS_TOKEN && /^\d+$/.test(process.env.META_WHATSAPP_PHONE_NUMBER_ID ?? "") && process.env.META_APP_SECRET && /^v\d+\.\d+$/.test(process.env.META_GRAPH_API_VERSION ?? "")),
      association: (process.env.WHATSAPP_ASSOCIATION_SECRET?.length ?? 0) >= 32,
    };
    const blockers: string[] = [];
    if (!configured.enabled) blockers.push("Automatic WhatsApp notifications are disabled.");
    if (!configured.live) blockers.push("Automatic sending is simulated: live mode and explicit live-send permission are both required. A successful manual test does not enable automatic sending.");
    if (!schema.notifications || !schema.delivery || !schema.consents || !schema.preferences || !schema.windows) blockers.push("Required WhatsApp tables are missing; inspect the existing migrations.");
    if (!configured.scheduler) blockers.push("Automatic scheduling configuration is incomplete.");
    if (!configured.meta || !configured.association) blockers.push("Meta or booking-association configuration is incomplete.");
    if (!configured.windowText) blockers.push("24-hour plain-text notifications are disabled; only applicable configured templates can be used.");
    if (previewTestEnabled()) blockers.push("The isolated Preview test is enabled. A manual test proves only its own delivery; it does not activate automatic booking updates.");
    const jobs = schema.notifications && schema.delivery && schema.consents && schema.preferences && schema.windows
      ? await sql`SELECT n.guest_id,n.kind,n.status,n.due_at,n.last_error,
        (c.subscribed_at IS NOT NULL AND c.unsubscribed_at IS NULL AND p.opted_out_at IS NULL) AS subscribed,
        EXISTS (SELECT 1 FROM public.whatsapp_customer_windows w WHERE w.phone=c.phone
          AND w.phone_number_id=${process.env.META_WHATSAPP_PHONE_NUMBER_ID ?? ""}
          AND w.last_inbound_at>NOW()-INTERVAL '24 hours' AND w.last_inbound_at<=NOW()) AS window_open,
        (SELECT l.event FROM public.whatsapp_delivery_logs l WHERE l.notification_id=n.id
          AND l.event IN ('sent','delivered','read','failed') ORDER BY l.created_at DESC,l.id DESC LIMIT 1) AS delivery
        FROM public.whatsapp_notifications n JOIN public.whatsapp_booking_consents c ON c.guest_id=n.guest_id
        LEFT JOIN public.whatsapp_contact_preferences p ON p.phone=c.phone
        ORDER BY n.created_at DESC,n.id LIMIT 50` : [];
    return Response.json({ available: true, paused: setting?.value === "true", accuracy,
      activityAvailable: !!schema.activity, activity, whatsapp: { configured, blockers,
        jobs: jobs.map(({last_error, ...job}) => ({...job, reason:safeReason(last_error)})) } }, { headers });
  } catch { return Response.json({ error: "Operations data unavailable; check database schema and connectivity" }, { status: 503, headers }); }
}
export async function PATCH(request: Request) {
  const staff = await manager();
  if (!staff) return Response.json({ error: "Manager access required" }, { status: 403, headers });
  const origin = rejectCrossOrigin(request);
  if (origin) return origin;
  const license = await requireActiveLicense();
  if (license) return license;
  if (process.env.MO_BISTRO_DB !== "postgres") return Response.json({ error: "PostgreSQL required" }, { status: 503, headers });
  const body = await request.json().catch(() => null);
  if (!body || Object.keys(body).length !== 2 || typeof body.paused !== "boolean" || body.confirm !== true)
    return Response.json({ error: "Explicit confirmation required" }, { status: 400, headers });
  try {
    await getPostgres().begin(async tx => {
      await tx`SELECT pg_advisory_xact_lock(91401283)`;
      await setActivityActor(tx, staff.id);
      await tx`INSERT INTO public.restaurant_settings(key,value) VALUES ('public_waitlist_paused',${String(body.paused)})
        ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value`;
    });
    return Response.json({ paused: body.paused }, { headers });
  } catch { return Response.json({ error: "Could not change public registrations" }, { status: 503, headers }); }
}
