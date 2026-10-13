# Real PostgreSQL QA verification — 13 October 2026

Branch: `feature/mo-bistro-ui-rebuild`. Baseline: `d517d450cba6fcf5ffdf6443e10810cc1a57480f`.
Target: explicitly approved disposable Neon database `mo_bistro_qa_disposable` only.

## Executed results

Real PostgreSQL harness: **12 checks passed, zero failures, zero skips**, including ten concurrency scenarios. Duration: 103.6 seconds.

- Independent backend sessions verified.
- Mixed public QR/staff registrations respected capacity.
- Concurrent identical phone registrations created one active booking.
- QR permit was consumed once; insertion failure rolled back consumption.
- Capacity edits coordinated with registration.
- Two guests could not claim one named table.
- One guest could not claim two named tables.
- Cancel/seat and call/cancel races preserved consistent final state.
- Duplicate table releases preserved `seated_at`.
- Simple Mode respected capacity and release retry safety.

The exact six migrations from `isolated-postgres-concurrency-plan.md` ran only after direct TLS connection, identity and empty-schema checks passed. Expected `42701`/`00000` NOTICEs from guarded migration operations did not fail initialization. No unexpected PostgreSQL errors failed the run.

The harness startup now performs a read-only identity query before reserving its administrator connection. This avoids a cold postgres.js reservation stall with `fetch_types:false`; reserved-session identity verification, advisory locking and empty-schema guards remain intact.

Nine offline migration/safety tests, syntax, TypeScript and lint passed. The complete offline regression suite passed 134 tests with zero failures and one browser-fixture skip. These offline checks are distinct from the executed real PostgreSQL concurrency tests.

The local production build passed, including TypeScript and static-page generation. Its route manifest includes `/management`, `/api/whatsapp/test` and `/api/whatsapp/webhook`. The initial sandbox build failed Windows path canonicalization with access denied; the permitted local build retry succeeded without an application code change.

## Boundaries

Authentication/licensing boundaries were synthetic and WhatsApp sending disabled in this harness. This does not establish live Preview authentication, webhook delivery, Meta provider delivery, or Preview schema compatibility.

Credentials stayed in a private local configuration outside Git and were not printed or committed. QA schema and synthetic records were retained; another initialization requires a newly approved empty database. No Preview/Production database, application environment variable, customer record, or outbound message was changed.

## Preview readiness gates

1. Verify the deployed feature commit and Preview-only database endpoint; the last reported deployment is historical evidence, not a current verification.
2. Run read-only schema diagnostics as the Preview application role. Compare core support/ETA/staff/inventory requirements individually; do not apply every migration speculatively.
3. If still absent, apply only the separately approved `whatsapp_customer_windows` table migration using `preview-window-migration-procedure.md`; verify columns, primary key and app-role privileges afterward.
4. Preserve `WHATSAPP_MODE=test` and `WHATSAPP_ALLOW_LIVE_SEND=false`. Check the isolated test flag, configured recipient, Meta credentials and business phone number in Preview without exposing secrets.
5. Deploy Preview only after explicit authorization to push/deploy. Confirm `/api/whatsapp/webhook` and `/api/whatsapp/test` are present in the build.
6. The configured test recipient must send an inbound message to the configured business number. Verify signed receipt, matching recipient/business and actual timestamp within 24 hours. HTTP 200 alone does not establish the window.
7. Sign in as Manager, use Check setup, then explicitly confirm one Send Test WhatsApp action. Check safe provider acceptance and signed delivery status separately. No automatic retry or customer outbox dispatch.

This report authorizes no deployment, migration, environment change, or message.
