// Issue report walk: docs/issues/U66-A2-unsaved-name-kept-after-closing-edit-panel.md, its
// "Highlights" Steps (spec U11 register A4), refreshed 2026-11-09: the journal's Highlights tab
// with the three ways of closing "Edit Highlight" without "Save" (its close control, Escape in
// "URL", a click outside the panel), then the site's Highlights tab. Takes the Steps through the
// screens on a dataset fleet (PKP's default test dataset, harness.md "Dataset fleets"): `rvaca` on
// `publicknowledge`, then `admin`. The kit builds nothing: the highlights and the second journal
// the site's tab needs are made on screen. Fact labels carry the report's step numbers; every step
// records what it finds and never throws, so a trial with the fix in records the state it brings.
// Reset the fleet before each walk: the walk adds highlights and a journal.
//
// Modes (first argument):
//   (none)      the Highlights Steps (journal tab, then the site's tab).
//   neighbour   what the fix must leave alone (runs alone, on a fresh dataset): an ordinary edit
//               of a journal highlight's English and French title, and of a site highlight's,
//               saved with "Save"; the row at once and after a reload, and the reopened boxes.
//
// Reset:  npm run fleet-prep -- --feature issues-u11r1 --dataset 1 --reset
// Run:    PROBE_FEATURE=issues-u11r1 PROBE_AGENT=u11r1 node bin/probe.js all shared/playwright/checks/issues/unsaved-name-kept-after-closing-edit-panel/highlights.js [neighbour]
// 3.5:    PKP_E2E_LINE=stable-3_5_0 in front of both (reset with --feature issues-u11r1-3_5),
//         and PROBE_RUN=r35 PROBE_FEATURE=issues-u11r1-3_5 in front of the run.
// Fix:    node bin/try-fix.js apply shared/playwright/checks/issues/unsaved-name-kept-after-closing-edit-panel/fix.diff ojs omp ops
const {forEachApp, launch, signIn, signOut, screen, shot, record, serverLog} = require('../../../probe');
const L = require('./lib');

const MODE = process.argv.slice(2).includes('neighbour') ? 'neighbour' : 'steps';
const SECOND = {initials: 'U11R1', path: 'u11r1second', email: 'u11r1second@mailinator.com'};
const NAMES = {ojs: 'u11r1 Second Journal', omp: 'u11r1 Second Press', ops: 'u11r1 Second Server'};

forEachApp(async (app) => {
    if (!app.dataset) throw new Error('highlights.js drives a dataset fleet only (fleet-prep --dataset)');
    const facts = {app: app.name, line: app.line || 'main', dataset: app.dataset, mode: MODE, steps: {}};
    const fact = (k, v) => { facts.steps[k] = v; console.log(`[u11r1] ${app.name} ${k}: ${L.flat(JSON.stringify(v), 700)}`); };
    let n = 0;
    const snap = async (page, name) => {
        record(`hl-${MODE}-${String(++n).padStart(2, '0')}-${name}`, await screen(page).catch((e) => ({error: e.message})));
        await shot(page, `hl-${MODE}-${name}`).catch(() => {});
    };
    const log = serverLog(app);
    const mark = log.mark();
    const {page, close} = await launch(app);
    const step = async (k, fn) => {
        try { const v = await fn(); fact(k, v); return v; } catch (e) { fact(k, {error: L.flat(e.message, 500)}); return undefined; }
    };
    // Open "Edit" on the first row, take one action, close; returns the reopen's title read.
    const editTitle = async (d) => (d ? L.readRich(page, d, L.HTITLE('en')) : 'no row');
    const first = async () => (await L.rows(page))[0];

    try {
        if (MODE === 'steps') {
            await signIn(page, 'rvaca', {contextPath: app.contextPath});
            // ---- journal tab
            await step('17 tab', () => L.openContextHighlights(page, app, app.contextPath));
            await step('17 add', () => L.addHighlight(page, {title: 'Open call', url: 'https://example.org/call', label: 'Read more'}));
            fact('17 rows', await L.rows(page));
            await step('18 close control', async () => {
                const d = await L.openEdit(page, 'Open call');
                await L.appendRich(page, d, L.HTITLE('en'), ' Draft');
                return {...(await L.closePanel(page, d, 'control')), rows: await L.rows(page)};
            });
            await snap(page, 'step18-after-close');
            await step('19 reopen and save URL', async () => {
                const d = await L.openEdit(page, await first());
                const title = await editTitle(d);
                await d.locator('#highlight-url-control').fill('https://example.org/call2');
                return {reopenedTitle: title, save: await L.pressSave(page, d), rows: await L.rows(page)};
            });
            await step('20 reload', async () => {
                const r = await L.openContextHighlights(page, app, app.contextPath);
                const d = await L.openEdit(page, r[0]);
                const out = {rows: r, title: await editTitle(d), url: d ? await d.locator('#highlight-url-control').inputValue() : null};
                await snap(page, 'step20-reopened-after-reload');
                if (d) await L.closePanel(page, d, 'control');
                return out;
            });
            await step('21 escape', async () => {
                const d = await L.openEdit(page, await first());
                await L.appendRich(page, d, L.HTITLE('en'), ' Esc');
                return {...(await L.closePanel(page, d, 'escape')), rows: await L.rows(page)};
            });
            await snap(page, 'step21-after-escape');
            await step('22 outside', async () => {
                const d = await L.openEdit(page, await first());
                const reopened = await editTitle(d);
                await L.appendRich(page, d, L.HTITLE('en'), ' Out');
                return {reopenedTitle: reopened, ...(await L.closePanel(page, d, 'outside')), rows: await L.rows(page)};
            });
            await snap(page, 'step22-after-outside');
            await step('23 reload', () => L.openContextHighlights(page, app, app.contextPath));
            // ---- the site's tab
            await signOut(page);
            await signIn(page, 'admin');
            await step('24 create', async () => ({status: await L.createContext(page, app, {...SECOND, name: NAMES[app.name]}), landed: L.rel(page.url())}));
            await step('25 site tab', () => L.openSiteHighlights(page));
            const add = await step('25 add', () => L.addHighlight(page, {title: 'Site news', url: 'https://example.org/site', label: 'Read more'}));
            fact('25 rows', await L.rows(page));
            await snap(page, 'step25-site-added');
            if (add && add.status === 200 && (await L.rows(page)).length) {
                await step('26 close control', async () => {
                    const d = await L.openEdit(page, 'Site news');
                    await L.appendRich(page, d, L.HTITLE('en'), ' Draft');
                    return {...(await L.closePanel(page, d, 'control')), rows: await L.rows(page)};
                });
                await snap(page, 'step26-site-after-close');
                await step('27 reopen and save URL', async () => {
                    const d = await L.openEdit(page, await first());
                    const title = await editTitle(d);
                    await d.locator('#highlight-url-control').fill('https://example.org/site2');
                    return {reopenedTitle: title, save: await L.pressSave(page, d), rows: await L.rows(page)};
                });
                await step('28 reload', async () => {
                    const r = (await L.openSiteHighlights(page)).rows;
                    const d = await L.openEdit(page, r[0]);
                    const out = {rows: r, title: await editTitle(d), url: d ? await d.locator('#highlight-url-control').inputValue() : null};
                    await snap(page, 'step28-site-reopened-after-reload');
                    if (d) await L.closePanel(page, d, 'control');
                    return out;
                });
            } else {
                fact('26-28', 'not taken: the site highlight was not saved at step 25');
            }
        } else {
            // neighbour: ordinary edits saved, English and French
            const ordinary = async (prefix, open) => {
                const d = await L.openEdit(page, await first());
                await L.setRich(page, d, L.HTITLE('en'), `${prefix} Saved`);
                const fr = await L.showFrench(page, d);
                if (fr) await L.setRich(page, d, L.HTITLE('fr_CA'), `${prefix} Enregistré`);
                const save = await L.pressSave(page, d);
                const rowsAtOnce = await L.rows(page);
                const r = await open();
                const d2 = await L.openEdit(page, r[0]);
                const en = await editTitle(d2);
                const out = {save, rowsAtOnce, rowsAfterReload: r, en, fr: fr && d2 && (await L.showFrench(page, d2)) ? await L.readRich(page, d2, L.HTITLE('fr_CA')) : null};
                if (d2) await L.closePanel(page, d2, 'control');
                return out;
            };
            await signIn(page, 'rvaca', {contextPath: app.contextPath});
            await step('nb1 tab', () => L.openContextHighlights(page, app, app.contextPath));
            await step('nb1 add', () => L.addHighlight(page, {title: 'Open call', url: 'https://example.org/call', label: 'Read more'}));
            await step('nb1 ordinary edit', () => ordinary('Journal', () => L.openContextHighlights(page, app, app.contextPath)));
            await snap(page, 'nb1-journal');
            await signOut(page);
            await signIn(page, 'admin');
            await step('nb2 create', async () => ({status: await L.createContext(page, app, {...SECOND, name: NAMES[app.name]})}));
            await step('nb2 site tab', () => L.openSiteHighlights(page));
            const add = await step('nb2 add', () => L.addHighlight(page, {title: 'Site news', url: 'https://example.org/site', label: 'Read more'}));
            if (add && add.status === 200) {
                await step('nb2 ordinary edit', () => ordinary('Site', async () => (await L.openSiteHighlights(page)).rows));
                await snap(page, 'nb2-site');
            }
        }
    } catch (e) {
        fact('ERROR', L.flat(e.stack || e, 1200));
        await snap(page, 'ERROR').catch(() => {});
    } finally {
        facts.serverLog = log.since(mark).map((l) => L.flat(l, 400));
        console.log(`[u11r1] ${app.name} server log: ${JSON.stringify(facts.serverLog)}`);
        record(`hl-facts-${MODE}`, facts);
        await close();
    }
});
