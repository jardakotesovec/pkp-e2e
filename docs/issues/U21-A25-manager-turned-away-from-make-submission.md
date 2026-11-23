# A journal or press manager is turned away from "Make a Submission" once no author role allows self-registration

- **Severity** medium
- **Effort** small
- **Kind** regression
- **Affects**
  - main: OJS, OMP
  - 3.5: OJS, OMP (released in 3.5.0-2 to 3.5.0-6; 3.5.0-0 and 3.5.0-1 on the first visit only, code)
  - 3.4: none (code)
  - 3.3: none (code)
- **Introduced** `pkp/pkp-lib#11435`, a temporary workaround while `pkp/pkp-lib#10929` stays open · [24e9ca169e](https://github.com/pkp/pkp-lib/commit/24e9ca169e39b8edcabaf8ce80f84ee37f117aac) · 2025-05-28 · Taslan A. Graham (taslangraham); on `stable-3_5_0` `pkp/pkp-lib#11075`
- **Upstream** `pkp/pkp-lib#10929` (open): a Production editor's refused file upload, and the decision still owed on how manager-level roles submit; it does not name this page
- **Tracked in** spec U21 [A25](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U21-submission-wizard.md#a25)
- **Checked** 2026-11-23, each branch's tip (the commits in Evidence)
- **Model** claude-opus-5-5

## Summary

On a journal or press where "Allow user self-registration" is off on
every author role, a Journal Manager (Press Manager) with no other role
who opens "Make a Submission" gets the "Not Allowed" page: "You are not
allowed to submit to this journal because authors must be registered by
the editorial staff." The dashboard's "Start A New Submission" still
leads there.

The manager is allowed to submit: a start form they loaded before the
change still creates the submission, in the manager role. Giving the
manager the Author role lets them in, as an author. Ticking
self-registration on an author role again does too, but while it is on,
any registered user can start a submission.

Editors, Section Editors, Authors and every other role that works in the
submission stage still get the form, and so does a site administrator
who is a manager there. A preprint server's manager is not affected.

## Impact

- **Lost**: the manager cannot start a submission from the page, and the
  page sends them to the journal's contact. Nothing stored is lost.
- **Who**: managers with no other role, in a journal or press that takes
  submissions by invitation only, on every visit.
- **Way round**: the Author role, or self-registration ticked for the
  moment (Summary). The page suggests neither.

Medium: a way round exists on screen. It would be high if such journals
often had managers with no other role who submit.

## Steps to reproduce

Preconditions:

- The default dataset, OJS `main` (OMP the same, with the words in
  brackets).
- `rvaca` (Ramiro Vaca) holds "Journal manager" ["Press manager"] and no
  other role in `publicknowledge`.

1. Sign in as `rvaca`. In the dashboard's side menu press "Start A New
   Submission". The "Make a Submission" page shows the start form with
   "Begin Submission" and no "Submit As". Leave this tab open.
2. In a second tab, open Settings › "Users & Roles", tab "Roles". On the
   "Author" row press the arrow, then "Edit". Under "Role Options"
   untick "Allow user self-registration" and press "OK". [OMP: the same
   on the "Chapter Author" and "Volume editor" rows, the press's other
   author roles that allow self-registration in the dataset.]
3. In the second tab, press "Start A New Submission" in the side menu.
4. In the first tab, on the form loaded in step 1, type a title, choose
   the section "Articles" [OMP: no section; leave the submission type as
   it is], tick "Yes, my submission meets all of these requirements."
   and the privacy consent, and press "Begin Submission".

**Expected.** Step 3 shows the same start form as step 1. A Journal
Manager may start a submission in their own role, as step 4 shows the
server accepts. Whether an author role allows self-registration matters
only for users who hold no role that may submit.

**Observed.** Step 3 shows the page "Not Allowed" ("press" on OMP; the
contact is the journal's principal contact):

```
Not Allowed
You are not allowed to submit to this journal because authors must be registered by the editorial staff. If you believe this is an error, please contact Ramiro Vaca.
```

Step 4 answers `POST /index.php/publicknowledge/api/v1/submissions 200`
and opens the submission wizard on "Upload Files" ["Details" on 3.5].
The new submission lists `rvaca` as "Journal manager" ["Press manager"],
and his roles stay "Journal manager" alone.

Control: with the author roles still closed, `dbarnes` ("Journal
editor", ["Press editor"]) gets the start form, and a newcomer who has
just registered on the journal's "Register" page (Reader only) gets "Not
Allowed".

## Cause

The start page and the submissions API decide separately whether a user
may submit, and for a manager they disagree.

The page asks `PKPSubmissionHandler::getSubmitUserGroups()` (lib/pkp
`pages/submission/PKPSubmissionHandler.php`) for the roles a user may
submit in, and shows "Not Allowed" when it returns none
(`SubmissionHandler::start()` in OJS and OMP). For a user who is not a
site administrator the method keeps only their groups with a row for the
submission stage:

```php
: $query->withStageIds([WORKFLOW_STAGE_ID_SUBMISSION])->get();
```

The installed "Journal manager" ["Press manager"] group has no stage
rows: a manager reaches every stage through the runtime rule in
`PKP\user\Repository::getAccessibleWorkflowStages()`, not through
`user_group_stage`. So for a manager with no other role the query is
empty. The method then falls back to the first author group that allows
self-registration, which is meant for users with no submitting role.
While one exists, the manager gets the form; once none does, the page
says "Not Allowed".

`PKPSubmissionController::add()`, which "Begin Submission" posts to,
accepts every manager or author group of the user: its own
submission-stage filter was commented out by af8f0d8d2f, "To be resolved
in" `pkp/pkp-lib#10929`. The form sends no role, because
`StartSubmission::addUserGroups()` drops the groups without a
submission-stage row before it counts them and shows "Submit As" only for
two or more. So the API takes the user's author group if they have one,
else one of their manager groups, which is why step 4 goes through in the
manager role whatever the author roles allow. For a user with two manager
groups and no author group (a manager who is also a "Journal editor") no
"Submit As" shows either, and which manager group the API takes is not
fixed: its sort puts author groups first and leaves the rest unordered.

24e9ca169e replaced the page's role filter (Manager, Site administrator,
Author, as on 3.4) with the stage filter. It was a temporary fix for
`pkp/pkp-lib#10929`: a Production editor who submitted in that role was
refused at the file upload, so the change made users without a
submission-stage group submit as Author, enrolled on the page. When
626a562282 (`pkp/pkp-lib#12064` for `pkp/pkp-lib#12002`) moved that
enrolment to "Begin Submission", the manager's admission was left to the
self-registration fallback.

Reach:

- OJS and OMP: walked on `main` and 3.5.
- "Production editor", the other installed manager-level group without
  the submission stage (it holds Copyediting and Production), goes
  through the same fallback (code). Its users already meet
  `pkp/pkp-lib#10929` when they get in: a submission made in that role
  reaches only those stages, so its file upload is refused.
- OPS overrides `getSubmitUserGroups()` with the Manager, Site
  administrator and Author roles, so a Preprint Server manager always
  gets the form (code).
- A site administrator takes the method's other branch, which lists their
  manager groups, so an administrator who is a manager gets the form
  (code).
- A related report, [U21 A14](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/issues/U21-A14-section-editor-submit-as-refused.md),
  has the opposite symptom from the same line: a section editor who is
  also an author is offered a role the API refuses. Its fix adds a role
  filter to the same query and does not cover this one; the two compose.

## Proposed fix

Before the self-registration fallback, give a user who has no
submission-stage group the manager groups they hold that have no stage
rows at all, the role `PKPSubmissionController::add()` will submit them
in. In `PKPSubmissionHandler::getSubmitUserGroups()`
([fix.diff](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/manager-turned-away-from-make-submission/fix.diff)):

```diff
+        if ($userGroups->isEmpty()) {
+            $userGroups = UserGroup::query()->withContextIds([$context->getId()])
+                ->withRoleIds([Role::ROLE_ID_MANAGER])
+                ->whereDoesntHave('userGroupStages')
+                ->whereHas('userUserGroups', function (EloquentBuilder $query) use ($user) {
+                    $query->withUserId($user->getId())->withActive();
+                })
+                ->get();
+        }
+
         // Users without a submitting role or access to submission stage can submit as an
```

The condition is the one `Repository::getAccessibleWorkflowStages()`
uses: a manager assigned in a group with no stage rows reaches every
stage, so a submission made in it can be completed, as step 4 shows. It
follows the method's administrator branch and OPS's override, which list
the user's manager groups. While an author role allows self-registration
nothing changes: the manager gets the same form and submits in the same
role.

"Production editor" is left as it is. Its group has stage rows, so the
new query skips it, and its users keep today's behavior: let in only
through the self-registration fallback, then refused at the file upload
(`pkp/pkp-lib#10929`). Letting them in here would lead them into that
refusal. So the fix does not need the decision `pkp/pkp-lib#10929` waits
for; whichever way it goes (managers submit in their own role, or as
Author), a stock manager should not depend on author self-registration.

Tried on OJS and OMP `main`: step 3 showed the start form and step 4
created the submission in the manager role. With the fix in and out,
`dbarnes` got the start form and a newly registered Reader got "Not
Allowed".

**Alternatives**

- Give the manager role its stage rows (the
  [U54 A2 report](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/issues/U54-A2-manager-role-row-shows-no-stage.md)).
  That would also let the stock manager in, through the stage filter,
  but needs an upgrade migration.
- Return every manager group, "Production editor" included. That lets a
  Production editor in only to be refused at the upload.
- Drop the stage filter and go back to 3.4's role filter. That adds
  "Journal manager" to "Submit As" for a manager who is also an author,
  which `pkp/pkp-lib#10929` set out to avoid.
- One shared roster for the page and `PKPSubmissionController::add()`.
  That is the lasting answer, but it waits on the decision in
  `pkp/pkp-lib#10929`.

**What goes with it**

- No stored data, REST API or hook changes. The diff applies as it stands
  to `stable-3_5_0`.
- Guard: an e2e scenario in which a manager with no other role starts a
  submission while no author role allows self-registration.

Small: one query in the shared handler, with its test, and no product
decision first.

## Evidence

- Kept script:
  [walk.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/manager-turned-away-from-make-submission/walk.js),
  helpers in `lib.js` beside it. `MODE=walk` (default) takes the Steps;
  `MODE=nb` is the neighbour (the author roles closed as in step 2, then
  a newcomer registered on the "Register" page and `dbarnes` open "Make a
  Submission"). On an install freshly loaded from the default dataset:
  `PROBE_FEATURE=<feature> PROBE_AGENT=<id> node bin/probe.js ojs,omp shared/playwright/checks/issues/manager-turned-away-from-make-submission/walk.js`
- The fix was tried with `walk.js` on OJS and OMP `main`, and `MODE=nb`
  with it and without it.
- Walked on OJS and OMP, `main` and `stable-3_5_0`, on PostgreSQL;
  datasets pkp/datasets abdb5d17 (2026-11-22). No request failed and no
  script error was recorded. The OPS sub-items rest on the code read.
- OMP's dataset has "Volume editor", an author role, with
  self-registration on, besides "Author" and "Chapter Author"; with only
  those two closed the press manager still got the form, so step 2 names
  all three.
- Tips: `main` OJS 1e1d3fc49b, OMP bdfae3fe7, OPS 69d3cf6bad (lib/pkp
  3ea73a1a7e); `stable-3_5_0` OJS 7f23f05a93, OMP 272333e34, OPS
  5a7aec98df (lib/pkp 9295edd4f0); `stable-3_4_0` OJS 4b437fd4c3, OMP
  bb23aba92, pkp-lib 1310f00fed; `stable-3_3_0` OJS de6f4ead8e, OMP
  d9fa9678d, pkp-lib cb68f48e99.
- Code reads:
  - `main` and 3.5: `PKPSubmissionHandler::getSubmitUserGroups()`,
    OJS and OMP `SubmissionHandler::start()`,
    `StartSubmission::addUserGroups()`, `PKPSubmissionController::add()`,
    `PKP\user\Repository::getAccessibleWorkflowStages()`, OPS's
    `SubmissionHandler::getSubmitUserGroups()`, and the datasets'
    `user_group_stage` rows (the manager group has none on either line).
  - Blame: the page's stage-filter line was last touched by af8f0d8d2f
    (`pkp/pkp-lib#12064` for `pkp/pkp-lib#12002`), which also commented
    out the API's stage filter that 626a562282 (the same PR) had added;
    the page's filter comes from 24e9ca169e (`pkp/pkp-lib#11435`), on
    3.5 from 02b85e4d38 (`pkp/pkp-lib#11075`). 626a562282 removed the
    enrolment on the page.
  - Released 3.5 (lib/pkp tags): 02b85e4d38 is in 3_5_0-0 to 3_5_0-6;
    the 3.5 port of the enrolment's removal, 312f38fe6f, in 3_5_0-2 to
    3_5_0-6. Before it (3.5.0-0, 3.5.0-1) the page enrolled the manager
    as Author on the first visit, so they were turned away once and let
    in as an author afterwards (read in the code, not walked).
  - Ways round, read in the code, not walked: with the Author role added,
    the stage filter finds it and the API submits in it (author groups
    first); with self-registration on, the fallback admits any user
    without a submitting role and the API enrols them as Author.
  - 3.4: `getSubmitUserGroups()` filters by Manager, Site administrator
    and Author, so a manager gets the form.
  - 3.3: `PKPSubmissionSubmitStep1Form::fetch()` always offers the user's
    manager groups.
- Upstream searches (2026-11-23): pkp/pkp-lib by the page's text, "journal
  manager" with "make a submission", self-registration with manager,
  `getSubmitUserGroups` and `submission.wizard.notAllowed`; pkp/ojs,
  pkp/omp and pkp/ui-library by the manager and the page. Read:
  `pkp/pkp-lib#10929` (open; its 2025-12 comments list options for the
  manager-level roles), `pkp/pkp-lib#12002` (closed, roleless users),
  `pkp/pkp-lib#13806` (open, the Sub-editor "Submit As"), `pkp/pkp-lib#6951`
  (open, removing the Author role's self-registration option),
  `pkp/pkp-lib#12967` and `pkp/pkp-lib#13064` (closed, other faults).
- Not driven: a "Production editor" (the dataset has no such user; its
  case is read in `getSubmitUserGroups()`, `getAccessibleWorkflowStages()`
  and the dataset's stage rows, 4, 5 and 6, and its refused upload is the
  one `pkp/pkp-lib#10929` reports), a site administrator, the two ways
  round, a user with two manager groups; OPS; 3.4 and 3.3; MySQL (the
  fault does not depend on the database).
