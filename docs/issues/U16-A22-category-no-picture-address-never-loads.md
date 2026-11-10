# The picture address of a category with no picture never finishes loading

- **Severity** low
- **Effort** small
- **Kind** defect
- **Crash** server
- **Affects**
  - main: OJS, OMP, OPS
  - 3.5: OJS, OPS
  - 3.4: OJS, OPS (code)
  - 3.3: OJS, OPS (code)
- **Introduced** `pkp/pkp-lib#4369` for `pkp/pkp-lib#4158` · [75f76c503a](https://github.com/pkp/pkp-lib/commit/75f76c503a603a0a0b4d1edda5a31ab82fb233e8) · 2018-12-17 · Alec Smecher (asmecher); OMP: `pkp/omp#2553` for `pkp/pkp-lib#13730` · [1ac42011ad](https://github.com/pkp/omp/commit/1ac42011adbd6331524cffa5f43645bba64fc85d) · 2026-11-06 · Taslan A. Graham (taslangraham)
- **Upstream** none found (2026-11-10)
- **Tracked in** spec U16 [A22](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U16-categories.md#a22)
- **Checked** 2026-11-10, each branch's tip (the commits in Evidence)
- **Model** claude-opus-5-5

Update 2026-11-10: OMP `main` now has the fault too, since a change
merged on 2026-11-06 (Cause); walked again on `main` and 3.5, the
removed-picture case walked, and the fix tried on OMP.

## Summary

On a journal, a press or a preprint server, a category's picture
address (`…/catalog/thumbnail?type=category&id=2` for its small copy,
`…/fullSize?…` for the full size; `…/preprints/…` on a preprint server),
opened for a category that has no "Cover Image", should answer the bare
"404 Not Found" page. Instead the server fails while answering: it logs
a PHP warning, sends "200 OK" with headers promising 4096 bytes, and
closes the connection without sending any of them. The browser then
keeps the page loading and never shows anything.

No page links to these addresses. A visitor meets one by keeping the
address of a picture the manager has since removed in the category
window, or by typing or bookmarking one.

## Impact

- **Lost**: nothing stored. A visitor, a search engine or a link checker
  that opens the address waits on a page that never completes instead
  of being told the picture does not exist, and the server logs a PHP
  warning and notice each time.
- **Who**: whoever kept the address of a category picture that was
  later removed, or types one. On OMP `main` the fault is new and not
  yet released, so it can be fixed before the next release ships it to
  presses.
- **Way round**: none on screen, and none needed: a manager has no
  setting or record to correct.

Low: only a kept or typed address fails, and the context's own pages
are untouched; it would rise if a page linked a picture address for a
category without a picture. The answer counts as a server crash because
the request fails on the server side (a PHP warning and a response cut
short, which curl and the browser both report as failed), even though
the status is 200 and no server worker is held.

## Steps to reproduce

Preconditions:

- PKP's default test dataset for `main` (OJS, OMP or OPS), freshly
  loaded, served by PHP's built-in web server (`php -S`, PHP 8.3). Its
  categories "Applied Science" and "Computer Science" have no picture.
  [3.5 OPS: the dataset has no "Applied Science" or "Computer Science";
  the steps use "Social sciences" and "History" instead.]
- A picture `picture.png` on the reader's computer (a 400 × 400 PNG was
  used).

Steps 1 to 5 only create the folder category pictures are kept in. Skip
them when the context's public files folder exists already
(`public/journals/1/`, OMP `public/presses/1/`, OPS `public/contexts/1/`;
a context created on screen, or any uploaded logo, creates it; the
dataset dump leaves it out). [3.5: the folder is the context's private
`categories/` files folder, which only the first category picture
creates, so steps 1 to 5 are always needed.]

1. Sign in as `rvaca` (password `rvacarvaca`), the Journal manager
   (Press manager, Preprint Server manager).
2. Go to Settings › Journal (Press, Server) and open the "Categories"
   tab.
3. On the "Applied Science" row, open "More Actions" and choose "Edit"
   [3.5: press "Applied Science" in the list; 3.5 OPS: press "Social
   sciences"].
4. Under "Cover Image", press "Upload File" and choose `picture.png`.
5. Press "Save" [3.5: "OK"].
6. Type the small picture's address of "Computer Science", which has no
   picture, into the browser:
   `/index.php/publicknowledge/catalog/thumbnail?type=category&id=2`
   (OPS: `/index.php/publicknowledge/preprints/thumbnail?type=category&id=5`;
   3.5 OPS: "History",
   `/index.php/publicknowledge/preprints/thumbnail?type=category&id=1`).
7. Type its full-size address:
   `/index.php/publicknowledge/catalog/fullSize?type=category&id=2`
   (OPS: `…/preprints/fullSize?type=category&id=5`; 3.5 OPS:
   `…/preprints/fullSize?type=category&id=1`).

**Expected:** both addresses answer the bare "404 Not Found" page, as an
unknown category does (`…/catalog/thumbnail?type=category&id=999`).

**Observed:** each address is first redirected to its form with the
language (`/index.php/publicknowledge/en/catalog/…`), which answers
with headers built from the context's public files folder (its type
"directory", its size, its name "1") and then closes the connection
without sending a byte of body. `curl -D -` on that address prints

```
HTTP/1.1 200 OK
Content-Type: directory
Content-Length: 4096
Content-Disposition: inline; filename="1"
```

and ends with `curl: (18) end of response with 4096 bytes missing`
(exit 18, curl 8.18). Chromium reports the request as failed
(`net::ERR_CONTENT_LENGTH_MISMATCH`) but leaves the page loading; after
20 seconds it still showed nothing. The server logs, for step 6 (step 7
gives line 121 in place of 145):

```
PHP Warning:  Trying to access array offset on null in …/lib/pkp/pages/catalog/PKPCatalogHandler.php on line 145
PHP Notice:  fread(): Read of 8192 bytes failed with errno=21 Is a directory in …/lib/pkp/classes/file/FileManager.php on line 325
```

The unknown id (999) answers "404 Not Found".

A removed picture gives the same result: after steps 1 to 5, "Applied
Science"'s small picture address
(`…/catalog/thumbnail?type=category&id=1`) shows the picture; once
"Remove" under its "Cover Image" and "Save" are pressed, the same
address and its full-size one fail as above.

## Cause

`PKPCatalogHandler::thumbnail()` and `fullSize()` in
`lib/pkp/pages/catalog/PKPCatalogHandler.php` (lines 143–145 and
119–121 on `main`) serve a category's picture without checking that
the category has one. They answer 404 for an unknown or another
context's category, then read `$imageInfo = $category->getImage()`,
which is `null` for a category with no picture (a removed picture is
stored as `null` by `CategoryCategoryController::saveCategory()`), and
pass `getContextFilesPath($contextId) . '/' . $imageInfo['thumbnailName']`
(`['uploadName']` in `fullSize()`) to `downloadByPath()`.

With the name `null`, the path is the context's public files folder
itself. `FileManager::downloadByPath()` only asks `is_readable()`, which
a folder passes, so it sends a `200` with `Content-Type: directory` and
the folder's size as `Content-Length`. `readFileFromPath()` then opens
the folder (`fopen()` succeeds), `fread()` fails once with EISDIR, which
makes `feof()` true, and the method returns `true` having sent nothing.
PHP ends normally and the server closes the connection with the body
cut short. When the folder does not exist, `downloadByPath()` returns
`false`, which the handler ignores, and the answer is an empty page.

The methods came to pkp-lib when the catalog handler was shared with
OJS (`pkp/pkp-lib#4158`, 2018), without the `if ($imageInfo)` check
that OMP's own handler for the same addresses had. `pkp/omp#2553`
(`pkp/pkp-lib#13730`, merged 2026-11-06, not yet released), which fixed
OMP reading its category pictures from a folder they no longer live in,
replaced OMP's own category case with `parent::thumbnail()` and
`parent::fullSize()`, so OMP on `main` now runs these methods and their
missing check. On 3.5 and older the path is the context's private
`categories/` files folder, with the same result once any category of
the journal has had a picture.

Reach:

- OJS and OPS on every version: OPS routes `preprints/thumbnail` and
  `preprints/fullSize` to the same class (walked on `main` and 3.5; read
  in the code on 3.4 and 3.3).
- OMP on `main`: the category case of `CatalogHandler::thumbnail()` and
  `fullSize()` calls these methods (walked).
- OMP on 3.5, 3.4 and 3.3, the control: its own `CatalogHandler` keeps
  the `if ($imageInfo)` check and answers an empty page (status 200, no
  content) for a category without a picture and for an unknown id alike
  (walked on 3.5; code on 3.4 and 3.3). That is a milder wrong answer,
  not a 404, but nothing fails or waits; this report does not cover it.
- A removed picture's old addresses (walked on OJS `main`).
- A category whose picture file is missing on disk answers the empty
  page above (code).

## Proposed fix

In both methods of `PKPCatalogHandler`, answer 404 when the category has
no picture (the `empty(...)` check, which alone fixes this report), and
when the picture file cannot be sent (the `!downloadByPath(...)` check,
for a picture whose file is missing: for a folder `downloadByPath()`
returns `true`):

```diff
                 $imageInfo = $category->getImage();
+                if (empty($imageInfo['thumbnailName'])) {
+                    // No picture: there is nothing to serve at this address.
+                    throw new \Symfony\Component\HttpKernel\Exception\NotFoundHttpException();
+                }
                 $publicFileManager = new PublicFileManager();
-                $publicFileManager->downloadByPath($publicFileManager->getContextFilesPath($category->getContextId()) . '/' . $imageInfo['thumbnailName'], null, true);
+                if (!$publicFileManager->downloadByPath($publicFileManager->getContextFilesPath($category->getContextId()) . '/' . $imageInfo['thumbnailName'], null, true)) {
+                    throw new \Symfony\Component\HttpKernel\Exception\NotFoundHttpException();
+                }
```

and the same in `fullSize()` with `uploadName`. On `main` and 3.5 it
throws the same exception the two methods already throw for an unknown
category, a few lines up, and it covers OMP on `main` too, which now
calls these methods. Reading `downloadByPath()`'s answer follows
`IssueHandler::download()` in OJS, which already treats a falsy answer
as a failed download. The whole diff is
[fix.diff](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/category-no-picture-address-never-loads/fix.diff).
Tried on `main`, OJS and OPS (2026-10-07) and OMP (2026-11-10): with the
fix, both addresses of "Computer Science" answer "404 Not Found", and a
category with a picture still gets its small copy and full-size
picture, with the fix in and out.

**Alternatives**:

- Make `FileManager::downloadByPath()` refuse a folder (`is_file()` in
  place of `is_readable()`): it would stop the broken answer for every
  caller given an empty name (the administrator's scheduled task log
  download takes the name from the request), but the category addresses
  would still answer an empty page instead of 404. It touches every
  caller, so it belongs in a separate change, not this one.
- Restore OMP's own `if ($imageInfo)` check around its `parent::` calls:
  covers OMP alone and leaves OJS and OPS as they are.

**What goes with it**:

- No data repair and no API change. A plugin that serves files through
  the `FileManager::downloadFile` hook and leaves its `$result` falsy
  would now get a 404 after its own output, as it already gets a failed
  download in `IssueHandler::download()`; no plugin in the three apps'
  code uses that hook.
- OMP's series pictures (`type=series`) keep OMP's own handler and its
  `if ($imageInfo)` check, so a series with no picture answers an empty
  page (code); left out here.
- Backport: the same two checks apply to OJS and OPS on 3.5, 3.4 and
  3.3, where the methods read the private `categories/` folder through
  `ContextFileManager` (`name` in place of `uploadName`). 3.5 throws the
  same exception; 3.4 and 3.3 call `$this->getDispatcher()->handle404()`
  for an unknown category, and the checks would too. OMP needs none
  there.
- Test: an e2e check that the small picture's address of a category
  with no picture answers 404.

Small: two checks in one pkp-lib file, following the methods' own 404
and the way `IssueHandler::download()` reads the same answer, with no
data repair.

## Evidence

- The kept script
  [walk.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/category-no-picture-address-never-loads/walk.js)
  takes these Steps on all three apps, on an install loaded from the
  default dataset:
  `PROBE_FEATURE=<fleet> PROBE_AGENT=<name> node bin/probe.js all shared/playwright/checks/issues/category-no-picture-address-never-loads/walk.js`
  (3.5: `PKP_E2E_LINE=stable-3_5_0 PROBE_RUN=r35` in front). It records
  each response on the way (the redirect included) and the server's
  warnings and notices.
  - `WALK=removed` (`main`): steps 1 to 5, "Applied Science"'s small
    picture address, "Remove" and "Save", then its two addresses again.
    Walked on OJS `main`: `image/png` before the removal, the failure
    after it.
  - `WALK=nb` checks that categories with a picture still serve them.
    "Applied Science" and then "Social Sciences" get a picture. Social
    Sciences' small and full-size addresses and Applied Science's
    full-size address answered 200 `image/png`, with the fix in and
    out, and id 999 answered 404 (OJS and OPS 2026-10-07, OMP
    2026-11-10). Applied Science's small copy is not read there: it is
    made before the folder exists on an install without it.
- Walks on PostgreSQL, PHP 8.3.36 under `php -S`, Chromium driven by
  Playwright, datasets from pkp/datasets cfd54311 (2026-11-09).
  2026-11-10 on `main`: OJS, OMP and OPS as Observed; `curl -D -` on the
  `/en/` address after the walk, on OJS and OMP. On 3.5: OJS and OPS as
  on `main` (lines 157 and 133; `Content-Disposition` names the folder
  "categories"); OMP answered 200 with an empty body for "Computer
  Science" and for id 999. On Apache or nginx the cut-short answer may
  show differently in the browser; not checked. Why Chromium leaves the
  page loading after marking the request failed is not established
  (unverified).
- The test installs used get the context's public files folder when the
  dataset is loaded, so the fault showed before step 5 too. The empty
  page the Cause gives for a missing folder was walked on 2026-10-07 on
  OJS and OPS `main`, on an install without the folder; not walked
  again.
- Kind: defect rather than regression, since OMP's answer before
  `pkp/omp#2553` was not the expected 404 either, and the fault on OJS
  and OPS dates from 2018.
- Not driven: 3.4 and 3.3 (code only); a missing picture file with the
  folder present; OMP series pictures.
- `pkp/pkp-lib#7327` (open PR, browsing URLs) would move these methods
  but keeps their body. `pkp/pkp-lib#13730` (closed) is the OMP
  wrong-folder fault `pkp/omp#2553` fixed, not this one.
- Introduced: blame on the pkp-lib lines gives `198595800a` and
  `e3f570bc37` (moves and reformatting); `git log -S` on the old
  `'/categories/' . $imageInfo['thumbnailName']` line leads to
  `75f76c503a`. On OMP, blame on `CatalogHandler.php` lines 219 and 252
  (`parent::fullSize()`, `parent::thumbnail()`) gives `1ac42011ad`, PR
  `pkp/omp#2553`.
- Tips:
  - **`main`:** OJS 407246bb8e (lib/pkp 6035a6fed8), OMP f81f129c82
    (lib/pkp 8c3971dd1e), OPS 40f33453f0 (lib/pkp 6035a6fed8).
  - **`stable-3_5_0`:** OJS fc6640fa0d, OPS fdc9aa22e3 (lib/pkp
    7df8c6abac in each), OMP ae1d900d35 (lib/pkp 1e5673c7c7).
  - **`stable-3_4_0`:** OJS 61835656a2, OMP 98db039f2e, OPS d406378b01,
    pkp-lib 2dd24cc5ae.
  - **`stable-3_3_0`:** OJS b83fb9e44d, OMP 31f5c517ef, OPS 5d75c52745,
    pkp-lib df738d3a66.
- Code reads: on `main`, `PKPCatalogHandler` (the same file in OJS's and
  OMP's lib/pkp), `FileManager::downloadByPath()` and
  `readFileFromPath()`, every `downloadByPath()` caller and the
  `FileManager::downloadFile` hook's users, `IssueHandler::download()`,
  `CategoryCategoryController::saveCategory()`, OMP `CatalogHandler`
  and `1ac42011ad`, and the category templates; on 3.5, 3.4 and 3.3,
  pkp-lib `PKPCatalogHandler` (`.inc.php` on 3.3; the exception on 3.5,
  `handle404()` on 3.4 and 3.3) and `FileManager`, OPS
  `pages/preprints/index.php` (routes `thumbnail` and `fullSize` to
  `PKPCatalogHandler`) and OMP `CatalogHandler` (its `if ($imageInfo)`
  check on each).
