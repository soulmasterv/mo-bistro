# Advanced Preview WhatsApp wording and sending rules

Applies only to PostgreSQL deployments with `VERCEL_ENV=preview` on the separate Advanced branch. No pilot source, pilot tables, Development deployment, inbound/STOP webhook source or Production sending policy changes. No schema migration or environment change is needed for this patch; manual sending requires the existing ETA migration (`20261015_whatsapp_eta_updates.sql`).

Every new Preview message begins `Hi {first name},` or `Hi there,`. Names are normalized, URLs/email addresses, controls, emoji and message markup are removed, and the first word is capped at 24 Unicode code points. Stored guest names are unchanged; Arabic letters and combining marks are retained. The message footer is removed; unsubscribe instructions remain on the guest subscription screen and STOP handling is unchanged.

| Event | Copy / behavior |
| --- | --- |
| Acknowledgement | Thanks for joining Mo Bistro's waitlist! Your booking: #98. Estimated wait: about 20-30 min (an estimate). We'll message you when your table is ready. |
| Insufficient history | The acknowledgement omits the estimate. Existing `ADV_WA_WAIT_ESTIMATE` remains default OFF; exact-size/preference cohort and minimum 10 samples are unchanged. Estimate snapshots and acceptance logging remain intact. |
| Timer reminder | A quick update on booking #98: you're still in the queue. Thanks for waiting. We'll let you know when your table is ready. |
| First in queue | Booking #98 is next in the queue. Please stay nearby. Reception will confirm when your table is ready. |
| Staff ETA change | An update on booking #98: your table is now expected in about 15 minutes (an estimate). We'll confirm when it's ready. Staff enter minutes; remaining minutes are rounded up at send time, rather than sending a clock time. |
| Nearly ready | Your table for booking #98 is expected in about 10 minutes (an estimate). Please stay nearby and wait for our confirmation. **Manual only.** The Reception drawer has a button which confirms the staff estimate, saves ten minutes and queues one immutable job. Repeated requests cannot duplicate or change that job's snapshot. Automatic scheduling is disabled, and pre-existing automatic callbacks log `manual_only`. If delivery is delayed until fewer than eight minutes remain, log `manual_estimate_stale` rather than send an outdated ten-minute estimate. |
| Review | Thanks for visiting Mo Bistro! If you have a moment, we'd love your feedback. Our review page is coming soon. Interactive reply button: **Leave a review**, ID `review_placeholder`. No URL or review submission; this is the existing ignored placeholder reply, as requested. |
| Table ready preset | Your table is ready! Please come to reception and mention booking #98. Wording is saved for the proposed manual preset picker; this patch does not add a table-ready trigger or change the Open WhatsApp button. No hold-time promise. |

The existing configurable cap (`ADV_WA_PRE_NOTIFY_MAX_MESSAGES`, default 3) counts acknowledgement, timer/next reminders and staff ETA/nearly-ready updates together. No staff-message exemption is added. Accepted, in-flight and uncertain sends consume the cap. Reminder jobs already sent are still counted if `ADV_WA_REMINDERS` is later OFF. Reviews are a separate purpose and are excluded from this waitlist-update cap. Manual nearly-ready additionally has one job per booking, and manual/duplicate staff requests are recorded in delivery logs.

Every Preview text or interactive message requires a subscribed guest, applicable consent, no latest STOP/unsubscribe and a verified open 24-hour window for this business number. Closed windows log `customer_window_closed` and skip; Preview does not fall back to a template. The configured Preview test-recipient restriction and explicit live-send permission are unchanged. Provider acceptance is not proof of delivery.

Reviews retain the existing one-per-booking job and 60-minute-after-seating schedule. Delivery rechecks `feedback_consent`, subscription, actual `seated` status and `seated_at`; cancelled and no-show parties cannot receive it. Join now discloses the available WhatsApp waitlist updates and one review request after seating. The subscription screen already explains both purposes before the received opt-in message. Existing saved feedback choices are not rewritten.

Language remains English for Preview; Arabic guest names are supported. Language selection and the optional private status link are deferred. Status links require the original private token, which cannot be reconstructed from the stored hash; no raw status token is added to storage or logs here.

Checks: `node --test tests/advanced-message-policy.test.mjs tests/advanced-preview.test.mjs tests/whatsapp*.test.mjs`. Includes real SQL on in-memory PostgreSQL with mocked providers: manual request idempotency, stale estimates, cap with reminders OFF, STOP between scheduling/sending, review eligibility/duplicate callbacks, closed windows even with templates configured, Arabic/long/missing/link/emoji names and no added unsubscribe footer. Hosted real-phone acceptance remains outstanding; automated tests send no actual messages.

Interactive reply buttons use the separate interactive payload, rather than a button embedded in plain text. Reference: [Meta's interactive reply-button example](https://whatsapp.github.io/WhatsApp-Nodejs-SDK/api-reference/messages/interactive/).
