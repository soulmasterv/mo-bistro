# Pilot readiness — 23 October 2026

Fresh Git fetch: Development is 020de5b; pilot/mo-bistro-shrunk is 3e8bcb9.
Read-only Vercel domain inspection still assigns development.mo-bistro.labbing.space
to pilot/mo-bistro-shrunk. The routing mismatch is not corrected. No alias or
deployment change was made. A Ready build is not proof of custom-domain assignment.

Development's existing fixes pass the local rendered-component fixture at
320×700, 390×844, 768×1024, 966×870, 1280×720, 1440×900, and 844×390:
normal Reception top padding, dark document and scrollbar, no horizontal expansion,
expanded walk-in/QR panels, and correct Closed booking subtitle. Nine tests pass.
No new Pilot application defect was reproduced, so working behavior was preserved.

The 15 Pilot handler/polling tests pass using in-memory PGlite and mocked transport.
They cover public/staff creation, active duplicate-phone protection, queue/status,
seating, removal reasons, cancellation/undo, source recording, polling backoff,
and messaging state transitions without external sends. The UI fixture checks
refreshes and preserves expanded form drafts. These are local tests, not a live
custom-domain end-to-end certification.

Type generation, TypeScript, ESLint and the Next production build pass.
The first build attempt failed because Turbopack rejects an external dependency
junction; installing dependencies inside the checkout resolved that environment issue.
TypeScript must follow `next typegen` on a fresh checkout because LayoutProps is generated.

Production and all database/configuration/routing settings were left unchanged.
Approval is required to push, deploy, or change the Development domain assignment.
Keep one shared Testing branch; the previous Development-only database proposal
is superseded. Live queue reads can process pending messaging jobs; subsequent
workflow tests should stay isolated until outbound safety is verified.
