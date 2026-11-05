# On a preprint server that never saved its "Publisher ID" settings, a galley's Identifiers form fails on the server

- **Severity** low
- **Effort** small
- **Kind** defect
- **Crash** server
- **Affects**
  - main: OPS
  - 3.5: OPS
  - 3.4: OPS (code)
  - 3.3: OPS (code; on PHP 8)
- **Introduced** OPS's copy of OJS's commit for `pkp/ojs#2626` (`pkp/pkp-lib#5430`) · [0b4cd8e53a](https://github.com/pkp/ops/commit/0b4cd8e53a4a9ebf8277d8ae7103a76edd849e84) · 2020-02-17 · Nate Wright (NateWr)
- **Upstream** `pkp/pkp-lib#8758` (closed with a fix to OMP's copy of the form only, `pkp/omp#1360`; OPS's copy keeps the line)
- **Tracked in** spec U44 [OPS1](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U44-identifiers.md#ops1)
- **Checked** 2026-11-05, each branch's tip (the commits in Evidence)
- **Model** claude-opus-5-5

## Summary

On a preprint server whose "Publisher ID" settings have never been
saved, the request for a galley's "Identifiers" form fails on the
server, for the Author of an unposted preprint and for the Preprint
Server Manager alike. Those settings are the "Publisher ID" boxes on
Settings › Workflow › Submission › "Metadata".

Every new preprint server starts in that state. An upgraded server does
too, unless that form was saved on an earlier version. The galley's
"Edit" window offers no "Identifiers" tab in that state.

## Impact

- **Lost**: nothing. In this state the galley's "Identifiers" form has
  no field to fill: it shows a "Publisher ID" box only once "Enable for
  Galleys" is ticked and saved.
- **Who**: no one on screen today. The "Identifiers" tab appears in
  this state only with a public-identifier plugin enabled for galleys,
  and none can be installed on OPS: OPS bundles none, and the Plugin
  Gallery's two (ARK and PURL) are for OJS alone. Such a plugin would
  bring the failure to the editors and authors of every new server, and
  raise this to medium.
- **Way round**: one "Save" of the "Metadata" form, with or without a
  box ticked, ends the fault for good.

## Steps to reproduce

Preconditions:

- PKP's default test dataset, OPS `main` (or `stable-3_5_0`). Its
  "Metadata" settings form has never been saved.
- Submission 1, "The influence of lactation on the quantity and quality
  of cashmere production", is in Production, not posted, with the galley
  "PDF". Its author is `ccorino`.

Step 4 sends, from the browser's console, the request the galley
window's "Identifiers" tab would send.

Before the first save:

1. Sign in as `dbarnes`.
2. Open submission 1 and, under "Preprint" in the side menu, "Galleys".
3. On "PDF" open "More Actions" › "Edit". The window "Upload a File
   Ready for Publication" has the "Edit Metadata" tab alone. Close it.
4. In the browser's console on the same page, send:

   ```js
   fetch('/index.php/publicknowledge/$$$call$$$/grid/preprint-galleys/preprint-galley-grid/identifiers?submissionId=1&publicationId=1&representationId=1', {credentials: 'same-origin', headers: {'X-Requested-With': 'XMLHttpRequest'}}).then(async (r) => [r.status, (await r.text()).length])
   ```

   This is the address of the "Edit" window's own request (`edit-galley`
   in the browser's network panel), with `identifiers` as the operation.
5. Sign out, sign in as `ccorino`, open submission 1 from the dashboard,
   and repeat steps 2 to 4.

After one save (as `dbarnes` only):

6. Sign in as `dbarnes`, open Settings › Workflow › Submission ›
   "Metadata", and press "Save" without ticking a "Publisher ID" box.
7. Repeat steps 2 to 4.

Journal and press, for comparison (PKP's default test dataset, OJS or
OMP, its "Metadata" settings form never saved):

8. On OJS, sign in as `dbarnes`, open submission 17, "Antimicrobial,
   heavy metal resistance and plasmid profile of coliforms isolated from
   nosocomial infections in a hospital in Isfahan, Iran", and send
   step 4's request with the address
   `/index.php/publicknowledge/$$$call$$$/grid/article-galleys/article-galley-grid/identifiers?submissionId=17&publicationId=18&representationId=3`
   (its "PDF" galley).
9. On OMP, sign in as `dbarnes`, open submission 14, "From Bricks to
   Brains: The Embodied Cognitive Science of LEGO Robots", and send it
   with the address
   `/index.php/publicknowledge/$$$call$$$/grid/catalog-entry/publication-format-grid/identifiers?submissionId=14&representationId=3&publicationId=14`
   (its "PDF" publication format).

**Expected.** Step 4 answers 200 with the form, for both accounts: a
JSON text opening `{"status":true,"content":"<script>` that holds
`publicIdentifiersForm`.

**Observed.** Step 4 answers `[500, 0]` for both accounts: a server
error with an empty body. The server log (PHP 8.3) has:

```
PHP Fatal error:  Uncaught TypeError: in_array(): Argument #2 ($haystack) must be of type array, null given in …/controllers/tab/pubIds/form/PublicIdentifiersForm.php:35
```

Step 7 answers `[200, 1561]` with the form; the window still has the
"Edit Metadata" tab alone. Steps 8 and 9 answer 200 with the form
(1561 and 1858 characters).

## Cause

OPS's `PublicIdentifiersForm::fetch()`
(`controllers/tab/pubIds/form/PublicIdentifiersForm.php`, lines 33–35)
passes the server's `enablePublisherId` setting to `in_array()` as it
is:

```php
$enablePublisherId = $request->getContext()->getData('enablePublisherId');
$templateMgr->assign([
    'enablePublisherId' => ($this->getPubObject() instanceof Galley && in_array('galley', $enablePublisherId))
]);
```

The setting has no default: `schemas/context.json` declares an array
and nothing more, so `PKPContextService::add()` (its `setDefaults()`
call) writes no row for a new server, and no upgrade adds one (OPS's
3.3.0 migration only converts rows that exist). Only a save writes it:
the "Metadata" form, or the context REST API (`PUT /contexts/{id}`).
Until then `getData()` returns `null`, and PHP 8 refuses a `null`
haystack with a `TypeError`; PHP 7 only warned and returned `null`.

The rest of the code treats a missing setting as an empty list.
OPS's own `PreprintGalleyGridHandler::editGalley()` (line 388) reads it
as `(array)` when it decides whether the window lists the
"Identifiers" tab. So the tab is hidden, the window never sends the
request, and the form fails only when it is requested directly.

The line came to OPS with its copy of OJS's commit for `pkp/ojs#2626`,
which moved the galley and issue cases of the form out of pkp-lib into
OJS. OJS added the cast four days later in
[c9cee1d050](https://github.com/pkp/ojs/commit/c9cee1d050e5a9739e8c5e85c37f580b2aab3826)
("Avoid PHP warning before identifiers list is saved in setup"), which
OPS's history does not carry. OMP's copy had the same line and got the
cast in 2023 for `pkp/pkp-lib#8758`, where a chapter's "Identifiers"
tab failed the same way on PHP 8.

Other places the same fault could be, checked in the code:

- The other readers of `enablePublisherId` handle a missing value.
  These cast it with `(array)`: `PKPMetadataForm` in pkp-lib; OPS's
  `PreprintGalleyGridHandler::editGalley()`; OJS's and OMP's
  `PublicIdentifiersForm::fetch()`; OJS's `ArticleGalleyGridHandler`,
  `IssueGridHandler` and `IssueGalleyForm`; OMP's
  `PublicationFormatGridHandler`, `ChapterGridHandler` and
  `ManageFileApiHandler`. Each app's `MetadataSettingsForm` falls back
  to `[]` with a ternary. This line is the only one that does neither.
- `editGalley()` also lists the "Identifiers" tab when a
  public-identifier plugin is enabled for galleys, which would put this
  failure on screen for a server in that state. OPS has no
  `plugins/pubIds`, and the Plugin Gallery's public-identifier plugins
  (ARK, PURL) list OJS alone.
- The missing row breaks nothing else: every other reader above
  handles it, so no stored data needs repair.
- A separate fault, which this fix does not touch: OPS's file
  "Identifiers" request (`api/file/manage-file-api/identifiers`)
  fails in every state. The file branch of
  `publicIdentifiersForm.tpl` calls `$pubObject->getRevision()`,
  which `SubmissionFile` no longer has. No OPS screen offers a file
  "Identifiers" tab.

## Proposed fix

Read the setting as a list, as OJS's and OMP's copies of the form and
OPS's own grid handler do
([fix.diff](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/ops-galley-identifiers-form-fails-never-saved/fix.diff)):

```diff
-        $enablePublisherId = $request->getContext()->getData('enablePublisherId');
+        $enablePublisherId = (array) $request->getContext()->getData('enablePublisherId');
```

The file is the same on 3.5 and 3.4, so the diff applies there as
written; 3.3's `PublicIdentifiersForm.inc.php` has the same line
(line 36).

Tried on OPS `main`. With the fix, step 4 answers 200 with the form
(no "Publisher ID" box) for both accounts. A server with "Enable for
Galleys" ticked still shows the galley's "Identifiers" tab with its
"Publisher ID" box, with or without the fix.

**Alternatives**

- A `"default": []` for `enablePublisherId` in `schemas/context.json`:
  it would fill the setting only for servers created after the change;
  existing ones still hold no row, so the cast is needed anyway.
- Moving the galley case of `fetch()` into pkp-lib's
  `PKPPublicIdentifiersForm`, so the three apps share one reader: a
  larger refactor than this fault needs.

**What goes with it**

- No data repair, and no change for an API client or plugin: a `null`
  setting now gives the same result as `[]`.
- A test that requests a galley's "Identifiers" form on a new server
  and expects the form.

Small: one line in one file, with a test.

## Evidence

- Kept script:
  `shared/playwright/checks/issues/ops-galley-identifiers-form-fails-never-saved/walk.js`,
  on an install freshly reset to the default dataset. On OPS it takes
  steps 1 to 7, and on OJS and OMP steps 8 and 9. It takes step 4's
  address from the "Edit" window's own `edit-galley` request, and reads
  `enablePublisherId` from the database before and after: no row at the
  start in all three apps on both lines, `[]` after step 6. The fix's
  check ("Enable for Galleys" ticked and saved, the galley's
  "Identifiers" tab opened) is the same script's second mode.
- Tips walked (PKP's default test dataset of each line, datasets commit
  `7421d2a8`, PostgreSQL; the fault does not depend on the database):
  `main` OPS `0acd73102d`, OJS `9552aa521a` (lib/pkp `25fdc98a3e` for
  both), OMP `828150a8fe` (lib/pkp `1ae711024a`); `stable-3_5_0` OPS
  `82faa21834`, OJS `e725cc873a` (lib/pkp `e2c62c4b7b`), OMP
  `e81eefc11c` (lib/pkp `c4c0aa8c52`). PHP 8.3.36. Steps 1 to 9 took the
  same screens and addresses on both lines.
- Code reads: 3.4, OPS `upstream/stable-3_4_0` `d6dd7247c9`: the same
  `fetch()` without the cast, the grid handler with it, the schema
  without a default, and the 3.4 dataset dump without an
  `enablePublisherId` row; pkp-lib `stable-3_4_0` `2dd24cc5ae` requires
  PHP 8.0. 3.3, OPS `upstream/stable-3_3_0` `1f02fc5641`:
  `PublicIdentifiersForm.inc.php` line 36 without the cast (the galley
  class there is `ArticleGalley`, which the line tests, so `in_array()`
  is reached), the grid handler with it (line 338), and the 3.3 dataset
  dump without the row; pkp-lib `df738d3a66` allows PHP 7.3.
  New-server and upgrade state: `PKPContextService::add()` and
  `setDefaults()`, and OPS's `classes/migration/upgrade/` (main).
  Plugins: OPS `main` has no `plugins/pubIds`; pkp/plugin-gallery
  `plugins.xml` (main, read 2026-11-05) lists two `pubIds` plugins,
  `ark` and `purl`, both compatible with `ojs2` only.
- Introduced: OPS's `0b4cd8e53a` is a copy of OJS's
  [7e3ff5bb6c](https://github.com/pkp/ojs/commit/7e3ff5bb6c32900b6f4f31b1fa5ecb4c18a23a2f),
  merged in `pkp/ojs#2626` for `pkp/pkp-lib#5430`. OJS's `c9cee1d050`
  is not an ancestor of OPS `main`. OMP's cast: `514057811c`
  (`pkp/omp#1360`).
- Upstream searched 2026-11-05: pkp/pkp-lib, pkp/ops and pkp/ui-library
  for `enablePublisherId`, `PublicIdentifiersForm`, the `TypeError` text
  and the symptom in user words; `pkp/pkp-lib#8758` is the only match.
- Not driven: 3.4 and 3.3 (code only); `ccorino` after the save.
- Unverified: PHP 7's warning on 3.3 (from PHP's documented behaviour
  and the message of OJS's `c9cee1d050`, not run).
