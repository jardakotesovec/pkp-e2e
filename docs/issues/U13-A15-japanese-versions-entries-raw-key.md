# In Japanese, every "Versions" entry reads a raw translation key, with no date or version name

- **Severity** low
- **Effort** small
- **Kind** regression
- **Affects**
  - main: OJS, OMP, OPS
  - 3.5: OJS, OMP, OPS (on an item with two published versions)
  - 3.4: none (code)
  - 3.3: none (code)
- **Introduced** `pkp/pkp-lib#12849` · [4dcb611d91](https://github.com/pkp/pkp-lib/commit/4dcb611d91f65d23fa6367a793406a750a27a95f) · 2026-06-10 · yuki.k (yuk1-kondo)
- **Upstream** none found (2026-10-07)
- **Tracked in** spec U13 [A15](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U13-article-landing-page-and-reading.md#a15)
- **Checked** 2026-10-07, each branch's tip (the commits in Evidence)
- **Model** claude-opus-5-5

## Summary

On an article, book or preprint page shown in Japanese, every entry of
the "Versions" list reads "##submission.versionIdentity##", where the
English page reads "2026-10-07 (Version of Record 1.0)". On `main` a
preprint's line above its title shows the same key. The Japanese page
is otherwise largely translated, and releases up to 3.5.0-4 showed the
date and the version there.

The links still open their versions, but a reader cannot tell the
versions apart by date or by number without switching the page to
another language.

The entry is one of 68 Japanese texts that release 3.5.0-5 emptied
because they read the same as the English text: 57 shared by the three
apps and 11 of OJS, "OK", "URL" and "DOI" among them. This report covers
the "Versions" entry alone; the other 67 are not looked at here.

24 more languages have no text for the entry, Spanish (Mexico) and both
Chinese scripts among them. They never had it, and none of them has the
list's heading either: their translations hold from none to 42% of the
shared texts, so there the entry is one raw key among many. In Spanish
(Mexico), seen on screen, the heading reads "##submission.versions##".

## Impact

- **Lost.** The date and name of every version in the list, and on
  `main` of the version a preprint's page names above its title. No
  message says so.
- **Who.** Readers of a journal, press or preprint server shown in
  Japanese.
- **Way round.** A reader switches to English or another language the
  site offers. The journal has no setting that restores the entry.

Low: one entry's content in one language, with every version still
reachable from the list. The 67 other emptied texts, which this report
leaves out, would weigh more together.

## Steps to reproduce

Preconditions:

- PKP's default test dataset for `main`: the context `publicknowledge`,
  which offers English and French (Canada). Steps 1 to 5 add Japanese,
  which the dataset does not install, and Spanish (Mexico) for the
  comparison.

Adding the languages:

1. Sign in as `admin` (password `admin`), who is also a manager of
   `publicknowledge`.
2. Open Administration › "Site Settings" › "Site Setup" › "Languages"
   and press "Install Locale".
3. Tick "Japanese/日本語 (ja)" and "Spanish/español (Mexico/México)
   (es_MX)" and press "Save".
4. Open Settings › Website › "Setup" › "Languages".
5. Under "Website Languages", tick "UI" on the rows with the codes `ja`
   and `es_MX`.
6. Sign out.

Reader, journal (OJS):

7. Open "Signalling Theory Dividends" (submission 1) in Japanese:
   `/index.php/publicknowledge/ja/article/view/1`.
8. Read the list headed "バージョン" ("Versions") in the side column.

Reader, preprint server (OPS): the same at
`/index.php/publicknowledge/ja/preprint/view/3` ("Computer Skill
Requirements for New and Existing Teachers: Implications for Policy and
Practice", two posted versions); read the line above the title too.

Reader, press (OMP): the same at
`/index.php/publicknowledge/ja/catalog/book/5` ("Bomb Canada and Other
Unkind Remarks in the American Media").

For comparison, a language that never had the text:

9. Open the same three pages with `es_MX` in place of `ja`. The list is
   the block of the side column headed "##submission.versions##".

[3.5: the list shows only on an item with two published versions. The
preprint has two. On the journal, before step 1, sign in as `dbarnes`,
open "Signalling Theory Dividends", open "Title & Abstract" of its
unpublished second version and press "Publish", then "Publish" in the
window. On the press, `dbarnes` opens "Bomb Canada and Other Unkind
Remarks in the American Media", then "Title & Abstract", presses
"Create New Version" and "Yes", then "Publish" and "Publish".]

**Expected.** In Japanese each entry reads its version's date and name,
as the English page does: "2026-10-07 (Version of Record 1.0)" on the
article and the book, "2026-10-07 (Author Original 2.0)" and "2026-10-07
(Author Original 1.0)" on the preprint, with the stage name in Japanese
once it is translated. On 3.5: "2026-10-07 (2)" and "2026-10-07 (1)".

**Observed.** In Japanese:

```
main
OJS, "バージョン":     ##submission.versionIdentity##
OMP, "バージョン":     ##submission.versionIdentity##
OPS, "バージョン":     ##submission.versionIdentity##
                      ##submission.versionIdentity##
OPS, above the title: ##common.publication## ##navigation.breadcrumbSeparator## ##submission.versionIdentity##

3.5 (OJS, OMP and OPS alike)
"バージョン":          ##submission.versionIdentity##
                      ##submission.versionIdentity##
```

The Spanish (Mexico) pages show the same entries under
"##submission.versions##", among 15 to 20 other raw keys per page. The
French (Canada) pages, whose translation holds the pattern, show the
date and the brackets: "2026-10-07 (2)" on 3.5, and on `main`
"2026-10-07 (##publication.versionStage.display##)", where the key
inside the brackets is another report's fault
([pkp-e2e#228](https://github.com/jardakotesovec/pkp-e2e/issues/228)).

## Cause

Each app's default theme prints an entry as
`{translate key="submission.versionIdentity" datePublished=… version=…}`:
OJS
[`article_details.tpl`](https://github.com/pkp/ojs/blob/3265fdc673/templates/frontend/objects/article_details.tpl#L391),
OPS
[`preprint_details.tpl`](https://github.com/pkp/ops/blob/8ae6c68e04/templates/frontend/objects/preprint_details.tpl#L379)
(the list, and line 111, the line above the title), OMP
[`monograph_full.tpl`](https://github.com/pkp/omp/blob/0c6a3ebed1/templates/frontend/objects/monograph_full.tpl#L355)
and `chapter.tpl`. The English text of the key is
`{$datePublished} ({$version})`: two parameters and a pair of brackets,
with no word in it.

`Locale::translate()`
([`lib/pkp/classes/i18n/Locale.php`](https://github.com/pkp/pkp-lib/blob/f8285b0b8f/classes/i18n/Locale.php#L504-L526))
returns `##key##` when the page's language has no text for a key, and an
empty `msgstr` counts as none (`LocaleFile::loadArray()` leaves empty
entries out). The date and the name, passed in as parameters, are
dropped with it.

`lib/pkp/locale/ja/submission.po` held the pattern from 2021.
`pkp/pkp-lib#12849` replaced every Japanese `msgstr` that equalled the
English text with an empty one, in answer to a review note on English
text in the Japanese files. It was merged into `stable-3_5_0` (tag
`3_5_0-5`) and forward-ported to `main` (1d38522e79). For this text,
equal to the English one was right: it has nothing to translate.

Japanese is the one language in which the entry is the odd text out. On
`main` and on 3.5 it is the only language that has the list's heading
(`submission.versions`) and no text for the entry, and it holds 3,659 of
pkp-lib's 5,025 English texts on `main`. On 3.4 and 3.3 no language is
in that state.

Reach:

- The "Versions" list on the article, book and preprint pages, and on
  `main` the line above a preprint's title (on screen: OJS, OMP, OPS). A
  press's chapter page prints the same entry once the book has two
  published versions (code).
- The other texts the same change emptied: 56 in pkp-lib and 11 in OJS
  through its sister `pkp/ojs#5569`, all still empty on both branches
  (code; not driven). Twelve of pkp-lib's are patterns and separators
  like this one, among them `navigation.breadcrumbSeparator`, which the
  walked Japanese pages show as "##navigation.breadcrumbSeparator##".
  The rest are words that read the same in Japanese ("OK", "URL", "ID",
  "DOI", "PDF", "N/A", the role abbreviations). One of OJS's is
  `emails.announcement.subject`, which the email template installer
  stores as an empty subject for a language without it.
- 24 other languages have no text for the key, as since it came in with
  `pkp/pkp-lib#4870` (2019): 12 files lack the entry, 7 hold it empty
  and 5 languages have no `submission.po`. None of them has the heading.
  `zh_Hans` holds 42% of pkp-lib's texts, `sr_Cyrl` 39%, `cnr`,
  `bs_Latn`, `hi` and `he` 20 to 23%, and the other 18 under 7%
  (`es_MX`: one text). Their pages wait for translators as a whole
  (code; Spanish (Mexico) on screen).
- Two languages hold a broken copy (code): Lithuanian
  `{$datePublication} ({$version})` prints the parameter's name in place
  of the date, and Vietnamese `{version})` prints only that.

## Proposed fix

Put the Japanese text back, on `stable-3_5_0`, which Weblate draws from,
and on `main`
([fix.diff](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/japanese-versions-entries-raw-key/fix.diff)):

```diff
--- a/lib/pkp/locale/ja/submission.po
+++ b/lib/pkp/locale/ja/submission.po
 msgid "submission.versionIdentity"
-msgstr ""
+msgstr "{$datePublished} ({$version})"
```

It is a proposal; the team decides.

How this was settled:

- **Where the rule lives.** The Japanese file is where the text was
  lost. Every page that prints the entry reads it from there, in any
  theme.
- **How the code base does it.** 45 languages hold a text for this key:
  38 a copy of the English pattern, 7 a variant of it. A review of
  `pkp/pkp-lib#8349` (2022) asked for the same when a separator key was
  added: batch-add it "as a default translation to any locales that are
  present".
- **Every instance.** The 67 other emptied Japanese texts need the same
  restore and are left to their own report. The 24 other languages are
  left out: the entry is not what keeps their pages from reading well.
- **What the introducing change was for.** Keeping English words out of
  the Japanese files. A pattern without a word is not English text, so
  the restore keeps that intent.
- **What it touches.** The Japanese pages that print the entry, and
  nothing stored. The same line applies to `stable-3_5_0` and `main`.
- **The guard.** A check when a translation update is merged: a text the
  branch had must not come back empty. The commit's own diff showed 57
  such pairs.

Tried on `main`, on the three apps. With the line restored, each
Japanese entry reads "2026-10-07 (##publication.versionStage.display##)"
and the preprint's line above the title ends the same way. The date and
the brackets are back, as on the French (Canada) page; the key that is
left inside the brackets is the version name of
[pkp-e2e#228](https://github.com/jardakotesovec/pkp-e2e/issues/228),
which no language but English has on `main`. On 3.5, where the name is
the version's number, the restored line gives "2026-10-07 (2)" (by the
code; not tried there).

The check that the fix reaches no further: the Spanish (Mexico), English
and French (Canada) pages read the same with the fix in and out, and so
does Polish, whose translation holds a pattern of its own ("2026-10-07 -
(…)").

**Alternatives**

- A rule in `Locale::translate()`: a missing text whose English text
  holds no letter outside its `{$parameters}` takes the English text
  ([alternative-rule.diff](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/japanese-versions-entries-raw-key/alternative-rule.diff)).
  It would cover the 24 other languages, the 32 other texts of pkp-lib
  and the apps that hold no word, and the version name of
  [pkp-e2e#228](https://github.com/jardakotesovec/pkp-e2e/issues/228).
  Tried on `main` on the three apps before this fix was chosen: the
  Japanese and Spanish (Mexico) entries read "2026-10-07
  (##publication.versionStage.versionOfRecord## 1.0)". Not recommended
  as written, for three reasons:
  - It answers ahead of the missing-key handler, which
    `emailTemplate\DAO::installEmailTemplateLocaleData()` sets to return
    an empty string. Installing a language without
    `emails.announcement.subject` would then store `{$announcementTitle}`
    as the ANNOUNCEMENT email's subject, where today it stores an empty
    one (code): stored data changes.
  - Its plural branch can return null from a method declared `: string`
    (`LocaleBundle::translatePlural()` is `?string`).
  - It adds a rule to how PKP treats a missing text
    (`pkp/pkp-lib#784`), which is a decision for the team, and the
    languages it would help hold few other texts.
- Print the entry without a key in the five template places. It changes
  three repos, takes away the pattern four languages have changed
  (Bulgarian, Polish, Ukrainian, Croatian), and leaves a theme's own
  copy of the templates as it is. Not tried.

**What goes with it**

- The same restore for the 67 other emptied Japanese texts, or a
  decision on those that are words.
- The Lithuanian and Vietnamese texts for the key, corrected in Weblate.

Small: one line in one translation file, tried, with no code and no
stored data.

## Evidence

- Kept script:
  [`shared/playwright/checks/issues/japanese-versions-entries-raw-key/walk.js`](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/japanese-versions-entries-raw-key/walk.js)
  takes the Steps on the three apps, then reads the same pages in
  English and French (Canada), the control. On 3.5 it first takes the
  bracketed steps. `WALK=neighbour` adds Polish the same way and reads
  the item's page in Polish and English. Run it on an install freshly
  loaded from the default dataset:
  `PROBE_FEATURE=<feature> PROBE_AGENT=<agent> node bin/probe.js all shared/playwright/checks/issues/japanese-versions-entries-raw-key/walk.js`
  (with `PKP_E2E_LINE=stable-3_5_0` in front for 3.5).
- Walked on `main` and `stable-3_5_0`, on PostgreSQL, from pkp/datasets
  a130b9a (2026-10-07). A database plays no part (locale files and a
  string).
- Differences from the Steps: the journal's address `article/view/1`
  lands on the article's own path
  (`article/view/mwandenga-signalling-theory`; on 3.5, after the second
  version is published, `article/view/mwandenga`). In step 5 both "UI"
  boxes were unticked before they were pressed: a journal does not offer
  a language installed on the site until then. On 3.5 the bracketed
  steps are taken by the helpers of
  [`new-version-galley-publisher-id-refused/lib.js`](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/new-version-galley-publisher-id-refused/lib.js).
- 3.5 walk: on the three apps the English and French (Canada) pages
  read "2026-10-07 (2)" and "2026-10-07 (1)". A preprint's line above
  the title prints another key there (`publication.version`): "Preprint
  / Version 2" in English, "##common.publication##
  ##navigation.breadcrumbSeparator## バージョン 2" in Japanese.
- Raw keys on the walked `main` pages. Japanese: OJS two (the entry and
  the breadcrumb separator), OMP five, OPS six. Spanish (Mexico): OJS
  16, OMP 17, OPS 21.
- Tips: `main` OJS 3265fdc673, OMP 0c6a3ebed1, OPS 8ae6c68e04 (`lib/pkp`
  f8285b0b8f). `stable-3_5_0` OJS 6d2a42555d, OMP 5861ebee10, OPS
  6a8f83586c (`lib/pkp` 6910ca6d8e). The older lines were read at pkp's
  fetched branch tips with `git show`, not in an install:
  `stable-3_4_0` OJS d68934d0d1, OMP 0aec65441f, OPS acd8ae704b (pkp-lib
  767353f4fe); `stable-3_3_0` OJS ac77c9fb35, OMP 8e72fc8836, OPS
  c5532e2161 (pkp-lib ac3fa73402).
- Code reads, `main`: the five template places, `Locale::translate()`,
  `getBundle()`, `_getSupportedLocales()` and `_getUrlLocale()`,
  `LocaleBundle::getTranslator()`, `translateSingular()` and
  `translatePlural()`, `LocaleFile::loadArray()`,
  `emailTemplate\DAO::installEmailTemplateLocaleData()` (lines 329 to
  334) with OJS's `registry/emailTemplates.xml` and
  `locale/ja/emails.po`,
  `AdminLanguageGridHandler::_updateContextLocaleSettings()` (an
  installed language is not added to a journal's own), and every
  `locale/<code>/*.po` of pkp-lib: the key and `submission.versions` per
  language (an empty `msgstr` counted as missing), and how many of the
  English texts each language holds.
- Code reads, older versions. 3.5: the same languages as `main`; the
  templates wrap the list in `count(getPublishedPublications()) > 1`.
  3.4: `locale/ja/submission.po` holds the pattern; 21 other languages
  have a `submission.po` without a text for the key, none of them with
  the heading. 3.3: Japanese (`ja_JP`) has no `submission.po`, so the
  whole list is untranslated there; 10 languages hold the key empty,
  none of them with the heading.
- Introduced: `git log -S` of the pattern on `locale/ja/submission.po`
  gives 3491782222 (Weblate, 2021-04-15) and its removal 4dcb611d91 on
  `stable-3_5_0` (1d38522e79 on `main`); `git tag --contains` names
  `3_5_0-5` for it and for OJS's 7703cf2c8c (`pkp/ojs#5569`). The PR's
  thread holds the review note and the author's answer. The emptied
  texts were counted by comparing each `locale/ja/*.po` of the two
  commits with its parent. The key itself came in with 4adaa75a80
  (`pkp/pkp-lib#5093` for `pkp/pkp-lib#4870`, 2019-09-25).
- Upstream: pkp/pkp-lib, pkp/ojs, pkp/omp, pkp/ops and pkp/ui-library
  searched through the API by the key, the symptom's words and
  "Japanese localization". Read: `pkp/pkp-lib#784` and its comments,
  `pkp/pkp-lib#4870`, `pkp/pkp-lib#12849` and its comments, the review
  comments of `pkp/pkp-lib#8349`. None reports the entry or the emptied
  Japanese texts.
- Fix trial:
  `node bin/try-fix.js apply shared/playwright/checks/issues/japanese-versions-entries-raw-key/fix.diff ojs omp ops`,
  the kept script, the same with `WALK=neighbour`, then `revert`. The
  alternative's diff was tried the same way earlier the same day; the
  Polish and English pages without any fix were read in that trial,
  after its revert.
- The 67 other emptied Japanese texts were handed to the campaign's
  upstream session as a regression candidate.
- Not driven: 3.4 and 3.3 (code only); the 23 other languages (code
  only); a press's chapter page; the fix on 3.5; the Lithuanian and
  Vietnamese pages; the Japanese screens that use the other emptied
  texts; the email template installer.
- Unverified: themes other than the default one, which are outside the
  three apps' repositories; whether the Custom Locale plugin lets a
  manager supply the missing text (not installed).
