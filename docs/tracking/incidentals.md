# Incidentals

What a session saw in passing on another feature's screens; the spec
author reads their feature's rows at RUNBOOK step 3 and the row is deleted
when the spec absorbs it.

| Feature | Screen | Seen | Date | Evidence |
|---|---|---|---|---|
| U09 | Rule 30a, the block window ("Add Block") left unsaved, signed in as the Journal/Press/Server Manager `dbarnes` on the default dataset (OJS, OMP, OPS) | Contradicts Rule 30a's "Escape after a change to "Block Name" ask the same question": with the caret still in "Block Name" after typing, Escape closes the "Add Block" window without the question, the name is lost and the "Custom Block Manager" window behind it keeps no new row; the window's back arrow does ask. Seen on `main` and 3.5, every app; no 5xx, no page error | 2026-11-16 | issue reporter n16c (U09 A21, joined to `docs/issues/U58-A15-component-window-outside-press-loses-name.md`), `.reports/issues/n16c/` (in slot s2 only); kept script `shared/playwright/checks/issues/component-window-outside-press-loses-name/block.js` |
| U63 | Findings register OMP7 (the Users XML Plugin's "Export Users" list after "Import Users"), signed in as the Journal Manager `dbarnes` (OJS) and the Press Manager `dbarnes` (OMP) on the default dataset | Widens OMP7, filed under "### OMP" and once "not driven" on a journal: on OJS too the "Export Users" list after an import on the same page is the list the page opened with ("1 - 25 of 39 items", not 41), on `main` and 3.5; the entry's place and any OMP-only claim about it in the body need the journal | 2026-11-16 | issue reporter n16g, `docs/issues/U63-OMP7-export-users-list-misses-imported-accounts.md`; kept script `shared/playwright/checks/issues/export-users-list-misses-imported-accounts/walk.js` (`.reports/issues/n16g/` in slot s2 only) |
