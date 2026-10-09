# A task's "Started" and "Closed" boxes, and every template's "Auto-add at stage" box, have names a screen reader cannot tell apart

- **Severity** low
- **Effort** small
- **Kind** defect
- **Affects**
  - main: OJS, OMP, OPS
  - 3.5: none (no tasks, no task and discussion templates)
  - 3.4: none (code; no tasks, no task and discussion templates)
  - 3.3: none (code; no tasks, no task and discussion templates)
- **Introduced** `pkp/ui-library#723` for `pkp/pkp-lib#11826` · [7632260c](https://github.com/pkp/ui-library/commit/7632260c3d213451e73c322dc5aef3cd7ef9ab7b) · 2025-10-27 · Blesilda Biazon (blesildaramirez)
- **Upstream** none found (2026-10-09)
- **Tracked in** spec U37 [A32](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U37-tasks-and-discussions.md#a32)
- **Checked** 2026-10-09, each branch's tip (the commits in Evidence)
- **Model** claude-opus-5-5

## Summary

A screen-reader user who moves with the Tab key through a task's row in
a stage's Tasks & Discussions panel reaches two boxes with the same
name, the task's own: a task "Check proofs" has two boxes named "Check
proofs". Only the column the box sits in, "Started" or "Closed", tells
which is which.

On Settings › Workflow › "Tasks and Discussions", every template's
"Auto-add at stage" box is named "Automatically add this task and
discussion when a submission reaches a specific stage", which names
neither the template nor the stage. Every stage's "Add template" button
on that screen is named "Add template" alone.

Each control's name should say what it does and which task, template or
stage it belongs to. A manager can switch "Auto-add at stage" on for
the wrong template, because the question that follows names the stage
but not the template.

## Impact

- **Lost**: on a task's row, nothing: the question a pressed box asks
  names the action ("Start this task", "Close this Task"). On the
  template screen, "Yes" to the question switches auto-add on for the
  template the box belongs to, whichever the user meant. Every
  submission that reaches that stage then gets one more task or
  discussion made from it, with no participants and no email to anyone,
  until a manager unticks the box. The items already added stay.
- **Who**: screen-reader users who move by Tab: editors, assistants and
  authors in a stage's Tasks & Discussions panel, and managers on
  Settings › Workflow › "Tasks and Discussions".
- **Way round**: moving through the table cell by cell, where each cell
  belongs to its column heading and, on the template screen, to the
  template's name. A template's "Edit" window holds the same switch
  under the template's name. The window "Add template" opens is titled
  with its stage ("Add Task and Discussion Template in Copyediting
  Stage"), so that button's bare name costs a detour, not a wrong save.

Low: a wrong press on a task's box is caught by its question, and one on
a template's box adds items that tell nobody and can be switched off and
deleted. Auto-added items that emailed their participants would raise it
to medium.

## Steps to reproduce

Preconditions:

- The default dataset, OJS, OMP or OPS `main`.
- A screen reader, or the browser's inspector to read a box's name
  without one: in Chrome DevTools › Elements, select the hidden
  `<input type="checkbox">` inside the box's cell and read "Name" under
  Accessibility.

The submission is at Production: OJS submission 5, "Genetic
transformation of forest trees"; OMP submission 4, "How Canadians
Communicate: Contexts of Canadian Popular Culture"; OPS submission 1,
"The influence of lactation on the quantity and quality of cashmere
production".

1. Sign in as `dbarnes` and open the submission's workflow at
   "Production":
   `/index.php/publicknowledge/en/dashboard/editorial?workflowSubmissionId=5&workflowMenuKey=workflow_5`
   on OJS, `workflowSubmissionId=4` on OMP and `workflowSubmissionId=1`
   on OPS (`workflow_5` is the Production stage in all three).
2. In "Production Tasks & Discussions" press "Add". For "Name" type
   "hkri task", tick "Enter task information", set a "Due Date" a week
   ahead, choose the owner "Daniel Barnes" and the drop-down's "Create
   Task (Do Not Start)", type "Please check." as the message, and press
   "Save". The task is listed under "Yet to begin".
3. Press Tab until the row's "Started" box has the focus, then once
   more for its "Closed" box, and take the name of each.
4. Go to Settings › Workflow › "Tasks and Discussions". Press Tab
   through the "Auto-add at stage" boxes and the "Add template"
   buttons, and take the name of each.

**Expected**: at step 3 each box is named for the task and for what it
does, such as "hkri task Started" and "hkri task Closed". At step 4
each box is named for its template and stage, and each "Add template"
button for its stage.

**Observed**: the names below are the ones in the browser's
accessibility information, which is what a screen reader announces for
a control that takes the focus. At step 3 the two boxes read alike:

```
"Started":  checkbox "hkri task"
"Closed":   checkbox "hkri task"
```

At step 4 every box reads the same, ten times on the journal, thirteen
on the press and twice on the preprint server:

```
checkbox "Automatically add this task and discussion when a submission reaches a specific stage"
```

Every "Add template" button reads `button "Add template"`: four on the
journal, five on the press, one on the preprint server.

## Cause

The boxes are ui-library's `TableCellSelect`
(`src/components/Table/TableCellSelect.vue`), which draws a `Checkbox`
whose hidden `<input>` takes its name from `aria-labelledby` (the
`labelledBy` prop).

A task row's cells, `DiscussionManagerCellStarted.vue` (line 46) and
`DiscussionManagerCellClosed.vue` (line 62), pass two ids:
`discussion_name_{id}`, the row's name link, and `{tableId}_{index}`,
meant for the column's heading. No element carries the second id:
`TableColumn.vue` draws its `<th>` without one. A browser skips an id
that matches nothing, so both boxes are named by the task alone.

The headings had that id until 7632260c (`pkp/ui-library#723`). It
removed `:id="columnId"` from `TableColumn` together with the cells'
`headers` attribute, and took `labelIds` (the template's name and the
column) out of `TaskTemplateManagerCellAutoAdd.vue`. The two task cells
kept pointing at the id.

The removal was deliberate. #723 gives no reason (its description is
empty and its review is about other things), but the review of the pull
request before it does, `pkp/ui-library#703`: a comment of 2025-10-14
proposes dropping the id references from the template cell and marking
the template's name cell as the row's heading (`isRowHeader`) instead,
since a screen reader then reads the row's and the column's heading as
the user moves between cells. That covers moving cell by cell. It does
not cover Tab, where the box's own name is all that is read, and the
task rows got no row heading (`DiscussionManagerCellName.vue` is a plain
cell).

c5201f4a (`pkp/ui-library#731`, the same day as #723) then gave the
template box a fixed text, `taskTemplates.templateAutoAdd`, so every row
reads alike. The text is not on the input: the cell passes it as
`aria-label` to `TableCellSelect`, which hands it to `Checkbox`, which
declares no such prop, so the attribute falls through to the `<label>`
round the input. The input has neither `aria-label` nor
`aria-labelledby`, although `labelledBy` is a required prop of both
components (`TableCellSelect.vue` line 24, `Checkbox.vue` line 39).

7632260c also renamed the group heading cell, `TableColGroup.vue`, to
`TableRowGroup.vue` and dropped its `inject('groupId', null)` and
`:id="groupId"`. The cell still hands `groupId`, now undefined, to its
`action` slot. `TaskTemplateManager.vue` puts that value into each "Add
template" button's `aria-labelledby`, so the button keeps only its own
text.

Before 7632260c the code named the boxes "{task} Started" and "{task}
Closed" (read in the code at its parent, not driven). At that commit the
panel was shown only with the `enableNewDiscussions` feature flag on, so
no default install had those names: hence defect, not regression.

Reach:

- A task row's "Started" and "Closed" boxes, in every stage's panel and
  for every role that sees it. Driven on screen as `dbarnes` at
  Production.
- A discussion row's "Closed" box comes from the same cell and is named
  by the discussion alone (read in the code).
- Every "Auto-add at stage" box and every "Add template" button of
  Settings › Workflow › "Tasks and Discussions". Driven on screen.
- A switched-on template: `Repository::autoCreateFromTemplates()`
  (pkp-lib `classes/editorialTask/Repository.php`) makes its item for
  each submission that reaches the stage, without participants, and
  nothing else reads the switch, so switching it off removes no item
  (read in the code).
- The other boxes drawn by `TableCellSelect` are one to a row and named
  by the row's item: `FileManagerCellSelect` (the file's name; driven on
  "Attach Workflow Files") and `DashboardCellBulkDelete` (the
  submission's title; read in the code). They are not affected.
- No other file of ui-library reads `tableContext.tableId`.

## Proposed fix

Name each box for its row and its column through `aria-labelledby`, as
the task rows' cells already try to
([fix.diff](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/task-boxes-screen-reader-shared-names/fix.diff),
four ui-library files):

```diff
--- a/lib/ui-library/src/components/Table/TableColumn.vue
 	<th
+		:id="columnId"
+		ref="columnRef"
 		scope="col"
 ...
+const columnRef = ref(null);
+const columnId = ref(undefined);
+
 onMounted(() => {
+	columnId.value = `${tableContext.tableId}_${columnRef.value.cellIndex}`;
 	tableContext.columnsCount.value++;
--- a/lib/ui-library/src/managers/TaskTemplateManager/TaskTemplateManagerCellAutoAdd.vue
-		:aria-label="t('taskTemplates.templateAutoAdd')"
+		:labelled-by="labelIds"
 ...
+const labelIds = `template_name_${props.taskTemplate.id} ${tableContext.tableId}_${props.index} template_stage_${props.stage.key}`;
```

This puts back two things #723 took out on purpose, the headings' ids
and the template cell's `labelIds`, for the one case the table's own
headings do not serve: a user who reaches a box by Tab. The cells'
`headers` attributes stay out.

- `TableColumn.vue`: the `<th>` carries `{tableId}_{column index}`
  again, so the task rows' `labelIds` resolve with no change to the two
  cells.
- `TaskTemplateManagerCellAutoAdd.vue`: `labelIds` comes back, with the
  stage added, because the default templates repeat a name across
  stages ("Assign Editor" sits under three stages of a journal).
  `TaskTemplateManager.vue` gives the stage's name the id
  `template_stage_{stage}`.
- `TableRowGroup.vue`: a restore of the two lines `TableColGroup.vue`
  had, `inject('groupId', null)` and `:id="groupId"`, so the "Add
  template" button's existing `aria-labelledby` resolves.

The ids joined in `aria-labelledby` are the pattern the task cells and
`FileManagerCellSelect` already use, and they need no new text to
translate.

Tried on all three apps. The task's boxes read "hkri task Started" and
"hkri task Closed". Each template box read its own name, such as
"Assign Editor Auto-add at stage Submission Stage", with no two alike.
Each button read "Submission Stage Add template" and so on; that name
was read in Chromium only, and the `<th>` it points at contains the
button itself.

A second check gave the same results with and without the fix, the new
names aside: the dashboard's column headings and its sort press, the
file list's box named by its file, "Yes" on "Start this task" and "No"
on "Confirm Automatic Addition". No id the fix adds was carried twice
on a page.

**Alternatives**

- Stay with the table's headings alone, as #703's review chose: mark
  the task's name cell as the row's heading, as
  `TaskTemplateManagerCellName.vue` does, and drop the dead id from the
  two task cells. It is smaller, but by Tab a task's two boxes and all
  template boxes still read alike.
- Give the cells an `aria-label` built from text ("Start task: {name}").
  It reads better, but needs new texts in every language, and the
  column headings already hold the words.
- Set the ids in `DiscussionManager.vue` and `TaskTemplateManager.vue`
  instead of `TableColumn`. The table's id is not known there, so each
  would need an id scheme of its own.

**What goes with it**

- A screen reader that reads the headings on entering a cell may say
  the column twice, once as the heading and once in the name (a guess:
  no screen reader was run).
- A heading's index is read when it is mounted. A table that adds or
  removes a column afterwards would keep the old index in the id; the
  two tables that use the id have fixed columns.
- Left behind, not in the tried diff, and safe to remove in the same
  change: `TableCellSelect`'s `ariaLabel` prop and its
  `:aria-label="ariaLabel"` pass-through (lines 23 and 6), which no
  caller uses any more, and the text `taskTemplates.templateAutoAdd`,
  which loses its only reader (pkp-lib `locale/en/submission.po`, no
  translation yet, and ui-library's `public/globals.js`).
- No stored data is wrong, and no API or plugin hook changes. Every
  ui-library table's headings gain an `id` attribute.
- Test: ui-library's vitest tests cover composables and one store, no
  component. Its stories run in Chromatic with `play` functions, but no
  story asserts anything today. A `play` function on the `Default`
  story of `DiscussionManager` and of `TaskTemplateManager` that finds
  the boxes by role and name would catch this, as the library's first
  asserting story. Failing that, an e2e check that reads the boxes by
  role and name.

Small: about twenty lines in four ui-library files, tried. Whether to
name the boxes this way or stay with the table's headings is the team's
choice.

## Evidence

- Kept script:
  [walk.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/task-boxes-screen-reader-shared-names/walk.js)
  takes the Steps. It reads each box's name in Chromium's accessibility
  tree (Playwright's aria snapshot of the cell) and, per id of its
  `aria-labelledby`, the text of the element the id points at. With
  `neighbour` after the path it runs the second check alone. It runs
  from a pkp-e2e checkout, on an install freshly loaded from the default
  dataset:
  `PROBE_FEATURE=<feature> PROBE_AGENT=<id> node bin/probe.js all shared/playwright/checks/issues/task-boxes-screen-reader-shared-names/walk.js`
  (`PKP_E2E_LINE=stable-3_5_0` in front for 3.5).
- How the names were read: from the accessibility tree, in Chromium,
  with no screen reader running. The script reads the names where the
  Steps say Tab; that the boxes take the focus by Tab was read in the
  code (a focusable `<input>`, enabled on these rows). What a given
  screen reader adds when its user moves cell by cell was not driven.
- WCAG: no criterion is claimed as failed, and no audit was made. Each
  box has a name, which is what 4.1.2 Name, Role, Value asks. The
  criterion the names bear on is 2.4.6 Headings and Labels (level AA),
  which asks that a label describe its purpose.
- Driven on OJS, OMP and OPS `main`, on PostgreSQL; the fault does not
  depend on the database. Dataset: pkp/datasets 1a196c3 (2026-10-08).
- On step 3 the second id read `v-29_3` and `v-29_4` on OJS (the
  table's id and the column index) and matched no element. With the fix
  the same ids pointed at the headings "Started" and "Closed".
- Not driven for this report, read in the code and in spec U37's
  earlier walks (its Rules 25b and 26): the "Add template" window's
  title (`TaskTemplateManagerFormModal.vue`, `taskTemplates.addInStage`),
  the "Edit" window's switch, and what a switched-on template adds to a
  submission.
- `stable-3_5_0` was walked on the three apps: the Production stage
  shows the legacy "Production Discussions" grid (no tasks, no
  "Started" column), with no discussion on the dataset's submission, and
  Settings › Workflow has no "Tasks and Discussions" tab. In the code,
  its ui-library has `TableCellSelect` for the dashboard's bulk delete
  alone and no `TaskTemplateManager`. The grid's "Closed" box is another
  control (`templates/controllers/grid/common/cell/selectStatusCell.tpl`,
  a bare `<input type="checkbox">`): not this fault, and not looked into
  here.
- 3.4 and 3.3 were read in the code: ui-library has no
  `TableCellSelect`, `Checkbox`, `DiscussionManager` or
  `TaskTemplateManager` on either branch.
- Branch tips: OJS `main` 6d5b793c4e (lib/pkp d1bc3a9ecc), OMP `main`
  57a9235110 and OPS `main` fd78a0bcd8 (lib/pkp 27938abd4c), lib/ui-library
  38814ea1 in all three. `stable-3_5_0`: OJS c6e2c3a879 (lib/pkp
  d702d012dd), OMP ddc6abf5a9, OPS dc8a938ab0 (lib/pkp 8094f06bf5),
  lib/ui-library 2576e00a. `stable-3_4_0`: ui-library ee684b34.
  `stable-3_3_0`: ui-library 96959f9e.
- Introduced: `git blame` on the two `labelIds` lines gives 652ce6460
  (`pkp/ui-library#691`). `TableColumn` then set `:id="columnId"`, the
  table's id and the number of headings mounted before it, whenever the
  table had row groups, as both tables do (ae2da88e,
  `pkp/ui-library#652`). `git log -S tableId -- src/components/Table`
  gives 7632260c as the change that removed it; its message lists
  "Remove checkbox labelIds" and "Remove headers being applied to
  TableCell component". At its parent the workflow mounted
  `DiscussionManager` only under
  `pkp.context.featureFlags.enableNewDiscussions`.
- The reason for the removal: `pkp/ui-library#723`, `#703` and `#731`
  were read through GitHub's API (description, review comments,
  comments), and the comments of `pkp/pkp-lib#11826` searched for the
  headings, ids and labels. Only #703's review speaks of it.
- ui-library's tests: `package.json` (`"test": "vitest"`, seven
  `*.test.js` files), `.storybook/main.js` (`@storybook/addon-a11y`),
  `.github/workflows/chromatic.yml`, and a search of `*.stories.js` for
  `expect(` (none). The a11y addon's checks were not run.
- Upstream: pkp/pkp-lib, pkp/ojs and pkp/ui-library were searched for
  the symptom's words (screen reader, accessibility, checkbox, task,
  discussion, "Tasks and Discussions", auto-add) and for
  `TableCellSelect`, `labelIds`, `labelledBy` and `aria-labelledby`.
  Nothing names this fault.
- Unverified: what a given screen reader says, by Tab or in table
  navigation; the dashboard's bulk delete box (code only).
