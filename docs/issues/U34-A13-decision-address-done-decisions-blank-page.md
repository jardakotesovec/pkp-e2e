# An editor who types "Return to Workflow", "Move to Done" or "Return to Done" into a decision page's address gets a blank page

- **Severity** low
- **Effort** small
- **Kind** regression
- **Crash** server
- **Affects**
  - main: OJS, OMP, OPS
  - 3.5: none
  - 3.4: none (code)
  - 3.3: none (code; no decision page)
- **Introduced** `pkp/pkp-lib#12881` (with `pkp/ojs#5585`, `pkp/omp#2382`, `pkp/ops#1323`) for `pkp/pkp-lib#12799` · [d52aa4c84b](https://github.com/pkp/pkp-lib/commit/d52aa4c84b740ec537b13141f88401e8d2e4cdc4) · 2026-06-09 · Erik Hanson (ewhanson)
- **Upstream** none found (2026-11-11)
- **Tracked in** spec U34 [A13](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U34-editorial-decision-recording.md#a13)
- **Checked** 2026-11-11, each branch's tip (the commits in Evidence)
- **Model** claude-opus-5-5

## Summary

The server fails, and the page stays blank, when an editor changes the
decision number in a decision page's address to "Move to Done" (33),
"Return to Workflow" (34) or "Return to Done" (35). A decision button on
the workflow opens the decision page at an address that names the
decision by number (`decision=29` for "Move To Copyediting"). These
three are recorded elsewhere: "Move to Done" by the app when a
submission's first version is published, the other two by the
workflow's buttons of those names. The blank page has no heading, no
message and no way back but the browser's.

Other decisions the decision page cannot show are refused with an error
page. These three fail for any editor who may record decisions on the
submission: "Move to Done" and "Return to Done" on a submission in
Production, "Return to Workflow" on a published one. An editor limited
to recommendations is refused with the access-denied page instead.

## Impact

- **Lost**: nothing. No decision is recorded and the submission does not
  move.
- **Who**: an editor who edits the number in the address by hand. No
  link, button or email carries these addresses.
- **Way round**: publishing and the workflow's own "Return to Workflow"
  and "Return to Done" buttons do what these decisions are for.

Low: a refusal turned into a server error, on an address only a hand
edit reaches.

## Steps to reproduce

Preconditions: PKP's default test dataset for `main` (pkp/datasets
f3c795a4, 2026-11-10). Nothing else.

1. Sign in as `dbarnes` / `dbarnesdbarnes`.
2. Open "Genetic transformation of forest trees" (submission 5, in
   Production) from the dashboard and press "Move To Copyediting". The
   decision page opens, headed "Move To Copyediting", at
   `/index.php/publicknowledge/en/decision/record/5?decision=29&ret=dashboard%2Feditorial%3FworkflowSubmissionId%3D5%26currentViewId%3Dassigned-to-me`.
   [Press: "How Canadians Communicate: Contexts of Canadian Popular
   Culture" (4), the same button. Preprint server: "The influence of
   lactation on the quantity and quality of cashmere production" (1),
   "Decline Submission", which opens `…/decision/record/1?decision=8&ret=…`.]
3. In that address, change `decision=29` (`decision=8` on the preprint
   server) to `decision=33` and open it.
4. Change it to `decision=35` and open it. [Press and preprint server:
   the same, on the address of step 2.]
5. Change `record/5` to `record/1` ("Signalling Theory Dividends",
   published) and the decision to `decision=34`, and open it. [Press:
   `record/14`, "From Bricks to Brains: The Embodied Cognitive Science of
   LEGO Robots". Preprint server: `record/2`, "The Facets Of Job
   Satisfaction: A Nine-Nation Comparative Study Of Construct
   Equivalence", posted.]
6. On the preprint server, sign in as `sberardo` (Moderator, assigned to
   both preprints) and repeat steps 2 to 5.

**Expected**: each address of steps 3 to 5, and of their repeat in step
6, is refused with an error page, such as "404 Not Found", and nothing is recorded. (3.5, which has
none of the three decisions, refuses the same addresses with the
access-denied page reading "This decision could not be found. Please
provide a recognized decision type.")

**Observed**: each answers HTTP 500 with an empty page (no title, no
text), and the server logs (PHP 8.3):

```
PHP Fatal error:  Uncaught Error: Call to a member function getState() on null in …/lib/pkp/pages/decision/DecisionHandler.php:160
```

## Cause

`DecisionHandler::record()` (`lib/pkp/pages/decision/DecisionHandler.php`)
asks the decision type for its steps with `getSteps()` and, at line 160,
calls `$steps->getState()` on the result. `DecisionType::getSteps()` is
declared `?Steps`, and its documentation says a type returns null when
it "does not make use of the built-in UI for making the decision". The
handler never checks for that null.

`pkp/pkp-lib#12881` (for `pkp/pkp-lib#12799`, the Done stage) added the
first types that return null: `MoveToDone`, `ReturnToWorkflow` and
`ReturnToDone`. The app PRs added all three to every app's
`Repository::getDecisionTypes()`. So `DecisionTypeRequiredPolicy`
accepts their numbers (33, 34, 35). `DecisionStageValidPolicy` passes on
the stage each declares (Production for `MoveToDone` and
`ReturnToDone`, Done for `ReturnToWorkflow`), and `DecisionAllowedPolicy`
passes for a deciding editor. `record()`'s own guards (stage, review
round, retraction, recommendation) do not apply, and the null reaches
line 160.

The change records these three without the decision page.
`ApplyDoneWorkflowStage` records "Move to Done" when the first version
of record is published, from whatever stage the submission is in, and
"Return to Workflow" when the last published version of record is
unpublished. The workflow header's "Return to Workflow" posts decision
34 to `POST submissions/{id}/decisions`, and its "Return to Done" posts
to `POST submissions/{id}/returnToDone`. In the PR's review, the
reviewer noted that "neither decision [`MoveToDone`, `ReturnToDone`] is
meant to be triggered via the regular /decisions endpoint" and proposed
refusing them there in a later change. No issue for that change exists.

Reach:

- A plugin that adds a decision type without steps through the
  `Decision::types` hook meets the same failure (code).
- `record()` is the only caller of a decision type's `getSteps()` (code).
- `POST submissions/{id}/decisions` (`PKPSubmissionController::addDecision()`)
  does not call `getSteps()` and does not fail this way, and it must keep
  accepting 34 for the header's button. Read in the code, not sent: the
  same `DecisionWritePolicy` (with `SubmissionCompletePolicy`) and
  `Repository::validate()` also accept 33 and 35 there for a deciding
  editor on a submission in Production, since both declare that stage.
  `DecisionType::runAdditionalActions()` would then move the submission
  to Done and, for 33, set its status to published whether or not any
  version is published. For 35 it would skip the checks of
  `returnToDone()` (a Done history and a published version). No screen
  sends these requests.

## Proposed fix

Make `DecisionHandler::record()` refuse a decision type that has no
steps, as it already refuses the other decisions it cannot show, right
after it asks for them:

```diff
         $steps = $this->decisionType->getSteps(
             $this->submission,
             $context,
             $request->getUser(),
             $this->reviewRound
         );
 
+        // A decision type without steps (MoveToDone, ReturnToWorkflow, ReturnToDone) is recorded
+        // elsewhere and has no page here (DecisionType::getSteps())
+        if (!$steps) {
+            throw new \Symfony\Component\HttpKernel\Exception\NotFoundHttpException();
+        }
+
         $templateMgr = TemplateManager::getManager($request);
```

The diff is
[fix.diff](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/decision-address-done-decisions-blank-page/fix.diff).
Placed in the one caller of `getSteps()`, it covers every type without
steps, a plugin's included. It leaves the REST API and the policies,
which other callers share, alone.

Tried on `main` on all three apps: with the fix in, steps 3 to 6 answer
the "404 Not Found" page (status 404) with nothing in the server log.
Step 2's decisions still open the decision page, and a Section Editor
limited to recommendations still gets "You do not have permission to
record this decision on this submission.", with the fix in and out.

The REST route's acceptance of 33 and 35 (Cause, Reach) is better kept
out of this change. It needs a different rule (which system decisions
an API client may record, while 34 stays open for the header), it can
store a wrong status rather than fail, and it rests on a code read
only. It is worth its own issue, where the reviewer's idea below can be
weighed.

**Alternatives**:

- Refuse these types in the policies instead, so the decision page
  shows "This decision could not be found." as on 3.5. A policy cannot
  call `getSteps()` cheaply (it needs the editor and the review round,
  and builds the emails), so this needs a new method on `DecisionType`
  saying whether a type has a decision page. It also needs the refusal
  to apply to the page only, for example through a constructor argument
  of `DecisionWritePolicy`, because `POST submissions/{id}/decisions`
  shares the policy and must keep accepting 34. Worth it only if the
  team wants that message rather than "404 Not Found".
- Make `getStageId()` nullable and return null from `MoveToDone` and
  `ReturnToDone`, with `DecisionStageValidPolicy` denying on null, as
  the PR's reviewer suggested. That would refuse 33 and 35 on both the
  page and the REST route. "Return to Workflow" would still need the
  guard above. Plugins' decision types implement `getStageId()`, so the
  signature change is a larger decision of its own.

**What goes with it**: no stored data to repair; nothing to backport,
since 3.5 and older have no type without steps. The guard: an e2e test
that opens the decision page with 33 and 34 as an editor and expects a
refusal.

Small: a four-line guard in one file.

## Evidence

- Kept script:
  [walk.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/decision-address-done-decisions-blank-page/walk.js)
  with its
  [lib.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/decision-address-done-decisions-blank-page/lib.js),
  on a freshly loaded default dataset:
  `node bin/probe.js all shared/playwright/checks/issues/decision-address-done-decisions-blank-page/walk.js`
  (3.5: `PKP_E2E_LINE=stable-3_5_0` in front). `WALK_MODE=neighbour`
  runs only the neighbour check: step 2's decision addresses opened
  directly, and on OJS `sberardo`
  (limited to recommendations on submission 1) opening
  `…/decision/record/1?decision=34`.
- Fix trial:
  `node bin/try-fix.js apply shared/playwright/checks/issues/decision-address-done-decisions-blank-page/fix.diff ojs omp ops`,
  the script, the neighbour check with the fix in, `revert`, and the
  neighbour check again. The trial's walk opened the addresses without
  `ret` (`…/decision/record/5?decision=33`); without the fix those
  addresses fail exactly as the Steps' do, since `record()` does not
  read `ret`.
- Walked on PostgreSQL. The fault does not depend on the database.
- Tips: `main` OJS 99014b078f, OMP 8f51061e8, OPS 8f9b395427 (lib/pkp
  e2078ce20e); `stable-3_5_0` OJS 7cf6c9c60f, OMP 3f0fd0a7d, OPS
  e290d8d8af (lib/pkp 5af8e67ab4); `stable-3_4_0` lib/pkp 2dd24cc5ae;
  `stable-3_3_0` lib/pkp df738d3a66.
- 3.5, walked as the Steps (the production stage's button reads "Back
  To Copyediting" there; OJS 1, OMP 14 and OPS 2 are at Production,
  published): every address of steps 3 to 6 opened the access-denied
  page quoted in Expected, with no server error. Code: none of the three
  types exists, and `record()` has the same unguarded line 160.
- 3.4, code: `record()` has the same unguarded `$steps->getState()`
  (line 154), but every type in `classes/decision/types/` returns steps
  and the three types do not exist.
- 3.3, code: no `pages/decision/` and no `classes/decision/` in pkp-lib;
  decisions are recorded through the workflow's grid forms.
- Introduced: line 160 dates from
  [4138a6d62d](https://github.com/pkp/pkp-lib/commit/4138a6d62d9fc723aabb472eb33881cbbced2dc7)
  (Nate Wright, 2022-01-25, the 3.4 decision page), where
  `DecisionType::getSteps()` already allowed null. The null-returning
  types came with d52aa4c84b (pkp-lib) and the app commits a9282937f8
  (OJS), 6b8db17ac (OMP) and 818b388ed4 (OPS), merged 2026-06-29. The
  review comment in the Cause is
  [discussion_r3473964263](https://github.com/pkp/pkp-lib/pull/12881#discussion_r3473964263).
- Upstream: pkp/pkp-lib, the three apps and pkp/ui-library searched by
  the symptom and by the class names. The closest are
  `pkp/pkp-lib#12217` and `pkp/pkp-lib#9146` (other nulls in `record()`,
  closed).
- Not driven: `POST submissions/{id}/decisions` with 33 or 35 (Cause,
  Reach: code only, since no screen sends it).
