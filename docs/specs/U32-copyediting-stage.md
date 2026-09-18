---
name: copyediting-stage
status: draft
---

# Copyediting stage {OJS OMP}

> Conventions (markers, badges, footnotes): [Reading a spec](GLOSSARY.md#reading-a-spec).

## Purpose

An accepted submission stops at the **Copyediting stage** before production.
Here the editor hands the accepted text to a Copyeditor: the files that came
out of review are listed as draft files, the Copyeditor uploads the polished
versions as copyedited files, and the author follows the work and answers
questions in the stage's discussions. When the copyedited files are ready,
the editor sends the submission on to Production with one decision; if the
acceptance was a mistake, a second decision moves it back to review.

This spec covers the Copyediting-stage screen itself: which panels, notices
and decision buttons each role is offered, what the two file lists hold, and
what each decision does to the submission. The guided wizard behind every
decision button (its email page and its file page) belongs to *Editorial
decision recording*; the file lists' upload and edit windows to *Submission
files*; the Participants panel to *Stage participants*; the discussions panel
to *Tasks & discussions*. Who may open a submission's workflow at all is
[→ stage access](U24-workflow-screen-and-stage-access.md#stage-access).

A preprint server installs a single-stage workflow: a preprint's workflow
menu lists "Production" alone, its Roles settings screen installs no
Copyeditor role, and none of the panels, notices or decision buttons in this
file appear there [OPS1](#ops1). <sup>k</sup>

## Actors & permissions

Who may **open** the Copyediting stage at all is the shared workflow gate,
[→ stage access](U24-workflow-screen-and-stage-access.md#stage-access): a
Journal Manager or Editor reaches it on every submission; every other role
only on submissions they are assigned to, and only when their role's stage
set includes Copyediting. By default that set includes Copyediting for
Section Editor, Guest Editor, Copyeditor, Marketing and sales coordinator,
Production editor, Author and Translator (a press adds Volume editor and
Chapter Author); Layout Editor, Proofreader and Funding Coordinator are
turned away with the no-access box. "Assigned editors" below means Journal
Managers, Editors, Section Editors and Guest Editors listed on this stage's
Participants panel. The rows record what each role is offered **on** the
screen once it is open. <sup>a</sup> <sup>b</sup>

| Action | Who may, and when |
|--------|--------------------|
| **See the stage's panels** ("Draft Files", "Copyediting Tasks & Discussions", "Copyedited Files", "Participants"; Rule 1) | • Site Administrator (holding a journal role); Journal Manager; Editor: every submission<br>• Assigned Section Editor, Guest Editor, Copyeditor, Marketing and sales coordinator, Production editor: their assigned submissions<br>• Author: their own submission, in the author view, which shows "Copyediting Tasks & Discussions" and "Copyedited Files" only (Rule 11) <sup>a</sup> |
| **See the notice box** ("Assign a copyeditor using the Assign link in the Participants list." / "Awaiting Copyedits."; Rule 3) | • Assigned editors, on this stage, while the notice's condition holds<br>• A Journal Manager or Editor who is not assigned to the submission: no notice, although the panels show<br>• Copyeditor and the other assistants; Author: never <sup>d</sup> |
| **Add to and manage "Draft Files"** ("Upload/Select Files" above the list; "Update File Details", "More Information" and "Delete" in a row's menu; Rules 4–5) | • Site Administrator; Journal Manager; Editor: every submission<br>• Assigned Section Editor, Guest Editor, Copyeditor and the other assistants who reach the stage: their assigned submissions<br>• Author: never; the list is not shown in the author view (Rule 11) <sup>e</sup> |
| **Add to and manage "Copyedited Files"** (the same controls; Rule 6) | • The same roles as the row above<br>• Author: reads the list only: no "Upload/Select Files", no row menu (Rule 11) <sup>f</sup> |
| **"Send to Text Editor"** (a row-menu entry on both lists, for a Word, OpenDocument, RTF, LaTeX or Markdown file) | • Site Administrator; Journal Manager. What it opens belongs to *Submission files* <sup>n</sup> |
| **Record "Send To Production"** (Rule 8) | • [Deciding editors](GLOSSARY.md#roles-and-access), while Copyediting is the active stage<br>• Recommending editors: no decision buttons and no recommendation controls on this stage ⚠ [A5](#a5)<br>• Copyeditor and the other assistants; Author: never <sup>c</sup> |
| **Record "Move to Review"** (Rule 9) | • The same deciding editors, at the same time; the button reads "Move to Review" whatever stage it leads to ⚠ [A1](#a1) <sup>c</sup> |
| **Assign a participant** ("Assign" on the Participants panel) | • Owned by *Stage participants*. On this stage the "Assign" form offers the groups whose stage set includes Copyediting, the Copyeditor group among them; its "Request Copyedit" predefined message is what raises the Copyeditor's task and email (Side effects) <sup>j</sup> |
| **Open or answer a discussion** ("Copyediting Tasks & Discussions") | • Owned by *Tasks & discussions*. The panel is shown to every role that opens the stage, the Author included (Rules 1, 11) <sup>a</sup> |

## Fields & validation

N/A. The Copyediting stage's own surfaces are panels, notices and buttons.
The forms they open belong to their own features: "Upload/Select Files" and
the row menus to *Submission files* (this spec says what the window lists,
Rule 5), "Assign" to *Stage participants*, and each decision button to the
wizard of *Editorial decision recording*.

## Rules & state

<a id="panels"></a>
1. **What the screen shows.** When a submission at Copyediting is opened at
   that stage, the editorial view shows, top to bottom: the notice box when
   one applies (Rule 3); the **"Draft Files"** list, described under its
   heading as "These are files from the review stage which are to be
   copyedited"; the **"Copyediting Tasks & Discussions"** panel; and the
   **"Copyedited Files"** list, described as "These are edited files that
   will be taken to the production stage". The **"Participants"** panel
   stands in the right-hand column. The decision buttons sit at the top of
   the screen: "Send To Production", highlighted, then "Move to Review"
   (Rules 8–9). A journal shows no "Schedule For Publication" shortcut on
   this stage, although its Submission and Production stages carry one; the
   publication pages are reached from the workflow's side menu instead. The
   header's "Preview" button while the submission sits here is
   [→ the header buttons](U24-workflow-screen-and-stage-access.md#stage-label).
   <sup>a</sup> <sup>m</sup>
<a id="arrival"></a>
2. **How a submission arrives.** A submission reaches Copyediting through
   "Accept Submission" on the review stage or "Accept and Skip Review" on
   the Submission stage (see *Review stage & rounds*, *[Submission
   stage](U25-submission-stage.md#send-to-review)*). The files ticked on
   that decision's "Select Files" page appear in "Draft Files" (Rule 4). The
   stage bubble under the title reads "Copyediting", and no status box is
   shown while the submission is active here
   ([→ the status box](U24-workflow-screen-and-stage-access.md#status-box));
   the notice box of Rule 3 takes that slot. <sup>g</sup>
<a id="notices"></a>
3. **The notice box.** Above "Draft Files", an assigned editor (Actors)
   sees one framed notice or none, refreshed whenever something on the
   screen changes: <sup>d</sup>
   - 3a. **"Assign a copyeditor using the Assign link in the Participants
     list."** while no discussion exists on this stage and no file has been
     added to "Copyedited Files".
   - 3b. **"Awaiting Copyedits."** once a discussion exists on this stage
     (the "Assign" form's message opens one) and "Copyedited Files" is still
     empty. The notice follows the discussion, not the assignment: a
     Copyeditor assigned without a message leaves 3a standing, and a
     discussion opened with no Copyeditor assigned flips it to 3b
     ⚠ [A3](#a3).
   - 3c. **No notice** once "Copyedited Files" holds at least one file, or
     once the submission has left the stage (Rule 10). Removing the last
     copyedited file brings the notice back.
   The notice is the editor's own: a Journal Manager who is not assigned to
   the submission sees the panels with no notice. <sup>d</sup>
<a id="draft-files"></a>
4. **"Draft Files".** The list holds the files to be copyedited. Each row
   shows the file's number ("No"), "File Name", "Date uploaded" and "Type",
   and, for the roles Actors names, a row menu ("More Actions") offering
   "Update File Details", "More Information" and "Delete"; "Delete" asks for
   confirmation in a "Delete" dialog with "OK" and "Cancel". "Upload/Select
   Files" above the list opens the window of Rule 5. Uploading a file here
   changes no notice (Rule 3). <sup>e</sup>
<a id="select-window"></a>
5. **The "Upload/Select Files" window.** Pressing "Upload/Select Files" on
   "Draft Files" opens a window titled "Upload/Select Files"; on "Copyedited
   Files" the same window opens titled "Upload Review File" ⚠ [A2](#a2). The
   window lists the submission's files grouped under the workflow stages the
   reader may open, each with a tick box; the files already in the list are
   ticked. "Add a file" at the top uploads a new file straight into the list
   through the upload wizard. Ticking a file from another stage and saving
   copies it into the list; unticking a file already in the list takes it
   out of the list (the file stays in its original stage). <sup>e</sup>
<a id="copyedited-files"></a>
6. **"Copyedited Files".** The list holds the copyedited versions. It offers
   the same columns, row menu and "Upload/Select Files" as "Draft Files"
   (Rules 4–5) to the roles Actors names. The Author sees the rows and
   nothing to press (Rule 11). The first file added here clears the notice
   box (Rule 3c) and is counted on the author's My Submissions list
   ("Copyedited Files Uploaded: {count}", *[My
   Submissions](U22-my-submissions.md)*). <sup>f</sup>
7. **Discussions and participants on this stage.** The "Copyediting Tasks &
   Discussions" panel is the stage's instance of the shared discussions
   panel and the "Participants" panel the stage's instance of the shared
   participants panel; both work as their own features describe (*Tasks &
   discussions*, *Stage participants*). What is this stage's: the discussions
   panel is shown in both views (Rule 11); the "Assign" form offers the
   groups whose stage set includes Copyediting (Actors); and a discussion
   opened here drives the notice box (Rule 3). <sup>a</sup> <sup>j</sup>
<a id="send-to-production"></a>
8. **"Send To Production".** Pressing it opens the decision wizard with two
   pages: "Notify Authors", an email to the submission's authors that can be
   skipped, and "Select Files", headed "Select files that should be sent to
   the production stage.", which lists the "Copyedited" files, all ticked,
   and the "Draft Files", none ticked. Recording the decision moves the
   submission to the Production stage: the bubble reads "Production", the
   ticked files appear in Production's "Production Ready Files" list (*Production
   stage*), and the wizard closes on "Sent to Production" with the message
   "The submission, {title}, was sent to the production stage. The author
   has been notified, unless you chose to skip that email." The notices of
   Rule 3 are removed. <sup>g</sup>
<a id="move-to-review"></a>
9. **"Move to Review".** Pressing it opens the wizard with the "Notify
   Authors" page alone. Recording the decision sends the submission back to
   where it came from: to the review stage, on its last round, when the
   submission has had a review round (on a press, to External Review if it
   ever had an external round, otherwise to Internal Review [OMP1](#omp1));
   the round's status box then reads as *[Review stage &
   rounds](U26-review-stage-and-rounds.md#round-status)* describes for a
   returned submission. A submission that was accepted without review goes
   back to the Submission stage, although the button and its email speak of
   review ⚠ [A1](#a1). The wizard closes on "Sent Back from Copyediting" with
   "The submission, {title}, was sent back from the copyediting stage. The
   author has been notified, unless you chose to skip that email." The
   "Draft Files" and "Copyedited Files" keep their files; a later acceptance
   adds its newly ticked files beside them. <sup>h</sup>
10. **No decision off the active stage.** The two buttons appear only while
    Copyediting is the submission's active stage. Once the submission has
    moved on, its "Copyediting" entry shows the two file lists and the
    discussions panel under the status box "The submission is currently in
    the Production stage.", with no buttons and no notice. <sup>c</sup>
<a id="author-view"></a>
11. **The author's view.** An Author opening their own submission at
    Copyediting sees the "Copyediting Tasks & Discussions" panel and, under
    it, the "Copyedited Files" list with its rows and no controls: no
    "Upload/Select Files", no row menu. There is no "Draft Files" list, no
    "Participants" panel, no notice box and no decision button. Before the
    submission reaches Copyediting the same entry shows only the box "The
    Copyediting stage has not yet been initiated."
    ([→ the status box](U24-workflow-screen-and-stage-access.md#status-box)).
    The author's entry route (View on My Submissions) belongs to *[My
    Submissions](U22-my-submissions.md)*. <sup>i</sup>
12. **The old author-dashboard address forwards.** An old author-dashboard
    bookmark (`…/authorDashboard/submission/<number>`) forwards the
    submission's own Author to the workflow panel on My Submissions; its
    former "Copyediting" tab is never shown. The forward and its refusals
    are [→ workflow addresses](U24-workflow-screen-and-stage-access.md#workflow-addresses).
    <sup>l</sup>

## Side effects

- **On "Send To Production".** The authors receive the email "Next steps for
  publishing your submission" unless the editor skipped it on the "Notify
  Authors" page; a notification "Production process started." is recorded
  for them; the Activity Log gains "{editor} sent this submission to the
  production stage."; the ticked files are copied into "Production Ready
  Files" (Rule 8). The wizard's own mechanics are *Editorial decision
  recording*'s. <sup>g</sup> <sup>o</sup>
- **On "Move to Review".** The authors receive the email "Your submission
  has been moved to review" unless skipped; the Activity Log gains "{editor}
  has sent this submission back from the copyediting stage."; the last
  review round, if any, is marked as returned to review (Rule 9). <sup>h</sup>
- **On assigning a Copyeditor with the "Request Copyedit" message.** The
  Copyeditor receives the email "Submission {number} is ready to be
  copyedited for {acronym}" and the task "You have been asked to review
  copyedits for "{title}"." in the header's Tasks panel (*Notifications
  center*). The task is not cleared by any later action on this stage; the
  Copyeditor removes it from the Tasks panel ⚠ [A4](#a4). The message also
  opens the discussion that flips the notice box (Rule 3b). <sup>j</sup>
- **On adding or removing a copyedited file.** The notice box of every
  assigned editor is recomputed (Rule 3), and the author's My Submissions
  cell counts the files (Rule 6). <sup>d</sup> <sup>f</sup>

## Settings that modify behavior

- **"Stages"** (Settings › Users & Roles › Roles › a role's "Edit" form, the
  stage tick boxes). The install default gives Copyediting to Journal
  Manager (every stage), Editor, Production editor, Section Editor, Guest
  Editor, Copyeditor, Marketing and sales coordinator, Author and
  Translator, and on a press to Volume editor and Chapter Author too;
  Layout Editor, Proofreader, Funding Coordinator, Reviewer and Reader have
  it unticked. With Copyediting ticked, an assigned member of the role
  reaches the stage's panels (Actors) and the role is offered in this
  stage's "Assign" form; unticked, an assigned member gets the no-access box
  here ([→ stage gate](U24-workflow-screen-and-stage-access.md#stage-gate))
  and the role is not offered. <sup>b</sup>
- **The three email templates** "Sent to Production", "Submission Sent Back
  from Copyediting" and "Request Copyedit" (Settings › Workflow › Emails).
  The install defaults carry the subjects Side effects quotes. An edited
  template changes the text the "Notify Authors" page and the "Assign" form
  prefill; the editing screen is *Emails management*'s. <sup>p</sup>
- **The app's workflow stages.** A preprint server ships a single-stage
  workflow, which is why its submissions never occupy a Copyediting stage
  [OPS1](#ops1). This is a fixed property of each application, not a
  configurable setting. <sup>k</sup>

## Cross-feature interactions

- **[Workflow screen & stage access](U24-workflow-screen-and-stage-access.md#stage-access)**:
  who may open a submission's workflow and reach this stage; the stage
  bubble, the "Preview" header button, the status box and the no-access
  box. This spec owns only what the Copyediting stage offers once opened.
- **Editorial decision recording**: the wizard behind "Send To Production"
  and "Move to Review" (Rules 8–9). This spec owns the buttons' presence and
  the stage change each decision makes.
- **[Review stage & rounds](U26-review-stage-and-rounds.md#decisions)**:
  "Accept Submission", the usual way in (Rule 2), and the destination of
  "Move to Review" with its round status (Rule 9).
- **[Submission stage](U25-submission-stage.md#send-to-review)**: "Accept and
  Skip Review", the other way in (Rule 2), and the destination of "Move to
  Review" for a submission never reviewed (Rule 9).
- **Production stage**: the destination of "Send To Production" and its
  "Production Ready Files" list (Rule 8).
- **Submission files**: the two lists' upload wizard, "Update File Details",
  "More Information", "Delete" and "Send to Text Editor" (Rules 4–6).
- **Stage participants**: the "Participants" panel and its "Assign" form,
  whose "Request Copyedit" message raises the Copyeditor's task (Rule 7;
  Side effects).
- **Tasks & discussions**: the "Copyediting Tasks & Discussions" panel
  (Rule 7).
- **[Notifications center](U05-notifications-center-and-email-preferences.md)**:
  the Tasks panel where the Copyeditor's task is listed (Side effects).
- **[My Submissions](U22-my-submissions.md)**: the author's entry route
  (Rule 11) and the "Copyedited Files Uploaded: {count}" cell (Rule 6).
- **Submission activity log & notes**: the log lines Side effects names.
- **Emails management**: the three templates (Settings).

## Canonical scenarios

Every scenario runs on the seeded journal with ready accounts and scratch
submissions seeded at Copyediting, except where a role no roster account
holds is needed, which runs on a scratch journal with throwaway accounts. A
preprint server has no Copyediting stage, so only its absence scenario runs
there; the accounts, their passwords, the mail catcher's address and the
tooling recipe are in the footnote. <sup>s</sup>

## Coverage

| Who, state or setting | Class | Runs in | Why not |
|-----------------------|-------|---------|---------|
| Editor opens a submission at Copyediting: the four panels and the two buttons (Actors row 1, Rule 1) | main | planned | |
| Unassigned Journal Manager: the panels and buttons, no notice (Actors row 2, Rule 3) | state | planned | |
| Assigned Section Editor: the same offer as the Editor (Actors rows 1, 6) | variant | | Nothing new to test |
| Assigned Copyeditor: both lists with "Upload/Select Files", no buttons, no notice (Actors rows 2–4, 6) | main | planned | |
| Marketing and sales coordinator or Production editor assigned here (Actors row 1) | variant | | Nothing new to test |
| Copyeditor assigned on a submission still in Review: the no-access box (Actors preamble) | guard | | Owned by another feature |
| Recommending editor: no buttons on this stage ⚠A5 (Actors row 6) | guard | | No seed |
| Author: discussions and a read-only "Copyedited Files" (Actors rows 1, 4; Rule 11) | main | planned | |
| Author before the stage is reached: "has not yet been initiated" (Rule 11) | state | | Owned by another feature |
| "Send to Text Editor" for a Journal Manager (Actors row 5) | variant | | Owned by another feature |
| Notice "Assign a copyeditor using the Assign link in the Participants list." (Rule 3a) | state | planned | |
| Notice "Awaiting Copyedits." after the "Assign" message (Rule 3b) | state | planned | |
| Notice follows the discussion, not the assignment ⚠A3 (Rule 3b) | variant | | Register carries it |
| Notice gone after the first copyedited file; back after its removal (Rule 3c) | state | planned | |
| "Draft Files" holds the files ticked at acceptance (Rules 2, 4) | state | planned | |
| "Upload/Select Files" window: tick a file from another stage, "Add a file" (Rule 5) | state | planned | |
| Unticking a listed file takes it out of the list (Rule 5) | variant | | Owned by another feature |
| The "Copyedited Files" window titled "Upload Review File" ⚠A2 (Rule 5) | variant | | Register carries it |
| Row menu "Update File Details", "More Information", "Delete" (Rule 4) | variant | | Owned by another feature |
| "Send To Production": "Select Files" ticks, the move, "Production Ready Files" (Rule 8) | main | planned | |
| Email "Next steps for publishing your submission" to the author (Side effects) | guard | planned | |
| "Notify Authors" skipped: no email (Rule 8; Side effects) | guard | | Owned by another feature |
| Notification "Production process started." for the author (Side effects) | guard | planned | |
| Activity Log lines of both decisions (Side effects) | guard | | Owned by another feature |
| The "Copyediting" entry after the move: status box, no buttons, no notice (Rule 10) | state | planned | |
| "Move to Review" after a review round: back on the last round (Rule 9) | state | planned | |
| "Move to Review" on a press after an internal round only: Internal Review [OMP1] (Rule 9) | state | planned | |
| "Move to Review" on a never-reviewed submission: the Submission stage ⚠A1 (Rule 9) | variant | | Register carries it |
| Email "Your submission has been moved to review" (Side effects) | guard | planned | |
| Files kept across "Move to Review" and a second acceptance (Rule 9) | state | | Budget |
| "Request Copyedit" message: email and task for the Copyeditor (Side effects) | guard | planned | |
| The Copyeditor's task not cleared by the upload ⚠A4 (Side effects) | variant | | Register carries it |
| "Copyedited Files Uploaded: {count}" on My Submissions (Rule 6) | guard | | Owned by another feature |
| Preprint server: no "Copyediting" entry, no Copyeditor role, neither button [OPS1] (Purpose) | guard | planned | |
| "Stages" of a role changed: Copyediting unticked for Copyeditor, ticked for Layout Editor (Settings bullet 1) | state | | No seed |
| An edited email template prefills the wizard (Settings bullet 2) | state | | Owned by another feature |

## Findings register

Verdicts are the author's judgment (claude, 2026-09-18), unreviewed unless an
entry notes otherwise; the team settles them on spec review.

| ID | Finding (one line, symptom) | Bug? | Impact | Review |
|----|-----------------------------|------|--------|--------|
| [A2](#a2) | The "Copyedited Files" list's "Upload/Select Files" opens a window titled "Upload Review File" | 🐞 | minor | — |
| [A1](#a1) | "Move to Review" sends a submission accepted without review back to the Submission stage, and the author's email says review | ❓ | user-visible | — |
| [A3](#a3) | The "Assign a copyeditor" notice flips on a discussion, not on the assignment | ❓ | minor | — |
| [A4](#a4) | The Copyeditor's "You have been asked to review copyedits" task is never cleared by the copyedits | ❓ | minor | — |
| [A5](#a5) | A recommend-only editor is offered nothing at all on the Copyediting stage | ❓ | minor | — |
| [OMP1](#omp1) | A press's "Move to Review" returns to External Review or, failing any external round, to Internal Review | ✅ | — | — |
| [OPS1](#ops1) | A preprint server has no Copyediting stage and no Copyeditor role | ✅ | — | — |

### All apps

<a id="a1"></a>
**A1 — "Move to Review" lands on the Submission stage for a submission never reviewed** · ❓ · user-visible.
A deciding editor who accepted a submission with "Accept and Skip Review"
and now presses "Move to Review" expects the submission in review. It goes
back to the Submission stage instead, because there is no review round to
return to, while the button, the wizard and the author's email ("Your
submission has been moved to review", "It will undergo further review before
it can be accepted") all say review. Nothing is lost: the Submission stage
offers its decisions again.
Question: should the button and its email follow the destination (a
"Move to Submission" wording when no round exists), or should the decision
open a review round? Lean: follow the destination in the wording; the
mechanism is deliberate, the words are not.
Basis: code. <sup>[f-a1](#fn-a1)</sup>

<a id="a2"></a>
**A2 — The "Copyedited Files" window is titled "Upload Review File"** · 🐞 · minor.
"Upload/Select Files" on "Copyedited Files" opens the file-selection window
under the title "Upload Review File", a title from the review stage; the
same button on "Draft Files" opens it as "Upload/Select Files". The window
works; only the title is wrong.
Basis: code. <sup>[f-a2](#fn-a2)</sup>

<a id="a3"></a>
**A3 — The notice reads the discussions, not the participants** · ❓ · minor.
The notice box tells an editor to assign a copyeditor until a discussion
exists on this stage, and reads "Awaiting Copyedits." from then on. The
"Assign" form's message opens such a discussion, so the ordinary assignment
flips the notice as expected. But an editor who assigns a Copyeditor without
a message keeps reading "Assign a copyeditor…", and any discussion opened on
this stage, with no Copyeditor assigned, reads "Awaiting Copyedits.".
Question: should the notice read the Participants panel (a Copyeditor
assigned) rather than the discussions? Lean: yes; the notice names the
Participants list as its condition.
Basis: code. <sup>[f-a3](#fn-a3)</sup>

<a id="a4"></a>
**A4 — The Copyeditor's task outlives the copyedits** · ❓ · minor.
The "Request Copyedit" message puts "You have been asked to review copyedits
for "{title}"." into the Copyeditor's Tasks panel. Uploading the copyedited
files, and even "Send To Production", leave the task there; only the
Copyeditor's own delete removes it. The layout and index requests of the
Production stage have completion emails that clear theirs; copyediting has
none.
Question: should the first copyedited file, or "Send To Production", clear
the task? Lean: clear it on "Send To Production", when the copyedits are
accepted.
Basis: code. <sup>[f-a4](#fn-a4)</sup>

<a id="a5"></a>
**A5 — A recommend-only editor has nothing to do on Copyediting** · ❓ · minor.
An editor whose participation is limited to recommendations gets dedicated
"Recommend…" controls on the review stage and a reduced decision button on
the Submission stage (*[Submission stage](U25-submission-stage.md#a2)*). On
Copyediting they get neither: the panels show and no button at all, so they
cannot send the submission on, move it back, or recommend either.
Question: is that intended, or should a recommendation be possible here as on
review? Lean: intended; there is no decision to recommend at this stage
short of the move itself, and a deciding editor is always assigned above
them.
Basis: code. <sup>[f-a5](#fn-a5)</sup>

### OMP

<a id="omp1"></a>
**OMP1 — "Move to Review" on a press returns to the review stage the monograph last had** · ✅ · —.
A press has two review stages. "Move to Review" returns the monograph to
External Review when it ever had an external round, otherwise to Internal
Review when it had an internal round, and to Submission when it had neither
(the last case is [A1](#a1)). A journal, with one review stage, needs no such
choice. Intended: the press's two stages are the difference, not the
decision.
Basis: code. <sup>[f-omp1](#fn-omp1)</sup>

### OPS

<a id="ops1"></a>
**OPS1 — A preprint server has no Copyediting stage** · ✅ · —.
A preprint server's workflow is a single stage, Production. Its workflow
menu lists "Production" alone, its Roles screen installs Preprint Server
Manager, Moderator, Author, Reader and Editorial Board Member and no
Copyeditor, and neither "Send To Production" nor "Move to Review" exists
anywhere on its screens. Intended: the application ships that way.
Basis: code. <sup>[f-ops1](#fn-ops1)</sup>

---

<a id="footnotes"></a>
## Footnotes — mechanism & evidence

Code read 2026-09-18 at the checkouts' tips (`checkouts/ojs`, `checkouts/omp`,
`checkouts/ops`, each with its `lib/pkp` and `lib/ui-library`). Nothing in
this draft has been seen on a running install yet; every `to drive:` line is
a question for the claim check.

<a id="fn-a"></a>
**a** — The stage's panels: `lib/ui-library/src/pages/workflow/composables/useWorkflowConfig/workflowConfigEditorialOJS.js`, `WorkflowConfig[WORKFLOW_STAGE_ID_EDITING]`: `getPrimaryItems` pushes `WorkflowNotificationDisplay`, `FileManager` namespace `FINAL_DRAFT_FILES`, `DiscussionManager`, `FileManager` namespace `COPYEDITED_FILES`, in that order; `getSecondaryItems` pushes `ParticipantManager`. `useWorkflowConfigOMP.js` deep-merges `workflowConfigEditorialOMP.js` over the OJS config, and the OMP file defines no `WORKFLOW_STAGE_ID_EDITING` key of its own, so the press shows the OJS roster (positive chain evidence, RUNBOOK rule 8). Titles and descriptions from `useFileManagerConfig.js`: `FINAL_DRAFT_FILES` → `submission.finalDraft` "Draft Files" and `fileManager.draftFilesDescription`; `COPYEDITED_FILES` → `fileManager.copyeditedFiles` "Copyedited Files" and `fileManager.copyeditedFilesDescription`. The discussions heading is `getDiscussionTitleByStage()` in `managers/DiscussionManager/useDiscussionManagerHelpers.js` → `submission.queries.editorial` "Copyediting Tasks & Discussions" (OJS and OMP `locale/en/submission.po` both carry the same text; lib/pkp's key is not overridden). The `common.getPrimaryItems` guard shows `user.authorization.accessibleWorkflowStage` (the no-access box) when the stage is outside `permissions.accessibleStages`, which is U24's rule.

<a id="fn-b"></a>
**b** — Stage sets: `registry/userGroups.xml`. OJS: manager (no `stages`, every stage), editor `1,3,4,5,6`, productionEditor `4,5,6`, sectionEditor and guestEditor `1,3,4,5,6`, copyeditor `4`, marketing `4`, designer / indexer / layoutEditor / proofreader `5,6`, funding `1,3`, author and translator `1,3,4,5,6`, externalReviewer `3`, reader / subscriptionManager / editorialBoardMember none. OMP: the same with `2` (Internal Review) added to editor, sectionEditor, funding (`1,2,3`), author and translator; plus volumeEditor `1,2,3,4,5,6`, chapterAuthor `4,5,6`, internalReviewer `2`. Stage 4 is `WORKFLOW_STAGE_ID_EDITING`. On-screen names: `default.groups.name.marketing` "Marketing and sales coordinator", `default.groups.name.productionEditor` "Production editor", `default.groups.name.volumeEditor` "Volume editor", `default.groups.name.chapterAuthor` "Chapter Author". The Roles form's tick boxes are `settings.roles.stages` "Stages". No passthrough key sets a role's stages (scenarios.md), so the other end is reached on the screen only.

<a id="fn-c"></a>
**c** — Decision roster: `classes/submission/maps/Schema.php::getAvailableEditorialDecisions()` in OJS (line ~173) and OMP (line ~256), `case WORKFLOW_STAGE_ID_EDITING: [new SendToProduction(), new BackFromCopyediting()]`, with no status branch (a submission cannot be declined here). Buttons: `workflowConfigEditorialOJS.js` `getActionItems` pushes `WorkflowActionButton` `editor.submission.decision.sendToProduction` ("Send To Production", `isPrimary`) and `editor.submission.decision.backFromCopyediting` ("Move to Review", `isWarnable`), each guarded by `isDecisionAvailable(submission, DECISION_*)`, which matches the submission's active stage, so the buttons vanish once it moves on (Rule 10). Permissions: `lib/pkp/classes/submission/maps/Schema.php::checkDecisionPermissions()`; an assistant never satisfies `canMakeDecision`; a recommend-only editor gets `canMakeDecision` only when `Repo::decision()->getDecisionTypesMadeByRecommendingUsers($stageId)` is non-empty, and both apps' `classes/decision/Repository.php` return an empty list for every stage but Submission, so the roster is empty for them here (A5). Recommend-only can only be set on the Participants panel's assignment form (no seed key). to drive: as Journal Manager on a submission at Copyediting with an assigned Section Editor, open the Section Editor's row on "Participants", tick the recommend-only option and save; sign in as that Section Editor and open Copyediting: record whether any decision button or "Recommend…" control shows above the panels (expected: none), and whether the "Participants" panel still offers "Assign".

<a id="fn-d"></a>
**d** — The notice box is `WorkflowNotificationDisplay.vue`, which posts to `notification/fetchNotification` for the types `NOTIFICATION_TYPE_ASSIGN_COPYEDITOR` and `NOTIFICATION_TYPE_AWAITING_COPYEDITS` on `ASSOC_TYPE_SUBMISSION`; `PKPNotificationHandler::fetchNotification()` reads the signed-in user's own rows, so the box is per user. Texts: `notification.type.assignCopyeditors` "Assign a copyeditor using the Assign link in the Participants list." and `notification.type.awaitingCopyedits` "Awaiting Copyedits.". Rows are created and deleted by `PKPEditingProductionStatusNotificationManager::updateNotification()`, for each `StageAssignment` of the submission at its current stage with role `ROLE_ID_MANAGER` or `ROLE_ID_SUB_EDITOR` (an unassigned manager has no row and sees nothing): at `WORKFLOW_STAGE_ID_EDITING`, with any `SUBMISSION_FILE_COPYEDIT` file both types are deleted; otherwise, with an `EditorialTask` at stage `WORKFLOW_STAGE_ID_EDITING` (the code's comment: "a copyeditor is assigned i.e. there is a copyediting discussion") AWAITING is created and ASSIGN deleted, and with none ASSIGN is created and AWAITING deleted; at `WORKFLOW_STAGE_ID_PRODUCTION` both are deleted. The recomputation runs on the accept and send-to-production decisions (`lib/pkp/classes/decision/Repository.php::getSubmissionNotificationTypes()`), on a participant added or removed (`StageParticipantGridHandler`), on the assign form's message (`PKPStageParticipantNotifyForm::execute()`), on a copyedited file added or deleted (`submissionFile/Repository.php`, `ManageCopyeditFilesGridHandler::updateCopyeditFiles()`) and on a task saved (`EditorialTaskController`). to drive: as Editor (assigned) on a fresh submission at Copyediting, read the notice (expected "Assign a copyeditor…"); as Journal Manager not assigned, open the same stage and record whether any notice shows (expected none). Then on "Participants" press "Assign", choose the Copyeditor, leave the message section untouched or empty if the form allows, save: record the notice the Editor now reads. On a second submission, assign the Copyeditor with the "Request Copyedit" message: record the notice (expected "Awaiting Copyedits."). On a third, open a discussion under "Copyediting Tasks & Discussions" with no Copyeditor assigned: record the notice. Finally upload one file to "Copyedited Files" and record that the notice is gone, then delete that file and record whether it returns.

<a id="fn-e"></a>
**e** — "Draft Files": `useFileManagerConfig.js` `FINAL_DRAFT_FILES`, `fileStage` `SUBMISSION_FILE_FINAL`, actions for `ROLE_ID_SUB_EDITOR` / `MANAGER` / `SITE_ADMIN` / `ASSISTANT`: `FILE_LIST`, `FILE_SELECT_UPLOAD`, `FILE_EDIT`, `FILE_DELETE`, `FILE_SEE_NOTES`; no `ROLE_ID_AUTHOR` entry, so the author's config never mounts it. Roles are matched by `useCurrentUser().hasCurrentUserAtLeastOneAssignedRoleInStage()` against `stage.currentUserAssignedRoles`, which `lib/pkp/classes/submission/maps/Schema.php` fills from the user's stage assignments, or from the global manager / site-admin role when the user is assigned in no role (so an unassigned Journal Manager gets the full controls). Columns from `getColumns()`: `common.numero` "No", `common.fileName` "File Name", `common.dateUploaded` "Date uploaded", `common.type` "Type", plus a screen-reader-only `common.moreActions` "More Actions" column; row menu from `getItemActions()`: `grid.action.updateFile` "Update File Details", `grid.action.moreInformation` "More Information", `grid.action.delete` "Delete" (a `common.delete` dialog with `common.ok` / `common.cancel`). Top button `editor.submission.uploadSelectFiles` "Upload/Select Files" → `useFileManagerActions.fileSelectUpload()` opens the legacy grid `grid.files.final.FinalDraftFilesGridHandler` op `selectFiles`, whose `ManageFinalDraftFilesForm` renders `templates/controllers/grid/files/final/manageFinalDraftFiles.tpl` with the `ManageFinalDraftFilesGridHandler` grid (`SubmissionFilesCategoryGridDataProvider(SUBMISSION_FILE_FINAL)`, `FILE_GRID_ADD` giving `grid.action.addFile` "Add a file"); the categories are the stages in `ASSOC_TYPE_ACCESSIBLE_WORKFLOW_STAGES`, each listing that stage's file stages (`_getFileStagesByStageId()`). Save runs `ManageSubmissionFilesForm::execute()`: a ticked file from another stage is copied in (`importFile()`), a listed file's tick sets its `viewable` flag. Window title for this list: `uploadSelectTitleKey` `editor.submission.uploadSelectFiles`. Unassigned in this spec because the window is *Submission files*' mechanism; the instantiation facts are here. to drive: as Editor on "Draft Files", press "Upload/Select Files": record the window title, the group headings and which files are ticked; tick a file listed under "Submission" and save: record it appears in "Draft Files"; reopen, untick it, save: record whether it leaves "Draft Files" and whether the "Submission Files" list on the Submission stage still holds it. Record the exact label of the window's upload button ("Add a file" expected) and the title of the upload wizard it opens.

<a id="fn-f"></a>
**f** — "Copyedited Files": `useFileManagerConfig.js` `COPYEDITED_FILES`, `fileStage` `SUBMISSION_FILE_COPYEDIT`; `ROLE_ID_AUTHOR` gets `FILE_LIST` alone (no top button, `getItemActions()` returns an empty list); the editorial roles the same set as `FINAL_DRAFT_FILES`. `uploadSelectTitleKey` is `editor.submissionReview.uploadFile` "Upload Review File" (A2); `gridComponent` `grid.files.copyedit.CopyeditFilesGridHandler` op `selectFiles` → `ManageCopyeditFilesGridHandler`, whose `updateCopyeditFiles()` recomputes the notices (note d). Server side the author may read copyedit files: `lib/pkp/classes/submissionFile/Repository.php::getAssignedFileStages()` adds `SUBMISSION_FILE_COPYEDIT` for an author assignment at `WORKFLOW_STAGE_ID_EDITING` with `SUBMISSION_FILE_ACCESS_READ` and never `SUBMISSION_FILE_FINAL`; `PKPSubmissionFileController::getMany()` filters the listing by that set. The My Submissions cell is *My Submissions*' rule 7c. to drive: as Author on their submission at Copyediting with one copyedited file, read the "Copyedited Files" rows: record whether a "More Actions" button renders at the row's end (expected none) and whether pressing the file name downloads the file; then as Editor press "Upload/Select Files" on "Copyedited Files" and record the window's title (expected "Upload Review File", A2).

<a id="fn-g"></a>
**g** — `lib/pkp/classes/decision/types/SendToProduction.php`: `getStageId()` `WORKFLOW_STAGE_ID_EDITING`, `getNewStageId()` `WORKFLOW_STAGE_ID_PRODUCTION`; `getSteps()` adds an `Email` step (`editor.submission.decision.notifyAuthors` "Notify Authors", mailable `DecisionSendToProductionNotifyAuthor`, `toRoleIds` `[ROLE_ID_AUTHOR]`) only when the submission has author participants, then a `PromoteFiles` step (`editor.submission.selectFiles` "Select Files", `editor.submission.decision.promoteFiles.production` "Select files that should be sent to the production stage.", target `SUBMISSION_FILE_PRODUCTION_READY`) with `addFileList(__('submission.copyedited'), …SUBMISSION_FILE_COPYEDIT)` selected by default and `addFileList(__('submission.finalDraft'), …SUBMISSION_FILE_FINAL, false)` not selected. `getCompletedLabel()` `editor.submission.decision.sendToProduction.completed` "Sent to Production"; `getCompletedMessage()` `….completed.description`. The arrival at Copyediting is `Accept` (review) and `SkipExternalReview` (submission) with `getNewStageId()` `WORKFLOW_STAGE_ID_EDITING`; their `PromoteFiles` target is `SUBMISSION_FILE_FINAL`, which is why the ticked files land in "Draft Files". The decision repository's `getSubmissionNotificationTypes()` recomputes the two notices on `ACCEPT` and, together with the production pair, on `SEND_TO_PRODUCTION`. No app subclasses either decision type (OMP's `classes/decision/types/` holds only its internal-review set). to drive: as Editor press "Send To Production" on a submission with one draft and one copyedited file: record the page names, which list is ticked on "Select Files", the closing label and message, the bubble, and what Production's "Production Ready Files" lists.

<a id="fn-h"></a>
**h** — `lib/pkp/classes/decision/types/BackFromCopyediting.php`: `getLabel()` `editor.submission.decision.backFromCopyediting`, whose text is "Move to Review" in OJS and OMP `locale/en/editor.po` (lib/pkp's key is overridden by both apps, checked first as seed-facts asks); `getNewStageId()` returns `WORKFLOW_STAGE_ID_EXTERNAL_REVIEW` when `ReviewRoundDAO::submissionHasReviewRound()` finds an external round, else `WORKFLOW_STAGE_ID_INTERNAL_REVIEW` when it finds an internal one, else `WORKFLOW_STAGE_ID_SUBMISSION` (A1, OMP1); `runAdditionalActions()` sets the last review round's status to `REVIEW_ROUND_STATUS_RETURNED_TO_REVIEW` (the "Returned back to review." sentence is *Review stage & rounds*' Rule 4) and sends `DecisionBackFromCopyeditingNotifyAuthor`; `getSteps()` adds the "Notify Authors" `Email` step only. `getCompletedLabel()` "Sent Back from Copyediting". Files are never deleted by a decision; `Accept`'s `PromoteFiles` copies the ticked files again into `SUBMISSION_FILE_FINAL`. to drive: as Editor on a submission that reached Copyediting through review, press "Move to Review" and complete the wizard: record the stage the workflow lands on, the round entry's status sentence, and the bubble; record "Accept Submission" once more and open Copyediting: record what "Draft Files" lists (the earlier files, the newly ticked ones, or both). On a second submission accepted with "Accept and Skip Review", press "Move to Review": record the stage the workflow lands on (expected "Submission", A1).

<a id="fn-i"></a>
**i** — `workflowConfigAuthorOJS.js` and `workflowConfigAuthorOMP.js` both define `[WORKFLOW_STAGE_ID_EDITING].getPrimaryItems` as `DiscussionManager` then `FileManager` namespace `COPYEDITED_FILES`; neither defines `getSecondaryItems` or `getActionItems` for the stage, and the author config has no `WorkflowNotificationDisplay` anywhere. The common `getPrimaryItems` stops at `WorkflowSubmissionStatus` while `hasNotSubmissionStartedStage()` holds (the "has not yet been initiated." box, U24 Rule 15a). The author's controls on the file list are note f's.

<a id="fn-j"></a>
**j** — `lib/pkp/controllers/grid/users/stageParticipant/form/PKPStageParticipantNotifyForm.php::execute()`: the message creates a query (discussion) with a `NOTIFICATION_TYPE_NEW_QUERY` task and sends the chosen template; for `templateKey` `COPYEDIT_REQUEST` it also calls `_addAssignmentTaskNotification()` with `NOTIFICATION_TYPE_COPYEDIT_ASSIGNMENT` for the assignee and logs `SubmissionEmailLogEventType::COPYEDIT_NOTIFY_COPYEDITOR`. Task text: `PKPNotificationManager::getNotificationMessage()` → `notification.type.copyeditorRequest` "You have been asked to review copyedits for "{$title}"."; its link is the editorial dashboard with `workflowSubmissionId`. Email: `emails.copyeditRequest.subject` "Submission {$submissionId} is ready to be copyedited for {$contextAcronym}", template name `mailable.copyeditRequest.name` "Request Copyedit". No code path deletes `NOTIFICATION_TYPE_COPYEDIT_ASSIGNMENT` (the grep of lib/pkp and both apps finds its creation only; the `LAYOUT_COMPLETE` / `INDEX_COMPLETE` branches clear their siblings) (A4). The Vue "Participants" panel opens the legacy `StageParticipantGridHandler` ops `addParticipant` and `viewNotify` (`managers/ParticipantManager/useParticipantManagerActions.js`), so the same form serves both. to drive: as Editor assign the Copyeditor with the "Request Copyedit" message; sign in as the Copyeditor: record the Tasks panel row and the email's subject in the mail catcher; upload a file to "Copyedited Files" and reopen the Tasks panel: record whether the row is still there; after the Editor's "Send To Production", record it once more.

<a id="fn-k"></a>
**k** — OPS: `classes/core/Application.php::getApplicationStages()` returns `[WORKFLOW_STAGE_ID_PRODUCTION]`; `registry/userGroups.xml` installs manager, sectionEditor, author (`5,6`), reader and editorialBoardMember only, no copyeditor; `classes/submission/maps/Schema.php::getAvailableEditorialDecisions()` returns nothing outside Production and Done. `workflowConfigEditorialOPS.js` names `WORKFLOW_STAGE_ID_EDITING` once, in the header's "Preview" condition, and defines no stage entry for it. The scenario API rejects `copyeditor` as a role key on OPS (users.md section 2).

<a id="fn-l"></a>
**l** — `lib/pkp/pages/authorDashboard/PKPAuthorDashboardHandler.php::submission()` answers `redirectUrl()` to `dashboard/mySubmissions?workflowSubmissionId=<id>`; the template `lib/pkp/templates/controllers/tab/authorDashboard/editorial.tpl` (the old "Copyediting" tab with its copyedited-files grid, guarded by `stageId >= WORKFLOW_STAGE_ID_EDITING` and `$canAccessCopyeditingStage`, else `submission.stageNotInitiated` "Stage not initiated.") is therefore never rendered. The forward itself is U24's Rule 2b.

<a id="fn-m"></a>
**m** — `workflowConfigEditorialOJS.js` pushes the `editor.submission.schedulePublication` button in `[WORKFLOW_STAGE_ID_SUBMISSION].getActionItems` and `[WORKFLOW_STAGE_ID_PRODUCTION].getActionItems` only; `[WORKFLOW_STAGE_ID_EDITING].getActionItems` holds the two decision buttons alone. OMP never shows the shortcut (*Submission stage*, Rule 7).

<a id="fn-n"></a>
**n** — `useFileManagerConfig.js`: `FILE_SEND_TO_EDITOR` is granted to `ROLE_ID_SITE_ADMIN` and `ROLE_ID_MANAGER` on both lists and offered per row only when the file's extension is in `PANDOC_IMPORT_EXTENSIONS` (`docx`, `odt`, `rtf`, `tex`, `latex`, `md`, `markdown`); label `grid.action.sendToTextEditor` "Send to Text Editor"; it opens `WorkflowVersionDialogBody` in mode `sendToTextEditor` (dialog title `fileManager.sendFileToTextEditor` "Send File to Text Editor"). Mechanics belong to *Submission files*.

<a id="fn-o"></a>
**o** — `PKPNotificationManager` maps `Decision::SEND_TO_PRODUCTION` to `NOTIFICATION_TYPE_EDITOR_DECISION_SEND_TO_PRODUCTION`; `EditorDecisionNotificationManager::updateNotification()` deletes the submission's earlier editor-decision rows for the given users and creates the new one at `NOTIFICATION_LEVEL_NORMAL` (not a task), text `notification.type.editorDecisionSendToProduction` "Production process started.", title `notification.type.editorDecisionTitle` "Latest editor decision.", link `getWorkflowUrlByUserRoles()`. Log line: `editor.submission.decision.sendToProduction.log` "{$editorName} sent this submission to the production stage."; for the other decision `….backFromCopyediting.log` "{$editorName} has sent this submission back from the copyediting stage." (the log is *Submission activity log & notes*'). to drive: after "Send To Production", sign in as the Author and look for "Production process started." on the workflow panel's stages and in the header's Tasks panel: record where, if anywhere, it shows.

<a id="fn-p"></a>
**p** — Template names on Settings › Workflow › Emails: `mailable.decision.sendToProduction.notifyAuthor.name` "Sent to Production", `mailable.decision.backFromCopyediting.notifyAuthor.name` "Submission Sent Back from Copyediting", `mailable.copyeditRequest.name` "Request Copyedit"; default subjects `emails.editorDecisionSendToProduction.subject` "Next steps for publishing your submission", `emails.editorDecisionBackFromCopyediting.subject` "Your submission has been moved to review", `emails.copyeditRequest.subject` "Submission {$submissionId} is ready to be copyedited for {$contextAcronym}". Both mailables carry `fromRoleIds [ROLE_ID_SUB_EDITOR]`, `toRoleIds [ROLE_ID_AUTHOR]`. No passthrough key edits a template (scenarios.md).

<a id="fn-s"></a>
**s** — Seeding for the scenarios to come (RUNBOOK step 6): the seeded journal `publicknowledge` and roster accounts (passwords = username doubled), scratch submissions through `POST scenarios/submission` with submitter `author.alex`. A submission at Copyediting after review: `decisions: ['sendExternalReview', 'accept']` with one `reviewRounds` entry (a completed `reviewer.julia`; on the press add `series: 'monographs'`); accepted without review: `decisions: ['skipExternalReview']`; a press with an internal round only: `decisions: ['sendInternalReview', 'acceptFromInternal']` with one `reviewRounds` entry of `stage: 'internal'`. A Copyeditor: `participants: [{username: 'copyeditor.carla', role: 'copyeditor'}]`, which writes the assignment row without the "Assign" form's message, so the notice stays at "Assign a copyeditor…" (Rule 3a) until a discussion exists; the "Request Copyedit" path is driven on screen. Seeded submissions carry no files: a test uploads into "Draft Files" or "Copyedited Files" through "Upload/Select Files" (a submission-stage file for the tick case comes from the Submission stage's "Submission Files" panel). Mail reads are scoped by recipient in Mailpit at `http://127.0.0.1:8025`, so an email scenario runs on a scratch journal from `POST scenarios/context` with throwaway `roles: ['editor']`, `['copyeditor']` and `['author']` accounts. The roster holds no recommend-only assignment (the flag is set on screen). Editors: `editor.diana` (OJS, OMP), `manager.maya` for the unassigned-manager case; `sectioneditor.ana` is auto-assigned on a journal (section ART) but a monograph needs an explicit `participants` entry for a Series editor. Never decide on a shared roster submission.

<a id="fn-a1"></a>
**f-a1** — `BackFromCopyediting::getNewStageId()` (note h) falls through to `WORKFLOW_STAGE_ID_SUBMISSION` when `submissionHasReviewRound()` is false for both review stages; the label key `editor.submission.decision.backFromCopyediting` reads "Move to Review" in both apps' `locale/en/editor.po`, and the mailable's body (`emails.editorDecisionBackFromCopyediting.body`) says "has been moved to the review stage. It will undergo further review before it can be accepted for publication." The class doc-comment states the three-way fall-through as designed, which is why the lean is on the wording. Code read 2026-09-18; not yet seen running.

<a id="fn-a2"></a>
**f-a2** — `useFileManagerConfig.js` `COPYEDITED_FILES.uploadSelectTitleKey: tk('editor.submissionReview.uploadFile')` ("Upload Review File"), where `FINAL_DRAFT_FILES` uses `editor.submission.uploadSelectFiles` ("Upload/Select Files"); `fileSelectUpload()` passes the key straight to `openLegacyModal({title})`. Code read 2026-09-18.

<a id="fn-a3"></a>
**f-a3** — `PKPEditingProductionStatusNotificationManager::updateNotification()`, the `WORKFLOW_STAGE_ID_EDITING` branch (note d): the "copyeditor assigned" test is `EditorialTask::withAssoc(ASSOC_TYPE_SUBMISSION, $submissionId)->withStageId(WORKFLOW_STAGE_ID_EDITING)->first()`, the code's own comment reading "If a copyeditor is assigned i.e. there is a copyediting discussion"; no stage-assignment or user-group check enters it. The same proxy is used for the production notices. Code read 2026-09-18.

<a id="fn-a4"></a>
**f-a4** — `PKPStageParticipantNotifyForm::execute()` creates `NOTIFICATION_TYPE_COPYEDIT_ASSIGNMENT` on `COPYEDIT_REQUEST`; `NotificationManagerDelegate` subclasses and the decision repository touch only the `ASSIGN_COPYEDITOR` / `AWAITING_COPYEDITS` pair; a grep for the constant across `lib/pkp`, `ojs` and `omp` finds `Notification.php` (definition), `PKPNotificationManager.php` (message and link) and the notify form (creation) only. Code read 2026-09-18.

<a id="fn-a5"></a>
**f-a5** — Note c: `checkDecisionPermissions()` grants `canMakeDecision` to a recommend-only user only when `getDecisionTypesMadeByRecommendingUsers($stageId)` is non-empty, and both apps' `decision/Repository.php` list a type for `WORKFLOW_STAGE_ID_SUBMISSION` alone; `getAvailableEditorialDecisions()` then returns `[]`, and the review stage's `Recommend…` controls are the review config's, absent from `[WORKFLOW_STAGE_ID_EDITING]`. The Submission-stage counterpart is *Submission stage*'s A2 (probed 2026-08-02). Code read 2026-09-18.

<a id="fn-omp1"></a>
**f-omp1** — Note h: the external-then-internal-then-submission order of `BackFromCopyediting::getNewStageId()`; OMP's `Schema.php` uses the shared class unchanged, and OMP's `Application::getApplicationStages()` lists both review stages. Code read 2026-09-18.

<a id="fn-ops1"></a>
**f-ops1** — Note k. Code read 2026-09-18.

## Reference — entry points & surfaces

| Entry | Path | Atom |
|-------|------|------|
| Copyediting stage (editorial view): notice box, Draft Files, discussions, Copyedited Files | workflow → "Copyediting" menu entry | AFFW-356, 357, 358, 359 |
| Copyediting stage: Participants panel | workflow → "Copyediting" → right column | AFFW-360 |
| Copyediting decision buttons "Send To Production", "Move to Review" | workflow "Copyediting" → action buttons | AFFW-361, 362 |
| Copyediting stage (author view): discussions and Copyedited Files | My Submissions → View → "Copyediting" | AFFW-363 |
| "Upload/Select Files" window on Draft Files (select op, selection grid) | "Draft Files" → "Upload/Select Files" | GRID-019 · GRID-020 |
| "Upload/Select Files" window on Copyedited Files (select op, selection grid) | "Copyedited Files" → "Upload/Select Files" | GRID-014 · GRID-015 |
| Notice box texts and the Copyeditor's task | workflow "Copyediting" notice box; header Tasks panel | NOTIF-042 · NOTIF-043 · NOTIF-032 |
| Legacy author-dashboard "Copyediting" tab | `{journal}/authorDashboard/submission/{id}` (forwards to the current workflow; the tab never renders) | AFFW-705 |

## Reference — code anchors

- `lib/ui-library/src/pages/workflow/composables/useWorkflowConfig/workflowConfigEditorialOJS.js` · `workflowConfigEditorialOMP.js` (no editing-stage override) · `workflowConfigEditorialOPS.js` (no editing stage) — panels, notice component and buttons
- `lib/ui-library/src/pages/workflow/composables/useWorkflowConfig/workflowConfigAuthorOJS.js` · `workflowConfigAuthorOMP.js` — the author view
- `lib/ui-library/src/pages/workflow/components/primary/WorkflowNotificationDisplay.vue` — the notice box
- `lib/ui-library/src/managers/FileManager/useFileManagerConfig.js` (`FINAL_DRAFT_FILES`, `COPYEDITED_FILES`) · `useFileManagerActions.js` · `fileManagerStore.js` · `FileManager.vue`
- `lib/ui-library/src/managers/DiscussionManager/useDiscussionManagerHelpers.js` — the "Copyediting Tasks & Discussions" heading
- `lib/ui-library/src/composables/useCurrentUser.js::hasCurrentUserAtLeastOneAssignedRoleInStage()` · `lib/pkp/classes/submission/maps/Schema.php` (`currentUserAssignedRoles`, `checkDecisionPermissions()`)
- `classes/submission/maps/Schema.php::getAvailableEditorialDecisions()` (OJS, OMP, OPS) · `classes/decision/Repository.php::getDecisionTypesMadeByRecommendingUsers()` (OJS, OMP)
- `lib/pkp/classes/decision/types/SendToProduction.php` · `BackFromCopyediting.php` · `Accept.php` · `SkipExternalReview.php` · `lib/pkp/classes/decision/steps/PromoteFiles.php` · `lib/pkp/classes/decision/Repository.php::getSubmissionNotificationTypes()`
- `lib/pkp/classes/mail/mailables/DecisionSendToProductionNotifyAuthor.php` · `DecisionBackFromCopyeditingNotifyAuthor.php`
- `lib/pkp/classes/notification/managerDelegate/PKPEditingProductionStatusNotificationManager.php` · `EditorDecisionNotificationManager.php` · `lib/pkp/classes/notification/PKPNotificationManager.php` · `lib/pkp/pages/notification/NotificationHandler.php::fetchNotification()`
- `lib/pkp/controllers/grid/files/final/{FinalDraftFilesGridHandler,ManageFinalDraftFilesGridHandler}.php` (GRID-019/020) · `lib/pkp/controllers/grid/files/copyedit/{CopyeditFilesGridHandler,ManageCopyeditFilesGridHandler}.php` (GRID-014/015) · `lib/pkp/controllers/grid/files/form/ManageSubmissionFilesForm.php` · `lib/pkp/controllers/grid/files/SubmissionFilesCategoryGridDataProvider.php`
- `lib/pkp/controllers/grid/users/stageParticipant/StageParticipantGridHandler.php` · `form/PKPStageParticipantNotifyForm.php` (`COPYEDIT_REQUEST`)
- `lib/pkp/classes/submissionFile/Repository.php` (`getAssignedFileStages()`, the copyedit-file notification hook) · `lib/pkp/api/v1/submissions/PKPSubmissionFileController.php::getMany()`
- `registry/userGroups.xml` (OJS, OMP, OPS) — stage sets · `ops/classes/core/Application.php::getApplicationStages()`
- `lib/pkp/pages/authorDashboard/PKPAuthorDashboardHandler.php::submission()` · `lib/pkp/templates/controllers/tab/authorDashboard/editorial.tpl` (AFFW-705, never rendered)
- Locale: `locale/en/editor.po` (OJS and OMP override `editor.submission.decision.backFromCopyediting` → "Move to Review"), `lib/pkp/locale/en/{submission,editor,notification,emails,manager}.po`
- App divergence points checked: no app subclass of the decision types, grid handlers or notification delegates; OMP's editorial and author configs add no editing-stage entry; OPS has no editing stage, no Copyeditor group and no editing decisions
