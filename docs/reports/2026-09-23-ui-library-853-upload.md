# An author who closes "Upload revisions" after the first step does not see the uploaded file until the page is reloaded

Intention gap. OJS at `802202cb3e` with lib/ui-library at `cab09538`, the
head of pkp/ui-library#853 (open, for issue pkp/pkp-lib#13359, driven
2026-09-23 before its merge); OMP shows it too with lib/ui-library moved
to the same head. Not present at the tip's lib/ui-library `2034439a`.
OMP's and OPS's own pointers predate the change. stable-3_5_0: does not
carry the change. Tracked in the companion row `optimize-table-reloads`
in `docs/tracking/ci-triage.md`. Temporary: delete once acted on.

**Update 2026-09-23 (fixed in the PR before its merge).** The PR head is
now `51f0c727`: `workflowStore.fileUpload()` reloads unconditionally, as
proposed below. Verified on OJS on a fresh reset: the kept check reads
`stale: false`, and "Revisions Uploaded" lists the file right after the
close. OMP's U26 S4 passes in omp#2471's check (run 35882950730).
Nothing left to do; this report is deleted when the PR merges.

## Summary

The issue keeps one exception to "reload only when something changed":
upload windows always reload the table behind them when closed, because
the file is already uploaded after the first step. The author's "Upload
revisions" window no longer does. An author who attaches the revised file
and closes the window before the last step sees an empty "Revisions
Uploaded" panel, although the file is uploaded. Before the change the
panel listed it at once.

## Impact

It affects authors answering a revisions request who close the upload
window after the file step, which the window allows ("Close" in its
header). The file is stored. On the author's screen the panel says
nothing was uploaded, which invites a second upload
of the same file. A page reload shows the file. Minor: no
data is lost and a reload corrects the display, but an author with an
empty panel is likely to upload a second copy.

## Steps to reproduce

Preconditions:

- A fresh OJS install with its default languages.
- A submission in review on which the editor recorded "Request
  Revisions".
- The submission's author, signed in.

1. As the author, open the submission's workflow from "My Submissions".
   "Revisions Uploaded" is empty and "Upload revisions" is offered.
2. Press "Upload revisions". The upload window opens on its first step.
3. Choose the file's component ("Article Text"), attach a file, and wait
   until it shows as uploaded.
4. Close the window with "Close" in its header, without continuing.
5. Look at "Revisions Uploaded". Then reload the page and look again.

**Expected** (issue #13359: "File upload modals still reload the table
when closed, since a file can already be uploaded even if the upload is
closed before the final step completes"): after step 4, "Revisions
Uploaded" lists the file.

**Observed:** after step 4 the panel is still empty, and the page sends
no request after the close. After the reload in step 5 the panel lists
the file.

Control: with the same steps at the tip's lib/ui-library, the panel
lists the file right after the close. The same wizard opened from a file
panel's own upload button (`fileManagerStore.fileUpload`) still reloads
unconditionally in the PR.

## Cause

The PR changes `workflowStore.fileUpload()`
(`src/pages/workflow/workflowStore.js`), which the author's "Upload
revisions" uses. It used to close with `() => triggerDataChange()` and
now closes with `async (finishedData) => await
triggerDataChange(finishedData)`. `triggerDataChange()` now returns
without reloading when it receives `{dataChanged: false}`. The legacy
upload wizard stores its file through its own jQuery request, so nothing
flags the window as changed, and `closeSideModalById()` hands the close
`{dataChanged: false}`. The file panels' own upload (`fileManagerStore`)
keeps the unconditional `() => triggerDataChange()`, as the issue asks.

## Proposed fix

A proposal; the team decides.

- Smallest: in `workflowStore.fileUpload()`, call `triggerDataChange()`
  with no argument, as `fileManagerStore.fileUpload()` does.

## Evidence

- Kept script:
  `PROBE_FEATURE=sync PROBE_AGENT=<agent> node bin/probe.js ojs shared/playwright/checks/sync/ui-library-853/upload-stale.js`.
  Fixed when `result-ojs.json` `.U.stale` is `false`.
- After (lib/ui-library `cab09538`): `.reports/pr13359/upload-after/`.
  The panel has 0 rows after the close, no GET after it, and 1 row after
  a reload: `stale: true`.
- Before (lib/ui-library `2034439a`, same database, rebuilt):
  `.reports/pr13359/upload-before/`. 1 row right after the close, with
  `…/files`, `…/stages/3/tasks` and `…/emails/authorEmails` fetched:
  `stale: false`.
- OMP: the suite's U26 S4 ("author uploads a revision": "Upload
  revisions", first step, close, the file expected in the author's
  panel) red at the PR head and green at `2034439a` on the same database
  (`.reports/pr13359/omp-pr-targeted.log`, `omp-ctrl-base.log`). OJS's U26
  reloads the page before it looks, so it does not see this.
- Found by the session's full OMP run with lib/ui-library at the PR head
  (`.reports/pr13359/omp-full-ui853.log`). The regression read
  (`.reports/sync/rr16/suspicions.md`) had it as an unverified hunch
  ("no UI caller"), and the OMP test is that caller.
