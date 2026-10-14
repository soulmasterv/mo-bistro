# Automatic Preview WhatsApp diagnosis

The user reports the isolated Management test returned Meta HTTP 200 and delivery
`delivered`. This establishes that test's delivery, not automatic booking delivery.
No deployed environment or database was inspected during this change.

## Source-verified gates

- General delivery requires `WHATSAPP_ENABLED=true`, `MO_BISTRO_DB=postgres`,
  `WHATSAPP_MODE=live`, and `WHATSAPP_ALLOW_LIVE_SEND=true` together. The currently
  requested `test`/`false` controls intentionally prevent real automatic sending.
- The isolated test requires test mode with general live sending off. Its verified
  test-recipient inbound messages are intercepted before booking subscription
  processing. An arbitrary hello or a delivered test never grants booking consent.
- Staff-created walk-ins deliberately start with all customer permissions false.
  Staff cannot grant customer consent. A customer must send the booking-specific
  subscription command themselves for continuing updates.
- Confirmation needs its saved permission; Almost Ready needs subscription and a
  personal ETA (scheduled ten minutes before it); review needs subscription,
  separate feedback permission and a seating timestamp (due sixty minutes later).
- The normal outbox uses QStash. The isolated sender bypasses that scheduler, so
  its success cannot validate QStash credentials/callbacks or automatic scheduling.
- An open plain-text window needs verified inbound storage for the same recipient
  and business phone ID. Existing tables, consent and signature controls remain.

## Management feedback

Manager-authenticated Preview setup GET now includes only safe booleans describing
general sending gates. Check setup shows a pending state, a completed-check count
and a clear explanation that test delivery does not activate booking messages.
Failed setup requests disable the send button and retain visible feedback rather
than hiding the card. No new sending path, retry, dispatch or environment mutation
was added.

## Read-only Preview preflight

Run only after independently verifying the connection belongs to Preview
`mo_bistro_2`, using the deployed application's role. These checks expose no phone
numbers, association codes, tokens or message contents.

```sql
SELECT current_database(), current_schema(), current_user;
SELECT to_regclass('public.whatsapp_customer_windows') AS customer_windows,
       to_regclass('public.whatsapp_notifications') AS notifications,
       to_regclass('public.whatsapp_booking_consents') AS consents;
-- Run the following only when the tables above exist.
SELECT kind, status, last_error, count(*)
FROM public.whatsapp_notifications GROUP BY kind, status, last_error
ORDER BY kind, status, last_error;
SELECT count(*) FILTER (WHERE subscribed_at IS NOT NULL AND unsubscribed_at IS NULL)
         AS subscribed_bookings,
       count(*) FILTER (WHERE confirmation_consent) AS confirmation_permissions,
       count(*) FILTER (WHERE feedback_consent) AS review_permissions
FROM public.whatsapp_booking_consents;
```

The previously reported missing customer-window table has not been rechecked.
Use `docs/preview-window-migration-procedure.md` and its preflight/postflight SQL.
Apply the existing migration only if those checks establish it is missing and
separate approval is granted. A successful isolated test alone is not proof of
the customer-window schema or consent pipeline.

## Activation requires separate approval

No settings below were changed. No messages, migrations or remote SQL were run.

1. Complete the read-only schema/log review above and verify the active Preview
   deployment's database identity. Stop on schema conflicts.
2. Review pending/scheduled jobs before activation. Do not drain an old backlog or
   reset simulated/sent/sending/unknown jobs to retry. Test with a new synthetic
   booking and the owner's verified recipient only, after approval.
3. Follow `docs/whatsapp-customer-window.md` for the full existing configuration:
   same Meta business number, `WHATSAPP_WINDOW_TEXT_ENABLED=true`, configured
   server-only `WHATSAPP_TEST_RECIPIENT`, kind-specific text/approved templates,
   association secret, canonical Preview callback origin and QStash publishing
   token plus both callback signing keys.
4. To switch from isolated tests to automatic Preview delivery, explicitly disable
   `WHATSAPP_PREVIEW_TEST_ENABLED`, set `WHATSAPP_MODE=live` and
   `WHATSAPP_ALLOW_LIVE_SEND=true` **in Preview only**, with all other gates above
   ready. These changes require a new Preview deployment. The current isolated
   test control cannot send in live mode by design.
5. Only after approval, verify the personal recipient's incoming booking-specific
   subscribe message is recorded for the configured business number, and its
   consent/window are valid. Then exercise the existing events with that one
   synthetic booking. Do not test on real customers or Production.

Local handler/transport tests use mocks; they cannot certify deployed configuration,
schema compatibility, scheduler delivery or automatic provider delivery.
