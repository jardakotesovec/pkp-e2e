# A task's or discussion's History lists the lines one save writes within a second oldest first

- **Severity** low
- **Effort** small
- **Kind** defect
- **Affects**
  - main: OJS, OMP, OPS (on PostgreSQL; MySQL and MariaDB not checked)
  - 3.5: none (no History for a discussion)
  - 3.4: none (code; no History for a discussion)
  - 3.3: none (code; no History for a discussion)
- **Introduced** `pkp/pkp-lib#12344` for `pkp/pkp-lib#12248` · [756d7004a1](https://github.com/pkp/pkp-lib/commit/756d7004a11f581e9757740ac2ed3c0a09ebaf1a) · merged 2026-02-15 · Vitaliy Bezsheiko (Vitaliy-1): the first save to log several lines at once; the sort meant to order them, which sorts nothing, followed in `pkp/pkp-lib#12451` · [c69d929b26](https://github.com/pkp/pkp-lib/commit/c69d929b26472e4e810aac9f294742eefe7f9a3e) · merged 2026-03-15
- **Upstream** none found (2026-10-09)
- **Tracked in** spec U37 [A33](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U37-tasks-and-discussions.md#a33)
- **Checked** 2026-10-09, each branch's tip (the commits in Evidence)
- **Model** claude-opus-5-5

## Summary

A task's or discussion's History (its row's "More Actions" › "History")
lists its events newest first. Two lines that one save writes within
the same second are the exception: the line saved first stands on top.
On PostgreSQL it did so in every History read, also when the same
History was opened again. Nothing in the application sets that order;
the database's answer does.

An "Edit" that adds a participant and a file saves the participant's
line, then the file's, within one second each time it was tried (nine
edits). The History lists "… added by …" above "{file name} uploaded
by …".

A reply with a file saves the reply's line, then the file's. When both
fall within one second, as in five replies of ten, the History lists
"{username} ({roles}) posted a response …" above "{file name} uploaded
by …". When the file's line falls in the next second, it stands on
top, as it should.

The row's "Activity" column takes the top of the same list. After that
edit it names "… added by …" as the item's latest change, beside the
latest reply, where the file was saved last. Both lines come from one
save, so nobody is led to a wrong action: the cost is a log that reads
one save against the order of the rest.

## Impact

- **Lost**: nothing. No line is missing or wrong.
- **Who**: whoever opens "History" or reads the "Activity" column of a
  stage's "Tasks & Discussions" panel. They meet it after every "Edit"
  that changes more than one thing, and after about half the replies
  with a file.
- **Way round**: none is needed. The two lines carry the same date and
  person, and their order changes nothing a reader would do.

Low: the order of two lines of one save, in a log that is otherwise
complete and right.

## Steps to reproduce

Preconditions:

- PKP's default test dataset for `main`, with nothing added.
- An install on PostgreSQL. The order of same-second lines is the
  database's own, and MySQL and MariaDB were not checked: they may list
  such lines the other way.
- The submission to open, at its Production stage, with the person to
  tick at step 4 and the person to tick at step 7:
  - OJS: submission 5, "Genetic transformation of forest trees"; David
    Buskins (`dbuskins`), then Stephanie Berardo (`sberardo`).
  - OMP: submission 4, "How Canadians Communicate: Contexts of Canadian
    Popular Culture"; Graham Cox (`gcox`), then Bart Beaty (`bbeaty`).
  - OPS: submission 1, "The influence of lactation on the quantity and
    quality of cashmere production"; David Buskins (`dbuskins`), then
    Stephanie Berardo (`sberardo`).
- Two small files on your computer, here `replacement.pdf` and
  `figure.png`.

Steps 7 and 8 show the fault every time. Steps 5 and 6 show it only
when the reply's two lines are saved within one second, which is
chance. The History shows a date without a time, so this query tells
which lines of the discussion share a second (`event_type` 1342177285
is a reply, 1342177287 a file, 1342177292 a participant added):

```sql
select l.log_id, l.date_logged, l.event_type
  from event_log l join edit_tasks t on t.edit_task_id = l.assoc_id
 where l.assoc_type = 1048586 and t.title = 'hkrh order'
 order by l.log_id;
```

A reply with a file:

1. Sign in as `dbarnes`.
2. Open the submission from the dashboard, then "Production" in the
   workflow's side menu.
3. Under "Production Tasks & Discussions", press "Add".
4. "Name": `hkrh order`. Tick the first person named above. Type `First
   message.` as the message. Press "Save".
5. Press the discussion's name, then "Add New Message". Type `A file for
   you.`, then "Attach Files" › "Upload File" › choose `replacement.pdf`
   › "Attach Files". Press "Save", then "Close".
6. On the row, open "More Actions" › "History".

Expected: newest first throughout. The reply's line is saved first and
its file's line second, so the file's line stands on top:

```
replacement.pdf uploaded by dbarnes on 2026-10-09        Download
dbarnes (Journal editor) posted a response on 2026-10-09
Discussion created by dbarnes (Journal editor) on 2026-10-09
```

Observed: on OJS as expected; its two lines were saved a second apart.
On OMP and OPS both lines were saved within one second, and the History
read (OMP shown; OPS reads "Preprint Server manager"):

```
dbarnes (Press editor) posted a response on 2026-10-09
replacement.pdf uploaded by dbarnes on 2026-10-09        Download
Discussion created by dbarnes (Press editor) on 2026-10-09
```

An earlier walk of the same steps on OMP saved the two lines a second
apart and listed the file's line first, as OJS did.

An edit that changes two things:

7. Close "History". Open "More Actions" › "Edit". Tick the second person
   named above. Under the message box: "Attach Files" › "Upload File" ›
   `figure.png` › "Attach Files". Press "Save".
8. "More Actions" › "History".

Expected: the edit's two lines on top. The participant's line is saved
first and the file's second, so the file's line stands on top:

```
figure.png uploaded by dbarnes on 2026-10-09        Download
sberardo (Section editor) added by dbarnes (Journal editor) on 2026-10-09
```

Observed, on all three (OJS shown; OMP reads "bbeaty (Author) added by
dbarnes (Press editor)", OPS "sberardo (Moderator) added by dbarnes
(Preprint Server manager)"). Both lines were saved within one second:

```
sberardo (Section editor) added by dbarnes (Journal editor) on 2026-10-09
figure.png uploaded by dbarnes on 2026-10-09        Download
```

Under them, the reply's two lines stood as they had at step 6.

On OMP the row's "Activity" column then listed "dbarnes (Press editor)
posted a response on 2026-10-09" and "bbeaty (Author) added by dbarnes
(Press editor) on 2026-10-09": the participant's line as the latest
change, where the file was saved last.

Lines saved in different seconds stand newest first throughout:
"Discussion created by …" stays at the bottom.

## Cause

The History is the `latestActivities` list that
`TaskResource::toArray()`
(`lib/pkp/api/v1/submissions/tasks/resources/TaskResource.php`) builds
from the item's event log entries. `EditorialTaskController` fetches
them through the event log `Collector` (`getTasks()`, line 345;
`getTaskData()`, line 707).

The `Collector`'s query (`lib/pkp/classes/log/event/Collector.php`,
`getQueryBuilder()`, line 116) orders by `date_logged` descending and
nothing else. `date_logged` holds whole seconds, so the entries of one
second come back in whatever order the database gives them.

PostgreSQL gave the short Histories of the Steps lowest id first, which
is the order the lines were saved in, on every read. It promises no
such order, and a longer list of the same query came back mixed: on
OMP, the Activity Log of submission 4 holds four lines of one second,
saved for files 25, 26, 27 and 28 in that order, and listed them 26,
25, 27, 28.

`TaskResource::toArray()` was meant to settle that order (lines 62–66):

```php
$activities = $activities->filter(fn (EventLogEntry $activity) => $activity->getAssocId() == $this->id)
    ->sortBy([
        'dateLogged' => 'desc',
        'id' => 'desc'
    ]);
```

This call sorts nothing, for two reasons:

- Laravel's `Collection::sortBy()` passes an array to `sortByMany()`,
  which reads each element's value as a property name, a `[name,
  direction]` pair or a comparison closure. Here the values are `'desc'`
  and `'desc'`; the keys are never read.
- An `EventLogEntry` is a `DataObject`: its values are behind
  `getData()`, not properties. `data_get($entry, 'dateLogged')` is
  `null` for every entry, so the pair form `[['dateLogged', 'desc'],
  ['id', 'desc']]` leaves the list as it is too.

Two saves write several lines at once:

- `addNote()` logs the reply with the message's creation time (line
  768), notifies the participants, then logs the reply's files with the
  current time (`logTaskFiles()`, line 786). The two times are the same
  second or a second apart, which is why the reply reads in either
  order.
- `editTask()` logs, back to back (lines 408–414), the participants
  added and removed, the files added and removed, a changed due date and
  a changed owner. Nothing slow runs between them, so they share a
  second unless the clock turns in between.

Reach:

- A task's History comes from the same code as a discussion's (code).
- The row's "Activity" column
  (`DiscussionManagerCellActivity.vue`) shows `latestActivities[0]`, or,
  when a reply was posted in the last seven days, that reply's line and
  the first other line (code; seen on OMP).
- The other readers of the `Collector` get same-second entries in the
  database's order too. A file's History lists them as fetched
  (`SubmissionFileEventLogGridHandler::loadData()`), and its "last
  event" is the first one fetched
  (`FileInformationCenterHandler::setupTemplate()`). Code.
- The submission's Activity Log reads the `Collector` five times
  (`SubmissionEventLogGridHandler`): once for the submission's own
  entries (`loadData()`), and four times for the lines of edited reviews
  (`getReviewChangeEntries()`, lines 310–329: comments, form responses,
  recommendations, competing interests). It merges them with the email
  log's lines and sorts by date alone, so same-second entries keep the
  order they were fetched in. Code; the submission's own entries were
  also read on screen, see Proposed fix.
- `submission\DAO` (line 290) reads the `Collector` to delete a
  submission's entries, where the order does not matter (code).
- No other call makes this mistake. The other `sortBy([...])` calls in
  pkp-lib and the apps (five in pkp-lib, one in OJS) pass comparison
  closures, and the `sortBy('…')` calls sort arrays or, for a task's
  messages, Eloquent models, which `data_get()` can read (code).

How it came about, change by change:

- 13653090ce (2023, for `pkp/pkp-lib#8933`) wrote the `Collector` with
  its order by date alone.
- b641a430ff (2026-01, for `pkp/pkp-lib#12243`) built the History from
  the entries as the `Collector` returns them. Each save then logged one
  line.
- 756d7004a1 (`pkp/pkp-lib#12344`) made "Edit" log its files, its due
  date and its owner back to back: the first lines to share a second,
  listed in the database's order.
- c69d929b26 (`pkp/pkp-lib#12451`) added the sort above, the reply's "…
  uploaded by …" line and the participants' lines. The order of
  same-second lines stayed the database's.

## Proposed fix

Give the event log's query a second order column, and take the sort
that never sorted out of `TaskResource`
([fix.diff](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/history-same-second-order/fix.diff)):

```diff
--- a/lib/pkp/classes/log/event/Collector.php
+++ b/lib/pkp/classes/log/event/Collector.php
@@ getQueryBuilder()
             ->orderBy('date_logged', 'desc')
+            // date_logged holds whole seconds: of the entries of one second, the latest saved first
+            ->orderBy('e.log_id', 'desc')
--- a/lib/pkp/api/v1/submissions/tasks/resources/TaskResource.php
+++ b/lib/pkp/api/v1/submissions/tasks/resources/TaskResource.php
@@ toArray()
-        $activities = $activities->filter(fn (EventLogEntry $activity) => $activity->getAssocId() == $this->id)
-            ->sortBy([
-                'dateLogged' => 'desc',
-                'id' => 'desc'
-            ]);
+        // Already newest first, and of one second the latest saved first: the event log Collector's order
+        $activities = $activities->filter(fn (EventLogEntry $activity) => $activity->getAssocId() == $this->id);
```

The order belongs to the query. The `Collector` already says "newest
first" for every reader of the log, and `log_id` grows with each entry
saved, so "highest id first" is the "latest saved first" that the sort
in `TaskResource` asked for. `PKP\author\Collector` breaks its ties the
same way (`orderBy('a.seq')`, then `orderBy('a.author_id')`), and 3.3's
`EventLogDAO` ordered the log by `log_id DESC`.

The column carries the query's alias, as `DAO::getIds()` writes it
(`'e.' . $this->primaryKeyColumn`). `event_log_settings` has a `log_id`
too, and a listener of the `EventLog::Collector::getQueryBuilder` hook
that joins it would otherwise meet an ambiguous column.

Tried on all three apps. After step 6 the History listed
"replacement.pdf uploaded by …" above "… posted a response …", and
after step 8 "figure.png uploaded by …" above "… added by …", on each
app. The edit's two lines were saved within one second on each, and the
reply's on OJS and OMP. The row's "Activity" column listed the reply's
line and "figure.png uploaded by …".

The fix reaches the other readers of the log, as it is meant to. The
submission's Activity Log, read with the fix in and out on the same
data, listed the same lines (30 on OJS, 40 on OMP, 14 on OPS) with the
same dates top to bottom. Only lines of one second changed places, into
latest saved first: none on OJS, eight on OMP, two on OPS.

The lines of edited reviews in the Activity Log get the same order, by
the code alone: the default dataset holds no such entry, so none of the
three logs showed one.

**Alternatives**

- Repair the sort in `TaskResource` with two comparison closures (`fn
  ($a, $b) => $b->getDateLogged() <=> $a->getDateLogged()`, then the
  same on `getId()`), the form the other `sortBy([...])` calls use. It
  orders the History (checked in PHP, not walked). It sorts in PHP what
  the query can order, and leaves a file's History, its "last event"
  and the Activity Log in the database's order.

**What goes with it**

- No data repair: only the order of reading changes.
- The tasks API's `latestActivities` and the builder handed to the
  `EventLog::Collector::getQueryBuilder` hook change only in the order
  of same-second entries.
- 3.5 and 3.4 carry the same `Collector` line, for the Activity Log and
  a file's History. The `Collector` hunk applies there as written if the
  team wants the same order on them; that is a guess from the code, not
  walked.
- A guard. lib/pkp has no test of the event log to extend (no
  `tests/classes/log`), so it is a new test class. A test that saves two
  entries with one `date_logged` and expects the later one first is red
  before the fix only where the database returns the earlier one first,
  as PostgreSQL did here for a short list; on pkp-lib's MySQL and
  MariaDB jobs that is not known. A test of the order clauses
  `getQueryBuilder()` builds would not depend on the database (a
  suggestion, not tried). The same limit holds for the U37 e2e scenario
  for the History, a **Planned** item in the spec.

Small: one line in the `Collector` and five lines out of `TaskResource`,
in one repository, with a new test class.

## Evidence

- Kept walk:
  [walk.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/history-same-second-order/walk.js)
  takes the Steps as `dbarnes` on each app:
  `PROBE_FEATURE=<dataset fleet> PROBE_AGENT=<id> node bin/probe.js all shared/playwright/checks/issues/history-same-second-order/walk.js`.
  After each "History" it runs the Steps' query, which is how the
  report knows which lines shared a second and in which order they were
  saved.
- What else the fix reaches:
  [neighbour.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/history-same-second-order/neighbour.js),
  run the same way after the walk, with the fix in and out and no reset
  between. `dbarnes` opens the same submission's "Activity Log" and
  every line of "History" is read.
  - Each log held the submission's own entries and the email log's
    lines, and nothing else: 16 + 14 on OJS, 26 + 14 on OMP, 8 + 6 on
    OPS. No install held an entry of an edited review (`select count(*)
    from event_log where assoc_type in (517, 1048595)`: 0).
  - The lines that changed places on OMP were the four "Revision "…"
    was uploaded for file 25…28." lines of one second and two pairs
    "The metadata for file "…" was edited by bbeaty." / "Revision "…"
    was uploaded for file …."; on OPS "Preprint submitted" and a "The
    metadata for file …" line. OJS's one same-second pair reads
    "Submission metadata updated" twice, so nothing shows.
  - Without the fix two more same-second pairs on OMP already stood
    latest first.
- The fix's trial: `node bin/try-fix.js apply
  shared/playwright/checks/issues/history-same-second-order/fix.diff ojs
  omp ops`, a freshly loaded dataset, the walk with `PROBE_RUN=fix2` and
  neighbour.js with `PROBE_RUN=nb2-in` in front, then `node
  bin/try-fix.js revert` with the same arguments and neighbour.js with
  `PROBE_RUN=nb2-out`. It was run twice: first with the column written
  `log_id`, then as the diff now stands, with `e.log_id`. Both gave the
  same results.
- The sort in PHP:
  [sortcheck.php](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/history-same-second-order/sortcheck.php),
  run from an app root, builds six `EventLogEntry` objects in a
  `LazyCollection` and prints the ids each `sortBy()` form leaves: the
  form in `TaskResource` and the pair form leave `5, 2, 3, 4, 1, 6` as
  it was, two closures give `6, 5, 4, 3, 2, 1`. Same on the three apps'
  lib/pkp (Laravel 12.65.0).
- Walked on OJS, OMP and OPS `main` on 2026-10-09 on PostgreSQL, each
  walk on a freshly loaded dataset (pkp/datasets 1a196c3, 2026-10-08).
  No request failed and no page script failed. MySQL and MariaDB not
  checked: the test installs run PostgreSQL.
- The counts. The Steps were taken ten times in all: four without the
  fix (OJS, OMP twice, OPS) and six with it (the two trials).
  - The edit's two lines shared a second in all nine edits (the first
    OMP walk stopped before its edit). The three without the fix listed
    them as Observed says.
  - The reply's two lines shared a second in five replies of ten. Two
    of those were without the fix (OMP at 05:24:41, OPS at 05:21:12) and
    listed the reply's line on top, at step 6 and again at step 8. The
    other two without the fix were saved a second apart (OJS 05:20:02
    and 05:20:03; OMP's first walk 05:20:26 and 05:20:27) and listed the
    file's line on top.
- Where the walk differed from the text: OMP was walked twice, the
  first time with a second person the stage does not offer; that walk
  is the "earlier walk" of Observed.
- `stable-3_5_0`: walked on the three apps with the same script
  (`PKP_E2E_LINE=stable-3_5_0 PROBE_RUN=r35` in front). The stage has
  the older "Production Discussions" grid; "Add discussion" with a
  person, a subject, a message and replacement.pdf, then the row's
  actions: "Edit" and "Delete" only, no History.
- Code reads:
  - The cause, on `main`. `TaskResource.php`,
    `EditorialTaskController.php` and `Collector.php` are the same files
    in the three apps' lib/pkp. `sortByMany()` was read in the bundled
    `Illuminate\Collections\Collection` (from line 1623).
  - The database's own order: on the OMP install, `select log_id from
    event_log where assoc_type = 1048585 and assoc_id = 4 order by
    date_logged desc` returned the four entries of 12:13:49 as 109, 107,
    111, 113 (files 26, 25, 27, 28) and the same-second pairs as 103,
    101; 97, 99; 95, 93; 89, 91.
  - The search for other instances: `sortBy(` and `sortByDesc(` with an
    array or a string argument, in each app's own code and its lib/pkp
    (classes, api, controllers, pages, jobs, plugins).
  - The hook: no listener of `EventLog::Collector::getQueryBuilder` in
    lib/pkp or in the three apps' own code and plugins.
  - `stable-3_5_0` lib/pkp has no `classes/editorialTask`, no tasks API
    and no `submission.event.task.*` texts; its `QueriesGridRow` offers
    `editQuery` and `deleteQuery`. Its `Collector` orders by
    `date_logged` alone (line 101).
  - pkp-lib `stable-3_4_0` and `stable-3_3_0`: `QueriesGridRow` offers
    only `editQuery` and `deleteQuery`, and there is no task log. 3.4's
    `Collector` orders by `date_logged` alone (line 98); 3.3's
    `EventLogDAO` by `log_id DESC`.
- The trace: `git blame` gives c69d929b26 for lines 62–66 of
  `TaskResource.php` and 13653090ce for line 116 of `Collector.php`.
  The controller and `TaskResource` were read at b641a430ff, 756d7004a1
  and the commit before c69d929b26 for what each save logged and
  whether the list was sorted. The GitHub API names the PRs of
  756d7004a1 and c69d929b26 as `pkp/pkp-lib#12344` (merged 2026-02-15)
  and `pkp/pkp-lib#12451` (merged 2026-03-15). `pkp/pkp-lib#12248` asks
  for the History's events "in chronological order (newest at the top
  or bottom)".
- Upstream: searched on 2026-10-09 in pkp/pkp-lib, pkp/ojs, pkp/omp,
  pkp/ops and pkp/ui-library, by the symptom ("discussion history
  order", "task history same second", "task activity log order
  uploaded", "event log order date_logged") and by the code
  (`TaskResource sortBy`, `latestActivities`,
  `DiscussionManagerHistoryModal`). Only the feature's own issues came
  up (`pkp/pkp-lib#12248`, `#12243`) and `pkp/pkp-lib#13052` (open; N+1
  queries, which names `TaskResource`'s sort of the notes, not this
  one).
- Tips: OJS `main` 6d5b793c4e (lib/pkp d1bc3a9ecc), OMP `main`
  57a9235110 and OPS `main` fd78a0bcd8 (lib/pkp 27938abd4c),
  lib/ui-library 38814ea1. `stable-3_5_0`: OJS c6e2c3a879 (lib/pkp
  d702d012dd), OMP ddc6abf5a9 and OPS dc8a938ab0 (lib/pkp 8094f06bf5),
  lib/ui-library 2576e00a. pkp-lib `stable-3_4_0` 8bf0ab5072 and
  `stable-3_3_0` 8c5b3f7f5c.
- Not driven:
  - A task's History, and an "Edit" that changes a due date or an owner.
    Both go through the same code and are read in the code only.
  - A file's History and its "last event", and the Activity Log's lines
    of edited reviews, which read the same `Collector`.
  - A History long enough for PostgreSQL to return its same-second
    lines mixed, as it did for the Activity Log.
