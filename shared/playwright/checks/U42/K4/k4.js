// U42 claim check, chunk K4: everything around the two lists, on all three apps.
//   Actors & permissions (settings access, A1 reached as "an assistant role only"), the wizard's References box
//   (Rule 16, q14), identifiers from the wizard with lookup off (Rule 17, A7, q15), new versions (Rule 26, q22),
//   what readers see (Rule 27, A11, OMP1, q23), side effects, Settings › Workflow › Submission › "Metadata" (q1),
//   the outward surfaces a screen shows (OJS Body Text and JATS, Native XML export).
//
//   PROBE_FEATURE=U42 PROBE_AGENT=ccK4 node bin/probe.js all shared/playwright/checks/U42/K4/k4.js
//
// K4_PARTS (default: all) picks parts: settings, wizard, a7, landing, versions, admin, sidefx, exports.
// Every part seeds its own scratch context (tag prefix u42k4); publicknowledge is only read (the settings
// part's install-default read as manager.maya, nothing saved). Each part writes <part>-<app>.json with its facts.
// Test installs run no job runner and have outbound HTTP dead: the lookup chain never runs, so a reference is
// structured here only by hand ("Edit" with lookup on).
const path = require('path');
const {forEachApp, launch, signIn, signOut, screen, shot, record, loc, note, idle, tag} = require('../../../probe');

const T = 30_000;
const ALL = ['settings', 'wizard', 'rail', 'lookupoff', 'a7', 'landing', 'versions', 'gate', 'admin', 'sidefx', 'exports'];
const PARTS = (process.env.K4_PARTS || ALL.join(',')).split(',');
const on = (p) => PARTS.includes(p);
const log = (...a) => console.log('[k4]', ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (s, n = 4000) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));
const wf = (page) => page.locator('[role="dialog"]:visible').first();

// ---------------------------------------------------------------------------
// Generic helpers

function helpers(app, page) {
    const traffic = [];
    page.on('response', async (r) => {
        const u = r.url();
        if (!/\/api\/v1\//.test(u) || /_test\//.test(u)) return;
        const m = r.request().method();
        const e = {m, override: r.request().headers()['x-http-method-override'] || null, url: u.replace(/^https?:\/\/[^/]+/, ''), status: r.status()};
        if (m !== 'GET' && /citations|dataCitations|funders|\/submit$|\/publications\/\d+$/i.test(u.split('?')[0])) e.body = await r.text().then((b) => b.slice(0, 400)).catch(() => null);
        traffic.push(e);
    });
    const dialogs = [];
    page.on('dialog', async (d) => {
        dialogs.push({type: d.type(), message: d.message(), url: page.url()});
        if (d.type() === 'beforeunload') await d.accept().catch(() => {}); else await d.dismiss().catch(() => {});
    });
    const isOps = app.name === 'ops';
    const isOmp = app.name === 'omp';
    const h = {
        traffic, dialogs,
        mark: () => traffic.length,
        since: (i) => traffic.slice(i).map((x) => [x.override || x.m, x.url.split('?')[0], x.status]),
        async snap(name) {
            let s;
            try { s = await screen(page); } catch (e) { s = {url: page.url(), error: String(e.message).slice(0, 300), text: {}}; }
            record(name, s);
            await shot(page, name).catch(() => {});
            return s;
        },
        async gotoWorkflow(ctx, id, {author = false} = {}) {
            await page.goto(app.url(`/index.php/${ctx}/dashboard/${author ? 'mySubmissions' : 'editorial'}?workflowSubmissionId=${id}`));
            await idle(page);
            await wf(page).getByRole('link', {name: /^(Title & Abstract|Publication|Preprint|Submission|Production|References|Metadata)$/}).first()
                .waitFor({state: 'visible', timeout: T}).catch(() => {});
            await idle(page);
        },
        async sideTree() {
            // The workflow side menu as nested text: every treeitem with its own label and its child labels.
            return wf(page).getByRole('treeitem').evaluateAll((els) => els.map((e) => {
                const own = (e.querySelector('a, button') || e).textContent.replace(/\s+/g, ' ').trim();
                const kids = [...e.querySelectorAll('[role="treeitem"]')].map((k) => (k.querySelector('a, button') || k).textContent.replace(/\s+/g, ' ').trim());
                return kids.length ? {item: own, children: kids} : own;
            })).catch(() => []);
        },
        async menuLinks() {
            return wf(page).getByRole('link').evaluateAll((els) => els.filter((e) => e.offsetParent !== null)
                .map((e) => e.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean)).catch(() => []);
        },
        async versionLabels() {
            return wf(page).getByRole('treeitem').evaluateAll((els) => els.map((e) => (e.querySelector('a') || e).textContent.replace(/\s+/g, ' ').trim()))
                .then((xs) => xs.filter((n) => /\d+\.\d+$/.test(n) && !/Create New Version/.test(n))).catch(() => []);
        },
        async openEntry(name, versionLabel) {
            const dialog = wf(page);
            let scope = dialog;
            if (versionLabel) {
                const item = dialog.getByRole('treeitem', {name: versionLabel, exact: true});
                if (!(await item.getByRole('link', {name, exact: true}).first().isVisible().catch(() => false))) {
                    await dialog.getByRole('link', {name: versionLabel, exact: true}).first().click().catch(() => {});
                    await idle(page);
                }
                scope = item;
            }
            const entry = scope.getByRole('link', {name, exact: true}).first();
            if (!(await entry.isVisible().catch(() => false))) {
                const group = dialog.getByRole('link', {name: /^(Publication|Preprint)$/}).first();
                if (await group.count()) { await group.click().catch(() => {}); await idle(page); }
            }
            if (!(await entry.isVisible().catch(() => false))) return false;
            await entry.click();
            await dialog.getByRole('heading', {name: new RegExp(`^(Publication|Preprint): ${name}$`, 'i')}).first().waitFor({state: 'visible', timeout: T}).catch(() => {});
            await idle(page);
            return true;
        },
        async openReferences(versionLabel) {
            const ok = await h.openEntry('References', versionLabel);
            if (ok) { await h.table().waitFor({state: 'visible', timeout: T}).catch(() => {}); await idle(page); }
            return ok;
        },
        async openData(versionLabel) {
            const ok = await h.openEntry('Data', versionLabel);
            if (ok) await page.locator('table:visible').filter({hasText: /No data citations have been added|More Actions/i}).first().waitFor({state: 'visible', timeout: 15_000}).catch(() => {});
            await idle(page);
            return ok;
        },
        box() { return wf(page).getByRole('textbox', {name: /^References/}); },
        addBtn() { return wf(page).getByRole('button', {name: 'Add', exact: true}); },
        linkBtn(name) { return wf(page).getByRole('button', {name, exact: true}).or(wf(page).getByRole('link', {name, exact: true})); },
        table() { return wf(page).locator('table').first(); },
        async rows() {
            return h.table().locator('tbody tr').evaluateAll((trs) => trs.map((tr) => {
                const cells = tr.querySelectorAll('td, th');
                const c = cells[0] || tr;
                return {
                    text: c.innerText.replace(/\s+/g, ' ').trim(),
                    links: [...c.querySelectorAll('a')].map((a) => ({text: a.innerText.replace(/\s+/g, ' ').trim(), href: a.getAttribute('href')})),
                    expander: cells[1] && cells[1].querySelector('button') ? {w: cells[1].querySelector('button').offsetWidth, name: cells[1].querySelector('button').innerText.replace(/\s+/g, ' ').trim()} : null,
                    menu: cells[2] ? [...cells[2].querySelectorAll('button')].filter((b) => b.offsetWidth || b.offsetHeight).length : 0,
                };
            })).catch(() => null);
        },
        async settledRows(prev) {
            let last = await h.rows();
            for (let i = 0; i < 25; i++) {
                await sleep(300);
                const now = await h.rows();
                if (JSON.stringify(now) === JSON.stringify(last) && (prev === undefined || JSON.stringify(now) !== JSON.stringify(prev) || i > 10)) return now;
                last = now;
            }
            return last;
        },
        async refsPage() {
            const d = wf(page);
            const st = async (l) => {
                const x = l.first();
                if (!(await x.count())) return {present: false};
                return {present: true, visible: await x.isVisible().catch(() => false), disabled: await x.isDisabled().catch(() => null)};
            };
            const txt = (await d.innerText().catch(() => '')) || '';
            return {
                heading: await d.getByRole('heading', {level: 2}).first().innerText().catch(() => null),
                box: {...(await st(h.box())), editable: await h.box().first().isEditable().catch(() => null)},
                add: await st(h.addBtn()),
                delAll: await st(h.linkBtn('Delete all references')),
                reprocessAll: await st(h.linkBtn('Reprocess all references')),
                progress: (txt.match(/(Processing references - \d+\/\d+|All \d+ references successfully processed)/) || [null])[0],
                warning: (txt.match(/Warning:[^\n]*/) || [null])[0],
                rows: await h.settledRows(),
            };
        },
        rowLoc(text) { return h.table().locator('tbody tr').filter({hasText: text}).first(); },
        async menuItems(text) {
            const btn = h.rowLoc(text).getByRole('button', {name: 'More Actions'});
            if (!(await btn.isVisible().catch(() => false))) return null;
            await btn.click();
            await page.getByRole('menuitem').first().waitFor({state: 'visible', timeout: 5000}).catch(() => {});
            const items = (await page.getByRole('menuitem').allInnerTexts()).map((x) => x.trim());
            // Close the menu by its own button: Escape can close the workflow dialog too (patterns.md pitfall 7).
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
        async addLines(value) {
            await h.box().first().fill(value);
            const before = await h.rows();
            const m = h.mark();
            const resp = page.waitForResponse((r) => /importAdditionalCitations/.test(r.url()), {timeout: 10000}).catch(() => null);
            await h.addBtn().first().click();
            const r = await resp;
            await idle(page);
            const rows = await h.settledRows(r ? before : undefined);
            return {status: r ? r.status() : 'no request', rows, traffic: h.since(m)};
        },
        async deleteRow(text) {
            const m = h.mark();
            await h.rowAction(text, 'Delete');
            const dd = page.getByRole('dialog').filter({hasText: 'Are you sure you wish to delete this item?'}).last();
            await dd.waitFor({state: 'visible', timeout: 8000});
            const before = await h.rows();
            await dd.getByRole('button', {name: 'OK', exact: true}).click();
            await dd.waitFor({state: 'detached', timeout: 8000}).catch(() => {});
            await idle(page);
            return {rows: await h.settledRows(before), traffic: h.since(m)};
        },
        // The "Edit citation" panel (lookup on: the structured form).
        panel() { return page.getByRole('dialog', {name: 'Edit citation'}); },
        field(label) { return h.panel().getByRole('textbox', {name: new RegExp(`^${label}`)}).first(); },
        async openEdit(text) {
            await h.rowAction(text, 'Edit');
            await h.panel().waitFor({state: 'visible', timeout: T});
            await h.panel().getByRole('button', {name: 'Save', exact: true}).waitFor({state: 'visible', timeout: T});
            await idle(page);
            await sleep(300);
        },
        async panelValues() {
            return h.panel().locator('input, textarea, select').evaluateAll((els) => els.filter((e) => e.type !== 'hidden')
                .map((e) => ({name: e.getAttribute('name'), label: (e.labels && e.labels[0] ? e.labels[0].innerText : '').replace(/\s+/g, ' ').trim(), value: e.value})))
                .catch(() => null);
        },
        async closePanel() {
            const p = h.panel();
            if (await p.isVisible().catch(() => false)) {
                await p.getByRole('button', {name: 'Close', exact: true}).first().click().catch(() => {});
                await p.waitFor({state: 'detached', timeout: 10000}).catch(() => {});
                await sleep(700);
            }
        },
        async structureByHand(text, {doi, title, given = 'Ada', family = 'Lovelace'}) {
            await h.openEdit(text);
            if (doi != null) await h.field('DOI').fill(doi);
            if (title != null) await h.field('Title').fill(title);
            const f = h.panel().locator('.pkpFormField--authors');
            if (await f.count()) {
                const n = await f.locator('tbody tr:has(input[name="givenName"])').count();
                await f.getByRole('button', {name: 'Add', exact: true}).click();
                const row = f.locator('tbody tr:has(input[name="givenName"])').nth(n);
                await row.waitFor({state: 'visible', timeout: 5000});
                await row.locator('input[name="givenName"]').fill(given);
                await row.locator('input[name="familyName"]').fill(family);
            }
            const m = h.mark();
            const before = await h.rows();
            const put = page.waitForResponse((r) => /\/citations\/\d+$/.test(r.url().split('?')[0]) && r.request().method() !== 'GET', {timeout: 10000}).catch(() => null);
            await h.panel().getByRole('button', {name: 'Save', exact: true}).click();
            const r = await put;
            await h.panel().waitFor({state: 'detached', timeout: 10000}).catch(() => {});
            await idle(page);
            return {status: r ? r.status() : 'no request', rows: await h.settledRows(before), traffic: h.since(m)};
        },
        // The "Data" page's table rows.
        async dataRows() {
            const t = page.locator('table:visible').filter({hasText: /No data citations have been added|More Actions/i})
                .filter({hasNot: page.locator('th', {hasText: /Funder/i})}).first();
            if (!(await t.count())) return null;
            return t.locator('tbody tr').evaluateAll((els) => els.map((e) => e.innerText.replace(/\s+/g, ' ').trim()));
        },
        // The wizard.
        async wizardTo(ctx, id, stepName) {
            if (!page.url().includes(`submission?id=${id}`)) { await page.goto(app.url(`/index.php/${ctx}/submission?id=${id}`)); await idle(page); }
            await page.locator('.pkpSteps').waitFor({timeout: T});
            const current = page.locator('.pkpSteps__step__label--current');
            for (let i = 0; i < 6 && !((await current.innerText()).trim().endsWith(stepName)); i++) {
                if (await page.locator('.pkpSteps--collapsed').count()) await page.locator('.pkpSteps__controls button').click().catch(() => {});
                const rail = page.locator('button.pkpSteps__step__label').filter({hasText: new RegExp(`${stepName}$`)});
                if (await rail.count()) await rail.first().click().catch(() => {});
                else await page.locator('.submissionWizard__footer').getByRole('button', {name: 'Continue', exact: true}).click();
                await current.filter({hasText: new RegExp(`${stepName}\\s*$`)}).waitFor({timeout: 8000}).catch(() => {});
            }
            await idle(page);
            return (await current.innerText()).trim();
        },
        wizBox() { return page.locator('main').getByRole('textbox', {name: /^References/}); },
        async detailsRead() {
            const box = h.wizBox();
            const n = await box.count();
            const out = {boxCount: n};
            if (n) {
                out.accessibleName = await box.first().evaluate((e) => {
                    const l = e.labels && e.labels[0]; return l ? l.innerText.replace(/\s+/g, ' ').trim() : null;
                }).catch(() => null);
                out.ariaRequired = await box.first().getAttribute('aria-required').catch(() => null);
                out.requiredAttr = await box.first().evaluate((e) => e.required).catch(() => null);
                out.editable = await box.first().isEditable().catch(() => null);
                out.description = await box.first().evaluate((e) => {
                    const ids = (e.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);
                    return ids.map((id) => { const d = document.getElementById(id); return d ? d.innerText.replace(/\s+/g, ' ').trim() : null; });
                }).catch(() => null);
                out.value = await box.first().inputValue().catch(() => null);
                out.tag = await box.first().evaluate((e) => e.tagName.toLowerCase()).catch(() => null);
            }
            // The Details step's field and section labels in page order.
            out.order = await page.locator('main').locator('.pkpFormFieldLabel, legend, .submissionWizard__stepHeading, h2, h3').evaluateAll((els) => els
                .filter((e) => e.offsetParent !== null).map((e) => e.innerText.replace(/\s+/g, ' ').trim()).filter(Boolean)).catch(() => []);
            return out;
        },
        reviewItem(text, label = 'References') {
            if (!text) return null;
            const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
            const i = lines.findIndex((l) => l === label);
            if (i < 0) return null;
            return lines.slice(Math.max(0, i - 2), i + 7);
        },
        async submitWizard() {
            const o = {};
            const mk = h.traffic.length;
            const submit = page.locator('.submissionWizard__footer').getByRole('button', {name: 'Submit', exact: true});
            o.button = {count: await submit.count(), disabled: (await submit.count()) ? await submit.isDisabled() : null};
            if (!o.button.count || o.button.disabled) return o;
            const sub = page.waitForResponse((r) => /\/submissions\/\d+\/submit/.test(r.url()), {timeout: T}).catch(() => null);
            await submit.click();
            const confirm = page.locator('[role="dialog"]:visible').filter({has: page.getByRole('button', {name: 'Submit', exact: true})}).last();
            if (await confirm.waitFor({state: 'visible', timeout: 8000}).then(() => true).catch(() => false)) {
                o.confirmText = flat(await confirm.innerText().catch(() => null), 400);
                await confirm.getByRole('button', {name: 'Submit', exact: true}).click().catch(() => {});
            }
            const r = await sub;
            o.status = r ? r.status() : null;
            await idle(page);
            await sleep(2500);
            o.writes = h.traffic.slice(mk).filter((x) => x.m !== 'GET').map((x) => [x.override || x.m, x.url.split('?')[0].replace(/^.*api\/v1/, ''), x.status, (x.body || '').slice(0, 160)]);
            return o;
        },
        // Settings › Workflow › Submission › "Metadata".
        async openMetadataSettings(ctx) {
            const resp = await page.goto(app.url(`/index.php/${ctx}/management/settings/workflow`)).catch((e) => ({err: String(e.message)}));
            await idle(page);
            const tab = page.locator('#metadata-button');
            const has = await tab.count();
            if (has) { await tab.click(); await idle(page); }
            const form = page.locator('form').filter({has: page.getByRole('checkbox', {name: 'Enable references metadata'})});
            await form.waitFor({timeout: 15000}).catch(() => {});
            return {status: resp && resp.status ? resp.status() : resp, url: page.url(), metadataTab: has, form};
        },
        async metaForm() { return page.locator('form').filter({has: page.getByRole('checkbox', {name: 'Enable references metadata'})}); },
        async saveMetadata(form) {
            const saved = page.waitForResponse((r) => /\/api\/v1\/contexts\/\d+$/.test(r.url()) && r.request().method() !== 'GET', {timeout: T}).catch(() => null);
            await form.getByRole('button', {name: 'Save', exact: true}).click();
            const r = await saved;
            await page.locator('[role="status"]').filter({hasText: 'Saved'}).first().waitFor({timeout: 10_000}).catch(() => {});
            return r ? r.status() : null;
        },
        landingPath(ctx, id) {
            if (app.name === 'ojs') return `/index.php/${ctx}/article/view/${id}`;
            if (isOmp) return `/index.php/${ctx}/catalog/book/${id}`;
            return `/index.php/${ctx}/preprint/view/${id}`;
        },
        async landing(ctx, id, name, needles = []) {
            const resp = await page.goto(app.url(h.landingPath(ctx, id)));
            await idle(page);
            const s = await h.snap(name);
            const out = {status: resp ? resp.status() : null, url: page.url(), title: s.title};
            out.block = await page.evaluate(() => {
                const heads = [...document.querySelectorAll('h1,h2,h3,h4,.label')].filter((e) => /^\s*references\s*$/i.test(e.textContent));
                if (!heads.length) return {heading: false};
                const hd = heads[0];
                const section = hd.closest('section, .item, .references, div') || hd.parentElement;
                const vis = (e) => !!(e.offsetWidth || e.offsetHeight);
                const kids = [...section.children].filter((c) => c !== hd && !c.contains(hd));
                const flatKids = [];
                for (const k of kids) {
                    if (k.children.length && ['DIV', 'UL', 'OL'].includes(k.tagName)) for (const kk of k.children) flatKids.push(kk); else flatKids.push(k);
                }
                return {
                    heading: true, headingTag: hd.tagName.toLowerCase(), headingText: hd.textContent.trim(), headingVisible: vis(hd),
                    sectionTag: section.tagName.toLowerCase(), sectionClass: section.className,
                    entries: flatKids.map((k) => ({tag: k.tagName.toLowerCase(), text: k.innerText.replace(/\s+/g, ' ').trim()})),
                    links: [...section.querySelectorAll('a')].map((a) => ({text: a.innerText.trim(), href: a.getAttribute('href'), target: a.getAttribute('target'), rel: a.getAttribute('rel')})),
                    text: section.innerText.replace(/\s+/g, ' ').trim().slice(0, 1500),
                };
            });
            const body = (await page.locator('body').innerText().catch(() => '')) || '';
            const html = await page.content();
            out.found = Object.fromEntries(needles.map((n) => [n, {text: body.includes(n), html: html.includes(n)}]));
            return out;
        },
    };
    return h;
}

async function withFile(app, spec) {
    if (app.name !== 'ops') return app.api.createSubmission({...spec, files: [{file: 'article.pdf'}]});
    return app.api.createSubmission({...spec, galleys: [{label: 'PDF', file: 'preprint.pdf'}]});
}

async function createNewVersion(app, page, h) {
    const dialog = wf(page);
    const link = dialog.getByRole('link', {name: 'Create New Version', exact: true}).first();
    const out = {offered: await link.isVisible().catch(() => false)};
    if (!out.offered) return out;
    await link.click();
    const win = page.getByRole('dialog').filter({has: page.locator('select[name="versionStage"]')}).last();
    await win.locator('select[name="versionStage"]').waitFor({state: 'visible', timeout: T});
    await idle(page);
    const stage = win.locator('select[name="versionStage"]');
    if (!(await stage.inputValue().catch(() => ''))) await stage.selectOption('VoR').catch(() => {});
    const minor = win.locator('select[name="versionIsMinor"]');
    if (await minor.isVisible().catch(() => false) && !(await minor.inputValue().catch(() => ''))) await minor.selectOption('false').catch(() => {});
    const created = page.waitForResponse((r) => /\/publications\/\d+\/version/.test(r.url()) && r.request().method() === 'POST', {timeout: T}).catch(() => null);
    await win.getByRole('button', {name: 'Confirm', exact: true}).click();
    const cr = await created;
    out.status = cr ? cr.status() : null;
    await win.waitFor({state: 'detached', timeout: T}).catch(() => {});
    await idle(page);
    return out;
}

// ---------------------------------------------------------------------------
// Parts

async function partSettings(app, page, h) {
    const out = {};
    const t = tag('u42k4s');
    const users = [{username: `${t}mg`, roles: ['manager']}, {username: `${t}se`, roles: ['sectionEditor']}, {username: `${t}au`, roles: ['author']}];
    const C = await app.api.createContext({tag: t, users});
    const ctx = C.path;
    // 1. The install default, read on the seeded journal (nothing changed there).
    await signIn(page, 'manager.maya');
    let o = await h.openMetadataSettings(app.contextPath);
    let s = await h.snap('set-01-publicknowledge-metadata');
    const readGroups = async () => {
        const form = await h.metaForm();
        const g = async (name) => {
            const grp = form.getByRole('group', {name, exact: true});
            if (!(await grp.count())) return {present: false};
            return {
                present: true, visible: await grp.first().isVisible().catch(() => false),
                text: flat(await grp.first().innerText().catch(() => null), 1200),
                inputs: await grp.first().locator('input').evaluateAll((els) => els.map((e) => ({type: e.type, name: e.name, value: e.value, checked: e.checked,
                    label: (e.labels && e.labels[0] ? e.labels[0].innerText : '').replace(/\s+/g, ' ').trim(), visible: !!(e.offsetWidth || e.offsetHeight || (e.labels && e.labels[0] && e.labels[0].offsetWidth))}))).catch(() => null),
            };
        };
        return {references: await g('References'), lookup: await g('References Metadata Lookup'), dataCitations: await g('Data Citations'),
            groupOrder: await form.getByRole('group').evaluateAll((els) => els.map((e) => {
                const lg = e.querySelector('legend'); return lg ? lg.innerText.replace(/\s+/g, ' ').trim() : null;
            }).filter(Boolean)).catch(() => null)};
    };
    out.publicknowledge = {nav: o, heading: flat(s.text && s.text.main, 400), groups: await readGroups()};
    await signOut(page);

    // 2. The same screen on a scratch context, as its manager: toggle the References box and watch the lookup group.
    await signIn(page, `${t}mg`, {contextPath: ctx});
    o = await h.openMetadataSettings(ctx);
    s = await h.snap('set-02-scratch-metadata');
    out.scratch = {nav: {status: o.status, url: o.url}, groups: await readGroups(), pageTabs: await page.getByRole('tab').allInnerTexts().catch(() => [])};
    await loc(page, 'Metadata settings: "Enable references metadata"', page.getByRole('checkbox', {name: 'Enable references metadata', exact: true}));
    await loc(page, 'Metadata settings: group "References Metadata Lookup"', page.getByRole('group', {name: 'References Metadata Lookup', exact: true}));
    await loc(page, 'Metadata settings: group "Data Citations"', page.getByRole('group', {name: 'Data Citations', exact: true}));
    const refBox = page.getByRole('checkbox', {name: 'Enable references metadata', exact: true});
    await refBox.uncheck();
    await sleep(500);
    await h.snap('set-03-references-unticked');
    out.unticked = await readGroups();
    await refBox.check();
    await sleep(500);
    out.reticked = await readGroups();
    // Radios of References disabled while the box is unticked?
    // Then leave the screen with a change unsaved: pick "Require…" and go to another tab, then another page.
    const form = await h.metaForm();
    await form.getByRole('group', {name: 'References', exact: true}).getByRole('radio', {name: /^Require the author/}).check();
    await page.getByRole('tab', {name: 'Components'}).first().click().catch(() => {});
    await idle(page);
    out.leaveTab = {dialogs: [...h.dialogs], tabs: await page.getByRole('tab', {selected: true}).allInnerTexts().catch(() => [])};
    await h.snap('set-04-left-to-components');
    await page.locator('#metadata-button').click().catch(() => {});
    await idle(page);
    out.backOnTab = (await readGroups()).references;
    const d0 = h.dialogs.length;
    await page.goto(app.url(`/index.php/${ctx}/dashboard/editorial`)).catch(() => {});
    await idle(page);
    out.leavePage = {dialogs: h.dialogs.slice(d0)};
    await h.openMetadataSettings(ctx);
    out.afterReturn = (await readGroups()).references;
    await h.snap('set-05-after-return');
    // The Roles setting's box ("Permit submission metadata edit.") on the Author role's edit window.
    await page.goto(app.url(`/index.php/${ctx}/management/settings/access`));
    await idle(page);
    const rolesTab = page.getByRole('tab', {name: 'Roles', exact: true});
    if (await rolesTab.count()) { await rolesTab.first().click(); await idle(page); }
    await h.snap('set-06-roles-tab');
    const authorRow = page.locator('tr').filter({hasText: /^\s*Author\s*$/m}).first();
    const rr = {rowFound: await authorRow.count()};
    if (rr.rowFound) {
        const toggle = authorRow.locator('a.show_extras');
        if (await toggle.count()) { await toggle.click(); await sleep(400); }
        const edit = page.locator('tr').filter({has: page.getByRole('link', {name: 'Edit', exact: true})}).locator('xpath=.').first();
        const editLink = authorRow.locator('xpath=following-sibling::tr[1]').getByRole('link', {name: 'Edit', exact: true});
        if (await editLink.count()) {
            await editLink.first().click();
            const dlg = page.getByRole('dialog').filter({hasText: /Permit submission metadata edit/}).last();
            rr.windowOpened = await dlg.waitFor({state: 'visible', timeout: 15000}).then(() => true).catch(() => false);
            await idle(page);
            const ws = await h.snap('set-07-author-role-window');
            rr.permitLabel = await page.getByText(/Permit submission metadata edit/).allInnerTexts().catch(() => []);
            rr.permitBox = await page.getByRole('checkbox', {name: /Permit submission metadata edit/}).isChecked().catch(() => null);
            rr.text = flat(ws.text && ws.text.dialog, 800);
            void edit;
        }
    }
    out.roleWindow = rr;
    await signOut(page);

    // 3. Who reaches the settings screen: the Section Editor, the Author (typed address), admin (manager in every scratch context).
    out.reach = {};
    for (const [key, user] of [['se', `${t}se`], ['au', `${t}au`], ['admin', 'admin']]) {
        await signIn(page, user, {contextPath: ctx});
        const r = await h.openMetadataSettings(ctx);
        const sx = await h.snap(`set-08-reach-${key}`);
        out.reach[key] = {status: r.status, url: r.url, metadataTab: r.metadataTab, hasReferencesGroup: await page.getByRole('group', {name: 'References', exact: true}).count(),
            text: flat(sx.text && sx.text.main, 300)};
        await signOut(page);
    }
    return out;
}

async function partWizard(app, page, h) {
    const out = {};
    const t = tag('u42k4w');
    const C = await app.api.createContext({tag: t, users: [{username: `${t}mg`, roles: ['manager']}, {username: `${t}au`, roles: ['author']}], metadata: {dataCitations: 'request'}});
    const D = await withFile(app, {tag: `${t}d`, context: C.path, submitter: `${t}au`, title: `K4 wizard ${t}`, submitted: false});
    const t2 = tag('u42k4r');
    const C2 = await app.api.createContext({tag: t2, users: [{username: `${t2}mg`, roles: ['manager']}, {username: `${t2}au`, roles: ['author']}], metadata: {citations: 'require'}});
    const D2 = await withFile(app, {tag: `${t2}d`, context: C2.path, submitter: `${t2}au`, title: `K4 required ${t2}`, submitted: false});

    // Ask (install default): the box, a first save, a second save that rewrites it, Review, Submit.
    await signIn(page, `${t}au`, {contextPath: C.path});
    await h.wizardTo(C.path, D.submissionId, 'Details');
    await h.snap('wiz-01-ask-details');
    out.ask = {details: await h.detailsRead()};
    out.ask.dataTable = {add: await page.locator('main').getByRole('button', {name: 'Add Data Citation', exact: true}).count()};
    await loc(page, 'Wizard Details: References box', h.wizBox());
    // First visit: the box with a repeated line, a blank line, a line of spaces and extra spaces, saved by "Continue".
    await h.wizBox().first().fill('Beta trial 2021\nAlpha study 2020\nBeta trial 2021\n\n   \n  Gamma    report   2022  ');
    await h.wizardTo(C.path, D.submissionId, 'Review');
    let s = await h.snap('wiz-02-ask-review-first');
    out.ask.reviewFirst = h.reviewItem(s.text && s.text.main);
    await h.wizardTo(C.path, D.submissionId, 'Details');
    // Second visit (by the rail): a different list, then the rail to Review and "Submit" at once.
    await h.wizBox().first().fill('Changed on second visit one\nChanged on second visit two');
    await h.wizardTo(C.path, D.submissionId, 'Review');
    s = await h.snap('wiz-03-ask-review-second');
    out.ask.reviewSecond = h.reviewItem(s.text && s.text.main);
    out.ask.submit = await h.submitWizard();
    s = await h.snap('wiz-04-ask-after-submit');
    out.ask.afterSubmit = flat(s.text && s.text.main, 300);
    await signOut(page);
    await signIn(page, `${t}mg`, {contextPath: C.path});
    await h.gotoWorkflow(C.path, D.submissionId);
    await h.openReferences();
    await h.snap('wiz-05-ask-manager-refs');
    out.ask.managerRows = (await h.settledRows()).map((r) => r.text);
    await signOut(page);

    // Require: the mark, Review with the box empty, Submit refused, then filled and submitted.
    await signIn(page, `${t2}au`, {contextPath: C2.path});
    await h.wizardTo(C2.path, D2.submissionId, 'Details');
    await h.snap('wiz-06-req-details');
    out.req = {details: await h.detailsRead()};
    await h.wizardTo(C2.path, D2.submissionId, 'Review');
    s = await h.snap('wiz-07-req-review-empty');
    out.req.reviewEmpty = h.reviewItem(s.text && s.text.main);
    out.req.reviewEmptyHasRequired = /This field is required\./.test(s.text && s.text.main || '');
    out.req.submitEmpty = await h.submitWizard();
    s = await h.snap('wiz-08-req-after-submit-empty');
    out.req.afterSubmitEmpty = {url: s.url, text: flat(s.text && s.text.main, 1500)};
    out.req.afterSubmitEmptyItem = h.reviewItem(s.text && s.text.main);
    await page.goto(app.url(`/index.php/${C2.path}/submission?id=${D2.submissionId}`)); await idle(page);
    await h.wizardTo(C2.path, D2.submissionId, 'Details');
    await h.wizBox().first().fill('Required ref one\nRequired ref two');
    await h.wizardTo(C2.path, D2.submissionId, 'Review');
    s = await h.snap('wiz-09-req-review-filled');
    out.req.reviewFilled = h.reviewItem(s.text && s.text.main);
    out.req.submitFilled = await h.submitWizard();
    s = await h.snap('wiz-10-req-after-submit-filled');
    out.req.afterSubmitFilled = flat(s.text && s.text.main, 300);
    await signOut(page);
    await signIn(page, `${t2}mg`, {contextPath: C2.path});
    await h.gotoWorkflow(C2.path, D2.submissionId);
    await h.openReferences();
    await h.snap('wiz-11-req-manager-refs');
    out.req.managerRows = (await h.settledRows()).map((r) => r.text);
    await signOut(page);
    return out;
}

// The box changed on a second visit to "Details", then the rail to an already reached "Review": what Review lists,
// what is saved, and what a minute's wait and a reload show.
async function partRail(app, page, h) {
    const out = {};
    const t = tag('u42k4g');
    const C = await app.api.createContext({tag: t, users: [{username: `${t}mg`, roles: ['manager']}, {username: `${t}au`, roles: ['author']}]});
    const D = await withFile(app, {tag: `${t}d`, context: C.path, submitter: `${t}au`, title: `K4 rail ${t}`, submitted: false});
    const puts = () => h.traffic.filter((x) => x.m !== 'GET' && /publications\/\d+$|submissions\/\d+$/.test(x.url.split('?')[0]));
    await signIn(page, `${t}au`, {contextPath: C.path});
    await h.wizardTo(C.path, D.submissionId, 'Details');
    await h.wizBox().first().fill('Rail one');
    let m = h.traffic.length;
    out.firstMove = await h.wizardTo(C.path, D.submissionId, 'Review');
    let s = await h.snap('rail-01-review-after-continue');
    out.first = {review: h.reviewItem(s.text && s.text.main), writes: h.traffic.slice(m).filter((x) => x.m !== 'GET').map((x) => [x.override || x.m, x.url.split('?')[0], x.status])};
    // Back to Details on the rail, change the box and the title, then the rail to Review.
    await page.locator('button.pkpSteps__step__label').filter({hasText: /Details$/}).first().click();
    await page.locator('.pkpSteps__step__label--current').filter({hasText: /Details\s*$/}).waitFor({timeout: 8000}).catch(() => {});
    await idle(page);
    await h.wizBox().first().fill('Rail two');
    const title = page.locator('main').getByRole('textbox', {name: /^Title/}).first();
    const titleIsInput = await title.evaluate((e) => ['INPUT', 'TEXTAREA'].includes(e.tagName)).catch(() => false);
    if (titleIsInput) await title.fill(`K4 rail title two ${t}`);
    out.titleTyped = titleIsInput;
    m = h.traffic.length;
    await page.locator('button.pkpSteps__step__label').filter({hasText: /Review$/}).first().click();
    await page.locator('.pkpSteps__step__label--current').filter({hasText: /Review\s*$/}).waitFor({timeout: 8000}).catch(() => {});
    await idle(page);
    s = await h.snap('rail-02-review-after-rail');
    out.second = {review: h.reviewItem(s.text && s.text.main), titleShown: (s.text && s.text.main || '').includes('K4 rail title two'),
        footer: flat(await page.locator('.submissionWizard__footer').innerText().catch(() => null), 200),
        writes: h.traffic.slice(m).filter((x) => x.m !== 'GET').map((x) => [x.override || x.m, x.url.split('?')[0], x.status])};
    // A minute and a quarter on Review.
    m = h.traffic.length;
    await sleep(75_000);
    await idle(page);
    s = await h.snap('rail-03-review-after-wait');
    out.afterWait = {review: h.reviewItem(s.text && s.text.main), footer: flat(await page.locator('.submissionWizard__footer').innerText().catch(() => null), 200),
        writes: h.traffic.slice(m).filter((x) => x.m !== 'GET').map((x) => [x.override || x.m, x.url.split('?')[0], x.status])};
    // Reload, then Review again.
    await page.reload(); await idle(page);
    const unsaved = page.getByRole('dialog').filter({hasText: /Unsaved Changes/i});
    out.unsavedDialog = await unsaved.isVisible().catch(() => false);
    if (out.unsavedDialog) { out.unsavedText = flat(await unsaved.innerText().catch(() => null), 400); await h.snap('rail-04-unsaved-dialog'); }
    const stepAfterReload = (await page.locator('.pkpSteps__step__label--current').innerText().catch(() => '')).trim();
    out.stepAfterReload = stepAfterReload;
    await h.wizardTo(C.path, D.submissionId, 'Details');
    out.boxAfterReload = await h.wizBox().first().inputValue().catch(() => null);
    await h.wizardTo(C.path, D.submissionId, 'Review');
    s = await h.snap('rail-05-review-after-reload');
    out.afterReload = {review: h.reviewItem(s.text && s.text.main), titleShown: (s.text && s.text.main || '').includes('K4 rail title two')};
    out.allWrites = puts().map((x) => [x.override || x.m, x.url.split('?')[0], x.status]);
    out.submit = await h.submitWizard();
    await signOut(page);
    await signIn(page, `${t}mg`, {contextPath: C.path});
    await h.gotoWorkflow(C.path, D.submissionId);
    await h.openReferences();
    await h.snap('rail-06-manager-refs');
    out.managerRows = (await h.settledRows()).map((r) => r.text);
    await signOut(page);
    return out;
}

// Settings bullet 2's tail: switching lookup off keeps a structured reference's details; they stop showing and come
// back when it is switched on again. Also the "Data Citations" choices' labels, read with its box ticked (unsaved).
async function partLookupOff(app, page, h) {
    const out = {};
    const t = tag('u42k4o');
    const C = await app.api.createContext({tag: t, users: [{username: `${t}mg`, roles: ['manager']}, {username: `${t}au`, roles: ['author']}], citationsMetadataLookup: true});
    const S = await app.api.createSubmission({tag: `${t}s`, context: C.path, submitter: `${t}au`, title: `K4 lookup off ${t}`, citationsRaw: ['Lookup ref one 2020', 'Lookup ref two 2021']});
    await signIn(page, `${t}mg`, {contextPath: C.path});
    await h.gotoWorkflow(C.path, S.submissionId);
    await h.openReferences();
    out.structure = await h.structureByHand('Lookup ref one 2020', {doi: '10.1234/k4look', title: 'Lookup structured title'});
    await h.snap('lko-01-on-structured');
    out.on1 = await h.refsPage();
    // Side effects of a row's "Reprocess" (lookup on): the Activity Log before and after.
    const logCount = async (name) => {
        const header = page.locator('[data-cy="sidemodal-header"]').first();
        const btn = header.getByRole('button', {name: 'Activity Log', exact: true});
        if (!(await btn.count())) return {button: false};
        await btn.click();
        const lg = page.getByRole('dialog').filter({has: page.locator('.pkp_controllers_informationCenter')}).last();
        await lg.waitFor({timeout: T}).catch(() => {});
        await lg.locator('table tbody tr').first().waitFor({timeout: 45000}).catch(() => {});
        await idle(page); await sleep(400);
        await h.snap(name);
        const rows = await lg.locator('table').first().locator('tbody tr.gridRow').evaluateAll((trs) => trs.map((tr) => tr.innerText.replace(/\s+/g, ' ').split('$(function')[0].trim())).catch(() => []);
        await lg.getByRole('button', {name: 'Close', exact: true}).first().click().catch(() => {});
        await lg.waitFor({state: 'hidden', timeout: 15000}).catch(() => {});
        await sleep(600);
        return {count: rows.length, rows};
    };
    try {
        out.logBeforeReprocess = await logCount('lko-00-log-before');
        await h.gotoWorkflow(C.path, S.submissionId);
        await h.openReferences();
        await h.rowAction('Lookup ref two 2021', 'Reprocess');
        const dlg = page.getByRole('dialog').filter({hasText: 'Are you sure you want to reprocess this citation?'}).last();
        await dlg.waitFor({state: 'visible', timeout: 8000});
        const m = h.mark();
        await dlg.getByRole('button', {name: 'OK', exact: true}).click();
        await dlg.waitFor({state: 'detached', timeout: 8000}).catch(() => {});
        await idle(page); await sleep(800);
        out.reprocess = {traffic: h.since(m)};
        await h.gotoWorkflow(C.path, S.submissionId);
        out.logAfterReprocess = await logCount('lko-00-log-after');
        await h.gotoWorkflow(C.path, S.submissionId);
        await h.openReferences();
    } catch (e) { out.reprocessErr = String(e.message).split('\n')[0].slice(0, 200); }
    const setLookup = async (checked) => {
        const o = await h.openMetadataSettings(C.path);
        const box = page.getByRole('checkbox', {name: 'Enable references structuring and metadata lookup', exact: true});
        if (checked) await box.check(); else await box.uncheck();
        return h.saveMetadata(o.form);
    };
    out.offSave = await setLookup(false);
    // The Data Citations group's choices, shown once its box is ticked (not saved).
    const dcBox = page.getByRole('checkbox', {name: 'Enable data citation metadata', exact: true});
    await dcBox.check();
    await sleep(400);
    const grp = page.getByRole('group', {name: 'Data Citations', exact: true});
    out.dcChoices = await grp.locator('input[type="radio"]').evaluateAll((els) => els.map((e) => ({value: e.value, checked: e.checked,
        label: (e.labels && e.labels[0] ? e.labels[0].innerText : '').replace(/\s+/g, ' ').trim()}))).catch(() => null);
    await h.snap('lko-02-dc-ticked-unsaved');
    await dcBox.uncheck();
    await h.gotoWorkflow(C.path, S.submissionId);
    await h.openReferences();
    await h.snap('lko-03-off-rows');
    out.off = await h.refsPage();
    out.offMenu = await h.menuItems('Lookup ref one 2020');
    try {
        await h.openEdit('Lookup ref one 2020');
        await h.snap('lko-04-off-edit');
        out.offEdit = await h.panelValues();
        await h.closePanel();
    } catch (e) { out.offEdit = {error: String(e.message).slice(0, 200)}; }
    out.onSave = await setLookup(true);
    await h.gotoWorkflow(C.path, S.submissionId);
    await h.openReferences();
    await h.snap('lko-05-on-again');
    out.on2 = await h.refsPage();
    await signOut(page);
    return out;
}

async function partA7(app, page, h) {
    const out = {};
    const t = tag('u42k4d');
    const C = await app.api.createContext({tag: t, users: [{username: `${t}mg`, roles: ['manager']}, {username: `${t}au`, roles: ['author']}], citationsMetadataLookup: false});
    const D = await withFile(app, {tag: `${t}d`, context: C.path, submitter: `${t}au`, title: `K4 A7 ${t}`, submitted: false});
    await signIn(page, `${t}au`, {contextPath: C.path});
    await h.wizardTo(C.path, D.submissionId, 'Details');
    await h.wizBox().first().fill('Alpha study https://doi.org/10.1234/abcd');
    await h.wizardTo(C.path, D.submissionId, 'Review');
    await h.snap('a7-01-review');
    out.submit = await h.submitWizard();
    await signOut(page);
    await signIn(page, `${t}mg`, {contextPath: C.path});
    await h.gotoWorkflow(C.path, D.submissionId);
    await h.openReferences();
    out.add = await h.addLines('Beta trial https://doi.org/10.1234/efgh');
    await h.snap('a7-02-lookup-off-rows');
    out.offRows = await h.settledRows();
    out.offMenu = await h.menuItems('Alpha study');
    // Switch lookup on and save; nothing runs in the background here.
    const o = await h.openMetadataSettings(C.path);
    const box = page.getByRole('checkbox', {name: 'Enable references structuring and metadata lookup', exact: true});
    out.lookupBefore = await box.isChecked().catch(() => null);
    await box.check();
    out.saveStatus = await h.saveMetadata(o.form);
    await h.snap('a7-03-lookup-saved');
    await h.gotoWorkflow(C.path, D.submissionId);
    await h.openReferences();
    await h.snap('a7-04-lookup-on-rows');
    out.onPage = await h.refsPage();
    for (const [key, text] of [['alpha', 'Alpha study'], ['beta', 'Beta trial']]) {
        try {
            await h.openEdit(text);
            await h.snap(`a7-05-edit-${key}`);
            out[`edit_${key}`] = await h.panelValues();
            await h.closePanel();
        } catch (e) { out[`edit_${key}`] = {error: String(e.message).slice(0, 200)}; }
    }
    await signOut(page);
    return out;
}

async function partLanding(app, page, h) {
    const out = {};
    const t = tag('u42k4l');
    const C = await app.api.createContext({tag: t, users: [{username: `${t}mg`, roles: ['manager']}, {username: `${t}au`, roles: ['author']}],
        citationsMetadataLookup: true, metadata: {dataCitations: 'request'}});
    const refs = ['Zulu report 2019', 'Alpha study 2020 https://example.org/alpha', 'Beta trial 2021 ftp://ftp.example.org/beta', 'Delta paper 2023 doi:10.1234/k4delta'];
    const P = await app.api.createSubmission({tag: `${t}p`, context: C.path, submitter: `${t}au`, title: `K4 landing ${t}`, published: true, citationsRaw: refs,
        dataCitations: [{title: 'K4 Landing Dataset', relationshipType: 'generated', identifierType: 'DOI', identifier: '10.1234/k4ds', repository: 'Zenodo', url: 'https://example.org/k4ds'}]});
    const P0 = await app.api.createSubmission({tag: `${t}z`, context: C.path, submitter: `${t}au`, title: `K4 no refs ${t}`, published: true});
    const needles = ['K4 Landing Dataset', '10.1234/k4ds', 'Zenodo', 'Structured Beta Title', '10.1234/k4beta', 'Lovelace', 'Data Citations'];
    // The manager structures one reference by hand and reads the Data page's line.
    await signIn(page, `${t}mg`, {contextPath: C.path});
    await h.gotoWorkflow(C.path, P.submissionId);
    await h.openReferences();
    await h.snap('land-01-refs-before');
    out.structure = await h.structureByHand('Beta trial 2021', {doi: '10.1234/k4beta', title: 'Structured Beta Title'});
    await h.snap('land-02-refs-structured');
    out.workflowRows = await h.settledRows();
    await h.openData();
    const ds = await h.snap('land-03-data-page');
    out.dataLine = ((ds.text && ds.text.dialog || '').match(/Add formal data citations[^\n]*/) || [null])[0];
    out.dataRows = await h.dataRows();
    await signOut(page);
    // Signed out: the landing pages.
    out.P = await h.landing(C.path, P.submissionId, 'land-04-landing-with-refs', needles);
    out.P0 = await h.landing(C.path, P0.submissionId, 'land-05-landing-no-refs', needles);
    await loc(page, 'Landing page: the "References" heading', page.getByRole('heading', {name: 'References', exact: true}));
    // Switch "Enable references metadata" off, then read the landing page again.
    await signIn(page, `${t}mg`, {contextPath: C.path});
    const o = await h.openMetadataSettings(C.path);
    await page.getByRole('checkbox', {name: 'Enable references metadata', exact: true}).uncheck();
    out.offSave = await h.saveMetadata(o.form);
    await h.snap('land-06-references-off-saved');
    await h.gotoWorkflow(C.path, P.submissionId);
    out.menuOff = await h.menuLinks();
    await signOut(page);
    out.Poff = await h.landing(C.path, P.submissionId, 'land-07-landing-refs-off', needles);
    out.P0off = await h.landing(C.path, P0.submissionId, 'land-08-landing-no-refs-off', needles);
    return out;
}

async function partVersions(app, page, h) {
    const out = {};
    const t = tag('u42k4v');
    const C = await app.api.createContext({tag: t, users: [{username: `${t}mg`, roles: ['manager']}, {username: `${t}au`, roles: ['author']}],
        citationsMetadataLookup: true, metadata: {dataCitations: 'request', funders: 'request'}});
    const P = await app.api.createSubmission({tag: `${t}p`, context: C.path, submitter: `${t}au`, title: `K4 versions ${t}`, published: true,
        citationsRaw: ['Version ref A 2020', 'Version ref B 2021', 'Version ref C 2022'],
        dataCitations: [{title: 'K4 Version Dataset', relationshipType: 'analyzed'}]});
    await signIn(page, `${t}mg`, {contextPath: C.path});
    await h.gotoWorkflow(C.path, P.submissionId);
    out.tree0 = await h.sideTree();
    await h.openReferences();
    out.structure = await h.structureByHand('Version ref A 2020', {doi: '10.1234/k4vera', title: 'Structured A title'});
    await h.snap('ver-01-v1-structured');
    out.v1before = await h.refsPage();
    out.create = await createNewVersion(app, page, h);
    await h.gotoWorkflow(C.path, P.submissionId);
    out.tree1 = await h.sideTree();
    await h.snap('ver-02-tree-two-versions');
    const labels = await h.versionLabels();
    out.labels = labels;
    const v1 = labels.find((l) => /1\.0$/.test(l));
    const v2 = labels.find((l) => /1\.1$/.test(l));
    out.v1label = v1; out.v2label = v2;
    if (v2) {
        await h.openReferences(v2);
        await h.snap('ver-03-v2-refs');
        out.v2refs = await h.refsPage();
        try {
            await h.openEdit('Structured A title');
            await h.snap('ver-04-v2-edit-structured');
            out.v2editA = await h.panelValues();
            await h.closePanel();
        } catch (e) { out.v2editA = {error: String(e.message).slice(0, 200)}; }
        await h.openData(v2);
        await h.snap('ver-05-v2-data');
        out.v2data = await h.dataRows();
        await h.openReferences(v2);
        out.v2delete = await h.deleteRow('Version ref B 2021');
        await h.snap('ver-06-v2-after-delete');
        if (v1) {
            await h.openReferences(v1);
            await h.snap('ver-07-v1-refs-after');
            out.v1after = await h.refsPage();
            await h.openData(v1);
            out.v1data = await h.dataRows();
        }
        // Funding: add a funder on the new version, then read the first version's Funding page.
        try {
            const {FundingScreen, stubRegistrySearch} = require(path.join(app.suiteDir, 'pages', 'FundingPages.js'));
            await stubRegistrySearch(page);
            out.funding = {v2open: await h.openEntry('Funding', v2)};
            const fs2 = new FundingScreen(page);
            const m = h.mark();
            await fs2.addFunder('K4 Version Funder');
            out.funding.traffic = h.since(m);
            await h.snap('ver-08-v2-funding');
            await wf(page).getByText('K4 Version Funder').first().waitFor({timeout: 10000}).catch(() => {});
            out.funding.v2HasFunder = await wf(page).getByText('K4 Version Funder').count();
            out.funding.v1open = v1 ? await h.openEntry('Funding', v1) : null;
            await idle(page); await sleep(800);
            await h.snap('ver-09-v1-funding');
            await page.locator('table:visible').filter({hasText: /Funder name/i}).first().waitFor({timeout: 10000}).catch(() => {});
            await sleep(1000);
            out.funding.v1heading = await wf(page).getByRole('heading', {level: 2}).first().innerText().catch(() => null);
            out.funding.v1rows = await page.locator('table:visible').filter({hasText: /Funder name/i}).first().locator('tbody tr').allInnerTexts().catch(() => null);
            out.funding.v1HasFunder = await wf(page).getByText('K4 Version Funder').count();
            await h.openEntry('Funding', v2);
            await page.locator('table:visible').filter({hasText: /Funder name/i}).first().waitFor({timeout: 10000}).catch(() => {});
            await sleep(1000);
            out.funding.v2rows = await page.locator('table:visible').filter({hasText: /Funder name/i}).first().locator('tbody tr').allInnerTexts().catch(() => null);
        } catch (e) {
            out.funding = {...(out.funding || {}), error: String(e.message).split('\n')[0].slice(0, 300)};
            await h.snap('ver-09-funding-error');
        }
    }
    await signOut(page);
    return out;
}

// "Editing follows the publication": the Author at both ends of the edit gate. (a) On a journal or press with the
// Author role's "Permit submission metadata edit." ticked (a preprint server has it ticked already): the Author's own
// unpublished submission. (b) The Author on a published (posted) version, with the permission.
async function partGate(app, page, h) {
    const out = {};
    const t = tag('u42k4p');
    const C = await app.api.createContext({tag: t, users: [{username: `${t}mg`, roles: ['manager']}, {username: `${t}au`, roles: ['author']}],
        roles: {author: {permitMetadataEdit: true}}, metadata: {dataCitations: 'request'}});
    const S = await app.api.createSubmission({tag: `${t}s`, context: C.path, submitter: `${t}au`, title: `K4 gate ${t}`, citationsRaw: ['Gate ref one', 'Gate ref two'],
        dataCitations: [{title: 'Gate Dataset', relationshipType: 'analyzed'}]});
    const P = await app.api.createSubmission({tag: `${t}p`, context: C.path, submitter: `${t}au`, title: `K4 gate published ${t}`, published: true,
        citationsRaw: ['Gate pub ref one'], dataCitations: [{title: 'Gate Pub Dataset', relationshipType: 'analyzed'}]});
    await signIn(page, `${t}au`, {contextPath: C.path});
    for (const [key, sub] of [['unpublished', S], ['published', P]]) {
        const o = {};
        await h.gotoWorkflow(C.path, sub.submissionId, {author: true});
        o.menu = await h.menuLinks();
        o.opened = await h.openReferences();
        await h.snap(`gate-${key}-refs`);
        if (o.opened) {
            o.page = await h.refsPage();
            o.menuItems = await h.menuItems(key === 'published' ? 'Gate pub ref one' : 'Gate ref one');
            if (o.page.add.present && !o.page.add.disabled) {
                try {
                    o.add = await h.addLines(`Gate author added ${key}`);
                    o.add.rows = o.add.rows && o.add.rows.map((r) => r.text);
                } catch (e) {
                    o.add = {error: String(e.message).split('\n')[0].slice(0, 200), url: page.url(), dialogs: await page.locator('[role="dialog"]:visible').count()};
                    await h.snap(`gate-${key}-add-error`);
                    await h.gotoWorkflow(C.path, sub.submissionId, {author: true});
                }
            }
        }
        o.dataOpened = await h.openData();
        await h.snap(`gate-${key}-data`);
        o.dataAdd = await wf(page).getByRole('button', {name: 'Add Data Citation', exact: true}).isVisible().catch(() => false);
        o.dataRows = await h.dataRows();
        out[key] = o;
    }
    await signOut(page);
    return out;
}

async function endOwnManagerRole(app, page, h, ctx) {
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
    rem.rolesBefore = await page.locator('tr').filter({has: page.getByRole('button', {name: /Remove Role/i})}).evaluateAll((els) => els.map((e) => e.innerText.replace(/\s+/g, ' ').trim())).catch(() => []);
    await h.snap('adm-01-admin-edit-page');
    const roleRow = page.locator('tr').filter({hasText: /manager/i}).filter({has: page.getByRole('button', {name: /Remove Role/i})}).first();
    if (await roleRow.count()) {
        await roleRow.getByRole('button', {name: /Remove Role/i}).click();
        await idle(page);
        const dlg = page.locator('[role="dialog"]:visible').filter({hasText: /Remove Role/i}).last();
        await dlg.waitFor({state: 'visible', timeout: 15000}).catch(() => {});
        const m = h.mark();
        await dlg.getByRole('button', {name: /^Remove Role$/i}).click().catch(() => {});
        await idle(page); await sleep(1200);
        rem.traffic = h.since(m).filter((x) => x[0] !== 'GET');
        rem.rolesAfter = await page.locator('tr').filter({has: page.getByRole('button', {name: /Remove Role/i})}).evaluateAll((els) => els.map((e) => e.innerText.replace(/\s+/g, ' ').trim())).catch(() => []);
        await h.snap('adm-02-admin-after-remove');
    } else rem.noManagerRow = true;
    return rem;
}

async function partAdmin(app, page, h) {
    const out = {};
    const t = tag('u42k4a');
    const left = app.name === 'ops' ? 'editorialBoardMember' : 'copyeditor';
    out.roleLeft = left;
    const C = await app.api.createContext({tag: t, users: [{username: `${t}mg`, roles: ['manager']}, {username: `${t}au`, roles: ['author']},
        {username: 'admin', roles: [left], givenName: 'Site', familyName: 'Admin'}], metadata: {dataCitations: 'request'}});
    const S = await app.api.createSubmission({tag: `${t}s`, context: C.path, submitter: `${t}au`, title: `K4 admin ${t}`, citationsRaw: ['Admin ref one', 'Admin ref two']});
    await signIn(page, 'admin', {contextPath: C.path});
    out.remove = await endOwnManagerRole(app, page, h, C.path);
    await signOut(page).catch(() => {});
    await signIn(page, 'admin', {contextPath: C.path});
    await h.gotoWorkflow(C.path, S.submissionId);
    out.menu = await h.menuLinks();
    const s0 = await h.snap('adm-03-workflow');
    out.workflowText = flat(s0.text && s0.text.dialog, 400);
    out.opened = await h.openReferences();
    await h.snap('adm-04-refs');
    if (out.opened) {
        out.page = await h.refsPage();
        out.menuItems = await h.menuItems('Admin ref one');
        if (out.page.add.present && !out.page.add.disabled) {
            out.add = await h.addLines('Admin added line');
            const as = await h.snap('adm-05-after-add');
            out.add.dialogText = flat(as.text && as.text.dialog, 1200);
            out.add.errors = await wf(page).locator('.pkpFieldError, [role="alert"], .pkpNotification').allInnerTexts().catch(() => []);
            out.add.status2 = await wf(page).locator('[role="status"]').allInnerTexts().catch(() => []);
            out.add.boxAfter = await h.box().first().inputValue().catch(() => null);
            await h.gotoWorkflow(C.path, S.submissionId);
            await h.openReferences();
            out.add.rowsAfterReload = (await h.settledRows()).map((r) => r.text);
        }
    }
    out.dataOpened = await h.openData();
    await h.snap('adm-06-data');
    const addDc = wf(page).getByRole('button', {name: 'Add Data Citation', exact: true});
    out.dataAddOffered = await addDc.isVisible().catch(() => false);
    if (out.dataAddOffered) {
        await addDc.click();
        const dp = page.getByRole('dialog', {name: 'Add Data Citation'});
        await dp.waitFor({state: 'visible', timeout: T}).catch(() => {});
        await idle(page);
        await dp.getByRole('textbox', {name: /^Title/}).fill('Admin dataset');
        await dp.getByRole('combobox', {name: /^Relationship type/}).selectOption({index: 1}).catch(() => {});
        const m = h.mark();
        const saved = page.waitForResponse((r) => /dataCitations/.test(r.url()) && r.request().method() !== 'GET', {timeout: 10000}).catch(() => null);
        await dp.getByRole('button', {name: 'Save', exact: true}).click();
        const sr = await saved;
        await sleep(1500);
        await idle(page);
        out.dataAdd = {status: sr ? sr.status() : 'no request', traffic: h.since(m), panelOpen: await dp.isVisible().catch(() => false),
            panelText: flat(await dp.innerText().catch(() => null), 600)};
        await h.snap('adm-07-data-after-save');
        if (out.dataAdd.panelOpen) await dp.getByRole('button', {name: 'Close', exact: true}).first().click().catch(() => {});
        await h.gotoWorkflow(C.path, S.submissionId);
        await h.openData();
        out.dataRowsAfterReload = await h.dataRows();
    }
    // The settings screen for this Site Administrator (no manager role here).
    const r = await h.openMetadataSettings(C.path);
    const ss = await h.snap('adm-08-settings');
    out.settings = {status: r.status, url: r.url, metadataTab: r.metadataTab, text: flat(ss.text && ss.text.main, 300)};
    await signOut(page);
    return out;
}

async function partSidefx(app, page, h) {
    const out = {};
    const t = tag('u42k4x');
    const C = await app.api.createContext({tag: t, users: [{username: `${t}mg`, roles: ['manager']}, {username: `${t}au`, roles: ['author']}], metadata: {dataCitations: 'request'}});
    const S = await app.api.createSubmission({tag: `${t}s`, context: C.path, submitter: `${t}au`, title: `K4 side effects ${t}`, citationsRaw: ['Side ref one', 'Side ref two'],
        dataCitations: [{title: 'Side Dataset One', relationshipType: 'analyzed'}, {title: 'Side Dataset Two', relationshipType: 'generated'}]});
    const mails = async () => ({mg: await app.mail.count({to: `${t}mg@mail.test`}).catch((e) => String(e.message)), au: await app.mail.count({to: `${t}au@mail.test`}).catch((e) => String(e.message))});
    const logRows = async (name) => {
        const header = page.locator('[data-cy="sidemodal-header"]').first();
        const btn = header.getByRole('button', {name: 'Activity Log', exact: true});
        if (!(await btn.count())) return {button: false};
        await btn.click();
        const lg = page.getByRole('dialog').filter({has: page.locator('.pkp_controllers_informationCenter')}).last();
        await lg.waitFor({timeout: T}).catch(() => {});
        await lg.locator('table tbody tr').first().waitFor({timeout: 45000}).catch(() => {});
        await idle(page); await sleep(400);
        await h.snap(name);
        const rows = await lg.locator('table').first().locator('tbody tr.gridRow').evaluateAll((trs) => trs.map((tr) => tr.innerText.replace(/\s+/g, ' ').split('$(function')[0].trim())).catch(() => []);
        await lg.getByRole('button', {name: 'Close', exact: true}).first().click().catch(() => {});
        await lg.waitFor({state: 'hidden', timeout: 15000}).catch(() => {});
        await sleep(600);
        return {count: rows.length, rows};
    };
    const tasksOf = async (name) => {
        await page.goto(app.url(`/index.php/${C.path}/dashboard/mySubmissions`)).catch(() => {});
        await idle(page);
        const s = await h.snap(name);
        const hdr = await page.locator('header, [role="banner"]').first().innerText().catch(() => null);
        const tasks = await page.getByRole('button', {name: /Tasks|Notifications/i}).allInnerTexts().catch(() => []);
        return {header: flat(hdr, 300), tasks, main: flat(s.text && s.text.main, 300)};
    };
    out.mailBefore = await mails();
    await signIn(page, `${t}au`, {contextPath: C.path});
    out.authorBefore = await tasksOf('fx-01-author-before');
    await signOut(page);
    await signIn(page, `${t}mg`, {contextPath: C.path});
    out.mgBefore = await tasksOf('fx-02-manager-before');
    await h.gotoWorkflow(C.path, S.submissionId);
    out.logBefore = await logRows('fx-03-log-before');
    await h.gotoWorkflow(C.path, S.submissionId);
    await h.openReferences();
    out.add = await h.addLines('Side ref three');
    // Edit the raw text (lookup off).
    try {
        await h.openEdit('Side ref one');
        await h.panel().getByRole('textbox').first().fill('Side ref one, edited');
        const put = page.waitForResponse((r) => /\/citations\/\d+$/.test(r.url().split('?')[0]) && r.request().method() !== 'GET', {timeout: 10000}).catch(() => null);
        await h.panel().getByRole('button', {name: 'Save', exact: true}).click();
        const pr = await put; out.edit = pr ? pr.status() : 'no request';
        await h.panel().waitFor({state: 'detached', timeout: 10000}).catch(() => {});
        await idle(page);
    } catch (e) { out.edit = String(e.message).slice(0, 200); }
    out.del = await h.deleteRow('Side ref two');
    await h.snap('fx-04-refs-after');
    // Data citations: edit one, delete one, order + save.
    await h.openData();
    try {
        const row = page.locator('table:visible tbody tr').filter({hasText: 'Side Dataset One'}).first();
        await row.getByRole('button', {name: /More Actions/i}).click();
        await page.getByRole('menuitem', {name: 'Edit', exact: true}).click();
    } catch (e) { out.dcEditOpenErr = String(e.message).slice(0, 200); }
    const ep = page.getByRole('dialog', {name: 'Edit Data Citation'});
    if (await ep.waitFor({state: 'visible', timeout: 10000}).then(() => true).catch(() => false)) {
        await idle(page);
        await ep.getByRole('textbox', {name: /^Title/}).fill('Side Dataset One edited');
        const sr = page.waitForResponse((r) => /dataCitations/.test(r.url()) && r.request().method() !== 'GET', {timeout: 10000}).catch(() => null);
        await ep.getByRole('button', {name: 'Save', exact: true}).click();
        const r = await sr; out.dcEdit = r ? r.status() : 'no request';
        await ep.waitFor({state: 'detached', timeout: 10000}).catch(() => {});
        await idle(page); await sleep(1000);
    }
    // Add one data citation.
    const addDc = wf(page).getByRole('button', {name: 'Add Data Citation', exact: true});
    if (await addDc.isVisible().catch(() => false)) {
        await addDc.click();
        const dp = page.getByRole('dialog', {name: 'Add Data Citation'});
        await dp.waitFor({state: 'visible', timeout: T}).catch(() => {});
        await idle(page);
        await dp.getByRole('textbox', {name: /^Title/}).fill('Side Dataset Three');
        await dp.getByRole('combobox', {name: /^Relationship type/}).selectOption({index: 1}).catch(() => {});
        const sr = page.waitForResponse((r) => /dataCitations/.test(r.url()) && r.request().method() !== 'GET', {timeout: 10000}).catch(() => null);
        await dp.getByRole('button', {name: 'Save', exact: true}).click();
        const r = await sr; out.dcAdd = r ? r.status() : 'no request';
        await dp.waitFor({state: 'detached', timeout: 10000}).catch(() => {});
        await idle(page); await sleep(1000);
    }
    const dcRow = page.locator('table:visible tbody tr').filter({hasText: 'Side Dataset Two'}).first();
    if (await dcRow.count()) {
        await dcRow.getByRole('button', {name: /More Actions/i}).click().catch(() => {});
        await page.getByRole('menuitem', {name: 'Delete', exact: true}).click().catch(() => {});
        const dd = page.getByRole('dialog').filter({hasText: 'Are you sure you wish to delete this item?'}).last();
        if (await dd.waitFor({state: 'visible', timeout: 8000}).then(() => true).catch(() => false)) {
            const r = page.waitForResponse((x) => /dataCitations/.test(x.url()) && x.request().method() !== 'GET', {timeout: 10000}).catch(() => null);
            await dd.getByRole('button', {name: 'OK', exact: true}).click();
            const rr = await r; out.dcDelete = rr ? rr.status() : 'no request';
            await idle(page); await sleep(800);
        }
    }
    const order = wf(page).getByRole('button', {name: 'Order', exact: true});
    if (await order.isVisible().catch(() => false)) {
        await order.click(); await sleep(400);
        const r = page.waitForResponse((x) => /dataCitations/.test(x.url()) && x.request().method() !== 'GET', {timeout: 10000}).catch(() => null);
        await wf(page).getByRole('button', {name: 'Save Order', exact: true}).click().catch(() => {});
        const rr = await r; out.dcOrder = rr ? rr.status() : 'no request';
        await idle(page);
    }
    await h.snap('fx-05-data-after');
    out.traffic = h.traffic.filter((x) => x.m !== 'GET').map((x) => [x.override || x.m, x.url.split('?')[0], x.status]);
    await h.gotoWorkflow(C.path, S.submissionId);
    out.logAfter = await logRows('fx-06-log-after');
    out.mgAfter = await tasksOf('fx-07-manager-after');
    await signOut(page);
    await signIn(page, `${t}au`, {contextPath: C.path});
    out.authorAfter = await tasksOf('fx-08-author-after');
    await signOut(page);
    await sleep(2000);
    out.mailAfter = await mails();
    return out;
}

async function partExports(app, page, h) {
    const out = {};
    const t = tag('u42k4e');
    const C = await app.api.createContext({tag: t, users: [{username: `${t}mg`, roles: ['manager']}, {username: `${t}au`, roles: ['author']}], metadata: {dataCitations: 'request'}});
    const P = await app.api.createSubmission({tag: `${t}p`, context: C.path, submitter: `${t}au`, title: `K4 exports ${t}`, published: true,
        citationsRaw: ['Export ref one 2020', 'Export ref two https://doi.org/10.1234/k4exp'],
        dataCitations: [{title: 'K4 Export Dataset', relationshipType: 'generated', identifierType: 'DOI', identifier: '10.1234/k4expds'}]});
    await signIn(page, `${t}mg`, {contextPath: C.path});
    await h.gotoWorkflow(C.path, P.submissionId);
    out.menu = await h.menuLinks();
    await h.snap('exp-01-workflow');
    // OJS Body Text: the References section of the editor's side panel.
    if (await h.openEntry('Body Text')) {
        await page.locator('.sciflow-body-text__sidebar').first().waitFor({timeout: T}).catch(() => {});
        await idle(page); await sleep(1500);
        const summaries = await page.locator('.sciflow-body-text__sidebar-summary').allInnerTexts().catch(() => []);
        out.bodyText = {summaries: summaries.map((x) => flat(x, 80))};
        const refSum = page.locator('.sciflow-body-text__sidebar-summary').filter({hasText: /References/}).first();
        if (await refSum.count()) {
            const det = page.locator('details[data-sidebar-section="references"]').first();
            if (!(await det.evaluate((e) => e.open).catch(() => false))) { await refSum.click().catch(() => {}); await sleep(600); }
            out.bodyText.referencesText = flat(await det.innerText().catch(() => null), 1200);
            out.bodyText.referencesShadow = await page.evaluate(() => {
                const el = document.querySelector('sciflow-reference-list');
                if (!el) return null;
                const root = el.shadowRoot || el;
                return (root.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 1200);
            }).catch(() => null);
        }
        await h.snap('exp-02-body-text');
    } else out.bodyText = {entry: false};
    // OJS JATS: the page's own GET of the generated JATS.
    await h.gotoWorkflow(C.path, P.submissionId);
    const jatsResp = page.waitForResponse((r) => /\/publications\/\d+\/jats/.test(r.url()) && r.request().method() === 'GET', {timeout: 20000}).catch(() => null);
    if (await h.openEntry('JATS XML') || await h.openEntry('JATS')) {
        const r = await jatsResp;
        out.jats = {status: r ? r.status() : 'no request'};
        if (r) {
            try {
                const b = await r.json();
                const xml = (b && (b.jatsContent || '')) || '';
                out.jats.len = xml.length;
                out.jats.hasRefOne = xml.includes('Export ref one 2020');
                out.jats.hasRefTwo = xml.includes('Export ref two');
                out.jats.hasDataCitation = xml.includes('K4 Export Dataset');
                out.jats.hasDataDoi = xml.includes('10.1234/k4expds');
                out.jats.refList = (xml.match(/<ref-list[\s\S]{0,1500}/) || [null])[0];
                out.jats.dataRef = (xml.match(/[\s\S]{0,300}K4 Export Dataset[\s\S]{0,300}/) || [null])[0];
            } catch (e) { out.jats.parse = String(e.message).slice(0, 200); }
        }
        await h.snap('exp-03-jats');
    } else out.jats = {entry: false};
    // Native XML export (Tools › Import/Export › Native XML Plugin › Export Submissions).
    const nx = {};
    const resp = await page.goto(app.url(`/index.php/${C.path}/management/importexport/plugin/NativeImportExportPlugin`)).catch((e) => ({err: String(e.message)}));
    nx.status = resp && resp.status ? resp.status() : resp;
    await idle(page);
    await h.snap('exp-04-native');
    const tab = page.getByRole('link', {name: /^Export( (Articles|Submissions|Monographs|Preprints))?$/}).first();
    if (await tab.count()) {
        await tab.click(); await idle(page); await sleep(1000);
        const cb = page.locator('[role="tabpanel"]:visible input[type="checkbox"]').first();
        await cb.waitFor({state: 'visible', timeout: 20000}).catch(() => {});
        nx.checkboxes = await page.locator('[role="tabpanel"]:visible input[type="checkbox"]').count();
        await h.snap('exp-05-native-export-tab');
        if (nx.checkboxes) {
            await cb.check().catch(() => {});
            const dl = page.waitForEvent('download', {timeout: 30000}).catch(() => null);
            nx.buttons = await page.locator('[role="tabpanel"]:visible').getByRole('button').allInnerTexts().catch(() => []);
            await page.locator('[role="tabpanel"]:visible').getByRole('button', {name: /^Export( (Articles|Submissions|Monographs|Preprints))?$/}).click().catch((e) => { nx.clickErr = String(e.message).slice(0, 200); });
            let d = await Promise.race([dl, page.getByText('Download Exported File').first().waitFor({timeout: 30000}).then(() => null).catch(() => null)]);
            if (!d) {
                await idle(page);
                const s0 = await h.snap('exp-06-native-results');
                nx.results = flat(s0.text && (s0.text.dialog || s0.text.main), 400);
                const btn = page.getByRole('button', {name: 'Download Exported File'}).or(page.getByRole('link', {name: 'Download Exported File'})).first();
                if (await btn.count()) {
                    const dl2 = page.waitForEvent('download', {timeout: 30000}).catch(() => null);
                    await btn.click().catch((e) => { nx.dlErr = String(e.message).slice(0, 200); });
                    d = await dl2;
                }
            }
            if (d) {
                const p = await d.path().catch(() => null);
                const xml = p ? require('fs').readFileSync(p, 'utf8') : '';
                nx.file = d.suggestedFilename();
                nx.len = xml.length;
                nx.hasRefOne = xml.includes('Export ref one 2020');
                nx.hasDataCitation = xml.includes('K4 Export Dataset');
                nx.citationsEl = (xml.match(/<citations[\s\S]{0,600}/) || [null])[0];
                nx.dataCitationEl = /dataCitation|data-citation|data_citation/i.test(xml);
            } else {
                await idle(page);
                const s = await h.snap('exp-06-native-after-export');
                nx.after = {url: s.url, text: flat(s.text && s.text.main, 600)};
            }
        }
    } else nx.tab = false;
    out.native = nx;
    await signOut(page);
    return out;
}

// ---------------------------------------------------------------------------

forEachApp(async (app) => {
    const {page, close} = await launch(app);
    const h = helpers(app, page);
    const parts = {settings: partSettings, wizard: partWizard, rail: partRail, lookupoff: partLookupOff, a7: partA7, landing: partLanding, versions: partVersions, gate: partGate, admin: partAdmin, sidefx: partSidefx, exports: partExports};
    try {
        for (const p of ALL) {
            if (!on(p)) continue;
            const d0 = h.dialogs.length;
            let res;
            try {
                res = await parts[p](app, page, h);
            } catch (e) {
                res = {error: String(e.stack || e.message).slice(0, 1500)};
                log('[error]', app.name, p, res.error);
                await h.snap(`error-${p}`).catch(() => {});
                await signOut(page).catch(() => {});
            }
            res.browserDialogs = h.dialogs.slice(d0);
            record(p, res);
            log(app.name, p, 'done');
        }
    } finally {
        await close();
    }
});
