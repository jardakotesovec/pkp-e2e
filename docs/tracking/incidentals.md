# Incidentals

What a session saw in passing on another feature's screens; the spec
author reads their feature's rows at RUNBOOK step 3 and the row is deleted
when the spec absorbs it.

| Feature | Screen | Seen | Date | Evidence |
|---|---|---|---|---|
| U29 | Settings › Workflow › Review › "Review Forms", a form's item window ("Create Item"), signed in as the journal (press) manager on a scratch context | A "Drop-down box" or "Radio buttons" item saves with no "Response Options": "Save" closes the window with "Your changes have been saved." and no warning, and the item reopens with "No Items" under "Response Options"; the reviewer then meets an empty drop-down or no radio button, and the review's XML exports fail (U27's incidental of 2026-11-27). "Checkboxes" read in the code only | 2026-11-27 | U27 claim check I27I on OJS and OMP main, two runs (I27I-7), kept script `shared/playwright/checks/U27/I27I/i27i.js` |
| U62 | `php lib/pkp/tools/installPluginVersion.php plugins/generic/crossref/version.xml` on OJS `main` and 3.4 and OPS `main`, 3.5 and 3.4 (the same `version.xml` shape), PKP's test dataset | The tool stops with `PHP Fatal error: Uncaught Error: Class "\APP\plugins\generic\crossref\" not found`: Crossref's `version.xml` names no `<class>` and the plugin has no `index.php`, so the tool builds an empty class name. OJS 3.5's copy has the element (crossref-ojs `04eeef7` "Add missing class element"); `main`'s does not. | 2026-11-27 | PR review of pkp/pkp-lib#13895: run on OJS `main`'s dataset fleet 1 at the PR base and head alike; the other copies read (no `<class>`, no `index.php`) |
