# Reader comments reach across journals: another journal's tasks deleted, another journal's comments moderated

Defect (two, one controller). OJS at `3162c105bf`, OMP at `72a01a026`,
OPS at `e9f6f4f550` (lib/pkp `1ad4a14bb2`). (1) introduced by
pkp/pkp-lib#12407 (`677b737d20`, 2026-03-04, for issue pkp/pkp-lib#12401);
(2) present since the comments API was added. Reader comments are new in
3.6 (unreleased); stable-3_5_0 has none, so no released version is
affected. Tracked in spec U14's register (A11 for (1)) and in ci-triage
"Flake watch". Temporary: delete once acted on.

## Summary

Both come from `UserCommentController` never limiting what it touches to
the journal the request is made in.

1. When a moderator (or the comment's own writer) deletes a reader
   comment, the application also deletes the moderators' task about an
   unrelated report or comment in any journal on the install: the one
   whose report number, or comment number, happens to equal a number of
   the deleted comment. The other journal's moderators lose the "A report
   was submitted for a comment…" task with nothing shown.
2. The comments API finds a comment by its number alone. A Journal
   Manager of one journal can, through their own journal's address, read,
   approve, hide or delete any other journal's reader comments and read
   their reports; any signed-in account can file a report against another
   journal's comment, and the task for it lands in the wrong journal.

## Impact

(1) Any install with reader comments on, once comments and reports exist
in more than one place: the Tasks window is how moderators learn that a
comment was reported, and that prompt can vanish because of a deletion
elsewhere, silently; the report stays listed under Comments › "Reported".
It hits most on a small install, where the numbers are close. Minor:
nothing but the prompt is lost.

(2) No screen sends these requests; they take a request made by hand
with another journal's comment number (the numbers are sequential). A
manager-level account of one journal can moderate, and read the
unapproved comments and report reasons of, every other journal on the
install; any signed-in account can raise report tasks in the wrong
journal. Moderate for multi-journal installs: moderation crosses the
journal boundary that everything else in the application keeps. Should
be fixed before 3.6 ships.

## Steps to reproduce

Preconditions for both:

- A fresh OJS install with its default languages.
- Two journals, A and B, each with "Comments" switched on (Settings ›
  Website › Content › "Comments", "Save"), a Journal Manager, a
  published article, and two Readers.

**(1) A deletion in B removes A's report task**

1. In journal B, as a Reader, write a comment on B's article (the
   install's comment 1).
2. In journal A, as a Reader, write a comment on A's article (comment 2).
3. As A's Journal Manager, open Content › Comments, the comment's row
   "…" › "View", and press "Approve Comment".
4. As A's other Reader, open the article, the comment's "…" › "Report",
   type a reason and press "Report" (the install's report 1).
5. As A's Journal Manager press "Tasks": the window lists "A report was
   submitted for a comment and requires review by a moderator." with the
   reason under it.
6. As B's Journal Manager, open Content › Comments, the comment's row
   "…" › "Delete Comment", and confirm with "Delete" ("The comment has
   been deleted successfully.").
7. As A's Journal Manager press "Tasks" again.

**Expected**: B's deletion touches only the tasks about B's comment and
its reports; A's report task stays.

**Observed**: A's report task is gone from the Tasks window; Content ›
Comments › "Reported" still lists A's comment and its report.

Control: with no number in common (A's report written before B's comment
exists), the same deletion leaves A's task in place.

**(2) A's manager moderates B's comments through A's address**

1. In journal B, as a Reader, write a comment on B's article; note its
   number (the `commentId` in the address when B's Journal Manager opens
   it on B's Content › Comments page).
2. Sign in as A's Journal Manager (no role in B) and open any page of
   journal A. From the browser's developer console, send the requests
   the Comments page itself would send, with B's number and the page's
   token (`pkp.currentUser.csrfToken` as `X-Csrf-Token`):
   - `GET {A}/api/v1/comments/<B's number>`
   - `PUT {A}/api/v1/comments/<B's number>/setApproval` with `{"approved": true}`
   - `DELETE {A}/api/v1/comments/<B's number>`
3. As B's Journal Manager, open B's Comments page.

**Expected**: each request answers 404 (the comment is not journal A's),
and B's comment is untouched.

**Observed**: the `GET` answers 200 with B's comment, an unapproved one
included; `setApproval` answers 200 and approves it; `DELETE` answers 200
and B's comment is gone (a following `GET` answers 404).
`GET …/<B's number>/reports` and `…/reports/<id>` answer 200 with B's
reports and their reasons. As a plain Reader of A,
`POST {A}/api/v1/comments/<B's approved comment>/reports` with a note
answers 200 and files the report; the moderators' task is raised in A.

Control: the same requests naming A's own comment answer 200, as they
should.

## Cause

`lib/pkp/api/v1/comments/UserCommentController.php`:

- (1) `delete()` (lines 320–326) deletes the notifications with one query,
  `Notification::whereIn('assoc_type', [ASSOC_TYPE_COMMENT,
  ASSOC_TYPE_COMMENT_REPORT])->whereIn('assoc_id', array_merge([$commentId],
  $reportIds))->delete()`, which pairs every type with every number and
  has no journal condition.
- (2) `get()`, `delete()`, `setApproval()`, `getReports()` and
  `deleteReports()` load the comment with `UserComment::query()->find($commentId)`
  (the number alone), and `getReport()`/`deleteReport()` with
  `withCommentIds([$commentId])->withReportIds([$reportId])`; none compares
  the comment's `contextId` with the request's journal, while the list
  routes (`getMany()`, `getManyPublicComments()`) do scope with
  `withContextIds()`. The moderator routes check the manager role in the
  request's journal only (`roleAuthorizer`, `isModerator()`), so a manager
  of A passes and then names B's number. `submitReport()` sits in the
  signed-in group with no role check, and `notifyModerators()` raises the
  task for the request's journal.
- Also seen in the code, not driven (no screen sends it): `deleteReports()`
  passes `[$reportIds]`, a list inside a list, to `withReportIds()`, which
  Laravel's `whereIn` refuses unless the comment has exactly one report.

## Proposed fix

- (1) Two deletes: `(assoc_type = ASSOC_TYPE_COMMENT, assoc_id = $commentId)`
  and `(assoc_type = ASSOC_TYPE_COMMENT_REPORT, assoc_id IN $reportIds)`.
- (2) In each by-number handler, answer 404 when the loaded comment's
  `contextId` is not the request's journal (or scope every lookup with
  `withContextIds([$context->getId()])`), the report routes included.
- `withReportIds($reportIds)` in `deleteReports()`.

## Evidence

- (1) Found as the mechanism of the e2e suite's most frequent flaky read
  (U14 S5, S12, S13 on OJS, OMP and OPS: the report's task row missing,
  29 first-attempt reds on CI in five weeks): the suite's tests delete
  comments while others read their report tasks, and a reset database
  lines the numbers up. Reproduced 2026-09-26 on all three apps with a
  two-journal probe: the collision deleted the report task 4 of 4 times;
  without it the task stayed 3 of 3 (kept check
  `shared/playwright/checks/U14/delete-tasks/collide.js`).
- (2) Driven 2026-09-26 on fresh scratch journals on OJS, OMP and OPS:
  A's manager (no role in B) read B's unapproved and approved comments,
  read B's reports, approved B's pending comment, filed a report on B's
  approved comment (B's count 1 → 2, the task raised in A) and deleted
  B's comment, all through A's `api/v1/comments`; a plain Reader of A
  filed a report on B's approved comment (OJS; lib/pkp identical across
  the three). A's own comment through the same routes: 200 (control). No
  server error.
