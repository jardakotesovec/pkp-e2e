# Tasks & discussions: differences on 3.5

> The spec, [Tasks & discussions](../../U37-tasks-and-discussions.md),
> describes `main`. This page lists only what OJS 3.5 does differently;
> anything not listed is assumed the same. Findings are in the spec's
> register, once, with the versions each is on; a ⚠ here marks one that
> 3.5 shows and `main` does not. How to read this page:
> [README](../README.md).

**Read on** OJS `stable-3_5_0` `7cf6c9c60f` (pkp-lib `5af8e67ab4`,
ui-library `fd00e45f`), 2026-11-11. OMP and OPS were not read.

**Basis.** All eleven scenarios were walked on OJS 3.5, each in two runs
on fresh scratch journals. None came out the same. Scenarios 1, 2, 3, 5,
6, 7, 10 and 11 exist on a different screen and are written out below as
3.5 has them; scenarios 4, 8 and 9 have no counterpart. Walked besides,
twice each: "Leave Discussion", "Order", a reply left unsaved, a person
removed on the Participants panel, a message sent with the Participants
panel's "Notify", and the Activity Log. The same on 3.5 by those walks,
and so not listed: who sees the list and its rows (Actors row 1), the
"Delete" question (Rule 19) and a discussion opened by "Notify" (Rule
21). The stage's notice box (Side effects) was read only after a first
discussion ("Awaiting Copyedits.", "Awaiting Galleys.") and is otherwise
compared in code. Compared in code only: the manager-level roles other
than the Journal Manager, the Guest Editor, the end of the one-hour
limit (Rule 15c), a disabled account (Rule 22), and the comments-box and
recommendation discussions (Rule 21). Not checked: the browser's
leave-page prompt (Rule 11d), an Author's edit of a discussion that
carries a file (Rule 15d), an edit of a discussion "Notify" opened (Rule
15e), and "Anonymous Reviewer/Disclosed Author" reviews (Rule 7d).

## In short

- 3.5 has discussions only. There are no tasks (no due date, no owner,
  nothing to start or complete), no History, no template screen and no
  "Auto-add at stage".
- Each stage carries a plain list, "Production Discussions" on
  Production, with the columns "Name", "From", "Last Reply", "Replies"
  and "Closed". Its windows are "Add discussion", "Update discussion"
  and the discussion's own window. There are no groups and no badges.
- The rights are split by action, not by "may manage the item". A
  Section Editor edits and closes every discussion they see. Only
  manager-level people delete. An Author or Reviewer never closes one.
  A manager-level person who is not a participant may reply, and joins
  the discussion by doing so.
- Closing is one tick in the row's "Closed" box, with no question. A
  reply from anyone but the writer of the first message reopens the
  discussion.
- The predefined messages are the journal's email templates, chosen from
  a drop-down. A reply's email has the subject "Re: {subject}". The
  writer gets no copy of their own message.
- A discussion's participants are kept apart from the Participants
  panel: the spec's Rule 23 is not here. A manager-level participant has
  "Leave Discussion".

## Actors & permissions

"Manager-level" and "participant" mean what the spec says. 3.5 has no
single "may manage the item": each action below has its own
rule. <sup>b</sup>

| Action (the spec's row) | Kind | On 3.5 |
|---|---|---|
| **Reply** ("Add New Message"; Rule 13) | different here | "Add Message": everyone who sees the row. A manager-level person who is not a participant is offered it too, and their reply makes them a participant <sup>b</sup> <sup>g</sup> |
| **"Edit"**, **"Add Task Details"** (Rule 15) | different here | "Edit": manager-level people and Section Editors, on every discussion they see, closed or not. An assistant role, the Author or a Reviewer: only on a discussion whose first message they wrote, for one hour after writing it. There is no "Add Task Details" <sup>b</sup> <sup>i</sup> |
| **"History"** (Rule 18), **"Delete"** (Rule 19) | different here | "Delete": manager-level people only, not the Section Editor and not the writer. There is no "History" <sup>b</sup> |
| **Start a task** (Rule 16) | not here | No tasks <sup>d</sup> |
| **Close or reopen** (Rule 17) | different here | The row's "Closed" box: manager-level people and Section Editors on every discussion they see, and an assistant role on a discussion they are a participant of. For the Author and the Reviewer the box is greyed, on their own discussion too <sup>b</sup> <sup>j</sup> |
| **Attach files** to a message (Rule 14) | different here | "Upload File": everyone who writes a message. "Select Files" (files already on the submission): manager-level people, Section Editors and assistant roles. The Author and the Reviewer are not offered "Select Files" <sup>h</sup> |
| **Use a template** in the "Add" window (Rule 10) | different here | The drop-down "Choose a predefined message to use, or fill out the form below.": manager-level people, Section Editors and assistant roles. The Author and the Reviewer have no such drop-down <sup>f</sup> |
| **Manage the templates** (Rules 25–26) | not here | Settings › Workflow has no "Tasks and Discussions" tab. The predefined messages are email templates, kept with the journal's other emails <sup>n</sup> |
| **"Leave Discussion"** | only here | A manager-level participant of a discussion with three or more participants <sup>k</sup> |
| **"Order"** | only here | Manager-level people and Section Editors, on a list of two or more rows <sup>k</sup> |
| **Delete a reply** | only here | A reply's writer, and manager-level people on every reply. The first message has no "Delete" <sup>g</sup> |

## Fields & validation

**The "Add discussion" and "Update discussion" window** (the spec's
"Add" and "Edit" window).

| Field (UI label) | Kind | On 3.5 |
|---|---|---|
| "Templates to get you started!" | different here | "Choose a predefined message to use, or fill out the form below.": a drop-down, blank when the window opens, with one line per predefined message of the stage (Rule 10). Not required. No search box <sup>f</sup> |
| "Name" | different here | "Subject", required. Empty, "OK" is refused with "This field is required." under it. The window states no length limit, and the spec's refusal of a name over 255 characters is not here: such a subject is not saved and the window says nothing (⚠ [A40](#a40)). It is the subject of the discussion's emails (Side effects) <sup>d</sup> <sup>e</sup> |
| "Participants" | different here | A list of boxes, one per person offered (Rule 7), each labelled "{full name}, {roles}". It opens with the signed-in person ticked. At least two must be ticked (Rule 8). No hint <sup>d</sup> |
| "Enter task information", "Due Date", "Responsible to complete this task (Task owner)", "Begin Task Upon Saving" / "Create Task (Do Not Start)" | not here | No tasks <sup>d</sup> |
| The message box (heading "Discussion") | different here | "Message", required. Rich text with copy, paste, bold, italic, underline, link, source code, full screen and image buttons. Empty, "OK" is refused with "This field is required." under it. Files are not attached from the box but in "Attached Files" below it <sup>d</sup> <sup>e</sup> |
| "Attached Files" | only here | A list under "Message" with the columns "Name", "Date" and "Component", reading "No Files" when empty, and the links "Search", "Upload File" and, for some roles, "Select Files" (Rule 14). Not required <sup>h</sup> |

**The discussion window.**

| Field (UI label) | Kind | On 3.5 |
|---|---|---|
| "Start this task" / "Complete this task" | not here | No tasks <sup>g</sup> |
| "Close this Discussion" | not here | The window has no such box. A discussion is closed from its row (Rule 17) <sup>g</sup> <sup>j</sup> |
| The new message (after "Add New Message") | different here | "Message", shown after "Add Message", with its own "Attached Files" list, "Cancel" and "OK". Empty, "OK" is refused with "Errors occurred processing this form" and "A discussion message is required." above the box <sup>g</sup> |

**The template window**: not here, every field (Rule 25). <sup>n</sup>

## Rules & state

- **Rule 1, different here.** The panel is a list headed "Pre-Review
  Discussions" on the Submission stage, "Review Discussions" on a review
  round, "Copyediting Discussions" on Copyediting and "Production
  Discussions" on Production. "Add discussion" stands at its top right.
  It has no introductory line. Its columns are "Name", "From", "Last
  Reply", "Replies" and "Closed". The rows stand in one list, the oldest
  first until someone reorders them; an empty list reads "No
  Items". <sup>a</sup>
- **Rule 2, different here.** A discussion is open or closed, and only
  its row's "Closed" box says which: ticked on a closed one. A closed
  row stays where it stood. No window shows a state. Rules 2b to 2e are
  about tasks and are not here. <sup>a</sup> <sup>j</sup>
- **Rule 3, different here.** A row's "Name" cell is the discussion's
  subject, a link that opens its window (Rule 12), with an arrow before
  it when the row offers "Edit" or "Delete" (Rule 5). "From" shows the
  username of whoever wrote the first message, and its date and time
  under it ("2026-11-11 01:06 PM"). "Last Reply" shows the same for the
  latest reply, or "-" while there is none. "Replies" counts the
  replies. <sup>a</sup>
- **Rule 4, not here.** No "Activity" column; "Last Reply" and "Replies"
  (Rule 3) are what the row says about the thread. <sup>a</sup>
- **Rule 5, different here.** The arrow before a row's name opens a
  strip under the row with "Edit" and, in red, "Delete", each shown only
  to whoever may use it (Actors). "Edit" is offered on a closed
  discussion too. A row that offers neither has no arrow. <sup>b</sup>
- **Rule 6, different here.** "Add discussion" opens a side window
  titled "Add discussion", with nothing under the title. From the top it
  holds "Participants" (Rule 7); for the roles Actors names, the
  drop-down "Choose a predefined message to use, or fill out the form
  below." (Rule 10); "Subject" and "Message", each marked with an
  asterisk; the "Attached Files" list (Rule 14); the line "Required
  fields are marked with an asterisk: *"; and "Cancel" and "OK" (Rule
  11). An assistant role or an Author assigned to the stage also reads
  "You can update this discussion for 59 minutes." above the buttons
  (Rule 15c). <sup>d</sup>
- **Rule 7, different here.** Each person is listed as "{full name},
  {roles}", the roles being those the person holds on the stage, or
  "Unassigned" for a person with none there, such as a Journal Manager
  who is not assigned. The signed-in person's box is ticked when the
  window opens; nothing marks it as "(Me)". <sup>d</sup>
  - 7a. Always: the signed-in person, and everyone assigned to the stage
    on the Participants panel (editors, assistant roles, the Author). A
    manager-level person who is not assigned is not offered to others.
  - 7b. On a review round a Section Editor is also offered every
    reviewer of the submission, whatever became of the request: one who
    has not answered, one who declined and one whose request was
    cancelled are listed like one who accepted. Each reads "{full name},
    Reviewer ({review type})", for example "Reviewer (Anonymous
    Reviewer/Anonymous Author)" or "Reviewer (Open)". <sup>m</sup>
  - 7c. To an Author, a review round offers only the reviewers of an
    "Open" review who accepted. <sup>m</sup>
  - 7d. To a Reviewer, the round offers themselves and the people
    assigned to the stage, never another reviewer. A reviewer whose
    review is "Anonymous Reviewer/Anonymous Author" is not offered the
    Author. <sup>m</sup>
  - 7e. In "Update discussion" the boxes are the people the person
    editing is offered, the discussion's participants among them ticked.
    A participant who is no longer offered has no box, and "OK" then
    takes them off the discussion. <sup>l</sup>
- **Rule 8, different here.** "OK" is refused while fewer than two
  people are ticked. The window stays open with "Errors occurred
  processing this form" and "Please ensure that you have filled out the
  message field and included someone other than yourself in the
  discussion." at its top; the subject and message stay, and the boxes
  go back to how the window opened (⚠ [A41](#a41)). Nothing requires the person saving
  to be a participant: with their own box unticked and two others
  ticked, the discussion is saved without them. On a review round a
  discussion may hold one reviewer whose review is not "Open", and then
  no second reviewer and no Author; either is refused with "A discussion
  can not be created with the selected participants because it would
  impact the anonymity of the review process.". Reviewers of "Open"
  reviews may share a discussion with the
  Author. <sup>e</sup> <sup>m</sup>
- **Rule 9, not here.** No tasks. <sup>d</sup>
- **Rule 10, different here.** The drop-down "Choose a predefined
  message to use, or fill out the form below." lists the stage's
  discussion email and the emails filed as its alternatives: on
  Production "Discussion (Production)", "Assign Editor", "Galleys
  Complete" and "Ready for Production"; on Copyediting "Discussion
  (Copyediting)" and "Request Copyedit"; on a review round "Discussion
  (Review)" and "Assign Editor". Choosing one replaces "Subject" with
  the email's subject and "Message" with its text, without asking; what
  was typed before is lost. The submission's title, its authors, its
  abstract, the journal's name and the sender's name are filled in at
  once. The recipient's name is not: the box reads "Dear
  {$recipientName},". On "OK" each participant's email opens with their
  own name ("Dear {full name},"), while the discussion's first message
  keeps "Dear {$recipientName}," (⚠ [A39](#a39)).
  "Discussion (Production)" gives the
  subject "A message regarding {journal name}" and the text "Please
  enter your message.". Choosing the blank line again changes nothing on screen
  (⚠ [A38](#a38)).
  "Update discussion" offers the same drop-down. Rules 10a and 10c (the
  search, the question before replacing) are not here. <sup>f</sup>
- **Rule 11, different here.** "OK" and "Cancel". <sup>e</sup>
  - 11a. "OK" with "Subject" or "Message" empty keeps the window open,
    sends nothing, and puts "This field is required." under each empty
    one. A refusal from the server (Rule 8) shows "Errors occurred
    processing this form" and the reason at the top of the window.
  - 11b. A successful "OK" closes the window with no notice; the list
    shows the new row, and the emails and Tasks rows of Side effects go
    out.
  - 11c. "Cancel" closes the window at once, changed or not, and asks
    nothing. The list then holds a row named "—" for the discussion that
    was not saved, shown to manager-level people and to whoever opened
    the window (⚠ [A37](#a37)). The window's "Close" control closes an unchanged window
    at once. On a changed one "Close", and Escape, first raise the
    browser's question "The data on this form has changed. Do you wish
    to continue without saving?": "Cancel" there returns to the window
    as it was, "OK" closes it. A window closed by "Close" leaves no row.
- **Rule 12, different here.** A row's name opens a side window titled
  with the discussion's subject. Under "Participants" it lists the
  participants as "{full name} ({username})", without roles; beside the
  heading stands an "Edit" link for whoever may edit (Actors). Under
  "Messages" a table "Note", "From" shows one row per message, the
  oldest first: its text, its attached files as links that download
  them, and the writer's username with the date and time. Below it stand
  "Add Message" (Rule 13) and, for whoever may leave, "Leave
  Discussion". The window has no "Save" and nothing says whether the
  discussion is closed. <sup>g</sup>
- **Rule 13, different here.** "Add Message" opens a "Message" box under
  the messages, with its own "Attached Files" list, "Cancel" and
  "OK". <sup>g</sup>
  - 13a. "OK" with the box empty shows "Errors occurred processing this
    form" and "A discussion message is required." above it and saves
    nothing.
  - 13b. "OK" saves the reply and closes the discussion's window. The
    row then shows the writer's username and the time under "Last
    Reply", and one more under "Replies". The reply goes to every other
    participant (Side effects).
  - 13c. A closed discussion still takes replies. A reply from anyone
    but the writer of the first message reopens it: its "Closed" box is
    unticked again. The first writer's own reply leaves it
    closed. <sup>j</sup>
  - 13d. A manager-level person whom someone else's "Update discussion"
    takes off the discussion while they have its window open can still
    reply from that window: the reply is saved and makes them a
    participant again. <sup>g</sup>
  - The reply form's "Cancel" closes the form and the discussion's
    window with it, and asks nothing. The row then counts one more under
    "Replies", and the window lists a message with no text from the
    person who pressed it (⚠ [A42](#a42)). The window's "Close" control, pressed while
    the reply form is open, leaves no such message. <sup>g</sup>
- **Rule 14, different here.** Every message form carries the list
  "Attached Files". <sup>h</sup>
  - "Upload File" opens "Upload a Discussion File", in three steps: "1.
    Upload File" asks for an "Article Component" (required) and the
    file, "2. Review Details" shows its name, "3. Confirm" ends with
    "Complete".
  - "Select Files" opens a window of the same name: "Files can be
    attached for inclusion in this discussion from the list below." over
    a list "Discussion Files" with the columns "Select", "Name" and
    "Component". It opens on the files of the discussion's own stage,
    the group reading "No Items" when the stage has none. "Show files
    from all accessible workflow stages." adds a group per stage the
    person may open. A ticked file is attached on "OK".
  - A chosen file shows in "Attached Files" with its number, name, date
    and component. Saved, it is listed as a link under its message and
    attached to the message's emails. The submission's own lists keep
    their file.
- **Rule 15, different here.** "Edit", in the row's strip or beside
  "Participants" in the discussion's window, opens "Update discussion":
  the "Add discussion" window holding the discussion's participants,
  subject, first message and its files. <sup>i</sup>
  - 15a. "OK" rewrites the subject, the participants, the first message
    and its files. Newly ticked participants receive the first message
    by email, with its files; nobody else is told. The
    row's "From" keeps the first message's original date and time.
    Nothing records the edit.
  - 15c. An assistant role, the Author or a Reviewer is offered "Edit"
    only on a discussion whose first message they wrote, for one hour
    after writing it. To an assistant role or an Author assigned to the
    stage the window says how long is left: "You can update this
    discussion for 58 minutes.". Manager-level people and Section
    Editors are always offered "Edit" and read no such line.
  - Rules 15b and 15f (a task made from a discussion, an overdue task)
    are not here.
- **Rule 16, not here.** No tasks. <sup>d</sup>
- **Rule 17, different here.** Ticking a row's "Closed" box closes the
  discussion at once; unticking it reopens it at once. Neither asks
  anything, emails anyone or leaves a record. The discussion's window
  has no box for it. A reply can reopen a closed discussion (Rule 13c).
  Rules 17b and 17c are about tasks and are not here. <sup>j</sup>
- **Rule 18, not here.** No "History". A discussion keeps no record of
  who was added or removed, of a closing or of a file. <sup>b</sup>
- **Rule 20, different here.** A person's roles are printed only in the
  boxes of "Add discussion" and "Update discussion" (Rule 7). The
  discussion's window lists names and usernames alone. A reviewer reads
  "Reviewer ({review type})". <sup>d</sup> <sup>m</sup>
- **Rule 21, its last source, not here.** No template makes a discussion
  by itself (Rule 26). The other three sources are as the spec says; the
  list names the sender under "From". <sup>l</sup>
- **Rule 23, not here.** `main` added this rule with
  pkp/pkp-lib#12359; 3.5 does not have it. <sup>l</sup>
- **Rules 25 and 26, not here.** No template screen, no "Auto-add at
  stage". <sup>n</sup>
- **Only here: "Leave Discussion".** The discussion's window offers it
  to a manager-level participant while the discussion has three or more
  participants. It asks "Leave Discussion", "If you leave this
  discussion you will no longer be notified of new messages. Would you
  like to leave the discussion?", with "OK" and "Cancel". "OK" closes
  the window and takes the person off the participants; being
  manager-level, they still see the row. <sup>k</sup>
- **Only here: "Order".** Once the list holds two rows, "Order" stands
  beside "Add discussion" for manager-level people and Section Editors.
  Pressed, it lets the rows be dragged and shows "Done" and "Cancel
  ordering" under the list. <sup>k</sup>
- **Only here: deleting a reply.** In the discussion's window, the arrow
  before a reply opens a strip with "Delete". The first message has no
  arrow. <sup>g</sup>

## Side effects

- **Emails, different here.** Saving a new discussion emails every
  participant but its writer; a reply emails every participant but its
  writer. The subject is the discussion's subject for the first message
  and "Re: {subject}" for a reply. The From line names the writer, the
  body is the message, with its files attached, followed by "Reply to
  this comment at #{submission number} {the author's family name} or
  unsubscribe from emails sent by {journal name}."; a Reviewer's copy
  leaves the author's name out. An edit emails only the newly added
  participants, with the first message. Closing, reopening and
  deleting email nobody. <sup>c</sup>
- **Tasks rows, different here.** A new discussion gives every
  participant but its writer the row "{writer's full name} started a
  discussion: {subject}: {message}" in the header's Tasks panel. A reply
  gives every participant but its writer "{writer's full name} replied
  to {subject}: {message}". "Delete" on the discussion removes its
  rows. <sup>c</sup>
- **Who is not told, different here.** The first message follows the
  person's "Discussion added." boxes; a reply follows their "Discussion
  activity." boxes (Settings). <sup>c</sup>
- **The submission's logs, different here.** The Activity Log gets one
  line "An email has been sent: {subject}" for each email of a new
  discussion's first message. A reply's emails leave no line. A file
  attached to a message adds its "Revision "{file name}" was uploaded
  for file {number}." line under the writer's name, as the spec says.
  The discussion keeps no history of its own (Rule 18). <sup>c</sup>
- **Auto-added items, not here.** <sup>n</sup>

## Settings that modify behavior

- **The stage's templates, not here.** The predefined messages of Rule
  10 are the journal's email templates: each stage's "Discussion (…)"
  email, described there as "This email is sent when a discussion is
  created or replied to in the production stage.", and the emails filed
  as its alternatives. They are edited with the journal's other emails,
  not on a screen of this feature. <sup>n</sup>
- **"Auto-add at stage"**, **"Limit access to specific roles"**,
  **"Enter task information" and "Due Date"** (per template), **not
  here.** <sup>n</sup>
- **The person's "Discussion added." boxes, different here.** Profile ›
  Notifications has two pairs of boxes: "Discussion added." governs the
  first message of a discussion, and "Discussion activity." governs
  replies. <sup>c</sup>

## Canonical scenarios

Every scenario below runs on a scratch journal with throwaway accounts
and scratch submissions. A discussion a Given names is made on screen
with "Add discussion" by the person it says opened it. The accounts and
the tooling recipe are in the footnote. <sup>s</sup>

- **S1, different here: open a discussion and reply.**

  Given: Journal Manager, on the Production stage of a submission with a
  Section Editor assigned, whose "Production Discussions" list is empty
  and whose "Submission Files" list holds "article.pdf".

  - **The list**: it is headed "Production Discussions" with "Add
    discussion" at its top right; the table has the columns "Name",
    "From", "Last Reply", "Replies" and "Closed" and reads "No Items"
    (Rule 1).
  - **The "Add discussion" window**: press "Add discussion": a side
    window titled "Add discussion" opens; under "Participants" the
    Section Editor is listed as "{full name}, Section editor", unticked,
    the Author as "{full name}, Author", unticked, and the Journal
    Manager as "{full name}, Unassigned", ticked; below stand the
    drop-down "Choose a predefined message to use, or fill out the form
    below.", "Subject", "Message", the list "Attached Files" reading "No
    Files", "Cancel" and "OK" (Rules 6, 7, 7a).
  - **"OK"**: type "Figure permissions" in "Subject" and "Please confirm
    the permissions for figure 2." in "Message", tick the Section Editor
    and press "OK": the window closes with no notice, and the list shows
    a row reading "Figure permissions", the Journal Manager's username
    with the date and time under "From", "-" under "Last Reply", "0"
    under "Replies" and an unticked "Closed" box (Rules 3, 11b).
  - **The Section Editor's email and Tasks row**: the Section Editor's
    mailbox holds an email whose subject is "Figure permissions", whose
    From line names the Journal Manager and whose body is "Please
    confirm the permissions for figure 2." followed by "Reply to this
    comment at #{submission number} {the Author's family name} or
    unsubscribe from emails sent by {journal name}."; the Section
    Editor's Tasks panel in the header holds the row "{the Journal
    Manager's full name} started a discussion: Figure permissions:
    Please confirm the permissions for figure 2."; the Journal Manager's
    own mailbox holds no email with that subject (Side effects).
  - **The Section Editor's view**: Section Editor: open the submission
    at Production: the row has an arrow before its name, which opens a
    strip with "Edit" and no "Delete", and its "Closed" box is not
    greyed; press "Figure permissions": a side window titled "Figure
    permissions" opens; "Participants", with an "Edit" link beside it,
    lists the two participants as "{full name} ({username})";
    "Messages" shows one row, the text and, under "From", the Journal
    Manager's username with the date and time; under it stands "Add
    Message" (Actors; Rules 5, 12).
  - **The reply**: press "Add Message": a "Message" box opens under the
    messages with its own "Attached Files" list, "Cancel" and "OK";
    press "OK": "Errors occurred processing this form" and "A discussion
    message is required." show above the box; type "Permissions
    confirmed for figure 2." and press "OK": the window closes, and the
    row shows the Section Editor's username with the date and time under
    "Last Reply" and "1" under "Replies"; press "Figure permissions"
    again: the reply is the second row of "Messages" (Rules 13a, 13b).
  - **The Journal Manager's side**: Journal Manager: the mailbox holds
    an email with the subject "Re: Figure permissions", from the Section
    Editor, carrying the reply; the Tasks panel holds the row "{the
    Section Editor's full name} replied to Figure permissions:
    Permissions confirmed for figure 2." (Side effects).
  - **A file of the submission**: Section Editor: press "Figure
    permissions", "Add Message", then "Select Files" in "Attached
    Files": a window "Select Files" reads "Files can be attached for
    inclusion in this discussion from the list below." and lists, under
    "Production", "No Items"; press "Show files from all accessible
    workflow stages.": a group "Submission" lists "article.pdf"; tick it
    and press "OK": "Attached Files" lists "article.pdf"; type "The
    signed form is attached." and press "OK"; press "Figure permissions"
    again: the third message shows a link "article.pdf" that downloads
    the file; the Journal Manager's email of this reply has
    "article.pdf" attached, and the Submission stage's "Submission
    Files" still lists "article.pdf" once (Actors; Rule 14).
  - **Control**: Journal Manager: the same row's strip offers "Edit" and
    "Delete", where the Section Editor's offered "Edit" alone; in the
    discussion's window each reply has an arrow that opens a strip with
    "Delete", and the first message has none (Actors; Rules 5, 12).

- **S2, different here: what "Add discussion" refuses, and "Cancel".**

  Given: Journal Manager, on the Production stage of a submission with a
  Section Editor assigned, whose "Production Discussions" list is empty.

  - **Required fields**: press "Add discussion", then "OK" at once:
    "This field is required." shows under "Subject" and under "Message",
    and the window stays open (Fields; Rule 11a).
  - **One participant**: type "Layout question" in "Subject" and "Is the
    layout final?" in "Message", and press "OK" with only the Journal
    Manager ticked: "Errors occurred processing this form" and "Please
    ensure that you have filled out the message field and included
    someone other than yourself in the discussion." show at the top of
    the window, which keeps the subject and the message (Rules 8, 11a).
  - **No task fields**: the window holds "Participants", the predefined
    message drop-down, "Subject", "Message" and "Attached Files", and
    nothing about a due date or an owner (Rule 9).
  - **Saved after the refusal**: tick the Section Editor and press "OK":
    the window closes and the list shows "Layout question" (Rule 11b).
  - **"Close" on an untouched window**: press "Add discussion", then the
    window's "Close" control: the window closes at once, and after a
    reload the list holds "Layout question" alone (Rule 11c).
  - **"Close" on a changed window**: press "Add discussion", type
    "Layout question" in "Subject" and "Is the layout final?" in
    "Message", and press "Close": the browser asks "The data on this
    form has changed. Do you wish to continue without saving?"; answer
    "Cancel": the window is as it was, "Subject" still reading "Layout
    question"; press Escape: the same question; answer "Cancel"; press
    "Close" and answer "OK": the window closes, and after a reload the
    list holds "Layout question" alone (Rule 11c).
  - **"Cancel"**: press "Add discussion", type "Layout question" in
    "Subject", and press "Cancel": the window closes at once, with no
    question; after a reload the list holds a second row named "—", with
    the Journal Manager's username under "From" (Rule 11c; A37).
  - **Control**: press "Add discussion", type "Layout answer" in
    "Subject" and "The layout is final." in "Message", tick the Section
    Editor and press "OK": the discussion is listed, so the refusals
    above were the window's rules at work (Rules 8, 11b).

- **S3, different here: predefined messages in the "Add discussion"
  window.**

  Given: Journal Manager, on the Production stage of a submission with a
  Section Editor assigned, on a journal whose emails are the install
  default.

  - **The list**: press "Add discussion": the drop-down "Choose a
    predefined message to use, or fill out the form below." is blank and
    offers "Discussion (Production)", "Assign Editor", "Galleys
    Complete" and "Ready for Production" (Rule 10).
  - **Choosing a message**: type "Layout check" in "Subject", then
    choose "Discussion (Production)": "Subject" reads "A message
    regarding {journal name}" and "Message" reads "Please enter your
    message."; nothing asked before "Layout check" was replaced (Rule
    10).
  - **A letter**: choose "Assign Editor": "Subject" reads "You have been
    assigned as an editor on a submission to {journal name}", and
    "Message" holds a letter that opens "Dear {$recipientName}," and
    names the submission's title, its Author and the Journal Manager as
    its sender (Rule 10).
  - **The recipient's name on "OK"**: tick the Section Editor and press
    "OK": the discussion is listed under the letter's subject; the
    Section Editor's email opens "Dear {the Section Editor's full
    name},", while the first message in the discussion's window opens
    "Dear {$recipientName}," (Rule 10; A39).
  - **Control**: Author, on the same submission at Production: press
    "Add discussion": the window holds "Participants", "Subject",
    "Message" and "Attached Files" and no drop-down (Actors).

- **S4, not here.** No tasks: the window of S2 has no field for one.

- **S5, different here: close and reopen.**

  Given: Journal Manager, on the Production stage of a submission with a
  Section Editor assigned, whose list holds the discussions "Cover
  image" and "Second thread", both opened by the Journal Manager with
  the Section Editor.

  - **Closed from the row**: tick the "Closed" box of "Cover image":
    nothing asks, the box is ticked, and after a reload it is still
    ticked and the row stands where it stood (Rules 2, 17).
  - **The closed discussion**: the row's strip still offers "Edit" and
    "Delete"; press "Cover image": its window still offers "Add Message"
    and says nothing about being closed (Rules 5, 12).
  - **The writer's own reply**: press "Add Message", type "A note from
    the writer while closed." and press "OK": the row shows "1" under
    "Replies", and its "Closed" box is still ticked (Rule 13c).
  - **Another participant's reply**: Section Editor: press "Cover
    image", "Add Message", type "One more change to the cover." and
    press "OK": the row shows "2" under "Replies" and its "Closed" box
    is unticked; the Journal Manager receives the reply by email under
    the subject "Re: Cover image" (Rule 13c; Side effects).
  - **Reopened from the row**: Journal Manager: tick the "Closed" box of
    "Cover image" again, then untick it: neither asks, and after a
    reload the box is unticked (Rule 17).
  - **The Section Editor closes**: Section Editor: tick the "Closed" box
    of "Second thread", which the Journal Manager opened: the box is
    ticked, also after a reload (Actors).
  - **No task**: Journal Manager: the strip of "Cover image" offers
    "Edit" and "Delete" and no "Add Task Details", and "Update
    discussion" has no field about a task (Rule 15).
  - **Control**: the Section Editor's mailbox holds two emails about
    "Cover image", its first message and the Journal Manager's reply,
    and none from the closings or the reopening (Rule 17).

- **S6, different here: edit a discussion, leave it, delete it.**

  Given: Journal Manager, on the Production stage of a submission with
  two Section Editors and its Author assigned, whose list holds "Proof
  corrections", which the Journal Manager opened with the first Section
  Editor and the Author, its first message "Please send your
  corrections.", and "Second thread", which the Journal Manager opened
  with the first Section Editor.

  - **The row's strip**: the arrow before "Proof corrections" opens a
    strip with "Edit" and "Delete", and nothing else (Rules 5, 18).
  - **"Edit"**: press it: a window titled "Update discussion" opens;
    "Participants" lists the first Section Editor, the Author and the
    Journal Manager ticked and the second Section Editor unticked;
    "Subject" reads "Proof corrections" and "Message" holds "Please send
    your corrections." (Rule 15).
  - **The edit saved**: replace the subject with "Final proof
    corrections", tick the second Section Editor, untick the Author,
    replace the message with "Please send your final corrections.",
    press "Upload File" in "Attached Files", choose "Article Text" as
    "Article Component", upload "profile-image-400.png" and press
    "Continue", "Continue" and "Complete": "Attached Files" lists the
    file; press "OK": the window closes and the row reads "Final proof
    corrections", its "From" unchanged (Rules 14, 15a).
  - **Who is told**: the second Section Editor receives an email whose
    subject is "Final proof corrections", whose body is "Please send
    your final corrections." and which has "profile-image-400.png"
    attached (Rule 15a; Side effects).
  - **The discussion's window**: press "Final proof corrections":
    "Participants" lists the two Section Editors and the Journal
    Manager, and the first message reads "Please send your final
    corrections." with a link "profile-image-400.png" (Rules 12, 15a).
  - **"Leave Discussion"**: in the same window press "Leave Discussion":
    it asks "If you leave this discussion you will no longer be notified
    of new messages. Would you like to leave the discussion?" with "OK"
    and "Cancel"; press "OK": the window closes; press "Final proof
    corrections": "Participants" lists the two Section Editors alone,
    and "Leave Discussion" is gone; the window of "Second thread", with
    two participants, never offered it (Only here: "Leave Discussion").
  - **The Author's list**: Author: open the submission at Production:
    the list reads "No Items" (Actors).
  - **"Order"**: Journal Manager: press "Order" beside "Add discussion":
    "Done" and "Cancel ordering" show under the list; press "Cancel
    ordering"; the Author's list has no "Order" (Only here: "Order").
  - **"Delete"**: press "Delete" in the strip of "Final proof
    corrections": a dialog titled "Delete" asks "Are you sure you wish
    to delete this item? This action cannot be undone." with "OK" and
    "Cancel"; press "Cancel": the row stays; press "Delete" again and
    "OK": the row is gone, also after a reload; the first Section
    Editor's Tasks panel no longer holds the row "… started a
    discussion: Proof corrections: …" the discussion gave them (Rule
    19).
  - **Control**: the Author and the first Section Editor have no email
    with the subject "Final proof corrections", while the second Section
    Editor has one: the edit told only the newly added participant (Rule
    15a).

- **S7, different here: the Author's discussions.**

  Given: Author, on their submission at Production, with a Section
  Editor assigned and the Journal Manager not assigned; the list holds
  "Proof queries", which the Section Editor opened with the Author, and
  "Editorial notes", which the Journal Manager opened with the Section
  Editor.

  - **The Author's list**: it shows "Proof queries" alone; the row has
    no arrow and its "Closed" box is greyed (Actors).
  - **The reply**: press "Proof queries": the window has no "Edit" link;
    press "Add Message": "Attached Files" offers "Search" and "Upload
    File" and no "Select Files"; type "The proofs look fine." and press
    "OK": the row shows the Author's username under "Last Reply", and
    the Section Editor receives the reply by email under the subject
    "Re: Proof queries" (Actors; Rules 12, 13b, 14).
  - **Who the Author is offered**: press "Add discussion":
    "Participants" lists the Section Editor as "{full name}, Section
    editor", unticked, and the Author as "{full name}, Author", ticked,
    and not the Journal Manager; the window has no predefined message
    drop-down, and above "Cancel" and "OK" it reads "You can update this
    discussion for 59 minutes." (Rules 6, 7, 7a, 15c).
  - **One box ticked**: type "Figure 3" in "Subject" and "Here is the
    corrected figure 3." in "Message", untick the Author's own box, tick
    the Section Editor and press "OK": "Please ensure that you have
    filled out the message field and included someone other than
    yourself in the discussion." shows at the top, and the boxes are
    back as the window opened, the Author's ticked and the Section
    Editor's not (Rule 8).
  - **An uploaded file**: tick the Section Editor, press "Upload File"
    in "Attached Files", choose "Article Text", upload
    "profile-image-400.png" and press "Continue", "Continue" and
    "Complete"; press "OK": the list shows "Figure 3" with the Author's
    username under "From"; its window shows a link
    "profile-image-400.png" under the message that downloads the file
    (Rules 12, 14).
  - **The Author's own row**: the row of "Figure 3" has an arrow that
    opens a strip with "Edit" and no "Delete", and its "Closed" box is
    greyed; "Edit" opens "Update discussion", which reads "You can
    update this discussion for 58 minutes." (Actors; Rule 15c).
  - **The Section Editor's email**: its subject is "Figure 3", its From
    line names the Author, and "profile-image-400.png" is attached; the
    Author's own mailbox holds no email with that subject (Side
    effects).
  - **The Journal Manager, not a participant**: Journal Manager: open
    the submission at Production: the list shows "Proof queries",
    "Editorial notes" and "Figure 3"; press "Figure 3": "Participants"
    lists the Section Editor and the Author, and "Add Message" is
    offered; press it, type "Thank you, the figure is in." and press
    "OK"; press "Figure 3" again: "Participants" now lists the Journal
    Manager too; the Author and the Section Editor each receive the
    reply under the subject "Re: Figure 3" (Actors; Rule 13).
  - **Control**: the Journal Manager's list shows "Editorial notes",
    which the Author's list did not (Actors).

- **S8 and S9, not here.** Settings › Workflow has the tabs
  "Submission", "Review", "Publisher Library" and "Emails" and no
  "Tasks and Discussions"; nothing adds a discussion by itself.

- **S10, different here: the Copyeditor's discussion.**

  Given: Copyeditor, on the Copyediting stage of a submission with a
  Section Editor and the Copyeditor assigned, whose "Copyediting
  Discussions" list holds "Copyedit the manuscript", which the Journal
  Manager opened with the Copyeditor, and "Editorial notes", which the
  Journal Manager opened with the Section Editor.

  - **The Copyeditor's list**: it shows "Copyedit the manuscript" alone;
    the row has no arrow, and its "Closed" box is not greyed (Actors).
  - **A reply with a file**: press "Copyedit the manuscript": the window
    has no "Edit" link; press "Add Message": "Attached Files" offers
    "Search", "Upload File" and "Select Files"; press "Upload File",
    choose "Article Text", upload "notes.md" and press "Continue",
    "Continue" and "Complete"; type "Copyedits done; my notes are
    attached." and press "OK": the row shows "1" under "Replies", and
    the reply in the window shows a link "notes.md" (Actors; Rules 13b,
    14).
  - **Closed by the Copyeditor**: tick the row's "Closed" box: nothing
    asks, and the box stays ticked after a reload (Actors; Rule 17).
  - **The Copyeditor's own discussion**: press "Add discussion": the
    window offers the drop-down with "Discussion (Copyediting)" and
    "Request Copyedit" and reads "You can update this discussion for 59
    minutes."; type "Style question" in "Subject" and "Which style guide
    applies?" in "Message", tick the Section Editor and press "OK": the
    new row has an arrow that opens a strip with "Edit" and no "Delete";
    press "Edit", replace the subject with "Style guide question" and
    press "OK": the row reads "Style guide question" (Actors; Rules 10,
    15c).
  - **The Journal Manager's side**: Journal Manager: the row of
    "Copyedit the manuscript" has its "Closed" box ticked; the mailbox
    holds the reply under the subject "Re: Copyedit the manuscript",
    from the Copyeditor, with "notes.md" attached (Side effects).
  - **Control**: the Journal Manager's list shows "Editorial notes",
    which the Copyeditor's list did not (Actors).

- **S11, different here: reviewers and the Author on a review round.**

  Given: Section Editor, assigned to a submission in its first review
  round with its Author and two Reviewers who accepted, under the
  journal's default review type "Anonymous Reviewer/Anonymous Author";
  and, on a second scratch journal whose "Default Review Mode" is
  "Open", a Section Editor assigned to a submission in review with its
  Author, one Reviewer who accepted, one who has not answered and one
  who declined.

  - **Who the Section Editor is offered**: on the review round, press
    "Add discussion" on "Review Discussions": "Participants" lists the
    Section Editor, ticked, the Author, and both Reviewers, each as
    "{full name}, Reviewer (Anonymous Reviewer/Anonymous Author)"; the
    drop-down offers "Discussion (Review)" and "Assign Editor" (Rules 7,
    7a, 7b, 10, 20).
  - **Two reviewers**: type "Question for the reviewer" in "Subject" and
    "Please look again at figure 2." in "Message", tick both Reviewers
    and press "OK": "A discussion can not be created with the selected
    participants because it would impact the anonymity of the review
    process." shows at the top of the window, and the boxes are back as
    the window opened (Rule 8).
  - **A reviewer with the Author**: tick the first Reviewer and the
    Author and press "OK": the same refusal (Rule 8).
  - **Saved**: tick the first Reviewer alone and press "OK": the list
    shows "Question for the reviewer" with the Section Editor's username
    under "From" (Rule 3).
  - **The Reviewer's email**: the first Reviewer receives "Please look
    again at figure 2." by email under the subject "Question for the
    reviewer"; its footer reads "Reply to this comment at #{submission
    number} or unsubscribe …", with no author's name after the number
    (Side effects).
  - **The Reviewer's list**: the first Reviewer: open the review and go
    on to step 3 of the review form: its "Review Discussions" list shows
    "Question for the reviewer", the row with no arrow and a greyed
    "Closed" box; press it: the window has no "Edit" link; press "Add
    Message": "Attached Files" offers "Search" and "Upload File"; type
    "Figure 2 is fine now." and press "OK": the Section Editor receives
    the reply by email under the subject "Re: Question for the reviewer"
    (Actors; Rules 12, 13b).
  - **Who the Reviewer is offered**: press "Add discussion" on the same
    list: "Participants" lists the Reviewer, ticked, and the Section
    Editor, and neither the Author nor the other Reviewer; the window
    has no predefined message drop-down (Actors; Rule 7d).
  - **The Author on the review round**: Author: open the submission at
    its review round: "Review Discussions" reads "No Items"; press "Add
    discussion": "Participants" lists the Author and the Section Editor
    and no Reviewer (Rule 7c).
  - **A cancelled request**: Section Editor: on the Reviewers panel
    choose "Cancel Reviewer" in the first Reviewer's "More Actions" and
    confirm with "Cancel Reviewer": the row reads "Request Cancelled";
    "Add discussion" still offers both Reviewers (Rule 7b).
  - **An "Open" review, the Section Editor's list**: on the second
    journal, the Section Editor's "Add discussion" lists all three
    Reviewers, each as "{full name}, Reviewer (Open)": the one who
    accepted, the one who has not answered and the one who declined
    (Rule 7b).
  - **An "Open" review, the Author's discussion**: Author: on the same
    submission, press "Add discussion" on "Review Discussions":
    "Participants" lists the Section Editor and the Reviewer who
    accepted, as "{full name}, Reviewer (Open)", and neither of the
    other two; type "About point 3" in "Subject" and "Could you say more
    about point 3?" in "Message", tick the Reviewer and press "OK": the
    discussion is listed; Reviewer: the list at step 3 of the review
    form shows "About point 3" (Rules 7c, 8).
  - **An "Open" review, a reviewer with the Author**: Section Editor:
    press "Add discussion", type "Open thread" in "Subject" and "An open
    thread." in "Message", tick the Author and the Reviewer who accepted
    and press "OK": the discussion is saved (Rule 8).
  - **Control**: on the first journal, the Author's "Add discussion"
    listed no Reviewer, where the "Open" review's Author is offered one:
    the review type alone makes the difference (Rule 7c).

## Code anchors

Files 3.5 has and `main` no longer has.

- **Model**: `lib/pkp/classes/query/Query.php`, `QueryParticipant.php`
  and `Repository.php`.
- **List, windows and rights**: `lib/pkp/controllers/grid/queries/`
  (`QueriesGridHandler.php`, `QueriesGridRow.php`,
  `QueriesGridCellProvider.php`, `QueriesAccessHelper.php`,
  `QueryNotesGridHandler.php`, `QueryNotesGridRow.php`,
  `form/QueryForm.php`, `form/QueryNoteForm.php`).
- **Attached files**: `lib/pkp/controllers/grid/files/query/`
  (`QueryNoteFilesGridHandler.php`,
  `ManageQueryNoteFilesGridHandler.php`).
- **Templates**: `lib/pkp/templates/controllers/grid/queries/`
  (`readQuery.tpl`, `participants.tpl`, `form/queryForm.tpl`,
  `form/queryNoteForm.tpl`).
- **Scripts**: `lib/pkp/js/controllers/grid/queries/`
  (`QueryFormHandler.js`, `ReadQueryHandler.js`).

<a id="footnotes"></a>
## Footnotes — evidence

Every footnote's walk is the kept script
`lines/stable-3_5_0/shared/playwright/checks/U37-stable-3_5_0/W1/walk.js` (helpers in
`lib.js` beside it), run on 2026-11-11, each part twice on fresh scratch
data as `PROBE_RUN=s1` and `s2`. Part `s1` ran a third time (`s3`): two
of its steps were added after its first run, so its snapshot names below
are those of runs `s2` and `s3`. The snapshots are
`.reports/lines35/u37body/<name>-<run>-ojs.json`, and each part's reads
are in `<part>-facts-<run>-ojs.json` ("facts `s5.closeFromRow`" is the
key `closeFromRow` of part `s5`).

<a id="fn-a"></a>
**a** — The list. Part `s1`: `s1-01-mgr-production`, `s1-04-mgr-after-add`, `s1-13-mgr-after-reply` (heading, "Add discussion", columns, "No Items", a row's cells before and after a reply). Part `x`: `x-01-mgr-submission`, `x-02-mgr-copyediting`, `x-03-mgr-production`, facts `x.headings` ("Pre-Review Discussions", "Copyediting Discussions", "Production Discussions"); part `s11`: `s11-01-se1-review-round` ("Review Discussions"). Code: `QueriesGridHandler::initialize()` (titles `submission.queries.submission`, `.review`, `.editorial`, `.production`; columns `QueryTitleGridColumn`, `from`, `lastReply`, `replies`, `closed`), `loadData()` (`orderBy('seq')`), `QueriesGridCellProvider::getTemplateVarsFromRowColumn()`.

<a id="fn-b"></a>
**b** — Who is offered what. The Journal Manager's strip "Edit", "Delete" (`s1-19-mgr-row-strip`, `s6-02-mgr-row-strip`); the Section Editor's "Edit" alone and a live "Closed" box on a discussion the Journal Manager wrote (`s1-07-se1-row-strip`, facts `s1.se1RowActions`, `s5.se1Close`); the Author's row with no arrow and a greyed box, and "Edit" alone on their own discussion (`s7-01-author-production`, `s7-10-author-own-strip`); the Copyeditor's row with no arrow and a live box, and "Edit" alone on their own (`s8-08-ce-copyediting`, facts `s8.ceRowActions`, `s8.ceClose`, `s8.ceOwnRow`); the Reviewer's row with no arrow and a greyed box (facts `s11.rv1Grid`, `s11.rv1RowActions`); no "History" anywhere (facts `s6.history`). The Journal Manager who is not a participant replying and joining: `s7-14-mgr-figure3-window`, `s7-15-mgr-after-reply`. Code: `QueriesAccessHelper` (`getCanEdit()`: manager, site admin and sub-editor roles always, assistant, author and reviewer roles while they wrote the head note less than an hour ago; `getCanDelete()`: manager and site admin, and anyone on their own discussion without a subject; `getCanOpenClose()`: manager, site admin and sub-editor roles, and an assigned assistant; `getCanListAll()`: manager and site admin), `QueriesGridRow::initialize()`, `QueryNoteForm::execute()` (adds the writer to the participants). The other manager-level roles, the Guest Editor and the end of the hour are read in this code only.

<a id="fn-c"></a>
**c** — Emails, Tasks rows and logs. Part `s1`: facts `se1Mail` (subject, From, footer), `mgrMailAfterAdd` (none), `se1Tasks` ("… started a discussion: …"), `mgrMailReply` ("Re: Figure permissions"), `mgrTasksAfterReply` ("… replied to …"), `activityLog` with `s1-22-mgr-activity-log` (one "An email has been sent: Figure permissions" line, none for the two replies, and the Section Editor's "Revision "article.pdf" was uploaded for file …" line). An edit's email to the added participant alone: facts `s6.mailAfterEdit`. No email from closing or reopening: facts `s5.controlMail`. The Tasks rows gone after "Delete": facts `s6.se1TasksAfterDelete`. A Reviewer's footer without the author's name: facts `s11.rv1Mail`. Code: `QueriesGridHandler::updateQuery()` (notifies the participants the save added, the writer being one already; `NOTIFICATION_TYPE_NEW_QUERY`; `logMailable()`), `QueryNotesGridHandler::insertedNoteNotify()` (`NOTIFICATION_TYPE_QUERY_ACTIVITY`, subject `common.re` "Re:" and the title, no `logMailable()`), locale `submission.query.new`, `submission.query.activity`, `notification.type.queryAdded`, `notification.type.queryActivity`. The two pairs of boxes were walked on 3.5 for the issue report `docs/issues/U05-A1-discussion-activity-choice-governs-nothing.md`, not here.

<a id="fn-d"></a>
**d** — The "Add discussion" window. `s1-02-mgr-add-window` (title, boxes, drop-down, "Subject", "Message", toolbar, "Attached Files", "Cancel", "OK"); facts `s2.taskFields` (the window's inputs: `users[]`, `template`, `subject`, `comment`, and no task field); the Author's window with the time line and no drop-down: `s7-05-author-add-window`; the Copyeditor's with both: `s8-14-ce-add-window`; the Reviewer's with neither: `s11-09-rv1-add-window`; a subject of 300 characters: facts `x.longSubject`, `x-10-mgr-long-subject`. Code: `QueryForm::fetch()` (`submission.query.participantTitle` "{$fullName}, {$userGroup}", `submission.status.unassigned`; `allowedEditTimeNotice` for a person assigned to the stage as assistant or author), `templates/controllers/grid/queries/form/queryForm.tpl`.

<a id="fn-e"></a>
**e** — Refusals and leaving the window. Part `s2`: `s2-01-empty-ok` ("This field is required." twice, no request), `s2-02-one-participant` (the refusal's text), `s2-03-saved-after-refusal`, facts `cancelUntouched`, `cancelChanged`, `cancelAfterRefusal` (no question, no request, one more "—" row each: `s2-04-cancel-untouched`, `s2-06-cancel-changed`, `s2-08-cancel-after-refusal`), `closeUntouched`, `closeChangedNo`, `closeAfterRefusal` (the browser's question on a changed window, answered "Cancel", Escape, then "OK"; a `delete-query` request and no new row), `emptyRow` with `s2-10-empty-row-strip` (the "—" row's cells and strip), `emptyRowSe1` (the Section Editor's list without it). The person saving left out: facts `s6.authorLeftOut`, `s6-16-author-left-out-saved`. The Author's one box and the boxes after a refusal: `s7-06-author-creator-unticked`, facts `s11.twoReviewers`. Code: `QueryForm::__construct()` (the window makes its discussion when it opens; `FormValidatorCustom` on `users`, `stageParticipants.notify.warning`), `js/controllers/form/CancelActionAjaxFormHandler.js`, `FormHandler.js` (`form.dataHasChanged`).

<a id="fn-f"></a>
**f** — Predefined messages. Part `s2`, facts `templates`, with `s2-12-template-discussion`, `s2-13-template-assign-editor`, `s2-14-template-blank-again`, `s2-16-template-discussion-window` and the mail read (the email "Dear {full name},", the first message "Dear {$recipientName},"). The Copyediting and review lists: facts `s8.addFormCopyediting`, `s11.se1AddForm`. No drop-down for the Author and the Reviewer: facts `s7.authorAddForm`, `s11.rv1AddForm`. Code: `QueryForm::fetch()` (the stage mailable's template and those `alternateTo` it, for manager, sub-editor and assistant roles), `QueriesGridHandler::fetchTemplateBody()`, `js/controllers/grid/queries/QueryFormHandler.js`, `registry/emailTemplates.xml` (the Submission stage's list, "Discussion (Submission)" and "Assign Editor", is read there only).

<a id="fn-g"></a>
**g** — The discussion's window and replies. `s1-08-se1-discussion-window`, `s1-10-se1-reply-empty-ok`, `s1-11-se1-after-reply` (the window closed, the row's "Last Reply" and "Replies"), `s1-12-se1-window-after-reply`, `s1-21-mgr-reply-strip` with facts `s1.mgrWindow` (`replyActions`: "Delete"; the first message without an arrow). The Author's own reply with an arrow: facts `s7.authorReply`. "Cancel" and "Close" on an unsaved reply: facts `x.replyLeft`, `x-12-mgr-window-after-reply-cancel`. Rule 13d was walked on 3.5 for the issue report `docs/issues/U37-A36-taken-off-manager-reply-unexpected-error.md` ("3.5, walked: the reply answered 200"), not here. Code: `templates/controllers/grid/queries/readQuery.tpl`, `participants.tpl`, `QueryNotesGridHandler` (`getCanManage()`: the note's writer, and manager, site admin, sub-editor and assistant roles; a Section Editor's or an assistant's "Delete" on another person's reply is read there only), `QueryNotesGridRow::initialize()` (no action on the head note), `QueryNoteForm` (`submission.queries.messageRequired`).

<a id="fn-h"></a>
**h** — Attached files. "Upload File": `s6-04-mgr-edit-filled`, facts `s6.editSave.upload`, `s7.authorUpload.upload`, `s8.ceReply.upload` (the wizard's title, steps and "Article Component"). "Select Files": `s1-14-se1-select-files`, `s1-15-se1-select-files-all-stages`, `s1-17-se1-after-file-reply`, `s1-18-se1-submission-stage`, facts `s1.selectFiles`, `s1.fileDownload`, `s1.mgrMailFile`, `s1.submissionFilesAfter`; the Copyeditor's: `s8-12-ce-select-files`. The links each role is offered: facts `s1.filesGridLinks`, `s7.authorFileLinks`, `s8.ceReply.links`, `s11.rv1Reply.links`. Code: `controllers/grid/files/query/QueryNoteFilesGridHandler.php` (`setCanManage(true)` for manager, site admin, sub-editor and assistant roles), `templates/controllers/grid/files/query/manageQueryNoteFiles.tpl`.

<a id="fn-i"></a>
**i** — "Update discussion". `s6-03-mgr-edit-window`, `s6-05-mgr-after-edit`, `s6-06-mgr-window-after-edit`, facts `s6.editForm`, `s6.editSave`, `s6.gridAfterEdit`, `s6.windowAfterEdit`, `s6.mailAfterEdit`; the time line: `s7-11-author-own-edit`, `s8-16-ce-own-edit`, facts `s7.authorOwnEdit`, `s8.ceOwnEdit`. Code: `QueriesGridHandler::editQuery()`, `updateQuery()`, `QueryForm::execute()`.

<a id="fn-j"></a>
**j** — Closing and reopening. Part `s5`: facts `closeFromRow`, `reopenFromRow` (no question; `close-query`, `open-query`), `gridClosedAfterReload`, `closedRowActions`, `closedWindowMgr` with `s5-04-mgr-closed-window`, `writerReplyOnClosed` (still ticked), `otherReplyOnClosed` with `s5-08-se1-grid-after-reply` (unticked), `se1Close`, `noTask`, `controlMail`. Code: `QueriesGridCellProvider::getCellActions()` (an `AjaxAction`, no confirmation), `QueryNoteForm::execute()` ("Re-open the query" when the writer is not the head note's).

<a id="fn-k"></a>
**k** — "Leave Discussion" and "Order". Facts `s6.leave` with `s6-08-mgr-leave-confirm` and `s6-10-mgr-window-after-leave`, `s6.leaveTwo`, `s6.order` with `s6-12-mgr-order-mode`, `s6.orderSe1`, `s6.orderAuthor`. The rows were not dragged. Code: `QueriesGridHandler::_getCurrentUserCanLeave()` (manager or site admin among three or more participants), `leaveQuery()`, `initFeatures()` (`OrderGridItemsFeature` when `getCanOrder()`).

<a id="fn-l"></a>
**l** — Removal and "Notify". Part `x`: facts `removeParticipant` with `x-04-mgr-remove-participant` and `x-06-mgr-window-after-remove`, `editAfterRemove` with `x-07-mgr-edit-after-remove`, `se2AfterRemove` ("The current role does not have access to this operation."), `notify` with `x-13-mgr-notify-form` and `x-14-mgr-after-notify` (the "Notify" window's own drop-down; the discussion listed with the sender under "From"). Code: `main` added Rule 23 with pkp/pkp-lib#12359 (`removeParticipantFromSubmissionTasks()`), which 3.5 does not have. The comments-box and recommendation discussions are read in `classes/query/Repository.php` and `classes/decision/types/traits/IsRecommendation.php` only.

<a id="fn-m"></a>
**m** — The review round. Part `s11`: facts `se1AddForm`, `twoReviewers`, `reviewerWithAuthor` (one refusal text for both: `s11-03-se1-two-reviewers`, `s11-04-se1-reviewer-with-author`), `saved`, `rv1Mail`, `rv1Grid` with `s11-06-rv1-step3`, `rv1Reply`, `rv1AddForm`, `authorReview`, `cancelReviewer` with `s11-13-se1-after-cancel` and `s11-14-se1-window-after-cancel`, `se1AddAfterCancel`, `se1EditAfterCancel`, `openSeAddForm` with `s11-17-open-se-add-window`, `openAuthorDiscussion`, `openReviewerGrid`, `openSeTwoWithAuthor`. Code: `QueryForm::fetch()` (an editor is offered every review assignment's reviewer; an author those of open reviews with `getDateConfirmed()` and not declined; an anonymous reviewer loses the authors), `QueryForm::validate()` (`editor.discussion.errorAnonymousParticipants`).

<a id="fn-n"></a>
**n** — No template screen. Part `s8`: facts `workflowSettings` with `s8-01-mgr-settings-workflow` (the tabs), `emailTemplates` with `s8-02-mgr-manage-emails` (the "Discussion (…)" emails and their descriptions, at `management/settings/manageEmails`). Code: `lib/pkp/classes/editorialTask/` (with `Template.php`) is on `main` only.

<a id="fn-s"></a>
**s** — Accounts and tooling. Each part makes a scratch journal with `POST scenarios/context` and throwaway accounts (`manager`, two `sectionEditor`, `author`, `copyeditor`, and for S11 `externalReviewer`; passwords the username twice), then a submission with `POST scenarios/submission`: Production is `decisions: ['skipExternalReview', 'sendToProduction']`, Copyediting `decisions: ['skipExternalReview']`, the review round `decisions: ['sendExternalReview']` with `reviewRounds: [{reviewers: […]}]`; the people assigned are `participants[]`, and "article.pdf" is `files: [{file: 'article.pdf'}]`. The "Open" journal of S11 adds `review: {defaultReviewMode: 'open'}`. On 3.5 the scenario key `tasks[]` answers 500 (it reaches a class `main` alone has), so a discussion a Given names is made on screen with "Add discussion". The workflow opens at `dashboard/editorial?workflowSubmissionId={id}&workflowMenuKey=workflow_5` (`workflow_1` Submission, `workflow_3_{round id}` a review round, `workflow_4` Copyediting), the Author's view at `dashboard/mySubmissions` with the same query, the review form at `reviewer/submission/{id}`.

## Findings on 3.5 (pilot notes)

Which of `main`'s register entries 3.5 shows, as the pilot's walk found
them, for the build-out's register read (`docs/process/VERSIONS.md` step
3). The IDs are those of `main`'s spec, `../../U37-tasks-and-discussions.md`.

| ID | Finding | Seen on |
|----|---------|---------|
| A1 | On a press and a preprint server as shipped, saving a discussion or a reply ends in an error dialog, and nobody is emailed or told | main |
| A2 | The "Add" and "Edit" windows for a task or discussion show "Open for What? Open to What? Beyond Content" under the title | main |
| A3 | Whoever opens a discussion or replies gets their own message back by email and as a Tasks row | main |
| A5 | Each template in the "Add" window says it fills "Participants", but choosing one never does | main |
| A6 | A task's owner is offered "Edit" but cannot save even a new due date on a task someone else opened | main |
| A7 | A press or preprint server refuses a discussion edit with a raw key, not the reason | main |
| A10 | A task's "Due Date" before today is refused with a message about a start date | main |
| A15 | In French, the template search for a new task or discussion is labelled "find an email template" | main |
| A16 | A task due today already reads "Overdue" | main |
| A17 | A closed task past its due date still reads "This task is overdue. Remind the task owner…" | main |
| A21 | A refused task or discussion window tells screen-reader users "Go to undefined" for the empty message box | main |
| A25 | A discussion turned into a task reads "Begin Task Upon Saving", but the saved task is not begun | main |
| A26 | After "No" to a Tasks & Discussions box's question, a screen reader hears the box in the opposite state | main |
| A28 | A discussion turned into a task reads "Task created by …" in its History | main |
| A29 | A file attached to the first message in the "Add" window never shows in the discussion's History | main |
| A31 | A discussion's letter keeps "{$signature}" when its writer is not a participant: auto-added, or a manager stays out | main |
| A32 | A task's "Started" and "Closed" boxes, and every template's "Auto-add at stage" box, have names a screen reader cannot tell apart | main |
| A33 | A task's or discussion's History lists the lines one save writes within a second oldest first | main |
| A34 | An overdue task's "Edit" refuses every "Save" until its due date is moved to today or later | main |
| A36 | A manager's reply after being taken off a discussion gets "An unexpected error has occurred" instead of the reason | main |
| OMP1 | A press's discussion window lists an External Review reviewer as "Internal Reviewer" | main |
| OPS1 | A preprint server's "Assign Editor" template has no text, and choosing it leaves the message box showing text "Save" ignores | main |
| A37 | "Cancel" in the older "Add discussion" window leaves an empty discussion named "—" | 3.5 |
| A38 | Choosing the blank line of the older window's predefined messages fails on the server, with nothing on screen | 3.5 |
| A39 | A discussion started from a predefined message keeps "{$recipientName}" in its first message | 3.5 |
| A40 | A discussion subject over 255 characters fails on the server and the window says nothing | 3.5 |
| A41 | A refused "OK" in the older "Add discussion" window unticks the participants | 3.5 |
| A42 | "Cancel" on a reply in the older discussion window leaves an empty message | 3.5 |
| A12 | An hour after writing it, an Author or assistant can change nothing in their own discussion | main 3.5 (code) |
| A13 | A closed task cannot be reopened | main |
| A14 | A reviewer of an "Anonymous Reviewer/Disclosed Author" review is offered the Author and refused on "Save" | main 3.5 |
| A18 | An item another screen or an auto-added template opened has an empty "Activity" and no History | main |
| A19 | The role line under a manager-level participant depends on who looks | main |
| A20 | A discussion left with one participant after a removal cannot be saved from "Edit" | main 3.5 |
| A23 | The hint "You can convert this into a task by clicking Edit." shows to people who have no "Edit" | main |
| A27 | During Login As, a reply is headed with one person's name and logged under another's | main |
| A30 | A task whose owner leaves the submission is left with no owner, and nothing says so | main |
| A35 | Once a submission is at Production, a Copyeditor is offered "Workflow Files" with every stage greyed | main |
| OPS2 | A preprint server offers a "Workflow Files" source that never holds a file | main; 3.5 not checked |

### Seen on 3.5 only

Entries `main` does not show. They belong in the 3.5 spec's register.

Findings `main` no longer shows and an older version does; the Versions
column says which. The screens and labels are that version's, described
in [the differences on 3.5](lines/stable-3_5_0/U37-tasks-and-discussions.md).

<a id="a37"></a>
**A37 — "Cancel" in the older "Add discussion" window leaves an empty discussion named "—"** · 🐞 · user-visible.
On 3.5, pressing "Cancel" in "Add discussion" closes the window at once
and asks nothing, changed or not. After a reload the stage's list holds
one more row, named "—", with the person's username under "From". The
person who opened the window and manager-level people see the row, with
"Edit" and "Delete"; a Section Editor does not. The window's "Close"
control leaves no such row. `main` has another window, whose "Cancel"
discards (Rule 11c).
Basis: probe, 2026-11-11 (OJS 3.5). <sup>[f-a37](#fn-a37)</sup>

<a id="a38"></a>
**A38 — Choosing the blank line of the older window's predefined messages fails on the server, with nothing on screen** · 🐞 · invisible · crash: server.
On 3.5, in "Add discussion", choosing a predefined message such as
"Assign Editor" and then the blank first line of the drop-down changes
nothing on screen, and the request behind it answers a server error.
`main` has no such drop-down.
Basis: probe, 2026-11-11 (OJS 3.5). <sup>[f-a38](#fn-a38)</sup>

<a id="a39"></a>
**A39 — A discussion started from a predefined message keeps "{$recipientName}" in its first message** · 🐞 · user-visible.
On 3.5, a discussion started from the predefined message "Assign Editor"
shows "Dear {$recipientName}," at the top of its first message, for
everyone who opens it. Each participant's email of the same message
opens with their own name. On `main` "Save" fills the first message too
(Rule 10d).
Basis: probe, 2026-11-11 (OJS 3.5). <sup>[f-a39](#fn-a39)</sup>

<a id="a40"></a>
**A40 — A discussion subject over 255 characters fails on the server and the window says nothing** · 🐞 · user-visible · crash: server.
On 3.5, "OK" in "Add discussion" with a "Subject" of 300 characters
leaves the window open with no message, and the discussion is not saved:
the request answers a server error. `main` refuses such a name with
"This may not be greater than 255 characters." (Fields, "Name").
Basis: probe, 2026-11-11 (OJS 3.5). <sup>[f-a40](#fn-a40)</sup>

<a id="a41"></a>
**A41 — A refused "OK" in the older "Add discussion" window unticks the participants** · 🐞 · minor.
On 3.5, when the server refuses "OK" in "Add discussion" (too few
participants, or a mix of reviewers the review type forbids), the window
keeps "Subject" and "Message" and puts the "Participants" boxes back as
they were when it opened. Pressing "OK" again without re-ticking is
refused again. On `main` the window stays as filled (Rule 8).
Basis: probe, 2026-11-11 (OJS 3.5). <sup>[f-a41](#fn-a41)</sup>

<a id="a42"></a>
**A42 — "Cancel" on a reply in the older discussion window leaves an empty message** · 🐞 · user-visible.
On 3.5, pressing "Cancel" after "Add Message" in a discussion's window
closes the form and the window and asks nothing. The row then counts one
more under "Replies" and names the person under "Last Reply", and the
window lists a message with no text. The window's "Close" control,
pressed while the reply form is open, leaves nothing. `main` has another
window.
Basis: probe, 2026-11-11 (OJS 3.5). <sup>[f-a42](#fn-a42)</sup>

### Evidence

<a id="fn-a37"></a>
**f-a37** — OJS `stable-3_5_0` `7cf6c9c60f` (pkp-lib `5af8e67ab4`), 2026-11-11.
Part `s2` of `lines/stable-3_5_0/shared/playwright/checks/U37-stable-3_5_0/W1/walk.js`,
runs `s1` and `s2`: on an untouched window, a changed one and one whose
"OK" was just refused (`s2-04-cancel-untouched`, `s2-06-cancel-changed`,
`s2-08-cancel-after-refusal`, `s2-10-empty-row-strip`). "Cancel" sends
no request; "Close" sends `delete-query`.

<a id="fn-a38"></a>
**f-a38** — OJS `stable-3_5_0` `7cf6c9c60f` (pkp-lib `5af8e67ab4`), 2026-11-11.
Part `s2` of the same script, runs `s1` and `s2`
(`s2-14-template-blank-again`): `POST …/fetch-template-body` answers 500,
"fetchTemplateBody(): Return value must be of type PKP\core\JSONMessage,
none returned" (`QueriesGridHandler.php:786`).

<a id="fn-a39"></a>
**f-a39** — OJS `stable-3_5_0` `7cf6c9c60f` (pkp-lib `5af8e67ab4`), 2026-11-11.
Part `s2` of the same script, runs `s1` and `s2`
(`s2-16-template-discussion-window` and the Section Editor's email).

<a id="fn-a40"></a>
**f-a40** — OJS `stable-3_5_0` `7cf6c9c60f` (pkp-lib `5af8e67ab4`), 2026-11-11.
Part `x` of the same script, runs `s1` and `s2`
(`x-10-mgr-long-subject`): `POST …/update-query` answers 500,
"SQLSTATE[22001] … value too long for type character varying(255)" on
`notes.title`. Seen on PostgreSQL; MySQL was not tried.

<a id="fn-a41"></a>
**f-a41** — OJS `stable-3_5_0` `7cf6c9c60f` (pkp-lib `5af8e67ab4`), 2026-11-11.
Parts `s7` and `s11` of the same script, runs `s1` and `s2`
(`s11-03-se1-two-reviewers`, `s7-06-author-creator-unticked`), and part
`a14` of `register/walk.js` beside it, runs `r1` and `r2`
(`a14-03-rv-with-author-ok`).

<a id="fn-a42"></a>
**f-a42** — OJS `stable-3_5_0` `7cf6c9c60f` (pkp-lib `5af8e67ab4`), 2026-11-11.
Part `x` of the same script, runs `s1` and `s3`
(`x-12-mgr-window-after-reply-cancel`). "Cancel" sends no request;
"Close" sends `delete-note`. The same cause as A37.

<a id="fn-v35"></a>
**v35** — The "Seen on" column, 3.5 (pilot, `docs/specs/lines/README.md`).
Read 2026-11-11 on OJS `stable-3_5_0` `7cf6c9c60f` (pkp-lib `5af8e67ab4`,
ui-library `fd00e45f`). 3.5 has the older Discussions and no tasks,
templates, History or "Activity" column, so an entry on one of those
reads `main`: A2, A5, A6, A7, A10, A13, A15, A16, A17, A18, A21, A23,
A25, A26, A27, A28, A29, A30, A31, A32, A33, A34 and A35 (the issue
report's "Affects" bullet in `docs/issues/` where one exists, 3.5's
code otherwise). Walked on 3.5 and not seen: A3, A36 and OMP1 (their
issue reports), A19 (five viewers each read the manager's assigned
role). Walked and seen, twice, with
`lines/stable-3_5_0/shared/playwright/checks/U37-stable-3_5_0/W1/register/walk.js`: A14
(a reviewer on an "Anonymous Reviewer/Disclosed Author" review is
offered the Author; the save is refused, in 3.5's own wording) and A20
(a rename is refused once only one participant can be ticked). A12: read in 3.5's code only
(`QueriesAccessHelper::getCanEdit()`, one hour), since passing the hour
needs a database edit. A1 and OPS1: read in OMP's and OPS's 3.5 code.
OPS2: OPS was not read. Retired A4, A8 and A9: their fixes have no twin
on 3.5 and the faulty code is not there.
