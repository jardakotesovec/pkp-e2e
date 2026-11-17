# On MySQL and MariaDB, OAI-PMH harvests by date never list an article published in no issue

- **Severity** medium
- **Effort** small
- **Kind** defect
- **Affects**
  - main: OJS (OMP and OPS have no issues in their datestamps)
  - 3.5: none (code; only articles in a published issue reach its OAI lists)
  - 3.4: none (code; the same)
  - 3.3: none (code; the same)
- **Environment** only on MySQL 8.0 and MariaDB 10.11 (walked on MySQL 8.0.46 and MariaDB 10.11.19, PHP 8.3; also red on PHP 8.2 in pkp-e2e's daily CI over the other PHP and database versions); not on PostgreSQL (walked on 18.6; green on 16 in that CI)
- **Introduced** `pkp/ojs#5039` for `pkp/pkp-lib#9295` · [1fb080776e](https://github.com/pkp/ojs/commit/1fb080776ef774c6c31e12e2450de0c29c4183c8) · 2025-08-06 · Touhidur Rahman (touhidurabir)
- **Upstream** none found (2026-11-17)
- **Tracked in** U19 [A26](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U19-oai-pmh.md#a26) · ci-triage row C-U19-1
- **Checked** 2026-11-17, each branch's tip (the commits in Evidence)
- **Model** claude-opus-5-5

Update 2026-11-17: re-verified on today's `main`. The steps are
rewritten to publish through the publish window and read the OAI
address in a browser. The proposed fix now also covers an article whose
version has no last-change date (an install upgraded through 3.2), and
the Impact gives a way round for articles already published.

## Summary

On a journal whose install runs MySQL or MariaDB, an article published
in no issue ("Don't Assign To An Issue" in the publish window) has no
OAI-PMH datestamp of its own: every answer gives it the moment of the
request, so the same record reads a new datestamp at each visit.

Every ListRecords and ListIdentifiers asked with `from` or `until`
leaves it out, even a range that covers today, while an article
published in an issue beside it is listed. A harvester that collects a
journal by date, as aggregators and indexes do after their first full
harvest, never receives such an article. The journal's "Earliest
Datestamp" also reads the moment of the request.

Only `main` has it: no released version lets an article be published
without an issue, so journals meet it from 3.6, the first release cut
from `main`, unless it is fixed before that release.

## Impact

- **Lost**: the article never reaches a harvester that harvests by
  date, so the indexes and aggregators fed by OAI-PMH miss it and its
  later changes; nobody is told. On a journal holding one such
  article, Identify's "Earliest Datestamp", which the protocol gives as
  the lower bound of all the journal's datestamps, is the moment of the
  request, so a harvester that starts its first harvest there asks
  only for records changed since that moment.
- **Who**: once 3.6 is released, every OJS journal on MySQL or MariaDB
  that publishes articles without assigning them to an issue
  (continuous publication).
- **Way round**: for an article already published, "Unpublish" and
  "Publish" again choosing "Assign To Current/Back Issue": it then keeps
  its own datestamp, the new publication's time, and dated lists hold it
  (walked). That puts it in an issue, which a journal publishing
  continuously does not want; otherwise a harvester can only fall back
  to full harvests.

Medium: the dated lists leave the articles out silently, but only those
published without an issue, and full harvests still carry them. It
would be high once most journals on these databases publish without
issues.

## Steps to reproduce

Preconditions (a new install, created on screen):

- OJS `main` freshly installed on MySQL 8.0 or MariaDB 10.11.
- A journal (Administration › "Hosted Journals" › "Create Journal") and
  a Journal Manager in it. "Enable OAI" is ticked on a new journal
  (Settings › Distribution › "Archiving").
- One issue created and published: Issues › "Future Issues" › "Create
  Issue", Volume 1, Number 1, Year 2026, "Save", then "Publish Issue".
- Two submissions sent to the production stage, titled "Nowhere
  Article" and "Issue Article".

Steps:

1. Sign in as the Journal Manager and open "Nowhere Article". On
   Publication › "Title & Abstract" press "Publish". In "Review
   Publishing Details" choose the version ("Version of Record", major),
   choose "Don't Assign To An Issue", press "Confirm", then "Publish".
2. Open "Issue Article" and publish it the same way, choosing "Assign To
   Current/Back Issue" and "Vol. 1 No. 1 (2026)".
3. In the browser open
   `/index.php/<journal>/oai?verb=ListIdentifiers&metadataPrefix=oai_dc`
   and note each record's "Datestamp". Reload a few seconds later and
   note them again.
4. Open the same address with `&from=<today>` added, then with
   `&until=<today>` instead: today's date in UTC as `YYYY-MM-DD`, the
   day granularity OAI-PMH takes. (The walk ran on a server whose clock
   is UTC, away from midnight.)
5. Open `/index.php/<journal>/oai?verb=Identify` and note "Earliest
   Datestamp".

**Expected**: each article keeps one datestamp, the time it was
published, across reads (step 3); both lists of step 4 hold both
articles; "Earliest Datestamp" is the older of the two datestamps.

**Observed** on MySQL 8.0.46 (MariaDB 10.11.19 the same): "Nowhere
Article" was published at 04:23:27 and "Issue Article" at 04:23:35. At
step 3 the first record's datestamp is the moment of each request:

```
read at 04:23:40   article/1  Datestamp 2026-11-17T04:23:40Z   article/2  Datestamp 2026-11-17T04:23:35Z
read at 04:23:43   article/1  Datestamp 2026-11-17T04:23:43Z   article/2  Datestamp 2026-11-17T04:23:35Z
```

At step 4 both lists hold `article/2` alone. At step 5, opened within
the same second as step 3's reload (the walk is scripted), "Earliest
Datestamp" is `2026-11-17T04:23:43Z`, the moment of that request.

On PostgreSQL the same steps give the expected answers: `article/1`
keeps `04:33:03Z` across reads, both dated lists hold both articles, and
"Earliest Datestamp" is `04:33:03Z`.

## Cause

`APP\oai\ojs\OAIDAO::getRecordsRecordSetQuery()` (OJS
`classes/oai/ojs/OAIDAO.php`) computes a record's datestamp as
`GREATEST(a.last_modified, i.last_modified, p.last_modified)`, the
latest change of the article, its issue and its version. The expression
appears six times, in the select and in the `from` and `until` filters
of the query for current versions and of the query for per-version
records (lines 297, 330, 337, 355, 396, 403), each over
`leftJoin('issues AS i', …)` (lines 311, 377).

For an article in no issue `i.last_modified` is NULL. PostgreSQL's
`GREATEST` skips NULL arguments; MySQL's and MariaDB's answer NULL when
any argument is NULL. The NULL then breaks three readers:

- `PKPOAIDAO::doCommonOAIFromRowOperations()` writes
  `OAIUtils::UTCDate(strtotime($this->datetimeFromDB(null)))`, that is
  `UTCDate(false)`, which takes `false` as "no timestamp" and answers
  `gmdate()`, the moment of the request. On the way `strtotime(null)`
  raises PHP's "strtotime(): Passing null to parameter #1 ($datetime)
  of type string is deprecated" (PHP 8.3) once per such row; it reaches
  the error log only where `error_reporting` includes `E_DEPRECATED`
  (none did on the walked installs);
- the `whereDate(GREATEST(…), '>=', …)` and `'<='` filters hold for no
  NULL, so `from` and `until` drop the row;
- `PKPOAIDAO::getEarliestDatestamp()` takes the first row ordered by
  `last_modified`, and MySQL and MariaDB sort NULL first.

The left join came with `1fb080776e` (`pkp/pkp-lib#9295`, continuous
publication), which lets an article be published without an issue and
keeps it in the OAI lists. Before it the query joined `issues` inner,
with `i.published = 1`, so every listed row had an issue.

The other two arguments can be NULL too, on upgraded installs only.
Today's code sets `submissions.last_modified` when an article is created,
and the 3.3 upgrade filled the empty ones (`pkp/pkp-lib#6807`). It sets
`publications.last_modified` on every write (`stampCreated()` on add
and on Native XML import, `stampModified()` on edit and publish). But the
3.2 upgrade created each publication with its submission's
`last_modified`, which could then be empty, and the 3.3 repair covered
submissions and issues, not publications.

Reach:

- ListRecords, ListIdentifiers, GetRecord and Identify all read the
  datestamp from this query (walked: ListIdentifiers and Identify;
  ListRecords listed the record; GetRecord in the code).
- An article in an issue whose version has an empty `last_modified`, as
  the 3.2 upgrade can leave it, shows the same moving datestamp and is
  left out of `from` lists on MySQL (walked on `main`, the date emptied
  in the database). 3.5, 3.4 and 3.3 carry the same expression over
  that column (code); how many upgraded installs hold such rows is not
  known.
- A journal with "DOI Versioning" on gets its records from the
  per-version query, which carries the same expression (code).
- The DRIVER plugin's `driver` set filters the same query
  (`DRIVERDAO::getDRIVERRecordsOrIdentifiers()`; code).
- OMP and OPS take one table's `last_modified` with no `GREATEST`
  (code). No other `GREATEST` or `LEAST` is in OJS's, OMP's, OPS's or
  pkp-lib's classes.
- Nothing is stored wrong: the datestamp is computed at each request.

## Proposed fix

A proposal for the team: give every argument of the `GREATEST` a
fallback to the others, in the six places of
`getRecordsRecordSetQuery()`
([fix.diff](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/oai-datestamp-no-issue-mysql/fix.diff)):

```diff
-                DB::raw('GREATEST(a.last_modified, i.last_modified, p.last_modified) AS last_modified'),
+                DB::raw('GREATEST(COALESCE(a.last_modified, p.last_modified), COALESCE(p.last_modified, a.last_modified), COALESCE(i.last_modified, a.last_modified, p.last_modified)) AS last_modified'),
```

Every verb, the per-version records and the DRIVER set read this
query, so one change covers them. `COALESCE` over left-joined columns is
how the code base already does it (OJS `classes/doi/DAO.php`:
`COALESCE(p.submission_id, gp.submission_id, dra.submission_id)`). Where
all three dates are set the result is unchanged, on every database; an
empty one now gives way to the others on MySQL and MariaDB, as
PostgreSQL's `GREATEST` already does. An issue's own later change still
counts.

Tried on MySQL, MariaDB and PostgreSQL: with the fix in, "Nowhere
Article" keeps its publish time across reads, both dated lists hold both
articles, and "Earliest Datestamp" is that article's datestamp. An
article in an issue with an empty version date keeps its own datestamp
and is listed with `from` (MySQL). A check that the fix leaves the
issue's part alone: an article in an issue whose "Issue Data" is saved
after the article was published takes the save's time as its datestamp,
with the fix in and out, on MySQL and PostgreSQL.

**Alternatives**:

- Guard only the issue's argument
  (`COALESCE(i.last_modified, a.last_modified)`): fixes the steps
  above, but leaves upgraded installs' empty version dates.
- An upgrade migration that fills empty `publications.last_modified`,
  as `pkp/pkp-lib#6807` did for submissions: needed beside the query
  change, not instead, since the issue's date is NULL by design.
- Make `UTCDate()` refuse `false`: hides the moving datestamp but leaves
  the dated lists empty.

**What goes with it**: a case in OJS `tests/classes/oai/OAIDAOTest.php`
that an article published with no issue has a `last_modified` and is
listed with `from`; pkp's CI runs those tests on MySQL and MariaDB too.
No backport is needed for the no-issue case (3.5 and older join `issues`
inner); the empty-version case reaches 3.5 and older, where the same
diff applies. OJS's `ore` branch carries the same six lines.

Small: one expression in six places in one file, and a unit test.

## Evidence

- Kept script:
  `shared/playwright/checks/issues/oai-datestamp-no-issue-mysql/walk.js`
  (helpers in `lib.js` beside it). It seeds the preconditions (a
  journal with OAI on, its Journal Manager, the published issue, two
  submissions in production) through the campaign's seeding API, then
  takes steps 1 to 5 through the screens and reads the OAI pages as the
  browser renders them:
  `PKP_E2E_LINE=mysql PROBE_FEATURE=<feature> PROBE_AGENT=<agent> node bin/probe.js ojs shared/playwright/checks/issues/oai-datestamp-no-issue-mysql/walk.js`
  (`mariadb` the same; without `PKP_E2E_LINE` on PostgreSQL). With
  `MODE=wayround` it walks the way round (an article seeded as published
  in no issue, then "Unpublish" and "Publish" into the issue on screen);
  with `MODE=nullpub`, an article in the issue whose
  `publications.last_modified` is set to NULL by SQL, the state the 3.2
  upgrade's `INSERT INTO publications … SELECT … s.last_modified`
  (`dbscripts/xml/upgrade/3.2.0_versioning.xml` on `stable-3_3_0`) leaves
  for a submission with no date; with `MODE=nb`, the issue-save check.
- The database read beside the walk: on MySQL the article in no issue
  has `submissions` and `publications` `last_modified` set, the issue's
  NULL and `GREATEST(…)` NULL; on PostgreSQL the same row's `GREATEST`
  is the article's time.
- pkp-e2e's daily CI over the other PHP and database versions, run
  [43340246182](https://github.com/jardakotesovec/pkp-e2e/actions/runs/43340246182)
  (OJS `3c99722dc8`), reds the suite's OAI-PMH S3 and S5 on PHP 8.2
  with MySQL 8.0, PHP 8.2 with MariaDB 10.11 and PHP 8.3 with MySQL 8.0.
- Tips: main OJS `925ed49f3b`, pkp-lib `3ed5d1c3b3`; stable-3_5_0 OJS
  `8e3538b5b5`, pkp-lib `ce80b77676` (code: `->join('issues AS i', …)`
  and `->where('i.published', '=', 1)`, the same `GREATEST`);
  stable-3_4_0 OJS `61835656a2` (code: the same inner join through
  `publication_settings`); stable-3_3_0 OJS `b83fb9e44d` (code:
  `JOIN issues i` with `i.published = 1`); `ore` OJS `85802dee53`
  (code: the six lines and left joins of `main`). OMP and OPS `main`:
  their `OAIDAO`s take `ms.last_modified` and `a.last_modified` (code).
  The empty-version reads: `NativeXmlPKPPublicationFilter::handleElement()`
  (`stampCreated()` on `main`, `stampModified()` on 3.5, 3.4 and 3.3),
  `PKPPublication::stampCreated()` (sets `lastModified` too),
  `I6807_SetLastModified` (3.4) and `OJSv3_3_0UpgradeMigration` (3.3:
  issues and submissions only).
- Introduced: `git blame` on the left join (line 311) gives
  `1fb080776e` (inner join to left join, `i.published = 1` dropped); its
  PR is `pkp/ojs#5039`. The `GREATEST` expression is older
  (`ed0ad3cb1d`, 2021) and was right while every argument was set;
  `4ea46f5f35` (`pkp/pkp-lib#12922`, 2026-07-27) copied it and the left
  join into the per-version query.
- Upstream search (pkp/pkp-lib, pkp/ojs, pkp/ui-library; issues and PRs):
  `pkp/pkp-lib#6807` and its duplicate `pkp/pkp-lib#6829` (closed, 3.3)
  are the same symptom from empty submission and issue dates;
  `pkp/pkp-lib#13104` (open PR) stamps `last_modified` on sub-entity
  saves and does not touch this query; `pkp/pkp-lib#13812` (open) is
  another MariaDB OAI query fault.
- Unverified: whether released installs hold publications with an
  empty `last_modified` (the empty-version case was set by SQL on
  `main`, not reached by an upgrade); 3.5 was not walked (no MySQL or
  MariaDB install of it here); GetRecord was not opened.
