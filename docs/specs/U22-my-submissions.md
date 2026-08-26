---
name: my-submissions
scope: An author tracks their own submissions, acts on requests (complete a draft, submit revisions), cleans up incomplete ones, and opens each submission's workflow
apps: [ojs, omp, ops]
shared: pkp-lib
status: draft
atlas-claims: [AFFW-027, AFFW-040, AFFW-048, AFFW-049]
---

# My Submissions (author dashboard)

> Conventions (markers, badges, footnotes): [Reading a spec](GLOSSARY.md#reading-a-spec).

## Purpose

My Submissions is the author's home in the editorial backend: one list, per
journal, of every submission the signed-in account is an author on — drafts
still being written, submissions under editorial consideration, and finished
ones (published or declined). From here the author sees where each
submission stands, answers what the journal asks of them (finish an
incomplete draft, submit requested revisions), deletes drafts they have
abandoned, and opens any submitted submission's workflow to follow it in
detail. The list is the author's entry route into the workflow; everything
behind the "View" action — the workflow screen itself, its stages and panels —
belongs to *Workflow screen & stage access* and the stage features. The
editorial team's own submission lists are a separate feature (*Submissions
dashboard*), and a reviewer's assignment list is a third; this spec covers
only the author-facing list.

## Actors & permissions

**The author** below means a signed-in account holding the journal's Author
role. The list is personal and per-journal: it shows only submissions in
this journal on which this account is assigned as an author (a **draft** —
an *incomplete submission* — counts from the moment it is started; see
*[Submission wizard](U21-submission-wizard.md)*). Holding other roles
alongside Author changes nothing here — a Journal Manager who also authors
sees their authored submissions on this list like any author — except the
Filters panel, which follows the account's roles (Rule 5). What a row
*offers* depends on the submission's state (Rules 6–8), not on the author's
other roles.

| Action | Who may — and when |
|--------|--------------------|
| **Open My Submissions** | • the author — from the sidebar menu group or by its direct address<br>• any signed-in user *without* the Author role typing the address — the access-denied page <sup>a</sup> |
| **See a submission listed** | • the author — their own submissions only, in every state (draft, under consideration, scheduled, published, declined) <sup>b</sup> |
| **Open a submission's workflow ("View")** | • the author — any of their submitted submissions; a draft has no "View" until submitted (Rule 6) <sup>e</sup> |
| **Re-enter a draft ("Complete submission")** | • the author — their own drafts (Rule 6) <sup>f</sup> |
| **Submit revisions from the list** | • the author — while the submission's current review round awaits their revisions (Rule 7) {OJS OMP} <sup>g</sup> |
| **Delete incomplete submissions** | • the author — their own drafts only; a submitted submission is never deletable here (Rule 9); on a preprint server deletion is offered but confirming always fails ⚠ [OPS2](#ops2) <sup>i</sup> |

## Fields & validation

N/A — the list collects no data. Its search box and Filters panel are the
submission lists' shared machinery, owned by *Submissions dashboard*; the
revision upload it can open is owned by *[Review stage & rounds](U26-review-stage-and-rounds.md#revisions)*.

## Rules & state

1. **Where it lives.** The backend sidebar shows a **"My Submissions as
   Author"** menu group to every holder of the Author role. Its entries are
   the list's *views* — named slices of the author's submissions — each with
   a live count badge; choosing one opens the list filtered to that view.
   The page heading names the current view with its total, e.g. "Active
   submissions (2)". Next to the group, "Start A New Submission" opens the
   submission wizard (owned by *[Submission wizard](U21-submission-wizard.md#ways-in)*).
   <sup>a</sup>
2. **The views.** Which views exist depends on the app — a preprint server,
   with no review stage, has fewer: <sup>b</sup>

   | View | OJS | OMP | OPS |
   |------|:---:|:---:|:---:|
   | Active submissions | ✓ | ✓ | ✓ |
   | Revisions requested | ✓ | ✓ | — |
   | Revisions submitted | ✓ | ✓ | — |
   | Incomplete submissions | ✓ | ✓ | — ⚠ [OPS1](#ops1) |
   | Scheduled for publication | ✓ | ✓ | ✓ |
   | Published | ✓ | ✓ | ✓ |
   | Declined | ✓ | ✓ | ✓ |

   "Active submissions" is every submission still awaiting an outcome —
   drafts included; the other views slice by what happened (revisions asked
   for / delivered, not yet finished, scheduled into an issue {OJS},
   published, declined). One submission can appear in several views. On a
   press or preprint server, no route was found that places anything under
   "Scheduled for publication" — the view was only ever seen empty
   ⚠ [A3](#a3).
3. **Landing.** An account whose only role in the journal is Author lands on
   My Submissions after signing in on the journal's own login page (on a
   multi-journal site, the site-wide login page leads to the site index
   instead); the editorial roles (Journal Manager, Section Editor, Assistant,
   Site Administrator) and the Reviewer role take precedence — an account
   holding one of those lands on that role's list instead (the editorial
   dashboard, or the reviewer's assignment list; an account holding both an
   editorial role and Reviewer lands on the editorial dashboard), with the
   author group still one click away in the sidebar. The retired submission-list address
   from older versions forwards the same way. An old bookmarked
   author-dashboard link for a specific submission lands on My Submissions
   with that submission's workflow panel already open — for the submission's
   own author; any other signed-in user following the same link gets an
   access-denied page instead. The same forward works for a link to a
   still-incomplete draft, opening a workflow panel the list itself never
   offers for a draft ⚠ [A5](#a5). <sup>c</sup>
4. **The row.** Columns are **ID** (sortable), **Submissions** (the
   authors-and-title line), **Stage** (the submission's current stage — or
   its outcome, e.g. "Declined" — in a colored bubble; a draft's bubble
   reads "Incomplete", except on a preprint server where it reads
   "Production" [OPS1](#ops1)), **Editorial Activity** (Rules 6–8), and
   **Actions**. Sorting, paging and the empty view ("No Items") are the
   shared table machinery of *Submissions dashboard*; this list uses them
   unchanged. <sup>d</sup>
5. **Search and filters.** The search box above the list finds the author's
   own submissions within the current view — the heading keeps the view's
   name and count. The "Filters" button opens the journal's filter panel,
   which offers up to: section {OJS OPS} (only when the journal has more
   than one — a press offers no series filter here, however many series it
   has ⚠ [OMP1](#omp1)), categories (only when any exist), issue {OJS}
   (only when any exist), and days since last activity (always). The
   editors' "Assigned To Editor" filter follows the account's roles, not
   the page: an author-only account never sees it, but a Journal Manager or
   Site Administrator who also authors finds it on their own list too
   ⚠ [A4](#a4). Both controls are the shared machinery of *Submissions
   dashboard*. <sup>j</sup>
6. **Drafts vs submitted.** A submitted submission's Actions cell offers
   **"View"**, which opens the workflow (Rule 8). A draft's Actions cell is
   empty — no "View", no button at all; its Editorial Activity cell instead
   carries **"Complete submission"**, which reopens the submission wizard at
   the step the author last saved with "Save for Later" — a step merely
   continued past is not remembered (*[Submission wizard](U21-submission-wizard.md)*).
   <sup>e</sup> <sup>f</sup>
7. **The Editorial Activity cell** tells the author what is happening — and
   what is asked of them — without opening the workflow: <sup>f</sup>
   - 7a. **Revision requested** {OJS OMP}: while the current review round
     awaits the author's revisions (whether for this round or for a new
     one), the cell shows "Revision requested" with a **"Submit revisions"**
     button. Pressing it opens the upload dialog directly — three steps,
     "Upload File", "Review Details", "Confirm", with no title of its own —
     and the file lands in that round's revisions, exactly as if uploaded on
     the workflow's review stage ([→ Revisions Uploaded](U26-review-stage-and-rounds.md#revisions)).
     Once delivered, the submission lists under "Revisions submitted"; its
     activity cell then shows the review progress counter (7b), not a
     "revisions submitted" message. <sup>g</sup>
   - 7b. **Under review, nothing asked** {OJS OMP}: the cell shows a review
     progress counter — "Review update {completed}/{total}" over the current
     round's reviewers — and, when completed reviews of the *open* kind
     exist, a "Reviewers assigned:" row of those reviewers' avatars whose
     popover names the reviewer and the review type. Reviews that are not
     open never show a reviewer here — the author learns identities only
     where the review type discloses them ([→ reading reviews as the author](U26-review-stage-and-rounds.md#author-read-review)).
     ⚠ [A1](#a1) <sup>h</sup>
   - 7c. **Copyediting** {OJS OMP}: "Copyedited Files Uploaded: {count}".
   - 7d. **Scheduled into an issue** {OJS}: "To be published in issue
     {issue}".
   - 7e. Otherwise the cell is empty — notably while a new submission awaits
     the editorial team's first move. One exception: a submission declined
     during review keeps showing the review counter in its row ⚠ [A2](#a2).
8. **"View" opens the workflow in place.** The workflow opens as a panel
   over the list; the page address records which submission — and which of
   its panels — is open, so the open state can be bookmarked or shared.
   Closing the panel returns to the list at the exact address it left. What
   the panel contains — the author's view of the shared workflow screen — is
   *Workflow screen & stage access* and the stage features
   ([submission stage](U25-submission-stage.md#author-view),
   [review stage](U26-review-stage-and-rounds.md#author-view)). <sup>e</sup>
9. **Deleting drafts.** "More Actions" (the "…" button above the list) offers
   **"Delete Incomplete Submissions"** — grayed out while the current page
   of the list has no draft rows. Choosing it puts the list in selection
   mode: a checkbox appears on each draft row (only drafts — submitted rows
   get none), with **"Delete Incomplete Submissions"** and **"Cancel"**
   buttons above; the delete button stays disabled until something is
   selected. Pressing it opens the "Confirm Delete of Incomplete
   Submissions" dialog ("Are you sure you want to delete the selected items?
   This action cannot be undone…") with **"Confirm"** and **"Cancel"**
   buttons. Confirm deletes the selected drafts permanently; Cancel — in the
   dialog or above the list — leaves selection mode entirely, ticks dropped,
   nothing deleted. Changing view, search or filters also drops any
   selection. On a preprint server the same flow is offered end to end, but
   confirming always fails with an error dialog and the draft survives
   ⚠ [OPS2](#ops2). The selection machinery is shared with the editorial
   list (*Submissions dashboard*); what this list contributes is who gets
   it: every author, over their own drafts. <sup>i</sup>
10. **Counts stay current.** The sidebar view badges and the heading's total
    update in place — no reload — after anything done from this screen that
    changes them, e.g. deleting drafts or submitting revisions.

## Side effects

- Deleting incomplete submissions removes them permanently — no email, no
  undo; they vanish from every view, and a bookmarked link back into a
  deleted draft's wizard no longer opens it.
- "Submit revisions" has the same side effects as uploading revisions on the
  review stage — owned by *[Review stage & rounds](U26-review-stage-and-rounds.md#revisions)*.
- The list itself sends nothing and logs nothing; it is a read-and-launch
  surface.

## Settings that modify behavior

None found on the list itself. The neighboring "Start A New Submission"
menu entry and the journal's intake gates belong to *[Submission wizard](U21-submission-wizard.md)*
("Settings that modify behavior" there).

## Cross-feature interactions

- *[Submission wizard](U21-submission-wizard.md)* — creates the drafts and
  submissions this list shows; "Complete submission" and draft deletion act
  on its drafts; "Start A New Submission" sits beside this list's menu
  group.
- *Submissions dashboard* (the editorial lists — no spec yet) — owns the
  shared list machinery this feature rides: the table (sorting, paging,
  empty state), search, the Filters panel, and the incomplete-submissions
  selection mode. This spec owns only their author-facing configuration.
- *Workflow screen & stage access* (no spec yet) — owns everything behind
  "View"; this spec owns only the entry route.
- *[Submission stage](U25-submission-stage.md#author-view)* and
  *[Review stage & rounds](U26-review-stage-and-rounds.md#author-view)* —
  the stage states this list's Stage and Editorial Activity cells report;
  review anonymity rules that gate Rule 7b.

## Canonical scenarios

Common to all three apps (OMP/OPS vocabulary per the
[application glossary](GLOSSARY.md)):

1. **Track and open a submission** — Author: on the journal's login page,
   sign in as an account whose only role is Author, with one submitted
   submission. You land on My
   Submissions, "Active submissions" view; the row shows the submission's
   ID, authors and title, and its current stage in a bubble. Press "View" —
   the submission's workflow opens as a panel over the list. Close it — the
   list is back. <sup>s1</sup>
2. **Resume and clean up drafts** — Author with two drafts — one saved
   partway with "Save for Later" — and one submitted submission: on the
   "Incomplete submissions" view (on a preprint server
   the drafts sit under "Active submissions" instead [OPS1](#ops1)), each
   draft row shows the "Incomplete" stage bubble ("Production" on a preprint
   server — the same [OPS1](#ops1) divergence), offers "Complete submission"
   and no "View". Press
   "Complete submission" on the saved draft — the submission wizard reopens
   at the step it was saved; return to the list. Switch to "Active
   submissions", where draft and submitted rows sit together, and open
   "More Actions" → "Delete Incomplete Submissions"; tick the other draft's
   checkbox — the submitted row gets none. Press "Delete Incomplete
   Submissions" and press "Confirm" in the dialog — the draft is gone and
   the sidebar counts drop. On a preprint server the confirm step fails
   instead: an error dialog reports the deletion is not permitted and the
   draft stays [OPS2](#ops2). <sup>s2</sup>
3. **Browse the views and search** — Author with two published submissions
   and a declined one: walk the sidebar's view entries — each opens the list
   under that view's heading with its count, the published submissions under
   "Published", the declined one under "Declined" with its "Declined"
   stage bubble; a view holding nothing shows "No Items". On the "Published"
   view, type one published submission's title into the search box — the
   list narrows to that submission alone and the heading count follows
   ("Published (1)"). <sup>s3</sup>

App-specific:

4. **Act on a revision request** {OJS OMP} — Author whose submission's
   review round (on a press, either of its review stages) has revisions
   requested and one assigned reviewer who has not yet completed a review:
   the row's activity cell reads
   "Revision requested" with "Submit revisions"; the submission also lists
   under "Revisions requested". Press "Submit revisions" and upload a file
   through the three-step dialog ("Upload File" → "Review Details" →
   "Confirm") — back on the list the submission now sits under "Revisions
   submitted", the sidebar badges have moved with it, and its activity cell
   shows the review progress counter ("Review update 0/1"). On a preprint
   server there is no review, so this scenario has no analogue. <sup>s4</sup>

## Findings register

Verdicts are the author's judgment (claude, 2026-08-26), unreviewed unless
an entry notes otherwise; the team settles them on spec review. Sorted
🐞 → ❓ → ✅. Each entry opens with the user-observable symptom; mechanism
and evidence live in the entry's footnote.

| ID | Finding (one line, symptom) | Bug? | Impact | Review |
|----|------------------------------|------|--------|--------|
| [OPS2](#ops2) | A preprint server author is offered draft deletion, but confirming always fails with a permission error | 🐞 | user-visible | — |
| [A1](#a1) | The author sees the review progress count ("Review update 1/2") for their submission under review | ❓ | user-visible | — |
| [A2](#a2) | A declined submission's row keeps showing the review progress counter | ❓ | minor | — |
| [A3](#a3) | On a press or preprint server, nothing was found that feeds the "Scheduled for publication" view | ❓ | minor | — |
| [OPS1](#ops1) | A preprint server author gets no "Incomplete submissions" view; drafts hide inside "Active submissions" labeled "Production" | ❓ | minor | — |
| [A4](#a4) | A Journal Manager who also authors gets the editors' "Assigned To Editor" filter on their personal list | ❓ | minor | — |
| [A5](#a5) | An old author-dashboard link to a still-incomplete draft opens the draft's workflow panel — a surface the list never offers for a draft | ❓ | minor | — |
| [OMP1](#omp1) | A press author cannot filter the list by series, even when the press has several | ❓ | minor | — |

### All apps

<a id="a1"></a>
**A1 — Review progress disclosed to the author** · ❓ · user-visible.
While their submission is under review with nothing asked of them, the
author's row shows "Review update {completed}/{total}" — telling the author
how many reviewers the round has and how many have finished. Reviewer
*identities* stay protected (only open-type completed reviews show an
avatar, Rule 7b), but the count itself is information journals have
traditionally kept from authors.
Question: is the completed/total review counter meant to be author-visible?
Lean: intended — the counter was built specifically for this list's author
view and leaks no identity; but a product ruling is worth having.
Basis: probe + judgment. <sup>a1</sup>

<a id="a2"></a>
**A2 — A declined submission's row still shows the review counter** · ❓ ·
minor.
A submission declined during review keeps "Review update
{completed}/{total}" in its Editorial Activity cell on the Declined view —
the row reads as if review were still running on a submission whose outcome
is settled.
Question: should a declined submission's activity cell be cleared instead?
Lean: oversight — the editorial list's equivalent cell has a declined state
and this one does not.
Basis: probe. <sup>a2</sup>

<a id="a3"></a>
**A3 — "Scheduled for publication" has no feeder on OMP/OPS** · ❓ · minor.
The view exists for authors on all three apps, but on OMP and OPS the
publish flows offer no date control, so nothing could be scheduled (rather
than published outright) through the screens — the author's "Scheduled for
publication" view was only ever seen empty. On OJS it fills normally via
issue scheduling (Rule 7d).
Question: is any screen route meant to produce a scheduled (future-dated)
publication on these two apps, or is the view vestigial there?
Lean: vestigial — the view rides in from shared machinery whose feeder
these apps do not expose.
Basis: probe. <sup>a3</sup>

<a id="a4"></a>
**A4 — Editors' filter on the manager-author's own list** · ❓ · minor.
An account holding Journal Manager (or Site Administrator) alongside Author
opens the Filters panel on their own My Submissions and finds the editors'
"Assigned To Editor" filter there; an author-only account never does.
Question: should the personal list suppress the editors' filter regardless
of the account's other roles? Lean: intended and harmless — the filter
follows the account's roles through shared machinery and discloses nothing
a manager cannot already see on the editorial list.
Basis: probe. <sup>a4</sup>

<a id="a5"></a>
**A5 — An old link to a draft opens the draft's workflow panel** · ❓ ·
minor.
Following an old author-dashboard link that points at a still-incomplete
draft lands its author on My Submissions with the draft's workflow panel
open — a surface the list never offers for a draft (a draft row has no
"View", Rule 6). Any other signed-in account gets the access-denied page
first.
Question: should the forward refuse — or hand off to the wizard — for a
submission that was never submitted? Lean: oversight, harmless — reachable
by the draft's own author only.
Basis: probe. <sup>a5</sup>

### OMP

<a id="omp1"></a>
**OMP1 — No series filter on a press** · ❓ · minor.
A press author's Filters panel never offers a series filter, even when the
press has several series — only the other filters appear. On a journal or
preprint server with more than one section, the same panel lists the
Section filter (Rule 5).
Question: is the missing series filter a product choice? Lean: intended —
the press omits the field across its whole dashboard, and a series, unlike
a section, is an optional shelf not every submission has; worth a ruling
since the shared machinery supports it.
Basis: probe. <sup>omp1</sup>

### OPS

<a id="ops1"></a>
**OPS1 — No "Incomplete submissions" view on a preprint server** · ❓ ·
minor.
An OPS author's sidebar offers Active / Scheduled / Published / Declined
only; their unfinished drafts appear solely inside "Active submissions",
where a draft's Stage bubble reads "Production" rather than "Incomplete" —
nothing marks a row as a draft except its "Complete submission" button.
Question: is the missing view (and the unlabeled draft state) a deliberate
simplification or an oversight?
Lean: oversight — the reduction does not follow from any absent OPS concept
(drafts exist there), and the draft-cleanup tool that pairs with the view
was kept (itself broken — [OPS2](#ops2)).
Basis: probe. <sup>ops1</sup>

<a id="ops2"></a>
**OPS2 — Draft deletion offered but always refused** · 🐞 · user-visible.
The OPS author gets the whole cleanup flow — an enabled "Delete Incomplete
Submissions" menu item, draft checkboxes, the confirm dialog — but pressing
"Confirm" always ends in an error dialog ("You do not have permission to
delete this submission.") and the draft stays. Expected: their own drafts
delete, as they do on a journal. Rationale for 🐞: the permission check
demands a stage assignment no preprint ever has — a gap opened by OPS's
reduced stage set, not a choice, or the offer would have been removed too.
Basis: probe. <sup>ops2</sup>

---

<a id="footnotes"></a>
## Footnotes — mechanism & evidence

<a id="fn-a"></a>
**a — page, menu and access.** Page `dashboard`, op `mySubmissions`:
`PKP\pages\dashboard\PKPDashboardHandler` (role assignment
`ROLE_ID_AUTHOR` → `mySubmissions`; other roles get `editorial` /
`reviewAssignments`). The sidebar group is built in
`PKPTemplateManager::setupBackendPage()` (`$menu['mySubmissions']`, label
`navigation.mySubmissions`) for users holding `ROLE_ID_AUTHOR` in the
context, one submenu entry per view with count badges fetched from the
`_submissions/viewsCount` API (`SideNav.vue`). "Start A New Submission" =
`$menu['submit']`, `dashboard.startNewSubmission`. App subclasses
(`APP\pages\dashboard\DashboardHandler`) override only
`setupIndex()`/`getSubmissionFiltersForm()` — the op roster and role gates
are uninherited-shared. Live-probed 2026-08-26 on all three apps: group
label verbatim "My Submissions as Author"; heading "Active submissions
(N)"; a signed-in reviewer-only or manager-only account typing the address
gets the access-denied page, verbatim "The current role does not have
access to this operation." (the reviewer control is inapplicable on OPS —
the app has no reviewer role). A signed-out visitor typing the list's
address is sent to the login page with the list carried as the return
destination (probed 2026-08-26, OJS; the return trip after logging in was
not probed).

<a id="fn-b"></a>
**b — the view roster.** `PKP\submission\Repository::mapDashboardViews()`;
author-visible views are those whose role list includes `ROLE_ID_AUTHOR`:
`TYPE_ACTIVE`, `TYPE_REVISIONS_REQUESTED` (author-only),
`TYPE_REVISIONS_SUBMITTED` (author label `submission.list.revisionsSubmitted`),
`TYPE_INCOMPLETE_SUBMISSIONS` (author-only), `TYPE_SCHEDULED`,
`TYPE_PUBLISHED`, `TYPE_DECLINED`. The OMP override removes only the
editorial-only external-review view and adds an editorial-only review-all
view — the author roster is identical to OJS; the OPS override reduces the
type list, hence no author Incomplete or Revisions views (OPS1).
Live-probed 2026-08-26: OJS and OMP sidebars carry the seven views in the
Rule 2 order verbatim; OPS carries exactly four (Active submissions /
Scheduled for publication / Published / Declined). Drafts listed under both
"Active submissions" and "Incomplete submissions" on OJS/OMP (submitted
rows absent from the latter); on OPS under "Active submissions" only. The
editorial dashboard's search *view* is editorial-only (`getViews()` adds
`VIEW_SEARCH` only for `DashboardPage::EditorialDashboard`); the author
keeps the in-page search box. "Assigned as an author" is wider than the
submitter: a co-author account holding an author assignment on the
submission — not the account that started it — sees it on their own list
with "View" (probed 2026-08-26, OJS).

<a id="fn-c"></a>
**c — landing and forwards.** `PKPPageRouter::getHomeUrl()`: manager /
sub-editor / assistant / admin → `dashboard/editorial`; else reviewer →
`dashboard/reviewAssignments`; else author → `dashboard/mySubmissions`.
Landing precedence live-probed 2026-08-26 with scratch combo accounts on
every constructible app (OPS has no reviewer role): Author+Reviewer lands
on the reviewer list, Author+Section Editor on the editorial dashboard,
with the "My Submissions as Author" group still in the sidebar. The
editorial-beats-Reviewer leg probed 2026-08-26 (OJS and OMP, scratch
Section Editor+Reviewer account, no Author role): both apps landed on
`dashboard/editorial` ("Assigned to me" view), the "My Assignments as
Reviewer" group still in the sidebar — matching the `getHomeUrl()` order
above. Legacy
`submissions` page (`PKP\pages\dashboard\DashboardHandler::index`)
redirects through the same home logic — probed on all three apps. Old
author-dashboard links: `PKPAuthorDashboardHandler::submission()` redirects
to `dashboard/mySubmissions?workflowSubmissionId={id}`; the OMP subclass
overrides `submission()` but ends in the same parent redirect; OJS/OPS
subclasses add nothing (chain check clean). Probed 2026-08-26 on all three
apps: the submission's own author lands with the workflow panel already
open; a different signed-in author following the same link gets the
authorization-denied page, verbatim "You don't currently have access to
that stage of the workflow." The store auto-opens the panel for a
`workflowSubmissionId` URL param (`dashboardPageStore.js`). Further combos
probed 2026-08-26 (OJS, scratch journal): Manager+Author and
Author+Copyeditor (an Assistant role) both land on the editorial
dashboard, the author group still in the sidebar. The landing claim is
journal-login behavior: on a multi-journal install the SITE login page
landed the same author-only account on the site index, while the journal's
own login page landed on My Submissions (probed 2026-08-26, OJS). The
forward-and-auto-open chain applies to drafts too — fn-a5.

<a id="fn-d"></a>
**d — columns.** `useDashboardConfig.js` `getColumns()` `MY_SUBMISSIONS`
branch: `id` (sortable, "ID"), `title` ("Submissions"), `stage` ("Stage",
`DashboardCellSubmissionStage` — stage bubble via `getExtendedStageLabel`),
`activity` ("Editorial Activity"), `actions` ("Actions"). No "Days" column
(editorial-only). Live-probed 2026-08-26: header order verbatim ID ·
Submissions · Stage · Editorial Activity · Actions on all three apps (OMP
included — no longer only the ui-library-pin inference); a
draft's Stage bubble reads "Incomplete" on OJS/OMP but "Production" on OPS
(every preprint, drafts included, sits at the Production stage —
fn-ops1); an empty view renders one full-width "No Items" row. ID sorting
probed live 2026-08-26 (OJS): each header click toggles the direction, the
address gains `sortColumn=id&sortDirection=…`, the rows reorder, and a URL
carrying the sort parameters is honored on load. Table
mechanics: `DashboardTable.vue`, owned by *Submissions dashboard*. The
ui-library is pinned to the SAME commit (`1a89a4f2`) in all three app
checkouts — positive shared-code evidence for every client-side claim; the
pkp-lib pins differ only by a campaign harness-cleanup commit touching no
product code (checked 2026-08-26).

<a id="fn-e"></a>
**e — the View action and workflow panel.**
`DashboardCellSubmissionActions.vue`: the "View" (`common.view`) button is
hidden while `submissionProgress` is set (a draft); the
editorial-dashboard-only author/reviewer suppression branch does not apply
on My Submissions. Press → `dashboardPageStore.openWorkflowModal()`: side
modal `WorkflowPage`; `onClose` refetches the list. Live-probed 2026-08-26
on all three apps: the panel opens as a dialog over the list (no
navigation); the address gains `workflowSubmissionId` and a
`workflowMenuKey` menu-position parameter; Close removes both, restoring
the exact pre-View address. A draft row's Actions cell holds no button at
all (probed 2026-08-26 on all three apps — the OMP draft rows and its
submitted row's "View" verified live). The OPS panel opens on the preprint's publication
tabs with no stage menu — the workflow feature's territory.

<a id="fn-f"></a>
**f — the activity cell.**
`useDashboardConfigEditorialActivity.js::getEditorialActivityForMySubmissions()`:
`submissionProgress` → "Complete submission"
(`submission.list.completeSubmission`) → redirect `submission?id={id}`
(the wizard; landing on the wizard's file step live-probed 2026-08-26 on
OJS and OPS). Resume position probed 2026-08-26 (OJS): a draft walked
forward with "Continue" alone re-entered at its earlier saved step; after
"Save for Later" on the Details step, re-entry landed on Details — the
wizard resumes at the last SAVED step (mechanism owned by
*[Submission wizard](U21-submission-wizard.md)*). Review stage (internal or external): round status
revisions-requested or resubmit-for-review → Rule 7a; otherwise Rule 7b.
`WORKFLOW_STAGE_ID_EDITING` → `dashboard.copyEditedFilesUploaded` — probed
2026-08-26, verbatim "Copyedited Files Uploaded: 0" (OJS and OMP); after
an editor uploaded one file into the workflow's Copyedited files list, the
same cell read verbatim "Copyedited Files Uploaded: 1" (OJS, 2026-08-26) —
the count counts that list.
Production + `STATUS_SCHEDULED` + an issue label →
`dashboard.toBePublishedInIssue` — probed, verbatim "To be published in
issue Vol. 2 No. 1 (2015)"; the issue condition makes 7d OJS-only in
practice. Everything else → empty — probed: a queued Submission-stage OJS
row and fresh OPS preprints (at Production) both show an empty cell. No
declined branch exists here (unlike the editorial cell): a submission
declined during review still shows the Rule 7b counter (A2, fn-a2).

<a id="fn-g"></a>
**g — Submit revisions.** Same composable, revisions branch: alert
`dashboard.revisionRequested` ("Revision requested"), action
`dashboard.submitRevisions` ("Submit revisions") → file-manager upload
(`FileManagerActions.FILE_UPLOAD`) into
`SUBMISSION_FILE_REVIEW_REVISION` (or `_INTERNAL_REVIEW_REVISION` on OMP's
internal stage) for the current round. Live-probed 2026-08-26 on OJS
(revisions-requested AND resubmit round states) and OMP (internal
revisions-requested; external both states): identical cell in every case;
the dialog is the three-step upload wizard ("1. Upload File · 2. Review
Details · 3. Confirm") whose header shows only a back chevron — the
configured title string (`editor.submissionReview.uploadFile`) never
renders. After Complete, the file appeared in that round's "Revisions
Uploaded" grid on the editor's workflow panel (an internal-round upload
landed in the internal round); the row's cell flipped to "Review update
0/1" and the sidebar badges moved without a reload (Rule 10). OMP offers
no internal-stage resubmit decision, so that combination cannot arise.

<a id="fn-h"></a>
**h — review progress cells.**
`DashboardCellSubmissionActivityReviewsUpdate.vue`:
`dashboard.reviewUpdateCounts` = "Review update
{$reviewsCompletedCount}/{$reviewsTotalCount}", completed = completed
statuses, total = active (declined/cancelled excluded).
`DashboardCellSubmissionActivityReviewsOpen.vue`: renders only completed
assignments whose `reviewMethod` is `SUBMISSION_REVIEW_METHOD_OPEN`,
avatar popover = reviewer full name + review method. Live-probed
2026-08-26 (OJS and OMP): verbatim "Review update 2/2" / "1/1" / "0/2";
with one open-completed and one anonymous-completed review in the same
round, exactly one avatar renders; an anonymous-only round shows no
"Reviewers assigned:" row at all; the avatar's click-popover carries the
reviewer's full name and review type ("Open"), nothing else. The author's
own list data carries blanked reviewer identity fields (empty name and
initials) for anonymous assignments — identity is withheld at the source,
not merely hidden by the cell.

<a id="fn-i"></a>
**i — draft deletion.** `useDashboardBulkDelete.js`: availability =
unconditional for `MY_SUBMISSIONS` (`bulkDeleteIsAvailableForUser`);
per-row deletability (`canBeDeleted`) = `submissionProgress` AND (site
admin / manager OR assigned author) — on this list, every draft row.
Entry: `DashboardControlBulkActions.vue` ("More Actions" ellipsis, item
`dashboard.submissions.incomplete.bulkDelete.button` = "Delete Incomplete
Submissions"); selection-mode buttons `DashboardControlBulkDeleteButton.vue`;
DELETE to the `_submissions` API; selection reset on any query change
(view/search/filter watcher). Live-probed 2026-08-26 on OJS: the menu item
is disabled on a page with no draft rows and again once the last draft is
gone; checkboxes appear only on draft rows; the confirm dialog's buttons
are verbatim "Confirm" / "Cancel"; dialog Cancel exits selection mode with
ticks dropped; confirming deleted both drafts, with list, heading and
badges updating without a reload. Further probes 2026-08-26: the per-page
qualifier held against pagination (OJS — with every draft on page 2 of the
view, the menu item is disabled on page 1 and enabled on page 2); after
ticking, changing view, submitting a search, or applying a filter each
exits selection mode live, ticks lost and nothing deleted (OJS); and the
flow ran end-to-end on OMP — dialog verbatim "Confirm Delete of Incomplete
Submissions" / "Are you sure you want to delete the selected items? This
action cannot be undone. Please confirm to proceed." / "Confirm" ·
"Cancel"; confirming deleted both drafts, the heading and sidebar badges
moving without a reload, checkboxes appearing only on draft rows on its
Active view. The identical OPS surface refuses the
confirmation — fn-ops2.

<a id="fn-j"></a>
**j — search and filters.** `useDashboardConfig.js` `getLeftControls` /
`getRightControls` are view-agnostic: "Filters" button + search box on
every dashboard page including My Submissions. Filter fields
(`APP\components\forms\dashboard\SubmissionFilters`) are data-driven: the
section list is skipped for a single-section journal, categories and
issues {OJS} when none exist; days-since-activity always renders.
Live-probed 2026-08-26: on the seeded journal the author's panel offered
Section, Issues, Categories and "Days since last activity"; on a
one-section journal with no categories or issues, only the activity
slider. "Assigned To Editor" (manager/admin-only) appeared for an editor
on the editorial dashboard (positive control) and never for an author-only
account — but it follows roles, not the page: a Manager+Author account's
own My Submissions panel offers it (fn-a4). The press's missing series
filter: fn-omp1.
Search: typing part of a title narrowed the current view, heading and
count following ("Active submissions (1)"); clearing restored the rows.
Mechanics owned by *Submissions dashboard*.

<a id="fn-s1"></a>
**s1 — scenario 1 seeding.** One roster author account holding only the
Author role, with one submitted (not incomplete) scratch submission in the
seeded journal. Any stage works; the Submission stage keeps the activity
cell empty (Rule 7e), which is expected.

<a id="fn-s2"></a>
**s2 — scenario 2 seeding.** Same author with two scratch drafts (wizard
started, never submitted) and one submitted submission as the
no-checkbox control. The deletion leg runs on "Active submissions"
because the "Incomplete submissions" view never lists a submitted row —
the no-checkbox control is unobservable there; checkboxes-only-on-drafts
verified on the Active view of all three apps (2026-08-26). For a
deterministic resume step, save the first draft with "Save for Later"
before leaving the wizard (Rule 6). OPS: the drafts sit under "Active submissions" with
"Production" bubbles (probed 2026-08-26), and the deletion leg ends at the
OPS2 error dialog — the suite must not assert successful deletion there
(and must not pin the refusal as contract; it is a 🐞).

<a id="fn-s3"></a>
**s3 — scenario 3 seeding.** Same author with two published and one
declined scratch submissions (publish and decline via the stage features'
builders); two published rows make the search step's narrowing observable
("Published (2)" → "Published (1)"). The empty-view check uses whichever view holds nothing after
seeding (e.g. "Scheduled for publication"). Decline the submission from
the Submission stage, not mid-review, so its activity cell stays clear of
A2's counter — probed 2026-08-26 (OJS): declined at the Submission stage,
the row lists under "Declined" with stage bubble "Declined" and an empty
activity cell (confirming A2 is specific to declines during review).

<a id="fn-s4"></a>
**s4 — scenario 4 seeding.** {OJS OMP} A scratch submission in review
round 1 with the Request Revisions decision recorded (revisions not yet
uploaded) and one assigned reviewer; the author account as in s1. Expected
cell after the upload: "Review update 0/1".

<a id="fn-a1"></a>
**a1 — A1 evidence.** `dashboard.reviewUpdateCounts` and the
`DashboardCellSubmissionActivityReviewsUpdate` component are wired only
into `getEditorialActivityForMySubmissions` (this list's author cell) and
the review-stage author surfaces — purpose-built, not leakage from the
editorial cell; hence the "intended" lean. Live-probed 2026-08-26: the
counter renders for the author on OJS and OMP, including "0/2" with
nothing yet completed.

<a id="fn-a2"></a>
**a2 — A2 evidence.** `getEditorialActivityForMySubmissions()` has no
declined branch (the editorial-dashboard cell composable does). Live-probed
2026-08-26 on OJS: a submission declined during review round 1 (two
reviewers assigned, none completed) shows, on the "Declined" view, stage
bubble "Declined" with activity cell "Review update 0/2". Cell logic
shared by OJS and OMP (same pinned ui-library, fn-d).

<a id="fn-a3"></a>
**a3 — A3 evidence.** Probed 2026-08-26 through the screens: OMP's
"Schedule For Publication" flow (Publication tab → "Publish" confirm) and
OPS's "Post the preprint" flow offer no date control anywhere;
`APP\publication\Repository::setStatusOnPublish` on both apps sets
`STATUS_SCHEDULED` only for a future `datePublished`, so confirming
publishes immediately. No other feeder was found; the OPS/OMP author
"Scheduled for publication" views stayed at "(0)" throughout. OJS control:
publishing into an unpublished issue produced a scheduled row ("To be
published in issue…", fn-f).

<a id="fn-a4"></a>
**a4 — A4 evidence.** `PKPSubmissionFilters::addAssignedTo()` is gated by
`isManagerOrAdmin()` — a role check with no page condition and no app
override, so the field rides into the filter form of any dashboard page,
the personal author list included, for manager/admin accounts. Live-probed
2026-08-26 (OJS, scratch journal): a Manager+Author account's My
Submissions Filters panel offered "Assigned To Editor" alongside "Days
since last activity"; author-only accounts never got the field (fn-j's
positive and negative controls). Shared pkp-lib path — the same result is
expected on OMP and OPS, not separately probed.

<a id="fn-a5"></a>
**a5 — A5 evidence.** The forward and the panel auto-open are fn-c's
shared chain; nothing in it checks `submissionProgress`. Live-probed
2026-08-26 (OJS): the draft's own author following the old
author-dashboard address for their draft landed on the list with the
draft's workflow panel open (full stage menu and publication tabs); a
different signed-in author got the authorization-denied page. Not probed
on OMP/OPS.

<a id="fn-omp1"></a>
**omp1 — OMP1 evidence.** OMP's filter form
(`APP\components\forms\dashboard\SubmissionFilters`) never calls
`addSectionFields()` — the omission is dashboard-wide, not specific to the
author list. Live-probed 2026-08-26: on a press with two series the
author's panel offered only Categories and "Days since last activity";
positive controls the same day — a two-section journal and a two-section
preprint server both listed the Section field.

<a id="fn-ops1"></a>
**ops1 — OPS1 evidence.** OPS `APP\submission\Repository::mapDashboardViews()`
passes a reduced type list (Assigned, Active, Production, Scheduled,
Published, Declined) to the shared mapper; `TYPE_INCOMPLETE_SUBMISSIONS`
and both revisions types are simply absent from it. The revisions views
follow from OPS having no review stage; the incomplete view does not
follow from anything absent. Live-probed 2026-08-26: the author sidebar
carries exactly four entries; a draft appears only under "Active
submissions", Stage bubble "Production" (every OPS submission, drafts
included, is created at the Production stage), activity cell "Complete
submission", Actions empty.

<a id="fn-ops2"></a>
**ops2 — OPS2 evidence.** The delete gate
(`Repository::canCurrentUserDelete()`) requires, for an author, an author
stage assignment on the entry (Submission) stage; every OPS submission
lives on the Production stage, so the author branch can never match. The
UI-side availability check (`useDashboardBulkDelete.js::canBeDeleted`) has
no stage condition — hence the offer-then-refusal mismatch. Live-probed
2026-08-26: confirming fires the browser's own delete request, refused
with a permission error ("You do not have permission to delete this
submission."); the screen shows an error dialog, verbatim "Error / You do
not have permission to delete this submission. / OK", and the draft is
still listed after a reload. Reproduced with a draft created live through
the OPS wizard (not a seeding artifact); the identical flow on OJS deleted
its drafts (positive control).

## Reference — entry points & surfaces

| Entry | Path | Atom |
|-------|------|------|
| My Submissions page | `{journal}/dashboard/mySubmissions` (sidebar "My Submissions as Author") | rider on ROUTE-008 (owned by *Submissions dashboard*) |
| My Submissions columns | in-page | AFFW-027 |
| Submit revisions action | row activity cell | AFFW-040 |
| Open reviewers avatars | row activity cell | AFFW-048 |
| Review progress counter | row activity cell | AFFW-049 |
| Draft selection & deletion | "More Actions" above the list | riders on AFFW-020, 021, 023, 026 (owned by *Submissions dashboard*) |
| Legacy submissions address | `{journal}/submissions` → forwards home | rider on ROUTE-007 (owned by *Submissions dashboard*) |
| Old author-dashboard link | `{journal}/authorDashboard/submission/{id}` → forwards here with the workflow panel open | ROUTE-005 (owned by *Workflow screen & stage access*) |

## Reference — code anchors

- `lib/pkp/pages/dashboard/PKPDashboardHandler.php` — op roster, role
  gates, page state (`DashboardPage::MySubmissions`); app subclasses
  override `setupIndex()` / `getSubmissionFiltersForm()` only.
- `lib/pkp/classes/submission/Repository.php::mapDashboardViews()` — view
  roster + per-app overrides (`omp-main/classes/submission/Repository.php`,
  `ops-main/classes/submission/Repository.php`);
  `::canCurrentUserDelete()` — the draft-deletion gate (OPS2).
- `lib/ui-library/src/pages/dashboard/` — `dashboardPageStore.js`,
  `composables/useDashboardConfig.js`,
  `composables/useDashboardConfigEditorialActivity.js`,
  `composables/useDashboardBulkDelete.js`,
  `components/DashboardTable/*` (same ui-library commit in all three
  apps).
- `lib/pkp/classes/core/PKPPageRouter.php::getHomeUrl()` — landing rule.
- `lib/pkp/pages/authorDashboard/PKPAuthorDashboardHandler.php::submission()`
  — old-link forward.
- `lib/pkp/classes/template/PKPTemplateManager.php::setupBackendPage()` —
  sidebar menu construction.
