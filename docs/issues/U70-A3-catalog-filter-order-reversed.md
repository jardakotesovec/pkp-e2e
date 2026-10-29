# Catalog page: a series or category filter set to an ascending "Order of monographs" lists its books in reverse

- **Severity** low
- **Effort** small
- **Kind** regression
- **Affects**
  - main: OMP
  - 3.5: OMP
  - 3.4: OMP (code)
  - 3.3: none (code; 3.3 stores the direction as `1`, which the check matches until an upgrade to 3.5 or `main` rewrites it)
- **Introduced** `pkp/omp#979` for `pkp/pkp-lib#5328` · [928796ee85](https://github.com/pkp/omp/commit/928796ee85006797b535312e07e7792f7c5ca740) · 2021-06-08 · Nate Wright (NateWr)
- **Upstream** `pkp/pkp-lib#11743` (closed with a fix, `pkp/omp#2109` and `pkp/pkp-lib#11746`, covering the readers' catalog, series and category pages; the Catalog page's filters were left out)
- **Tracked in** spec U70 [A3](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U70-catalog-management.md#a3), together with [U70-A3-catalog-press-order-lost-after-filter.md](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/issues/U70-A3-catalog-press-order-lost-after-filter.md): both faults sit in OMP `CatalogListPanel::getConfig()` and can be fixed in one change, though each has its own cause and diff
- **Checked** 2026-10-29, each branch's tip (the commits in Evidence)
- **Model** claude-opus-5-5

Update 2026-10-29: the upgrade to 3.5 and to `main` now also rewrites
the series' stored order (`pkp/pkp-lib#13617`, OMP
[c3501fbed7](https://github.com/pkp/omp/commit/c3501fbed786cccbc2499a3a10bb1b96478b2a15)
and
[6a876d4a37](https://github.com/pkp/omp/commit/6a876d4a37e385efbdc337ddf63aa59a5a5cc27c)),
so ascending series carried over from 3.3 now list in reverse too,
while the fault itself is unchanged on `main` and 3.5. Today that
reaches series and categories on the 3.5 branch and `main`, categories
only on the released 3.5.0-5 (no release carries the series migration
yet), and no 3.4 install.

## Summary

On a press's Catalog page, choosing a series or a category under
"Filters" should list its books in that series' or category's own
"Order of monographs". When that order is an ascending one ("Title
(A-Z)", "Publication date (oldest first)", "Series position (lowest
first)"), the books that are not featured come the other way round: Z
to A, newest first, highest position first. Descending orders list
correctly.

"Title (A-Z)" is the order every new series starts with, so a series
left at its default is listed Z to A; so is an ascending series or
category carried over from 3.3, once the press is upgraded to 3.5 or
`main`.
A filtered list of more than 30 books also shows the wrong books on its
first page. The cause is one stale comparison, the same one
`pkp/pkp-lib#11743` already fixed on the readers' pages.

## Impact

- **Lost**: the order the press chose for a series or category, on the
  staff's filtered list. Featured books keep their place at the top.
- **Who**: press managers and Press editors on Content › Catalog,
  filtering by a series or category on an ascending order (one carried
  over from 3.3 included, once upgraded to 3.5 or `main`).
- **Way round**: none on the page; no setting gives the ascending list.

Low: the page's work (the "Featured" and "New release" boxes, "Order
Features") gets done and nothing saved changes; the list only reads
backwards. It would be medium if this order fed anything readers see or
the press saves.

## Steps to reproduce

Preconditions:

- The default dataset, OMP `main`. "From Bricks to Brains: The Embodied
  Cognitive Science of LEGO Robots" (submission 14) is published in the
  series "Psychology", whose "Order of monographs" is "Title (A-Z)", as
  for every series of the dataset. No book is featured.
- "How Canadians Communicate: Contexts of Canadian Popular Culture"
  (submission 4) is in Production, not published. Steps 2 to 4 publish
  it into "Psychology", so the series holds two books.
- The category "Social Sciences" holds no published book, so the
  category half shows only in the list's request.

Series:

1. Sign in as `dbarnes` (Press editor).
2. Open submission 4
   (`/index.php/publicknowledge/en/dashboard/editorial?workflowSubmissionId=4`),
   Publication › "Catalog Entry".
3. "Series": "Psychology"; "Save".
4. "Publish", and "Publish" in "Schedule For Publication".
5. Open Catalog (`/index.php/publicknowledge/en/manageCatalog`),
   "Filters", and under "Series" press "Psychology".

Category:

6. Settings › Press › "Categories", "Social Sciences" › "Edit": "Order
   of monographs" "Title (A-Z)"; "Save". (3.5: the dataset's categories
   already hold "Title (A-Z)"; skip this step.)
7. Open Catalog, "Filters", and under "Categories" press "Social
   Sciences".

**Expected**: in step 5, "From Bricks to Brains…", then "How Canadians
Communicate…", A to Z; in steps 5 and 7, a list request asking for
`orderDirection=ASC`.

**Observed**: step 5 lists "How Canadians Communicate…", then "From
Bricks to Brains…". The two requests ask for the reverse:

```
GET …/api/v1/_submissions?…&orderBy=title&orderDirection=DESC&seriesIds=5
GET …/api/v1/_submissions?…&orderBy=title&orderDirection=DESC&categoryIds=5
```

With "Psychology" set to "Title (Z-A)" the filter gives the same list,
Z to A, as it should.

## Cause

OMP `CatalogListPanel::getConfig()`
(`classes/components/listPanels/CatalogListPanel.php`) hands the page
each filter's order, read from the category's or series' stored "Order
of monographs", a string such as `title-ASC`. Lines 84 and 85:

```php
[$categorySortBy, $categorySortDir] = explode('-', $category->getSortOption());
$categorySortDir = empty($categorySortDir) ? $catalogSortDir : ($categorySortDir == \PKP\db\DAO::SORT_DIRECTION_ASC ? 'ASC' : 'DESC');
```

`DAO::SORT_DIRECTION_ASC` is the integer 1, from the time the stored
options read `title-1`. Since 3.4 they read `title-ASC`, and
`'ASC' == 1` is false, so every filter is handed `DESC`. Lines 107 and
108 do the same for series. The page sends that direction with the
filter's `orderBy` (ui-library `CatalogListPanel.vue`
`updateSortOrder()`), and lib/pkp
`PKPBackendSubmissionsController::getSubmissionCollector()` (or OMP's
override, for "Series position") applies it.

pkp-lib's repository refactor (`pkp/pkp-lib#5328`) changed the stored
options to `Collector::ORDER_DIR_ASC`, `'ASC'`. Its OMP half,
`pkp/omp#979`, updated the press's own comparison in this method but
left the category and series lines on the old constant. The press's
line has since been reduced to passing the stored direction through
(`pkp/pkp-lib#7128`), and in 2025 `pkp/pkp-lib#11743` did the same for
the readers' catalog, series and category pages; this method was not
part of either.

Reach:

- Every ascending choice of a category or a series: "Title (A-Z)",
  "Publication date (oldest first)" and "Series position (lowest
  first)" go through the same two lines (walked: a series and a
  category on "Title (A-Z)").
- Series and categories carried over from 3.3 list in reverse once the
  install is upgraded to 3.5 or `main`. 3.3 stored an ascending order
  as `title-1` and the like, which the check happens to match. Two
  upgrade migrations rewrite those values to `title-ASC` and the like:
  - categories: lib/pkp `I12133_FixCategorySort`
    (`category_settings`), in the 3.5 releases since 3.5.0-5 and in
    `main`;
  - series: OMP `I13617_FixSeriesSort` (`series_settings`, for
    `pkp/pkp-lib#13617`, whose readers' series page answered 500 on the
    old values), on the 3.5 branch and `main`, in no release yet.

  3.4 has neither migration, so an install upgraded from 3.3 to 3.4
  still lists them right (code; the series half was also seen on
  installs upgraded from PKP's 3.3 data, Evidence).
- Descending choices are right (walked: "Psychology" on "Title (Z-A)";
  "Social Sciences" on "Publication date (newest first)").
- The list shows 30 books at a time, so in a longer filtered list the
  first page holds the wrong books (code).
- The readers' pages: the series page follows the setting on `main` and
  3.5, and the category page on 3.5. On `main` the category page
  follows no order at all
  ([pkp-e2e#597](https://github.com/jardakotesovec/pkp-e2e/issues/597)).
- No other `SORT_DIRECTION_*` comparison with a stored sort option is
  left in OMP, pkp-lib or ui-library (a search: the remaining uses order
  notes, and ui-library's are comments).

## Proposed fix

Pass the stored direction through, as the press's own line in this
method and the readers' handlers since `pkp/pkp-lib#11743` do
([fix-filter-order.diff](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/catalog-page-order-with-filter/fix-filter-order.diff),
OMP only):

```diff
-                $categorySortDir = empty($categorySortDir) ? $catalogSortDir : ($categorySortDir == \PKP\db\DAO::SORT_DIRECTION_ASC ? 'ASC' : 'DESC');
+                $categorySortDir = empty($categorySortDir) ? $catalogSortDir : $categorySortDir;
```

and the same for `$seriesSortDir`. The endpoint already reads anything
but `ASC` as descending, so no check is needed here.

Tried on `main` (2026-10-03; the two lines are unchanged since): with
the fix in, "Psychology" listed A to Z and both
requests asked for `ASC`. "Psychology" on "Title (Z-A)", "Social
Sciences" on "Publication date (newest first)" and the press's default
order after a filter gave the same lists and requests with the fix in
and out. The diff applies together with the companion report's.

**Alternatives**

- Comparing with `Collector::ORDER_DIR_ASC` instead: the same result,
  but it repeats a check the endpoint already makes.
- Reading the option in ui-library: the server owns the parsing for the
  press and the readers' pages.

**What goes with it**

- No stored data to repair on 3.5 and `main`: their upgrades already
  convert carried-over values (Cause, "Reach"), so with the fix an
  upgraded series or category lists in the order it names.
- No API, hook or template change. Backport: the lines are the same on
  3.5 and 3.4.
- A 3.4 backport is the team's call. There a series or category
  carried over from 3.3 still holds `title-1`, and the fix alone would
  hand the page `1`, which the endpoint reads as descending (code): it
  would turn those lists from right to wrong. So the backport would
  need both migrations with it, listed in OMP's 3.4 `upgrade.xml` in a
  new 3.4.0.x block: OMP's own `I13617_FixSeriesSort`, and
  `I12133_FixCategorySort`, which is not on lib/pkp `stable-3_4_0` and
  would be added there. Only OMP's list matters for this page; whether
  OJS and OPS (which list `I12133_FixCategorySort` on 3.5) take it on
  3.4 too is outside this fix.
- Test: a check that a series on "Title (A-Z)" lists A to Z under
  "Filters".

Small: two lines in one OMP class.

## Evidence

- Kept script:
  [`shared/playwright/checks/issues/catalog-page-order-with-filter/walk.js`](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/catalog-page-order-with-filter/walk.js)
  (helpers in its `lib.js`), one walk for both A3 reports, on OMP loaded
  from the default dataset. These Steps are its steps 1 to 4, 7, 9 and
  10; in between it gives submission 4 a "Date Published" and sets the
  press's order for the companion report, which changes no filter's
  request. It records each list's titles and each list request's
  `orderBy` and `orderDirection`; `MODE=neighbour` runs the checks named
  under "Tried".
- Walked on `main` and `stable-3_5_0`, PostgreSQL, the default datasets
  of pkp/datasets 566bb1f (2026-10-03), and again on the tips below with
  pkp/datasets 2f0edb08 (2026-10-29); every walk gave the same Observed
  and requests ("Social Sciences" is category 4 on 3.5).
- Upgraded install (not in the Steps, which start from the default
  dataset): the drive was the daily upstream sync's read of
  `pkp/pkp-lib#13617` (2026-10-28, `docs/tracking/upstream-sync.md`).
  It loaded PKP's 3.3 OMP dataset (pkp/datasets `omp/stable-3_3_0`),
  whose five series all hold `sortOption` `title-1`, gave the series
  "Psychology" a second published book by SQL ("Bomb Canada…" beside
  "From Bricks to Brains…"), and upgraded it to the `main` tip and to
  the `stable-3_5_0` tip (3.5.0.5). Afterwards the "Psychology" filter
  asked for `orderBy=title&orderDirection=DESC&seriesIds=5` and listed
  "From Bricks to Brains…" first; with the value set back to `title-1`
  it asked for `ASC`. That script is not kept here.
- Migrations (code): OMP
  `classes/migration/upgrade/v3_5_0/I13617_FixSeriesSort.php` and
  lib/pkp `classes/migration/upgrade/v3_5_0/I12133_FixCategorySort.php`
  map the six numeric values. `main`'s OMP `dbscripts/xml/upgrade.xml`
  lists both in its 3.3.0.0 to 3.5.9.9 block; `stable-3_5_0`'s lists
  both in its 3.1.0.0 to 3.4.9.9 block and its 3.5.0.0 to 3.5.0.99
  block. Tag `3_5_0-5` lists `I12133_FixCategorySort` (OMP `3896028f1`,
  2026-06-29) and not `I13617_FixSeriesSort`; no tag contains
  `6a876d4a37`. `upstream/stable-3_4_0` lists `I9094_FixSortSetting`
  (the press's option) only, and lib/pkp `stable-3_4_0` has no
  `I12133_FixCategorySort` class.
- 3.4 (code): OMP `upstream/stable-3_4_0` `CatalogListPanel.php` lines
  84 and 107 compare with `SORT_DIRECTION_ASC`, and lib/pkp
  `Repository::getSortSelectOptions()` writes `title-ASC` and the like;
  lib/pkp `PKPBackendSubmissionsController` reads any `orderDirection` but `ASC`
  as descending (lines 166 to 168).
- 3.3 (code): OMP `CatalogListPanel.inc.php` has the same comparison,
  but lib/pkp `PKPSubmissionDAO::getSortSelectOptions()` writes
  `title-1` and the like, so it matches.
- Introduced: the comparison dates from 2017; the change that made it
  wrong is the option format, pkp-lib `1f48f6e414` (PR
  `pkp/pkp-lib#7064`, for `pkp/pkp-lib#5328`) and OMP `928796ee85`
  (`pkp/omp#979`), which updated the press's comparison beside it.
- The readers' category page on `main`: lib/pkp
  `PKPCatalogHandler::category()` reads the category's order (lines 72
  and 73) and does not use it; on 3.5 it passes it to the query.
- Branch tips (2026-10-29): main OMP 3583c1bfd7 (lib/pkp df42984b46,
  lib/ui-library b44825b0); 3.5 OMP 50b83d1e6 (lib/pkp a6ed3df00a,
  lib/ui-library a12b7523); 3.4 OMP 3fd7b430f (lib/pkp cbf5446d1b,
  lib/ui-library ee684b34); 3.3 OMP 62372ab6e (lib/pkp fc94a53416,
  lib/ui-library 96959f9e). The fix was tried at the 2026-10-03 tips:
  main OMP 3b0ecf794c (lib/pkp 3dc90c81a6, lib/ui-library 280f98c5).
