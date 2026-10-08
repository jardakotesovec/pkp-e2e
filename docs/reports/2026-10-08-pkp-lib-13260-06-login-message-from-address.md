# The login page prints the address's `loginMessage` as HTML

- **Severity** medium
- **Effort** small
- **Kind** defect (introduced by an open PR; nothing is merged)
- **Security** unreleased
- **Affects**
  - main: none yet; OJS (any theme); OMP and OPS (code) once the PRs merge
  - 3.5, 3.4, 3.3: none (the PRs target `main`)
- **Introduced** `pkp-lib#13260` for `pkp-lib#13242` (the Blade theme "Eidos") · open PR · reviewed 2026-10-08 · Nate Wright (NateWr)
- **Upstream** `pkp-lib#13242` (open)
- **Tracked in** ci-triage companion row for pkp/ojs#5784 · overview [2026-10-08-pkp-lib-13260.md](2026-10-08-pkp-lib-13260.md) · Temporary: delete once acted on
- **Checked** 2026-10-08, the PR heads (the commits in Evidence)
- **Model** claude-opus-5-5

## Summary

The login page shows a notice above the form that comes from the
`loginMessage` parameter of its address. On `main` and on 3.5 the
parameter is a text key that the page translates. With the PRs the page
prints the parameter itself, as HTML: links and images survive (scripts
are stripped). Two effects: a link the application built before the
change, or a bookmark, now shows a raw key; and a prepared link can put
any sentence with a working link above a journal's real login form.

## Impact

- **Lost**: the notice for existing links (a key instead of a sentence); and the guarantee that the text above the login form is the application's own.
- **Who**: any visitor who follows a link to the login page.
- **Way round**: none.

Medium: a page that can mislead, on every install, needing a prepared link.

## Steps to reproduce

Preconditions: PKP's default dataset. The "Eidos" theme is never enabled or selected in these steps; the journal stays on the Default theme.

1. As a visitor open `/index.php/publicknowledge/en/login?loginMessage=user.login.loginError`.

   **Expected**: "Invalid username/email or password. Please try again." **Observed**: `user.login.loginError`.

**On `main` today:**

![On `main` today](img/2026-10-08-pkp-lib-13260/06-login-key-before.png)

**With the PRs:**

![With the PRs](img/2026-10-08-pkp-lib-13260/06-login-key-after.png)

2. Open
   `/index.php/publicknowledge/en/login?loginMessage=Your session has expired. <a href="https://example.org/">Sign in here</a> instead.`

   **Expected**: no text from the address on the page. **Observed**: the sentence above the form, "Sign in here" a working link to example.org.

![With the PRs: a sentence and a link from the address](img/2026-10-08-pkp-lib-13260/06-login-html-after.png)

## Cause

Two changes in pkp-lib#13260 turn the key into free text:

```diff
 // classes/security/Validation.php, redirectLogin()
-            $args['loginMessage'] = $message;
+            $args['loginMessage'] = __($messageLocaleKey);     // the sentence now travels in the address
```

```diff
 {* templates/frontend/pages/userLogin.tpl *}
-			{translate key=$loginMessage}
+			{$loginMessage|strip_unsafe_html}
```

`LoginHandler::index()` passes `$request->getUserVar('loginMessage')` to the template unchecked, as
before. Eidos's `userLogin.blade` prints it the same way (`ViewHelper::sanitizeHtml($loginMessage)`).

## Proposed fix

Keep the parameter a key and translate it in the handler, behind the check the refusal page
already applies to its own `message` parameter ("sanity check (for XSS or phishing)" in
`PKPUserHandler::authorizationDenied()`):

```diff
 // classes/security/Validation.php
-            $args['loginMessage'] = __($messageLocaleKey);
+            $args['loginMessage'] = $messageLocaleKey;
 // pages/login/LoginHandler.php
+        $loginMessageKey = $request->getUserVar('loginMessage');
         $templateMgr->assign([
-            'loginMessage' => $request->getUserVar('loginMessage'),
+            'loginMessage' => is_string($loginMessageKey) && preg_match('/^[a-zA-Z0-9.]+$/', $loginMessageKey) ? __($loginMessageKey) : null,
```

The two templates stay as the PR has them (they print the translated sentence). Tried: step 1
shows the sentence again; step 2 shows no notice; the login page on Eidos is unchanged.

## Evidence

- **Refs.** ojs `b8904676e1` (ojs#5784, on the ojs tip `49515c6e3e`), lib/pkp `571ea1fcac` (pkp-lib#13260, on `151e6e9d69`), lib/ui-library `96764aa9` (ui-library#972, on `7f5e51ca`); PostgreSQL, PHP 8.3.
- **Driven.** Both steps at the PR head; step 1 at the tip (`shots.js`); both with the fix; fix in
  `fix-pkp-lib.diff`. In the page source of step 2 the `<a href="https://example.org/">` is intact
  and a `<script>` added to the parameter is removed.
- **Released lines.** 3.5 translates the parameter (`templates/frontend/pages/userLogin.tpl:27`,
  `{translate key=$loginMessage}`), so no markup from the address reaches the page there.
- **Not driven.** OMP and OPS (shared template and handler).
