// Issue report docs/issues/U19-OMP9-oai-press-set-misses-series-deleted-records.md (U19 OMP9) {OMP}:
// the report's Steps to reproduce, walked through the screens on PKP's default test dataset (a dataset
// fleet, harness.md "Dataset fleets"), as the dataset's `dbarnes`. The kit builds nothing.
//
//   1. ListIdentifiers with set=publicknowledge (signed out): both published books
//   2. sign in as dbarnes
//   3. book 14 (series Psychology, `psy`): workflow › "Unpublish", confirmed
//   4. book 5 (no series): workflow › "Unpublish", confirmed
//   5–7. signed out: ListIdentifiers and ListRecords with set=publicknowledge, at the press's address and
//        the site-wide one
// Control (every run): set=publicknowledge:psy, and the list without a set.
//
// WALK_MODE=nb is the fix trial's neighbour check, reads only (it unpublishes the two books first only
// when no deleted record is listed yet): the series set, an empty series, the press's set with dates.
//
// Reset first:  npm run fleet-prep -- --feature issues-q23b --dataset 2 --reset
// Run (main):   PROBE_FEATURE=issues-q23b PROBE_AGENT=q23b node bin/probe.js omp shared/playwright/checks/issues/oai-press-set-misses-series-deleted-records/walk.js
// Run (3.5):    PKP_E2E_LINE=stable-3_5_0 npm run fleet-prep -- --feature issues-q23b-3_5 --dataset 2 --reset
//               PKP_E2E_LINE=stable-3_5_0 PROBE_RUN=r35 PROBE_FEATURE=issues-q23b-3_5 PROBE_AGENT=q23b node bin/probe.js omp shared/playwright/checks/issues/oai-press-set-misses-series-deleted-records/walk.js
// Neighbour:    WALK_MODE=nb PROBE_RUN=nb-in … (same command)
const {forEachApp, launch, signIn, record} = require('../../../probe');
const L = require('./lib');

const CTX = 'publicknowledge';
const BOOKS = [{id: 14, title: 'From Bricks to Brains', series: 'psy'}, {id: 5, title: 'Bomb Canada', series: null}];
const LIST = 'verb=ListRecords&metadataPrefix=oai_dc';
const IDS = 'verb=ListIdentifiers&metadataPrefix=oai_dc';
const MODE = process.env.WALK_MODE || 'steps';

forEachApp(async (app) => {
    if (!app.dataset) throw new Error('walk.js runs on a dataset fleet only (fleet-prep --dataset n)');
    if (app.name !== 'omp') return console.log(`[walk] ${app.name}: OMP only (OJS and OPS match "<set>:%" already)`);
    const f = {app: app.name, line: app.line || 'main', run: process.env.PROBE_RUN || null, mode: MODE, reads: [], unpublish: []};
    const {page, close} = await launch(app);
    page.setDefaultTimeout(L.T);
    const read = async (label, ctx, params, show = false) => {
        try {
            const r = await L.ask(show ? page : null, app, label, ctx, params);
            f.reads.push(r);
            console.log(L.line(app, r));
            return r;
        } catch (e) {
            const r = {label, error: `read failed: ${L.flat(e.message, 200)}`, headers: []};
            f.reads.push(r);
            console.log(`[read] ${app.name} ${label}: ${r.error}`);
            return r;
        }
    };
    const unpublishBoth = async () => {
        await signIn(page, 'dbarnes');
        for (const b of BOOKS) {
            try {
                const u = await L.unpublish(page, app, CTX, b.id);
                f.unpublish.push({book: b.id, ...u});
                console.log(`[fact] ${app.name} unpublish book ${b.id}: ${JSON.stringify(u)}`);
            } catch (e) {
                f.unpublish.push({book: b.id, error: L.flat(e.message, 300)});
                console.log(`[fact] ${app.name} unpublish book ${b.id} FAILED: ${L.flat(e.message, 300)}`);
            }
        }
        await page.goto(app.url('/index.php/index/login/signOut')).catch(() => {});
        await L.sleep(1000);
    };
    try {
        if (MODE === 'steps') {
            await read('1 press set, ListIdentifiers, before', CTX, `${IDS}&set=${CTX}`, true);
            await unpublishBoth();
            await read('5 press set, ListIdentifiers', CTX, `${IDS}&set=${CTX}`, true);
            await read('6 press set, ListRecords', CTX, `${LIST}&set=${CTX}`);
            await read('7 site-wide, press set, ListIdentifiers', 'index', `${IDS}&set=${CTX}`, true);
            await read('7 site-wide, press set, ListRecords', 'index', `${LIST}&set=${CTX}`);
            await read('control series set psy, ListIdentifiers', CTX, `${IDS}&set=${CTX}:psy`);
            await read('control no set, ListIdentifiers', CTX, IDS);
        } else {
            const now = await read('nb no set, ListIdentifiers', CTX, IDS);
            if (!now.headers.some((h) => h.startsWith('DELETED'))) {
                console.log(`[walk] ${app.name} nb: no deleted record yet, unpublishing books 14 and 5 first`);
                await unpublishBoth();
                await read('nb no set, ListIdentifiers (after unpublish)', CTX, IDS);
            }
            const today = new Date().toISOString().slice(0, 10);
            await read('nb press set', CTX, `${IDS}&set=${CTX}`);
            await read('nb series set psy', CTX, `${IDS}&set=${CTX}:psy`);
            await read('nb site-wide series set psy', 'index', `${IDS}&set=${CTX}:psy`);
            await read('nb empty series set lis', CTX, `${IDS}&set=${CTX}:lis`);
            await read('nb press set, from 2030', CTX, `${IDS}&set=${CTX}&from=2030-01-01`);
            await read('nb press set, until 2020', CTX, `${LIST}&set=${CTX}&until=2020-01-01`);
            await read('nb site-wide press set, from 2030', 'index', `${IDS}&set=${CTX}&from=2030-01-01`);
            await read(`nb press set, from today`, CTX, `${IDS}&set=${CTX}&from=${today}`);
        }
    } catch (e) {
        f.error = String(e.stack || e.message).slice(0, 800);
        console.log(`[walk] ${app.name} ERROR ${f.error}`);
    } finally {
        record('facts', f);
        await close();
    }
});
