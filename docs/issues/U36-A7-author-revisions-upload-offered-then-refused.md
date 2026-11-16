# An Author's "Upload" above "Revisions Uploaded" is refused until revisions are requested or the submission is accepted

- **Severity** low
- **Effort** medium
- **Kind** defect
- **Affects**
  - main: OJS, OMP
  - 3.5: OJS, OMP
  - 3.4: OJS, OMP (code; the older "Revisions" grid)
  - 3.3: OJS, OMP (code; the older "Revisions" grid)
- **Introduced** not traced; the older grid offered the upload on every round since at least [baad1adb92](https://github.com/pkp/pkp-lib/commit/baad1adb92d3c7924f2529af9fc4b939a0cc6330) (2016-03-07). The table that carries it on `main` and 3.5 came with `pkp/ui-library#386` for `pkp/pkp-lib#7495` · [6e950268](https://github.com/pkp/ui-library/commit/6e95026819e8a3d0852f2168341b8675807d1b1a) · 2024-07-18 · Jarda Kotěšovec (jardakotesovec)
- **Upstream** `pkp/pkp-lib#13048` (open) reports this as the third of three refusals (the other two are not covered here) and asks that the upload be allowed; `pkp/pkp-lib#8976` (open) reports it on 3.4 as the first of three remarks and suggests hiding the button
- **Tracked in** spec U36 [A7](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U36-submission-files.md#a7)
- **Checked** 2026-11-16, each branch's tip (the commits in Evidence)
- **Model** claude-opus-5-5

Update 2026-11-16: the refusal holds until the round has a "Request
Revisions", "Resubmit for Review" or "Accept Submission" decision; on
an accepted round "Upload" works. The proposed fix now also keeps
"Upload" on a press's round accepted straight from internal review.

## Summary

Above "Revisions Uploaded" on a review round, the Author sees "Upload"
whether or not an editor has requested revisions. Until an editor
records "Request Revisions", "Resubmit for Review" or "Accept
Submission" on the latest round, pressing it opens "Upload Review File" reading only "You are
not allowed to add and edit these files." with "Close". The "Upload
revisions" button beside the round shows only once revisions are
requested. The refusal does not say that uploading opens then.

The refused "Upload" shows on a round still waiting for a decision,
which is the usual state of a round, on a declined round, and on a
round an editor has followed with a new one. On an accepted round
"Upload" works: the server lets the Author add a revised file after an
acceptance, as after a revisions request. This report proposes hiding
the button where it would be refused; the team has to choose between
that and allowing the upload.

## Impact

- **Lost** Nothing.
- **Who** Every Author who opens a review round that is still waiting for
  a decision, was declined, or was followed by a new round. A preprint
  server has no review rounds.
- **Way round** None is needed. Once an editor requests revisions,
  "Upload" and "Upload revisions" both open the upload window.

Low: no task fails; a button is offered where it cannot work.

## Steps to reproduce

Preconditions:

- The default dataset, OJS `main`. Submission 7, "Developing efficacy
  beliefs in the classroom", is in review, and no editor has recorded a
  decision on its round.

Steps:

1. Sign in as `dsokoloff` (password `dsokoloffdsokoloff`).
2. On "My Submissions", press "View" on "Developing efficacy beliefs in
   the classroom"
   (`/index.php/publicknowledge/en/dashboard/mySubmissions?workflowSubmissionId=7`).
   The workflow opens on the review round.
3. Look beside the round's status and above the list "Revisions
   Uploaded".
4. Press "Upload" above "Revisions Uploaded".

**Expected** No upload is offered on a round that would refuse it: until
the round has a "Request Revisions", "Resubmit for Review" or "Accept
Submission" decision, neither "Upload revisions" beside the round nor
"Upload" above "Revisions Uploaded".

**Observed** No "Upload revisions" button shows, but "Upload" stands
above "Revisions Uploaded". Pressing it opens a window titled "Upload
Review File" whose only content is "You are not allowed to add and edit
these files.", with "Close". The list stays "No Items". The window's
request is answered with a refusal:

```
GET /index.php/publicknowledge/$$$call$$$/wizard/file-upload/file-upload-wizard/start-wizard?fileStage=15&reviewRoundId=6&submissionId=7&stageId=3&uploaderRoles=4096
200 {"status":false,"content":"You are not allowed to add and edit these files.","elementId":"0","events":[]}
```

On a press (the default dataset, OMP `main`), the same four steps give
the same result as `afinkel` on submission 2, "The West and Beyond: New
Perspectives on an Imagined Region" (external review), and as `msmith`
on submission 17, "Open Development: Networked Innovations in
International Development" (internal review).

Controls, with the same steps:

- On submission 13, "Hydrologic Connectivity in the Edwards Aquifer
  between San Marcos Springs and Barton Springs during 2009 Drought
  Conditions" (author `lkumiega`), whose round asks for revisions in the
  dataset, "Upload revisions" shows and "Upload" opens step 1 of the
  upload window.
- On an accepted round, "Upload" opens step 1 of the upload window and
  no "Upload revisions" shows: OJS submission 3, "The Facets Of Job
  Satisfaction: A Nine-Nation Comparative Study Of Construct
  Equivalence" (author `ckwantes`), and OMP submission 7, "Accessible
  Elements: Teaching Science Online and at a Distance" (author
  `dkennepohl`), both in copyediting, with their review round chosen in
  the workflow menu. The round's status reads "Submission accepted.".

## Cause

The "Revisions Uploaded" table takes its controls from a permission
table in ui-library,
`FileManagerConfigurations.WORKFLOW_REVIEW_REVISIONS` in
`src/managers/FileManager/useFileManagerConfig.js`. Its entry for
`ROLE_ID_AUTHOR` lists `Actions.FILE_UPLOAD` with no condition.
`getManagerConfig()` checks only that the user holds the role in the
stage, and `getTopItems()` renders "Upload" from the result. The
`FileManager` component does receive `reviewRoundId` and uses it for the
file list and the upload, but the permission lookup never gets it: the
config function is called with `stageId` alone.

The server's rule is narrower. `FileUploadWizardHandler::authorize()`
adds `SubmissionFileStageAccessPolicy` in modify mode, and its
`effect()` opens the revision file stage to an author only when the
latest round of that review stage has a decision to accept, to request
revisions, to resubmit for review or to open a new round. Otherwise
`start-wizard` answers `status: false` with
`api.submissionFiles.403.unauthorizedFileStageIdWrite`, the text the
window shows. The new-round decision never opens it in practice:
`NewExternalReviewRound::runAdditionalActions()` records it on the
current round and then creates the next round, which becomes the
latest and has no decision yet; so three decisions open the upload.

The author's workflow config does use the round: `getActionItems()` in
`workflowConfigAuthorOJS.js` and `workflowConfigAuthorOMP.js` adds
"Upload revisions" only for a list of round statuses. The permission
behind "Upload" was never given such a condition. The legacy grid it replaced
had the same gap: `AuthorReviewRevisionsGridHandler` is built with
`FILE_GRID_ADD` on every round, in front of the same policy.

Reach:

- Both review stages: a journal's and a press's external review, and a
  press's internal review (on screen).
- On a press, the internal review round once the submission was sent on
  to external review. OMP's `SendExternalReview` sets the internal round
  to `REVIEW_ROUND_STATUS_ACCEPTED`, but the decision recorded is
  `Decision::EXTERNAL_REVIEW`, which is not among the internal decisions
  the policy counts (`ACCEPT_INTERNAL`, `PENDING_REVISIONS_INTERNAL`,
  `NEW_INTERNAL_ROUND`, `RESUBMIT_INTERNAL`). No revisions were
  requested on that round, and "Upload" is offered and refused there too
  (on screen, `main`: submission 11 as `jlockehart`).
- An accepted external review round: the policy counts the accept, so
  "Upload" opens the upload window there, and "Upload revisions" does
  not show (on screen, `main` and 3.5: OJS submission 3 as `ckwantes`,
  OMP submission 7 as `dkennepohl`).
- On a press, an internal round accepted straight from internal review:
  OMP's `AcceptFromInternal` records `Decision::ACCEPT_INTERNAL`, which
  the policy counts, so "Upload" opens the upload window there (on
  screen, `main`: submission 12 as `lelder`, after "Accept Submission"
  by `dbarnes`).
- A declined round: `Decline` sets `REVIEW_ROUND_STATUS_DECLINED` and
  records `Decision::DECLINE`, which the policy does not count, so
  "Upload" is offered and refused there (on screen, `main`: OJS
  submission 2 as `ccorino`, after "Decline Submission" by `dbarnes`).
- A round followed by a new one: after "Create New Review Round", both
  the new round and the earlier one show "Upload" and refuse it, since
  the policy reads the latest round only (on screen, `main`: OJS
  submission 13 as `lkumiega`). The earlier round's status then reads
  reviews completed, so "Upload revisions" does not show there.
- Editors are not affected: the server grants them the upload their own
  entry in `WORKFLOW_REVIEW_REVISIONS` offers (on screen: `dbarnes`).
- The reverse mismatch, "Upload revisions" disappearing after a
  resubmission's first file while "Upload" still works, is a wrong
  status list in the author configs and has its own report:
  [U26-A1-upload-revisions-button-gone-after-resubmit-upload.md](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/issues/U26-A1-upload-revisions-button-gone-after-resubmit-upload.md).
- The same table's "Update File Details" and "Delete", refused on a file
  an editor uploaded, break a different rule and have their own reports:
  [U36-A2-author-update-file-details-offered-then-refused.md](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/issues/U36-A2-author-update-file-details-offered-then-refused.md)
  and
  [U36-A2-author-refused-on-editors-revision-file.md](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/issues/U36-A2-author-refused-on-editors-revision-file.md).

## Proposed fix

The team first has to choose between the two open issues: hide the
button (`pkp/pkp-lib#8976`) or allow the upload (`pkp/pkp-lib#13048`).
This report recommends hiding it. The server's rule is deliberate and
old (an author adds revision files once a decision asks for them), the
"Upload revisions" button already follows it, and hiding changes no
rule, only the one control that contradicts it.

The change is in ui-library alone:
[fix.diff](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/author-revisions-upload-offered-then-refused/fix.diff).

- `fileManagerStore.js` passes the `reviewRoundId` prop to
  `getManagerConfig()`.
- `getManagerConfig()` looks the round up in the submission and hands it,
  with the submission's rounds, to the config function:

```diff
 		const config = FileManagerConfigurations[namespace.value]({
 			stageId: submissionStageId.value,
+			reviewRound: submission.value?.reviewRounds?.find(
+				(reviewRound) => reviewRound.id === reviewRoundId?.value,
+			),
+			reviewRounds: submission.value?.reviewRounds,
 		});
```

- `WORKFLOW_REVIEW_REVISIONS` lists the author's `FILE_UPLOAD` only when
  the round's status says revisions were requested or submitted, after
  "Request Revisions" or "Resubmit for Review", or when the round was
  accepted:

```diff
 				roles: [pkp.const.ROLE_ID_AUTHOR],
 				actions: [
 					Actions.FILE_LIST,
-					Actions.FILE_UPLOAD,
+					...(canAuthorUploadRevisions({stageId, reviewRound, reviewRounds})
+						? [Actions.FILE_UPLOAD]
+						: []),
 					Actions.FILE_EDIT,
 					Actions.FILE_DELETE,
```

A press's internal round has the status accepted in two cases, and the
rounds tell them apart. Sent on to external review, its decision is
`Decision::EXTERNAL_REVIEW`, which the policy does not count, and the
submission has an external round. Accepted straight from internal
review (`AcceptFromInternal`, `Decision::ACCEPT_INTERNAL`), the policy
counts it, and the submission has no external round. So an accepted
internal round keeps "Upload" only when the submission has no external
round.

Tried on `main`, OJS and OMP. With it, the Steps show no "Upload" on the
three rounds, and both controls still open the upload window. An Author
still uploads through "Upload" on a round that asks for revisions,
before and after the first file and after a "Resubmit for Review"
decision; "Upload" still opens the window on the accepted external
rounds and on OMP submission 12 accepted from internal review; the
editor's "Upload" still opens the window. "Upload" no longer shows on a
press's internal round sent on to external review, nor on either round
of OJS submission 13 after "Create New Review Round". The declined round
was walked without the fix only; its status is not in the fix's list.

**Alternatives**

- Allow the upload on every round, as `pkp/pkp-lib#13048` asks. It
  takes a product ruling on whether authors may add files while
  reviewers are reading, then the removal of the decision check from
  `SubmissionFileStageAccessPolicy::effect()` for the two revision file
  stages; the button is then right as it is, and "Upload revisions"
  would follow.
- Let the server say it: a flag per round in the submission's
  `reviewRounds` (as `isAuthorResponseRequested` is), computed by the
  rule the policy holds. A status only approximates that rule: the
  policy counts decisions on the latest round, so a round later declined
  or returned to review still takes uploads while its status no longer
  says so, and an earlier round never takes them, whatever its status. A flag is exact there, and
  costs a change in pkp-lib and one in ui-library.
- Pass the component's existing `readOnly` prop from the author config.
  It also removes "Update File Details" and "Delete" from the Author's
  own files, which the server allows them.

**What goes with it**

- No stored data is involved and no API changes. `getManagerConfig()`
  gains an optional `reviewRoundId`, and the config functions an optional
  `reviewRound` and `reviewRounds`. Its only other caller,
  `getPermittedNamespacesForStage()`, passes none; it reads the
  `_SELECT` namespaces, whose permissions hold no author entry, so
  nothing changes for it.
- The policy runs the hook `SubmissionFileStageAccessPolicy::effect`,
  through which a plugin can open file stages to a user. A status check
  in ui-library cannot follow that: an upload a plugin allows on another
  round would have no button. Only the server flag above can.
- The accepted rounds keep "Upload" because the server takes the upload
  there. If an accepted round should be closed to the Author, drop that
  branch and narrow the policy with it.
- The status list is the one "Upload revisions" should use; when the
  fix for that button (U26-A1, linked in the Cause) lands too, the two
  can share one exported list.
- Backport: `useFileManagerConfig.js` and `fileManagerStore.js` differ
  on 3.5 (no `readOnly`), so the same change is made by hand there (not
  tried). 3.4 and 3.3 would need a condition on the grid's
  `FILE_GRID_ADD`; not proposed.
- Test: the pkp-e2e suite's scenario for the Author's lists (spec U36,
  scenario 7) reads the round before revisions are requested and would
  assert that no "Upload" shows.

Medium: hiding the button, as recommended, is a few lines in two
ui-library files with a rule that copies the server's, and a test, on
`main`; the 3.5 backport is not counted. Allowing the upload instead
would be a pkp-lib change after a product ruling, and the team has to
choose between the two before either is merged.

## Evidence

- The script
  [walk.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/author-revisions-upload-offered-then-refused/walk.js)
  (helpers in
  [lib.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/author-revisions-upload-offered-then-refused/lib.js))
  takes steps 1 to 4 on OJS (submission 7, the control on 13 and the
  accepted round of 3) and on OMP (submissions 2 and 17, and the accepted
  round of 7), opening each submission by its address. It
  records which of the two buttons show, the window "Upload" opens with
  its request and answer, and each round's `statusId` from the
  submission API's answer. `MODE=nb` walks the neighbouring cases the
  fix must leave working or change on purpose, with the fix in and out:
  OJS 13 (an upload on a round asking for revisions, then "Create New
  Review Round" by `dbarnes` and both rounds), OJS 10 (a "Resubmit for
  Review" decision by `dbarnes`, then the Author's upload), OJS 3 (an
  accepted round), OJS 2 ("Decline Submission" by `dbarnes`), OMP 12 ("Accept Submission" from internal
  review by `dbarnes`), OMP 16 ("Request Revisions" by `dbarnes`), OMP
  11 (the internal round after external review began) and the editor's
  "Upload" on OJS 7 and OMP 2. Each run
  starts from an install freshly loaded from the default dataset:
  `PROBE_FEATURE=<feature> PROBE_AGENT=<id> node bin/probe.js ojs,omp shared/playwright/checks/issues/author-revisions-upload-offered-then-refused/walk.js`
  (`PKP_E2E_LINE=stable-3_5_0` in front for 3.5).
- The fix trial: `node bin/try-fix.js apply <fix.diff> ojs omp`, then
  the walk and `MODE=nb` on `main`, and `MODE=nb` again with the fix
  out; the declined round with the fix out only (`MODE=declined`). A preprint server has no review rounds and was not walked.
- The walks ran on PostgreSQL. Datasets: pkp/datasets 961a9871
  (2026-11-15). `main` and 3.5 gave the same result on OJS and OMP, the
  accepted rounds included.
- Branch tips. `main`: OJS 925ed49f3b, OMP 92dd31031; pkp-lib
  3ed5d1c3b3; ui-library 836c01b5. 3.5: OJS 6cfc46e6fc, OMP 3f0fd0a7d;
  pkp-lib bb17ba1380 (OJS) and 5af8e67ab4 (OMP); ui-library fd00e45f.
  3.4: OJS 61835656a2, OMP 98db039f2; pkp-lib 2dd24cc5ae. 3.3: OJS
  b83fb9e44d, OMP 31f5c517e; pkp-lib df738d3a66.
- Code reads. 3.5: the author entry of `WORKFLOW_REVIEW_REVISIONS`, the
  status list in both author configs and the policy's block are as on
  `main`. 3.4 and 3.3: `templates/authorDashboard/reviewRoundInfo.tpl`
  loads `AuthorReviewRevisionsGridHandler` on every round
  (`showReviewAttachments` is always true), the handler is built with
  `FILE_GRID_ADD`, `SubmissionFilesGridHandler::initialize()` adds the
  upload link whenever that capability is set, and
  `FileUploadWizardHandler::authorize()` adds
  `SubmissionFileStageAccessPolicy` with the same decision check. 3.4
  and 3.3 were not walked.
- Introduced: `git blame` on the author entry's `Actions.FILE_UPLOAD`
  gives f77229c3 (`pkp/ui-library#412`), which only renamed the action.
  The policy's decision check is in the 3.3 file as 5f383f87c3 (2020,
  `pkp/pkp-lib#6292` for `pkp/pkp-lib#6057`) left it; baad1adb92 is for
  `pkp/pkp-lib#1208`. Whether the upload was ever conditional before
  2016 was not read.
- Upstream searches (pkp/pkp-lib, pkp/ojs, pkp/omp, pkp/ui-library): the
  refusal's text, the Author's upload of revisions before a decision,
  "Revisions Uploaded", `SubmissionFileStageAccessPolicy`,
  `WORKFLOW_REVIEW_REVISIONS` (2026-10-02 and 2026-11-16).
- Not looked at: a round returned to review after an accept; the two
  server-side alternatives.
