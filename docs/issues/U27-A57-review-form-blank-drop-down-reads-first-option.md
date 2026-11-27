# A drop-down question the reviewer left blank reads as its first option in Review Details and the XML exports

- **Severity** medium
- **Effort** small
- **Kind** defect
- **Affects**
  - main: OJS, OMP
  - 3.5: OJS, OMP
  - 3.4: OJS, OMP (code)
  - 3.3: OJS, OMP (code)
- **Introduced** not traced; present since at least [f73899a0c2](https://github.com/pkp/pkp-lib/commit/f73899a0c253ebc50942610ab10c4c8cbf21be04) (2014-04-08)
- **Upstream** none found (2026-11-27)
- **Tracked in** U27 [A57](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U27-reviewer-assignment-and-management.md#a57)
- **Checked** 2026-11-27, each branch's tip (the commits in Evidence)
- **Model** claude-opus-5-5

## Summary

A reviewer leaves an optional "Drop-down box" question of the review
form blank and submits the review. The question's first option is
recorded as their answer: the editor's Review Details window shows it
under the question, and so do both XML exports, so the editor reads an
answer the reviewer never gave.

The blank is saved in the database as the first option, not only shown
that way, so every review already submitted this way holds it. Nobody is told. A blank
radio-button or checkbox question stays blank.

A new review form question is optional until its "Required" box is
ticked, so any drop-down question left optional is affected.

## Impact

- **Lost**: the true record of the review: an answer the reviewer
  never gave is kept as theirs.
- **Who**: editors, in Review Details and the XML exports, on a journal
  or press whose review form has an optional drop-down question. Read
  in the code, three more places show the same answer:
  - the reviewer's own read-only copy of the review;
  - the author's copy of the review and the reviews quoted in the
    default "Request Revisions", "Resubmit for Review" and "Decline
    Submission" emails, for a question shared with the author;
  - the public peer-review display of a review the editor makes public
    (OJS's article page, and the public peer-review API of OJS and
    OMP), with every question.
- **Way round**: none. Making the question required avoids it, at the
  cost of forcing an answer.

Medium: one answer of a review is wrong, silently, and only on a
drop-down question left optional and blank. It would be high if
editors and authors were shown to act on those answers.

## Steps to reproduce

Preconditions:

- PKP's default test dataset for `main`: OJS or OMP, the context
  `publicknowledge`.
- The dataset has no review form, so steps 1 to 4 make one, with a
  drop-down question and a radio-button question as the control, and
  give it to a reviewer with an unanswered request.
- On OJS, submission 7, "Developing efficacy beliefs in the classroom":
  Aisla McCrae (`amccrae`) has an unanswered review request, and Paul
  Hudson's review (no form) is completed. On OMP, submission 16, "A
  Designer's Log: Case Studies in Instructional Design": Al Zacharia
  (`alzacharia`) has an unanswered request, and Adela Gallego's review
  (no form) is completed.

Steps (OJS; OMP in brackets):

1. Sign in as `dbarnes` (password `dbarnesdbarnes`). Open Settings ›
   Workflow › "Review" › "Review Forms", press "Create Review Form",
   type the Title "u27hk27a review form" and press "Save".
2. On the form's row press "Edit", open the "Form Items" tab and press
   "Create New Item". Type the Item "u27hk27a drop-down", choose the
   Item type "Drop-down box", add the response options "u27hk27a Low"
   and "u27hk27a High" with "Add Item", leave "Required" unticked and
   press "Save". Create a second item the same way: "u27hk27a radio",
   type "Radio buttons (you can only choose one)", options "u27hk27a
   Yes" and "u27hk27a No". Close the window.
3. Tick the row's "Active" box and press "OK".
4. Open the submission's workflow
   (`/index.php/publicknowledge/en/dashboard/editorial?workflowSubmissionId=7`,
   16 on OMP). On Aisla McCrae's [Al Zacharia's] row choose "Edit",
   choose "u27hk27a review form" under "Review Form" and press "OK".
5. Sign in as `amccrae` [`alzacharia`] and open the review
   (`/index.php/publicknowledge/en/reviewer/submission/7`, 16 on OMP).
   Press "Accept Review, Continue to Step #2" (tick the privacy box when
   it shows), then "Continue to Step #3".
6. Leave "u27hk27a drop-down" on its empty choice and choose nothing
   under "u27hk27a radio". On OJS, choose "Accept Submission" under
   "Recommendation" [OMP: the step has no "Recommendation"]. Press
   "Submit Review", then "OK".
7. Sign in as `dbarnes` and open the workflow of step 4. Press "Read
   Review" on Paul Hudson's [Adela Gallego's] row, then "Download Review
   Form" › "Editor Form Shows All Review Sections (PDF)", and close the
   window. On a freshly loaded dataset the XML entries only work after
   a first review PDF has been downloaded (spec U27
   [A49](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U27-reviewer-assignment-and-management.md#a49)).
8. Press "Read Review" on Aisla McCrae's [Al Zacharia's] row. The
   "Review Details" window opens [3.5: it is headed "Review: <title>"
   and shows the reviewer's form read-only].
9. Press "Download Review Form", pick "Editor Form Shows All Review
   Sections (XML)" and open the file.
10. Press "Download Review Form", pick "Author-Only Sections Displayed
    (XML)" and open the file.

**Expected**: in step 8 "u27hk27a drop-down" reads unanswered, as
"u27hk27a radio" does. In both XML files the question's value is
empty, as the radio question's is:

```xml
<custom-meta><meta-name>u27hk27a drop-down</meta-name><meta-value></meta-value></custom-meta>
```

**Observed**: in step 8 Review Details shows "u27hk27a Low" under
"u27hk27a drop-down" [3.5: the read-only drop-down shows "u27hk27a Low"
chosen], while "u27hk27a radio" shows nothing chosen. Both XML files
read:

```xml
<custom-meta><meta-name>u27hk27a drop-down</meta-name><meta-value>u27hk27a Low</meta-value></custom-meta>
<custom-meta><meta-name>u27hk27a radio</meta-name><meta-value></meta-value></custom-meta>
```

In step 6 the drop-down still showed its empty choice when "Submit
Review" was pressed, and the request sent the drop-down's value as
empty (`reviewFormResponses[<id>]=`) and nothing for the radio
question.

## Cause

On the reviewer's step 3, the drop-down of a review form question is
rendered with an empty first choice (`defaultLabel="" defaultValue=""`
in `templates/reviewer/review/reviewFormResponse.tpl`, line 64), and
its real options take the values 0, 1, 2… So a question left blank
posts `""`. A radio group or checkbox group left blank posts nothing.

`PKPReviewerReviewStep3Form::saveReviewForm()` (lib/pkp
`classes/submission/reviewer/form/PKPReviewerReviewStep3Form.php`,
lines 307 to 315) passes every posted value on to
`Repo::reviewAssignment()->saveReviewFormResponse()`
(`classes/submission/reviewAssignment/Repository.php`, lines 441 to 445).
That method gives a drop-down answer the response type `int` and then
writes it with `ReviewFormResponseDAO::insertObject()`, or with
`updateObject()` when a row is already stored (an answer saved with
"Save for Later"). Both convert the value through `DAO::convertToDB()`,
which casts `(int) ''` to `0`. The stored row is `response_type` `int`,
`response_value` `0`: the first option's index. The rule it breaks is
that an empty choice is no answer.

The editor's own path already follows that rule.
`ReviewAssignmentController::edit()`
(`api/v1/submissions/reviewAssignments/ReviewAssignmentController.php`,
the save behind "Modify Review") first skips a value equal to the
stored one. Then, at lines 490 to 501, it calls
`saveReviewFormResponse()` only for a value that is not `null`, not
`''` and not an empty array. For a blank value it collects the
question's id in `$reviewResponsesToDeleteId`, and deletes those
answers later (line 539). The reviewer's path never had that check.

Reach (every reader takes the stored `0` as the first option):

- Review Details on `main` and both XML exports
  (`PKPReviewController::generateXML()`): seen on screen on OJS and OMP,
  `main` and 3.5.
- The PDF exports (`reviewDownload.tpl`) print the first option, read
  in the code. On `main` a review on a form cannot be downloaded as a
  PDF at all (issue report
  [U27-A55](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/issues/U27-A55-review-form-pdf-download-error-window.md)).
- The reviewer's own read-only form and the author's "Read Review"
  (`AuthorReviewerGridHandler`), which render the same template with
  the stored value selected: read in the code.
- The reviews quoted into decision emails
  (`ReviewerComments::getAllReviewerComments()`, the
  `{$allReviewerComments}` of the default "Request Revisions",
  "Resubmit for Review" and "Decline Submission" templates), only for
  questions included in the message to the author: read in the code.
- The public peer-review data of a review the editor made public
  (`SubmissionPeerReviewResource::getReviewFormQuestions()`, every
  question). Both apps' `main` route `api/v1/peerReviews` to the same
  lib/pkp `PeerReviewController`, so OJS and OMP serve it. Only OJS
  shows it on a reader page (the article page's `OpenReviewComponent`);
  OMP's pages do not use it. Read in the code; 3.5 has no such API.
- "Save for Later" goes through the same `saveReviewForm()`, so a blank
  drop-down saved for later reopens with the first option chosen, and
  is then submitted as an answer: read in the code (the 3.5 walk showed
  the same template rendering a stored `0` as the first option chosen).
- Radio buttons share the `int` branch but never post `''`, and
  checkboxes post nothing when left blank, so neither is affected
  (seen on screen for the radio question).
- Stored data: every review submitted on a form with a blank optional
  drop-down holds such a row, on every version back to 3.3.

## Proposed fix

Treat an empty choice as no answer in
`Repository::saveReviewFormResponse()`: delete any stored answer for
the question and return before the `int` cast
([fix.diff](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/review-form-blank-drop-down-reads-first-option/fix.diff)):

```diff
--- a/lib/pkp/classes/submission/reviewAssignment/Repository.php
+++ b/lib/pkp/classes/submission/reviewAssignment/Repository.php
@@ -440,6 +440,12 @@
                     break;
                 case ReviewFormElement::REVIEW_FORM_ELEMENT_TYPE_RADIO_BUTTONS:
                 case ReviewFormElement::REVIEW_FORM_ELEMENT_TYPE_DROP_DOWN_BOX:
+                    // An empty choice (the drop-down's blank option) is no answer: stored as an int it
+                    // would read as the first option. Clear any earlier answer instead.
+                    if ($reviewFormResponseValue === null || $reviewFormResponseValue === '') {
+                        $reviewFormResponseDao->deleteById($reviewAssignment->getId(), $reviewFormElementId);
+                        return;
+                    }
                     $reviewFormResponse->setResponseType('int');
                     $reviewFormResponse->setValue($reviewFormResponseValue);
                     break;
```

The guard belongs in the Repository. That method is the one writer of
review form answers, and the guard runs before it picks
`insertObject()` or `updateObject()`, so it covers a first save, a
submit over a row saved for later, and any plugin that calls it. The
editor's path reaches the same method but has already filtered blank
values out, so the guard never fires there and changes nothing for
it. The strict comparison keeps a real choice of the first option
(`"0"`). Deleting the row also clears an answer saved for later and
then blanked before the submit.

Tried on `main` in OJS and OMP, on a freshly loaded dataset: the Steps
gave the Expected. Review Details read "-" under "u27hk27a drop-down",
both XML files had an empty value for it, and no answer row was
stored. A reviewer who chose "u27hk27a Low" (the first option) and
"u27hk27a Yes" was also walked with the fix in and out, to check that
real answers are kept: both answers read the same in Review Details
and both XML files each time.

**Alternatives**:

- The same check in the reviewer form only (`saveReviewForm()`). It
  fixes both reviewer saves, but leaves the Repository writing `0` for
  any other caller that passes a blank.
- The controller's whole check in `saveReviewForm()`, for every
  question type. That also stops saving blank text answers as empty
  rows. Those rows are correct today, so the exports and the decision
  emails would change for blank text questions for no reason.

**What goes with it**:

- Data: the fix stops new wrong answers and cannot repair the old
  ones. A blank stored this way is the same row (`int`, `0`) as a real
  choice of the first option, and nothing else records the difference:
  the reviewer's submit writes no log entry of the answers. So no
  migration is part of the fix, and the effort stays small.
- Backport: 3.5, 3.4 and 3.3 have no `saveReviewFormResponse()`. The
  same check goes in the `DROP_DOWN_BOX` branch of the loop in
  `PKPReviewerReviewStep3Form::saveReviewForm()`, deleting with
  `$reviewFormResponseDao->deleteById()` and moving to the next
  question (`continue 2`).
- A blank drop-down then reads like a blank radio question everywhere,
  including the XML export's existing PHP warning for a question with
  no answer (`Undefined array key` in `generateXML()`, logged today
  for every blank radio question). A `?? null` there would silence
  both.
- Test: a unit test of `saveReviewFormResponse()` with `''` and `"0"`
  for a drop-down, or an end-to-end test that submits a form with a
  blank optional drop-down and reads Review Details.

A proposal. Small: one guard in one shared method, tried, plus the
test, with no data repair.

## Evidence

- Kept script:
  [walk.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/review-form-blank-drop-down-reads-first-option/walk.js)
  with its helpers in `lib.js` beside it. It takes steps 1 to 10 on an
  install freshly loaded with the default dataset (OPS has no review
  and is skipped), records the drop-down's options and what step 6
  posted, the answer under each question in Review Details, the text of
  both XML files and the server log at each press, and reads the stored
  answer rows from the database afterwards. A second mode takes the
  real-answer check of the fix trial: steps 1 to 5, the first option of
  each question chosen, steps 7 to 10.
- Walked on 2026-11-27 on OJS and OMP, `main` and `stable-3_5_0`, each
  install freshly reset to the default dataset (pkp/datasets 98360bca,
  PostgreSQL). Both lines gave the Observed on both apps. The stored
  row was `response_type` `int`, `response_value` `0` for the drop-down
  and none for the radio question. The only server log lines were PHP
  8.3 warnings at each XML press, `Undefined array key 2` in
  `PKPReviewController.php` (line 693 on `main`, 614 on 3.5): the radio
  question's missing answer. With the fix in, the drop-down's missing
  answer adds `Undefined array key 1` there. MySQL was not checked; the
  cast is PHP's, not the database's.
- 3.5 code (lib/pkp `stable-3_5_0`): the same template line; the cast
  is in `PKPReviewerReviewStep3Form::saveReviewForm()` itself (lines 319
  to 323, `setResponseType('int')`), with no empty-value check;
  `reviewDownload.tpl` prints `$possibleResponsesDropdown[$reviewFormResponses[$elementId]]`.
  3.5 has no `api/v1/peerReviews`.
- 3.4 and 3.3 code (lib/pkp `origin/stable-3_4_0`,
  `origin/stable-3_3_0`): the same template line with
  `defaultValue=""`; `saveReviewForm()` (3.3:
  `PKPReviewerReviewStep3Form.inc.php`) has the same `int` branch with
  no empty check; `DAO::convertToDB()` casts `(int)`. Neither has the
  review export; the editor's "Read Review" window
  (`templates/controllers/grid/users/reviewer/readReview.tpl`) includes
  `reviewFormResponse.tpl` with the stored value selected, so it shows
  the first option chosen. Not walked.
- Introduced: `git blame` on `Repository.php` lines 441 to 445 gives
  b5c86a8cb7 (`pkp/pkp-lib#13117`, 2026-08-18), which moved the code
  out of the reviewer form; at its parent, the form's lines go back to
  9ed41c4143 (2022, constant renames) and e3f570bc37 (2021, PSR-12
  formatting), and `git log -S` on the drop-down constant in
  `classes/submission/reviewer/form/` reaches 95936e46d0 (2013-05-17,
  the reviewer interface moved to lib/pkp). f73899a0c2 (2014-04-08,
  Alec Smecher, "*8674* Permit reviewer completion of review form based
  reviews") wrote `reviewFormResponse.tpl` with the drop-down's empty
  `defaultValue=""` beside that save loop. The older OJS 2.x reviewer
  form was not read, so the bullet says "present since at least".
- Every instance, read on `main`: `saveReviewFormResponse()` has two
  callers, the reviewer form and `ReviewAssignmentController::edit()`
  (which already filters `''`). The only other form that posts review
  form answers is the same `reviewFormResponse.tpl`. Radio and checkbox
  inputs post no value when left blank.
- Upstream search (2026-11-27), pkp/pkp-lib, pkp/ojs, pkp/omp and
  pkp/ui-library, by symptom words (review form drop-down blank, empty,
  first option, unanswered) and by `saveReviewFormResponse` and
  `reviewFormResponses`: `pkp/pkp-lib#13606` (open, radio and checkbox
  answers read by position against non-contiguous option keys in the
  exports), `pkp/pkp-lib#2437` (closed, the same for the "Add reviews to
  email" path) and `pkp/pkp-lib#2215` (closed 2017, empty drop-down
  option lists) are other faults; `pkp/pkp-lib#13176` is the PR that
  added the editor's edit path with its blank check.
- Tips walked or read: OJS `main` d37c63cc7c and OMP `main` 39fc76c2b,
  both with lib/pkp 44b36bf802 and ui-library 0549a357; OJS
  `stable-3_5_0` 810ed373fe and OMP `stable-3_5_0` d1c296edb, both with
  lib/pkp db49f73866 and ui-library fd00e45f; OJS `stable-3_4_0`
  86536a32bc and `stable-3_3_0` b33c96cb9b; lib/pkp `stable-3_4_0`
  762235e120 and `stable-3_3_0` 486ca25dac.
- Unverified: the reviewer's and the author's read-only copies, the
  decision emails, the open-review display and "Save for Later", all
  read in the code only.
