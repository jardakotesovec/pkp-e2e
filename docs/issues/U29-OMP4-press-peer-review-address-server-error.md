# Every request to a press's public peer-review API address fails with a server error

- **Severity** low
- **Effort** small
- **Kind** regression
- **Crash** server
- **Affects**
  - main: OMP
  - 3.5: none (no such address)
  - 3.4: none (code; no such address)
  - 3.3: none (code; no such address)
- **Introduced** `pkp/pkp-lib#12057` for `pkp/pkp-lib#12044` · [2d407aa929](https://github.com/pkp/pkp-lib/commit/2d407aa9292d0e0c1f2ac96f6120a901a75bf0be) · 2026-01-12 · Taslan A. Graham (taslangraham); OMP took it in [755ffb303](https://github.com/pkp/omp/commit/755ffb303da85734a8235b2df50f0fa55218623b) (2026-01-15) without the entry point rename OJS got in `pkp/ojs#5228`
- **Upstream** none found (2026-11-05)
- **Tracked in** spec U29 [OMP4](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U29-review-setup-and-review-forms.md#omp4)
- **Checked** 2026-11-05, each branch's tip (the commits in Evidence)
- **Model** claude-opus-5-5

## Summary

On `main`, a journal gives out the public reviews of its published
articles at the address `api/v1/peerReviews`. A press has its own
address for them, `api/v1/publicationPeerReviews`, but every request to
it fails on the server, signed in or not, whatever path or query follows
it: the answer is a server error with an empty page, where the press's
public reviews are expected.

No screen calls the address, so only a program reading a press's public
reviews meets the error, and it cannot get them any other way. No
released press has the address: it exists on `main` only. Preprint
servers have no review stage, so they have no such address.

The proposed fix moves presses to `api/v1/peerReviews`, as OJS did.

## Impact

- **Lost**: a program (an aggregator, a plugin, an indexing service)
  cannot read a press's published reviews. Nothing stored is lost; each
  request writes a fatal error to the server log.
- **Who**: API clients of presses on `main` that publish reviews. An
  editor publishes a review by ticking "Publicly Show Reviewer Comments"
  on it. The press setting with the same label (Settings › Workflow ›
  Review › "Setup") only ticks that box in advance on review
  assignments made after it is set.
- **Way round**: none. The press has no working address for its
  reviews.

Low: the address is on `main` only, the error shows (a server error, a
fatal line in the log), and the press's book page does not use the
address. It would be medium once a theme or service a press relies on
reads its reviews through the API.

## Steps to reproduce

Preconditions:

- PKP's default test dataset for OMP `main`, press `publicknowledge`.
- Book 5, "Bomb Canada and Other Unkind Remarks in the American Media",
  is published. Nothing to create.

Each step types an address in the browser's address bar (a GET):

1. Signed out, open
   `<install>/index.php/publicknowledge/api/v1/publicationPeerReviews/open/submissions/5`.
2. Signed out, open
   `<install>/index.php/publicknowledge/api/v1/publicationPeerReviews/open/submissions/5/summary`.
3. Signed out, open
   `<install>/index.php/publicknowledge/api/v1/publicationPeerReviews`,
   with nothing after it.
4. Sign in as `dbarnes` and open the address of step 1 again.

**Expected:** a JSON answer: the book's public review record, as a
journal gives it at `api/v1/peerReviews/open/submissions/<id>`. For a
book with no review made public that is
`{"submissionId":5,"reviewRounds":[],…}`.

**Observed:** all four requests answer the same, with nothing on the
page:

```
HTTP 500, text/html; charset=utf-8, empty body
```

The server log has, for each (PHP 8.3):

```
PHP Fatal error:  Uncaught Error: Class "PKP\API\v1\publicationPeerReviews\PublicationPeerReviewController" not found in …/api/v1/publicationPeerReviews/index.php:16
Stack trace:
#0 …/lib/pkp/classes/core/APIRouter.php(132): require()
#1 …/lib/pkp/classes/core/Dispatcher.php(157): PKP\core\APIRouter->route()
```

On the press, `api/v1/peerReviews/open/submissions/5` answers 404
`api.404.endpointNotFound`. On OJS `main`, signed out,
`api/v1/peerReviews/open/submissions/1` answers 200 with the article's
record.

## Cause

OMP's API entry point `api/v1/publicationPeerReviews/index.php` builds
`new \PKP\API\v1\publicationPeerReviews\PublicationPeerReviewController()`
(line 16), and pkp-lib no longer has that class. `APIRouter::route()`
`require`s the entry point for any request whose path starts with
`api/v1/publicationPeerReviews`, before any route or access check, so
every request ends in PHP's "Class not found" fatal error and an empty
500.

The entry point came with the API's first version
([9ae771fce](https://github.com/pkp/omp/commit/9ae771fce6e2e186872223a64ec0f38faaae7e8b),
`pkp/omp#2160`, for `pkp/pkp-lib#11922`, 2025-11-04), the same day the
class reached pkp-lib's `main`
([222d16a881](https://github.com/pkp/pkp-lib/commit/222d16a8815cdadb92a2affe8a6d4f5d60c6fb76)).
OMP's lib/pkp pointers from then until January carry the class, so the
address worked on `main` until the change below (read in the code, not
walked).

`pkp/pkp-lib#12057` (for `pkp/pkp-lib#12044`) then put every open peer
review route in one controller under one path: it deleted
`PublicationPeerReviewController` and added
`PKP\API\v1\peerReviews\PeerReviewController`, whose `getHandlerPath()`
is `peerReviews`. OJS renamed its entry point to match
([d52efd5f6f](https://github.com/pkp/ojs/commit/d52efd5f6f1744fdea0b2537007b63b2e06e47f6),
`pkp/ojs#5228`). OMP's PR for `pkp/pkp-lib#12044`, `pkp/omp#2191`, only
moved the submodule and did not rename the entry point. It broke when
OMP's lib/pkp moved past the change (755ffb303, 2026-01-15).

The reach:

- **Other entry points.** Every `api/v1/*/index.php` of OJS, OMP and OPS
  `main` was checked against lib/pkp and the app's own `api/` classes:
  this is the only one that names a class that does not exist (checked
  in the code).
- **OPS** has no review stage and no peer review entry point (checked
  in the code).
- **The book page** does not use the address; its missing public reviews
  are a separate fault with its own fix
  ([U69 A26 report](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/issues/U69-A26-book-page-public-review-never-shown.md)).

## Proposed fix

A proposal: rename OMP's entry point to `api/v1/peerReviews/index.php`
and point it at the controller that exists, exactly as OJS did in
`pkp/ojs#5228`
([fix.diff](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/press-peer-review-address-server-error/fix.diff)):

```diff
-// api/v1/publicationPeerReviews/index.php
-return new \PKP\handler\APIHandler(new \PKP\API\v1\publicationPeerReviews\PublicationPeerReviewController());
+// api/v1/peerReviews/index.php
+return new \PKP\handler\APIHandler(new \PKP\API\v1\peerReviews\PeerReviewController());
```

A press then serves its public reviews at the same address as a
journal, which is what `pkp/pkp-lib#12044` meant by one path for both.
The old address answers 404 like any unknown one; no client can rely on
it, since it has failed for every request since January.

Tried on OMP `main`: steps 1–4 answer 404 `api.404.endpointNotFound`,
and `api/v1/peerReviews/open/submissions/5` answers 200
`{"submissionId":5,"reviewRounds":[],"reviewerRecommendationsSummary":[]}`.
To see a record with a review in it, on the default dataset (Adela
Gallego's round 1 review of submission 16 is already submitted there):

1. Sign in as `dbarnes` and open submission 16, "A Designer's Log: Case
   Studies in Instructional Design".
2. In "Reviewers", Adela Gallego's row: "More Actions" › "Edit". Choose
   "Open", tick "Publicly Show Reviewer Comments", press "OK".
3. Her row: "Read Review", then "Mark as Complete", and "Mark as
   Complete" again in the dialog.
4. "Accept Submission", then "Send To Production", each through its
   steps to "Record Decision".
5. "Publication" › "Title & Abstract" › "Publish", then "Publish" in the
   window.
6. Sign out and open
   `<install>/index.php/publicknowledge/api/v1/peerReviews/open/submissions/16`.

With the fix, step 6 lists Adela Gallego's review alone; Al Zacharia's
and Gonzalo Favio's reviews, not made public, are left out. Book 5's
record stays empty. Without the fix, both books answer 404 at
`api/v1/peerReviews`, and book 16 answers 500 at the old address.

**Alternatives:**

- Delete OMP's entry point: the crash goes, but a press loses the API
  the feature's issue (`pkp/pkp-lib#11922`) built for it while still
  offering "Publicly Show Reviewer Comments". Only right if presses are
  not meant to publish reviews, which is a product call.
- Bring back a `PublicationPeerReviewController` in pkp-lib for the old
  path: two paths for one record, against the change's intent.

**What goes with it:**

- The press then serves the same record a journal does, so two reports
  against that record reach presses too; their fixes are in pkp-lib and
  cover both apps, so land them first or together with this one:
  - [U29 OJS1](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/issues/U29-OJS1-public-review-data-editor-only-answers.md):
    a review made public gives anyone, without signing in, the review
    form answers meant for the editor only.
  - [U30 A10](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/issues/U30-A10-public-review-data-unpublic-author-response.md):
    anyone, without signing in, can read an author's response that also
    answers reviews the editor kept private.
- A press has no reviewer recommendation types, so its record's
  recommendation summary is always empty, and each request for a book
  with a completed public review writes
  `PHP Warning:  Attempt to read property "type" on null in …/lib/pkp/api/v1/peerReviews/resources/ReviewerRecommendationSummary.php on line 89`.
  `getSummaryCountForReviewerRecommendation()` reads
  `->get($review->getReviewerRecommendationId())->type` without a null
  check. A `continue` for a review whose recommendation is not among the
  context's types keeps the reviewer out of the count without the
  warning (a nullsafe `?->type` would store `null` for that reviewer,
  which `buildSummaryCount()` then ignores). Either is a one-line pkp-lib
  change the team may take with this one.
- No data repair, no backport: 3.5 and older have no such API.
- The guard: a unit test in each app that `require`s every
  `api/v1/*/index.php` and checks it returns an `APIHandler` would have
  caught this, and any later rename that misses an app.

Small: one file renamed in OMP, following OJS's rename.

## Evidence

- Kept script:
  [walk.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/press-peer-review-address-server-error/walk.js)
  (helpers in `lib.js` beside it): steps 1–4 and the `peerReviews`
  comparison on OMP, the comparison alone on OJS. With the argument
  `public` (OMP only) it takes the fix check's steps 1–6 on submission
  16 and also reads `…/16/summary`, `…/5` and the old address. Run on an
  install freshly loaded from the default dataset (pkp/datasets
  7421d2a8, 2026-11-04, PostgreSQL), with the fix in and out:
  `node bin/probe.js omp shared/playwright/checks/issues/press-peer-review-address-server-error/walk.js [public]`.
- Tips: OMP `main` 828150a8fe (pkp-lib 1ae711024a); OJS `main`
  9552aa521a (pkp-lib 25fdc98a3e); OMP `stable-3_5_0` e81eefc11c
  (pkp-lib c4c0aa8c52); OMP `stable-3_4_0` e92ae5b6d (pkp-lib
  2dd24cc5ae); OMP `stable-3_3_0` 220e3e2f7 (pkp-lib df738d3a66).
- 3.5 walked: steps 1–4 and the `peerReviews` address all answer 404
  `api.404.endpointNotFound`; neither OMP 3.5 nor its pkp-lib has a peer
  review entry point or controller. 3.4 and 3.3 (code): no peer review
  entry point or controller in the OMP or pkp-lib branch.
- The working window: OMP's lib/pkp pointers from 0f2fb89e2
  (2025-11-05) to 3590f45da (2025-12-15) that the clone holds all carry
  `api/v1/publicationPeerReviews/PublicationPeerReviewController.php`
  (namespace `PKP\API\v1\publicationPeerReviews`, handler path
  `publicationPeerReviews`). Not walked at those pointers.
- A tester's comment on `pkp/pkp-lib#12594` (closed) notes "OMP didn't
  have the api endpoints but I'm not sure they are supposed to", with no
  issue opened.
- Unverified: whether a journal review without a recommendation can
  reach the same warning on OJS.
