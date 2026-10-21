# In six languages the page about the software shows a raw "{$…Version}" placeholder or a dead contact link

- **Severity** low
- **Effort** small
- **Kind** defect
- **Affects**
  - main: OJS, OMP, OPS
  - 3.5: OJS, OMP, OPS
  - 3.4: OJS, OMP, OPS (code)
  - 3.3: OJS, OPS (code; Hindi and Turkish only)
- **Introduced** not traced to one change (one translation per language, 2020 to 2023, each listed in Evidence); present since at least [7b80e15879](https://github.com/pkp/ojs/commit/7b80e15879aefff4a0b2ac75e166f5301a8ebf6f) (2020-05-27)
- **Upstream** none found (2026-10-21)
- **Tracked in** U07 [A14](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U07-journal-identity-and-about-pages.md#a14)
- **Checked** 2026-10-21, each branch's tip (the commits in Evidence)
- **Model** claude-opus-5-5

## Summary

A visitor who opens the page about the software (the PKP logo in the
footer) in one of six languages finds a translation error where the page
should name the version or link to a contact page:

- OJS, Hindi: the site-wide page prints "{$ ojsVersion}".
- OJS, Uzbek (Latin): the site-wide page and each journal's own page
  print "{$ ojsVersion}".
- OMP, Russian: the site-wide page and each press's own page print
  "{$ompVersion, которая …".
- OPS, Czech: the site-wide page and each server's own page print
  "{$ojsVersion}".
- OJS, Kazakh, and OPS, Turkish: the last sentence of the site-wide page
  links to "{$contactUrl}", which opens "404 Not Found".

English and the other languages show the version ("Open Journal Systems
3.6.0.0") and working links. No error or notice tells anyone, and no
task depends on the page.

The code is right. The fix is a corrected text in each app's locale
files, made on Weblate or as a commit to the `.po` files.

## Impact

- **Lost**: the version number on a public page, and in Kazakh and
  Turkish the site-wide page's contact link.
- **Who**: readers of an install that offers one of these languages. The
  site-wide page is linked only from the home page of a site with two or
  more journals, presses or servers.
- **Way round**: the English page shows the version. The dead link has
  none on its page; each journal's and server's own page links to its
  "Contact" page.

## Steps to reproduce

Preconditions:

- PKP's default test dataset, `main` (OJS, OMP and OPS).
- The languages installed. Sign in as `admin` (password `admin`),
  Administration › "Site Settings" › "Site Setup" › "Languages" ›
  "Install Locale", tick the boxes, "Save":
  - OJS: "Hindi/हिन्दी (hi)", "Uzbek (Latin)/o‘zbek (lotin) (uz_Latn)",
    "Kazakh/қазақ тілі (kk)"
  - OMP: "Russian/русский (ru)"
  - OPS: "Czech/čeština (cs)", "Turkish/Türkçe (tr)"
- Still as `admin`, on "Journal of Public Knowledge" ("Public Knowledge
  Press", "Public Knowledge Preprint Server"): Settings › Website ›
  "Setup" › "Languages", under "Website Languages" tick "UI" on each row
  installed above.

The site-wide page is reached from the PKP logo in the footer of the
site's home page when the site hosts two or more journals (presses,
servers). With the dataset's one journal the site's address opens that
journal, so the steps open the site-wide page by its address.

Steps (signed out):

OJS:

1. Open the journal's home in Hindi (`/index.php/publicknowledge/hi`)
   and press the PKP logo in the footer. Read the paragraph under "ओपन
   जर्नल सिस्टम के बारे में".
2. Open the site-wide page in Hindi
   (`/index.php/index/hi/about/aboutThisPublishingSystem`). Read the
   paragraph.
3. Repeat steps 1 and 2 in Uzbek (Latin) (`uz_Latn` in the addresses).
4. Open the site-wide page in Kazakh
   (`/index.php/index/kk/about/aboutThisPublishingSystem`) and press the
   link at the end of the paragraph, "осы журналға тікелей
   хабарласуыңызды сұраймыз".

OMP:

5. Repeat steps 1 and 2 in Russian (`ru`), on the press.

OPS:

6. Repeat steps 1 and 2 in Czech (`cs`), on the server.
7. Open the site-wide page in Turkish
   (`/index.php/index/tr/about/aboutThisPublishingSystem`) and press the
   link "sunucuyla" at the end of the paragraph.

**Expected:** each paragraph names the version where English does
("This journal uses Open Journal Systems 3.6.0.0, …"), and a link in the
site-wide paragraph opens a page.

**Observed:** the paragraphs print the placeholder as written in the
translation:

```
hi, site (step 2):     यह साइट ओपन जर्नल सिस्टम {$ ojsVersion} का उपयोग करती है, …
uz_Latn, journal (3):  … dasturi bo'lgan Open Journal Systems {$ ojsVersion} ishlatiladi. …
uz_Latn, site (3):     … dasturi bo'lgan ochiq jurnal tizimlari {$ ojsVersion} ishlatiladi. …
ru, press (5):         Это издательство использует Open Monograph Press {$ompVersion, которая является программным обеспечением …
ru, site (5):          Это сайт использует Open Monograph Press {$ompVersion, которая является программным обеспечением …
cs, server (6):        Tento server používá Open Preprint Systems {$ojsVersion}, což je open source …
cs, site (6):          Tento web používá Open Preprint Systems {$ojsVersion}, což je open source …
```

On the Hindi site-wide page the link to PKP's website runs on to
the end of the paragraph and shows a stray "<" in its text
("सार्वजनिक ज्ञान परियोजना <द्वारा वितरित किया जाता है …").

In steps 4 and 7 the link's address is `{$contactUrl}`, and pressing it
opens `/index.php/index/kk/about/%7B$contactUrl%7D` (`…/tr/…`), a page
headed "404 Not Found".

The journal's page in Hindi (step 1) shows "3.6.0.0", and so do the
journal's page in Kazakh and the server's page in Turkish, whose contact
links open the "Contact" page. Every page in English and in French
(Canada) shows the version.

## Cause

Each app's `templates/frontend/pages/aboutThisPublishingSystem.tpl`
passes the version under the app's own name, `ojsVersion`, `ompVersion`
or `opsVersion`, to both texts, and `contactUrl` to the context's text
only (`about.aboutOJSJournal`, `about.aboutOMPPress`,
`about.aboutOPSServer`). The site-wide text (`about.aboutOJSSite`,
`about.aboutOMPSite`, `about.aboutOPSSite`) gets no contact address.
`LocaleBundle::_format()`
(`lib/pkp/classes/i18n/translation/LocaleBundle.php`, line 174) replaces
each exact `{$name}` token it is given, and anything else in the text
prints as written.

The code fills every placeholder it documents. The faults are all in the
translations, which write a token the template does not pass:

| App | Language | Key | Token in the translation | What is wrong |
|---|---|---|---|---|
| OJS | `hi` | `about.aboutOJSSite` | `{$ ojsVersion}` | a space inside the braces (and a stray `<` before "द्वारा") |
| OJS | `uz_Latn` | `about.aboutOJSJournal`, `about.aboutOJSSite` | `{$ ojsVersion}` | a space inside the braces |
| OMP | `ru` | `about.aboutOMPPress`, `about.aboutOMPSite` | `{$ompVersion, которая` | the closing brace left out |
| OPS | `cs` | `about.aboutOPSServer`, `about.aboutOPSSite` | `{$ojsVersion}` | OJS's name for the version |
| OJS | `kk` | `about.aboutOJSSite` | `<a href="{$contactUrl}">` | the whole text copied from the journal's text, its contact link included |
| OPS | `tr` | `about.aboutOPSSite` | `<a href="{$contactUrl}">` | the whole text copied from the server's text, its contact link included |

The Hindi site-wide text is marked `#, fuzzy`; the page shows it all
the same.

The Kazakh and Turkish site-wide texts are word-for-word copies of the
journal's and the server's texts (`ojs/locale/kk/locale.po` lines
1766-1773 and 1756-1763; `ops/locale/tr/locale.po` lines 279-286 and
269-276). So besides the dead link they open "Бұл журналда …" ("this
journal") and "Bu sunucu …" ("this server"), and ask the reader to
contact that journal or server directly.

`AboutSiteHandler::aboutThisPublishingSystem()` builds a `contactUrl` on
the site too (`index/about/contact`), but the template rightly leaves it
out of the site-wide text: the site has no "Contact" page, and that
address answers with a redirect to the login page
(`AboutContextHandler` requires a context).

Reach:

- The other translations of these six keys in the three apps' `main`
  checkouts carry every token the template passes, or leave the contact
  link out, which prints no raw text (read in the `.po` files; English
  and French (Canada) also on screen).
- The same mistake in other keys: a scan of every `.po` file for a
  `{$` that does not form a `{$name}` token finds about a hundred in
  pkp-lib's translations alone (`{$total</strong>` in Lithuanian, `{$
  max}` in Chinese (Simplified), and the like). They are other strings,
  outside this report.

## Proposed fix

Correct the six translated texts. The diffs, against each app root, were
tried on `main`:
[fix-ojs.diff](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/software-page-version-placeholder-raw/fix-ojs.diff),
[fix-omp.diff](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/software-page-version-placeholder-raw/fix-omp.diff),
[fix-ops.diff](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/software-page-version-placeholder-raw/fix-ops.diff).

- `hi`, `uz_Latn`: `{$ ojsVersion}` → `{$ojsVersion}` (and the stray
  `<` dropped in Hindi).
- `ru`: `{$ompVersion, которая` → `{$ompVersion}, которая`.
- `cs`: `{$ojsVersion}` → `{$opsVersion}`.
- `kk`, `tr`: drop the `<a href="{$contactUrl}">…</a>` around the last
  sentence of the site-wide text, and mark that text `#, fuzzy`.

With the diffs in, every page of the Steps showed the version and no
link to `{$contactUrl}`, and the English and French (Canada) pages were
unchanged.

For Kazakh and Turkish the diff mends only what fails. The rest needs a
translator: after it the site-wide page still asks the reader to
contact "this journal" or "the server" directly, which only a new
translation from the English site-wide text puts right. The fuzzy flag
queues both texts for that on Weblate and changes nothing on screen
(the apps show a fuzzy text, as they show the Hindi one). Emptying
the two texts instead would show English to those readers until then.

The texts belong to the translators, so the fix can be made on Weblate,
one string at a time. It can also be a developer commit to the
translation files, as `pkp/pkp-lib#13472` did (PR `pkp/pkp-lib#13473`,
merged 2026-10-08), which repaired one broken `{$date` in Lithuanian on
the way; three more `{$date</b>` remain in `locale/lt/submission.po`.
Weblate updates from the repository before it commits, so a commit
stays.

**Alternatives**

- Have the template pass the old names too (`ojsVersion` to OPS's text)
  or `_format()` tolerate spaces: it hides four of the six, but bends the
  code around wrong translations and leaves `ru`, `kk` and `tr` broken.
- Pass the handler's site `contactUrl` to the site-wide text: the link
  would lead to the login page instead of a 404.

**What goes with it**

- Backport: the six strings read the same on `stable-3_5_0` and
  `stable-3_4_0` (`uz@latin` there for Uzbek (Latin)); on
  `stable-3_3_0` only the Hindi site-wide text (`hi_IN`) and the Turkish
  one (`tr_TR`, under OPS's `about.aboutOJSSite`) have the fault.
- A check comparing each translation's `{$…}` tokens with the English
  source's, beside pkp-lib's `tests/classes/i18n/LocaleTest.php`, would
  catch the next one. It would also fail on the broken tokens in Cause,
  so it is the team's call, not part of this fix.

## Evidence

- Kept script:
  [walk.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/software-page-version-placeholder-raw/walk.js).
  It takes the Steps on one app (installing that app's languages through
  "Install Locale" and ticking "UI" on the context's Website Languages),
  on an install freshly loaded from the default dataset (pkp/datasets
  5f247d04, 2026-10-20, PostgreSQL). From a pkp-e2e checkout:
  `PROBE_FEATURE=<feature> PROBE_AGENT=<id> node bin/probe.js <ojs|omp|ops> shared/playwright/checks/issues/software-page-version-placeholder-raw/walk.js`;
  the argument `neighbour` reads only the English and French (Canada)
  pages (no install).
- Tips: `main` OJS 3109a59114, OMP 5777025be, OPS f048e747b4;
  `stable-3_5_0` OJS 1e78ca0c2b, OMP cce424e5e, OPS 5eca7fd603;
  `stable-3_4_0` OJS 0012bd1022, OMP e30fa7e38, OPS 0f1e21a117;
  `stable-3_3_0` OJS d7d9dd14ec, OMP 8e72fc883, OPS c5532e2161.
- 3.5 walked: the same Steps and the same text, with version 3.5.0.5.
- Code reads: the three templates on all four branches (the same
  parameters; OPS 3.3 uses `about.aboutOJSJournal` and
  `about.aboutOJSSite` with `ojsVersion`); `LocaleBundle::_format()` on
  `main` and 3.4, `LocaleFile` (`str_replace("{\$$key}", …)`) on 3.3. The
  six keys in every locale of each app on `main` and 3.5 (a script
  comparing each translation's tokens with English's), on 3.4 (`hi`,
  `uz@latin`, `kk`, `ru`, `cs`, `tr`: as on `main`) and on 3.3 (`hi_IN`
  site text broken; `uz_UZ@latin` and OMP `ru_RU` texts empty, so
  English shows; `kk_KZ` without the keys; OPS `tr_TR`
  `about.aboutOJSSite` with the contact link; OPS ships no Czech).
- Introduced, by `git log -S` on each token (the 2023 `.po` merges of
  `pkp/pkp-lib#8598` and the 2024 locale renames only moved the texts):
  Hindi `{$ ojsVersion}` from "Translation updates" (`pkp/ojs#2778`)
  [7b80e15879](https://github.com/pkp/ojs/commit/7b80e15879aefff4a0b2ac75e166f5301a8ebf6f)
  (2020-05-27, Alec Smecher); Turkish
  [8358dfc7fe](https://github.com/pkp/ops/commit/8358dfc7fedca577a8371994ed536f0d199eaedc)
  (2020-12-18, Hüseyin Körpeoğlu); Russian
  [8728ddfe81](https://github.com/pkp/omp/commit/8728ddfe81a5ad89ef8e4c9ca5699422dab7b028)
  (2021-02-14, Sergei Yukhimets); Kazakh
  [f6b706d0d3](https://github.com/pkp/ojs/commit/f6b706d0d3d4ea2512057b78505906360de26c52)
  (2021-08-18, Madi); Uzbek
  [fd68592b29](https://github.com/pkp/ojs/commit/fd68592b29330faf4664bd2fb546a669d5c95f63)
  (2021-09-08, Ruslan Shodmonov); Czech
  [99c34f9551](https://github.com/pkp/ops/commit/99c34f955118ea42f715017d5afad1c75aa0af84)
  (2023-04-23, Jiří Dlouhý). All but the first are "Translated using
  Weblate" commits with no PR.
- Upstream searched in pkp/pkp-lib, pkp/ojs, pkp/omp, pkp/ops and
  pkp/ui-library, by the key names, the placeholder names and the
  symptom: `pkp/omp#986` (merged 2021-06-16) fixed an earlier, other
  fault, OMP's template passing `ojsVersion`.
- The fix trial walked the diffs as linked, the `kk` and `tr` fuzzy
  flags included.
