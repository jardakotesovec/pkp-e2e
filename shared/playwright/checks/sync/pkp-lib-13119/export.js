// Kept check for pkp/pkp-lib#13119 / pkp/ojs#5715 (issue pkp/pkp-lib#13062, regression read rr13062, 2026-10-28):
// the DOIs page with DataCite chosen on screen (S5 of .reports/sync/rr13062/suspicions.md). OJS only; needs
// seed.js's journals (seed-ojs.json in the same output folder). On X: Settings › Distribution › DOIs ›
// "Registration", "DataCite" chosen and saved; the "Setup" tab's kinds read back; the DOIs page's rows of W1 and
// W3 (Peer Review rows); "Export DOIs" on W3 (one review) and on W1+W3: the action's answer. On F (fr_CA primary):
// the same choice and "Export DOIs" on W5. The fleets reach no agency, so an export is expected to stop at the
// schema fetch ("Error" window, harness.md); a 500 instead is the build failing before it. X and F are put back on
// Crossref at the end (in their settings rows). At the base DataCite does not take "Peer Review" (the save unticks
// it, U45 Rule 35), which the kinds line shows.
//
// Run:   PROBE_FEATURE=sync PROBE_AGENT=rr13062 node bin/probe.js ojs shared/playwright/checks/sync/pkp-lib-13119/export.js
// Facts: .reports/sync/<agent>/export-ojs.json, screenshots export-*-ojs.png
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, record, shot, idle, sql, serverLog, outDir} = require('../../../probe');
const {DoisPage, DoiSettings, recordNotices} = require('../../../pages/DoisPages.js');

forEachApp(async (app) => {
    if (app.name !== 'ojs') return console.log(`[export] ${app.name}: skipped (OJS only)`);
    const seed = JSON.parse(fs.readFileSync(path.join(outDir(), 'seed-ojs.json'), 'utf8'));
    const {X, F} = seed.contexts;
    const {W1, W3, W5} = seed.works;
    const out = {};
    const log = serverLog(app);
    const from = log.mark();
    const {page, close} = await launch(app);
    page.on('dialog', (d) => d.accept().catch(() => {}));
    const exportOn = async (ctx, ids, name) => {
        const dp = new DoisPage(page, ctx);
        await dp.goto();
        await dp.tick(ids);
        const dialog = await dp.chooseBulkAction('Export DOIs');
        const text = (await dialog.innerText()).replace(/\s+/g, ' ').trim();
        const acted = page.waitForResponse((r) => /\/api\/v1\/dois\//.test(r.url()) && r.request().method() !== 'GET', {timeout: 60000});
        await dialog.getByRole('button', {name: 'Export DOIs', exact: true}).click();
        const r = await acted;
        const body = (await r.text().catch(() => '')).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 400);
        await idle(page);
        await page.waitForTimeout(1000);
        const windows = await page.getByRole('dialog').allInnerTexts().catch(() => []);
        await shot(page, `export-${name}`);
        return {confirm: text, status: r.status(), body, windows: windows.map((w) => w.replace(/\s+/g, ' ').slice(0, 300))};
    };
    try {
        await recordNotices(page);
        for (const [ctx, ids, name] of [[X, [W3], 'x-w3'], [X, [W1, W3], 'x-w1w3'], [F, [W5], 'f-w5']]) {
            if (!out[ctx]) {
                await signIn(page, `${ctx}mgr`, {contextPath: ctx});
                const s = new DoiSettings(page, ctx);
                await s.goto('Registration');
                await s.chooseAgency('DataCite');
                const saved = await s.pressSave(s.registration);
                await s.goto('Setup');
                out[ctx] = {agencySave: saved.status(), kinds: await s.kinds()};
                const dp = new DoisPage(page, ctx);
                await dp.goto();
                out[ctx].rows = {};
                for (const id of ids) {
                    const row = dp.row(id);
                    await dp.expand(row, id);
                    out[ctx].rows[id] = await dp.doiTypes(row);
                }
                console.log(`[export] ojs ${ctx}: DataCite saved ${out[ctx].agencySave}; Setup kinds ${JSON.stringify(out[ctx].kinds)}; DOIs page rows ${JSON.stringify(out[ctx].rows)}`);
            }
            const from2 = log.mark();
            out[name] = await exportOn(ctx, ids, name);
            out[name].serverLog = log.since(from2);
            console.log(`[export] ojs ${name}: confirm "${out[name].confirm}"; "Export DOIs" ${out[name].status} ${out[name].body}; windows ${JSON.stringify(out[name].windows)}; server log ${JSON.stringify(out[name].serverLog).slice(0, 500)}`);
        }
    } finally {
        for (const ctx of [X, F]) {
            sql(app, `update journal_settings set setting_value='crossrefplugin' where setting_name='registrationAgency' and journal_id=(select journal_id from journals where path='${ctx}')`);
        }
        out.serverLog = log.since(from);
        record('export', out);
        await close();
    }
});
