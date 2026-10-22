# In the preprint submission wizard, a refused DOI gets an unexpected-error window and no message at the box

- **Severity** medium
- **Effort** medium
- **Kind** defect
- **Affects**
  - main: OPS; OJS (a plain language summary over the word limit, U21 A16)
  - 3.5: OPS
  - 3.4: OPS (code)
  - 3.3: none (code; no autosaving wizard)
- **Introduced** `pkp/ui-library#241` for `pkp/pkp-lib#7191` · [467034aa4](https://github.com/pkp/ui-library/commit/467034aa4171bca0c46fa9e0e4b8b8dcdaa7cee2) · 2022-10-31 · Alec Smecher (asmecher), PR author; commit by Nate Wright (NateWr)
- **Upstream** none found (2026-10-22)
- **Tracked in** spec U75 [A7](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U75-preprint-relations.md#a7)
- **Checked** 2026-10-22, each branch's tip (the commits in Evidence)
- **Model** claude-opus-5-5

Update 2026-10-22: walked again after `pkp/pkp-lib#13585`; the fix now
also keeps the author on the refused step until the box is changed.

## Summary

On the submission wizard's "For Readers" step, an author ticks "This
preprint has been published elsewhere.", types the DOI without its web
address ("10.1234/abcd") in the "DOI of the published preprint" box and
presses "Continue". The server refuses the answer, but the wizard moves
on to "Review" and opens a window that reads only "An unexpected error
has occurred. Please reload the page and try again.". Back on "For
Readers" the step still shows the ticked answer and the typed DOI, with
no message under the box, so the author is never told that the box
needs a full web address.

Neither the answer nor the DOI is saved. After the reload the window asks
for, "Review" reads "This preprint has not been published elsewhere.",
and "Submit" completes the submission: the preprint goes to the
moderators with no relation at all. Only an author who types the full
address ("https://doi.org/10.1234/abcd") gets the relation saved; the
box has no help text that says so.

The same fault shows the same window for every field the server refuses
on a wizard step: on preprint servers also an "Other license URL" that
is not a web address, and on journals and preprint servers a plain
language summary over the section's word limit. That summary refusal
has
[its own report](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/issues/U21-A16-plain-summary-over-word-limit-refused.md),
which asks that it not be refused while submitting; this report's fix
shows its message in the meantime.

## Impact

- **Lost**: the relation the author entered, the "published elsewhere"
  answer and its DOI. The preprint is submitted without it, and nothing
  on the moderator's side says the author gave one.
- **Who**: every author on a preprint server who says, while submitting,
  that the preprint is published elsewhere and writes the DOI without
  "https://doi.org/". How many do so is not measured; the box asks for
  a DOI and gives no example of the form it wants.
- **Way round**: type the DOI as a full address, "https://doi.org/…".
  Nothing on screen suggests it, so an author cannot find it out. A
  moderator can enter the relation in the "Relations" dropdown after
  submission, which does say "This is not a valid URL.", but only if
  they learn there is one to enter.

Medium: it needs an author who reports, while submitting, a version
already published elsewhere and writes its DOI bare, and the window,
though it names nothing, does warn that something failed. It would be
high if bare DOIs turned out to be what most such authors type, or if
no window appeared, since the relation would then be lost where nobody
looks: "Review" says "not published elsewhere"
([A9](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U75-preprint-relations.md#a9))
and the unanswered question does not stop "Submit"
([A8](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U75-preprint-relations.md#a8)).

## Steps to reproduce

Preconditions:

- PKP's default test dataset, OPS `main` (or 3.5).

Steps:

1. Sign in as `ccorino`, an author.
2. Open "Make a Submission" (`/index.php/publicknowledge/en/submission`),
   type the title "u75r3 DOI written on its own", choose "English" under
   "Submission language", tick the requirements and privacy boxes,
   press "Begin Submission".
3. Press "Continue" until "For Readers".
4. Under "Relation status" choose "This preprint has been published
   elsewhere.", and type "10.1234/u75r3" in "DOI of the published
   preprint".
5. Press "Continue".
6. Press "OK" in the "Error" window.
7. Press "Back".

Submitting after the refusal, in full (with a file and an abstract so
that "Submit" is offered):

1. Sign in as `ccorino`, open "Make a Submission", type the title "u75r3
   DOI written on its own, submitted", choose "English", tick both
   boxes, press "Begin Submission".
2. On "Upload Files" add a "Preprint Text" file, press "Continue".
3. On "Details" type an abstract, then press "Continue" until "For
   Readers".
4. Choose "This preprint has been published elsewhere.", type
   "10.1234/u75r3" in "DOI of the published preprint", press
   "Continue".
5. Press "OK" in the "Error" window.
6. Reload the page, as the window says.
7. Open "For Readers", then "Review", and press "Submit" and "Submit"
   in the confirmation.
8. Sign in as `dbarnes`, open the new submission's publication and its
   "Relations" dropdown.

**Expected**: at step 5 the author is kept on (or brought back to) "For
Readers", and kept there until they change the box, with "This is not a
valid URL." under "DOI of the published preprint" and the notice "The
form was not saved because 1 error(s) were encountered. Please correct
these errors and try again.", as "Relations" shows for the same value.

**Observed**: the save is refused and the wizard moves on to "Review":

```
PUT …/api/v1/submissions/20/publications/21  → 400
{"vorDoi":["This is not a valid URL."]}

Error
An unexpected error has occurred. Please reload the page and try again.
```

The "Relation status" panel on "Review" reads "This preprint has not
been published elsewhere.", and "Checking your submission" does not
clear. Back on "For Readers" (step 7), "This preprint has been published
elsewhere." is ticked and the box holds "10.1234/u75r3", with no message
under it and the box not marked invalid. The footer reads "Saving" and
both "Save for Later" buttons are disabled; that hang, and the page error
"Cannot read properties of undefined (reading 'url')" logged four
seconds after the refusal, are
[U21 A19's report](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/issues/U21-A19-wizard-refused-save-hangs-saving.md).

Submitting after the refusal: the reload asks nothing ("Unsaved
Changes" does not open). "Review" reads "This preprint has not been
published elsewhere.", lists no problem, and "Submit" leads to
"Submission complete". In the submitted preprint's "Relations" dropdown
no answer is ticked. (The "For Readers" step shows no answer after any
reload, saved or not: its form always starts empty.)

Control: as `dbarnes`, open submission 1 "The influence of lactation on
the quantity and quality of cashmere production" and its publication;
in the "Relations" dropdown of the publication controls above the
tabs, give the same answer and press "Save". The dropdown sends the same
request the wizard does, `PUT …/api/v1/submissions/1/publications/1`,
gets the same 400, and shows "This is not a valid URL." under the box,
"Please correct one error.", and the notice above.

## Cause

Every wizard step saves itself in the background through the autosave
mixin. When the server refuses a save, ui-library's
`SubmissionWizardPage.vue` `autosaveErrored(autosave, xhr, status)`
handles it. By then the mixin's `_sendAutosave()` `onError` has already
set `isDisconnected` and put the payload back into local storage. For any
status other than 0 and 500, `autosaveErrored()` drops that stored
payload (except on a 403), sets `isDisconnected` again, and calls
`this.ajaxErrorCallback({})`: the generic "An unexpected error has
occurred" window. The server's answer, `xhr.responseJSON`, which names
the field and the message, is never read.

The wizard already has what it needs to show it. Each step's form takes
an `errors` map keyed by field name, the wizard's `updateForm(formId,
data)` sets it, and `autosave.id` is the refused form's id. The
"Relations" dropdown uses the same form component: its `Form.vue`
`error()` passes a 400's `responseJSON` through `structuredErrors()` into
the form's `errors` and shows the `form.errors` notice. The wizard's
`validate()`, `submit()` and `cancelSubmission()` read `responseJSON` too,
but into the page-level `errors`, the list "Review" shows, which holds
the saved submission's problems and is rebuilt by every check.

The whole "Relation status" form is refused, so the "published
elsewhere" answer is not saved either. The wizard has moved on to
"Review" before the server answers, because the save is sent after the
step changes. That order is intended and is not a second defect.

Showing the message is not enough on its own. A form is sent again only
after one of its fields changes: `updateAutosaveForm()` puts it on
`staleForms`, and `addAutosaves()` takes it off when the step changes.
So a refused form the author leaves as it is is never sent again, and
nothing stops the author from moving on. A message alone leaves the
relation lost the same way once the author presses "Continue" again
(walked, below).

Reach (the DOI and the summary over the word limit walked on OPS; the
rest read in the code and in the U21 walks linked):

- OPS "For Readers": the "License" form's "Other license URL"
  (`licenseUrl`, validated as `url`) is refused and gets the same
  window (walked under U21 A19).
- `main`, with the plain language summary on (off by default) and a
  section with an abstract word limit: the "Details" save of a summary
  over that limit (OJS, OPS) gets the same generic window
  ([U21 A16](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/issues/U21-A16-plain-summary-over-word-limit-refused.md)).
  The summary is a field of "Details", so the fix below shows the
  message there.
- No other wizard save is refused naming a field: in pkp-lib's
  `PKP\publication\Repository::validate()` and the OJS and OPS
  subclasses, every check that can refuse an in-progress submission's
  save is keyed on a field the save sends. A required summary was the
  one exception until `pkp/pkp-lib#13585`: it named
  `plainLanguageSummary` in saves of forms without that field (the
  "References" form on all three apps, OPS's "Relation status"). OMP's
  only wizard refusal, a Chapter Author's, is a 401 that names no field,
  so the fix keeps the generic window there (U21 A19).
- The autosave mixin has no other user (`lib/ui-library/src`,
  `lib/pkp/js`).

## Proposed fix

Two changes in ui-library's `SubmissionWizardPage.vue`:

1. In `autosaveErrored()`, when a 400 or 422 names only fields of the
   refused form, treat it as Form.vue does: put the errors on that
   form's `errors` (not the page-level `errors` that "Review" lists),
   open the form's step, and show the `form.errors` notice instead of
   the generic window. A refusal that names any field the form does not
   hold, and every other status, keeps the generic window as today.
2. Keep the author on that step until they change the form. The wizard
   records the refused form's id (`refusedForms`); `openStep()` will not
   move past a step holding such a form, and shows the notice again;
   `updateAutosaveForm()`, which every change of the form goes through,
   drops the id, so the changed form is sent again when the author moves
   on. The problems "Review" copies onto the forms (its `errors`
   watcher) do not hold the author, since they never enter the list.

The change needs U21 A19's fix (stay connected after a refusal), since
without it the wizard still hangs after the message, and it sits on the
lines that fix rewrites. The linked
[fix.diff](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/wizard-refused-doi-no-field-message/fix.diff)
therefore holds both, A19's change to `autosave.js` and
`autosaveErrored()` and this report's part, and applies to today's
`main` as it stands. The diff below is this report's part only, on top
of A19's change: its context line `this.isDisconnected = false;` is
A19's.

```diff
--- a/lib/ui-library/src/components/Container/SubmissionWizardPage.vue
+++ b/lib/ui-library/src/components/Container/SubmissionWizardPage.vue
+import {structuredErrors} from '@/composables/useForm';
@@ data()
 			staleForms: [],
+			/** An array of ids of forms whose last save the server refused, unchanged since. Default: `[]` */
+			refusedForms: [],
@@ autosaveErrored(), as U21 A19's fix leaves it: after the 403 return and the payload drop
 			this.isDisconnected = false;
+
+			// Field validation errors on fields of the refused form: show them
+			// there and take the author back to its step, as a form outside the
+			// wizard does (Form.vue error()). A refusal naming any other field
+			// keeps the error dialog.
+			let step;
+			let form;
+			this.steps.forEach((s) => {
+				s.sections.forEach((section) => {
+					if (section.type === 'form' && section.form.id === autosave.id) {
+						step = s;
+						form = section.form;
+					}
+				});
+			});
+			const fieldNames = form ? form.fields.map((field) => field.name) : [];
+			const errors =
+				[400, 422].includes(xhr.status) && xhr.responseJSON
+					? structuredErrors(xhr.responseJSON)
+					: {};
+			const names = Object.keys(errors);
+			if (names.length && names.every((name) => fieldNames.includes(name))) {
+				this.updateForm(autosave.id, {errors});
+				if (!this.refusedForms.includes(autosave.id)) {
+					this.refusedForms.push(autosave.id);
+				}
+				this.openStep(step.id);
+				pkp.eventBus.$emit(
+					'notify',
+					this.t('form.errors', {count: names.length}),
+					'warning',
+				);
+				return;
+			}
+
 			this.ajaxErrorCallback({});
@@ openStep(stepId)
 			if (!newStep) {
 				return;
 			}
+			// A form whose save the server refused holds the author on its step
+			// until they change it: moving on would leave the change unsaved.
+			const newIndex = this.steps.indexOf(newStep);
+			let refusedForm;
+			const heldStep = this.steps.slice(0, newIndex).find((step) =>
+				step.sections.some((section) => {
+					if (
+						section.type === 'form' &&
+						this.refusedForms.includes(section.form.id)
+					) {
+						refusedForm = section.form;
+						return true;
+					}
+					return false;
+				}),
+			);
+			if (heldStep) {
+				this.currentStepId = heldStep.id;
+				pkp.eventBus.$emit(
+					'notify',
+					this.t('form.errors', {
+						count: Object.keys(refusedForm.errors || {}).length || 1,
+					}),
+					'warning',
+				);
+				return;
+			}
 			this.currentStepId = stepId;
@@ updateAutosaveForm(formId, data)
 			this.updateForm(formId, data);
+			this.refusedForms = this.refusedForms.filter((id) => id !== formId);
```

Tried on `main` on OPS (2026-10-22). With the fix in, step 5 opens no
window: the author is back on "For Readers" with "This is not a valid
URL." under the box (marked invalid), the notice "The form was not saved
because 1 error(s) were encountered. …", the footer on "Last saved …"
and both "Save for Later" buttons enabled. No page error is logged.
Pressing "Continue" again with the box unchanged sends nothing, keeps
the author on "For Readers" and shows the notice again; so does the
step rail's "Review". Once the box holds the full address, "Continue"
saves it (200) and "Review" reads "This preprint has been published.".
A summary over the word limit on "Details" brings the author back to
"Details" the same way, with "The plain language summary is too long.
It should be 10 words or less. It is currently 19 words long." under
the summary.

Without the second change (the first only, as this report first
proposed), the second "Continue" sends nothing and moves on to
"Review", which reads "This preprint has not been published
elsewhere."; "Submit" completes the submission and the preprint's
"Relations" shows no answer. Without either change the wizard hangs as
U21 A19 describes.

The neighbour checks, the same with the fix in and out: the full address
on the same step is saved at once and "Review" shows "This preprint has
been published."; "Details", holding "This field is required." from
"Review"'s check, lets the author press "Continue" on to
"Contributors"; the "Relations" control is unchanged. The branch that
keeps the window for a refusal naming a field outside the form is not
reached on today's `main` (Reach above), so it was not walked.

**Alternatives**:

- Show the server's message inside the generic window: the author still
  has to find the box, and the window still says "reload the page",
  which loses the refused change.
- Put the refused form back on `staleForms`, so that every step change
  sends it again: the wizard's timer also sends stale forms once the
  last save is a minute old (`_runAutosaveJobs()`), so the refusal, and
  the jump back to the step, would come back every minute wherever the
  author is.
- Disable "Submit" while a form holds a refusal: the author reaches
  "Review" and finds "Submit" disabled with nothing on that step saying
  why.
- Stay on "Review" and list the refusal among its problems: "Review"
  checks the saved submission, which never held the refused value, so
  the refusal would have to be merged into its list by hand and would be
  cleared by the next check.
- Validate the address in the browser: covers this box only, and the
  server's rules would have to be copied into the client.

**What goes with it**:

- U21 A19's fix, carried in the linked diff.
- Editing the refused box clears its message, through the form's own
  field handling, and releases the hold.
- "Save for Later" is not held: it saves what was accepted and leaves
  the refused change unsaved, as the author has been told (read in the
  code, `saveForLater()`; not walked).
- Whether the box should accept a DOI written on its own is a separate
  question (spec U75 [A4](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U75-preprint-relations.md#a4)).
  This fix tells the author what the box wants either way.
- No stored data to repair, no REST API or plugin hook change.
- Backport: on `stable-3_5_0` the diff's import hunk does not apply,
  since 3.5 lacks the two import lines it uses as context;
  [fix-stable-3_5_0.diff](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/wizard-refused-doi-no-field-message/fix-stable-3_5_0.diff)
  is the same change against 3.5 and applies cleanly (not walked). On
  `stable-3_4_0` `autosaveErrored()` differs by a trailing comma, but
  3.4 has no `@/composables/useForm` and no `this.t`: a 3.4 backport
  passes `responseJSON` as it is, as 3.4's `Form.vue` does, uses
  `this.__('form.errors', …)`, and checks 400 only, the one status 3.4's
  `Form.vue` handles.
- Guard: vitests in ui-library: an autosave answered 400 with
  `{"vorDoi":[…]}` sets that form's `errors`, opens its step and opens
  no dialog; `openStep()` to a later step then stays put until the form
  changes; one answered 400 naming a field the form does not hold opens
  the dialog.

Medium: about seventy lines in one ui-library file, following Form.vue's
handling of the same answer, but the hold changes how the wizard's steps
behave, which the team should agree on, plus unit tests.

## Evidence

- Kept script:
  [walk.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/wizard-refused-doi-no-field-message/walk.js),
  run on an install loaded from the default dataset:
  `node bin/probe.js ops shared/playwright/checks/issues/wizard-refused-doi-no-field-message/walk.js`.
  `MODE=submit` takes the steps "Submitting after the refusal",
  `MODE=again` the second "Continue" with the box unchanged (then the
  rail's "Review" and "Submit" when offered), `MODE=neighbour` the
  full-address save, "Details" after "Review"'s check and the
  "Relations" control, and `MODE=wordlimit` a summary over the word
  limit on "Details" (the manager turns the summary on and gives
  "Preprints" a word count of 10).
- Walked 2026-10-22 on PostgreSQL: OPS `main` 5091e916d9 (pkp-lib
  1f415a07ca, ui-library e47a4887), the steps, "Submitting after the
  refusal" and the word-limit refusal; OPS `stable-3_5_0` 71ad98eb83
  (pkp-lib ce67d3f62b, ui-library 2576e00a), the steps and "Submitting
  after the refusal". pkp/datasets de96f3c2 (2026-10-21). The fix was
  tried on OPS `main` the same day: `MODE=again` with the first change
  alone, with `fix.diff` and without a fix; the steps and the word-limit
  refusal with `fix.diff`; the neighbour checks with `fix.diff` in and
  out. `fix.diff` applies to OJS, OMP and OPS `main` with
  `git apply --check`; `fix-stable-3_5_0.diff` to OPS `stable-3_5_0`.
- The 3.5 walk saw the same 400, window, "Review" panel and empty field
  message, and after the reload the same submission with no relation;
  its code read: `autosaveErrored()` and `openStep()` are identical to
  `main`'s, and `pages/submission/SubmissionHandler.php` puts
  `RelationForm` in the wizard with `vorDoi` validated as `url`
  (`schemas/publication.json`).
- The "Relations" control: `WorkflowPublicationRelationDropdownOPS.vue`
  on `main` and 3.5 sets its form's action to
  `submissions/{id}/publications/{id}`, the wizard's own endpoint, and
  the walk recorded that request. OPS `RelationForm::__construct()`
  takes only the action and starts both fields at `null`, which is why
  the wizard's step shows no answer after a reload.
- Reach on `main` (code): `PKP\publication\Repository::validate()` at
  1f415a07ca (required props passed to `ValidatorFactory::required()`
  with the summary only for a submission no longer in progress; the
  title check gated the same way; `urlPath`, `reviewRoundIds` and
  `coverImage` checked only when sent) and the OJS and OPS
  `APP\publication\Repository::validate()` (abstract checks only for a
  completed submission; the summary's word count and `issueId` only when
  sent). The `licenseUrl` refusal on OPS was walked under U21 A19, not
  with this fix.
- 3.4 (code): ui-library `origin/stable-3_4_0` ee684b34 has the same
  `autosaveErrored()`; OPS `upstream/stable-3_4_0` 47adbcd1e8 puts
  `RelationForm` in the wizard (`pages/submission/SubmissionHandler.php`)
  and validates `vorDoi` as `url`; pkp-lib 366030b017.
- 3.3 (code): ui-library `origin/stable-3_3_0` 96959f9e has no
  `SubmissionWizardPage`; OPS `upstream/stable-3_3_0` e265883ba4 asks for
  the relation only in the workflow's `RelationForm`, which is a regular
  form and shows field errors.
- Introduced: `git blame` on `autosaveErrored()` stops at 467034aa4,
  which created the method (7f13651e9 later reformatted one line).
- Unverified: the fix on OJS and OMP (their wizards share the file; not
  walked with it), the 3.5 diff in a walk, a 422 answer (no wizard save
  returns one today), and whether a DOI left in the box after the answer
  is switched to "not published elsewhere" is still sent and refused
  again.
