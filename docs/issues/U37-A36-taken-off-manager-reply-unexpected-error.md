# A manager's reply after being taken off a discussion gets "An unexpected error has occurred" instead of the reason

- **Severity** low
- **Effort** small
- **Kind** defect
- **Affects**
  - main: OJS, OMP, OPS
  - 3.5: none
  - 3.4: none (code)
  - 3.3: none (code)
- **Introduced** `pkp/pkp-lib#11828` for `pkp/pkp-lib#11701` · [b898737294](https://github.com/pkp/pkp-lib/commit/b8987372949baa561955d8cd1adbac78042905d0) · committed 2025-09-15, merged 2025-09-22 · Vitaliy Bezsheiko (Vitaliy-1)
- **Upstream** none found (2026-10-09)
- **Tracked in** spec U37 [A36](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U37-tasks-and-discussions.md#a36)
- **Checked** 2026-10-09, each branch's tip (the commits in Evidence)
- **Model** claude-opus-5-5

## Summary

A manager-level user (a Journal Manager or Journal Editor, or the same
level on a press or a preprint server) has a discussion's window open.
Someone else opens the discussion's "Edit", unticks them as a
participant and saves. Their "Add New Message" › "Save" in the window
still open then shows "Error" with "An unexpected error has occurred.
Please reload the page and try again.". The reply is not saved, which is
right, since only participants may reply; they are not told that.

The server does not fail. It refuses the reply, in a form the page
cannot show, and writes one error line to its log for each try. "OK"
closes "Error" and the typed reply is still in its box, so it can be
copied before the reload. After a reload the window says what to do: "To
add a new message, please assign yourself as a participant.".

It happens only in a window opened before the untick, for as long as
that window stays open; a window opened afterwards has that line in
place of the button. A Section Editor or a Copyeditor taken off the same
way is told why: "You do not have permission to modify this
discussion.". On 3.5 the same reply is saved, because a reply there
makes its writer a participant again.

## Impact

- **Lost**: nothing, when the reply is copied first. A user who follows
  the message and reloads loses the text they typed.
- **Who**: a manager-level user replying from a window that was already
  open when they were unticked. A tab left open stays in that state
  until the window is closed or the page reloaded.
- **Way round**: press "OK", copy the reply, reload, tick themselves in
  the discussion's "Edit" and post the reply.

Low: a right refusal shown with the wrong reason, and the typed reply
can be kept. Its one cost falls on the user who does what the message
says and reloads before copying.

## Steps to reproduce

Preconditions:

- PKP's default test dataset for OJS `main`, freshly loaded. Nothing
  else: `dbarnes` is the Journal editor and `rvaca` the Journal manager.
- Two browsers (or one browser and a private window), so that both are
  signed in at once.
- Journal: submission 3, "The Facets Of Job Satisfaction: A Nine-Nation
  Comparative Study Of Construct Equivalence", in Copyediting. [Press:
  submission 7, "Accessible Elements: Teaching Science Online and at a
  Distance", in Copyediting. Preprint server: submission 1, "The
  influence of lactation on the quantity and quality of cashmere
  production", in Production.]

1. Browser 1: sign in as `dbarnes` (password `dbarnesdbarnes`) and open
   the submission at its "Copyediting" stage [preprint server:
   "Production"].
2. Under "Copyediting Tasks & Discussions" [preprint server: "Production
   Tasks & Discussions"] press "Add". Name it "Reference check hkrg".
   "Daniel Barnes (dbarnes) (Me)" is ticked already; also tick "David
   Buskins (dbuskins)" and "Maria Fritz (mfritz)" [press:
   "Maria Fritz (mfritz)" and "Dietmar Kennepohl (dkennepohl)"; preprint
   server: "David Buskins (dbuskins)" and "Stephanie Berardo
   (sberardo)"]. Type "Please check the references." in the message box
   and press "Save".
3. Press the row's name, "Reference check hkrg". Its window opens; leave
   it open.
4. Browser 2: sign in as `rvaca` (password `rvacarvaca`) and open the
   same submission and stage. Open the row's "More Actions", press
   "Edit", untick "Daniel Barnes (dbarnes)" and press "Save".
5. Browser 1, in the window still open: press "Add New Message", type
   "References checked." and press "Save".
6. Press "OK". Then reload the page and press the row's name again.

The control, a participant who is not manager-level (after step 6, or on
a freshly loaded dataset):

7. Browser 1 (`dbarnes`): press "Add" again, name it "Control hkrg",
   tick the same two people, type the same message and press "Save".
8. Browser 2: sign out and sign in as `dbuskins`, a Section editor
   (password `dbuskinsdbuskins`) [press: `mfritz`, a Copyeditor;
   preprint server: `dbuskins`, a Moderator]. Open the same submission
   and stage and press the row's name, "Control hkrg". Leave the window
   open.
9. Browser 1: open the "More Actions" of "Control hkrg", press "Edit",
   untick "David Buskins (dbuskins)" [press: "Maria Fritz (mfritz)"] and
   press "Save".
10. Browser 2, in the window still open: press "Add New Message", type
    "References checked." and press "Save".
11. Press "OK" and reload the page.
12. Browser 2: sign out and sign in as `mfritz`, who is still ticked
    [press: `dkennepohl`, the Author, at
    `/index.php/publicknowledge/en/dashboard/mySubmissions?workflowSubmissionId=7&workflowMenuKey=workflow_4`;
    preprint server: `sberardo`]. Open the same stage, press "Control
    hkrg", then "Add New Message", type a reply and press "Save".

The window opened after the untick (after step 6): in browser 1 add a
third discussion as in step 2, named "Late check hkrg", and open no
window. In browser 2 take step 4 on it. Only then press its name in
browser 1, without reloading the page.

[3.5, where the fault does not show: the panel is the stage's
"Copyediting Discussions" list (preprint server: "Production
Discussions"); "Add discussion" has "Subject" where `main` has "Name";
"Edit" is in the row's settings; the window's button is "Add Message",
saved with "OK". On the 3.5 preprint server rvaca's "Edit" lists no box
for Daniel Barnes, who is not assigned to the preprint. The form stores
only the ticked boxes, so pressing "OK" in step 4 with nothing unticked
takes him off all the same.]

**Expected:** step 5 refuses the reply and says why, as the window does
after a reload: "To add a new message, please assign yourself as a
participant.".

**Observed:** step 5 opens a window titled "Error" with "An unexpected
error has occurred. Please reload the page and try again." and "OK". The
reply is not saved. The request is refused, not failed:

```
POST /index.php/publicknowledge/api/v1/submissions/3/tasks/2/notes   422
{"userId":["The selected user id is invalid."]}
```

and the server log gains one line:

```
production.ERROR: The selected user id is invalid. {"exception":"[object] (Illuminate\\Validation\\ValidationException(code: 0): The selected user id is invalid. at …/lib/pkp/lib/vendor/laravel/framework/src/Illuminate/Foundation/Http/FormRequest.php:168)
```

In step 6, "OK" closes "Error"; the discussion's window is still open,
"References checked." is still in the message box and "Save" is active.
After the reload the window lists the one message, "Message from
dbarnes", and in place of "Add New Message" reads "To add a new message,
please assign yourself as a participant.".

The control: step 10 opens "Error" with "You do not have permission to
modify this discussion." (the request answers 401), and after step 11
"Control hkrg" is no longer listed for that person. The reply of step 12
is saved.

The window opened after the untick has no "Add New Message"; it reads
"To add a new message, please assign yourself as a participant." at
once.

## Cause

The server refuses rightly; the page cannot show what it answers. Only a
participant may reply, and a manager-level user who is not one still
reaches the reply's endpoint: `QueryAssignedToUserAccessPolicy`
(`lib/pkp/classes/security/authorization/internal/QueryAssignedToUserAccessPolicy.php`)
lets a user with a manager role, or a site administrator, through to
every discussion of a stage they can open. Everyone else who is not a
participant is refused there with `user.authorization.submissionQuery.edit`,
"You do not have permission to modify this discussion.".

For the manager the request then fails validation. `AddNote::rules()`
(`lib/pkp/api/v1/submissions/tasks/formRequests/AddNote.php`, lines
55–61) checks `userId` with `Rule::exists('edit_task_participants',
'user_id')` for the task. The client never sends `userId`:
`prepareForValidation()` sets it to the signed-in user. So the rule is a
permission check written as the validation of a field, and its failure
is a 422 that names a field no form has. `PKPExceptionHandler::report()`
logs it, as it logs every refused form request.

The page has nowhere to put that answer. ui-library's `addNewMessage()`
(`useDiscussionManagerForm.js`) posts without `expectValidationError`,
so `useFetch` passes the 422 to `openDialogNetworkError()`
(`modalStore.js`), which shows the answer's `errorMessage` or `error`
and, finding neither, `common.unknownError`.

The controller already has a participant check whose answer the "Error"
window would print. `EditorialTaskController::addNote()` (lines 734–739)
answers 403 with an `error` when the user is not a participant, added by
[540f8410c9](https://github.com/pkp/pkp-lib/commit/540f8410c939ba791c52f17af35ee241b068cbae)
("Allow replies only for task participants", PR `pkp/pkp-lib#12451`).
It never runs for this case, because the form request is validated
before the controller method is called. If it ran, the window would
print `##api.403.forbidden##`: no locale file defines that key.

The window is out of date, not wrong. It fetches the discussion when it
opens (`DiscussionManagerFormDisplayModal.vue`) and offers "Add New
Message" from the participants it got then (`DiscussionMessages.vue`,
`hasAccessToAddMessage`), so one opened after the untick has no button.

Reach:

- A task: the same window and the same endpoint (code).
- A site administrator: passes the policy as a manager does (code).
- A REST API client with a manager role that posts a message to a
  discussion it is not a participant of gets the same 422 (code).
- A Section Editor, a Copyeditor and a Moderator taken off the same way
  are refused by the policy with its own text (on screen, the control).
- Other form requests: `AddTask` (`createdBy`) and
  `AddReviewerSuggestion` (`suggestingUserId`) also set a field to the
  signed-in user in `prepareForValidation()` and check it, with
  `Rule::exists('users', 'user_id')`. That cannot fail for a signed-in
  user, so neither is a permission check, and the fault stays with
  `AddNote` (code).

## Proposed fix

Let the controller's check answer, with a text that exists. Drop the
participant condition from `AddNote::rules()` and give
`EditorialTaskController::addNote()`'s refusal the line the window shows
after a reload
([fix.diff](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/taken-off-manager-reply-unexpected-error/fix.diff)):

```diff
--- a/lib/pkp/api/v1/submissions/tasks/formRequests/AddNote.php
+++ b/lib/pkp/api/v1/submissions/tasks/formRequests/AddNote.php
         return [
-            'userId' => [
-                'required',
-                'numeric',
-                Rule::exists('edit_task_participants', 'user_id')->where(function (Builder $query) {
-                    $query->where('edit_task_id', $this->route('taskId'));
-                }),
-            ],
+            // The signed-in user, set in prepareForValidation(). Whether they may reply (participants only)
+            // is the controller's check, which answers with a message the page can show.
+            'userId' => ['required', 'numeric'],
--- a/lib/pkp/api/v1/submissions/tasks/EditorialTaskController.php
+++ b/lib/pkp/api/v1/submissions/tasks/EditorialTaskController.php
         if (!in_array($currentUser->getId(), $participantIds)) {
-            return response()->json(['error' => __('api.403.forbidden')], Response::HTTP_FORBIDDEN);
+            return response()->json(['error' => __('discussion.noAccessToAddMessage')], Response::HTTP_FORBIDDEN);
         }
```

The refusal follows how the controller answers its other refusals (a 403
with an `error`), which the page's "Error" window already shows, and
every client gets it. `discussion.noAccessToAddMessage` is in pkp-lib's
own locale file, so the three apps have it. Only a manager-level user
reaches this check as a non-participant, and they can assign themselves,
so the text fits everyone who reads it. `userId` stays in the rules
because `addNote()` builds the note from `validated()`.

Tried on OJS, OMP and OPS `main` with the Steps: step 5 opened "Error"
with "To add a new message, please assign yourself as a participant."
(the request answered 403), the reply was not saved and the server log
gained no line. The control read the same with the fix in and out.

**Alternatives**

- Keep the rule and give it a message of its own (`messages()` in
  `AddNote`): the answer stays a 422 on `userId`, so the page would also
  need `expectValidationError` and a place to show an error for a field
  it does not have.
- Refetch the discussion in ui-library before posting, and withdraw the
  button: the window would be right sooner, but two people can still
  cross, and any other client keeps the 422.
- Add the key `api.403.forbidden` and leave the controller's line as it
  is: the manager would read a generic refusal where the window already
  has a line that says what to do.

**What goes with it**

- A REST API client with a manager role that is not a participant gets
  403 `{"error": …}` where it got 422 `{"userId": […]}`. No plugin hook
  and no stored data are touched.
- No backport: the notes endpoint is on `main` only.
- Left out: `api.403.forbidden` in the controller's four other
  refusals (`deleteNote()` for a first message, three in
  `getParticipants()`), which would read as the raw key. They need a
  text of their own; the scan in
  [pkp-e2e#482](https://github.com/jardakotesovec/pkp-e2e/issues/482)
  lists them.
- Guard: no PHPUnit test in pkp-lib covers `EditorialTaskController` or
  its form requests today, so there is none to extend. The check meant
  is at the level of the request: a manager-level user who is not a
  participant posts to the notes route and gets 403 with the text. The
  nearest home is the "Access Control" block of OJS's
  `cypress/tests/integration/Discussions.cy.js`, as a `cy.request`.
  pkp-e2e's own suite gets the two-browser scenario of the Steps (the
  planned item for A36 in spec U37).

Small: two changes in pkp-lib's task API, and one test case.

## Evidence

- The kept script
  [walk.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/taken-off-manager-reply-unexpected-error/walk.js)
  takes steps 1 to 6 with two browsers, its helpers in `lib.js` beside
  it. On an install freshly loaded from the default dataset:
  `PKP_E2E_LINE=stable-3_5_0 PROBE_RUN=r35 PROBE_FEATURE=<feature> PROBE_AGENT=<id> node bin/probe.js all shared/playwright/checks/issues/taken-off-manager-reply-unexpected-error/walk.js`
  (without the first two variables for `main`). With `neighbour` as its
  argument it takes the control (steps 7 to 12), with `late` the window
  opened after the untick; both on `main` only.
- Walked on OJS, OMP and OPS, `main` and `stable-3_5_0`, each on PKP's
  default dataset (pkp/datasets 1a196c3, 2026-10-08), on PostgreSQL; the
  fault does not depend on the database. No server error and no page
  script error. Steps 1 to 6 were walked twice on `main`, the second
  time to read the window after "OK"; the control on a fresh dataset
  without the fix and after steps 1 to 6 with it.
- 3.5, walked: the reply answered 200 and the window listed "References
  checked." by dbarnes on the three apps. `QueryNoteForm::execute()`
  there adds the writer of a reply to the participants ("Always include
  current user to query participants"), and the same policy lets a
  manager through. On the preprint server the walk pressed "OK" in step
  4 with nothing unticked; that `QueryForm::execute()` stores the ticked
  boxes only was read in the code, and his reply put him back.
- 3.4 and 3.3 (code): `QueryNoteForm::execute()` has the same "Always
  include current user to query participants", and
  `QueryAssignedToUserAccessPolicy` the same exception for managers.
  Neither has `api/v1/submissions/tasks`.
- Tips: OJS `main` 6d5b793c4e (lib/pkp d1bc3a9ecc), OMP `main`
  57a9235110 and OPS `main` fd78a0bcd8 (lib/pkp 27938abd4c),
  lib/ui-library 38814ea159; `AddNote.php` and
  `EditorialTaskController.php` are the same in the three.
  `stable-3_5_0`: OJS c6e2c3a879 (lib/pkp d702d012dd), OMP ddc6abf5a9
  and OPS dc8a938ab0 (lib/pkp 8094f06bf5), lib/ui-library 2576e00afd.
  pkp-lib `stable-3_4_0` 8bf0ab5072, `stable-3_3_0` 8c5b3f7f5c.
- Code reads beyond what the Cause quotes: pkp-lib's `locale/en` and
  each app's for `api.403.forbidden` (absent); every
  `prepareForValidation()` under `api/` and `classes/` of pkp-lib and
  OJS (three set a field to the signed-in user);
  `PKPExceptionHandler::shouldReport()` (true for every exception);
  `lib/pkp/tests`, the apps' `tests` and `cypress` for
  `EditorialTaskController`, `AddNote` and the notes route (none).
- The trace: `git blame` on `AddNote.php` lines 55–61 gives b898737294,
  which created the file under `api/v1/submissions/formRequests/`;
  20328b6797 moved it without changing the rule. The controller's check
  is 540f8410c9 (2026-03-14, merged with `pkp/pkp-lib#12451` on
  2026-03-15), whose commit message names `pkp/pkp-lib#12248`. The
  window's line came with `pkp/pkp-lib#12292` (2026-02-04).
- The fix was applied to the three apps with
  `node bin/try-fix.js apply shared/playwright/checks/issues/taken-off-manager-reply-unexpected-error/fix.diff ojs omp ops`
  and taken out with `revert`.
- Not driven: a task; the site administrator; the control and the late
  window on 3.5; a second "Save" after "OK"; the Cypress case the guard
  names.
- Upstream, searched 2026-10-09 in pkp/pkp-lib, pkp/ojs and
  pkp/ui-library by the error's words, the window's line, `AddNote` and
  `api.403.forbidden`. Related but not this fault: `pkp/pkp-lib#11825`
  (the tasks and discussions screens, open) and `pkp/pkp-lib#12292` (the
  window's line).
