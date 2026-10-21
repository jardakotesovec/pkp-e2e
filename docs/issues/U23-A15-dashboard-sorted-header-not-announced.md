# A screen reader is never told which column the submissions list is sorted by, or in which direction

- **Severity** low
- **Effort** small
- **Kind** defect
- **Affects**
  - main: OJS, OMP, OPS
  - 3.5: OJS, OMP, OPS
  - 3.4: none (code; no sortable columns on the submissions list)
  - 3.3: none (code; no sortable columns on the submissions list)
- **Introduced** `pkp/ui-library#332` for `pkp/pkp-lib#7495` · [bba26a37](https://github.com/pkp/ui-library/commit/bba26a37be92686ff8329cbbab3de0fc9437a1b8) · 2024-02-20 · Jarda Kotěšovec (jardakotesovec)
- **Upstream** none found (2026-10-21)
- **Tracked in** spec U23 [A15](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U23-submissions-dashboard.md#a15)
- **Checked** 2026-10-21, each branch's tip (the commits in Evidence)
- **Model** claude-opus-5-5

## Summary

On the submissions dashboard, a click on the "ID" header sorts the rows
by ID, highest first. A second click sorts them lowest first, and a third
returns the default order. "Days" works the same way. These are the only
two columns that sort. A screen reader is told none of this: in every
state, no header says that the list is sorted by it, or in which
direction.

A screen-reader user learns the order only by reading the rows. The
shared table header never sets the sort state, so every list of the
dashboard has it: the editors' views, an author's "My Submissions" and a
reviewer's list.

## Impact

- **Lost**: nothing is stored or sent wrong. After each click on a
  header, a screen-reader user hears only "Loading", then "Loaded". They
  are not told whether the click switched the sort on, reversed it or
  switched it off.
- **Who**: screen-reader users in every role, each time they sort a
  list.
- **Way round**: read the first rows' IDs or days. The page's address
  also carries the sort while one is on
  (`sortColumn=id&sortDirection=descending`), but only a user who goes to
  the address bar and reads the query finds it there.

The fault breaks no WCAG 2.x success criterion outright. The screen
shows no sort state either: the header looks the same in all three states
and carries a fixed sort icon. So no information conveyed by presentation
is missing (1.3.1 Info and Relationships), and sighted users also read
the order from the rows. It is a gap against the WAI-ARIA sortable table
pattern. Low: the sort works and the order can be read from the rows. An
audit that reads 4.1.2 Name, Role, Value as covering the sort direction a
user sets would raise it.

## Steps to reproduce

Preconditions:

- PKP's default test dataset for `main` (or `stable-3_5_0`), context
  `publicknowledge`, in OJS, OMP or OPS.
- A screen reader (NVDA, JAWS, VoiceOver) on the page. Without one, open
  the browser's element inspector on the column headers and check each
  header's `<th>` for an `aria-sort` attribute (in Chrome DevTools:
  Elements, or the "ARIA Attributes" part of the Accessibility pane).

1. Sign in as `dbarnes` (password `dbarnesdbarnes`).
2. In the side menu, open "Active submissions"
   (`/index.php/publicknowledge/en/dashboard/editorial`).
3. Move the screen reader to the "ID" column header.
4. Click "ID". The rows reorder by ID, highest first. Move back to the
   "ID" header.
5. Click "ID" again. The rows reorder by ID, lowest first. Move back to
   the "ID" header.
6. Click "ID" a third time. The rows return to the default order: newest
   submission first.
7. Click "Days". Move to the "Days" header.

**Expected**: after step 4 the "ID" header is announced as sorted
descending (its `<th>` carries `aria-sort="descending"`). After step 5 it
is announced as sorted ascending (`aria-sort="ascending"`). After step 6
it has no sort state (no `aria-sort`). After step 7 "Days" is announced
as sorted descending and "ID" has no sort state. The headers that cannot
be sorted never carry `aria-sort`.

**Observed**: no `<th>` has an `aria-sort` attribute at any step. So
"ID" gives a screen reader the same in all three states: a column header
named "ID Sort" that holds a button of the same name. The rows and the
address do change
(`?currentViewId=active&sortColumn=id&sortDirection=descending`, then
`ascending`, then neither). No request fails and no page script error is
raised.

The same holds on an author's "My Submissions" (`ccorino` on a journal
or a server, `afinkel` on a press) and on a reviewer's list (`jjanssen`,
on a journal or a press), with "ID" clicked twice on each.

## Cause

`TableColumn.vue` (`lib/ui-library/src/components/Table/`), the column
header of the shared table, sets the attribute from a value its table
never gives it:

```vue
:aria-sort="props.allowsSorting ? tableContext.sortDirection : undefined"
```

`Table.vue` provides `tableContext` with `sortDescriptor` (a ref to
`{column, direction}`, kept by the `useSorting()` composable) and no
`sortDirection`. So the binding is always `undefined`, Vue leaves the
attribute out, and the header has no sort state. The directions
`useSorting()` cycles through (`'descending'`, `'ascending'`, `'none'`)
are already the values `aria-sort` takes; nothing maps them to the
header.

The line came with the refactor that replaced the earlier `TableHeader`
(`pkp/ui-library#332`, for `pkp/pkp-lib#7495`, the new submissions
list). The earlier header took a `sortDirection` prop, and the
submissions table passed it the column's direction or `'none'`. The
refactor moved the sort state into the table's `sortDescriptor`. Its new
`TableColumn` read `sortDescriptor` to pick a direction icon, but its
`aria-sort` binding kept the old name. The direction icon was removed
later: today's header shows a fixed `Sort` icon, so the sort is shown
neither on screen nor to a screen reader.

Reach:

- The sortable columns are set in
  `src/pages/dashboard/composables/useDashboardConfig.js`
  (`sortable: true`): `id` on every list and `lastActivity` (the "Days"
  column, `sortColumn=lastActivity` in the address) on the editors'
  views. Each is drawn by `TableColumn`; walked on all three lists, main
  and 3.5, OJS, OMP and OPS.
- Outside Storybook (`Table.stories.js`), the dashboard's
  `DashboardTable.vue` is the only table that passes a `sortDescriptor`
  (no other `useSorting()` or `allows-sorting` use in ui-library). A
  table without sorting is not touched.
- No other `aria-sort` binding in ui-library, in pkp-lib's templates or
  in the apps' templates.

## Proposed fix

Compute the header's state from the table's `sortDescriptor` in
`TableColumn.vue`, so only the sorted column carries it
([fix.diff](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/dashboard-sorted-header-not-announced/fix.diff)):

```diff
-		:aria-sort="props.allowsSorting ? tableContext.sortDirection : undefined"
+		:aria-sort="ariaSort"
…
-import {defineProps, inject, onMounted, onUnmounted} from 'vue';
+import {computed, defineProps, inject, onMounted, onUnmounted} from 'vue';
…
+const ariaSort = computed(() => {
+	const sortDescriptor = tableContext.sortDescriptor?.value;
+	if (
+		props.allowsSorting &&
+		sortDescriptor?.column === props.id &&
+		['ascending', 'descending'].includes(sortDescriptor.direction)
+	) {
+		return sortDescriptor.direction;
+	}
+	return undefined;
+});
```

It uses the `sortDescriptor.column === props.id` test that the header's
direction icon used in bba26a37. A header that is not sorted carries no
`aria-sort`, as the WAI-ARIA sortable table pattern asks (one sorted
header at a time).

Tried on `main` in OJS, OMP and OPS. The Steps gave the Expected states
(`descending`, `ascending`, none, then `descending` on "Days" alone), and
"My Submissions" and the reviewer's list did the same. A second walk of
the behaviour around the fix was run twice, once with the fix applied
and once without it. The two runs differed only in the sorted header's
`aria-sort`:

- a search kept the sort;
- the list requests asked for the same ordering;
- the workflow's own tables (its file and task lists) carried no
  `aria-sort`;
- no page script failed.

**Alternatives**:

- Provide a `sortDirection` from `Table.vue`, as the binding expects: a
  table-wide direction would put the same state on every sortable
  header, so "Days" would announce the sort of "ID".
- Put `aria-sort="none"` on the sortable headers that are not sorted:
  allowed, but a screen reader would then say "not sorted" on each of
  them as a user moves across the row, which the pattern advises
  against.

**What goes with it**:

- Guard: ui-library has no component-test setup. Its vitest tests cover
  composables, stores and utilities, and it has no `@vue/test-utils` and
  no jsdom or happy-dom. A component test of `TableColumn` would need that
  setup first, which is more than this fix. An end-to-end check that
  reads the sorted header's `aria-sort` on the dashboard, after each
  click on "ID" and "Days", guards it without new infrastructure.
- Backport: the same change on `stable-3_5_0`, as its own patch
  ([fix-3_5.diff](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/dashboard-sorted-header-not-announced/fix-3_5.diff)).
  `fix.diff`'s first hunk does not apply there, because 3.5's header has
  no `noTextWrap` class binding beside the line.
- No API, plugin hook or stored data is involved.

Small: one computed value in one component, guarded by the end-to-end
check; a component test would add the test setup on top.

## Evidence

- Kept script:
  [`shared/playwright/checks/issues/dashboard-sorted-header-not-announced/walk.js`](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/dashboard-sorted-header-not-announced/walk.js)
  (the Steps by default; `reach` for the author's and reviewer's lists;
  `neighbour` for the walk around the fix). Each step records every
  header's `aria-sort`, the first rows' IDs and the ordering the list
  request asked for, with page script errors and 5xx answers.
- Walked on `main` and `stable-3_5_0`, OJS, OMP and OPS, the Steps and
  `reach`, PostgreSQL, datasets commit 5f247d04 (2026-10-20), in
  Chromium. No screen reader was run: the finding rests on the missing
  attribute, which is where a screen reader reads a header's sort state
  from. The "Loading" and "Loaded" announcements are from the code
  (`dashboardPageStore.js`, `announce()` around each fetch), and so is
  the header's unchanging look (`TableColumn.vue`'s fixed classes and
  icon).
- Tips: OJS `main` 3109a59114 (lib/pkp f37a174626), OMP `main` 5777025be
  and OPS `main` f048e747b4 (lib/pkp 042726ebf6), ui-library 99abe252 in
  all three; OJS 3.5 1e78ca0c2b, OMP 3.5 cce424e5e, OPS 3.5 5eca7fd603
  (lib/pkp 68512b5fda, ui-library 2576e00a); ui-library `stable-3_4_0`
  ee684b34, `stable-3_3_0` 96959f9e; pkp-lib `stable-3_4_0` 85f47442cf,
  `stable-3_3_0` 867ce82d8e.
- Code reads: `TableColumn.vue`, `Table.vue`, `useSorting.js`,
  `DashboardTable.vue` and `useDashboardConfig.js` on `main` and
  `stable-3_5_0`. The two lines have the same binding and the same
  context; 3.5's header lacks only the `noTextWrap` prop. The default
  order is `PKP\submission\Collector`'s, `dateSubmitted` descending, since
  the list request names no ordering. 3.4 and 3.3: ui-library has no
  `TableColumn`, no `useSorting` and no `pages/submissions`, and pkp-lib's
  `templates/dashboard/index.tpl` lists submissions with
  `submissions-list-panel`, which has no column headers.
- Blame: the line is unchanged since bba26a37 (then in
  `TableNext/TableColumn.vue`, renamed by 7cd72788, `pkp/pkp-lib#9744`).
  Its parent's `TableNext/TableHeader.vue` bound `:aria-sort="canSort ?
  sortDirection : undefined"` from a prop, which
  `pages/submissions/SubmissionsTable.vue` filled with `sortColumn ===
  column.id ? sortDirection : 'none'`. bba26a37 came before any release
  of the list (tag `3_5_0-0` contains it), so this is filed as a defect,
  not a regression.
- Upstream: `pkp/pkp-lib#7092` (open, 2021, "Accessibility improvements
  for our DataGrid table component") asks for better sort announcements
  on the older table; it is not this fault.
- Fix trial on `main`, OJS, OMP and OPS, with ui-library rebuilt: the
  Steps, `reach` and `neighbour` with the fix applied, then `neighbour`
  again after the revert. `fix-3_5.diff` was not tried on 3.5; it
  applies cleanly to 3.5's `TableColumn.vue` (the same file in OJS, OMP
  and OPS there).
- Not verified: how NVDA, JAWS or VoiceOver word the state once the
  attribute is there.
