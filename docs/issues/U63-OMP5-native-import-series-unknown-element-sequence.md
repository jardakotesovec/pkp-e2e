# A press importing an OMP Native XML export is warned "Unknown element sequence" for every book in a series

- **Severity** low
- **Effort** small
- **Kind** defect
- **Affects**
  - main: OMP
  - 3.5: OMP
  - 3.4: OMP (code)
  - 3.3: none (code; the export writes no series block)
- **Introduced** `pkp/omp#929` for `pkp/pkp-lib#6742` · [d5e4e512bf](https://github.com/pkp/omp/commit/d5e4e512bfb57dec535fd6d9f5b408c132e8990c) · 2021-02-10, merged 2021-02-11 · Dimitris Efstathiou (defstat)
- **Upstream** none found (2026-10-21)
- **Tracked in** spec U63 [OMP5](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U63-import-export.md#omp5)
- **Checked** 2026-10-21, each branch's tip (the commits in Evidence)
- **Model** claude-opus-5-5

## Summary

Importing a Native XML file exported from OMP, the press's own or
another press's, should read as a plain success. Instead the success
text is followed by "Warnings encountered:", "Publication" and one line
"Unknown element sequence" for each book that belongs to a series. The
lines name no book and nothing the manager could correct, and the
manager cannot tell them from a real warning.

The books are imported, each in its series. The same unread element
also carries the series' place in the press's list of series, so when
the import has to create a series the press lacks, that series gets
order 0 instead of the file's. One element the import does not read causes
both, and one fix clears both.

## Impact

- **Lost.** Nothing when the press already has the file's series. When
  the import creates a series, the file's order for it: the new series
  takes order 0, the default a series added on the Series page also
  gets, until a manager drags it into place.
- **Who.** A press manager importing an OMP Native XML file, on the
  Tools page or from the command line, whenever a book in the file
  belongs to a series.
- **Way round.** The manager has to know to ignore the lines, and to
  set a created series' place on the Series page.

Low: every book is imported in its series; the warning is noise, and
the order lost on a created series is one the manager sets on screen.

## Steps to reproduce

Preconditions:

- PKP's default test dataset for `main` (OMP), press `publicknowledge`.
  Book 14, "From Bricks to Brains: The Embodied Cognitive Science of
  LEGO Robots", is published and belongs to the series "Psychology".

Steps:

1. Sign in as `rvaca`.
2. Open Tools › "Native XML Plugin"
   (`/index.php/publicknowledge/en/management/importexport/plugin/NativeImportExportPlugin`).
3. Open the "Export" tab, tick "From Bricks to Brains …" and press
   "Export Submissions".
4. On the "Results" tab, press "Download Exported File".
5. Open the "Import" tab, choose the downloaded file under "File" and
   wait for the upload.
6. Press "Import".

**Expected.** The "Results" tab reads "The import completed
successfully. The following items were imported:", then "Submission"
and the new copy of the book, and no warning: the file is the press's
own export, unchanged.

**Observed.** The success text and the copy, then:

```
The import completed successfully. The following items were imported:
Submission
"19" - "From Bricks to Brains: The Embodied Cognitive Science of LEGO Robots"
Warnings encountered:
Publication
Unknown element sequence
```

The copy is in "Psychology". The downloaded file's series block is the
export's own:

```xml
<series>
  <title locale="en">Psychology</title>
  <printIssn/>
  <onlineIssn/>
  <path>psy</path>
  <sequence>0</sequence>
</series>
```

The same steps with book 5, "Bomb Canada and Other Unkind Remarks in
the American Media", which is in no series, end with the success text
alone.

## Cause

The export writes the series' own place among the press's series
(`$series->getData('sequence')`) as a `<sequence>` element inside each
book's `<series>` block:
`PublicationNativeXmlFilter::createSeriesNode()` (OMP,
`plugins/importexport/native/filter/PublicationNativeXmlFilter.php`,
line 145). The format allows it: `native.xsd` declares `sequence` in
the `ompseries` type (line 55).

The import's reader of that block,
`NativeXmlPublicationFilter::parseSeries()` (OMP,
`plugins/importexport/native/filter/NativeXmlPublicationFilter.php`,
lines 270 to 332), has a case for every other element the export
writes (`path`, `title`, `description`, `subtitle`, `printIssn`,
`onlineIssn`) but none for `sequence`. Its `default` branch (lines 312
and 313) adds the warning
`plugins.importexport.common.error.unknownElement` ("Unknown element
{$param}") against the publication. The export and this reader came in
the same change, which missed the one element on the import side.

When the press has the series, the block is only matched by its path.
When it lacks it, the import creates the series from the block (warning
"Unknown series {path}"), without the order the file gives.

Reach:

- Every import of a book in a series, on the "Import" tab (walked) and
  from the command line (`PKPNativeImportExportPlugin::executeCLI()`
  runs the same filters; read in the code).
- The other blocks OMP's import reads: the chapter reader
  (`NativeXmlChapterFilter`) has a case for every element
  `ChapterNativeXmlFilter` writes (checked in the code). OJS and OPS
  export no series block (their section is an attribute).

## Proposed fix

Read the element in `parseSeries()`, as the block's other fields are
read: [fix.diff](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/omp-native-import-series-sequence-warning/fix.diff),
one file in OMP.

```diff
                     case 'onlineIssn':
                         $series->setData('onlineIssn', $n->textContent);
                         break;
+                    case 'sequence':
+                        $series->setData('sequence', (int) $n->textContent);
+                        break;
                     default:
```

`sequence` is an integer in the section schema (lib/pkp
`schemas/section.json`), stored as `series.seq` (OMP
`classes/section/DAO.php`, line 46), so the cast follows the schema
where `native.xsd` types the element `string`. An empty `<sequence/>`
(what the export writes for a series with no order) or a non-numeric
value casts to 0. That is the right fallback: it is what the import
stores today, the column's default (`OMPMigration`, `seq` default 0)
and what a series added on the Series page gets (`SeriesForm` sets no
order). A file the export wrote holds only a number or nothing, so no
warning is needed for a bad value.

Tried on `main`: the Steps end with the success text alone, the copy in
"Psychology". A second import of book 14's file, edited by hand so its
series path is one the press lacks (`h21dseries`) and its `<sequence>`
is 7, warns "Unknown series h21dseries" only, and the new series is
stored with order 7; without the fix it warns "Unknown element
sequence" and "Unknown series h21dseries", and the order is 0. Book 5,
in no series, imports with no warning either way.

**Alternatives**

- A `case 'sequence': break;` that skips the element silences the
  warning but drops the value a created series could keep.
- Stop exporting `<sequence>`. It would break files already written
  against `native.xsd`, which declares the element, and lose the value
  for a press that imports into a site lacking the series.

**What goes with it**

- No stored data to repair, and no API or hook change.
- The diff applies to 3.5 and 3.4 with line offsets.
- Guard: an end-to-end round trip, exporting a book in a series on the
  "Export" tab, importing the file and reading the results with no
  warning; pkp-e2e carries this one. Neither OMP nor lib/pkp has a
  PHPUnit test for the Native XML filters, so a unit test would first
  need a new fixture (a deployment, a press and a series); that is the
  team's choice and not counted here.

Small: three lines in one file, guarded by the end-to-end round trip.

## Evidence

- The steps, as a Playwright script on an install loaded from PKP's
  default test dataset:
  [walk.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/omp-native-import-series-sequence-warning/walk.js)
  (helpers in
  [lib.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/omp-native-import-series-sequence-warning/lib.js)),
  on a freshly loaded install. It also reads the copy's series in the
  database (`publications.series_id`). With the argument `nb` it takes
  the edited-file import of the Proposed fix and reads the new series'
  `series.seq`. The fix was tried 2026-10-21 on the `main` tips below,
  the edited-file import run with the fix in and out.
- Walked 2026-10-21 on PostgreSQL, each install freshly loaded from
  pkp/datasets
  [5f247d0](https://github.com/pkp/datasets/commit/5f247d0413634a07eba844a17958beee78c52135)
  (2026-10-20), `omp/main/pgsql` and `omp/stable-3_5_0/pgsql`:
  - main: OMP 5777025bec (lib/pkp 042726ebf6).
  - stable-3_5_0: OMP cce424e5ef (lib/pkp 68512b5fda): the same lines;
    `parseSeries()` has no `sequence` case (its `onlineIssn` case at
    line 306), and the export writes the element
    (`PublicationNativeXmlFilter.php:135`).
- Each import of a book in a series on `main` also writes "PHP Warning:
  Undefined property: stdClass::$section_id" (OMP
  `classes/section/DAO.php`, line 71, `getByPath()`) to the server log,
  with the fix in and out. It is a separate fault (omp `4c2b5d77b`,
  `getByPath()` reading the OJS column name), not this one.
- 3.4, by code: OMP `stable-3_4_0` at e30fa7e38c. `parseSeries()` has
  no `sequence` case (`onlineIssn` at line 314, then `default`), the
  export writes the element (`PublicationNativeXmlFilter.php:135`), and
  `native.xsd` declares it (line 55); d5e4e512bf is on the branch.
- 3.3, by code: OMP `stable-3_3_0` at 8e72fc8836. The export writes a
  book's series only as its `series` and `series_position` attributes
  (`PublicationNativeXmlFilter.inc.php`, lines 55 to 60), and the import
  has no `parseSeries()`; d5e4e512bf is not on the branch.
- Introduced: `git blame` on the export's line 145 gives the PSR-12
  reformatting 01088072a8 (2021-04-20); `git log -S "'sequence'"` gives
  d5e4e512bf ("pkp/pkp-lib#6742 Extend Series import/export"), which
  added the series block, its schema and `parseSeries()` together,
  merged in `pkp/omp#929` on 2021-02-11.
- Upstream search terms: "Unknown element sequence", native import
  series warnings, `parseSeries`, in pkp/pkp-lib, pkp/omp and
  pkp/ui-library.
- Not driven: the command-line import of such a file, and a file from
  another press (the same filter and the same series block, read in the
  code); 3.4 and 3.3. MySQL not checked; nothing here
  depends on the database.
