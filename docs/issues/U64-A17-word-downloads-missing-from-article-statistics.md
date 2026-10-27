# Statistics › Articles leaves Word file downloads out of "Other", "File Views" and "Total"

- **Severity** medium
- **Effort** small
- **Kind** regression
- **Affects**
  - main: OJS, OMP, OPS
  - 3.5: OJS, OMP, OPS
  - 3.4: OJS, OMP, OPS (code)
  - 3.3: OJS, OMP, OPS (code; "Other" alone: there "File Views" and "Total" count Word downloads)
- **Introduced** `pkp/pkp-lib#8109` for `pkp/pkp-lib#6782` · [86acb07066](https://github.com/pkp/pkp-lib/commit/86acb0706615cf3217756418176987e8a599c4ac) · 2021-07-16 · Bozana Bokan (bozana)
- **Upstream** `pkp/pkp-lib#13600` (open)
- **Tracked in** spec U64 [A17](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U64-usage-statistics.md#a17)
- **Checked** 2026-10-27, each branch's tip (the commits in Evidence)
- **Model** claude-opus-5-5

Update 2026-10-27: the "Downloads" chart that readers see on the
item's own page, when the theme shows it, counts the Word download, so
it reads more than the manager's "File Views" for the same downloads
(step 9).

## Summary

A reader downloads the Word file (.doc or .docx) of an article, a book
or a preprint: a journal's galley, a press's publication format or a
preprint server's galley. Statistics › "Articles" ("Monographs",
"Preprints") shows a day's visits from the next day on. It should then
count the download under "Other", the column for every file that is
neither PDF nor HTML, and so in "File Views" and "Total". Instead the
download is in none of the item's columns, on the page, in "Download
Articles" or in the statistics API. Word is the only file type left
out: any other file that is not a PDF or HTML file counts under
"Other".

For an article with one abstract view, one PDF download and one Word
download, the row should read "File Views" 2 ("PDF" 1, "Other" 1) and
"Total" 3. It reads "File Views" 1, "Other" 0 and "Total" 2, and
nothing on the page says that Word files are left out. The chart
above the table, switched to its "Files" line, counts both downloads,
and so does the "Downloads" chart readers see on the item's own page.

One filter in the shared statistics code leaves the Word file type out
of "Other".

## Impact

- **Lost.** Correct "Other", "File Views" and "Total" figures on the
  statistics page, in "Download Articles" and in the statistics API,
  for every item with a Word file. No data is lost: the downloads are
  stored, and the fix corrects past figures too. Rankings by views
  already count Word downloads (the table's default order, and OJS's
  "Most read articles by the same author(s)").
- **Who.** Managers and editors of journals, presses and servers that
  publish Word files, whenever they read or export the item figures,
  and the programs that read the statistics API. Where the theme shows
  the item page's "Downloads" chart, readers and authors see a higher
  download count than "File Views" and "Total", with nothing to explain
  the difference.
- **Way round.** "Download Files" gives each Word file's downloads; no
  screen puts them back into the row.

Medium: the item figures a journal, press or server reads and exports
are silently low for its Word files. The COUNTER R5 reports and SUSHI,
which libraries receive, count Word downloads; it would be high if they
were wrong too.

## Steps to reproduce

Preconditions:

- PKP's default test dataset of the version (`publicknowledge` in each
  app).
- A Word file at hand, here `article.docx`.
- The reader's visits come from an ordinary desktop browser. On 3.5 the
  app drops a visit from a browser that names itself "HeadlessChrome",
  which is on its list of robots, so an automated browser needs a
  desktop browser's user agent set there.

On a journal (OJS):

1. Sign in as `rvaca` (journal manager) and open submission 1,
   "Signalling Theory Dividends". The workflow opens on its unpublished
   version 1.1.
2. Open that version's "Galleys" and press "Add galley". Type "Word" as
   the Galley Label and press "Save". In "Upload a File Ready for
   Publication" choose "Article Text", upload `article.docx`, press
   "Continue", "Continue", "Complete".
3. Open "Title & Abstract" and press "Publish". In "Review Publishing
   Details" keep what it preselects and press "Confirm", then "Publish".
   [3.5: "Publish", then the window's own "Publish".] Sign out.
4. Open the article's page
   (`/index.php/publicknowledge/article/view/mwandenga`) and press
   "Word". The browser saves `article.docx`.
5. Back on the article's page, press "PDF Version 2". The PDF opens in
   the viewer.

On a press (OMP):

1. Sign in as `rvaca` (press manager) and open submission 5, "Bomb
   Canada and Other Unkind Remarks in the American Media" (published),
   then "Publication Formats".
2. Press "Add publication format", type "Word" as the name, press "OK".
3. On the "Word" row press "Change File": choose "Book Manuscript",
   upload `article.docx`, press "Continue", "Continue", "Complete".
4. On the file's row press "Set Terms", choose "Open Access", "Save".
   Approve the "Word" format (its "Awaiting Approval" button, "OK")
   and make it available (its "Not Available" button, "OK"). Sign out.
5. Open the book's page (`/index.php/publicknowledge/catalog/book/5`)
   and press "Word". The browser saves `article.docx`.

On a preprint server (OPS):

1. Sign in as `rvaca` (server manager) and open submission 1, "The
   influence of lactation on the quantity and quality of cashmere
   production" (Production, not yet posted), then "Galleys".
2. Press "Add galley", type "Word", "Save"; choose "Preprint Text",
   upload `article.docx`, press "Continue", "Continue", "Complete".
3. Open "Preprint entry", type yesterday's date as "Date Published"
   and press "Save". Press "Post", then the window's "Post". Sign out.
   [The date matters only for step 9 with step 6's same-day shortcut:
   the item page's chart starts on the posting date, and the shortcut
   dates the downloads to yesterday.]
4. Open the preprint's page (`/index.php/publicknowledge/preprint/view/1`)
   and press "Word". The browser saves `article.docx`.
5. Back on the preprint's page, press "PDF". The PDF opens in the
   viewer.

Then, on each:

6. Have the day's visits counted. The daily "Usage statistics file
   loader task" counts a day's visits on the next day, and the
   Statistics pages end their ranges at yesterday. To see it the same
   day, move each waiting log one day back (each line's date and the
   file's name), then run the task and the job queue from the app's
   root:

   ```sh
   cd <files_dir>/usageStats && mkdir -p stage    # files_dir as in config.inc.php
   for f in usageEventLogs/usage_events_*.log; do
     d=$(basename "$f" .log | cut -d_ -f3)
     sed "s/\"time\":\"$(date -d "$d" +%F) /\"time\":\"$(date -d "$d -1 day" +%F) /" "$f" \
       > "stage/usage_events_$(date -d "$d -1 day" +%Y%m%d).log" && rm "$f"
   done
   cd <the app's root>
   php lib/pkp/tools/scheduler.php test '--name=APP\tasks\UsageStatsLoader'
   php lib/pkp/tools/jobs.php work --stop-when-empty=1
   ```

   [3.5: `php lib/pkp/tools/jobs.php run`, repeated until no job is
   left, in place of the last line.] The dataset ships the usage log of
   the day it was built; the loop moves it too, and it adds nothing to
   the rows read here.

7. Sign in as `rvaca` and open Statistics › "Articles" ("Monographs",
   "Preprints") at its default "Last 30 days". Read the item's row (on
   OJS the row carries version 1.1's title in the dataset, "The The
   Signalling Theory Dividends Version 2: A Review Of The Literature
   And Empirical Evidence").
8. Above the chart press "Files", which switches the chart to file
   views by day. Then press "Download Report" › "Download Files".
9. Open Settings › Website › Appearance › Theme. Under "Usage
   statistics display options" choose "Use bar type of the chart for
   usage statistics display." (the dataset has "Do not display
   submission usage statistics chart for reader." chosen) and press
   "Save". Sign out and open the item's page again. Hover the current
   month's bar in its "Downloads" chart: the tooltip gives the month's
   downloads (for example "Oct 2026", "All Downloads: 2"; [3.5: the
   month alone, "Oct"]). [The chart
   keeps the figures of its first opening for a day. It was off until
   now, so this opening is its first and reads the counted day.]

**Expected.** The Word download counts under "Other". On OJS and OPS the
row reads "Abstract Views" 1, "File Views" 2, "PDF" 1, "HTML" 0,
"Other" 1, "Total" 3; on OMP "Abstract Views" 1, "File Views" 1,
"Other" 1, "Total" 2. That agrees with the chart's file views, with
"Download Files" and with the "Downloads" chart on the item's page.

**Observed.** The row leaves the Word download out of every column, on
`main` and 3.5 alike:

| | Abstract Views | File Views | PDF | HTML | Other | Total | chart's file views that day | item page's "Downloads", October |
|---|---|---|---|---|---|---|---|---|
| OJS (and "JATS" 0 on `main`) | 1 | 1 | 1 | 0 | 0 | 2 | 2 | 2 |
| OMP | 1 | 0 | 0 | 0 | 0 | 1 | 1 | 1 |
| OPS | 1 | 1 | 1 | 0 | 0 | 2 | 2 | 2 |

"Download Files" lists the Word file with its download, for example on
OJS:

```
1,"The The Signalling Theory Dividends Version 2",12,article.pdf,"Primary File",1
1,"The The Signalling Theory Dividends Version 2",46,article.docx,"Primary File",1
```

"Download Articles" reads the same as the row, for example on OJS:

```
ID,Title,Authors,"Date Published",Total,"Abstract Views","File Views",PDF,HTML,Other,JATS
1,"The The Signalling Theory Dividends Version 2","Mwandenga Version 2 et al.",2026-10-26,2,1,1,1,0,0,0
```

`GET /api/v1/stats/publications/1?dateStart=…&dateEnd=…` (the page's
range) answers `"galleyViews": 1, "pdfViews": 1, "otherViews": 0`.

## Cause

`LogUsageEvent` records each download of a published file with the
file's type from `PKPStatisticsHelper::getDocumentType()`, which
returns `STATISTICS_FILE_TYPE_DOC` (4) for `application/msword`,
`application/word` and the .docx type, beside PDF (2), HTML (1) and
Other (3). The day's processing keeps that type in
`metrics_submission.file_type`, so a Word download is stored as a row
of type 4.

`PKPStatsPublicationService::getTotalsByType()` sums the item's rows
grouped by assoc type and file type and picks the PDF, HTML and Other
sums with `filterRecordPdf()`, `filterRecordHtml()` and
`filterRecordOther()`. `filterRecordOther()`, documented as "Other
(than PDF and HTML)", matches type 3 alone
([`classes/services/PKPStatsPublicationService.php` line 63](https://github.com/pkp/pkp-lib/blob/c27153abddd3550740d20149d43711d3e1d61f6e/classes/services/PKPStatsPublicationService.php#L63)):

```php
return $record->assoc_type == Application::ASSOC_TYPE_SUBMISSION_FILE && $record->file_type == PKPStatisticsHelper::STATISTICS_FILE_TYPE_OTHER;
```

No filter takes type 4, so the Word sum is dropped.

`PKPStatsPublicationController` then makes "File Views"
(`galleyViews`) the sum of the three parts in `get()` (line 339),
`getItemForCSV()` (line 914) and `getItemForJSON()` (line 947). Each
"Total" is built on that sum: the spreadsheet's in `getItemForCSV()`
(line 915, abstract views plus `galleyViews` plus JATS views), the
page's in ui-library's
`src/components/Container/StatsPublicationsPage.vue` (line 412, the
same sum in the browser). So the Word downloads reach neither "File
Views" nor "Total".

86acb07066 (`pkp/pkp-lib#6782`, the new usage statistics of 3.4)
brought `getTotalsByType()` and the three-part sum. Before it, the
statistics API of `pkp/pkp-lib#3673` (27a6196b8d, 2019) summed every
galley-file record into `galleyViews`, so "File Views" and "Total"
counted Word downloads; only "Other" left them out. 86acb07066 kept
that filter and built `galleyViews` from the three parts, which
dropped the Word downloads from "File Views" and "Total".

Reach of the cause:

- Statistics › "Articles" ("Monographs", "Preprints"): the row,
  "Download Articles" and `GET /api/v1/stats/publications` (the page's
  own list) and `/{id}`. Walked on OJS, OMP and OPS, `main` and 3.5.
- The list and its order: `getCount()` (which items are listed) and
  `getTotals()` (the default order) take every primary-file row, Word
  included, while the row's figures leave Word out. An item whose only
  file visits are Word downloads is listed with its file figures at 0,
  and Word downloads move an item up the list with no figure showing
  them. OJS's "Recommend Articles by Author" plugin orders its "Most
  read articles by the same author(s)" by `getTotals()` too. Code, not
  walked.
- The chart's file views (`timeline?type=files`) and "Download Files"
  (`getManyFiles()`) count Word downloads, so they disagree with the
  row's "File Views". Walked.
- The "Downloads" chart on the item's own page (the default theme's
  "Usage statistics display options" set to bar or line): the article,
  book and preprint pages call `ThemePlugin::displayUsageStatsGraph()`,
  whose `downloadStatsCacheMiss()` asks `getTimeline()` for every
  `ASSOC_TYPE_SUBMISSION_FILE` record of the item from its first
  publication on, with no file type filter, so it counts Word
  downloads. Walked on OJS, OMP and OPS, `main` and 3.5.
- COUNTER: the day's processing compiles the R5 figures by assoc type
  alone (`PKPTemporaryItemRequestsDAO::compileCounterSubmissionDailyMetrics()`),
  and OJS's R4 report files type 4 under "other"
  (`CounterReport::getKeyForFiletype()`). Code.
- OJS's `ArticleHandler::view()` hands `getTotalsByType()` to the
  article page's template as `metricsByType` for themes
  (`pkp/pkp-lib#12340`): its `other` misses Word too. No template in
  the apps reads it. Code.
- Stored data: right. The rows of type 4 are in `metrics_submission`,
  and the 3.4 upgrade copied `file_type` unchanged
  (`I6782_MetricsSubmission`), so a fix in the read counts every past
  Word download.
- OJS's issue statistics (`StatsIssueService::getTotalsByType()`)
  group by assoc type alone: not affected. Code.

## Proposed fix

The proposal: widen `filterRecordOther()` to types 3 and 4, as its own
comment ("Other (than PDF and HTML)") says. Then sum the matching rows
in `getTotalsByType()`: its query groups by file type, so Other and
Word come back as two rows, and `current()` would take only one of
them. The whole of
[fix.diff](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/word-downloads-missing-from-article-statistics/fix.diff):

```diff
--- a/lib/pkp/classes/services/PKPStatsPublicationService.php
+++ b/lib/pkp/classes/services/PKPStatsPublicationService.php
@@ -56,11 +56,12 @@
 
     /**
      * A callback to be used with array_filter() to return
-     * records for Other (than PDF and HTML) file.
+     * records for Other (than PDF and HTML) file, Word files included.
      */
     public function filterRecordOther(object $record): bool
     {
-        return $record->assoc_type == Application::ASSOC_TYPE_SUBMISSION_FILE && $record->file_type == PKPStatisticsHelper::STATISTICS_FILE_TYPE_OTHER;
+        return $record->assoc_type == Application::ASSOC_TYPE_SUBMISSION_FILE
+            && in_array($record->file_type, [PKPStatisticsHelper::STATISTICS_FILE_TYPE_OTHER, PKPStatisticsHelper::STATISTICS_FILE_TYPE_DOC]);
     }
 
     /**
@@ -200,10 +201,9 @@
         if (!empty($htmlRecord)) {
             $htmlViews = (int) current($htmlRecord)->metric;
         }
+        // Other and Word are separate rows (grouped by file type): add them up
         $otherRecord = array_filter($metricsByType, $this->filterRecordOther(...));
-        if (!empty($otherRecord)) {
-            $otherViews = (int) current($otherRecord)->metric;
-        }
+        $otherViews = array_sum(array_map(fn (object $record) => (int) $record->metric, $otherRecord));
         $suppFileRecord = array_filter($metricsByType, $this->filterRecordSuppFile(...));
         if (!empty($suppFileRecord)) {
             $suppFileViews = (int) current($suppFileRecord)->metric;
```

The rule lives in the shared service, so the one change reaches the
row, both totals, "Download Articles", the API and the themes'
`metricsByType` in all three apps. It follows OJS's COUNTER R4 report,
which already files Word under "other". No other filter on the file
type misses type 4. It keeps the intent of 86acb07066: three named
parts that add up to "File Views".

Both charts, the Statistics page's "Files" and the item page's
"Downloads", read `getTimeline()`, which the diff does not touch. They
keep counting Word downloads, and "File Views" then agrees with them.

Tried on `main`, OJS, OMP and OPS: the walk's rows read "File Views" 2,
"Other" 1, "Total" 3 on OJS and OPS and "File Views" 1, "Other" 1,
"Total" 2 on OMP, matching the chart's file views. A control on OJS
added a plain-text galley (an "Other" file) beside the Word one, to
show that the fix adds the two without counting either twice: with
the fix "Other" read 2, "File Views" 3, "Total" 4; without it "Other"
1, "File Views" 2, "Total" 3. The PDF stayed at 1 in both.

**Alternatives.**

- A "Word" column of its own: a new column on the page, in the
  spreadsheet and in the API, which is a product decision for one file
  type among many.
- Going back to summing every file row into "File Views", as 3.3 did:
  "File Views" would then exceed "PDF" + "HTML" + "Other" again.
- Storing Word downloads as type 3: the rows already stored keep type
  4, so the read would still need the change, and the type would be
  lost for every report that tells Word apart.

**What goes with it.**

- No data repair.
- The API's `otherViews` and `galleyViews` grow for items with Word
  files, which corrects them; their shape does not change.
- Backport: the diff applies as it stands to `stable-3_5_0`. On
  `stable-3_4_0` the second hunk is written by hand (the filter is
  passed as `[$this, 'filterRecordOther']` there).
- Test: `getTotalsByType()` reads `metrics_submission` through the
  query builder, so its test is a database test, the pattern of
  lib/pkp's `DatabaseTestCase` (as `tests/classes/filter/FilterDAOTest.php`
  uses it): `getAffectedTables()` names `metrics_submission`, which is
  restored afterwards; the test seeds a type-3 and a type-4 row for one
  submission and checks that `other` is their sum. No stats service
  has a test yet, so it would be the first in
  `tests/classes/services/`. Beside it, the e2e scenario planned in the
  spec (a reader downloads an article's Word and PDF galleys; "File
  Views" and "Total" count both).

Small: two methods in one shared class, and a database test.

## Evidence

- Kept script, which takes the Steps through the screens on installs
  freshly loaded from PKP's default test dataset (pkp/datasets accd72de,
  2026-10-26, the `main` and `stable-3_5_0` PostgreSQL dumps; walked
  2026-10-27, first 2026-10-23 on 300c68e):
  [`shared/playwright/checks/issues/word-downloads-missing-from-article-statistics/walk.js`](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/word-downloads-missing-from-article-statistics/walk.js),
  with `lib.js`, `fix.diff`, `article.docx`, `notes-hkq23j.txt` and
  `data-hkq23j.csv` beside it (the folder stands alone; its header
  gives the command that runs it, and `MODE=nb` the fix trial's control).
- Where the walk differs from the Steps: step 6 was the script's
  `nextDay()`, which moves the logs as the loop does and runs the same
  task and job commands. The shell loop was run once on the walk's own
  log, and the file it staged matched `nextDay()`'s byte for byte. On
  OMP the book's page offers no "PDF" beside "Word": book 5's "PDF" format
  holds one chapter's file, which the page lists under that chapter,
  so the OMP walk has no PDF download to compare.
- Step 9's reading: the walk reads the figures the page hands the
  chart (`pkpUsageStats.data.Submission[<id>]`, its `total`) and what
  the chart drew. The tooltip was read once, on OPS `main` after the
  walk: "Oct 2026", "All Downloads: 2".
- OPS step 3's date: walked first without it on `main` and 3.5, the
  chart read 0 there (`publications.date_published` 2026-10-27, the
  `metrics_submission` rows 2026-10-26); with it, 2.
- Fix trial (2026-10-23, at the tips of that day): the diff applied to
  OJS, OMP and OPS `main`, Steps 1 to 8 walked on each (step 9 came
  later), then the control on OJS with the fix and again without it.
  The control's third galley, "Data" (`data-hkq23j.csv`, "Data Set", a supplementary file), was added and
  published but not pressed: the article's page lists it among the
  supplementary links, which the script's reader does not read. The
  diff leaves `filterRecordSuppFile()` and its assoc type untouched
  (code). The files it changes have no commit since that trial (lib/pkp
  `git log 1f415a07ca..c27153abdd` on `PKPStatsPublicationService.php`,
  `PKPStatsServiceTrait.php`, `api/v1/stats/publications` and
  `ThemePlugin.php`), and the diff applies to today's `main` as it
  stands. Its effect on the item page's chart is read in the code
  (`getTimeline()` takes no file filter from the changed methods), not
  walked.
- Branch tips (2026-10-27): OJS `main` 5153465178, OMP `main`
  ceae6e275f, OPS `main` 66a3bb98a5, each with lib/pkp c27153abdd and
  ui-library 1f9fb95e53; OJS `stable-3_5_0` a9e01889b0 and OMP
  3c8c7c4964 (lib/pkp 3fd17879b3), OPS 07926c35b4 (lib/pkp 9a0212faff),
  ui-library a12b752338; `stable-3_4_0` OJS 6895dcb6d6, OMP e0263ebd1,
  OPS 029b610a0f, lib/pkp 3a26bb98d6; `stable-3_3_0` OJS c6590e2012,
  lib/pkp f80a52ed4d, the usageStats plugin efdd448eee. The installs
  run PostgreSQL; the fault is in PHP and does not depend on the
  database (MySQL not checked).
- The robot list: lib/pkp's `lib/counterBots/generated/COUNTER_Robots_list.txt`
  holds a `HeadlessChrome` pattern on 3.5 and none that matches it on
  `main`.
- 3.5 (walked, and read): the same rows as on `main` on all three apps
  (no "JATS" column: the plugin is off in that dataset); the same code.
  The item page's chart read the same figures (2 on OJS and OPS, 1 on
  OMP); the same `downloadStatsCacheMiss()` and `getTimeline()`.
- 3.4 (code): lib/pkp `origin/stable-3_4_0`: the same code
  (`PKPStatsPublicationService`, `PKPStatsPublicationHandler`,
  `LogUsageEvent`), in all three apps through lib/pkp. Its
  `ThemePlugin::downloadStatsCacheMiss()` reads `getTimeline()` with
  `assocTypes` [`ASSOC_TYPE_SUBMISSION_FILE`] alone too (in a file
  cache), and the three apps' item templates call
  `displayUsageStatsGraph()`, so the item page's chart counts Word
  there as well.
- 3.3 (code): lib/pkp `origin/stable-3_3_0`,
  `api/v1/stats/publications/PKPStatsPublicationHandler.inc.php` sums
  every galley-file record into `galleyViews`, and
  `PKPStatsService::filterRecordOther()` takes
  `STATISTICS_FILE_TYPE_OTHER` alone; the usageStats plugin at
  efdd448eee (`UsageStatsLoader.inc.php`) stores
  `STATISTICS_FILE_TYPE_DOC` for Word files.
- Introduced: `git blame` of the filter (line 63) names 86acb07066,
  which created `getTotalsByType()`; the controller's `galleyViews`
  line 339 blames 590e7960c3 (2022-10-11), which only corrected a
  `$$metricsByType` typo in the line 86acb07066 wrote. The earlier
  `galleyViews` sum is 27a6196b8d (`pkp/pkp-lib#3673`, Nate Wright,
  2019-05-01).
- Upstream: searched 2026-10-23 in pkp/pkp-lib, pkp/ojs and
  pkp/ui-library, and again 2026-10-27 in pkp/pkp-lib
  (`filterRecordOther`; "download statistics chart word").
  `pkp/pkp-lib#13600` (opened 2026-10-22, still open, no comments, no
  PR on 2026-10-27) describes the same fault on OJS and proposes the
  same change; no fix is in the checkouts.
- Unverified: the list and order symptom and the "Most read articles
  by the same author(s)" order (code only), and third-party
  themes or plugins that read `metricsByType` or the API's
  `otherViews` and might expect Word to be left out.
