# A newcomer's names typed on "Enter details" go back to the invitation's after "Back", and the account is created with them

- **Severity** low
- **Effort** small
- **Kind** regression
- **Affects**
  - main: OJS, OMP, OPS
  - 3.5: OJS, OMP, OPS
  - 3.4: none (code; no role invitations)
  - 3.3: none (code; no role invitations)
- **Introduced** `pkp/ui-library#923` for `pkp/pkp-lib#12513` · [7a8c786698](https://github.com/pkp/ui-library/commit/7a8c78669865e7065986c2231a3e1751b75620f1) · 2026-06-30 · Jarda Kotěšovec (jardakotesovec); on 3.5 `pkp/ui-library#920` · [ac2dabbc72](https://github.com/pkp/ui-library/commit/ac2dabbc72c9f5d04e5da82ff5345f37b66389ea), first released in 3.5.0-5
- **Upstream** none found (2026-11-03)
- **Tracked in** spec U06 [A18](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U06-user-invitations.md#a18)
- **Checked** 2026-11-03, each branch's tip (the commits in Evidence)
- **Model** claude-opus-5-5

## Summary

A newcomer accepting a role invitation changes the Given Name or Family
Name on "Enter details" and, without saving, presses "Back". On "Create
OJS account" (OMP: "Create OMP account", OPS: "Create OPS account") they
press "Save and continue". "Enter details" then opens with the names the
invitation holds again, while an Affiliation and a Country typed the
same way are kept.

Unless the newcomer types the names again, "Review & create account"
shows the invitation's names and the account is created with them: its
Profile and its row in the Users & Roles list carry them. Nothing on
screen says the typed names were replaced.

Only an unsaved change is lost. Names already saved on "Enter details"
stay, and a change made after coming back to it from the review step is
replaced by those saved names. A name the invitation does not hold is
kept as typed, so an invitation sent without names loses nothing, and
no account is ever created without a Given Name.

## Impact

- **Lost**: the names the newcomer typed and had not saved, for instance
  a corrected spelling of the name the manager entered.
- **Who**: someone without an account who accepts a role invitation
  that holds their name and presses "Back" on "Enter details" before its
  "Save and continue". Someone who already has an account is not
  affected: their accept page has no "Enter details".
- **Way round**: the review step shows the names before the account is
  created, so the newcomer can press "Edit" there and type them again.
  After accepting, they can correct them in Profile › "Identity".

Low: the account is created and works, and the wrong names can be seen
and corrected on screen before and after; it would be medium if the
review step showed the typed names while the account got the others.

## Steps to reproduce

Preconditions:
- PKP's default test dataset for `main` (OJS, OMP or OPS), context
  `publicknowledge`. ORCID is off there, so the accept wizard starts at
  "Create OJS account". The address below belongs to nobody in it.
- The install's outgoing mail is caught for reading, for example by
  Mailpit, as on a development install.

Sending the invitation:
1. Sign in as `rvaca`.
2. Open Settings › Users & Roles and press "Invite to a role".
3. On "Search User", type `u06hk4-newcomer@example.com` and press
   "Search User".
4. On "Enter details", type Given Name "Ina" and Family Name "Nonce". In
   the role row pick Role "Copyeditor" (OPS: "Moderator"), Start Date
   today and "Does not appear on the masthead". Press "Save And
   Continue", "Invite user to the role", then "View All Users". Sign
   out.

Accepting it:
5. Open the accept link in the email "You are invited to new roles" sent
   to `u06hk4-newcomer@example.com`.
6. On "STEP 1 - Create OJS account" (OMP: "Create OMP account", OPS:
   "Create OPS account"), type Username `u06hk4newcomer` and Password
   `u06hk4pass`, tick "Yes, I agree to have my data collected and stored
   according to the Privacy Statement" and press "Save and continue".
7. "STEP 2 - Enter details" shows Given Name "Ina" and Family Name
   "Nonce". Replace them with Given Name "Iris" and Family Name "Quill",
   type Affiliation "Typed University" and choose Country "Canada". Do
   not press "Save and continue".
8. Press "Back". "Create OJS account" shows the username, the password
   and the ticked consent as left. Press "Save and continue".
9. Read "Enter details".
10. Press "Save and continue" and read "STEP 3 - Review & create
    account".
11. Press "Accept And Continue to OJS", then "View All Submissions" in
    the dialog "You've been assigned a new role in OJS".
12. The newcomer is not signed in: the dialog leads to the sign-in page.
    Sign in there as `rvaca`, read the new user's row in Settings › Users
    & Roles, and sign out.
13. Sign in as `u06hk4newcomer` (password `u06hk4pass`) and read Profile
    › "Identity".

**Expected**: step 9 shows the details as typed in step 7: "Iris",
"Quill", "Typed University", "Canada". The review step and the account
carry "Iris Quill".

**Observed**: step 9's "STEP 2 - Enter details" shows Given Name "Ina",
Family Name "Nonce", Affiliation "Typed University" and Country
"Canada". The review step reads:

```
User Details  Edit
English
Given Name Ina
Family Name Nonce
Affiliation Typed University
Country of affiliation Canada
```

After accepting, the users list row reads "Ina Nonce
u06hk4-newcomer@example.com Copyeditor 2026-11-03 Typed University", and
Profile › "Identity" holds Given Name "Ina" and Family Name "Nonce". No
request fails and no page script error is raised: every "Save and
continue" answers 200.

The same names typed in step 7 and saved with "Save and continue"
straight away, with no "Back", reach the review step and the account as
"Iris Quill".

## Cause

`updateInvitationPayload()` in `AcceptInvitationPageStore.js`
(ui-library `src/pages/acceptInvitation/`) sends each step's fields to
the `refine` endpoint and then copies the names from the answer into
the wizard's payload:

```js
// Reflect any server-side locale fallback (e.g. the site primary locale name
// copied over from the context primary locale when left empty) so the review
// step replays the entered name in both locales.
if (data.value) {
	['givenName', 'familyName'].forEach((field) => {
		if (data.value[field]) {
			updateAcceptInvitationPayload(field, data.value[field]);
		}
	});
}
```

It copies them whichever step was saved. The answer to `refine` is the
whole invitation as stored
(`UserRoleAssignmentReceiveController::refine()` returns
`UserRoleAssignmentInviteResource`), so its names are the ones last
saved. "Create OJS account" sends only `username`, `password` and
`privacyStatement` (its `validateFields` in
`AcceptInvitationStep::userAccountDetailsStep()`, the step with id
`userCreate`), and its answer carries the invitation's names.

On "Enter details" the form writes every keystroke into the same
payload (`updateUserDetailsForm()` in
`AcceptInvitationUserDetailsForms.vue`), so before the "Back" the
payload holds "Iris" / "Quill". The save of "Create OJS account" after
the "Back" replaces them with the stored "Ina" / "Nonce". When "Enter
details" mounts again, the code at the top of the component's
`<script setup>` (`if (!store.userId) …`, then
`connectWithPayload(store.acceptInvitationPayload)`) fills each box from
the payload, so the step, the review and the `refine` it sends next all
carry the invitation's names. Affiliation and Country are not in the
copied list, so they keep what was typed. A name the invitation does
not hold comes back as `null`, which the `if (data.value[field])` test
skips, so a name typed there is kept.

The copy came with `pkp/pkp-lib#12513`, which made the server fill an
empty name in the site's primary language from the journal's
(`fillSiteLocaleNameFallback()`), so the review step could show the name
in both languages. That fallback applies only to the names the request
carries; the copy does not check whether the request carried them.
Before the change, the answer was not read and "Back" kept the typed
names.

Reach:
- The accept wizard of a newcomer, in OJS, OMP and OPS, on `main` and
  3.5 (walked).
- Saved first: the newcomer saves "Enter details" ("Iris" / "Quill"),
  presses "Edit" on the review step, types Given Name "Ivy", then "Back"
  and "Save and continue" on "Create OJS account". "Enter details" shows
  "Iris" again: the saved names stay, the later unsaved change is lost
  (walked, OMP `main`).
- An invitation sent without names: the typed names are kept; one sent
  with Given Name "Ina" alone: the Given Name comes back as "Ina" and
  the typed Family Name is kept (walked, OMP `main`). A Given Name in
  the journal's primary language is required by every `refine` of
  "Enter details" and by `finalize`
  (`UserRoleAssignmentInvitePayload::getValidationRules()`), so no
  account is created without one (code).
- With ORCID on, "Verify ORCID iD" comes before "Create OJS account";
  its "Skip ORCID verification" sends no `refine`, so it adds nothing
  (code).
- An existing user's accept page has one step and no "Enter details",
  and its `refine` payload is empty (`invitationRequestPayload` sends
  nothing when `userId` is set) (code).
- The other writes of server data into the payload,
  `receiveInvitation()` when the page opens and `refreshOrcid()` after an
  ORCID sign-in, set the invitation's starting values and the ORCID
  fields, which the newcomer does not type (code).
- The send wizard's store (`UserInvitationPageStore.js`) does not read
  answer to its `PUT …/populate` request back into its payload; its
  trouble after "Back"
  has another cause
  ([A15](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U06-user-invitations.md#a15)).

## Proposed fix

Copy a name back from the answer only when the request carried it, which
is when the server's fallback can have changed it. The diff
([fix.diff](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/accept-invitation-back-typed-names-replaced/fix.diff)):

```diff
 		async function updateInvitationPayload() {
+			const invitationData = invitationRequestPayload.value;
 			const {data, validationError, fetch} = useFetch(updateInvitationUrl, {
 				expectValidationError: true,
 				method: 'PUT',
-				body: {invitationData: invitationRequestPayload.value},
+				body: {invitationData},
 			});
 ...
-					// step replays the entered name in both locales.
+					// step replays the entered name in both locales. Only for a name this step
+					// sent: the answer to another step carries the names last saved, and would
+					// replace names typed on "Enter details" and not saved yet.
 					if (data.value) {
 						['givenName', 'familyName'].forEach((field) => {
-							if (data.value[field]) {
+							if (field in invitationData && data.value[field]) {
 								updateAcceptInvitationPayload(field, data.value[field]);
```

This keeps what `pkp/pkp-lib#12513` added: the save of "Enter details"
sends the names, so the review still shows the name the server copied
into the site's primary language. It matches the server's own scope,
since `fillSiteLocaleNameFallback()` reads only the names in the
request, and it follows the send wizard's store, which treats what the
form holds as the truth and does not overwrite it with an answer.

Tried on `main` in OJS, OMP and OPS: the Steps' Expected held at every
step. With the journal's primary language switched to French and the
names typed only in the French boxes, the review still showed them
under "English" as well, with the fix in and out.

**Alternatives**:
- Copy only into a language that is empty in the payload, since the
  fallback fills only empty ones. Not recommended: a name the newcomer
  cleared on "Enter details" before a "Back" would come back from the
  stored invitation.
- Drop the copy and fill the empty site-language name in the browser
  instead. Not recommended: it repeats the server's rule in a second
  place, which then has to follow every change to it.

**What goes with it**:
- No stored data to repair: an account created with the invitation's
  names is the account holder's to correct in Profile › "Identity".
- No change to the REST API or to any other caller: the store is the
  accept page's own.
- 3.5 has the same code; the diff applies there as written (offset by
  one line).
- The guard: ui-library has no unit tests for a page store built with
  `defineComponentStore`, and pkp's Cypress suites walk the accept
  wizard only inside the data build (`cy.createUserByInvitation()` in
  `lib/pkp/cypress/support/commands.js`, called by OJS's
  `cypress/tests/data/10-ApplicationSetup/40-CreateUsers.cy.js`), with
  no "Back". A new integration test in `lib/pkp/cypress/tests/integration/`,
  shared by the three apps, fits: it reuses `cy.inviteUser()` and
  `cy.confirmEmail()`, types names on "Enter details", presses "Back"
  and "Save and continue" on "Create OJS account", and checks the names
  in their boxes, on the review step and on the account.

Small: one condition in one ui-library store, and an end-to-end test.

## Evidence

- Kept script: [`shared/playwright/checks/issues/accept-invitation-back-typed-names-replaced/walk.js`](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/accept-invitation-back-typed-names-replaced/walk.js)
  (helpers in its `lib.js`), on PKP's default test dataset (pkp/datasets
  2fd5c320, 2026-11-02, PostgreSQL):
  `PROBE_FEATURE=<feature> PROBE_AGENT=<agent> node bin/probe.js <ojs|omp|ops|all> shared/playwright/checks/issues/accept-invitation-back-typed-names-replaced/walk.js [neighbour|variants]`.
  The default walk takes steps 1-13. `neighbour` takes the case with no
  "Back" and the French-primary case (Settings › Website › Setup ›
  Languages, French made primary; an invitation with "Ina" / "Nonce" in
  the French boxes; the French boxes typed over, the English ones left
  empty, saved without "Back"). `variants` takes the invitation without
  names, the one with a Given Name alone and the saved-first case
  (Cause, Reach), walked on OMP `main` only; the store is the same in
  the three apps.
- Walked 2026-11-03. Steps 1-13 on OJS, OMP and OPS on `main` and
  `stable-3_5_0`, the same on all six. Tips: `main` OJS e7ce037799, OMP
  828150a8fe, OPS 53749f7d2f, lib/pkp 1ae711024a, lib/ui-library
  eb988214; `stable-3_5_0` OJS 0f2de4ff3f, OMP 9e2a7fd005, OPS
  d4a7e97a55, lib/pkp c4c0aa8c52, lib/ui-library 7cff1702. The created
  accounts' `user_settings` held `givenName[en]=Ina`,
  `familyName[en]=Nonce`, `affiliation[en]=Typed University`.
- The server log held nothing for this fault.
- Introduced: by `git blame` of the copy; ac2dabbc is the ui-library
  pointer of OJS's `3_5_0-5` tag. The code at the top of
  `AcceptInvitationUserDetailsForms.vue` that fills the boxes from the
  payload is older and correct on its own.
- 3.4 and 3.3 (code): ui-library `origin/stable-3_4_0` (ee684b34) and
  `origin/stable-3_3_0` (96959f9e) hold no invitation code under `src/`,
  and lib/pkp `origin/stable-3_4_0` (f4719f2805) and `origin/stable-3_3_0`
  (5b26595791) no `classes/invitation`.
- Upstream search 2026-11-03 (pkp/pkp-lib, pkp/ui-library, pkp/ojs,
  pkp/omp, pkp/ops; by the symptom's words and by
  `AcceptInvitationPageStore`, `updateInvitationPayload`,
  `fillSiteLocaleNameFallback`): no match.
- Fix trial on `main`, OJS, OMP and OPS: the diff applied with the
  JavaScript rebuilt, each walk on a freshly loaded dataset; steps 1-13
  and `neighbour` with the fix, `neighbour` again after the revert; no
  request of the wizard failed and no page script error was raised.
  Not tried on 3.5.
