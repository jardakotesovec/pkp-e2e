# A Funding coordinator's search, filters and "Next" in the Add Reviewer window are refused

- **Severity** medium
- **Effort** medium
- **Kind** defect
- **Affects**
  - main: OJS, OMP
  - 3.5: OJS, OMP
  - 3.4: OJS, OMP (code)
  - 3.3: OJS, OMP (code)
- **Introduced** `pkp/pkp-lib#3411` and `pkp/ojs#1848` for `pkp/pkp-lib#2894` · [825ec249](https://github.com/pkp/pkp-lib/commit/825ec2493d98887251cd295a390a10899559f1d0) · 2018-01-26 · Nate Wright (NateWr); PRs opened by Bozana Bokan (bozana)
- **Upstream** none found (2026-11-16)
- **Tracked in** spec U27 [A51](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U27-reviewer-assignment-and-management.md#a51)
- **Checked** 2026-11-16, each branch's tip (the commits in Evidence)
- **Model** claude-opus-5-5

## Summary

A Funding coordinator assigned to a submission is offered "Add
Reviewer", and a reviewer chosen from the list the window first shows
is added. Every way of changing that list is refused with "Error" /
"The current role does not have access to this operation." / "OK":
Enter in "Search", "Clear search phrase", a filter's "Add filter" and
"Clear filter" buttons, and "Next". After "OK" the controls no longer
match the list: the box keeps the typed name, the filter button still
shows the filter as applied, and the page bar reads page 2, over the
list the window first showed.

So the coordinator can choose only among the first 30 entries, the
reviewers with the oldest accounts; anyone registered later cannot be
reached on screen.

It happens on every review round, past rounds included, and on a
press's Internal Review, for any assistant role with review-stage
access; Funding coordinator is the one default role of that kind.

## Impact

- **Lost**: no data. The coordinator cannot add any reviewer past the
  first 30. The stale controls mislead about what the list holds, not
  about whom they add: each entry and the request form ("Selected
  Reviewer") name the person (code).
- **Who**: an assistant-level participant (by default a Funding
  coordinator) whom an editor has assigned to a submission in review,
  each time they look for a reviewer.
- **Way round**: an editor adds the reviewer.

Medium: the add the role is given fails for every reviewer past the
first 30, and an editor has to step in. It stays below high because
only an assistant an editor has put on the submission meets it.

## Steps to reproduce

Preconditions:

- PKP's default test dataset for `main`: OJS (the journal
  `publicknowledge`) or OMP (the press `publicknowledge`). A preprint
  server has no review.
- The copyeditor `svogt` (Sarah Vogt) is given the Funding coordinator
  role and assigned to the submission in it (steps 1 to 3).
- For "Further pages" only: more than 30 reviewers. The dataset has 10
  on the journal and 9 external reviewers on the press, so 22 accounts
  register, signed out (the page shows no form to a signed-in user), on
  the context's "Register" page (`/index.php/publicknowledge/en/user/register`),
  each with "Yes, I would like to be contacted with requests to review
  submissions to this journal." ("… to this press.") ticked: `u27n16j01`
  to `u27n16j22`, named "Pat01 Pagerly" to "Pat22 Pagerly".

Setup:

1. Sign in as `admin` (`admin`). Open Administration, "Hosted Journals"
   ("Hosted Presses" on a press), and the context's "Settings wizard".
   On the "Users" tab search `svogt`, choose "Edit User" on Sarah Vogt,
   tick "Funding coordinator" and press "OK".
2. Sign in as `dbarnes` (`dbarnesdbarnes`). Open submission 7,
   "Developing efficacy beliefs in the classroom". On a press, use
   submission 16, "A Designer's Log: Case Studies in Instructional
   Design".
3. Under "Participants" press "Assign", choose "Funding coordinator",
   press "Search", pick Sarah Vogt and press "OK".

Search and filters:

4. Sign in as `svogt` (`svogtsvogt`) and open the same submission. It
   opens on its review round.
5. In "Reviewers" press "Add Reviewer". The window lists the
   reviewers.
6. Type `Julie` in "Search" and press Enter. On a press, type
   `Catherine`.
7. Press "OK".
8. Press "Clear search phrase", then "OK".
9. Press "Filters", then "Add filter: Rated at least", then "OK".
10. Press "Clear filter: Rated at least", then "OK".
11. Press "Select Julie Janssen" ("Select Catherine Turner" on a press)
    in the list, then "Add Reviewer".

Further pages (after the 22 registrations):

12. As `svogt`, open the same submission and press "Add Reviewer". Below
    the 30 entries the bar "View additional pages" reads "Previous",
    "1", "2", "Next".
13. Press "Next", then "OK".

**Expected**: the search, the filters and "Next" change the list for
the Funding coordinator as they do for the editor: "Julie" lists Julie
Janssen alone, and "Next" shows the entries from the 31st on. (Or, if
the role is not meant to search, the window does not offer these
controls.)

**Observed**: each of Enter, "Clear search phrase", "Add filter: Rated
at least", "Clear filter: Rated at least" and "Next" opens a dialog
"Error" with "The current role does not have access to this operation."
and "OK". The window's request is answered 401, for example:

```
GET /index.php/publicknowledge/api/v1/users/reviewers?contextId=1&submissionId=7&reviewRoundId=6&reviewStage=3&searchPhrase=Julie&count=30&offset=0

401
```

After "OK":

- step 7: the box keeps "Julie" over the unchanged list of all
  reviewers;
- step 9: the filter reads on ("Clear filter: Rated at least") over the
  unfiltered list;
- step 13: the bar reads "2" current, "Previous" enabled and "Next"
  disabled, over page 1's 30 entries, which end at "Pat20 Pagerly" on
  the journal and "Pat18 Pagerly" on the press. "Pat21" and "Pat22"
  (on the press "Pat19" to "Pat22") are reached by no control.

Step 11 works: "Julie Janssen was assigned to review this submission and
sent an email notification.", and after a reload her row reads "Request
Sent".

Control: `dbarnes` on the same submission gets 200 for the same
requests. "Julie" lists Julie Janssen alone, and "Next" shows "Pat21
Pagerly" and "Pat22 Pagerly". On the press "Next" shows "Pat22 Pagerly"
alone: the first page holds the three Internal Reviewers too, the API's
pages do not ([pkp-e2e#723](https://github.com/jardakotesovec/pkp-e2e/issues/723)).

## Cause

The Add Reviewer window and the list it reads admit different roles.

"Add Reviewer" in ui-library's `ReviewerManager` opens the legacy
grid's modal (`useReviewerManagerActions.js`, `showReviewerForm` on
`grid.users.reviewer.ReviewerGridHandler`). `PKPReviewerGridHandler::__construct()`
(lib/pkp `classes/controllers/grid/users/reviewer/`) grants
`ROLE_ID_ASSISTANT` every operation of the grid
(`_getReviewAssignmentOps()` and `_getReviewRoundOps()`) except
`createReviewer`, `enrollReviewer` and `gossip`, so an assistant
assigned to the review stage opens the window and adds a reviewer
(`updateReviewer`). `AdvancedSearchReviewerForm::fetch()` renders the
first page on the server (`PKPSelectReviewerListPanel::getItems()`, 30
entries by user id; its collector filters by context and reviewer role,
not by stage) and hands the list panel `apiUrl` `users/reviewers` with `getParams`
`contextId`, `submissionId`, `reviewRoundId` and `reviewStage`.

Every later change of the list (search phrase, filter, offset) is a
`GET users/reviewers` to `PKPUserController::getReviewers()`
(lib/pkp `api/v1/users/PKPUserController.php`). `getGroupRoutes()`
lists only `ROLE_ID_SITE_ADMIN`, `ROLE_ID_MANAGER` and
`ROLE_ID_SUB_EDITOR` in that route's `roleAuthorizer()`.
`PolicyAuthorizer` builds the role map from those lists and runs
`PKPUserController::authorize()` before the controller, where
`ContextAccessPolicy`'s `RoleBasedHandlerOperationPolicy` refuses the
assistant with `user.authorization.roleBasedAccessDenied` (401). The
list panel shows that message and keeps the controls' new state.

Reach:

- The `users/reviewers` route has no other caller in pkp-lib,
  ui-library, OJS or OMP (code).
- Any assistant-level group given a review stage, not only Funding
  coordinator (code: the grid and the route check the role, not the
  group).
- The window's reviewer suggestions (`submissions/{id}/reviewers/suggestions`,
  `ReviewerSuggestionController`) already admit `ROLE_ID_ASSISTANT`
  behind `SubmissionAccessPolicy` (code).

## Proposed fix

Admit assistants to the reviewers list, but only for the submission and
review stage the window is for, the same scope the reviewer grid gives
them. In `PKPUserController` (pkp-lib, shared by OJS and OMP):

- `getGroupRoutes()`: the `reviewers` route moves to a group of its own
  whose `roleAuthorizer()` also lists `ROLE_ID_ASSISTANT`. The other
  routes keep their roles.
- `authorize()`: for `getReviewers`, a user who is not a manager or
  section editor of the context nor a site administrator also passes
  `WorkflowStageAccessPolicy` on the request's `submissionId` and
  `reviewStage`, the two parameters the window already sends. A new
  helper, `isReviewManager()`, tells the two apart with
  `User::hasRole()`. That policy is what the reviewer grid itself uses for these users
  (`PKPReviewerGridHandler::authorize()`): the submission must be in
  the context, and the user assigned in a group that covers that stage.

The diff is
[fix.diff](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/assistant-add-reviewer-search-refused/fix.diff)
(one file, 37 lines added). Its core:

```diff
+        // The Add Reviewer window's list. Assistants may add reviewers (PKPReviewerGridHandler),
+        // so they may list them too, for a submission whose review stage they hold (authorize())
         Route::middleware([
             self::roleAuthorizer([
                 Role::ROLE_ID_SITE_ADMIN,
                 Role::ROLE_ID_MANAGER,
                 Role::ROLE_ID_SUB_EDITOR,
+                Role::ROLE_ID_ASSISTANT,
             ])
         ])->group(function () {
             Route::get('reviewers', $this->getReviewers(...))
                 ->name('user.getReviewers');
+        });
…
+        // An assistant lists reviewers only for the review stage of a submission they are
+        // assigned to, the request the Add Reviewer window sends (submissionId, reviewStage)
+        if ($actionName === 'getReviewers' && !$this->isReviewManager($request)) {
+            $this->addPolicy(new WorkflowStageAccessPolicy(
+                $request,
+                $args,
+                $roleAssignments,
+                'submissionId',
+                (int) $illuminateRequest->query('reviewStage'),
+                Application::WORKFLOW_TYPE_EDITORIAL
+            ));
+        }
…
+    protected function isReviewManager(PKPRequest $request): bool
…
+        return $user->hasRole([Role::ROLE_ID_MANAGER, Role::ROLE_ID_SUB_EDITOR], $context->getId())
+            || $user->hasRole([Role::ROLE_ID_SITE_ADMIN], Application::SITE_CONTEXT_ID);
```

Tried on `main`, OJS and OMP:

- With the fix, the Funding coordinator's search lists the one match,
  "Clear search phrase" restores the list, "Rated at least" filters
  (to "No items found." on the dataset's never-rated reviewers) and its
  "Clear filter" restores the list, the add still goes through, and
  "Next" shows what it shows `dbarnes`. No "Error" dialog opens.
- With the fix and without it, the Journal (Press) manager `rvaca`, who
  is not assigned to the submission, and on the journal the assigned
  Section editor `dbuskins` search and filter the same way, with 200
  throughout.
- That an assistant without the review stage is refused is read from
  the code (`UserAccessibleWorkflowStagePolicy`), not tested: such an
  assistant cannot open the round, so no screen sends the request.
- The press's first page and API pages still differ by stage. That is
  U27 OMP2,
  [pkp-e2e#723](https://github.com/jardakotesovec/pkp-e2e/issues/723),
  whose fix adds the stage filter to the panel's collector; this fix
  leaves it to that one.

**Alternatives**

- Hide the search, "Filters" and the page bar from roles the route
  refuses: the refusals go, but a coordinator still cannot reach a
  reviewer past the 30th, so the add the grid grants them stays half
  usable.
- Add `ROLE_ID_ASSISTANT` to the route alone: every assistant of the
  context (a copyeditor, a proofreader) could then list all reviewers
  with their review statistics without any assignment. The fix keeps
  the list to the submissions whose review they work on.
- Scope managers and section editors by the submission too: tighter,
  but it changes who the route admits today for no gain this finding
  needs.

**What goes with it**

- The REST API: `GET users/reviewers` newly answers an assistant who
  names a submission and stage they are assigned to; everything it
  answered before is unchanged. An assigned assistant who sends
  `reviewStage=1` passes the policy and gets no rows, since no reviewer
  group has that stage.
- No data repair. The diff applies unchanged to `stable-3_5_0`. On 3.4
  and 3.3 the route is `PKPUserHandler` (Slim) with the same role list:
  a backport adds the assistant there and the same stage policy in its
  `authorize()`.
- Guard: pkp-lib has no API controller tests to extend; an e2e test of
  an assigned Funding coordinator's search.

Medium: one pkp-lib file, but a change to who a REST route admits,
which needs its own review and a test with stage assignments.

## Evidence

- The script
  [walk.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/assistant-add-reviewer-search-refused/walk.js)
  (helpers in
  [lib.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/assistant-add-reviewer-search-refused/lib.js))
  takes the steps on OJS and OMP, then the control as `dbarnes`
  (`PART=pages`: steps 12 and 13 alone, on an install where 1 to 11 ran;
  `MODE=nb`: the other editorial roles' search and filter, `rvaca` and on
  OJS `dbuskins`):
  `PROBE_FEATURE=<feature> PROBE_AGENT=<id> node bin/probe.js ojs,omp shared/playwright/checks/issues/assistant-add-reviewer-search-refused/walk.js`.
- Database: PostgreSQL. Datasets: pkp/datasets 961a9871 (2026-11-15),
  `main` and `stable-3_5_0`.
- Branch tips. `main`: OJS 925ed49f3b, OMP 92dd31031, pkp-lib
  3ed5d1c3b3, ui-library 836c01b5 (the same in both apps). 3.5: OJS
  6cfc46e6fc (pkp-lib bb17ba1380), OMP 3f0fd0a7d (pkp-lib 5af8e67ab4),
  ui-library fd00e45f. 3.4: OJS 61835656a2, OMP 98db039f2, pkp-lib
  2dd24cc5ae. 3.3: OJS b83fb9e44d, OMP 31f5c517e, pkp-lib df738d3a66.
- 3.5 code: the same `PKPUserController` route groups and
  `PKPReviewerGridHandler` role assignments.
- 3.4 and 3.3 (code): `PKPUserHandler` registers `/reviewers` with
  `$roles = [ROLE_ID_SITE_ADMIN, ROLE_ID_MANAGER, ROLE_ID_SUB_EDITOR]`;
  `PKPReviewerGridHandler` grants `ROLE_ID_ASSISTANT` the add
  operations; `AdvancedSearchReviewerForm` hands the list panel
  `users/reviewers`; the default Funding coordinator group has stages
  1 and 3 (OJS) and 1, 2 and 3 (OMP) in both branches.
- Introduced: `git blame` on the route's role list in
  `PKPUserController::getGroupRoutes()` gives 373ab252c8
  (`pkp/pkp-lib#13440`, 2026-10-02), which only moved the list from the
  route group middleware into a group; before it 71e79e31e3
  (`pkp/pkp-lib#7698`, 2023) converted `PKPUserHandler`. The list came
  with the endpoint, pkp/ojs
  [2d50fa66d4](https://github.com/pkp/ojs/commit/2d50fa66d421eaa4ce337a578d242b1f630446b2)
  (2018-01-19, moved into pkp-lib by 0eb730fc7a on 2018-01-26), and the
  window started reading it in pkp-lib
  [825ec2493d](https://github.com/pkp/pkp-lib/commit/825ec2493d98887251cd295a390a10899559f1d0)
  (2018-01-26), both in the PRs above, merged 2018-02-21.
- Upstream: searched pkp/pkp-lib, pkp/ojs, pkp/omp and pkp/ui-library
  for the refusal text, "assistant", "Funding coordinator",
  `users/reviewers` and `PKPUserController`. `pkp/pkp-lib#12100`
  (results returned as an object) and `pkp/pkp-lib#10739` (no results
  without `reviewStage`) concern the same route, not the roles.
- Past round and Internal Review: not walked from these steps. They
  come from the U27 claim check K16a on `main`, 2026-11-16 (scratch
  journal and press, a submission on round 2 opened at round 1, OMP
  Internal Review), with the same 401 and error; kept script
  `shared/playwright/checks/U27/K16a/k16a.js`, parts `past` and `int`.
- Not walked: another assistant group given a review stage.
