# The DOIs page's rows show a title's italic word as `<i>…</i>` and "&" as `&amp;`

- **Severity** low
- **Effort** small
- **Kind** defect
- **Affects**
  - main: OJS, OMP, OPS
  - 3.5: OJS, OMP, OPS
  - 3.4: OJS, OMP, OPS (code)
  - 3.3: none (code; no DOIs page)
- **Introduced** `pkp/pkp-lib#8584` and `pkp/ui-library#252` for `pkp/pkp-lib#2564` · [d98043a31e](https://github.com/pkp/pkp-lib/commit/d98043a31e87296c57de968e6b4b1331e170cf0c) and [c34891623d](https://github.com/pkp/ui-library/commit/c34891623d4ca7745d47e1f312f8f234f8b79276) · 2023-02-16 · Touhidur Rahman (touhidurabir)
- **Upstream** none found (2026-10-09)
- **Tracked in** spec U45 [A24](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U45-dois.md#a24)
- **Checked** 2026-10-09, each branch's tip (the commits in Evidence)
- **Model** claude-opus-5-5

## Summary

A manager who opens the DOIs page finds some works listed with their
title's HTML tags and entities printed as text. A title saved as
"hkrb forest trees & *shrubs*" reads
`Diouf — hkrb forest trees &amp; <i>shrubs</i>`, where the manager
expects the title as the heading of the work's workflow page shows it.

A row shows it when the work's "Title" holds a formatted word, an "&",
a "<" or a ">", when its "Subtitle" holds an "&", or when its "Prefix"
holds an apostrophe: the prefix "L'" reads `L&#039;`. An apostrophe or
a quotation mark in the "Title" itself reads right.

Nothing is lost: the row is only harder to read, and the workflow page
shows the title right.

## Impact

- **Lost:** nothing. The row's link, its submission number, its
  status and its DOIs are right. Only the row's name is harder to
  read.
- **Who:** the managers who work on the DOIs page, for each listed
  work with such a title: an italic species name, an "&", or a prefix
  with an apostrophe such as "L'".
- **Way round:** read the title in the heading of the work's workflow
  page, which the row's submission number finds.

Low: a managers' list prints the title with its tags and entities. The
row's text goes nowhere else: a deposit or an export started from this
page is built on the server from the stored title, not from the row
(checked in the code).

## Steps to reproduce

Preconditions:

- PKP's default test dataset, OJS `main` (OMP and OPS the same, with
  the differences in brackets). DOIs are on in the dataset, so the
  DOIs page lists works as it stands.
- The dataset holds no title saved from a "Title" box with formatting
  or "&", and no prefix with an apostrophe, so the steps save them.

A formatted word and an "&" in the title:

1. Sign in as `dbarnes`.
2. Open submission 5, "Genetic transformation of forest trees"
   (`/index.php/publicknowledge/en/dashboard/editorial?workflowSubmissionId=5`),
   then "Publication" › "Title & Abstract". [OMP: submission 4, "How
   Canadians Communicate: Contexts of Canadian Popular Culture". OPS:
   submission 1, "The influence of lactation on the quantity and
   quality of cashmere production", under "Preprint" › "Title &
   Abstract".]
3. In "Title", replace the text with `hkrb forest trees & shrubs`,
   select "shrubs" and press Ctrl+I. Press "Save" and read the heading
   over the form.
4. Open "DOIs" in the side menu (`/index.php/publicknowledge/en/dois`)
   and read the row numbered 5 [OMP: 4; OPS: 1].

An apostrophe, a prefix and a subtitle (on a freshly loaded dataset,
the same submission):

5. In "Title", replace the text with `hkrb it's a "quoted" title`.
   Press "Save", open "DOIs" and read the row.
6. Back in "Title & Abstract", type `L'` in "Prefix" and
   `rocks & sand` in "Subtitle". Press "Save" and read the heading
   over the form. Open "DOIs" and read the row.

**Expected:** the row's name reads as the heading over the form shows
the title, after the short author string [OMP: "Beaty et al. — …";
OPS: "Corino — …"]:

- step 4: "Diouf — hkrb forest trees & *shrubs*", with "shrubs" in
  italics;
- step 5: "Diouf — hkrb it's a "quoted" title";
- step 6: "Diouf — L' hkrb it's a "quoted" title: rocks & sand".

**Observed:** steps 4 and 6 read:

```
Diouf — hkrb forest trees &amp; <i>shrubs</i>
Diouf — L&#039; hkrb it's a "quoted" title: rocks &amp; sand
```

The row of step 5 reads as expected. The saves answered 200 and
stored the title `hkrb forest trees &amp; <i>shrubs</i>`, the prefix
`L'` and the subtitle `rocks &amp; sand`. The heading over the form
read "hkrb forest trees & *shrubs*" and "L' hkrb it's a "quoted"
title: rocks & sand". OMP and OPS read the same after their author
strings.

The dataset's own "Hansen & Pinto: Reason Reclaimed" (OJS submission
9, OPS submission 8) reads right on the DOIs page: the dataset stores
it with a bare "&", where the "Title" box saves `&amp;`.

## Cause

A publication's full title is HTML. The REST API's `fullTitle` is the
prefix, the title and the subtitle joined
(`PKPPublication::getLocalizedFullTitle()`), and pkp-lib's publication
map sends its HTML form
([`classes/publication/maps/Schema.php` line 204](https://github.com/pkp/pkp-lib/blob/d1bc3a9ecc8bb26d46e1e1a6fd37a438d572f50d/classes/publication/maps/Schema.php#L204),
`$publication->getFullTitles('html')`). Each part brings its own
entities:

- "Title" and "Subtitle" are `FieldRichText` boxes since
  `pkp/pkp-lib#2564`, in the workflow (`TitleAbstractForm.php`, lines
  63 and 69) and, for the title, in the submission wizard
  (`StartSubmission.php`, line 84). They save `<b>`, `<i>`, `<u>`,
  `<sup>` and `<sub>`, and write "&", "<" and ">" as `&amp;`, `&lt;`
  and `&gt;`. They leave apostrophes and quotation marks as typed.
- "Prefix" is a plain text box. For the HTML form
  `PKPPublication::getLocalizedTitle()` (line 157) runs it through
  `htmlspecialchars()`, which turns an apostrophe into `&#039;`.

The DOIs page's list prints that HTML as text. `getItemTitleBase()` in
ui-library's
[`DoiListPanel.vue` (lines 881–886)](https://github.com/pkp/ui-library/blob/38814ea1595dfffb7068435ec2a5e01fbbed582f/src/components/ListPanel/doi/DoiListPanel.vue#L881-L886)
joins the short author string and `localize(currentPublication.fullTitle)`
into one string, and
[`DoiListItem.vue` line 31](https://github.com/pkp/ui-library/blob/38814ea1595dfffb7068435ec2a5e01fbbed582f/src/components/ListPanel/doi/DoiListItem.vue#L31)
prints it with `{{ item.title }}`. Vue escapes a text interpolation,
so the tags and entities show as characters.

Both lines were right when the list was written (`pkp/ui-library#165`,
2021), because `fullTitle` was plain text then. `pkp/pkp-lib#8584`
made it HTML, and its ui-library half, `pkp/ui-library#252`, changed
the submissions list's row to render it (`SubmissionsListItem.vue`)
but left the DOI list's row as it was. No release showed these rows
right: the DOIs page first shipped in 3.4.0, which already held both
changes.

Reach:

- Every work row of the three apps' DOIs pages takes this path:
  `DoiListPanelOJS.vue` and `DoiListPanelOMP.vue` call
  `getItemTitleBase()` for a submission and OPS uses the base
  component. Nothing in it depends on the work's status (walked on
  unpublished works; published ones checked in the code).
- Walked: an italic word, "&", "<" and ">" in "Title"; "&" in
  "Subtitle"; an apostrophe in "Prefix". By the code only: the other
  formatting (bold, underline, superscript, subscript), formatting in
  "Subtitle", and "&", "<", ">" and a quotation mark in "Prefix".
- A deposit or an export does not read the row. The page sends the
  selected rows' numbers, and the agency's filter builds its XML on
  the server from the publication (checked in the code).
- The "DOI Updates Failed" window names a work in plain text: its
  messages take `getLocalizedFullTitle()` in the text form
  (`PKPDoiController.php`, lines 589 and 695; checked in the code).
- An OJS issue's row is not affected. Its name is
  `item.identification`, which `Issue::getIssueIdentification()`
  builds as plain text (walked on issues without a title, "Vol. 1 No.
  2 (2014)"; an issue title holding "&" by the code only).
- An OMP chapter's row in the expanded view is not affected. A
  chapter's title comes from a plain text box (`chapterForm.tpl`,
  `fbvElement type="text"`), so `{{ row.displayType }}` is right
  (checked in the code).
- The same mistake, the HTML `fullTitle` reaching a `{{ }}`, is in
  other ui-library components. The list comes from a search for
  `fullTitle` in ui-library's `src`, each hit followed to the
  template that prints it (checked in the code, not walked):
  - `CatalogListItem.vue` line 22, OMP's catalog rows (`main`, 3.5);
  - `WorkflowChangeSubmissionLanguageModal.vue` line 10 (`main`, 3.5);
  - `FieldSelectSubmissions.vue` line 33, a label that
    `Autosuggest.vue` prints at lines 12 and 100 (`main`, 3.5);
  - `SubmissionsListItem.vue` line 158, the "View" button's
    screen-reader name (`main`, 3.5);
  - `useReviewerManagerActions.js`, window titles that
    `SideModalBodyLegacyAjax.vue` line 3 and
    `WorkflowLogResponseModal.vue` line 10 print: lines 73 and 401 on
    `main`, lines 73, 98, 123 and 424 on 3.5;
  - `ReviewDetailsModal.vue` line 4 and `ReviewDetailsEditModal.vue`
    line 7 (`main`).

## Proposed fix

Give the row the author string and the title as two values, print the
authors as text and render the title through `v-strip-unsafe-html`,
the directive ui-library uses for stored HTML. An issue's row keeps
its text interpolation.
[fix.diff](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/doi-row-title-formatting-codes/fix.diff),
two files of one component:

```diff
--- a/lib/ui-library/src/components/ListPanel/doi/DoiListItem.vue
-							{{ item.title }}
+							<template v-if="item.type === 'submission'">
+								{{ item.authors }} —
+								<span v-strip-unsafe-html="item.title"></span>
+							</template>
+							<template v-else>{{ item.title }}</template>
--- a/lib/ui-library/src/components/ListPanel/doi/DoiListPanel.vue
 					title: this.getItemTitle(item),
+					authors: this.getItemAuthors(item),
@@
 		getItemTitleBase(item) {
-			const currentPublication = this.getCurrentPublication(item);
-			const authorString = currentPublication.authorsStringShort;
-			const title = this.localize(currentPublication.fullTitle);
-			return `${authorString} — ${title}`;
+			return this.localize(this.getCurrentPublication(item).fullTitle);
+		},
+		getItemAuthors(item) {
+			return this.itemType === 'submission'
+				? this.getCurrentPublication(item).authorsStringShort
+				: '';
 		},
```

The dashboard's title cell is the model
(`DashboardCellSubmissionTitle.vue`: the authors in `{{ }}`, a dash,
the title in a `v-strip-unsafe-html` span). The directive sanitises
with DOMPurify before it renders. The fix departs from that cell in
two places, on purpose, so that it changes the rendering and nothing
else: it prints the dash even when the author string is empty, and it
picks the language with `this.localize()`, not with
`localizeSubmission(fullTitle, locale)`. Both are what the row does
today.

The fix keeps what `pkp/pkp-lib#2564` was for: the title stays HTML in
the API and shows formatted. The prefix and the subtitle travel in the
same string, so it covers them too (by the code; the trial ran on the
title).

Tried on `main` (OJS, OMP, OPS): steps 1 to 4 showed the Expected, the
row reading "Diouf — hkrb forest trees & shrubs" with "shrubs" in
italics. With the fix in and out, a title typed with angle brackets
("hkrb a <b> c plain") keeps "<b>" as text in the row, a plain title's
row and every row's link read as before, and an OJS issue's row reads
"Vol. 1 No. 2 (2014)".

**Alternatives:**

- Turn the title into plain text in `getItemTitleBase()` and keep
  `{{ item.title }}`. One method, and the "&" reads right, but the row
  drops the italics the dashboard and the workflow show.
- Render the joined string through `v-strip-unsafe-html`. The author
  string and an issue's name are plain text, so a name holding "<"
  would be read as markup.
- Send `fullTitle` as text from the API. The dashboard and the
  workflow render it as HTML and would lose the formatting.

**What goes with it:**

- No data repair: the stored titles are right.
- Backport: fix.diff does not apply whole on 3.5 or on 3.4, for the
  same reason on both. The `DoiListItem.vue` change and the
  `getItemTitleBase()` hunk apply. The `authors:` line goes in by
  hand after `title:`, because the mapped item there has no
  `versionString` line, the hunk's context. Both lines register the
  directive.
- A guard: the U45 e2e scenario that reads the DOIs page's rows can
  save a title with an italic word and an "&" and assert the row's
  name and its italic word.
- The other components named under Cause need their own fixes.

Small: a few lines in the two files of one ui-library component, with
no change to the API or to stored data.

## Evidence

- The walk script
  [walk.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/doi-row-title-formatting-codes/walk.js)
  takes steps 1 to 4 as `dbarnes` and, before step 2, reads the DOIs
  page's row of the dataset's "Hansen & Pinto: Reason Reclaimed" (OJS
  9, OPS 8) and the title the database holds for it. With the argument
  `chars` it takes steps 5 and 6. With `neighbour` it retypes the
  title as `hkrb a <b> c plain` ("plain" in italics) and reads that
  row and a plain title's row (OJS 17, OMP 14, OPS 2). With `issues`
  (OJS) it sets Settings › Distribution › "DOIs" › "Setup" to "DOI
  Prefix" 10.1234 with "Issues" ticked, since the dataset gives DOIs
  to articles only, and reads the "Issues" tab's rows. Run it with
  `node bin/probe.js all shared/playwright/checks/issues/doi-row-title-formatting-codes/walk.js [chars | neighbour | issues]`.
- Walks: OJS, OMP and OPS on `main` and on `stable-3_5_0` showed the
  Observed of steps 1 to 4 and of steps 5 and 6, the same on each. On
  `main` with the fix applied steps 1 to 4 showed the Expected;
  `neighbour` ran on the three apps and `issues` on OJS, each with
  the fix in and out. Steps 5 and 6 were not walked with the fix
  applied. Databases: PostgreSQL. No request failed and the browser
  reported no script error.
- The walk typed every title from the keyboard and pressed Ctrl+I for
  the italics; the box's "Formatting" button was not pressed.
- Read in the code only, not walked:
  - a published work's row (one code path for every row);
  - the "DOI Updates Failed" window's wording (the lines named under
    Cause);
  - that a deposit or an export does not use the row:
    `DoiListPanel.vue` posts `ids: this.selected`, and `item.title`
    is read nowhere but `DoiListItem.vue` line 31;
  - a title typed in the submission wizard (the same
    `FieldRichText`).
- Unverified: whether each agency's XML carries a formatted title
  right. It is another code path than this report's, and the test
  install cannot export (it does not reach the agencies' schemas). By
  the code, OJS's DataCite filter takes the title in its text form
  (`DataciteXmlFilter.php` line 564, `getTitles()`), and the Crossref
  filters take the HTML form into a text node
  (`ArticleCrossrefXmlFilter.php` line 185 on OJS,
  `PreprintCrossrefXmlFilter.php` line 178 on OPS); what Crossref
  then holds for such a title was not looked at.
- The list of other components: every `fullTitle` hit in ui-library's
  `src`, stories and mocks aside. Read as right:
  `DashboardCellSubmissionTitle.vue`, `WorkflowPage.vue` and
  `SubmissionsListItem.vue` line 19 (the directive), and
  `UserCommentDetailModal.vue` line 7, whose `fullTitle` the comments
  API sends as plain text (`UserCommentResource.php` line 54). Not
  followed to a template: `SubmissionsListItem.vue` line 772 (a
  legacy window's title) and `useReviewerSubmissionDetailsForm.js`
  line 47. A title that reaches a template under another property was
  not searched.
- Code reads on `main` and 3.5: `DoiListItem.vue` line 31 and
  `getItemTitleBase()` are the same on both; pkp-lib's publication map
  sends `getFullTitles('html')` on both; `getLocalizedTitle()` runs
  the prefix through `htmlspecialchars()` on both; `js/load.js`
  registers `strip-unsafe-html` on both.
- `patch --dry-run` of fix.diff on the 3.5 and the 3.4 files:
  `DoiListItem.vue` applies, `DoiListPanel.vue`'s first hunk fails on
  its context line and its second applies.
- 3.4 (code): ui-library `stable-3_4_0` has `{{ item.title }}` in
  `DoiListItem.vue` (line 30), the same `getItemTitleBase()` and the
  three apps' panels; pkp-lib `stable-3_4_0` has
  `getFullTitles('html')` in the publication map, the `FieldRichText`
  title and subtitle and the plain prefix in `TitleAbstractForm.php`,
  `htmlspecialchars($prefix)` in `PKPPublication.php` and
  `Vue.directive('strip-unsafe-html', …)` in `js/load.js`. OJS, OMP
  and OPS each have `pages/dois`.
- 3.3 (code): no `pages/dois` in OJS, OMP or OPS, no `ListPanel/doi`
  in ui-library, and the "Title" box is a `FieldText`
  (`PKPTitleAbstractForm.inc.php`).
- Not driven: 3.4 and 3.3; the other components named under Cause;
  MySQL (the fault is in the browser, not the database).
- The trace: `git blame` on `DoiListItem.vue` line 31 and on
  `getItemTitleBase()` gives ui-library 6eecffda15 (2021-12-16, Erik
  Hanson, `pkp/ui-library#165` for `pkp/pkp-lib#7014`). `git blame`
  on the publication map's line 204 gives pkp-lib d98043a31e
  (2023-02-07), which changed `getFullTitles()` to
  `getFullTitles('html')`; GitHub names its PR `pkp/pkp-lib#8584`,
  merged 2023-02-16, the day `pkp/ui-library#252` (c34891623d) was
  merged, which touches no file under `ListPanel/doi`.
- The kind: pkp-lib's tag `3_4_0-0` (2023-06-09) holds d98043a31e and
  OJS's tag `3_4_0-0` has `pages/dois`; the 3.3 branches have
  neither. The rows were right only on `main` between the two
  changes, in no release.
- Upstream search (2026-10-09): pkp/pkp-lib, pkp/ui-library, pkp/ojs,
  pkp/omp and pkp/ops, issues and PRs, open and closed, by the
  symptom's words (DOI, title, italic, html tags, `&amp;`) and by
  `DoiListItem`, `DoiListPanel`, `getItemTitleBase` and `fullTitle`.
  No hit is about a list printing a title's tags.
- The branch tips the walks and code reads used:
  - **`main`:** OJS 6d5b793c4e (pkp-lib d1bc3a9ecc), OMP 57a9235110
    and OPS fd78a0bcd8 (pkp-lib 27938abd4c), ui-library 38814ea1 on
    the three.
  - **`stable-3_5_0`:** OJS c6e2c3a879 (pkp-lib d702d012dd), OMP
    ddc6abf5a9 and OPS dc8a938ab0 (pkp-lib 8094f06bf5), ui-library
    2576e00a on the three.
  - **`stable-3_4_0`** (code; pkp's branches as fetched 2026-10-09):
    OJS 4dc0c17acf, OMP 0aec65441f, OPS acd8ae704b, pkp-lib
    8bf0ab5072, ui-library ee684b341b.
  - **`stable-3_3_0`** (code; pkp's branches as fetched 2026-10-09):
    OJS a752a1ce8e, OMP 8e72fc8836, OPS c5532e2161, pkp-lib
    8c5b3f7f5c, ui-library 96959f9ed4.
- The default dataset loaded: pkp/datasets 1a196c3 (2026-10-08).
