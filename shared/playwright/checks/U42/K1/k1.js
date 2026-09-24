// U42 claim check, chunk K1: the workflow's Publication › "References" page with metadata lookup off,
// per role, on all three apps (the "Add" box, References Rules 1–9, register A1–A3).
//
//   PROBE_FEATURE=U42 PROBE_AGENT=ccK1 node bin/probe.js all shared/playwright/checks/U42/K1/k1.js
//
// PHASES (default: all) picks a subset: seed, mgr, roles, versions, settings, admin. Phases after
// `seed` read k1-state-<app>.json, so `PHASES=roles ONLY=ojs` re-drives one phase on the last seed.
// A full run takes over 10 minutes per app: launch it detached (nohup … &) and poll the log.
//
// Seeds (scratch contexts only; publicknowledge and the roster are never touched):
//   main  lookup off (citationsMetadataLookup: false), references at the install default;
//         users mg (manager), se (sectionEditor, assigned), as (copyeditor, assigned; OJS/OMP), au (author).
//         s1 empty list (the manager's mutations), s2 three references (the role reads),
//         s3 published with two references (published read-only), s4 a draft (the wizard box); the versions
//         phase seeds its own published item s5 (Rule 1).
//   on    lookup on: one submission with references (the title/line with lookup on; Rule 9's greyed links).
//   off / en / req  metadata.citations off / enable / require: a submitted item, a draft, and (off) a
//         published item with references (Rule 2).
//   adm   (seeded by the admin phase itself) data citations and funders at request, the administrator also a
//         Reader: one submission with two references (A1).
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, signOut, screen, shot, record, loc, note, idle, tag, outDir} = require('../../../probe');

const T = 30_000;
const ALL = ['seed', 'mgr', 'versions', 'roles', 'settings', 'admin'];
const PHASES = (process.env.PHASES || ALL.join(',')).split(',');
const log = (...a) => console.log('[k1]', ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const wf = (page) => page.locator('[role="dialog"]:visible').first();
const flat = (s, n = 4000) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));

function statePath(app) { return path.join(outDir(), `k1-state-${app.name}.json`); }
function loadState(app) { return JSON.parse(fs.readFileSync(statePath(app), 'utf8')); }
function saveState(app, S) { fs.writeFileSync(statePath(app), JSON.stringify(S, null, 2)); }
function factsPath(app) { return path.join(outDir(), `k1-facts-${app.name}.json`); }
function loadFacts(app) { try { return JSON.parse(fs.readFileSync(factsPath(app), 'utf8')); } catch (e) { return {}; } }

// ---------------------------------------------------------------------------
// Seeding

async function seed(app) {
    const t = tag('u42k1');
    const S = {t, app: app.name};
    const users = [
        {username: `${t}mg`, roles: ['manager']},
        {username: `${t}se`, roles: ['sectionEditor']},
        {username: `${t}au`, roles: ['author']},
    ];
    // The assistant level: the Funding coordinator, the default assistant group with submission-stage access.
    if (app.name !== 'ops') users.push({username: `${t}as`, roles: ['funding']});
    const participants = [{username: `${t}se`, role: 'sectionEditor'}];
    if (app.name !== 'ops') participants.push({username: `${t}as`, role: 'funding'});

    S.main = await app.api.createContext({tag: t, users, citationsMetadataLookup: false});
    const ctx = S.main.path;
    S.s1 = await app.api.createSubmission({tag: `${t}a`, context: ctx, submitter: `${t}au`, participants});
    S.s2 = await app.api.createSubmission({tag: `${t}b`, context: ctx, submitter: `${t}au`, participants,
        citationsRaw: ['Alpha study 2020', 'Beta trial 2021', 'Omega essay']});
    S.s3 = await app.api.createSubmission({tag: `${t}c`, context: ctx, submitter: `${t}au`, participants, published: true,
        citationsRaw: ['Version one ref A', 'Version one ref B']});
    S.s4 = await app.api.createSubmission({tag: `${t}d`, context: ctx, submitter: `${t}au`, submitted: false});

    const small = (x) => [{username: `${x}mg`, roles: ['manager']}, {username: `${x}au`, roles: ['author']}];
    const on = `${t}n`;
    S.on = await app.api.createContext({tag: on, users: small(on), citationsMetadataLookup: true});
    S.onS = await app.api.createSubmission({tag: `${on}a`, context: S.on.path, submitter: `${on}au`,
        citationsRaw: ['Alpha study 2020', 'Beta trial 2021']});

    for (const [key, level] of [['off', 'off'], ['en', 'enable'], ['req', 'require']]) {
        const x = `${t}${key}`;
        S[key] = await app.api.createContext({tag: x, users: small(x), metadata: {citations: level}});
        S[`${key}S`] = await app.api.createSubmission({tag: `${x}a`, context: S[key].path, submitter: `${x}au`,
            citationsRaw: ['Stored ref one', 'Stored ref two']});
        S[`${key}D`] = await app.api.createSubmission({tag: `${x}d`, context: S[key].path, submitter: `${x}au`, submitted: false});
        if (key === 'off') {
            S.offP = await app.api.createSubmission({tag: `${x}p`, context: S[key].path, submitter: `${x}au`, published: true,
                citationsRaw: ['Stored ref one', 'Stored ref two']});
        }
    }

    saveState(app, S);
    log(app.name, 'seeded', ctx, JSON.stringify({s1: S.s1.submissionId, s2: S.s2.submissionId, s3: S.s3.submissionId, s4: S.s4.submissionId}));
    return S;
}

// ---------------------------------------------------------------------------
// Screen helpers

function makeHelpers(app, page, facts) {
    const traffic = [];
    page.on('response', async (r) => {
        const u = r.url();
        if (!/\/api\/v1\//.test(u) || /_test\//.test(u)) return;
        const m = r.request().method();
        const entry = {m, override: r.request().headers()['x-http-method-override'] || null, url: u.replace(/^https?:\/\/[^/]+/, ''), status: r.status()};
        if (m !== 'GET' && /citations|funders|dataCitations/i.test(u)) {
            entry.body = await r.text().then((b) => b.slice(0, 600)).catch(() => null);
        }
        traffic.push(entry);
    });
    const browserDialogs = [];
    page.on('dialog', async (d) => { browserDialogs.push({type: d.type(), message: d.message()}); await d.dismiss().catch(() => {}); });

    const h = {
        traffic, browserDialogs,
        mark() { return traffic.length; },
        since(i) { return traffic.slice(i); },
        async snap(name) {
            const s = await screen(page);
            record(name, s);
            await shot(page, name).catch(() => {});
            return s;
        },
        begin(key) { const o = {}; facts[key] = o; return o; },
        fact(key, value) {
            facts[key] = value;
            fs.writeFileSync(factsPath(app), JSON.stringify(facts, null, 2));
        },
        async gotoWorkflow(ctx, id, {author = false} = {}) {
            await page.goto(app.url(`/index.php/${ctx}/dashboard/${author ? 'mySubmissions' : 'editorial'}?workflowSubmissionId=${id}`));
            await idle(page);
            await wf(page).getByRole('link', {name: /^(Title & Abstract|Publication|Preprint|Submission|Production|References)$/}).first().waitFor({state: 'visible', timeout: T}).catch(() => {});
            await idle(page);
        },
        async sideEntries() {
            return wf(page).getByRole('treeitem').evaluateAll((els) => els.map((e) => (e.querySelector('a') || e).textContent.replace(/\s+/g, ' ').trim())).catch(() => []);
        },
        async openEntry(name, versionLabel) {
            const dialog = wf(page);
            let scope = dialog;
            if (versionLabel) {
                const item = dialog.getByRole('treeitem', {name: versionLabel, exact: true});
                const inner = item.getByRole('link', {name, exact: true});
                if (!(await inner.first().isVisible().catch(() => false))) {
                    await dialog.getByRole('link', {name: versionLabel, exact: true}).first().click();
                    await idle(page);
                }
                scope = item;
            }
            const entry = scope.getByRole('link', {name, exact: true}).first();
            if (!(await entry.isVisible().catch(() => false))) {
                const group = dialog.getByRole('link', {name: /^(Publication|Preprint)$/}).first();
                if (await group.count()) { await group.click(); await idle(page); }
            }
            if (!(await entry.isVisible().catch(() => false))) return false;
            await entry.click();
            await dialog.getByRole('heading', {name: new RegExp(`^(Publication|Preprint): ${name}$`)}).first().waitFor({state: 'visible', timeout: T}).catch(() => {});
            await idle(page);
            return true;
        },
        async openReferences(versionLabel) {
            const ok = await h.openEntry('References', versionLabel);
            if (ok) {
                await wf(page).locator('table').first().waitFor({state: 'visible', timeout: T}).catch(() => {});
                await idle(page);
            }
            return ok;
        },
        box() { return wf(page).getByRole('textbox', {name: /^References/}); },
        addBtn() { return wf(page).getByRole('button', {name: 'Add', exact: true}); },
        delAll() { return wf(page).getByRole('button', {name: 'Delete all references', exact: true}).or(wf(page).getByRole('link', {name: 'Delete all references', exact: true})); },
        reprocessAll() { return wf(page).getByRole('button', {name: 'Reprocess all references', exact: true}).or(wf(page).getByRole('link', {name: 'Reprocess all references', exact: true})); },
        search() { return wf(page).getByRole('searchbox', {name: 'Search references here'}); },
        table() { return wf(page).locator('table').first(); },
        async rows() {
            return h.table().locator('tbody tr').evaluateAll((trs) => trs.map((tr) => {
                const c = tr.querySelector('td, th');
                return (c ? c.innerText : tr.innerText).replace(/\s+/g, ' ').trim();
            })).catch(() => null);
        },
        async settledRows(prev) {
            // The table refreshes after the publication refetch; read until two reads agree.
            let last = await h.rows();
            for (let i = 0; i < 20; i++) {
                await sleep(300);
                const now = await h.rows();
                if (JSON.stringify(now) === JSON.stringify(last) && (prev === undefined || JSON.stringify(now) !== JSON.stringify(prev) || i > 8)) return now;
                last = now;
            }
            return last;
        },
        async disabledState(locator) {
            const l = locator.first();
            if (!(await l.count())) return {present: false};
            return {
                present: true,
                visible: await l.isVisible().catch(() => false),
                disabled: await l.isDisabled().catch(() => null),
                ariaDisabled: await l.getAttribute('aria-disabled').catch(() => null),
                tag: await l.evaluate((e) => e.tagName.toLowerCase()).catch(() => null),
            };
        },
        async controls() {
            const d = wf(page);
            const box = h.box();
            return {
                heading: await d.getByRole('heading', {level: 2}).first().innerText().catch(() => null),
                box: {...(await h.disabledState(box)), editable: await box.first().isEditable().catch(() => null), value: await box.first().inputValue().catch(() => null)},
                add: await h.disabledState(h.addBtn()),
                delAll: await h.disabledState(h.delAll()),
                reprocessAll: await h.disabledState(h.reprocessAll()),
                search: await h.disabledState(h.search()),
                rows: await h.rows(),
                rowMenus: await h.table().getByRole('button', {name: 'More Actions'}).count().catch(() => null),
                rowMenusVisible: await h.table().getByRole('button', {name: 'More Actions'}).evaluateAll((els) => els.filter((e) => e.offsetParent !== null && getComputedStyle(e).display !== 'none').length).catch(() => null),
                toggles: await h.table().locator('tbody button').evaluateAll((els) => els.map((e) => ({
                    name: (e.getAttribute('aria-label') || e.textContent).replace(/\s+/g, ' ').trim(),
                    visible: !!(e.offsetWidth || e.offsetHeight) && getComputedStyle(e).visibility !== 'hidden' && getComputedStyle(e).display !== 'none',
                    w: e.offsetWidth, h: e.offsetHeight,
                }))).catch(() => null),
                headers: await h.table().locator('thead th').evaluateAll((els) => els.map((e) => e.innerText.replace(/\s+/g, ' ').trim())).catch(() => null),
                expandAll: await h.disabledState(d.getByRole('button', {name: /^(Expand All|Collapse All)$/})),
                fieldErrors: await d.locator('.pkpFieldError, [role="alert"]').allInnerTexts().catch(() => []),
                statusLive: await d.locator('[role="status"]').allInnerTexts().catch(() => []),
                bannerLines: ((await d.innerText().catch(() => '')) || '').split('\n').map((l) => l.trim()).filter((l) => /can not be edited|cannot be edited|Warning|has been (published|posted)|duplicate|added|skipp/i.test(l)),
            };
        },
        async rowMenuItems(text) {
            const row = h.table().locator('tbody tr').filter({hasText: text}).first();
            const btn = row.getByRole('button', {name: 'More Actions'});
            if (!(await btn.isVisible().catch(() => false))) return null;
            await btn.click();
            await page.getByRole('menuitem').first().waitFor({state: 'visible', timeout: 5000}).catch(() => {});
            const items = await page.getByRole('menuitem').allInnerTexts();
            return items.map((x) => x.trim());
        },
        async closeMenu(text) {
            const row = h.table().locator('tbody tr').filter({hasText: text}).first();
            await row.getByRole('button', {name: 'More Actions'}).click().catch(() => {});
            await page.getByRole('menuitem').first().waitFor({state: 'detached', timeout: 5000}).catch(() => {});
        },
        async rowAction(text, action) {
            const row = h.table().locator('tbody tr').filter({hasText: text}).first();
            await row.getByRole('button', {name: 'More Actions'}).click();
            const item = page.getByRole('menuitem', {name: action, exact: true});
            await item.waitFor({state: 'visible', timeout: 5000});
            await item.click();
        },
        async addLines(textValue) {
            const box = h.box().first();
            await box.fill(textValue);
            const before = await h.rows();
            const m = h.mark();
            const resp = page.waitForResponse((r) => /importAdditionalCitations/.test(r.url()), {timeout: 8000}).catch(() => null);
            await h.addBtn().first().click();
            const r = await resp;
            await idle(page);
            const after = await h.settledRows(r ? before : undefined);
            return {status: r ? r.status() : 'no request', rows: after, box: await box.inputValue().catch(() => null), traffic: h.since(m)};
        },
        async clearSearchByKeys() {
            const s = h.search().first();
            await s.click();
            await s.press('ControlOrMeta+a');
            await s.press('Backspace');
            await sleep(500);
            await idle(page);
            return h.settledRows();
        },
        async typeSearch(value, {enter = false} = {}) {
            const s = h.search().first();
            const cleared = await h.clearSearchByKeys();
            if (value) await s.pressSequentially(value, {delay: 40});
            await sleep(600);
            await idle(page);
            const typed = await h.settledRows();
            let entered = null;
            if (enter) {
                await s.press('Enter');
                await sleep(400);
                await idle(page);
                entered = await h.settledRows();
            }
            return {value, cleared, typed, entered};
        },
        async clearSearchFully() {
            const r = {};
            r.byKeys = await h.clearSearchByKeys();
            await h.search().first().press('Enter');
            await sleep(400);
            r.byKeysThenEnter = await h.settledRows();
            // The box's own clear control, after a committed phrase.
            await h.typeSearch('beta', {enter: true});
            const clear = wf(page).getByRole('button', {name: 'Clear search phrase'});
            r.clearButton = await clear.count();
            r.clearButtonVisible = await clear.first().isVisible().catch(() => false);
            if (r.clearButtonVisible) {
                await clear.first().click();
                await sleep(400);
                await idle(page);
                r.afterClearButton = await h.settledRows();
                r.boxAfterClearButton = await h.search().first().inputValue().catch(() => null);
            }
            return r;
        },
    };
    return h;
}

// ---------------------------------------------------------------------------
// Phase mgr: the manager on s1 (the "Add" box, Rules 3–8, A2, A3).

async function phaseMgr(app, S, h, page) {
    const ctx = S.main.path;
    const out = h.begin("Mgr".toLowerCase());
    await signIn(page, `${S.t}mg`, {contextPath: ctx});
    await h.gotoWorkflow(ctx, S.s1.submissionId);
    out.entries = await h.sideEntries();
    out.opened = await h.openReferences();
    await h.snap('m01-empty-page');
    out.empty = await h.controls();
    out.emptyTableText = flat(await h.table().innerText().catch(() => null));
    await loc(page, 'References page: the Add box', h.box());
    await loc(page, 'References page: Add button', h.addBtn());
    await loc(page, 'References page: "Delete all references"', h.delAll());
    await loc(page, 'References page: search box', h.search());
    await loc(page, 'References page: the table (CSS, first table in the workflow dialog)', h.table());

    // q3: Add with the box empty.
    let m = h.mark();
    await h.addBtn().first().click();
    await sleep(800);
    await idle(page);
    await h.snap('m02-add-empty');
    out.addEmpty = {controls: await h.controls(), traffic: h.since(m),
        requiredVisible: await wf(page).getByText('This field is required.', {exact: true}).isVisible().catch(() => false)};
    // Type then add again? First: does the message clear on typing?
    await h.box().first().fill('x');
    await sleep(300);
    out.addEmpty.afterTyping = await h.controls();
    await h.box().first().fill('');

    // q7 (empty end): "Delete all references" on the empty list.
    m = h.mark();
    await h.delAll().first().click();
    const dlg0 = page.getByRole('dialog').filter({hasText: 'This will remove all references'}).last();
    const shown0 = await dlg0.waitFor({state: 'visible', timeout: 8000}).then(() => true).catch(() => false);
    const s0 = await h.snap('m03-delete-all-empty-dialog');
    out.delAllEmpty = {shown: shown0, dialog: s0.text.dialog, aria: s0.aria.dialogs.slice(-1)[0]};
    if (shown0) {
        await dlg0.getByRole('button', {name: 'OK', exact: true}).click();
        await dlg0.waitFor({state: 'detached', timeout: T}).catch(() => {});
        await idle(page);
    }
    out.delAllEmpty.traffic = h.since(m);
    out.delAllEmpty.rowsAfter = await h.settledRows();
    await h.snap('m04-delete-all-empty-after');

    // q4: four lines.
    out.add4 = await h.addLines('Alpha  study   2020\n\n  Beta trial 2021  \nGamma report 2022');
    await h.snap('m05-add-four');
    out.add4.controls = await h.controls();

    // q5 (A2): a repeat and a new line.
    out.addDup = await h.addLines('Alpha study 2020\nDelta paper 2023');
    await h.snap('m06-add-duplicate');
    out.addDup.controls = await h.controls();
    // The other ends: a paste whose every line repeats; a repeat inside one paste; case and spacing variants.
    out.addAllDup = await h.addLines('Beta trial 2021');
    await h.snap('m07-add-all-duplicate');
    out.addAllDup.controls = await h.controls();
    out.addVariants = await h.addLines('Epsilon note\nEpsilon note\nALPHA STUDY 2020\n\t\n   \nZeta   final\tpiece');
    await h.snap('m08-add-variants');

    // Rule 4: the row menu; no ordering control.
    out.menuItems = await h.rowMenuItems('Gamma report 2022');
    await h.snap('m09-row-menu');
    await h.closeMenu('Gamma report 2022');
    out.orderControls = await wf(page).getByRole('button', {name: /order|move|up|down|drag/i}).allInnerTexts().catch(() => []);
    out.draggable = await h.table().locator('[draggable="true"], .pkpTable__handle, [class*="drag"]').count().catch(() => null);
    // The row's second-column button (per-row toggle) with lookup off.
    out.toggleBefore = (await h.controls()).toggles;
    const toggle = h.table().locator('tbody tr').first().locator('td').nth(1).locator('button');
    if (await toggle.count()) {
        const m2 = h.mark();
        await toggle.first().click({force: true, timeout: 5000}).catch((e) => { out.toggleClickError = String(e.message).slice(0, 200); });
        await sleep(500);
        out.toggleAfter = {rows: await h.table().locator('tbody tr').evaluateAll((trs) => trs.map((tr) => tr.innerText.replace(/\s+/g, ' ').trim())), toggles: (await h.controls()).toggles, traffic: h.since(m2)};
        await h.snap('m10-row-toggle-clicked');
    }

    // q8 (A3): search.
    const rowsAll = await h.rows();
    out.search = {all: rowsAll, runs: []};
    // Each run: typed (no Enter) is read, then Enter is pressed and read again.
    for (const value of ['beta', 'BETA', 'alpha', 'alpha 2020', 'alpha 2021', '', 'citations', 'http', 'true', 'false', '0', 'publication', 'study,']) {
        out.search.runs.push(await h.typeSearch(value, {enter: true}));
    }
    await h.typeSearch('beta', {enter: true});
    await h.snap('m11-search-beta');
    out.search.fillEmpty = await h.search().first().fill('').then(() => h.settledRows());
    await h.typeSearch('beta', {enter: true});
    out.search.clearing = await h.clearSearchFully();
    await h.snap('m11b-search-cleared');
    // Land afresh so a filter the clearing left behind cannot hide the rows the edit needs.
    await h.gotoWorkflow(ctx, S.s1.submissionId);
    await h.openReferences();

    // q6: Edit.
    out.edit = {};
    await h.rowAction('Alpha study 2020', 'Edit');
    const panel = page.getByRole('dialog', {name: 'Edit citation'});
    await panel.waitFor({state: 'visible', timeout: T}).catch(() => {});
    await idle(page);
    const pbox = panel.getByRole('textbox').first();
    await pbox.waitFor({state: 'visible', timeout: T}).catch(() => {});
    let ps = await h.snap('m12-edit-panel');
    out.edit.panel = {aria: ps.aria.dialogs.slice(-1)[0], text: ps.text.dialog, value: await pbox.inputValue().catch(() => null),
        buttons: await panel.getByRole('button').allInnerTexts().catch(() => []),
        labels: await panel.locator('label, legend').allInnerTexts().catch(() => [])};
    await loc(page, 'Edit citation panel', panel);
    await loc(page, 'Edit citation panel: the text box', pbox);
    // Unsaved change, closed by the panel's own close control.
    await pbox.fill('Alpha study 2020 UNSAVED');
    await panel.getByRole('button', {name: 'Close', exact: true}).first().click().catch(() => {});
    await sleep(800);
    const leftDialog = page.getByRole('dialog').filter({hasText: /unsaved|discard|leave/i});
    out.edit.closeUnsaved = {inAppDialog: await leftDialog.count(), browserDialogs: [...h.browserDialogs], panelOpen: await panel.isVisible().catch(() => false)};
    await h.snap('m13-edit-closed-unsaved');
    if (await leftDialog.count()) {
        out.edit.closeUnsaved.text = await leftDialog.last().innerText().catch(() => null);
        await leftDialog.last().getByRole('button').first().click().catch(() => {});
    }
    if (await panel.isVisible().catch(() => false)) await panel.getByRole('button', {name: 'Close', exact: true}).first().click().catch(() => {});
    await panel.waitFor({state: 'detached', timeout: 10000}).catch(() => {});
    await sleep(600);
    out.edit.rowsAfterUnsavedClose = await h.settledRows();
    // Save a change.
    await h.rowAction('Alpha study 2020', 'Edit');
    await pbox.waitFor({state: 'visible', timeout: T});
    await idle(page);
    await pbox.fill('Alpha study 2020, revised');
    let m3 = h.mark();
    let put = page.waitForResponse((r) => /\/citations\/\d+/.test(r.url()) && r.request().method() !== 'GET', {timeout: 10000}).catch(() => null);
    await panel.getByRole('button', {name: 'Save', exact: true}).click();
    let pr = await put;
    await panel.waitFor({state: 'detached', timeout: 10000}).catch(() => {});
    await sleep(600);
    out.edit.save = {status: pr ? pr.status() : 'no request', panelOpen: await panel.isVisible().catch(() => false), rows: await h.settledRows(), traffic: h.since(m3)};
    await h.snap('m14-edit-saved');
    // Save an empty box.
    await h.rowAction('Alpha study 2020, revised', 'Edit');
    await pbox.waitFor({state: 'visible', timeout: T});
    await idle(page);
    await pbox.fill('');
    m3 = h.mark();
    put = page.waitForResponse((r) => /\/citations\/\d+/.test(r.url()) && r.request().method() !== 'GET', {timeout: 8000}).catch(() => null);
    await panel.getByRole('button', {name: 'Save', exact: true}).click();
    pr = await put;
    await sleep(800);
    await idle(page);
    ps = await h.snap('m15-edit-empty-saved');
    out.edit.saveEmpty = {status: pr ? pr.status() : 'no request', panelOpen: await panel.isVisible().catch(() => false), panelText: ps.text.dialog,
        fieldErrors: await panel.locator('.pkpFieldError, [role="alert"], .pkpFormErrors, .pkpFormPage__status').allInnerTexts().catch(() => []), traffic: h.since(m3)};
    if (await panel.isVisible().catch(() => false)) {
        await panel.getByRole('button', {name: 'Close', exact: true}).first().click().catch(() => {});
        await panel.waitFor({state: 'detached', timeout: 10000}).catch(() => {});
        await sleep(600);
    }
    out.edit.rowsAfterEmpty = await h.settledRows();
    // Edit to another reference's text (the duplicate rule on edit).
    await h.rowAction('Delta paper 2023', 'Edit');
    await pbox.waitFor({state: 'visible', timeout: T});
    await idle(page);
    await pbox.fill('Beta trial 2021');
    m3 = h.mark();
    put = page.waitForResponse((r) => /\/citations\/\d+/.test(r.url()) && r.request().method() !== 'GET', {timeout: 8000}).catch(() => null);
    await panel.getByRole('button', {name: 'Save', exact: true}).click();
    pr = await put;
    await panel.waitFor({state: 'detached', timeout: 8000}).catch(() => {});
    await sleep(600);
    out.edit.toDuplicate = {status: pr ? pr.status() : 'no request', panelOpen: await panel.isVisible().catch(() => false), rows: await h.settledRows(), traffic: h.since(m3)};
    if (await panel.isVisible().catch(() => false)) {
        await panel.getByRole('button', {name: 'Close', exact: true}).first().click().catch(() => {});
        await panel.waitFor({state: 'detached', timeout: 10000}).catch(() => {});
    }
    await h.snap('m16-edit-to-duplicate');
    // After a reload, the list as stored.
    await h.gotoWorkflow(ctx, S.s1.submissionId);
    await h.openReferences();
    out.rowsAfterReload1 = await h.settledRows();

    // q7: Delete one row.
    out.del = {};
    await h.rowAction('Gamma report 2022', 'Delete');
    const dd = page.getByRole('dialog').filter({hasText: 'Are you sure you wish to delete this item?'}).last();
    await dd.waitFor({state: 'visible', timeout: 8000}).catch(() => {});
    const ds = await h.snap('m17-delete-dialog');
    out.del.dialog = {text: ds.text.dialog, aria: ds.aria.dialogs.slice(-1)[0], buttons: await dd.getByRole('button').allInnerTexts().catch(() => [])};
    await dd.getByRole('button', {name: 'Cancel', exact: true}).click();
    await dd.waitFor({state: 'detached', timeout: 8000}).catch(() => {});
    await sleep(500);
    out.del.afterCancel = await h.settledRows();
    await h.rowAction('Gamma report 2022', 'Delete');
    await dd.waitFor({state: 'visible', timeout: 8000}).catch(() => {});
    m3 = h.mark();
    await dd.getByRole('button', {name: 'OK', exact: true}).click();
    await dd.waitFor({state: 'detached', timeout: 8000}).catch(() => {});
    await idle(page);
    out.del.afterOk = await h.settledRows(out.del.afterCancel);
    out.del.traffic = h.since(m3);
    await h.snap('m18-delete-ok');

    // Leaving with the Add box typed and unsaved: another Publication page, then back.
    out.leave = {};
    await h.box().first().fill('Unsaved line one');
    await h.box().first().blur();
    const bd0 = h.browserDialogs.length;
    await h.openEntry('Title & Abstract');
    await sleep(500);
    out.leave.toTitle = {browserDialogs: h.browserDialogs.slice(bd0), inApp: flat(await page.getByRole('dialog').filter({hasText: /unsaved|discard|leave/i}).allInnerTexts().catch(() => []), 400)};
    await h.snap('m19-left-to-title');
    await h.openReferences();
    out.leave.backBoxValue = await h.box().first().inputValue().catch(() => null);
    await h.box().first().fill('Unsaved line two');
    await h.box().first().blur();
    const bd1 = h.browserDialogs.length;
    await wf(page).getByRole('button', {name: 'Close', exact: true}).first().click().catch(() => {});
    await sleep(800);
    out.leave.closeWorkflow = {browserDialogs: h.browserDialogs.slice(bd1), inApp: flat(await page.getByRole('dialog').filter({hasText: /unsaved|discard|leave/i}).allInnerTexts().catch(() => []), 400),
        workflowStillOpen: await page.getByRole('dialog').filter({hasText: 'Publication: References'}).count()};
    await h.snap('m20-closed-workflow');
    await h.gotoWorkflow(ctx, S.s1.submissionId);
    await h.openReferences();
    out.leave.reopenBoxValue = await h.box().first().inputValue().catch(() => null);

    // q7: Delete all references with rows.
    const before = await h.settledRows();
    await h.delAll().first().click();
    const da = page.getByRole('dialog').filter({hasText: 'This will remove all references'}).last();
    await da.waitFor({state: 'visible', timeout: 8000}).catch(() => {});
    const das = await h.snap('m21-delete-all-dialog');
    out.delAll = {before, text: das.text.dialog, aria: das.aria.dialogs.slice(-1)[0], buttons: await da.getByRole('button').allInnerTexts().catch(() => [])};
    await da.getByRole('button', {name: 'Cancel', exact: true}).click();
    await da.waitFor({state: 'detached', timeout: 8000}).catch(() => {});
    out.delAll.afterCancel = await h.settledRows();
    await h.delAll().first().click();
    await da.waitFor({state: 'visible', timeout: 8000}).catch(() => {});
    m3 = h.mark();
    await da.getByRole('button', {name: 'OK', exact: true}).click();
    await da.waitFor({state: 'detached', timeout: 8000}).catch(() => {});
    await idle(page);
    out.delAll.afterOk = await h.settledRows(before);
    out.delAll.traffic = h.since(m3);
    out.delAll.controls = await h.controls();
    await h.snap('m22-delete-all-ok');
    out.delAll.tableText = flat(await h.table().innerText().catch(() => null));
    await h.gotoWorkflow(ctx, S.s1.submissionId);
    await h.openReferences();
    out.delAll.afterReload = await h.settledRows();
    await signOut(page);
    h.fact('mgr', out);
    log(app.name, 'mgr done');
}

// ---------------------------------------------------------------------------
// Phase roles: every permission level on s2 (Rules 3, 4, 9) and the lookup-on read.

async function readAs(h, page, S, who, ctx, id, name, {author = false, contextPath} = {}) {
    const r = {who};
    await signIn(page, who, {contextPath: contextPath || ctx});
    await h.gotoWorkflow(ctx, id, {author});
    r.entries = await h.sideEntries();
    r.opened = await h.openReferences();
    const s = await h.snap(name);
    r.controls = r.opened ? await h.controls() : null;
    r.dialogFirstLines = flat(s.text.dialog, 600);
    if (r.opened) {
        r.menuItems = r.controls.rowMenusVisible ? await h.rowMenuItems('Beta trial 2021') : null;
        if (r.menuItems) await h.closeMenu('Beta trial 2021');
        r.search = await h.typeSearch('beta', {enter: true});
        // The expanders (lookup on only): "Expand All" and a row's own toggle.
        const expandAll = wf(page).getByRole('button', {name: /^(Expand All|Collapse All)$/});
        if (await expandAll.first().isVisible().catch(() => false)) {
            await h.clearSearchByKeys();
            await h.search().first().press('Enter');
            await sleep(300);
            const before = await h.table().locator('tbody').innerText().catch(() => null);
            const label0 = (await expandAll.first().innerText().catch(() => '')).trim();
            await expandAll.first().click();
            await sleep(500);
            r.expandAll = {label0, label1: (await expandAll.first().innerText().catch(() => '')).trim(), before: flat(before, 600),
                after: flat(await h.table().locator('tbody').innerText().catch(() => null), 1200)};
            await h.snap(`${name}-expanded`);
            await expandAll.first().click();
            await sleep(300);
        }
        r.searchCleared = await h.clearSearchFully();
        await h.clearSearchByKeys();
        await h.search().first().press('Enter');
        await sleep(300);
        // Typing in the box and pressing Add where it is greyed out.
        const box = h.box().first();
        r.typeInBox = await box.fill('Readonly typed line', {timeout: 3000}).then(() => 'typed').catch((e) => `refused: ${String(e.message).split('\n')[0].slice(0, 160)}`);
        r.boxValueAfterType = await box.inputValue().catch(() => null);
        const m = h.mark();
        r.addClick = await h.addBtn().first().click({timeout: 3000}).then(() => 'clicked').catch((e) => `refused: ${String(e.message).split('\n')[0].slice(0, 160)}`);
        await sleep(600);
        r.addTraffic = h.since(m);
        r.rowsAfterAdd = await h.settledRows();
        const m2 = h.mark();
        r.delAllClick = await h.delAll().first().click({timeout: 3000}).then(() => 'clicked').catch((e) => `refused: ${String(e.message).split('\n')[0].slice(0, 160)}`);
        await sleep(600);
        const cd = page.getByRole('dialog').filter({hasText: 'This will remove all references'});
        r.delAllDialog = await cd.count();
        if (r.delAllDialog) await cd.last().getByRole('button', {name: 'Cancel', exact: true}).click().catch(() => {});
        r.delAllTraffic = h.since(m2);
        await box.fill('').catch(() => {});
    }
    await signOut(page);
    return r;
}

async function phaseRoles(app, S, h, page) {
    const ctx = S.main.path;
    const id = S.s2.submissionId;
    const out = h.begin("Roles".toLowerCase());
    out.mg = await readAs(h, page, S, `${S.t}mg`, ctx, id, 'r01-mg');
    out.se = await readAs(h, page, S, `${S.t}se`, ctx, id, 'r02-se');
    if (app.name !== 'ops') out.as = await readAs(h, page, S, `${S.t}as`, ctx, id, 'r03-as');
    out.au = await readAs(h, page, S, `${S.t}au`, ctx, id, 'r04-au', {author: true});
    out.admin = await readAs(h, page, S, 'admin', ctx, id, 'r05-admin');
    // Published version, manager.
    out.mgPublished = await readAs(h, page, S, `${S.t}mg`, ctx, S.s3.submissionId, 'r06-mg-published');
    // Lookup on: the manager's and the author's reads.
    out.onMg = await readAs(h, page, S, `${S.on.path}mg`, S.on.path, S.onS.submissionId, 'r07-on-mg');
    out.onAu = await readAs(h, page, S, `${S.on.path}au`, S.on.path, S.onS.submissionId, 'r08-on-au', {author: true});
    h.fact('roles', out);
    log(app.name, 'roles done');
}

// ---------------------------------------------------------------------------
// Phase versions: Rule 1 on s3 (published): a new version, its own list, switching back, the landing page.

async function fillVersionDetailsIfPresent(scope) {
    const stage = scope.locator('select[name="versionStage"]');
    if (await stage.isVisible().catch(() => false)) {
        const current = await stage.inputValue().catch(() => '');
        if (!current) await stage.selectOption('VoR').catch(() => {});
    }
    const minor = scope.locator('select[name="versionIsMinor"]');
    if (await minor.isVisible().catch(() => false)) {
        const current = await minor.inputValue().catch(() => '');
        if (!current) await minor.selectOption('false').catch(() => {});
    }
}

async function publishNow(app, page, ctx) {
    const s = {};
    if (app.name === 'ojs') {
        const {PublicationScreen} = require(path.join(app.suiteDir, 'pages', 'PublicationMetadataPages.js'));
        const pub = new PublicationScreen(page, ctx);
        const panel = await pub.openPublishPanel();
        await pub.fillVersionDetails(panel);
        const dontAssign = panel.getByRole('radio', {name: "Don't Assign To An Issue"});
        if (await dontAssign.waitFor({state: 'visible', timeout: 5_000}).then(() => true).catch(() => false)) {
            await pub.awaitAssignmentPreselected(panel).catch(() => {});
            await dontAssign.check();
        }
        await panel.getByRole('button', {name: 'Confirm', exact: true}).click();
        const confirm = page.getByRole('dialog').filter({hasText: 'Are you sure you want to publish this?'});
        await confirm.waitFor({state: 'visible', timeout: T});
        const published = page.waitForResponse((r) => r.url().includes('/publish') && r.request().method() !== 'GET', {timeout: T}).catch(() => null);
        await confirm.getByRole('button', {name: 'Publish', exact: true}).click();
        const r = await published;
        s.status = r ? r.status() : null;
        await page.getByRole('button', {name: 'Unpublish', exact: true}).waitFor({state: 'visible', timeout: T}).catch(() => {});
    } else if (app.name === 'omp') {
        await page.getByRole('button', {name: 'Publish', exact: true}).first().click();
        const modal = page.getByRole('dialog', {name: /Schedule For Publication/});
        await modal.waitFor({state: 'visible', timeout: T});
        await idle(page);
        await fillVersionDetailsIfPresent(modal);
        const published = page.waitForResponse((r) => r.url().includes('/publish') && r.request().method() !== 'GET', {timeout: T}).catch(() => null);
        await modal.getByRole('button', {name: 'Publish', exact: true}).click();
        const r = await published;
        s.status = r ? r.status() : null;
        await page.getByRole('button', {name: 'Unpublish', exact: true}).waitFor({state: 'visible', timeout: T}).catch(() => {});
    } else {
        const stageAction = page.getByRole('button', {name: 'Post the preprint', exact: true});
        const postControl = page.getByRole('button', {name: 'Post', exact: true});
        await stageAction.or(postControl).first().waitFor({state: 'visible', timeout: T});
        if (await stageAction.isVisible()) await stageAction.click();
        await postControl.waitFor({state: 'visible', timeout: T});
        await postControl.click();
        const confirm = page.getByRole('dialog').filter({hasText: 'Are you sure you want to post this?'});
        await confirm.waitFor({state: 'visible', timeout: T});
        await idle(page);
        await fillVersionDetailsIfPresent(confirm);
        const posted = page.waitForResponse((r) => /\/publications\/\d+\/publish/.test(r.url()) && r.request().method() !== 'GET', {timeout: T}).catch(() => null);
        await confirm.getByRole('button', {name: 'Post', exact: true}).last().click();
        const r = await posted;
        s.status = r ? r.status() : null;
        await page.getByRole('button', {name: 'Unpost', exact: true}).waitFor({state: 'visible', timeout: T}).catch(() => {});
    }
    await idle(page);
    return s;
}

function landingPath(app, ctx, id) {
    if (app.name === 'ojs') return `/index.php/${ctx}/article/view/${id}`;
    if (app.name === 'omp') return `/index.php/${ctx}/catalog/book/${id}`;
    return `/index.php/${ctx}/preprint/view/${id}`;
}

async function readLanding(app, page, h, ctx, id, name) {
    await page.goto(app.url(landingPath(app, ctx, id)));
    await idle(page);
    const s = await h.snap(name);
    const text = (s.text.main || '') + '\n' + ((await page.locator('body').innerText().catch(() => '')) || '');
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
    const i = lines.findIndex((l) => /^references$/i.test(l));
    return {url: page.url(), status: s.title, referencesHeading: i >= 0, after: i >= 0 ? lines.slice(i, i + 6) : null,
        refLines: [...new Set(lines.filter((l) => /ref [ABC]|Stored ref|Version (one|two)/.test(l)))]};
}

async function versionLabels(page) {
    return wf(page).getByRole('treeitem').evaluateAll((els) => els.map((e) => (e.querySelector('a') || e).textContent.replace(/\s+/g, ' ').trim()))
        .then((xs) => xs.filter((n) => /version|\(\d{4}-\d\d-\d\d\)|\d+\.\d+$/i.test(n) && !/Create New Version/.test(n))).catch(() => []);
}

async function phaseVersions(app, S, h, page) {
    const ctx = S.main.path;
    // Its own published item, so a re-run starts from one version (s3 stays for the roles phase).
    S.s5 = await app.api.createSubmission({tag: tag('u42k1v'), context: ctx, submitter: `${S.t}au`, published: true,
        citationsRaw: ['Version one ref A', 'Version one ref B']});
    saveState(app, S);
    const id = S.s5.submissionId;
    const out = h.begin("Versions".toLowerCase());
    out.landing1 = await readLanding(app, page, h, ctx, id, 'v00-landing-v1');
    await signIn(page, `${S.t}mg`, {contextPath: ctx});
    await h.gotoWorkflow(ctx, id);
    out.labels0 = await versionLabels(page);
    await h.openReferences();
    await h.snap('v01-published-refs');
    out.published = await h.controls();
    // Create New Version.
    const dialog = wf(page);
    let link = dialog.getByRole('link', {name: 'Create New Version', exact: true}).first();
    out.createOffered = await link.isVisible().catch(() => false);
    if (out.createOffered) {
        await link.click();
        const win = page.getByRole('dialog').filter({has: page.locator('select[name="versionStage"]')}).last();
        await win.locator('select[name="versionStage"]').waitFor({state: 'visible', timeout: T});
        await idle(page);
        await fillVersionDetailsIfPresent(win);
        const created = page.waitForResponse((r) => /\/publications\/\d+\/version/.test(r.url()) && r.request().method() === 'POST', {timeout: T}).catch(() => null);
        await win.getByRole('button', {name: 'Confirm', exact: true}).click();
        const cr = await created;
        out.createStatus = cr ? cr.status() : null;
        await win.waitFor({state: 'detached', timeout: T}).catch(() => {});
        await idle(page);
        out.labels1 = await versionLabels(page);
        await h.gotoWorkflow(ctx, id);
        out.labels1b = await versionLabels(page);
        await h.openReferences();
        await h.snap('v02-new-version-refs');
        out.v2 = await h.controls();
        out.v2add = await h.addLines('Version two ref C');
        await h.snap('v03-new-version-added');
        // Switch to the first version.
        const labels = await versionLabels(page);
        out.labels2 = labels;
        const v1 = labels.find((l) => /1\.0$/.test(l)) || labels[0];
        out.v1label = v1;
        const other = labels.filter((l) => l !== v1);
        await h.openReferences(v1);
        await h.snap('v04-switch-to-v1');
        out.v1 = {controls: await h.controls(), heading: await wf(page).getByRole('heading', {level: 2}).first().innerText().catch(() => null)};
        if (other[0]) {
            await h.openReferences(other[0]);
            out.v2again = await h.settledRows();
        }
        out.landing2 = await readLanding(app, page, h, ctx, id, 'v05-landing-v2-unpublished');
        // Publish the new version; the landing page then.
        await h.gotoWorkflow(ctx, id);
        if (other[0]) await h.openEntry('Title & Abstract', other[0]);
        try {
            out.publish2 = await publishNow(app, page, ctx);
        } catch (e) {
            out.publish2 = {error: String(e.message).slice(0, 300)};
            await h.snap('v06-publish-error');
        }
        out.landing3 = await readLanding(app, page, h, ctx, id, 'v07-landing-v2-published');
    }
    await signOut(page);
    h.fact('versions', out);
    log(app.name, 'versions done');
}

// ---------------------------------------------------------------------------
// Phase settings: Rule 2 (off / enable / request / require), the install default.

async function wizardDetails(app, page, h, ctx, id, name) {
    await page.goto(app.url(`/index.php/${ctx}/submission?id=${id}`));
    await idle(page);
    await page.locator('.pkpSteps').waitFor({timeout: T}).catch(() => {});
    await page.locator('.submissionWizard__footer').getByRole('button', {name: 'Continue', exact: true}).click().catch(() => {});
    await page.locator('.pkpSteps__step__label--current').filter({hasText: 'Details'}).waitFor({timeout: T}).catch(() => {});
    await idle(page);
    const s = await h.snap(name);
    const box = page.getByRole('textbox', {name: /^References/});
    return {boxCount: await box.count(), boxName: (await box.count()) ? await box.first().evaluate((e) => (e.labels && e.labels[0] ? e.labels[0].innerText : '')).catch(() => null) : null,
        required: (await box.count()) ? await box.first().getAttribute('aria-required').catch(() => null) : null,
        refsText: flat(((s.text.main || '').match(/References[\s\S]{0,300}/) || [null])[0], 300)};
}

async function phaseSettings(app, S, h, page) {
    const out = h.begin("Settings".toLowerCase());
    // Install default on the main context (no metadata key).
    await signIn(page, `${S.t}mg`, {contextPath: S.main.path});
    await page.goto(app.url(`/index.php/${S.main.path}/management/settings/workflow`));
    await idle(page);
    await page.locator('#metadata-button').click().catch(() => {});
    await idle(page);
    const form = page.locator('form').filter({has: page.getByRole('checkbox', {name: 'Enable references metadata'})});
    await form.waitFor({timeout: T}).catch(() => {});
    await h.snap('s01-metadata-settings-main');
    out.referencesGroup = await form.getByRole('group', {name: 'References', exact: true}).ariaSnapshot().catch(() => null);
    out.lookupGroup = await form.getByRole('group', {name: 'References Metadata Lookup', exact: true}).ariaSnapshot().catch(() => null);
    out.defaultSettings = await form.locator('input').evaluateAll((els) => els.filter((e) => /citation/i.test(e.name)).map((e) => ({name: e.name, type: e.type, value: e.value, checked: e.checked, label: (e.labels && e.labels[0] ? e.labels[0].innerText : '').trim()}))).catch(() => null);
    await signOut(page);
    for (const key of ['off', 'en', 'req']) {
        const C = S[key].path;
        const r = {};
        await signIn(page, `${C}mg`, {contextPath: C});
        await h.gotoWorkflow(C, S[`${key}S`].submissionId);
        r.entries = await h.sideEntries();
        r.referencesEntry = r.entries.includes('References');
        await h.snap(`s02-${key}-workflow`);
        if (r.referencesEntry) {
            await h.openReferences();
            r.rows = await h.settledRows();
        }
        await signOut(page);
        await signIn(page, `${C}au`, {contextPath: C});
        r.wizard = await wizardDetails(app, page, h, C, S[`${key}D`].submissionId, `s03-${key}-wizard-details`);
        await signOut(page);
        if (key === 'off') r.landing = await readLanding(app, page, h, C, S.offP.submissionId, 's04-off-landing');
        out[key] = r;
    }
    // Request (the main context's default) wizard read.
    await signIn(page, `${S.t}au`, {contextPath: S.main.path});
    out.request = {wizard: await wizardDetails(app, page, h, S.main.path, S.s4.submissionId, 's05-request-wizard-details')};
    await signOut(page);
    h.fact('settings', out);
    log(app.name, 'settings done');
}

// ---------------------------------------------------------------------------
// Phase admin: A1 — a Site Administrator with no role in the journal.

async function endOwnManagerRole(app, page, h, ctx, snapName = 'a00b-admin-after-remove-role') {
    const rem = {};
    await page.goto(app.url(`/index.php/${ctx}/en/management/settings/access`));
    await idle(page);
    const table = page.locator('table').filter({hasText: /\badmin\b/}).first();
    await table.waitFor({state: 'visible', timeout: T}).catch(() => {});
    const adminRow = table.locator('tr').filter({hasText: /\badmin\b/}).first();
    await adminRow.locator('button').last().click();
    await idle(page);
    await page.getByRole('menuitem', {name: /^Edit$/}).first().click().catch(() => {});
    await page.waitForURL(/management\/settings\/user\/\d+/, {timeout: T}).catch(() => {});
    await idle(page);
    await page.getByRole('button', {name: /Remove Role/i}).first().waitFor({state: 'visible', timeout: 15000}).catch(() => {});
    rem.roleRowsBefore = await page.locator('tr').filter({has: page.getByRole('button', {name: /Remove Role/i})}).evaluateAll((els) => els.map((e) => e.innerText.replace(/\s+/g, ' ').trim())).catch(() => []);
    await h.snap('a00-admin-edit-page');
    const roleRow = page.locator('tr').filter({hasText: /manager/i}).filter({has: page.getByRole('button', {name: /Remove Role/i})}).first();
    if (await roleRow.count()) {
        await roleRow.getByRole('button', {name: /Remove Role/i}).click();
        await idle(page);
        const dlg = page.locator('[role="dialog"]:visible').filter({hasText: /Remove Role/i}).last();
        await dlg.waitFor({state: 'visible', timeout: 15000}).catch(() => {});
        const m = h.mark();
        await dlg.getByRole('button', {name: /^Remove Role$/i}).click().catch(() => {});
        await idle(page); await sleep(1200);
        rem.removeTraffic = h.since(m).filter((x) => x.m !== 'GET').map((x) => [x.override || x.m, x.url, x.status]);
        rem.roleRowsAfter = await page.locator('tr').filter({has: page.getByRole('button', {name: /Remove Role/i})}).evaluateAll((els) => els.map((e) => e.innerText.replace(/\s+/g, ' ').trim())).catch(() => []);
        const rs = await h.snap(snapName);
        rem.dialogAfter = flat(rs.text.dialog, 300);
        // A role with no start date is only dropped from the form: the form's own steps save it.
        if (!rem.removeTraffic.length) {
            rem.steps = [];
            for (let i = 0; i < 3; i++) {
                const next = page.getByRole('button', {name: /^(Save And Continue|Update|Save|Update User|Save Changes|Invite|Send)$/}).last();
                if (!(await next.isVisible().catch(() => false))) break;
                const label = (await next.innerText()).trim();
                const m2 = h.mark();
                await next.click();
                await idle(page); await sleep(1200);
                const ss = await h.snap(`a00c-admin-step-${i}`);
                rem.steps.push({label, traffic: h.since(m2).filter((x) => x.m !== 'GET').map((x) => [x.override || x.m, x.url, x.status]), url: page.url(), text: flat(ss.text.main, 600)});
                if (!/management\/settings\/user|invitation/.test(page.url())) break;
            }
        }
    } else rem.noManagerRow = true;
    return rem;
}

async function seedAdm(app, S) {
    // The administrator also holds Reader here (the context's users[] enrols the existing account, as U38 K3 did):
    // the screen refuses to remove a user's last role, so "no role" is reached as "Reader only" once the
    // Journal Manager role is ended on screen. Reader is not among the roles the references API admits.
    const adm = tag('u42k1m');
    const users = [{username: `${adm}mg`, roles: ['manager']}, {username: `${adm}au`, roles: ['author']},
        {username: 'admin', roles: ['reader'], givenName: 'Site', familyName: 'Admin'}];
    S.adm = await app.api.createContext({tag: adm, users, metadata: {dataCitations: 'request', funders: 'request'}});
    S.admS = await app.api.createSubmission({tag: `${adm}a`, context: S.adm.path, submitter: `${adm}au`,
        citationsRaw: ['Admin ref one', 'Admin ref two']});
    saveState(app, S);
}

async function phaseAdmin(app, S, h, page) {
    await seedAdm(app, S);
    const C = S.adm.path;
    const id = S.admS.submissionId;
    const out = h.begin("Admin".toLowerCase());
    // First, on the main context, where Journal manager is the administrator's only role: the screen refuses.
    await signIn(page, 'admin', {contextPath: S.main.path});
    out.lastRole = await endOwnManagerRole(app, page, h, S.main.path, 'a00a-admin-last-role');
    await signOut(page).catch(() => {});
    await signIn(page, 'admin', {contextPath: C});
    out.removeRole = await endOwnManagerRole(app, page, h, C);
    await signOut(page).catch(() => {});
    await signIn(page, 'admin', {contextPath: C});
    await page.goto(app.url(`/index.php/${C}/en/management/settings/access`));
    await idle(page);
    const urow = page.locator('table').filter({hasText: /\badmin\b/}).first().locator('tr').filter({hasText: /\badmin\b/}).first();
    await urow.waitFor({state: 'visible', timeout: T}).catch(() => {});
    out.adminUserRow = flat(await urow.innerText().catch(() => null), 300);
    await h.snap('a00d-admin-users-list-after');
    await h.gotoWorkflow(C, id);
    out.entries = await h.sideEntries();
    out.opened = await h.openReferences();
    const a1 = await h.snap('a01-admin-refs');
    if (!out.opened) {
        // Reader only: the dashboard itself refuses (an in-page "Error" window) and no workflow opens.
        out.refused = {url: a1.url, dialog: flat(a1.text.dialog, 300), main: flat(a1.text.main, 300)};
        await signOut(page).catch(() => {});
        h.fact('admin', out);
        log(app.name, 'admin done (no workflow)');
        return;
    }
    out.controls = await h.controls();
    // Add one line.
    out.add = await h.addLines('Admin added line');
    const as = await h.snap('a02-admin-add');
    out.add.controls = await h.controls();
    out.add.dialogText = flat(as.text.dialog, 1500);
    await h.gotoWorkflow(C, id);
    await h.openReferences();
    out.add.rowsAfterReload = await h.settledRows();
    // Edit.
    const panel = page.getByRole('dialog', {name: 'Edit citation'});
    await h.rowAction('Admin ref one', 'Edit').catch((e) => { out.editError = String(e.message).slice(0, 200); });
    const pbox = panel.getByRole('textbox').first();
    if (await pbox.waitFor({state: 'visible', timeout: T}).then(() => true).catch(() => false)) {
        await idle(page);
        await pbox.fill('Admin ref one, edited');
        const m = h.mark();
        const put = page.waitForResponse((r) => /\/citations\/\d+/.test(r.url()) && r.request().method() !== 'GET', {timeout: 8000}).catch(() => null);
        await panel.getByRole('button', {name: 'Save', exact: true}).click();
        const pr = await put;
        await sleep(1000);
        await idle(page);
        const es = await h.snap('a03-admin-edit-save');
        out.edit = {status: pr ? pr.status() : 'no request', panelOpen: await panel.isVisible().catch(() => false), panelText: flat(es.text.dialog, 1200), traffic: h.since(m)};
        if (await panel.isVisible().catch(() => false)) {
            await panel.getByRole('button', {name: 'Close', exact: true}).first().click().catch(() => {});
            await panel.waitFor({state: 'detached', timeout: 10000}).catch(() => {});
        }
        out.edit.rows = await h.settledRows();
    }
    // Delete one.
    await h.rowAction('Admin ref two', 'Delete').catch((e) => { out.deleteError = String(e.message).slice(0, 200); });
    const dd = page.getByRole('dialog').filter({hasText: 'Are you sure you wish to delete this item?'}).last();
    if (await dd.waitFor({state: 'visible', timeout: 8000}).then(() => true).catch(() => false)) {
        const m = h.mark();
        await dd.getByRole('button', {name: 'OK', exact: true}).click();
        await dd.waitFor({state: 'detached', timeout: 8000}).catch(() => {});
        await sleep(1000);
        await idle(page);
        const ds = await h.snap('a04-admin-delete');
        out.del = {traffic: h.since(m), rows: await h.settledRows(), text: flat(ds.text.dialog, 1200)};
    }
    // Delete all.
    await h.delAll().first().click();
    const da = page.getByRole('dialog').filter({hasText: 'This will remove all references'}).last();
    if (await da.waitFor({state: 'visible', timeout: 8000}).then(() => true).catch(() => false)) {
        const m = h.mark();
        await da.getByRole('button', {name: 'OK', exact: true}).click();
        await da.waitFor({state: 'detached', timeout: 8000}).catch(() => {});
        await sleep(1000);
        await idle(page);
        const ds = await h.snap('a05-admin-delete-all');
        out.delAll = {traffic: h.since(m), rows: await h.settledRows(), text: flat(ds.text.dialog, 1200)};
    }
    await h.gotoWorkflow(C, id);
    await h.openReferences();
    out.rowsAfterAll = await h.settledRows();
    // Control: a data citation on the "Data" page.
    out.data = {opened: await h.openEntry('Data')};
    await h.snap('a06-admin-data-page');
    const addDc = wf(page).getByRole('button', {name: 'Add Data Citation', exact: true});
    if (await addDc.isVisible().catch(() => false)) {
        await addDc.click();
        const dp = page.getByRole('dialog', {name: 'Add Data Citation'});
        await dp.waitFor({state: 'visible', timeout: T}).catch(() => {});
        await idle(page);
        await dp.getByRole('textbox', {name: /^Title/}).fill('Admin dataset');
        const rel = dp.getByRole('combobox', {name: /^Relationship type/});
        await rel.selectOption({index: 1}).catch(() => {});
        const m = h.mark();
        const saved = page.waitForResponse((r) => /dataCitations/.test(r.url()) && r.request().method() !== 'GET', {timeout: 10000}).catch(() => null);
        await dp.getByRole('button', {name: 'Save', exact: true}).click();
        const sr = await saved;
        await dp.waitFor({state: 'detached', timeout: 10000}).catch(() => {});
        await sleep(800);
        await idle(page);
        out.data.status = sr ? sr.status() : 'no request';
        out.data.traffic = h.since(m);
        out.data.listed = await wf(page).getByText('Admin dataset').count();
        await h.snap('a07-admin-data-saved');
    }
    // Control: a funder on the "Funding" page.
    try {
        const {FundingScreen, stubRegistrySearch} = require(path.join(app.suiteDir, 'pages', 'FundingPages.js'));
        await stubRegistrySearch(page);
        out.funding = {opened: await h.openEntry('Funding')};
        const fs2 = new FundingScreen(page);
        const m = h.mark();
        await fs2.addFunder('Admin Funder Agency');
        out.funding.traffic = h.since(m);
        out.funding.listed = await wf(page).getByText('Admin Funder Agency').count();
        await h.snap('a08-admin-funder-saved');
    } catch (e) {
        out.funding = {...(out.funding || {}), error: String(e.message).split('\n')[0].slice(0, 300)};
        await h.snap('a08-admin-funder-error');
    }
    await signOut(page);
    h.fact('admin', out);
    log(app.name, 'admin done');
}

// ---------------------------------------------------------------------------

forEachApp(async (app) => {
    const S = PHASES.includes('seed') ? await seed(app) : loadState(app);
    const facts = PHASES.includes('seed') ? {} : loadFacts(app);
    const {page, close} = await launch(app);
    const h = makeHelpers(app, page, facts);
    const phases = {mgr: phaseMgr, roles: phaseRoles, versions: phaseVersions, settings: phaseSettings, admin: phaseAdmin};
    try {
        for (const p of ALL.slice(1)) {
            if (!PHASES.includes(p)) continue;
            try {
                await phases[p](app, S, h, page);
            } catch (e) {
                log('[error]', app.name, p, String(e.stack || e.message).slice(0, 1500));
                await h.snap(`error-${p}`).catch(() => {});
                h.fact(`${p}Error`, String(e.message).slice(0, 800));
                await signOut(page).catch(() => {});
            }
        }
    } finally {
        record('k1-traffic', h.traffic);
        await close();
    }
});
