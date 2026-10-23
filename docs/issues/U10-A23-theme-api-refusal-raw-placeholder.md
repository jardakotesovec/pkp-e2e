# A program reading a journal's, press's or server's switched-off theme gets "{$themePluginPath}" for its name

- **Severity** low
- **Effort** small
- **Kind** defect
- **Affects**
  - main: OJS, OMP, OPS
  - 3.5: OJS, OMP, OPS
  - 3.4: OJS, OMP, OPS (code)
  - 3.3: OJS, OMP, OPS (code)
- **Introduced** `pkp/pkp-lib#3931` for `pkp/pkp-lib#3594` · [5f3be929e6](https://github.com/pkp/pkp-lib/commit/5f3be929e69f428774dfd0237f666c356859e2b3) · 2018-10-23 · Nate Wright (NateWr)
- **Upstream** none found (2026-10-23)
- **Tracked in** spec U10 [A23](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U10-appearance-and-theming.md#a23)
- **Checked** 2026-10-23, each branch's tip (the commits in Evidence)
- **Model** claude-opus-5-5

## Summary

A journal, press or preprint server can keep a theme as its own while
that theme plugin is switched off (unticked under Settings › Website ›
"Plugins") or deleted from the installation. A program that then reads
the context's theme settings through the REST API is refused, as it
should be, with "The active theme, {$themePluginPath},
is not enabled and may not be installed.". The message is meant to name
the theme; the theme's name is never passed to it, so the placeholder
shows instead.

Saving the theme settings never gives this message: the save is a
different request, which in this state fails in its own way (a separate
fault, not covered here).

## Impact

- **Lost**: nothing. The program is refused, but not told which theme
  is missing.
- **Who**: a program reading `GET …/api/v1/contexts/{id}/theme` with
  the key of a Journal Manager (Press Manager, Preprint Server Manager)
  or the Site Administrator. No screen sends this read.
- **Way round**: the context's record (`GET …/api/v1/contexts/{id}`)
  names the theme in `themePluginPath`.

## Steps to reproduce

The read is opened in the browser, signed in, as a program would send it.

Preconditions:

- PKP's default test dataset for `main`, context `publicknowledge`
  (ID 1). The journal (press, server) uses "Default Theme".

1. Sign in as `rvaca` (Journal Manager; Press Manager, Preprint Server
   Manager) on the context's login page.
2. Open the address `/index.php/publicknowledge/api/v1/contexts/1/theme`.
   It answers 200 with the theme's fields and `"themePluginPath":"default"`.
3. Settings › Website › "Plugins". Untick "Default Theme" and press "OK"
   in the window "Are you sure you want to disable this plugin?". The
   notice reads "The plugin "Default Theme" has been disabled."
4. Open the address of step 2 again.
5. Sign out, sign in as `admin` and open the same address.

**Expected**: steps 4 and 5 are refused with a message that names the
theme:

```
404 {"error":"The active theme, default, is not enabled and may not be installed."}
```

**Observed**: steps 4 and 5 answer:

```
404 {"error":"The active theme, {$themePluginPath}, is not enabled and may not be installed."}
```

## Cause

`PKPContextController::getTheme()` (`api/v1/contexts/PKPContextController.php`,
line 311, pkp-lib) looks the context's `themePluginPath` up among the
enabled theme plugins and, finding none, answers 404 with
`__('api.themes.404.themeUnavailable')`. The English text of that key,
"The active theme, {$themePluginPath}, is not enabled and may not be
installed.", takes a `themePluginPath` parameter, and the call passes
none, so the translator leaves the placeholder in place. Every language
that translates the key carries the same placeholder.

The parameter has been missing since the read was added
(`pkp/pkp-lib#3931` for `pkp/pkp-lib#3594`). The call was then
`withJsonError('api.themes.404.themeUnavailable')`, which builds its
`errorMessage` from the key with no parameters either. The move to the
Laravel router (`pkp/pkp-lib#9176` for `pkp/pkp-lib#7698`) carried the
same call over.

Reach:

- `PKPSiteController::getTheme()` (`api/v1/site/PKPSiteController.php`,
  line 134) builds the same refusal for the site's theme without the
  parameter. On `main` and 3.5 that refusal never reaches the program,
  because the method goes on past it and fails with a server error (U10
  [A24](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U10-appearance-and-theming.md#a24),
  reported apart); once that is fixed, it shows the same placeholder.
  On 3.4 and 3.3 `PKPSiteHandler::getTheme()` returns its refusal, so
  the site's read already answers there with the placeholder in
  `errorMessage` (read in the code, not walked).
- A search of every `api.po` key with a placeholder against its callers
  finds one other call without its parameter:
  `api.400.tokenCouldNotBeDecoded` ("… because of the following error:
  {$error}") in `DecodeApiTokenWithValidation`. 3.4 filled it with the
  decoding exception's message; the Laravel router change dropped that.
  Whether an API key's decoding error should be shown to the client is a
  separate decision, so the fix below leaves this call out.

## Proposed fix

Pass the stored theme name to the message in both themes read
handlers
([fix.diff](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/theme-api-refusal-raw-placeholder/fix.diff)):

```diff
 // api/v1/contexts/PKPContextController.php, getTheme()
-                'error' => __('api.themes.404.themeUnavailable'),
+                'error' => __('api.themes.404.themeUnavailable', ['themePluginPath' => $context->getData('themePluginPath')]),
 // api/v1/site/PKPSiteController.php, getTheme()
-                'error' => __('api.themes.404.themeUnavailable'),
+                'error' => __('api.themes.404.themeUnavailable', ['themePluginPath' => $site->getData('themePluginPath')]),
```

The placeholder stands for the context's stored `themePluginPath`
setting, so the fix passes that value, as other API refusals pass
theirs (`api.files.400.fileSize` with `maxSize` in
`PKPTemporaryFilesController`). The theme's display name is not
available, since no enabled plugin answers to that path.

Tried on `main` in the three apps: steps 4 and 5 then answered
`404 {"error":"The active theme, default, is not enabled and may not be
installed."}`. With the fix in and out, the same read with the theme
switched on still answered 200 with the theme's settings for `rvaca`
and `admin`. The site half was not walked: on `main` it shows only once
A24 is fixed.

**Alternatives**:

- Reword the message without a placeholder. It would drop the one fact
  that helps whoever reads it, and touch every translation.

**What goes with it**:

- The same two lines apply to 3.5. On 3.4 and 3.3, where both the
  journal's and the site's read show the placeholder today,
  `PKPContextHandler::getTheme()` and `PKPSiteHandler::getTheme()` call
  `withJsonError('api.themes.404.themeUnavailable')`, which takes the
  parameters as its second argument.
- A test: a read of the theme route with the theme plugin disabled,
  asserting that the message names the stored theme.
- The A24 fix touches the line just above the site half of this diff,
  so the two land together or one is rebased on the other.
- `fix.diff` paths start at the app root (`a/lib/pkp/…`): apply it from
  the app root, or with `-p3` in pkp-lib.

Small: one argument in each of two handlers, no data or contract change.

## Evidence

- Kept script: [walk.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/theme-api-refusal-raw-placeholder/walk.js),
  run on an install reset to the default dataset:
  `PROBE_FEATURE=<feature> PROBE_AGENT=<id> node bin/probe.js all shared/playwright/checks/issues/theme-api-refusal-raw-placeholder/walk.js`
  (`MODE=neighbour` for the read with the theme switched on;
  `PKP_E2E_LINE=stable-3_5_0` in front for 3.5). It takes the Steps on
  OJS, OMP and OPS.
- Walked 2026-10-23 on `main` (ojs `3cf9aa91a8`, omp `178e8b34b2`, ops
  `5091e916d9`, each with pkp-lib `1f415a07ca`) and `stable-3_5_0` (ojs
  `0b1ae35f04`, omp `a150eee76b`, ops `18506a5b4d`, pkp-lib
  `5b54f59ed7`), PKP's default dataset (pkp/datasets `300c68e`),
  PostgreSQL. Both branches showed the Observed answer for both users;
  the server log stayed empty.
- Fix trial: `node bin/try-fix.js apply shared/playwright/checks/issues/theme-api-refusal-raw-placeholder/fix.diff ojs omp ops`,
  the walk, then `MODE=neighbour` with the fix in and after
  `node bin/try-fix.js revert …`.
- Older branches read at pkp's `stable-3_4_0` (ojs `3bedd21383`, omp
  `95fefd0cf0`, ops `47adbcd1e8`, pkp-lib `366030b017`) and
  `stable-3_3_0` (ojs `06f01c8010`, omp `fbe408e8eb`, ops `e265883ba4`,
  pkp-lib `126b86bc2e`); the three apps route `api/v1/contexts` and
  `api/v1/site` to the shared pkp-lib handlers on both.
- 3.4 and 3.3, read in pkp-lib's `api/v1/contexts/PKPContextHandler(.inc).php`,
  `api/v1/site/PKPSiteHandler(.inc).php` and
  `classes/core/APIResponse(.inc).php`: both handlers return
  `withJsonError()` without parameters, so by the code both answer
  `{"error":"api.themes.404.themeUnavailable","errorMessage":"The active theme, {$themePluginPath}, …"}`;
  not walked.
- The save in the Summary: Appearance › "Theme" › "Save" with the theme
  plugin switched off answered 500 on the journal's and the site's
  form, OJS, OMP and OPS `main` (walked 2026-10-23, outside the Steps);
  its cause is in `editTheme()`, not here.
- Introduced: the key and the call arrive together in `5f3be929e6`
  (PR `pkp/pkp-lib#3931`, merged 2019-01-09); the site's copy in
  `c4985f94ae` (for `pkp/pkp-lib#4762`); `71e79e31e3` (PR
  `pkp/pkp-lib#9176` for `pkp/pkp-lib#7698`) rewrote both without
  changing the call.
- Upstream searches covered pkp/pkp-lib, pkp/ojs, pkp/omp, pkp/ops and
  pkp/ui-library (`themeUnavailable`, `themePluginPath`, "active theme"
  not enabled, "may not be installed", `getTheme`); `pkp/pkp-lib#13549`
  (a journal's home page with its theme switched off, closed) is a
  different fault.
