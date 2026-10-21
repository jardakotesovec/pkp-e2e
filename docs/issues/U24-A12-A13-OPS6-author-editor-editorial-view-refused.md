# An editor who is also a submission's author lands in its editorial view from a discussion email, and its controls fail

- **Severity** medium
- **Effort** small
- **Kind** intention gap
- **Affects**
  - main: OJS, OMP, OPS
  - 3.5: OJS, OMP, OPS
  - 3.4: none (code; no editorial dashboard, the workflow page refuses them)
  - 3.3: none (code; as 3.4)
- **Introduced** `pkp/ui-library#418` for `pkp/pkp-lib#7495` · [619f90a9a3](https://github.com/pkp/ui-library/commit/619f90a9a38cf0e88aab74bd0b081ea4b7ed9f70) · 2024-10-03 (the dashboard opens the workflow from its address for anyone) and `pkp/ui-library#547` for `pkp/pkp-lib#10768` · [2805cd9d46](https://github.com/pkp/ui-library/commit/2805cd9d46194ed6e180412ed706201ca8850666) · 2025-03-06 (the "cannot access" rule, applied to the list only) · Jarda Kotěšovec (jardakotesovec)
- **Upstream** none found (2026-10-21)
- **Tracked in** spec U24 [A12](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U24-workflow-screen-and-stage-access.md#a12), [A13](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U24-workflow-screen-and-stage-access.md#a13), [OPS6](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U24-workflow-screen-and-stage-access.md#ops6)
- **Checked** 2026-10-21, each branch's tip (the commits in Evidence)
- **Model** claude-opus-5-5

## Summary

A journal, press or preprint server's editor or manager who is also one
of a submission's authors, assigned to it only as its author, is told
on the editorial dashboard's "Active submissions" that they "cannot
access this submission" and should go to "My Submissions". Yet the
link in the last line of every discussion email they get about it,
"Reply to this comment at #…", opens the submission's editorial view,
and so does its editorial address typed or bookmarked.

In that view the controls fail one after another. On a review round an
"Error" dialog reading "You are not allowed to access these files."
sits over the panel, and "Files for Review" lists nothing. A manager or
editor is offered the decision buttons: "Request Revisions" opens its
window, and its "Next" ends on the page "You do not have permission to
record this decision on this submission.". On a preprint server "Post
the preprint" does nothing.

The user reaches their own author's view from "My Submissions". The
same happens to a section editor (series editor, moderator) or an
assistant who is the submission's author, without the decision
buttons.

## Impact

- **Lost**: no data. The server refuses every editorial action, as it
  should for an author; what is lost is the user's way to the
  discussion they were mailed about, and their time.
- **Who**: anyone holding an editorial role in the journal, press or
  server who is also an author there: an editor's own editorial, a
  manager's article. On a journal the manager-level roles are "Journal
  manager", "Journal editor" and "Production editor"; on a press "Press
  manager", "Press editor" and "Production editor"; on a preprint server
  "Preprint Server manager". They meet it each time an editor opens a
  discussion with them, through the email.
- **Way round**: open the submission from "My Submissions", as the
  dashboard's notice says.

Medium: a link the app mails this user at every discussion leads to a
view that misleads and refuses, with a way round on screen. It would be
high if the author could not reach their submission at all.

## Steps to reproduce

Preconditions:

- PKP's default test dataset for `main`, OJS, journal `publicknowledge`.
- `ccorino` (Carlo Corino), the author of submission 2 "The influence of
  lactation on the quantity and quality of cashmere production" (Review,
  round 1), holds the "Journal editor" role. To give it: sign in as
  `admin`, Settings › Users & Roles › "Invite to a role", search
  `ccorino@mailinator.com`, "Search User", choose "Journal editor" in the
  new role row with today's date as its start, "Save And Continue",
  "Invite user to the role". Sign out, open the link in the invitation
  email to `ccorino@mailinator.com` (nobody signed in) and press "Accept
  And Continue to …". Any start date up to today gives the same result;
  a later one gives the role only from that day.
- [OMP: `afinkel` (Alvin Finkel), author of submission 2 "The West and
  Beyond: New Perspectives on an Imagined Region" (External Review,
  round 1), given "Press editor". OPS: `ccorino`, author of preprint 1
  "The influence of lactation on the quantity and quality of cashmere
  production" (Production), given "Preprint Server manager".]

From the discussion email:

1. Sign in as `dbarnes`. Open submission 2 [OPS 1] at "Review Round 1"
   [OMP "External Review" round 1; OPS "Production"].
2. Under "Review Tasks & Discussions" [OPS "Production Tasks &
   Discussions"] press "Add", name it "Proof query", tick Carlo Corino
   [OMP Alvin Finkel], type a message, "Save". Sign out.
3. Sign in as `ccorino` [OMP `afinkel`]. In the email "Proof query",
   press the link "#2 Corino" [OMP "#2 Finkel et al.", OPS "#1 Corino"]
   in its last line.

From the dashboard and the address:

4. Open "Active submissions". Submission 2 [OPS 1] has no "View" button.
5. Open `/index.php/publicknowledge/en/dashboard/editorial?workflowSubmissionId=2`
   [OPS `…=1`].
6. [OJS, OMP] Press "OK" on the dialog over the panel. Press "Request
   Revisions", then "Next" in its window.
7. [OPS] Press "Post the preprint".

**Expected**: steps 3 and 5 open the author's view of the submission,
the one `/index.php/publicknowledge/en/dashboard/mySubmissions?workflowSubmissionId=2`
shows, where the notice in step 4 sends them ("To view it, go to "My
Submissions"").

**Observed**: the email's last line reads

```
Reply to this comment at #2 Corino ( …/index.php/publicknowledge/en/dashboard/editorial?workflowSubmissionId=2 ) or unsubscribe ( … ) from emails sent by Journal of Public Knowledge
```

and step 3 opens the same editorial view as step 5. Step 4 shows, in
the submission's row:

```
You cannot access this submission as a Journal Manager since you are the author. To view it, go to "My Submissions"
```

Steps 3 and 5 open the editorial view: "Workflow: Review (Round 1)"
[OMP "External Review (Round 1)", OPS "Production"], the decision
buttons "Request Revisions", "Accept Submission", "Create New Review
Round", "Cancel Review Round", "Decline Submission" [OPS "Post the
preprint", "Decline Submission"], "Add Reviewer", and a "Participants"
list without "Assign". On OJS and OMP an "Error" dialog sits over it:

```
Error
You are not allowed to access these files.
OK
```

The panel behind it asked for the round's review files and was refused:

```
GET /index.php/publicknowledge/api/v1/submissions/2/files?fileStages=4&reviewRoundIds=2
403 {"error":"You are not allowed to access these files."}
```

After "OK", "Files for Review" reads "No Items". "Next" in step 6
leaves the panel for the page "You do not have permission to record
this decision on this submission."
(`/index.php/publicknowledge/en/user/authorizationDenied?message=editor.submission.workflowDecision.disallowedDecision`).
Step 7 does nothing: no window, no notice, the panel stays on
"Production".

Control: `dbarnes` on the same address sees the round's file in "Files
for Review" (OJS file 14, OMP "chapter1.pdf" and the other chapters),
and on OPS his "Post the preprint" opens "Preprint: Title & Abstract".
Given "Section editor" [OMP "Series editor", OPS "Moderator"] or
"Copyeditor" [OPS "Editorial Board Member"] instead, the author gets the
same view at step 5 with the "Error" dialog and no decision buttons;
on OPS "Post the preprint" alone.

## Cause

The rule that keeps such a user out of the editorial view is applied
only to the dashboard's list. `pkp/pkp-lib#10768` set it: a manager
assigned to a submission as its author or reviewer, and not in an
editorial role, does not open it from the editorial dashboard; one
assigned both as author and as editor keeps the editorial view.
`DashboardCellSubmissionActions.vue` hides the row's "View" for them
([DashboardCellSubmissionActions.vue#L32-L56](https://github.com/pkp/ui-library/blob/99abe2529078b1cf9b8f0d7c0c67c2fce2d2e020/src/pages/dashboard/components/DashboardTable/DashboardCellSubmissionActions.vue#L32-L56)),
and the editorial activity column shows `dashboard.noAccessBeingAuthor`
in its place
([useDashboardConfigEditorialActivity.js#L53](https://github.com/pkp/ui-library/blob/99abe2529078b1cf9b8f0d7c0c67c2fce2d2e020/src/pages/dashboard/composables/useDashboardConfigEditorialActivity.js#L53)).

The address goes round that rule. The dashboard page opens the workflow
for whatever `workflowSubmissionId` the address carries
([dashboardPageStore.js#L508-L510](https://github.com/pkp/ui-library/blob/99abe2529078b1cf9b8f0d7c0c67c2fce2d2e020/src/pages/dashboard/dashboardPageStore.js#L508-L510)),
in the editorial configuration of the workflow
(`workflowConfigEditorialOJS.js` and its OMP and OPS extensions).
`PKPDashboardHandler` serves `dashboard/editorial` to anyone holding a
site administrator, manager, sub-editor or assistant role in the
context
([PKPDashboardHandler.php#L96-L99](https://github.com/pkp/pkp-lib/blob/f37a174626897ca12ab2066c27d159765c8c970a/pages/dashboard/PKPDashboardHandler.php#L96-L99)),
and `editorial()` itself checks nothing
([#L371-L374](https://github.com/pkp/pkp-lib/blob/f37a174626897ca12ab2066c27d159765c8c970a/pages/dashboard/PKPDashboardHandler.php#L371-L374)).
The discussion email links that address for every recipient: its
footer, `emails.footer.unsubscribe.discussion`, uses `{$submissionUrl}`,
which `SubmissionEmailVariable::getSubmissionUrl()` always builds as
`dashboard/editorial`.

Everywhere else this user is the submission's author.
`Repo::user()->getAccessibleWorkflowStages()` gives the manager roles
only to a user with no assignment on the submission
([user/Repository.php#L260-L266](https://github.com/pkp/pkp-lib/blob/f37a174626897ca12ab2066c27d159765c8c970a/classes/user/Repository.php#L260-L266)),
so for this user it returns the Author role for every stage, and the
older workflow addresses refuse them through
`UserAccessibleWorkflowStageRequiredPolicy`. The submission's stages
carry `currentUserAssignedRoles` = Author, so the view shows no
"Activity Log" and no publication pages. The three failures follow:

- **The review files.** The round's "Files for Review" asks for file
  stage 4. `PKPSubmissionFileController::getMany()` takes the allowed
  file stages from `Repo::submissionFile()->getAssignedFileStages()` for
  the roles of `getAccessibleWorkflowStages()`, which for an Author
  never hold review files, and answers 403
  ([PKPSubmissionFileController.php#L230-L248](https://github.com/pkp/pkp-lib/blob/f37a174626897ca12ab2066c27d159765c8c970a/api/v1/submissions/PKPSubmissionFileController.php#L230-L248)).
  The panel shows that answer as the "Error" dialog.
- **The decisions.** The buttons come from the submission's
  `availableEditorialDecisions`. `Schema::checkDecisionPermissions()`
  looks for an editorial stage assignment and, finding none, falls back
  to the user's manager-level group
  ([maps/Schema.php#L1218-L1231](https://github.com/pkp/pkp-lib/blob/f37a174626897ca12ab2066c27d159765c8c970a/classes/submission/maps/Schema.php#L1218-L1231)),
  without asking whether the user is assigned in another role.
  `DecisionAllowedPolicy` finds the Author assignment on the stage,
  skips it as not editorial and refuses. A section editor or assistant
  has no manager-level group, so no buttons.
- **"Post the preprint".** It is not a decision: the editorial OPS
  configuration offers it in Production to everyone and moves the panel
  to the publication's "Title & Abstract"
  ([workflowConfigEditorialOPS.js#L117-L133](https://github.com/pkp/ui-library/blob/99abe2529078b1cf9b8f0d7c0c67c2fce2d2e020/src/pages/workflow/composables/useWorkflowConfig/workflowConfigEditorialOPS.js#L117-L133)).
  For this user the publication pages are not built
  (`useWorkflowPermissions`: `canAccessPublication` needs an editorial
  role on the active stage), so the move lands nowhere.

The reach:

- The discussion email's link is one of several `{$submissionUrl}`
  links (walked for the discussion email; the others read in the code).
  Tasks and notifications link through
  `Repo::submission()->getWorkflowUrlByUserRoles()` and send this user
  to My Submissions.
- A manager who reviews a submission and has no other assignment on it:
  the list hides "View" for them too, but the server treats them as a
  manager there (no stage assignment, so `getAccessibleWorkflowStages()`
  and `DecisionAllowedPolicy` admit them). Not walked; left out of the
  fix below.

## Proposed fix

When the editorial dashboard is loaded with a submission on which the
user holds the Author role and no editorial role, send them on to where
`getWorkflowUrlByUserRoles()` sends an author, in
`PKPDashboardHandler::editorial()`, keeping the address's query values
([fix.diff](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/author-editor-editorial-view-refused/fix.diff)):

```diff
     public function editorial($args, $request)
     {
+        $this->redirectAuthorToTheirView($request);
         return $this->index($args, $request);
     }
+
+    protected function redirectAuthorToTheirView(PKPRequest $request): void
+    {
+        $submissionId = (int) $request->getUserVar('workflowSubmissionId');
+        $context = $request->getContext();
+        $user = $request->getUser();
+        if (!$submissionId || !$context || !$user) {
+            return;
+        }
+
+        $submission = Repo::submission()->get($submissionId, $context->getId());
+        if (!$submission) {
+            return;
+        }
+
+        // The roles the user holds on this submission by assignment (a role
+        // the user no longer holds in the context does not count); the
+        // manager roles alone when the user is not assigned to it at all.
+        $assignedRoleIds = collect(Repo::user()->getAccessibleWorkflowStages($user->getId(), $context->getId(), $submission))
+            ->flatten()
+            ->unique()
+            ->all();
+
+        if (
+            !in_array(Role::ROLE_ID_AUTHOR, $assignedRoleIds) ||
+            array_intersect([Role::ROLE_ID_SITE_ADMIN, Role::ROLE_ID_MANAGER, Role::ROLE_ID_SUB_EDITOR, Role::ROLE_ID_ASSISTANT], $assignedRoleIds)
+        ) {
+            return;
+        }
+
+        $request->redirectUrl(
+            Repo::submission()->getWorkflowUrlByUserRoles($submission, $user->getId(), $request->getQueryArray())
+        );
+    }
```

The gate is the role rule the older workflow addresses apply
(`getAccessibleWorkflowStages()`); the destination is the one
`getWorkflowUrlByUserRoles()` gives an author (My Submissions, or the
submission wizard while it is incomplete), with `workflowMenuKey` and
the other query values carried over. That method's own comment expects
the editorial address to turn away whoever cannot use it ("If they
can't access it, they'll be blocked there").

The gate differs from `getWorkflowUrlByUserRoles()` on purpose. That
method sends anyone with an Author assignment to My Submissions, even
one also assigned as editor; `pkp/pkp-lib#10768` keeps that user in
the editorial view, the list shows them "View", and the server gives
them their editorial roles there. Redirecting them would take away a
view they may use, so the redirect follows the newer rule, and the
notification links' choice for such a user is left as it is.

The constructor admits sub-editors and assistants as well, and the
redirect sends them on too when they hold only the Author assignment:
their editorial list does not include such a submission
(`pkp/pkp-lib#10768`), and the walk showed them the same failing view.
An Author assignment counts only while the user still holds an Author
role in the context, so the redirect never lands anyone on a My
Submissions they would be refused. `Repo`, `Role` and `PKPRequest` are
already imported in the handler on `main` and 3.5.

Tried on `main` on the three apps: the editorial address (step 5) now
opens My Submissions on the author's view, with no "Error" dialog and
no decision buttons (OPS on "Preprint: Title & Abstract"), for the
author given "Journal editor" ("Press editor", "Preprint Server
manager") and given "Section editor" ("Series editor", "Moderator").
`dbarnes` on the same submission, and the author-editor on a submission
that is not theirs, keep the editorial view, the same with the fix in
and out.

- **Alternatives**:
  - Apply the list's rule in the ui-library workflow page (show the
    notice in place of the panel): one composable for both places, but
    it waits for the submission to load, needs a JavaScript rebuild, and
    leaves the user on a page that is not theirs.
  - Fix each control (gate "Files for Review" and "Post the preprint" on
    an editorial role, make `checkDecisionPermissions()` fall back to the
    manager group only for a user with no assignment): three changes in
    two repositories that leave the user in an empty editorial view.
  - Give the discussion email a per-recipient link (spec U05
    [A16](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U05-notifications-center-and-email-preferences.md#a16),
    a separate fix for plain authors): it closes the email path for this
    user too, but not the typed or bookmarked address nor the other
    `{$submissionUrl}` emails.
- **What goes with it**:
  - `checkDecisionPermissions()` still lists decisions in the REST API's
    `availableEditorialDecisions` that `DecisionAllowedPolicy` refuses
    for this user. No screen shows them once the redirect is in;
    falling back to the manager group only for a user with no
    assignment on the submission would align the two. Not tried.
  - The manager-reviewer case above, if the team wants the list's rule
    there too (a product decision: the server admits them).
  - Backport: the hunk applies to `stable-3_5_0` as it stands.
  - A test: an e2e check that an author given an editorial role is sent
    from the editorial address to My Submissions, and that `dbarnes`
    keeps the editorial view.

Small: one method in one shared handler, reusing two existing rules.

## Evidence

- Kept script:
  [walk.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/author-editor-editorial-view-refused/walk.js)
  (helpers in its `lib.js`), on an install loaded from PKP's default test
  dataset and reset before each run, run as
  `PROBE_FEATURE=<feature> PROBE_AGENT=<id> node bin/probe.js all shared/playwright/checks/issues/author-editor-editorial-view-refused/walk.js`.
  It gives the role on screen as the preconditions say. The default mode
  takes steps 4 to 7 and the `dbarnes` control; `MODE=mail` steps 1 to
  3; `MODE=role ROLE=sub|asst` the section editor and assistant grants;
  `MODE=nb` the check that the fix reaches no further (the author-editor
  on a submission not theirs, OJS 4, OMP 3, OPS 2, and `dbarnes` on the
  authored one); `MODE=keys` the address with `currentViewId` and the
  stage's `workflowMenuKey`.
- The script accepts the invitation in a browser of its own, signed
  out. "Edit User" in Users & Roles, read in the code
  (`UserForm::execute()`), writes the same role record through
  `Repo::userGroup()->assignUserToGroup()` as the invitation's accept
  (`UserRoleAssignmentReceiveController`); not walked. A role counts from
  its start date (`UserUserGroup::scopeWithActive()`).
- Walked on `main` and `stable-3_5_0`, OJS, OMP and OPS (the 3.5 walk:
  steps 4 to 7 and the control), PostgreSQL, the dataset of
  pkp/datasets 5f247d04 (2026-10-20); the fault does not depend on the
  database. `MODE=mail` and `MODE=role` on `main` only.
- Fix trial on `main`, OJS, OMP and OPS, the fix applied with
  `node bin/try-fix.js apply <fix.diff> ojs omp ops`: the default mode,
  `MODE=keys`, `MODE=role ROLE=sub` and `MODE=nb` with the fix in, then
  `MODE=nb` with it out. `MODE=nb` read the same views and header
  buttons both times (OJS 4 and OMP 3 "Workflow: Submission", OPS 2
  "Preprint: Title & Abstract", each with "Activity Log"; `dbarnes` the
  review round or Production). `MODE=keys` landed on My Submissions at
  the stage's menu key on OJS and OMP and at "Title & Abstract" on OPS,
  whose author view has no `workflow_5`; that the key is carried rests
  on the code (`getWorkflowUrlByUserRoles()` merges the query values),
  since the keys tried are also the author view's defaults. The
  assistant grant and the email were not walked with the fix: both reach
  the same address and the same check.
- Code reads. `main` and 3.5: `PKPDashboardHandler`,
  `DashboardCellSubmissionActions.vue`, `dashboardPageStore.js`,
  `useWorkflowPermissions.js`, the editorial workflow configurations,
  `Repo::user()->getAccessibleWorkflowStages()`,
  `Repo::submission()->getWorkflowUrlByUserRoles()`,
  `Schema::getPropertyStages()` and `checkDecisionPermissions()`, the
  apps' `getAvailableEditorialDecisions()`, `DecisionAllowedPolicy`,
  `PKPSubmissionFileController::getMany()`, `SubmissionEmailVariable`,
  `AnonymizeData` (the reviewer names stay blank for this user: their
  Author assignment marks them as an author). 3.4 and 3.3 (pkp-lib
  `stable-3_4_0` `pages/dashboard/DashboardHandler.php`,
  `pages/workflow/PKPWorkflowHandler.php`,
  `UserAccessibleWorkflowStageRequiredPolicy`; 3.3 the `.inc.php`
  twins): no workflow address on the dashboard, and the submissions list
  links this user to the author dashboard.
- Introduced: `pkp/pkp-lib#10768` ("Redesigned Dashboard & Workflow rc2
  - users with multiple roles") asked that a Journal Manager assigned as
  author or reviewer get a warning and no "View" on the editorial
  dashboard; `pkp/ui-library#547` (2805cd9d46) added both, and its
  pkp-lib half, `pkp/pkp-lib#11028` (2a42a379ec), the notice's text.
  The view they did not reach is older: the address opener came with
  the new workflow page, `pkp/ui-library#418` (619f90a9a3, for
  `pkp/pkp-lib#7495`), `editorial()` with `DashboardHandlerNext`
  (c867c8cc00, 2024-04), and the manager fallback of
  `checkDecisionPermissions()` with `pkp/pkp-lib#10537` (af501d2e3d,
  2024-10-22).
- Upstream search (2026-10-21, pkp/pkp-lib, pkp/ui-library; issues and
  PRs): "not allowed to access these files", "manager author own
  submission workflow", "editor author same submission decision",
  `noAccessBeingAuthor`, "workflowSubmissionId author",
  `disallowedDecision`, "Post the preprint" nothing, "author editorial
  dashboard", `checkDecisionPermissions`, "PKPDashboardHandler
  redirect". Read and set aside: `pkp/pkp-lib#10670` (the old workflow
  addresses' redirects), `pkp/pkp-lib#12739` and `#12732`
  (`{$submissionUrl}` for plain authors).
- Tips. `main`: ojs 3109a59114 (lib/pkp f37a174626), omp 5777025be and
  ops f048e747b4 (lib/pkp 042726ebf6; the handler is the same file),
  lib/ui-library 99abe252. `stable-3_5_0`: ojs 1e78ca0c2b, omp
  cce424e5e, ops 5eca7fd603 (lib/pkp 68512b5fda, lib/ui-library
  2576e00a). `stable-3_4_0`: ojs 0012bd1022, omp e30fa7e38, ops
  0f1e21a117 (lib/pkp 85f47442cf). `stable-3_3_0`: ojs d7d9dd14ec, omp
  8e72fc883, ops c5532e2161 (lib/pkp 867ce82d8e).
- Not driven: "Journal manager" and "Production editor" (the same
  manager role as "Journal editor" in the code), the other
  `{$submissionUrl}` emails, the other decision buttons, "Request
  Response" and OPS's "Decline Submission" for this user; the
  manager-reviewer case; the email and role modes on 3.5.
