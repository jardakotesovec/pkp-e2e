# On 3.5, closing the "Create New Galley" or "Select an issue" window with its header "Close" logs a script error

- **Severity** low
- **Effort** small
- **Kind** defect
- **Crash** script
- **Affects**
  - main: none
  - 3.5: OJS, OPS
  - 3.4: none (code; galleys in a legacy grid)
  - 3.3: none (code; galleys in a legacy grid)
- **Introduced** `pkp/ui-library#412` · [f77229c3bf](https://github.com/pkp/ui-library/commit/f77229c3bf383292c840fe98c77dba66cac6402b) · 2024-09-19 · Jarda Kotěšovec (jardakotesovec); the "Assign to Issue" read: `pkp/ui-library#418` for `pkp/pkp-lib#7495` · [619f90a9a3](https://github.com/pkp/ui-library/commit/619f90a9a38cf0e88aab74bd0b081ea4b7ed9f70) · 2024-10-03 · Jarda Kotěšovec (jardakotesovec)
- **Upstream** none found (2026-10-29); `main` lost the fault as a side effect of `pkp/ui-library#853`, which `stable-3_5_0` does not have
- **Tracked in** spec U46 [A9](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U46-galleys.md#a9)
- **Checked** 2026-10-29, each branch's tip (the commits in Evidence)
- **Model** claude-opus-5-5

## Summary

On 3.5, an editor who opens "Add galley" on a journal's or preprint
server's "Galleys" page and leaves the "Create New Galley" window by its
header "Close" gets an uncaught JavaScript error in the browser's
console, whether or not anything was typed. On a journal, the same
happens when the "Select an issue to schedule for publication" window is
left by its header "Close", opened from "Schedule For Publication" or
from "Assign to Issue".

The page keeps working and nothing is lost: the window closes, nothing
is saved, and the window opens again at once. "Create New Galley"'s own
"Cancel" closes it without the error.

## Impact

- **Lost**: nothing; the list behind the window shows what is stored.
- **Who**: every role offered "Add galley" or "Schedule For
  Publication" on 3.5, each time they back out of one of these windows
  by its header "Close".
- **Way round**: for "Create New Galley", the form's "Cancel". The
  "Select an issue" window has no "Cancel"; its only other way out is
  "Save".

Low: a console error that changes nothing the page shows or stores.

## Steps to reproduce

Preconditions:
- The default dataset, OJS or OPS `stable-3_5_0`.
- The browser's developer console open.

"Create New Galley" (OJS; OPS in brackets):
1. Sign in as `dbarnes`.
2. Open "Genetic transformation of forest trees" (submission 5)
   [OPS: "The influence of lactation on the quantity and quality of
   cashmere production" (submission 1)].
3. In the side menu, under "Publication" [OPS: "Preprint"], open
   "Galleys".
4. Press "Add galley". The "Create New Galley" window opens.
5. Press the window's header "Close" without typing anything.
6. Press "Add galley" again, type "h29g" in "Galley Label", press the
   header "Close", and answer "OK" to "The data on this form has changed.
   Do you wish to continue without saving?".

"Select an issue" (OJS only; submission 5 is not yet assigned to an
issue, so scheduling asks for one first):
7. Still on "Galleys", press "Schedule For Publication" in the header.
   The "Select an issue to schedule for publication" window opens.
8. Press the window's header "Close".
9. In the side menu, under "Publication", open "Issue" and press
   "Assign to Issue". The same window opens.
10. Press the window's header "Close".

**Expected:** each window closes, nothing is saved, and the console
stays empty, as on `main`.

**Observed:** each window closes and nothing is saved, but each header
"Close" writes one error to the console, and no request fails. After
steps 5 and 6:

```
Uncaught (in promise) TypeError: Cannot read properties of undefined (reading 'dataChanged')
    at …/js/build.js?v=3.5.0.5
    at Proxy.onClose (…/js/build.js?v=3.5.0.5)
```

After step 8:

```
Uncaught (in promise) TypeError: Cannot destructure property 'formId' of 'undefined' as it is undefined.
```

After step 10:

```
Uncaught (in promise) TypeError: Cannot read properties of undefined (reading 'data')
```

Control: after step 6, "Add galley", "h29g" in "Galley Label", then the
form's "Cancel" closes the window with no error.

## Cause

A side window opened from Vue reports how it was closed through its
`onClose` callback. In 3.5's ui-library, `modalStore.js`
`closeSideModalById()` sets `modalToClose.value.opened = false` (line
180), which closes the window, and then calls
`modalToClose.value.onClose(returnData)` (line 181) with whatever the
closer passed. `AjaxModalWrapper.vue` passes `{dataChanged: […]}` when
the legacy form ends the window (`formSubmitted`, `formCanceled`,
`ajaxHtmlError`, `modalFinished`, `wizardClose`, `wizardCancel`) and
`{formId, data}` when a Vue form in it succeeds. The header "Close", a
click outside the window and Escape go through `SideModal.vue`
`handleClose()` with no data, so `returnData` is `undefined`.

Three callbacks read it as an object and throw:

- `useGalleyManagerActions.js` `galleyAdd()`, line 29:
  `if (closeData.dataChanged[0])`, reached through
  `useLegacyGridUrl.js` `openLegacyModal()`, whose `onClose` passes its
  argument on. It throws before calling `finishedCallback()`, so the
  galley list is not fetched again.
- `useWorkflowActions.js` `workflowAssignToIssueAndScheduleForPublication()`,
  line 110: `onClose: async ({formId, data})`, registered directly with
  `openSideModal('LegacyAjax', …)`. It throws before calling
  `finishedCallback()`, so the workflow is not fetched again.
- `FieldSelectIssue.vue` `selectIssue()`, line 162:
  `if (finishedData.data.issueId)`, reached through
  `openLegacyModal()` and the workflow store's wrapper
  (`workflowStore.js` lines 139–143), which calls `triggerDataChange()`
  first. Here the workflow is fetched again, and only the field's value
  update is skipped.

In these closes nothing was saved, so the skipped fetches leave nothing
out of date, and nothing on the page later relies on them. Because each
callback runs in an `async` function, the error does not stop
`closeSideModalById()`, which goes on to clear the window and call the
legacy handler's `modalClose()`.

The other `onClose` and `openLegacyModal()` callbacks on 3.5 ignore their
argument (`useUserAccessManagerActions.js`, `dashboardPageStore.js`,
`useReviewerManagerActions.js` and the managers' stores), checked in the
code. OMP has no galleys and no issues; its publication formats are a
legacy grid. On `main`, `closeSideModalById()` hands `onClose`
`{dataChanged: false}` for an unchanged close since `pkp/ui-library#853`,
so `galleyAdd()` reads `false[0]` without throwing, and `main` no longer
has the `{formId, data}` and `finishedData.data` reads
(`FieldSelectIssue.vue` is gone).

## Proposed fix

A proposal for `stable-3_5_0`; `main` needs nothing. The fix is these
two lines on 3.5, not a backport of `pkp/ui-library#853`. The store
decides what `onClose` receives, so it should always hand an object: a
close that passes no data gets `{dataChanged: []}`, the array shape that
3.5's `AjaxModalWrapper.vue` already passes for a close without changes
(chosen on purpose; `main` passes `{dataChanged: false}`, a different
shape). A close that passes data gets it unchanged. The "Assign to
Issue" field then reads `data` with `?.`, since a close that ends with
no issue chosen has no `data` key.

```diff
--- a/lib/ui-library/src/components/Form/fields/FieldSelectIssue.vue
+++ b/lib/ui-library/src/components/Form/fields/FieldSelectIssue.vue
@@ -159,7 +159,7 @@
 			const workflowSotre = useWorkflowStore();
 
 			workflowSotre.workflowAssignToIssue({}, (finishedData) => {
-				if (finishedData.data.issueId) {
+				if (finishedData.data?.issueId) {
 					this.currentValue = finishedData.data.issueId;
 				}
 			});
--- a/lib/ui-library/src/stores/modalStore.js
+++ b/lib/ui-library/src/stores/modalStore.js
@@ -178,7 +178,9 @@
 		}
 		modalToClose.value.opened = false;
 		if (modalToClose.value.onClose) {
-			modalToClose.value.onClose(returnData);
+			// A header "Close", a click outside or a legacy close passes no data:
+			// hand onClose the {dataChanged: []} shape AjaxModalWrapper gives a close without changes
+			modalToClose.value.onClose(returnData ?? {dataChanged: []});
 		}
 		// To keep the side modal animation nice, it needs to keep the component&props around for bit longer
 		setTimeout(() => {
```

The [fix.diff](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/galley-window-close-script-error/fix.diff)
paths start at the app root; inside the ui-library repository apply it
with `patch -p3`.

Tried on 3.5, OJS and OPS: with the fix built in, Steps 5, 6, 8 and 10
closed their windows with an empty console. "Add galley" › "h29g" ›
"Save", the path that reads the new galley's id, still closed the window
and opened "Upload a File Ready for Publication" for the new galley,
which the list then showed, with and without the fix.

**Alternatives**
- Backport `pkp/ui-library#853`: it changes how 37 files reload their
  tables after a window closes, too much for a patch release when only
  the shape of the close data is at fault.
- Guard each callback (`closeData?.dataChanged?.[0]`,
  `async (closeData) => { if (closeData?.data?.issueId) …`): three files,
  and the store still hands the next caller `undefined`.

**What goes with it**
- A unit test on 3.5 (`src/stores/modalStore.test.js`, new there): a
  side window closed without data calls `onClose` with
  `{dataChanged: []}`, and one closed with data passes it unchanged.
- No stored data, REST API or plugin hook is touched.

Small: two lines in the 3.5 ui-library and a unit test.

## Evidence

- Kept script:
  [walk.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/galley-window-close-script-error/walk.js),
  run on an install freshly loaded with the default dataset. Its default
  mode takes Steps 1–6 and the Control; `MODE=issue` Steps 7–10 (OJS);
  `MODE=save` the "Save" check of the fix trial, which adds a galley.
- 2026-10-29, on PostgreSQL with pkp/datasets 2f0edb08 (2026-10-28): the
  Steps and the Control walked on `stable-3_5_0` (OJS, OPS; Steps 7–10
  OJS only) and Steps 1–6 and the Control on `main` (OJS, OPS), as
  `dbarnes`. The walk read the errors from the page's error event, which
  gives the message and stack without Chrome's "Uncaught (in promise)"
  prefix; the prefix is what Chrome prints for an error thrown in an
  `async` function, as all three callbacks are.
- Tips: `main` OJS 7705b2aeb8, OPS 815fbaad1b (lib/pkp df42984b46,
  lib/ui-library b44825b0); `stable-3_5_0` OJS 851416bc2d, OPS
  bd0ef09fd6 (lib/pkp a6ed3df00a, lib/ui-library a12b7523). The
  `3_5_0-5` tag's ui-library (ac2dabbc) has the same three reads and the
  same store line, so released 3.5 carries the fault.
- 3.4 and 3.3, read in the code: OJS and OPS `upstream/stable-3_4_0`
  (567c40df4f, 2e4bf7fd66) and `upstream/stable-3_3_0` (bb9835c6e0,
  9f42eb0a52) show galleys in `templates/workflow/workflow.tpl` as the
  legacy `representations-grid`; ui-library `origin/stable-3_4_0`
  (ee684b34) and `origin/stable-3_3_0` (96959f9e) have no
  `src/stores/modalStore.js` and no `GalleyManager`.
- Blame on 3.5's ui-library: `modalStore.js` line 181,
  `useGalleyManagerActions.js` line 29, `useWorkflowActions.js` line 110,
  `useLegacyGridUrl.js`'s `onClose` and `SideModal.vue`'s
  `handleClose(data)` come from f77229c3bf (`pkp/ui-library#412`,
  "Initial Workflow side modal implementation", which links no issue);
  `FieldSelectIssue.vue` line 162 from 619f90a9a3 (`pkp/ui-library#418`,
  "I7495 new workflow page").
- The "Select an issue" window has no "Cancel": its form
  (`AssignToIssueForm`) has one field and "Save", as the walk's screen
  showed.
- Not driven: a click outside the window and Escape, which reach the
  same `handleClose()` without data. The fix's code comment was reworded
  after the trial (no code change).
