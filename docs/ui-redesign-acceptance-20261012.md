# Mo Bistro UI redesign acceptance — 12 October 2026

Implemented locally on feature/mo-bistro-ui-rebuild. No push, deployment, production migration, or Production Neon operation was performed.

## Changes

Reception now has a forest-and-ivory workspace header, service statistics, searchable queue cards, clear guest actions, an integrated requests section, floor availability, and redesigned QR, Add Guest and seating dialogs. Requests stay in the page flow instead of overlapping the queue.

Waiter now has floor statistics, area filters and table cards with readiness actions directly within the table workflow. Simple Mode uses area-based generic table readiness/free actions without requiring a named table.

Management now groups restaurant settings, team and shifts, and floor configuration with an overview and section navigation. Managers can switch between Management, Reception and Waiter in the shared header.

The shared design includes responsive layouts, consistent controls and spacing, mobile inputs of at least 16px, dialog keyboard focus trapping, Escape dismissal and focus restoration. Existing booking, seating, authentication, notification and WhatsApp paths remain integrated. Simple Mode seating preserves seated_at and WhatsApp review scheduling when enabled.

## Validation

- Production build, TypeScript and lint passed locally.
- 65 regression, PostgreSQL workflow and WhatsApp checks passed with no skipped checks.
- The browser workflow suite passed at widths 320, 390, 768 and 1440 pixels, including role navigation, table release, request approval, Simple Mode, dialog keyboard handling, form controls and overflow checks.
- Rendered Reception, Waiter and Management screenshots were visually inspected at desktop and mobile sizes. QR and seating dialogs were also inspected.

Browser evidence renders the actual React workspace components with compiled application CSS and synthetic local API fixtures. It does not prove deployment, live database integration or production authentication. No real WhatsApp messages were sent.

## Evidence

Screenshots and test logs are in outputs/ui-redesign in the audit workspace. Each workspace has reception-{width}.png, waiter-{width}.png and management-{width}.png for all four widths. Additional screenshots cover QR, Add Guest, seating and Simple Mode. Mobile captures show the full page.

The visual redesign requires no additional database migration. Previously incorporated Simple Mode inventory and staff schema repair migrations remain isolated-environment setup prerequisites where those schemas are absent; they were not applied to Production. The production guest import script was not changed.

This revision supersedes the previous UI draft. It remains local pending explicit authorization to push or deploy.
