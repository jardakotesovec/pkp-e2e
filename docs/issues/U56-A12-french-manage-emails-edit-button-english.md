# In any language but English, every email's button on "Manage Emails" reads "Edit"

- **Severity** low
- **Effort** small
- **Kind** defect
- **Affects**
  - main: OJS, OMP, OPS
  - 3.5: OJS, OMP, OPS
  - 3.4: OJS, OMP, OPS (code)
  - 3.3: none (code; no "Manage Emails" page, and its email template list translates "Edit")
- **Introduced** `pkp/pkp-lib#8407` for `pkp/pkp-lib#5716` · [1a7fbb216f](https://github.com/pkp/pkp-lib/commit/1a7fbb216faff64f262d5ac14f263ea70f7ae6f5) · merged 2022-11-30 · Nate Wright (NateWr)
- **Upstream** none found (2026-10-21)
- **Tracked in** spec U56 [A12](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U56-emails-management.md#a12)
- **Checked** 2026-10-21, each branch's tip (the commits in Evidence)
- **Model** claude-opus-5-5

## Summary

A manager who works in French (Canada) opens "Gérer les courriels"
and finds every email's button labelled "Edit", in English, beside the
French names and descriptions; it should read "Modifier". It is the
only English word on the page.

The word is written into the page's template rather than looked up in
the language files, so every interface language other than English
shows "Edit" there too; French (Canada) is the language walked.

## Impact

- **Lost**: nothing; one English word on every row of the list (66
  rows on a journal, 56 on a press, 17 on a preprint server).
- **Who**: every manager who uses the interface in a language other
  than English, each time they open "Manage Emails".
- **Way round**: none needed; the button opens the email as it does in
  English.

Low: a label left in English while the task gets done.

## Steps to reproduce

Preconditions:

- PKP's default test dataset for `main` (OJS, OMP or OPS). Its
  `publicknowledge` offers French (Canada) as an interface language.
  Nothing is created.

1. Sign in as `rvaca`.
2. In the user menu (top right), choose the French (Canada) language.
3. Open "Paramètres" › "Flux des travaux", the "Courriels" tab, and
   follow its link "Ajouter et modifier les gabarits"
   (`/index.php/publicknowledge/fr_CA/management/settings/manageEmails`).
   The page opens headed "Gérer les courriels".
4. Read the button at the end of any row, for example "Confirmation
   de soumission".

**Expected.** Every row's button reads "Modifier", the French word the
interface uses for "Edit" elsewhere.

**Observed.** Every row's button reads "Edit" (66 rows on the journal,
56 on the press, 17 on the preprint server). A screen reader names the
same button in French: "Modifier" followed by the email's name, for
example `button "Modifier Confirmation de soumission"`.

Control: the same page in English reads "Edit" on every row.

## Cause

The row button of `lib/pkp/templates/management/manageEmails.tpl`
writes its visible word as a literal, never looked up in a language
file, beside a screen-reader text that is translated:

```html
<pkp-button @click="openMailable(item)">
	<span aria-hidden="true">Edit</span>
	<span class="-screenReader">{{ t('common.editItem', {ldelim}name: item.name{rdelim}) }}</span>
</pkp-button>
```

The literal has been there since the template was written for the new
"Manage Emails" page of `pkp/pkp-lib#5716`, where the screen-reader line
already read `{{ __('common.editItem', …) }}`; the Vue 3 move
(da352e49d8) only renamed `__()` to `t()`.

Reach:

- Every app and every interface language: the template is pkp-lib's
  and no app overrides it (read in the code; walked in French (Canada)
  on the three apps).
- No other template of pkp-lib, OJS, OMP or OPS writes a bare English
  word as a button's text (searched `*.tpl` for button and span text
  outside `{translate}` and `{{ }}`).
- 3.3's email template list (ui-library `EmailTemplatesListItem.vue`)
  printed `__('common.edit')`, so this page lost a translation the
  earlier one had.
- The rest of the French page is French, apart from texts tracked
  elsewhere: the ORCID emails listed under code names (OJS and OMP,
  [pkp-e2e#865](https://github.com/jardakotesovec/pkp-e2e/issues/865))
  and a few emails whose French name and description are not yet
  translated.

## Proposed fix

Print the word through a translation key, as the same template labels
its "Reset All" button with `{translate key="manager.emails.resetAll"}`
([fix.diff](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/french-manage-emails-edit-button-english/fix.diff),
against an app root):

```diff
--- a/lib/pkp/templates/management/manageEmails.tpl
+++ b/lib/pkp/templates/management/manageEmails.tpl
@@ -42,7 +42,7 @@
 		</template>
 		<template #item-actions="{ldelim}item{rdelim}">
 			<pkp-button @click="openMailable(item)">
-				<span aria-hidden="true">Edit</span>
+				<span aria-hidden="true">{translate key="common.edit"}</span>
 				<span class="-screenReader">{{ t('common.editItem', {ldelim}name: item.name{rdelim}) }}</span>
 			</pkp-button>
 		</template>
```

Every pkp-lib language that translates `common.editItem` also
translates `common.edit` (checked in `locale/*/common.po`).

Tried on `main`, OJS, OMP and OPS: with the diff in, every row of the
French page reads "Modifier" and still opens the email ("Modifier le
gabarit"); the English page reads "Edit" on every row, with the diff in
and out.

**Alternatives**

- `{{ t('common.edit') }}`, the client-side lookup the screen-reader
  line beside it uses, works as well: `common.edit` is in
  `registry/uiLocaleKeysBackend.json` of OJS, OMP and OPS on `main` and
  `stable-3_5_0`. Not tried. `{translate}` is recommended only because it
  was tried and does not depend on that key list.

**What goes with it**

- Backport: the diff applies to `stable-3_5_0` as written. On
  `stable-3_4_0` the line is the same but the lines around it differ
  (`v-slot:item-actions`, `__()`), so the one-word change is made by
  hand there.

Small: one line in one template.

## Evidence

- Kept script:
  [walk.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/french-manage-emails-edit-button-english/walk.js)
  (helpers in its `lib.js`), run with
  `node bin/probe.js all shared/playwright/checks/issues/french-manage-emails-edit-button-english/walk.js`
  on PKP's default dataset; with the argument `neighbour` it reads the
  English page and opens an email from the French one, the check run
  with the fix in and out.
- Walked on `main` and `stable-3_5_0`, OJS, OMP and OPS, PostgreSQL,
  pkp/datasets 5f247d04 (2026-10-20). Tips, `main`: OJS 3109a59114,
  OMP 5777025be, OPS f048e747b4 (lib/pkp f37a174626 in OJS, 042726ebf6
  in OMP and OPS). `stable-3_5_0`: OJS 1e78ca0c2b, OMP cce424e5e, OPS
  5eca7fd603 (lib/pkp 68512b5fda); there the lists hold 67, 57 and 18
  rows, every button "Edit". No request failed and no page script
  failed.
- 3.4, code: `templates/management/manageEmails.tpl` on pkp-lib
  `stable-3_4_0` (85f47442cf) has the same literal at line 43. 3.3,
  code: pkp-lib `stable-3_3_0` (867ce82d8e) has no `manageEmails.tpl`;
  the email templates list of ui-library `stable-3_3_0` prints
  `__('common.edit')`.
- Introduced: `git blame` on the line gives 1a7fbb216f (PR
  `pkp/pkp-lib#8407`); at that commit the screen-reader line already
  used `__('common.editItem', …)`.
- Not walked: interface languages other than French (Canada).
