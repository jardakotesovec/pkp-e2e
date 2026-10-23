# A program reading the site's theme gets a server error while "Default Theme" is switched off on the site

- **Severity** low
- **Effort** small
- **Kind** regression
- **Crash** server
- **Affects**
  - main: OJS, OMP, OPS
  - 3.5: OJS, OMP, OPS
  - 3.4: none (code)
  - 3.3: none (code)
- **Introduced** `pkp/pkp-lib#9176` for `pkp/pkp-lib#7698` · [71e79e31e3](https://github.com/pkp/pkp-lib/commit/71e79e31e3d5c827e4bfa2443bbe81e5ec4c1dba) · 2023-10-13 · Touhidur Rahman (touhidurabir)
- **Upstream** none found (2026-10-23)
- **Tracked in** spec U10 [A24](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U10-appearance-and-theming.md#a24)
- **Checked** 2026-10-23, each branch's tip (the commits in Evidence)
- **Model** claude-opus-5-5

## Summary

On an installation with more than one journal (press, server), the
Site Administrator unticks "Default Theme", the theme the site itself
uses, under Administration › "Site Settings" › "Plugins". A program
that then reads the site's theme settings through the REST API gets a
server error instead of a refusal saying the theme is not enabled, which
is what the same read for a journal answers.

Up to 3.4 the site's read answered with that refusal. The step that
returns it was lost when the API moved to the new router
(`pkp/pkp-lib#9176` for `pkp/pkp-lib#7698`).

Only the theme the site uses matters: on PKP's default installation
that is "Default Theme". Saving the site's theme in the same state
fails too, a separate fault not covered here. The site's home page
still opens.

## Impact

- **Lost**: nothing is stored or lost. The program gets a server error
  (status 500) instead of the refusal.
- **Who**: a program reading `GET index/api/v1/site/theme` with the Site
  Administrator's key, while the site's theme is switched off. The
  site's Plugins list, where that is done, shows only on an
  installation with two or more journals. No screen sends this read.
- **Way round**: tick "Default Theme" again under Administration ›
  "Site Settings" › "Plugins".

## Steps to reproduce

The read is opened in the browser, signed in, as a program would send it.

Preconditions:

- PKP's default test dataset for `main`.
- A second journal (press, server), created in step 2: the site's own
  Plugins list shows only on a site with more than one.

1. Sign in as `admin`.
2. Administration › "Hosted Journals" ("Hosted Presses", "Hosted
   Servers") › "Create Journal" ("Create Press", "Create Server"). Fill
   in the name "hkq23h Second Journal" ("… Press", "… Server"), the
   initials "HKQ23H", a contact name and email, the country "Canada" and
   the path `hkq23h`. Under "Languages" tick English, under "Primary
   locale" choose English (both are required while the site has two
   languages), and press "Save".
3. Administration › "Site Settings" › "Plugins". Untick "Default Theme"
   and press "OK" in the window "Are you sure you want to disable this
   plugin?". The notice reads "The plugin "Default Theme" has been
   disabled."
4. Open the address `/index.php/index/api/v1/site/theme`.
5. Back on "Site Settings" › "Plugins", tick "Default Theme" again
   ("The plugin "Default Theme" has been enabled.") and open the address
   of step 4 once more.

**Expected**: step 4 is refused with 404 and the message the journal's
read gives for a switched-off theme, "The active theme, …, is not
enabled and may not be installed.".

**Observed**: step 4 answers with a server error (status 500). The
server log has:

```
production.ERROR: Call to a member function getOptionValues() on null {"exception":"[object] (Error(code: 0): Call to a member function getOptionValues() on null at …/lib/pkp/api/v1/site/PKPSiteController.php:139)
```

Step 5 answers 200 with the site's theme settings and
`"themePluginPath":"default"`.

## Cause

`PKPSiteController::getTheme()` (`api/v1/site/PKPSiteController.php`,
line 133, pkp-lib) builds the 404 refusal when no enabled theme plugin
matches the site's `themePluginPath`, but without `return`:

```php
        if (!$activeTheme) {
            response()->json([
                'error' => __('api.themes.404.themeUnavailable'),
            ], Response::HTTP_NOT_FOUND);
        }

        $data = array_merge(
            $activeTheme->getOptionValues(Application::SITE_CONTEXT_ID),
```

The response is built and dropped, and the method goes on to call
`getOptionValues()` on the `null` theme. Its twin,
`PKPContextController::getTheme()`, returns the same response.

The `return` was lost when `pkp/pkp-lib#9176` (for `pkp/pkp-lib#7698`)
moved the API to the Laravel router: the Slim handler before it read
`return $response->withStatus(404)->withJsonError('api.themes.404.themeUnavailable');`.

Reach:

- A search of pkp-lib and the three apps for a `response()->json(…)`
  that is neither returned nor sent finds this one alone; the other
  bare calls end in `->send(); exit;`.
- The save (`PKPSiteController::editTheme()`, and the journal's twin)
  fails in the same state on a `null` theme of its own, at
  `$selectedTheme->validateOptions()`; that is a separate cause, not
  touched by this fix.
- Once the refusal is returned, its message shows the
  `{$themePluginPath}` placeholder unfilled, as the journal's read does
  (U10 [A23](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U10-appearance-and-theming.md#a23),
  reported apart with its own fix).

## Proposed fix

Return the refusal
([fix.diff](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/site-theme-api-server-error/fix.diff)):

```diff
 // api/v1/site/PKPSiteController.php, getTheme()
         if (!$activeTheme) {
-            response()->json([
+            return response()->json([
                 'error' => __('api.themes.404.themeUnavailable'),
             ], Response::HTTP_NOT_FOUND);
         }
```

`fix.diff` paths start at the app root (`a/lib/pkp/…`): apply it from
the app root, or with `-p3` in pkp-lib.

Tried on `main` in the three apps: step 4 then answered `404
{"error":"The active theme, {$themePluginPath}, is not enabled and may
not be installed."}` (the placeholder is A23's), with nothing in the
server log. With the fix in and out, the site's read and the journal's
read with the theme switched on still answered 200 with their settings.

**Alternatives**: none worth weighing; a `?->` on `$activeTheme` would
answer 200 with an empty theme, which hides the problem.

**What goes with it**:

- The same one word applies to 3.5 (line 130 there). 3.4 and 3.3 return
  the refusal and need nothing.
- A test: a read of the site's theme route with the site's theme plugin
  disabled, asserting a 404.
- The A23 fix changes the line just below, in the same block, so the
  two land together or one is rebased on the other.

Small: one missing `return` in one method.

## Evidence

- Kept script: [walk.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/site-theme-api-server-error/walk.js)
  with its [lib.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/site-theme-api-server-error/lib.js),
  run on an install reset to the default dataset:
  `PROBE_FEATURE=<feature> PROBE_AGENT=<id> node bin/probe.js all shared/playwright/checks/issues/site-theme-api-server-error/walk.js`
  (`MODE=neighbour` for the reads with the theme switched on;
  `PKP_E2E_LINE=stable-3_5_0` in front for 3.5).
- Walked 2026-10-23 on `main` (ojs `3cf9aa91a8`, omp `178e8b34b2`, ops
  `5091e916d9`, each with pkp-lib `1f415a07ca`) and `stable-3_5_0` (ojs
  `0b1ae35f04`, omp `a150eee76b`, ops `18506a5b4d`, pkp-lib
  `5b54f59ed7`), PKP's default dataset (pkp/datasets `300c68e`),
  PostgreSQL. Both branches showed the Observed 500 (the log line names
  `PKPSiteController.php:139` on `main`, `:136` on 3.5) and the 200 of
  step 5.
- Fix trial: `node bin/try-fix.js apply shared/playwright/checks/issues/site-theme-api-server-error/fix.diff ojs omp ops`,
  the walk, then `MODE=neighbour` with the fix in and after
  `node bin/try-fix.js revert …`.
- Older branches read at pkp's `stable-3_4_0` (ojs `3bedd21383`, omp
  `95fefd0cf0`, ops `47adbcd1e8`, pkp-lib `366030b017`) and
  `stable-3_3_0` (ojs `06f01c8010`, omp `fbe408e8eb`, ops `e265883ba4`,
  pkp-lib `126b86bc2e`); the three apps route `api/v1/contexts` and
  `api/v1/site` to the shared pkp-lib handlers on both.
- 3.4 and 3.3: `api/v1/site/PKPSiteHandler.php` (3.4) and
  `PKPSiteHandler.inc.php` (3.3) in pkp-lib return the 404; not walked.
- The Summary's other facts, walked 2026-10-23 on OJS, OMP and OPS
  `main` in the state of step 3: the site's Appearance › "Theme" offers
  an empty list, and its "Save" answered 500 (log:
  `PKPSiteController.php:224`, `validateOptions()` on null), the stored
  theme unchanged; the site's home page answered 200. That only the
  site's own theme matters is read in the code (`getTheme()` looks up
  the stored `themePluginPath` alone).
- Introduced: `git blame` on line 133 names `71e79e31e3`
  (PR `pkp/pkp-lib#9176` for `pkp/pkp-lib#7698`); its parent's
  `PKPSiteHandler.php` returned the refusal. The commit is on
  `stable-3_5_0`.
