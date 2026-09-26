# Deleting a reader comment removes another journal's "report" task

Defect. OJS at `3162c105bf`, OMP at `72a01a026`, OPS at `e9f6f4f550`
(lib/pkp `1ad4a14bb2`); introduced by pkp/pkp-lib#12407 (`677b737d20`,
2026-03-04, for issue pkp/pkp-lib#12401). stable-3_5_0: does not (no
reader comments there). Tracked in spec U14 register A11 and in
ci-triage "Flake watch". Temporary: delete once acted on.

## Summary

When a moderator (or the comment's own writer) deletes a reader comment,
the application also deletes the moderators' task about some other,
unrelated report or comment, in any journal on the install: the one whose
report number, or comment number, happens to equal a number of the
deleted comment. The other journal's moderators lose the "A report was
submitted for a comment…" task with nothing shown; the report itself
stays listed under Comments › "Reported".

## Impact

Any install with reader comments on, once comments and reports have been
written in more than one place: moderators rely on the Tasks window to
learn that a comment was reported, and that prompt can vanish because of
a deletion somewhere else, silently. Nobody sees an error; the report is
only found by opening Comments › "Reported" deliberately. The reverse
also happens (a comment's "A comment has been submitted…" task removed
because a comment elsewhere had a report with that number). A journal,
a press and a preprint server are all affected (shared code). Minor: nothing is lost from the database but the prompt, and it hits
most on a small install, where comment and report numbers are close.

## Steps to reproduce

Preconditions:

- A fresh OJS install with its default languages.
- Two journals, A and B, each with "Comments" switched on (Settings ›
  Website › Content › "Comments", "Save"), a Journal Manager, a
  published article, and two Readers.

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

**Expected**: journal B's deletion touches only the tasks about B's
comment and its reports; A's report task stays.

**Observed**: A's report task is gone from the Tasks window; Content ›
Comments › "Reported" still lists A's comment, and its panel still lists
the report.

Control: with no number in common (for example, A's report written
before B's comment exists), the same deletion leaves A's task in place.

## Cause

`lib/pkp/api/v1/comments/UserCommentController.php::delete()` (lines
320–326) deletes the notifications with one query,
`Notification::whereIn('assoc_type', [ASSOC_TYPE_COMMENT,
ASSOC_TYPE_COMMENT_REPORT])->whereIn('assoc_id', array_merge([$commentId],
$reportIds))->delete()`, which pairs every type with every number and has
no journal condition: deleting comment N also deletes the report task of
report N, and the comment task of any comment numbered like one of the
deleted comment's reports.

Also seen in the code, not driven (no screen sends it): `deleteReports()`
passes `[$reportIds]`, a list inside a list, to `withReportIds()`, which
Laravel's `whereIn` refuses unless the comment has exactly one report.

## Proposed fix

Two deletes: `(assoc_type = ASSOC_TYPE_COMMENT, assoc_id = $commentId)`
and `(assoc_type = ASSOC_TYPE_COMMENT_REPORT, assoc_id IN $reportIds)`,
optionally scoped to the comment's context; and `withReportIds($reportIds)`
in `deleteReports()`.

## Evidence

- Found as the mechanism of the e2e suite's most frequent flaky read (U14
  S5, S12, S13 on OJS, OMP and OPS: the report's task row missing, 29
  first-attempt reds on CI in five weeks): the suite's tests delete
  comments while others read their report tasks, and a reset database
  lines the numbers up.
- Reproduced 2026-09-26 on all three apps with a two-journal probe:
  the collision deleted the report task 4 of 4 times; without it, the
  task stayed 3 of 3 (`.reports/flake-s26/u14/diagnosis.md`, the
  session's scratch; the probe `collide.js` beside it).
