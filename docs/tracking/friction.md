# Friction — what made an agent's task harder than it needed to be

What cost a screen-driving agent calls, time or retries that a better
brief, doc, kit, seed or fixture would have saved; that agent appends a row
at the end of its task. The housekeeping session folds the rows and
deletes them under MAINTENANCE "The housekeeping session".

One line per entry, appended at the end, in this shape:

`YYYY-MM-DD · U<nn>, sync or issues · <role and agent id> · <what cost you calls, time or retries> · <what would have helped>`

Facts only, the same quarantine as everywhere else (nothing
security-shaped, no credentials).

## Entries
2026-11-12 · U30 · claim checker ccK1s · the kept k1.js wrote its state file as `k1-state-<app>.json` through `outDir()`, so r1 and r2 run at once would have shared it, and the kit names the run record `run-<app>-<HHMMSS>.json` without `PROBE_RUN` (two runs started in the same second got `run-ojs-112415.json` and `run-ojs-112415-192538.json`, told apart only by the submission ids in their responses) · `npm run lint:probe-imports` flagging a kept check that builds a file path from `outDir()` instead of `outFile()`, and `PROBE_RUN` in the run record's name

2026-11-12 · plugin-review · plugin drive subagent · the re-run of an earlier review needed a second context with a manager of it only and a site admin with no context role; neither the earlier report nor harness.md says how, so the context went through the admin API and the users by SQL insert with a bcrypt hash computed in the pod through `php` (5 calls); and cropping a screenshot after the fact took a Playwright re-render, since the VM has no image library · a recipe in harness.md "The plugin sandbox" (or a `plugin-sandbox.js` helper) for "second context + context-only manager + role-less site admin", and a crop helper beside `sandbox/drive-guard.js`
2026-11-12 · U26-stable-3_5_0 · claim checker ccK2 · the kept `main` script for Rule 17 and the legacy grids (`shared/playwright/checks/U26/UA1/ua1.js`) stops on 3.5 at the reviewer step (`select#reviewerRecommendationId`; 3.5 names it `recommendation`), and the 3.5 folder has no `ReviewerPages.js`/`DecisionWizardPages.js`, so the drive was rebuilt as a 3.5 copy (K2/old.js) with inline reviewer and composer-attach steps · a 3.5 `ReviewerPages.js` (or a line-aware recommendation locator) in `lines/stable-3_5_0/shared/playwright/pages/`, and a line in VERSIONS.md saying which root page objects a 3.5 check may borrow
2026-11-12 · U26-stable-3_5_0 · claim checker ccK1 · the workstation's disk filled during the drives (Postgres "No space left on device" on the 3.5 OMP fleet, a part aborted and was rerun; 3.5 GB free after), and no step of the loop checks free space before a claim-check fan-out; on 3.5 two `reviewRounds[]` entries still answer 500, so Round 2 with a seeded file goes through `decisions: [first, 'newExternalReviewRound']`.
2026-11-12 · U26-stable-3_5_0 · claim checker ccK3 · W1/lib.js `taskRows()` opens the Tasks window from My Submissions only, where a Journal editor's header shows no Tasks button (a 30 s timeout and a rerun), and every chunk script matches a submission by `hasText: title`, so a title that is a prefix of another (`…two` / `…twob`) read the wrong My Submissions row in one run · a kit helper `tasks(page, {view})` that opens the window from the dashboard the role lands on, and a `rowByTitle()` that matches the whole title
2026-11-12 · U26-stable-3_5_0 · test author tomp · the OMP brief's deliverable 1 names the OJS suite path beside the OMP one ("and `lines/stable-3_5_0/apps/ojs/…spec.js`, the OJS suite of this version, for the steps a pilot already adapted"), which reads as a second deliverable owned by the OJS author running beside; a diff of both copies against `main` settled it was a reference · the `{{example_suites}}` slot rendered as "in the shape of X; see Y for the steps already adapted to this version", never as a second path in the deliverable sentence
