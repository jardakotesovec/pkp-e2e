# Audit log records a session ended by a password change in another browser as an IP address change

- **Severity** low
- **Effort** small
- **Kind** defect
- **Affects**
  - main: OJS, OMP, OPS
  - 3.5: none (no audit log)
  - 3.4: none (code; no audit log)
  - 3.3: none (code; no audit log)
- **Introduced** `pkp/pkp-lib#13088` for `pkp/pkp-lib#12336` · [b3a6443a1e](https://github.com/pkp/pkp-lib/commit/b3a6443a1e4348a2fcc865aefb8c9ed0c41b4333) · 2026-08-12 · Touhidur Rahman (touhidurabir)
- **Upstream** none found (2026-10-21)
- **Tracked in** spec U01 [A17](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U01-login-and-sessions.md#a17)
- **Checked** 2026-10-21, each branch's tip (the commits in Evidence)
- **Model** claude-opus-5-5

## Summary

With the audit log on, a session ended by a password change in another
browser is logged as an IP address change, the same address given as
old and new. The user is signed out as expected; only the log line is
wrong. It should say that the session ended because the password
changed.

The same line is written whenever a user's password changes while they
are signed in elsewhere: on the Profile's "Password" tab, through an
emailed reset link, at a forced change at sign-in, and when an
administrator changes their own password on "Edit User". An
administrator reading the log sees an IP check fire that did not fire,
and the log has no line that gives the real reason.

The audit log is new in `main` and in no release yet, so this can be
put right before 3.6 ships.

## Impact

- **Lost**: a correct audit record of why a session ended. No screen
  shows the audit log, so the wrong reason is seen only by whoever reads
  the server's log.
- **Who**: administrators, and any log monitoring they run, on an
  install that has switched the audit log on. Every user who changes or
  resets their password while signed in on another device or browser
  produces one such line, written when that other session sends its next
  request, which can be hours later.
- **Way round**: none in the app. A reader can tell these lines apart
  from a real IP change only because `oldIp` and `newIp` are the same.
  Matching them to the password change is unreliable: the forced change
  at sign-in writes no audit line, a reset writes "Password reset
  completed" rather than "Password changed", and the forced sign-out
  line can come much later.

Low: the sign-out itself works and no data is lost. It would be higher
on an install whose monitoring raises an alert on an IP change, where
every such sign-out would be a false alert.

## Steps to reproduce

Preconditions:

- PKP's default test dataset for `main`, context `publicknowledge`.
- In `config.inc.php`, section `[logs]`, `log_audit = On` (the dataset
  ships it commented out, `; log_audit = Off`). The dataset's
  `log_channel = errorlog` writes the audit lines to the web server's
  error log.
- Two browsers, A and B (a normal and a private window will do).

Steps:

1. In browser B, open the Login page and sign in as `dbarnes`
   (`dbarnesdbarnes`). The Dashboard opens.
2. In browser A, sign in as `dbarnes` too. In the user menu, choose
   "Edit Profile", then the "Password" tab.
3. Type `dbarnesdbarnes` in "Current password" and a new password in
   "New password" and "Repeat new password". Note the time, then press
   "Save". The page says "Your changes have been saved."
4. In browser B, reload the Dashboard. The Login page opens.
5. Read the server's error log from the time noted in step 3 onwards.

**Expected**: after the "Password changed" line, a line saying that
`dbarnes`'s session in B ended because the account's password changed,
with no claim of an address change.

**Observed**: the line for B reads as an IP address change, with the
same address as old and new (user agent left out):

```
production.NOTICE: Password changed {"userId":3,"ip":"127.0.0.1","contextId":1,"requestUrl":"http://127.0.0.1:8363/index.php/publicknowledge/$$$call$$$/tab/user/profile-tab/save-password","event":"authn_password_change","status":"success"}
production.WARNING: User forcibly logged out after a session IP address change {"userId":3,"oldIp":"127.0.0.1","newIp":"127.0.0.1","ip":"127.0.0.1","contextId":1,"requestUrl":"http://127.0.0.1:8363/index.php/publicknowledge/en/dashboard/editorial","event":"session_expired","status":"denied"}
```

Control: in B, the user menu's "Logout" writes
`production.INFO: User logged out` (`"event":"session_logout"`).

## Cause

`PKPAuthenticateSession` (`lib/pkp/classes/middleware/PKPAuthenticateSession.php`)
extends Laravel's `AuthenticateSession` and overrides its `logout()`.
Two callers reach that one method:

- Laravel's `AuthenticateSession::handle()`, on every request, when the
  password hash kept in the session no longer matches the account's, or
  when a remember-me cookie's hash does not match or is missing. This is
  how a password change elsewhere ends the session.
- `PKPAuthenticateSession::handle()` itself, when `[security]
  session_check_ip` is on and the request's address differs from the
  session's `login_ip`. `session_check_ip = On` is the default in
  `config.TEMPLATE.inc.php` and in the dataset, so this check runs on a
  default install.

`logout()` writes `AuditEvent::AUTH_LOGOUT_IP_CHANGE` ("User forcibly
logged out after a session IP address change", `session_expired`) with
`oldIp` and `newIp` on every call. It cannot tell its callers apart, so
the password-hash case is recorded as the IP case.

Every action that stores a new password hash and keeps the acting
session (`Auth::logoutOtherDevices()`) ends the account's other sessions
through Laravel's branch, so each writes the same wrong line:

- Profile › "Password" (`ChangePasswordForm::execute()`): walked on
  OJS, OMP and OPS.
- The emailed reset link's new password (`ResetPasswordForm::execute()`,
  from `LoginHandler::updateResetPassword()`): checked in the code.
- The forced password change at sign-in (`LoginChangePasswordForm`):
  checked in the code.
- An administrator or manager saving a new password for their own
  account in the "Edit User" window (`UserDetailsForm::execute()`, the
  branch for the signed-in user's own account): checked in the code.
- The automatic re-hash of a password stored with an older bcrypt cost,
  at the user's first sign-in after an upgrade, which also ends their
  other sessions (filed as its own issue, ""Login As" ends and a save
  made as the user is silently lost when that user first signs in after
  an upgrade"): checked in the code.

Saving a password for another user in "Edit User", and "Disable User",
delete that user's session rows instead (`invalidateOtherSessions()`),
so no forced sign-out runs and the save's own line (`USER_PASSWORD_RESET`,
`USER_DISABLED`) is the only one. "Logout" writes `AUTH_LOGOUT` from
`Validation::logout()`.

## Proposed fix

We propose passing the reason into `logout()` and recording it, the way
`DecodeApiTokenWithValidation` records one event with a `reason` detail
for each way an API token fails. The IP check passes `'ip_changed'`.
Laravel's own calls pass nothing and get `'password_hash_mismatch'`:
that is what each of them detects, including a remember-me cookie that
carries no hash, which a name like `password_changed` would mislabel.
Only the IP case records `oldIp`/`newIp`. The event keeps its OWASP
token `session_expired`, which OWASP's vocabulary gives a reason field;
the case and its message lose the IP wording. The diff, against the app
root: [fix.diff](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/password-change-logout-audited-as-ip-change/fix.diff)

```diff
--- a/lib/pkp/classes/middleware/PKPAuthenticateSession.php
+++ b/lib/pkp/classes/middleware/PKPAuthenticateSession.php
-            $this->logout($request);
+            $this->logout($request, 'ip_changed');
 ...
-    protected function logout($request)
+    protected function logout($request, string $reason = 'password_hash_mismatch')
     {
-        AuditLog::log(AuditEvent::AUTH_LOGOUT_IP_CHANGE, LogLevel::WARNING, [
+        $details = [
             'userId' => $request->user()?->getId(),
-            'oldIp' => $request->session()->get('login_ip'),
-            'newIp' => $request->ip(),
-        ]);
+            'reason' => $reason,
+        ];
+        if ($reason === 'ip_changed') {
+            $details['oldIp'] = $request->session()->get('login_ip');
+            $details['newIp'] = $request->ip();
+        }
+        AuditLog::log(AuditEvent::AUTH_LOGOUT_FORCED, LogLevel::WARNING, $details);
--- a/lib/pkp/classes/security/AuditEvent.php
+++ b/lib/pkp/classes/security/AuditEvent.php
-    case AUTH_LOGOUT_IP_CHANGE = 'session_expired';
+    case AUTH_LOGOUT_FORCED = 'session_expired';
-            static::AUTH_LOGOUT_IP_CHANGE => 'User forcibly logged out after a session IP address change',
+            static::AUTH_LOGOUT_FORCED => 'User forcibly logged out',
-            static::AUTH_LOGOUT_IP_CHANGE,
+            static::AUTH_LOGOUT_FORCED,
```

Tried on OJS, OMP and OPS `main`: the Steps then write `WARNING: User
forcibly logged out` with `"reason":"password_hash_mismatch"` and no
`oldIp`/`newIp`. With and without the fix, a session whose password did
not change carries on and writes no such line, and "Logout" still writes
"User logged out". The IP branch could not be walked, because the test
install sees every request from one address. It was read in the code,
and since the IP check is on by default its side of the diff deserves a
look in review.

**Alternatives**:

- A second event case for the password case, with its own message
  beside the IP one. Its log line would read on its own. But
  `session_expired` is taken and enum values must be unique, so it would
  need a second token, outside OWASP's vocabulary.
- Logging from `handle()` before each call instead of in `logout()`.
  Laravel's calls sit inside the parent's `handle()`, so the override
  could not log them without copying that method.

**What goes with it**:

- The case rename touches only these two files in pkp-lib; no app or
  plugin refers to `AUTH_LOGOUT_IP_CHANGE`.
- No stored data to repair: the lines are in the server's log.
- Test: `AuditLog::log()` writes nothing under unit tests, so the check
  is an end-to-end one (with `log_audit = On`, a session ended by a
  password change elsewhere writes `session_expired` with
  `"reason":"password_hash_mismatch"`), planned in this campaign's login
  and sessions spec.

Small: two files in one repository, no data repair, and nothing released
relies on the old event name.

## Evidence

- Kept script:
  `shared/playwright/checks/issues/password-change-logout-audited-as-ip-change/walk.js`
  (helpers in `lib.js`). The default mode takes the Steps (browsers A
  and B, the log read through the install's server log) and changes the
  password back afterwards; `nb` is the control run (B's Dashboard
  reloaded twice with nothing changed, then "Logout"). It switches
  `log_audit = On` in the install's config itself. Run on an install
  loaded from the dataset named in the Preconditions:
  `node bin/probe.js all shared/playwright/checks/issues/password-change-logout-audited-as-ip-change/walk.js [nb]`.
- Walked: the Steps on `main` and `stable-3_5_0`, OJS, OMP and OPS, on
  PostgreSQL. On `main` every app wrote the two lines in Observed. The
  fix was tried twice on `main`, all three apps, each time with the
  control run with the fix applied and again after the revert: first
  with the default reason `password_changed`, then, after the read
  noted the hash-less remember-me cookie, with `password_hash_mismatch`
  (the diff as linked); both showed the Expected. On `stable-3_5_0`,
  with `[logs] log_audit = On` added to the config, B was on the Login
  page after step 4 and the log gained no audit line at all, the
  sign-in included. No response of 500 or more and no script error in
  any walk.
- Where the walk differs from the Steps: the script opens Profile ›
  "Password" by its address (`user/profile#changePassword`) rather than
  through the user menu, and marks the log's position before "Save"
  rather than noting the time.
- Code reads: `PKPAuthenticateSession::handle()`/`logout()`, Laravel
  `AuthenticateSession::handle()`/`logout()` (laravel/framework v12.65.0
  in `lib/pkp/lib/vendor`), `AuditEvent`, `AuditLog::log()`,
  `ChangePasswordForm::execute()`, `ResetPasswordForm::execute()` and
  its callers in `LoginHandler`, `LoginChangePasswordForm::execute()`
  (no audit line), `UserDetailsForm::execute()` (own account:
  `logoutOtherDevices()`; another account: `invalidateOtherSessions()`),
  `UserDisableForm`, `DecodeApiTokenWithValidation` (the `reason`
  pattern), `session_check_ip` in `config.TEMPLATE.inc.php` and the
  dataset's `config.inc.php`. A grep of `AUTH_LOGOUT_IP_CHANGE` across
  the three app checkouts finds only the two files the diff changes.
  Who can open "Edit User" with a password box on their own account
  (the Site Administrator's settings wizard, a manager's grid) was not
  driven.
- 3.5: `stable-3_5_0` pkp-lib has no `AuditLog`/`AuditEvent` class, and
  its `PKPAuthenticateSession::logout()` writes nothing. 3.4 and 3.3:
  pkp-lib `origin/stable-3_4_0` and `origin/stable-3_3_0` hold no audit
  log class and no `PKPAuthenticateSession` (`git ls-tree`).
- Introduced: `git blame` on the `AuditLog::log(...)` line of
  `logout()` gives 8a586abc5a (the event renamed to
  `AUTH_LOGOUT_IP_CHANGE`, `pkp/pkp-lib#12336`); blame at its parent
  gives b3a6443a1e, which added the IP-change entry to `logout()`
  (`'auth.logout.forced_ip_change'`). Both are in PR `pkp/pkp-lib#13088`
  ("Audit logging"). b3a6443a1e was authored 2026-07-23 and committed on
  2026-08-12, the day the PR merged; the header gives the commit date.
  `logout()` came with 5b34729cfd (`pkp/pkp-lib#9566`) and the IP check
  that calls it with 634eb2b0cb (`pkp/pkp-lib#12547`).
- Upstream: searched pkp/pkp-lib, pkp/ojs, pkp/omp and pkp/ops for
  "audit log logout IP", "forcibly logged out", `AUTH_LOGOUT_IP_CHANGE`,
  `PKPAuthenticateSession logout`, "session_expired audit" and "audit log
  password change session". Only `pkp/pkp-lib#12336` (closed, the
  feature's own issue) matched; its event table lists the event as it is
  and does not discuss the password case.
- Tips: OJS `main` 3109a59114 (lib/pkp f37a174626), OMP 5777025bec and
  OPS f048e747b4 (lib/pkp 042726ebf6); the two files the fix changes are
  identical in both and on pkp-lib `main` 7269eaf6f0 (2026-10-20).
  `stable-3_5_0`: OJS 1e78ca0c2b, OMP cce424e5ef, OPS 5eca7fd603,
  pkp-lib 68512b5fda. `stable-3_4_0` (code): OJS 0012bd1022, OMP
  e30fa7e38c, OPS 0f1e21a117, pkp-lib 85f47442cf. `stable-3_3_0`
  (code): OJS d7d9dd14ec, OMP 8e72fc8836, OPS c5532e2161, pkp-lib
  867ce82d8e. Dataset: pkp/datasets 5f247d04 (2026-10-20).
- Unverified: the reset, forced-change, own-account "Edit User",
  re-hash and remember-me paths were read in the code, not walked; the
  IP branch of the fix was not walked. MySQL not checked (nothing here
  depends on the database).
