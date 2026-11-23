# On a DataCite journal, a work whose supplementary galley file has a "Subject" can be neither exported nor deposited

- **Severity** high
- **Effort** small
- **Kind** regression
- **Crash** server
- **Affects**
  - main: OJS
  - 3.5: OJS (3.5.0-4 to 3.5.0-6, the latest release)
  - 3.4: none (code; keywords were plain text, like a file's "Subject")
  - 3.3: none (code; the same)
- **Introduced** `pkp/ojs#5266` (`main`) and `pkp/ojs#5073` (`stable-3_5_0`) for `pkp/pkp-lib#11557` · [07a47a4117](https://github.com/pkp/ojs/commit/07a47a41178a34431c49fce1422165249f1cf0e0) and [e4c2e79cca](https://github.com/pkp/ojs/commit/e4c2e79cca5e7c4b0bb2e9342794a2cf01edf354) · 2026-01-12 · Antti-Jussi Nygård (ajnyga); the OJS half of the change, adapting the plugins to lib/pkp's new keyword format
- **Upstream** `pkp/pkp-lib#13680` (open; fix in PR `pkp/ojs#5867`, not yet in main), covering `main` only: that PR adds multilingual DataCite records for `pkp/pkp-lib#9170` and rewrites these lines on the way; no PR for `stable-3_5_0`
- **Tracked in** spec U45 [OJS13](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U45-dois.md#ojs13)
- **Checked** 2026-11-23, each branch's tip (the commits in Evidence)
- **Model** claude-opus-5-5

Update 2026-11-23: since `pkp/pkp-lib#13591`, a deposit that cannot
reach DataCite reads "Error" and goes on to the next item, so the Steps
are shorter, but the supplementary galley's DOI still reads "Submitted"
for good on `main` and 3.5.

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
submitted for deposit", but the supplementary galley's DOI, and those of
any galleys listed after it, are never sent and read "Submitted" for
good. The work's own DOI and the galleys listed before it are sent.
Administration › "Failed Jobs" lists one failed job with the
same message, and nothing on the DOIs page says so. Other works deposited
in the same action are not affected.

The way round is to empty the file's "Subject" (unpublish, the galley's
"Change File", publish again), then tick the work and "Deposit DOIs" by
hand, since "Deposit All" skips "Submitted" rows. The record then leaves
the subject out.

## Impact

- **Lost**: the DataCite registration of the supplementary file's DOI,
  so that DOI does not resolve, and nobody is told. A fixed release does
  not send it on its own: "Deposit All" and "Automatic Deposit" pick
  only "Unregistered", "Error" and "Stale" DOIs, so a "Submitted" one
  waits for "Deposit DOIs" by hand, unless another of the work's DOIs is
  due (read from the code). An "Export DOIs" over several works
  downloads nothing for any of them (read from the code).
- **Who**: a journal that registers galley DOIs with DataCite. The
  upload wizard's "2. Review Details" offers "Subject" for a
  supplementary component (walked for "Data Set"), so one typed there is
  enough, and so is a "Subject" typed before the upgrade to 3.5.0-4.
  "Automatic Deposit" is hit too: it queues the same deposit job (read
  from the code), with nobody at the screen.
- **Way round**: empty the file's "Subject", then "Deposit DOIs" by
  hand. On a live article that costs a stretch off the journal's site
  between "Unpublish" and "Publish", a new upload of the file through
  "Change File", and the "Subject" itself, in the file and the record.

High: the deposit, which is what the journal runs DataCite for, fails
silently: the manager is told the items were submitted, the DOI is never
registered, and "Automatic Deposit" fails the same way unseen. A
"Subject" typed before the upgrade is enough to trigger it. Shown as an
error alone (the export) it would be medium, with a narrow setup and a
way round; the silence raises it a level. It stays below critical
because it reaches only works with such a file.

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
  cannot reach DataCite or its schema, which shapes step 8's "Error"
  window and the "Error" rows of steps 10 and 15.

Setup, as `dbarnes` (Journal editor):

1. Settings › Distribution › "DOIs" › "Setup": "DOI Prefix" `10.1234`;
   under "Items with DOIs" tick "Article galleys, such as a published PDF"
   ("Articles" stays ticked). "Save".
2. Settings › Website › "Plugins": tick "DataCite Manager Plugin".
3. "DOIs" › "Registration": "Registration Agency" "DataCite";
   "Username (symbol)" `u45n23h.user`, "Password" `u45n23h-pass`; tick
   "Use the DataCite test system for DOI registration…"; "Test Username"
   `u45n23h.test`, "Test Password" `u45n23h-testpass`, "Test DOI Prefix"
   `10.5072`. "Save".

A supplementary galley with a subject:

4. Open submission 17, Publication › "Title & Abstract" [3.5: the
   "Publication" tab], "Unpublish", and confirm "Unpublish".
5. Publication › "Galleys": "Add galley", "Galley Label" `Data`, "Save".
   In "Upload a File Ready for Publication" choose "Data Set" as the
   article component, upload the file, "Continue". On "2. Review Details"
   type `u45n23h dataset subject` in "Subject". "Continue", "Complete".
   The "Galleys" list reads "PDF", then "Data".
6. "Publish". On "Review Publishing Details" press "Confirm" [3.5: no such
   panel], then "Publish" in the "Schedule For Publication" window.

Export:

7. "DOIs" in the side menu, "Articles" tab: tick submission 17, "Bulk
   Actions" › "Assign DOIs", confirm "Assign DOIs".
8. Tick submission 17 again, "Bulk Actions" › "Export DOIs", confirm
   "Export DOIs".

Deposit, with jobs run at the end of page loads (the dataset's
`job_runner = On`):

9. Tick submission 17, "Bulk Actions" › "Deposit DOIs", confirm "Deposit
   DOIs". Reload the page, then again every 5 seconds or more, until
   step 11's "Failed Jobs" lists the deposit: the queued job runs at the
   end of a page load, and a failed try is retried no sooner than 5
   seconds later, three tries in all.
10. Expand submission 17's row.
11. Sign in as `admin`: Administration › "Failed Jobs", and the new row's
    "Details".

Deposit, with the job tool:

12. In `config.inc.php`, under `[queues]`, set `job_runner = Off`.
13. As `dbarnes`, "DOIs": tick submission 17, "Bulk Actions" › "Deposit
    DOIs", confirm "Deposit DOIs".
14. In the OJS directory run `php lib/pkp/tools/jobs.php run`. While
    the deposit is still queued, run it again at least 5 seconds later
    (a failed try is retried after 5 seconds, three tries in all), until
    a run prints `Failed: PKP\jobs\doi\DepositSubmission`.
15. Reload "DOIs" and expand submission 17's row; as `admin`,
    Administration › "Failed Jobs".

**Expected**: step 8 downloads the DataCite file, the "Data" galley's
record carrying `<subject>u45n23h dataset subject</subject>` (an install
that cannot fetch DataCite's schema shows the "Error" window naming the
schema instead, as for any work). Steps 9 and 13 send the work's record
and both galleys' records to DataCite; on an install that cannot reach
DataCite, all three DOIs read "Error", each with its "View Error".

**Observed** (PHP 8.3): step 8 downloads nothing. On `main` the "Error"
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

(`:208` on 3.5). Step 9 shows "Items successfully submitted for
deposit". In step 10 the row's badge reads "Error"; "Article" and "PDF"
read "Error" with "View Error" (the failed connection to
`mds.test.datacite.org`), and "Data" reads "Submitted" and stays so
[3.5: the rows show no status; the badge reads "Error"]. In step 11
"Failed Jobs" lists one job, and its "Exception" begins
`"message": "Cannot access offset of type string on string"`, `"line": 220`
(3.5: `208`) in `DataciteXmlFilter.php`: the job sent the work's and the
PDF's records, then ended while building the "Data" record.

With the job tool the same. Each run prints
`Processing: PKP\jobs\doi\DepositSubmission`, and the third also
`Failed: PKP\jobs\doi\DepositSubmission`. In step 15 "Article" and "PDF" read
"Error", "Data" reads "Submitted", and "Failed Jobs" lists a second job
with the same exception.

Control: unpublish, the "Data" row › "Change File", upload a file, empty
"Subject" on "2. Review Details", "Complete", publish, then "Export
DOIs": the export goes on to DataCite's schema check, and the test
install's "Error" window names the schema, as for any work (3.5: no
window; the request answers 400 "An XML validation error occurred and
the XML could not be exported.").

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
cast gives `['u45n23h dataset subject']`, and `$s['name']` on that string
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
  version's galleys in their order. A failed connection (walked) or the
  agency's refusal (code) is recorded on that item as "Error" and the
  loop goes on. So the items before the supplementary galley are sent
  (walked), and those after it are not (read from the code). The job is
  tried three times, 5 seconds apart (`BaseJob::$tries`, `$backoff`),
  and each try sends those earlier items again.
- "Export DOIs" puts every ticked work's items into one file, so one such
  work stops the whole export.
- The supplementary galley's DOI stays "Submitted" because nothing
  changes its status after the job fails. "Deposit DOIs"
  (`PKPDoiController::depositSubmissions()`) and "Deposit All"
  (`Repository::depositAll()`) mark the work's DOIs "Submitted" when
  they queue the job. After that only `DataciteExportPlugin::updateDepositStatus()`
  changes a DOI's status, and only for an item the job reaches.
  `DepositSubmission` has no `failed()` handler. `pkp/pkp-lib#13591` made
  `DataciteExportPlugin::depositXML()` record a failed connection as
  "Error", and names a `failed()` handler on the deposit jobs as a
  follow-up outside its fix. Jobs run at page loads and by the job tool
  behave the same (both walked).
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

Tried on `main`: with it, "Export DOIs" goes on to DataCite's schema
check (the test install's schema "Error" window), and the "Data" record,
built by `DataciteExportPlugin::exportXML()` with validation off,
carries `u45n23h dataset subject`. Both
deposits, with jobs run at page loads and with the job tool, end with
"Article", "PDF" and "Data" all reading "Error" (the failed connection)
and no failed job. Submission 1's work and PDF records keep their
keywords ("Professional Development", "Social Transformation") the same
with the fix in and out.

- **Alternatives**: `pkp/ojs#5867` rewrites the block as a loop per
  language for `pkp/pkp-lib#9170` and also fixes this. It is the `main`
  fix if it merges first, but it brings in the multilingual export, which
  3.5 does not get. A guard (`is_array($s) ? $s['name'] : $s`) would also
  work, but it hides which data has which shape.
- **What goes with it**: DOIs that an earlier deposit left "Submitted"
  need "Deposit DOIs" again by hand. A `failed()` handler on the deposit
  jobs, the follow-up `pkp/pkp-lib#13591` names, would make the next
  fault of this kind read "Error"; it is a separate change. The test:
  `plugins/generic/datacite/tests/DataciteXmlFilterTest.php` (on `main`
  only) mocks the filter and calls one `create…Node()` method, but the
  subjects block sits inside `process()`, which reads the repositories,
  the genre and the plugin's settings. So the unit test needs the block
  moved into its own method, such as a `createSubjectsNode()` taking the
  document, the galley file, its genre, the article, the publication and
  the locale precedence (a move with no change in behaviour, not part of
  the tried diff), or a DB-backed test of `process()`. Such a test
  builds the filter as the existing one does
  (`getMockBuilder()->disableOriginalConstructor()`) and stubs the
  deployment's `getNamespace()`, a genre whose `getSupplementary()` is
  true and a submission file whose `getData('subject')` is
  `['en' => '…']`; a second case gives a publication whose keywords are
  `[['name' => '…']]`. The 3.5 backport adds the test file, since
  `stable-3_5_0` has only `DataciteExportPluginTest.php` there.

Small: the fix and the method move stay in one filter, and the test
follows the file's existing pattern.

## Evidence

- Kept script:
  [walk.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/datacite-file-subject-export-fails/walk.js)
  (its step ids 1–15 are the Steps, 16–17 the control; `WALK=nb` runs
  the check on submission 1, which has keywords and no supplementary
  file, with the fix in and out), with
  [lib.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/datacite-file-subject-export-fails/lib.js)
  (`holdQueue()` writes step 12's `job_runner = Off` into the install's
  config, `runJobTool()` runs step 14's command) and
  [read.php](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/datacite-file-subject-export-fails/read.php),
  which builds the same DataCite records with the plugin's `exportXML()`
  (validation off) after each export and prints each record's subjects or
  the exception. On an install loaded from the default dataset:
  `PROBE_FEATURE=<feature> node bin/probe.js ojs shared/playwright/checks/issues/datacite-file-subject-export-fails/walk.js`
  (`PKP_E2E_LINE=stable-3_5_0` in front for 3.5). The test installs
  reach no outside host, so no export downloads there.
- Tips: OJS `main` `1e1d3fc49b` (lib/pkp `3ea73a1a7e`); OJS
  `stable-3_5_0` `7f23f05a93` (lib/pkp `9295edd4f0`); OJS
  `upstream/stable-3_4_0` `8bd9e6f9a0`, `upstream/stable-3_3_0`
  `2f766afdb1` (read 2026-11-05; the change this update covers touches
  neither). pkp/datasets `abdb5d17` (2026-11-22), the `pgsql` dumps of
  `main` and `stable-3_5_0`, on PostgreSQL. The fault does not depend on
  the database.
- Walked 2026-11-23: `main` (Steps with both runners, then the fix
  trial: the Steps and the keyword check on submission 1 with the fix
  in, that check again with it out) and 3.5 (Steps with both runners), each on a freshly loaded
  dataset. The fix was not walked on 3.5. `patch --dry-run` applies it
  there unchanged (offset −12 lines), and the code it changes is the
  same.
- `pkp/pkp-lib#13591` is OJS
  [2db1d0b008](https://github.com/pkp/ojs/commit/2db1d0b0084ce1d8d7c55682465de995661c6c33)
  (`pkp/ojs#5977`) on `main` and
  [62e09f86cb](https://github.com/pkp/ojs/commit/62e09f86cbe74b3ab932324d75292aeec76bd662)
  on `stable-3_5_0`, both 2026-11-05. Read in the code on both
  branches: `depositXML()` catches `TransferException` on both agency
  calls; `exportAndDeposit()` keeps looping after a failed item;
  `DepositSubmission` and `BaseJob` have no `failed()`.
- The job tool's deposit (steps 13–15) came after the page-load deposit
  on the same work, so the "View Error" texts it showed are those the
  first deposit stored ("Submitted" keeps a DOI's message). Whether the
  job tool stores its own is `U45 A31`'s question, not read here.
- Introduced: `git blame` on line 220 (committed by asmecher
  2026-01-15); the 3.5 twin is in the tags 3.5.0-4, 3.5.0-5 and
  3.5.0-6 (2026-10-31, the latest 3.5 release), not in 3.5.0-3
  (`git show <tag>:<path>`). `pkp/ojs#5266`
  (`main`) and `pkp/ojs#5073` (`stable-3_5_0`) were closed with "Merged
  manually". Of the later commits to the filter (13 on `main`, the last
  `e591926d11` of 2026-10-15), none changes the line.
- 3.4 and 3.3 (code): `upstream/stable-3_4_0`
  `plugins/generic/datacite/filter/DataciteXmlFilter.php` and
  `upstream/stable-3_3_0`
  `plugins/importexport/datacite/filter/DataciteXmlFilter.inc.php` have
  no mapping and write each subject as a string. 3.4's
  `SubmissionKeywordDAO::getKeywords()` (lib/pkp `origin/stable-3_4_0`)
  returns plain strings, and no `11557` commit is on either branch.
- Upstream search 2026-11-23 (pkp/pkp-lib, pkp/ojs, pkp/ui-library: the
  error text, "datacite supplementary subject", "datacite subject",
  `DataciteXmlFilter`, "DepositSubmission failed", "13680"):
  `pkp/pkp-lib#13680` (bozana, 2026-11-03) is open with no comments and
  no PR naming it; `pkp/ojs#5867` is open at the same head `57eb645396`;
  `pkp/pkp-lib#13591` is open, its fix merged.
- The way round: its export was walked (the control); its deposit, and
  "Deposit All" and "Automatic Deposit", were read in the code.
- Seen beside it and not part of this report: each build of a supplementary galley's record logs two PHP
  warnings "Undefined variable $resourceType" from
  `createResourceTypeNode()`. The record's `resourceType` still comes out
  `Dataset`.
