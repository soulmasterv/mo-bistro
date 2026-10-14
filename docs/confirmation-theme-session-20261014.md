# Custom confirmations, staff theme and session policy

Branch: `feature/mo-bistro-ui-rebuild`.

## Changes

- Shared accessible confirmation provider replaces active browser `confirm` calls for Reception cancel/no-show, guest waitlist cancellation, table removal, staff disable/reactivation, PIN changes and the isolated WhatsApp test.
- Dialogs focus Cancel first, trap keyboard focus, dismiss on Escape/backdrop and resolve to false on provider disposal. A second request cannot replace a pending confirmation. The underlying action only proceeds on explicit confirmation.
- Nested dialogs share scroll locks; only the top modal handles keyboard events. No native prompt is used if copying the QR registration link fails: the existing QR dialog contains a selectable read-only link and an inline explanation.
- Staff screens default to dark when no preference is saved. Explicit Light/Dark/System choices remain respected. Guest pages and the existing login palette remain light.
- Existing authentication already creates fixed 12-hour sessions in both SQLite and PostgreSQL. Server expiry checks and cookie expiry remain unchanged, with no session renewal on refresh.
- Staff headers now check the existing authenticated `/api/auth/me` endpoint once per visible minute and on return to the tab. A confirmed 401 redirects to sign-in; network errors and other server failures do not force logout. A suspended tab checks on return. No client clock is trusted as authentication evidence.

## Policy

Twelve hours is the retained shift-length policy, not an inactivity timeout. An unattended shared device should be signed out manually; indefinite authentication was not enabled. No new environment settings, database migrations or changes to existing session records are required.

## Boundaries

General WhatsApp sending remains disabled by its existing safeguards. Replacing the confirmation UI does not change recipient enforcement, rate limiting, consent, webhook verification or the isolated sender's no-retry behavior. Tests use a local fixture endpoint for positive test-sender confirmation; no Meta request is made.

The scan for native browser dialogs covers active `.ts`/`.tsx` source. Historical backup files are not executable application modules and were not edited.

## Verification

- Production build (including TypeScript) and ESLint passed.
- Offline regressions: 137 passed, zero failures, one browser-fixture skip.
- Browser fixture executed separately and passed at 320, 390, 768, 1024 and 1440 pixels. Light and dark custom dialog screenshots were inspected.
- Browser checks confirmed no mutation before confirmation; Cancel/Escape caused no guest mutation; explicit confirmation caused exactly one; the underlying guest sheet and scroll lock remained intact.
- Clipboard rejection stayed inside the QR dialog with a selectable link and inline status, without a native prompt.
- A synthetic isolated WhatsApp test sent zero fixture requests on cancellation and one on confirmation, with the button disabled afterward. This was a local fixture API, not Meta.
- A new browser context defaulted to dark. The session check ignored a synthetic 503 and redirected to sign-in on a synthetic 401. A unit check verified both session creators persist expiry exactly twelve hours from login.

No push, deployment, database operation, environment change or WhatsApp message performed for this change.
