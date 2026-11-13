# On MySQL and MariaDB, OAI-PMH harvests by date never list an article published in no issue

- **Severity** medium
- **Effort** small
- **Kind** defect
- **Affects**
  - main: OJS (OMP and OPS read no issue into the datestamp)
  - 3.5: none (code; only articles in an issue reach its OAI lists)
  - 3.4: none (code; the same)
  - 3.3: none (code; the same)
- **Environment** only on MySQL 8.0 and MariaDB 10.11 (walked on both, PHP 8.3; red on PHP 8.2 too in the configurations run); not on PostgreSQL 16
- **Introduced** `pkp/pkp-lib#9295` · [1fb080776e](https://github.com/pkp/ojs/commit/1fb080776ef774c6c31e12e2450de0c29c4183c8) · 2025-08-06 · Touhidur Rahman (touhidurabir)
- **Upstream** none found (2026-11-13); `pkp/pkp-lib#6807` (closed, fixed in 3.3) is the same symptom from another cause, an issue whose own `last_modified` was empty
- **Tracked in** U19 [A26](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U19-oai-pmh.md#a26) · ci-triage row C-U19-1
- **Checked** 2026-11-13, each branch's tip (the commits in Evidence)
- **Model** claude-opus-5-5

## Summary

On a journal whose install runs MySQL or MariaDB, an article published
in no issue ("Don't Assign To An Issue" in the publish window) has no
OAI-PMH datestamp of its own: every answer gives it the moment of the
request. So every ListRecords and ListIdentifiers asked with `from` or
`until` leaves it out, today's date included, while an article published
in an issue beside it is listed. A harvester that collects a journal by
date, as aggregators and indexes do after their first full harvest,
never receives such an article. Identify's "Earliest Datestamp" reads the
moment of the request too. PostgreSQL installs are not affected.

## Impact

- **Lost**: the article never reaches a harvester that harvests by date
  (incremental harvesting), so indexes and aggregators fed by OAI-PMH
  miss it and its later changes; a full harvest lists it, with a
  datestamp that changes at every request.
- **Who**: every OJS journal on MySQL or MariaDB, PKP's most common
  databases, that publishes articles outside issues (continuous
  publication on `main`).
- **Way round**: none on the journal's side short of placing every
  article in an issue; a harvester can only fall back to full harvests.

Medium: the list fails silently for the articles published without an
issue, and full harvests still carry them. It would be high once
publishing without issues is how most journals publish on `main`.

## Steps to reproduce

Preconditions:

- OJS `main` installed on MySQL 8.0 or MariaDB 10.11, with a journal
  whose OAI-PMH is on ("Enable OAI" is ticked on a new journal), one
  published issue and two articles ready to publish.

Steps:

1. Sign in as the journal's manager and publish the first article: on
   its Publication tab, "Publish", choose "Don't Assign To An Issue",
   "Publish". Publish the second article into the published issue.
2. Open `/index.php/<journal>/oai?verb=ListIdentifiers&metadataPrefix=oai_dc`,
   note both datestamps, and open it again a few seconds later.
3. Open `/index.php/<journal>/oai?verb=ListIdentifiers&metadataPrefix=oai_dc&from=<today>`
   (today as `YYYY-MM-DD`), then the same with `until=<today>`.
4. Open `/index.php/<journal>/oai?verb=Identify`.

**Expected**: each article keeps one datestamp, the time it was
published, across reads (step 2); both lists of step 3 hold both
articles; "earliestDatestamp" is the older of the two datestamps.

**Observed** on MySQL 8.0.46 and MariaDB 10.11.19: at step 2 the first
article's datestamp is the moment of each request, the other keeps its
own:

```
first read  (13:41:37)  article/5  2026-11-13T13:41:37Z   article/6  2026-11-13T13:41:35Z
second read (13:41:40)  article/5  2026-11-13T13:41:40Z   article/6  2026-11-13T13:41:35Z
```

At step 3 both lists hold `article/6` alone. At step 4
"earliestDatestamp" is `2026-11-13T13:41:40Z`, the moment of the
request. On PostgreSQL the same steps give the expected answers.

## Cause

`APP\oai\ojs\OAIDAO::getRecordsRecordSetQuery()` (OJS
`classes/oai/ojs/OAIDAO.php`) writes a record's datestamp as
`GREATEST(a.last_modified, i.last_modified, p.last_modified)`, in the
select and in the `from` and `until` filters of both live-record
branches (six places, lines 297, 330, 337, 355, 396, 403), over
`leftJoin('issues AS i', …)`. For an article in no issue
`i.last_modified` is NULL. PostgreSQL's `GREATEST` skips NULL arguments;
MySQL's and MariaDB's answer NULL when any argument is NULL. Then:

- `PKPOAIDAO::doCommonOAIFromRowOperations()` writes
  `OAIUtils::UTCDate(strtotime($this->datetimeFromDB(null)))`, that is
  `UTCDate(false)`, which `UTCDate()` takes as "no timestamp" and
  answers with `gmdate()`, the moment of the request;
- `whereDate(NULL, '>=', …)` and `whereDate(NULL, '<=', …)` hold for no
  date, so `from` and `until` drop the row;
- `PKPOAIDAO::getEarliestDatestamp()` takes the first row ordered by
  `last_modified`, and MySQL and MariaDB sort NULL first.

The left join came with pkp/pkp-lib#9295 (OJS `1fb080776e`), which let
an article be published in no issue; before it the query joined `issues`
inner, so every listed article had an issue. 3.5, 3.4 and 3.3 still join
inner (code), and OMP's and OPS's datestamps read no issue. OJS `ore`
carries the same query (`9dffdeb147`).

## Proposed fix

Give the issue's part the article's own date when there is no issue, in
the six places
([fix.diff](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/sync/cfg-oai-datestamp-no-issue/fix.diff)):

```diff
-                DB::raw('GREATEST(a.last_modified, i.last_modified, p.last_modified) AS last_modified'),
+                DB::raw('GREATEST(a.last_modified, COALESCE(i.last_modified, a.last_modified), p.last_modified) AS last_modified'),
```

`COALESCE` with the article's own `last_modified` leaves the result
unchanged wherever there is an issue and on PostgreSQL, and gives MySQL
and MariaDB what PostgreSQL already answers. Tried on the `mysql` line:
the datestamp holds across reads, both dated lists hold both articles,
"earliestDatestamp" is the older record's, and the suite's OAI-PMH
scenarios S3 and S5 pass; on PostgreSQL they pass with the fix in as
without it.

**Alternatives**:

- Replace `GREATEST` with a `CASE` per database: more code for the same
  answer.
- Make `UTCDate()` refuse `false`: hides the wrong datestamp but leaves
  the dated lists empty.

**What goes with it**: the same six lines on `ore`, where the query is
the same; a check on MySQL or MariaDB, which the daily configurations
run already gives (the suite's OAI-PMH S3 and S5 are red there until the
fix lands).

Small: one expression in six places in one file.

## Evidence

- Kept script:
  `shared/playwright/checks/sync/cfg-oai-datestamp-no-issue/walk.js`,
  on a reset install of the `mysql` line (MySQL 8.0.46, PHP 8.3) and of
  the `mariadb` line (MariaDB 10.11.19, PHP 8.3), each OJS `main`:
  `PKP_E2E_LINE=mysql PROBE_FEATURE=<feature> PROBE_AGENT=<agent> node bin/probe.js ojs shared/playwright/checks/sync/cfg-oai-datestamp-no-issue/walk.js`.
  It builds the journal, its issue and the two published articles
  through the campaign's seeding API (the state the publish window
  leaves: `issue_id` NULL on the first article's publication), then
  reads the OAI address over plain HTTP as steps 2 to 4 do. Its header
  says what "fixed" reads. The same walk on PostgreSQL (the usual test
  install) is the control: every read holds there.
- The configurations run
  [43340246182](https://github.com/jardakotesovec/pkp-e2e/actions/runs/43340246182)
  (OJS `3c99722dc8`) reds the suite's OAI-PMH S3 ("Earliest Datestamp"
  later than the older record) and S5 (`from` today lists nothing) on
  PHP 8.2 with MySQL 8.0, PHP 8.2 with MariaDB 10.11 and PHP 8.3 with
  MySQL 8.0; both reproduced on the `mysql` and `mariadb` lines.
- Fix tried with `PKP_E2E_LINE=mysql node bin/try-fix.js apply … fix.diff ojs`,
  the walk and S3 and S5 run with it in, then reverted; on PostgreSQL
  S3 and S5 with the fix in.
- Tips: main OJS 3c99722dc8, pkp-lib ad75b174f0; ore OJS 9dffdeb147;
  stable-3_5_0 OJS 53530611fe (code); stable-3_4_0 OJS 61835656a2 and
  stable-3_3_0 OJS b83fb9e44d (code: `join('issues AS i', …)` and
  `JOIN issues i` in their OAI DAOs). OMP and OPS `main`: no issues, and
  their OAI DAOs take one table's `last_modified` with no `GREATEST`
  (code).
- Introduced: `git log -L` on the join line gives `1fb080776e`
  (inner join to left join); the `GREATEST` expression is older.
