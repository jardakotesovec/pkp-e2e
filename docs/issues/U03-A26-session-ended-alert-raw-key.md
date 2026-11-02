# A Profile page whose session has ended answers each press with the alert "##user.authorization.userRequired##"

- **Severity** low
- **Effort** small
- **Kind** defect
- **Affects**
  - main: OJS, OMP, OPS
  - 3.5: OJS, OMP, OPS
  - 3.4: OJS, OMP, OPS (code)
  - 3.3: OJS, OMP, OPS (code)
- **Introduced** [7e53bc157b](https://github.com/pkp/pkp-lib/commit/7e53bc157bba1dd3b1cf37f9befdbb884bb290ce) · 2012-05-07 · Alec Smecher (asmecher), a commit with no PR
- **Upstream** none found (2026-11-02)
- **Tracked in** U03 [A26](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U03-user-profile.md#a26)
- **Checked** 2026-11-02, each branch's tip (the commits in Evidence)
- **Model** claude-opus-5-5

Update 2026-11-02: since `pkp/pkp-lib#12780` (pkp-lib
[442148e14e](https://github.com/pkp/pkp-lib/commit/442148e14ef5cf836724423cf425102c2a0de480) on `main`,
[c4c0aa8c52](https://github.com/pkp/pkp-lib/commit/c4c0aa8c5293254ad253544aea230b1b607d5249) on
`stable-3_5_0`, 2026-10-31) made "Keep me logged in" work again. An
email change saved in another browser now signs out a browser that
signed in with that box unticked, and every press there raises this
alert. A browser that signed in with the box ticked stays signed in.

## Summary

When the account's session has ended while its Profile page is open in
a browser, a press there on a tab or on "Save" raises a browser alert
reading "##user.authorization.userRequired##", a code in every language,
where a sentence should say that the user has been signed out.

After "OK" the pressed tab becomes the selected one. Its area keeps what
it showed earlier on this page, or stays empty for a tab not opened
there yet. A "Save" stores nothing. Only a reload reaches the Login
page, and what was typed is lost with it.

A Site Administrator's "Expire User Sessions" brings the alert on every
press. A password change made in another browser brings it on every
press after the first; the first press fails in another way
([U03 A25](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U03-user-profile.md#a25)).
An email change saved in another browser brings it on every press in a
browser that signed in with "Keep me logged in" unticked
([U03 Rule 6a](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U03-user-profile.md#rules--state)).
By the code, a session that expired brings it too. No other page shows
this code.

## Impact

- **Lost**: nothing this fault causes. What was typed since the last
  save is lost, and nothing already saved is; with the fix the press
  still stores nothing and the reload still clears the boxes. The fix
  changes only the alert's words, so the user is told to sign in again.
- **Who**: any user whose session ends while their Profile page is open.
- **Way round**: reload the page and sign in on the Login page it shows,
  which returns to the Profile page.

Low: the user is not told in words why the press failed, and the task
gets done after a new sign-in.

## Steps to reproduce

Preconditions:

- PKP's default test dataset for `main` (OJS, OMP or OPS), loaded again
  before each group below: the password-change group changes `dbarnes`'s
  password, so a later group cannot follow it as written.
- Two browsers that do not share cookies (or a normal and a private
  window), called A and B below.
- Every sign-in below leaves "Keep me logged in" unticked, a choice the
  Login page leaves to the user; after an email change, a browser signed
  in with it ticked is signed straight back in (U03 Rule 6a).

Ending the session from Administration:

1. In B, sign in as `dbarnes` (password `dbarnesdbarnes`) and choose
   "Edit Profile" in the user menu
   (`/index.php/publicknowledge/en/user/profile`). "Identity" shows.
2. In B, type `HK` in "Preferred Avatar Initials". Do not save; leave B
   on this page.
3. In A, sign in as `admin` (password `admin`) and choose
   "Administration" in the user menu (`/index.php/index/en/admin`).
4. In A, press "Expire User Sessions" and "OK" in the confirm ("Are you
   sure you want to expire all user sessions? …"). A shows the Login
   page.
5. In B, without reloading, press "Save" under the Identity form.
6. In B, press "OK", then press the "Contact" tab.
7. In B, press "OK", then reload the page.
8. In B, sign in again as `dbarnes` and open "Edit Profile".

**Expected**: steps 5 and 6 say in words, in the page's language, that
the user has to sign in again.

**Observed**: steps 5 and 6 each raise a browser alert reading:

```
##user.authorization.userRequired##
```

On an install with `show_stacktrace = On` (the `[debug]` section of
`config.inc.php`; Off by default), the alert's text ends with the
request's address in a bracket, for example
`##user.authorization.userRequired## [/index.php/publicknowledge/$$$call$$$/tab/user/profile-tab/contact?_=…]`.

The requests are answered `200` with the refusal in JSON:

```
POST /index.php/publicknowledge/$$$call$$$/tab/user/profile-tab/save-identity
  200  {"status":false,"content":"##user.authorization.userRequired##","elementId":"0","events":[]}
GET /index.php/publicknowledge/$$$call$$$/tab/user/profile-tab/contact?_=…
  200  {"status":false,"content":"##user.authorization.userRequired##","elementId":"0","events":[]}
```

After "OK" at step 5 "HK" stays in the box and "Save" can be pressed
again; after "OK" at step 6 "Contact" is marked open and its area is
empty. Step 7 shows the Login page, and at step 8 "Preferred Avatar
Initials" is empty: nothing was saved.

After a password change in another browser:

1. In B, sign in as `dbarnes` and choose "Edit Profile".
2. In A, sign in as `dbarnes`, choose "Edit Profile", press "Password",
   type `dbarnesdbarnes` in "Current password" and `hkk16NewPass1` in
   "New password" and "Repeat new password", and press "Save". "Your
   changes have been saved." shows.
3. In B, without reloading, press the "Roles" tab.
4. In B, press the "Contact" tab.

**Expected**: steps 3 and 4 say in words, in the page's language, that
the user has to sign in again.

**Observed**: step 3 shows no alert and the page's script fails (U03
A25); step 4 raises the same alert "##user.authorization.userRequired##".

After an email change in another browser:

1. In B, sign in as `dbarnes` and choose "Edit Profile". "Identity"
   shows.
2. In A, sign in as `dbarnes`, choose "Edit Profile", press "Contact",
   replace "Email address" with `dbarnes.u03ir1@mailinator.com` and press
   "Save". The tab shows "You have requested a change of your email to
   "dbarnes.u03ir1@mailinator.com". We have already sent you an email
   with directions on how to validate the changed email."
3. In B, without reloading, press "Save" under the Identity form.
4. In B, press "OK", then press the "Contact" tab.
5. In B, press "OK", then reload the page.

**Expected**: steps 3 and 4 say in words, in the page's language, that
the user has to sign in again.

**Observed**: steps 3 and 4 each raise the alert
"##user.authorization.userRequired##", from the same `200` answers as in
the first group (`save-identity`, `contact`); step 5 shows the Login
page.

## Cause

`UserRequiredPolicy` refuses a request that has no signed-in user with
its default message, the locale key `user.authorization.userRequired`
(`lib/pkp/classes/security/authorization/UserRequiredPolicy.php`,
`__construct()`):

```php
public function __construct($request, $message = 'user.authorization.userRequired')
```

No locale file defines that key, in any language, in pkp-lib or in an
app, and none ever has: the key arrived with the class in 7e53bc157b
("Added user required policy", 2012) and no commit since has added it.
`PKPComponentRouter::handleAuthorizationFailure()` passes the message
through `__()`, which answers a missing key with `##key##`, and returns
it as a failed `JSONMessage`; the legacy `Handler.handleJson()`
(`lib/pkp/js/classes/Handler.js`) shows the `content` of a failed answer
with `alert()`.

`ProfileTabHandler::authorize()` adds the policy (since the tabbed
Profile of `pkp/pkp-lib#478`, 2015), so every Profile tab and "Save"
pressed on a page whose session has ended meets it. Each way of ending
the session leads there: "Expire User Sessions", a password change
(`Auth::logoutOtherDevices()`), and an email change, whose save in
`BaseProfileForm::execute()` calls
`PKPSessionGuard::invalidateOtherSessions()` for the account's other
sessions. The pkp-lib key that says the
same thing, `user.authorization.loginRequired` ("Login required."), is
`PKPSiteAccessPolicy`'s default and is translated in 54 of pkp-lib's 71
locales (`zh_Hant` has the msgid with an empty msgstr, which is not
loaded).

Reach:

- The Profile page's tabs and "Save" (`ProfileTabHandler`): walked.
- Page handlers that add the policy (`ProfileHandler`, `OrcidHandler`,
  `DecisionHandler`, `PKPSubmissionHandler`,
  `InitializeInvitationUIHandler`): unaffected, since
  `PKPPageRouter::handleAuthorizationFailure()` sends a request with no
  user to the Login page without showing the message (code; the
  signed-out "Edit Profile" address walked).
- The REST API (`UserRoleAssignmentReceiveController`, invitation
  acceptance): `APIRouter::handleAuthorizationFailure()` answers `403`
  with `error` the key and `errorMessage` the raw `##…##` string; that
  controller signs the invitation's user in before adding the policy, so
  no screen meets it (code).
- The same mistake elsewhere, an authorization policy whose message no
  locale defines (code; no screen walked):
  - `user.authorization.pluginLevel` (`PluginLevelRequiredPolicy`,
    pkp-lib): defined only in OMP (`omp/locale/en/manager.po`, "You do
    not have sufficient privileges to manage this plugin.", and 30 OMP
    locale folders), so undefined on OJS and OPS.
  - `user.authorization.invalidIssueGalley` (OJS
    `OjsIssueGalleyRequiredPolicy`).
  - `user.authorization.serverDoesNotPublish` (OPS
    `OpsServerMustPublishPolicy`).

## Proposed fix

Give `UserRequiredPolicy` the existing, translated key
`user.authorization.loginRequired` as its default message
([fix.diff](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/session-ended-alert-raw-key/fix.diff),
applied at the app root; it also corrects the class's `@brief`, which
speaks of a context):

```diff
-    public function __construct($request, $message = 'user.authorization.userRequired')
+    public function __construct($request, $message = 'user.authorization.loginRequired')
```

The policy's job is "a signed-in user is required", which is what
`loginRequired` says and what `PKPSiteAccessPolicy` already uses it for.
Reusing it gives users of the 54 locales that translate it a sentence
at once. The other 17 locales then show
`##user.authorization.loginRequired##` until translated, where today
all 71 show the raw code. A new key would leave every language but
English with the raw code until its translators reach it, since a key
missing in a locale is not looked up in English.

Tried on OJS, OMP and OPS `main`: with the fix, steps 5 and 6 of the
first group and steps 3 and 4 of the email-change group raise the alert
"Login required." and nothing else changes (the tab and the typed value
as before, the Login page on reload). Unchanged with the fix
in and out: a signed-in Profile page opens "Contact" and "Roles" and
saves Identity with no alert, and "Edit Profile" opened by its address
in a signed-out browser shows the Login page.

**Alternatives**:

- Define `user.authorization.userRequired` in `lib/pkp/locale/en/user.po`
  with a new sentence ("You are not signed in, or your session has
  ended. Please sign in again."): clearer wording, but English only
  until translated, and the policy also refuses requests that never had
  a session.
- Take the page to the Login page instead of an alert: that is how an
  open page handles an ended session, a fault of its own
  ([U03 A25](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U03-user-profile.md#a25)
  for the first request after a password change,
  [U01 A16](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U01-login-and-sessions.md#a16)
  for an open list's refusal); this message is still what a refused
  request says.

**What goes with it**:

- The REST API's `error` value for this refusal changes from
  `user.authorization.userRequired` to `user.authorization.loginRequired`;
  no client can have relied on the old key's text, which never existed.
- The three other undefined policy messages above are left out, each in
  another class: `user.authorization.pluginLevel` is fixed by moving
  OMP's string from `omp/locale/en/manager.po` into pkp-lib's
  `locale/en/user.po` (with OMP's translations); the OJS and OPS keys
  each need an existing key or a new one in their app.
- The diff applies as it stands to 3.5 and 3.4. 3.3's
  `UserRequiredPolicy.inc.php` writes the line in the old style, so its
  backport is the same change to
  `function __construct($request, $message = 'user.authorization.userRequired') {`.
- The guard: a PHPUnit test in pkp-lib that scans
  `classes/security/authorization/` for `'user.authorization.…'`
  literals (constructor defaults and `parent::__construct()` arguments)
  and checks each against the msgids of `locale/en/*.po`; each app runs
  the same scan over its own `classes/security/authorization/` against
  pkp-lib's `en` plus its own `locale/en/*.po`.

Small: one line in one pkp-lib class, tried on the three apps.

## Evidence

- Kept script:
  [walk.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/session-ended-alert-raw-key/walk.js)
  (helpers in `lib.js` beside it), on an install freshly loaded from the
  default dataset:
  `PROBE_FEATURE=<feature> PROBE_AGENT=<id> node bin/probe.js <app|all>
  shared/playwright/checks/issues/session-ended-alert-raw-key/walk.js`
  walks "Ending the session from Administration"; `K16_MODE=pw` "After a
  password change in another browser"; `K16_MODE=email` "After an email
  change in another browser"; `K16_MODE=nb` the neighbour check
  (a signed-in page's tabs and "Save", a signed-out "Edit Profile"
  address); `PKP_E2E_LINE=stable-3_5_0` in front for 3.5. The fix trial:
  `node bin/try-fix.js apply|revert
  shared/playwright/checks/issues/session-ended-alert-raw-key/fix.diff ojs
  omp ops`; the walk, `email` and `nb` ran with the fix applied, and
  `nb` again after the revert. Every sign-in the script makes in B, and
  `admin`'s in A, leaves "Keep me logged in" unticked.
- Walked 2026-11-02 on PostgreSQL, pkp/datasets c1a3abcd (2026-11-01),
  each mode from a fresh load: `main` OJS bc4a83e9db, OMP 853bf3b05, OPS
  fd893a8c92, lib/pkp 442148e14e (all three); `stable-3_5_0` OJS
  0f2de4ff3f, OMP 9e2a7fd00, OPS d4a7e97a55, lib/pkp c4c0aa8c52. All
  three groups of Steps showed the Observed on all six installs; on 3.5
  the screens and requests are the same as on `main`. The first walk,
  2026-10-15 (lib/pkp b17fadae59 and 4045d9241e), showed the first two
  groups the same.
- Since 2026-10-15 none of `UserRequiredPolicy`, `ProfileTabHandler`,
  `PKPComponentRouter`, `Handler.js` or `locale/en/user.po`'s
  `loginRequired` changed in a way that reaches this (lib/pkp
  `git log b17fadae59..442148e14e` and `4045d9241e..c4c0aa8c52` on those
  paths: `pkp/pkp-lib#13520` added keys to `user.po` only, and
  `pkp/pkp-lib#12780` rewrote `Validation::login()` and the
  remember-cookie restore); `fix.diff` still applies to both lines.
- Code reads: the key `user.authorization.userRequired` appears in no
  locale file of lib/pkp, OJS, OMP or OPS on `main`, `stable-3_5_0`,
  `stable-3_4_0` (lib/pkp `origin/stable-3_4_0` 55c8e406b3; OJS
  daf0ca971d, OMP 0aec65441, OPS acd8ae704b at `upstream/stable-3_4_0`)
  or `stable-3_3_0` (lib/pkp 5e84acd11b; OJS d7d9dd14ec, OMP 8e72fc883,
  OPS c5532e2161); `git log -S` over every lib/pkp branch and the OJS
  branches finds only 7e53bc157b, which adds the class (no PR:
  `commits/<sha>/pulls` is empty). 3.4 and 3.3 have the same default
  message in `UserRequiredPolicy`, the policy in
  `ProfileTabHandler::authorize()`, the `__()` in
  `PKPComponentRouter::handleAuthorizationFailure()`, the
  `alert()` in `Handler.js` and "Expire User Sessions" under
  Administration; `user.authorization.loginRequired` is defined in their
  `en` (`en_US` on 3.3) `user.po`. Missing-key lookup: `Locale::translate()`
  and `LocaleBundle::getTranslator()` load one locale only; the locale
  count is of msgids with a non-empty msgstr in `lib/pkp/locale/*/user.po`.
- Not walked: the expired session; the REST API's answer;
  the three other undefined policy messages; a locale other than
  English.
- "No other page shows this code" is a code read: of the seven classes
  that add `UserRequiredPolicy`, only `ProfileTabHandler` is served by
  the component router, which shows the message; the page handlers send
  a signed-out request to the Login page, and the one API controller
  signs its user in first. The return to the Profile page after signing
  in rests on the Login page's `source` (the reload's address, walked)
  and `LoginHandler::signIn()` redirecting to it (code).
- Upstream: searched again 2026-11-02 (pkp/pkp-lib, pkp/ojs,
  pkp/ui-library: `userRequired`, `"user.authorization.userRequired"`,
  `UserRequiredPolicy`, missing locale keys since 2026-10-14); nothing
  new. Read and not this fault: `pkp/pkp-lib#13527` (open, other
  keys used but defined in no locale; this one is not among them),
  `pkp/pkp-lib#3776` (`user.authorization.invalidQuery`, closed),
  `pkp/pkp-lib#1576` (a tab press after a timeout showing the role
  refusal, 2016).
