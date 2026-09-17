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
the fix lands. A regression only the stable line shows (MAINTENANCE "The
stable line") names `stable-3_5_0` in its Apps cell and is re-run on that
line's fleet.

| Commit / PR | Surface | Apps | Reproduction | Reported | Note (one line) |
|-------------|---------|------|--------------|----------|-----------------|
| pkp/pkp-lib#13286 (tracking issue; introduced by pkp-lib `74a8d58571`, pkp/pkp-lib#12352 for issue #12347; fix PR #13288 open) | Upload wizard: step-1 "Cancel" after a revision upload no longer restores the previous file when a different user had renamed it (`cancel-file-upload` answers `status:false`) | OJS OMP OPS (shared lib/pkp; reproduced on OJS) | `checks/sync/pkp-lib-12352/cancel-restore.js`, MODE=main; fixed when `afterCancel` reads the original fileId and "Renamed by B.pdf" | 2026-09-07 (thread + DMs to @beaug, @jarda.kotesovec) | Cause: `Repository::edit()` logs the new file, so `PKPManageFileApiHandler::findMatchedLogEntry()` finds no entry with the original uploader's username plus the pre-revision name and fileId. Broken at `74a8d58571`, working at `4ddab4b9cf` (upstream-sync log 2026-09-07). Upstream re-filed it as pkp/pkp-lib#13286 (a pre-existing restore bug #12352 exposed; its Variant 2, the renamer revising, fails on 3.4 and 3.5 too); fix PR pkp/pkp-lib#13288 (`e07727add6`, plus ojs#5801 tests only) verified 2026-09-08 with the kept script at the PR head, MODE=main and MODE=other both restore fileId, name and uploader with `status:true` and leave no dangling log rows. Still reproduces 2026-09-14 at ojs `f0cde27fda` / pkp-lib `1967e76f38` with the kept script on a reset database (`.reports/sync/s14-12352/`: `afterCancel` fileId 2, `article-rev.pdf`, `status:false`; before that 2026-09-10 at ojs `8fc931bcf8`); #13288 still open at `5f995d86af`; still reproduces 2026-09-15 at ojs `c40cf7644c` / pkp-lib `7ea748823e` on a reset database (`.reports/sync/s15-12352/`: `status:false`, fileId 2 `article-rev.pdf` current); still reproduces 2026-09-16 at ojs `ae597ff9d9` / pkp-lib `b262d27b81` on a reset database (`.reports/sync/s16-12352/`: `afterCancel` fileId 2 `article-rev.pdf` current), #13288 still open at `5f995d86af`; still reproduces 2026-09-17 at ojs `c0ca4b3caf` / pkp-lib `efbba94ae7` on a reset database (`.reports/sync/s17-12352/`: `afterCancel` fileId 2 `article-rev.pdf` current), #13288 still open at `5f995d86af`. Delete the row when #13288 lands. |
| pkp/pkp-lib#13181 (commits `4d9ec3cbd0`, `aeac6f75cf`, 2026-09-16; no PR page) | Email-change links: (1) an account with roles in two journals lands on the site-level profile (`index/en/user/profile#contact`) after "confirm" or "reject" instead of the journal it asked in; (2) a pending request's "reject" link in the shape mailed before the change (`{journal}/invitation/decline`), one-language journal on a two-language site: "Confirm Decline Invitation" ends in a blank GET 500, request still pending | OJS today (shared lib/pkp; OMP and OPS pointers at `360badeef5` predate it and inherit it with their next bump) | `checks/sync/pkp-lib-13181/emailchange-links.js`; fixed when `s3.confirm.landing.url` and `s3.reject.landing.url` read `{A}/user/profile#contact`, and when `s4.chain` ends on the Contact tab with `s4.stillPending` 0 | 2026-09-17 (thread + DMs to @beaug, @jarda.kotesovec) | Report: `docs/reports/2026-09-17-pkp-lib-13181.md`. Cause: the email-change invitation is created without a journal (`BaseProfileForm::execute()`), so the new `Invitation::getContextPath()` answers `index` for it; the decline form's address takes the site path while its language segment follows the served journal. Weight minor (1) and low, transitional (2). Register entry in U03 for (1). Reproduced three times 2026-09-17 on OJS `c0ca4b3caf` / pkp-lib `efbba94ae7`, twice on a freshly reset database (`.reports/sync/s17-13181/`, `s17-13181b/`). Re-drive on OMP and OPS when their pointers pass `4d9ec3cbd0` (U03 A3 retires there then). |

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
  U26 S6 on OJS joined the list 2026-09-15 (the maintainer's second local
  8-worker run at the merged tips, `.reports/flake-local/run2.log`: the
  new-round wizard's composer mask still up after 30 s), green alone 2 of 2.
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
  alone in 5 s and in the second full run; U40 S4 red on OMP in the first
  U06 revision final 2026-09-13, green alone in 5.1 s. **Watch condition**: a
  hardened test reds again with retries exhausted.
  **U40 S4 on OMP, mechanism found 2026-09-15** (a retained trace,
  `docs/reports/2026-09-15-flake-investigation.md`): `WorkflowPublicationForm`
  is one component instance for every Publication page, and on a page
  change it re-fetches the form without clearing the one on screen, so
  the previous page's form stays editable until the fetch lands and then
  resets. The test's fill and blur ran on the stale Title & Abstract form
  18 ms before the re-fetch landed; the PUT carried the seeded abstract.
  Patch: `docs/reports/2026-09-15-ui-library-publication-form-key.patch`
  (a fresh component per Publication section; the earlier
  `...-publication-form-clear.patch` kept the instance and cleared the
  form instead); the A/Bs are in the report.
  **Merged upstream 2026-09-15** (ui-library `70b0892042`): a section
  switch mounts a fresh form. Once the sync baselines carry it, the U40
  `blur()` before Save and app-changes row 9 (c) can be revisited.
  The U40 OMP file keeps traces on failure since 2026-09-15.
  **Baselines carry `70b0892042` since 2026-09-16** (sync); the U40 OMP
  `blur()` stays (a harmless commit), app-changes row 9 (c) is closed on
  the tips, (a) and (b) stay open.
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
  the OJS re-run the same day; seen a second time 2026-09-13 (U04 final
  run, `.reports/U04/final-run-ojs-run1-red.log`), green alone in 14.7 s.
  Watch condition tripped 2026-09-13; **hardened 2026-09-14**: the two
  awaiting indicators share one accessible name ("Awaiting Response from
  the reviewer", the reviewer's name lives only inside the opened
  popover) and the submission's review assignments come back in no
  fixed order (`reviewAssignment/Collector.php` has no `ORDER BY`), so
  the class is "unordered same-status indicators", not a render race;
  `EditorialDashboardPage.openActivityPopoverFor()` now waits for the
  row's expected indicator count, opens the candidates in turn and
  returns the popover naming the reviewer (OJS S9's two Julia legs;
  the OMP S9 already tolerated either order). Green alone on OJS and OMP
  (14 s each). Seen 2026-09-15 in the maintainer's first local 8-worker run
  at the merged tips (`.reports/flake-local/run1.log`) at an earlier point:
  the search for the tagged row after the reviewer's accept found nothing
  in 30 s (the hardened opener was not reached); green alone 2 of 2.
  **Watch condition**: a red with the hardened opener.
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
  hardened press reds again with its retry exhausted. **Seen locally on
  OMP 2026-09-13** (U24 revision session, the first OMP final at four
  workers, `.reports/U24/final-run-omp-attempt1.log`: U21 S6's rail
  still reading "2 Details" for the 44-poll wait on "Contributors" after
  Continue, the one red of 214; the class's first local and first OMP
  sighting, beside U04 S10's OMP entry below).
  **Mechanism found 2026-09-15** (`docs/reports/2026-09-15-flake-investigation.md`):
  the step rail (`Steps.vue`) animates a 500 ms scroll to the page title
  after every step change; under a janky main thread Playwright's
  two-frame stability check passes mid-animation, the mouse-down lands on
  Continue, the animation's final jump moves the page and the mouse-up
  lands in the abstract's editor iframe (Playwright validates only the
  first pointer event of a click). Probe at 6× CPU throttle: 11 of 24
  presses lost on the stock bundle, 0 of 24 with the reduced-motion patch
  (`docs/reports/2026-09-15-ui-library-steps-reduced-motion.patch`, for
  ui-library upstream; the preferred variant replaces the plugin with
  native scrolling and a stylesheet rule, `2026-09-15-native-scroll-*.patch`,
  same result); the harness now passes `reducedMotion` to the
  `asUser` contexts, which it never had. The `pressUntil` retry stays
  until the patch lands. **Merged upstream 2026-09-15** (ui-library
  `393dd28952`/`d5d7017074`, pkp-lib `b262d27b81`, ojs `e0e0275a55`, omp
  `6eb3b935ad`, ops `fb72f079ba`): the plugin is gone and reduced motion
  means an instant jump (decided per call in `useScrollTo` since the
  same-day follow-up: a global `scroll-behavior: smooth` rule broke the
  Cypress suite's own scrolls; verified here at the merged tips: the
  scroll animates without the preference, jumps with it, the throttled
  probe loses 0 of 24 presses, U21 16 of 16). Once the sync
  baselines carry these, `pressUntil()` can go back to a single press.
  **Watch condition**: a lost press at tips carrying the merge.
  **Seen on a footer button
  without the bounded retry 2026-09-15** (sync session, the second OJS
  final at four workers on a reset database,
  `.reports/sync/final-run-ojs-attempt2.log`): U22 S2's "Save for Later"
  press on the Details step, issued right after `continueTo('Details')`
  returned, left the wizard on "Make a Submission: Details" for the 45 s
  wait for the "Saved for Later" heading (the error context shows the
  step still current and the button still offered), one of two reds in
  216. `SubmissionWizardPage.saveForLater()` presses once; the next
  step is the same `pressUntil()` shape behind it. Green alone in 14.1 s right after (`.reports/sync/s15-ojs-reds-alone2.log`) and in the traced third final (229 passed). **Baselines carry the merge since 2026-09-16** (sync: ojs `ae597ff9d9`, omp `0ec98a508`, ops `9ce633ee1d` with pkp-lib `b262d27b81` and ui-library `977e460c`, the per-call reduced-motion follow-up); `pressUntil()` stays as a content-verified bounded retry, which presses again only when a press was lost, so the watch condition above is live and a lost press shows as the retry firing.
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
- **The Notify window's template body never landing in the editor under
  load** (U41 S3, OJS, once). `PublicationScreen.notifyParticipant()`
  (`apps/ojs/playwright/pages/PublicationMetadataPages.js`, U40's helper,
  U41 S3's positive mail control) selects "Discussion (Submission)", waits
  for the template fetch, then waits 30 s for a TinyMCE editor inside
  `form#notifyForm` that is initialized and non-empty; in the U41 revision
  session's second OJS final at four workers on a reset database
  2026-09-16 (`.reports/U41/final-run-ojs.log`, the one red of 235, the
  13 serial tests skipped behind it) the window was open with the template
  selected and the fetch answered, but the editor's iframe held one empty
  paragraph for the whole wait (the error context). Green alone in 10 s
  right after (`.reports/U41/rerun-ojs-s3.log`), green in the day's first
  OJS final and in every author run. Second sighting 2026-09-16, the U43
  revision's first OJS final at four workers on a reset database (the one
  red of 236, `.reports/U43/final-run-ojs-attempt1.log`, the same
  `waitForFunction` timeout at the same line); third sighting the same
  session's second OJS final on a reset database, from U41 S1's mail
  control through the same helper (`.reports/U43/final-run-ojs.log`, the
  one red of 236, both times green alone right after,
  `rerun-ojs-s3.log` and `rerun-ojs-s1.log`). **Watch condition met, hardened
  2026-09-16** (sync session): `notifyParticipant()` waits 15 s for the
  template in the box and, when that runs out, fires the template
  select's change handler again, awaits its fetch and waits 30 s more (a
  content-verified bounded retry, the pattern above); U41 S1 and S3 green
  alone with it (`.reports/sync/s16-alone-ojs.log`, 11.0 s and 7.9 s).
  **Watch condition**: the hardened helper reds again with its retry
  exhausted.
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
  OPS and OJS. The OMP twin, left without it, red the same way in the
  sync session's OMP final at four workers 2026-09-14
  (`.reports/sync/final-run-omp.log`, the one red of 214; green alone in
  7.7 s) → hardened the same day with the same bounded retry (green
  alone twice). **Watch condition**: a hardened leg reds again with its
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
  did not cover it, so the leg needs a second look. Tripped again the same
  day (U22 revision session, the second OJS final at four workers,
  `.reports/U22/final-run-ojs-attempt2.log`: the same tab, 63 polls, the
  one red of 212), and a third time (U24 revision session, the first OJS
  final at four workers on a reset database,
  `.reports/U24/final-run-ojs-attempt{1,2}.log`: one of two reds in 216,
  in both OJS finals of that session). Green in the sync session's OJS final at four workers 2026-09-14 (229 passed, traces retained).
  The hottest single flake on CI (23 first-attempt reds in nine days,
  `docs/reports/2026-09-15-ci-flake-tally.md`), never with a trace of the
  failing attempt; since 2026-09-15 the U28 file keeps traces on failure
  (`test.use({trace: 'retain-on-failure'})`), so the next CI red carries
  one. The mechanism is not the wizard's scroll animation (a legacy jQuery
  page); read the trace before hardening again.
  **Tripped again 2026-09-15** (sync session, the first OJS final at four workers on a reset database with the perf round-2 harness and `persistent = On`, `.reports/sync/final-run-ojs.log`: the same `aria-disabled="true"` tab for 63 polls after the hardened accept, one of three reds in 216; green alone in 45.9 s, `.reports/sync/s15-ojs-reds-alone.log`). Red again in the second OJS final the same day (`.reports/sync/final-run-ojs-attempt2.log`, one of two reds) and then **red alone** on that used database (`.reports/sync/s15-ojs-reds-alone2.log`, 1.2 min: the reminder-link leg's accept, the `2. Guidelines` tab disabled for 63 polls), the class's first alone red; green in the traced third final on a reset database (229 passed, 17.1 min) so still no trace, and green first try on CI the same day (pkp-e2e run 34952057769, ojs run 34956195225). Next step unchanged: a retained trace of the accept POST from a red run.
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
  in the last, and in the fourth OJS final of the U22 revision session
  the same day (`.reports/U22/final-run-ojs-attempt4.log`, the table not
  found for 30 s, one of two reds in 212), and in the first OJS final of
  the U24 revision session the same day, on a reset database
  (`.reports/U24/final-run-ojs-attempt1.log`: the co-author row's "More
  Actions" button detached and re-attached until the browser closed, one
  of two reds in 216; the second OJS final of that session red the same
  way, `.reports/U24/final-run-ojs-attempt2.log`, and red alone on that
  used database afterwards, the button re-attaching until the test
  timeout, `.reports/U24/ojs-reds-alone.log`, while U28 S10 went green
  alone beside it). Next step as above: a retained trace of the table's
  fetches. Green in the sync session's OJS final at four workers
  2026-09-14 (229 passed, run with `--trace retain-on-failure` for exactly
  this class; no trace to read yet). **Red again 2026-09-15** (U25
  revision session, the first OJS final at four workers on a reset
  database, `.reports/U25/final-run-ojs-attempt1.log`: the co-author
  row's "More Actions" button detached and re-attached for the whole
  180 s test timeout, one of two reds in 216; red alone the same way on
  that used database afterwards, `.reports/U25/rerun-ojs-u30s4.log`,
  3.0 min). **Red again 2026-09-15 evening** (U40 revision session, the
  first OJS final at four workers on a reset database,
  `.reports/U40/final-run-ojs-attempt1.log`: the same button detached and
  re-attached until the browser closed at the 180 s timeout, the one red
  in 221 with the 13 serial tests skipped behind it).
- **Login smoke's profile probe landing on the login page under load**
  (shared `login.spec.js`, OJS twice and OMP once). In the sync session's first OJS
  final at four workers 2026-09-15 (a reset database, the perf round-2
  harness and `persistent = On` for the first time on the VM,
  `.reports/sync/final-run-ojs.log`) the smoke's loop over the seeded
  personas signed `reader.rosa` in through the form (the page left
  `/login`) but the request-context probe of `/index.php/index/user/profile`
  answered with the login page (`…/login?source=%2Findex.php%2Findex%2Fuser%2Fprofile`),
  so the smoke red and the 13 serial tests behind it did not run; green
  alone in 27.5 s (`.reports/sync/s15-ojs-reds-alone.log`), and green on
  CI at the same tree and tips. **Watch condition**: a second sighting;
  then read whether the probe's cookie jar carried the fresh session
  cookie (the smoke closes and reopens a context per persona).
  **Tripped 2026-09-15** (U25 revision session, the first OJS final at
  four workers on a reset database at the day's new tips,
  `.reports/U25/final-run-ojs-attempt1.log`: `reader.rosa` again, the
  same `profile probe landed on login`, one of two reds in 216, the 13
  serial and solo tests skipped behind it; green alone in 16.1 s,
  `.reports/U25/rerun-ojs-login.log`). **Third sighting the same day, the
  first on OMP** (the U25 session's second OMP final at four workers on a
  reset database, `.reports/U25/final-run-omp-attempt2.log`: `reader.rosa`
  again, the one red of 216; green alone right after,
  `.reports/U25/rerun-omp-login.log`). Three reds in one day at the
  day's new tips and the perf round-2 harness, always `reader.rosa`, the
  last persona of the loop. **Fourth sighting** (the U29 revision
  session's first OJS final at four workers on a reset database the same
  evening, `.reports/U29/final-run-ojs-attempt1.log`: `reader.rosa` again,
  the one red of 220, the 13 serial tests skipped behind it; green alone
  in 15.5 s, `.reports/U29/rerun-ojs-login.log`). **Fifth sighting** (the
  U40 revision session's second OJS final at four workers on a reset
  database the same evening, `.reports/U40/final-run-ojs-attempt2.log`:
  `reader.rosa` again, the one red of 221, the 13 serial tests skipped
  behind it; green alone right after, `.reports/U40/rerun-ojs-login.log`).
  **Sixth sighting, the second on OMP** (the U41 revision session's OMP
  final at four workers on a reset database 2026-09-16,
  `.reports/U41/final-run-omp.log`: `reader.rosa` again, the one red of
  218, the 11 serial tests skipped behind it; green alone in 14.3 s,
  `.reports/U41/rerun-omp-login.log`, the serial project green alone
  right after, `.reports/U41/rerun-omp-serial.log`). **Instrumented 2026-09-16** (sync session): when the probe lands on
  the login page the smoke writes one `login smoke:` line to the run log
  with the probe's status and URL, the page's URL and the context's
  cookie jar (names and value lengths), attaches it to the test, and
  probes once more a second later; a second miss still reds the test, so
  the next sighting carries the jar read and says whether the session was
  merely late. Read at the tips: the form sign-in regenerates the session
  id (`PKPSessionGuard::updateSession()`, `migrate(true)`), and the
  harness sets no `PHP_CLI_SERVER_WORKERS`, so each worker's `php -S`
  serves requests one after another and a cross-process session-write
  lag is not the mechanism. **Watch condition**: the log line at the next
  sighting.
- **"Create New Version" dialog's stage select empty under load** (U49
  S6, OJS, once). The dialog opened with its "Publication Stage" options
  listed but the select's value "" for the 10 s wait for "VoR" (the
  published version's stage, expected preselected) in the same 2026-09-15
  OJS final (`.reports/sync/final-run-ojs.log`, error context in
  `pw-out-final-ojs/U49-publish-schedule-and-v-8f1b4-…`); green alone in
  9.4 s. The opener waits for the select to be visible, not for the
  form's value to arrive. **Tripped 2026-09-16, the first on CI and on
  OPS** (pkp-e2e push run 35126077430 at `00be9dc`, the OPS job red on
  U49 S6 on both attempts, 142 passed and 10 did not run: the second
  "Create New Version" dialog of the test, opened right after "Author
  Original 1.1" appeared, had no checked option in its stage select for
  the 10 s wait for "Author Original (AO)"; green on the VM the same day
  in the OPS final and alone; the U49 push's own run 35115933110 the
  day before was green on OPS with the same test, so a timing class, not
  a fresh-install fact). The artifact's error context (both attempts,
  `.reports/sync/s16-ci-ops-artifacts/`): the source combobox on "Author
  Original 1.1", the "Publication Stage" combobox listing "Author
  Original (AO)" with no option selected, "Revision Significance" listing
  both with none selected, a `status` element still in the dialog, so the
  form's values from the source version had not arrived in 10 s. **Hardened the same day**: the three
  openers (OPS `createNewVersionViaDialog()`, OJS
  `PublishScreen.openCreateVersionDialog()`, OMP
  `openCreateVersionDialog()`) give the stage select up to 15 s to carry
  a value before returning, without failing a form that preselects
  nothing; U49 S6 green alone on the three apps
  (`.reports/sync/s16-rerun-{ops,ojs,omp}-u49s6.log`). **Watch
  condition**: the read reds again behind the hardened opener; then the
  CI artifact's error context says whether the value ever arrives on a
  fresh install.
  **Watch condition tripped 2026-09-17** (U11 feature session, the Mac,
  OPS final attempt 2 on a reset database at auto workers,
  `.reports/U11/final-run-ops.log`): behind the hardened opener the same
  read redded with `element(s) not found` for the checked stage option,
  and the error context
  (`pw-out-final-ops/U49-publish-schedule-and-v-2e450-…/error-context.md`)
  shows the CI artifact's shape again: the source combobox on "Author
  Original 1.1", "Publication Stage" listing "Author Original (AO)" with
  no option selected, "Revision Significance" with none selected, a
  `status` element still in the dialog, so the value did not arrive in
  15 s + 10 s either; green alone in 2.4 s right after
  (`.reports/U11/alone-ops-u49s6.log`). Three sightings now, one on CI:
  the source-version values not arriving under load is the class, not
  the wait's length; for the maintenance session to read the dialog's
  fetch for the second version. **Fourth sighting 2026-09-17** (U14
  feature session, the VM, OMP final attempt 3 on a reset database at
  four workers, `.reports/U14/final-run-omp-attempt3.log`, the one red of
  233): U49 S4's first "Create New Version" dialog, the stage select ""
  through the 10 s wait for "VoR" behind the hardened opener; the first
  sighting on OMP and in S4, so the class is the dialog's, not S6's.
- **CI worker server refusing connections during the login smoke** (OJS
  job, once). The U06 push's run 34773613958 (2026-09-13, `main`) failed
  its OJS job on the shared login smoke alone: `socket hang up` on the
  scenario API and `net::ERR_CONNECTION_REFUSED` at `127.0.0.1:8000`
  on the retry too, so the worker server had died or never answered;
  the OMP and OPS jobs of the same run passed, and the U04 push's run
  34768503126 an hour earlier was green on all three. No local
  counterpart. **Watch condition**: a second CI job lost to a refused
  worker port; then read the job's server log step.
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
- **A page load hanging under desktop load** (U04 S6, OMP, once). `page.goto`
  to the scratch press's `/orcid/about` ran to the 60 s test timeout in the
  second U06 revision local final 2026-09-13 (load 15–19 on the Mac from
  the desktop, `.reports/U06/final-run-omp-run2-red.log`); green alone in
  5.4 s. **Watch condition tripped 2026-09-13** (U22 revision session,
  the first OJS final at four workers on the VM,
  `.reports/U22/final-run-ojs-attempt1.log`: U05 S6's `page.goto` of the
  emailed unsubscribe link on worker 8002 ran to the 240 s test timeout,
  the one red of 212; green in the next full run, red the same way in
  the third and the fourth, `.reports/U22/final-run-ojs-attempt{3,4}.log`,
  three of four). The worker
  server's log settles where it hangs: the second `goto` of the link,
  right after the same browser's other tab signed in and was closed,
  never reaches the server (the journal's last request is the closed
  tab's dashboard poll, six seconds earlier), so it is the browser, not
  the app; the OMP incident above was not traced. Two of three OJS
  finals on the VM: the leg wants the closed tab's requests settled (or a
  fresh page) before the `goto`, U05's session to decide. **Seen again
  2026-09-16** (the U41 revision session's first OJS final at four
  workers on a reset database, `.reports/U41/final-run-ojs-attempt1.log`:
  U05 S6 to the 240 s timeout the same way, the one red of 235, the 13
  serial tests skipped behind it; the serial project green alone in
  32.2 s, `.reports/U41/rerun-ojs-serial.log`).
- **Submission wizard "Continue" not advancing under load** (U04 S10,
  OMP, once). The wizard's rail stayed on "2 Details" for the 20 s wait
  of `SubmissionWizardPages.continueTo()` after the Continue press in the
  first OMP final of the U22 revision session (2026-09-13, four workers
  on the VM, `.reports/U22/final-run-omp-attempt1.log`, the one red of
  210); green in the next full run (`.reports/U22/final-run-omp.log`).
  The same shape as the review wizard's accept leg above, on the
  submission wizard's own rail. **Watch condition**: a second incident;
  then `continueTo()` gets the same content-verified bounded retry.
  **Tripped 2026-09-13** (U24 revision session, the second OMP final at
  four workers, `.reports/U24/final-run-omp-attempt2.log`: U04 S10's rail
  on "2 Details" for the 20 s wait again, the one red of 214; the first
  OMP final of the same session had U21 S6 red on the same rail wait,
  `.reports/U24/final-run-omp-attempt1.log`, dated under the wizard-press
  entry above). **Hardened 2026-09-14**: OMP's `SubmissionWizardPages`
  gained a module-level `pressUntil()` in the OJS shape (an 8 s window
  per press, pressed again while the button is still offered, at most
  three times, then the 30 s wait) behind `continueTo()`, `openReview()`
  and `confirmSubmit()`; OPS's partial 5 s × 3 loop was replaced by the
  same helper on the same three methods. Green alone: OMP U04 S10
  (10.7 s), OMP U21 S6 (20.8 s), OPS U21 S6 (27 s). **Watch condition**:
  a hardened press reds again with its retry exhausted at four workers.
- **Author's save of a new version answered 401 on a used database**
  (U40 S3, OMP, local). After a day of repeats on one database, the
  author's Prefix save on the manager's fresh version got
  `user.authorization.accessibleWorkflowStage` ("You don't currently have
  access to that stage of the workflow") and the test's response wait ran
  out: 9 of 9 red across two bundles (stock and the keyed publication-form
  patch) on 2026-09-15, 6 of 6 green on both right after `reset:omp`, so
  database state, not the build. Not seen on CI (fresh database). **Watch
  condition**: a red on CI or on a reset database; then read which stage
  assignment the author's permission tick lands on.
- **Edit Review window's file checkbox re-ticked under load** (U27 S6,
  OMP, once). In the "Files To Be Reviewed" grid of the Edit Review
  window, the test unticks both files, reads "No Files Selected", then
  `check()`s the first box back: the click landed while the legacy grid
  was re-rendering ("element is not stable" twice before the click) and
  the readback found the box's state unchanged, "Clicking the checkbox
  did not change its state" (2026-09-15, U25 revision's OMP final at four
  workers, `.reports/U25/final-run-omp.log`, error context
  `pw-out-final-omp/U27-reviewer-assignment-Re-4ce6a-…/error-context.md`);
  green alone in 21 s on the same used database. **Watch condition**: a
  second incident; then wait for the grid's reload to settle (the
  `waitForJQueryIdle` helper) between the unticks and the re-tick.
- **Review Details window's star-rating radio not registering the click
  under load** (U27 S9, OMP, once). `ReviewerAssignmentPages.rateReview()`
  (`apps/omp/playwright/pages/ReviewerAssignmentPages.js:352`) `check()`s
  the "5 out of 5 stars" radio in the "Review Details:" window and the
  readback found it unchanged, "Clicking the checkbox did not change its
  state" (2026-09-16, the U49 revision session's first OMP final at four
  workers on a reset database, `.reports/U49/final-run-omp-attempt1.log`,
  the one red of 221 with every U49 test green; error context
  `pw-out-final-omp/U27-reviewer-assignment-Re-ee493-…/error-context.md`);
  green alone in 33 s (`.reports/U49/rerun-omp-u27s9.log`). The same
  symptom as the U27 S6 checkbox entry above, on a legacy window control.
  **Tripped 2026-09-16** (sync session, the OMP final at four workers on a
  reset database at the day's tips, `.reports/sync/final-run-omp.log`:
  the same "Clicking the checkbox did not change its state" on the "5 out
  of 5 stars" radio, the one red of 221); **hardened the same day**:
  `rateReview()` waits for the window's jQuery to go idle, then presses
  and re-checks the radio's state in a bounded retry (at most three
  presses) and asserts it checked before the save is awaited; green alone
  twice (`.reports/sync/s16-rerun-omp-u27s9-{1,2}.log`, 48.8 s and
  47.7 s). **Watch condition**: the hardened press reds again with its
  retry exhausted.
- **New reviewer missing from the Reviewers list under load** (U01 S6,
  OMP, once). After "Create New Reviewer" in the Add Reviewer window, the
  review stage's Reviewers panel did not list the throwaway reviewer's
  name for the 30 s wait (2026-09-15, the U25 revision session's third
  OMP final at four workers on a reset database,
  `.reports/U25/final-run-omp-attempt3.log`, the one red of 216; error
  context `pw-out-final-omp-attempt3/U01-login-and-sessions-…/error-context.md`);
  green alone in 9.1 s on the same used database
  (`.reports/U25/rerun-omp-u01s6.log`). Same family as the reviewer
  dashboard and Add Reviewer classes above: a list fetched again after
  the window closes. **Watch condition**: a second incident; then read
  whether the panel's reload after the window's save is awaited.
  **Second incident 2026-09-17** (U11 feature session, the Mac, OMP
  final attempt 1 on a reset database at auto workers,
  `.reports/U11/final-run-omp-attempt1.log`, the one red of 225), at a
  different step: the active window's "Workflow:" heading not visible
  in 20 s (`pw-out-final-omp-attempt1/U01-login-and-sessions-…/error-context.md`);
  green alone in 8.5 s (`.reports/U11/alone-omp-u01s6.log`) and the
  second full run green (236). The watch condition is met; the read of
  the panel's reload, and now of the workflow window's open under
  load, is the maintenance session's.
- **Author's Title & Abstract section empty after the manager's publish**
  (U40 S3, OJS, once, local). After the manager published, the author's
  reload fetched the submission and the publication (both 200 in worker
  4's server log, `.reports/flake-local/server-logs-run3/server-8004.log`)
  but the section under "Publication: Title & Abstract" showed neither
  the "This version has been published and can not be edited." notice nor
  the form for 30 s, and no `_components/titleAbstract` request followed
  in 37 s (2026-09-15, `.reports/flake-local/run3.log`,
  `results-run3/U40-*/error-context.md`). The section's items are empty
  while `selectedPublication` is null (`useWorkflowConfigOJS._getItems`);
  green alone 3 of 3 and in the other three runs. The OJS U40 file now
  keeps traces on failure (`test.use({trace: 'retain-on-failure'})`, like
  the OMP one). **Watch condition**: a red with the trace; then read
  whether the publication fetch was aborted by a second `selectPublicationId`.
- **Dashboard user menu not visible 10 s after sign-in under load** (U01
  S1, OJS, once). The sign-in landed on `/dashboard/editorial` (the URL
  committed) but `[data-cy="app-user-nav"]` was not visible within the
  default 10 s (2026-09-15, the maintainer's second local 8-worker run at
  the merged tips, `.reports/flake-local/run2.log`); green alone 2 of 2.
  **Watch condition**: a second sighting; then give the landing a 30 s wait.
- **Dashboard heading "(0)" after a reload under load** (U23 S7, OJS,
  once). After `page.reload()` of the sorted address on a scratch journal
  holding 31 submissions the heading read "Active submissions (0)" for the
  whole 30 s wait (2026-09-15, the maintainer's first local 8-worker run
  at the merged tips, `.reports/flake-local/run1.log`; no artefacts kept,
  the next run wiped test-results); green alone 3 of 3. **Watch
  condition**: a second sighting with test-results kept; then read the
  list request the reload issued.
- **OPS U40 S1's undo read red on the Mac only** ("edit the title and
  abstract", `@smoke`; deterministic on the Mac, 2026-09-16/17). After
  `ControlOrMeta+z` in the Title editor the TinyMCE body reads "" instead
  of the restored title (spec line 263): red 3 of 3 for the U11 harness
  agent with and without its change (`.reports/U11/harness/pw-ops-u40-s1-unpatched/`),
  and in both U11 OPS finals on reset databases (`.reports/U11/final-run-ops-attempt1.log`,
  `final-run-ops.log`); the OJS and OMP S1 counterparts green on the Mac,
  and OPS green on CI (35017665886) and on the VM's final at the same tips
  (2026-09-16). A Mac-only class, so an OPS full run on the Mac reads
  146 of 147 by design until it is read; unverified hunch: Meta+z under
  headless Chromium on darwin against the keyed `WorkflowPublicationForm`
  (sync 2026-09-16). **Watch condition**: a red of this read on CI or the
  VM; until then the OPS full green on a Mac push is CI's.
- **Users & Roles "Email" dialog still open after "Send Email"** (U14 S5,
  OJS, once: 2026-09-17, the VM's first U14 final at four workers,
  `.reports/U14/final-run-ojs-attempt1.log`). The send request answered
  and the dialog was still counted 30 s later (the test's positive mail
  control, `UsersPage.sendEmail`); green in the second final the same day
  (255 of 255) and in the file's own runs. Watch condition: a second
  sighting; then the error context says whether the form re-rendered
  with a refusal or the close never ran.
- **Tasks dialog missing the report's task row** (U14 S5, the
  moderators' tasks: OJS twice, OMP once and OPS once, 2026-09-17, the
  U12 session's Mac full runs on reset databases at auto workers,
  `.reports/U12/final-run-ojs-attempt{1,2}.log`,
  `final-run-omp-attempt1.log`, `final-run-ops.log`). `expect(reportRow).toHaveCount(1)`
  reads 0 for 10 s while the comment's own task row is there (OJS spec
  line 647, OMP line 174); green alone on both apps the same day
  (`.reports/U12/alone-ojs-u14s5-u28s14.log`,
  `alone-omp-u01s6-u14s5.log`), green on the VM's finals and on CI
  (35200505897) at the same tree. A load-shaped read on the Mac; unread
  whether the report's job had not run yet or the dialog was read before
  its second fetch. Because the app project fails, the serial and solo
  projects are skipped on every such run, so a Mac full run's serial
  tests need a `--project=<app>-serial --no-deps` run of their own.
  Watch condition: a red on CI or the VM; until then a Mac full run
  reads N−1 on every app.
- **Local midnight** (the maintainer's overnight runs, 2026-09-13/14,
  `docs/reports/2026-09-14-suite-performance.md`). The app clock is UTC
  and the tests' is local: between 00:00 and 02:00 CEST every "today + N
  weeks" due-date assertion (U27 S1, S7, S8, S12, S20; U28 S10; U29 S1,
  OJS and OMP) reads a day off. CI runs in UTC and never sees it; a
  night run on the Mac or the VM does. **Watch condition**: a red of this
  shape outside that window; then the tests' date helper computes in UTC.
- **Review-forms reads under load** (U29 S4, S7, S9, OJS; once each in the
  maintainer's overnight 8-worker runs 2026-09-13/14, same report: S4 the
  guidelines typed by the manager missing for the reviewer, S7
  `ReviewFormsList.rowCounts()` on a half-drawn row, S9 green alone; the
  `rowCounts()` cell wait sits on the unmerged `perf/test-side` branch).
  S9 again 2026-09-15 in the maintainer's fourth local 8-worker run at the
  merged tips (`.reports/flake-local/run4.log`: the reviewer's step-3
  recommendation select read no options), green alone 2 of 2.
  **Watch condition**: a red at four workers on the VM or on CI.
- **A `php -S` worker segfault** (once, OJS run 33106002377, 2026-08-27,
  in-flight request most likely `GET /api/v1/_submissions/viewsCount`).
  The cascade it used to cause is fixed by the server restart loop
  (harness.md "Runtime model"), so a recurrence now costs one test. It was
  never pinned; if it recurs, add core-dump capture to CI before
  diagnosing.
- **U01 S1's dashboard landing right after a cold bootstrap** (once, OJS,
  2026-09-17 on the VM: an `@smoke`-only run at four workers on a database
  reset seconds before; `page.waitForURL(/dashboard/editorial/)` timed out
  at 15 s after the journal's login address, 38 of 39 green; the file
  green alone minutes later, 9 of 9). **Watch condition**: a second
  sighting in a full run or on CI.

## Companion branches — pkp-e2e branches waiting on app PRs

One row per branch prepared for a developer's open OJS, OMP or OPS pull
request (MAINTENANCE "A developer's PR fails the suite"), named exactly
like the developer's branch. State: `investigating` (reproducing, no
verdict yet) · `ready` (pushed, green at the PR ref, developer told) ·
`merged` (only while the sync line is written; then the row is deleted).

| App PR | Branch | State | Since | Note (one line) |
|--------|--------|-------|-------|-----------------|
