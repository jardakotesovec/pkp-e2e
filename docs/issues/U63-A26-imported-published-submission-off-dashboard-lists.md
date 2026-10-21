# A published article, book or preprint imported with the Native XML Plugin is missing from the Dashboard's "Published"

- **Severity** low
- **Effort** small
- **Kind** regression
- **Affects**
  - main: OJS, OMP, OPS
  - 3.5: none
  - 3.4: none (code)
  - 3.3: none (code)
- **Introduced** `pkp/pkp-lib#12881` for `pkp/pkp-lib#12799` · [d52aa4c84b](https://github.com/pkp/pkp-lib/commit/d52aa4c84b740ec537b13141f88401e8d2e4cdc4) · 2026-06-09, merged 2026-06-29 · Erik Hanson (ewhanson)
- **Upstream** none found (2026-10-21)
- **Tracked in** spec U63 [A26](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U63-import-export.md#a26)
- **Checked** 2026-10-21, each branch's tip (the commits in Evidence)
- **Model** claude-opus-5-5

## Summary

A manager imports a published article, book or preprint with the Native
XML Plugin (Tools › "Import/Export", or the plugin's command line on the
server). The copy is published and its public page opens, but no
Dashboard list shows it: neither "Published", where the item sat on the
install it came from, nor "Active submissions", nor any other view.

The import leaves the copy in the Production stage with a published
status, and "Published" now lists only the Done stage. Every published
item imported this way is left off, for every Dashboard user.

## Impact

- **Lost**: no content: the copy is published, public and complete.
  Nobody is told that the lists leave it out.
- **Who**: managers who move published content in with the Native XML
  Plugin, and every manager and editor who then looks for it on the
  Dashboard. Each view takes submissions by status (unpublished,
  scheduled, declined) or by the Done stage, so none lists the copy.
- **Way round**: the results tab names each new number with its title,
  and the side menu's "Search submissions" box finds the copy by either,
  its row reading "Published".

Low: the import and the published copy are right, and the search box
reaches each item. A site that moves its whole back catalogue in by
import, with only the search box to reach each item, would justify
medium.

## Steps to reproduce

Preconditions:

- PKP's default test dataset for `main`, context `publicknowledge`.
  Its published submissions used here: on OJS 17, "Antimicrobial, heavy
  metal resistance and plasmid profile of coliforms isolated from
  nosocomial infections in a hospital in Isfahan, Iran"; on OMP 5,
  "Bomb Canada and Other Unkind Remarks in the American Media"; on OPS
  2, "The Facets Of Job Satisfaction: A Nine-Nation Comparative Study Of
  Construct Equivalence".

Steps:

1. Sign in as `rvaca`.
2. Go to Tools › "Import/Export" › "Native XML Plugin".
3. Open the "Export Articles" tab ("Export" on a press, "Export
   Preprints" on a preprint server).
4. Tick submission 17 (OMP 5, OPS 2).
5. Press "Export Articles" ("Export Submissions" on a press, "Export
   Preprints" on a preprint server), then "Download Exported File".
6. Open the "Import" tab, upload the downloaded file and press "Import".
   The results tab reads "The import completed successfully. The
   following items were imported:", then under "Submission" the line
   `"21" - "Antimicrobial, heavy metal resistance …"` (OMP 19, OPS 20).
7. In the side menu, press "Published".
8. Press "Active submissions".
9. In the side menu's "Search submissions" box, type `21` (OMP `19`,
   OPS `20`) and press Enter.
10. Open the copy's public page,
    `/index.php/publicknowledge/article/view/21` (OMP
    `catalog/book/19`, OPS `preprint/view/20`).

**Expected**: at step 7, "Published" lists the copy beside submission
17 (OMP 5, OPS 2), and its count goes up by one.

**Observed**: "Published" lists 17 and not the copy, its count
unchanged: "Published (2)" on OJS and OMP, "Published (17)" on OPS.
"Active submissions" does not list the copy either ("Active submissions
(17)" on OJS, "(16)" on OMP, "(1)" on OPS). "Search Results" lists it,
its row reading "Published"
("21 Karbasizaed — Antimicrobial, heavy metal resistance … Published").
Its public page opens with its title. No request fails.

A file that names no version: the same, with the file's
`version_stage`, `version_major` and `version_minor` attributes taken
off each `<publication>` element before step 6 (the schema leaves them
optional, and a file built by another tool may not write them). The
copy is imported and missing from the lists as above.

## Cause

`pkp/pkp-lib#12799` gave published submissions a stage of their own,
`WORKFLOW_STAGE_ID_DONE` (6). A submission gets there through the
`ApplyDoneWorkflowStage` listener
(`lib/pkp/classes/observers/listeners/ApplyDoneWorkflowStage.php`): on
each `PublicationPublished` or `PublicationUnpublished` event, it counts
the submission's published final versions (Version of Record; Author's
Original on OPS), and when there is one it records a `MOVE_TO_DONE`
decision. The upgrade migration `I12799_MovePublishedSubmissionsToDone`
moves the ones published before. The Dashboard's "Published" view lists
the Done stage alone (`PKP\submission\Repository`,
`DashboardView::TYPE_PUBLISHED`, `filterByStageIds([WORKFLOW_STAGE_ID_DONE])`);
every other view takes submissions by status (`STATUS_QUEUED`,
`STATUS_SCHEDULED`, `STATUS_DECLINED`).

The Native XML import never reaches the listener. The same change made
the export write a Done submission as `stage="production"`
(`SubmissionNativeXmlFilter::createSubmissionNode()`, "The DONE stage has
no native-XML path and isn't part of the export schema so use
PRODUCTION."). `NativeXmlSubmissionFilter::handleElement()`
(`lib/pkp/plugins/importexport/native/filter/`, lines 87–88) sets the
copy's stage from that attribute, and `NativeXmlPKPPublicationFilter`
stores each publication with the file's status straight through the
DAO, so no `PublicationPublished` event fires. The copy is left in
Production with a published status: a state the rest of `main` never
creates, and one no view lists.

A file may also name no version. `NativeXmlPKPPublicationFilter`
(lines 82–90) sets one only when the file has `version_stage`.
`Repo::publication()->publish()` gives an unversioned publication the
default (`Publication::DEFAULT_VERSION_STAGE`), and the 3.6 upgrade
(`I4860_MigratePublicationVersion`) gives one to every stored
publication, but the import does neither. Such a copy has no final
version at all, so the listener's rule could not count it either. A file
exported from 3.5, which writes no versions, does not get this far:
`main` refuses it at validation ("The process failed…", "The attribute
'version' is not allowed", spec U63 Rule 11).

The reach:

- The "Import" tab and the plugin's command line (`php tools/importExport.php
  NativeImportExportPlugin import …`) run the same deployment and
  filters: seen on screen on all three apps for the tab, on OJS and OPS
  for the command line. On OMP the command-line import of a book fails
  earlier, for a reason of its own (spec U63
  [OMP6](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U63-import-export.md#omp6)).
- An OJS issue file's articles go through the same filters
  (`NativeXmlIssueFilter` imports them with `native-xml=>article`):
  checked in the code only.
- OMP's "Tab Delimited Content Import Plugin" also stores a submission
  as published in Production (`CSVImportExportPlugin::executeCLI()`),
  seen in the code only. That tool stops with a fatal error before it
  gets there, which has its own report
  ([pkp-e2e#279](https://github.com/jardakotesovec/pkp-e2e/issues/279)).
- Every other way a publication gets published (the workflow's
  "Publish", an issue's "Publish Issue", the scheduled
  `PublishSubmissions` task) calls `Repo::publication()->publish()`,
  which sets the version and fires the event: checked in the code.

## Proposed fix

Apply the listener's rule to the imported submission once its
publications are in, and give a published publication the default
version when the file names none
([fix.diff](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/imported-published-submission-off-dashboard-lists/fix.diff)).
`ApplyDoneWorkflowStage` gets a public `apply()` holding what `handle()`
did:

```diff
     public function handle(PublicationPublished|PublicationUnpublished $event): void
     {
-        $submission = $event->submission;
+        $this->apply($event->submission);
+    }
 
+    public function apply(Submission $submission): void
+    {
         $publishedVoRCount = Repo::publication()->getCollector()
```

`NativeXmlSubmissionFilter::handleElement()` calls it after the child
elements are imported:

```diff
+        (new ApplyDoneWorkflowStage())->apply(Repo::submission()->get($submission->getId()));
+
         $submission = Repo::submission()->get($submission->getId());
```

`NativeXmlPKPPublicationFilter::handleElement()` versions a published
publication the way `publish()` does:

```diff
             $publication->setVersion($versionStageInfo);
+        } elseif ((int) $node->getAttribute('status') === Publication::STATUS_PUBLISHED) {
+            $publication->setVersion(Repo::submission()->getNextAvailableVersion(
+                Repo::submission()->get($submission->getId()),
+                Publication::DEFAULT_VERSION_STAGE,
+                false
+            ));
         }
```

The copy then moves to Done the way a submission published on screen
does, through a `MOVE_TO_DONE` decision recorded from Production, so a
later "Return to Workflow" reads its prior stage from that decision
(`ReturnToWorkflow::getNewStageId()`). Besides the stage, that decision
writes the history line "{editor} moved this submission to the Done
stage.", fires `DecisionAdded`, refreshes the submission's notifications
and creates the tasks the Done stage's templates name; no mail goes out
and no DOI is assigned (`AssignDOIs` acts only on a move to copyediting
or production, `SendAuthorOrcidEmail` only on an acceptance). The
decision is recorded under the manager who imports on the Tools page,
and on the command line under `resolveSystemEditorId()`'s choice: the
first editor assigned (an import assigns none), else the first manager,
else a site administrator. `apply()`'s other branch, back to the
workflow, needs a submission already in Done, which an import never
makes.

The rule stays in the one class that owns it, and the filters are
shared by the three apps, so the fix covers the "Import" tab, the
command line and OJS issue files at once. An unpublished import is left
where the file puts it, with no version added.

Tried on `main` in OJS, OMP and OPS: with the fix in, the Steps' copy,
and the copy of a file that names no version, are stored in Done with
one move-to-Done decision from Production, and "Published" lists them
("Published (3)" on OJS and OMP, "(18)" on OPS); the version-less copy
is stored with the default version stage ("VoR"; "AO" on OPS). The command-line import on OJS
and OPS does the same. As a control, an unpublished submission in
Production put through the same export and import stays in Production
with no decision, listed under "Active submissions" and not under
"Published", with the fix in and out.

**Alternatives**:

- Dispatch `PublicationPublished` for each imported published version:
  also runs the other listeners, which would mail the authors, assign
  DOIs and deposit to ORCID for content published long ago.
- Write `stage="done"` on export: needs a new stage path in
  `WorkflowStageDAO` and `pkp-native.xsd`, and files written before stay
  "production"; it misses the version-less file too.
- Set `stage_id` to 6 in the filter: no `MOVE_TO_DONE` decision, so the
  history has no entry, and "Return to Workflow" finds no prior stage
  (`ReturnToWorkflow::getNewStageId()` logs that and falls back to
  Production).

**What goes with it**:

- The OMP CSV import's fix (its own report) can call the same `apply()`
  once that tool imports again.
- No released install stores copies this way, so no upgrade repair is
  needed. A copy already imported on a `main` install stays in
  Production after the fix; unpublishing it and publishing it again
  moves it to Done.
- A test: the native import test in each app's `cypress/tests` (or a
  pkp-lib unit test of `NativeXmlSubmissionFilter`) that imports a
  published submission, with and without its version attributes, and
  expects stage 6 with one `MOVE_TO_DONE` decision.

Small: the rule and the version default already exist, and the import
only calls them.

## Evidence

- Kept script:
  [shared/playwright/checks/issues/imported-published-submission-off-dashboard-lists/walk.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/imported-published-submission-off-dashboard-lists/walk.js),
  run on PKP's default test dataset, freshly loaded before each mode, on
  all three apps: `PROBE_FEATURE=<feature> node bin/probe.js all <walk.js>`
  with `H21F_MODE` set to `walk` (the Steps, the default), `nover` (the
  file with its version attributes taken off), `nb` (the control: OJS 5,
  OMP 4, OPS 1, in Production and unpublished), `cli` (the command-line
  export and import as `admin`), `file` (a given file, here the 3.5
  export) or `title` (the search by title, read only). The fix:
  [fix.diff](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/imported-published-submission-off-dashboard-lists/fix.diff),
  three pkp-lib files, the same in the three apps.
- Read in the database on each run: without the fix, the copy stored
  with submission status 3 in stage 5, its current publication status 3
  with `version_stage` "VoR" ("AO" on OPS; empty for the version-less
  file) and no decisions; its source in stage 6. With the fix, the copy
  in stage 6 with one decision 33 (`MOVE_TO_DONE`) at stage 5, the
  version-less copy with `version_stage` "VoR" ("AO" on OPS); the
  control's copies in stage 5, status 1, no version, no decision, with
  the fix in and out.
- OMP's command-line import answered "The process failed." with "Cannot
  assign null to property
  PKP\plugins\importexport\PKPImportExportDeployment::$_context …", with
  the fix in and out (spec U63 OMP6).
- The 3.5 export of the same submission (OJS 17, OMP 5, OPS 2), imported
  on `main` on the "Import" tab, with the fix in and out: "The process
  failed. Check below for errors/warnings.", the validation lines
  starting "Element '{http://pkp.sfu.ca}publication', attribute
  'version': The attribute 'version' is not allowed." and "The attribute
  'id' is required but missing."; nothing imported.
- The search by title ("Antimicrobial, heavy metal", "Bomb Canada",
  "Facets Of Job Satisfaction") after the version-less import, fix out:
  "Search Results (2)", the source and the copy, both rows "Published".
  It ran from a scratch copy of the script's `title` mode, before that
  mode was added to the kept script.
- No mail was read: "no mail goes out" in the Proposed fix rests on the
  code (`DecisionAdded`'s listeners).
- The runs used PostgreSQL; MySQL not checked.
- Tips: `main` OJS `3109a59114` (pkp-lib `f37a174626`), OMP `5777025be`
  and OPS `f048e747b4` (pkp-lib `042726ebf6`); `stable-3_5_0` OJS
  `1e78ca0c2b`, OMP `cce424e5e`, OPS `5eca7fd603` (pkp-lib
  `68512b5fda`); `stable-3_4_0` OJS `0012bd1022`, OMP `e30fa7e38`, OPS
  `0f1e21a117` (pkp-lib `85f47442cf`); `stable-3_3_0` OJS `d7d9dd14ec`,
  OMP `8e72fc883`, OPS `c5532e2161` (pkp-lib `867ce82d8e`). The dataset
  is pkp/datasets `5f247d04` (2026-10-20).
- 3.5, on screen: the Steps gave copies 21, 19 and 20, each stored
  published in stage 5 as its source is (3.5 has no Done stage), and
  "Published" listed them: "Published (3)" on OJS and OMP, "Published
  (18)" on OPS. The code agrees: `stable-3_5_0` pkp-lib's "Published"
  view filters by `STATUS_PUBLISHED` (`classes/submission/Repository.php`,
  `DashboardView::TYPE_PUBLISHED`). The 3.5 side menu has no "Search
  submissions" box, so step 9 has no counterpart there.
- 3.4 and 3.3, code: pkp-lib `stable-3_4_0` and `stable-3_3_0` define no
  Done stage (`WorkflowStageDAO`, `PKPApplication`), and the old
  dashboard's "Archives" list takes submissions by status
  (`DashboardHandler`: `STATUS_DECLINED`, `STATUS_PUBLISHED`,
  `STATUS_SCHEDULED`), which the import sets from the file, so a
  published copy is listed there.
- Introduced: `git blame` of the export's stage mapping
  (`SubmissionNativeXmlFilter.php` lines 103–108), of the "Published"
  view's `filterByStageIds([WORKFLOW_STAGE_ID_DONE])`
  (`classes/submission/Repository.php` line 1233) and the whole of
  `ApplyDoneWorkflowStage.php` give `d52aa4c84b`; the import's stage
  lines (87–88, `52b6be8fd2`, 2025) were right until then.
- Upstream search (2026-10-21): pkp/pkp-lib, pkp/ojs, pkp/omp, pkp/ops
  and pkp/ui-library, by the symptom's words (native import, published,
  dashboard, done stage) and by `ApplyDoneWorkflowStage`,
  `NativeXmlSubmissionFilter` and `#12799`; nothing about this fault.
- Unverified: an OJS issue file's articles (code only); unpublishing and
  publishing a copy again moving it to Done (code only); the OMP
  command-line path with the fix (that import fails first, OMP6).
