# On a DataCite journal, a work whose supplementary galley file has a "Subject" can be neither exported nor deposited

- **Severity** medium
- **Effort** small
- **Kind** regression
- **Crash** server
- **Affects**
  - main: OJS
  - 3.5: OJS (from 3.5.0-4)
  - 3.4: none (code; keywords were still plain text)
  - 3.3: none (code; the same)
- **Introduced** `pkp/ojs#5266` (`main`) and `pkp/ojs#5073` (`stable-3_5_0`) for `pkp/pkp-lib#11557` · [07a47a4117](https://github.com/pkp/ojs/commit/07a47a41178a34431c49fce1422165249f1cf0e0) and [e4c2e79cca](https://github.com/pkp/ojs/commit/e4c2e79cca5e7c4b0bb2e9342794a2cf01edf354) · 2026-01-12 · Antti-Jussi Nygård (ajnyga); the OJS half of the change, adapting the plugins to lib/pkp's new keyword format
- **Upstream** `pkp/pkp-lib#13680` (open, for `stable-3_5_0`; no PR yet); on `main`, fix in PR `pkp/ojs#5867`, not yet in main: a PR for `pkp/pkp-lib#9170` (multilingual DataCite records) that rewrites the same lines, which #13680 names as the `main` fix
- **Tracked in** spec U45 [OJS13](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U45-dois.md#ojs13)
- **Checked** 2026-11-05, each branch's tip (the commits in Evidence)
- **Model** claude-opus-5-5

## Summary

A journal registers article and galley DOIs with DataCite. One of a
published work's galleys is a file uploaded with a supplementary article
component, such as "Data Set", and given a "Subject" on the upload
wizard's "Review Details" step (a Subject typed before the upgrade to
3.5.0-4 counts too). A Journal Manager expects "Export DOIs" and "Deposit
DOIs" to take the work as any other; instead both fail on the server.

"Export DOIs" downloads nothing and shows an "Error" window reading only
"Cannot access offset of type string on string" (on 3.5 no window opens,
so nothing seems to happen). "Deposit DOIs" shows "Items successfully
submitted for deposit" and the work's DOIs read "Submitted", but the
supplementary galley's DOI and those of the galleys listed after it are
never sent. Administration › "Failed Jobs" lists one failed job with the
same message, and nothing on the DOIs page says so. Other works deposited
in the same action are not affected.

The way round is to empty the file's "Subject" (unpublish, the galley's
"Change File", publish again), then tick the work and "Deposit DOIs" by
hand, since "Deposit All" skips "Submitted" rows. The record then leaves
the subject out.

## Impact

- **Lost**: the DataCite registration of the supplementary galley's DOI
  and of every galley listed after it on the "Galleys" tab; their rows
  read "Submitted" for good. The work's own DOI and the galleys listed
  before it are sent (read from the code). An "Export DOIs" over several
  works downloads nothing for any of them (read from the code).
- **Who**: a Journal Manager or editor on a journal that registers galley
  DOIs with DataCite, for each published work that has a supplementary
  file with a "Subject".
- **Way round**: "Unpublish" the work, the galley's row › "Change File",
  empty "Subject" on "2. Review Details", "Complete", publish again; then
  tick the work on the DOIs page and "Deposit DOIs" (by hand: "Deposit
  All" skips "Submitted" rows). The "Subject" is lost from the record.

Medium: the setup is narrow and the way round works, though the "Error"
window does not point to it. The silent "Submitted" would raise it a
level; that comes from a separate fault, rated in its own report (linked
under Cause).

## Steps to reproduce

Preconditions:

- PKP's default test dataset, OJS `main` (or `stable-3_5_0`): journal
  `publicknowledge`; submission 17, "Antimicrobial, heavy metal resistance
  and plasmid profile of coliforms isolated from nosocomial infections in
  a hospital in Isfahan, Iran", published in Vol. 1 No. 2 (2014) with one
  galley, "PDF".
- Any small file to upload.
- The DataCite settings below use made-up credentials: the failure comes
  before any connection to DataCite. The walk ran on an install that
  cannot reach DataCite or its schema, which shapes step 9's "Error"
  window and why steps 6 and 10 are needed.

Setup, as `dbarnes` (Journal editor):

1. Settings › Distribution › "DOIs" › "Setup": "DOI Prefix" `10.1234`;
   under "Items with DOIs" tick "Article galleys, such as a published PDF"
   ("Articles" stays ticked). "Save".
2. Settings › Website › "Plugins": tick "DataCite Manager Plugin".
3. "DOIs" › "Registration": "Registration Agency" "DataCite";
   "Username (symbol)" `hkq05a.user`, "Password" `hkq05a-pass`; tick "Use
   the DataCite test system for DOI registration…"; "Test Username"
   `hkq05a.test`, "Test Password" `hkq05a-testpass`, "Test DOI Prefix"
   `10.5072`. "Save".

A supplementary galley with a subject:

4. Open submission 17, Publication › "Title & Abstract" [3.5: the
   "Publication" tab], "Unpublish", and confirm "Unpublish".
5. Publication › "Galleys": "Add galley", "Galley Label" `Data`, "Save".
   In "Upload a File Ready for Publication" choose "Data Set" as the
   article component, upload the file, "Continue". On "2. Review Details"
   type `hkq05a dataset subject` in "Subject". "Continue", "Complete".
6. "Order": drag "Data" above "PDF", "Save Order". [Needed: the deposit
   sends the galleys in this order. With "PDF" first, an install that
   cannot reach DataCite ends the job at "PDF" with a connection error,
   and one that can gets "PDF" refused (made-up credentials, "Error") and
   then fails at "Data" (code).]
7. "Publish". On "Review Publishing Details" press "Confirm" [3.5: no such
   panel], then "Publish" in the "Schedule For Publication" window.

Export:

8. "DOIs" in the side menu, "Articles" tab: tick submission 17, "Bulk
   Actions" › "Assign DOIs", confirm "Assign DOIs".
9. Tick submission 17 again, "Bulk Actions" › "Export DOIs", confirm
   "Export DOIs".

Deposit:

10. "DOIs" › "Setup": untick "Articles", "Save". [Needed for the same
    reason: with "Articles" ticked the work's own record is sent first,
    and an install that cannot reach DataCite ends the job there.]
11. "DOIs": tick submission 17, "Bulk Actions" › "Deposit DOIs", confirm
    "Deposit DOIs". Reload the page a few times (the queued deposit runs
    on the next requests).
12. Expand submission 17's row.
13. Sign in as `admin`: Administration › "Failed Jobs", and the new row's
    "Details".

**Expected**: step 9 downloads the DataCite file, the "Data" galley's
record carrying `<subject>hkq05a dataset subject</subject>` (an install
that cannot fetch DataCite's schema shows the "Error" window naming the
schema instead, as for any work). Step 11 sends both galley records to
DataCite; on an install that cannot reach DataCite, the job fails at
the first call to DataCite with a connection error.

**Observed** (PHP 8.3): step 9 downloads nothing. On `main` the "Error"
window reads only:

```
Cannot access offset of type string on string
```

with "OK" (3.5: no window). The request answers:

```
POST /index.php/publicknowledge/api/v1/dois/submissions/export
500 {"error":"Cannot access offset of type string on string"}
```

and the server log has

```
production.ERROR: Cannot access offset of type string on string {"exception":"[object] (TypeError(code: 0): Cannot access offset of type string on string at …/plugins/generic/datacite/filter/DataciteXmlFilter.php:220)
```

(`:208` on 3.5). Step 11 shows "Items successfully submitted for
deposit". In step 12 the "Data" and "PDF" rows read "Submitted" [3.5: the
rows show no status; the work's badge reads "Submitted"], and stay so.
In step 13 "Failed Jobs" lists one job, and its "Exception" begins
`"message": "Cannot access offset of type string on string"`, `"line": 220`
(3.5: `208`) in `DataciteXmlFilter.php`: the job ended while building
the "Data" record, before any call to DataCite, so neither galley was
sent.

Control: with "Articles" ticked again, unpublish, the "Data" row › "Change
File", upload a file, empty "Subject" on "2. Review Details", "Complete",
publish, then "Export DOIs": the export goes on to DataCite's schema
check, and the test install's "Error" window names the schema, as for any
work.

## Cause

`DataciteXmlFilter::process()`
(`plugins/generic/datacite/filter/DataciteXmlFilter.php`, line 220 on
`main`, 208 on `stable-3_5_0`) builds a record's `<subjects>` from one of
two sources. A supplementary galley's file gives its "Subject":
`(array) $this->getPrimaryTranslation($galleyFile->getData('subject'), …)`.
Every other record takes the publication's keywords and subjects. Then,
for both, it runs:

```php
$subjects = array_map(static fn ($s) => $s['name'], $subjects);
```

lib/pkp's half of `pkp/pkp-lib#11557`
([32317b87cf](https://github.com/pkp/pkp-lib/commit/32317b87cffa2d4b17d8550c7b1ecb71aa94ee03)
on `main`,
[51e256b560](https://github.com/pkp/pkp-lib/commit/51e256b5608cb5c03b125465e90e986f02252c26)
on 3.5) made a publication's keywords and subjects vocabulary entries
(`['name' => …, …]`). The OJS commit adapted the plugins to that and
added this mapping, which fits the entries. A file's `subject` is still
a multilingual string (lib/pkp `schemas/submissionFile.json`), so the
cast gives `['hkq05a dataset subject']`, and `$s['name']` on that string
throws `TypeError`.

Reach:

- "Export DOIs" (`DataciteExportPlugin::exportAsDownload()`) and every
  deposit (`exportAndDeposit()`, run by the `DepositSubmission` job):
  "Deposit DOIs" (walked), "Deposit All" and "Automatic Deposit" (the
  same job, read in the code).
- A deposit is one `DepositSubmission` job per work, from "Deposit DOIs"
  (`PKPDoiController::depositSubmissions()`) and "Deposit All"
  (`Repository::depositAll()`) alike, so other works are not held up.
  Within the job, `exportAndDeposit()` builds and sends one item at a
  time: the work (when "Articles" is a DOI kind), then the current
  version's galleys in their order.
- "Export DOIs" puts every ticked work's items into one file, so one such
  work stops the whole export.
- The DOIs stay "Submitted" because the deposit jobs have no failure
  handler: the U45 A18 report,
  [U45-A18-deposit-unreachable-agency-stays-submitted.md](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/issues/U45-A18-deposit-unreachable-agency-stays-submitted.md).
- The work's record and a PDF galley's still take the keyword names
  (walked, and read in the code). An issue's record has no subjects.
- No other code reads a file's subject together with the new keyword
  format:
  a search of OJS, its plugins and lib/pkp for `getData('subject')` and
  `['name']` mappings finds only this line. OMP and OPS ship no DataCite
  plugin.
- No stored data is wrong: the file's subject is saved as typed, and one
  typed before 3.5.0-4 has the same form.

## Proposed fix

Take the names inside the keyword branch, where the entries are, and use
the file's subject as it is. This is what bozana proposed on
`pkp/pkp-lib#13680`. The same diff applies to `main` and to
`stable-3_5_0`:
[fix.diff](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/datacite-file-subject-export-fails/fix.diff).

```diff
         } elseif (!empty($article) && !empty($publication)) {
-            $subjects = array_merge(
+            // Keywords and subjects are vocabulary entries (['name' => …, …]); a file's subject is plain text.
+            $subjects = array_map(static fn ($s) => $s['name'], array_merge(
                 (array) $this->getPrimaryTranslation($publication->getData('keywords'), $objectLocalePrecedence),
                 (array) $this->getPrimaryTranslation($publication->getData('subjects'), $objectLocalePrecedence)
-            );
+            ));
         }
         if (!empty($subjects)) {
-            $subjects = array_map(static fn ($s) => $s['name'], $subjects);
-
```

Tried on `main`: with it, the walk's "Export DOIs" goes on to DataCite's
schema check (the test install's schema "Error" window), the "Data" record built
by the plugin's own export carries `hkq05a dataset subject`, and the
deposit job gets past the record to the call to DataCite. Submission 1's
work and PDF records keep their keywords ("Professional Development",
"Social Transformation") the same with the fix in and out.

- **Alternatives**: `pkp/ojs#5867` rewrites the block as a loop per
  language for `pkp/pkp-lib#9170` and also fixes this. It is the `main`
  fix if it merges first, but it brings in the multilingual export, which
  3.5 does not get. A guard (`is_array($s) ? $s['name'] : $s`) would also
  work, but it hides which data has which shape.
- **What goes with it**: DOIs that an earlier deposit left "Submitted"
  need "Deposit DOIs" again by hand. The test:
  `plugins/generic/datacite/tests/DataciteXmlFilterTest.php` (on `main`
  only) mocks the filter and calls one `create…Node()` method, but the
  subjects block sits inside `process()`, which reads the repositories,
  the genre and the plugin's settings. So the unit test needs the block
  moved into its own method, such as a `createSubjectsNode()` taking the
  document, the galley file, its genre, the article, the publication and
  the locale precedence (a move with no change in behaviour, not part of
  the tried diff), or a DB-backed test of `process()`.

Small: the fix and the method move stay in one filter, and the test
follows the file's existing pattern.

## Evidence

- Kept script:
  [walk.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/datacite-file-subject-export-fails/walk.js)
  (its step ids 1–13 are the Steps, 14–15 the control; `WALK=nb` runs
  the check on submission 1, which has keywords and no supplementary
  file, with the fix in and out), with
  [lib.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/datacite-file-subject-export-fails/lib.js)
  and
  [read.php](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/datacite-file-subject-export-fails/read.php),
  which builds the same DataCite records with the plugin's `exportXML()`
  (validation off) after each export and prints each record's subjects or
  the exception. The test installs reach no outside host, so no export
  downloads there.
- Tips: OJS `main` `9552aa521a` (lib/pkp `25fdc98a3e`); OJS
  `stable-3_5_0` `e725cc873a` (lib/pkp `e2c62c4b7b`); OJS
  `upstream/stable-3_4_0` `8bd9e6f9a0`, `upstream/stable-3_3_0`
  `2f766afdb1`. pkp/datasets `7421d2a8` (2026-11-04), the `pgsql` dumps
  of `main` and `stable-3_5_0`, on PostgreSQL. The fault does not depend
  on the database.
- Walked: `main` (Steps, then the fix trial and the neighbour with the
  fix in and out) and 3.5 (Steps), each on a freshly loaded dataset. The fix was not
  walked on 3.5. `patch --dry-run` applies it there unchanged (offset −12
  lines), and the code it changes is the same.
- Introduced: `git blame` on line 220 (committed by asmecher
  2026-01-15); `git log -S` puts the 3.5 twin in the tags 3.5.0-4 and
  3.5.0-5. `pkp/ojs#5266`
  (`main`) and `pkp/ojs#5073` (`stable-3_5_0`) were closed with "Merged
  manually". Of the later commits to the filter (13 on `main`), none
  changes the line.
- 3.4 and 3.3 (code): `upstream/stable-3_4_0`
  `plugins/generic/datacite/filter/DataciteXmlFilter.php` and
  `upstream/stable-3_3_0`
  `plugins/importexport/datacite/filter/DataciteXmlFilter.inc.php` have
  no mapping and write each subject as a string. 3.4's
  `SubmissionKeywordDAO::getKeywords()` (lib/pkp `origin/stable-3_4_0`)
  returns plain strings, and no `11557` commit is on either branch.
- Upstream search 2026-11-05 (pkp/pkp-lib, pkp/ojs, pkp/ui-library: the
  error text, "datacite supplementary subject", `DataciteXmlFilter`):
  `pkp/pkp-lib#13680` was opened by bozana on 2026-11-03; `pkp/ojs#5867`
  was read at head `57eb645396`.
- The way round: its export was walked (the control); its deposit, and
  "Deposit All" and "Automatic Deposit", were read in the code.
- Seen beside it and not part of this report: each build of a supplementary galley's record logs two PHP
  warnings "Undefined variable $resourceType" from
  `createResourceTypeNode()`. The record's `resourceType` still comes out
  `Dataset`.
