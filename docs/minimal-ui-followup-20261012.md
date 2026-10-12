# Minimal staff UI follow-up — 12 October 2026

Implements the three updated items in the Bugs Google Doc: neutral dark colors, prominent top notifications, and minimal staff styling.

- Charcoal canvas and neutral gray surfaces replace the green dark palette. Light Mode keeps clean white panels and a pale gray canvas.
- Reception requests and actual table-ready alerts now mount in a single document section above the page heading, statistics and queue. Alerts are no longer appended after the Reception page. Existing polling, unread reconciliation, sound, approval/rejection and dismissal remain connected.
- Plain Reception, Waiter and Management headings replace promotional slogans. Decorative eyebrows, avatars, footer copy, table illustrations and ornamental serif notes are hidden; cards, controls and typography are simpler and more compact.
- Browser verification covers widths 320, 390, 768 and 1440, confirms notifications precede the queue, produces a real fixture notification after table release, and checks settled dark button foreground/background colors.
- Actual screenshots were visually inspected. Evidence uses real application components/CSS with local fixture APIs and does not imply live database testing.

Local optimized build, TypeScript, lint and 26 staff regression checks pass. No database changes, Production deployment or production guest import edits were made. This revision is local until publication is authorized.
