# A click beside the "Add a Component" window, or Escape, closes it without asking while the cursor is still in "Name"

- **Severity** low
- **Effort** small
- **Kind** regression
- **Affects**
  - main: OJS, OMP, OPS
  - 3.5: OJS, OMP, OPS
  - 3.4: OJS, OMP, OPS (code; Escape only)
  - 3.3: OJS, OMP, OPS (code; Escape only)
- **Introduced** for the click beside the window: `pkp/ui-library#668` (3.5) and `pkp/ui-library#671` (main) for `pkp/pkp-lib#11258` · [c5f8466652](https://github.com/pkp/ui-library/commit/c5f8466652b3de58c8310ae5ddf6073b2cd5c385) (2025-07-17) and [39ebe864f9](https://github.com/pkp/ui-library/commit/39ebe864f98f11b81e9baddfc50cd11032eed723) (2025-07-22) · Jarda Kotěšovec (jardakotesovec). For Escape: not traced; present since at least [3cdf1f20b7](https://github.com/pkp/pkp-lib/commit/3cdf1f20b7e2fe8ee4a48ce1b9ec5eb9b537d425) (2015-08-05)
- **Upstream** `pkp/pkp-lib#10217` (open), a design issue asking that a click outside a window or Escape close it only when nothing was edited and ask otherwise; it does not name this fault
- **Tracked in** spec U58 [A15](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U58-submission-intake-configuration.md#a15)
- **Checked** 2026-10-21, each branch's tip (the commits in Evidence)
- **Model** claude-opus-5-5

## Summary

A manager types a name in the "Add a Component" window (Settings ›
Workflow › "Submission" › "Components") and, with the cursor still in
"Name", clicks the dimmed page beside the window or presses Escape. The
window closes at once, without the question its "Close" asks ("The data
on this form has changed. Do you wish to continue without saving?").
The typed name is lost, and the list has no new row. The next reload of
the page then raises the browser's leave-page question, though no
window is open and nothing is left to lose.

Before 3.5.0-2 the click beside the window asked, as "Close" does.
Escape with the cursor in the box has closed such windows without
asking on every version.

The same happens in every window drawn by the server's older forms,
whenever the box being typed in is the only change: among them "Create
New Role" and a role's "Edit" on Users & Roles › "Roles", "Edit User"
and "Disable" on "Users", a component's "Edit", the file windows of
Settings › Workflow › "Library", and the review forms and their items
(journals and presses).

## Impact

- **Lost:** what was typed into the box that holds the cursor, for
  good. The window closes, but nothing says the entry was not saved.
- **Who:** managers in the windows above, on any journal, press or
  server.
- **Way round:** press "Save" first, or Tab out of the box before
  closing.

Low: the boxes these windows hold are names, keys and short
descriptions, typed again in seconds. The two plain text areas among
them (a user's "Disable" reason and a Library file's description) take
a sentence or two; the long texts (emails, reviews) are rich-text
editors, which this fault does not reach.

## Steps to reproduce

Preconditions:

- PKP's default test dataset, OJS `main` (OMP and OPS the same; the
  list is headed "Monograph Components" or "Preprint Components").

Clicking beside the window:

1. Sign in as `rvaca`.
2. Open Settings › Workflow, tab "Submission", side tab "Components"
   (`/index.php/publicknowledge/en/management/settings/workflow`). The
   list "Article Components" shows 12 rows (OMP 15, OPS 12).
3. Press "Add a Component".
4. Click in "Name" and type "h21v component". Leave the cursor in the
   box.
5. Click the dimmed page to the left of the window.
6. Reload the page. If the browser asks whether to leave, choose
   "Reload".

Pressing Escape:

7. Press "Add a Component", click in "Name", type "h21v escape" and
   leave the cursor in the box.
8. Press Escape.
9. Reload the page, choosing "Reload" if the browser asks.

**Expected:** steps 5 and 8 ask, as the window's "Close" does:

```
The data on this form has changed. Do you wish to continue without saving?
```

The question's "Cancel" keeps the window open with the typed name;
its "OK" closes it. Steps 6 and 9 reload the page without a question.

**Observed:** steps 5 and 8 close the window at once, with no question.
The list still has 12 rows and no "h21v component" or "h21v escape".
Steps 6 and 9 each raise the browser's leave-page question, though no
window is open.

Control: with "h21v close" typed in "Name" the same way, the window's
"Close" asks the question, the question's "Cancel" keeps the window and
the name, and
the reload after "OK" asks nothing.

## Cause

`$.pkp.controllers.form.FormHandler` (lib/pkp
`js/controllers/form/FormHandler.js`) learns that its form changed only
from the DOM `change` event of a field
(`$(':input', $form).change(this.callbackWrapper(this.formChange))`),
which a text box sends when it loses the focus. `formChange()` then sets
`formChangesTracked` and sends `formChanged`, on which
`SiteHandler.registerUnsavedFormElement_()` puts the form on the page's
list for the leave-page question. When the window closes,
`containerCloseHandler()` asks only if `formChangesTracked` is set. It
does not take the focus out of a field first, so an edit in the box
that still holds the cursor is not yet known to it.

On `main` and 3.5 the legacy form is drawn in ui-library's side window:
`AjaxModalWrapper.vue` registers a close callback that sends
`containerClose` to the form, and `SideModal.vue`'s `handleClose()`
runs it. `pkp/ui-library#668` and `pkp/ui-library#671` moved that window from
Headless UI's `Dialog` to reka-ui's `DialogRoot` and `DialogContent`.
Headless UI closed on the outside `click`, which comes after the
`mousedown` that moves the focus, so the box had sent its `change` and
the form asked. reka-ui's `DismissableLayer` dismisses on the outside
`pointerdown` (on a mouse; on touch it waits for the `click`), which
comes before the focus moves. So `containerCloseHandler()` runs with
the flag still unset and permits the close.

The box loses the focus a moment later, while the window is fading
out. Its `change` reaches `formChange()`, which registers the form for
the leave-page question; the form is gone, so nothing clears it, and
the next reload asks. That stray question is part of this fault, and
the same fix removes it. Escape never moves the focus, on any version
(`keydown` in reka-ui and Headless UI, `keyup` in 3.4's jQuery modal),
so it closes the window silently in the same way.

Reach:

- Every legacy form in a side window, since `containerCloseHandler()`
  is shared and `CancelActionAjaxFormHandler`, its one override, calls
  it: "Create New Role" on Users & Roles › "Roles" closed at the same
  click without a question (walked on `main`, three apps).
- 3.4 and 3.3: the jQuery `ModalHandler.handleWrapperEvents()` closes on
  the backdrop's `click`, after the focus moved, so the click beside
  asks there; it closes on Escape's `keyup` with the box still focused,
  so Escape closes unasked (in the code).
- A reload with the window open and the cursor still in "Name" gives
  no leave-page question either: `SiteHandler.pageUnloadHandler_()`
  reads the list of changed forms, which the box has not joined yet
  (walked on `main`, three apps).
- Rich-text boxes (TinyMCE) never send `change`; that is another cause,
  tracked as spec U09
  [A19](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U09-custom-pages-and-blocks.md#a19).

## Proposed fix

Take the focus out of the form's focused field at the start of
`containerCloseHandler()`, so that its `change` runs `formChange()`
before the flag is read, and give it back when the question is answered
"Cancel" and the window stays
([fix.diff](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/component-window-outside-press-loses-name/fix.diff)):

```diff
-		var $form = $(this.getHtmlElement());
+		var $form = $(this.getHtmlElement()),
+				activeElement = document.activeElement,
+				focusTaken = false;
 		// prevent orphaned date pickers that may be still open.
 		$form.find('.hasDatepicker').datepicker('hide');
+		// A field that still holds the focus has not sent its change event
+		// yet: a press beside the modal or Escape closes it before the field
+		// loses the focus. Take the focus out first, so that formChange()
+		// sees the edit and the question below is asked.
+		if (activeElement && $.contains($form[0], activeElement)) {
+			activeElement.blur();
+			focusTaken = true;
+		}
 		if (this.formChangesTracked) {
 			if (!confirm(pkp.localeKeys['form.dataHasChanged'])) {
+				// The modal stays open: give the focus back to the field, once
+				// the press that asked has moved it (a press beside the modal
+				// takes it to the page).
+				if (focusTaken) {
+					setTimeout(function() {
+						activeElement.focus();
+					}, 0);
+				}
```

The rule "ask before a changed form is closed" lives in
`containerCloseHandler()`, so the fix goes there: every legacy form and
every container that sends `containerClose` (the side window on `main`
and 3.5, the jQuery modal on 3.4) is covered at once. A native `blur()`
sends a changed box's `change` synchronously, so the question comes
before the close is decided; when "OK" is chosen, the existing
`unregisterAllForms` clears the leave-page entry, which also ends the
stray question at the next reload. The same "flush before deciding"
step already exists for the rich-text boxes, `pushTinyMCEChanges_()`
before a submit.

The focus. Without the lines that give it back, the question's
"Cancel" leaves the window open with the focus on the page body: the field was blurred,
and a click beside the window then moves the focus to the page with its
own `mousedown`, as it does today when the box was left with Tab. Those
lines put it back on the field that held it. It waits a turn
(`setTimeout`), because the click's `mousedown` comes after the handler
returns; a plain `focus()` worked for Escape but not for the click.

Validation. `blur()` runs the form's check on leaving a field
(`onfocusout: onFocusOutValidation_`), exactly as Tab or a press on
"Close" does today. A valid entry shows nothing. A required box left
empty shows "This field is required." under it while the question is
open: a component's "Edit" with "Name" cleared did so.

The fix was tried on OJS, OMP and OPS `main`:

- Steps 5 and 8 asked the question. The question's "Cancel" kept the
  window open with the typed name and the cursor back in "Name"; the
  question's "OK" closed it. Steps 6 and 9 then reloaded without a
  question.
- "Create New Role" asked at the click as well (tried with the blur
  alone; the later lines touch only the question's "Cancel").
- A component's "Edit" with "Name" cleared asked, and showed "This
  field is required." under "Name". Without the fix it closed
  unasked, and the reload after raised the leave-page question.
- With the fix in and out alike: an untouched window closed at the
  click without a question; a "Name" left with Tab asked at the click;
  the form's own "Cancel" button closed the window without a question,
  and the reload after asked nothing.

**Alternatives:**

- Close on the outside `click` in `SideModalBody.vue` (prevent the
  `pointer-down-outside` dismissal and dismiss on `click`): it restores
  3.4's behaviour for the click only, leaves Escape silent, and works
  against reka-ui's own dismissal.
- Compare the form's serialized values with a snapshot taken when it
  loaded: catches every change without events, but a larger change to a
  form framework that is being replaced.

**Left out:** the reload with the cursor still in the box (Reach). The
same `blur()` at the start of `SiteHandler.pageUnloadHandler_()` would
cover it; not tried, since it moves the focus also when the person then
stays on the page.

**What goes with it:** no data repair, and no API or plugin hook
changes. The fix applies as written to 3.5, whose `FormHandler.js` is
the same, and to 3.4. The Escape half on 3.4 and 3.3 needs no second
change: the jQuery modal sends the same `containerClose` to the same
handler. On 3.3 the hunk needs its context adjusted by hand (the
"Cancel" branch there sets `closePermitted` without the
`informationObject` check). A test: an e2e check that types into
"Name", then clicks beside the window and presses Escape.

## Evidence

- Kept script:
  [walk.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/component-window-outside-press-loses-name/walk.js),
  run on installs freshly loaded from PKP's default test dataset
  (pkp/datasets 5f247d04, 2026-10-20), PostgreSQL:
  `node bin/probe.js all shared/playwright/checks/issues/component-window-outside-press-loses-name/walk.js [neighbour|reach]`.
  The default mode takes Steps 1–9 and the control; it types with key
  presses after a click in the box, clicks at the page's left edge
  (x 30 of 1280) and answers a question "Cancel" first, then "OK",
  reading after "Cancel" where the focus is and any message under a
  box. `neighbour` takes the untouched window, the "Name" left with Tab,
  the form's own "Cancel" and the cleared "Name" of "Article Text";
  `reach` takes "Create New Role" and the reload with the window open.
  No server error and no page script error in any run.
- `main`, walked on OJS, OMP and OPS: as Observed.
- 3.5, walked on OJS, OMP and OPS: as Observed. Its `FormHandler.js` is
  `main`'s (one whitespace difference), and its `SideModal.vue`,
  `SideModalBody.vue` and `AjaxModalWrapper.vue` close the same way.
- 3.4 and 3.3, read in the code (`lib/pkp`
  `js/controllers/modal/ModalHandler.js` and
  `js/controllers/form/FormHandler.js` on `stable-3_4_0` and
  `stable-3_3_0`; the genre grid opens an `AjaxModal` there, which the
  jQuery modal draws): the backdrop closes on `click`, Escape on
  `keyup`. Not walked.
- Introduced: `git log -S'reka-ui'` on `SideModal.vue` gives c5f84666
  on `stable-3_5_0` and 39ebe864 on `main`; GitHub names their pull
  requests `pkp/ui-library#668` and `pkp/ui-library#671`. The Headless UI version it
  replaced (`@headlessui/vue` ^1.7.23) closes from its
  `use-outside-click` hook on the document's `click`, read at its tag
  v1.7.23; reka-ui 2.8.0's `DismissableLayer/utils.js` (the checkout's
  `node_modules`) dismisses on `pointerdown`. Escape: `git blame` on
  3.3's `opt_event.which == 27` line gives 3cdf1f20b7, a linting change;
  older history not traced.
- Tips: `main` ojs 3109a59114, omp 5777025be, ops f048e747b4, with
  lib/pkp f37a174626 (OJS) and 042726ebf6 (OMP, OPS) and lib/ui-library
  99abe252; `stable-3_5_0` ojs 1e78ca0c2b, omp cce424e5e, ops
  5eca7fd603, with lib/pkp 68512b5fda and lib/ui-library 2576e00a; 3.4
  read at lib/pkp 85f47442cf, 3.3 at lib/pkp 867ce82d8e.
- Fix tried with `node bin/try-fix.js apply <fix.diff> ojs omp ops`
  (no build: the test installs load `lib/pkp/js` unminified; a release
  build carries the change in `js/pkp.min.js`), three times on
  2026-10-21: the blur alone (default, `neighbour` and `reach` with the
  fix in; `neighbour` and `reach` with it out), then with the focus
  given back at once, then with the focus given back after the press
  (the diff as filed; default and `neighbour` with the fix in,
  `neighbour` with it out). With the focus given back at once, Escape
  left the focus in "Name" but the click beside left it on the page
  body, since the press's own `mousedown` moves it after the handler
  returns.
- Unverified:
  - the touch case (reka-ui waits for the `click` there, so a tap
    beside may ask);
  - Firefox and Safari (walked in Chromium only);
  - the moment the box's late `change` fires (during the window's
    close, per the code); the walk shows its result, the question at
    the next reload, and the trial shows it gone;
  - the other windows the Summary names, beyond "Create New Role" and
    a component's "Edit" (in the code: each is a `FormHandler` form in
    an `AjaxModal`).
