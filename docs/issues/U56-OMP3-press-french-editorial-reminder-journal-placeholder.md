# A press's French "Editorial Reminder" prints "{$journalName}" where the press's name belongs

- **Severity** low
- **Effort** medium
- **Kind** defect
- **Affects**
  - main: OMP
  - 3.5: OMP
  - 3.4: OMP (code)
  - 3.3: none (code; no "Editorial Reminder" email)
- **Introduced** not traced to a PR: [bba8358991](https://github.com/pkp/pkp-lib/commit/bba8358991f6a5653438ad4aa392cdf53ffbd48a) · 2024-02-02 · Alec Smecher (asmecher), which brought the French (Canada) translation of `stable-3_4_0` (Weblate, [ddddfbf72a](https://github.com/pkp/pkp-lib/commit/ddddfbf72acf4ae8fbfff4fe43e6a70fceecc7e9), Pierre Lasou (pilasou), 2024-01-25) to the branches that became `main` and `stable-3_5_0`
- **Upstream** none found (2026-10-21)
- **Tracked in** spec U56 [OMP3](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U56-emails-management.md#omp3)
- **Checked** 2026-10-21, each branch's tip (the commits in Evidence)
- **Model** claude-opus-5-5

## Summary

On a press that offers French (Canada), "Edit" on "Editorial Reminder"
in "Manage Emails" opens "Edit Template" with a French body that reads
"… soumissions dans {$journalName}. Des actions sont …"; the English
body reads "{$contextName}" there. The reminder a press editor
receives in French then reads, for example, "Vous êtes présentement
assigné-e à 4 soumissions dans {$journalName}": the placeholder text is
printed as it stands, as the link to the press's home page. A
journal's French reminder names the journal in the same sentence.
French (France) is not affected.

The wrong text is stored in the install's default templates when
French (Canada) is installed, so correcting the translation alone does
not reach presses that already have it: the fix needs an upgrade step
that rewrites the stored text. Until then a manager can correct the
French body by hand.

## Impact

- **Lost**: the press's name in the opening sentence of the reminder;
  the list of waiting submissions and every link still arrive.
- **Who**: editors and press managers of a press that offers French
  (Canada) as an interface language, when their reminder goes out in
  French. That happens when French (Canada) is the press's primary
  language, or when an editor's "Working Languages" include French but
  not the press's primary language.
- **Way round**: a manager edits the French body of "Editorial
  Reminder" under Settings › Workflow › "Emails" › "Manage Emails" and
  replaces "{$journalName}" with "{$contextName}".

Low: a placeholder left as text in an automated email that still
delivers its content.

## Steps to reproduce

Preconditions:

- PKP's default test dataset for OMP `main`. Its `publicknowledge`
  press offers French (Canada) as an interface language and as a form
  language, English primary; `dbarnes` (Press editor) is assigned to
  submission 8, "Editorial", at the Submission stage, which the daily
  reminder lists as waiting for him. Nothing is created.
- A mail catcher the install sends to, to read the mailbox of
  `dbarnes@mailinator.com`.

The template:

1. Sign in as `rvaca`.
2. Open Settings › Workflow, the "Emails" tab, and its link "Add and
   edit templates" ("Manage Emails").
3. On "Editorial Reminder", press "Edit". In "Edit Template", press
   "French" above the form and read "Body in French".

The email:

4. Sign out, and sign in as `dbarnes`. Open the user menu's "Edit
   Profile", the "Contact" tab; under "Working Languages" tick "French",
   leave "English" unticked, and press "Save".
5. Run the daily task that sends the reminder, in the OMP root:
   `php lib/pkp/tools/scheduler.php test --name='PKP\task\EditorialReminders'`.
   The job it queues runs on the next page load, or with
   `php lib/pkp/tools/jobs.php work --stop-when-empty`.
6. Open the newest email to `dbarnes@mailinator.com`.

**Expected.** Step 3's French body names `{$contextName}`; step 6's
email reads "Vous êtes présentement assigné-e à 4 soumissions dans
Press de la connaissance du public".

**Observed.** Step 3's "Body in French":

```
{$recipientName}, Vous êtes présentement assigné-e à {$numberOfSubmissions} soumissions dans {$journalName}. Des actions sont attendues de votre part pour ces soumissions. {$outstandingTasks} …
```

Step 6, subject "Tâches éditoriales en attente pour Press de la
connaissance du public":

```
Daniel Barnes, Vous êtes présentement assigné-e à 4 soumissions dans {$journalName} ( …/index.php/publicknowledge/fr_CA ). Des actions sont *attendues de votre part pour ces soumissions*.
⬤ Une nouvelle soumission doit être envoyée en évaluation ou refusée. 8 — — Editorial ( … )
```

In the HTML part the placeholder text is the text of the link to the
press's home page
(`<a href="…/index.php/publicknowledge/fr_CA">{$journalName}</a>`).

Control, on a journal: the same steps on OJS `main` show
"{$contextName}" in the French body, and the email reads "… à 17
soumissions dans Journal de la connaissance du public".

## Cause

pkp-lib's French (Canada) text of the reminder,
`emails.editorialReminder.body` in `locale/fr_CA/emails.po`, names
`{$journalName}`. Shared pkp-lib email texts name the context as
`{$contextName}`, the variable the `EditorialReminder` mailable fills
(`ContextEmailVariable`); the English text and French (France)'s
`locale/fr/emails.po` do so.

The text is stored when the site is installed or a language is
installed (`PKPInstall`, `Locale::installLocale()`), in
`email_templates_default_data`, which has no context column: one
default per install, shared by every press of it. On the way in,
`PKP\emailTemplate\DAO::installEmailTemplateLocaleData()` applies the
app's `variablesToRename()`. OJS maps `journalName` to `contextName`, so
a journal's default works; OMP maps only `pressName` and its siblings,
so a press's default keeps `{$journalName}` and nothing fills it when
the email is sent. A press whose manager edited and saved the template
holds its own copy in `email_templates_settings`.

`pkp/pkp-lib#13128` later corrected another placeholder in the same
French text (`$recipientName}`) and left this one.

The reminder's language comes from
`jobs/email/EditorialReminder::getLocale()`: the press's primary
language, unless the editor's working languages include one of the
press's interface languages (`supportedLocales`) and not the primary
one.

Reach:

- Every OMP install with French (Canada) installed: the install's
  default (`EDITORIAL_REMINDER` / `fr_CA`) holds the placeholder text
  (read in the dataset), and so does a press's own copy saved without
  changing it.
- The same mistake in pkp-lib's Norwegian (Bokmål) texts:
  `locale/nb_NO/emails.po` names `{$journalName}` ten times (among
  them `emails.reviewAck.body`, `emails.editorDecisionSendToExternal.body`
  and the reminder's subject) and `{$journalSignature}` once
  (`emails.decision.notifyReviewers.body`), which OMP and OPS do not
  rename either. Read in the code; "Install Locale" offers no Norwegian
  (Bokmål) on `main`, so it was not driven.
- No other pkp-lib translation names a `journal*` email variable.
  OMP's own English texts of "Reviewer Unassign" and "Review Cancel"
  name `{$journalName}` on `main`: a separate report,
  [pkp-e2e#690](https://github.com/jardakotesovec/pkp-e2e/issues/690).

## Proposed fix

Name the context variables in the translations, and let the upgrade's
existing variable rename repair what installs already store
([fix.diff](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/press-french-editorial-reminder-journal-placeholder/fix.diff),
against the OMP root; pkp-lib only):

```diff
--- a/lib/pkp/locale/fr_CA/emails.po
+++ b/lib/pkp/locale/fr_CA/emails.po
-">{$journalName}</a>. Des actions sont <b>attendues de votre part pour ces "
+">{$contextName}</a>. Des actions sont <b>attendues de votre part pour ces "
--- a/lib/pkp/classes/migration/upgrade/v3_5_0/I10962_UpdateEmailTemplateVariables.php
+++ b/lib/pkp/classes/migration/upgrade/v3_5_0/I10962_UpdateEmailTemplateVariables.php
             'omp' => [ // OMP
+                // Translations copied from a journal's text
+                'journalName' => 'contextName',
+                'journalSignature' => 'contextSignature',
                 'pressAcronym' => 'contextAcronym',
 …
             'ops' => [ // OPS
+                // Translations copied from a journal's text
+                'journalName' => 'contextName',
+                'journalSignature' => 'contextSignature',
                 'serverAcronym' => 'contextAcronym',
```

The diff makes the same changes in `locale/nb_NO/emails.po`: ten
`{$journalName}` to `{$contextName}`, one `{$journalSignature}` to
`{$contextSignature}`.

The stored text lives in two places, and the migration must rewrite
both: the install's defaults (`email_templates_default_data`) and each
press's edited copies (`email_templates_settings`), subject and body.
`I10962_UpdateEmailTemplateVariables` already does exactly that for each
app's old context variables, and runs on every upgrade to a 3.5
release and to 3.6. This follows the `pkp/pkp-lib#13128` fixes of
other placeholders: the language file and an upgrade step together.
`journalName` and `journalSignature` are never filled on a press or a
preprint server, so the rename cannot change a working text.

Tried on OMP `main`: with the diff in, the default dataset of
`stable-3_5_0` upgraded to `main` stores the French body with
`{$contextName}`; "Body in French" shows it, and the French reminder
reads "Vous êtes présentement assigné-e à 4 soumissions dans Press de
la connaissance du public". The template installed afresh from the
corrected file (`lib/pkp/tools/installEmailTemplate.php
EDITORIAL_REMINDER fr_CA`) reads the same. An editor without French
gets "Dear Daniel Barnes, You are currently assigned to 4 submissions
in Public Knowledge Press", the same with the diff in and out.

**Alternatives**

- Add the two names to OMP's and OPS's `variablesToRename()` as well:
  a press would then store a working text from any later translation
  that copies a journal's wording. It hides the mistake rather than
  fixing the language file; worth it only if such translations keep
  coming.
- A new migration for these texts alone: more code than two lines in
  the existing rename, for the same result.

**What goes with it**

- Weblate: `pkp/pkp-lib#13128` corrected its placeholders in the
  `.po` files in git, and Weblate takes the files from the repository,
  so the strings need no separate entry there, as long as no
  translator holds an unsaved change to them on Weblate (not checked).
- Backport: the diff applies to `stable-3_5_0` as written (checked
  with `patch --dry-run`). On `stable-3_4_0` the French string is the
  same (the Norwegian texts live in `locale/nb/emails.po` there), but
  3.4 has no `I10962_UpdateEmailTemplateVariables` and OMP 3.4 stores
  `pressName`, so stored copies there are repaired by the upgrade to
  3.5.
- A test: a unit test that reads every `emails.po` of pkp-lib and the
  apps and refuses a variable the template's mailable does not
  describe.

Medium: a few lines in pkp-lib, but they carry a repair of stored data
through an upgrade step.

## Evidence

- Kept script:
  [walk.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/press-french-editorial-reminder-journal-placeholder/walk.js)
  (helpers in its `lib.js`), run with
  `node bin/probe.js ojs,omp shared/playwright/checks/issues/press-french-editorial-reminder-journal-placeholder/walk.js`
  on PKP's default dataset; with the argument `neighbour` it leaves
  step 4 out, so the reminder goes out in English.
- Walked on `main` (OMP, and OJS as the control) and on
  `stable-3_5_0` (OMP), PostgreSQL, pkp/datasets 5f247d04
  (2026-10-20). The `main` walk read "Body in French" without pressing
  "French" (both languages' editors are in the window); the trial walks
  pressed it. No request failed and no page script failed. Tips,
  `main`: OMP 5777025be (lib/pkp 042726ebf6), OJS 3109a59114 (lib/pkp
  f37a174626). `stable-3_5_0`: OMP cce424e5e (lib/pkp 68512b5fda).
- 3.4, code: pkp-lib `stable-3_4_0` (85f47442cf)
  `locale/fr_CA/emails.po` names `{$journalName}` in the same text; OMP
  `stable-3_4_0` (e30fa7e38) registers `EDITORIAL_REMINDER`, renames
  `contextName` to `pressName` at install and fills `pressName`, so the
  placeholder text stays. 3.3, code: OMP `stable-3_3_0` (8e72fc883)
  registers no `EDITORIAL_REMINDER`.
- Introduced: on `main` and `stable-3_5_0`, `git blame` and
  `git log -S journalName` on the line give bba8358991 (one parent,
  titled "Merge branch 'translations-3_4_0' into stable-3_4_0", no PR);
  on `stable-3_4_0`, `git log -S` gives the Weblate commit ddddfbf72a,
  which is on that branch only.
- Not driven: a press whose primary language is French (Canada); a
  press whose manager edited the template; the Norwegian (Bokmål)
  texts and the `journalSignature` half of the fix; MySQL.
