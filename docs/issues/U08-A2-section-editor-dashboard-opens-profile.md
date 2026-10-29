# A Section or Guest Editor's "Dashboard" on the journal's public pages opens the Profile page, with no task count

- **Severity** low
- **Effort** small
- **Kind** regression
- **Affects**
  - main: OJS (Section and Guest Editor), OMP, OPS
  - 3.5: OJS (Section and Guest Editor), OMP, OPS
  - 3.4: OJS (Section and Guest Editor), OMP, OPS (code)
  - 3.3: OJS (Section and Guest Editor), OMP, OPS (code)
- **Introduced** `pkp/pkp-lib#2917` for `pkp/pkp-lib#2910` · [39912fe](https://github.com/pkp/pkp-lib/commit/39912fe17912b83edfedb7897fb28a686a85e1c4) (the Profile address) and [03f1cbe](https://github.com/pkp/pkp-lib/commit/03f1cbea007f65c59ebf8812c66f3287ce46dd38) (the count) · 2017-10-23 · Dimitris Efstathiou (defstat)
- **Upstream** none found (2026-10-29)
- **Tracked in** U08 [A2](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U08-navigation-menus-and-site-chrome.md#a2), U05 [A3](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U05-notifications-center-and-email-preferences.md#a3)
- **Checked** 2026-10-29, each branch's tip (the commits in Evidence)
- **Model** claude-opus-5-5

Update 2026-10-26: pkp-lib
[00ce12b](https://github.com/pkp/pkp-lib/commit/00ce12be776175920847e3da4910617c47af290c)
(`pkp/pkp-lib#13597` for `pkp/pkp-lib#13553`; on 3.5 `pkp/pkp-lib#13596`)
sends the site administrator's "Dashboard" on the site's own pages to
their Profile page. That is what it set out to do: `pkp/pkp-lib#13553`
reported that the link led back to the same site page, and the team chose
the Profile page, "as it does for the other users and did in 3.3". It
changes nothing on a journal's pages, where this fault is, and the walks
on `main` and 3.5 show the fault unchanged. The fix below now keeps that
change.

Update 2026-10-29: from the Profile page, the way back to the Dashboard
takes two presses: the side menu's closed "Editor Dashboard" group, then
"Assigned to me" in it. The fault itself is unchanged on `main` and 3.5.

## Summary

On a journal's public pages, "Dashboard" in the menu under the signed-in
user's name takes a Journal Manager or Editor, an assistant, a Reviewer
or an Author to the page they work from. A Section Editor
(Series Editor on a press, Moderator on a preprint server), or on OJS a
Guest Editor, who holds none of those roles is taken to their Profile page
instead, although signing in put them on the Dashboard.

They never see their number of unread tasks on the public pages either.
It is missing beside their name in the header. In a narrow window or on a
phone, the header collapses into an "Open Menu" list, and its "Dashboard"
entry has no number either. The other roles see the number in both places.

A separate fault hides every role's number beside the name when a journal
has more than one language under "Forms"
([U05 A15](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U05-notifications-center-and-email-preferences.md#a15)).
On such a journal the other roles still see it after "Dashboard" in the
narrow menu, and these editors do not.

Their "Dashboard" has led to the Profile page since 3.1 (2017); 3.0
took them to their submissions.

## Impact

- **Lost**: nothing.
- **Who**: a Section Editor, or on OJS a Guest Editor, who holds no
  Author, Reviewer, assistant or manager role in the journal, using the
  menu under their name on its public pages. The address and the count
  come from pkp-lib's menu code, not from the theme; walked with the
  default theme.
- **Way round**: on the Profile page, press "Editor Dashboard" in the side
  menu, which opens that group in place, then one of the entries under it,
  such as "Assigned to me", which opens the Dashboard (3.4 and 3.3:
  "Submissions" in the side menu, one press). Neither the journal's name
  in the header, which opens the journal's home page, nor the menu under
  the user's initials leads there. The bell on every editorial page
  counts their tasks.

Low: a misleading link and a missing count, with nothing lost and the
Dashboard two presses away from the Profile page.

## Steps to reproduce

Preconditions:

- PKP's default test dataset, OJS `main` (OMP and OPS the same).
- The journal's languages are English and French, both ticked in the
  "Forms" column of Settings › Website › "Setup" › "Languages". With French
  there, no user's name in the header carries the count, whatever their
  role. That is a separate fault
  ([U05 A15](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U05-notifications-center-and-email-preferences.md#a15)),
  so step 1 takes French out of "Forms".
- `dbuskins` (David Buskins) is a Section editor of `publicknowledge`
  (a Series editor on OMP, a Moderator on OPS), holds no other role there,
  and has unread tasks. `dbarnes` (Daniel Barnes, Journal editor; Press
  editor on OMP, Preprint Server manager on OPS) is compared with them.
- The dataset holds no Guest Editor, so steps 7 to 9 invite one on OJS
  (a press and a preprint server have no such role) and give them a task.

Steps:

1. Sign in as `dbarnes` (password `dbarnesdbarnes`). Open "Settings" ›
   "Website" › "Setup" › "Languages" and untick the box in the "Forms"
   column of the French row; the change saves at once. Then "Logout".
2. Sign in as `dbuskins` (password `dbuskinsdbuskins`) on the journal's
   login page. The Dashboard opens
   (`/index.php/publicknowledge/en/dashboard/editorial`), and the bell at the
   top right reads "Tasks 2" (OMP and OPS: "Tasks 1").
3. Open the journal's home page (`/index.php/publicknowledge/en`) and read
   the name at the top right.
4. Make the browser window narrower than 992 px (or open the page on a
   phone), press "Open Menu" and read the list under "dbuskins".
5. Back at full width, press "dbuskins" at the top right, then "Dashboard".
6. "Logout", sign in as `dbarnes` and repeat steps 3 to 5.

Guest Editor (OJS):

7. Still as `dbarnes`, open "Settings" › "Users & Roles" and press
   "Invite to a role". Search `u08h20d@example.com`, type Given Name
   "Gwen" and Family Name "Guest-u08h20d", pick the role "Guest editor"
   with today as its start, press "Save And Continue", then "Invite user
   to the role". "Logout".
8. In the mail catcher, open the email "You are invited to new roles" and
   its accept link. Choose the username `u08h20d` and a password, tick the
   privacy box, "Save and continue"; pick a country, "Save and continue";
   press "Accept And Continue to …".
9. Sign in as `dbarnes` and open submission 2, "The influence of lactation
   on the quantity and quality of cashmere production", at its review
   round. Under "Participants" press "Assign", pick "Guest editor", search
   "Guest-u08h20d", choose Gwen Guest-u08h20d and press "OK". Under "Review
   Tasks & Discussions" press "Add", type the Name "u08h20d question", tick
   "Gwen Guest-u08h20d (u08h20d) Guest editor", type a message and press
   "Save". "Logout".
10. Sign in as `u08h20d`. The Dashboard opens, and the bell reads
    "Tasks 1". Repeat steps 3 to 5.

**Expected:** the name reads "dbuskins 2" (OMP and OPS: "dbuskins 1"), the
number the bell shows, and the list in the narrow window reads
"Dashboard 2" ("Dashboard 1"); for the Guest Editor "u08h20d 1" and
"Dashboard 1". "Dashboard" opens the Dashboard, the page they landed on
after signing in.

**Observed:** the name reads "dbuskins", with no number, and the list reads
"Dashboard", "View Profile", "Logout", with no number. "Dashboard" opens the
Profile page:

```
/index.php/publicknowledge/en/user/profile
Profile | Journal of Public Knowledge
```

On that page the side menu's "Editor Dashboard" group is closed, so the
Dashboard is two presses away: the group, then "Assigned to me" in it.

The same happens on OMP ("Profile | Public Knowledge Press") and OPS
("Profile | Public Knowledge Preprint Server"), and to the Guest Editor:
"u08h20d", the list "Dashboard", "View Profile", "Logout", and the Profile
page, while their bell reads "Tasks 1". For `dbarnes` the name reads
"dbarnes 2" (OMP "dbarnes 13", OPS "dbarnes 0"), the list in the narrow
window "Dashboard 2" ("Dashboard 13", "Dashboard 0"), and "Dashboard" opens
the Dashboard.

## Cause

`PKPNavigationMenuService::getDisplayStatus()`
(`lib/pkp/classes/services/PKPNavigationMenuService.php`) sets the title and
the address of the `NMI_TYPE_USER_DASHBOARD` items. These are the
"Dashboard" entry and the username item above it, both installed with that
type by each app's `registry/navigationMenus.xml`. The same role check is
made twice:

```php
// line 215: the title with the unread count (dashboardMenuItem.tpl)
if ($currentUser->hasRole([Role::ROLE_ID_MANAGER, Role::ROLE_ID_ASSISTANT, Role::ROLE_ID_REVIEWER, Role::ROLE_ID_AUTHOR], $contextId)
    || $currentUser->hasRole([Role::ROLE_ID_SITE_ADMIN], PKPApplication::SITE_CONTEXT_ID)) {

// line 305: the address, PKPPageRouter::getHomeUrl(), else user/profile
if ($context && ($currentUser->hasRole([Role::ROLE_ID_MANAGER, Role::ROLE_ID_ASSISTANT, Role::ROLE_ID_REVIEWER, Role::ROLE_ID_AUTHOR], $contextId)
    || $currentUser->hasRole([Role::ROLE_ID_SITE_ADMIN], PKPApplication::SITE_CONTEXT_ID))) {
```

`Role::ROLE_ID_SUB_EDITOR` is missing from the list. It is stored for every
role whose "Permission level" in Settings › Users & Roles › "Roles" reads
"Section Editor" ("Series Editor" on OMP, "Moderator" on OPS). The default
roles with that permission level are the Section editor (Series editor,
Moderator) and, on OJS only, the Guest editor (`registry/userGroups.xml`,
`roleId="0x00000011"`). A user whose roles in the journal all have that
permission level, Reader aside, fails both checks. Their title
stays the bare name or "Dashboard", and their address falls through to
`user/profile`. For the roles in the list, line 215 replaces the title with
`dashboardMenuItem.tpl`, which writes the title and then the count in a
`span.task_count`. The default theme shows the count beside the name in a
window 992 px or wider. In a narrower window it hides that count and shows
the one after "Dashboard" instead. Yet `PKPPageRouter::getHomeUrl()`, which picks the page a
user lands on after signing in, sends `ROLE_ID_SUB_EDITOR` to
`dashboard/editorial` with the managers and assistants. The editorial menu
built in `PKPTemplateManager` (line 1221) also counts Section Editors among
the roles with a dashboard.

In 3.0 the header template linked the name to the submissions page, with
the count, for every signed-in user. The same role list, without Section
Editors, decided only whether a separate "Dashboard" entry appeared. PR
`pkp/pkp-lib#2917` (for `pkp/pkp-lib#2910`, which restricted
"Administration" to site administrators) moved the user menu into the
navigation menu service, in three steps:

- [774c798](https://github.com/pkp/pkp-lib/commit/774c7988522b6ad5711c3e27ea7665985bb45594)
  used the list to hide both items, the name included, from other roles.
- [39912fe](https://github.com/pkp/pkp-lib/commit/39912fe17912b83edfedb7897fb28a686a85e1c4)
  showed both items again to every signed-in user and used the list for the
  address, with `user/profile` for everyone else: line 305's fault.
- [03f1cbe](https://github.com/pkp/pkp-lib/commit/03f1cbea007f65c59ebf8812c66f3287ce46dd38)
  used the list for the count in the title: line 215's fault.

The PR was merged on 2017-10-23 (da7ee3a3a2) and released in 3.1.

Reach:

- A role a journal adds in Settings › Users & Roles › "Roles" with the
  "Permission level" "Section Editor" (read in the code, not walked).
- Any menu a journal adds with an item of type "Dashboard" follows the same
  check (in the code).
- A Section Editor who also holds Manager, an assistant role, Reviewer or
  Author in the journal passes the check through that role, and
  `getHomeUrl()` then sends them to the Dashboard (in the code).
- The site's own pages, outside any journal: there "Dashboard" opens the
  Profile page for everyone, with or without the fix, because since
  `00ce12b` the address check asks for a journal first (`$context &&`).
  The count check asks for no journal, but there only the site
  administrator holds a role it counts, so only theirs can carry the
  count (in the code).
- No other copy of this list exists in pkp-lib or the three apps (a search
  for the role list and for `NMI_TYPE_USER_DASHBOARD`). Each app's
  `classes/services/NavigationMenuService.php` extends
  `PKPNavigationMenuService` without overriding `getDisplayStatus()`; it
  only adds its own item types through the `NavigationMenus::displaySettings`
  hook, so the fix needs no app change.

## Proposed fix

Put the rule in one place and use the role set that `getHomeUrl()` uses:
one protected method on the service that returns whether the user works from
a dashboard in this context, called by both checks. The context id is
nullable because on site-level pages it is `PKPApplication::SITE_CONTEXT_ID`,
which is `null` on `main` and 3.5, and `User::hasRole()` takes `?int`.
The address check keeps `pkp/pkp-lib#13553`'s `$context &&` in front.
Tried on `main` in all three apps. The excerpt below shows only the
changed lines; the patch to apply is
[fix.diff](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/section-editor-dashboard-opens-profile/fix.diff).

```diff
                 // line 215, the title
-                    if ($currentUser->hasRole([Role::ROLE_ID_MANAGER, Role::ROLE_ID_ASSISTANT, Role::ROLE_ID_REVIEWER, Role::ROLE_ID_AUTHOR], $contextId) || $currentUser->hasRole([Role::ROLE_ID_SITE_ADMIN], PKPApplication::SITE_CONTEXT_ID)) {
+                    if ($this->hasDashboard($currentUser, $contextId)) {
                 // line 305, the address
-                    if ($context && ($currentUser->hasRole([Role::ROLE_ID_MANAGER, Role::ROLE_ID_ASSISTANT, Role::ROLE_ID_REVIEWER, Role::ROLE_ID_AUTHOR], $contextId) || $currentUser->hasRole([Role::ROLE_ID_SITE_ADMIN], PKPApplication::SITE_CONTEXT_ID))) {
+                    if ($context && $this->hasDashboard($currentUser, $contextId)) {
+    /**
+     * Whether the user works from a dashboard in this context: the roles
+     * PKPPageRouter::getHomeUrl() sends to one, and the site administrator.
+     */
+    protected function hasDashboard(\PKP\user\User $user, ?int $contextId): bool
+    {
+        return $user->hasRole([Role::ROLE_ID_MANAGER, Role::ROLE_ID_SUB_EDITOR, Role::ROLE_ID_ASSISTANT, Role::ROLE_ID_REVIEWER, Role::ROLE_ID_AUTHOR], $contextId)
+            || $user->hasRole([Role::ROLE_ID_SITE_ADMIN], PKPApplication::SITE_CONTEXT_ID);
+    }
```

With the fix in, the walk showed the Expected on all three apps, the
Guest Editor's "u08h20d 1" and "Dashboard 1" included. In a neighbour
check, an Author and a Reviewer kept their count and their pages (My
Submissions, the review assignments). On a site-level public page ("About
this Publishing System" at
`/index.php/index/en/about/aboutThisPublishingSystem`), "Dashboard" still
opened the Profile page for the Section Editor, the Journal editor and the
site administrator. All of the neighbour check was the same with the fix
in and out.

**Alternatives**

- Add `Role::ROLE_ID_SUB_EDITOR` to the two lists only: the same result, but
  two identical lists stay separate from `getHomeUrl()`'s role set and can
  drift apart from it again.
- Take the address from `getHomeUrl()` for everyone and send a user to the
  Profile page only when it returns the journal's home page: one source for
  the address, but the count still needs its own role test, so the list
  stays.

**What goes with it**

- No stored data changes. The `NavigationMenus::displaySettings` hook still
  runs after the decision.
- Backport: on 3.5, which has `pkp/pkp-lib#13553` too, the diff applies
  with line offsets. On 3.4 and 3.3 both checks have the same condition,
  with no `$context &&`, so the helper replaces both as it is. There a
  site page's context id is `CONTEXT_ID_NONE`, which is `0`, not `null`:
  the helper's `?int` accepts it, and its site-administrator test takes
  `PKPApplication::CONTEXT_SITE` (also `0`) in place of `SITE_CONTEXT_ID`.
  3.3 also needs the global constants (`CONTEXT_SITE`,
  `ROLE_ID_SUB_EDITOR`) and `array()` syntax. There `getHomeUrl()` sends
  every role but Reader to the `submissions` page, with no split by role,
  so the method's comment should not name `getHomeUrl()`; the role set is
  still the right one.
- Guard: an end-to-end check that a Section Editor's "Dashboard" on the
  journal's home page opens the Dashboard and carries the count, or a unit
  test of the service's display status per role, the site-level case
  included.

This is a proposal; the team decides. Small: one method and two calls in one
shared class, following the role set `getHomeUrl()` already uses, and one
test.

## Evidence

- Kept script:
  [walk.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/section-editor-dashboard-opens-profile/walk.js)
  with its
  [lib.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/section-editor-dashboard-opens-profile/lib.js).
  It takes the Steps as `dbarnes` and `dbuskins`, and on OJS as the
  invited Guest Editor `u08h20d` (the accept link read from the install's
  mail catcher), on an install freshly loaded from the default dataset
  (pkp/datasets 2f0edb08, 2026-10-28, PostgreSQL). From a pkp-e2e
  checkout:
  `GUEST_TASK=1 PROBE_FEATURE=<feature> PROBE_AGENT=<id> node bin/probe.js all shared/playwright/checks/issues/section-editor-dashboard-opens-profile/walk.js`.
  `GUEST_TASK=1` takes step 9. Where "Dashboard" opened the Profile page,
  the script then presses "Editor Dashboard" and "Assigned to me" in the
  side menu (the way round). `WALK_MODE=neighbour` walks the Author (`ccorino`, `aclark` on OMP), the
  Reviewer (`jjanssen`; the OPS dataset has none) and the site-level page
  as `dbuskins`, `dbarnes` and `admin`, with French left under "Forms".
- Walks, each on a freshly loaded install:
  - `main`, 2026-10-29: the Steps on all three apps, step 9 included on
    OJS: the Observed above, the Guest Editor's bell "Tasks 1". The way
    round opened the Dashboard at
    `/index.php/publicknowledge/en/dashboard/editorial?currentViewId=assigned-to-me`
    ("Assigned to me (15)"; OMP "(3)", OPS "(1)", the Guest Editor "(1)").
  - 3.5, 2026-10-29: the same command with `PKP_E2E_LINE=stable-3_5_0` in
    front, on that line's dataset (`ojs/stable-3_5_0/pgsql` and the
    others), step 9 included: the same result as `main`. There "Start A
    New Submission" sits inside the closed "Editor Dashboard" group
    (`PKPTemplateManager.php` line 1048 on 3.5) instead of beside it.
  - The fix, tried on 2026-10-26 at lib/pkp 800863b5dc. The files it
    changes and reads (`PKPNavigationMenuService.php`, `PKPPageRouter.php`,
    `dashboardMenuItem.tpl`) have no commit between that and today's
    df42984b46. On `main`, all three apps, with
    [fix.diff](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/section-editor-dashboard-opens-profile/fix.diff)
    applied (`node bin/try-fix.js apply <fix.diff> ojs omp ops`): the
    Steps with step 9, then `WALK_MODE=neighbour`; reverted, then
    `WALK_MODE=neighbour` again on the unpatched code. On the site page,
    "Dashboard" opened the Profile page for `dbuskins`, `dbarnes` and
    `admin` both times.
  - No request failed and no page script failed, with the fix in or out.
- Tips (2026-10-29): `main` OJS 7705b2aeb8, OMP 3583c1bfd7 and OPS
  815fbaad1b (lib/pkp df42984b46); `stable-3_5_0` OJS 851416bc2d, OMP
  50b83d1e67 and OPS bd0ef09fd6 (lib/pkp a6ed3df00a); `stable-3_4_0` OJS
  567c40df4f (lib/pkp cbf5446d1b); `stable-3_3_0` OJS bb9835c6e0 (lib/pkp
  fc94a53416).
- Code reads: `PKPNavigationMenuService.php` on 3.5, lines 213 and 303,
  as on `main` (3.5 has the guard from `6accf87c49`); 3.4
  `classes/services/PKPNavigationMenuService.php` lines 210 and 300 and 3.3
  `classes/services/PKPNavigationMenuService.inc.php` lines 190 and 280, the
  same lists, with no such guard and the `submissions` page as the
  address. `getHomeUrl()` in `PKPPageRouter.php` on `main` and 3.5, with
  `ROLE_ID_SUB_EDITOR` among the roles sent to `dashboard/editorial`.
  Each app's `classes/services/NavigationMenuService.php` on `main`.
  `dashboardMenuItem.tpl` and the `{$loggedInUsername}` item in each
  app's `registry/navigationMenus.xml` on `main`. OJS
  `registry/userGroups.xml` on `main`, 3.5, 3.4 and 3.3: the Guest editor
  group has `roleId="0x00000011"` (`ROLE_ID_SUB_EDITOR`) on every line;
  OMP's and OPS's registries hold no group with that role id besides the
  Series editor and the Moderator.
- The way back, in the code: `PKPTemplateManager` on `main` (line 1250)
  builds the side menu's "Editor Dashboard" group from the dashboard's
  lists, each `isCurrent` only on `dashboard/editorial`, so the group is
  closed on every other page, the Profile page included. 3.4
  (`PKPTemplateManager.php` line 1044) and 3.3
  (`PKPTemplateManager.inc.php` line 964) have no such group: every role
  in the journal but Reader gets one "Submissions" entry to the
  `submissions` page. On `main`, lib/pkp `templates/layouts/backend.tpl`
  links the journal's name in the header to its home page
  (`page="index"`), and ui-library `TopNavActions.vue` puts the languages,
  "Edit Profile" and "Logout" in the menu under the initials. The task
  list behind the bell was not checked for a way to the Dashboard.
- Introduced: `git blame` of line 305 now lands on `00ce12b`, which only
  wrapped the existing check in `$context && (…)`; blame at its parent,
  and of line 215, lands on abc36ccdc16 (2024), which only renamed the
  site context constant; from there the trace reaches `39912fe` and
  `03f1cbe` as before.
- Not driven: a custom role with the permission level "Section Editor"
  (in the code), a user holding only Reader (the dataset has none; in the code
  Reader is not in the list, before or after the fix), a Section Editor who
  also holds Author or Reviewer (in the code), and themes other than the
  default.
- Not walked: the Steps with the fix in on a journal with French under
  "Forms" (the neighbour check ran there).
- Upstream: `pkp/pkp-lib#8971` ("Dashboard link goes to user Profile",
  closed) is the same link, but for an Author signed in at the site's
  address, not a Section Editor; not this fault. `pkp/pkp-lib#4340`
  (closed) is about links to contexts the user has no role in; not this
  fault. `pkp/pkp-lib#13553` (closed, the site administrator on site
  pages) and `pkp/pkp-lib#13443` (open, a fatal error for a disabled
  user's session) touch the same method; neither is this fault. Searched
  on 2026-10-26 by the symptom's words, "guest editor",
  `NMI_TYPE_USER_DASHBOARD`, `ROLE_ID_SUB_EDITOR` and
  `PKPNavigationMenuService`, in pkp-lib, the three apps and ui-library.
- Unverified: how many Guest Editors hold no other role in their journal.
