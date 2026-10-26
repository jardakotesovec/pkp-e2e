# The invitation email promises a masthead listing for roles the masthead never lists, such as Author or Reader

- **Severity** low
- **Effort** small
- **Kind** defect
- **Affects**
  - main: OJS, OMP, OPS
  - 3.5: OJS, OMP, OPS
  - 3.4: none (code; no "Invite to a role")
  - 3.3: none (code; no "Invite to a role")
- **Introduced** `pkp/pkp-lib#10472` for `pkp/pkp-lib#10459` · [7e3a26ea83](https://github.com/pkp/pkp-lib/commit/7e3a26ea83db5428a8747b7dba574259e749cf98) · 2024-09-26 · Dimitris Efstathiou (defstat)
- **Upstream** none found (2026-10-26)
- **Tracked in** spec U06 [A11](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U06-user-invitations.md#a11)
- **Checked** 2026-10-26, each branch's tip (the commits in Evidence)
- **Model** claude-opus-5-5

Update 2026-10-26: `pkp/pkp-lib#13370` (merged on `main` and
`stable-3_5_0` on 2026-10-23) puts the email's masthead line behind the
context's "Present a masthead based on user enrollments" setting, and a
Reviewer row's line behind "Enable listing of reviewers on the masthead".
It does not change the line for other roles while the masthead is on, so
the fault stays: walked again on both lines' tips. The Cause, the
proposed fix (re-tried) and the Reach are rewritten for the new code.

## Summary

A manager offers someone a role with "Invite to a role" on Users &
Roles. For each role, the wizard asks whether the person will "Appear
on the masthead"; nothing is preselected. When the manager picks
"Appear on the masthead", the invitation email says "Your name will
appear in the {journal}'s masthead as a {role}." It says this even for
roles the journal's "Editorial Masthead" page does not list, such as
Author, Reader or Copyeditor.

The manager cannot delete the sentence while editing the email before
sending it: the role lines, this sentence included, are added only when
the email is sent. Once the person accepts,
the "Appear" choice is stored with the role. Every later invitation to
them repeats the promise under "Already assigned roles".

This happens while the masthead is based on user enrollments, as on a
new install, where it lists only the editor roles and "Editorial Board
Member" (on a preprint server, "Moderator" and "Editorial Board Member").
With that setting off, the email has no masthead line at all. If the
journal later ticks "Consider role in masthead list" for such a role,
the people stored as "Appear" are listed, and the sentence becomes true.
Reviewer rows are a separate case and outside this report.

## Impact

- **Lost**: nothing. The person is promised a public listing that they
  do not get, and nothing tells them otherwise.
- **Who**: people offered a role the masthead does not list with
  "Appear on the masthead". The wizard makes the manager pick "Appear"
  or "Does not appear" for every role, with no default. It needs a
  journal whose masthead is based on user enrollments: new journals
  start with that on; a journal upgraded from 3.4 starts with it off
  until a manager ticks it.
- **Way round**: the manager picks "Does not appear on the masthead" for
  such a role, and the email then says "Your name will not appear …".
  For someone already told, a manager can open Users & Roles, choose
  "Edit" on that person's row and set the role to "Does not appear on
  the masthead". Later invitations then read correctly. Nothing on
  screen says that either step is needed.

Low: wrong wording in an email. The invitation, the stored choice and
the public page are all right.

## Steps to reproduce

Preconditions:

- PKP's default test dataset for `main` (OJS; OMP and OPS the same, with
  the differences in brackets). Its masthead is based on user
  enrollments (Website › Settings › Appearance, "Present a masthead
  based on user enrollments" ticked, as on a new install). David Buskins
  (`dbuskins`) is a "Section editor" ["Series editor" on OMP,
  "Moderator" on OPS] who appears on the masthead. He holds no Author or
  Reader role.

1. As a visitor, open About › "Editorial Masthead"
   (`/index.php/publicknowledge/about/editorialMasthead`).
2. Sign in as `rvaca` and open Settings › Users & Roles. Press "Invite to
   a role".
3. Type `dbuskins@mailinator.com` under "Search for a user by email
   address" and press "Search User". His "Section editor" row reads
   "Appear on the masthead" under "Journal Masthead" ["Press Masthead",
   "Server Masthead"].
4. In the new row, pick "Author" under "Select a new role", today's date
   as the start date, and "Appear on the masthead". Press "Save And
   Continue", then "Invite user to the role".
5. Read the email "You are invited to new roles" sent to
   `dbuskins@mailinator.com`.
6. Sign out. Open the email's "Accept Invitation" link and press "Accept
   And Continue to OJS" ["… to OMP", "… to OPS"].
7. As a visitor, reload About › "Editorial Masthead".
8. Sign in as `rvaca` again. Invite `dbuskins@mailinator.com` the same
   way, this time offering "Reader" with "Appear on the masthead".
9. Read the second "You are invited to new roles" email.

**Expected**: the email promises a masthead listing only for a role the
masthead lists. "Section editor" gets "Your name will appear …".
"Author" and "Reader", which the masthead does not list, get no such
promise.

**Observed**: step 1's page has the headings "Journal editor" and
"Section editor" only ["Press editor", "Series editor"; OPS
"Moderator"], with David Buskins under "Section editor". Step 5's email
reads:

```
Already assigned roles
1. Section editor
Starting from 2026-10-25
Your name will appear in the Journal of Public Knowledge's masthead as a Section editor.
Newly assigned roles
1. Author
Starting from 2026-10-26
Your name will appear in the Journal of Public Knowledge's masthead as a Author.
```

Step 7's page is unchanged: the same two headings, with no "Author"
heading. Step 9's email repeats the promise for the role he now holds
and for the one offered:

```
Already assigned roles
1. Section editor … Your name will appear in the Journal of Public Knowledge's masthead as a Section editor.
2. Author … Your name will appear in the Journal of Public Knowledge's masthead as a Author.
Newly assigned roles
1. Reader … Your name will appear in the Journal of Public Knowledge's masthead as a Reader.
```


## Cause

`UserRoleAssignmentInvitationNotify::getUserUserGroupSection()` (pkp-lib,
`classes/mail/mailables/UserRoleAssignmentInvitationNotify.php`) writes
the masthead line of each role. Since `pkp/pkp-lib#13370` it writes one
only while the masthead is based on enrollments, and for Reviewer only
while reviewers are listed. Inside that, it chooses the sentence from
the member's own choice for the role, and nothing else:

```php
if ($context->getData('enableEnrollmentMasthead') && ($userGroup->roleId != Role::ROLE_ID_REVIEWER || $context->getData('enableEnrollmentMastheadReviewers'))) {
    if (isset($userUserGroup->masthead) && $userUserGroup->masthead) {
        $sectionMastheadAppear = __('emails.userRoleAssignmentInvitationNotify.userGroupSectionWillAppear', …);
```

For every role except Reviewer, the masthead lists a member only when
two things are true. First, the role's "Consider role in masthead list"
box must be ticked on the role's Edit form; this is the role's `masthead`
attribute. Second, the member's choice for that role
(`user_user_groups.masthead`) must be "Appear".
`AboutContextHandler::editorialMasthead()` takes its roles from
`Repo::userGroup()->getSortedMastheadUserGroups()` (`masthead(true)`,
reviewers excluded). It then takes their members from
`getMastheadUserIdsByRoleIds()`, which keeps those whose choice is
"Appear". `Repo::userGroup()->userOnMasthead()` makes the same two
checks. The mailable makes only the second.

`registry/userGroups.xml` sets `masthead="true"` on these roles:

- OJS and OMP: the editor, section editor, external reviewer and
  "Editorial Board Member" roles;
- OPS: Moderator and "Editorial Board Member".

The wizard has no preselected answer (`masthead: null` in
`UserInvitationUserGroupsTable.vue`). The server requires an answer for
every row (`userGroupsToAdd.*.masthead` is `required|bool` in
`UserRoleAssignmentInvitePayload`). The same method writes both the
"Newly assigned roles" and the "Already assigned roles" sections.
`UserRoleAssignmentReceiveController::finalize()` stores the member's
choice on acceptance, so later invitations repeat it. Storing the choice
is right: it is the member's answer, which the masthead uses once the
role's box is ticked.

The compose step builds its email from an empty stand-in invitation
(`InvitationStepTypes::getFakeInvitation()`, called from
`SendInvitationStep::invitationInvitedEmail()`). Its text carries the
`{$existingRoles}` and `{$rolesAdded}` variables, which are filled in
when the email is sent. So the inviter can delete the whole roles list,
but not the one sentence.

**Reviewers are a separate case.** The masthead lists external reviewers
who completed a review last year
(`getExternalReviewerIdsByCompletedYear()`), only while "Enable listing
of reviewers on the masthead" is on. It reads neither the Reviewer
role's box nor the member's choice. `pkp/pkp-lib#13370` made the
reviewer line follow that setting in the email, the wizard's column and
the accept page. The fix below leaves reviewer rows to that rule.

Reach:

- The masthead change email, `UserRoleMastheadUpdateNotify::setData()`,
  is sent by `PKPUserController::masthead()`. A manager triggers it by
  changing a role's masthead choice on a member's "Edit" page on Users &
  Roles, or in the wizard's rows for roles the person already holds.
  This email also reads only the member's choice: for a Reader it reports
  "New setting: Appear on the masthead". That endpoint refuses reviewer
  rows (since `pkp/pkp-lib#11800`, c22577121b), but it does not read the
  context's masthead setting (both checked in the code).
- The wizard's "Journal Masthead" column and the accept page's roles
  table (`UserInvitationUserGroupsTable.vue`,
  `AcceptInvitationUserRoles.vue`; "Author … Appear on the masthead",
  seen on screen) show the stored choice, not a promise. Since #13370
  they are hidden while the masthead is not based on enrollments, and a
  Reviewer row follows reviewer listing. Whether they should also hide
  the choice for a role the masthead does not list is a product question
  that the fix leaves open.

## Proposed fix

Let the email promise a listing only for a role the masthead lists. In
`getUserUserGroupSection()`, inside #13370's condition:

```diff
-            if (isset($userUserGroup->masthead) && $userUserGroup->masthead) {
+            // The masthead lists a member only for a role it lists ("Consider role in masthead list"),
+            // and only when they chose to appear for it; reviewers are listed by the setting above alone
+            $roleOnMasthead = $userGroup->roleId == Role::ROLE_ID_REVIEWER || $userGroup->masthead;
+            if ($roleOnMasthead && !empty($userUserGroup->masthead)) {
```

([fix.diff](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/invitation-promises-masthead-for-unlisted-roles/fix.diff)).
A role the masthead does not list then gets the existing "Your name will
not appear in {journal}'s masthead as a {role}." This is true when the
email is sent and needs no new string. It covers roles held and offered.
For every role except Reviewer, it is the check the masthead page makes
(`getSortedMastheadUserGroups()`, `userOnMasthead()`). Reviewer rows keep
#13370's rule, as the masthead page lists them by the reviewer setting
and not by the role's box.

Tried on `main`, OJS, OMP and OPS. The walk's emails read "will not
appear … as a Author" and "… as a Reader", and keep "will appear … as a
Section editor" ("Series editor", "Moderator"). The neighbour check
invited Carlo Corino (OMP: Arthur Clark), who holds Author and Reader
with no choice made, to "Editorial Board Member" with "Appear on the
masthead". With and without the fix, the email read "will appear … as a
Editorial Board Member" and "will not appear" for Author and Reader.

**Alternatives**:

- Leave the sentence out for a role the masthead does not list, as
  #13370 does while the masthead is off. This is equally small, but it
  drops a statement that is true.
- Hide the masthead choice for such roles in the wizard. This is a
  product change to two screens, and it still needs the email fix for
  roles already stored as "Appear".

**What goes with it**:

- The masthead change email needs the same rule. For a role whose box is
  unticked, or while the masthead is not based on enrollments,
  `PKPUserController::masthead()` would skip it, or
  `UserRoleMastheadUpdateNotify` would word it differently. The
  confirmation dialog says "The user will be notified of this change",
  so the team picks one. Not tried.
- Ideally the whole question (context setting, reviewer setting, role
  box) becomes one helper on the user group repository, next to
  `userOnMasthead()`, used by both mailables, so both emails ask what
  the masthead page asks.
- No stored data changes. The diff applies as written to
  `stable-3_5_0`, where the method is identical.
- Guard: an end-to-end check that reads the email; the kept script below
  does this. A unit test would be the first mailable test in pkp-lib,
  which has none. It would need the database, because `setData()` reads
  the invitation's payload and the role tables. It would also need a
  saved `UserRoleAssignmentInvite`, and it would have to read the
  rendered `rolesAdded` variable, since the method is private.

Small: one condition in one pkp-lib method.

## Evidence

- The script
  [walk.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/invitation-promises-masthead-for-unlisted-roles/walk.js)
  (helpers in
  [lib.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/invitation-promises-masthead-for-unlisted-roles/lib.js))
  takes steps 1–9 on OJS, OMP and OPS. With `neighbour` as its argument
  it walks only the neighbour check. Each run starts from an install
  freshly loaded from the default dataset:
  `PROBE_FEATURE=<feature> PROBE_AGENT=<id> node bin/probe.js all shared/playwright/checks/issues/invitation-promises-masthead-for-unlisted-roles/walk.js [neighbour]`.
  The fix trial applies the diff with `node bin/try-fix.js apply <fix.diff> ojs omp ops`,
  walks the script and its neighbour, and reverts it; the neighbour was
  walked again on the reverted code.
- The walks showed no failed request and no script error. The server
  log carries the "Undefined array key "invitation_id"" warnings of
  opening the wizard, which U06 A14 covers. The dataset loads the
  Author and Reader assignments with no masthead choice, so their
  sentence reads "will not appear" until an "Appear" is stored. That is
  why the Steps offer the role. The walks ran on PostgreSQL; the fault
  involves no query.
- Datasets: pkp/datasets d1d235a7 (2026-10-25), `main` and
  `stable-3_5_0`; both have `enableEnrollmentMasthead` on and
  `enableEnrollmentMastheadReviewers` unset.
- Branch tips. `main`: OJS d054e2660d, OMP 38bf23300c, OPS fbd57562f4;
  pkp-lib 800863b5dc; ui-library 1f9fb95e. 3.5: OJS 18b464cafd, OMP
  dade65f368, OPS bd726f9b7a; pkp-lib 0f3c36bc2f (OJS, OMP) and
  9a0212faff (OPS); ui-library a12b7523. 3.4: OJS 90c26f8f68; pkp-lib
  83e78a85e5. 3.3: OJS 3ef62492a4; pkp-lib 93722c9179.
- Code reads, `main` and 3.5:
  - `UserRoleAssignmentInvitationNotify`, identical on both lines and in
    the three apps' pkp-lib, and `UserGroupHelper`;
  - `UserRoleAssignmentReceiveController::finalize()` and
    `UserRoleAssignmentInvitePayload`'s rules;
  - `SendInvitationStep::invitationInvitedEmail()`;
  - `AboutContextHandler::editorialMasthead()` and the repository's
    `getSortedMastheadUserGroups()`, `getMastheadUserIdsByRoleIds()` and
    `userOnMasthead()`;
  - `UserRoleMastheadUpdateNotify::setData()` and
    `PKPUserController::masthead()`;
  - ui-library's `UserInvitationUserGroupsTable.vue` and
    `AcceptInvitationUserRoles.vue`, with #13370's commits e3b822c2 and
    1f9fb95e;
  - the three apps' `registry/userGroups.xml`;
  - the setting on upgraded journals: `schemas/context.json` gives
    `enableEnrollmentMasthead` a default of true, which
    `PKPSchemaService::setDefaults()` writes only when a context is
    created (`PKPContextService::add()`); no upgrade migration on either
    line writes it, so an existing journal reads it as unset, off.
- Code reads, 3.4 and 3.3: pkp-lib's `stable-3_4_0` and `stable-3_3_0`
  have no `classes/invitation/` and no per-member masthead choice. Their
  only "masthead" is the journal's Masthead settings form
  (`PKPMastheadForm`).
- Introduced: `git blame` on the inner condition leads to ab68cb6a4d
  (`pkp/pkp-lib#13370`), which only moved it unchanged inside the new context
  check, and before it to 7e3a26ea83, which created the mailable. Later
  commits (e050112af0 for `pkp/pkp-lib#11424`, 714d5d5aa4) only
  reformatted the code around it. The role's `masthead` attribute
  already existed then (`UserGroup::getMasthead()` at that commit).
- Upstream: searched pkp/pkp-lib, pkp/ojs, pkp/omp, pkp/ops and
  pkp/ui-library for the invitation email and the masthead, "will
  appear" masthead, "Consider role", and the method names. Read:
  `pkp/pkp-lib#13370` (closed 2026-10-23; the context-wide settings,
  not the role's box), `pkp/pkp-lib#12628` (the Reviewer role's box
  doing nothing; closed 2026-10-06 as a duplicate of #13370), `pkp/pkp-lib#11424` (closed; the
  email not matching the table's choice, fixed) and `pkp/pkp-lib#11087`
  (closed; the old user form's masthead choice). None is this fault.
- Read in the code, not walked: a role later flagged for the masthead
  lists the members stored as "Appear" (`getMastheadUserIdsByRoleIds()`
  filters on the member's choice); a correction on the member's "Edit"
  page changes the stored choice that later invitations read
  (`PKPUserController::masthead()` updates `user_user_groups.masthead`);
  the fix's reviewer clause, which no default dataset reaches (reviewer
  listing is off there, so a Reviewer row has no line); the compose
  step's body holds the role variables rather than the role lines (the
  walk did not record the editor's contents, but the sent emails carried
  the role lines). Not checked: MySQL. 3.4 and 3.3 were not walked.
