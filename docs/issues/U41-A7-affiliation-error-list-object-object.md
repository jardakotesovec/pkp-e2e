# A refused affiliation reads "Go to Affiliations: [object Object]" to screen-reader users of the contributor form

- **Severity** low
- **Effort** small
- **Kind** defect
- **Affects**
  - main: OJS, OMP, OPS
  - 3.5: OJS, OMP, OPS
  - 3.4: none (code; one "Affiliation" box per language)
  - 3.3: none (code; one "Affiliation" box per language)
- **Introduced** `pkp/pkp-lib#10880` for `pkp/pkp-lib#7135` · [c680b5a27d](https://github.com/pkp/pkp-lib/commit/c680b5a27d86fd9e9f7d6a9603d1ae6a52eb088e) · 2025-02-03 · Bozana Bokan (bozana)
- **Upstream** none found (2026-10-08)
- **Tracked in** spec U41 [A7](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U41-contributors-and-affiliations.md#a7)
- **Checked** 2026-10-08, each branch's tip (the commits in Evidence)
- **Model** claude-opus-5-5

Update 2026-10-08: a second way to the same entry is added (the second
Steps): an institution named in a language the journal has since
stopped taking. There the form shows no reason at all, which is a
fault of its own and is not covered here.

## Summary

When a contributor's "Save" is refused because an institution entered
by hand has no name in the submission's language, the error list a
screen reader reads at the form's foot says "Go to Affiliations:
[object Object]" instead of the reason. Every other field's entry reads
its message ("Go to Given Name: This field is required.").

Sighted users are not affected: the list is not drawn on screen, the
foot shows "Please correct one error." and the reason is printed under
the institution's name box.

Any journal can meet this, with one language or several: the name box
only has to be emptied. The list says the same when the institution
holds a name in a language the journal has since stopped taking for
submission metadata. That save is refused with no reason shown to
anyone, so "[object Object]" is all a screen reader is told.

## Impact

- **Lost**: no data or work.
- **Who**: screen-reader users of the contributor form, in the workflow
  ("Edit", "Add Contributor") and on the submission wizard's
  "Contributors" step, in two cases. First, an institution typed in by
  hand (not picked from the ROR registry) is saved with its name box
  for the submission's language emptied, on any journal. Second, such
  an institution holds a name in a language the journal has since
  removed from its submission metadata languages, and nothing else in
  the submission is written in that language: every save of that
  contributor is then refused.
- **Way round**: in the first case the message under the institution's
  name box gives the reason. "Go to Affiliations" scrolls there but
  leaves focus where it was, as every entry of the list does, so a
  screen-reader user has to move to the box to hear it. In the second
  case the form offers none: it shows no message and no box for that
  language.

Low: nothing is lost, and in the first case the reason is on the form.
In the second case the save fails for a cause of its own: a correct
entry would tell the reason and the save would still be refused. Were
that refusal counted here, this would be medium.

## Steps to reproduce

Preconditions:

- PKP's default test dataset for `main` (`publicknowledge`), which
  takes English and French (Canada) for submission metadata. Each app
  has a submission whose contributor holds one institution entered by
  hand (not from the registry), named in English only:
  - OJS: submission 7, "Developing efficacy beliefs in the classroom",
    contributor "Domatilia Sokoloff", "University College Cork".
  - OMP: submission 1, "The ABCs of Human Survival: A Paradigm for
    Global Citizenship", contributor "Arthur Clark", "University of
    Calgary".
  - OPS: submission 1, "The influence of lactation on the quantity and
    quality of cashmere production", contributor "Carlo Corino",
    "University of Bologna".

The error list is not drawn on screen: hear it with a screen reader, or
read it in the browser's accessibility tree (developer tools), under
"Please correct one error." at the form's foot.

The name box emptied:

1. Sign in as `dbarnes`.
2. Open the submission's workflow.
3. In the side menu, open "Publication" › "Contributors" ("Preprint" ›
   "Contributors" on OPS).
4. On the contributor's row, press "Edit".
5. Under "Affiliations", on the institution's row, press the "⋯"
   button (a screen reader names it "Click to edit or delete"), then
   "Edit institution name".
6. Clear the box "Type the institution name in English".
7. Press "Save".

**Expected**: the save is refused, and the error list reads "Go to
Affiliations: Please provide affiliation name in the submission primary
locale."

**Observed**: the save is refused and the form stays open. Under the
emptied box: "Please provide affiliation name in the submission primary
locale.". The foot shows "Please correct one error." and "Jump to next
error"; the error list holds one button:

```
- text: Please correct one error.
- list:
  - listitem:
    - button "Go to Affiliations: [object Object]"
- button "Jump to next error"
```

The request answers 400 with:

```json
{"affiliations":[{"name":{"en":["Please provide affiliation name in the submission primary locale."]}}]}
```

On the same form, clearing the English "Given Name" and the "Country"
instead lists "Go to Given Name: This field is required." and "Go to
Country: This field is required.".

A name in a language the journal no longer takes (on a fresh dataset):

1. Take steps 1 to 5 above.
2. Type "u41ir1 nom" into the box "Type the institution name in French
   (Canada)" and press "Save". The contributor is saved.
3. Open Settings › Website › "Setup" › "Languages". Under "Submission
   Languages", on the row "French (Canada)/français (Canada)", untick
   "Metadata". "Submissions" on that row unticks with it.
4. Open the submission's workflow and "Contributors" again, and press
   "Edit" on the contributor. The institution's row reads "All
   translations available".
5. On the institution's row, press "⋯", then "Edit institution name":
   there is one box, "Type the institution name in English", holding
   the name.
6. Change nothing and press "Save".

**Expected**: if the save is refused, the error list reads "Go to
Affiliations: This language is not accepted."

**Observed**: the save is refused and the form stays open, with the
notice "The form was not saved because 1 error(s) were encountered.
Please correct these errors and try again.". No message is shown under
"Affiliations" or anywhere else on the form. The foot and the error
list are as above, the one button "Go to Affiliations: [object
Object]". The request answers 400 with:

```json
{"affiliations":[{"name":{"fr_CA":["This language is not accepted."]}}]}
```

## Cause

The list is ui-library's `FormErrors.vue`, `errorList()`. For each
field it fills "Go to {$fieldLabel}: {$errorMessage}" (`form.errorA11y`)
with a message it reads one level deep. When the field's errors are an
object, and a JavaScript list is one too, it takes the value under the
first key: the first message of a list (`["This field is required."]`),
or the first language's messages of a multilingual field
(`{"en": ["…"]}`). Only a bare string reaches the other branch.

Since multiple affiliations came in (`pkp/pkp-lib#7135`, PR
`pkp/pkp-lib#10880`), the contributor endpoints
(`PKPSubmissionController::addContributor()` and `editContributor()`)
return each affiliation's errors under its place in the list,
`$newAffiliationErrors['affiliations'][$position]`, so that
`FieldAffiliations.vue` can show the message on the right row
(`errors?.[affiliationIndex]?.name`). One level deep, `errorList()`
gets the first row's whole error object (`{"name": {"en": […]}}`), and
`t('form.errorA11y', …)` turns that object into the text "[object
Object]". No other field of the contributor form nests its errors
deeper than a language.

Reach:

- The workflow's "Edit" (the Steps), the workflow's "Add Contributor"
  and "Add Contributor" on the submission wizard's "Contributors" step
  (both walked, on `main` and 3.5): all one `ContributorForm`, the only
  form with an "Affiliations" field.
- Of the refusals in `Affiliation\Repository::validate()` the form
  reaches two. A cleared name is refused under the submission's
  language (the first Steps). "Please provide a ROR affiliation or at
  least one affiliation name." needs a request with no name at all, and
  the form always sends a name for each of its languages, empty or not
  (`getNewAffiliationTemplate()`, `updateAffiliationName()`). The
  `authorId` refusal and a `ror` that fails the schema's pattern need
  values the form never sends (code).
- "This language is not accepted." is the second Steps.
  `FieldAffiliations.vue` draws a name box only for the form's
  languages (`v-if="supportedLocales.includes(affiliationNameLocale)"`)
  but sends each row's `name` whole (`...affiliation.name`), and
  `affiliation/maps/Schema.php` hands it every stored name of an
  institution without a ROR (`getAffiliationName(null, $locales)`
  returns `getData('name', null)`). `validate()` allows only
  `$submission->getPublicationLanguages($context->getSupportedSubmissionMetadataLocales())`:
  the journal's languages and those of the publications' and authors'
  own fields, not those of affiliation names. So the refusal needs a
  submission with nothing else in the removed language.
- That the second Steps' save is refused, with no box to show the
  reason under, is a fault of its own: the form sends names it does not
  show, and `validate()` refuses names already stored. It has its own
  fix and is not covered by this report.
- A funder's "Funder Grants" (`FunderEditForm`), on `main` only (the
  funder classes and `FieldFunderGrants.vue` are not on
  `stable-3_5_0`) and only with "Enable Grant ID validation." ticked
  (`funderGrantValidation`, off unless set): for a funder on
  `funder/Repository::AWARD_FUNDERS` (the Research Council of Finland,
  the European Commission and others), a grant number zenodo.org does
  not know is refused under `grants.{n}.grantNumber`, so its entry
  would read "Go to Funder Grants: [object Object]" (code). When
  zenodo.org does not answer, the check is skipped and nothing is
  refused.
- `FormErrors.vue`, `showError()`, makes the same guess: for an error
  object (`constructor === Object`) it asks the form to show the first
  key as a language. A refused first row makes `affiliations` a JSON
  array, which that condition skips, as in both Steps. Only when the
  first row is valid and a later one is refused does the object arrive
  as `{"1": …}`. `Form.vue`, `showLocale()`, then sets the visible
  languages to the primary one and "1", which closes any other
  language the user had open (code; not walked). It is left out of the
  fix below as another method with another symptom, needing a contributor
  with two hand-entered institutions to see.

## Proposed fix

Read the first message at any depth in `FormErrors.vue`, so the list
works for every field whose errors are keyed by language, by entry, or
both
([fix.diff](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/affiliation-error-list-object-object/fix.diff)):

```diff
--- a/lib/ui-library/src/components/Form/FormErrors.vue
+++ b/lib/ui-library/src/components/Form/FormErrors.vue
@@ -59,22 +59,33 @@
 			return Object.keys(this.errors).map((fieldName) => {
 				const field = this.fields.find((field) => field.name === fieldName);
 				const label = field ? field.label : fieldName;
-				let errorMessage;
-				if (
-					this.errors[fieldName] !== null &&
-					typeof this.errors[fieldName] === 'object'
-				) {
-					errorMessage =
-						this.errors[fieldName][Object.keys(this.errors[fieldName])[0]];
-				} else {
-					errorMessage = this.errors[fieldName];
-				}
-				return {fieldName: fieldName, label: label, message: errorMessage};
+				return {
+					fieldName: fieldName,
+					label: label,
+					message: this.firstMessage(this.errors[fieldName]),
+				};
 			});
 		},
 	},
 	methods: {
 		/**
+		 * Get the first message of a field's errors
+		 *
+		 * A field's errors are a list of messages. They are keyed by locale for a
+		 * multilingual field, and by entry for a field that holds a list of
+		 * entries, such as a contributor's affiliations.
+		 *
+		 * @param {Array|Object|String} error
+		 * @return {String}
+		 */
+		firstMessage(error) {
+			if (error !== null && typeof error === 'object') {
+				return this.firstMessage(Object.values(error)[0]);
+			}
+			return error;
+		},
+
+		/**
 		 * Emit an event to display the next error in the list
 		 */
 		showNextError() {
```

Tried on OJS, OMP and OPS `main` with the first Steps: the list read
"Go to Affiliations: Please provide affiliation name in the submission
primary locale.". With and without the fix, "Go to Given Name: This
field is required." and "Go to Country: This field is required." read
the same. Not tried with the second Steps: by the code the method
returns "This language is not accepted." there.

**Alternatives**

- Flatten the affiliation errors on the server: `FieldAffiliations.vue`
  needs the position to put the message on its row, and the REST API's
  error shape would change for its clients.
- Handle "affiliations" by name in `FormErrors.vue`: leaves "Funder
  Grants" on `main` and any later list field with the same fault.

**What goes with it**

- One change of behaviour: a multilingual field with two messages in
  its first language read both, joined by a comma; it now reads the
  first, as a field without languages already did.
- The second Steps need more than this change: with it a screen reader
  is told "This language is not accepted." while the form still shows
  sighted users no reason and offers no box to correct. That refusal
  is the other fault named in the Cause.
- Backport: the diff applies to `stable-3_5_0` as written.
- Guard: an end-to-end check that takes the first Steps and reads the
  list's entry.

Small: one method in one ui-library component, and an end-to-end
check.

## Evidence

- The kept script
  [walk.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/affiliation-error-list-object-object/walk.js)
  (helpers in `lib.js` beside it) records the save's answer, the foot's
  error box (its text, the screen-reader list's buttons, whether each
  is drawn, its aria snapshot) and the field's text. Its modes: `steps`
  is the first Steps and `dropped` the second; `add` is the workflow's
  "Add Contributor" as `dbarnes` on the Steps' submission, and `wizard`
  "Add Contributor" on the "Contributors" step of a submission the
  app's author starts (OJS `dsokoloff`, OMP `aclark`, OPS `ccorino`),
  both with an institution typed in by hand and its English name
  cleared; `nb` clears Given Name and Country instead (the control);
  `goto` presses the list's button and records focus and scroll.
- It runs in the pkp-e2e repository on an install freshly loaded from
  the default dataset (`docs/process/harness.md`, "Dataset fleets",
  sets one up and gives `<feature>`; `<id>` names the output folder):
  `PROBE_FEATURE=<feature> PROBE_AGENT=<id> node bin/probe.js all shared/playwright/checks/issues/affiliation-error-list-object-object/walk.js [steps|dropped|add|wizard|goto|nb]`.
- Dataset: pkp/datasets a130b9a (2026-10-07), PostgreSQL. Not heard
  with a screen reader: the list was read from the accessibility tree.
- Walked 2026-10-08 on `main` and `stable-3_5_0`, OJS, OMP and OPS,
  each mode on a fresh load: `steps`, `add` and `wizard` gave the first
  Steps' answer and list, `dropped` the second Steps'. In `dropped`
  the stored names read `en=…;fr_CA=u41ir1 nom` before and after the
  refused save.
- A journal with one language: not walked on the dataset, which has
  two. `validate()` asks for the name in the submission's language
  whatever the journal's languages are (code), and
  [i07b.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/U41/I07b/i07b.js)
  (phase `l42`, a journal with English alone, `main`, 2026-10-07) saw
  the same refusal and the same button there.
- Not walked for the second Steps: a submission that also holds a
  title or a contributor's name in the removed language (by the code
  the language stays allowed and the save goes through), the fix, and
  any way round, such as removing the institution and adding it again.
- Walked on 2026-10-03 and not again: `goto` on `main`, all three
  apps. After the press the "Affiliations" field was in view and focus
  had not moved; `Form.vue`'s `showField()`, which every entry calls,
  only scrolls (code). The report of spec U59 A6
  ([jump-to-next-error](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/issues/U59-A6-jump-to-next-error-stays-on-first-field.md))
  describes the same for "Jump to next error".
- The fix was tried on 2026-10-03, with `steps`, and with `nb` with the
  fix in and out. `FormErrors.vue` and `FieldAffiliations.vue` have no
  commit since that day's ui-library tips (`main`: OJS 64d67363, OMP
  and OPS 280f98c5; 3.5: d4e01883); the backport was checked with
  `patch --dry-run` at today's tips.
- A refused "Add Contributor" also leaves the contributor saved. That
  is another fault, spec U41
  [A24](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U41-contributors-and-affiliations.md#a24),
  which the `add` and `wizard` walks did not look at.
- Tips: OJS `main` a7f55c18f6 (lib/pkp 151e6e9d69), OMP `main`
  084a19cc65 and OPS `main` 3a40dc2773 (lib/pkp 63cf1497b4),
  lib/ui-library ea5061b0 on all three; `stable-3_5_0` OJS 0c91dcce4e
  (lib/pkp 32fcca27bb), OMP b4a9bc4447, OPS 06fb5874df (lib/pkp
  08de256986), lib/ui-library 10a96e33 on all three; `stable-3_4_0` OJS
  3860995c47 (pkp-lib c40f5f8b93, ui-library ee684b34); `stable-3_3_0`
  OJS 8f0d94db4e (pkp-lib 154794f05d, ui-library 96959f9e).
- Code reads: on `stable-3_5_0`, `FormErrors.vue` matches `main`,
  `PKPSubmissionController` nests affiliation errors the same way
  (c680b5a27d is on the branch), and `FieldAffiliations.vue`
  (`...affiliation.name`, the `supportedLocales` test) and
  `validate()`'s allowed languages read as on `main`. On
  `stable-3_4_0`, `ContributorForm` has one multilingual
  `FieldText('affiliation')`, whose errors are a language map the list
  reads, and pkp-lib adds no error nested by entry. On `stable-3_3_0`,
  contributors are edited in the older `PKPAuthorForm`
  (`authorForm.tpl`, one "Affiliation" box per language), which has no
  `FormErrors`.
- Introduced: `git blame` on the two `$newAffiliationErrors['affiliations'][$position]`
  lines in `PKPSubmissionController` gives c680b5a27d (Bozana Bokan,
  "Multiple author affiliations (Ror) - changes and fixes"); the
  feature's first commit, d7c67a46fe (GaziYucel), returned an
  affiliation's errors unnested. Both are in PR `pkp/pkp-lib#10880`
  (bozana, merged 2025-02-06). `errorList()`'s message read dates from
  ui-library 7496b3c2 (2018-10-23, Nate Wright), the first forms.
- Upstream search (2026-10-03): pkp/pkp-lib, pkp/ui-library, pkp/ojs,
  pkp/omp and pkp/ops for "object Object", "Go to Affiliations", "Jump
  to next error", `FormErrors`, `errorList`, `errorA11y` and the
  affiliation message. Again on 2026-10-08, pkp/pkp-lib and
  pkp/ui-library for "object Object" (with "affiliation" on pkp-lib),
  "Go to Affiliations", `FormErrors` with `errorList`, and `errorA11y`:
  no match. PR `pkp/ui-library#934` ("Improve form validation
  accessibility"), still open, moves focus to the error box and leaves
  `errorList()` as it is.
