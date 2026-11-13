# On MySQL and MariaDB, an issue published after "Back Issues" was ordered goes to the top of the archive

- **Severity** low
- **Effort** small
- **Kind** defect
- **Affects**
  - main: OJS
  - 3.5: OJS (code)
  - 3.4: OJS (code)
  - 3.3: OJS (code; the place is given when the issue is created, not when it is published)
- **Environment** only on MySQL 8.0 and MariaDB 10.11 (walked on both, PHP 8.3; red on PHP 8.2 too in the configurations run); not on PostgreSQL 16
- **Introduced** no PR (the commit that added issue ordering) · [ce506bccbe](https://github.com/pkp/ojs/commit/ce506bccbe6e1a2161131d82b205ae433922d5f1) · 2006-12-22 · Alec Smecher (asmecher); carried into the query builder by `pkp/pkp-lib#7129` ([88aaa6b49f](https://github.com/pkp/ojs/commit/88aaa6b49f818e53145bc0cfa5068542a7b2e1e7), 2021-07-14, Erik Hanson, ewhanson)
- **Upstream** none found (2026-11-13)
- **Tracked in** U50 [A23](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U50-issues.md#a23) · ci-triage row C-U50-1
- **Checked** 2026-11-13, each branch's tip (the commits in Evidence)
- **Model** claude-opus-5-5

## Summary

A journal manager puts "Back Issues" in an order of their own ("Order",
drag, "Done") and later publishes another issue. On an install whose
database is MySQL or MariaDB the new issue goes to the top of "Back
Issues" and of the journal's "Archives" page, above the order just
saved. On PostgreSQL it goes to the bottom. The other issues keep their
saved order on both, and two issues published after the last ordering
come in whatever order the database returns.

## Impact

- **Lost**: nothing; every issue is listed. The archive's order after
  a publication depends on the install's database, so the same steps
  give different archives.
- **Who**: OJS journals on MySQL or MariaDB that have ordered their back
  issues by hand, at each issue they publish afterwards.
- **Way round**: "Order" again and drag the new issue where it belongs.

Low: the archive stays complete and the manager can move the issue. It
would be medium if the place could not be changed.

## Steps to reproduce

Preconditions:

- OJS `main` installed on MySQL 8.0 or MariaDB 10.11, with a journal
  that has three published issues, Vol. 1 No. 1 (2024), Vol. 2 No. 1
  (2025) and Vol. 3 No. 1 (2026), and a future issue Vol. 4 No. 1
  (2027), and its manager.

Steps:

1. Sign in as the manager and open "Issues", tab "Back Issues". It lists
   Vol. 3, Vol. 2, Vol. 1.
2. Press "Order", drag "Vol. 1 No. 1 (2024)" to the top, press "Done".
   It lists Vol. 1, Vol. 3, Vol. 2.
3. Open "Future Issues" and press "Publish Issue" in Vol. 4's row;
   untick "Send an email about this to all registered users." and press
   "OK".
4. Open "Back Issues" again, and the journal's "Archives" page.

**Expected**: both read Vol. 1, Vol. 3, Vol. 2, Vol. 4: the saved order,
the new issue after it, as on PostgreSQL.

**Observed** on MySQL 8.0.46 and MariaDB 10.11.19, both lists:

```
Vol. 4 No. 1 (2027)
Vol. 1 No. 1 (2024)
Vol. 3 No. 1 (2026)
Vol. 2 No. 1 (2025)
```

## Cause

`APP\issue\DAO::resequenceCustomIssueOrders()` (OJS
`classes/issue/DAO.php`, lines 181 to 189), which `insert()`,
`update()` and `delete()` call once a journal has a custom order,
renumbers the published issues 1, 2, 3… in `orderBy('o.seq')` over
`leftJoin('custom_issue_orders as o', …)`. The issue published since the
order was saved has no row in `custom_issue_orders`, so its `o.seq` is
NULL. PostgreSQL sorts NULL after every value, MySQL and MariaDB before,
so publishing it writes it at seq 4 on PostgreSQL and seq 1 on MySQL and
MariaDB, and the archive and "Back Issues" follow the stored seq. Two
such issues have the same NULL and come out in whatever order the
database returns.

The same `ORDER BY o.seq` over the left join is in 3.5 and 3.4 (code).
3.3's `IssueDAO::resequenceCustomIssueOrders()` numbers every issue, not
only the published ones, so there the new issue takes the top when it is
created and keeps it when it is published (code). OJS `ore` has the
query too.

## Proposed fix

Order the issues with no saved place after the ordered ones, oldest
first, on every database
([fix.diff](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/sync/cfg-back-issues-order/fix.diff)):

```diff
             ->where('i.published', '=', 1)
+            // Issues published since the order was saved have no row yet: they follow the ordered
+            // ones, oldest first, on every database (MySQL and MariaDB sort NULL first).
+            ->orderByRaw('CASE WHEN o.seq IS NULL THEN 1 ELSE 0 END')
             ->orderBy('o.seq')
+            ->orderBy('i.date_published')
+            ->orderBy('i.issue_id')
             ->select('i.issue_id')
```

This keeps what PostgreSQL installs show today and settles the order of
several new issues. Tried on the `mysql` line: both lists read Vol. 1,
3, 2, 4 and the suite's issues scenario S5 passes; on PostgreSQL S5
passes with the fix in as without it.

**Alternatives**:

- Put a newly published issue at the top on every database instead
  (`CASE WHEN o.seq IS NULL THEN 0 ELSE 1 END`): what MySQL installs, the
  majority, show today, but it changes PostgreSQL installs; the team's
  call which place a new issue should take.
- Give an issue its custom-order row when it is published: a larger
  change in the publish path for the same result.

**What goes with it**: the same lines on `stable-3_5_0` and `ore`, and
on 3.4 if backported; the daily configurations run checks it (the
suite's issues S5 is red on MySQL and MariaDB until the fix lands).

Small: three lines in one query.

## Evidence

- Kept script: `shared/playwright/checks/sync/cfg-back-issues-order/walk.js`,
  on a reset install of the `mysql` line (MySQL 8.0.46, PHP 8.3) and of
  the `mariadb` line (MariaDB 10.11.19, PHP 8.3), each OJS `main`:
  `PKP_E2E_LINE=mysql PROBE_FEATURE=<feature> PROBE_AGENT=<agent> node bin/probe.js ojs shared/playwright/checks/sync/cfg-back-issues-order/walk.js`.
  It seeds the journal, its manager and the four issues through the
  campaign's seeding API (as "Create Issue" › "Save" and "Publish Issue"
  make them), then takes steps 1 to 4 on the screens. Its header says
  what "fixed" reads. On PostgreSQL (the usual test install) it reads
  Vol. 1, 3, 2, 4, the control.
- The configurations run
  [43340246182](https://github.com/jardakotesovec/pkp-e2e/actions/runs/43340246182)
  (OJS `3c99722dc8`) reds the suite's issues S5 the same way (Vol. 4
  first) on PHP 8.2 with MySQL 8.0, PHP 8.2 with MariaDB 10.11 and PHP
  8.3 with MySQL 8.0; reproduced on the `mysql` and `mariadb` lines.
- Fix tried with `PKP_E2E_LINE=mysql node bin/try-fix.js apply … fix.diff ojs`,
  then reverted; on PostgreSQL S5 with the fix in.
- Tips: main OJS 3c99722dc8; ore OJS 9dffdeb147 (code); stable-3_5_0
  OJS 53530611fe (code, `classes/issue/DAO.php` line 204);
  stable-3_4_0 OJS 61835656a2 (code, line 247); stable-3_3_0 OJS
  b83fb9e44d (code, `IssueDAO.inc.php` line 692).
- Introduced: `git log -S` on the 3.3 query gives `ce506bccbe`
  (2006-12-22), the commit that added issue ordering; `git log -L` on
  `main`'s line gives `88aaa6b49f`, the refactor that carried it into
  the query builder.
