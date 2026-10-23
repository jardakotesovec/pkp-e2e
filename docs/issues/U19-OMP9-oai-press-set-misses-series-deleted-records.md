# A press's OAI-PMH set leaves out the deleted records of unpublished books that were in a series

- **Severity** medium
- **Effort** small
- **Kind** defect
- **Affects**
  - main: OMP
  - 3.5: OMP
  - 3.4: OMP (code)
  - 3.3: OMP (code)
- **Introduced** PKP bug `*7206*` (no PR) · [f22c5e4bc1](https://github.com/pkp/omp/commit/f22c5e4bc1f27e5a47f138271f89e0ca134136d0) · 2012-03-10 · Bruno Beghelli (beghelli)
- **Upstream** `pkp/pkp-lib#13566` (closed without a fix for this fault: the issue's text names it as left out, and its fix covers another fault in the same query)
- **Tracked in** spec U19 [OMP9](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U19-oai-pmh.md#omp9)
- **Checked** 2026-10-23, each branch's tip (the commits in Evidence)
- **Model** claude-opus-5-5

## Summary

When a press unpublishes a book that is in a series, a harvester that
asks for the press's OAI-PMH set, at the press's address or the
site-wide one, is not told: the list leaves out that book's deleted
record. A book in no series, once unpublished, does get its deleted
record in the press's set.

A harvester of the press's set goes on holding the unpublished book as
published, and nothing on screen shows the gap. The fault is one
comparison in the deleted-records half of OMP's OAI list query.

## Impact

- **Lost:** a correct public record. Harvesters that collect the press
  by its set keep the unpublished book, and no one is told.
- **Who:** presses that unpublish a book in a series, where a harvester
  collects the press by the press's set. Which harvesters ask that way
  is not known to this report; one that asks for the whole repository,
  or for each series' set, gets the deleted record.
- **Way round:** none for the press. Nothing needs repairing after a
  fix: the deleted records already written name the right set, and only
  the query that reads them is wrong, so they appear once it is fixed.

Medium: a public list is silently wrong for the press's unpublished
books in a series; it would be high if most harvesters of OMP presses
asked by the press's set, which is not known.

## Steps to reproduce

Preconditions: PKP's default test dataset for OMP `main`. Its press
`publicknowledge`, "Public Knowledge Press", has two published books:
book 14, "From Bricks to Brains: The Embodied Cognitive Science of LEGO
Robots", in the series "Psychology" (path `psy`), and book 5, "Bomb
Canada and Other Unkind Remarks in the American Media", in no series.

The OAI addresses are opened signed out, as a harvester would.

1. Open `/index.php/publicknowledge/oai?verb=ListIdentifiers&metadataPrefix=oai_dc&set=publicknowledge`.
   It lists both books: `publicationFormat/2` with setSpec
   `publicknowledge` and `publicationFormat/3` with setSpec
   `publicknowledge:psy`.
2. Sign in as `dbarnes`.
3. Open book 14, "From Bricks to Brains…"
   (`/index.php/publicknowledge/en/dashboard/editorial?workflowSubmissionId=14`),
   press "Unpublish" and confirm "Unpublish".
4. Open book 5, "Bomb Canada…"
   (`/index.php/publicknowledge/en/dashboard/editorial?workflowSubmissionId=5`),
   press "Unpublish" and confirm "Unpublish".
5. Sign out and open the address of step 1 again.
6. Open `/index.php/publicknowledge/oai?verb=ListRecords&metadataPrefix=oai_dc&set=publicknowledge`.
7. Open the same two lists at the site-wide address:
   `/index.php/index/oai?verb=ListIdentifiers&metadataPrefix=oai_dc&set=publicknowledge`
   and
   `/index.php/index/oai?verb=ListRecords&metadataPrefix=oai_dc&set=publicknowledge`.

**Expected:** steps 5 to 7 list two deleted records, one per
unpublished book: `publicationFormat/2` (setSpec `publicknowledge`) and
`publicationFormat/3` (setSpec `publicknowledge:psy`).

**Observed:** steps 5 to 7 list only book 5's deleted record. Step 5
answers:

```xml
<request verb="ListIdentifiers" metadataPrefix="oai_dc" set="publicknowledge">http://…/index.php/publicknowledge/en/oai</request>
<ListIdentifiers>
	<header status="deleted">
		<identifier>oai:omp.localhost:publicationFormat/2</identifier>
		<datestamp>2026-10-23T03:16:57Z</datestamp>
		<setSpec>publicknowledge</setSpec>
	</header>
</ListIdentifiers>
```

Control: `set=publicknowledge:psy` lists book 14's deleted
`publicationFormat/3`, and the list without a set lists both deleted
records.

## Cause

`APP\oai\omp\OAIDAO::getRecordsRecordSetQuery()` builds every OMP list
from two halves joined by a union: the published formats, and the
deleted records (`data_object_tombstones`). In the published half a
press's set filters on the press's ID alone, so it takes in the books
of every series. In the deleted half it compares the stored set exactly
([classes/oai/omp/OAIDAO.php#L266-L268](https://github.com/pkp/omp/blob/178e8b34b273af0b1838932537ff634434a99c1b/classes/oai/omp/OAIDAO.php#L266-L268)):

```php
->when(isset($set), function ($query) use ($set) {
    return $query->where('dot.set_spec', '=', $set);
})
```

`PublicationFormatTombstoneManager::insertTombstoneByPublicationFormat()`,
called on "Unpublish", stores the deleted record of a book in a series
with the series' set, `{press path}:{series path}`
(`publicknowledge:psy`), and that of a book in no series with the
press's set (`publicknowledge`). The exact comparison therefore keeps
only the books in no series, although the press join of the same half
has already limited the deleted records to the press's own.

OJS fixed the same comparison in its twin in 2017:
[c39ec8385e](https://github.com/pkp/ojs/commit/c39ec8385e4640ad616016dca6471586bc393afa),
"pkp/pkp-lib#2569 OAI fix" (`pkp/ojs#1414`; the issue is titled
"deleted OAI records not displayed"), made the query also match
`{set}:%`, so a journal's set lists the deleted records of its
sections. OPS, made from OJS later, has the same match. OMP's query
kept the exact match.

Reach:

- ListRecords and ListIdentifiers with the press's set, at the press's
  address and the site-wide one (walked).
- Not affected: a series' set and the list without a set (walked), and
  GetRecord, which asks with no set (code).
- OJS and OPS: not affected (code: both match `{set}:%`).

## Proposed fix

Recommended, tried: match the press's set the way OJS and OPS do, by
the exact set or anything under it, inside one group so that the date
and identifier filters after it still apply
([fix.diff](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/oai-press-set-misses-series-deleted-records/fix.diff)):

```diff
                     ->when(isset($set), function ($query) use ($set) {
-                        return $query->where('dot.set_spec', '=', $set);
+                        return $query->where(function ($query) use ($set) {
+                            $query->where('dot.set_spec', '=', $set)
+                                ->orWhere('dot.set_spec', 'like', $set . ':%');
+                        });
                     })
```

The grouping matters: OJS and OPS have the same two conditions without
it, and there `orWhere` cancels the date limits for a section's set
([pkp-e2e's report on U19 A20](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/issues/U19-A20-oai-section-set-deleted-records-ignore-dates.md)),
whose fix groups them the same way. This is the only exact comparison
with a stored set in OMP and pkp-lib.

`_` is a one-character wildcard in `LIKE`. A press path may hold `_`
(`urlPath` allows letters, digits, `-` and `_`); a series path may too
but never a `:`, so the `{set}:%` half only ever matches under a
press's set. `%` is allowed in neither path. On `main`, 3.5 and 3.4 the
press join already keeps only the press's own deleted records, each
written with that press's path, so the wildcard changes nothing there. OJS and OPS accept the same pattern today, with
the same join in front of it.

Tried on `main`: with the fix, steps 5 to 7 list both deleted records,
each with its own setSpec. These answers were the same with and without
the fix: `set=publicknowledge:psy` lists book 14's deleted record alone,
at both addresses; `set=publicknowledge:lis`, a series with no books,
answers "No matching records in this repository"; the press's set with
`from=2030-01-01` or with `until=2020-01-01` answers "No matching
records in this repository" too.

**Alternatives**

- Drop the set comparison from the deleted half, since the press and
  series joins already select the right records on `main`, 3.5 and 3.4:
  shorter, but it parts from the OJS and OPS twins, and on 3.3 the
  comparison is the only press filter (below).
- Store the press's set on every deleted record: the series' set would
  then lose its deleted records, and each record's header would name
  the wrong set.

**What goes with it**

- Backport: the diff applies as written to `stable-3_5_0` and, with an
  offset, to `stable-3_4_0`. On `stable-3_3_0` the query is a SQL string
  (`classes/oai/omp/OAIDAO.inc.php`) whose press and series joins are
  `LEFT JOIN`s, so the set comparison is the only thing that keeps
  another press's deleted records out. There the condition becomes
  `AND (dot.set_spec = ? OR dot.set_spec LIKE ?)`, as OJS 3.3 has it,
  with the pattern escaped (`str_replace('_', '\_', $set) . ':%'`):
  unescaped, a press `a_b` would also list the deleted records of the
  series of a press `axb`.
- Guard: OMP has no test that runs this query. A DAO test with a press,
  a series and two deleted records, one in the series and one in none,
  would assert that the press's set lists both and the series' set one.

Small: one condition in one OMP class, following the OJS and OPS twins.

## Evidence

- Kept script: [shared/playwright/checks/issues/oai-press-set-misses-series-deleted-records/walk.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/oai-press-set-misses-series-deleted-records/walk.js)
  (helpers in `lib.js` beside it). It takes the Steps on a freshly
  loaded default dataset, as `dbarnes`, and reads each OAI address as a
  harvester (no session). Run on main:
  `npm run fleet-prep -- --feature issues-q23b --dataset 2 --apps omp --reset`, then
  `PROBE_FEATURE=issues-q23b PROBE_AGENT=q23b node bin/probe.js omp shared/playwright/checks/issues/oai-press-set-misses-series-deleted-records/walk.js`;
  on 3.5 the same with `PKP_E2E_LINE=stable-3_5_0` in front and the
  feature `issues-q23b-3_5`. `WALK_MODE=nb` takes the unchanged-answer
  reads of the Proposed fix alone.
- Walked 2026-10-23 on PostgreSQL, pkp/datasets `300c68e`
  (2026-10-22): `main` OMP `178e8b34b2` (lib/pkp `1f415a07ca`) and
  `stable-3_5_0` OMP `a150eee76b` (lib/pkp `5b54f59ed7`). Both gave the
  Observed and the control, with the same identifiers and setSpecs; no
  request and no page script failed. The Observed XML is the raw answer
  of step 5 read with `curl -L` on the walked `main` install after the
  fix trial, the fix taken out again; the walk's own reads gave the same
  header.
- Code reads: OJS `main` `3cf9aa91a8`, OPS `main` `5091e916d9`
  (`classes/oai/{ojs,ops}/OAIDAO.php`). OMP `upstream/stable-3_4_0`
  `95fefd0cf0` (`classes/oai/omp/OAIDAO.php`: the same exact comparison,
  inner press and series joins) and `upstream/stable-3_3_0` `fbe408e8eb`
  (`classes/oai/omp/OAIDAO.inc.php`: `AND dot.set_spec = ?`, `LEFT JOIN`
  press and series joins). Paths: `lib/pkp/schemas/context.json`
  (`urlPath`) and `controllers/grid/settings/series/form/SeriesForm.php`
  (series path).
- Introduced, traced from `OAIDAO.php` line 267: `26edcaf78`
  (2021-06-11, `pkp/pkp-lib#6963`, the query rewritten to Laravel)
  carried over `AND dot.set_spec = ?`; `913e80287` (2012-03-24) moved it
  to the shared tombstone tables; `f22c5e4bc1` wrote it first, as
  `st.set_spec = ?`. Later commits only re-indented it.
- Upstream, searched 2026-10-23 in pkp/pkp-lib, pkp/omp and
  pkp/ui-library by symptom words and by `getRecordsRecordSetQuery` and
  `set_spec`. `pkp/pkp-lib#2569` has no text and was fixed in OJS alone;
  `pkp/pkp-lib#2033` and `#5384` are other OMP OAI faults.
- Fix trial on `main`, OMP: `node bin/try-fix.js apply shared/playwright/checks/issues/oai-press-set-misses-series-deleted-records/fix.diff omp`,
  the walk, `WALK_MODE=nb`, then `node bin/try-fix.js revert … omp` and
  `WALK_MODE=nb` again. Only the press's set answers changed (with no
  date and with `from` today, book 14's record added). The 3.3 escaped
  pattern was not tried: no 3.3 install was walked.
- MySQL not checked: the comparison is a plain `=` and `LIKE` on ASCII
  paths.
