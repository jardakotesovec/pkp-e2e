# In French (Canada), a book's purchase link drops the format's name, and the "Format Availability" window is titled "Approbation du format"

- **Severity** low
- **Effort** small
- **Kind** defect
- **Affects**
  - main: OMP
  - 3.5: OMP
  - 3.4: OMP (code)
  - 3.3: OMP (code)
- **Introduced** not traced as one change. Each French (Canada) text matched its English when it was written in 2013, and was left as it was when the English changed under the same key: the link gained the format's name for `pkp/pkp-lib#958` · [905eed2d37](https://github.com/pkp/omp/commit/905eed2d37ae971713f5285df3992be06f634ea9) · 2016-02-03 · Nate Wright (NateWr), and the window became "Format Availability" for `pkp/pkp-lib#825` · [b9affacac](https://github.com/pkp/omp/commit/b9affacacd5f72429b0bd6b620cef29a10fcf4fe) · 2015-10-19 · Alec Smecher (asmecher)
- **Upstream** none found (2026-10-04)
- **Tracked in** spec U69 [A15](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U69-monograph-landing-page.md#a15) (the purchase link), spec U73 [A25](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U73-publication-formats-proof-terms.md#a25) (the window's title)
- **Checked** 2026-10-01 to 2026-10-04, each branch's tip (the commits in Evidence); the locale files read again 2026-10-08
- **Model** claude-opus-5-5

2026-10-08: narrowed to the two French (Canada) texts that are there
and say something wrong. The texts French (Canada) lacks, which this
report listed before, are the translators' work on Weblate and are no
longer reported here.

## Summary

On a press shown in French (Canada), two texts say something other than
their English. A reader who opens a book with a file for sale sees the
purchase link without the format's name: "25.00 Achat (25.00 USD)",
where the English page reads "25.00 Purchase PDF (25.00 USD)". An
editor who presses a format's availability link on the book's
"Publication Formats" page gets a window titled "Approbation du format"
("Format Approval"), where English titles it "Format Availability".

Nothing is lost and both tasks get done: the link still opens the
purchase, and the window's own sentence says that the format will be
available to readers. For a format with a single file the link is the
only place the book's page names the format, so the French reader is
not told which format the price buys. The press cannot change either
text from its settings.

A press shows both when "Français (Canada)" is among the languages it
offers; the link also needs payments turned on and a file priced for
direct sale. "Français" (France) has the same purchase link, and the
right window title.

## Impact

- **Lost.** The format's name in a priced file's link, and the right
  title over the window that makes a format available. Nobody is told.
- **Who.** Readers of a press that offers French (Canada) and sells
  files directly; its staff working in French (Canada) on a book's
  "Publication Formats" page.
- **Way round.** A reader can switch the page to English only when the
  press also offers English. Staff are not held up: the window's
  sentence and its buttons say what it does. No way round for the press
  was tried (Evidence, "Unverified").

Low: nothing is lost and both tasks get done; a link without its
format's name and a window under another window's title are wording.

## Steps to reproduce

Preconditions:

- PKP's default test dataset for OMP `main`, freshly loaded: the press
  `publicknowledge`, which offers English and French (Canada). Its pages
  show no language menu, so a reader reaches French by its address.
- Book 5, "Bomb Canada and Other Unkind Remarks in the American Media",
  is published with one "PDF" file, "epilogue.pdf". The dataset has no
  file for sale, so steps 1 and 2 make one.
- Submission 4, "How Canadians Communicate: Contexts of Canadian
  Popular Culture", is in Production. It has one format, "PDF", neither
  approved nor available.

The purchase link, as a reader:

1. Sign in as `dbarnes` (Press editor), open Settings › Distribution ›
   "Payments", tick "Enable", choose "US Dollar" under "Currency" and
   "Manual Fee Payment" under "Payment Plugins", type "Pay by cheque" in
   "Manual Payment Instructions", and press "Save".
2. Open submission 5's workflow, "Publication" › "Publication Formats".
   Under "PDF", press "Open Access" on the row of "epilogue.pdf",
   choose "Direct Sales", type the price 25.00, and press "Save".
3. Signed out, open the catalogue in French,
   `/index.php/publicknowledge/fr_CA/catalog`, and open "Bomb Canada and
   Other Unkind Remarks in the American Media". Read the file's link in
   the side column.

The "Format Availability" window, as staff (nothing is saved):

4. Sign in as `dbarnes`, open the menu under his initials at the top
   right and, under "Change Language", choose "français".
5. Open submission 4
   (`/index.php/publicknowledge/fr_CA/dashboard/editorial?workflowSubmissionId=4`)
   and in the window's menu, under "Publication", press "Formats de
   publication".
6. On the row "PDF", press the link in the third column (in English the
   column "Availability" and the link "Not Available"; in French
   (Canada) both show as codes, texts the language lacks). Read the
   window's title and text. Press "Annuler".

**Expected.** The link names the format, as the English link reads
"25.00 Purchase PDF (25.00 USD)" (3). The window is titled in French
what English titles it, "Format Availability" (6).

**Observed.**

```
Step 3: 25.00 Achat (25.00 USD)
Step 6: title  Approbation du format
        text   Ce format sera accessible aux lecteurs. Ils pourront consulter des fichiers
               téléchargeables qui apparaitront désormais dans l'entrée de catalogue du livre […]
```

"Approbation du format" is "Format Approval", the English title of the
neighbouring window, which the link in the second column opens to
approve a format's metadata. The price in front of the link in step 3
shows in English too and is reported apart (spec U69 A7).

## Cause

Two entries of OMP's `locale/fr_CA/locale.po` hold a text that no
longer says what the English text of the same key says.

`payment.directSales.purchase` reads "Achat ({$amount} {$currency})".
The English text gained the format's name in
[905eed2d37](https://github.com/pkp/omp/commit/905eed2d37ae971713f5285df3992be06f634ea9)
(2016-02-03): "Purchase ({$amount} {$currency})" became "Purchase
{$format} ({$amount} {$currency})", under the same key, when the book
page began to show a format with one file as a single link named after
the format. `templates/frontend/components/downloadLink.tpl` passes
`format`, the French (Canada) text has no place for it, and the name is
dropped.

`grid.catalogEntry.availableRepresentation.title` reads "Approbation du
format". It dates from the first French (Canada) files
([453d1ff6e0](https://github.com/pkp/omp/commit/453d1ff6e027eb9910f307e4f68340ef4fead6b7),
2013), when the window's English title was also "Format Approval". In
[b9affacac](https://github.com/pkp/omp/commit/b9affacacd5f72429b0bd6b620cef29a10fcf4fe)
(2015-10-19) the English title became "Format Availability" and
"Format Approval" moved to a new window for approving a format's
metadata. The French (Canada) text stayed.
`PublicationFormatGridCellProvider::getCellActions()` titles the window
with it.

A text that is present is never flagged for the translators when its
English changes under the same key, so both have stood since.

Reach:

- On screen (`main` and 3.5): the priced link of a format with one
  file, in the book page's side column. Read in the code: the same
  component prints it on a chapter's page
  (`templates/frontend/components/publicationFormats.tpl`) and in the
  table of contents under a chapter with a priced file
  (`templates/frontend/objects/monograph_full.tpl`). A format with
  several files lists each under its file name instead, with the
  format's name as a label above.
- On screen (`main` and 3.5): the window's title when a format is made
  available. Read in the code: the same title heads the window that
  takes availability back.
- French (France), read in the locale file: `locale/fr/locale.po` has
  the same link text without `{$format}`; its window title is right
  ("Disponibilité du format").
- Other languages, read in the locale files of OMP `main`: the link
  text has no `{$format}` in Catalan, Greek and Italian either. Czech
  gives both windows one title ("Schválení formátu").
- 3.4 and 3.3, read in the code: the same two French (Canada) texts,
  the same template and the same cell provider. 3.4 has the French
  (France) link text too; 3.3 has no French (France) translation.

## Proposed fix

Correct the two French (Canada) texts, and the French (France) link, on
PKP's Weblate (translate.pkp.sfu.ca), which writes the locale files,
rather than commit them: the `locale` component of Weblate's `omp`
project. The texts are those of
[fix.diff](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/omp-french-purchase-link-and-availability-title-wrong/fix.diff):

```diff
 msgid "grid.catalogEntry.availableRepresentation.title"
-msgstr "Approbation du format"
+msgstr "Disponibilité du format"

 msgid "payment.directSales.purchase"
-msgstr "Achat ({$amount} {$currency})"
+msgstr "Achat {$format} ({$amount} {$currency})"
```

"Disponibilité du format" is French (France)'s title for the same
window. "Achat {$format} (…)" is this report's own wording, after the
25 translations that carry the format's name (Spanish "Compra {$format}
({$amount} {$currency})"); the texts are a proposal for the
translators. This is work for a developer with a Weblate account: OMP's
French (Canada) files have had no translator's commit since 2023-07-20
([5ff9cb3d4](https://github.com/pkp/omp/commit/5ff9cb3d43ccbac0c43d4afc4f7ca93b3dcae263)).

Tried on `main` on 2026-10-01 and 2026-10-04, as part of the wider diff
this report then carried: with it applied, step 3's link named the
format and step 6's window was titled "Disponibilité du format", and
the same steps in English read the same with the diff in and out. The
diff as trimmed here was not walked again; it applies as written to
`main` and `stable-3_5_0`.

**Alternatives**

- Commit the diff to OMP: the same result at once, but Weblate's next
  sync may conflict with it.
- Print the format's name from the template and keep only the words in
  the text: no translation could then drop the name. It changes an
  English text that 25 languages have translated with the name in it.

**What goes with it**

- Left out of the diff: Catalan's, Greek's and Italian's link text and
  Czech's window title, for their translators.
- Not looked into: a comparison of each French (Canada) text of OMP
  with the placeholders of its English finds 28 more that differ (14 in
  `locale.po`, ten of them log entries that still name
  `{$monographId}`; 1 in `manager.po`; 13 in `emails.po`). None was
  placed on a screen.
- With the fix for spec U69 A7 the link then reads "Achat PDF (25.00
  USD)".
- Older versions: Weblate commits to a `translations/stable-3_5_0`
  branch, which pkp merges into `stable-3_5_0` and forward into `main`,
  so texts entered once reach 3.5 and `main`. 3.4 is best given the
  same texts by a commit of its own, with the French (France) one under
  `fr_FR`; whether Weblate still takes 3.4 texts is not known.
- The guard: the U69 spec's French-page scenario asserting that a
  priced file's link names its format, and the U73 spec's asserting the
  availability window's French title (Planned items).

A proposal; the team decides.

Small: three texts entered on Weblate and no code.

## Evidence

- Kept scripts, in
  [`shared/playwright/checks/issues/omp-french-purchase-link-and-availability-title-wrong/`](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/omp-french-purchase-link-and-availability-title-wrong/):
  `walk.js` takes Steps 1 to 3 (its steps 10 to 12) and `formats.js`
  Steps 4 to 6 (its steps 41, 42 and 47), each in French and then in
  English. `walk.js` changes books 14 and 5 and the press's payment
  settings, so it runs on an install freshly loaded from the default
  dataset; `formats.js` saves nothing:
  `PROBE_FEATURE=<feature> PROBE_AGENT=<agent> node bin/probe.js omp shared/playwright/checks/issues/omp-french-purchase-link-and-availability-title-wrong/walk.js`
  (`formats.js` the same way; `PKP_E2E_LINE=stable-3_5_0` in front for
  3.5; `NB=1` in front of `formats.js` takes its steps in English).
- Differences from the Steps: both scripts date from the report's
  wider form and do more than the Steps. Before its step 10, `walk.js`
  reads book 14's French pages, adds a chapter in a second version and
  publishes it; `formats.js` opens the "Add publication format" and
  "Edit" windows and the approval window before step 6's link. Step 1's
  instructions read "Pay by cheque u69r6" in the script.
- Seen in passing: after `walk.js` publishes book 14's second version,
  the book's two files under "PDF" change places from one run to the
  next (cause not traced).
- Walked on `main` and `stable-3_5_0`, on PostgreSQL: Steps 1 to 3 on
  2026-10-01 (pkp/datasets 92050d9), Steps 4 to 6 on 2026-10-04
  (pkp/datasets 566bb1f). Both lines showed the same texts.
- Tips of the walks: OMP `main` 3b0ecf794c (`lib/pkp` 3dc90c81a6,
  `lib/ui-library` 280f98c5); `stable-3_5_0` b24879c3d (`lib/pkp`
  1fb843f491) for Steps 1 to 3 and 9c5e24246c (`lib/pkp` cf3f984335)
  for Steps 4 to 6.
- Code reads, 2026-10-08, at OMP `main` 866d8d3dd, `stable-3_5_0`
  7d6b00060, `stable-3_4_0` 0aec65441 and `stable-3_3_0` 8e72fc883: the
  two keys in `locale/en` (`en_US` on 3.3), `locale/fr_CA` and
  `locale/fr` (`fr_FR` on 3.4; 3.3 has none); `downloadLink.tpl` and
  `PublicationFormatGridCellProvider` (`.inc.php` on 3.3) on each. On
  `main` also `publicationFormats.tpl`, `monograph_full.tpl` and
  `chapter.tpl` for where the link prints, both keys in every
  `locale/*/locale.po`, and the placeholders of every French (Canada)
  text of OMP's `locale/` and `plugins/` against its English.
- Introduced: `git log -S` of both texts on OMP's `locale/en_US` and
  `locale/fr_CA`. The two commits' issue numbers are from their
  messages; their pull requests were not looked up.
- Upstream: pkp/pkp-lib and pkp/omp searched by `directSales.purchase`
  (2026-10-02), "Approbation du format" and "Format Approval French"
  (2026-10-04): nothing on this fault.
- Fix trial: the scripts on `main` with the report's earlier diff
  applied to OMP's checkout (`node bin/try-fix.js apply`), which held
  these three texts unchanged, and again with it taken out. The trimmed
  diff was checked with `git apply --check` on the `main` and
  `stable-3_5_0` checkouts (2026-10-08).
- Not driven: 3.4 and 3.3 (read in the code only); French (France) and
  the other languages (read in the locale files only); a chapter's page
  and the table of contents with a priced file; a book with two priced
  formats; the window that takes availability back; the diff on 3.5.
- Unverified: whether Weblate holds corrected texts that have not
  reached the branches (its pages refuse a script, so it was not read).
  No way round for a press was tried: the Custom Locale plugin from the
  Plugin Gallery (not bundled with OMP), which lets a press override
  its texts.
