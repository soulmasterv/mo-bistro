# Local release candidate — 23 October 2026

This candidate integrates the readiness fixes, restaurant licensing removal and
temporary release-safety diagnostic. Earlier diagnostic notes excluding licensing
removal describe its original implementation, not this combined candidate.
No deployment, ENV edit, routing change, live database query or message is part of
this preparation. Pilot and Advanced remain separate release branches.

## Reviewed diagnostic role policy

The diagnostic alone now requires `RELEASE_SAFETY_EXPECTED_DB_ROLE`. It has no
default and is not inferred from Neon role existence, database ownership or old
documentation. No intended live role has been established by this local work.
The operator must reconcile the actual private deployment connection username
with the approved application role before separately authorizing this setting.
An unset setting leaves the diagnostic hidden before cookies or any connection.
No Vercel setting has been created or modified.

The explicitly approved role must be a canonical lowercase PostgreSQL identifier
of at most 63 characters, and cannot be postgres, neondb_owner, neon_superuser or
a pg_* role. The decoded connection URL username must match exactly before
connecting. Unexpected URL options (including role/search-path/host overrides)
remain rejected. Host, database and port remain restricted to the approved
Testing endpoint/database; TLS hostname verification and bounded read-only SQL
remain enforced.

After manager authentication, the dedicated connection queries `current_user`,
`session_user` and `pg_catalog.pg_roles`. Both identities must equal the configured
and approved role. Direct SUPERUSER, CREATEDB, CREATEROLE, REPLICATION or BYPASSRLS
flags must all be false. Membership in roles carrying those flags, or in
neon_superuser, is rejected using pg_has_role(..., 'MEMBER'), including indirect
membership. Missing/unknown role results fail closed. No SET ROLE is executed.
The response exposes only role-match/privilege-check booleans, not role names,
credentials, connection URLs, session tokens or raw database errors.

This policy establishes role identity and rejects administrative roles; it does
not prove least privilege for every table, schema, function or external service.
Object grants and role approval still require private operator review. Neon
endpoint-to-branch mapping is independent control-plane evidence, not inferred
from a database name or fabricated by the runtime JSON. The diagnostic checks a
dedicated connection, not an old initialized pool or another deployment.

SQL remains transaction-read-only with statement/lock/connection/deadline limits.
No application pool, migrations, cleanup, dispatchers or senders are loaded.
No new public page or unauthenticated diagnostics are added. It remains GET-only,
Preview-only and manager-only, with sanitized failures and no-store responses.

## Messaging preservation

All WhatsApp API and library files are unchanged from the corresponding reviewed
readiness tip. Consent/subscriptions, STOP and opt-out handling, webhook signature
verification, normal live-send gates, the separate manual Preview test gate,
pending-job guards and the separate Pilot sender remain intact. Licensing removal
removes restaurant subscription enforcement only; it does not remove WhatsApp
customer subscriptions or staff authentication/authorization.

No operational queue endpoint should be used as a diagnostic. Pilot queue GETs
can process pending work, and older deployments do not inherit newly saved ENV.
The four sends-off controls must be attested on each future immutable deployment.

## Dependency security patch

Pinned next and eslint-config-next are updated together from 16.4.0 to 16.4.1,
with package-lock.json updated. Only the corresponding Next packages/SWC binaries
change locked versions; no unrelated version refresh is included. Install-time
lifecycle scripts were disabled. The lockfile already contains sharp 0.35.5.

Official October 14 advisory identifies 16.4.1 as the fixed version for
GHSA-673q-mjm6-r5xr (critical use-cache RCE), GHSA-2464-fhr4-w9xw (critical image
optimization RCE), and GHSA-p3m5-59mp-jv5r (high Server Actions DoS):
https://nextjs.org/blog/nextjs-security-update-october-14-2026

The production dependency advisory feed confirmed all three against the original
16.4.0 lock. The security build exit was preserved, not suppressed. Source scans
found no use-cache/Server Action/next-image/next-og usage in the searched app,
but this is not a reason to retain an affected framework version.

## Local validation scope and build environment

The comprehensive local suite uses mock transports, local fixtures and in-memory
PGlite. An isolated external PostgreSQL concurrency test intentionally remains
skipped with its connection/approval variables unset. The role suite tests
preconnection rejection, switched/mismatched identities, administrative flags,
and real isolated SQL evaluation of role membership and session identity.

UI tests discover production CSS beneath .next/static recursively, supporting
both official compilers and rejecting absent CSS. This corrects the prior
Turbopack-only test fixture lookup; no styling or assertions are disabled.

Build investigation found stale generated-cache permission errors, restricted
Google Fonts network access, and a Windows Turbopack child-worker startup failure.
Generated caches were moved to the enclosing workspace output folder after
absolute path checks; no database or application data was deleted. The supported
webpack production compiler provides an independent full build with TypeScript,
static generation and security checks enabled. No fake font, disabled TLS,
suppressed advisory or source-error bypass is used. Final command outcomes and
exact commits are recorded in the enclosing workspace validation report.

Final results: Advanced has 201 passing non-browser tests, plus the passing
full-platform browser fixture and 12 readiness/browser tests. Pilot has 204
passing non-browser tests plus 9 Pilot UI tests. Each has 13 passing diagnostic
tests, included in those totals. TypeScript, ESLint and Next.js 16.4.1 webpack
production builds pass on both. npm audit for both production and all locked
dependencies reports zero advisories; both candidates have identical lockfiles.
The bundled static scanner completed for both; reviewed leads are synthetic test
secrets, false raw-HTML matches, intended public routes, authorization wrappers,
offline native-build tooling and server-side PostgreSQL rather than a public
PostgREST database. Its missing-lockfile heuristic is incorrect: package-lock.json
is tracked. No full live penetration test is claimed.

The inherited full-platform UI fixture is explicitly inapplicable on Pilot: it
renders Management/Waiter/Detailed controls Pilot does not expose and asserts the
old green theme. Its initial attempted run exposed that fixture mismatch; no
application color was changed to satisfy it. Pilot's dedicated 9-test fixture
passes against its actual UI. Advanced continues running the full-platform
fixture. External PostgreSQL concurrency remains deliberately skipped. Earlier
restricted worker/network failures are recorded, not counted as passing builds.
The ordinary Turbopack build script remains unchanged; the final local production
builds explicitly use the supported --webpack mode. Linux/Vercel builds and live
runtime identities remain untested pending separate approval.

## Release boundary

No push or deployment is authorized. Before a later release: approve exact SHAs,
confirm the actual intended role privately, separately approve any diagnostic
Preview setting, verify endpoint/branch identity and sends-off runtime policies,
inventory old callbacks/deployments, and stage on immutable protected URLs before
public alias changes. A push to a branch-bound domain can itself deploy/update
the public alias. Production, existing provider credentials and database contents
remain outside scope. Never test a sender or drain jobs to verify sends-off.
