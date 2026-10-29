# A site announcement with a picture takes down the site's home and Announcements pages and a press's home page

- **Severity** high
- **Effort** small
- **Kind** regression
- **Crash** server
- **Affects**
  - main: OJS, OMP, OPS
  - 3.5: OJS, OMP, OPS
  - 3.4: none (code)
  - 3.3: none (code; no announcement picture)
- **Introduced** `pkp/pkp-lib#10382` for `pkp/pkp-lib#10328` · [c9cda06979](https://github.com/pkp/pkp-lib/commit/c9cda06979e415401d2b420fcdf86957349d7dba) · 2024-09-30 · Vitalii Bezsheiko (Vitaliy-1)
- **Upstream** none found (2026-10-29)
- **Tracked in** spec U12 [A22](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U12-announcements.md#a22)
- **Checked** 2026-10-29, each branch's tip (the commits in Evidence)
- **Model** claude-opus-5-5

## Summary

On a site that hosts two or more presses or preprint servers, a site
announcement with a picture makes the site's home page, the site's
Announcements page and the announcement's own page fail with a server
error and a blank page. The home page fails while that announcement is
the newest. Visitors meet it, and so does the Site Administrator, who
lands on the site's home page after signing in. A press whose own
announcements are off, as on a new press, shows the site's announcements
on its home page, so that page fails too.

On a site that hosts journals the pages open, but the picture's address
answers "not found", so no picture shows.

Deleting the announcement, or adding it again without a picture, brings
the pages back. The announcement list in Site Settings shows no
pictures, so nothing there points to the cause.

## Impact

- **Lost:** those pages, for every visitor, until the announcement
  goes, and nobody is told why. On a journal site, only the picture.
- **Who:** every OMP or OPS install with two or more presses or
  servers that turns the site's announcements on and gives one a
  picture. Site Settings offers the "Announcements" tab only on a site
  with a second journal, press or server, and with a single one the
  site's home page sends visitors to it, so an install with one press,
  server or journal cannot add a site announcement and is safe (code).
  A preprint server's own home page shows only the server's
  announcements and stays up.
- **Way round:** a newer announcement without a picture brings the
  site's home page back, but not the Announcements page. Removing only
  the picture ("Edit", "Remove", "Save") fails with a server error on a
  press or a preprint server
  ([pkp-e2e#771](https://github.com/jardakotesovec/pkp-e2e/issues/771)).
  A press takes the site's block off its home page by turning its own
  announcements on with a number under "Display on Homepage"
  ([pkp-e2e#764](https://github.com/jardakotesovec/pkp-e2e/issues/764)).
  A journal site has no way to show the picture.

High for presses and preprint servers, whose public pages fail for
every visitor in an ordinary multi-context setup; the journal-site half
alone, a missing picture, would be low.

## Steps to reproduce

Preconditions:

- PKP's default test dataset for `main`. It hosts one journal, press or
  server (`publicknowledge`), and the site's announcements are off.
- A picture on the computer, a PNG named `photo.png`.

1. Sign in as `admin`.
2. Administration › Hosted Journals › "Create Journal" (OMP "Hosted
   Presses" › "Create Press", OPS "Hosted Servers" › "Create Server"):
   name `h29d Second`, initials `H29D`, contact `h29d Second`,
   `h29dsecond@mailinator.com`, country Canada, path `h29dsecond`,
   English; tick "Enable this journal to appear publicly on the site"
   (OMP "… press …", OPS "… preprint server …"); "Save". The Site
   Settings show their "Announcements" tab once the site hosts a second
   journal, press or server; left disabled, it does not count for the
   site's home page, which then sends visitors to `publicknowledge`.
3. Administration › Site Settings › "Announcements" › "Settings": tick
   "Enable announcements", enter `3` in "Display on Homepage", "Save".
4. Reload, open "Announcements" › the "Announcements" side tab, and
   press "Add Announcement": Title `h29d Site notice`; under "Image"
   "Upload File" › `photo.png`; "Save". Its "View" link reads
   `…/announcement/view/1` on the dataset.
5. Sign out.
6. Open the site's home page, `/index.php/index`.
7. Open the site's Announcements page, `/index.php/index/announcement`.
8. Open the announcement's page, `/index.php/index/announcement/view/1`.
9. Open the press's home page, `/index.php/publicknowledge` (OMP).
10. Open `/index.php/index/login` and sign in as `admin`.

**Expected:** steps 6 to 8 show "h29d Site notice" with its picture,
step 9 shows the press's home page, and step 10 lands on the site's home
page.

**Observed:** on OMP and OPS, steps 6, 7 and 8 answer 500 with an empty
page, and so does the site's home page step 10 lands on. On OMP step 9
answers 500 as well. Each logs:

```
PHP Fatal error:  Uncaught TypeError: APP\file\PublicFileManager::getContextFilesPath(): Argument #1 ($contextId) must be of type int, null given, called in …/lib/pkp/classes/announcement/Announcement.php on line 277 and defined in …/classes/file/PublicFileManager.php:27
```

On OJS steps 6 to 8 open and print the announcement, but its picture
as `<img src="/public/journals/0/announcements/1.png?…" alt="">`, which
answers 404, so no picture shows. The file is where the save put it,
`public/site/announcements/1.png`.

Control: a site announcement without a picture opens on all three apps.
Added as the newest, it brings the site's home page back, since the
home page prints only its newest announcement in full and the others as
titles; the site's Announcements page, which prints each in full, still
answers 500 on OMP and OPS.

## Cause

The public pages print a picture with `{$announcement->imageUrl}`
(`announcement_summary.tpl`, `announcement_full.tpl` in pkp-lib). The
`imageUrl()` accessor of `PKP\announcement\Announcement`
(`classes/announcement/Announcement.php`, lines 276 to 278) picks the
folder like this:

```php
$this->hasAttribute('assocId')
    ? $publicFileManager->getContextFilesPath($this->getAttribute('assocId'))
    : $publicFileManager->getSiteFilesPath(),
```

Eloquent's `hasAttribute()` does not say whether a value is set. It is
true for any key in the model's casts, and `ModelWithSettings` adds a
cast for every property of the announcement schema, `assocId` among
them. So the test is true for a site announcement too, whose `assocId`
is `null`, and the site's folder is never chosen.
`getContextFilesPath(null)` follows: OMP's and OPS's
`PublicFileManager` declare `int $contextId` and throw the `TypeError`,
which ends the page; OJS's casts it to `0` and returns
`public/journals/0`, a folder that does not exist.

The same accessor opens with `if (!$this->hasAttribute('image'))`, the
same test, so it never returns `''` for an announcement without a
picture. The templates print the picture only when `image` is set, so no
page reaches that branch today.

The folder test came with the Eloquent rewrite of announcements
(c9cda06979, `pkp/pkp-lib#10382`). In 3.4, `Announcement::getImageUrl()`
tested `getAssocId()` and used `getSiteFilesPath()` for the site. The
code that stores the picture, `Announcement::storeTemporaryFile()`, still
tests the value (`if ($assocId = $this->assocId)`), so the file lands in
the site's folder while the pages look for it elsewhere.

Reach:

- A press's home page. OMP's `pages/index/IndexHandler.php` line 69
  calls `$this->_setupAnnouncements($journal ?? $request->getSite(), $templateMgr)`
  with a `$journal` OMP never defines, so the site's announcements are
  assigned for every press, and `_displayPressIndexPage()` replaces them
  only when the press's own announcements are on with a number under
  "Display on Homepage"
  ([pkp-e2e#764](https://github.com/jardakotesovec/pkp-e2e/issues/764)).
  The newest is printed with its picture (on screen, OMP). OPS's and
  OJS's `IndexHandler` pass the `$server` and `$journal` they define, so
  a server's and a journal's home page show only their own and stay up
  (on screen).
- `Announcement::deleteImage()` makes the same folder test, so the
  site's "Remove" then "Save" fails on OMP and OPS. That is part of
  [pkp-e2e#771](https://github.com/jardakotesovec/pkp-e2e/issues/771),
  whose fix already changes it (code).

## Proposed fix

In `Announcement::imageUrl()`, test the values, as
`storeTemporaryFile()` does
([fix.diff](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/site-announcement-picture-breaks-site-pages/fix.diff)):

```diff
-                if (!$this->hasAttribute('image')) {
+                // hasAttribute() is true for every schema property, set or not: test the values
+                $image = $this->getAttribute('image');
+                if (!isset($image->uploadName)) {
                     return '';
                 }
-                $image = $this->getAttribute('image');
 …
-                    $this->hasAttribute('assocId')
-                        ? $publicFileManager->getContextFilesPath($this->getAttribute('assocId'))
+                    // As storeTemporaryFile() does: a site announcement has no assocId
+                    $this->assocId
+                        ? $publicFileManager->getContextFilesPath($this->assocId)
                         : $publicFileManager->getSiteFilesPath(),
```

The fix belongs in the model, the one place that builds the address,
so every page and theme that prints `imageUrl` is covered.
`hasAttribute()` is used nowhere else in pkp-lib's classes but in
`deleteImage()`, which the fix for pkp-e2e#771 changes. The two fixes
touch different methods: either can land alone, and both diffs apply
together. The diff's paths start at the app root (`a/lib/pkp/…`), so in
a pkp-lib checkout it applies with `git apply -p3`; on 3.5 its hunks
land one line lower.

Tried on `main` in all three apps: the Steps then showed the Expected,
with nothing in the server log. As a neighbour check, a journal's,
press's and server's own announcement with a picture, as `rvaca`, still
showed its picture from the context's folder on its home page,
Announcements page and own page, with the fix in and out.

**Alternatives:**

- Accept `null` in OMP's and OPS's `getContextFilesPath()`. This would
  stop the crash but print the wrong folder, as on OJS.
- Check `assocId` in the templates. Every theme would have to repeat
  it, and the address would still be wrong for any other caller.

**What goes with it:**

- The guard: an e2e scenario in U12 (a Planned item): a site
  announcement with a picture, the newest of the site's, and the site's
  home page, Announcements page and the announcement's page showing the
  picture, signed out and after signing in as the Site Administrator.
  Or a unit test of `imageUrl` for a site and a context announcement.
- No data repair: the files are already in the site's folder.
- 3.4 and 3.3 need nothing.

Small: two conditions in one method, tried, plus the test.

## Evidence

- Kept script:
  [walk.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/site-announcement-picture-breaks-site-pages/walk.js)
  (helpers in `lib.js` and the picture beside it), run on an install
  freshly loaded with the default dataset:
  `node bin/probe.js all shared/playwright/checks/issues/site-announcement-picture-breaks-site-pages/walk.js`.
  It records each page's answer, the pictures it printed and the answer
  to each picture request, and the server log lines of each step; the
  Control follows the Steps. `MODE=neighbour` runs the neighbour check.
  It opens Administration's pages by their addresses rather than
  through the menu.
- 2026-10-29, on PostgreSQL with pkp/datasets 2f0edb08 (2026-10-28): the
  Steps and the Control walked on `main` and `stable-3_5_0`, OJS, OMP and
  OPS; on 3.5 the log names line 278.
- Tips: `main` OJS 7705b2aeb8, OMP 3583c1bfd, OPS 815fbaad1b (lib/pkp
  df42984b46 in all three); `stable-3_5_0` OJS 851416bc2d, OMP 50b83d1e6,
  OPS bd0ef09fd6 (lib/pkp a6ed3df00a); read in the code, lib/pkp
  `stable-3_4_0` cbf5446d1b and `stable-3_3_0` fc94a53416, whose
  announcement schema has no image.
- OMP's and OPS's `getContextFilesPath()` are typed `int` since
  16703bcda8 and 4e0c352b85 (2024-07), before the rewrite, so both have
  crashed since c9cda06979. That commit is the accessor's first version,
  and `ModelWithSettings` merged the schema's casts in the same commit.
- The single-context case (Who) is read in the code, not walked:
  `AdminHandler` shows the site's "Announcements" tab only when the
  context count is not 1, and `PKPHandler::getTargetContext()` sends the
  site's home page to the only enabled context.
- MySQL not checked; the fault does not depend on the database.
