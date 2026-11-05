// Issue walk for U44 OPS1 (report docs/issues/U44-OPS1-ops-galley-identifiers-form-fails-never-saved.md),
// on PKP's default test dataset (docs/process/dataset.md), server/journal/press `publicknowledge`.
// Mutates the dataset (the "Metadata" save): reset the dataset fleet before each run.
//
// Default mode, OPS (the Steps): preprint 1's "PDF" galley. Before any save of Settings › Workflow ›
// Submission › "Metadata": as dbarnes, then as the author ccorino, open "Galleys", the row's
// "More Actions" › "Edit" (record the window's tabs and the edit-galley request), close it, then send
// the window's address with edit-galley swapped for identifiers from the signed-in page (the console
// request of the Steps; no screen sends it while no "Publisher ID" box is ticked). Then, as dbarnes,
// "Save" the "Metadata" form with no box ticked and send the same request again.
// Default mode, OJS and OMP (controls): the same before-save steps as dbarnes alone, on OJS
// submission 17's "PDF" galley and OMP book 14's "PDF" publication format.
// NB=1 (the neighbour, OPS): as dbarnes, tick "Enable for Galleys" under "Publisher ID" and "Save",
// then open preprint 1's "PDF" galley "Edit" and its "Identifiers" tab: the tab, its "Publisher ID"
// field and its form request are recorded.
//
// Run (fleet reset first, from the repo root):
//   npm run fleet-prep -- --feature issues-q05d --dataset 4 --reset
//   PROBE_FEATURE=issues-q05d PROBE_AGENT=q05d node bin/probe.js ops \
//     shared/playwright/checks/issues/ops-galley-identifiers-form-fails-never-saved/walk.js
//   (ojs, omp for the controls; NB=1 for the neighbour; PKP_E2E_LINE=stable-3_5_0 with
//   PROBE_FEATURE=issues-q05d-3_5 for 3.5.) No assertions: the script records, the reader judges.
const {forEachApp, launch, signIn, screen, shot, record, loc, idle, sql, serverLog} = require('../../../probe');
const {expect} = require('@playwright/test');

const T = 30_000;
const NB = process.env.NB === '1';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (s, n = 400) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));

const PLAN = {
    ops: {sub: 1, editor: 'dbarnes', author: 'ccorino', label: 'PDF', page: 'Galleys', grid: 'preprint-galleys/preprint-galley-grid'},
    ojs: {sub: 17, editor: 'dbarnes', label: 'PDF', page: 'Galleys', grid: 'article-galleys/article-galley-grid'},
    omp: {sub: 14, editor: 'dbarnes', label: 'PDF', page: 'Publication Formats', grid: 'catalog-entry/publication-format-grid'},
};
const SETTINGS = {ojs: 'journal_settings', omp: 'press_settings', ops: 'server_settings'};

/** Open a side-menu page of the workflow ("Galleys", "Publication Formats"). */
async function openMenuPage(app, page, frame, sub, label, {author = false} = {}) {
    await page.goto('about:blank');
    if (author) await frame.gotoAuthor(sub); else await frame.gotoEditorial(sub);
    await idle(page);
    const link = frame.menuLink(label);
    if (!(await link.last().isVisible().catch(() => false))) {
        if (app.line !== 'stable-3_5_0' && (await frame.latestVersionNode().isVisible().catch(() => false))) {
            await frame.versionNodes().first().click();
        } else {
            await frame.publicationGroup().click();
        }
    }
    await expect(link.last()).toBeVisible({timeout: T});
    await link.last().click();
    await idle(page);
}

/** The row's "Edit" (OJS/OPS: "More Actions" › "Edit"; OMP: the row's extras › "Edit"); returns the window. */
async function openEdit(app, page, frame, label) {
    const dlg = frame.dialog();
    if (app.name === 'omp') {
        const row = dlg.locator('tr.gridRow').filter({hasText: label}).first();
        await expect(row).toBeVisible({timeout: T});
        const extras = row.locator('a.show_extras');
        if (await extras.count()) await extras.first().click();
        await dlg.locator('tr').getByRole('link', {name: 'Edit', exact: true}).first().click();
    } else {
        const menu = dlg.locator('table').locator('tr').filter({hasText: label}).getByRole('button', {name: 'More Actions'}).first();
        await expect(menu).toBeVisible({timeout: T});
        await menu.click();
        await sleep(400);
        await page.getByRole('menuitem', {name: 'Edit', exact: true}).click();
    }
    const win = page.getByRole('dialog').filter({has: page.locator('form, [id$="Tabs"]')}).last();
    await expect(win.getByRole('tab').first()).toBeVisible({timeout: T});
    await idle(page);
    await sleep(800);
    return win;
}

/** The request the "Identifiers" tab would send, from the signed-in page (the Steps' console request). */
async function requestForm(app, page, url) {
    const log = serverLog(app);
    const from = log.mark();
    const r = await page.evaluate(async (u) => {
        const x = await fetch(u, {credentials: 'same-origin', headers: {'X-Requested-With': 'XMLHttpRequest'}});
        const t = await x.text();
        return {status: x.status, length: t.length, head: t.slice(0, 120), hasForm: t.includes('publicIdentifiersForm'),
            hasPublisherIdBox: t.includes('id=\\"publisherId') || t.includes('id="publisherId'), hasSave: /Save/.test(t)};
    }, url);
    await sleep(600);
    return {url, ...r, serverLog: log.since(from).slice(0, 6)};
}

function watchEdits(page) {
    const seen = [];
    page.on('request', (q) => {
        const u = q.url();
        if (/edit-galley|edit-format|\/identifiers\?/.test(u)) seen.push(u.replace(/^https?:\/\/[^/]+/, ''));
    });
    return seen;
}

forEachApp(async (app) => {
    const plan = PLAN[app.name];
    const setting = () => sql(app, `select coalesce((select setting_value from ${SETTINGS[app.name]} where setting_name = 'enablePublisherId'), '(no row)')`);
    const {WorkflowPage} = require('../../../pages/WorkflowPage.js');
    const labels = app.name === 'ops' ? {publicationGroup: 'Preprint'} : {};
    const out = {app: app.name, line: app.line || 'main', mode: NB ? 'neighbour' : 'steps', settingAtStart: setting(), steps: {}};
    const name = NB ? `nb-${app.name}` : `walk-${app.name}`;
    const step = async (id, fn) => {
        try { out.steps[id] = await fn(); } catch (e) { out.steps[id] = {error: flat(e.message, 600)}; console.log(`[${id} FAILED]`, flat(e.message, 300)); }
        record(name, out);
        return out.steps[id];
    };

    // Settings › Workflow › Submission › "Metadata", "Save" (ticking the named boxes first)
    const saveMetadata = async (page, tick) => {
        await page.goto(`/index.php/${app.contextPath}/en/management/settings/workflow#submission/metadata`);
        await idle(page);
        const group = page.getByRole('group', {name: 'Publisher ID', exact: true});
        await expect(group).toBeVisible({timeout: T});
        for (const t of tick) await group.getByRole('checkbox', {name: t}).check();
        await shot(page, `${name}-metadata-${tick.length ? 'ticked' : 'none'}`);
        await loc(page, 'Settings › Workflow › Metadata: the "Publisher ID" group', group);
        const form = group.locator('xpath=ancestor::form[1]');
        const saved = page.waitForResponse((r) => /\/api\/v1\/contexts\/\d+/.test(r.url()) && r.request().method() !== 'GET', {timeout: T});
        await form.getByRole('button', {name: 'Save', exact: true}).click();
        const resp = await saved;
        await idle(page);
        return {ticked: tick, save: resp.status(), settingAfterSave: setting()};
    };

    // Steps 2–4 for one account: the window's tabs and request, then the form's request
    const galleyRound = async (page, who, author, key) => {
        const frame = new WorkflowPage(page, app.contextPath, {labels});
        const edits = watchEdits(page);
        const s = {};
        s.page = await step(`${key}-page`, async () => {
            await openMenuPage(app, page, frame, plan.sub, plan.page, {author});
            await shot(page, `${name}-${key}-page`);
            return {screen: await screen(page)};
        });
        const win = await step(`${key}-window`, async () => {
            const n0 = edits.length;
            const w = await openEdit(app, page, frame, plan.label);
            await shot(page, `${name}-${key}-window`);
            const tabs = (await w.getByRole('tab').allInnerTexts()).map((t) => t.trim());
            await loc(page, `${plan.page}: the item's window tabs (${app.name}, ${who})`, w.getByRole('tab'));
            const title = flat(await w.locator('h1, h2, .pkp_modal_panel > .header').first().innerText().catch(() => null), 120);
            const sent = edits.slice(n0);
            await w.getByRole('button', {name: 'Close', exact: true}).first().click().catch(() => {});
            await idle(page);
            return {title, tabs, editRequest: sent.find((u) => /edit-(galley|format)/.test(u)) || null,
                identifiersRequestsSent: sent.filter((u) => /\/identifiers\?/.test(u))};
        });
        await step(`${key}-request`, async () => {
            const url = win && win.editRequest ? win.editRequest.replace(/\/edit-(galley|format)\?/, '/identifiers?') : null;
            if (!url) return {skipped: 'no edit request to take the address from'};
            return requestForm(app, page, url);
        });
    };

    if (NB) {
        const {page, close} = await launch(app);
        try {
            await signIn(page, plan.editor);
            await step('nb-save-galleys-ticked', () => saveMetadata(page, ['Enable for Galleys']));
            const frame = new WorkflowPage(page, app.contextPath, {labels});
            const edits = watchEdits(page);
            await step('nb-window', async () => {
                await openMenuPage(app, page, frame, plan.sub, plan.page);
                const n0 = edits.length;
                const w = await openEdit(app, page, frame, plan.label);
                const tabs = (await w.getByRole('tab').allInnerTexts()).map((t) => t.trim());
                const res = {tabs};
                const idTab = w.getByRole('tab', {name: 'Identifiers', exact: true});
                if (await idTab.count()) {
                    const resp = page.waitForResponse((r) => /\/identifiers\?/.test(r.url()), {timeout: T}).catch(() => null);
                    await idTab.click();
                    const r = await resp;
                    res.identifiersResponse = r ? {status: r.status(), url: r.url().replace(/^https?:\/\/[^/]+/, '')} : null;
                    await idle(page);
                    await sleep(800);
                    const field = w.getByRole('textbox', {name: /Publisher ID/});
                    res.publisherIdField = await field.count();
                    res.saveButton = await w.getByRole('button', {name: 'Save', exact: true}).count();
                    await loc(page, 'the galley window\'s "Identifiers" tab, "Publisher ID" field', field);
                }
                res.screen = await screen(page);
                await shot(page, `${name}-window-identifiers`);
                res.requestsSent = edits.slice(n0);
                return res;
            });
        } finally {
            await close();
        }
        out.settingAtEnd = setting();
        record(name, out);
        return;
    }

    const accounts = app.name === 'ops' ? [[plan.editor, false], [plan.author, true]] : [[plan.editor, false]];
    for (const [who, author] of accounts) {
        const {page, close} = await launch(app);
        try {
            await signIn(page, who);
            await galleyRound(page, who, author, `unsaved-${who}`);
        } finally {
            await close();
        }
    }
    if (app.name === 'ops') {
        const {page, close} = await launch(app);
        try {
            await signIn(page, plan.editor);
            await step('save-none-ticked', () => saveMetadata(page, []));
            await galleyRound(page, plan.editor, false, `saved-${plan.editor}`);
        } finally {
            await close();
        }
    }
    out.settingAtEnd = setting();
    record(name, out);
});
