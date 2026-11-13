# "OK" in "Export All Users" downloads the users file but leaves the "Confirm" window open over the list

- **Severity** low
- **Effort** small
- **Kind** defect
- **Affects**
  - main: OJS, OMP (OPS has no Users XML Plugin)
  - 3.5: OJS, OMP
  - 3.4: OJS, OMP (code)
  - 3.3: OJS, OMP (code)
- **Introduced** no PR (pkp bug 8463) · [34a7dc94a1](https://github.com/pkp/pkp-lib/commit/34a7dc94a11146fc46473cb26fda369aea151a1d) · 2013-12-18 · Jason Nugent (jnugent)
- **Upstream** `pkp/pkp-lib#5387`, reported on OJS 3.1.2-4 and closed without a fix on 2026-04-15 as not reproducible on OJS 3.5. A walk today on a 3.5 install loaded from the default dataset shows it.
- **Tracked in** U63 [A27](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U63-import-export.md#a27)
- **Checked** 2026-11-13, each branch's tip (the commits in Evidence)
- **Model** claude-opus-5-5

## Summary

A manager presses "Export All Users" on the Users XML Plugin's "Export
Users" tab and answers "OK" in the "Confirm" window that asks "Are you
sure you wish to export all users?". The file downloads, and the window
should close. Instead it stays open over the list, still asking the
question.

The manager's next press on the list only closes the window, and the
press after it does what was meant. Escape closes the window too. On
3.5 the window's "OK" and "Cancel" are greyed out after "OK", but the
same press or Escape still closes it.

## Impact

- **Lost**: nothing. The file downloads whole, and the window keeps
  asking whether to export after the export is done.
- **Who**: every journal or press manager who uses "Export All Users",
  every time.
- **Way round**: a press outside the window, or Escape, closes it; on
  main its "Cancel" does too.

Low: the export is done, and the window goes at the next press or
Escape. A window that a press outside and Escape could not close would
raise it.

## Steps to reproduce

Preconditions:

- PKP's default test dataset, OJS or OMP `main`.

Steps:

1. Sign in as `rvaca` (Journal manager in OJS, Press manager in OMP).
2. Open "Tools" (`/index.php/publicknowledge/management/tools`) and, on
   "Import/Export", press "Users XML Plugin".
3. Press the "Export Users" tab. The "Current Users" list loads.
4. Press "Export All Users" in the list's header. A window titled
   "Confirm" asks "Are you sure you wish to export all users?", with
   "OK" and "Cancel".
5. Press "OK" and wait for the download.
6. Press the tick box of the row "dbarnes".
7. Press the same box again.

**Expected**: at step 5 the file `users-<date>-users-1.xml` downloads
and the "Confirm" window closes; step 6 ticks the box.

**Observed**: the file downloads and the page stays where it is, but
five seconds later the window is still open over the list:

```
Confirm
Are you sure you wish to export all users?
OK  Cancel
```

At step 6 the window closes and the box stays unticked; step 7 ticks
it. Escape instead of step 6 closes the window the same way, and so
does "Cancel" on main; no second file downloads. On 3.5 "OK" and
"Cancel" are greyed out after step 5, and steps 6 and 7 and Escape go
as on main.

## Cause

`RedirectConfirmationModalHandler::modalConfirm()` (lib/pkp
`js/controllers/modal/RedirectConfirmationModalHandler.js`, line 94)
only sets `document.location = this.remoteUrl_` and never calls
`this.modalClose()`. It overrides `ConfirmationModalHandler::modalConfirm()`,
whose first act is `this.modalClose(dialogElement)`, and every other
confirmation handler closes its window too
(`ButtonConfirmationModalHandler`, `JsEventConfirmationModalHandler`,
and `RemoteActionConfirmationModalHandler` once its request answers).
Skipping the close is harmless only when the address replaces the page.

`ExportableUsersGridHandler::initialize()` (lib/pkp
`controllers/grid/users/exportableUsers/`) puts "Export All Users"
behind this handler with the address
`management/importexport/plugin/UserImportExportPlugin/exportAllUsers`.
`PKPUserImportExportPlugin::display()` answers that address with
`FileManager::downloadByPath()`, an attachment, so the browser keeps
the page and the window the handler opened stays.

Since `pkp/pkp-lib#9870` ([047c7598f1](https://github.com/pkp/pkp-lib/commit/047c7598f1f2e83c93687566bc9bc2fd5b374f02),
2024-04-10, first released in 3.5), `ConfirmationModalHandler::modalOpen()`
emits `open-dialog-vue` and the window is the ui-library `Dialog`. It
closes on `close-dialog-vue`, on its own buttons, and on Escape or a
press outside it (reka-ui's `update:open` → `onClose('default')`,
allowed because `isDismissible` defaults to true and the handler never
sets it). On 3.5, `Dialog.vue`'s `fireCallback()` also sets
`isLoading`, which disables both buttons after "OK"; on main
`DialogBody.vue` shows a spinner instead and leaves them enabled.

Reach:

- "Export All Users" on the Users XML Plugin, OJS and OMP: walked on
  main and 3.5.
- 3.4 and 3.3 have the same handler, line for line, and the same
  "Export All Users" action, but the older built-in window
  (`ConfirmationModalHandler::modalBuild()`): it stays open the same
  way, with its buttons left enabled, and its "Cancel", Escape and a
  press on the backdrop close it (`ModalHandler::handleWrapperEvents()`)
  (code).
- "Login As" in `UserGridRow` (Administration › Hosted Journals ›
  "Settings wizard" › "Users"), `StageParticipantGridRow` and
  `ReviewerGridRow` use the same handler. Their address signs in as the
  user and redirects, so the page is replaced and the window goes with
  it (code; `UserGridRow`'s also walked, below).
- No plugin in the three apps uses `RedirectConfirmationModal` (code).

## Proposed fix

Close the dialog in the redirect handler, as the sibling handlers do
([fix.diff](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/export-all-users-confirm-stays-open/fix.diff)):

```diff
 			modalConfirm = function(dialogElement, event) {
 
 		document.location = this.remoteUrl_;
+		// The address may answer with a download, which leaves the page in
+		// place: close the dialog as the other confirmation handlers do.
+		this.modalClose(dialogElement);
 	};
```

This covers every redirect confirmation, including any later one that
points at a download. `modalClose()` emits `close-dialog-vue` at once,
so the window goes straight away, and closing it cannot cancel a
navigation `document.location` has already started. Tried on main: with
the fix in, the window is gone after "OK" in OJS and OMP and the file
still downloads; "Login As" in the Settings wizard still lands the
administrator signed in as the chosen user in all three apps, with the
fix in and out.

**Alternatives**:

- Change "Export All Users" to a plain link or a `ButtonConfirmationModal`
  over a hidden form: fixes this button only and leaves the handler's
  trap for the next download put behind it.
- Have the ui-library `Dialog` close itself after any action callback:
  would close windows whose handler keeps them open on purpose (a
  remote action that shows the server's error in place).
- Remove `RedirectConfirmationModalHandler`, as `pkp/pkp-lib#603` once
  suggested: a larger change for the same result.

**What goes with it**: the same line on `stable-3_5_0`, where it also
ends the greyed-out buttons, and on 3.4 and 3.3 if backported (the file
is identical there); `js/pkp.min.js`, which each app repo (OJS, OMP,
OPS) tracks, rebuilt for installs with `enable_minified` on; and a
Cypress or Playwright check that the "Confirm" window is gone after
"OK" in "Export All Users".

Small: one line in one shared handler, and a test.

## Evidence

- Kept script:
  `shared/playwright/checks/issues/export-all-users-confirm-stays-open/walk.js`,
  on a fresh load of the default dataset (PostgreSQL, PHP 8.3):
  `PROBE_FEATURE=<feature> PROBE_AGENT=<agent> [MODE=dismiss|nb] node bin/probe.js ojs|omp|all shared/playwright/checks/issues/export-all-users-confirm-stays-open/walk.js`
  (`PKP_E2E_LINE=stable-3_5_0` in front for 3.5). The default mode
  takes steps 1–5 and closes the window with "Cancel", on OJS and OMP;
  its step 6 uses Playwright's `check()`, which refuses a covered box
  without pressing. `MODE=dismiss` takes steps 6–7 with a real mouse
  press at the box, and Escape, on OJS, main and 3.5. `MODE=nb` is the
  "Login As" neighbour check. The fix was tried with
  `node bin/try-fix.js apply … fix.diff ojs omp ops`; the test installs
  run with `enable_minified` off, so no build was needed.
- Tips: main OJS 3c99722dc8, OMP 61df357b9, OPS c74e5bf190, pkp-lib
  ad75b174f0, ui-library 51f9eaa1 (OJS) / 55ec62ee (OMP, OPS);
  stable-3_5_0 OJS 7cf6c9c60f, OMP 3f0fd0a7d, pkp-lib 5af8e67ab4,
  ui-library fd00e45f; stable-3_4_0 OJS 61835656a2, OMP 98db039f2,
  pkp-lib 2dd24cc5ae; stable-3_3_0 OJS b83fb9e44d, OMP 31f5c517e,
  pkp-lib df738d3a66.
- Datasets: pkp/datasets d141ec4b (2026-11-12), `main` and
  `stable-3_5_0` pgsql dumps.
- Code reads, 3.4 and 3.3 (`git show origin/stable-3_4_0:` and
  `origin/stable-3_3_0:` in lib/pkp, `upstream/` in the apps): the
  handler, `ConfirmationModalHandler.js`, `ModalHandler.js`,
  `ExportableUsersGridHandler(.inc).php` and the plugin's
  `exportAllUsers` case; OPS has no `plugins/importexport/users` on any
  of the four branches.
- Introduced: `git blame` on the handler's line gives 635dd43b8a
  (2012-08-03, Jason Nugent, "Introduce redirection confirmation modal
  and handler"), right for a redirect that replaces the page; 34a7dc94a1
  (2013-12-18, "introduce exportable users grid") first put a download
  behind it.
- Upstream searches (2026-11-13), pkp/pkp-lib, pkp/ojs, pkp/omp,
  pkp/ui-library: "export all users", "export users modal open",
  `RedirectConfirmationModal`, `RedirectConfirmationModalHandler`,
  "users xml plugin export confirm dialog", "confirmation dialog
  download stays open". `pkp/pkp-lib#603` (2015) lists an older "Export
  all users doesn't work" item, fixed then.
- Unverified: steps 6–7 and Escape on OMP (walked on OJS; OMP runs the
  same lib/pkp and ui-library code).
