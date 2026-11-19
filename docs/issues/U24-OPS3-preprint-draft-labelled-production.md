# A preprint server labels an unfinished submission "Production", not "Incomplete", in the lists and the workflow header

- **Severity** low
- **Effort** small
- **Kind** regression
- **Affects**
  - main: OPS
  - 3.5: OPS
  - 3.4: none (code)
  - 3.3: none (code)
- **Introduced** `pkp/ui-library#364` for `pkp/pkp-lib#7495` · [0034beaf80](https://github.com/pkp/ui-library/commit/0034beaf8079b3c8ab2df0aba6ee5dac5cb8b28f) · 2024-06-18 · Jarda Kotěšovec (jardakotesovec)
- **Upstream** none found (2026-11-19)
- **Tracked in** spec U24 [OPS3](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U24-workflow-screen-and-stage-access.md#ops3)
- **Checked** 2026-11-19, each branch's tip (the commits in Evidence)
- **Model** claude-opus-5-5

Update 2026-11-19: this report first said that pressing "Post the
preprint" on a draft shows an error. The button itself does not: it
opens the draft's "Title & Abstract" page, and that page shows the
"Error" window. Impact now also says what the author with a draft
meets.

## Summary

On a preprint server, a submission its author began and never finished
is labelled "Production", in the production colour. A submitted
preprint that is not yet posted carries the same label, so the two
cannot be told apart by it. The label shows in the Stage column
of the author's My Submissions and of the editorial dashboard, and in
the bubble under the title of the workflow panel. A journal or press
labels such a submission "Incomplete".

No work is lost: the row still offers "Complete submission" and the
wizard reopens from it. That button is the only thing that tells a
draft from a submitted preprint in a list, and the workflow panel's
header gives no sign at all.

## Impact

- **Lost**: no work or data, but a draft looks sent. Its author sees it
  in "Active submissions" labelled "Production", like a submitted
  preprint, and can leave it unfinished believing it went in. A manager
  or moderator reads it as a preprint awaiting moderation.
- **Who**: every author with a draft and every manager or moderator
  who lists submissions.
- **Way round**: in any list, a draft's row offers "Complete
  submission" where a submitted preprint's offers "View". A journal or
  press also has an "Incomplete submissions" view; a preprint server
  has none. Nothing in the workflow panel marks a draft.

Low: a wrong label, and every task still gets done. The author's own
row says "Complete submission" next to the label, and nothing is
posted by mistake: "Post the preprint" on a draft's panel ends in an
"Error" window reading "Workflow access for incomplete submission is
restricted." It would be medium if authors turned out to leave drafts
unfinished because of the label.

## Steps to reproduce

Preconditions:

- PKP's default test dataset, OPS `main` (context `publicknowledge`).
  Nothing else: `ccorino` is an author and `dbarnes` a manager on
  "Public Knowledge Preprint Server".

1. Sign in as `ccorino`.
2. Open "Make a Submission" (`/index.php/publicknowledge/en/submission`),
   type the title "u24d draft", and choose the language "English" (the
   choice is shown only when the server accepts more than one
   submission language). Tick the requirement
   boxes and press "Begin Submission". The wizard opens, and its
   address ends in `?id=` and the draft's number (20 on a fresh
   dataset). Leave the wizard as it is.
3. Open My Submissions
   (`/index.php/publicknowledge/en/dashboard/mySubmissions`) and read
   the Stage column of the "u24d draft" row.
4. Sign out and sign in as `dbarnes`. Open "Active submissions"
   (`/index.php/publicknowledge/en/dashboard/editorial?currentViewId=active`),
   type "u24d draft" in the search box above the list and press Enter.
   Read the row's Stage column.
5. Type the address
   `/index.php/publicknowledge/en/dashboard/editorial?workflowSubmissionId=20`,
   with the draft's number from step 2 in place of 20. Read the bubble
   under the title of the panel that opens. A draft's panel opens by
   typed address only: its row offers no "View".

**Expected**: "Incomplete", with the dot colour of an incomplete
submission, in steps 3, 4 and 5.

**Observed**: "Production", with the production stage's dot, in all
three. Both rows offer "Complete submission" and nothing else. The
panel's header reads "20 Corino / u24d draft / Production", with
"Preview", "Activity Log" and "Library".

The same steps on a journal (OJS, `ccorino`, where the draft is
number 21) and on a press (OMP, `aclark`, number 19) show "Incomplete"
in all three places.

## Cause

The bubble's colour comes from `useSubmission().getExtendedStage()`
(`lib/ui-library/src/composables/useSubmission.js`, line 246 on
`main`), and its text from `getExtendedStageLabel()` in the same file,
which calls it. `getExtendedStage()` returns `ExtendedStages.INCOMPLETE` only inside the
`WORKFLOW_STAGE_ID_SUBMISSION` case of its switch on the active stage:

```js
switch (activeStage.id) {
	case pkp.const.WORKFLOW_STAGE_ID_SUBMISSION:
		return submission.submissionProgress
			? ExtendedStages.INCOMPLETE
			: ExtendedStages.SUBMISSION;
```

A preprint server has no Submission stage. When "Begin Submission"
creates a submission, the request carries no `stageId`, and
`Repo::submission()->add()` fills in no schema defaults. So the new row
takes the `stage_id` column's default, which OPS's
`APP\migration\install\SubmissionsMigration` sets to
`WORKFLOW_STAGE_ID_PRODUCTION`. OPS's `schemas/submission.json` agrees
with that default: it gives `stageId` the default 5 and allows no other
value (`min:5`, `max:5`).

A draft is therefore created in Production with the status queued.
It falls through to the Production case and gets `PRODUCTION_QUEUED`, the label "Production"
(`manager.publication.productionStage`). The rest of the dashboard
code treats a set `submissionProgress` as "draft" without looking at
the stage; this function does not.

The function arrived with the new dashboard in `pkp/ui-library#364`.
Up to and including 3.4, the list's
`SubmissionsListItem.vue::currentStageLabel()` first returned the status
label for an archived submission (scheduled, published or declined).
Next it returned "Incomplete" when `submissionProgress` was set, and
only then read the stage, so an OPS draft read "Incomplete".

Reach, all through the same function:

- `DashboardCellSubmissionStage.vue`: the Stage column of every
  dashboard list, My Submissions and the editorial dashboard (on
  screen).
- `workflowStore.js` (`extendedStage`, `stageLabel`), shown by
  `WorkflowPage.vue`: the bubble in the workflow panel's header (on
  screen).
- No caller besides these two and `getExtendedStageLabel()` (checked
  in the code). The functions that build the row's "Complete
  submission" action
  (`src/pages/dashboard/composables/useDashboardConfigEditorialActivity.js`)
  already test `submissionProgress` without the stage, with the
  comment "Not checking for submission stage, as OPS does not have
  it".

## Proposed fix

Return `INCOMPLETE` for a draft right after the Declined test, before
the switch on the stage
([fix.diff](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/preprint-draft-labelled-production/fix.diff)).
This is the order 3.4 had: an archived submission (scheduled,
published or declined) first, then a draft, then the stage. The
dashboard's editorial-activity functions already test for a draft
without looking at the stage.

```diff
--- a/lib/ui-library/src/composables/useSubmission.js
+++ b/lib/ui-library/src/composables/useSubmission.js
@@ -248,11 +248,14 @@
 		if (submission.status === pkp.const.submission.STATUS_DECLINED) {
 			return ExtendedStages.DECLINED;
 		}
+		// A draft is incomplete whatever stage it sits in: OPS creates
+		// every submission in the production stage
+		if (submission.submissionProgress) {
+			return ExtendedStages.INCOMPLETE;
+		}
 		switch (activeStage.id) {
 			case pkp.const.WORKFLOW_STAGE_ID_SUBMISSION:
-				return submission.submissionProgress
-					? ExtendedStages.INCOMPLETE
-					: ExtendedStages.SUBMISSION;
+				return ExtendedStages.SUBMISSION;
```

The label key and colour for `incomplete` already exist. Tried on
`main` on OJS, OMP and OPS: the OPS draft reads
"Incomplete" in the three places of the Steps, OJS and OMP drafts
still do, and submissions that are not drafts keep their labels on
all three apps (Submission, the review rounds, Copyediting, Production,
Published, Declined).

**Alternatives**

- Creating OPS drafts in a Submission stage: OPS has no such stage, its
  schema allows no stage but Production, and it would change stored
  data and the stage access rules for a label.
- An OPS-only condition in one of the two components
  (`DashboardCellSubmissionStage.vue` or the OPS workflow config):
  leaves the other screen wrong.

**What goes with it**

- No stored data is wrong, and no API or hook changes.
- With the fix in, "Post the preprint" on a draft's panel still ends in
  the "Error" window; whether a draft's panel should offer decisions at
  all is a separate open question (U24
  [OPS5](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U24-workflow-screen-and-stage-access.md#ops5)),
  not this fault.
- 3.5: the same change applies to `stable-3_5_0`'s copy of the function
  (line 251 there; the line above reads `pkp.const.STATUS_DECLINED`, so
  the diff's context differs by that one line).
- Guard: a unit test of `getExtendedStage()` in ui-library (the
  composable has none) with a draft whose active stage is Production,
  and an e2e scenario here reading the draft's bubble on a preprint
  server.

Small: one condition moved in one function, with a unit test.

## Evidence

- Kept script:
  [walk.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/preprint-draft-labelled-production/walk.js),
  run on a dataset install with
  `PROBE_FEATURE=<feature> PROBE_AGENT=<id> node bin/probe.js all shared/playwright/checks/issues/preprint-draft-labelled-production/walk.js`
  (`PKP_E2E_LINE=stable-3_5_0` in front for 3.5). It takes the Steps on
  OPS, and on OJS and OMP as the control (OMP's author is `aclark`),
  and reads each bubble's label and the colour class of its dot.
  `WALK=nb` checks that the fix changes no other label: `dbarnes`
  opens the panel of dataset submissions in every other state (OJS 4, 7, 3, 5, 17, 18; OMP
  3, 6, 2, 1, 4, 5; OPS 1, 2, 4) and reads the bubble. `WALK=act`
  (OPS) takes steps 1 and 2, then `dbarnes` opens the draft's panel
  and presses "Post the preprint". On 2026-11-19, on `main` and 3.5,
  the panel moved from the Production entry
  (`workflowMenuKey=workflow_5`) to "Title & Abstract"
  (`publication_21_titleAbstract`; 3.5 `publication_titleAbstract`),
  and an "Error" window opened over it: "Workflow access for incomplete
  submission is restricted.", "OK". Nothing was posted. With the fix
  applied (2026-10-02), the panel offered the same buttons.
- Walked on `main` and on `stable-3_5_0`, all three apps, PostgreSQL:
  on 2026-10-02 (dataset pkp/datasets e8dafbc) and again on 2026-11-19
  (pkp/datasets 6d98f5ab), the same both times. OPS read "Production"
  (`bg-stage-production`) three times on both lines; OJS and OMP read
  "Incomplete" (`bg-stage-incomplete-submission`). The drafts were
  numbered OJS 21, OMP 19 and OPS 20 on both lines. The fault does not
  depend on the database.
- Fix trial on `main`, all three apps (`node bin/try-fix.js apply
  <fix.diff> ojs omp ops`, then the walk and `WALK=nb`): the three
  apps read "Incomplete" in the Steps' three places, and `WALK=nb`
  read the same labels and colours with the fix in and out. That trial
  ran on the 2026-10-02 tips and was not repeated. `fix.diff` still
  applies to the 2026-11-19 `main`. Since then, `useSubmission.js`
  has changed only in an unrelated function.
- Tips, 2026-11-19. `main`: ojs 0b12d7646e, omp 5b348c3f3, ops
  79f7713367 (lib/pkp 2f2c07fea7, lib/ui-library 836c01b5).
  `stable-3_5_0`: ojs 4032f3dd7d, omp 496c50188, ops db404286fe
  (lib/pkp ab7f581349, lib/ui-library fd00e45f).
- Tips at which the fix trial (on `main`) and the 3.4 and 3.3 code
  reads ran, 2026-10-02. `main`: ojs b84f8e2e44 (lib/pkp ddd8ab243a, lib/ui-library
  64d67363), omp 3b0ecf794c and ops c8af945bb7 (lib/pkp 3dc90c81a6,
  lib/ui-library 280f98c5). `stable-3_4_0`: ops acd8ae704b,
  lib/ui-library ee684b34. `stable-3_3_0`: ops c5532e2161,
  lib/ui-library 96959f9e.
- Code reads. `main` and 3.5: the Cause's files, the same on both
  lines. Where a new OPS submission's stage comes from, on both lines:
  `PKPSubmissionController::add()`, `Repo::submission()->add()` and
  `EntityDAO::_insert()` (only the properties the object holds are
  written, and `PKPSchemaService::setDefaults()` is not called on this
  path), OPS's `SubmissionsMigration` (`$defaultStageId`) and
  `schemas/submission.json` (`stageId`). The "Begin Submission" form
  (`StartSubmission.php`) has no stage field, and adds its language
  field only when the context has two or more submission languages. 3.4 and 3.3:
  ui-library's `SubmissionsListItem.vue::currentStageLabel()` returns
  `submissions.incomplete` when `submissionProgress` is set, before the
  stage is read; commit 0034beaf80 is on neither branch. 3.4's OPS
  migration sets the same Production default.
- Introduced: `git blame` on the `INCOMPLETE` lines of
  `getExtendedStage()` gives 0034beaf80, the commit that added the
  function; `commits/0034beaf80…/pulls` names `pkp/ui-library#364`
  ("I7495 activity").
- Upstream search (2026-10-02, repeated 2026-11-19), pkp/pkp-lib,
  pkp/ops and pkp/ui-library, issues and PRs, open and closed:
  "incomplete submission production stage label OPS", "incomplete
  preprint dashboard Production", "OPS incomplete submissions view
  dashboard", "getExtendedStage". No match; `pkp/ops#45` (2020) discusses the
  missing Submission stage in OPS, not this label.
- The list side is also noted in spec U22
  [OPS1](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U22-my-submissions.md#ops1),
  a question about the missing "Incomplete submissions" view, which
  this report does not cover.
- Not driven: 3.4 and 3.3 (code only); the author opening the panel
  of their own draft, which reads the same store value; "Decline
  Submission" on a draft.
