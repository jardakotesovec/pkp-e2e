# Ordering "Back Issues" drops the current issue to the bottom on PostgreSQL; a new issue lands in a different place on each database

- **Severity** medium
- **Effort** medium
- **Kind** defect
- **Affects**
  - main: OJS
  - 3.5: OJS (code)
  - 3.4: OJS (code)
  - 3.3: OJS (code; every issue, published or not, is renumbered at each save)
- **Introduced** no PR (the commit that added issue ordering) · [ce506bccbe](https://github.com/pkp/ojs/commit/ce506bccbe6e1a2161131d82b205ae433922d5f1) · 2006-12-22 · Alec Smecher (asmecher); with no PR · [1ec7e15456](https://github.com/pkp/ojs/commit/1ec7e154563dcad0f95524f6514b464dbae8b524) · 2016-11-02 · committed as "PKP" (the OJS 3 "Order" grid, `pkp/pkp-lib#1951`)
- **Upstream** none found (2026-11-17)
- **Tracked in** U50 [A23](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U50-issues.md#a23) · ci-triage row C-U50-1
- **Checked** 2026-11-17, each branch's tip (the commits in Evidence)
- **Model** claude-opus-5-5

Update 2026-11-17: the fault reaches PostgreSQL too. When a Journal
Manager saves a first order and leaves the current issue at the top,
PostgreSQL moves that issue to the bottom of both lists as soon as
"Done" is pressed. The Cause, the Expected (one place for a new issue on
every database, which place being the team's choice), the fix (now two
files) and the labels (medium, medium) changed with it; the Environment
bullet is gone.

## Summary

A Journal Manager orders "Back Issues" by hand ("Order", drag, "Done").
An issue the order has no saved place for then lands wherever the
journal's database puts it, in "Back Issues" and on the "Archives" page
readers see:

- A current issue left at the top when "Done" is pressed gets no saved
  place. On PostgreSQL it drops to the bottom at once; on MySQL and
  MariaDB it stays at the top, and the next issue published lands below
  it.
- An issue published afterwards lands in a different place on each
  database: the bottom on PostgreSQL, the top on MySQL and MariaDB.

The manager can drag the issue back each time; nothing tells them it
moved.

## Impact

- **Lost**: the order the manager saved. On PostgreSQL the issue they
  left first, the current one, is listed last in the archive from the
  moment they save.
- **Who**: Journal Managers who order "Back Issues" by hand, at the
  first "Done" (PostgreSQL) and at each issue they publish afterwards
  (all databases); and every reader of the journal's "Archives" page,
  until the manager notices and moves the issue.
- **Way round**: "Order" again and drag the issue to its place.

Medium: the saved order is not the order the manager arranged, on every
database, but it can be put right on screen. It would be high if the
issue could not be moved back.

## Steps to reproduce

Preconditions (a new install, created on screen):

- OJS `main` freshly installed, on PostgreSQL and on MySQL 8.0 or
  MariaDB 10.11.
- A journal created by the install's administrator (Administration ›
  "Hosted Journals" › "Create Journal"); the administrator becomes its
  Journal Manager.
- Three issues, each created with Issues › "Future Issues" › "Create
  Issue" (Volume, Number 1, Year; untick "Title", which is ticked and
  otherwise refused with "Title is required for the issue.") › "Save",
  then published with its "Publish Issue", in this order: "Vol. 1 No. 1
  (2024)", "Vol. 2 No. 1 (2025)", "Vol. 3 No. 1 (2026)". Vol. 3 is now
  the current issue.
- A fourth issue created the same way and not published: "Vol. 4 No. 1
  (2027)".

A new issue, published after an order is saved:

1. Sign in as the Journal Manager and open Issues, tab "Back Issues".
   It lists Vol. 3, Vol. 2, Vol. 1.
2. Press "Order", drag "Vol. 1 No. 1 (2024)" to the top, press "Done".
3. Open "Future Issues" and press "Publish Issue" in Vol. 4's row;
   untick "Send an email about this to all registered users." and press
   "OK".
4. Open "Back Issues" again, and the journal's "Archives" page.

The current issue left at the top (on a new journal set up the same way):

1. Open "Back Issues" (Vol. 3, Vol. 2, Vol. 1), press "Order", drag
   "Vol. 2 No. 1 (2025)" below "Vol. 1 No. 1 (2024)", leaving Vol. 3 at
   the top, and press "Done".
2. Reload "Back Issues" and open "Archives".
3. Publish Vol. 4 as in step 3 above, then read both lists again.

**Expected** (in both lists): a new issue takes the same place on
every database, and the rest keep the order the manager saved (Vol. 1,
Vol. 3, Vol. 2). The current issue left at the top stays where "Done"
saved it: Vol. 3, Vol. 1, Vol. 2, and after the publication the new
issue takes that same place relative to Vol. 3, Vol. 1, Vol. 2.

Which place a new issue takes is the team's choice: no screen, help
text or document states one. The top (Vol. 4, Vol. 1, Vol. 3, Vol. 2)
is the lean: the "Order" grid treats an issue with no saved place as
first (see Cause), "Back Issues" lists the current issue first before
any order is saved, and publishing makes the new issue current. The
other reading is the bottom (Vol. 1, Vol. 3, Vol. 2, Vol. 4), what
PostgreSQL installs show today and what the e2e campaign's issues spec
currently describes.

**Observed** on PostgreSQL 18.6:

```
A new issue                   Vol. 1, Vol. 3, Vol. 2, Vol. 4
Current issue, after "Done"   Vol. 1, Vol. 2, Vol. 3
  after publishing Vol. 4     Vol. 1, Vol. 2, Vol. 3, Vol. 4
```

**Observed** on MySQL 8.0.46 (MariaDB 10.11.19 the same for a new
issue):

```
A new issue                   Vol. 4, Vol. 1, Vol. 3, Vol. 2
Current issue, after "Done"   Vol. 3, Vol. 1, Vol. 2
  after publishing Vol. 4     Vol. 3, Vol. 4, Vol. 1, Vol. 2
```

## Cause

"Back Issues" and the archive list the published issues by their saved
place, `custom_issue_orders.seq`, read over a left join
(`Collector::ORDERBY_PUBLISHED_ISSUES` and `ORDERBY_SEQUENCE`, OJS
`classes/issue/Collector.php`). Two code paths leave an issue with no
row there, and an issue with no row sorts where the database puts NULL:
first on MySQL and MariaDB, last on PostgreSQL. The SQL standard leaves
that place to the database.

"Done" saves only the places that changed.
`OrderGridItemsFeature::saveSequence()` (pkp-lib
`classes/controllers/grid/feature/OrderGridItemsFeature.php`, lines 55
to 75) calls `BackIssueGridHandler::setDataElementSequence()`, which
writes with `DAO::moveCustomIssueOrder()`, only when the new position
differs from `getDataElementSequence()`. Before any order exists, that
method gives the current issue 0 (OJS
`controllers/grid/issues/BackIssueGridHandler.php`, line 95), the first
position, so a current issue left at the top gets no row. The grid
counts on an issue without a row sorting first; PostgreSQL sorts it
last, at once, in both lists.

A newly published issue has no row either. Publishing goes
`IssueGridHandler::publishIssue()` › `Repo::issue()->updateCurrent()` ›
`edit()` › `DAO::update()`, which calls
`APP\issue\DAO::resequenceCustomIssueOrders()` (OJS
`classes/issue/DAO.php`, lines 174 to 204). It renumbers the published
issues 1, 2, 3… in `orderBy('o.seq')` (line 187), so the issues with no
row take the database's NULL place for good: the top on MySQL and
MariaDB, the bottom on PostgreSQL. Two issues without a row (the current
issue "Done" skipped, and the new one) come out in whatever order the
database returns.

Reach:

- Every save that reaches `insert()`, `update()` or `delete()`
  renumbers the order: publishing, "Issue Data" › "Save", unpublishing,
  deleting (code).
- The REST API's issue list with `orderBy=seq` reads the same places
  (code).
- Stored data: an install that met it holds the moved issue at the
  place it landed. That cannot be told apart from a place a manager
  chose, so it is left for the manager to move.

The `ORDER BY o.seq` over the left join came with `ce506bccbe` (2006),
which added issue ordering on MySQL, where an issue without a place
comes first; `pkp/pkp-lib#7129` (2021) carried it into the query
builder and limited the renumbering to published issues. The skipped
current issue came with `1ec7e15456` (2016), the OJS 3 "Order" grid
(`pkp/pkp-lib#1951`).

## Proposed fix

A proposal for the team, in two OJS files
([fix.diff](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/back-issues-new-issue-on-top-mysql/fix.diff)):

- `BackIssueGridHandler::saveSequence()`: after the grid's own save,
  call `resequenceCustomIssueOrders()`, so "Done" leaves every published
  issue with a place, the skipped current issue included.
- `DAO::resequenceCustomIssueOrders()`: sort the issues without a place
  first on every database (the top, the recommended place; see
  Expected), and among them the current issue first, then newest first,
  as "Back Issues" lists them before any order is saved.

```diff
             ->leftJoin('custom_issue_orders as o', 'o.issue_id', '=', 'i.issue_id')
+            ->leftJoin('journals as j', 'j.current_issue_id', '=', 'i.issue_id')
             ->where('i.journal_id', '=', $contextId)
 …
             ->where('i.published', '=', 1)
+            ->orderByRaw('CASE WHEN o.seq IS NULL THEN 0 ELSE 1 END')
             ->orderBy('o.seq')
+            ->orderByRaw('CASE WHEN j.current_issue_id IS NOT NULL THEN 0 ELSE 1 END')
+            ->orderByDesc('i.date_published')
+            ->orderByDesc('i.issue_id')
             ->select('i.issue_id')
```

The renumbering then decides every place, so the readers never meet an
issue without one once an order exists. The issue `Collector` already
sorts the current issue with the same
`CASE WHEN j.current_issue_id IS NOT NULL` over the same join, and
pkp-lib's
`PKP\search\engines\DatabaseEngine` handles the same database difference
in its `ORDER BY` (`COALESCE(MAX(f.seq), 999999)`, line 204).

Tried on MySQL, MariaDB and PostgreSQL: with the fix in, both lists read
Vol. 4, Vol. 1, Vol. 3, Vol. 2 for a new issue, and Vol. 3, Vol. 1, Vol.
2, then Vol. 4, Vol. 3, Vol. 1, Vol. 2 for the current issue left at
the top, on all three. An ordered journal whose Vol. 2 has its "Issue
Data" saved unchanged (every issue placed) keeps Vol. 1, Vol. 3, Vol. 2
with the fix in and out, on MySQL and PostgreSQL.

**Alternatives**:

- A new issue at the bottom instead: `THEN 1 ELSE 0` in the first
  `CASE`. It needs a `saveSequence()` change too, a slightly different
  one: there "Done" has to store the skipped current issue's place
  itself (its position in the grid) instead of leaving it to the
  renumbering, which would then put it last. With the one `CASE` line
  alone and no `saveSequence()` change, the current issue left at the
  top moves to the bottom at the next save on every database (walked on
  MySQL). Not tried.
- Make "Done" write every row in pkp-lib's `OrderGridItemsFeature`:
  that feature serves many other grids, whose stored places would all
  change.

**What goes with it**:

- The same two changes on `stable-3_5_0`, and on 3.4 if backported (the
  code is the same there); OJS's `ore` branch carries the same query.
- A new issue's place changes on PostgreSQL installs with the
  recommendation (to the top), or on MySQL and MariaDB installs with the
  alternative (to the bottom).
- A test: none covers the issue DAO in OJS's `tests/`; the e2e suite's
  issues scenario S5 checks the order after a publication, today
  expecting the bottom.
- No data repair (see Cause).

Medium: two files, and a change in where new issues land on every
install of one database or the other, which the team must choose.

## Evidence

- Kept script:
  `shared/playwright/checks/issues/back-issues-new-issue-on-top-mysql/walk.js`
  (helpers in `lib.js` beside it): `MODE=walk` takes the "new issue"
  steps, `MODE=cur` the "current issue left at the top" steps, `MODE=nb`
  the unchanged "Issue Data" save. It seeds the preconditions (a
  journal, its Journal Manager, the three published issues with Date
  Published 2024-03-01, 2025-03-01 and 2026-03-01, the unpublished Vol.
  4) through the campaign's seeding API, then takes the steps through
  the screens and records the journal's `custom_issue_orders` rows. Run
  on a reset install of each database:
  `MODE=<walk|cur|nb> PROBE_FEATURE=<feature> PROBE_AGENT=<agent> node bin/probe.js ojs shared/playwright/checks/issues/back-issues-new-issue-on-top-mysql/walk.js`
  with `PKP_E2E_LINE=mysql` or `PKP_E2E_LINE=mariadb` in front for
  those databases.
- Walked on OJS `main` with PHP 8.3: MySQL 8.0.46 and PostgreSQL 18.6
  all three modes; MariaDB 10.11.19 the new issue unfixed, and every
  mode with the fix. PHP 8.2 and PostgreSQL 16 not walked. The daily CI
  run over PHP and database combinations,
  [43340246182](https://github.com/jardakotesovec/pkp-e2e/actions/runs/43340246182)
  (OJS `3c99722dc8`), fails the suite's issues S5 the same way on PHP
  8.2 with MySQL 8.0, PHP 8.2 with MariaDB 10.11 and PHP 8.3 with MySQL
  8.0.
- Stored places read beside the walks: "Done" with Vol. 1 dragged to
  the top writes Vol. 1, 3, 2 at 0, 1, 2; "Done" with the current Vol. 3
  left at the top writes Vol. 1 at 1 and Vol. 2 at 2, and nothing for
  Vol. 3 (every database). No server error, page script error or log
  line in any walk.
- The one-line fix of the earlier report (no place last, alone) was
  walked on the current-issue steps: on MySQL both lists then read Vol.
  1, 2, 3, 4 after Vol. 4 is published; PostgreSQL unchanged.
- Fix tried with `node bin/try-fix.js apply shared/playwright/checks/issues/back-issues-new-issue-on-top-mysql/fix.diff ojs`
  (with `PKP_E2E_LINE` in front for MySQL and MariaDB), each mode on a
  reset install, then reverted.
- Tips: main OJS `925ed49f3b`, pkp-lib `3ed5d1c3b3`; stable-3_5_0 OJS
  `8e3538b5b5`, pkp-lib `ce80b77676` (code: the same query, DAO line
  204; the same `getDataElementSequence()` and `saveSequence()`);
  stable-3_4_0 OJS `61835656a2`, pkp-lib `2dd24cc5ae` (code: the same,
  DAO line 247); stable-3_3_0 OJS `b83fb9e44d`, pkp-lib `df738d3a66`
  (code: `IssueDAO::resequenceCustomIssueOrders()`, `IssueDAO.inc.php`
  line 692, `ORDER BY o.seq` over every issue of the journal, published
  or not; the grid's `getDataElementSequence()` gives the current issue
  0 and `saveSequence()` skips it the same way); `ore` OJS `85802dee53`
  (code: the same query, line 187).
- Introduced: `git blame` on DAO line 187 gives `88aaa6b49f`
  (`pkp/pkp-lib#7129`, the query builder refactor); `git log -S` on the
  3.3 query gives `ce506bccbe`, which first wrote `ORDER BY o.seq` over
  the left join. `git log -S` on `return 0;` in
  `BackIssueGridHandler` gives `1ec7e15456`; the GitHub API names no PR
  for it. The skip in `OrderGridItemsFeature` is older (`4ee6789749`,
  2012, pkp-lib) and serves every ordered grid.
- Upstream search (pkp/pkp-lib, pkp/ojs, pkp/ui-library; issues and
  PRs; the symptom's words, `resequenceCustomIssueOrders`,
  `custom_issue_orders`): `pkp/pkp-lib#2343` and `pkp/pkp-lib#2680`
  (closed, 2017) are about "Done" itself scrambling the order, and
  `pkp/pkp-lib#7590` about a PostgreSQL error on publish; none is this
  fault.
- Unverified: an issue unpublished after an ordering keeps its old row
  (the renumbering skips unpublished issues), so republished it may
  share a place with another issue; read in the code only.
