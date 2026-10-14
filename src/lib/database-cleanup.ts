import "server-only";
import { getPostgres } from "@/lib/postgres-db";

export const CLEANUP_ENABLED_KEY = "automatic_cleanup_enabled";
export const CLEANUP_RESULT_KEY = "automatic_cleanup_last_result";

// Preview only. Never infer the environment from NODE_ENV (Preview builds are production builds).
export function cleanupAvailable() {
  return process.env.VERCEL_ENV === "preview" && process.env.MO_BISTRO_DB === "postgres";
}

export async function runDatabaseCleanup() {
  if (!cleanupAvailable()) throw new Error("Cleanup is restricted to Preview PostgreSQL.");
  return getPostgres().begin(async tx => {
    // Match seating/registration lock order. Serializes overlapping cleanup runs too.
    await tx`SELECT pg_advisory_xact_lock(741122)`;
    await tx`SELECT pg_advisory_xact_lock(91401283)`;
    const [identity] = await tx`SELECT current_database() AS name`;
    if (identity?.name !== "mo_bistro_2") throw new Error("Unexpected cleanup database.");
    const [setting] = await tx`SELECT value FROM public.restaurant_settings
      WHERE key=${CLEANUP_ENABLED_KEY} FOR UPDATE`;
    if (setting?.value !== "true") return { skipped: true };
    // Missing required schema aborts the whole transaction, including all deletions.
    const [schema] = await tx`SELECT
      to_regclass('public.whatsapp_booking_consents') IS NOT NULL AS consents,
      to_regclass('public.whatsapp_notifications') IS NOT NULL AS notifications,
      to_regclass('public.whatsapp_inbound_events') IS NOT NULL AS inbound,
      to_regclass('public.whatsapp_customer_windows') IS NOT NULL AS windows`;
    if (schema.consents !== schema.notifications || schema.consents !== schema.inbound)
      throw new Error("Incomplete WhatsApp schema.");
    const guests = schema.notifications ? await tx`SELECT g.id FROM public.guests g
      WHERE g.status='seated' AND g.seated_at < NOW()-INTERVAL '3 days'
        AND g.table_id IS NULL
        AND NOT EXISTS (SELECT 1 FROM public.seating_history h
          WHERE h.guest_id=g.id AND h.released_at IS NULL)
        AND NOT EXISTS (SELECT 1 FROM public.whatsapp_notifications n
          WHERE n.guest_id=g.id AND n.status IN ('sending','unknown'))
      ORDER BY g.seated_at,g.id LIMIT 500 FOR UPDATE OF g SKIP LOCKED`
      : await tx`SELECT g.id FROM public.guests g
      WHERE g.status='seated' AND g.seated_at < NOW()-INTERVAL '3 days'
        AND g.table_id IS NULL
        AND NOT EXISTS (SELECT 1 FROM public.seating_history h
          WHERE h.guest_id=g.id AND h.released_at IS NULL)
      ORDER BY g.seated_at,g.id LIMIT 500 FOR UPDATE OF g SKIP LOCKED`;
    const ids = guests.map(g => Number(g.id));
    let deletedGuests = 0;
    if (ids.length) {
      // A delivery worker commits its sending claim before contacting Meta. Lock jobs
      // before deciding: an in-flight or ambiguous send keeps its guest for inspection.
      if (schema.notifications) await tx`SELECT id FROM public.whatsapp_notifications
        WHERE guest_id=ANY(${ids}::integer[]) ORDER BY id FOR UPDATE`;
      const removable = schema.notifications
        ? await tx`SELECT g.id FROM public.guests g WHERE g.id=ANY(${ids}::integer[])
          AND NOT EXISTS (SELECT 1 FROM public.whatsapp_notifications n
            WHERE n.guest_id=g.id AND n.status IN ('sending','unknown'))`
        : guests;
      const safeIds = removable.map(g => Number(g.id));
      if (safeIds.length) {
        const contacts = schema.consents
          ? await tx`SELECT DISTINCT phone FROM public.whatsapp_booking_consents
              WHERE guest_id=ANY(${safeIds}::integer[])`
          : [];
        await tx`DELETE FROM public.seating_history WHERE guest_id=ANY(${safeIds}::integer[])`;
        // FK cascades remove booking consents, notifications and their delivery logs;
        // Simple Mode's capacity event survives with guest_id=NULL. Capacity is never changed.
        const deleted = await tx`DELETE FROM public.guests WHERE id=ANY(${safeIds}::integer[]) RETURNING id`;
        deletedGuests = deleted.length;
        for (const contact of contacts) {
          // Retain inbound IDs/actions for duplicate prevention, redact orphan phone numbers.
          await tx`UPDATE public.whatsapp_inbound_events SET phone=''
            WHERE phone=${contact.phone} AND NOT EXISTS
              (SELECT 1 FROM public.whatsapp_booking_consents WHERE phone=${contact.phone})`;
          if (schema.windows) await tx`DELETE FROM public.whatsapp_customer_windows
            WHERE phone=${contact.phone} AND NOT EXISTS
              (SELECT 1 FROM public.whatsapp_booking_consents WHERE phone=${contact.phone})`;
        }
      }
    }
    // Bounded indexed expiry cleanup. Never remove active permits, rate windows or sessions.
    const qr = await tx`DELETE FROM public.qr_registration_permits WHERE id IN
      (SELECT id FROM public.qr_registration_permits
       WHERE expires_at <= EXTRACT(EPOCH FROM NOW())*1000 ORDER BY expires_at LIMIT 1000) RETURNING id`;
    const rates = await tx`DELETE FROM public.api_rate_limits WHERE key_hash IN
      (SELECT key_hash FROM public.api_rate_limits
       WHERE expires_at <= EXTRACT(EPOCH FROM NOW())*1000 ORDER BY expires_at LIMIT 1000) RETURNING key_hash`;
    const sessions = await tx`DELETE FROM public.staff_sessions WHERE id_hash IN
      (SELECT id_hash FROM public.staff_sessions
       WHERE expires_at <= EXTRACT(EPOCH FROM NOW())*1000 ORDER BY expires_at LIMIT 1000) RETURNING id_hash`;
    const recovery = await tx`DELETE FROM public.booking_recovery_requests WHERE id IN
      (SELECT id FROM public.booking_recovery_requests
       WHERE created_at < EXTRACT(EPOCH FROM NOW()-INTERVAL '3 days')*1000
       ORDER BY created_at LIMIT 1000) RETURNING id`;
    const result = { skipped: false, completedAt: new Date().toISOString(),
      deletedGuests, expiredQrPermits: qr.length, expiredRateLimits: rates.length,
      expiredSessions: sessions.length, oldRecoveryRequests: recovery.length };
    await tx`INSERT INTO public.restaurant_settings(key,value)
      VALUES (${CLEANUP_RESULT_KEY},${JSON.stringify(result)})
      ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value`;
    return result;
  });
}
