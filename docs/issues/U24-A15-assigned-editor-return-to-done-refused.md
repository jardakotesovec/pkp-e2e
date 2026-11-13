# An editor assigned to a returned submission presses "Return to Done" and is refused: "The current role does not have access to this operation."

- **Severity** medium
- **Effort** small
- **Kind** defect
- **Affects**
  - main: OJS, OMP, OPS
  - 3.5: none (no Done stage)
  - 3.4: none (code; no Done stage)
  - 3.3: none (code; no Done stage)
- **Introduced** `pkp/pkp-lib#12881` for `pkp/pkp-lib#12799` · [d52aa4c84b](https://github.com/pkp/pkp-lib/commit/d52aa4c84b740ec537b13141f88401e8d2e4cdc4) · 2026-06-09 · Erik Hanson (ewhanson)
- **Upstream** none found (2026-11-13)
- **Tracked in** spec U24 [A15](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U24-workflow-screen-and-stage-access.md#a15)
- **Checked** 2026-11-13, each branch's tip (the commits in Evidence)
- **Model** claude-opus-5-5

## Summary

An editor who returns a published submission to the workflow with
"Return to Workflow" is then offered "Return to Done", to move it back.
Anyone assigned to the submission in an editorial role that works on
its current stage gets, on "Confirm", an "Error" window reading "The
current role does not have access to this operation." with "OK". The
submission stays in its stage, and after a reload the button is still
offered.

So the editor who handled the submission cannot undo their own return:
the published submission stays in the active queue, in Production,
until a manager-level user who is not assigned to it presses the
button.

No release carries the fault: it is on `main` only, since 2026-06-09,
and ships with the next release unless fixed.

## Impact

- **Lost**: putting a published submission back in Done. Nothing
  stored changes; the submission stays published and stays among the
  active submissions.
- **Who**: everyone assigned to the submission in an editorial role
  that works on its current stage: on a journal the Journal editor,
  Production editor, Section editor and Guest editor; on a press the
  Press editor, Production editor and Series editor; on a preprint
  server the Preprint Server manager and the Moderator. An unassigned
  Section editor, Series editor or Moderator cannot use it either.
- **Way round**: a user in a manager-level role who is not assigned to
  the submission (Journal manager or Journal editor; Press manager or
  Press editor; Preprint Server manager) presses "Return to Done".
  Otherwise, unpublishing and publishing again lands it in Done, but
  takes it off the public site in between.

Medium: a secondary task fails for the editor who handled the
submission, and only another person, or taking the item offline, puts
it back.

## Steps to reproduce

Preconditions: PKP's default test dataset for `main`. Nothing else.
Journal: submission 1, "Signalling Theory Dividends", rests in Done
and Daniel Barnes (`dbarnes`, Journal editor) is assigned to it. Press:
book 14, "From Bricks to Brains: The Embodied Cognitive Science of LEGO
Robots", with `dbarnes` (Press editor) assigned. Preprint server:
preprint 2, "The Facets Of Job Satisfaction: A Nine-Nation Comparative
Study Of Construct Equivalence", with David Buskins (`dbuskins`,
Moderator) assigned.

1. Sign in as `dbarnes` [preprint server: `dbuskins`].
2. Open submission 1
   (`/index.php/publicknowledge/en/dashboard/editorial?workflowSubmissionId=1`)
   [press: book 14; preprint server: preprint 2]. The bubble reads
   "Published" and the header offers "Return to Workflow".
3. Press "Return to Workflow", then "Confirm" in its dialog. The bubble
   reads "Production" and the header offers "Preview", "Activity Log",
   "Library", "Return to Done" [press: "Monograph" before "Return to
   Done"].
4. Press "Return to Done". The dialog "Return to Done" reads "Return
   this submission to the Done stage.", with "Confirm" and "Cancel".
5. Press "Confirm".
6. Press "OK" on the window that opens, then reload the page.

**Expected**: the submission back in Done: bubble "Published", header
"View", "Activity Log", "Library", "Return to Workflow".

**Observed**: at step 5 an "Error" window opens, reading "The current
role does not have access to this operation.", with one button, "OK".
The request behind it is refused:

```
POST /index.php/publicknowledge/api/v1/submissions/1/returnToDone
→ 401 {"error":"user.authorization.roleBasedAccessDenied",
       "errorMessage":"The current role does not have access to this operation."}
```

After "OK" and after the reload the bubble still reads "Production" and
"Return to Done" is still offered. The press (book 14) and the preprint
server (preprint 2) behave the same.

Control: after step 6, sign in as `rvaca` (Journal manager, Press
manager, Preprint Server manager, assigned to none of the three), open
the same submission and press "Return to Done" › "Confirm": the
submission returns to Done (bubble "Published", "Return to Workflow"
offered), and stays there after a reload.

## Cause

`PKP\API\v1\submissions\PKPSubmissionController::authorize()`
(lib/pkp `api/v1/submissions/PKPSubmissionController.php`, lines
429–432) guards `returnToDone` with `SubmissionCompletePolicy` and
`DecisionAllowedPolicy`. `DecisionAllowedPolicy` reads the decision
type it judges from the authorized context
(`ASSOC_TYPE_DECISION_TYPE`), which `DecisionTypeRequiredPolicy` puts
there. The decisions route gets that policy through
`DecisionWritePolicy`; the `returnToDone` route was given
`DecisionAllowedPolicy` alone, so the decision type is null.

For a user with no assignment on the submission's current stage the
policy never reads the type: a manager-level user is permitted
outright, anyone else refused (`noUnassignedDecisions`). For a user
assigned in a manager-level or section editor role whose stages include
the current stage, the policy loops over the assignments and calls
`$decisionType->getDecision()` on null. The PHP `Error` this
throws is caught by `PKP\middleware\PolicyAuthorizer`, which answers 401
with the last authorization message on record,
`user.authorization.roleBasedAccessDenied`. The message names no real
cause, and the server log holds no trace of the error.

`returnToDone()` itself records `Decision::RETURN_TO_DONE` and checks
the submission's state (not in Done, a Done history, a published
version). It has no fault; it is never reached.

Reach:

- The roles Impact lists, on all three apps. Walked: Journal editor,
  Press editor, Moderator; the others read in the code and in the
  roles' stages of the default dataset.
- An unassigned manager-level user is permitted (walked); a
  recommending editor is not offered the button (walked).
- `DecisionAllowedPolicy` has two callers, `DecisionWritePolicy` and
  this route; only this one lacks the type (code search in lib/pkp and
  the three apps).

## Proposed fix

Give the route the decision type it is about, as `DecisionWritePolicy`
does for the decisions route, before `DecisionAllowedPolicy`
([fix.diff](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/assigned-editor-return-to-done-refused/fix.diff)):

```diff
 use PKP\security\authorization\internal\DecisionAllowedPolicy;
+use PKP\security\authorization\internal\DecisionTypeRequiredPolicy;
 ...
         if ($actionName === 'returnToDone') {
             $this->addPolicy(new SubmissionCompletePolicy($request, $args));
+            $this->addPolicy(new DecisionTypeRequiredPolicy($request, $args, Decision::RETURN_TO_DONE));
             $this->addPolicy(new DecisionAllowedPolicy($request->getUser()));
         }
```

The route keeps its own stage handling (no `DecisionStageValidPolicy`,
as the docblock of `returnToDone()` intends, since it is called from any
active stage), and
`DecisionAllowedPolicy` then judges "Return to Done" as it judges any
other decision: an assigned editor without the recommend-only limit is
permitted.

Tried on `main`, all three apps. With the fix applied, steps 1–5 move
the submission back to Done for `dbarnes` (journal, press) and
`dbuskins` (preprint server): bubble "Published" and "Return to
Workflow" offered again, the same after a reload. Walked both with and
without the fix, with the same result: the unassigned manager `rvaca`
returns the submission to the workflow and back to Done on all three
apps, and on the journal the recommending editor `sberardo` is offered
no "Return to Done" on the returned submission.

**Alternatives**:

- Use `DecisionWritePolicy` for the route. It adds
  `DecisionStageValidPolicy`, which refuses `ReturnToDone` on every
  stage but Production, while the button is offered on any active
  stage a submission returns to (a submission published from the
  Submission stage returns there).
- Make `DecisionAllowedPolicy` skip the decision-type checks when the
  type is missing. It would hide the next policy stack that forgets
  the type instead of failing it, and it loses the recommend-only test
  for this decision.

**What goes with it**:

- API: `POST submissions/{id}/returnToDone` answers 200 for assigned
  editors where it answered 401; no request body changes.
- Test: an end-to-end test in which an assigned editor presses "Return
  to Workflow" and then "Return to Done".

Small: one line and its import in one lib/pkp file.

## Evidence

- The script
  [walk.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/assigned-editor-return-to-done-refused/walk.js)
  (helpers in
  [lib.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/assigned-editor-return-to-done-refused/lib.js))
  takes steps 1–6 and the control on OJS, OMP and OPS, recording the
  header, the dialogs, each request and its answer, the "Error" window,
  and the header after "OK" and after a reload. With the argument
  `neighbour` it walks only the fix's check (`rvaca`, then `sberardo`).
  Run from the pkp-e2e repo on an install loaded from the default
  dataset:
  `PROBE_FEATURE=<feature> PROBE_AGENT=<id> node bin/probe.js all shared/playwright/checks/issues/assigned-editor-return-to-done-refused/walk.js [neighbour]`.
- Walked on PostgreSQL, PKP's default dataset (pkp/datasets d141ec4b,
  2026-11-12), `main` and 3.5. MySQL not checked.
- 3.5 walked on all three apps: the three submissions rest in
  Production, published, and no header offers "Return to Workflow" or
  "Return to Done". 3.5's pkp-lib has no `returnToDone` route.
- Branch tips. `main`: OJS 3c99722dc8, OMP 61df357b9, OPS c74e5bf190;
  pkp-lib ad75b174f0. 3.5: OJS 7cf6c9c60f, OMP 3f0fd0a7d, OPS
  e290d8d8af; pkp-lib 5af8e67ab4. 3.4: OJS 61835656a2, OMP 98db039f2,
  OPS d406378b01; pkp-lib 2dd24cc5ae. 3.3: OJS b83fb9e44d, OMP
  31f5c517e, OPS 5d75c52745; pkp-lib df738d3a66.
- Code reads. `main`: `PKPSubmissionController::authorize()` and
  `returnToDone()`, `DecisionWritePolicy`, `DecisionTypeRequiredPolicy`,
  `DecisionAllowedPolicy`, `PolicyAuthorizer::handle()` (a caught
  `Throwable` with code 0 answers 401). 3.4 and 3.3: no Done stage, no
  `returnToDone` route, no `ReturnToDone` decision.
- Introduced: `git blame` on lines 429–432 gives d52aa4c84b, the commit
  that added the route; GitHub lists `pkp/pkp-lib#12881` for it.
- Unverified: the thrown `Error` was read in the code, not seen.
- Who is refused: walked for the Journal editor, Press editor and
  Moderator; the other roles Impact lists follow from the code and the
  roles' stages in the dataset (OJS Journal editor, Section editor and
  Guest editor 1,3,4,5,6, Production editor 4,5,6; OMP Press editor and
  Series editor 1–6, Production editor 4,5,6; OPS Preprint Server
  manager and Moderator 5,6).
