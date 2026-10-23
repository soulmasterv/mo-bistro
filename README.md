# Mo Bistro

A single-restaurant waitlist and seating website: guest registration/tracking, Reception, Waiter, Management, Indoor/Outdoor inventory and optional WhatsApp notifications.

## Source and environments

Development is on `feature/mo-bistro-ui-rebuild`. Preview and Production require different databases and credentials. Never infer that a Vercel build applies SQL migrations. General WhatsApp defaults to disabled/simulation; do not change live-send flags while validating core workflows.

Latest plan reconciliation and verification: `docs/stabilization-readiness-20261013.md`. Missing Preview customer-window table procedure: `docs/preview-window-migration-procedure.md` (prepared only, separate approval required).

Migration-backed QA harness preparation and current test evidence: `docs/migration-backed-harness-readiness.md`.

## Local setup

Install dependencies from the lockfile with `npm ci`. Use `npm run dev` for the application, `npm run build` for compilation and TypeScript validation, and `npm run lint` for lint. See `.env.example` for variable names; do not commit `.env` files or real credentials.

The cloud feature set uses `MO_BISTRO_DB=postgres`, `MO_BISTRO_POSTGRES_URL` pointing to the selected isolated database, and `STAFF_SESSION_SECRET` of at least 32 characters.

PostgreSQL public endpoint rate limiting trusts Vercel's `x-vercel-forwarded-for` header. An arbitrary local/reverse-proxy setup cannot spoof an untrusted header as a replacement; missing trusted-edge evidence returns 503 on those endpoints. The Meta webhook does not use that IP limiter.

## Local SQLite native setup

Use the same supported Node runtime for dependency installation and build. If the package manager skipped native lifecycle scripts, `npm run check:sqlite` checks the installed addon without opening a database. `npm run setup:sqlite` explicitly repairs only the installed better-sqlite3 prebuilt dependency; it does not enable other lifecycle scripts, change app flags or create data. Review source-build requirements separately if an official prebuilt binary is unavailable. PostgreSQL deployment behavior is unchanged.

## Fresh database installation - operator review required

The following is the proposed schema sequence for an EMPTY, approved isolated database. This sequence has not been executed against Neon by this implementation. Check results with `docs/core-schema-preflight.sql`. Do not run every dated repair file automatically.

1. `migrations/001_postgres_schema.sql`
2. `migrations/002_licensing.sql`
3. `migrations/20261010_guest_manual_eta.sql`
4. `migrations/20261012_staff_schema_repair.sql` (PINs, waiter role, shifts)
5. `migrations/20261012_simple_inventory.sql` (named/area requests and anonymous inventory)
6. `migrations/20261013_core_support.sql` (QR permits, request limits and integration-independent seating time)

Provision the initial manager through a reviewed administrative procedure using the existing salted credential format. No default password/account is created by this guide.

Optional WhatsApp requires `20261012_whatsapp_notifications.sql`; this migration is NOT safely rerunnable when its tables already exist. Isolated Preview testing additionally uses `20261012_whatsapp_preview_test.sql`. Window-aware notifications use `20261013_whatsapp_customer_windows.sql`. Existing schema must be checked before any of these are executed.

## Existing database upgrades

Keep historical migrations intact. First inspect relation/column types, constraints, indexes, and migration history. The new core support migration adds missing objects and `guests.seated_at`; it does not fix incompatible existing definitions, rewrite consent, clean duplicates, reset credentials or invent historical seating times. Review any discrepancy separately. No migration was run during implementation.

The canonical confirmation key is `approval_required`. Existing `require_confirmation` is read only as a fallback when the canonical key is absent. When both conflict, Management's canonical value wins; the preflight query reports both values for operator review. Saved guest confirmation is not rewritten.

## Verification

- Mock-only checks: `node --test tests/core-stabilization.test.mjs tests/next-guest.test.mjs tests/regressions.test.mjs tests/whatsapp-customer-window.test.mjs tests/whatsapp-preview-test.test.mjs tests/whatsapp-webhook-failure.test.mjs tests/whatsapp-webhook-verification.test.mjs`.
- `tests/browser-workflows.test.mjs` renders actual components with synthetic APIs; this is not a deployed Preview/database test.
- Existing `tests/postgres-workflows.test.mjs` and `tests/whatsapp.test.mjs` use in-memory PGlite. They do not prove Neon connection/lock behavior.
- `tests/isolated-postgres-concurrency.test.mjs` is a distinct opt-in real PostgreSQL harness. Its database cases remain skipped without an explicitly approved dedicated target; pure safety-gate assertions still run. Use a secure config-file argument without environment changes, as documented in `docs/isolated-postgres-concurrency-plan.md`. Existing dedicated test URL/ack variables remain supported. Only an empty, verified `mo_bistro_qa_*` database is accepted; mo_bistro_2 and app URL matches are refused. It applies the six documented core migrations unchanged to public, then uses synthetic fixtures. It closes connections without dropping schemas/databases; a populated database cannot be reused. No actual PostgreSQL run occurred during harness preparation.

## Workflows and operational limitations

All guests shows waiting/called only; Seated has its own tab. Managers configure Simple anonymous Indoor/Outdoor inventory or Detailed named tables. Reception owns seating/release and readiness approval; waiter actions request approval. Mode changes require reconciled occupancy/requests.

Public and staff PostgreSQL creation share the capacity lock. Walk-ins remain staff-confirmed, receive a one-time private tracking-link/QR handoff, and start without WhatsApp permissions. Staff cannot set customer opt-ins. Guest subscriptions still require an actual verified incoming WhatsApp reply. A token lost after the creation response cannot be recovered from its database hash; do not expose a token through guest listing or public lookup.

ETA editing is inside guest details; restaurant-wide estimated wait remains separate. Next-guest suggestions are distinct across areas within one read-only snapshot but are advisory, not reservations. Shifts are planning information, not sign-in restrictions. Public lookup returns only whether an active registration exists for an exact Egyptian mobile number; it cannot recover private tracking access and still reveals limited presence information.

Demo generation and diagnostic pages are allowed only in explicit development/Preview environments. Production refuses them server-side. Operational pages retain the neutral palette.

## Service fallback

Keep the current operational record available while validating a release. On database/network failure, stop retrying uncertain seat/release actions blindly, switch to the agreed paper process, record times/actions, and reconcile occupancy before resuming the app. A service-night shadow test and device/load tests still require operational review.

## WhatsApp

Keep `WHATSAPP_MODE=test` and `WHATSAPP_ALLOW_LIVE_SEND=false` during stabilization. See `docs/whatsapp-customer-window.md`, `docs/whatsapp-preview-test.md` and `docs/whatsapp-notifications.md` for provider, consent, QStash and configuration requirements. Do not run the dispatcher, migration or live provider tests merely because the feature is built.

See `docs/stabilization-handoff.md` for delivered changes, unresolved validation and a safe Co-work task prompt.
