# A logo, thumbnail, homepage image or favicon replaced by another file type stays online at its old address

- **Severity** low
- **Effort** small
- **Kind** defect
- **Affects**
  - main: OJS, OMP, OPS
  - 3.5: OJS, OMP, OPS
  - 3.4: OJS, OMP, OPS (code)
  - 3.3: OJS, OMP, OPS (code)
- **Introduced** not traced; present since at least [60b6071632](https://github.com/pkp/pkp-lib/commit/60b60716324cbbcb494dbf792d6989e2dc99c631) (2013-01-30)
- **Upstream** none found (2026-10-23)
- **Tracked in** spec U10 [A22](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U10-appearance-and-theming.md#a22)
- **Checked** 2026-10-23, each branch's tip (the commits in Evidence)
- **Model** claude-opus-5-5

## Summary

A manager replaces the journal's "Logo", "Journal thumbnail" or
"Homepage Image" (Settings › Website › "Appearance" › "Setup"), or its
"Favicon" ("Appearance" › "Advanced"), with a picture of another file
type. They press "Remove" under the PNG there, upload a JPEG (a GIF
for the favicon) and press "Save", which answers "Saved".

The upload field shows the new picture, and the public header shows
the new logo. But the old PNG stays in the journal's public files and
still opens at its old address, for anyone, signed in or not. The
site administrator's "Logo" (Administration › Site Settings ›
"Appearance" › "Setup") behaves the same way.

Nothing on screen shows that the old picture is still there, and no
screen can delete it. A new picture of the same file type overwrites
the old file, so nothing is left behind, and "Remove" with nothing
uploaded in its place deletes the logo's file.

## Impact

- **Lost:** nothing on any page. The journal [press, server] loses
  control of a picture it took down: a replaced logo, or a homepage
  photo that may show people, stays public at an address anyone can
  work out (`/public/journals/<id>/pageHeaderLogoImage_<locale>.png`;
  a press's under `/public/presses/<id>/`, a server's under
  `/public/contexts/<id>/`, the site's under `/public/site/`). Once
  the picture is replaced, no page, feed, sitemap or email the apps
  produce links to the old address (read in the code); copies kept by
  search engines or other crawlers were not checked.
- **Who:** the journal, press or server, and anyone shown in the old
  picture. It happens when a manager changes a picture's file type on
  "Appearance", or the site administrator changes the site's logo.
  Taking a logo down with "Remove" alone deletes its file (walked); the
  code removes a homepage image or favicon the same way.
- **Way round:** upload a stand-in picture of the old file type, save,
  then upload the picture wanted. The stand-in is saved under the old
  file's name, so the old address serves the stand-in. The same steps
  cover a picture already left behind. Only the server's administrator
  can delete the files.

Low: the old picture reaches only someone who already has or works out
its address, and a manager who wants a picture gone can remove it
outright or cover it with a stand-in. It would be medium if a page or
feed went on linking the old address.

## Steps to reproduce

Preconditions:

- PKP's default test dataset for `main` (OJS, OMP or OPS), freshly
  loaded. Its journal [press, server] has no logo, thumbnail, homepage
  image or favicon, and works in English and French.
- On your computer: `q23e-picture.png` (a PNG), `q23e-picture.jpg` (a
  JPEG) and `q23e-picture.gif` (a GIF; "Favicon" takes only icons,
  PNGs and GIFs).

The journal's [press's, server's] pictures:

1. Sign in as `rvaca` (password `rvacarvaca`), the Journal manager
   [OMP: Press manager; OPS: Preprint Server manager].
2. Go to Settings › Website, open the "Appearance" tab, then its
   "Setup" tab.
3. Under "Logo", "Journal thumbnail" [OMP: "Press thumbnail"; OPS:
   "Server thumbnail"] and "Homepage Image", press "Upload File" and
   choose `q23e-picture.png`. Press "Save".
4. Open the "Advanced" tab. Under "Favicon", press "Upload File" and
   choose `q23e-picture.png`. Press "Save".
5. Reload the page. On "Setup" and "Advanced", right-click the picture
   each upload field shows and copy its image address:
   `…/public/journals/1/pageHeaderLogoImage_en.png`,
   `…/journalThumbnail_en.png`, `…/homepageImage_en.png` and
   `…/favicon_en.png`, each with a `?<number>` suffix (OMP
   `…/public/presses/1/…`, `pressThumbnail_en.png`; OPS
   `…/public/contexts/1/…`, `serverThumbnail_en.png`).
6. On "Setup", under each of the three fields press "Remove", then
   "Upload File" and choose `q23e-picture.jpg`. Press "Save".
7. On "Advanced", under "Favicon" press "Remove", then "Upload File"
   and choose `q23e-picture.gif`. Press "Save".
8. Reload the page. The fields show the new pictures
   (`…pageHeaderLogoImage_en.jpg`, `…favicon_en.gif`), and the
   journal's home page shows the new logo in its header.
9. Sign out and open the four addresses copied in step 5.

**Expected:** each address answers "404 Not Found": the replaced
pictures are gone.

**Observed:** each answers 200 `image/png` with the old picture. Both
saves show "Saved"; the public files folder holds the four `.png`
files beside the three `.jpg` and the `.gif`.

The site's logo (the site's "Appearance" tab shows only on a site with
more than one journal [press, server]):

1. Sign in as `admin` (password `admin`).
2. Go to Administration › Hosted Journals [Hosted Presses; Hosted
   Servers] › "Create Journal" ["Create Press"; "Create Server"]. Enter
   the name `hkq23e second journal`, the initials `hkq23e`, a contact
   name and email, the country Canada and the path `hkq23e`. Under
   "Languages" tick English, and choose English as "Primary locale".
   Tick "Enable this journal to appear publicly on the site" ["Enable
   this press …"; "Enable this preprint server …"]. Press "Save".
3. Go to Administration › Site Settings, open the "Appearance" tab,
   then its "Setup" tab. Under "Logo", press "Upload File" and choose
   `q23e-picture.png`. Press "Save".
4. Reload the page, right-click the picture the "Logo" field shows and
   copy its image address (`…/public/site/pageHeaderTitleImage_en.png?<number>`).
5. Under "Logo", press "Remove", then "Upload File" and choose
   `q23e-picture.jpg`. Press "Save".
6. Sign out and open the address copied in step 4.

**Expected:** "404 Not Found".

**Observed:** 200 `image/png` with the old picture.

## Cause

`PKPContextService::_saveFileParam()` in pkp-lib
(`classes/services/PKPContextService.php`, lines 888–939) saves each
picture of a journal, press or server. It deletes the stored file in
one case only, when the form sends `null` for the field (lines
893–901). For an upload it hands the temporary file to
`moveTemporaryFile()` (line 909), which names the new file
`<setting>_<locale><extension>` with the extension of the new file's
own type (lines 829 and 836) and copies it into the public folder. The
stored file is never looked at.

"Remove" then "Upload File" in one save sends only the new temporary
file, not a `null`, so the "Remove" deletes nothing either. Because the
name carries the extension, a file of another type gets a name of its
own, and the old file stays beside it, no longer named by any setting.

`PKPSiteService::_saveFileParam()` (`classes/services/PKPSiteService.php`,
lines 310–360) does the same for the site's logo, and
`moveTemporaryFile()` there names the file the same way (lines 273
and 280).

Reach:

- "Logo", "Homepage Image" and "Favicon": `PKPContextService::edit()`
  passes the stored context to `_saveFileParam()`, so the stored file
  name is at hand there. Seen in the walk on all three apps.
- The thumbnail: each app's `ContextService::afterEditContext()` saves
  it through the same method, and it is left behind the same way (seen
  in the walk). `afterEditContext()` passes `$newContext`, which
  already holds the submitted value, so `_saveFileParam()` cannot read
  the stored file name there. That is the defect of
  [pkp-e2e#1020](https://github.com/jardakotesovec/pkp-e2e/issues/1020),
  whose fix passes the stored context; the fix below covers the
  thumbnail only together with that one (tried).
- The site's "Logo": seen in the walk on all three apps. The style
  sheets (journal and site) are always saved as `….css`, so a new one
  always overwrites the old (read in the code).
- Two other uploads, with code of their own, leave the old file the
  same way (read in the code, not walked): an OJS issue's cover image
  (`IssueForm::execute()` in OJS `controllers/grid/issues/form/IssueForm.php`,
  line 298, writes `cover_issue_<id>_<locale><extension>` and never
  removes the stored one), and a publication's cover image
  (`publication\Repository::_saveFileParam()`), whose old file may
  still belong to an earlier version of the same submission.
- An announcement's picture is left behind on replacement by a
  separate fault with its own report
  ([pkp-e2e#771](https://github.com/jardakotesovec/pkp-e2e/issues/771)).

## Proposed fix

In both `_saveFileParam()` methods, once the new file is in place,
remove the stored file when its name differs from the new one
([fix.diff](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/replaced-picture-other-type-stays-public/fix.diff),
to apply at an app's root with `patch -p1`):

```diff
--- a/lib/pkp/classes/services/PKPContextService.php
+++ b/lib/pkp/classes/services/PKPContextService.php
@@ -909,6 +909,12 @@
         $fileName = $this->moveTemporaryFile($context, $temporaryFile, $settingName, $user, $localeKey, $isImage, $extension);
 
         if ($fileName) {
+            // The new file replaces the stored one: remove the stored file unless the new one took its name
+            $storedFileName = $context->getData($settingName, $localeKey)['uploadName'] ?? null;
+            if ($storedFileName && $storedFileName !== $fileName) {
+                (new PublicFileManager())->removeContextFile($context->getId(), $storedFileName);
+            }
+
             // Get the details for image uploads
             if ($isImage) {
                 $publicFileManager = new PublicFileManager();
```

`PKPSiteService::_saveFileParam()` gets the same lines with
`$site->getData(…)` and `removeSiteFile()`.

- **How it reads the stored name.** The `null` branch reads
  `$isImage ? $setting['uploadName'] : $setting`. The diff reads
  `['uploadName'] ?? null` for every setting, because images and the
  style sheet are both stored as arrays with an `uploadName` (on 3.5,
  3.4 and 3.3 too), and a value without one removes nothing. For the
  style sheet the name never changes, so nothing is removed.
- **Order.** The removal comes after the copy and only when the names
  differ, so a failed copy keeps the old picture, and a file the copy
  has just overwritten is left alone. `highlight\Repository::edit()`
  does the same job in the other order: it deletes the stored picture
  before it stores the new one.
- **A failed database write.** The removal runs before `edit()` writes
  the settings (`updateObject()`). If that write failed, the request
  would answer a server error, the setting would still name the
  removed file, and the field would show a broken picture until the
  manager uploads again; the temporary file is already gone by then
  either way. The `null` branch and the highlights already accept
  that order. Removing after the write would mean moving the removal
  into `edit()` after `updateObject()`, where it cannot reach the
  thumbnail, which each app saves in the `Context::edit` hook before
  the write. So the order stays.

Tried on `main` in all three apps, alone and with pkp-e2e#1020's
diffs. With this diff, the Steps end with the old logo, homepage image,
favicon and site logo addresses answering "404 Not Found" and the new
pictures served; with both, the old thumbnail address answers "404 Not
Found" too. No request failed. The cases the fix must leave alone gave
the same answers at every address with and without it: a new PNG over
a PNG logo is served under the same name, the French logo stays when
the English one is replaced by a JPEG, a save without changes keeps the
JPEG, and "Remove" alone still deletes it.

**Alternatives:**

- Delete every `<setting>_<locale>.*` file before the copy: also
  clears files left by past replacements, but guesses at names instead
  of reading the stored one.
- Name the file after the setting alone, without the extension: one
  name per setting, but it changes the stored `uploadName` and the
  served content type for every install.
- Remove after the database write, in `edit()`: safer against a failed
  write, but it misses the thumbnail (above).

**What goes with it:**

- Stored data: no repair proposed. Files left by earlier replacements
  stay; a cleanup would compare each public folder with the stored
  `uploadName`s.
- The OJS issue cover and the publication cover image are left out:
  the first is a legacy form of its own, and the second must keep a
  file an earlier version still names (the check its `null` branch
  already makes).
- Backport: the diff applies to 3.5 with offsets; 3.4 and 3.3 have the
  same blocks (`$userId` in place of `$user`) and take it by hand.
- Test: a check that replaces a PNG logo with a JPEG and opens the old
  address.

Small: two short additions in one pkp-lib class pair, and a test.

## Evidence

- Kept script:
  [walk.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/replaced-picture-other-type-stays-public/walk.js)
  (helpers in `lib.js` beside it), run on an install freshly loaded
  with the default dataset:
  `node bin/probe.js all shared/playwright/checks/issues/replaced-picture-other-type-stays-public/walk.js`
  for the first group of Steps, with `WALK=site` in front for the
  site's logo and `WALK=nb` for the cases the fix must leave alone.
  Each step lists the public folder and opens each address as the
  field's picture links it.
- Walked on OJS, OMP and OPS, `main` and `stable-3_5_0`: both groups
  of Steps without the fix. On `main` also: both groups with
  `fix.diff`, the first group with `fix.diff` and pkp-e2e#1020's
  `fix-<app>.diff` together, and the cases left alone with `fix.diff`
  in and out. PostgreSQL, pkp/datasets 300c68e (2026-10-22). No request
  behind the Steps answered a server error and no page script failed.
- Tips:
  - **`main`:** OJS 3cf9aa91a8, OMP 178e8b34b2, OPS 5091e916d9, each
    with lib/pkp 1f415a07ca.
  - **`stable-3_5_0`:** OJS 0b1ae35f04, OMP a150eee76b, OPS 18506a5b4d,
    each with lib/pkp 5b54f59ed7.
  - **`stable-3_4_0`:** OJS 3bedd21383, OMP 95fefd0cf0, OPS 47adbcd1e8,
    pkp-lib 366030b017.
  - **`stable-3_3_0`:** OJS 06f01c8010, OMP fbe408e8eb, OPS e265883ba4,
    pkp-lib 126b86bc2e.
- Code reads beyond the Cause: on 3.5 the same methods with the same
  blocks (the diff applies with offsets, `patch --dry-run`). On 3.4 and
  3.3 (pkp-lib `stable-3_4_0` and `stable-3_3_0`, `PKPContextService`
  and `PKPSiteService`): the same `null`-only removal, `moveTemporaryFile()`
  naming the file after the upload's type, and images and the style
  sheet stored as arrays with `uploadName`. Links to the pictures:
  `PKPTemplateManager` (header logo), `Context::getLocalizedFavicon()`,
  `DefaultThemePlugin` (homepage image as header, an inline style built
  per request) and each app's `indexSite.tpl` (thumbnails) read the
  stored setting; the sitemap, the web feeds and the email templates
  name none of these pictures.
- Introduced: the upload branch of `_saveFileParam()` came with
  5f3be929e6 (PR `pkp/pkp-lib#3931` for `pkp/pkp-lib#3594`, Nate Wright,
  2018-10-23), which already removed the stored file only for `null`.
  The form it replaced, `NewContextImageFileForm::execute()`, wrote
  `<setting>_<locale><extension>` without removing the stored file
  either, and its upload link stood beside a picture already there.
  That form had the same code when 60b6071632 (Alec Smecher) moved it
  into pkp-lib in 2013; the trace stops there.
- Upstream: searched pkp/pkp-lib, pkp/ojs, pkp/omp, pkp/ops and
  pkp/ui-library by the symptom's words (logo, homepage image, favicon,
  thumbnail, old file, replaced) and by `_saveFileParam`,
  `moveTemporaryFile`, `removeContextFile` and `pageHeaderLogoImage`.
  The nearest hit, `pkp/pkp-lib#8062` (orphaned uploads of abandoned
  discussions and TinyMCE images, closed as not planned), is another
  fault.
- Not driven: 3.4 and 3.3; "Remove" alone on the homepage image and
  favicon; the OJS issue cover and the publication cover image; MySQL
  not checked (the fault does not touch the database).
