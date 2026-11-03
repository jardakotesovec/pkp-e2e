# Saving a section's or series' window after it was deleted in another tab hangs without a message

- **Severity** low
- **Effort** medium
- **Kind** defect
- **Crash** server
- **Affects**
  - main: OJS, OMP, OPS
  - 3.5: OJS, OMP, OPS
  - 3.4: OJS, OMP, OPS (code)
  - 3.3: OJS, OMP, OPS (code)
- **Introduced** not traced; present since at least [a941bd9ff6](https://github.com/pkp/ojs/commit/a941bd9ff614d4ad49fe9bd301fa9f6bc57784b4) (OJS, 2013-02-18) and [d9f9c2a5a4](https://github.com/pkp/omp/commit/d9f9c2a5a4cf7a7c0b9deeb1de67758718c613cb) (OMP, 2011-11-22)
- **Upstream** none found (2026-11-03)
- **Tracked in** spec U17 [A12](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U17-sections.md#a12)
- **Checked** 2026-11-03, each branch's tip (the commits in Evidence)
- **Model** claude-opus-5-5

## Summary

A Journal Manager has a section's "Edit" window open in one tab and
deletes the same section from the table in another ("Delete", "OK": the
row goes). "Save" in the first window then fails on the server, which
answers 500 with an empty body: the window stays open with "Save" greyed out and a spinner, no message or
notice shows, and only "Cancel" closes it.

The section is not recreated: after a reload the table has no row for
it. The manager should read that the section no longer exists. A press's
series window fails the same way.

## Impact

- **Lost**: nothing; the changes typed in the window were for a section
  that no longer exists.
- **Who**: journal, press and preprint server managers, on the
  "Sections" ("Series") tab of their settings, when a section is deleted
  while its window is open, in another tab or by another manager. A rare
  state.
- **Way round**: "Cancel" closes the window.

Low: the save hangs only on a section that is already gone, so no change
to a section that still exists is lost; that would make it medium.

The fix is the same few lines in each app's own save handler, so it
lands in OJS, OMP and OPS separately (effort medium).

## Steps to reproduce

Preconditions:

- PKP's default test dataset, `main` (OJS journal, OMP press, OPS
  server, each `publicknowledge`).
- A new section (a series on OMP), created in steps 2 and 3. The steps
  delete it, so the dataset's own sections stay untouched. (On OJS and
  OPS every dataset section holds submissions, and the table refuses to
  delete a section that holds submissions or is the last active one.)

A journal (OJS) and a preprint server (OPS):

1. Sign in as `rvaca` (Journal manager; Preprint Server manager).
2. Open Settings › Journal (Server) › "Sections" and press "Create
   Section".
3. Type "u17hk6 Gone" in "Section title" and "U17HK6" in "Abbreviation"
   (OPS: also "u17hk6-gone" in "Section URL Path. Use hyphens (-)
   instead of spaces."), and press "Save". The row "u17hk6 Gone" shows.
4. Open the arrow at the start of the "u17hk6 Gone" row and press
   "Edit". Leave this window open.
5. Open the same page in a second browser tab. Open the arrow on
   "u17hk6 Gone", press "Delete", then "OK". The row goes.
6. Back in the first tab, change "Section title" to "u17hk6 Gone edited"
   and press "Save".
7. Press "Cancel" and reload the page.

A press (OMP): the same on Settings › Press › "Series", with "Add Series",
"Title" "u17hk6 Gone" and "Path" "u17hk6gone" at step 3, and "Title"
"u17hk6 Gone edited" at step 6. Step 5's question reads "Are you sure you
wish to delete this item? This action cannot be undone."

**Expected**: at step 6 the app says that the section (series) no longer
exists, and the window closes or can be closed; nothing is stored, and
the table has no row for it.

**Observed**: at step 6 the window stays open with "Save" greyed out and
the spinner turning beside "Cancel"; no text under any box, no notice, no
browser dialog. The save's answer and the server log (PHP 8.3):

```
POST …/$$$call$$$/grid/settings/sections/section-grid/update-section?sectionId=3  500  (empty body)
PHP Fatal error:  Uncaught Error: Call to a member function setTitle() on null in …/controllers/grid/settings/sections/form/SectionForm.php:164
```

OPS logs the same at `SectionForm.php:158` (`sectionId=2`). OMP:

```
POST …/$$$call$$$/grid/settings/series/series-grid/update-series?seriesId=6  500  (empty body)
PHP Fatal error:  Uncaught Error: Call to a member function getPath() on null in …/controllers/grid/settings/series/form/SeriesForm.php:226
```

At step 7 "Cancel" closes the window, and after the reload the table
has no row for "u17hk6 Gone" or "u17hk6 Gone edited"; neither title is
stored.

## Cause

The save handlers build the form from the id the window posts and never
check that the section still exists: OJS and OPS
`SectionGridHandler::updateSection()` and OMP
`SeriesGridHandler::updateSeries()`
(`controllers/grid/settings/sections/SectionGridHandler.php`,
`controllers/grid/settings/series/SeriesGridHandler.php`).

The forms then load the section by that id and use the result as an
object. `Repo::section()->get()` returns `null` for a deleted section.
OJS `SectionForm::execute()` calls `$section->setTitle()` on it (line
164; OPS line 158). OMP `SeriesForm::readInputData()` calls
`$series->getPath()` on it to excuse the current path from the duplicate
check (line 226), before validation, and its `execute()` would fail the
same way at `setPath()` (line 248). The error is not caught, so the
request ends in a 500 with an empty body. Nothing is written before it.

The legacy form script has no handler for a failed request, so the
window keeps its spinner and greyed-out "Save" for good.

The rule broken: a request on an object that is gone is answered with a
message, as the same handlers already do for "Delete"
(`deleteSection()` / `deleteSeries()` answer "There was an error when
deleting this item." through `sendErrorToUser()`); the "Inactive"
handlers (`activateSection()` / `activateSeries()`,
`deactivateSection()` / `deactivateSeries()`) at least check that the
section was found before using it.

Reach:

- **The three save handlers**, the only callers of these forms' save:
  walked on OJS, OMP and OPS.
- **"Edit" on a row that is gone** (a table not yet refreshed): the
  handlers' `editSection()` / `editSeries()` open the form, whose
  `initData()` skips a missing section, so the window opens empty
  under the heading "Edit". Its "Save" posts the same id and fails the
  same way: on OJS and OPS once the required boxes are filled (validation
  runs first), on OMP even with them empty, since `readInputData()`
  calls `getPath()` before validation (code, not driven).
- **A series cover's "Delete" on a series that is gone**: answers a raw
  code, a separate fault (spec U17
  [OMP11](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U17-sections.md#omp11)).
- **The same mistake in other settings forms**: lib/pkp
  `GenreForm::execute()` (Workflow › "Components") and
  `ReviewFormForm::execute()` load their object by id and use it
  unchecked (code, not driven; not covered by the fix below).

## Proposed fix

Check at the top of each save handler that a posted id still names a
section of this context, and answer with the handler's own
`sendErrorToUser()`, as `deleteSection()` does a few lines below. The
OJS change
([fix-ojs.diff](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/section-window-save-after-delete-hangs/fix-ojs.diff);
OPS the same,
[fix-ops.diff](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/section-window-save-after-delete-hangs/fix-ops.diff);
OMP with `$seriesId`,
[fix-omp.diff](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/section-window-save-after-delete-hangs/fix-omp.diff)):

```diff
--- a/controllers/grid/settings/sections/SectionGridHandler.php
+++ b/controllers/grid/settings/sections/SectionGridHandler.php
@@ public function updateSection($args, $request)
         $sectionId = $request->getUserVar('sectionId');
 
+        // The section may have been deleted since its window was opened (from another tab)
+        if ($sectionId && !Repo::section()->get((int) $sectionId, $request->getContext()->getId())) {
+            return $this->sendErrorToUser($request->getUser()->getId(), 'api.404.resourceNotFound');
+        }
+
         $sectionForm = new SectionForm($request, $sectionId);
```

`sendErrorToUser()` posts an error notice and answers with a
data-changed event, so the window closes, the table redraws without the
section, and the notice reads "The requested resource was not found."
(lib/pkp's `api.404.resourceNotFound`, which the event log grids already
use). A new section posts no id and is not affected.

Tried on `main` in all three apps: at step 6 the window closes with the
notice "The requested resource was not found.", nothing is stored, and
the server logs no error. With the fix in and out, "Save" on an existing
dataset section or series with nothing changed ("Articles", "Preprints",
"History") and a new "u17hk6 New" both answer "Your changes have been
saved." as before.

**Alternatives**:

- Guard inside the forms (`readInputData()`, `execute()`): a form has
  no way to tell its handler "gone" other than a validation error, which
  would leave the window open on a section the manager cannot save; and
  OMP reads the section before validation.
- A message naming the section ("This section no longer exists."): a
  new locale key in each app, translated; clearer, at the cost of three
  locale files. The team decides.
- An error callback in the legacy form script for a failed request:
  worth doing for every legacy window (it also leaves OMP10's damaged
  cover save hanging), but it shows a generic failure, not the cause.

**What goes with it**:

- The same guard in `editSection()` / `editSeries()` would also cover
  "Edit" opening an empty window for a row that is gone (Cause); left
  out, since that window's save is covered by this fix.
- Backport: 3.5 takes the diffs as written. 3.4 and 3.3 have no
  `sendErrorToUser()` in these handlers (it came with
  `pkp/pkp-lib#11089`, 2025); there the guard builds the notice inline
  with `NotificationManager::createTrivialNotification()`, and 3.3 reads
  the section through `SectionDAO::getById()` (OMP `SeriesDAO`).
- Test: the e2e scenario in spec U17 (a **Planned** item): a section's
  and a series' window saved after the row was deleted in another tab
  closes with the notice and stores nothing.

Medium: the change is four lines following a helper each handler
already has, but it lands in three application repositories.

## Evidence

- Kept script:
  [walk.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/section-window-save-after-delete-hangs/walk.js),
  on installs loaded from PKP's default test dataset (pkp/datasets
  2fd5c320, 2026-11-02, PostgreSQL):
  `PROBE_FEATURE=<feature> PROBE_AGENT=<id> node bin/probe.js all shared/playwright/checks/issues/section-window-save-after-delete-hangs/walk.js`
  (the Steps); `MODE=nb` in front runs the neighbour check (an existing
  section or series saved unchanged, and a new one). It records each
  save's answer, the window's state, the notices, browser dialogs, the
  server log lines written during the save and what the database holds
  under each title.
- Walked on `main` and `stable-3_5_0`, OJS, OMP and OPS. On OMP 3.5 the
  table still showed the row right after "OK" (a slow redraw); the
  series was already gone from the database, and the row from the table
  at the reload.
- Fix tried on `main` in all three apps: `fix-<app>.diff` applied, the
  Steps walked, then the neighbour check with the fix in and after the
  revert. The `Undefined property: stdClass::$section_id` warning OMP
  logs on every series save is a known separate fault (spec U17 OMP9).
- Code reads: OJS and OPS `SectionForm::initData()`, `readInputData()`,
  `execute()` and `SectionGridHandler` (edit, update, delete,
  activate, deactivate); OMP `SeriesForm` and `SeriesGridHandler` the
  same; on `main` and `stable-3_5_0`, and on pkp's `stable-3_4_0`
  (`Repo::section()->get()`, the same unchecked use) and `stable-3_3_0`
  (`SectionDAO::getById()` / `SeriesDAO::getById()`, the same) of each
  app. lib/pkp `GenreForm` and `ReviewFormForm` on `main` only.
- Introduced: blame on `SectionForm.php:164` stops at the PSR-12 reformat
  665ed1f925 (2021) and, before it, at a941bd9ff6 (OJS, Alec Smecher,
  2013, "Port sections to new structures", no PR); OMP's `setPath()`
  line in `execute()` at d9f9c2a5a4 (2011, "Series path implemented"),
  its `readInputData()` lookup at a746a8c2d1 (2017,
  `pkp/pkp-lib#1334`); OPS took the OJS form. The 2023 Repository
  conversions (OJS c5b014ab89, OMP 4be4badc4a, OPS 9b0442327f,
  `pkp/pkp-lib#7128`) replaced the DAO call and kept the unchecked use.
- Upstream search (2026-11-03), pkp/pkp-lib, pkp/ojs, pkp/omp, pkp/ops
  and pkp/ui-library, issues and PRs: "section deleted save", "section
  edit deleted", "series deleted save", "series edit 500", "another tab"
  section, "setTitle() on null", "getPath() on null", `SectionForm`,
  `SeriesForm`, `updateSection`, "Repo::section()->get" null. Read and
  not this fault: `pkp/pkp-lib#8737` (a 500 on saving a section with two
  roles of one user ticked, fixed in 3.4).
- Branch tips: `main` OJS e7ce037799, OMP 828150a8f, OPS 53749f7d2f
  (lib/pkp 1ae711024a in each); `stable-3_5_0` OJS 0f2de4ff3f, OMP
  9e2a7fd00, OPS d4a7e97a55 (lib/pkp c4c0aa8c52); `stable-3_4_0` OJS
  8bd9e6f9a0, OMP e92ae5b6d, OPS d6dd7247c9 (lib/pkp f4719f2805);
  `stable-3_3_0` OJS 2f766afdb1, OMP 220e3e2f7, OPS 1f02fc5641 (lib/pkp
  5b26595791).
- Unverified: the empty "Edit" window on a row that is gone (code). A
  deletion by another manager in their own browser was not driven; the
  server gets the same two requests. On
  3.3 under PHP 7, a method call on `null` is the same fatal error.
  MySQL not checked; nothing here depends on the database.
