# Booking acknowledgement after WhatsApp subscription

The booking status page now opens WhatsApp with:

```text
I'd like to receive updates about booking 87.
Code: abcd-1234
```

The code is generated per booking from its existing secret subscription token. The webhook requires the Meta signature, matching business number, booking phone, unexpired association and matching short code. Five invalid short-code attempts for a phone/booking within one hour block further short-code attempts during that window. Existing full-code messages remain supported. The new friendly subscription preserves the currently disclosed bundled review choice; old commands preserve legacy review choices.

On the first valid subscription while the booking is waiting/called, the existing confirmation outbox entry is queued with confirmation permission. Repeated webhook delivery or repeated subscription messages do not create another acknowledgement or rearm completed/uncertain sends. A legacy booking that already received its initial confirmation does not receive a second confirmation. STOP before delivery suppresses the pending acknowledgement. No schema migration is introduced.

With a verified open customer window and window text enabled, the subscribed confirmation uses this default text without needing a new text environment variable:

> Thanks for booking with Mo Bistro, {name}! Your booking #{booking_id} is on our waitlist. You're subscribed to WhatsApp updates. We'll let you know when your table is nearly ready.

The normal STOP/UNSUBSCRIBE instructions are appended. It does not ask subscribed guests to subscribe again. Existing template rules apply outside the open window; no unapproved template is created automatically. [WhatsApp policy](https://business.whatsapp.com/policy/preview?lang=en_US) permits free-form replies within the customer-service window and requires approved templates outside it.

## Preview activation prerequisites — not applied

The inspected Preview configuration uses `WHATSAPP_MODE=test` and `WHATSAPP_ALLOW_LIVE_SEND=false`; it does not send automatic customer messages. After deploying the fix, a separately approved controlled delivery test requires:

- `WHATSAPP_ENABLED=true`
- `WHATSAPP_MODE=live`
- `WHATSAPP_ALLOW_LIVE_SEND=true`
- `WHATSAPP_WINDOW_TEXT_ENABLED=true`
- The existing `WHATSAPP_TEST_RECIPIENT` must equal the booking phone. The Preview recipient restriction stays enabled.
- Working existing Meta credentials and the signed webhook callback on the updated Preview deployment.
- Working QStash token/signing keys and the existing canonical Preview callback URL, because the outbox publishes delivery jobs. `WHATSAPP_PREVIEW_TEST_ENABLED` no longer activates the separate test UI when normal live mode is enabled.

Changing the live flags applies to existing eligible jobs too, not exclusively this acknowledgement. Inspect pending/scheduled jobs before activation; never automatically rearm simulated, sent or unknown jobs. Development shares the Preview variables/database, and its subscriptions are received by the canonical Preview webhook, so both deployments must contain the compatible parser. Keep Production unchanged.

## Validation on 16 October 2026

- Full offline test run: 168 passed, 4 opt-in tests skipped, 0 failed.
- Focused WhatsApp suites: 53 passed, including friendly code ownership/expiry/throttling, duplicate acknowledgement suppression, STOP and mocked text delivery.
- TypeScript: passed.
- Lint for changed WhatsApp source and tests: passed.
- Webpack production build: passed after retrying outside the filesystem sandbox following a Windows EPERM in generated `.next` files. This is `next build --webpack`, not a claim that the default Turbopack build passed.
- No real Meta or QStash request was made by these tests. No remote database migration/write or live delivery test was performed. Provider responses in sender tests were mocked.

## Scheduler follow-up

After controlled Preview activation, real booking 88 successfully subscribed and queued its acknowledgement, but publication stopped at `pending`, attempts 0, `publish_failed`, without a scheduler or provider message ID. This establishes subscription/queueing only, not delivery.

The publisher now uses the destination URL directly after `/v2/publish/`, matching [Upstash's documentation](https://upstash.com/docs/qstash/howto/publishing) and the installed SDK. It previously encoded the complete destination, including the protocol/slashes. It rejects unexpected scheduler hosts, embedded credentials, query strings and redirects before forwarding the scheduler token.

Publication failures retain only bounded operational codes for missing token, invalid callback/service URL, HTTP rejection, network failure or invalid response. Provider response bodies and credential values are never logged or stored. Management maps common codes to actionable messages; unknown exceptions remain the generic `publish_failed`. An unsuccessful publication leaves the existing job pending with the same deduplication ID and no Meta attempt. Completed/uncertain sends are not rearmed.

Follow-up offline regression result: 173 passed, 4 opt-in skipped. Focused publisher/WhatsApp/operations tests: 49 passed, using mocked provider requests. Webpack production build passed. Real publication and Meta delivery must still be checked for booking 88 after deployment; do not call this a confirmed provider fix solely from offline results.
