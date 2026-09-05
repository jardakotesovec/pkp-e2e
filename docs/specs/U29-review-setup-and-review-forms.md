---
name: review-setup-and-review-forms
scope: A manager configures how peer review runs in the journal — the default review type, deadlines, automatic reminders, reviewer guidance, review forms and (on a journal) the recommendation options a reviewer picks from
apps: [ojs, omp]
shared: pkp-lib
status: verified
atlas-claims: [AFFW-669, AFFW-670, AFFM-065, AFFM-066, AFFM-067, AFFM-068, AFFM-069, AFFM-070, AFFM-071, AFFM-072, AFFM-073, AFFM-074, AFFM-075, AFFM-076, AFFM-077, AFFM-078, AFFM-079, AFFM-080, AFFM-081, GRID-046, GRID-047, GRID-059, GRID-060, VUE-047, VUE-069, API-054, JOB-054]
---

# Review setup & review forms {OJS OMP}

> Conventions (markers, badges, footnotes): [Reading a spec](GLOSSARY.md#reading-a-spec).

## Purpose

A Journal Manager decides how peer review runs before any reviewer is
asked: which review type a new request starts with, how many weeks a
reviewer gets to answer and to finish, when the journal reminds a reviewer
by itself, what guidance and competing-interests policy a reviewer reads,
which structured review forms an editor can attach to a request, and, on a
journal, which recommendation options a reviewer can pick from. All of it
sits on one screen, Settings › Workflow › "Review", in four side tabs. This
spec owns that screen, the automatic reminder clocks it sets, and the
review-form editor. The places where the settings take effect belong to
their own screens and are only pointed at here: the editor's Add Reviewer
window ([→ reviewer assignment](U27-reviewer-assignment-and-management.md#due-dates)),
the reviewer's wizard ([→ reviewer's review](U28-reviewers-review.md#wizard))
and the round status box ([→ review stage](U26-review-stage-and-rounds.md#round-status)).

OPS installs no review stage, so a preprint server's Settings › Workflow
has no "Review" tab: its tabs read "Submission", "Preprint Server
Library", "Emails" and "Tasks and Discussions". None of the screens in
this spec exists there, and the test tooling refuses to configure review
settings on a preprint server (scenario 12). <sup>p</sup>

A press has two review stages, so its "Reviewer Guidance" tab carries two
guideline boxes, "Internal Review Guidelines" and "External Review
Guidelines", where a journal has one "Review Guidelines" box
[OMP2](#omp2). A press collects no reviewer recommendation, so it has no
"Reviewer Recommendations" tab [OMP1](#omp1). Everything else on the
screen is the same. <sup>q</sup>

## Actors & permissions

**Terms used below.** A **settings role** is a role whose configuration
grants access to the journal's Settings: by default Journal Manager,
Editor and Production Editor (the roles at the manager level; which roles
carry that access is *Roles configuration* territory). A review form is
**in use** once at least one review request that was not declined carries
it (Rule 12). A recommendation option is **in use** once any reviewer has
chosen it (Rule 18). <sup>a</sup>

| Action | Who may, and when |
|--------|--------------------|
| **Open Settings › Workflow › "Review"** and its side tabs | • Site Administrator, and every settings role in this journal: always<br>• Section Editor, Guest Editor, assistant-level roles, Reviewer, Author, Reader: the sidebar offers no "Settings"; the typed address shows the access-denied page, "The current role does not have access to this operation." <sup>a</sup> |
| **Save the "Setup" and "Reviewer Guidance" forms** | • The same accounts as the row above <sup>a</sup> |
| **Create, edit, copy, preview, reorder, activate, deactivate and delete review forms**, and edit their items | • The same accounts as the row above. "Edit" and "Delete" are offered only while the form is not in use (Rule 12); "Copy", "Preview" and the "Active" box are offered always <sup>b</sup> |
| **Add, edit, activate, deactivate and delete recommendation options** {OJS} | • The same accounts as the row above. A row's "Edit" and "Delete" are offered only while the option is not in use; the "Activate" box is offered always (Rule 18) <sup>c</sup> |

## Fields & validation

**"Setup" side tab** (one form, one "Save" at the bottom). The three
number boxes are checked on save. A refused form keeps the typed value in
its box, shows the message under it ("This is not a valid integer." for
letters or a decimal, "This must be at least 0." for a negative number)
and a line above "Save" ("Please correct one error. Go to {field}: {the
message} Jump to next error"; with several boxes wrong it reads "Please
correct {n} errors." and repeats "Go to {field}: {message}" for each), and
no "Saved". <sup>d</sup>

| Field (UI label) | Required? | Rules |
|------------------|-----------|-------|
| "Default Review Mode" | yes (one is always selected) | Radios "Anonymous Reviewer/Anonymous Author" (the install default), "Anonymous Reviewer/Disclosed Author", "Open". Preselects "Review Type" in the Add Reviewer window (Rule 2) |
| "Publicly Show Reviewer Comments" | no | One box, "Make reviewer comments publicly visible with published content", under the explanation "Enable this setting if you'd like the review process to be made publicly visible alongside published submissions. …". Off by default. Preselects "Public Visibility" in the Add Reviewer window (Rule 2) |
| "Restrict File Access" | no | One box: "Reviewers will not be given access to the submission file until they have agreed to review it." {OJS} / "Reviewers will have access to the submission file only after agreeing to review it." {OMP}. Off by default. Effect: Rule 5 |
| "One-click Reviewer Access" | no | Under "Reviewers can be sent a secure link in the email invitation, which will log them in automatically when they click the link.", one box "Include a secure link in the email invitation to reviewers.". Off by default. Effect: Rule 5 |
| "Reviewer Suggestion at Submission" | no | Under "Author can suggest several potential reviewers before completing the submission …", one box "Allow authors to suggest potential reviewers at submission process". Off by default. Effect: Rule 6 |
| "Default Response Deadline" | no | Small text box, "Number of weeks to accept or decline a review request." Whole number of weeks, 0 or more; 4 on a fresh journal. Effect: Rule 3; 0 and an empty box both give 3 weeks ⚠ [A4](#a4) |
| "Default Completion Deadline" | no | Small text box, "Weeks allowed to complete the review" {OJS} / "Weeks allowed for review completion" {OMP}. Whole number of weeks, 0 or more; 4 on a fresh journal. Effect: Rule 3; 0 and an empty box both give 4 weeks ⚠ [A4](#a4) |
| "Minimum Confirmed Reviews Required" | no | Small text box, "Minimum number of confirmed reviews required for a submission". Whole number, 0 or more; 0 on a fresh journal. Effect: Rule 4 |
| "Set Reminders for Review" | — | A heading with the explanation "Send an email reminder before or after for review request response (if reviewer has not responded to review request yet) or review submission (if reviewer has not submitted review yet)", followed by the four sliders below |
| "Review Request Response - Before Due Date", "Review Request Response - After Due Date", "Review Submission - Before Due Date", "Review Submission - After Due Date" | no | Four sliders from "None" to 14, whole days, moved with the mouse or the arrow keys (End jumps to 14). The box beside each reads "No reminder set" at 0, otherwise "{n} days before due date" or "{n} days after due date" (at 1 it still reads "1 days"). All four at 0 on a fresh journal. Effect: Rule 8 |

**"Reviewer Guidance" side tab** (one form, one "Save"). Every text box
here is typed per language of the journal's forms (Rule 16); the reviewer
sees the text in the language they are reading in. <sup>e</sup>

| Field (UI label) | Required? | Rules |
|------------------|-----------|-------|
| "Internal Review Guidelines" {OMP} | no | Rich text with a shorter toolbar (no quote or list buttons) ⚠ [OMP3](#omp3); shown to Internal Reviewers on their wizard's step 2 [OMP2](#omp2) |
| "Review Guidelines" {OJS} / "External Review Guidelines" {OMP} | no | Rich text (bold, italic, superscript, subscript, link, quote, lists). Empty on a fresh journal. Effect: Rule 5 |
| "Competing Interests" | no | Rich text, same toolbar. Empty on a fresh journal. Effect: Rule 5 |
| The anonymity box (no heading of its own) | no | One box, "Present a link to how to ensure all files are anonymized during upload". Its words "how to ensure all files are anonymized" are a button: pressing them opens the dialog "How to ensure all files are anonymized" with the journal's anonymity checklist and a "Close" button, without changing the box. Off by default. Effect: Rule 7 |

**"Create Review Form" / "Review Form" window** (the review-forms list's
"Create Review Form" link, and the first tab of a form's "Edit"
window). <sup>f</sup>

| Field (UI label) | Required? | Rules |
|------------------|-----------|-------|
| "Title" | yes | Plain text, per language (Rule 16). Left empty, "Save" is refused in the window with "This field is required." under "Title" |
| "Description and Instructions" | no | Rich text, per language. Shown to the reviewer under the title on their step 3 |

**"Create New Item" / "Edit" window** (the "Form Items" tab of a form's
"Edit" window). <sup>g</sup>

| Field (UI label) | Required? | Rules |
|------------------|-----------|-------|
| "Item" | yes | Rich text, per language: the question the reviewer answers. Left empty (with a type chosen), "Save" is refused with a red notice at the top right, "Errors occurred processing this form" and "A question is required for the form item. (English)" |
| "Description" | no | Rich text, per language; shown under the question |
| "Reviewers required to complete item" | no | Box, off for a new item. On, the reviewer cannot submit the review with it unanswered ([→ the wizard's form questions](U28-reviewers-review.md#step-3)) |
| "Included in message to author" | no | Box, **on** for a new item. Off marks the question as not for the author; the author's own review screen is described at [→ reading reviews as the author](U26-review-stage-and-rounds.md#author-read-review) |
| "Item type" | yes | Drop-down opening on "Choose item type"; left there, "Save" is refused in the window with "This field is required." under "Item type". The types, in order: "Single word text box", "Single line text box", "Extended text box", "Checkboxes (you can choose one or more)", "Radio buttons (you can only choose one)", "Drop-down box" |
| "Response Options" (the list under the type, link "Add Item") | for the last three types | Each row is one answer the reviewer can pick, per language. The list accepts rows whatever the type shows, with no notice on a type change; saving with a text type chosen drops the rows for good (the reopened item's list reads "No Items"). Only "Checkboxes …", "Radio buttons …" and "Drop-down box" show the rows to the reviewer; a text type shows a box and no rows (Rule 15) |

**"Add Recommendation" / "Edit Recommendation" window** {OJS} (the
"Reviewer Recommendations" tab). <sup>c</sup>

| Field (UI label) | Required? | Rules |
|------------------|-----------|-------|
| "Review Recommendations" | yes | Plain text, per language, hint "e.g. accept, reject": the words the reviewer sees in the "Recommendation" list. Left empty, "Save" is refused with "This field is required." under the box and a line above "Save" ("Please correct 2 errors. Go to Review Recommendations: This field is required. Go to Recommendation type: This field is required. Jump to next error"; "Please correct one error. …" for a single box), and "Save" stays disabled until every flagged box is corrected |
| "Recommendation type" | yes | Drop-down that opens blank: "Approved", "Not Approved", "Revisions Requested", "With Comments". Left blank, refused with "This field is required." under it. A classification of the option (Rule 18); it changes nothing on this screen |
| The status drop-down (no label) | yes | "Active Upon Saving" (preselected) or "Deactivate" |

## Rules & state

<a id="review-settings"></a>
1. **Where the settings live.** Settings › Workflow shows a "Review" tab
   after "Submission". Inside it, side tabs "Setup", "Reviewer Guidance",
   "Review Forms" and, on a journal, "Reviewer Recommendations"
   [OMP1](#omp1). "Setup" and "Reviewer Guidance" are forms with their own
   "Save"; a successful save shows "Saved" to the left of the button and
   nothing else on the page changes. The address bar follows the side
   tab, but reloading or bookmarking that address opens "Submission" ›
   "Disable Submissions", not the Review tab ⚠ [A5](#a5). Switching side
   tabs keeps an unsaved change (the box still shows it on return);
   leaving the page from the sidebar drops it without a warning, and the
   tab shows the saved values again when reopened. <sup>d</sup>
2. **Defaults feed new requests only.** "Default Review Mode",
   "Publicly Show Reviewer Comments", the two deadlines and the active
   review forms are what the editor's Add Reviewer window starts from
   ([→ the window's defaults](U27-reviewer-assignment-and-management.md#due-dates)).
   Saving a change here alters no existing review request: a reviewer
   already assigned keeps their review type, dates, visibility and form.
   The change is visible the next time an Add Reviewer window opens.
   <sup>d</sup>
3. **Deadlines.** The two deadline boxes are whole numbers of weeks. Each
   new request's "Response Due Date" is today plus the response weeks and
   its "Review Due Date" today plus the completion weeks. A response box
   at 0 or empty gives 3 weeks, and a completion box at 0 or empty 4
   weeks; the tab never shows either number ⚠ [A4](#a4). Anything that is not a whole
   number of 0 or more is refused on save with the message under the box
   (Fields). <sup>d</sup>
4. **Minimum confirmed reviews.** "Minimum Confirmed Reviews Required" is
   read by the review stage's round status box, which then names the
   minimum and holds back its "all reviews confirmed" sentence until that
   many reviews are confirmed
   ([→ the round status box](U26-review-stage-and-rounds.md#round-status)).
   0, the default, means no minimum. <sup>d</sup>
5. **What the reviewer meets.** "Restrict File Access", "One-click
   Reviewer Access", the guidelines and the competing-interests policy
   change the reviewer's own screens and emails and nothing on the
   editor's: the files' step, the sign-in-free link, the text of step 2
   and the competing-interests question of step 1
   ([→ the reviewer's wizard](U28-reviewers-review.md#wizard)). A policy
   text that is empty asks no question; a guidelines box that is empty
   shows the wizard's "no guidelines" sentence. <sup>e</sup>
6. **Reviewer suggestions.** "Reviewer Suggestion at Submission" adds the
   author's "Reviewer Suggestions" step (5 of 6) to the submission wizard
   and, once an author has suggested someone, a "Reviewers Suggested by
   Author" panel to that submission's workflow (the Submission stage and
   the review stage). A submission without suggestions shows no panel.
   Off, the wizard has five steps and the panel is hidden even where
   suggestions were stored; both belong to *Reviewer suggestions*.
   <sup>d</sup>
7. **The anonymity link.** With the "Reviewer Guidance" box ticked, the
   file-upload window opened on the Submission stage ("Submission Files"
   › "Upload") and on the review stages ("Upload/Select Files" › "Upload
   Review File") shows, on its step "1. Upload File", the link "How to
   ensure all files are anonymized" under the component list at the top
   of the step (under the drop zone once a component is chosen). It opens
   the same
   dialog the box's own words open, here with "OK" and "Cancel" buttons.
   Unticked, the upload window has no such link. The upload window itself
   is *Submission files* territory. <sup>e</sup>
<a id="reminder-clocks"></a>
8. **The reminder clocks.** The four sliders arm automatic reminder emails
   to reviewers, checked once a day by the install's scheduled task,
   which no screen on the test installs runs. <sup>h</sup> A slider at 0
   ("No reminder set") arms nothing. Which clock applies depends on where the request
   stands:
   - while the request is unanswered, the two "Review Request Response"
     clocks count from the "Response Due Date";
   - once accepted and until the review is submitted, the two "Review
     Submission" clocks count from the "Review Due Date".

   A "Before Due Date" reminder goes out on the first daily check that
   falls within that many days before the due date, and only if no
   reminder (automatic or the editor's "Send Reminder") has been sent in
   that phase yet. An "After Due Date" reminder goes out on the first
   daily check that many or more days after the due date, and only if a
   reminder was already sent in that phase before the due date
   ⚠ [A1](#a1). Each clock fires at most once per request; the reviewer's
   answer clears the request's reminder history, so the "Review
   Submission" clocks start fresh. No reminder goes to a declined or
   cancelled request, to a submitted review, or to a request on a
   submission that has been declined or published. <sup>h</sup>
9. **What the reminder sends.** The response reminder is the journal's
   "Review Response Overdue (Automated)" email, subject "Will you be able
   to review this for us?"; the submission reminder is "Review Reminder
   (Automated)", subject "A reminder to please complete your review". Both
   are sent from the journal's principal contact in the journal's main
   language, carry a fresh sign-in-free link when "One-click Reviewer
   Access" is on, and are logged on the submission ("An automatic reminder
   email was sent to {name} regarding their review assignment") and in the
   reviewer row's History
   ([→ reminders on the Reviewers panel](U27-reviewer-assignment-and-management.md#reminders)).
   The wording is edited under *Emails management*. <sup>h</sup>
<a id="review-forms"></a>
10. **The review-forms list.** The "Review Forms" side tab lists the
    journal's forms in their display order, with columns "Title", "In
    Review", "Completed" and "Active", and the link "Create Review Form"
    above it ("Order" joins it once there is a row). While there is none
    the list reads "No Items". A new form is saved inactive, at the
    bottom of the list.
    "Order" lets the rows be dragged, with "Done" and "Cancel ordering"
    under the list; "Done" saves the order with no notice, and that order
    is the order of the "Review Form" list in the Add Reviewer window.
    Each row's arrow opens its actions: "Edit", "Copy", "Preview",
    "Delete" (Rule 12 says when the first and last are missing).
    <sup>f</sup>
11. **Active and inactive.** Only forms whose "Active" box is ticked are
    offered when a reviewer is added or a request is edited. Ticking the
    box asks, in a dialog titled "Confirm" with "OK" and "Cancel", "Are
    you sure you wish to activate this review form? Once it's assigned to
    a review you will no longer be able to deactivate it."; unticking
    asks "Are you sure you wish to deactivate this review form? It will
    no longer be available for new review assignments.". Deactivating
    hides the form from new requests; the requests that carry it keep it
    and its counts stay, and the reviewer still meets the form on step 3.
    The activation message's promise of a lock is not kept, the box can
    be unticked at any time ⚠ [A2](#a2). A request carrying a deactivated
    form loses it when an editor presses "OK" in its "Edit" window
    ⚠ [A6](#a6). <sup>f</sup>
12. **A form in use is locked.** "In Review" counts the requests carrying
    the form whose review is not yet submitted, "Completed" those whose
    review is submitted; a declined request counts in neither. While both
    are 0 the row offers "Edit" and "Delete". Once either is above 0,
    both actions disappear; the form can still be copied, previewed and
    switched active or inactive. "Preview" then opens the form's window
    on "Preview Form" with the "Review Form" and "Form Items" tabs greyed
    out and dead. A form carried only by declined requests counts as
    unused and can be edited or deleted ⚠ [A3](#a3). <sup>f</sup>
13. **The form's window.** "Edit" opens a window titled "Edit" with three
    tabs: "Review Form" (the title and description, Fields), "Form Items"
    (the questions, Rule 15) and "Preview Form" (the form as the reviewer
    will see it: title, description, then each question with its control,
    a required one marked with "*"; nothing on it can be saved).
    "Preview" from the row opens the same window, titled "Preview", on
    "Preview Form". <sup>f</sup>
14. **Copy and delete.** Both ask in a "Confirm" dialog with "OK" and
    "Cancel". "Copy" asks "Are you sure you wish to create a copy of this
    review form?" and adds an inactive row at the bottom with the same
    title, description and items; nothing in the title marks it as a
    copy. "Delete" asks "Are you sure you wish to delete this review
    form?" and removes the form; the declined requests that carried it
    lose it silently. <sup>f</sup>
15. **Form items.** The "Form Items" tab lists the questions in order under
    the column "Item", with the link "Create New Item" above ("Order"
    joins it once there is a row) and, per row, "Edit" and "Delete"
    ("Confirm delete of a published form
    item..."). While there is none the list reads "No Items". "Order"
    works as on the forms list (Rule 10); that order is the order on the
    reviewer's step 3 and in the preview. The item window is titled
    "Create New Item" or, for an existing item, "Edit". What each type gives the
    reviewer: a one-word box, a one-line box, a multi-line box, a group
    of boxes where several can be ticked, a group where one can be
    chosen, or a drop-down that opens blank. The "Response Options" rows
    are the choices of the last three, in the order listed. A question
    marked required must be answered before the review can be submitted;
    a question not marked "Included in message to author" is marked as
    not for the author; the author's own review screen is described at
    [→ reading reviews as the author](U26-review-stage-and-rounds.md#author-read-review).
    <sup>g</sup>
16. **Languages.** Titles, descriptions, questions and response options are
    typed per language of the journal's forms, the languages ticked under
    "Forms" on Settings › Website › Setup › Languages. The seeded journal
    has one, so every box here is a single box. A second forms language
    adds a box per language in the review-form windows: a globe icon sits
    at the right end of each box, and the second language's box (its
    placeholder names the language, "French") opens under the first one
    when that is focused; the rich-text boxes and the response-option
    rows get theirs the same way. "Reviewer Guidance" and {OJS} "Add
    Recommendation" show instead a language switcher at the top ("English"
    and "French" buttons) with one box per field, each box reading "1/2
    languages completed" until both are filled. A reviewer reading in a
    language whose text is empty sees the journal's main-language text.
    <sup>g</sup>
17. **Where the form lands.** A form is attached to a request in the Add
    Reviewer window's "Review Form" list (a section's default form
    preselects it {OJS}; that default is set under *Sections*) and can be
    swapped in the request's "Edit" window until the review is submitted
    ([→ review type, visibility, form](U27-reviewer-assignment-and-management.md#due-dates)).
    Both lists exist only while the journal has an active form; they open
    on "None / Free Form Review" and offer the active forms in display
    order, never an inactive one, even the one the request carries
    ⚠ [A6](#a6). On the reviewer's step 3 the form replaces the two
    free-text boxes ([→ step 3](U28-reviewers-review.md#step-3)).
    <sup>f</sup>
<a id="recommendations"></a>
18. **Recommendation options** {OJS}. The "Reviewer Recommendations" tab
    lists the journal's options in a table headed "Recommendations",
    "Activate" and an unlabelled third column holding each row's "More
    Actions" button, with "Add Recommendation" above. A fresh journal
    holds six active options, in this order: "Accept Submission" (type
    "Approved"), "Revisions Required", "Resubmit for Review", "Resubmit
    Elsewhere" (all "Revisions Requested"), "Decline Submission" ("Not
    Approved") and "See Comments" ("With Comments"). A new option lands
    last. The table keeps no fixed order: a row that was edited, ticked
    or unticked can change its place (seen at the top after the table
    refreshed in place, at the end after a reload), and the reviewer's
    list follows the table's order ⚠ [A7](#a7). The reviewer's step 3
    "Recommendation" list opens on "Choose One" and offers the active
    options in the table's order, plus, on a review that already chose an
    option since deactivated, that option
    ([→ the reviewer's recommendation](U28-reviewers-review.md#step-3)).
    Ticking or unticking "Activate" asks "Are you sure you want to
    activate the recommendation {title}" / "… deactivate …" under the
    heading "Activate Reviewer Recommendation" / "Deactivate Reviewer
    Recommendation", with "Yes" and "No". A row's "More Actions" menu
    holds "Edit" and "Delete" ("Delete Recommendation": "Are you sure you
    want to delete the recommendation {title}", "Yes"/"No"); the menu is
    absent altogether once any reviewer has chosen the option (a choice
    saved with "Save for Later" counts), and the defaults are no
    exception. No change on this tab shows a notice: the
    table simply shows the new state. The "Recommendation type" is a
    classification carried into the public review display of a published
    article and into reports; nothing on the editorial screens shows it.
    <sup>c</sup>
19. **A new language** ticked under "Forms" on Settings › Website › Setup ›
    Languages gives the six default options their translated titles
    automatically (a language that is only a UI language does not); a
    default renamed before the tick gets the stock translation too
    ⚠ [A8](#a8). An option the journal added keeps only the languages
    typed into it, and the reviewer sees the main-language title where
    theirs is empty. <sup>c</sup>

## Side effects

- **"Saved"** beside the button after a successful save of "Setup" or
  "Reviewer Guidance"; nothing is emailed or logged. <sup>d</sup>
- **A short notice "Your changes have been saved."** at the top right,
  fading by itself, after every review-form action that changes the list
  (create, edit, copy, activate, deactivate, delete, item edits); "Order"
  › "Done" shows none. <sup>f</sup>
- **Automatic reminder emails** to reviewers (Rule 9), with their activity
  log row and History line. They run on the install's daily task, which
  no screen triggers. <sup>h</sup>
- **The anonymity link** on the file-upload window (Rule 7).
- **Requests that carried a deleted form** lose it silently (Rule 14).
- **Recommendation changes** show no notice, email and log nothing.
  <sup>c</sup>

## Settings that modify behavior

This feature is a settings screen; every field above is a setting whose
effect lands on another feature's screen. The list below says where each
takes effect and which scenario runs it at its non-default end. The
seeded journal keeps the install defaults (every box off, both deadlines 4
weeks, the minimum 0, every clock at 0, every text empty, no review form,
{OJS} the six default recommendations); scratch journals are configured
through the test tooling.

- **"Default Review Mode"**: the Add Reviewer window's "Review Type"
  (scenario 2 runs "Open").
- **"Publicly Show Reviewer Comments"**: the Add Reviewer window's "Public
  Visibility" box (scenario 2 runs it on).
- **"Restrict File Access"**: the reviewer's files step; the on end is
  *Reviewer's review*'s scenario 9. No scenario here: this screen only
  stores the box (scenario 1 reads its default).
- **"One-click Reviewer Access"**: the sign-in-free link in request and
  reminder emails; the on end is *Reviewer's review*'s scenario 10. No
  scenario here, for the same reason.
- **"Reviewer Suggestion at Submission"**: the author's "Reviewer
  Suggestions" wizard step and the "Reviewers Suggested by Author" panel,
  both owned by *Reviewer suggestions*. No scenario here: the on end is
  that feature's scenario, and this screen only stores the box (scenario
  1 reads its default).
- **The two deadlines**: the Add Reviewer window's dates (scenario 2 runs 2
  and 6 weeks; scenario 3 runs the refused and the 0 ends).
- **"Minimum Confirmed Reviews Required"**: the round status box, *Review
  stage & rounds*. No scenario here: the box's effect is that spec's
  sentence, and this screen only stores the number (scenario 3 saves it).
- **The four reminder clocks**: scenario 4 sets and reads them back. No
  email is observed by any scenario: the daily task does not run on the
  test installs, and a clock cannot be advanced from a screen.
- **"Review Guidelines"** and **"Competing Interests"**: the reviewer's
  steps 2 and 1, *Reviewer's review* (its scenarios 2 and 13). Scenario 5
  types and saves them here; scenario 11 runs the press's two guideline
  boxes to the reviewer's step.
- **The anonymity box**: the upload window's link (scenario 5 runs both
  ends).
- **Review forms**: the "Review Form" list and the reviewer's step 3
  (scenarios 6 to 8; the reviewer's step is *Reviewer's review*'s
  scenario 8).
- **{OJS} Recommendation options**: the reviewer's "Recommendation" list
  (scenario 10).
- **Roles configuration**: which roles reach Settings at all (Actors). The
  seeded roles are used as they are; no scenario changes a role.
- **Languages & locales**: a second forms language (Settings › Website ›
  Setup › Languages, "Forms") adds a hidden second-language box behind a
  globe icon to each text of the review-form windows; "Reviewer Guidance"
  and "Add Recommendation" show a language switcher at the top instead
  (Rule 16). No scenario: the seeded journal has one forms language, and
  every scenario types in it.
- **The scheduled-task runner** (a configuration file setting, no screen
  on the test installs): off, no automatic reminder ever goes out.

## Cross-feature interactions

- **Reviewer assignment & management**: the Add Reviewer and Edit windows
  that consume the defaults and the forms, the History line an automatic
  reminder writes, and the editor's own "Send Reminder".
- **Reviewer's review**: the wizard where guidelines, the policy, file
  restriction, one-click links, review forms and recommendation options
  take effect.
- **Review stage & rounds**: the round status box that reads the minimum
  confirmed reviews, and what the author is shown of a review, where
  "Included in message to author" takes effect.
- **Reviewer suggestions**: the author's "Reviewer Suggestions" wizard
  step and the "Reviewers Suggested by Author" panel that the "Reviewer
  Suggestion at Submission" box switches on.
- **Sections** {OJS}: a section's "Review Form" list, offered only while
  the journal has an active form.
- **Submission files**: the upload window that shows the anonymity link.
- **Emails management**: the two automatic reminder templates.
- **Roles configuration**: which roles hold settings access.
- **Languages & locales**: the second-language boxes, the language
  switcher and the automatic translation of the default recommendation
  options.
- **System administration & jobs**: the daily scheduled task behind the
  reminder clocks.

## Canonical scenarios

Scenarios 1 and 12 run on the seeded journal with ready accounts and
change nothing; the others run on a scratch journal configured for them,
with throwaway accounts and scratch submissions. Each email is read in the
mailbox of the address it was sent to. Accounts, passwords and the tooling
recipe are in the footnote. <sup>s</sup>

1. **The Review settings and who reaches them** — Journal Manager: open
   Settings › Workflow and press "Review". The side tabs read "Setup",
   "Reviewer Guidance", "Review Forms" and {OJS} "Reviewer
   Recommendations". "Setup" shows "Anonymous Reviewer/Anonymous Author"
   selected, the four boxes unticked, "Default Response Deadline" 4,
   "Default Completion Deadline" 4, "Minimum Confirmed Reviews Required"
   0 and all four sliders reading "No reminder set". "Reviewer Guidance"
   shows empty boxes and the anonymity box unticked; "Review Forms" reads
   "No Items". Control: signed in as a Section Editor, the sidebar has no
   "Settings" and the same address shows "The current role does not have
   access to this operation.".
2. **Change the defaults and see them on the next request** — Journal
   Manager, on a scratch journal with a submission in review that already
   has one reviewer: on "Setup" choose "Open", tick "Make reviewer
   comments publicly visible with published content", set the deadlines
   to 2 and 6, press "Save": "Saved" appears. Reload the page: the tab
   shows the same values. Open the submission's review stage and press
   "Add Reviewer", then select a reviewer: "Review Type" preselects
   "Open", "Public Visibility" is ticked, "Response Due Date" is today
   plus 14 days and "Review Due Date" today plus 42 days. Control: the
   earlier reviewer's row "Edit" window still shows "Anonymous
   Reviewer/Anonymous Author" and its original dates.
3. **Whole weeks only** — Journal Manager, on a scratch journal: type
   "abc" into "Default Response Deadline" and press "Save": "This is not
   a valid integer." appears under the box, "abc" stays in it and no
   "Saved" shows. Type "0" instead, set "Minimum Confirmed Reviews
   Required" to 2, press "Save": "Saved". Reload: 0 and 2 are shown.
   Control: "Add Reviewer" on a scratch submission in review now proposes
   today plus 21 days as the "Response Due Date" ⚠ [A4](#a4).
4. **Set the reminder clocks** — Journal Manager, on a scratch journal:
   move the four sliders to 3, 5, 7 and 0. The boxes beside them read "3
   days before due date", "5 days after due date", "7 days before due
   date" and "No reminder set". Press "Save": "Saved". Reload: the same
   four readings. Control: no email arrives in any reviewer's mailbox
   (the clocks run on the server's daily task, which the screen never
   triggers; Settings).
5. **Guidance and the anonymity link** — Journal Manager, on a scratch
   journal with a scratch submission: on "Reviewer Guidance" type a
   sentence into "Review Guidelines" and one into "Competing Interests",
   press the words "how to ensure all files are anonymized": the dialog
   "How to ensure all files are anonymized" opens; press "Close". Tick
   the box and press "Save": "Saved". Open the submission's Submission
   stage and press "Upload" on the "Submission Files" panel: the upload
   window shows the link "How to ensure all files are anonymized" under
   the component list, and pressing it opens the same dialog with "OK" and
   "Cancel". Control: on a scratch journal with the box unticked, the
   same window shows no such link.
6. **Create a review form and offer it** — Journal Manager, on a scratch
   journal with a submission in review: on "Review Forms" press "Create
   Review Form", type a title and a description, press "Save": a row with
   that title appears with "In Review" 0, "Completed" 0 and "Active"
   unticked. Open the row's "Edit", then "Form Items", press "Create New
   Item": type the question, choose "Radio buttons (you can only choose
   one)", add the rows "Yes" and "No" under "Response Options" with "Add
   Item", tick "Reviewers required to complete item", press "Save": the
   item lists. Add a second item of type "Extended text box". Open
   "Preview Form": the title, the description, the first question with
   two radio buttons and "*", the second with a text box. Close the
   window. Tick "Active" and press "OK" in the "Confirm" dialog: the box
   stays ticked. On the submission's "Add Reviewer" window the "Review
   Form" list offers the title. Control: a second form created and left
   inactive is not in that list.
7. **A form in use is locked** — Journal Manager, on a scratch journal
   with two active review forms, the first carried by an accepted review
   request: its row reads "In Review" 1 and its arrow offers "Copy" and
   "Preview" but neither "Edit" nor "Delete". "Preview" opens the window
   on "Preview Form" with "Review Form" and "Form Items" greyed out.
   Untick "Active", press "OK" under "Are you sure you wish to deactivate
   this review form? …": the box is unticked, "In Review" still reads 1
   ⚠ [A2](#a2), and the "Add Reviewer" window's "Review Form" list no
   longer offers the title. The reviewer row's "More Actions" › "Edit"
   window shows "None / Free Form Review" selected ⚠ [A6](#a6); press
   "Cancel". Control: as that reviewer, step 3 of the wizard still shows
   the form.
8. **Copy, reorder and delete** — Journal Manager, on a scratch journal
   with two review forms: on the first row press "Copy" and "OK": a
   third row with the first form's title appears at the bottom, "Active"
   unticked, and its "Edit" › "Form Items" lists the same items. Press
   "Order", drag the third row to the top, press "Done" and reload: it
   stays first, and the "Add Reviewer" window's "Review Form" list, once
   the copy is activated, names it first. Press its "Delete" and "OK":
   the row is gone. Control: the two original rows are untouched.
9. **Leave with unsaved changes** — Journal Manager, on a scratch journal:
   on "Setup" choose "Open", then press the side tab "Reviewer Guidance"
   and press "Setup" again: "Open" is still selected. Now open Settings ›
   Website from the sidebar and come back to Settings › Workflow ›
   "Review" › "Setup": no dialog appeared on the way out and "Anonymous
   Reviewer/Anonymous Author" is selected again. Control: the same change
   followed by "Save" survives the same trip.
10. **{OJS} Recommendation options** — Journal Manager, on a scratch
    journal with a submission in review whose one reviewer has accepted:
    "Reviewer Recommendations" lists the six defaults, all ticked. Press
    "Add Recommendation", type "Major revisions", choose "Revisions
    Requested", keep "Active Upon Saving", press "Save": a seventh row,
    ticked, last, with no notice. Signed in as the reviewer, step 3's
    "Recommendation" list opens on "Choose One" and ends with "Major
    revisions". Back as the manager, untick "Accept Submission": the
    dialog "Deactivate Reviewer Recommendation" asks "Are you sure you
    want to deactivate the recommendation Accept Submission"; press
    "Yes": the box is unticked, and the reviewer's list no longer offers
    it. On the "Major revisions" row open "More Actions" › "Delete",
    press "Yes": the row is gone. Control: after the reviewer submits a
    review with "See Comments", that row has no "More Actions" button;
    "Activate" still toggles it.
11. **{OMP} Two sets of guidelines** — Press Manager, on a scratch press
    with a submission in internal review with an Internal Reviewer and
    one in external review with an External Reviewer, both accepted: on
    "Reviewer Guidance" type different sentences into "Internal Review
    Guidelines" and "External Review Guidelines", press "Save": "Saved".
    Signed in as the Internal Reviewer, step 2 of the wizard shows the
    internal sentence; as the External Reviewer, the external one.
    Control: neither wizard shows the other sentence.
12. **{OPS} No Review tab** — Preprint Server Manager: open Settings ›
    Workflow. The tabs read "Submission", "Preprint Server Library",
    "Emails" and "Tasks and Discussions", with no "Review" among them;
    typing the journal's Review-tab address on the server lands on the
    same page with "Submission" › "Disable Submissions" open and the
    typed address unchanged. Control: "Disable Submissions" shows its
    form. The tooling side of the absence is in the footnote. <sup>p</sup>

## Findings register

Verdicts are the author's judgment (claude, 2026-09-05), unreviewed unless
an entry notes otherwise; the team settles them on spec review.

| ID | Finding (one line, symptom) | Bug? | Impact | Review |
|----|------------------------------|------|--------|--------|
| [A4](#a4) | "Default Response Deadline" at 0 or empty gives the Add Reviewer window 3 weeks, and "Default Completion Deadline" at 0 or empty 4, numbers the Setup tab never shows | 🐞 | minor | — |
| [A5](#a5) | Reloading or bookmarking the address the Review side tabs write opens "Submission" › "Disable Submissions" | 🐞 | minor | — |
| [A6](#a6) | A request carrying a deactivated review form shows "None / Free Form Review" in its "Edit" window, and "OK" there drops the form and lowers its "In Review" count | 🐞 | minor | — |
| [OMP3](#omp3) | A press's "Internal Review Guidelines" box has no quote or list buttons, unlike the two boxes under it | 🐞 | minor | — |
| [A1](#a1) | An "After Due Date" reminder is sent only if a reminder already went out before the due date; alone, the slider arms nothing | ❓ | latent | — |
| [A2](#a2) | Activating a review form warns it cannot be deactivated once assigned, but the box unticks at any time | ❓ | minor | — |
| [A3](#a3) | A review form carried only by declined requests counts as unused and can be edited or deleted under them | ❓ | minor | — |
| [A7](#a7) | {OJS} Ticking, unticking or editing a recommendation row can move it in the table, and the reviewer's list moves with it | ❓ | minor | — |
| [A8](#a8) | {OJS} A default recommendation renamed before a forms language was added gets that language's stock title | ❓ | minor | — |
| [OMP1](#omp1) | A press has no "Reviewer Recommendations" tab | ✅ | invisible | — |
| [OMP2](#omp2) | A press's "Reviewer Guidance" carries "Internal Review Guidelines" and "External Review Guidelines" | ✅ | user-visible | — |

### All apps

<a id="a1"></a>
**A1 — After-due reminders need a prior reminder** · ❓ · latent.
The Setup tab offers "Review Request Response - After Due Date" and
"Review Submission - After Due Date" as clocks of their own. As built, an
after-due reminder is sent only to a reviewer who already received a
reminder before the due date (an automatic "Before Due Date" one, or the
editor's "Send Reminder"); a journal that sets only the after-due clocks
sends no automatic reminder at all. Question: is the after-due clock
meant to depend on a prior reminder? Lean: defect; the screen presents
the four clocks as independent and nothing on it says otherwise. Basis:
code (the daily task does not run on the test installs). <sup>[f-a1](#fn-a1)</sup>

<a id="a2"></a>
**A2 — Activation warning promises a lock that does not exist** · ❓ ·
minor.
Ticking "Active" asks "Are you sure you wish to activate this review
form? Once it's assigned to a review you will no longer be able to
deactivate it.". A form carried by review requests can still be
deactivated: the box unticks after the deactivation confirmation and the
form leaves the "Review Form" list, while the existing requests keep it
and the reviewer still meets the form. Question: should assignment lock
the box, or should the message go? Lean: the message is wrong; the
requests that carry the form keep it, and the one harm (A6) is the Edit
window's, not this box's. Basis: probe. <sup>[f-a2](#fn-a2)</sup>

<a id="a3"></a>
**A3 — Declined requests do not count as use** · ❓ · minor.
"In Review" and "Completed" skip declined requests, so a form whose only
requests were declined offers "Edit" and "Delete" like a fresh one.
Editing then changes the questions those declined requests still refer
to (their "Edit" window keeps showing the form), and deleting drops the
form from them silently. Question: intended? Lean: intended; a declined
request holds no answers, so nothing is lost. Basis: probe.
<sup>[f-a3](#fn-a3)</sup>

<a id="a4"></a>
**A4 — 0 or empty in a deadline box is a hidden default** · 🐞 · minor.
"Default Response Deadline" and "Default Completion Deadline" accept 0
and an empty box; either way the Add Reviewer window then proposes today
plus 3 weeks for the response and today plus 4 weeks for the review,
where 0 should give today. Neither number appears on the Setup tab, whose
fresh-journal values are 4 and 4.
Defect: a saved 0 is a value the screen accepts and then ignores. Basis:
probe. <sup>[f-a4](#fn-a4)</sup>

<a id="a5"></a>
**A5 — The Review tab's address does not survive a reload** · 🐞 · minor.
Opening a Review side tab changes the address bar, so a manager expects
a reload or a bookmark of it to return to that tab. Instead the page
opens on "Submission" › "Disable Submissions"; only a hand-typed address
of another shape reaches the Review tab. Basis: probe.
<sup>[f-a5](#fn-a5)</sup>

<a id="a6"></a>
**A6 — The Edit window drops a deactivated form** · 🐞 · minor.
A request carrying a review form that has since been deactivated opens
its "Edit" window (the reviewer row's "More Actions" › "Edit", *Reviewer
assignment & management*) with "None / Free Form Review" selected and no
sign of the form it carries. Pressing "OK" with nothing changed detaches
the form: the reviewer's step 3 shows the free-text boxes instead of the
questions, and the form's "In Review" count on the "Review Forms" list
drops by one, so a form whose every carrier was touched this way reads
0 / 0 and offers "Edit" and "Delete" again (Rule 12). Expected: the
window shows the carried form and "OK" leaves it alone. Basis: probe.
<sup>[f-a6](#fn-a6)</sup>

<a id="a7"></a>
**A7 — {OJS} A change to a row can move it** · ❓ · minor.
Ticking, unticking or editing a row on "Reviewer Recommendations" can
move it, to the top when the table refreshes in place, to the end after
a reload, and the reviewer's "Recommendation" list moves with it.
Question: what order is the list meant to keep? Lean: the list is
fetched with no sort, so the database's own row order shows through;
harmless but unsettling for a manager who arranged the options. Basis:
probe. <sup>[f-a7](#fn-a7)</sup>

<a id="a8"></a>
**A8 — {OJS} A renamed default gets the stock translation** · ❓ · minor.
A default option renamed in English before French was ticked under
"Forms" ("Decline (renamed)") receives the stock French title "Refuser la
soumission" with the tick, so a reviewer reading in French sees the
stock wording where one reading in English sees the rename. Question:
should a default that was renamed still receive the automatic
translation? Lean: the automatic translation is meant for untouched
defaults; whether a renamed one should get it is the team's call.
Basis: probe. <sup>[f-a8](#fn-a8)</sup>

### OMP

<a id="omp1"></a>
**OMP1 — No "Reviewer Recommendations" tab on a press** · ✅ · invisible.
A press collects no reviewer recommendation, so the side tab and its
options do not exist there; the reviewer's step 3 has no "Recommendation"
list ([→ the press reviewer's step 3](U28-reviewers-review.md#omp1)).
Intended: OMP has never had reviewer recommendations. Basis: probe.
<sup>[f-omp1](#fn-omp1)</sup>

<a id="omp2"></a>
**OMP2 — Two guideline boxes on a press** · ✅ · user-visible.
"Reviewer Guidance" opens with "Internal Review Guidelines", then
"External Review Guidelines" where a journal shows "Review Guidelines",
then "Competing Interests" and the anonymity box. Each guideline reaches
the reviewers of its own stage; the "Competing Interests" text is shared.
Intended: the press has two review stages. Basis: probe.
<sup>[f-omp2](#fn-omp2)</sup>

<a id="omp3"></a>
**OMP3 — A shorter toolbar on "Internal Review Guidelines"** · 🐞 · minor.
On a press, "Internal Review Guidelines" offers Bold, Italic,
Superscript, Subscript and a link button, while "External Review
Guidelines" and "Competing Interests" under it add Blockquote, Bullet
list and Numbered list. A list typed in the external box cannot be typed
in the internal one. Expected: the same toolbar on all three boxes.
Basis: probe. <sup>[f-omp3](#fn-omp3)</sup>

---

<a id="footnotes"></a>
## Footnotes — mechanism & evidence

<a id="fn-a"></a>
**a** — Page and access: `ManagementHandler::workflow()` renders
`lib/pkp/templates/management/workflow.tpl`; the Review tab is guarded by
`{if $hasReviewStage}` (`ManagementHandler::hasReviewStage()`, true when
the app's stages include internal or external review). Handler roles:
`SettingsHandler` (OJS/OMP `pages/management/`) assigns `settings` to
`ROLE_ID_MANAGER` and `ROLE_ID_SITE_ADMIN`; `CanAccessSettingsPolicy`
additionally requires the manager-level group's `permitSettings` flag,
which `registry/userGroups.xml` sets on the default manager, editor and
productionEditor groups (OJS and OMP). Roster: `manager.maya` (Journal
Manager), `editor.diana` (Editor, manager level), `sectioneditor.ana`
(Section Editor, no settings). Access-denied page: the shared
`PKPHandler` refusal, `user/authorizationDenied?message=user.authorization.roleBasedAccessDenied`,
a frontend page with no heading. Live-probed 2026-09-05 (Actors row 1;
scenario 1's control), OJS and OMP: `sectioneditor.ana`, an assistant
and `reviewer.julia` typing Settings › Workflow all land on that page
with "The current role does not have access to this operation."; their
sidebar has no "Settings"; `editor.diana` (Editor) has "Settings" and
opens "Review" › "Setup" with its form. Claim check 2026-09-05, OJS and
OMP: `admin`, a throwaway Editor and Production Editor open and save the
forms; a Guest Editor {OJS}, Author and Reader are refused like the
Section Editor.

<a id="fn-b"></a>
**b** — Review forms grid: `ReviewFormGridHandler` (GRID-047; ops
fetchGrid, createReviewForm, editReviewForm, updateReviewForm,
copyReviewForm, activateReviewForm, deactivateReviewForm,
deleteReviewForm, reviewFormBasics, reviewFormElements,
reviewFormPreview, saveSequence) with roles `ROLE_ID_MANAGER`,
`ROLE_ID_SITE_ADMIN` plus `CanAccessSettingsPolicy`. Row actions in
`ReviewFormGridRow::initialize()`: `edit` and `delete` only when
`$canEdit = getIncompleteCount() == 0 && getCompleteCount() == 0`; `copy`
and `preview` always. Items grid: `ReviewFormElementsGridHandler`
(GRID-046), same roles.

<a id="fn-c"></a>
**c** — Recommendation options (OJS only:
`Application::hasCustomizableReviewerRecommendation()` returns true on
OJS, false on OMP and OPS; `workflow.tpl` guards the tab with
`{if $hasCustomizableRecommendation}`). Manager
`ReviewerRecommendationManager.vue` (VUE-047) with
`ReviewerRecommendationsEditModal.vue` (VUE-069) and its Pinia store;
form `APP\components\forms\context\ReviewerRecommendationForm`
(fields `title` multilingual required, `type` select from
`Repository::getRecommendationTypeLabels()`, `status` select 1/0). API
`ReviewerRecommendationController` (API-054, base
`reviewers/recommendations`: GET, GET {id}, POST, PUT {id}, PUT
{id}/status, DELETE {id}); `edit` and `delete` answer 406 when the model's
`removable` attribute is false (`ReviewerRecommendation::removable()`:
no review assignment in the context references the option), and the Vue
row renders its `DropdownActions` only `v-if="item.removable"`. Defaults:
`Repository::getDefaultRecommendations()` (six `reviewer.article.decision.*`
keys, all `status` 1) with the machine-readable types in
`getDefaultRecommendationsMappedToMachineReadableType()`; added per
context by `addDefaultRecommendations()`. New-locale translation:
`Repository::setLocalizedDataOnNewLocaleAdd()`. The reviewer's list:
`Repository::getRecommendationOptions()` (active ones, plus the
assignment's own `reviewerRecommendationId` when set). The type is
consumed by `OpenReviewComponent` (the public peer-review display of a
published article) and reported through the API resource. Dialog and
label strings: `manager.reviewerRecommendations.*`,
`grid.action.addReviewerRecommendation` "Add Recommendation",
`grid.action.editReviewerRecommendation` "Edit Recommendation",
`grid.action.deleteReviewerRecommendation` "Delete Recommendation",
`common.moreActions` "More Actions". Live-probed 2026-09-05 (Actors row
4; Fields "Add Recommendation"; Rule 18; scenario 10), OJS `manager.maya`
and a scratch manager: six defaults and their types as listed, every
unused row with "Edit" and "Delete"; the table's third column header is
empty; the "Recommendation type" select has no placeholder entry (value
"" until chosen); the status select is unlabelled; an empty save leaves
the browser with no request and shows the two "This field is required."
messages plus the "Please correct 2 errors …" footer; add, edit, delete
and both toggles show no notice (the table re-fetches through `GET
api/v1/reviewers/recommendations`); the reviewer's "Recommendation"
list opens on "Choose One"; an option chosen by a reviewer loses its
"More Actions" button while "Activate" still toggles both ways. Claim
check 2026-09-05, OJS: an option a reviewer picked and saved with "Save
for Later" (review not submitted) loses its menu the same way, and stays
in that reviewer's list after deactivation; the translation of the
defaults arrives when French is ticked under "Forms" on Website › Setup ›
Languages (`save-language-setting … supportedFormLocales`), not while
French is only a UI language; a default renamed before the tick got the
stock French title too (A8).

<a id="fn-d"></a>
**d** — Setup form: `PKPReviewSetupForm` (`FORM_REVIEW_SETUP`, method
PUT to `contexts/{id}`; AFFM-065). Fields in order: `defaultReviewMode`
radios (values `SUBMISSION_REVIEW_METHOD_DOUBLEANONYMOUS` 2 default,
`_ANONYMOUS` 1, `_OPEN` 3; schema default 2),
`defaultReviewPublicVisibility` checkbox (option value `false`, label
`manager.setup.reviewOptions.publicReviewerComments.label`; read by
`Context::getDefaultReviewPublicVisibility()`),
`restrictReviewerFileAccess`, `reviewerAccessKeysEnabled`,
`reviewerSuggestionEnabled` (inserted after the one-click box when the
app's context schema carries the property: OJS and OMP do),
`numWeeksPerResponse` (schema default 4, `min:0`), `numWeeksPerReview`
(default 4, `min:0`), `numReviewsPerSubmission` (default 0; read by
`Context::getNumReviewsPerSubmission()`); then a `FieldHTML`
`reminderForReview` heading and four `FieldSlider`s
`numDaysBeforeReviewResponseReminderDue`,
`numDaysAfterReviewResponseReminderDue`,
`numDaysBeforeReviewSubmitReminderDue`,
`numDaysAfterReviewSubmitReminderDue` (`min` 0, `max` 14, labels
`manager.setup.reviewOptions.reminders.*`: "None", "{$value} days
before/after due date", "No reminder set"). Save: `PKPContextController::edit`
→ `PKPContextService::validate()` (schema integer/min rules) + `edit()`;
the Vue `FormPage` shows `form.saved` "Saved" in a `role=status` span
immediately left of the button. Labels quoted from
`lib/pkp/locale/en/manager.po` (`manager.setup.reviewOptions.*`); the
OJS `locale/en/manager.po` overrides the completion-deadline description
("Weeks allowed to complete the review"; OMP keeps lib/pkp's "Weeks
allowed for review completion"). Fallback deadlines 3/4 when unset:
`ReviewerForm` in the Add Reviewer window (U27 footnote f). The
passthrough that seeds these values for tests: `review {…}` on `POST
scenarios/context` (`PKPContextScenarioBuilder::parseReviewSettings`,
parity ledger 2026-09-05). Live-probed 2026-09-05 (Fields "Setup";
Rules 1–3; scenarios 1–4, 9), OJS and OMP: every heading, description
and box line as quoted, install defaults on both seeded contexts; the
save travels as `POST api/v1/contexts/{id}` (not PUT); every value reads
back after a reload; "abc" and "2.5" refused with "This is not a valid
integer.", "-1" with "This must be at least 0." (`.pkpFieldError` under
the box, footer `.pkpFormErrors`), the value kept in the box; an empty
response box and a 0 both save and give "Add Reviewer" today + 21 days,
and the completion box at 0 or empty today + 28 (A4; claim check
2026-09-05, OJS and OMP); the sliders
drive by keyboard (ArrowRight one day, End 14) and read "1 days
before/after due date" at 1 (the string is not pluralised); the side
tabs write a flat hash (`#reviewSetup`, `#reviewerGuidance`,
`#reviewForms`, `#reviewerRecommendations`) that a reload does not
honour (A5); an unsaved radio survives a side-tab switch and is lost on
leaving the page from the sidebar with no dialog. The legacy item window
(Rule 15), by contrast, warns on close: "The data on this form has
changed. Do you wish to continue without saving?" (seen once).

<a id="fn-e"></a>
**e** — Guidance form: `PKPReviewGuidanceForm` (`FORM_REVIEW_GUIDANCE`,
AFFM-066): `reviewGuidelines` and `competingInterests` (`FieldRichTextarea`,
multilingual, toolbar `bold italic superscript subscript | link |
blockquote bullist numlist`) and `showEnsuringLink`
(`FieldShowEnsuringLink`, label
`manager.setup.reviewOptions.showAnonymousReviewLink`, dialog title
`review.anonymousPeerReview.title` "How to ensure all files are
anonymized", body `review.anonymousPeerReview`). OMP's
`APP\components\forms\context\ReviewGuidanceForm` inserts
`internalReviewGuidelines` before `reviewGuidelines`, and OMP's locale
renames `manager.setup.reviewGuidelines` to "External Review
Guidelines". Where the box takes effect:
`PKPSubmissionFilesUploadBaseForm::initData()` adds the `ensuringLink`
`LinkAction` (a `ConfirmationModal` with the same strings) when
`showEnsuringLink` is set and the stage is Submission, Internal Review or
External Review. Reviewer-side effects: U28 Rules 8 and 12 (its footnote
o). Live-probed 2026-09-05 (Fields "Reviewer Guidance"; Rules 5, 7;
scenarios 5, 11), OJS and OMP: field order as listed; "Review
Guidelines" / "External Review Guidelines" and "Competing Interests"
carry the eight toolbar buttons, OMP's "Internal Review Guidelines" five
(no Blockquote, Bullet list or Numbered list; OMP3); one forms language
shows no language control, and with French ticked under "Forms" the form
gains a "French" button beside "English" at its top and each box reads
"1/2 languages completed", the French text reaching a reviewer reading
in French (live-driven 2026-09-05, OJS and OMP); the box's dialog has one
button, "Close", while the upload window's link opens the same dialog
with "OK" and "Cancel"; the link sits under the component list of step
"1. Upload File" (under the drop zone once a component is chosen),
reached from the Submission stage's "Submission Files" ›
"Upload" and the review stage's "Upload/Select Files" › "Upload Review
File", and is absent from both with the box unticked; the guidelines
reach the reviewer's step 2, the policy step 1 with its "review this
policy" dialog, an empty policy asks no question, empty guidelines read
"This publisher has not set any reviewer guidelines."; on OMP the
internal and external sentences reach only their own stage's reviewer
and the policy is shared.

<a id="fn-f"></a>
**f** — Form lifecycle. Create/edit: `ReviewFormForm` (template
`manager/reviewForms/reviewFormForm.tpl`; `FormValidatorLocale` on
`title`, message `manager.reviewForms.form.titleRequired`); a new form
gets `setActive(0)` and `REALLY_BIG_NUMBER` sequence, then
`resequenceReviewForms()`. Window tabs: `editReviewForm.tpl` (AFFW-670)
with anchors `reviewFormBasics` / `reviewFormElements` /
`reviewFormPreview`, `disabled: [0, 1]` when `!$canEdit` and
`selected: 2` when opened with `preview=1` (the row's Preview action).
Counts: `ReviewFormDAO::getByAssocId()` sub-selects `complete_count`
(`date_completed IS NOT NULL AND declined <> 1`) and `incomplete_count`
(`date_completed IS NULL AND declined <> 1`). Active column:
`ReviewFormGridCellProvider::getCellActions()` returns
`activateReviewForm` / `deactivateReviewForm` confirmations
(`manager.reviewForms.confirmActivate` / `confirmDeactivate`); the
handler ops flip `is_active` with no check on the counts (A2). Copy:
`copyReviewForm` (`manager.reviewForms.confirmCopy`; inserts the form
inactive at the end and re-inserts each element). Delete:
`deleteReviewForm` (`manager.reviewForms.confirmDelete`; guarded by the
two counts; clears `reviewFormId` on any assignment still referencing the
form, which can only be declined ones, then `deleteById`). Order: the
grid's `OrderGridItemsFeature` → `saveSequence`; the Add Reviewer
window's select lists `ReviewFormDAO::getActiveByAssocId()` in `seq`
order (U27 footnote d; parity ledger 2026-09-05 `reviewForms[]` row).
Each mutating op ends in `NotificationManager::createTrivialNotification`
(the top-right notice). OMP ships a second preview template,
`omp/templates/controllers/grid/settings/reviewForm/previewReviewForm.tpl`
(AFFW-669); no handler loads it (the form's template is
`manager/reviewForms/previewReviewForm.tpl` in lib/pkp), so the preview
renders the same on both apps. Live-probed 2026-09-05 (Actors row 3;
Fields "Create Review Form"; Rules 10–14, 17; scenarios 6–8), OJS and
OMP, byte-identical: the empty list reads "No Items" (the grid's generic
empty text, not `manager.reviewForms.noneCreated`); "Create Review Form"
and "Order" are grid links; an empty title is refused client-side with
"This field is required." under "Title*" (the server message never
shows); the windows are titled "Create Review Form", "Edit", "Preview";
every confirmation is a dialog titled "Confirm" with "OK"/"Cancel" and
the texts as quoted; list changes end in the toast "Your changes have
been saved." (`fetchNotification`; fades by itself, untimed), "Order" ›
"Done" (`saveSequence`) in none; the order holds after leaving the page
and the Add Reviewer list follows it; counts 1 / 0 with one accepted and
one declined request lock "Edit" and "Delete"; a declined-only form
keeps all four actions and its declined row's "Edit" window still shows
the form, and after the deletion that window opens on "None / Free Form
Review" with the remaining active forms listed (driven with another form
active, 2026-09-05); with no active form left it has no "Review Form"
list at all; a deactivated form keeps its
counts, leaves the Add Reviewer list and still reaches the reviewer's
step 3 (A2), while the reviewer row's "Edit" window (`form#editReviewForm`,
`select#reviewFormId` listing `getActiveByAssocId()` only) shows "None
/ Free Form Review" and its "OK" (`update-review`) detaches the form
(A6); the Add Reviewer window has no "Review Form" list at all while the
context has no active form, otherwise "None / Free Form Review" first
and the active forms in `seq` order.

<a id="fn-g"></a>
**g** — Items: `ReviewFormElementForm` (template
`manager/reviewForms/reviewFormElementForm.tpl`; validators on `question`
(`manager.reviewFormElements.form.questionRequired`) and `elementType`
(`…elementTypeRequired`); `initData()` sets `included => 1` for a new
item). Types: `ReviewFormElement::REVIEW_FORM_ELEMENT_TYPE_*` 1–6
(`getReviewFormElementTypeOptions()`, labels
`manager.reviewFormElements.{smalltextfield,textfield,textarea,checkboxes,radiobuttons,dropdownbox}`);
`getMultipleResponsesElementTypes()` = checkboxes, radio buttons,
drop-down. Options: `ReviewFormElementResponseItemListbuilderHandler`
(GRID-059, base `SetupListbuilderHandler` GRID-060; title
`grid.reviewFormElement.responseItems` "Response Options", column
`manager.reviewFormElements.possibleResponse` "Selection", add label
`manager.reviewFormElements.addResponseItem` "Add selection"); the
template's `togglePossibleResponses()` disables the add control for text
types and alerts `manager.reviewFormElement.changeType`; `execute()`
stores `possibleResponses` only for the three list types and `null`
otherwise. Row actions: `ReviewFormElementGridRow` (edit, delete with
`manager.reviewFormElements.confirmDelete`); order via
`OrderGridItemsFeature`. Preview and reviewer rendering share
`lib/pkp/templates/reviewer/review/reviewFormResponse.tpl` (required
marked via `fbvFormSection required`; the drop-down renders with
`defaultLabel=""`). Included flag: `reviewDownload.tpl` skips elements
`{if $authorFriendly && !$reviewFormElement->getIncluded()}` (U26
footnote j). Localisation fallback: `getLocalizedQuestion()` and friends
(`DataObject::getLocalizedData`, primary locale fallback). Live-probed
2026-09-05 (Fields "Create New Item"; Rules 15–16; scenario 6), OJS and
OMP: the empty items list reads "No Items"; "Create New Item" and
"Order" are grid links ("Order" rendered only once the list has a row,
as on the forms grid); the windows are titled "Create New Item" / "Edit";
a missing type is refused client-side with "This field is
required." at "Item type*"; a typed type with an empty question is
refused server-side with the red toast "Errors occurred processing this
form" / "A question is required for the form item. (English)"; the
options listbuilder is headed "Response Options" with the link "Add
Item" (no "Selection" column, no "Add selection"), is live before a type
is chosen, and switching a radio item to "Single line text box" shows no
notice and keeps the rows (`togglePossibleResponses()` is never called);
a saved switch to a text type drops the rows (`execute()` stores `null`;
the reopened item lists "No Items"; live-driven 2026-09-05, OJS and OMP).
Languages:
the seeded journals have `fr_CA` as a UI language but not a forms
language (Website › Setup › Languages, "Forms" unticked), and a scratch
context inherits that, so no box on this screen has tabs; with "Forms"
ticked for French the legacy windows show the multilingual popover (a
globe icon at the end of the box, DOM class `flag flag_fr_CA`, revealing
a "French" box beneath it; the rich-text editors carry the icon at the
end of their toolbar and a hidden `…-fr_CA_ifr` editor; a response-option
row a hidden `[possibleResponse][fr_CA]` box), the Vue forms a language
switcher at the top (footnote e). Fallback driven on OJS only: a reviewer reading in French
sees the English title, description, question and options where the
French is empty.

<a id="fn-h"></a>
**h** — Reminder clocks: scheduled task `PKP\task\ReviewReminder`
(JOB-054), registered `->daily()` in OJS's and OMP's
`classes/scheduler/Scheduler.php` (OPS registers none). Logic in
`executeActions()`: iterates
`Repo::reviewAssignment()->getCollector()->filterByIsIncomplete(true)`,
skips submissions whose status is not `STATUS_QUEUED`, then branches on
`getDateConfirmed()` (null → the response clocks against
`dateResponseDue`, else the submit clocks against `dateDue`). Before-due:
`getDateReminded() === null` and today within N days before the due
date. After-due: `getDateReminded() !== null`, `dateReminded < dateDue`,
and today ≥ N days past the due date (A1: the after branch sits in the
`else` of the "no reminder yet" test, so it never fires without a prior
reminder). `dateReminded` is reset by
`ReviewerAction::confirmReview` on the reviewer's answer. Send: job
`PKP\jobs\email\ReviewReminder` — mailables `ReviewResponseRemindAuto`
(template key `REVIEW_RESPONSE_OVERDUE_AUTO`, name
`mailable.reviewResponseOverdueAuto.name` "Review Response Overdue
(Automated)", subject `emails.reviewResponseOverdueAuto.subject` "Will
you be able to review this for us?") and `ReviewRemindAuto`
(`REVIEW_REMIND_AUTO`, "Review Reminder (Automated)", subject "A
reminder to please complete your review"), sent from the context's
`contactEmail`/`contactName` in the primary locale; a `ReviewerAccessInvite`
is minted when `reviewerAccessKeysEnabled`; then
`Repo::reviewAssignment()->edit(['dateReminded', 'reminderWasAutomatic' => 1])`,
`Repo::emailLogEntry()->logMailable(REVIEW_REMIND_AUTO)` and an event log
row `SUBMISSION_LOG_REVIEW_REMIND_AUTO` with message
`submission.event.reviewer.reviewerRemindedAuto`. The send side and the
History line are U27's (its footnote h; MAIL-043/046). No screen on the
test installs runs the task (`[schedule] task_runner = Off`, seed-facts),
so Rules 8 and 9 are code-read and not driven.

<a id="fn-p"></a>
**p** — OPS absence: `Application::getApplicationStages()` on OPS holds
Production only, so `ManagementHandler::hasReviewStage()` is false and
`workflow.tpl` omits the `review` tab; OPS's `Scheduler` registers no
`ReviewReminder`; `hasCustomizableReviewerRecommendation()` returns
false. Tooling: OPS's `ContextScenarioBuilder::assertReviewSupported()`
answers 400 to the `review` and `reviewForms` keys (parity ledger
2026-09-05). Live-probed 2026-09-05 (Purpose; scenario 12), OPS
`manager.maya`: tabs "Submission", "Preprint Server Library", "Emails",
"Tasks and Discussions"; no "Review" tab; the typed
`…/management/settings/workflow#review/reviewSetup` reloads to the same
page with "Submission" › "Disable Submissions" selected, the hash left
as typed, no redirect. On OMP the same shape with `reviewerRecommendations`
opens "Review" › "Setup" and rewrites the hash to `#review`. The library
tab per app: "Publisher Library" / "Press Library" / "Preprint Server
Library".

<a id="fn-q"></a>
**q** — OMP: `ReviewGuidanceForm` adds `internalReviewGuidelines`
(footnote e); `omp/locale/en/manager.po` sets
`manager.setup.reviewGuidelines` "External Review Guidelines" and
`manager.setup.reviewOptions.restrictReviewerFileAccess.description`
"Reviewers will have access to the submission file only after agreeing
to review it."; `hasCustomizableReviewerRecommendation()` false (footnote
c). U28's OMP1 and footnote q record the reviewer-side absence of the
recommendation list. Live-probed 2026-09-05 (Purpose; OMP1, OMP2;
scenario 11), OMP `manager.maya` and a scratch press: side tabs "Setup",
"Reviewer Guidance", "Review Forms"; the three guidance boxes in that
order; the sentences reach their own stage's reviewer only.

<a id="fn-s"></a>
**s** — Accounts and tooling for the scenarios. Seeded journal
`publicknowledge`: `manager.maya` (Journal Manager), `sectioneditor.ana`
(Section Editor, the control of scenario 1), OPS `manager.maya`
(Preprint Server Manager, scenario 12); passwords per
`docs/process/users.md`. Scratch journals from `POST scenarios/context`
with a throwaway `manager`, `externalReviewer` (OMP: also
`internalReviewer`) and `author` in `users[]`: every reviewer a scratch
scenario signs in as is a throwaway from `users[]`, never a roster
reviewer, because a roster reviewer named in `reviewRounds[].reviewers[]`
is assigned but not enrolled in the scratch context (absent from its Add
Reviewer search and refused the wizard with the access-denied page;
probed 2026-09-05). Scenario 5's second journal and scenario 7's forms
come from the `review {showEnsuringLink}` and `reviewForms[]`
passthroughs (scenarios.md "Configuring a scratch context"); scenario
7's forms are seeded active, because a reviewer's `reviewForm: '<title>'`
attaches only an active form; its accepted request from `POST
scenarios/submission` with `decisions: ['sendExternalReview']` and
`reviewRounds: [{reviewers: [{username, status: 'accepted', reviewForm:
'<title>'}]}]` (OMP scenario 11: `sendInternalReview` for the internal
one). A seeded `accepted` request opens the wizard on step 1 ("Save and
continue") and ignores a typed `?step=3` until steps 1–2 are passed.
Scenario 2's earlier reviewer is seeded before the settings change;
scenario 10's submitted review is made through the reviewer's wizard.
The slider is driven by keyboard (arrow keys on the handle). Mail is
read in Mailpit (`http://127.0.0.1:8025`), scoped by the throwaway
recipient. Scenario recipes are to be confirmed by the test author.

<a id="fn-a1"></a>
**f-a1** — `PKP\task\ReviewReminder::executeActions()`: in both phases
the after-due test lives in the `else` branch of
`if ($reviewAssignment->getDateReminded() === null)`, and additionally
requires `$dateReminded->lt($dateDue)`. With the before-due slider at 0
and no manual "Send Reminder", `dateReminded` stays null and the
after-due branch is never reached. Read 2026-09-05 on the `main`
checkouts (OJS and OMP, shared lib/pkp). Not driven: the task runner is
off on the test installs.

<a id="fn-a2"></a>
**f-a2** — `ReviewFormGridHandler::deactivateReviewForm()` checks CSRF,
existence and `getActive()` only; `ReviewFormGridCellProvider` offers
the deactivate action whenever `getActive()` is true. The confirmation
string `manager.reviewForms.confirmActivate` carries the promise. Read
2026-09-05. Live-probed 2026-09-05, OJS and OMP: a form at 1 / 0
(accepted request) deactivates after the confirmation
(`deactivate-review-form` 200, "Your changes have been saved."), counts
unchanged, gone from "Add Reviewer"; the untouched request's reviewer
still gets the form on step 3.

<a id="fn-a3"></a>
**f-a3** — `ReviewFormDAO::getByAssocId()` counts with `declined <> 1`;
`ReviewFormGridRow` derives `$canEdit` from the two counts;
`deleteReviewForm()` nulls `reviewFormId` on assignments returned by
`filterByReviewFormIds`, which after the count guard can only be declined
ones. Read 2026-09-05. Live-probed 2026-09-05, OJS and OMP: a form
carried by one declined request reads 0 / 0 and offers "Edit", "Copy",
"Preview", "Delete"; the declined row's "Edit" window shows the form
selected; after "Delete" that window opens on "None / Free Form Review"
with the remaining active forms listed (claim check 2026-09-05, OJS and
OMP, another form active), and with no active form left it has no
"Review Form" list.

<a id="fn-a4"></a>
**f-a4** — Schema `numWeeksPerResponse` / `numWeeksPerReview`: `nullable`,
`integer`, `min:0`, default 4 (`lib/pkp/schemas/context.json`), so an
empty box passes validation and stores null; `ReviewerForm::initData()`
(U27 footnote f) substitutes 3 and 4 when the context value is empty
(PHP's empty(), so 0 counts as unset). Live-probed 2026-09-05, OJS and
OMP: "Default Response Deadline" 0 saves ("Saved", reads back 0) and
"Add Reviewer" then proposes today + 21 days; an empty box likewise;
both boxes empty give today + 21 and today + 28, and both boxes at 0 the
same (claim check 2026-09-05, OJS and OMP).

<a id="fn-a5"></a>
**f-a5** — `workflow.tpl`'s `<tabs :track-history="true">` writes the
side tab's own id as the hash (`#reviewSetup`, `#reviewerGuidance`,
`#reviewForms`, `#reviewerRecommendations`); on load the page reads the
hash against the main tab row, which has no tab of that name, so the
first main tab opens. Only the nested `#review/reviewSetup` shape (which
the app never writes) opens the Review tab. Live-probed 2026-09-05, OJS
and OMP: after opening "Review" › "Setup" the address ends in
`#reviewSetup`; reload lands on "Submission" › "Disable Submissions"
with the Review side tab still marked selected but hidden.

<a id="fn-a6"></a>
**f-a6** — `PKPReviewerGridHandler::editReview()` / `updateReview()` with
`EditReviewForm` (U27's Edit Review window): `initData()` fills the
"Review Form" select from `ReviewFormDAO::getActiveByAssocId()` only, so
a deactivated `reviewFormId` matches no option and the select posts ""
on "OK" (`update-review`); `execute()` looks the id up and stores `null`
when it finds no form. Live-probed
2026-09-05, OJS and OMP: after deactivating the carried form the window
shows "None / Free Form Review" selected and the other active forms;
"OK" with nothing changed → 200, no notice; reopened, still "None /
Free Form Review"; the reviewer's step 3 then shows the free-form boxes;
the form's row on "Review Forms" reads one less under "In Review"
(1 / 1 → 0 / 1; claim check 2026-09-05, OJS and OMP). Control: with the
carried form active, the select preselects it.

<a id="fn-a7"></a>
**f-a7** — `Repository::getRecommendationOptions()` and the manager's
`GET api/v1/reviewers/recommendations` query with no `orderBy`, so the
rows come in the database's own order, which changes as rows are
updated. Live-probed 2026-09-05, OJS, one scratch journal: a deactivated
default at the end after a reload; two toggled rows at the top after
in-page refreshes; an edited default moved up one place; an edited last
row stayed last; the reviewer's list matched the table each time. A read
taken right after "Yes", before the table re-fetched, still shows the
old order, which is what an earlier "left in place" observation was.

<a id="fn-a8"></a>
**f-a8** — `Repository::setLocalizedDataOnNewLocaleAdd()` writes the
stock `reviewer.article.decision.*` title for every default option in the
new forms locale, without checking whether the primary-locale title was
changed. Live-probed 2026-09-05, OJS scratch journal: "Decline
Submission" renamed to "Decline (renamed)", then French ticked under
"Forms": its "Edit Recommendation" window shows "Refuser la soumission"
in the French box; the reviewer's `/fr_CA/` step 3 lists "Refuser la
soumission", the English step 3 "Decline (renamed)"; "Only English", an
added option, kept an empty French box.

<a id="fn-omp1"></a>
**f-omp1** — `omp/classes/core/Application.php::hasCustomizableReviewerRecommendation()`
returns false; `workflow.tpl` `{if $hasCustomizableRecommendation}`;
the recommendation model and API are only wired in OJS
(`ojs/api/v1/reviewers/recommendations/`). U28 OMP1 for the reviewer
side. Live-probed 2026-09-05, OMP `manager.maya`: no such side tab and
no recommendation manager on the page; "Review Forms" opens as the
control.

<a id="fn-omp2"></a>
**f-omp2** — `omp/classes/components/forms/context/ReviewGuidanceForm.php`
(`FIELD_POSITION_BEFORE, 'reviewGuidelines'`); labels
`manager.setup.internalReviewGuidelines` "Internal Review Guidelines"
and OMP's `manager.setup.reviewGuidelines` "External Review Guidelines".
Per-stage delivery: U28 footnote q. Live-probed 2026-09-05, OMP scratch
press: different sentences in the two boxes reach the internal and the
external reviewer's step 2 respectively, neither sees the other's; one
"Competing Interests" text reaches both.

<a id="fn-omp3"></a>
**f-omp3** — `omp/classes/components/forms/context/ReviewGuidanceForm.php`
adds `internalReviewGuidelines` as a `FieldRichTextarea` without the
`toolbar` option that `PKPReviewGuidanceForm` gives `reviewGuidelines`
and `competingInterests` (`bold italic superscript subscript | link |
blockquote bullist numlist`), so the field falls back to the component's
default toolbar. Live-probed 2026-09-05, OMP `manager.maya` and a scratch
press: the internal box's toolbar reads Bold, Italic, Superscript,
Subscript, link; the two boxes under it add Blockquote, Bullet list,
Numbered list.

## Reference — entry points & surfaces

| Entry | Path | Atom |
|-------|------|------|
| Settings › Workflow › Review › Setup | `management/settings/workflow#review/reviewSetup` typed (the screen writes `#reviewSetup`, which a reload does not honour, A5) (Vue form `reviewSetup`) | AFFM-065 |
| Settings › Workflow › Review › Reviewer Guidance | `…#review/reviewerGuidance` typed (written: `#reviewerGuidance`) (Vue form `reviewerGuidance`) | AFFM-066 |
| Settings › Workflow › Review › Review Forms (grid) | `…#review/reviewForms` typed (written: `#reviewForms`); component `grid.settings.reviewForms.ReviewFormGridHandler` | GRID-047, AFFM-067..073 |
| Review form window: Review Form / Form Items / Preview Form tabs | `editReviewForm.tpl` tabset; ops `reviewFormBasics`, `reviewFormElements`, `reviewFormPreview` | AFFW-670, AFFW-669 (OMP dead template) |
| Form Items grid and item window | component `grid.settings.reviewForms.ReviewFormElementsGridHandler` | GRID-046, AFFM-074..077 |
| Response Options listbuilder | component `listbuilder.settings.reviewForms.ReviewFormElementResponseItemListbuilderHandler` | GRID-059, GRID-060 |
| Settings › Workflow › Review › Reviewer Recommendations {OJS} | `…#review/reviewerRecommendations` typed (written: `#reviewerRecommendations`); Vue `ReviewerRecommendationManager` | VUE-047, VUE-069, AFFM-078..081 |
| Reviewer recommendations API {OJS} | `api/v1/contexts/{path}/reviewers/recommendations` | API-054 |
| Automatic reviewer reminders | scheduled task `PKP\task\ReviewReminder` (daily) → job `PKP\jobs\email\ReviewReminder` | JOB-054 |
| Settings save | `POST api/v1/contexts/{id}` as sent by the browser (`PKPContextController::edit`, method override to PUT) | (dispatcher owned by *Journal identity & about pages*) |

## Reference — code anchors

- `lib/pkp/templates/management/workflow.tpl` — the Review tab and its
  side tabs.
- `lib/pkp/pages/management/ManagementHandler.php`,
  `ojs/pages/management/SettingsHandler.php`,
  `omp/pages/management/SettingsHandler.php` — page handlers.
- `lib/pkp/classes/components/forms/context/PKPReviewSetupForm.php`,
  `PKPReviewGuidanceForm.php`, `omp/classes/components/forms/context/ReviewGuidanceForm.php`.
- `lib/pkp/classes/components/forms/FieldSlider.php`,
  `FieldShowEnsuringLink.php`; `lib/ui-library/src/components/Form/fields/FieldSlider.vue`,
  `FieldShowEnsuringLink.vue`.
- `lib/pkp/controllers/grid/settings/reviewForms/` — `ReviewFormGridHandler`,
  `ReviewFormGridRow`, `ReviewFormGridCellProvider`,
  `ReviewFormElementsGridHandler`, `ReviewFormElementGridRow`,
  `form/ReviewFormForm`, `form/ReviewFormElementForm`, `form/PreviewReviewForm`.
- `lib/pkp/controllers/listbuilder/settings/reviewForms/ReviewFormElementResponseItemListbuilderHandler.php`.
- `lib/pkp/classes/reviewForm/` — `ReviewForm`, `ReviewFormDAO`,
  `ReviewFormElement`, `ReviewFormElementDAO`.
- `lib/pkp/templates/manager/reviewForms/` and
  `lib/pkp/templates/controllers/grid/settings/reviewForms/editReviewForm.tpl`;
  `lib/pkp/templates/reviewer/review/reviewFormResponse.tpl`.
- `ojs/classes/components/forms/context/ReviewerRecommendationForm.php`,
  `ojs/classes/components/listPanels/ReviewerRecommendationsListPanel.php`,
  `ojs/api/v1/reviewers/recommendations/ReviewerRecommendationController.php`,
  `lib/pkp/classes/submission/reviewer/recommendation/` (`ReviewerRecommendation`,
  `Repository`, `enums/ReviewerRecommendationType`),
  `lib/ui-library/src/managers/ReviewerRecommendationManager/`.
- `lib/pkp/classes/task/ReviewReminder.php`,
  `lib/pkp/jobs/email/ReviewReminder.php`,
  `lib/pkp/classes/mail/mailables/ReviewRemindAuto.php`,
  `ReviewResponseRemindAuto.php`; `ojs/classes/scheduler/Scheduler.php`,
  `omp/classes/scheduler/Scheduler.php`.
- `lib/pkp/schemas/context.json`, `ojs/schemas/context.json`,
  `omp/schemas/context.json` — the settings and their defaults.
- `lib/pkp/classes/testing/PKPContextScenarioBuilder.php` — the `review`
  and `reviewForms[]` passthroughs used by the scenarios.
