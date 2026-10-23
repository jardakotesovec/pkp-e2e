# "Edit Invitation" logs a PHP warning when the invitee has no Given Name in the interface language

- **Severity** low
- **Effort** small
- **Kind** defect
- **Affects**
  - main: OJS, OMP, OPS
  - 3.5: OJS, OMP, OPS
  - 3.4: none (code; no invitation wizard)
  - 3.3: none (code; no invitation wizard)
- **Introduced** `pkp/pkp-lib#10558` for `pkp/pkp-lib#9658` · [e8bdca4673](https://github.com/pkp/pkp-lib/commit/e8bdca46737fb77d39a7a041cec5f7526dd07835) · 2024-10-24 · Ipula Indeewara (ipula)
- **Upstream** none found as an issue (2026-10-23); a reviewer of the open PR `pkp/pkp-lib#12518` (2026-04-06) noted the same missing check as an older bug, and the PR does not fix it
- **Tracked in** spec U06 [A17](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U06-user-invitations.md#a17)
- **Checked** 2026-10-23, each branch's tip (the commits in Evidence)
- **Model** claude-opus-5-5

## Summary

Each time a manager opens "Edit Invitation" on a pending invitation
sent without a Given Name (the address alone, or a Family Name only),
the server's error log gains `PHP Warning: Trying to access array
offset on null`. The wizard opens and works, headed by the invitee's
email address. Inviting someone by their address alone is an ordinary
path: the wizard does not require a name.

The same code also fails when the invitation has names, but not in the
interface language: names typed in English, then the page opened in
French. There the page heading is empty where the name should stand, and
the log gains three warnings.

The cause is a missing null check where the page reads the name for its
heading. The four warnings every opening of the wizard writes,
whatever the name, have another cause and their own
[report](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/issues/U06-A14-invitation-wizard-logs-php-warnings.md)
(U06 A14).

## Impact

- **Lost.** Nothing. The lines crowd the error log, so real faults in it
  are harder to spot; in another interface language the page heading is
  empty.
- **Who.** Whoever reads the server's error log, on every install where
  managers invite newcomers by address alone and then edit the
  invitation; and managers of a multilingual journal, press or server
  who edit an invitation in another language than the names were typed
  in.
- **Way round.** None in the app; only PHP's own `error_reporting`
  hides the warnings.

Low: the invitation is sent and edited as usual, and the only thing a
manager can see is an empty heading, which names nobody but blocks
nothing.

## Steps to reproduce

Preconditions:
- PKP's default test dataset for `main` (OJS, OMP or OPS), freshly
  loaded; the context `publicknowledge` has English and French.
- PHP logs warnings: `log_errors = On` and `E_WARNING` in
  `error_reporting` (PHP's default includes it); `display_errors = Off`
  under `[debug]` in `config.inc.php`, the dataset's value.
- A view of the server's PHP error log (the terminal running `php -S`,
  or the web server's error log).

No name:
1. Sign in as `rvaca` (the manager) at `/index.php/publicknowledge/login`.
2. Open Settings › "Users & Roles"
   (`/index.php/publicknowledge/en/management/settings/access`).
3. Press "Invite to a role".
4. Type `nameless.hkq23o@mailinator.com` in the search box and press
   "Search User".
5. Leave "Given Name" and "Family Name" empty. In the role row choose
   "Author", today as the start date and "Does not appear on the
   masthead".
6. Press "Save And Continue", then "Invite user to the role".
7. In the "Invitation Sent" dialog press "View All Users".
8. In the "Invitations" table open the menu of
   `nameless.hkq23o@mailinator.com`'s row, press "Edit", then "Edit
   Invitation" in the dialog. The wizard opens on "Enter details"
   (`…/invitation/edit/{id}`).

Name in another language:
9. Repeat steps 2 to 7 for `both.hkq23o@mailinator.com`, typing "Ines"
   in "Given Name" and "Both" in "Family Name" at step 5 (the English
   boxes, the ones the form shows).
10. Open that row's "Edit Invitation" as in step 8. The page is headed
    "Ines Both".
11. Switch the interface to French: the user menu, then "français". The
    same page reloads in French (`…/fr_CA/invitation/edit/{id}`).

**Expected:** steps 8, 10 and 11 add no line to the error log beyond
A14's four `Undefined array key "invitation_id"` warnings, and the page
is headed by the invitee's name or, without one, the address.

**Observed:** each page answers 200. At step 8 the page is headed
"nameless.hkq23o@mailinator.com" and "You are viewing
nameless.hkq23o@mailinator.com's user details", and the error log gains
A14's four lines and this one, stamped with that request's time:

```
PHP Warning:  Trying to access array offset on null in …/lib/pkp/classes/invitation/invitations/userRoleAssignment/handlers/UserRoleAssignmentInviteUIController.php on line 218
```

Step 10 writes A14's four lines alone. At step 11 the page heading is
empty, and the log gains A14's four lines and these three:

```
PHP Warning:  Undefined array key "fr_CA" in …/UserRoleAssignmentInviteUIController.php on line 211
PHP Warning:  Undefined array key "fr_CA" in …/UserRoleAssignmentInviteUIController.php on line 212
PHP Warning:  Undefined array key "fr_CA" in …/UserRoleAssignmentInviteUIController.php on line 218
```

With only "Family Name" typed at step 5 ("Onlyfamily"), step 8 gives the
same line 218 warning.

## Cause

"Edit Invitation" opens `UserRoleAssignmentInviteUIController::editHandle()`
(lib/pkp
`classes/invitation/invitations/userRoleAssignment/handlers/UserRoleAssignmentInviteUIController.php`).
For an invitation to a newcomer it builds `$invitationPayload` from the
stored payload (`UserRoleAssignmentInviteResource::transformInvitationPayload()`),
whose `givenName` and `familyName` are `?array` keyed by language
(`UserRoleAssignmentInvitePayload`). The wizard stores a name only under
the language it was typed in, and stores `null` when none was typed:
the payloads read back from the database after the steps were
`givenName: null, familyName: null` for the address alone,
`givenName: null, familyName: {"en": "Onlyfamily"}` for the Family Name
only, and `{"en": "Ines"}`, `{"en": "Both"}` for the named invitation.

The page's heading lines then index those arrays by the interface
language with no check (lines 209 to 220, the same on `main` and 3.5):

```php
'pageTitle' =>
    ($invitationPayload->givenName && $invitationPayload->familyName) ?
        $invitationPayload->givenName[Locale::getLocale()] . ' '
        . $invitationPayload->familyName[Locale::getLocale()] : $invitationPayload->inviteeEmail
,
'pageTitleDescription' =>
    __(
        'invitation.wizard.viewPageTitleDescription',
        ['name' =>
            $invitationPayload->givenName[Locale::getLocale()] ?
                $invitationPayload->givenName[Locale::getLocale()] : $invitationPayload->inviteeEmail]
    ),
```

`pageTitle` checks that both arrays are non-empty, but not that they
hold the interface language; `pageTitleDescription` checks nothing. With
`givenName` null, line 218 reads an offset of null: PHP 8 warns, the read
gives null and the expression falls back to the address, so the page
looks right. With names in English only and the interface in French,
lines 211, 212 and 218 each read a missing key: three warnings, and
`pageTitle` becomes `" "`, the empty heading.

History: the unguarded read is in the wizard's first version
(`pkp/pkp-lib#10558`). [73b84cf02f](https://github.com/pkp/pkp-lib/commit/73b84cf02f91b9e639e289c9031da8214aa5ed6d)
(2025-04-02) added the fallback to the address, still without a check.
[8b428c8dee](https://github.com/pkp/pkp-lib/commit/8b428c8deed3d59cb58a908e2091a62e7c7e4d71)
(2025-04-11) only moved the lines into this controller.

Reach:

- Invitations to an existing user (read in the code, not walked). For
  an invitation with a `userId`, `editHandle()` builds the payload from
  `$user->getAllData()` (lines 152 to 157), whose names are keyed by the
  languages the user's name is stored in. Every account has a Given
  Name, so the no-name case does not arise, but an account whose name
  has no entry in the interface language warns on the same lines and
  gets the same empty heading. The fix below covers it. (The dataset's
  users have their names in both languages, so they do not show it.)
- `createHandle()`, behind "Invite to a role" and a member's "Edit",
  reads no name for its heading (read in the code).
- The other reads of a name by language in lib/pkp check it first:
  `ReviewerSuggestion` reads `$this->familyName[$locale] ?? ''` (line
  144), and `UserRoleAssignmentInvite::getMailableReceiver()` filters the
  payload's names before it uses them. One more unchecked
  `[Locale::getLocale()]` read in the invitation code,
  `BaseUserRoleAssignmentInviteResource` line 112, reads a role's name,
  not a person's. The default roles have a name in every installed
  language; a role a manager created with its name in one language only
  may warn the same way (read in the code, not walked). It is left out
  of this fix.

## Proposed fix

A proposal, tried on `main` as
[fix.diff](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/invitation-edit-nameless-php-warning/fix.diff):
with it, steps 8, 10 and 11 write A14's four lines alone on every app.
The nameless and Family-Name-only invitations are headed by the address
as before, and "Ines Both" still reads "Ines Both" and "You are viewing
Ines's user details" in English; in French the page is headed by the
address instead of nothing.

Recommended: in `editHandle()`, read each name once with a default, the
way `ReviewerSuggestion` does, and build both strings from those reads:

```diff
+        // A name may be missing (an invitation sent with no names) or not entered in the interface language
+        $givenName = $invitationPayload->givenName[Locale::getLocale()] ?? null;
+        $familyName = $invitationPayload->familyName[Locale::getLocale()] ?? null;
 …
-            'pageTitle' =>
-                ($invitationPayload->givenName && $invitationPayload->familyName) ?
-                    $invitationPayload->givenName[Locale::getLocale()] . ' '
-                    . $invitationPayload->familyName[Locale::getLocale()] : $invitationPayload->inviteeEmail
-            ,
-            'pageTitleDescription' =>
-                __(
-                    'invitation.wizard.viewPageTitleDescription',
-                    ['name' =>
-                        $invitationPayload->givenName[Locale::getLocale()] ?
-                            $invitationPayload->givenName[Locale::getLocale()] : $invitationPayload->inviteeEmail]
-                ),
+            'pageTitle' => ($givenName && $familyName) ? "{$givenName} {$familyName}" : $invitationPayload->inviteeEmail,
+            'pageTitleDescription' => __(
+                'invitation.wizard.viewPageTitleDescription',
+                ['name' => $givenName ?: $invitationPayload->inviteeEmail]
+            ),
```

It covers the three unchecked reads at once, for a newcomer and an
existing user alike, and for a missing name and a missing language.

**Alternatives:**

- Add a check to line 218 alone, as `pageTitle` has one: stops the
  nameless case, and leaves the three warnings and the empty heading in
  another language.
- Fall back to a name in another language, as
  `UserRoleAssignmentInvite::getMailableReceiver()` does for the email's
  greeting, so the French page reads "Ines Both" too: a better heading,
  but a choice of which language to show, for the team to make; not
  tried.

**What goes with it:**

- No stored data, API answer or other page changes: only the two
  heading strings of the "Edit Invitation" page.
- Backport: the diff applies to `stable-3_5_0` as it stands.
- Test: a unit test of `editHandle()`'s page state for an invitation
  with no names and one with names in another language, or an e2e
  scenario that edits a nameless invitation and reads the server log.

Small: two default reads in one method, with a test.

## Evidence

- Kept script, which takes the Steps in the browser on an install loaded
  from PKP's default test dataset (with the Family-Name-only invitation
  beside them; `MODE=nb` runs steps 9 to 11) and records for each "Edit
  Invitation" opening the page's heading and the PHP lines the server
  log gained:
  [walk.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/invitation-edit-nameless-php-warning/walk.js),
  run as `node bin/probe.js <ojs|omp|ops|all> shared/playwright/checks/issues/invitation-edit-nameless-php-warning/walk.js`.
- Branch tips: OJS `main` 3cf9aa91a8, OMP 178e8b34b, OPS 5091e916d9
  (lib/pkp 1f415a07ca, ui-library e47a4887); OJS `stable-3_5_0`
  0b1ae35f04, OMP a150eee76, OPS 18506a5b4d (lib/pkp 5b54f59ed7). Steps
  1 to 8 were walked on all six, with the same line 218 warning on each
  (3.5's A14 lines name `InvitationModel.php` line 95); steps 9 to 11 on
  the three `main` apps, with and without the fix. Datasets:
  pkp/datasets 300c68e (2026-10-22), `pgsql`. No response of 500 or more
  and no page error on any walk.
- 3.5's steps 9 to 11 read in the code only: the controller is
  byte-identical to `main`'s. Invitations to an existing user read in
  the code only (Cause, Reach).
- 3.4 (lib/pkp `stable-3_4_0` 366030b017) and 3.3 (126b86bc2e) read in
  the code: lib/pkp has no `classes/invitation` nor `pages/invitation`
  there, so there is no invitation wizard to edit.
- Introduced, how it was traced: `git blame` on lines 209 to 220 gives
  the move, 8b428c8dee, from `pages/invitation/InvitationHandler.php`;
  `git log -S` in that file gives 73b84cf02f and then e8bdca4673, whose
  PR GitHub's `commits/<sha>/pulls` names (merged 2024-10-31). The 3.5
  move is 92c8eb3bdd, and the code is in every 3.5 tag (3_5_0-0 onward).
  Unverified: whether the wizard of `pkp/pkp-lib#10558` already let an
  invitation go out without a given name.
- Upstream: `pkp/pkp-lib` and `pkp/ojs` searched for the warning's text,
  the class, `editHandle` and `pageTitleDescription`, and
  `pkp/ui-library` for the screen's words (2026-10-23). The review
  [comment on `pkp/pkp-lib#12518`](https://github.com/pkp/pkp-lib/pull/12518#pullrequestreview-4062155496)
  (touhidurabir) quotes the `pageTitle` lines and the undefined index in
  another interface language.
