# "Keep me logged in" is ticked every time the Login page shows, even after the user unticked it

- **Severity** low
- **Effort** medium
- **Kind** defect
- **Affects**
  - main: OJS, OMP, OPS
  - 3.5: OJS, OMP, OPS
  - 3.4: OJS, OMP, OPS (code)
  - 3.3: OJS, OMP, OPS (code)
- **Introduced** `pkp/pkp-lib#658` for `pkp/pkp-lib#639` · [be949906f5](https://github.com/pkp/pkp-lib/commit/be949906f5aee16ff88668615986ec141f43445f) · 2015-08-07 · Nate Wright (NateWr)
- **Upstream** none found for the ticked box (2026-10-07). The severity depends on `pkp/pkp-lib#12780` (open: closed 2026-07-28, reopened 2026-10-07), an issue about "Login As" on a disabled account; the comment that reopened it reports that "Keep me logged in" no longer keeps users signed in
- **Tracked in** spec U01 [A2](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U01-login-and-sessions.md#a2)
- **Checked** 2026-10-07, each branch's tip (the commits in Evidence)
- **Model** claude-opus-5-5

Update 2026-10-07: since `pkp/pkp-lib`
[3407fc5bc0](https://github.com/pkp/pkp-lib/commit/3407fc5bc088cc6a29f2d27d1cf54a6b86d54b37)
(2026-10-06; on `stable-3_5_0` as
[edc3d36c74](https://github.com/pkp/pkp-lib/commit/edc3d36c745e2d478d174de1371eeb491c5a50ac))
the "Keep me logged in" cookie signs no one back in on `main` and the
3.5 branch, as in every 3.5 release, so a ticked sign-in there ends
exactly as an unticked one does. The box is still ticked every time the
form shows. Severity medium → low. Effort small → medium: five PKP
themes carry the same box in templates of their own.

## Summary

The Login page shows "Keep me logged in" already ticked, though the
label offers it as a choice. It ticks the box again when the page shows
the form after a wrong password: a user who unticked it, mistyped the
password and signed in on the next try signs in with the box ticked,
without being told.

What the tick costs depends on the version. On 3.4 and 3.3 it decides
whether a sign-in ends when the browser closes or lasts 30 days without
a visit, so the ticked box keeps every user who leaves it alone signed
in on that browser, a shared computer included. On 3.5, in every
release so far and on the branch, and on `main`, the box keeps no one
signed in: ticked or not, a sign-in ends after a week without a visit.
All that is left there is the "Keep me logged in" cookie, stored in the
browser against the user's choice.

That changes when "Keep me logged in" is made to work on 3.5 and
`main`; the comment that reopened `pkp/pkp-lib#12780` on 7 October 2026
reports that it no longer does. A ticked sign-in then lets the browser
back into the account without the password for up to 30 days (the
default), however long the browser stood unused.

## Impact

- **Lost.** On 3.4 and 3.3, the end of the sign-in at browser close,
  for every user who leaves the box as shown. On 3.5 and `main`, the
  choice alone: a cookie the user declined is stored and does nothing.
- **Who.** Every user who signs in through the Login page. Where the
  tick is honoured, those on a shared or public computer bear the cost.
- **Way round.** Untick the box before each press of "Login", or use
  "Logout" when done. The page does not say so.

Low: on 3.5 and `main`, the versions walked, ticked and unticked
sign-ins end alike, so the wrong tick costs the user nothing they can
see. On 3.4 and 3.3 the code gives the fault its full cost, which is
medium on this scale; the label does not follow because those versions
were read, not walked. It is medium on 3.5 and `main` as well from the
day "Keep me logged in" works there.

## Steps to reproduce

Preconditions:

- PKP's default test dataset, `main` (OJS, OMP or OPS; the context
  `publicknowledge`). Signed out.

Fresh Login page:

1. Open the Login page,
   `/index.php/publicknowledge/en/login`.

A refused sign-in with the box unticked:

2. Type `dbarnes` in "Username or Email" and `wrongpassword` in
   "Password".
3. Untick "Keep me logged in".
4. Press "Login".

The next, correct attempt:

5. Type `dbarnesdbarnes` in "Password", leave "Keep me logged in" as the
   page shows it, and press "Login".

**Expected.** At step 1 "Keep me logged in" is unticked. At step 4 the
page reads "Invalid username/email or password. Please try again.",
keeps `dbarnes` in "Username or Email", and shows the box unticked, as
the user left it. At step 5 the Dashboard opens and the browser holds
no `remember_web_…` cookie, since the user chose not to stay signed in.

**Observed.** At step 1 the box is ticked. At step 4 the error and
`dbarnes` are shown, and the box is ticked again. At step 5 the
Dashboard opens, and the browser's developer tools (Application ›
Cookies) show a `remember_web_c1a26bc0…` cookie that expires 30 days
later; the session cookie beside it expires 7 days later. The box's
markup, at steps 1 and 4 alike:

```html
<input type="checkbox" name="remember" id="remember" value="1" checked="$remember">
```

## Cause

`lib/pkp/templates/frontend/pages/userLogin.tpl`, line 76 on `main`,
writes the checkbox's `checked` attribute as plain HTML text:
`checked="$remember"`. Smarty substitutes variables only inside its own
`{…}` tags, so the page goes out with the literal text `$remember` as the
attribute's value. The `checked` attribute is boolean in HTML: its
presence alone ticks the box, whatever its value. So the box is ticked
on every render.

The handler already passes the user's choice: `LoginHandler::index()`,
`LoginHandler::signIn()` (the refused attempt) and, on `main`, its
rate-limit branch each assign `remember` from the request. The template
never reads it. When the form is posted with the box ticked,
`Validation::login(…, $remember)` hands it to Laravel's
`Auth::attempt($credentials, $remember)`, which sets the
`remember_web_*` cookie for `[security] remember_me_lifetime` days
(30 by default, counted from the sign-in). Unticked, the sign-in rests on
the session cookie alone, which ends after `[general] session_lifetime`
days without a visit (7 by default).

On 3.5 and `main` nothing then signs a user back in from that cookie.
`PKPRequest::getUser()` and `Validation::isLoggedIn()` read the
session's own user id alone: in every 3.5 release tag (`3_5_0rc2` to
`3_5_0-5`, code) and, since `pkp/pkp-lib` 3407fc5bc0 (2026-10-06;
`stable-3_5_0` edc3d36c74), on both branch tips (walked: a ticked and
an unticked sign-in both open the Login page once the idle limit has
passed).

Only the two branches read the cookie, from 2026-07-21 to 2026-10-06.
`pkp/pkp-lib#12790` (a6d68f9547; `stable-3_5_0` 6d0d04f41a) made
`getUser()` fall back on Laravel's guard, which signed the browser back
in once its session had lapsed, within the cookie's 30 days (walked
with that code put back: after the idle limit, Settings › "Users &
Roles" opens signed in). No release tag holds that fallback.

The line came in with `pkp/pkp-lib#658` ("style register and login
pages", for `pkp/pkp-lib#639`), which rewrote the form as plain markup.
The form helper it replaced, `{fbvElement type="checkbox" … checked=$remember}`,
read the variable. The change was made during the 3.0 rewrite, so no
3.x release has shown the box unticked.

Reach:

- Every sign-in through the Login page of all three apps; the template
  is pkp-lib's and no app overrides it (checked in the code).
- Both forms the Login page shows: the fresh one and the one a refused
  sign-in shows again (walked), and on `main` the rate-limited refusal,
  which renders the same template (code; 3.5 has no rate limiting).
- On 3.4 and 3.3, in their releases as on the branches, a ticked box
  gives the session cookie a lifetime of `session_lifetime` days (30 by
  default there), renewed on every visit
  (`Validation::registerUserSession()`, `SessionManager::refresh()`);
  unticked, it is a browser-session cookie that ends when the browser
  closes, and the server drops the session after a day unused (code).
- Five of PKP's own themes carry the box in a template of their own,
  ticked the same way on their default branches (read 2026-10-07).
  `pkp/bootstrap3` (`templates/frontend/pages/userLogin.tpl` line 58),
  `pkp/immersion` (line 66), `pkp/pragma` (line 63) and
  `pkp/healthSciences` (`templates/frontend/components/loginForm.tpl`
  lines 69-70) write `checked="$remember"`; `pkp/classic`
  (`userLogin.tpl` line 67) writes a bare `checked`. A journal on one of
  them keeps the ticked box after a fix in pkp-lib alone.
- A third-party theme with its own Login template keeps its own copy
  (not checked).

## Proposed fix

Print the attribute only when the user ticked the box, as the sibling
checkboxes of `userRegister.tpl` do
(`{if $privacyConsent} checked="checked"{/if}`) and as the form helpers'
`checkboxGroup.tpl` does
([fix.diff](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/keep-me-logged-in-always-ticked/fix.diff)):

```diff
--- a/lib/pkp/templates/frontend/pages/userLogin.tpl
+++ b/lib/pkp/templates/frontend/pages/userLogin.tpl
@@ -73,7 +73,7 @@
 			<div class="remember checkbox">
 				<label>
-					<input type="checkbox" name="remember" id="remember" value="1" checked="$remember">
+					<input type="checkbox" name="remember" id="remember" value="1"{if $remember} checked="checked"{/if}>
 					<span class="label">
 						{translate key="user.login.rememberUsernameAndPassword"}
 					</span>
```

A fresh Login page then shows the box unticked. A refused
sign-in shows the box as the user left it, ticked or not, which is what
the handler already passes and what the introducing change meant to
keep.

That line fixes the default theme and every theme that takes its Login
page from pkp-lib. The five PKP themes named under Cause need the same
change in their own templates: `{if $remember} checked="checked"{/if}`
in place of `checked="$remember"`, and in `pkp/classic` in place of the
bare `checked`. Not tried in the themes.

Tried on `main` on the three apps with the default theme (2026-10-04;
the template has not changed since): the Steps then show the Expected
(unticked at steps 1 and 4, no `remember_web_…` cookie after step 5).
The neighbour check, a refused attempt with the box left ticked and then
the correct password, shows the box ticked again and the cookie set,
with the fix in and out.

**Alternatives.**

- Drop the `checked` attribute altogether: a fresh page would be right,
  but a refused sign-in would forget a user's tick.
- Untick the box with JavaScript: a second place for the same rule, and
  it fails without scripts.

**What goes with it.**

- No stored data to repair. Users already holding a `remember_web_*`
  cookie keep it until it runs out, they sign out, or their session
  lapses; a change that makes the cookie work again signs those
  browsers back in, the unchosen ones included, so this fix is best in
  before or with it.
- A search of the three apps' templates, pkp-lib's and the bundled
  plugins' for an HTML attribute holding a bare `$variable` found only
  this line; the other matches are inside Smarty tags or Vue bindings,
  where the variable is read.
- Nothing an API client or plugin relies on changes; the
  `Templates::User::Login::BeforeForm` and `AfterForm` hooks are untouched.
- Backport: 3.5, 3.4 and 3.3 carry the same line (line 73) and their
  handlers assign `remember` the same way, so the diff applies as
  written with an offset.
- A question for the team before the 3.4 and 3.3 backports. Those
  versions honour the tick, and the box has been ticked on every Login
  page since 3.0. An unticked default there moves every sign-in that
  leaves the box alone from 30 days without a visit to ending when the
  browser closes. Is unticked the wanted default on 3.4 and 3.3 as
  well, with a release note, or do those two versions keep the ticked
  default?
- Guard: an e2e check that the Login page shows the box unticked, and
  shows it as left after a refused sign-in (a **Planned** item in spec
  U01).

Medium: one line in pkp-lib's template and the same line in five theme
repositories, six pull requests in all, each following the pattern the
sibling templates use, and an e2e check. The pkp-lib line alone is
small; it leaves the five themes ticked.

## Evidence

- A Playwright script that runs the Steps on installs loaded from PKP's
  default test dataset, all three apps in one run:
  [walk.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/keep-me-logged-in-always-ticked/walk.js),
  run with
  `PROBE_FEATURE=<feature> PROBE_AGENT=<id> node bin/probe.js all shared/playwright/checks/issues/keep-me-logged-in-always-ticked/walk.js`
  (`PKP_E2E_LINE=stable-3_5_0` in front for 3.5). `neighbour` as the
  script's argument
  runs the neighbour check alone: the same steps with the box left
  ticked at step 3.
- No request in the walks answered an error and no page script failed.
- Walked 2026-10-07 on PostgreSQL, each install freshly loaded from
  pkp/datasets
  [a130b9a](https://github.com/pkp/datasets/commit/a130b9a30acbc21e28b167970255b65993ac56bf) (2026-10-07),
  with the dataset's own `config.inc.php` values for `session_lifetime`
  (7) and `remember_me_lifetime` (30):
  - main: OJS 3265fdc673, OMP 0c6a3ebed1, OPS 8ae6c68e04 (lib/pkp
    f8285b0b8f in all three): the same result on the three apps.
  - stable-3_5_0: OJS 6d2a42555d, OMP 5861ebee10, OPS 6a8f83586c
    (lib/pkp 6910ca6d8e in all three): the same result on the three
    apps.
- What a tick does on 3.5 and `main` was walked the same day with the
  kept script of another report,
  [pkp-e2e#828](https://github.com/jardakotesovec/pkp-e2e/issues/828)
  (the fault in how the cookie signs a user back in):
  [login-as-after-idle-limit-server-error/walk.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/login-as-after-idle-limit-server-error/walk.js),
  in its default mode (a ticked sign-in) and its mode `nb` (which holds
  the unticked one), on the three apps on `main` and 3.5. `rvaca` signs
  in, the idle limit is stood in for (every session row aged eight
  days; walked with the session cookie kept and with it removed, as a
  real wait leaves it), and Settings › "Users & Roles" opens the Login
  page, ticked and unticked alike. With the cookie read put back on
  `main` (that report's trial-cookie-read.diff, the three files of
  3407fc5bc0 as they were before it), "Users & Roles" opened signed in
  after the same stand-in.
- Code read for the same: `PKPRequest::getUser()` and
  `Validation::isLoggedIn()` on `main` and `stable-3_5_0` (the session's
  `userId` alone), `git show 3407fc5bc0` and `git show a6d68f9547`.
- The releases, by code, in pkp-lib's tags (`git show <tag>:<path>`;
  pkp's own tag list ends at `3_5_0-5`, `3_4_0-11` and `3_3_0-23`):
  `classes/core/PKPRequest.php` at `3_5_0rc2` and `3_5_0-0` to `3_5_0-5`
  has no `Auth::user()` in `getUser()`, and no tag holds 6d0d04f41a;
  `Validation` and `SessionManager` at `3_4_0-0`, `3_4_0-11`, `3_3_0-6`
  and `3_3_0-23` use the tick as the branches do, and the template has
  the same line in each. The `remember_me_lifetime` setting is in
  `PKPContainer.php` from `3_5_0-5` on; the earlier 3.5 tags set no
  lifetime for the cookie, which leaves Laravel's own (400 days,
  `SessionGuard::$rememberDuration`; not walked).
- The themes: each template read on its repository's default branch
  (`main` in all five) at
  `https://raw.githubusercontent.com/pkp/<theme>/HEAD/<path>`, the paths
  and lines as under Cause. `pkp/healthSciences` keeps the box in
  `loginForm.tpl`, not in its `userLogin.tpl`. `pkp/oldGregg`,
  `pkp/defaultManuscript` and `pkp/material` answered 404 for
  `templates/frontend/pages/userLogin.tpl`; other theme repositories
  were not looked at. No theme was installed or walked.
- The fix was tried on 2026-10-04, on that day's `main` tips (OJS
  ff004d0973 with lib/pkp 987776cd04, OMP 3b0ecf794c and OPS c8af945bb7
  with lib/pkp 3dc90c81a6):
  `node bin/try-fix.js apply shared/playwright/checks/issues/keep-me-logged-in-always-ticked/fix.diff ojs omp ops`,
  then walk.js and walk.js `neighbour` with the same command, then
  `revert` and walk.js `neighbour` again. Not tried again on
  2026-10-07: between those tips and today's, `userLogin.tpl` is
  unchanged and `LoginHandler.php` differs in one line that does not
  touch `remember` (the refusal's reason is escaped), and the diff
  still applies to the three checkouts (`patch --dry-run`).
- 3.4, by code: OJS `stable-3_4_0` at d68934d0d1, OMP at 0aec65441f, OPS
  at acd8ae704b, pkp-lib 767353f4fe. `templates/frontend/pages/userLogin.tpl`
  line 73 is the same; `pages/login/LoginHandler.php` assigns
  `remember` on display and on a refused sign-in; no app overrides the
  template. What the tick does there: `Validation::registerUserSession()`
  (`setRemember()`, then the session cookie's lifetime),
  `SessionManager` (sessions not remembered are dropped a day after
  their last use) and `config.TEMPLATE.inc.php` (`session_lifetime = 30`).
- 3.3, by code: OJS `stable-3_3_0` at ac77c9fb35, OMP at 8e72fc8836, OPS
  at c5532e2161, pkp-lib ac3fa73402. The same template line 73;
  `pages/login/LoginHandler.inc.php` assigns `remember` the same way;
  no app overrides the template; `Validation.inc.php` and
  `SessionManager.inc.php` use the tick as on 3.4.
- Introduced: `git blame` on the line names 60fa6ff5ed
  (`pkp/pkp-lib#1614`, 2016-07-15), which only re-indented it when the
  implicit-auth branch was removed; `git log -S'checked="$remember"'`
  finds its first appearance in be949906f5, in `templates/user/login.tpl`,
  replacing `{fbvElement type="checkbox" … checked=$remember}`. GitHub's
  API (`commits/be949906f5/pulls`) names `pkp/pkp-lib#658` ("style
  register and login pages", NateWr, merged 2015-08-07); the commit
  message names only `pkp/pkp-lib#639`.
- Upstream (2026-10-07): pkp/pkp-lib, then the pkp organisation's other
  repositories, searched for "keep me logged in", "remember me" with
  login, checkbox, checked or default, `userLogin.tpl remember` and
  `rememberUsernameAndPassword`. `pkp/pkp-lib#1867` (closed 2016)
  renamed the label to "Keep me logged in" and does not mention the box's
  state; `pkp/pkp-lib#12586` (merged, the `remember_me_lifetime` setting)
  changed the handler and the cookie, not the template.
  `pkp/pkp-lib#12780`, read through GitHub's API on 2026-10-07: titled
  for "Login As" on a user with a disabled account, closed 2026-07-28,
  reopened 2026-10-07 by the comment of that day, which asks for the
  regression in "Keep me logged in" to be reviewed; it does not mention
  the box, and no pull request for it is open.
- Not driven: 3.4 and 3.3 (code only); the rate-limited refusal (code);
  MySQL not checked, though nothing here depends on the database.
- Unverified: that "Logout" removes the `remember_web_*` cookie rests on
  Laravel's `SessionGuard::logout()`, which `Validation::logout()` calls;
  not walked.
