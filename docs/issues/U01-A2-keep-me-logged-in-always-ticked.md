# "Keep me logged in" is ticked every time the Login page shows, even after the user unticked it

- **Severity** medium
- **Effort** medium
- **Kind** defect
- **Affects**
  - main: OJS, OMP, OPS
  - 3.5: OJS, OMP, OPS
  - 3.4: OJS, OMP, OPS (code)
  - 3.3: OJS, OMP, OPS (code)
- **Introduced** `pkp/pkp-lib#658` for `pkp/pkp-lib#639` · [be949906f5](https://github.com/pkp/pkp-lib/commit/be949906f5aee16ff88668615986ec141f43445f) · 2015-08-07 · Nate Wright (NateWr)
- **Upstream** none found for the ticked box (2026-11-02)
- **Tracked in** spec U01 [A2](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U01-login-and-sessions.md#a2)
- **Checked** 2026-11-02, each branch's tip (the commits in Evidence)
- **Model** claude-opus-5-5

Update 2026-11-02: since `pkp/pkp-lib`
[442148e14e](https://github.com/pkp/pkp-lib/commit/442148e14ef5cf836724423cf425102c2a0de480)
(`pkp/pkp-lib#12780`, 2026-10-31; on `stable-3_5_0` as
[c4c0aa8c52](https://github.com/pkp/pkp-lib/commit/c4c0aa8c5293254ad253544aea230b1b607d5249),
released in 3.5.0-6) the "Keep me logged in" cookie signs the browser
back in again on `main`, the 3.5 branch and 3.5.0-6. From 6 to 31
October it did not, so a ticked sign-in there ended as an unticked one
did and this report was rated low. With the cookie working again, the
wrongly ticked box keeps users signed in, and the severity goes back
from low to medium. Steps 6 and 7 show it.

## Summary

The defect is in how the Login page's "Keep me logged in" box arrives.
It is ticked the first time the page shows, though the label offers it
as a choice, and it is ticked again when the page shows the form after
a wrong password. A user who unticked it, mistyped the password and
signed in on the next try is signed in with the box ticked, without
being told. The same box, ticked the same way, is in the Login templates
of five PKP themes, which a fix in pkp-lib does not reach: each theme
needs the same change.

What the tick costs depends on the version:

- On `main`, the 3.5 branch and 3.5.0-6, a ticked sign-in lets the
  browser back into the account without the password for 30 days from
  the sign-in, however long the browser stood unused. An unticked one
  ends after a week without a visit.
- On 3.4 and 3.3, a ticked sign-in lasts until 30 days pass without a
  visit; an unticked one ends when the browser closes.
- In the 3.5 releases before 3.5.0-6 the cookie signs no one back in.
  The box still makes the server store the cookie in the browser of a
  user who did not choose it, but the cookie does nothing.

Those it hurts are the users who unticked the box before a refused
sign-in, and those who did not notice it was ticked, most of all on a
shared or public computer.

## Impact

- **Lost.** The user's choice to end the sign-in. On that browser, the
  next person opens the account without the password.
- **Who.** Users who sign in on the Login page (or the Login form of
  one of the five PKP themes) and leave the box as shown, whether they
  unticked it before a refused sign-in or never saw it was ticked.
- **Way round.** For the user: untick the box before each press of
  "Login", or press "Logout" when done; the page does not say so. For
  the site, by the code: the 30 days is `remember_me_lifetime` in the
  `[security]` section of `config.inc.php` (in days, on `main` and from
  3.5.0-5 on). Set below `session_lifetime` (down to its floor of one
  minute; 0 counts as one minute), it leaves the box almost no effect,
  for every user, those who want to stay signed in as well. On 3.4 and
  3.3 the ticked lifetime is `session_lifetime` in `[general]` (30
  there), and 0 there makes every sign-in end when the browser closes.

Medium: the user's choice is overridden silently, and the way round
works only for a user who knows to look.

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

Coming back after a week:

6. Leave the browser unused for longer than the idle limit,
   `[general] session_lifetime` in `config.inc.php` (7 days by
   default). Do not sign out. To skip the wait, delete the session
   cookie in the browser's developer tools (Application › Cookies;
   `OJSSID`, `OMPSID` or `OPSSID` by default, `session_cookie_name` in
   `config.inc.php`) and keep `remember_web_…`: the session cookie
   expires with the session, so that is what the wait leaves in the
   browser.
7. Open "Edit Profile",
   `/index.php/publicknowledge/en/user/profile`.

**Expected.** At step 1 "Keep me logged in" is unticked. At step 4 the
page reads "Invalid username/email or password. Please try again.",
keeps `dbarnes` in "Username or Email", and shows the box unticked, as
the user left it. At step 5 the Dashboard opens and the browser holds
no `remember_web_…` cookie, since the user chose not to stay signed in.
At step 7 the Login page opens.

**Observed.** At step 1 the box is ticked. At step 4 the error and
`dbarnes` are shown, and the box is ticked again. At step 5 the
Dashboard opens, and the browser's developer tools show a
`remember_web_c1a26bc0…` cookie that expires 30 days later; the session
cookie beside it expires 7 days later. At step 7 the "Profile" page
opens, its "Identity" tab reading "Username dbarnes": the browser is
signed in again without the password. The box's markup, at steps 1 and
4 alike:

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
`Auth::attemptWhen($credentials, …, $remember)` (`Auth::attempt()` before
`pkp/pkp-lib#12780`), which sets the `remember_web_*` cookie for
`[security] remember_me_lifetime` days (30 by default, counted from the
sign-in). Unticked, the sign-in rests on the session cookie alone, which
ends after `[general] session_lifetime` days without a visit (7 by
default).

On `main`, the 3.5 branch and 3.5.0-6 that cookie signs the browser
back in once its session has ended. Since `pkp/pkp-lib` 442148e14e
(`stable-3_5_0` c4c0aa8c52, first released in 3.5.0-6),
`PKPAuthenticateSession::handle()` asks the
guard for the user before the session is first saved, and
`PKPSessionGuard::userFromRecaller()` restores the user from a valid
`remember_web_*` cookie and writes them into the new session, so
`PKPRequest::getUser()` and `Validation::isLoggedIn()` find them again
(walked: step 7). The 3.5 releases `3_5_0-0` to `3_5_0-5` never do:
there `getUser()` and `isLoggedIn()` read the session's own user id
alone, which nothing restores from the cookie (code).

The line came in with `pkp/pkp-lib#658` ("style register and login
pages", for `pkp/pkp-lib#639`), which rewrote the form as plain markup.
The form helper it replaced, `{fbvElement type="checkbox" … checked=$remember}`,
read the variable. The change was made during the 3.0 rewrite, so no
3.x release has shown the box unticked.

Reach:

- Every sign-in through the Login page of all three apps; the template
  is pkp-lib's and no app overrides it. It is the only template in the
  apps, pkp-lib and the bundled plugins with the box (checked in the
  code); the five PKP themes below carry their own.
- Both forms the Login page shows: the fresh one and the one a refused
  sign-in shows again (walked), and on `main` the rate-limited refusal,
  which renders the same template (code; the 3.5 branch has no rate limiting).
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
 			</div>
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

Tried on `main` on the three apps with the default theme (2026-11-02):
the Steps then show the Expected. A control, a refused attempt with the
box ticked on purpose and then the correct password, comes back with
the box ticked, sets the cookie and is signed in again at step 7, with
the fix and without it.

**Alternatives.**

- Drop the `checked` attribute altogether: a fresh page would be right,
  but a refused sign-in would forget a user's tick.
- Untick the box with JavaScript: a second place for the same rule, and
  it fails without scripts.

**What goes with it.**

- No stored data to repair. A browser already holding a
  `remember_web_*` cookie from a sign-in its user did not mean to keep
  stays signed back in until the cookie runs out (30 days from that
  sign-in), the user presses "Logout" or the password changes.
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
  script's argument runs the neighbour check alone: the same steps with
  the box left ticked at step 3. Step 6 takes the Steps' shortcut: it
  deletes the session cookie from the browser and keeps the others.
- No request in the walks answered an error and no page script failed.
- Walked 2026-11-02 on PostgreSQL, each install freshly loaded from
  pkp/datasets
  [c1a3abc](https://github.com/pkp/datasets/commit/c1a3abcdd16e5bfbb911fc38689d934e5de11a27) (2026-11-01),
  with the dataset's own `config.inc.php` values for `session_lifetime`
  (7) and `remember_me_lifetime` (30):
  - main: OJS bc4a83e9db, OMP 853bf3b052, OPS fd893a8c92 (lib/pkp
    442148e14e in all three): the same result on the three apps.
  - stable-3_5_0: OJS 0f2de4ff3f, OMP 9e2a7fd005, OPS d4a7e97a55
    (lib/pkp c4c0aa8c52 in all three), the commits pkp tagged
    `3_5_0-6` in the three apps: the same result on the three apps.
- The cookie restore, by code, on both tips: `PKPAuthenticateSession::handle()`
  (the `$this->guard()->user()` call), `PKPSessionGuard::userFromRecaller()`
  (`setUserDataToSession()`), `PKPRequest::getUser()` and
  `Validation::login()` (`Auth::attemptWhen()`); `git show 442148e14e`.
- The releases, by code, in pkp-lib's tags (`git show <tag>:<path>`):
  `classes/core/PKPRequest.php` at `3_5_0rc2` and `3_5_0-0` to `3_5_0-5`
  resolves the user from the session's `userId` alone
  (`Validation::isLoggedIn()` the same), and `PKPSessionGuard` there has
  no `userFromRecaller()` that would write it;
  `Validation` and `SessionManager` at `3_4_0-0`, `3_4_0-11`, `3_3_0-6`
  and `3_3_0-23` use the tick as the branches do, and the template has
  the same line in each. The `remember_me_lifetime` setting is in
  `PKPContainer.php` from `3_5_0-5` on; the earlier 3.5 tags set no
  lifetime for the cookie, which leaves Laravel's own (400 days,
  `SessionGuard::$rememberDuration`; not walked).
- The themes: each template read on its repository's default branch
  (`main` in all five) on 2026-10-07 at
  `https://raw.githubusercontent.com/pkp/<theme>/HEAD/<path>`, the paths
  and lines as under Cause. `pkp/healthSciences` keeps the box in
  `loginForm.tpl`, not in its `userLogin.tpl`. `pkp/oldGregg`,
  `pkp/defaultManuscript` and `pkp/material` answered 404 for
  `templates/frontend/pages/userLogin.tpl`; other theme repositories
  were not looked at. No theme was installed or walked, nor read again
  on 2026-11-02.
- The fix was tried on 2026-11-02 on the `main` tips above:
  [fix.diff](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/keep-me-logged-in-always-ticked/fix.diff),
  `node bin/try-fix.js apply shared/playwright/checks/issues/keep-me-logged-in-always-ticked/fix.diff ojs omp ops`,
  then walk.js and walk.js `neighbour` with the command above, each on a
  freshly loaded dataset, then `revert` and walk.js `neighbour` again.
- 3.4, by code: OJS `stable-3_4_0` at 8bd9e6f9a0, OMP at e92ae5b6d,
  OPS at d6dd7247c9, pkp-lib f4719f2805.
  `templates/frontend/pages/userLogin.tpl` line 73 is the same;
  `pages/login/LoginHandler.php` assigns `remember` on display and on a
  refused sign-in; no app overrides the template; `pkp/pkp-lib#12780`
  is not on the branch. What the tick does there:
  `Validation::registerUserSession()` (`setRemember()`, then the session
  cookie's lifetime), `SessionManager` (sessions not remembered are
  dropped a day after their last use) and `config.TEMPLATE.inc.php`
  (`session_lifetime = 30`). None of these files changed since the
  2026-10-07 read (pkp-lib 767353f4fe).
- 3.3, by code: OJS `stable-3_3_0` at 2f766afdb1, OMP at 35fb87173,
  OPS at 1f02fc5641, pkp-lib 5b26595791. The same template line 73;
  `pages/login/LoginHandler.inc.php` assigns `remember` the same way;
  no app overrides the template; `Validation.inc.php` and
  `SessionManager.inc.php` use the tick as on 3.4, unchanged since the
  2026-10-07 read (pkp-lib ac3fa73402).
- Introduced: `git blame` on the line names 60fa6ff5ed
  (`pkp/pkp-lib#1614`, 2016-07-15), which only re-indented it when the
  implicit-auth branch was removed; `git log -S'checked="$remember"'`
  finds its first appearance in be949906f5, in `templates/user/login.tpl`,
  replacing `{fbvElement type="checkbox" … checked=$remember}`. GitHub's
  API (`commits/be949906f5/pulls`) names `pkp/pkp-lib#658` ("style
  register and login pages", NateWr, merged 2015-08-07); the commit
  message names only `pkp/pkp-lib#639`.
- Upstream (2026-11-02): pkp/pkp-lib, pkp/ojs, pkp/ui-library and the
  pkp organisation searched for "keep me logged in", "remember me" with
  login, `remember checkbox checked`, `userLogin.tpl remember`,
  `rememberUsernameAndPassword` and `checked="$remember"`.
  `pkp/pkp-lib#1867` (closed 2016) renamed the label to "Keep me logged
  in" and does not mention the box's state; `pkp/pkp-lib#12586` (merged,
  the `remember_me_lifetime` setting) changed the handler and the
  cookie, not the template; `pkp/pkp-lib#12780` (closed, fixed by
  442148e14e) is about the cookie not signing users back in, not the
  box.
- Not driven: 3.4 and 3.3 (code only); the rate-limited refusal (code);
  MySQL not checked, though nothing here depends on the database.
- Unverified: that "Logout" or a password change ends a remembered
  sign-in, as "What goes with it" says, rests on spec U01's own walks
  (its Rule 5a), not on this script.
