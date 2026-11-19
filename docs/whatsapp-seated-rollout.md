# Seated WhatsApp courtesy — Advanced

The new message is: **You're seated. Enjoy your meal at Mo Bistro!**

Both named-table and anonymous-area seating queue it in the seating transaction.
It requires an already verified booking subscription and booking-update consent;
review consent is separate. There is one durable job per booking. Duplicate staff
actions, repeated drains, and uncertain provider results do not rearm it.

It sends immediately, without QStash, through the existing text-window sender.
Live-send flags, the Preview test-recipient restriction, the business-number
window, and STOP suppression still apply. There is no template fallback. A notice
older than 15 minutes after seating is skipped. There is no backfill for old seated
bookings or later opt-ins. Existing review scheduling is unchanged.

## Rollout order

1. On **Mo-Bistro - Preview** only, apply
   `migrations/20261119_whatsapp_seated.sql` using the migration owner.
   This adds `seated` to the notification-kind check; it does not rewrite bookings.
2. Verify the check allows `confirmation`, `almost_ready`, `review`, `eta_update`,
   and `seated`. The existing per-booking unique index covers `seated`.
3. Deploy the matching Advanced code. No new environment values are required.
4. With an allowed test number, subscribe to a new booking, seat it, and check for
   one courtesy message. Repeat Refresh and inspect the job: no duplicate send.
   Non-subscribers and opted-out guests must receive nothing.

The migration is prepared locally, not applied by the app or by a build.
Production is outside this rollout. If reverting the app, retain the added kind
and delivery history; deleting claims could permit duplicate messages later.
