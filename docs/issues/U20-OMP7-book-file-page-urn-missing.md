# A press's book file view page never names the URN assigned to the file in its Dublin Core tags

- **Severity** low
- **Effort** small
- **Kind** defect
- **Affects**
  - main: OMP
  - 3.5: OMP
  - 3.4: OMP (code)
  - 3.3: OMP (code)
- **Introduced** `pkp/omp#395` for `pkp/pkp-lib#1815` · [749f84f7db](https://github.com/pkp/omp/commit/749f84f7dbdeece4733ebf4ee58ebb406a2c6203) · 2017-02-27 · Alec Smecher (asmecher)
- **Upstream** none found (2026-10-21)
- **Tracked in** spec U20 [OMP7](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U20-search-engine-metadata-and-analytics.md#omp7)
- **Checked** 2026-10-21, each branch's tip (the commits in Evidence)
- **Model** claude-opus-5-5

## Summary

A press can give each book file its own URN: with the URN plugin's
"Files" option ticked, an editor assigns it on the "Identifiers" tab of
the file's edit window. The press expects the file's view page (the
public page that opens when a reader clicks a PDF or HTML file's link on
the book's or a chapter's page) to name that URN in a
"DC.Identifier.URN" tag, as the book's and a chapter's pages name
theirs.

The view page carries no URN tag at all, for a file of the whole book
and for a chapter's file alike. Readers see nothing wrong, and the press
is not told.

## Impact

- **Lost**: the file's URN on the one public page that describes the
  file. No other public output names it either: the book's page lists
  the formats' URNs, and the press's OAI-PMH records give the format's
  and the book's, not the file's. Only the press's own Native XML
  export carries it.
- **Who**: presses that run the URN plugin with "Files" ticked and
  assign URNs to files, on every file view page.
- **Way round**: none on screen.

Low: one tag missing from tags only search indexes read, in a setup few
presses use, and no harvester is known to read file URNs from these
pages (the URN registries' harvesters read OAI-PMH or a deposit). It
would be medium if one did.

## Steps to reproduce

Preconditions:

- PKP's default test dataset for `main`, OMP (`publicknowledge`, "Public
  Knowledge Press"). The "URN" plugin is off; "PDF.js PDF Viewer" and
  "Dublin Core Indexing Plugin" are on.
- Book 14, "From Bricks to Brains: The Embodied Cognitive Science of
  LEGO Robots", is published. Its one format, "PDF", holds two files for
  the whole book ("The Canadian Nutrient File: Nutrient Val.pdf",
  "Segmentation of Vascular Ultrasound Imag.pdf") and one file per
  chapter ("chapter1.pdf" … "chapter4.pdf"). Chapter 1, "Chapter 1: Mind
  Control—Internal or External?", has its own page.

Setting up URNs:

1. Sign in as `dbarnes`.
2. Open Settings › Website › "Plugins". Under "Public Identifier
   Plugins", tick "Enabled" on the "URN" row.
3. Click the "URN" row's arrow, then "Settings". Under "Press Content"
   tick "Monographs", "Chapters" and "Files". Fill "URN Prefix" with
   `urn:nbn:de:0000-`, leave "Use default patterns." chosen, choose
   `urn:nbn:de` as "Namespace", fill "Resolver URL" with
   `https://nbn-resolving.de/`, and click "Save".
4. Open book 14 › Publication › "Chapters". Click "Chapter 1: Mind
   Control—Internal or External?" and open the "Identifiers" tab. It
   previews `urn:nbn:de:0000-jpk.14.c54` above the box "Assign the URN
   to this chapter", which is ticked already. Leave it ticked and click
   "Save".
5. Open Publication › "Publication Formats". Under "PDF", click the
   "chapter1.pdf" row's arrow, then "Edit", then the "Identifiers" tab.
   It previews `urn:nbn:de:0000-jpk.14.113` above "Assign the URN to
   this file", ticked already. Leave it ticked and click "Save". Opened
   again, the tab reads "urn:nbn:de:0000-jpk.14.113 The URN is assigned
   to this file."
6. Do the same for "The Canadian Nutrient File: Nutrient Val.pdf"
   (`urn:nbn:de:0000-jpk.14.108`).

Reading the pages:

7. Log out. Open the book's page
   (`/index.php/publicknowledge/catalog/book/14`) and click "Chapter 1:
   Mind Control—Internal or External?". View the page's source.
8. On the book's page, click "The Canadian Nutrient File: Nutrient
   Val.pdf". The file's view page opens, its tab reading "PDF view of
   the file The Canadian Nutrient File: Nutrient Val.pdf". View the
   page's source.
9. On chapter 1's page, click its file's "PDF" link. The view page "PDF
   view of the file chapter1.pdf" opens. View the page's source.

**Expected**: step 7's source names the chapter's URN, and steps 8 and
9 each name their file's URN:

```html
<meta name="DC.Identifier.URN" content="urn:nbn:de:0000-jpk.14.108"/>
<meta name="DC.Identifier.URN" content="urn:nbn:de:0000-jpk.14.113"/>
```

**Observed**: step 7's source holds
`<meta name="DC.Identifier.URN" content="urn:nbn:de:0000-jpk.14.c54"/>`.
The view pages of steps 8 and 9 answer 200 with their Dublin Core tags
(`DC.Identifier` `14/3/108` and `14/3/113`, `DC.Title`,
`DC.Creator.PersonalName` and the rest), and no `DC.Identifier.URN`
tag at all.

## Cause

`DublinCoreMetaPlugin::monographFileView()`
(`plugins/generic/dublinCoreMeta/DublinCoreMetaPlugin.php`, OMP) writes
the publisher-identifier tags in a loop over the template variable
`pubIdPlugins`. It runs on the `CatalogBookHandler::view` hook, which
`CatalogBookHandler::download(…, $view = true)` calls. `download()`
assigns `publishedSubmission`, `publication`, `publicationFormat`,
`submissionFile`, `chapter` and `downloadUrl`, but never `pubIdPlugins`;
only `CatalogBookHandler::book()` does, on the book's and the chapters'
pages. So on a file's view page the loop gets an empty list and writes
nothing.

Inside the loop sits a second fault, hidden by the first. Line 293 reads

```php
if ($pubId = $submissionFile->getStoredPubId($pubIdPlugin->getPubIdType()) ?? $chapter ? $chapter->getDoi() : $publication->getStoredPubId($pubIdPlugin->getPubIdType())) {
```

PHP groups `??` before the ternary, so this is
`($submissionFile->getStoredPubId(…) ?? $chapter) ? $chapter->getDoi() : …`.
With `pubIdPlugins` assigned and nothing else changed, a whole-book file
holding a URN would call `getDoi()` on a null `$chapter` (a server
error on its view page), and a chapter's file would get its chapter's
DOI as "DC.Identifier.URN". The line came with
[98e456aa8e](https://github.com/pkp/omp/commit/98e456aa8ea664d8ec935e06fdb78441ff7a23db)
(`pkp/omp#1322`, `pkp/pkp-lib#8406`), which meant the file's identifier,
else its chapter's, else the book's. The same commit wrote the DOI line
above it the same way; `pkp/pkp-lib#10671`
([d4730b17c7](https://github.com/pkp/omp/commit/d4730b17c70df4fd465cc98ea2a768544db6530b))
later added the parentheses there, but not here.

Reach:

- Every publisher-identifier plugin's tag on a file's view page; in OMP
  that is the URN plugin, the only `pubIds` plugin it ships (read in the code).
- The PDF and HTML viewers' pages alike. Each viewer answers the same
  `CatalogBookHandler::view` hook, returns true (the handler then
  exits) and prints the headers collected so far through
  `{load_header context="frontend" headers=$headers}` in its
  `display.tpl`, so the Dublin Core callback must run before it.
  "PDF.js PDF Viewer" registers at `Hook::SEQUENCE_LATE`, so it does
  (the PDF pages carried the tags here). "HTML Monograph File"
  registers at the default sequence, as Dublin Core does, so their
  order is the plugins' load order, not read further; the HTML page
  carried the Dublin Core tags when spec U20's Rule 17 was checked
  (2026-10-05 and 2026-10-13). An HTML file with a URN was not driven.
- No other instance of the `?? $x ? … : …` grouping in the three apps'
  plugins, pages and classes, nor in pkp-lib's classes (read in the code).
- OJS and OPS have no file view page; their Dublin Core and Google
  Scholar plugins read `pubIdPlugins` on pages whose handlers assign it
  (`ArticleHandler::view()`, `PreprintHandler::view()`; read in the code).

## Proposed fix

Assign the variable where the view page's other template variables are
assigned, and put the parentheses where 98e456aa8e meant them
([fix.diff](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/book-file-page-urn-missing/fix.diff),
against OMP):

```diff
--- a/pages/catalog/CatalogBookHandler.php
+++ b/pages/catalog/CatalogBookHandler.php
@@ -485,6 +485,7 @@
             'submissionFile' => $submissionFile,
             'chapter' => $chapter,
+            'pubIdPlugins' => PluginRegistry::loadCategory('pubIds', true),
             'downloadUrl' => $dispatcher->url($request, PKPApplication::ROUTE_PAGE, null, null, 'download', $urlPath, ['inline' => true]),
         ]);
--- a/plugins/generic/dublinCoreMeta/DublinCoreMetaPlugin.php
+++ b/plugins/generic/dublinCoreMeta/DublinCoreMetaPlugin.php
@@ -290,7 +290,8 @@
         foreach ((array) $templateMgr->getTemplateVars('pubIdPlugins') as $pubIdPlugin) {
-            if ($pubId = $submissionFile->getStoredPubId($pubIdPlugin->getPubIdType()) ?? $chapter ? $chapter->getDoi() : $publication->getStoredPubId($pubIdPlugin->getPubIdType())) {
+            $pubIdType = $pubIdPlugin->getPubIdType();
+            if ($pubId = $submissionFile->getStoredPubId($pubIdType) ?? ($chapter ? $chapter->getStoredPubId($pubIdType) : $publication->getStoredPubId($pubIdType))) {
```

The handler owns what the page's template knows, as `book()` and OJS's
`ArticleHandler::view()` assign `pubIdPlugins` for their plugins.

Tried on `main` with the Steps: the view pages of steps 8 and 9 then
carried `DC.Identifier.URN` `urn:nbn:de:0000-jpk.14.108` and
`urn:nbn:de:0000-jpk.14.113`. A second walk assigned chapter 1's URN
and no file URN. With the fix, chapter1.pdf's view page gave the
chapter's URN (the fallback below). With and without it, the other file
pages gave none, and the book's and chapter's pages did not change.

**A question for the team: should a file's page fall back to its
chapter's or book's URN?** The diff keeps the fallback 98e456aa8e
wrote, the same as the "DC.Identifier.DOI" line above it, which spec
U20 records as the page's intended DOI behaviour. But a URN resolver
maps one URN to one object, so a file page that names its chapter's
URN as its own "DC.Identifier.URN" tells an index that the file is the
chapter. If the answer is no, the condition is the file's own
identifier alone, `$submissionFile->getStoredPubId($pubIdType)`, and
the same question then stands for the DOI line. The whole-book file to
book fallback was not driven (the dataset's book has no URN).

**Alternatives**:

- The plugin loading `PluginRegistry::loadCategory('pubIds', true)`
  itself: it works, but leaves the view page's template without the
  variable the book page provides, and is a second way to do one thing.

**What goes with it**: nothing stored is wrong, so no repair. The diff
applies as written to `stable-3_5_0` and `stable-3_4_0`. 3.3's
`monographFileView()` reads `$monograph->getStoredPubId()` (the book's)
in the same dead loop, so a backport there assigns the variable and
reads the file's identifier instead. The guard is an end-to-end check of
a file view page's tags with a file URN assigned.

Small: one line in the handler and one in the plugin, in one repo, with
the check.

## Evidence

- A Playwright script that takes the Steps on an install loaded from
  PKP's default test dataset:
  [walk.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/book-file-page-urn-missing/walk.js)
  (helpers in
  [lib.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/book-file-page-urn-missing/lib.js)),
  run with
  `PROBE_FEATURE=issues PROBE_AGENT=walk node bin/probe.js omp shared/playwright/checks/issues/book-file-page-urn-missing/walk.js`;
  `MODE=nb` in front runs the fallback walk alone. The fix was tried 2026-10-21 on the `main` tip
  below, the fallback walk with it in and out.
- Walked 2026-10-21 on PostgreSQL, each install freshly loaded from
  pkp/datasets
  [5f247d0](https://github.com/pkp/datasets/commit/5f247d0413634a07eba844a17958beee78c52135) (2026-10-20):
  - main: OMP 5777025bec (lib/pkp 042726ebf6).
  - stable-3_5_0: OMP cce424e5ef (lib/pkp 68512b5fda). The same steps
    and the same result (chapter 1's page `urn:nbn:de:0000-jpk.14.c54`;
    both file view pages 200, no URN tag). The code is the same:
    `download()` assigns no `pubIdPlugins`, and line 293 is identical.
- 3.4, by code: OMP `stable-3_4_0` read at the branch tip, pkp/omp
  [e30fa7e38c](https://github.com/pkp/omp/commit/e30fa7e38c73d1b26e44a2f45642d0bdca3606c1)
  (2026-10-16).
  `CatalogBookHandler::download()` assigns no `pubIdPlugins` (only
  `book()`, lines 217 and 255); `monographFileView()` line 274 holds the
  same condition; the URN plugin assigns file URNs there.
- 3.3, by code: OMP `stable-3_3_0` read at the branch tip, pkp/omp
  [8e72fc8836](https://github.com/pkp/omp/commit/8e72fc88363e8fd997f830a75209718d62a8d9a2)
  (2026-09-18).
  `DublinCoreMetaPlugin.inc.php` line 180 loops over `pubIdPlugins`,
  which `download()` does not assign either, and reads the book's
  identifier (`$monograph->getStoredPubId()`); the URN plugin
  (`URNPubIdPlugin.inc.php`) assigns file URNs.
- Introduced: `git log -S"pubIdPlugins"` on `CatalogBookHandler` finds
  only 2012 and 2017 changes to `book()`; `download()` never assigned
  it. The loop in `monographFileView()` dates from 749f84f7db, which
  created the plugin (committed 2017-02-27, the date in the header;
  `pkp/omp#395` merged it on 2017-04-27). `git blame` on line 293 gives
  98e456aa8e (`pkp/omp#1322`, Bozana Bokan, 2023), which added the
  file's identifier and the grouping fault.
- What else carries the file's URN, by code on `main`:
  `monograph_full.tpl` (the book's page) prints the formats' stored
  identifiers only (lines 501 and 579);
  `Dc11SchemaPublicationFormatAdapter` (OAI-PMH) adds the format's
  identifier as `dc:identifier` and the book's as `dc:relation`;
  `SubmissionFileNativeXmlFilter` (Native XML export) writes the file's.
- The assign box: `urnAssignCheckBox.tpl` renders it ticked
  (`checked="true"`), and the walk recorded it ticked on opening before
  each save. Its label reads "Assign the URN to this file" on screen,
  without the URN its text names (`{$pubId}`), which is spec U44's
  A7, reported apart.
- Not driven: an HTML file's view page with a URN; a whole-book file falling back to the book's URN
  (the dataset's book has none; the fix's condition by the code). MySQL
  not checked; the fault does not touch the database.
- Unverified: whether any harvester reads `DC.Identifier.URN` from
  these pages; none is known.
- Upstream search 2026-10-21, pkp/pkp-lib, pkp/omp and pkp/ui-library
  issues and PRs, by "URN dublin core file", "DC.Identifier.URN",
  `monographFileView`, `pubIdPlugins` and `DublinCoreMetaPlugin pubId`:
  no match. `pkp/pkp-lib#8182` (a 3.3.0-11 crash in
  `monographFileView()`) and `pkp/pkp-lib#6841` (chapter metadata in
  Dublin Core) are other faults.
