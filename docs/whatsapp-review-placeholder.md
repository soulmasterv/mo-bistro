# Temporary interactive review request

The review destination is not ready. At the existing `seated_at + 60 minutes` due time, an eligible subscribed guest with review consent receives an interactive reply-button message inside the verified 24-hour customer window.

Default body: `Thank you for joining us at Mo Bistro, {name}! We hope you're enjoying your visit. Our review page is coming soon.` The existing opt-out sentence is appended. `WHATSAPP_REVIEW_TEXT` can override the body; the resulting interactive body must fit 1024 characters, including opt-out text.

Button: `Leave a review`, reply ID `review_placeholder`. This uses Meta's [reply-button payload](https://whatsapp.github.io/WhatsApp-Nodejs-SDK/api-reference/messages/interactive/), not a fake destination URL. Tapping sends a WhatsApp button reply. The existing webhook records it as ignored (and records the normal inbound customer window), without changing consent, submitting a review, queuing a new notification or sending a reply. Repeated taps do not resend the review request.

Outside the customer window, the approved configured review template remains required; no free-form interactive send bypass is added. No timer shortening, timestamp backdating, consent backfill, new environment variable or migration is required. Preview remains restricted to the configured test number. Message formatting beyond this functional placeholder remains last priority.

Focused tests cover due versus early review delivery, one send on duplicate callbacks, the button payload, expired-window handling, length bounds, consent/STOP/recipient restrictions and no business action on button replies. Real delivery must still be checked after a subscribed test booking is seated and the full hour elapses.
