# CI triage — known problems & failing tests

Known-red tests on `main`, confirmed upstream regressions awaiting a fix,
the flake classes that mimic regressions, and the companion branches
waiting on app PRs. MAINTENANCE "Standing duties"
and "A developer's PR fails the suite" say what to do with them.

**Where to look.** Besides this repo's `e2e` workflow, every app repo runs
the suite through its thin hook on every push to its `main`. The latest run
on `pkp/<app>` Actions (main branch) is the authoritative answer to "is the
app's tip red?", and its head SHA is the commit to reproduce against.
`gh run view -R pkp/<app> <run> --log-failed` names the failed tests and
`gh run download -R pkp/<app> <run>` fetches the Playwright artifacts
(error contexts and `.server-logs/`) since 2026-09-12, when the bot's
token was reissued under the pkp org's 366-day lifetime cap for
fine-grained tokens; should it lapse again (`gh -R pkp/<app>` answers
403), run and job metadata stay reachable unauthenticated through the
public REST API and per-test detail comes from a local reproduction at
the head SHA. A local reproduction is still the evidence for a verdict;
the log only says where to look.

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
| pkp-lib `f4db6d22c4` + ojs `3bfe1f9f68` / omp `5d2b2fea7` / ops `16bbd9b90e` (pkp/pkp-lib#13273, issue #13109) | The "Done" stage now sits in each app's `Application::getApplicationStages()` while its lib/pkp callers assume it absent: Statistics › Editorial Activity shows a permanent "0 Done" row under Active Submissions (the monthly editorial report mail shares the loop); Settings › Users & Roles › Roles gains a "Done" column whose toggle is live on the Journal manager, Reviewer and Reader rows while their other stages are locked, and the role form a "Done" box; every submission's `stages` carries a Done entry and a discussion's "Attach Workflow Files" stage picker lists a disabled "Done" for every submission | OJS OMP OPS (each app's stage list; shared lib/pkp callers; reproduced on OJS) | `checks/sync/pkp-lib-13109/regressions.js` (records `s3-stats-editorial`, `s4-roles-grid`, `s4b-author-role-form`, `s5-stage-options`, `s2-api`); fixed when the stats table has four rows, the Roles grid no "Done" column (or locked like the other stages), the picker and `stages` four stages | thread 2026-09-08; re-read and re-confirmed from scratch 2026-09-09 (rr3), DMs to @beaug and @jarda.kotesovec sent 2026-09-09 (the 2026-09-08 DMs never arrived); still reproduces 2026-09-10 at ojs `8fc931bcf8` / pkp-lib `c59325d675` with the kept script (`.reports/sync/s10/`: "0 Done" under Active Submissions, the "Done" column with a live Journal-manager toggle, the disabled "Done" picker entry, five `stages`); the fresh-install stage-6 gap is with upstream (jardakotesovec on the issue, 2026-09-09; fix PRs pkp/pkp-lib#13312 and pkp/ojs#5816 posted by Vitaliy-1 2026-09-10, unmerged at pkp-lib `0b40119a89`) | Cause: `WorkflowStageDAO::getWorkflowStageTranslationKeys()`, `UserGroupGridCellProvider`, `PKPStatsHandler`, `submission/maps/Schema::getPropertyStages()` and the other `getApplicationStages()` callers were written with Done absent (the Schema's own comment says so); the apps' `getApplicationStages()` gained `WORKFLOW_STAGE_ID_DONE` at the PR. Reported with it, not a regression: on a fresh install no role receives stage 6 (`Repo::userGroup()->installSettings()` caps registry stages at Production), so the grant `registry/userGroups.xml` and the upgrade migration make never lands on a fresh 3.6 install — with the visible consequence U40 K1 drove on all three apps (2026-09-09): the issue's own case, an Author with the permission editing a new version while another is published, still fails, because the published submission rests in Done and the Author's group holds no stage 6, so the screen offers Save and the write answers 401 `user.authorization.accessibleWorkflowStage` (U40 register, the entry folded from K1-1); an upgraded install that ran the migration should pass that case (the fleets never upgrade, so unverified), and the install-side fix is the `<= WORKFLOW_STAGE_ID_PRODUCTION` cap in `UserGroup\Repository::installSettings()`; and `canCurrentUserChangeMetadata` left the submission object (`GET submissions/{id}` omits it, `_submissions` items emit it as `null` because `getSubmissionsListProps()` still names it) and lives on each publication. Delete the row when the upstream fix lands. |
| pkp-lib `74a8d58571` (pkp/pkp-lib#12352, issue #12347) | Upload wizard: step-1 "Cancel" after a revision upload no longer restores the previous file when a different user had renamed it (`cancel-file-upload` answers `status:false`) | OJS OMP OPS (shared lib/pkp; reproduced on OJS) | `checks/sync/pkp-lib-12352/cancel-restore.js`, MODE=main; fixed when `afterCancel` reads the original fileId and "Renamed by B.pdf" | 2026-09-07 (thread + DMs to @beaug, @jarda.kotesovec) | Cause: `Repository::edit()` logs the new file, so `PKPManageFileApiHandler::findMatchedLogEntry()` finds no entry with the original uploader's username plus the pre-revision name and fileId. Broken at `74a8d58571`, working at `4ddab4b9cf` (upstream-sync log 2026-09-07). Upstream re-filed it as pkp/pkp-lib#13286 (a pre-existing restore bug #12352 exposed; its Variant 2, the renamer revising, fails on 3.4 and 3.5 too); fix PR pkp/pkp-lib#13288 (`e07727add6`, plus ojs#5801 tests only) verified 2026-09-08 with the kept script at the PR head, MODE=main and MODE=other both restore fileId, name and uploader with `status:true` and leave no dangling log rows. Still reproduces 2026-09-10 at ojs `8fc931bcf8` (`afterCancel` fileId 2, `article-rev.pdf`, `status:false`); #13288 still open at `5f995d86af`. Delete the row when #13288 lands. |

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
  2026-09-08. U40 S4 red on OMP in the first of the U26 revision-2 local
  finals 2026-09-12 (load ~16 on 10 cores), green alone; U43 S4 (a click
  hitting the 180 s test timeout) red on OMP in the accepted run 2026-09-13,
  green alone in 12 s; U26 S10 (the decision wizard's "Notify Authors"
  composer read empty for its 20 s wait) and U40 S3 (the "Publication: Title
  & Abstract" heading not found in 30 s) red on OMP in the first U31
  revision local final 2026-09-13 (load over 100 on 10 cores from the
  desktop), both green in the second full run; U40 S4 (the edited abstract not
  found in 30 s) red on OMP in the first U03 revision final 2026-09-13, green
  alone in 5 s and in the second full run. **Watch condition**: a
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
- **U01 S8 hangs on a used database** (OJS and once OPS, local only so far). After a
  day's probes, checks and suite runs on one database, "S8: editor
  impersonates a participant from the Participants panel" hit its 4-minute
  timeout twice in a row (the editor's dashboard showed 129 assigned
  submissions); it passed in 8 s right after `reset:ojs` and the final
  run was green. Seen 2026-09-05 (U29 session, `.reports/U29/pw-out-u01s8`
  in git-ignored scratch). A milder OPS sighting 2026-09-13 (U03
  revision, first local final at workers auto, a database reset that
  morning and used by three author runs): the impersonated author's
  workflow window opened but its "Submission {tag}" title was not found in
  10 s, green alone in 11 s (`.reports/U03/final-run-ops-run1-red.log`).
  CI runs on a fresh database, so no CI incident yet. **Watch
  condition**: S8 reds in CI, or a local run on a fresh database reds;
  then bisect the participant panel against submission volume.
- **Reviewer-indicator popover under load** (U23 S9, OJS). The row with
  two reviewers opens the wrong reviewer's popover (Paul instead of Julia)
  during a full-suite run and passes in isolation; the hover target is
  settled before both indicators have rendered. Seen once, 2026-09-04
  (U05 final run, `.reports/U05/final-run-ojs.log`), green alone and on
  the OJS re-run the same day. **Watch condition**: a second full-suite
  incident; then anchor the hover on the indicator's own accessible name
  and wait for both indicators before hovering.
- **A wizard press swallowed the instant a step becomes current** (U21
  S10 and S12, OJS, CI only). CI run 34215183797 (2026-09-08, pkp-e2e
  `main` at `aa12a61`, a docs-only push) red on both attempts of S12: the
  Continue press issued right after the rail showed "2 Details" fired no
  save and the rail stayed put for the 30 s wait; green on the same tree
  and tips elsewhere. Second incident 2026-09-12, pkp-e2e run 34687878464
  (companion `13274` at the ojs PR ref `75df364d49`): S10 red on both
  attempts (the Review step's "Submit" press opened no confirmation
  dialog, no `/submit` request in the server log; the retry stuck on "2
  Details") and S12 red once on the same "2 Details" wait, green on
  retry; both green locally at the same ref. The ojs PR's own run
  34683529824 (read once the token worked) is the same class: U31 S1 red
  on both attempts and U21 S12 once, all on the "2 Details" wait after
  Continue. Watch condition tripped;
  hardened 2026-09-12: `SubmissionWizardPage.pressUntil()` gives a
  footer press an 8 s window for its outcome and presses again while the
  button is still offered, at most three times, behind `continueTo()`,
  `continueToReview()` and `submitAndConfirm()`. **Watch condition**: a
  hardened press reds again with its retry exhausted.
- **A wizard rich-text fill lost to a re-render under load** (U21 S3,
  OPS, local). The Autosave bullet types "Autosave check" into the Title
  box and reads it back; in the 2026-09-12 U21 revision's first OPS final
  run, started while the OJS final was still running (two full suites at
  eight workers each on 10 cores), the box read the seeded title again
  for the whole 10 s wait, so the fill was overwritten by the form's own
  re-render; green alone (1.1 min) and never seen with one suite running.
  Finals now run one app at a time. **Watch condition**: a red with one
  suite running or at CI's four workers; then anchor the fill on the
  editor's settled state before typing.
- **Contributor reorder under load** (U41 S2, OPS; the OJS twin shares the
  code shape). The Cancel leg's "Increase position" press, issued right
  after "Order" while the list re-rendered into ordering mode, left the
  order unchanged for its 10 s wait: locally at four workers 2026-09-09
  (`.reports/sync/final-run-ops.log`) and on CI 2026-09-10 with the retry
  exhausted (pkp-e2e `main` run 34466942823, a docs-only push; the nightly
  34558837065 on the same tree and the newer OPS tip green). Watch
  condition tripped; hardened 2026-09-11: the leg is a content-verified
  bounded retry like the Save leg (re-enter ordering if dropped, wait for
  the row's own arrow, press, pass only when the list shows the move), on
  OPS and OJS. **Watch condition**: the hardened leg reds again with its
  retry exhausted.
- **Review wizard step not advancing on "Accept" under load** (U28 S10,
  OJS; the shared `ReviewerPages.accept()` serves OMP and OPS too). The
  one-click-access leg's accept press left step "2." disabled for its 30 s
  wait during local full runs at four workers: 2026-09-09 (sync session)
  and again 2026-09-11 (sync session, `.reports/sync/final-run-ojs.log`,
  the same `aria-disabled="true"` tab for 63 polls); green in 17 s alone
  both times (2026-09-12 rerun `.reports/sync/u28s10-rerun-0912.log`) and
  on CI at the same tips (run 34354844582). Watch condition tripped;
  hardened 2026-09-12: `accept()` is a content-verified bounded retry
  (press, wait up to 10 s for step 2 to become current, press again while
  the accept button is still offered, at most three presses). **Watch
  condition**: the hardened leg reds again with its retry exhausted.
  **Tripped 2026-09-13** (U05 revision session, the OJS final at four
  workers, `.reports/U05/final-run-ojs.log`: the same `aria-disabled="true"`
  tab for 63 polls after the hardened accept, the one red of 209; green
  alone in 49 s, `.reports/U05/u28s10-rerun-0913.log`); the bounded retry
  did not cover it, so the leg needs a second look.
- **Author Response table re-rendering on a used database** (U30 S4,
  OJS). The editor's "Author Response" table on the co-author scenario
  keeps re-rendering: the opener's reload waited 30 s for the table in a
  full run at four workers (2026-09-12, companion `13274` at the ojs PR
  ref `75df364d49`, `.reports/sync/pr13274-final-ojs.log`), and alone on
  that used database the co-author row's "More Actions" button was
  detached and re-attached for the whole 180 s test timeout, at the PR ref
  and at the OJS tip `cea48a066b` alike; green in 15 s on a reset database
  at both refs, twice in a row, and in the second full run (209 passed).
  Same family as U01 S8: state accumulated by a full run. The ojs PR's own
  CI run 34683529824 (21 min, red) fits it, its per-test detail being
  unreachable without a token. **Watch condition**: a second full-run
  incident, or a red on CI's fresh database; then read the table's own
  fetches in a retained trace (`--trace retain-on-failure`) before the
  opener re-presses. **Tripped 2026-09-13** (U05 revision session, the
  second OJS final of the day on the database the first had used,
  `.reports/U05/final-run-ojs-attempt2.log`: the "Author Response" table
  not found for 30 s, one of two reds in 209). **Red again on a reset
  database** the same day: the third OJS final, run right after
  `fleet-prep --reset --apps ojs`, red on U30 S4 alone (208 passed,
  `.reports/U05/final-run-ojs-attempt3.log`, this time the co-author
  row's "More Actions" button re-attaching for the whole 180 s test
  timeout, the second variant above), so the used-database reading no longer holds: it is a
  four-worker full-run class on this VM: red in four of the seven OJS
  finals of 2026-09-13 (attempts 2, 3, 6 and 7, both variants,
  `.reports/U05/final-run-ojs-attempt{2,3,6,7}.log`), the one red of 209
  in the last. Next step as above: a retained trace of the table's fetches.
- **Participants menu still open after the impersonation return** (U01
  S7, OJS, once). In the fourth OJS final of the U05 revision session
  (2026-09-13, four workers, `.reports/U05/final-run-ojs-attempt4.log`)
  the assertion that the Participants panel's menu holds no item after
  "Login As" and the return found two items for 10 s; the only red of
  209, the same test green in the three finals before it. **Tripped the
  same day**: the fifth final, on the same database (used by the two
  finals before it), red on the same assertion alone
  (`.reports/U05/final-run-ojs-attempt5.log`); the assertion is the
  second press of the Editor's own "More Actions" button meant to close
  the menu, so under load the press lands while the panel re-renders and
  the menu stays open. Red again in the sixth final, on a reset database,
  and alone right after it (`.reports/U05/u01s7-rerun-0913.log`), so not
  a used-database class. **Diagnosed and fixed 2026-09-13** (probe record
  `.reports/U05/diag-u01s7.md`): the step is `UsersRolesMenu.close()`
  on the Users & Roles row menu, and the race is the page object's: the
  bundled headlessui MenuButton moves focus into the menu two animation
  frames (23–41 ms) after the click and handles Escape only there, so
  an Escape sent to the page inside that window hits the button and is
  ignored; the suite's open, two expects and close run in about the
  same 20–40 ms, so load tips it. The OJS `close()` and OPS
  `closeMenu()` now press Escape on the menu element itself (focus
  first); green alone on both (`.reports/U05/u01s7-rerun2-0913.log`,
  `.reports/U05/ops-u01-closemenu-0913.log`). **Watch condition**: the
  hardened close reds again.
- **Enroll-reviewer form's "This field is required." not shown under
  load** (U27 S4, OJS, once). In the same 2026-09-13 second OJS final
  (`.reports/U05/final-run-ojs-attempt2.log`, U05 revision session, four
  workers, a used database) the "Add Reviewer" press on the empty
  "Enroll Existing User" form showed no "This field is required." for
  30 s; green alone in 14 s on the same database
  (`.reports/U05/u27s4-rerun-0913.log`). **Watch condition**: a second
  sighting; then retain a trace to see whether the press reached the
  server or the form re-rendered.
- **ORCID connect popup not arriving under load** (U04 S2, OJS, once).
  The `waitForEvent('popup')` after the profile's connect button ran to
  the 60 s test timeout while three suites shared the VM (2026-09-12,
  merge of companion `13274`, `.reports/sync/merge13274-ojs.log`); green
  alone in 5.5 s. **Watch condition**: a second incident, or one at four
  workers alone on the VM.
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
