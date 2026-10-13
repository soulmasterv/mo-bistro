# Mo Bistro stabilization readiness — 13 October 2026

**Local build is repaired; Preview readiness remains BLOCKED on reviewed schema application and actual isolated PostgreSQL validation.** This report reconciles the consolidated council plan, rather than treating the council PDFs as independent runtime evidence.

## Preserved baseline and changes in this batch

Branch `feature/mo-bistro-ui-rebuild`; baseline before this batch **13ccad152d433969610ef7478218d83446b3f013**. Ancestor checks succeeded for WhatsApp **b7845e29e3c862f1a22e970d5b02cbeeb0f9ab6c**, neutral UI **e2803f111d0bfecf17ed40782e1a3d6e74c00ce4**, and stabilization 13ccad1. This report accompanies the reviewed local stabilization commit; its exact SHA is reported in the handoff and available from Git. Existing commits remain intact. No reset/rebase/merge/fetch/push occurred. Import-production-guests.mjs and historical migrations have no diff.

- Fixed SQLite authentication initialization order: request cookies and token shape are checked before opening SQLite. Valid sessions retain active/expiry checks. PostgreSQL delegates through the unchanged branch. Login initialization remains available.
- Repaired the installed Windows better-sqlite3 12.11.1 binary for Node 24.19.0 / ABI 137 from its official WiseLibs prebuilt release. pnpm had recorded this package under ignoredBuilds; a plain rebuild did not repair it.
- Added explicit `check:sqlite` and `setup:sqlite` scripts. These load/repair the native addon without constructing a database, altering dependency versions, changing app flags, or broadly enabling other lifecycle scripts.
- Enabled installed PGlite workflow tests without setting environment variables. Updated their empty in-memory fixture with the existing core-support migration; its old omission of seated_at caused one initial test failure.
- Added command-line tool/screenshot arguments for the existing browser fixture suite; no environment overrides needed.
- Expanded the opt-in real PostgreSQL concurrency harness and added preconnection safety-gate tests. No real database case was executed.
- Added Preview-only migration preflight/postflight/procedure and disposable concurrency documentation. No application UI, booking, seating, WhatsApp dispatch, schema or consent feature was reimplemented.

## Council plan reconciliation

Completed means implemented in source, not proven on deployed Neon. Unverified means the required environment/evidence is still missing. Optional/deferred work is not silently promoted into this batch.

| Plan item | Current status and evidence |
|---|---|
| A1: deployed revision, configuration and webhook evidence | Partial / unverified connection: last inspected Preview source e2803f1; actual 503 logs 42P01; operator confirms missing window table; Preview flags observed test/false/window true. Endpoint/branch identity and historical table application time remain unknown. |
| A2: schema inventory and installation guide | Completed in source: README sequence, core-support migration and metadata checks. Fresh PostgreSQL installation/upgrade execution unverified. |
| A3: immutable migrations / forward upgrades | Completed policy and files; historical migrations preserved. Optional new baseline snapshot deferred. No live schema compatibility claim. |
| A4: preflight and rollback | Narrow window-table stop/validation procedure ready. Comprehensive tested database restore/upgrade recovery remains unverified. |
| B1: shared creation policy | Completed: booking-creation.ts serializes capacity/duplicate/permit/insert across public and staff sources. Actual concurrent PostgreSQL behavior unverified. |
| B2: full-queue override decision | Completed default: both sources enforce capacity; no silent manager bypass. Optional explicit audited override not introduced. |
| B3: database-level active-phone uniqueness | Deferred/incomplete pending duplicate audit; no constraint or customer cleanup added. |
| B4: canonical confirmation key | Completed: approval_required wins, require_confirmation fallback and safe default; initialization preserves legacy value. Mock/embedded regressions succeed; real Preview checks pending. |
| B5: core seated_at independent of WhatsApp | Completed in both PostgreSQL seating modes; existing timestamps preserved. Core-support migration prepared; actual Preview column compatibility unverified. |
| B6: demo/diagnostic server boundaries | Completed source guards; regression assertions succeed. Prior loopback production-mode diagnostic denials observed; real role/config coverage pending. |
| C1: remove misleading assignment toggle | Completed; area/table inventory validation retained. No unrelated UI changes in this batch. |
| C2: new walk-in tracking handoff | Completed source: one-time private token, hash storage and staff QR/copy handoff; queue listings omit token. Browser fixture passes, persisted Neon workflow unverified. |
| C3: guest-controlled consent | Existing subscription/review preference controls and verified inbound opt-in retained; staff cannot grant consent. Post-booking initial-confirmation-consent editing is not implemented; decide its relevance before adding it. Legacy guest recovery/backfill remains deferred. |
| C4: ETA editing/clearing | Completed staff sheet and API; shared estimate kept separate. Mock/embedded and browser fixture checks succeed; real persistence/timing unverified. |
| C5: distinct next-guest suggestions | Completed coordinated snapshot across areas; advisory only. Real concurrency/assignment validation pending. |
| C6: Parties ahead / compact queue | Completed wording and existing A3 sheet; seated guests excluded from active All guests. Fixture coverage exists; current real devices unverified. |
| D1: minimize lookup disclosure | Completed phone-only presence response, no name/party/ID/token return. Presence disclosure intentionally remains; real deployment limits unverified. |
| D2: lost-link ownership recovery | Deferred/incomplete: no OTP or verified recovery provider. Not required for new walk-in handoff. |
| D3: shared-network/QR/peak load | Incomplete/unverified: prior loopback static/input load is not PostgreSQL or shared-IP proof. No limit changes guessed. |
| D4: outage/license policy | License enforcement retained; signed grace policy is an owner decision, not implemented. Controlled database outage/recovery still unverified. |
| D5: paper fallback/reconciliation | Operational fallback/runbook not completed or exercised. |
| D6: shifts | Completed informational wording; off-shift authentication restriction intentionally deferred. |
| E1: local checks/rendering | Executed this batch; results below. Fixtures do not establish live readiness. |
| E2: distinct real PostgreSQL harness | Prepared and expanded; backend-PID, locking and mutation cases executable only after approval. |
| E3: fresh/upgrade, modes/requests/revocation | Embedded workflow checks execute; genuine PostgreSQL fresh/upgrade/multi-session cases BLOCKED. Harness does not claim full migration-upgrade coverage. |
| E4: Preview and real devices | BLOCKED / unverified: current authenticated workflows and physical iPhone/iPad/Android/assistive technology not inspected in this batch. |
| E5: isolated peak-service load | Not executed; BLOCKED on approved disposable environment. |
| E6: shadow restaurant service | Deferred owner/operational decision; not conducted. |
| E7: actual WhatsApp activation tests | BLOCKED on separate approval; normal mode remains test/false. No sends or callback replays. |
| E8: Production promotion | Excluded; no authorization or readiness claim. |

Other deferred council ideas stay deferred: multi-tenancy, personalized wait prediction, analytics/no-show reporting, international registration, removing SQLite, floor-plan/POS/payments/payroll and extra notification types. No demand/evidence justifies introducing them during stabilization.

## Validation results

| Check | Status | Evidence / limits |
|---|---|---|
| Local native addon | PASS | Native module loads under win32/x64 Node ABI 137; no SQLite connection constructed. |
| Fresh production build | PASS | Standard Next 16.4 Turbopack build: compilation, TypeScript, all 44 static generation tasks and route output succeeded. No app environment overrides. Webhook appears as a dynamic route. |
| Standalone TypeScript | PASS | tsc --noEmit exit 0. |
| Repository lint | PASS | Final ESLint exit 0. Initial test variable named module was corrected. |
| Offline/embedded regressions | PASS within stated scope | Full run: 128 tests discovered, 126 successful assertions, 0 failures, 2 skipped (browser tool configuration and real PostgreSQL). Mock auth/provider boundaries and in-memory PGlite only. |
| Rendered browser fixture | PASS within fixture scope | Separate run with explicit tool arguments: 1 suite succeeded at five desktop/tablet/mobile widths, 0 failures, no skip. Combined coverage leaves the real PostgreSQL case unexecuted. |
| SQLite auth tests | PASS | Missing/malformed token opens no DB; request-time boundary precedes DB; valid-session checks retained; PostgreSQL delegation unchanged. |
| Fresh-build anonymous HTTP authorization | PASS, narrow scope | Actual loopback GETs: auth/me 401, guests 401, Management 403, isolated WhatsApp test 401, with safe error bodies. Local data file inventory unchanged; server stopped. No valid-session workflow inferred. |
| Preview webhook | FAIL / unresolved until approved schema fix and verification | Last actual logs show 503/42P01; operator confirms missing window relation. No live retry or test was triggered here. |
| Real PostgreSQL concurrency | BLOCKED | No approved disposable connection. Harness skipped without connecting. Pure target-refusal checks succeeded. |
| Preview schema compatibility | BLOCKED / partial evidence | Window relation absent and test relations present are operator-verified. Core support/ETA/PIN/shifts/request types, constraints, privileges and endpoint match remain to be checked. |
| Historical error/application timing | BLOCKED | Test table creation time unknown; no migration audit evidence. |
| Live recovery/deployment | BLOCKED | No schema change/deployment/real inbound verification approved or executed. |

The initial PGlite seating fixture returned 503 because it predated the seated_at core requirement. The fixture now applies the already-existing core migration and the full rerun passes. This was not a discovered live migration conflict. No failure is hidden as a PASS; initial and final logs are retained.

## Exact prerequisites before Preview deployment

1. Verify active deployment's **MO_BISTRO_POSTGRES_URL** matches the operator-verified Neon **Preview branch/endpoint and mo_bistro_2**, not merely the database name. Preserve test/false flags.
2. Run the reviewed read-only checks as the app role. Stop if they reveal alternate-schema/shadowed relations, incompatible types/keys, unknown permissions or any corrective proposal that could lose data. Do not automatically execute every historical migration.
3. Obtain separate approval to apply the existing **20261013_whatsapp_customer_windows.sql** to that verified Preview target using `docs/preview-window-migration-procedure.md`. Run its preflight/postflight SQL. This narrow DDL adds only the missing 3-column composite-key table; it alters no consent. No code redeployment is required for that table-only correction if the existing deployment/configuration is correct.
4. Independently check core-support and ETA requirements before publishing 13ccad1/local fixes. IF NOT EXISTS does not repair incompatible definitions. Obtain approval for any required narrow migration/grants; no backfilled seating times or opt-ins.
5. Approve an empty disposable **mo_bistro_qa_*** database, then execute the harness and additional cases in `docs/isolated-postgres-concurrency-plan.md`. Never target Preview/Production. Prove unmodified public-schema fresh/upgrade paths separately.
6. Complete controlled database load/failure/recovery, real authenticated role/booking/ETA workflows and mobile/tablet/browser checks. An HTTP 200 or a synthetic screenshot alone is not acceptance.
7. Review the completed local commit, then obtain explicit approval to push/deploy the feature branch. Confirm the resulting Preview SHA and actual schema after deployment. Do not merge main or activate general outbound sending.
8. Obtain separate approval for any actual inbound/outbound WhatsApp test; maintain signature, opt-in, STOP/UNSUBSCRIBE, recipient and window safeguards.

## Evidence and remaining review notes

Logs/screenshots are outside the checkout under `outputs/stabilization-readiness-20261013`: build.log, typescript.log, regressions.log (initial fixture failure), regressions-final.log, sqlite-auth-final.log, lint.log (initial test naming issue), lint-final.log, native-check.log, browser.log, local-auth-results.json, local-auth-server.log and screenshots. No real PostgreSQL/backend latency measurements are available.

The prior review also identified possible generic 500s when a rate-limit SQL exception escapes before a handler catch, and raw error logging in the ETA update route. These remain source-review findings, not reproduced current Preview bugs; no speculative production behavior changes were made here.

No external or persistent database was opened or modified. Regression databases were empty, temporary in-memory engines only. Local data directory remains empty. No environment variable was changed; no queued job was dispatched; no WhatsApp provider request, push, deployment, main or Production change occurred. No migration conflict or data-loss condition was discovered from available evidence; unknown live schema details remain explicit blockers.
