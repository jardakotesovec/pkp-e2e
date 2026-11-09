# Incidentals

What a session saw in passing on another feature's screens; the spec
author reads their feature's rows at RUNBOOK step 3 and the row is deleted
when the spec absorbs it.

| Feature | Screen | Seen | Date | Evidence |
|---|---|---|---|---|
| U11 | Settings › Website › Setup › Highlights, ordering mode (Rule 9) | "Save Order" on a list of more than 100 highlights saves the order of all of them but drops the list to its first 100 rows until a reload (the A12 report, `docs/issues/U11-A12-highlights-list-drops-past-100.md`); Rule 9 says "Save Order" saves the order shown and leaves ordering mode, with no A12 marker | 2026-11-09 | `shared/playwright/checks/issues/highlights-list-drops-past-100/walk.js` (issue reporter u11r3, `main` and `stable-3_5_0`, OJS, OMP, OPS) |
