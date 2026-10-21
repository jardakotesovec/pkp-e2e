# On 1 January, choosing "Year to date" on "Editorial Activity" opens an "Error" window instead of figures

- **Severity** low
- **Effort** small
- **Kind** defect
- **Affects**
  - main: OJS, OMP, OPS (code; a normal day walked)
  - 3.5: OJS, OMP, OPS (code; a normal day walked)
  - 3.4: OJS, OMP, OPS (code)
  - 3.3: OJS, OMP, OPS (code)
- **Introduced** `pkp/pkp-lib#5342` for `pkp/pkp-lib#4844` · [8d4e08c4ae](https://github.com/pkp/pkp-lib/commit/8d4e08c4aeb07f2e9abd8259d51b3b67e72c2b97) · 2019-12-04 · Nate Wright (NateWr)
- **Upstream** none found (2026-10-21)
- **Tracked in** spec U65 [A15](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U65-editorial-statistics.md#a15)
- **Checked** 2026-10-21, each branch's tip (the commits in Evidence)
- **Model** claude-opus-5-5

## Summary

"Year to date" on Statistics › "Editorial Activity" runs from 1 January
of this year to yesterday, so on 1 January it ends on 31 December of
last year, the day before it starts. Choosing it that day renames the
middle column of the "Trends" table "{this year}-01-01 — {last
year}-12-31" and opens an "Error" window; after "OK" the table still
shows the figures of the range chosen before.

The 1 January outcome is read in the code, since the test installs
could not be put on that date. In a browser, on 21 October, "Year to
date" loaded its figures with no window.

Nothing is lost: "Last year" gives the figures that day.

## Impact

- **Lost**: nothing stored or counted, and no figure is out of reach:
  on 1 January every complete day falls in last year.
- **Who**: managers and editors who choose "Year to date" on that day.
- **Way round**: "OK" closes the window; "Last year" loads the figures.

Low: one day a year, and the window says that something went wrong. The
old figures stay under the new heading, but a heading whose end comes
before its start does not pass for a real range; if users could take
those figures for the new range, the result would mislead and this
would be medium.

## Steps to reproduce

Preconditions:

- PKP's default test dataset, OJS `main` (OMP and OPS the same).
- It is 1 January in the install's time zone, which PHP's `date()`
  follows: `config.inc.php` `[general] time_zone` (`UTC` by default).
  Either set the test machine's clock to 1 January, or, on 31 December
  after 10:00 UTC, set `time_zone = "Pacific/Kiritimati"` (UTC+14),
  where it is then already 1 January.
- Step 2 is taken on that day: the presets are built when the page
  loads, so a page opened the day before keeps its valid range.

1. Sign in as `dbarnes`.
2. Open Statistics › "Editorial Activity"
   (`/index.php/publicknowledge/en/stats/editorial/editorial`).
3. Press the calendar button beside the date range ("Change date
   range").
4. Choose "Year to date".

**Expected**: the middle column of "Trends" is headed with a range that
starts no later than it ends, and shows that range's figures; no window
opens.

**Observed** (read in the code for 1 January 2027): the middle column is
renamed "2027-01-01 — 2026-12-31", the page asks for

```text
GET /index.php/publicknowledge/api/v1/stats/editorial?dateStart=2027-01-01&dateEnd=2026-12-31
400 {"error":"api.stats.400.wrongDateRange"}
```

and an "Error" window opens reading "api.stats.400.wrongDateRange" (on
3.4 and 3.3 "The start date can not be later than the end date."; the
raw code is reported apart, in
[U64 A14](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/issues/U64-A14-stats-refusal-raw-code.md)).
After "OK" the rows keep the "Last 90 days" figures under the renamed
column.

Control, walked on 21 October 2026: "Year to date" asks for
`dateStart=2026-01-01&dateEnd=2026-10-20`, the server answers 200, the
column reads "2026-01-01 — 2026-10-20" and no window opens.

## Cause

`PKPStatsHandler::editorial()` in
`lib/pkp/pages/stats/PKPStatsHandler.php` builds the "Year to date"
preset (lines 177–181 on `main`) from two different days:

```php
'dateStart' => date('Y-m-d', strtotime(date('Y') . '-01-01')),
'dateEnd' => $dateEnd,   // (comment added here) line 85: date('Y-m-d', strtotime('yesterday'))
```

The start is 1 January of today's year; the end is yesterday. On every
other day, yesterday is in the same year. On 1 January it is 31 December
of the year before, so the range ends before it starts. That breaks the
rule `PKPBaseController::_validateStatDates()` enforces for every
statistics range: the start no later than the end, and the end no later
than yesterday.

From there the page follows the range as it is given:

- The preset's `set-range` event reaches `StatsPage.setDateRange()`,
  which stores `dateStart` and `dateEnd`; their watchers call `get()`.
- `DateRange.vue`'s `currentRange` (`dateStart + ' — ' + dateEnd`)
  changes, and its watcher emits `updated:current-range`;
  `StatsEditorialPage.setCurrentDateRange()` writes that string into the
  middle column's heading before any answer arrives.
- `StatsEditorialPage.get()` sends the range to `stats/editorial`;
  `_validateStatDates()` refuses it (`invalidRange`), and
  `PKPStatsEditorialController::get()` answers 400 with
  `api.stats.400.wrongDateRange`.
- `ajaxErrorCallback()` opens the "Error" window with that message, and
  the rejected `Promise.all()` leaves `tableRows` as they were.

Reach, checked in the code:

- The other presets of the page are valid on every day: "Last 90 days"
  ends yesterday, "Last year" and "Last two years" end on 31 December of
  last year (driven on 21 October as well).
- The usage pages of Statistics (`PKPStatsHandler`'s other methods)
  offer "Last 30 days", "Last 90 days", "Last 12 months" and "All
  dates", all counted back from yesterday; none starts on 1 January.
- No app overrides `editorial()` (`pages/stats/StatsHandler.php` of
  OJS, OMP and OPS extend `PKPStatsHandler`), and no other
  `date('Y') . '-01-01'` start exists in pkp-lib, the apps or
  ui-library.

## Proposed fix

Start "Year to date" on 1 January of yesterday's year, the year its last
day falls in ([fix.diff](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/year-to-date-error-on-1-january/fix.diff)):

```diff
                     [
-                        'dateStart' => date('Y-m-d', strtotime(date('Y') . '-01-01')),
+                        // The year of the range's last day (yesterday), so that on 1 January
+                        // the range does not start after it ends
+                        'dateStart' => date('Y-01-01', strtotime('yesterday')),
                         'dateEnd' => $dateEnd,
                         'label' => __('stats.dateRange.thisYear'),
                     ],
```

On every day but 1 January the range is unchanged. On 1 January it is
exactly the "Last year" range, 1 January to 31 December of the year just
ended: the year to date as of the last complete day, which is what the
page's figures always describe. Two presets giving the same range on
that one day is the price of keeping "Year to date" usable; the first
alternative below avoids it at the cost of the preset itself.

Tried on `main` on the three apps, on 21 October: with the fix in,
"Year to date" asked for the same range as before, and the other three
presets asked for the same ranges with the fix in and out. The
1 January outcome was checked by evaluating the old and new expressions
in PHP for 1 January 2027 at 00:00:05 and 23:59 (old 2027-01-01 —
2026-12-31, new 2026-01-01 — 2026-12-31) and for 2 January (both
2027-01-01 — 2027-01-01); it was not seen on a screen.

**Alternatives**:

- Leave "Year to date" out of the list on 1 January: no window and no
  duplicate, but the preset vanishes one day a year and a user looking
  for it is not told why.
- End the range today on 1 January: `_validateStatDates()` refuses an
  end after yesterday, and the figures would count a partial day unlike
  every other preset.

**What goes with it**:

- No stored data to repair; no API or hook changes.
- Applies as written to `stable-3_5_0`, and to 3.4 and 3.3 with the
  same line (in `PKPStatsHandler.inc.php` on 3.3).
- Guard: a unit test needs the preset list moved out of `editorial()`,
  a page handler that renders a template, into a method a test can
  call, with a clock the test can set (`Carbon::setTestNow()`, as
  `SchedulerTest` does, once the presets are built from `Carbon`).
  Without that refactor, the guard is an e2e check of "Year to date" on 1 January
  (listed in spec U65 as waiting for a test install that can be set to
  that date), run on such an install.

Small: one line in one shared method; a unit test, with the refactor it
needs, is the larger part.

## Evidence

- Kept script:
  [walk.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/year-to-date-error-on-1-january/walk.js)
  (helpers in `lib.js` beside it). It takes the Steps on whatever day it
  runs and records the requested range, its answer, any window and the
  table, and whether the server was on 1 January; a second mode drives
  the other three presets. The command is in its header.
- Fix trial on `main`, OJS, OMP and OPS: with the fix in, "Year to
  date" asked for 2026-01-01 to 2026-10-20 (200, no window); "Last
  year" 2025-01-01 to 2025-12-31, "Last two years" 2024-01-01 to
  2025-12-31 and "Last 90 days" 2026-07-22 to 2026-10-20 answered 200
  the same with the fix in and out.
- Not driven: 1 January itself, on any version. The test machine's
  clock is not moved, and on 21 October no time zone reaches 1 January,
  so the Steps were walked on 21 October 2026 (the control, on `main`
  and `stable-3_5_0`, the three apps, PostgreSQL) and the 1 January
  Observed is read in the code: `PKPStatsHandler::editorial()`,
  `PKPBaseController::_validateStatDates()`,
  `PKPStatsEditorialController::get()`, `StatsPage.vue`
  (`setDateRange()`), `StatsEditorialPage.vue` (`get()`,
  `setCurrentDateRange()`), `DateRange.vue`, `mixins/ajaxError.js`.
- Tips: `main` ojs `3109a59114` (lib/pkp `f37a174626`), omp
  `5777025bec` and ops `f048e747b4` (lib/pkp `042726ebf6`), ui-library
  `99abe252`; `stable-3_5_0` ojs `1e78ca0c2b`, omp `cce424e5e`, ops
  `5eca7fd603`, lib/pkp `68512b5fda`, ui-library `2576e00a`. The
  handler file is identical in the three apps on each line.
- 3.4 and 3.3 (code): `git show origin/stable-3_4_0:pages/stats/PKPStatsHandler.php`
  (lib/pkp `85f47442cf`) and
  `origin/stable-3_3_0:pages/stats/PKPStatsHandler.inc.php` (lib/pkp
  `867ce82d8e`) carry the same preset, and so does the file at each
  app's lib/pkp pointer (`a71d6bd2ca` on 3.4; `5e84acd11b`,
  `d446601ebe` on 3.3). Their `APIHandler::_validateStatDates()` refuses
  the range the same way and the editorial handler answers 400 with the
  translated sentence; ui-library `ee684b34` and `96959f9e`
  `StatsEditorialPage.vue` show it through `ajaxErrorCallback()`. App
  tips ojs `0012bd1022` / `d7d9dd14ec`, omp `e30fa7e38` / `8e72fc883`,
  ops `0f1e21a117` / `c5532e2161`; no app overrides `editorial()`.
- Introduced: `git blame` on line 178 names `e3f570bc37` (PSR-12
  reformat, 2021); `git log -S"stats.dateRange.thisYear"` gives
  8d4e08c4ae, the commit that added the page, where the line reads the
  same.
- Upstream: closest, not the same fault, `pkp/pkp-lib#8442` (script
  errors on an out-of-range custom date) and `pkp/pkp-lib#6119` (OPS
  published count).
