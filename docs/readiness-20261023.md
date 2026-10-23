# Mo Bistro readiness — 23 October 2026

## Evidence and branches

Reviewed all three supplied prior QA reports: Reception operations (42 bookings,
31 staff / 11 public, 17 newly seated, peak queue 32), Guest journey (11 public
registrations), and Waiter floor observation (17/24 occupied, Simple view).
Their UTC run was approximately 15 minutes; it was not a two-hour test. Some
report headings use different dates; this continuation uses 23 October, Cairo.

Fresh fetch confirms Development at 020de5b, pilot/mo-bistro-shrunk at 3e8bcb9,
and Advanced feature/mo-bistro-ui-rebuild at be4e3ce. Work is local on
fix/pilot-readiness-20261023 and fix/advanced-readiness-20261023. No push occurred.

Vercel's current domain settings still assign development.mo-bistro.labbing.space
to pilot/mo-bistro-shrunk and preview.mo-bistro.labbing.space to the Advanced
feature branch. Both entries say No Deployment; this UI does not independently
prove the currently serving alias/commit. GitHub still reports successful Vercel
build 5qfCWEi3rM1kek7AjKnKxEmwHCQ2 for Development/020de5b. Ready/success is not
proof of the custom-domain cutover. The routing mismatch remains configured.

One live Pilot Reception page was loaded and closed; no operational controls were
used. Queue reads can process pending messaging work, so all subsequent workflow
tests used local fixtures or in-memory PGlite. Pending live message activity was
not audited. No live Advanced queue test was run.

## Pilot

The existing three fixes pass the rendered UI test: Reception starts at normal
padding, the scrollbar/document remain dark, and Closed bookings do not invite
queue following. Seven viewports plus route/theme checks pass (9 tests).
The 15 Pilot handler/polling tests cover public/staff creation, active duplicate
phones, queue and token status reads, cancellation/undo and closed outcomes,
seating, source attribution, polling backoff, and stubbed messaging transitions.
Expanded walk-in drafts survive fixture queue refreshes. No new Pilot application
bug was confirmed. Type generation, TypeScript, lint and production build pass.
See the Pilot branch's docs/pilot-readiness-20261023.md.

## Advanced findings and changes

| Finding | Result |
| --- | --- |
| P1: Reception 24 vs utility 0/0 | Both components already select the same configured Simple/Detailed API. Confirmed initial utility render falsely showed 0/0 and No tables yet before loading. Fixed; displayed model is now explicit. Synthetic 24-table Simple and one-table Detailed inventories stay independent. Persistent live disagreement after successful loading remains unverified. |
| P2: 45 vs 30 minute waits | Slider falsely initialized to 30 before loading or after failure. Fixed with pending/unavailable states, disabled saving, and retry. Saving also refreshes same-page wait displays immediately. All use /api/wait-estimate. The global wait is intentionally staff-managed, not queue-derived; per-booking ETA is a separate supported feature. |
| P2: empty queue on reload | Explicit loading and unavailable states replace zero counts and empty claims before first success. Search/filter misses have distinct copy. |
| P2: occupancy propagation | Existing Reception/Table availability polling is 5s, Waiter 3s; local events refresh Reception after seating/release. The prior untimed one-sample lag does not establish a persistence bug. Handler snapshots reconcile across roles after each release. No new real-time synchronization architecture added; live timing remains unmeasured. |
| P2: large parties | Seating API already excludes areas below party capacity and prevents assignments. Empty compatible-area results now explain the need for manager-arranged seating and absence of table combinations. Queue admission is unchanged; a supported multi-table workflow remains missing. |
| P2: guest clipping at 832px | Not reproduced with current source and compiled CSS. Status and menu bounds pass at 320, 390, 650, 832, 1024 and 1440px; screenshot reviewed at 832px. No speculative CSS rewrite. |
| P3: phone feedback | Invalid phone returns the existing specific Egyptian mobile format message instead of generic registration feedback. Validation remains server-side. |
| P3: seating preference | Private token-based tracking now includes and displays the selected preference for active and closed/seated bookings. Phone and staff notes remain excluded. |

## Detailed lifecycle and missing workflow distinctions

A manager enables Detailed under Management → Settings → Seating preferences →
Staff table view → Detailed — Individual tables. The endpoint is PATCH
/api/table-view-mode; changing modes is blocked while anonymous tables are
occupied or requests are pending. Named tables must be configured separately.
No live mode or inventory configuration was changed.

The new in-memory integration test performs three complete cycles through actual
handlers: public registration → Reception call → compatible named-table query →
assignment and seating → occupied snapshots → Waiter table-ready request →
Reception approval → released history timestamp and cleared assignment → free
snapshots for both roles → reuse by the next party. It tests undersized tables,
disallowed seating areas, repeated seating, occupied-table assignment, Waiter
direct-release denial, and repeated approval. Existing tests retain mode-switch
and anonymous/named-inventory isolation safeguards.

Waiter does not directly assign, seat or release: it requests readiness and
Reception approves. This is the existing authorization workflow. There is no
separate dining-completed booking status: release closes seating_history and
clears guests.table_id, retaining historical status='seated'. Multi-table seating
and a separate completed-booking lifecycle are product gaps, not fixes implemented
here. Concurrency is not certified by serial PGlite tests; no live multi-user run
or new two-hour simulation is claimed.

## Validation and reproduction

- Advanced handler suites: 64 pass, 0 fail, 0 skip (regressions, core stabilization,
  operations visibility, Postgres workflows, next guest, booking edits, and the
  new lifecycle/phone tests).
- Focused rendered browser suite: 12 pass, including delayed/failing loads,
  inventory separation, wait saving/retry, oversized-party explanation, and six
  guest viewport sizes. Existing browser workflow suite: 1 pass across five widths.
- TypeScript, ESLint and Next production build pass. The build required network
  access for existing Google Fonts. It also emitted a known Next.js 16.4.0 security
  advisory; the first online build stopped for the reminder and a retry passed.
  A dependency security upgrade is recommended before release and was not mixed
  into these QA changes. No dependency manifest/lockfile change is included.
- Older regression mocks were updated for loaded component state; the existing
  browser fixture was missing the staff-details response and now supplies it.
- Local result logs/screenshots live under workspace output/, outside the repo.

Run handler suites with node --test and the seven test filenames above. Run the
browser tests with MO_BISTRO_TEST_TOOLS pointing to a node_modules containing
esbuild and MO_BISTRO_TEST_PLAYWRIGHT to a Playwright package with Chromium.
Build first so .next/static/chunks contains compiled CSS. Optional
MO_BISTRO_UI_SCREENSHOTS selects the screenshot directory. All new browser requests
are restricted to the loopback fixture origin; handlers never load a real DB URL.

## Approval and release gates

Production was not queried or modified. No database/branch deletion, reset,
environment-variable change, domain edit, deployment or push was performed.
No live messaging controls were used. Retain ONE shared Testing database for
Pilot/Development and Advanced/Preview; no Development-only DB is proposed.

Required approvals: push the reviewed commits to the intended non-Production
branches; deploy those exact commits; correct ONLY the Development custom domain
from pilot/mo-bistro-shrunk to the approved Development deployment. Verify the
actual alias and privately attest the shared Testing runtime target and outbound
messaging safety before live regression. None of these approvals implies a reset,
database change, Production promotion, or WhatsApp sending authorization.
