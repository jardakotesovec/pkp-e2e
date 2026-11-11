# CI triage — known problems & failing tests

Known-red tests on `main`, confirmed upstream regressions awaiting a fix,
the flake classes that mimic regressions, and the companion branches
waiting on app PRs. MAINTENANCE "Standing duties"
and "A developer's PR fails the suite" say what to do with them.

**Where to look.** Besides this repo's `e2e` workflow, every app repo runs
the suite through its thin hook on every push to its `main`. The latest run
on `pkp/<app>` Actions (main branch) is the authoritative answer to "is the
app's tip red?", and its head SHA is the commit to reproduce against.
`gh run view -R pkp/<app> <run> --log-failed` names the failed tests and
`gh run download -R pkp/<app> <run>` fetches the Playwright artifacts
(error contexts and `.server-logs/`) since 2026-09-12, when the bot's
token was reissued under the pkp org's 366-day lifetime cap for
fine-grained tokens; should it lapse again (`gh -R pkp/<app>` answers
403), run and job metadata stay reachable unauthenticated through the
public REST API and per-test detail comes from a local reproduction at
the head SHA. A local reproduction is still the evidence for a verdict;
the log only says where to look.

## Open — known-red tests on `main`

| ID | Signature (what CI shows) | Apps | Canonical entry | Status | First seen / last confirmed |
|----|---------------------------|------|-----------------|--------|-----------------------------|
| K-U64-A19 | U64 S8 (COUNTER reports on "Counter R5"): `input[name="begin_date"]` expected the first of next month, received the first of the month after (2026-10-31: expected "2026-11-01", received "2026-12-01"), red at both tries. Journal B's only article is published on the day the test runs, and the app's month arithmetic overflows on 29–31 January and on 31 March, May, August and October | OJS OMP OPS | U64 A19, `docs/issues/U64-A19-counter-r5-earliest-date-skips-month-after-31st.md`, pkp-e2e#1079 (an app defect; the test is right) | Dormant: green on other days, red again on 2027-01-29 … 31 and every overflow day until `CounterR5Report::getEarliestDate()` is fixed upstream; a red on those days is this row, not a regression | 2026-10-31 (nightly 41164101437) / 2026-11-02 (walked on `main` and `stable-3_5_0`) |

## Open regressions — confirmed upstream regressions awaiting a fix

One row per regression the sync loop confirmed on reset databases and
reported to the team (MAINTENANCE step 5), in territory no shipped suite
reds on. Re-checked against the new tips every sync (step 6) by re-running
its kept reproduction under `shared/playwright/checks/sync/`; deleted when
the fix lands (for a shared fix, its merge into pkp-lib or ui-library
`main`; MAINTENANCE step 6). A regression only the stable line shows (MAINTENANCE "The
stable line") names `stable-3_5_0` in its Apps cell and is re-run on that
line's fleet.

| Commit / PR | Surface | Apps | Reproduction | Reported | Note (one line) |
|-------------|---------|------|--------------|----------|-----------------|
| pkp/pkp-lib#11699 (`aff80d393e`, 2025-08-21, `I11702_ExtendTasks`; on `ore` too) | The 3.6 upgrade keeps `edit_tasks.status` (smallint, not null, default 1) that a fresh install lacks: `Blueprint::removeColumn('status')` drops nothing. No screen differs; upgraded and fresh schemas part | OJS OMP OPS · ore (code) | `checks/sync/pkp-lib-11699/check.sh <app> <n>` after a 3.5-dataset upgrade on a dataset fleet | 2026-11-09, [report](../reports/2026-11-09-pkp-lib-11699.md), posted in the daily thread | From the housekeeping Lead of 2026-11-09 (U12 sweep NOTE); fixed when both DBs print "absent" |
| pkp/pkp-lib#13545 for pkp/pkp-lib#13543 (pkp-lib `85e618b07f` lock removed and `d830a2a01b` map without context, Vitaliy-1, 2026-10-20; merged 2026-11-07 as `b793c1688b`, tree `6035a6fed8`; OJS `9cab42ec39` pkp/ojs#5946; `main` only) | Body Text "Export" (`PKP\bodyText\Repository::createGalleyFile()`): (1) exports of one version sent at the same moment each add a galley (four at once: 3 "HTML", 2 "PDF"); (2) `createHtmlFile()` without a journal in the request (CLI, job) throws `TypeError … Schema::__construct(): Argument #4 ($context) … null given` at `classes/bodyText/Repository.php:407`, the PDF export works | OJS (walked at the merged tip) · OMP, OPS: no Body Text API (code) · not ore, 3.5, 3.4, 3.3 (code) | `checks/sync/pkp-lib-13545/race.js` (dataset fleet; fixed when R1 and R2 each list one galley) + `cli.php` (`PKP_CONFIG_FILE=<ojs>/config.test.ds1.inc.php php …/cli.php <ojs root>`; fixed when H1, H2, N3 store an "HTML" galley) | 2026-11-09 (thread, @beaug) | Report: `docs/reports/2026-10-16-pkp-lib-13545.md` (moved up from pr-review at the merge); U48 A23, A24. Low, low. Fixes tried during the review: `lock-fix.diff`, `context-fix.diff` (both apply to `main`). |
| pkp/pkp-lib#9469 for pkp/pkp-lib#8887 (`aafa2d56e5`, `0a492918f1`, merged 2023-11-13; in every release from 3.5.0) | Editorial dashboard: the "Declined" view's role list (`Repository::mapDashboardViews()`, `TYPE_DECLINED`) leaves out `ROLE_ID_SUB_EDITOR` and `ROLE_ID_ASSISTANT`, so a section editor, series editor, moderator or assistant has no "Declined" entry and their declined assigned submissions drop out of every view; 3.4's "Archived" tab listed them. `main`'s "Search submissions" still finds them, 3.5 has no such box | OJS OMP OPS · stable-3_5_0 too (walked on all three) · ore by code · 3.4, 3.3 not affected (code) | `checks/sync/pkp-lib-8887/declined-view.js` on a dataset fleet; fixed when `dbuskins 1 views` lists "Declined" and `dbuskins 2 views listing <id>` names "Declined (1)", while `minoue`'s Declined view lists no row | 2026-10-28 (thread, untagged: asked in the channel) | Report: `docs/reports/2026-10-28-pkp-lib-8887.md`; U23 A1. Medium. Upstream `pkp/pkp-lib#13347` (open, Triage). Fix (`fix.diff`: the two roles added) tried on `main` OJS, OMP, OPS: assigned editor and assistant get "Declined (1)", an unassigned editor "Declined 0". |
| pkp/pkp-lib#13637 (pkp-lib `df42984b46`, OJS `c51c5caf1d` pkp/ojs#5994, OPS `ff72e607ef` pkp/ops#1465, 2026-10-27; 3.5 `a6ed3df00a`, `dce1f05be5`, `ef55e33bcd`; 3.4 and 3.3 ports merged) | "Create New Version" on a published article or posted preprint with a file galley: the Activity Log adds "Revision "article.pdf" was uploaded for file {n}." under the editor's name, and the copied file's history an upload, though nobody uploaded | OJS OPS · stable-3_5_0 too (walked, OJS and OPS) · 3.4, 3.3 by code · not ore (no twin); OMP has always logged its formats' copies this way | `checks/sync/pkp-lib-13637/version-log.js` (dataset or scratch mode); fixed when its header's "Reads fixed when" holds | 2026-10-28 (thread, @beaug) | Report: `docs/reports/2026-10-28-pkp-lib-13637.md`; U49 A18. Low. Fix tried on OPS `main` (`fix.diff`: a `$log` flag on `SubmissionFile\Repository::add()` as `edit()` has, `version()` passing false), reads fixed; `fix-ojs.diff`, `fix-omp.diff` dry-run only. Regression read rr13637. |
| pkp/pkp-lib#13608 (fix merged 2026-10-23 on every line: `main` `4271093dc3` #13613, 3.5 `dc1a84c50d` #13612, 3.4 `83e78a85e5` #13611, 3.3 `93722c9179` #13610; each `=` its reviewed head; the issue closed at the merge) | An intention gap left by the fix, not a regression: a site whose core version a plugin update already overwrote (OJS 3.4.0-10 after Dataverse 3.4.6.2: core 3.4.6.2) keeps it, and its next upgrade skips that release's steps scoped to its real version while reporting success | stable-3_4_0 (OJS walked; OPS by code) · main, 3.5, 3.3: none known (code) | `checks/sync/pkp-lib-13608/walk.js` (`--relabel … --core-upgrade` on the 3.4 line); fixed when an affected 3.4 site's upgrade records its real version and runs `I12140_MissingDecisionConstantsUpdate` | 2026-10-23 (PR review thread, untagged) | Report: `docs/reports/2026-10-23-pkp-lib-13608.md` (kept: the merged fix carries no repair, so the team has not acted on the finding). Medium. Repair diff tried on 3.4 (the report's Proposed fix). pkp/plugin-gallery#564 merged 2026-10-26 (`5cc30b2960`, `plugins.xml` = head `921d8a0936`): Dataverse 3.4.6.2 replaced by 3.4.6.3, whose `upgrade.xml` is a bare `<install>` (read 2026-11-03); it repairs no affected site. Moved here from the companion row at its merge, 2026-10-26. |
| pkp/pkp-lib#8920 (lib/pkp `b44cf27793` via pkp/pkp-lib#11578, OJS `71a7bfccec` pkp/ojs#4963, OMP `a25dff8b5` pkp/omp#2081, OPS `43359941c6` pkp/ops#1067, 2025-08-01; `main` only, no 3.5 twin) | (1) an edit of a published item's metadata ("Title & Abstract", "Save") sends nothing to its contributors' verified ORCID records (OJS, OPS; a press deposits no works); (2) an item imported already published with Native XML is never indexed, so search does not find it until `tools/rebuildSearchIndex.php`: `MetadataChanged` / `BatchMetadataChanged` are still dispatched but nothing listens since the search rewrite | OJS OPS (1), OJS OMP OPS (2) · ore (code: pkp-lib `ore` carries `b44cf27793`) · stable-3_5_0 not affected (walked on OJS: the edit queues `MetadataChangedJob`, the import `BatchMetadataChangedJob`, which indexes it) | `checks/sync/pkp-lib-8920/metadata-changed.js` (helper `run-one.php`) on the sync fleet; fixed when the edit queues a send for the verified contributor (OJS, OPS) and the imported item is found by search without a rebuild | 2026-10-22 (thread, @beaug) | Report: `docs/reports/2026-10-22-pkp-lib-8920.md`; U04 A23, U15 A19 (the edit's search half is U15 A3, pkp-e2e#704). Medium. Lead handed over by housekeeping 2026-10-22, read by rr1022d; ORCID side read from the `jobs` table (no ORCID stand-in on the slot fleet). Related open upstream: pkp/pkp-lib#8435. |
| pkp/pkp-lib `7269eaf6f0` (2026-10-20, "Improve hygeine of file upload validation", issue pkp/pkp-lib#13560, direct commit; 3.5 twins `aeacc41746` + `68512b5fda`, 3.4 `85f47442cf`, ore `82d1313c58`) | `POST …/submissions/{id}/publications` (a new version by program) with an accepted cover image answers 200 and creates the version without its cover; the moved picture stays in the public folder with nothing pointing to it | OJS OMP OPS (their `lib/pkp` pointers at `1f415a07ca` carry `7269eaf6f0` since 2026-10-21; walked with `lib/pkp` pinned there the same day) · stable-3_5_0 too (walked on OJS) · ore (OJS `ore`'s pointer `6d2e143ee0` carries `82d1313c58` since 2026-10-21; by code) · 3.4 by code | `checks/sync/pkp-lib-13561/cover-on-add.js` on a dataset fleet; fixed when its header's "Reads fixed when" holds (the console line's `coverImage.en` names `submission_<id>_<p>_coverImage_en.png`) | 2026-10-21 (thread, @beaug) | Report: `docs/reports/2026-10-21-pkp-lib-13561.md`; U49 A16. Low. Before on OMP and OPS's lagging pointer (cover stored), after on OJS with lib/pkp at pkp-lib `main` and on OPS pinned there, and OJS 3.5. Fix tried on OPS (`fix.diff`: `$publication->setData('coverImage', $value)` before `add()`'s `edit()`), reads fixed. Regression read rr13561 (found it independently). |
| pkp/pkp-lib `07bc43fe67` + `042726ebf6` (2026-10-16, issue pkp/pkp-lib#13512, direct commits; 3.5 twin `092ec34b0f`) | (1) Settings › Website › Setup › Highlights: replacing a highlight's picture with one the new check refuses (a PNG named `photo.jpg`) answers "There was an error uploading this image." after the old picture is deleted; the slideshow shows a broken image; (2) a category picture stored with no extension (`8-category`); (3) `POST …/submissions/{id}/publications` with a refused cover answers 400 yet adds the version | OJS OMP OPS · stable-3_5_0 too ((1) and (3), walked; (2) `main` only) | `checks/sync/pkp-lib-13512/followup.js` on a dataset fleet; fixed when its header's "Reads fixed when" holds | 2026-10-19 (thread, @beaug) | Report: `docs/reports/2026-10-19-pkp-lib-13512.md`; register entries U11 A11, U16 A25, U49 A12 (and A13 ❓). Medium (1), low (2), (3); the question (a PNG named `cover.jpg` now refused) is a ❓. Fix tried (`fix-followup.diff`: `ValidatorFactory::temporaryFilesAreImages()` in the highlight, publication and announcement `validate()`, the category controller passing the picture's extension), reads fixed on OJS, OMP, OPS. Regression read rr13512. ore does not have the commits. 2026-10-21 (daily sync): finding 4 added from the housekeeping lead (U49 A15: one temporary cover file under two languages answers 500, leaves a stray copy, and a POSTed version is created; before the change 200 with the English cover; fix tried, `fix-one-file-two-languages.diff`, reads fixed on OPS; `checks/U49/H21/h21.js` phase `cover`); `followup.js` re-run on OJS with lib/pkp at pkp-lib `main` `7269eaf6f0`: (1), (2), (3) and the question still as reported. |
| pkp/pkp-lib#10744 (merge `ce214a4820`, OJS `e2766a92b3`, OPS `21ba689811`, 2025-01-13; in every release from 3.5.0-0; `main` has no such path since OJS `71a7bfccec`) | ORCID on the Member API, jobs run by the CLI worker: publishing (or editing) an item whose contributor has a verified iD fails its `UpdateSubmissionSearchJob` and `MetadataChangedJob` three times ("Call to a member function getLocalizedName() on null", `CitationStyleLanguagePlugin.php:461`) into Failed Jobs; the search index's ORCID re-deposit is lost, and by the code the galley text index | stable-3_5_0 (OJS, OPS; OMP has no such call) | `checks/sync/pkp-lib-10744/cli-worker.js` on the line's campaign fleet; fixed when its header's "Reads fixed when" holds (no search or metadata job in `failedJobs`, `depositUrls` under the journal's own path) | 2026-10-21 (thread, @beaug) | Report: `docs/reports/2026-10-21-pkp-lib-10744-stable-3_5_0.md`. Medium. No register entry (`main` has no such path). Fix tried on OJS 3.5 (`fix-stable-3_5_0.diff`, a citationStyleLanguage plugin change), reads fixed. From the housekeeping lead of 2026-10-21 (U04 claim check cc21d), read by rr10744. |
| pkp/pkp-lib `266505ecd8` (2026-10-13, issue pkp/pkp-lib#13512, direct commit; 3.5 twin `2196fa2775`, the same patch) | Settings › Website › "Appearance": a "Logo", "Homepage Image" or thumbnail in a picture type the box accepts but `getImageExtension()` lacks (BMP, SVG), or a journal style sheet that finfo reads as `text/x-asm`, `text/troff` or empty, shows "Saved", is not stored, and `[]` replaces the setting: an existing logo or style sheet disappears from every page, with no message | ore (OJS) only: fixed on `main` by `07bc43fe67` + `042726ebf6` and on stable-3_5_0 by `092ec34b0f` (2026-10-16; walked 2026-10-19 on OJS, OMP, OPS of both lines) | `checks/sync/pkp-lib-13512/refused-uploads.js` on a dataset fleet; fixed when its header's "Reads fixed when" holds (`logo-bmp`, `home-bmp` stored or refused with a message while the PNG logo stays; `css-asm` stored and applied) | 2026-10-14 (thread, @beaug) | Report: `docs/reports/2026-10-14-pkp-lib-13512.md`; U10 A21. Medium. Before side on OMP's lagging pointer (`1836046394`): all stored and shown. Fix tried (`fix.diff`, `fix-ojs.diff`: refuse with a message in the API's validation, keep the old value, take a `.css` name with a `text/*` type), reads fixed on OJS `main`. 3.4 and 3.3 do not have the commit. 2026-10-19: reads fixed on `main` and 3.5 (`.reports/r13512/s1019/`, `.reports/r13512-3_5/s1019/`); `ore` at lib/pkp `186654a359` (has `266505ecd8`, not the fix) still shows it, walked on the ore worktree (`.reports/r13512-ore/s1019/`); delete this row and the report once `ore` takes the fix. U10 A21 retired. |
| WeblateOrg/language-data `1d5b84f67d` (2026-09-30, "prefer nb for Norwegian Bokmål"; not a PKP commit: pkp-lib's `ComposerScript::weblateFilesDownload()` downloads `languages.csv` from that repo's `main` at every `composer install`) | Norwegian Bokmål (`nb_NO`) is no longer a valid language: "Install Locale" drops it; on a site that has it installed, Administration › "Site Settings" and every journal's Settings › Website answer 500 (`DomainException: Invalid locale "nb_NO"`), `/<journal>/nb_NO` 404 | OJS OMP OPS · stable-3_5_0 too (walked on OJS; OMP, OPS by code) | `checks/sync/weblate-nb/norwegian.js` on a dataset fleet (`DATA=old STEP=install`, then `DATA=new STEP=read`); fixed when `DATA=new` offers Norwegian Bokmål in "Install Locale" and its `read` matches `DATA=old`'s (settings 200, `/nb_NO` 200) | 2026-10-13 (thread, @beaug) | Report: `docs/reports/2026-10-13-pkp-lib-weblate-nb.md`; U57 A14. High. Fix tried (`fix.diff`: the download pinned to language-data tag 2026.10). The released 3.5.0-5 package (2026-06-30) predates it; the next 3.5 package and every `composer install` since 2026-09-30 carry it. Found as a lead of the housekeeping U56 claim check. |
| pkp/pkp-lib `151e6e9d69` (2026-10-07, issue pkp/pkp-lib#13438, direct commit; 3.5 twin `32fcca27bb`) | Held out of this repo until the maintainer says where it goes (the fix it has to propose is security-adjacent): the write-up is in the session's thread of 2026-10-08, the detail in pkp-e2e-sec (the sec-080 sighting of that date) | OJS OMP OPS · stable-3_5_0 too (OJS, OMP, OPS) | the two `check-sec-080-pkp-lib-13438-*.js` scripts under `../pkp-e2e-sec/findings/scripts/` (one on a dataset fleet, the write-up's steps; one on the campaign fleet), run from this clone with `node bin/probe.js`; each header says when it reads fixed | 2026-10-08 (thread, @beaug; @jarda.kotesovec for the placement) | Low. Reader rr13438, three reproductions with one cause; before/after on `main` (OMP's lagging pointer, OJS) and on 3.5 OJS (lib/pkp `08de256986`, `32fcca27bb`). No register entry until the call. Still reproduces 2026-10-09 on OJS, OMP and OPS at the tips (lib/pkp `1ee037aee5`, `03b9a78d8f`), the dataset script on freshly loaded fleets (`.reports/sync-ds/s1009-13438/`), and on OMP and OPS 3.5, whose pointers took the twin with `8094f06bf5` (`.reports/sync-3_5-ds/s1009-13438/`). Again 2026-10-29 on all three apps at the `main` tips (lib/pkp `df42984b46`) and the 3.5 tips (lib/pkp `a6ed3df00a`), twice each, from a U53 incidentals row (housekeeping claim check cc29c, kept script `shared/playwright/checks/U53/H29/h29.js`): `rvaca` and `dbarnes` on the `admin` row's "Edit" get the "Error" dialog and "No Items". |
| pkp/pkp-lib#12016 (`cb32f21f94`, 2026-01-06, for issue pkp/pkp-lib#11583) | A configuration file with no `strict` line (every 3.3-era file kept through an upgrade) now runs in strict mode (`PKPContainer`: `Config::getVar('general', 'strict', true)`; 3.5 and 3.4 read it as Off): the global `ASSOC_TYPE_*` aliases are gone, so the dashboard's "Search submissions" answers 500 "Undefined constant \"PKP\\submission\\ASSOC_TYPE_PUBLICATION\"" and lists "Search Results (0)" | OJS OMP OPS (`main` only; stable-3_5_0 does not, walked on OJS) | `checks/sync/pkp-lib-12016/no-strict-line.js` on a dataset fleet (`MODE=noline`, control `MODE=off`); fixed when `search.heading` reads "Search Results (1)" with `MODE=noline` | 2026-10-05 (thread, @beaug) | Report: `docs/reports/2026-10-05-pkp-lib-12016.md`; no register entry (configuration and upgrade are out of scope); U23 A17 and U39 A5 (pkp-e2e#698) are the bare-constant half. Medium. Fix tried (`fix.diff`: default `false`). |
| pkp/pkp-lib#13414 (`2e377d27fc`, merge `887ad73d6c`, 2026-09-30, for issue pkp/pkp-lib#13412; 3.5 #13413 `a9c76aed62`) | Users XML import: a file first imported on a 3.5.0 release (ended roles stored with the import day as start) and imported again after the update adds each ended role a second time, silently; Editorial History lists "2026 – 2020, 2018 – 2020" | OJS OMP · stable-3_5_0 too (walked there; `main` by code, the row comes from 3.5) | `checks/sync/pkp-lib-13412/legacy-reimport.js` (`PHASE=first` at lib/pkp `d3216eed72`, `PHASE=again` at the tip, `PKP_E2E_LINE=stable-3_5_0`); fixed when `again` leaves one "Section editor" row per user | 2026-10-01 (thread, @beaug) | Report: `docs/reports/2026-10-01-pkp-lib-13414.md`; U63 register. Low. Control at `8809a197de` (before #13412): nothing added. Fix tried (`fix.diff` in the same folder). |
| pkp/pkp-lib#13288 (merge `f38c4a4a10`, 2026-09-27, for issue pkp/pkp-lib#13286) | Upload wizard "Cancel" after a revision: (1) a second pick on step 1, then "Cancel", leaves the abandoned first pick as the file (`status:true`); (2) the same file revised in two tabs by one person: the second "Cancel" answers `status:false`, the window stays open, the file keeps the upload cancelled in the other tab | OJS OMP OPS (shared lib/pkp; (2) driven on OJS) | `checks/sync/pkp-lib-13288/cancel-picks.js` MODE=s1 / s1g / s2; fixed when `result-s1-<app>.json` `afterCancel` reads the original `article.pdf` and `result-s2-ojs.json` `cancelA` answers `status:true` | 2026-09-27 (thread + DMs to @beaug, @jarda.kotesovec) | Report: `docs/reports/2026-09-27-pkp-lib-13288.md`; U36 A23 (the second pick), A24 (two tabs). Regression: at lib/pkp `1ad4a14bb2` both restored `article.pdf` (`.reports/sync/s27before-13286/`). Cause: one session key per file, overwritten by every upload and removed by the first cancel; the restore ignores the posted `originalFile`. Minor. The #13286 fix itself holds (renamed file restored, the old row deleted). Still reproduces 2026-09-30 at ojs `7ce98ec09e` / lib/pkp `3dc90c81a6` (`.reports/sync/s30-13288/`: `afterCancel` "rev-one.pdf" on OJS and OMP; `s30-13288s2/`: `cancelA` `status:false`). |
| pkp/pkp-lib#12798 (pkp-lib#12959 `8240fbe6cc` + #13398 `1ad4a14bb2`, 2026-09-25) | The decision page "Move to Review" opens is headed "Move to Submission" on every submission, after a review round too (`record.tpl` calls `getLabel()` without the submission); the decisions API labels a recorded decision from the current rounds | OJS OMP | `checks/U32/K4/k4.js` (records the h1, breadcrumb and title); `checks/sync/pkp-lib-12798/decisions-label.js`; fixed when the h1 reads "Move to Review" after a round | 2026-09-26 (thread + DMs to @beaug, @jarda.kotesovec) | Report: `docs/reports/2026-09-26-pkp-lib-12798.md`; U32 A13. Minor. U32 S7/S9 were red on CI from 2026-09-26 00:31 until the maintainer's call the same day: the tests accept either heading and read the destination from the breadcrumb ("Move to Review"), `openDecision` (OJS `CopyeditingStagePages.js`) and `startMoveToReview` (OMP); restore the exact heading when the fix lands. Still reproduces 2026-09-27 at ojs `72b85f4ba0` / pkp-lib `26ae6431b5` (`.reports/sync/s27-12798/s1-ojs.json`: the recorded "Move to Review" relabelled "Move to Submission" once the round is cancelled). Still reproduces 2026-09-29 at ojs `9d9f116f38` / pkp-lib `fab29cfeca` and 2026-09-30 at ojs `7ce98ec09e` / pkp-lib `3dc90c81a6` (`.reports/sync/s30-12798/s1-ojs.json`: the recorded decision relabelled "Move to Submission"). Upstream issue closed 2026-11-04 with no fix; still reproduces 2026-11-05 at ojs `2db1d0b008` / pkp-lib `25fdc98a3e` and omp `828150a8f` / pkp-lib `1ae711024a` (`checks/sync/pkp-lib-12798/heading.js`, `.reports/sync/hd1105/`: h1 "Move to Submission" under the breadcrumb "Move to Review"; API relabel in `.reports/sync/rr1105b/`). |
| pkp/pkp-lib#13181 (commits `4d9ec3cbd0`, `aeac6f75cf`, 2026-09-16; no PR page) | Email-change links, (2) of the report (its (1), the site-level landing, risk accepted 2026-09-25 as U03 A18): a pending request's "reject" link in the shape mailed before the change (`{journal}/invitation/decline`), one-language journal on a two-language site: "Confirm Decline Invitation" ends in a blank GET 500, request still pending | OJS OMP OPS · stable-3_5_0 too | `checks/sync/pkp-lib-13181/emailchange-links.js`; fixed when `s4.chain` ends on the Contact tab with `s4.stillPending` 0 (the `s3` landings are (1), accepted) | 2026-09-17 (thread + DMs to @beaug, @jarda.kotesovec) | Report: `docs/reports/2026-09-17-pkp-lib-13181.md`. Cause: the email-change invitation is created without a journal (`BaseProfileForm::execute()`), so the new `Invitation::getContextPath()` answers `index` for it; the decline form's address takes the site path while its language segment follows the served journal. Weight minor (1) and low, transitional (2). Register entry in U03 for (1): A18, risk accepted by @jarda.kotesovec 2026-09-25 after @asmecher closed #13181 as "OK with the current behaviour" (2026-09-18); the row now tracks (2) alone. Reproduced three times 2026-09-17 on OJS `c0ca4b3caf` / pkp-lib `efbba94ae7`, twice on a freshly reset database (`.reports/sync/s17-13181/`, `s17-13181b/`). **2026-09-18**: OMP (`c6a132892`) and OPS (`4bb66b1469`) received the change with lib/pkp `1bcd4dd55f` and show both findings as OJS (`7c8d69af3e`) does, kept script on databases reset that morning (`.reports/sync/s18-13181-{ojs,omp,ops}/`); U03 A18 now covers the three apps, A3 and A1 retired (the same change fixed them, `checks/sync/pkp-lib-13181/a1-a3-redrive.js`). **3.5 shows it too**, at ojs `63c7e555cc` / lib/pkp `9ce915e07e` (twins `ac6b031624`, `78d439c8b8`; the kept script on the line's fresh OJS fleet, `.reports/sync-3_5/s18-13181-ojs/`: both landings `index/en/user/profile#contact`, `s4.chain` ending in GET 500, `stillPending` 1); the report carries the update. Still reproduces 2026-09-21 on `main` at ojs `cc81df882a` / pkp-lib `63945bbd82` (`.reports/sync/s21-13181/`: both landings `index/en/user/profile#contact`, `s4.chain` ending in GET 500, `stillPending` 1) and on the line at ojs `769450f2d4` / lib/pkp `6acb1be2eb` (`.reports/sync-3_5/s21-13181-ojs/`, the same three reads). Still reproduces 2026-09-22 on `main` at ojs `38781720df` / pkp-lib `f8bacd7658` (`.reports/sync/s22-13181/`: both landings `index/en/user/profile#contact`, `s4.chain` ending in GET 500, `stillPending` 1); the line's tips unchanged since 2026-09-21, not re-run there. Still reproduces 2026-09-23 at ojs `802202cb3e` / pkp-lib `5af3b39336` (`.reports/sync/s23-13181/`: the same three reads); the line unchanged, not re-run. Still reproduces 2026-09-24 at ojs `71bb244152` / pkp-lib `25182919bf` (`.reports/sync/s24-13181/`: both landings `index/en/user/profile#contact`, `s4.chain` ending in GET 500, `stillPending` 1; issue #13181 closed upstream, the behaviour unchanged); the line's new tip carries no #13181 change, not re-run. Still reproduces 2026-09-27 at ojs `72b85f4ba0` / pkp-lib `26ae6431b5` (`.reports/sync/s27-13181/`: `s4.chain` ending in GET 500, `stillPending` 1); the line unchanged, not re-run. Still reproduces 2026-09-29 at ojs `9d9f116f38` / pkp-lib `fab29cfeca` (`.reports/sync/s29-13181/`: `s4.chain` ending in GET 500, `stillPending` 1); the line's new tip carries no change to the email-change path, not re-run there. |

## Flake watch — known non-deterministic failure classes

Not regressions. The response is a targeted rerun and a dated tally on
the line (a line keeps its last three, and a class that is fixed and unseen for three weeks is deleted); a real investigation starts when the class's watch condition
trips.

- **U03 S13 "a leaked password refused" keeps the box ticked** (OPS, serial). After the Site Administrator unticks "Check passwords against compromised password databases" and saves (the site API answers 200, 15:45:45 in the server log), the leaked password is still refused one second later (`apps/ops/playwright/tests/serial/U03-user-profile.spec.js:122`, no "Your changes have been saved."), and the retry finds the box ticked at its start (`:80`) with no site save in between, so the untick was never stored. Sighted once: pkp-e2e dispatch 42387087096 (2026-11-07, the PR review of pkp/pkp-lib#13543 round 6, which touches neither the Security form nor the site API), shard 1/3, both attempts; 4/4 green alone on the VM at the same OPS head (`8d1c3ea59a`, `--project=ops-serial --no-deps`). Not diagnosed: whether the Security form's save sends the stale value or a parallel worker overwrites the site row. Watch: a second sighting, then capture the site POST body.

- **U11 S4 "highlights in a second language" reads another highlight's title** (OJS). The assertion on the French titles (`apps/ojs/playwright/tests/U11-highlights.spec.js:542`) expected `["Call for papers", "Appel à contributions"]` and received `["Call for papers", "Second call"]`; green on retry. Sighted once: pkp/ojs `main` hook run 41257374494 (2026-11-01, `bc4a83e9db`, shard 2/3). Not diagnosed. **Watch condition**: a second sighting on CI; then a diagnostician (a list read before the second language's save landed, or another test's highlight in the same journal).

- **U06 S1 "Enter details" text between two sends** (OJS). S1 compares the invitation wizard's "Enter details" step text on a second send to the same address with the first (`expect(second.detailsText).toBe(first.detailsText)`); run 41104707295 (2026-10-30, the PR review of pkp/pkp-lib#13659, which touches no role list) listed "Journal editor" at another place in the role list on the second send, green on retry. Watch: a second sighting → compare the role list as a set and the rest as text. **Tripped 2026-11-02**: run 41404043658 (branch `hk1102`, the French-race harness fix, which touches no invitation code), ojs 2/3, "Journal editor" last in the second send's role list, green on retry (five more sightings on 2026-11-02, all OJS, the same move: runs 41404043658, 41445429220, 41449420785, 41477171269, 41493964988). **Hardened 2026-11-03** (housekeeping): `readDetailsStep()` in the OJS and OPS `UserInvitationPages.js` writes the role drop-down's options in sorted order, the rest of the step still compared as text; S1 green twice on OJS and OPS, the U06 files green once (12 OJS, 13 OPS). Watch: one more sighting of a different difference → read that diff before widening the set.

- **Payment plugin groups in disk order** (U52 S1, OJS; OMP's U52 already asserted a set, T-omp-1). With payments switched on, Settings › Distribution › Payments draws "Manual Fee Payment" and "Paypal Fee Payment" in the order `PluginRegistry::loadCategory('paymethod')` reads the plugin folders, which a fresh CI install does not fix: run 40511504733 (2026-10-27, the PR review of pkp/pkp-lib#12874) drew Paypal first, red at both tries, green on the job's re-run. OJS S1 now asserts the groups as a set with "Setup" first (green locally on a fresh reset, 2 passed). Again 2026-10-28 (run 40667951466, the PR review of pkp/pkp-lib#13636, OJS shard 1, both tries): the "Payment Plugins" select's options, still asserted in order, drew "Paypal Fee Payment" first; OJS S1 now reads them as a set too, as OMP's S1 does. Watch condition: any other test that asserts the order of a plugin category's entries reds the same way.

- **Decision-wizard timing under load.** U26 S5/S7/S8, U49 S11 and U21 S10
  exceed their waits during full-suite runs and pass in isolation or on
  retry. The mechanism is app-changes row 9: the post-save publication
  refresh remounts workflow components mid-interaction, and under load the
  window widens. The harness mitigates with outcome-keyed retries and
  content-verified saves (U40 S4 on OJS and OPS, U49 S11 on OJS since
  2026-09-01); the fix is upstream. Reported to the team 2026-08-29.
  U26 S6 on OJS joined the list 2026-09-15 (the maintainer's second local
  8-worker run at the merged tips, `.reports/flake-local/run2.log`: the
  new-round wizard's composer mask still up after 30 s), green alone 2 of 2.
  **Watch condition**: a
  hardened test reds again with retries exhausted.
  **U40 S4 on OMP, mechanism found 2026-09-15** (a retained trace,
  `docs/reports/2026-09-15-flake-investigation.md`): `WorkflowPublicationForm`
  is one component instance for every Publication page, and on a page
  change it re-fetches the form without clearing the one on screen, so
  the previous page's form stays editable until the fetch lands and then
  resets. The test's fill and blur ran on the stale Title & Abstract form
  18 ms before the re-fetch landed; the PUT carried the seeded abstract.
  Patch: `docs/reports/2026-09-15-ui-library-publication-form-key.patch`
  (a fresh component per Publication section; the earlier
  `...-publication-form-clear.patch` kept the instance and cleared the
  form instead); the A/Bs are in the report.
  **Merged upstream 2026-09-15** (ui-library `70b0892042`): a section
  switch mounts a fresh form. Once the sync baselines carry it, the U40
  `blur()` before Save and app-changes row 9 (c) can be revisited.
  The U40 OMP file keeps traces on failure since 2026-09-15.
  **Baselines carry `70b0892042` since 2026-09-16** (sync); the U40 OMP
  `blur()` stays (a harmless commit), app-changes row 9 (c) is closed on
  the tips, (a) and (b) stay open. Again 2026-09-28 (U72 harness step, Mac, used OMP database): OMP U40 S6 red in the U40 regression run, green alone (`.reports/U72/harness/harness-log.md`). Again 2026-09-28 (U69 session, Mac, reset database, auto workers): OMP U40 S6 red in the OMP final, green alone (`.reports/U69/final-run-omp.log`, `alone-reds.log`). Again 2026-09-29 (U74 session, Mac, reset databases, auto workers): OMP U40 S6 red in the OMP final ("This field is required." not shown in 10 s), green alone (`.reports/U74/final-run-omp.log`, `alone-omp-reds.log`).
  **OMP U40 S6 diagnosed 2026-09-30** (housekeeping,
  `.reports/flake-0930/u40s6/`; CI 36529998661 and about ten local reds
  since 2026-09-20): not this class's remount. The second panel open waited
  for the form only, so French was picked before the publication fetch
  landed (A15's stale prefill), and the clear ran on a Title editor not yet
  initialized; under load its style sheets queue behind that fetch on the
  one-request `php -S`, the keys are lost and Confirm sends the English
  title. The OMP test now gates each open on the subtitle and waits for the
  editor (OJS and OPS already did): red 5 of 5 under a fetch-and-CSS hold
  before, 5 of 5 green after; the OMP U40 file 50 of 50 at eight workers.
  **Watch condition**: a U40 S6 red behind the new gates.

- **U01 S8 hangs on a used database** (OJS and once OPS, local only so far). After a
  day's probes, checks and suite runs on one database, "S8: editor
  impersonates a participant from the Participants panel" hit its 4-minute
  timeout twice in a row (the editor's dashboard showed 129 assigned
  submissions); it passed in 8 s right after `reset:ojs` and the final
  run was green. Seen 2026-09-05 (U29 session, `.reports/U29/pw-out-u01s8`
  in git-ignored scratch). A milder OPS sighting 2026-09-13 (U03
  revision, first local final at workers auto, a database reset that
  morning and used by three author runs): the impersonated author's
  workflow window opened but its "Submission {tag}" title was not found in
  10 s, green alone in 11 s (`.reports/U03/final-run-ops-run1-red.log`).
  CI runs on a fresh database, so no CI incident yet. **Watch
  condition**: S8 reds in CI, or a local run on a fresh database reds;
  then bisect the participant panel against submission volume.
- **Reviewer-indicator popover under load** (U23 S9, OJS). The row with
  two reviewers opens the wrong reviewer's popover (Paul instead of Julia)
  during a full-suite run and passes in isolation; the hover target is
  settled before both indicators have rendered. Seen once, 2026-09-04
  (U05 final run, `.reports/U05/final-run-ojs.log`), green alone and on
  the OJS re-run the same day; seen a second time 2026-09-13 (U04 final
  run, `.reports/U04/final-run-ojs-run1-red.log`), green alone in 14.7 s.
  Watch condition tripped 2026-09-13; **hardened 2026-09-14**: the two
  awaiting indicators share one accessible name ("Awaiting Response from
  the reviewer", the reviewer's name lives only inside the opened
  popover) and the submission's review assignments come back in no
  fixed order (`reviewAssignment/Collector.php` has no `ORDER BY`), so
  the class is "unordered same-status indicators", not a render race;
  `EditorialDashboardPage.openActivityPopoverFor()` now waits for the
  row's expected indicator count, opens the candidates in turn and
  returns the popover naming the reviewer (OJS S9's two Julia legs;
  the OMP S9 already tolerated either order). Green alone on OJS and OMP
  (14 s each). Seen 2026-09-15 in the maintainer's first local 8-worker run
  at the merged tips (`.reports/flake-local/run1.log`) at an earlier point:
  the search for the tagged row after the reviewer's accept found nothing
  in 30 s (the hardened opener was not reached); green alone 2 of 2.
  **Watch condition**: a red with the hardened opener.
- **The Notify window's template body never landing in the editor under
  load** (U41 S3, OJS, once). `PublicationScreen.notifyParticipant()`
  (`apps/ojs/playwright/pages/PublicationMetadataPages.js`, U40's helper,
  U41 S3's positive mail control) selects "Discussion (Submission)", waits
  for the template fetch, then waits 30 s for a TinyMCE editor inside
  `form#notifyForm` that is initialized and non-empty; in the U41 revision
  session's second OJS final at four workers on a reset database
  2026-09-16 (`.reports/U41/final-run-ojs.log`, the one red of 235, the
  13 serial tests skipped behind it) the window was open with the template
  selected and the fetch answered, but the editor's iframe held one empty
  paragraph for the whole wait (the error context). Green alone in 10 s
  right after (`.reports/U41/rerun-ojs-s3.log`), green in the day's first
  OJS final and in every author run. Second sighting 2026-09-16, the U43
  revision's first OJS final at four workers on a reset database (the one
  red of 236, `.reports/U43/final-run-ojs-attempt1.log`, the same
  `waitForFunction` timeout at the same line); third sighting the same
  session's second OJS final on a reset database, from U41 S1's mail
  control through the same helper (`.reports/U43/final-run-ojs.log`, the
  one red of 236, both times green alone right after,
  `rerun-ojs-s3.log` and `rerun-ojs-s1.log`). **Watch condition met, hardened
  2026-09-16** (sync session): `notifyParticipant()` waits 15 s for the
  template in the box and, when that runs out, fires the template
  select's change handler again, awaits its fetch and waits 30 s more (a
  content-verified bounded retry, the pattern above); U41 S1 and S3 green
  alone with it (`.reports/sync/s16-alone-ojs.log`, 11.0 s and 7.9 s).
  **Watch condition**: the hardened helper reds again with its retry
  exhausted.
- **Contributor reorder under load** (U41 S2, OPS; the OJS twin shares the
  code shape). The Cancel leg's "Increase position" press, issued right
  after "Order" while the list re-rendered into ordering mode, left the
  order unchanged for its 10 s wait: locally at four workers 2026-09-09
  (`.reports/sync/final-run-ops.log`) and on CI 2026-09-10 with the retry
  exhausted (pkp-e2e `main` run 34466942823, a docs-only push; the nightly
  34558837065 on the same tree and the newer OPS tip green). Watch
  condition tripped; hardened 2026-09-11: the leg is a content-verified
  bounded retry like the Save leg (re-enter ordering if dropped, wait for
  the row's own arrow, press, pass only when the list shows the move), on
  OPS and OJS. The OMP twin, left without it, red the same way in the
  sync session's OMP final at four workers 2026-09-14
  (`.reports/sync/final-run-omp.log`, the one red of 214; green alone in
  7.7 s) → hardened the same day with the same bounded retry (green
  alone twice). **Watch condition**: a hardened leg reds again with its
  retry exhausted.
- **Review wizard step not advancing on "Accept" under load** (U28 S10,
  OJS; the shared `ReviewerPages.accept()` serves OMP and OPS too). The
  one-click-access leg's accept press left step "2." disabled for its 30 s
  wait during local full runs at four workers: 2026-09-09 (sync session)
  and again 2026-09-11 (sync session, `.reports/sync/final-run-ojs.log`,
  the same `aria-disabled="true"` tab for 63 polls); green in 17 s alone
  both times (2026-09-12 rerun `.reports/sync/u28s10-rerun-0912.log`) and
  on CI at the same tips (run 34354844582). Watch condition tripped;
  hardened 2026-09-12: `accept()` is a content-verified bounded retry
  (press, wait up to 10 s for step 2 to become current, press again while
  the accept button is still offered, at most three presses). **Watch
  condition**: the hardened leg reds again with its retry exhausted.
  **Tripped again 2026-09-15** (sync session, the first OJS final at four workers on a reset database with the perf round-2 harness and `persistent = On`, `.reports/sync/final-run-ojs.log`: the same `aria-disabled="true"` tab for 63 polls after the hardened accept, one of three reds in 216; green alone in 45.9 s, `.reports/sync/s15-ojs-reds-alone.log`). Red again in the second OJS final the same day (`.reports/sync/final-run-ojs-attempt2.log`, one of two reds) and then **red alone** on that used database (`.reports/sync/s15-ojs-reds-alone2.log`, 1.2 min: the reminder-link leg's accept, the `2. Guidelines` tab disabled for 63 polls), the class's first alone red; green in the traced third final on a reset database (229 passed, 17.1 min) so still no trace, and green first try on CI the same day (pkp-e2e run 34952057769, ojs run 34956195225). Next step unchanged: a retained trace of the accept POST from a red run.
  **Sighted again on CI 2026-09-19** (pkp-e2e push run 35436736454 at
  `55bc9d0`, the U32 push: OJS red on U28 S10 on both attempts, 1.7 min
  each, 254 passed and the 15 serial tests behind it did not run; OMP and
  OPS green). Read by the U33 session before its own push run 35474559640.
  Again 2026-09-28 (U65 session, VM, reset databases, auto workers): OJS U28 S10 red in the OJS final, the only red of 600 (the serial and solo passes green), green alone in 45 s (`.reports/U65/final-run-ojs.log`, `alone-reds.log`).
  **Mechanism found and fixed 2026-09-29** (housekeeping,
  `.reports/flake-2026-09-29/u28s10/diagnosis.md`, from three CI traces of
  failed first attempts: ojs 36316939718, pkp-e2e 36381740615 and
  36418555304): the test's own race in the shared page object. The
  wizard's steps are jQuery UI tabs with remote panels, selected when the
  fetch starts; `accept()` counted the privacy box while step 1 was still
  empty, read 0, never ticked it, and every press was refused in the page
  ("This field is required.", no request), so the press-again retry could
  never help; one trace showed the other shape, "Continue to Step #3"
  pressed on the old step-2 form during its re-fetch. `expectStep()` now
  waits for the tab's loading and busy marks to clear and the form to
  attach; `accept()` presses once after step 1 is shown. With step 1 held
  3 s, or step 2's re-fetch and save held: red 10 of 10 before, 0 of 10
  after, each; OJS U28 `--repeat-each 5` at eight workers 80 of 80, every
  other wizard caller on OJS and OMP green once. Rule in patterns.md "UI
  realities". **Watch condition**: a U28 S10 red after the fix.
- **CI worker server refusing connections during the login smoke** (OJS
  job, once). The U06 push's run 34773613958 (2026-09-13, `main`) failed
  its OJS job on the shared login smoke alone: `socket hang up` on the
  scenario API and `net::ERR_CONNECTION_REFUSED` at `127.0.0.1:8000`
  on the retry too, so the worker server had died or never answered;
  the OMP and OPS jobs of the same run passed, and the U04 push's run
  34768503126 an hour earlier was green on all three. No local
  counterpart. **Watch condition**: a second CI job lost to a refused
  worker port; then read the job's server log step.
  **Diagnosed as a class 2026-09-29**
  (housekeeping, `.reports/flake-2026-09-29/u01s4/diagnosis.md`): U01 S4
  "recover a forgotten password" on all three apps (ojs 36322492229,
  36459832328; pkp-e2e 36414422622 OPS, 36428321161 OMP), each a page
  load with no answer (`ERR_EMPTY_RESPONSE`, a Chrome error page, a load
  timeout) in the first test its server served, green on retry; U01 S1,
  S5, S7 and U03 S1, S11 show the same on CI 2026-09-22..28. A worker
  `php -S` dying, not the test: the known OPcache fault (app-changes row
  18) on other classes, or the JIT CI's setup-php turns on
  (`opcache.jit=1235`; off on the VM; CI PHP 8.3.35 against 8.3.33); 0 red
  in 109 first-test runs here. An induced death gave CI's exact red 8 of 8.
  Now the server logs are appended across a shard's passes with a dated
  `[harness] php -S start`/`died (exit N)` line (`php-server.js`, rotated
  over 20 MB), and a failed test whose server died meanwhile carries a
  `server-crash` annotation, a stderr line and the log excerpt
  (`support/server-crash.js`, the auto fixture `serverCrashWatch`); nothing
  is retried. U01 plus shared `--repeat-each 5` at eight workers 51 of 51
  per app. **Watch condition**: a `server-crash` annotation on CI; read its
  exit code and the request it names. Open for the maintainer: CI without
  the JIT as an experiment. First read with the new logs the same day: push run
  36534260026 (`a110480`, OMP shard 3/3, the run's only red): worker 8103
  died four times in 35 s (exit 139, a segfault, each on a request still
  unanswered), and U20 S8's retry and U21 S8 were refused 0.6 s after the
  last death, inside the restart loop's one-second gap; U21 S8 green on
  its retry. None carried the annotation, since each started after the
  death line was written; the watch now reads back 5 s before a test's
  start (`LOOKBACK_MS`), checked on that log. First annotated sighting the
  same day: push run 36554899964 (`6aaa2e2`, OJS shard 3/3, the run's only
  red): worker 8000 segfaulted (exit 139) at 10:31:02 under U01 S7's
  sign-out (`ERR_EMPTY_RESPONSE`), and the retry, 0.6 s into the restart
  gap, was refused at the Login page, so S7 failed; the `server-crash`
  annotation named both. `php -S` logs a request's path only once it is
  answered, so the crashing request shows as a bare `Accepted` line: the
  path comes from the test's own step in the error context.
  Again 2026-10-01 (CI first attempts, green on retry, all exit 139): OMP
  U03 S6 (pkp-e2e 36919446668, :8100), OMP U03 S10 (36872303797), OPS U12
  S6 @solo (36853975923, 9 s into the solo pass); two deaths went
  unannotated, the test failing on `socket hang up` in the death's own
  second (OJS U03 S6 ojs 36672771134, OJS U12 S4 serial 36872303797): the
  watch read the log before the death line was written.
- **Enroll-reviewer form's "This field is required." not shown under
  load** (U27 S4, OJS, once). In the same 2026-09-13 second OJS final
  (`.reports/U05/final-run-ojs-attempt2.log`, U05 revision session, four
  workers, a used database) the "Add Reviewer" press on the empty
  "Enroll Existing User" form showed no "This field is required." for
  30 s; green alone in 14 s on the same database
  (`.reports/U05/u27s4-rerun-0913.log`). **Watch condition**: a second
  sighting; then retain a trace to see whether the press reached the
  server or the form re-rendered.
- **A page load hanging under desktop load** (U04 S6, OMP, once). `page.goto`
  to the scratch press's `/orcid/about` ran to the 60 s test timeout in the
  second U06 revision local final 2026-09-13 (load 15–19 on the Mac from
  the desktop, `.reports/U06/final-run-omp-run2-red.log`); green alone in
  5.4 s. **Watch condition tripped 2026-09-13** (U22 revision session,
  the first OJS final at four workers on the VM,
  `.reports/U22/final-run-ojs-attempt1.log`: U05 S6's `page.goto` of the
  emailed unsubscribe link on worker 8002 ran to the 240 s test timeout,
  the one red of 212; green in the next full run, red the same way in
  the third and the fourth, `.reports/U22/final-run-ojs-attempt{3,4}.log`,
  three of four). The worker
  server's log settles where it hangs: the second `goto` of the link,
  right after the same browser's other tab signed in and was closed,
  never reaches the server (the journal's last request is the closed
  tab's dashboard poll, six seconds earlier), so it is the browser, not
  the app; the OMP incident above was not traced. Two of three OJS
  finals on the VM: the leg wants the closed tab's requests settled (or a
  fresh page) before the `goto`, U05's session to decide. **Seen again
  2026-09-16** (the U41 revision session's first OJS final at four
  workers on a reset database, `.reports/U41/final-run-ojs-attempt1.log`:
  U05 S6 to the 240 s timeout the same way, the one red of 235, the 13
  serial tests skipped behind it; the serial project green alone in
  32.2 s, `.reports/U41/rerun-ojs-serial.log`). **Seen again 2026-09-29** (U66 feature session, the second OJS
  final on a reset database at the new lib/pkp `fab29cfeca`,
  `.reports/U66/final-run-ojs-attempt2.log`: U05 S6 to the 240 s timeout
  the same way, the one red of 612; green alone in the next minute,
  `.reports/U66/alone-ojs-U05S6.log`, then red the same way in the third
  final, `.reports/U66/final-run-ojs.log`, two of two at 8 workers: the
  closed-tab settle is still owed).
  **Diagnosed 2026-09-30** (housekeeping, `.reports/flake-0930/u05s6/`;
  OJS U05 S6 red 2 of 2 in a U66 final 2026-09-29 and on CI ojs
  35922632937): not the `goto` but `otherTab.close()` before it: the tab
  is closed right after the sign-in's commit, the renderer has not taken
  the page in, Chromium loses the close and skips its forced close under
  the debugger, so `close()` waits out the 240 s timeout. Harness fix:
  `closeTab(page)` (`support/tabs.js`, DOMContentLoaded first, a named
  failure at 30 s), used in U05 S6 and the four popups closed right after
  their commit (U08 on all three apps, OMP U73): red 7 of 8 under a 20×
  CPU throttle on the closed tab before, 0 of 24 after; U05+U08 and
  U04+U08+U73 245 of 245 at eight workers. Not this mechanism, unproven:
  CI ojs 35978377116's Profile-heading read and OMP U04 S6's plain `goto`.
  Rule in patterns.md "Auth-style redirects". **Watch condition**: a hung
  `close()` behind `closeTab`, or a second red of either unexplained read.
- **Submission wizard "Continue" not advancing under load** (U04 S10,
  OMP, once). The wizard's rail stayed on "2 Details" for the 20 s wait
  of `SubmissionWizardPages.continueTo()` after the Continue press in the
  first OMP final of the U22 revision session (2026-09-13, four workers
  on the VM, `.reports/U22/final-run-omp-attempt1.log`, the one red of
  210); green in the next full run (`.reports/U22/final-run-omp.log`).
  The same shape as the review wizard's accept leg above, on the
  submission wizard's own rail. **Watch condition**: a second incident;
  then `continueTo()` gets the same content-verified bounded retry.
  **Tripped 2026-09-13** (U24 revision session, the second OMP final at
  four workers, `.reports/U24/final-run-omp-attempt2.log`: U04 S10's rail
  on "2 Details" for the 20 s wait again, the one red of 214; the first
  OMP final of the same session had U21 S6 red on the same rail wait,
  `.reports/U24/final-run-omp-attempt1.log`, dated under the wizard-press
  entry above). **Hardened 2026-09-14**: OMP's `SubmissionWizardPages`
  gained a module-level `pressUntil()` in the OJS shape (an 8 s window
  per press, pressed again while the button is still offered, at most
  three times, then the 30 s wait) behind `continueTo()`, `openReview()`
  and `confirmSubmit()`; OPS's partial 5 s × 3 loop was replaced by the
  same helper on the same three methods. Green alone: OMP U04 S10
  (10.7 s), OMP U21 S6 (20.8 s), OPS U21 S6 (27 s). **Watch condition**:
  a hardened press reds again with its retry exhausted at four workers.
- **Author's save of a new version answered 401 on a used database**
  (U40 S3, OMP, local). After a day of repeats on one database, the
  author's Prefix save on the manager's fresh version got
  `user.authorization.accessibleWorkflowStage` ("You don't currently have
  access to that stage of the workflow") and the test's response wait ran
  out: 9 of 9 red across two bundles (stock and the keyed publication-form
  patch) on 2026-09-15, 6 of 6 green on both right after `reset:omp`, so
  database state, not the build. Not seen on CI (fresh database). **Watch
  condition**: a red on CI or on a reset database; then read which stage
  assignment the author's permission tick lands on.
- **Review Details window's star-rating radio not registering the click
  under load** (U27 S9, OMP, once). `ReviewerAssignmentPages.rateReview()`
  (`apps/omp/playwright/pages/ReviewerAssignmentPages.js:352`) `check()`s
  the "5 out of 5 stars" radio in the "Review Details:" window and the
  readback found it unchanged, "Clicking the checkbox did not change its
  state" (2026-09-16, the U49 revision session's first OMP final at four
  workers on a reset database, `.reports/U49/final-run-omp-attempt1.log`,
  the one red of 221 with every U49 test green; error context
  `pw-out-final-omp/U27-reviewer-assignment-Re-ee493-…/error-context.md`);
  green alone in 33 s (`.reports/U49/rerun-omp-u27s9.log`). The same
  symptom as the U27 S6 checkbox entry above, on a legacy window control.
  **Tripped 2026-09-16** (sync session, the OMP final at four workers on a
  reset database at the day's tips, `.reports/sync/final-run-omp.log`:
  the same "Clicking the checkbox did not change its state" on the "5 out
  of 5 stars" radio, the one red of 221); **hardened the same day**:
  `rateReview()` waits for the window's jQuery to go idle, then presses
  and re-checks the radio's state in a bounded retry (at most three
  presses) and asserts it checked before the save is awaited; green alone
  twice (`.reports/sync/s16-rerun-omp-u27s9-{1,2}.log`, 48.8 s and
  47.7 s). **Watch condition**: the hardened press reds again with its
  retry exhausted.
- **New reviewer missing from the Reviewers list under load** (U01 S6,
  OMP, once). After "Create New Reviewer" in the Add Reviewer window, the
  review stage's Reviewers panel did not list the throwaway reviewer's
  name for the 30 s wait (2026-09-15, the U25 revision session's third
  OMP final at four workers on a reset database,
  `.reports/U25/final-run-omp-attempt3.log`, the one red of 216; error
  context `pw-out-final-omp-attempt3/U01-login-and-sessions-…/error-context.md`);
  green alone in 9.1 s on the same used database
  (`.reports/U25/rerun-omp-u01s6.log`). Same family as the reviewer
  dashboard and Add Reviewer classes above: a list fetched again after
  the window closes. **Watch condition**: a second incident; then read
  whether the panel's reload after the window's save is awaited.
  (The 2026-09-17 incident, the "Workflow:" heading not visible in 20 s
  on a reset database, was the roster rehash that signed shared-persona
  sessions out at the start of a run, fixed 2026-09-23 in `UserSeeder`.)
- **Author's Title & Abstract section empty after the manager's publish**
  (U40 S3, OJS, once, local). After the manager published, the author's
  reload fetched the submission and the publication (both 200 in worker
  4's server log, `.reports/flake-local/server-logs-run3/server-8004.log`)
  but the section under "Publication: Title & Abstract" showed neither
  the "This version has been published and can not be edited." notice nor
  the form for 30 s, and no `_components/titleAbstract` request followed
  in 37 s (2026-09-15, `.reports/flake-local/run3.log`,
  `results-run3/U40-*/error-context.md`). The section's items are empty
  while `selectedPublication` is null (`useWorkflowConfigOJS._getItems`);
  green alone 3 of 3 and in the other three runs. The OJS U40 file now
  keeps traces on failure (`test.use({trace: 'retain-on-failure'})`, like
  the OMP one). **Watch condition**: a red with the trace; then read
  whether the publication fetch was aborted by a second `selectPublicationId`.
- **Dashboard heading "(0)" after a reload under load** (U23 S7, OJS,
  once). After `page.reload()` of the sorted address on a scratch journal
  holding 31 submissions the heading read "Active submissions (0)" for the
  whole 30 s wait (2026-09-15, the maintainer's first local 8-worker run
  at the merged tips, `.reports/flake-local/run1.log`; no artefacts kept,
  the next run wiped test-results); green alone 3 of 3. **Watch
  condition**: a second sighting with test-results kept; then read the
  list request the reload issued.
- **OPS U40 S1's undo read red on the Mac only** ("edit the title and
  abstract", `@smoke`; deterministic on the Mac, 2026-09-16/17). After
  `ControlOrMeta+z` in the Title editor the TinyMCE body reads "" instead
  of the restored title (spec line 263): red 3 of 3 for the U11 harness
  agent with and without its change (`.reports/U11/harness/pw-ops-u40-s1-unpatched/`),
  and in both U11 OPS finals on reset databases (`.reports/U11/final-run-ops-attempt1.log`,
  `final-run-ops.log`); the OJS and OMP S1 counterparts green on the Mac,
  and OPS green on CI (35017665886) and on the VM's final at the same tips
  (2026-09-16). A Mac-only class, so an OPS full run on the Mac reads
  146 of 147 by design until it is read; unverified hunch: Meta+z under
  headless Chromium on darwin against the keyed `WorkflowPublicationForm`
  (sync 2026-09-16). **Watch condition**: a red
  of this read on CI or the VM; until then the OPS full green on a Mac
  push is CI's. Again 2026-09-28 (U73 session, Mac, reset database, auto workers): red in the OPS final and red alone; serial and solo green in the final (`.reports/U73/final-run-ops.log`, `alone-reds.log`). Again 2026-09-28 (U69 session, Mac, reset database, auto workers): red in the OPS final; serial and solo green in the final (`.reports/U69/final-run-ops.log`). Again 2026-09-29 (U74 session, Mac, reset databases, auto workers): red in the OPS final and red alone (`.reports/U74/final-run-ops.log`, `alone-ops-reds.log`); serial and solo green in the final.
- **OPS U09 S4's Custom Block Manager row missing from the plugins grid**
  (OPS, once, 2026-09-27). In the U64 session's OPS final (reset
  database, auto workers) `tr.gridRow[id$="-row-customblockmanagerplugin"]`
  was not found within 30 s (`CustomContentPages.js:450`); green alone
  (`.reports/U64/final-run-ops.log`, `alone-ops-reds.log`). **Watch
  condition**: a second red at the same row wait.
- **OJS U18 S4 and S6 waits on the plugins grid** (OJS, once,
  2026-09-28). In the U72 session's OJS final (Mac, reset database, auto
  workers) S4's `pressOk()` saw no `manage` POST answer in 30 s
  (`WebFeedPages.js:586`) and S6's `tr.gridRow[id$="-row-webfeedplugin"]`
  was not found (`WebFeedPages.js:421`); both green alone
  (`.reports/U72/final-run-ojs.log`, `alone-reds.log`). Kin of the OPS
  U09 S4 plugins-grid row wait above. **Watch condition**: a second red
  at either wait.
- **OJS U20 S8's Google Analytics "Settings" window answering "Error"**
  (OJS, once on CI, 2026-09-28). On push run 36371844559 at `f8e211f`
  (OJS shard 3/3) the plugin's "Settings" opened the "An unexpected error
  has occurred." window on both attempts, so `#gaSettingsForm`'s
  `googleAnalyticsSiteId` box never came (`GoogleAnalyticsWindow`,
  `SearchEngineMetadataPages.js:522`); the job log carries no PHP error. App
  commits identical to the green run 36369222355; green locally at
  `f8e211f`, green on the shard's rerun (attempt 2), and the scheduled run
  36374699873 on the same commit green on every job
  (`.reports/U72/ci-36371844559/`). **Watch condition**: a second red at
  the same window; then capture the server log of that request.
- **U18 feed download named `rss.xmp` on the Mac** (U18 S1, S3, S7, S8,
  all three apps; deterministic on the Mac, 2026-09-26). The RDF feed's
  download comes out as `rss.xmp` where `WebFeedPages.js` expects
  `W.downloadName` `rss.rdf` (OJS spec line 276, and the same read in S3,
  S7, S8): red in all three U55 finals on reset databases at auto workers
  and red alone right after, 4 of 16 on each app
  (`.reports/U55/final-run-{ojs,omp,ops}.log`, `alone-<app>-reds.log`).
  U18 shipped from the VM with its finals green, and its CI push run
  36211491859 was red only on U32, so a Mac-only class like OPS U40 S1.
  Unverified hunch: headless Chromium on darwin picks the extension for
  the feed's RDF content type from the OS type table, where the VM and CI
  keep the server's name. Watch condition: a red on CI or the VM; until
  then a Mac full run reads four reds per app and skips the serial and
  solo projects, which need their own `--no-deps` run. Not driven by the
  U55 feature session that logged it; the fix (the expectation or the
  download read) is the next daily session's. Again 2026-09-28 (U69 harness regression, Mac, used databases): S1, S3, S7, S8 red alone on each app, `rss.xmp` (`.reports/U69/harness/pw-{ojs,omp,ops}-U18.log`). Again 2026-09-28 (U69 session, Mac, reset databases, auto workers): S1, S3, S7, S8 red in all three finals; serial and solo green in all three (`.reports/U69/final-run-{ojs,omp,ops}.log`). Again 2026-09-29 (U74 session, Mac, reset databases, auto workers): S1, S3, S7, S8 red in all three finals; serial and solo green in all three (`.reports/U74/final-run-{ojs,omp,ops}.log`).
- **Profile save response not seen in 30 s** (U03 S5, "cancel, and
  reject, an email change", OPS, once: 2026-09-23, the U36 session's OPS
  final on a reset database on the Mac at auto workers,
  `.reports/U36/final-run-ops.log`). `ProfilePage.waitForSave()`
  (`page.waitForResponse` on the tab's save POST) timed out at 30 s;
  green alone (`.reports/U36/alone-ops-U03S5.log`). Watch condition: a
  second sighting; then the error context says whether the save was
  never sent or answered before the wait was armed.
  **Diagnosed 2026-09-30** (housekeeping, `.reports/flake-0930/u03s5/`):
  the CI red (ojs 36429431746) is the `php -S` worker segfault class
  hitting the "Cancel" save in a pass's first minute, not a press race (0
  of 30 red under press-side levers); `waitForResponse` ignores a failed
  request, hence the bare timeout. `ProfilePage.waitForAnswer()` now fails
  at once with the URL and `net::ERR_…` and says on timeout whether the
  request left (6 methods, every ProfilePage caller). Moved under the
  segfault class; the 2026-09-23 local OPS sighting stays unexplained.
  **Watch condition**: a ProfilePage timeout whose request was answered.
  Again 2026-10-01 (CI), not this condition: OJS U03 S4
  (`ProfilePage.js:265`, pkp-e2e 36842671866) and OMP U03 S10 (`:243`,
  36872303797) are form waits whose tab fetch went unanswered (exit 139);
  `open()`/`expectOpen()` still give a bare 30 s timeout there.
- **A `php -S` worker segfault** (once, OJS run 33106002377, 2026-08-27,
  in-flight request most likely `GET /api/v1/_submissions/viewsCount`).
  The cascade it used to cause is fixed by the server restart loop
  (harness.md "Runtime model"), so a recurrence now costs one test. It was
  never pinned; if it recurs, add core-dump capture to CI before
  diagnosing.
  Pinned on OMP 2026-09-25 (app-changes row 18, deleted 2026-10-07): PHP 8.3's OPcache
  inheritance-cache bug php-src GH-20469 (fixed in 8.4.23+), the first
  category page in a process that loaded `APP\publication\Publication`
  first; this OJS case may be the same bug, unproven.
  **Diagnosed 2026-09-30** (housekeeping, `.reports/flake-0930/segv/`;
  its report, deleted 2026-10-07 once acted on by pkp/pkp-lib#12915): GH-20469 is
  confirmed for two class families on all three apps
  (`APP\submission\Submission`, `APP\publication\Publication`): a process
  dies on the first request that reaches the PKP parent first once an
  earlier request came in through the APP class (`getDAO(): DAO` typed
  returns); OPcache off removes it, JIT does not matter. It explains the
  11–13 OMP crashes the U16/U65 suites absorb in every 8.3.35 run (none on
  the PHP 8.4.26 branch run 36692593423) and one of the ten annotated CI
  deaths (36554816184 OMP :8103, U65 S4); the other nine show no
  parent-first request in 4,254 traced requests and did not reproduce
  (open: consistent with a CI-only fault, unproven). Proposed pkp-lib
  workaround (two `class_exists()` preloads in `lib/pkp/includes/bootstrap.php`,
  the 14a478bc53 precedent) proven through `auto_prepend_file`: class
  pairs 15 of 6,090 crashing to 0, OMP category and statistics pages 5 of
  5 to 0. Harness proposals not applied (diagnosis §6): a request-start
  log line, core dumps with a gdb backtrace on CI, the runner's CPU in the
  log, a no-JIT arm. **Watch condition**: an annotated death not in the
  two families; then take the proposals.
  **Tripped 2026-10-01** (housekeeping 2026-10-02,
  `.reports/hk02/flake-watch.md`): ten annotated or logged exit-139
  deaths on CI 09-30..10-01, none in the two families as far as the logs
  show (OJS U01 S4/S7, U03 S4/S6, U12 S4; OPS U12 S6 @solo; OMP U03
  S6/S10, U01 S4, U61 S5), each 9-63 s after its process started (174-439
  requests), where the in-family U65 deaths came after 10-12 min; the
  proposals are taken, the no-JIT arm first (diagnosis
  `.reports/flake-1002/segv/`).
  **Proposals taken 2026-10-02** (`.reports/flake-1002/segv/diagnosis.md`):
  every suite server writes a request-start line (`request-begin.php`), so
  a death names its request, pid and process age; CI keeps core dumps
  with gdb backtraces, the runner's CPU and PHP settings in the log, a
  deaths step and a `server-deaths-<app>-<n>` artifact (`bin/ci-cores.js`,
  `bin/server-deaths.js`); `run-app.yml` takes `php_ini_values`
  (`node bin/ci.js dispatch --php-ini-values …`, empty by default). The
  crash watch waits up to 5 s for the death line after a dropped
  connection (red 3 of 3 unannotated before, annotated 3 of 3 after,
  under an induced death) and drops a previous run's death; ProfilePage's
  tab waits fail at once on a dropped request (5 of 5 bare 30 s timeouts
  before, about 4 s after). One out-of-family death reproduced locally at
  CI's ini (1 in about 40 fresh-server runs with the tracing JIT, 0 in 10
  without): OPS U12 S6 @solo, 12 s into the process, the core in
  `zend_objects_store_del` called from JIT-compiled code at
  `PKPRouter::getRequestedContextPath`. CI arms, two runs each: JIT on 12
  deaths, JIT off 14, every one GH-20469 by its backtrace (U16 category
  pages, U65 statistics), none of the new kind, so the arms do not tell
  the JIT apart yet. **JIT off on CI 2026-10-02** (maintainer's call: as
  PHP ships and as the VM runs; `run-app.yml` writes
  `opcache.jit=disable` before `php_ini_values`, so a dispatch with
  `--php-ini-values opcache.jit=1235` still runs with it). The GH-20469
  deaths stay until the pkp-lib workaround lands. **Watch condition**: a
  death whose backtrace is not GH-20469; then read it.
  **2026-10-07** (housekeeping): the GH-20469 deaths' cause is fixed
  upstream by pkp-lib `d1c90fe604` (pkp/pkp-lib#12915, merged
  2026-10-05: the two `class_exists()` preloads in
  `lib/pkp/includes/bootstrap.php`, carried by the three apps' `main`; the
  stable lines do not carry it), and the suites' workarounds were removed
  today (OMP U16's category-page re-opens in `CategoriesPages.js`, OMP
  U65's `crashReplay()`), so a dropped answer now fails its test. A
  GH-20469 death on `main` from now on is a regression, not this flake.
  The watch condition stands for deaths of another kind.
- **Manage Emails template window gone before its "Saved" read** (U34 S7,
  OJS and OMP, CI). The nightly pkp-e2e run 35558115088 (2026-09-21, `main`
  at `735bb76`, the same tree and the same app tips as the green push run
  35534810553 seven hours earlier) red on U34 S7 on both attempts on OJS
  and on OMP: `ManageEmailsPage.save()` awaited the `POST …/emailTemplates`
  200 and then waited 30 s for a `[role="status"]` reading "Saved" inside
  the "Add Email Template" window, and the error context shows the window
  gone and the mailable's "Templates" list already holding the new
  template. Mechanism: `ManageEmailsPage.vue` `templateSaved()` runs
  `setTimeout(() => closeSideModal(EditTemplateModal), 1000)`, so the
  status lives one second after the save; the "Edit" of the default
  template through the same helper passed each time (the read landed
  inside the second), the "Add Template" one did not. Green alone on the
  VM at the same tips before any change (`.reports/sync/s21-u34s7-ojs-alone1.log`,
  15.4 s). **Hardened 2026-09-21** (sync session): `save()` in both
  `DecisionSettingsPages.js` no longer reads the status; it waits up to
  5 s for the window to close on its own and presses "Close" only when it
  is still open, and `addTemplate()` asserts the new template in the
  mailable's list; S7 green alone on OJS (20.1 s) and OMP (22.3 s),
  `.reports/sync/s21-u34s7-{ojs-alone2,omp-alone1}.log`. **Watch
  condition**: the hardened save reds again.
- **"Add Reviewer" search never rendered** (U28 S11, OJS, once). In
  the U42 session's OJS final on a reset database at auto workers on the
  Mac (2026-09-24, `.reports/U42/final-run-ojs.log`), "read an earlier
  round's review" waited 30 s in `addReviewer()` for the "Add Reviewer"
  window's `.listPanel--selectReviewer` search box, which never appeared;
  green alone right after (`.reports/U42/alone-ojs-U28S11.log`). First
  sighting. **Watch condition**: a second sighting; then read the
  window's list fetch in the trace (`pw-out-final-ojs/…U28…/trace.zip`).
- **A success toast read only after the action's own waits** (U35 S2,
  OJS, CI, once). The nightly pkp-e2e run 35683638739 (2026-09-22, `main`
  at `66021a2`) red on OJS U35 S2 on the first attempt (37.3 s): after
  the "Assign Participant" window's `okAndClose()` (the save response,
  jQuery idle, the window hidden) the 30 s wait for the "User added as a
  stage participant." toast found nothing; green on the retry (55.3 s),
  so the job passed and no artifact was kept. Mechanism: a toast lives
  5 s (`Page.vue` `expire: Date.now() + 5000`), so when the action's
  waits outlive it under load the read starts after the toast is gone;
  the same test's S8 already armed its toast waits before the action.
  **Hardened 2026-09-22** (sync session): `expectToastDuring(page, text,
  action)` in the shared `NotificationsPages.js` arms the toast wait
  before running the action; the twelve read-after-action sites in the
  OJS and OMP U35 suites (the Edit Assignment "OK", the Assign "OK", the
  Notify send) use it; both suites green alone after the change
  (`.reports/sync/s22-u35-{ojs,omp}-alone.log`). The 2026-09-23 U35
  transplant (`ac20788`) replaced those suites with the trial build's,
  whose S2 is another scenario and which read their toasts their own way;
  the class stands, `expectToastDuring` stays in `NotificationsPages.js`
  for the next site that reads a toast after the action. **Watch
  condition**: a U35 toast read reds on CI; then arm it with
  `expectToastDuring` (or the toast never rose: read the save response's
  notification payload).
- **Three first sightings in one Mac final set** (U46 session, 2026-09-24,
  reset databases at auto workers, each green alone right after). OJS
  U27 S11 "unassign before, cancel after, reinstate": the reviewer's row
  (`<name> More Actions`) not visible in 10 s, with a 500 on
  `GET …/_submissions/reviewerAssignments?active=true` in the worker log
  a minute before (`.reports/U46/final-run-ojs.log`, `alone-ojs-reds.log`).
  OMP U35 S7 "a role's options": the "Assign Participant" window's
  `filterUserGroupId` select not visible in 30 s
  (`final-run-omp.log`, `alone-omp-reds.log`). OJS U12 S6 "the site's
  announcements" in the `ojs-serial` project run alone after the final:
  the "Announcement type added." notice not found
  (`alone-ojs-serial-solo.log`, `alone-ojs-U12S6.log`). **Watch
  condition**: a second sighting of any; then read its trace. The U12 S6 sightings in the `<app>-serial` projects run alone after the finals (U10, U47, U50, U51, U53 sessions) were the solo project running beside the serial one under a combined `--no-deps` command, now refused by the config (2026-09-26). First sighting the same day of OMP U39 S2 "the Publisher Library on the Settings tab": the 180 s test timeout waiting on a "Press Library" row in the OMP final, green alone (`.reports/U47/final-run-omp.log`, `alone-omp-reds.log`). Again 2026-09-25 (U50 session, Mac): U12 S6 red in the `<app>-serial` project run alone after the finals on all three apps ("Announcement type added." not found), green alone right after on all three (`.reports/U50/alone-{ojs,omp,ops}-serial-solo.log`, `alone2-{ojs,omp,ops}-U12S6.log`). Again 2026-09-25 (U51 session, Mac): OPS U12 S6 red in `ops-serial` run alone after the OPS final ("Announcement type removed." not found), green alone right after (`.reports/U51/alone-ops-serial-solo.log`, `alone2-ops-U12S6.log`). Again 2026-09-26 (U53 session, Mac, reset databases, auto workers): OJS U12 S6 red in `ojs-serial` run alone after the OJS final ("Announcement type added." not found), green alone right after (`.reports/U53/alone-ojs-serial-solo.log`, `alone2-ojs-U12S6.log`).
- **U09 S6's formatted box stuck under TinyMCE's "Loading..." throbber:
  an app defect, not a race** (OPS 2026-09-25, the box holding "Welc";
  OPS 2026-09-27 on the VM, the custom block's English box, the click
  intercepted until the 180 s timeout; the same code on OJS and OMP).
  **Mechanism found 2026-09-28** (`.reports/flake-s28/u09s6-throbber/diagnosis.md`):
  in a legacy window with a second form language, pkp's `deactivate`
  handler (`SiteHandler.js`) calls `getContent()` on the French editor
  before it has loaded; the error ends the English editor's start-up
  after `initialized` and before the throbber is hidden, so the box never
  takes input (U09's register, crash: script). Lever
  `PLAYWRIGHT_IFRAME_HOLD='-fr_CA-'` with `PLAYWRIGHT_IFRAME_HOLD_MS=3000`:
  stuck 12/12 on the probe servers, 0/12 with the handler guarded in the
  page (the upstream fix's shape); S6 red 4/4 OJS, 4/4 OPS, 2/2 OMP under
  it. No workaround (it would hide the defect): `RichTextBox` now fails
  within 30 s naming the stuck editor; the U09 file `--repeat-each 5` at
  eight workers green 35/35 per app. **Watch condition**: a red naming a
  stuck editor is this defect (rerun); delete the entry when the handler
  is guarded upstream: CI loads the apps' committed `js/pkp.min.js`, so that is the app's bundle rebuild after pkp/pkp-lib#13490 (`main`) / #13491 (3.5) merge, not the pkp-lib merge itself (PR review 2026-10-14). The pkp-lib side merged 2026-10-14 (`689e7ec1a5`; 3.5 `4045d9241e`); app PRs with the rebuilt bundle were asked of @blesildaramirez by @asmecher on pkp/pkp-lib#13489. **Owed at each app's rebuild** (the sync that reads it): `checks/sync/pkp-lib-13490/stuck-editors.js` at the tip with `enable_minified = On` (`sides.sh` `head-min` side) reads the English box ready; then retire U09 A20 (its `Report: none` line) and delete this row. 3.5 took its rebuild on 2026-10-14 (ojs `71d1fe2046`, omp `a9ef737b7`, ops `c8824b4088`, each bundle differing from the last only by the guard): `stuck-editors.js` at the 3.5 OJS tip, `enable_minified = On`, dataset fleet, read both boxes ready, no stuck round in 8 (daily sync 2026-10-15, `.reports/r13489-3_5/tip1015/`); `main`'s bundles are not rebuilt yet.
- **Two contexts adding French at the same moment: one save answers 500**
  (found 2026-09-26 by the C fixer, 5 of 42 concurrent French
  scratch-context seedings on OJS and OPS, `.reports/flake-s26/fixC/diagnosis.md`
  block fixC-1): `Locale::installLocale()` →
  `installEmailTemplateLocaleData()` deletes and re-inserts the site-wide
  default email data with no transaction, so two concurrent installs of
  one locale meet a unique violation on `email_templates_default_data`.
  An app race that a person meets only when two managers add the same
  language at once; for the suite, a flake source whenever parallel tests
  seed French contexts. The spec holds it as U57 *Languages & locales*
  A6 ([U57](../specs/U57-languages-and-locales.md#a6)). Maintainer's call 2026-09-26: not a realistic problem for
  a journal; handle it on the test side, and take it upstream only if it
  keeps firing with no reasonable test-side fix. **Watch condition**: a
  French-context seed or save red with that 500 on CI. Sighted locally 2026-09-27 in
  the U57 OPS test author's run (S5 and S7 ticking French in one second,
  S7 500); U57's S5 and S7 run in one serial group in each app since.
  **Tripped 2026-11-02** (pkp-e2e nightly 41269163150, OPS U16 S1 and S7
  seeding 0.1 s apart, key 19 of 27, `SUBMISSION_NEEDS_EDITOR`); the
  bootstrap install the condition named would not help, since every
  install deletes and re-inserts the rows already there (U57 f-a6).
  **Fixed in the harness 2026-11-02** (`.reports/flake-2026-11-02/french-context-race/diagnosis.md`):
  `shared/playwright/support/locale-install.js` `withLocaleInstall()`,
  one language install at a time per test database, held by
  `createContext()` when a seed adds a second form language and by
  `LanguagesPages.js`'s grid ticks and "Install Locale" save. Under a
  lever (a third session holding the `fr_CA` rows 2.5 s): three seeds
  10/10 red per app before, 0/10 after; a tick against a seed 8/8 → 0/8
  (OPS); U16 S1+S7 `--repeat-each 5` 8/10 → 0/10. U16 and U57 50/50 per
  app without the lever; the French-seeding files and U57/U59 serial and
  solo green on OJS, OMP, OPS. **Watch condition**: that 500 on CI behind
  the lock (then a path that installs a language without it).

- **Order asserted on lists the app does not order** (settled
  2026-09-26 as one class: OPS U13 S1/S10 keywords, OMP U10 S5 masthead,
  OMP U08 S4 "renamed item last", OJS U35 S2 role list, U05 S7's Tasks
  pair, OJS U18 S5, U29 S9 and the unsighted sites of
  `.reports/flake-s26/fixlist-B.md`). PostgreSQL returns unordered or tied
  rows in storage order, which parallel writes change; a non-HOT update
  moving one row flips each sighted read deterministically (red 4 of 4,
  green 4 of 4 after, `.reports/flake-s26/fixB/diagnosis.md`). The tests
  compare sets (`shared/playwright/support/order.js`); eleven specs that
  claimed an order the query does not give were corrected (U08, U09,
  U12, U13, U18, U28, U29, U35, U42, U54, U55; new U13 A11 🐞: keywords
  lose the typed order on every save); galley seeds carry `seq`.
  **Watch condition**: a position read on a list whose query has no
  unique ORDER BY. Again 2026-09-27 (U71 session's OMP and OPS finals, VM slot s1, reset databases, auto workers): U54 S3 on both, "Data editor" the first row, green alone on both (`.reports/U71/final-run-omp.log`, `final-run-ops.log`, `alone-omp-U54S3-U14S5.log`, `alone-ops-U54S3-U14S5.log`). Again 2026-09-28 (U59 session's OPS final, VM, reset databases, auto workers): red, green alone (`.reports/U59/alone-reds.log`). **Diagnosed 2026-09-29** (housekeeping, `.reports/flake-2026-09-29/u54s3/diagnosis.md`): an app defect, U54 A1 set off by A13. The grid keys each page's rows 0…n−1 and adds no "Edit"/"Remove" to row id 0, and PostgreSQL stores a new role wherever its free space map offers room, often before the context's own roles on a used database; CI's six OJS S3 first-attempt reds of 2026-09-28 were all shard 1/3. U54 S3–S6 now run through `replayWhenFirstRow()` (a fresh scratch context only when the role opened is the list's first row, at most three attempts, an `app-defect` annotation), app-changes row 22. With a storage lever: red 10 of 10 before, 0 of 10 after; the three U54 files `--repeat-each 5` at eight workers green (35 + 40 + 35). **Watch condition**: a U54 red naming `FirstRowError` with its three attempts spent. Sighted and fixed 2026-09-29 (housekeeping, `.reports/flake-2026-09-29/u65s7/diagnosis.md`): OJS U65 S7 "downloading the reports", red on the first attempt of five CI runs on 2026-09-28 (pkp-e2e 36461456234, 36483369298, 36489553910, 36462286731; ojs 36475766741), compared the second "Review Report" download with the first line for line; the report orders by submission title only, so "Marsh survey"'s two reviewer lines swapped between requests (spec Rule 21: "in no set order"). The test now compares the headers, the title sequence and the lines as a sorted set: under a row-rewrite lever red 10 of 10 before, 0 of 10 after; the OJS U65 file `--repeat-each 5` at eight workers 40 of 40.

- **OMP U27 S9 and S16** (first sightings, the Escape sweep's runs
  2026-09-26, `.reports/flake-s26/esc/diagnosis.md`): S9 red 2 of 8 at
  HEAD under an animation-frame hold, lead: `openRowMenu()` returns
  `getByRole('menu').last()`, which can be the first row's menu still
  closing; S16 once in 95, the Review Details window showing "-" for both
  reviewer comments. **Watch condition**: a sighting in a final or on CI. First final sighting 2026-09-29 (U74 session, Mac, reset databases, auto workers): S9 red in the OMP final ("Modify Review" in the Review Details window not enabled in 20 s), green alone right after (`.reports/U74/final-run-omp.log`, `alone-omp-reds.log`); the watch condition is tripped, the trace read is the daily session's.
  **Diagnosed 2026-09-29** (housekeeping, `.reports/flake-2026-09-29/u27s9/diagnosis.md`).
  S16 fixed, the test's own race: the reviewer's step-3 comment boxes were
  typed before TinyMCE was `initialized`, and the editors' late content
  style sheets put the empty start value back, so the review went in with
  no comments ("-" for both). OMP `completeReview()`/`openModifyReview()`
  and the same-shape OMP `completeReviewAsReviewer`, OMP U23
  `submitAcceptedReview` and OJS `performReview` now wait for the editor.
  With the two style sheets held 4 s: red 11 of 12 before, 0 of 12 after;
  OMP U27 `--repeat-each 5` at eight workers 95 of 95 twice, OJS U27 90 of
  90, OMP U23 75 of 75, every other caller green once. S9's "Modify Review
  not enabled" did not reproduce in 45 runs under four levers (the
  `openRowMenu().last()` lead ruled out); `openReadReview()` now records
  the Review Details window's two loads, so the next red names the pending
  or failed one. **Watch condition**: an S9 red at "Modify Review"; read
  the recorded loads, `error-context.md` and the worker's server log.

- **OJS U34 S2 "the composer": the template search's "searching" state
  never seen** (`page.waitForSelector('.composer__templates__searching')`,
  `U34-editorial-decision-recording.spec.js:540`, 30 s after the CC field
  is cleared and "Sent to Review" typed into the template search). Lead:
  the state is transient, so a search that answers before the wait
  attaches leaves nothing to see. Sighted 2026-09-27 (U71 session's OJS
  final, VM slot s1, reset database, auto workers), the only red of 574,
  green alone (`.reports/U71/final-run-ojs.log`, `alone-ojs-U34S2.log`).
  **Watch condition**: a second sighting; then key the wait to the
  search's response instead of the transient class.


- **Eight first sightings in one Mac final set** (U74 session, 2026-09-29,
  reset databases at auto workers, each green alone right after,
  `.reports/U74/final-run-{omp,ojs}.log`, `alone-{omp,ojs}-reds.log`).
  OMP U28 S14 "left behind when the submission moves on": a
  `page.waitForResponse` not answered in 30 s. OMP U34 S8 "decline in
  French": the composer's `.composer__loadingTemplateMask` still there
  after 30 s. OMP U37 S4 "a task: begun, started, closed, overdue": the
  "Check the proofs" window's "Saved" status not visible in 30 s. OMP U37
  S11 "reviewers and the Author on a review stage": the "Review Tasks &
  Discussions" list still "Loading" after 30 s. OMP U38 S3 "file lines and
  "Download"": the side panel's history table not visible in 30 s. OJS
  U20 S5 ""Description" and "Custom Tags"": the search-indexing
  form's saved status not visible in 30 s. OJS U31 S2 (with S4, the
  error-dialog entry): "Reviewers Suggested by Author" not visible in
  10 s. OJS U47 S3 "edit and delete media files": a `page.waitForResponse`
  not answered in 30 s, then the page closed under it. All are waits on
  a server answer under eight workers after a long session on the Mac.
  **Watch condition**: a second sighting of any, or one on CI or the VM;
  then read its trace.

- **First sightings in CI runs of 2026-09-30** (U06 revision branch run
  36664968208 and the housekeeping branch, each green on its retry). OMP U03 S4 "change
  the email address by confirming the emailed link"
  (`U03-user-profile.spec.js:601`): after the link, `ProfilePage.expectOpen`
  found the heading but no `form#contactForm` in 30 s. The attempt carries `server-crash.txt` (exit 139): the segfault class (U03 S5 diagnosis 2026-09-30). OPS U60 S11 "Site
  style sheet" @solo (`serial/U60-site-settings.spec.js:797`): the site
  page's stylesheet list held the theme's sheets but not the uploaded
  site sheet. And OJS U12 S6 "the site's announcements" @solo in the
  housekeeping branch run 36698118029 (`AnnouncementsPages.js:783`, the
  save's POST not seen in 30 s; unlike the entry above, a CI run with the
  solo project alone). **Watch condition**: a second sighting of any;
  then read its error context and the worker's server log.
  Second sightings 2026-10-01: OJS U03 S4 (pkp-e2e 36842671866) and OPS
  U12 S6 @solo (36853975923), both exit-139 deaths, as were the 09-30 OMP
  U03 S4 and OJS U12 S6 (36698118029 `server-crash.txt`): both move under
  the segfault class. OPS U60 S11 stays open on its own condition.

- **The OPS wizard's galley "Add File" never offered** (U40 S11, OPS,
  CI once): the push run 36984010083 (2026-10-02,
  `main` at `c3edce8`, shard 2) timed out at 180 s in `addGalleyFile`
  (`SubmissionWizardPages.js:264`) still waiting for the author's
  "Add File" link on the Upload Files step; green on retry in 12.4 s. No
  server death in the job (`[server-deaths] total 0`). The error context
  is the manager's Distribution page (the test's first page), so it does
  not show the author's wizard. Read in the housekeeping session
  2026-10-05 (`.reports/hk05/u40s11/`). **Watch condition**: a second
  sighting; then read the retry's trace for the Files step's galley grid.

- **Uncaught "reading 'serialize'" after a "Selected Reviewer" window**
  (U31 S2/S4, OJS, CPU ×6, one sighting 2026-09-30 in the flake
  diagnosis `.reports/flake-0930/u31s2s4/diagnosis.md` T-ojs-1): a page
  error "Cannot read properties of undefined (reading 'serialize')" after
  a reviewer window was closed with text typed in its message and another
  opened and sent. Not reproduced by the housekeeping claim check of
  2026-10-05 (U27 I05: 100 suggestion-row and 48 Reviewers-panel
  sequences on OJS and OMP `main` at CPU ×6, every add "Request Sent", no
  page error; `.reports/U27/cc-I05.md` I05-5). **Watch condition**: a
  second sighting; then read the error's stack from that run.

- **OMP U36 S6's "Notes" tab press not taking** (OMP, once, pkp/omp
  hook run 37283929268 on `main` 8c807c919, 2026-10-05, green on its
  retry). `InformationCenter.selectTab('Notes')`
  (`U36-submission-files.spec.js:611`): the "Information Center:
  article.pdf" window was open and its tabs built (`ui-tabs-tab`), the
  "Notes" tab took the hover (`ui-state-hover`) but stayed
  `aria-selected="false"` for 30 s, so the press was lost, not slow
  (`SubmissionFilesPages.js:771`). **Watch condition**: a second
  sighting at a `selectTab` read; then read its trace for what the
  press met.

- **OMP U55 S3's settings-wizard first tab press not taking after a
  reload** (OMP, once, pkp-e2e push run 37639539599 on `main` 3fbc42be,
  2026-10-07, shard 3/3, green on its retry). `RestrictBulkEmailsTab.open()`
  after `reload()` (`NotifyUsersPages.js:364`, from
  `U55-notify-users.spec.js:110`): the wizard's first tab was visible with
  its label and took the click, and the side tab "Restrict Bulk Emails"
  never showed in 30 s, so the press landed before the reloaded page's
  tabs were bound; found by the CI tally, no earlier sighting on any app.
  **Watch condition**: a second sighting at that line; then gate the
  first-tab press on the tab's own panel being shown, as `selectTab`
  reads do.

- **OMP U55 S1's Users & Roles tabs read without "Notify"** (OMP, once,
  pkp-e2e branch run 39721397031 on `U01` at 3d344f0b, 2026-10-22, shard
  2/3, `omp-serial`, green on its retry). "S1: send an email to one role,
  then to two with a copy" (`serial/U55-notify-users.spec.js:150`):
  `notify.settings.topTabNames()` right after `notify.gotoPage()` read
  "Users, Roles, Site Access Options, ORCID", so `indexOf('Notify')` was
  -1; the tab list is read once, with no wait for the "Notify" tab (the
  manager's role was seeded just before). The branch changes only U01's
  suite and the harness's config variants. No earlier sighting at that
  line on any app; found by the housekeeping session's CI watch.
  **Watch condition**: a second sighting; then read its error context
  (whether the tab is missing or late) and wait on the tab's own name
  before reading the list.

- **OPS U42 S5's metadata settings save not answered in 30 s** (OPS,
  once, pkp-e2e push run 37763083478 on the branch `11718-main` at
  `7c3d8a63`, 2026-10-08, shard 1/3, green on its retry).
  `saveMetadataSettings` (`U42-citations-and-references.spec.js:188`,
  from `:729`, "S5: metadata lookup switched on"): the
  `page.waitForResponse` for the `POST …/api/v1/contexts/…` of the
  Metadata form's "Save" saw no successful answer in 30 s; the log
  carries no more, the trace was not read. No earlier sighting at that
  line on any app. **Watch condition**: a second sighting; then read the
  trace for whether the press reached the form or the save was refused.

- **OMP U28 S15's "submit this review?" dialog not shown in 30 s** (OMP,
  once, pkp-e2e dispatch run 37915669207 from `main` at `12e6e1d0` with
  pkp-lib pinned at pkp/pkp-lib#13479's head `50fb7ad3b2`, 2026-10-09,
  shard 3/3, green on its retry). "S15: two stages, no recommendation"
  (`U28-reviewers-review.spec.js:1491`): the confirmation dialog "Are you
  sure you want to submit this review?" never appeared after the press;
  the error context is in the run's `playwright-artifacts-omp-3`, the
  trace was not read. The PR touches `PKP\pid` and the lookup's first
  job only, nothing the review wizard runs. Likely a relative of the
  "Review wizard step not advancing" class above (U28 S10). **Watch
  condition**: a second sighting; then read the trace. **Second
  sighting 2026-10-16**: pkp-e2e dispatch run 38932643155 (the PR review
  of pkp/pkp-lib#13543, OMP at its tip `9f4393633e` with the pkp-lib and
  ui-library PR heads, which touch nothing the review wizard runs),
  shard 2/3, the same dialog locator at line 650, green on its retry.
  The watch condition is met: the trace (artifact
  `playwright-artifacts-omp-2` of that run) is owed to the next
  housekeeping session; not read in the review.
- **OJS U30 S3's "Submit Response" still disabled after the answer is
  typed** (OJS, once, pkp-e2e push run 37723842236 on `main` 0a3ac1a3,
  2026-10-08, shard 2/3, green on its retry; found by the CI tally of
  2026-10-09). `authorSubmitResponse`
  (`U30-author-response-to-reviews.spec.js:270`, from `:498`, "S3: the
  editor edits, deletes, and the author answers again"): after the body
  was typed (`pressSequentially`) and the author's box ticked, the
  window's "Submit Response" stayed disabled for the 10 s of
  `toBeEnabled`. Not the Escape class above (no menu is open at that
  line); the trace was not read. No earlier sighting at that line on any
  app. **Watch condition**: a second sighting; then read the trace for
  whether the typed text reached the box before the tick.

- **OMP U53 S1's first row read "Press editor" for the Site
  Administrator** (OMP, once, pkp-e2e push run 38735135797 on `main` at
  1a13854, 2026-10-15, shard 2/3, green on its retry; found by the CI
  tally of 2026-10-16). "S1: find a user in the "Users" list"
  (`U53-users-management.spec.js:572`): `rolesCell(adminRow)` on the
  scratch press's first row ("admin admin") expected "Press manager" and
  read "Press editor" for the 10 s; the name cell before it passed. No
  earlier sighting at that line on any app. Lead, not read: the cell
  names one of the administrator's roles on the scratch press, and which
  one may follow the query's row order (the class "Order asserted on lists
  the app does not order" above). **Watch condition**: a second
  sighting; then read the error context and the query behind the cell.
  **Second sighting** 2026-10-21, OJS (pkp/ojs run 39647753315 on `ore`
  at 10ca11dfaa, shard 2/3, job 119387718491, green on its retry; named in
  the housekeeping flake brief of 2026-10-22): the same line in OJS's
  twin (`U53-users-management.spec.js:567`, from `:518`), `rolesCell(adminRow)`
  on the first row ("admin admin", its name cell passed) expected
  "Journal manager" and read "Production editor" for the 10 s
  (`expect(locator).toHaveText(expected) failed`). The condition is met;
  not read further.

- **Docker Hub pull limit: a job dead at "Initialize containers".** Not a
  test red. The job ends in its first 30 seconds, its failed steps
  "Initialize containers" and "php -S deaths", its log `docker pull
  postgres:16` answered "toomanyrequests: You have reached your
  unauthenticated pull rate limit" three times; no test ran. The response
  is `gh run rerun <id> --failed` on pkp-e2e once the whole run has
  ended (on the pkp app repos the team re-runs), never an investigation.
  First seen 2026-10-09 from about 20:50 UTC: six of nine jobs of
  37989905679 and all seven of its re-run, all nine of `main`'s push run
  37992544935, and one job each of pkp/ojs 37989599624, pkp/omp
  37989611913 and pkp/ops 37989616213. Watch condition: a second day, or
  a whole run lost again, makes the friction line of 2026-10-09 (service
  images from a registry without the limit) a harness change.

- **OMP U03 S12's contributor window not closing after "Close"** (first
  sighting, pkp-e2e push run 38889807760 at b4be0ff0, 2026-10-16, shard
  2/3, green on its retry): `closeContributorEdit()`
  (`apps/omp/playwright/pages/SubmissionWizardPages.js`) pressed the
  window's "Close" and the `active-modal` holding the contributor's
  "Given Name" box was still there after 30 s; trace not read. Found by
  the housekeeping flake tally of 2026-10-20 (20 runs per repo).
  Second sighting: pkp-e2e push run 39365299288 at d4ad831, 2026-10-20,
  the second close (`U03-user-profile.spec.js:1497`). **Diagnosed and
  fixed 2026-10-22** (housekeeping,
  `.reports/flake-2026-10-22/omp-u03s12-contributor-close/diagnosis.md`):
  the test's own `browser.newContext()` (`freshLogin()`) ran without the
  fixtures' disable-motion sheet, so "Close" was pressed during the side
  window's 450 ms slide-in and the button-up landed on the moved header;
  red 5/28 under a stepped-animation lever, 0/38 after the fix, which
  arms every context a test opens (`support/base-test.js` `browser`
  fixture; 137 `newContext()` callers covered, none edited). Watch
  condition: a sighting with the fix in; then keep the attempt's trace.

- **OJS U51 S6's renewed row read a day early** (OJS, once, pkp-e2e push
  run 39517151988 at 24dfcf75, 2026-10-20, shard 1/3, job 118951937654,
  green on its retry; named in the housekeeping flake brief of
  2026-10-22). "S6: an individual subscription by hand: refused, saved,
  renewed and deleted" (`U51-subscriptions.spec.js:748`): after "Renew"
  answered "OK", `expect.poll(… rowCells(tab, 'Reed') …).toEqual(['Active',
  TODAY(), months(24)])` read `"2026-10-20"`, `"2028-10-20"` against
  `"2026-10-21"`, `"2028-10-21"` for the 10 s (`expect(received).toEqual(expected)
  // deep equality`). The attempt ran across midnight UTC (its ✘ at
  2026-10-21T00:00:12Z after 29.4 s). Lead, not read: the renewal's date
  and the test's `TODAY()` taken on two sides of midnight. No earlier
  sighting at that line on any app. **Watch condition**: a second
  sighting away from midnight UTC (then read where `TODAY()` and the
  renewal's date come from), or another midnight-spanning red of a test
  that compares a date with `TODAY()`.

- **pkp/omp's own Cypress: a proof file other than the newest assigned to
  the publication format** (pkp/omp `omp-stable-3_5_0` and `omp-main`,
  every DB job in turn, since at least 2026-09-24; investigated
  2026-10-23, asked by @jarda.kotesovec). Two signatures:
  `60-content/CallanSubmission.cy.js:168` waits for `epilogue.pdf` in the
  publication format grid and the next test ("Book is not available when
  unpublished", "Allan") follows it red;
  `integration/Z_MonographViewDCMetadata.cy.js:501` waits for
  `chapter3.pdf` in a before-all hook. Between them, 8 of the 10 red
  `omp-stable-3_5_0` runs since 2026-10-14 (e.g. 39895462899, 39656904989);
  `omp-main` shows both too (38982777309, 38279968910). Cause: both specs
  tick `selectedFiles[]:first` in "Select Files" expecting the newest
  upload, and the rows come from `Repo::submissionFile()->getCollector()`,
  sorted by `sf.created_at` alone (one-second precision; unchanged since
  2024). The data tests upload one file about every second (PKP's 3.5 OMP
  dataset: Callan's six files exactly one second apart, 25 same-second
  groups in the dump), so two files sometimes share a second and the
  database picks their order; the failure screenshots show `chapter4.pdf`
  and `chapter2.pdf` assigned instead. **Fixed upstream 2026-10-23** by
  @asmecher (Alec Smecher, `asmecher` on GitHub): pkp-lib `800863b5dc` (`main`) and `0f3c36bc2f`
  (`stable-3_5_0`), "Make sort order for submission files stable", a
  `submission_file_id` tiebreaker, newest first; OJS and OMP point at them
  on both lines (omp `186107aafe`, `8cc73c71a5`), OPS left to take it with
  its next pointer update. Kept check
  `shared/playwright/checks/sync/omp-proof-file-order/order.php` (the
  Collector's order with chapter4/epilogue or all six files tied, in a
  rolled-back transaction, default dataset, PostgreSQL): `chapter4.pdf`
  and `chapter3.pdf` first before the fix on both lines, `epilogue.pdf`
  first at the merged tips on both lines. OMP's Cypress specs not run here.
  The same runs' other reds are infrastructure: `pkp.sfu.ca/omp/xml/omp-version.xml`
  503 in the upgrade step (39604355752), nodejs.org's version index reset
  (39480881665), `setup-mariadb` (39810024130), Cypress's 120 s page load
  (2026-10-09, 10-14). **Watch condition**: pkp/omp's first runs at the
  fix (`omp-stable-3_5_0` 40031724936, `omp-main` 40031753818, queued at
  22:09 UTC); a sighting of either signature from then on is a new cause.

- **pkp/ojs, omp, ops `stable-3_3_0` Cypress (5.6): timing races in the
  data suite** (every `<app>-stable-3_3_0` push run; investigated
  2026-10-24, re-read 2026-10-27, both asked by @jarda.kotesovec). Before
  2026-10-21 every job died at login on the runners' Chrome 144+; pkp/pkp-github-actions
  `0bdd4bfe68` (Alec Smecher) moved `run-data-integration-tests.sh` to
  Cypress's bundled Electron 85, and two causes showed behind it (runs
  40044754020 ojs, 40044777999 omp, 40044832976 ops; 39787266156 ojs).
  (1) Fixed upstream 2026-10-24: `run-pkp-lib-and-plugin-integration-tests.sh`
  still passed `--browser chrome` (Chrome 155), so `Filenames.spec.js:113`
  and `Multilingual.spec.js:107` landed on the dashboard after the sign-in
  on every job that reached the step. pkp-github-actions `62823dc65d`
  (Alec Smecher) is the same switch to Electron this entry proposed; in the
  first runs after it (ojs 40421695180 and 40424833415, ops 40425488414,
  2026-10-27, pushes of pkp-lib#13623's copyright escaping) every job that
  reached the step passed both specs on Electron 85 (ojs 2, ops 8). OMP
  has had no `stable-3_3_0` run since the fix (latest 40044777999,
  2026-10-24 00:23 UTC, before it).
  (2) Flaky, test-side, all of the 2026-10-27 reds (ojs 18 of 20 test jobs,
  ops 2 of 10, close to 2026-10-24's 17 of 20 and 4 of 10): the data specs
  act before the page settles. OJS `CcorinoSubmission` (14 jobs),
  `AmwandengaSubmission` and OPS `CkwantesSubmission` type into
  `#metadata-keywords-control-en_US` right after clicking the Metadata tab:
  "Professional Development" / "Social Transformation" never appear, or
  "cy.type() failed because it targeted a disabled element"; OJS
  `VkarbasizaedSubmission` (3 jobs) clicks `button:contains("OK")` while
  the previous confirm is still in the DOM (2 elements); OPS
  `RbaiyewuSubmission` (new 2026-10-27, one job) clicks step 3's "Save and
  continue" and no `saveStep/3` request follows, so `submitStep4Form`
  never appears; OMP `CompetingInterests.spec.js` (app integration, seen
  once in 40057377979) visits `/login` while still signed in. A pinned
  Chrome 143 (`chrome143-check.yml`, run
  [40058677404](https://github.com/jardakotesovec/pkp-e2e/actions/runs/40058677404))
  lowered the rate (4 of 5 green) without removing it; the cure is in the
  specs. **Spec fix drafted 2026-10-27** (asked by @jarda.kotesovec), kept
  as `0001-ojs-spec-waits.patch` and `0001-ops-spec-waits.patch` in
  `shared/playwright/checks/sync/ci33-cypress-browser/` (the bot cannot
  push to pkp; both apply on ojs `c6590e2012`, ops `8b6f5c77e2`): the
  keyword steps wait for the workflow page's delayed grid load
  (`#contributors-grid .pkp_controllers_grid`, a second after mount), for
  the field to be visible and enabled, and for the suggestion
  (`#metadata .autosuggest__results-item`) instead of `cy.wait(500)`;
  Ccorino clicks both suggestions (`cy.get('li').contains()` held the
  list items from before the suggestions arrived, and under Cypress the
  arrow keys stay on the first item, so its `{downarrow}{downarrow}` path
  could not be made deterministic) and keeps `force: true` on its typing
  (the existing keywords' badges cover the input); Vkarbasizaed waits for
  the "Unpublish Issue" confirmation to leave, since its `#future`/`#back`
  visits only change the hash and do not reload. Tried with
  `spec-waits-check.yml` (pkp-github-actions@v1 plus one `git apply` step,
  full pkp matrix, throwaway branch since deleted): the final patch, run
  40531000868, OJS 9 of 10 green and the data suite green on all 10 (base:
  pkp's 40421695180 and 40424833415, 1 of 10 each); OPS's patch, unchanged
  since run 40523904611, 10 of 10 there and 10 of 10 in 40527747804 (base
  40425488414, 8 of 10). Two causes left, not in the patch: (a) the
  shared `cy.assignParticipant` (lib/pkp `cypress/support/commands.js`)
  clicks the user radio while the user-select grid refetches its rows
  (`fetch-rows` with the search filters, the infinite-scrolling feature)
  and the radio is detached (OJS `FpaglieriSubmission` 40523904611,
  `AmwandengaSubmission` 40424833415); (b) newly visible now that jobs
  reach the app integration step, OJS `Discussions.spec.js` #8097 (3 of
  30 patched OJS jobs: 40527747804 twice, 40531000868): after the declined
  close, "OK" sends no `update-query` request, so the new discussion never
  appears; the workflow page's delayed grid loads land between typing the
  subject and setting the TinyMCE comment in each, and both
  `cy.on('window:confirm')` handlers register at the start of the test,
  not in sequence; and `Crossref.spec.js` twice (40527747804, and pkp/ojs
  41859399429, the 8.1/mysql job of pkp/ojs#6021's check, 2026-11-05,
  its eleven other jobs green;
  `The handler "$.pkp.controllers.TabHandler" has already been bound`,
  in "Check Issue DOI Configuration"). Kept:
  `electron-check.yml`, `chrome143-check.yml`, `spec-waits-check.yml`.
  **Watch condition**: OMP's first `stable-3_3_0` run should pass the
  pkp-lib step; a `Filenames`/`Multilingual` red on 3.3 is now a new
  cause. Until the patches land, the data suite's reds are this flake
  class; once they land, a keyword or two-"OK" red in those four specs is
  a new cause, and the reds left are (a) and (b).

- **OJS U13 S2's JATS galley body text not shown in 30 s** (OJS, once,
  pkp-e2e run 40632510803, the U05 revision branch, 2026-10-28, shard
  2/3; green on the retry). `getByText('The body text of the JATS
  fixture, one paragraph.')` found no element within 30 s on the
  galley's view; the U05 change touches nothing on that page. The tally
  of the last 40 runs per repo also counts one U13 S2 red each on OJS
  and OPS on 2026-10-25 (the f1813 branches' mass red, not this
  class). **Watch condition**: a second sighting on CI.

## Companion branches — pkp-e2e branches waiting on app PRs

One row per branch prepared for a developer's open OJS, OMP or OPS pull
request (MAINTENANCE "A developer's PR fails the suite"), named exactly
like the developer's branch. State: `investigating` (reproducing, no
verdict yet) · `ready` (pushed, green at the PR ref, developer told) ·
`merged` (only while the sync line is written; then the row is deleted).

| App PR | Branch | State | Since | Note (one line) |
|--------|--------|-------|-------|-----------------|
| pkp/ui-library#1053 + pkp/pkp-lib#13776 (two English strings) + pkp/ojs#6060 (pointers) (`main`; issue pkp/pkp-lib#13767, Body Text citations linked to a references section in "Export to HTML", "Preview: PDF" and "Create PDF"; no OMP or OPS PR, no Body Text there) | `i13767_pdf_citations` | ready | 2026-11-11 | PR review asked in the thread. Heads `aa2485f872`, `5575e6ce33`, `2e292ffc28` (Vitaliy-1), each on its tip. Drive `checks/sync/ui-library-1053/cite.js` at head, base and head + `fix.diff`; regression reader rr1 (`.reports/sync/rr1/`). Report `docs/reports/pr-review/2026-11-11-ui-library-1053.md` (medium, small, intention gap): exported numbers are places in the whole References list while the section lists only cited references, unnumbered ("[2]", "[4]" over two entries); a typed "(2021)" exported as "(2)"; the JATS `<body>` repeats the references (low). Fix tried (`fix.diff`). U48 Rule 24f, ❓ A27 (a deleted reference stops every export) and A28 ("(Reference 2; Reference 4)" after a grouped citation), a Planned item, on the companion. CI 42994852594 at the PR refs: 9/9 green. Security: one routed (count only). Merge session: range-diff the merged heads, rebase, run, fast-forward; the report moves up or goes per what the merge carries. |
| pkp/pkp-lib#13742 + pkp/ojs#6041, pkp/omp#2560, pkp/ops#1490 (`main`; #13733, #6036, #2556, #1486 on `stable-3_5_0`; issue pkp/pkp-lib#13562, the 3.5 upgrade's I9707 mapped `supportedDefaultSubmissionLocale` by the first row only: one-language journals kept `sr@latin` and the wizard 500s) | `13562` | ready | 2026-11-06 | PR review asked in the thread. Heads `4f0121bc00`, `00cf428b34`, `eb343cf4bd`, `a745e7472c` (3.5: `d4b9d621ba`, `0b556f3311`, `22b75892d5`, `51664542f0`), bozana, all on their tips. `checks/sync/pkp-lib-13562/walk.js` on fresh datasets, OJS, OMP, OPS, both lines, and OJS `ore` with the diffs applied: base broken (the issue's TypeError, defaults left or overwritten), head fixed (I9707 per context from 3.4; the repair from 3.5 fixes defaults, submissions, drafts, re-runs unchanged). CI 42239486678 9/9 green; OPS MySQL job red in the Cypress data suite before the upgrade (not the PR), other PKP DB jobs queued at the verdict; 3.5 PRs' jobs red on the 26.04 runner image. Merge step: range-diff each merged commit, fast-forward the companion (the kept walk only, no spec change); `ore` needs a port. |
| pkp/crossref-ojs#117 + pkp/crossref-ops#74 + pkp/ojs#5977 + pkp/ops#1481 (`main`; #118, #75, #5978, #1482 on `stable-3_5_0`; issue pkp/pkp-lib#13591, U45 A18 / pkp-e2e#210, a DOI deposit that gets no answer from Crossref or DataCite stays "Submitted") | `pkp-lib-13591-main` | ready | 2026-11-05 | PR review asked in the thread. Heads `8a2335c21b`, `3535d54844`, `49f80fec9a`, `85500f3837` (3.5: `19a762a154`, `dc7447efcc`, `8928179c53`, `45f6e59ce1`), MarkusMachel. Walked base vs head on fresh datasets, main, 3.5 and `ore` (diffs applied): base "Submitted" (also with no failed job for a transfer error without a response, `cURL error 5`), head "Error" with "View Error" and the cURL message, "Has Error" lists it, the undeposited control unchanged. CI: OPS green; OJS reds all from the PR head lagging the tip (its `lib/pkp` and OJS `e421a8840c`), pkp/ojs merge-commit check 42055632645 green; the PRs' PHP test jobs still queued. Merge step: plugin PRs before the app pointer bumps; then U45 A18 retires (q53), pkp-e2e#210 closes once the fix shows on `main`; `ore` needs the DataCite port and a crossref pointer bump. 2026-11-06 (daily session): crossref-ojs#117 merged as `6d1e9c3641`, crossref-ops#74 as `133e1d47d2`, ojs#5977 as `2db1d0b008` (its diff = the reviewed head `49f80fec9a`'s by patch-id; OJS `main` points crossref at `8a2335c21b`), crossref-ojs#118 `13ed423c45`, crossref-ops#75 `5dd2881274`, ojs#5978 `62e09f86cb` (diff = `8928179c53`'s; OJS 3.5 points crossref at `19a762a154`), all 2026-11-05 18:02; ops#1481 and ops#1482 (the OPS pointer bumps) still open, so the companion waits. 2026-11-06: pkp-e2e#210 closed at the plugin merges; ops#1481 closed unmerged for pkp/ops#1494 (open, the OPS `main` crossref bump), #1482 still open, so the companion waits on #1494 (upstream-sync Leads). 2026-11-09 round 2 (kaitlinnewson): crossref-ojs#120 `14e6c5f16f`, crossref-ops#77 `937286a8ac`, ojs#6047 `acc4948fa2` (DOAJ), ops#1494 `cbfe5ed95e` (`main`); crossref-ojs#119, crossref-ops#76, ojs#6046, ops#1493 (3.4); ojs#6045 (`ore`); zenodo#13 already merged. Walked base vs head on fresh datasets, `main`, 3.4 and `ore`: OPS deposit, DOAJ ("Failed", listed under "Error"), the reference task (completes instead of an uncaught exception) and 3.4 Crossref/DataCite all fixed at the heads; the status lookup has no reachable route (500 at base and head). Merge step: plugin PRs before the pointer bumps; then U45 A18 retires once OPS `main` points past #74 (#1494), U63 OJS9 once #6047 merges (pkp-e2e#277 closes then). CI 42627169056 (merge commits) 6/6 green. |
| pkp/pkp-lib#13696 (`main`) + #13703 (`stable-3_5_0`), #13704 (`stable-3_4_0`), #13705 (`stable-3_3_0`) (issue pkp/pkp-lib#13693, `tools/installPluginVersion.php`: a `foreach()` warning in `Plugin::installEmailTemplates()`; no app PR) | `i13693_main` | ready | 2026-11-04 | PR review asked in the thread. Heads `e64cfd02c8` (jacksgt `i13693_main`, on `1ae711024a`, 2 behind the tip, the #13690 merge), `9f46087ed2`, `4feb4d7d2f`, `c9c50e080c` (bozana, each on its line tip); one line each, setting `$installer->installedLocales` to the default `Installer::preInstall()` uses on that line. Walked `checks/sync/pkp-lib-13693/walk.sh` on fresh dataset fleets, OJS, OMP, OPS on every line plus OJS `ore`, base vs the head's tool file (the file is identical at every app's pointer and the PR base): the warning at every base, none at every head. Locale data at the bases: 3.3 none (the issue's symptom); 3.4, 3.5 and `main` en and fr_CA already (the DAO falls back to the site's installed locales on `[]`), so there only the warning showed. At the heads the template text is written for every locale the app ships with an `emails.po` (OJS `main` 50, the site has 2), as an `Upgrade` does. `ore` (pkp-lib `f1585093d5`) carries the same bug and no PR targets it; the issue's own repro plugin, oreWorkflow, is an `ore` plugin. CI: [41841766584](https://github.com/jardakotesovec/pkp-e2e/actions/runs/41841766584) at `i13693_main` with `--pkp-lib-ref pull/13696/head` (log: `lib/pkp pinned to … = e64cfd02c8`): 9/9 green. No CI for #13703–#13705: the stable lines run no suite; their walks stand in. Findings: none. Security: none routed. **At the merge**: `git range-diff` each merged commit against its head; fast-forward the companion (the kept walk only, no spec change: CLI is out of test scope); delete this row and the remote branch. |
| pkp/ojs#5867 (`main`; issue pkp/pkp-lib#9170, every translation of titles, subjects and descriptions in the DataCite file, with `xml:lang`) | `f9170` | ready | 2026-11-03 | PR review asked in the thread. Head `57eb645396` (ajnyga `f9170`, one commit on `d054e2660d`, 19 behind OJS `main`, none touching the DataCite filter); OJS only, no pkp-lib or ui-library PR. Walked with `checks/sync/pkp-lib-9170/xml-lang.php` on PKP's dataset, base `e7ce037799` vs head: both languages sent and marked, kernel-4 valid; three intention gaps (bozana's issue points 1–3): empty translations sent (`<p></p>`, a `""` outside the form languages), an issue's alternative title marked `en` when its text is French, the TOC marked with the primary language. Fix tried (`fix-ojs.diff`, all eight records valid). Report `docs/reports/pr-review/2026-11-03-ojs-5867.md` (low, intention gap). The PR also fixes a supplementary-file export crash (`TypeError`) that `stable-3_5_0` keeps (incidentals U45). CI [41634163257](https://github.com/jardakotesovec/pkp-e2e/actions/runs/41634163257) at the PR's GitHub merge commit `42927138a8` (`main` `e7ce037799` + the head; `--ojs-repo pkp/ojs`) OJS 3/3 green. At the head itself it needs a rebase: [41627331468](https://github.com/jardakotesovec/pkp-e2e/actions/runs/41627331468) with the head's own pointers (`lib/pkp` `800863b5dc`, 16 commits behind; ui-library `1f9fb95e53`) red on 12 tests outside DataCite (U01 S3/S11/S12, U03 S4, U04 S9, U06 S1, U30 S4, U37 S11, U43 S5, U49 S18 …, what #12780, #13517, #13637 changed), and [41630546552](https://github.com/jardakotesovec/pkp-e2e/actions/runs/41630546552) with `main`'s pointers red on U06 S1 alone, the "Invitation Sent" wording OJS `e421a8840c` (pkp/pkp-lib#12874) changed after the PR's base. Companion: U45 Rule 29c and note q53; no test edits. Security: none routed. **At the merge**: `git range-diff` against `57eb645396`; rerun `xml-lang.php` at the merged tip on a fresh dataset; delete the pr-review report if the gaps are fixed, else `git mv` it to `docs/reports/`; rebase, CI, fast-forward; delete this row and the remote branch. |
| pkp/pkp-lib#13672 + pkp/ojs#6013, pkp/omp#2540, pkp/ops#1475 (`main`; issue pkp/pkp-lib#13530, remove the author-response DOI) | `i13530-main` | ready | 2026-11-02 | PR review asked in the thread, three rounds. **Round 3**: the round-1 cleanup notes all fixed, with pkp/ui-library#1038 (`875ff53c4b` on the tip `eb988214e9`) joining; heads pkp-lib `8721ae39d5`, ojs `9771bb6d86`, omp `d47d665d16`, ops `37e86cb7b4` (each pointing at the pkp-lib and ui-library heads). The 3.5 upgrade passes on all three apps; the OJS9 walk with the OJS bundle rebuilt shows no response DOI, and the settings API now refuses `authorResponse` (400); one en locale key, `submission.reviewRound.authorResponse.identified`, is left with no reader (harmless). CI [41471711012](https://github.com/jardakotesovec/pkp-e2e/actions/runs/41471711012) at the round-3 refs 9/9 green. At the merge, range-diff against the round-3 heads (ui-library#1038 too). Rounds 1–2: Heads pkp-lib `fcc464cfc8`, ojs `c447b611ce`, each on its tip (pkp-lib `442148e14e`, ojs `bc4a83e9db`); **Round 2** omp `403f1c7f20`, ops `7ef057dff9` (force-pushed; trees differ from round 1's `fffb9cf7eb`/`0b7e068572` only in the `upgrade.xml` line). Round 1 finding, **fixed in round 2**: OMP and OPS `upgrade.xml` named the migration `APP\…\I13530_…`, so PKP's 3.5 datasets stopped with "Class not found" (bases upgrade); at round 2 all three apps upgrade 3.5.0.6 → 3.6.0.0 with `doi_id`, its index and its foreign key gone. Report `docs/reports/pr-review/2026-11-02-pkp-lib-13672.md` (fixed; optional cleanup: OJS `schemas/context.json` still accepts `authorResponse`, an unused `current_rrar` join, `getReviewAuthorResponses()` without callers, ui-library `DoiListPanelOJS.vue` branch). U45 OJS9 (pkp-e2e#965) fixed at the heads (`checks/issues/author-response-doi-reminted/walk.js`, re-minted at the base). CI [41464203430](https://github.com/jardakotesovec/pkp-e2e/actions/runs/41464203430) at the round-1 refs 9/9 green (round 2 changes only `upgrade.xml`, which a fresh install does not read); the PRs' own checks queued at the verdict, not part of it. Companion: U45 notes c, g, f-ojs9 and the DOI attach API row, U30 note q; no test edits. Security: none routed. **At the merge**: `git range-diff` each merged commit against the round-3 heads; walk the OJS9 script on a fresh `main` dataset at the merged tip, then retire OJS9, delete its issue report and close pkp-e2e#965; delete the pr-review report; rebase, CI, fast-forward; delete this row and the remote branch. |
| pkp/ojs#5715 + pkp/pkp-lib#13119 + pkp/crossref-ojs#112, pkp/omp#2422, pkp/ops#1363 (pointer bumps) (`main`; issue pkp/pkp-lib#13062, DataCite peer-review DOIs) | `i13062-main` | ready | 2026-10-28 | PR review asked by @jarda.kotesovec. Round 3 (2026-10-28) at ojs `71b20e76b8`, pkp-lib `b9bc59e211`, crossref unchanged: findings 1, 4, 5 fixed (round 2), 2 closed as intended (team ruling), 3 open only for non-English-primary journals and Crossref's empty title (English fallback in `getReviewTitle()` tried, fixes both); omp#2422 and ops#1363 still pin round 1's `6fe60a84ef`. CI 40774841013 at the round-3 heads 9/9 green. Round 1: Heads: ojs `2909063166` on the tip `7705b2aeb8`, pkp-lib `6fe60a84ef` on `2a55911889` (carries `631be03740`, pkp/pkp-lib#13636, reviewed the same day in its own PR review), crossref `84e1cde` on `7908654951`. Report `docs/reports/pr-review/2026-10-28-pkp-lib-13062.md` (medium, small; five findings in the new DataCite path: test mode never sends reviews, a versioned work's older review relates to the current version, a non-English title crashes the review job, `&amp;` in the registered URL, "Updated" date inverted); fix tried (`checks/sync/pkp-lib-13119/fix-ojs.diff`, `fix-pkp-lib.diff`), reads fixed. Nothing that worked before broke; security: nothing found. Companion: U45 S16 and Rule 35 list "Peer Review" among DataCite's kinds (S16 red on pkp-e2e `main` once #5715 merges, so fast-forward at the merge). CI 40713715024 (OMP, OPS green) and 40720212248 (OJS green, after a rebase on `main` for U52's disk-order fix): 9/9 at the PR refs. The merge session: merge crossref-ojs#112 before ojs#5715 and repoint the OJS crossref pointer if it is squashed; range-diff each head; rebase, CI, fast-forward. |
| pkp/ojs#5985 + pkp/pkp-lib#13620 (`main`; issue pkp/pkp-lib#13593, author-response confirmation endpoints; no OMP or OPS PR) | `i13593-main` | ready | 2026-10-26 | PR review asked by @jarda.kotesovec. Round 2 at pkp-lib `b0145df8f5` on `4aab3a3443`, ojs `8f9fa9cf92` on `aa4020152e` (round 1 `d7c6c3bc06`, `390f3a28d1`). Round 1's OJS upgrade break and type warning fixed; one finding left, report `docs/reports/2026-10-26-pkp-lib-13620.md` (low, small): OMP and OPS upgrade without `date_confirmed`/`date_reverted` (no `upgrade.xml` lines; the press's confirmation answers 500); fix tried (`checks/sync/pkp-lib-13620/fix.diff`). U30 A12 answered (intended). Endpoints, the no-op answers, the 422 and the public-record gate walked; U30 A10 fixed at the head. Security: 1 routed, still present at round 2. CI [40424203150](https://github.com/jardakotesovec/pkp-e2e/actions/runs/40424203150) at the round-2 refs: 9/9 green; the PR's own matrix green at `8f9fa9cf92`. Companion: U30 Rule 15, A10 and A12 retired, footnote t; kept checks `checks/sync/pkp-lib-13620/`. **At the merge**: `git range-diff` the merged commits against `b0145df8f5` and `8f9fa9cf92`; if OMP and OPS PRs land, re-walk their upgrade (`PKP_E2E_DATASET_BRANCH=stable-3_5_0 fleet-prep --dataset`); rerun `completion.js` MODE=mixed on a fresh `main` dataset at the merged tip before retiring the A10 report `docs/issues/U30-A10-…` and closing pkp-e2e-sec#14; rebase the companion onto `main`, fast-forward; delete this row, the remote branch and the report once acted on. |
| pkp/omp#2523 (`main`; the line PRs #2522 on stable-3_5_0, merged 2026-11-05 as `4aeacacc2a`, and #2521 on stable-3_4_0 in `upstream-sync-stable-3_5_0.md`) (issue pkp/pkp-lib#10570, chapter author order on "Create New Version" and in the native export) | `10570-main` | ready | 2026-11-05 | PR review asked by @jarda.kotesovec, three rounds. Round 3 (2026-11-05) at omp#2523 `94e167fe55`, still on base `178e8b34b2`: `git range-diff` against round 2's `93c01ade7b` shows one change, bozana's tie-break `orderBy('a.author_id')` in OMP's author Collector. Driven at GitHub's merge onto the omp tip (`9b89a343a`, main's pointers) and its base `828150a8fe`, and on 3.5 and 3.4 (`checks/sync/pkp-lib-10570/walk.js`): `sorted` and `ties` keep the chapter's order as in round 2; new `chapterties` (both chapter authors on place 0, Contributors ordered against their ids) swaps the two in the new version and the re-import at base and head on all three lines: intention gap, not the PR's, report `docs/reports/pr-review/2026-11-05-pkp-lib-10570.md` (low), fix tried on all three heads. Companion: U72 Rule 15, scenario 10 and S10 (OMP), note td22 with round 3; S10 is red on omp `main` until the PR merges. The PR's own e2e check (pkp/omp run 41881057333, U49 S18 red) ran this companion before its rebase onto `main` (the old headlessui menu helper); rebased 2026-11-05, so the check needs a re-run. CI: 42005565657 at the merge commit `9b89a343a`, OMP 3/3 green; 42003050237 at the head with its own pointers (`lib/pkp` `1f415a07ca`, ui-library `e47a48879a`) red on 11 tests that follow upstream changes newer than the base (U01 S3/S11/S12, U03 S4, U06 S1, U14 S1, U27 S3/S4, U37 S11, U49 S18, U69 S3), U72 green. **At the merge**: `git range-diff` the merged commit against `94e167fe55`; rerun `walk.js` `chapterties` at the merged tip: delete the pr-review report if the swap is gone, else `git mv` it to `docs/reports/`; rebase `10570-main` onto `main`, `node bin/ci.js watch` its run, fast-forward; delete this row and the remote branch. |
| pkp/ojs#5784 + pkp/pkp-lib#13260 + pkp/ui-library#972 + pkp/crossref-ojs#107 (issue pkp/pkp-lib#13242, the Blade theme "Eidos"; no OMP or OPS PR; asked by @jarda.kotesovec) | none yet (`eidos` when a round has something for the suite to follow; a branch of that name is picked up by the PR's own check) | investigating | 2026-10-08 | Round 1 reported, not mergeable as it is: `docs/reports/pr-review/2026-10-08-pkp-lib-13260.md` (fourteen findings, thirteen of them outside the theme: OMP and OPS 500 on every page, the web installer, the site's home page on PostgreSQL, the refusal and message pages, the login page's `loginMessage`, the author-response window, the Default theme's article and home pages, an unbuilt Eidos, two removed templates). Of the PR check's 84 reds (pkp/ojs e2e 37756498450) 78 are these, 5 follow two changes that look intended, 1 is K-12780. No spec or test edit. The one report holds a block per finding with before/after screenshots, the cause and a tried fix (images under `docs/reports/pr-review/img/2026-10-08-pkp-lib-13260/`; asked by @jarda.kotesovec the same day). With every proposed fix on the PR heads the three whole suites ran on the VM (2026-10-08, asked by the maintainer): left red are the ten comments tests (known to the team: the original comments were to stay beside Eidos's own; not counted for now), 13 tests on the masthead's history sentence and 2 on the category image width (intended-looking, awaiting the author), and K-12780 in each app; two more findings came out of the runs (13: the home page 500 with announcements off and a stored home-page number; 14: OMP's and OPS's wizard "Not Allowed" heading). Kept: `checks/sync/pkp-lib-13260/default-theme.js`, `shots.js`, `announcements-off.js`, `fix-pkp-lib.diff`, `fix-ojs.diff`, `fix-omp.diff`, `fix-ops.diff`, `fix-pkp-lib-fallback.diff`. Round 2, on the revised heads: the kept walk again, the three suites on CI (OMP and OPS need their own two registry classes or a fallback first), then the report's "Questions for the author" decide what the suite follows (the masthead's history sentence, the category image width, the comments on the Default theme). |
| pkp/pkp-lib#13601 (3.4), #13670 (3.5), #13671 (`main`) + pkp/ojs#5973, #6011, #6012, pkp/omp#2537, #2538, #2539, pkp/ops#1472, #1473, #1474 (pointer bumps plus `I11758_RedispatchRegionCodesFixingJobs` in `upgrade.xml`) (issue pkp/pkp-lib#11758 "Fix 2", the region code jobs' duplicate keys) | `11758` | ready | 2026-11-02 | PR review asked by @jarda.kotesovec. Heads pkp-lib `c857b4e6c3` / `d23ed09bc0` / `17feffb89f` on the line pointers `f4719f2805` / `c4c0aa8c52` / `442148e14e`; the nine app PRs on their tips, pointers at those heads (3.5 and `main` the same patch; 3.4 differs only in the index lookup). No finding. `checks/sync/pkp-lib-11758/geo.js` plants colliding FIPS rows in PKP's 3.3 dataset (VN 01/44, CY 01/04, MA 70/57, TH 22/40, KH 09, one submission over BATCH_SIZE), upgrades and runs the jobs. Base control: the Fix 1 job fails on `msgd_uc_load_context_submission_c_r_c_date` on 3.5 and `main` (left in `failed_jobs`, temp data behind) and fails the 3.4 upgrade itself (3.4 runs jobs on the sync queue while upgrading). Heads, OJS, OMP, OPS on every line: each row converted once, same-key rows summed, metric sums kept, post-upgrade rows untouched (KH 10 stays 10), temp tables, indexes and `needs_review` dropped; an interrupted run and a failed Fix 1 site both repaired by the upgrade that runs I11758 (3.5.0.5 to 3.5 head, 3.5 to `main`), a queued chain not dispatched twice, a retried old failed job harmless, a 3.4.0.12 site's upgrade a no-op. 3.4 nesting stress (BATCH_SIZE 1, about 1,350 nested sync dispatches) passed on PHP 8.2 and 8.3. MySQL/MariaDB path read only (VM has PostgreSQL only). CI [41449420785](https://github.com/jardakotesovec/pkp-e2e/actions/runs/41449420785) at the `main` heads: 9/9 green (U06 S1 flaky, Flake watch). The PRs' own checks: 3.4 reds pre-existing on stable-3_4_0 (OMP `Z_MonographViewDCMetadata` `chapter3.pdf`, the proof-file-order class whose fix is not on 3.4; OPS `Doi.cy.js` versioning, red the same way in base push runs 41157368326 and 41149881570); 3.5 and `main` matrices partly pending at the verdict, not part of it. Companion carries only the kept check, no spec change. Security: none routed. Baselines not advanced. **At the merge**: `git range-diff` each merged pkp-lib commit against its head; fast-forward the companion; delete this row and the remote branch. |
| pkp/ojs#6050, pkp/omp#2566, pkp/ops#1497 (`main`; pkp/ojs#6049, pkp/omp#2565, pkp/ops#1496 on `stable-3_5_0`; pkp/ojs#6051 on `ore`; issue pkp/pkp-lib#13744, the team's copy of U45 A11 / pkp-e2e#217: a DOI search misses DOIs on each app and 500s on OPS) | `i13744-main` | ready | 2026-11-06 | PR review asked in the thread. taslangraham, one commit each, no pkp-lib PR; the same change on every line, and it is the report's proposed fix (only the base query's old comment is kept): each app's first DOI kind becomes its own `union`, and OPS moves the `1 = 0` base from the outer query into the sub-query. Heads `ad4ab4412a`, `c3f984180e`, `c870670cae` (`main`, 10/6/4 behind the tips, Collector untouched there), `91d40ba078`, `38e68f66d7` (3.5, on the tips), `8bf08b2acc` (3.5 OPS, on a 2026-06-30 base 106 behind, merges clean), `264d1e1505` (`ore`, on the tip). Walked as each tip with the PR merged in. The issue's `walk.js` `NEIGHBOUR=1` on fresh dataset fleets, OJS/OMP/OPS on `main` and 3.5, OJS on `ore`: at the tips as the report's Observed, at the heads the Expected, dashboard included, controls unchanged. Companion: U45 A11 retired (MERGE-DATE to fill), Rule 21 rewritten, S3 searches by the work's own DOI (red at the OMP/OPS tips, green at the three heads). CI [42314205559](https://github.com/jardakotesovec/pkp-e2e/actions/runs/42314205559) 9/9 green (the companion at the three `main` heads, lib/pkp `d1f20f891e` and ui-library `357a18eabf` as on the tips). The PRs' own checks: ojs#6051's e2e reds U22 S4 / U26 S12 are pkp-e2e `ore` lag (OJS `ore`'s own run 42296547713 reds the same at the tip; gone since `i13602-ore` was fast-forwarded into pkp-e2e `ore` on 2026-11-09); ops#1497's `pgsql` red is Cypress "Check Crossref Export", whose schema fetch from crossref.org failed; omp#2566's three `omp-main` reds are `Z_MonographViewDCMetadata` expecting `DC.Date.created` 2026-11-06 at 00:01 UTC on the 7th (the date rolled over mid-run). None is the PR's; the author re-runs them. Nit: the issue body lists ops#1497 under 3.5 and #1496 under `main`; it is the other way round. Security: none routed. **At the merge**: `git range-diff` each merged commit against its reviewed head; rerun `walk.js` on fresh datasets at the merged tips (`main`, 3.5, `ore`); fill MERGE-DATE; close pkp-e2e#217 and delete its issue report and kept walk, unless a line still lacks the fix; rebase, CI, fast-forward; delete this row and the remote branch. |
