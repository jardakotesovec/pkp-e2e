# From the command line, a press's Native XML import fails on any book with a publication format, and so does the export once the ONIX details are filled

- **Severity** medium
- **Effort** small
- **Kind** defect
- **Crash** server
- **Affects**
  - main: OMP
  - 3.5: OMP
  - 3.4: OMP (code)
  - 3.3: OMP (code; the export only)
- **Introduced** for the import, `pkp/pkp-lib#8220` for `pkp/pkp-lib#6610` · [df67f41f77](https://github.com/pkp/pkp-lib/commit/df67f41f770f9ea12bce18973208f16fc21a21c3) · 2022-08-30, merged 2022-09-02 · Dimitris Efstathiou (defstat); the export's half is older, present since at least [abeec5bf8d](https://github.com/pkp/omp/commit/abeec5bf8d45db8c4280835d9470cc188dd57f00) (2013-11-21)
- **Upstream** `pkp/pkp-lib#12956` (open), covering the import only
- **Tracked in** spec U63 [OMP6](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U63-import-export.md#omp6)
- **Checked** 2026-10-21, each branch's tip (the commits in Evidence)
- **Model** claude-opus-5-5

## Summary

Run from the server's command line, a press's Native XML import should
do what the "Import" tab does. Instead a file with any book that has a
publication format stops with "The process failed. Check below for
errors/warnings." and a PHP type error, and nothing from the file is
imported.

The export fails the same way once the press has filled its four ONIX
details on Settings › Press › "Masthead" ("Press Publisher Name",
"Geographical Location", "Publisher Code Type", "Publisher Code"): from
then on, the command-line export of any book with a publication format
writes no file. Either way the tool ends with a success status, so a
script that runs it is not told.

The same file imports on the "Import" tab, and the same book exports on
the "Export" tab, with its formats; that is the way round, within the
upload size the server allows. One change in OMP fixes both.

## Impact

- **Lost.** The whole import or export run. The message says it failed
  but names nothing a manager can act on.
- **Who.** Whoever moves a press's books in bulk from the server: a
  migration between installs, a scheduled export, a large backlist.
  Nearly every published book has a format, so nearly every file fails
  on import. The export fails at every press that has filled its ONIX
  details, which a press sending ONIX records to distributors needs. A
  new press has them blank, and the "Export" tab asks for them ("This
  press is missing some required information for ONIX metadata used in
  this export."). How many presses have filled them is not known.
- **Way round.** The Tools page imports and exports the same files, one
  upload at a time. A file also imports from the command line once its
  publication formats are taken out, and the books then have none.

Medium: the bulk tool fails for every book with a format, but its
output says so and writes no file, and the screens do the same job.
What would raise it to high: a scheduled export that trusts the status
alone goes unwarned (one that looks for the file notices), and a press
whose files exceed the upload limit has no way round.

## Steps to reproduce

Preconditions:

- PKP's default test dataset for `main` (OMP), press `publicknowledge`.
  Book 5, "Bomb Canada and Other Unkind Remarks in the American Media",
  is published with one publication format, "PDF".
- A shell in the OMP directory of that install.

Import:

1. Run `php tools/importExport.php NativeImportExportPlugin export bomb.xml publicknowledge monograph 5`.
   It prints "The export completed successfully."; `bomb.xml` holds
   the book with its one `<publication_format>`.
2. Run `php tools/importExport.php NativeImportExportPlugin import bomb.xml publicknowledge admin`.
3. Sign in as `rvaca`, open Tools › "Native XML Plugin", choose
   `bomb.xml` under "File" on the "Import" tab and press "Import".

Export:

4. As `rvaca`, open Settings › Press › "Masthead", fill "Press
   Publisher Name" (`h21d Press`), "Geographical Location"
   (`Vancouver`), "Publisher Code Type" ("Proprietary (01)") and
   "Publisher Code" (`h21d-01`), and press "Save".
5. Run `php tools/importExport.php NativeImportExportPlugin export bomb2.xml publicknowledge monograph 5`.
6. On Tools › "Native XML Plugin" › "Export", tick "Bomb Canada …",
   press "Export Submissions" and "Download Exported File"; save it as
   `bomb-web.xml`.
7. Run `php tools/importExport.php NativeImportExportPlugin import bomb-web.xml publicknowledge admin`.

**Expected.** Step 2 prints "The import completed successfully. The
following items were imported:" and the new copy of the book, with its
"PDF" format, as step 3 does. Step 5 prints "The export completed
successfully." and writes `bomb2.xml`, whose format carries the ONIX
product, as step 6's file does. Step 7 imports the book with its format
and the format's ONIX codes.

**Observed.** Step 2 prints this and adds no book:

```
The process failed. Check below for errors/warnings.
Errors occured:
1.Generic Items
- Cannot assign null to property PKP\plugins\importexport\PKPImportExportDeployment::$_context of type PKP\context\Context
```

Step 3 reads "The import completed successfully. The following items
were imported: Submission "20" - "Bomb Canada and Other Unkind Remarks
in the American Media"", the copy with its "PDF" format.

Step 5 prints this and writes no file:

```
The process failed. Check below for errors/warnings.
Warnings encountered:
1.Submission
Errors occured:
1.Generic Items
- Cannot assign null to property PKP\plugins\importexport\PKPImportExportDeployment::$_context of type PKP\context\Context
```

Step 6 reads "The export completed successfully.", and its file's
format carries an ONIX `<Product>`. Step 7 prints the same lines as
step 2 and adds no book.

## Cause

Three of OMP's Native XML filters build an ONIX deployment for a
publication format from the press on the current request, not from the
press the import or export runs for:

- `NativeXmlPublicationFilter::parsePublicationFormat()` (OMP,
  `plugins/importexport/native/filter/NativeXmlPublicationFilter.php`,
  line 113), at every `<publication_format>` imported;
- `NativeXmlPublicationFormatFilter::_processProductNode()` (same
  folder, line 145), at every ONIX product in an imported format;
- `PublicationFormatNativeXmlFilter::createRepresentationNode()` (same
  folder, line 63), at every format exported, once the press's contact
  name and email and its `publisher`, `location`, `codeType` and
  `codeValue` are all set.

Each calls `new Onix30ExportDeployment($request->getContext(),
$request->getUser())`. On the screens the request's press is the
press, so they work. A command-line run has no press on its request:
`PKPNativeImportExportPlugin::executeCLI()` finds the press by the path
given and builds the plugin's deployment with it, which every filter
holds as `$this->getDeployment()`. So `getContext()` returns null, and
the deployment's typed property `private Context $_context` (lib/pkp
`classes/plugins/importexport/PKPImportExportDeployment.php`, line 48)
refuses it with a `TypeError`. `PKPImportExportDeployment::import()`
and `export()` catch it, roll the import back and print its message.

The request lines date from 2013, but the import's two did no harm
until df67f41f77 typed `$_context` (for `pkp/pkp-lib#6610`, a hardening
of the Native XML Plugin): `parsePublicationFormat()` never uses the
deployment it builds, and `_processProductNode()` only reads its
namespace. The export's line hands the null press to the ONIX filter,
which reads the press's ONIX settings from it, so that half failed on
the command line before the typing too.

Reach:

- The three lines above are every place an import/export filter in OJS,
  OMP, OPS or lib/pkp takes the press from the request (checked in the
  code). The ONIX 3.0 plugin's own export builds its deployment from its
  `$context` (`Onix30ExportPlugin.php`, line 199).
- The screens: unchanged by the fault (walked, steps 3 and 6).

## Proposed fix

Take the press and user from the filter's own deployment, the one the
plugin built for the run, as the same filters already do for the press
elsewhere: `createRepresentationNode()` reads
`$this->getDeployment()->getContext()` at line 52, and
`NativeXmlPublicationFilter::parseSeries()` reads
`$deployment->getContext()` at line 274. In `parsePublicationFormat()`
the ONIX deployment is never used, so it goes:
[fix.diff](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/omp-command-line-native-formats-fail/fix.diff),
three files in OMP.

```diff
 // NativeXmlPublicationFilter::parsePublicationFormat()
         $existingDeployment = $this->getDeployment();
-        $request = Application::get()->getRequest();
-
-        $onixDeployment = new Onix30ExportDeployment($request->getContext(), $request->getUser());
-        $onixDeployment->setPublication($existingDeployment->getPublication());
-        $onixDeployment->setFileDBIds($existingDeployment->getFileDBIds());
-        $onixDeployment->setAuthorDBIds($existingDeployment->getAuthorDBIds());
         $importFilter->setDeployment($existingDeployment);

 // NativeXmlPublicationFormatFilter::_processProductNode()
-        $request = Application::get()->getRequest();
-        $onixDeployment = new Onix30ExportDeployment($request->getContext(), $request->getUser());
+        $onixDeployment = new Onix30ExportDeployment($deployment->getContext(), $deployment->getUser());

 // PublicationFormatNativeXmlFilter::createRepresentationNode()
-            $request = Application::get()->getRequest();
-            $exportFilter->setDeployment(new Onix30ExportDeployment($request->getContext(), $request->getUser()));
+            $exportFilter->setDeployment(new Onix30ExportDeployment($this->getDeployment()->getContext(), $this->getDeployment()->getUser()));
```

plus the `use` line for `Onix30ExportDeployment` that
`NativeXmlPublicationFilter.php` no longer needs.

The user passed is the run's: the importing account on the command line
(`executeCLI()` sets it, line 328), the signed-in manager on the
screens, and none on a command-line export, whose deployment is built
without one (line 305). None is harmless: the ONIX 3.0 filters never
read the deployment's user (no `getUser()` under
`plugins/importexport/onix30/filter/`). `parseChapter()` keeps an
unused `$request = Application::get()->getRequest();` (line 161); it
takes no press and does no harm, and can go in the same commit.

All three lines are in OMP; the pkp-lib change that made the import's
lines fail (the typed `$_context`) is right and stays. So the import
and the export are one fix.

Tried on `main`: step 2 imports the book with its "PDF" format, step 5
writes `bomb2.xml` with the format's ONIX product, byte for byte the
file step 6 downloads, and step 7 imports the book with the format and
its ONIX codes. The screens' own path through the same three filters
(ONIX details saved, the "Export" tab's file imported on the "Import"
tab) gives the same success text and the same copy, its format with
its ONIX codes, with the fix in and out.

**Alternatives**

- Keep `parsePublicationFormat()`'s unused deployment and build it from
  `$existingDeployment` instead, as `pkp/pkp-lib#12956` proposes. It
  works, but keeps four lines that do nothing.
- Make `$_context` nullable again. It would hide the null press and move
  the failure into the ONIX filter, which needs the press.
- Make the command line's request carry the press. The filters would
  still depend on the request rather than on the run they serve, and
  every other part of the tool would start seeing a press on a request
  that has none.

**What goes with it**

- No stored data to repair; no API or hook change.
- 3.5 and 3.4 have the same three lines (3.5 `NativeXmlPublicationFilter.php`
  line 110, 3.4 line 118) and the same typed property; the diff applies
  with line offsets. 3.3 has the export's line in
  `PublicationFormatNativeXmlFilter.inc.php` (line 68).
- Upstream: `pkp/pkp-lib#12956` is open, labeled "Triage", with no
  comment, assignee or linked PR; it proposes the import half. The
  export half has no issue or PR.
- Guard: an end-to-end check that runs the command-line export and
  import of a book with a format, with the ONIX details filled; pkp-e2e
  carries this one. Neither OMP nor lib/pkp has a PHPUnit test for the
  Native XML filters, so a unit test would first need a new fixture;
  that is the team's choice and not counted here.

Small: the same change on three lines of one OMP plugin, following the
pattern the filters already use.

## Evidence

- The steps, as a Playwright script on an install loaded from PKP's
  default test dataset:
  [walk.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/omp-command-line-native-formats-fail/walk.js)
  (helpers in
  [lib.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/omp-command-line-native-formats-fail/lib.js)),
  on a freshly loaded install. It runs the command lines from the OMP
  directory with `PKP_CONFIG_FILE` set to the install's config (the
  team's `config.inc.php`), records their output and exit status, and
  reads the new submissions, their formats and the formats' ONIX codes
  (`publication_formats`, `identification_codes`) in the database. With
  the argument `nb` it takes the screens' path of the Proposed fix. The
  fix was tried 2026-10-21 on the `main` tips below, the screens' path
  run with the fix in and out. Step 7 imports step 5's file when step 5
  wrote one (with the fix: identical to step 6's download, byte for
  byte), otherwise step 6's.
- Walked 2026-10-21 on PostgreSQL, each install freshly loaded from
  pkp/datasets
  [5f247d0](https://github.com/pkp/datasets/commit/5f247d0413634a07eba844a17958beee78c52135)
  (2026-10-20), `omp/main/pgsql` and `omp/stable-3_5_0/pgsql`:
  - main: OMP 5777025bec (lib/pkp 042726ebf6).
  - stable-3_5_0: OMP cce424e5ef (lib/pkp 68512b5fda): every step as on
    `main`, the same lines; the calls at
    `NativeXmlPublicationFilter.php:110`,
    `NativeXmlPublicationFormatFilter.php:145`,
    `PublicationFormatNativeXmlFilter.php:63`, and the typed
    `$_context`.
- 3.4, by code: OMP `stable-3_4_0` at e30fa7e38c, pkp-lib 85f47442cf.
  The same three calls (`NativeXmlPublicationFilter.php:118`,
  `NativeXmlPublicationFormatFilter.php:144`,
  `PublicationFormatNativeXmlFilter.php:63`) and `private Context
  $_context` (line 47); df67f41f77 is on the branch.
- 3.3, by code: OMP `stable-3_3_0` at 8e72fc8836, pkp-lib 867ce82d8e.
  `$_context` is untyped (`var $_context`), so the import's two calls
  store no press without failing, and use the deployment for nothing
  but its namespace. The export's call
  (`PublicationFormatNativeXmlFilter.inc.php:68`) hands the request's
  press to the ONIX filter, whose `createHeaderNode()` reads
  `$context->getData('codeType')`; the command-line tool builds a page
  router with no press in its address (`CliTool.inc.php`, line 59), so
  that press is none. Not walked: whether 3.3 prints the PHP error or
  stops.
- Introduced: the request lines go back to abeec5bf8d (2013-11-21, the
  export) and 2c06909d05 (2013-12-03, the import), both Jason Nugent;
  `git log -S 'Context $_context'` on pkp-lib's
  `PKPImportExportDeployment.php` gives df67f41f77 (2022-08-30), merged
  in `pkp/pkp-lib#8220` on 2022-09-02.
- Upstream search terms: "Cannot assign null to property", command-line
  import or export with publication formats, `Onix30ExportDeployment`,
  in pkp/pkp-lib, pkp/omp and pkp/ui-library. `pkp/pkp-lib#12956` was
  reported 2026-06-26 on 3.4.
- OJS and OPS, by code on the same tips: their Native XML filters take
  the journal or server from the deployment only (no
  `$request->getContext()` in `plugins/importexport/native/` of either
  app or in lib/pkp's native filters), and they have no publication
  formats or ONIX. Their command-line export and import of a published
  article (OJS 17) and preprint (OPS 2) were walked on 2026-10-19, not
  again here.
- Not driven: 3.4 and 3.3; a press with more than one format per book
  or with chapters (the same filters, read in the code). MySQL not
  checked; nothing here depends on the database.
