# "Save" under "Theme" fails with a server error while the theme in use is unticked

- **Severity** low
- **Effort** small
- **Kind** defect
- **Crash** server
- **Affects**
  - main: OJS, OMP, OPS
  - 3.5: OJS, OMP, OPS
  - 3.4: OJS, OMP, OPS (code)
  - 3.3: OJS, OMP, OPS (code)
- **Introduced** the journal's save: `pkp/pkp-lib#3931` for `pkp/pkp-lib#3594` · [5f3be929e6](https://github.com/pkp/pkp-lib/commit/5f3be929e69f428774dfd0237f666c356859e2b3) · 2018-10-23 · Nate Wright (NateWr); the site's save: `pkp/pkp-lib#5241` for `pkp/pkp-lib#4762` · [c4985f94ae](https://github.com/pkp/pkp-lib/commit/c4985f94aea6577a1e6c513ad07de2ff839367e0) · 2019-11-02 · Nate Wright (NateWr)
- **Upstream** none found (2026-10-27)
- **Tracked in** spec U10 [A26](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U10-appearance-and-theming.md#a26)
- **Checked** 2026-10-27, each branch's tip (the commits in Evidence)
- **Model** claude-opus-5-5

## Summary

A Journal Manager unticks the theme the journal uses ("Default Theme"
on PKP's default installation) under Settings › Website › "Plugins",
then opens Settings › Website › "Appearance" › "Theme": the "Theme"
list is empty. Pressing "Save" there fails: the request answers 500
and the page shows "An unexpected error has occurred. Please reload the
page and try again.", with no "Saved" and nothing saying the theme is
switched off. The stored theme stays `default`.

The Site Administrator gets the same on Administration › "Site
Settings" › "Appearance" › "Theme" after unticking "Default Theme" on
"Site Settings" › "Plugins". Administration shows those two tabs only
once a site hosts two or more journals, so a single-journal site never
meets this half.

Ticking the theme again ends it. When another theme plugin is enabled,
the list offers it, and choosing it and pressing "Save" switches the
journal (or the site) to it.

## Impact

- **Lost**: nothing; the save sends only the unchanged theme name, and
  the tab shows no other field. What the manager loses is the reason:
  the message says to reload and try again, which fails the same way.
- **Who**: a Journal Manager (Press Manager, Preprint Server Manager) or
  the Site Administrator who has switched off the theme in use, then
  presses "Save" on the "Theme" tab. It is a rare state: switching the
  theme off leaves the public pages unstyled.
- **Way round**: tick the theme again under "Plugins", or choose another
  enabled theme in the list. Either way "Save" then works.

Low: the manager is not stuck on the switched-off theme, and the fault
is a server error where a refusal with its reason belongs. It would be
medium if the tab held fields a manager could change and lose.

## Steps to reproduce

Preconditions:

- PKP's default test dataset for `main`, context `publicknowledge`
  (ID 1). The journal (press, server) and the site use "Default Theme".
- For the site part: a second journal (press, server), created in step
  7, since the site's "Appearance" and "Plugins" tabs show only on a
  site with more than one.

Journal (press, server):

1. Sign in as `rvaca` (Journal Manager; Press Manager, Preprint Server
   Manager) on the context's login page.
2. Settings › Website › "Plugins". Untick "Default Theme" and press "OK"
   in the window "Are you sure you want to disable this plugin?". The
   notice reads "The plugin "Default Theme" has been disabled."
3. Settings › Website › "Appearance" › "Theme". The "Theme" list is
   empty and no other field shows.
4. Press "Save".
5. Back on "Plugins", tick "Default Theme" again ("The plugin "Default
   Theme" has been enabled."), open "Appearance" › "Theme" and press
   "Save".

Site:

6. Sign out and sign in as `admin`.
7. Administration › "Hosted Journals" ("Hosted Presses", "Hosted
   Servers") › "Create Journal" ("Create Press", "Create Server"). Fill
   in the name "hkq27a Second Journal" ("… Press", "… Server"), the
   initials "HKQ27A", a contact name and email, the country "Canada"
   and the path `hkq27a`; tick English under "Languages" and choose it
   under "Primary locale". Press "Save".
8. Administration › "Site Settings" › "Plugins". Untick "Default Theme"
   and press "OK".
9. "Site Settings" › "Appearance" › "Theme". The list is empty; press
   "Save".
10. Back on "Plugins", tick "Default Theme" again, open "Appearance" ›
    "Theme" and press "Save".

**Expected**: steps 4 and 9 are refused, and the reason shows under
"Theme". Choosing a theme the install lacks already gets that refusal
today: "The theme you selected is not installed or enabled.". Steps 5
and 10 show "Saved".

**Observed**: steps 4 and 9 send `themePluginPath=default` (`PUT
…/api/v1/contexts/1/theme`, `PUT index/api/v1/site/theme`) and answer:

```
500 {"error":"Call to a member function validateOptions() on null"}
```

The page shows the notice "An unexpected error has occurred. Please
reload the page and try again.", no field error and no "Saved". The
server log has:

```
production.ERROR: Call to a member function validateOptions() on null {"exception":"[object] (Error(code: 0): Call to a member function validateOptions() on null at …/lib/pkp/api/v1/contexts/PKPContextController.php:521)
production.ERROR: Call to a member function validateOptions() on null {"exception":"[object] (Error(code: 0): Call to a member function validateOptions() on null at …/lib/pkp/api/v1/site/PKPSiteController.php:224)
```

## Cause

`PKPContextController::editTheme()` (`api/v1/contexts/PKPContextController.php`,
pkp-lib) validates the sent `themePluginPath` only when it differs from
the stored one (line 491). The validation is what checks that the theme
is an enabled theme plugin (`PKPContextService::validate()`, the
`manager.setup.theme.notFound` rule). An unchanged path is taken on
trust, though the theme it names may have been disabled or removed
since it was chosen.

The method then looks the path up among the enabled theme plugins
(`PluginRegistry::loadCategory('themes', true)`), finds none, and calls
`$selectedTheme->validateOptions()` on `null` (line 521).
`PKPSiteController::editTheme()` (`api/v1/site/PKPSiteController.php`)
has the same shape: the check at line 193, the crash at line 224.

The form is what sends the unchanged path. `PKPThemeForm` fills the
"Theme" list from the enabled themes only, but sets the field's value
to the stored path, so the list shows empty and "Save" sends
`themePluginPath=default`. A theme chosen from the list is a changed
path, so it is checked and saved; only the unchanged one fails.

Both handlers have had this check since they were written (see
Introduced).

Reach:

- The Settings Wizard's "Appearance" tab (Administration › "Hosted
  Journals", a journal's "Settings wizard") builds the same form against
  the same request, so it fails alike (code).
- A theme deleted from the installation while still in use fails the
  same way, by the same lookup (code).
- Reading the theme settings through the same addresses (`GET`) in the
  same state goes wrong in two other ways, each reported apart with its
  own fix, and neither fix reaches this one. The journal's read is
  refused with the theme's name left as a placeholder (U10
  [A23](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U10-appearance-and-theming.md#a23)).
  The site's read fails with a server error from a missing `return`
  (U10
  [A24](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U10-appearance-and-theming.md#a24)).
- Every other reader of the enabled themes (`PKPTemplateManager`,
  `PageHandler`, `PKPNavigationMenuService`, `NavigationMenuForm`)
  skips a missing active theme (code).

## Proposed fix

Validate the path on every save, not only when it changes, in both
handlers
([fix.diff](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/theme-save-server-error-theme-switched-off/fix.diff)):

```diff
 // api/v1/contexts/PKPContextController.php, editTheme()
         $themePluginPath = empty($params['themePluginPath']) ? null : $params['themePluginPath'];
+        $errors = $contextService->validate(
+            EntityWriteInterface::VALIDATE_ACTION_EDIT,
+            ['themePluginPath' => $themePluginPath],
+            $context->getSupportedFormLocales(),
+            $context->getPrimaryLocale()
+        );
+        if (!empty($errors)) {
+            return response()->json($errors, Response::HTTP_BAD_REQUEST);
+        }
         if ($themePluginPath !== $context->getData('themePluginPath')) {
-            $errors = $contextService->validate(
-                …
-            );
-            if (!empty($errors)) {
-                return response()->json($errors, Response::HTTP_BAD_REQUEST);
-            }
             $newContext = $contextService->edit($context, ['themePluginPath' => $themePluginPath], $request);
         }
```

`PKPSiteController::editTheme()` gets the same move with
`$siteService->validate()`. The services already own the rule ("the
theme plugin is installed and enabled") and the message for it, and the
form already shows their errors under the field, so the save is refused
the way a missing theme is refused today. The condition stays around
`edit()`, which keeps the original intent: an unchanged theme is not
written again and its `init()` is not re-run.

The fix covers a theme path that is sent and names a switched-off or
removed theme: the validator runs the same lookup the handler runs
next, so once it passes, `$selectedTheme` is found. An empty or missing
`themePluginPath` needs nothing more. The handler turns it into `null`.
The services' theme rule skips an empty value, but the schema's
`"type": "string"` becomes a `string` rule with no `nullable`, and
Laravel runs that rule on a key present with `null`. So the save is
refused with `400 {"themePluginPath":["This is not a valid string."]}`
before anything is written, today (the path differs from the stored
one) and with the fix. Read in the code, not sent.

Tried on `main` in the three apps: steps 4 and 9 then answered `400
{"themePluginPath":["The theme you selected is not installed or
enabled."]}`, and the page showed that reason in red under "Theme",
"Please correct one error." beside "Save" and the notice "The form was
not saved because 1 error(s) were encountered.", with nothing in the
server log. Steps 5 and 10 still showed "Saved". A check that the fix
refuses nothing else, with the theme switched on: a changed
"Typography" on the journal's and the site's "Theme" tab saved with
"Saved" and was stored, with the fix in and out.

**Alternatives**:

- A `null` check after the lookup returning a refusal: it duplicates
  the services' rule and message in two handlers, and the cases it
  would add (an empty path) are refused already.
- Show the switched-off theme in the "Theme" list, or a notice on the
  tab: a product choice that helps the manager before the save, but the
  handler would still crash on any client sending the stored path.

**What goes with it**:

- The same change applies to 3.5 (lines 478 and 190), and as written in
  the Slim handlers of 3.4 (`PKPContextHandler.php` line 461,
  `PKPSiteHandler.php` line 199) and 3.3 (the `.inc.php` files, lines
  404 and 176), whose services carry the same rule.
- A test: a save of the theme with the stored theme plugin disabled,
  asserting 400 with the `themePluginPath` error, for the context and
  the site.
- `fix.diff` paths start at the app root (`a/lib/pkp/…`): apply it from
  the app root, or with `-p3` in pkp-lib.

Small: a block moved in each of two handlers, following the services'
existing rule, and its test.

## Evidence

- Kept script: [walk.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/theme-save-server-error-theme-switched-off/walk.js)
  with its [lib.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/theme-save-server-error-theme-switched-off/lib.js),
  run on an install reset to the default dataset:
  `PROBE_FEATURE=<feature> PROBE_AGENT=<id> node bin/probe.js all shared/playwright/checks/issues/theme-save-server-error-theme-switched-off/walk.js`
  (`MODE=neighbour` for the saves with the theme switched on and a
  changed "Typography"; `PKP_E2E_LINE=stable-3_5_0` in front for 3.5).
- Walked 2026-10-27 on `main` (ojs `5153465178`, omp `ceae6e275f`, ops
  `66a3bb98a5`, each with pkp-lib `c27153abdd`, ui-library `1f9fb95e53`)
  and `stable-3_5_0` (ojs `a9e01889b0`, omp `3c8c7c4964`, ops
  `07926c35b4`; pkp-lib `3fd17879b3` under OJS and OMP, `9a0212faff`
  under OPS; ui-library `a12b752338`), PKP's default dataset
  (pkp/datasets `accd72de`), PostgreSQL. Both branches showed the
  Observed on the three apps, for the journal and the site; the log
  names `PKPContextController.php:508` and `PKPSiteController.php:221`
  on 3.5.
- Fix trial on `main` at the tips above:
  `node bin/try-fix.js apply shared/playwright/checks/issues/theme-save-server-error-theme-switched-off/fix.diff ojs omp ops`,
  the walk, then `MODE=neighbour` with the fix in and after
  `node bin/try-fix.js revert …`.
- 3.4 and 3.3, read in pkp-lib at `stable-3_4_0` (`3a26bb98d6`) and
  `stable-3_3_0` (`f80a52ed4d`), apps at `stable-3_4_0` (ojs
  `6895dcb6d6`, omp `e0263ebd1b`, ops `029b610a0f`) and `stable-3_3_0`
  (ojs `c6590e2012`, omp `e48518ad43`, ops `8b6f5c77e2`):
  `api/v1/contexts/PKPContextHandler(.inc).php` and
  `api/v1/site/PKPSiteHandler(.inc).php` validate only a changed path
  and call `validateOptions()` on the looked-up theme;
  `PKPThemeForm(.inc).php` fills the list from enabled themes with the
  stored value; `templates/admin/settings.tpl` has the site's
  "Appearance" and "Plugins" tabs. Not walked.
- Introduced: `git blame` on the check (line 491) and the call (line
  521) stops at `e3f570bc37` (PSR-12 reformat) and `71e79e31e3` (Laravel
  router move); `git log -S` finds the check and the call first in
  `5f3be929e6` (context) and `c4985f94ae` (site). `c4985f94ae` reached
  pkp-lib through merge `c2a5bce9cf` ("Merge pull request #5241 from
  NateWr/i4762_multipress").
- The site's tabs: `AdminHandler::siteSettingsAvailability()` shows
  "Appearance" and "Plugins" only when the context count is not 1.
- Another enabled theme, read in the code, not walked (the default
  dataset has one theme plugin): `PKPThemeForm` lists every enabled
  theme; ui-library's `ThemeForm.vue` `changeTheme()` sets the chosen
  path and that theme's fields; `editTheme()` validates the changed path
  (it passes), stores it with `edit()` and finds the theme.
- An empty or missing `themePluginPath`, read in the code, not sent:
  `PKPSchemaService::getValidationRules()` gives `themePluginPath` the
  rule `['string']` (no `validation` in `schemas/context.json` or
  `schemas/site.json`); Laravel's `Validator::isValidatable()` runs a
  non-implicit rule on a key present with `null`, and `validateString()`
  fails it; `ValidatorFactory` maps `string` to `validator.string`
  ("This is not a valid string.").
- Upstream, searched 2026-10-27 in pkp/pkp-lib, pkp/ojs, pkp/omp,
  pkp/ops and pkp/ui-library by the symptom and by `validateOptions`,
  `editTheme`, `themePluginPath` and "not installed or enabled":
  `pkp/pkp-lib#10714` (a site theme save failing in `saveOption()`, with
  the theme enabled), `pkp/pkp-lib#5914` (a disabled theme selectable in
  3.2) and `pkp/pkp-lib#11396` (a missing theme crashing the home page)
  are other faults.
- Not driven: the Settings Wizard's "Appearance" tab and a deleted theme
  (Cause, Reach). MySQL not checked; the fault does not depend on the
  database.
