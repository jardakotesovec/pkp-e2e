# After "Publish" (OMP) or "Post" (OPS) the workflow still shows the book or preprint as unpublished until the page is reloaded

Regression. OMP and OPS with lib/ui-library at `cab09538`, the head of
pkp/ui-library#853 (open, for issue pkp/pkp-lib#13359, driven 2026-09-23
before its merge; OMP at `7f9455d5a`, OPS at `15f0b6e0bd`). OJS at
`802202cb3e` with the same lib/ui-library shows it on its second path
(below). Not present at the tip's lib/ui-library `2034439a`. OMP's and
OPS's own pointers (`977e460c`, `5d138aa9`) predate the change: they meet
it with their next lib/ui-library update. stable-3_5_0: does not carry
the change. Tracked in the companion row `optimize-table-reloads` in
`docs/tracking/ci-triage.md`. Temporary: delete once acted on.

**Update 2026-09-23 (fixed in the PR before its merge).** The PR head is
now `51f0c727`, which adds `markDataChanged?.()` to
`onVueFormSuccess()`, the smallest fix proposed below. Verified on OJS
on a fresh reset: the kept check reads `stale: false` on both paths, and
the workflow refetches the submission and publication after the close.
The app PR checks at `51f0c727` are green on all three apps, including
OMP's and OPS's formerly red publish scenarios (ojs#5444 run
35881450909, omp#2471 run 35882950730, ops#1412 run 35883039899).
Nothing left to do; this report is deleted when the PR merges.

## Summary

In OMP, pressing "Publish" and confirming publishes the book, but the
workflow does not update. It still reads "Status: Unscheduled" with
"Preview" and "Publish", and "Unpublish" appears only after a page
reload. OPS's "Post" behaves the same, and so do both apps' future-dated
schedules, where "Unschedule" never appears. In OJS the usual path, which
goes through "Review Publishing Details" first, still updates. The same
confirmation opened directly, on a second press of "Schedule For
Publication", does not update. Before the change the workflow updated as
soon as the confirmation closed.

## Impact

Every editor who publishes, posts or schedules in OMP or OPS meets it,
every time. They confirm, the confirmation closes, and the screen says
nothing happened, with the same "Publish" (or "Post") button still
offered. The book or preprint is published (a reload shows it), but the
editor has no sign of that on the workflow and is likely to press again
or conclude that publishing failed. In OJS it affects the editor who
backs out of the confirmation once and then publishes. Major: it hits the
core publishing action in two of the three apps on every use and misleads
about whether the action happened. A page reload shows the truth.

## Steps to reproduce

Preconditions:

- A fresh OMP install with its default languages.
- A submission in the production stage with a publication format ready
  to be published (as the suite seeds it: accepted, sent to production).
- A Press Manager or editor assigned to the submission.

1. As the editor, open the submission's workflow and go to
   "Publication".
2. Press "Publish" at the top right. The confirmation window, titled
   "Schedule For Publication", opens.
3. Press the window's "Publish".
4. Wait for the window to close. Look at the status line and the buttons
   at the top right.
5. Reload the page and look again.

For OPS, the same with "Post". For OJS: press "Schedule For
Publication", confirm "Review Publishing Details", close the confirmation
without publishing, press "Schedule For Publication" again (the
confirmation opens directly), and press "Publish".

**Expected** (as before the change, and as the issue asks: something
changed in the window, so the page behind it reloads): after step 4 the
status reads "Published" and "Unpublish" is offered ("Unschedule" for a
future date; "Unpost" in OPS).

**Observed:** the publish request succeeds and the window closes. After
step 4 OMP still reads "Status: Unscheduled" with "Preview" and
"Publish", and no "Unpublish" appears within 30 seconds. In OPS no
"Unpost" appears. In OJS the page sends no request at all in the next
5 seconds and still reads "Status: Unpublished" with "Preview" and
"Schedule For Publication". After the reload in step 5 each shows the
published state.

Control: in OJS, publishing through "Review Publishing Details" and then
"Publish" does update the page. The panel's own save flags the window
slot that the confirmation then reuses, which is an accident of the
code, not a design.

## Cause

The confirmation is a legacy window (`PublishHandler`,
`lib/pkp/templates/controllers/modals/publish/publish.tpl`). It holds a
`<pkp-form>` that `pkp.registry.init` mounts as a separate Vue app, so
the new `inject('markDataChanged')` in `Form.vue` is `null` there. The
form saves through `$.ajax`, not `useFetch`, and sends no jQuery
`formSubmitted`. `AjaxModalWrapper.vue`'s `onVueFormSuccess()` closes the
window a second later with `closeModal({formId, data})` without marking
it changed. `closeSideModalById()` therefore hands `onClose`
`{dataChanged: false}`, and the workflow's wrapper,
`triggerDataChange(finishedData)` in `workflowStore.js`, returns without
reloading. Before the change, `onClose(returnData)` led to an
unconditional `triggerDataChange()`.

## Proposed fix

A proposal; the team decides.

- Smallest: in `AjaxModalWrapper.vue`'s `onVueFormSuccess()`, call
  `markDataChanged?.()` before closing, as the PR already does for the
  jQuery `formSubmitted`, `modalFinished` and `wizardClose` events. A
  Vue form's success inside a legacy window is a change. This covers
  every legacy window that closes on a Vue form's success, not only
  Publish.
- Alternatively, provide `markDataChanged` to Vue apps that
  `pkp.registry.init` mounts inside a side modal, so `Form.vue`'s own
  `success()` marks the window. That is broader, and it depends on the
  legacy mount knowing its modal level.

## Evidence

- The session's full suites with lib/ui-library at the PR head, on reset
  databases (`.reports/pr13359/omp-full-ui853.log`,
  `ops-full-ui853.log`, traces retained):
  - OMP red on U49 S1, S5, S9, S10 and S14 and on U40 S3 and S5, each
    waiting for "Unpublish" or "Unschedule" after the publish request
    answered OK.
  - OPS red on U49 S1, S5, S9, S10 and S15 and on U40 S3, S5 and S11,
    waiting for "Unpost" or "Unschedule".
  - The OMP snapshot after U49 S1's publish shows "Status: Unscheduled",
    "Preview" and "Publish".
- Controls on the same databases: the same spec files are green with
  lib/ui-library rebuilt at `2034439a` (OMP 38/38,
  `.reports/pr13359/omp-ctrl-base.log`; OPS 23/23, `ops-ctrl-base.log`).
  Rebuilt at `cab09538` again, OMP reds the same eight tests
  (`omp-pr-targeted.log`).
- OJS kept script (the direct path, part D):
  `PROBE_FEATURE=sync PROBE_AGENT=<agent> node bin/probe.js ojs shared/playwright/checks/sync/ui-library-853/publish-stale.js`.
  Fixed when `result-ojs.json` `.D.stale` is `false`. After
  (`cab09538`): `.reports/sync/rr16/`, `stale: true` with no GET after
  the close. Before (`2034439a`): `.reports/pr13359/publish-before/`,
  `.P.stale` and `.D.stale` both `false`.
- Found by the regression read (`.reports/sync/rr16/suspicions.md`, S2;
  S1, the panel path, not reproduced) and by the OMP and OPS suites.
- Not driven by hand in OMP or OPS outside the suites. OMP and OPS
  carried 4 and 2 already-reviewed ui-library commits between their
  pointers and the PR's base; the control at `2034439a` includes those.
