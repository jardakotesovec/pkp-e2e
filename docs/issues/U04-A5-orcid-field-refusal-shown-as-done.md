# A contributor's ORCID iD field shows a refused verification request as sent, and a refused delete as done

- **Severity** low
- **Effort** small
- **Kind** defect
- **Affects**
  - main: OJS, OMP, OPS
  - 3.5: OJS, OMP, OPS
  - 3.4: none (code; no ORCID iD field, the ORCID Profile plugin's boxes)
  - 3.3: none (code; the same plugin boxes)
- **Introduced** `pkp/ui-library#339` for `pkp/pkp-lib#9771` · [50e3204043](https://github.com/pkp/ui-library/commit/50e32040431e8954f73e6a64a8849734ce0346d6) · 2023-10-10 · Erik Hanson (ewhanson)
- **Upstream** none found (2026-11-03)
- **Tracked in** spec U04 [A5](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U04-orcid-integration.md#a5), the field's state after a refusal
- **Checked** 2026-11-03, each branch's tip (the commits in Evidence)
- **Model** claude-opus-5-5

Update 2026-11-03: since `pkp/pkp-lib#13517` (on `main` 2026-10-30, on
3.5 2026-10-23) the server lets an Assistant with the "Permissions" box
request verification and delete an iD, so the report's earlier Steps,
which met a refusal through that Assistant, no longer meet one. The
field's fault is unchanged. The Steps now reach a refusal through a
session that ended while the contributor's form was open, walked on
`main` and 3.5.

## Summary

When the server refuses a contributor's "Request verification" or
"Delete" under "ORCID iD", a window titled "Error" says the form could
not be submitted, but the field behind it changes as if the action had
worked: it reads "ORCID Verification has been requested!" with "Resend
Verification Email", or the iD disappears.

Nothing is sent or removed; only the field is wrong, until the form is
opened again.

Anyone who may edit the contributor (an editor, an Assistant allowed to
edit, an author) meets it when something changes between opening the
form and pressing the button: they signed out in another tab, their
session ran out after days without use, ORCID was turned off, they lost
the right to edit, or the contributor was removed.

## Impact

- **Lost**: no data. A user who trusts the field rather than the error
  window may believe the contributor was emailed, or that the iD is gone
  from the record.
- **Who**: users of the field on a journal, press or preprint server
  with ORCID on, in the cases the Summary lists. A session runs out on
  its own only after the install's idle limit (7 days by default) passes
  with no request from that browser, "Keep me logged in" ticked or not.
  Rare in ordinary use.
- **Way round**: close the contributor's form and press "Edit" again
  (after signing in again, when the session ended); the field then shows
  the stored state.

Low: the error window tells the truth at the same moment the field
contradicts it, and the refusals that reach it are rare. It would be
medium if a user acted on what the field showed, for example letting an
article be published with an iD they believed they had deleted.

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
whatever the answer. The "Error" window comes from `useFetch()`'s own
`modalStore.openDialogNetworkError()`, which is why the error and the
field disagree. Reopening the form shows the truth because
`ContributorsListPanel.vue` `openEditModal()` fetches the contributor
afresh on every "Edit".

The refusal in the Steps is pkp-lib's global `ValidateCsrfToken`
middleware. It checks the `X-Csrf-Token` header on POST, PUT, PATCH and
DELETE requests to routes that carry `has.user` (its
`requiredMiddleware()`), except requests with an `apiToken` query or an
`Authorization` header. The ORCID routes carry `has.user`, and once the
session has ended the page's token no longer matches the new session's,
so both POSTs answer 403 `form.csrfInvalid` before the ORCID routes run.

Reach:

- Both buttons of the field, "Resend Verification Email" included (it
  calls `sendEmailRequest()` too), on the workflow's contributor form,
  the submission wizard and the preprint author's dashboard (all use
  `ContributorForm`'s `FieldOrcid`).
- Every refusal that changes nothing on the server. The page offers the
  field only to users `canEditPublication()` admits, the same check as
  the routes, so a refusal needs a change after the form opened:
  - A session ended by signing out in another tab: 403 (walked).
  - A session that ran out (code): the database session handler treats
    a session idle longer than `session_lifetime` (7 days in
    `config.TEMPLATE.inc.php`) as empty, so the token check fails the
    same way. "Keep me logged in" does not help:
    `PKPSessionGuard::userFromRecaller()` signs no one back in on an API
    request (since `pkp/pkp-lib#12780`, on `main` and 3.5).
  - The route group's role check (code): 401 from `has.roles` when the
    user no longer holds Site Administrator, Manager, Sub-editor, Author
    or Assistant in the context.
  - `OrcidController::validateRequest()` (code): 403
    `api.orcid.403.orcidNotEnabled` when ORCID was turned off; 403
    `api.orcid.403.editWithoutPermission` when
    `Repo::submission()->canEditPublication()` stopped admitting the
    user (an Assistant's "Permissions" box unticked, an author's
    publication scheduled or published); 404 for a contributor removed.
- Not covered by this fix: when queuing the email fails,
  `OrcidController::requestAuthorVerification()` has already stored
  `orcidVerificationRequested` before the dispatch throws, and answers
  404. With the fix the field then shows "Request verification" while
  the stored state is "requested"; that needs the server to store the
  flag only after a successful dispatch (or roll it back).
- No other component of ui-library `src` tests a destructured
  `isSuccess` without `.value`; the others read `isSuccess.value`, watch
  the ref, or return it unwrapped (searched every destructured
  `isSuccess`).

## Proposed fix

Read the ref's value
([field-fix.diff](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/assistant-orcid-controls-refused/field-fix.diff),
ui-library only):

```diff
@@ -190,5 +190,5 @@
 			await fetch();
 
-			if (isSuccess) {
+			if (isSuccess.value) {
 				this.verificationRequested = true;
 			}
@@ -252,5 +252,5 @@
 			await fetch();
 
-			if (isSuccess) {
+			if (isSuccess.value) {
 				this.orcidValue = '';
 			}
```

Tried on `main` on OJS, OMP and OPS, with the JavaScript rebuilt: after
the refused request the field still read "Request verification" beside
the "Error" window, and after the refused delete it still showed the iD
with "Delete". For `dbarnes` still signed in, the request and the delete
answered 200 and the field changed as before, with the fix in and out,
and a reload agreed with it.

- **How the code base does it.** `isSuccess.value`, as in
  `useDiscussionManagerForm.js` and `useMediaFileManagerActions.js`.
- **`expectValidationError: true`.** Both calls pass it, so a 400 or
  422 answer would open no window and, with the fix, leave the field
  silently unchanged. No ORCID route answers either today, so it
  changes nothing now; dropping the option from both calls in the same
  change would make any future validation refusal show the error
  window. Not part of the tried diff.
- **What it touches.** The field only; no API, event or stored data.
  It applies as written to 3.5.
- **The guard.** ui-library tests composables and stores only (no
  component test, no `@vue/test-utils`, no DOM environment), so the
  guard that fits it as it is calls the two options-API methods on a
  stub `this`, set up as `src/composables/useFetch.test.js` is:
  `setActivePinia(createPinia())`; `global.pkp.context` with
  `apiBaseUrl` and `pageBaseUrl` (which `useUrl()` requires); an `msw`
  `setupServer()` handler answering 403 to the full URLs `useUrl()`
  builds, `<apiBaseUrl>orcid/requestAuthorVerification/9` and
  `<apiBaseUrl>orcid/deleteForAuthor/9`; then
  `FieldOrcid.methods.sendEmailRequest.call(stub)` with
  `{authorId: 9, verificationRequested: false}` as the stub, and
  `deleteOrcid` with `{authorId: 9, orcidValue: '…', isButtonDisabled: false}`,
  expecting `verificationRequested` still false and `orcidValue`
  unchanged. Not tried: whether `FieldOrcid.vue` imports cleanly under
  Vitest's node environment. The e2e guard instead is this report's
  walk kept as a U04 test: sign out in a second tab, press either
  control, and assert the field unchanged beside the "Error" window.

**Alternatives**: reading `data` instead of `isSuccess` works the same
but is less direct.

**What goes with it**: nothing; it is independent of why the server
refuses.

Small: `.value` added on two lines of one component, and a unit test.

## Evidence

- Kept script:
  [walk-signed-out.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/assistant-orcid-controls-refused/walk-signed-out.js)
  with its
  [lib.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/assistant-orcid-controls-refused/lib.js),
  run on a dataset install with
  `node bin/probe.js all shared/playwright/checks/issues/assistant-orcid-controls-refused/walk-signed-out.js`
  (`WALK_MODE=neighbour` for the control: the same `dbarnes`, no
  sign-out). It takes the steps above, records every window shown after
  "Yes" and the request's answer, reads the field before and after the
  error window's "OK", and before steps 3 and 9 presses "OK" on any
  "Error" window the dashboard opened on its own.
- Walked 2026-11-03 on PKP's default test dataset (pkp/datasets
  2fd5c320), PostgreSQL. No server error and no script error. A
  successful delete logs
  `cURL error 7: Failed to connect to sandbox.orcid.org` for
  `https://sandbox.orcid.org/oauth/revoke` on the test installs, which
  reach no outside service.
- `main` tips: OJS e7ce037799, OMP 828150a8f, OPS 53749f7d2f (pkp-lib
  1ae711024a, ui-library eb988214). `stable-3_5_0` tips: OJS
  0f2de4ff3f, OMP 9e2a7fd00, OPS d4a7e97a55 (pkp-lib c4c0aa8c52,
  ui-library 7cff1702), walked with the same result; `FieldOrcid.vue`
  is identical to `main`'s, and `useFetch.js` sets `isSuccess` the same
  way.
- A session that runs out, read in the code on `main` and 3.5, not
  walked: `PKPContainer` sets the session lifetime from
  `session_lifetime` (days) and the remember-me cookie from
  `remember_me_lifetime`; Laravel's `DatabaseSessionHandler::read()`
  returns an empty session once `expired()`, and the session then
  starts with a new token; `PKPSessionGuard::userFromRecaller()` returns
  no user for an `APIRouter` request.
- 3.4 (pkp-lib f4719f2805, ui-library ee684b34) and 3.3 (pkp-lib
  5b26595791, ui-library 96959f9e): ui-library has no `FieldOrcid`;
  ORCID is the ORCID Profile plugin, whose request and delete are boxes
  saved with the contributor form.
- Trace: `git blame` on both `if (isSuccess)` lines gives 50e3204043, the
  component's first version (authored 2023-10-10, committed 2024-06-21);
  `useFetch()` already returned `isSuccess` as a ref then (added by
  80b6f648, `pkp/ui-library#355`, an ancestor).
- Tracker search (2026-11-03): pkp/pkp-lib, pkp/ui-library and pkp/ojs
  by `FieldOrcid`, `isSuccess`, "orcid isSuccess", "orcid verification
  requested error", "orcid delete error field", "orcid request
  verification error", and pkp/ui-library's ORCID issues and PRs:
  nothing on this fault.
