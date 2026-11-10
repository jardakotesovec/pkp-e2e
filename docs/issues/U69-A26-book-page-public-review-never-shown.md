# A review made public never shows on the published book's page

- **Severity** medium
- **Effort** medium
- **Kind** defect
- **Affects**
  - main: OMP (OJS: its own report, see Cause)
  - 3.5: none (no "Publicly Show Reviewer Comments")
  - 3.4: none (code; no public review option)
  - 3.3: none (code; no public review option)
- **Introduced** not traced (the book page never had a display, so no commit broke one); the fault exists since OMP got the box, in [17b988fde4](https://github.com/pkp/omp/commit/17b988fde4e79492c82f747712fe82df8f84c543) (2026-01-22)
- **Upstream** none found (2026-11-10)
- **Tracked in** spec U69 [A26](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U69-monograph-landing-page.md#a26)
- **Checked** 2026-11-10, each branch's tip (the commits in Evidence)
- **Model** claude-opus-5-5

Update 2026-11-05: OMP's public API for the reviews was walked on `main` and 3.5. On `main` every request to `api/v1/publicationPeerReviews` answered a server error with an empty body, and `api/v1/peerReviews` answered 404; 3.5 has neither address. That became its own report, [pkp-e2e#1086](https://github.com/jardakotesovec/pkp-e2e/issues/1086).

Update 2026-11-10: that API now works, since `pkp/omp#2552` for
`pkp/pkp-lib#13729`
([efbb79bdf7](https://github.com/pkp/omp/commit/efbb79bdf762594858525d693b1ede75922968cd),
2026-11-06) renamed OMP's entry point to `api/v1/peerReviews`. The
book's page still shows no review, so that address is the only place
a press's public reviews can be read.

## Summary

An editor ticks "Publicly Show Reviewer Comments" on an "Open" review
and presses "Mark as Complete", whose dialog says "This review will be
made publicly visible alongside the article." Once the book is
published, its page shows no review at all: no comments, no reviewer's
name, no review heading, for a visitor or for the editor.

The press believes its reviews are public, and nobody learns that
readers never see them.

It concerns presses that publish reviews. An editor ticks the box on
each review. A press can also have it ticked on every new review: the
setting "Make reviewer comments publicly visible with published
content" (Settings › Workflow › Review › "Setup") does that, and it is
off until the press turns it on. A journal's article page has the same
fault, with a different fix
([pkp-e2e#218](https://github.com/jardakotesovec/pkp-e2e/issues/218)).

## Impact

- **Lost.** What readers miss: the published reviews, the reason a
  press opts into transparent peer review. The reviews themselves stay
  stored.
- **Who.** Nobody yet: the box exists on `main` only, and no release
  carries it, so this must be fixed before the next release ships. Then
  it reaches readers of every book with a review made public, on every
  press that publishes reviews. The box is offered on every review type,
  not only "Open". An anonymous review made public is meant to show its
  comments without the reviewer's name, and it is missing from the page
  the same way (read in the code; the walk took an Open review). It is a
  gap in intended work: the options reached OMP with the feature, but
  the page was never given a display, and no pkp issue plans one.
- **Way round.** None on screen: no setting shows the reviews. The
  reviews can be read only at the press's API address (Steps, after
  Observed), so a custom theme or plugin could fetch and show them; no
  theme does.

Medium: a press's choice to publish reviews silently does nothing with
no way round, which is high in an ordinary setup, but only a press that
opts in meets it, review by review, with the press-wide setting off by
default (the scale's "rarely met state"); torn between the two, the
scale takes the lower, and evidence that presses commonly publish
reviews would raise it.

## Steps to reproduce

Preconditions:

- PKP's default test dataset for OMP `main`, press `publicknowledge`.
- Submission 16, "A Designer's Log: Case Studies in Instructional
  Design", is in Review, round 1, with one submitted review, from Adela
  Gallego ("I recommend that the author revise this submission."). Its
  review type is the press's default, "Anonymous Reviewer/Anonymous
  Author". Nothing to create.

Steps:

1. Sign in as `dbarnes` and open submission 16.
2. In "Reviewers", Adela Gallego's row: "More Actions" › "Edit". Choose
   the review type "Open", tick "Publicly Show Reviewer Comments", press
   "OK".
3. Adela Gallego's row: "Read Review", then "Mark as Complete". Press
   "Mark as Complete" in the dialog.
4. "Accept Submission": go through its steps and press "Record
   Decision".
5. "Send To Production": go through its steps and press "Record
   Decision".
6. In "Publication" › "Title & Abstract", press "Publish", then
   "Publish" in "Schedule For Publication". The dialog says the version
   assigned will be "Version of Record 1.0"; nothing to choose.
7. Sign out and open the book's page,
   `/index.php/publicknowledge/catalog/book/16`.
8. Sign in as `dbarnes` again and open the same page.

**Expected:** the dialog of step 3 promises the review a public place:

```
Mark this review as complete?
This review will be made publicly visible alongside the article. You can still modify this review after marking it as complete. You will have the opportunity to thank the reviewer in the next step.
```

So the book's page shows Adela Gallego's review: her name, since the
review is Open, and "I recommend that the author revise this
submission.", under a review heading.

**Observed:** the notice "The review has been marked as complete."
follows the dialog, and the book is published (the
header offers "Unpublish"). The book's page, in steps 7 and 8 alike,
holds "Authors", "Synopsis", the chapters, "Published" and "Versions",
and no review: no "Adela Gallego", no "I recommend that the author
revise this submission." (not in the page's source either), no review
heading. The page requests no review data, and no request or script
fails.

The review is public all the same. Typed in the address bar after
step 7, while signed out,
`/index.php/publicknowledge/api/v1/peerReviews/open/submissions/16`
answers 200 with round 1, "Version of Record 1.0", Adela Gallego and
her comment.

## Cause

A public review needs three parts to reach a reader: the page's data,
the display in the front-end bundle, and an element on the page that
mounts it. OJS's article page has the first two and lacks the third.
OMP's book page has none of them, each missing in OMP's own code:

- **No data.** `CatalogBookHandler::book()`
  (`pages/catalog/CatalogBookHandler.php`) never builds the shared
  `PKP\components\OpenReviewComponent`, which resolves a submission's
  public reviews, and never calls `requiresVueRuntime()`. OJS's
  `ArticleHandler::view()` does both and assigns the result as
  `openReviewConfig`.
- **No display in the bundle.** OMP's `js/load_frontend.js`, the entry
  of `js/build_frontend.js`, is still the five-line Vue runtime of
  `pkp/pkp-lib#11468` ([be6883bb58](https://github.com/pkp/omp/commit/be6883bb58decb623325a754e267eb31d5742bf3)).
  OJS's took the shared loader `lib/pkp/js/load_frontend.js` with
  `pkp/pkp-lib#11698` (OJS
  [f649b1ada1](https://github.com/pkp/ojs/commit/f649b1ada16d66485eb6a54842d25483329f42e3)
  and [b310814d35](https://github.com/pkp/ojs/commit/b310814d35a09131f8dd61f550be61888f78d94c),
  `pkp/ojs#5040`, 2025-08): it imports the loader, adds a
  `<pkp-modal-manager>` root and mounts every `data-vue-root`. The
  loader registers `PkpOpenReview` since pkp-lib
  [4ca4afcafe](https://github.com/pkp/pkp-lib/commit/4ca4afcafe11c0f12e5d7fc955ebfa3f052f5a57)
  (OJS side [a35b58fe0a](https://github.com/pkp/ojs/commit/a35b58fe0af0f124bfba32f2e73ec91dc0649579),
  `pkp/ojs#5285`, 2026-01-23). OMP's
  `package.json` also lacks `@fastify/deepmerge`, which that loader's
  usage chart imports, so the loader does not build in OMP without it.
- **No place on the page.** `templates/frontend/objects/monograph_full.tpl`
  has no element for the display.

Meanwhile the options that promise the display reached OMP through the
shared code: the box on each review with `pkp/pkp-lib#12204` (OMP's side
[17b988fde4](https://github.com/pkp/omp/commit/17b988fde4e79492c82f747712fe82df8f84c543),
`pkp/omp#2213`), the press's setting with `pkp/pkp-lib#12045`, and the
dialog's sentence with `pkp/pkp-lib#13156`. The rule broken is the
feature's own: the box "will make the review assignment's data publicly
visible on published articles" (the 3.6 feature notes,
`pkp/pkp-lib#11939`).

The reach:

- **The public API** (`PKP\API\v1\peerReviews\PeerReviewController`)
  serves the same `SubmissionPeerReviewResource` the display would read.
  The book's page does not call it, so the fix leaves it as it is.
- **OJS's article page** shows no public review either, for the
  missing element alone: `templates/frontend/objects/article_details.tpl`
  has no `<pkp-open-review>` and never reads `$openReviewConfig`
  (checked in the code on `main`), so the element is new in both apps.
  That is its own report with a template-only fix,
  [pkp-e2e#218](https://github.com/jardakotesovec/pkp-e2e/issues/218);
  its proposed section is the one used here.
- **Chapter pages** use `chapter.tpl` and show no review either; the
  reviews belong to the book, so the fix leaves them out (checked in
  the code).

## Proposed fix

A proposal.

**The section.** In OMP, OJS's bundle entry and handler data, and a
new element on the page
([fix.diff](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/book-page-public-review-never-shown/fix.diff)):

- `js/load_frontend.js`: copy OJS's file as it is. It imports
  `lib/pkp/js/load_frontend.js` and, on `DOMContentLoaded`, prepends a
  `data-vue-root` holding `<pkp-modal-manager>` to the page and mounts
  every `data-vue-root`. `package.json` adds
  `"@fastify/deepmerge": "^3.2.0"`, as OJS's has (then `npm install`,
  which updates the lock file).
- `CatalogBookHandler::book()`, for the book's page (not a chapter's),
  with `use PKP\components\OpenReviewComponent;` among the imports. The
  block goes after `setChapter()` has run, since that call sets
  `isChapterRequest`; `fix.diff` puts it after the `creditRoleTerms`
  assignment:

```php
        // Open peer review: the reviews made public, shown on the book's page
        if (!$this->isChapterRequest) {
            $templateMgr->requiresVueRuntime();
            $openReviewComponent = new OpenReviewComponent($submission);
            $templateMgr->setLocaleKeys($openReviewComponent->getLocaleKeys());
            $templateMgr->addSvgIcons($openReviewComponent->getSvgIcons());
            $templateMgr->assign('openReviewConfig', $openReviewComponent->getConfig());
            $templateMgr->setConstants($openReviewComponent->getConstants());
        }
```

- `monograph_full.tpl`, at the end of the main column, after
  "References":

```smarty
			{* Open peer review: shown once a review made public is confirmed by an editor *}
			{if $openReviewConfig.submissionPeerReviews.reviewRounds}
				<section id="open-review" class="item open_review" data-vue-root>
					<h2 class="label">
						{translate key="openReview.title"}
					</h2>
					<pkp-open-review v-bind='{$openReviewConfig|json_encode_html_attribute}'></pkp-open-review>
				</section>
			{/if}
```

The handler follows OJS's `ArticleHandler::view()`. The template's
section is the one the OJS report proposes for the article page,
condition and encoding included. Its `{if}` tests
`submissionPeerReviews.reviewRounds`, which lists only rounds with a
public review an editor has confirmed ("Mark as Complete"). It does not
test `submissionPeerReviewSummary`, which counts every accepted public
review. So a book whose public review was never confirmed gets no empty
section.

Tried on OMP `main`, with `@fastify/deepmerge` resolved from another
install in place of `npm install`: the book's page shows a "Peer
Review" section with "Round 1", "Version of Record 1.0" and Adela
Gallego's review (her name, "State University of New York", "I
recommend that the author revise this submission."), for the visitor
and for `dbarnes`. Books 5 and 14 (no review made public) show no
section. Submission 13 has two reviews an editor has already
confirmed; with Adela Gallego's made Open and public from "Edit" and
Gonzalo Favio's left private, then published, the section holds hers
alone. Without the fix the same book shows none.

**The layout.** As on the article page, the components were built for a
tabbed page (a summary card and a "peer-review-record" tab), which the
default theme does not have. Which layout the default themes give the
reviews is one design decision for OJS and OMP together. Until it is
made, the section above shows what the dialog and the setting promise.

**Alternatives:**

- A slim OMP entry that registers `PkpOpenReview` alone: a smaller
  bundle, but OMP's front end would drift from OJS's, and each later
  reader component would need its own OMP change.
- Take the promise back on a press (no box, no dialog sentence, no
  setting in OMP) until a theme shows reviews: a product call.

**What goes with it:**

- Styles for the display. Unstyled it reads, but roughly: "Round 1" and
  "Version of Record 1.0" run together, as do the reviewer's name and
  affiliation. Neither app loads the bundle's own
  `styles/build_frontend.css`, and OJS's default theme has no styles for
  the display either. Where they belong is part of the layout decision:
  the theme, the bundle's CSS loaded with the Vue runtime, or styles
  registered per component with `PKPTemplateManager::addVueComponentStyles()`
  (a Blade template's `@vueComponentStyles`), which lib/pkp's
  `templates/frontend/components/footer.tpl` prints with
  `{load_vue_component_styles}`. No template registers any today.
- Every book page then loads the reader bundle, as every OJS article
  page does.
- A pkp-lib guard against a PHP warning, in the same change.
  `OpenReviewComponent` resolves both `SubmissionPeerReviewResource` and
  `SubmissionPeerReviewSummaryResource`, and each counts recommendations
  in `ReviewerRecommendationSummary::getSummaryCountForReviewerRecommendation()`,
  which reads `->type` on the context's recommendation types. A press
  has none: OMP's `Application::hasCustomizableReviewerRecommendation()`
  returns false, and only OJS's `ContextService` adds the default
  recommendations to a new context. So line 89 writes
  `PHP Warning: Attempt to read property "type" on null`
  (PHP 8.3) once per completed public review. The signed-out request
  for the API address after Observed already writes it on `main`; with
  the fix, every view of such a book's page would write it too (read in
  the code). The null-safe read `SubmissionPeerReviewResource` already
  uses for the same lookup (`$recommendation?->type`, line 210) is the
  one-line fix there. It is not in `fix.diff` and was not tried.
- The guard: an e2e scenario where a confirmed public review shows on
  the book's page and a private one does not (a Planned item in U69).

Medium: three OMP files and a dependency, tried, and the one-line
pkp-lib guard; the bundle change
brings every shared reader component to OMP's front end, and the styles
wait on the layout decision.

## Evidence

- Kept script:
  [walk.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/book-page-public-review-never-shown/walk.js)
  (helpers in `lib.js` beside it): Steps 1–8, with books 5 and 14 read as
  controls, and after step 7 the public review records of books 16 and 5
  typed in the address bar, signed out (book 5's is empty); with the
  argument `neighbour` it takes submission 13, "Mobile Learning:
  Transforming the Delivery of Education and Training" (Copyediting, two
  confirmed reviews), makes Adela Gallego's review Open and public from
  "External Review" › "Review Round 1" › "Edit", leaves Gonzalo Favio's
  private, sends it to production and publishes it, then reads books 13,
  5 and 14. On an install freshly loaded from the default dataset
  (pkp/datasets cfd54311, 2026-11-09, PostgreSQL):
  `PROBE_FEATURE=<fleet> PROBE_AGENT=<id> node bin/probe.js omp shared/playwright/checks/issues/book-page-public-review-never-shown/walk.js [neighbour]`.
- Fix trial: `trial.diff` beside the script is `fix.diff` without the
  `package.json` line and with a `vite.config.frontend.js` alias that
  resolves `@fastify/deepmerge` from the OJS checkout's install. Without
  the dependency the build stops at
  `Rolldown failed to resolve import "@fastify/deepmerge" from ".../PkpUsageChart/PkpUsageChart.vue"`.
  The steps and the neighbour were walked with it in; the neighbour also
  with it out (no review on any of the three books). The trial ran on
  2026-10-13 (OMP eb9381314, pkp-lib f4c2578c94). Both diffs apply to
  the 2026-11-10 tips as they stand (`git apply --check`), and
  `pkp/omp#2552` touches none of their files, so it was not tried again.
  The warning under "What goes with it" is read in the code, not seen in
  that trial's records.
- Tips (2026-11-10): OMP `main` f81f129c82 (pkp-lib 8c3971dd1e,
  ui-library 8700ac5d); OMP `stable-3_5_0` ae1d900d35 (pkp-lib
  1e5673c7c7); OMP `stable-3_4_0` 98db039f2 (pkp-lib 2dd24cc5ae); OMP
  `stable-3_3_0` 31f5c517e (pkp-lib df738d3a66).
- Code read on `main`: `CatalogBookHandler::book()`, `book.tpl`,
  `monograph_full.tpl`, OMP's and OJS's `js/load_frontend.js`,
  `vite.config.frontend.js` and `package.json`, `lib/pkp/js/load_frontend.js`,
  `PKPTemplateManager::requiresVueRuntime()` and
  `loadVueComponentStyles()`, `OpenReviewComponent`,
  `SubmissionPeerReviewResource`, `SubmissionPeerReviewSummaryResource`
  and `ReviewerRecommendationSummary` (app-neutral: review rounds of the
  published versions, publicly visible, accepted and confirmed reviews,
  "confirmed" since pkp-lib d1f20f891e read through
  `ReviewAssignment::isConfirmedByEditor()`), `APIRouter`, and OMP's
  `api/v1/peerReviews/index.php` (efbb79bdf7). `git log` of OMP's
  `js/load_frontend.js` (last changed by be6883bb58) against OJS's (the
  reader components came with f649b1ada1). OJS `main` 407246bb8e:
  `ArticleHandler::view()` (lines 220, 246–250) and
  `article_details.tpl`, whose only `data-vue-root` sections are the
  comments (lines 295, 512); no template of the app, its themes or
  lib/pkp reads `$openReviewConfig`. `ContextService` (OJS) and
  `Application::hasCustomizableReviewerRecommendation()` (OMP, line
  223). OJS was not walked: its own report walks the article page.
- 3.5: walked to step 2, where "Edit" has no "Public Visibility"
  section; pkp-lib 3.5 has no public visibility field, no
  `api/v1/peerReviews` and no `OpenReviewComponent`, and OMP no review
  display. 3.4 and 3.3 (code): `git grep` over pkp-lib's classes,
  controllers, API, templates and English locale for the option, and
  over OMP's pages, templates and API for a review display: neither
  exists.
- Upstream search, 2026-11-10 (first 2026-10-13), pkp/pkp-lib, pkp/omp
  and pkp/ui-library, by the symptom's words and by
  `OpenReviewComponent`, `PkpOpenReview`, `peerReviews`,
  `publicationPeerReviews`, `load_frontend`. Read and not the same
  fault: `pkp/pkp-lib#11698` (open; the reader components' groundwork,
  OJS only), `#13205` (open; the double data load in
  `OpenReviewComponent`), `#13242`, `#13524`, `#2976`; `pkp/omp#2160`,
  `#2180`, `#2213`, `#2222`, `#2232` (the feature's OMP sides, none with
  a display), `#2552` (the API's entry point only);
  `pkp/ui-library#817`.
- Not driven: a press with "Make reviewer comments publicly visible with
  published content" on (U69's earlier probe of A26 showed the same
  page); an internal review made public (`SubmissionPeerReviewResource`
  keeps every round of a published version, internal ones included, so
  the section would list it; whether a press wants that is unverified).
- Unverified: whether the new theme of `pkp/pkp-lib#13242` will show the
  reviews on a press.
