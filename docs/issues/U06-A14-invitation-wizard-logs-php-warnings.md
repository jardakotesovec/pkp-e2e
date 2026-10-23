# Each opening of the "Invite to a role" wizard writes PHP warnings to the server's error log

- **Severity** low
- **Effort** small
- **Kind** regression
- **Affects**
  - main: OJS, OMP, OPS
  - 3.5: OJS, OMP, OPS (since 3.5.0-4)
  - 3.4: none (code; no invitation wizard)
  - 3.3: none (code; no invitation wizard)
- **Introduced** `pkp/pkp-lib#12462` for `pkp/pkp-lib#11803` · [cff680634e](https://github.com/pkp/pkp-lib/commit/cff680634ef0c36c567b30cef00f1fb3de8ee12b) · merged 2026-03-19 · Dimitris Efstathiou (defstat); on 3.5 by `pkp/pkp-lib#12431` ([58d31da09d](https://github.com/pkp/pkp-lib/commit/58d31da09d0021e3bef73287591c4b85c1e23e94)), first released in 3.5.0-4
- **Upstream** `pkp/pkp-lib#13049` (open; fix in PR `pkp/pkp-lib#13230`, not yet in main: merging it is the whole fix for `main`, and 3.5 needs the same one-line change)
- **Tracked in** spec U06 [A14](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U06-user-invitations.md#a14)
- **Checked** 2026-10-23, each branch's tip (the commits in Evidence)
- **Model** claude-opus-5-5

Update 2026-10-23: walked again on today's `main` and 3.5, unchanged.
New: a fifth warning on "Edit Invitation" for an invitation with no
Given Name, of another cause (U06
[A17](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U06-user-invitations.md#a17)); see Observed.

## Summary

Each time a manager opens the invitation wizard, the server's error log
gains PHP warnings `Undefined array key "invitation_id"`: two for each
form language of the journal, so four on a journal with English and
French. It happens on all three ways in: "Invite to a role" on Users &
Roles, a pending invitation's "Edit" › "Edit Invitation", and "Edit" on
a member in the users list.

The fault behind the warnings changes nothing else: no screen shows
them, and the wizard works. The invitation is sent and edited as usual,
and its email links carry the invitation's id.

Opening "Edit Invitation" on an invitation with no Given Name adds a
fifth warning, of another cause (U06
[A17](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U06-user-invitations.md#a17)),
which the fix proposed here does not reach.

## Impact

- **Lost.** Nothing. The lines crowd the error log, so real faults in it
  are harder to spot.
- **Who.** Whoever reads the server's error log, on every install where
  managers invite users or edit members' roles.
- **Way round.** None in the app; only PHP's own `error_reporting` hides
  them.

## Steps to reproduce

Preconditions:
- PKP's default test dataset for `main` (OJS, OMP or OPS), freshly
  loaded; the context `publicknowledge` has English and French.
- PHP logs warnings: `log_errors = On` and `E_WARNING` in
  `error_reporting` (PHP's default, `E_ALL & ~E_DEPRECATED & ~E_STRICT`,
  includes it); `display_errors = Off` under `[debug]` in
  `config.inc.php`, the dataset's value.
- A view of the server's PHP error log (the terminal running `php -S`,
  or the web server's error log).

Steps:
1. Sign in as `rvaca` (the manager) at `/index.php/publicknowledge/login`.
2. Open Settings › "Users & Roles"
   (`/index.php/publicknowledge/en/management/settings/access`).
3. Press "Invite to a role". The wizard opens on "Search User"
   (`/index.php/publicknowledge/en/invitation/create/userRoleAssignment`).
4. Type `nora.h15k@mailinator.com` in the search box and press "Search
   User".
5. Type "Nora" in "Given Name". In the role row choose "Author", today
   as the start date and "Does not appear on the masthead".
6. Press "Save And Continue", then "Invite user to the role".
7. In the "Invitation Sent" dialog press "View All Users".
8. In the "Invitations" table open the menu of
   `nora.h15k@mailinator.com`'s row, press "Edit", then "Edit
   Invitation" in the dialog. The wizard opens on "Enter details"
   (`…/invitation/edit/{id}`).
9. Back on "Users & Roles", search "Buskins" and press "Edit" in David
   Buskins's row menu. The wizard opens on "Enter details"
   (`…/management/settings/user/{id}`).

**Expected:** the error log gains no line at steps 3, 8 and 9.

**Observed:** the page that opens at each of steps 3, 8 and 9 answers
200, and while it loads the error log gains four of these lines (two
per form language), stamped with that request's time (the `php -S`
terminal prints them just before the page's request line):

```
PHP Warning:  Undefined array key "invitation_id" in …/lib/pkp/classes/invitation/models/InvitationModel.php on line 146
```

On 3.5 the line names line 95. Steps 4 to 7 (search, details, send)
add nothing.

Steps 3 to 8 taken again with another address
(`noname.hkq23p@mailinator.com`, or Nora's on a freshly loaded
dataset), "Given Name" left empty at step 5 and that address's row
opened at step 8, give step 8 a fifth line, of another cause (U06
[A17](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U06-user-invitations.md#a17)):

```
PHP Warning:  Trying to access array offset on null in …/lib/pkp/classes/invitation/invitations/userRoleAssignment/handlers/UserRoleAssignmentInviteUIController.php on line 218
```

## Cause

Every way into the wizard builds its email step ("Review & invite for
roles") through `SendInvitationStep::invitationInvitedEmail()`, which
hands the email composer a `UserRoleAssignmentInvitationNotify` mailable
built on a new, unsaved invitation
(`InvitationStepTypes::getFakeInvitation()`), even when a saved one is
being edited. Since `pkp/pkp-lib#12462`, `Email::getState()`
(`classes/invitation/sections/Email.php`) fills the composer's variables
through `getVariables()`, which calls `$mailable->getData($locale)` for
each of the context's form languages (`getSupportedFormLocales()`). The
mailable's `setData()` asks the invitation for its accept and decline
addresses (`getActionURL()`), and `InvitationHandler::getActionUrl()`
reads `$invitation->getId()` first: two reads per language.

`Invitation::getId()` returns `$this->invitationModel->id`, and the
model's accessor `InvitationModel::id()` (lib/pkp
`classes/invitation/models/InvitationModel.php`, line 146) reads the key
without checking it is there:

```php
get: fn ($user, $attributes) => $attributes['invitation_id'],
```

An unsaved model has no `invitation_id` attribute, so PHP 8 warns and
the read gives null. Everything after it expects that null:
`Invitation::getId()` is typed `?int`, and `getActionUrl()` returns null
without an id, so the composer's preview keeps `{$acceptUrl}` and
`{$declineUrl}` as placeholders, and the email sent later is built on
the saved invitation, with its id in the links. Each of the 15 other
models in lib/pkp with an `id()` accessor reads it as
`$attributes[$this->primaryKey] ?? null` (`Note`, `Notification`,
`StageAssignment`, `EmailLogEntry`, `EditorialTask`, `ModelWithSettings`
and nine more); `InvitationModel` alone has no default. The accessor is
as old as the model
([596057ddfb](https://github.com/pkp/pkp-lib/commit/596057ddfbb8645b516584f664be1d55751b61ee),
`pkp/pkp-lib#9200`, 2023), but no page read the id of an unsaved
invitation until `getVariables()` was added. 3.5.0-0 to 3.5.0-3 had the
wizard and the same accessor without `getVariables()`, so they opened it
without warnings (read in the code at their tags, not walked).

Reach:

- The three ways into the send wizard (walked): "Invite to a role"
  (`createHandle()`), "Edit Invitation" (`editHandle()`) and a member's
  "Edit" (`createHandle()` with the user). Each opening writes two
  lines per form language, the composer's reads and no others, so
  nothing else on these pages reads the id of the unsaved invitation.
  The fifth line on a nameless invitation (A17) comes from
  `editHandle()`'s `pageTitleDescription`, which indexes a null
  `givenName`; it reads no id. Searching, saving the details and
  sending write none (walked): the details step saves the invitation
  before anything reads its id.
- `InvitationModel::status()` reads `$attributes['status']` the same
  way, but every caller reads it on a stored invitation (read in the
  code), so it stays out of the fix.

## Proposed fix

A proposal, tried on `main` as
[fix.diff](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/invitation-wizard-php-warnings/fix.diff):
with it, the Steps add no line to the log on any app. Checked both
with and without the fix, with the same result: a sent invitation's
accept and decline links carry its id, "Edit Invitation" opens that id, and the
accept link opens the account step.

Recommended: give `InvitationModel::id()` the getter the other `id()`
accessors use:

```diff
     public function id(): Attribute
     {
         return Attribute::make(
-            get: fn ($user, $attributes) => $attributes['invitation_id'],
+            get: fn ($value, $attributes) => $attributes[$this->primaryKey] ?? null,
             set: fn ($value) => ['invitation_id' => $value]
         );
     }
```

The fix in the accessor covers every caller at once. `pkp/pkp-lib#13230`
makes the same change with the key written out
(`$attributes['invitation_id'] ?? null`) and adds a unit test.

**Alternatives:**

- Skip `getActionURL()` in the mailable when the invitation has no id:
  stops this caller only, and the next code that reads the id of a new
  invitation warns again.
- Build the composer's preview without a mailable bound to an
  invitation: a larger change to the send step for the same result.

**What goes with it:**

- No stored data changes, and no API answer changes: a saved
  invitation's id reads as before.
- Backport: the same change applies to 3.5's accessor; this diff's
  line numbers do not.
- Guard: the unit test of `pkp/pkp-lib#13230` (a new `InvitationModel`
  reads its id as null).

## Evidence

- Kept script, which takes the Steps in the browser on an install loaded
  from PKP's default test dataset and records, for each step, the PHP
  lines the server log gained:
  [walk.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/invitation-wizard-php-warnings/walk.js),
  run as `node bin/probe.js <ojs|omp|ops|all> shared/playwright/checks/issues/invitation-wizard-php-warnings/walk.js`
  with `PROBE_FEATURE` naming the dataset install; `MODE=nb` runs the
  check of the links and the "Edit Invitation" id. Its steps 10 and 11
  are the nameless case (address `noname.hkq23p@mailinator.com`). The
  fix was applied with `node bin/try-fix.js apply shared/playwright/checks/issues/invitation-wizard-php-warnings/fix.diff ojs omp ops`.
- Branch tips walked on 2026-10-23: OJS `main` 3cf9aa91a8, OMP `main`
  178e8b34b2, OPS `main` 5091e916d9 (lib/pkp 1f415a07ca); OJS
  `stable-3_5_0` 0b1ae35f04, OMP a150eee76b, OPS 18506a5b4d (lib/pkp
  5b54f59ed7). `stable-3_4_0` (OJS 3bedd21383, lib/pkp 366030b017) and
  `stable-3_3_0` (OJS 06f01c8010, lib/pkp 126b86bc2e) read in the code:
  lib/pkp has no `classes/invitation` there. Datasets: pkp/datasets
  300c68e (2026-10-22), `pgsql`. PHP's CLI server ran with
  `log_errors = 1` and `error_reporting = 22527`.
- The fix was tried on 2026-10-15, on `main` at OJS 378eced941, OMP
  f4836d4fb, OPS 2ece50497f (lib/pkp b17fadae59). `git log
  b17fadae59..1f415a07ca -- classes/invitation` in lib/pkp is empty, as
  is `4045d9241e..5b54f59ed7` on 3.5, so the trial stands on today's
  code and was not repeated.
- The nameless case (U06 A17) at `UserRoleAssignmentInviteUIController.php`
  line 218: the `pageTitle` line above it checks `givenName &&
  familyName` first, `pageTitleDescription` does not; the line is the
  same on 3.5 (read in the code at both tips).
- Introduced: `git log -S'mailable->getData'` on `Email.php` gives
  cff680634e on `main` and 58d31da09d on `stable-3_5_0`; GitHub's
  `commits/<sha>/pulls` names `pkp/pkp-lib#12462` (opened by
  blesildaramirez) and `pkp/pkp-lib#12431`, both merged 2026-03-19.
  The 3.5 commit is in the tags 3_5_0-4 and 3_5_0-5 and not in 3_5_0-3.
- `pkp/pkp-lib#13049` (opened 2026-07-15, on OJS 3.5.0-5) reports the
  same warning and accessor, but blames the invitation resource's
  serialisation; the browser reproduction traces the lines to
  `Email::getVariables()`. `pkp/pkp-lib#13127` and `pkp/pkp-lib#13216`
  quote the line beside other faults.
- Unverified: whether, with `display_errors = On`, the warnings print
  into the wizard's page (`pkp/pkp-lib#13049` says they are "shown to
  the user"). Also unverified: 3.5.0-3 opening the wizard without
  warnings, which rests on the code at its tag.
