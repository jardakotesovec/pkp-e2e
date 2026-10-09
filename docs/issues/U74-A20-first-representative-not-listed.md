# A book's "Representatives" table does not redraw the first representative ever added on the install

- **Severity** low
- **Effort** small
- **Kind** defect
- **Crash** both
- **Affects**
  - main: OMP
  - 3.5: OMP
  - 3.4: OMP (code)
  - 3.3: OMP (code; when it is a supplier)
- **Introduced** [666c3b0e9f](https://github.com/pkp/pkp-lib/commit/666c3b0e9f1a165349bebe33fbc6df7dadc540be) (pkp-lib) and [7218a8698](https://github.com/pkp/omp/commit/7218a8698eccc03520b8b74f63f0cf699966a6f6) (OMP) · 2012-07-27 and 2012-08-01 · Bruno Beghelli (beghelli)
- **Upstream** none found (2026-10-09)
- **Tracked in** spec U74 [A20](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U74-onix-metadata-export.md#a20)
- **Checked** 2026-10-09, each branch's tip (the commits in Evidence)
- **Model** claude-opus-5-5

## Summary

On an install where no representative was ever added, an editor adds
one on a book's "Marketing" › "Representatives" page. "Representative
added." appears, but the table's request for the new row fails on the
server: neither "Agents" nor "Suppliers" lists it, and no error shows.
The editor expects it listed at once, like every representative added
after it.

The representative is saved, and a reload lists it. The table misses
that representative's later changes the same way: after its "Edit" the
row keeps the old name and role, and after its "Delete" the row stays,
each until a reload. An editor who adds it again instead of reloading
stores it twice.

Only the one representative stored first on the install is affected,
agent or supplier, whichever book it belongs to. Once it is deleted
the fault is over on that install for good: an emptied list does not
bring it back.

## Impact

- **Lost**: nothing; the add, the edit and the delete are each stored,
  and a notice says so. A second add made because the first is not
  listed is stored as well, and a reload then lists the representative
  twice.
- **Who**: whoever adds an install's first representative (a press
  manager or press editor, or a series editor or assistant assigned to
  the book), and anyone who edits or deletes that one later. They see
  no error, only a table that does not change. Each failed request
  writes a fatal error to the server's PHP error log.
- **Way round**: reload the page.

Low: the request that fails only redraws a row, so no save is at risk,
and the fault ends with one record. A duplicate made on the way is in
plain view after a reload and can be deleted.

## Steps to reproduce

Preconditions:

- PKP's default test dataset for `main` (or `stable-3_5_0`), OMP,
  freshly loaded. The fault needs the next representative to be the
  first the install ever stored (it gets id 1). One walk of these steps
  uses that up, and so does any other representative added before
  them, deleted or not: load the dataset again before each walk.
- Submission 4, "How Canadians Communicate: Contexts of Canadian
  Popular Culture", is in Production.

Adding the first representative:

1. Sign in as `dbarnes`.
2. Open submission 4 and choose "Marketing" › "Representatives" in the
   side menu. "Agents" and "Suppliers" each read "No Items".
3. Press "Add Representative", click "Agent", choose "Sales agent (08)"
   under "Role", type `Beta Agency hkre` in "Name" and press "OK". The
   walk is a valid one when the table's request after this step
   (`…/representatives-grid/fetch-row?…`) reads `rowId=1`.
4. Reload the page.

Editing it:

5. Press the arrow before "Beta Agency hkre", then "Edit". Choose
   "Exclusive sales agent (05)" under "Role", change "Name" to `Beta
   Agency hkre renamed` and press "OK".
6. Reload the page.

A second representative:

7. Press "Add Representative", click "Agent", choose "Sales agent (08)"
   under "Role", type `Gamma Agency hkre` in "Name" and press "OK".

Deleting the first:

8. Press the arrow before "Beta Agency hkre renamed", then "Delete",
   then "OK".
9. Reload the page.

**Expected**: after step 3, "Beta Agency hkre" is listed under "Agents"
reading "Sales agent (08)". After step 5 its row reads "Beta Agency
hkre renamed" and "Exclusive sales agent (05)". After step 8 its row
is gone. None of the three needs a reload.

**Observed**: step 3 shows "Representative added.", and "Agents" still
reads "No Items"; step 4 lists "Beta Agency hkre". Step 5 shows
"Representative edited.", and the row still reads "Beta Agency hkre"
and "Sales agent (08)"; step 6 shows the new name and role. Step 8
shows "Representative removed.", and "Beta Agency hkre renamed" stays
listed above "Gamma Agency hkre"; step 9 removes it. No error shows on
the page. After each of steps 3, 5 and 8 the table's request for the
row answers 500, and the server log reads:

```
PHP Fatal error:  Uncaught Error: Call to a member function getId() on array in …/controllers/grid/catalogEntry/RepresentativesGridRow.php:56
[500]: GET /index.php/publicknowledge/$$$call$$$/grid/catalog-entry/representatives-grid/fetch-row?submissionId=4&rowId=1&rowCategoryId=0
```

Control: at step 7 "Gamma Agency hkre" is listed under "Agents" at
once.

Adding it again instead of step 4 (on a freshly loaded dataset):

- Step 3 repeated without a reload shows "Representative added." and
  lists one "Beta Agency hkre". Two are stored, and a reload lists
  both. The browser console logs `Row with id 1 not found!`, a script
  error in the table's own code.
- "Delete" › "OK" on the first of the two shows "Representative
  removed." and leaves both rows listed. "Delete" › "OK" on that row
  once more leaves the "Delete" window open with a spinner and no
  message; the request answers 500 (`Representative referenced outside
  of authorized monograph context!`), and "Cancel" closes the window.
- After a reload, deleting the one left empties the list. The next
  representative added is listed at once.

A first representative added as a supplier (on a freshly loaded
dataset, at step 3 choose "Distributor to end-customers (12)" in the
right-hand "Role" list, type `Alpha Books hkre`, click "Agent", then
"Supplier", and press "OK") is not listed under "Suppliers" either
until a reload; its row request (`rowId=1&rowCategoryId=1`) answers
the same 500. The two clicks are the way round of a separate fault,
linked in Evidence.

## Cause

After a save or a delete, `RepresentativesGridHandler` (OMP,
`updateRepresentative()` line 314, `deleteRepresentative()` line 360)
answers `DAO::getDataChangedEvent($id, (int) $isSupplier)`: redraw one
row inside one category. The page then asks for
`fetch-row?rowId=<id>&rowCategoryId=<0|1>`.

`CategoryGridHandler::getRowDataElement()` (lib/pkp,
`classes/controllers/grid/CategoryGridHandler.php` line 331) first
looks `rowId` up among the grid's own data elements, which on a
category grid are its categories. It looks inside the category that
`rowCategoryId` names only when that first lookup finds nothing.

The representatives grid's categories are a plain list
(`RepresentativesGridHandler::loadData()`), keyed 0 ("Agents") and 1
("Suppliers"). For the representative with id 1 the first lookup finds
the "Suppliers" category and returns that array as the row's data.
`RepresentativesGridRow::initialize()` (line 56) calls `getId()` on it,
and the request dies. The page's `$.get()` has no failure handler, so
nothing is redrawn and nothing is shown.

The rule it breaks: a row's id and a category's key are two separate
sets of ids, so a hit among the categories says nothing about the row
that a request naming its category asks for. The method also serves
`fetchCategory()`, where `rowId` is a category's key and no
`rowCategoryId` is sent; that is why it looks among the categories at
all.

Representative ids come from one counter for the whole install,
starting at 1, and an id is not given out again after a delete. So
only id 1, the "Suppliers" key, can collide (id 0, the "Agents" key, is
never given out), and only once per install. After that
representative's delete the lookup still finds the category instead of
nothing, so the page is never told the row is gone.

The script error of the second add comes from the same miss: the
answer for the new row lists the category's row order, and
`GridHandler.js` `resequenceRows()` throws on the row the page never
received.

pkp-lib 666c3b0e9f ("Refresh categories and/or rows inside
categories", 2012) added the method with this order, and OMP 7218a8698
changed the representatives grid five days later from redrawing the
whole table to this single-row refresh. Both came before OMP's first
release.

Reach:

- The only other grid that asks for a row by its category is the
  plugins list (`PluginGridHandler::enable()` and `disable()`, lib/pkp).
  Its categories are keyed by name ("generic", "blocks") and its rows
  by plugin name, so none collide (code; a plugin switched on and off
  redraws its row, checked on screen on OJS, OMP and OPS).
- No other call of `DAO::getDataChangedEvent()` in the three apps and
  the plugins they ship passes a category (searched).

## Proposed fix

In `CategoryGridHandler::getRowDataElement()`, look among the
categories only when the request names no category:
[fix.diff](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/first-representative-not-listed/fix.diff).

```diff
     protected function getRowDataElement($request, &$rowId)
     {
-        $rowData = parent::getRowDataElement($request, $rowId);
         $rowCategoryId = $request->getUserVar('rowCategoryId');
+        // A row requested with its category is looked up inside that category alone:
+        // its id may also be a category's key, and a category's data is not a row's.
+        $rowData = is_null($rowCategoryId) ? parent::getRowDataElement($request, $rowId) : null;
 
         if (is_null($rowData) && !is_null($rowCategoryId)) {
```

The fix sits in the shared method that owns the lookup, so both grids
that send a category are covered, and the rest of the method (the
lookup inside the category, `elementNotFound` for a row that is gone)
is unchanged. A request without `rowCategoryId` takes the same path as
today. The method is protected and no REST endpoint or hook passes
through it.

Tried on `main`, the dataset loaded again before the walk with the fix
as before the one without it. With the fix, step 3 lists "Beta Agency
hkre" at once, step 5 redraws its row with the new name and role, and
step 8 removes it. The three row requests read `rowId=1` and answer
200, the last one with `elementNotFound`.

With the fix and without it, the neighbours behave the same:

- A second agent and a supplier are each listed at once, the second
  agent's "Edit" redraws its row and its "Delete" removes it.
- On "Publication Formats", "Awaiting Approval" › "OK" on the "PDF"
  format redraws its line as "Approved". That is a `fetch-category`
  request, which goes through the same method without a category.
- On OJS, OMP and OPS, "Google Analytics Plugin" ticked and unticked
  under Settings › Website › Plugins redraws its row each time
  (`rowId=googleanalyticsplugin&rowCategoryId=generic`).

**Alternatives**:

- Key the representatives grid's categories by name in `loadData()`
  and send that key from the two actions: it removes the collision in
  OMP and leaves the shared lookup wrong for the next grid with numeric
  category keys.
- Guard `RepresentativesGridRow::initialize()` against data that is
  not a `Representative`: the 500 goes, the row is still not redrawn.
- Answer every save with `DAO::getDataChangedEvent()`, a redraw of the
  whole table, as before 7218a8698: it works, and gives up the
  single-row refresh for every representative because of one.

**What goes with it**:

- Backport: the method is the same on 3.5, 3.4 and 3.3. The diff
  applies to 3.5 and 3.4 as written (`patch --dry-run`); 3.3 needs the
  same two lines by hand in `CategoryGridHandler.inc.php`.
- A test: no test touches representatives today (OMP's `cypress/` and
  `tests/`, lib/pkp's). A Cypress test under OMP's
  `cypress/tests/integration/` fits: add a representative to a book,
  check it is listed without a reload, edit it, delete it. pkp's CI
  runs that folder after the default dataset is dumped, on an install
  that never stored a representative, so the test's one gets id 1
  there. On an install where the test has run before it passes without
  proving anything.
- Not as a step of the data build (`cypress/tests/data/`): that would
  store a representative in the default dataset and use up id 1 on
  every install loaded from it.

Small: two lines in one pkp-lib method, and one Cypress test.

## Evidence

- The kept script, which takes steps 1 to 9 on an install freshly
  loaded from the default dataset and records, per step, the notice,
  the table's redraw requests with their answers, the server log's
  error lines and the "Agents" and "Suppliers" lists as shown:
  [walk.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/first-representative-not-listed/walk.js).
  In pkp-e2e: `PROBE_FEATURE=<dataset fleet's feature> PROBE_AGENT=<run folder> node bin/probe.js omp shared/playwright/checks/issues/first-representative-not-listed/walk.js`
  (with `PKP_E2E_LINE=stable-3_5_0` in front for 3.5), the fleet reset
  before each run. The argument `again` takes the "Adding it again"
  walk, `supplier` the supplier's, and `neighbour`, run with `all` for
  the three apps, the neighbour checks of the fix trial. The script
  needs `../representative-window-refuses-supplier/lib.js`, the
  neighbouring report's helpers.
- Walked on `main` and 3.5: steps 1 to 9, with the same result on both
  (every failing request read `rowId=1`). On `main` only: "Adding it
  again", the supplier's walk, and the fix trial (the steps with the
  fix, the neighbours with and without it; the diff applied to the
  three apps). Each walk started from a fresh load of the dataset.
- Chromium on PostgreSQL. Datasets: pkp/datasets 1a196c3 (2026-10-08).
  The walks set up no data beyond what the steps do.
- What the editor sees of the failure: the page showed no notice but
  the success one, no browser dialog and no error text at steps 3, 5
  and 8; the browser console logged each 500.
- Branch tips. For `main` and 3.5 the pkp-lib commit is the one OMP's
  tip points at; for 3.4 and 3.3 it is pkp-lib's own branch tip.
  `main`: OMP 57a9235110, pkp-lib 27938abd4c (OJS's pkp-lib d1bc3a9ecc
  holds the same `CategoryGridHandler.php`), ui-library 38814ea1. 3.5:
  OMP ddc6abf5a9, pkp-lib 8094f06bf5. 3.4: OMP 0aec65441, pkp-lib
  8bf0ab5072 (OMP's tip points at df13621c2d). 3.3: OMP 8e72fc883,
  pkp-lib 8c5b3f7f5c (OMP's tip points at d446601ebe). At both commits
  of each pair the method and `getDataChangedEvent()` read the same.
- Code read for 3.5 and 3.4: `CategoryGridHandler::getRowDataElement()`
  is the same as on `main`; `RepresentativesGridHandler` answers the
  same two events and lists the same two categories;
  `RepresentativesGridRow::initialize()` calls `getId()` on the row's
  data the same way; `CategoryGridHandler.js` sends `rowCategoryId`
  the same way.
- Code read for 3.3: the same method and row class (`.inc.php`). There
  `DAO::getDataChangedEvent()` still drops a category id of 0 (`if
  ($parentElementId)`; changed in 3.4 for `pkp/pkp-lib#8968`), so an
  agent's save sends no category and does not reach this lookup with
  one. A first representative saved as a supplier sends
  `rowCategoryId=1` and does. So on 3.3 the fault shows only when the
  first representative is a supplier.
- Kind: the grid dates from OMP 5e0d3c7ff (2012-01-29) and redrew the
  whole table until 7218a8698. The first tag that holds the grid,
  `omp-0_9_9-0` (2012-09-17), already holds both commits, so no release
  redrew this row right: a defect, not a regression.
- Introduced: neither commit has a pull request; both messages name
  the old tracker's bug 7394.
- The test's place: pkp/pkp-github-actions `action.yml` (read
  2026-10-09) runs `cypress/tests/data`, dumps the database and uploads
  the dataset, then runs `lib/pkp/cypress/tests/integration` and the
  app's `cypress/tests/integration`.
- Upstream: searched pkp/pkp-lib, pkp/omp and pkp/ui-library for
  "representative not listed", "representatives grid", "first
  representative reload", `CategoryGridHandler getRowDataElement`,
  `rowCategoryId`, `RepresentativesGridRow` and "getId() on array". The
  one related hit, `pkp/pkp-lib#8968` ("[OMP] Adding representatives
  does not update the view for newly added data", closed in 2023 by
  `pkp/pkp-lib#9036`), reports the same symptom from another cause
  (`getRowsSequence()` and the dropped category 0). Its fix is on
  `main`, 3.5 and 3.4 and left this lookup as it was. Its closing
  comment calls the legacy grid toolset deprecated and prefers small
  changes to it.
- Not driven: "Edit" on the row that stays after step 8; an edit or a
  delete of a first representative that is a supplier; "Adding it
  again" and the fix on 3.5.
- Unverified: that an id is never given out again was walked on
  PostgreSQL only. MySQL before 8.0 and MariaDB before 10.2.4 keep the
  auto-increment counter in memory and set it at a server restart to
  the highest id left plus one (their documentation, not checked
  here); on those an emptied `representatives` table could give id 1
  again after a restart.
- Neighbouring reports on this page:
  [U74-A12-representative-window-refuses-supplier.md](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/issues/U74-A12-representative-window-refuses-supplier.md)
  (the two clicks a supplier needs) and
  [U74-A13-representative-type-change-listed-twice.md](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/issues/U74-A13-representative-type-change-listed-twice.md).
