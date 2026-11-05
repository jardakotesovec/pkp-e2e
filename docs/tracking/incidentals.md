# Incidentals

What a session saw in passing on another feature's screens; the spec
author reads their feature's rows at RUNBOOK step 3 and the row is deleted
when the spec absorbs it.

| Feature | Screen | Seen | Date | Evidence |
|---|---|---|---|---|
| U13 | Article and issue PDF galley reader (pdfJsViewer `b7e5188047`, PDF.js 6.4.299) | Every viewer load logs "Applying inline style violates the following Content Security Policy directive 'style-src 'self''" in the console (the control too); the PDF draws "of 1" with no page error, but `textLayerChars` reads 0 and the find bar matches 0. Not compared with the 4.10.38 tree or with `main` (the same plugin tree), so whether the text layer is blocked by the policy is open | 2026-11-05 | `checks/sync/pdfJsViewer-8ae9739/viewer-browsers.js` on the OJS `ore` campaign fleet (`RUN=ore1105`), S1 and S4 `consoleErrors` |
