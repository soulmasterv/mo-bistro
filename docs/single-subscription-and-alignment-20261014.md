# Post-booking WhatsApp opt-in and queue alignment

The join form no longer offers the combined confirmation/review checkbox. Its
booking payload explicitly sets both optional permissions false. After booking,
the existing token-owned status page offers Get WhatsApp updates, which opens the
existing booking-specific WhatsApp link. The guest must send the message and the
existing signed-webhook checks must accept it before subscription activates.
Review consent stays independently editable where relevant; changing it never
subscribes a guest. Existing customer permissions and notification templates are
preserved. No sending gate, deployed variable or database was changed.

Desktop queue headings and the scrollable list now reserve the same scrollbar
gutter. Both use the existing shared column definitions and matching combined
horizontal padding, preventing column drift when a scrollbar appears. There is
an eight-pixel gap before the first desktop booking. Fine-pointer desktop action
buttons are slightly smaller; mobile/coarse-pointer targets remain unchanged.

The current user-provided Google Doc was read through the Google Drive connector:
https://docs.google.com/document/d/1y0STGVJ3WfwytDTLFDmAtvJDdnb7uClwHbkeycvaZAo
Its text requests separation before the first booking and slimmer rows/buttons.
Existing compact-row changes were preserved rather than reimplemented.

The browser fixture checks alignment numerically, joining without granting either
permission, the post-booking subscription CTA, independent review consent and
already-subscribed UI. Handler/consent regressions remain offline. No live customer
record, provider send or migration is used in validation.

Validation passed: 147 offline tests (one optional browser invocation skipped),
TypeScript, lint and the production build. The separate browser workflow passed
at all five viewport widths, including independent review consent and measured
desktop column alignment. Screenshots were reviewed. An initial build attempt was
blocked by an automatic approval-review usage-limit error; the later reviewed
retry completed successfully.
