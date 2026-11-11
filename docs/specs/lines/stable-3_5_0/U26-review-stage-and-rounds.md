# Review stage & rounds: differences on 3.5

> The spec,
> [Review stage & rounds](../../U26-review-stage-and-rounds.md),
> describes `main`. This page lists only what OJS 3.5 does differently;
> anything not listed is assumed the same. Findings are in the spec's
> register, once, with the versions each is on. How to read this page:
> [README](../README.md).

**Read on** OJS `stable-3_5_0` `7cf6c9c60f` (pkp-lib `5af8e67ab4`,
ui-library `fd00e45f`), 2026-11-11. OMP and OPS were not read.

**Basis.** Scenarios 1 to 12 and 15 were walked on 3.5, twice, each run
on its own scratch journals; scenario 6 was walked on scenario 5's
submission. Scenarios 1, 3 to 11 came out the same. Scenarios 2, 12 and
15 differ and are written out below. Scenarios 13 (a press) and 14 (a
preprint server) were not read. Compared in code only: the status
sentences no scenario reaches ("A review is overdue.", "Returned back to
review.", "New editorial recommendations have been submitted.",
"Submission accepted."), the precedence among them (Rule 6) beyond what
scenarios 8 and 11 show, the flip back when a revised file is deleted
(Rule 7), the line shown once the minimum of confirmed reviews is
reached, form-based reviews in the author's "Read Review" window, and the
Actors rows for the Site Administrator, the Guest Editor and the Funding
Coordinator. <sup>s</sup>

## In short

- The stage, its rounds, the status box and its sentences, the decision
  buttons, the two file panels, the author's "Notifications" list and
  the old addresses behave as on `main`.
- An author can read an open review as soon as the reviewer submits it.
  On `main` an editor confirms the review first.
- An editor confirms a review with "Confirm" in the window "Read Review"
  opens, titled "Review: {submission title}". `main`'s "Review Details"
  window and its "Mark as Complete" are not here.
- There is no formal author response to reviews: no "Author Response"
  table for the editor, no "Author Response" card for the author.
- The stage's discussions are the list headed "Review Discussions" with
  "Add discussion", in both views. That list belongs to *Tasks &
  discussions*.

## Actors & permissions

| Action (the spec's row) | Kind | On 3.5 |
|---|---|---|
| **Read a completed review** (author view) | different here | Author: only reviews conducted openly, as soon as the reviewer has submitted the review. No editor's confirmation is needed (Rule 15) <sup>a</sup> |

## Rules & state

- **Rule 14, different here.** **The author's view** of the same
  screen, per round, always shows the Revisions Uploaded panel with the
  upload button (Rule 9) and the stage's discussions. A "Notifications"
  list appears once an editor has sent the author a letter (Rule 16). A
  list of the reviews they may read appears once such a review exists
  (Rule 15). A submission fresh in review therefore shows only the two
  ever-present panels; the other two appear once their preconditions are
  met. Nothing else is ever added: an editor cannot ask for a formal
  response to the reviews, and no response panel appears, also not on a
  round where revisions were requested. <sup>c</sup>
- **Rule 15, different here.** **Reading reviews as the author.** Only
  reviews conducted **openly** are ever listed for the author. An open
  review is listed as soon as the reviewer has submitted it: the author
  reads it before any editor has opened or confirmed it. An editor's
  confirmation ("Read Review" › "Confirm") changes nothing on the
  author's screen. Until a reviewer has submitted an open review, the
  author's screen shows no reviewers list at all, not even an empty one.
  Anonymous reviews never appear, whatever their state, also not once
  an editor has confirmed them. Each listed review offers "Read Review",
  which opens a window titled "Review: {submission title}" with three
  parts. First, the reviewer's name, completion date and
  recommendation. Second, the review text the author is meant to see:
  for form-based reviews, only the questions marked for authors, each
  with its answer; for free-text reviews, only the remarks the reviewer
  shared "For author and editor", under "Reviewer Comments". Remarks
  meant for the editor alone never show. Third, a section for files the
  reviewer attached
  ([A3](../../U26-review-stage-and-rounds.md#a3)). <sup>a</sup>

## Cross-feature interactions

- **Author response to reviews, not here.** 3.5 has no response request
  and no response panel on this stage. <sup>c</sup>

## Canonical scenarios

- **S2, different here.**

  Given: Editor, on a Round 1 that reads "Waiting for reviewers to be
  assigned.", with a Reviewer of the journal ready to review.

  - **"Add Reviewer"**: in the Reviewers panel add the reviewer: the box
    reads "Awaiting responses from reviewers."
  - **The reviewer's review**: Reviewer: accept the request, then submit
    the review with the recommendation "Accept Submission". Editor: the
    box reads "New reviews have been submitted."
  - **"Read Review"**: in the Reviewers panel press "Read Review" on the
    reviewer's row: a window titled "Review: {submission title}" opens,
    with the reviewer's name. Press "Confirm" at its foot: the box reads
    "All reviews are confirmed and a decision is needed."
  - **Control**: with the request accepted and the review not yet
    submitted, the box still reads "Awaiting responses from
    reviewers.". <sup>b</sup>

- **S12, different here.**

  Given: Author, with two submissions in review: the first with an open
  review accepted and not yet submitted, and a decision letter already
  sent to them; the second with a completed anonymous review and no
  letter.

  - **Fresh in review**: open the second submission's review stage: the
    "Revisions Uploaded" panel and the discussions list are there; no
    "Notifications" list, no reviewers list (not even an empty one), and
    no "Upload revisions" button, the round having no revision request.
  - **An open review under way**: open the first submission's review
    stage: no reviewers list yet.
  - **Reviewer**: the open reviewer types "Shared remarks for the
    author." in "For author and editor" and "Private remarks for the
    editor." in "For editor", and submits the review with the
    recommendation "Accept Submission".
  - **Submitted, not confirmed**: Author: the first submission's review
    stage now lists the reviewer, with "Open" and "Read Review", although
    no editor has opened the review yet.
  - **"Read Review"**: open it: the window, titled "Review: {submission
    title}", shows the reviewer's name, "Completed:" with the date and
    "Recommendation: Accept Submission", then the typed remark "Shared
    remarks for the author." under "Reviewer Comments" › "For author and
    editor". "Private remarks for the editor." is nowhere in the window.
    The window's attachments section is outside this scenario's pass or
    fail ([A3](../../U26-review-stage-and-rounds.md#a3)).
  - **The editor confirms**: Editor: the reviewer's row › "Read Review":
    the window shows both remarks. Press "Confirm". Author: the review
    stage lists the reviewer with "Read Review" exactly as before.
  - **"Notifications"**: on the same screen the "Notifications" list
    holds the decision letter as a subject line and a date. Click it: the
    full letter opens read-only in a side panel.
  - **Old addresses**: open `{journal}/authorDashboard/submission/{id}`
    with the first submission's id: My Submissions opens with that
    submission's workflow open. Open
    `{journal}/authorDashboard/reviewRoundInfo/{id}`, then the same
    address without an id: a bare "404 Not Found" page each time.
  - **Control**: the second submission's review stage, its anonymous
    review completed, shows no reviewers list at all, not even an empty
    one. <sup>a</sup>

- **S15, different here.**

  Given: Editor, on a scratch journal whose "Minimum Confirmed Reviews
  Required" is 2, on the current round of a submission whose one reviewer
  accepted the request.

  - **The review underway**: the box reads "Minimum number of confirmed
    reviews required: 2." with "Awaiting responses from reviewers."
    beneath it.
  - **The review submitted**: Reviewer: submit the review. Editor: the
    box reads "Minimum number of confirmed reviews required: 2." with
    "New reviews have been submitted." beneath it.
  - **"Read Review"**: in the Reviewers panel press "Read Review" on the
    reviewer's row and press "Confirm" in the window titled "Review:
    {submission title}": the box reads "Minimum number of confirmed
    reviews required: 2." alone; "All reviews are confirmed and a
    decision is needed." does not appear.
  - **Control**: on a journal whose "Minimum Confirmed Reviews Required"
    is 0, scenario 2's confirmed review reads "All reviews are confirmed
    and a decision is needed." with no minimum line. <sup>b</sup>

## Code anchors

- pkp-lib `templates/controllers/grid/users/reviewer/readReview.tpl`:
  the editor's "Review: {submission title}" window with "Confirm".

## Footnotes — evidence

<a id="fn-a"></a>**a** — Walked 2026-11-11, runs `s1` and `s2`, part
`s12` of `shared/playwright/checks/lines/stable-3_5_0/U26/walk.js`.
Snapshots in `.reports/lines35/u26/`: `s12-au-open-underway` (no list),
`s12-au-open-submitted` (the row "{reviewer} Open Read Review" before
any editor opened the review), `s12-au-read-review-before-confirm` and
`s12-au-read-review` (the window's text, read without its attachments
section), `s12-ed-read-review` (both remarks on the editor's side),
`s12-au-open-confirmed`, `s12-au-control-fresh` and `s12-au-control-end`
(the anonymous control); `s2-au-confirmed` (a confirmed anonymous
review: no list); the rows of `s12-checks`. Code: ui-library
`useSubmission.js` `getOpenAndCompletedReviewAssignmentsForRound()` keeps
the open reviews that carry `dateCompleted`, where `main` keeps the ones
with `isConfirmedByEditor` (pkp/pkp-lib#13602, `main` only: no commit
names it in the 3.5 histories of pkp-lib, ui-library or ojs); the
submission payload on 3.5 has no `isConfirmedByEditor`
(`PKP\submission\maps\Schema::getPropertyReviewAssignments()`). The
author's window itself is the same template on both lines
(`authorReadReview.tpl`).

<a id="fn-b"></a>**b** — Walked 2026-11-11, runs `s1` and `s2`, parts
`s2` and `s15` of the same script. Snapshots: `s2-ed-submitted`,
`s2-ed-read-review` (title "Review: {submission title}", the reviewer's
name, the sentence 'Once this review has been read, press "Confirm" to
indicate that the review process may proceed.', the buttons "Download
Review Form" and "Confirm", the link "Cancel"), `s2-ed-confirmed`;
`s15-ed-underway`, `s15-ed-submitted`, `s15-ed-read-review`,
`s15-ed-confirmed`, `s15-z-confirmed` (the control journal). The
reviewer's row reads "Review Submitted" before and "Complete" after.
Code: ui-library `useReviewerManagerActions.js` `reviewerReadReview()`
opens the legacy `readReview` window; `ReviewDetailsModal.vue` is `main`
only. On the reviewer's own page the recommendation list is the field
`recommendation` on 3.5 (`reviewerRecommendationId` on `main`), with
"Accept Submission" among its options.

<a id="fn-c"></a>**c** — Walked 2026-11-11, runs `s1` and `s2`. The
author's review stage after "Request Revisions" shows the headings
"Round 1 Status", "Notifications", "Revisions Uploaded" and "Review
Discussions" and nothing else (`s3-au-review-stage`,
`s12-au-open-underway`); the editor's shows "Round 1 Status",
"Revisions Uploaded", "Files for Review", "Reviewers", "Review
Discussions" and "Participants" (`s3-ed-requested`). Code: ui-library
3.5 has no `ReviewRoundResponseManager`, and
`workflowConfigAuthorOJS.js` and `workflowConfigEditorialOJS.js` add no
response component to the review stage; pkp-lib 3.5 has no
`classes/submission/reviewRound/authorResponse/`.

<a id="fn-s"></a>**s** — The walk: `walk.js` (above), parts `s1` to
`s15` and `reg`, runs `s1` and `s2`; each part writes
`<part>-checks-<run>-ojs.json`, one row per sentence of the scenario
with what the 3.5 screen gave. Every part runs on a scratch journal of
its own with throwaway accounts, never on the seeded journal. Two things
the spec's recipe (its footnote s) needs differently on 3.5: a
submission seeded with two `reviewRounds[]` entries answers 500, so
scenario 7's Round 2 comes from the seeded decisions
`['sendExternalReview', 'newExternalReviewRound']` and its reviewer is
added on screen with "Add Reviewer"; and a review is confirmed with
"Confirm", as scenarios 2 and 15 say above. Code compared at pkp-lib
`origin/main` `e2078ce20e` and ui-library `origin/main` `f2a4757a`: the
round's status logic (`ReviewRound::determineStatus()`), the status box
(`WorkflowSubmissionStatus.vue`, apart from where it takes the stage
names, which read the same), the review stage's decision buttons, the
review-files grids, the author's review window, the revised-version
notice and the English status sentences are the same on both lines.
