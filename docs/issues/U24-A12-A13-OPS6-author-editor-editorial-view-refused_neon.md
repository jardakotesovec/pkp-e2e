# Discussion email or direct URL opens a broken editorial view for an editor who authored the submission

- **Severity:** medium
- **Effort:** small
- **Kind:** intention gap
- **Affects:**
  - **main:** OJS, OMP, OPS
  - **3.5:** OJS, OMP, OPS
  - **3.4:** none (verified in code; no editorial dashboard — workflow page refuses access)
  - **3.3:** none (verified in code; same as 3.4)
- **Introduced:**
  - `pkp/ui-library#418` (`pkp/pkp-lib#7495`) · [619f90a9a3](https://github.com/pkp/ui-library/commit/619f90a9a38cf0e88aab74bd0b081ea4b7ed9f70) · 2024-10-03 — opens the editorial workflow modal from `?workflowSubmissionId=` without checking submission-level access
  - `pkp/ui-library#547` (`pkp/pkp-lib#10768`) · [2805cd9d46](https://github.com/pkp/ui-library/commit/2805cd9d46194ed6e180412ed706201ca8850666) · 2025-03-06 — blocks author-editors from opening their own submissions, but only in the dashboard list UI
  - Author: Jarda Kotěšovec (jardakotesovec)
- **Upstream:** none found (2026-10-21)
- **Tracked in:** spec U24 [A12](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U24-workflow-screen-and-stage-access.md#a12), [A13](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U24-workflow-screen-and-stage-access.md#a13), [OPS6](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U24-workflow-screen-and-stage-access.md#ops6)
- **Checked:** 2026-10-21, each branch tip (commits in Evidence)
- **Model:** claude-opus-5-5 *(rewrite experiment for comparison)*

## Summary

When a manager or editor is also the author of a submission (and is not assigned to it in an editorial role), **Active submissions** on the editorial dashboard intentionally hides the **View** button and tells them to open it from **My Submissions** instead.

However, clicking the link at the bottom of a discussion email (`Reply to this comment at #…`) — or opening the editorial URL directly — bypasses that restriction and loads the submission in the editorial workflow view anyway.

Because the backend still treats this user as an Author, the editorial UI breaks in multiple places:
- **Review stage (OJS, OMP):** An **Error** dialog pops up (`You are not allowed to access these files.`), and **Files for Review** stays empty.
- **Editorial decisions (OJS, OMP):** Manager-level roles are still shown decision buttons like **Request Revisions**, but clicking **Next** fails with `You do not have permission to record this decision on this submission.`
- **Preprint posting (OPS):** Clicking **Post the preprint** silently does nothing.

Section/series editors, moderators, and assistants who authored a submission hit the same broken view (without the decision buttons). In all cases, users can still reach their working author view via **My Submissions**.

## Impact

- **Lost:** No data is lost or exposed — the server enforces author permissions and rejects every editorial action. Users lose direct navigation from discussion emails to the thread they were notified about, and waste time hitting misleading errors.
- **Who:** Any user with an editorial role who submits their own work (for example, an editor writing an editorial or a manager submitting an article/book/preprint).
  - Manager-level roles (also see broken decision buttons): **Journal manager**, **Journal editor**, **Production editor** (OJS); **Press manager**, **Press editor**, **Production editor** (OMP); **Preprint Server manager** (OPS).
  - Other editorial roles (no decision buttons): **Section editor** / **Series editor** / **Moderator**, and assistants such as **Copyeditor** / **Editorial Board Member**.
  - Triggered every time a colleague starts a discussion with them and they follow the email link.
- **Workaround:** Ignore the email link and open the submission from **My Submissions**, as the dashboard notice suggests.

**Medium:** An app-generated link sent on every discussion leads to a broken, misleading editorial view, but no data is lost and **My Submissions** provides a clear workaround. *(Would be High if the author could not reach the submission at all.)*

## Steps to reproduce

### Prerequisites

Start from PKP's default test dataset (`main`, `publicknowledge`) and assign an editorial role to an existing submission's author:

| App | Author account | Submission & stage | Role to assign |
| --- | --- | --- | --- |
| **OJS** | `ccorino` (Carlo Corino) | #2 *"The influence of lactation on the quantity and quality of cashmere production"* — **Review Round 1** | Journal editor |
| **OMP** | `afinkel` (Alvin Finkel) | #2 *"The West and Beyond: New Perspectives on an Imagined Region"* — **External Review** (Round 1) | Press editor |
| **OPS** | `ccorino` (Carlo Corino) | #1 *"The influence of lactation on the quantity and quality of cashmere production"* — **Production** | Preprint Server manager |

**How to assign the role (OJS example):**
1. Sign in as `admin` and go to **Settings › Users & Roles › Invite to a role**.
2. Search for `ccorino@mailinator.com` (**Search User**), add the **Journal editor** role with today's date as the start date *(any start date up to today works; a future date only activates on that day)*, click **Save And Continue**, then **Invite user to the role**.
3. Sign out, open the invitation email sent to `ccorino@mailinator.com` while signed out, and click **Accept And Continue to …**.

### Path A — From a discussion email

1. Sign in as `dbarnes` and open the submission above at its active stage (**Review Round 1** on OJS, **External Review** Round 1 on OMP, **Production** on OPS).
2. Under **Review Tasks & Discussions** *(OPS: **Production Tasks & Discussions**)*, click **Add**, title it `"Proof query"`, check the author (**Carlo Corino** / **Alvin Finkel**), enter any message, and click **Save**. Sign out.
3. Sign in as the author (`ccorino` / `afinkel`), open the `"Proof query"` email, and click the link in the last line (`#2 Corino` on OJS, `#2 Finkel et al.` on OMP, `#1 Corino` on OPS).

### Path B — From the dashboard and direct URL

4. Open **Active submissions** on the editorial dashboard and check the submission's row (notice there is no **View** button).
5. Open the editorial URL directly:
   - OJS / OMP: `/index.php/publicknowledge/en/dashboard/editorial?workflowSubmissionId=2`
   - OPS: `/index.php/publicknowledge/en/dashboard/editorial?workflowSubmissionId=1`
6. *(OJS, OMP)* Dismiss the **Error** dialog (**OK**), click **Request Revisions**, then click **Next**.
7. *(OPS)* Click **Post the preprint**.

### Expected

Both the discussion email link (Step 3) and the direct editorial URL (Step 5) should open the user's **author view** under **My Submissions** (`/index.php/publicknowledge/en/dashboard/mySubmissions?workflowSubmissionId=2`), matching the dashboard's own notice (*"To view it, go to "My Submissions""*).

### Observed

- **Dashboard list (Step 4) works as intended:** The **View** button is hidden and the row displays:
  ```text
  You cannot access this submission as a Journal Manager since you are the author. To view it, go to "My Submissions"
  ```
- **Discussion email (Step 3) links to the editorial dashboard:** The footer reads:
  ```text
  Reply to this comment at #2 Corino ( …/index.php/publicknowledge/en/dashboard/editorial?workflowSubmissionId=2 ) or unsubscribe ( … ) from emails sent by Journal of Public Knowledge
  ```
- **Editorial view loads broken (Steps 3 & 5):** Both the email link and direct URL open the editorial workflow panel (**Workflow: Review (Round 1)** / **External Review (Round 1)** / **Production**) showing editorial controls (**Request Revisions**, **Accept Submission**, **Create New Review Round**, **Cancel Review Round**, **Decline Submission**, **Add Reviewer**, and **Participants** without **Assign**; on OPS: **Post the preprint** and **Decline Submission**).
- **Review files fail with 403 (OJS, OMP):** An **Error** dialog immediately appears over the panel:
  ```text
  Error
  You are not allowed to access these files.
  OK
  ```
  Behind it, the files API request fails:
  ```http
  GET /index.php/publicknowledge/api/v1/submissions/2/files?fileStages=4&reviewRoundIds=2
  403 {"error":"You are not allowed to access these files."}
  ```
  After clicking **OK**, **Files for Review** shows **No Items**.
- **Decision buttons fail (Step 6 — OJS, OMP):** Clicking **Next** inside **Request Revisions** redirects to the authorization-denied page:
  ```text
  You do not have permission to record this decision on this submission.
  ```
  (`/index.php/publicknowledge/en/user/authorizationDenied?message=editor.submission.workflowDecision.disallowedDecision`)
- **Preprint button does nothing (Step 7 — OPS):** Clicking **Post the preprint** produces no dialog, no notice, and no navigation — the panel stays on **Production**.

### Controls & role variants

- **Positive control (`dbarnes`):** Opening the same URL as `dbarnes` (not an author) loads **Files for Review** normally (OJS file 14; OMP `chapter1.pdf` and other chapters), and on OPS **Post the preprint** navigates to **Preprint: Title & Abstract**.
- **Non-manager editorial roles:** Repeating Step 5 after assigning **Section editor** / **Series editor** / **Moderator**, or **Copyeditor** / **Editorial Board Member**, opens the same broken editorial view with the 403 **Error** dialog, but without the decision buttons (on OPS, only **Post the preprint** appears).

## Cause

The bug happens because **four different layers disagree** on how to treat an editorial user who is assigned to a submission solely as its Author:

| Layer | Rule it checks | Result for this user |
| --- | --- | --- |
| **Dashboard table UI** (`DashboardCellSubmissionActions.vue`, `useDashboardConfigEditorialActivity.js`) | Assigned as Author/Reviewer and *not* assigned an editorial role | **Blocks access** — hides **View** and shows `dashboard.noAccessBeingAuthor` |
| **Editorial route & modal opener** (`PKPDashboardHandler::editorial()`, `dashboardPageStore.js`) | Context-level editorial role only | **Allows access** — opens the editorial workflow panel for any `?workflowSubmissionId=` |
| **Files API & Decision policy** (`PKPSubmissionFileController`, `DecisionAllowedPolicy`) | Submission stage assignments via `getAccessibleWorkflowStages()` / all stage rows | **Treats as Author only** — rejects review files (`403`) and decisions (`authorizationDenied`) |
| **Decision button list** (`Schema::checkDecisionPermissions()`) | Editorial stage assignments, falling back to global Manager/Admin role | **Treats as Manager** — renders editorial decision buttons that the policy later rejects |

### Step-by-step breakdown

1. **The block lives only in the dashboard list UI.**
   `pkp/pkp-lib#10768` established the rule that a manager assigned as a submission's author or reviewer (without an editorial assignment) must not open it from the editorial dashboard, while someone assigned *both* as author and as editor keeps editorial access. That check was implemented only in the table row components:
   - [DashboardCellSubmissionActions.vue#L32-L56](https://github.com/pkp/ui-library/blob/99abe2529078b1cf9b8f0d7c0c67c2fce2d2e020/src/pages/dashboard/components/DashboardTable/DashboardCellSubmissionActions.vue#L32-L56) hides **View**.
   - [useDashboardConfigEditorialActivity.js#L53](https://github.com/pkp/ui-library/blob/99abe2529078b1cf9b8f0d7c0c67c2fce2d2e020/src/pages/dashboard/composables/useDashboardConfigEditorialActivity.js#L53) displays `dashboard.noAccessBeingAuthor`.

2. **Direct URLs and discussion emails bypass the list.**
   - `PKPDashboardHandler` admits any user with a context-level Site Admin, Manager, Sub-editor, or Assistant role to `dashboard/editorial` ([PKPDashboardHandler.php#L96-L99](https://github.com/pkp/pkp-lib/blob/f37a174626897ca12ab2066c27d159765c8c970a/pages/dashboard/PKPDashboardHandler.php#L96-L99)), and `editorial()` performs no per-submission check ([PKPDashboardHandler.php#L371-L374](https://github.com/pkp/pkp-lib/blob/f37a174626897ca12ab2066c27d159765c8c970a/pages/dashboard/PKPDashboardHandler.php#L371-L374)).
   - On page load, `dashboardPageStore.js` unconditionally opens the editorial workflow modal (`workflowConfigEditorial{OJS,OMP,OPS}.js`) for whatever `workflowSubmissionId` is in the query string ([dashboardPageStore.js#L508-L510](https://github.com/pkp/ui-library/blob/99abe2529078b1cf9b8f0d7c0c67c2fce2d2e020/src/pages/dashboard/dashboardPageStore.js#L508-L510)).
   - Every discussion email footer (`emails.footer.unsubscribe.discussion`) links to `{$submissionUrl}`, which `SubmissionEmailVariable::getSubmissionUrl()` always builds as `dashboard/editorial?workflowSubmissionId=…` regardless of recipient role.

3. **Inside the editorial panel, backend permissions treat the user as an Author.**
   `Repo::user()->getAccessibleWorkflowStages()` only falls back to global Manager/Admin roles when a user has **no** stage assignments on the submission ([user/Repository.php#L260-L266](https://github.com/pkp/pkp-lib/blob/f37a174626897ca12ab2066c27d159765c8c970a/classes/user/Repository.php#L260-L266)). Because this user has an Author assignment, the method returns only `ROLE_ID_AUTHOR` for every stage (and legacy workflow URLs refuse them via `UserAccessibleWorkflowStageRequiredPolicy`). The submission's `stages` data therefore sets `currentUserAssignedRoles` to Author only — hiding **Activity Log** and all publication tabs — and triggers the three failures:
   - **Review files (`403`):** The editorial review panel requests file stage `4` (`SUBMISSION_FILE_REVIEW_FILE`). `PKPSubmissionFileController::getMany()` restricts allowed stages via `Repo::submissionFile()->getAssignedFileStages()`, which excludes review files for Authors, returning `403` ([PKPSubmissionFileController.php#L230-L248](https://github.com/pkp/pkp-lib/blob/f37a174626897ca12ab2066c27d159765c8c970a/api/v1/submissions/PKPSubmissionFileController.php#L230-L248)). The UI displays that error as the modal dialog.
   - **Decision buttons (rendered, then denied):** `Schema::checkDecisionPermissions()` queries stage assignments *filtered to Manager and Sub-editor roles*; finding none, it falls back to the user's global Manager/Admin group without checking for an Author assignment ([maps/Schema.php#L1218-L1231](https://github.com/pkp/pkp-lib/blob/f37a174626897ca12ab2066c27d159765c8c970a/classes/submission/maps/Schema.php#L1218-L1231)), so `availableEditorialDecisions` includes decision buttons. When submitted, `DecisionAllowedPolicy` queries *all* stage assignments, finds the Author row (so it skips the unassigned-manager fallback), ignores it as non-editorial, and denies. *(Section editors and assistants have no global Manager group, so they get no decision buttons.)*
   - **OPS "Post the preprint" (silent no-op):** This button is not a decision; `workflowConfigEditorialOPS.js` always shows it in Production to navigate to `publication_{id}_titleAbstract` ([workflowConfigEditorialOPS.js#L117-L133](https://github.com/pkp/ui-library/blob/99abe2529078b1cf9b8f0d7c0c67c2fce2d2e020/src/pages/workflow/composables/useWorkflowConfig/workflowConfigEditorialOPS.js#L117-L133)). Because `useWorkflowPermissions` sets `canAccessPublication = false` (no editorial role on the active stage), no publication menu items are built and navigation lands nowhere.

### Related scope

- **Other emails & notifications:** Discussion emails are one of several templates using `{$submissionUrl}` (discussion email verified live; other templates verified in code). By contrast, in-app tasks and notifications already use `Repo::submission()->getWorkflowUrlByUserRoles()` and send this user to **My Submissions**.
- **Manager who is a Reviewer (not Author):** The dashboard table hides **View** for them too, but reviewers have no stage assignment row, so `getAccessibleWorkflowStages()` and `DecisionAllowedPolicy` still treat them as Managers on the server. Not tested live; intentionally left out of the fix below.

## Proposed fix

Redirect author-only users inside `PKPDashboardHandler::editorial()` before the page renders, sending them to `Repo::submission()->getWorkflowUrlByUserRoles()` while preserving query parameters ([fix.diff](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/author-editor-editorial-view-refused/fix.diff)):

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

### Why this design

- **Reuses existing rules and destination:** The role check mirrors legacy workflow routes (`getAccessibleWorkflowStages()`), and `getWorkflowUrlByUserRoles()` sends the user to **My Submissions** (or the submission wizard if the submission is incomplete) while preserving `workflowMenuKey` and other query params. `getWorkflowUrlByUserRoles()`'s own code comment already assumes the editorial route turns away unauthorized users (*"If they can't access it, they'll be blocked there"*).
- **Preserves dual-assigned author + editor access:** Unlike `getWorkflowUrlByUserRoles()` (which sends anyone with an Author assignment to **My Submissions**), this gate only redirects when the user holds **no** editorial role on the submission — matching `pkp/pkp-lib#10768`, where a user explicitly assigned as both author and editor keeps editorial access.
- **Handles sub-editors, assistants, and revoked roles cleanly:** Sub-editors and assistants assigned only as Author are redirected as well (they also hit the broken view and don't see the submission in their editorial list). Because `getAccessibleWorkflowStages()` ignores revoked context roles, a user whose Author role was revoked won't be redirected to a **My Submissions** page they cannot access.
- **No new imports:** `Repo`, `Role`, and `PKPRequest` are already imported in `PKPDashboardHandler` on both `main` and `stable-3_5_0`.

### Fix verification

Tested on `main` across OJS, OMP, and OPS:
- Opening the editorial URL (Step 5) as an author given **Journal editor** / **Press editor** / **Preprint Server manager** or **Section editor** / **Series editor** / **Moderator** now redirects cleanly to **My Submissions** in the author view (no **Error** dialog, no decision buttons; OPS opens **Preprint: Title & Abstract**).
- Neighbour checks unchanged: `dbarnes` on the same submission, and the author-editor on another author's submission, both keep the editorial view identically with the fix in or out.

### Alternatives considered

- **Enforce the list's rule in ui-library (show a notice instead of the panel):** Shares one composable with the dashboard table, but waits for the submission API request to finish, requires a frontend rebuild, and leaves the user stranded on the wrong page instead of redirecting them to **My Submissions**.
- **Patch each broken control individually** (gate **Files for Review** and **Post the preprint**, and fix `checkDecisionPermissions()`'s fallback): Requires three changes across two repositories and still leaves the user inside an empty, unusable editorial view.
- **Generate per-recipient URLs in discussion emails** (spec U05 [A16](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U05-notifications-center-and-email-preferences.md#a16), a separate fix for plain authors): Fixes the discussion email link, but leaves direct/bookmarked URLs and other `{$submissionUrl}` emails broken.

### What goes with it

- **API consistency (optional follow-up):** `Schema::checkDecisionPermissions()` still exposes decisions in the REST API's `availableEditorialDecisions` that `DecisionAllowedPolicy` rejects for an author-editor. Once the redirect is in place no screen displays them, but restricting the manager fallback to users with *no* submission assignments would align the two (not tried).
- **Manager-reviewer edge case:** Product decision whether to apply a similar restriction when a manager is assigned as a reviewer, since the backend currently permits them.
- **Backport:** The diff applies cleanly to `stable-3_5_0` without changes.
- **Test coverage:** Add an e2e check verifying that an author with an editorial role is redirected from `dashboard/editorial?workflowSubmissionId=…` to **My Submissions**, while `dbarnes` stays in the editorial view.

**Small:** One helper method in a single shared handler (`PKPDashboardHandler`), reusing two existing backend helpers.

## Evidence

*(Per repo convention, this section stays in `docs/issues/` and is omitted from the GitHub issue body.)*

- **Repro script:** [walk.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/author-editor-editorial-view-refused/walk.js) (helpers in `lib.js`), run on freshly reset default test datasets via:
  ```bash
  PROBE_FEATURE=<feature> PROBE_AGENT=<id> node bin/probe.js all shared/playwright/checks/issues/author-editor-editorial-view-refused/walk.js
  ```
  - Default mode: Steps 4–7 + `dbarnes` control
  - `MODE=mail`: Steps 1–3 (discussion email)
  - `MODE=role ROLE=sub|asst`: Section editor / Moderator and Assistant grants
  - `MODE=nb`: Neighbour check (author-editor on non-authored submissions: OJS #4, OMP #3, OPS #2; plus `dbarnes` on the authored submission)
  - `MODE=keys`: Direct URL with `currentViewId` and stage `workflowMenuKey`
- **Role assignment note:** The script accepts the invitation signed out in a separate browser context. Code review of `UserForm::execute()` ("Edit User" in Users & Roles) confirms it writes the same `Repo::userGroup()->assignUserToGroup()` record as `UserRoleAssignmentReceiveController` (not walked). Active dates are enforced by `UserUserGroup::scopeWithActive()`.
- **Walks completed:**
  - `main` (OJS, OMP, OPS): all modes, PostgreSQL, `pkp/datasets` `5f247d04` (2026-10-20). Bug is database-independent.
  - `stable-3_5_0` (OJS, OMP, OPS): default mode (Steps 4–7 + control).
- **Fix trial (`main`, OJS/OMP/OPS):** Applied with `node bin/try-fix.js apply <fix.diff> ojs omp ops`. Ran default mode, `MODE=keys`, `MODE=role ROLE=sub`, and `MODE=nb` (with fix in and out):
  - `MODE=nb` showed identical views and header buttons with and without the fix (OJS #4 and OMP #3 on "Workflow: Submission", OPS #2 on "Preprint: Title & Abstract", all with "Activity Log"; `dbarnes` on Review Round 1 / Production).
  - `MODE=keys` landed on **My Submissions** at the stage's menu key on OJS/OMP and at **Title & Abstract** on OPS (whose author view has no `workflow_5`); query-param preservation is verified in code (`getWorkflowUrlByUserRoles()` merges `$params`), as the tested keys matched author-view defaults.
  - Assistant role and email link were not re-walked with the fix applied because both hit the same URL and check.
- **Code reads:**
  - `main` & `3.5`: `PKPDashboardHandler`, `DashboardCellSubmissionActions.vue`, `dashboardPageStore.js`, `useWorkflowPermissions.js`, editorial workflow configs, `Repo::user()->getAccessibleWorkflowStages()`, `Repo::submission()->getWorkflowUrlByUserRoles()`, `Schema::getPropertyStages()` / `checkDecisionPermissions()`, app `getAvailableEditorialDecisions()`, `DecisionAllowedPolicy`, `PKPSubmissionFileController::getMany()`, `SubmissionEmailVariable`, and `AnonymizeData` (confirmed reviewer names remain anonymized for this user due to their Author assignment).
  - `3.4` & `3.3`: `pages/dashboard/DashboardHandler.php`, `pages/workflow/PKPWorkflowHandler.php`, `UserAccessibleWorkflowStageRequiredPolicy` (and `.inc.php` equivalents on `3.3`) — no workflow URL on the dashboard, and submission lists route this user to the author dashboard.
- **Git history trace (Introduced):**
  - `pkp/pkp-lib#10768` (*"Redesigned Dashboard & Workflow rc2 - users with multiple roles"*) requested hiding **View** and showing a warning for a Journal Manager assigned as author/reviewer; `pkp/ui-library#547` (`2805cd9d46`) implemented both and `pkp/pkp-lib#11028` (`2a42a379ec`) added the locale text.
  - Earlier origins: URL modal opener in `pkp/ui-library#418` (`619f90a9a3`, for `pkp/pkp-lib#7495`), `editorial()` in `DashboardHandlerNext` (`c867c8cc00`, 2024-04), and `checkDecisionPermissions()` manager fallback in `pkp/pkp-lib#10537` (`af501d2e3d`, 2024-10-22).
- **Upstream search (2026-10-21, `pkp/pkp-lib` & `pkp/ui-library`):** Searched `"not allowed to access these files"`, `"manager author own submission workflow"`, `"editor author same submission decision"`, `noAccessBeingAuthor`, `"workflowSubmissionId author"`, `disallowedDecision`, `"Post the preprint" nothing`, `"author editorial dashboard"`, `checkDecisionPermissions`, `"PKPDashboardHandler redirect"`. Reviewed and ruled out: `pkp/pkp-lib#10670` (legacy workflow URL redirects), `pkp/pkp-lib#12739` and `#12732` (`{$submissionUrl}` for plain authors).
- **Branch tips checked:**

  | Branch | OJS | OMP | OPS | `lib/pkp` | `lib/ui-library` |
  | --- | --- | --- | --- | --- | --- |
  | `main` | `3109a59114` | `5777025be` | `f048e747b4` | `f37a174626` (OJS) / `042726ebf6` (OMP, OPS; same handler) | `99abe252` |
  | `stable-3_5_0` | `1e78ca0c2b` | `cce424e5e` | `5eca7fd603` | `68512b5fda` | `2576e00a` |
  | `stable-3_4_0` | `0012bd1022` | `e30fa7e38` | `0f1e21a117` | `85f47442cf` | — |
  | `stable-3_3_0` | `d7d9dd14ec` | `8e72fc883` | `c5532e2161` | `867ce82d8e` | — |

- **Not driven live:** Journal manager / Production editor (same manager role in code as Journal editor), other `{$submissionUrl}` emails, other decision buttons, **Request Response**, OPS **Decline Submission**, the manager-reviewer case, and `MODE=mail` / `MODE=role` on `3.5`.
