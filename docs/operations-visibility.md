# Service controls, wait accuracy, staff activity and WhatsApp health

Feature branch only. No production configuration, database or deployment is changed by this implementation.

## Behaviour

- Management → Service controls offers a custom-confirmed pause/reopen control for public registration. It changes only `restaurant_settings.public_waitlist_paused`. Existing bookings, tracking, seating and staff walk-ins remain usable. The PostgreSQL public registration transaction checks this setting under queue lock `91401283`, before consuming a QR permit or inserting a guest. The manager's pause update takes the same lock. SQLite public registration also checks the setting inside its transaction, but the new Management control/insights require PostgreSQL.
- The public page refreshes pause state on focus and every 30 seconds. The server remains authoritative if the page is stale. A paused submission returns HTTP 503 with a friendly explanation.
- Wait accuracy records new seating transitions in both inventory modes. It compares authoritative join/seating timestamps and the **last personal ETA**, not the restaurant-wide estimated wait or the initial quoted ETA. The view shows a 30-day sample count, average actual wait, average absolute ETA error, signed bias and within-10-minute count. Missing estimates are excluded from accuracy denominators. Invalid legacy join timestamps produce no sample. Nothing adjusts estimates automatically or invents historical samples.
- Staff history records booking status/confirmation/ETA/assigned-table changes, named/anonymous occupancy changes, public pause/reopen and explicit Danger Zone bulk actions. Authenticated actor IDs are set transaction-locally by the server, never accepted from a browser. Unknown/system actors are explicitly labelled. History starts after migration; no retrospective attribution is claimed. Staff account edits/login/logout and other settings are not included in this first history scope.
- Accuracy and activity rows contain no guest names, phone numbers, tracking tokens or message contents. Numeric booking IDs may remain. They have no FK to guest profiles and survive the 3-day guest purge. A separate retention policy for these records has not been enabled.
- All new insights and mutations are manager-only and no-store. Mutations enforce origin, license, payload and confirmation checks. Activity is limited to 100 newest events, WhatsApp jobs to 50 newest, with internal scrolling on small screens.

## WhatsApp investigation and safe visibility

The existing sender intentionally requires **all three**: `WHATSAPP_ENABLED=true`, `WHATSAPP_MODE=live`, `WHATSAPP_ALLOW_LIVE_SEND=true` (and PostgreSQL). Test mode simulates ordinary automatic delivery; the isolated manually confirmed Preview test has a separate narrow permission path. Its successful delivery does not prove that automatic sending, customer opt-in or a scheduled booking event is enabled.

The retained requested settings are `WHATSAPP_MODE=test` and `WHATSAPP_ALLOW_LIVE_SEND=false`. This implementation does not change either setting, send a message, drain an outbox or retry an old job. No deployed environment or Vercel/Neon logs were accessed, so a deployment-specific root cause is **not independently verified**.

The health panel reads configuration **booleans only**, schema availability, job state, verified subscription/window state for the matching configured business phone and latest safe delivery events. Unknown free-text provider/database errors are replaced with a generic safe explanation, never returned verbatim. It shows missing scheduler/Meta/association configuration and the distinction between provider acceptance, delivery, simulation and unknown acceptance. Configuration presence does not prove credentials are valid or a scheduler is working.

Automatic events remain the existing events only: legacy consented confirmation, Almost Ready at personal ETA minus 10 minutes, and separately consented review at seated time plus 60 minutes. New simplified public bookings do not request initial confirmation consent. Subscribing alone or marking called creates no immediate notification. Outside the verified 24-hour window an applicable configured approved template is still required. Existing Preview recipient restrictions and STOP/UNSUBSCRIBE remain unchanged.

## Migration procedure — prepared only, do not execute without approval

Read-only preflight on the independently verified Preview endpoint/database:

```sql
SELECT current_database(), current_schema(), current_schemas(false);
SELECT table_name,column_name,data_type FROM information_schema.columns
 WHERE table_schema='public' AND table_name='guests'
 AND column_name IN ('id','created_at','status','confirmed','table_id','eta_at','seated_at');
SELECT to_regclass('public.simple_table_capacity'),
 to_regclass('public.staff_activity_events'),to_regclass('public.wait_accuracy_samples');
SELECT n.nspname,p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname IN
 ('record_guest_operations','record_waitlist_pause','record_inventory_operations');
```

Confirm `mo_bistro_2` and the expected Neon branch/endpoint. Existing base/core, manual ETA (`20261010_guest_manual_eta.sql`) and Simple Mode migrations must already be installed. The two new relations and three new functions must not exist. Stop on conflicts; do not drop/recreate existing objects or rerun this migration to overwrite them.

After review and separate approval, first validate `migrations/20261014_operations_visibility.sql` on a new isolated synthetic QA database. The migration creates only two tables, indexes, functions and triggers in one transaction; it contains no historical backfill or deletion. Only after reviewing QA results and a backup should the approved operator apply the exact file to Preview. Do not run any migration from app startup or apply it to Production.

Read-only postflight:

```sql
SELECT to_regclass('public.staff_activity_events'),to_regclass('public.wait_accuracy_samples');
SELECT tgname,tgenabled FROM pg_trigger
 WHERE NOT tgisinternal AND tgname IN ('guest_operations_after_update',
 'waitlist_pause_after_change','named_inventory_after_update','simple_inventory_after_update');
SELECT COUNT(*) FROM public.wait_accuracy_samples;
SELECT COUNT(*) FROM public.staff_activity_events;
```

Counts start at zero until new events occur. A missing migration makes the new sections explicitly unavailable while existing operations continue. Transaction-local actor context is harmless before trigger installation. Recording failures after installation roll back the associated mutation so it cannot silently lose its history.

## Remaining verification / activation

- Local migration-backed tests use a fresh embedded PostgreSQL engine with synthetic fixtures, with advisory locks stubbed; this does not prove separate-session PostgreSQL concurrency. Extend/run the disposable QA harness after separate database approval before deployment.
- No live scheduler or WhatsApp delivery is exercised. Inspect Preview's new health output after deployment, then obtain separate approval for configuration changes and a controlled single-recipient sending test. Never change live flags simply to clear a warning.
- The previously prepared automatic cleanup remains paused unless explicitly enabled and scheduled. Its migration prerequisites and backup requirements still apply.
