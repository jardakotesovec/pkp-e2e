# "Counter R5" skips a journal's first month of figures when its first article is dated the 31st

- **Severity** medium
- **Effort** small
- **Kind** defect
- **Affects**
  - main: OJS, OMP, OPS
  - 3.5: OJS, OMP, OPS
  - 3.4: OJS, OMP, OPS (code)
  - 3.3: none (code; no "Counter R5" page)
- **Introduced** `pkp/pkp-lib#8109` for `pkp/pkp-lib#6782` · [28b366b248](https://github.com/pkp/pkp-lib/commit/28b366b2487b9b293e1b820048e7fb2f67ca9038) · merged 2022-07-23 · Bozana Bokan (bozana)
- **Upstream** none found (2026-11-02)
- **Tracked in** spec U64 [A19](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U64-usage-statistics.md#a19)
- **Checked** 2026-11-02, each branch's tip (the commits in Evidence)
- **Model** claude-opus-5-5

## Summary

On Statistics › "Counter R5", a journal's COUNTER figures should start
on the first day of the month after its first publication (or after
the site began counting for COUNTER, if that is later). When the
journal's first article is dated the 31st, the page starts them a
month late. For a journal whose first article is dated 31 October,
"Start Date" offers 1 December, not 1 November.

November's figures exist, but no report can include them. A "Start
Date" in November is refused. A harvesting system that asks the SUSHI
address for November is answered from December, with only a warning.
Until December ends, the page also says "There are no COUNTER R5 usage
statistics available yet." There is no way round on screen, and the
month stays out of reach for good.

The same happens for a date on 29, 30 or 31 January (only 30 and 31
in a leap year), and on 31 March, May, August or October. A press or a
preprint server meets it the same way.

## Impact

- **Lost**: the first full month of COUNTER usage, for every report
  and for SUSHI clients, with nothing saying that a month is missing.
  The figures stay stored, but nothing can read them out.
- **Who**: libraries and consortia that collect a journal's COUNTER
  reports, and the manager who downloads them. It only applies when
  the later of the two start dates (the site's COUNTER start, or the
  journal's first publication) falls on one of the days listed above.
  That is about one journal in fifty.
- **Way round**: none on screen. The "Start Date" box refuses the
  missing month, and the SUSHI address moves the start forward.

Medium: a month of a secondary output is lost for good, silently for
SUSHI clients, but only for the few journals whose start falls on one
of those days. It would be higher if every journal lost a month.

## Steps to reproduce

Preconditions:

- PKP's default test dataset for OJS `main` (OMP and OPS the same,
  with their own words). Its install date and its articles' dates are
  the day the dataset was built (2026-11-01). Steps 2–4 therefore make
  a journal whose only article carries a date after that, on a 31st.

1. Sign in as `admin`.
2. Open Administration › "Hosted Journals" › "Create Journal". Fill in
   "Journal title" `u64r Journal`, "Journal initials" `U64R`, the
   principal contact's name and email, "Country" Canada, "Path"
   `u64r`, tick English under "Languages" and "Primary locale", tick
   "Enable this journal to appear publicly on the site", and press
   "Save". `admin` becomes the new journal's Journal Manager.
3. Open `/index.php/u64r/en/submission` and make a submission through
   the whole wizard: any title, an abstract, one file (OPS: a PDF
   galley), then "Submit".
4. Open the submission's workflow. In the side menu, under
   "Publication", open "Publication Settings". On 3.5 it is "Issue";
   on OMP it is "Catalog Entry", and on OPS "Preprint entry". Type
   `2027-01-31` in "Publication Date" (3.5 and OMP: "Date Published";
   OPS: "Date Posted") and press "Save".
5. Open the new journal's Statistics › "Counter R5" and press "Edit"
   on "Platform Master Report (PR)".

**Expected**: "Start Date" is filled with `2027-02-01`, and the line
under it reads "Date should be in format YYYY-MM-DD or YYYY-MM.
Earliest possible date is 2027-02-01.".

**Observed**: "Start Date" is filled with `2027-03-01`, and the line
under it reads:

```
Date should be in format YYYY-MM-DD or YYYY-MM. Earliest possible date is 2027-03-01.
```

Control: change the date of step 4 to `2027-01-28`, save, and repeat
step 5. "Start Date" then reads `2027-02-01`, as it should.

The article does not need to be published: the page reads the date
of every version, published or not. On a real journal the same
happens when the first article is published on the 31st. The
installation date counts too: for a site that began counting for
COUNTER (its upgrade to 3.4) on such a day, every journal published
before then starts a month late.

## Cause

`CounterR5Report::getEarliestDate()` (lib/pkp
`classes/sushi/CounterR5Report.php`, line 322) takes the later of the
site's COUNTER start and the context's first publication date. It then
moves that date to the first day of the next month:

```php
$earliestDate = date('Y-m-01', strtotime($earliestDate . ' + 1 months'));
```

PHP adds a month by keeping the day number. "2026-10-31 + 1 months" is
31 November, which PHP rolls over to 1 December. `Y-m-01` then gives
2026-12-01, a whole month late. The days that overflow this way are
29, 30 and 31 January (30 and 31 in a leap year), and 31 March, May,
August and October.
The line dates from the first COUNTER R5 code (28b366b248,
`pkp/pkp-lib#6782`), and 0b6eec6bc6 (`pkp/pkp-lib#8390`) kept it when
it added the first publication date.

Reach (all checked in the code):

- The "Counter R5" page: `PKPStatsHandler::counterR5()` and
  `PKPCounterReportsListPanel` show "There are no COUNTER R5 usage
  statistics available yet." while the last possible date is not
  after it, so the notice stays a month longer.
- The report form (`CounterR5Report::getReportSettingsFormFields()`)
  fills "Start Date" with it and names it in the line under the box.
- The form's "Download": `PKPStatsSushiController::_validateUserInput()`
  refuses an earlier "Start Date" (`after_or_equal`). The message is
  the one with a raw key that
  [U64 A3](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/issues/U64-A3-counter-report-date-refusal-raw-code.md)
  reports.
- The SUSHI address: `CounterR5Report::checkDate()` adds warning 3032
  ("Usage No Longer Available for Requested Dates") and moves
  `begin_date` up to it, so the month is left out of the JSON
  report.
- The daily COUNTER loader (`PKPUsageStatsLoader`) reads the site's
  start date from `PKPStatsSushiService::getEarliestDate()` itself, not
  through this method, so the figures are still compiled and stored.
- Every other `+ N months` in lib/pkp and the three apps was searched.
  The only other ones are the statistics pages' default "last 12
  months" (`strtotime('-12 months')`, `PKPStatsHandler` and OJS
  `StatsHandler`), which is off by one day at most, on 29 February.
  It is left out of this report.

## Proposed fix

Compute the month from its first day, with the relative format
"first day of next month", which never overflows
([fix.diff](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/counter-r5-earliest-date-skips-month-after-31st/fix.diff)):

```diff
--- a/lib/pkp/classes/sushi/CounterR5Report.php
+++ b/lib/pkp/classes/sushi/CounterR5Report.php
@@ -319,7 +319,9 @@
                 ->filterByContextIds([$context->getId()])
         )->min_date_published;
         $earliestDate = strtotime($firstDatePublished) > strtotime($counterR5StartDate) ? $firstDatePublished : $counterR5StartDate;
-        $earliestDate = date('Y-m-01', strtotime($earliestDate . ' + 1 months'));
+        // "first day of next month", not "+ 1 months": a date on the 29th to the 31st plus a month can
+        // overflow into the month after (2026-10-31 + 1 month is 2026-12-01), skipping a whole month.
+        $earliestDate = date('Y-m-d', strtotime('first day of next month', strtotime($earliestDate)));
         return $earliestDate;
     }
```

The method is the one place that computes the date, and every caller
listed in the Cause reads it from there, so one line covers them all.
The relative formats are already the pattern beside it: `getLastDate()`
uses `'last day of previous month'`, and `StatisticsReport` uses
`'first day of previous month midnight'`. The rule the introducing
change set up ("the first day of the month after") is kept. Only the
arithmetic changes.

It was tried on `main` on all three apps. With the fix, the steps show
"Earliest possible date is 2027-02-01." for an article dated
2027-01-31, and the control date 2027-01-28 still gives 2027-02-01.
A PHP loop over every day of 2026 and 2027 gives the first day of the
next month for each, where the current line was wrong on 14 days.

**Alternatives**:

- Carbon (`Carbon::parse($earliestDate)->startOfMonth()->addMonth()`)
  does the same, but `CounterR5Report` does not use Carbon, and the
  relative format matches its sibling method.
- `strtotime($earliestDate . ' + 1 months')` taken from the first of
  the month (`date('Y-m-01', …)` first, then the month added) also
  works, but it is two steps for what one format says.

**What goes with it**:

- No stored data needs a repair: the figures are kept, and the date is
  computed on every request.
- Backport: the diff applies as it stands to `stable-3_5_0` (`git apply
  --check` passes on the three apps there). `stable-3_4_0` has the same
  line (323), one line lower.
- A unit test of `getEarliestDate()` for a first publication on
  2026-10-31 (expecting 2026-11-01) and 2027-01-28 (expecting
  2027-02-01). The e2e scenario U64 S8 already reads the date for a
  journal first published on the day the test runs. It went red on
  2026-10-31, and it will go red again on 29 to 31 January 2027 until
  the fix lands.

Small: one line in one method, and a unit test.

## Evidence

- The kept script
  [walk.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/counter-r5-earliest-date-skips-month-after-31st/walk.js)
  takes steps 1–5 and the control on each app. Run it on an install
  freshly loaded from the default dataset:
  `PROBE_FEATURE=<feature> PROBE_AGENT=<id> node bin/probe.js all shared/playwright/checks/issues/counter-r5-earliest-date-skips-month-after-31st/walk.js`
  (3.5: `PKP_E2E_LINE=stable-3_5_0` in front).
- Walked on OJS, OMP and OPS, `main` and `stable-3_5_0`, on
  2026-11-02, on PostgreSQL, each on an install freshly loaded from the
  dataset (pkp/datasets c1a3abcd, 2026-11-01): 2027-03-01 for the
  2027-01-31 date, 2027-02-01 for the control. No server error and no
  script error on the walked pages. The plugin gallery list, which the
  new journal's settings load and which cannot reach the internet from
  the test machine, answered 500; it is not part of this finding.
- Branch tips: OJS `main` bc4a83e9db, OMP `main` 853bf3b052, OPS `main`
  fd893a8c92 (lib/pkp 442148e14e; lib/ui-library 5b44fb15, OPS
  eb988214). `stable-3_5_0`: OJS 0f2de4ff3f, OMP 9e2a7fd005, OPS
  d4a7e97a55 (lib/pkp c4c0aa8c52, lib/ui-library 7cff1702). pkp-lib
  `stable-3_4_0` f4719f2805 and `stable-3_3_0` 5b26595791.
- The fix was tried on `main`: `node bin/try-fix.js apply
  shared/playwright/checks/issues/counter-r5-earliest-date-skips-month-after-31st/fix.diff ojs omp ops`,
  the script again on freshly loaded fleets, then `revert`.
- First seen in pkp-e2e's nightly run
  [41164101437](https://github.com/jardakotesovec/pkp-e2e/actions/runs/41164101437)
  on 2026-10-31, U64 S8 on all three apps, first try and retry: a
  journal whose only article was published that day was offered
  `begin_date` 2026-12-01, not 2026-11-01.
- Code reads: `stable-3_5_0` lib/pkp has the same method, line 322.
  `stable-3_4_0` lib/pkp has it at line 323, with
  `Services::get('sushiStats')` in place of `app()->get()`.
  `stable-3_3_0` has no `classes/sushi`.
- Introduced: `git log -S "' + 1 months'"` on `classes/sushi/` names
  28b366b248 (`pkp/pkp-lib#8109`, merged 2022-07-23), where the line read
  `strtotime($dateInstalled . ' + 1 months')`. 0b6eec6bc6
  (`pkp/pkp-lib#8390`, merged 2022-11-03, for `pkp/pkp-lib#6781`)
  replaced `$dateInstalled` with the later of the two dates.
- Tracker search on 2026-11-02 in pkp/pkp-lib, issues and PRs: "COUNTER
  earliest date", "Counter R5 start date", "SUSHI earliest date month",
  "Usage No Longer Available", "getEarliestDate", "+1 months". The
  nearest issue is `pkp/pkp-lib#8921` ("Scheduled task arithmetic can
  over/underflow dates", open). It is the same kind of PHP arithmetic,
  but in the scheduled tasks, not this method.
- Unverified: the SUSHI address's warning 3032 and the moved
  `begin_date` were read in the code, not requested. MySQL was not
  checked, but the fault is in PHP, not in a query.
