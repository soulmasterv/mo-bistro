# Automatic cleanup (Preview only)

Implemented locally; no database, scheduler or environment changes are made by this feature's implementation or tests. Default is **paused**. No migration is required for the cleanup setting itself: it uses existing `restaurant_settings` keys.

## Retention agreed with the owner

- Delete bookings whose status is `seated` and authoritative `seated_at` is strictly more than 72 hours old. A tracking link for a deleted booking will no longer work.
- Keep waiting/called/cancelled/no-show bookings. No cutoff was requested for the latter two states.
- Keep missing seating timestamps, guests still assigned a named table, unreleased named seating history, and notifications with `sending` or `unknown` status for investigation. Cleanup never frees a table or changes anonymous capacity.
- Delete released seating history belonging to deleted bookings. Existing foreign keys delete booking consents, notification jobs and delivery logs. Simple Mode capacity events survive with a null guest reference.
- Redact orphan inbound phone numbers while retaining message IDs/actions for webhook deduplication. Delete customer windows only when no remaining booking consent uses that number.
- **Keep `whatsapp_contact_preferences`**, including STOP/UNSUBSCRIBE protections. Keep isolated Preview test records and their rate limits. Those records have no approved deletion policy yet.
- Delete only expired QR registration permits, expired API rate-limit windows and expired staff sessions. Delete booking recovery request hashes older than 3 days. Active security controls and credentials remain intact.

## Guardrails

The scheduler route only supports POST. It requires `VERCEL_ENV=preview`, `MO_BISTRO_DB=postgres`, an independent private `DATABASE_CLEANUP_SECRET` of at least 32 characters, and an exact `Authorization: Bearer <secret>` header. Missing authentication never reaches SQL. The worker verifies `current_database() = 'mo_bistro_2'` before deleting; a differently named database aborts. This name check supplements environment isolation; verify the Neon endpoint/branch too before activation.

Managers can enable/pause the policy under Management → Danger zone. Changing that preference requires manager authentication, same-origin validation, an active license and a custom confirmation. It does not itself delete anything. Enablement defaults to false when no setting exists. Scheduler-secret presence does **not** prove an actual schedule exists.

One transaction acquires the existing seating and registration locks in their existing order. Maximum 500 candidate bookings and 1,000 rows per temporary table per run. Jobs are locked and rechecked to avoid deleting an in-flight delivery. Missing schema, FK errors or other SQL failures roll back the entire batch. Repeated successful calls are safe; no provider API is called. Last successful completion time and counts are saved without customer data.

## Activation prerequisites — do not execute without approval

1. Deploy the reviewed feature commit to **Preview only**. Verify its deployment/environment and the connection's Neon endpoint/branch, database `mo_bistro_2`, existing migrations/FKs, and a restorable backup. Do not point the worker at Production.
2. Review the retention consequences above, especially loss of historic guest details, booking-specific consent evidence and delivery logs. Export any required historical report before activation.
3. Configure a new random `DATABASE_CLEANUP_SECRET` privately in Vercel **Preview only** and in the scheduler's secret store. Never put it in a URL, repository, browser, screenshot or command history. Do not reuse a WhatsApp token or signing key. Redeploy Preview if necessary for configuration to take effect. Keep `WHATSAPP_MODE=test` and `WHATSAPP_ALLOW_LIVE_SEND=false` unchanged.
4. Configure a server-to-server scheduler against the verified Preview URL: `POST /api/internal/database-cleanup`, `Authorization: Bearer <private cleanup secret>`, no body. Suggested frequency: daily at 03:00 UTC, no automatic retries initially. Do not create a Production cron as a workaround. The repository does not provision any scheduler.
5. Enable cleanup in Management with its custom confirmation only after the target and backup are verified. Daily scheduling removes eligible records on the next run after 72 hours (usually between 72 and 96 hours); bounded batches may require additional runs for a large backlog.
6. Inspect the last-run counts and failures. To stop future deletions, pause in Management and disable the scheduler; pause takes effect after any already-running transaction. Failed/ambiguous runs must be investigated before manual repetition. Deleted data can only be recovered from a backup.

## Verification limits

Regression tests execute actual migration-backed SQL using a fresh **in-memory embedded PostgreSQL engine (PGlite)**, never a remote database. They cover retention exclusions, FK cleanup, shared phone windows, suppression/deduplication, expiry protection, wrong-target rejection, rollback and repeat runs. Advisory locks are stubbed because this engine does not test separate concurrent sessions. **Real PostgreSQL concurrency, deployed scheduler invocation and live deletion remain unverified.** Browser workflows use synthetic intercepted endpoints only.
