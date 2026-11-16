# A Journal Manager editing or deleting a reviewer recommendation a reviewer has just used gets an error that does not say why

- **Severity** low
- **Effort** small
- **Kind** defect
- **Affects**
  - main: OJS (OMP and OPS have no reviewer recommendations settings)
  - 3.5: none (code; no reviewer recommendations settings)
  - 3.4: none (code; no reviewer recommendations settings)
  - 3.3: none (code; no reviewer recommendations settings)
- **Introduced** `pkp/pkp-lib#10583` and `pkp/ojs#4505` for `pkp/pkp-lib#1660` · [d4f7d18e50](https://github.com/pkp/pkp-lib/commit/d4f7d18e50126adfccf6fb1a89cecc3585543597), moved into OJS by [b14943ce19](https://github.com/pkp/ojs/commit/b14943ce19af5ff72bf1b65a85109fb76c63bd83) · merged 2025-04-29 · Touhidur Rahman (touhidurabir)
- **Upstream** none found (2026-11-16)
- **Tracked in** spec U29 [A15](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U29-review-setup-and-review-forms.md#a15)
- **Checked** 2026-11-16, each branch's tip (the commits in Evidence)
- **Model** claude-opus-5-5

## Summary

A Journal Manager has the "Reviewer Recommendations" table open while a
reviewer picks one of the listed recommendations on a review, submitted
or only saved for later. The row keeps its "More Actions" menu with
"Edit" and "Delete" until the page is reloaded, although an entry a
review uses can no longer be edited or deleted.

"Save" in "Edit Recommendation" then shows the page notice "An
unexpected error has occurred. Please reload the page and try again."
"Yes" on "Delete Recommendation" opens a window headed "Error" that
reads only "##api.406.notAcceptable##". Neither tells the manager that
the entry is now in use.

## Impact

- **Lost:** nothing is stored wrong. The manager's change is refused
  as it should be, but the messages read as a failure of the site, and
  the delete one as a raw code. The fix proposed is the two messages; a
  table already open still offers the menu until a reload.
- **Who:** a Journal Manager on Settings › Workflow › "Review" ›
  "Reviewer Recommendations", only when a reviewer submits or saves for
  later with that entry between the page's load and the manager's
  "Save" or "Yes".
- **Way round:** a reload shows the entry without its "More Actions"
  menu; the manager can still deactivate it with its "Activate" tick.

## Steps to reproduce

Preconditions:

- PKP's default test dataset, OJS `main`, journal `publicknowledge`.
  "Accept Submission" is one of the journal's six starting
  recommendations, and no review in the dataset has chosen it.
- Two browsers (or a normal and a private window), because the manager
  and the reviewer are signed in at the same time.

Opening the table, before the review is submitted:

1. Browser 1: sign in as `rvaca` (Journal Manager).
2. Settings › Workflow › "Review" › "Reviewer Recommendations". The row
   "Accept Submission" has "More Actions" with "Edit" and "Delete".
3. Open the same page in a second tab of browser 1 (tab 2).
4. Tab 1: "More Actions" on "Accept Submission" › "Edit". In "Edit
   Recommendation", change the title field "Review Recommendations" to
   "Accept Submission u29n16f". Do not save yet.
5. Tab 2: "More Actions" on "Accept Submission" › "Delete". "Delete
   Recommendation" asks "Are you sure you want to delete the
   recommendation Accept Submission". Do not answer yet.

The reviewer submits:

6. Browser 2: sign in as `jjanssen` and open submission 12, "Sodium
   butyrate improves growth performance of weaned piglets during the
   first period after weaning"
   (`/index.php/publicknowledge/en/reviewer/submission/12`).
7. Tick the data-collection consent box, then "Accept Review, Continue
   to Step #2", "Continue to Step #3"; type a
   comment in the box for the author and editor, choose "Accept
   Submission" in "Recommendation", "Submit Review", "OK". "Review
   Submitted" shows.

Editing and deleting, in browser 1, without reloading:

8. Tab 1: "Save" in "Edit Recommendation".
9. Tab 2: "Yes" in "Delete Recommendation".
10. Reload tab 1 and open "Reviewer Recommendations" again.

**Expected:** at step 8 a page notice says that a review uses "Accept
Submission", so it cannot be edited; at step 9 the window says it cannot
be deleted. Nothing is changed.

**Observed:** at step 8 the window stays open and the page shows the
notice

```
An unexpected error has occurred. Please reload the page and try again.
```

The request behind it is refused:

```
POST /index.php/publicknowledge/api/v1/reviewers/recommendations/1   (X-Http-Method-Override: PUT)
406  {"error":"##api.406.notAcceptable##"}
```

At step 9 a window headed "Error" opens with only
"##api.406.notAcceptable##" and "OK" (the same address, a `POST` with
`X-Http-Method-Override: DELETE`, answered the same 406). Behind it the table is drawn again,
and "Accept Submission" now has no "More Actions". At step 10 the
entry reads "Accept Submission", with no "More Actions"; the reviewer's
choice is kept and nothing else changed.

## Cause

`ReviewerRecommendationController::edit()` and `delete()` (OJS,
`api/v1/reviewers/recommendations/ReviewerRecommendationController.php`,
lines 165-168 and 209-212) refuse an entry whose `removable` attribute
is false, that is, one some review assignment in the journal points to
(`ReviewerRecommendation::removable()`), whatever its state: a
submitted review, or a draft, since
`PKPReviewerReviewStep3Form::saveForLater()` stores
`reviewerRecommendationId` too. The response cannot explain that:
status 406 with the generic key `api.406.notAcceptable`.

That key names no reason, and today it has no text at all. It was added
to pkp-lib's `locale/en/api.po` with the feature ("The request can not
be processed.") and removed from it by `pkp/pkp-lib#11884` (for
`pkp/pkp-lib#10692`, merged 2025-10-02), while the OJS controller still
uses it. `__()` prints a missing key as `##key##`.

The two windows then print what they are given. The delete dialog
(`reviewerRecommendationManagerStore.js` `deleteRecommendation()`
through `useFetch`) shows the response's `error` whatever the status
(`modalStore.openDialogNetworkError()`), so it shows the raw key. The
edit window's `Form.vue` `error()` shows a server message only for 400
and 422 (field errors) and for 403 and 404; any other status gets
`common.unknownError`. Both reach the manager as a page-level notice,
not inside "Edit Recommendation".

The table itself reads `removable` once, from the
`GET reviewers/recommendations` the page makes when it opens, and nothing
redraws it when a reviewer submits or saves. That is why the row still offers
"Edit" and "Delete"; a page open while the data changes cannot know
otherwise, so the refusal's message is what has to explain it.

Reach:

- Both refusals in this controller (`edit`, `delete`) are the only uses
  of `api.406.notAcceptable` in OJS, pkp-lib and ui-library (code).
- `updateStatus()` has no such check: the "Activate" tick works on an
  entry in use (code).
- The same mistake elsewhere, a refusal naming a key with no text, is
  in `PKPJatsController` (`api.400.missingRequiredParameter`),
  `EditorialTaskController` (`api.403.forbidden`) and `SectionController`
  (`api.sections.*`, already reported for the sections endpoint); they
  are other endpoints and are left out (code).
- OMP and OPS have no reviewer recommendations settings
  (`hasCustomizableReviewerRecommendation()` is `false`, and the
  controller is OJS's alone) (code).

## Proposed fix

Refuse an entry in use the way pkp-lib's API refuses an action an
object's state forbids: status 403 with a message of its own, as
`PKPSubmissionController` does for a published publication
(`api.publication.403.cantDeletePublished`), with the two strings in
OJS's `locale/en/api.po`, since the controller is OJS's. `Form.vue`
prints a 403's `error` as a page notice and the delete dialog prints it
in its "Error" window, so ui-library is untouched.
`ContributorRoleController::delete()` refuses its in-use role with 406
and a real message, which works because only a dialog shows it; here
the edit form shows the refusal too, and it prints no 406 message, hence
403. The full diff is
[fix.diff](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/recommendation-in-use-edit-delete-unexplained/fix.diff):

```diff
--- a/api/v1/reviewers/recommendations/ReviewerRecommendationController.php
+++ b/api/v1/reviewers/recommendations/ReviewerRecommendationController.php
@@ public function edit(EditReviewerRecommendation $illuminateRequest): JsonResponse
         if (!$recommendation->removable) {
             return response()->json([
-                'error' => __('api.406.notAcceptable'),
-            ], Response::HTTP_NOT_ACCEPTABLE);
+                'error' => __('api.reviewerRecommendations.403.cantEditInUse'),
+            ], Response::HTTP_FORBIDDEN);
         }
@@ public function delete(Request $illuminateRequest): JsonResponse
         if (!$recommendation->removable) {
             return response()->json([
-                'error' => __('api.406.notAcceptable'),
-            ], Response::HTTP_NOT_ACCEPTABLE);
+                'error' => __('api.reviewerRecommendations.403.cantDeleteInUse'),
+            ], Response::HTTP_FORBIDDEN);
         }
--- a/locale/en/api.po
+++ b/locale/en/api.po
+msgid "api.reviewerRecommendations.403.cantEditInUse"
+msgstr "A review uses this recommendation, so it cannot be edited. It can still be deactivated."
+
+msgid "api.reviewerRecommendations.403.cantDeleteInUse"
+msgstr "A review uses this recommendation, so it cannot be deleted. It can still be deactivated."
```

Tried on OJS `main`, with an earlier wording of the two strings: step 8
showed its sentence as a page notice and step 9 in the "Error" window,
each answered 403; an entry no review uses ("Resubmit Elsewhere"
renamed, "See Comments" deleted) saved and deleted as before, with the
fix in and out. The wording above covers a draft too, whose choice can
still change.

**Alternatives:**

- Put `api.406.notAcceptable` back into pkp-lib's `api.po`: the delete
  window would read "The request can not be processed.", which still
  names no reason, and the edit notice would not change.
- Keep 406 and widen `Form.vue` `error()` to print the server's message
  for every 4xx: a second repository and a change to every form in the
  application, for a case the 403 convention already covers.
- Reload the table before opening "Edit" or "Delete", or after a
  reviewer submits: it narrows the window but cannot close it (the
  review can arrive while the window is open), so the message is needed
  anyway.

**What goes with it:**

- No stored data to repair; the endpoint is new in 3.6, so no released
  API client relies on the 406, and there is nothing to backport.
- The guard: a feature test in OJS that `PUT` and `DELETE` on an entry
  in use answer 403 with text.

Small: four lines in one controller and two strings, no ui-library
change; the table's reload is not part of it.

## Evidence

- Kept script:
  [walk.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/recommendation-in-use-edit-delete-unexplained/walk.js).
  It takes the Steps on PKP's default dataset (pkp/datasets 961a9871,
  2026-11-15), the manager in one browser with two tabs, the reviewer in
  a second; the reviewer's steps go through the suite's page object
  `performReview()` (`apps/ojs/playwright/pages/ReviewStagePages.js`).
  Run:
  `PROBE_FEATURE=<feature> PROBE_AGENT=<id> node bin/probe.js ojs shared/playwright/checks/issues/recommendation-in-use-edit-delete-unexplained/walk.js`
  (`MODE=neighbour` for the neighbour check). No response of 500 or
  more, no page error and no server log line in any run, the fix in or
  out.
- Tips, on PostgreSQL (the fault does not depend on the database):
  - main, walked: OJS 925ed49f3b, pkp-lib 3ed5d1c3b3, ui-library
    836c01b5.
  - 3.5, code: OJS 6cfc46e6fc, pkp-lib bb17ba1380, ui-library fd00e45f;
    3.4: OJS 61835656a2, pkp-lib 2dd24cc5ae, ui-library ee684b34; 3.3:
    OJS b83fb9e44d, pkp-lib df738d3a66, ui-library 96959f9e. Each has
    only the fixed `SUBMISSION_REVIEWER_RECOMMENDATION_*` constants of
    `ReviewAssignment`, no controller and no table.
- Code reads on main: `ReviewerRecommendationController.php` (`edit`,
  `delete`, `updateStatus`), `ReviewerRecommendation::removable()`,
  `reviewerRecommendationManagerStore.js`, `useFetch.js`,
  `modalStore.openDialogNetworkError()`, `Form.vue` `error()`,
  `PKPReviewerReviewStep3Form::saveForLater()`, the en `.po`
  files of OJS and pkp-lib (no `api.406.notAcceptable`), and
  `hasCustomizableReviewerRecommendation()` in each app's
  `classes/core/Application.php`. The 403 pattern:
  `PKPSubmissionController` (`api.publication.403.cantDeletePublished`,
  `api.publication.403.cantEditStatus`); the in-use sibling with a real
  message: `ContributorRoleController::delete()`
  (`manager.contributorRoles.error.delete.inUse`, 406, whose edit path
  has no such refusal). The other keys with no text came from a scan of
  every `__('api.…')` in OJS and pkp-lib against the en `.po` files.
- Introduced: `git blame` on the controller's lines 165-168 and 209-212
  gives b14943ce19 ("app specific files into OJS structure", 2025-03-03),
  which moved the file out of pkp-lib, where d4f7d18e50 (2024-11-06)
  wrote it and added `api.406.notAcceptable` ("The request can not be
  processed.") to `locale/en/api.po`; both reached `main` with the
  merges of `pkp/pkp-lib#10583` and `pkp/ojs#4505` on 2025-04-29. The
  text was removed by 4730f6707e (GaziYucel, 2025-09-16, "structured
  citations"), merged with `pkp/pkp-lib#11884` (bozana) on 2025-10-02;
  since then the delete window shows the raw key.
- Upstream: searched pkp/pkp-lib, pkp/ojs and pkp/ui-library, issues
  and PRs, open and closed, for the symptom's words (reviewer
  recommendation edit, delete, error, used in a review),
  `api.406.notAcceptable`, `notAcceptable` and
  `ReviewerRecommendationController`. The hits are the feature itself
  (`pkp/pkp-lib#1660`), its PRs and later work on the recommendations
  (`pkp/pkp-lib#12096`, `pkp/pkp-lib#12493`, `pkp/pkp-lib#13298`), none
  about this refusal.
- Unverified: the saved-draft case was read in the code, not walked;
  the revised wording of the two strings was not walked.
