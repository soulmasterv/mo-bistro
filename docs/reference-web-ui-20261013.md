# Mo Bistro reference-based web UI and menu

Branch: feature/mo-bistro-ui-rebuild. Local implementation only; no deployment, Production, database change or provider send.

## Result
- Guest status uses a cream, beige, bronze and dark-text website layout. Waiting/called states retain the estimate, booking details, confirmation, polling and manual refresh. Seated state replaces wait messaging, hides queue fields/estimate/manual refresh/leave-waitlist, and displays a calm seated confirmation. Closed states retain new-registration handling.
- WhatsApp subscription uses natural copy and the exact UNSUBSCRIBE/STOP opt-out sentence. Subscription still requires a received verified reply. Already-subscribed guests see enabled status; review preference is collapsed by default and remains editable while relevant. Before subscription it is shown as a separate preference. No new subscribe CTA appears for seated guests.
- Reception follows the light cream/gold and dark charcoal/gold references. Desktop adds a compact row layout, section navigation, header actions and counted All/Waiting/Called/Seated filters. Mobile retains the approved guest sheet. Seating/cancel/no-show controls are disabled for seated records. Existing table, QR, add-guest and request workflows remain connected.
- /menu displays all 27 rendered menu pages using lazy-loaded static images and links to the original PDF for opening/downloading. Guest join/status/menu-card links point to it. The original PDF is unchanged (SHA256 708BAA49EDEF0C324902F6F184617C3A7551D5B54C7F4F88DE6A8AC7B4D9CA92).

## Changed files
- src/app/status/page.tsx: guest website and state-specific rendering, existing booking handlers preserved.
- src/app/reception-dashboard.tsx: reference layout, filters, elapsed waiting-time display and on-demand controls.
- src/app/globals.css: scoped guest/reception/menu styles and responsiveness.
- src/app/menu/page.tsx: public menu website.
- public/menus/mo-bistro-menu.pdf and public/menus/menu-page-01.jpg through menu-page-27.jpg: supplied menu and its rendered pages.
- src/app/join/page.tsx and src/components/mo-bistro-menu-card.tsx: local menu links.
- src/components/whatsapp-subscription.tsx: friendly copy, enabled/review states, seated CTA suppression.
- src/components/theme-preference.tsx: menu remains in guest light mode.
- src/components/guest-detail-sheet.tsx: seated label and mutation controls disabled for seated guests.
- src/lib/whatsapp/service.ts: review preference relevance exposed before subscription; existing consent/subscribe/security behavior preserved.
- tests/browser-workflows.test.mjs and tests/whatsapp.test.mjs: visual/workflow and consent regressions.

## Validation
- 60 booking, authorization and WhatsApp regression tests passed using isolated mocks/PGlite.
- TypeScript and optimized Next build passed; /menu is included.
- Changed-file lint passed.
- Browser fixture checks cover 320, 390, 768, 1024 and 1440 pixel widths, both reception themes, guest waiting/called/seated/closed states, subscribed/unsubscribed options, seated actions, dialogs, menu images and side-scroll checks.
- PDF renders visually inspected as a 27-page contact sheet and detailed sample pages; no source PDF edits.
- Screenshots are in ../../outputs/reference-web-ui relative to this repository.

## Remaining limitations
- The restaurant interior photographs in the guest reference were not supplied as usable assets; a branded text panel occupies that area. No invented venue photographs are used.
- Table number and seated time are not exposed by the existing guest tracking response, so those optional sample details are omitted.
- Browser checks use Chromium viewport emulation, not physical iOS Safari devices or live customer data.
- The previously reported table-selection availability defect is not changed by this visual/menu implementation.
- Preview deployment is not verified, and this commit is not pushed.
