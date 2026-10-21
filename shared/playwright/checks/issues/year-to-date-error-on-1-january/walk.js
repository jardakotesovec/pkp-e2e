// Issue report docs/issues/U65-A15-year-to-date-error-on-1-january.md (U65 A15): the report's Steps
// to reproduce, walked on PKP's default test dataset (a dataset fleet, harness.md "Dataset
// fleets"). The kit builds nothing and the walk changes nothing: it only reads the page.
//
// The fault shows only when the server's date is 1 January. The script never moves a clock: it
// takes the Steps on whatever day it runs, records the range the page asked for, its answer, the
// windows and the table, and says in `facts.serverToday` / `facts.firstOfJanuary` which day the
// server was on (the day after the end of the server-rendered "Last 90 days" range). On any other
// day the Steps' walk is the report's control; on 1 January it is the Steps' Observed (and, with
// the fix in, its Expected).
//
// Default mode, as `dbarnes`: Statistics › "Editorial Activity", the table under "Last 90 days";
//   the calendar button › "Year to date": the request's range and answer, any window, the table;
//   "OK" on a window, and the table again.
// `neighbour` as the argument (the fix in and out; runs alone): the same page, then "Last year",
//   "Last two years" and "Last 90 days" in turn, each one's request, answer, window and column.
//
// Reset first:  npm run fleet-prep -- --feature issues-h21x --dataset 6 --reset
// Run (main):   PROBE_FEATURE=issues-h21x PROBE_AGENT=h21x node bin/probe.js all shared/playwright/checks/issues/year-to-date-error-on-1-january/walk.js [neighbour]
// Run (3.5):    PKP_E2E_LINE=stable-3_5_0 npm run fleet-prep -- --feature issues-h21x-3_5 --dataset 6 --reset
//               PKP_E2E_LINE=stable-3_5_0 PROBE_RUN=r35 PROBE_FEATURE=issues-h21x-3_5 PROBE_AGENT=h21x node bin/probe.js all shared/playwright/checks/issues/year-to-date-error-on-1-january/walk.js
// Facts: .reports/<feature>/h21x/facts[-neighbour][-<run>]-<app>.json
const {forEachApp, launch, signIn, screen, shot, record} = require('../../../probe');
const {openEditorial, readTrends, choosePreset, readWindows, dismissError} = require('./lib');

const MODE = process.argv.includes('neighbour') ? 'neighbour' : 'steps';

const nextDay = (d) => new Date(Date.parse(`${d}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

forEachApp(async (app) => {
    const {page, close} = await launch(app);
    const facts = {mode: MODE, line: app.line, dataset: app.dataset};
    const snap = async (name) => {
        record(`${MODE}-${name}`, await screen(page));
        await shot(page, `${MODE}-${name}`);
    };
    const preset = async (key, label) => {
        const step = {};
        try {
            const chosen = await choosePreset(page, label);
            step.offered = chosen.offered;
            step.request = chosen.request;
            step.rangeDescending = !!(chosen.request && chosen.request.dateStart > chosen.request.dateEnd);
            step.windows = await readWindows(page);
            await snap(key);
            step.trends = await readTrends(page);
            step.dismissed = await dismissError(page);
            if (step.dismissed) {
                step.trendsAfterOK = await readTrends(page);
                await snap(`${key}-after-ok`);
            }
        } catch (e) {
            step.error = String(e.message).slice(0, 400);
        }
        facts[key] = step;
    };
    try {
        await signIn(page, 'dbarnes');
        facts.pageStatus = await openEditorial(page, app);
        const first = await readTrends(page);
        await snap('last90-default');
        facts.last90Default = first;
        const m = /(\d{4}-\d{2}-\d{2})\s*—\s*(\d{4}-\d{2}-\d{2})/.exec(first.range || '');
        if (m) {
            facts.serverYesterday = m[2];
            facts.serverToday = nextDay(m[2]);
            facts.firstOfJanuary = facts.serverToday.slice(5) === '01-01';
        }
        if (MODE === 'steps') {
            await preset('yearToDate', 'Year to date');
        } else {
            await preset('lastYear', 'Last year');
            await preset('lastTwoYears', 'Last two years');
            await preset('last90', 'Last 90 days');
        }
    } catch (e) {
        facts.error = String(e.message).slice(0, 400);
    } finally {
        record(MODE === 'steps' ? 'facts' : 'facts-neighbour', facts);
        await close();
    }
});
