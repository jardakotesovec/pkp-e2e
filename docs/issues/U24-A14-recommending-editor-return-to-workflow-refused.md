# An editor limited to recommendations is offered "Return to Workflow" on a published submission, and "Confirm" is refused

- **Severity** low
- **Effort** small
- **Kind** defect
- **Affects**
  - main: OJS, OMP
  - 3.5: none (no Done stage)
  - 3.4: none (code; no Done stage)
  - 3.3: none (code; no Done stage)
- **Introduced** `pkp/ojs#5585` and `pkp/omp#2382` for `pkp/pkp-lib#12799` · [a9282937f8](https://github.com/pkp/ojs/commit/a9282937f833de7a6af172ae213cfaef9eb07ff9), [6b8db17ac5](https://github.com/pkp/omp/commit/6b8db17ac5a684a917f11b8c60e33cdc12ad97e6) · 2026-06-09 · Erik Hanson (ewhanson)
- **Upstream** none found (2026-11-13)
- **Tracked in** spec U24 [A14](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U24-workflow-screen-and-stage-access.md#a14)
- **Checked** 2026-11-13, each branch's tip (the commits in Evidence)
- **Model** claude-opus-5-5

## Summary

A Section Editor whose assignment to a submission is limited to
recommendations (a recommending editor) sees "Return to Workflow" in
the header of a published submission, as a deciding editor does. (On
`main` a published submission rests in the Done stage, which is what
the button leaves.) The dialog opens and "Cancel" changes nothing, but
"Confirm" brings up an "Error" window reading "You do not have
permission to record this decision on this submission." with "OK".
The submission stays where it was, and after a reload the button is
still offered.

The recommending editor is offered an action they can never complete,
and nothing on the screen says why until they try. On a press the same
holds for a Series Editor limited to recommendations. A preprint
server does not show it: there the limited Moderator's workflow of a
posted preprint fails to load before any button is drawn.

No release carries the fault: it is on `main` only, since 2026-06-09,
and ships with the next release unless fixed.

## Impact

- **Lost**: nothing; no decision is recorded.
- **Who**: an editor whose assignment a manager limited to
  recommendations, on every published submission they are assigned
  to. The limit is off by default and is set per assignment.
- **Way round**: none needed. A deciding editor on the submission
  returns it when that is wanted.

Low: nothing is lost and the outcome is right; only the offer misleads.

## Steps to reproduce

Preconditions:

- PKP's default test dataset for `main`.
- Journal: submission 1, "Signalling Theory Dividends", rests in Done
  (published), and Stephanie Berardo (`sberardo`) is assigned to it as
  Section editor with "Only allowed to recommend" (its Participants
  list says so).
- Press: book 14, "From Bricks to Brains: The Embodied Cognitive
  Science of LEGO Robots", rests in Done; the dataset limits nobody on
  a published book, so `dbarnes` assigns her:
  1. Sign in as `dbarnes`, open book 14
     (`/index.php/publicknowledge/en/dashboard/editorial?workflowSubmissionId=14`).
  2. In the side menu, select "Production"; in "Participants" press
     "Assign"; choose the role "Series editor", press "Search", choose
     Stephanie Berardo, tick "This participant is only allowed to
     recommend an editorial decision and will require an authorised
     editor to record editorial decisions.", press "OK" ("User added as
     a stage participant."). Sign out.

Steps:

1. Sign in as `sberardo`.
2. Open submission 1
   (`/index.php/publicknowledge/en/dashboard/editorial?workflowSubmissionId=1`).
   [Press: book 14.] The bubble reads "Published" and the header offers
   "View", "Activity Log", "Library", "Return to Workflow" [press:
   "Monograph" before "Return to Workflow"].
3. Press "Return to Workflow". The dialog "Return to Workflow" reads
   "Return this submission to the workflow stage it occupied before it
   was moved to Done.", with "Confirm" and "Cancel".
4. Press "Confirm".
5. Press "OK" on the window that opens, then reload the page.

**Expected**: no "Return to Workflow" in step 2's header, since the
limit withholds the decision from her.

**Observed**: at step 4 an "Error" window opens, reading "You do not
have permission to record this decision on this submission.", with one
button, "OK". The request behind it is refused:

```
POST /index.php/publicknowledge/api/v1/submissions/1/decisions  {"decision":34}
→ 401 {"error":"editor.submission.workflowDecision.disallowedDecision",
       "errorMessage":"You do not have permission to record this decision on this submission."}
```

After "OK" and after the reload the bubble still reads "Published" and
"Return to Workflow" is still offered.

Control: the same steps as `dbuskins` (Section editor without the
limit) on the journal, and as `dbarnes` on the press, return the
submission to "Production"; `sberardo` then sees "Preview", "Activity
Log", "Library" [press: "Monograph"] and no "Return to Done".

## Cause

The header's buttons come from the submission's
`availableEditorialDecisions`, which the app's
`APP\submission\maps\Schema::getAvailableEditorialDecisions()` builds
(OJS `classes/submission/maps/Schema.php` lines 117–127, OMP lines
173–183). It first asks lib/pkp's `checkDecisionPermissions()` about the
user's editorial assignments on the stage. For a recommending editor at
Done that answers `canMakeDecision: false` and `isOnlyRecommending:
true`: `getDecisionTypesMadeByRecommendingUsers()` returns no decision
for the Done stage.

The method then runs a block written for the Done stage. Whenever
`canMakeDecision` is still false, it looks up a manager or sub-editor
assignment of the user on the submission, in any stage, and sets
`canMakeDecision` to true when one exists. So the block runs for every
assigned editor `checkDecisionPermissions()` did not find able to
decide at Done: an editor limited to recommendations, or an editor
whose role does not include the Done stage. The lookup never reads the
assignment's `recommend_only` flag, so the recommending editor's own
assignment turns "cannot decide" into "can decide", and the Done
branch offers `ReturnToWorkflow`.

The block's comment says "Done has no stage assignments". That stopped
holding when `pkp/pkp-lib#13109` gave the editorial roles the Done
stage (`registry/userGroups.xml` in `pkp/ojs#5793` and `pkp/omp#2453`,
and the `I13109_PermitPublishedMetadataEdit` migration of
`pkp/pkp-lib#13273` for upgraded installs). Since then
`checkDecisionPermissions()` finds the recommending editor's assignment
at Done, limit included, and the block overrides its answer.

The server refuses the decision to her: `POST submissions/{id}/decisions`
answers 401 `editor.submission.workflowDecision.disallowedDecision`
(walked, Observed above). The offer and the refusal disagree, and the
offer is the side that is wrong.

Reach:

- Every published submission with a recommending editor assigned, on a
  journal and a press (walked: OJS submission 1, OMP book 14).
- A preprint server: OPS's map carries the same block, but for a
  limited Moderator on a posted preprint it lets the method go on to a
  line that fails, so the workflow does not load at all
  ([U34 OPS3](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/issues/U34-OPS3-limited-moderator-posted-preprint-error.md),
  read in the code).
- "Return to Done" is not affected: it is offered on an active stage,
  where the block does not run and `checkDecisionPermissions()` keeps
  the limit (walked: not offered to `sberardo` after the return).
- The block is the only place in the three apps' maps that sets
  `canMakeDecision` outside `checkDecisionPermissions()` (code search).

## Proposed fix

Make the block's lookup skip assignments limited to recommendations,
with the `withRecommendOnly()` scope `StageAssignment` already has (used
the same way in OJS's `decision/Repository.php`), in OJS's and OMP's
map
([fix-ojs.diff](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/recommending-editor-return-to-workflow-refused/fix-ojs.diff),
[fix-omp.diff](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/recommending-editor-return-to-workflow-refused/fix-omp.diff);
OJS shown, OMP the same at line 173):

```diff
-        // Done has no stage assignments, so checkDecisionPermissions returns false for canMakeDecision
-        // for assigned sub-editors. Grant decision access to any editor assigned to this submission.
+        // Grant decision access at Done to an editor assigned to this submission whom
+        // checkDecisionPermissions did not find able to decide, unless the assignment is
+        // limited to recommendations.
         if ($stageId === WORKFLOW_STAGE_ID_DONE && !$permissions['canMakeDecision']) {
             $isAssignedEditor = StageAssignment::withSubmissionIds([$submission->getId()])
                 ->withUserId($user->getId())
                 ->withRoleIds([Role::ROLE_ID_MANAGER, Role::ROLE_ID_SUB_EDITOR])
+                ->withRecommendOnly(false)
                 ->exists();
```

An editor whose role lacks the Done stage keeps the button; the
comment drops the premise that no longer holds.

Tried on `main`, OJS and OMP. With the fix applied, `sberardo`'s header
on submission 1 and book 14 reads "View", "Activity Log", "Library"
[press: "Monograph"], with no "Return to Workflow". Walked both with
and without the fix, with the same result: `sberardo` on journal
submission 17 (assigned without the limit), `dbuskins` on submission 1
and `dbarnes` on book 14 are offered "Return to Workflow", and
"Confirm" moves the submission to Production.

**Alternatives**:

- `&& !$permissions['isOnlyRecommending']` in the block's condition. It
  reads the limit only where `checkDecisionPermissions()` found an
  assignment at Done, while the lookup that grants the button stays
  blind to it.
- Remove the block. An editor whose role lacks the Done stage would
  lose the button.

**What goes with it**:

- `availableEditorialDecisions` loses `ReturnToWorkflow` for these
  editors; nothing else in the API changes.
- OPS: the same line in OPS's map makes the method return before the
  failing line of U34 OPS3, so on its own it would also end that
  report's failure at Done. That report's own one-line fix is still
  needed for decisions a plugin adds for recommending users. Whoever
  takes one should take both; the OPS line was not tried.
- Test: an end-to-end test in which a recommending editor opens a
  published submission and is offered no "Return to Workflow".

## Evidence

- The script
  [walk.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/recommending-editor-return-to-workflow-refused/walk.js)
  (helpers in
  [lib.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/recommending-editor-return-to-workflow-refused/lib.js))
  takes the preconditions, steps 1–5 and the control on OJS and OMP. It
  records the header, the dialog, the request and its answer, the
  "Error" window, and the header after "OK" and after a reload. With
  the argument `neighbour` it walks only the unlimited editors of the
  fix's check. Run from the pkp-e2e repo on an install loaded from the
  default dataset:
  `PROBE_FEATURE=<feature> PROBE_AGENT=<id> node bin/probe.js all shared/playwright/checks/issues/recommending-editor-return-to-workflow-refused/walk.js [neighbour]`.
- Walked on PostgreSQL, PKP's default dataset (pkp/datasets d141ec4b,
  2026-11-12), `main` and 3.5. MySQL not checked.
- 3.5 walked on OJS and OMP: submission 1 and book 14 sit in
  Production, published, and no header offers "Return to Workflow" to
  `sberardo`, `dbuskins` or `dbarnes`. 3.5's maps have no Done branch.
- Branch tips. `main`: OJS 3c99722dc8, OMP 61df357b9, OPS c74e5bf190;
  pkp-lib ad75b174f0. 3.5: OJS 7cf6c9c60f, OMP 3f0fd0a7d; pkp-lib
  5af8e67ab4. 3.4: OJS 61835656a2, OMP 98db039f2; pkp-lib 2dd24cc5ae.
  3.3: OJS b83fb9e44d, OMP 31f5c517e; pkp-lib df738d3a66.
- Code reads. `main`: the three apps' `getAvailableEditorialDecisions()`,
  lib/pkp `checkDecisionPermissions()`,
  `Repository::getDecisionTypesMadeByRecommendingUsers()` (OJS and OMP:
  a recommending decision only at the Submission stage),
  `StageAssignment::scopeWithStageIds()`, the roles' stages in the
  loaded dataset (OJS Section editor 1,3,4,5,6; OMP Series editor 1–6).
  3.4 and 3.3: no Done stage and no `ReturnToWorkflow` in the apps or
  pkp-lib.
- Introduced: `git blame` on the block gives a9282937f8 (OJS) and
  6b8db17ac5 (OMP). The Done stage reached the roles in ojs 3bfe1f9f68,
  omp 5d2b2fea7 and pkp-lib 18f402e585 (2026-09).
- Not walked: an editor holding both a limited and an unlimited
  assignment; OPS (read in the code); the fix's OPS line.
