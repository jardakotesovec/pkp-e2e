// U44 claim check K1 — Publisher IDs on all three apps (docs/specs/U44-identifiers.md, chunk K1).
//
// Run: PROBE_FEATURE=U44 PROBE_AGENT=ccK1 node bin/probe.js <all|ojs|omp|ops> shared/playwright/checks/U44/K1/k1.js
//      PHASES=seed,defaults,tick,...   (default all; later phases reuse k1-state-<app>.json in the output folder;
//      FRESH=1 seeds a new scratch context)
//
// Phases (per app; the ones an app lacks are skipped):
//   seed      a scratch context C with no Publisher ID boxes ticked (a manager, a section editor, a layout editor
//             {OJS OMP}, an author; OJS two unpublished issues) and submissions A and B in Production (OJS/OPS each with
//             a "PDF" galley); a second context U with the URN plugin on for articles and "Enter an individual URN
//             suffix…" and every Publisher ID box ticked {OJS OMP}, for Rule 19
//   defaults  Rule 1: the Metadata settings group unticked; the Metadata page, the galley window, the issue window,
//             the issue galley form, the OMP chapter / format / file windows without a Publisher ID (C, as the manager)
//   tick      the manager ticks every "Publisher ID" box on screen and saves (Settings bullet 1)
//   meta      Rule 3 / A3 / A2 last sentence: the article's Publisher ID on the Metadata page (pid-a1, 12345, a/b,
//             B's value, empty)
//   galley    Rules 4 and 5, A1, A2 on a galley's "Identifiers" tab {OJS OPS}: pid-g1 saves, 12345, a/b, B's
//             pid-g2, empty; then leave the tab unsaved
//   issue     Rules 4 and 5 on the issue's "Identifiers" tab {OJS}
//   igalley   q11 / OJS1: a new issue galley with a Publisher ID; then the value on an existing one; 12345; duplicate
//   press     {OMP} the chapter, publication format and format file windows: tab present, save, refusals, empty
//   (Rule 6 {OMP} has no phase: the press phase shows a format file's tab never stores a publisher ID, so no book-page
//    address can carry one)
//   untick    q3: untick Publications and Galleys (Chapters…), the field and the tab gone; tick again, values back
//   version   Rule 19 / A5 / q6 / q7: Create New Version; the new version's Publisher ID, URN and galley tab
//   pervers   Rule 3: the new version's Publisher ID changed; the source version's kept
//   urnarea   {OJS} lines 101-102: the Rule 19 journal ticks "Galleys" in the URN settings window; the galley tab's URN
//             area; one Save with a new publisher ID and a typed suffix; Create New Version again
//   urnarea2  {OJS} Rule 19: the URN assigned on that newest galley, then one more version: the copy's tab
//   urndup    {OJS} A1: a URN suffix another galley already uses, on a galley tab
//   jats      OJS2 / q24: the "JATS XML" page's generated XML publisher-id entries {OJS}
//   urnareaomp {OMP} line 101: the press enables the URN plugin (every kind); the chapter, format and file tabs
//   igdup     (only when named) the issue galley duplicate check alone, on an existing state
//
// One-offs kept beside it: urn-seed-checkno.js (the seed premise: `urnCheckNo` must be seeded, or the article's
// "Identifiers" page renders empty), urn-resave.js (the settings window saved unchanged), idpage-probe.js (the
// "Identifiers" page's own form GET). Claim check report: .reports/U44/cc-K1.md (2026-09-24).
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, screen, shot, record, loc, note, idle, tag, settled, outDir} = require('../../../probe');

const PHASES = (process.env.PHASES || 'all').split(',').map((s) => s.trim());
const on = (p) => PHASES.includes('all') || PHASES.includes(p);
const log = (...a) => console.log(...a);
const flat = (s, n = 400) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, n);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const vis = '[role="dialog"]:visible';
const topWin = (page) => page.locator(vis).last();

async function snap(page, name, extra) {
    let s;
    try { s = await screen(page); } catch (e) { s = {url: page.url(), error: String(e.message).slice(0, 200)}; }
    if (extra) Object.assign(s, extra);
    record(name, s);
    await shot(page, name).catch(() => {});
    return s;
}
const dialogTexts = (page) => page.locator(vis).evaluateAll((els) => els.map((d) => ({
    name: d.getAttribute('aria-label') || (d.getAttribute('aria-labelledby') && document.getElementById(d.getAttribute('aria-labelledby'))?.innerText) || null,
    text: d.innerText.slice(0, 4000),
}))).catch(() => []);
const menuItems = (page) => page.locator('[role="menuitem"]:visible').evaluateAll((els) => els.map((e) => e.textContent.trim().replace(/\s+/g, ' '))).catch(() => []);

forEachApp(async (app) => {
    const isOJS = app.name === 'ojs', isOMP = app.name === 'omp', isOPS = app.name === 'ops';
    const sf = path.join(outDir(), `k1-state-${app.name}.json`);
    const S = (!process.env.FRESH && fs.existsSync(sf)) ? JSON.parse(fs.readFileSync(sf, 'utf8')) : {};
    const save = () => fs.writeFileSync(sf, JSON.stringify(S, null, 1));
    const facts = {};
    const fact = (k, v) => { facts[k] = v; record('facts', {[k]: v}, {merge: true}); log(`[${app.name} ${k}]`, JSON.stringify(v).slice(0, 1500)); };
    const FILE = isOPS ? 'preprint.pdf' : 'article.pdf';
    const FIXTURE = path.resolve('apps', app.name, 'playwright/fixtures/files', isOPS ? 'preprint.pdf' : 'article.pdf');

    // ---------------------------------------------------------------- seed
    if (on('seed') && !S.C) {
        const t = tag('u44k1');
        const roles = [['mg', 'manager', 'Mia', 'Manager'], ['se', 'sectionEditor', 'Sol', 'Section'], ['au', 'author', 'Ada', 'Author']];
        if (!isOPS) roles.push(['le', 'layoutEditor', 'Lev', 'Layout']);
        const users = roles.map(([k, r, g, f]) => ({username: `${t}${k}`, roles: [r], givenName: g, familyName: f}));
        const spec = {tag: t, context: {name: `U44 K1 ${t}`, acronym: 'KONE', contactName: 'K1 Contact', contactEmail: `${t}c@mail.test`}, users};
        if (isOJS) spec.issues = [{volume: 1, number: 1, year: 2026}, {volume: 1, number: 2, year: 2026}];
        const C = await app.api.createContext(spec);
        S.C = C.path; S.u = Object.fromEntries(roles.map(([k]) => [k, `${t}${k}`])); S.issues = C.issues || null;
        const own = isOPS ? {} : {files: [{file: 'article.pdf'}], decisions: ['skipExternalReview', 'sendToProduction']};
        const gal = isOMP ? {} : {galleys: [{label: 'PDF', file: FILE}]};
        for (const k of ['A', 'B']) {
            const r = await app.api.createSubmission({tag: `${t}${k.toLowerCase()}`, context: S.C, submitter: S.u.au, title: `K1 ${k} ${t}`, participants: [{username: S.u.se, role: 'sectionEditor'}].concat(isOPS ? [] : [{username: S.u.le, role: 'layoutEditor'}]), ...own, ...gal});
            S[k] = {id: r.submissionId, pub: r.publicationId, galleys: r.galleys};
        }
        save();
        log('[seed C]', JSON.stringify(S));
    }
    if (on('seed') && !S.U && !isOPS) {
        const t = tag('u44k1u');
        const users = [{username: `${t}mg`, roles: ['manager'], givenName: 'Uma', familyName: 'Manager'}, {username: `${t}au`, roles: ['author'], givenName: 'Uli', familyName: 'Author'}];
        const pid = isOJS ? ['publication', 'galley', 'issue', 'issueGalley'] : ['publication', 'chapter', 'representation', 'file'];
        const U = await app.api.createContext({tag: t, context: {name: `U44 K1 URN ${t}`, acronym: 'KONEU', contactName: 'K1 Contact', contactEmail: `${t}c@mail.test`}, users, enablePublisherId: pid,
            plugins: {urnpubidplugin: {enabled: true, settings: {enablePublicationURN: true, urnPrefix: 'urn:nbn:de:0000-', urnSuffix: 'customId', urnCheckNo: false, urnResolver: 'https://nbn-resolving.de/', urnNamespace: 'urn:nbn:de'}}}});
        S.U = U.path; S.uu = {mg: `${t}mg`, au: `${t}au`};
        const own = {files: [{file: 'article.pdf'}], decisions: ['skipExternalReview', 'sendToProduction']};
        const r = await app.api.createSubmission({tag: `${t}v`, context: S.U, submitter: S.uu.au, title: `K1 V ${t}`, ...own, ...(isOMP ? {} : {galleys: [{label: 'PDF', file: FILE}]})});
        S.V = {id: r.submissionId, pub: r.publicationId, galleys: r.galleys};
        save();
        log('[seed U]', JSON.stringify({U: S.U, V: S.V}));
    }
    if (on('seed') && !S.O && isOPS) {
        // OPS: a second preprint server with every Publisher ID box ticked, for Rule 19 (no URN plugin on a preprint server)
        const t = tag('u44k1o');
        const users = [{username: `${t}mg`, roles: ['manager'], givenName: 'Oma', familyName: 'Manager'}, {username: `${t}au`, roles: ['author'], givenName: 'Oli', familyName: 'Author'}];
        const O = await app.api.createContext({tag: t, context: {name: `U44 K1 V ${t}`, acronym: 'KONEV', contactName: 'K1 Contact', contactEmail: `${t}c@mail.test`}, users, enablePublisherId: ['publication', 'galley']});
        S.U = O.path; S.uu = {mg: `${t}mg`, au: `${t}au`};
        const r = await app.api.createSubmission({tag: `${t}v`, context: S.U, submitter: S.uu.au, title: `K1 V ${t}`, galleys: [{label: 'PDF', file: FILE}]});
        S.V = {id: r.submissionId, pub: r.publicationId, galleys: r.galleys};
        S.O = true;
        save();
        log('[seed O]', JSON.stringify({U: S.U, V: S.V}));
    }
    if (!S.C) { log('no state; run the seed phase'); return; }

    const cUrl = (ctx, p) => app.url(`/index.php/${ctx}${p}`);
    const wfUrl = (ctx, id, key) => cUrl(ctx, `/dashboard/editorial?workflowSubmissionId=${id}${key ? `&workflowMenuKey=${key}` : ''}`);

    const {page, close} = await launch(app);
    const jsDialogs = [];
    page.on('dialog', async (d) => { jsDialogs.push({type: d.type(), message: d.message()}); if (d.type() === 'beforeunload') await d.accept().catch(() => {}); else await d.dismiss().catch(() => {}); });
    const posts = [];
    page.on('response', async (r) => {
        const m = r.request().method();
        if (m === 'GET') return;
        const u = r.url();
        if (!/updateIdentifiers|identifiers|update-issue|issueGalley|IssueGalley|\/publications\/\d+|\/version|updateGalley|update/i.test(u)) return;
        let body = '';
        try { body = (await r.text()).slice(0, 1500); } catch { /* ignore */ }
        posts.push({at: Date.now(), method: m, override: r.request().headers()['x-http-method-override'] || null, status: r.status(), url: u.replace(/^.*\/index\.php/, '').slice(0, 220), req: flat(decodeURIComponent(r.request().postData() || ''), 600), body: flat(body, 240)});
    });
    const postsSince = (t0) => posts.filter((p) => p.at >= t0).map(({at, ...p}) => p);
    let who = null;
    const as = async (u, ctx = S.C) => { if (who === `${u}@${ctx}`) return; await signIn(page, u, {contextPath: ctx}); await idle(page); who = `${u}@${ctx}`; };

    async function openWf(ctx, id, key, name) {
        await page.goto(wfUrl(ctx, id, key)); await idle(page);
        await page.locator(vis).first().waitFor({timeout: 30000}).catch(() => {});
        await page.waitForFunction(() => !document.body.innerText.includes('Loading'), null, {timeout: 15000}).catch(() => {});
        await idle(page);
        if (name) return snap(page, name);
        return null;
    }
    const sideMenu = () => page.locator(vis).first().evaluate((d) => [...d.querySelectorAll('nav a, nav button, [role=treeitem]')].filter((e) => e.getClientRects().length).map((e) => e.innerText.trim().replace(/\s+/g, ' ')).filter(Boolean).slice(0, 60)).catch(() => []);

    // ---- the Metadata page's Publisher ID (the Vue form)
    const metaForm = () => page.locator(vis).first().locator('form').filter({has: page.getByRole('button', {name: 'Save', exact: true})}).first();
    async function openMeta(ctx, sub, name) {
        await openWf(ctx, sub.id, `publication_${sub.pub}_metadata`);
        await settled(page, metaForm().getByRole('button', {name: 'Save', exact: true}), {timeout: 15000});
        const box = page.locator(vis).first().getByRole('textbox', {name: 'Publisher ID', exact: true});
        const labels = await metaForm().evaluate((f) => [...f.querySelectorAll('label, legend')].map((l) => l.innerText.trim().replace(/\s+/g, ' ')).filter(Boolean)).catch(() => []);
        const s = await snap(page, name, {labels});
        return {box, present: (await box.count()) > 0, value: (await box.count()) ? await box.inputValue() : null, labels, s};
    }
    async function saveMeta(name) {
        const t0 = Date.now();
        await metaForm().getByRole('button', {name: 'Save', exact: true}).click();
        await page.locator('[role="status"]').filter({hasText: /Saved|not saved/}).first().waitFor({timeout: 15000}).catch(() => {});
        await idle(page); await sleep(400);
        const errors = await page.locator(vis).first().locator('.pkpFieldError, [class*="FieldError"]').allInnerTexts().catch(() => []);
        const status = await page.locator('[role="status"]').allInnerTexts().catch(() => []);
        const bar = await page.locator(vis).first().locator('.pkpFormPage__status, .pkpFormErrors, [class*="formError"]').allInnerTexts().catch(() => []);
        const s = await snap(page, name, {errors, status, bar});
        return {posts: postsSince(t0), errors, status: status.map((x) => flat(x, 120)), bar: bar.map((x) => flat(x, 200))};
    }

    // ---- the legacy galley window (Galleys page › row menu › "Edit") and its "Identifiers" tab
    async function openGalleyEdit(ctx, sub, galleyLabel, name) {
        await openWf(ctx, sub.id, `publication_${sub.pub}_galleys`);
        const row = page.locator(vis).first().locator('tbody tr').filter({hasText: galleyLabel}).first();
        await row.waitFor({timeout: 20000}).catch(() => {});
        await row.locator('button').last().click(); await idle(page);
        const items = await menuItems(page);
        await page.getByRole('menuitem', {name: 'Edit', exact: true}).first().click();
        await idle(page);
        await page.waitForFunction(() => { const d = [...document.querySelectorAll('[role=dialog]')].filter((e) => e.getClientRects().length).pop(); return d && d.querySelector('[role=tab], .ui-tabs-nav'); }, null, {timeout: 20000}).catch(() => {});
        await idle(page); await sleep(300);
        const tabs = await topWin(page).locator('[role=tab]').allInnerTexts().catch(() => []);
        const s = await snap(page, name, {rowMenu: items, tabs});
        return {items, tabs: tabs.map((x) => x.trim()), s};
    }
    async function openIdTab(name) {
        const t = topWin(page).getByRole('tab', {name: 'Identifiers', exact: true});
        if (!(await t.count())) return {absent: true};
        await t.click(); await idle(page);
        await topWin(page).locator('form#publicIdentifiersForm, #publicIdentifiersForm').first().waitFor({timeout: 20000}).catch(() => {});
        await idle(page); await sleep(300);
        return readIdTab(name);
    }
    async function readIdTab(name) {
        const f = topWin(page).locator('#publicIdentifiersForm').first();
        const out = {formPresent: (await f.count()) > 0};
        if (out.formPresent) {
            const box = f.locator('input[name="publisherId"]');
            out.publisherIdBox = (await box.count()) > 0;
            out.value = out.publisherIdBox ? await box.inputValue() : null;
            out.labels = await f.evaluate((el) => [...el.querySelectorAll('label, legend, .label, h3, h4, p')].filter((e) => e.getClientRects().length).map((e) => e.innerText.trim().replace(/\s+/g, ' ')).filter(Boolean).slice(0, 30)).catch(() => []);
            out.text = flat(await f.innerText().catch(() => ''), 800);
            out.buttons = await f.locator('button:visible, input[type=submit]:visible, a:visible').allInnerTexts().catch(() => []);
            out.errors = await f.locator('.error, .pkp_form_error, label.error, #formErrors, .pkp_notification').allInnerTexts().catch(() => []);
        }
        out.dialogs = (await dialogTexts(page)).map((d) => ({name: d.name, text: flat(d.text, 300)}));
        await snap(page, name, {idTab: out});
        return out;
    }
    async function saveIdTab(value, name) {
        const f = topWin(page).locator('#publicIdentifiersForm').first();
        const box = f.locator('input[name="publisherId"]');
        if (value !== null) { await box.fill(value); await box.blur().catch(() => {}); }
        const nBefore = (await dialogTexts(page)).length;
        const t0 = Date.now();
        await f.getByRole('button', {name: 'Save', exact: true}).click();
        await page.waitForResponse((r) => /updateIdentifiers|update-identifiers/i.test(r.url()), {timeout: 20000}).catch(() => {});
        await idle(page); await sleep(900); await idle(page);
        const nAfter = (await dialogTexts(page)).length;
        const notices = await page.locator('.app__notifications, .pkp_notification, [role="alert"], [role="status"]').allInnerTexts().catch(() => []);
        const after = {windowsBefore: nBefore, windowsAfter: nAfter, posts: postsSince(t0), notices: notices.map((x) => flat(x, 160)).filter(Boolean)};
        if (nAfter >= nBefore) after.tab = await readIdTab(`${name}-after`);
        else await snap(page, `${name}-after`);
        return after;
    }
    async function closeTopWin() {
        const w = topWin(page);
        const c = w.getByRole('button', {name: /^Close/}).first();
        if (await c.count()) await c.click().catch(() => {});
        await idle(page); await sleep(600);
    }

    // ---- Issues › Future Issues › the row's "Edit" (legacy window with tabs) {OJS}
    const issueLabel = (n) => `Vol. 1 No. ${n} (2026)`;
    async function openIssueEdit(n, name) {
        await page.goto(cUrl(S.C, '/manageIssues')); await idle(page);
        const row = page.locator('tr.gridRow').filter({hasText: issueLabel(n)}).first();
        await row.waitFor({timeout: 20000});
        await row.locator('a.show_extras').click(); await sleep(300);
        const links = await page.locator('tr.row_controls:visible a, tr:visible a').evaluateAll((els) => els.filter((e) => e.getClientRects().length).map((e) => e.innerText.trim()).filter(Boolean)).catch(() => []);
        await page.getByRole('link', {name: 'Edit', exact: true}).filter({visible: true}).first().click();
        await idle(page);
        await page.waitForFunction(() => { const d = [...document.querySelectorAll('[role=dialog]')].filter((e) => e.getClientRects().length).pop(); return d && d.querySelector('[role=tab]'); }, null, {timeout: 20000}).catch(() => {});
        await idle(page); await sleep(300);
        const tabs = (await topWin(page).locator('[role=tab]').allInnerTexts().catch(() => [])).map((x) => x.trim());
        await snap(page, name, {rowLinks: links, tabs});
        return {tabs, rowLinks: links};
    }
    async function openIssueGalleysTab(name) {
        await topWin(page).getByRole('tab', {name: 'Issue Galleys', exact: true}).click(); await idle(page);
        await topWin(page).locator('[id*="issueGalleys"], .pkp_controllers_grid').first().waitFor({timeout: 20000}).catch(() => {});
        await idle(page); await sleep(500);
        const grid = await topWin(page).evaluate((d) => [...d.querySelectorAll('table')].filter((t) => t.getClientRects().length).map((t) => ({columns: [...t.querySelectorAll('thead th')].map((th) => th.innerText.trim()), rows: [...t.querySelectorAll('tbody tr.gridRow')].map((tr) => tr.innerText.replace(/\s+/g, ' ').trim())}))).catch(() => []);
        await snap(page, name, {grid});
        return grid;
    }
    async function openIssueGalleyForm(name, rowText) {
        const w = topWin(page);
        if (rowText) {
            const row = w.locator('tr.gridRow').filter({hasText: rowText}).first();
            await row.locator('a.show_extras').click(); await sleep(300);
            await w.getByRole('link', {name: 'Edit', exact: true}).filter({visible: true}).first().click();
        } else {
            await w.getByRole('link', {name: /Create Issue Galley|Add Issue Galley/i}).first().click();
        }
        await idle(page);
        await page.locator('form#issueGalleyForm').waitFor({timeout: 20000}).catch(() => {});
        await idle(page); await sleep(400);
        const f = page.locator('form#issueGalleyForm');
        const labels = await f.evaluate((el) => [...el.querySelectorAll('label, legend, .label')].filter((e) => e.getClientRects().length).map((e) => e.innerText.trim().replace(/\s+/g, ' ')).filter(Boolean)).catch(() => []);
        const names = await f.locator('input, select').evaluateAll((els) => els.map((e) => `${e.tagName.toLowerCase()}[name=${e.name}]${e.type === 'hidden' ? ' hidden' : ''}`)).catch(() => []);
        await snap(page, name, {labels, names});
        return {labels, names, publisherIdBox: (await f.locator('input[name="publicGalleyId"]').count()) > 0, value: (await f.locator('input[name="publicGalleyId"]').count()) ? await f.locator('input[name="publicGalleyId"]').inputValue() : null};
    }

    // ---- {OMP} the chapter, publication format and format file windows (legacy grids on the Publication pages)
    const pressGo = async (ctx, sub, key) => openWf(ctx, sub.id, `publication_${sub.pub}_${key}`);
    async function waitTabs() {
        await page.waitForFunction(() => { const d = [...document.querySelectorAll('[role=dialog]')].filter((e) => e.getClientRects().length).pop(); return d && d.querySelector('[role=tab]'); }, null, {timeout: 6000}).catch(() => {});
        await idle(page); await sleep(400);
        return (await topWin(page).locator('[role=tab]').allInnerTexts().catch(() => [])).map((x) => x.trim());
    }
    // a legacy grid row's action: the chapter's title link opens its window; a format's and a file's "Edit" sit in the
    // row's control row (`#<rowId>-control-row`) behind the row's "Settings" (a.show_extras)
    async function rowAction(kind, rowText, fileIndex = 0) {
        const panel = page.locator(vis).first();
        if (kind === 'chapter') {
            const a = panel.locator('a.pkp_linkaction_editChapter').filter({hasText: rowText}).first();
            await a.waitFor({timeout: 20000});
            await a.click(); await idle(page);
            return {links: ['(title link)']};
        }
        const row = kind === 'file'
            ? panel.locator('tr.gridRow').filter({has: page.locator('a.pkp_linkaction_downloadFile')}).nth(fileIndex)
            : panel.locator('tr.gridRow').filter({has: page.locator('.onix_code')}).filter({hasText: rowText}).first();
        await row.waitFor({timeout: 20000});
        const id = await row.getAttribute('id');
        await row.locator('a.show_extras').first().click(); await sleep(500);
        const ctl = page.locator(`[id="${id}-control-row"]`);
        const links = await ctl.locator('a').evaluateAll((els) => els.filter((e) => e.getClientRects().length).map((e) => e.innerText.trim()).filter(Boolean)).catch(() => []);
        const a = ctl.getByRole('link', {name: 'Edit', exact: true}).first();
        if (!(await a.count())) return {links, missing: 'Edit'};
        await a.click(); await idle(page);
        return {links};
    }
    async function openPressEdit(ctx, sub, kind, label, name, fileIndex = 0) {
        await pressGo(ctx, sub, kind === 'chapter' ? 'chapters' : 'publicationFormats');
        const r = await rowAction(kind, label, fileIndex);
        if (r.missing) { await snap(page, name, {rowLinks: r.links}); return {rowLinks: r.links, tabs: []}; }
        await page.waitForFunction(() => { const d = [...document.querySelectorAll('[role=dialog]')].filter((e) => e.getClientRects().length); return d.length >= 2 && d.pop().querySelector('form, [role=tab]'); }, null, {timeout: 20000}).catch(() => {});
        const tabs = await waitTabs();
        const title = await topWin(page).locator('h1').first().innerText().catch(() => null);
        await snap(page, name, {rowLinks: r.links, tabs, title});
        return {rowLinks: r.links, tabs, title};
    }
    const PRESS = {chapter: ['K1 Chapter One', 'K1 Chapter Two'], format: ['PDF', 'EPUB'], file: ['article.pdf', 'notes.md']};
    async function pressSetup(ctx, sub) {
        const out = {};
        await pressGo(ctx, sub, 'chapters');
        for (const t of PRESS.chapter) {
            await page.locator(vis).first().getByRole('link', {name: 'Add Chapter'}).first().click();
            await topWin(page).locator('input[name^="title"]').first().waitFor({timeout: 20000});
            await idle(page);
            await topWin(page).locator('input[name^="title"]').first().fill(t);
            await topWin(page).getByRole('button', {name: 'Save', exact: true}).click();
            await idle(page); await sleep(1200); await idle(page);
        }
        await snap(page, 'press-setup-chapters');
        await pressGo(ctx, sub, 'publicationFormats');
        for (const [i, f] of PRESS.format.entries()) {
            await page.locator(vis).first().getByRole('link', {name: 'Add publication format'}).first().click();
            await topWin(page).locator('input[name^="name"]').first().waitFor({timeout: 20000});
            await idle(page);
            const tabsAtAdd = (await topWin(page).locator('[role=tab]').allInnerTexts().catch(() => [])).map((x) => x.trim());
            out[`formatAddTabs${i}`] = tabsAtAdd;
            await topWin(page).locator('input[name^="name"]').first().fill(f);
            await topWin(page).getByRole('button', {name: 'OK', exact: true}).click();
            await idle(page); await sleep(1500); await idle(page);
            // the format's "Change File": the upload wizard (a production-ready file for this format)
            const cat = page.locator(vis).first().locator('tr').filter({hasText: f}).filter({has: page.locator('.onix_code')}).first();
            await cat.getByRole('link', {name: 'Change File', exact: true}).first().click();
            const wiz = page.getByRole('dialog').filter({has: page.locator('div[id^="fileUploadWizard"]')});
            await wiz.locator('input[type="file"]').waitFor({state: 'attached', timeout: 30000});
            await idle(page);
            const genre = wiz.locator('select[id^="genreId"]');
            if (await genre.count()) {
                const opts = await genre.locator('option').evaluateAll((els) => els.map((o) => ({v: o.value, t: o.text.trim()})).filter((o) => o.v));
                out[`genres${i}`] = opts.map((o) => o.t);
                await genre.selectOption(opts[0].v);
            }
            await wiz.locator('input[type="file"]').setInputFiles(FIXTURE);
            await wiz.getByRole('button', {name: 'Continue', exact: true}).waitFor({timeout: 30000});
            await page.waitForFunction(() => { const b = [...document.querySelectorAll('[role=dialog] button')].find((x) => x.innerText.trim() === 'Continue' && x.getClientRects().length); return b && !b.disabled; }, null, {timeout: 30000}).catch(() => {});
            await wiz.getByRole('button', {name: 'Continue', exact: true}).click(); await idle(page); await sleep(800);
            await wiz.getByRole('button', {name: 'Continue', exact: true}).click(); await idle(page); await sleep(800);
            await wiz.getByRole('button', {name: 'Complete', exact: true}).click(); await idle(page); await sleep(1500); await idle(page);
        }
        const grid = await page.locator(vis).first().locator('tr').evaluateAll((els) => els.filter((e) => e.getClientRects().length).map((e) => e.innerText.replace(/\s+/g, ' ').trim()).filter(Boolean)).catch(() => []);
        await snap(page, 'press-setup-formats', {grid});
        out.grid = grid;
        return out;
    }
    const pressOpen = (ctx, sub, kind, i, name) => openPressEdit(ctx, sub, kind, PRESS[kind][i] || '', name, i);
    async function pressRead(label) {
        const r = {};
        for (const kind of ['chapter', 'format', 'file']) {
            const w = await pressOpen(S.C, S.A, kind, 0, `${label}-${kind}`);
            const txt = await topWin(page).innerText().catch(() => '');
            r[kind] = {title: w.title, tabs: w.tabs, mentionsPublisherId: /Publisher ID/.test(txt), mentionsIdentifiers: /Identifiers/.test(txt)};
            if (w.tabs.includes('Identifiers')) r[kind].value = (await openIdTab(`${label}-${kind}-tab`)).value;
            await closeTopWin();
        }
        return r;
    }

    // ---- Settings › Workflow › Submission › "Metadata"
    async function openSettingsMeta(ctx, name) {
        await page.goto(cUrl(ctx, '/management/settings/workflow')); await idle(page);
        await page.locator('#metadata-button').click(); await idle(page);
        const form = page.locator('form').filter({has: page.getByRole('checkbox', {name: 'Enable keyword metadata'})});
        const group = form.getByRole('group', {name: 'Publisher ID'});
        await group.waitFor({timeout: 30000});
        const boxes = await group.getByRole('checkbox').evaluateAll((els) => els.map((b) => ({label: (b.closest('label')?.innerText || '').trim(), value: b.value, checked: b.checked})));
        const groupText = await group.innerText();
        const s = await snap(page, name, {boxes, groupText});
        return {form, group, boxes, groupText};
    }
    async function setPid(ctx, values, name) {
        const {form, group} = await openSettingsMeta(ctx, `${name}-before`);
        const boxes = group.getByRole('checkbox');
        for (let i = 0; i < await boxes.count(); i++) {
            const b = boxes.nth(i);
            const want = values.includes(await b.getAttribute('value'));
            if ((await b.isChecked()) !== want) await b.click();
        }
        const t0 = Date.now();
        const saved = page.waitForResponse((r) => /\/api\/v1\/contexts\/\d+$/.test(r.url()) && r.request().method() !== 'GET', {timeout: 30000}).catch(() => null);
        await form.getByRole('button', {name: 'Save', exact: true}).click();
        const r = await saved;
        const st = await page.locator('[role="status"]').filter({hasText: 'Saved'}).first().waitFor({timeout: 10000}).then(() => 'Saved').catch(() => null);
        await idle(page);
        const back = await openSettingsMeta(ctx, `${name}-after`);
        return {status: r && r.status(), inline: st, boxesAfter: back.boxes};
    }

    try {
        // ============================================================ defaults (Rule 1)
        if (on('defaults') && !S.ticked) {
            await as(S.u.mg);
            const out = {};
            out.settings = (await openSettingsMeta(S.C, 'def-settings-metadata')).boxes;
            const m = await openMeta(S.C, S.A, 'def-metadata-A');
            out.metadataPublisherId = m.present; out.metaLabels = m.labels;
            out.sideMenu = await sideMenu();
            if (!isOMP) {
                const g = await openGalleyEdit(S.C, S.A, 'PDF', 'def-galley-edit');
                out.galleyRowMenu = g.items; out.galleyTabs = g.tabs;
                await closeTopWin();
            }
            if (isOMP) {
                if (!S.press) { out.pressSetup = await pressSetup(S.C, S.A); S.press = true; save(); }
                out.press = await pressRead('def');
            }
            if (isOJS) {
                const iw = await openIssueEdit(1, 'def-issue-edit');
                out.issueTabs = iw.tabs; out.issueRowLinks = iw.rowLinks;
                out.issueGalleyGrid = await openIssueGalleysTab('def-issue-galleys');
                const gf = await openIssueGalleyForm('def-issue-galley-form');
                out.issueGalleyForm = gf;
            }
            fact('defaults', out);
        }
        const ALL = isOJS ? ['publication', 'galley', 'issue', 'issueGalley'] : isOMP ? ['publication', 'chapter', 'representation', 'file'] : ['publication', 'galley'];
        // ============================================================ tick (Settings bullet 1, on screen)
        if (on('tick') && !S.ticked) {
            await as(S.u.mg);
            fact('tick', await setPid(S.C, ALL, 'tick'));
            S.ticked = true; save();
        }
        // ============================================================ meta (Rule 3, A3, A2's last sentence)
        if (on('meta')) {
            await as(S.u.mg);
            const out = {};
            const step = async (sub, k, value) => {
                const m = await openMeta(S.C, sub, `meta-${k}-open`);
                if (!m.present) { out[k] = {present: false}; return; }
                await m.box.fill(value);
                const r = await saveMeta(`meta-${k}-save`);
                const back = await openMeta(S.C, sub, `meta-${k}-reopen`);
                out[k] = {before: m.value, typed: value, save: r, reopened: back.value};
                log(`[meta ${k}]`, JSON.stringify(out[k]).slice(0, 600));
            };
            await step(S.A, 'a-pid', 'pid-a1');
            await step(S.B, 'b-dup', 'pid-a1');
            await step(S.B, 'b-digits', '12345');
            await step(S.B, 'b-slash', 'a/b');
            await step(S.B, 'b-empty', '');
            await step(S.B, 'b-final', 'pid-b1');
            fact('meta', out);
        }
        // ============================================================ galley (Rules 4, 5; A1, A2) {OJS OPS}
        if (on('galley') && !isOMP) {
            await as(S.u.mg);
            const out = {};
            const step = async (sub, k, value) => {
                const g = await openGalleyEdit(S.C, sub, 'PDF', `galley-${k}-edit`);
                const t = await openIdTab(`galley-${k}-tab`);
                if (t.absent) { out[k] = {tabs: g.tabs, idTab: 'absent'}; return; }
                const r = await saveIdTab(value, `galley-${k}`);
                if (r.windowsAfter >= r.windowsBefore) await closeTopWin();
                const g2 = await openGalleyEdit(S.C, sub, 'PDF', `galley-${k}-reedit`);
                const t2 = await openIdTab(`galley-${k}-reopen`);
                await closeTopWin();
                out[k] = {tabs: g.tabs, before: t.value, typed: value, labels: t.labels, save: r, reopened: t2.value};
                log(`[galley ${k}]`, JSON.stringify(out[k]).slice(0, 900));
            };
            await step(S.A, 'a-pid', 'pid-g1');
            await step(S.B, 'b-pid', 'pid-g2');
            await step(S.A, 'a-digits', '12345');
            await step(S.A, 'a-slash', 'a/b');
            await step(S.A, 'a-dup', 'pid-g2');
            await step(S.A, 'a-empty', '');
            // leave the tab with a change unsaved: the other tab, then the window's Close
            await openGalleyEdit(S.C, S.A, 'PDF', 'galley-leave-edit');
            await openIdTab('galley-leave-tab');
            const box = topWin(page).locator('#publicIdentifiersForm input[name="publisherId"]');
            await box.fill('pid-unsaved'); await box.blur().catch(() => {});
            const n0 = jsDialogs.length;
            await topWin(page).getByRole('tab', {name: 'Edit Metadata', exact: true}).click().catch(() => {}); await idle(page); await sleep(600);
            const afterTab = {jsDialogs: jsDialogs.slice(n0), dialogs: (await dialogTexts(page)).map((d) => ({name: d.name, text: flat(d.text, 300)}))};
            await snap(page, 'galley-leave-other-tab', afterTab);
            await topWin(page).getByRole('tab', {name: 'Identifiers', exact: true}).click().catch(() => {}); await idle(page); await sleep(600);
            const backVal = await topWin(page).locator('#publicIdentifiersForm input[name="publisherId"]').inputValue().catch(() => null);
            await topWin(page).locator('#publicIdentifiersForm input[name="publisherId"]').fill('pid-unsaved2').catch(() => {});
            const n1 = jsDialogs.length;
            await closeTopWin();
            const afterClose = {jsDialogs: jsDialogs.slice(n1), dialogs: (await dialogTexts(page)).map((d) => ({name: d.name, text: flat(d.text, 300)}))};
            await snap(page, 'galley-leave-closed', afterClose);
            // a confirm the app draws itself (not a browser dialog)
            const conf = page.locator(vis).filter({hasText: /unsaved|discard|leave/i}).last();
            if (await conf.count()) { afterClose.appConfirm = flat(await conf.innerText(), 300); await conf.getByRole('button', {name: /OK|Yes|Leave|Discard|Close/}).first().click().catch(() => {}); await idle(page); }
            await openGalleyEdit(S.C, S.A, 'PDF', 'galley-leave-reedit');
            const t3 = await openIdTab('galley-leave-reopen');
            await closeTopWin();
            out.leave = {afterTab, valueAfterTabSwitch: backVal, afterClose, reopened: t3.value};
            fact('galley', out);
        }
        // ============================================================ issue (Rules 4, 5 on the issue tab) {OJS}
        if (on('issue') && isOJS) {
            await as(S.u.mg);
            const out = {};
            const step = async (n, k, value) => {
                const w = await openIssueEdit(n, `issue-${k}-edit`);
                const t = await openIdTab(`issue-${k}-tab`);
                if (t.absent) { out[k] = {tabs: w.tabs, idTab: 'absent'}; await closeTopWin(); return; }
                const r = await saveIdTab(value, `issue-${k}`);
                if (r.windowsAfter >= r.windowsBefore) await closeTopWin();
                await openIssueEdit(n, `issue-${k}-reedit`);
                const t2 = await openIdTab(`issue-${k}-reopen`);
                await closeTopWin();
                out[k] = {tabs: w.tabs, before: t.value, typed: value, labels: t.labels, text: t.text, save: r, reopened: t2.value};
                log(`[issue ${k}]`, JSON.stringify(out[k]).slice(0, 900));
            };
            await step(1, 'i1-pid', 'pid-i1');
            await step(2, 'i2-pid', 'pid-i2');
            await step(1, 'i1-digits', '12345');
            await step(1, 'i1-slash', 'a/b');
            await step(1, 'i1-dup', 'pid-i2');
            await step(1, 'i1-empty', '');
            fact('issue', out);
        }
        // ============================================================ igalley (q11, OJS1) {OJS}
        if ((on('igalley') || PHASES.includes('igdup')) && isOJS) {
            await as(S.u.mg);
            const out = {};
            const fill = async ({label, pid, file}) => {
                const f = page.locator('form#issueGalleyForm');
                if (file) {
                    const t0 = Date.now();
                    await f.locator('input[type="file"]').first().setInputFiles(FIXTURE);
                    await page.waitForResponse((r) => /issue-galley-grid\/upload|\/upload/.test(r.url()), {timeout: 20000}).catch(() => {});
                    await idle(page); await sleep(800);
                    out.uploads = (out.uploads || []).concat(postsSince(t0));
                }
                if (label !== undefined) await f.locator('input[name="label"]').fill(label);
                if (pid !== undefined) await f.locator('input[name="publicGalleyId"]').fill(pid);
            };
            const submit = async (name) => {
                const f = page.locator('form#issueGalleyForm');
                const t0 = Date.now();
                const resp = page.waitForResponse((r) => /issue-galley-grid\/update/.test(r.url()), {timeout: 30000}).catch(() => null);
                await f.getByRole('button', {name: 'Save', exact: true}).click();
                const r = await resp;
                await idle(page); await sleep(900); await idle(page);
                const stillOpen = await page.locator('form#issueGalleyForm').isVisible().catch(() => false);
                const errs = stillOpen ? await page.locator('form#issueGalleyForm').locator('.error, label.error, #formErrors, .pkp_form_error, ul.pkp_form_error_list').allInnerTexts().catch(() => []) : [];
                const notices = await page.locator('.app__notifications, .pkp_notification, [role="alert"]').allInnerTexts().catch(() => []);
                await snap(page, name, {stillOpen, errs, notices});
                return {status: r && r.status(), body: r ? flat(await r.text().catch(() => ''), 600) : null, stillOpen, errs: errs.map((x) => flat(x, 300)).filter(Boolean), notices: notices.map((x) => flat(x, 200)).filter(Boolean), posts: postsSince(t0)};
            };
            const cancelForm = async () => { const c = page.locator('form#issueGalleyForm').getByRole('link', {name: 'Cancel', exact: true}); if (await c.count()) { await c.click().catch(() => {}); await idle(page); await sleep(500); } };
            const reopenGrid = async (name) => { await closeTopWin(); await openIssueEdit(1, `${name}-edit`); return openIssueGalleysTab(`${name}-grid`); };

            if (PHASES.includes('igdup')) {
                // one-off: the duplicate check on an existing issue galley (PDF2 holds "a/b" after the first run)
                await openIssueEdit(1, 'igd-edit'); out.gridBefore = await openIssueGalleysTab('igd-grid');
                const f0 = await openIssueGalleyForm('igd-form', 'PDF3');
                await fill({pid: 'a/b'});
                out.dup = {before: f0.value, typed: 'a/b', save: await submit('igd-save')};
                if (out.dup.save.stillOpen) await cancelForm();
                out.gridAfter = await reopenGrid('igd-after');
                await closeTopWin();
                fact('igdup', out);
            }
            if (on('igalley')) {
            // 1. a new issue galley with a Publisher ID
            await openIssueEdit(1, 'ig-new-edit'); await openIssueGalleysTab('ig-new-grid0');
            out.newForm = await openIssueGalleyForm('ig-new-form');
            await fill({label: 'PDF', pid: 'ig-1', file: true});
            out.newWithPid = await submit('ig-new-save');
            if (out.newWithPid.stillOpen) await cancelForm();
            out.gridAfterNew = await reopenGrid('ig-new-after');
            // 1b. a new one with digits only
            await openIssueGalleyForm('ig-newd-form');
            await fill({label: 'PDFD', pid: '12345', file: true});
            out.newWithDigits = await submit('ig-newd-save');
            if (out.newWithDigits.stillOpen) await cancelForm();
            // 2. a new one without, then "ig-1" on it
            out.gridBefore2 = await reopenGrid('ig-plain-before');
            await openIssueGalleyForm('ig-plain-form');
            await fill({label: 'PDF2', file: true});
            out.newPlain = await submit('ig-plain-save');
            if (out.newPlain.stillOpen) await cancelForm();
            out.gridAfterPlain = await reopenGrid('ig-plain-after');
            const edit = async (row, k, pid) => {
                const f0 = await openIssueGalleyForm(`ig-${k}-form`, row);
                await fill({pid});
                const r = await submit(`ig-${k}-save`);
                if (r.stillOpen) await cancelForm();
                const grid = await reopenGrid(`ig-${k}-after`);
                out[k] = {before: f0.value, typed: pid, save: r, grid};
                log(`[igalley ${k}]`, JSON.stringify(out[k]).slice(0, 900));
            };
            await edit('PDF2', 'edit-pid', 'ig-1');
            await edit('PDF2', 'edit-digits', '12345');
            await edit('PDF2', 'edit-slash', 'a/b');
            await edit('PDF2', 'edit-pid2', 'ig-1');
            // a third galley and the first one's value on it
            await openIssueGalleyForm('ig-third-form');
            await fill({label: 'PDF3', file: true});
            out.third = await submit('ig-third-save');
            if (out.third.stillOpen) await cancelForm();
            out.gridAfterThird = await reopenGrid('ig-third-after');
            await edit('PDF3', 'edit-dup', 'ig-1');
            await edit('PDF3', 'edit-empty-then', 'ig-3');
            await edit('PDF3', 'edit-empty', '');
            await closeTopWin();
            fact('igalley', out);
            }
        }
        // ============================================================ press {OMP}: chapter, format, file windows (Rules 2, 4, 5; A1, A2)
        if (on('press') && isOMP) {
            await as(S.u.mg);
            if (!S.press) { fact('pressSetup', await pressSetup(S.C, S.A)); S.press = true; save(); }
            const out = {};
            const step = async (kind, i, k, value) => {
                const w = await pressOpen(S.C, S.A, kind, i, `press-${kind}-${k}-edit`);
                if (!w.tabs.includes('Identifiers')) { out[`${kind}-${k}`] = {tabs: w.tabs, rowLinks: w.rowLinks, idTab: 'absent'}; await closeTopWin(); return; }
                const t = await openIdTab(`press-${kind}-${k}-tab`);
                const r = await saveIdTab(value, `press-${kind}-${k}`);
                if (r.windowsAfter >= r.windowsBefore) await closeTopWin();
                const w2 = await pressOpen(S.C, S.A, kind, i, `press-${kind}-${k}-reedit`);
                const t2 = w2.tabs.includes('Identifiers') ? await openIdTab(`press-${kind}-${k}-reopen`) : {value: 'no tab'};
                await closeTopWin();
                out[`${kind}-${k}`] = {tabs: w.tabs, before: t.value, typed: value, labels: t.labels, save: r, reopened: t2.value};
                log(`[press ${kind} ${k}]`, JSON.stringify({tabs: w.tabs, before: t.value, typed: value, win: [r.windowsBefore, r.windowsAfter], notices: r.notices, box: r.tab && r.tab.publisherIdBox, reopened: t2.value}));
            };
            for (const kind of ['chapter', 'format', 'file']) {
                const p = {chapter: 'pid-c', format: 'pid-f', file: 'pid-file'}[kind];
                await step(kind, 0, 'pid', `${p}1`);
                await step(kind, 1, 'pid2', `${p}2`);
                await step(kind, 0, 'digits', '12345');
                await step(kind, 0, 'slash', 'a/b');
                if (kind === 'file') await step(kind, 0, 'dash', '12-34');
                await step(kind, 0, 'dup', `${p}2`);
                await step(kind, 0, 'empty', '');
            }
            fact('press', out);
        }
        // ============================================================ untick (q3; Rule 2 both ends; Settings bullet 1)
        if (on('untick')) {
            await as(S.u.mg);
            const out = {};
            const read = async (k) => {
                const r = {};
                const m = await openMeta(S.C, S.A, `untick-${k}-meta`);
                r.metaField = m.present; r.metaValue = m.value;
                if (!isOMP) {
                    const g = await openGalleyEdit(S.C, S.A, 'PDF', `untick-${k}-galley`);
                    r.galleyTabs = g.tabs;
                    if (g.tabs.includes('Identifiers')) r.galleyValue = (await openIdTab(`untick-${k}-galley-tab`)).value;
                    await closeTopWin();
                }
                if (isOJS) {
                    const w = await openIssueEdit(1, `untick-${k}-issue`);
                    r.issueTabs = w.tabs;
                    r.issueGalleyGrid = await openIssueGalleysTab(`untick-${k}-issue-galleys`);
                    const f = await openIssueGalleyForm(`untick-${k}-issue-galley-form`, 'PDF2');
                    r.issueGalleyBox = f.publisherIdBox; r.issueGalleyValue = f.value; r.issueGalleyLabels = f.labels;
                    await closeTopWin(); await closeTopWin();
                }
                if (isOMP && S.press) r.press = await pressRead(`untick-${k}`);
                return r;
            };
            out.off = await setPid(S.C, [], 'untick-off');
            out.readOff = await read('off');
            out.on = await setPid(S.C, ALL, 'untick-on');
            out.readOn = await read('on');
            fact('untick', out);
        }
        // ============================================================ version (Rule 19; A5; q6, q7)
        if (on('version')) {
            await as(S.uu.mg, S.U);
            const out = {};
            const V = S.V;
            const idsPage = async (pubId, name) => {
                await openWf(S.U, V.id, `publication_${pubId}_identifiers`);
                const panel = page.locator(vis).first();
                await settled(page, panel.getByRole('button', {name: 'Save', exact: true}), {timeout: 15000});
                const form = panel.locator('form').filter({has: page.getByRole('button', {name: 'Save', exact: true})}).first();
                const inputs = await form.locator('input').evaluateAll((els) => els.filter((e) => e.type !== 'hidden').map((e) => ({name: e.name, id: e.id, value: e.value, disabled: e.disabled}))).catch(() => []);
                const text = flat(await form.innerText().catch(() => ''), 800);
                const s = await snap(page, name, {inputs, formText: text});
                return {form, inputs, text};
            };
            const saveIds = async (form, name) => {
                const t0 = Date.now();
                await form.getByRole('button', {name: 'Save', exact: true}).click();
                await page.locator('[role="status"]').filter({hasText: /Saved/}).first().waitFor({timeout: 10000}).catch(() => {});
                await idle(page); await sleep(500);
                const errors = await form.locator('.pkpFieldError, [class*="FieldError"]').allInnerTexts().catch(() => []);
                const status = await page.locator('[role="status"]').allInnerTexts().catch(() => []);
                const bar = await page.locator(vis).first().locator('.pkpFormErrors, .pkpFormPage__status').allInnerTexts().catch(() => []);
                await snap(page, name, {errors, status, bar});
                return {posts: postsSince(t0).map((p) => ({status: p.status, url: p.url, req: p.req, body: p.status >= 400 ? p.body : undefined})), errors: errors.map((x) => flat(x, 300)), status: status.map((x) => flat(x, 200)).filter(Boolean), bar: bar.map((x) => flat(x, 300)).filter(Boolean)};
            };
            // 1. the source version: Publisher ID, galley publisher ID, URN
            const m = await openMeta(S.U, V, 'ver-src-meta');
            if (m.present) { await m.box.fill('pid-v1'); out.srcMetaSave = await saveMeta('ver-src-meta-save'); }
            if (!isOMP) {
                await openGalleyEdit(S.U, V, 'PDF', 'ver-src-galley');
                const t = await openIdTab('ver-src-galley-tab');
                out.srcGalleyTab = t;
                out.srcGalleySave = await saveIdTab('pid-vg1', 'ver-src-galley-save');
                if (out.srcGalleySave.windowsAfter >= out.srcGalleySave.windowsBefore) await closeTopWin();
            }
            if (!isOPS) {
                const ip = await idsPage(V.pub, 'ver-src-ids');
                out.srcIds = {inputs: ip.inputs, text: ip.text};
                const urnBox = ip.form.locator('input[name="pub-id::other::urn"]');
                await urnBox.fill('urn:nbn:de:0000-e2e1');
                out.srcIdsSave1 = await saveIds(ip.form, 'ver-src-ids-save1');
                const ip2 = await idsPage(V.pub, 'ver-src-ids-reopen');
                out.srcIdsReopen = ip2.inputs;
                out.srcIdsSave2 = await saveIds(ip2.form, 'ver-src-ids-save2');
            }
            // 2. Create New Version
            await openWf(S.U, V.id, `publication_${V.pub}_metadata`);
            await page.locator(vis).first().locator('[data-cy="sidemodal-header"] h1 span.underline').first().waitFor({timeout: 30000}).catch(() => {});
            await page.getByRole('link', {name: 'Create New Version', exact: true}).click();
            const dlg = page.getByRole('dialog').filter({hasText: 'Which version should metadata be copied from?'});
            await dlg.locator('select[name="versionStage"]').waitFor({timeout: 30000}).catch(() => {});
            await snap(page, 'ver-dialog');
            const created = page.waitForResponse((r) => r.url().includes('/version') && r.request().method() === 'POST', {timeout: 30000}).catch(() => null);
            await dlg.getByRole('button', {name: 'Confirm', exact: true}).click();
            const cr = await created;
            let newPub = null;
            try { newPub = (await cr.json()).id; } catch { /* */ }
            out.newVersion = {status: cr && cr.status(), id: newPub};
            await idle(page); await sleep(1000);
            S.V.newPub = newPub; save();
            if (newPub) {
                const NV = {id: V.id, pub: newPub};
                const m2 = await openMeta(S.U, NV, 'ver-new-meta');
                out.newMeta = {present: m2.present, value: m2.value};
                if (!isOPS) {
                    const ip = await idsPage(newPub, 'ver-new-ids');
                    out.newIds = {inputs: ip.inputs, text: ip.text};
                    out.newIdsSave = await saveIds(ip.form, 'ver-new-ids-save');
                }
                if (!isOMP) {
                    const g = await openGalleyEdit(S.U, NV, 'PDF', 'ver-new-galley');
                    const t = await openIdTab('ver-new-galley-tab');
                    out.newGalleyTab = {tabs: g.tabs, value: t.value, text: t.text};
                    out.newGalleySameSave = await saveIdTab(null, 'ver-new-galley-same');
                    if (out.newGalleySameSave.windowsAfter >= out.newGalleySameSave.windowsBefore) await closeTopWin();
                    await openGalleyEdit(S.U, NV, 'PDF', 'ver-new-galley-2');
                    await openIdTab('ver-new-galley-tab-2');
                    out.newGalleyEmpty = await saveIdTab('', 'ver-new-galley-empty');
                    if (out.newGalleyEmpty.windowsAfter >= out.newGalleyEmpty.windowsBefore) await closeTopWin();
                    await openGalleyEdit(S.U, NV, 'PDF', 'ver-new-galley-3');
                    await openIdTab('ver-new-galley-tab-3');
                    out.newGalleyChanged = await saveIdTab('pid-vg2', 'ver-new-galley-changed');
                    if (out.newGalleyChanged.windowsAfter >= out.newGalleyChanged.windowsBefore) await closeTopWin();
                    await openGalleyEdit(S.U, NV, 'PDF', 'ver-new-galley-4');
                    out.newGalleyReopen = (await openIdTab('ver-new-galley-tab-4')).value;
                    await closeTopWin();
                    // the source version's galley after the change
                    await openGalleyEdit(S.U, V, 'PDF', 'ver-src-galley-after');
                    out.srcGalleyAfter = (await openIdTab('ver-src-galley-tab-after')).value;
                    await closeTopWin();
                }
                const m3 = await openMeta(S.U, V, 'ver-src-meta-after');
                out.srcMetaAfter = m3.value;
            }
            fact('version', out);
        }
        // ============================================================ pervers (Rule 3: one value per version)
        if (on('pervers') && S.V && S.V.newPub) {
            await as(S.uu.mg, S.U);
            const out = {};
            const NV = {id: S.V.id, pub: S.V.newPub};
            const m = await openMeta(S.U, NV, 'pervers-new-meta');
            out.newBefore = m.value;
            await m.box.fill('pid-v2');
            out.save = (await saveMeta('pervers-new-save')).status;
            out.newAfter = (await openMeta(S.U, NV, 'pervers-new-reopen')).value;
            out.srcAfter = (await openMeta(S.U, {id: S.V.id, pub: S.V.pub}, 'pervers-src-reopen')).value;
            fact('pervers', out);
        }
        // ============================================================ urnarea (line 101-102; Rule 19's galley URN) {OJS}
        // the Rule 19 journal's manager ticks "Galleys" in the URN settings window; the latest version's galley tab then
        // carries the URN area; one "Save" with a new publisher ID and a typed suffix; then Create New Version again.
        if (on('urnarea') && isOJS && S.V.newPub) {
            await as(S.uu.mg, S.U);
            const out = {};
            await page.goto(cUrl(S.U, '/management/settings/website')); await idle(page);
            await page.locator('#plugins-button').click();
            const row = page.locator('#pluginGridContainer tr.gridRow[id$="-row-urnpubidplugin"]');
            await row.waitFor({timeout: 30000});
            await row.locator('a.show_extras').first().click(); await sleep(400);
            await page.locator('#pluginGridContainer tr[id$="-row-urnpubidplugin"] + tr').getByRole('link', {name: 'Settings', exact: true}).first().click();
            const form = page.locator('#urnSettingsForm');
            await form.waitFor({timeout: 30000}); await idle(page); await sleep(400);
            await form.locator('input[name="enableRepresentationURN"]').check();
            await form.getByRole('button', {name: 'Save', exact: true}).click();
            await idle(page); await sleep(1500); await idle(page);
            out.settingsSaved = !(await form.isVisible().catch(() => false));
            const NV = {id: S.V.id, pub: S.V.newPub};
            await openGalleyEdit(S.U, NV, 'PDF', 'urn-galley-edit');
            const t = await openIdTab('urn-galley-tab');
            out.tab = {text: t.text, value: t.value};
            const f = topWin(page).locator('#publicIdentifiersForm');
            const suffix = f.locator('input[name="urnSuffix"]');
            out.suffixBox = (await suffix.count()) > 0;
            if (out.suffixBox) await suffix.fill('e2eg1');
            const assign = f.locator('input[name="assignURN"]');
            out.assignBox = (await assign.count()) ? await assign.isChecked() : null;
            out.save = await saveIdTab('pid-vg3', 'urn-galley-both');
            if (out.save.windowsAfter >= out.save.windowsBefore) await closeTopWin();
            await openGalleyEdit(S.U, NV, 'PDF', 'urn-galley-reedit');
            const t2 = await openIdTab('urn-galley-reopen');
            out.reopened = {text: t2.text, value: t2.value};
            await closeTopWin();
            // Create New Version from the latest; the newest galley's tab
            await openWf(S.U, S.V.id, `publication_${S.V.newPub}_metadata`);
            await page.locator(vis).first().locator('[data-cy="sidemodal-header"] h1 span.underline').first().waitFor({timeout: 30000}).catch(() => {});
            await page.getByRole('link', {name: 'Create New Version', exact: true}).click();
            const dlg = page.getByRole('dialog').filter({hasText: 'Which version should metadata be copied from?'});
            await dlg.locator('select[name="versionStage"]').waitFor({timeout: 30000}).catch(() => {});
            const created = page.waitForResponse((r) => r.url().includes('/version') && r.request().method() === 'POST', {timeout: 30000}).catch(() => null);
            await dlg.getByRole('button', {name: 'Confirm', exact: true}).click();
            const cr = await created;
            let p3 = null; try { p3 = (await cr.json()).id; } catch { /* */ }
            out.thirdVersion = p3;
            if (p3) {
                await openGalleyEdit(S.U, {id: S.V.id, pub: p3}, 'PDF', 'urn-galley-v3-edit');
                const t3 = await openIdTab('urn-galley-v3-tab');
                out.v3tab = {text: t3.text, value: t3.value};
                await closeTopWin();
                S.V.p3 = p3; save();
            }
            fact('urnarea', out);
        }
        // ============================================================ urnarea2 (Rule 19: a galley's assigned URN on the next version) {OJS}
        if (on('urnarea2') && isOJS && S.V.p3) {
            await as(S.uu.mg, S.U);
            const out = {};
            const p3 = S.V.p3;
            await openGalleyEdit(S.U, {id: S.V.id, pub: p3}, 'PDF', 'urn-galley-v3-edit2');
            const t3 = await openIdTab('urn-galley-v3-tab2');
            out.v3tab = {text: t3.text, value: t3.value};
                // assign the URN on this newest galley (the box ticked) with a publisher ID of its own, then one more version
                const f3 = topWin(page).locator('#publicIdentifiersForm');
                const box3 = f3.locator('input[type=checkbox]').first();
                out.v3AssignBox = (await box3.count()) ? await box3.isChecked() : null;
                if (out.v3AssignBox === false) await box3.check();
                out.v3AssignSameId = await saveIdTab(null, 'urn-galley-v3-assign-same');
                if (out.v3AssignSameId.windowsAfter >= out.v3AssignSameId.windowsBefore) {
                    const b = topWin(page).locator('#publicIdentifiersForm input[type=checkbox]').first();
                    if ((await b.count()) && !(await b.isChecked())) await b.check();
                    out.v3Assign = await saveIdTab('pid-vg4', 'urn-galley-v3-assign');
                    if (out.v3Assign.windowsAfter >= out.v3Assign.windowsBefore) await closeTopWin();
                }
                await openGalleyEdit(S.U, {id: S.V.id, pub: p3}, 'PDF', 'urn-galley-v3-reedit');
                out.v3reopen = (await openIdTab('urn-galley-v3-reopen')).text;
                await closeTopWin();
                S.V.p3 = p3; save();
                await openWf(S.U, S.V.id, `publication_${p3}_metadata`);
                await page.locator(vis).first().locator('[data-cy="sidemodal-header"] h1 span.underline').first().waitFor({timeout: 30000}).catch(() => {});
                await page.getByRole('link', {name: 'Create New Version', exact: true}).click();
                const dlg4 = page.getByRole('dialog').filter({hasText: 'Which version should metadata be copied from?'});
                await dlg4.locator('select[name="versionStage"]').waitFor({timeout: 30000}).catch(() => {});
                const cr4p = page.waitForResponse((r) => r.url().includes('/version') && r.request().method() === 'POST', {timeout: 30000}).catch(() => null);
                await dlg4.getByRole('button', {name: 'Confirm', exact: true}).click();
                const cr4 = await cr4p;
                let p4 = null; try { p4 = (await cr4.json()).id; } catch { /* */ }
                out.fourthVersion = p4;
                if (p4) {
                    await openGalleyEdit(S.U, {id: S.V.id, pub: p4}, 'PDF', 'urn-galley-v4-edit');
                    const t4 = await openIdTab('urn-galley-v4-tab');
                    out.v4tab = {text: t4.text, value: t4.value};
                    await closeTopWin();
                }
                        fact('urnarea2', out);
        }
        // ============================================================ urndup (A1: a URN suffix another galley already uses) {OJS}
        if (on('urndup') && isOJS && S.V.p3) {
            await as(S.uu.mg, S.U);
            const out = {};
            const V1 = {id: S.V.id, pub: S.V.pub};
            await openGalleyEdit(S.U, V1, 'PDF', 'urndup-edit');
            const t = await openIdTab('urndup-tab');
            out.before = {text: t.text, value: t.value};
            const f = topWin(page).locator('#publicIdentifiersForm');
            await f.locator('input[name="urnSuffix"]').fill('e2eg1');
            const b = f.locator('input[type=checkbox]').first();
            out.assignBox = (await b.count()) ? await b.isChecked() : null;
            if (out.assignBox === false) await b.check();
            out.save = await saveIdTab(null, 'urndup-save');
            if (out.save.windowsAfter >= out.save.windowsBefore) await closeTopWin();
            await openGalleyEdit(S.U, V1, 'PDF', 'urndup-reedit');
            out.reopened = (await openIdTab('urndup-reopen')).text;
            await closeTopWin();
            fact('urndup', out);
        }
        // ============================================================ jats (OJS2, q24) {OJS}
        if (on('jats') && isOJS) {
            await as(S.u.mg);
            await openWf(S.C, S.A.id, `publication_${S.A.pub}_jats`);
            await sleep(1500); await idle(page);
            const panel = page.locator(vis).first();
            const text = await panel.innerText().catch(() => '');
            const s = await snap(page, 'jats-A');
            const buttons = await panel.locator('button:visible, a:visible').allInnerTexts().catch(() => []);
            const xmlish = await page.evaluate(() => [...document.querySelectorAll('pre, code, textarea, .cm-content, [class*="xml"]')].map((e) => (e.value || e.innerText || '').slice(0, 20000)).filter((x) => x.includes('<')).slice(0, 3)).catch(() => []);
            const pids = [];
            for (const x of xmlish) for (const mm of x.matchAll(/<article-id[^>]*>[^<]*<\/article-id>/g)) pids.push(mm[0]);
            fact('jats', {pids, buttons: buttons.map((b) => flat(b, 60)).filter(Boolean).slice(0, 40), textHead: flat(text.slice(text.indexOf('JATS')), 800), xmlFound: xmlish.length});
        }
        // ============================================================ urnareaomp (line 101 on a press) {OMP}
        // the K1 press's manager enables the URN plugin on the Plugins grid and saves its settings with every kind ticked
        // (default patterns); the chapter, format and file tabs then read again. Runs last: it changes the press.
        if (on('urnareaomp') && isOMP && S.press) {
            await as(S.u.mg);
            const out = {};
            await page.goto(cUrl(S.C, '/management/settings/website')); await idle(page);
            await page.locator('#plugins-button').click();
            const row = page.locator('#pluginGridContainer tr.gridRow[id$="-row-urnpubidplugin"]');
            await row.waitFor({timeout: 30000});
            const box = row.getByRole('checkbox').first();
            if (!(await box.isChecked())) {
                const w = page.waitForResponse((r) => /settings-plugin-grid\/(enable|disable)/.test(r.url()), {timeout: 30000}).catch(() => null);
                await box.click({noWaitAfter: true}).catch(() => box.dispatchEvent('click'));
                out.enable = (await w)?.status() ?? null;
                await idle(page); await sleep(800);
            }
            await row.locator('a.show_extras').first().click(); await sleep(400);
            await page.locator('#pluginGridContainer tr[id$="-row-urnpubidplugin"] + tr').getByRole('link', {name: 'Settings', exact: true}).first().click();
            const form = page.locator('#urnSettingsForm');
            await form.locator('input[name="urnPrefix"]').waitFor({timeout: 30000}); await idle(page); await sleep(400);
            for (const n of ['enablePublicationURN', 'enableChapterURN', 'enableRepresentationURN', 'enableSubmissionFileURN']) {
                const b = form.locator(`input[type=checkbox][name="${n}"]`);
                if ((await b.count()) && !(await b.isChecked())) await b.click();
            }
            await form.locator('input[name="urnPrefix"]').fill('urn:nbn:de:0000-');
            await form.locator('input[name="urnResolver"]').fill('https://nbn-resolving.de/');
            await form.locator('select[name="urnNamespace"]').selectOption('urn:nbn:de');
            await form.getByRole('button', {name: 'Save', exact: true}).click();
            await idle(page); await sleep(1500); await idle(page);
            out.settingsClosed = !(await form.isVisible().catch(() => false));
            if (!out.settingsClosed) out.settingsText = flat(await form.innerText().catch(() => ''), 600);
            await snap(page, 'urnomp-settings-after');
            out.read = await pressRead('urnomp');
            for (const kind of ['chapter', 'format', 'file']) {
                const w = await pressOpen(S.C, S.A, kind, 0, `urnomp-${kind}-text`);
                if (w.tabs.includes('Identifiers')) out.read[kind].text = (await openIdTab(`urnomp-${kind}-text-tab`)).text;
                await closeTopWin();
            }
            fact('urnareaomp', out);
        }
    } catch (e) {
        log(`[${app.name}] THREW`, e.stack);
        await snap(page, 'k1-error').catch(() => {});
    } finally {
        record('posts', {posts: posts.map(({at, ...p}) => p)}, {merge: false});
        record('jsdialogs', {jsDialogs});
        await close();
    }
});
