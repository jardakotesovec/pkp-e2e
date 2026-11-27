# Incidentals

What a session saw in passing on another feature's screens; the spec
author reads their feature's rows at RUNBOOK step 3 and the row is deleted
when the spec absorbs it.

| Feature | Screen | Seen | Date | Evidence |
|---|---|---|---|---|
| U29 | Settings › Workflow › Review › "Review Forms", a form's item window ("Create Item"), signed in as the journal (press) manager on a scratch context | A "Drop-down box" or "Radio buttons" item saves with no "Response Options": "Save" closes the window with "Your changes have been saved." and no warning, and the item reopens with "No Items" under "Response Options"; the reviewer then meets an empty drop-down or no radio button, and the review's XML exports fail (U27's incidental of 2026-11-27). "Checkboxes" read in the code only | 2026-11-27 | U27 claim check I27I on OJS and OMP main, two runs (I27I-7), kept script `shared/playwright/checks/U27/I27I/i27i.js` |
