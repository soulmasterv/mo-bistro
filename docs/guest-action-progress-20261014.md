# Guest action progress and disclosure affordances

On `feature/mo-bistro-ui-rebuild`, guest actions now keep a specific pending action and a synchronous in-flight guard. After explicit confirmation, cancellation immediately shows “Cancelling…” and a status message; action buttons, contact links and ETA form controls are disabled while processing. Grey disabled styles apply immediately without the previous background-color transition temporarily obscuring text.

The same pending UI identifies no-show, called and confirmation updates. A successful cancellation/no-show closes the matching guest sheet as soon as the server acknowledges it and updates local status before refreshing the queue. Failure keeps the booking visible, shows the existing error and restores controls. No mutation is assumed successful before server acknowledgement, and no automatic retry was introduced.

Booking details and Expected table readiness now have bordered summary controls and directional chevrons. Mark called has a bordered button treatment and an icon. Touch targets and keyboard focus styles remain available.

Validation uses actual React components and compiled CSS with synthetic local fixture responses. The browser holds a cancellation request pending to check the label, disabled controls, readable grey state and duplicate-click suppression, then returns an error to verify recovery. It separately checks successful acknowledgement closes the sheet. The existing five viewport sizes cover desktop, tablet and mobile.

No live database, Preview/Production deployment, WhatsApp send, authentication policy or consent change is involved.
