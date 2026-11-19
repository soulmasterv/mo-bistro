# Booking replies — Pilot

After a verified prepared subscription reply, Pilot sends:

**You're on the Mo Bistro waitlist (booking #123). We'll message you here when your table is ready.**

The actual booking number replaces 123. When reception seats a subscribed party:

**You're seated. Enjoy your meal at Mo Bistro!**

Each type has one durable record per booking. These courtesy jobs are separate
from the table-ready sender and never change a party to Called. Duplicate incoming
replies and repeated staff actions cannot create extra messages. STOP, simulation,
live-send flags, allowed test recipient, verified inbound permission, and the
business-number window are checked again at send time. Unknown acceptance is never
retried automatically. Seated notices expire after 15 minutes; old bookings are
not backfilled.

The prepared opt-in and visible description now request booking updates, including
seating. The verified new reply records seated-message permission. Older prepared
table-ready-only replies remain accepted and receive an acknowledgement, but their
permission is not silently expanded to seating messages.

The subscription reply is dispatched after the verified incoming request commits.
The existing Reception queue drain also recovers pending courtesy jobs. All Pilot
texts now share the same delivery checks; table-ready behavior is preserved.

## Rollout order

1. On **Mo-Bistro - Development** only, apply
   `migrations/20261119_pilot_booking_messages.sql` as the migration owner.
   The booking table must already be standardized to `public.guests`. The migration
   adds the seated-consent timestamp and the separate courtesy-message outbox.
2. Confirm the restricted application role has SELECT, INSERT, and UPDATE on
   `public.pilot_booking_messages`. The migration copies these grantees from the
   existing `pilot_ready_messages` table. It does not rewrite booking records.
3. Deploy the matching Pilot code. No new environment values are required.
4. With the allowed test number, subscribe to a new booking and receive one reply.
   Resend the prepared reply: no second acknowledgement. Seat the party and receive
   one seated message. Repeating the action/refresh must not duplicate it.

The migration is prepared locally, not applied automatically. Production is outside
this rollout. If reverting code, keep the new outbox and its claims rather than
dropping delivery history and allowing messages to repeat on a later upgrade.
