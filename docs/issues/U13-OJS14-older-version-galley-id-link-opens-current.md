# A saved link to an older version's galley opens the current version, unannounced, once that galley gets a URL Path

- **Severity** medium
- **Effort** small
- **Kind** defect
- **Affects**
  - main: OJS
  - 3.5: OJS
  - 3.4: OJS (code)
  - 3.3: OJS (code)
- **Introduced** for `pkp/pkp-lib#7138` · [e6cee7d19d](https://github.com/pkp/ojs/commit/e6cee7d19d6c902415ac335acdeef7e098caf3b0) (no PR on `main`; `pkp/ojs#3156` is the 3.3 change) · 2021-07-14 · Nate Wright (NateWr)
- **Upstream** none found (2026-10-23)
- **Tracked in** spec U13 [OJS14](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U13-article-landing-page-and-reading.md#ojs14)
- **Checked** 2026-10-23, each branch's tip (the commits in Evidence)
- **Model** claude-opus-5-5

Update 2026-10-23: walked again on `main` and 3.5 and widened to a
galley that had its URL Path from the start (step 8), the address that
downloads the galley (steps 11 and 13), and an editor's preview of an
unpublished version (steps 1 and 2). The fix was tried on the new steps.

## Summary

On a journal, an older version's page links each galley by the
version's ID and the galley's ID
("…/article/view/{article}/version/{version ID}/{galley ID}"), as long
as the galley has no URL Path. Once the galley is given a URL Path,
that address stops opening the older version.

The reader lands on the current version's galley with the same URL
Path, or, when the current version has none, on the article's page,
which shows the current version. Neither page says that the link named
another version. A reader following a citation or a bookmark of
version 1.0 reads the latest version, and neither they nor the
journal's editors are told. The address that downloads the galley is
forwarded the same way: it delivers the current version's file, or
answers "404 Not Found" when the current version has no galley with
that URL Path.

It takes an article with more than one published version, and an older
galley that now has a URL Path. The reader opens it through an ID
address: one saved before the galley got its URL Path, or one typed by
hand. The fix is a few lines in the one place that forwards these
addresses.

A lesser case: an editor who types the galley ID of an unpublished
version into its preview address gets "404 Not Found" once that galley
has a URL Path, unless a published version has a galley with the same
URL Path.

## Impact

- **Lost.** The version the link names. A download link also loses
  the file once the current version's galley has a different URL Path,
  or none. Neither the reader nor the journal's editors are told.
- **Who.** Whoever holds an ID address saved while the galley had no
  URL Path. That is a reader who copied the "PDF" link from an older
  version's page, or a client of the REST API (a galley's
  `urlPublished`). On `main` only, with DOI versioning on, it is also
  Crossref: the full-text links it is given for Similarity Check and
  text mining are such download addresses. The DOI itself resolves to
  the version's own page, which still opens. The galley gets its URL
  Path in one of two ways. An editor adds it to the older version's
  galley, which the "Galleys" page allows on a published version from
  3.5 on. Or the link went out first, an editor then added the URL Path
  while that version was the current one, and a new version was
  published since. `pkp/pkp-lib#7138` describes journals that give
  galleys their URL Path only after publication.
- **Way round.** A reader who notices the change of version can open
  the older one from the "Versions" list on the article's page. An
  editor can clear the galley's "URL Path" (on 3.4 and 3.3 only after
  "Unpublish", since their "Galleys" page refuses edits to a published
  version). The old address then works again, and the addresses made
  with the URL Path stop opening the galley. An editor previewing can
  use the preview page's own galley link, which uses the URL Path and
  opens.

Medium: a link the journal's own page offered ends on another version
with nothing saying so, but only after a URL Path is added to a galley
that is already published. It would be high if a page of the journal
still offered such a link once the URL Path is set; the pages then
link the URL Path address, which works.

## Steps to reproduce

Preconditions:

- PKP's default test dataset for `main`: OJS.
- Article 1, "Signalling Theory Dividends", has a published version 1.0
  (version ID 1; galley "PDF", galley ID 1, no URL Path) and an
  unpublished version 1.1 (version ID 2; galley "PDF Version 2", galley
  ID 2, URL Path "pdf").
- The article's own URL Path is "mwandenga-signalling-theory" on 1.0
  and "mwandenga" on 1.1, so its address ends in "mwandenga" once 1.1
  is published.

The editor's preview of the new version:

1. Sign in as `dbarnes` and open submission 1, "Signalling Theory
   Dividends": it is listed in the dashboard's "Published" view
   (`/index.php/publicknowledge/en/dashboard/editorial?workflowSubmissionId=1`
   opens it directly). The workflow opens on version 1.1. Press
   "Preview". The preview opens at
   `…/article/view/mwandenga-signalling-theory/version/2` under "This
   is a preview and has not been published. View submission".
2. Open the same galley by its ID instead:
   `/index.php/publicknowledge/en/article/view/mwandenga-signalling-theory/version/2/2`.

The link, while the galley has no URL Path:

3. Back in the workflow, press "Publish". In "Review Publishing
   Details" keep what is preselected and press "Confirm", then press
   "Publish" under "Are you sure you want to publish this?". [3.5:
   "Publish", then "Publish" in the window.] Sign out.
4. Open the article
   (`/index.php/publicknowledge/en/article/view/mwandenga`) and, under
   "Versions", press "{date} (Version of Record 1.0)" [3.5: "{date}
   (1)"].
5. Press "PDF". The PDF reader page opens at
   `…/article/view/mwandenga/version/1/1` under "This is an outdated
   version published on {date}. Read the most recent version." Keep
   this address, as a reader who bookmarks or cites it would. (The
   viewer under the notice is empty; that is another fault,
   [pkp-e2e's U13 A2 report](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/issues/U13-A2-older-version-pdf-reader-empty.md).)

A galley that had its URL Path from the start:

6. Sign in as `dbarnes`, open submission 1 and press "Create New
   Version". Keep what the window preselects ("Which version should
   metadata be copied from?": "Version of Record 1.1"; "Publication
   Stage": "Version of Record (VoR)"; "Revision Significance": "Minor
   Revision") and press "Confirm". The workflow adds "Version of Record
   1.2". [3.5: "Yes" under "Are you sure you want to create a new
   version?"]
7. Publish "Version of Record 1.2" as in step 3. Sign out.
8. Open `/index.php/publicknowledge/en/article/view/mwandenga/version/2/2`
   (1.1's "PDF Version 2" by its ID), then the address that downloads
   it, `/index.php/publicknowledge/en/article/download/mwandenga/version/2/2`.

The editor gives the older galley a URL Path:

9. Sign in as `dbarnes`, open submission 1 and, in the side menu under
   "Version of Record 1.0", open "Galleys" [3.5: pick version 1 under
   "All Versions", then "Galleys"]. The page warns "This version has
   been published. Editing it may impact the published content." On
   "PDF", press "More Actions" › "Edit", type `pdf` in "URL Path" and
   press "Save". Sign out.
10. Open the address kept in step 5,
    `/index.php/publicknowledge/en/article/view/mwandenga/version/1/1`.
11. Open the address that downloads the same galley,
    `/index.php/publicknowledge/en/article/download/mwandenga/version/1/1`.

The current version's galley has no URL Path:

12. Sign in as `dbarnes` and open "Galleys" under "Version of Record
    1.2" [3.5: the newest version under "All Versions"]. On "PDF
    Version 2", press "More Actions" › "Edit", empty "URL Path" and
    press "Save". Sign out.
13. Open the addresses of steps 10 and 11 again.

**Expected.** Step 2 opens the preview's PDF reader, as
`…/version/2/pdf` does. Step 8 lands on `…/article/view/mwandenga/version/2/pdf`,
and steps 10 and 13 on `…/version/1/pdf`: the older version's PDF
reader page, under "This is an outdated version published on {date}.
Read the most recent version." The downloads of steps 8, 11 and 13
deliver the file from `…/article/download/mwandenga/version/2/pdf` and
`…/version/1/pdf`.

**Observed.** Step 2 answers "404 Not Found". Steps 8 and 10 land on
the current version's PDF reader page, titled "View of The The
Signalling Theory Dividends Version 2" (sic: the dataset gives 1.1
the prefix "The" and the title "The Signalling Theory Dividends Version
2"), with no notice, and their
downloads deliver `article.pdf` from the current version's galley
address. Step 13 lands on the article's page, which shows version 1.2
with no notice, and its download answers "404 Not Found":

```
step 2   GET …/en/article/view/mwandenga-signalling-theory/version/2/2   302 → …/en/article/view/mwandenga-signalling-theory/pdf   404
step 8   GET …/en/article/view/mwandenga/version/2/2       302 → …/en/article/view/mwandenga/pdf       200
         GET …/en/article/download/mwandenga/version/2/2   302 → …/en/article/download/mwandenga/pdf   200
step 10  GET …/en/article/view/mwandenga/version/1/1       302 → …/en/article/view/mwandenga/pdf       200
step 11  GET …/en/article/download/mwandenga/version/1/1   302 → …/en/article/download/mwandenga/pdf   200
step 13  GET …/en/article/view/mwandenga/version/1/1       302 → …/en/article/view/mwandenga/pdf
                                                           302 → …/en/article/view/mwandenga           200
         GET …/en/article/download/mwandenga/version/1/1   302 → …/en/article/download/mwandenga/pdf
                                                           302 → …/en/article/download/mwandenga       404
```

After step 9, the addresses of steps 10 and 11 with the galley's file
ID at the end (`…/version/1/1/12`, as the PDF reader's "Download"
address ends) are forwarded to the same two places. After step 12,
1.1's galley by its ID (`…/version/2/2`) goes where step 13's
addresses go. In the dataset every version's galley holds the same
file, so the downloads do not differ in content; their address is the
current version's galley.

Control: the galleys' URL Path addresses, `…/version/2/pdf` and
`…/version/1/pdf`, open those versions' PDF reader pages under the
notice, and `…/article/download/mwandenga/version/2/pdf` delivers the
file.

## Cause

`ArticleHandler::initialize()` (pkp/ojs `pages/article/ArticleHandler.php`)
reads the address as `{article}[/version/{version ID}]/{galley}[/{file
ID}]`. It picks the publication (the one `version` names, else the
current one) and looks the galley up among that publication's galleys by
`getBestGalleyId()`, which is the URL Path once one is set. A galley ID
that matches a galley with a URL Path is forwarded to the galley's
"correct URL" (lines 166–167):

```php
} elseif (ctype_digit($galleyId) && $galley->getId() == $galleyId) {
    $request->redirect(null, $request->getRequestedPage(), $request->getRequestedOp(), [$submission->getBestId(), $galley->getBestGalleyId()]);
}
```

The new address is built from the article and the galley alone. It
leaves out the `version/{version ID}` part the handler read a few lines
above, and whatever followed the galley (`$args`, the file ID). Without
a version the next request means the current publication. The handler
then finds the current version's galley of that URL Path. When there is
none, but a published version has a galley of that URL Path, it takes
the "Redirect to the most recent version" branch (lines 173–183) to
the article's address, `[$submission->getBestId()]`, with the same
operation. For `view` that is the article's page. `download()` has no
galley to send there and answers "404 Not Found". When no published
version has a galley of that URL Path (an unpublished version's, steps
1 and 2), the handler answers "404 Not Found" at once.

The redirect came with e6cee7d19d for `pkp/pkp-lib#7138`: journals
moving from OJS 2 had galley ID links that stopped at "404 Not Found"
once a URL Path was set, and the ID link "should still be valid". The
change wrote the redirect for the current version only. The versioned
addresses were already in the handler (`pkp/pkp-lib#4870`, 2019).

Reach:

- **`view` and `download`, with or without a file ID** (on screen):
  one line serves both operations.
- **When the galley got its URL Path does not matter** (on screen,
  step 8).
- **The article's ID in place of its URL Path** (code): the redirect
  comes after the article is found, whichever way it was named. The
  article's own redirect first turns `…/view/1/version/2/2` into step
  2's address.
- **The current version named by its version ID** (on screen):
  `…/view/mwandenga/version/2/2`, before 1.2 is published, is forwarded
  to `…/view/mwandenga/pdf`. That is the right galley at that moment,
  on an address that no longer names the version. Step 8 is the same
  address after the next version is published.
- **An unpublished version's galley** (on screen, steps 1 and 2): only
  those who may preview the version reach the redirect. A visitor gets
  "404 Not Found" at the version's address, before it.
- **The current version's galley by its ID with a file ID** (code):
  the forwarded address loses the file ID, so `download` delivers the
  galley's own file. For a PDF that is the file asked for. For a file
  that belongs to an HTML galley (an image, a stylesheet) it is the
  HTML file instead.
- **A file ID and a file name after the galley** (code): the redirect
  drops both, so a saved address of a file an HTML galley embeds
  delivers the galley's own file, or answers "404 Not Found" as in
  step 13. With the fix, `...$args` keeps both. `initialize()` reads
  the file ID and ignores the name, as it does today, and `download()`
  accepts the file as one of the older galley's own. Only a PDF's
  file-ID address was walked.
- **Who hands the address out** (code): each of these puts the
  version's ID before the galley, and the galley's ID while it has no
  URL Path. The older version page's galley links
  (`frontend/objects/galley_link.tpl`) do so for an older version. A
  galley's `urlPublished` in the REST API
  (`lib/pkp/classes/galley/maps/Schema.php` lines 124–136) does so for
  every version, the current one included, on `main` and 3.5. So do,
  on `main` with DOI versioning on, the full-text download addresses
  deposited at Crossref (`plugins/generic/crossref/filter/ArticleCrossrefXmlFilter.php`
  line 610 for Similarity Check, line 657 for text mining); the DOI's
  own resource address (line 269) names the version with no galley. On
  3.5 the deposit names no version (lines 363 and 411). The HTML
  galley plugin builds the address of each file an HTML galley embeds
  as `…/download/{article}/version/{version ID}/{galley}/{file ID}/{file
  name}` for every version
  (`plugins/generic/htmlArticleGalley/classes/HtmlGalleyHelper.php`
  line 87; 3.5 `HtmlArticleGalleyPlugin.php` line 192), and its reader
  frame for an older version as `…/{galley}/{file ID}`
  (`templates/display.tpl` line 41). The Lens reader does the same for
  an older version's XML file
  (`plugins/generic/lensGalley/templates/articleGalley.tpl` line 17)
  and for the files it embeds, with a file name
  (`LensGalleyPlugin.php` line 276). These pages build the addresses
  afresh each time, so they meet the fault only when an address is
  saved.
- **Who does not** (code): the "Versions" list and the DOAJ export
  name a version with no galley. OAI-PMH's Dublin Core, the Google
  Scholar tags, DataCite's galley addresses, the JATS XML and the
  sitemap name a galley with no version. An older version's page asks
  robots not to index it.
- **3.4** (code): the same redirect and the same preview check
  (`ArticleHandler.php` lines 156 and 169–170).
- **3.3** (code): the same redirect sits elsewhere, in the loop over
  all published versions inside `if (!$this->galley)`
  (`ArticleHandler.inc.php` lines 160–163, from b30b7f8df0). The
  steps' published addresses are forwarded the same way. An
  unpublished version's galley is never forwarded there: steps 1 and 2
  answer "404 Not Found" because 3.3 has no forwarding for it at all.
- **Not this fault:** a preprint server has no galley ID forwarding
  and answers "404 Not Found" (its own report, spec U13 OPS3); a
  press's `CatalogBookHandler` forwards nothing; issue galleys have no
  versions (`IssueHandler::view()`).

## Proposed fix

Keep the version part whenever the address had one, and keep what
follows the galley, in `ArticleHandler::initialize()`
([fix.diff](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/older-version-galley-id-link-opens-current/fix.diff)):

```diff
--- a/pages/article/ArticleHandler.php
+++ b/pages/article/ArticleHandler.php
@@ -164,7 +164,11 @@
                     // In some cases, a URL to a galley may use the ID when it should use
                     // the urlPath. Redirect to the galley's correct URL.
                 } elseif (ctype_digit($galleyId) && $galley->getId() == $galleyId) {
-                    $request->redirect(null, $request->getRequestedPage(), $request->getRequestedOp(), [$submission->getBestId(), $galley->getBestGalleyId()]);
+                    // Keep the version the URL names, and whatever follows the galley (a file ID).
+                    $redirectArgs = $subPath === 'version'
+                        ? [$submission->getBestId(), 'version', $this->publication->getId(), $galley->getBestGalleyId()]
+                        : [$submission->getBestId(), $galley->getBestGalleyId()];
+                    $request->redirect(null, $request->getRequestedPage(), $request->getRequestedOp(), [...$redirectArgs, ...$args]);
                 }
             }
             // Redirect to the most recent version of the submission if the request
```

`$subPath` is the handler's own record that the address named a
version, and `$this->publication` is that version. `...$args` is how
the article's own redirect, a few lines up, keeps the rest of the
address (`[$currentUrlPath, ...$args]`).

The test is `$subPath === 'version'`, not "the publication is not the
current one", because an address with a version part means that
version, whichever version is current later. The handler serves `…/version/{version ID}/…` for
the current version as it stands, and `urlPublished`, the Crossref
deposit and the Lens reader (`LensGalleyPlugin.php` line 276) build
such addresses for the current version too. Forwarding one of them to
the address without a version would leave the reader, or a client
that saves the address it ends on, on an address that shows another
version once the next one is published.

Tried on OJS `main`:

- Steps 2, 8, 10, 11 and 13 gave the Expected results, and the
  addresses with a file ID kept it (`…/version/1/pdf/12`). An address
  with a file name after the file ID was not tried; the Cause says what
  the code does with it.
- The current version named by its version ID
  (`…/view/mwandenga/version/2/2` before 1.2 is published) now lands
  on `…/version/2/pdf`, the same reader page, with no notice.
- With the fix in and out, on the dataset as loaded, these were
  answered the same: a galley with no URL Path opened by its ID
  (`…/view/17/3`, `…/view/17/version/18/3`, `…/view/1/version/1/1`),
  another article's galley ID (`…/view/17/version/18/1`, "404 Not
  Found"), the unpublished version's galley for a visitor
  (`…/view/1/version/2/2`, `…/view/1/2`, "404 Not Found") and the
  preview's own link for `dbarnes` (`…/view/1/version/2/pdf`).

- **Alternatives.**
  - Testing `$this->publication->getId() !=
    $submission->getData('currentPublicationId')`, as `view()` does for
    its download redirect and `galley_link.tpl` for the links it
    builds. It opens the right version at the time of the request, but
    takes the version part off a current version's address, for the
    reason above. The fix proposed for the
    preprint server's handler in
    [pkp-e2e's OPS2 and OPS3 report](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/issues/U13-OPS2-OPS3-ops-number-address-url-path.md)
    tests `$subPath` as well, so the two handlers end up alike.
  - Taking the redirect out would bring back the "404 Not Found" that
    `pkp/pkp-lib#7138` was filed for.
  - One shared routine in pkp-lib for both handlers would stop the
    copies drifting apart, but it is a refactor that suits
    `pkp/pkp-lib#5932` better than a bug fix.
- **What goes with it.**
  - No stored data changes; only redirects.
  - `stable-3_5_0`: the diff applies as it stands (lines 172–173).
  - `stable-3_4_0`: the same edit on lines 169–170. The comment above
    the `elseif` is indented differently there, so `git apply` refuses
    the diff; `patch` takes it with fuzz, or the two lines are edited
    by hand.
  - 3.3 is outside this diff. Its redirect sits in the loop over all
    published versions, so the galley's version is that loop's
    `$publication`, not `$this->publication`, and PHP 7.3 needs
    `array_merge()` in place of `...`. That change was not written out
    or tried.
  - A regression test would open an older version's galley by its ID
    after the galley was given a URL Path, and expect the version's own
    address under the outdated notice. None comes with the diff.

Small: a few lines in one handler.

## Evidence

- The kept script,
  [walk.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/older-version-galley-id-link-opens-current/walk.js),
  takes steps 1 to 13, the file ID addresses and the controls on OJS;
  [lib.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/older-version-galley-id-link-opens-current/lib.js)
  holds its helpers. Run it on an install freshly loaded from the
  default dataset:
  `PROBE_FEATURE=<feature> PROBE_AGENT=<id> node bin/probe.js ojs shared/playwright/checks/issues/older-version-galley-id-link-opens-current/walk.js`.
  `WALK=neighbour` in front opens instead the addresses the fix must
  leave as they are, on the dataset as loaded. The script reads the
  database only to record the versions' and galleys' IDs; every change
  goes through the screens.
- The fix was tried on `main` with the script in both modes, and the
  `WALK=neighbour` mode again after the fix was reverted. The current
  version by its version ID before 1.2 is published (the Cause's
  reach) was walked without the fix by
  [i23f.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/U49/I23F/i23f.js)
  on `main` and 3.5 the same day, after it published 1.1:
  `…/view/1/version/2/2` was forwarded to `…/view/mwandenga/pdf`.
- Walked on OJS `main` and `stable-3_5_0`, on PostgreSQL; nothing here
  depends on the database (MySQL not checked). Datasets: pkp/datasets
  300c68e (2026-10-22). The 3.5 walk saw the same answers at every
  step and control.
- Every walk recorded page script errors (`MissingPDFException`) on
  the older or unpublished version's PDF reader page (the U13 A2
  fault).
- Tips:

  | Line | OJS | its lib/pkp |
  |---|---|---|
  | `main` | 3cf9aa91a8 | 1f415a07ca |
  | `stable-3_5_0` | 0b1ae35f04 | 5b54f59ed7 |
  | `stable-3_4_0` | 3bedd21383 | not read |
  | `stable-3_3_0` | 06f01c8010 | not read |
- Code reads:
  - `main`: `ArticleHandler::initialize()`, `view()` and `download()`
    (no galley: "404 Not Found"); every use of `getBestGalleyId()` and
    of a `'version'` address part in OJS, its plugins and its pkp-lib
    (the reach's two lists); `ArticleGalleyForm::validate()` (a URL
    Path must be unique within one version, so two versions' galleys
    may share one); OPS `PreprintHandler::initialize()`, OMP
    `CatalogBookHandler` and `IssueHandler::view()` for a twin of the
    redirect (none); the HTML galley and Lens plugins' address
    builders and the Crossref filter's resource addresses (the reach).
  - 3.5: `ArticleHandler.php` lines 159 (the preview check) and
    172–173 are the same lines; `ArticleGalleyGridHandler::canEdit()`
    does not look at the version's status, so a published version's
    galley can be edited; `urlPublished` is built as on `main`; the
    Crossref filter has no DOI versioning and deposits galley addresses
    with no version.
  - 3.4: the same two lines (`ArticleHandler.php` 169–170) in the same
    loop, the same preview check (line 156) and the same `version`
    reading above them.
  - 3.3: `ArticleHandler.inc.php` lines 100–175, as the reach says.
  - 3.4 and 3.3: `ArticleGalleyGridHandler::canEdit()` refuses a
    published version, so the galley gets a URL Path there only before
    publication or after "Unpublish".
- Introduced: `git blame` on lines 166–167 names e6cee7d19d, which
  added the five lines of the redirect and nothing else. GitHub lists
  no PR for it on `main`. `pkp/ojs#3156` merged b30b7f8df0 into
  `stable-3_3_0` (first in tag `3_3_0-8`), with the same two lines in
  the other loop. Every release since carries one of the two. Before
  the change the steps' addresses answered "404 Not Found", hence
  "defect".
- Tracker search (2026-10-07, again 2026-10-23): pkp/pkp-lib, pkp/ojs
  and pkp/ui-library, by the symptom's words (galley, version,
  redirect, URL Path, preview, 404) and by `ArticleHandler`,
  `getBestGalleyId` and the issue number 7138. Nothing matched.
  `pkp/pkp-lib#5932` (open) is about aligning the apps' addresses;
  `pkp/pkp-lib#11633` (closed) about semantic version addresses;
  `pkp/pkp-lib#8992` (closed) about a preview button reaching "404 Not
  Found" through an empty article URL Path, another cause.
- Not driven: the article's ID in place of "mwandenga" in the
  published steps' addresses; the editor's way round (the URL Path
  cleared on the older galley; the code then matches the galley by its
  ID again, and no longer by the URL Path); an HTML galley's embedded
  files and Lens's XML file, so an address with a file name;
  the Crossref deposit and the REST API's `urlPublished`; OPS and OMP
  (no such forwarding); 3.4 and 3.3.
