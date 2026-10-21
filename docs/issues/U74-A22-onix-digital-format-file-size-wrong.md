# A digital format's file size in the book's ONIX product reads whole megabytes followed by ".3"

- **Severity** medium
- **Effort** medium
- **Kind** defect
- **Affects**
  - main: OMP
  - 3.5: OMP
  - 3.4: OMP (code)
  - 3.3: OMP (code)
- **Introduced** [395ded913](https://github.com/pkp/omp/commit/395ded913c1b1133b8c942f17193e1bf5355ef4f) (OMP) · 2012-06-22 · Jason Nugent (jnugent)
- **Upstream** none found (2026-10-21)
- **Tracked in** spec U74 [A22](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U74-onix-metadata-export.md#a22)
- **Checked** 2026-10-21, each branch's tip (the commits in Evidence)
- **Model** claude-opus-5-5

## Summary

A press exports a book with Tools › "ONIX 3.0 Monograph Export
Plugin". Each digital format's product states a file size: the size of
the format's files approved with "Approve Proof", cut down to whole
megabytes, followed by ".3". An e-book of 3.8 MB is announced to the
trade as 3.3 MB, one of 1.9 MB as 1.3 MB, and a format hosted at
another website, or one with no files, as 0.3 MB.

Nothing on screen shows the figure, and the press cannot correct it:
the format's "Metadata" tab never shows its "File Size in Mbytes" box
([a separate fault](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U73-publication-formats-proof-terms.md#a6)).
A book moved to another press or install with the Native XML plugin
keeps the wrong figure as its own stored file size. The expected figure
is the files' size in megabytes to three decimals (3.8 MB as "3.800"),
and no file size for a format with no files.

## Impact

- **Lost**: a correct file size in the ONIX record the press sends to
  distributors and retailers, for every digital format. Metadata
  aggregators ask for it for e-books so that booksellers and buyers
  know how much they download (MVB's Metabooks metadata service lists
  it as required for e-books). Nothing found says a recipient
  checks it against the file or refuses a record over it, and the ONIX
  schema accepts the wrong values.
- **Who**: every press that exports ONIX for its e-books, PDFs or other
  digital formats, on every export, and every book imported from such
  a press's Native XML file.
- **Way round**: none on screen; the press can only edit the
  downloaded file by hand. The hidden "File Size in Mbytes" box would
  be one once it is shown again: a size typed there with its
  "override" box ticked is stored and wins in the export.

Medium: a field meant for the trade's booksellers and buyers is wrong
for every digital format, silently, and no screen corrects it; it is not high because no
recipient is known to reject or act on the figure.

## Steps to reproduce

Preconditions:

- PKP's default test dataset for OMP `main`.
- Sign in as `dbarnes`.
- The ONIX tool asks for four press details the dataset leaves blank.
  On Settings › Press › "Masthead", group "Publisher Identity", type
  "Public Knowledge Press" in "Press Publisher Name" and "Vancouver" in
  "Geographical Location", choose "Proprietary (01)" in "Publisher Code
  Type", type "PKP-01" in "Publisher Code", and press "Save".
- Two PDF files of 1.9 MB each (1,992,294 bytes), `ebook-part1.pdf`
  and `ebook-part2.pdf`, and one of 300 KB (307,200 bytes),
  `sample.pdf`. The dataset's PHP upload limit is 2 MB.

Exporting:

1. Open submission 4, "How Canadians Communicate: Contexts of Canadian
   Popular Culture", and choose "Publication Formats" in its side menu.
   Its one format, "PDF", is hosted at another website and has no files.
2. Press "Add publication format", type "EPUB h21k" in "Name", leave
   "Physical format" unticked, and press "OK".
3. On "EPUB h21k", press "Change File": choose "Book Manuscript", upload
   `ebook-part1.pdf`, press "Continue", "Continue", "Complete". Under the
   file, press "Awaiting Approval", then "Approve Proof" › "OK".
4. Go to Tools › "ONIX 3.0 Monograph Export Plugin", tick "How
   Canadians Communicate: Contexts of Canadian Popular Culture", press
   "Export Submissions", then "Download Exported File". In the file, read
   the `Extent` with `ExtentType` 22 (file size) of each product.
5. On "EPUB h21k", press "Change File" again and upload
   `ebook-part2.pdf` the same way. It is added beside the first file,
   which stays listed and approved. Approve it as in step 3.
6. Export the book again as in step 4.

Moving the book (on a freshly loaded dataset, with the same press
details):

7. On submission 4's "Publication Formats", add a format "Sample h21k"
   as in step 2, and give it `sample.pdf`, approved, as in step 3.
8. Go to Tools › "Import/Export" › "Native XML Plugin", tab "Export":
   tick the book, press "Export Submissions", then "Download Exported
   File".
9. On the tab "Import", upload that file and press "Import". The book is
   imported as submission 19.
10. Export both copies of the book with the ONIX tool as in step 4 (the
    list shows the title twice; tick both).

**Expected**: at step 4 the "EPUB h21k" product reads
`<ExtentValue>1.900</ExtentValue>` and the "PDF" product has no
file-size `Extent`; at step 6 "EPUB h21k" reads `3.800`. At step 10
both copies' "Sample h21k" read `0.293` and neither "PDF" has a
file-size `Extent`.

**Observed**: every export reads "The export completed successfully."
(with "Validate XML before the export and registration." ticked, as
the tool opens). At step 4 the "EPUB h21k" product reads 1.3 and the
"PDF" product 0.3:

```xml
<RecordReference>….publicknowledge.1</RecordReference>  <!-- "PDF" -->
<Extent><ExtentType>22</ExtentType><ExtentValue>0.3</ExtentValue><ExtentUnit>19</ExtentUnit></Extent>
<RecordReference>….publicknowledge.4</RecordReference>  <!-- "EPUB h21k" -->
<Extent><ExtentType>22</ExtentType><ExtentValue>1.3</ExtentValue><ExtentUnit>19</ExtentUnit></Extent>
```

At step 6 "EPUB h21k" reads `<ExtentValue>3.3</ExtentValue>` and "PDF"
still 0.3. The Native XML file of step 8 carries the same products,
"0.3" for both formats. At step 10 all four products read 0.3. The
imported book's two formats now hold "0.3" as their stored file size
(`publication_formats.file_size`), where the original's hold none.

## Cause

`PublicationFormat::getCalculatedFileSize()` (OMP,
`classes/publicationFormat/PublicationFormat.php` line 308) sums the
sizes of the format's proof files marked viewable (approved with
"Approve Proof") and returns (line 328):

```php
return sprintf('%d.3', $fileSize / (1024 * 1024)); // bytes to Mb
```

`%d` truncates the megabytes to a whole number and `.3` is literal
text: the format meant is `%.3f`. With no approved file the sum is 0
and the method still returns "0.3". The line came with OMP
[395ded913](https://github.com/pkp/omp/commit/395ded913c1b1133b8c942f17193e1bf5355ef4f)
(2012-06-22). Ten weeks later
[b32d1ac6f](https://github.com/pkp/omp/commit/b32d1ac6f3f312daa3c749a2385588029746ed89)
("fix file size calculation for digital publication formats") changed
the divisor from 1024 to 1024 × 1024 and kept `'%d.3'`.

`MonographONIX30XmlFilter::createProductNode()`
(`plugins/importexport/onix30/filter/MonographONIX30XmlFilter.php`
line 474) writes, for every format whose "Physical format" is
unticked, an `Extent` with `ExtentType` 22 (file size) and
`ExtentUnit` 19 (Mbytes): the stored `fileSize` when there is one
(line 475), otherwise `getCalculatedFileSize()`. The "Metadata" tab
does not offer the box that stores a size, so a book made on the press
carries the computed figure.

Reach:

- The ONIX 3.0 tool's export and the Native XML export, which puts the
  same product into each format's entry
  (`PublicationFormatNativeXmlFilter`, lines 58 to 66) when the press
  has a contact and the four publisher details (both walked).
- The Native XML import stores the figure:
  `NativeXmlPublicationFormatFilter::_extractExtentContent()` (lines
  429 and 430) calls `setFileSize()` with an `Extent` 22's value. From
  then on the stored size wins over the computed one, in the export
  (line 475) and in the metadata form (line 172), so the imported book
  keeps the wrong figure even once the computation is fixed (walked).
- `PublicationFormatMetadataForm::initData()` fills the "File Size in
  Mbytes" box with the same figure (line 172); the box is not on the
  tab today, so it shows only once that is fixed. Its `execute()` (line
  258) stores the box only when "override" is ticked and otherwise
  clears the stored size; since the tab sends no "override", a press
  that saves an imported format's "Metadata" tab clears its stored
  size (walked with the fix: the imported "Sample h21k" then exported
  0.293).
- `PublicationFormat::_checkRequiredFieldsAssigned()` (line 592, called
  by `hasNeededONIXFields()`) tests the figure for emptiness; "0.3" is
  never empty, so a digital format with no files and no stored size is
  never flagged. Neither method has a caller (code).

## Proposed fix

Return the size to three decimals, at least 0.001, or nothing when the
format has no approved file, and write the file-size `Extent` only
when there is a size
([fix.diff](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/onix-digital-format-file-size-wrong/fix.diff),
against `main`):

```diff
-        return sprintf('%d.3', $fileSize / (1024 * 1024)); // bytes to Mb
+        if (!$fileSize) {
+            return null;
+        }
+
+        return sprintf('%.3F', max($fileSize / (1024 * 1024), 0.001)); // bytes to Mbytes
```

```diff
-            $fileSize = $publicationFormat->getFileSize() ? $publicationFormat->getFileSize() : $publicationFormat->getCalculatedFileSize();
-            $extentNode = $this->createExtentNode($doc, $deployment, '22', $fileSize, '19'); // 22 -> Filesize, 19 -> Mbytes
-            $descDetailNode->appendChild($extentNode);
-            unset($extentNode);
+            $fileSize = $publicationFormat->getFileSize() ?: $publicationFormat->getCalculatedFileSize();
+            if ($fileSize) { // No stored size and no approved file: no file size to state
+                $extentNode = $this->createExtentNode($doc, $deployment, '22', $fileSize, '19'); // 22 -> Filesize, 19 -> Mbytes
+                $descDetailNode->appendChild($extentNode);
+                unset($extentNode);
+            }
```

The method owns the figure, so the fix goes there and reaches every
caller; with `null`, `_checkRequiredFieldsAssigned()` flags a digital
format with no size, as it was written to. The filter already skips
the front and back matter `Extent` when there is none, and the file
size follows that pattern. `ExtentValue` is a `StrictPositiveDecimal`
in the ONIX 3.0 schema, so a total under half a kilobyte, which three
decimals would write as "0.000", is written as 0.001 instead. `%.3F`
writes a point whatever the server's locale.

With it goes a repair of the sizes already stored by imports, as an
upgrade migration: for each format without "Physical format" that has
a stored `file_size`, work out what the old code wrote for its
approved files (whole megabytes and ".3", "0.3" with none) and clear
the stored size when it is equal. The migration reads the files' sizes
from the file store, as `getCalculatedFileSize()` does; the database
does not hold them. A stored value that matches by chance (a size a
press typed before the box went missing in 3.2, such as 1.3 for a
1.3 MB file) is cleared too and computed again from the files, which is
the size the press meant.

Tried on OMP `main`: the Steps' exports read 1.900 and then 3.800 for
"EPUB h21k", with no file-size `Extent` for "PDF". A digital format
with a 300 KB file read 0.293, one with a 200-byte file 0.001, and a
physical format had no file-size `Extent`; without the fix those read
0.3, 0.3 and none. Every export passed the tool's validation. A Native
XML file exported before the fix and imported with it still gave the
imported book's formats "0.3" from their stored size, which the repair
is for; it was not tried.

**Alternatives**

- `%.3f` alone: right for formats with files, but a format with no file
  would announce "0.000" MB, which the schema refuses.
- The size in bytes (`ExtentUnit` 17): exact, but a change of unit for
  every receiver of the file, and the metadata form's box is labelled
  in megabytes.
- Clearing every stored value of the form "n.3": simpler, but it would
  also clear a press's own 1.3 MB or 2.3 MB for a file of another size.
- Leaving the stored sizes: the imported books keep the wrong figure,
  and nothing on screen can change it while the box is hidden.

**What goes with it**

- What it touches: the figure in both exports and in the metadata
  form's box, which reads empty for a format with no approved file. No
  hook or API changes.
- Backport: the same line is on `stable-3_5_0`, `stable-3_4_0` and
  `stable-3_3_0` (`PublicationFormat.inc.php` and
  `MonographONIX30XmlFilter.inc.php` on 3.3). The diff applies to
  `stable-3_5_0` as it stands; on 3.4 and 3.3 the same two changes are
  needed at the lines Evidence names (3.3's files are tab-indented, so
  the diff is rewritten there).
- Test: a unit test of `getCalculatedFileSize()` with no file, a tiny
  file and approved files of known sizes; an e2e test reading a digital
  format's `Extent` in the export; and a test of the migration on a
  format holding "0.3".

Medium: the code fix is a few lines in one method and a guard in the
filter, but the stored sizes need an upgrade migration.

## Evidence

- Kept script, run on installs loaded from PKP's default test dataset
  (pkp/datasets `5f247d04`, 2026-10-20; PostgreSQL), in Chromium:
  [walk.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/onix-digital-format-file-size-wrong/walk.js),
  with helpers in
  [lib.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/onix-digital-format-file-size-wrong/lib.js).
  With no argument it takes steps 1 to 6, with `import` steps 7 to 10
  (then the imported "Sample h21k"'s "Metadata" › "Save" and one more
  export), and with `neighbour` the formats the fix must leave right (a
  physical one, a 300 KB file, a 200-byte file). The files are written
  by the script (a PDF header padded to the size); the products are
  told apart by `RecordReference`, which ends in the format's id.
  - The import answers "Unknown element sequence" and writes a PHP
    warning (`Undefined property: stdClass::$section_id` in OMP
    `classes/section/DAO.php` line 71); both are other faults, on file
    under U63.
- Walked 2026-10-21 on `main`: OMP `5777025be` (lib/pkp `042726ebf6`),
  steps 1 to 10.
- Walked 2026-10-21 on `stable-3_5_0`: OMP `cce424e5e` (lib/pkp
  `68512b5fda`), steps 1 to 6, with the same figures (0.3, 1.3, 3.3).
  Steps 7 to 10 not walked there; the import filter's lines 429 and 430
  are the same on 3.5 (code).
- Read in the code for 3.4 and 3.3: OMP `upstream/stable-3_4_0`
  `e30fa7e38` `classes/publicationFormat/PublicationFormat.php` line 329
  and `upstream/stable-3_3_0` `8e72fc883`
  `classes/publicationFormat/PublicationFormat.inc.php` line 270 have
  the same `sprintf('%d.3', …)`; their ONIX filters write it as the
  file-size `Extent` the same way (3.4 line 441, 3.3 line 434).
- The fix, tried 2026-10-21 on the `main` tips above, with the Steps,
  the formats above with the fix in and out, and the import of a file
  exported before the fix. The repair migration is not written and not
  tried.
- Introduced: `git log -S"'%d.3'"` finds `395ded913` (2012-06-22, Jason
  Nugent, tracker `*7599*`). `b32d1ac6f` (2012-09-03, Jason Nugent)
  changed the same line's divisor, which `-S` does not list since the
  count of `'%d.3'` stayed the same. `git blame` at the tip puts the
  line at `01088072a` (2021, PSR-12 formatting).
- The schema: `ExtentValue` is `dt.StrictPositiveDecimal`
  (`minExclusive 0`) in `ONIX_BookProduct_3.0_reference.xsd`.
- What recipients do with the figure: a web search found Metabooks'
  ONIX guidance ("required for e-books", for the transfer volume;
  https://metabooks.com/ajuda/recommendations-for-metabooks-onix/extent/file-size)
  and EDItEUR's code list (list 23, code 22: the approximate size of a
  digital file). Nothing found on a recipient comparing it with the
  file or refusing a record; unverified either way.
- Upstream: searched pkp/pkp-lib and pkp/omp for ONIX file size,
  filesize, `ExtentValue`, "file size" megabytes and
  `getCalculatedFileSize`. `pkp/pkp-lib#9602` (open) lists wrong ONIX
  `Extent` codes for page counts and a file size, a different fault
  (types and units, not the value); `pkp/pkp-lib#6496` (closed) is the
  "Metadata" tab failing to load.
- Not checked: MySQL (the figure is computed in PHP; the stored size is
  a text column on both).
