# Stabilization implementation and Co-work handoff

Branch: feature/mo-bistro-ui-rebuild. No Production, credential, deployed flag, database or provider changes were made. New SQL is prepared for review, not executed. No push/deploy is authorized by this implementation request.

## Delivered in source

- Shared PostgreSQL creation transaction for public and staff entries, with one capacity/duplicate lock; Management capacity changes hold that same lock. Staff cannot pass WhatsApp opt-ins. SQLite creation also checks capacity inside its creation transaction.
- One confirmation policy: approval_required wins, require_confirmation remains a legacy fallback. Guest list, tracking and Management read consistently; initial default creation preserves a legacy value.
- Core seated_at is recorded in both PostgreSQL inventory modes regardless of WhatsApp enablement. Requires the new core support migration if the column is absent. Existing timestamps are preserved; unknown history is not fabricated.
- Forward SQL definitions for QR permits/rate limits/core timestamp, read-only schema checks, and documented installation/upgrade paths.
- Server gating for test data and diagnostics; no demo controls advertised outside allowed environments.
- Unused assignment toggle removed; seating still requires valid area or named-table capacity.
- Walk-ins receive a private token at creation and receptionist QR/copy handoff; no token is exposed in queue listing. Existing guest-side subscription/review consent remains guest-controlled.
- Expected-readiness editing/clearing in guest details, quiet schedule wording, Parties ahead label, coordinated distinct next-guest suggestions.
- Public lookup is phone-only and returns an active-registration boolean, not name/party/status/booking ID or tracking token. It remains a limited presence signal; full identity-verified recovery is not implemented.
- Separate real PostgreSQL opt-in concurrency harness. Existing PGlite tests remain distinct. Application import rules stay strict; CommonJS setup utilities explicitly permit require imports.

## Remaining gates

- Exact Preview webhook 503 cause and deployed SHA need actual Preview logs/response and schema metadata. No missing-IP guess is used for Meta POST.
- The schema sequence must be proven on an approved empty isolated database and a representative upgrade case. Production must not be used as a test target.
- Real cross-connection PostgreSQL tests, shared-network load testing and real iPhone/iPad/Android validation remain NOT TESTED until access/approval.
- Active-phone uniqueness constraint is deferred until existing duplicates are audited; no silent deletion/backfill.
- Legacy walk-ins without tokens/consent rows are not automatically granted access/opt-in. Lost-link identity recovery needs a separate design.
- No OTP provider, off-shift lockout, license grace bypass, international-phone expansion, analytics or wait prediction is introduced.
- WHATSAPP_MODE=test and WHATSAPP_ALLOW_LIVE_SEND=false must remain unchanged. Actual sending/deployment/migration needs further approval.

## Prompt for Co-work - read-only Preview evidence first

Inspect the local soulmasterv/mo-bistro checkout on feature/mo-bistro-ui-rebuild and read README.md plus docs/stabilization-handoff.md. These stabilization changes are locally committed but not pushed; if Co-work only has GitHub access, provide this handoff and migration files or authorize a feature-branch push first. Do not assume GitHub/Preview already contains the local fixes. Compare the Preview deployment's source SHA to the feature branch. Confirm that the selected Neon connection is ONLY the isolated Preview database mo_bistro_2; if this cannot be established, stop database work.

Do not change Production/main, deploy, edit credentials or environment variables, apply migrations, invoke notification dispatch, send WhatsApp messages or touch scripts/import-production-guests.mjs. Keep WHATSAPP_MODE=test and WHATSAPP_ALLOW_LIVE_SEND=false. Never print connection strings, tokens, phone numbers, tracking links or raw signed payloads.

Read the response body and bounded database error code for the existing /api/whatsapp/webhook POST 503 logs. Distinguish disabled integration/PostgreSQL configuration from processing/schema failures; do not blame forwarded-IP rate limiting because this handler does not call it. Do not replay inbound POST payloads to provoke side effects.

Run only reviewed read-only schema metadata queries, using docs/core-schema-preflight.sql and docs/whatsapp-preview-schema-check.sql as references. Compare required table/column types, constraints and indexes; report missing/incompatible objects without modifying them. Report counts rather than customer details.

Return: deployed SHA, exact failure evidence (or explicitly unresolved), schema diff, proposed ordered SQL for the isolated Preview database, compatibility/rollback concerns and the acceptance tests to run after approval. Ask for explicit approval before applying any SQL, creating test schemas, changing flags or sending messages. Do not claim tests passed from page availability alone.

After separate approval for a disposable test database, run the dedicated isolated-postgres-concurrency.test.mjs with its explicit test URL/acknowledgment variables, not the Production/app URL. This test writes a synthetic generated schema and removes it; obtain approval before running. Prove fresh-install/upgrade paths and genuine connection-level locking, then report actual results. Do not treat a PGlite pass as Neon proof.

## Local validation

71 mock-only core/security/WhatsApp regression tests passed. TypeScript and production build passed with general WhatsApp in test/false mode. Repository-wide ESLint passed. A temporary local production-mode Next server returned 404 for /debug and /runtime-test; it was stopped after verification. The rendered browser fixture passed at five desktop/tablet/mobile widths, including staff tracking QR handoff and ETA save/clear. Screenshots are under outputs/stabilization-ui outside the source checkout. These are synthetic fixture results, not live Preview or Neon evidence. The opt-in real PostgreSQL harness and all migration SQL remain unexecuted.
