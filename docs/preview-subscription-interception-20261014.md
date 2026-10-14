# Preview test-recipient subscription repair

Source cause: processMetaWebhook previously continued immediately when
recordPreviewInbound returned true for the configured isolated test recipient.
Consequently even a valid received SUBSCRIBE command, and text STOP/UNSUBSCRIBE,
never reached the existing consent transaction. A Meta-delivered outgoing test
cannot establish booking subscription. The reported deployed booking was not
queried directly, so its exact database state and webhook log are unverified.

The webhook still records verified test inbound evidence. Ordinary messages remain
isolated, but parsed subscription and text opt-out commands now reach the existing
checks. Signature verification, business phone matching, phone normalization,
booking ownership, code hash/expiry, active booking status, quick-reply context,
duplicate IDs, phone locks and opt-out ordering are unchanged. Generic hello text
never subscribes. Relevant consent events retain existing queue scheduling or
invalidation; the isolated webhook still never dispatches the outbox. Both normal
live-sending gates remain unchanged and disabled by default.

No new migration is required. Existing consent/inbound/notification and isolated
test schemas must be present, plus customer-window storage when that flag is on.
No remote database, deployed variables or messages were touched during repair.

After a Preview deployment containing this fix, the owner should send the current
booking's subscription command again from the booking's registered phone to the
configured Meta business number. Previous messages acknowledged before the fix
are not automatically replayed. Allow the existing five-second status refresh, or
refresh manually. If still unsubscribed, inspect the new webhook request's safe
error code/status and verify booking/phone/expiry in read-only diagnostics; never
manually grant consent or bypass the association checks.

Regression coverage executes the actual signed webhook and SQL against embedded
PGlite with synthetic records: hello remains unsubscribed, valid owned SUBSCRIBE
activates once, forged/expired/wrong-phone/wrong-business/unsigned commands cannot
activate, mixed-case opt-out revokes consent and skips pending jobs. Provider
network-call count and deferred outbox-dispatch count stay zero. This is offline
validation, not a deployed Meta-to-Neon delivery test or real concurrency test.

Validation: 147 offline tests passed (one optional browser invocation skipped in
that suite); TypeScript, repository-wide lint and the production build passed.
The separately executed local browser workflow also passed all five viewports.
