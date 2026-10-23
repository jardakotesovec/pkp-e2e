# Ordering a book's chapters: "Cancel ordering" takes away the "No Items" line of a chapter with no authors

- **Severity** low
- **Effort** small
- **Kind** defect
- **Affects**
  - main: OMP
  - 3.5: OMP
  - 3.4: OMP (code)
  - 3.3: OMP (code)
- **Introduced** no PR, for PKP bug 7730 · [26afc06efd](https://github.com/pkp/pkp-lib/commit/26afc06efd7688f269c8965048afbe083d1628c3) · 2012-08-13 · Bruno Beghelli (beghelli)
- **Upstream** none found (2026-10-23)
- **Tracked in** spec U72 [A14](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U72-chapters-work-type.md#a14)
- **Checked** 2026-10-23, each branch's tip (the commits in Evidence)
- **Model** claude-opus-5-5

## Summary

A book's chapter list shows "No Items" under a chapter that has no
authors. A press editor on the Chapters page, or an author on the
submission wizard's "Details" step, presses "Order" and then "Cancel
ordering", either without dragging anything or after dragging another
chapter. The chapters go back to their order, but the chapter with no
authors now shows its title with nothing under it.

Nothing is saved or lost, and the "No Items" line comes back once the
page is loaded again. The fault shows only on a book that has a chapter
without authors.

## Impact

- **Lost**: nothing; "Cancel ordering" saves nothing.
- **Who**: whoever is offered "Order" on a book's chapter list: the
  press's editors and managers, an author only when allowed to edit the
  book's metadata, and the author in the submission wizard, which draws
  the same list.
- **Way round**: loading the page again. Until then the list gives no
  sign that the chapter has no authors.

Low: a line missing on screen until the next page load; it would rise
only if it led someone to publish a chapter they believed had authors.

## Steps to reproduce

Preconditions:

- PKP's default test dataset, OMP `main` (press `publicknowledge`).
- Every chapter in the dataset has at least one author, so step 4 adds
  one with none, "Appendix hkq23f".

Steps:

1. Sign in as `dbarnes`.
2. Open submission 3, "The Political Economy of Workplace Injury in
   Canada" (dashboard, "Active submissions", "View").
3. In the side menu, under "Publication", open "Chapters" [3.5: the
   "Publication" tab, then "Chapters"]. The list reads "Introduction",
   "Part One. Employment Relationships in Canada", "Part Two. Preventing
   Workplace Injury", "Part Three. Critique of OHS in Canada" and "Part
   Four. Political Economy of Preventing Workplace Injury", each with
   the author row "Bob Barnetson".
4. Press "Add Chapter", type "Appendix hkq23f" in "Title", tick no
   contributor, press "Save". "Appendix hkq23f" is listed last, with the
   line "No Items" under it.

Without a drag:

5. Press "Order".
6. Press "Cancel ordering".
7. Open the Chapters page again (reload the page, then "Chapters").

After another chapter is dragged:

8. Press "Order".
9. Drag "Part Four. Political Economy of Preventing Workplace Injury"
   above "Introduction" and release. "No Items" still stands under
   "Appendix hkq23f".
10. Press "Cancel ordering".

**Expected** (steps 6 and 10): the chapters stand in their order, and
"Appendix hkq23f" still has "No Items" under it.

**Observed** (steps 6 and 10): the chapters stand in their order, but
"Appendix hkq23f" has nothing under it:

```
Introduction
  Bob Barnetson
…
Part Four. Political Economy of Preventing Workplace Injury
  Bob Barnetson
Appendix hkq23f
```

After step 7, "No Items" stands under "Appendix hkq23f" again. "Cancel
ordering" sends no request, and the browser showed no script error.
When "Appendix hkq23f" itself is the chapter dragged, "Cancel ordering"
leaves its "No Items" line under it.

## Cause

lib/pkp's category grid draws each chapter as a
`tbody.category_grid_body` holding the chapter's own row and its author
rows, followed by a sibling `tbody.category_placeholder` with the "No
Items" line (`templates/controllers/grid/gridBodyPartWithCategory.tpl`).
The chapter's own row is rendered by `templates/controllers/grid/gridRow.tpl`:
lines 20–22 build its class, `gridRow` plus `category` for a
`GridCategoryRow`, and line 31 writes the `<tr>`. So it carries the same
`gridRow` class as a data row.

"Order" stores the order of every `.gridRow`, the chapter rows
included (`OrderItemsFeature.clickOrderHandler()` and `storeOrder()`,
`js/classes/features/OrderItemsFeature.js` lines 293 and 355, through
`GridHandler.getRows()`). "Cancel ordering" runs
`OrderCategoryGridItemsFeature.cancelOrderHandler()`
(`js/classes/features/OrderCategoryGridItemsFeature.js` line 76). It
first calls the parent, `OrderItemsFeature.cancelOrderHandler()` (line
79), which puts the rows back with `GridHandler.resequenceRows()`
(OrderItemsFeature.js line 325). Then it always calls
`CategoryGridHandler.resequenceCategories()` (line 80).

`resequenceRows()` re-adds each stored row through `addElement()`
(`js/controllers/grid/GridHandler.js` line 373). The category grid's
override, `CategoryGridHandler.addElement()`
(`js/controllers/grid/CategoryGridHandler.js` line 351), appends the
row inside its chapter's `tbody` and then calls `GridHandler.addElement()`
(line 365). That method treats every element it is given as a new data
row and hides the group's empty placeholder (GridHandler.js lines
657–661, from `getEmptyElement($newRow)`).

`CategoryGridHandler.getEmptyElement()` (CategoryGridHandler.js line
255) answers for a whole category body only. For any row it falls back
to the parent (line 262), which returns the `.empty` element right
after the row's `tbody`. When the chapter was not dragged, its
placeholder is still that next element, so the chapter's own "No
Items" line is hidden. `resequenceCategories()` then moves every
placeholder under its chapter (`updateEmptyPlaceholderPosition()`, line
200) but never shows one.

The rule this breaks: the line shows while a chapter has no author
rows, and a chapter's own row is not one of its items. The code knows
the difference elsewhere: `getCategoryRow()` (line 73) finds
`tr.category`, and `getRowsInCategory()` (line 89) counts `tr.gridRow`
"excluding the category row". When the chapter with no authors was
itself dragged, its placeholder no longer follows its `tbody`, so
nothing is hidden.

The fault came with
[26afc06efd](https://github.com/pkp/pkp-lib/commit/26afc06efd7688f269c8965048afbe083d1628c3)
("Implement category rows with columns and row actions"), which gave
the chapter's own row the `gridRow` class inside the chapter's `tbody`.
Before it, a `<tr class="category">` without `gridRow` wrapped the
rendered category row and all the data rows, so "Order" never stored
the category row and "Cancel ordering" never re-added it.
`getEmptyElement()` was not taught about the new row.

Reach:

- Every chapter list is this grid, OMP's `ChapterGridHandler`, the only
  OMP grid with category ordering (`initFeatures()`, line 204): the
  workflow's Chapters page, editorial and author view alike, and the
  submission wizard's "Details" step (`templates/submission/chapters.tpl`).
- OJS's issue table of contents (`TocGridHandler`) is the other
  category grid with ordering, but every section it lists holds at
  least one article, so it has no "No Items" line to hide (code).
- `resequenceRows()` is also called after `fetchRow()` with a
  `sequenceMap`; in a category grid that map lists the category's data
  rows only (`CategoryGridHandler::getRowsSequence()`), so the chapter
  row is not re-added there (code).
- The same chapter row, unhandled, breaks a delete in another category
  grid, the book's "Representatives": `getElementsByType()` counts it
  as a data row
  ([its own report](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/issues/U74-A21-emptied-representative-group-shows-nothing.md),
  a different method and fix in the same file, which could land
  together).

## Proposed fix

Recommended: in `CategoryGridHandler.prototype.getEmptyElement()`, give
a category's own row no placeholder, so re-adding or moving it never
hides the "No Items" line
([fix.diff](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/cancel-ordering-hides-no-items-line/fix.diff)):

```diff
 		if ($element.hasClass('category_grid_body')) {
 			// Return the grid empty element placeholder.
 			return this.getHtmlElement().find('.empty').not('.category_placeholder');
+		} else if ($element.hasClass('category')) {
+			// A category's own row is not one of its items: adding or moving
+			// it must leave the category's "No Items" placeholder as it is.
+			return $([]);
 		} else {
```

The override already handles what is particular to categories, and it
tells the chapter row by the `category` class that `getCategoryRow()`
and `getRowsInCategory()` read. An empty set keeps the callers working
unchanged: `addElement()` hides nothing, and `deleteElement()` never
gets a chapter row alone (`CategoryGridHandler.deleteElement()` deletes
the whole chapter).

Tried on OMP `main`: with the fix, "No Items" stays under "Appendix
hkq23f" after steps 6 and 10. Dragging "Appendix hkq23f" itself, or an
author within a chapter, then "Cancel ordering", reads the same with
the fix in and out (the line back under its chapter; the authors back
in their order).

**Alternatives**:

- Leave the chapter rows out of what "Order" stores: "Cancel ordering"
  rebuilds the chapter order from those rows
  (`OrderCategoryGridItemsFeature.getCategorySequence_()`), and a
  chapter with no authors would then have no entry and jump to the top.
- Re-show the placeholder of every chapter without author rows in
  `updateEmptyPlaceholderPosition()`: it would repair the line after the
  fact, while `addElement()` kept hiding it on every cancel.

**What goes with it**:

- The app's committed `js/pkp.min.js` (served when `enable_minified` is
  On) picks the change up at its next rebuild
  (`lib/pkp/tools/buildjs.sh`).
- No stored data to repair, no request, hook or API change.
- Backport: the four JavaScript files are the same on 3.5, 3.4 and 3.3,
  so the diff applies to each, but on 3.5 and 3.4 it covers only
  installs with `strict = Off` (the default). There `gridRow.tpl` still
  tests `is_a($row, 'GridCategoryRow')`, which matches only through the
  `\GridCategoryRow` class alias, and `GridCategoryRow.php` registers
  that alias only `if (!PKP_STRICT_MODE)` (line 66). With `strict = On`
  no chapter row gets the `category` class, so the fix never matches
  and the fault stays. A full backport to 3.5 and 3.4 also takes the
  template change `main` already has from `pkp/pkp-lib#13453`
  ([3a5a039743](https://github.com/pkp/pkp-lib/commit/3a5a0397434174e1c6b2bfcefa7e10be73e2a4f6)):
  the four `is_a()` tests on `PKP\controllers\grid\GridCategoryRow`
  ([backport-3_5.diff](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/cancel-ordering-hides-no-items-line/backport-3_5.diff);
  its last template hunk needs re-cutting for 3.4's `gridRow.tpl`,
  whose neighbouring lines differ). On 3.5 with `strict = On` the
  JavaScript fix alone left the fault as it was. With the template
  change added, every chapter row had the class and "No Items" stayed
  after steps 6 and 10. On 3.3 the class is unaffected, since
  `GridCategoryRow` has no namespace there.
- Guard: an e2e check in the chapter list's ordering scenario ("Order",
  "Cancel ordering" on a book with a chapter without authors, "No
  Items" read under it); no JavaScript unit tests cover the grids.

Small: four lines in one lib/pkp file, and an e2e check.

## Evidence

- Kept script: [walk.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/cancel-ordering-hides-no-items-line/walk.js)
  with its
  [lib.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/cancel-ordering-hides-no-items-line/lib.js),
  run on an install freshly loaded from the dataset:
  `PROBE_FEATURE=<feature> PROBE_AGENT=<id> node bin/probe.js omp shared/playwright/checks/issues/cancel-ordering-hides-no-items-line/walk.js [neighbour]`.
  Without an argument it takes steps 1–10; `neighbour` drags "Appendix
  hkq23f" above "Introduction" and, on submission 12, Raymond Hyma
  above Frank Tulus, each followed by "Cancel ordering". Each read
  records, for every visible "No Items" line, the chapter it belongs to
  and the chapter it stands under, and how many chapter rows lack the
  `category` class. The dataset install serves the unminified scripts
  (`enable_minified = Off`).
- Walked on OMP `main` 178e8b34b (lib/pkp 1f415a07ca, ui-library
  e47a4887) and `stable-3_5_0` a150eee76 (lib/pkp 5b54f59ed7,
  ui-library 2576e00a), each on its dataset from pkp/datasets 300c68e
  (2026-10-22), PostgreSQL. The fault is in the browser; MySQL not
  checked.
- Not walked: the submission wizard and the author's view of the
  Chapters page (the dataset holds no unfinished submission).
- 3.5 (walked, and code): `CategoryGridHandler.js`, `GridHandler.js`,
  `OrderItemsFeature.js`, `OrderCategoryGridItemsFeature.js` and
  `gridBodyPartWithCategory.tpl` identical to `main`'s. `gridRow.tpl`
  differs: it tests `is_a($row, 'GridCategoryRow')` (lines 21, 57, 69,
  77), which matches through the alias `GridCategoryRow.php` registers
  behind `if (!PKP_STRICT_MODE)` (lines 66–67). The dataset's own
  config serves the minified bundle (`enable_minified = On`). With
  `strict = On` and `enable_minified = Off` set in the fleet's config,
  the walk was taken three times: as it stands (no chapter row had the
  `category` class; the fault shows), with `fix.diff` (the same), and
  with `backport-3_5.diff` (every chapter row had the class; "No Items"
  kept after steps 6 and 10).
- 3.4 (code), `upstream/stable-3_4_0` 95fefd0cf (lib/pkp
  `origin/stable-3_4_0` 366030b017): `CategoryGridHandler.js`,
  `GridHandler.js`, `OrderItemsFeature.js`,
  `OrderCategoryGridItemsFeature.js` and `gridBodyPartWithCategory.tpl`
  identical to `main`'s; `gridRow.tpl` line 20 gives every row
  `gridRow`, and the `is_a()` tests and the alias behind
  `if (!PKP_STRICT_MODE)` are as on 3.5; OMP `ChapterGridHandler.php`
  line 202 adds the ordering. `backport-3_5.diff` checked with
  `patch --dry-run` against 3.4's two files: the JavaScript hunk and
  three template hunks apply, the fourth fails on context.
- 3.3 (code), `upstream/stable-3_3_0` fbe408e8e (lib/pkp
  `origin/stable-3_3_0` 126b86bc2e): the same five lib/pkp files
  identical; `GridCategoryRow` is not namespaced, so the `category`
  class applies; OMP `ChapterGridHandler.inc.php` line 176 adds the
  ordering.
- Introduced: at 26afc06efd^ the chapter row was rendered by
  `gridCategoryRow.tpl` inside a `<tr class="category">` wrapper with no
  `gridRow` class (`gridBodyPartWithCategory.tpl`); the hide in
  `addElement()` and `getEmptyElement()`'s fallback were already there.
  No PR; the commit names PKP's old bug tracker number 7730.
- Upstream: pkp/pkp-lib, pkp/omp and pkp/ui-library searched by the
  symptom's words ("No Items", "Cancel ordering", chapter order) and by
  `getEmptyElement`, `cancelOrderHandler` and `CategoryGridHandler`;
  `pkp/pkp-lib#1170` (closed) is a plain grid's `getEmptyElement()`
  finding no placeholder, another fault.
- Unverified: the minified bundle with the fix was not built.
