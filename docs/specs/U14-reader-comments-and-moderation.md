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
journal does (Rules 2, 3 and 10 to 17 hold there as written); with nothing
that writes comments, the Comments page on a press or a preprint server
lists "No Items" under every tab, and switching the setting on changes only
the side menu (Rule 3). <sup>a</sup>

## Actors & permissions

**Moderator** in this spec means a Journal Manager or an Editor of the
journal (both manager-level roles) and, on a journal, the Site
Administrator; Rule 17 says how far a Site Administrator holding no role in
the journal gets in each app. **A signed-in visitor** is any account signed
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
| **Switch public comments on or off** | • a Journal Manager whose role permits settings changes (the Roles screen's "Permit changes to Settings"), and a Site Administrator working in the journal, on Settings › Website › Content › "Comments" (Rule 2) <sup>b</sup> |
| **Open the Comments page** | • a Journal Manager and an Editor, whether or not their role permits settings changes: the Content › Comments menu entry while the setting is on (Rule 3), and the page's address at any time (Rule 2b)<br>• a Site Administrator holding no role in the journal: on a journal the page opens; on a press or a preprint server the menu entry is offered but the address answers the access-denied page ⚠ [OMP1](#omp1) ⚠ [OPS1](#ops1) (Rule 17)<br>• a Section Editor, an Assistant, an Author, a Reviewer or a Reader: no menu entry, and the address answers the access-denied page <sup>i</sup> <sup>m</sup> |
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
| "Comments" group: the box "Enable Public Comments" | no | Unticked on a fresh journal. "Save" records it; "Saving" then "Saved" appear beside the button and nothing else on the page changes until it is next loaded (Rule 2) <sup>b</sup> |

**The Comments page** (Rules 10 to 16). <sup>i</sup> <sup>j</sup> <sup>k</sup>

| Field (UI label) | Required? | Rules |
|------------------|-----------|-------|
| The tabs "All", "Approved", "Hidden/Needs Approval", "Reported" | — | Which comments the table lists (Rule 10). The chosen tab is written into the page's address after "#" and comes back on reload <sup>i</sup> |
| The comments table: columns "Submission", "Comment", "User", "Status" and an unlabelled "…" ("More Actions") column | — | One row per comment, newest first, 25 per page (Settings bullet 2). "Submission" reads "{submission number}. {authors}; {title}", "Comment" the comment's text cut to one line, "User" the writer's name, "Status" as Rule 10b. With nothing to list the table reads "No Items" <sup>i</sup> |
| The comment panel "View comment details by {writer}" | — | Opened by "View Comment" (Rule 12). Under the title the submission line; then "Comment preview" with the date and time, the text, the writer's name, their ORCID iD when they have one (a solid icon when verified, a hollow one when not) and their affiliation; then the "Reports" table; on the right the approval note and the three buttons "Approve Comment", "Delete Comment", "Hide Comment" <sup>j</sup> |
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
     "Comments" side tab; tick "Enable Public Comments" and press "Save"
     ("Saved" beside the button). From the next page load every published
     article's landing page carries the comments blocks (Rule 3), and the
     editorial side menu of every moderator gains the entry Content ›
     Comments (Rule 3b).
   - 2b. **Switching off.** Untick the box and "Save". The landing pages
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
     are closed; a heading opens or closes its part. Inside a part: the
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
     comments stay readable. Publishing a new version moves the box to the
     new version's part and closes the previous one this way, with its
     comments still under its own heading (the versions themselves are
     *[Publish, schedule & versions](U49-publish-schedule-and-versions.md)*'s).
   - 4b. A visitor who is not signed in sees the button "Log in to
     comment" in the newest version's part (and in the sidebar block). It
     opens the journal's Login page; after signing in the browser returns
     to the same article with the page scrolled to the comments, and the
     comment box is there.
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
     have one (the iD as a link with a solid icon when verified, a hollow
     one when not) and the writer's affiliation. A signed-in visitor sees,
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
   no button. On another person's comment the menu offers "Report" alone;
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
    Comments page with that panel open (Rule 16). Closing the panel drops
    the number from the address and reloads the table. The right-hand note
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
    into the address as well, and "Delete Report". "Delete Report", from
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
    who holds no role in the journal opens the Comments page, works its
    panels and changes the "Comments" setting like a Journal Manager. On a
    press and on a preprint server the same person is offered the Content ›
    Comments entry in the side menu, but the page's address answers the
    access-denied page ("The current role does not have access to this
    operation.") ⚠ [OMP1](#omp1) ⚠ [OPS1](#ops1); the Site Administrator
    enrolled as a Press Manager or Preprint Server Manager is a manager
    there and gets in. <sup>m</sup>
18. **When the article or the account goes.** Deleting a submission
    deletes its comments and their reports; deleting a user account deletes
    the comments and the reports that account wrote. Unpublishing a version
    leaves its comments kept and takes them off the landing page with the
    version; a version published again shows them again. <sup>o</sup>

## Side effects

- **A task for each moderator on every new comment.** Writing a comment
  (Rule 5) raises, for every Journal Manager and Editor of the journal, an
  unread row in the Tasks panel reading "A comment has been submitted and
  is pending review by a moderator." with the comment's first 200
  characters under it where a task normally shows the submission's title.
  Pressing the row opens the Comments page with the comment's panel
  (Rule 16). No email accompanies it, and no row on the Profile's
  Notifications tab governs it: the task cannot be switched off. A Site
  Administrator holding no manager role in the journal gets no row. The
  Tasks panel itself is *[Notifications center & email preferences](U05-notifications-center-and-email-preferences.md)*'s. <sup>l</sup>
- **A task for each moderator on every report.** Reporting a comment
  (Rule 8) raises the same way a row reading "A report was submitted for a
  comment and requires review by a moderator." with the reason's first 200
  characters under it; pressing it opens the comment panel with the report
  panel on top (Rule 16). No email, no Notifications-tab row. <sup>l</sup>
- **Deleting clears the tasks; approving and hiding do not.** Deleting a
  comment, by its writer or by a moderator, deletes every moderator's tasks
  about that comment and about its reports; deleting a report deletes the
  tasks about that report. Approving or hiding a comment leaves the
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
  pressing them opens (Side effects, Rule 16).
- **The article landing page** — the page the blocks sit on is *Article
  landing page & reading*'s (spec not yet written); this spec owns the two
  blocks (Rule 3) and everything inside them.
- **Versions** — creating and publishing a new version, which moves the
  comment box (Rule 4a), is
  *[Publish, schedule & versions](U49-publish-schedule-and-versions.md)*'s.
- **The writer's name, ORCID iD and affiliation** shown with a comment are
  the account's own, from *[User profile](U03-user-profile.md)* and
  *[ORCID integration](U04-orcid-integration.md)*; a comment shows whatever
  the profile holds at the moment the page loads. <sup>e</sup>
- **The Website settings screen** the "Comments" tab sits in, and its
  "Lists" tab, belong to *Journal identity & about pages* and *Appearance
  & theming* (specs not yet written); this spec owns the one tab.
- **"Permit changes to Settings"** on a role, which gates the settings tab
  but not the Comments page (Actors), is *Users management*'s (spec not
  yet written).

## Canonical scenarios

Every scenario runs on a scratch journal with throwaway accounts, because
the seeded journal keeps public comments off and has no published article;
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
| The Journal Manager switches "Enable Public Comments" on and off (Actors row 5, Rule 2) | main | planned | |
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
| Comment on an older version closed with "Discussion is closed on this version…" after a new version is published; its comments still listed under its heading (Rule 4a) | state | planned | |
| The four tabs and the "Status" cell wording: "Approved", "Hidden/Needs Approval", ", Reported" (Rule 10) | state | planned | |
| The comment panel's approval note before and after approval, "Approve Comment" and "Hide Comment" grayed out in turn (Rules 12, 13) | state | planned | |
| A comment with no reports: "No one has reported this comment yet" (Fields) | state | planned | |
| A second report on the same comment from the same person (Rule 8) | state | | Register carries it |
| "Show more ({remaining})" after 25 comments on one version, and the Comments page's second page after 25 rows (Rule 6c, 10c) | state | planned | |
| A comment writer with an ORCID iD and an affiliation: the iD link and the affiliation shown under the comment and in the panel (Rule 6b, Fields) | state | planned | |
| The Site Administrator holding no role in the journal on the Comments page: opens on a journal, refused on a press and a preprint server (Rule 17) | state | | Register carries it |
| A Journal Manager whose role does not permit settings changes still opens the Comments page (Actors row 6) | state | planned | |
| Deleting the submission deletes its comments (Rule 18) | state | | No seed |
| "Items per page" at another value (Settings bullet 2) | variant | | Nothing new to test |
| "Cancel" on the report, delete-comment and delete-report dialogs (Rules 8, 9, 14, 15) | variant | | Nothing new to test |
| The shared address with a comment number opened directly (Rule 12) | variant | | Nothing new to test |
| An Editor (manager-level) as the moderator instead of the Journal Manager (Actors) | variant | | Nothing new to test |

## Findings register

Verdicts are the author's judgment (claude, 2026-09-16), unreviewed unless
an entry notes otherwise; the team settles them on spec review. The
summary is sorted 🐞 → ❓ → ✅ and the entries below are the source; badges,
Impact and Basis: [Reading a spec](GLOSSARY.md#reading-a-spec).

| ID | Finding (one line, symptom) | Bug? | Impact | Review |
|----|------------------------------|------|--------|--------|
| [A1](#a1) | A hidden comment reads to its writer exactly like one awaiting approval | ❓ | minor | — |
| [A2](#a2) | Approving or hiding a comment leaves every moderator's "pending review" task in place | ❓ | minor | — |
| [A3](#a3) | The report dialog neither refuses an empty reason with a message nor confirms a filed report, and the same person can report the same comment again | ❓ | minor | — |
| [A4](#a4) | With public comments switched off, the Comments page still opens by address and lists the kept comments | ❓ | minor | — |
| [OMP1](#omp1) | On a press, a Site Administrator holding no press role is offered Content › Comments but the page answers the access-denied page | ❓ | minor | — |
| [OPS1](#ops1) | On a preprint server, a Site Administrator holding no server role is offered Content › Comments but the page answers the access-denied page | ❓ | minor | — |

### All apps

<a id="a1"></a>
**A1 — A hidden comment looks like a pending one** · ❓ · minor.
A writer whose approved comment a moderator has hidden sees it again with
"Your comment will be visible when the editor approves it", the notice a
fresh comment carries, and no word says it was taken down. Expected either
a distinct notice or nothing; observed the pending notice.
Question: is a hidden comment meant to read as "awaiting approval" to its
writer? Lean: intended; moderation is deliberately silent towards the
writer, and one notice keeps the screen simple. Basis: code. <sup>f-a1</sup>

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
approve path does not. Basis: code. <sup>f-a2</sup>

<a id="a3"></a>
**A3 — Reporting gives no feedback** · ❓ · minor.
In the "Report Comment" dialog, "Submit" with an empty reason does nothing
and shows no message; after a filed report the dialog closes with no
confirmation, the comment looks unchanged and "Report" is offered again,
so a second press files a second report by the same person. Expected a
"required" message and a confirmation or a changed menu; observed silence.
Question: is a silent, repeatable report intended? Lean: oversight; every
other dialog in the application names a missing required field. Basis:
code. <sup>f-a3</sup>

<a id="a4"></a>
**A4 — The Comments page outlives the setting** · ❓ · minor.
With "Enable Public Comments" unticked the side menu drops Content ›
Comments, yet the page's address still opens the full Comments page with
every comment listed and every action working. Expected either the page
to follow the setting or the menu entry to stay; observed the entry gone
and the page open.
Question: is the page meant to stay reachable while the feature is off?
Lean: intended; the comments are kept for a later switch-on and a manager
may want to moderate them meanwhile. Basis: code. <sup>f-a4</sup>

### OMP

<a id="omp1"></a>
**OMP1 — Content › Comments offered to a Site Administrator the page refuses** · ❓ · minor.
On a press with public comments on, a Site Administrator who holds no
press role sees Content › Comments in the side menu; pressing it lands on
the access-denied page. On a journal the same person opens the page.
Expected the menu and the page to agree; observed the offer without the
access.
Question: should a Site Administrator without a press role moderate
comments, as on a journal, or should the menu entry not be offered? Lean:
oversight; the journal lets the Site Administrator in and the press's
menu code is the journal's. Basis: code. <sup>f-omp1</sup>

### OPS

<a id="ops1"></a>
**OPS1 — Content › Comments offered to a Site Administrator the page refuses** · ❓ · minor.
On a preprint server with public comments on, a Site Administrator who
holds no server role sees the "Content" group with "Comments" in the side
menu; pressing it lands on the access-denied page. On a journal the same
person opens the page. Expected the menu and the page to agree; observed
the offer without the access.
Question: as OMP1, for the preprint server. Lean: oversight, as OMP1.
Basis: code. <sup>f-ops1</sup>

---

<a id="footnotes"></a>
## Footnotes — mechanism & evidence

<a id="fn-a"></a>
**a — reachability per app, and the badge.** Read at the 2026-09-15 tips
(ojs `ae597ff9d9`, omp `0ec98a508`, ops `9ce633ee1d`, all on pkp-lib
`b262d27b81`); nothing in this spec has been seen running yet, every
claim is a code reading to be driven at the claim check. Three surfaces:
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
runs on OJS only, which matches the reading. To drive: on a press and on a
preprint server with "Enable Public Comments" ticked, open a published
monograph's and a posted preprint's landing page as a signed-in Reader and
record whether any block headed "Comments" or "Comments on this
publication" or any "Log in to comment" control appears (expected none);
then, as the manager, open Content › Comments and record the page heading
and the table's empty text under each tab (expected "Comments" and "No
Items").

<a id="fn-b"></a>
**b — the switch.** `ContentCommentsForm` PUTs to the context API
(`$contextApiUrl`), so the tab saves like the other Website tabs: the
`pkp-form` shows "Saving" then "Saved" beside the button and no page
notice (the same rendering the review settings spec recorded for its
forms). Access to the tab: `ManagementHandler::authorize()` adds
`CanAccessSettingsPolicy` to every `settings` op except the `announcements`
and `userComments` args (the comment in the code: "moved out of settings
without changing their URL"); the policy permits a site admin group or a
manager group with `permitSettings` (Roles screen string
`settings.roles.permitSettings` "Permit changes to Settings"). So the
Comments page is open to a manager without settings permission while the
"Comments" tab is not. To drive: as a Journal Manager, Settings › Website ›
"Content" › "Comments": tick "Enable Public Comments", press "Save" and
record what appears beside the button and whether any notice shows at the
top right; reload a published article's landing page and the editorial
side menu and record the blocks and the Content › Comments entry. Then
untick and "Save": record that both blocks and the entry are gone, open
"…/management/settings/userComments" by address and record whether the
page opens and lists the comment written before (Rule 2b, A4). On a scratch
journal whose manager role has "Permit changes to Settings" unticked
(Settings › Users & Roles › Roles › the manager role › Edit), sign in as a
throwaway holder of that role: record that Settings › Website is refused
and the Comments page opens.

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
To drive: on a scratch journal with two published versions, load the
landing page signed out and record the main block's heading, each part's
heading text, which parts are open, and the sidebar block's heading, link
text and button; press "All Comments (…)" and record where the page
scrolls; press an older version's heading and record its notice's exact
text and that no comment box is there. Publish a second version through
the workflow's "Create New Version" and "Publish" and record that the box
has moved to the new part and the old part carries the notice.

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
the hidden state alike (A1). To drive: with one pending comment by a
throwaway Reader on a scratch journal, load the landing page (a) signed
out, (b) as a second Reader, (c) as the Journal Manager: record for each
whether the comment is listed and the number in the version heading; then
as the writer, record the notice's exact text and its position relative to
the date. After the manager hides an approved comment, reload as the writer
and record the notice shown (expected the same "Your comment will be
visible…" text, A1).

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
fragment. To drive: as a throwaway Reader on the latest version, record
that "Submit" is grayed with the box empty and with three spaces typed;
type a sentence and press "Submit": record that the box empties, where the
comment appears, the notice and icon above it, the new number in the
version heading and the unchanged number in "All Comments (…)". Type
`<b>bold</b> <script>alert(1)</script> plain` as a second comment and
record how it renders (expected: "bold" in bold, no script, "plain").
Signed out, press "Log in to comment" in the main block: record the Login
page, sign in and record the page the browser lands on, whether it is
scrolled to the comments and whether the box is present.

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
returns (A3). To drive: as a second Reader, open the "…" menu on the first
Reader's approved comment and record its entries; open it on your own
comment and record the entries; press "Report": record the dialog's title,
its first line (with and without an affiliation on the writer's profile),
the box's label and the two buttons; press "Submit" with the box empty and
record what happens; type a reason and "Submit": record whether any
message or change appears, reopen the menu and record whether "Report" is
offered; report once more and, as the manager, record the number of rows
in the panel's "Reports" table (expected 2).

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
To drive: as the writer, press "Delete Comment" and record the dialog's
title, text and buttons; press "Delete" and record that the comment is
gone from the list, the number in the version heading before and after a
reload, and, as the manager, that the Comments page no longer lists it
and that a report filed against it is gone.

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
(`UserCommentCellSubmission`: `{submissionId}. {authorsStringShort};
{fullTitle}`), `manager.userComment.comment` "Comment", `common.user`
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
`RoleBasedHandlerOperationPolicy`'s refusal, the access-denied page. To drive:
 as the manager with comments in every state, open Content ›
Comments and record the heading, the four tab labels, the column headers,
the "Submission" cell's shape, the "Status" cell under "All" for an
approved-and-reported comment and under "Reported"; press "Approved" and
record the address's ending; reload and record the tab shown. With 26
comments on one article (seeded), record the paging line and that page 2
survives a switch to "Approved" and back. As a Section Editor, an Author
and a Reader, open the address and record the page shown and that the side
menu has no Content › Comments.

<a id="fn-j"></a>
**j — the comment panel, approve, hide, delete.** `UserCommentDetailModal.vue`:
pre-title `{submissionId}. {authorsStringShort}; {fullTitle}`, title
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
`setApproval()` touches notifications (A2) or mails. To drive: open a
pending comment's panel and record the line above the title, the title,
the "Comment preview" contents, the right-hand note and which of the three
buttons are grayed; press "Approve Comment" and record the notice's text
and position, that the panel closed and the row's new tab; reopen and
record the note's wording (the date's shape and the moderator's name) and
the grayed buttons; press "Hide Comment" and record the same; approve
again and record the note. Press "Delete Comment" from a row's menu and
from a panel: record the dialog's title, text and buttons, the notice
after "Delete", and that the row is gone.

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
report goes. To drive: on a comment with two reports, record the "Reports"
table's heading, description, column headers and the date's shape; press
"View Report" on one and record the panel's title, "Report preview"
contents and button; press "Delete Report" there and record the dialog
and the notice; delete the second from its row menu and record the empty
text, then that the comment has left the "Reported" tab while its "Status"
under "All" still reads "Approved".

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
`Str::limit(commentText, 200)` / `Str::limit(note, 200)` in the slot
`task.tpl` prints under the message. URLs
(`PKPNotificationManager::getNotificationUrl()`):
`management/settings/userComments?commentId=N` and
`…?reportId=R&commentId=N`, which the page's `onMounted` turns into the
open panels. Deletion: `delete()` removes notifications of both assoc
types for the comment and its report ids; `deleteReport()` and
`deleteReports()` remove the report ones; `setApproval()` removes none
(A2). To drive: after a throwaway Reader's comment on a scratch journal,
open the Tasks panel as the Journal Manager and as an Editor: record the
row's sentence, what is printed under it (expected the comment's text) and
that it is unread; press it and record the page and the open panel; open
Profile › Notifications and record that no row names comments; record the
mail catcher empty for both moderators. After a report, record the second
row's sentence and what pressing it opens. Approve the comment and record
that the first row is still listed; delete the comment and record that
both rows are gone. Remove `admin`'s manager role in the scratch journal
(Settings › Users & Roles), write another comment, and record that
`admin`'s Tasks panel gains no row.

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
as a manager (seed facts), so the state needs the role removed first. To drive:
 on a scratch journal, press and preprint server, as the manager
remove `admin`'s manager role (Settings › Users & Roles › Users › admin ›
Edit); as `admin` open the editorial dashboard and record whether Content
› Comments is in the side menu, then open "…/management/settings/userComments"
by address and record the page (expected: the Comments page on the journal,
"The current role does not have access to this operation." on the press
and the server).

<a id="fn-o"></a>
**o — when the article or the account goes.** `UserCommentsMigration`:
`user_comments.publication_id` → `publications` and `user_id` → `users`
both `onDelete('cascade')`, `user_comment_reports.user_comment_id` →
`user_comments` and `user_id` → `users` cascade. Unpublishing changes the
publication's status only; the landing page stops answering for a
submission with no published version, and `getPublishedPublications()`
drops the version from the block. To drive: on a scratch journal, comment
on an article, then as the manager delete the submission (the dashboard
row's "Delete" through the workflow) and record that the Comments page no
longer lists the comment; on another article, unpublish its only version
and record that the Comments page still lists its comment, then publish
again and record the comment back under the version's heading.

<a id="fn-s0"></a>
**s0 — the scenario preamble.** The seeded `publicknowledge` keeps
`enablePublicComments` off and holds no published item, so every scenario
seeds a scratch context and a submission with `published: true`
(`POST scenarios/submission`); readers are throwaway `users[]` with
`roles: ['reader']`, the moderator the scratch manager (`roles:
['manager']`) or an `editor`. The context passthrough `enablePublicComments`
is not built yet (scenarios.md "Field shapes not built yet"): until it is,
a probe ticks the box on Settings › Website › Content › Comments, and a
test needs the key. Pre-existing comments (26 on one version, an
already-reported comment) need the `userComments[]` submission key
(`user`, `text`, `approved?`, `reports?`), also not built. Mailpit reads
scope by throwaway recipient (scenarios.md "Mailpit").

<a id="fn-f-a1"></a>
**f-a1 — A1.** `PkpCommentsNotificationMessageNeedsApproval.vue` shows the
notice for `!message.isApproved` and the writer; `setApproval(false)`
leaves the row identical to a fresh one apart from the cleared
`approvedAt` / `approvedByUserId` settings. No other locale key exists for
a hidden state (`lib/pkp/locale/en/UserComment.po`). Read 2026-09-16, not
yet driven.

<a id="fn-f-a2"></a>
**f-a2 — A2.** `UserCommentController::setApproval()` saves the comment
and returns; `delete()`, `deleteReport()` and `deleteReports()` are the
only methods that touch `Notification`. Compare the "needs an editor" task,
cleared by the assignment (the notifications spec's roster). Read
2026-09-16, not yet driven.

<a id="fn-f-a3"></a>
**f-a3 — A3.** `usePkpCommentsStore.commentReport()`: the "Submit"
callback returns early on an empty trimmed reason with no `notify`;
`performCommentReport()` closes the top dialog and sets a local
`isReported` that no component renders; `getCommentActions()` has no
"already reported" branch; `AddReport` has no uniqueness rule, and
`Repository::addReport()` creates a row per call. Read 2026-09-16, not yet
driven.

<a id="fn-f-a4"></a>
**f-a4 — A4.** `ManagementHandler::userComments()` and the API's moderator
routes read no `enablePublicComments`; only `TemplateManager::setupBackendPage()`
(the menu) and `ArticleHandler::view()` (the block) do. Read 2026-09-16,
not yet driven.

<a id="fn-f-omp1"></a>
**f-omp1 — OMP1.** Footnote m: `omp/pages/management/SettingsHandler::__construct()`
assigns `ROLE_ID_SITE_ADMIN` the `access` op only, against OJS's
`['access', 'settings']`; `omp/classes/template/TemplateManager.php`
builds the Content group for `ROLE_ID_SITE_ADMIN`. Read 2026-09-16, not
yet driven.

<a id="fn-f-ops1"></a>
**f-ops1 — OPS1.** Footnote m: `ops/pages/management/SettingsHandler::__construct()`
assigns `ROLE_ID_SITE_ADMIN` the `access` op only;
`ops/classes/template/TemplateManager.php` builds the Content group, with
"Comments" as its only entry, for `ROLE_ID_SITE_ADMIN`. Read 2026-09-16,
not yet driven.

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
