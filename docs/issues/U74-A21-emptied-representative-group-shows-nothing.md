# A book's "Representatives" group emptied by "Delete" shows nothing under its heading until a reload

- **Severity** low
- **Effort** small
- **Kind** defect
- **Affects**
  - main: OMP
  - 3.5: OMP
  - 3.4: OMP (code)
  - 3.3: OMP (code; suppliers only)
- **Introduced** [26afc06efd](https://github.com/pkp/pkp-lib/commit/26afc06efd7688f269c8965048afbe083d1628c3) (pkp-lib) · 2012-08-13 · Bruno Beghelli (beghelli)
- **Upstream** none found (2026-10-21)
- **Tracked in** spec U74 [A21](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U74-onix-metadata-export.md#a21)
- **Checked** 2026-10-21, each branch's tip (the commits in Evidence)
- **Model** claude-opus-5-5

## Summary

An editor deletes the last agent, or the last supplier, on a book's
"Marketing" › "Representatives" page. "Representative removed."
appears and the row goes, but nothing shows under the group's heading
where "No Items" should be; the line comes back only after a reload.

The representative is deleted, and the other group keeps its rows or
its "No Items" line.

## Impact

- **Lost**: nothing; the delete is stored.
- **Who**: a press manager or editor who deletes the last agent or the
  last supplier of a book.
- **Way round**: none needed; a reload shows "No Items".

Low: a group heading left blank until the page is reloaded, with the
delete done.

## Steps to reproduce

Preconditions:

- PKP's default test dataset for OMP `main` (no representative on the
  install).
- Sign in as `dbarnes`.
- On an install where no representative was ever added, the first one
  added is not listed until a reload, and its delete is not shown
  either
  ([U74 A20](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U74-onix-metadata-export.md#a20)).
  So add that first one to another book and leave it there: open
  submission 5, "Bomb Canada and Other Unkind Remarks in the American
  Media", side menu "Marketing" › "Representatives", press "Add
  Representative", choose "Agent", Role "Sales agent (08)", Name
  "First Agency h21k", press "OK", and reload the page.

With an agent:

1. Open submission 4, "How Canadians Communicate: Contexts of Canadian
   Popular Culture", and choose "Marketing" › "Representatives" in its
   side menu. "Agents" and "Suppliers" each read "No Items".
2. Press "Add Representative", choose "Agent", Role "Sales agent (08)",
   type "Beta Agency h21k" in "Name" and press "OK". "Representative
   added." shows, the agent is listed under "Agents", and that group's
   "No Items" goes.
3. Press the arrow before "Beta Agency h21k", then "Delete", then "OK".
4. Reload the page.

With a supplier (on a freshly loaded dataset, after the same
precondition):

5. Open submission 4's "Representatives" as in step 1 and press "Add
   Representative". The window shows both "Role" lists; it saves a
   supplier only after "Agent" and then "Supplier" are clicked
   ([U74 A12](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U74-onix-metadata-export.md#a12)).
   So click "Agent", then "Supplier", choose Role "Distributor to
   end-customers (12)", type "Alpha Books h21k" in "Name" and press
   "OK". The supplier is listed under "Suppliers".
6. Press the arrow before "Alpha Books h21k", then "Delete", then "OK".
7. Reload the page.

**Expected**: at step 3, "Representative removed.", the row goes, and
"Agents" reads "No Items" again; at step 6 the same for "Suppliers".

**Observed**: at step 3, "Representative removed." shows and the row
goes, but nothing stands under "Agents": its "No Items" line stays
hidden. "Suppliers" keeps its "No Items". The table reads:

```
Representatives
Add Representative
Name    Role
Agents
Suppliers
No Items
```

At step 6 the same happens to "Suppliers", while "Agents" keeps its
"No Items". After each reload (steps 4 and 7) both groups read "No
Items". Each delete answers 200, and the table's request for the row
answers 200 with `"elementNotFound"`.

## Cause

After a delete, `RepresentativesGridHandler::deleteRepresentative()`
(OMP, line 360) answers
`DAO::getDataChangedEvent($representative->getId(), (int) $representative->getIsSupplier())`.
The page asks for that row inside its category and is told
`elementNotFound`. `GridHandler.replaceElementResponseHandler()`
(lib/pkp `js/controllers/grid/GridHandler.js` line 727) finds the row
through `CategoryGridHandler.getRowByDataId()` and calls
`CategoryGridHandler.prototype.deleteElement()`
(`js/controllers/grid/CategoryGridHandler.js` line 307). That override
handles a whole category and rows that share an id, then calls
`GridHandler.prototype.deleteElement()` (line 452).

`GridHandler.deleteElement()` shows the group's empty line only when the
row is the last of its kind (line 468):
`if (this.getElementsByType($element).length == 1)`. For a row,
`GridHandler.getElementsByType()` (line 240) returns every `.gridRow`
in the row's `tbody`.

In a category grid that `tbody` is the category's
(`gridBodyPartWithCategory.tpl`), and its first row is the category's
own heading row, rendered by `gridRow.tpl` as
`<tr class="gridRow category …">`. So a category with one
representative counts two rows, the check never holds, and the "No
Items" `tbody` after the category (`.empty.category_placeholder`, which
`getEmptyElement()` finds) is never shown again.
`CategoryGridHandler.getElementsByType()` (line 241) overrides the
method only for a whole category body and passes rows to the parent
unchanged.

The data-rows-only count exists:
`CategoryGridHandler.prototype.getRowsInCategory()` (line 89) returns
`$('tr.gridRow', $category).not('.category')`. lib/pkp
[26afc06efd](https://github.com/pkp/pkp-lib/commit/26afc06efd7688f269c8965048afbe083d1628c3)
("Implement category rows with columns and row actions", 2012-08-13)
added it, in the same change that gave the category row the `gridRow`
class inside the category's `tbody`, but `getElementsByType()` was not
switched to it. Before that change one `<tr class="category">` wrapped
the rendered category row and all the data rows; the wrapper had no
`gridRow` class, so the count held only the data rows.

Reach:

- Every legacy category grid whose delete handler answers
  `getDataChangedEvent($rowId, $categoryId)`: in OJS, OMP and OPS today
  only the "Representatives" table (code: the other calls that pass a
  category are the plugins table's enable and disable, which never
  remove a row).
- The other category grids (publication formats, chapters, stage
  participants, the library files, OJS's issue table of contents)
  answer a delete with a refresh of the whole grid or the whole
  category, which redraws the empty line from the server (code).
- Plain grids are not reached: their `tbody` holds data rows only.
- On 3.3 an agent's delete takes another path: "Agents" is category 0,
  and before `pkp/pkp-lib#8968`
  ([635c43d67a](https://github.com/pkp/pkp-lib/commit/635c43d67ab806b3077595ba11331ce4062bf90c), first
  in 3.4) `DAO::getDataChangedEvent()` drops a parent id of 0
  (`if ($parentElementId)`) and `gridRow.tpl` leaves `-category-0` out
  of the row's id (`{if $categoryId}`). So the page asks for a whole
  category rather than the row in it. Only "Suppliers" (category 1)
  follows the path above there (code; 3.3 not walked).

## Proposed fix

Count data rows only in a category grid: in
`CategoryGridHandler.prototype.getElementsByType()`, answer a row with
`getRowsInCategory()` of its category's `tbody`
([fix.diff](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/emptied-representative-group-shows-nothing/fix.diff)):

```diff
 	$.pkp.controllers.grid.CategoryGridHandler.prototype.getElementsByType =
 			function($element) {
 		if ($element.hasClass('category_grid_body')) {
 			return this.getCategories();
+		} else if ($element.hasClass('gridRow')) {
+			// The row's category body also holds the category's own row:
+			// count the data rows only.
+			return this.getRowsInCategory($element.parents('tbody:first'));
 		} else {
 			return /** @type {jQueryObject} */ (
 					this.parent('getElementsByType', $element));
```

The category grid handler already overrides this method and
`getEmptyElement()` for what is particular to categories, and the
helper it calls is the one written for this count. The
`CategoryGridHandler.deleteElement()` override is not the place: it
hands the row to the parent, which reads `getElementsByType()` itself.
In a subcomponent category grid the data rows sit in a `tbody` of their
own, without a category row, and the helper counts them the same way.

Tried on OMP `main`: with the fix, the group's "No Items" showed at
once after step 3 and after step 6, and the other group kept its line.
Deleting one of two agents left the other listed with no "No Items",
and an agent added to the emptied group hid the line again, with the
fix and without it.

**Alternatives**

- Count `.gridRow:not(.category)` in `GridHandler.getElementsByType()`:
  the same result, but it puts category knowledge into the base class.
- Answer the delete with a refresh of the category
  (`getDataChangedEvent($isSupplier)`) in `RepresentativesGridHandler`:
  it would show the line by redrawing the group from the server, but
  only for this one table, with a request more per delete, and the
  shared count would stay wrong for any category grid that deletes a
  row in place.

**What goes with it**

- What it touches: the count is read only by `deleteElement()`, so the
  change shows the empty line where it was missed and changes nothing
  else. No request, hook or API changes.
- Backport: `CategoryGridHandler.js` is the same file on
  `stable-3_5_0`, `stable-3_4_0` and `stable-3_3_0`, and the diff
  applies to each. On 3.3 it covers the "Suppliers" group; an agent's
  delete there needs `pkp/pkp-lib#8968` too.
- Test: an e2e test that deletes a book's last agent and reads "No
  Items" under "Agents" before any reload, since the legacy JavaScript
  has no unit tests.

## Evidence

- Kept script, run on installs loaded from PKP's default test dataset
  (pkp/datasets `5f247d04`, 2026-10-20; PostgreSQL), in Chromium:
  [walk.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/emptied-representative-group-shows-nothing/walk.js),
  with helpers in
  [lib.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/emptied-representative-group-shows-nothing/lib.js).
  With no argument it takes steps 1 to 4, with `supplier` steps 5 to 7
  (each after the precondition), and with `neighbour` the cases the fix
  must leave alone: two agents added, one deleted, the other deleted,
  one added again.
  - The precondition's add on submission 5 is the one server error of
    each run: its row request answers 500
    (`Call to a member function getId() on array` in
    `RepresentativesGridRow.php:56`), which is U74 A20.
- Walked 2026-10-21 on `main`: OMP `5777025be` (lib/pkp `042726ebf6`),
  the agent and the supplier steps.
- Walked 2026-10-21 on `stable-3_5_0`: OMP `cce424e5e` (lib/pkp
  `68512b5fda`), both, with the same result.
- Read in the code for 3.4 and 3.3: `js/controllers/grid/GridHandler.js`,
  `js/controllers/grid/CategoryGridHandler.js` and
  `templates/controllers/grid/gridRow.tpl` are the same at lib/pkp
  `origin/stable-3_4_0` `85f47442cf` and `origin/stable-3_3_0`
  `867ce82d8e`. `RepresentativesGridHandler::deleteRepresentative()`
  answers with the row and its category at OMP `upstream/stable-3_4_0`
  `e30fa7e38` (line 361) and `upstream/stable-3_3_0` `8e72fc883` (line
  331). `635c43d67a` (`pkp/pkp-lib#8968`) is on `stable-3_4_0` and not
  on `stable-3_3_0`, whose `classes/db/DAO.inc.php`
  `getDataChangedEvent()` (line 542) drops a parent id of 0. What the
  page then does with an agent's delete on 3.3 was not traced further
  and not walked.
- The fix, tried 2026-10-21 on the `main` tips above, served as source
  files (`enable_minified` Off). `fix.diff` is written against the OMP
  root (`a/lib/pkp/js/…`); for a pkp-lib pull request, apply it with
  `git apply -p3`.
- Introduced: `git blame` puts the count at lib/pkp `8f42c17a3c`
  (2012-11-26), which only moved `deleteElement()`; at its parent the
  check and `getElementsByType()` come from `666c3b0e9f` (2012-07-27,
  Bruno Beghelli), before the category row had the `gridRow` class.
  `26afc06efd` (2012-08-13) gave it that class. Both are older than any
  OMP release (tag `omp-1_0_0-0`, 2013-03-25), so the Kind is defect: no
  released version is known to have shown the line.
- Upstream: searched pkp/pkp-lib, pkp/omp and pkp/ui-library for "No
  Items" with delete/category grid, representatives delete/empty,
  "Representative removed", `getElementsByType`, `deleteElement
  category` and `CategoryGridHandler empty placeholder`. No hit is
  about this fault.
- Not checked: MySQL; the fault is in the browser alone.
