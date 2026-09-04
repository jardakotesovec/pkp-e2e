---
name: notifications-center-and-email-preferences
scope: A signed-in user receives in-app tasks and notification emails, reviews them in the header's Tasks panel, chooses per journal which events reach them and which by email, and unsubscribes from an email's footer link
apps: [ojs, omp, ops]
shared: pkp-lib
status: verified
atlas-claims: [AFFW-698, AFFW-699, AFFW-700, AFFU-093, AFFU-094, AFFU-095, AFFU-111, AFFU-112, AFFU-113, AFFU-114, AFFU-115, AFFU-116, AFFU-117, AFFU-118, AFFU-119, AFFU-120, AFFU-121, AFFR-009, ROUTE-020, GRID-039, GRID-040, NOTIF-001, NOTIF-002, NOTIF-003, NOTIF-004, NOTIF-005, NOTIF-006, NOTIF-007]
---

# Notifications center & email preferences

> Conventions: ⚠ marks behaviour that is documented as it is today and questioned in the Findings register; `{OJS OMP}` names the apps a sentence holds for, and a lowercase phrase in braces, {email} for one, stands for the value the screen fills in; superscript letters point to evidence and can be skipped. The rest: [Reading a spec](GLOSSARY.md#reading-a-spec).

> **One spec, three applications.** The page is written in the words of a
> journal (OJS): "journal", "Journal Manager", "Section Editor", "Reviewer".
> Read it on a press (OMP) with "press" for "journal", Press Manager for
> Journal Manager, Series Editor for Section Editor and External Reviewer
> for the reviewer role; on a preprint server (OPS) with "server" for
> "journal", Preprint Server Manager for Journal Manager, Moderator for
> Section Editor, and no reviewer role at all. Where an on-screen sentence
> differs by more than that one word, the spec quotes each application's
> version. The full map is Part II of the
> [application glossary](GLOSSARY.md).

## Purpose

This spec is about how the application tells a person that something
happened, and how that person controls it. It covers four surfaces that
every signed-in user meets, whatever their role:

- the **Tasks panel**: the bell in the editorial header, with a red count of
  unread tasks, opening a window headed "Tasks" that lists the tasks the
  application has raised for this account across every journal;
- the **message at the top right** of an editorial page after an action
  ("Your changes have been saved." and its warning and error cousins), a
  *toast*;
- the **choices on the Profile page's "Notifications" tab**: for every
  event type, whether the event reaches this account at all in this
  journal, and whether it also arrives by email;
- the **Unsubscribe page** that the footer link of a notification email
  opens, where the addressee switches off notification emails without
  signing in.

*Editorial pages* here are the pages under the Dashboard, whose header
carries the bell and, under the signed-in name at the top right, "Edit
Profile" (the Profile page); *reader-facing pages* are the journal's
public site, with "Dashboard" and "View Profile" under the signed-in
name.

The tab as a screen, "Save" included, is described in
[User profile](U03-user-profile.md) (its Rule 11 and scenario 10), and each
event type belongs to the feature that raises it (Rule 6 names each). This
spec owns the delivery: the task, the toast, the email footer, the person's
choices and the Unsubscribe page.

## Actors & permissions

"The account holder" is the signed-in user; the Tasks panel and the
Notifications tab always act on that account, and no address opens another
person's. "The addressee" of an email is the account the email was sent to;
the Unsubscribe page acts on the addressee, whoever opens it. A "task" is
one row in the Tasks panel.

| Action | Who may, and when |
|--------|--------------------|
| **Open the Tasks panel** | • Any signed-in user on an editorial page, whatever their roles, including a user with no role in that journal, a user with no role in any journal, and the Site Administrator (Rule 2). The panel lists the account holder's own tasks only; what one Journal Manager deletes leaves another's rows untouched <sup>a</sup> |
| **Mark tasks read or new, delete tasks** | • The account holder, on their own list only (Rule 3) <sup>a</sup> |
| **See the unread count on the reader-side header** | • A signed-in user holding Journal Manager, Author, Reviewer or an assistant-level role in the journal, or the Site Administrator (Rule 4); the count shows even when it is "0"<br>• On the site's own home page only the Site Administrator, and there in the drop-down list under the name, after "Dashboard", not on the name itself (Rule 4)<br>• A Section Editor sees their name without a count, with or without unread tasks ⚠ [A3](#a3); a Reader sees the bare name too <sup>c</sup> |
| **Choose which events reach them, and which by email** | • The account holder, per journal, on the Profile page's "Notifications" tab (Rule 5) <sup>d</sup> |
| **Open the Unsubscribe page and unsubscribe** | • Whoever holds the emailed link, signed in or not; the page names and acts on the addressee, not on whoever is signed in (Rule 8, scenario 6) <sup>f</sup> |
| **Receive a task or a notification email** | • Decided per event type by the feature that raises it; the roster in Rule 6 says who is told, where it shows and whether an email goes out <sup>e</sup> |

## Fields & validation

**Profile › "Notifications" tab.** The tab opens with one sentence, its
only explanation of the two boxes: "Select the system events that you wish
to be notified about. Unchecking an item will prevent notifications of the
event from showing up in the system and also from being emailed to you.
Checked events will appear in the system and you have an extra option to
receive or not the same notification by email." Under it the event types
are listed in four groups, headed "Public Announcements", "Submission
Events", "Reviewing Events" and "Editors", in this order. Each row is the
event's sentence, followed by the two boxes named below. Where the row's
sentence would name a submission, the tab shows the word "Title" in its
place. Where a row's wording differs by application, the versions share one line,
separated by "·". Every role is offered the same groups and rows: an Author
or a Reader sees the "Editors" group too. <sup>d</sup>

| Group | Rows, in order |
|-------|----------------|
| "Public Announcements" | "A new announcement has been created." {OJS OPS} · "New announcement." {OMP}<br>"An issue has been published." {OJS}<br>"An issue has been made open access." {OJS} |
| "Submission Events" | "A new article, "Title," has been submitted." {OJS} · "A new monograph, "Title," has been submitted." {OMP} · "A new preprint , "Title", has been submitted." {OPS} ⚠ [OPS2](#ops2)<br>"A new version of your submission, "Title", was published."<br>"A new article has been submitted to which an editor needs to be assigned." {OJS} · "A new monograph has been submitted to which an editor needs to be assigned." {OMP} · "A new preprint has been submitted to which a moderator needs to be assigned." {OPS}<br>"Discussion added."<br>"Discussion activity." ⚠ [A1](#a1) |
| "Reviewing Events" | "A reviewer has commented on "Title"." (listed on a preprint server too ⚠ [OPS1](#ops1)) |
| "Editors" | "Weekly email of outstanding tasks" (the email is monthly; *[Submissions dashboard](U23-submissions-dashboard.md#a8)* records the mislabel)<br>"Statistics report summary." — only while the journal's editorial statistics email is on (Settings), and never on the site-level profile |

| Box (UI label, under every row) | Required? | Rules |
|------------------|-----------|-------|
| "Enable these types of notifications." | — | Ticked by default. Unticked, the event is not raised for this account in this journal (Rule 5a; one email ignores the box ⚠ [A10](#a10)). Unticking it greys out the email box below it, whose tick is dropped on save (Rule 5c) |
| "Do not send me an email for these types of notifications." | — | Unticked by default. Ticked, the event still reaches the account in the application but sends no email (Rule 5b). Greyed out while "Enable these types of notifications." is unticked |

**The Unsubscribe page** (Rule 8): under the heading "Unsubscribe" and the
sentence "Select the emails that you no longer wish to receive at {email}
from {journal name}.", one box for every row the tab ever shows, each
labelled with the row's sentence (the word "Title" itself where the tab has
it), without group headings and in the page's own order, given below; then
the sentence "You can resubscribe to email notifications at any time from
your user profile." with "user profile" as a link, and a button
"Unsubscribe". Every box is ticked when the page opens, whatever the
person's tab holds ⚠ [A2](#a2). The boxes, in order:

- {OJS} "An issue has been published." · "An issue has been made open
  access." · "A new article, "Title," has been submitted." · "A new version
  of your submission, "Title", was published." · "A new article has been
  submitted to which an editor needs to be assigned." · "A reviewer has
  commented on "Title"." · "Discussion added." · "Discussion activity." ·
  "A new announcement has been created." · "Weekly email of outstanding
  tasks" · "Statistics report summary."
- {OMP OPS} the same list without the two issue boxes, so the submission
  box comes first (worded per application as on the tab) and the
  announcement box seventh ("New announcement." on a press).

The list is the same on every journal: the "Statistics report summary." box
is listed even where the journal's statistics email is off ⚠ [A9](#a9).
<sup>f</sup>

**The Tasks panel** (Rule 2): a full-height panel over the page with a
back-arrow button "Close" and the heading "Tasks"; inside it a table with
the columns "Select" (a box at the start of every row) and "Tasks", the
three actions "Mark New", "Mark Read" and "Delete" under the table (offered
even while the list is empty), and a line counting the rows ("0 - 0 of 0
items" on an empty list). No text can be typed anywhere in the panel.
<sup>a</sup>

## Rules & state

1. **Four ways a notification reaches a person.** An event may produce any
   of these, and the roster in Rule 6 says which:
   - a *toast*: a short message at the top right of the editorial page
     the person is on, gone after a few seconds (Rule 9);
   - a *task*: a row in the Tasks panel, kept until the person deletes it,
     shown as unread until read (Rule 2);
   - a *notice on a screen*: a sentence or box that another feature's screen
     shows while a situation lasts (the review round's status box, the
     "awaiting approval" notice); those belong to the screen's own spec;
   - an *email*, most of them with an Unsubscribe link in the footer
     (Rule 7).
   The choices on the Notifications tab govern tasks and emails (Rule 5).
   Toasts and the screens' own notices are never subject to a choice.
   <sup>e</sup>
2. **The Tasks panel.** <sup>a</sup>
   - 2a. **The bell.** Every editorial page's header carries a bell icon
     (its hidden name for screen readers is "Tasks", and "Tasks 1", "Tasks
     2" and so on while there are unread tasks). While the account has
     unread tasks, a red badge on the bell shows their number as it stood
     when the page loaded; a task raised while the page is open shows on
     the next page the person opens. While the
     Tasks window is open the bell stays in the header greyed out, cannot
     be pressed and shows no badge; the moment the window is closed the
     badge shows the current number again.
   - 2b. **The window.** Pressing the bell opens the Tasks panel described
     in Fields over the page. It lists the account's tasks newest first
     under the column headed "Tasks"; each row shows the task's sentence
     and, under it, the title of the submission it is about when there is
     one. An unread row's sentence is bold; a read row's is in regular
     type, with no other marker. When the account holds roles in more than
     one journal, each row also shows the journal's initials (the "Journal
     initials" typed on the Create Journal form; "Press Initials" on a
     press, "Server initials" on a preprint server) between the sentence
     and the title (Rule 2d). With no task at all the list reads "No Items".
     Beyond 25 rows the list is paged: the line under the table then reads
     "1 - 25 of 26 items" with page numbers and ">" and ">>" after it, and
     offers "Items per page:" with the choices "10", "25", "50", "75" and
     "100".
   - 2c. **Opening a task.** A row's text (the sentence and the title under
     it) is one link; the blank part of the row does nothing. Pressing the
     text marks the task read and leaves the window for the submission the
     task is about: {OJS OMP} the submissions dashboard opens with that
     submission's workflow in a panel over the list, headed with the
     author's name and the submission's title under it; {OPS} the browser
     lands instead on a reader-facing page whose whole text is "A workflow
     stage was not specified.", and the submission is not reached
     ⚠ [OPS3](#ops3). The task is marked read either way.
   - 2d. **The list is per account, not per journal.** It pools every
     journal's tasks, and the same window with the same rows opens from
     any journal's editorial pages and from the site-level Profile page
     (Rule 5d), which carries the same bell.
3. **Mark Read, Mark New, Delete.** Each acts on the rows whose box is
   ticked and on nothing else; with no box ticked, pressing any of the three
   changes nothing. "Mark Read" turns the ticked rows into read rows and
   "Mark New" turns them back into unread rows; "Delete" removes the ticked
   rows at once, with no confirmation and no way back. After each action
   every box is unticked again, and once the window is closed the badge on
   the bell shows the new number of unread rows. <sup>a</sup>
4. **The reader-side count.** On the reader-facing pages, a signed-in
   user's name in the header is followed by the
   number of unread tasks the bell shows, as "{name} 1" with one and "0"
   with none, every journal's tasks counted. Actors says who sees it; a
   Section Editor and a Reader see the bare name, with or without unread
   tasks [A3](#a3). On the site's own home page the Site Administrator
   alone sees a number, in the drop-down list under the name after its
   "Dashboard" entry ("Dashboard 1" with one unread task); a Journal
   Manager, even one with roles in two journals, sees the bare name there.
   It is a count only: the reader-side header offers no list. <sup>c</sup>
5. **What the Notifications tab's boxes do.** <sup>d</sup>
   - 5a. **"Enable these types of notifications." unticked** means the
     event is not raised for this account in this journal: no task, and
     no announcement or issue email. One email ignores the box: the "needs
     an editor" email still arrives with "Enable…" unticked, and only its
     "Do not send me an email…" box stops it ⚠ [A10](#a10). Nothing is
     stored for later; re-ticking the box brings back future events only.
   - 5b. **"Do not send me an email for these types of notifications."
     ticked** means the event still produces its task, where it has one,
     but the email that would accompany it is not sent to this account. For events
     whose email is optional for the sender (an announcement posted without
     its email box), the choice only matters when the sender chose to email.
   - 5c. **Unticking "Enable…" clears the email choice.** The email box
     greys out at once, keeping whatever tick it had; "Save" records it as
     unticked, and it shows unticked on the tab's next load. Re-ticking
     "Enable…" later leaves the email box unticked, so the event's emails
     come again until it is ticked once more.
   - 5d. **The choices are kept per journal.** The tab saves for the journal
     it was opened in, and each journal on a site keeps its own set. The
     site-level profile keeps yet another set. Its address is the journal's
     profile address with "index" in place of the journal's path, for
     example "…/index/user/profile" (*[User profile](U03-user-profile.md)*
     Rule 3); the site's home page has the same "index", and its "View
     Profile" under the signed-in name leads to the site-level profile. A
     user with a
     role in exactly one journal who opens that address is sent to that
     journal's profile with the "Identity" tab open, whatever tab the
     address named; the site-level tab is seen by a user with roles in
     several journals or in none, and by the Site Administrator of a site
     with several journals (a site with one journal was not tried). No
     event listed on the tab is raised at site level, so the site-level set
     currently governs nothing ⚠ [A4](#a4).
   - 5e. **Registration presets the email choice.** A person who registers
     with the box "Yes, I would like to be notified of new publications and
     announcements." unticked (*[Registration & account validation](U02-registration-and-account-validation.md)*)
     starts with "Do not send me an email…" ticked on every row of the
     "Public Announcements" group of that journal, and "Enable…" ticked as
     for everyone. Registering with the box ticked leaves every box at its
     default. <sup>h</sup>
6. **The roster: what each row governs.** Every row on the tab is one event
   type. The feature named in the second column raises it and says exactly
   when; this table says who is told, how, and whether an email carries
   the Unsubscribe link (Rule 7). "No task" means the event shows nothing
   in the application (no row in the Tasks panel, no screen announcing
   it), so the "Enable…" box only matters for the email. Three rows ("An
   issue has been made open access.", "Weekly email of outstanding tasks"
   and "Statistics report summary.") are raised by a *scheduled task*: a
   job the site runs on its own timer, which no screen and no action of a
   person starts (unlike scenario 9's issue email, which "Publish Issue"
   queues; "When emails arrive", Canonical scenarios). On the test
   installs that timer does not run, so no scenario produces those three
   emails. <sup>e</sup>

   | Row (as on the tab) | Raised by (owner) | Who is told | In the application | Email (footer link?) |
   |---|---|---|---|---|
   | "A new announcement has been created." / "New announcement." | A Journal Manager posts an announcement (*Announcements*, spec not yet written) | every user with a role in the journal | no task | only when the announcement was posted with "Send an email about this to all registered users." ticked; link: yes |
   | "An issue has been published." {OJS} | A Journal Manager publishes an issue with "Send an email about this to all registered users." ticked in the "Publish Issue" dialog (*Issues*, spec not yet written) | every user with a role in the journal | no task | yes; link: yes |
   | "An issue has been made open access." {OJS} | the day an issue of a subscription journal becomes open access, if the journal's open-access notification is on (those screens are *Subscriptions & open access control*'s, spec not yet written). A scheduled task raises it (above); no screen starts it | every user with a role in the journal | no task | yes; link: yes |
   | "A new article, "Title," has been submitted." | a new submission into a section whose form has an editor ticked under "Editorial Assignments" (Settings › Journal › "Sections", a section's "Edit"; the assignment itself is *[Submission wizard](U21-submission-wizard.md)*'s). On every journal but the install's first (its oldest; the seeded journal, on a test install) the tick is ignored and this event never happens: the submission raises the "needs an editor" row's event instead, as if nobody were ticked ⚠ [A11](#a11) <sup>e</sup> | nobody, by this row, on any journal but the install's first: the ticked editor gets neither task nor email, and every Journal Manager gets the "needs an editor" row's task and email exactly as for that row below (what the ticked editor gets on the install's first journal was never seen, [A11](#a11)) | none of this row's own. The Managers' task is the "needs an editor" row's and answers to that row's "Enable…" box, not this one's (Rule 5a, scenario 3); what this row's own boxes change was never seen, the event never having happened on a test install | none of this row's own; link: no. The Managers' email is the "needs an editor" row's, stopped only by that row's "Do not send me an email…" box ⚠ [A10](#a10) (scenario 4); nothing to the ticked editor |
   | "A new version of your submission, "Title", was published." | a version goes live (*[Publish, schedule & versions](U49-publish-schedule-and-versions.md)*) | every user holding an Author assignment on the submission | a task | the "Publication Published" email; link: no ⚠ [A8](#a8) |
   | "A new article has been submitted to which an editor needs to be assigned." | a new submission with nobody assigned automatically (*[Submission wizard](U21-submission-wizard.md)*) | every Journal Manager | a task | the "needs an editor" email, subject "A new submission needs an editor to be assigned: "{title}""; link: no ⚠ [A8](#a8); sent even with "Enable…" unticked ⚠ [A10](#a10) |
   | "Discussion added." | a discussion is opened with the person as a participant, and every reply to it (*Tasks & discussions*, spec not yet written) | the discussion's participants, the person who wrote the message included | a task reading "{who opened it} started a discussion: {name}: {opening message}", for a reply the same sentence again ⚠ [A1](#a1) | the message, subject the discussion's name, sent by the person who wrote it; link: yes, in Rule 7a's "Reply to this comment…" sentence |
   | "Discussion activity." | nothing: no event raises it ⚠ [A1](#a1) | — | — | — |
   | "A reviewer has commented on "Title"." | a reviewer submits a review (*[Reviewer assignment & management](U27-reviewer-assignment-and-management.md)*) | only the Journal Managers and Section Editors assigned to that submission, in either role; a Journal Manager who is not assigned gets nothing | no task | the review-complete email, subject "Review complete: {reviewer} recommends {recommendation} for #{submission number} {authors} — "{title}"" ({submission number} and {authors} as in Rule 7a; {OMP} "recommends None", the press's review form offering no recommendation); link: yes, in Rule 7a's "This is an automated message…" sentence |
   | "Weekly email of outstanding tasks" | the monthly reminder of outstanding tasks that *[Submissions dashboard (editorial)](U23-submissions-dashboard.md)* describes (the "Weekly" mislabel is noted in Fields); listed on a preprint server too, where the email is never sent ⚠ [OPS1](#ops1). A scheduled task raises it (above); no screen starts it | Journal Managers and Section Editors with submissions waiting on them (which submissions count is *[Submissions dashboard (editorial)](U23-submissions-dashboard.md)*'s to say) | no task | yes; link: yes, in Rule 7a's "This is an automated message…" sentence |
   | "Statistics report summary." | the monthly statistics email, sent while the journal's "Editorial statistics" choice is "Send a monthly email to editors." (Settings that modify behavior). A scheduled task raises it (above); no screen starts it | Journal Managers and Section Editors | no task | yes, with a spreadsheet attached; link: yes |

   One email that a box on this tab does *not* govern is the reviewer's
   "Review assignment updated." notice; *[Reviewer assignment & management](U27-reviewer-assignment-and-management.md#a12)*
   records that gap.
7. **Notification emails and their footer.** <sup>f</sup>
   - 7a. An email marked "link: yes" in Rule 6 ends with a footer: a dash
     ("—") on a line of its own, then one of three sentences: "Unsubscribe from emails sent by
     {journal name}." (announcements, issues and the statistics report, whose footer was not seen: a scheduled task, Rule 6) <sup>e</sup>, "This
     is an automated message from {journal name}. You can unsubscribe from
     this email at any time." (the reminder, the review-complete email) and
     "Reply to this comment at #{submission number} {authors} or
     unsubscribe from emails sent by {journal name}." (discussions;
     {submission number} is the number the submission's workflow page
     shows at its top, {authors} the family names of its authors, and that
     part links to the submission). In each, "Unsubscribe" or "unsubscribe"
     is the link, and the journal name links to the journal. The email's
     plain-text version shows each link's address in parentheses after the
     link's words.
   - 7b. The link is personal and permanent: it names the addressee and the
     notification it came with, needs no sign-in, and keeps working every
     time it is opened. It stops working only if the notification it came
     with is deleted, as a task can be from the Tasks panel ⚠ [A7](#a7).
   - 7c. The same emails also carry the hidden headers that let a mail
     program show its own "Unsubscribe" button. Whether that button works is
     an open question ⚠ [A5](#a5); the link in the footer is the supported
     way.
   - 7d. Both the link and the headers depend on a secret the system
     administrator sets in the configuration file (Settings). Without it,
     the footer link opens the "404 Not Found" page ⚠ [A6](#a6).
8. **The Unsubscribe page.** <sup>f</sup>
   - 8a. **Reaching it.** The footer link opens the page in the journal's
     reader-facing layout, signed in or not. The link's address ends
     "…/notification/unsubscribe?validate={code}&id={notification number}":
     a long code, and the number the application gave the notification the
     email came with (not the submission's number); no screen shows either,
     and nothing below needs them matched. Three broken links open the bare
     "404 Not Found" page instead (that text alone, without the journal's
     header): "…?id={notification number}" (the code and its name cut
     out); "…?validate={code}" (everything from the "&" on deleted); and
     the intact address with a number no notification has in place of
     {notification number} (999999999, for one). The same bare page is
     what an intact link opens once the addressee has deleted, from their
     own Tasks panel, the task that came with that email (Rule 7b; another
     participant deleting their own row changes nothing). The discussion
     emails (Rule 6) are the ones whose event both raises a task and
     carries the link, so they are the emails to try that on.
   - 8b. **What it shows.** The heading, sentence, boxes, "user profile"
     link and "Unsubscribe" button described in Fields. The sentence names
     the addressee's email address and the journal, whoever is signed in.
   - 8c. **What "Unsubscribe" saves.** The page replaces the addressee's
     email choices for that journal with its boxes: every ticked box becomes
     "Do not send me an email…" ticked on the tab, and every unticked box
     becomes unticked there, even if the person had ticked it on the tab
     before ⚠ [A2](#a2). The "Enable…" boxes are never touched: tasks and
     notices continue.
   - 8d. **The result page.** After "Unsubscribe" the page reads "You have
     been unsubscribed" with "The email address {email} has been
     successfully unsubscribed. We'll no longer send you those emails. You
     can resubscribe to email notifications at any time from your user
     profile." The page can go stale: if it is left open while the person
     signs in or out in another tab of the same browser (or clears the
     browser's cookies) and "Unsubscribe" is then pressed on the old page, it
     reads "We could not unsubscribe you" with "There was an unexpected
     error and we could not unsubscribe the email address {email}. You can
     unsubscribe from all email notifications in your user profile or
     contact us directly for help." Opening the emailed link afresh works
     again.
   - 8e. **The "user profile" link** on both pages opens the journal's
     Profile page on its first tab, "Identity", not on "Notifications"; a
     signed-out visitor is asked to sign in first and then lands there.
9. **Toasts.** A toast is the application's generic short message: a white
   box with a coloured left edge at the top right of the editorial page.
   When several arrive they stack, each new one under the last. It comes in
   three looks: a success message with a green edge (after a save: "Your
   changes have been saved." unless the screen has a more specific
   sentence), a plain notice with a blue edge (for one, "The plugin
   "Custom Block Manager" has been enabled." after ticking that plugin
   under Settings › Website › "Plugins"), and a warning look for a refused
   action or a server error (no screen in this spec produces one on
   demand). Every toast has a "×" close control (named
   "Close" for screen readers) and otherwise disappears by itself after a
   few seconds, staying while the pointer rests on it. A form the server
   rejected shows no toast: its errors appear inside the form under the
   heading "Errors occurred processing this form" (the Profile page's
   "Password" tab with a wrong current password, for one), and that notice
   also removes itself, after about seven seconds. Some screens show the
   success message inside the form instead of as a toast
   (*[User profile](U03-user-profile.md)*'s Identity tab, for one); that
   is the screen's choice, described by its spec. <sup>g</sup>

## Side effects

- **Marking, deleting** (Rule 3) changes the bell's badge, read after
  "Close": it counts unread rows only (up for "Mark New", down for "Mark
  Read" and for deleting an unread row; deleting a read row leaves it). The
  reader-side count follows on the next reader-facing page opened (Rule 4).
  There is nothing to save or confirm.
- **Deleting a task** also ends the Unsubscribe link of the email that
  announced it (Rule 7b) ⚠ [A7](#a7).
- **Saving the Notifications tab** (Rule 5) changes only future events;
  existing tasks stay, and no email is sent or recalled.
- **Unsubscribing** (Rule 8) rewrites the addressee's email choices for that
  journal; the tab shows the result the next time it is opened. No email
  confirms it.
- **Emails**: every email in Rule 6 is that feature's; this spec adds only
  the footer and the choice that suppresses it. <sup>e</sup>

## Settings that modify behavior

- **Editorial statistics email (per journal).** Settings › Workflow ›
  "Emails", group "For Editors", field "Editorial statistics": "Send a
  monthly email to editors." (the default on the test installs and on
  every new journal) lists the "Statistics report summary." row on the tab
  and sends the monthly email; "Do not send the email to editors." removes
  the row from the tab (the Unsubscribe page keeps its box ⚠ [A9](#a9))
  and stops the email; choosing the first again brings the row back on
  the tab's next load. The default end is scenario 7. The other end has
  no scripted scenario, because the test tooling cannot yet create a
  journal with the email off; a tester flips it there on a throwaway
  journal and expects the row to vanish. <sup>i</sup>
- **The API secret (configuration file, no screen).** A key the system
  administrator writes into the configuration file; no screen shows or sets
  it. Set on the test installs; without it the Unsubscribe links and
  headers are dead (Rule 7d) ⚠ [A6](#a6). No scenario: the configuration
  file is shared by every test. <sup>i</sup>
- **Rows per page (configuration file, no screen).** The Tasks panel's page
  size, 25 on a default install; the panel's own "Items per page:" choice
  changes it for the moment only (Rule 2b). No scenario. <sup>i</sup>
- **The announcement's and the issue's email box** ("Send an email about
  this to all registered users.", Rule 6), **the open-access notification
  and the journal's announcements switch** decide whether the events in
  Rule 6 send email at all; all four belong to *Announcements*, *Issues*
  and *Subscriptions & open access control* (specs not yet written).

## Cross-feature interactions

- **User profile** owns the Notifications tab as a screen: the tabs, the
  "Save" button and message, the pairing of the two boxes as a form
  behaviour, and the site-level profile. This spec owns what the boxes mean
  (Rule 5) and the row list (Fields).
- **Registration & account validation** owns the "Yes, I would like to be
  notified…" box; its effect on the tab is Rule 5e.
- **Navigation menus & site chrome** owns the editorial header and the
  reader-side header the bell and the count sit in; the bell's window and
  the count's value are this spec's (Rules 2 and 4).
- **Submission wizard**, **Publish, schedule & versions**, **Reviewer
  assignment & management**, **Submissions dashboard** and the unwritten
  *Announcements*, *Issues*, *Subscriptions & open access control*,
  *Stage participants* and
  *Tasks & discussions* each raise the events in Rule 6 and own their
  triggers, recipients and email texts; the discussion form ("Add" in the
  workflow page's discussions panel) and its reply are *Tasks &
  discussions*'.
  **Review stage & rounds** owns the
  decision tasks that an editorial decision raises and that also land in
  the Tasks panel (for one, "Revision required." on a journal and
  "Revisions to consider in External Review." on a press); they have no
  row on the tab and cannot be switched off.
- **Emails management** owns the templates the notification emails are built
  from; the footer is added after the template and is not editable there.

## Canonical scenarios

Common to all three apps. Scenarios 1–6, 8 and 9 run on a scratch
journal with throwaway accounts, because they change notification choices
and raise tasks that would linger; scenario 7, which only looks, uses a
ready account on the seeded journal, and its site-level step needs a
second journal on the site. Read the scenarios on a press or a preprint
server with the note under the title; the ready accounts and their
passwords, the mail catcher's address and the tooling recipe are in the
footnote. <sup>s0</sup>

**The scratch journal.** Its accounts' Notifications tabs start at their
defaults, and the Site Administrator is a Journal Manager of it, so every
new submission's "needs an editor" task reaches them too (Rule 6).

**When emails arrive.** Every email in scenarios 1–6 leaves at the moment
of the action and is in its mailbox within a second. Where a scenario says
a mailbox holds no email for a submission or a discussion, wait until the
other person's email for the same one has arrived, then look for an email
about that title or that discussion's name alone: the mailbox's earlier
emails stay and do not count. Scenario 9's issue email is different:
"Publish Issue" only queues it for the site's background jobs, and on the
test installs the jobs do not run by themselves. After "Publish Issue",
run the site's background jobs (the footnote says how) and judge both mailboxes only once they have run.

1. **A submission raises a task, and the bell counts it**: Author, Journal
   Manager, both throwaway accounts on a scratch journal; the Manager has no task yet and is not the Site Administrator, whose
   list pools every journal's tasks (Rule 2d). The Author submits a new
   submission (the wizard to its "Submit" dialog; on a preprint server with
   the "For Readers" choice). The Journal Manager opens any editorial page after the
   submission (or reloads the one that is open) and sees a red "1" on the
   bell; a page that was already open before the submission still shows
   no number. Pressing the bell opens the "Tasks" window: one row, its
   sentence in bold, "A new article has been submitted to which an editor
   needs to be assigned." (worded per application as in Fields), with the
   submission's title under it; while the window is open the bell in the
   header is greyed out with no number. Press the row's sentence:
   {OJS OMP} the submission's workflow opens over the submissions dashboard
   (Rule 2c); {OPS} a reader-facing page reading "A workflow stage was not
   specified." opens instead ⚠ [OPS3](#ops3). Back on any editorial page the bell shows no
   number, and opening the window again shows the row's sentence in
   regular type. <sup>s1</sup>
2. **Mark New, Mark Read, Delete**: Journal Manager, Author. The Manager
   is a fresh throwaway account on the scratch journal with no task yet
   (not scenario 1's Manager); the Author submits twice, and the Manager
   does not open the Tasks window in between, so the window holds exactly
   two rows, both unread, and the bell shows "2". Open the window and press "Mark Read" with no box
   ticked: both rows stay bold and no message appears. Tick the first row
   and press "Mark Read": the row's sentence turns to regular type and its box is unticked again.
   Press "Close": the bell shows "1". Open the window again, tick the same
   row and press "Mark New": the row is bold again; close the window: the
   bell shows "2". Open it again, tick both rows and press "Delete": both
   rows vanish at once with no question asked and the list reads "No
   Items"; close the window: the bell shows no number. Reload the page:
   still no number, and the window is still empty. <sup>s2</sup>
3. **Unticking "Enable…" stops the task, not the email**: two Journal
   Managers, Author. Manager A opens Profile › "Notifications", unticks
   "Enable these types of notifications." under "A new article has been
   submitted to which an editor needs to be assigned." (its email box greys
   out) and presses "Save": the toast "Your changes have been saved." appears
   (Rule 9). Manager B changes nothing. The Author submits a new
   submission. Manager A's Tasks window gains no row for this submission
   and the number on the bell does not grow (the rows from earlier
   submissions stay); Manager B's window gains the row. Both mailboxes hold an email whose
   subject is "A new submission needs an editor to be assigned:
   "{title}"": Manager A's arrives all the same ⚠ [A10](#a10). Manager A
   re-ticks the box: the email box is offered again, unticked; press
   "Save". <sup>s3</sup>
4. **Ticking "Do not send me an email…" keeps the task, stops the email**:
   two Journal Managers, Author. Manager A ticks "Do not send me an email
   for these types of notifications." under the same row and saves; Manager
   B changes nothing. The Author submits. Both managers get the task in
   their Tasks window; Manager B's mailbox holds the email whose subject is "A
   new submission needs an editor to be assigned: "{title}"" with this
   submission's title, and once it has arrived Manager A's mailbox holds
   no email with that subject ("When emails arrive"). <sup>s4</sup>
5. **Unsubscribing from an email's footer link**: Journal Manager, Author,
   throwaway accounts on the scratch journal, then a signed-out visitor.
   The whole scenario runs on the scratch journal, on a submission of the
   Author's there.
   On that submission's workflow page, on its
   Submission stage, in the panel headed "Desk Review Tasks & Discussions"
   (on a preprint server "Production Tasks & Discussions"), the Journal
   Manager presses
   "Add", types a "Name", ticks the Author's box under "Participants" (the
   Manager's own box arrives ticked; the form offers no email choice),
   writes a message under "Discussion" and presses "Save". The Author's
   mailbox holds an email whose subject is the discussion's name, sent by
   the Manager, ending "Reply to this comment at #{submission number}
   {authors} or unsubscribe from emails sent by {journal name}."
   (Rule 7a; {authors} here is the Author's own family name, the one
   author); the Manager's own mailbox holds a copy. Signed out, open the "unsubscribe" link: the
   "Unsubscribe" page shows "Select the emails that you no longer wish to
   receive at {the Author's address} from {journal name}.", every box
   ticked, and the button "Unsubscribe". Press it: "You have been
   unsubscribed" with the sentence naming the Author's address. Open the
   link again: the page shows again, boxes ticked. Sign in as the Author
   and open the scratch journal's Profile › "Notifications": under every row of the tab, in
   every group, the second box, "Do not send me an email for these types
   of notifications.", is ticked, and the first box, "Enable these types
   of notifications.", is still ticked; the tab has no row that the
   Unsubscribe page did not list a box for. The Manager
   opens a second discussion with the Author as before ("Add", a new
   "Name", the Author's box ticked, a message, "Save"): the Manager's own
   mailbox holds the email whose subject is that new name; once it has
   arrived, the Author's mailbox holds no email with that subject (the
   first discussion's email is still there), while the Author's Tasks
   window holds a new row reading "{the Manager's name} started a
   discussion: {the new name}: {the message}". <sup>s5</sup>
6. **The link acts on the addressee, not on whoever is signed in**: Journal
   Manager, Author. With scenario 5's link, signed in as the Journal
   Manager, open it: the page names the Author's address, not the
   Manager's. Untick every box but "Discussion added." and press
   "Unsubscribe": the success page shows. The Author's tab now has "Do not
   send me an email…" ticked on "Discussion added." only; the Manager's own
   tab is unchanged. <sup>s6</sup>
7. **The rows, per application, and the site-level tab**: Journal Manager
   on the seeded journal. Profile › "Notifications" lists the four groups
   with exactly the rows in Fields for this application, "Editors" holding
   "Weekly email of outstanding tasks" and "Statistics report summary.",
   every "Enable…" box ticked and every email box unticked. Then, as the
   Site Administrator, on a site that holds more than one journal (Rule
   5d), open the
   site-level profile at "…/index/user/profile" (Rule 5d) and its
   "Notifications" tab: the same groups, without "Statistics report
   summary.". <sup>s7</sup>
8. **Registration presets the email choice**: a visitor registers on a
   scratch journal with "Yes, I would like to be notified of new
   publications and announcements." unticked, then signs in and opens Profile ›
   "Notifications": under every row of "Public Announcements",
   "Enable…" is ticked and "Do not send me an email…" is ticked. A second
   visitor registers with the box ticked: both boxes are at their defaults.
   <sup>s8</sup>

**Application-specific**

9. **An issue's email and its Unsubscribe link** {OJS}: Journal Manager,
   Reader, Author, throwaway accounts on a scratch journal set up fresh
   for this scenario, not the one scenarios 1–6 used, so the Author's
   Notifications tab is untouched by scenario 5. The journal holds one
   unpublished issue, listed under Issues › Future Issues as
   "Vol. 1 No. 1 (2026): {title}". The Reader opens Profile ›
   "Notifications", unticks "Enable…" under
   "An issue has been published." and saves; the Author never opens
   Profile › "Notifications", so every box on the Author's tab is still at
   its default.
   The Manager opens Issues › Future Issues, presses the small arrow at
   the start of the issue's row to show its actions, presses "Publish
   Issue" and, in the dialog, leaves "Send an email about this to all
   registered users." ticked (it arrives ticked) and confirms "OK"
   (*Issues*, spec not yet written, owns that dialog; an issue with no
   articles publishes without a warning). Run the site's background jobs
   ("When emails arrive" above). Then the Author's mailbox holds the issue
   email: its subject is "Just published: Vol. 1 No. 1 (2026): {title} of
   {journal name}", and its footer (Rule 7a) reads "Unsubscribe from emails sent by
   {journal name}." with "Unsubscribe" as the link; the Reader's mailbox
   holds no email with that subject. <sup>s9</sup>

## Findings register

Verdicts are the author's judgment (claude, 2026-09-04), unreviewed unless an
entry notes otherwise; the team settles them on spec review. Sorted 🐞 → ❓ →
✅ in the summary; the entries below are the source. Each entry opens with the
user-observable symptom; mechanism and evidence live in the entry's footnote.
Impact values: user-visible = real effect in ordinary use · minor = cosmetic
only, however often seen · latent = only in an unusual situation or
configuration · invisible = an intended difference between the applications
that misleads nobody, recorded so the difference is on file. Entries whose
Basis line says "judgment" come from reading the application and await the
live check.

| ID | Finding (one line, symptom) | Bug? | Impact | Review |
|----|-----------------------------|------|--------|--------|
| [A10](#a10) | Unticking "Enable…" under the "needs an editor" row stops the task but the email still arrives; only the email box stops it | 🐞 | user-visible | — |
| [OPS3](#ops3) | On a preprint server, pressing a task in the Tasks panel lands on "A workflow stage was not specified." instead of the submission | 🐞 | user-visible | — |
| [A1](#a1) | The "Discussion activity." row and its two boxes govern nothing; a reply to a discussion raises a task worded exactly like the opening one | 🐞 | minor | — |
| [A2](#a2) | The Unsubscribe page silently switches back on emails the person had switched off before, because its boxes start ticked and an unticked box means "send" | 🐞 | latent | — |
| [A3](#a3) | A Section Editor's name on the reader-side header carries no unread count, while a Journal Manager's or an Author's does | 🐞 | minor | — |
| [OPS2](#ops2) | The new-preprint row reads "A new preprint , "Title", has been submitted." with a space before the comma | 🐞 | minor | — |
| [A4](#a4) | The site-level profile's Notifications tab offers choices that no event honours | ❓ | latent | — |
| [A5](#a5) | A mail program's own "Unsubscribe" button, offered because of the emails' headers, is probably refused | ❓ | latent | — |
| [A6](#a6) | Without an API secret in the configuration file, which a fresh install leaves empty, every footer "Unsubscribe" link opens "404 Not Found" | ❓ | user-visible | — |
| [A7](#a7) | Deleting a task from the Tasks panel kills the Unsubscribe link in the email that announced it | ❓ | latent | — |
| [A8](#a8) | The "needs an editor" and "Publication Published" emails have no Unsubscribe footer and no hidden headers, unlike the announcement, issue and discussion emails | ❓ | minor | — |
| [A9](#a9) | The Unsubscribe page lists "Statistics report summary." on a journal whose statistics email is off | ❓ | minor | — |
| [A11](#a11) | A Section Editor ticked under "Editorial Assignments" gets neither task nor email for a new submission; the Journal Managers get the "needs an editor" pair instead, and what the editor gets on the install's first journal was never seen | ❓ | user-visible | — |
| [OPS1](#ops1) | A preprint server lists "A reviewer has commented on "Title"." and "Weekly email of outstanding tasks", two events it never raises | ❓ | minor | — |

### All apps

<a id="a1"></a>
**A1 — "Discussion activity." governs nothing** · 🐞 · minor.
The tab offers "Discussion activity." with both boxes, and the Unsubscribe
page offers its email box, but nothing in the application is governed by
them: a reply to a discussion reaches the other participants as a task and
an email of the "Discussion added." kind, whatever the "Discussion
activity." boxes say. That task repeats the opening message's sentence
word for word ("{who opened it} started a discussion: {name}: {opening
message}"), so the person cannot tell a reply from the discussion's start
without opening it; the email does carry the reply. The person is offered
a choice that changes nothing.
Basis: probe. <sup>[f-a1](#fn-a1)</sup>

<a id="a2"></a>
**A2 — The Unsubscribe page re-enables emails switched off earlier** · 🐞 · latent.
A person who had ticked "Do not send me an email…" on some rows of the tab
and later opens an Unsubscribe link sees every box ticked. Unticking one to
keep that email, and pressing "Unsubscribe", also switches back on every
email they had switched off on the tab before, because the page saves the
whole set of boxes as the new choices (Rule 8c). Nothing on the page says
that its boxes replace the tab's choices.
Basis: probe. <sup>[f-a2](#fn-a2)</sup>

<a id="a3"></a>
**A3 — No reader-side count for a Section Editor** · 🐞 · minor.
On the reader-facing pages, the header shows the signed-in user's name with
the number of unread tasks, "0" included, for a Journal Manager or an
Author (Rule 4). A Section Editor, who receives tasks like the others, sees
their name without a number even while the bell shows "1", and learns of
new tasks only from the bell on the editorial pages.
Basis: probe. <sup>[f-a3](#fn-a3)</sup>

<a id="a4"></a>
**A4 — The site-level tab governs nothing** · ❓ · latent.
The Profile page reached without a journal in the address has the same
Notifications tab, minus the statistics row, and saves a separate set of
choices (Rule 5d). No event listed there is ever raised outside a journal:
a site announcement posted with "Send an email about this to all
registered users." ticked sends no email to anyone and lists no task. The
choices made there have no effect.
Question: should the site-level tab be hidden, or say that choices are per
journal? Lean: hide it; a tab that saves choices nothing reads misleads.
Basis: probe. <sup>[f-a4](#fn-a4)</sup>

<a id="a5"></a>
**A5 — A mail program's own "Unsubscribe" button probably fails** · ❓ · latent.
The notification emails carry the headers that make mail programs offer a
one-click "Unsubscribe" of their own (Rule 7c). That button sends a request
without the form token the Unsubscribe page insists on, so the answer would
be the "We could not unsubscribe you" page, unseen by the person who pressed
a button in their mail program.
Question: is the mail-program button meant to work? Lean: yes, the headers
are there for it, so the page should accept that request; a defect. Only a
mail program can settle it, so it stays a question.
Basis: judgment. <sup>[f-a5](#fn-a5)</sup>

<a id="a6"></a>
**A6 — Dead footer links without an API secret** · ❓ · user-visible.
The "API secret" is a key the site administrator types into the
application's configuration file; no screen shows or sets it, and the
configuration file a fresh install ships with leaves it empty. On an
install where it was never filled in, every notification email still ends
with the footer, but its "Unsubscribe" link opens the "404 Not Found"
page, and the hidden headers behind a mail program's own "Unsubscribe"
button point at the same dead link (Rule 7d): nobody on that install can
unsubscribe from any notification email. Because the shipped file leaves
the key empty, this is the state of every install whose administrator has
not edited that line, not a rare configuration; the test installs set the
key, which is why no scenario in this spec sees it.
Question: should the footer be left out when the link cannot work? Lean:
yes; a link that always fails is worse than none.
Basis: judgment (read from the code and the shipped configuration file;
not seen on a running install). <sup>[f-a6](#fn-a6)</sup>

<a id="a7"></a>
**A7 — Deleting a task kills its email's Unsubscribe link** · ❓ · latent.
Each Unsubscribe link is bound to the notification the email came with;
when that notification is a task, it is a row in the Tasks panel. A person
who deletes that row from the panel and later opens the email's link gets
"404 Not Found" instead of the Unsubscribe page, with no hint why. In
scope: the discussion emails (subject: the discussion's name), the one
kind of email whose event both raises a task and carries the Unsubscribe
link. Exempt, because their events raise no task and so nothing can be
deleted: the announcement, issue and open-access emails, the "A reviewer
has commented" email, the reminder of outstanding tasks and the
statistics report. The "needs an editor" and "Publication Published"
emails carry no Unsubscribe link at all (A8).
Question: is the link meant to outlive the task? Lean: yes; the email is
still in the inbox, so its link should still work.
Basis: probe (a discussion email, its task deleted, the link opened
signed in and signed out). <sup>[f-a7](#fn-a7)</sup>

<a id="a8"></a>
**A8 — Two emails without the footer** · ❓ · minor.
Two notification emails carry no Unsubscribe footer and none of the hidden
headers that let a mail program offer its own "Unsubscribe" button, while
the announcement, issue and discussion emails carry both; the recipient
cannot unsubscribe from either email itself. The first is the "needs an
editor" email to Journal Managers, ending "This is an automated email from
{journal name}."; a Manager can still stop it from the Profile page's
"Notifications" tab by ticking "Do not send me an email…" under its row,
the only box that works for it (A10), and that was seen live. The second
is the "Publication Published" email to an author (subject "Publication
Published", from the journal's own name and address), ending with the
address of the published item. The author's tab has a box for it too, "Do
not send me an email…" under "A new version of your submission, "Title",
was published.", the box that stops the other emails (Rule 5b); whether it
stops this one was not tried, so the author's only way out is expected,
not seen.
Question: intended, or an omission? Lean: an omission; both are recurring
notification emails like the others.
Basis: probe (both emails' footers and headers; the Manager's box),
judgment (the author's box stopping the "Publication Published" email).
<sup>[f-a8](#fn-a8)</sup>

<a id="a9"></a>
**A9 — The Unsubscribe page lists an email the journal never sends** · ❓ · minor.
On a journal whose editorial statistics email is switched off, the tab drops
the "Statistics report summary." row but the Unsubscribe page still offers
its box (Fields), so the page and the tab disagree about which emails exist.
Question: should the page follow the journal's setting like the tab does?
Lean: yes.
Basis: probe. <sup>[f-a9](#fn-a9)</sup>

<a id="a10"></a>
**A10 — "Enable…" unticked does not stop the "needs an editor" email** · 🐞 · user-visible.
A Journal Manager unticks "Enable these types of notifications." under "A
new article has been submitted to which an editor needs to be assigned."
and saves; the tab's own sentence promises that the event will then
neither show up in the system nor be emailed. The next submission raises
no task for them, as promised, but the "needs an editor" email arrives in
their mailbox all the same. Only "Do not send me an email…" stops that
email, and that box is greyed out while "Enable…" is unticked, so the
Manager who wanted nothing at all gets the email and has no box left to
stop it with. The announcement and issue emails do stop when "Enable…" is
unticked.
Basis: probe. <sup>[f-a10](#fn-a10)</sup>

<a id="a11"></a>
**A11 — The ticked editor is told nothing; the Managers are told instead** · ❓ · user-visible.
A Journal Manager ticks a Section Editor under "Editorial Assignments" on
a section's form (Settings › Journal › "Sections", "Edit") so that every
new submission to that section goes to that editor. When an Author then
submits to the section, the ticked editor's Tasks panel gains no row and
their mailbox no email; instead every Journal Manager gets the "needs an
editor" task and email (Rule 6, the row below this one's), as if nobody
were ticked. Seen on OJS and OPS, on a scratch journal; not tried on a
press, because a new press has no series and so no series form had an
editor to tick. On the install's first journal (its oldest; the seeded
journal on a test install) the assignment does happen, and there, read
from the application, the Managers' task and email are replaced by an
email from the "Editor Assigned" template to the ticked editor, with no
task and no Unsubscribe link (*Stage participants*, spec not yet written,
owns that email); its subject is not on this page, and neither that email
nor the editor's empty Tasks panel was ever seen. What would settle that
half: an editor assigned automatically on the install's first journal,
then their Tasks panel and mailbox read.
Question: is the ticked editor meant to be told on every journal? Lean:
yes. The assignment itself fails on every journal but the install's first,
a defect *[Submission wizard](U21-submission-wizard.md#a8)* records, and
this row's silence is that defect seen from the editor's side, not a
choice; a defect rather than intended.
Basis: probe (the scratch journal: the ticked editor's empty panel and
mailbox, the Managers' pair), judgment (the first journal: what the editor
gets). <sup>[f-a11](#fn-a11)</sup>

### OPS

<a id="ops1"></a>
**OPS1 — Rows for events a preprint server never raises** · ❓ · minor.
A preprint server's Notifications tab and Unsubscribe page list two rows,
seen live: "A reviewer has commented on "Title"." under "Reviewing Events"
and "Weekly email of outstanding tasks" under "Editors". A preprint server
has no reviewer role and no review stage, so nothing there can produce a
reviewer's comment. The second row is the reminder email listing an
editor's outstanding tasks: its label says "Weekly", but on a journal or a
press the email goes out monthly, a mislabel
*[Submissions dashboard (editorial)](U23-submissions-dashboard.md#a8)*
records; and on a preprint server the application never sends it at all,
because the job that sends it is not set to run there in the product
itself, not merely on the test server. So a Preprint Server Manager or
Moderator who ticks or unticks either row's boxes changes nothing, and the
reminder email never arrives. That the rows are listed was seen; that the
two events are never raised rests on reading the application, not on
watching it.
Question: hide the rows on a preprint server? Lean: yes.
Basis: probe (the rows are listed), judgment (nothing raises them).
<sup>[f-ops1](#fn-ops1)</sup>

<a id="ops2"></a>
**OPS2 — A stray space in the new-preprint row** · 🐞 · minor.
The row reads "A new preprint , "Title", has been submitted." with a space
before the first comma, on the tab and on the Unsubscribe page; the
journal and press rows have none.
Basis: probe. <sup>[f-ops2](#fn-ops2)</sup>

<a id="ops3"></a>
**OPS3 — A task's link leads nowhere on a preprint server** · 🐞 · user-visible.
A Preprint Server Manager presses a task in the Tasks panel ("A new
preprint has been submitted to which a moderator needs to be assigned."
with the preprint's title under it) expecting the preprint, as a Journal
Manager gets the submission on a journal (Rule 2c). The browser lands on a
reader-facing page whose whole text is "A workflow stage was not
specified.", and the task is marked read on the way. The preprint has to
be found through the submissions dashboard instead.
Basis: probe. <sup>[f-ops3](#fn-ops3)</sup>

---

<a id="footnotes"></a>
## Footnotes — mechanism & evidence

<a id="fn-a"></a>
**a** — The bell is `TopNavActions.vue` (`lib/ui-library`): a button whose
screen-reader text is `common.tasks` "Tasks", with a badge showing
`pkp.currentUser.unreadTasksCount` while non-zero and the modal is closed;
`openTasks()` opens a legacy modal titled "Tasks" loading
`grid.notifications.TaskNotificationsGridHandler` `fetchGrid`.
`TaskNotificationsGridHandler::loadData()` lists `Notification::withUserId()`
at `NOTIFICATION_LEVEL_TASK` ordered by creation date descending, with no
context filter (Rule 2d); `NotificationsGridHandler::initialize()` adds the
column `common.tasks`, the empty-row text `grid.noItems` "No Items", the
below-grid actions `grid.action.markNew` "Mark New", `grid.action.markRead`
"Mark Read" and `grid.action.delete` "Delete", and the features
`SelectableItemsFeature` (row boxes) and `PagingFeature` (page size from
`[interface] items_per_page`, 25 by default). The row template
`controllers/grid/tasks/task.tpl` prints the message, the context acronym
(the Create Journal form's "Journal initials" / "Press Initials" /
"Server initials" field, `acronym`; not the OJS form's "Journal
Abbreviation") when `$isMultiContext` (the user has more than one
available context) and
the submission title when the notification has one
(`NotificationsGridCellProvider::_getTitle()`). The whole `task.tpl` block is the
title of a `LinkAction` (one `<a>` around message and details) posting to
`markRead` with `redirect=1`, which stamps `dateRead` and answers a
redirect to `NotificationManager::getNotificationUrl()` (Rule 2c). `markNew`,
`markRead` and `deleteNotifications` act on `selectedElements` that belong
to the session's user and answer `update:unread-tasks-count`, which the bell
listens to (Rule 3). No confirmation dialog: the JS handlers post directly
(`NotificationsGridHandler.js`). Live-probed 2026-09-04 on OJS, OMP and OPS
(Rules 2a–2d, 3; Actors rows 1–2; Fields "The Tasks panel"): the bell
(`button` with accessible name "Tasks" / "Tasks 1") is present for
`reader.rosa`, `author.alex`, `sectioneditor.ana`, `admin`, a scratch
Reader with no role in `publicknowledge`, and an account registered on the
site-level Register page with no journal ticked (the only path to a
no-role account: the scenario API refuses an empty roles list and a
journal-level registration always adds Reader); that last account lands on
the site index after sign-in and opens the site-level profile unforwarded,
with the same bell and "No Items". The open panel is a `[role=dialog]`
with a back-arrow "Close", heading "Tasks", table columns "Select" and
"Tasks", the three action links offered on an empty list, and the pager
"0 - 0 of 0 items"; while it is open the bell has the `disabled`
attribute and no badge. The badge is white on `rgb(208, 10, 108)`. Unread:
`div.task.unread > span.message` bold, read `div.task` regular; the
acronym `span.acronym` shows for a manager enrolled in two scratch
contexts and for `admin` ("T1MCE" between sentence and title). 26 seeded
submissions on OJS: 25 rows and the pager "Items per page: 10 25 50 75
100", "1 - 25 of 26 items 1 2 > >>". "Delete" on two ticked rows: no
browser dialog, no modal, "No Items" at once, no badge after a full
reload; a second Manager's two rows survived. Every action re-renders the
grid with the boxes cleared. The link target is the grid's own
`mark-read?redirect=1&selectedElements[]=<id>` (Rule 2c); pressing the
title, the sentence or the blank cell was tried, the blank cell does
nothing. The discussion row's link (OMP) lands the same way, on the
dashboard with the panel open; the redirect is the same address for every
submission task. `pkp.currentUser.unreadTasksCount` is set at page load and
updated only by the grid's own actions, so a task raised while a page is
open gives no badge until the next load (Rule 2a; six samples on each app
on 2026-09-04, none with a badge before a reload). `markRead`, `markNew`
and `deleteNotifications` write no event-log row (traced in the handlers;
not observed on a screen, so the body does not claim it).

<a id="fn-c"></a>
**c** — `PKPNavigationMenuService::setNMIDisplayTitles()` (`NMI_TYPE_USER_DASHBOARD`,
the signed-in user's name item seeded in `registry/navigationMenus.xml`)
swaps the title for `frontend/components/navigationMenus/dashboardMenuItem.tpl`
(title plus `<span class="task_count">{$unreadNotificationCount}</span>`)
only when the user `hasRole([ROLE_ID_MANAGER, ROLE_ID_ASSISTANT,
ROLE_ID_REVIEWER, ROLE_ID_AUTHOR], $contextId)` or is a site admin;
`ROLE_ID_SUB_EDITOR` and `ROLE_ID_READER` are not in the list (A3). The count
is `Notification::getUnreadNotificationsCount()` assigned by
`PKPTemplateManager::initialize()`. Live-probed 2026-09-04 on OJS, OMP and
OPS (Rule 4; Actors row 3) on `publicknowledge`'s home page,
`#navigationUserWrapper`: `manager.maya 0` and `author.alex 0` (a visible
`span.task_count`, plus a hidden one under "Dashboard"); `sectioneditor.ana`
and `reader.rosa` the bare name. A scratch Manager with one unread task:
"1" next to the name and the bell at "1". A scratch Section Editor made a
participant of a discussion: bell "Tasks 1", the discussion row in the
window, and the bare name on the home page (OJS, OMP, OPS). On the
site's own home page (`index/en`) `admin` shows the count on the
"Dashboard" entry ("Dashboard 46" on 2026-09-04), the name itself bare;
a Manager enrolled in two scratch contexts shows the bare name there and
no count anywhere (Rule 4). A Reviewer and a Copyeditor (OJS, OMP) and an
Editorial Board Member (OPS) show "{name} 0" on the journal's home page.

<a id="fn-d"></a>
**d** — `PKPNotificationSettingsForm::getNotificationSettingCategories()`
builds the four groups (`notification.type.public`, `.submissions`,
`.reviewing`, `user.role.editors`) with the types in Fields' order;
`NOTIFICATION_TYPE_EDITORIAL_REPORT` only when
`$context->getData('editorialStatsEmail')`. OJS's subclass appends
`NOTIFICATION_TYPE_PUBLISHED_ISSUE` and `NOTIFICATION_TYPE_OPEN_ACCESS` to the
public group; OMP's and OPS's subclasses are empty (chain check). Row
sentences come from `getNotificationSettingsMap()` `settingKey` translated
with `title="common.title"` ("Title"); app locale files override the shared
ones (`notification.type.newAnnouncement`: OJS and OPS "A new announcement
has been created.", the shared "New announcement." where the app has no
override — OMP, to be confirmed live; `notification.type.submissionSubmitted`
and `.editorAssignmentTask` per app as quoted in Fields). Storage:
`NotificationSubscriptionSettingsDAO` rows `blocked_notification` (the
"Enable…" box unticked) and `blocked_emailed_notification` (the email box
ticked), keyed by user and `context_id` (null at site level). Effect:
`PKPNotificationOperationManager::createNotification()` returns null for a
blocked type (Rule 5a), and every emitter in note e checks the emailed list
before mailing (Rule 5b). The pairing is the template's `enableDisablePairs`
(a disabled box is not submitted, so `execute()` reads it as unticked:
Rule 5c). Live-probed 2026-09-04 on OJS, OMP and OPS (Fields' row table,
Rules 5a–5e, scenarios 3, 4, 7, 8): every row verbatim as in Fields, in
that order, for `manager.maya`, `admin`, a scratch Author and a scratch
Reader (same rows for every role); the opening sentence quoted in Fields is
the form's own text (`notification.settingsDescription`); OMP's
announcement row is "New announcement." (no locale override); `admin`'s
site-level tab (`index/user/profile`, tab `#notificationSettings`) lacks
"Statistics report summary.". Box round trip on the "…needs to be
assigned." row (`notificationEditorAssignmentRequired` /
`emailNotificationEditorAssignmentRequired`): email box ticked and saved →
ticked after reload; "Enable…" unticked → the email box greyed at once and
still ticked before "Save", unticked after reload; "Enable…" re-ticked →
email box unticked after reload (Rule 5c). Effects: "Enable…" unticked
stopped the needs-editor task and not its email (A10), and stopped the
announcement and issue emails; the email box ticked stopped the
needs-editor email and kept the task (scenario 4). Typing
`index/user/profile/notificationSettings` as `manager.maya` lands on
`publicknowledge/…/user/profile?0=notificationSettings` with "Identity"
open (Rule 5d); the site home's "View Profile" points at
`index/user/profile` for `manager.maya` and `admin` alike. That entry is
a hidden dropdown item under the name (`href` `…/index/en/user/profile`);
whether hovering or pressing the name shows it was not tried, so scenario
7 goes by address.

<a id="fn-e"></a>
**e** — Emitters, per row: announcements
`PKPAnnouncementController::notifyUsers()` →
`jobs/notifications/NewAnnouncementNotifyUsers` (level `NORMAL`, mail
`AnnouncementNotify` with `allowUnsubscribe()` only when `$sendEmail`; site-level
announcements notify nobody, per the method's own comment: A4); OJS issues
`IssueGridHandler::publishIssue()` → `IssuePublishedNotifyUsers` (`NORMAL`,
`IssuePublishedNotify`, footer); OJS open access `tasks/OpenAccessNotification`
→ `OpenAccessMailUsers` (`OpenAccessNotify`, footer); submitted
`SubEditorsDAO::assignEditors()` (`NORMAL` for each auto-assigned editor;
mail `EditorAssigned`, no `Unsubscribe` trait, gated on the emailed list);
published `observers/listeners/NotifyAuthorOnPublication` (`TASK`,
`AuthorPublicationPublished`, no `Unsubscribe` trait: A8); needs editor
`observers/listeners/AssignEditors` (`TASK`, `SubmissionNeedsEditor`, no
`Unsubscribe` trait: A8); discussions `editorialTask/Repository::addQuery()`
and `EditorialTaskController` (`TASK`, mailable `TemplateVariables` with the
`Discussion` trait's footer `emails.footer.unsubscribe.discussion`; the
Participants "Notify" form does the same through `PKPStageParticipantNotifyForm`);
`NOTIFICATION_TYPE_QUERY_ACTIVITY` has no `createNotification()` call anywhere
outside `classes/notification/` (A1); reviewer comment
`PKPReviewerReviewStep3Form::execute()` (`NORMAL`, to assigned
`ROLE_ID_MANAGER`/`ROLE_ID_SUB_EDITOR`, `ReviewCompleteNotifyEditors` with
`emails.footer.unsubscribe.automated`); reminder `jobs/email/EditorialReminder`
(`NORMAL`, `EditorialReminder` mailable, automated footer; OPS does not
schedule the task, per *Submissions dashboard* note n); statistics
`task/StatisticsReport` (`$_roleIds` manager and sub-editor) →
`StatisticsReportMail` (`NORMAL`, `StatisticsReportNotify`, footer, CSV
attachment). Decision tasks (`EditorDecisionNotificationManager`) are not in
the settings map. `TASK` = `NOTIFICATION_LEVEL_TASK` (listed in the Tasks
grid); `NORMAL` notifications are fetched only by screens that pass
`requestOptions` (Rule 1's notices). Toasts are `createTrivialNotification()`
(`NOTIFICATION_LEVEL_TRIVIAL`), never checked against the blocked lists.
Live-probed 2026-09-04 on OJS, OMP and OPS (Rule 6's task and email
columns; Rule 1 "recorded, not listed"): a context announcement posted
with its email box ticked reached every user with a role, the auto-enrolled
`admin` included, after `jobs.php run`, with the footer, and raised no task
(the window "No Items"); with "Enable…" unticked on the announcement row,
no email; the OJS "Publish Issue" dialog's box arrives ticked and the
issue email behaves the same (OMP and OPS have no issue rows). The
needs-editor task and email went to every manager of the scratch context
on a wizard submission (`SubmissionNeedsEditor`, from `admin@mail.test`,
subject as in Rule 6; body ending "This is an automated email from
{journal name}.", no footer, no `List-Unsubscribe` headers: A8); the
`EditorAssigned` path was not driven (its assignment fails off the first
journal, *Submission wizard* A8). Discussions: `POST
…/api/v1/submissions/{id}/tasks` raised a `TASK` row for each participant,
the opener included, and one email per participant, the opener included,
within 0.4 s; a reply (`…/tasks/{n}/notes`) raised a further row with the
opening's sentence and an email carrying the reply, with "Enable…" unticked
on "Discussion activity." making no difference (A1). An API-seeded
published submission raised the Author's "A new version of your
submission…" task on all three apps; a real publish through the workflow
on OMP ("Schedule For Publication", then Publication › "Publish", then
the window's "Publish") and OPS ("Post the preprint", "Post", "Post")
raised the same task and, within 0.4 s, the email `AuthorPublicationPublished`:
subject "Publication Published", From "{journal name}
<admin@mail.test>", body "Dear {name}, / Your publication, {title}, to
{journal name}, has been published. / To view your publication, please
visit {the item's public address}.", with no "—" line, no unsubscribe
wording and no `List-Unsubscribe` headers (A8; OJS not driven for this
half, same library mailable). The review-complete email was driven on OJS
and OMP: a reviewer who had accepted walked the review steps to "Submit
Review" and the "Confirm" window's "OK"; the assigned Section Editor's
mailbox 0.3 s later held `ReviewCompleteNotifyEditors`, subject "Review
complete: {reviewer} recommends {recommendation} for #{number} {authors}
— "{title}"" ("recommends None" on OMP, whose review form offers no
recommendation list), From "Site Admin <admin@mail.test>", text part
ending "—" then "This is an automated message from {journal name} (
{home} ). You can unsubscribe ( {link} ) from this email at any time.",
with the `List-Unsubscribe` headers; the journal's Manager, not assigned,
got no email; neither got a task. The `EditorAssigned` path (Rule 6's
"A new article, "Title," has been submitted." row) was not driven: the
assignment fails off the first journal (*Submission wizard* A8), and on a
scratch context a section with a Section Editor ticked under "Editorial
Assignments" still gave that editor no task and no email while every
Manager got the needs-editor pair; the row now states only that, and the
first-journal expectation (`NORMAL` level, so no task; `EditorAssigned`
without the `Unsubscribe` trait, so no link) is A11's, read from the
listener and mailable above (note f-a11). The open-access, reminder and
statistics emails were not driven: each comes from a scheduled task
(`OpenAccessNotification`, `EditorialReminder`, `StatisticsReport`) and the
fleets run no scheduler; nothing on a screen sends them, so their footer
sentences in Rule 7a come from the mailables' locale keys
(`emails.footer.unsubscribe` for the statistics report, `.automated` for
the reminder).

<a id="fn-f"></a>
**f** — Link: `PKPNotificationOperationManager::getUnsubscribeNotificationUrl()`
→ `{context}/notification/unsubscribe?validate=<JWT>&id=<notificationId>`;
the token is `JWT::encode(["unsubscribe-{contextId}-{userId}-{notificationId}"],
api_key_secret)`, so it is per notification and never expires (Rule 7b);
`createUnsubscribeToken()` returns '' when `[security] api_key_secret` is
empty (A6), and `Unsubscribe::headers()` adds `List-Unsubscribe` and
`List-Unsubscribe-Post: List-Unsubscribe=One-Click` only when the URL is set
(Rule 7c). Footer texts: `emails.footer.unsubscribe`, `.automated`,
`.discussion` in `lib/pkp/locale/en/emails.po`. Page:
`pages/notification/NotificationHandler::unsubscribe()` — GET displays
`PKPNotificationsUnsubscribeForm` (`notification/unsubscribeNotificationsForm.tpl`,
strings `notification.unsubscribeNotifications` "Unsubscribe",
`.pageMessage`, `.resubscribe`; one checked box per entry of
`getNotificationSettingsMap()`, unfiltered by context: A9, OPS1); POST
`validate()` (`FormValidatorPost`, `FormValidatorCSRF`: A5) then `execute()`
replaces `blocked_emailed_notification` for the notification's user and
context with the ticked boxes (Rule 8c, A2); the result template branches on
`$unsubscribeResult` between `.success`/`.successMessage` and
`.error`/`.errorMessage`. `_validateUnsubscribeRequest()` throws
`NotFoundHttpException` for a missing token or id, an unknown notification
(A7: `Notification::delete()` from the grid) or a token that does not
verify. No role policy on the handler: `PKPHandler::authorize()` adds none
for anonymous visitors (Actors row 5). `{url page="user" op="profile"}` is
the Identity tab (Rule 8e). Live-probed 2026-09-04 on OJS, OMP and OPS
(Rules 7a–7c, 8a–8e; Fields "The Unsubscribe page"; Actors row 5;
scenarios 5, 6; A2, A7, A9) from a scratch discussion's email: the text
part ends "—" then "Reply to this comment at #32 Author ( {workflow
address} ) or unsubscribe ( {link} ) from emails sent by Scratch context
{tag} ( {home} )." (OMP, OPS: "#6 Author"; the number is the submission id,
"Author" the seeded contributor's family name); the HTML part has the three
links; Mailpit's headers show `List-Unsubscribe` and
`List-Unsubscribe-Post: List-Unsubscribe=One-Click`. Signed out, the link
answers the reader-facing page (title "Unsubscribe | {journal}") with the
boxes in the order Fields lists (11 on OJS, 9 on OMP and OPS), every box
checked; the button posts to the same address and the success page
follows, "user profile" linking to `{context}/user/profile`; the link
reopened shows the page again with every box ticked. A row switched off
on the tab came back ticked on the page, and "Unsubscribe" with that box
unticked switched it back on while switching every other row off (A2). A
Journal Manager signed in opened the Author's link: the Author's address
on the page, the Author's tab rewritten, the Manager's own untouched. With
the task deleted from the Tasks panel the link answered the bare "404 Not
Found" page, signed in or out (A7); so did the link with `validate` or `id`
cut off, or with an unknown `id`. With the context set to "Do not send the
email to editors." the page still listed "Statistics report summary." (A9).
Signed out, "user profile" led to Login and then to the Profile page on
"Identity". The error branch (Rule 8d) was reached two ways on every app:
the page left open after the browser's cookies were cleared, and the page
left open in one tab while the person signed in and out again in another,
then "Unsubscribe" pressed on the old page (the `FormValidatorCSRF` check
fails; the POST answers 200 with the `.error` template: heading "We could
not unsubscribe you", text as quoted); the link opened afresh showed the
form again. Mailpit's "Text" tab shows the plain-text part, each link's
address in parentheses after the link's words (Rule 7a's last sentence).

<a id="fn-g"></a>
**g** — `layouts/backend.tpl` `.app__notifications` renders `Page.vue`'s
`notifications` array; `pkp.eventBus.$on('notify', (message, type))` pushes an
entry with `expire: Date.now() + 5000`, cleared every 250 ms unless the
container matches `:hover`; `Notification.vue` renders `pkpNotification--{type}`
with a dismiss button labelled `common.close`. Server-side trivial
notifications (`NOTIFICATION_TYPE_SUCCESS`, `WARNING`, `ERROR`, `FORBIDDEN`,
`INFORMATION`, `HELP`, `FORM_ERROR`, NOTIF-001..007 in the atlas) are fetched
by `SiteHandler.js` on load when `hasSystemNotifications` and on `notifyUser`
events through `notification/fetchNotification`, which deletes them once
fetched, and mapped in `showNotification_()`: `notifySuccess` → `success`;
`notifyWarning`, `notifyError`, `notifyFormError`, `notifyForbidden` →
`warning`; everything else → `notice`. `PKPNotificationManager::getNotificationMessage()`
falls back to `common.changesSaved` for a success without contents;
`FORM_ERROR`'s title is `form.errorsOccurred`. In-place notices
(`controllers/notification/inPlaceNotification.tpl`) are the legacy forms'
own rendering. Live-probed 2026-09-04 on OJS, OMP and OPS (Rule 9): the
save on Profile › "Notifications" gave
`.pkpNotification--success` at top 56 px, 8 px from the right edge, white
with a `rgb(0, 178, 78)` left border, "Your changes have been saved.";
its close button shows "×" with the screen-reader text "Close"; two saves
in a row stacked the second below the first; with the pointer resting on
it for 10 s it stayed and went within 0.3 s of the pointer leaving.
Unhovered, the toast went 5.3 s after appearing, on all three apps
(the code's 5 s plus the 250 ms sweep). Ticking
"Custom Block Manager" on Settings › Website › "Plugins" gave
`.pkpNotification--notice` with a `rgb(0, 103, 152)` left border, "The
plugin "Custom Block Manager" has been enabled.", no page reload. A wrong
current password on the "Password" tab gave no toast: the in-form
`div.notifyFormError` with the bold "Errors occurred processing this form"
and "The current password you entered was incorrect." removed itself 6.7 s
after the press. No probed screen produced a `--warning` toast or a
message across a full-page load (checked again 2026-09-04 on every
screen this spec drives); the warning look is the same component with
another class, traced in the code and not seen. Settling observation: an
action the server refuses with a toast.

<a id="fn-h"></a>
**h** — `RegistrationForm::execute()`: when a context is open and
`emailConsent` is unticked, every type of the `notification.type.public`
category is written to `blocked_emailed_notification` for the new user and
that context; nothing is written when the box is ticked. *Registration &
account validation* note e traced the same code. Live-probed 2026-09-04 on
OJS, OMP and OPS (Rule 5e, scenario 8): a scratch context's Register page
with `emailConsent` unticked signed the visitor in at once ("Registration
complete", no email; the fleets do not require validation) and the tab
showed "Do not send me an email…" ticked on every "Public Announcements"
row ("New announcement." alone on OMP, "A new announcement has been
created." alone on OPS) with
"Enable…" ticked; a second registration with the box ticked left every
box at its default.

<a id="fn-i"></a>
**i** — `editorialStatsEmail` (context setting; Settings › Workflow ›
"Emails" › "For Editors" › "Editorial statistics", radios "Send a monthly
email to editors." / "Do not send the email to editors."; live-probed
2026-09-04 on OJS, OMP and OPS: the second radio saved through `POST
…/api/v1/contexts/{id}` dropped the row from the tab, the first restored
it; the description mentions "the journal" on OMP and OPS too).
`[security] api_key_secret` is
`"Api_Key_Secret_For_Testing_Purposes_Only"` on the fleets
(`shared/playwright/make-test-config.js`). `[interface] items_per_page = 25`
(`config.TEMPLATE.inc.php`). The scenario API has no `editorialStatsEmail`
passthrough (scenarios.md "Field shapes not built yet" lists none), so the
off end is probed through the settings screen on a scratch context.

<a id="fn-s0"></a>
**s0** — Ready accounts: `manager.maya` (Journal Manager),
`sectioneditor.ana`, `author.alex`, `reader.rosa`; the password is the
username twice; `admin`/`admin` is the Site Administrator. Scratch journals,
throwaway users and submissions come from the scenario API (`POST
scenarios/context`, `scenarios/submission`; users.md, scenarios.md). The
mail catcher is Mailpit at `http://127.0.0.1:8025`, scoped by recipient
address (PRINCIPLES A8). The job runner is off on the fleets: an email or
notification produced by a queued job (announcements, issues, the statistics
report) needs `runJobs()` in the serial project before it can be asserted
(by hand: `php lib/pkp/tools/jobs.php run` from the application's root,
the command `runJobs()` wraps), and its links carry the config `base_url`
host; the "needs an editor"
email, the discussion email and the tasks in scenarios 1–6 are sent inside
the request (0.2–0.4 s on 2026-09-04) with links on the request host.
The job runner prints one "Processing:" / "Processed:" pair per job with
the job's name (`NewAnnouncementNotifyUsers`, `IssuePublishedNotifyUsers`)
and ends "[OK] Completed running N jobs in the queue named queue."; before
it runs the mailbox holds nothing for the event (2026-09-04, all apps).
Mailpit shows the plain-text part on the message's "Text" tab, each
link's address in parentheses after the link's words. The wizard on a
scratch context (2026-09-04, all apps): "Begin Submission" wants the
title, the checklist box and the privacy box; the files step a file with
its genre; the details step the abstract on OJS and OPS (the default
section requires it; not on OMP) and on OPS the "For Readers" choice; the
footer's "Submit" opens a dialog whose button is "Submit".

<a id="fn-s1"></a>
**s1** — A scratch context whose sections have no assigned editors (the
default of `POST scenarios/context`; the section form's "Editorial
Assignments" box confirmed empty 2026-09-04); the throwaway manager must
hold the `manager` role there, and `admin` is auto-enrolled as a manager
and gets the task too. `POST scenarios/submission` with `submitted: true`
raises the task but sends no email (the request runs under
`Mail::fake()`), so a scenario that reads a mailbox drives the wizard; the
wizard's final "Submit" raises both. Expected task text per app: Fields,
"Submission Events", third row. Landing on 2026-09-04: OJS and OMP
`{context}/dashboard/editorial?workflowSubmissionId=<id>` (heading = the
author's name; the trailing query part after the id came and went between
runs, so only the path and `workflowSubmissionId` are asserted); OPS
`{context}/user/authorizationDenied?message=user.authorization.workflowStageRequired`
(OPS3).

<a id="fn-s2"></a>
**s2** — Two tasks from two submissions on the same scratch context; the
unread look is `div.task.unread` in `task.tpl`. Driven 2026-09-04 on all
three apps as written.

<a id="fn-s3"></a>
**s3** — Box names: `notificationEditorAssignmentRequired` and
`emailNotificationEditorAssignmentRequired`. The email is
`SubmissionNeedsEditor` (template `SUBMISSION_NEEDS_EDITOR`, from
`admin@mail.test`). Toast: `common.changesSaved`. Driven 2026-09-04 on all
three apps: Manager A's mailbox held exactly that email (A10). Every
Manager of the scratch context already holds a needs-editor row from each
earlier submission (a seeded `submitted: true` submission raises the row
too), so the assertion is "no row for this title and the badge unchanged",
never "No Items".

<a id="fn-s4"></a>
**s4** — Same accounts and box names as s3. Driven 2026-09-04 on all three
apps: Manager A's mailbox count stayed at its earlier total while Manager
B's email for the new title arrived.

<a id="fn-s5"></a>
**s5** — The discussion is added through the workflow's tasks & discussions
manager (`[data-cy="discussion-manager"]`, button "Add",
`input[name="title"]`, `input[name="participants"]`, TinyMCE for the
message; `POST …/api/v1/submissions/{id}/tasks`), which emails every
participant with `TemplateVariables` and the
`emails.footer.unsubscribe.discussion` footer; the participant boxes load
a moment after the form opens and only users on the submission plus the
opener are offered. Leaving the workflow page after the save raises the
browser's leave-page prompt. The link is
`{context}/notification/unsubscribe?validate=…&id=…`. On OMP and OPS at
the 2026-09-02 pkp tips the save fails with `Class
"APP\notification\Notification" not found` until the campaign's overlay
class is mounted (`docs/tracking/app-changes.md` row 12; the fleets run
with it). Driven 2026-09-04 on all three apps up to and including the
second discussion, with the Manager's own copy as the control.

<a id="fn-s6"></a>
**s6** — The addressee is `Notification::userId` of the link's notification;
the page's sentence prints `$userEmail` from that user, whatever the session.
Driven 2026-09-04 on all three apps as written.

<a id="fn-s7"></a>
**s7** — `manager.maya` on `publicknowledge`; `editorialStatsEmail` is on by
default (seed-facts). Site-level address: `index/user/profile`, opened as
`admin`: `manager.maya` holds a role in one journal only and is forwarded
(*User profile* A1), and a scratch context must exist so the site has
several journals. Driven 2026-09-04 on all three apps: rows as in Fields;
`admin`'s site-level tab without the statistics row.

<a id="fn-s8"></a>
**s8** — The Register page of a scratch context (registration open by
default, seed-facts); box `input[name=emailConsent]`. Box names on the tab:
`emailNotificationNewAnnouncement`, and on OJS `emailNotificationPublishedIssue`,
`emailNotificationOpenAccess`. Driven 2026-09-04 on all three apps (note h).

<a id="fn-s9"></a>
**s9** — OJS only: `IssueGridHandler::publishIssue()` with
`sendIssueNotification` (`notification.sendNotificationConfirmation`, checked by
default in `assignPublicIdentifiersForm.tpl`); the job `IssuePublishedNotifyUsers` needs
`runJobs()`. The Reader's box: `notificationPublishedIssue`. The dialog's other
labels belong to *Issues*. Driven 2026-09-04 on OJS: on Issues › Future
Issues the "Publish Issue" link is folded under the row's expander arrow
(not visible until the arrow is pressed); the dialog's box arrives
ticked and its confirm button is "OK"; an issue with no articles
published without a warning ("0" items); the Author's email (subject "Just
published: Vol. 1 No. 1 (2026): {title} of {journal name}", the issue's
identification "Vol. 1 No. 1 (2026): {title}" as the list shows it) carries
the footer, the Reader with "Enable…" unticked
got none; OMP and OPS have no issue rows (note d).

<a id="fn-a1"></a>
**f-a1** — `NOTIFICATION_TYPE_QUERY_ACTIVITY` (`0x1000022`) is defined, mapped
(`getNotificationSettingsMap()`, `QueryNotificationManager`) and listed, but
grep over `lib/pkp` and the three app trees finds no `createNotification()`
or `updateNotification()` with it; discussion replies
(`EditorialTaskController`, `Repository::addNote…`) raise nothing of that
type. Live-probed 2026-09-04 on OJS: the Author's reply (`POST
…/api/v1/submissions/{id}/tasks/{n}/notes`) gave the Manager a new
`TASK` row whose text was the opening row's ("{opener} started a
discussion: {name}: {opening message}", a new notification id) and an
email from the Author with the reply and the discussion footer; with the
Manager's "Enable…" unticked under "Discussion activity." a second reply
did the same. Re-driven 2026-09-04 on OJS, OMP and OPS with the overlay
of note s5 mounted: the Author's reply reached the Manager as a task row
and an email on all three apps, with "Discussion activity." unticked
making no difference; the controller is shared and neither app overrides
it.

<a id="fn-a2"></a>
**f-a2** — `PKPNotificationsUnsubscribeForm::execute()` calls
`updateNotificationSubscriptionSettings('blocked_emailed_notification',
$emailSettings, …)`, which deletes the user's existing rows for that context
before inserting the ticked boxes; the template checks every box
(`checked="checked"`). Live-probed 2026-09-04 on OJS, OMP and OPS (note f):
a row switched off on the tab came back ticked on the page, and
"Unsubscribe" with it unticked switched it on again on the tab.

<a id="fn-a3"></a>
**f-a3** — Note c: the role list in `setNMIDisplayTitles()` omits
`ROLE_ID_SUB_EDITOR`. Live-probed 2026-09-04 on OJS, OMP and OPS: a scratch
Section Editor (Series Editor, Moderator) with the bell at "Tasks 1" from a
discussion shows the bare name on the journal's home page; `manager.maya`
and `author.alex` show "0" there without a task.

<a id="fn-a4"></a>
**f-a4** — `PKPNotificationSettingsForm::fetch()` with `$context === null`
reads and writes `context_id` null; `PKPAnnouncementController::notifyUsers()`
is called only for context announcements ("There is no way to determine
users who have subscribed to site-level announcements"); no other emitter
in note e runs without a context. Live-probed 2026-09-04 on OJS, OMP and
OPS: Administration › Site Settings › "Announcements" › "Announcements" ›
"Add Announcement" with "Send an email about this to all registered users."
ticked (`POST …/index/api/v1/announcements` 200) queued no job ("No jobs
available to run"), sent nothing to a Reader, a Manager or
`admin@mail.test`, and left the Reader's window at "No Items".

<a id="fn-a5"></a>
**f-a5** — `Unsubscribe::headers()` sets `List-Unsubscribe-Post:
List-Unsubscribe=One-Click` (RFC 8058), whose POST carries only
`List-Unsubscribe=One-Click` as the body; `NotificationHandler::unsubscribe()`
runs `validate()` with `FormValidatorCSRF`, which fails without the session
token, and renders the error branch. Cannot be driven through the
application's screens. Seen 2026-09-04: Mailpit shows the header as an
"Unsubscribe" line on the message but offers no one-click button, so
nothing could be pressed on the test installs either. Settling
observation: a mail program with a working one-click "Unsubscribe"
pressed on one of these emails, then the addressee's tab.

<a id="fn-a6"></a>
**f-a6** — Note f: `createUnsubscribeToken()` returns '' for an empty secret,
`getUnsubscribeNotificationUrl()` still builds the URL with `validate=`,
and `_validateUnsubscribeRequest()` throws `NotFoundHttpException` for an
empty token. `Unsubscribe::headers()` skips the headers only when
`unsubscribeUrl` is empty, and the URL is never empty (only its token is),
so the headers carry the dead link too. `config.TEMPLATE.inc.php` ships
`api_key_secret = ""` and nothing under `classes/install` sets it, so a
fresh install's file has it empty until the administrator edits the line.
Fixed on the fleets by `make-test-config.js`; not probeable there.

<a id="fn-a7"></a>
**f-a7** — `NotificationsGridHandler::deleteNotifications()` calls
`Notification::delete()`; `_validateUnsubscribeRequest()` answers 404 for a
missing id. Live-probed 2026-09-04 on OJS, OMP and OPS with a discussion
email: the task deleted from the panel, the footer link answered the bare
"404 Not Found" page, signed in and signed out.

<a id="fn-a8"></a>
**f-a8** — `SubmissionNeedsEditor` and `AuthorPublicationPublished` extend
`Mailable` without the `Unsubscribe` trait and their emitters never call
`allowUnsubscribe()` (note e), while `EditorAssigned` (the auto-assignment
email) is the same. Live-probed 2026-09-04 on OJS, OMP and OPS for the
needs-editor email: no "—" line, no "unsubscribe" wording, no
`List-Unsubscribe` headers in Mailpit. The "Publication Published" email
was seen the same day on OMP and OPS after a Manager published through
the workflow (note e): subject "Publication Published", From "{journal
name} <admin@mail.test>", ending with the item's public address, no "—"
line, no unsubscribe wording, no `List-Unsubscribe` headers, and the
Author's Tasks window holding "A new version of your submission…". Not
seen: whether "Do not send me an email…" under "A new version…" stops
it; settling observation: a publish with that box ticked on the Author's
tab.

<a id="fn-a9"></a>
**f-a9** — `PKPNotificationsUnsubscribeForm::fetch()` assigns the whole
`getNotificationSettingsMap()` as `emailSettings`; the tab filters through
`getNotificationSettingCategories($context)`. Live-probed 2026-09-04 on
OJS, OMP and OPS on a scratch context set to "Do not send the email to
editors.": the tab's "Editors" group held one row, the page still 11 (OJS)
or 9 boxes ending "Statistics report summary.".

<a id="fn-a10"></a>
**f-a10** — `observers/listeners/AssignEditors` creates the `TASK`
notification through `PKPNotificationOperationManager::createNotification()`,
which returns null for a type in `blocked_notification` (Rule 5a), then
mails `SubmissionNeedsEditor` to every manager after its own check of
`BLOCKED_EMAIL_NOTIFICATION_KEY` only, so the "Enable…" box never reaches
the mail branch; the announcement and issue emails did stop with
"Enable…" unticked on the same day's probe (note e). Live-probed
2026-09-04 on OJS, OMP and OPS: a Manager with "Enable…" unticked and saved
(email box greyed, unticked after reload) had "No Items" and "0 - 0 of 0
items" after the Author's wizard submission, and exactly one email in the
mailbox, subject "A new submission needs an editor to be assigned:
"{title}"", from "Site Admin <admin@mail.test>"; the same Manager with
"Enable…" and the email box both ticked got the task and no email (Rule
5b).

<a id="fn-a11"></a>
**f-a11** — `SubEditorsDAO::assignEditors()` assigns the section's
configured editors and, for each, creates a
`NOTIFICATION_TYPE_SUBMISSION_SUBMITTED` notification at
`NOTIFICATION_LEVEL_NORMAL` (not `TASK`, so no row in the Tasks grid) and
sends the `EditorAssigned` mailable (owned by *Stage participants*; no
`Unsubscribe` trait, so no footer and no `List-Unsubscribe` headers); with
no assignment, `observers/listeners/AssignEditors` raises the
`NOTIFICATION_TYPE_EDITOR_ASSIGNMENT_REQUIRED` task for every manager and
sends `SubmissionNeedsEditor` (note e). The assignment fails off the
install's first context because `assignEditors()` filters against the
user-group collection's array indexes instead of its group ids
(*Submission wizard* A8, live-probed 2026-08-25: two scratch journals
assigned nobody, the seeded first journal assigned and emailed all three
configured editors). Live-probed 2026-09-04 on OJS and OPS (Rule 6's
"A new article, "Title," has been submitted." row): on a scratch context
the section form (Settings › Journal › "Sections" › Edit "Articles"; OPS
"Preprints") showed the Section Editor ticked under "Editorial
Assignments" ("Assign … as Section editor"; OPS "as Moderator"); the
Author's wizard submission gave that editor no email within 8 s (mailbox
count unchanged) and a Tasks panel reading "No Items", while every
Manager got the needs-editor task and email. OMP not driven: a scratch
press has no series to tick an editor on. The first-journal half was not
driven in this spec (the seeded journal is read-only for campaign work),
so the `EditorAssigned` email's subject and the editor's panel there are
read from the mailable and the level above, not seen; the settling
observation is an editor assigned automatically on the install's first
journal, then their Tasks panel and mailbox read.

<a id="fn-ops1"></a>
**f-ops1** — OPS's `NotificationSettingsForm` and `NotificationManager` do not
override the categories or the map (chain check); OPS has no reviewer group
(seed-facts) and no review stage, and `EditorialReminder` is not scheduled on
OPS (*Submissions dashboard* note n). Live-probed 2026-09-04: both rows on
the OPS tab for `manager.maya`, `admin` and a scratch Author, and both
boxes on the OPS Unsubscribe page.

<a id="fn-ops2"></a>
**f-ops2** — `ops/locale/en/locale.po` `notification.type.submissionSubmitted`:
`"A new preprint , \"{$title}\", has been submitted."`. Live-probed
2026-09-03 and 2026-09-04 on the OPS tab (every role driven) and on the OPS
Unsubscribe page; the second comma sits outside the quotes, unlike the OJS
and OMP rows.

<a id="fn-ops3"></a>
**f-ops3** — `TaskNotificationsGridHandler` `markRead` with `redirect=1`
answers a redirect to `PKPNotificationManager::getNotificationUrl()`, which
for a submission notification builds
`{context}/dashboard/editorial?workflowSubmissionId=<id>` on every app; on
OPS that address answers
`user/authorizationDenied?message=user.authorization.workflowStageRequired`
(the message of `WorkflowStageRequiredPolicy`: no stage in the address), a
front-end page whose body is `user.authorization.workflowStageRequired`
"A workflow stage was not specified.". Which OPS handler applies that
policy to the dashboard address was not traced. Live-probed 2026-09-04 on
OPS with the needs-editor task,
pressing the sentence and the title alike; `dateRead` was set (no badge
afterwards, the row read). OJS and OMP land on
`dashboard/editorial?workflowSubmissionId=<id>…` with the workflow panel
open. Not seen on the discussion or "published" tasks; same redirect.

## Reference — entry points & surfaces

| Entry | Path | Atom |
|-------|------|------|
| The bell and its badge (editorial header) | `TopNavActions.vue` → legacy modal "Tasks" | AFFW-698 · AFFU-111 (rider on *Navigation menus & site chrome*'s header) |
| Tasks panel content | `page.PageHandler` `tasks` → `grid.notifications.TaskNotificationsGridHandler` `fetchGrid` | AFFW-698..700 · AFFU-111..116 · GRID-039..040 |
| Task row actions | `markNew`, `markRead` (+ `redirect`), `deleteNotifications` on the grid handler | AFFU-113..115 |
| Reader-side unread count | `frontend/components/navigationMenus/dashboardMenuItem.tpl` `.task_count` | AFFR-009 |
| Toast fetch | `{context}/notification/fetchNotification` (JS-only; `notificationOptions.tpl` config) | ROUTE-020 · AFFU-117 · NOTIF-001..007 |
| Notifications tab boxes | Profile → "Notifications" → `saveNotificationSettings` | AFFU-093..095 (tab shell AFFU-058: *User profile*) |
| Unsubscribe page | `{context}/notification/unsubscribe?validate=…&id=…` (GET form, POST result) | ROUTE-020 · AFFU-118..121 |
| Config, no screen | `config.inc.php` `[security] api_key_secret` · `[interface] items_per_page` | — |

## Reference — code anchors

- `lib/pkp/classes/notification/Notification.php` (levels, types, `getUnreadNotificationsCount()`) · `PKPNotificationOperationManager.php` (`createNotification`, `createTrivialNotification`, unsubscribe token and URL) · `PKPNotificationManager.php` (`getNotificationSettingsMap`, messages, URLs, delegates) · `NotificationSubscriptionSettingsDAO.php` · app `classes/notification/NotificationManager.php` (OJS adds the issue and open-access types)
- `lib/pkp/classes/notification/form/PKPNotificationSettingsForm.php` (+ app subclasses) · `PKPNotificationsUnsubscribeForm.php`
- `lib/pkp/pages/notification/NotificationHandler.php` (`fetchNotification`, `unsubscribe`)
- `lib/pkp/controllers/grid/notifications/NotificationsGridHandler.php` · `TaskNotificationsGridHandler.php` · `NotificationsGridCellProvider.php` · `lib/pkp/controllers/page/PageHandler.php` (`tasks`)
- `lib/pkp/classes/mail/traits/Unsubscribe.php` · `traits/Discussion.php` · `lib/pkp/locale/en/emails.po` (`emails.footer.unsubscribe*`)
- Emitters: `lib/pkp/api/v1/announcements/PKPAnnouncementController.php` · `lib/pkp/jobs/notifications/NewAnnouncementNotifyUsers.php` · `lib/pkp/classes/observers/listeners/AssignEditors.php` · `NotifyAuthorOnPublication.php` · `lib/pkp/classes/context/SubEditorsDAO.php` · `lib/pkp/classes/editorialTask/Repository.php` · `lib/pkp/api/v1/submissions/tasks/EditorialTaskController.php` · `lib/pkp/classes/submission/reviewer/form/PKPReviewerReviewStep3Form.php` · `lib/pkp/jobs/email/EditorialReminder.php` · `lib/pkp/classes/task/StatisticsReport.php` · `lib/pkp/jobs/notifications/StatisticsReportMail.php` · OJS `classes/controllers/grid/issues/IssueGridHandler.php`, `jobs/notifications/IssuePublishedNotifyUsers.php`, `classes/tasks/OpenAccessNotification.php`, `jobs/notifications/OpenAccessMailUsers.php`
- `lib/pkp/classes/user/form/RegistrationForm.php` (`emailConsent`)
- `lib/pkp/classes/services/PKPNavigationMenuService.php` (`setNMIDisplayTitles`) · `lib/pkp/classes/template/PKPTemplateManager.php` (`unreadTasksCount`, `unreadNotificationCount`, `hasSystemNotifications`)
- UI: `lib/ui-library/src/components/TopNavActions/TopNavActions.vue` · `components/Container/Page.vue` · `components/Notification/Notification.vue` · `lib/pkp/js/controllers/SiteHandler.js` · `NotificationHandler.js` · `lib/pkp/js/controllers/grid/notifications/NotificationsGridHandler.js`
- Templates: `lib/pkp/templates/user/notificationSettingsForm.tpl` · `notification/unsubscribeNotificationsForm.tpl` · `unsubscribeNotificationsResult.tpl` · `controllers/page/tasks.tpl` · `controllers/grid/tasks/task.tpl` · `controllers/notification/notificationOptions.tpl` · `frontend/components/navigationMenus/dashboardMenuItem.tpl` · `layouts/backend.tpl`
