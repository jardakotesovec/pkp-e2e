# Highlights list shows only its first 100 rows after adding a highlight or saving the order

- **Severity** low
- **Effort** small
- **Kind** defect
- **Affects**
  - main: OJS, OMP, OPS
  - 3.5: OJS, OMP, OPS
  - 3.4: OJS (code; the Highlights tab is off unless `[features] highlights = On` is added to `config.inc.php`)
  - 3.3: none (code; no highlights)
- **Introduced** `pkp/pkp-lib#9321` for `pkp/pkp-lib#9262` · [9984fe44](https://github.com/pkp/pkp-lib/commit/9984fe447071d461189e58904f47308e7b2920c4) · 2023-10-12 · Nate Wright (NateWr); on 3.4 the same code came with `pkp/pkp-lib#9270`
- **Upstream** none found (2026-11-09)
- **Tracked in** spec U11 [A12](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U11-highlights.md#a12)
- **Checked** 2026-11-09, each branch's tip (the commits in Evidence)
- **Model** claude-opus-5-5

## Summary

A manager who adds a 101st highlight or a later one expects it as the
list's last row, as on a shorter list. Instead "Save" closes the "Add
Highlight" form and the list drops to its first 100 rows: the new
highlight is not among them, nor are the earlier ones past the
hundredth, and nothing says rows are hidden. A reload shows them all,
the new one last, and the home page's carousel shows the new highlight
at once.

"Save Order" on a list of more than 100 drops it to its first 100 rows
the same way, though the order of every highlight is saved. Editing or
deleting a highlight leaves the list whole.

The cut comes from the server: after these two saves the list is
fetched again from an API that answers at most 100 highlights, and the
page replaces its rows with that answer.

## Impact

- **Lost**: nothing stored. The list hides every row past the
  hundredth, with no count or notice, so a highlight just saved looks
  unsaved.
- **Who**: managers of a journal, press or server holding more than 100
  highlights, at every "Save" in the "Add Highlight" form and every
  "Save Order" on Settings › Website › Setup › Highlights.
- **Way round**: reload the page.

Low: only the list misleads, and only past 100 highlights. It would be
medium if the hidden highlights could lose their place or be dropped; a
"Save Order" on the cut list leaves them last (Cause).

## Steps to reproduce

Preconditions:

- PKP's default test dataset for `main` (OJS, OMP or OPS; the context
  `publicknowledge`). It holds no highlights; the steps add 102.

Setting up:

1. Sign in as `rvaca` (the manager).
2. Open Settings › Website, tab "Setup", side tab "Highlights"
   (`/index.php/publicknowledge/en/management/settings/website`).
3. Press "Add Highlight"; type "u11r3 001" in "Title",
   "https://example.org/1" in "URL" and "Read more" in "Button Label";
   press "Save". Repeat for "u11r3 002" to "u11r3 100", with
   "https://example.org/2" to "https://example.org/100". The list shows
   100 rows, "u11r3 100" last.

   Quicker: instead of step 3, add the first 100 from the browser
   console on this page, with the request the form sends
   (`POST …/api/v1/highlights`, the same fields and CSRF header), then reload
   the page and open "Highlights" again. Only the steps from 4 on need
   the form.

   ```js
   for (let n = 1; n <= 100; n++) {
     await fetch(pkp.context.apiBaseUrl + 'highlights', {
       method: 'POST',
       headers: {'X-Csrf-Token': pkp.currentUser.csrfToken, 'Content-Type': 'application/x-www-form-urlencoded'},
       body: new URLSearchParams({'title[en]': `u11r3 ${String(n).padStart(3, '0')}`, url: `https://example.org/${n}`, 'urlText[en]': 'Read more'}),
     });
   }
   ```

Adding past 100:

4. Press "Add Highlight"; type "u11r3 101" in "Title",
   "https://example.org/101" in "URL" and "Read more" in "Button Label";
   press "Save".
5. Add "u11r3 102" (https://example.org/102) the same way.
6. Reload the page and open the "Highlights" side tab again.
7. Open the journal's home page in a private window.

Saving an order past 100:

8. On the reloaded list, press "Order", then "Save Order" without
   moving anything.

**Expected**: after step 4 the form closes and the list shows 101 rows,
"u11r3 101" last; after step 5, 102 rows, "u11r3 102" last. After step
8 the list leaves ordering mode with the same 102 rows.

**Observed**: after step 4 the form closes and the list shows 100 rows,
ending "u11r3 098", "u11r3 099", "u11r3 100"; "u11r3 101" is not listed
and nothing on the page says rows are hidden. After step 5 the list
still shows those 100 rows, neither "u11r3 101" nor "u11r3 102". The
list request the page sends after each save answers 100 items, with a
total of 100:

```
GET /index.php/publicknowledge/api/v1/highlights?searchPhrase=&count=30&offset=0  → 200
{"itemsMax":100,"items":[ …100 highlights, "u11r3 001" to "u11r3 100"… ]}
```

Step 6 lists 102 rows, "u11r3 101" and "u11r3 102" last, and the
carousel in step 7 holds 102 highlights, the last two "u11r3 101" and
"u11r3 102". After step 8 the list drops to 100 rows again, ending
"u11r3 100", and a reload lists 102 in the same order. The order
request answers 100 items, with a total of 100:

```
POST /index.php/publicknowledge/api/v1/highlights/order  (X-Http-Method-Override: PUT) → 200
{"items":[ …100 highlights, "u11r3 001" to "u11r3 100"… ],"itemsMax":100}
```

Control: up to 100 highlights, each "Save" in the "Add Highlight" form
lists the new highlight at once as the last row.

## Cause

`HighlightsController` in pkp-lib
(`api/v1/highlights/HighlightsController.php`) caps both of its list
answers at `MAX_COUNT`, 100. `getMany()` builds its collector with
`->limit(self::MAX_COUNT)->offset(0)` (lines 143–145) and ignores the
`count` and `offset` the client sends. `order()` builds the list it
returns with a collector limited the same way (line 278). The total
each answer gives, `itemsMax`, is counted on that limited query, so it
reads 100 too, and no request can read a highlight past the 100th.

The list on the Highlights tab is ui-library's `HighlightsListPanel.vue`.
It has no pager, and "Save Order" sends a sequence for every row it
holds. The page gives it every highlight when it opens
(`ManagementHandler::getHighlightsListPanel()` and
`AdminHandler::getHighlightsListPanel()` set no limit). But two of its
handlers then replace its rows with a capped answer: `formSuccess()`
after an add calls the fetch mixin's `get()` (`GET highlights`), and
`saveOrder()` passes the order answer to `setItems()`. From the 101st
highlight on, both leave the list with the first 100.

Edit and Delete fetch nothing (code): after an edit `formSuccess()`
swaps the saved row into the rows it holds, and after a delete the
dialog's callback filters the row out. Both keep `itemsMax` as it was.

The cap came with the controller in the commit that added highlights
(9984fe44), as the upper bound the other list endpoints carry. Those,
the announcements and institutions endpoints among them, read `count`
and `offset` within that bound and serve lists that page. The
highlights list does not page, so the bound cuts it short.

Reach:

- The site's Highlights list (Administration › Site Settings, offered
  once the site hosts two or more journals) is the same component on
  the same two methods, whose site branch
  (`withSiteHighlights(Collector::SITE_ONLY)`) sits under the same
  limit, so it is cut the same way (code). Not walked: it needs a
  second journal and 100 site highlights. On 3.5 no site highlight can
  be saved at all, because `HasRoles::handle()` calls `getId()` on the
  site's missing context and every save there answers a server error
  (spec U11
  [A5](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U11-highlights.md#a5);
  `main` has the fix, `pkp/pkp-lib#13521`).
- A "Save Order" on the cut list (after step 4, before a reload) sends
  the 100 rows it shows, numbered 0 to 99. The hidden highlights keep
  their stored sequence numbers (101 and up, since a new highlight gets
  the last number plus one, `Repository::getNextSequence()`), so they
  stay last (code).
- No other list component has this shape (code): the announcements,
  institutions, OMP catalog, DOI and submissions lists that also fetch
  again through the fetch mixin page, and the contributors list reads
  the publication, not a capped list.

## Proposed fix

Let the highlights list endpoint answer every highlight of the context
(or the site), as the settings page and the home page already read
them: drop the limit from `getMany()` and from `order()`, and the now
unused `MAX_COUNT` with it
([fix.diff](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/highlights-list-drops-past-100/fix.diff);
its paths start at the app root, so in a pkp-lib checkout apply it with
`git apply -p3`):

```diff
-    /** @var int The maximum number of highlights to return in one request */
-    public const MAX_COUNT = 100;
-
…
     public function getMany(Request $illuminateRequest): JsonResponse
     {
-        $collector = Repo::highlight()->getCollector()
-            ->limit(self::MAX_COUNT)
-            ->offset(0);
+        // The Highlights panel orders the whole list and replaces its rows with this answer, so it is never cut short
+        $collector = Repo::highlight()->getCollector();
…
-        $collector = Repo::highlight()
-            ->getCollector()
-            ->limit(self::MAX_COUNT);
+        $collector = Repo::highlight()->getCollector();
```

This leaves the public `GET highlights` with no upper bound, and that is
the recommendation. The bound protects nothing today: every load of the
settings page and of the home page already reads every highlight with
no limit, so a client that could make the API slow could do the same
with either page. Keeping a bound would need the list component to ask
for "all" (a request that is just as unbounded) or to page, and a list
ordered as a whole cannot be split over pages. The team may still
prefer a bound on the public API; it then goes with the second
alternative below.

Tried on `main` on OJS, OMP and OPS: after step 4 the list shows 101
rows and after step 5 102, the new one last each time, and after step 8
the 102 rows stay (each answer 101 or 102 items, with that total). A
short list is unchanged with the fix in and out: three highlights added
one by one each show at once, and moving the third up one and "Save
Order" give 001, 003, 002 on the list, after a reload and on the home
page.

**Alternatives**:

- Append the saved highlight in `formSuccess()` instead of fetching the
  list again, as an edit already does: fixes the add, but "Save Order"
  still drops the list to the order answer's 100.
- Keep the bound, and have the list component send a `count` the
  endpoint honours up to a higher `MAX_COUNT` (the announcements
  pattern, without a pager): two repos, and the same cut returns at the
  new bound. The fetch mixin sends `count=30` by default, so honouring
  `count` alone would cut the list to 30.

**What goes with it**:

- `itemsMax` in `getMany()` is `$collector->getCount()`, and
  `DAO::getCount()` does not run a SQL count: it fetches the rows
  (`->get(…)->count()`). Without the limit, each list request reads the
  highlights twice. Counting the items the answer already holds
  (`summarizeMany($highlights)->values()`, then its `count()`) avoids
  the second read. `$highlights->count()`, as `order()` uses, does not:
  the lazy collection runs its query again and builds every object.
  This change is not in the tried diff.
- The REST API's `GET highlights` answers every highlight instead of at
  most 100, with the true total. No plugin or other caller in the three
  apps reads `HighlightsController::MAX_COUNT`.
- No data repair: nothing is stored wrong.
- 3.5 carries the same lines (its controller differs only in its
  authorization), and the diff applies there with its hunks a few lines
  earlier. 3.4's `HighlightsHandler.php` (the Slim handler of the same
  code) has the same two limits (lines 131–132 and 258), so the
  backport is the same two edits there.
- Test: a step in the e2e scenario "Add a highlight" (spec U11) that
  adds the 101st highlight and reads the list.

## Evidence

- The walk script
  [walk.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/highlights-list-drops-past-100/walk.js)
  takes the Steps as `rvaca`, adding every highlight through the "Add
  Highlight" form, and records the list answers the page receives. The
  argument `api` takes the console route of step 3 and then steps 4 and
  6; `nb` takes the short-list check of the fix trial (three highlights
  added, one moved, "Save Order"). Run it with
  `node bin/probe.js all shared/playwright/checks/issues/highlights-list-drops-past-100/walk.js [api|nb]`.
- The fix trial: `node bin/try-fix.js apply shared/playwright/checks/issues/highlights-list-drops-past-100/fix.diff ojs omp ops`,
  the walk and `nb` on a fresh dataset each, then `revert` and `nb`
  again on the unpatched code.
- Walks: OJS, OMP and OPS on `main` and on `stable-3_5_0` gave the
  Observed with the same Steps, each on a fresh load of its default
  dataset. Up to the 100th, each add's list answer held every highlight
  (read at the 1st, 25th, 50th, 75th and 100th). The console route of
  step 3 was walked on OJS `main`: 100 answers of 200, then step 4 gave
  the same 100-row list and step 6 101 rows. No request answered a
  server error and no page script failed. Edit and Delete on a list of
  more than 100 were read in the code, not walked.
- 3.4 and 3.3 (code): on 3.4 pkp-lib's `HighlightsHandler.php` has the
  same `getMany()` and `order()` limits and ui-library's list component the same
  `formSuccess()` and `saveOrder()`; `ManagementHandler` shows the tab
  only with `[features] highlights` on, and only OJS's 3.4 branch mounts
  `api/v1/highlights`. 3.3 has no highlights in pkp-lib or ui-library.
  On 3.5 the list component is the same file as on `main`, and the controller
  differs only by `ReauthenticationRequiredPolicy` for the site.
- Introduced: blame on both `->limit(self::MAX_COUNT)` calls leads
  through the rename from `HighlightsHandler.php` (71e79e31, which left
  those lines alone) to 9984fe44; 3.4's copy came with 301cc44e8b; the
  list's `formSuccess()` fetch came with ui-library 0abe290a
  (`pkp/ui-library#288`), all for `pkp/pkp-lib#9262`.
- Upstream: the nearest hit is a comment in `pkp/pkp-lib#12100` (a fetch
  mixin fix, 2025-12-10) noting the highlights list has no server-side
  pagination "but shows all highlights (tested with 100)", the count
  where the cap starts to cut. pkp/pkp-lib, pkp/ui-library and the three
  app repos had nothing on the fault.
- Unverified: how many journals, presses or servers hold more than 100
  highlights. MySQL not checked (the walks ran on PostgreSQL; the cap is
  a query `LIMIT`).
- The branch tips the walks and code reads used:
  - **`main`:** OJS 407246bb8e, OMP d93fcd11a, OPS 40f33453f0 (pkp-lib
    6035a6fed8, ui-library 8700ac5d).
  - **`stable-3_5_0`:** OJS d3e13caf53 (pkp-lib 40990d1523, ui-library
    228f2aa8), OMP eb4c09649 (pkp-lib c4c0aa8c52), OPS ffdd27e05c
    (pkp-lib e2c62c4b7b; ui-library 7cff1702 for both).
  - **`stable-3_4_0`** (code): pkp-lib 2dd24cc5ae, ui-library ee684b34,
    OJS 61835656a2, OMP 98db039f2, OPS d406378b01.
  - **`stable-3_3_0`** (code): pkp-lib df738d3a66, ui-library 96959f9e,
    OJS b83fb9e44d.
- The dataset was pkp/datasets 4875b1c5 (2026-11-08).
