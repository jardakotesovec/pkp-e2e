# On MySQL and MariaDB, a category with no name in the reader's language heads every category list

- **Severity** low
- **Effort** small
- **Kind** defect
- **Affects**
  - main: OJS, OMP, OPS
  - 3.5: none (code; categories are listed in their saved order, not by name)
  - 3.4: none (code; the same)
  - 3.3: none (code; the same)
- **Environment** only on MySQL 8.0 and MariaDB 10.11 (walked on MySQL 8.0.46 and MariaDB 10.11.19 with PHP 8.3; the same result on PHP 8.2 in automated tests); not on PostgreSQL (walked on 18.6)
- **Introduced** `pkp/pkp-lib#11243` for `pkp/pkp-lib#10404` · [198595800a](https://github.com/pkp/pkp-lib/commit/198595800a0bd40db5db4d41d1a7b34556894719) · 2025-05-12 · Taslan A. Graham (taslangraham)
- **Upstream** none found (2026-11-16)
- **Tracked in** U16 [A26](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U16-categories.md#a26) · ci-triage row C-U16-1
- **Checked** 2026-11-16, each branch's tip (the commits in Evidence)
- **Model** claude-opus-5-5

Update 2026-11-16: re-verified end to end.

## Summary

On a journal, press or preprint server whose database is MySQL or
MariaDB, a category with no name in the language a page is read in
comes first in every category list. In French, for one, an
English-only "Mathematics" heads the "Browse" block and the manager's
Categories settings tab, above "Animaux", "Beaux-arts" and "Sciences";
an English-only subcategory heads its parent's "Subcategories" the same
way. The expected order is the one PostgreSQL gives: the named
categories alphabetically, then the unnamed ones.

A site reaches this state easily: the category form requires a name in
the primary language only. Every category is still listed and opens.
The fix is a few lines in the one shared query that orders every
category list, hence small.

## Impact

- **Lost**: nothing; every list is complete, only its order is wrong.
- **Who**: multilingual journals, presses and preprint servers on MySQL
  or MariaDB with a category not named in every language: every reader
  of that language, and managers and editors who work in it.
- **Way round**: give every category a name in every language the site
  offers.

Low: the order of a list is wrong, and nothing is hidden or lost.

## Steps to reproduce

Preconditions:

- OJS `main` (OMP and OPS alike) newly installed on MySQL 8.0 or
  MariaDB 10.11, with its journal (press, server) and Journal Manager.
- French (Canada) installed for the site (chosen at install time, or
  Administration › Site Settings › "Languages" › "Install Locale"),
  then added to the journal in Settings › Website › Setup › "Languages"
  ("Add/Remove Languages") with "UI" and "Forms" ticked.
- In Settings › Journal (Press, Server) › "Categories", made with "Add
  Category" (a subcategory with "More Actions" › "Add" on its parent's
  row), each with "Name" in English, in French where given, and "Path":
  - "Arts" (French "Beaux-arts"), path `arts`
  - "Zoology" (French "Animaux"), path `zoology`
  - "Science" (French "Sciences"), path `science`, and under it
    "Physics" ("Physique"), path `physics`; "Botany" ("Botanique"),
    path `botany`; "Topology" (no French name), path `topology`
  - "Mathematics" (no French name), path `mathematics`

Steps:

1. Sign in as the Journal Manager. In Settings › Website › "Plugins",
   tick "Browse Block" (on a new press it is already ticked).
2. In Settings › Website › "Appearance" › "Setup", tick "Browse Block"
   under "Sidebar" and press "Save".
3. Switch the language to "Français (Canada)" and open Settings › Journal
   › "Catégories" (`/index.php/<journal>/fr_CA/management/settings/context`).
4. Sign out and open the "Beaux-arts" category page in French
   (`/index.php/<journal>/fr_CA/catalog/category/arts`; on OPS
   `…/preprints/category/arts`). Read the "Parcourir" ("Browse") block.
5. Open the "Sciences" page (`…/category/science`) and read its
   "Sous-catégories" ("Subcategories").

**Expected**: on every database, as PostgreSQL shows:

- Settings tab, top-level rows (all three apps): "Animaux",
  "Beaux-arts", "Sciences", "Mathematics".
- "Browse" block on OJS and OPS: the same, with "Botanique",
  "Physique", "Topology" nested under "Sciences".
- "Browse" block on OMP, one flat list: "Animaux", "Beaux-arts",
  "Botanique", "Physique", "Sciences", "Topology", "Mathematics".
- "Sous-catégories": "Botanique", "Physique", "Topology".

**Observed** on MySQL 8.0.46 and MariaDB 10.11.19:

```
Settings tab, top level (all apps):  Mathematics, Animaux, Beaux-arts, Sciences
"Browse" block, OJS and OPS:         Mathematics, Animaux, Beaux-arts, Sciences
  nested under Sciences:             Topology, Botanique, Physique
"Browse" block, OMP, on MySQL:       Mathematics, Topology, Animaux, Beaux-arts, Botanique, Physique, Sciences
"Browse" block, OMP, on MariaDB:     Topology, Mathematics, Animaux, Beaux-arts, Botanique, Physique, Sciences
"Sous-catégories" (all apps):        Topology, Botanique, Physique
```

In English, where every category has a name, all of these lists are
alphabetical on MySQL too.

## Cause

`PKP\category\Collector::getQueryBuilder()` (lib/pkp
`classes/category/Collector.php`, lines 179 to 189) orders every
category query by the title in the request's language. It left-joins
the `title` setting in `Locale::getLocale()` only (an empty title
counts as none, `setting_value != ''`) and orders by
`COALESCE(category_settings.setting_value) ASC`, a `COALESCE` with one
argument, so with no fallback. A category with no title in that
language sorts on NULL.

SQL leaves the place of NULL in an ordering to the database: PostgreSQL
puts it after every value in ascending order, MySQL and MariaDB before
it. Several NULLs have no order among themselves, so MySQL and MariaDB
can list two unnamed categories in opposite orders. The page shows such
a category under a fallback title (`Category::getLocalizedTitle()`: the
context's primary language, then the site's, then any); the sort has no
fallback.

The title order came with `pkp/pkp-lib#11243`, which dropped the manual
ordering of categories (the `seq` column) when it allowed nested
categories.

Reach: every list built from the Collector, on all three apps.

- The "Browse" block (`BrowseBlockPlugin::getContents()`: nested on OJS
  and OPS, one flat list on OMP): on screen.
- A category page's "Subcategories" (`PKPCatalogHandler::category()`):
  on screen.
- Settings › "Categories" (`GET /api/v1/categories`,
  `CategoryCategoryController::getMany()`, with the schema map's
  `subCategories`; one tree on every app): top-level rows on screen.
- In the code: the submission's "Categories" picker (built in
  `PKPSubmissionHandler`), the dashboard's category filter (each app's
  `DashboardHandler`), the publication's issue entry form (OJS and OPS
  `IssueEntryForm`) and OMP's `CatalogEntryForm`, OMP's
  `CatalogListPanel`, `CatalogBookHandler` and sitemap, OPS's
  `PreprintsHandler` and `PreprintHandler`, the home page's category
  listing, the web feed plugin, and other callers of `getMany()`.

## Proposed fix

Make the order explicit in the Collector: a category with no title in
the request's language goes after the titled ones, and ties keep the
order the categories were made in
([fix.diff](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/category-without-translation-listed-first-mysql/fix.diff)):

```diff
-        $qb->orderByRaw('COALESCE(category_settings.setting_value) ASC');
+        // A category with no title in this locale sorts after the titled ones on every database
+        // (PostgreSQL sorts NULL last, MySQL and MariaDB first), and ties keep a stable order
+        $qb->orderByRaw('category_settings.setting_value IS NULL ASC')
+            ->orderBy('category_settings.setting_value')
+            ->orderBy('c.category_id');
```

This follows the code base's own patterns: `PKP\publication\Collector`
places NULLs with `orderByRaw('p.version_stage IS NOT NULL ASC')`, and
`PKP\submissionFile\Collector` ends on the id "for stable sort order".
`IS NULL` sorts false before true on all three databases.

Tried on MySQL and MariaDB on all three apps: the steps show Expected,
and OMP's two unnamed categories come as "Topology", "Mathematics" on
both, as on PostgreSQL. On PostgreSQL every list read the same with the
fix in as without it. In English the lists stayed alphabetical on MySQL
with the fix in.

**Alternatives**

- Sort by the name the page shows: join the fallback titles and make
  them the `COALESCE`'s further arguments. The one-argument `COALESCE`
  reads as if this was the intent, and every list becomes alphabetical
  by what readers see ("Animaux", "Beaux-arts", "Mathematics",
  "Sciences"). It changes today's order on PostgreSQL too, so it is a
  product choice, and it needs a decision on which fallback chain the
  sort copies: `getLocalizedTitle()` tries the context's primary
  language before the site's, while `PKP\user\Collector`'s name sort
  falls back to the site's primary language only. Not tried.
- `NULLS LAST`: PostgreSQL has it, MySQL and MariaDB do not.

**What goes with it**

- The same lines on pkp-lib's `ore` branch, which carries the title
  order.
- Left out: `PKP\search\engines\DatabaseEngine` sorts search results by
  title the same way (NULL first on MySQL and MariaDB). The search page
  offers no control that asks for that order; a fix there would follow
  the same pattern.
- A test: pkp-lib has no category Collector test, so one needs a new
  home (a `DatabaseTestCase` under `tests/classes/category/`) with one
  untitled category. Whether pkp-lib's PHPUnit tests run on MySQL and
  MariaDB in PKP's CI is not known here; the apps' `main.yml` runs its
  `test` job on all three databases.
- No stored data changes.

Small: three lines in one shared class, and a new unit test.

## Evidence

- Kept script:
  `shared/playwright/checks/issues/category-without-translation-listed-first-mysql/walk.js`
  (helpers in `lib.js` beside it). It seeds the preconditions (the
  context in English and French, its manager, the categories) through
  the campaign's seeding API, as "Add Category" › "Save" makes them,
  since PKP's test dataset exists for PostgreSQL only; steps 1 to 5 go
  through the screens, step 3 by the French address rather than the
  language menu. Run on a reset install of a line:
  `PKP_E2E_LINE=mysql PROBE_FEATURE=cfg-mysql PROBE_AGENT=<agent> node bin/probe.js all shared/playwright/checks/issues/category-without-translation-listed-first-mysql/walk.js`
  (`PKP_E2E_LINE=mariadb` likewise; without a line on the PostgreSQL
  install). `WALK_MODE=nb` reads the same lists in English.
- Walked on OJS, OMP and OPS on MySQL 8.0.46, MariaDB 10.11.19 and
  PostgreSQL 18.6, all on PHP 8.3. No server error and no page script
  error beyond the Plugin Gallery list's failure on every test install.
- PHP 8.2: the daily configurations run
  [43340246182](https://github.com/jardakotesovec/pkp-e2e/actions/runs/43340246182)
  (OJS `3c99722dc8`, OPS `c74e5bf190`) fails the categories scenario S7
  (the French "Browse" block on OJS and OPS) the same way on PHP 8.2
  with MySQL 8.0 and with MariaDB 10.11, and on PHP 8.3 with MySQL 8.0.
  Not walked.
- Fix: `node bin/try-fix.js apply …/fix.diff ojs omp ops` with
  `PKP_E2E_LINE=mysql` and `mariadb`, each with the walk, then reverted;
  on PostgreSQL `main` the walk with the fix in. The English walk on
  MySQL ran with the fix's first form (without the `c.category_id`
  tie-break, which no English list here reaches) in and out. English
  not walked on MariaDB or PostgreSQL.
- Introduced: `git blame` on the ordering line gives `198595800a`, whose
  diff replaces the `seq`-and-parent order with the title order; its PR
  `pkp/pkp-lib#11243` dropped manual ordering on review ("We've decided
  to drop the Order functionality").
- Form: `PKP\category\Repository::validate()` requires the multilingual
  title in the context's primary language only
  (`ValidatorFactory::required`); the schema marks `title` nullable.
- Upstream: pkp/pkp-lib, pkp/ojs, pkp/omp, pkp/ops and pkp/ui-library
  searched 2026-11-16 by the symptom's words and by the Collector's
  order. `pkp/pkp-lib#7419` (closed) is about a category page's articles
  sorted by title in a second language, not the category lists.
- Code reads: main `lib/pkp/classes/category/Collector.php` and the
  callers above; 3.5 pkp-lib `classes/category/Collector.php`
  (`checkouts/stable-3_5_0` and `origin/stable-3_5_0` `1647346e6f`),
  ordered by `seq` and the parent; 3.4 pkp-lib `origin/stable-3_4_0`
  `classes/category/Collector.php`, the same; 3.3 pkp-lib
  `origin/stable-3_3_0` `classes/context/CategoryDAO.inc.php`,
  `ORDER BY seq` and the same parent order. pkp-lib `origin/ore`
  carries the main line.
- Tips: main OJS `925ed49f3b`, OMP `92dd31031b`, OPS `d75f514776`,
  pkp-lib `3ed5d1c3b3` (the MySQL and MariaDB installs at the same
  commits); stable-3_5_0 OJS `6cfc46e6fc`, pkp-lib `bb17ba1380`;
  stable-3_4_0 OJS `61835656a2`, pkp-lib `2dd24cc5ae`; stable-3_3_0
  OJS `b83fb9e44d`, pkp-lib `df738d3a66`; ore pkp-lib `9353b8232f`.
- Unverified: the settings tab's nested rows (it opens closed), and the
  callers read in the code, were not walked.
