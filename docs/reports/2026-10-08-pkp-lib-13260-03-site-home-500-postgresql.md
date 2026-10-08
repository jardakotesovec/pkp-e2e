# OJS: the site's home page answers 500 on PostgreSQL

- **Severity** medium (high if MySQL fails too, or if the page is a site's front door)
- **Effort** small
- **Kind** defect (introduced by an open PR; nothing is merged)
- **Crash** server
- **Affects**
  - main: none yet; OJS once the PRs merge
  - 3.5, 3.4, 3.3: none (the PRs target `main`)
- **Introduced** `ojs#5784` for `pkp-lib#13242` (the Blade theme "Eidos") · open PR · reviewed 2026-10-08 · Nate Wright (NateWr)
- **Upstream** `pkp-lib#13242` (open)
- **Tracked in** ci-triage companion row for pkp/ojs#5784 · overview [2026-10-08-pkp-lib-13260.md](2026-10-08-pkp-lib-13260.md) · Temporary: delete once acted on
- **Checked** 2026-10-08, the PR heads (the commits in Evidence)
- **Model** claude-opus-5-5

## Summary

On a site with more than one journal, the page that lists the journals
(`/index.php/index`) answers HTTP 500 on PostgreSQL. It happens with the
Default theme; Eidos does not need to be enabled. About 27 of the 84 red
Playwright tests on ojs#5784 show this error.

## Impact

- **Lost**: the site's home page, for every visitor.
- **Who**: OJS installs on PostgreSQL that host two or more journals and set no journal redirect.
- **Way round**: none on screen (the journals' own pages work).

Medium: a public page fails for everyone, but only on such an install, and the journals' own pages work.

## Steps to reproduce

Preconditions: OJS on PostgreSQL, PKP's default dataset. The "Eidos" theme is never enabled or selected in these steps; the journal stays on the Default theme.

1. Sign in as `admin` and add a second journal: Administration › Hosted Journals › "Create Journal", name "Second Journal", path `second`, with "Enable this journal to appear publicly on the site" ticked (with one public journal the site's address forwards to that journal instead).
2. Sign out and open `/index.php/index`.

**Expected**: the list of the two journals.

**On `main` today:**

![On `main` today](img/2026-10-08-pkp-lib-13260/03-site-home-before.png)

**Observed**: HTTP 500 with an empty body (a blank page). Server log:

```
SQLSTATE[22P02]: Invalid text representation: 7 ERROR:  invalid input syntax for type bigint: "*"
… select count(*) as aggregate from "submissions" as "s" … where "s"."context_id" in (*) and "s"."status" in (3)
#12 classes/view/HomepageBlocksRegistry.php(132): PKP\submission\Collector->getCount()
#17 pages/index/IndexHandler.php(143): PKP\view\HomepageBlocksRegistry->load()
```

With the first query fixed, a second one fails the same way
(`… from "issues" … where "i"."journal_id" in (*)`, `HomepageBlocksRegistry.php(191)`).

## Cause

`pages/index/IndexHandler.php` now calls `$templateMgr->homepageBlocks->load($journal)` on every home
page, whatever the theme. On the site level two loaders in OJS's new
`classes/view/HomepageBlocksRegistry.php` pass the literal `'*'` as the context id:

```php
// "search" block, line 131
->filterByContextIds([$context ? $context->getId() : '*'])
// "recent issues" block, line 185
->filterByContextIds([$context?->getId() ?? '*'])
```

The collectors' wildcard is `Application::SITE_CONTEXT_ID_ALL` (`-1`), which they test for before
adding the `where` (`lib/pkp/classes/submission/Collector.php:471`, `classes/issue/Collector.php:365`);
`'*'` goes into the query as a value. The "latest articles" loader in the same file (line 57) uses
the constant.

## Proposed fix

```diff
-                        ->filterByContextIds([$context ? $context->getId() : '*'])
+                        ->filterByContextIds([$context ? $context->getId() : Application::SITE_CONTEXT_ID_ALL])
…
-                        ->filterByContextIds([$context?->getId() ?? '*'])
+                        ->filterByContextIds([$context?->getId() ?? Application::SITE_CONTEXT_ID_ALL])
```

Tried: the site's home page answers 200 and lists both journals; the twelve red main-pass tests
with this error pass (the serial and solo ones with it were not rerun). The fix of finding 10 (do not run the loaders for a theme that shows no
blocks) would also keep these queries away from the Default theme, but Eidos needs the two lines
either way.

## Evidence

- **Refs.** ojs `b8904676e1` (ojs#5784, on the ojs tip `49515c6e3e`), lib/pkp `571ea1fcac` (pkp-lib#13260, on `151e6e9d69`), lib/ui-library `96764aa9` (ui-library#972, on `7f5e51ca`); PostgreSQL, PHP 8.3.
- **Driven.** The steps above on the default dataset at the tip (list) and at the PR head (500);
  with the fix, 200. Kept walk: `shared/playwright/checks/sync/pkp-lib-13260/shots.js`
  (`SIDE=before|after`), fix in `fix-ojs.diff`.
- **Tests.** U20 S4 rerun alone at the PR head: `expect(siteHome.status).toBe(200)` received 500.
- **Not driven.** MySQL and MariaDB (the same queries carry `'*'` there; a guess is that they
  return nothing instead of failing).
