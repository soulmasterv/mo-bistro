# Temporary release-safety diagnostic — 23 October 2026

Implemented locally only. No push, deployment, alias change, environment edit,
live database connection, queue processing or external message was performed.
The diagnostic must not be treated as runtime attestation until deployed and
queried under separate operator approval.

## Entry point and access

GET /api/management/release-safety is a server-only route with no public page.
Other request methods cannot run the handler; HEAD is explicitly rejected even
though Next normally delegates HEAD to GET. Unauthenticated and non-manager
callers receive a generic 404 without diagnostic details. There is no CORS grant.
Cross-site requests and mismatched Origin headers are rejected. Responses are
private/no-store and vary by Cookie.

The handler rejects anything except VERCEL_ENV=preview and MO_BISTRO_DB=postgres
before constructing a database client. It validates MO_BISTRO_POSTGRES_URL
before any authentication SQL. Only endpoint ep-still-wind-b4036sdr (direct or
pooler, including Neon cluster host form), on a regional Neon host, port 5432,
database mo_bistro_2 is accepted. Host/database/port overrides, multi-host URLs,
unexpected query settings, fragments and insecure TLS options are rejected.
Only sslmode=require/verify-full and channel_binding=require are permitted URL
options, and those options are not passed through to the driver.

Pilot adds only this exact API path to its existing allowlist. Other management
and WhatsApp routes remain excluded. The handler itself enforces Preview and
manager access independently of that navigation layer.

## Database and authentication safety

A dedicated Postgres.js client receives explicit validated host, database, port,
username and password, preventing ambient PG* variables or an old application
pool from redirecting this check. TLS certificate/hostname verification is on.
No connection string, credential, session token or raw driver error is returned
or logged.

The client uses max=1, a 3-second connect timeout, and an 8-second overall
deadline followed by forced connection closure. The route has maxDuration=10.
All SQL is inside BEGIN READ ONLY. SET LOCAL applies statement_timeout=2s,
lock_timeout=500ms and idle_in_transaction_session_timeout=3s; these are
transaction-local limits, not persistent database configuration changes.
Using SET LOCAL avoids poolers that reject extra startup parameters.

The existing HMAC session-cookie format, active-user check and expiry check are
reused, with a manager-only SELECT. Invalid sessions run no identity query.
Authenticated identity uses current_database(), current_schema() and
current_setting('transaction_read_only'); any unexpected result fails closed.
Only mo_bistro_2 / public / read-only=on can produce a successful diagnostic.
Errors return a generic 503. No dispatcher, scheduler, migration, cleanup or
sending module is imported or invoked; no application records are modified.

## Independent Neon mapping evidence

Read-only Neon control-plane inspection on 23 October 2026:

- Project summer-cell-27734526, branch br-misty-king-b4tugm8h.
- Current display name: Mo-Bistro - TESTINGS (Prev and Dev).
- Branch Computes page lists primary endpoint ep-still-wind-b4036sdr (suspended
  at inspection); no compute was resumed or edited.
- Branch Databases page lists mo_bistro_2. No SQL Editor or data table was opened.

Evidence pages:
https://console.neon.tech/app/projects/summer-cell-27734526/branches/br-misty-king-b4tugm8h/computes
https://console.neon.tech/app/projects/summer-cell-27734526/branches/br-misty-king-b4tugm8h/databases

This independently establishes endpoint-to-branch mapping; it does not establish
that either currently deployed application uses that endpoint. The runtime
response deliberately does not fabricate branch identity from a constant. The
mapping should be rechecked at release if control-plane state changes.

## Minimal result and interpretation

The successful manager-only JSON contains:

- database: endpoint ID, database, schema, matches_expected.
- deployment: sanitized VERCEL_GIT_COMMIT_SHA and VERCEL_DEPLOYMENT_ID, or null
  where unavailable. Null is not proof of deployment identity.
- messaging: normal_sending_allowed, manual_preview_test_sending_allowed,
  window_sending_allowed, pending_job_delivery_live_allowed and
  all_reviewed_sending_paths_disabled.

Normal delivery requires enabled=true, Postgres mode, mode=live and explicit
live permission. The separate manual Preview test requires Preview/Postgres,
mode=test, preview-test enabled and live permission not true; it can send even
with normal notifications disabled. Window delivery also requires its window
flag. Pending Pilot/Advanced delivery and scheduler publication have normal
live-policy guards. No jobs are drained to verify these policy results.
The matrix test compares both computed gates with the actual policy modules
across 48 flag combinations on each branch.

A successful HTTP response does not mean sending is safe: both allowed fields
must be false and all_reviewed_sending_paths_disabled must be true. This is an
attestation of reviewed code paths and runtime policy, not an external-provider
delivery test. Historical deployments/callback destinations require separate
verification and do not inherit newly inspected project-variable values.

## Local validation and release boundary

The new suite covers non-Preview rejection before SQL, host/URL/PG* redirect
protection, session absence, manager/expiry/active predicates, GET-only behavior,
Origin checks, read-only limits, timeout/closure, sanitized failures, minimal
responses, both messaging gates, and exact Pilot routing. PGlite executes the
authentication predicates and demonstrates rejected writes in an isolated
read-only transaction. It does not contact Neon or certify live runtime identity.

Both diagnostics are based on the previously reviewed release tips:
Pilot d71afd9b3ec313b6f4156e8488626e77b7d24644 and Advanced
88bcd1c59e978a4a5b3c963944a7b1385108d716. Concurrent subscription-removal work
in the old checkouts is excluded; isolated diagnostic checkouts use the original
fix/pilot-readiness-20261023 and fix/advanced-readiness-20261023 branches.

No manifest/lockfile upgrade is included. Next.js 16.4.0 emits an existing
security-advisory reminder; a dependency security upgrade remains recommended
before release and is outside this diagnostic change.

Final local results on the isolated reviewed branches:

- Pilot: 25 passing tests (10 new diagnostic/security tests and 15 existing
  Pilot lifecycle/polling regressions), zero failures/skips.
- Advanced: 74 passing tests (10 diagnostic/security tests plus 64 existing
  handler, operational, booking and Detailed-lifecycle regressions), zero
  failures/skips. The final added deadline assertion also passes.
- TypeScript, full source/test ESLint and Turbopack production builds pass on
  both branches. Initial advisory-reminder exits were followed by successful
  retries. A stale Pilot build cache caused an earlier CSS worker failure;
  fresh isolated-checkout builds pass without source/configuration workarounds.
- Checks from a concurrently modified original checkout were excluded from
  these final results. Local result logs are in the enclosing workspace output/.

The operator must explicitly approve the next stage before any push/deployment,
domain or environment change. Live messaging configuration remains unremediated.
After approved deployment, query this route using an existing manager session
without opening queue dashboards, verify both deployed SHAs and safety results,
and verify aliases only under the approved release procedure. Removal of the
temporary route is a separate cleanup commit/deployment requiring review.
