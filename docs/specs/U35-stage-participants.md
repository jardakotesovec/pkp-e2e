---
name: stage-participants
status: verified
---

# Stage participants {OJS OMP OPS}

> Conventions (markers, badges, footnotes): [Reading a spec](GLOSSARY.md#reading-a-spec).

## Purpose

Every submission carries a list of the people working on it: the editors
who decide, the assistants who copyedit and lay out, and the author who
submitted. The **Participants panel** on the workflow screen is where an
editor manages that list for a stage: assigns a person in a role, limits an
editor's participation to recommendations, allows or withholds the right to
change the publication's metadata, sends a participant a message that opens a
discussion, removes a participant, and, for a manager, signs in as one of
them. The list drives everything else: who reaches the submission, who is
emailed, who decides.

This spec covers the panel itself, its "Assign Participant", "Edit
Assignment" and "Notify" windows, the "Remove" and "Login As" entries, the
emails, tasks and log lines an assignment produces, and the assignments the
journal makes by itself when a submission is submitted. What each stage
shows around the panel, and who reaches a stage at all, is the stage
features' and [→ stage access](U24-workflow-screen-and-stage-access.md#stage-access);
what a recommending editor records is *[Editorial decision
recording](U34-editorial-decision-recording.md#recommendation)*'s, and what
the metadata permission unlocks is *[Publication
metadata](U40-publication-metadata.md#edit-gate)*'s. <sup>r</sup>

## Actors & permissions

**Terms used below.** A **participant** is a person listed on the panel: one
row per person and role. A person assigned in a role is a participant on
every stage that role works in (Rule 2). **Manager-level roles** are Journal
Manager, Editor and Production editor, which the Roles settings screen lists
at the permission level "Journal Manager" (a press: "Press Manager"; a
preprint server: "Manager"); while not assigned to a submission they reach
every submission on every stage, and an assignment in one of them counts as
an editor's. An account assigned to a submission in some role, a manager's
or administrator's included, reaches only that role's stages there
([→ stage access](U24-workflow-screen-and-stage-access.md#stage-access)).
**Editor-level roles** are Section Editor and, on a journal, Guest
Editor, which need an assignment. **Assistant roles** are Copyeditor, Layout
Editor, Proofreader, Funding Coordinator and the other assistant-level
groups. A Site Administrator acts through a journal role on this install
(a role-less administrator is [→ unverified](U24-workflow-screen-and-stage-access.md#stage-access)).
"Assigned" means listed on the panel of the stage in question. The rows say
what each role is offered once the stage's panels are open; who opens them
is [→ stage access](U24-workflow-screen-and-stage-access.md#stage-access).
<sup>a</sup> <sup>c</sup>

| Action | Who may, and when |
|--------|--------------------|
| **See the panel** ("Participants", right-hand column; Rule 1) | • Site Administrator; Journal Manager; Editor; Production editor: every submission, on every stage, while not assigned to it<br>• Assigned Section Editor, Guest Editor and assistant roles: their assigned submissions, on the stages their role works in; the same for an account assigned as Production editor, a manager's or administrator's included, which is refused the Submission and Review entries with "You don't currently have access to that stage of the workflow."<br>• Author: never; the author's view has no Participants panel on any stage<br>• Reviewer: never <sup>a</sup> |
| **"Assign"** (the panel's header button; Rule 4) | • Site Administrator; Journal Manager; Editor; assigned Production editor: every submission they see<br>• Assigned Section Editor and Guest Editor, their participation limited to recommendations or not (Rule 5c)<br>• Assistant roles: not offered; the panel's rows and their "Notify" alone <sup>c</sup> |
| **"Edit"** (a row's menu; Rule 7) | • Site Administrator; Journal Manager; Editor; assigned Production editor: every row, their own included<br>• Assigned Section Editor and Guest Editor: every row but their own and the rows assigned in a manager-level role; on a Journal Manager's Section Editor row "Edit" is offered and "OK" saves nothing ⚠ [A9](#a9); with their participation limited to recommendations, not the rows of other Section Editors and Guest Editors either<br>• Assistant roles: never <sup>h</sup> |
| **"Notify"** (a row's menu; Rule 8) | • Every role that sees the panel, on every row, their own row included [A5](#a5) <sup>k</sup> |
| **"Login As"** (a row's menu; Rule 9) | • Site Administrator: every row but their own<br>• Journal Manager, Editor and Production editor (the manager-level roles alike): the rows of users [→ wholly within the journals where they hold such a role](U01-login-and-sessions.md#who-may-impersonate), never their own and never a Site Administrator's<br>• Section Editor; Guest Editor; assistant roles: never <sup>l</sup> |
| **"Remove"** (a row's menu; Rule 10) | • The same roles as "Assign", on every row, their own included <sup>m</sup> |
| **Set or clear "Assignment privileges"** (the recommend-only box; Rule 5) | • Site Administrator; Journal Manager; Editor; assigned Production editor: on an editor-level or manager-level assignment<br>• Assigned Section Editor and Guest Editor whose own participation is not limited: on another editor's editor-level assignment<br>• An editor whose participation is limited to recommendations: in "Assign Participant", on a new editor-level assignment, like any editor; never on an existing one, since no editor-level row offers them "Edit" (Rule 5c) <sup>e</sup> <sup>h</sup> |
| **Set or clear "Permissions"** (the metadata box; Rule 6) | • Site Administrator; Journal Manager; Editor; assigned Production editor: on every assignment but a manager-level one<br>• Assigned Section Editor and Guest Editor: on the rows they may "Edit"<br>• Nobody on a manager-level assignment: the box is absent and the permission always holds (Rule 6) <sup>e</sup> <sup>h</sup> |
| **Be assigned** (offered in the "Assign Participant" window; Rule 4a) | • Any user holding, in this journal, a role whose stage set includes the stage, Author included; a person already assigned in that role is not offered again (Rule 4b)<br>• Journal Manager: never on a journal or a press, whose manager role works in no listed stage; a preprint server's manager role works in Production and is offered [OPS1](#ops1)<br>• Reviewer roles: never; reviewers are managed on the Reviewers panel (*[Reviewer assignment](U27-reviewer-assignment-and-management.md)*) <sup>d</sup> |

## Fields & validation

The "Assign Participant" window (Rule 4): <sup>d</sup> <sup>e</sup> <sup>g</sup>

| Field (UI label) | Required? | Rules |
|------------------|-----------|-------|
| Role list (unlabelled, first in the window) | yes, preselected | The roles whose stage set includes this stage, never a reviewer role; the first listed is selected on opening (Rule 4a). |
| "Search User By Name" | no | Free text; "Search" reloads the list with the names matching it (Rule 4b). |
| The person (one radio button per row) | yes | Saving with no row chosen keeps the window open and assigns nobody, with no message to say why ⚠ [A10](#a10). <sup>t1</sup> |
| "Assignment privileges" › "This participant is only allowed to recommend an editorial decision and will require an authorised editor to record editorial decisions." | no | Shown only once a person is chosen in an editor-level or manager-level role; ticked on arrival when the role's own setting is on (Rule 5); hidden when another role is selected. |
| "Permissions" › "Allow this person to make changes to the publication, such as the title, abstract, metadata and other publication details. You may wish to revoke this privilege if the submission has received a final check and is ready for publication." | no | Shown only once a person is chosen in any role but a manager-level one; ticked on arrival when the role's "Permit submission metadata edit." is on (Rule 6); hidden, not cleared, when another role is selected, so a second person chosen in the same window arrives with the box as the first left it ⚠ [A11](#a11). |
| "Choose a predefined message to use, or fill out the form below." | no | A list opening on a blank entry, then the stage's predefined messages the assigner may use (Rule 4e); choosing one fills "Message". |
| "Message" | no | Rich text. Empty, the assignment is made and nothing is sent. Filled with a predefined message chosen, the message is sent (Rule 8b). Filled with the list left blank, "OK" fails: the window stays open with no message, nothing is sent, and the person is assigned all the same [A2](#a2). |

The "Edit Assignment" window (Rule 7) shows "Participant" as a read-out
("**{name}** ({role})") and the two boxes above under the same headings,
each present only when the editor may change it, or the sentence "No changes
can be made to this participant" when neither is. <sup>h</sup>

The "Notify" window (Rule 8): "Start Discussion" with the sentence "Begin a
discussion between yourself and {name}.", the same "Choose a predefined
message…" list, and "Message", required: sending with it empty leaves the
window open as it was and shows "Please ensure that you have filled out the
message field and included someone other than yourself in the discussion."
at the top right. <sup>k</sup>

## Rules & state

<a id="panel"></a>
1. **The panel.** Every stage entry of the editorial view shows, in its
   right-hand column, a panel headed "Participants" with "Assign" beside the
   heading for the roles Actors names; a press's Internal Review entry alone
   has none, its panel sits on the round's entry ("Review Round 1")
   ⚠ [OMP1](#omp1). Each row shows the person's initials
   in a circle, their full name in bold, the role they are assigned in
   under it ("Journal editor", "Section editor", "Copyeditor", "Author"…),
   and, when their participation is limited to recommendations, a third
   line "Only allowed to recommend an editorial decision". Each row ends
   in a "…" menu, announced as "{name} More Actions", holding "Edit",
   "Notify", "Login As" and "Remove" as Actors gives them. The rows are
   grouped by role level, manager-level roles first, then Section and
   Guest Editors, then assistants, then Authors, and within a level by
   role. A stage with nobody assigned shows the heading and "Assign" and no
   rows and no text. The author's view never shows the panel. <sup>a</sup>
   <sup>t2</sup>
<a id="one-assignment"></a>
2. **One assignment, every stage of the role.** An assignment is a person
   in a role on a submission, not on a stage. The panel of a stage lists the
   assignments whose role works in that stage, so a Section Editor assigned
   from the Submission stage is listed on the Review, Copyediting and
   Production entries too (on a press, on the External Review entry and on
   each Internal Review round's entry [OMP1](#omp1)), a Copyeditor assigned
   at Copyediting is listed there alone, and a person assigned in two roles
   has two rows. A preprint server has one stage entry, "Production"
   ([→ no Submission stage](U25-submission-stage.md#ops1)), whose panel
   lists every assignment, since its roles all work in Production (Rule
   4a). "Remove" removes the assignment from every stage at once (Rule
   10).
   <sup>b</sup>
3. **Who is listed.** The submitting Author is listed as "Author" from the
   moment the submission is submitted, and every other Author of the
   journal added through "Assign" beside them. Reviewers are never listed
   here, whatever their review's state; a reviewer who is also assigned in
   another role is listed in that role. A participant whose role in the
   journal has since ended stays listed, with nothing on the row to say so
   ⚠ [A4](#a4). <sup>b</sup> <sup>t3</sup>
<a id="assign"></a>
4. **"Assign".** Pressing "Assign" opens the window "Assign Participant".
   <sup>d</sup>
   - 4a. **The role list.** The window opens on a list of the roles whose
     stage set includes this stage, manager-level roles first, then
     editor-level, assistants, authors (on the Submission stage a journal
     lists "Journal editor", "Section editor", "Guest editor", "Funding
     coordinator", "Author", "Translator"; a press "Press editor", "Series
     editor", "Funding coordinator", "Author", "Volume editor",
     "Translator"; a preprint server "Preprint Server manager",
     "Moderator" and "Author"; each later stage's list is in that stage's
     spec). A journal's or press's manager role is never listed, a
     preprint server's is [OPS1](#ops1). Reviewer roles are never listed.
     The first is selected on opening. <sup>d</sup>
   - 4b. **The person list.** Under the role list sit "Search User By Name",
     "Search", and a list headed "Locate a User" with the columns "Name",
     "Assignments" (the number of active submissions of this journal the
     person is assigned to, in any role, a review they have not declined
     included), "Affiliation" and "Reviewing interests", a radio button at
     the start of each row, twenty rows at a time with a "Load more" link
     under the list ("20 of 23 items") for the next twenty. The list holds the
     users who hold the selected role in this journal today and are not yet
     assigned in it on this submission; a person assigned in another role
     is offered. Changing the role alone does not reload the list:
     "Search" does, for the chosen role and the typed name. A search that
     matches nobody lists "No Items". <sup>d</sup> <sup>t4</sup>
   - 4c. **Choosing a person.** Selecting a row shows, under the list,
     "Assignment privileges" with its box for an editor-level or
     manager-level role and "Permissions" with its box for every role but a
     manager-level one (Fields), each ticked or clear as the role's setting
     says (Rules 5–6) for the first person chosen in the window. Selecting
     another role hides both again until a person is chosen; the
     "Permissions" box then shows as the earlier choice left it, not as the
     new role's setting says [A11](#a11). <sup>e</sup>
   - 4d. **A reviewer with an anonymous review.** Choosing, while the
     submission sits in a review stage, a person who holds an anonymous
     review of it is meant to open a warning that the assignment would show
     them the author's identity; no warning opens, and the assignment goes
     through when saved ⚠ [A12](#a12). <sup>f</sup> <sup>t5</sup>
   - 4e. **The message.** "Choose a predefined message to use, or fill out
     the form below." lists the stage's discussion templates from Settings ›
     Workflow › "Tasks and Discussions" that the assigner may use: on a
     journal "Discussion (Submission)" and "Assign Editor" at Submission,
     "Discussion (Review)" and "Assign Editor" at Review, "Discussion
     (Copyediting)" and "Request Copyedit" at Copyediting, "Discussion
     (Production)", "Assign Editor", "Ready for Production" and "Galleys
     Complete" at Production (a press adds "Index Requested" and "Index
     Completed" there; a preprint server has "Discussion (Production)" and
     "Assign Editor", and choosing "Assign Editor" there fails, leaving
     "Message" as it was ⚠ [OPS2](#ops2)). A press's Internal Review round
     entry has no template of its own, so its list is empty there
     ⚠ [A6](#a6). Choosing one fills "Message" with the template's text:
     "Assign Editor" with the title, its link, the author and the abstract
     filled in and the greeting "Dear NAME," (the box's stand-in for the
     recipient's name; the sent email carries the person's name); a
     "Discussion (…)" template with the one line "Please enter your
     message." <sup>g</sup> <sup>t6</sup>
   - 4f. **Saving.** "OK" adds the row to the panel, on this stage and on
     every other stage the role works in (Rule 2), and shows the message
     "User added as a stage participant." at the top right. With a message
     and a predefined message chosen, the message is sent as Rule 8b
     describes, and "Notification sent to users." stacks above that message.
     "OK" with no person chosen keeps the window open and assigns nobody,
     saying nothing [A10](#a10). "Cancel" closes the window and assigns
     nobody, even after a person was chosen; the window's "Close" arrow with
     a person chosen asks "The data on this form has changed. Do you wish to
     continue without saving?", and continuing assigns nobody; leaving the
     page with a change made asks the browser's leave question and saves
     nothing. <sup>d</sup> <sup>g</sup>
<a id="recommend-only"></a>
5. **"Assignment privileges": limiting an editor to recommendations.** The
   box "This participant is only allowed to recommend an editorial decision
   and will require an authorised editor to record editorial decisions."
   turns a deciding editor into a
   [recommending editor](GLOSSARY.md#roles-and-access) on this submission.
   <sup>i</sup>
   - 5a. **What it changes.** The row gains the line "Only allowed to
     recommend an editorial decision". On the review round's entry the
     editor gets "Recommend Revisions", "Recommend Accept" and "Recommend
     Decline" in place of the decision buttons, and only while a deciding
     editor is also assigned; alone on the submission, they get no button
     at all ([→ recommendations](U26-review-stage-and-rounds.md#recommendations)).
     On Copyediting and Production they get no decision or recommendation
     control (*[Copyediting stage](U32-copyediting-stage.md)*, *[Production
     stage](U33-production-stage.md)*); a preprint server's Production
     entry keeps "Post the preprint" and loses "Decline Submission"
     ([→ Production stage A1](U33-production-stage.md#a1)). The panel's
     "Assign" stays.
   - 5b. **Where it is set.** In "Assign Participant" when the person is
     chosen (Rule 4c) and in "Edit Assignment" afterwards (Rule 7). It
     applies to editor-level and manager-level assignments only; every
     other role's window has no such box. Its arrival state follows the
     role's setting "This role is only allowed to recommend a review
     decision…" (Settings), clear by default.
   - 5c. **Who may set it.** A recommending editor cannot lift or set the
     limitation on an existing assignment: other editors' rows offer them
     no "Edit" at all, and the "Edit Assignment" windows they open on
     assistants' and Authors' rows carry "Permissions" alone (Actors). Their
     own "Assign Participant" window shows the box for an editor-level
     choice like any editor's, and a tick there assigns the person limited
     to recommendations. Nobody edits their own editor-level assignment: a
     Section Editor's own row has no "Edit" ⚠ [A7](#a7). <sup>h</sup>
     <sup>t7</sup>

   Recording a recommendation runs the "Notify Editors" wizard:
   [→ recording a recommendation](U34-editorial-decision-recording.md#recommendation).
   On the Submission stage a recommending editor keeps a reduced set of
   real decisions: *[Submission stage](U25-submission-stage.md)*. <sup>r</sup>
<a id="metadata"></a>
6. **"Permissions": the metadata box.** The box "Allow this person to make
   changes to the publication, such as the title, abstract, metadata and
   other publication details…" is the assignment side of the one gate on
   editing a version's metadata, described at
   [→ the edit gate](U40-publication-metadata.md#edit-gate). Its arrival
   state, for the first person chosen in a window (Rule 4c), follows the
   role's "Permit submission metadata edit." (Settings):
   on for Section Editor, off for Guest Editor and the assistant roles, and
   for Author off on a journal or press and on on a preprint server. A
   manager-level assignment carries the permission always and shows no box.
   The submitting Author's assignment is reset to the role's setting when
   the submission is submitted, so a box changed on a draft's Author does
   not survive the submit. <sup>j</sup> <sup>t8</sup>
<a id="edit"></a>
7. **"Edit".** A row's "Edit" opens the window "Edit Assignment" for that
   assignment: "Participant" reads "**{name}** ({role})", then "Assignment
   privileges" with its box (an editor-level or manager-level assignment,
   for an editor who may set it, Rule 5c) and "Permissions" with its box
   (any assignment but a manager-level one). A window with neither box
   reads "No changes can be made to this participant", still with "OK" and
   "Cancel": what a Journal Manager opening their own Section Editor row
   gets. "OK" saves the boxes and shows "The stage assignment has been
   changed." at the top right; the row's "Only allowed to recommend…" line
   follows the first box at once. A Section Editor who opens a Journal
   Manager's Section Editor row gets both boxes, and "OK" leaves the window
   open with nothing saved and no message [A9](#a9). The person and the
   role cannot be changed here: that is "Remove" and a new "Assign". With a
   box changed, "Cancel" closes the window and saves nothing, asking no
   question; leaving the page asks the browser's leave question and saves
   nothing. Saving the window, the "No changes" window's "OK" included,
   writes a fresh "was assigned to this submission" line to the Activity
   Log and shows the saved message ⚠ [A3](#a3). <sup>h</sup> <sup>t9</sup>
<a id="notify"></a>
8. **"Notify".** A row's "Notify" opens the window "Notify" (Fields):
   "Start Discussion", the predefined-message list and the required
   "Message", with one button, "Notify", and no "Cancel". <sup>k</sup>
   - 8a. **What it sends.** With a predefined message chosen, "Notify"
     closes the window, shows "Notification sent to users." at the top
     right, opens a discussion on this stage's discussions panel titled
     with the predefined message's name ("Assign Editor", "Discussion
     (Review)"…) whose first entry is the message, with the recipient and
     the sender as its participants, and emails the message to the
     recipient with that name as its subject and the sender's name on the
     From line; the recipient's Tasks panel gains "{sender} started a
     discussion: {name}: …". The discussions panel lists that discussion
     as created by the recipient, not the sender ⚠ [A8](#a8).
   - 8b. **The same from "Assign".** The "Assign Participant" window's
     message is sent the same way, on the new assignment, and is optional
     there (Rule 4e). Two of the predefined messages do more when sent from
     either window: "Request Copyedit" raises the Copyeditor's task
     (*[Copyediting stage](U32-copyediting-stage.md)*) and "Ready for
     Production" the Layout Editor's (*[Production
     stage](U33-production-stage.md)*). "Assign Editor" raises no task of
     its own: the assigned editor gets the discussion and its email and
     nothing in their Tasks panel but the discussion row ⚠ [A1](#a1).
   - 8c. **A message with no predefined message.** Typed text sent with the
     list left on its blank entry, from either window, reaches nobody, and
     the window stays open with no message or notice: no discussion, no
     email, nothing in the Activity Log; from "Assign Participant" the
     person is nonetheless assigned, listed once the window is closed
     ⚠ [A2](#a2). <sup>t10</sup>
   - 8d. **One's own row.** "Notify" is offered on the reader's own row, and
     the message goes through, opening a discussion with one participant,
     emailing the sender themselves and adding "{sender} started a
     discussion: {name}: …" to their own Tasks panel ⚠ [A5](#a5).
     <sup>t11</sup>

   The discussions panel and its rows are *Tasks & discussions*'. <sup>r</sup>
<a id="login-as"></a>
9. **"Login As".** For the rows Actors names, "Login As" opens a dialog
   titled "Login As" reading "Log in as this user? All actions you perform
   will be attributed to this user." with "OK" and "Cancel". "OK" continues
   the browser session as that person and lands on this submission's
   workflow: on the editorial dashboard with the submission open for an
   editorial participant, on My Submissions with it open for an Author.
   While the impersonation lasts the panel's list opens with the entry
   "Logout as {name}" above the rows, naming the person being impersonated
   by their full name, which restores the impersonator's own account and
   lands back on the same submission. <sup>l</sup> <sup>t12</sup>

   The user menu's own "Logout as" entry, the top bar's double avatar and
   who may impersonate whom are
   *[Login and sessions](U01-login-and-sessions.md#who-may-impersonate)*'s;
   that the panel still offers "Login As" while an impersonation is active
   is that spec's [A4](U01-login-and-sessions.md#a4). <sup>r</sup>
<a id="remove"></a>
10. **"Remove".** A row's "Remove" opens a dialog titled "Remove Participant"
    reading "You are about to remove this participant from all stages." with
    "OK" and "Cancel". "OK" removes the assignment with no message: the row
    simply leaves this stage's panel and every other stage's (Rule 2), and
    the person, unless they hold a manager-level role, is dropped from
    every discussion of the submission they took part in. A person removed
    from their only assignment no longer reaches the submission: their next
    landing on it is the dashboard with the dialog "Error / The current
    role does not have access to this operation." A Section Editor who
    removes their own row loses it on the spot: the panel empties and that
    "Error" dialog opens over the workflow; "OK" leaves the emptied
    workflow on screen, and the address answers the dialog from then on.
    "Cancel" closes the dialog with the row in place. Removing the last
    editor raises no "needs an editor" task for the managers. <sup>m</sup>
    <sup>t13</sup>

    Who reaches a submission is
    [→ stage access](U24-workflow-screen-and-stage-access.md#stage-access)'s.
    <sup>r</sup>
<a id="automatic"></a>
11. **Assignments the journal makes by itself.** Three assignments happen
    without the panel: <sup>n</sup>
    - 11a. **The submitting Author**, assigned as "Author" when the
      submission is started, with the metadata permission set from the
      Author role's setting at submit (Rule 6).
    - 11b. **The section's and categories' editors.** A section's form
      (Settings › Journal › "Sections" › a section's "Edit", the box group
      "Editorial Assignments": "Select the editorial users who should be
      assigned automatically to all new submissions to this section.", one
      box per user in an editorial or assistant role, "Assign {name} as
      {role}"; a preprint server's lists its managers too) and a category's
      form ("Editorial Assignments" alike, the boxes grouped under role
      headings; on a preprint server the group is empty ⚠ [OPS4](#ops4))
      name the people to assign to every new submission there. At submit
      each is assigned in the ticked role (an editor also getting the email
      of Side effects). This works on the install's first journal only: on
      every journal created after it nobody is assigned.
    - 11c. **The preprint server's Moderators** are assigned the same way,
      through the "Editorial Assignments" of their section's form, and
      listed on the panel; the email of Side effects never reaches them
      [OPS3](#ops3).
    A submission with no editor assigned by 11b or 11c raises the managers'
    "needs an editor" task (Rule 12) and email instead.

    An automatic assignment in a role set to recommend-only is limited to
    recommendations, as the setting says (Settings). <sup>t16</sup>

    The defect on later journals is
    *[Submission wizard](U21-submission-wizard.md#a8)*'s; the task and the
    email are *[Submission wizard](U21-submission-wizard.md)*'s and
    *[Notifications center](U05-notifications-center-and-email-preferences.md)*'s.
    <sup>r</sup>
12. **The managers' "needs an editor" task and the panel.** The task "A new
    article has been submitted to which an editor needs to be assigned." (a
    press: "A new monograph has been submitted to which an editor needs to
    be assigned."; a preprint server: "A new preprint has been submitted to
    which a moderator needs to be assigned.") in every Journal Manager's
    Tasks panel is cleared when a participant is
    assigned in a manager-level or editor-level role through "Assign", in
    every manager's panel at once; assigning an assistant or an Author
    clears nothing. Nothing brings it back. <sup>o</sup> <sup>t14</sup>

## Side effects

- **On "Assign" (any role).** The Activity Log gains "{name} ({username})
  was assigned to this submission as a {role}.", under the assigned
  person's own name, not the assigner's ⚠ [A13](#a13); the managers'
  "needs an editor" task is cleared for a manager-level or editor-level
  role (Rule 12). No email and no task for the assigned person unless a
  message was sent. <sup>p</sup>

  On the Copyediting and Production stages the editors' notice box is
  recomputed: *[Copyediting stage](U32-copyediting-stage.md)*, *[Production
  stage](U33-production-stage.md)*. <sup>r</sup>
- **On a message sent from "Assign" or "Notify".** The recipient's email,
  the discussion and the Tasks row of Rule 8a; the Activity Log gains
  "Notification sent to users." under the sender's name and "An email has
  been sent: {message name}"; "Request Copyedit" and "Ready for Production" add
  their task; "Assign Editor" adds none [A1](#a1) and on a preprint server
  cannot be chosen [OPS2](#ops2). A message with no predefined message
  chosen sends nothing, logs nothing and leaves the window open [A2](#a2).
  <sup>g</sup> <sup>p</sup>
- **On "Edit".** No email, no task; the Activity Log gains a second "was
  assigned to this submission as a {role}." line [A3](#a3). <sup>p</sup>
- **On "Remove".** The Activity Log gains "{name} ({username}) was removed
  from this submission as a {role}.", under the removed person's name
  [A13](#a13); the person leaves the submission's discussions (Rule 10); no
  email, no task. <sup>p</sup>
- **On an automatic editor assignment at submit (Rule 11b).** The editor
  receives the email "Editor Assigned (Auto)", subject "You have been
  assigned as an editor on a submission to {journal}", sent from the
  journal's principal contact; the Activity Log records "An email has been
  sent: {subject}". On a journal its text names a review button the
  Submission stage does not have ⚠ [OJS1](#ojs1). Their Tasks panel gains
  no row. On a preprint server the template "Moderator Assigned (Auto)"
  exists and nothing is sent ⚠ [OPS3](#ops3). <sup>n</sup> <sup>t15</sup>

  The email is not sent to a person who has unsubscribed from the "A new
  article, "{title}," has been submitted." email in their notification
  settings (Settings). <sup>t16</sup>
- **On "Login As".** Everything done while impersonating is recorded as the
  impersonated person: a message sent opens its discussion and its email
  as them, and the Activity Log's "Notification sent to users." names both,
  "{impersonator} (acting as {name})". <sup>l</sup>

  Impersonation itself is
  *[Login and sessions](U01-login-and-sessions.md)*'s. <sup>r</sup>

## Settings that modify behavior

- **"This role is only allowed to recommend a review decision and will
  require an authorised editor to record a final decision."** (Settings ›
  Users & Roles › Roles › a role's "Edit", under "Role Options"; the box is
  on every role's form, greyed out on the assistant, Author, Reviewer,
  Reader and, on a journal, Subscription Manager forms; the manager row
  has no "Edit"; *Roles configuration*). Install default: clear on every
  role. Ticked: the "Assignment privileges" box arrives ticked for that
  role in "Assign Participant" (Rule 4c). Clear: the box arrives clear.
  <sup>q</sup>

  An automatic assignment in a ticked role is limited to recommendations,
  in a clear one it decides (Rule 11b). <sup>t16</sup>
- **"Permit submission metadata edit."** (the same form). Install default:
  ticked and greyed out for Editor and Production editor, ticked for
  Section Editor, clear for Guest Editor and the assistant roles, and for
  Author clear on a journal or press and ticked on a preprint server; the
  Journal Manager row has no form to read. Ticked: the "Permissions" box
  arrives ticked for that role and the submitting Author's assignment
  carries the permission at submit; clear: the box arrives clear and the
  Author's assignment does not (Rule 6). <sup>q</sup>

  The gate the permission opens is
  *[Publication metadata](U40-publication-metadata.md#edit-gate)*'s.
  <sup>r</sup>
- **"Stage Assignment"** (the same form, the stage boxes; the manager row
  has no "Edit"). Which stages a role works in: a role is listed in a
  stage's "Assign Participant" window while its box for that stage is
  ticked, and its participants are listed on that stage's panel (Rule 2);
  unticked, neither. A preprint server's Moderator keeps its one box,
  "Production": unticking it answers "Your changes have been saved." and
  the box is ticked again on reopening. <sup>q</sup>

  The boxes and their defaults are
  [→ stage access](U24-workflow-screen-and-stage-access.md#stage-access)'s.
  <sup>r</sup>
- **"Editorial Assignments"** (Settings › Journal › "Sections" › a section's
  "Edit"; Settings › Journal › "Categories" › a category's form; a section's
  form lists one box per editor or assistant, a preprint server's its
  managers too, and a preprint server's category form lists none
  [OPS4](#ops4); *Sections* and *Categories*). Install default: the seeded journal's sections carry their
  editors and its categories nobody. A ticked person is assigned to every
  new submission of that section or category at submit, on the install's
  first journal (Rule 11b); with nobody ticked, the managers' "needs an
  editor" task is raised instead (Rule 12). <sup>q</sup>
- **The email template "Editor Assigned (Auto)"** ("Moderator Assigned
  (Auto)" on a preprint server; Settings › Workflow › Emails, where "Edit"
  opens "Edit Template"; *Emails management*). Install default: the subject
  Side effects quotes. The predefined messages of Rule 4e are the task and
  discussion templates of Settings › Workflow › "Tasks and Discussions"
  (*Tasks & discussions*): a template's name is the list's entry and the
  email's subject, its text prefills "Message", and a renamed template
  moves to the end of the list. <sup>q</sup>

  An edited subject or body is what the automatic assignment sends.
  <sup>t16</sup>
- **The recipient's notification settings** (Profile › Notifications): the
  row "A new article, "{title}," has been submitted." (a press: "A new
  monograph, "{title}," has been submitted."; a preprint server, as the
  screen punctuates it: "A new preprint , "{title}", has been submitted.")
  with its box "Do not send me an email for these types of notifications.",
  and the "Discussion added." and "Discussion activity." rows with theirs.
  Install default: every email on. <sup>q</sup>

  The screen is
  *[Notifications center](U05-notifications-center-and-email-preferences.md)*'s.
  <sup>r</sup>

  The first row's box stops the automatic assignment's email. The
  discussion rows' boxes do not touch the "Notify" email: it arrives with
  either box ticked, and no other email is sent for the discussion it
  opens. <sup>t16</sup>

## Cross-feature interactions

- **[Workflow screen & stage access](U24-workflow-screen-and-stage-access.md#stage-access)**:
  who opens a submission and reaches a stage's panels, the stage sets and
  their boxes on the Roles form. This spec starts once the panel is on
  screen, and its assignments are what that gate reads. <sup>r</sup>
- **[Submission stage](U25-submission-stage.md)**, **[Review stage &
  rounds](U26-review-stage-and-rounds.md#recommendations)**,
  **[Copyediting stage](U32-copyediting-stage.md)** and **[Production
  stage](U33-production-stage.md)**: each stage's instance of the panel
  (which roles its "Assign" lists, which predefined messages, which notice
  box an assignment recomputes) and what a recommending editor is offered
  there (Rule 5a). <sup>r</sup>
- **[Editorial decision recording](U34-editorial-decision-recording.md#recommendation)**:
  the "Notify Editors" wizard a recommending editor records through; the
  limitation itself is Rule 5. <sup>r</sup>
- **[Publication metadata](U40-publication-metadata.md#edit-gate)**: the
  gate the "Permissions" box feeds (Rule 6). <sup>r</sup>
- **[Login and sessions](U01-login-and-sessions.md#who-may-impersonate)**:
  impersonation itself, who may impersonate whom, the user menu's "Logout
  as" and the second-impersonation defect; this spec owns the panel's
  "Login As" entry and its "Logout as" line (Rule 9). <sup>r</sup>
- **[Submission wizard](U21-submission-wizard.md)**: the submit that makes
  the automatic assignments of Rule 11 and the defect that stops them on
  later journals; this spec owns the assignment and its email. <sup>r</sup>
- **[Notifications center](U05-notifications-center-and-email-preferences.md)**:
  the Tasks panel where the rows of Rules 8 and 12 land, and the "needs an
  editor" task and email themselves. <sup>r</sup>
- **[Reviewer assignment](U27-reviewer-assignment-and-management.md)**: the
  Reviewers panel, where reviewers are managed instead (Rule 3), and the
  anonymous reviews Rule 4d warns about. <sup>r</sup>
- **Tasks & discussions**: the discussions panel the messages of Rule 8
  open on, and the "Tasks and Discussions" templates the predefined
  messages come from. <sup>r</sup>
- **Roles configuration**, **Sections**, **Categories**, **Emails
  management**: the settings forms of the Settings section. <sup>r</sup>
- **Submission activity log & notes**: the log lines Side effects names.
  <sup>r</sup>

## Canonical scenarios

Scenarios 3, 4 and 8 run on a scratch journal with throwaway accounts,
since each reads a mailbox or needs a submission nobody is assigned to;
every other scenario runs on the seeded journal with ready accounts and
scratch submissions, scenarios 5, 6 and 9 among them, since the
assignments at submit happen on the seeded journal alone and their emails
are read there by the submission's title. A preprint server runs scenarios
7, 8 and 9 alone; the accounts, their passwords, the mail catcher's
address and the tooling recipe are in the footnote. <sup>s</sup>

1. **The panel by role** {OJS OMP}

   Given: Journal Manager, not assigned, on a submission at Copyediting
   accepted from its first review round, whose one review is complete,
   with the section's Editor and two Section Editors, a Copyeditor and the
   Author assigned to it.

   - **The Journal Manager's panel**: open the submission's workflow at
     "Copyediting": in the right-hand column the panel headed
     "Participants" with "Assign" beside the heading; the rows, top to
     bottom, the Editor's ("Journal editor"), the two Section Editors'
     ("Section editor"), the Copyeditor's ("Copyeditor") and the Author's
     ("Author"), each with the person's initials in a circle, the full name
     in bold, the role under it and a "…" menu announced as "{name} More
     Actions"; no row for the Reviewer whose review is complete (Rules 1,
     3).
   - **The same assignments on every stage**: select "Submission", "Review"
     (a press: "External Review") and "Production" in the workflow menu in
     turn: the editors' and the Author's rows on each, the Copyeditor's on
     "Copyediting" alone; a press's "Internal Review" entry shows no panel
     [OMP1](#omp1) (Rule 2).
   - **A row's menu**: on the Copyeditor's row press "…": "Edit", "Notify",
     "Login As" and "Remove"; the Editor's row holds the same four (Actors
     rows 3–6).
   - **"Edit" on an assistant's row**: press the Copyeditor's "Edit": the
     window "Edit Assignment" with "Participant" reading "**{name}**
     (Copyeditor)" and "Permissions" with its box, clear, and no
     "Assignment privileges"; tick the box, press "OK": "The stage
     assignment has been changed." at the top right; press "Edit" again:
     the box is ticked; untick it, press "OK", press "Edit" again: the box
     is clear; press "Cancel" (Rules 6, 7).
   - **"Edit" on a manager-level row**: press the Editor's "Edit":
     "Assignment privileges" with its box and no "Permissions"; press
     "Cancel" (Rules 6, 7).
   - **"Assign Participant"**: select "Submission" and press "Assign": the
     window "Assign Participant" opens on Rule 4a's Submission-stage role
     list, no reviewer role among them, the first selected; under it
     "Search User By Name", "Search" and the list "Locate a User" with a
     radio button at the start of each row and the columns "Name",
     "Assignments", "Affiliation" and "Reviewing interests" (Rules 4a, 4b).
   - **The person list**: select "Section editor" and press "Search": the
     list offers the journal's Section Editor who is not assigned to this
     submission and neither of the two who are; type "Nemo" in "Search User
     By Name" and press "Search": "No Items"; press "Cancel" (Rule 4b).
   - **"Login As"**: select "Copyediting"; on the Copyeditor's row press "…"
     › "Login As": the dialog "Login As" reading "Log in as this user? All
     actions you perform will be attributed to this user." with "OK" and
     "Cancel"; press "OK": the editorial dashboard with this submission
     open, as the Copyeditor; the panel's list opens with the entry "Logout
     as {the Copyeditor's full name}" above the rows; press it: the same
     submission, as the Journal Manager again (Rule 9).
   - **The Section Editor's panel**: sign in as one of the Section Editors
     and open the submission at "Copyediting": "Assign" beside the heading;
     their own row's "…" holds "Notify" and "Remove", no "Edit" [A7](#a7)
     and no "Login As"; the other Section Editor's row "Edit", "Notify" and
     "Remove"; the Editor's row "Notify" and "Remove"; the Copyeditor's row
     "Edit", "Notify" and "Remove" (Actors rows 2–6).
   - **The Copyeditor's panel**: sign in as the Copyeditor and open the
     submission at "Copyediting": the panel without "Assign", and every
     row's "…" holds "Notify" alone (Actors rows 2–6).
   - **"Login As" on the Author's row**: sign in as the Journal Manager
     again; on the Author's row press "…" › "Login As" › "OK": My
     Submissions with this submission open, as the Author (Rule 9).
   - **Control**: the Author, opening the submission from My Submissions,
     has no "Participants" panel on any entry of the workflow menu, where
     the Journal Manager's view showed it on every entry (Rule 1; Actors
     row 1).

2. **Limit an editor to recommendations** {OJS OMP}

   Given: Journal Manager, not assigned, on a submission on its first
   review round in the journal's second section, with the deciding Section
   Editor the section's form assigns and two Section Editors of the journal
   not yet assigned to it.

   - **"Assign" with "Assignment privileges" ticked**: open the
     submission's review round (under "Review"; a press: under "External
     Review"); press "Assign", select "Section editor", press "Search" and
     choose the first unassigned Section Editor's row: under the list
     "Assignment privileges" with its box, clear, and "Permissions" with
     its box, ticked (Rules 4c, 5b, 6); tick "Assignment privileges", leave
     "Message" empty and press "OK": "User added as a stage participant."
     at the top right, and the new row "Section editor" carries the line
     "Only allowed to recommend an editorial decision" (Rules 4f, 5a).
   - **The recommending Section Editor's round**: sign in as that Section
     Editor and open the round: "Recommend Revisions", "Recommend Accept"
     and "Recommend Decline" in place of the decision buttons, a deciding
     editor being assigned; "Assign" beside the panel's heading; the
     deciding Section Editor's row's "…" holds "Notify" and "Remove", no
     "Edit"; the Author's row's "Edit" opens "Edit Assignment" with
     "Permissions" alone; press "Cancel" (Rules 5a, 5c).
   - **The recommending editor's "Assign"**: press "Assign", select
     "Section editor", press "Search" and choose the second unassigned
     Section Editor's row: "Assignment privileges" with its box, clear,
     like any editor's window; leave it clear and press "OK": the row
     "Section editor" without the line (Rules 4f, 5c).
   - **The editor assigned with the box clear**: sign in as that second
     Section Editor and open the round: the decision buttons and no
     "Recommend…" button; their row carries no line (Rule 5a).
   - **"Edit Assignment"**: sign in as the Journal Manager; on the
     recommending Section Editor's row press "…" › "Edit": "Edit
     Assignment" with "Participant" reading "**{name}** (Section editor)",
     "Assignment privileges" ticked and "Permissions" ticked; untick
     "Assignment privileges" and press "Cancel": the window closes with no
     question and the row keeps its line; press "Edit" again, untick the
     box and press "OK":
     "The stage assignment has been changed." at the top right and the
     line gone from the row at once; press "Edit" again, tick the box and
     press "OK": the line is back (Rule 7).
   - **The Activity Log**: "{name} ({username}) was assigned to this
     submission as a Section editor." under the recommending Section
     Editor's own name [A13](#a13), once per "OK" pressed on that row: three
     lines [A3](#a3) (Side effects).
   - **Removing one's own row**: sign in as the second Section Editor; on
     their own row press "…" › "Remove" › "OK": the panel empties and the
     dialog "Error / The current role does not have access to this
     operation." opens over the workflow; press "OK": the emptied workflow
     stays on screen (Rule 10).
   - **Control**: the "Cancel" pressed with the box unticked saved nothing:
     the row kept its line and the Activity Log gained no line for it (Rule
     7).

3. **Assign an editor with "Assign Editor"** {OJS OMP}

   Given: Journal Manager, on a scratch journal, with a submission at the
   Submission stage to which nobody but its Author is assigned, and a
   Section Editor and a Funding Coordinator of the journal not assigned to
   it.

   - **The managers' task**: open the header's Tasks panel: "A new article
     has been submitted to which an editor needs to be assigned." (a press:
     "A new monograph has been submitted to which an editor needs to be
     assigned.") (Rule 12).
   - **"OK" with nobody chosen**: open the submission at "Submission" and
     press "Assign"; with "Journal editor" selected and no row chosen press
     "OK": the window stays open and says nothing [A10](#a10); press
     "Cancel": the panel still lists the Author's row alone (Rule 4f).
   - **"Cancel" and the "Close" arrow**: press "Assign", select "Section
     editor", press "Search", choose the Section Editor's row and press
     "Cancel": the window closes and no row is added; press "Assign" again,
     select "Section editor", press "Search", choose the row again and
     press the window's "Close" arrow: "The data on this form has changed.
     Do you wish to continue without saving?"; continue: no row is added
     (Rule 4f).
   - **A Funding Coordinator assigned with no message**: press "Assign",
     select "Funding coordinator", press "Search" and choose the Funding
     Coordinator's row: "Permissions" with its box, clear, and no
     "Assignment privileges" (Rules 4c, 6); leave "Message" empty and press
     "OK": "User added as a stage participant." at the top right and the
     row "Funding coordinator" above the Author's (Rules 1, 4f); the Tasks
     panel still lists the "needs an editor" task (Rule 12).
   - **A Section Editor assigned with "Assign Editor"**: press "Assign",
     select "Section editor", press "Search" and choose the Section
     Editor's row: "Assignment privileges" with its box, clear, and
     "Permissions" with its box, ticked (Rules 4c, 5b, 6); choose "Assign
     Editor" in "Choose a predefined message to use, or fill out the form
     below.": "Message" fills with the submission's title, its link, the
     author and the abstract, opening "Dear NAME," (Rule 4e);
     press "OK": "Notification sent to users." stacked above "User added as
     a stage participant."; the row "Section editor" above the Funding
     Coordinator's (Rules 1, 4f); the stage's discussions panel lists a
     discussion "Assign Editor" with the Section Editor and the Journal
     Manager as its participants, shown as created by the Section Editor
     [A8](#a8); the Tasks panel no longer lists the "needs an editor" task
     (Rules 8a, 8b, 12).
   - **The Section Editor's mailbox**: holds the email "Assign Editor" with
     the Journal Manager's name on the From line, opening "Dear {the
     Section Editor's name}," (Rules 4e, 8a).
   - **The Section Editor's Tasks panel**: sign in as the Section Editor
     and open the header's Tasks panel: "{the Journal Manager} started a
     discussion: Assign Editor: …" and no "You have been assigned as an
     editor to the submission "{title}"." [A1](#a1) (Rule 8b).
   - **The Activity Log**: sign in as the Journal Manager: "{name}
     ({username}) was assigned to this submission as a Funding
     coordinator." and "{name} ({username}) was assigned to this submission
     as a Section editor.", each under the assigned person's own name
     [A13](#a13); "Notification sent to users." under the Journal Manager's
     name; "An email has been sent: Assign Editor" (Side effects).
   - **Control**: the Funding Coordinator, assigned with "Message" empty,
     has no email in their mailbox once the Section Editor's has arrived,
     and no row in their Tasks panel (Side effects).

4. **"Notify" and "Remove"** {OJS OMP}

   Given: Journal Manager, on a scratch journal, assigned as Section Editor
   to a submission at Copyediting beside another Section Editor and its
   Author, that Section Editor's "Discussion added." and "Discussion
   activity." emails switched off in their notification settings, with a
   third Section Editor of the journal not assigned and a fourth whose
   Section Editor role in the journal has ended.

   - **"Notify" with "Message" empty**: open the submission at
     "Copyediting"; on the other Section Editor's row press "…" ›
     "Notify": the window "Notify" with "Start Discussion", "Begin a
     discussion between yourself and {name}.", "Choose a predefined message
     to use, or fill out the form below." and "Message", with the one
     button "Notify" and no "Cancel"; press "Notify" with "Message" empty:
     the window stays open as it was, and "Please ensure that you have
     filled out the message field and included someone other than yourself
     in the discussion." shows at the top right (Rule 8; Fields).
   - **"Notify" with "Discussion (Copyediting)"**: choose "Discussion
     (Copyediting)": "Message" fills with "Please enter your message."
     (Rule 4e); press "Notify": the window closes, "Notification sent to
     users." shows at the top right, and the stage's discussions panel
     lists a discussion "Discussion (Copyediting)" with the Section Editor
     and the Journal Manager as its participants, shown as created by the
     Section Editor [A8](#a8) (Rule 8a).
   - **The Section Editor's mailbox**: holds the email "Discussion
     (Copyediting)" with the Journal Manager's name on the From line,
     although both discussion emails are switched off in their settings,
     and no other email for the discussion (Rule 8a; Settings).
   - **The Section Editor's Tasks panel**: sign in as that Section Editor
     and open the header's Tasks panel: "{the Journal Manager} started a
     discussion: Discussion (Copyediting): …" (Rule 8a).
   - **The manager's own row**: sign in as the Journal Manager; on their
     own "Section editor" row press "…": "Edit", "Notify" and "Remove", no
     "Login As" (Actors rows 3–6); press "Edit": "No changes can be made to
     this participant" with "OK" and "Cancel"; press "OK": "The stage
     assignment has been changed." at the top right (Rule 7).
   - **Who the person list offers**: press "Assign", select "Section
     editor" and press "Search": the list offers the third Section Editor
     and not the assigned one; type the name of a Section Editor who holds
     the role in another journal only in "Search User By Name" and press
     "Search": "No Items"; type the name of the fourth Section Editor,
     whose role here has ended, and press "Search": "No Items"; press
     "Cancel" (Rule 4b).
   - **"Remove"**: on the other Section Editor's row press "…" › "Remove":
     the dialog "Remove Participant" reading "You are about to remove this
     participant from all stages." with "OK" and "Cancel"; press "Cancel":
     the row stays; press "Remove" again and "OK": no message, and the row
     leaves the panel; "Submission", "Review" (a press: "External Review")
     and "Production" list no row for them either (Rules 2, 10); the
     discussion "Discussion (Copyediting)" lists the Journal Manager as its
     only participant (Rule 10).
   - **The Activity Log**: "{name} ({username}) was removed from this
     submission as a Section editor." under the removed person's own name
     [A13](#a13) (Side effects).
   - **The removed Section Editor's landing**: sign in as them and open the
     submission's workflow address: the dashboard with the dialog "Error /
     The current role does not have access to this operation." (Rule 10).
   - **Control**: the third Section Editor, who holds the role here and is
     not assigned, was offered by the same "Section editor" search that
     offered neither the assigned, the elsewhere-only nor the ended one
     (Rule 4b).

5. **The assignments the journal makes at submit** {OJS OMP}

   Given: Author, on the seeded journal, whose section's form ticks an
   Editor and two Section Editors under "Editorial Assignments" and not
   the journal's third Section Editor, with a Journal Manager not assigned.

   - **The submission**: submit a submission to that section through the
     wizard, titled "Participants at submit" (Rule 11b).
   - **The panel**: sign in as the Journal Manager and open it at
     "Submission": the Editor's row ("Journal editor") and the two Section
     Editors' rows ("Section editor"), none with a third line, beside the
     Author's row ("Author"); the header's Tasks panel lists no "needs an
     editor" task for it (Rules 11a, 11b, 11).
   - **The editors' mailboxes**: each of the three holds the email "You
     have been assigned as an editor on a submission to {journal}" from the
     journal's principal contact; on a journal its text tells the editor to
     select "Send to Review" [OJS1](#ojs1) (Side effects).
   - **The Activity Log**: "An email has been sent: You have been assigned
     as an editor on a submission to {journal}" (Side effects).
   - **A Section Editor's Tasks panel**: sign in as one of the ticked
     Section Editors and open the header's Tasks panel: no row for the
     submission (Side effects).
   - **The Author's row**: sign in as the Journal Manager; on the Author's
     row press "…" › "Edit": "Participant" reads "**{name}** (Author)",
     "Permissions" with its box, clear, and no "Assignment privileges";
     press "Cancel" (Rules 6, 7, 11a).
   - **Control**: the third Section Editor, not ticked on the section's
     form, has no row on the panel and no email for the title once the
     ticked editors' have arrived (Rule 11b).

6. **The assignments at submit with the settings changed** {OJS OMP}

   Given: Author, on the seeded journal of scenario 5 with three settings
   changed for this scenario and put back after it: the Section Editor
   role's "This role is only allowed to recommend a review decision and
   will require an authorised editor to record a final decision." ticked,
   the "Editor Assigned (Auto)" template's subject beginning "Edited:",
   and one of the two ticked Section Editors' "Do not send me an email for
   these types of notifications." ticked under "A new article, "{title},"
   has been submitted." (a press: "A new monograph, "{title}," has been
   submitted.").

   - **The submission**: submit a submission to the same section through
     the wizard, titled "Participants at submit, edited" (Rule 11b).
   - **The panel**: sign in as the Journal Manager and open it at
     "Submission": the two Section Editors' rows carry "Only allowed to
     recommend an editorial decision"; the Editor's row, in a role whose
     box is clear, does not (Rule 11b; Settings).
   - **"Assign Participant" for the role**: press "Assign", select "Section
     editor", press "Search" and choose the third Section Editor's row:
     "Assignment privileges" arrives ticked; press "Cancel" (Rule 4c;
     Settings).
   - **The mailboxes**: the Editor's and the other Section Editor's hold
     the email under the subject "Edited: You have been assigned as an
     editor on a submission to {journal}"; the unsubscribed Section
     Editor's holds nothing for the title (Side effects; Settings).
   - **The Activity Log**: "An email has been sent: Edited: You have been
     assigned as an editor on a submission to {journal}" (Side effects;
     Settings).
   - **Control**: the unsubscribed Section Editor's row is on the panel all
     the same, and the absence of their email is read once the other two
     have arrived (Rule 11b; Settings).

App-specific:

7. **{OPS} The preprint server's panel**

   Given: Preprint Server Manager, not assigned, on the seeded server, with
   a submitted preprint whose section's two Moderators are assigned beside
   its Author, and a Site Administrator holding the manager role on the
   server.

   - **The one entry's panel**: open the preprint's workflow: the workflow
     menu offers "Production" alone; its panel "Participants" with "Assign"
     beside the heading, the two Moderators' rows ("Moderator") and the
     Author's ("Author") (Rules 1, 2).
   - **"Assign Participant"**: press "Assign": the role list "Preprint
     Server manager", "Moderator", "Author" [OPS1](#ops1), the first
     selected, and "Choose a predefined message to use, or fill out the
     form below." listing "Discussion (Production)" and "Assign Editor"
     (Rules 4a, 4e).
   - **A manager assigned**: with "Preprint Server manager" selected press
     "Search" and choose the Site Administrator's row: "Assignment
     privileges" with its box and no "Permissions" (Rules 4c, 6); choose
     "Assign Editor" in the message list: "Message" stays as it was
     [OPS2](#ops2); press "OK": "User added as a stage participant." at the
     top right, and the row "Preprint Server manager" first on the panel
     (Rules 1, 4f).
   - **The rows' menus**: the Site Administrator's row's "…" holds "Edit",
     "Notify" and "Remove", no "Login As"; the first Moderator's row all
     four (Actors rows 3–6).
   - **"Edit" on a Moderator's row**: press the first Moderator's "Edit":
     "Edit Assignment" with "Assignment privileges" with its box, clear,
     and "Permissions" with its box, ticked; tick "Assignment privileges"
     and press "OK": "The stage assignment has been changed." and the
     row's line "Only allowed to recommend an editorial decision" (Rules
     5a, 7).
   - **"Edit" on the Author's row**: press the Author's "Edit":
     "Permissions" with its box, ticked, and no "Assignment privileges";
     press "Cancel" (Rules 6, 7).
   - **The Moderator's panel**: sign in as the second Moderator and open
     the preprint at "Production": "Assign" beside the heading; their own
     row's "…" holds "Notify" and "Remove", no "Edit" [A7](#a7) and no
     "Login As"; the Site Administrator's row "Notify" and "Remove"; the
     first Moderator's row "Edit", "Notify" and "Remove"; the Author's row
     "Edit", "Notify" and "Remove" (Actors rows 2–6).
   - **"Login As"**: sign in as the Preprint Server Manager; on the second
     Moderator's row press "…" › "Login As": the dialog "Login As" reading
     "Log in as this user? All actions you perform will be attributed to
     this user." with "OK" and "Cancel"; press "OK": the editorial
     dashboard with this preprint open, as the Moderator; the panel's list
     opens with "Logout as {the Moderator's full name}" above the rows;
     press it: the same preprint, as the manager again (Rule 9).
   - **Control**: the Author, opening the preprint from My Submissions, has
     no "Participants" panel, where the manager's view showed it on
     "Production" (Rule 1; Actors row 1).

8. **{OPS} A Moderator assigned and notified**

   Given: Preprint Server Manager, on a scratch preprint server, with a
   submitted preprint to which nobody but its Author is assigned, a
   Moderator of the server not assigned to it, and a second Author of the
   server.

   - **The managers' task**: open the header's Tasks panel: "A new preprint
     has been submitted to which a moderator needs to be assigned." (Rule
     12).
   - **"OK" with nobody chosen**: open the preprint at "Production" and
     press "Assign"; with "Preprint Server manager" selected and no row
     chosen press "OK": the window stays open and says nothing
     [A10](#a10); press "Cancel": the panel still lists the Author's row
     alone (Rule 4f).
   - **An Author assigned keeps the task**: press "Assign", select
     "Author", press "Search" and choose the second Author's row:
     "Permissions" with its box, ticked, and no "Assignment privileges"
     (Rules 4c, 6); leave "Message" empty and press "OK": "User added as a
     stage participant." at the top right and a second "Author" row (Rule
     4f); the Tasks panel still lists the task (Rule 12).
   - **A Moderator assigned with "Discussion (Production)"**: press
     "Assign", select "Moderator", press "Search" and choose the
     Moderator's row: "Assignment privileges" with its box, clear, and
     "Permissions" with its box, ticked (Rules 4c, 5b, 6); choose
     "Discussion (Production)" in the message list: "Message" fills with
     "Please enter your message." (Rule 4e); press "OK": "Notification sent
     to users." stacked above "User added as a stage participant."; the
     row "Moderator" above the Authors' rows (Rules 1, 4f); the stage's
     discussions panel lists a discussion "Discussion (Production)" with
     the Moderator and the manager as its participants, shown as created
     by the Moderator [A8](#a8); the Tasks panel no longer lists the task
     (Rules 8a, 8b, 12).
   - **The Moderator's mailbox**: holds the email "Discussion (Production)"
     with the manager's name on the From line (Rule 8a).
   - **The Moderator's Tasks panel**: sign in as the Moderator and open the
     header's Tasks panel: "{the manager} started a discussion: Discussion
     (Production): …" (Rule 8a).
   - **"Notify" with "Message" empty**: sign in as the manager; on the
     Moderator's row press "…" › "Notify": the window "Notify" with "Start
     Discussion", "Begin a discussion between yourself and {name}.", the
     predefined-message list and "Message", with the one button "Notify"
     and no "Cancel"; press "Notify" with "Message" empty: the window stays
     open as it was, and "Please ensure that you have filled out the
     message field and included someone other than yourself in the
     discussion." shows at the top right (Rule 8; Fields).
   - **"Remove"**: on the Moderator's row press "…" › "Remove": the dialog
     "Remove Participant" reading "You are about to remove this participant
     from all stages." with "OK" and "Cancel"; press "OK": no message, and
     the row leaves the panel; the
     discussion "Discussion (Production)" lists the manager as its only
     participant; the Activity Log reads "{name} ({username}) was removed
     from this submission as a Moderator." under the removed person's own
     name [A13](#a13) (Rule 10; Side effects).
   - **The removed Moderator's landing**: sign in as them and open the
     preprint's workflow address: the dashboard with the dialog "Error /
     The current role does not have access to this operation." (Rule 10).
   - **Control**: the second Author, assigned with "Message" empty, has no
     email in their mailbox once the Moderator's has arrived, and no row
     in their Tasks panel (Side effects).

9. **{OPS} The Moderators assigned at submit**

   Given: Author, on the seeded preprint server, whose section's form
   ticks two Moderators under "Editorial Assignments" and not the server's
   third Moderator, with the Moderator role's "This role is only allowed
   to recommend a review decision and will require an authorised editor to
   record a final decision." ticked for this scenario and put back after
   it, a Preprint Server Manager not assigned, and a Site Administrator
   holding the manager role on the server.

   - **The submission**: submit a preprint through the wizard, titled
     "Moderators at submit" (Rule 11c).
   - **The panel**: sign in as the Preprint Server Manager and open it at
     "Production": the two Moderators' rows ("Moderator"), each carrying
     "Only allowed to recommend an editorial decision", beside the Author's
     row ("Author"); the header's Tasks panel lists no "needs a moderator"
     task for it (Rules 11a, 11b, 11c; Settings); what the Moderators'
     mailboxes hold is [OPS3](#ops3)'s.
   - **"Assign Participant" for the role**: press "Assign", select
     "Moderator", press "Search" and choose the third Moderator's row:
     "Assignment privileges" arrives ticked; press "Cancel" (Rule 4c;
     Settings).
   - **Control**: in the same window select "Preprint Server manager",
     press "Search" and choose the Site Administrator's row: "Assignment
     privileges" arrives clear, that role's box untouched; press "Cancel"
     (Settings).

## Coverage

Left out of the scenarios above, by reason:

- **Budget** — states:
  - "Permit submission metadata edit." ticked on an assistant role, so the "Permissions" box arrives ticked for it (Settings bullet 2): a manager changes a role's options rarely, not in an ordinary week
- **Nothing new to test**:
  - a Site Administrator holding a journal role: the Journal Manager's offer scenario 1 reads (Actors rows 1–6)
  - an assigned Editor or Production editor: the Journal Manager's offer, "Login As" included, that scenario 1 reads (Actors rows 2–6)
- **Register carries it**:
  - A12 (a reviewer holding an anonymous review chosen while the submission is in review, with no warning; Rule 4d)
  - A2 (typed text sent with no predefined message chosen, from either window; Rule 8c)
  - A1 ("Assign Editor" raising no editor-assignment task; Rule 8b; scenario 3 marks it)
  - A5 ("Notify" on one's own row; Rule 8d)
  - A11 (a second person chosen in one "Assign Participant" window arriving with the earlier "Permissions" state; Rule 4c)
  - A9 (a Section Editor's "Edit" on a Journal Manager's Section Editor row; Rule 7)
  - A4 (a participant whose journal role has ended, still listed; Rule 3)
  - A13 (the Activity Log's "User" column on the assignment and removal lines; Side effects; scenarios 2, 3, 4 and 8 mark it)
  - A6 (a press's Internal Review round entry with no predefined message; Rule 4e)
  - OMP1 (a press's Internal Review stage entry without the panel; Rule 1; scenario 1 marks it)
  - OPS2 ("Assign Editor" chosen on a preprint server; Rule 4e; scenario 7 marks it)
  - OPS3 (the Moderators' missing email at submit; Side effects; scenario 9 marks it)
  - OPS4 (a preprint server's category form with no "Editorial Assignments" box; Settings bullet 4)
  - OJS1 (the assignment email's review-button wording on a journal; Side effects; scenario 5 marks it)
- **No seed**:
  - the empty panel, heading and "Assign" with no rows (Rule 1)
- **Owned by another feature**:
  - the Roles form's greyed-out boxes (Settings bullets 1–2; *Roles configuration*)
  - "Stage Assignment" unticked for a role, the role absent from the window and its participants from the panel (Settings bullet 3; *Workflow screen & stage access*)
  - "Editorial Assignments" with nobody ticked, the "needs an editor" task and email (Settings bullet 4; Rule 11; *Submission wizard*, *Notifications center*)

## Findings register

Verdicts are the author's judgment (claude, 2026-09-20), unreviewed unless an
entry notes otherwise; the team settles them on spec review.

| ID | Finding (one line, symptom) | Bug? | Impact | Review |
|----|-----------------------------|------|--------|--------|
| [A1](#a1) | The "Assign Editor" message raises no editor-assignment task | 🐞 | minor | — |
| [A2](#a2) | A message typed with no predefined message chosen fails at a stuck window, and "Assign" assigns the person anyway | 🐞 | user-visible | — |
| [A3](#a3) | Saving "Edit Assignment" logs a fresh assignment, the "No changes" window's "OK" included | 🐞 | minor | — |
| [A8](#a8) | The discussion a message opens is listed as created by its recipient | 🐞 | minor | — |
| [A9](#a9) | A Section Editor is offered "Edit" on a Journal Manager's Section Editor row, and "OK" saves nothing silently | 🐞 | minor | — |
| [A10](#a10) | "OK" in "Assign Participant" with nobody chosen says nothing | 🐞 | minor | — |
| [A11](#a11) | The "Permissions" box keeps its last state across choices in one window | 🐞 | minor | — |
| [A12](#a12) | The anonymous-review warning never shows; the reviewer is assigned unwarned | 🐞 | user-visible | — |
| [OPS2](#ops2) | "Assign Editor" cannot be chosen on a preprint server; the person is assigned with nothing sent | 🐞 | user-visible | — |
| [OPS3](#ops3) | A preprint server's Moderators assigned at submit are never emailed | 🐞 | user-visible | — |
| [OJS1](#ojs1) | A journal's assignment email tells the editor to select "Send to Review", a button the stage does not have | 🐞 | minor | — |
| [A4](#a4) | A participant whose journal role has ended is listed with no mark | ❓ | minor | — |
| [A5](#a5) | "Notify" is offered on one's own row and sends to oneself | ❓ | minor | — |
| [A6](#a6) | A press's Internal Review has no predefined message to choose | ❓ | minor | — |
| [A7](#a7) | A Section Editor cannot open "Edit" on their own row | ❓ | minor | — |
| [A13](#a13) | The Activity Log files assignments and removals under the participant's name | ❓ | minor | — |
| [OMP1](#omp1) | A press's Internal Review entry has no Participants panel; the round's entry has it | ❓ | minor | — |
| [OPS4](#ops4) | A preprint server's category form offers nobody under "Editorial Assignments" | ❓ | minor | — |
| [OPS1](#ops1) | A preprint server's "Assign Participant" lists its manager role | ✅ | — | — |

### All apps

<a id="a1"></a>
**A1 — "Assign Editor" raises no editor-assignment task** · 🐞 · minor.
An editor assigned through "Assign" with the predefined message "Assign
Editor" expects, beside the discussion and its email, the task "You have
been assigned as an editor to the submission "{title}"." in their Tasks
panel, as a Copyeditor gets "You have been asked to review copyedits…" from
"Request Copyedit". They get the discussion row alone: the task exists in
the application's vocabulary but no message ever raises it, because the
"Assign Editor" templates the journal ships are named by stage and the
sending code looks for a name without one. On a preprint server the
message cannot be chosen at all ([OPS2](#ops2)).
Basis: probe (2026-09-20, OJS and OMP). <sup>[f-a1](#fn-a1)</sup>

<a id="a2"></a>
**A2 — Typed text with no predefined message fails, and "Assign" assigns anyway** · 🐞 · user-visible.
An editor who types a message in "Assign Participant" or "Notify" and leaves
"Choose a predefined message…" on its blank first entry expects the message
sent. Instead the request fails on the server: the window stays open with
no message or notice, no discussion opens, no email leaves, and the
recipient's Tasks panel and the Activity Log stay as they were. From
"Assign Participant" the person is assigned all the same, so the editor
sits at a stuck window over a panel that already lists the new participant.
Only a message sent with a predefined message chosen reaches anyone; the
typed text may then differ from the template's.
Basis: probe (2026-09-20). <sup>[f-a2](#fn-a2)</sup>

<a id="a3"></a>
**A3 — "Edit Assignment" logs a fresh assignment** · 🐞 · minor.
Saving "Edit Assignment", which changes the two boxes and nothing else,
writes "{name} ({username}) was assigned to this submission as a {role}."
to the Activity Log again, so a submission whose editor was edited twice
reads as assigned three times. No line says the privileges changed. The
window that reads "No changes can be made to this participant" still
offers "OK", which answers "The stage assignment has been changed." and
writes the line too.
Basis: probe (2026-09-20). <sup>[f-a3](#fn-a3)</sup>

<a id="a4"></a>
**A4 — A participant whose role ended stays listed unmarked** · ❓ · minor.
A person whose Section Editor or Copyeditor role in the journal has been
ended on the Users & Roles screen stays on every panel they were assigned
to, indistinguishable from an active participant; the earlier version of
the panel printed "(Role ended)" after their name. The person no longer
reaches the submission; the panel does not say so.
Question: should the row carry "(Role ended)" again, or leave the panel?
Lean: carry the mark; the assignment is history the editors may want to
see, and the old wording exists.
Basis: probe (2026-09-20). <sup>[f-a4](#fn-a4)</sup>

<a id="a5"></a>
**A5 — "Notify" on one's own row** · ❓ · minor.
Every row's menu carries "Notify", the reader's own row included. Sent
there, the message opens a discussion whose only participant is the sender,
emails the sender, and adds "{sender} started a discussion: {name}: …" to
the sender's own Tasks panel, while the window's own refusal text speaks of
"someone other than yourself".
Question: should the entry be withheld on one's own row? Lean: yes; a
discussion with oneself is nothing the panel means to offer.
Basis: probe (2026-09-20). <sup>[f-a5](#fn-a5)</sup>

<a id="a6"></a>
**A6 — No predefined message on a press's Internal Review** · ❓ · minor.
A press ships "Discussion (Review)" and "Assign Editor" for its External
Review stage and nothing for Internal Review, so the "Assign Participant"
and "Notify" windows opened from an Internal Review round's entry list no
predefined message at all, and a typed message from there fails
([A2](#a2)) until a manager adds a template for that stage under Settings ›
Workflow › "Tasks and Discussions".
Question: is Internal Review meant to ship its own pair? Lean: yes; every
other stage has one and the assignment message is the ordinary way to tell
an editor they are on.
Basis: probe (2026-09-20). <sup>[f-a6](#fn-a6)</sup>

<a id="a7"></a>
**A7 — No "Edit" on one's own editor row** · ❓ · minor.
A Section Editor sees "Edit" on the assistants' and Authors' rows and none
on their own, so they cannot change their own metadata permission or read
their own boxes; a Journal Manager who opens their own Section Editor row
reads "No changes can be made to this participant". An editor cannot lift
their own recommend-only limitation, which is the point; the metadata box
goes with it.
Question: intended? Lean: intended for "Assignment privileges", a side
effect for "Permissions"; a plain ruling either way.
Basis: probe (2026-09-20). <sup>[f-a7](#fn-a7)</sup>

<a id="a8"></a>
**A8 — The discussion a message opens is created by its recipient** · 🐞 · minor.
A message sent from "Assign Participant" or "Notify" opens a discussion
the panel lists as "Created by: {the recipient's username}", with no
"Discussion created by … on …" line, although the sender wrote it; the
recipient's own Tasks row says "{sender} started a discussion". The
Copyediting stage recorded the same on its "Request Copyedit" message
(*[Copyediting stage](U32-copyediting-stage.md#a9)*); the form that sends
every such message is this feature's.
Basis: probe (2026-09-18, the copyediting message; 2026-09-19 and
2026-09-20, the "Notify" window on all three apps). <sup>[f-a8](#fn-a8)</sup>

<a id="a9"></a>
**A9 — "Edit" on a Journal Manager's Section Editor row is offered to a Section Editor and saves nothing** · 🐞 · minor.
A Section Editor's row menu offers "Edit" on a Journal Manager who is
assigned as a Section Editor, and the window opens with both boxes; "OK"
leaves the window open with nothing saved and no message. Rows assigned in
a manager-level role withhold the entry; this row should too, or the save
should go through.
Basis: probe (2026-09-20). <sup>[f-a9](#fn-a9)</sup>

<a id="a10"></a>
**A10 — "OK" with nobody chosen says nothing** · 🐞 · minor.
An editor who presses "OK" in "Assign Participant" without choosing a
person, with or without a message typed, gets the window drawn again with
no message: nothing says a person is required, and nobody is assigned. The
"Notify" window's empty "Message" gets a sentence; this window's missing
person gets none.
Basis: probe (2026-09-20). <sup>[f-a10](#fn-a10)</sup>

<a id="a11"></a>
**A11 — The "Permissions" box keeps its last state across choices in one window** · 🐞 · minor.
In one "Assign Participant" window, after a person is chosen in a role
whose "Permit submission metadata edit." is on (a Section Editor), a person
chosen in a role whose setting is off (a Funding Coordinator, an Author)
arrives with "Permissions" ticked, so they get the permission unless the
editor clears the box by hand; chosen in the other order, the box arrives
clear. The box is hidden, not reset, when the role changes.
Basis: probe (2026-09-20). <sup>[f-a11](#fn-a11)</sup>

<a id="a12"></a>
**A12 — The anonymous-review warning never shows** · 🐞 · user-visible.
An editor who, while a submission is in review, chooses as a participant a
reviewer holding an anonymous review of it expects the dialog "The
participant you selected has been assigned to conduct an anonymous review.
If you assign them as a participant, they will have access to the author's
identity. You are encouraged not to assign this participant unless you can
independently ensure the integrity of the peer review process." No dialog
opens, on the stage entry and on the round's entry alike, and "OK" assigns
them: the reviewer reaches the author's identity with no word of warning.
Basis: probe (2026-09-20, OJS and OMP). <sup>[f-a12](#fn-a12)</sup>

<a id="a13"></a>
**A13 — The Activity Log files assignments and removals under the participant's name** · ❓ · minor.
The lines "{name} ({username}) was assigned to this submission as a
{role}." and "… was removed from this submission as a {role}." carry the
participant's own name in the log's "User" column, as if they had acted
themselves, so who assigned or removed them is not recorded; "Notification
sent to users." names the editor who sent it.
Question: should the assignment and removal lines name the acting editor?
Lean: yes; the column reads as the actor on every other line.
Basis: probe (2026-09-20). <sup>[f-a13](#fn-a13)</sup>

### OJS

<a id="ojs1"></a>
**OJS1 — The assignment email names a button the stage does not have** · 🐞 · minor.
A journal's "Editor Assigned (Auto)" email tells the editor to "forward
the submission to the review stage by selecting "Send to Review" and then
assign reviewers by clicking "Add Reviewer"", while the Submission stage's
button reads "Send for Review". A press's email names its own button,
"Send to Internal Review"; a preprint server sends no such email
([OPS3](#ops3)). The editor finds the button all the same; the text is
wrong.
Basis: probe (2026-09-20). <sup>[f-ojs1](#fn-ojs1)</sup>

### OMP

<a id="omp1"></a>
**OMP1 — A press's Internal Review entry has no Participants panel** · ❓ · minor.
The "Internal Review" entry of a press shows the round's files, Reviewers
and discussions but no "Participants" panel and no "Assign", whether the
stage was skipped or is live; the panel appears on the round's own entry
("Review Round 1"). The "External Review" entry shows the panel like every
other stage entry.
Question: is the missing panel intended? Lean: no; the entry is where a
press's editor looks for it, and its External Review twin has it.
Basis: probe (2026-09-20). <sup>[f-omp1](#fn-omp1)</sup>

### OPS

<a id="ops1"></a>
**OPS1 — The preprint server's "Assign Participant" lists its manager role** · ✅ · —.
On a journal or press the manager role works in no stage of the workflow
by itself, so "Assign Participant" never lists it; a preprint server's
manager role works in Production, so its window lists "Preprint Server
manager" above "Moderator" and "Author", and a manager assigned through it
is listed on the panel like any participant. Intended: the preprint server
declares its manager a Production role.
Basis: probe (2026-09-04; 2026-09-19; 2026-09-20). <sup>[f-ops1](#fn-ops1)</sup>

<a id="ops2"></a>
**OPS2 — "Assign Editor" cannot be chosen on a preprint server** · 🐞 · user-visible.
A Preprint Server Manager or Moderator who chooses "Assign Editor" in
"Assign Participant" or "Notify" expects "Message" to fill with its text.
The choice fails on the server: "Message" stays as it was (empty, or the
previous template's text), and "OK" then assigns the person with "User
added as a stage participant." alone, no "Notification sent to users.", no
email, no discussion and no Tasks row. "Discussion (Production)" loads.
Basis: probe (2026-09-20). <sup>[f-ops2](#fn-ops2)</sup>

<a id="ops3"></a>
**OPS3 — Moderators assigned at submit are never emailed** · 🐞 · user-visible.
On a preprint server the section's Moderators are assigned at submit and
listed on the panel, but the "Moderator Assigned (Auto)" email is never
sent and the Activity Log records no email to them; the managers get no
"needs a moderator" email either, since a Moderator was assigned. Nobody is
told a preprint arrived.
Basis: probe (2026-09-20). <sup>[f-ops3](#fn-ops3)</sup>

<a id="ops4"></a>
**OPS4 — A preprint server's category form offers nobody to assign** · ❓ · minor.
A category's form on a preprint server shows the heading "Editorial
Assignments" and its sentence "Select the editorial users who should be
assigned automatically to all new submissions to this category." with no
box under them, so a category can name no Moderator; the section's form is
the only automatic-assignment route there. A journal's and a press's
category form list every editor and assistant.
Question: defect or a preprint server's design? Lean: defect; the heading
and the sentence promise a list.
Basis: probe (2026-09-20). <sup>[f-ops4](#fn-ops4)</sup>

---

<a id="footnotes"></a>
## Footnotes — mechanism & evidence

Code read 2026-09-20 at the checkouts' tips (`checkouts/ojs`, `checkouts/omp`,
`checkouts/ops`, each with its `lib/pkp` and `lib/ui-library`). Every claim
was driven on 2026-09-20 on OJS, OMP and OPS (the panel and its menus by
role and stage, the three windows, "Login As", "Remove", the settings forms
and the automatic assignments on the seeded journal), and the `t` blocks
record what those drives settled; where an earlier feature's probe saw a
fact on this panel in passing, the block cites its date.

<a id="fn-a"></a>
**a** — The panel is `lib/ui-library/src/managers/ParticipantManager/ParticipantManager.vue`, heading `editor.submission.stageParticipants` "Participants", mounted by `getSecondaryItems` of every stage entry in `pages/workflow/composables/useWorkflowConfig/workflowConfigEditorialOJS.js` (`WORKFLOW_STAGE_ID_SUBMISSION`, `_EXTERNAL_REVIEW`, `_EDITING`, `_PRODUCTION`) and by `workflowConfigEditorialOMP.js` for `_INTERNAL_REVIEW`; `useWorkflowConfigOPS.js` deep-merges `workflowConfigEditorialOPS.js` over the OJS config and the OPS file defines no `getSecondaryItems`, so the preprint server's Production entry inherits the OJS mount. None of `workflowConfigAuthorOJS.js`, `…OMP.js`, `…OPS.js` names `ParticipantManager`. Rows: `ParticipantManagerItemInfoName.vue` (`fullName`, bold), `ParticipantManagerItemInfoRole.vue` (`roleName`), `ParticipantManagerItemInfoRecommendOnly.vue` (`participantManager.onlyAllowedToRecommend` "Only allowed to recommend an editorial decision", pushed only when `participant.recommendOnly`), `UserAvatar` with `displayInitials`; the menu is `DropdownActions` labelled `${fullName} ${common.moreActions}`. `participantManagerStore.js::participantsList` flattens one entry per `stageAssignment` and sorts by `roleId` then `userGroupId` (`ROLE_ID_MANAGER` 16 < `ROLE_ID_SUB_EDITOR` 17 < `ROLE_ID_ASSISTANT` 4097 < `ROLE_ID_AUTHOR` 65536). The `<ul>` renders only when the list has entries, so an empty stage shows the heading and "Assign" alone; the legacy `editor.submission.noneAssigned` "None Assigned" belongs to the grid nobody mounts (note b). The panel's presence per stage and view was seen on 2026-09-18/19 by the Copyediting and Production stages' probes (right-hand column for every editorial account, absent from the author view) and live-probed 2026-09-20 on all three apps: every stage entry of a journal and a preprint server, and a press's Submission, External Review, Copyediting and Production entries; the press's Internal Review stage entry (`workflow_2`) mounts no panel because `workflowConfigEditorialOMP.js::getSecondaryItems()` returns nothing there without a selected review round, and the round entry (`workflow_2_<roundId>`) mounts it (OMP1). Rows, order, the third line and the empty panel: block t2.

<a id="fn-b"></a>
**b** — Assignments are `stage_assignments` rows (`PKP\stageAssignment\StageAssignment`: `submissionId`, `userGroupId`, `userId`, `recommendOnly`, `canChangeMetadata`, `dateAssigned`; no stage column). A stage's list is `GET submissions/{id}/participants/{stageId}` (`PKPSubmissionController::getParticipants()`), which runs `Repo::user()->getCollector()->assignedTo($submissionId, $stageId)`: `user/Collector.php::buildSubmissionAssignmentsFilter()` joins `stage_assignments` to `user_group_stage` on the user group and filters `ugs.stage_id`, so an assignment is listed on every stage its user group holds. The per-user `stageAssignments` come from `user/Repository.php::stageAssignmentsForUsers()`, which drops `ROLE_ID_REVIEWER` groups (reviewers are never rows) and carries `recommendOnly`, `canChangeMetadata` and the group's `permitMetadataEdit` / `recommendOnly`. The listing reads `stage_assignments` and `user_group_stage` only, never `user_user_groups`, so an ended role keeps its row (A4). The legacy `StageParticipantGridHandler` (`lib/pkp/controllers/grid/users/stageParticipant/`) still declares `fetchGrid`, `fetchCategory`, `fetchRow` with `StageParticipantGridCategoryRow` (one category per user group) and `StageParticipantGridCellProvider` (which appends `user.role.ended` "(Role ended)" when `Repo::userGroup()->userInGroup()` is false), but no template or Vue component in lib/pkp, the ui-library or the three apps loads that grid: the Vue panel opens the handler's `addParticipant`, `viewNotify`, `deleteParticipant`, `saveParticipant`, `sendNotification` and `fetchTemplateBody` ops alone (note d), so the grid's own rendering, row actions and category rows are a dead path (`docs/tracking/UNASSIGNED.md`). The Vue panel is primary; there is no second live path. Live-probed 2026-09-20 on all three apps (Rule 2's rows per stage; a group holding no stage, OPS's Editorial Board Member, has a row nowhere) and the ended role on OJS and OMP (block t3).

<a id="fn-c"></a>
**c** — "Assign": `useParticipantManagerConfig.js::getTopItems()` pushes `common.assign` "Assign" when `useCurrentUser().hasCurrentUserAtLeastOneAssignedRoleInStage(submission, stageId, [ROLE_ID_MANAGER, ROLE_ID_SITE_ADMIN, ROLE_ID_SUB_EDITOR])`, read from `stage.currentUserAssignedRoles`, which `lib/pkp/classes/submission/maps/Schema.php` fills from the user's stage assignments, or from the global manager / site-admin role when the user holds no assignment (so an unassigned Journal Manager qualifies; `productionEditor` is declared `ROLE_ID_MANAGER` in `registry/userGroups.xml`). No recommend-only check enters it, which the Copyediting stage's probe confirmed on 2026-09-19 ("Assign" stays for a recommending Section Editor). Server side `StageParticipantGridHandler::__construct()` grants `addParticipant`, `saveParticipant`, `deleteParticipant` and `fetchUserList` to `ROLE_ID_MANAGER`, `ROLE_ID_SITE_ADMIN`, `ROLE_ID_SUB_EDITOR` and the read-only ops (`viewNotify`, `sendNotification`, `fetchTemplateBody`) to `ROLE_ID_ASSISTANT` too, behind `WorkflowStageAccessPolicy`; `_canAdminister()` is the same role test. `getItemActions()`: "Edit" when `canAdminister && canCurrentUserEditParticipant()` (note h), "Notify" unconditionally, "Login As" when `participant.canLoginAs` (note l), "Remove" when `canAdminister`. Live-probed 2026-09-20 on all three apps: the Roles grid's permission level column reads "Journal Manager" / "Press Manager" / "Manager"; an unassigned Journal Manager, Editor, Production editor and `admin` opened every stage of a submission nobody assigned them to, while the same accounts assigned as Production editor (a group holding Copyediting and Production) got "You don't currently have access to that stage of the workflow." on the Submission and Review entries, since `getPropertyStages()` gives an assigned user the assigned groups' stages alone (*Workflow screen & stage access* note j); every menu by role as Actors gives them.

<a id="fn-d"></a>
**d** — `useParticipantManagerActions.js::participantAssign()` opens the legacy modal `grid.users.stageParticipant.StageParticipantGridHandler` op `addParticipant` titled `editor.submission.addStageParticipant` "Assign Participant"; the form is `AddParticipantForm` on `templates/controllers/grid/users/stageParticipant/addParticipantForm.tpl`. Without an `assignmentId` the template loads the `grid.users.userSelect.UserSelectGridHandler` grid (`GRID-055` in the Reference table): its filter `searchUserFilter.tpl` is the select `filterUserGroupId` from `getUserGroupsByStage($contextId, $stageId)` minus `ROLE_ID_REVIEWER` groups (ordered `orderByRoleId()`, first preselected), the text box `manager.userSearch.searchByName` "Search User By Name" and `common.search` "Search" with no cancel; the grid title `editor.submission.findAndSelectUser` "Locate a User"; columns `select` (radio `userSelectRadioButton.tpl`, `input[name=userId]`), `common.name` "Name", `common.assignments` "Assignments" (`UserSelectGridCellProvider::getCountUserAssignments()`: queued submissions of the context `assignedTo` the user), `user.affiliation` "Affiliation", `user.interests` "Reviewing interests"; `InfiniteScrollingFeature` with `getItemsNumber()` 20. `loadData()`: `Repo::user()->getCollector()->filterByContextIds([$contextId])->filterExcludeSubmissionStage($submissionId, $stageId, $filterUserGroupId)->searchPhrase($name)`, whose `buildExcludedSubmissionStagesFilter()` requires a `user_user_groups` row for the chosen group (active by the collector's `STATUS_ACTIVE` defaults, so an ended role is not offered) whose group holds the stage and no `stage_assignments` row for that user, group and submission. `AddParticipantFormHandler.js` copies the select into the hidden `userGroupId` on change and the checked radio into `userIdSelected`; the grid refetches on the filter form's submit only (seed-facts, 2026-09-19). Live-probed 2026-09-20 on all three apps: the heading, columns and "No Items"; the "Assignments" count reads an accepted reviewer as 1 and a declined one as 0 beside a Section editor on two submissions as 2; twenty rows then a "Load more" link ("20 of 23 items", `fetch-rows` page 2) on OJS with 23 Authors, scrolling loading nothing; on OPS the address typed with the Submission stage's key (`workflowMenuKey=workflow_1`) lands on the one entry, headed "Workflow: Production", and its window posts `stageId=5` (test run 2026-09-20: the side menu's stage entries exactly "Production", as the *Submission stage* suite's absence read records). `getUserGroupsByStage()` reads `user_group_stage`, and `registry/userGroups.xml` gives the manager group no `stages` on OJS and OMP and `stages="5,6"` on OPS (OPS1). Role names: `default.groups.name.*` per app ("Journal editor", "Press editor", "Section editor", "Series editor", "Moderator", "Preprint Server manager", "Guest editor", "Production editor", "Volume editor", "Chapter Author"). The window's "OK" / "Cancel" are `{fbvFormButtons}` defaults; the modal is `openLegacyModal`: its back arrow with a change fires the form's own confirm "The data on this form has changed. Do you wish to continue without saving?", the "Cancel" link closes without it, and leaving the page fires the browser's `beforeunload` question (live-probed 2026-09-20, all three apps; seen 2026-09-19 in passing). `AddParticipantForm::validate()` requires `Repo::userGroup()->userInGroup($userId, $userGroupId)` and the `userId` `FormValidator` carries `stageParticipants.notify.warning` as its message, which the redrawn form never shows (A10, block t1).

<a id="fn-e"></a>
**e** — The two boxes: `addParticipantForm.tpl` sections `stageParticipants.options` "Assignment privileges" with checkbox `recommendOnly` (label `stageParticipants.recommendOnly`) and `stageParticipants.submissionEditMetadataOptions` "Permissions" with checkbox `canChangeMetadata` (label `stageParticipants.canChangeMetadata`), both in wrappers `StageParticipantNotifyHandler.js` shows and hides: on a `userGroupId` change both are hidden (the code means to disable and clear them too, but the `canChangeMetadata` box kept its tick across the hide on all three apps, live-probed 2026-09-20, in both pick orders: A11); on a `userIdSelected` change `updateRecommendOnly()` shows the first when the group is in `possibleRecommendOnlyUserGroupIds` (`AddParticipantForm::initialize()`: every `ROLE_ID_MANAGER` and `ROLE_ID_SUB_EDITOR` group of the context) and ticks it when the group is in `recommendOnlyUserGroupIds` (`UserGroup::isRecommendOnly(true)`); `updateSubmissionMetadataEditPermitOption()` shows the second unless the group is in `notPossibleEditSubmissionMetadataPermissionChange` (the manager groups) and ticks it when the group is in `permitMetadataEditUserGroupIds` (`UserGroup::permitMetadataEdit(true)`). On save `AddParticipantForm::execute()` builds the row through `Repo::stageAssignment()->build($submissionId, $userGroupId, $userId, $recommendOnly, $canChangeMetadata)` with `canChangeMetadata` forced `true` for a manager group; `build()` is `firstOr`, so an existing row for the same person and group is kept unchanged (scenarios.md "Decision behaviour"). The Production stage's probe of 2026-09-19 drove the boxes' arrival state for the Author and the editor-level roles ("Allow this person…" unticked for the journal's and press's Author, ticked on the preprint server); live-probed 2026-09-20 on all three apps: every role's arrival state in a fresh window, and `possibleRecommendOnlyUserGroupIds` is built for every assigner, so a recommending editor's window shows the `recommendOnly` box for an editor-level pick and the tick is saved (block t7).

<a id="fn-f"></a>
**f** — `AddParticipantForm::fetch()`: when `submission.stageId` is `WORKFLOW_STAGE_ID_INTERNAL_REVIEW` or `_EXTERNAL_REVIEW`, the reviewer ids of the submission's review assignments whose `reviewMethod` is `SUBMISSION_REVIEW_METHOD_ANONYMOUS` or `_DOUBLEANONYMOUS` and that are not `declined` go to the template as `anonymousReviewerIds`, with `editor.submission.addStageParticipant.form.reviewerWarning` and `common.ok`; `StageParticipantNotifyHandler.js::maybeTriggerReviewerWarning()` opens a `ConfirmationModalHandler` with `cancelButton: false` when the chosen `userIdSelected` is among them; the ids arrive as numbers (`[66]`) and the radio's value is the string `"66"`, so the test never matches and the dialog never opens (A12). Nothing blocks the save. Live-probed 2026-09-20 on OJS and OMP (block t5).

<a id="fn-g"></a>
**g** — The message: `PKPStageParticipantNotifyForm::fetch()` lists `PKP\editorialTask\Template` rows of the context with the form's `stageId` and type `DISCUSSION`, all of them for a manager or site admin and only those `withUserGroupsAccess()` for other roles (`Repo::editorialTask()->isTemplateAccessibleToUser()`: a template with `restrictToUserGroups` off is open to everyone), as the select `template` under `stageParticipants.notify.chooseMessage` with `defaultValue=""` (the blank first entry, incidentals 2026-09-19) and the TinyMCE textarea `message` under `stageParticipants.notify.message` "Message". Choosing an entry posts `fetchTemplateBody`, which compiles the template's `description` through `TemplateVariables` for the submission and sender and sets the editor's content. The shipped templates are `registry/taskTemplates.xml`: OJS `DISCUSSION_NOTIFICATION_SUBMISSION` "Discussion (Submission)" (stage 1), `DISCUSSION_NOTIFICATION_REVIEW` "Discussion (Review)" (3), `DISCUSSION_NOTIFICATION_COPYEDITING` (4), `DISCUSSION_NOTIFICATION_PRODUCTION` (5), `COPYEDIT_REQUEST` "Request Copyedit" (4), `EDITOR_ASSIGN_SUBMISSION` / `EDITOR_ASSIGN_REVIEW` / `EDITOR_ASSIGN_PRODUCTION`, all titled `mailable.editorAssignedManual.name` "Assign Editor" (1, 3, 5), `LAYOUT_REQUEST` "Ready for Production" (5), `LAYOUT_COMPLETE` "Galleys Complete" (5); OMP the same plus `INDEX_REQUEST` and `INDEX_COMPLETE` (5), and no `WORKFLOW_STAGE_ID_INTERNAL_REVIEW` entry (A6); OPS `DISCUSSION_NOTIFICATION_PRODUCTION` and `EDITOR_ASSIGN_PRODUCTION` only. Sending is `PKPStageParticipantNotifyForm::execute()` → `sendMessage()` (note k). The Copyediting and Production stages' probes of 2026-09-18/19 saw the lists at their stages on all three apps and the template body filling "Message"; live-probed 2026-09-20 on all three apps: the lists per stage verbatim (block t6); `fetchTemplateBody` resolves the submission's variables and leaves `{$recipientName}` for the mailable to fill at send ("Dear Sid Sectionone," in the mail); on OPS `fetchTemplateBody` for `EDITOR_ASSIGN_PRODUCTION` fails with `Mailer::compileParams(): Argument #1 ($view) must be of type string, null given` (HTTP 500) while `DISCUSSION_NOTIFICATION_PRODUCTION` compiles (OPS2); with a message sent from "Assign" the two toasts stack (top 56 px and 104 px from the top, 8 px from the right).

<a id="fn-h"></a>
**h** — "Edit": `getItemActions()` needs `canAdminister && useCurrentUser().canCurrentUserEditParticipant(participant, stageId, submission, participants)`: true for `ROLE_ID_MANAGER` / `ROLE_ID_SITE_ADMIN` holders; otherwise the user must hold `ROLE_ID_SUB_EDITOR` on the stage, the row must not be their own, the row's `roleId` must not be manager or site admin, and a current user whose own assignment on the submission is `recommendOnly` gets no "Edit" on a `ROLE_ID_SUB_EDITOR` row. `participantEdit()` opens `addParticipant` with `assignmentId`, titled `editor.submission.editStageParticipant` "Edit Assignment". Server side `saveParticipant()` refuses the save unless `Validation::canEditParticipant()` (managers always; a sub-editor assigned on the submission, never their own row, never a row whose user holds a manager or site-admin role). The window: `stageParticipants.selectedUser` "Participant" with `**{currentUserName}** ({currentUserGroup})`; the `recommendOnly` section only when `_isChangeRecommendOnlyAllowed()` (false for the current user's own `ROLE_ID_SUB_EDITOR` row, false when the current user's own assignment on this stage is `recommendOnly`, else true for manager and sub-editor groups); the `canChangeMetadata` section only when `_isChangePermitMetadataAllowed()` (false for the current user's own sub-editor row, false for a manager group, else true); `stageParticipants.noOptionsToHandle` "No changes can be made to this participant" when both are false. `execute()` writes only the allowed flags and `parent::execute()` sends nothing (the edit template has no message area); `saveParticipant()` then shows `notification.editStageParticipant` "The stage assignment has been changed." and logs `SUBMISSION_LOG_ADD_PARTICIPANT` regardless (A3), the "No changes" window's "OK" included. The client test reads the row's `roleId` (the assignment's group) and the server test the row's user's roles, so a Journal Manager's Section-editor row passes the first for a sub-editor and fails the second: the save answers 200 with the form redrawn and no message (A9). A recommending editor gets no "Edit" on a manager-level row, so `_isChangeRecommendOnlyAllowed()`'s second false branch is unreachable from the panel; the one "No changes" screen is a manager's own sub-editor row. The Copyediting probe of 2026-09-18 set the recommend-only flag through "Edit" › "Edit Assignment" on OJS and OMP and saw the row's line follow; live-probed 2026-09-20 on all three apps (blocks t7, t9): the window's parts per row, the toast at the top right, the confirm on "Cancel" with a box changed, the `beforeunload` question on leaving the page.

<a id="fn-i"></a>
**i** — What `recommendOnly` changes is read by other features: `lib/pkp/classes/submission/maps/Schema.php::checkDecisionPermissions()` and the apps' `classes/decision/Repository.php::getDecisionTypesMadeByRecommendingUsers()` (the review stage's recommendation buttons, the Submission stage's reduced set, nothing on Copyediting and Production), documented at *Review stage & rounds* Rule 13, *Editorial decision recording* Rule 13, *Submission stage* A2 and *Copyediting stage* A5, each driven on 2026-08-02 to 2026-09-20. This spec claims only the flag's setting, its row line and its arrival state; live-probed 2026-09-20 on all three apps: the round entry's "Recommend Revisions", "Recommend Accept" and "Recommend Decline" for the recommending editor beside a deciding one, no button when alone, the deciding editor's decision buttons, the Copyediting entry with "Assign" and no button, OPS's "Post the preprint" alone for a recommend-only Moderator.

<a id="fn-j"></a>
**j** — `canChangeMetadata` is read by `lib/pkp/classes/submission/Repository.php::canEditPublication()` (any assignment with the flag, after the manager bypass and the author's published-version lock), *Publication metadata* Rule 2. Defaults: `Repo::stageAssignment()->build()` takes `UserGroup::permitMetadataEdit` when no flag is passed; `registry/userGroups.xml` sets `permitMetadataEdit="true"` on manager, editor, productionEditor and sectionEditor and on OPS's author; OJS's guestEditor, OJS's and OMP's author and every assistant group carry no such attribute. At submit two listeners on `SubmissionSubmitted` rewrite every `ROLE_ID_AUTHOR` assignment's flag to the Author group's setting: `lib/pkp/classes/observers/listeners/RestrictAuthorAssignment.php` and `UpdateAuthorStageAssignments.php` (t8). The Roles form's `permitMetadataEdit` box is `settings.roles.permitMetadataEdit` "Permit submission metadata edit."; `UserGroupForm::execute()` forces it true for a manager group. Seen 2026-09-09 on all three apps (the Author's box arrival state) and live-probed 2026-09-20 (block t8).

<a id="fn-k"></a>
**k** — "Notify": `participantNotify()` opens `viewNotify` with `userId`, titled `submission.stageParticipants.notify` "Notify"; the form is `PKPStageParticipantNotifyForm` on `form/notify.tpl`: `stageParticipants.notify.startDiscussion` "Start Discussion", `stageParticipants.notify.startDiscussion.description` "Begin a discussion between yourself and {$userFullName}.", the template select, the required `message` (`FormValidator` with `stageParticipants.notify.warning`), `{fbvFormButtons id="notifyButton" hideCancel=true submitText="submission.stageParticipants.notify"}`. `execute()` calls `sendMessage()` only when `message` is non-empty, then `_logEventAndCreateNotification()` unconditionally (log `informationCenter.history.messageSent`, toast `stageParticipants.history.messageSent`, both "Notification sent to users."). `sendMessage()` looks the template up with `Template::withContextId()->find($templateId)`; the blank entry posts `template=""`, which this install's Postgres refuses (`SQLSTATE[22P02]`, "invalid input syntax for type bigint", HTTP 500) before anything is created, so `execute()` never reaches the log and toast, while `saveParticipant()` has already written the assignment (A2; on a database that accepts the blank id the code's path is a silent return with the toast and log line, not seen). Otherwise it creates an `EditorialTask` of type `DISCUSSION` with `title` the template's title and `createdBy` the recipient (A8), `Participant` rows for the recipient and, when different, the sender (A5), a head `Note` with the compiled message, a `NOTIFICATION_TYPE_NEW_QUERY` task for the recipient (the sender's own on their own row, A5), and `Mail::send()`s the `TemplateVariables` mailable with `subject($template->title)`, `sender($request->getUser())`, `body($message)`; the `switch ($templateKey)` adds `NOTIFICATION_TYPE_COPYEDIT_ASSIGNMENT` for `COPYEDIT_REQUEST`, `_LAYOUT_ASSIGNMENT` for `LAYOUT_REQUEST`, `_INDEX_ASSIGNMENT` for `INDEX_REQUEST`, and `NOTIFICATION_TYPE_EDITOR_ASSIGN` for the key `EDITOR_ASSIGN`, which no shipped template carries (A1); every other key logs `DISCUSSION_NOTIFY`. The Copyediting and Production probes of 2026-09-18/19 drove the Copyeditor's and Layout Editor's messages end to end (email, discussion, Tasks rows); the "Notify" window was read on all three apps on 2026-09-19 (incidentals: "Created by: <the recipient>") and live-probed 2026-09-20 on all three apps (blocks t10, t11; the mail From the sender's own name and address, the "An email has been sent: {name}" log row). The refusal of an empty "Message" is the top-right message, the window left as it was (test run 2026-09-20, all three apps).

<a id="fn-l"></a>
**l** — "Login As": `getItemActions()` pushes `grid.action.logInAs` "Login As" when `participant.canLoginAs`, which `lib/pkp/classes/user/maps/Schema.php::getPropertyCanLoginAs()` sets false for the current user's own row, true for a site admin, else from `Repo::user()->permissionMapForManager()` (true when the current user holds a `ROLE_ID_MANAGER` group in every context the target holds any group in; the Editor and Production editor groups are declared `ROLE_ID_MANAGER`, so they count, and a Site Administrator target, whose group has the site context, is out of reach for anyone but another administrator). `participantLoginAs()` opens a `useModal().openDialog` titled `grid.action.logInAs` with `grid.user.confirmLogInAs` and `common.ok` / `common.cancel`, then redirects to `useUserAuth().getDashboardLoginAsUrl(roleId, userId, submissionId)`: `login/signInAsUser/{userId}?redirectUrl=` `dashboard/mySubmissions?workflowSubmissionId={id}` for `ROLE_ID_AUTHOR`, `dashboard/editorial?workflowSubmissionId={id}` otherwise; `LoginHandler::signInAsUser()` re-checks `Validation::getAdministrationLevel()` and answers `manager.people.noAdministrativeRights` on failure. `ParticipantManager.vue` prints, when `isUserLoggedInAs()`, a first list item with `user.logOutAs` "Logout as {$username}" filled with `getCurrentUserFullName()` (the impersonated user's full name, not their username, t12), whose click runs `participantLogoutAs()` → `getLogoutAsUrl()` → `login/signOutAsUser?redirectUrl=dashboard/editorial?workflowSubmissionId={id}`. The Vue store reads no "already impersonating" flag, so the entry stays offered mid-impersonation (*Login and sessions* A4, probed 2026-08-01). The legacy row's `RedirectConfirmationModal` and the grid's `signOutAsUser` link action are the unmounted grid's (note b). Live-probed 2026-09-20 on all three apps (block t12); a "Notify" sent while impersonating opened the discussion with the impersonated editor as "(Me)", mailed From their name and address, and the Activity Log's "Notification sent to users." read "Mira Manager (acting as Sid Sectionone)" in the "User" column.

<a id="fn-m"></a>
**m** — "Remove": `participantRemove()` opens a dialog titled `editor.submission.removeStageParticipant` "Remove Participant" with `editor.submission.removeStageParticipant.description` "You are about to remove this participant from **all** stages." and `common.ok` (warnable) / `common.cancel`, then POSTs `deleteParticipant` with the `assignmentId`. `StageParticipantGridHandler::deleteParticipant()` deletes the `StageAssignment`, calls `Repo::editorialTask()->removeParticipantFromSubmissionTasks()` (which returns early for a user holding `ROLE_ID_MANAGER` or `ROLE_ID_SITE_ADMIN` in the context and otherwise deletes the user's `Participant` rows on every task of the submission), recomputes the decision-stage notices (note o) and, at Copyediting and Production, the four editors' notices, and logs `SUBMISSION_LOG_REMOVE_PARTICIPANT`. It never touches `NOTIFICATION_TYPE_EDITOR_ASSIGNMENT_REQUIRED`. No `createTrivialNotification()` follows, so "OK" shows no toast. Access after the removal is `WorkflowStageAccessPolicy`'s (*Workflow screen & stage access*): the removed assistant's next landing is the dashboard with the "Error" dialog, and a Section Editor's own removal empties the panel (the participants refetch answers 401) under the same dialog. Live-probed 2026-09-20 on all three apps (block t13).

<a id="fn-n"></a>
**n** — Automatic assignments: the Author's row is written when the submission is created (*Submission wizard*); `lib/pkp/classes/observers/listeners/AssignEditors.php` on `SubmissionSubmitted` calls `SubEditorsDAO::assignEditors()`, which reads `subeditor_submission_group` for the publication's section (`ASSOC_TYPE_SECTION`) and categories (`ASSOC_TYPE_CATEGORY`), keeps the pairs whose user still holds the group (`userInGroup`), builds each through `Repo::stageAssignment()->build(…, $userGroup->recommendOnly)`, recomputes the decision-stage notices, creates a `NOTIFICATION_TYPE_SUBMISSION_SUBMITTED` row per assignee at the default `NOTIFICATION_LEVEL_NORMAL` (so nothing in the header's Tasks panel, which lists task-level rows), and mails `EditorAssigned` (key `EDITOR_ASSIGN`, name `mailable.editorAssigned.name` "Editor Assigned (Auto)", OPS "Moderator Assigned (Auto)"; subject `emails.editorAssign.subject`, from the context's `contactEmail`) to each manager-level or sub-editor assignee of `WORKFLOW_STAGE_ID_SUBMISSION` once; a preprint server's Moderator group holds Production alone, so that list is empty there and nobody is mailed, while the assignments stop `SubmissionNeedsEditor` (OPS3), skipping those whose `NotificationSubscriptionSettingsDAO` blocked-email list holds `NOTIFICATION_TYPE_SUBMISSION_SUBMITTED`, logging `SubmissionEmailLogEventType::EDITOR_ASSIGN`. When nobody was assigned the listener raises `NOTIFICATION_TYPE_EDITOR_ASSIGNMENT_REQUIRED` and the `SubmissionNeedsEditor` mail for every manager (U05, U21). The forms: `templates/controllers/grid/settings/sections/form/sectionForm.tpl` (OJS, OPS) and OMP's `seriesForm.tpl` print one box per assignable user and group labelled `manager.sections.form.assignEditorAs` "Assign {$name} as {$role}" under `manager.sections.form.assignEditors` "Editorial Assignments"; `lib/pkp/classes/components/forms/context/CategoryForm.php` builds the same group `subEditors` with `manager.category.form.assignEditors`, grouped under role headings. The failure on later journals is *Submission wizard* A8 (probed 2026-09-07). Live-probed 2026-09-20: the section forms list one box per editor and assistant ("Assign Rita Assistant as Funding coordinator"; OPS adds "Assign admin admin as Preprint Server manager", "Assign Maya Manager as Preprint Server manager"); the seeded journal's and press's "Articles" / "Monographs" tick Diana (Journal editor), Ana and Omar, OPS's "Preprints" Ana and Ravi; the seeded category "Applied Science" lists everyone unticked on OJS and OMP and renders the group with no box on OPS, twice (OPS4; the cause was not read); `author.alex`'s wizard submission listed the ticked editors beside the Author on all three apps, mailed each once From "Site Admin <admin@mail.test>" (the seeded principal contact) on OJS and OMP with the "An email has been sent: …" log row, and mailed nobody on OPS (two submissions, 30 s waits, the log holding only the author's acknowledgement). Seed: `users[].sections` in the bootstrap and context scenarios write the `subeditor_submission_group` rows; the seeded journal auto-assigns, a scratch context never does (note s).

<a id="fn-o"></a>
**o** — `StageParticipantGridHandler::saveParticipant()` deletes every `NOTIFICATION_TYPE_EDITOR_ASSIGNMENT_REQUIRED` row of the submission when any stage has a `ROLE_ID_MANAGER` or `ROLE_ID_SUB_EDITOR` assignment after the save, whichever group was just assigned (so an assistant's assignment clears it when an editor is already there, which on a submission with an editor cannot arise since the task exists only while none is; live-probed 2026-09-20 on all three apps, block t14, the three strings `notification.type.editorAssignmentTask` per app). The same method, for a `ROLE_ID_MANAGER` group, and `deleteParticipant()` and `SubEditorsDAO::assignEditors()` always, call `NotificationManager::updateNotification()` for `getDecisionStageNotifications()` (`NOTIFICATION_TYPE_EDITOR_ASSIGNMENT_SUBMISSION`, `_EXTERNAL_REVIEW`, `_EDITING`, `_PRODUCTION`), whose `EditorAssignmentNotificationManager::updateNotification()` creates a user-less task-level row for a stage with no editor assignment and deletes it once one exists; texts `notification.type.editorAssignment` "An editor must be assigned before review is initiated. Please add editor using the Participants list.", `…Editing` and `…Production`. No template, page handler, API route or Vue component in lib/pkp, the ui-library or the three apps fetches those four types: `WorkflowNotificationDisplay.vue` asks for the copyediting and production pairs alone, and the apps' `pages/workflow/WorkflowHandler.php::getEditorAssignmentNotificationTypeByStageId()` has no caller. The rows are written and never shown (`docs/tracking/UNASSIGNED.md`). `NOTIFICATION_TYPE_EDITOR_ASSIGN` (`notification.type.editorAssign` "You have been assigned as an editor to the submission "{$title}"."; link the editorial dashboard) is created by `PKPStageParticipantNotifyForm::sendMessage()` alone, for the template key `EDITOR_ASSIGN`, which `registry/taskTemplates.xml` does not ship (A1).

<a id="fn-p"></a>
**p** — Log lines: `submission.event.participantAdded` "{$userFullName} ({$username}) was assigned to this submission as a {$userGroupName}." (`SUBMISSION_LOG_ADD_PARTICIPANT`, written by `saveParticipant()` on add and edit alike, A3), `submission.event.participantRemoved` "… was removed from this submission as a …" (`SUBMISSION_LOG_REMOVE_PARTICIPANT`), `informationCenter.history.messageSent` "Notification sent to users." (`SUBMISSION_LOG_MESSAGE_SENT`), and `SubmissionEmailLogEventType::EDITOR_ASSIGN` / the discussion mail's "An email has been sent: {subject}" row. The participant lines are logged with the assignment's `userId`, so the log's "User" column names the participant, not the editor who pressed "OK" (A13); the message line carries the sender, rendered "{impersonator} (acting as {name})" when impersonating (live-probed 2026-09-20, all three apps). The log's rendering is *Submission activity log & notes*'. The toast `notification.addedStageParticipant` "User added as a stage participant." is `createTrivialNotification()` in `saveParticipant()`.

<a id="fn-q"></a>
**q** — Settings: `lib/pkp/controllers/grid/settings/roles/form/UserGroupForm.php` with `userGroupForm.tpl` under `settings.roles.roleOptions` "Role Options": `recommendOnly` (`settings.roles.recommendOnly`; `getRecommendOnlyRoles()` is `[ROLE_ID_MANAGER, ROLE_ID_SUB_EDITOR]`, and the template prints the box on every form, `disabled` outside those levels), `permitMetadataEdit` (`settings.roles.permitMetadataEdit`; forced true and `disabled` for a manager group), and `grid.roles.stageAssignment` "Stage Assignment" boxes; the manager group's row has no edit action. Live-probed 2026-09-20 on all three apps: every form's boxes and their defaults; the Section editor's recommend-only box ticked → the "Assign Participant" box preticked, restored; the Copyeditor's and Author's metadata box flipped → the pick's box and a seeded Author's row followed; the Section editor's "Submission" box unticked → the Submission-stage panel lost the Section editor's row and the window's list lost the role, both back on re-tick (OJS, OMP); OPS's Moderator "Production" box unticked → "Your changes have been saved." and the box ticked again on reopening. `registry/userGroups.xml` ships no `recommendOnly` attribute on any group. The email template is `registry/emailTemplates.xml` `EDITOR_ASSIGN` (`mailable.editorAssign.name` "Editor Assigned" is the template's list name on OJS and OMP; the mailable's own name `mailable.editorAssigned.name` "Editor Assigned (Auto)" is what Settings › Workflow › Emails lists, to be read on screen); the task templates are `registry/taskTemplates.xml` (note g), edited under the Workflow settings' "Tasks and Discussions" tab (*Copyediting stage* note p, 2026-09-19; 2026-09-20: a renamed template is listed last in the "Notify" list and its new name is the mail's subject; "Editor Assigned (Auto)" / "Moderator Assigned (Auto)" listed under Settings › Workflow › Emails with "Edit" opening "Edit Template", whose "Name" field reads "Editor Assigned" on all three apps, the preprint server's "Moderator Assigned (Auto)" entry included, a wording matter for *Emails management*'s screen). The notification settings rows are `PKPNotificationManager::getNotificationSettingsMap()` (`notificationSubmissionSubmitted` / `emailNotificationSubmissionSubmitted`, key `notification.type.submissionSubmitted`, the app's string "A new article, "{$title}," has been submitted.", OMP "A new monograph, …", OPS "A new preprint , "{$title}", has been submitted." with its stray space and misplaced comma, a wording matter for *Notifications center*'s screen; the `NOTIFICATION_TYPE_NEW_QUERY` row for the discussion emails), live-probed 2026-09-20 on all three apps with every "Do not send" box unticked. No scenario key sets a role's boxes, a section's editors beyond `users[].sections`, or a template's text (scenarios.md), so those ends are reached on the screens.

<a id="fn-r"></a>
**r** — Pointers and scope prose. The passages carrying this mark name features that describe their own screens and claim no screen of their own; live-probed 2026-09-20: the drives opened those screens only on the way to the panel (the stage and round entries and their decision buttons, the Roles form, the Tasks panel, the Activity Log, Manage Emails, the Users & Roles screen) and found them as pointed.

<a id="fn-s"></a>
**s** — Seeding for the scenarios: the seeded journal `publicknowledge` and roster accounts (passwords = username doubled), scratch submissions through `POST scenarios/submission` with submitter `author.alex` (the press: `series: 'monographs'` for the first section, `'textbooks'` for the second); `participants: [{username, role}]` writes an assignment row without the "Assign" form's message, and a user named there is not offered by that submission's "Assign Participant" (scenarios.md). There is no `recommendOnly` key (`participants[].recommendOnly` is refused with 400 "Unsupported spec key"): the flag is set on screen through "Assign Participant" or "Edit Assignment", which is this feature's subject. The seeded journal's ART section ticks `editor.diana` (as Journal editor), `sectioneditor.ana` and `sectioneditor.omar` under "Editorial Assignments" and REV ticks `sectioneditor.ravi` (the press's "Monographs" the same three and "Textbooks" Diana and Ravi; the preprint server's "Preprints" Ana and Ravi as Moderators; live-probed 2026-09-20 on the seeded section forms), so a wizard submission to ART on `publicknowledge` is the automatic-assignment given, and a `POST scenarios/submission` seed there auto-assigns the same people without the email (seed-facts 2026-09-04); a scratch context never auto-assigns, by the seed or by the wizard (`docs/tracking/app-changes.md` row 3), so scenarios 5, 6 and 9 run on `publicknowledge`, their mails read by the seeded recipient's address and the submission's title. Scenario 6's and 9's settings are flipped on screen before the first step and restored after the last, by `manager.maya` (the Section editor / Series editor / Moderator role's box on Settings › Users & Roles › Roles › "Edit"; the subject in Settings › Workflow › Emails › "Editor Assigned (Auto)" › "Edit" › "Edit Template") and by `sectioneditor.ana` (her box on Profile › Notifications), as the claim check's `shared/playwright/checks/U35/K5/k5.js` did; those two scenarios run alone (the flips are visible to every worker). A submitted seed leaves the managers' "needs an editor" task, which a seeded editor does not clear (only an on-screen "Assign" does), and on the seeded journal an on-screen "Assign" of an assistant clears it too once a seeded editor is there (note o), so scenarios 3 and 8 seed their submission on a scratch context, where the seed assigns nobody. Mail reads are scoped by recipient in Mailpit at `http://127.0.0.1:8025`, so scenarios 3, 4 and 8 run on a scratch context from `POST scenarios/context` with throwaway `users[]` whose addresses name the app and the test, every absence bounded by an email that did arrive. A role ended on the Users & Roles screen has no key: scenario 4's fourth Section Editor is created with `roles: ['sectionEditor', 'reader']` (the last role cannot be removed there) and the Section editor role removed on screen before the first step (Settings › Users & Roles › Users › the user's "Edit" › the role row's "Remove Role", note t3); the recipient's notification boxes have no key either (note q) and are ticked on Profile › Notifications as that user before the first step. `manager.maya` is the unassigned Journal Manager, `editor.diana` the Editor (OJS, OMP), `copyeditor.carla` the Copyeditor, `sectioneditor.ravi` the Section Editor of another journal only on a scratch context (the seeded accounts are not enrolled there), `admin` the Site Administrator holding the manager role on the seeded preprint server (the "Preprints" form's "Assign admin admin as Preprint Server manager"). Never assign or remove on a shared roster submission another test reads. Per scenario: 1 a seed in ART with `decisions: ['sendExternalReview', 'accept']`, `reviewRounds: [{reviewers: [{username: 'reviewer.julia', status: 'completed'}]}]` and `participants: [{username: 'copyeditor.carla', role: 'copyeditor'}]` (Diana, Ana and Omar auto-assigned), read as `manager.maya`, `sectioneditor.ana`, `copyeditor.carla` and `author.alex`, the impersonations of `copyeditor.carla` and `author.alex`, `sectioneditor.ravi` the unassigned Section Editor the search offers; 2 a seed in REV (`series: 'textbooks'`) with `decisions: ['sendExternalReview']` and no reviewer, so `sectioneditor.ravi` is the deciding editor the form assigns, `sectioneditor.ana` the recommending one and `sectioneditor.omar` the one assigned with the box clear who then removes his own row, read as `manager.maya`, `sectioneditor.ana` and `sectioneditor.omar`; 3 a scratch journal with throwaway `roles: ['manager']`, `['sectionEditor']`, `['funding']` and `['author']`, a Submission-stage seed by the throwaway author with `participants: []`, the Funding Coordinator's no-mail control bounded by the Section Editor's "Assign Editor" mail; 4 a scratch journal with a throwaway `['manager', 'sectionEditor']`, two `['sectionEditor']`, the fourth `['sectionEditor', 'reader']` ended as above, and `['author']`, the seed `decisions: ['sendExternalReview', 'accept']` with the manager (`role: 'sectionEditor'`) and the first Section Editor in `participants[]`, the first Section Editor's two boxes ticked before the first step, `sectioneditor.ravi`'s name the elsewhere-only search; 5 `author.alex`'s wizard submission to "Articles" (the press: the series "Monographs" on the wizard's "For the Editors" step), read as `manager.maya` and `sectioneditor.ana`, the mails of `editor.diana`, `sectioneditor.ana` and `sectioneditor.omar` by address and title, `sectioneditor.ravi` the control; 6 the same after the three flips above, the mails of `editor.diana` and `sectioneditor.omar`, the absence of `sectioneditor.ana`'s bounded by those two, `sectioneditor.ravi` the third Section Editor chosen in the window; 7 a submitted seed by `author.alex` on the seeded preprint server (the seed auto-assigns `sectioneditor.ana` and `sectioneditor.ravi` as Moderators), read as `manager.maya`, `sectioneditor.ravi` (the second Moderator) and `author.alex`, `admin` the manager chosen in the window and the impersonation of `sectioneditor.ravi`; 8 a scratch preprint server with throwaway `roles: ['manager']`, `['sectionEditor']` (a Moderator) and two `['author']`, a submitted seed by the first author with `participants: []`, the second Author's no-mail control bounded by the Moderator's "Discussion (Production)" mail; 9 `author.alex`'s wizard submission to "Preprints" after `manager.maya` ticks the Moderator role's box, restored afterwards, read as `manager.maya`, `sectioneditor.omar` the third Moderator and `admin` the control's manager choice. The recipe is the tooling's: no screen shows it.

<a id="fn-t1"></a>
**t1** — Live-probed 2026-09-20 on all three apps: "OK" with no row chosen answered with the form drawn again (`save-participant` 200 with the form's HTML), no message anywhere, no toast, no row on the panel; the same with a message typed and no person (A10).

<a id="fn-t2"></a>
**t2** — Live-probed 2026-09-20 on all three apps: the rows run manager-level ("Journal editor", "Production editor"), then Section and Guest editors, then the assistants by role, then the Authors; a person in two roles has a row per role; after the Author's row was removed every stage entry showed the heading and "Assign" alone, no "None Assigned", no placeholder; the recommend-only row's third line reads "Only allowed to recommend an editorial decision".

<a id="fn-t3"></a>
**t3** — Live-probed 2026-09-20 on OJS and OMP: the Copyeditor's role ended through Settings › Users & Roles › Users › the user's "Edit" › the role row's "Remove Role" (dialog "Remove Role / Are you sure you want to remove this role? The user will lose access and permissions associated with it. / Remove Role / Cancel"; the Reader role kept, since the last role cannot be removed there); the Copyediting entry still listed the person with no mark and the full menu, "Assign" › Copyeditor › a search for them offered nobody, and the person's sign-in landed on the journal's front page with the workflow address refused (A4).

<a id="fn-t4"></a>
**t4** — Live-probed 2026-09-20 on all three apps: "Locate a User"; "Name", "Assignments", "Affiliation", "Reviewing interests" after the radio column; a Section editor on two submissions counts 2, an accepted reviewer 1, a declined one 0, a reviewer with two completed reviews 2 (OJS, OMP); changing the role alone posts nothing and "Search" reloads for the chosen role and typed name; a name matching nobody lists "No Items"; on OJS with 23 Authors, twenty rows and a "Load more" link under the list reading "20 of 23 items", scrolling loading nothing and the link loading the rest ("23 of 23 items").

<a id="fn-t5"></a>
**t5** — Live-probed 2026-09-20 on OJS and OMP: a throwaway user holding Section editor and reviewer roles with an accepted double-anonymous review (a seeded review is double-anonymous unless the context sets `review.defaultReviewMode`), chosen from the stage entry and from the round entry: the window arrived with the reviewer's id and the warning text and no dialog opened within 1.5 s (A12); "OK" assigned them. The declined reviewer, the Copyediting stage and an open-review journal showed no dialog, as designed.

<a id="fn-t6"></a>
**t6** — Live-probed 2026-09-20 on all three apps: the lists per stage as Rule 4e quotes, in that order after the blank entry (the preprint server's one entry); the press's Internal Review round entry: the blank entry alone, and a typed message from there failed as A2 (A6); "Assign Editor" filled the title, its link, the author and the abstract and left "Dear {$recipientName}," in the stored text, which the box shows as "Dear NAME," (test run 2026-09-20, OJS and OMP); the "Discussion (…)" templates filled "Please enter your message."; OPS's "Assign Editor" answered a server error and left "Message" as it was (OPS2).

<a id="fn-t7"></a>
**t7** — Live-probed 2026-09-20 on all three apps: the recommending editor's menus read "Notify", "Remove" on every editor-level and manager-level row and "Edit" on the assistants' and Authors'; their "Assign Participant" window showed "Assignment privileges" (clear) once a Section editor / Series editor / Moderator was chosen, and the tick was saved: the new row carried the third line and a manager's "Edit Assignment" on it showed the box ticked; their "Edit" on a Funding coordinator's or Author's row carried "Permissions" alone. The deciding editor: "Edit" with the box ticked on the recommending editor's row, none on their own row, none on the Journal editor's or the Preprint Server manager's row, and on the Journal Manager's Section editor row "Edit" offered, both boxes shown, "OK" refused with no message (A9).

<a id="fn-t8"></a>
**t8** — Live-probed 2026-09-20 on OJS: a manager opens a draft's workflow at `dashboard/editorial?workflowSubmissionId={id}` ("Incomplete") with the Author's row and its "Edit"; "Allow this person…" ticked there was saved, and after the Author's wizard submit the box was clear again. On the preprint server a seeded preprint's Author row arrived ticked, and clear when the Author role's box was unticked before the seed; on OJS and OMP the Author role's box ticked gave a seeded Author's row the tick.

<a id="fn-t9"></a>
**t9** — Live-probed 2026-09-20 on all three apps: "Participant" reads "**{name}** ({role})"; both boxes on a Section editor's row, "Assignment privileges" alone on an Editor's, a Production editor's and the manager's own manager-level row, "Permissions" alone on an assistant's and the Author's; "OK" with the box ticked showed "The stage assignment has been changed." at the top right and the row's third line at once; a Journal Manager assigned as Section editor opening their own row read "No changes can be made to this participant" with "Cancel" and "OK", whose "OK" showed the saved toast; the Activity Log gained one "was assigned to this submission as a {role}." line per save, that window's included (A3); no email to the edited person. The "Cancel" link with a box changed closed the window with no question (test run 2026-09-20, OJS and OMP, twice each); the question recorded on 2026-09-20 on the press and the preprint server was driven with a locator that resolves to the window's "Close" arrow, so the arrow's behavior on this window is not claimed.

<a id="fn-t10"></a>
**t10** — Live-probed 2026-09-20 on all three apps: "Notify" with a sentence typed and the list blank posted `send-notification`, which answered HTTP 500; the window stayed open with no message and no toast, the discussions panel gained nothing, the Activity Log gained no line, and no mail with the typed marker arrived, bounded by a control sent afterwards with a template chosen (which arrived with the typed text in place of the template's); from "Assign Participant" the same request (`save-participant`) answered 500 and the person was listed once the window was closed (A2).

<a id="fn-t11"></a>
**t11** — Live-probed 2026-09-20 on all three apps: a Journal Manager assigned as Section editor found "Edit", "Notify", "Remove" on their own row; "Notify" sent empty was refused with the toast of Fields; sent with a template chosen it showed "Notification sent to users.", opened a discussion whose participant list held the sender alone, mailed the sender From the sender, and added "{sender} started a discussion: {name}: …" to the sender's own Tasks panel (A5).

<a id="fn-t12"></a>
**t12** — Live-probed 2026-09-20 on all three apps: the dialog "Login As / Log in as this user? All actions you perform will be attributed to this user. / OK / Cancel"; "OK" landed on `dashboard/editorial?workflowSubmissionId={id}&currentViewId=assigned-to-me&workflowMenuKey={the same stage}` as the target with both avatars in the header; the panel's first entry read "Logout as Sid Sectionone" (the full name), also listed among the panel's header buttons, and pressing it landed back on the same submission as the manager; an Author's row landed on `dashboard/mySubmissions?…` (OPS on "Preprint: Title & Abstract"). An Editor and a Production editor saw "Login As" on the Copyeditor's row; a Section editor and an assistant did not; `admin`'s Section editor row offered no "Login As" to the Journal Manager or the Editor.

<a id="fn-t13"></a>
**t13** — Live-probed 2026-09-20 on all three apps: the dialog as Rule 10 quotes, "Cancel" keeping the row; "OK" with no toast, the Copyeditor's row gone from every stage entry, a discussion's participant list shrunk from three to two (a removed Journal editor stayed in it and still opened the submission), the log line "{name} ({username}) was removed from this submission as a {role}.", no mail; the removed Copyeditor's next landing the dashboard with the "Error" dialog; a Section editor's own removal: an emptied panel under the "Error" dialog, the address answering the dialog on every later landing; the only editor removed by the manager: no "needs an editor" row in either manager's panel and no mail.

<a id="fn-t14"></a>
**t14** — Live-probed 2026-09-20 on all three apps: a seeded submission left the task in both managers' panels, in each app's words; it stayed after a Funding coordinator (OPS: an Author) was assigned through "Assign", was gone from both panels after a Section editor with "Assign Editor" (OJS), a Press editor with "Assign Editor" and then a Series editor (OMP) or a Moderator with no message (OPS), and stayed gone after that editor's "Remove".

<a id="fn-t15"></a>
**t15** — Live-probed 2026-09-20: `author.alex`'s wizard submission to "Articles" on the seeded journal (the press: series "Monographs" on the "For the Editors" step) listed "Diana Editor / Journal editor", "Ana Section Editor / Section editor" and "Omar Section Editor / Section editor" beside the Author; each got one email, subject "You have been assigned as an editor on a submission to Journal of Public Knowledge" / "…to Public Knowledge Press", From "Site Admin <admin@mail.test>", logged as "An email has been sent: …"; Ana's Tasks panel had no row; Ravi and Maya got nothing. On the preprint server two submissions listed Ana and Ravi as "Moderator" and sent nothing to them (OPS3).

<a id="fn-t16"></a>
**t16** — Live-probed 2026-09-20 on the seeded journal, press and preprint server, every setting restored afterwards (`shared/playwright/checks/U35/K5/k5.js`; the screens under `.reports/U35/ccK5/`): the Section editor (Series editor, Moderator) role's recommend-only box ticked → `author.alex`'s wizard submission listed Ana's and Omar's rows (OPS Ana's and Ravi's) with "Only allowed to recommend an editorial decision", their "Edit" windows with "Assignment privileges" ticked, and the Submission stage's reduced buttons (note i); the box clear (the submission of t15) → no third line. Ana's "Do not send me an email…" under "A new article, …" ticked → nothing for the title in her mailbox while Omar's and Diana's assignment mails arrived and the Activity Log listed theirs alone (OJS, OMP; OPS sends nothing either way, OPS3). The "Editor Assigned (Auto)" subject prefixed in "Edit Template" → the prefixed subject in the mails and in the Activity Log's "An email has been sent: …" rows (OJS, OMP; OPS's "Moderator Assigned (Auto)" saved the same and sent nothing). The discussion rows' boxes: on a scratch context on all three apps, a "Notify" message to a Section editor arrived once with "Discussion added." off, once with "Discussion activity." off and once with both on, and the recipient's inbox held those three messages and nothing else. One email however many roles: no seeded person holds two groups on `publicknowledge` (the "Articles" form lists Diana once, "Assign Diana Editor as Journal editor"), so that end was not seen and the body does not claim it; the code mails each assignee once (note n), and the settling drive is to enrol `editor.diana` as Section editor on Users & Roles, tick her second box on "Articles", submit as `author.alex`, count her mails for the title, then undo both.

<a id="fn-a1"></a>
**f-a1** — `PKPStageParticipantNotifyForm::sendMessage()` switches on `$template->key`: `case 'EDITOR_ASSIGN'` calls `_addAssignmentTaskNotification(…, NOTIFICATION_TYPE_EDITOR_ASSIGN, …)` and logs `SubmissionEmailLogEventType::EDITOR_ASSIGN`; the shipped keys are `EDITOR_ASSIGN_SUBMISSION`, `EDITOR_ASSIGN_REVIEW` and `EDITOR_ASSIGN_PRODUCTION` (`registry/taskTemplates.xml` in OJS, OMP and OPS), which fall to the `default` branch (`DISCUSSION_NOTIFY`). `getEmailVariableNames()` in the same class lists the three stage-keyed names beside `EDITOR_ASSIGN`, so the stage-keyed templates were meant to be recognised. A grep of lib/pkp and the three apps finds `NOTIFICATION_TYPE_EDITOR_ASSIGN` created nowhere else. Live-probed 2026-09-20 on OJS and OMP: the Section editor assigned with "Assign Editor" had one Tasks row, "Mira Manager started a discussion: Assign Editor: …", and no "You have been assigned as an editor to the submission …"; the Copyeditor control assigned with "Request Copyedit" had the discussion row and "You have been asked to review copyedits for "{title}"." both. OPS: the template cannot be loaded (OPS2).

<a id="fn-a2"></a>
**f-a2** — `PKPStageParticipantNotifyForm::execute()`: `if ($this->getData('message')) { $this->sendMessage(…); $this->_logEventAndCreateNotification(…); }`; `sendMessage()` opens with `$template = Template::withContextId(…)->find($templateId)`, and the select's blank entry posts `template=""`. On this install's Postgres the `find('')` throws (`PDOException … invalid input syntax for type bigint: ""`, the probe server's log at `send-notification` and `save-participant`, HTTP 500), so neither the log line nor the toast follows and the browser's window is left as it was; `StageParticipantGridHandler::saveParticipant()` builds the assignment before the message step, so the row is written. On a database that accepts the blank id the code's `if (!is_a($template, Template::class)) return;` path sends nothing and still logs and toasts; not seen. Live-probed 2026-09-20 on all three apps (block t10).

<a id="fn-a3"></a>
**f-a3** — `StageParticipantGridHandler::saveParticipant()`: after `$form->execute()` the branch `if ($stageAssignmentId != $assignmentId)` picks the toast only; the `Repo::eventLog()->add()` with `SUBMISSION_LOG_ADD_PARTICIPANT` and `submission.event.participantAdded` runs for both branches, the "No changes" window's save included. Live-probed 2026-09-20 on all three apps (block t9): one more line per save.

<a id="fn-a4"></a>
**f-a4** — Note b: `assignedTo()` joins `stage_assignments` and `user_group_stage` only; `stageAssignmentsForUsers()` reads the group's data, not the user's membership; the Vue rows print `fullName` and `roleName` alone. `StageParticipantGridCellProvider::getTemplateVarsFromRowColumn()` in the unmounted grid appends `user.role.ended` when `userInGroup()` is false, which is the earlier wording. Whether the ended user is also still offered by "Assign" is settled by note d's active-membership filter (not offered). Live-probed 2026-09-20 on OJS and OMP (block t3); the manager's menu on the ended user's row still offered "Login As", the user keeping the journal's Reader role.

<a id="fn-a5"></a>
**f-a5** — `useParticipantManagerConfig.js::getItemActions()` pushes `PARTICIPANT_NOTIFY` outside every guard; `sendMessage()` creates the recipient's `Participant` and skips the sender's when the ids match, mails `recipients([$user])` where `$user` is the recipient. The legacy `StageParticipantGridRow` added `NotifyLinkAction` on every row too, so the offer is old; the `NOTIFICATION_TYPE_NEW_QUERY` task lands in the sender's own panel. Live-probed 2026-09-20 on all three apps (block t11).

<a id="fn-a6"></a>
**f-a6** — `checkouts/omp/registry/taskTemplates.xml` carries `stageId="WORKFLOW_STAGE_ID_EXTERNAL_REVIEW"` on "Discussion (Review)" and `EDITOR_ASSIGN_REVIEW` and no `WORKFLOW_STAGE_ID_INTERNAL_REVIEW` entry; `PKPStageParticipantNotifyForm::fetch()` filters `Template::withStageId($this->_stageId)`, and the context factory installs the registry templates unchanged (seed-facts 2026-09-11). Live-probed 2026-09-20 on OMP: the round entry's "Assign Participant" and "Notify" lists held the blank entry alone, and a typed message from there failed as A2 with no mail to the recipient (block t6).

<a id="fn-a7"></a>
**f-a7** — Note h: `canCurrentUserEditParticipant()` returns false when `currentUserId === participant.id` for a non-manager; `Validation::canEditParticipant()` returns false for `$user->getId() === $stageAssignment->userId` after the manager bypass; `_isChangeRecommendOnlyAllowed()` and `_isChangePermitMetadataAllowed()` both return false for the current user's own `ROLE_ID_SUB_EDITOR` row even for a manager, which yields `stageParticipants.noOptionsToHandle`. Live-probed 2026-09-20 on all three apps (blocks t7, t9).

<a id="fn-a8"></a>
**f-a8** — `sendMessage()` creates the `EditorialTask` with `'createdBy' => $user->getId()`, `$user` being the recipient; the discussions panel prints `createdBy`. Seen 2026-09-18 on OJS and OMP for the Copyediting stage's "Request Copyedit" (*Copyediting stage* f-a9: "Discussion Request Copyedit Created by: {the Copyeditor's username}") and 2026-09-19 and live-probed 2026-09-20 on all three apps for the "Notify" window: the row reads "Discussion {template name} Created by: {recipient username}" with no "Discussion created by … on …" line, while a discussion added through the panel's "Add" reads "Created by: {opener} Discussion created by {opener} ({role}) on {date}".

<a id="fn-a9"></a>
**f-a9** — Note h: `useCurrentUser().canCurrentUserEditParticipant()` refuses a sub-editor a row whose `roleId` is manager or site admin (the assignment's group), while `Validation::canEditParticipant()` refuses a row whose user holds a manager or site-admin role in the context. A Journal Manager's Section-editor row passes the first and fails the second: as the Section editor, the row's menu read "Edit", "Notify", "Remove", the window opened with both boxes, and "OK" posted `save-participant`, which answered 200 with the form redrawn and no message; the boxes were unchanged on reopening and in the manager's own read (live-probed 2026-09-20, all three apps).

<a id="fn-a10"></a>
**f-a10** — Note d: `AddParticipantForm::validate()` fails on the `userId` validator and `saveParticipant()` answers the failed form's HTML (`status: true`), which the legacy modal redraws without the validator's message; no toast, no inline error, no row (live-probed 2026-09-20, all three apps, with and without a message typed).

<a id="fn-a11"></a>
**f-a11** — Note e: on a `userGroupId` change `StageParticipantNotifyHandler.js` hides the two wrappers and `updateSubmissionMetadataEditPermitOption()` sets the `canChangeMetadata` box from the group's setting only when the next person is chosen in a group whose setting is on; a group whose setting is off leaves the box as the earlier pick left it. Live-probed 2026-09-20 on all three apps: a Section editor (OPS: Moderator) chosen, then a Funding coordinator or Author in the same window, arrived ticked; in the other order the Author and Funding coordinator picks arrived clear and the Section editor pick ticked again; a fresh window per pick arrived as the role's setting says.

<a id="fn-a12"></a>
**f-a12** — Note f: `AddParticipantForm::fetch()` passes `anonymousReviewerIds` as integers, JSON-encoded as numbers (`[66]`), and `maybeTriggerReviewerWarning()` compares them with the radio's value, the string `"66"`, so the membership test never matches. Live-probed 2026-09-20 on OJS and OMP: the window's script held the ids and the warning text, choosing the reviewer's row set the hidden `userIdSelected` to `66`, and no dialog, modal or sentence followed within 1.5 s on the stage entry and on the round entry, with a real click on the radio; "OK" assigned them. The declined reviewer, the Copyediting stage and an open-review journal (`review: {defaultReviewMode: 'open'}`, method 3) showed none, as designed. OPS has no review.

<a id="fn-a13"></a>
**f-a13** — Note p: `saveParticipant()` and `deleteParticipant()` log `SUBMISSION_LOG_ADD_PARTICIPANT` / `_REMOVE_PARTICIPANT` with the assignment's user as `userId`, and the Activity Log's "User" column prints that user: "Fay Funding | Fay Funding (…fund) was assigned to this submission as a Funding coordinator.", "Cal Copyeditor | Cal Copyeditor (…ce) was removed …", while "Notification sent to users." sat under "Mira Manager", the editor who acted (live-probed 2026-09-20, all three apps).

<a id="fn-ojs1"></a>
**f-ojs1** — OJS's `locale/en/emails.po` `emails.editorAssign.body`: "…please forward the submission to the review stage by selecting "Send to Review" and then assign reviewers by clicking "Add Reviewer"."; OMP's reads "Send to Internal Review". Live-probed 2026-09-20: Omar's assignment mail on the seeded journal carried the OJS sentence (`.reports/U35/ccK5/k5-state-ojs.json`), the press's mail its own; the Submission stage's buttons read "Send for Review" (OJS) and "Send to Internal Review", "Send to External Review" (OMP). OPS sends nothing (OPS3).

<a id="fn-omp1"></a>
**f-omp1** — Note a: `workflowConfigEditorialOMP.js::getSecondaryItems()` for `WORKFLOW_STAGE_ID_INTERNAL_REVIEW` returns `[]` when no `selectedReviewRound` is set (the stage entry) and the panel with one (the round entry); the OJS config's External Review branch mounts the panel on both. Live-probed 2026-09-20 on OMP: the skipped stage entry ("The Internal Review stage has not yet been initiated.") and the live one (headings "Status", "Revisions Uploaded", "Files for Review", "Reviewers", "Review Tasks & Discussions") without "Participants" or "Assign"; the round entry `workflow_2_<roundId>` with both; the External Review stage entry with the panel.

<a id="fn-ops1"></a>
**f-ops1** — `checkouts/ops/registry/userGroups.xml`: `<group roleId="0x00000010" stages="5,6" name="default.groups.name.manager" …>` against OJS's and OMP's manager group without a `stages` attribute; `getUserGroupsByStage()` reads `user_group_stage`. Seen 2026-09-04 (a `participants: [{role: 'manager'}]` seed listed on OPS's panel and "Assign" form; seed-facts) and 2026-09-19 (the preprint server's "Assign" form listing its three roles; *Copyediting stage* note k; *Production stage* Actors row "a preprint server's form lists its managers too") and live-probed 2026-09-20 ("Preprint Server manager", "Moderator", "Author" in that order; a manager chosen there listed as "Preprint Server manager" beside the seeded one, with the full menu; the manager group's window shows "Assignment privileges" alone).

<a id="fn-ops2"></a>
**f-ops2** — Note g: on OPS `StageParticipantGridHandler::fetchTemplateBody` for `EDITOR_ASSIGN_PRODUCTION` throws `Mailer::compileParams(): Argument #1 ($view) must be of type string, null given` (the probe server's log, HTTP 500) and `DISCUSSION_NOTIFICATION_PRODUCTION` compiles ("Please enter your message."); with "Message" left empty `execute()` sends nothing (note k). Live-probed 2026-09-20 on OPS's "Assign Participant" and "Notify": "Message" unchanged after the choice; "OK" answered "User added as a stage participant." alone, the Moderator's mailbox and Tasks panel empty, no discussion.

<a id="fn-ops3"></a>
**f-ops3** — Note n: `SubEditorsDAO::assignEditors()` mails `EditorAssigned` to the assignees of `WORKFLOW_STAGE_ID_SUBMISSION`; OPS's Moderator group holds stage 5 alone, so the list is empty, and `SubmissionNeedsEditor` is skipped because assignments exist. Live-probed 2026-09-20 on OPS's `publicknowledge`: two wizard submissions by `author.alex`, both listing Ana and Ravi as "Moderator", no mail with the title to either after 30 s (a Mailpit search for the title finding only the author's "Thank you for your submission to Public Knowledge Preprint Server"), the Activity Log listing only that email, Maya's mailbox without a "needs an editor" mail; "Moderator Assigned (Auto)" listed under Settings › Workflow › Emails ("This email is sent to a moderator when they are automatically assigned to a submission."). OJS and OMP mailed each assignee.

<a id="fn-ops4"></a>
**f-ops4** — Note n: `lib/pkp/classes/components/forms/context/CategoryForm.php` builds the `subEditors` group; on OPS's `publicknowledge` the "Edit Category" window of "Applied Science" rendered the heading and sentence with no option under them, on two reads (a 3 s settle on the second), while OJS's and OMP's listed every editor and assistant under role headings (live-probed 2026-09-20). The cause was not read.

## Reference — entry points & surfaces

| Entry | Path | Atom |
|-------|------|------|
| Participants panel on every stage entry of the editorial view | workflow → any stage → right column | VUE-043 |
| "Assign" (header button) → "Assign Participant" window | Participants panel → "Assign" | AFFW-466 · AFFW-671 · AFFW-672 · AFFW-676 |
| The window's role and person picker, radio rows, "Search" | "Assign Participant" → the list | GRID-055 · AFFW-679 · AFFW-680 |
| "Assignment privileges" and "Permissions" boxes; "No changes can be made…" | "Assign Participant" / "Edit Assignment" | AFFW-673 · AFFW-674 · AFFW-675 |
| "Edit" (row menu) → "Edit Assignment" | a row's "…" → "Edit" | AFFW-468 |
| "Notify" (row menu) → "Notify" window | a row's "…" → "Notify" | AFFW-469 · AFFW-677 · AFFW-678 |
| "Remove" (row menu) → "Remove Participant" dialog | a row's "…" → "Remove" | AFFW-471 · AFFW-472 |
| "Login As" (row menu); "Logout as {name}" list entry | a row's "…" → "Login As" | (owned with *Login and sessions*) |
| The legacy participants grid (unmounted rendering; its window ops serve the panel) | `$$$call$$$/grid/users/stage-participant/stage-participant-grid/*` | GRID-054 |
| "Editor Assigned (Auto)" email on automatic assignment | Mailpit; Settings › Workflow › Emails | MAIL-024 |
| Editor-assignment notices per stage (written, never shown) and the "needs an editor" task cleared by an assignment | none / the header Tasks panel | NOTIF-014 · NOTIF-016 · NOTIF-017 · NOTIF-018 · NOTIF-039 |
| "You have been assigned as an editor…" task (never raised, A1) | the header Tasks panel | NOTIF-046 |

## Reference — code anchors

- `lib/ui-library/src/managers/ParticipantManager/ParticipantManager.vue` · `participantManagerStore.js` · `useParticipantManagerConfig.js` · `useParticipantManagerActions.js` · `ParticipantManagerItemInfo{Name,Role,RecommendOnly}.vue` · `ParticipantManagerActionButton.vue`
- `lib/ui-library/src/composables/useCurrentUser.js` (`hasCurrentUserAtLeastOneAssignedRoleInStage()`, `canCurrentUserEditParticipant()`, `isUserLoggedInAs()`) · `useUserAuth.js` (`getDashboardLoginAsUrl()`, `getLogoutAsUrl()`)
- `lib/ui-library/src/pages/workflow/composables/useWorkflowConfig/workflowConfigEditorialOJS.js` · `workflowConfigEditorialOMP.js` · `workflowConfigEditorialOPS.js` · `useWorkflowConfigOPS.js` (the mounts)
- `lib/pkp/controllers/grid/users/stageParticipant/StageParticipantGridHandler.php` (`addParticipant`, `saveParticipant`, `deleteParticipant`, `viewNotify`, `sendNotification`, `fetchTemplateBody`, `fetchUserList`) · `StageParticipantGridRow.php` · `StageParticipantGridCellProvider.php` · `StageParticipantGridCategoryRow.php` · `linkAction/NotifyLinkAction.php`
- `lib/pkp/controllers/grid/users/stageParticipant/form/AddParticipantForm.php` · `PKPStageParticipantNotifyForm.php` · `lib/pkp/templates/controllers/grid/users/stageParticipant/addParticipantForm.tpl` · `form/notify.tpl` · `lib/pkp/js/controllers/grid/users/stageParticipant/form/{StageParticipantNotifyHandler,AddParticipantFormHandler}.js`
- `lib/pkp/controllers/grid/users/userSelect/UserSelectGridHandler.php` · `UserSelectGridCellProvider.php` · `lib/pkp/templates/controllers/grid/users/userSelect/{searchUserFilter,userSelectRadioButton}.tpl`
- `lib/pkp/api/v1/submissions/PKPSubmissionController.php::getParticipants()` · `lib/pkp/classes/user/Collector.php` (`assignedTo()`, `filterExcludeSubmissionStage()`) · `lib/pkp/classes/user/Repository.php` (`stageAssignmentsForUsers()`, `permissionMapForManager()`) · `lib/pkp/classes/user/maps/Schema.php` (`getPropertyCanLoginAs()`, `stageAssignments`)
- `lib/pkp/classes/stageAssignment/StageAssignment.php` · `Repository.php::build()` · `lib/pkp/classes/security/Validation.php` (`canEditParticipant()`, `getAdministrationLevel()`, `loggedInAs()`) · `lib/pkp/pages/login/LoginHandler.php` (`signInAsUser()`, `signOutAsUser()`)
- `lib/pkp/classes/context/SubEditorsDAO.php::assignEditors()` · `lib/pkp/classes/observers/listeners/{AssignEditors,RestrictAuthorAssignment,UpdateAuthorStageAssignments}.php` · `lib/pkp/classes/mail/mailables/EditorAssigned.php` · `registry/emailTemplates.xml` (`EDITOR_ASSIGN`) · `registry/taskTemplates.xml` (OJS, OMP, OPS)
- `lib/pkp/classes/notification/managerDelegate/EditorAssignmentNotificationManager.php` · `SubmissionNotificationManager.php` · `lib/pkp/classes/notification/PKPNotificationManager.php` (`getDecisionStageNotifications()`, `NOTIFICATION_TYPE_EDITOR_ASSIGN`) · `pages/workflow/WorkflowHandler.php::getEditorAssignmentNotificationTypeByStageId()` (OJS, OMP, OPS; uncalled)
- `lib/pkp/classes/editorialTask/Repository.php` (`removeParticipantFromSubmissionTasks()`, `isTemplateAccessibleToUser()`) · `lib/pkp/classes/editorialTask/Template.php::promote()`
- `lib/pkp/classes/submission/Repository.php::canEditPublication()` · `lib/pkp/classes/submission/maps/Schema.php` (`currentUserAssignedRoles`, `checkDecisionPermissions()`)
- `lib/pkp/controllers/grid/settings/roles/form/UserGroupForm.php` · `templates/controllers/grid/settings/roles/form/userGroupForm.tpl` · `registry/userGroups.xml` (OJS, OMP, OPS) · `templates/controllers/grid/settings/sections/form/sectionForm.tpl` (OJS, OPS) · `omp/templates/controllers/grid/settings/series/form/seriesForm.tpl` · `lib/pkp/classes/components/forms/context/CategoryForm.php`
- Locale: `lib/pkp/locale/en/{editor,submission,grid,user,common,notification,manager,default}.po`; app overrides in `locale/en/{emails,notification,default,manager}.po` (`emails.editorAssign.*`, `notification.type.submissionSubmitted`, `notification.type.editorAssignmentTask`, `default.groups.name.*`)
- App divergence points checked: no app subclasses the grid handler, the forms, the mailable or the notification delegates; OMP's editorial config adds the Internal Review mount; OPS's editorial config inherits the Production mount; the OPS manager group's `stages`; the three `taskTemplates.xml` rosters; the OPS wording of `mailable.editorAssigned.name` and `emails.editorAssign.*`
