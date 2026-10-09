# An overdue task's "Edit" refuses every "Save" until its due date is moved to today or later

- **Severity** medium
- **Effort** small
- **Kind** defect
- **Affects**
  - main: OJS, OMP, OPS
  - 3.5: none (no tasks)
  - 3.4: none (code; no tasks)
  - 3.3: none (code; no tasks)
- **Introduced** `pkp/pkp-lib#11587` for `pkp/pkp-lib#10406` · [c8471d3156](https://github.com/pkp/pkp-lib/commit/c8471d315624671823afbb78a09e63afb63bad16) · committed 2025-07-31, merged 2025-08-05 · Vitaliy Bezsheiko (Vitaliy-1)
- **Upstream** none found (2026-10-09)
- **Tracked in** spec U37 [A34](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U37-tasks-and-discussions.md#a34)
- **Checked** 2026-10-09, each branch's tip (the commits in Evidence)
- **Model** claude-opus-5-5

## Summary

Once a task's due date has passed, its "Edit" window in a stage's "Tasks
& Discussions" refuses every "Save" that leaves the date as it is. The
window stays open with "Start date should be greater than or equal to
today" under "Due Date", even when only "Name" was changed or a
participant was added. A task has no start date: the message is about
the due date.

Whoever edits the task expects to rename it, give it an owner or add a
person without touching the deadline. The way round is to set "Due
Date" to today or later in the same window. That takes the "Overdue"
marking off the task; the missed date stays in the task's History, and
nothing else follows a task's due date.

The screens require a due date on every task, so every open task that
runs late is affected. That includes a task added automatically from a
template, which has no owner until someone edits it. On such a task an
edit that is accepted also records "Due date changed" in the History,
with the same date twice.

## Impact

- **Lost**: nothing stored; the changes wait in the open window until
  the date is changed. A new date ahead of today takes away the row's
  "This task is overdue…" line and the window's "Overdue" badge. The
  old date stays in the History ("Due date changed from … to …"), which
  only those who may edit the task can open. No reminder, email or
  count follows a task's due date, and a new date is mailed to nobody.
- **Who**: whoever may edit a task: the manager-level roles (Journal
  manager, Journal editor), the person who created it and its owner, on
  every open task past its due date. A task added automatically from a
  template waits without an owner, so giving it one after its date has
  passed meets the refusal.
- **Way round**: set "Due Date" to today or later and press "Save"
  again. The message that should lead there names a start date
  ([pkp-e2e#425](https://github.com/jardakotesovec/pkp-e2e/issues/425)).
  A task's name, participants, owner and message can be changed nowhere
  else. Starting, closing, deleting and answering an overdue task still
  work.

Medium: the save itself is refused, on every overdue task, and the way
round has to be guessed from a message about a start date. It is no
higher because that way round is one field in the same window and costs
only the task's "Overdue" marking.

## Steps to reproduce

Preconditions:

- PKP's default test dataset, `main` (OJS, OMP or OPS).
- The submission and a second person on its stage:
  - OJS: submission 3, "The Facets Of Job Satisfaction: A Nine-Nation
    Comparative Study Of Construct Equivalence" (Copyediting); the
    Copyeditor Maria Fritz (`mfritz`).
  - OMP: submission 7, "Accessible Elements: Teaching Science Online and
    at a Distance" (Copyediting); the Copyeditor Maria Fritz (`mfritz`).
  - OPS: submission 1, "The influence of lactation on the quantity and
    quality of cashmere production" (Production); its Author Carlo
    Corino (`ccorino`).

A task made in the window:

1. Sign in as `dbarnes` and open the submission's "Copyediting" stage
   (OPS: "Production").
2. Under "Copyediting Tasks & Discussions" (OPS: "Production Tasks &
   Discussions"), press "Add".
3. Fill in "Name": `hkrf overdue task`. Keep "Participants" as offered
   (Daniel Barnes ticked). Tick "Enter task information". Set "Due Date"
   to today. Under "Responsible to complete this task (Task owner)"
   choose Daniel Barnes. Keep the select below it at "Begin Task Upon
   Saving". Type the message `Please finish this.` and press "Save".
4. Wait until the next day. To go on today instead, move the task's
   stored due date back one day; the row then holds what step 3 would
   have stored the day before:

   ```sql
   -- PostgreSQL
   UPDATE edit_tasks SET date_due = date_due - INTERVAL '1 day' WHERE title = 'hkrf overdue task';
   -- MySQL, MariaDB
   UPDATE edit_tasks SET date_due = date_due - INTERVAL 1 DAY WHERE title = 'hkrf overdue task';
   ```

5. Open the stage again. The task's row shows its due date, now in the
   past. In the row's "More Actions", choose "Edit". "Due Date" shows
   the task's date.
6. Change "Name" to `hkrf overdue task renamed` and press "Save".
7. Reload the page (the browser asks whether to leave; leave), choose
   "Edit" again, tick the second person under "Participants", change
   nothing else, and press "Save".
8. Set "Due Date" to today and press "Save".

A task added automatically from a template (OJS and OMP; on OPS a
preprint has to be submitted in step 10):

9. Open Settings › Workflow › "Tasks and Discussions". Under "Production
   Stage" press "Add template". "Name" `hkrf template A`; tick "Enter
   task information"; "Due Date" "1 week from the creation date"; tick
   "Automatically add this task and/or discussion when a submission
   reaches the stage"; message `Please do this.`; "Save". Add
   `hkrf template B` the same way.
10. Open the submission again, press "Send To Production", "Continue"
    through the steps and "Record Decision". (OPS: sign in as `ccorino`,
    submit a new preprint, sign in as `dbarnes` again and open it.)
11. Open "Production Tasks & Discussions". Both tasks are listed under
    "Yet to begin", due in a week, with no owner.
12. On "hkrf template A" choose "Edit", tick Daniel Barnes under
    "Participants", choose him as the task's owner, and press "Save".
    Then choose "History" in the row's "More Actions".
13. Eight days later, or after the statement of step 4 with
    `INTERVAL '8 day'` (`INTERVAL 8 DAY`) and
    `title = 'hkrf template B'`, take step 12 on "hkrf template B".

**Expected**: steps 6, 7 and 13 each save: the window closes and the
task has its new name, participant or owner, with its due date as it
was. Step 12 saves, and the History records the participant and the
owner only.

**Observed**: steps 6, 7 and 13 are each refused. The window stays open
with the notice "The form was not saved because 1 error(s) were
encountered. Please correct these errors and try again.", "Please
correct one error." beside the buttons and, under "Due Date":

```
Start date should be greater than or equal to today
```

Each save answers `422` with that text as the `dateDue` error, and
"Save" is greyed until "Due Date" changes. The task keeps its name and
gains no participant and no owner.

Step 8 saves: the window closes, the second person is a participant,
and the row's "Due Date" is today. The task's History gains "Due date
changed from 2026-10-08 to 2026-10-09 by dbarnes on 2026-10-09".

Step 12 saves, and the History gains "Due date changed from 2026-10-16
to 2026-10-16 by dbarnes on 2026-10-09" beside the lines for the
participant and the owner.

Control: a task due in five days, made as in steps 2 and 3 and renamed
in "Edit", saves.

## Cause

The edit endpoint never asks whether the due date it receives is the
one the task already has. It treats the date as new twice: when it
checks the request, and when it saves it.

The check: `EditTask::rules()` (lib/pkp
`api/v1/submissions/tasks/formRequests/EditTask.php`, line 75) holds
`dateDue` to `after_or_equal:today` on every save. The rule compares the
submitted date with today and never with the stored one.

The window always sends the date. ui-library's `saveWorkItem()`
(`src/managers/DiscussionManager/useDiscussionManagerForm.js`, line 467)
puts the form's `dateDue` into every `PUT`, and the form takes it from
the task (line 351). The window cannot hold the date back, because the
same rules require `dateDue` on a task. The field's own `min: 'today'`
(line 353) greys the past days in the picker and does not stop "Save".

The save: `editTask()` (lib/pkp
`api/v1/submissions/tasks/EditorialTaskController.php`, line 389) writes
the validated request over the task, the repeated day included. A task
added at stage entry stores a time of day
(`Repository::autoCreateFromTemplates()` saves `Template::promote()`'s
`now()->add(…)`, `classes/editorialTask/Template.php` line 216). Its
first accepted edit resets the stored time to midnight, and
`logDueDate()` (line 1250), which compares old and new with
`Carbon::eq()`, records a change of date. Both sides print as the same
day.

The rule was written for a new date. Before c8471d3156 only `AddTask`
existed, with `'after:today'` on `dateDue`. c8471d3156
(`pkp/pkp-lib#10406`) added the edit endpoint by moving the rules into
the new `EditTask` and making `AddTask` extend it, so the rule began to
run against stored dates.
[be9d75f5c5](https://github.com/pkp/pkp-lib/commit/be9d75f5c5825732c927187083c0c94c0ca8df21)
later relaxed it to `after_or_equal:today`, which lets a task be edited
on its due date but not after.

Reach:

- Who meets it: `QueryWritePolicy` lets a manager or site
  administrator, the task's creator and its owner edit a task, and the
  row offers "Edit" and "History" to the same people
  (`useDiscussionManagerConfig.js`, `userHasWriteAccess()`) (code;
  walked as the Journal editor).
- Which tasks: `dateDue` is required when the item is a task, and the
  template window requires "Due Date" once "Enter task information" is
  ticked, so every task the screens make has one (code).
- The row menu's "Edit" was walked with a rename, an added participant
  and a new owner. A rewritten message and an attached file travel in
  the same request (code), and the task window's own "Edit" button
  opens the same form (code).
- A task from a template picked in the "Add" window goes through the
  form and is stored at midnight like any other (code). Only the tasks
  added at stage entry, or when a submission is submitted, store a time
  of day (walked on the three apps).
- A closed task is not reached: its "Edit" is greyed (ui-library
  `src/managers/DiscussionManager/useDiscussionManagerConfig.js`, line
  154) (code).
- `startTask()`, `closeTask()`, `openTask()`, `deleteTask()` and
  `addNote()` do not run `EditTask`, so an overdue task can be started,
  closed, reopened, deleted and answered (code).
- No other route changes a task's name, participants or owner (code).
- The due date's other readers are `TaskResource`, for the overdue line
  and the list's order, and the `EditorialTask` email variable. No
  scheduled task, reminder or notification reads it, and `editTask()`
  mails only the participants an edit adds (code).
- An API client that repeats the stored date in
  `PUT submissions/{submissionId}/tasks/{taskId}` is refused the same
  way.

## Proposed fix

Let the request say whether it repeats the task's due date, and use
that answer in both places: the rule runs only for a date that changes,
and a repeated date is not written back
([fix.diff](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/overdue-task-edit-refused/fix.diff)):

```diff
--- a/lib/pkp/api/v1/submissions/tasks/EditorialTaskController.php
+++ b/lib/pkp/api/v1/submissions/tasks/EditorialTaskController.php
@@ -386,6 +386,11 @@
 
         $validated = $illuminateRequest->validated();
 
+        // A repeated due date leaves the stored value, which may carry a time of day, as it is
+        if ($illuminateRequest->keepsDueDate()) {
+            unset($validated['dateDue']);
+        }
+
         if (!$editTask->update($validated)) {
             return response()->json([
                 'error' => __('api.409.resourceActionConflict'),
--- a/lib/pkp/api/v1/submissions/tasks/formRequests/EditTask.php
+++ b/lib/pkp/api/v1/submissions/tasks/formRequests/EditTask.php
@@ -72,7 +72,8 @@
                 Rule::requiredIf(fn () => $this->input('type') == EditorialTaskType::TASK->value),
                 Rule::prohibitedIf(fn () => $this->input('type') == EditorialTaskType::DISCUSSION->value),
                 Rule::date()->format('Y-m-d'),
-                'after_or_equal:today',
+                // A due date the edit repeats may already have passed; only a new date must be today or later
+                Rule::when(fn () => !$this->keepsDueDate(), ['after_or_equal:today']),
             ],
             EditorialTask::ATTRIBUTE_HEADNOTE => [
                 'sometimes',
@@ -316,6 +317,17 @@
     }
 
     /**
+     * Whether the request repeats the due date the task already has.
+     * The API gives and takes the date as a day; the stored value may carry a time of day.
+     */
+    public function keepsDueDate(): bool
+    {
+        return $this->task?->type == EditorialTaskType::TASK->value
+            && $this->task->dateDue
+            && $this->input('dateDue') === $this->task->dateDue->format('Y-m-d');
+    }
+
+    /**
      * Get the submission for the validation purpose.
      */
     protected function setSubmission(): Submission
```

The date still has to be today or later wherever it is new. An add has
no stored task (`$this->task` is null in `AddTask`). "Add Task Details"
turns a stored discussion into a task, and the method answers no for a
stored discussion. A changed date differs from the stored day.

The stored type is part of the condition for the API's sake. A `PUT`
that turns a task into a discussion leaves `date_due` in the row,
because `dateDue` is prohibited for a discussion and so is absent from
the validated data. Without the type condition, a later `PUT` that
makes it a task again with that old date would pass (code; no screen
sends either request).

The intent has a precedent in the sibling request for reviews:
`EditReview::rules()` (lib/pkp
`api/v1/submissions/reviewAssignments/formRequests/EditReview.php`,
lines 77 to 83) accepts a recommendation that is no longer active when
it is the one the review already has, through an `orWhere()` inside
`Rule::exists()`. The construct is new: lib/pkp's other `Rule::when()`
calls take a fixed condition (what the application supports, the
validation context), and none reads the stored model yet.

The field's `min: 'today'` stays. It is right for a date being picked,
and it did not stop the save of a window that shows a past date.

Tried on OJS, OMP and OPS `main`. Steps 6, 7 and 13 then save and the
task keeps its due date; step 12 saves with no "Due date changed" line,
and the stored time of day is kept. Three dates that must stay refused
are refused with the fix as without it: a past date typed into "Add",
an overdue task's date changed to another past date in "Edit", and a
past date in "Add Task Details" on a discussion.

**Alternatives**:

- Change the rule alone. That was the first diff tried, and steps 6
  and 7 then saved. On a task added at stage entry the save would still
  reset the time of day and log "Due date changed" with the same date
  twice, as step 12 shows it does today (code for the overdue task).
- Keep the rule in `AddTask` only and drop it from `EditTask`. An edit
  could then move a deadline to any past date typed into the box. That
  is a product call and loosens more than the fault needs.
- Have the window leave an unchanged date out of the request. The
  server requires `dateDue` for a task, so both sides would change, and
  an API client that repeats the date would still be refused.

**What goes with it**:

- No repair. History lines already written with the same date twice
  stay, and a task whose time of day an edit has reset keeps its day.
- The API changes only by accepting a repeated date it used to refuse.
- The fix of the refusal's wording
  ([pkp-e2e#425](https://github.com/jardakotesovec/pkp-e2e/issues/425))
  changes `messages()` in the same file. The two do not overlap.
- An e2e check: a task past its due date is renamed in "Edit" and keeps
  its date; a changed date before today is still refused; an edit of a
  task added at stage entry logs no change of date. lib/pkp has no unit
  test for the task form requests to extend.

Small: two short hunks in one repo, in the task's edit request and the
controller method that saves it, and a test.

## Evidence

- The kept script
  [walk.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/overdue-task-edit-refused/walk.js)
  (helpers in `lib.js` beside it) takes steps 1–8 and the control on
  each app, on an install freshly loaded from the default dataset:
  `PROBE_FEATURE=<feature> PROBE_AGENT=<id> node bin/probe.js all shared/playwright/checks/issues/overdue-task-edit-refused/walk.js`
  (`<feature>` is the folder under `.reports/` whose `fleet.json`
  names the dataset install, `<id>` any short name for the output
  folder; docs/process/harness.md "Dataset fleets"). `WALK=template` in
  front takes steps 9–13, on a freshly loaded install of its own.
  `WALK=neighbour` in front takes the three dates that must stay
  refused.
- Where the walks differ from the Steps: for steps 4 and 13 the script
  runs the PostgreSQL statement instead of waiting, and it sets "Due
  Date" with Playwright's `fill()` rather than the picker, which cannot
  pick a past day. Step 7's second person was Maria Fritz (OPS: Carlo
  Corino). On OPS the preprint of step 10 was "hkrf template preprint",
  submitted by `ccorino`.
- What the statement stands in for: time passing. It writes
  `edit_tasks.date_due`, which `EditorialTaskController::addTask()`
  fills from the window's "Due Date" (midnight of that day) and
  `Template::promote()` fills with the moment of creation plus the
  template's interval. Subtracting whole days gives the value the same
  code would have stored that many days earlier. The MySQL form was
  not run.
- Walked on OJS, OMP and OPS `main` on 2026-10-09, on PostgreSQL. The
  date rule runs in PHP, so it does not depend on the database. Dataset:
  pkp/datasets 1a196c3 (2026-10-08). The server's time zone
  (`time_zone` in the dataset's `config.inc.php`) and the browser's were
  both UTC. No server error and no script error was recorded.
- Stored values in step 12, OJS: `2026-10-16 05:25:09` before the edit
  and `2026-10-16 00:00:00` after it; with the fix, unchanged.
- After step 8 the row still reads "This task is overdue. Remind the
  task owner to complete it as soon as possible", because a task reads
  overdue on its due date: that is
  [pkp-e2e#418](https://github.com/jardakotesovec/pkp-e2e/issues/418),
  not this fault. The window's "Overdue" badge was read in the code
  (`useDiscussionManagerForm.js`, `getBadgeProps()`) and walked for
  that report, not here.
- The fix trial:
  `node bin/try-fix.js apply shared/playwright/checks/issues/overdue-task-edit-refused/fix.diff ojs omp ops`,
  a fresh install before each of the three walks, then `revert`. The
  three refused dates were also walked without the fix.
- `stable-3_5_0` walked on the three apps with the same script
  (`PKP_E2E_LINE=stable-3_5_0` in front). The stage offers "Copyediting
  Discussions" ("Discussions" on OPS) with "Add discussion", whose
  window has no task and no "Due Date", so the Steps cannot be taken
  there.
- Branch tips: OJS `main` 6d5b793c4e (lib/pkp d1bc3a9ecc), OMP `main`
  57a9235110 and OPS `main` fd78a0bcd8 (lib/pkp 27938abd4c), all three
  with lib/ui-library 38814ea1; `EditTask.php`,
  `EditorialTaskController.php` and `useDiscussionManagerForm.js` are
  the same in the three. `stable-3_5_0`: OJS c6e2c3a879 (lib/pkp
  d702d012dd), OMP ddc6abf5a9 and OPS dc8a938ab0 (lib/pkp 8094f06bf5),
  lib/ui-library 2576e00a. pkp-lib `stable-3_4_0` 8bf0ab5072 and
  `stable-3_3_0` 8c5b3f7f5c.
- Code reads of the older lines: `stable-3_5_0`'s lib/pkp has no
  `classes/editorialTask` and no `api/v1/submissions/tasks`; its
  discussions are saved by `QueryForm`
  (`controllers/grid/queries/form/QueryForm.php`), which has no due
  date. pkp-lib `stable-3_4_0` and `stable-3_3_0` hold no file under
  `classes/editorialTask` or `api/v1/submissions/tasks`, and their
  `QueryForm` has no due date either.
- The trace: `git blame` on `EditTask.php` line 75, then at
  be9d75f5c5's parent. The GitHub API names c8471d3156's PR as
  `pkp/pkp-lib#11587`; the commit is on pkp-lib `main` only.
- Every instance: a search of lib/pkp and the three apps for `after:`,
  `after_or_equal:`, `before:` and `before_or_equal:` in validation
  rules and schemas finds, beside this rule, only the date-range
  parameters of the statistics and SUSHI endpoints.
- Not driven: the MySQL statement; an edit by the task's creator or
  owner who is not a manager; the two `PUT`s that change a task's type.
- Tracker search on 2026-10-09 in pkp/pkp-lib, pkp/ojs, pkp/omp,
  pkp/ops and pkp/ui-library, by the symptom's words and by `EditTask`,
  `dateDue` and `after_or_equal`. The nearest hit is a comment of
  2025-10-21 on `pkp/pkp-lib#11825` about adding a task with a date
  close to today, which is the wording fault, not this one.
