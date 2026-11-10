# A category page's picture opens nothing, and a screen reader hears "null" instead of its "Alternate text"

- **Severity** low
- **Effort** medium
- **Kind** regression
- **Affects**
  - main: OJS, OMP, OPS
  - 3.5: OJS, OMP, OPS
  - 3.4: OJS, OMP, OPS (code)
  - 3.3: OJS, OMP, OPS (code)
- **Introduced** `pkp/ojs#2361` for `pkp/pkp-lib#4557` · [caa6c07dc7](https://github.com/pkp/ojs/commit/caa6c07dc7cb6f85dae1e309244e3e536274aeb5), [e4e5a42fda](https://github.com/pkp/ojs/commit/e4e5a42fdaadf25ab02ef5d8e534c19abf89f3cd) · 2019-04-16 · commits by thinkbulecount2, PR by mylonelycomputer (these brought in the "null" name; the missing link is older, see the Cause)
- **Upstream** none found (2026-11-10)
- **Tracked in** spec U16 [A6](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U16-categories.md#a6), [A7](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U16-categories.md#a7); spec U68 [A4](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U68-catalog-browse.md#a4)
- **Checked** 2026-11-10, each branch's tip (the commits in Evidence)
- **Model** claude-opus-5-5

Update 2026-10-04: a press's series page has the same fault (spec U68
A4); the sections below now cover it.

Update 2026-11-10: a press used to show a broken picture on its
category page and an empty page for the full size, a separate fault
that `pkp/omp#2553` (for `pkp/pkp-lib#13730`) fixed on 2026-11-06. A
press now shows both pictures, as a journal and a preprint server do,
so the fix below for a press's category page no longer has to wait for
that one. This report's two faults are unchanged.

## Summary

A manager gives a category a "Cover Image" and types its "Alternate
text". On the category's page the small copy of the picture is not a
link, and no page links to the full-size picture, so readers cannot
reach it. A screen reader announces the picture as "null" on a journal
and a preprint server, and by the category's name on a press; the
alternate text the manager typed is used nowhere.

A press's series page shows its picture the same way: not a link, with
nothing on the page leading to the full size.

The "null" name came with an accessibility change in 2019. The picture
has never been a link on a journal or a preprint server, and has not
been one on a press since 2015.

## Impact

- **Lost**: the full-size picture for every reader, and the manager's
  description of the picture for screen-reader users.
- **Who**: readers of every category page that has a picture, and of
  every press's series page that has one.
- **Way round**: none.

Low: the page and its small picture are there, and a literal "null" read
aloud costs a screen-reader user no information, because the category's
name is the page's heading beside the picture. The effort is medium
because the fix spans three repositories: each app's category template,
plus OMP's series template.

## Steps to reproduce

Preconditions:

- PKP's default test dataset for `main` (OJS, OMP or OPS), freshly
  loaded. Its category "Applied Science" (path `applied-science`) has no
  picture. The `stable-3_5_0` dataset takes the same steps with the "3.5"
  brackets; its preprint server has no "Applied Science", so on OPS 3.5
  "Social sciences" (path `social-sciences`) takes its place.
- On `main` only, the journal's own folder in the public files folder:
  `public/journals/1` [OMP: `public/presses/1`; OPS: `public/contexts/1`].
  Creating a journal on screen makes it, but loading the dataset does
  not, so create it by hand. Without it the first picture's small copy
  is never written and shows broken. On 3.5 a category picture is kept
  in the journal's files folder instead, so this step is not needed.
- A picture `picture.png` on the reader's computer (the walk used a
  400 × 400 PNG).

The category page:

1. Sign in as `rvaca` (password `rvacarvaca`), the Journal manager
   [OMP: Press manager; OPS: Preprint Server manager].
2. Go to Settings › Journal [OMP: Settings › Press; OPS: Settings ›
   Server] and open the "Categories" tab.
3. On the "Applied Science" row, open "More Actions" and choose "Edit"
   [3.5: press "Applied Science" in the list].
4. Under "Cover Image", press "Upload File" and choose `picture.png`.
   Type "u16c3 picture" into "Alternate text" [3.5 has no "Alternate
   text" box].
5. Press "Save" [3.5: "OK"].
6. Open the category's page,
   `/index.php/publicknowledge/catalog/category/applied-science` [OPS:
   `/index.php/publicknowledge/preprints/category/applied-science`].
7. Press the picture.

**Expected:** the picture is a link to its full-size version, so step 7
opens it, and a screen reader names it by the alternate text typed at
step 4, "u16c3 picture". [3.5: by the category's name, "Applied
Science" (OPS: "Social sciences").]

**Observed:** step 6 shows the small copy (100 × 100) in this markup
(OJS):

```html
<div class="cover" href="…/index.php/publicknowledge/en/catalog/fullSize?type=category&amp;id=1">
  <img src="…/index.php/publicknowledge/en/catalog/thumbnail?type=category&amp;id=1" alt="null">
</div>
```

The accessibility tree reads `img "null"` [OMP: `img "Applied
Science"`]. Step 7 changes nothing: the browser stays on the category's
page. Typed into the browser, the address in the `div`'s `href` opens
the full-size picture (`image/png`, 400 × 400). [3.5: the same markup
and the same names.]

The series page (OMP only), on a freshly loaded dataset, with the same
`picture.png` (no folder needed: a series picture is kept in the press's
files folder). The dataset's series "History" (path `his`) has no
picture.

1. Sign in as `rvaca` (password `rvacarvaca`), the Press manager.
2. Go to Settings › Press and open the "Series" tab.
3. On the "History" row, open its arrow and choose "Edit".
4. Under "Cover Image", upload `picture.png`, then press "Save".
5. Open the series' page, `/index.php/publicknowledge/catalog/series/his`.
6. Press the picture.

**Expected:** the picture is a link to its full-size version, so step 6
opens it.

**Observed:** step 5 shows the small copy (100 × 100) in this markup:

```html
<div class="cover" href="…/index.php/publicknowledge/en/catalog/fullSize?type=series&amp;id=3">
  <img src="…/index.php/publicknowledge/en/catalog/thumbnail?type=series&amp;id=3" alt=" ">
</div>
```

Step 6 changes nothing: the browser stays on the series' page. Typed
into the browser, the address in the `div`'s `href` opens the full-size
picture (`image/png`, 400 × 400). [3.5: the same markup with
`alt=" History"`. On `main` the `alt` and the page's heading are blank,
a separate fault of the series page, spec U17 [OMP9](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U17-sections.md#omp9).]

## Cause

Two attributes of the picture's markup in each app's
`templates/frontend/pages/catalogCategory.tpl` (OJS and OPS lines 37–38,
OMP lines 39–40) are wrong.

The wrapper is a `div` carrying an `href`, which a `div` cannot use, so
the full-size address it names is dead. Until 2015 OMP wrapped the
picture in `<a class="cover" href="…fullSize…">`. OMP fbe97b889
("Implement grid-like catalog display and nav breadcrumbs", 2015-10-27,
Nate Wright (NateWr), no PR) turned the `a` into a `div` while
rearranging the page, and made the same change on the series page
(`catalogSeries.tpl`). Nothing records the link being dropped on
purpose: the commit names no issue, its message speaks only of the grid
layout, and it kept both the address on the `div` and the `fullSize`
handler that serves it, which nothing else links to. OJS took the markup
in ea9c1cefd4 when categories came to OJS (`pkp/pkp-lib#4158`, 2018),
with the `div` already in place, and OPS inherited it from OJS.

The `alt` ignores the alternate text the category stores. OJS's 2018
markup named the picture by the category's title, escaped.
`pkp/ojs#2361` (`pkp/pkp-lib#4557`, an accessibility pass, 2019) changed
it in caa6c07dc7 to `{$category->getLocalizedTitle()|default:'null'}`
and in e4e5a42fda to the literal `alt="null"`; OPS carries the same
commits. The 2020 follow-up for the same issue, "Use empty alt
attribute instead of 'null' text" (OJS e609e89a36, OMP 37dd55e41),
replaced "null" in the other OJS templates but missed this one. OMP's
copy has named the picture by the category's title since 2012 (OMP
fa9b83abc); the 2019 pass gave that title a `|default:'null'` fallback
(OMP 9aa87e77a), and OMP 37dd55e41, part of the 2020 follow-up,
changed it to `|default:''`. Since `pkp/pkp-lib#10404` (2025) the
category window has an "Alternate text" box, which
`CategoryCategoryController::saveCategory()` stores in `image.altText`,
but no template reads it.

Reach:

- The category page on all three apps, and OMP's series page
  (`catalogSeries.tpl` line 38), both walked on `main` and 3.5. A
  series has no "Alternate text" box.
- No other template in the three apps or pkp-lib wraps a picture in a
  `div` with an `href` (checked in the code).
- The same markup is in the three apps' `stable-3_4_0` and
  `stable-3_3_0` templates (checked in the code).

## Proposed fix

Make the wrapper a link and give the picture the stored alternate text,
falling back to the category's name, in each app's
`catalogCategory.tpl` (OJS shown). OMP's lines have the same
`page="catalog"` route, and their current `alt` is the category's title
with an empty fallback, `{$category->getLocalizedTitle()|escape|default:''}`,
where OJS has "null". OPS's lines have their own route,
`page="preprints"`:

```diff
-			<div class="cover" href="{url router=PKP\core\PKPApplication::ROUTE_PAGE page="catalog" op="fullSize" type="category" id=$category->getId()}">
-				<img src="{url router=PKP\core\PKPApplication::ROUTE_PAGE page="catalog" op="thumbnail" type="category" id=$category->getId()}" alt="null" />
-			</div>
+			<a class="cover" href="{url router=PKP\core\PKPApplication::ROUTE_PAGE page="catalog" op="fullSize" type="category" id=$category->getId()}">
+				<img src="{url router=PKP\core\PKPApplication::ROUTE_PAGE page="catalog" op="thumbnail" type="category" id=$category->getId()}" alt="{$image.altText|default:$category->getLocalizedTitle()|escape}" />
+			</a>
```

and in OMP's `catalogSeries.tpl` the same `div` to `a`, with the
picture's `alt` trimmed:

```diff
-				<img src="…" alt="{$series->getLocalizedTitle()|escape|default: 'null'}" />
+				<img src="…" alt="{$series->getLocalizedTitle()|trim|escape}" />
```

OMP's `Section::getLocalizedTitle()` always returns the prefix, a space
and the title, so the value is never empty and the `'null'` fallback can
never apply. The same join gives `alt=" History"` on 3.5 (a series with
no prefix) and `alt=" "` on `main`. `trim` is a modifier pkp-lib's
`PKPTemplateManager` registers, on `main` and back to 3.3.

On the category page the link and the `alt` belong in one change: a
linked image is the link's only content, so it needs a non-empty `alt`
to give the link a name (the problem `pkp/pkp-lib#12668`
raises for article images). That is why the fallback is the category's
name, which is also what OJS had before 2019, rather than the empty
`alt` the 2020 follow-up used for pictures that are not links. The
stylesheets style `.cover` by class (`float: right; width: 20%`), so the
`a` looks as the `div` did.

On a press the link leads to OMP's `CatalogHandler::fullSize()`, which
on `main` hands a category to `PKPCatalogHandler::fullSize()` (OMP
[1ac42011ad](https://github.com/pkp/omp/commit/1ac42011adbd6331524cffa5f43645bba64fc85d),
2026-11-06) and serves its own series case, so OMP's category page and
series page changes can each ship on their own.

The diffs, one per app root:
[a6a7-fix-ojs.diff](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/category-picture/a6a7-fix-ojs.diff),
[a6a7-fix-omp.diff](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/category-picture/a6a7-fix-omp.diff),
[a6a7-fix-ops.diff](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/category-picture/a6a7-fix-ops.diff).
Tried on `main` on all three apps (on a press again on 2026-11-10).
With the fix, the category page's picture is a link named "u16c3
picture" in the accessibility tree, and pressing it (step 7 of "The
category page") opens the full-size picture. A picture saved
with "Alternate text" left empty is named by its category ("Social
Sciences"), and a category with no picture still shows no picture block.
On OMP's series page the picture became a link, and pressing it (step 6
of the series steps) opened the full-size picture, with `alt=""` on
`main` (re-tried with the trimmed line); a series with no picture ("Psychology") still
shows no picture block, and the catalog page's book covers are links as
before. The series link should ship regardless: it opens the full
picture now, and gets its name, the series' title, once the series
page's blank title is fixed.

A proposal; the team decides.

**Alternatives**:

- Keep the picture unlinked and drop the dead `href` (and the `fullSize`
  handlers nothing else uses), if the team prefers no link. The `alt`
  part of the fix stands either way, with an empty fallback then, since
  an unlinked picture beside the category's heading is decorative.
- `alt="{$image.altText|escape|default:''}"`, the 2020 pattern: right
  for an unlinked picture, but leaves the link nameless when the box is
  empty.

**What goes with it**:

- No data repair: the alternate text is already stored.
- A question for the team, not part of the fix: `image.altText` is one
  string (`schemas/category.json`, `"type": "string"`), while the
  fallback, the category's name, follows the reader's language. On a
  multilingual journal every language gets the one alternate text
  typed.
- Backport: the same change on 3.5, 3.4 and 3.3, but the template text
  differs, so main's diffs do not apply as they stand. The lines sit at
  40–41 (OJS, OPS) and 42–43 (OMP). The `{url router=…}` argument is
  `\PKP\core\PKPApplication::ROUTE_PAGE` in OJS 3.4,
  `PKPApplication::ROUTE_PAGE` in OMP and OPS 3.4, and
  `$smarty.const.ROUTE_PAGE` on 3.3. The `alt` there is the category's
  name alone, since `image.altText` is `main`'s. On those versions OMP's
  own `CatalogHandler::fullSize()` has its own category case, which
  serves the picture, so the press's link works there as it stands.
- Test: an e2e check in spec U16 (a **Planned** item) that a category's
  picture links to its full-size version and carries its alternate text,
  and one in spec U68 that a series' picture links to its full size.

Medium: three lines in each app's category template, in three
repositories (three pull requests), plus OMP's series template.

## Evidence

- The kept script
  [walk.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/category-picture/walk.js)
  takes these Steps (and, with `PART=upload`, those of the sibling report
  U16-A17), creating the context's public folder first:
  `PART=picture PROBE_FEATURE=<fleet> PROBE_AGENT=<name> node bin/probe.js all shared/playwright/checks/issues/category-picture/walk.js`.
  `WALK=nb-template` in place of `PART` is the check that the fix reaches
  no further: "Social Sciences" with a picture and empty alternate text,
  and "Computer Science" with no picture.
- Walks: OJS, OMP and OPS on `main` and `stable-3_5_0`, on PostgreSQL,
  2026-10-02 and again 2026-11-10 (datasets from pkp/datasets cfd54311,
  2026-11-09). No request failed on the server and no page script
  failed. MySQL not checked (the fault does not depend on the database).
- Fix trial on OMP, 2026-11-10: `a6a7-fix-omp.diff` applied with
  `node bin/try-fix.js apply shared/playwright/checks/issues/category-picture/a6a7-fix-omp.diff omp`,
  then `PART=picture` (the Expected, step 7 opening the full size) and
  `WALK=nb-template` with the fix in and out. The OJS and OPS diffs, and
  the series line, were tried 2026-10-04 on code the change did not
  touch.
- Kind: the label follows the "null" name (2019).
- `pkp/pkp-lib#13242` (open, a new theme built on Blade templates) asks
  that category covers open full screen in that theme; it does not cover
  the default theme's markup.
- The kept script
  [series.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/category-picture/series.js)
  takes the series steps (OMP only):
  `PROBE_FEATURE=<fleet> PROBE_AGENT=<name> node bin/probe.js omp shared/playwright/checks/issues/category-picture/series.js`;
  `WALK=nb` is the check that the fix reaches no further ("Psychology",
  no picture, and the catalog page's book covers). Walked on `main` and
  `stable-3_5_0` on 2026-10-04, datasets from pkp/datasets 566bb1f
  (2026-10-03), the fix tried with `a6a7-fix-omp.diff` (its series line
  re-tried on `main` after the `|trim` change). No request failed on the
  server and no page script failed.
- Series page code reads: `catalogSeries.tpl` and
  `CatalogHandler::fullSize()` on `main`; the template on 3.5, 3.4 and
  3.3 (`git show`), the same `div` wrapper on each; its history by
  `git blame` and `git show fbe97b889`, whose parent has
  `<a class="cover" …>` on the series page.
- Not driven: 3.4 and 3.3; a screen reader itself
  (the accessibility tree Chromium builds was read instead).
- Tips (2026-11-10):
  - **`main`:** OJS 407246bb8e (lib/pkp 6035a6fed8), OMP f81f129c82
    (lib/pkp 8c3971dd1e), OPS 40f33453f0 (lib/pkp 6035a6fed8);
    lib/ui-library 8700ac5d in each.
  - **`stable-3_5_0`:** OJS fc6640fa0d (lib/pkp 7df8c6abac,
    lib/ui-library 228f2aa8), OMP ae1d900d35 (lib/pkp 1e5673c7c7,
    lib/ui-library 7cff1702), OPS fdc9aa22e3 (lib/pkp 7df8c6abac,
    lib/ui-library 7cff1702).
  - **`stable-3_4_0`:** OJS 61835656a2, OMP 98db039f2e, OPS d406378b01,
    pkp-lib 2dd24cc5ae, ui-library ee684b34.
  - **`stable-3_3_0`:** OJS b83fb9e44d, OMP 31f5c517ef, OPS 5d75c52745,
    pkp-lib df738d3a66, ui-library 96959f9e.
- Code reads: on `main`, the templates, stylesheets and classes the
  Cause names, and every template and theme for `altText` and
  `getImage()`; the history by `git log -L` on the image lines in each
  app; on 3.5, 3.4 and 3.3 the same templates (`git show`), re-read at
  the 2026-11-10 tips with OMP's `CatalogHandler::fullSize()` (its own
  category case on 3.5 and 3.4, which serves the picture) and, on
  `main`, OMP 1ac42011ad and `PKPCatalogHandler::fullSize()`.
