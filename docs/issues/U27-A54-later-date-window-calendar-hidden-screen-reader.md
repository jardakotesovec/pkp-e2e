# From the second date window opened on a page, screen readers cannot reach the date calendar

- **Severity** medium
- **Effort** small
- **Kind** regression
- **Affects**
  - main: OJS, OMP
  - 3.5: OJS, OMP (released in 3.5.0-2)
  - 3.4: none (code)
  - 3.3: none (code)
- **Introduced** `pkp/ui-library#671` (main) and `pkp/ui-library#668` (3.5) for `pkp/pkp-lib#11258` · [39ebe864f9](https://github.com/pkp/ui-library/commit/39ebe864f98f11b81e9baddfc50cd11032eed723) · merged 2025-07-22 · Jarda Kotěšovec (jardakotesovec)
- **Upstream** none found (2026-11-19)
- **Tracked in** spec U27 [A54](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U27-reviewer-assignment-and-management.md#a54)
- **Checked** 2026-11-19, each branch's tip (the commits in Evidence)
- **Model** claude-opus-5-5

## Summary

A Journal Manager or an assigned Section Editor opens a window with a
date box: "Add Reviewer", "Edit" in a reviewer row's "More Actions", or
"Edit Due Date" in the popover of a review activity indicator on the
submissions dashboard. They close it and open another such window on the
same page without reloading. In the first window, a screen reader
reaches the calendar that opens under a date box. In the second window
and every later one, the calendar is hidden from screen readers, though
it is on screen and takes a mouse click.

The page has one calendar for all its date boxes, so any date window
opened later on the page loses it, not only the reviewer windows: in
OJS also the issue's "Date published" and the subscription dates, in OMP
a chapter's "Date published". The "Resend Review Request" window uses
the same calendar but was not checked on screen.

A screen-reader user can still type the date into the box, which is
announced as "Response Due Date" with its current value ("2026-12-16")
and nothing about the format. A date typed in another format is
silently dropped and the box's earlier date is saved. A keyboard user
without a screen reader is not affected: the calendar's keys (Ctrl with
the arrow keys moves the day, Enter picks it) work from the date box in
every window.

## Impact

- **Lost**: the date a screen-reader user meant, when they type it in
  another format than YYYY-MM-DD: the earlier date is saved instead and
  nothing says so (a separate fault,
  [A16](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U27-reviewer-assignment-and-management.md#a16)).
  Typed in that format, nothing is lost.
- **Who**: editors and managers who use a screen reader, whenever they
  open a second date window on a page: setting reviewer dates on the
  workflow or on the dashboard, and the other date windows above.
- **Way round**: reload the page before opening the next window, or
  type the date as YYYY-MM-DD, the pattern of the value the box reads
  out.

Medium: a screen-reader user loses the calendar with no sign of it, and
the only way left, typing, is not explained and fails silently on a
wrong format. It would be low if the box announced the format it takes.

## Steps to reproduce

Preconditions:

- PKP's default test dataset for `main`.
- A screen reader (NVDA, VoiceOver), or Chrome's accessibility tree
  (DevTools › Elements › "Accessibility" pane, "Enable full-page
  accessibility tree") to read what a screen reader is given.

The submission: OJS submission 12, "Sodium butyrate improves growth
performance of weaned piglets during the first period after weaning";
OMP submission 17, "Open Development: Networked Innovations in
International Development". Each is in its first review round with two
reviewers who have not responded, Julie Janssen and Paul Hudson.

On the workflow:

1. Sign in as `dbarnes`.
2. On the dashboard ("Assigned to me" in OJS, "Active submissions" in
   OMP), press "View" on the submission.
3. In the Reviewers panel, open Julie Janssen's "More Actions" and press
   "Edit". The "Edit Review" window opens.
4. Click the "Response Due Date" box. A calendar opens under it. Read it
   with the screen reader.
5. Press "Cancel" at the bottom of the window.
6. Open Paul Hudson's "More Actions" and press "Edit".
7. Click the "Response Due Date" box and read the calendar.
8. Press "Cancel".
9. Press "Add Reviewer", search "McCrae" and press "Select Aisla
   McCrae".
10. Click the "Response Due Date" box and read the calendar.
11. Press the window's top "Close".

On the dashboard (a fresh page):

12. Open the dashboard's address again,
    `/index.php/publicknowledge/dashboard/editorial` (in OMP with
    `?currentViewId=active`), which loads a fresh page.
13. In the submission's row, the "Editorial Activity" column holds one
    round icon per reviewer, each with a day count ("27"; a screen
    reader names it "Awaiting Response from the reviewer"). Press the
    first one, then "Edit Due Date" in the popover that opens.
14. Click the "Response Due Date" box and read the calendar.
15. Press "Cancel".
16. Press the second icon, then "Edit Due Date".
17. Click the "Response Due Date" box and read the calendar.
18. Press "Cancel".

A first window whose calendar is never opened (a fresh page again, as in
step 12, then "View" on the submission):

19. Open Julie Janssen's "More Actions", press "Edit", and press
    "Cancel" without clicking a date box.
20. Open Paul Hudson's "More Actions" and press "Edit".
21. Click the "Review Due Date" box and read the calendar.

**Expected:** in every window the screen reader reaches the calendar the
same way: its day links, "Prev", "Next", "Select month" and "Select
year".

**Observed:** only the first window of each page (steps 4 and 14) gives
the calendar to the screen reader: the accessibility tree holds its day
links, both lists and the month table. In steps 7, 10, 17 and 21 the
calendar is on screen, but its container carries the marks reka-ui's
`hideOthers()` puts on everything outside the open window:

```html
<div id="ui-datepicker-div" class="ui-datepicker ui-widget …" aria-hidden="true" data-aria-hidden="true">
```

The accessibility tree has nothing under it, so the screen reader finds
no calendar. The date box still reads as the text box "Response Due
Date", value "2026-12-16", with no description. Control: in step 21 a
day clicked in the calendar is the date saved, also after a reload.

## Cause

The page has one jQuery UI calendar for all its date boxes. jQuery UI
creates it once, as `<div id="ui-datepicker-div">`, and appends it to
`<body>` the first time a date box is set up
(`$.pkp.controllers.form.FormHandler`, the `.datepicker({…})` call in
`lib/pkp/js/controllers/form/FormHandler.js`, lines 64-74). A legacy
form is set up only after its window has opened, so on a fresh page the
calendar does not exist yet when the first date window opens.

Since `pkp/pkp-lib#11258` the side windows are reka-ui dialogs
(`lib/ui-library/src/components/Modal/SideModal.vue` and
`SideModalBody.vue`, `DialogRoot` and `DialogContent`). When one opens,
reka-ui's `useHideOthers` calls `hideOthers()` from the `aria-hidden`
package, which marks every child of `<body>` outside the dialog with
`aria-hidden="true"` and `data-aria-hidden="true"`, and lifts the marks
when the dialog closes. The calendar stays in `<body>` after the first
window closes, whether or not it was opened there, so every later
window marks it for as long as it is open. The rule broken: a modal
dialog's own popups must sit inside it, or be kept out of what it hides.

Before that change, the side windows were Headless UI dialogs, which mark
only the `<body>` child holding the page itself; the calendar's own
`<div>` was never marked. `SideModalBody.vue` already lists the calendar
as a third-party element that belongs to the window
(`FOCUS_TRAP_IGNORE_SELECTORS = ['.tox-tinymce-aux', '.ui-widget']`, for
focus and outside clicks), but nothing keeps it out of `hideOthers()`.
`aria-hidden` takes nothing from the keyboard: jQuery UI drives the
calendar from the date box's own key handler (`_doKeyDown`), and Tab
closes it.

Reach:

- Every legacy form with a date box, since all are set up by
  `FormHandler` and open in a side window: "Add Reviewer", "Edit
  Review" and "Resend Review Request" (pkp-lib, all apps with a review
  stage); OJS's issue "Date published" and issue access "Open access
  date", its subscription "Start date" and "End date", the PFL plugin's
  settings; OMP's chapter "Date published".
- TinyMCE's floating layer (`.tox-tinymce-aux`), also a `<body>` child,
  is not affected: it is created anew with each editor, after the window
  opens, and was unmarked in the "Add Reviewer" window of step 9.

## Proposed fix

Show the calendar inside the window that holds the date box, with the
`beforeShow` option jQuery UI calls before it draws the calendar
([fix.diff](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/later-date-window-calendar-hidden-screen-reader/fix.diff)):

```diff
 				dateFormat: $('#' + $this.prop('id') + '-altField')
-						.attr('data-date-format')
+						.attr('data-date-format'),
+				// The page has one calendar for all its date boxes, which jQuery UI
+				// appends to the body. A side modal hides every body child outside
+				// itself from assistive technology while it is open (aria-hidden),
+				// so show the calendar inside the window that holds the date box,
+				// without the marks a window may have set while it sat in the body.
+				beforeShow: function(input, inst) {
+					var $dialog = $(input).closest('[role="dialog"]');
+					if ($dialog.length) {
+						inst.dpDiv.appendTo($dialog)
+								.removeAttr('aria-hidden data-aria-hidden');
+					} else {
+						inst.dpDiv.appendTo(document.body);
+					}
+				}
 			});
```

The calendar is then part of the dialog, so `hideOthers()` leaves it
alone, and a screen reader in the dialog meets it next to the box it
belongs to. The move alone is not enough. A window whose calendar was
never opened leaves the calendar in `<body>`. The next window then marks
it as it opens, and the marks travel with the calendar into the dialog
(steps 19 to 21), so the move lifts them. That is safe for
`aria-hidden`'s own bookkeeping: on close it removes the marks from the
nodes it set them on, and removing a missing attribute does nothing.

Once the window has slid in (450 ms), the calendar opens in the same
place as today: it keeps `position: fixed`, and the window then has no
`transform`. During the slide-in the window's `transform` makes it the
calendar's frame, so a calendar opened then (only by keyboard, as the box
is still off screen) slides in with the window and ends at the same
place it reaches today. That place is wrong with or without the fix:
jQuery UI measures the box while it is off screen and pins the calendar
to the viewport's right edge, away from the box. When a window closes
and its content goes, jQuery UI appends the calendar to `<body>` again at
the next date box it sets up.
This keeps the reka-ui change and what it was for (focus returning to
the control that opened the window).

Tried on `main` in OJS and OMP. With the fix in, every window of the
Steps gave the calendar to the screen reader, inside the window, steps
19 to 21 included. With the fix in and out alike, a mouse user's
calendar opened at the same place under its box, a day clicked in it
was saved, also after a reload, and the keyboard keys set the date the
same way. A calendar opened during the slide-in ended at the same
place with and without it. No calendar stayed on screen after the window
closed.

**Alternatives:**

- Lift the marks from `.ui-widget` in `SideModalBody.vue` after the
  window opens, and leave the calendar in `<body>`: the calendar stays
  outside the dialog, away from its box in the reading order, and a
  screen reader that keeps to the dialog still does not look there.
- Move the calendar without lifting the marks: steps 19 to 21 still
  fail (tried; see above).
- Create the calendar when the page loads: it would then be hidden in
  the first window too.
- Give the calendar `aria-live`, which `hideOthers()` skips: wrong
  semantics, every month change would be announced.
- Replace the legacy date boxes with the Vue date field: the long-term
  direction, but a rewrite of every form listed in the Cause.

**What goes with it:**

- Rebuild `js/pkp.min.js` in each app, as for any `lib/pkp/js` change;
  installs with `enable_minified = On` load only the built file.
- The same diff applies to `stable-3_5_0`, whose `FormHandler.js` holds
  the same call. 3.4 and 3.3 need nothing.
- The guard: an end-to-end check that opens two date windows on one
  page, the first without opening its calendar, and finds the calendar's
  days in the second one's accessibility tree.

Small: one option on one call in pkp-lib, tried, and an end-to-end check.

## Evidence

- Kept script:
  [walk.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/later-date-window-calendar-hidden-screen-reader/walk.js)
  (helpers in its `lib.js`), run in pkp-e2e's harness on a fresh load of
  the dataset with
  `node bin/probe.js ojs,omp shared/playwright/checks/issues/later-date-window-calendar-hidden-screen-reader/walk.js`.
  It takes steps 1 to 18 and, in each window, reads the calendar's
  attributes, Chromium's accessibility tree under it (CDP
  `Accessibility.getFullAXTree`), its aria snapshot and the date box's
  role, before any press inside the calendar. `NB=1` takes steps 19 to
  21, then clicks day 28, presses "OK" and reads the row and
  `review_assignments.date_due` after a reload. `EXTRA=1` reads the date
  boxes' accessible name, description and value (CDP
  `Accessibility.getPartialAXTree`) and takes the keyboard path in a
  second window (focus, Ctrl+Right, Enter: 2026-12-16 became
  2026-12-17). `SLIDE=1` opens a calendar while the window slides in,
  the slide-in slowed to 3 s and the box focused as Tab focuses it (a box
  still off screen takes no click). The calendar was set at `left: 880px`
  (the viewport's right edge, 1280 px wide) on both sides; the box ended
  at x 211. Without the fix the calendar stood at x 880 throughout; with
  it, it was at x 2153 when opened and moved with the window to x 880.
- Fix trial (`main`, OJS and OMP):
  `node bin/try-fix.js apply shared/playwright/checks/issues/later-date-window-calendar-hidden-screen-reader/fix.diff ojs omp`,
  a fresh dataset and each mode's walk, and the `NB=1`, `EXTRA=1` and
  `SLIDE=1` walks again on the unpatched code (after `revert`, or before
  `apply`). The move-only
  version is the one "Move the calendar without lifting the marks" in
  the Alternatives. `enable_minified` is Off on the dataset, so the
  source file was served unbuilt.
- Walked on `main` and `stable-3_5_0`, OJS and OMP, as `dbarnes`, on
  PKP's default dataset (pkp/datasets 6d98f5ab, 2026-11-18), PostgreSQL,
  Chromium, each walk on a freshly loaded dataset, with no server or
  script error. Steps 1 to 21 on both branches; the `EXTRA=1` and
  `SLIDE=1` reads on `main`.
- Tips: `main` OJS 0b12d7646e, OMP 5b348c3f3, pkp-lib 2f2c07fea7,
  ui-library 836c01b5 (both apps). `stable-3_5_0` OJS 4032f3dd7d, OMP
  496c50188, pkp-lib ab7f581349, ui-library fd00e45f (both apps).
- Code reads: `FormHandler.js` is the same on `main` and `stable-3_5_0`
  (one trailing space apart); both ui-library tips build `SideModal` on
  reka-ui (`DialogRoot`/`DialogContent`; reka-ui 2.8.0 on `main`, 2.3.2
  on 3.5, `useHideOthers` in `DialogContentModal`, `aria-hidden` 1.2.6).
  The Headless UI 1.7.23 dialog that preceded it marks only the
  `body > *` element containing the page's main tree (its bundled
  `dist/components/dialog/dialog.js` in the app's `node_modules`).
  jQuery UI 1.14.1: `_doKeyDown` (Tab hides, Enter selects,
  Ctrl/Cmd with arrows, Page Up/Down) and `$.fn.datepicker`, which
  appends `#ui-datepicker-div` to `<body>` only when it is missing.
- Release: the first 3.5 tag carrying it is `3_5_0-2` (2025-11-28) in
  OJS and OMP, whose `lib/ui-library` pointer (3705552079) holds
  c5f8466652; `3_5_0-1` (2025-07-09) predates it.
- 3.4 and 3.3, read in the code (pkp-lib `origin/stable-3_4_0` 463396fe00,
  `origin/stable-3_3_0` df738d3a66; ui-library `origin/stable-3_4_0`
  ee684b34, `origin/stable-3_3_0` 96959f9e): the reviewer windows are
  jQuery modals built by `ModalHandler.js`, which marks nothing outside
  itself, and the ui-library has no reka-ui (`vue-js-modal` only). The
  `FormHandler` datepicker call is the same.
- Introduced: `git blame` on the `FormHandler` call goes back to the
  date-format work of `pkp/pkp-lib#1868`; the call became wrong when the
  side windows moved to reka-ui. On `main` that is 39ebe864f9 (PR
  `#671`), authored and merged on 2025-07-22. On 3.5 it is c5f8466652
  (PR `#668`), authored 2025-07-17 and committed 2025-07-22. The
  header's date is the merge date of both.
- Upstream search (2026-11-19; pkp/pkp-lib, pkp/ui-library, pkp/ojs,
  pkp/omp): datepicker aria-hidden, datepicker screen reader, date picker
  screen reader, calendar screen reader, `ui-datepicker-div`, datepicker
  modal (accessibility), datepicker FormHandler, A11Y datepicker,
  hideOthers, reka-ui aria-hidden, aria-hidden modal, due date calendar
  accessibility. Hits read: `pkp/pkp-lib#6652` (a stray calendar after
  navigation, closed), `#602`, `#639`, `#1868`/`#1898`, `#11162`, and
  ui-library PRs naming `aria-hidden` on icons; none is this fault.
- Not driven: the "Resend Review Request" window, and the OJS issue,
  subscription and OMP chapter date boxes (code only). No screen reader
  was run; the accessibility tree Chromium hands to one was read.
- Unverified: whether a screen reader honouring `aria-modal` reaches the
  calendar in the first window today, where it sits outside the dialog.
