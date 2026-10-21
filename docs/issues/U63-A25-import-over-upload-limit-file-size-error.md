# Native XML import: a file over the upload limit is refused with "File size error." and no limit named

- **Severity** low
- **Effort** small
- **Kind** defect
- **Affects**
  - main: OJS, OMP, OPS
  - 3.5: OJS, OMP, OPS
  - 3.4: OJS, OMP, OPS (code)
  - 3.3: OJS, OMP (code; OPS has no Native XML Plugin)
- **Introduced** `pkp/pkp-lib#1176` for `pkp/pkp-lib#988` · [f090d86edb](https://github.com/pkp/pkp-lib/commit/f090d86edb7e84101681d6796c25e3715573e50d) · 2016-02-15 · Nate Wright (NateWr)
- **Upstream** none found (2026-10-21)
- **Tracked in** spec U63 [A25](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U63-import-export.md#a25)
- **Checked** 2026-10-21, each branch's tip (the commits in Evidence)
- **Model** claude-opus-5-5

## Summary

A manager chooses a file on the Native XML Plugin's "Import" tab that is
larger than the server's upload limit, and expects to be told what the
limit is. Instead, the box says only "File size error.", giving neither
the limit nor the file's size. Its button still reads "Upload File",
as before any file was chosen. Pressing "Import" then does nothing: no
results tab and no message.

The tool's own exports pass the limit early. With PHP's default of
2 MB, a press's export of its 18 books is 1.7 MB, and the same press
with 36 books exports 3.4 MB, which the box refuses. So the tool can
refuse a file it has just made, and nothing on the page says why or
what to do.

The same bare message appears in every upload box with "Drag and drop
a file here to begin upload" and an "Upload File" button: the Users
XML Plugin's import, the "Upload File" window of the workflow's file
lists, the publisher library, plugin upload and the profile picture.
The settings forms' image boxes and the submission wizard's file list
do name the file's size and the limit.

## Impact

- **Lost**: nothing; the file is not sent and nothing is imported.
- **Who**: journal, press and server managers importing a Native XML
  file over the server's upload limit, each time they choose one;
  anyone choosing a file over the limit in the boxes named above.
- **Way round**: export fewer submissions per file and import each, or
  ask the administrator to raise PHP's `upload_max_filesize`. The page
  suggests neither.

Low: the refusal is right and nothing is lost; only its message leaves
out the limit. The silent "Import" press does not raise it: the box
above the button already shows the refusal, and "Import" with no file
chosen does the same. A refusal with no message at all would be
medium.

## Steps to reproduce

Preconditions:

- PKP's default test dataset for `main`, with PHP's `upload_max_filesize`
  at its default, `2M`.
- On the computer, a file larger than 2 MB with an `.xml` name, for
  example `truncate -s 3M h21e-3mb.xml`. The box checks only the file's
  size, so its content does not matter here.

Steps:

1. Sign in as `rvaca` (the journal manager; press manager, server
   manager).
2. In the side menu press "Tools", then on "Import/Export" press
   "Native XML Plugin".
3. On "Import", under "Upload XML file to import", press "Upload File"
   and choose `h21e-3mb.xml`.
4. Press "Import".

**Expected**: the box refuses the file and says why, giving the file's
size and the largest file the server takes, in the app's own wording
for this refusal (`form.dropzone.dictFileTooBig`):

```
File is too big (3mb). Files larger than 2mb can not be uploaded.
```

**Observed**: under "Upload XML file to import" the box reads only:

```
File size error.
```

The button reads "Upload File", and no upload request is sent. At
step 4 the page posts `importBounce`, which answers 200 with
`{"status":false,"content":"","elementId":"0","events":[]}`. No results
tab is added and no message or notice is shown. Nothing is imported:
the export tab ("Export Articles", "Export", "Export Preprints") still
lists the dataset's 20 articles, 18 books or 19 preprints.

Control: after step 4, open Tools › "Import/Export" › "Native XML
Plugin" again. On the export tab press "Select All", then the export
button ("Export Articles", "Export Submissions", "Export Preprints"),
then "Download Exported File". Choose that file in the "Import" tab's
box: it uploads, its name shows and the button reads "Change File".
The files are 0.53 MB (20 articles), 1.71 MB (18 books) and 0.45 MB
(19 preprints).

A real file over the limit (OMP): import the press's file from the
Control with "Import" (it completes, and the list then holds 36
books), then export all 36 books the same way. That file is 3.43 MB;
chosen in the box, it reads "File size error." as in step 3.

## Cause

The legacy uploader passes PHP's `upload_max_filesize` to plupload as
its limit (`$.pkp.controllers.UploaderHandler.DEFAULT_PROPERTIES_`,
`max_file_size: $.pkp.cons.UPLOAD_MAX_FILESIZE`, lib/pkp
`js/controllers/UploaderHandler.js` line 263). plupload's
`max_file_size` filter refuses a larger file in the browser before
sending anything. It fires its `Error` event with
`code: plupload.FILE_SIZE_ERROR`, the `file`, and its own generic
`message: plupload.translate('File size error.')`.

The handler shows that message as it stands
(`UploaderHandler.prototype.handleError`, line 208:
`this.showError(err.message);`), so the file's size and the limit in
the event are dropped. The ui-library's upload boxes (Dropzone) name
both. They are given `form.dropzone.dictFileTooBig` ("File is too big
({{filesize}}mb). Files larger than {{maxFilesize}}mb can not be
uploaded.") but show Dropzone's own English default, "File is too big
(9MiB). Max filesize: 8MiB."
([U36-A21](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/issues/U36-A21-exact-limit-file-passes-size-check-then-refused.md));
that the key does not reach Dropzone is
[U10-A12](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/issues/U10-A12-upload-boxes-drop-text-english.md).

"Import" then does nothing because no file is up. The form's hidden
`temporaryFileId` is still empty, and
`PKPNativeImportExportPlugin::display()`'s `importBounce` answers
`new JSONMessage(false)` with no content. `Handler.handleJson()` shows
an alert only when there is content. That is the plugin's answer to
any "Import" press with no file, not a second fault of the refusal;
the fix below leaves it as it is.

Reach:

- Every box built on `controllers/fileUploadContainer.tpl` and
  `UploaderHandler`: the Native XML Plugin's import (on screen, three
  apps), the Users XML Plugin's import (OJS, OMP), the workflow's
  "Upload File" window, submission documents, the publisher library,
  plugin upload, the public profile picture, OJS's issue cover and
  issue galley, and OMP's series image (read in the code).
- plupload sends the same code and message for an empty file (its
  `prevent_empty` filter). That case is left as it is.
- Other plupload refusals (an extension filter's "File extension
  error.") go through the same line. They are another message each and
  are left out.

## Proposed fix

In `UploaderHandler.prototype.handleError`, when plupload refuses a file
for its size and the file is over the limit, show
`form.dropzone.dictFileTooBig` with the file's size and the limit
filled in. Keep plupload's message for everything else. Register the
key for the legacy JavaScript in each app's `vite.config.js`
`extraKeys` list, under "use directly via pkp.localeKeys", where
`form.dataHasChanged` already is
([fix.diff](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/import-over-upload-limit-file-size-error/fix.diff);
the same diff applies to OJS, OMP and OPS on `main` and
`stable-3_5_0`):

```diff
 	$.pkp.controllers.UploaderHandler.prototype.
 			handleError = function(caller, pluploader, err) {
-		this.showError(err.message);
+		var maxSize, message = err.message,
+				tooBig = pkp.localeKeys['form.dropzone.dictFileTooBig'];
+
+		if (err.code === plupload.FILE_SIZE_ERROR && err.file && tooBig) {
+			maxSize = plupload.parseSize(
+					pluploader.getOption('filters').max_file_size);
+			if (maxSize && err.file.size > maxSize) {
+				message = tooBig
+						.replace('{{filesize}}',
+								String(Math.round(err.file.size / 1024 / 10.24) / 100))
+						.replace('{{maxFilesize}}',
+								String(Math.round(maxSize / 1024 / 10.24) / 100));
+			}
+		}
+		this.showError(message);
 	};
```

```diff
 					// use directly via pkp.localeKeys
 					'form.dataHasChanged',
+					'form.dropzone.dictFileTooBig',
```

The handler reads `pkp.localeKeys` directly, as `TabHandler`,
`FormHandler` and `SiteHandler` do. The `extraKeys` entry puts the key
into `registry/uiLocaleKeysBackend.json` at every build, whether or not
the ui-library still uses it. On `main` it is there today only because
`dropzoneDefaults.js` uses it, and on 3.5 it is not there. The diff
also declares `plupload.FILE_SIZE_ERROR`, `plupload.parseSize`,
`plupload.Uploader.prototype.getOption` and `pkp.localeKeys` in
`tools/closure-externs.js` for the minified build's compile check.

Sizes: `{{filesize}}` is in MiB to two decimals, as Dropzone writes it.
The limit is written the same way. The newer boxes write
`Application::getIntMaxFileMBs()`, a whole number rounded down. The two
agree for a limit in whole megabytes (`2M`, PHP's form); for
`1500K` the legacy box would say 1.46 where the newer ones say 1.

Tried on `main` on the three apps. The box read "File is too big
(3mb). Files larger than 2mb can not be uploaded." With the fix in and
out, an empty file still read "File size error." and a 1 MB file still
uploaded.

**Alternatives**

- A new key worded for the legacy box: a new string for translators to
  translate, with no gain over the one written for the newer boxes.
- plupload's own "File: %s, size: %d, max file size: %d" (the detail
  line of its jQuery UI widget): English-only formatting with raw byte
  counts in every language plupload has no file for.
- A message from `importBounce` for an empty `temporaryFileId`: it
  would help the plugin's two import tabs alone, and only after the
  refusal has already gone unexplained.

**What goes with it**

- What it touches: the message alone. No request, hook or API changes,
  and refused files are still never sent.
- Backport: the diff applies to `stable-3_5_0` as it stands. 3.4 and
  3.3 have no `extraKeys` list. There the key goes into the "Common
  locale keys" list that `PKPTemplateManager::setupBackendPage()`
  passes to `setLocaleKeys()` (3.4 `PKPTemplateManager.php` line 848,
  which holds `form.dataHasChanged`; 3.3 `PKPTemplateManager.inc.php`
  line 786). The handler code is the same on all four branches.
- Test: an e2e check that a file over the limit on "Import" names the
  limit, since the legacy JavaScript has no unit tests.

Small: one handler and one key in each app's build config, with an
e2e check.

## Evidence

- Kept script, run on installs loaded from PKP's default test dataset
  (pkp/datasets `5f247d04`, 2026-10-20; PostgreSQL), in Chromium:
  [walk.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/import-over-upload-limit-file-size-error/walk.js),
  with helpers in
  [lib.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/import-over-upload-limit-file-size-error/lib.js).
  Its header gives the commands; `nb` runs the neighbour check (an
  empty and a 1 MB file) alone, `real` the 36-book export on OMP.
  - The script writes the 3 MB file itself as `truncate` does (zeros),
    chooses it through the "Upload File" button's file picker, and
    records the box's text, the requests to the plugin, dialogs, script
    errors and the count of the context's submissions in the database
    (20, 18, 19 before and after step 4).
  - PHP read `upload_max_filesize=2M`, `post_max_size=8M` on `main` and
    `stable-3_5_0`.
  - No server error and no script error were recorded on any run.
- Walked 2026-10-21 on `main`: OJS `3109a59114` (lib/pkp `f37a174626`),
  OMP `5777025be` and OPS `f048e747b4` (lib/pkp `042726ebf6`).
  `UploaderHandler.js` is the same file in all three.
- Walked 2026-10-21 on `stable-3_5_0`: OJS `1e78ca0c2b`, OMP
  `cce424e5e`, OPS `5eca7fd603` (lib/pkp `68512b5fda`), with the same
  result. `pkp.localeKeys['form.dropzone.dictFileTooBig']` was absent
  on the page; the apps' `vite.config.js` have the same `extraKeys`
  list as `main`.
- Read in the code for 3.4 and 3.3: `js/controllers/UploaderHandler.js`
  at lib/pkp `origin/stable-3_4_0` `85f47442cf` and
  `origin/stable-3_3_0` `867ce82d8e` has the same `handleError` and
  `max_file_size`. The apps' `plugins/importexport/native/templates/index.tpl`
  uses `fileUploadContainer.tpl` at OJS `upstream/stable-3_4_0`
  `0012bd1022` and `upstream/stable-3_3_0` `d7d9dd14ec`, OMP `e30fa7e38`
  and `8e72fc883`, and OPS `0f1e21a117`. OPS `stable-3_3_0`
  (`c5532e2161`) has no Native XML Plugin.
- The fix, tried 2026-10-21 on the `main` tips above, applied with
  `bin/try-fix.js` to OJS, OMP and OPS; walked with the fix, the
  neighbour check with the fix in and out, then reverted. With the fix,
  "Import" still added no tab, and the Control's file still uploaded.
- Not checked in the trial:
  - The build. The trial served the source files (`enable_minified`
    Off) and did not rebuild, so the new `extraKeys` entry was not
    seen to write the key. On `main` the key was already on the page.
    That the entry writes it rests on a read of
    `lib/pkp/tools/i18nExtractKeys.vite.js`, whose `buildEnd()` adds
    every `extraKeys` entry to the file. On 3.5 the fixed message is
    therefore not walked.
  - The minified build. `tools/buildjs.sh` needs Java, which the test
    machine lacks, so the compile check with the new externs was not
    run.
- Introduced: `git blame` puts line 208 at `f090d86edb` (2016-02-15,
  Nate Wright, "pkp/pkp-lib#988 Basic working version of new file
  uploader"). That commit added `handleError`; its parent's
  `UploaderHandler.js` binds no `Error` handler and drew the box with
  `$uploader.plupload()`, plupload's jQuery UI widget (plupload 2.1.2 by
  `composer.json`). Its pull request is `pkp/pkp-lib#1176` ("Streamline
  plupload controls"), opened by Alec Smecher (asmecher), merged
  2016-02-22. That release's widget was not read, so whether it named
  the size is unverified, and the Kind is defect.
- Upstream: searched pkp/pkp-lib, pkp/ojs, pkp/omp, pkp/ops and
  pkp/ui-library for "File size error", the upload limit with
  import/plupload/message words, `UploaderHandler`, `handleError
  plupload` and `plupload max_file_size`. No hit is about this message.
- Not driven: the other legacy boxes listed under Cause (read in the
  code), another interface language (plupload's `fr.js` translates its
  own message; the fix's key is translated in `fr_CA`, read in the
  code), and MySQL. The fault does not depend on the database.
