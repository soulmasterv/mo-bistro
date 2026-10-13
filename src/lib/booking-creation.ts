import "server-only";
import { getPostgres } from "@/lib/postgres-db";
import { resolveConfirmation } from "@/lib/confirmation-policy";
import { newTrackingToken, hashTrackingToken } from "@/lib/guest-tracking";
import {
  recordBookingConsent,
  type BookingConsent,
} from "@/lib/whatsapp/service";
export const QUEUE_LOCK = 91401283;
type Booking = {
  name: string;
  phone: string;
  party_size: number;
  seating_preference: "indoor" | "outdoor" | "any";
};
type Options = {
  source: "qr" | "staff";
  permit?: { tokenHash: string; codeHash: string | null };
  consent?: BookingConsent;
};
export type CreationResult =
  { id: number; token: string } | { error: "full" | "duplicate" | "expired" };
export async function createBookingPostgres(
  guest: Booking,
  options: Options,
): Promise<CreationResult> {
  const token = newTrackingToken(),
    trackingHash = hashTrackingToken(token);
  return getPostgres().begin(async (tx) => {
    // Both entry points and capacity setting updates hold the same lock.
    await tx`SELECT pg_advisory_xact_lock(91401283)`;
    const rows =
      await tx`SELECT key,value FROM restaurant_settings WHERE key IN ('queue_capacity','approval_required','require_confirmation')`;
    const settings: Record<string, string> = Object.fromEntries(
      rows.map((row) => [row.key, row.value]),
    );
    const capacity = Number(settings.queue_capacity ?? "50");
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 500)
      throw Error("Invalid queue capacity configuration");
    const [active] =
      await tx`SELECT COUNT(*)::integer AS count FROM guests WHERE status IN ('waiting','called')`;
    if (Number(active.count) >= capacity) return { error: "full" };
    const existing =
      await tx`SELECT id FROM guests WHERE phone=${guest.phone} AND status IN ('waiting','called') LIMIT 1`;
    if (existing.length) return { error: "duplicate" };
    if (options.permit) {
      const consumed = await tx`UPDATE qr_registration_permits SET used_at=NOW()
        WHERE token_hash=${options.permit.tokenHash} AND qr_code_hash=${options.permit.codeHash}
        AND used_at IS NULL AND expires_at>${Date.now()} RETURNING id`;
      if (consumed.length !== 1) return { error: "expired" };
    }
    const confirmed =
      options.source === "staff" || !resolveConfirmation(settings) ? 1 : 0;
    const [created] =
      await tx`INSERT INTO guests(name,phone,party_size,seating_preference,status,confirmed,source,tracking_token_hash)
      VALUES (${guest.name},${guest.phone},${guest.party_size},${guest.seating_preference},'waiting',${confirmed},${options.source},${trackingHash}) RETURNING id`;
    // Staff cannot supply customer consent. Walk-ins start with all permissions false.
    await recordBookingConsent(
      tx,
      Number(created.id),
      guest.phone,
      trackingHash,
      options.source === "qr" ? (options.consent ?? {}) : {},
    );
    return { id: Number(created.id), token };
  });
}
