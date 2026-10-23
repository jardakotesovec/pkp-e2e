# After "Back" in the invite wizard, "Enter details" shows names that the invitation is then sent without

- **Severity** low
- **Effort** small
- **Kind** defect
- **Affects**
  - main: OJS, OMP, OPS
  - 3.5: OJS, OMP, OPS
  - 3.4: none (code; no role invitations)
  - 3.3: none (code; no role invitations)
- **Introduced** `pkp/ui-library#441` · [272bf4aa67](https://github.com/pkp/ui-library/commit/272bf4aa671e8464ad5e0efa2d3672b8ce99260a) · 2024-11-07 · Ipula Indeewara (ipula)
- **Upstream** none found (2026-10-23)
- **Tracked in** spec U06 [A15](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U06-user-invitations.md#a15)
- **Checked** 2026-10-23, each branch's tip (the commits in Evidence)
- **Model** claude-opus-5-5

## Summary

A manager inviting a newcomer to a role types a Given Name, a Family
Name and a role on "Enter details", presses "Back" and searches an
address again on "Search User", another one or the same. "Enter
details" opens with the names typed before still in their boxes. Sent
as shown, the invitation carries the role but no name: its row under
Invitations has an empty Name, and the email opens "Dear <address>,".

"Edit Invitation" on a sent invitation does the same when the manager
types names, goes on to the email step and comes "Back" to "Enter
details": the names stay on screen and the new invitation goes out
without them.

Nothing on screen says the names were dropped. The cause is in the
wizard's browser code, which keeps typed names on screen but no longer
sends them after such a "Back".

## Impact

- **Lost**: the names the manager typed. The newcomer must type a Given
  Name to accept (the accept step requires it); the Family Name is
  optional there, so an account can end up without the family name the
  manager meant to give it.
- **Who**: a Journal, Press or Preprint Server manager who presses
  "Back" in the invite wizard after typing a newcomer's names. Inviting
  someone who already has an account is not affected: the invitation
  carries the account's own name.
- **Way round**: typing the names again after the "Back" sends them.
  An invitation already sent without names can be replaced with
  "Edit Invitation", names typed and sent without a "Back"; that cancels
  the first invitation and emails a new one.

Low: the role invitation itself is sent and works, and only names are
lost; it would be medium if an account could be created without any
name.

## Steps to reproduce

Preconditions:
- PKP's default test dataset for `main` (OJS, OMP or OPS), context
  `publicknowledge`. The addresses below belong to nobody in it.
- The install's outgoing mail is caught for reading, for example by
  Mailpit, as on a development install.

New invitation:
1. Sign in as `rvaca`.
2. Open Settings › Users & Roles and press "Invite to a role".
3. On "Search User", type `hkq23d-first@example.com` and press "Search
   User".
4. On "Enter details", type Given Name "Fey" and Family Name
   "Firstperson". In the role row pick Role "Copyeditor" (OPS:
   "Moderator"), Start Date today and "Does not appear on the
   masthead".
5. Press "Back".
6. On "Search User", whose box is now empty, type
   `hkq23d-second@example.com` and press "Search User".
7. Look at "Enter details", change nothing, and press "Save And
   Continue".
8. Press "Invite user to the role", then "View All Users" in the
   "Invitation Sent" dialog.
9. Read the Invitations row for `hkq23d-second@example.com`, and in the
   mail catcher the email sent to that address.

Editing it:
10. In that Invitations row, open the row's actions, choose "Edit" and
    press "Edit Invitation" in the warning.
11. On "Enter details", type Given Name "Sue" and Family Name "Same"
    and press "Save And Continue".
12. On the email step press "Back"; "Enter details" shows "Sue" /
    "Same". Press "Save And Continue", then "Invite user to the role"
    and "View All Users".
13. Read the row and the new email as in step 9.

**Expected**: after the new search in step 6, "Enter details" opens
empty, as after a first search (no names, a blank role row), since
"Back" to "Search User" starts the invitation over. Whatever names
"Enter details" holds when the invitation is sent are the names it
carries: its row's Name and the email's greeting read them ("Sue Same"
after step 12).

**Observed** (OJS, OMP and OPS, `main` and 3.5): step 7's "STEP 2 -
Enter details and invite for roles" shows "Email address"
`hkq23d-second@example.com`, Given Name "Fey", Family Name
"Firstperson", and the role row with "Copyeditor" ("Moderator"), today
and "Does not appear on the masthead". After sending, the Invitations
row reads:

```
NAME | EMAIL                     | INVITATIONS | STATUS             | AFFILIATION
     | hkq23d-second@example.com | Copyeditor  | Invited 2026-10-23 |
```

The email "You are invited to new roles" is addressed to
`hkq23d-second@example.com` with an empty name, opens "Dear
hkq23d-second@example.com,", and lists "Newly assigned roles …
Copyeditor … Starting from 2026-10-23 Your name will not appear in
Journal of Public Knowledge's masthead as a Copyeditor." The first
address gets no email. After step 12 the row's Name is empty again and
the new email opens "Dear hkq23d-second@example.com,". Searching the
same address again in step 6 gives the same result. No request fails
and no page script error is raised.

A "Back" from the email step to "Enter details" in a new invitation
(not to "Search User") keeps the names, and they are sent.

## Cause

`previousStep()` in `UserInvitationPageStore.js` (ui-library
`src/pages/userInvitation/`) resets the invitation whenever the wizard
goes back to its first step:

```js
// when user search and go back agin to search reset payload to initial state
if (previousIndex === 0) {
	invitationPayload.value = {...pageInitConfig.invitationPayload};
	updatedPayload.value = {};
}
```

The reset is shallow and leaves the step forms alone. The "Enter
details" form keeps its state in the page's initial step data, at
`steps[n].sections[0].props.form` (`UserInvitationPage.vue` binds
`section.props` to the section component).
`UserInvitationDetailsFormStep.vue` calls `useForm(props.form)`, and
`useForm()` wraps that object in `ref()` without copying it, so every
typed name is written into the initial step data, which the reset
never touches.

When "Enter details" mounts again, its populate block takes each
multilingual field's value from the payload when it has one and
otherwise from the form. After the reset the payload's `givenName` and
`familyName` are empty (`''` for a new invitation, as
`UserRoleAssignmentInviteUIController::createHandle()` seeds them), so
the stale names come from the form and are stored with
`updatePayload(name, value, true)`. That writes `invitationPayload`
(shown on screen through `connectWithPayload()`) but not
`updatedPayload`, and `updateInvitationPayload` sends only
`updatedPayload` plus `userGroupsToAdd`, so the `populate` request
carries no names. Typing in a name box fires `updateUserForm()`, which
marks every field as updated, so retyped names are sent.

The reset runs on any return to the first step, and the first step is
not always "Search User". `SendInvitationStep::getSteps()` leaves the
search step out when there is an invitation or a user, so in the
"Edit Invitation" wizard (`editHandle()`, `invitationMode` `'edit'`)
and the users list's "Edit" (`'editUser'`) the first step is "Enter
details". There, "Back" from the email step resets the payload to the
invitation's stored one; for an invitation sent without names that is
empty again, and the names typed before are shown but not sent.

The role row comes back for a related reason: the shallow copy shares
the `userGroupsToAdd` row objects with `pageInitConfig`, and
`updateUserGroup()` writes into the first row in place. It is shown
and sent alike, but it also survives a reset that is meant to clear
it.

The reset came with `pkp/ui-library#441`, "craft-oa/gdpr-invitation#75
update user remove role endpoint (#441)", whose squash body lists "fix
bug search user and back button" as one of its bullets. Before it,
"Back" kept the payload, so the names shown were also sent.

Reach:
- The new-invitation wizard and the "Edit Invitation" wizard of OJS,
  OMP and OPS, on `main` and 3.5 (walked).
- An existing account found on "Search User" after the "Back": not
  affected, the account's names are shown read-only and the invitation
  uses them (walked).
- The users list's "Edit" on a member: its details step shows the
  member's data read-only, so no typed name can be lost; the reset
  there only throws away role rows added before a "Back" from the email
  step (code).
- The accept wizard (`AcceptInvitationPageStore.js`) has no reset on
  "Back" (code).

## Proposed fix

Reset only when the wizard returns to the search step, and make that
reset complete: keep deep copies of the initial payload and steps,
taken when the store is created and before any form writes into them,
and restore both. A return to "Enter details" in the edit wizards then
keeps what was entered, as a new invitation's "Back" from the email
step already does. The ui-library already keeps such copies with
`clone-deep` (`useMenuTree.js`: `ref(cloneDeep(initialItems))`). The
diff ([fix.diff](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/invitation-back-names-shown-not-sent/fix.diff)):

```diff
+import cloneDeep from 'clone-deep';
 ...
+		const initialInvitationPayload = cloneDeep(
+			pageInitConfig.invitationPayload,
+		);
+		const initialSteps = cloneDeep(pageInitConfig.steps);
 ...
-				// when user search and go back agin to search reset payload to initial state
-				if (previousIndex === 0) {
-					invitationPayload.value = {...pageInitConfig.invitationPayload};
+				// going back to the search step starts a new invitation: clear what was
+				// entered for the previous one, in the forms as well as in the payload.
+				// Going back to any other step keeps what was entered.
+				if (steps.value[previousIndex].id === 'searchUser') {
+					invitationPayload.value = cloneDeep(initialInvitationPayload);
 					updatedPayload.value = {};
+					steps.value = cloneDeep(initialSteps);
 				}
```

This keeps the intent of `pkp/ui-library#441`: a new search starts a
new invitation, and the screen now agrees with what is sent.

- The guard names the step it is about. `invitationMode.value ===
  'create'` would select the same case, since only that mode has a
  search step, and is as good.
- Replacing `steps.value` while "Enter details" is still mounted is
  safe: `previousStep()` replaces the steps and opens the search step in
  one synchronous call, so the next render already has the search step
  current and unmounts the details section without rendering it from
  the new steps. Its payload watcher was set on the old payload object,
  which the current code already replaces the same way.

Tried on `main` in OJS, OMP and OPS. After "Back" and the second
search, "Enter details" opened with empty name boxes and a blank role
row; with "Sam" "Second" and the role typed, the Invitations row read
"Sam Second" and the email opened "Dear Sam Second,". In "Edit
Invitation", the names typed before a "Back" from the email step were
sent ("Sue Same"). A new invitation's "Back" from the email step kept
and sent the names with the fix in and out, and an existing account's
invitation still carried the account's name.

**Alternatives**:
- Mark the names restored from the form as updated (the third argument
  of `updatePayload()` in the details step), so what is shown is sent.
  Not recommended: after a search for another address, that person
  would be invited under the first person's names.
- Copy the form in the details step (`useForm(cloneDeep(props.form))`).
  This clears the names, but the first role row would still survive
  the reset through the shared payload rows, and the edit wizards would
  still reset on "Back".

**What goes with it**:
- No stored data to repair: an invitation sent without names can be
  replaced with "Edit Invitation".
- In the users list's "Edit" on a member, role rows added before a
  "Back" from the email step now stay instead of being dropped (code).
- 3.5 has the same code; the diff applies there as written.
- The guard: ui-library has vitest tests for composables and
  `src/stores/modalStore.test.js`, but none for a page store built with
  `defineComponentStore`, so there is no pattern to copy for a unit
  test. An end-to-end test of the wizard fits: after "Back" and a new
  search "Enter details" is empty, and the names it holds when sent,
  also after a "Back" in "Edit Invitation", are the names in the
  Invitations row and the email.

Small: a few lines in one ui-library store, and an end-to-end test.

## Evidence

- Kept script: [`shared/playwright/checks/issues/invitation-back-names-shown-not-sent/walk.js`](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/invitation-back-names-shown-not-sent/walk.js)
  (helpers in its `lib.js`), on PKP's default test dataset (pkp/datasets
  300c68e, 2026-10-22, PostgreSQL):
  `PROBE_FEATURE=<feature> PROBE_AGENT=<agent> node bin/probe.js <ojs|omp|ops|all> shared/playwright/checks/issues/invitation-back-names-shown-not-sent/walk.js [neighbour|variants]`.
  The default walk takes steps 1-9; at step 7 it types "Sam" / "Second"
  and fills the role row only into boxes that are empty, so the fixed
  code, whose step comes back empty, can still be sent. `variants` takes
  steps 10-13 and the cases Impact and Reach name (the same address
  searched again, names typed again, an existing account, "Edit
  Invitation" without a "Back"). `neighbour` takes a new invitation's
  "Back" from the email step.
- Walked 2026-10-23. Steps 1-9 and `variants` on OJS, OMP and OPS on
  `main` and `stable-3_5_0`, the same on all six. Tips: `main` OJS
  3cf9aa91a8, OMP 178e8b34b2, OPS 5091e916d9, lib/pkp 1f415a07ca,
  lib/ui-library e47a4887; `stable-3_5_0` OJS 0b1ae35f04, OMP a150eee76b,
  OPS 18506a5b4d, lib/pkp 5b54f59ed7, lib/ui-library 2576e00a. The
  stored invitations' payloads had `givenName` and `familyName` null
  where the row showed no name.
- The accept side was read in the code, not walked:
  `UserRoleAssignmentInvitePayload::getValidationRules()` requires
  `givenName` in the context's primary locale when the invitation is
  finalized and leaves `familyName` nullable.
- Introduced: `git blame` of the reset lines on ui-library `main` gives
  272bf4aa67; the details step's populate block and
  `useForm(props.form)` are older (d5e96c785, 88070798f), from when
  "Back" kept the payload.
- 3.4 and 3.3 (code): ui-library `origin/stable-3_4_0` (ee684b34) and
  `origin/stable-3_3_0` (96959f9e) have no `src/pages/userInvitation`,
  and lib/pkp `origin/stable-3_4_0` (366030b017) and
  `origin/stable-3_3_0` (126b86bc2e) no `classes/invitation`; OJS
  `upstream/stable-3_4_0` 3bedd21383, `upstream/stable-3_3_0`
  06f01c8010.
- Upstream search 2026-10-23 (pkp/pkp-lib, pkp/ui-library, pkp/ojs; by
  the symptom's words and by `UserInvitationPageStore`,
  `UserInvitationDetailsFormStep`, `previousStep`): no match.
  `pkp/pkp-lib#13376` (the invitation email greeting the address
  although names were sent) is a different fault, fixed.
- Fix trial on `main`, OJS, OMP and OPS: the diff applied with the
  JavaScript rebuilt, each walk on a freshly loaded dataset; steps 1-9,
  `variants` and `neighbour` with the fix, `neighbour` again after the
  revert. With the fix, the `variants` case "names typed again" stopped
  at "Save And Continue" because the role row it does not refill is now
  blank (the role is required); that case was not re-driven. No request
  failed and no page script error was raised with the fix in. Not tried
  on 3.5.
