# With "eLife Lens Article Viewer" on, an issue's XML galley never opens in the Lens reader

- **Severity** low
- **Effort** small
- **Kind** regression
- **Crash** server
- **Affects**
  - main: OJS
  - 3.5: OJS
  - 3.4: OJS (code; a server error and no file)
  - 3.3: OJS (code; a server error and no file)
- **Introduced** a commit to `asmecher/lensGalley` without a PR, for `pkp/pkp-lib#3242` (the Smarty 3 update) · [7d70165](https://github.com/asmecher/lensGalley/commit/7d701650c6ff4efbb6fc5bdc7f2f64933cb4bf76) · 2018-06-07 · Alec Smecher (asmecher); first released in OJS 3.1.2
- **Upstream** none found (2026-10-07)
- **Tracked in** spec U13 [OJS15](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U13-article-landing-page-and-reading.md#ojs15)
- **Checked** 2026-10-07, each branch's tip (the commits in Evidence)
- **Model** claude-opus-5-5

## Summary

With "eLife Lens Article Viewer" on, an article's XML galley opens in
the Lens reader, but an issue's XML galley does not: the app fails on
the server as the plugin prepares the issue galley's Lens page. The
error is caught and logged, and the file is sent instead: the galley's
link under "Full Issue" on the issue's page downloads it and the browser
stays on the issue's page, as with the plugin off.

The reader gets an XML file to save in place of a page to read. On 3.4
and 3.3 nothing catches the error, so the reader gets a server error and
no file (read in the code, not walked). A journal gets round it by
publishing the full issue as a PDF galley, or on 3.4 and 3.3 by turning
the plugin off.

It concerns journals that publish a full issue as an XML galley; the
plugin is on by default when a journal is created. The Lens reader
showed an issue's XML galley from 2015 until a change to the plugin in
2018 (read in the code, not run), and shows one again with the one-line
fix below (walked).

## Impact

- **Lost.** The on-screen view of the full issue. Nothing tells the
  reader or the journal; each time the link is opened, the failure and
  its stack trace go to the server's error log. On 3.4 and 3.3 (read in
  the code) the file is lost too: the reader gets a server error.
- **Who.** Every reader who opens an XML galley listed under "Full
  Issue" on an issue's page, each time.
- **Way round.** The journal can publish the full issue as a PDF galley,
  which opens in the PDF reader. On 3.4 and 3.3 (read in the code)
  turning the plugin off gives the download back, at the cost of the
  Lens reader for articles' XML galleys.

Low, as walked on `main` and 3.5: the file still arrives, as with the
plugin off, and a full issue published as one XML file is a rare setup.
On 3.4 and 3.3 the code gives a server error and no file, which would be
medium there: a published file that cannot be downloaded, in that rare
setup, until the journal turns the plugin off. That is a code read, so
it does not set the label; a walk on 3.4 would.

## Steps to reproduce

Preconditions:

- PKP's default test dataset, OJS `main` (journal `publicknowledge`;
  "eLife Lens Article Viewer" and "PDF.JS PDF Viewer" are on there, and
  its issue "Vol. 1 No. 2 (2014)" is published and has no issue galley).
- Any PDF file, and a JATS file `issue.xml`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<article xmlns:xlink="http://www.w3.org/1999/xlink" article-type="research-article">
  <front>
    <journal-meta>
      <journal-title-group><journal-title>Journal of Public Knowledge</journal-title></journal-title-group>
      <publisher><publisher-name>Public Knowledge Project</publisher-name></publisher>
    </journal-meta>
    <article-meta>
      <title-group>
        <article-title>The whole issue in one file</article-title>
      </title-group>
      <abstract><p>Every article of the issue, as one JATS file.</p></abstract>
    </article-meta>
  </front>
  <body>
    <sec id="s1">
      <title>First article</title>
      <p>The text of the first article.</p>
    </sec>
  </body>
</article>
```

1. Sign in as `dbarnes`.
2. Open "Issues", then the "Back Issues" tab. On "Vol. 1 No. 2 (2014)"
   press the arrow, then "Edit", then the "Issue Galleys" tab.
3. Press "Create Issue Galley". Under "Issue Galley" upload `issue.xml`,
   type "XML" as the "Galley Label", keep "English" as the "Language"
   and press "Save".
4. Press "Create Issue Galley" again and add the PDF the same way, with
   "PDF" as the "Galley Label".
5. Sign out. Open the issue's page
   (`/index.php/publicknowledge/issue/view/1`).
6. Under "Full Issue" press "XML".

**Expected.** The browser opens the galley's page
(`/index.php/publicknowledge/en/issue/view/1/1`) and the Lens reader
lays the file out there: "The whole issue in one file", its "Abstract"
and "First article", beside the reader's "Contents" and "Info" tabs.

**Observed.** The browser downloads `issue.xml` and stays on the issue's
page. The galley's address answers a redirect to the download:

```
GET /index.php/publicknowledge/en/issue/view/1/1      302  Location: /index.php/publicknowledge/en/issue/download/1/1
GET /index.php/publicknowledge/en/issue/download/1/1  200  Content-Disposition: attachment; filename="issue.xml"
```

The server log, when the link is pressed:

```
Plugin APP\plugins\generic\lensGalley\LensGalleyPlugin failed to handle the hook IssueHandler::view::galley
TypeError: PKP\template\PKPTemplateManager::smartyPathToViewName(): Argument #1 ($template) must be of type string, null given, called in …/lib/pkp/classes/core/blade/SmartyTemplate.php on line 78 and defined in …/lib/pkp/classes/template/PKPTemplateManager.php:1503
```

[3.5: the second line reads ` --> Smarty: Source: Missing  name <-- `.]

[3.4 and 3.3, read in the code: no redirect and no download; the request
ends in an uncaught `SmartyException`, "Source: Missing  name".]

Control: under "Full Issue", "PDF" opens the PDF reader page "View of
Vol. 1 No. 2 (2014)". An article's XML galley opens in the Lens reader.

## Cause

`LensGalleyPlugin::issueCallback()`
(`plugins/generic/lensGalley/LensGalleyPlugin.php`), hooked on
`IssueHandler::view::galley`, assigns the reader's template to
`displayTemplatePath` (line 142) and displays `templates/issueGalley.tpl`.
Line 14 of that template includes another variable,
`{include file=$displayTemplateResource xmlUrl=$xmlUrl}`, which nothing
assigns for an XML galley.

The article callback and its template use one name:
`articleCallback()` assigns `displayTemplatePath` and
`articleGalley.tpl` includes `$displayTemplatePath`.

Including a template whose name is null throws. On `main`,
`PKPTemplateManager::smartyPathToViewName()` refuses the null (the
`TypeError` above). On 3.5, Smarty throws "Source: Missing name".

`Hook::run()` catches an exception thrown from a plugin's callback, logs
it and goes on as if the plugin had not handled the hook
(`pkp/pkp-lib#10514`). So `IssueHandler::view()` takes its fallback, the
redirect to `issue/download`.

The two names date from the plugin's Smarty 3 update, 7d70165. Since
125a027 (2015), which added issue galleys to the plugin, the callback
had assigned `pluginTemplatePath` and the template had included
`"$pluginTemplatePath/display.tpl"`. The update replaced that with an
assigned template resource, named `displayTemplatePath` in the PHP and
`displayTemplateResource` in `issueGalley.tpl`. A month later 3448273
moved `articleGalley.tpl` to `$displayTemplatePath`; the issue template
was not touched again.

Reach, each item marked as seen on screen or read in the code:

- `issueCallback()` is the only code that displays `issueGalley.tpl`
  (code). Article XML galleys are not affected (on screen).
- PDF issue galleys go through `PdfJsViewerPlugin::issueCallback()`,
  which displays its own `display.tpl` directly (on screen). It assigns
  a `displayTemplateResource` too, but only for a PDF galley, and no
  template reads it (code).
- 3.4 and 3.3 carry the same two lines and Smarty 4.3.1, whose
  `Smarty_Template_Source::load()` throws `SmartyException('Source:
  Missing  name')` for an empty name. The hook runner there
  (`Hook::run()`; 3.3: `HookRegistry::call()`) has no catch, and neither
  has anything between `issueCallback()` and `index.php`. So
  `IssueHandler::view()` never reaches its redirect, and the request
  ends in an uncaught exception: a server error and no file (code; not
  walked).
- OMP and OPS have no issue galleys and ship no Lens reader (code).
- No stored data is involved.

## Proposed fix

A proposal; the team decides. Recommended: make
`plugins/generic/lensGalley/templates/issueGalley.tpl` include the
variable its callback assigns, as `articleGalley.tpl` does
([fix.diff](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/issue-xml-galley-downloads-not-lens/fix.diff)):

```diff
 	{capture assign="xmlUrl"}{url op="download" path=$issue->getBestIssueId($currentJournal)|to_array:$galley->getBestGalleyId($currentJournal) escape=false}{/capture}
-	{include file=$displayTemplateResource xmlUrl=$xmlUrl}
+	{include file=$displayTemplatePath xmlUrl=$xmlUrl}
 </div>
```

The fix was tried on `main`. With it, the walk showed the Steps'
Expected: "XML" opened `/index.php/publicknowledge/en/issue/view/1/1`,
the Lens reader laid `issue.xml` out, and the server log stayed empty.
Three neighbouring cases behaved the same with the fix in and out: an
issue galley that is a text file downloads, an article's XML galley
opens in the Lens reader, and with the plugin off the issue's XML
galley downloads.

The change keeps what the Smarty 3 update was for, a template resource
handed to the include.

Once the page renders, it logs the script error an article galley's
Lens page logs ("Cannot read properties of undefined (reading
'Queue')"). That is a separate fault with its own report,
https://github.com/jardakotesovec/pkp-e2e/issues/221.

**Alternatives**

- Assign `displayTemplateResource` in both callbacks and include it in
  both templates, the name the PDF viewer plugin assigns. Three edits
  for the same result, and it touches the article path, which works.
- Drop issue galleys from the plugin (the hook and `issueGalley.tpl`),
  if a full issue in the Lens reader is no longer wanted. The XML
  galley would then download by design, without the logged failure.
  That is a product decision.

**What goes with it**

- Every other instance: no other include is broken. The other templates
  in the three apps that include a template named by a variable get the
  name from their callers, or set it themselves with `{assign}` on the
  line above (the URN plugin's `urnAssign.tpl` and `urnSuffixEdit.tpl`).
  The COUNTER report plugin's `sushixml.tpl` includes a `$templatePath`
  nothing assigns, but no code displays that template; it is dead code,
  which this fix does not touch.
- Where it applies: `fix.diff` is written from the OJS root. The fix is
  committed in the plugin's own repository, `asmecher/lensGalley`, where
  the diff needs its path prefix stripped (`git apply -p4`).
- Backport: `issueGalley.tpl` is the same file on the plugin's `main`,
  `stable-3_5_0`, `stable-3_4_0` and `stable-3_3_0` branches, so the
  diff applies to each. Each OJS line then needs a submodule update.
- No data repair; no API, hook or other screen changes.
- Test: none comes with the diff. A pkp-e2e scenario that opens an
  issue's XML galley and finds the Lens reader's page is planned (spec
  U13).

Small: one line in one template of the plugin, following its article
twin, tried on `main`.

## Evidence

- Kept script, which takes the Steps through the screens on an install
  freshly loaded from PKP's default test dataset (pkp/datasets a130b9a,
  2026-10-07, the `main` and `stable-3_5_0` PostgreSQL dumps):
  [`shared/playwright/checks/issues/issue-xml-galley-downloads-not-lens/walk.js`](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/issue-xml-galley-downloads-not-lens/walk.js),
  with `lib.js` and `issue.xml` beside it. Run it with
  `PROBE_FEATURE=<feature> PROBE_AGENT=<id> node bin/probe.js ojs shared/playwright/checks/issues/issue-xml-galley-downloads-not-lens/walk.js`
  (`PKP_E2E_LINE=stable-3_5_0` in front for 3.5).
- The same script with `neighbour` as its argument is the check of the
  fix's reach: a "Text" issue galley, an XML galley added to submission
  1's version 1.1 and published (helpers of
  `../lens-formulas-not-typeset/lib.js` and
  `../older-version-pdf-reader-empty/lib.js`), and the issue's "XML"
  with "eLife Lens Article Viewer" unticked in Settings › Website ›
  "Plugins". The fix was tried with
  `node bin/try-fix.js apply <fix.diff> ojs`, both modes run, then
  reverted.
- Branch tips: OJS `main` 3265fdc673 (2026-10-07), pkp-lib f8285b0b8f,
  lensGalley 6a6e32b; OJS `stable-3_5_0` 6d2a42555d (2026-10-07), pkp-lib
  6910ca6d8e, lensGalley 49bff9d; OJS `stable-3_4_0` d68934d0d1
  (2026-10-02), pkp-lib 767353f4fe, lensGalley 4ad64a5; OJS
  `stable-3_3_0` ac77c9fb35 (2026-10-01), pkp-lib ac3fa73402, lensGalley
  abc76d1.
- 3.5 (walked, and read): the same Steps on the same screens, with the
  same download, redirect and first log line; the second log line is
  Smarty's. `issueGalley.tpl` there is byte-identical to `main`'s,
  `LensGalleyPlugin.php` assigns `displayTemplatePath` and `Hook::run()`
  has the catch. An article's XML galley opened in the Lens reader there
  too.
- 3.4 (code): at 4ad64a5 `issueGalley.tpl` line 14 and the two
  `'displayTemplatePath'` assignments are the same;
  `classes/plugins/Hook.php` on pkp-lib `stable-3_4_0` calls each
  callback without a `try`; `IssueHandler::view()` is the same call and
  fallback. For the outcome: `composer.lock` pins smarty/smarty v4.3.1;
  its `smarty_template_source.php` line 168 throws for an empty name,
  and `Smarty_Internal_TemplateBase::_execute()` empties the output
  buffers and throws it on; `PKPTemplateManager`, `PKPRouter`,
  `PKPPageRouter`, `Dispatcher`, `PKPApplication::execute()` and
  `index.php` have no `try` around the call, and pkp-lib sets no
  exception handler.
- 3.3 (code): at abc76d1 the same line 14, and `LensGalleyPlugin.inc.php`
  assigns `displayTemplatePath` twice; `HookRegistry::call()` has no
  `try`; `pages/issue/IssueHandler.inc.php` has the same call and
  fallback. The outcome was read as for 3.4, in the `.inc.php` files:
  the same Smarty version and throw, no `try` and no exception handler.
- Introduced: `git blame` on `templates/issueGalley.tpl` line 14 gives
  7d70165 ("pkp/pkp-lib#3242 Update for Smarty3"), which changed the
  line from `{include file="$pluginTemplatePath/display.tpl" …}` and the
  PHP from `'pluginTemplatePath' => $this->getTemplatePath()` to
  `'displayTemplatePath' => $this->getTemplateResource('display.tpl')`.
  GitHub lists no PR for the commit. OJS took it in the submodule
  update
  [feb629ff0b](https://github.com/pkp/ojs/commit/feb629ff0b835dbe13c5d6f834c523c6b6cc8a4c)
  (2018-06-07); the oldest tag holding that is `3_1_2-0`. Before it:
  125a027 (2015-08-10, "Rewrite lens plugin display to support issue
  galleys too") added the hook and the template, and the parent of
  7d70165 assigns and includes `pluginTemplatePath` consistently.
- Upstream search (2026-10-07), issues and PRs, open and closed:
  pkp/pkp-lib, pkp/ojs, pkp/ui-library and asmecher/lensGalley, by the
  symptom's words ("lens issue galley", "full issue XML galley
  download") and by `displayTemplateResource` and `issueGalley`.
- Every-instance search: `include file=$<name>` in every `.tpl` and
  `.blade.php` under the three apps' `plugins/`, `templates/` and
  `lib/pkp/{plugins,templates}`, each hit's variable traced to an
  assignment.
- Driven in Chromium; PostgreSQL, and the fault does not depend on the
  database.
- Not driven: 3.4 and 3.3. Their outcome, a server error and no file,
  is the code read above; what the error page shows was not seen.
- Unverified: that the issue galley's Lens page worked before 7d70165
  (read in the code of its parent commit, not run).
