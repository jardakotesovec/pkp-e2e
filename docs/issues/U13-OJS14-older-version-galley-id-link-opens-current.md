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
- **Upstream** none found (2026-10-07)
- **Tracked in** spec U13 [OJS14](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U13-article-landing-page-and-reading.md#ojs14)
- **Checked** 2026-10-07, each branch's tip (the commits in Evidence)
- **Model** claude-opus-5-5

## Summary

On a journal, an older version's page links each galley by the
version's ID and the galley's ID
("…/article/view/{article}/version/{version ID}/{galley ID}"), as long
as the galley has no URL Path. Once the galley is given a URL Path,
that address stops opening the older version.

The reader lands on the article's page, which shows the current
version. When the current version has a galley with the same URL Path,
the reader lands on that galley instead. Neither page says that the
link named another version, so a reader following a citation or a
bookmark of version 1.0 reads the latest version without being told.
The "Versions" list on the article's page still opens the older
version.

It takes an article with more than one published version, and a URL
Path given to the older version's galley after the address was handed
out. The address that downloads the galley is forwarded the same way,
and so is either address with a file ID at its end. A preprint server
answers "404 Not Found" to such an address, which has its own report,
and a press forwards no addresses.

## Impact

- **Lost.** The version the link names. Nobody on the journal is told.
- **Who.** Whoever holds an address handed out while the galley had no
  URL Path: a reader who copied the "PDF" link from an older version's
  page, a client of the REST API (a galley's `urlPublished`), and, on
  `main` with DOI versioning on, Crossref, which is given such
  addresses as the article's full text. The URL Path then arrives in
  one of two ways. An editor adds it to the older version's galley,
  which the "Galleys" page allows on a published version from 3.5 on.
  Or an editor added it while that version was the current one, and a
  new version has been published since. `pkp/pkp-lib#7138` describes
  journals that give galleys their URL Path only after publication.
- **Way round.** A reader who notices the change of version can open
  the older one from the "Versions" list. An editor can clear the
  galley's "URL Path": the old address works again, and the addresses
  made with the URL Path stop opening the galley.

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

The link, while the galley has no URL Path:

1. Sign in as `dbarnes` and open submission 1, "Signalling Theory
   Dividends": it is listed in the dashboard's "Published" view
   (`/index.php/publicknowledge/en/dashboard/editorial?workflowSubmissionId=1`
   opens it directly). The workflow opens on version 1.1.
2. Press "Publish". In "Review Publishing Details" keep what is
   preselected and press "Confirm", then press "Publish" under "Are you
   sure you want to publish this?". [3.5: "Publish", then "Publish" in
   the window.] Sign out.
3. Open the article
   (`/index.php/publicknowledge/en/article/view/mwandenga`) and, under
   "Versions", press "{date} (Version of Record 1.0)" [3.5: "{date}
   (1)"].
4. Press "PDF". The PDF reader page opens at
   `…/article/view/mwandenga/version/1/1` under "This is an outdated
   version published on {date}. Read the most recent version." Keep
   this address, as a reader who bookmarks or cites it would. (The
   viewer under the notice is empty; that is another fault,
   [pkp-e2e's U13 A2 report](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/issues/U13-A2-older-version-pdf-reader-empty.md).)

The editor gives the older galley a URL Path:

5. Sign in as `dbarnes`, open submission 1 and, in the side menu under
   "Version of Record 1.0", open "Galleys" [3.5: pick version 1 under
   "All Versions", then "Galleys"]. The page warns "This version has
   been published. Editing it may impact the published content."
6. On "PDF", press "More Actions" › "Edit", type `pdf` in "URL Path"
   and press "Save". Sign out.

The kept address, signed out. The current version's galley has the
same URL Path, "pdf":

7. Open `/index.php/publicknowledge/en/article/view/mwandenga/version/1/1`.
8. Open the address that downloads the same galley,
   `/index.php/publicknowledge/en/article/download/mwandenga/version/1/1`.

The current version's galley has another URL Path:

9. Sign in as `dbarnes` and, as in steps 5 and 6, change the same
   galley's "URL Path" to `pdf-v1`. Sign out.
10. Open `/index.php/publicknowledge/en/article/view/mwandenga/version/1/1`
    again.

The current version's galley has no URL Path:

11. Sign in as `dbarnes` and open "Galleys" under "Version of Record
    1.1" [3.5: version 2 under "All Versions"]. On "PDF Version 2",
    press "More Actions" › "Edit", empty "URL Path" and press "Save".
    Sign out.
12. Open `/index.php/publicknowledge/en/article/view/mwandenga/version/1/1`
    again.

**Expected.** Step 7 lands on `…/article/view/mwandenga/version/1/pdf`,
and steps 10 and 12 on `…/version/1/pdf-v1`: version 1.0's PDF reader
page, under "This is an outdated version published on {date}. Read the
most recent version." Step 8 delivers the file from
`…/article/download/mwandenga/version/1/pdf`.

**Observed.** Step 7 lands on the current version's PDF reader page,
titled "View of The The Signalling Theory Dividends Version 2", with no
notice. Step 8 downloads `article.pdf` from the current version's
galley address. Steps 10 and 12 land on the article's page, which shows
version 1.1 with no notice:

```
step 7        GET …/en/article/view/mwandenga/version/1/1       302 → …/en/article/view/mwandenga/pdf        200
step 8        GET …/en/article/download/mwandenga/version/1/1   302 → …/en/article/download/mwandenga/pdf    200
steps 10, 12  GET …/en/article/view/mwandenga/version/1/1       302 → …/en/article/view/mwandenga/pdf-v1
                                                                302 → …/en/article/view/mwandenga            200
```

After step 6, the addresses of steps 7 and 8 with the galley's file ID
at the end (`…/version/1/1/12`, as the PDF reader's "Download" address
ends) are forwarded to the same two places. In the dataset both
versions' galleys hold the same file, so step 8's download does not
differ in content; its address is the current version's galley.

Control: the galley's URL Path address,
`…/article/view/mwandenga/version/1/pdf` (after step 9,
`…/version/1/pdf-v1`), opens version 1.0's PDF reader page, titled
"View of The Signalling Theory Dividends", under the notice.

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
then finds the current version's galley of that URL Path, or, when
there is none, takes the "Redirect to the most recent version" branch
(lines 173–181) to the article's page.

The redirect came with e6cee7d19d for `pkp/pkp-lib#7138`: journals
moving from OJS 2 had galley ID links that stopped at "404 Not Found"
once a URL Path was set, and the ID link "should still be valid". The
change wrote the redirect for the current version only. The versioned
addresses were already in the handler (`pkp/pkp-lib#4870`, 2019).

Reach:

- **`view` and `download`, with or without a file ID** (on screen):
  one line serves both operations.
- **The article's ID in place of its URL Path** (code): the redirect
  comes after the article is found, whichever way it was named.
- **The current version named by its version ID** (on screen):
  `…/view/mwandenga/version/2/2` is forwarded to
  `…/view/mwandenga/pdf`. That is the right galley today, on an
  address that no longer names the version. It becomes the steps' case
  when the next version is published.
- **An editor's preview of an unpublished version** (on screen,
  `main`): on the freshly loaded dataset the article's address still
  ends in "mwandenga-signalling-theory". Signed in as `dbarnes`,
  `…/article/view/1/version/2/2` (the unpublished 1.1's galley by its
  ID) is forwarded to `…/view/mwandenga-signalling-theory/pdf`, which
  answers "404 Not Found"; `…/version/2/pdf` opens the preview's
  reader.
- **The current version's galley by its ID with a file ID** (code):
  the forwarded address loses the file ID, so `download` delivers the
  galley's own file. For a PDF that is the file asked for. For a file
  that belongs to an HTML galley (an image, a stylesheet) it is the
  HTML file instead.
- **Who hands the address out** (code): each of these puts the
  version's ID before the galley, and the galley's ID while it has no
  URL Path. The older version page's galley links
  (`frontend/objects/galley_link.tpl`) do so for an older version. A
  galley's `urlPublished` in the REST API
  (`lib/pkp/classes/galley/maps/Schema.php` lines 130–135) does so for
  every version, the current one included, on `main` and 3.5. So do,
  on `main` with DOI versioning on, the full-text addresses deposited
  at Crossref (`ArticleCrossrefXmlFilter.php` lines 610 and 657).
- **Who does not** (code): the "Versions" list and the DOAJ export
  name a version with no galley. OAI-PMH's Dublin Core, the Google
  Scholar tags, DataCite's galley addresses, the JATS XML and the
  sitemap name a galley with no version. An older version's page asks
  robots not to index it.
- **3.3** (code): the same redirect sits elsewhere, in the loop over
  all published versions inside `if (!$this->galley)`
  (`ArticleHandler.inc.php` lines 160–163, from b30b7f8df0). The
  steps' address is forwarded the same way. An unpublished version's
  galley is never forwarded there.
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
version for good. The handler serves `…/version/{version ID}/…` for
the current version as it stands, and `urlPublished`, the Crossref
deposit and the Lens reader (`LensGalleyPlugin.php` line 276) build
such addresses for the current version too. Forwarding one of them to
the address without a version would leave the reader, or the client
that stores where it ended, on an address that shows another version
after the next one is published.

Tried on OJS `main`:

- Steps 7, 10 and 12 landed on `…/version/1/pdf` and
  `…/version/1/pdf-v1`: version 1.0's PDF reader page, under the
  outdated notice.
- Step 8 delivered `article.pdf` from
  `…/article/download/mwandenga/version/1/pdf`, and the addresses with
  a file ID kept it (`…/version/1/pdf/12`).
- The current version's galley by its ID still went to
  `…/article/view/mwandenga/pdf`. Named by its version ID
  (`…/view/mwandenga/version/2/2`), it now lands on
  `…/version/2/pdf`, the same reader page, with no notice.
- With the fix in and out, on the freshly loaded dataset, these were
  answered the same: a galley with no URL Path opened by its ID
  (`…/view/17/3`, `…/view/17/version/18/3`), another article's
  galley ID (`…/view/17/version/18/1`, "404 Not Found") and the
  unpublished version's galley for a visitor (`…/view/1/version/2/2`,
  `…/view/1/2`, "404 Not Found").
- The editor's preview address `…/view/1/version/2/2` now opens the
  preview's reader page instead of "404 Not Found".

- **Alternatives.**
  - Testing `$this->publication->getId() !=
    $submission->getData('currentPublicationId')`, as `view()` does for
    its download redirect (lines 430–443) and `galley_link.tpl` for the
    links it builds. It opens the right version at the time of the
    request, but takes the version part off a current version's
    address, for the reason above. The fix proposed for the preprint
    server's handler in
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
  - A regression test: an older version's galley opened by its ID
    after the galley was given a URL Path lands on the version's own
    address under the outdated notice. It is planned as a pkp-e2e
    scenario of spec U13; none comes with the diff.

Small: a few lines in one handler.

## Evidence

- The kept script,
  [walk.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/older-version-galley-id-link-opens-current/walk.js),
  takes steps 1 to 12, the file ID addresses and the controls on OJS;
  [lib.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/older-version-galley-id-link-opens-current/lib.js)
  holds its helpers. Run it on an install freshly loaded from the
  default dataset:
  `PROBE_FEATURE=<feature> PROBE_AGENT=<id> node bin/probe.js ojs shared/playwright/checks/issues/older-version-galley-id-link-opens-current/walk.js`.
  `WALK=neighbour` in front takes the neighbour check instead, on a
  freshly loaded dataset with nothing created.
- The fix was tried on `main` with
  `node bin/try-fix.js apply …/fix.diff ojs`, the script in both
  modes, then `revert`. The neighbour check without the fix was run
  once, before the diff's version test was changed to `$subPath`; the
  script and the unpatched code were the same.
- Walked on OJS `main` and `stable-3_5_0`, on PostgreSQL; nothing here
  depends on the database (MySQL not checked). Datasets: pkp/datasets
  a130b9a (2026-10-07). The 3.5 walk saw the same answers at every
  step and control.
- Every walk recorded page script errors (`MissingPDFException`) on
  the older or unpublished version's PDF reader page. They are the
  empty viewer of the U13 A2 report that step 4 names.
- Tips:

  | Line | OJS | its lib/pkp |
  |---|---|---|
  | `main` | 3265fdc673 | f8285b0b8f |
  | `stable-3_5_0` | 6d2a42555d | 6910ca6d8e |
  | `stable-3_4_0` | d68934d0d1 | not read |
  | `stable-3_3_0` | ac77c9fb35 | not read |
- Code reads:
  - `main`: `ArticleHandler::initialize()`, `view()` and `download()`;
    every use of `getBestGalleyId()` and of a `'version'` address part
    in OJS, its plugins and its pkp-lib (the reach's two lists);
    `ArticleGalleyForm::validate()` (a URL Path must be unique within
    one version, so two versions' galleys may share one); OPS
    `PreprintHandler::initialize()`, OMP `CatalogBookHandler` and
    `IssueHandler::view()` for a twin of the redirect (none).
  - 3.5: `ArticleHandler.php` lines 172–173 are the same two lines;
    `ArticleGalleyGridHandler::canEdit()` does not look at the
    version's status, so a published version's galley can be edited;
    `urlPublished` is built as on `main`; the Crossref filter has no
    DOI versioning.
  - 3.4: the same two lines (`ArticleHandler.php` 169–170) in the same
    loop, and the same `version` reading above them.
  - 3.3: `ArticleHandler.inc.php` lines 140–170, as the reach says.
  - 3.4 and 3.3: `ArticleGalleyGridHandler::canEdit()` refuses a
    published version, so the galley gets a URL Path there only before
    publication or after "Unpublish".
- Introduced: `git blame` on lines 166–167 names e6cee7d19d, which
  added the five lines of the redirect and nothing else. GitHub lists
  no PR for it on `main`. `pkp/ojs#3156` merged b30b7f8df0 into
  `stable-3_3_0` (first in tag `3_3_0-8`), with the same two lines in
  the other loop. Every release since carries one of the two. Before
  the change the steps' address answered "404 Not Found", hence
  "defect".
- Tracker search (2026-10-07): pkp/pkp-lib, pkp/ojs and pkp/ui-library,
  by the symptom's words and by `ArticleHandler`, `getBestGalleyId` and
  the issue number 7138. Nothing matched; `pkp/pkp-lib#5932` (open) is
  about aligning the apps' addresses.
- Not driven: the article's ID in place of "mwandenga" in the steps'
  addresses; the editor's way round (the URL Path cleared on the older
  galley; the code then matches the galley by its ID again, and no
  longer by the URL Path); an HTML galley's files; the Crossref deposit
  and the REST API's `urlPublished`; OPS and OMP (no such forwarding);
  3.4 and 3.3.
