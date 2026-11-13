# Saving a role's window, even unchanged, stops its members saving a published submission's metadata

- **Severity** medium
- **Effort** small
- **Kind** regression
- **Affects**
  - main: OJS, OMP, OPS
  - 3.5: none
  - 3.4: none (code; no Done stage)
  - 3.3: none (code; no Done stage)
- **Introduced** `pkp/pkp-lib#13312` with `pkp/ojs#5816`, `pkp/omp#2459` and `pkp/ops#1398`, for `pkp/pkp-lib#13109` · [65901c4f7a](https://github.com/pkp/pkp-lib/commit/65901c4f7ab46daeeb4767571245177722e35bec), [0dbb274a45](https://github.com/pkp/ojs/commit/0dbb274a45da3ca3f1b90a8220cb465aef7f623d) · 2026-09-10 · Vitaliy Bezsheiko (Vitaliy-1)
- **Upstream** none found (2026-11-13); `pkp/pkp-lib#13109` (closed) gave the roles the Done stage this save takes away
- **Tracked in** spec U54 [A15](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U54-roles-configuration.md#a15)
- **Checked** 2026-11-13, each branch's tip (the commits in Evidence)
- **Model** claude-opus-5-5

## Summary

Roles hold a "Done" stage that no screen shows. It is what lets a
role's members edit a submission once it is published. When a manager
presses "OK" in a role's window under Settings › Users & Roles ›
"Roles", the role loses the Done stage, even if nothing in the window
was changed. The save answers "Your changes have been saved.", and the
role's row and window read as before.

From then on, a member assigned in that role can no longer save a
published submission's metadata, and nobody is told why. "Save" on
"Title & Abstract" answers "An unexpected error has occurred. Please
reload the page and try again." A user in a manager-level role, such as
"Journal editor", can still make the change. No screen gives the role
its Done stage back. A fix to the code alone does not give it back
either.

## Impact

- **Lost**: every change to a published submission's metadata
  ("Title & Abstract", contributors, metadata, funding, references and
  the other publication pages), for the members of each role whose
  window was saved. They can still open the submission.
- **Who**: members assigned in a saved role:
  - journals: Section editor, Guest editor, Designer, Indexer, Layout
    Editor, Proofreader, Author, Translator;
  - presses: Series editor, Volume editor, Chapter Author, the same
    four assistant roles, Author, Translator;
  - preprint servers: Moderator, Author.

  The assistant and author roles lose only what the participant's
  "Permissions" box already allowed them. Authors can edit only an
  unpublished new version. A role a manager creates later never holds
  Done, so its members are refused from the start.
- **Way round**: a user in a manager-level role makes the change.

Medium: the change fails with no clue to the cause, but a manager-level
user can make it. It would be high if a journal had nobody at that
level working on its published submissions.

## Steps to reproduce

Preconditions:

- PKP's default test dataset for OJS `main`, freshly loaded.
  Submission 1, "Signalling Theory Dividends", is published (version
  1.0) and has an unpublished version 1.1. `dbuskins` is assigned to it
  as "Section editor" and `amwandenga` as "Author".
- [OMP: submission 14, "From Bricks to Brains: The Embodied Cognitive
  Science of LEGO Robots", and the role "Series editor". The book has
  only its published version 1.0, so steps 1 and 5 edit that version,
  under the warning "This version has been published. Editing it may
  impact the published content.". No series editor is assigned to the
  book. Sign in as `dbarnes` and open submission 14. Under "Workflow"
  in its menu, choose "Production". In "Participants" press "Assign",
  choose "Series editor", press "Search", choose "David Buskins" and
  press "OK".]
- [OPS: submission 2, "The Facets Of Job Satisfaction: A Nine-Nation
  Comparative Study Of Construct Equivalence", and the role
  "Moderator". The preprint has only its posted version 1.0, so steps 1
  and 5 edit that version, under the same warning. Part B does not
  apply, because an author cannot edit a posted version.]

**A. A Section editor**

1. Sign in as `dbuskins` (password `dbuskinsdbuskins`). Open
   submission 1. It opens on version 1.1's "Title & Abstract". Add
   " u54n13b" to the end of the "Abstract" and press "Save".
2. Sign in as `dbarnes` (password `dbarnesdbarnes`). Go to Settings ›
   Users & Roles and open the "Roles" tab. Look at the "Section editor"
   row.
3. Press the row's arrow, then "Edit". Change nothing and press "OK".
4. Look at the "Section editor" row again, and once more after
   reloading the page.
5. Sign in as `dbuskins`. Open submission 1, add " again" to the
   "Abstract" and press "Save".

**Expected:** step 5 saves as step 1 did.

**Observed:** step 1 shows "Saved". The row at step 2 has Submission,
Review, Copyediting and Production ticked. The window at step 3 shows
"Stage Assignment" with those four boxes ticked, and "OK" closes it with
"Your changes have been saved.". The row reads the same at step 4, on
the page and after the reload. At step 5 the page shows:

```
An unexpected error has occurred. Please reload the page and try again.
```

and the save's request answers:

```
POST /index.php/publicknowledge/api/v1/submissions/1/publications/2   (X-Http-Method-Override: PUT)
401 {"error":"user.authorization.accessibleWorkflowStage","errorMessage":"You don't currently have access to that stage of the workflow."}
```

The abstract keeps step 1's text.

[OMP, OPS: the same. The rows read Submission, Internal Review,
External Review, Copyediting and Production (OMP) and Production (OPS),
the same before and after.]

**B. An Author** (OJS, on a freshly loaded dataset)

1. Sign in as `amwandenga` (password `amwandengaamwandenga`). Open
   submission 1 from "My Submissions". Add " u54n13b" to the end of
   version 1.1's "Abstract" and press "Save".
2. Sign in as `dbarnes`. In Settings › Users & Roles › "Roles", press
   "Edit" on the "Author" row and press "OK" without changing anything.
3. Sign in as `amwandenga` and repeat step 1.

**Expected:** step 3 saves as step 1 did.

**Observed:** step 1 shows "Saved". Step 3 shows "An unexpected error
has occurred. Please reload the page and try again." and its request
answers the same 401 as in part A.

Control: on `stable-3_5_0`, part A takes the same steps and step 5
shows "Saved" in all three apps.

## Cause

`UserGroupForm::_assignStagesToUserGroup()`
(`lib/pkp/controllers/grid/settings/roles/form/UserGroupForm.php`,
lines 356 to 360) deletes every stage the group holds. It then writes
back the stages the window posted:

```php
// Remove all existing stage assignments for this user group
UserGroupStage::query()
    ->withContextId($contextId)
    ->withUserGroupId($userGroupId)
    ->delete();
```

The window cannot post the Done stage (6). Its "Stage Assignment" boxes
come from `WorkflowStageDAO::getWorkflowStageTranslationKeys()`, which
returns only the stages in `Application::getApplicationStages()`
(`lib/pkp/classes/workflow/WorkflowStageDAO.php`, lines 87 to 91). Done
is not among them. The loop that writes the posted stages throws
`Invalid stage id` for any stage outside that list. So every save of an
existing role drops Done. For a manager-level role, `execute()` puts the
same filtered list in place of the posted stages (line 329), so Done is
dropped there too.

Done is what the authorization reads for a published submission.
`StageRolePolicy` checks the stage the submission is in when it is given
no stage, and a published submission is in Done
(`pkp/pkp-lib#12799`). It checks that stage against
`Repo::user()->getAccessibleWorkflowStages()`. That method lists the
stages of each group the user is assigned in, read from the group's
`user_group_stage` rows (`StageAssignment::userGroupStages()`).
`PublicationWritePolicy` requires
`StageRolePolicy([ROLE_ID_SUB_EDITOR, ROLE_ID_ASSISTANT, ROLE_ID_AUTHOR])`.
A member whose group has lost Done is therefore refused with
`user.authorization.accessibleWorkflowStage`.

How it came in: `pkp/pkp-lib#13109` gave groups the Done stage
(`pkp/pkp-lib#13273`, `pkp/ojs#5793`, 2026-09-08). It also added Done to
each app's `getApplicationStages()`, so the window drew a ticked Done
box and a save kept it. `pkp/pkp-lib#13312` and its app PRs
(2026-09-10 to 12) took Done out of `getApplicationStages()` again, to
keep it off the screens, and added `getNonWorkflowStages()`. From then
on, groups held a stage the window no longer offered, and the delete
above removed it.

Reach:

- Every request behind `PublicationWritePolicy` on a published
  submission is refused the same way:
  - in `PKPSubmissionController`: `editPublication`, the contributor
    actions (add, edit, delete, order), `changeLocale` and
    `changeVersion`;
  - the funder, citation, data citation, media file, body text and JATS
    controllers.

  Walked: the "Title & Abstract" save; the rest read in the code. The
  OJS galley grid checks the Production stage, so it is not affected
  (read in the code).
- Assistant and author roles also need the assignment's
  `canChangeMetadata` flag (`PublicationCanBeEditedPolicy`), so they
  lose only what that flag allowed.
- Manager-level roles lose Done too. Their members still pass, through
  `StageRolePolicy`'s manager branch. The decisions on a Done submission
  have their own fallback for assigned editors (`DecisionAllowedPolicy`;
  OJS's `getAvailableEditorialDecisions()`). Read in the code.
- The row's stage boxes on the "Roles" list (`assignStage`,
  `unassignStage`) touch only the stage pressed, so they keep Done.
  Read in the code.
- Installs upgraded to `main` with more than one journal (press,
  server) may not show the fault for the roles that existed at the
  upgrade. `I13109_PermitPublishedMetadataEdit` writes a Done row for
  every group in every context. The form deletes only the rows of the
  group's own context, and `StageAssignment::userGroupStages()` joins on
  the group alone, so the other contexts' rows still grant Done. Fresh
  installs and single-context upgrades show it, as walked. Read in the
  code; writing rows under other contexts is a fault of the migration
  in its own right.

## Proposed fix

Let the window replace only the stages it offers
([fix.diff](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/role-save-drops-done-stage/fix.diff)):

```diff
-        // Remove all existing stage assignments for this user group
+        // Remove the user group's assignments to the stages this form offers. Stages it
+        // does not offer (Done, see Application::getNonWorkflowStages()) are kept.
         UserGroupStage::query()
             ->withContextId($contextId)
             ->withUserGroupId($userGroupId)
+            ->withStageIds(array_keys($stages))
             ->delete();
```

`$stages` is the list the window draws its boxes from, and
`UserGroupStage::scopeWithStageIds()` already exists. The change sits in
the one method that writes a group's stages from the window, so it also
covers manager-level roles.

With the fix in, part A on OJS, OMP and OPS `main` and part B on OJS
kept every stored stage, Done included, and the last save showed
"Saved". Two other saves stored the same with and without the fix:

- ticking "Production" in the "Copyeditor" window stored Copyediting
  and Production (OJS, OMP);
- a role created at the Section Editor (Moderator) level with one stage
  ticked stored that stage alone.

For the team to decide: under this fix a role keeps Done after a
manager unticks "Production", since no box governs Done.

**Alternatives**

- Offer Done as a box in "Stage Assignment". `pkp/pkp-lib#13312` took
  Done off the screens on purpose, so this is a product decision.
- Let `StageRolePolicy` accept Production in place of Done. This
  changes the authorization `pkp/pkp-lib#13109` designed, for every
  caller.

**What goes with it**

- The fix stops the loss but does not restore Done to roles already
  saved. No release carries the fault, so only installs that have run
  `main` since `pkp/pkp-lib#13312` (merged 2026-09-12) need a repair. An upgrade from 3.5 that runs
  after the fix gets Done from the migration and keeps it.

  The repair below gives Done back by the upgrade's own rule, scoped to
  each group's context. That rule covers every manager, sub-editor and
  author group, and the Designer, Layout Editor, Indexer and Proofreader
  groups. The registries give Done instead to the groups that hold
  Production. The two differ only for groups a journal created itself,
  and for "Journal manager", which the rule includes and the registry
  does not:

  ```sql
  INSERT INTO user_group_stage (context_id, user_group_id, stage_id)
  SELECT ug.context_id, ug.user_group_id, 6 FROM user_groups ug
  WHERE (ug.role_id IN (16, 17, 65536)
      OR (ug.role_id = 4097 AND EXISTS (SELECT 1 FROM user_group_settings s
          WHERE s.user_group_id = ug.user_group_id AND s.setting_name = 'nameLocaleKey'
          AND s.setting_value IN ('default.groups.name.designer', 'default.groups.name.layoutEditor',
              'default.groups.name.indexer', 'default.groups.name.proofreader'))))
  AND NOT EXISTS (SELECT 1 FROM user_group_stage d WHERE d.user_group_id = ug.user_group_id
      AND d.context_id = ug.context_id AND d.stage_id = 6);
  ```
- Not covered by this fix, the same gap on other paths:
  - A role created in the window never gets Done. Which new roles
    should get it is for the team to decide.
  - The users import (`NativeXmlUserGroupFilter`) keeps imported stages
    only up to `WORKFLOW_STAGE_ID_PRODUCTION`. `pkp/pkp-lib#13312`
    widened the same bound to `WORKFLOW_STAGE_ID_DONE` in
    `Repo::userGroup()->installSettings()`.
- Guard: an e2e scenario that saves the "Section editor" window, then
  saves a published submission's "Title & Abstract" as an assigned
  Section editor. A unit test of the form could check that a save keeps
  a stored Done stage.

Small: one line in one form. The only repair is for installs of an
unreleased branch, and it is the SQL above rather than a migration.

## Evidence

- Kept script, with its helpers in `lib.js` beside it:
  [walk.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/role-save-drops-done-stage/walk.js).
  It walks parts A and B; `MODE=nb` walks the two saves the fix must
  leave alone. Command:
  `PROBE_FEATURE=<feature> PROBE_AGENT=<id> node bin/probe.js all shared/playwright/checks/issues/role-save-drops-done-stage/walk.js`
  (`PKP_E2E_LINE=stable-3_5_0` in front for 3.5).
- Walked on OJS, OMP and OPS, `main` and `stable-3_5_0`, PHP 8.3 and
  PostgreSQL; the fault does not depend on the database. Datasets:
  pkp/datasets d141ec4b (2026-11-12). The stored stages
  (`user_group_stage`) on `main`:
  - OJS "Section editor" and "Author": 1,3,4,5,6 to 1,3,4,5;
  - OMP "Series editor": 1,2,3,4,5,6 to 1,2,3,4,5;
  - OPS "Moderator": 5,6 to 5.

  Each save posted the stages shown (`assignedStages[]`) and answered
  200. On 3.5 the stored stages were the same before and after (no
  Done), and step 5 saved on all three apps. Part B could not be taken
  on 3.5: there the author's "Save" on version 1.1 is greyed before any
  role save, which is the behaviour `pkp/pkp-lib#13109` changed on
  `main`.
- Not driven: the multi-context upgrade case (read in the code).
- Unverified: whether anything other than `StageRolePolicy` (through
  `PublicationWritePolicy`) reads a role's Done stage in a way a member
  would notice.
- Tips: OJS `main` 3c99722dc8, OMP `main` 61df357b9, OPS `main`
  c74e5bf190 (lib/pkp ad75b174f0, lib/ui-library 51f9eaa1);
  `stable-3_5_0` OJS 7cf6c9c60f, OMP 3f0fd0a7d, OPS e290d8d8af (lib/pkp
  5af8e67ab4); pkp-lib `stable-3_4_0` 2dd24cc5ae, `stable-3_3_0`
  df738d3a66; OJS `stable-3_4_0` 61835656a2, `stable-3_3_0` b83fb9e44d.
- Code reads:
  - `main`:
    - the form: `UserGroupForm::initData()`, `execute()` and
      `_assignStagesToUserGroup()`;
      `WorkflowStageDAO::getWorkflowStageTranslationKeys()`;
      `PKPApplication::getNonWorkflowStages()` and `getValidStages()`;
      `UserGroupGridHandler::_toggleAssignment()`;
    - the authorization: `StageRolePolicy`, `PublicationWritePolicy` and
      their callers (`PKPSubmissionController::$requiresPublicationWriteAccess`
      and the six other controllers); `Repo::user()->getAccessibleWorkflowStages()`
      and `StageAssignment::userGroupStages()`;
      `PublicationCanBeEditedPolicy`; `DecisionAllowedPolicy`'s Done
      fallback;
    - how groups get Done: `Repo::userGroup()->installSettings()`;
      `NativeXmlUserGroupFilter`; the migration
      `I13109_PermitPublishedMetadataEdit` (`roleUpdateMap()`, the
      insert for every context); the three apps' `registry/userGroups.xml`
      (Done on 10 OJS groups, 11 OMP, 3 OPS).

    The form is the same file in the three apps' pkp-lib.
  - 3.5: no `WORKFLOW_STAGE_ID_DONE`; the registry's groups stop at
    stage 5; the same delete-all in `_assignStagesToUserGroup()`, which
    loses nothing there.
  - 3.4 and 3.3: no `WORKFLOW_STAGE_ID_DONE` in pkp-lib's classes, and
    no stage 6 in the OJS registry.
  - The trace:
    1. `git blame` on lines 356 to 360 gives 714d5d5aa4 (the Eloquent
       refactor), which kept the delete-all of the code before it.
    2. The line went wrong when a group could hold a stage the window
       did not offer. 3bfe1f9f68 (OJS, `pkp/ojs#5793`) put Done in the
       registry and in `Application::getApplicationStages()`, so the
       window still offered it.
    3. 0dbb274a45 (OJS, 2026-09-10, "Remove DONE stage from Application
       stages") took it out of `getApplicationStages()`, as did OMP
       ce63a5cd8 and OPS 97d8a0d2e8 (2026-09-12), with pkp-lib
       65901c4f7a (`getNonWorkflowStages()`, Done stored on fresh
       installs).
    4. GitHub's `commits/<sha>/pulls` names `pkp/pkp-lib#13312` and
       `pkp/ojs#5816` (merged 2026-09-12). The OMP and OPS PRs are
       `pkp/omp#2459` and `pkp/ops#1398`, which the issue lists.
- Upstream: pkp/pkp-lib, pkp/ojs, pkp/omp, pkp/ops and pkp/ui-library
  were searched (2026-11-13) by the symptom (done stage role, role edit
  removes stage, section editor cannot edit published metadata) and by
  `UserGroupForm`, `_assignStagesToUserGroup`, `getNonWorkflowStages`.
  `pkp/pkp-lib#13109` and its PRs were read, comments included: none of
  them mentions the role window.
