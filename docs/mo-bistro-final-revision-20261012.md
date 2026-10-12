# Mo Bistro final UI and functionality revision — 12 October 2026

Repository: soulmasterv/mo-bistro. Working branch: feature/mo-bistro-ui-rebuild.
Revision base: 5c9351eebcdb70d853eca826558aa5b80e91432e.
All changes are committed locally; this revision is not pushed or deployed.

## Implemented

- Shared dark/gold workspace header, visible Manager-only Switch Workspace selector, Management/Reception/Waiter links, current-workspace indication, accessible native disclosure, Escape handling and shared sign-out. Server page/session checks remain the authority; Reception and Waiter do not receive management controls or permissions.
- Explicit device-width, initial-scale=1 viewport with safe-area support and no restriction on pinch zoom. Mobile text/select/textarea controls are 16px; login no longer auto-focuses and blurs the field before navigation. Responsive toolbar wrapping, 44px controls, Geist typography, compact cards and dark/gold workspace styling reduce overflow and visual clutter. Removed redundant Reception auth lookup, settings shortcut and duplicate logout.
- Polished Mo Bistro QR dialog preserving rotating QR retrieval, copying and exact instruction: Scan this QR code to join the waitlist. SVG has a title and quiet margin, scales within narrow screens, and the dialog has a labelled heading, focus containment, Escape and focus restoration. Fixed focusing the disabled Copy control during loading.
- Table readiness is now an in-flow section near the top of Reception rather than a floating bottom control. Waiter actions stay with the floor/table cards under a visible Table is ready heading. Success notices also remain in the document flow.
- Simple Mode uses independent anonymous indoor/outdoor inventory. Reception sees Table free for an area, without a table selector. Seating chooses an area, not a named table. Managers can configure area totals and a per-table party-size limit. Detailed Mode retains named-table seating and clearing.
- Generic freeing decrements only anonymous occupancy and records an audited release; it never selects an arbitrary restaurant_tables row or changes detailed seating_history. UUID operation IDs make uncertain retries safe, and all seating/release/mode/capacity mutations share the existing advisory lock. Bounds prevent negative occupancy, over-capacity seating and shrinking below occupied count.
- Mode changes are blocked while anonymous tables are occupied or requests are pending. Entering Simple Mode also requires named tables to be free. Existing installations already set to Simple with named occupancy receive an explicit warning and must reconcile in Detailed Mode. Existing requests retain their inventory mode. A request from another mode cannot be approved, but may be rejected to unblock reconciliation.
- Waiter area requests and Reception approval/rejection use anonymous inventory in Simple Mode and the existing named-table workflow in Detailed Mode. Duplicate-request prevention, authorization and licensing are retained.
- PostgreSQL /api/tables PATCH now uses PostgreSQL instead of falling through to SQLite. It validates the mode and occupancy under the shared lock. Removed duplicate GET query code.

## Staff database findings

The original staff PIN migration adds pin_hash and permits waiter roles; installations without it cannot use PIN assignment. Employee listing still shows the explicit PIN-schema warning rather than pretending PINs work.

The original shift migration declares TIME hours. Actual local PostgreSQL testing confirmed that its original to_char(TIME, ...) query can work through implicit casts; this is not established as the live failure. Legacy TEXT hour columns do fail that overload. The API now formats hours with LEFT(column::text,5), and the repair migration normalizes valid legacy hours to TIME and restores required columns, foreign-key, uniqueness, bounds and off-day constraints. Invalid/duplicate/orphan legacy data causes the repair transaction to fail and roll back, not delete or silently rewrite data.

No deployed database schema was available to inspect. This revision fixes supported schema compatibility in code and provides a tested administrator-applied repair; it does not claim that missing Production/Preview schema has already been installed.

## Security review

- Server roles gate workspace pages, seating, Manager account/capacity operations and request review. Client workspace choices do not elevate privileges.
- Waiters can request readiness but cannot bypass Reception approval by directly clearing a table or seating a guest. Reception/Managers retain clear/seat permissions.
- Staff mutations and both PostgreSQL login flows share same-origin/protocol checks; cross-site Fetch Metadata is rejected even when Origin is absent. Existing account lockout, license checks, cookie security and session revocation remain intact.
- Seating accepts exactly one target: area or named table. Invalid/mixed targets are rejected.
- Expected workflow conflicts have a dedicated error type. PostgreSQL infrastructure failures stay generic and use safe SQLSTATE/migration guidance; connection strings, queries and parameters are not returned.
- Stored credential hashes must match the exact salted-scrypt format before verification.
- Existing self-disable and last-active-Manager protections and PIN-reset session revocation remain covered by tests.
- Production dependency audit: zero known advisories (165 production/optional dependencies reported). This is not a guarantee against unknown vulnerabilities or a full penetration test.

## Validation results

PASS: TypeScript noEmit, local Next.js 16.4.0 PostgreSQL-mode build (40 static-generation steps), lint across src/tests, git diff --check and staged checks.

PASS: 33 regression/database/security tests (26 existing regressions plus 7 new tests). The new tests execute real PostgreSQL SQL in a newly created in-memory PGlite instance with no database URL. They cover fresh/idempotent migrations, legacy text-hour conversion, schema rollback on invalid rows, account/PIN behavior, anonymous seat/free, audit rollback, retry safety, area requests, approval/rejection, mode guards, named-record preservation, role gates and request security.

PASS: one browser suite covering 320px, 390px and 1440px widths. It uses actual React components and compiled application CSS with a loopback fixture API. It checks login sizing, fully loaded Manager forms, workspace switching, non-Manager selector absence, horizontal overflow, readiness placement, QR rendering/focus/Escape, named clearing, anonymous Table free and the complete Waiter request-to-Reception approval flow.

Browsers use fixture APIs; this is not live authentication or a deployed Vercel/Neon integration test. PGlite is a single local PostgreSQL instance, not a multi-connection Neon concurrency test. Physical iOS Safari focus zoom remains untested; the 16px safeguard and unrestricted viewport are verified in Chromium mobile emulation.

No live Neon, Production or Preview database was connected, queried or migrated. SQLite anonymous inventory is intentionally unsupported (503); this feature targets the project's PostgreSQL stack. Dependency/runtime packages for validation were installed only in a temporary folder, not added to application dependencies.

Commands run through project executables because npm/npx are absent from this host:

- node node_modules/typescript/bin/tsc --noEmit
- node node_modules/next/dist/bin/next build (MO_BISTRO_DB=postgres; no DB credentials)
- node node_modules/eslint/bin/eslint.js src tests
- node --test tests/regressions.test.mjs tests/postgres-workflows.test.mjs
- node --test tests/browser-workflows.test.mjs
- pnpm audit --prod --json

Added npm scripts test:postgres and test:browser; test:regressions remains. Set MO_BISTRO_TEST_PGLITE to a separately installed PGlite package directory; set MO_BISTRO_TEST_TOOLS to temporary node_modules containing esbuild and MO_BISTRO_TEST_PLAYWRIGHT to a Playwright package directory. Optional suites explicitly skip environment-dependent tests if those paths are absent. Browser checks require a local build and an installed Chromium browser.

Browser evidence: C:/Users/ASUSNE~1/AppData/Local/Temp/mo-bistro-browser-Plbhvr/reception-mobile.png and qr-mobile.png. Images were visually inspected.

## Required migration review before any deployment

Do not run these against Production without separate explicit approval. Preview isolation must be independently verified before applying to Preview. No automatic migrations run from API requests.

1. Ensure the existing base schema and request schema/area support are installed. For a partial request installation, review 20261012_request_schema_repair.sql from the preceding revision.
2. Review/apply migrations/20261012_staff_schema_repair.sql if PIN/shift schema is missing or contains supported legacy hour columns. It supersedes the missing pieces of 20261010_staff_pin_login.sql and 20261011_staff_shifts.sql. It requires staff_users from the base schema. Take a verified backup and inspect invalid/duplicate shift rows; repair refuses invalid data.
3. Review/apply migrations/20261012_simple_inventory.sql after the request/area prerequisites. It creates simple_table_capacity, simple_table_events and inventory_mode metadata on requests. It seeds anonymous totals from current named table counts and a conservative minimum seat limit, leaving named tables, guests and detailed history unchanged. Review and configure these separate capacities before enabling Simple Mode.
4. Reconcile existing named occupancy in Detailed Mode and review/reject legacy pending requests before switching to Simple Mode. No named occupancy is automatically imported into anonymous counts or anonymously cleared.

The new Simple Mode and inventory-mode controls depend on the new migration. Deploying code without it will produce explicit schema errors for those operations. Validate migrations and smoke tests in a verified isolated environment before publishing this revision. Remote environment isolation remains unverified.

## Git and safety

All work remains on feature/mo-bistro-ui-rebuild. Original local commits from the earlier GitHub publication were preserved at refs/archive/mo-bistro-local-before-github-publication before aligning this checkout with the identical published file tree. No changes to main, no merge into main, no remote branch deletion, no push and no Production deployment occurred during this revision.

scripts/import-production-guests.mjs was not executed, modified, staged or deleted. Tracked backup files are unchanged. The existing untracked pnpm-lock.yaml is preserved and excluded from commits.

## Modified/new files (45)

- docs/mo-bistro-final-revision-20261012.md
- migrations/20261012_simple_inventory.sql
- migrations/20261012_staff_schema_repair.sql
- package.json
- src/app/api/auth/pin-login/route.ts
- src/app/api/management/staff-pin/route.ts
- src/app/api/management/staff-shifts/route.ts
- src/app/api/reception/table-requests/[id]/route.ts
- src/app/api/reception/table-requests/route.ts
- src/app/api/seating/route.ts
- src/app/api/simple-tables/route.ts
- src/app/api/table-view-mode/route.ts
- src/app/api/tables/route.ts
- src/app/api/waiter/area-requests/route.ts
- src/app/api/waiter/table-requests/route.ts
- src/app/api/waiter/tables/[id]/free/route.ts
- src/app/api/waiter/tables/[id]/request-ready/route.ts
- src/app/globals.css
- src/app/layout.tsx
- src/app/login/page.tsx
- src/app/management/management-dashboard.tsx
- src/app/management/page.tsx
- src/app/management/staff-pins/page.tsx
- src/app/management/staff-pins/staff-pins-client.tsx
- src/app/manager/page.tsx
- src/app/page.tsx
- src/app/reception-dashboard.tsx
- src/app/waiter/page.tsx
- src/app/waiter/waiter-dashboard.tsx
- src/components/reception-table-requests.tsx
- src/components/seat-guest-modal.tsx
- src/components/seating-settings.tsx
- src/components/simple-capacity-settings.tsx
- src/components/table-availability.tsx
- src/components/workspace-header.tsx
- src/lib/guest-api-security.ts
- src/lib/login-postgres.ts
- src/lib/seating-postgres.ts
- src/lib/simple-table-postgres.ts
- src/lib/staff-auth-utils.ts
- src/lib/workflow-error.ts
- tests/browser-workflows.test.mjs
- tests/handler-harness.mjs
- tests/postgres-workflows.test.mjs
- tests/regressions.test.mjs
