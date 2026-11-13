# On MySQL and MariaDB, a category with no name in the reader's language is listed first

- **Severity** low
- **Effort** small
- **Kind** defect
- **Affects**
  - main: OJS, OMP (code), OPS
  - 3.5: none (code; categories are listed in their saved order, not by name)
  - 3.4: none (code; the same)
  - 3.3: none (code; the same)
- **Environment** only on MySQL 8.0 and MariaDB 10.11 (walked on both, PHP 8.3; red on PHP 8.2 too in the configurations run); not on PostgreSQL 16
- **Introduced** `pkp/pkp-lib#10404` · [198595800a](https://github.com/pkp/pkp-lib/commit/198595800a0bd40db5db4d41d1a7b34556894719) · 2025-05-12 · Taslan A. Graham (taslangraham)
- **Upstream** none found (2026-11-13)
- **Tracked in** U16 [A26](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U16-categories.md#a26) · ci-triage row C-U16-1
- **Checked** 2026-11-13, each branch's tip (the commits in Evidence)
- **Model** claude-opus-5-5

## Summary

A visitor reads a journal or preprint server in a language one of its
categories has no name in, French for one. On an install whose database
is MySQL or MariaDB, that category, shown under its name in the primary
language, comes first in the "Browse" block, ahead of the French names in
alphabetical order; a category page's "Subcategories" puts such a
subcategory first the same way. On PostgreSQL it comes last. Every
category is still listed and opens.

## Impact

- **Lost**: nothing; the category lists are complete. Their order in a
  second language depends on the install's database, and on MySQL and
  MariaDB an untranslated category heads every list.
- **Who**: multilingual journals, presses and preprint servers on MySQL
  or MariaDB with a category not named in every language, for every
  reader of the other language.
- **Way round**: name every category in every language the site offers.

Low: the order is wrong but nothing is hidden or lost. It would be
medium if a category dropped out of a list.

## Steps to reproduce

Preconditions:

- OJS or OPS `main` installed on MySQL 8.0 or MariaDB 10.11, with a
  journal (or server) whose website and forms are in English and French,
  and its manager.

Steps:

1. Sign in as the manager. Under Settings › Journal (Server) ›
   "Categories", "Add Category" four times, each with "Name" and "Path"
   and "Save": "Arts" (French "Beaux-arts"), "Zoology" (French
   "Animaux"), "Science" (French "Sciences"), and "Mathematics" with no
   French name.
2. In Website › Plugins, tick "Browse Block"; in Website › Appearance ›
   Setup, tick "Browse Block" under "Sidebar" and "Save".
3. As a visitor, open the "Arts" category page with the language set to
   French, and read the "Browse" block.

**Expected**: one order on every database. On PostgreSQL it is
"Animaux", "Beaux-arts", "Sciences", "Mathematics", the untranslated one
last.

**Observed** on MySQL 8.0.46 and MariaDB 10.11.19, OJS and OPS alike:

```
Mathematics
Animaux
Beaux-arts
Sciences
```

A subcategory with no French name ("Topology" under "Science", beside
"Physique" and "Botanique") comes first in the French "Sciences" page's
"Subcategories" the same way. In English, where every category has a
name, the lists are alphabetical on every database.

## Cause

`PKP\category\Collector::getQueryBuilder()` (lib/pkp
`classes/category/Collector.php`, lines 181 to 189) left-joins the
category's `title` setting in the request's language only and orders by
`COALESCE(category_settings.setting_value) ASC`, a `COALESCE` of one
argument, so with no fallback. A category with no title in that language
sorts as NULL: PostgreSQL puts NULL after every value, MySQL and MariaDB
before. The name the page shows falls back to the primary language
(`Category::getLocalizedTitle()`), the sort does not. Every list the
Collector orders is reached: the "Browse" block, a category page's
"Subcategories", the Categories settings tab and the submission's
category picker. OMP lists its categories through the same Collector
(not walked).

The ordering by title came with pkp/pkp-lib#10404 ("Allow nested
categories"); 3.5, 3.4 and 3.3 order categories by `seq` and their place
in the tree (code). pkp-lib `ore` carries it (`356d223ea0`).

## Proposed fix

Sort a category with no name in the reader's language after the named
ones on every database, as PostgreSQL does today
([fix.diff](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/sync/cfg-category-order/fix.diff)):

```diff
-        $qb->orderByRaw('COALESCE(category_settings.setting_value) ASC');
+        // A category with no name in this language goes last on every database (MySQL and
+        // MariaDB sort NULL first, PostgreSQL last).
+        $qb->orderByRaw('CASE WHEN category_settings.setting_value IS NULL THEN 1 ELSE 0 END')
+            ->orderBy('category_settings.setting_value');
```

Tried on the `mysql` line: the French "Browse" block reads "Animaux",
"Beaux-arts", "Sciences", "Mathematics" and the suite's categories
scenario S7 passes on OJS and OPS; on PostgreSQL it passes with the fix
in as without it.

**Alternatives**:

- Sort by the name the page shows, the primary language's where the
  reader's is missing: join the title in the context's primary language
  and use it as the `COALESCE`'s second argument
  ([fix-shown-name.diff](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/sync/cfg-category-order/fix-shown-name.diff)).
  The one-argument `COALESCE` reads as if this was the intent, and it
  makes the lists alphabetical by what readers see ("Animaux",
  "Beaux-arts", "Mathematics", "Sciences"), but it changes PostgreSQL
  installs' order too. Tried on the `mysql` line: the lists read so on
  OJS and OPS.
- Leave the order to the database: two installs of one site disagree.

**What goes with it**: the same line on `ore`; the daily configurations
run checks it (the suite's categories S7 is red on MySQL and MariaDB
until the fix lands; with the alternative, the suite's expected order
changes on every database).

Small: one line, or one join and one line for the alternative.

## Evidence

- Kept script: `shared/playwright/checks/sync/cfg-category-order/walk.js`,
  on a reset install of the `mysql` line (MySQL 8.0.46, PHP 8.3) and of
  the `mariadb` line (MariaDB 10.11.19, PHP 8.3), each OJS and OPS
  `main`:
  `PKP_E2E_LINE=mysql PROBE_FEATURE=<feature> PROBE_AGENT=<agent> node bin/probe.js ojs,ops shared/playwright/checks/sync/cfg-category-order/walk.js`.
  It seeds the context, its manager and the categories through the
  campaign's seeding API (as "Add Category" › "Save" makes them), takes
  step 2 on the screens and reads step 3's block and the "Sciences"
  page's "Subcategories". Its header says what "fixed" reads. On
  PostgreSQL (the usual test install) the untranslated category and
  subcategory come last, the control.
- The configurations run
  [43340246182](https://github.com/jardakotesovec/pkp-e2e/actions/runs/43340246182)
  (OJS `3c99722dc8`, OPS `c74e5bf190`) reds the suite's categories S7 on
  OJS and OPS the same way on PHP 8.2 with MySQL 8.0, PHP 8.2 with
  MariaDB 10.11 and PHP 8.3 with MySQL 8.0; reproduced on the `mysql`
  and `mariadb` lines.
- Both fixes tried with `PKP_E2E_LINE=mysql node bin/try-fix.js apply … ojs ops`,
  each with the walk and S7, then reverted; on PostgreSQL S7 with
  `fix.diff` in.
- Tips: main OJS 3c99722dc8, OPS c74e5bf190, OMP 61df357b9 (code),
  pkp-lib ad75b174f0; ore pkp-lib 356d223ea0 (code); stable-3_5_0
  pkp-lib 5af8e67ab4 (code, `Collector::getQueryBuilder()` orders by the
  tree); stable-3_4_0 and stable-3_3_0 pkp-lib (code, the same order in
  `Collector` and `CategoryDAO.inc.php`).
- Introduced: `git log -L` on the ordering line gives `198595800a`.
