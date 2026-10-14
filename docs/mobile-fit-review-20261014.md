# Mobile follow-up

- Regular and PIN login use the dynamic viewport with reduced spacing on short
  screens. Content may still scroll when necessary for a keyboard, error or text
  enlargement; no blanket overflow lock hides login fields.
- Both sign-in paths acquire a synchronous submission guard, disable inputs and
  grey the sign-in button during the request. Successful responses retain that
  state until navigation unmounts the page; failures restore editing. Login method
  links cannot be used while submitting. Authentication/session rules are unchanged.
- Mobile reception reserves space for the actual header and bottom actions. Compact
  side-by-side next-table notices leave more room for the queue; guest cards cannot
  shrink, and the list scrolls internally. Desktop reception layout is preserved.
- Redundant name-initial badges have been removed from reception rows.
- Personal readiness now uses the existing restaurant-estimate card component,
  retaining rounded corners, typography and separation from the status card.

TypeScript, lint and the production build passed. The offline suite passed 144
tests (the optional browser invocation skipped there). The separate rendered-browser
workflow passed at 320, 390, 768, 1024 and 1440 pixels, including 650-pixel-height
login/PIN checks, queue space/row-height checks, delayed failed login/PIN requests,
duplicate-submit blocking and readiness-card spacing. Screenshots were inspected.
The fixture wrapper now uses display:contents to match the real layout's direct
body children. These are local Chromium checks, not physical iPhone/Safari tests.

No database, environment, WhatsApp transport, Production or main changes were made.
