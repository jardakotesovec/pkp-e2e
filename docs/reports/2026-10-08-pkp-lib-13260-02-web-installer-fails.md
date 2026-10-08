# The web installer shows a fatal error instead of the installation form

- **Severity** high
- **Effort** small
- **Kind** defect (introduced by an open PR; nothing is merged)
- **Crash** server
- **Affects**
  - main: none yet; OJS; OMP and OPS (code) once the PRs merge
  - 3.5, 3.4, 3.3: none (the PRs target `main`)
- **Introduced** `pkp-lib#13260` for `pkp-lib#13242` (the Blade theme "Eidos") · open PR · reviewed 2026-10-08 · Nate Wright (NateWr)
- **Upstream** `pkp-lib#13242` (open)
- **Tracked in** ci-triage companion row for pkp/ojs#5784 · overview [2026-10-08-pkp-lib-13260.md](2026-10-08-pkp-lib-13260.md) · Temporary: delete once acted on
- **Checked** 2026-10-08, the PR heads (the commits in Evidence)
- **Model** claude-opus-5-5

## Summary

On an install that is not set up yet, the installation page fails with a
fatal error. This is why every Cypress job of ojs#5784 is red: the first
test, "Installs the software", cannot find the form
(`Expected to find element: input[name=adminUsername]`), and every later
test fails behind it. No theme is involved: nothing is enabled before the
install.

## Impact

- **Lost**: installing through the browser.
- **Who**: everyone setting up a new OJS, OMP or OPS from `main`; the apps' own CI.
- **Way round**: the command-line installer (`php tools/install.php`).

High: a setup task fails for everyone, with a way round only on the command line.

## Steps to reproduce

1. A checkout at the PR heads whose configuration file has `installed = Off` (a copy of `config.TEMPLATE.inc.php`).
2. Open `/index.php/index/install`.

**Expected**: the "OJS Installation" form. **Observed**: a fatal error.

**On `main` today:**

![On `main` today](img/2026-10-08-pkp-lib-13260/02-installer-before.png)

**With the PRs:**

![With the PRs](img/2026-10-08-pkp-lib-13260/02-installer-after.png)

The message on screen (`unknown tag 'translate'`) is a follow-up error. The first error in the server log is a
database exception (no database is configured yet), raised from:

```
#13 lib/pkp/classes/site/SiteDAO.php(43): Generator->current()
#14 lib/pkp/classes/core/PKPRequest.php(549): PKP\site\SiteDAO->getSite()
#15 lib/pkp/classes/template/PKPTemplateManager.php(229): PKP\core\PKPRequest->getSite()
#16 classes/template/TemplateManager.php(42): PKP\template\PKPTemplateManager->initialize()
```

## Cause

pkp-lib#13260 adds one line to `PKPTemplateManager::initialize()` (line 229 at the PR head):

```php
'site' => $request->getSite(),
```

It runs for every request. Before the install there is no database to read the site from, so the
query throws; the template manager is left half initialised (its `{translate}` tag is not yet
registered) and the installer's template then fails to compile. The rest of `initialize()` guards
its database reads with `Application::isInstalled()` (lines 254, 272).

## Proposed fix

```diff
-            'site' => $request->getSite(),
+            'site' => Application::isInstalled() ? $request->getSite() : null,
```

Tried: the installation form renders again (HTTP 200, the "Username" field is there), and the
site-level and journal pages still receive `$site` (the pages of the other findings were opened with this line in place).

## Evidence

- **Refs.** ojs `b8904676e1` (ojs#5784, on the ojs tip `49515c6e3e`), lib/pkp `571ea1fcac` (pkp-lib#13260, on `151e6e9d69`), lib/ui-library `96764aa9` (ui-library#972, on `7f5e51ca`); PostgreSQL, PHP 8.3.
- **Driven.** An uninstalled OJS served from the checkout (`installed = Off`), the page requested at
  the tip (form) and at the PR head (fatal), then at the PR head with the fix (form).
- **The PR's own check.** pkp/ojs run 37756497468: all five Cypress jobs fail on "Installs the
  software"; the base commit's run 37748365440 installs.
- **Not driven.** OMP and OPS (the line is in shared pkp-lib; with finding 1 they do not get this far).
