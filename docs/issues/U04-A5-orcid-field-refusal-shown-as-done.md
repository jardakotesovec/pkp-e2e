# A contributor's ORCID iD field shows a refused verification request as sent, and a refused delete as done

- **Severity** medium
- **Effort** small
- **Kind** defect
- **Affects**
  - main: OJS, OMP, OPS
  - 3.5: OJS, OMP, OPS (only the refusals with an "Error" window)
  - 3.4: none (code; no ORCID iD field, the ORCID Profile plugin's boxes)
  - 3.3: none (code; the same plugin boxes)
- **Introduced** `pkp/ui-library#339` for `pkp/pkp-lib#9771` · [50e3204043](https://github.com/pkp/ui-library/commit/50e32040431e8954f73e6a64a8849734ce0346d6) · 2023-10-10 · Erik Hanson (ewhanson)
- **Upstream** none found (2026-11-27)
- **Tracked in** spec U04 [A5](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U04-orcid-integration.md#a5), [A25](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U04-orcid-integration.md#a25) (its `main` half)
- **Checked** 2026-11-27, each branch's tip (the commits in Evidence)
- **Model** claude-opus-5-5

Update 2026-11-27: PR `pkp/pkp-lib#13624` (for `pkp/pkp-lib#11972`,
merged 2026-11-23, in OJS, OMP and OPS `main` since 2026-11-26) makes
the server refuse two requests at the moment they arrive, and the field
shows both as sent with no window. They are added as steps 11–18, they
raise the severity to medium, and the fix now also lets their answer
open the "Error" window.

Update 2026-11-03: since `pkp/pkp-lib#13517` the server lets an
Assistant with the "Permissions" box request verification and delete
an iD, so the Steps now reach a refusal through a session that ended
while the contributor's form was open.

## Summary

When the server refuses a contributor's "Request verification" or
"Delete" under "ORCID iD", the field changes as if the action had
worked: it reads "ORCID Verification has been requested!" with "Resend
Verification Email", or the iD disappears. Nothing is sent or removed;
the field is wrong until the form is opened again.

On `main`, two refusals open no window at all, so nobody is told that
no email went out. One is a request for a person stored without an
email. The other is a request for a contributor saved as an
organization or anonymous whose form is switched to "Person", and
"Request verification" pressed, before the form is saved. Neither
refusal exists in a release yet.

Every other refusal opens a window titled "Error" saying the form could
not be submitted, while the field behind it contradicts it. Anyone who
may edit the contributor (an editor, an Assistant allowed to edit, an
author) meets those when something changes between opening the form
and pressing the button: they signed out in another tab, their session
ran out after days without use, ORCID was turned off, they lost the
right to edit, or the contributor was removed. That is the fault 3.5
shows today.

## Impact

- **Lost**: no data, but a request that was never sent. On `main`, an
  editor who trusts the field waits for a contributor who was never
  emailed, and the contributor's iD stays missing until someone asks
  again. Where a window opens, a user who trusts the field over it may
  believe the iD is gone from the record.
- **Who**: users of the field on a journal, press or preprint server
  with ORCID on. On `main`, the organization switched to "Person" takes
  only ordinary clicks, though converting a saved organization into a
  person is uncommon; a person without an email exists only in data
  saved before the change. The refusals with a window need a change
  while the form is open, rare in ordinary use (a session runs out on
  its own only after 7 idle days by default).
- **Way round**: close the contributor's form and press "Edit" again
  (after signing in again, when the session ended); the field then shows
  the stored state. In the silent cases nothing prompts the user to do
  that. For a person without an email, add the email and save, then
  request verification; for a contributor switched to "Person", save
  the form first, then request verification.

Medium: on `main` a request looks sent and is not, with nothing on
screen to say so, which sits one level above the same fault beside an
error window. Without the silent cases, as on 3.5 today, the report
would be low. That they are unreleased does not lower them: `main`
becomes the next release.

## Steps to reproduce

Preconditions:

- PKP's default test dataset for `main`, OJS. OMP and OPS are the same
  with the names in brackets.
- ORCID is on: as `dbarnes`, Settings › Users & Roles › "ORCID", tick
  "Enable ORCID functionality", "ORCID API" "Member Sandbox", any Client
  ID and Client Secret, "Save".
- The submission is 3, "The Facets Of Job Satisfaction: A Nine-Nation
  Comparative Study Of Construct Equivalence", and its contributor
  Catherine Kwantes [OMP: 7, "Accessible Elements: Teaching Science
  Online and at a Distance", Dietmar Kennepohl; OPS: 1, "The influence
  of lactation on the quantity and quality of cashmere production",
  Carlo Corino].

Once the session has ended (steps 2 and 8), the dashboard behind the
workflow may open an "Error" window of its own, "You are not authorized
to access the requested resource." (its count request,
`GET …/api/v1/_submissions/viewsCount`, answering 401). It is not the
one under test: press its "OK" whenever it appears.

Requesting verification:

1. Sign in as `dbarnes`, open the submission, Publication ›
   "Contributors", the contributor's "Edit".
2. Open a second tab of the same browser on the dashboard, and there sign
   out: the user menu (the initials) › "Logout".
3. Back in the first tab (after "OK" on the dashboard's own "Error"
   window, if it opened), under "ORCID iD" press "Request verification",
   then "Yes".
4. Press "OK" on the "Error" window that opens: "The form could not be
   submitted. …".
5. In the second tab, sign in again as `dbarnes`, open the same
   submission's "Contributors" and the contributor's "Edit".

Deleting the iD:

6. Give the contributor a stored iD. Any stored `orcid` value makes the
   field show the iD with "Delete", verified or not; only ORCID's
   sign-in creates one, so on a test install write it by SQL. This is
   what the app stores when that sign-in completes (PostgreSQL; plain
   SQL, MySQL not checked). On OMP put 7 and `dkennepohl@mailinator.com`,
   on OPS 1 and `ccorino@mailinator.com`:

   ```sql
   INSERT INTO author_settings (author_id, locale, setting_name, setting_value)
   SELECT a.author_id, '', v.setting_name, v.setting_value
   FROM authors a
   JOIN submissions s ON s.current_publication_id = a.publication_id
   CROSS JOIN (
     SELECT 'orcid' AS setting_name, 'https://sandbox.orcid.org/0000-0002-1825-0097' AS setting_value
     UNION ALL SELECT 'orcidIsVerified', '1'
     UNION ALL SELECT 'orcidAccessToken', '00000000-1111-2222-3333-444444444444'
     UNION ALL SELECT 'orcidAccessScope', '/activities/update'
     UNION ALL SELECT 'orcidRefreshToken', '55555555-6666-7777-8888-999999999999'
     UNION ALL SELECT 'orcidAccessExpiresOn', '2046-10-01 00:00:00'
   ) v
   WHERE s.submission_id = 3
     AND a.email = 'ckwantes@mailinator.com';
   ```

7. In the first tab, reload the page and open the contributor's "Edit":
   the iD with "Delete".
8. In the second tab, sign out again (user menu › "Logout").
9. In the first tab (after "OK" on the dashboard's own "Error" window,
   if it opened) press "Delete", then "Yes", then "OK" on the "Error"
   window "The form could not be submitted. …".
10. In the second tab, sign in again and open the contributor's "Edit".

**Expected**: after the refusal the field stays as it was: "Request
verification" after step 4, the iD with "Delete" after step 9.

**Observed**: `POST …/api/v1/orcid/requestAuthorVerification/9` and
`POST …/api/v1/orcid/deleteForAuthor/9` answer 403, and the window
"Error" shows the answer's sentence each time:

```
{"error":"The form could not be submitted. You may have been logged out. Please reload the page and try again."}
```

Behind it, and after its "OK", the field reads "ORCID Verification has
been requested!" with "Resend Verification Email" (step 4), and "Request
verification" with no iD (step 9). Signed in again, the form shows the stored state:
"Request verification" (step 5), the iD with "Delete" (step 10).

Control: for `dbarnes` still signed in, whose requests succeed, the
field changes the same way, and a reload agrees with it.

Requests the server refuses on arrival (`main` only). Steps 11–18
start from a freshly reset dataset with ORCID on as above; the two
groups do not depend on each other and can be taken one after the
other on the same install. On 3.5 the form has no "Contributor Type",
and a request for a person without an email is accepted and fails
later, a separate fault (spec A25).

An organization shown as a Person:

11. As `dbarnes`, open the submission's "Contributors", "Add
    Contributor".
12. "Contributor Type" "Organization or group", "Organization Name"
    "Lab u04hk04a", "Country" "Canada", tick "Author" under
    "Contributor Roles", "Save".
13. The new row's "Edit", then "Contributor Type" "Person": the "ORCID
    iD" field shows "Request verification".
14. Press "Request verification", then "Yes".
15. Reload the page, then the row's "Edit" again and "Person".

A person stored without an email:

16. Remove the contributor's email by SQL, standing for data saved
    before PR `pkp/pkp-lib#13624`: until it, an edit through the
    contributors API could empty a person's email on `main`. On OMP put
    21, on OPS 1:

    ```sql
    UPDATE authors SET email = '' WHERE author_id = 9;
    ```

17. Reload the page, open the contributor's "Edit", press "Request
    verification", then "Yes".
18. Reload the page, then the contributor's "Edit" again.

**Expected**: an "Error" window with the server's sentence, and the
field still "Request verification".

**Observed**: `POST …/api/v1/orcid/requestAuthorVerification/<id>`
(the organization's id) and `…/requestAuthorVerification/9` answer 400:

```
{"error":"ORCID verification can only be sent to a person."}
{"error":"ORCID verification cannot be sent to a contributor without an email."}
```

No window or notice opens. The field reads "ORCID Verification has been
requested!" with "Resend Verification Email" (steps 14 and 17);
reopened, it reads "Request verification" (steps 15 and 18). Nothing is
stored or queued.

## Cause

ui-library `src/components/Form/fields/FieldOrcid.vue`, methods
`sendEmailRequest()` (lines 181–195) and `deleteOrcid()` (lines
243–259), take the result of `useFetch()` and test it:

```js
const {isSuccess, fetch} = useFetch(apiUrl, {method: 'POST', expectValidationError: true});
await fetch();

if (isSuccess) {
	this.verificationRequested = true;   // deleteOrcid(): this.orcidValue = '';
}
```

`useFetch()` (`src/composables/useFetch.js`) returns `isSuccess` as a
Vue ref, set to `false` when the request fails. Destructured into a
plain variable inside an options-API method, it is the ref object
itself, which is always truthy, so the field takes the success branch
whatever the answer. Reopening the form shows the truth because
`ContributorsListPanel.vue` `openEditModal()` fetches the contributor
afresh on every "Edit".

Whether a window opens depends on the answer's status. Both calls pass
`expectValidationError: true`, so for a 400 or 422 `useFetch()` stores
the answer in `validationError` and returns without a window (lines
176–180), and `FieldOrcid` reads no `validationError`. Every other
failure opens `modalStore.openDialogNetworkError()`, the "Error" window
with the answer's `error`, which is why the window and the field
disagree.

The refusals:

- Refused on arrival, since PR `pkp/pkp-lib#13624` (walked):
  `OrcidController::requestAuthorVerification()` answers 400
  `api.orcid.400.personOnly` when the stored contributor is not a
  person, and 400 `api.orcid.400.authorEmailRequired` when it has no
  email, both before `orcidVerificationRequested` is stored. These are
  the silent ones. The form shows the ORCID iD field whenever
  "Contributor Type" reads "Person" on screen (its `showWhen`), saved or
  not, so a saved organization switched to "Person" can send the
  request; and nothing hides "Request verification" for a person
  without an email.
- A session ended by signing out in another tab (walked): pkp-lib's
  global `ValidateCsrfToken` middleware checks the `X-Csrf-Token` header
  on POST, PUT, PATCH and DELETE requests to routes that carry
  `has.user` (its `requiredMiddleware()`), except requests with an
  `apiToken` query or an `Authorization` header. The ORCID routes carry
  `has.user` (`OrcidController::getRouteGroupMiddleware()`). Once the session has
  ended the page's token no longer matches the new session's, so both
  POSTs answer 403 `form.csrfInvalid` before the ORCID routes run.
- A session that ran out (code): the database session handler treats a
  session idle longer than `session_lifetime` (7 days in
  `config.TEMPLATE.inc.php`) as empty, so the token check fails the same
  way. "Keep me logged in" does not help:
  `PKPSessionGuard::userFromRecaller()` signs no one back in on an API
  request (since `pkp/pkp-lib#12780`, on `main` and 3.5).
- The route group's role check (code): 401 from `has.roles` when the
  user no longer holds Site Administrator, Manager, Sub-editor, Author
  or Assistant in the context.
- `OrcidController::validateRequest()` (code): 403
  `api.orcid.403.orcidNotEnabled` when ORCID was turned off; 403
  `api.orcid.403.editWithoutPermission` when
  `Repo::submission()->canEditPublication()` stopped admitting the user
  (an Assistant's "Permissions" box unticked, an author's publication
  scheduled or published); 404 for a contributor removed. The page
  offers the field only to users `canEditPublication()` admits, the same
  check as the routes, so these need a change after the form opened.

Reach:

- Both buttons of the field, "Resend Verification Email" included (it
  calls `sendEmailRequest()` too), on the workflow's contributor form,
  the submission wizard and the preprint author's dashboard (all use
  `ContributorForm`'s `FieldOrcid`).
- Not covered by this fix: when queuing the email fails,
  `requestAuthorVerification()` has already stored
  `orcidVerificationRequested` before the dispatch throws, and answers
  404. With the fix the field then shows "Request verification" while
  the stored state is "requested"; that needs the server to store the
  flag only after a successful dispatch (or roll it back).
- No other component of ui-library `src` tests a destructured
  `isSuccess` without `.value`; the others read `isSuccess.value`, watch
  the ref, or return it unwrapped (searched every destructured
  `isSuccess`).

## Proposed fix

Read the ref's value, and let a refusal of any status open the "Error"
window
([field-fix.diff](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/assistant-orcid-controls-refused/field-fix.diff),
ui-library only):

```diff
--- a/lib/ui-library/src/components/Form/fields/FieldOrcid.vue
+++ b/lib/ui-library/src/components/Form/fields/FieldOrcid.vue
@@ -185,11 +185,10 @@
 
 			const {isSuccess, fetch} = useFetch(apiUrl, {
 				method: 'POST',
-				expectValidationError: true,
 			});
 			await fetch();
 
-			if (isSuccess) {
+			if (isSuccess.value) {
 				this.verificationRequested = true;
 			}
 		},
@@ -246,12 +245,11 @@
 			const {apiUrl} = useUrl(`orcid/deleteForAuthor/${this.authorId}`);
 			const {isSuccess, fetch} = useFetch(apiUrl, {
 				method: 'POST',
-				expectValidationError: true,
 			});
 
 			await fetch();
 
-			if (isSuccess) {
+			if (isSuccess.value) {
 				this.orcidValue = '';
 			}
 
```

Tried on `main` on OJS, OMP and OPS, with the JavaScript rebuilt. Steps
14 and 17 opened the "Error" window with the server's sentence ("ORCID
verification can only be sent to a person.", "ORCID verification
cannot be sent to a contributor without an email."), and the field
still read "Request verification". After the refused request of step 3
the field read "Request verification" beside the "Error" window, and
after the refused delete of step 9 it still showed the iD with
"Delete". For `dbarnes` still signed in, the request and the delete
answered 200, the request email arrived, and the field changed as
before and agreed with a reload, with the fix in and out.

- **How the code base does it.** `isSuccess.value`, as in
  `useDiscussionManagerForm.js` and `useMediaFileManagerActions.js`. The
  sibling fields that post an action of their own, `FieldAffiliations.vue`
  and `FieldFunder.vue`, leave `expectValidationError` out, so a refusal
  opens the "Error" window. Like them, `FieldOrcid` has no input beside
  which a validation error could show, so the window is the only place
  for one.
- **Both changes are needed.** With `.value` alone, the two 400
  refusals would leave the field right but still say nothing: the user
  presses "Yes" and nothing visible happens.
- **What it touches.** The field only; no API, event or stored data.
  It applies as written to 3.5, where `FieldOrcid.vue` is the same.
- **The guard.** ui-library tests composables and stores only (no
  component test, no `@vue/test-utils`, no DOM environment), so the
  guard that fits it as it is calls the two options-API methods on a
  stub `this`, set up as `src/composables/useFetch.test.js` is:
  `setActivePinia(createPinia())`; `global.pkp.context` with
  `apiBaseUrl` and `pageBaseUrl` (which `useUrl()` requires); an `msw`
  `setupServer()` handler answering 403, then 400, to the full URLs
  `useUrl()` builds, `<apiBaseUrl>orcid/requestAuthorVerification/9`
  and `<apiBaseUrl>orcid/deleteForAuthor/9`; then
  `FieldOrcid.methods.sendEmailRequest.call(stub)` with
  `{authorId: 9, verificationRequested: false}` as the stub, and
  `deleteOrcid` with `{authorId: 9, orcidValue: '…', isButtonDisabled: false}`,
  expecting `verificationRequested` still false, `orcidValue`
  unchanged, and `useModalStore()` with `dialogOpened` true and
  `dialogProps.name` `'ajaxError'` (what `openDialogNetworkError()`
  sets). Not tried:
  whether `FieldOrcid.vue` imports cleanly under Vitest's node
  environment. The e2e guard: sign out in a second tab, or switch a
  saved organization to "Person", press the control, and assert the
  field unchanged beside the "Error" window.

**Alternatives**:

- Reading `data` instead of `isSuccess` works the same but is less
  direct.
- Keeping `expectValidationError` and showing `validationError` in the
  field: a second way of showing the same refusal, for no gain.
- Not offering "Request verification" for a person without an email (a
  suggestion in the discussion of `pkp/pkp-lib#11972`): it would need the
  form to pass the email's state to the field, and it does not cover
  the organization switched to "Person" or the refusals that need a
  change after the form opened. It could follow, beside this fix.

**What goes with it**: nothing; it is independent of why the server
refuses.

**For the team**: with the fix, a saved organization switched to
"Person" on its form gets "ORCID verification can only be sent to a
person." over a form that reads "Person". The sentence is true of the
stored contributor, and saving first then requesting works, but the
team may prefer the field to say that the form must be saved first (or
to send the request only for the stored type). The tried diff leaves
the sentence as the server writes it.

Small: two lines changed and two removed in one component, and a unit
test.

## Evidence

- Kept scripts, with their `lib.js`, in
  [assistant-orcid-controls-refused/](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/assistant-orcid-controls-refused/):
  [walk-signed-out.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/assistant-orcid-controls-refused/walk-signed-out.js)
  takes steps 1–10 (`WALK_MODE=neighbour`: the same `dbarnes` requests
  and deletes without signing out), and
  [walk-refused-at-once.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/assistant-orcid-controls-refused/walk-refused-at-once.js)
  takes steps 11–18.
- Walked 2026-11-27 on PKP's default test dataset (pkp/datasets
  98360bca), PostgreSQL. Steps 1–10 on `main` and 3.5, all three apps;
  steps 11–18 on `main`, all three apps, with no job queued and no
  server error. Steps 16–17 on 3.5, all three apps: the request
  answered 200, stored `orcidVerificationRequested`, and the queued
  `SendAuthorMail` job failed with
  `Email "" does not comply with addr-spec of RFC 2822.`, so nothing was
  delivered (spec A25's other half, not this report's fault).
- The SQL of step 16 writes `''` because 3.5's `authors.email` is
  `NOT NULL`. Not established: which route left a person without an
  email on a real install.
- Fix trial: both scripts run with
  [field-fix.diff](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/assistant-orcid-controls-refused/field-fix.diff)
  applied and the JavaScript rebuilt, and the neighbour run with it and
  without it.
- `main` tips: OJS d37c63cc7c, OMP 39fc76c2be, OPS ae2f3c5026 (pkp-lib
  44b36bf802 in all three; ui-library 0549a357 in OJS, 836c01b5 in OMP
  and OPS, whose `FieldOrcid.vue` and `useFetch.js` are the same).
  `stable-3_5_0` tips: OJS 810ed373fe, OMP d1c296edb5, OPS ac52b25153
  (pkp-lib db49f73866, ui-library fd00e45f); `FieldOrcid.vue` is the
  same as `main`'s, and `useFetch.js` handles `isSuccess` and
  `expectValidationError` the same way.
- A session that runs out, read in the code on `main` and 3.5, not
  walked: `PKPContainer` sets the session lifetime from
  `session_lifetime` (days) and the remember-me cookie from
  `remember_me_lifetime`; Laravel's `DatabaseSessionHandler::read()`
  returns an empty session once `expired()`, and the session then
  starts with a new token; `PKPSessionGuard::userFromRecaller()` returns
  no user for an `APIRouter` request.
- 3.4 (pkp-lib 762235e120, ui-library ee684b34) and 3.3 (pkp-lib
  486ca25dac, ui-library 96959f9e): ui-library has no `FieldOrcid`;
  ORCID is the ORCID Profile plugin, whose request and delete are boxes
  saved with the contributor form.
- Trace: `git blame` on both `if (isSuccess)` lines and both
  `expectValidationError: true` lines gives 50e3204043, the component's
  first version (authored 2023-10-10, committed 2024-06-21); `useFetch()`
  already returned `isSuccess` as a ref then (added by 80b6f648,
  `pkp/ui-library#355`, an ancestor). The two 400 refusals come from
  pkp-lib 19ca682321 (PR `pkp/pkp-lib#13624`).
- Tracker search (2026-11-27): pkp/pkp-lib by "orcid verification
  requested error", "orcid request verification organization
  contributor", "orcid contributor without email", `FieldOrcid`,
  `shouldRequestVerification`; pkp/ui-library by `FieldOrcid`,
  `isSuccess`, "orcid"; nothing on this fault. The discussion of
  `pkp/pkp-lib#11972` suggested not offering "Request verification" without an
  email (a comment of 2026-10-28); its decision kept the server's
  refusal only.
