---
name: submissions-dashboard
scope: Editors, managers and assistants find, filter, triage and open submissions — the editorial views, search, activity cells and bulk cleanup, plus the shared list machinery the other backend submission lists ride
apps: [ojs, omp, ops]
shared: pkp-lib
status: draft
atlas-claims: [AFFW-001, AFFW-002, AFFW-003, AFFW-004, AFFW-005, AFFW-006, AFFW-007, AFFW-008, AFFW-009, AFFW-010, AFFW-011, AFFW-012, AFFW-013, AFFW-014, AFFW-015, AFFW-016, AFFW-017, AFFW-018, AFFW-019, AFFW-020, AFFW-021, AFFW-022, AFFW-023, AFFW-024, AFFW-025, AFFW-026, AFFW-028, AFFW-030, AFFW-031, AFFW-032, AFFW-033, AFFW-034, AFFW-035, AFFW-036, AFFW-037, AFFW-038, AFFW-039, AFFW-041, AFFW-042, AFFW-043, AFFW-044, AFFW-045, AFFW-046, AFFW-047, AFFW-051, AFFW-052, AFFW-053, AFFW-054, AFFW-055, AFFW-056, AFFW-058, AFFW-059, AFFW-060, AFFW-061, AFFW-062, AFFW-063, AFFW-064, AFFW-066, AFFW-067, ROUTE-007, ROUTE-008, ROUTE-035, ROUTE-057, ROUTE-074, VUE-003, VUE-075, API-006, MAIL-025, JOB-011, JOB-046]
---

# Submissions dashboard (editorial)

> Conventions (markers, badges, footnotes): [Reading a spec](GLOSSARY.md#reading-a-spec).

## Purpose

The editorial dashboard is the editorial team's home in the backend: one
page, per journal, listing the journal's submissions sliced into named
*views* — "Active submissions", "Reviews overdue", "Published" and so on —
with a search box, a filter panel, and one row per submission showing where
it stands and what needs doing next. From here a Journal Manager, Section
Editor or assistant finds a submission, reads its state at a glance (stage,
days since anything happened, review progress), acts on the most common next
step right from the row (assign an editor, assign reviewers), opens the full
workflow in place, and cleans up abandoned incomplete submissions in bulk.

This spec also owns the list machinery every backend submission list shares —
the table, search, the filter panel, the selection mode for deleting
incomplete submissions, and the open-in-place workflow panel. The author's
own list (*[My Submissions](U22-my-submissions.md)*) and the reviewer's
assignment list (*Reviewer's review* — no spec yet) are separate features
that ride this machinery; their rows, views and permissions are specified
there, not here.

## Actors & permissions

**The editorial roles** on this page are **Site Administrator**, **Journal
Manager**, **Section Editor**, and the assistant-level roles (**Copyeditor**,
**Layout Editor**, **Proofreader**, **Funding Coordinator** — "an assistant"
below). Two scopes run through everything (Rule 3): Journal Managers and
Site Administrators work **journal-wide** — every submission in the journal;
Section Editors and assistants work **assigned-only** — they see and search
only submissions they are assigned to through one of these roles (listed on
a stage's Participants panel). Holding Author or Reviewer alongside an
editorial role changes nothing here except the conflict rows of Rule 9a.

| Action | Who may — and when |
|--------|--------------------|
| **Open the editorial dashboard** | • the editorial roles — from the sidebar's "Editor Dashboard" group or by its direct address<br>• any signed-in user with none of these roles typing the address — the access-denied page <sup>a</sup> |
| **See a submission listed** | • Journal Manager, Site Administrator — every submission in the journal, in whichever views match its state<br>• Section Editor, assistants — only submissions they are assigned to (Rule 3) <sup>c</sup> |
| **See the "Needs editor" view** | • Journal Manager, Site Administrator only {OJS OMP} <sup>b</sup> |
| **See the "Declined" view** | • Journal Manager, Site Administrator only — Section Editors and assistants have no view that lists declined submissions ⚠ [A1](#a1) <sup>b</sup> |
| **Open a submission's workflow ("View")** | • every editorial role — on any row listed for them, except a conflict row (Rule 9a) or an incomplete submission's row (Rule 9c) <sup>l</sup> |
| **Filter by "Assigned To Editor"** | • Journal Manager, Site Administrator — the field appears in their Filters panel only (Rule 8) <sup>i</sup> |
| **Delete incomplete submissions in bulk** | • Journal Manager, Site Administrator — over any incomplete submission in the journal (Rule 12); Section Editors and assistants get no "More Actions" control at all here (authors get it on their own list — [→ deleting drafts](U22-my-submissions.md)) <sup>m</sup> |
| **Receive the monthly outstanding-tasks email** | • Journal Manager, Section Editor — active accounts with at least one outstanding item, unless they opted out {OJS OMP} (Side effects) <sup>n</sup> |

## Fields & validation

The page collects no data of its own; its one form is the **Filters** panel
(Rule 8). Which fields the panel offers depends on the journal's setup and
the account's roles — never on which dashboard page it opens from:

| Field (UI label) | Appears when | Rules |
|------------------|--------------|-------|
| Section {OJS OPS} | the journal has more than one section | tick one or more sections; a press never offers a series filter ⚠ [OMP1](#omp1) <sup>i</sup> |
| Assigned To Editor — labelled "Assigned to Moderator" on a preprint server {OPS} | the account holds Journal Manager or Site Administrator | pick one or more people from a suggest list of the journal's Journal Managers and Section Editors; the list offers nothing until a name is typed <sup>i</sup> |
| Categories | the journal has at least one category | pick one or more categories <sup>i</sup> |
| Issues {OJS} | the journal has at least one issue | pick one or more issues <sup>i</sup> |
| Days since last activity | always | a slider from 0 to 180 days — keeps only submissions idle for at least that many days; 0 means no restriction <sup>i</sup> |

## Rules & state

<a id="views-sidebar"></a>
1. **Where it lives.** The backend sidebar shows an **"Editor Dashboard"**
   menu group to every holder of an editorial role. Its entries are the
   dashboard's views, each with a live count badge; choosing one opens the
   list filtered to that view. At the top of the group sits a search box
   labelled "Search submissions" (Rule 7). The count badge of "Reviews
   overdue" is colored to draw attention — whatever it counts, zero
   included; the other badges are plain {OJS OMP}. Accounts also holding Reviewer or Author see that role's own
   sidebar group beside this one (owned by *Reviewer's review* — no spec
   yet — and *[My Submissions](U22-my-submissions.md)*), and "Start A New
   Submission" (owned by *[Submission wizard](U21-submission-wizard.md#ways-in)*).
   <sup>a</sup> <sup>d</sup>
2. **The views.** A view is a named slice of the journal's submissions; one
   submission can sit in several views at once. Which views exist depends on
   the app — a preprint server, with no review or copyediting, has far
   fewer: <sup>b</sup>

   | View | Lists | OJS | OMP | OPS |
   |------|-------|:---:|:---:|:---:|
   | Assigned to me | submissions still in progress that the signed-in account is assigned to | ✓ | ✓ | ✓ |
   | Active submissions | every submission still awaiting an outcome — incomplete ones included | ✓ | ✓ | ✓ |
   | Needs editor | active submissions with no editor assigned yet (Journal Manager / Site Administrator only) | ✓ | ✓ | — |
   | All in submission stage | active submissions sitting on the Submission stage | ✓ | ✓ | — |
   | Needs reviews | submissions in review with fewer confirmed reviews than the journal requires | ✓ | ✓ | — |
   | Awaiting reviews | submissions in review with reviews still outstanding | ✓ | ✓ | — |
   | Reviews submitted | submissions in review with at least one review submitted | ✓ | ✓ | — |
   | Reviews overdue | submissions in review with an overdue review request or review | ✓ | ✓ | — |
   | Author revisions submitted | submissions whose authors have delivered requested revisions | ✓ | ✓ | — |
   | All in review stage | active submissions on the Review stage — on a press, both of its review stages under the one entry | ✓ | ✓ | — |
   | All in copyediting stage | active submissions on the Copyediting stage | ✓ | ✓ | — |
   | All in production stage | active submissions on the Production stage | ✓ | ✓ | ✓ |
   | Scheduled for publication | submissions scheduled but not yet published | ✓ | ✓ | ✓ |
   | Published | published submissions | ✓ | ✓ | ✓ |
   | Declined | declined submissions (Journal Manager / Site Administrator only ⚠ [A1](#a1)) | ✓ | ✓ | ✓ |

   Every view honors the account's scope (Rule 3): "All in submission
   stage" for a Section Editor means *their* submissions on that stage.
   "Assigned to me" is the landing view and differs from "Active
   submissions" even for a Journal Manager — it lists only submissions the
   account is itself assigned to. <sup>b</sup> <sup>c</sup>
<a id="scope"></a>
3. **Scope.** Journal Managers and Site Administrators see the whole
   journal. Section Editors and assistants see only submissions where they
   are listed as a participant through that editorial role — an assignment
   as Author or Reviewer does not surface a submission on *this* dashboard
   (it surfaces on My Submissions or the reviewer's list instead). The
   scope applies uniformly to views, search and counts. <sup>c</sup>
4. **Addresses.** The page's address records the current state — the
   view, the search phrase, any filters, the sort, and an open workflow
   panel — so it can be bookmarked, shared or reloaded as-is. Two
   exceptions: the pager's current page is never recorded (page 2 cannot
   be bookmarked), and a switched-off sort is mis-recorded ⚠ [A5](#a5). The retired submission-list address from older versions —
   `{journal path}/submissions` — forwards to the signed-in account's
   home list (precedence owned by
   *[My Submissions](U22-my-submissions.md)*, "Landing"). <sup>e</sup>
<a id="table"></a>
5. **The heading and the table.** The heading names the current view with
   its total, e.g. "Active submissions (10)", and shows a spinner while the
   list loads. Columns are **ID** (sortable), **Submissions** (the
   authors-and-title line), **Stage** (the current stage — or the outcome,
   e.g. "Declined" — named in plain text with a small colored dot beside
   it), **Days** (days since the
   submission's last activity; sortable), **Editorial Activity** (Rule 9)
   and **Actions** ("View", Rule 11). An incomplete submission's Stage
   cell reads "Incomplete" — except on a preprint server, which has no
   "Incomplete" label: there it reads "Production" {OPS}. A sortable header cycles through
   three states as it is clicked — descending, ascending, then unsorted —
   and the address follows for the first two; switching the sort off
   leaves the old sort in the address ⚠ [A5](#a5). The list pages at 30
   rows, with pager controls underneath on any view holding more; which
   page is showing is never part of the address (Rule 4). An empty view
   shows a single "No Items" row.
   The author's and reviewer's lists reuse this table with their own
   columns (theirs have no "Days"). <sup>f</sup>
<a id="search"></a>
6. **Search within a view.** The search box above the list ("Search
   submissions, ID, authors, keywords, etc.") narrows the *current view* —
   the heading keeps the view's name and the count follows. An active
   search shows as a chip above the table with an X to clear it; "Clear
   Filters" appears beside the chips whenever panel filters are active.
   Switching views clears the search. <sup>g</sup>
<a id="search-view"></a>
7. **Global search.** The sidebar's "Search submissions" box searches
   *everything the account can reach* — the whole journal for a Journal
   Manager or Site Administrator, their assigned submissions for a Section
   Editor or assistant (the Rule 3 scope: a submission they merely authored
   stays out of these results too — My Submissions finds it) — regardless
   of state: it is the one place a Section
   Editor can still find a declined or published submission of theirs
   ⚠ [A1](#a1). Submitting it opens the **"Search Results"** view with the
   phrase as a chip; the in-page search box disappears there (the sidebar
   box owns the phrase). Filters still work on top of the results. Only
   when the phrase and every filter are cleared does the page leave the
   view, returning to the one the search started from — clearing the
   phrase alone, with a filter chip still active, stays on "Search
   Results". <sup>h</sup>
<a id="filters"></a>
8. **Filters.** The "Filters" button opens a side panel (title "Filters")
   with the fields of the Fields table, "Clear Filters" and "Apply
   Filters". Applying closes the panel, narrows the current view, and puts
   one chip per active filter above the table — each with an X to drop just
   that filter. Filters combine with the search phrase. Switching views
   clears them. <sup>i</sup>
<a id="activity"></a>
9. **The Editorial Activity cell** tells the team what state the submission
   is in — and offers the next step where there is an obvious one. Exactly
   one of the following renders, checked in this order: <sup>j</sup>
   - 9a. **Conflict rows.** When the signed-in user is on the submission as
     an author (and not through any editorial role), the cell reads "You
     cannot access this submission as a Journal Manager since you are the
     author. To view it, go to \"My Submissions\"" — the wording says
     "Journal Manager" whoever is looking, on every app ⚠ [A3](#a3) — and
     the row offers no buttons at all: no "View", and no activity-cell
     action such as "Assign Editor". The same applies when they are on it as a
     reviewer, pointing to "Review Assignments" instead {OJS OMP}. Only
     journal-wide accounts ever see these rows (Rule 3). <sup>j</sup>
   - 9b. **Declined**: "Declined during the {stage} stage." — the stage by
     its plain name: a review-stage decline reads "Review", not "External
     Review" (on the "Declined" view; the row keeps its "View"). <sup>j</sup>
   - 9c. **Incomplete submission**: a **"Complete submission"** button —
     which takes the editor into the *author's* submission wizard for that
     draft ⚠ [A2](#a2); the row has no "View"
     (*[Submission wizard](U21-submission-wizard.md)* owns what follows).
   - 9d. **Submission stage, no editor assigned** {OJS OMP}: an **"Assign
     Editor"** button opening the "Assign Participant" window (the form
     is owned by *Stage participants* — no spec yet). Once an editor is
     assigned, the cell goes quiet. <sup>j</sup>
   - 9e. **In review** {OJS OMP}: the review-round states, in the round's
     own vocabulary — see Rule 10 for the per-reviewer indicators that
     accompany most of them:
     - no reviewers on the current round yet: an **"Assign Reviewers"**
       button opening the Add Reviewer window
       ([→ finding a reviewer](U27-reviewer-assignment-and-management.md#search));
     - revisions asked of the author: "Revisions requested from author"
       (this round) or "Revisions requested from the author to be taken to
       a new review round" (resubmit) — the "Request Revisions" decision's
       "Require New Review Round" choice picks between the two
       ([→ decisions](U26-review-stage-and-rounds.md#decisions));
     - revisions delivered: "Revisions submitted" — plus "New review round
       to be created" when they answer a resubmit decision;
     - all reviews confirmed: "All reviews are confirmed and a decision is
       needed." — or, where the journal counts a minimum, "Minimum required
       number of reviews have been confirmed. A decision is needed.";
     - otherwise: the per-reviewer indicators alone.
   - 9f. **In review, with recommending editors on board** {OJS OMP}: the
     messaging shifts to the recommendation workflow — whether an editor
     is recommending or deciding is chosen when they are added to the
     submission's participants (a recommend-only option against full
     decision powers). A deciding editor
     reads "Recommending Editors are tasked to advise the next steps for
     this submission", then "An editorial recommendation has been received"
     / "All editorial recommendations have been received, and a decision is
     required." as recommendations land. A recommending editor who has
     recorded theirs reads "Recommendation has been made by you."
     (recording one is owned by the decision features — [→ recommendations](U26-review-stage-and-rounds.md#recommendations)). <sup>j</sup>
   - 9g. **In copyediting** {OJS OMP}: "Copyedited Files Uploaded: {count}".
   - 9h. **Scheduled into an issue** {OJS}: "To be published in issue
     {issue}".
   - 9i. Otherwise the cell is empty — notably a Submission-stage row with
     its editor assigned, and most rows on a preprint server.
<a id="review-indicators"></a>
10. **Per-reviewer activity indicators** {OJS OMP}. Wherever Rule 9e shows
    them, the cell carries one small round indicator per reviewer on the
    current round — declined and cancelled ones included: a countdown ring with the days left (or overdue) for
    requests and ongoing reviews — colored to flag overdue ones — and an
    icon once there is an outcome (submitted, confirmed, declined,
    cancelled). Clicking one opens a popover with the reviewer's name, the
    review type, a status sentence, and up to three buttons: <sup>k</sup>

    | Reviewer status (popover headline) | Buttons offered |
    |------------------------------------|-----------------|
    | "Awaiting Response from the reviewer" (first request or resent) | "Edit Due Date" · "View details" · "Unassign" |
    | "Review Request overdue by {days} days" | "Edit Due Date" · "View details" · "Unassign" |
    | "Ongoing review - request accepted" | "Edit Due Date" · "View details" · "Cancel Reviewer" |
    | "Review overdue by {days} days" — described as a missed *response*, dated with the review deadline ⚠ [A6](#a6) | "Edit Due Date" · "View details" · "Cancel Reviewer" |
    | "Review completed on {date}" | "View unread recommendation" (then "View recommendation" once read) |
    | "Review was confirmed by editor" | "View recommendation" |
    | "Review Request declined on {date}" | "Resend Review Request" · "View details" · "Cancel Reviewer" |
    | "Reviewer cancelled review request" — shown when the *editor* cancelled ⚠ [A4](#a4) | "Resend Review Request" · "View details" |

    On a journal the completed-review popover also names the reviewer's
    recommendation; a press shows the completed sentence without one.
    An assigned Section Editor or assistant gets the same popovers with the
    same working buttons — but declined and cancelled reviewers show no
    indicator at all for them ⚠ [A7](#a7).
    Every button opens the same window it would open from the workflow's
    Reviewers panel, and the list refreshes afterwards — the flows
    themselves are owned by *[Reviewer assignment & management](U27-reviewer-assignment-and-management.md)*
    ([deadlines](U27-reviewer-assignment-and-management.md#due-dates),
    [reading and confirming](U27-reviewer-assignment-and-management.md#read-review),
    [unassign vs cancel](U27-reviewer-assignment-and-management.md#unassign)). <sup>k</sup>
<a id="open-in-place"></a>
11. **"View" opens the workflow in place.** The submission's workflow opens
    as a panel over the list; the address records which submission — and
    which of its panels — is open, so the state can be bookmarked or
    shared, and reloading such an address reopens the panel. Closing it
    returns to the list exactly as it was left, refreshed. What the panel
    contains is *Workflow screen & stage access* (no spec yet) and the
    stage features. <sup>l</sup>
<a id="bulk-delete"></a>
12. **Bulk cleanup of incomplete submissions.** "More Actions" (the "…"
    button above the list) offers **"Delete Incomplete Submissions"** — on
    this dashboard only to Journal Managers and Site Administrators, and
    grayed out while the current page of the list has no incomplete rows.
    Choosing it puts the list in selection mode: a checkbox appears on each
    incomplete row (only those), with **"Delete Incomplete Submissions"**
    and **"Cancel"** buttons above; the delete button stays disabled until
    something is ticked. Pressing it opens the "Confirm Delete of
    Incomplete Submissions" dialog ("Are you sure you want to delete the
    selected items? This action cannot be undone. Please confirm to
    proceed.") with **"Confirm"** and **"Cancel"**. Confirm deletes the
    ticked submissions permanently; Cancel — in the dialog or above the
    list — leaves selection mode with nothing deleted. Changing view,
    search or filters also drops the selection. The same machinery serves
    the author's own list with its own who-may
    ([→ deleting drafts](U22-my-submissions.md)). <sup>m</sup>
13. **Counts stay current.** The sidebar badges and the heading's total
    update in place — no reload — after anything done from this screen that
    changes them (a deletion, an assignment made from a row, a decision
    taken in the workflow panel before closing it). <sup>d</sup>

## Side effects

- The dashboard itself is a read-and-launch surface: listing, searching and
  filtering send nothing and log nothing. <sup>o</sup>
- Deleting incomplete submissions removes them permanently — no email, no
  undo; they vanish from every list including the authors' own.
- Actions launched from rows and popovers (assign editor, assign reviewers,
  edit due date, cancel…) carry the side effects of their owning features
  (*Stage participants*, *[Reviewer assignment & management](U27-reviewer-assignment-and-management.md)*).
- **The monthly outstanding-tasks email** {OJS OMP}. On the first of each
  month, every active Journal Manager and Section Editor with outstanding
  work gets one email, "Outstanding editorial tasks for {journal}", sent
  from the journal's principal contact. It lists up to 20 of their assigned
  submissions that are waiting on them — a new submission awaiting first
  review, review rounds needing reviewers / awaiting reviews / with reviews
  ready or overdue / with revisions submitted, and submissions idle for 30+
  days in copyediting or production — each linking into this dashboard, and
  closes with a link to "your submission dashboard". An in-app notification
  is recorded alongside. Nothing is sent to editors with nothing
  outstanding, to accounts that opted out of this notification ⚠ [A8](#a8)
  (the email carries an unsubscribe link), or to accounts whose role was removed in
  the meantime. Assistants and Site Administrators (as such) never receive
  it. A preprint server sends no such email — the monthly task is not
  scheduled there. <sup>n</sup>

## Settings that modify behavior

- **Reviews required** {OJS OMP}: the journal's required number of reviews
  (configured in review setup — *Review setup & review forms*, no spec
  yet) drives the "Needs reviews" view and the "Minimum required number of
  reviews…" message (Rule 9e).
- **Notification opt-out**: each editor can block the monthly
  outstanding-tasks email in their profile's notification settings — the
  control there is labelled "Weekly email of outstanding tasks", though
  the email is monthly ⚠ [A8](#a8); the email's unsubscribe link does the
  same.
- **Journal setup**: sections, categories and issues existing (or not)
  decides which filter fields appear (Fields table); disabling submissions
  hides the neighboring "Start A New Submission" entry (owned by
  *[Submission wizard](U21-submission-wizard.md)*).

## Cross-feature interactions

- *[My Submissions](U22-my-submissions.md)* — the author's list rides this
  feature's table, search, filters and selection machinery; it owns its own
  views, columns and who-may. Landing precedence and the legacy-address
  forward are specified there ("Landing").
- *Reviewer's review* (no spec yet) — the reviewer's assignment list is the
  page's third face, riding the same machinery with its own views and
  columns.
- *Workflow screen & stage access* (no spec yet) — owns everything behind
  "View"; this spec owns only the open-in-place mechanism (Rule 11).
- *[Submission stage](U25-submission-stage.md)*, *[Review stage & rounds](U26-review-stage-and-rounds.md)*,
  *[Reviewer assignment & management](U27-reviewer-assignment-and-management.md)* —
  the states the Stage and Editorial Activity cells report, and the windows
  the row and popover buttons open.
- *[Submission wizard](U21-submission-wizard.md)* — creates the incomplete
  submissions this dashboard lists and cleans up; "Complete submission"
  re-enters it.
- *Stage participants* (no spec yet) — the "Assign Editor" window.

## Canonical scenarios

Common to all three apps (OMP/OPS vocabulary per the
[application glossary](GLOSSARY.md); scenarios naming review or copyediting
views are {OJS OMP} where badged):

1. **Land and walk the views** — Journal Manager: sign in on the journal's
   login page. You land on the editorial dashboard, "Assigned to me" view,
   under the sidebar's "Editor Dashboard" group, one entry per view with a
   count badge. Walk the entries — each opens the list under its own
   heading with its count ("Published (2)"); a view holding nothing shows
   "No Items". <sup>s1</sup>
2. **Assigned-only scope** — Section Editor assigned to one submission, in
   a journal holding a second, unassigned one: every view shows only the
   assigned submission; the unassigned one appears nowhere — not in
   "Active submissions", not in global search. A Journal Manager checking
   the same views sees both, and their "Assigned to me" view lists only
   their own assignments. <sup>s2</sup>
3. **Search within a view** — Journal Manager with several active
   submissions: on "Active submissions", type part of one title into the
   search box — the list narrows to matching rows, the heading count
   follows, and the phrase shows as a chip. Press the chip's X — the full
   view is back. Switching to another view also drops the phrase.
   <sup>s3</sup>
4. **Global search** — Journal Manager, with one declined submission in
   the journal: type its title into the sidebar's "Search submissions" box
   and submit. The "Search Results" view opens listing it — declined
   submissions included — with the phrase as a chip and no in-page search
   box. Clear the chip: you return to the view you searched from.
   <sup>s4</sup>
5. **Filter the list** — Journal Manager: press "Filters", set "Days since
   last activity" to a value at or below one stale submission's idle time
   (and above the other rows'), press
   "Apply Filters" — the list narrows and a filter chip appears. "Clear
   Filters" restores the view. The "Assigned To Editor" field is in the
   manager's panel; sign in as a Section Editor and open the same panel —
   the field is absent. <sup>s5</sup>
6. **Open a submission in place** — any editorial role with a listed
   submission: press "View". The workflow opens as a panel over the list
   and the address records it; reload the address — the panel reopens.
   Close it — the list is back at the exact address it left. <sup>s6</sup>
7. **Sort and page** — Journal Manager on a view with several rows: click
   the "ID" header — rows reorder and the address records the sort; click
   again to flip it. The "Days" header sorts by idle time the same way. A
   view with more than 30 rows shows pager controls; page 2 shows the rest.
   <sup>s7</sup>
8. **Triage a new submission** {OJS OMP} — Journal Manager, with a fresh
   submission nobody is assigned to: it lists under "Needs editor", its
   activity cell offering "Assign Editor". Press it, assign a Section
   Editor through the window that opens, and confirm — back on the list the
   button is gone, the row drops off "Needs editor", and the counts move.
   <sup>s8</sup>
9. **Review activity at a glance** {OJS OMP} — Journal Manager, one
   submission in review: while the round has no reviewers, the cell offers
   "Assign Reviewers", which opens the Add Reviewer window. With two
   requests out, the cell shows two countdown indicators; click one — the
   popover names the reviewer, the review type and "Awaiting Response from
   the reviewer", with "Edit Due Date", "View details" and "Unassign".
   After one reviewer submits, their indicator turns to a done mark whose
   popover reads "Review completed on {date}" with "View unread
   recommendation". <sup>s9</sup>
10. **The conflict row** — Journal Manager who is also an author: their own
    authored submission's row on the editorial dashboard shows the "You
    cannot access this submission… go to \"My Submissions\"" notice and no
    "View" button, while ordinary rows around it keep theirs. The same
    submission sits normally under their "My Submissions as Author" group.
    <sup>s10</sup>
11. **Declined out of editors' sight** — Journal Manager declines a
    Section Editor's assigned submission: the manager finds it under
    "Declined" ("Declined during the … stage."); the Section Editor's
    sidebar has no "Declined" entry and the submission is gone from all
    their views — only their global search still finds it ⚠ [A1](#a1).
    <sup>s11</sup>
12. **Bulk-delete incomplete submissions** — Journal Manager, journal
    holding two incomplete submissions (one theirs, one another author's)
    and a submitted one: "More Actions" → "Delete Incomplete Submissions"
    puts the list in selection mode — checkboxes on the two incomplete rows
    only. Tick both, press "Delete Incomplete Submissions", press
    "Confirm" in the dialog — both are gone and the counts drop. A Section
    Editor's dashboard shows no "More Actions" button at all. <sup>s12</sup>

App-specific:

13. **Issue filter and scheduled rows** {OJS} — Journal Manager with a
    submission scheduled into an unpublished issue: its activity cell reads
    "To be published in issue {issue}", its Stage cell "Scheduled", and it
    lists under "Scheduled for publication" — no longer under "Active
    submissions"; the Filters panel's "Issues" field narrows any view to
    that issue's submissions. <sup>s13</sup>
14. **One review view, two review stages** {OMP} — Press Manager with one
    monograph in Internal Review and another in External Review: "All in
    review stage" lists both; the internal one's activity cell shows its
    round state just as the external one does. <sup>s14</sup>
15. **The reduced dashboard** {OPS} — Preprint Server Manager: the sidebar
    group offers exactly Assigned to me / Active submissions / All in
    production stage / Scheduled for publication / Published / Declined —
    no review, copyediting or "Needs editor" views. A fresh preprint's
    activity cell is empty; the bulk-cleanup flow of scenario 12 works the
    same. <sup>s15</sup>

## Findings register

Verdicts are the author's judgment (claude, 2026-08-26), unreviewed unless
an entry notes otherwise; the team settles them on spec review. Sorted
🐞 → ❓ → ✅. Each entry opens with the user-observable symptom; mechanism
and evidence live in the entry's footnote.

| ID | Finding (one line, symptom) | Bug? | Impact | Review |
|----|------------------------------|------|--------|--------|
| [A4](#a4) | The popover over an editor-cancelled review request blames the reviewer: "Reviewer cancelled review request" | 🐞 | minor | — |
| [A5](#a5) | Switching a sort off leaves the old sort in the address — display and address disagree until reload | 🐞 | minor | — |
| [A6](#a6) | The overdue-review popover describes the missed review as a "response" and dates it with the review deadline | 🐞 | minor | — |
| [A1](#a1) | Section Editors and assistants have no view listing declined (or published-and-gone) submissions — global search is their only way back | ❓ | user-visible | — |
| [A2](#a2) | Editors are offered "Complete submission" on other people's incomplete submissions, landing them in the author's wizard | ❓ | minor | — |
| [A3](#a3) | The author/reviewer conflict notice always says "as a Journal Manager" — whoever is looking, on presses and preprint servers too | ❓ | minor | — |
| [A7](#a7) | Declined and cancelled reviewers show no activity indicator at all to assigned Section Editors and assistants | ❓ | minor | — |
| [A8](#a8) | The profile's opt-out for the monthly outstanding-tasks email is labelled "Weekly email of outstanding tasks" | ❓ | minor | — |
| [OMP1](#omp1) | A press's filter panel never offers a series filter, however many series exist | ❓ | minor | — |

### All apps

<a id="a1"></a>
**A1 — No path back to finished submissions for assigned editors** · ❓ ·
user-visible.
The "Declined" view exists only for Journal Managers and Site
Administrators. A Section Editor or assistant whose assigned submission is
declined loses it from every view on their dashboard; the same goes for
nothing-left-to-do outcomes their view roster does not cover. Their global
search still finds it (Rule 7), but nothing tells them so.
Question: should assigned editors keep a view (or their "Declined" /
"Published" entries) scoped to their own submissions? Lean: intended
reduction — the roster assigns each view a deliberate role list — but the
silent disappearance is worth a product ruling.
Basis: probe + code. <sup>a1</sup>

<a id="a2"></a>
**A2 — "Complete submission" hands an editor the author's wizard** · ❓ ·
minor.
An incomplete submission's row on the editorial dashboard offers "Complete
submission" — the same button the author gets — and pressing it opens the
author's submission wizard on someone else's draft, where the editor can
edit and even submit it. Expected: a manager-appropriate affordance (or
none).
Question: is editors completing an author's draft intended? Lean: intended
but rough — managers may legitimately finish a stuck draft, and the page
offers no other way in; the row otherwise has no "View" at all.
Basis: probe + code. <sup>a2</sup>

<a id="a3"></a>
**A3 — The conflict notice always says "Journal Manager"** · ❓ · minor.
The notice on a conflict row (Rule 9a) is a fixed sentence: "You cannot
access this submission as a Journal Manager since you are the author…" —
shown unchanged to a Site Administrator, and on presses and preprint
servers where the role is called Press Manager / Preprint Server Manager.
The reviewer variant has the same fixed wording.
Question: should the notice name the viewer's actual role (or drop the role
mention)? Lean: wording oversight — a single shared sentence with no
app-level rewording; harmless but reads wrong outside OJS.
Basis: probe + code. <sup>a3</sup>

<a id="a4"></a>
**A4 — Cancelled-by-editor popover blames the reviewer** · 🐞 · minor.
When an editor cancels a review request ("Cancel Reviewer"), the reviewer's
indicator popover is headlined "Reviewer cancelled review request" — the
reviewer did nothing — and its description repeats the misattribution:
"Reviewer has cancelled the review request on {date}." Expected: wording
that attributes the cancellation to the editorial side, as the Reviewers
panel's own status ("Request Cancelled") does. Rationale for 🐞: the
neighboring declined status has its own, correct headline, so the two
states were meant to read differently.
Basis: probe + code. <sup>a4</sup>

<a id="a5"></a>
**A5 — Un-sorting leaves a stale sort in the address** · 🐞 · minor.
Clicking a sorted column's header a third time switches sorting off — the
rows return to their default order — but the address keeps the sort it
just left. Until the page is reloaded, the address and the displayed
order disagree; reloading or sharing that address re-applies the sort the
person switched off. Expected: the address follows the third state as it
does the first two (Rule 4).
Basis: probe. <sup>a5</sup>

<a id="a6"></a>
**A6 — The overdue-review popover talks about a response** · 🐞 · minor.
Once an accepted review runs overdue, the indicator popover's headline says
"Review overdue by {days} days" but its description reads "This reviewer
has not completed their review. A response was due on {date}." — calling
the missed review a "response", and the date it shows is the review due
date under that wrong name. Expected: the description to speak of the
review and its deadline, as the headline does; the response-overdue state
has this same sentence where it is correct.
Basis: probe. <sup>a6</sup>

<a id="a7"></a>
**A7 — Declined and cancelled reviewers vanish for assistants** · ❓ · minor.
On the same submission at the same moment, a Journal Manager's row shows
an indicator for every reviewer on the round — declined and cancelled ones
included — while an assigned Section Editor or assistant sees indicators
only for the others; nothing marks the omission. The popovers they do get
carry the editor's full working buttons.
Question: is the reduced indicator set for assigned (non-manager) users
intended? Lean: omission — the list assigned users receive simply leaves
declined and cancelled reviewers out, while every other part of the cell
matches the manager's.
Basis: probe. <sup>a7</sup>

<a id="a8"></a>
**A8 — The outstanding-tasks opt-out says "Weekly"** {OJS OMP} · ❓ · minor.
The profile's notification settings name the opt-out for the
outstanding-tasks email "Weekly email of outstanding tasks" — but the
email goes out monthly (Side effects), and nothing else on screen calls it
weekly.
Question: which is wrong — the label or the schedule? Lean: the label —
the task is deliberately registered to run monthly on the 1st, so the
label reads like a leftover from an earlier cadence.
Basis: probe + code. <sup>a8</sup>

### OMP

<a id="omp1"></a>
**OMP1 — No series filter on a press** · ❓ · minor.
A press's Filters panel never offers a series filter, even when the press
has several series — on a journal or preprint server with more than one
section, the same panel lists the Section field. The omission is
dashboard-wide; the author's list records the same fact
([→ My Submissions](U22-my-submissions.md)).
Question: is the missing series filter a product choice? Lean: intended —
a series, unlike a section, is an optional shelf not every submission has;
worth a ruling since the shared machinery supports it.
Basis: probe + code. <sup>omp1</sup>

---

<a id="footnotes"></a>
## Footnotes — mechanism & evidence

<a id="fn-a"></a>
**a — page, ops and role gates.** Page `dashboard`, op `editorial`:
`PKP\pages\dashboard\PKPDashboardHandler` — role assignment
`ROLE_ID_SITE_ADMIN | ROLE_ID_MANAGER | ROLE_ID_SUB_EDITOR |
ROLE_ID_ASSISTANT` → `editorial`; `reviewAssignments` (reviewer) and
`mySubmissions` (author) are the other faces of the same page (their
features' specs). The op sets `DashboardPage::EditorialDashboard` and
`selectedRoleIds` to the four editorial roles; the bare page address (no
op) redirects home. All three app subclasses
(`APP\pages\dashboard\DashboardHandler`) override only `setupIndex()`
(page-init payload: app forms, constants) and `getSubmissionFiltersForm()`
— the op roster, role gates and view logic are uninherited-shared (chain
check 2026-08-26). Client side: `DashboardPage.vue` mounted from
`lib/pkp/templates/dashboard/editors.tpl`; the ui-library pins differ
across the three checkouts by 3 commits touching nothing under
`src/pages/dashboard/` or `src/components/SideNav/` (checked 2026-08-26),
and the pkp-lib pins are identical — positive shared-code evidence for the
client-side claims. Live-probed 2026-08-26 (author leg all three apps,
reviewer leg OJS + OMP): an author-only or reviewer-only account typing
the dashboard address gets the access-denied page — "The current role does
not have access to this operation." — while a Site Administrator holding
no role in the journal gets the full journal-wide dashboard.

<a id="fn-b"></a>
**b — the view roster.** `PKP\submission\Repository::getDashboardViews()`
→ `mapDashboardViews()`; a view's role list gates who gets it
(`filterViewsByUserRoles`). Editorial-relevant role lists:
`TYPE_NEEDS_EDITOR` = admin+manager; `TYPE_DECLINED` = admin+manager
(+author — the author's own list); every other editorial view = all four
roles. Labels: `submission.dashboard.view.*` — verbatim strings in the
Rule 2 table ("Assigned to me", "Active submissions", "Needs editor",
"All in submission stage", "Needs reviews", "Awaiting reviews", "Reviews
submitted", "Reviews overdue", "Author revisions submitted" (editorial
label of `revisionsSubmitted`), "All in review stage" (the `reviewAll`
string — rendered both for OJS's `TYPE_REVIEW_EXTERNAL` view and OMP's
`TYPE_REVIEW_ALL`; the `reviewExternal` key "All in peer review" is no
longer used by the map — live-probed 2026-08-26, OJS entry label read
"All in review stage"), "All in copyediting stage", "All in production
stage", "Scheduled for publication", "Published", "Declined"). Slice definitions: status queued
(active views), `isUnassigned` (needs-editor), stage filters,
`numReviewsConfirmedLimit` vs the context's required reviews
(needs-reviews), `awaitingReviews`, `reviewsSubmitted`, `reviewsOverdue`,
`revisionsSubmitted`, status scheduled / declined; the published view
filters by the workflow's done shelf. OMP override
(`omp/classes/submission/Repository.php::mapDashboardViews()`): drops
`TYPE_REVIEW_EXTERNAL`, appends `TYPE_REVIEW_ALL` spanning
internal+external review — the sidebar nevertheless renders the entry in
stage order, between "Author revisions submitted" and "All in copyediting
stage" (live-probed 2026-08-26 on two presses; the sidebar orders entries
independently of the repository's collection order). OPS override passes
a reduced type list: assigned, active, production, scheduled, published,
declined. Roster, order and labels live-probed 2026-08-26 per app and
role: manager rosters match the Rule 2 table (OPS manager = the six
OPS-column entries); Section Editor / Series Editor / Moderator and
assistant rosters match too (the assistant's = the Section Editor's), with
no "Needs editor" and no "Declined" for any of them. View membership of an
incomplete draft, live-probed 2026-08-26: it lists under exactly "Active
submissions", "Needs editor" and "All in submission stage" (OJS + OMP) —
incomplete drafts count into "Needs editor" — and under "Active
submissions" + "All in production stage" on OPS. The review slices,
live-probed 2026-08-26 (OJS + OMP, identical three-state matrix): "Needs
reviews" keeps a submission while a submitted review awaits confirmation
and drops it only once reviews are confirmed; "Awaiting reviews" lists
only outstanding requests; a required-reviews setting of 0 behaves as a
floor of one.

<a id="fn-c"></a>
**c — scope.** `getDashboardViews()` computes
`canAccessUnassignedSubmission` = user holds admin or manager among the
page's roles; every view collector then either spans the context or is
`assignedTo($userId, $editorialRoleIds)` — an Author/Reviewer stage
assignment never qualifies on this page. The `assigned` API op enforces
the same (`_submissions/assigned`). `TYPE_ASSIGNED` is `assignedTo` even
for managers — hence "Assigned to me" ≠ "Active submissions". The search
view applies the identical split (fn-h). Live-probed 2026-08-26 on all
three apps: an unassigned submission appeared in none of a Section
Editor's (Series Editor's / Moderator's) views and its global search
returned "Search Results (0)", with a same-session positive control on the
assigned one; a Section Editor who authored a submission with no editorial
assignment found it in no editorial view and not via the editorial global
search (OJS leg), while their "My Submissions as Author" group listed it;
a manager's "Assigned to me" stood empty while "Active submissions"
listed the whole journal.

<a id="fn-d"></a>
**d — the sidebar.** `PKPTemplateManager::setupBackendPage()`:
`$menu['dashboards']` (label `navigation.dashboards` = "Editor Dashboard",
one submenu entry per view) built for
admin/manager/sub-editor/assistant role holders; `$menu['reviewAssignments']`
/ `$menu['mySubmissions']` for reviewer/author. Count badges fetched
client-side from `_submissions/viewsCount` (`SideNav.vue`); the badge
color flips to the attention variant for view ids
`reviews-overdue` and `reviewer-action-required`
(`ViewsWithAttentionBadge`). Counts refresh via the app store's
`triggerReloadViewsCount` after each list refetch. Live-probed 2026-08-26:
the "Editor Dashboard" group label and the "Search submissions" box render
verbatim (all three apps); "Reviews overdue" shows the attention color at
a count of zero, and an overdue review lists under the view with "Review
overdue by {n} days" in its activity cell (OJS + OMP). Count refresh
live-probed 2026-08-26: within one session, no reload, the sidebar badges
and the heading total moved after a bulk delete and after an editor
assignment made from a row (OJS; the OMP badge movement rechecked and
confirmed the same day).

<a id="fn-e"></a>
**e — addresses.** URL query params: `currentViewId`, `searchPhrase`,
filter params, `sortColumn`/`sortDirection`, `workflowSubmissionId` (+
`workflowMenuKey`, the open panel's menu position) — `dashboardPageStore.js` treats the URL as
the source of truth (an unknown `currentViewId` falls back to the first
view). Legacy page `submissions`
(`PKP\pages\dashboard\DashboardHandler::index`) redirects through the
role-home logic — live-probed 2026-08-26 on all three apps during the
My Submissions build and re-probed the same day from the editorial side:
signing in as a manager lands on "Assigned to me", and the legacy
`{journal}/submissions` address forwards to `dashboard/editorial`.

<a id="fn-f"></a>
**f — heading, table, columns.** Heading `{currentView.name}
({itemCount})` + spinner (`DashboardPage.vue`). Editorial columns
(`useDashboardConfig.js::getColumns()`, default branch): `id` ("ID",
sortable), `title` ("Submissions"), `stage` ("Stage", label via
`getExtendedStageLabel` with a stage-colored dot rendered beside the
plain-text label — a small `rounded-full` span with a per-stage
background class, live-inspected 2026-08-26: the label sits in no bubble,
and the OPS incomplete row carries the same dot, labelled "Production"), `lastActivity` ("Days", sortable —
`DashboardCellSubmissionDays.vue`, days between `dateLastActivity` and
today), `activity` ("Editorial Activity"), `actions` ("Actions"). Page
size 30 (`PKPDashboardHandler::$perPage`); empty text "No Items"
(`grid.noItems`), "Loading" while fetching. Live-probed 2026-08-26: the
six header labels render identically on all three apps with sort controls
on ID and Days only; the heading carried its count ("Active submissions
(31)"); an empty view kept the full header row over the one "No Items"
row; a 31-row view showed "Previous / 1 / 2 / Next" pager buttons while a
1-row view showed none. The Stage cell of an incomplete submission read
"Incomplete" (OJS + OMP, live-probed 2026-08-26); OPS has no "Incomplete"
label — an incomplete preprint's read "Production". Sort-cycle and paging address behavior: fn-a5 and
the Rule 4 exceptions (paging XHR carries `offset`/`page` params; the URL
never does).

<a id="fn-g"></a>
**g — in-page search.** `DashboardControlSearch.vue`, label
`editor.submission.search` = "Search submissions, ID, authors, keywords,
etc."; sets the `searchPhrase` URL param and resets to page 1; the phrase
rides `submissionsQuery` alongside the view's own criteria — it narrows,
never widens. Chips row `DashboardActiveFilters.vue`: search chip with X
(`common.clearSearch`), per-filter chips (`common.filterRemove`), "Clear
Filters" (`common.filtersClear`) when filters are active. View switch
clears phrase and filters (store watcher). Live-probed 2026-08-26 (OJS):
the placeholder renders verbatim; the phrase matched a title, a numeric
submission ID and an author's family name; the chip read "Search:
{phrase}" and its X restored the full view with the heading count
following each way.

<a id="fn-h"></a>
**h — global search and the Search Results view.**
Sidebar item `itemType: 'search'`, label `editor.submission.searchGlobal`
= "Search submissions", prepended to the dashboards group only
(`PKPTemplateManager`); submit sets `searchPhrase` + `currentViewId=search`
(`SideNav.vue::onSearchSubmit`; empty submit clears). The view:
`Repository::getSearchView()` — "Search Results"
(`search.searchResults`), no status/stage filter, manager/admin span the
context, sub-editor/assistant get `assignedTo` with editorial roles;
appended to the page's view list only for the editorial page
(`PKPDashboardHandler::getViews()`), never as a counted menu entry. Store:
`SEARCH_VIEW_ID` — entering saves `_preSearchViewId`; the in-page search
control is filtered out on this view; when phrase and filters are all
empty the store returns to the saved view (or the first). Live-probed
2026-08-26: a manager's search surfaced a declined and a published
submission side by side under "Search Results (2)" (OJS); the in-page
search box was absent on the view and clearing the phrase returned to the
non-default view the search started from (all three apps); clearing the
phrase while a filter chip stayed active kept the "Search Results" view
(OJS).

<a id="fn-i"></a>
**i — filters.** `PKPSubmissionFilters` (shared):
`addSectionFields()` (skipped when the context has exactly one section;
label `section.section`), `addAssignedTo()` (gated `isManagerOrAdmin()`,
label `editor.submissions.assignedTo` = "Assigned To Editor"; suggest list
from the users API restricted to manager+sub-editor role ids),
`addCategories()` (when any exist), `addDaysSinceLastActivity()`
(`FieldSlider` 0–180, label `submission.list.daysSinceLastActivity`);
the slider's direction live-probed 2026-08-26 (OJS): a value N keeps only
rows with idle days at or above N — a value of 5 against an all-Days-0
list emptied it.
OJS subclass adds `addIssues()` (when any issue exists; label
`issue.issues`); OMP subclass rebuilds the form *without* section fields
(OMP1); OPS subclass = shared set. The same form serves every dashboard
page — the role, not the page, decides the "Assigned To Editor" field
(probed 2026-08-26 on the author's list: a Manager+Author account gets it
there too — recorded in *My Submissions*). Modal
`DashboardModalFilters.vue`: title `common.filter` = "Filters", buttons
"Clear Filters" / "Apply Filters" (`dashboard.applyFilters`); apply emits
the form state into the URL params and closes. Live-probed 2026-08-26 on
the editorial dashboard: the seeded two-section journal's manager panel
listed Section / Assigned To Editor / Issues / Categories / Days since
last activity, labels verbatim; a one-section, no-issues, no-categories
scratch journal reduced to Assigned To Editor + Days since last activity;
a Section Editor's panel had no "Assigned To Editor" (OJS). The suggest
list showed no options until a name was typed, then exactly the journal's
Journal Managers and Section Editors — a Site Administrator appears in it
only through the Journal Manager group it also holds; an assistant and a
reviewer name returned nothing. OPS renders the field's label as
"Assigned to Moderator" (both a two-section scratch server and the seeded
server); a two-series press's panel offered no series or section field
(OMP1, editorial-dashboard leg).

<a id="fn-j"></a>
**j — the activity cell.**
`useDashboardConfigEditorialActivity.js::getEditorialActivityForEditorialDashboard()`,
branches in Rule 9's order: author-conflict alert
`dashboard.noAccessBeingAuthor` (assigned as author AND not assigned via
manager/sub-editor/assistant), reviewer-conflict
`dashboard.noAccessBeingReviewer`; declined status →
`dashboard.declinedDuringStage`; `submissionProgress` → "Complete
submission" (`submission.list.completeSubmission`) → redirect to the
wizard (`submission?id={id}`); Submission stage without `editorAssigned` →
"Assign Editor" (`submission.list.assignEditor`) →
participant-assign side modal; review stages → round-status branches
(strings quoted verbatim in Rule 9e; `REVIEW_ROUND_STATUS_*`), with
`dashboard.assignReviewers` = "Assign Reviewers" on
`PENDING_REVIEWERS`; the deciding-editor collapse to recommendation
messaging applies only when `isCurrentUserDecidingEditor` — true only
when the user is a deciding editor AND recommending editors are assigned
(`submission/maps/Schema.php::getPropertyStages()`); recommend-only
branches per `currentUserCanRecommendOnly` / `currentUserRecommendation`;
`WORKFLOW_STAGE_ID_EDITING` → `dashboard.copyEditedFilesUploaded`;
Production + scheduled + issue label → `dashboard.toBePublishedInIssue`
(the issue condition makes 9h OJS-only in practice); else empty. The
conflict branches suppress "View" and the cell's action buttons alike
(`DashboardCellSubmissionActions.vue::showButton` — editorial page only).
Live-probed 2026-08-26, branch by branch: conflict rows rendered both
fixed sentences verbatim, press included, with no buttons on the row
(OJS + OMP, author and reviewer variants; the Site-Administrator-as-author
wording leg rests on the shared string — fn-a3); "Complete submission"
entered the author's wizard (fn-a2); "Assign Editor" opened the "Assign
Participant" window, and after assigning, the cell went quiet, the row
left "Needs editor" and its count dropped (OJS + OMP), while a fresh
preprint's cell stayed empty with no button (OPS control); declined rows
read "Declined during the Review stage." / "Declined during the
Production stage." (OPS) and kept "View"; the 9e revision and
confirmation strings rendered verbatim — a resubmit row stacks "Revisions
submitted" and "New review round to be created" as two lines in one
cell — and the minimum-required sentence replaced the all-confirmed one
once a required-reviews minimum was set (OJS + OMP; the
confirmed-vs-minimum arc OJS); the recommending-editor arc rendered its
five strings byte-identically on journal and press — the closing "All
editorial recommendations have been received…" sentence also shows to an
unassigned journal-wide Journal Manager, not only a deciding editor;
copyediting rows counted uploads (OJS + OMP); a scheduled OJS row read
"To be published in issue {issue}" with a "Scheduled" stage label and no
longer listed under "Active submissions"; production and published rows
on OMP and OPS kept an empty cell (no scheduled state is reachable
through a press's publish screens).

<a id="fn-k"></a>
**k — review activity indicators.**
`DashboardCellSubmissionActivityReviews.vue` (one item per assignment in
`getCurrentReviewAssignments` — active assignments of the current round)
→ `ReviewActivityIndicator` + `ReviewActivityIndicatorPopover.vue`;
config per reviewer status in
`useDashboardConfigReviewActivity.js::ConfigPerStatus` — indicator
variant (progress ring with day count vs icon; attention color for the
two overdue statuses, negative for declined/cancelled, success for
received/viewed/complete/thanked), popover title/description keys
(`dashboard.reviewAssignment.status*`), and the three button slots
mapped to Reviewer-manager actions (resend request, edit due date, review
details, cancel, unassign; "View recommendation" / "View unread
recommendation" open review details). Titles quoted verbatim in the
Rule 10 table; "Unassign" is the popover's label
(`dashboard.reviewAssignment.action.unassignReviewer`) for the same act
the Reviewers panel calls "Unassign Reviewer". The recommendation line in
the completed popover renders only when the journal supplies
recommendation options (OJS; OMP/OPS get the without-recommendation
description). Store handlers (`reviewerAddReviewer`,
`reviewerResendRequest`, `reviewerEditReview`, `reviewerReviewDetails`,
`reviewerCancelReviewer`, `reviewerUnassignReviewer`, `fileUpload`,
`participantAssign`) each refetch the list on close. Indicator looks and
popover texts live-probed 2026-08-26 (OJS + OMP, nine reviewer states per
app): headlines, descriptions, ring/icon variants and colors rendered per
the Rule 10 table, identical across the two apps except the completed
popover's recommendation line — the journal names the recommendation, the
press shows the completed sentence without one; the unread button flipped
to "View recommendation" once the recommendation had been viewed. Popover
buttons live-probed 2026-08-26 (OJS + OMP, every button pressed on each
app): each opened the same side window the workflow's Reviewers panel
opens — "Edit Review", "Review Details: {title}", "Unassign Reviewer",
"Cancel Reviewer", "Resend Review Request" — and the list refetched after
the window closed, including a close without saving.

<a id="fn-l"></a>
**l — open in place.** `dashboardPageStore.js::openWorkflowModal()`: side
modal hosting the workflow page; sets `workflowSubmissionId` (+ menu-key
param) in the URL; `onClose` clears them and refetches; a URL carrying
`workflowSubmissionId` auto-opens on load. Live-probed 2026-08-26 on all
three apps from the editorial dashboard (and the same day from the
author's list — same store path): "View" opened the panel in place, the
address gained `workflowSubmissionId` + `workflowMenuKey`, reloading that
address reopened the panel, and closing restored the bare list address.

<a id="fn-m"></a>
**m — bulk delete.** `useDashboardBulkDelete.js`:
`bulkDeleteIsAvailableForUser` = editorial page AND (site admin or
manager); `canBeDeleted` per row = `submissionProgress` AND (admin /
manager, or assigned author — the author leg serves My Submissions).
Entry `DashboardControlBulkActions.vue` ("More Actions" ellipsis; item
disabled while no listed row is deletable), selection-mode buttons
`DashboardControlBulkDeleteButton.vue`, confirm dialog strings
`dashboard.submissions.incomplete.bulkDelete.*` (quoted verbatim in
Rule 12), request = bulk delete on the backend-submissions API
(`_submissions?ids[]`), then refetch; any query change resets the
selection (store watcher). Server side
(`PKPBackendSubmissionsController::bulkDeleteIncompleteSubmissions`):
role gate admin/manager/author, refuses non-incomplete ids, and re-checks
each submission via `Repository::canCurrentUserDelete()` — whose
manager/admin branch is role-only (no stage-assignment condition), so a
preprint-server manager is expected to succeed where the OPS author
cannot (the author-side 🐞 recorded in
*[My Submissions](U22-my-submissions.md)*). Live-probed 2026-08-26: the
full flow ran on OJS — dialog strings verbatim, checkboxes on incomplete
rows only, the delete button disabled until a tick, dialog-Cancel exiting
selection mode entirely, and changing view/search/filters dropping the
selection; the Confirm leg deleted on OMP and on OPS (the preprint-server
manager's delete succeeded, as the role-only branch predicts); a Section
Editor's and an assistant's dashboards rendered no "More Actions" button
at all (OJS + OMP, with the button row's neighboring controls as positive
controls). The single-row delete endpoint on the
same API is not offered by this page's screens.

<a id="fn-n"></a>
**n — the outstanding-tasks email.** Scheduled task
`PKP\task\EditorialReminders` — registered `monthlyOn(1)` in the OJS and
OMP schedulers (`APP\scheduler\Scheduler`); the OPS scheduler does not
register it (absence = install fact). The task queues one
`PKP\jobs\email\EditorialReminder` job per active manager/sub-editor per
enabled context. The job re-checks role and opt-out
(`NOTIFICATION_TYPE_EDITORIAL_REMINDER` blocked list), collects the
editor's assigned queued submissions, and builds up to 20 outstanding
lines: Submission stage → "waiting initial review"; review-stage round
statuses pending reviewers / pending reviews / reviews ready / reviews
completed / reviews overdue / revisions submitted; copyediting or
production idle > 30 days. Mailable `PKP\mail\mailables\EditorialReminder`
(template key `EDITORIAL_REMINDER`): subject "Outstanding editorial tasks
for {$contextName}", body listing the tasks with links to
`dashboard/editorial`, from the context's principal contact, with an
unsubscribe link (`allowUnsubscribe`) and a paired in-app notification.
Sent only when at least one line exists. Not screen-reachable to trigger;
claims here rest on this code path (no probe item — see the probe-list
note).

<a id="fn-o"></a>
**o — the read-and-launch claim.** The send-nothing leg live-probed
2026-08-26 (OJS): the Mailpit total stood at 500 before, during and after
a full session of listing, searching and filtering — nothing sent. The
log-nothing leg has not been checked on a log surface; it rests on the
code path — the listing ops are read-only queries on the backend
submissions API (fn-a, fn-m) with no logging step. One before/after look
at a listed submission's activity log (or the journal's event log) around
a listing/search/filter pass would settle it; lean: holds.

<a id="fn-s1"></a>
**s1 — scenario 1 seeding.** A roster Journal Manager; the seeded journal's
stock of submissions provides populated and empty views. Landing on
`dashboard/editorial` "Assigned to me" assumes the manager account is the
journal-login account with editorial precedence (landing rule in
*[My Submissions](U22-my-submissions.md)*, "Landing").

<a id="fn-s2"></a>
**s2 — scenario 2 seeding.** A scratch journal with two submissions: one
with the Section Editor assigned (any stage), one untouched. The negative
claim ("appears nowhere") is checked across every sidebar view plus a
global search for the unassigned title.

<a id="fn-s3"></a>
**s3 — scenario 3 seeding.** Three or more active scratch submissions with
distinct titles, so narrowing is observable against the heading count.

<a id="fn-s4"></a>
**s4 — scenario 4 seeding.** One scratch submission declined from the
Submission stage (so its activity cell stays quiet), plus active ones as
noise. The return-view check: start the search from a non-default view.

<a id="fn-s5"></a>
**s5 — scenario 5 seeding.** One scratch submission left idle (its last
activity older than the slider value used) among freshly touched ones.
The Section Editor negative leg reuses s2's account.

<a id="fn-s6"></a>
**s6 — scenario 6 seeding.** Any listed submission; assert the address
gains the open-panel parameter, survives reload, and is restored exactly
on close.

<a id="fn-s7"></a>
**s7 — scenario 7 seeding.** For the paging leg, 31+ submissions (builder
loop); the sort legs need only a handful with distinct IDs and idle times.
The paging leg may be dropped by the test authors if seeding cost is
prohibitive — sorting is the load-bearing claim. The Days-*ordering* leg
has its own seeding constraint (checked 2026-08-26): the scenario
endpoints cannot backdate last activity, so on a same-day database every
row ties at 0 days and reordering by idle time is not observable — the
test may limit the Days assertion to the address recording the sort and
the list refetching, as the paging leg may be dropped.

<a id="fn-s8"></a>
**s8 — scenario 8 seeding.** {OJS OMP} One scratch submission submitted
with no participants beyond the author. On OMP the submission stage
precedes internal review as on OJS.

<a id="fn-s9"></a>
**s9 — scenario 9 seeding.** {OJS OMP} One scratch submission moved to
review; the no-reviewers leg first, then two reviewer requests (builder),
then one completed review (scenario endpoints;
[reviewer flows](U27-reviewer-assignment-and-management.md)). Seed *both*
requests as invited, not accepted (observed 2026-08-26): the "Awaiting
Response from the reviewer" popover belongs to an open request — an
already-accepted one shows the "Ongoing review - request accepted"
popover instead.

<a id="fn-s10"></a>
**s10 — scenario 10 seeding.** A scratch Manager+Author combo account with
one authored submission in the journal, plus an unrelated submission as
the positive "View" control.

<a id="fn-s11"></a>
**s11 — scenario 11 seeding.** s2's assigned submission declined by the
manager (from its current stage). The Section Editor checks: no "Declined"
sidebar entry, submission absent from all views, found via global search.

<a id="fn-s12"></a>
**s12 — scenario 12 seeding.** Two scratch incomplete submissions by
different authors plus one submitted control. The Section Editor negative
leg asserts the "More Actions" button itself is absent — count 0, not a
menu missing one entry (positive control: the same account sees the
button row's other controls).

<a id="fn-s13"></a>
**s13 — scenario 13 seeding.** {OJS} A scratch submission scheduled into a
created-but-unpublished issue (schedule path per the production/issue
features). Creating the scratch issue: with the default show
volume/number/year/title checkboxes on, all four identification fields
are required (probed 2026-08-26). Seeding caveat (probed 2026-08-26, deterministic): in the
"Schedule For Publication" window, choosing "Assign To Future Issue and
Schedule Only" as the very first issue-assignment pick produces the
publish-immediately confirmation instead of the schedule one — a defect
of the publication-scheduling screens (production-stage territory, no
spec yet). To seed the scheduled state, pick "Assign To Future Issue and
Publish Immediately" first, then switch to "…Schedule Only": the
confirmation then reads "This will be published when {issue} is
published…" and the row schedules correctly.

<a id="fn-s14"></a>
**s14 — scenario 14 seeding.** {OMP} Two scratch monographs: one sent to
Internal Review, one to External Review (skip-internal decision).

<a id="fn-s15"></a>
**s15 — scenario 15 seeding.** {OPS} Roster Preprint Server Manager; two
scratch incomplete preprints for the cleanup leg (succeeds —
fn-m; contrast with the author-side refusal recorded in
*[My Submissions](U22-my-submissions.md)*).

<a id="fn-a1"></a>
**a1 — A1 evidence.** `TYPE_DECLINED`'s role list is
admin+manager+author; no editorial view type includes declined status for
sub-editor/assistant, and the published view's role list does include
them — the gap is specific to declined. The search view has no status
filter and is available to all four editorial roles (fn-h), which is what
keeps the submission reachable. Live-probed 2026-08-26 on all three apps:
no Section Editor / Series Editor / Moderator or assistant sidebar
offered a "Declined" (or "Needs editor") entry, while a manager's global
search surfaced declined and published rows side by side (fn-h). The last
leg — a Section Editor's own global search returning *their* declined
submission — was observed live 2026-08-26 in the scenario-11 walk (OJS):
the search returned "Search Results (1)" listing the declined submission
with its "Declined" stage label and its "View" button.

<a id="fn-a2"></a>
**a2 — A2 evidence.** The `submissionProgress` branch of the editorial
activity composable is identical to the author's ("Complete submission" →
wizard redirect), with no role condition beyond seeing the row; managers
see every incomplete submission journal-wide (fn-c). Live-probed
2026-08-26 (OJS + OMP): a Journal Manager pressing "Complete submission"
on another author's draft landed in that draft's submission wizard and
advanced past its first step on both apps; the final submit was not
driven — the through-to-submission leg rests on the shared code path.

<a id="fn-a3"></a>
**a3 — A3 evidence.** `dashboard.noAccessBeingAuthor` /
`dashboard.noAccessBeingReviewer` are single shared strings naming
"Journal Manager"; no OMP/OPS locale override exists (checked
`{omp,ops}/locale/en`, 2026-08-26). Rendering contexts are limited to
journal-wide accounts (fn-c), so the misnaming shows to Site
Administrators and to OMP/OPS managers. Live-probed 2026-08-26 (OJS +
OMP, author and reviewer variants): both sentences rendered verbatim —
"as a Journal Manager" on the press too — with no trailing period and no
buttons on the row. The Site-Administrator-as-author rendering rests on
the shared string alone: an admin-authored submission was not
constructible without mutating the shared seeded account.

<a id="fn-a4"></a>
**a4 — A4 evidence.** `ConfigPerStatus` keys the cancelled status
(set by the editor's Cancel Reviewer — the code comment itself says
"editor cancelled review request") to title
`dashboard.reviewAssignment.statusCancelled.title` = "Reviewer cancelled
review request". The declined status has its own distinct title.
Live-probed 2026-08-26 (OJS + OMP): after the editor's "Cancel Reviewer" —
the reviewer took no action at any point — the popover read "Reviewer
cancelled review request" / "Reviewer has cancelled the review request on
{date}." on both apps, with "Resend Review Request" and "View details" as
the buttons.

<a id="fn-a5"></a>
**a5 — A5 evidence.** Live-probed 2026-08-26 (OJS, manager, 31-row view;
reproduced twice in separate runs): the third click on a sorted header
fires the list request with no ordering parameter and the rows revert,
while the address keeps `sortColumn`/`sortDirection` unchanged; reloading
that address re-applied the sort. The list client is shared across the
apps (pin evidence in fn-a), so the behavior is not marked per-app.

<a id="fn-a6"></a>
**a6 — A6 evidence.** Live-probed 2026-08-26 (OJS + OMP, same string on
both): with a response due date of 2026-08-18 and a review due date of
2026-08-20 on the assignment, the overdue popover read "Review overdue by
6 days" / "This reviewer has not completed their review. A response was
due on 2026-08-20." — the review due date under the response label. The
request-overdue state's description ("This reviewer has not responded to
the review request. A response was due on {date}") is correct in its own
context; the review-overdue state reuses the response sentence where a
review sentence is needed (popover description keys per status in
`ConfigPerStatus` — fn-k).

<a id="fn-a7"></a>
**a7 — A7 evidence.** Live-probed 2026-08-26 (OJS + OMP, manager vs
assigned Funding Coordinator within the same minute, eight-reviewer
round): the manager's row carried 8 indicators, the assistant's 6 — none
for the declined or the cancelled reviewer. The browser's own traffic
shows why: the manager's list rides the journal-wide submissions op
(`_submissions`), whose item carries all 8 review assignments; the
assigned-user op (`_submissions/assigned`) returns the same item with the
declined and cancelled assignments omitted server-side. The assistant's
popovers offered exactly the editor's button sets, and "Edit Due Date"
opened the full "Edit Review" window live (open only; no assistant-side
save probed).

<a id="fn-a8"></a>
**a8 — A8 evidence.** Live-probed 2026-08-26 (OJS seeded, an editor's
Profile > Notifications, read-only): the "Editors" group lists "Weekly
email of outstanding tasks" with the "Enable these types of
notifications." / "Do not send me an email for these types of
notifications." checkboxes — the opt-out surface behind fn-n's blocked
list. The schedule is `monthlyOn(1)` (fn-n). The {OJS OMP} scope follows
the email's own; the label was observed on OJS — the OMP leg rests on the
shared notification machinery, not separately probed.

<a id="fn-omp1"></a>
**omp1 — OMP1 evidence.** OMP's
`APP\components\forms\dashboard\SubmissionFilters` rebuilds the form
without `addSectionFields()` — dashboard-wide, every page. Live-probed
2026-08-26 (author's-list build): a two-series press offered only
Categories and "Days since last activity"; two-section journal and
preprint-server controls both listed the Section field the same day.
Re-probed the same day on the editorial dashboard: the seeded two-series
press's manager panel offered Assigned To Editor, Categories and "Days
since last activity" — no series or section field.


## Reference — entry points & surfaces

| Entry | Path | Atom |
|-------|------|------|
| Editorial dashboard | `{journal}/dashboard/editorial` (sidebar "Editor Dashboard") | ROUTE-008 (base); ROUTE-035 (OJS), ROUTE-057 (OMP), ROUTE-074 (OPS) |
| Dashboard page component | in-page (Vue page + Smarty host) | VUE-003, AFFW-067, AFFW-061 |
| Heading, control bars | in-page | AFFW-001..007 |
| In-page search | in-page | AFFW-008; chips AFFW-009..013 |
| Views sidebar + badges | backend sidebar | AFFW-062, AFFW-064, AFFW-066; heading/menu state AFFW-059 |
| Global search box | backend sidebar | AFFW-063; search view enter/leave AFFW-060 |
| Filters panel | side modal | VUE-075, AFFW-051..054 |
| Table, sorting, paging | in-page | AFFW-022, AFFW-024..025, AFFW-058 |
| Editorial columns & cells | in-page | AFFW-028, AFFW-030..034 |
| Activity cell & actions | in-page | AFFW-035..039, AFFW-041, AFFW-047, AFFW-056 |
| Reviewer indicators & popover | in-page | AFFW-042..046 |
| Bulk cleanup | "More Actions" above the list | AFFW-014..021, AFFW-023, AFFW-026 |
| Workflow panel opener | row "View" | AFFW-055 |
| Legacy submissions address | `{journal}/submissions` → forwards home | ROUTE-007 |
| Backend submission lists API | `api/v1/_submissions` (GET /, assigned, reviews, viewsCount; DELETE bulk) | API-006 |
| Outstanding-tasks reminder | email, monthly {OJS OMP} | MAIL-025, JOB-011, JOB-046 |

## Reference — code anchors

- `lib/pkp/pages/dashboard/PKPDashboardHandler.php` — op roster, role
  gates, `getViews()`; app subclasses
  (`{ojs,omp,ops}/pages/dashboard/DashboardHandler.php`) override
  `setupIndex()` / `getSubmissionFiltersForm()` only.
- `lib/pkp/pages/dashboard/DashboardHandler.php` — legacy `submissions`
  page forward.
- `lib/pkp/classes/submission/Repository.php` —
  `getDashboardViews()` / `mapDashboardViews()` / `getSearchView()` /
  `canCurrentUserDelete()`; app overrides in
  `{omp,ops}/classes/submission/Repository.php`.
- `lib/pkp/classes/submission/DashboardView.php` — view types.
- `lib/pkp/classes/template/PKPTemplateManager.php::setupBackendPage()` —
  sidebar menu groups + global-search item.
- `lib/pkp/api/v1/_submissions/PKPBackendSubmissionsController.php` — the
  lists' API (per-op role gates; bulk delete); app subclasses add
  OJS payment / OMP catalog endpoints only.
- `lib/ui-library/src/pages/dashboard/` — `DashboardPage.vue`,
  `dashboardPageStore.js`, `composables/useDashboardConfig.js`,
  `composables/useDashboardConfigEditorialActivity.js`,
  `composables/useDashboardConfigReviewActivity.js`,
  `composables/useDashboardBulkDelete.js`, `components/**`,
  `modals/DashboardModalFilters.vue`;
  `src/components/SideNav/SideNav.vue`.
- `lib/pkp/classes/components/forms/dashboard/PKPSubmissionFilters.php`
  (+ per-app `classes/components/forms/dashboard/SubmissionFilters.php`).
- `lib/pkp/classes/task/EditorialReminders.php`,
  `lib/pkp/jobs/email/EditorialReminder.php`,
  `lib/pkp/classes/mail/mailables/EditorialReminder.php`;
  `{ojs,omp}/classes/scheduler/Scheduler.php` (`monthlyOn(1)`).
