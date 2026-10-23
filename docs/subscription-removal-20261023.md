# Advanced: subscription licensing removal — 23 October 2026

Base commit: `88bcd1c59e978a4a5b3c963944a7b1385108d716`. Working branch: `refactor/advanced-remove-subscription-licensing-20261023`.

## Inventory and classification

The pre-edit tracked-file inventory is in [subscription-removal-inventory.txt](subscription-removal-inventory.txt), with original file/line references. Dependency lockfile license metadata is excluded because it describes third-party software licenses, not restaurant subscription enforcement. The Pilot inventory was captured in the matching 020de5b code snapshot; d71afd9 adds only a readiness document. Generated artifacts, installed dependencies, secrets, and synced sources are excluded.

| Reference group | Decision |
| --- | --- |
| /api/license/status; /api/license/admin/[action] | Delete the routes, including status, inspection, audit and license mutations. |
| src/lib/licensing | Delete database client, owner key authentication, status/version logic and requireActiveLicense. Owner key auth was exclusive to license administration; staff auth is independent. |
| Operational API license calls | Remove only imports and license checks from guest creation/editing, join, estimates, seating, tables, waiter/reception requests, management, cleanup, staff accounts/PINs/shifts, and Advanced tables/overrides. |
| StaffLicenseGuard; workspace-header; globals.css | Remove subscription polling, suspension/expiry/grace dialogs, banner, countdown and exclusive styles. Retain session-expiry polling and logout. |
| integrations/subscription-control | Delete the entire tracked standalone control service, client and UI. Its exclusive dependencies were dotenv, express, express-rate-limit, helmet and jose. The restaurant package and lockfile need no dependency changes. |
| .env.example; README | Remove obsolete licensing example keys and setup requirements. No actual environment file or variable changed. |
| Licensing tests and mocks | Replace obsolete enforcement coverage with no-license operation and retained auth/origin/role coverage. Remove control-service and blocking-license UI tests. |
| Staff authentication and middleware/proxy | Preserve sessions, credentials/PINs, role checks, origin checks, rate limits, Pilot path allowlist and Production guards. No proxy licensing check existed. |
| WhatsApp subscription API/UI, subscriptionState, booking consents, SUBSCRIBE/STOP, opt-out/expiry | Preserve as restaurant notification consent, not paid subscription licensing. Live-send and Preview-test guards remain unchanged. |
| Historical license migrations and reports | Preserve as historical records; no migration run, destructive SQL, schema cleanup or database connection. Legacy license tables may remain unused. |

## Verification

Shared handler/operations/booking-edit/removal suites: 45 passed per variant.
PostgreSQL in-memory workflows and WhatsApp suites: 97 passed per variant.
Advanced/core/lifecycle/next-guest/SQLite suites: 34 passed.
These use mocks and disposable in-memory PGlite, not application database endpoints. No real provider sends were performed.
TypeScript checked after regenerating stale local Next route types for removed APIs. No build/deployment or authenticated live smoke test was performed.

## Scope requiring clarification

The retained /api/whatsapp/subscription route and WhatsappSubscription UI are guest booking-notification permission flows. Removing that feature entirely requires clarification because it affects restaurant notifications. It must not be implemented by dropping consent checks while leaving sending active. Historic migrations are intentionally retained; any later schema or hosted subscription-control service cleanup is separate work.

## Safety and existing work

No push, remote branch creation, deployment, routing, actual environment, database or Production changes. Existing release-safety files are excluded from this change and commit. This report supersedes older documents that prescribe active subscription licensing.
