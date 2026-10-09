# In French, the template search for a new task or discussion is labelled "find an email template"

- **Severity** low
- **Effort** small
- **Kind** defect
- **Affects**
  - main: OJS, OMP, OPS (in French (Canada) and French)
  - 3.5: none (no template search when adding a discussion)
  - 3.4: none (code; no template search when adding a discussion)
  - 3.3: none (code; no such text)
- **Introduced** `pkp/ui-library#655` for `pkp/pkp-lib#11291` · [bc9a03b9](https://github.com/pkp/ui-library/commit/bc9a03b9fc1aaa8bcba51879e10b5d487d2f4c2d) · 2025-07-30 · Blesilda Biazon (blesildaramirez); it reused the email composer's search label for a second kind of template, and the French wording dates from 2023
- **Upstream** none found (2026-10-09)
- **Tracked in** spec U37 [A15](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U37-tasks-and-discussions.md#a15)
- **Checked** 2026-10-09, each branch's tip (the commits in Evidence)
- **Model** claude-opus-5-5

## Summary

With the interface in French (Canada), the window that "Add" opens in a
stage's Tasks & Discussions panel has a search box over its templates
that reads "Trouver un modèle de courriel" ("find an email template").
In English it reads "Find Template". The templates it searches are task
and discussion templates, not email templates, so the label names the
wrong thing. The "Edit" window of a task or discussion draws the same
box.

The search itself works as in English. The same French text is right
where it was first used, on the template search of an email's composer.

French (`fr`) has the same words in its translation file. The 39 other
languages that translate the text keep it neutral.

The fix is a new French translation of one text, with no code change:
work for the French translators on Weblate, or a two-line change to
the two French files on `main` and `stable-3_5_0`.

## Impact

- **Lost**: nothing.
- **Who**: anyone working in French who adds or edits a task or
  discussion: editors, assistants and authors.
- **Way round**: none is needed.

Low: wording alone, and the task gets done.

## Steps to reproduce

Preconditions:

- The default dataset, OJS, OMP or OPS `main`. Its journal, press and
  preprint server offer English and French (Canada).

The submission is at Production: OJS submission 5, "Genetic
transformation of forest trees"; OMP submission 4, "How Canadians
Communicate: Contexts of Canadian Popular Culture"; OPS submission 1,
"The influence of lactation on the quantity and quality of cashmere
production".

1. Sign in as `dbarnes`. In the user menu (top right), under "Change
   Language", choose "français".
2. Open the submission's workflow at Production:
   `/index.php/publicknowledge/fr_CA/dashboard/editorial?workflowSubmissionId=5&workflowMenuKey=workflow_5`
   on OJS, `workflowSubmissionId=4` on OMP and `workflowSubmissionId=1`
   on OPS (`workflow_5` is the Production stage in all three).
3. In the panel "Discussions sur la production" press "Ajouter" (its
   "Add" button). [On the preprint server the panel's heading is an
   untranslated key, "##submission.queries.production##".]
4. Read the search box over the window's list of templates.
5. Type `Production` into it and press Enter.

**Expected**: the box asks for a template without naming a kind, as
"Find Template" does in English: "Trouver un modèle".

**Observed**: the box's placeholder, and its name for a screen reader,
read:

```
Trouver un modèle de courriel
```

Step 5 lists the stage's task and discussion templates that hold the
word (on the journal "Prêt pour production", "Assigner un-e
rédacteur-trice" and "Discussion (production)").

## Cause

ui-library's `DiscussionManagerTemplates.vue` (line 13) labels its
search box with the text `common.findTemplate`.

That text came with the email composer (`pkp/pkp-lib#7265`): the
decision page (`templates/decision/record.tpl`) hands it to
`Composer.vue` as the label of the search under "Email Templates". Its
English is neutral, "Find Template". French (Canada) translated it on
Weblate in 2023 as "Trouver un modèle de courriel", which fitted its
only use then, and French (`locale/fr/common.po`) has the same words.

bc9a03b9 (`pkp/ui-library#655`) reused the text for the search over the
task and discussion templates. There the French names a kind of
template the box does not list.

The listed templates carry familiar names because a stage's default
discussion templates were email templates until `main` moved them into
task and discussion templates (`I12593_EmailToTaskTemplates`,
`pkp/pkp-lib#12593`). The box reads them from `editTaskTemplates`, not
from the email templates.

Reach:

- The "Add" and "Edit" windows of every stage's Tasks & Discussions
  panel build the same form (`useDiscussionManagerForm.js`) with this
  search. "Add" was driven on screen at Production; "Edit" was read in
  the code.
- French (Canada), `lib/pkp/locale/fr_CA/common.po`, driven on screen,
  and French, `lib/pkp/locale/fr/common.po`, read in the file (the
  default dataset does not install it).
- No other language adds a word for email. Of the 55 language folders
  that hold the text, 13 leave it empty and 39 besides English and the
  two French ones translate it (each `common.po` was read; in scripts
  this report's writer cannot read, only the word for email was looked
  for).
- The text's other uses are all email composers. On two of them the box
  sits under the heading "Email Templates", in French "Modèles de
  courriel": the decision page (driven on screen in French) and the
  invitation's email step (`UserInvitationEmailComposerStep.vue`, read
  in the code). On the third, the author response request
  (`RequestReviewRoundAuthorResponse.vue`, read in the code), the
  heading is "Templates to get you started!", which French does not
  have yet.

## Proposed fix

Translate the text again in French (Canada) and French, neutral like
the English and the other languages:

```diff
 msgid "common.findTemplate"
-msgstr "Trouver un modèle de courriel"
+msgstr "Trouver un modèle"
```

No code changes. The neutral text is right on the task and discussion
window, and on the decision page and the invitation's email step it
sits under "Modèles de courriel". On the author response request no
heading says "courriel"; the box reads there as it does in English.

Who makes the change, and where:

- On Weblate, by the French translators. Weblate's commits are merged
  into `stable-3_5_0`, and `main` gets them when PKP copies that
  branch's translations onto it (63945bbd82 is such a copy).
- Or in pull requests against the two files, one per branch. PKP's
  developers do change translation files that way: `pkp/pkp-lib#13418`
  did on `main`, with a commit of its own on `stable-3_5_0`
  (d9fa8be9c7).
- The fault shows on `main` only, but a change made on `main` alone
  would leave Weblate's branch with the old words, and a later copy
  could bring them back (a guess; not tried). So `stable-3_5_0` needs
  the change too.

Either way the new text also shows on 3.5, on the email composers,
where it is still right.
[fix.diff](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/add-window-template-search-french-email-template/fix.diff)
is the two files changed, against an app root, for trying it.

Tried on `main`, all three apps: step 4 then read "Trouver un modèle",
and step 5 listed the same templates. A second check ran with and
without the fix. In French, the decision page's composer read "Trouver
un modèle" under "Modèles de courriel" with the fix and "Trouver un
modèle de courriel" without it, and its search listed templates both
times. In English, the composer's box and the "Add" window's box read
"Find Template" both times.

**Alternatives**

- A text of its own for the task and discussion templates' search. All
  languages would need a new translation, and all but the two French
  ones are right today.

**What goes with it**

- No stored data is wrong.
- Branches: `stable-3_5_0` and `main`, by the route above. 3.4 needs
  nothing: the text labels email composers alone there, so its French
  is right.
- Guard: no unit test fits a translation. An end-to-end check of the
  "Add" window in French would catch it; pkp-e2e's suite for these
  screens has none yet.

Small: one text in two French files, with no code and no data to
repair.

## Evidence

- Kept script:
  [walk.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/add-window-template-search-french-email-template/walk.js)
  takes the Steps on OJS, OMP and OPS, then reads the same box in
  English ("Find Template"). With `neighbour` after the path it runs
  the second check alone (a decision's email composer, in English and
  in French, at `decision/record/{submission}?decision=29`, on OPS
  `decision=8`). It runs from a pkp-e2e checkout, on an install freshly
  loaded from the default dataset:
  `PROBE_FEATURE=<feature> PROBE_AGENT=<id> node bin/probe.js all shared/playwright/checks/issues/add-window-template-search-french-email-template/walk.js`
  (`PKP_E2E_LINE=stable-3_5_0` in front for 3.5).
- Walked on `main` and `stable-3_5_0`, on PostgreSQL, from pkp/datasets
  1a196c3 (2026-10-08); the fault does not depend on the database. No
  request failed and no script error showed.
- In French the same window also shows untranslated keys
  ("##discussion.form.templatesLabel##" over the box,
  "##discussion.name## - …" on each template button, and the preprint
  server's panel heading "##submission.queries.production##"). Those
  are texts French does not have yet, and no part of this report.
- `stable-3_5_0`, walked on the three apps in French: the stage shows
  the legacy discussions grid, and its "Ajouter une discussion" form
  lists its prepared messages under "Choisir un message prédéfini à
  utiliser ou remplir le formulaire ci-dessous." with no search box.
  The decision page's composer reads "Trouver un modèle de courriel"
  under "Modèles de courriel", which is right there. In the code, the
  text is used by `templates/decision/record.tpl` and ui-library's
  `Composer.vue` and `UserInvitationEmailComposerStep.vue` alone.
- 3.4 and 3.3 were read in the code. `stable-3_4_0`: the text is in
  `locale/en` and `locale/fr_CA` (the same French) and is used by
  `templates/decision/record.tpl` and `Composer.vue` alone; ui-library
  has no `DiscussionManager`. `stable-3_3_0`: neither `locale/en_US` nor
  `locale/fr_CA` has `common.findTemplate`.
- Branch tips: OJS `main` 6d5b793c4e (lib/pkp d1bc3a9ecc), OMP `main`
  57a9235110 and OPS `main` fd78a0bcd8 (lib/pkp 27938abd4c),
  lib/ui-library 38814ea1 in all three; the two French files are the
  same in the two lib/pkp tips. `stable-3_5_0`: OJS c6e2c3a879 (lib/pkp
  d702d012dd), OMP ddc6abf5a9, OPS dc8a938ab0 (lib/pkp 8094f06bf5),
  lib/ui-library 2576e00a. `stable-3_4_0`: pkp-lib 8bf0ab5072,
  ui-library ee684b34. `stable-3_3_0`: pkp-lib 8c5b3f7f5c.
- Other code reads on `main`: `Search.vue` (the label is the box's
  placeholder and its screen-reader text); each composer's
  `load-template-label` (`common.emailTemplates` in
  `templates/decision/record.tpl` and
  `UserInvitationEmailComposerStep.vue`, `discussion.form.templatesLabel`
  in `RequestReviewRoundAuthorResponse.vue`); the names of the two
  French languages in `lib/pkp/lib/weblateLanguages/languages.json`
  ("French", "French (Canada)").
- The history of the text: it came with the email composer (f75706ba57,
  `pkp/pkp-lib#7265`). The French (Canada) line is d023d1021d
  (2023-04-24, "Translated using Weblate (French (Canada))"). The French
  line reached its file on `main` with 63945bbd82 (2026-09-18, a copy
  of Weblate's `stable-3_5_0` translations). `git log -S common.findTemplate -- src/managers`
  in ui-library gives bc9a03b9, the header's commit, as the first use
  on the task and discussion window.
- The route of a translation, read in pkp-lib's log: on `stable-3_5_0`
  the commits titled "Merge remote-tracking branch
  'translations/stable-3_5_0' into stable-3_5_0" are merges with two
  parents (6acb1be2eb, 2026-09-18); on `main` commits of the same title
  have one parent and are on `main` alone (63945bbd82). f8285b0b8f
  (`pkp/pkp-lib#13418`) changes 54 language files on `main` alone, and
  d9fa8be9c7 does the same on `stable-3_5_0` alone.
- Upstream: pkp/pkp-lib, pkp/ojs and pkp/ui-library were searched for
  `findTemplate`, "Find Template" with translation and task template,
  "Trouver un modèle", "modèle de courriel" with discussion, and French
  with task, discussion, template and search label.
- Unverified: French (`fr`) on screen; the "Edit" window in French; the
  invitation's and the author response request's composers on screen.
