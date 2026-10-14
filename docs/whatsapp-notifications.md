# WhatsApp notifications: setup and safety

The feature is disabled by default. This change does not deploy, apply a Neon
migration, change Production data, or send any provider messages. PostgreSQL mode
is required; the SQLite fallback continues without WhatsApp.

## Customer permission

The guest join page records neither confirmation nor feedback permission. After
booking, the status page offers **Get WhatsApp updates**. The guest must send the
booking-specific message themselves; opening WhatsApp does not subscribe them.
Review permission is an independent, initially unchecked preference on that page
and permits one review request **only after** subscription. Existing recorded
permissions are preserved. The legacy confirmation event/API remains supported for
bookings with explicit confirmation consent; the simplified join UI does not
request that permission or queue that initial confirmation.

The approved confirmation template must have a quick-reply button named exactly
**Subscribe to Updates**. Its per-booking payload is a 30-day, secret-derived
association code. Booking creation, checkbox selection, the tracking-page GET,
and opening the `wa.me` link never subscribe the guest. Subscription activates only
after a signed Meta message with the matching booking code is received from the
booking's registered phone. Quick replies must also reference that booking's
actual confirmation message ID. The fallback tracking link prefills
`SUBSCRIBE <booking-id> <association-code>`; the customer must send it.

STOP / unsubscribe revokes all bookings for that sender and feedback permission,
invalidates pending jobs, and blocks subsequent sends. An explicit, newer valid
subscription message can re-enable the selected booking; feedback must be given
again. Messages older than a STOP are ignored for subscription. A subscribe reply
timestamp in the same second as STOP may conservatively be rejected: send again
afterwards. Tracking-page feedback changes record permission but never subscribe.

## Isolated database migration

First review and apply `migrations/20261012_whatsapp_notifications.sql` to a
**non-Production Neon branch** containing the existing schema and
`20261010_guest_manual_eta.sql`. No migration runs automatically in API routes.
The SQL adds:

* `guests.seated_at` (TIMESTAMPTZ; no historical timestamps guessed/backfilled).
* `whatsapp_booking_consents`: phone association, two permissions, consent
  text/version/time, hashed code/expiry and actual subscription/revocation.
* `whatsapp_contact_preferences`: sender-wide opt-out.
* `whatsapp_notifications`: unique booking/kind outbox, revision, due time,
  attempts, publication lease, QStash/Meta IDs and send state.
* `whatsapp_inbound_events`: deduplicated incoming-message decisions.
* `whatsapp_delivery_logs`: deduplicated send/delivery/error events.

Guest creation and consent/outbox insertion share a PostgreSQL transaction.
Seating stamps its authoritative timestamp and queues review in the seating
transaction. With the feature off, existing unmigrated installations keep working.
Enable only after migration; a missing migration while enabled fails the affected
transaction rather than recording a booking without its requested consent.
Database URLs use the existing `MO_BISTRO_DB=postgres` and
`MO_BISTRO_POSTGRES_URL`. **No new Production connection or import script is used.**

## Environment variables

| Variable | Purpose |
| --- | --- |
| `WHATSAPP_ENABLED` | `false` default; `true` enables consent storage/workflows in PostgreSQL mode |
| `WHATSAPP_MODE` | `test` default; test mode makes no Meta/QStash requests |
| `WHATSAPP_ALLOW_LIVE_SEND` | Second explicit gate, `false` default; `true` plus live mode required for provider requests |
| `WHATSAPP_ASSOCIATION_SECRET` | Random server-only secret, at least 32 characters; keep stable for active bookings |
| `WHATSAPP_CALLBACK_BASE_URL` | Canonical HTTPS origin of the selected preview/test deployment, not supplied by incoming Host |
| `WHATSAPP_BUSINESS_NUMBER` | Business phone in international digits without `+`, used in `wa.me` |
| `WHATSAPP_DISPATCH_SECRET` | Optional random bearer secret, at least 32 characters, for manual recovery/drain |
| `META_APP_SECRET` | Raw-body webhook HMAC verification secret |
| `META_WEBHOOK_VERIFY_TOKEN` | Secret GET verification challenge token |
| `META_WHATSAPP_ACCESS_TOKEN` | Server-only Meta system-user token with messaging permission |
| `META_WHATSAPP_PHONE_NUMBER_ID` | Receiving/sending Cloud API phone-number ID; incoming metadata must match |
| `META_GRAPH_API_VERSION` | Explicit supported Graph version, e.g. `vXX.0`; configure from Meta, no silent version fallback |
| `WHATSAPP_CONFIRMATION_TEMPLATE` | Approved utility confirmation template name |
| `WHATSAPP_ALMOST_READY_TEMPLATE` | Approved utility almost-ready template name |
| `WHATSAPP_REVIEW_TEMPLATE` | Approved feedback template name with category approved by Meta |
| `WHATSAPP_TEMPLATE_LANGUAGE` | Exact approved language code, defaults to `en` |
| `QSTASH_TOKEN` | QStash publisher token |
| `QSTASH_CURRENT_SIGNING_KEY`, `QSTASH_NEXT_SIGNING_KEY` | Callback JWT verification and key rotation |
| `QSTASH_URL` | Account's HTTPS Upstash endpoint, default `https://qstash.upstash.io` |

None is a `NEXT_PUBLIC` secret. The frontend reads only a boolean config flag and
booking-owned subscription state. No real tokens or numbers are stored in tests.

## Meta template approvals and webhook configuration

Approve the exact configured templates/languages before enabling live sends.
All bodies currently take two text parameters, in order: customer name, booking
ID. Do not change parameter ordering without updating the adapter and tests.

1. **Confirmation — UTILITY**: confirmation copy referencing the existing booking;
   quick-reply button index `0`, label **Subscribe to Updates**. Explain that
   further booking updates require this reply and STOP unsubscribes.
2. **Almost ready — UTILITY**: non-promotional booking update; table expected in
   approximately ten minutes. Include opt-out wording.
3. **Review request**: service-related feedback request, approved in the category
   Meta assigns. Include the restaurant review destination as an approved static
   URL button/body link and opt-out wording. Do not assert UTILITY approval before
   Meta grants it; separate feedback consent is mandatory.

Register `/api/whatsapp/webhook` with the verification token; subscribe to
`messages` for the configured WABA/phone. GET returns the challenge only for the
correct token. POST verifies `X-Hub-Signature-256` on the bounded raw request body
before parsing, writing, or subscribing; duplicate message IDs are transactional.
Meta delivery statuses log their provider IDs/statuses and reconcile uncertain
acceptance using `biz_opaque_callback_data`. Raw phone/message bodies, tracking
tokens and secrets are not written to delivery logs.

## Scheduling and recovery

Jobs contain an opaque notification UUID and revision, never a phone or token.
QStash schedules `/api/whatsapp/jobs` with an absolute `Upstash-Not-Before` and five
retries. The SDK verifies signature, body hash, expiry, key rotation and the
canonical callback URL. Stale revisions, duplicate callbacks and terminal jobs
are no-ops; current consent and booking status are checked at execution.

Create a **non-Production** QStash schedule to POST to `/api/whatsapp/dispatch`
every minute. Its signed callbacks drain stranded outbox publications. Do not
create this schedule or deploy it until an isolated test setup is authorized.
A manual POST with `Authorization: Bearer <WHATSAPP_DISPATCH_SECRET>` is also
supported. Unauthenticated callers are rejected. This recurring drain is required
for recovery if `after()` work fails or Vercel interrupts a request. QStash
publication has a bounded lease and revision-based deduplication; DB uniqueness
is the permanent deduplication boundary (QStash deduplication itself is time-limited).
Scheduled jobs still unclaimed five minutes after their due time are republished
with a new revision, allowing recovery after QStash exhausts transient DB retries.

* Confirmation: queued immediately in the successful booking transaction;
  publication starts after the response, delivery through QStash as soon as due.
* Almost ready: once per booking, based on reception's authoritative `eta_at`,
  scheduled at `eta_at - 10 minutes`. No ETA means no guessed message. Changes
  reschedule unsent jobs; clearing ETA/cancellation/seating suppresses them.
* Review: scheduled at **exactly `seated_at + 60 minutes`**, independently of
  table clearing. Requires actual subscription and separate feedback permission.
  Giving permission after seating uses the same original timestamp, not the
  permission-change time. Permission/subscription received after the original
  sixty-minute window does not create a new review message. No historical
  seated_at is invented.

The target timestamp is exact, but network/provider/platform delays and retries
mean receipt at the exact wall-clock second cannot be guaranteed. QStash's
second-resolution timestamp rounds up, never sends early. Overdue eligible jobs
may run late after recovery; an almost-ready job is skipped once ETA is past.

Two senders cannot claim the same job. Phone-level transaction advisory locks
order STOP and send decisions. Messages already accepted/in flight before STOP
cannot be recalled. Meta has no documented send idempotency key: network timeouts,
5xx, interrupted workers or uncertain success become **unknown**, with no blind
automatic resend. Signed status webhooks can reconcile them; otherwise inspect
provider logs manually. Explicit 429 rejections are retried (six attempts maximum);
other rejections become failed. This chooses avoiding duplicate customer messages
over automatic retries where acceptance is ambiguous.

Do not turn simulated jobs into live jobs; use a separate isolated DB for tests.
Keep retention/access policies for phone consent and audit tables appropriate to
the restaurant. Turning off the feature blocks callbacks and provider requests;
STOP remains processable in test mode while sending remains disabled.

## Validation

`npm run test:whatsapp` runs actual handlers/service SQL against embedded PGlite
PostgreSQL, with no Neon URL. Meta/QStash fetches are forbidden or locally mocked.
It checks migrations, atomic booking association, two-stage consent, sender/code/
context matching, expiry, STOP, repeated callbacks, ETA revisions, seating +60
minutes, delivery-time eligibility, template payloads, signature tampering/expiry/
rotation and safe defaults. `npm run test:regressions` checks existing workflows.
Embedded tests do not simulate independent PostgreSQL clients or real provider
delivery; test these on an isolated deployment with Meta test recipients before
approving any live rollout.

Implementation validation: 57 offline checks passed (26 existing regressions,
31 WhatsApp checks), targeted ESLint passed, and generated route types/TypeScript
passed. The local Next production build compiled and passed its type phase, but
prerendering the existing reception page was blocked by the missing native
better-sqlite3 binding after dependency lifecycle scripts were disabled. No full
build/deployment or live Neon/Meta/QStash validation is claimed.

Provider references:
* [Meta template quick replies](https://www.postman.com/meta/whatsapp-business-platform/request/lwtlz1k/send-message-template-interactive)
* [Meta webhook authenticity](https://whatsapp.github.io/WhatsApp-Nodejs-SDK/api-reference/webhooks/start/)
* [QStash signature verification](https://upstash.com/docs/qstash/howto/signature)
* [QStash scheduling/publishing](https://upstash.com/docs/qstash/api-reference/messages/publish-a-message)

Customer-facing opt-out wording (including approved Meta templates when managed in Meta):
"To unsubscribe at any time, reply UNSUBSCRIBE or STOP on WhatsApp."
Both commands are matched case-insensitively. Meta-hosted template text must be updated and approved in Meta separately; this repository cannot edit those approvals.
