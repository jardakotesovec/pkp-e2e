---
name: reader-comments-and-moderation
status: draft
---

# Reader comments & moderation {OJS}

> Conventions (markers, badges, footnotes): [Reading a spec](GLOSSARY.md#reading-a-spec).

## Purpose

Public comments let anyone with an account discuss a published article
under it. A signed-in visitor writes a comment on the article's landing
page; the comment waits, visible only to its writer, until a Journal Manager
approves it, and every approved comment is shown to all visitors, signed in
or not. Anyone signed in can report a comment they find objectionable. The
Journal Manager switches the feature on for the journal and moderates on
the journal's **Comments page** (the editorial side menu's Content ›
Comments): approves, hides and deletes comments, and reads and deletes
reports. The feature exists so that a journal can open a moderated
discussion under its articles without any comment reaching the public
before an editor has seen it. The spec is written for a journal and its
articles; the press and preprint-server words follow the glossary. <sup>a</sup>

A press and a preprint server do not install the reader-side half: the
monograph and preprint landing pages carry no "Comments on this
publication" section, no "Comments" block in the sidebar and no way to
write, report or read a comment through the screens. Both do install the
"Comments" tab of the Website settings and the Comments page, exactly as a
journal does (Rules 2, 3c and 10 to 17 hold there as written); with nothing
that writes comments, the Comments page on a press or a preprint server
lists "No Items" under every tab, and switching the setting on changes only
the side menu (Rule 3c). <sup>a</sup>

## Actors & permissions

**Moderator** in this spec means a Journal Manager or an Editor of the
journal (both manager-level roles) and, on a journal, the Site
Administrator; Rule 17 says how far a Site Administrator holding no manager
role in the journal gets in each app. **A signed-in visitor** is any account signed
in to the journal, whatever its roles: a Reader, an Author, a Reviewer, a
Section Editor and a Journal Manager all get the same offer on the landing
page. Every row below assumes the journal has public comments switched on
(Rule 2); with the setting off, the landing page offers nothing (Rule 2b).
<sup>a</sup>

| Action | Who may, and when |
|--------|--------------------|
| **Read the comments under an article** | • anyone, signed in or not, on a published article's landing page: the approved comments (Rule 6)<br>• the writer of a comment that is not approved, signed in: that comment as well, marked "Your comment will be visible when the editor approves it" (Rule 6); nobody else sees it, a moderator included <sup>e</sup> |
| **Write a comment** | • any signed-in visitor, on the article's latest published version only (Rule 4)<br>• a visitor who is not signed in is offered "Log in to comment" instead, which leads through the Login page back to the comments (Rule 4b) <sup>f</sup> |
| **Report a comment** | • any signed-in visitor, on another person's comment that is showing, through the comment's "…" menu (Rule 8); a moderator gets the same offer there and nothing more<br>• nobody on their own comment: its menu offers "Delete Comment" and no "Report" (Rule 7) <sup>g</sup> |
| **Delete a comment from the landing page** | • the comment's own writer, signed in, through the comment's "…" menu (Rule 9); the menu on anyone else's comment offers no "Delete Comment", and a moderator deletes other people's comments on the Comments page only (Rule 14) <sup>h</sup> |
| **Switch public comments on or off** | • a Journal Manager, an Editor whose role permits settings changes (the Roles screen's "Permit changes to Settings", ticked by default), and a Site Administrator working in the journal, on Settings › Website › Content › "Comments" (Rule 2) <sup>b</sup> |
| **Open the Comments page** | • a Journal Manager and an Editor, whether or not their role permits settings changes: the Content › Comments menu entry while the setting is on (Rule 3), and the page's address at any time (Rule 2b)<br>• a Site Administrator holding no manager role in the journal: on a journal the page opens; on a press or a preprint server the menu entry is offered but the address answers the access-denied page ⚠ [OMP1](#omp1) ⚠ [OPS1](#ops1) (Rule 17)<br>• a Section Editor, an Assistant, an Author, a Reviewer or a Reader: no menu entry, and the address answers the access-denied page<br>• a visitor who is not signed in: the address answers the Login page <sup>i</sup> <sup>m</sup> |
| **Approve, hide or delete a comment; view or delete a report** | • whoever can open the Comments page (the row above), on every comment of the journal, their own included (Rules 12 to 16) <sup>j</sup> |
| **Receive the moderation tasks** | • every Journal Manager and Editor of the journal, in the Tasks panel (Side effects); a Site Administrator holding no manager role in the journal gets none <sup>l</sup> |

## Fields & validation

**The landing page** (Rules 3 to 9). <sup>d</sup> <sup>f</sup> <sup>g</sup>

| Field (UI label) | Required? | Rules |
|------------------|-----------|-------|
| The comment box (no visible label; its placeholder reads "What do you think about this publication? Type your comments here.") | yes | Free text, no length limit. "Submit" stays grayed out while the box is empty or holds only spaces, and while a submit is in flight. The text is kept as typed; simple formatting tags typed into it (bold, a link) are kept and shown formatted, anything unsafe is stripped without a message (Rule 5) <sup>f</sup> |
| "Please tell us why you want to report this comment" (the "Report Comment" dialog) | yes | Free text. With the box empty or holding only spaces, "Submit" does nothing: the dialog stays open and no message appears ⚠ [A3](#a3) (Rule 8) <sup>g</sup> |

**The "Comments" tab** of Settings › Website › Content (Rule 2). <sup>b</sup>

| Field (UI label) | Required? | Rules |
|------------------|-----------|-------|
| "Comments" group: the box "Enable Public Comments" | no | Unticked on a fresh journal. "Save" is enabled whether or not the box changed and records it as it stands; "Saving" shows for a moment, then the whole page reloads on Appearance › Theme with no "Saved" [A5](#a5) (Rule 2a). Leaving the tab with an unsaved tick asks nothing: another tab of the same page keeps the tick, leaving the page drops it <sup>b</sup> |

**The Comments page** (Rules 10 to 16). <sup>i</sup> <sup>j</sup> <sup>k</sup>

| Field (UI label) | Required? | Rules |
|------------------|-----------|-------|
| The tabs "All", "Approved", "Hidden/Needs Approval", "Reported" | — | Which comments the table lists (Rule 10). The chosen tab is written into the page's address after "#" and comes back on reload <sup>i</sup> |
| The comments table: columns "Submission", "Comment", "User", "Status" and an unlabelled "…" ("More Actions") column | — | One row per comment, newest first, 25 per page (Settings bullet 2). "Submission" reads "{submission number}. {authors} ; {title}" (the authors part is the family names, a space on each side of the semicolon), "Comment" the comment's text cut to one line, "User" the writer's name, "Status" as Rule 10b. With nothing to list the table reads "No Items" <sup>i</sup> |
| The comment panel "View comment details by {writer}" | — | Opened by "View Comment" (Rule 12). Above the title the same submission line as the table's "Submission" cell; then "Comment preview" with the date and time, the text, the writer's name, their ORCID iD when they have one (verified: the iD as a link with a solid icon; not verified: a hollow icon and "{iD} (unauthenticated)" [A6](#a6)) and their affiliation; then the "Reports" table; on the right the approval note and the three buttons "Approve Comment", "Delete Comment", "Hide Comment" <sup>j</sup> |
| The "Reports" table inside the comment panel: columns "Reported By", "Reason", "Date Reported" and an unlabelled "…" column; described "This is the list of all the users who have reported this comment" | — | One row per report, newest first, 25 per page; with none, "No one has reported this comment yet" (Rule 15) <sup>k</sup> |
| The report panel "View report details by {reporter}" | — | Opened by "View Report" (Rule 15): "Report preview" with the date and time, the reason as typed, the reporter's name, ORCID iD and affiliation, and the button "Delete Report" <sup>k</sup> |

## Rules & state

1. **Where the feature lives.** Public comments are off on a fresh journal.
   Once on, the feature has three screens: the article's landing page,
   where comments are written and read (Rules 3 to 9); the Comments page,
   where moderators work (Rules 10 to 16); and the "Comments" tab of the
   Website settings, where the switch is (Rule 2). Nothing about comments
   appears on the workflow screen, on the submissions dashboard or in the
   activity log. <sup>a</sup>
2. **The switch.** <sup>b</sup>
   - 2a. **Switching on.** Settings › Website › the "Content" tab › the
     "Comments" side tab; tick "Enable Public Comments" and press "Save":
     "Saving" shows for a moment, then the whole Website Settings page
     reloads and lands on Appearance › Theme, and no "Saved" appears
     ⚠ [A5](#a5); reopen the "Content" tab's "Comments" side tab to see
     the box ticked. On
     that reload the editorial side menu of every moderator already
     carries the entry Content › Comments (Rule 3c), and from the next
     page load every published article's landing page carries the
     comments blocks (Rule 3).
   - 2b. **Switching off.** Untick the box and "Save" (the page reloads
     as in 2a). The landing pages
     lose both comments blocks at once, and the Content › Comments entry
     leaves the side menu. The Comments page still opens by its address
     ("…/management/settings/userComments" after the journal's address)
     and still lists every comment, which stay kept; switching on again
     shows them on the landing pages exactly as before ⚠ [A4](#a4).
3. **The two blocks on the landing page.** <sup>d</sup>
   - 3a. **The main block.** Under the article's abstract and details, a
     section headed "Comments on this publication" holds one collapsible
     part per published version, newest version first, headed
     "{version} ({number of comments})" — "Version of Record 1.0 (2)". The
     newest version's part is open when the page loads and the older ones
     are closed, and one part is open at a time: pressing a closed heading
     opens its part and closes the open one, pressing the open heading
     closes it. Inside a part: the
     comment box or its substitute (Rule 4), then the comments (Rule 6),
     then "Show more ({remaining})" when there are more (Rule 6c).
   - 3b. **The sidebar block.** In the column beside the article, a block
     headed "Comments" with the link "All Comments ({count})", which
     scrolls the page to the main block, and, for a visitor who is not
     signed in, the button "Log in to comment" (Rule 4b). The count is the
     number of approved comments over every version; it does not count the
     viewer's own unapproved ones and does not change while the page is
     open.
   - 3c. **The side-menu entry.** With the setting on, the editorial side
     menu shows a "Content" group with "Comments" in it: on a journal the
     group also holds "Issues", on a press "Catalog", and on a preprint
     server the group exists only while comments are on and holds
     "Comments" alone. The group shows for moderators only.
4. **Only the latest version takes comments.** <sup>f</sup>
   - 4a. A signed-in visitor sees the comment box and "Submit" in the
     newest version's part only. An older version's part shows, in place
     of the box, the notice "Discussion is closed on this version, please
     comment on the latest version above." with an alert icon; its
     comments stay readable and keep their "…" menus (Rule 7), so a report
     is still filed from there. Publishing a new version moves the box to
     the new version's part and closes the previous one this way, with its
     comments still under its own heading (the versions themselves are
     *[Publish, schedule & versions](U49-publish-schedule-and-versions.md)*'s).
     The blocks are the article's, not a version's: an older version's own
     page (its address names the version) shows the same parts, with the
     box under the newest version.
   - 4b. A visitor who is not signed in sees the button "Log in to
     comment" in the newest version's part (and in the sidebar block). It
     opens the journal's Login page; after signing in the browser returns
     to the same article at the comments' address, with the main block on
     screen part-way down the window (not at its top, where "All Comments"
     puts it), and the comment box is there.
5. **Writing a comment.** Type in the box and press "Submit". The box
   empties and the comment appears at the top of that version's comments
   with a help icon and the notice "Your comment will be visible when the
   editor approves it" above its date; the count in the version heading
   goes up by one (it counts the viewer's own unapproved comments), while
   the sidebar's "All Comments" count does not (Rule 3b). Nothing is sent
   to the writer, and no message announces the submit beyond the comment
   showing. The moderators are told (Side effects). <sup>f</sup>
6. **Who sees which comment.** <sup>e</sup>
   - 6a. **Three states, one word on screen.** A comment is *pending*
     (just written), *approved* (a moderator pressed "Approve Comment") or
     *hidden* (a moderator pressed "Hide Comment" on an approved one). The
     landing page and the Comments page both treat pending and hidden the
     same: the Comments page lists both under "Hidden/Needs Approval", and
     the landing page shows both to their writer alone with the same
     "Your comment will be visible when the editor approves it" notice, so
     a writer cannot tell a hidden comment from one not yet looked at
     ⚠ [A1](#a1).
   - 6b. **What each viewer gets.** Everyone, signed in or not, sees the
     approved comments of the article, newest first, each with its date
     and time, its text, the writer's name, the writer's ORCID iD when they
     have one (verified: the iD as a link with a solid icon; not verified:
     a hollow icon and the iD followed by "(unauthenticated)", a link that
     leads nowhere ⚠ [A6](#a6)) and the writer's affiliation. A signed-in visitor sees,
     in addition, their own pending and hidden comments on that article,
     each carrying the notice. Nobody else's unapproved comment is ever
     shown on the landing page, whatever the viewer's role. Comments on
     other articles never show, and the count in a version heading covers
     that version alone.
   - 6c. **Show more.** A version's part loads 25 comments (Settings
     bullet 2) and offers "Show more ({remaining})" below them; each press
     appends the next 25 to the list. The button is absent once every
     comment is listed.
7. **The "…" menu on a comment.** Each comment's header carries a "…"
   button for signed-in visitors only; a visitor who is not signed in gets
   no button. The button has no name a screen reader can read out, unlike
   the Comments page's row menu "More Actions" ⚠ [A7](#a7). On another
   person's comment the menu offers "Report" alone;
   on the viewer's own comment it offers "Delete Comment" alone. A
   moderator gets exactly the same menus on the landing page (Actors). <sup>g</sup>
8. **Reporting.** "Report" opens the dialog "Report Comment": the line
   "Report the following comment by {writer} ({affiliation})" (without the
   parenthesis when the writer has no affiliation), the comment's text, the
   box "Please tell us why you want to report this comment", and the
   buttons "Submit" and "Cancel". "Submit" with a reason closes the dialog;
   nothing on the page confirms the report, the comment looks as before,
   and its menu offers "Report" again, so the same person can report the
   same comment a second time, which files a second report ⚠ [A3](#a3).
   The report is visible only on the Comments page (Rule 15); the comment
   stays showing. The moderators are told (Side effects). <sup>g</sup>
9. **Deleting one's own comment.** "Delete Comment" opens the dialog
   "Delete Comment": "Are you sure you want to delete the following
   comment?" with the comment's text in bold under it, and the buttons
   "Delete" and "Cancel". "Delete" removes the comment from the list at
   once; the count in the version heading changes on the next page load.
   The comment is gone from the Comments page too, with every report made
   against it and the moderators' tasks about it (Side effects). <sup>h</sup>
10. **The Comments page.** Content › Comments in the editorial side menu,
    or its address (Rule 2b). The page is headed "Comments" and holds four
    tabs over one table (Fields). <sup>i</sup>
    - 10a. **The tabs.** "All" lists every comment of the journal;
      "Approved" the approved ones; "Hidden/Needs Approval" the pending and
      hidden ones; "Reported" every comment with at least one report,
      approved or not. Each tab keeps the page number it was last on while
      the page stays open, so coming back to a tab lands on the page it
      was left at. Comments of other journals never appear.
    - 10b. **The "Status" cell.** Under "All" it reads "Approved" or
      "Hidden/Needs Approval", followed by ", Reported" when the comment
      has a report. Under any other tab every row reads that tab's own
      word.
    - 10c. **Order and paging.** Newest first, 25 rows per page, with the
      page links under the table beyond 25 (Settings bullet 2).
11. **The "…" menu on a row.** Every row's "…" ("More Actions") menu
    offers "View Comment", which opens the comment panel (Rule 12), and
    "Delete Comment" (Rule 14). <sup>i</sup>
12. **The comment panel.** "View Comment" opens the panel described in
    Fields over the page and writes the comment's number into the page's
    address, so the address can be shared: opening it lands on the
    Comments page with that panel open (Rule 16). A number no comment has
    (a deleted comment's, for instance) opens the page on "All" under the
    dialog "Error" reading "The requested resource was not found." with
    "OK". Closing the panel drops the number from the address and reloads
    the table. The right-hand note
    reads "Approving this comment will make it visible to all users on the
    site" while the comment is pending or hidden, and "This comment was
    approved on {date} by {moderator}." once it is approved. <sup>j</sup>
13. **Approve and Hide.** "Approve Comment" is the panel's highlighted
    button while the comment is pending or hidden and grayed out once it is
    approved; "Hide Comment" is grayed out until the comment is approved.
    Pressing either shows the notice "The comment has been updated
    successfully." at the top right, closes the panel and reloads the
    table: an approved comment leaves the "Hidden/Needs Approval" tab for
    "Approved", a hidden one the reverse. Approving makes the comment show
    to every visitor from their next page load (Rule 6b); hiding takes it
    off the landing page for everyone but its writer (Rule 6a). Hiding
    keeps the comment's reports; approving a comment again after a hide
    rewrites the note with the new date and moderator. Neither press tells
    the writer anything, and neither clears the moderators' task about the
    comment ⚠ [A2](#a2). <sup>j</sup>
14. **Deleting a comment as a moderator.** "Delete Comment", from the
    row's menu or the panel, opens the dialog "Delete Comment": "Are you
    sure you want to delete this comment? This action cannot be undone."
    with "Delete" and "Cancel". "Delete" shows "The comment has been
    deleted successfully.", closes the panel when it was open, and reloads
    the table without the row. The comment leaves the landing page, its
    reports go with it, and so do the tasks about it and them (Side
    effects). The writer is not told. <sup>j</sup>
15. **Reports.** The comment panel's "Reports" table lists the comment's
    reports (Fields). A row's "…" menu offers "View Report", which opens
    the report panel over the comment panel and writes the report's number
    into the address as well, and "Delete Report". Closing the report
    panel, or deleting the report from it, drops both numbers from the
    address, the comment's included, although the comment panel stays open
    ⚠ [A8](#a8); the comment panel's own "Close" then reloads the table
    (Rule 12). "Delete Report", from
    the row or from the report panel, opens the dialog "Delete Report":
    "Are you sure you want to delete this report? This action cannot be
    undone." with "Delete" and "Cancel"; "Delete" shows "The report has
    been deleted successfully.", closes the report panel when it was open
    and reloads the reports table. Deleting a comment's last report takes
    the comment off the "Reported" tab; deleting reports never changes
    whether the comment is approved. The reporter is not told. <sup>k</sup>
16. **Arriving from a task.** Pressing a comment task in the Tasks panel
    opens the Comments page with that comment's panel already open;
    pressing a report task opens the page with the comment panel and the
    report panel on top of it. <sup>l</sup>
17. **A Site Administrator's reach.** On a journal, a Site Administrator
    who holds no manager role in the journal (a Section Editor's role,
    say) opens the Comments page, works its panels and changes the
    "Comments" setting like a Journal Manager; with Reader as their only
    journal role the page opens with its rows under an "Error" dialog
    reading "The current role does not have access to this operation."
    ⚠ [A9](#a9). On a press and on a preprint server the same person is
    offered the Content › Comments entry in the side menu, but the entry
    and the page's address answer the access-denied page ("The current
    role does not have access to this operation.") ⚠ [OMP1](#omp1)
    ⚠ [OPS1](#ops1), and so does Settings › Website; the Site
    Administrator enrolled as a Press Manager or Preprint Server Manager
    is a manager there and gets in. <sup>m</sup>
18. **When the article or the account goes.** Deleting a submission (a
    published article is unpublished, declined on its Submission stage and
    deleted there: *[Submission stage](U25-submission-stage.md)*'s "Delete")
    deletes its comments and their reports. Merging a user account into
    another (Users & Roles › Users › the row's "Merge user") deletes the
    comments and the reports the merged account wrote; "Remove User" on
    the same row only ends the person's roles in the journal and keeps
    their comments and reports listed. In both cases every moderator's
    tasks about the deleted comments stay in the Tasks panel, blank and
    dead ⚠ [A10](#a10). Unpublishing a version keeps its comments on the
    Comments page and takes them off the landing page with the version;
    with no published version left, the article's page itself answers
    "404 Not Found" to everyone, the writer included. A version published
    again shows its comments again: the approved ones to every visitor, a
    pending one to its writer. <sup>o</sup>

## Side effects

- **A task for each moderator on every new comment.** Writing a comment
  (Rule 5) raises, for every Journal Manager and Editor of the journal, an
  unread row in the Tasks panel reading "A comment has been submitted and
  is pending review by a moderator." with the comment's text under it
  where a task normally shows the submission's title, cut to its first 200
  characters and "..." when it is longer. Pressing the row opens the
  Comments page with the comment's panel (Rule 16). No email accompanies
  it, and no row on the Profile's Notifications tab governs it: the task
  cannot be switched off. A Site Administrator holding no manager role in
  the journal gets no row. <sup>l</sup>
- **A task for each moderator on every report.** Reporting a comment
  (Rule 8) raises the same way a row reading "A report was submitted for a
  comment and requires review by a moderator." with the reason under it,
  cut the same way; pressing it opens the comment panel with the report
  panel on top (Rule 16). No email, no Notifications-tab row. <sup>l</sup>
- **Deleting clears the tasks; approving and hiding do not.** Deleting a
  comment, by its writer or by a moderator, deletes every moderator's tasks
  about that comment and about its reports; deleting a report deletes the
  tasks about that report. A comment that goes with its submission or with
  its writer's account leaves its tasks behind [A10](#a10) (Rule 18).
  Approving or hiding a comment leaves the
  "pending review" task in every moderator's panel until each deletes it
  by hand ⚠ [A2](#a2). <sup>l</sup>
- **Nothing to the writer or the reporter.** No email, task or on-screen
  message reaches the writer when their comment is approved, hidden or
  deleted, or the reporter when a report is acted on. <sup>l</sup>
- **No activity log entry.** Comments, reports and moderation leave no
  line in the submission's activity log. <sup>a</sup>

## Settings that modify behavior

- **"Enable Public Comments"** — Settings › Website › the "Content" tab ›
  the "Comments" side tab; unticked on a fresh journal, press or preprint
  server. Ticked: the landing page carries the two comments blocks
  (Rule 3) and the side menu the Content › Comments entry (Rule 3c).
  Unticked: no comments block on any landing page and no menu entry; the
  Comments page still answers its address and keeps every comment
  (Rule 2b). <sup>b</sup>
- **"Items per page"** — Settings › Website › the "Setup" tab › the
  "Lists" side tab; 25 on a fresh journal. Sets how many comments a
  version's part shows before "Show more" (Rule 6c), how many rows the
  Comments page shows per page (Rule 10c) and how many reports the
  "Reports" table shows per page (Fields); the setting belongs to the
  Website settings and is only read here. <sup>i</sup>

## Cross-feature interactions

- **The Tasks panel** — the moderators' tasks are rows in the panel
  described by *[Notifications center & email preferences](U05-notifications-center-and-email-preferences.md)*;
  this spec owns only the two task sentences, who gets them and what
  pressing them opens (Side effects, Rule 16). <sup>p</sup>
- **The article landing page** — the page the blocks sit on is *Article
  landing page & reading*'s (spec not yet written); this spec owns the two
  blocks (Rule 3) and everything inside them. <sup>p</sup>
- **Versions** — creating and publishing a new version, which moves the
  comment box (Rule 4a), is
  *[Publish, schedule & versions](U49-publish-schedule-and-versions.md)*'s. <sup>p</sup>
- **The writer's name, ORCID iD and affiliation** shown with a comment are
  the account's own, from *[User profile](U03-user-profile.md)* and
  *[ORCID integration](U04-orcid-integration.md)*; a comment shows whatever
  the profile holds at the moment the page loads. <sup>e</sup>
- **The Website settings screen** the "Comments" tab sits in, and its
  "Lists" tab, belong to *Journal identity & about pages* and *Appearance
  & theming* (specs not yet written); this spec owns the one tab. <sup>p</sup>
- **"Permit changes to Settings"** on a role, which gates the settings tab
  but not the Comments page (Actors rows 5 and 6), is *Users management*'s
  (spec not yet written). <sup>p</sup>

## Canonical scenarios

Every scenario runs on a scratch journal with throwaway accounts (the
seeded journal keeps public comments off and has no published article);
each scenario's accounts, seeding and the mail catcher's address are in its
footnote. <sup>s0</sup>

## Coverage

<!-- Draft table (RUNBOOK steps 3 to 5). One row per Actors row, per state of the
     comment and per setting end; classed by TEMPLATE's four tests. -->

| Who, state or setting | Class | Runs in | Why not |
|-----------------------|-------|---------|---------|
| A signed-in Reader writes a comment on the latest version and sees it with the pending notice (Actors row 2, Rule 5) | main | planned | |
| A moderator approves the comment on the Comments page; it shows to a visitor who is not signed in (Actors row 6, Rules 12, 13, 6b) | main | planned | |
| A signed-in visitor reports another person's comment; the report is listed in the comment panel (Actors row 3, Rules 8, 15) | main | planned | |
| A moderator hides an approved comment; it leaves the landing page for everyone but its writer (Rules 13, 6a) | main | planned | |
| A moderator deletes a comment from the row menu and from the panel (Actors row 4, Rule 14) | main | planned | |
| A moderator deletes a report from the row and from the report panel (Rule 15) | main | planned | |
| The Journal Manager switches "Enable Public Comments" on and off; the result read on the reloaded page, never a "Saved" (Actors row 5, Rule 2, A5) | main | planned | |
| A visitor who is not signed in sees approved comments only, no "…" menu, and "Log in to comment" in both blocks (Actors row 1, Rules 6b, 7, 4b) | guard | planned | |
| Another signed-in visitor, a moderator included, does not see a pending or hidden comment on the landing page (Rule 6b) | guard | planned | |
| The comment's own menu offers "Delete Comment" and no "Report"; another person's offers "Report" and no "Delete Comment" (Rule 7) | guard | planned | |
| The writer deletes their own comment; it is gone from the Comments page with its report (Actors row 4, Rule 9) | guard | planned | |
| Each moderator's Tasks panel gains the "pending review" row on a comment and the "requires review" row on a report; pressing each opens the right panel (Side effects, Rule 16) | guard | planned | |
| Deleting the comment removes the moderators' tasks about it and its report (Side effects) | guard | planned | |
| No email reaches the writer, the reporter or the moderators at any step (Side effects) | guard | planned | |
| A Section Editor, an Author and a Reader get the access-denied page at the Comments page's address and no Content › Comments entry (Actors row 6) | guard | planned | |
| "Enable Public Comments" off: no blocks on the landing page, no menu entry, the Comments page still open by address with the comments kept (Rule 2b, Settings bullet 1) | guard | planned | |
| On a press and a preprint server: no comments block on the monograph or preprint landing page, the "Comments" settings tab present, the Comments page reading "No Items" (the absence paragraph) | guard | planned | |
| Comments of another journal are absent from the landing page's list and from the Comments page (Rules 6b, 10a) | guard | planned | |
| Comment on an older version closed with "Discussion is closed on this version…" after a new version is published; its comments still listed under its heading with their "…" menus, one part open at a time (Rules 3a, 4a) | state | planned | |
| The four tabs and the "Status" cell wording: "Approved", "Hidden/Needs Approval", ", Reported" (Rule 10) | state | planned | |
| The comment panel's approval note before and after approval, "Approve Comment" and "Hide Comment" grayed out in turn (Rules 12, 13) | state | planned | |
| A comment with no reports: "No one has reported this comment yet" (Fields) | state | planned | |
| A second report on the same comment from the same person (Rule 8) | state | | Register carries it |
| "Show more ({remaining})" after 25 comments on one version, and the Comments page's second page after 25 rows (Rule 6c, 10c) | state | planned | |
| A comment writer with an ORCID iD and an affiliation: the iD link and the affiliation shown under the comment and in the panel (Rule 6b, Fields) | state | planned | |
| The Site Administrator holding no manager role in the journal on the Comments page: opens on a journal, refused on a press and a preprint server (Rule 17) | state | | Register carries it |
| The Site Administrator with Reader as the only journal role: the "Error" dialog over the Comments page on a journal (Rule 17) | state | | Register carries it |
| An Editor whose role does not permit settings changes is refused the "Comments" tab and still opens the Comments page (Actors rows 5, 6) {OJS OMP} | state | planned | OPS: no second manager-level role to untick |
| Deleting the submission deletes its comments and their reports; the moderators' tasks about them stay behind (Rule 18) | state | planned | |
| Merging the writer's account away deletes their comments and reports; "Remove User" keeps them (Rule 18) | state | planned | |
| The article's only version unpublished: its page answers "404 Not Found", the Comments page keeps the comments, published again they show (Rule 18) | state | planned | |
| A shared address, or a task link, naming a comment that no longer exists: the "Error" dialog "The requested resource was not found." over "All" (Rules 12, 18) | state | planned | |
| "Items per page" at another value (Settings bullet 2) | variant | | Nothing new to test |
| "Cancel" on the report, delete-comment and delete-report dialogs (Rules 8, 9, 14, 15) | variant | | Nothing new to test |
| The shared address with a comment number opened directly (Rule 12) | variant | | Nothing new to test |
| An older version's own page showing the article's blocks (Rule 4a) | variant | | Nothing new to test |
| An Editor (manager-level) as the moderator, or at the switch, instead of the Journal Manager (Actors) | variant | | Nothing new to test |
| Closing the report panel clears both numbers from the address (Rule 15) | variant | | Register carries it |
| The comment's "…" button without a name for a screen reader (Rule 7) | variant | | Register carries it |

## Findings register

Verdicts are the author's judgment (claude, 2026-09-16), unreviewed unless
an entry notes otherwise; the team settles them on spec review. The
summary is sorted 🐞 → ❓ → ✅ and the entries below are the source; badges,
Impact and Basis: [Reading a spec](GLOSSARY.md#reading-a-spec).

| ID | Finding (one line, symptom) | Bug? | Impact | Review |
|----|------------------------------|------|--------|--------|
| [A6](#a6) | The unverified ORCID iD under a comment and in the comment panel links to a broken address | 🐞 | minor | — |
| [A10](#a10) | A comment deleted with its submission or its writer's account leaves its moderation tasks behind, blank and dead | 🐞 | minor | — |
| [A1](#a1) | A hidden comment reads to its writer exactly like one awaiting approval | ❓ | minor | — |
| [A2](#a2) | Approving or hiding a comment leaves every moderator's "pending review" task in place | ❓ | minor | — |
| [A3](#a3) | The report dialog neither refuses an empty reason with a message nor confirms a filed report, and the same person can report the same comment again | ❓ | minor | — |
| [A4](#a4) | With public comments switched off, the Comments page still opens by address and lists the kept comments | ❓ | minor | — |
| [A5](#a5) | The Comments tab's "Save" reloads the Website Settings page on Appearance › Theme instead of confirming in place | ❓ | minor | — |
| [A7](#a7) | The comment's "…" button has no name for a screen reader | ❓ | minor | — |
| [A8](#a8) | Closing the report panel wipes the open comment's number from the address too | ❓ | minor | — |
| [A9](#a9) | A Site Administrator whose only journal role is Reader gets the Comments page under an "Error" dialog | ❓ | minor | — |
| [OMP1](#omp1) | On a press, a Site Administrator holding no manager role is offered Content › Comments but the page answers the access-denied page | ❓ | minor | — |
| [OPS1](#ops1) | On a preprint server, a Site Administrator holding no manager role is offered Content › Comments but the page answers the access-denied page | ❓ | minor | — |

### All apps

<a id="a1"></a>
**A1 — A hidden comment looks like a pending one** · ❓ · minor.
A writer whose approved comment a moderator has hidden sees it again with
"Your comment will be visible when the editor approves it", the notice a
fresh comment carries, and no word says it was taken down. Expected either
a distinct notice or nothing; observed the pending notice.
Question: is a hidden comment meant to read as "awaiting approval" to its
writer? Lean: intended; moderation is deliberately silent towards the
writer, and one notice keeps the screen simple. Basis: test run. <sup>f-a1</sup>

<a id="a2"></a>
**A2 — The moderation task outlives the moderation** · ❓ · minor.
A moderator who approves or hides a comment from the Comments page keeps
the "A comment has been submitted and is pending review by a moderator."
row in their Tasks panel, and so does every other moderator, until each
deletes it by hand; only deleting the comment clears it. Expected the task
to clear when the comment is acted on, as other tasks clear with their
action; observed it stays.
Question: should approving or hiding a comment clear the task for every
moderator? Lean: oversight; the delete path already clears the tasks, the
approve path does not. Basis: test run. <sup>f-a2</sup>

<a id="a3"></a>
**A3 — Reporting gives no feedback** · ❓ · minor.
In the "Report Comment" dialog, "Submit" with an empty reason does nothing
and shows no message; after a filed report the dialog closes with no
confirmation, the comment looks unchanged and "Report" is offered again,
so a second press files a second report by the same person. Expected a
"required" message and a confirmation or a changed menu; observed silence.
Question: is a silent, repeatable report intended? Lean: oversight; every
other dialog in the application names a missing required field. Basis:
test run. <sup>f-a3</sup>

<a id="a4"></a>
**A4 — The Comments page outlives the setting** · ❓ · minor.
With "Enable Public Comments" unticked the side menu drops Content ›
Comments, yet the page's address still opens the full Comments page with
every comment listed and every action working. Expected either the page
to follow the setting or the menu entry to stay; observed the entry gone
and the page open.
Question: is the page meant to stay reachable while the feature is off?
Lean: intended; the comments are kept for a later switch-on and a manager
may want to moderate them meanwhile. Basis: test run. <sup>f-a4</sup>

<a id="a5"></a>
**A5 — The Comments tab's "Save" reloads the page instead of confirming in place** · ❓ · minor.
Pressing "Save" on the "Comments" tab shows "Saving" for a moment, then
the whole Website Settings page reloads and lands on its Appearance ›
Theme tab; "Saved" never appears and the box is off screen, so the
manager reopens the "Content" tab's "Comments" side tab to see the tick
kept. The other tabs
of the same page (Setup › Information, Setup › Lists) show "Saving" then
"Saved" in place and stay where they are. Expected the same in-place
"Saved"; observed the reload.
Question: is the reload meant, so that the side menu's Content › Comments
entry follows at once, or an oversight? Lean: oversight; landing on
another tab with no confirmation reads as an accident, and the menu could
follow on the next page load as the landing pages do. Basis: test run.
<sup>f-a5</sup>

<a id="a6"></a>
**A6 — The unverified ORCID iD under a comment links to a broken address** · 🐞 · minor.
Under a comment on the landing page and in the comment panel, a writer
whose ORCID iD is not verified is shown a hollow icon and a link reading
"{iD} (unauthenticated)"; the link's address is that same text, suffix
included, so pressing it does not open the iD's ORCID page. A verified
writer's link reads the bare iD and opens it. Expected the link to lead
to the iD in both cases; observed a dead link for the unverified one.
Basis: test run. <sup>f-a6</sup>

<a id="a7"></a>
**A7 — The comment's "…" button has no name for a screen reader** · ❓ · minor.
The "…" button on a landing-page comment is an image inside a button with
no name a screen reader can read out; the Comments page's row menu, the
same kind of control, reads "More Actions". Expected a name; observed
none.
Question: is the icon-only button meant to ship without a name? Lean:
oversight; the same control elsewhere is named. Basis: test run.
<sup>f-a7</sup>

<a id="a8"></a>
**A8 — Closing the report panel wipes the open comment from the address** · ❓ · minor.
With the comment panel and the report panel open, closing the report panel
("Close", or deleting the report from it) drops both numbers from the
page's address although the comment panel stays open, so the address no
longer names the comment on screen until that panel is closed too.
Expected the comment's number to stay while its panel is open, as it does
when the comment panel is opened on its own; observed both numbers gone.
Question: is that intended? Lean: oversight; the address is meant to be
shareable and briefly names nothing that is open. Basis: test run.
<sup>f-a8</sup>

<a id="a9"></a>
**A9 — A Site Administrator with only a Reader role gets the Comments page under an error dialog** · ❓ · minor.
On a journal, a Site Administrator whose only role in the journal is
Reader opens the Comments page by its address with its rows listed, but
an "Error" dialog reading "The current role does not have access to this
operation." with "OK" covers it; Settings › Website shows the same dialog.
A press and a preprint server refuse the page outright in that state.
Expected the page either open or refused; observed both at once.
Question: is the dialog this page's, or the editorial dashboard's, which
such an account cannot open? Lean: the dashboard's, since it covers
Settings › Website too; the same account on Settings › Journal would
settle it. Basis: test run. <sup>f-a9</sup>

<a id="a10"></a>
**A10 — A comment deleted with its submission or its writer's account leaves its tasks behind** · 🐞 · minor.
After a submission carrying comments is deleted, or a writer's account is
merged away, every moderator's Tasks panel keeps the "A comment has been
submitted and is pending review by a moderator." and "A report was
submitted for a comment and requires review by a moderator." rows about
those comments, with an empty line where the comment's text was. Pressing
a comment's row opens the Comments page under "Error" / "The requested
resource was not found."; pressing a report's opens the page with no
panel. Expected the rows to go with the comment, as they do when the
comment is deleted on its own; observed they stay, blank and dead.
Basis: test run. <sup>f-a10</sup>

### OMP

<a id="omp1"></a>
**OMP1 — Content › Comments offered to a Site Administrator the page refuses** · ❓ · minor.
On a press with public comments on, a Site Administrator who holds no
manager role on the press sees Content › Comments in the side menu;
pressing it lands on the access-denied page, and so does the page's
address. On a journal the same person opens the page. Expected the menu
and the page to agree; observed the offer without the access.
Question: should a Site Administrator without a manager role moderate
comments, as on a journal, or should the menu entry not be offered? Lean:
oversight; the journal lets the Site Administrator in and the press's
menu code is the journal's. Basis: test run. <sup>f-omp1</sup>

### OPS

<a id="ops1"></a>
**OPS1 — Content › Comments offered to a Site Administrator the page refuses** · ❓ · minor.
On a preprint server with public comments on, a Site Administrator who
holds no manager role on the server sees the "Content" group with
"Comments" as its only entry in the side menu; pressing it lands on the
access-denied page, and so does the page's address. On a journal the same
person opens the page. Expected the menu and the page to agree; observed
the offer without the access.
Question: as OMP1, for the preprint server. Lean: oversight, as OMP1.
Basis: test run. <sup>f-ops1</sup>

---

<a id="footnotes"></a>
## Footnotes — mechanism & evidence

<a id="fn-a"></a>
**a — reachability per app, and the badge.** Read at the 2026-09-15 tips
(ojs `ae597ff9d9`, omp `0ec98a508`, ops `9ce633ee1d`, all on pkp-lib
`b262d27b81`) and live-probed 2026-09-16 on scratch contexts of the three
apps at those tips; the code below is the mechanism behind what the
screens showed. Three surfaces:
(1) the settings form `PKP\components\forms\context\ContentCommentsForm`
(`FORM_CONTENT_COMMENT`, one `FieldOptions` checkbox `enablePublicComments`,
label `manager.userComment.comments` "Comments", option
`manager.userComment.enableComments` "Enable Public Comments"), mounted by
`lib/pkp/templates/management/website.tpl` under the top tab
`navigation.content` "Content" › side tab id `publicComments`, built in
`PKP\pages\management\ManagementHandler::website()` for all three apps
(no app override of `website()` touches it: OJS/OMP/OPS `SettingsHandler`
only add role assignments and other tabs); (2) the moderation page
`ManagementHandler::userComments()` → `management/userComments.tpl` →
`<user-comments-page>` (`lib/ui-library/src/pages/userComments/UserCommentsPage.vue`,
registered in `lib/pkp/js/load.js`), reached through the `settings` op with
arg `userComments` (`ManagementHandler::settings()` switch), in all three
apps; (3) the reader block: `ojs/pages/article/ArticleHandler::view()`
builds `PKP\components\UserCommentComponent` when
`$context->getData('enablePublicComments')` and
`ojs/templates/frontend/objects/article_details.tpl` mounts
`<pkp-comments>` inside `{if $enablePublicComments}` (main block
`#public-comments`, heading `userComment.commentsOnThisPublication`) and
`<pkp-scroll-to-comments>` in the sidebar (heading `userComment.comments`).
No OMP or OPS handler or frontend template names `UserCommentComponent`,
`enablePublicComments` or `pkp-comments` (grep of `omp/` and `ops/` outside
`lib/`, 2026-09-16), so the reader side is OJS-only and the title carries
`{OJS}`; the absence paragraph states the two shared surfaces the press and
the server keep. The install default is `enablePublicComments: false`
(`lib/pkp/schemas/context.json`). No activity-log call exists anywhere in
`lib/pkp/api/v1/comments/UserCommentController.php` or
`lib/pkp/classes/userComment/`. The upstream Cypress test
`lib/pkp/cypress/tests/integration/publicComments/PublicComments.cy.js`
returns early unless the app's default genre is "Article Text", i.e. it
runs on OJS only, which matches the reading. Live-probed 2026-09-16 (the
absence paragraph, Rule 1): on a press and a preprint server with "Enable
Public Comments" ticked, a published monograph's and a posted preprint's
landing pages, signed out and as a Reader, an Author, a Section Editor,
an Assistant and the manager, carried no block headed "Comments" or
"Comments on this publication" and no "Log in to comment"; the manager's
Content › Comments opened the page headed "Comments" with "No Items" under
each of the four tabs. On the three apps the submissions dashboard, the
workflow screen and the "Activity Log & Notes" window (on a journal after
a comment, an approval, a report, a hide, a report deletion and two
deletions) carried no line about comments.

<a id="fn-b"></a>
**b — the switch.** `ContentCommentsForm` PUTs to the context API
(`$contextApiUrl`); the form shows "Saving" and then, unlike the other
Website tabs, the browser navigates to the same address again right after
the save request and the page opens on its first tab (A5). Access to the
tab: `ManagementHandler::authorize()` adds
`CanAccessSettingsPolicy` to every `settings` op except the `announcements`
and `userComments` args (the comment in the code: "moved out of settings
without changing their URL"); the policy permits a site admin group or a
manager group with `permitSettings` (Roles screen string
`settings.roles.permitSettings` "Permit changes to Settings"). So the
Comments page is open to a manager without settings permission while the
"Comments" tab is not. Live-probed 2026-09-16 (Rule 2, Fields, Actors
rows 5 and 6, A5) on a journal, a press and a preprint server: "Save",
enabled with nothing changed, posted the box's value; "Saving" showed for
a beat, the whole page reloaded at the same address (still ending
"#publicComments") and landed on Appearance › Theme with the box off
screen and no "Saved" within 6 s; the Setup › Information (journal,
press) and Setup › Lists (server) forms, the control, showed "Saving" then
"Saved" in place. The side menu read "Content › Comments" on that reload
and lost it the same way after an untick; the landing page's blocks and
the page by address behaved as Rules 2a and 2b say, the comments written
before still listed after the untick. Leaving the tab ticked and unsaved
raised no dialog: switching to Appearance and back kept the tick, leaving
to the dashboard lost it. Roles screen: the manager row ("Journal
manager" / "Press manager" / "Preprint Server manager") offers no "Edit";
"Permit changes to Settings" was unticked on the "Journal editor" /
"Press editor" role (ticked by default), after which that role's holder
was refused Settings › Website with the access-denied page, had no
"Settings" group in the side menu and still had "Content › Comments" and
opened the Comments page; re-ticked, the tab returned. A preprint server
has no second manager-level role to edit, so that state was not reached
there. With the permission on, the Editor opened the tab and saved it.

<a id="fn-d"></a>
**d — the two blocks and the side menu.** `UserCommentComponent::getConfig()`
passes `publications` (the submission's `getPublishedPublications()` in
reverse order, each `{id, version: versionString}`), `latestPublicationId`
(`getCurrentPublication()`), `itemsPerPage` (`Repo::userComment()->getPerPage()`
= the context's `itemsPerPage`), `loginUrl` (the `login` page with
`source` = the request path + `#public-comments`), `allCommentsCount`
(approved comments over the published publications only) and
`commentsCountPerPublication` (approved plus the signed-in user's own,
approved or not). `PkpComments.vue` renders a `PkpAccordionRoot` whose
`default-value` is the first publication (the newest), one
`PkpAccordionItem` per publication headed `store.getVersionLabel()` =
`userComment.versionWithCount` "{$versionLabel} ({$versionCommentsCount})",
`versionString` being "Version of Record 1.0"-style
(`publication.versionStage.versionOfRecord`, `Publication` DAO). Inside:
`PkpCommentsLogInto` (signed out and latest), `PkpCommentsNotificationNotLatest`
(`userComment.discussionClosed` with the `Error` icon, on every
non-latest part), `PkpCommentsNew` (signed in and latest), the messages,
`PkpCommentsShowMore`. The sidebar `PkpScrollToComments` holds
`PkpScrollToCommentsAllComments` (an `<a href="#public-comments">` reading
`userComment.allComments` "All Comments ({$commentCount})" from
`allCommentsCount`, never refreshed) and `PkpScrollToCommentsLogInto`
(signed out). Side menu: each app's `classes/template/TemplateManager.php`
(`setupBackendPage`) adds a `content` menu group for manager or site-admin
roles; the `userComments` entry (`manager.userComment.comments`
"Comments", url `management/settings/userComments`) only when
`enablePublicComments` is set; OJS's group always holds `issues`, OMP's
`catalog`, and OPS builds the group only inside the `enablePublicComments`
branch ("The only submenu item for Content menu in OPS is User Comments").
Live-probed 2026-09-16 (Rule 3) on a journal with two published versions:
signed out, the main block headed "Comments on this publication" with the
parts "Version of Record 1.1 (0)" open and "Version of Record 1.0 (2)"
closed; pressing the older heading opened it and closed the newest,
pressing an open heading closed it; the sidebar block headed "Comments"
with "All Comments (3)" and, signed out, "Log in to comment"; the link put
the main block at the top of the window; the older part carried
"Discussion is closed on this version, please comment on the latest
version above." with an icon and no box; publishing 1.1 through "Create
New Version" and "Publish" moved the box to the new part, the older
version's own page showing the same parts. The sidebar count read 3 with
three approved comments over both versions, 2 after a hide, and stayed
put after a submit or a delete until the next load. Side menu on the
three apps, as the manager, a Section Editor and the Site Administrator
with the setting on and off: as Rule 3c.

<a id="fn-e"></a>
**e — who sees which comment.** `UserCommentController::getManyPublicComments()`
(route `comments/public`, no `has.user` middleware) filters
`withContextIds([current])->withIsApproved(true)` and, when a user is
signed in, `orWhere(user_id = me AND is_approved = false)`, then
`withPublicationIds([...])` — the last scope wraps the earlier OR in one
group before the publication filter (Eloquent's scope grouping), so a
signed-in user gets this publication's approved comments plus their own
unapproved ones and nothing from other publications. Order:
`Repository::getPaginatedData()` sorts `created_at DESC` and pages by
`itemsPerPage`. Per comment the resource `UserCommentResource` carries
`userName` (`getFullName()`), `userOrcidDisplayValue` and
`isUserOrcidAuthenticated` (`PkpOrcidDisplay`: icon `Orcid` when verified,
`OrcidUnauthenticated` otherwise, the iD as the link text),
`userAffiliation` (`getLocalizedAffiliation()`), `createdAt`
(`formatShortDateTime`). `PkpCommentsNotificationMessageNeedsApproval`
shows `userComment.awaitingApprovalNotice` with the `Help` icon when the
viewer is the writer and `isApproved` is false, which is the pending and
the hidden state alike (A1). Live-probed 2026-09-16 (Rule 6, A1): the
pending comment listed for its writer with "Your comment will be visible
when the editor approves it" and a help icon above the date, and absent
signed out and for a second Reader, an Author, a Reviewer, a Section
Editor, the Journal Manager and the Site Administrator (the heading "(2)"
for them, "(5)" for the writer with two pending); after a hide the writer
saw the comment again with the same notice; another article's comments
never listed; the per-version headings "1.1 (1)" and "1.0 (2)" beside the
sidebar's "(3)".

<a id="fn-f"></a>
**f — writing a comment.** `usePkpCommentsStore.addComment()` refuses
silently unless the publication is the latest, a user is signed in and the
trimmed text is non-empty; `PkpCommentsNewSubmit` sets `is-disabled` while
`commentText.trim()` is empty or a submit is in flight; the textarea
`PkpCommentsNewInput` has `is-label-sr-only` with label and placeholder
both `userComment.addYourComment`. POST `comments` (`AddComment`:
`publicationId` required, must exist, and must be the submission's
`getCurrentPublication()` — else `api.userComments.400.cannotCommentOnPublicationVersion`;
`commentText` required; `PKPString::stripUnsafeHtml()` on the text) creates
the row with `isApproved: false` and calls `notifyModerators()`, then the
store empties the box and reloads that publication's page 1, which sets
`commentsCountPerPublication[id]` from the response's `itemCount`. The
frontend renders the text through `v-strip-unsafe-html`, so safe tags
survive. The Login page honours `source` (`LoginHandler::signIn()`
redirects to it), landing on the article with the `#public-comments`
fragment. Live-probed 2026-09-16 (Rules 4, 5, Fields): "Submit" grayed
with the box empty, with three spaces, and while the submit was in
flight; a typed sentence appeared first in the list with the notice and
icon above its date, the heading 4 → 5, "All Comments (3)" unchanged, no
message; `<b>bold</b> <script>alert(1)</script> plain <a href="…">link</a>`
rendered as bold, plain and a link with the script gone and no message; a
20,199-character comment was stored and shown whole. "Log in to comment"
(either block) opened the Login page with the article's address as
`source` and, signed in, returned to "…/article/view/{id}#public-comments"
with the box present and the block's top 187–287 px down a 900 px window
on two runs, where the sidebar link puts it at 0.

<a id="fn-g"></a>
**g — the "…" menu and reporting.** `PkpCommentsMessageActions` renders
`PkpDropdownMenu` only for a signed-in user (`pkp.currentUser`, written
into the page by `PKPTemplateManager` for signed-in visitors); the trigger
is icon-only (`MoreOptions`) with no accessible name unless the caller
sets one. `getCommentActions()` pushes `userComment.report` "Report" when
the viewer is not the writer and `userComment.deleteComment` "Delete
Comment" when they are — never both, no moderator branch. `commentReport()`
opens `PkpDialog` titled `userComment.reportComment` "Report Comment" with
body `PkpCommentReportDialog` (`PkpCommentReportDialogAuthor`:
`userComment.reportCommentByUserWithAffiliation` or
`userComment.reportCommentBy`; the comment text; `PkpCommentReportDialogReasonInput`
labelled `userComment.report.reason`) and actions `form.submit` "Submit"
(primary; its callback returns without closing when `reportText.trim()`
is empty, no message) and `common.cancel`. POST `comments/{id}/reports`
(`AddReport`: `note` required; `passedValidation()` refuses a non-moderator
reporting an unapproved comment, a state the screen never offers) then
`notifyModerators()`; the store only flips a local `isReported` flag that
nothing renders, and the menu is rebuilt from the same rule, so "Report"
returns (A3). Live-probed 2026-09-16 (Rules 7, 8, A3, A7): no "…" button
signed out; signed in, one per comment, an unnamed button holding an
image (the Comments page's row menu reads "More Actions"); on another's
comment the menu "Report" alone, on one's own "Delete Comment" alone, the
same for a Reader, an Author, a Reviewer, a Section Editor, the Journal
Manager and the Site Administrator, and on an older version's comments
after a new version was published; the dialog "Report Comment" with
"Report the following comment by Rosa Writer" (no parenthesis without an
affiliation; "… by Vera Verified (K2 Verified Institute)" with one), the
text, the box under its label and "Submit" / "Cancel"; "Submit" with an
empty or blank box sent nothing and showed nothing; a filed report closed
the dialog with no message and no change, "Report" was offered again, and
eight reports by one person on two comments (six of them on the older
version's comment) were filed and listed in the panel's "Reports" table.

<a id="fn-h"></a>
**h — deleting one's own comment.** `commentDelete()` opens `PkpDialog`
titled `userComment.deleteComment` with `userComment.deleteCommentConfirmation`
("Are you sure you want to delete the following comment? <br/><br/>
<strong>{$comment}</strong>") and actions `common.delete` (the
`isDisabled: true` it passes is not a `PkpDialog` button prop and has no
effect) and `common.cancel`; DELETE `comments/{id}` allows the owner or a
moderator (`Repository::isModerator()`: manager role in the context or
site admin), deletes the row (reports cascade by foreign key) and every
`notifications` row with `assoc_type` `ASSOC_TYPE_COMMENT` for the comment
or `ASSOC_TYPE_COMMENT_REPORT` for its reports; the store filters the
comment out of the list without touching `commentsCountPerPublication`.
Live-probed 2026-09-16 (Rule 9): the dialog's title, text (the comment in
bold) and buttons as stated; "Cancel" kept the comment; "Delete" removed
it at once with the heading unchanged until the next load ("(6)" then
"(5)"); a hidden, twice-reported comment deleted the same way was gone
from the Comments page, its "Reported" tab read "No Items", and both
report tasks left the manager's panel.

<a id="fn-i"></a>
**i — the Comments page.** `UserCommentsPage.vue`: heading
`manager.userComment.comments` "Comments" with a spinner, `Tabs` labelled
`manager.userComment.userComments` "User Comments" (hidden name) with
`track-history`, tabs from `useUserCommentsConfig.getCommentTabOptions()`:
`all` "All", `approved` "Approved", `needsApproval` "Hidden/Needs
Approval", `reported` "Reported" (`manager.userComment.*`). Store
`userCommentStore.js`: `commentsUrl` adds `?isApproved=true`,
`?isApproved=false` or `?isReported=true`; `onTabUpdate()` keeps
`trackedCommentPaginationPageHistory` per tab; `getCommentStatusText()`
joins "Approved"/"Hidden/Needs Approval" and "Reported" with
`common.commaListSeparator` under `all`, else the tab's word. Columns
(`getCommentsTableColumns`): `submission.submission` "Submission"
(`UserCommentCellSubmission`: `{submissionId}. {authorsStringShort} ;
{fullTitle}`, the family names), `manager.userComment.comment` "Comment", `common.user`
"User", `common.status` "Status", `grid.columns.actions` (sr-only) with
`DropdownActions` labelled `common.moreActions` "More Actions" offering
`manager.userComment.viewComment` "View Comment" and
`manager.userComment.deleteComment` "Delete Comment"; empty text
`grid.noItems` "No Items" (`common.loading` "Loading" while fetching).
GET `comments` (moderator route, `withContextIds([current])`) pages by
`itemsPerPage` (`PKPListsForm` field `common.itemsPerPage` "Items per
page", `context.json` default 25); `TablePagination` renders only past one
page. Role gate: the app `SettingsHandler` constructors assign the
`settings` op to `ROLE_ID_MANAGER` in all three apps and to
`ROLE_ID_SITE_ADMIN` on OJS only (footnote m); everyone else meets
`RoleBasedHandlerOperationPolicy`'s refusal, the access-denied page.
Live-probed 2026-09-16 (Rule 10, Fields) on the three apps with seeded
comments: the heading "Comments", the four tabs, the columns
"Submission", "Comment", "User", "Status" and a screen-reader-only
"Actions"; a "Submission" cell "52. Author ; K3 article one …"; a
488-character comment cut to one line with an ellipsis; "Approved,
Reported" under "All" and "Reported" under that tab; the address ending
"#approved" after the tab press and the tab kept on reload; with 36
comments "Showing 1 to 25 of 36" and "Go to Page 2", page 2 kept across a
visit to "Approved" and lost on a reload; the other journal's comment on
no tab; at "Items per page" 5, five rows and "5 of 33". A Section Editor,
an Assistant, an Author, a Reviewer and a Reader had no "Content" group
and got the access-denied page at the address on the three apps.

<a id="fn-j"></a>
**j — the comment panel, approve, hide, delete.** `UserCommentDetailModal.vue`:
pre-title `{submissionId}. {authorsStringShort} ; {fullTitle}`, title
`manager.userComment.viewDetailsCommentBy` "View comment details by",
description the writer's name; `manager.userComment.commentPreview`
"Comment preview" with `formatShortDateTime(createdAt)`, the text, name,
ORCID (`Orcid` / `OrcidUnauthenticated` icon and the iD as a link),
affiliation; `UserCommentReportsTable`; the note
`manager.userComment.approved.note` "This comment was approved on
{$approvedAt} by {$approvedBy}." (`formatShortDate`) or
`manager.userComment.approval.warning` "Approving this comment will make
it visible to all users on the site"; buttons `approveComment` (primary
while unapproved, `is-disabled` when approved), `deleteComment`
(warnable), `hideComment` (`is-disabled` while unapproved).
`commentToggleApproval()` PUTs `comments/{id}/setApproval` with
`approved`, on success toasts `manager.userComment.commentUpdated` and
closes the modal; the modal's `onClose` refetches the list.
`setApproval()` stores `isApproved`, `approvedAt` = now or null,
`approvedByUserId` = the moderator or null; the resource exposes
`approvedByUserName` to moderators. `commentView()` writes `commentId`
into the query string (`useQueryParams`) and `onMounted` reopens the
panel from it. `commentDelete()` dialog: title
`manager.userComment.deleteComment`, message
`manager.userComment.deleteComment.confirm`, actions `common.delete`
(warnable) and `common.cancel`; success toast
`manager.userComment.deleteComment.success`. Nothing in
`setApproval()` touches notifications (A2) or mails. Live-probed
2026-09-16 (Rules 11 to 14, A2) on the three apps: the row menu "More
Actions" with "View Comment" and "Delete Comment"; the line above the
title, "View comment details by" with the writer's name under it,
"Comment preview" with "2026-09-16 07:29 PM", the text, name, iD and
affiliation; "Approving this comment will make it visible to all users on
the site" while pending or hidden, "This comment was approved on
2026-09-16 by Maya Moderator." after; "Approve Comment" highlighted then
grayed, "Hide Comment" grayed then enabled (a grayed press sends
nothing); the notice "The comment has been updated successfully." at the
top right (56 px down, 8 px from the right edge of a 1280 px window),
the panel closed, the row moved between the tabs, the landing page
following on its next load; the Editor's re-approval after a hide
rewrote the note with "Ed Editor"; "Delete Comment" from the row and
from the panel with the dialog as stated, "Cancel" doing nothing, the
notice "The comment has been deleted successfully." and the row gone
from every tab and from the landing page; a deleted or mistyped number in
the address gave the "Error" dialog "The requested resource was not
found." over "All"; Escape closed the panel like "Close"; the browser's
Back reopened it; the mail catcher held nothing for the writer or the
manager throughout.

<a id="fn-k"></a>
**k — reports.** `UserCommentReportsTable.vue`: label
`manager.userComment.reports` "Reports", description
`manager.userComment.report.description`, columns
`manager.userComment.reportedBy` "Reported By",
`manager.userComment.report.reason` "Reason",
`manager.userComment.dateReported` "Date Reported" (`formatShortDate`),
actions `manager.userComment.viewReport` "View Report" and
`manager.userComment.deleteReport` "Delete Report"; empty text
`manager.userComment.report.noReports`. GET `comments/{id}/reports` pages
like the comments. `UserCommentReportDetailModal.vue`: title
`manager.userComment.viewReportDetailsBy` "View report details by",
`manager.userComment.reportPreview` "Report preview", the note, the
reporter's name, ORCID and affiliation, button "Delete Report".
`reportDelete()` dialog: `manager.userComment.deleteReport` /
`manager.userComment.deleteReport.confirm`, actions `common.delete` and
`common.cancel`; DELETE `comments/{commentId}/reports/{reportId}` deletes
the row and its `ASSOC_TYPE_COMMENT_REPORT` notifications; success toast
`manager.userComment.deleteReport.success`. `reportView()` writes
`reportId` and `commentId` into the query string. The "Reported" tab is
`withIsReported(true)` = `whereHas('reports')`, so it empties when the last
report goes. Live-probed 2026-09-16 (Rule 15, Fields, A8) on the three
apps: the "Reports" table with its description and columns, dates as
"2026-09-16", "No one has reported this comment yet" with none; "View
Report" opened "View report details by" with the reporter's name under
it, "Report preview" with the date and time, the reason and the name,
over the comment panel at "?commentId={n}&reportId={r}", the same on a
typed address; "Close" on it left the comment panel open and the address
with neither number, as did deleting the report from it; "Delete Report"
from the panel and from the row with the dialog as stated, the notice
"The report has been deleted successfully." and the table reloaded; the
last deletion took the comment off "Reported" with "Approved" under "All"
and the approval note unchanged; a reporter with a verified iD and an
affiliation shown in the report panel as in the comment panel (the
unverified end was not driven in the report panel); at "Items per page"
5, six reports paged "Showing 1 to 5 of 6". The reporters' mail stayed
at zero.

<a id="fn-l"></a>
**l — the moderators' tasks.** `UserCommentController::notifyModerators()`
collects users with `ROLE_ID_SITE_ADMIN` or `ROLE_ID_MANAGER` filtered by
`filterByContextIds([context])`; the collector matches
`COALESCE(ug.context_id, 0)` against the context id, so the site-wide
admin group (null context) never matches and only accounts holding a
manager-level group in the journal (Journal Manager, Editor, an admin
enrolled as one) get a row. `createNotification()` with
`NOTIFICATION_LEVEL_TASK`, `assocType` `ASSOC_TYPE_COMMENT` /
`ASSOC_TYPE_COMMENT_REPORT`; `PKPNotificationOperationManager::createNotification()`
sends no mail, and the two types (`NOTIFICATION_TYPE_USER_COMMENT_POSTED`
`0x100002D`, `NOTIFICATION_TYPE_USER_COMMENT_REPORTED` `0x100002E`) are
absent from `PKPNotificationManager::getNotificationSettingsMap()`, so
the Notifications tab lists no row for them and `getUserBlockedNotifications()`
can never block them. Sentences:
`PKPNotificationManager::getNotificationMessage()` returns
`manager.userComment.moderator.commentSubmitted` /
`manager.userComment.moderator.commentReported`; the Tasks grid's
`NotificationsGridCellProvider::_getTitle()` returns
`Str::limit(commentText, 200)` / `Str::limit(note, 200)` (the first 200
characters plus "...") in the slot `task.tpl` prints under the message. URLs
(`PKPNotificationManager::getNotificationUrl()`):
`management/settings/userComments?commentId=N` and
`…?reportId=R&commentId=N`, which the page's `onMounted` turns into the
open panels. Deletion: `delete()` removes notifications of both assoc
types for the comment and its report ids; `deleteReport()` and
`deleteReports()` remove the report ones; `setApproval()` removes none
(A2). Live-probed 2026-09-16 (Side effects, Rule 16, Actors rows 7 and 8,
A2, A10): the Journal Manager's and the Editor's panels each gained the
unread row with the comment's text under it (a 300-character comment and
a 300-character reason cut to 200 characters plus "..."), the Section
Editor's panel "No Items"; pressing the rows opened the Comments page
with the comment panel, and with the report panel on top for a report;
Profile › Notifications lists no row about comments; the mail catcher
held nothing for the moderators, the writer or the reporter at any step,
while a Users & Roles "Email" to the reporter arrived (the control);
after the approval and the hide the rows stayed; the writer's and the
moderator's deletion cleared the comment's and its reports' rows for
both moderators, a report's deletion its own row only. Site
Administrator: enrolled as the manager, a row; with the manager role
ended (footnote m) and a Section Editor role kept, none for a new
comment while the manager's panel had it. On a press and a preprint
server, with a comment and a report seeded (nothing on a press or a
server writes one), the manager's panel carried the same two rows,
pressing them opened the same panels, and deleting the comment from its
panel cleared both. The rows left behind by a submission's or an
account's deletion: footnote f-a10.

<a id="fn-m"></a>
**m — the Site Administrator per app.** `ojs/pages/management/SettingsHandler`
assigns `['access', 'settings']` to `ROLE_ID_SITE_ADMIN`;
`omp/pages/management/SettingsHandler` and `ops/…/SettingsHandler` assign
`['access']` only, so on OMP and OPS a site admin without a manager group
in the context fails `RoleBasedHandlerOperationPolicy` for the `settings`
op (and every settings tab too, which the settings features own), while
each app's `TemplateManager::setupBackendPage()` offers the Content menu
for `ROLE_ID_SITE_ADMIN` among the authorized roles (OMP1, OPS1). The
API's moderator routes (`roleAuthorizer([SITE_ADMIN, MANAGER])`) admit a
site admin on all three. The seeded and the scratch contexts enrol `admin`
as a manager (seed facts), so the state needs the role removed first.
Live-probed 2026-09-16 (Rule 17, Actors row 6, OMP1, OPS1, A9): `admin`'s
own row menu in Users & Roles offers "Edit" and "Email" only (no "Remove
User"), and the edit page's "Remove Role" refuses the last role, so the
state was built by seeding `admin` a second role and, as `admin`, ending
the manager role on its own edit page (Settings › Users & Roles › Users
› admin › Edit › the manager row's "Remove Role", the dialog "Are you
sure you want to remove this role? The user will lose access and
permissions associated with it."). With a Section Editor (Series Editor,
Moderator) role kept: on the journal the dashboard, "Content ›
Comments", the page and the "Comments" tab all worked and the setting was
saved both ways; on the press and the server "Content › Comments" was
offered and the entry, the page's address and Settings › Website all
answered the access-denied page. With Reader as the only role: no
dashboard and no side menu on any app (the login and "/submissions" land
on the context's home page), the press and the server refused the
address, the journal opened the page with its rows under the "Error"
dialog "The current role does not have access to this operation." /
"OK", raised by the side menu's own submissions-count request answering
401; Settings › Website the same (A9). Enrolled as the manager:
everything open on the three apps. The access-denied page is the
context's public page at
"…/user/authorizationDenied?message=user.authorization.roleBasedAccessDenied",
answered with HTTP 200 and reading "Home / The current role does not
have access to this operation."; signed out, the Comments page's and the
Website settings' addresses answer the Login page with the address as
`source`.

<a id="fn-o"></a>
**o — when the article or the account goes.** `UserCommentsMigration`:
`user_comments.publication_id` → `publications` and `user_id` → `users`
both `onDelete('cascade')`, `user_comment_reports.user_comment_id` →
`user_comments` and `user_id` → `users` cascade. Unpublishing changes the
publication's status only; the landing page stops answering for a
submission with no published version, and `getPublishedPublications()`
drops the version from the block. The `notifications` rows have no such
cascade (footnote l, A10). Live-probed 2026-09-16 (Rule 18, A10) on a
journal: no stage of a published or unpublished submission offers
"Delete"; after "Decline Submission" on the Submission stage the stage
offered "Schedule For Publication, Revert Decline, Delete", and "Delete"
("Are you sure you want to permanently delete this submission?" /
"Confirm") took the submission's comments off every tab of the Comments
page. Users & Roles › Users › a row's menu: "Edit, Email, Login As,
Remove User, Disable User, Merge user"; "Remove User" ("Remove this user
from this journal? This action will unenroll the user from all roles
within this journal.") kept the row listed and the account's comment and
report in place; "Merge user" opens the window "Merge user" listing the
journal's users, a row's "Settings" reveals "Merge into this User", and
the confirm reads "Are you sure you wish to merge the account with the
username "{old}" into the account with the username "{new}"? The account
with the username "{old}" will not exist afterwards. This action is not
reversible."; afterwards the merged account's comment and report were
gone and the other writer's kept, on the Comments page and on the landing
page. Unpublishing the only version: the workflow read "Status:
Unscheduled", the Comments page still listed both comments, the article's
page answered "404 Not Found" signed out and as the writer; "Schedule For
Publication" again: "Status: Published", the approved comment back under
"Version of Record 1.0 (1)" for a visitor and both, "(2)", for the writer
of the pending one. The press and the server were not driven for this
rule.

<a id="fn-p"></a>
**p — ownership pointers.** The Cross-feature bullets marked with this
note say which spec describes a neighbouring screen and claim nothing
that screen shows: no screen to drive. The "Permit changes to Settings"
fact itself is Actors rows 5 and 6's, driven under footnote b.

<a id="fn-s0"></a>
**s0 — the scenario preamble.** The seeded `publicknowledge` keeps
`enablePublicComments` off and holds no published item (live-probed
2026-09-16: the "Comments" tab's box unticked, the Archives, the current
issue and the home page listing no article), so every scenario seeds a
scratch context and a submission with `published: true`
(`POST scenarios/submission`); readers are throwaway `users[]` with
`roles: ['reader']`, the moderator the scratch manager (`roles:
['manager']`) or an `editor` (a preprint server has no editor key, so its
second moderator level is not seeded). The context passthrough
`enablePublicComments` and the submission key `userComments[]` (`user`,
`text`, `approved?`, `reports?`) are built (scenarios.md); `userComments[]`
on a comments-off context is the "off with comments kept" state and
leaves the box unticked; `users[]` takes `{username: 'admin', roles:
[...]}` to give `admin` a second role (footnote m). Seeded comments raise
the moderators' tasks like typed ones, and a batch seeded in one call
shares a second and lists in no fixed order. Mailpit reads scope by
throwaway recipient (scenarios.md "Mailpit"); its total never moves at
the 500-message cap. The preamble itself describes how the scenarios are
set up and names no screen.

<a id="fn-f-a1"></a>
**f-a1 — A1.** `PkpCommentsNotificationMessageNeedsApproval.vue` shows the
notice for `!message.isApproved` and the writer; `setApproval(false)`
leaves the row identical to a fresh one apart from the cleared
`approvedAt` / `approvedByUserId` settings. No other locale key exists for
a hidden state (`lib/pkp/locale/en/UserComment.po`). Live-probed
2026-09-16: after the manager's "Hide Comment" the writer's landing page
listed the comment last with the same notice and icon as the pending ones
and "Delete Comment" in its menu; the Comments page's "Hidden/Needs
Approval" tab listed it with the pending ones.

<a id="fn-f-a2"></a>
**f-a2 — A2.** `UserCommentController::setApproval()` saves the comment
and returns; `delete()`, `deleteReport()` and `deleteReports()` are the
only methods that touch `Notification`. Compare the "needs an editor" task,
cleared by the assignment (the notifications spec's roster). Live-probed
2026-09-16: the "pending review" row stayed in the Journal Manager's and
the Editor's panels after "Approve Comment" and after "Hide Comment";
only the comment's deletion, by its writer or a moderator, cleared it; a
report's deletion cleared its own row only.

<a id="fn-f-a3"></a>
**f-a3 — A3.** `usePkpCommentsStore.commentReport()`: the "Submit"
callback returns early on an empty trimmed reason with no `notify`;
`performCommentReport()` closes the top dialog and sets a local
`isReported` that no component renders; `getCommentActions()` has no
"already reported" branch; `AddReport` has no uniqueness rule, and
`Repository::addReport()` creates a row per call. Live-probed 2026-09-16:
"Submit" with an empty or blank reason sent no request and showed
nothing; a filed report closed the dialog with no message and the comment
unchanged, "Report" was offered again, and a second and then six more
reports by the same person were filed, all listed in the panel's
"Reports" table.

<a id="fn-f-a4"></a>
**f-a4 — A4.** `ManagementHandler::userComments()` and the API's moderator
routes read no `enablePublicComments`; only `TemplateManager::setupBackendPage()`
(the menu) and `ArticleHandler::view()` (the block) do. Live-probed
2026-09-16 on the three apps: with the box unticked the side menu lost
Content › Comments on the save's own reload and the address opened the
full page with every comment under its tabs (the panel's actions were not
pressed in that state). The question and the lean are the author's; no
screen settles them.

<a id="fn-f-a5"></a>
**f-a5 — A5.** Footnote b: right after the save request the browser
navigates to the same address (the console log records the navigation),
and the Website Settings page opens on its first tab. Live-probed
2026-09-16 on the three apps: "Saving" for a beat, then the reload landing
on Appearance › Theme with no "Saved" within 6 s; the Setup › Information
and Setup › Lists forms, the control, showing "Saving" then "Saved" in
place.

<a id="fn-f-a6"></a>
**f-a6 — A6.** `PkpOrcidDisplay` (the shared ORCID display the comment and
the panels use) takes `userOrcidDisplayValue`, which already carries the
"(unauthenticated)" suffix for an unverified iD, as both the link's text
and its address. Live-probed 2026-09-16, the landing page (journal) and
the comment panel (the three apps): verified, the address and the text
`https://orcid.org/0000-0002-1825-0097` with the solid icon; unverified,
the text and the address both `https://orcid.org/0000-0001-5109-3700
(unauthenticated)` with the hollow icon. The report panel's unverified
end was not driven (the same field feeds it). The profile's own display
of an iD is *[ORCID integration](U04-orcid-integration.md)*'s.

<a id="fn-f-a7"></a>
**f-a7 — A7.** `PkpCommentsMessageActions` renders `PkpDropdownMenu` with
an icon-only trigger (`MoreOptions`) and sets no trigger label.
Live-probed 2026-09-16: the only button in a comment's article element
has no accessible name (a `button` holding an `img`); the Comments page's
row menu reads "More Actions".

<a id="fn-f-a8"></a>
**f-a8 — A8.** `reportView()` writes `reportId` and `commentId` into the
query string; closing the report panel clears both keys. Live-probed
2026-09-16 on the three apps: "Close" on the report panel left the
address at "…/userComments#reported" with the comment panel still open;
deleting the report from the panel left "…/userComments" the same way.

<a id="fn-f-a9"></a>
**f-a9 — A9.** The dialog is raised by the side menu's submissions-count
request (`_submissions/viewsCount`) answering 401 for an account with no
dashboard access; the Comments page's own requests succeed. Live-probed
2026-09-16 (footnote m's Reader-only state): the journal's page with its
rows under the dialog, Settings › Website the same; the press and the
server answering the access-denied page. Not driven: the same account on
Settings › Journal, which would show whether the dialog is the
dashboard's.

<a id="fn-f-a10"></a>
**f-a10 — A10.** `user_comments` rows go with their publication and their
user by database cascade (footnote o), while the `notifications` rows for
`ASSOC_TYPE_COMMENT` and `ASSOC_TYPE_COMMENT_REPORT` are deleted only by
the comment and report deletion routes (footnote l), so a comment removed
by cascade leaves them. Live-probed 2026-09-16 on a journal, each path
once: after the deletion of a submission carrying a reported comment
(Decline › Delete) and after the "Merge user" of a writer, the Journal
Manager's and the Editor's panels kept five rows (two comment tasks,
three report tasks) with the sentence and an empty line under it, still
pressable: a comment's opened the Comments page at "?commentId={n}" under
"Error" / "The requested resource was not found.", a report's opened the
page at "?reportId={r}&commentId=" with no panel; the rows stayed, marked
read.

<a id="fn-f-omp1"></a>
**f-omp1 — OMP1.** Footnote m: `omp/pages/management/SettingsHandler::__construct()`
assigns `ROLE_ID_SITE_ADMIN` the `access` op only, against OJS's
`['access', 'settings']`; `omp/classes/template/TemplateManager.php`
builds the Content group for `ROLE_ID_SITE_ADMIN`. Live-probed 2026-09-16
with `admin` holding a Series Editor role and no manager role (footnote
m): "Content › Comments" offered, the entry and the address answering the
access-denied page, the journal opening the page for the same account.
The question and the lean are the author's; no screen settles them.

<a id="fn-f-ops1"></a>
**f-ops1 — OPS1.** Footnote m: `ops/pages/management/SettingsHandler::__construct()`
assigns `ROLE_ID_SITE_ADMIN` the `access` op only;
`ops/classes/template/TemplateManager.php` builds the Content group, with
"Comments" as its only entry, for `ROLE_ID_SITE_ADMIN`. Live-probed
2026-09-16 with `admin` holding a Moderator role and no manager role
(footnote m): the "Content" group with "Comments" alone offered, the
entry and the address answering the access-denied page, the journal
opening the page for the same account. The question and the lean are the
author's; no screen settles them.

## Reference — entry points & surfaces

| Entry | Path | Atom |
|-------|------|------|
| "Comments" settings tab ("Enable Public Comments" + Save) | Settings › Website › Content › Comments (`management/settings/website#content`) | AFFM-052 |
| Comments page (moderation) | editorial side menu Content › Comments; `management/settings/userComments` | VUE-010 (mounted by the settings dispatcher's `userComments` op, ROUTE-017, owned by *Journal identity & about pages*) |
| Status tabs "All" / "Approved" / "Hidden/Needs Approval" / "Reported" | Comments page | AFFM-141 |
| Comment row "…" › "View Comment" | Comments page table | AFFM-142 · VUE-082 |
| Comment row "…" › "Delete Comment" (confirm dialog) | Comments page table | AFFM-143 |
| Comment panel "Approve Comment" / "Hide Comment" / "Delete Comment" | comment panel | AFFM-144 · VUE-082 |
| Reports table row "…" › "View Report" | comment panel › Reports | AFFM-145 · VUE-083 |
| Reports table row "…" › "Delete Report" (confirm dialog) | comment panel › Reports; report panel | AFFM-146 · VUE-083 |
| Comments and reports paging | Comments page; comment panel › Reports | AFFM-147 |
| Landing-page blocks: "Comments on this publication" (comment box, "Submit", "Log in to comment", "Show more", the "…" menu, the "Report Comment" and "Delete Comment" dialogs) and the sidebar "Comments" ("All Comments (N)", "Log in to comment") | a published article's landing page (`article/view/{id}`), OJS only | AFFR-058 |
| Comments API | `api/v1/comments` (`public` list; POST; DELETE `{id}`; POST `{id}/reports`; moderator: list, GET `{id}`, PUT `{id}/setApproval`, reports list/get/delete) | API-012 |
| Task "A comment has been submitted and is pending review by a moderator." | the Tasks panel | NOTIF-052 |
| Task "A report was submitted for a comment and requires review by a moderator." | the Tasks panel | NOTIF-053 |

## Reference — code anchors

- `lib/pkp/api/v1/comments/UserCommentController.php` — the routes, the
  public list, submit, delete, approval, reports, `notifyModerators()`;
  `formRequests/AddComment.php`, `formRequests/AddReport.php` — the
  validation; `resources/UserCommentResource.php`,
  `resources/UserCommentReportResource.php` — what the screens receive.
- `lib/pkp/classes/userComment/UserComment.php`, `Repository.php`
  (`isModerator()`, `getPaginatedData()`, `getPerPage()`),
  `relationships/UserCommentReport.php`;
  `lib/pkp/classes/migration/install/UserCommentsMigration.php` — the
  tables and cascades.
- `lib/pkp/classes/components/forms/context/ContentCommentsForm.php` +
  `lib/pkp/schemas/context.json` (`enablePublicComments`, `itemsPerPage`)
  + `lib/pkp/templates/management/website.tpl` — the setting.
- `lib/pkp/pages/management/ManagementHandler.php` (`authorize()`,
  `settings()`, `website()`, `userComments()`) +
  `lib/pkp/templates/management/userComments.tpl`; the app
  `pages/management/SettingsHandler.php` constructors — the role gates.
- `lib/ui-library/src/pages/userComments/*` (`UserCommentsPage.vue`,
  `userCommentStore.js`, `useUserCommentsConfig.js`, the tables, cells and
  the two modals) — the moderation page.
- `lib/pkp/classes/components/UserCommentComponent.php` +
  `ojs/pages/article/ArticleHandler.php` (`view()`) +
  `ojs/templates/frontend/objects/article_details.tpl` — the OJS mount;
  `lib/ui-library/src/frontend/components/PkpComments/*`
  (`PkpComments.vue`, `usePkpCommentsStore.js`, the new-comment, actions,
  report-dialog, show-more, log-in and scroll-to components) — the reader
  block.
- `classes/template/TemplateManager.php` in each app
  (`setupBackendPage()`, the Content menu group) — the side-menu entry.
- `lib/pkp/classes/notification/PKPNotificationManager.php`
  (`getNotificationUrl()`, `getNotificationMessage()`),
  `lib/pkp/controllers/grid/notifications/NotificationsGridCellProvider.php`
  (`_getTitle()`) — the tasks.
- `lib/pkp/locale/en/UserComment.po`, `manager.po`
  (`manager.userComment.*`), `api.po` (`api.userComments.*`) — the
  strings.
