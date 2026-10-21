# A category page number typed past the last page opens an empty page instead of "404 Not Found"

- **Severity** low
- **Effort** small
- **Kind** defect
- **Affects**
  - main: OJS, OMP, OPS
  - 3.5: OJS, OMP, OPS
  - 3.4: OJS, OMP, OPS (code)
  - 3.3: OJS, OMP, OPS (code)
- **Introduced** `pkp/omp#485` for `pkp/pkp-lib#1922` · [04dfb7774a](https://github.com/pkp/omp/commit/04dfb7774ae4db393d7045b55ddf3cbd21b0c3ef) · 2017-12-08 · Nate Wright (NateWr)
- **Upstream** none found (2026-10-21)
- **Tracked in** spec U16 [A23](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U16-categories.md#a23)
- **Checked** 2026-10-21, each branch's tip (the commits in Evidence)
- **Model** claude-opus-5-5

## Summary

A visitor who opens a category's page at a page number past its last
one should get the bare "404 Not Found" page. Instead the category's
page opens with its heading and its count and lists no article. For a
category holding one article, opened at page 2 with the default 25 items
per page, a journal and a preprint server show "26 - 1 of 1 items", a
range that starts after the last article; a press shows "1 Titles" and
"All Books" with nothing under it.

The page answers "200 OK", so a search engine that holds the address
keeps an empty page in its index.

No link leads to such an address: it is typed, bookmarked, or left
behind when the category lost articles or "Items per page" grew.

## Impact

- **Lost**: nothing; at most a search engine keeps an empty page of the
  site in its index.
- **Who**: a visitor arriving from an old search result or bookmark
  after the category shrank; browsing from the site's own links never
  leads there.
- **Way round**: the category's name in the breadcrumb, or the category
  link on the site, opens its first page.

Low. It would be medium if search engines were seen indexing many such
empty pages.

## Steps to reproduce

Preconditions:

- PKP's default test dataset for OJS, OMP or OPS `main`, freshly
  loaded. Its "Items per page" (Settings › Website › "Setup" › "Lists")
  is 25.
- Every category of the dataset is empty. A published version's
  categories cannot be edited, so the steps unpublish one published
  item, place it in the category "Anthropology" and publish it again.
  The item: OJS submission 17, "Antimicrobial, heavy metal
  resistance and plasmid profile of coliforms isolated from nosocomial
  infections in a hospital in Isfahan, Iran"; OMP submission 5, "Bomb
  Canada and Other Unkind Remarks in the American Media"; OPS
  submission 2, "The Facets Of Job Satisfaction: A Nine-Nation
  Comparative Study Of Construct Equivalence".

1. Sign in as `dbarnes`.
2. Open the submission from the editorial dashboard
   (`/index.php/publicknowledge/en/dashboard/editorial?workflowSubmissionId=<id>`).
3. Press "Unpublish" (on a preprint server "Unpost") and confirm with
   "Unpublish" ("Unpost").
4. Open "Publication Settings" in the side menu (on a press "Catalog
   Entry", on a preprint server "Preprint entry").
5. Under "Categories", type "Anthr", choose the suggestion "Social
   Sciences > Anthropology", and press "Save".
6. Press "Schedule For Publication" ("Publish" on a press, "Post" on a
   preprint server) and confirm with "Publish" ("Post").
7. Log out, and open the category "Anthropology":
   `/index.php/publicknowledge/catalog/category/anthropology` (on a
   preprint server `/index.php/publicknowledge/preprints/category/anthropology`).
   It lists the item under "1 Items" ("1 Titles" on a press); a journal
   and a preprint server show "1 - 1 of 1 items" under it and no page
   links.
8. Type the address of its page 2, the same address followed by
   `?categoryPage=2`.

[On `stable-3_5_0`, step 5 ticks a checkbox under "Categories" (on a
journal the field is on the "Issue" page), and step 8 types the address
form its page links use, `…/category/anthropology/2`; on 3.5
`?categoryPage=2` shows page 1. The 3.5 preprint server's dataset has
other categories, so there the steps tick "Mathematics" and open
`/index.php/publicknowledge/preprints/category/mathematics`.]

**Expected:** "404 Not Found", as the journal's issue archive past its
last page (`/index.php/publicknowledge/issue/archive/2`) and the
preprint server's section page past its last page
(`/index.php/publicknowledge/preprints/section/preprints/2`) answer.

**Observed:** the page answers "200 OK", titled "Anthropology | Journal
of Public Knowledge", and reads below the site header:

```
Home / Social Sciences / Anthropology
Anthropology
1 Items
All Items
26 - 1 of 1 items
```

No article is listed and there are no page links. A preprint server
shows the same under "Anthropology | Public Knowledge Preprint Server".
A press shows "Anthropology", "1 Titles" and "All Books", with nothing
under it.

On `stable-3_5_0` the typed `…/anthropology/2` also answers "200 OK":
"1 Items", "All Items" and "Nothing has been published in this category
yet." (on a press "1 Titles", "All Books" and "No titles have been
published yet."), with no range line.

## Cause

`PKPCatalogHandler::category()` in pkp-lib
([lines 75–82](https://github.com/pkp/pkp-lib/blob/f37a174626897ca12ab2066c27d159765c8c970a/pages/catalog/PKPCatalogHandler.php#L75-L82)),
which serves the category page of all three apps, takes the page number
from the `categoryPage` query variable (`getRangeInfo($request,
'category')`) and hands it to `paginate()`, but never compares it with
the paginator's last page. A page past the end gets a paginator with no
items and the category's real total, and the template renders it as a
page.

The journal's and the preprint server's `catalogCategory.tpl` then print
`{page_info iterator=$results}`. `PKPTemplateManager::smartyPageInfo()`
computes "from" as (page − 1) × items per page + 1 (26) and "to" as the
smaller of the total and page × items per page (1), so it prints "26 - 1
of 1 items". "Items per page" there is the context's setting: each app's
`TemplateManager` assigns it over the `items_per_page` default of
`config.inc.php` (with the setting at 1, page 3 of two items reads "3 -
2 of 2 items"). `smartyPageLinks()` prints nothing for a category of one
page. A press's template prints no paging line.

The missing check is as old as the category page's paging: `pkp/omp#485`
(04dfb7774a, 2017, for `pkp/pkp-lib#1922`) added the offset arithmetic
to OMP's `CatalogHandler::category()` with no test that the page exists,
and `pkp/pkp-lib#4158` (75f76c503a, 2018) moved that method to pkp-lib
for OJS and OPS. `pkp/pkp-lib#8920` (2026) replaced the offset with the
search builder's paginator and kept the gap.

Reach:

- An empty category's `?categoryPage=2` shows the same page as its first
  ("0 Items", "0 - 0 of 0 items") instead of 404 (on screen, `main`).
- The search results page (`SearchHandler::search()`) paginates the same
  builder the same way, with no check either (code; a typed
  `searchPage=9` answers "200 OK" on screen). It is a result list for a
  query, not a page the site links to, so this report leaves it alone.
- OMP's catalog and series pages (`CatalogHandler::page()`, `series()`)
  show a page past their end too. Spec U68 records that as A10, an open
  question, so this report does not cover it.
- On `main`, `category()` still reads a page number from the address's
  second part (`$page`, line 56) and never uses it, so a page-2 address
  of 3.5's form (`…/category/anthropology/2`) shows page 1 there (code).
- A page number of 0, a negative number, digits followed by letters
  ("2abc") or a number too large for an integer shows page 1 today:
  Laravel's paginator falls back to page 1 for anything that is not a
  positive whole number (on screen, OPS). The fix leaves that as it is;
  whether such an address should answer 404 instead, as OPS's section
  page does for a word, is a question for the team.
- A word (`?categoryPage=x`) answers a server error before any check is
  reached (on screen, OPS). That is the fault of the report
  [U15 A13](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/issues/U15-A13-search-text-page-number-blank-page.md),
  whose fix casts the page number in `PKPHandler::getRangeInfo()`.

## Proposed fix

Answer 404 in `PKPCatalogHandler::category()` when the requested page is
past the paginator's last page:

```diff
--- a/lib/pkp/pages/catalog/PKPCatalogHandler.php
+++ b/lib/pkp/pages/catalog/PKPCatalogHandler.php
@@ -81,6 +81,11 @@
         }
         $results = $builder->paginate($rangeInfo->getCount(), 'submissions', $rangeInfo->getPage());
 
+        // A page past the last one does not exist
+        if ($results->currentPage() > $results->lastPage()) {
+            throw new \Symfony\Component\HttpKernel\Exception\NotFoundHttpException();
+        }
+
         // Provide the parent category and a list of subcategories
         $parentCategory = $category->getParentId() ? Repo::category()->get($category->getParentId()) : null;
         $subcategories = Repo::category()->getCollector()
```

The diff:
[fix.diff](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/category-page-past-last-not-404/fix.diff).
Tried on `main`, all three apps:

- The typed page 2 of "Anthropology" answered "404 Not Found"; its page
  1 still listed the item.
- An empty category ("Sociology") kept its page at its address and at
  `?categoryPage=1`; its `?categoryPage=2` answered 404 (200 without
  the fix).
- On a press and a preprint server, with two items in "Anthropology"
  and "Items per page" at 1, page 2 listed the second item with the fix
  in and out ("2 - 2 of 2 items" on the preprint server), and the typed
  page 3 answered 404 (without the fix, "2 Titles", or "2 Items" over "3
  - 2 of 2 items", with no item).
- Search results past their end and the address form
  `…/category/sociology/2` answered as before.

It follows `IssueHandler::archive()` and `SectionsHandler::section()`,
which throw the same exception when a page after the first has no
items. Here the paginator already holds the total, so the test compares
the page with `lastPage()` instead. Laravel's `lastPage()` is at least
1, so an empty category keeps its first page.

This is a proposal; the team decides.

**Alternatives**:

- The siblings' test as written, `$results->currentPage() > 1 &&
  $results->isEmpty()`: it works the same for a page past the end, but
  it also refuses a real page inside `lastPage()` whose hits
  `SubmissionSearchResult::newCollection()` all drops (each one a
  submission whose current version is no longer published, still in the
  search index).
- Clamp "from" in `smartyPageInfo()`: the range line reads right, but
  the page still answers "200 OK" as an empty page.
- Redirect to the last page: a typed address keeps working, but a wrong
  address still answers as a real page, unlike the other paged lists
  that answer 404.

**What goes with it**:

- Backport: `stable-3_5_0`, `stable-3_4_0` and `stable-3_3_0` page with
  an offset (`$offset = $page > 1 ? ($page - 1) * $count : 0;`) and count
  `$total` before the fetch, so the check there goes right after the
  count: `if ($offset && $offset >= $total)`. The archive tests
  `!count($issues) && $offset` after its fetch instead; comparing with
  `$total` needs no fetch. On 3.5 it throws the same exception; on 3.4
  and 3.3 it calls `$this->getDispatcher()->handle404();`, as the method
  there does for an unknown category (no 3.4 page handler throws
  `NotFoundHttpException`).
- Nothing stored changes, and no API or plugin hook is involved; a
  search-engine plugin's paginator answers `lastPage()` as every
  `LengthAwarePaginator` does.
- Test: an e2e check in spec U16 (a **Planned** item): a category's
  page past its last one answers 404, and a real page 2 still lists its
  items.

Small: one check in one shared handler, following its siblings, and an
e2e check.

## Evidence

- The kept script
  [walk.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/category-page-past-last-not-404/walk.js)
  (helpers in
  [lib.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/category-page-past-last-not-404/lib.js))
  takes the Steps as `dbarnes` and signed out, then the controls.
  - **Run:** on an install freshly loaded from the default dataset,
    `PROBE_FEATURE=<fleet> PROBE_AGENT=<name> node bin/probe.js all shared/playwright/checks/issues/category-page-past-last-not-404/walk.js`
    (`PKP_E2E_LINE=stable-3_5_0` in front for 3.5). `<fleet>` names the
    pkp-e2e install to drive and `<name>` the folder its records go to.
  - **Neighbour check:** `WALK=neighbour` in front: signed out, the
    empty "Sociology" at its address, `?categoryPage=1` and
    `?categoryPage=2`; search results past their end
    (`search/search?query=the&searchPage=9`); `…/category/sociology/2`.
    On OMP and OPS, `dbarnes` then places two items in "Anthropology"
    (OMP 5 and 14, OPS 2 and 5) as the Steps do, `rvaca` sets Settings ›
    Website › "Setup" › "Lists" › "Items per page" to 1, and signed out
    the script opens page 1, then page 2 and page 3 by typed address.
- Walks: OJS, OMP and OPS on `main` and `stable-3_5_0`, on PostgreSQL,
  datasets from pkp/datasets 5f247d04 (2026-10-20). No request failed on
  the server and no page script failed. MySQL not checked (the fault
  does not depend on the database).
- The fix was tried with `node bin/try-fix.js apply shared/playwright/checks/issues/category-page-past-last-not-404/fix.diff ojs omp ops`:
  the walk and the neighbour check, each on a freshly loaded dataset,
  then reverted, and the neighbour check walked again without it. The
  only failed request in those runs was the Plugin Gallery list that
  Settings › Website fetches on the test installs, which reach no
  outside service (with the fix in and out).
- Not driven: 3.4 and 3.3; a category of several pages typed past its
  end on 3.5; a real page 2 on OJS. The journal has two published
  articles, and submission 1's latest version is unpublished, so placing
  it takes other steps; the handler is the pkp-lib method OMP and OPS
  ran.
- Tips:
  - **`main`:** OJS 3109a59114 (pkp-lib f37a174626), OMP 5777025bec and
    OPS f048e747b4 (pkp-lib 042726ebf6; `PKPCatalogHandler.php` is the
    same file in both pkp-lib commits).
  - **`stable-3_5_0`:** OJS 1e78ca0c2b, OMP cce424e5ef, OPS 5eca7fd603,
    pkp-lib 68512b5fda.
  - **`stable-3_4_0`:** OJS 0012bd1022, OMP e30fa7e38, OPS 0f1e21a117,
    pkp-lib 85f47442cf.
  - **`stable-3_3_0`:** OJS d7d9dd14ec, OMP 8e72fc883, OPS c5532e2161,
    pkp-lib 867ce82d8e.
- Code reads:
  - `main`: `PKPCatalogHandler::category()`, `PKPHandler::getRangeInfo()`,
    `SubmissionSearchResult::builderFromRequest()`, Scout's
    `Builder::paginate()`, `DatabaseEngine::paginate()`,
    `PKPTemplateManager::smartyPageInfo()` and `smartyPageLinks()`, the
    three `catalogCategory.tpl`, `SearchHandler::search()`, OJS's
    `IssueHandler::archive()`, OPS's `SectionsHandler::section()`, OMP's
    `CatalogHandler::page()` and `series()`.
  - 3.5 and 3.4: `category()` pages by `/category/{path}/{n}` with an
    offset and no check; `_setupPaginationTemplate()`; the templates'
    empty branch prints "Nothing has been published in this category
    yet." and no pagination.
  - 3.3: `PKPCatalogHandler.inc.php` the same, with `handle404()` only
    for an unknown category; OPS routes `preprints/category` to it.
- The trace: the paging lines on `main` blame to `pkp/pkp-lib#8920`
  (ce23e18e83, 818aeda367, 2026-01); before it, the offset line
  (`git log -S`) leads to 75f76c503a (`pkp/pkp-lib#4158`, 2018-12-17,
  Alec Smecher, the move to pkp-lib) and, in OMP, to 04dfb7774a
  ("Implement pagination for frontend catalog, series and category
  pages"), which the GitHub API lists under `pkp/omp#485`.
- Upstream searches (2026-10-21; pkp/pkp-lib, pkp/ojs, pkp/omp, pkp/ops,
  pkp/ui-library): "category page 404", "category pagination",
  "categoryPage", "page does not exist 404 pagination",
  `PKPCatalogHandler`, "category page pagination", "of 1 items", "catalog
  category empty page", "category page empty past last page", "paginate
  lastPage NotFoundHttpException", "catalog page past last 404". No
  issue about a category page past its end; `pkp/pkp-lib#10596` fixed
  the same fault for OJS's issue archive only, and `pkp/pkp-lib#5932`
  (open) plans a new category handler without mentioning paging.
