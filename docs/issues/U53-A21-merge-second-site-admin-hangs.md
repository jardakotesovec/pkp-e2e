# Site Administrator's "Merge user" on another Site Administrator hangs on "Confirm" with no message

- **Severity** low
- **Effort** small
- **Kind** regression
- **Affects**
  - main: OJS, OMP, OPS
  - 3.5: OJS, OMP, OPS
  - 3.4: none (code; the older users grid hides both actions)
  - 3.3: none (code; the older users grid hides both actions)
- **Introduced** `pkp/pkp-lib#12086` (main) and `pkp/pkp-lib#11794` (3.5) for `pkp/pkp-lib#11791` · [e19cbb0a79](https://github.com/pkp/pkp-lib/commit/e19cbb0a7905c082315168d89dc122afc01c46ee) · 2025-11-29 · Hafsa Naeem (Hafsa-Naeem)
- **Upstream** none found (2026-10-21)
- **Tracked in** spec U53 [A21](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U53-users-management.md#a21)
- **Checked** 2026-10-21, each branch's tip (the commits in Evidence)
- **Model** claude-opus-5-5

## Summary

On an install with two Site Administrators, one of them opens Settings ›
Users & Roles › "Users" of a journal where the other holds a role. The
"…" menu on the other administrator's row offers "Merge user", and the
"Merge user" window opens. After "Merge into this User" on another row
and "OK" in the "Confirm" dialog, that dialog stays open with "OK",
"Cancel" and a spinner that keeps turning. No message appears, the
"Merge user" window stays open behind it, and after a reload the account
is still there, unmerged. The administrator expects either the merge or
a message saying it cannot be done, or no "Merge user" on that row.

No one may merge a Site Administrator's account, and the app refuses
it. The same row also offers "Login As", which ends on a page saying
"Sorry, you do not have administrative rights over this user." Both offers come from the same wrong permission flags and go with
one fix. Merging ordinary accounts is not affected and still works.

It needs a second Site Administrator. Released 3.5 sites meet it from
3.5.0-2 on (3.5.0-2 to 3.5.0-5); 3.5.0-1 offered neither action on that
row.

## Impact

- **Lost**: no data. The administrator waits on a "Confirm" dialog that
  never finishes and is never told why.
- **Who**: a Site Administrator of an install with two or more of them,
  on another one's row in any journal, press or preprint server where
  that account holds a role. A rare setup.
- **Way round**: "Cancel" closes the "Confirm" dialog.

Low: the refusal is right and nothing changes; only the offer is wrong
and the refusal is silent. It would rise to medium if allowed merges
hung the same way, but the ordinary merges walked beside this one
complete.

## Steps to reproduce

Preconditions:

- PKP's default test dataset for `main`, OJS, freshly loaded. On OMP
  and OPS the steps are the same; only the role labels differ ("Press
  manager" / "Preprint Server manager" in step 2, and "presses" /
  "servers" in step 8's message).
- A second Site Administrator: `rvaca` (Ramiro Vaca, the journal
  manager). No screen makes one, so it is added in the database the way
  the installer assigns the first one:

  ```sql
  INSERT INTO user_user_groups (user_group_id, user_id, date_start)
  SELECT ug.user_group_id, u.user_id, CURRENT_TIMESTAMP
  FROM user_groups ug, users u
  WHERE ug.role_id = 1 AND ug.context_id IS NULL AND u.username = 'rvaca';
  ```

Merging:

1. Sign in as `admin` (password `admin`).
2. Open Settings › Users & Roles
   (`/index.php/publicknowledge/en/management/settings/access`). In the
   search box type "Vaca" and press Enter. The row "Ramiro Vaca"
   (rvaca@mailinator.com) reads "Journal manager".
3. Press the row's "…". The menu reads "Edit", "Email", "Login As",
   "Remove User", "Disable User", "Merge user".
4. Choose "Merge user". The "Merge user" window opens with the users
   list.
5. In the window press the "Search" link above the list to open its
   search form, type "Barnes" in the box and press the form's "Search"
   button. Press the arrow at the start of Daniel Barnes's row to show
   its actions, and press "Merge into this User".
6. In the "Confirm" dialog press "OK" and wait a few seconds.
7. Reload the page and search for "Vaca" again.

Login As:

8. On Ramiro Vaca's row press "…", choose "Login As" and press "OK" in
   the "Login As" dialog.

**Expected:** a Site Administrator cannot merge another Site
Administrator's account or sign in as it, so Ramiro Vaca's row offers
neither "Merge user" nor "Login As", as the older users grid of 3.4
does; or, when offered, the refusal says why.

**Observed:** step 6 shows:

```
Confirm
Are you sure you wish to merge the account with the username "rvaca" into the account with the username "dbarnes"? The account with the username "rvaca" will not exist afterwards. This action is not reversible.
OK  Cancel
```

"OK" posts to the legacy `UserGridHandler` `merge-users` operation,
which answers 200 with:

```json
{"status":false,"content":"","elementId":"0","events":[]}
```

Three seconds later "Confirm" is still open with "OK", "Cancel" and its
spinner turning, and the "Merge user" window behind it is still open.
No page notice, no browser alert, no error in the server log. After the
reload in step 7 the row still reads "Journal manager" and the menu
offers the same six actions.

Step 8 opens `login/signInAsUser/<id>`, a page headed "People":

```
Sorry, you do not have administrative rights over this user. This may be because:
The user is a site administrator
The user is active in journals you do not manage
This task must be performed by a site administrator.
All Enrolled Users
```

Daniel Barnes's row offers the same six actions, and for him they are
allowed.

## Cause

The row's "Login As" and "Merge user" follow the `canLoginAs` and
`canMergeUsers` flags that pkp-lib's user map computes per row (ui-library
`useUserAccessManagerConfig.js` shows them when true). For a Site
Administrator viewer, `PKP\user\maps\Schema::mapUsersWithPermissions()`
fills the batched permission map with `true` for every user
(`array_fill_keys($userIds, true)`), and `getPropertyCanLoginAs()` and
`getPropertyCanMergeUsers()` return `true` for a Site Administrator
before they even read the map. Neither looks at whether the row's user
is a Site Administrator.

The server enforces the rule those flags should mirror:
`Validation::getAdministrationLevel()` returns `ADMINISTRATION_PROHIBITED`
when the administered user holds the Site Administrator role, before it
considers the viewer. `UserGridHandler::mergeUsers()` then refuses with a
bare `new JSONMessage(false)`, and `LoginHandler::signInAsUser()` shows
`manager.people.noAdministrativeRights`.

The refusal is silent because of the dialog: in
`js/controllers/modal/RemoteActionConfirmationModalHandler.js`,
`$.pkp.controllers.modal.RemoteActionConfirmationModalHandler.prototype.remoteResponse`
closes the "Confirm" dialog only on a `true` status, and in
`js/classes/Handler.js`, `$.pkp.classes.Handler.prototype.handleJson`
shows a refused answer only when it carries `content`. An empty refusal
leaves the dialog waiting.

The flags were right before. They were added to the user schema by PR
`pkp/pkp-lib#10477` for issue `pkp/pkp-lib#10290`. Its second commit,
[e8cfd4c8ef](https://github.com/pkp/pkp-lib/commit/e8cfd4c8ef1043bcfa175d7d660d10c2ab5762ca) (2025-02-10),
computed `canMergeUsers` from `getAdministrationLevel() === FULL` alone
("it fully covers the site admin case"), and `canLoginAs` used
`Validation::canUserLoginAs()`, the same check. That PR also answered
issue `pkp/pkp-lib#10637`, the request for both flags in the users API,
whose own PR `pkp/pkp-lib#10658` was closed without merging. The performance rework
for `pkp/pkp-lib#11791` replaced the per-row query with the batched map
and, for a Site Administrator viewer, with a plain `true`, dropping the
one exception the per-row check made.

Reach:

- The users API: `canLoginAs` and `canMergeUsers` in `GET /users`,
  `GET /users/{id}` and the reviewer lists (`summarizeManyReviewers()`)
  answer `true` for a Site Administrator on another Site Administrator
  (code). A reviewer suggestion's reviewer, mapped alone
  (`ReviewerSuggestionResource`), takes the getters' shortcut (code).
- A manager viewer is not affected: `permissionMapForManager()` answers
  `false` for a Site Administrator, whose role has no context (code;
  the U53 A1/A2 walk shows a manager no "Login As" or "Merge user" on the
  Site Administrator's row).
- The "Merge user" window's own list gates "Merge into this User" on
  `getAdministrationLevel()` (`UserGridRow::initialize()`), so a Site
  Administrator is never offered as the account to merge into (code).
  The walk saw that gate let an ordinary account through: Daniel
  Barnes's row offered "Merge into this User".
- A submission's participants carry their own `canLoginAs`, computed
  with `Validation::canUserLoginAs()` in the submission map, so they are
  right (code).

## Proposed fix

Let the batched map answer for a Site Administrator viewer the way it
answers for a manager: `true` for every user but another Site
Administrator, from one query for the page of users; and let the two
getters read the map instead of returning `true` first. The diff is
[fix.diff](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/merge-second-site-admin-hangs/fix.diff)
against the app root (pkp-lib only):

- `PKP\user\Repository::permissionMapForSiteAdmin(array $userIds)`, beside
  `permissionMapForManager()`: the users of the page holding an active
  Site Administrator role (`UserUserGroup::withUserIds()->withActive()`
  with the group's `withRoleIds([Role::ROLE_ID_SITE_ADMIN])`) map to
  `false`, every other to `true`.
- `PKP\user\maps\Schema::mapUsersWithPermissions()`: the Site
  Administrator branch calls it in place of `array_fill_keys(…, true)`.
- `getPropertyCanLoginAs()` and `getPropertyCanMergeUsers()`: the map
  decides when it is there. A user mapped alone, without the map, keeps
  today's answer for a manager (`false`) and, for a Site Administrator,
  gets `getAdministrationLevel() === ADMINISTRATION_FULL`, one query for
  one user.

```diff
         } elseif ($isSiteAdmin) {
-            $options['permissionMap'] = array_fill_keys($userIds, true);
+            $options['permissionMap'] = Repo::user()->permissionMapForSiteAdmin($userIds);
```

The rule stays in
`Validation::getAdministrationLevel()`; the map mirrors its one
exception for a Site Administrator viewer, as `permissionMapForManager()`
mirrors its rule for a manager.

Tried on OJS, OMP and OPS `main`, with the Steps' precondition in
(`rvaca` a second Site Administrator): signed in as `admin`, Ramiro
Vaca's row offers "Edit", "Email", "Remove User" and "Disable User", and
neither "Merge user" nor "Login As"; Daniel Barnes's row keeps all six.

What the fix must leave alone was checked on the dataset as loaded,
without the precondition, so `admin` is the only Site Administrator and
`rvaca` an ordinary manager. It read the same with the fix in and out:

- signed in as `admin`: Ramiro Vaca's row keeps "Login As" and "Merge
  user"; `admin`'s own row offers "Edit" and "Email"; an author merged
  into another author goes through (the "Merge user" window closes, the
  merged account is gone);
- signed in as `rvaca`: Daniel Barnes's row keeps both actions, and
  `admin`'s row offers neither.

**Alternatives**

- Go back to `getAdministrationLevel()` per row: right, but it brings
  back the per-row queries `pkp/pkp-lib#11791` removed.
- Hide the actions in ui-library when the row's user is a Site
  Administrator: the list's user data does not say so, and the API flags
  would stay wrong for other clients.
- Only give `mergeUsers()` a message: the Site Administrator would still
  be offered two actions that cannot work.

**What goes with it**

- The API's `canLoginAs` and `canMergeUsers` become `false` for a Site
  Administrator viewer on another Site Administrator; nothing else
  changes. No stored data to repair.
- `UserGridHandler::mergeUsers()` still refuses with an empty
  `JSONMessage(false)`, which leaves "Confirm" spinning whenever the
  merge is refused anyway (a list loaded before a role changed). Passing
  `__('grid.user.cannotAdminister')`, as the handler's other refusals do,
  would show the reason in a browser alert; that string tells a Site
  Administrator they "must either be site administrator, or administer
  all contexts", so the team may prefer a string of its own.
- `getPropertyCanLoginAs()` is also changed by the fix proposed for U01
  A4 (`docs/issues/U01-A4-second-login-as-strands-operator.md`); the two
  touch different lines.
- Backport: the diff applies to `stable-3_5_0` as it stands (the same
  lines, offset by one).
- Guard: a pkp-lib unit test of `permissionMapForSiteAdmin()` and of the
  two flags for a Site Administrator viewer on another Site
  Administrator, and an e2e check that the row offers neither action.

Small: a few lines in pkp-lib alone, on an existing pattern, with a
unit test.

## Evidence

- The kept script
  [walk.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/merge-second-site-admin-hangs/walk.js)
  (helpers in
  [lib.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/merge-second-site-admin-hangs/lib.js))
  takes the Steps and the control on each app; `walk.js nb` checks what
  the fix must leave alone (Proposed fix).
- The precondition's SQL writes what `PKPInstall::createData()` writes
  for the first Site Administrator through
  `Repo::userGroup()->assignUserToGroup()`: the site's Site
  Administrator group, the user, `date_start` now. The Settings
  wizard's "User Roles" boxes list the context's roles only.
- Driven on screen on OJS, OMP and OPS `main` and `stable-3_5_0`, on
  PostgreSQL; the fault does not depend on the database. Dataset:
  pkp/datasets 5f247d04 (2026-10-20). No request answered 500 and no
  script error was recorded.
- Tips: `main` OJS 3109a59114 (lib/pkp f37a174626, lib/ui-library
  99abe252), OMP 5777025bec and OPS f048e747b4 (lib/pkp 042726ebf6,
  lib/ui-library 99abe252); `stable-3_5_0` OJS 1e78ca0c2b, OMP
  cce424e5ef, OPS 5eca7fd603 (lib/pkp 68512b5fda, lib/ui-library
  2576e00a).
- Code reads: the classes the Cause names, the same on `main` and
  `stable-3_5_0`. On `stable-3_4_0`, `UserGridRow` adds "logInAs" and "mergeUser" only when
  `getAdministrationLevel() === ADMINISTRATION_FULL`, so a Site
  Administrator's row offers neither; on `stable-3_3_0` the same with
  `Validation::canAdminister()`, which refuses a Site Administrator
  target.
- The trace: `git blame` on the getters' `if ($isSiteAdmin) return true`
  and the map's `array_fill_keys($userIds, true)` gives e19cbb0a79
  (main, `pkp/pkp-lib#12086`, merged 2025-12-01) and its 3.5 twin
  d3a71179ba (`pkp/pkp-lib#11794`, merged 2025-11-28), both for
  `pkp/pkp-lib#11791`. Before it, 67ffa3ee0f (2025-02-03) had computed
  `canMergeUsers` as `isSiteAdmin() || FULL`, already wrong for this row,
  and e8cfd4c8ef (2025-02-10) of the same PR, `pkp/pkp-lib#10477`, made
  it `FULL` alone. The 3.5 commit is in the tags `3_5_0-2` to
  `3_5_0-5`.
