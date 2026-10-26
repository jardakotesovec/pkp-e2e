# A REST API client reading the site's theme gets a server error while "Default Theme" is switched off on the site

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
- **Upstream** none found (2026-10-26)
- **Tracked in** spec U10 [A24](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U10-appearance-and-theming.md#a24)
- **Checked** 2026-10-26, each branch's tip (the commits in Evidence)
- **Model** claude-opus-5-5

Update 2026-10-26: the Summary is corrected on what the site's own
pages show while the theme is switched off, and the failing save of the
site's theme is now reported apart (see Cause).

## Summary

On an installation with more than one journal (press, server), the
Site Administrator unticks "Default Theme", the theme the site itself
uses, under Administration › "Site Settings" › "Plugins". A REST API
client that then reads the site's theme settings gets a server error
(500) instead of the 404 refusal "The active theme, …, is not enabled
and may not be installed.", which is what the same read for a journal
answers. Up to 3.4 the site's read answered with that refusal too.

Only switching off the theme the site uses triggers it: on PKP's
default installation that is "Default Theme"; switching off another
theme plugin does not. While it is off, the site's own pages, such as
its sign-in page, show without styling; that is the expected result of
switching the theme off, not part of this fault.

## Impact

- **Lost**: nothing is stored or lost. The client cannot tell a
  switched-off theme from a fault of the server.
- **Who**: a REST API client reading `GET index/api/v1/site/theme` with
  the Site Administrator's key, while the site's theme is switched off.
  No screen sends this read.
- **Way round**: tick "Default Theme" again under Administration ›
  "Site Settings" › "Plugins".

## Steps to reproduce

The read is opened in the browser, signed in, as a REST API client would send it.

Preconditions:

- PKP's default test dataset for `main`.
- A second journal (press, server), created in step 2: the site's own
  Plugins list shows only on a site with more than one.

1. Sign in as `admin`.
2. Administration › "Hosted Journals" ("Hosted Presses", "Hosted
   Servers") › "Create Journal" ("Create Press", "Create Server"). Fill
   in the name "hkq26c Second Journal" ("… Press", "… Server"), the
   initials "HKQ26C", a contact name and email, the country "Canada" and
   the path `hkq26c`. Under "Languages" tick English, under "Primary
   locale" choose English (both are required while the site has two
   languages). Leave "Enable this journal to appear publicly on the
   site" ("… press …", "… preprint server …") unticked, as it comes; the
   500 of step 4 shows either way. Press "Save".
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
- The save of the site's theme (`PKPSiteController::editTheme()`, and
  the journal's twin) fails in the same state with a server error of
  its own, on a `null` theme at `$selectedTheme->validateOptions()`;
  that is a separate cause, not touched by this fix, reported apart
  (U10
  [A26](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U10-appearance-and-theming.md#a26)).
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
- A test: a PHPUnit test in pkp-lib's `tests/`, or the apps' end-to-end
  tests, reading the route with the site's theme plugin disabled and
  asserting a 404.
- A23's fix (Cause, Reach) passes the theme's path to the same message
  (`__('api.themes.404.themeUnavailable', ['themePluginPath' => $site->getData('themePluginPath')])`),
  in the same block; the two land together or one is rebased on
  the other.

Small: one missing `return`, and its test.

## Evidence

- Kept script: [walk.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/site-theme-api-server-error/walk.js)
  with its [lib.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/site-theme-api-server-error/lib.js),
  run on an install reset to the default dataset:
  `PROBE_FEATURE=<feature> PROBE_AGENT=<id> node bin/probe.js all shared/playwright/checks/issues/site-theme-api-server-error/walk.js`
  (`MODE=neighbour` for the reads with the theme switched on;
  `PKP_E2E_LINE=stable-3_5_0` in front for 3.5).
- Walked 2026-10-26 on `main` (ojs `d054e2660d`, omp `38bf23300c`, ops
  `fbd57562f4`, each with pkp-lib `800863b5dc`, ui-library `1f9fb95e`)
  and `stable-3_5_0` (ojs `18b464cafd`, omp `dade65f368`, ops
  `bd726f9b7a`; pkp-lib `0f3c36bc2f` under OJS and OMP, `9a0212faff`
  under OPS; ui-library `a12b7523`), PKP's default dataset (pkp/datasets
  `d1d235a7`), PostgreSQL. Both branches showed the Observed 500 on the
  three apps (the log line names `PKPSiteController.php:139` on `main`,
  `:136` on 3.5) and the 200 of step 5.
- Fix trial on `main` (2026-10-23, at pkp-lib `1f415a07ca`; `api/v1/site/`
  is the same at `800863b5dc`):
  `node bin/try-fix.js apply shared/playwright/checks/issues/site-theme-api-server-error/fix.diff ojs omp ops`,
  the walk, then `MODE=neighbour` with the fix in and after
  `node bin/try-fix.js revert …`.
- Older branches read at pkp's `stable-3_4_0` (ojs `90c26f8f68`, omp
  `75173fe02a`, ops `bd4a52372e`, pkp-lib `83e78a85e5`) and
  `stable-3_3_0` (ojs `3ef62492a4`, omp `e48518ad43`, ops `1d05d28fc4`,
  pkp-lib `93722c9179`); the three apps route `api/v1/contexts` and
  `api/v1/site` to the shared pkp-lib handlers on both.
- 3.4 and 3.3: `api/v1/site/PKPSiteHandler.php` (3.4, line 135) and
  `PKPSiteHandler.inc.php` (3.3, line 114) in pkp-lib return the 404;
  not walked.
- The Summary's other facts. Walked 2026-10-26 by the kept script on
  both branches and the three apps, in the state of step 3, signed out
  in a second browser: the site's sign-in page
  (`/index.php/index/en/login`) loaded with no style sheet, in "Times
  New Roman"; the site's address (`/index.php/index`) went to the
  dataset's journal, the only one shown publicly, styled by its own
  theme (`PKPHandler::getTargetContext()` sends it to the one enabled
  journal). That only the site's own theme triggers the 500 is read in
  the code: `getTheme()` looks up the stored `themePluginPath` alone.
- Introduced: `git blame` on line 133 names `71e79e31e3`
  (PR `pkp/pkp-lib#9176` for `pkp/pkp-lib#7698`); its parent's
  `PKPSiteHandler.php` returned the refusal.
- Upstream, searched 2026-10-26 in pkp/pkp-lib and pkp/ojs by the
  symptom and by `getOptionValues`, `themeUnavailable` and
  `PKPSiteController`: `pkp/pkp-lib#13549` (a journal's home page blank
  with its theme switched off) and `pkp/pkp-lib#10714` (saving a theme
  option at site level) are other faults. `pkp/pkp-lib#13549`'s fix
  made an unstyled page the intended result of a switched-off theme
  (its QA note: "The unstyled journal page now appearing when the
  default theme is set but the plugin was disabled"), the basis of the
  Summary's "expected".
