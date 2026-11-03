// Issue report docs/issues/U17-OMP11-series-cover-delete-raw-code.md (U17 OMP11). A series cover's "Delete" on a
// cover already deleted in another tab, on a series deleted in another tab, and on the broken picture a damaged
// cover leaves (U17 OMP10): the answer's message. Takes the report's Steps on PKP's default test dataset (a dataset
// fleet), OMP only, as `rvaca`:
//   1-6   "Library & Information Studies" › Edit, cover.png, Save; Edit (tab 1); tab 2 Edit › Delete › OK; tab 1
//         Delete › OK; Cancel; reload, Edit.
//   7-11  Add Series "u17hk5 Gone" (path u17hk5gone) with cover.png; Edit (tab 1); tab 2 the row › Delete › OK; tab 1
//         Delete › OK; Cancel; reload: the table.
//   12-16 "Library & Information Studies" › Edit, cover.png, Save; Edit, damaged.png, Save (hangs, OMP10); Cancel,
//         reload, Edit; Delete › OK; Cancel; reload, Edit; the series' page catalog/series/lis.
// WALK=neighbour runs alone (fix in and out): "History" › Edit, cover.png, Save; Edit, Delete › OK: the cover goes with
// no message, the window stays open; reload, Edit: only "Upload File".
// Each run records every "Delete" answer, the browser's messages, the "Confirm" window, the series window, the stored
// cover record (database) and the series' page.
//
// Reset first:  npm run fleet-prep -- --feature issues-hk5 --dataset 4 --reset
// Run (main):   bin/app-lock.sh shared omp -- env PROBE_FEATURE=issues-hk5 PROBE_AGENT=hk5 node bin/probe.js omp shared/playwright/checks/issues/series-cover-delete-raw-code/walk.js
// Run (3.5):    PKP_E2E_LINE=stable-3_5_0 npm run fleet-prep -- --feature issues-hk5-3_5 --dataset 4 --reset
//               PKP_E2E_LINE=stable-3_5_0 PROBE_RUN=r35 PROBE_FEATURE=issues-hk5-3_5 PROBE_AGENT=hk5 node bin/probe.js omp shared/playwright/checks/issues/series-cover-delete-raw-code/walk.js
const fs = require('fs');
const {forEachApp, launch, signIn, screen, record, outFile, serverLog} = require('../../../probe');
const {sleep, tidy, PNG, damagedPng, seriesTab, windowState, openEdit, upload, save, cancel, coverDelete, closeConfirm, stored, seriesPage} = require('./lib.js');

const MODE = process.env.WALK || 'walk';
const LIS = 'Library & Information Studies';

forEachApp(async (app) => {
    if (!app.dataset) throw new Error('walk.js runs on a dataset fleet (fleet-prep --dataset n --reset)');
    if (app.name !== 'omp') return;
    const run = process.env.PROBE_RUN ? `-${process.env.PROBE_RUN}` : '';
    const name = (s) => `${s}${run}-${app.name}`;
    const facts = {app: app.name, line: app.line || 'main', mode: MODE, steps: {}};
    const fact = (k, v) => {
        facts.steps[k] = v;
        console.log(`[fact] ${app.name} ${k}: ${JSON.stringify(v).slice(0, 1500)}`);
    };
    const files = {cover: outFile('cover.png'), damaged: outFile('damaged.png')};
    fs.writeFileSync(files.cover, PNG);
    fs.writeFileSync(files.damaged, damagedPng());
    const log = serverLog(app);
    const {page, close} = await launch(app);
    const dialogs = [];
    const onDialog = (tab) => (d) => {
        dialogs.push({tab, type: d.type(), message: d.message()});
        d.accept().catch(() => null);
    };
    page.on('dialog', onDialog(1));
    let tab2 = null;
    const step = async (label, action) => {
        try {
            const out = await action();
            const plain = out === undefined || (out && typeof out === 'object' && !['Object', 'Array'].includes(out.constructor && out.constructor.name));
            fact(label, plain ? 'done' : out);
            return out;
        } catch (e) {
            fact(`${label} threw`, String(e.message).split('\n')[0]);
            return null;
        }
    };
    const secondTab = async () => {
        tab2 = await page.context().newPage();
        tab2.on('dialog', onDialog(2));
        return tab2;
    };
    const closeSecond = async () => {
        if (tab2) await tab2.close().catch(() => null);
        tab2 = null;
        await page.bringToFront();
    };
    const addWithCover = async (title, path) => {
        const tab = seriesTab(page, app);
        await tab.goto();
        const win = await tab.openAdd();
        await win.type('title[en]', title);
        await win.box('path').fill(path);
        const up = await upload(page, win, files.cover);
        const saved = await save(page, win, log);
        return {upload: up, status: saved.status, windowOpen: saved.windowOpen};
    };
    const coverOnLis = async () => {
        const win = await openEdit(page, app, LIS);
        const up = await upload(page, win, files.cover);
        const saved = await save(page, win, log);
        await cancel(page, win);
        return {upload: up, status: saved.status, body: saved.body, windowOpen: saved.windowOpen};
    };

    try {
        await step('1 sign in as rvaca', () => signIn(page, 'rvaca'));
        if (MODE === 'walk') {
            // ---------------------------------------------------- the cover already deleted in another tab
            await step('2 "Library & Information Studies": cover.png, Save', coverOnLis);
            fact('2 stored', stored(app, 'lis'));
            let win1 = await step('3 tab 1: Edit', () => openEdit(page, app, LIS));
            fact('3 tab 1 window', await windowState(page));
            await secondTab();
            const win2 = await step('4 tab 2: Edit', () => openEdit(tab2, app, LIS));
            await step('4 tab 2: Delete › OK', () => coverDelete(tab2, dialogs, log, name('s4-tab2-deleted')));
            fact('4 stored', stored(app, 'lis'));
            if (win2) await cancel(tab2, win2);
            await closeSecond();
            fact('5 tab 1 window before (unchanged)', await windowState(page));
            await step('5 tab 1: Delete › OK on the cover already gone', () => coverDelete(page, dialogs, log, name('s5-tab1-deleted')));
            await step('6 Cancel the Confirm window', () => closeConfirm(page));
            fact('6 window after Cancel', await windowState(page));
            if (win1) await cancel(page, win1);
            win1 = await step('6 reload, Edit', async () => {
                await page.reload();
                return openEdit(page, app, LIS);
            });
            fact('6 window reopened', await windowState(page));
            record(name('s6-reopened'), await screen(page));
            if (win1) await cancel(page, win1);

            // ---------------------------------------------------- the series deleted in another tab
            await step('7 Add Series "u17hk5 Gone" with cover.png, Save', () => addWithCover('u17hk5 Gone', 'u17hk5gone'));
            fact('7 stored', stored(app, 'u17hk5gone'));
            let winG = await step('8 tab 1: Edit "u17hk5 Gone"', () => openEdit(page, app, 'u17hk5 Gone'));
            await secondTab();
            await step('9 tab 2: the row › Delete › OK', async () => {
                const tab = seriesTab(tab2, app);
                await tab.goto();
                const w = await tab.openDelete('u17hk5 Gone');
                const asked = tidy(await w.root().innerText().catch(() => ''));
                const r = await tab.confirm(w);
                return {asked, status: r.status(), rowLeft: await tab.row('u17hk5 Gone').count()};
            });
            fact('9 stored', stored(app, 'u17hk5gone'));
            await closeSecond();
            await step('10 tab 1: Delete › OK on the deleted series', () => coverDelete(page, dialogs, log, name('s10-tab1-deleted')));
            await step('11 Cancel the Confirm window', () => closeConfirm(page));
            if (winG) await cancel(page, winG);
            await step('11 reload: the table', async () => {
                const tab = seriesTab(page, app);
                await tab.goto();
                return {rows: await tab.row('u17hk5 Gone').count()};
            });

            // ---------------------------------------------------- the broken picture a damaged cover leaves (OMP10)
            await step('12 "Library & Information Studies": cover.png, Save', coverOnLis);
            fact('12 stored', stored(app, 'lis'));
            let winB = await step('13 Edit, damaged.png, Save', async () => {
                const w = await openEdit(page, app, LIS);
                const up = await upload(page, w, files.damaged);
                const saved = await save(page, w, log);
                await cancel(page, w);
                return {upload: up, save: saved};
            });
            fact('13 stored', stored(app, 'lis'));
            winB = await step('14 reload, Edit', async () => {
                await page.reload();
                return openEdit(page, app, LIS);
            });
            const st = await windowState(page);
            for (const i of st.previewImages || []) {
                const r = await page.request.get(new URL(i.src, page.url()).toString()).catch(() => null);
                i.answer = r ? {status: r.status(), type: r.headers()['content-type'], bytes: (await r.body().catch(() => Buffer.alloc(0))).length} : null;
            }
            fact('14 window (the broken picture)', st);
            await step('15 Delete › OK on the broken picture', () => coverDelete(page, dialogs, log, name('s15-deleted')));
            await step('15 Cancel the Confirm window', () => closeConfirm(page));
            fact('15 stored', stored(app, 'lis'));
            if (winB) await cancel(page, winB);
            winB = await step('16 reload, Edit', async () => {
                await page.reload();
                return openEdit(page, app, LIS);
            });
            fact('16 window reopened', await windowState(page));
            record(name('s16-reopened'), await screen(page));
            if (winB) await cancel(page, winB);
            await step('16 the series page catalog/series/lis', () => seriesPage(page, app, 'lis'));
        } else {
            // The neighbour: a cover that is there is still deleted with no message.
            await step('n "History": cover.png, Save', async () => {
                const win = await openEdit(page, app, 'History');
                const up = await upload(page, win, files.cover);
                const saved = await save(page, win, log);
                await cancel(page, win);
                return {upload: up, status: saved.status, windowOpen: saved.windowOpen};
            });
            fact('n stored', stored(app, 'his'));
            let win = await step('n Edit "History"', () => openEdit(page, app, 'History'));
            await step('n Delete › OK', () => coverDelete(page, dialogs, log, name('n-deleted')));
            await step('n Cancel the Confirm window if open', () => closeConfirm(page));
            fact('n stored after', stored(app, 'his'));
            if (win) await cancel(page, win);
            win = await step('n reload, Edit', async () => {
                await page.reload();
                return openEdit(page, app, 'History');
            });
            fact('n window reopened', await windowState(page));
            if (win) await cancel(page, win);
            await sleep(200);
        }
    } finally {
        await closeSecond().catch(() => null);
        facts.dialogs = dialogs;
        record(name(MODE === 'walk' ? 'facts' : `${MODE}-facts`), facts);
        await close();
    }
});
