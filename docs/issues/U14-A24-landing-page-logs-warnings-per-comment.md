# Each load of an article's page writes two PHP warnings to the error log per comment shown

- **Severity** low
- **Effort** small
- **Kind** regression
- **Affects**
  - main: OJS (a press and a preprint server have no comment box)
  - 3.5: none (no reader comments)
  - 3.4: none (code; no reader comments)
  - 3.3: none (code; no reader comments)
- **Introduced** PR `pkp/pkp-lib#12421` for `pkp/pkp-lib#12420` · [2d0ff65aed](https://github.com/pkp/pkp-lib/commit/2d0ff65aed8d3c2fc4bd5526e45d847056c7d32a) · 2026-03-12 · Taslan A. Graham (taslangraham)
- **Upstream** `pkp/pkp-lib#12705` (open; fix in PR `pkp/pkp-lib#13586`, not yet in main). The issue covers every query that selects only some columns of a model with settings; this page's comment count is one, and a comment on the PR reports its warning. Merging the PR ends the warnings on this page (its `select()` part, tried here), so no separate fix is needed
- **Tracked in** spec U14 [A24](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U14-reader-comments-and-moderation.md#a24)
- **Checked** 2026-11-16, each branch's tip (the commits in Evidence)
- **Model** claude-opus-5-5

## Summary

With public comments on, each load of an article's page writes
"Undefined property: stdClass::$user_comment_id" twice to the server's
error log for every comment the visitor may see there: the approved ones
and, for a signed-in visitor, their own comments awaiting approval.

The page and its counts show correctly, and no screen shows the
warnings, since PKP ships with PHP's error display off.

## Impact

- **Lost.** Nothing. The lines crowd the error log in proportion to the
  journal's readership and its comments, so real faults in it are harder
  to spot.
- **Who.** Whoever reads the server's error log, on every journal that
  switches public comments on, on every load of a commented article.
- **Way round.** None in the app; only PHP's own `error_reporting` hides
  them.

Low: the only cost is a noisier log.

## Steps to reproduce

Preconditions:
- PKP's default test dataset for OJS `main`, freshly loaded. Submissions
  17, "Antimicrobial, heavy metal resistance and plasmid profile of
  coliforms isolated from nosocomial infections in a hospital in Isfahan,
  Iran", and 1, "Signalling Theory Dividends", are published; neither
  holds a comment.
- PHP logs warnings: `log_errors = On` and `E_WARNING` in
  `error_reporting` (PHP's default includes it); `display_errors = Off`
  under `[debug]` in `config.inc.php`, the dataset's value.
- A view of the server's PHP error log (the terminal running `php -S`,
  or the web server's error log).

Switch comments on:
1. Sign in as `dbarnes`.
2. Open Settings › Website, the "Content" tab, the "Comments" side tab.
   Tick "Enable Public Comments" and press "Save".

One approved comment, one awaiting approval:
3. Sign in as `ccorino` and open submission 17's article page
   (`/index.php/publicknowledge/article/view/17`). Type "u14n16a approved
   comment by ccorino" in the comment box and press "Submit".
4. Sign in as `dbarnes` and open Content › Comments. In the comment's row
   press "…" › "View Comment", then "Approve Comment".
5. Sign in as `zzedd`, open submission 17's article page, type "u14n16a
   pending comment by zzedd" and press "Submit".

Load the page:
6. Still as `zzedd`, reload submission 17's article page. It shows the
   approved comment and his own, "Your comment will be visible when the
   editor approves it".
7. Sign out and open submission 17's article page again. It shows the
   approved comment only.
8. Still signed out, open submission 1's article page, which has no
   comment.

**Expected:** the error log gains no line at steps 6, 7 and 8.

**Observed:** each page answers 200 and reads as it should: "All
Comments (1)" in the sidebar, and the version heading "Version of Record
1.0 (2)" at step 6, "Version of Record 1.0 (1)" at step 7. While the page
loads, the error log gains these two lines for each comment shown: four
lines at step 6, two at step 7 (PHP 8.3):

```
PHP Warning:  Undefined property: stdClass::$user_comment_id in …/lib/pkp/classes/core/SettingsBuilder.php on line 341
PHP Warning:  Undefined property: stdClass::$user_comment_id in …/lib/pkp/classes/core/SettingsBuilder.php on line 348
```

Step 3's first load of the page, before any comment exists, adds
nothing. Opening the page at step 5 writes
two, for the one approved comment. Step 4 writes two other
warnings, of another cause (U14
[A25](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U14-reader-comments-and-moderation.md#a25)).

## Cause

`ojs/pages/article/ArticleHandler::view()` builds a
`PKP\components\UserCommentComponent` while `enablePublicComments` is on.
Its constructor counts the comments the visitor may see, per version and
in all, with
`UserComment::withPublicationIds(...)->where(...)->select(['publication_id', 'is_approved'])->get()`.
`UserComment` uses `ModelWithSettings`, so `get()` runs through
`PKP\core\SettingsBuilder::getModels()` and `getModelWithSettings()`.
That method attaches each row's settings by its primary key: it reads
`$row->{$primaryKey}` for every row, once to collect the ids (line 341)
and once to index the rows (line 348). The narrowed select left
`user_comment_id` out, so each read warns, two per row. The settings
query then runs as `WHERE user_comment_id IN (null)` and returns nothing;
the counts read only `publication_id` and `is_approved`, so they stay
right.

The builder assumes every row carries the primary key: it neither adds
the key to a narrowed select nor checks for it. Before
`pkp/pkp-lib#12421` the component counted with
`->pluck('count', 'publication_id')`, which reads the base query and
builds no model, so nothing warned. That PR switched to `get()` on the narrowed select so it
could also count the visitor's own unapproved comments.

Reach:
- The article's landing page in OJS: the only caller of
  `UserCommentComponent` (checked in the code).
- The other comment reads (the public list `comments/public`, the
  Comments page and its panels, writing, reporting, approving) select
  whole rows and write none of these lines (on screen: the "Submit" at
  steps 3 and 5 and the Comments page at step 4 log none of them).
- `PKP\editorialTask\Repository::countOpenPerStage()` has the same
  pattern (`selectRaw('stage_id, COUNT(stage_id) as count')` on
  `EditorialTask`, a model with settings) and would warn once per stage
  group the same way; nothing calls it today (checked in the code).
- The other narrowed selects on models with settings in lib/pkp and the
  three apps are subqueries or `DB::table()` reads, which do not pass
  through the builder (checked in the code).

## Proposed fix

Fix the builder, not the counting: a narrowed `select()` is ordinary
Eloquent, and `SettingsBuilder` is the layer that needs the primary key.
The open PR `pkp/pkp-lib#13586` (item 3 of `pkp/pkp-lib#12705`) does
this, and its `select()` part alone is the whole fix for this report.
When the select is a plain list of column names,
`getModelWithSettings()` adds the primary key to the main table's query.
It then loads only the settings named in the list; here none are named,
so the settings query is skipped. `filterRow()`, now given the selected
list instead of `['*']`, drops the key from the returned rows.

```diff
-        $collection = $this->query->get();
+        // The columns set with select() take precedence, the same as in the query builder
+        $selectedColumns = Arr::wrap($this->query->columns ?? $columns);
+        $settingColumns = null;
+
+        $query = clone $this->query;
+        if ($this->isColumnProjection($selectedColumns)) {
+            // Only the columns of the main table can be selected from it,
+            // the primary key is needed to attach the settings to the rows
+            $columns = array_map(fn (string $column) => Arr::last(explode('.', $column)), $selectedColumns);
+            [$settingColumns, $primaryColumns] = collect($columns)->partition(
+                fn (string $column) => $this->isSetting($column)
+            );
+            if (!$primaryColumns->contains($primaryKey)) {
+                $primaryColumns->push($primaryKey);
+            }
+            $query->columns = $primaryColumns->values()->all();
+        }
+
+        $collection = $query->get();
```

The full diff, with `isColumnProjection()` and the settings query kept
to the selected settings, is
[fix.diff](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/landing-page-logs-warnings-per-comment/fix.diff),
the PR's `select()` hunks applied to today's `main` without its
`update()` and `delete()` parts, which they do not depend on. It was
tried on OJS `main`: with it in, steps 5 to 7 write no line, and the
page still reads "All Comments (1)" and "Version of Record 1.0 (2)" or
"(1)". A full-row read keeps its settings: an approved comment's panel
on the Comments page reads "This comment was approved on 2026-11-16 by
Daniel Barnes." with the fix in and out.

- **Alternatives.**
  - `->toBase()->get()` in `UserCommentComponent` (or a `count()` per
    publication in SQL): one line, and it skips the models and the
    settings query, but it is a guard at one caller that leaves the
    builder's trap for the next one.
  - Adding `user_comment_id` to the component's select: silences the
    warnings but loads every comment's settings for nothing.
- **What goes with it.**
  - The diff, like the PR, strips the table prefix from the selected
    columns and writes the bare names, the key included, back to the
    query, so a `table.column` select on a joined query would become an
    ambiguous column. This page's select names no table and joins
    nothing; keeping the prefix on the query's columns closes the gap.
  - The PR leaves expressions and aliases on the old path, so
    `EditorialTask` `countOpenPerStage()`'s `selectRaw()` would still
    warn once a caller uses it. A `->toBase()` there covers it.
  - Once merged, `get(['col', …])` on a model with settings selects only
    those columns from the database instead of `*`; no caller in lib/pkp
    or the three apps passes such a list today (checked in the code).
  - No stored data to repair; the PR's 3.5 twin, `pkp/pkp-lib#13587`,
    carries the builder change there.
  - The guard: `SettingsBuilderTest` cases for a narrowed select without
    the key (the PR adds them), and an e2e check that a commented
    article's page writes nothing to the server's log.

Small: one method in the shared builder, its unit tests already in the
PR.

## Evidence

- Kept script:
  [walk.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/landing-page-logs-warnings-per-comment/walk.js)
  (helpers in `lib.js` beside it) takes steps 1–8 on an OJS install
  loaded from the default dataset (pkp/datasets `961a9871`, 2026-11-15,
  the `pgsql` dump; the walks ran on PostgreSQL, PHP 8.3) and reads the
  server's log around each load:
  `node bin/probe.js ojs shared/playwright/checks/issues/landing-page-logs-warnings-per-comment/walk.js`;
  its `neighbour` argument takes the full-row read under Proposed fix.
- Tips: OJS `925ed49f3b` (lib/pkp `3ed5d1c3b3`); OMP `92dd31031` and OPS
  `d75f514776` (lib/pkp `3ed5d1c3b3`); stable-3_5_0 OJS `6cfc46e6fc`
  (lib/pkp `bb17ba1380`); stable-3_4_0 OJS `61835656a2` (lib/pkp
  `2dd24cc5ae`); stable-3_3_0 OJS `b83fb9e44d` (lib/pkp `df738d3a66`).
- Code reads on `main`: `UserCommentComponent::__construct()`,
  `ArticleHandler::view()`, `SettingsBuilder::getModels()`,
  `getModelWithSettings()` and `filterRow()`, `UserComment`
  (`getSettings()`: `approvedAt`, `approvedByUserId`),
  `UserCommentResource`; every `select()`, `addSelect()` and
  `selectRaw()` in lib/pkp and the three apps checked against the
  models using `ModelWithSettings`; every `get([…])`/`first([…])` column
  list, none on such a model. OMP and OPS: no caller of
  `UserCommentComponent` in their `pages/`, `classes/` or `plugins/`.
- Introduced: `git blame` on the select (line 68) gives `2d0ff65aed`,
  whose message names PR #12421 for #12420; its diff replaces the
  `pluck('count', 'publication_id')` count with `get()`. The builder's
  key reads are older: before `8a9c145806` (2026-01-26) its
  duplicate-safe path, taken whenever two rows lack the key, read
  `$row->{$primaryKey}` the same way. No caller narrowed a select
  through `get()` on a comment before `2d0ff65aed`.
- 3.5 walked: Settings › Website offers no "Content" tab, and submission
  17's page carries no comment block and writes no line. Code: no
  `classes/userComment/` or `UserCommentComponent` in its lib/pkp. 3.4
  and 3.3 (code): no `classes/userComment/` in lib/pkp
  `origin/stable-3_4_0` or `origin/stable-3_3_0`, and no `UserComment`
  in OJS `upstream/stable-3_4_0` `pages/article/ArticleHandler.php` or
  `upstream/stable-3_3_0` `ArticleHandler.inc.php`.
- Upstream read 2026-11-16: `pkp/pkp-lib#12705` ("SettingsBuilder
  gotchas", open) names, under item 3, the warnings a narrowed select
  without the key gives; PR `pkp/pkp-lib#13586` (open, head
  `41d9d3d867`) changes `getModelWithSettings()` as above, prefix
  stripping included. Searched by
  `user_comment_id`, "Undefined property", `UserCommentComponent`,
  `getModelWithSettings` and `SettingsBuilder` in pkp/pkp-lib, pkp/ojs
  and pkp/ui-library. `pkp/pkp-lib#13814` and `pkp/ojs#6088` (comment
  moderation, under review) do not touch `UserCommentComponent` or
  `SettingsBuilder` (`UserCommentController`, `publication/DAO`,
  `user/Repository`, `userComment/Repository`; ojs: the submodule only).
- Unverified: the PR's `update()` and `delete()` parts and its unit
  tests were not run; a server with `display_errors = On` was not
  walked. MySQL not checked; the warning comes from PHP, not the
  database.
