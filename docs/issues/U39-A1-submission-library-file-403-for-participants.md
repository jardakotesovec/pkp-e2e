# Assistants, and a preprint's moderator and author, get a bare "403 Forbidden" page for Submission Library files

- **Severity** medium
- **Effort** small
- **Kind** defect
- **Affects**
  - main: OJS, OMP, OPS
  - 3.5: OJS, OMP, OPS
  - 3.4: OJS, OMP (code)
  - 3.3: OJS, OMP (code)
- **Introduced** not traced; present since at least [669d0aba9b](https://github.com/pkp/pkp-lib/commit/669d0aba9b7caaffe6df4acebaa9580394ed4e14) (2013-03-11). On a preprint server since `pkp/ops#858` for `pkp/pkp-lib#10874`, which moved OPS's roles off stage 1 · [012e900283](https://github.com/pkp/ops/commit/012e9002836356a50769792eb1368b36e98aacaf) · 2025-02-03 · Vitalii Bezsheiko (Vitaliy-1)
- **Upstream** none found (2026-10-07): no pkp issue or PR reports this
  fault. `pkp/pkp-lib#13432` (open; commits titled "Ensure consistent
  library file policy checks") is other work on the same method, which
  left this check as it was (Cause); the fix proposed here fits its
  theme and could go in under it
- **Tracked in** spec U39 [A1](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U39-submission-and-publisher-libraries.md#a1)
- **Checked** 2026-10-07, each branch's tip (the commits in Evidence)
- **Model** claude-opus-5-5

Update 2026-10-07: the method that holds the check moved to another
class on `main` and `stable-3_5_0` (Cause), so the Cause, the fix and the
backport notes name its new place. The recommended fix now asks the same
method as the window's own access rule, in place of the one-line change
first proposed, so that the download and the window cannot disagree.

## Summary

The "Submission Library" window opens for every workflow participant and
lets each of them add, edit and delete its files. But an assigned person
whose role has "Submission" unticked under "Stage Assignment" (Settings ›
Users & Roles › Roles) is sent from the workflow screen to a bare page
reading "403 Forbidden" when they press a file's name, even for a file they
added themselves. By default that is the Copyeditor, Layout Editor,
Proofreader, Designer, Indexer and Marketing and sales coordinator, and on
a press also the Chapter Author.

No preprint server role can be given the Submission stage: the box is not
there. So on a preprint server the Moderator and the preprint's own Author
are refused every Submission Library file, and only the Preprint Server
manager can read them. This began with 3.5, on new and upgraded servers
alike; on 3.4 both could download. A Moderator's "Download" under
"Library Files" on a decision email opens a new tab reading "403
Forbidden".

Nothing is lost. The file has to reach these people some other way, such
as a discussion.

## Impact

- **Lost**: no data. The person loses their place on the workflow screen
  to a page that does not explain the refusal.
- **Who**: on a journal or press, the assistants assigned to a submission
  in copyediting and production, whenever an editor uses the Submission
  Library to share a contract, permission or report with them. On a
  preprint server, every Moderator and every Author, on every preprint.
- **Way round**: on a journal or press the editor or Section editor, who
  can read the file, attaches a copy to a discussion; or a manager ticks
  "Submission" for the role, which also opens the Submission stage to that
  role and offers it there under "Assign Participant". On a preprint server
  only the Preprint Server manager can read the file, so the manager has to
  do it. The Moderator cannot hand the file on, and is refused even the
  files they uploaded to the window themselves.

Medium: reading Submission Library files fails for whole roles, with a
visible refusal and a way round on screen. On a preprint server it fails
for everyone but the manager, which is close to "fails for everyone"; it
stays medium because the manager can still hand files over in a
discussion and the Submission Library is an optional way to share files.
It would be high if preprint servers relied on it to exchange files with
authors.

## Steps to reproduce

Preconditions:

- The default dataset, OJS, OMP or OPS, `main` or `stable-3_5_0`. Nothing
  else is needed. The
  steps use one submission in Production, with the people already assigned
  to it:
  - OJS: submission 5, "Genetic transformation of forest trees". Maria
    Fritz (`mfritz`, Copyeditor) and Graham Cox (`gcox`, Layout Editor) are
    assigned; so are the author Diaga Diouf (`ddiouf`) and the Section
    editor David Buskins (`dbuskins`).
  - OMP: submission 4, "How Canadians Communicate: Contexts of Canadian
    Popular Culture". `mfritz` (Copyeditor) and `gcox` (Layout Editor) are
    assigned, and the author Bart Beaty (`bbeaty`).
  - OPS: preprint 1, "The influence of lactation on the quantity and
    quality of cashmere production". David Buskins (`dbuskins`, Moderator)
    and the author Carlo Corino (`ccorino`) are assigned.
- A PDF named "article.pdf" ("preprint.pdf" on OPS) to upload.

The editor adds a file:

1. Sign in as `dbarnes` and open the submission from the dashboard
   (`/index.php/publicknowledge/en/dashboard/editorial?workflowSubmissionId=5`;
   4 on OMP, 1 on OPS).
2. Press "Library" in the workflow header.
3. In "Submission Library" press "Add a file". Name "u39a agreement", Type
   "Permissions", upload the PDF, "OK".
4. Press "u39a agreement". Sign out.

An assigned assistant (OJS, OMP) or the Moderator (OPS):

5. Sign in as `mfritz` (OPS: `dbuskins`), open the same submission, press
   "Library".
6. Press "u39a agreement".
7. Open the submission again, "Library", "Add a file": Name "u39a own
   note", Type "Other", upload the PDF, "OK". Press "u39a own note".
8. OJS, OMP: sign in as `gcox`, open the submission, "Library", press
   "u39a agreement".

The author of a preprint (OPS):

9. Sign in as `ccorino`, open preprint 1 from My Submissions
   (`/index.php/publicknowledge/en/dashboard/mySubmissions?workflowSubmissionId=1`),
   "Library", press "u39a agreement".

The Moderator's decision email (OPS):

10. Sign in as `dbuskins`, open preprint 1 and press "Decline Submission".
    In the email press "Attach Files", then "Attach Library Files", and
    press "Download" on the "u39a agreement" row.

**Expected.** Each person sees the window list "u39a agreement" (and,
after step 7, "u39a own note") with "Add a file" and each row's "Edit" and
"Delete". Each press downloads the file ("article-PER.pdf",
"article-OTH.pdf"; "preprint-…" on OPS) and the page stays where it was.

**Observed.** Steps 4 and the window reads of steps 5, 8 and 9 are as
expected: "Add a file" works for everyone and every row offers "Edit" and
"Delete". `dbarnes` downloads. In steps 6, 7, 8 and 9 the workflow screen
is replaced by a page whose whole text is:

```
403 Forbidden
```

at `/index.php/publicknowledge/$$$call$$$/api/file/file-api/download-library-file?libraryFileId=1&submissionId=5`
(`libraryFileId=2` for the person's own file in step 7). In step 10 a new
tab opens with the same page while the email stays open.

Control: on OJS the author `ddiouf` and the Section editor `dbuskins`, and
on OMP the author `bbeaty`, take steps 5 and 6 and the file downloads.

## Cause

Both download links, the file's name in the list
(`DownloadLibraryFileLinkAction`) and "Download" in the email's "Library
Files" (`PKPLibraryController::fileToResponse()`), go to
`FileApiHandler::downloadLibraryFile()` (lib/pkp
`controllers/api/file/FileApiHandler.php`). For a file that belongs to a
submission, that method lets through a manager or site administrator, and
otherwise only a user returned by this query (line 177):

```php
$assignedUsers = Repo::user()->getCollector()
    ->assignedTo($libraryFile->getSubmissionId(), WORKFLOW_STAGE_ID_SUBMISSION)
    ->getMany();
```

`assignedTo()` with a stage keeps a user only when their assignment's user
group is linked to that stage in `user_group_stage`
(`Collector::buildSubmissionAssignmentsFilter()`). The default groups of
the Copyeditor and Marketing and sales coordinator work on Copyediting
only; the Layout Editor, Proofreader, Designer and Indexer on Production
(and the Done state); OMP's Chapter Author on Copyediting and Production
(`registry/userGroups.xml`). On OPS the manager, Moderator and Author
groups have `stages="5,6"` (Production and Done) since `pkp/ops#858`
removed stage 1, which a preprint server does not have. The same PR's
upgrade migration, `I10874_UserGroupStagesRemoveSubmission` (1228378516),
deletes every stage 1 row of `user_group_stage`, so a server upgraded
from 3.4 is hit like a new install.

The window itself follows another rule. `DocumentLibraryHandler` (the
"Library" window) and `SubmissionDocumentsFilesGridDataProvider` (its
list, "Add a file", "Edit", "Delete") authorize through
`SubmissionAccessPolicy`, which admits anyone assigned to the submission
in any stage.

The check has been in pkp-lib since at least 2013 (669d0aba9b). It was
moved, unchanged in meaning, into `LibraryFileHandler` in 2018
(`pkp/pkp-lib#520`, 56773e14d6) and back into `FileApiHandler` on `main`
and `stable-3_5_0` on 2026-10-06 (`pkp/pkp-lib#13432`, e60013c77f and
0ed26dd8a7). On `stable-3_4_0` and `stable-3_3_0` it is still in
`LibraryFileHandler::downloadLibraryFile()`, which `FileApiHandler` calls.
On a preprint server the Moderator and the Author passed it on 3.4 and
earlier, and are refused since 3.5.

The two preprint-server reports that name this line in their reach
([U35 OPS3](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/issues/U35-OPS3-moderator-assigned-email-never-sent.md),
[U21 OPS3](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/issues/U21-OPS3-author-cancel-draft-does-nothing.md))
have another cause: their queries are right on a journal or press, where
this one is not.

Reach:

- Both download links (walked: the list on all three apps, the email's
  "Library Files" on OPS).
- Publisher Library files are not affected: they have no submission and
  skip the check (walked: "View Document Library" downloads for the Layout
  Editor and the Moderator).
- No other `assignedTo(…, WORKFLOW_STAGE_ID_SUBMISSION)` exists in lib/pkp
  or the three apps (search on `main`).

## Proposed fix

Proposed: allow the download when the submission's workflow is open to
the person in any stage, by asking the method the window's own
`SubmissionAccessPolicy` asks, `Repo::user()->getAccessibleWorkflowStages()`.
[fix.diff](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/submission-library-file-403-for-participants/fix.diff),
one diff for all three apps:

```diff
--- a/lib/pkp/controllers/api/file/FileApiHandler.php
+++ b/lib/pkp/controllers/api/file/FileApiHandler.php
-            // Check for specific assignments.
-            $assignedUsers = Repo::user()->getCollector()
-                ->assignedTo($libraryFile->getSubmissionId(), WORKFLOW_STAGE_ID_SUBMISSION)
-                ->getMany();
-
-            $user = $request->getUser();
-            foreach ($assignedUsers as $assignedUser) {
-                if ($assignedUser->getId() == $user->getId()) {
-                    $allowedAccess = true;
-                    break;
-                }
+            // Anyone the submission's workflow is open to, in any stage: the
+            // rule of the Submission Library list itself (SubmissionAccessPolicy).
+            $submission = Repo::submission()->get((int) $libraryFile->getSubmissionId(), $context->getId());
+            if ($submission && Repo::user()->getAccessibleWorkflowStages($request->getUser()->getId(), $context->getId(), $submission, $userRoles)) {
+                $allowedAccess = true;
             }
```

The method's comment says what it guards: "ensure that the current user
has access to that submission". The policy that opens the window decides
that access through `UserAccessibleWorkflowStageRequiredPolicy` and
`SubmissionAuthorPolicy`, and both admit a person for whom
`getAccessibleWorkflowStages()`, given the person's roles in the journal,
returns any stage. The download now asks the same question, so it follows
the window's rule and reaches no further than the window does (code).
Reviewers have no stage assignment and stay refused, as do people removed
from the submission.

Tried on OJS, OMP and OPS `main`. With the fix, every press in steps 4 to
10 downloads the file and the page stays. Removing a person from the
submission still takes the download away: with the fix, a Layout Editor
(OPS: the Moderator) removed under "Participants" while their "Submission
Library" window was open got "403 Forbidden" on "u39a agreement", and
Publisher Library files under "View Document Library" still downloaded.

**Alternatives**

- Drop the stage argument of `assignedTo()`, one line, which this report
  proposed first: it gave the same downloads in the same walk, but it
  keeps a second rule beside the policy's, and `assignedTo()` checks less
  than the policy does. The fix above asks the policy's own method
  instead.
- The application's first stage, as `pkp/pkp-lib#10883` did elsewhere:
  this fixes the preprint server only, and journal and press assistants
  stay refused files the window lets them add, edit and delete.
- Authorize the download with `SubmissionAccessPolicy` in
  `FileApiHandler::authorize()` when a `submissionId` is sent, and have
  `downloadLibraryFile()` check that the file belongs to that submission
  and refuse a submission's file requested without a `submissionId`
  (`authorize()` then adds only `ContextAccessPolicy`). That leaves one
  rule in one place, but it is a larger change to a handler that other
  file downloads share. It is the better choice if the team wants the
  policy itself here.
- Tick the Submission stage for these roles in `registry/userGroups.xml`:
  this would list assistants as Submission-stage participants, and is not
  possible on OPS.

**What goes with it**

- No stored data is wrong and no API changes. More people can download:
  those the window already opens for, and lets add, edit and delete
  these files.
- Backport: the diff applies as written to `stable-3_5_0` (the same
  lines, from 169). On `stable-3_4_0` the check is still in
  `LibraryFileHandler::downloadLibraryFile()`
  (`pages/libraryFiles/LibraryFileHandler.php`, from line 101), where the
  same lines change; `Repo::submission()->get()` and
  `Repo::user()->getAccessibleWorkflowStages()` have the same signatures
  there, and `$userRoles` is set only when the method has a calling
  handler, so it needs a default of `[]`. On 3.3 the method is
  `Services::get('user')->getAccessibleWorkflowStages()` and the check is
  at line 82 of `LibraryFileHandler.inc.php` (3.4 and 3.3 by code, not
  tried).
- The guard: an e2e check in spec U39 that an assigned Copyeditor and, on
  OPS, the Moderator and the Author download a Submission Library file.

Small: a few lines in one pkp-lib method, calling the method the policy
already calls, tried on the three apps, and an e2e check.

## Evidence

- The kept script takes the Steps on all three apps:
  [walk.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/submission-library-file-403-for-participants/walk.js),
  with its helpers in
  [lib.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/submission-library-file-403-for-participants/lib.js).
  `neighbour` as its argument runs only the fix trial's second check (a
  person removed under "Participants" loses the download, and a Publisher
  Library file still downloads). It runs from a pkp-e2e checkout against
  installs freshly loaded from the default dataset:
  `PROBE_FEATURE=<feature> PROBE_AGENT=<id> node bin/probe.js all shared/playwright/checks/issues/submission-library-file-403-for-participants/walk.js [neighbour]`.
  The fix was tried by applying fix.diff to the three apps and running the
  same command, with and without `neighbour`. The one-line alternative
  was tried the same way earlier on 2026-10-07.
- Walked on OJS, OMP and OPS `main` and `stable-3_5_0`, on PostgreSQL;
  nothing here depends on the database. Datasets: pkp/datasets a130b9a
  (2026-10-07).
- Tips: `main` OJS 3265fdc673, OMP 0c6a3ebed1 and OPS 8ae6c68e04 (lib/pkp
  f8285b0b8f, ui-library 7503fab4); `stable-3_5_0` OJS 6d2a42555d, OMP
  5861ebee10 and OPS 6a8f83586c (lib/pkp 6910ca6d8e); `stable-3_4_0` OJS
  d68934d0d1, OMP 0aec65441, OPS acd8ae704b (lib/pkp 767353f4fe);
  `stable-3_3_0` OJS ac77c9fb35, OMP 8e72fc883, OPS c5532e2161 (lib/pkp
  ac3fa73402).
- Code reads:
  - `main`: `FileApiHandler::authorize()` and `downloadLibraryFile()`,
    `Collector::assignedTo()` and `buildSubmissionAssignmentsFilter()`,
    `DocumentLibraryHandler` (its roles and `authorize()`),
    `SubmissionDocumentsFilesGridDataProvider::getAuthorizationPolicy()`,
    `SubmissionAccessPolicy`, `UserAccessibleWorkflowStageRequiredPolicy`,
    `SubmissionAuthorPolicy` and
    `Repo::user()->getAccessibleWorkflowStages()`, `PKPLibraryController`
    (the email's "Download" address), the three apps'
    `registry/userGroups.xml`, OPS's
    `I10874_UserGroupStagesRemoveSubmission` and its line in
    `dbscripts/xml/upgrade.xml` (on `main` and `stable-3_5_0`), and a
    search of lib/pkp and the apps for `assignedTo(` with
    `WORKFLOW_STAGE_ID_SUBMISSION`.
  - Introduced: `git blame` on line 177 gives the move (e60013c77f);
    before it, b08f469765 (`pkp/pkp-lib#7127`) and 858b24f31f
    (`pkp/pkp-lib#8092`) only rewrote the call. 669d0aba9b ("introduce
    base PKP file api handler class", Jason Nugent) is the oldest commit
    read that holds the check. OPS 012e900283 changed the groups from
    `stages="1,5"` to `stages="5"`; 1228378516 is the migration, in the
    same PR.
  - `pkp/pkp-lib#13432`: its issue text was read against this fault and
    is about something else. Its commits per branch, from each branch's
    log for the two files: `main` e60013c77f and `stable-3_5_0`
    0ed26dd8a7, each after an earlier merge and its revert on 2026-10-02
    (c530748391 and bf20528ed1; 3f26cd7b1e and 5af94e3ff6);
    `stable-3_4_0` 034fd831b2 (2026-10-02).
  - 3.5 (walked): the same method in `FileApiHandler`, the query at line
    171, in the lib/pkp tip, and the same
    `getAccessibleWorkflowStages()`; OJS copyeditor `stages="4"`, layoutEditor
    `"5"`; OPS manager, sectionEditor and author `stages="5"`.
  - 3.4 (code): lib/pkp `origin/stable-3_4_0` has the same query at line
    103 of `pages/libraryFiles/LibraryFileHandler.php`. OJS and OMP give the
    Copyeditor and Marketing `stages="4"` and the Layout Editor,
    Proofreader, Designer and Indexer `"5"` (OMP Chapter Author `"4,5"`),
    so they are refused. OPS gives its three groups
    `stages="1,5"`, so its Moderator and Author pass. The Submission
    Library grid admits `ROLE_ID_ASSISTANT`, and the workflow page shows
    "Library" to everyone (OJS `templates/workflow/workflow.tpl`).
  - 3.3 (code): lib/pkp `origin/stable-3_3_0`'s
    `LibraryFileHandler.inc.php` calls
    `getUsersBySubmissionAndStageId(…, WORKFLOW_STAGE_ID_SUBMISSION)`; the
    stage sets and the grid's roles are as on 3.4.
- Upstream searches (2026-10-07): pkp/pkp-lib, pkp/ojs, pkp/omp, pkp/ops
  and pkp/ui-library, by symptom words ("submission library 403", "library
  file forbidden", "submission library download") and by
  `downloadLibraryFile` and `assignedTo` with `WORKFLOW_STAGE_ID_SUBMISSION`.
- Not driven: the Proofreader, Designer, Indexer, Marketing and sales
  coordinator and OMP's Chapter Author (refused by the same stage sets,
  read in the code); attaching a library file to an email. Ticking
  "Submission" was not driven here; spec U39's own probe (footnote d,
  2026-09-24) drove it on OJS and OMP, and the assigned Copyeditor then
  downloaded.
- Unverified: MySQL; 3.4 and 3.3 rest on the code read, the backport
  lines included. That the download and the window agree beyond the
  roles of the Steps rests on the code read (both ask
  `getAccessibleWorkflowStages()`).
