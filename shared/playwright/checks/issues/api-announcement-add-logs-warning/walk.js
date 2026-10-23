// Issue walk, U12 A20 (reporter q23k, housekeeping 2026-10-23): an announcement added through the
// REST API without `sendEmail` is saved, but every such add writes
// `PHP Warning: Undefined array key "sendEmail"` to the server's error log. Steps in
// .reports/issues/q23k/steps.md, on PKP's default test dataset (a dataset fleet), as `rvaca`.
//
//   MODE=steps (default)  the Steps: enable announcements, open Announcements, the console POST
//                         without sendEmail (log read from a mark before it), the list, then the
//                         control: the screen's own "Add Announcement" (box unticked), log read again.
//   MODE=nb               the neighbour for the fix: the console POST without sendEmail, a screen add
//                         unticked, a screen add ticked; the job runner pumped until the ticked add's
//                         "New Announcement" mail holds; then the mail of each title counted.
//
// The walk adds announcements: reset the fleet before each run.
//   npm run fleet-prep -- --feature issues-q23k --dataset 4 --reset
//   bin/app-lock.sh shared ojs -- env PROBE_FEATURE=issues-q23k PKP_E2E_DATASET=4 PROBE_AGENT=q23k \
//       node bin/probe.js ojs shared/playwright/checks/issues/api-announcement-add-logs-warning/walk.js
//   (omp, ops the same; stable-3_5_0: PKP_E2E_LINE=stable-3_5_0 in front, feature issues-q23k-3_5,
//   PROBE_RUN=r35.) No assertions: the script records, the reader judges.
const {forEachApp, launch, signIn, screen, record, idle, serverLog} = require('../../../probe');
const L = require('./lib');

const RUN = process.env.PROBE_RUN || 'main';
const MODE = process.env.MODE || 'steps';
const LOGMATCH = /error|exception|fatal|warning|deprecat|notice|undefined|\[5\d\d\]/i;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

forEachApp(async (app) => {
    const srv = serverLog(app, {match: LOGMATCH});
    const logSince = (from) => srv.since(from).map((l) => L.flat(l, 600));
    const {page, close} = await launch(app);
    const facts = {mode: MODE, run: RUN, line: app.line || 'main'};
    const out = (k, v) => {
        facts[k] = v;
        record(`a20-${MODE}-${RUN}-${app.name}`, facts);
        console.log(`[a20 ${MODE} ${RUN} ${app.name}] ${k}:`, JSON.stringify(v).slice(0, 1500));
    };
    const snap = async (label) => {
        await idle(page).catch(() => {});
        const s = await screen(page);
        record(`a20-${MODE}-${RUN}-${app.name}-${label}`, s);
        return s;
    };
    const step = async (k, fn) => {
        try { out(k, await fn()); } catch (e) { out(k, {error: L.flat(e.message, 500)}); await snap(`${k}-error`).catch(() => {}); }
    };
    try {
        // 1. Sign in as rvaca.
        await signIn(page, 'rvaca');
        await snap('1-signed-in');
        // 2. Enable announcements.
        await step('2-enable', async () => { const r = await L.enableAnnouncements(app, page); await snap('2-enabled'); return r; });
        // 3. Announcements in the side menu.
        await step('3-open', async () => { const r = await L.openAnnouncements(app, page); await snap('3-announcements'); return r; });

        if (MODE === 'steps') {
            // 4-5. The console POST without sendEmail; the log since a mark before it.
            await step('4-api-add', async () => {
                const from = srv.mark();
                const r = await L.apiAdd(page, {title: 'hkq23k Call for papers'});
                await sleep(1500);
                r.log = logSince(from);
                return r;
            });
            // 6. Reload the Announcements page.
            await step('6-list', async () => {
                await page.reload();
                await idle(page).catch(() => {});
                await page.locator('main .listPanel').first().waitFor({state: 'visible', timeout: 30_000});
                await snap('6-list');
                return {titles: await L.titles(page)};
            });
            // 7. Control: the screen's own add, box unticked; the log since a mark before the save.
            await step('7-screen-add', async () => {
                const from = srv.mark();
                const r = await L.screenAdd(page, {title: 'hkq23k Screen add', tick: false});
                await sleep(1500);
                r.log = logSince(from);
                await snap('7-saved');
                r.titles = await L.titles(page);
                return r;
            });
        } else {
            const since = new Date(Date.now() - 2000);
            const T_API = 'hkq23k NB API add', T_OFF = 'hkq23k NB screen unticked', T_ON = 'hkq23k NB screen ticked';
            await step('nb-api-add', async () => {
                const from = srv.mark();
                const r = await L.apiAdd(page, {title: T_API});
                await sleep(1500);
                r.log = logSince(from);
                return r;
            });
            await step('nb-screen-unticked', async () => {
                await page.reload(); await idle(page).catch(() => {});
                const from = srv.mark();
                const r = await L.screenAdd(page, {title: T_OFF, tick: false});
                await sleep(1000);
                r.log = logSince(from);
                return r;
            });
            await step('nb-screen-ticked', async () => {
                const from = srv.mark();
                const r = await L.screenAdd(page, {title: T_ON, tick: true});
                await sleep(1000);
                r.log = logSince(from);
                await snap('nb-saved');
                r.titles = await L.titles(page);
                return r;
            });
            await step('nb-mail', async () => {
                const pump = await L.pumpRunner(app, page, {subject: T_ON, since});
                return {
                    pump,
                    ticked: await L.mails(app, T_ON, since),
                    unticked: await L.mails(app, T_OFF, since),
                    apiWithoutKey: await L.mails(app, T_API, since),
                };
            });
        }
    } catch (e) {
        out('FAILED', L.flat(e.stack || e, 2000));
        await snap('failed').catch(() => {});
        process.exitCode = 1;
    } finally {
        await close();
    }
});
