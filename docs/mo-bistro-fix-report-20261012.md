# Mo Bistro fixes — 12 October 2026

Working branch: feature/mo-bistro-ui-rebuild. Base: 1e745c0b0c67ee526b1fd1ffeec0d30a1cd10666.
Local checkout: C:/Users/ASUS NEW/Projects/mo-bistro.

## Fixes and findings

- Requests badge now tracks unread pending IDs rather than accumulating a count. Snapshots deduplicate numeric IDs, remove completed requests, acknowledge visible requests, skip overlapping polling, abort superseded refreshes and ignore late responses. New request IDs chime once. Hidden tabs skip routine polling. Mutation events avoid refetching twice in their originating component.
- Staff users no longer require pin_hash just to list employees. Missing PIN schema produces an explicit warning and disables PIN saving. Auth, licensing and PostgreSQL requirements remain enforced. Database connection/authentication failures still return errors; safe SQLSTATE diagnostics never expose SQL or connection values. Account creation distinguishes duplicate usernames (409), incompatible schema (503) and other backend failures (500).
- Staff loading failure in a deployed database cannot be conclusively diagnosed here: no database URL exists. Direct pin_hash access is a verified compatibility defect in the original code when the PIN migration has not been applied.
- Area requests retain waiter/manager access, cross-origin and license checks, occupied-area verification and per-staff duplicate prevention. A unique partial area/staff index backs the application lock and conflict handling. Schema failures identify the repair migration. Fresh migration ordering is corrected: the area migration previously sorted before the table creation migration.
- Reception approval verifies current occupancy and matching area under the shared seating lock, preserves guest/history updates, cancels competing table-specific requests and returns the actual released table ID. Next-guest suggestions now read area override from seating_settings, matching the seating API.
- Reception Clear Table works in Detailed view and in Simple view through an occupied-table selector for each area. Successful clearing updates the local count immediately, refreshes other components and cancels pending requests for that table. The existing endpoint permits Manager, Reception and Waiter; that permission was preserved. Releasing an already free table returns a conflict.
- Guest tracking exposes the current confirmation requirement. Existing unconfirmed guests display Not required after disabling it. Actual handlers did not contain a confirmed-based action blocker; tests verify seating, queue actions and cancellation remain possible. Stored confirmations are not rewritten and the confirmation policy is not broadened.
- Visible Called/Uncalled badges, larger gold-bordered Requests control, clearer mobile scroll area, Mo Bistro QR branding and exact requested QR instruction. QR dialog traps keyboard focus, restores focus on close, supports Escape and disables copying before a URL exists.
- Staff time validation now accepts HH:MM values (including overnight shifts); the original regex required a literal backslash. Shift feedback appears in the affected day, and employee/shift fields cannot change during a save. Monday remains weekday 0, Sunday weekday 6. The existing migration permits overnight shifts.
- Existing backend self-disable protection, serialized last-active-Manager protection, disabled-account checks, reactivation and session revocation on disabling/PIN reset are covered by regression tests. UI also prevents self/last-Manager disable actions.

## Cleanup and optimization

The duplicate staff-creation form was removed; StaffAccountManager is the single form supporting all three roles. Removed its extra management request and the settings reload on staff creation that could overwrite unsaved settings. Removed unused imports, redundant seen-ID state and accumulating notification counters. Requests only fetch occupied table choices when an area request needs them. Queue and table polling no longer overlap or overwrite fresh mutation results. Full source lint errors were resolved with deferred initial loading and JSX escaping; no new runtime dependency was added.

## Branch maintenance

Inspected all remote heads and open PRs. Exactly three branches were present:

- main: retained, never modified or merged.
- feature/mo-bistro-ui-rebuild: retained; all work is local and unpushed.
- test/mo-bistro-eta-20261010: retained because local Git HTTPS authentication is unavailable. It is eligible for deletion based on inspected repository evidence: its tip 260b0294b3aab67b0ff75f1c14eebb73aab01d9a is an ancestor of the feature branch (zero unique commits), there are no open PRs, no Actions runs for this branch, no .github workflows, and no repository references to it. A SHA-guarded delete was attempted; it failed to authenticate. Connected GitHub reads work independently of local Git credentials. No external Vercel configuration was available to inspect.

No branch was deleted. No feature commits were pushed and no deployment was triggered.

## Validation

- PASS: TypeScript noEmit check, using node node_modules/typescript/bin/tsc --noEmit (equivalent to npx tsc --noEmit).
- PASS: local Next.js 16.4.0 build in MO_BISTRO_DB=postgres mode, using node node_modules/next/dist/bin/next build (the command behind npm run build). All 39 static-generation steps completed; protected pages remain dynamic. No database credentials were supplied.
- PASS: node --test tests/regressions.test.mjs — 26 tests. Added npm run test:regressions.
- PASS: node node_modules/eslint/bin/eslint.js src tests — no errors or warnings across application source and tests.
- PASS: git diff --check and staged diff checks.
- INITIAL FAILURE, RESOLVED FOR POSTGRES MODE: the first standalone TypeScript run lacked Next-generated LayoutProps; the build generated these types and subsequent checks passed.
- INITIAL FAILURE / SQLITE UNAVAILABLE: a default-mode build failed because better-sqlite3 native bindings were not installed. Dependencies were installed with lifecycle scripts disabled. The intended PostgreSQL-mode build passes; SQLite runtime remains unverified.
- NOT RUN: npm and npx executables are absent from this runtime; their underlying project executables were used as described above. Dependencies were aligned from the existing package-lock.json through a local pnpm import/install. The generated pnpm-lock.yaml is untracked and excluded from commits.
- UNAVAILABLE: live PostgreSQL integration, actual SQL constraints/migration execution, real session/login tests and concurrent transaction enforcement. Regression tests execute actual handlers with mocked SQL/auth/license boundaries; they verify control flow and emitted queries, not a live database.
- UNAVAILABLE: real Reception/Waiter browser sessions and mobile visual QA with authenticated data. UI markup tests verify both table views and QR semantics/copy; focus-trap interaction was inspected but not tested in a real browser.

## Migration requirements

Do not apply any migration to Production from this task. Before any database write, an administrator must independently verify the target is isolated.

- Existing installations with missing/partial request schema: review migrations/20261012_request_schema_repair.sql. It creates missing request prerequisites, permits area targets, preserves target checks, maintains per-table uniqueness and adds per-staff pending-area uniqueness.
- Review migrations/20261010_staff_pin_login.sql if pin_hash or waiter role support is missing.
- Review migrations/20261011_staff_shifts.sql if staff_shifts is missing. No schema change to that migration is required for the time-regex fix.
- New installations: apply 001_postgres_schema.sql first, then the feature migrations in documented order; the corrected area migration creates its own table prerequisites. Apply licensing schema as required by the existing installation workflow.
- The new unique area index intentionally fails if duplicate pending rows already exist. Inspect and resolve those rows manually after verified backup/target checks; this task deletes no data.
- Schema-dependent area requests stay unavailable until the repair migration is applied. Employee listing remains usable without PIN schema, but PIN operations remain unavailable with a visible warning.

## Outstanding issues and safety

Live deployed failures and database state need verification on an independently confirmed isolated environment. Missing migrations and duplicate legacy rows may require administrator action. Remote deletion needs Git authentication; pushing needs explicit approval because Vercel Preview may deploy. No Production database was read, written, reset or migrated. Production import script and tracked backup/diagnostic files were left untouched. Untracked pnpm lockfile is preserved.

## Modified/new files (32)

- migrations/20261010_area_table_requests.sql
- migrations/20261012_request_schema_repair.sql
- src/app/api/management/staff-pin/users/route.ts
- src/app/api/management/staff-shifts/route.ts
- src/app/api/management/staff/route.ts
- src/app/api/reception/next-guest/route.ts
- src/app/api/reception/table-requests/[id]/route.ts
- src/app/api/track/route.ts
- src/app/api/waiter/area-requests/route.ts
- src/app/api/waiter/tables/[id]/free/route.ts
- src/lib/database-errors.ts
- src/lib/seating-postgres.ts
- src/lib/seating-v3.ts
- src/lib/staff-auth.ts
- src/app/reception-dashboard.tsx
- src/app/status/page.tsx
- src/app/management/staff-pins/staff-pins-client.tsx
- src/components/reception-table-requests.tsx
- src/components/table-availability.tsx
- src/components/seat-guest-modal.tsx
- src/components/staff-account-manager.tsx
- src/components/staff-shift-scheduler.tsx
- src/lib/request-notifications.ts
- src/components/management-extras.tsx
- src/app/management/management-dashboard.tsx
- src/app/join/page.tsx
- src/app/runtime-test/page.tsx
- src/app/waiter/waiter-dashboard.tsx
- src/components/restaurant-wait-slider.tsx
- package.json
- tests/regressions.test.mjs
- docs/mo-bistro-fix-report-20261012.md
