# Bug status — 12 October 2026

Status is separated into code verification and deployed database verification. The deployed Preview still uses 8d4fe40; this follow-up is local until explicitly published. No Production database, migration, credentials, main branch, or production import script was changed.

| Reported issue | Status | Evidence / remaining work |
| --- | --- | --- |
| Workspace dropdown stays open | Fixed locally | Browser verifies outside pointer interaction, focus leaving the menu and navigation dismissal at four widths. |
| Dark / Light / System theme | Fixed locally | Stored preference, reload persistence and system preference changes verified in the browser. Theme palette covers staff, dialogs and existing guest surfaces. |
| Queue internal scrolling | Fixed locally | Bounded, keyboard-focusable scroll region; browser verifies overflowing content and actual scroll movement. |
| Simple Mode schema incompatibility | Migration corrected; deployment unresolved | Migration now includes request prerequisites; base and legacy schemas tested in in-memory PostgreSQL. Not applied to deployed Neon. Actual deployed schema/error code still needs inspection. |
| Waiter area requests | Code verified; deployment unresolved | Role authorization, area validation, duplicate handling and receptionist approval covered by isolated tests. Runtime database migrations must be verified. |
| Missing Waiter role | UI/API implemented; deployment unresolved | Waiter selection already exists; creation succeeds in the isolated repaired schema. No existing accounts are invented. Deployed role constraint still needs checking. |
| Misplaced Invalid account PIN errors | Not confirmed resolved | Errors are inside the dedicated PIN form, but the exact reported runtime case was not reproduced with deployed credentials. |
| Confirmation prompt when disabled | Fixed locally | Guest queue API includes confirmation_required; UI hides confirmation prompts/actions when false without changing stored confirmation. API and browser tests pass. |
| QR overlay background bleed | Fixed locally | Opaque full-viewport portal above navigation, checked at 320/390/768/1440 and visually inspected. |
| Phantom Requests badge | Stale-ID handling verified; report not reproduced live | IDs reconcile when requests disappear or duplicate. Pending table requests are independent of the guest queue, so an empty guest queue does not itself imply a zero request count. |
| Unable to load staff accounts | Fallback implemented; deployed error unresolved | Listing survives absent pin_hash; authentication and backend errors are tested. Other schema/connectivity/license causes have not been ruled out live. |
| Staff shifts schema incompatibility | Not fixed on deployed database | Existing staff repair migration is tested for time-column conversion, constraints and rollback. Production migrations were not applied. |
| Staff PINs unavailable | Not fixed on deployed database | Code reports missing support safely. PIN schema must be reviewed/applied to a verified isolated environment before runtime functionality can be checked. |

Validation: 67 regression, in-memory PostgreSQL and WhatsApp checks passed; complete browser suite passed at widths 320, 390, 768 and 1440. Local optimized build, TypeScript and lint passed. Actual component/CSS browser fixtures use synthetic APIs; this is not deployed authentication or database validation. Screenshots are in outputs/ui-bugs.
