# OMP and OPS: saving a discussion or task fails on a missing class

Temporary report (RUNBOOK "What goes where"): delete once the fix ships.
Ledger row: `docs/tracking/app-changes.md` row 12. Found 2026-09-04 by the
U05 probes on the 2026-09-02 pkp tips; still present on pkp `main` for
omp, ops and pkp-lib as of 2026-09-04 (fetched and checked).

## What a user sees

On a press (OMP) or a preprint server (OPS), a Manager opens a
submission's workflow page, presses "Add discussion", fills the form and
saves. A dialog answers:

```
Class "APP\notification\Notification" not found
```

The discussion row is stored, but the participants get no task and no
email. Replying to an existing discussion fails the same way. OJS is
unaffected.

## Cause

`lib/pkp/api/v1/submissions/tasks/EditorialTaskController.php` imports
`APP\notification\Notification` (added by pkp-lib `139bde1e65`,
"pkp/pkp-lib#12322 Re-add task related notifications", 2026-02-10) and
uses it around lines 1038–1067 to raise the task notification. Only OJS
ships `classes/notification/Notification.php`; OMP and OPS have
`NotificationManager.php` but no `Notification.php`, so PHP fails on the
first use.

Every constant the controller reads there
(`NOTIFICATION_TYPE_ASSIGN_COPYEDITOR`, `…_AWAITING_COPYEDITS`,
`…_ASSIGN_PRODUCTIONUSER`, `…_AWAITING_REPRESENTATIONS`,
`…_NEW_QUERY`, `NOTIFICATION_LEVEL_TASK`) is defined on
`PKP\notification\Notification`, so the app-level class adds nothing the
controller needs.

## Fix options

1. pkp-lib: change the import to `use PKP\notification\Notification;` in
   `EditorialTaskController.php` (one line; OJS keeps working because its
   subclass only adds OJS-specific constants). Worth a grep for other
   `APP\notification\Notification` imports in lib/pkp that OMP/OPS code
   paths can reach.
2. Or add an empty `APP\notification\Notification extends
   PKP\notification\Notification` to OMP and OPS, as OJS has.

The e2e fleets and CI carry option 2 as a mounted overlay
(`apps/omp/php/classes/notification/Notification.php`,
`apps/ops/php/classes/notification/Notification.php`) until upstream
picks one; the overlay is removed then.

## Reproduce

Fresh OMP or OPS install, any submission, Manager: Workflow › "Add
discussion" › fill subject and message, choose a participant, Save.
Network: `POST /api/v1/submissions/{id}/tasks` returns the error.
