# After "Cancel" closes "Assign Participant", reloading or leaving the page raises the browser's leave-page box

- **Severity** low
- **Effort** small
- **Kind** regression
- **Affects**
  - main: OJS, OMP, OPS
  - 3.5: OJS, OMP, OPS
  - 3.4: OJS, OMP, OPS (read in the code, not walked)
  - 3.3: OJS, OMP, OPS (read in the code, not walked)
- **Introduced** `pkp/pkp-lib#8229` for `pkp/pkp-lib#7894` · [2dbe15f07c](https://github.com/pkp/pkp-lib/commit/2dbe15f07ccda7c3cb2900a1b6e2ad859590c8f9) · 2022-08-31 · Dulip Withanage (withanage)
- **Upstream** none found (2026-10-21)
- **Tracked in** spec U35 [A18](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U35-stage-participants.md#a18)
- **Checked** 2026-10-21, each branch's tip (the commits in Evidence)
- **Model** claude-opus-5-5

## Summary

In the "Assign Participant" window, an editor picks a role in the role
list and closes the window with "Cancel" without pressing "Search"
after that choice. The next time the editor leaves the page (a reload,
a link, the browser's back button, closing the tab), the browser asks
whether to leave, as if a form with unsaved changes were still open. No
window is open and nothing is unsaved.

The question comes once. When the editor chooses to leave, the page
goes on as asked, and the "Participants" panel is unchanged.

The same happens when "OK" was pressed first and refused: the editor
picked a person, then a role that person does not hold, and "OK" showed
the window's form again before "Cancel" closed it.

## Impact

- **Lost**: nothing; no assignment changes.
- **Who**: any editor who opens "Assign" in the "Participants" panel of
  a workflow stage, picks a different role in the role list and then
  gives up with "Cancel".
- **Way round**: answer the box to leave. Pressing "Search" after
  picking the role, before "Cancel", leaves no box behind.

Low: one needless question per such "Cancel".

## Steps to reproduce

Preconditions:

- PKP's default test dataset for `main` (pkp/datasets, 2026-10-20),
  nothing else; the `stable-3_5_0` dataset holds the same people and
  submissions, and the steps are the same there. The steps name OJS. On
  OMP use submission 3 ("The Political Economy of Workplace Injury in
  Canada") and the role "Series editor"; on OPS submission 1 ("The
  influence of lactation on the quantity and quality of cashmere
  production") and the role "Moderator".

A role picked, then "Cancel":

1. Sign in as `dbarnes` (password `dbarnesdbarnes`).
2. Open submission 4, "Computer Skill Requirements for New and Existing
   Teachers: Implications for Policy and Practice"
   (`/index.php/publicknowledge/en/dashboard/editorial?workflowSubmissionId=4`).
3. In the "Participants" panel press "Assign". The "Assign Participant"
   window opens.
4. Choose "Section editor" in the role list. Do not press "Search".
5. Press "Cancel". The window closes without a question.
6. Reload the page. When the browser's box opens, choose to go on
   (its button reads "Reload" or "Leave", depending on the browser), so
   the page loads afresh before the next step.

"OK" refused, then "Cancel":

7. Press "Assign" again, choose "Section editor" in the role list and
   press "Search". Minoti Inoue is listed.
8. Choose "Minoti Inoue".
9. Choose "Author" in the role list. Do not press "Search". The list
   still shows the section editors, with Minoti Inoue chosen.
10. Press "OK". Minoti Inoue does not hold the role "Author", so the
    save is refused: the window shows its form again and nobody is
    assigned.
11. Press "Cancel". The window closes without a question.
12. Reload the page.

**Expected**: after step 6 and after step 12 the page reloads without a
question, as it does once "Cancel" has closed any other window.

**Observed**: after step 6 and after step 12 the browser opens its
leave-page box before the reload. The page asks through its
`beforeunload` handler, so the box carries the browser's own wording.
Once the editor chooses to reload, the page loads and the
"Participants" panel lists the same four people as before (Daniel
Barnes, David Buskins, Stephanie Berardo, Craig Montgomerie). A second
reload asks nothing. No request answered with an error and the page
logged no script error.

After steps 3 to 5, leaving the page any other way raises the same box:
closing the workflow and following "Start A New Submission" in the
dashboard's side menu, the browser's back button, and closing the tab.

Control: "Assign", "Section editor", "Search", then "Cancel" and a
reload: the page reloads without a question.

## Cause

The people list inside the window has its own small form, the role list
and the name search
(`lib/pkp/templates/controllers/grid/users/userSelect/searchUserFilter.tpl`).
Line 14 on `main` attaches `AddParticipantFormHandler` to it with no
options:

```smarty
$('#{$formId}').pkpHandler('$.pkp.controllers.grid.users.stageParticipant.form.AddParticipantFormHandler');
```

`AddParticipantFormHandler` is a `ClientFormHandler`, so the base
`FormHandler` tracks changes to it by default (`trackFormChanges =
true`). A change of the role list runs `FormHandler.formChange()`, which
sends `formChanged`. `SiteHandler.registerUnsavedFormElement_()` then
adds the filter to the page's list of unsaved forms. From then on
`SiteHandler.pageUnloadHandler_()` answers `beforeunload` with
`form.dataHasChanged` while the list is not empty. A page load starts a
new list, which is why the box comes once.

Only a "Search" takes the filter off that list: its submit sends
`unregisterChangedForm`. "Cancel" takes off the window's own form alone.
`FormHandler.cancelForm()` calls `unregisterForm()` on the form whose
"Cancel" was pressed, `#addParticipantForm`, and the window closes. The
filter it contained stays listed with no window left to release it.
After a refused "OK" the server sends a new copy of the window's form,
and with it a new filter. "Cancel" then releases the new window form,
while the old filter, changed at step 9, is still on the list.

The list does not key a form by its own id. It keys it by
`$(event.target.lastElementChild).attr('id')`, where the target is the
parent of the form's element. For the filter that parent is the people
grid, so the filter is listed under the id of the grid's table (with a
suffix that changes on every render), or as `undefined` when the grid's
last child has no id.

Every other grid filter form opts out of change tracking, either with
`trackFormChanges: false` in its template (`userGridFilter.tpl`,
`filesGridFilter.tpl`, `pluginGridFilter.tpl` and the apps' export and
subscription filters) or through `ToggleFormHandler`, which sets it in
its constructor. This template did too, from its creation in
`pkp/pkp-lib#411` (2016) until 2022. For `pkp/pkp-lib#7894` (the
recommend-only option disappearing for a person shown after "Load
more"), 2dbe15f07c moved the person click handler out of
`AddParticipantFormHandler` into the root `FormHandler.js`, and in the
same change dropped `trackFormChanges: false` from this line. Eight
minutes later the follow-up 98979407d9 (Nate Wright, same issue) moved
the click handler back into `AddParticipantFormHandler`, bound on the
filter's parent element, and did not restore the option. On
`stable-3_3_0` the same two changes are a28e6719a2 and 81380f1e40.
Nothing in the issue or either change needs the filter tracked.

Reach:

- The "Assign Participant" window of every stage, on the three apps
  (walked on the submissions in the Steps). It is the only place the
  template is used (`UserSelectGridHandler::getFilterForm()`).
- "Edit Assignment" uses the same window form without the people list,
  so it has no filter (read in the code).
- The window's own form is marked changed as it opens, because
  `AddParticipantFormHandler.addUserGroupId()` sends `change` to its
  hidden `userGroupId`. So the window's close button asks even when
  nothing was changed, and a reload with the window open raises the
  box (spec U35 Rule 6c). This fault does not depend on that (walked).
- No other filter form in pkp-lib or the three apps tracks changes
  (searched, Evidence).

## Proposed fix

Put the option back. The people list's filter then never joins the
page's list of unsaved forms, like every other grid filter. The diff:
[fix.diff](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/assign-participant-cancel-reload-leave-box/fix.diff).
Its paths start at the app root (`a/lib/pkp/…`), so it applies from an
app checkout as it stands, and in pkp-lib itself with `git apply -p3`.

```diff
--- a/lib/pkp/templates/controllers/grid/users/userSelect/searchUserFilter.tpl
+++ b/lib/pkp/templates/controllers/grid/users/userSelect/searchUserFilter.tpl
@@ -13,2 +13,6 @@
 	// Attach the form handler to the form.
-	$('#{$formId}').pkpHandler('$.pkp.controllers.grid.users.stageParticipant.form.AddParticipantFormHandler');
+	$('#{$formId}').pkpHandler('$.pkp.controllers.grid.users.stageParticipant.form.AddParticipantFormHandler',
+		{ldelim}
+			trackFormChanges: false
+		{rdelim}
+	);
```

A search filter holds nothing to save, so it has no business in the
unsaved-forms list. The fix keeps what `pkp/pkp-lib#7894` was for:
the role-list binding and the person click handler run whatever the
option says, since only `FormHandler.formChange()` reads it.

Tried on `main` on the three apps. After step 6 and after step 12 the
page reloads without a question, and the control is unchanged. With
the fix in and out alike:

- the recommend-only box ("Assignment privileges") is hidden after
  "Section editor" and "Search", shown, enabled and unticked once Minoti
  Inoue is chosen, hidden for a person chosen under "Author", and shown
  again on the way back to the section editor;
- with a role picked in the open window, the window's close button
  still asks "The data on this form has changed. Do you wish to continue
  without saving?" and keeps the window when answered "Cancel", and a
  reload with the window still open still raises the leave-page box.

**Alternatives**

- Have "Cancel" release every form inside the window. On `main` and 3.5
  that belongs in the close callback of ui-library's
  `AjaxModalWrapper.vue`, which runs on every close, "Cancel" included,
  and sends `containerClose` to the window's first form only; pkp-lib's
  `ModalHandler.modalClose()` sends no `containerClose` there. On 3.4
  and 3.3 it belongs in `ModalHandler.modalClose()`, which closes the
  window there. It is wider than needed and touches two repos, while
  the filter should never have been tracked.
- Key the unsaved-forms list by the form's own id in
  `SiteHandler.registerUnsavedFormElement_()` and
  `unregisterUnsavedFormElement_()` instead of the parent's last child.
  It would make the list sound, but "Cancel" would still leave the
  filter listed.
- Set `trackFormChanges` to false in `AddParticipantFormHandler`'s
  constructor, as `ToggleFormHandler` does. This works the same way, but
  the template option is how the other filters do it and needs no
  JavaScript rebuild.

**What goes with it**

- Nothing is stored, so there is nothing to repair. The window's own
  form keeps its change tracking, and so its close question.
- Backport: the template line is the same on `stable-3_5_0`,
  `stable-3_4_0` and `stable-3_3_0`, and the diff applies to each as it
  stands. Tried on `main` only.
- Guard: an e2e scenario in spec U35 (Rule 6c): choose a role, "Cancel",
  reload, and expect no `beforeunload` dialog.

Small: one template option, tried as written.

## Evidence

- Kept script:
  [walk.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/assign-participant-cancel-reload-leave-box/walk.js)
  with its
  [lib.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/assign-participant-cancel-reload-leave-box/lib.js).
  It takes steps 7 to 12, then steps 3 to 6, then the control, each from
  a page just loaded. Before each reload it reads the page's
  unsaved-forms list as `pageUnloadHandler_()` iterates it. Other modes
  take the other ways of leaving (`MODE=leave`), read the recommend-only
  box (`MODE=ro`), and check the close button and a reload with the
  window open (`MODE=nb`). Run:
  `PROBE_FEATURE=<feature> PROBE_AGENT=<id> node bin/probe.js all shared/playwright/checks/issues/assign-participant-cancel-reload-leave-box/walk.js`,
  with `PKP_E2E_LINE=stable-3_5_0` in front for 3.5.
- On 3.5, on the three apps, the list after "Cancel" held one entry,
  the filter's, under the grid table's id or as `undefined`. A drive
  that logged the page's `formChanged` and `unregisterChangedForm`
  events on OJS `main` showed the filter registering on the role change
  after "Search", and nothing releasing it.
- Other ways of leaving were walked on `main` on the three apps after
  steps 3 to 5. Closing the workflow (Escape) left the filter listed. The
  link followed was the side menu's first one, "Start A New Submission".
  The back button went to the previous page load. Closing the tab ran
  the page's `beforeunload`. 3.5 was walked by reload only.
- The recommend-only check took the role lists of the dataset, which
  hold fewer than twenty people, so no "Load more" was shown. The
  `pkp/pkp-lib#7894` case (a person shown after "Load more") was not
  walked. The click handler's binding on the filter's parent does not
  read the option (code).
- Walked on `main`: OJS 3109a59114 (lib/pkp f37a174626), OMP 5777025bec
  and OPS f048e747b4 (lib/pkp 042726ebf6), ui-library 99abe252. Walked
  on `stable-3_5_0`: OJS 1e78ca0c2b, OMP cce424e5ef, OPS 5eca7fd603
  (lib/pkp 68512b5fda, ui-library 2576e00a): the same result on every
  app. Dataset: pkp/datasets 5f247d04 (2026-10-20). PostgreSQL; the fault
  is in the browser, and the database plays no part. Chromium only:
  Firefox and Safari not driven.
- Code read on `main` and 3.5: `searchUserFilter.tpl`,
  `AddParticipantFormHandler.js`, `ClientFormHandler.js`,
  `FormHandler.js` (`formChange()`, `submitHandler_()`, `cancelForm()`,
  `unregisterForm()`, `containerCloseHandler()`), `SiteHandler.js`
  (`registerUnsavedFormElement_()`, `unregisterUnsavedFormElement_()`,
  `pageUnloadHandler_()`), `Handler.js` (`trigger()`,
  `triggerPublicEvent_()`), `AjaxFormHandler.js`
  (`handleResponse()`), `ModalHandler.js`, and ui-library's
  `AjaxModalWrapper.vue` and `SideModal.vue`. These files hold the same
  logic on both lines.
- Code read, 3.4 (pkp-lib `stable-3_4_0` 85f47442cf; apps OJS
  0012bd1022, OMP e30fa7e38, OPS 0f1e21a117) and 3.3 (pkp-lib
  `stable-3_3_0` 867ce82d8e; apps OJS d7d9dd14ec, OMP 8e72fc883, OPS
  c5532e2161): `searchUserFilter.tpl` has the same line without the
  option. `AddParticipantFormHandler.js` sends the same `change`.
  `SiteHandler.js` keys and counts the list the same way.
  `ModalHandler.modalClose()` sends `containerClose` to the first form
  only, which after "Cancel" no longer counts as changed, so nothing
  else releases the filter.
- Introduced: `git log --follow` on the template. d1f4bf954b
  (2016-08-17, `pkp/pkp-lib#411`) created it with `ClientFormHandler`
  and `trackFormChanges: false`; 1929e4d21a (the same day, same issue)
  put `AddParticipantFormHandler` in its place and kept the option.
  2dbe15f07c (authored 2022-08-31 by Dulip Withanage, committed
  2022-09-01 by Nate Wright) dropped it, and 98979407d9 did not restore
  it; on `stable-3_3_0` a28e6719a2 and 81380f1e40, merged in
  `pkp/pkp-lib#8229` and first released in 3.3.0-12. Kind is
  "regression" because before that change the filter carried the
  option and never entered the list, the behaviour the fix brings back,
  as the trial shows.
- Other instances: every template under pkp-lib's and the three apps'
  `templates` and `plugins` with a `pkp_form filter` form or a
  `ClientFormHandler`. All set `trackFormChanges: false` or use
  `ToggleFormHandler` (`selectableSubmissionFileListCategoryGridFilter.tpl`,
  `userGroupsGridFilter.tpl`, OMP's `catalogMonographsFilterForm.tpl`),
  except `searchUserFilter.tpl`.
- Upstream search (2026-10-21): pkp/pkp-lib, pkp/ojs, pkp/omp, pkp/ops
  and pkp/ui-library, issues and PRs, by the symptom's words and by the
  template, handler and method names. Read and not this fault:
  `pkp/pkp-lib#2171` (the user grid filter's own option),
  `pkp/pkp-lib#12826` (open: remove the grid code, which lists this
  template), `pkp/pkp-lib#11825` and `pkp/pkp-lib#11826` (unsaved-changes
  warnings of the new tasks and discussions).
- Not driven: a Section Editor as the person assigning; the fix on
  `stable-3_5_0`; 3.4 and 3.3 on screen.
