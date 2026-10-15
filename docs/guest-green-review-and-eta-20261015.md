# Guest palette, bundled review subscription and ETA messages

## User-facing behaviour

- `/join` uses the screenshot's exact background colour, **#34382E**, for its introduction and primary booking button. Existing cream/gold colours remain. The existing guest-light route isolation keeps these colours independent of staff light/dark/system preferences. Other routes are not recoloured.
- The separate review checkbox is removed. The WhatsApp subscription card clearly describes booking updates **and one review request 60 minutes after seating** before the customer opens WhatsApp. Its booking-specific command now ends in `REVIEWS`.
- Only a matching incoming text command, accepted by the existing signed webhook, grants this bundled review consent. Opening the link/GET, clicking subscribe, a legacy command or a template quick-reply does not silently grant new review permission. Legacy saved choices are preserved. Existing feedback-consent APIs remain for compatibility and revocation; there is no checkbox in the current card. STOP/UNSUBSCRIBE remain case-insensitive and suppress all updates/reviews.
- Setting/changing a personal ETA queues an immediate expected-time update for eligible subscribers. For ETAs greater than 10 minutes, a separate Almost Ready job is scheduled at ETA minus 10 minutes. At 10 minutes or less, the immediate time update covers both to avoid two messages together.
- Further staff timing changes have distinct immutable job IDs. Old pending/scheduled jobs are superseded; old callback IDs cannot mark the newer update delivered. Already sent/unknown/in-flight jobs are not blindly retried. Clearing ETA cancels unsent ETA/Almost Ready jobs.
- The editor uses a request UUID retained across an uncertain retry. The server serializes on the guest row and stores the completed mutation; an identical replay returns the original result without moving ETA or dispatching again. New successful saves use new UUIDs. Older clients without a UUID receive a server-generated UUID, so client retries require the updated UI to obtain this protection.
- Save feedback distinguishes disabled, simulated, queued-if-subscribed and missing-migration states. None is labelled delivered without a Meta delivery event.

## Sending policy

No messages, deployed settings, databases or schedulers were changed during implementation.
`WHATSAPP_MODE=test` and `WHATSAPP_ALLOW_LIVE_SEND=false` remain unchanged. These events simulate under those settings. Live configuration still needs separate approval and verification.

Existing signature, opt-in, global opt-out, business-phone/window verification, delivery logs and Preview recipient restrictions apply. Preview recipient checking is enforced before the template path too. Unknown acceptance remains terminal until reconciliation. Other notifications/templates are not rewritten.

Within the verified 24-hour customer-service window and with window text enabled, `eta_update` has a default plain-text message stating the new expected time (Africa/Cairo), that it is an estimate, and the standard unsubscribe wording. `WHATSAPP_ETA_UPDATE_TEXT` may override it using `{name}`, `{booking_id}`, `{eta_time}`. Outside the window, or with text disabled, only the separately configured **approved** `WHATSAPP_ETA_UPDATE_TEMPLATE` is used; otherwise the job skips safely. The new template expects body parameters: guest name, booking ID, expected time. Presence of a template name does not prove Meta approval/applicability.

## Migration / deployment prerequisites — do not execute without approval

The new SQL is `migrations/20261015_whatsapp_eta_updates.sql`. It adds the `eta_update` kind, immutable event/snapshot metadata, partial unique indexes and `guest_eta_changes`. The new mutation records cascade with guest deletion, so existing guest cleanup does not leave them behind. No data is backfilled or deleted by this migration.

**This changes the notification uniqueness contract.** Deploy the new compatible feature code to Preview **before** applying this migration, and ensure the previous deployment has no in-flight notification work. New code can operate on the old schema (immediate ETA updates explicitly report missing setup); old deployed code must not continue writing after the index migration. Do not roll back to the old sender code after applying it without a separately reviewed schema/data plan. Never drop objects to resolve conflicts automatically.

Before any remote execution, confirm the independently verified Preview Neon branch/endpoint, `mo_bistro_2`, backup, and the existing WhatsApp/core/ETA migrations. Inspect read-only:

```sql
SELECT current_database(),current_schema();
SELECT to_regclass('public.guest_eta_changes'); -- must be NULL before first application
SELECT column_name FROM information_schema.columns
 WHERE table_schema='public' AND table_name='whatsapp_notifications'
 AND column_name IN ('event_key','eta_snapshot_at'); -- must be absent
SELECT conname,pg_get_constraintdef(oid) FROM pg_constraint
 WHERE conrelid='public.whatsapp_notifications'::regclass
 AND conname IN ('whatsapp_notifications_kind_check','whatsapp_notifications_guest_id_kind_key');
```

Stop if expected constraints differ or new objects already exist. Validate the exact migration on fresh isolated synthetic QA first. Only after separate approval apply the exact transaction to Preview. No runtime DDL is introduced.

Read-only postflight:

```sql
SELECT to_regclass('public.guest_eta_changes');
SELECT indexname,indexdef FROM pg_indexes WHERE schemaname='public'
 AND tablename='whatsapp_notifications';
SELECT conname,pg_get_constraintdef(oid) FROM pg_constraint
 WHERE conrelid='public.whatsapp_notifications'::regclass;
```

Confirm the old two-column uniqueness constraint is replaced by confirmation/review's partial uniqueness and event-key uniqueness, and the kind/snapshot checks match the reviewed SQL. Do not test by messaging customers. Existing deployment and configuration prerequisites for operations visibility/automatic cleanup remain separate.

## Verification limits

Migration-backed tests use fresh embedded PostgreSQL with synthetic records and provider stubs. They cover review opt-in/legacy preservation, 60-minute review timing, immediate/future ETA jobs, short ETA single-alert handling, superseded callbacks, repeat mutation IDs, clear, non-subscribers and zero real provider calls. Browser fixtures check theme-independent green and absence of the review checkbox. Real separate-session PostgreSQL concurrency, deployed migration compatibility and live WhatsApp delivery remain unverified.
