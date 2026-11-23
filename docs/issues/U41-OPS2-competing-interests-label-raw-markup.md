# On a preprint server, the contributor form labels "Competing Interests" with raw link markup

- **Severity** low
- **Effort** small
- **Kind** defect
- **Affects**
  - main: OPS
  - 3.5: OPS
  - 3.4: OPS (code; the label only)
  - 3.3: OPS (code; the same entry, through the 2024 change's backport, shows as a "CI Policy" link with a broken address)
- **Introduced** `pkp/pkp-lib#9574` (pushed without a PR on `main`) · [fc42763d00](https://github.com/pkp/pkp-lib/commit/fc42763d007e094e66cb539c494169b733dab8d9) · 2024-01-02 · Alec Smecher (asmecher)
- **Upstream** none found (2026-11-23)
- **Tracked in** U41 [OPS2](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U41-contributors-and-affiliations.md#ops2)
- **Checked** 2026-11-23, each branch's tip (the commits in Evidence)
- **Model** claude-opus-5-5

Update 2026-11-23: the raw text in the screen-reader error list after
an empty save (step 6), read before only in the code, is now reproduced
on `main` and 3.5.

## Summary

On a preprint server that requires competing-interest statements, the
contributor form's "Competing Interests" field is labelled with raw
code-like text instead of the plain "Competing Interests" a journal or
press shows. The label reads
`Competing interests <a target="_new" class="action" href="{$competingInterestGuidelinesUrl}">CI Policy</a>`,
with an unfilled placeholder and visible link markup. It is an old
label that OPS's own language files still carry for this field.

The field's guidance and its required mark work; only its name is
wrong, on screen and in the list of errors a screen reader user moves
through after saving without a statement, which names the field by the
same raw text. A French interface shows the same markup in French.
Readers never see it: the public preprint page shows no
competing-interests statement.

## Impact

- **Lost**: nothing; the statement is filled in and saves as usual.
- **Who**: authors filling in contributors in the submission wizard, and
  moderators and managers editing them in the workflow, on every
  preprint server that ticks "Require submitting Authors to file a
  Competing Interest (CI) statement with their submission." That
  setting is off by default; how many servers turn it on is not known.
  On 3.4 too the field, and with it the raw label, appears only with the
  setting ticked.
- **Way round**: no OPS setting changes the label. A manager can replace
  it before a fix ships with the Custom Locale plugin from the Plugin
  Gallery, setting `author.competingInterests` to "Competing Interests";
  the error list takes the field's label, so it is corrected too (read
  in the code, not tried).

Low: only the field's name is wrong, on screen and in the error list.

## Steps to reproduce

Preconditions:

- PKP's default test dataset, OPS `main` (server `publicknowledge`).

Steps:

1. Sign in as `dbarnes` (Preprint Server manager).
2. Open Settings › Workflow › "Submission" › "Metadata". Under
   "Competing Interests" tick "Require submitting Authors to file a
   Competing Interest (CI) statement with their submission." and press
   "Save".
3. Open submission 1, "The influence of lactation on the quantity and
   quality of cashmere production", and choose "Contributors" under
   "Preprint".
4. Press "Add Contributor" and look at the field after "Homepage URL".
   Press "Close".
5. Press "Edit" on Carlo Corino's row and look at the same field.
6. Leave the statement empty and press "Save". The form's footer shows
   "Please correct one error." and "Jump to next error". Under "Please
   correct one error." it holds a list of buttons hidden from sight, one
   per error, that a screen reader user moves to (with Tab or the screen
   reader's own navigation; the browser's accessibility tree shows them
   too). Read the button's name.

**Expected.** The field is labelled "Competing Interests" (steps 4 and
5), and the error list reads "Go to Competing Interests: This field is
required." (step 6). A journal and a press show both: on OJS submission
7, "Developing efficacy beliefs in the classroom", "Contributors" under
"Publication" and "Edit" on Domatilia Sokoloff's row; on OMP submission
1, "The ABCs of Human Survival: A Paradigm for Global Citizenship", the
same on Arthur Clark's row.

**Observed.** In steps 4 and 5 the label reads, verbatim:

```
Competing interests <a target="_new" class="action" href="{$competingInterestGuidelinesUrl}">CI Policy</a> * Required
```

In step 6 the field shows "This field is required." under it, no
request is sent, and the error list holds one button:

```
Go to Competing interests <a target="_new" class="action" href="{$competingInterestGuidelinesUrl}">CI Policy</a>: This field is required.
```

With the interface switched to "français" (the initials menu ›
"Change Language"), the label reads:

```
Conflits d'intérêts <a target="_new" class="action" href="{$competingInterestGuidelinesUrl}">Politique de conflits d'intérêts</a>
```

## Cause

The form takes its label from `author.competingInterests`
(`lib/pkp/classes/components/forms/publication/ContributorForm.php`,
`'label' => __('author.competingInterests')`). pkp-lib defines that key
as "Competing Interests" in `locale/en/submission.po`, but OPS's own
`locale/en/author.po` still defines it, and an app's locale files win
over pkp-lib's. OPS's string is the pre-3.0 OJS label, copied when OPS's
locale files were created
([93c92c3f71](https://github.com/pkp/ops/commit/93c92c3f7151e05e0aea25fdf33db32c4331fad6)).
It is HTML with a placeholder, `{$competingInterestGuidelinesUrl}`,
that an old template filled with the policy's address.
`ContributorForm` passes no such parameter, and ui-library's
`FormFieldLabel.vue` prints the label as text (`{{ label }}`), so the
markup and the placeholder show. ui-library's `FormErrors.vue` builds
the error list from the same label (`form.errorA11y`, "Go to
{$fieldLabel}: {$errorMessage}", printed as text), so the list repeats
it.

pkp-lib [fc42763d00](https://github.com/pkp/pkp-lib/commit/fc42763d007e094e66cb539c494169b733dab8d9)
(`pkp/pkp-lib#9574`, author competing-interest statements) defined the
key in pkp-lib and gave it to the shared form (backported to 3.4 as
`cea6470f5f` and to 3.3's older author form as `c50bf91dbd`, the same
day). Its OJS half,
[d970b3a5ba](https://github.com/pkp/ojs/commit/d970b3a5bad0da6a583ed8553dbcc74018bacf91),
deleted OJS's old copy of the key from every `locale/*/author.po`; OMP
had none. OPS got no matching change, so its copy has shadowed pkp-lib's
since. The error list shows it since pkp-lib
[3b30e8726a](https://github.com/pkp/pkp-lib/commit/3b30e8726a9ce3257d292631795eb217f2beb8a8)
(`pkp/pkp-lib#11796`, 2025-10-08) made the statement required
(`'isRequired' => true` in `ContributorForm`, a check in
`Author\Repository::validate()`), on `main` and 3.5; on 3.4 the
statement is optional, so an empty save lists no error.

Reach:

- The workflow's "Add Contributor" and "Edit", for editors and authors
  alike (the form `PKPDashboardHandler::index()` builds, line 148):
  reproduced.
- The submission wizard's contributors step (`ContributorsListPanel`,
  from `PKPSubmissionHandler`, line 228): code.
- The form's error list after an empty save: reproduced. ui-library's
  `Form.vue` `submit()` calls `validate()`, whose `validateRequired()`
  adds "This field is required." (`validator.required`) for the empty
  required field on the client, and `submit()` returns before any
  request. `FormErrors.vue` builds its list from those errors, naming
  each by its field's label. The server's own message ("A competing
  interest statement is required.") is not reached from this form.
- Other languages: OPS carries the key in 12 `locale/*/author.po`
  files. Nine of them (bg, cs, de, es, fi, fr_CA, mk, pt_BR, uk) hold
  a translated copy with the same markup; French reproduced, the rest code.
  The other two (ca, nb_NO) are empty and skipped by the loader (`LocaleFile::loadArray()`, `includeEmpty => false`).
- No other OPS key overrides a pkp-lib key with markup or a placeholder
  that pkp-lib's version lacks (a comparison of every key both
  `locale/en` trees define, on OJS, OMP and OPS): this is the only one.
- `author.competingInterests` has no other reader in OPS, its plugins
  or pkp-lib (searched), and no OPS template, the theme's included,
  prints an author's competing interests.

## Proposed fix

Delete the `author.competingInterests` entry from every OPS
`locale/*/author.po`, as d970b3a5ba did for OJS, so pkp-lib's "Competing
Interests" and its translations apply. For English:

```diff
--- a/locale/en/author.po
+++ b/locale/en/author.po
@@ -18,9 +18,6 @@
 msgid "author.submit"
 msgstr "New Submission"
 
-msgid "author.competingInterests"
-msgstr "Competing interests <a target=\"_new\" class=\"action\" href=\"{$competingInterestGuidelinesUrl}\">CI Policy</a>"
-
 msgid "author.submit.startHereLink"
 msgstr "<a href=\"{$submitUrl}\" class=\"action\">Click here</a> to go to step one of the five-step submission process."
```

The whole change, 12 files, is
[fix.diff](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/competing-interests-label-raw-markup/fix.diff).
Tried on OPS `main`: the Steps then show
"Competing Interests" on "Add Contributor" and "Edit" and "Go to
Competing Interests: This field is required." in the error list, and the
French interface shows pkp-lib's "Conflit d'intérêts", with the
guidance, the required mark and the "Competing Interests" setting on the
Metadata tab unchanged.

**Alternatives**

- Rewrite OPS's string to "Competing Interests": fixes English, but
  keeps a duplicate that drifts from pkp-lib and leaves the translated
  copies broken.
- Pass the guideline URL into `__()` in `ContributorForm`: the label
  would still be HTML, which the Vue label prints as text.

**What goes with it**

- No data, API or plugin change: locale files only.
- Backport: the same deletion applies to OPS `stable-3_5_0` and
  `stable-3_4_0` (the same entry and the same form). On `stable-3_3_0`
  the key is in `locale/*_*/author.po`, and the label comes from the
  older `authorForm.tpl`, which renders the HTML: the field reads
  "Competing interests" followed by a real "CI Policy" link, whose
  address is the unfilled placeholder. Deleting the entry there gives
  pkp-lib's plain label as well.
- Guard: an e2e assertion on the field's label and on the empty save's
  error list on OPS (the "Competing Interests" setting is already driven
  there); a pkp-lib
  check that flags an app locale key shadowing a key pkp-lib owns would
  catch the next such copy.

Small: locale files only, following the OJS change, tried.

## Evidence

- Kept script:
  [walk.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/competing-interests-label-raw-markup/walk.js)
  (helpers in `lib.js` beside it), on an install reset to the dataset:
  `PROBE_FEATURE=<feature> node bin/probe.js all shared/playwright/checks/issues/competing-interests-label-raw-markup/walk.js [steps|french]`
  (`steps`, the Steps; `french`, the same form in the French interface
  on OPS). The label was reproduced on 2026-10-03 on OPS, with OJS and
  OMP as the control; the error list (step 6) on 2026-11-23 on OPS
  `main` and 3.5, read both from the page and from the accessibility
  tree (Playwright's `ariaSnapshot()` of the form's `.pkpFormErrors`).
  OJS and OMP label the field "Competing Interests" on `main` and 3.5
  (2026-10-03), and their error list read
  "Go to Competing Interests: This field is required." on `main` on
  2026-11-20
  ([sw20.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/U41/SW20/sw20.js),
  part `ci`).
- Fix (2026-11-23):
  `node bin/try-fix.js apply shared/playwright/checks/issues/competing-interests-label-raw-markup/fix.diff ops`,
  the script's `steps` and `french`, then `revert` and `french` again.
- Run on PostgreSQL, PKP datasets `abdb5d17` (2026-10-03:
  `566bb1f`). Tips on 2026-11-23: `main` ops `69d3cf6bad` (lib/pkp
  `3ea73a1a7e`, lib/ui-library `836c01b5`); `stable-3_5_0` ops
  `5a7aec98df` (lib/pkp `9295edd4f0`, lib/ui-library `fd00e45f`). On
  2026-10-03: `main` ops `c8af945bb7` (lib/pkp `3dc90c81a6`,
  lib/ui-library `280f98c5`), ojs `ff004d0973` (lib/pkp `987776cd04`,
  lib/ui-library `64d67363`), omp `3b0ecf794c` (lib/pkp `3dc90c81a6`);
  `stable-3_5_0` ops `38b61882d3` (lib/pkp `cf3f984335`), ojs
  `c1cee76b95`, omp `9c5e24246c`.
- `main` and 3.5 code read: OPS `locale/en/author.po`, pkp-lib
  `ContributorForm.php` (the label, `'isRequired' => true`), ui-library
  `FormErrors.vue` (identical on both) and `form.errorA11y` in pkp-lib
  `locale/en/common.po`. OPS has 14 `locale/*/author.po` files on
  both; `fr` and `pt` do not carry the key, so `fix.diff` covers all 12
  that do, and it applies to `main` as written.
- 3.4 (code): OPS `stable-3_4_0` `2ae7c4d65f` keeps the entry in
  `locale/en/author.po`; pkp-lib `stable-3_4_0` `1310f00fed` has the
  `#9574` backport (`cea6470f5f`) and builds the form from
  `ContributorsListPanel`. Its `ContributorForm` adds the field without
  `isRequired`, `Author\Repository` has no check on it, and no commit
  on that branch names `#11796`; ui-library
  `stable-3_4_0` `ee684b34` has the same `FormErrors.vue` list.
- 3.3 (code): OPS `stable-3_3_0` `a16131dc32` keeps the entry in
  `locale/en_US/author.po`; pkp-lib `stable-3_3_0` `cb68f48e99` has the
  backport (`c50bf91dbd`, `pkp/pkp-lib#9576`), and OPS's `AuthorForm`
  extends `PKPAuthorForm`, whose `authorForm.tpl` titles the section
  `{fbvFormSection title="author.competingInterests"}`; `formSection.tpl`
  prints `{translate}` unescaped, so the label renders as "Competing
  interests" and a "CI Policy" link to the unfilled address.
  `PKPAuthorForm` adds no check on the statement, and the old form's
  `formErrors.tpl` lists messages, not labels. Not run.
- Introduced: `git log -L` on the entry in OPS `locale/en/author.po`
  (added in 93c92c3f71, 2019; reformatted in 3e78126159); the key's use
  in `ContributorForm.php` from `git log -S` (fc42763d00). The GitHub
  API lists no PR for fc42763d00 or d970b3a5ba; the issue's comments
  name the 3.3 PRs `pkp/pkp-lib#9576` and `pkp/ojs#4124`. No commit on
  any OPS line names `#9574`.
- Upstream: pkp/pkp-lib, pkp/ops and pkp/ui-library searched for
  `competingInterestGuidelinesUrl`, "CI Policy", `author.competingInterests`
  and "competing interests" with label/contributor (2026-10-03), and
  again for `competingInterestGuidelinesUrl` and "competing interests"
  in issues since 2026-10-01 (2026-11-23, none); `pkp/pkp-lib#13212`
  (reader-page display) and `pkp/pkp-lib#11796` (required in all
  locales) are other faults.
- Way round: pkp/customLocale `main` (release 1.4.0.0)
  `CustomLocalePlugin::setupLocalizationOverriding()` registers its
  files with `Locale::registerPath($path, PHP_INT_MAX)`, above the
  app's; the Plugin Gallery list (`https://pkp.sfu.ca/ojs/xml/plugins.xml`)
  offers it for OPS 3.3, 3.4 and 3.5. Not tried: the test installs
  cannot reach the gallery.
- Readers: OPS `templates/`, `plugins/themes/` and pkp-lib
  `templates/frontend/` searched for "competing": no match.
- Unverified: the eight translated copies other than French, the
  submission wizard, the error list in French and the Custom Locale
  way round (read in the code only).
