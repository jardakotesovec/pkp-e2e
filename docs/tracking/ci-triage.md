# CI triage — known problems & failing tests

Known-red tests on `main`, confirmed upstream regressions awaiting a fix,
the flake classes that mimic regressions, and the companion branches
waiting on app PRs. MAINTENANCE "Standing duties"
and "A developer's PR fails the suite" say what to do with them.

**Where to look.** Besides this repo's `e2e` workflow, every app repo runs
the suite through its thin hook on every push to its `main`. The latest run
on `pkp/<app>` Actions (main branch) is the authoritative answer to "is the
app's tip red?", and its head SHA is the commit to reproduce against. The
bot's GitHub token is blocked from the pkp org (fine-grained token lifetime
policy), so `gh -R pkp/<app>` answers 403. Run and job metadata is
reachable unauthenticated through the public REST API; logs and artifacts
are not, so per-test detail comes from a local reproduction at the head SHA.

## Open — known-red tests on `main`

| ID | Signature (what CI shows) | Apps | Canonical entry | Status | First seen / last confirmed |
|----|---------------------------|------|-----------------|--------|-----------------------------|

## Open regressions — confirmed upstream regressions awaiting a fix

One row per regression the sync loop confirmed on reset databases and
reported to the team (MAINTENANCE step 5), in territory no shipped suite
reds on. Re-checked against the new tips every sync (step 6) by re-running
its kept reproduction under `shared/playwright/checks/sync/`; deleted when
the fix lands.

| Commit / PR | Surface | Apps | Reproduction | Reported | Note (one line) |
|-------------|---------|------|--------------|----------|-----------------|
| pkp-lib `f4db6d22c4` + ojs `3bfe1f9f68` / omp `5d2b2fea7` / ops `16bbd9b90e` (pkp/pkp-lib#13273, issue #13109) | The "Done" stage now sits in each app's `Application::getApplicationStages()` while its lib/pkp callers assume it absent: Statistics › Editorial Activity shows a permanent "0 Done" row under Active Submissions (the monthly editorial report mail shares the loop); Settings › Users & Roles › Roles gains a "Done" column whose toggle is live on the Journal manager, Reviewer and Reader rows while their other stages are locked, and the role form a "Done" box; every submission's `stages` carries a Done entry and a discussion's "Attach Workflow Files" stage picker lists a disabled "Done" for every submission | OJS OMP OPS (each app's stage list; shared lib/pkp callers; reproduced on OJS) | `checks/sync/pkp-lib-13109/regressions.js` (records `s3-stats-editorial`, `s4-roles-grid`, `s4b-author-role-form`, `s5-stage-options`, `s2-api`); fixed when the stats table has four rows, the Roles grid no "Done" column (or locked like the other stages), the picker and `stages` four stages | thread 2026-09-08; re-read and re-confirmed from scratch 2026-09-09 (rr3), DMs to @beaug and @jarda.kotesovec sent 2026-09-09 (the 2026-09-08 DMs never arrived) | Cause: `WorkflowStageDAO::getWorkflowStageTranslationKeys()`, `UserGroupGridCellProvider`, `PKPStatsHandler`, `submission/maps/Schema::getPropertyStages()` and the other `getApplicationStages()` callers were written with Done absent (the Schema's own comment says so); the apps' `getApplicationStages()` gained `WORKFLOW_STAGE_ID_DONE` at the PR. Reported with it, not a regression: on a fresh install no role receives stage 6 (`Repo::userGroup()->installSettings()` caps registry stages at Production), so the grant `registry/userGroups.xml` and the upgrade migration make never lands on a fresh 3.6 install — with the visible consequence U40 K1 drove on all three apps (2026-09-09): the issue's own case, an Author with the permission editing a new version while another is published, still fails, because the published submission rests in Done and the Author's group holds no stage 6, so the screen offers Save and the write answers 401 `user.authorization.accessibleWorkflowStage` (U40 register, the entry folded from K1-1); an upgraded install that ran the migration should pass that case (the fleets never upgrade, so unverified), and the install-side fix is the `<= WORKFLOW_STAGE_ID_PRODUCTION` cap in `UserGroup\Repository::installSettings()`; and `canCurrentUserChangeMetadata` left the submission object (`GET submissions/{id}` omits it, `_submissions` items emit it as `null` because `getSubmissionsListProps()` still names it) and lives on each publication. Delete the row when the upstream fix lands. |
| pkp-lib `74a8d58571` (pkp/pkp-lib#12352, issue #12347) | Upload wizard: step-1 "Cancel" after a revision upload no longer restores the previous file when a different user had renamed it (`cancel-file-upload` answers `status:false`) | OJS OMP OPS (shared lib/pkp; reproduced on OJS) | `checks/sync/pkp-lib-12352/cancel-restore.js`, MODE=main; fixed when `afterCancel` reads the original fileId and "Renamed by B.pdf" | 2026-09-07 (thread + DMs to @beaug, @jarda.kotesovec) | Cause: `Repository::edit()` logs the new file, so `PKPManageFileApiHandler::findMatchedLogEntry()` finds no entry with the original uploader's username plus the pre-revision name and fileId. Broken at `74a8d58571`, working at `4ddab4b9cf` (upstream-sync log 2026-09-07). Upstream re-filed it as pkp/pkp-lib#13286 (a pre-existing restore bug #12352 exposed; its Variant 2, the renamer revising, fails on 3.4 and 3.5 too); fix PR pkp/pkp-lib#13288 (`e07727add6`, plus ojs#5801 tests only) verified 2026-09-08 with the kept script at the PR head, MODE=main and MODE=other both restore fileId, name and uploader with `status:true` and leave no dangling log rows. Delete the row when #13288 lands. |

## Flake watch — known non-deterministic failure classes

Not regressions. The response is a targeted rerun and a dated tally on
the line (a line keeps its last three); a real investigation starts when the class's watch condition
trips.

- **Decision-wizard timing under load.** U26 S5/S7/S8, U49 S11 and U21 S10
  exceed their waits during full-suite runs and pass in isolation or on
  retry. The mechanism is app-changes row 9: the post-save publication
  refresh remounts workflow components mid-interaction, and under load the
  window widens. The harness mitigates with outcome-keyed retries and
  content-verified saves (U40 S4 on OJS and OPS, U49 S11 on OJS since
  2026-09-01); the fix is upstream. Reported to the team 2026-08-29.
  Last incidents: U21 S11 red on OMP with its retry exhausted 2026-09-03 (run
  33745718330), green on the targeted rerun; U40 S6 then U40 S4 red on OMP in
  two consecutive local final runs 2026-09-05 (U29 session, load average ~15
  on 10 cores), green on the third; U40 S4 red on OMP in two of four local final
  runs 2026-09-07 (U21 revision; the first at load ~15 on 10 cores), green
  on the others, and in the second of the U23 revision's local final runs
  2026-09-08. **Watch condition**: a
  hardened test reds again with retries exhausted.
- **Reviewer dashboard list under load** (U28 S1 and S2, OMP). The "Action
  Required by me" row or count read exceeds its 10 s wait in full-suite
  runs and passes alone. Last incidents: S1 red in two consecutive local
  final runs 2026-09-07 (U21 revision, load ~15 on 10 cores), green alone
  and in the third full run; 2026-09-08 (U23 revision) S1 red in the first
  local final run and S2 in the second, the same row read.
  **Watch condition**: reds at CI's four workers.
- **Error dialog stacking over the Add Reviewer windows** (U31 S4, OMP and
  once OJS). The "Error" dialog's overlay intercepts the window's "Close"
  and the test runs to its five-minute timeout (seen first by the U31 test
  author on 2026-09-06, one re-run). Last incidents: OMP red in a local
  final run and again alone 2026-09-07, green in two full runs earlier that
  day; OJS red in a local final run 2026-09-08 (U23 revision), the first
  time on a journal. **Watch condition**: reds on CI.
- **U01 S8 hangs on a used database** (OJS, local only so far). After a
  day's probes, checks and suite runs on one database, "S8: editor
  impersonates a participant from the Participants panel" hit its 4-minute
  timeout twice in a row (the editor's dashboard showed 129 assigned
  submissions); it passed in 8 s right after `reset:ojs` and the final
  run was green. Seen 2026-09-05 (U29 session, `.reports/U29/pw-out-u01s8`
  in git-ignored scratch). CI runs on a fresh database, so no CI incident
  yet. **Watch condition**: S8 reds in CI, or a local run on a fresh
  database reds; then bisect the participant panel against submission
  volume.
- **Reviewer-indicator popover under load** (U23 S9, OJS). The row with
  two reviewers opens the wrong reviewer's popover (Paul instead of Julia)
  during a full-suite run and passes in isolation; the hover target is
  settled before both indicators have rendered. Seen once, 2026-09-04
  (U05 final run, `.reports/U05/final-run-ojs.log`), green alone and on
  the OJS re-run the same day. **Watch condition**: a second full-suite
  incident; then anchor the hover on the indicator's own accessible name
  and wait for both indicators before hovering.
- **A wizard Continue press swallowed the instant a step becomes current**
  (U21 S12, OJS). CI run 34215183797 (2026-09-08, pkp-e2e `main` at
  `aa12a61`, a docs-only push) red on both attempts: the press issued right
  after the rail showed "2 Details" fired no save and the rail stayed put
  for the 30 s wait. The same tree (`9bd62a9`, the revert of 2026-09-09)
  and the same app tips were green on run 34354844582, on the nightly
  34183869175 and locally, so the class is timing, not a regression.
  **Watch condition**: a second red; then `continueTo()` re-presses when
  the rail has not moved within a few seconds.
- **Contributor reorder under load** (U41 S2, OPS). After "Order", the
  "Increase position" press on the second contributor left the list
  unchanged for the 10 s wait during a local full run at four workers
  (2026-09-09, sync session, `.reports/sync/final-run-ops.log`, the
  U41 describe's remaining tests did not run); green alone in 7 s and on
  CI at the same tips (run 34354844582). **Watch condition**: a second
  full-run incident; then wait for the order mode's own list re-render
  before pressing.
- **Review wizard step not advancing on "Accept" under load** (U28 S10,
  OJS). The one-click-access leg's accept press left step "2." disabled for
  its 30 s wait during a local full run at four workers (2026-09-09, sync
  session, `.reports/sync/final-run-ojs.log`); green in 17 s with the whole
  U28 suite re-run alone, and on CI at the same tips (run 34354844582).
  **Watch condition**: a second full-run incident; then read the accept's
  own response before expecting the step.
- **A `php -S` worker segfault** (once, OJS run 33106002377, 2026-08-27,
  in-flight request most likely `GET /api/v1/_submissions/viewsCount`).
  The cascade it used to cause is fixed by the server restart loop
  (harness.md "Runtime model"), so a recurrence now costs one test. It was
  never pinned; if it recurs, add core-dump capture to CI before
  diagnosing.

## Companion branches — pkp-e2e branches waiting on app PRs

One row per branch prepared for a developer's open OJS, OMP or OPS pull
request (MAINTENANCE "A developer's PR fails the suite"), named exactly
like the developer's branch. State: `investigating` (reproducing, no
verdict yet) · `ready` (pushed, green at the PR ref, developer told) ·
`merged` (only while the sync line is written; then the row is deleted).

| App PR | Branch | State | Since | Note (one line) |
|--------|--------|-------|-------|-----------------|
