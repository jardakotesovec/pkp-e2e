# The Settings wizard's "Users" grid still lists a role the Site Administrator just removed

- **Severity** low
- **Effort** small
- **Kind** defect
- **Affects**
  - main: OJS, OMP, OPS
  - 3.5: OJS, OMP, OPS
  - 3.4: none (code; roles carry no dates)
  - 3.3: none (code; no "Roles" column)
- **Introduced** `pkp/pkp-lib#11274` (main; `pkp/pkp-lib#11216` on 3.5) for `pkp/pkp-lib#11014`, `pkp/pkp-lib#11016`, `pkp/pkp-lib#11026` · [73b84cf02f](https://github.com/pkp/pkp-lib/commit/73b84cf02f91b9e639e289c9031da8214aa5ed6d) · 2025-04-02 · ipula (ipula)
- **Upstream** none found (2026-11-17)
- **Tracked in** spec U53 [A17](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U53-users-management.md#a17)
- **Checked** 2026-11-17, each branch's tip (the commits in Evidence)
- **Model** claude-opus-5-5

Update 2026-11-17: `pkp/pkp-lib#13552` (`pkp/pkp-lib#13555` on `main`,
`pkp/pkp-lib#13554` on 3.5) fixed this report's other half: the grid
now lists roles that have no start date, such as the Site
Administrator's and those carried over from 3.4. That change left the
role just ended as it was, so the report now covers that alone, and its
severity drops from medium to low.

## Summary

On the "Users" tab of a journal's, press's or server's Settings wizard
(Administration), the Site Administrator unticks a role on a user's
"Edit User" and presses "OK". "User edited." shows, but the user's
refreshed row can still list the removed role beside the others.
Settings › Users & Roles, the users list managers work in every day,
is not affected.

Nothing is stored wrong: the role has ended, "Edit User" shows it
unticked, and the row reads right after a reload. The row is wrong
only when the grid's refresh comes in the same second as the save,
which happened in five of seven tries.

## Impact

- **Lost**: nothing. The save is right, and nothing else reads the
  row.
- **Who**: the Site Administrator, the only role with "Edit User" on
  the wizard's "Users" tab, each time they take a role away there.
  Managers on Settings › Users & Roles do not meet it.
- **Way round**: reload the page.

Low: one screen of the administration area shows a wrong role until
the next reload.

## Steps to reproduce

Preconditions:

- PKP's default test dataset for `main` (OJS, OMP or OPS), freshly
  loaded. Nothing else is needed.

Steps:

1. Sign in as `admin` (password `admin`).
2. Open Administration › "Hosted Journals" ("Hosted Presses" on OMP,
   "Hosted Servers" on OPS).
3. Press the arrow at the start of the `publicknowledge` row, then
   "Settings wizard" (`/index.php/index/en/admin/wizard/1`).
4. Open the tab "Users".
5. Press "Search" above the list, type `jjanssen` (OPS: `minoue`) in
   the "Search" box and press the form's "Search" button. Julie
   Janssen's row reads "Reviewer" under "Roles" (OMP: "Internal
   Reviewer"; OPS, Minoti Inoue: "Moderator").
6. Open the browser's network panel. Press the arrow at the start of
   the row, then "Edit User".
7. Under "User Roles", untick "Reviewer" ("Internal Reviewer",
   "Moderator") and tick "Reader". Press "OK".
8. Read the row under "Roles" as soon as the window closes. Compare
   the `Date` headers of the `…/user-grid/update-user` and
   `…/user-grid/fetch-row` responses. The symptom needs the refresh in
   the second the save ended the role. If the refresh came a second
   later, the row reads "Reader" and the try proves nothing: repeat
   steps 5–8 on another user whose row reads "Author, Reader" (OJS and
   OPS: `ccorino`; OMP: `aclark`), unticking "Author" and leaving
   "Reader" ticked.
9. Wait a second, reload the page, open the tab "Users" again and
   search for the user as in step 5.

The screen steps depend on timing. A reproduction that does not is
lib/pkp's unit test with the case the
[fix.diff](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/users-grid-roles-admin-empty-ended-listed/fix.diff)
adds: apply only its `UserUserGroupTest.php` hunk and run
`lib/pkp/lib/vendor/bin/phpunit -c lib/pkp/tests/phpunit.xml --filter UserUserGroupTest lib/pkp/tests/classes/userGroup/UserUserGroupTest.php`
from the root of an installed test site. It fails on today's code, because the role ended
"now" is listed.

**Expected**: in step 8, the row reads "Reader" (on the author's
retry, "Reader" too).

**Observed**: in step 8, "User edited." shows and the row reads
"Reviewer, Reader" ("Internal Reviewer, Reader"; "Moderator, Reader";
on the author's retry, "Author, Reader"). In step 9 it reads "Reader".
The save stored the role as ended in its own second, and the refresh
came in that second:

```
Reviewer | date_start 2026-11-16 00:00:00 | date_end 2026-11-17 04:16:35
POST …/grid/settings/user/user-grid/update-user   200  Date: Tue, 17 Nov 2026 04:16:35 GMT
GET  …/grid/settings/user/user-grid/fetch-row     200  Date: Tue, 17 Nov 2026 04:16:35 GMT
```

## Cause

The grid's "Roles" column (lib/pkp `UserGridHandler::initialize()`,
the `roles` column's `getTemplateVarsFromRow()`) lists each of the
user's groups in the context that has an assignment matching
`UserUserGroup::scopeWithActiveAndActiveInFuture()`
(`classes/userGroup/relationships/UserUserGroup.php`). That scope
writes its own version of "active" instead of using
`scopeWithActive()`, the rule beside it that every other reader uses.

The two disagree on a role whose end is now. The scope keeps it,
`->orWhere('user_user_groups.date_end', '>=', $currentDateTime)` (line
138 on `main`), where `scopeWithActive()` compares with `>`, as does
every other reader of `date_end` in lib/pkp `classes/`
(`scopeWithEnded()` counts `<=` as ended).
`Repo::userGroup()->endAssignments()`, which "Edit User"
(`UserForm::saveUserGroupAssignments()`) calls for each unticked role,
stamps `date_end` with `Core::getCurrentDate()`, the save's second. So
the `fetch-row` the grid sends after "OK", or a reload, still lists the
role when it comes in that second.

73b84cf02f replaced `withActive()` in the column with this new scope so
that the grid also lists roles that begin in the future, such as a role
invitation with a later start date. `pkp/pkp-lib#13555` fixed the
scope's other disagreement with `scopeWithActive()` (a role without a
start date) in place, leaving the copy and its `>=`.

Reach:

- The column is the one grid behind the wizard's "Users" tab and the
  "Merge user" window (`UserGridHandler::mergeUsers()`); only "Edit
  User" on the wizard ends a role and refreshes the row in the same
  second (code).
- No other code calls `scopeWithActiveAndActiveInFuture()` besides
  lib/pkp's `UserUserGroupTest` (checked in the code, `main`).
- Settings › Users & Roles is not affected, for another reason: the
  REST API's `Repo::user()->preloadGroups()` returns every assignment
  with its `dateEnd`, ended or not, and ui-library's
  `UserAccessManagerCellUserGroups.vue` shows a role's name only when
  `!userGroups.dateEnd`. A role ended this second has its `dateEnd`, so
  it is hidden (code).
- "Edit User" itself reads the roles with `withActive()`, so it shows
  the ended role unticked (code).

## Proposed fix

Build the scope from the two scopes that already define the rule, so
that "active or starting later" means `withActive()` or
`withActiveInFuture()` and cannot drift a third time
([fix.diff](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/users-grid-roles-admin-empty-ended-listed/fix.diff)):

```diff
     public function scopeWithActiveAndActiveInFuture(Builder $query): Builder
     {
-        $currentDateTime = Core::getCurrentDate();
-        return $query
-            ->where(function ($q) use ($currentDateTime) {
-                …
-            })
+        return $query->where(
+            fn (Builder $query) => $query->withActive()
+                ->orWhere(fn (Builder $query) => $query->withActiveInFuture())
+        )
             ->orderBy('user_user_groups.date_start', 'asc');
     }
```

A role without a start date stays listed, as `pkp/pkp-lib#13552`
wants, and roles that begin in the future stay listed, as 73b84cf02f
intended. Tried on OJS, OMP and OPS `main`: with the fix in, the
edited row read "Reader" in step 8, although on every app the refresh
came in the second the role ended. The roles of `admin`, `rvaca`,
`dbarnes`, an author and a reviewer on the wizard grid read the same
with the fix in and out.

**Alternatives**:

- Make the `>=` a `>` in place. One character, and it works, but it
  keeps a second copy of a rule that has now drifted from the first
  twice.
- Go back to `withActive()` in the column. That drops the future roles
  the change was made for.

**What goes with it**:

- No stored data needs repair.
- The guard: the diff adds a role ended "now" to lib/pkp's
  `UserUserGroupTest::testWithActiveAndActiveInFutureIncludesAssignmentsWithoutStartDate()`,
  which `pkp/pkp-lib#13555` added. Run three times on OJS `main`
  without the scope change, it failed each time
  (`Tests: 1, Assertions: 1, Failures: 1`); with it, it passed each
  time. It can
  pass on the old code only if the insert and the query fall in
  different seconds.
- Backport: the diff applies as it stands to pkp-lib's
  `stable-3_5_0`, which carries `pkp/pkp-lib#13554`, and so to OJS 3.5,
  which points at it. OMP and OPS 3.5 still point at an older pkp-lib
  (5af8e67ab4): there the `>=` is on line 135, the scope still has the
  `whereNotNull` that `pkp/pkp-lib#13554` removed, and there is no
  `UserUserGroupTest.php`, so the test half of the diff has nothing to
  apply to until those apps move their pkp-lib forward.

Small: one method in one shared class, built from the two scopes beside
it, plus one more case in the existing test.

## Evidence

- The kept script
  [walk.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/users-grid-roles-admin-empty-ended-listed/walk.js)
  (helpers in
  [lib.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/users-grid-roles-admin-empty-ended-listed/lib.js))
  takes the Steps and records the response `Date` headers and the
  stored role dates. Its `redrive` mode takes steps 2–8 alone; its `nb`
  mode reads the roles of rows the fix must leave alone. On an install
  freshly loaded from the default dataset:
  `PROBE_FEATURE=<feature> PROBE_AGENT=<id> node bin/probe.js all shared/playwright/checks/issues/users-grid-roles-admin-empty-ended-listed/walk.js [redrive|nb]`.
- Driven on screen on OJS, OMP and OPS on `main` and on
  `stable-3_5_0`, on PostgreSQL. Dataset: pkp/datasets 64c473a1
  (2026-11-16). Step 8 listed the ended role on OJS `main` and on all
  three apps on 3.5. On OPS `main` the walk's refresh came a
  second after the role's end and read "Reader"; the one re-drive
  listed "Moderator, Reader". On OMP `main` both tries
  (the walk and the re-drive) had the refresh a second after the end
  and read "Reader"; the "main: OMP" entry rests on OMP `main` running
  the same lib/pkp commit as OJS and OPS `main`, and on OMP 3.5's walk.
  The author retry of step 8 was not needed on 2026-11-17; its
  "Author, Reader" is from the campaign's run of 2026-09-26 on OJS and
  OPS, on the same `>=` line (unchanged since 73b84cf02f).
- Tips: `main` OJS 925ed49f3b, OMP 92dd31031, OPS d75f514776 (lib/pkp
  3ed5d1c3b3 in all three); `stable-3_5_0` OJS 8e3538b5b5 (lib/pkp
  ce80b77676, with `pkp/pkp-lib#13554`), OMP 3f0fd0a7d and OPS
  e290d8d8af (lib/pkp 5af8e67ab4, without it; the `>=` line is the same
  in both); pkp-lib `stable-3_4_0` 2dd24cc5ae, `stable-3_3_0`
  df738d3a66.
- Code reads: on `main` and `stable-3_5_0`, `UserUserGroup` (the
  scopes; blame of line 138 reaches 8ac8f5fafa, a re-indent in
  `pkp/pkp-lib#11424`, and at its parent 73b84cf02f),
  `UserGridHandler::initialize()` (the column),
  `UserForm::initData()` and `saveUserGroupAssignments()`,
  `Repository::endAssignments()`, `user\Repository::preloadGroups()`
  and ui-library's `UserAccessManagerCellUserGroups.vue`, and every
  `date_end` comparison in lib/pkp `classes/` (`UserGroup`, `RoleDAO`,
  `user\Collector`, `NotificationSubscriptionSettingsDAO`, `ContextDAO`,
  `PKPContextQueryBuilder`: all `>`). On `stable-3_4_0`, `UserGridHandler.php` (the column reads
  `Repo::userGroup()->userUserGroups()`) and
  `RolesAndUserGroupsMigration.php` (no date columns). On
  `stable-3_3_0`, `UserGridHandler.inc.php` (columns "Given Name",
  "Family Name", "Username", "Email").
- Upstream: `pkp/pkp-lib#13552` and `pkp/pkp-lib#13758` (closed) cover
  the start-date half only; `pkp/pkp-lib#13498` (open, a user search
  matching ended roles) is another query.
- The fix trial: `node bin/try-fix.js apply <fix.diff> ojs omp ops`,
  the walk on a fresh install, then the `nb` mode with the fix in and,
  after `revert`, out.
- The unit test: run on OJS `main` (PHP 8.3.36, PHPUnit 11.5.50,
  PostgreSQL) against an install loaded from the default dataset,
  three times with only the diff's test hunk in and three times with
  the whole diff. Each run printed its result, then a PHP fatal at
  shutdown from `PKPQueueProvider`, which could not read the checkout's
  `config.inc.php` (that install runs on another config file); the
  result lines come before it. Not run on OMP, OPS or 3.5.
- MySQL not checked (the comparison is database-neutral).
