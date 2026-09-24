// U42 claim check, chunk K2: the workflow's Publication › "References" page with metadata lookup ON,
// on all three apps: the "Edit citation" panel and its structured fields, Metadata lookup Rules 10–15,
// register A4–A6; plus the panel with lookup OFF (q6, the other end of the panel's axis).
//
//   PROBE_FEATURE=U42 PROBE_AGENT=ccK2 node bin/probe.js all shared/playwright/checks/U42/K2/k2.js
//
// PHASES (default: all) picks a subset: seed, mgr, counts, roles, off, quiet. Phases after `seed` read
// k2-state-<app>.json, so `PHASES=roles ONLY=ojs` re-drives one phase on the last seed.
// A full run takes several minutes per app (one phase watches the page for a minute): launch it
// detached (nohup … &) and poll the log.
//
// Test installs run no job runner and have outbound HTTP dead, so the lookup chain never runs:
// a reference is structured here only by hand ("Edit"), and the "No structured information found"
// badge, the failed state and "All {n} references successfully processed" cannot be reached.
//
// Seeds (scratch contexts only; publicknowledge and the roster are never touched):
//   on   lookup on (citationsMetadataLookup: true); users mg (manager), se (sectionEditor, assigned),
//        au (author). sA empty list (the manager's Add and edits), sB five references (the counts,
//        reprocess, the author's read), sC two references (the section editor's edit).
//   off  lookup off; user mg; sOff two references (q6, the raw panel).
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, signOut, screen, shot, record, loc, note, idle, tag, outDir} = require('../../../probe');

const T = 30_000;
const ALL = ['seed', 'mgr', 'counts', 'roles', 'off', 'quiet'];
const PHASES = (process.env.PHASES || ALL.join(',')).split(',');
const WATCH_MS = Number(process.env.WATCH_MS || 60_000);
const log = (...a) => console.log('[k2]', ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const wf = (page) => page.locator('[role="dialog"]:visible').first();
const flat = (s, n = 4000) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));

function statePath(app) { return path.join(outDir(), `k2-state-${app.name}.json`); }
function loadState(app) { return JSON.parse(fs.readFileSync(statePath(app), 'utf8')); }
function saveState(app, S) { fs.writeFileSync(statePath(app), JSON.stringify(S, null, 2)); }
function factsPath(app) { return path.join(outDir(), `k2-facts-${app.name}.json`); }
function loadFacts(app) { try { return JSON.parse(fs.readFileSync(factsPath(app), 'utf8')); } catch (e) { return {}; } }

// ---------------------------------------------------------------------------
// Seeding

async function seed(app) {
    const t = tag('u42k2');
    const S = {t, app: app.name};
    const users = [
        {username: `${t}mg`, roles: ['manager']},
        {username: `${t}se`, roles: ['sectionEditor']},
        {username: `${t}au`, roles: ['author']},
    ];
    const participants = [{username: `${t}se`, role: 'sectionEditor'}];
    S.on = await app.api.createContext({tag: t, users, citationsMetadataLookup: true});
    const ctx = S.on.path;
    S.sA = await app.api.createSubmission({tag: `${t}a`, context: ctx, submitter: `${t}au`, participants});
    S.sB = await app.api.createSubmission({tag: `${t}b`, context: ctx, submitter: `${t}au`, participants,
        citationsRaw: ['One ref 2001', 'Two ref 2002', 'Three ref 2003', 'Four ref 2004', 'Five ref 2005']});
    S.sC = await app.api.createSubmission({tag: `${t}c`, context: ctx, submitter: `${t}au`, participants,
        citationsRaw: ['Editor ref alpha', 'Editor ref beta']});

    const o = `${t}f`;
    S.off = await app.api.createContext({tag: o, users: [{username: `${o}mg`, roles: ['manager']}], citationsMetadataLookup: false});
    S.sOff = await app.api.createSubmission({tag: `${o}a`, context: S.off.path, submitter: `${o}mg`,
        citationsRaw: ['Alpha study 2020', 'Beta trial 2021']});
    saveState(app, S);
    log(app.name, 'seeded', ctx, S.off.path, JSON.stringify({sA: S.sA.submissionId, sB: S.sB.submissionId, sC: S.sC.submissionId, sOff: S.sOff.submissionId}));
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
        const entry = {t: Date.now(), m, override: r.request().headers()['x-http-method-override'] || null, url: u.replace(/^https?:\/\/[^/]+/, ''), status: r.status()};
        if (m !== 'GET' && /citations/i.test(u)) {
            entry.req = (r.request().postData() || '').slice(0, 1500);
            entry.body = await r.text().then((b) => b.slice(0, 1500)).catch(() => null);
        }
        traffic.push(entry);
    });
    const browserDialogs = [];
    page.on('dialog', async (d) => { browserDialogs.push({type: d.type(), message: d.message()}); await d.dismiss().catch(() => {}); });

    const panel = () => page.getByRole('dialog', {name: 'Edit citation'});

    const h = {
        traffic, browserDialogs, panel,
        mark() { return traffic.length; },
        since(i) { return traffic.slice(i).map(({t, ...x}) => x); },
        async snap(name) {
            const s = await screen(page);
            record(name, s);
            await shot(page, name).catch(() => {});
            return s;
        },
        fact(key, value) {
            facts[key] = value;
            fs.writeFileSync(factsPath(app), JSON.stringify(facts, null, 2));
        },
        async step(out, key, fn) {
            try {
                out[key] = await fn();
            } catch (e) {
                out[key] = {error: String(e.message).split('\n')[0].slice(0, 400)};
                log('[step error]', app.name, key, out[key].error);
                await h.snap(`err-${key}`).catch(() => {});
                // Leave any open side panel or confirmation so the next step starts clean.
                for (const d of [panel(), page.getByRole('dialog').filter({hasText: /Are you sure|This will/})]) {
                    if (await d.isVisible().catch(() => false)) {
                        await d.getByRole('button', {name: /^(Close|Cancel)$/}).first().click().catch(() => {});
                        await sleep(600);
                    }
                }
            }
            return out[key];
        },
        async gotoWorkflow(ctx, id, {author = false} = {}) {
            await page.goto(app.url(`/index.php/${ctx}/dashboard/${author ? 'mySubmissions' : 'editorial'}?workflowSubmissionId=${id}`));
            await idle(page);
            await wf(page).getByRole('link', {name: /^(Title & Abstract|Publication|Preprint|Submission|Production|References)$/}).first().waitFor({state: 'visible', timeout: T}).catch(() => {});
            await idle(page);
        },
        async openEntry(name) {
            const dialog = wf(page);
            const entry = dialog.getByRole('link', {name, exact: true}).first();
            if (!(await entry.isVisible().catch(() => false))) {
                const group = dialog.getByRole('link', {name: /^(Publication|Preprint)$/}).first();
                if (await group.count()) { await group.click(); await idle(page); }
            }
            if (!(await entry.isVisible().catch(() => false))) return false;
            await entry.click();
            await dialog.getByRole('heading', {name: new RegExp(`^(Publication|Preprint): ${name}$`, 'i')}).first().waitFor({state: 'visible', timeout: T}).catch(() => {});
            await idle(page);
            return true;
        },
        async openReferences(ctx, id, opts) {
            await h.gotoWorkflow(ctx, id, opts);
            const ok = await h.openEntry('References');
            if (ok) {
                await h.table().waitFor({state: 'visible', timeout: T}).catch(() => {});
                await idle(page);
            }
            return ok;
        },
        box() { return wf(page).getByRole('textbox', {name: /^References/}); },
        addBtn() { return wf(page).getByRole('button', {name: 'Add', exact: true}); },
        linkBtn(name) { return wf(page).getByRole('button', {name, exact: true}).or(wf(page).getByRole('link', {name, exact: true})); },
        table() { return wf(page).locator('table').first(); },
        async rows() {
            return h.table().locator('tbody tr').evaluateAll((trs) => trs.map((tr) => {
                const c = tr.querySelector('td, th');
                return (c ? c.innerText : tr.innerText).replace(/\s+/g, ' ').trim();
            })).catch(() => null);
        },
        async rowsDetail() {
            return h.table().locator('tbody tr').evaluateAll((trs) => trs.map((tr) => {
                const cells = tr.querySelectorAll('td, th');
                const c = cells[0];
                if (!c) return {text: tr.innerText.trim()};
                const vis = (e) => !!(e.offsetWidth || e.offsetHeight) && getComputedStyle(e).visibility !== 'hidden';
                const exp = cells[1] ? cells[1].querySelector('button') : null;
                return {
                    text: c.innerText.replace(/\s+/g, ' ').trim(),
                    lines: c.innerText.split('\n').map((s) => s.trim()).filter(Boolean),
                    links: [...c.querySelectorAll('a')].map((a) => ({text: a.innerText.replace(/\s+/g, ' ').trim(), href: a.getAttribute('href'), target: a.getAttribute('target')})),
                    badges: [...c.querySelectorAll('[class*="badge" i], .pkpBadge')].map((b) => b.innerText.trim()),
                    smallPrint: [...c.querySelectorAll('.text-xs-normal')].map((b) => b.innerText.trim()),
                    expander: exp ? {name: exp.innerText.replace(/\s+/g, ' ').trim(), iconShown: !!exp.querySelector('svg'), visible: vis(exp), w: exp.offsetWidth, h: exp.offsetHeight} : null,
                    menuButtons: cells[2] ? [...cells[2].querySelectorAll('button')].filter(vis).length : 0,
                };
            })).catch((e) => ({error: String(e.message).slice(0, 200)}));
        },
        async settledRows(prev) {
            let last = await h.rowsDetail();
            for (let i = 0; i < 25; i++) {
                await sleep(300);
                const now = await h.rowsDetail();
                if (JSON.stringify(now) === JSON.stringify(last) && (prev === undefined || JSON.stringify(now) !== JSON.stringify(prev) || i > 10)) return now;
                last = now;
            }
            return last;
        },
        async upper() {
            // The page between its heading and the table: the lookup text, the Add box, the progress box, the links.
            const txt = (await wf(page).innerText().catch(() => '')) || '';
            const start = txt.search(/(PUBLICATION|PREPRINT|Publication|Preprint): REFERENCES/i);
            const end = txt.indexOf('The above references', start);
            return txt.slice(start < 0 ? 0 : start, end < 0 ? undefined : end + 80);
        },
        async progress() {
            const l = wf(page).getByText(/^(Processing references - \d+\/\d+|All \d+ references successfully processed)$/);
            if (!(await l.count())) return null;
            const box = l.first().locator('xpath=ancestor::div[contains(@class,"py-2")][1]');
            return {title: (await l.first().innerText()).trim(), text: flat(await box.innerText().catch(() => null))};
        },
        async state(key) {
            const d = wf(page);
            const st = async (l) => {
                const x = l.first();
                if (!(await x.count())) return {present: false};
                return {present: true, visible: await x.isVisible().catch(() => false), disabled: await x.isDisabled().catch(() => null), tag: await x.evaluate((e) => e.tagName.toLowerCase()).catch(() => null)};
            };
            return {
                heading: await d.getByRole('heading', {level: 2}).first().innerText().catch(() => null),
                lookupHeading: await d.getByRole('heading', {name: 'Structured References', exact: true}).evaluateAll((els) => els.map((e) => e.tagName)).catch(() => null),
                upper: flat(await h.upper(), 1500),
                progress: await h.progress(),
                box: await st(h.box()),
                add: await st(h.addBtn()),
                delAll: await st(h.linkBtn('Delete all references')),
                reprocessAll: await st(h.linkBtn('Reprocess all references')),
                expandAll: await st(d.getByRole('button', {name: /^(Expand All|Collapse All)$/})),
                expandAllLabel: await d.getByRole('button', {name: /^(Expand All|Collapse All)$/}).first().innerText().catch(() => null),
                headers: await h.table().locator('thead th').evaluateAll((els) => els.map((e) => e.innerText.replace(/\s+/g, ' ').trim())).catch(() => null),
                rows: await h.rowsDetail(),
            };
        },
        rowLoc(text) { return h.table().locator('tbody tr').filter({hasText: text}).first(); },
        async menuItems(text) {
            const btn = h.rowLoc(text).getByRole('button', {name: 'More Actions'});
            if (!(await btn.isVisible().catch(() => false))) return null;
            await btn.click();
            await page.getByRole('menuitem').first().waitFor({state: 'visible', timeout: 5000}).catch(() => {});
            const items = (await page.getByRole('menuitem').allInnerTexts()).map((x) => x.trim());
            // Close it by its own button: Escape would close the workflow dialog too.
            await btn.click().catch(() => {});
            await page.getByRole('menuitem').first().waitFor({state: 'detached', timeout: 5000}).catch(() => {});
            return items;
        },
        async rowAction(text, action) {
            await h.rowLoc(text).waitFor({state: 'visible', timeout: 10000});
            await h.rowLoc(text).getByRole('button', {name: 'More Actions'}).click();
            const item = page.getByRole('menuitem', {name: action, exact: true});
            await item.waitFor({state: 'visible', timeout: 5000});
            await item.click();
        },
        // --- the Edit citation panel
        field(label) { return panel().getByRole('textbox', {name: new RegExp(`^${label}`)}).first(); },
        async openEdit(text) {
            await h.rowAction(text, 'Edit');
            await panel().waitFor({state: 'visible', timeout: T});
            await panel().getByRole('button', {name: 'Save', exact: true}).waitFor({state: 'visible', timeout: T});
            await idle(page);
            await sleep(300);
        },
        async panelRead() {
            const p = panel();
            return {
                title: await p.getByRole('heading').first().innerText().catch(() => null),
                fields: await p.locator('.pkpFormField').evaluateAll((els) => els.map((f) => {
                    const label = f.querySelector('.pkpFormFieldLabel, label, legend');
                    const input = f.querySelector('input, textarea, select');
                    const desc = f.querySelector('.pkpFormField__description');
                    return {
                        label: label ? label.innerText.replace(/\s+/g, ' ').trim() : null,
                        required: !!f.querySelector('.pkpFormFieldLabel__required, [class*="required" i]'),
                        control: input ? input.tagName.toLowerCase() + (input.type ? `[${input.type}]` : '') : null,
                        name: input ? input.getAttribute('name') : null,
                        value: input ? input.value : null,
                        description: desc ? desc.innerText.replace(/\s+/g, ' ').trim() : null,
                        options: input && input.tagName === 'SELECT' ? [...input.options].map((o) => o.text.trim()) : undefined,
                        columns: f.classList.contains('pkpFormField--authors') ? [...f.querySelectorAll('thead th')].map((th) => th.innerText.trim()) : undefined,
                        authorRows: f.classList.contains('pkpFormField--authors') ? [...f.querySelectorAll('tbody tr')].map((tr) => [...tr.querySelectorAll('input')].map((i) => i.value)) : undefined,
                    };
                })).catch((e) => ({error: String(e.message).slice(0, 200)})),
                groups: await p.locator('legend, fieldset > .pkpFormGroup__heading, .pkpFormGroup__heading').allInnerTexts().catch(() => []),
                buttons: await p.getByRole('button').evaluateAll((els) => els.filter((e) => e.offsetWidth || e.offsetHeight).map((e) => e.innerText.replace(/\s+/g, ' ').trim() || e.getAttribute('aria-label'))).catch(() => []),
                links: await p.getByRole('link').allInnerTexts().catch(() => []),
                errors: await p.locator('.pkpFieldError').allInnerTexts().catch(() => []),
                foot: ((await p.innerText().catch(() => '')) || '').split('\n').map((l) => l.trim()).filter((l) => /Please correct|Go to|error/i.test(l)),
            };
        },
        async save({expectClose = true} = {}) {
            const p = panel();
            const m = h.mark();
            const put = page.waitForResponse((r) => /\/citations\/\d+$/.test(r.url().split('?')[0]) && r.request().method() !== 'GET', {timeout: 10000}).catch(() => null);
            const before = await h.rowsDetail();
            await p.getByRole('button', {name: 'Save', exact: true}).click();
            const r = await put;
            if (expectClose) await p.waitFor({state: 'detached', timeout: 10000}).catch(() => {});
            await sleep(700);
            await idle(page);
            const open = await p.isVisible().catch(() => false);
            return {status: r ? r.status() : 'no request', panelOpen: open, panel: open ? await h.panelRead() : null,
                rows: open ? null : await h.settledRows(before), traffic: h.since(m)};
        },
        async closePanel() {
            const p = panel();
            if (await p.isVisible().catch(() => false)) {
                await p.getByRole('button', {name: 'Close', exact: true}).first().click().catch(() => {});
                await p.waitFor({state: 'detached', timeout: 10000}).catch(() => {});
                await sleep(700);
            }
        },
        authorsField() { return panel().locator('.pkpFormField--authors'); },
        async addAuthor(given, family, orcid) {
            const f = h.authorsField();
            const n = await f.locator('tbody tr:has(input)').count();
            await f.getByRole('button', {name: 'Add', exact: true}).click();
            const row = f.locator('tbody tr:has(input)').nth(n);
            await row.waitFor({state: 'visible', timeout: 5000});
            if (given != null) await row.locator('input[name="givenName"]').fill(given);
            if (family != null) await row.locator('input[name="familyName"]').fill(family);
            if (orcid != null) await row.locator('input[name="orcid"]').fill(orcid);
        },
        async refreshWatch(ms) {
            const t0 = Date.now();
            await sleep(ms);
            const hits = traffic.filter((x) => x.t >= t0 && x.m === 'GET');
            const by = {};
            for (const x of hits) { const k = x.url.split('?')[0]; by[k] = (by[k] || 0) + 1; }
            return {ms, gets: hits.length, byPath: by, times: hits.map((x) => Math.round((x.t - t0) / 100) / 10)};
        },
    };
    return h;
}

// ---------------------------------------------------------------------------
// Phase mgr: the manager on sA (Rules 10–15, the structured panel, A4).

async function phaseMgr(app, S, h, page) {
    const ctx = S.on.path;
    const id = S.sA.submissionId;
    const out = {};
    await signIn(page, `${S.t}mg`, {contextPath: ctx});
    out.opened = await h.openReferences(ctx, id);
    await h.snap('m01-empty-lookup-on');
    out.empty = await h.state();
    await loc(page, 'References page (lookup on): "Reprocess all references"', h.linkBtn('Reprocess all references'));
    await loc(page, 'References page (lookup on): "Expand All" header button', wf(page).getByRole('button', {name: /^(Expand All|Collapse All)$/}));
    await loc(page, 'References page (lookup on): lookup heading "Structured References" (h3)', wf(page).getByRole('heading', {name: 'Structured References', exact: true}));

    // "Expand All" on an empty list.
    await h.step(out, 'expandAllEmpty', async () => {
        const b = wf(page).getByRole('button', {name: /^(Expand All|Collapse All)$/}).first();
        const m = h.mark();
        await b.click();
        await sleep(400);
        const label = await b.innerText();
        await b.click();
        await sleep(400);
        return {afterFirst: label, afterSecond: await b.innerText(), traffic: h.since(m)};
    });

    // q10: add two references (one with identifiers written into its text).
    await h.step(out, 'add', async () => {
        await h.box().first().fill('Alpha study 2020\nBeta trial 2021 https://doi.org/10.5555/beta.2021 arXiv:2101.00001');
        const m = h.mark();
        const before = await h.rowsDetail();
        const resp = page.waitForResponse((r) => /importAdditionalCitations/.test(r.url()), {timeout: 10000}).catch(() => null);
        await h.addBtn().first().click();
        const r = await resp;
        await idle(page);
        const rows = await h.settledRows(before);
        return {status: r ? r.status() : 'no request', rows, traffic: h.since(m)};
    });
    await h.snap('m02-two-added');
    out.afterAdd = await h.state();
    out.menuUnstructured = await h.step(out, 'menuUnstructured', () => h.menuItems('Alpha study 2020'));
    await h.step(out, 'expandAllUnstructured', async () => {
        const b = wf(page).getByRole('button', {name: /^(Expand All|Collapse All)$/}).first();
        const before = await h.rowsDetail();
        await b.click();
        await sleep(500);
        const r = {label: await b.innerText(), rows: await h.rowsDetail(), same: null};
        r.same = JSON.stringify(before) === JSON.stringify(r.rows);
        await h.snap('m03-expand-all-unstructured');
        await b.click();
        await sleep(400);
        r.labelBack = await b.innerText();
        return r;
    });
    // Reload: does the DOI written in Beta's text show as a link while its chain waits?
    await h.openReferences(ctx, id);
    out.afterReload = await h.state();

    // q11: the structured panel on Alpha.
    await h.step(out, 'panelFirst', async () => {
        await h.openEdit('Alpha study 2020');
        await h.snap('m04-edit-panel-structured');
        const r = await h.panelRead();
        await loc(page, 'Edit citation panel (lookup on): DOI box', h.field('DOI'));
        await loc(page, 'Edit citation panel (lookup on): Author Information "Add"', h.authorsField().getByRole('button', {name: 'Add', exact: true}));
        await loc(page, 'Edit citation panel (lookup on): Source Type', h.panel().getByRole('combobox', {name: /^Source Type/}));
        return r;
    });

    // Leaving the panel with unsaved changes (an author row added, a DOI typed), by its "Close".
    await h.step(out, 'closeUnsaved', async () => {
        await h.field('DOI').fill('10.9999/unsaved');
        await h.addAuthor('Unsaved', 'Person', '');
        const m = h.mark();
        await h.closePanel();
        const r = {browserDialogs: [...h.browserDialogs], inApp: await page.getByRole('dialog').filter({hasText: /unsaved|discard|leave/i}).count(), traffic: h.since(m), rows: await h.settledRows()};
        await h.snap('m05-closed-unsaved');
        await h.openEdit('Alpha study 2020');
        r.reopened = await h.panelRead();
        await h.closePanel();
        return r;
    });
    await h.openReferences(ctx, id);

    // q11: DOI + title + one author → structured by hand.
    await h.step(out, 'structure', async () => {
        await h.openEdit('Alpha study 2020');
        await h.field('DOI').fill('10.1234/abcd');
        await h.field('Title').fill('Alpha study');
        await h.addAuthor('Ada', 'Lovelace', '');
        const r = await h.save();
        await h.snap('m06-structured-saved');
        r.state = await h.state();
        r.menu = await h.menuItems('Alpha study');
        return r;
    });
    await h.step(out, 'expandRow', async () => {
        const row = h.rowLoc('Alpha study');
        const btn = row.locator('td').nth(1).locator('button');
        const r = {nameBefore: (await btn.innerText().catch(() => null))};
        await btn.click();
        await sleep(400);
        r.rowOpen = (await h.rowsDetail())[0];
        r.nameOpen = await btn.innerText().catch(() => null);
        r.expandAllLabel = await wf(page).getByRole('button', {name: /^(Expand All|Collapse All)$/}).first().innerText();
        await h.snap('m07-row-expanded');
        await btn.click();
        await sleep(400);
        r.rowClosed = (await h.rowsDetail())[0];
        // Keyboard: focus the expander and press Enter, then Space.
        await btn.focus();
        await page.keyboard.press('Enter');
        await sleep(400);
        r.afterEnter = (await h.rowsDetail())[0].lines;
        await page.keyboard.press('Space');
        await sleep(400);
        r.afterSpace = (await h.rowsDetail())[0].lines;
        r.focused = await page.evaluate(() => (document.activeElement ? document.activeElement.innerText.trim() : null));
        // "Expand All".
        const b = wf(page).getByRole('button', {name: /^(Expand All|Collapse All)$/}).first();
        await b.click();
        await sleep(400);
        r.expandAll = {label: await b.innerText(), rows: await h.rowsDetail()};
        await h.snap('m08-expand-all-structured');
        await b.click();
        await sleep(400);
        r.collapseAll = {label: await b.innerText(), rows: await h.rowsDetail()};
        return r;
    });

    // q11: watch the page for a minute (the refresh while the box shows a count below its total).
    out.progressAfterStructure = await h.progress();
    out.watchOnPage = await h.refreshWatch(WATCH_MS);
    await h.snap('m09-after-watch');
    // And after leaving the References page for another Publication page.
    await h.step(out, 'watchElsewhere', async () => {
        await h.openEntry('Title & Abstract');
        const r = await h.refreshWatch(22_000);
        await h.openEntry('References');
        await h.table().waitFor({state: 'visible', timeout: T}).catch(() => {});
        return r;
    });

    // q11: the second reference: DOI in its three forms, then refusals.
    await h.step(out, 'doiForms', async () => {
        const r = {};
        const row = 'Beta trial 2021';
        for (const [k, v] of [['prefixed', 'doi:10.1234/efgh'], ['address', 'https://doi.org/10.1234/ijkl'], ['bare', '10.1234/mnop']]) {
            await h.openEdit(row);
            await h.field('DOI').fill(v);
            const s = await h.save();
            await h.openEdit(row);
            r[k] = {typed: v, status: s.status, row: (s.rows || []).find((x) => x.text.includes(row)), stored: await h.field('DOI').inputValue()};
            await h.closePanel();
        }
        return r;
    });
    await h.snap('m10-doi-forms');
    await h.step(out, 'refusals', async () => {
        const r = {};
        const row = 'Beta trial 2021';
        const saveState = async () => h.panel().getByRole('button', {name: 'Save', exact: true}).isDisabled().catch(() => null);
        await h.openEdit(row);
        await h.field('DOI').fill('not-a-doi');
        r.oneError = await h.save({expectClose: false});
        r.oneError.saveDisabledAfter = await saveState();
        await h.snap('m11-refused-doi');
        // A refused save disables Save until the flagged box changes: change it too.
        await h.field('DOI').fill('still-not-a-doi');
        await h.field('URL').fill('not a url');
        r.twoErrors = await h.save({expectClose: false});
        await h.snap('m12-refused-two');
        await h.field('DOI').fill('10.1234/qrst');
        await h.field('URL').fill('');
        await h.field('Arxiv').fill('xyz');
        await h.field('Handle').fill('bad');
        r.arxivHandle = await h.save({expectClose: false});
        await h.snap('m13-refused-arxiv-handle');
        await h.field('Arxiv').fill('');
        await h.field('Handle').fill('');
        await h.field('Edit Raw Citation').fill('');
        r.rawEmpty = await h.save({expectClose: false});
        await h.snap('m14-refused-raw-empty');
        await h.closePanel();
        r.rowAfter = (await h.settledRows()).find((x) => x.text.includes(row));
        await h.openEdit(row);
        r.storedAfter = (await h.panelRead()).fields.filter((f) => f.value).map((f) => [f.name, f.value]);
        await h.closePanel();
        return r;
    });
    // The other identifiers, prefixed forms, then address forms.
    await h.step(out, 'otherIds', async () => {
        const r = {};
        const row = 'Beta trial 2021';
        await h.openEdit(row);
        await h.field('Arxiv').fill('arxiv:2101.12345v2');
        await h.field('Handle').fill('handle:20.1000/100');
        await h.field('URL').fill('https://example.org/beta');
        await h.field('URN').fill('urn:nbn:de:1234-5678');
        r.prefixed = await h.save();
        await h.openEdit(row);
        r.prefixedStored = await h.panelRead();
        await h.field('Arxiv').fill('https://arxiv.org/abs/2101.12345v2');
        await h.field('Handle').fill('https://hdl.handle.net/20.1000/100');
        r.address = await h.save();
        await h.snap('m15-other-ids-row');
        await h.openEdit(row);
        r.addressStored = await h.panelRead();
        await h.field('Arxiv').fill('2101.12345v2');
        r.bare = await h.save();
        await h.openEdit(row);
        r.bareStored = await h.field('Arxiv').inputValue();
        await h.closePanel();
        r.menu = await h.menuItems(row);
        return r;
    });
    // Title and an author row left blank: does an empty author row count as an author?
    await h.step(out, 'emptyAuthorRow', async () => {
        const row = 'Beta trial 2021';
        await h.openEdit(row);
        await h.field('Title').fill('Beta trial');
        const r = {};
        r.titleOnly = await h.save();
        r.titleOnlyMenu = await h.menuItems(row);
        await h.openEdit(row);
        await h.addAuthor(null, null, null);
        r.blankAuthor = await h.save();
        await h.snap('m16-blank-author-row');
        r.blankAuthorMenu = await h.menuItems('Beta trial');
        r.progress = await h.progress();
        // Delete the blank row again.
        await h.openEdit('Beta trial');
        const f = h.authorsField();
        r.rowsInPanel = await f.locator('tbody tr:has(input)').count();
        await f.getByRole('button', {name: 'Delete', exact: true}).first().click().catch((e) => { r.deleteError = String(e.message).slice(0, 200); });
        await sleep(400);
        r.rowsAfterDelete = await f.locator('tbody tr:has(input)').count();
        r.deleted = await h.save();
        r.deletedMenu = await h.menuItems('Beta trial 2021');
        r.progressAfter = await h.progress();
        return r;
    });

    // The details a structured row shows: every detail field on Alpha, an ORCID, then the raw text only.
    await h.step(out, 'details', async () => {
        const r = {};
        await h.openEdit('Alpha study');
        await h.field('Source Name').fill('Journal of Tests');
        await h.field('Source Issn').fill('1234-5678');
        await h.field('Publisher or Host').fill('Test Host');
        await h.panel().getByRole('combobox', {name: /^Source Type/}).selectOption({label: 'Journal'}).catch((e) => { r.sourceTypeError = String(e.message).slice(0, 200); });
        await h.panel().getByRole('combobox', {name: /^Type/}).selectOption({label: 'Journal Article'}).catch((e) => { r.typeError = String(e.message).slice(0, 200); });
        await h.panel().locator('input[type="date"]').first().fill('2020-05-01').catch((e) => { r.dateError = String(e.message).slice(0, 200); });
        await h.field('Volume').fill('12');
        await h.field('Issue').fill('3');
        await h.field('Pages').fill('45-67');
        await h.field('First Page').fill('45');
        await h.field('Last Page').fill('67');
        const f = h.authorsField();
        await f.locator('tbody tr:has(input)').first().locator('input[name="orcid"]').fill('https://orcid.org/0000-0002-1825-0097');
        await h.addAuthor('Charles', 'Babbage', 'https://orcid.org/0000-0001-5109-3700');
        r.save = await h.save();
        const b = wf(page).getByRole('button', {name: /^(Expand All|Collapse All)$/}).first();
        await b.click();
        await sleep(500);
        r.expanded = (await h.rowsDetail()).find((x) => x.text.includes('Alpha study'));
        await h.snap('m17-details-expanded');
        await b.click();
        await sleep(300);
        await h.openEdit('Alpha study');
        r.stored = await h.panelRead();
        await h.closePanel();
        return r;
    });
    // q11 / Rule 14: editing only "Edit Raw Citation" of a structured reference.
    await h.step(out, 'rawOnly', async () => {
        await h.openEdit('Alpha study');
        await h.field('Edit Raw Citation').fill('Alpha study 2020, revised');
        const r = await h.save();
        r.reprocessCalls = r.traffic.filter((x) => /reprocess/i.test(x.url)).length;
        await h.openEdit('Alpha study');
        r.stored = await h.panelRead();
        await h.closePanel();
        r.menu = await h.menuItems('Alpha study');
        r.progress = await h.progress();
        return r;
    });
    await h.snap('m18-raw-only');

    // An author row added and then abandoned by "Close" on a fresh reference: what the next open and its Save carry.
    await h.step(out, 'phantomAuthor', async () => {
        const row = 'Gamma phantom 2022';
        const r = {};
        await h.box().first().fill(row);
        await h.addBtn().first().click();
        await h.rowLoc(row).waitFor({state: 'visible', timeout: 10000});
        await idle(page);
        await h.openEdit(row);
        r.before = (await h.panelRead()).fields.find((f) => f.label === 'Author Information');
        await h.addAuthor('Ghost', 'Writer', '');
        await h.closePanel();
        r.rowAfterClose = (await h.rowsDetail()).find((x) => x.text.includes(row));
        await h.openEdit(row);
        r.reopened = (await h.panelRead()).fields.find((f) => f.label === 'Author Information');
        await h.snap('m18b-phantom-author-reopened');
        await h.field('URN').fill('urn:phantom:1');
        r.save = await h.save();
        // After a reload.
        await h.openReferences(ctx, id);
        await h.openEdit(row);
        r.afterReload = (await h.panelRead()).fields.find((f) => f.label === 'Author Information');
        await h.closePanel();
        r.menu = await h.menuItems(row);
        return r;
    });

    // Leaving the page with an edit panel open and changed (the workflow's Close).
    await h.step(out, 'leaveWithPanel', async () => {
        await h.openEdit('Alpha study');
        await h.field('Title').fill('Unsaved title');
        const m = h.mark();
        const r = {};
        // The page behind the panel is covered: go to another entry by address.
        await page.goto(app.url(`/index.php/${ctx}/dashboard/editorial`));
        await idle(page);
        r.browserDialogs = [...h.browserDialogs];
        r.traffic = h.since(m);
        await h.openReferences(ctx, id);
        r.rows = await h.rowsDetail();
        return r;
    });
    out.final = await h.state();
    await h.snap('m19-final');
    await signOut(page);
    h.fact('mgr', out);
    log(app.name, 'mgr done');
}

// ---------------------------------------------------------------------------
// Phase counts: the manager on sB (five references): the progress box's counts (A6), Reprocess, Reprocess all.

async function phaseCounts(app, S, h, page) {
    const ctx = S.on.path;
    const id = S.sB.submissionId;
    const out = {};
    await signIn(page, `${S.t}mg`, {contextPath: ctx});
    await h.openReferences(ctx, id);
    await h.snap('c01-five-unstructured');
    out.start = await h.state();
    // Structure two of five by hand.
    for (const [i, ref] of [[1, 'One ref 2001'], [2, 'Two ref 2002']]) {
        await h.step(out, `structure${i}`, async () => {
            await h.openEdit(ref);
            await h.field('URL').fill(`https://example.org/ref${i}`);
            await h.field('Title').fill(`Title ${i}`);
            await h.addAuthor('Given', `Family${i}`, '');
            const r = await h.save();
            r.progress = await h.progress();
            return r;
        });
        await h.snap(`c02-structured-${i}`);
    }
    out.twoOfFive = await h.state();
    // q13: a row's "Reprocess" on an unstructured row: Cancel, then OK.
    await h.step(out, 'reprocessRow', async () => {
        const r = {};
        const ref = 'Three ref 2003';
        r.menu = await h.menuItems(ref);
        await h.rowAction(ref, 'Reprocess');
        const dlg = page.getByRole('dialog').filter({hasText: 'Are you sure you want to reprocess this citation?'}).last();
        await dlg.waitFor({state: 'visible', timeout: 8000});
        const s = await h.snap('c03-reprocess-dialog');
        r.dialog = {text: s.text.dialog, aria: s.aria.dialogs.slice(-1)[0], buttons: await dlg.getByRole('button').allInnerTexts()};
        let m = h.mark();
        await dlg.getByRole('button', {name: 'Cancel', exact: true}).click();
        await dlg.waitFor({state: 'detached', timeout: 8000}).catch(() => {});
        await sleep(500);
        r.cancel = {traffic: h.since(m), rows: await h.rowsDetail()};
        await h.rowAction(ref, 'Reprocess');
        await dlg.waitFor({state: 'visible', timeout: 8000});
        m = h.mark();
        await dlg.getByRole('button', {name: 'OK', exact: true}).click();
        await dlg.waitFor({state: 'detached', timeout: 8000}).catch(() => {});
        await sleep(800);
        await idle(page);
        r.ok = {traffic: h.since(m), rows: await h.settledRows(), progress: await h.progress()};
        await h.snap('c04-reprocess-ok');
        // Reprocess on a structured row? Its menu.
        r.structuredMenu = await h.menuItems('Title 1');
        return r;
    });
    // q13: "Reprocess all references": Cancel, then OK (the structured details after it).
    await h.step(out, 'reprocessAll', async () => {
        const r = {};
        await h.linkBtn('Reprocess all references').first().click();
        const dlg = page.getByRole('dialog').filter({hasText: 'This will reprocess all references'}).last();
        await dlg.waitFor({state: 'visible', timeout: 8000});
        const s = await h.snap('c05-reprocess-all-dialog');
        r.dialog = {text: s.text.dialog, aria: s.aria.dialogs.slice(-1)[0], buttons: await dlg.getByRole('button').allInnerTexts()};
        let m = h.mark();
        await dlg.getByRole('button', {name: 'Cancel', exact: true}).click();
        await dlg.waitFor({state: 'detached', timeout: 8000}).catch(() => {});
        await sleep(400);
        r.cancel = {traffic: h.since(m)};
        const before = await h.rowsDetail();
        await h.linkBtn('Reprocess all references').first().click();
        await dlg.waitFor({state: 'visible', timeout: 8000});
        m = h.mark();
        await dlg.getByRole('button', {name: 'OK', exact: true}).click();
        await dlg.waitFor({state: 'detached', timeout: 8000}).catch(() => {});
        await sleep(800);
        await idle(page);
        r.ok = {traffic: h.since(m), rows: await h.settledRows(), progress: await h.progress()};
        r.sameRows = JSON.stringify(before) === JSON.stringify(r.ok.rows);
        await h.snap('c06-reprocess-all-ok');
        await h.openEdit('Title 1');
        r.structuredAfter = await h.panelRead();
        await h.closePanel();
        return r;
    });
    // Delete a structured row (the counts follow).
    await h.step(out, 'deleteStructured', async () => {
        await h.rowAction('Title 2', 'Delete');
        const dlg = page.getByRole('dialog').filter({hasText: 'Are you sure you wish to delete this item?'}).last();
        await dlg.waitFor({state: 'visible', timeout: 8000});
        const m = h.mark();
        await dlg.getByRole('button', {name: 'OK', exact: true}).click();
        await dlg.waitFor({state: 'detached', timeout: 8000}).catch(() => {});
        await sleep(800);
        await idle(page);
        return {traffic: h.since(m), rows: await h.settledRows(), progress: await h.progress()};
    });
    await h.snap('c07-after-delete');
    // Search on a word only a structured row's hidden details carry.
    await h.step(out, 'searchHidden', async () => {
        const s = wf(page).getByRole('searchbox', {name: 'Search references here'});
        await s.fill('Family1');
        await s.press('Enter');
        await sleep(500);
        const r = {family: await h.rows()};
        await s.fill('');
        await s.press('Enter');
        await sleep(400);
        r.cleared = await h.rows();
        return r;
    });
    out.final = await h.state();
    await signOut(page);
    h.fact('counts', out);
    log(app.name, 'counts done');
}

// ---------------------------------------------------------------------------
// Phase roles: the section editor edits on sC; the author reads sB (read-only, a structured row).

async function phaseRoles(app, S, h, page) {
    const ctx = S.on.path;
    const out = {};
    await h.step(out, 'se', async () => {
        const r = {};
        await signIn(page, `${S.t}se`, {contextPath: ctx});
        r.opened = await h.openReferences(ctx, S.sC.submissionId);
        await h.snap('r01-se-page');
        r.state = await h.state();
        r.menu = await h.menuItems('Editor ref alpha');
        await h.openEdit('Editor ref alpha');
        await h.snap('r02-se-panel');
        r.panel = await h.panelRead();
        await h.field('DOI').fill('https://doi.org/10.4321/se.1');
        await h.field('Title').fill('Editor alpha');
        await h.addAuthor('Sam', 'Editor', '');
        r.save = await h.save();
        r.progress = await h.progress();
        await h.snap('r03-se-structured');
        await signOut(page);
        return r;
    });
    await h.step(out, 'au', async () => {
        const r = {};
        await signIn(page, `${S.t}au`, {contextPath: ctx});
        r.opened = await h.openReferences(ctx, S.sB.submissionId, {author: true});
        await h.snap('r04-au-page');
        r.state = await h.state();
        r.menuButtons = await h.table().getByRole('button', {name: 'More Actions'}).count();
        const row = h.rowLoc('Title 1');
        const btn = row.locator('td').nth(1).locator('button');
        if (await btn.count()) {
            await btn.click().catch((e) => { r.expandError = String(e.message).slice(0, 200); });
            await sleep(400);
            r.expanded = (await h.rowsDetail()).find((x) => x.text.includes('Title 1'));
        }
        const b = wf(page).getByRole('button', {name: /^(Expand All|Collapse All)$/}).first();
        await b.click().catch(() => {});
        await sleep(400);
        r.expandAll = {label: await b.innerText().catch(() => null), rows: await h.rowsDetail()};
        await h.snap('r05-au-expanded');
        const m = h.mark();
        r.reprocessAllClick = await h.linkBtn('Reprocess all references').first().click({timeout: 3000}).then(() => 'clicked').catch((e) => `refused: ${String(e.message).split('\n')[0].slice(0, 160)}`);
        await sleep(500);
        r.reprocessAllDialog = await page.getByRole('dialog').filter({hasText: 'This will reprocess all references'}).count();
        if (r.reprocessAllDialog) await page.getByRole('dialog').filter({hasText: 'This will reprocess all references'}).last().getByRole('button', {name: 'Cancel', exact: true}).click().catch(() => {});
        r.traffic = h.since(m);
        await signOut(page);
        return r;
    });
    h.fact('roles', out);
    log(app.name, 'roles done');
}

// ---------------------------------------------------------------------------
// Phase off: lookup off, the raw panel (q6).

async function phaseOff(app, S, h, page) {
    const ctx = S.off.path;
    const out = {};
    await signIn(page, `${S.off.path}mg`, {contextPath: ctx});
    out.opened = await h.openReferences(ctx, S.sOff.submissionId);
    await h.snap('o01-lookup-off-page');
    out.state = await h.state();
    out.menu = await h.menuItems('Alpha study 2020');
    await h.step(out, 'panel', async () => {
        await h.openEdit('Alpha study 2020');
        await h.snap('o02-raw-panel');
        const r = {read: await h.panelRead()};
        await h.field('Edit Raw Citation').fill('Alpha study 2020, revised');
        r.save = await h.save();
        await h.snap('o03-raw-saved');
        await h.openEdit('Alpha study 2020, revised');
        await h.field('Edit Raw Citation').fill('');
        r.empty = await h.save({expectClose: false});
        await h.snap('o04-raw-empty');
        await h.closePanel();
        r.rowsAfterEmpty = await h.settledRows();
        return r;
    });
    await signOut(page);
    h.fact('off', out);
    log(app.name, 'off done');
}

// ---------------------------------------------------------------------------
// Phase quiet: the refresh's other ends: lookup on with no structured reference, and lookup off.

async function phaseQuiet(app, S, h, page) {
    const out = {};
    const q = await app.api.createSubmission({tag: `${S.t}q`, context: S.on.path, submitter: `${S.t}au`,
        citationsRaw: ['Quiet ref one', 'Quiet ref two']});
    await signIn(page, `${S.t}mg`, {contextPath: S.on.path});
    await h.openReferences(S.on.path, q.submissionId);
    await h.snap('q01-on-unstructured');
    out.onUnstructured = {progress: await h.progress(), watch: await h.refreshWatch(22_000)};
    await signIn(page, `${S.off.path}mg`, {contextPath: S.off.path});
    await h.openReferences(S.off.path, S.sOff.submissionId);
    out.off = {watch: await h.refreshWatch(22_000)};
    await signOut(page);
    h.fact('quiet', out);
    log(app.name, 'quiet done');
}

// ---------------------------------------------------------------------------

forEachApp(async (app) => {
    const S = PHASES.includes('seed') ? await seed(app) : loadState(app);
    const facts = PHASES.includes('seed') ? {} : loadFacts(app);
    const {page, close} = await launch(app);
    const h = makeHelpers(app, page, facts);
    const phases = {mgr: phaseMgr, counts: phaseCounts, roles: phaseRoles, off: phaseOff, quiet: phaseQuiet};
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
        record('k2-traffic', h.traffic.map(({t, ...x}) => x));
        await close();
    }
});
