# A press manager deleting a series cover that is already gone gets a browser message with a raw code

- **Severity** low
- **Effort** small
- **Kind** defect
- **Affects**
  - main: OMP
  - 3.5: OJS, OMP, OPS (French (Canada), code; OJS and OPS by a category's cover)
  - 3.4: none (code; no cover "Delete")
  - 3.3: none (code; no cover "Delete")
- **Introduced** `pkp/omp#2157` for `pkp/pkp-lib#6002` · [7901cde3d3](https://github.com/pkp/omp/commit/7901cde3d3eed336b446fd6132853607497ceee0) · 2025-10-31 · Kaitlin Newson (kaitlinnewson)
- **Upstream** `pkp/pkp-lib#13635` (open), the same fault on `main` in English; it does not cover 3.5
- **Tracked in** spec U17 [OMP11](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U17-sections.md#omp11)
- **Checked** 2026-11-03, each branch's tip (the commits in Evidence)
- **Model** claude-opus-5-5

## Summary

A press manager has a series' "Edit" window open with its cover, and the
cover has meanwhile been deleted in another tab. Pressing the cover's
"Delete" and then "OK" pops a browser message reading
"##manager.categories.form.removeCoverImageFileNotFound##", where a
sentence should say the cover is already gone. The "Confirm" window stays
open, "OK" and "Cancel" still pressable and a spinner beside "Cancel",
until "Cancel" closes it, and the series window keeps the picture and its
"Delete". Opened again after a reload, it shows no cover and only
"Upload File".

The same happens in two more cases:

- the series itself deleted from the table in another tab: the message
  reads
  "##manager.categories.form.removeCoverImageOnDifferentContextNowAllowed##";
- a series whose stored cover names files that an earlier failed save
  deleted, which the window shows as a broken picture
  ([pkp-e2e#952](https://github.com/jardakotesovec/pkp-e2e/issues/952)):
  the message reads "##manager.categories.form.removeCoverImageFileNotFound##",
  as if the delete had failed, yet after a reload the cover is gone.

The raw codes show in English and French (Canada); 19 other interface
languages, French and German among them, give a sentence. On 3.5 English
reads sentences, the series one naming a category, and French (Canada)
shows the same codes for a series' cover and for a category's on
journals, presses and preprint servers. On `main` a category's cover is
removed in its own window, without these messages.

`pkp/pkp-lib#13635` already reports the raw codes on `main` in English.
This report adds the steps through the screens for all three cases, the
3.5 French (Canada) gap, and a tried fix that covers all three places the
codes are used.

## Impact

- **Lost**: nothing. The manager reads a code instead of a sentence and
  may think the delete failed; a reload shows the cover is gone.
- **Who**: press managers under Settings › Press › "Series", when the
  cover or the series was deleted in another tab or by another manager,
  or an earlier save left a broken picture; on 3.5 also managers working
  in French (Canada) on a category's cover.
- **Way round**: reload the page ("Cancel" closes the "Confirm" window
  on `main`; on 3.5 only the reload does).

Low: a raw translation key in a rarely met state, and the outcome is
right.

## Steps to reproduce

Preconditions:

- PKP's default test dataset, OMP `main` (press `publicknowledge`; its
  series "Library & Information Studies", path `lis`, has no cover).
- Two pictures on the computer: `cover.png`, any sound PNG, and
  `damaged.png`, the same 2×3 PNG as in
  [pkp-e2e#952](https://github.com/jardakotesovec/pkp-e2e/issues/952)
  (the last byte of its picture data's checksum changed):
  `echo iVBORw0KGgoAAAANSUhEUgAAAAIAAAADCAIAAAA2iEnWAAAAEElEQVR4nGP4z8AARAwoFABE0AX7pM/efwAAAABJRU5ErkJggg== | base64 -d > damaged.png`

The cover already deleted in another tab:

1. Sign in as `rvaca` (Press manager) and open Settings › Press › "Series".
2. On "Library & Information Studies", open the row's arrow, press
   "Edit", and under "Cover Image" "Upload File" `cover.png`; "Save".
3. "Edit" it again (tab 1): "Current Image" shows the picture with "Delete".
4. Open Settings › Press › "Series" in a second tab, "Edit" the same
   series, press "Delete" under the picture and "OK". The picture goes.
5. Back in tab 1, press "Delete" under the picture, then "OK".
6. Press "Cancel" in the "Confirm" window and in the series window; reload
   and "Edit" the series again.

The series deleted in another tab:

7. In tab 1, "Add Series": "Title" "u17hk5 Gone", "Path" "u17hk5gone", "Upload
   File" `cover.png`; "Save".
8. "Edit" "u17hk5 Gone" (tab 1).
9. In the second tab, reload the table; on "u17hk5 Gone" press "Delete"
   and "OK". The row goes.
10. In tab 1, press "Delete" under the picture, then "OK".
11. "Cancel" both windows and reload the table.

A cover whose files are already gone (the broken picture of
[pkp-e2e#952](https://github.com/jardakotesovec/pkp-e2e/issues/952);
deleting the series' two cover files from the press's `series/` folder
on the server gives the same state):

12. "Edit" "Library & Information Studies", "Upload File" `cover.png`;
    "Save".
13. "Edit" again, "Upload File" `damaged.png`, "Save". The window hangs
    with "Save" greyed out
    ([pkp-e2e#952](https://github.com/jardakotesovec/pkp-e2e/issues/952));
    press "Cancel".
14. Reload and "Edit" again: "Current Image" is a broken picture.
15. Press "Delete" under it, then "OK"; "Cancel" the "Confirm" window
    and the series window.
16. Reload, "Edit" again; then open the series' page,
    `/index.php/publicknowledge/catalog/series/lis`.

**Expected**: at steps 5, 10 and 15 a sentence in the page's language
saying what happened (the cover, or the series, is already gone), in
place of a code.

**Observed**: at step 5 the browser alert reads
`##manager.categories.form.removeCoverImageFileNotFound##`. The
"Confirm" window stays open with "OK", "Cancel" and a spinner beside
"Cancel", and the series window keeps the picture and "Delete". The request and its answer:

```
POST /index.php/publicknowledge/$$$call$$$/grid/settings/series/series-grid/delete-image?seriesId=1  200
{"status":false,"content":"##manager.categories.form.removeCoverImageFileNotFound##","elementId":"0","events":[]}
```

Reopened at step 6, the window shows no cover and only "Upload File". At
step 10 the alert reads
`##manager.categories.form.removeCoverImageOnDifferentContextNowAllowed##`
(the same answer shape), and at step 11 the table has no "u17hk5 Gone".
At step 15 the alert reads
`##manager.categories.form.removeCoverImageFileNotFound##` and the window
keeps the broken picture; at step 16 the window offers only "Upload File"
and the series' page shows no picture.

[3.5: the same steps in English give sentences: "The cover image and
thumbnail files could not be found. They may have already been deleted.
Try reloading the page." at steps 5 and 15, and "The category does not
exist or belongs to a different context. Please ensure you are working
with the correct context and try again." at step 10. There "Cancel"
does not close the "Confirm" window; a reload does.]

The control: step 4's "Delete" on a cover that is there answers
`{"status":true,…"events":[{"name":"fileDeleted"}]}`; the picture goes and
no alert shows.

## Cause

OMP `SeriesGridHandler::deleteImage()`
(`controllers/grid/settings/series/SeriesGridHandler.php`) answers its
three refusals with two keys from pkp-lib's category namespace:
`manager.categories.form.removeCoverImageOnDifferentContextNowAllowed`
when the series does not exist or is another press's (line 413), and
`manager.categories.form.removeCoverImageFileNotFound` when the series has
no cover (line 418) or when `ContextFileManager::deleteByPath()` returns
false for either file (line 436).

Neither key has an English string on `main`. They were added to pkp-lib's
`locale/en/manager.po` by the `stable-3_5_0` work for `pkp/pkp-lib#6002`
([189a812293](https://github.com/pkp/pkp-lib/commit/189a81229359587e554f6fe5e850e1882e35d311)),
where the legacy category grid uses them too. On `main` that grid was
replaced by the categories API, and the pkp-lib side of `#6002` brought
no strings over, while OMP's `main` series handler
([7901cde3d3](https://github.com/pkp/omp/commit/7901cde3d3eed336b446fd6132853607497ceee0))
uses both keys. `Locale::translate()` has no fallback to English, so a
missing key renders as `##key##`, and the legacy `Handler.handleJson()`
shows a refused answer's `content` with `alert()`.

The broken-picture case reaches the third refusal: `deleteImage()` clears
the record (`setImage([])` and `Repo::section()->edit()`, lines 422–423)
before it deletes the files. The old cover's files are already gone:
`SeriesForm::execute()` deleted them (lines 281–282) before its decode
of the damaged picture failed, leaving the record naming them. So
`deleteByPath()` returns false, and the handler refuses although the
cover is now removed.

The "Confirm" window staying open is the legacy
`RemoteActionConfirmationModalHandler.remoteResponse()`, which closes it
only on a successful answer; every refused confirmation behaves so, and
the fix below leaves it.

Reach:

- **Other languages on `main`** (code): translation merges from
  `stable-3_5_0` brought both keys into 19 of pkp-lib `main`'s locales
  (ar, bg, cs, da, de, el, eu, fr, hy, ky, mk, nb_NO, pt, pt_BR, ru, sl,
  sr_Latn, tr, uk), which read a sentence; French (Canada) has neither.
- **3.5** (walked in English, French (Canada) in the code): the keys
  are in English, so the alert reads a sentence; the second one names a
  category on a series' window. French (Canada) has neither key and
  shows the codes. The legacy category grid's
  `CategoryCategoryGridHandler::deleteImage()` (lib/pkp, lines 340, 345
  and 363) uses the same two keys on all three apps.
- **Categories on `main`** (code): the legacy category grid is gone;
  the category window removes a cover through
  `CategoryCategoryController::saveCategory()`, which uses neither key.
- **Other callers**: none. No other code in pkp-lib, OJS, OMP or OPS on
  `main` uses either key (`git grep`).
- **3.4 and 3.3** (code): the series window shows the cover with no
  "Delete" (it came with `#6002` in 3.5).

## Proposed fix

Give the series handler OMP keys of its own, worded for series, as
`pkp/pkp-lib#13635` proposes, and use them in `deleteImage()`:
[fix.diff](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/series-cover-delete-raw-code/fix.diff).

```diff
--- a/controllers/grid/settings/series/SeriesGridHandler.php
+++ b/controllers/grid/settings/series/SeriesGridHandler.php
@@ line 413 @@
-            return new JSONMessage(false, __('manager.categories.form.removeCoverImageOnDifferentContextNowAllowed'));
+            return new JSONMessage(false, __('manager.series.form.removeCoverImageOnDifferentContextNotAllowed'));
@@ line 418 @@
-            return new JSONMessage(false, __('manager.categories.form.removeCoverImageFileNotFound'));
+            return new JSONMessage(false, __('manager.series.form.removeCoverImageFileNotFound'));
@@ line 436 @@
-            return new JSONMessage(false, __('manager.categories.form.removeCoverImageFileNotFound'));
+            return new JSONMessage(false, __('manager.series.form.removeCoverImageFileNotFound'));
--- a/locale/en/manager.po
+++ b/locale/en/manager.po
+msgid "manager.series.form.removeCoverImageOnDifferentContextNotAllowed"
+msgstr "The series does not exist or belongs to a different press. Please ensure you are working with the correct press and try again."
+
+msgid "manager.series.form.removeCoverImageFileNotFound"
+msgstr "The cover image and thumbnail files could not be found. They may have already been deleted. Try reloading the page."
```

The strings belong to the code that uses them: on `main` only OMP's
series handler does, and its sibling keys (`manager.series.form.*`) live
in OMP's `locale/en/manager.po`. The new key also drops the typo
"NowAllowed". The "files could not be found" sentence fits all three
cases, the broken picture included: it tells the manager to reload,
which shows the cover gone.

Tried on `main`: the three alerts now read "The cover image and thumbnail
files could not be found. They may have already been deleted. Try
reloading the page." (steps 5 and 15) and "The series does not exist or
belongs to a different press. Please ensure you are working with the
correct press and try again." (step 10). With the fix in and out, a
cover still on the server, given to the dataset's series "History" and
deleted, went at once with no alert.

**Alternatives**:

- Add the two `manager.categories.form.*` English strings to pkp-lib
  `main`, as on 3.5: the 19 translations would apply at once, but the
  second string would name a category on a series' window, and pkp-lib
  would hold strings only OMP uses.
- Answer success in `deleteImage()` when the files are already gone (the
  record is cleared by then): that would quiet the broken-picture case
  alone, and hide a file the server failed to delete.

**What goes with it**:

- As `pkp/pkp-lib#13635` says, the `manager.categories.form.removeCoverImage*`
  keys can then leave pkp-lib `main`'s locale files, since nothing there
  uses them.
- French (Canada) and the other languages get the new keys through
  Weblate.
- Backport to 3.5: the English strings are there, so the series
  wording is the only change the diff brings; French (Canada) has
  neither the old keys nor the new ones, so whichever keys 3.5 keeps
  need a French (Canada) translation, for categories too.
- Test: the e2e scenario in spec U17 (a **Planned** item): a series
  cover's "Delete" after another tab deleted the cover shows a sentence.

Small: three key names in one handler and two strings in OMP's English
locale file.

## Evidence

- Kept script:
  [walk.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/series-cover-delete-raw-code/walk.js)
  with its helpers in `lib.js`, on an install loaded from PKP's default
  test dataset (PostgreSQL), OMP only:
  `PROBE_FEATURE=<feature> PROBE_AGENT=<id> node bin/probe.js omp shared/playwright/checks/issues/series-cover-delete-raw-code/walk.js`
  (`WALK=neighbour` for the neighbour check). It writes its own
  `cover.png` and `damaged.png`, and records each "Delete" answer, the
  browser alerts, the "Confirm" window, the series window, the stored
  `image` value and the series' page.
- Walked on `main` (OMP) and on `stable-3_5_0` (OMP, in English).
- Fix tried on `main` (OMP): `node bin/try-fix.js apply shared/playwright/checks/issues/series-cover-delete-raw-code/fix.diff omp`,
  the walk, then `WALK=neighbour` with the fix in and after
  `node bin/try-fix.js revert …`.
- Not driven: French (Canada) and the other languages (read in the
  locale files); the "series of another press" half of line 412's check,
  which only a request built by hand reaches (code).
- Code reads: `SeriesGridHandler::deleteImage()` on `main` and 3.5;
  lib/pkp `CategoryCategoryGridHandler::deleteImage()` on 3.5 and
  `CategoryCategoryController::saveCategory()` on `main`;
  `SeriesForm::execute()` on `main`;
  `SeriesForm` and `seriesForm.tpl` on pkp's `stable-3_4_0` and
  `stable-3_3_0` (no delete link, no `deleteImage`); pkp-lib
  `Locale::translate()` and `getBundle()` (no fallback locale);
  `git grep` of both keys in each line's lib/pkp `locale/` and in the
  PHP of pkp-lib, OJS, OMP and OPS `main`; the legacy
  `RemoteActionConfirmationModalHandler.remoteResponse()`, which closes
  the "Confirm" window only on a successful answer.
- Introduced: blame on `deleteImage()` gives omp 7901cde3d3 (the
  handler and the two keys, `pkp/omp#2157`, merged 2025-11-03) and
  fd4ea260c7 (`pkp/omp#2528` for `pkp/pkp-lib#13631`, 2026-10-29, which
  added the line-418 check with the same key). `git log -S` on the keys
  in pkp-lib's `locale/en/manager.po` finds only 189a812293 and
  20a70e8ee1 ("review feedback", the "category" wording), both only on
  `stable-3_5_0`.
- Upstream search (2026-11-03), pkp/pkp-lib, pkp/omp and pkp/ui-library,
  issues and PRs, by the symptom's words and by both keys. Read: `pkp/pkp-lib#13635` (open, no linked PR: this fault on `main`,
  English, with the fix above); `pkp/pkp-lib#13631` and
  `pkp/pkp-lib#13633` (file names in the delete, closed); `pkp/omp#2156`
  and `#2157` (`#6002`'s PRs); `pkp/pkp-lib#6002` and `#8835` (the
  feature request).
- Branch tips: `main` OMP 828150a8f (lib/pkp 1ae711024a); `stable-3_5_0`
  OMP 9e2a7fd00 (lib/pkp c4c0aa8c52); `stable-3_4_0` OMP e92ae5b6d
  (lib/pkp f4719f2805); `stable-3_3_0` OMP 220e3e2f7 (lib/pkp
  5b26595791).
- Unverified: nothing here depends on the database; MySQL not checked.
