# On a review with answers saved on a review form, both PDF entries of "Download Review Form" open an "Error" window and no file

- **Severity** medium
- **Effort** small
- **Kind** regression
- **Crash** server
- **Affects**
  - main: OJS, OMP
  - 3.5: none (unless `[general] strict = On`)
  - 3.4: none (code; no review download)
  - 3.3: none (code; no review download)
- **Introduced** `pkp/pkp-lib#11601` · [1810f38f34](https://github.com/pkp/pkp-lib/commit/1810f38f34c3fc0fb22640ac9fbc4e303fc6b942) · 2025-07-07 · Alec Smecher (asmecher)
- **Upstream** none found (2026-11-23); `pkp/pkp-lib#13606` (open) is another fault of the same PDF export (wrong checkbox and radio answers)
- **Tracked in** U27 [A55](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U27-reviewer-assignment-and-management.md#a55)
- **Checked** 2026-11-23, each branch's tip (the commits in Evidence)
- **Model** claude-opus-5-5

## Summary

The app fails on the server when anyone downloads, as a PDF, a review
whose reviewer saved an answer on a review form. In the review's
"Review Details" window, "Download Review Form" › "Editor Form Shows
All Review Sections (PDF)" and "Author-Only Sections Displayed (PDF)"
open an "Error" window with an "OK" button, and no file arrives, every
time.

Any saved answer is enough, whatever the question's type. A text or
drop-down question saves one even when the reviewer leaves it blank,
so nearly every review made on a form is affected. Only when every
question of the form has "Included in message to author" unticked does
the author-only PDF download. A free-form review's PDFs download.

"OK" returns to Review Details, where the two XML entries still
download and the answers can be read on screen. No released version
has the fault yet.

## Impact

- **Lost**: the PDF copy of a review made on a review form, the file an
  editor keeps or forwards to the author. Nothing stored is lost.
- **Who**: everyone the export is open to (journal or press managers,
  site administrators, editors, section or series editors, and
  assistants with access to the submission), on every review whose
  reviewer saved an answer on a review form.
- **Way round**: "Author-Only Sections Displayed (XML)" gives a file
  that leaves out the editor-only questions and names no reviewer, so
  it can go to the author, but as XML, not a document an author reads
  as it is. Otherwise the answers can be copied from the Review Details
  window into a document.

Medium: the PDF export fails every time on these reviews, but the same
review can be had as XML or read on screen. It would be high without
those ways round.

## Steps to reproduce

Preconditions:

- PKP's default test dataset for `main`: OJS or OMP, the context
  `publicknowledge`.
- The dataset has no review form, so steps 1 to 6 make one with one
  question, give it to a reviewer and have the reviewer answer it.
- On OJS, submission 7, "Developing efficacy beliefs in the classroom":
  Aisla McCrae (`amccrae`) has an unanswered review request, and Paul
  Hudson's review (no form) is completed. On OMP, submission 16, "A
  Designer's Log: Case Studies in Instructional Design": Al Zacharia
  (`alzacharia`) has an unanswered request, and Adela Gallego's review
  (no form) is completed.

Steps (OJS; OMP in brackets):

1. Sign in as `dbarnes` (password `dbarnesdbarnes`). Open Settings ›
   Workflow › "Review" › "Review Forms", press "Create Review Form",
   type the Title "u27n23l review form" and press "Save".
2. On the form's row press "Edit", open the "Form Items" tab, press
   "Create New Item", type the Item "u27n23l comments", choose the Item
   type "Extended text box" and press "Save". Close the window.
3. Tick the row's "Active" box and press "OK".
4. Open the submission's workflow
   (`/index.php/publicknowledge/en/dashboard/editorial?workflowSubmissionId=7`,
   16 on OMP). On Aisla McCrae's [Al Zacharia's] row choose "Edit",
   choose "u27n23l review form" under "Review Form" and press "OK".
5. Sign in as `amccrae` [`alzacharia`] and open the review
   (`/index.php/publicknowledge/en/reviewer/submission/7`, 16 on OMP).
   Press "Accept Review, Continue to Step #2" (tick the privacy box when
   it shows), then "Continue to Step #3".
6. Type "u27n23l answer" into "u27n23l comments". On OJS, choose
   "Accept Submission" under "Recommendation" [OMP: the step has no
   "Recommendation"]. Press "Submit Review", then "OK".
7. Sign in as `dbarnes`, open the workflow of step 4 and press "Read
   Review" on Aisla McCrae's [Al Zacharia's] row. The "Review Details"
   window opens [3.5: it is headed "Review: <title>"].
8. Press "Download Review Form" and pick "Editor Form Shows All Review
   Sections (PDF)".
9. Press "OK" on the window that opened.
10. Press "Download Review Form" and pick "Author-Only Sections
    Displayed (PDF)".

**Expected**: steps 8 and 10 each download
`submission_review_7-<review id>.pdf` [OMP:
`submission_review_16-<review id>.pdf`], reading the question "u27n23l
comments" and the answer "u27n23l answer", and the editor stays in
Review Details. The review id is the last number of the export request
below (11 on OJS and 22 on OMP on a freshly loaded dataset).

**Observed**: steps 8 and 10 each open a window headed "Error" over
Review Details, with an "OK" button, and no file arrives. Each press
sends the export request twice, because the page repeats a failed
request once on its own, and both answer 500:

```
GET /index.php/publicknowledge/api/v1/reviews/7/11/export-pdf?authorFriendly=0   500
GET /index.php/publicknowledge/api/v1/reviews/7/11/export-pdf?authorFriendly=1   500
```

The server log reads, at each request (PHP 8.3):

```
production.ERROR: Class "ReviewFormElement" not found {"exception":"[object] (Error(code: 0): Class \"ReviewFormElement\" not found at <install>/cache/t_compile/<hash>.file.reviewDownload.tpl.php:102)
```

After "OK" (step 9) the Review Details window is back with its
"Download Review Form" button. OMP shows the same with
`reviews/16/22`.

Control: on the same submission, "Read Review" on Paul Hudson's [Adela
Gallego's] row, then "Editor Form Shows All Review Sections (PDF)",
downloads the review's PDF.

## Cause

`PKPReviewController::generatePDF()` (lib/pkp
`api/v1/reviews/PKPReviewController.php`) renders
`templates/controllers/grid/users/reviewer/reviewDownload.tpl` with
mPDF. When the review has stored form answers, the template walks the
form's questions and picks how to print each answer by comparing the
question's type with the class constants, named by the class's old
global name (lines 65 to 92):

```smarty
{if in_array($reviewFormElement->getElementType(), [
ReviewFormElement::REVIEW_FORM_ELEMENT_TYPE_SMALL_TEXT_FIELD,
ReviewFormElement::REVIEW_FORM_ELEMENT_TYPE_TEXT_FIELD,
ReviewFormElement::REVIEW_FORM_ELEMENT_TYPE_TEXTAREA
])}
…
{elseif $reviewFormElement->getElementType() == ReviewFormElement::REVIEW_FORM_ELEMENT_TYPE_CHECKBOXES}
```

The class is `PKP\reviewForm\ReviewFormElement`. The global name
`ReviewFormElement` was a `class_alias` that `ReviewFormElement.php`
defined while strict mode was off (`strict` under `[general]` in
`config.inc.php`, a developer setting that is Off by default and makes
the code drop such old names).
`pkp/pkp-lib#11601` ("Remove class and constant aliases") deleted that
alias on `main`, and the template was not changed with it. The
compiled template now throws an `Error` at the first question it
reaches, that the class is not found, the request ends in a 500,
and the screen shows its error window.

When the PDF fails, and when it does not:

- Any saved answer takes the template into the loop, and every question
  it reaches meets the first comparison, so the question's type does
  not matter. The text questions (single word, single line, extended)
  save a row even when left blank, and so does a drop-down, which saves
  its first option (spec U27
  [A57](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U27-reviewer-assignment-and-management.md#a57)).
  Checkboxes and radio buttons save a row only when ticked.
- The author-only PDF skips a question not "Included in message to
  author" (`{continue}`) before the comparison, so a form whose every
  question is unticked there gives an author-only PDF with no question
  in it.
- A review with no saved answer takes the template's free-form branch
  and downloads: a free-form review (seen on screen), and, read in the
  code, a review on a form of only checkboxes and radio buttons left
  blank. How such a review's PDF reads is a separate finding (spec U27
  [A56](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U27-reviewer-assignment-and-management.md#a56)).

Reach:

- Both PDF entries (`authorFriendly=0` and `=1`), seen on screen on OJS
  and OMP as the Editor. The failure is in the rendering, so it is the
  same for every role the route admits (`PKPReviewController`: site
  administrator, manager, sub-editor, assistant).
- The XML entries are not affected: `generateXML()` names the class
  through its `use` import.
- The reviewer's own form (`templates/reviewer/review/reviewFormResponse.tpl`)
  writes `$reviewFormElement::REVIEW_FORM_ELEMENT_TYPE_…`, and the
  Review Details window is built in the browser from the API; both
  showed the question and the answer on screen.
- No other template in lib/pkp, OJS, OMP or OPS on `main`, nor a
  bundled plugin's template, names a class constant by a bare global
  class name. The Publication Facts plugin's PHP has the same kind of
  leftover from the same change, reported separately
  ([U13-OJS5](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/issues/U13-OJS5-publication-facts-panel-never-shown.md)).
- 3.5, released (3.5.0-6) and its branch, has the same template and
  defines the alias only while strict mode is off, so its PDFs
  download by default (seen on screen). With `strict = On` a 3.5
  install fails the same way (read in the code, not tried).

## Proposed fix

Name the constants through the element object, as the reviewer's own
form template `reviewFormResponse.tpl` already does for the same
questions
([fix.diff](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/review-form-pdf-download-error-window/fix.diff)):

```diff
--- a/lib/pkp/templates/controllers/grid/users/reviewer/reviewDownload.tpl
+++ b/lib/pkp/templates/controllers/grid/users/reviewer/reviewDownload.tpl
@@ -65,7 +65,7 @@
 		{if in_array($reviewFormElement->getElementType(), [
-		ReviewFormElement::REVIEW_FORM_ELEMENT_TYPE_SMALL_TEXT_FIELD,
-		ReviewFormElement::REVIEW_FORM_ELEMENT_TYPE_TEXT_FIELD,
-		ReviewFormElement::REVIEW_FORM_ELEMENT_TYPE_TEXTAREA
+		$reviewFormElement::REVIEW_FORM_ELEMENT_TYPE_SMALL_TEXT_FIELD,
+		$reviewFormElement::REVIEW_FORM_ELEMENT_TYPE_TEXT_FIELD,
+		$reviewFormElement::REVIEW_FORM_ELEMENT_TYPE_TEXTAREA
 		])}
 			<div class="section"><span>{$value|strip_tags|escape}</span></div>
-		{elseif $reviewFormElement->getElementType() == ReviewFormElement::REVIEW_FORM_ELEMENT_TYPE_CHECKBOXES}
+		{elseif $reviewFormElement->getElementType() == $reviewFormElement::REVIEW_FORM_ELEMENT_TYPE_CHECKBOXES}
```

and the same for `RADIO_BUTTONS` and `DROP_DOWN_BOX`. The object is
already in the loop, so the template needs no class registered and no
global name. Smarty also logs, at each compile of today's template,
that a static member of an unregistered class read in a template is
deprecated (`Use Smarty::registerClass`); with the fix the compile logs
nothing.

Tried on `main` in OJS and OMP, on a freshly loaded dataset: steps 8
and 10 downloaded the review's PDF, each reading "u27n23l comments"
and "u27n23l answer", the author-only one naming no reviewer, and no
request failed. To check that it reaches no further, the control
review's two PDF entries (a free-form review) were downloaded with the
fix in and out: the same size and the same text each time.

**Alternatives**:

- Write the full name, `\PKP\reviewForm\ReviewFormElement::…`. It
  works today, but it is an unregistered class in a template, the use
  Smarty logs as deprecated (as it does today for
  `\PKP\controllers\listbuilder\ListbuilderHandler::…`).
- Register the class in `PKPTemplateManager` beside `Submission` and
  `Role`. A global registration for one template, where the code's own
  FIXME there asks to register "closer to usage".
- Restore the alias. That undoes `pkp/pkp-lib#11601` for one template.

**What goes with it**:

- Backport: the diff applies to `stable-3_5_0` as written.
- Test: an end-to-end test that submits a review on a form and
  downloads both PDFs.

A proposal. Small: six constant names in one template, tried, plus the
test.

## Evidence

- Kept script:
  [walk.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/review-form-pdf-download-error-window/walk.js)
  with its helpers in `lib.js` beside it. It takes steps 1 to 10 and
  the control on an install freshly loaded with the default dataset,
  records the export requests and the server log at each press, and
  reads each downloaded PDF's text with the app's own pdf.js. Run it,
  after a reset of the install to the dataset, with
  `PROBE_FEATURE=<dataset fleet feature> PROBE_AGENT=<id> node bin/probe.js ojs shared/playwright/checks/issues/review-form-pdf-download-error-window/walk.js`
  (then `omp`; `PKP_E2E_LINE=stable-3_5_0` in front for 3.5).
  `MODE=nb` runs alone the check that the fix reaches no further: the
  free-form review's two PDF entries. The fix trial applied the diff with
  `node bin/try-fix.js apply shared/playwright/checks/issues/review-form-pdf-download-error-window/fix.diff ojs omp`,
  then ran a reset and the walk, a reset and `MODE=nb`, then `revert`
  with the same arguments, a reset and `MODE=nb` again.
- Walked on 2026-11-23 on OJS and OMP, `main` and `stable-3_5_0`, each
  install freshly reset to the default dataset (pkp/datasets abdb5d17,
  PostgreSQL). `main` gave the Observed above on both apps; the run's
  only server errors were the four export requests. 3.5 gave the
  Expected on both apps, the PDFs reading the question and the answer.
  MySQL was not checked; the fault is a missing class name, not a
  query.
- Not walked by the kept script: a blank submit, a form whose every
  question has "Included in message to author" unticked, and the
  Section or Series editor downloading the full PDF. An earlier check on the same `main`
  tips walked them on a scratch journal and press: a blank submit on a
  form with text and drop-down questions failed both PDFs, the
  unticked form failed only the full PDF, and the Section editor's
  full PDF failed (spec U27 footnote
  [f-a55](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U27-reviewer-assignment-and-management.md#fn-a55)).
- Tips walked or read: OJS `main` 1e1d3fc49b and OMP `main` bdfae3fe7,
  both with lib/pkp 3ea73a1a7e and ui-library 836c01b5; OJS
  `stable-3_5_0` 7f23f05a93 and OMP `stable-3_5_0` 272333e34, both
  with lib/pkp 9295edd4f0 and ui-library fd00e45f; lib/pkp
  `stable-3_4_0` 1310f00fed and `stable-3_3_0` cb68f48e99.
- 3.5 code (lib/pkp `stable-3_5_0`): `reviewDownload.tpl` has the same
  six bare names; `classes/reviewForm/ReviewFormElement.php` defines
  the `\ReviewFormElement` alias under `if (!PKP_STRICT_MODE)`;
  1810f38f34 is not on the branch. The 3.5 servers' logs carry the
  Smarty deprecation line at the template's compile:
  `Using unregistered static method "ReviewFormElement::REVIEW_FORM_ELEMENT_TYPE_SMALL_TEXT_FIELD" in a template is deprecated and will be removed in a future release.`
  `strict = On` was not walked.
- 3.4 and 3.3 code (lib/pkp `origin/stable-3_4_0`,
  `origin/stable-3_3_0`): no `reviewDownload.tpl`, no
  `api/v1/reviews/PKPReviewController.php` and no export route; the
  ui-library branches have no `export-pdf` call.
- Every instance, read on `main`: a search of every `.tpl` under
  lib/pkp, the three apps' `templates/` and their `plugins/` for a
  `Name::CONSTANT` without a namespace or an object finds only these
  six; every PHP file under lib/pkp, OJS's classes, controllers, pages
  and plugins that names `ReviewFormElement::` imports the class.
- Introduced: `git blame` on lines 65 to 92 gives d5d08a789a ("download
  review label added", RobA, 2024-07-01), which wrote the template when
  the alias existed; the line became wrong at 1810f38f34, which removed
  the alias from `ReviewFormElement.php`
  (`git show 1810f38f34 -- classes/reviewForm/ReviewFormElement.php`).
  `commits/1810f38f34/pulls` gives `pkp/pkp-lib#11601`, merged
  2025-07-07, which links no issue. The later
  `pkp/pkp-lib#12265` fix (cbd4e2ff29, 2026-01-28) changed the
  checkbox line of the same template and left the names alone.
- Upstream search (2026-11-23), pkp/pkp-lib, pkp/ojs, pkp/omp and
  pkp/ui-library, by symptom words and by `reviewDownload`,
  `export-pdf`, `generatePDF` and the missing class:
  `pkp/pkp-lib#12265` (closed) is a fatal error on the checkbox line on
  3.5, `pkp/pkp-lib#13606` (open) wrong checkbox and radio answers in
  the same exports, and `pkp/pkp-lib#13731` (open) PHP 8 warnings
  turned 500s elsewhere; none is this fault.
- Released 3.5 read in the code: lib/pkp tag `3_5_0-6` has the six
  bare names in `reviewDownload.tpl` and the alias under
  `if (!PKP_STRICT_MODE)`; `PKPApplication` sets `PKP_STRICT_MODE` from
  `[general] strict`.
