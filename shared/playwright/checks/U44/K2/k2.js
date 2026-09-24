// U44 claim check, chunk K2: URN configuration and the article's "Identifiers" page {OJS OMP},
// with a read-only control on OPS (a preprint server has no URN plugin).
// Spec: docs/specs/U44-identifiers.md — the URN plugin's settings window (Fields, 69–87), the
// "Identifiers" page (88–93), Rules 7–11 (153–201), Rule 18 "Reassign URNs" (267–271), Rule 20 plugin
// off (276–280), Settings bullets 2–6 (312–330), register A4, A6, A8, OMP1; footnotes b, c, q6, q8,
// q10, q13, q15, q17, q18, q21, f-a4, f-a6, f-a8, f-omp1.
//
//   PROBE_FEATURE=U44 PROBE_AGENT=ccK2 node bin/probe.js all shared/playwright/checks/U44/K2/k2.js
//   PHASES=seed,win,def,own,cus,pub,a6,ops (default: all); later phases read k2-state-<app>.json.
//   A full run outlasts the Bash cap: launch it detached (nohup … &) and poll the pid.
//
// Scratch contexts per app (OJS, OMP; OPS only the control):
//   win  the plugin untouched: the Plugins row, the settings window's defaults and refusals (none
//        ticked, a bad prefix, a bad resolver, an empty own pattern A8, an empty Namespace q21, OMP1
//        on a press), the on-screen enable + save with a non-article kind, then with Articles/Monographs
//        (Rule 7), the unsaved-leave of the window, "Reassign URNs" › cancel; no acronym, so the
//        default pattern's initials part is missing (sweep).
//   def  seeded plugin on, default patterns, all kinds, no check number, acronym "JPK"; OJS issues Vol 1
//        No 2 (2014, published) and Vol 2 No 1 (2015). Pattern shape: missing issue, Assign, leave
//        unsaved, Save, Clear, Save; then Check Number ticked on screen and Assign again (A6).
//   own  seeded plugin on, own pattern "%j.%x" for articles, publisher IDs on for publications:
//        the missing-parts message, then a publisher ID typed, then Assign.
//   cus  seeded plugin on, individual suffix, check number on: the individual shape, "Add Check
//        Number" (A6, q8), Save refusals (prefix, another submission's URN q18, own URN A4), empty box,
//        "Create New Version" (q6, Rule 7 per version); Check Number unticked on screen (the other end).
//   pub  (def context) a published article (OJS: with a galley) carrying a URN: reader page, plugin off
//        and on (Rule 20, q13), then "Reassign URNs" › "Delete" (Rule 18, q17); on OJS the cus
//        context's galley with a typed suffix is read after its own Reassign.
//   a6   (OJS, def context) Check Number on: the digit a galley's tab previews vs the one "Assign" gives.
//   ops  the control: Plugins grid (no URN row), a preprint's menu (no "Identifiers"), the seed key 400.
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, screen, shot, record, loc, note, idle, tag, outDir, settled} = require('../../../probe');

const T = 30_000;
const ALL = ['seed', 'win', 'def', 'own', 'cus', 'pub', 'a6', 'ops'];
const PHASES = (process.env.PHASES || ALL.join(',')).split(',');
const on = (p) => PHASES.includes(p);
const log = (...a) => console.log('[k2]', ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (s, n = 4000) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));
const wf = (page) => page.locator('[role="dialog"]:visible').first();
const PREFIX = 'urn:nbn:de:0000-';
const RESOLVER = 'https://nbn-resolving.de/';

function statePath(app) { return path.join(outDir(), `k2-state-${app.name}.json`); }
function loadState(app) { return JSON.parse(fs.readFileSync(statePath(app), 'utf8')); }
function saveState(app, S) { fs.writeFileSync(statePath(app), JSON.stringify(S, null, 2)); }

/** The check digit as plugins/pubIds/urn/js/checkNumber.js computes it, over the text given. */
function checkDigit(text) {
    const table = {'9': '41', '8': '9', '7': '8', '6': '7', '5': '6', '4': '5', '3': '4', '2': '3', '1': '2', '0': '1', a: '18', b: '14', c: '19', d: '15', e: '16', f: '21', g: '22', h: '23', i: '24', j: '25', k: '42', l: '26', m: '27', n: '13', o: '28', p: '29', q: '31', r: '12', s: '32', t: '33', u: '11', v: '34', w: '35', x: '36', y: '37', z: '38', '-': '39', ':': '17', _: '43', '/': '45', '.': '47', '+': '49'};
    const digits = [...text.toLowerCase()].map((c) => table[c]).join('');
    let sum = 0;
    for (let j = 1; j <= digits.length; j++) sum += Number(digits[j - 1]) * j;
    const last = Number(digits[digits.length - 1]);
    const q = String(Math.floor(sum / last));
    return Number(q[q.length - 1]);
}

// ---------------------------------------------------------------------------
// Snapshots

async function snap(page, name, extra = {}) {
    const s = await screen(page);
    Object.assign(s, extra);
    record(name, s);
    await shot(page, name).catch(() => {});
    return s;
}

async function buttonState(locator) {
    const count = await locator.count().catch(() => 0);
    if (!count) return {count};
    const el = locator.first();
    return {count, visible: await el.isVisible().catch(() => null), enabled: await el.isEnabled().catch(() => null), text: flat(await el.innerText().catch(() => ''))};
}

// ---------------------------------------------------------------------------
// Settings › Website › Plugins and the URN settings window

const urnRow = (page) => page.locator('#pluginGridContainer tr.gridRow[id$="-row-urnpubidplugin"]');

async function gotoPlugins(page, app, ctx) {
    await page.goto(app.url(`/index.php/${ctx}/management/settings/website`));
    await idle(page);
    await page.locator('#plugins-button').click();
    await page.locator('#pluginGridContainer tr.gridRow').first().waitFor({timeout: T});
    await idle(page);
    await sleep(300);
}

/** The Plugins grid: the categories, and the URN row (text, box, whether a "Settings" action shows once expanded). */
async function pluginsRead(page, name) {
    const grid = page.locator('#pluginGridContainer');
    const data = await grid.evaluate((root) => {
        const t = (e) => (e ? e.innerText.replace(/\s+/g, ' ').trim() : null);
        const cats = [...root.querySelectorAll('tr.category, tr[class*="category"]')].map(t);
        const rows = [...root.querySelectorAll('tr.gridRow')];
        const urn = rows.find((r) => /-row-urnpubidplugin$/.test(r.id));
        const pubIdsRows = rows.filter((r) => /category-pubIds-row-/i.test(r.id)).map((r) => ({id: r.id, text: t(r)}));
        return {categories: cats, pubIdsRows, urnRow: urn ? {id: urn.id, text: t(urn), checked: urn.querySelector('input[type=checkbox]')?.checked ?? null, expander: !!urn.querySelector('a.show_extras')} : null};
    });
    return data;
}

async function urnRowControls(page) {
    const row = urnRow(page);
    const expander = row.locator('a.show_extras').first();
    if (await expander.count()) { await expander.click(); await sleep(400); }
    const controls = page.locator('#pluginGridContainer tr[id$="-row-urnpubidplugin"] + tr');
    const links = await controls.locator('a').evaluateAll((els) => els.filter((e) => e.offsetParent !== null).map((e) => e.innerText.trim()).filter(Boolean)).catch(() => []);
    return {links, controls};
}

async function setUrnEnabled(page, want) {
    const box = urnRow(page).getByRole('checkbox').first();
    const before = await box.isChecked();
    const out = {before, want, status: null, dialog: null, toast: []};
    if (before === want) return out;
    const w = page.waitForResponse((r) => /settings-plugin-grid\/(enable|disable)/.test(r.url()), {timeout: T}).catch(() => null);
    await box.click({noWaitAfter: true}).catch(() => box.dispatchEvent('click'));
    // Disabling asks first in some installs; record and answer the question.
    const dlg = page.locator('[role="dialog"]:visible');
    await sleep(600);
    if (await dlg.count()) {
        out.dialog = flat(await dlg.last().innerText().catch(() => null), 400);
        const ok = dlg.last().getByRole('button', {name: /^(OK|Yes)$/}).first();
        if (await ok.count()) await ok.click();
    }
    const resp = await w;
    out.status = resp ? resp.status() : null;
    await sleep(600);
    await idle(page);
    out.toast = await page.locator('.pkpNotification, [role="status"], [role="alert"]').allInnerTexts().catch(() => []);
    out.after = await urnRow(page).getByRole('checkbox').first().isChecked().catch(() => null);
    return out;
}

const win = (page) => page.locator('#urnSettingsForm');

async function openUrnSettings(page, app, ctx) {
    await gotoPlugins(page, app, ctx);
    const {links, controls} = await urnRowControls(page);
    const settings = controls.getByRole('link', {name: 'Settings', exact: true}).first();
    await loc(page, 'Website › Plugins: the URN row\'s "Settings" action (after the row\'s arrow)', settings);
    await settings.click();
    await win(page).locator('input[name="urnPrefix"]').waitFor({state: 'visible', timeout: T});
    await idle(page);
    await sleep(400);
    return {links};
}

/** Everything the settings window shows, as data. */
async function winState(page) {
    const dialog = page.locator('[role="dialog"]:visible').filter({has: page.locator('#urnSettingsForm')}).last();
    const title = await dialog.locator('h1, h2, .pkp_modal_title, [class*="title"]').first().innerText().catch(() => null);
    const form = await win(page).evaluate((root) => {
        const t = (e) => (e ? e.innerText.replace(/\s+/g, ' ').trim() : null);
        const lab = (i) => {
            const l = root.querySelector(`label[for="${i.id}"]`) || i.closest('label');
            return l ? t(l) : null;
        };
        return {
            description: t(document.querySelector('#description')),
            areas: [...root.querySelectorAll('fieldset, .section')].map((f) => t(f.querySelector('legend, .label, h3'))).filter(Boolean),
            checkboxes: [...root.querySelectorAll('input[type=checkbox]')].map((i) => ({name: i.name, label: lab(i), checked: i.checked, disabled: i.disabled})),
            radios: [...root.querySelectorAll('input[type=radio]')].map((i) => ({name: i.name, value: i.value, label: lab(i), checked: i.checked, disabled: i.disabled})),
            texts: [...root.querySelectorAll('input[type=text], input:not([type])')].map((i) => ({name: i.name, id: i.id, label: lab(i), value: i.value, disabled: i.disabled, readOnly: i.readOnly, required: i.required || i.classList.contains('required')})),
            selects: [...root.querySelectorAll('select')].map((s) => ({name: s.name, label: lab(s), value: s.value, required: s.required || s.classList.contains('required'), options: [...s.options].map((o) => ({value: o.value, text: o.text}))})),
            buttons: [...root.querySelectorAll('button, input[type=submit], a.pkp_controllers_linkAction, a')].filter((b) => b.offsetParent !== null).map((b) => flatText(b)),
            errors: {
                summary: t(root.querySelector('#formErrors, .pkp_form_error, .formErrors')),
                fields: [...root.querySelectorAll('label.error, .error, [class*="error"]')].filter((e) => e.offsetParent !== null).map(t).filter(Boolean),
                labels: [...root.querySelectorAll('label.error')].filter((e) => e.offsetParent !== null).map((e) => ({for: e.getAttribute('for'), text: t(e)})),
                invalid: [...root.querySelectorAll('[aria-invalid="true"], input.error, select.error')].map((e) => e.name),
                listed: [...root.querySelectorAll('#formErrors li, .pkp_form_error li, ul.formErrorList li')].map(t),
            },
            help: [...root.querySelectorAll('.pkp_help, .instruct, .description')].map(t).filter(Boolean),
            text: t(root),
        };
        function flatText(b) { return (b.innerText || b.value || '').replace(/\s+/g, ' ').trim(); }
    });
    return {open: await win(page).isVisible().catch(() => false), title: title ? flat(title) : null, dialogText: flat(await dialog.innerText().catch(() => null), 6000), ...form};
}

/** Set boxes/radios/texts by name, then press the window's "Save"; returns what happened. */
async function winSave(page, set = {}, name) {
    const f = win(page);
    for (const [k, v] of Object.entries(set.boxes || {})) {
        const box = f.locator(`input[type=checkbox][name="${k}"]`);
        if ((await box.isChecked()) !== v) await box.click();
    }
    if (set.suffix) await f.locator(`input[type=radio][name="urnSuffix"][value="${set.suffix}"]`).check();
    for (const [k, v] of Object.entries(set.texts || {})) {
        const box = f.locator(`input[name="${k}"]`);
        if (await box.isDisabled()) continue;
        await box.fill(v);
    }
    if (set.namespace !== undefined) await f.locator('select[name="urnNamespace"]').selectOption(set.namespace);
    const before = await winState(page);
    const posts = [];
    const onReq = (r) => { if (r.method() === 'POST' && /manage/.test(r.url())) posts.push(r.url()); };
    page.on('request', onReq);
    const w = page.waitForResponse((r) => r.request().method() === 'POST' && /manage/.test(r.url()), {timeout: 10_000}).catch(() => null);
    await f.getByRole('button', {name: 'Save', exact: true}).click();
    const resp = await w;
    page.off('request', onReq);
    let json = null;
    try { json = resp ? await resp.json() : null; } catch { json = null; }
    await sleep(900);
    await idle(page);
    const stillOpen = await win(page).isVisible().catch(() => false);
    const notices = await page.locator('.pkpNotification, .ui-pnotify, [role="alert"], [role="status"]').allInnerTexts().catch(() => []);
    const out = {set, posted: posts.length, status: resp ? resp.status() : null, jsonStatus: json && json.status, stillOpen, notices: notices.map((n) => flat(n)).filter(Boolean), after: stillOpen ? await winState(page) : null, beforeTexts: before.texts};
    if (name) await snap(page, name, {winSave: out});
    return out;
}

async function winCancel(page) {
    const f = win(page);
    const cancel = f.getByRole('link', {name: 'Cancel', exact: true}).or(f.getByRole('button', {name: 'Cancel', exact: true})).first();
    if (await cancel.count()) await cancel.click();
    else await page.locator('[role="dialog"]:visible').last().getByRole('button', {name: /Close/}).first().click();
    await win(page).waitFor({state: 'hidden', timeout: 10_000}).catch(() => {});
    await idle(page);
    await sleep(600); // the modal store's 450 ms slot after a window close (patterns.md pitfall 4)
}

// ---------------------------------------------------------------------------
// The workflow and the "Identifiers" page

async function gotoVersionPage(page, app, ctx, sid, pid, key) {
    await page.goto(app.url(`/index.php/${ctx}/dashboard/editorial?workflowSubmissionId=${sid}&workflowMenuKey=publication_${pid}_${key}`));
    await idle(page);
    await wf(page).getByRole('heading').first().waitFor({state: 'visible', timeout: T}).catch(() => {});
    await idle(page);
    await sleep(500);
}

/** The side menu: every link's name, and the version groups with their entries. */
async function sideMenu(page) {
    const dialog = wf(page);
    const links = await dialog.locator('nav a, nav button, [role="tree"] a, [role="tree"] button').evaluateAll((els) =>
        els.map((e) => ({text: e.textContent.replace(/\s+/g, ' ').trim(), visible: e.offsetParent !== null, href: e.getAttribute('href')})).filter((e) => e.text),
    ).catch(() => []);
    const tree = await dialog.getByRole('treeitem').evaluateAll((els) => els.map((e) => ({label: (e.getAttribute('aria-label') || '').trim(), text: e.innerText.replace(/\s+/g, ' ').trim().slice(0, 300), expanded: e.getAttribute('aria-expanded')}))).catch(() => []);
    return {links, tree, identifiersLinks: links.filter((l) => l.text === 'Identifiers').length};
}

/** The URN field of the "Identifiers" page as data. */
async function urnField(page) {
    const dialog = wf(page);
    const data = await dialog.evaluate((root) => {
        const t = (e) => (e ? e.innerText.replace(/\s+/g, ' ').trim() : null);
        const fields = [...root.querySelectorAll('.pkpFormField')];
        const f = fields.find((x) => /\bURN\b/.test(t(x.querySelector('label, .pkpFormFieldLabel')) || ''));
        const form = root.querySelector('form.pkpForm, form');
        const heading = [...root.querySelectorAll('h1, h2')].map(t).filter(Boolean);
        if (!f) return {found: false, heading, formText: t(form), fieldLabels: fields.map((x) => t(x.querySelector('label'))).filter(Boolean)};
        const input = f.querySelector('input');
        return {
            found: true,
            heading,
            classes: f.className,
            label: t(f.querySelector('label')),
            description: t(f.querySelector('.pkpFormField__description')),
            value: input ? input.value : null,
            disabled: input ? input.disabled : null,
            buttons: [...f.querySelectorAll('button')].map((b) => ({text: t(b), disabled: b.disabled || b.getAttribute('aria-disabled') === 'true'})),
            text: t(f),
            errors: [...f.querySelectorAll('.pkpFieldError, [id$="-error"]')].map(t).filter(Boolean),
            formText: t(form),
            fieldLabels: fields.map((x) => t(x.querySelector('label'))).filter(Boolean),
        };
    }).catch((e) => ({error: String(e.message || e)}));
    data.save = await buttonState(wf(page).getByRole('button', {name: 'Save', exact: true}));
    data.summary = await wf(page).locator('.pkpFormPage__errors, .pkpFormErrors, [class*="formErrors"], .pkpFormPage__status').allInnerTexts().catch(() => []);
    data.banner = ((await wf(page).innerText().catch(() => '')) || '').split('\n').map((l) => l.trim()).filter((l) => /can not be edited|cannot be edited|has been published|Warning/i.test(l));
    return data;
}

/** Open a version's "Identifiers" page by address and read it (the form renders after its own fetch). */
async function readIdPage(page, app, ctx, sid, pid, name, extra = {}) {
    await gotoVersionPage(page, app, ctx, sid, pid, 'identifiers');
    const form = wf(page).locator('.pkpFormField').filter({hasText: 'URN'}).first();
    await form.waitFor({state: 'visible', timeout: 15_000}).catch(() => {});
    await idle(page);
    await sleep(400);
    const field = await urnField(page);
    const menu = await sideMenu(page);
    await snap(page, name, {urnField: field, menu, ...extra});
    log(name, JSON.stringify({value: field.value, disabled: field.disabled, buttons: field.buttons, desc: field.description, errors: field.errors, save: field.save, ids: menu.identifiersLinks}));
    return {field, menu};
}

const urnInput = (page) => wf(page).locator('.pkpFormField').filter({hasText: 'URN'}).first().locator('input').first();
const fieldButton = (page, name) => wf(page).locator('.pkpFormField').filter({hasText: 'URN'}).first().getByRole('button', {name, exact: true});

/** Press "Save" on the Publication page; returns the API status and what the page says after. */
async function pubSave(page, name) {
    const button = wf(page).getByRole('button', {name: 'Save', exact: true});
    const state = await buttonState(button);
    if (!state.count || !state.enabled) return {pressed: false, state};
    const w = page.waitForResponse((r) => /\/publications\/\d+/.test(r.url()) && r.request().method() === 'POST', {timeout: T}).catch(() => null);
    await button.click();
    const resp = await w;
    let body = null;
    try { body = resp ? await resp.json() : null; } catch { body = null; }
    await page.locator('[role="status"]:has-text("Saved")').first().waitFor({state: 'visible', timeout: 8_000}).catch(() => {});
    await sleep(600);
    const field = await urnField(page);
    const out = {pressed: true, status: resp ? resp.status() : null, errorKeys: body && body.errors ? Object.keys(body.errors) : null, apiErrors: body && body.errors ? body.errors : null, storedUrn: body && !body.errors ? (body['pub-id::other::urn'] ?? null) : undefined, footer: await wf(page).locator('[role="status"]').allInnerTexts().catch(() => []), field};
    if (name) await snap(page, name, {pubSave: out});
    log(name || 'save', JSON.stringify({status: out.status, errors: out.apiErrors, stored: out.storedUrn, fieldErrors: field.errors, summary: field.summary}));
    return out;
}

/** The publication as the API holds it, read through the page's own session (a GET the workflow sends too). */
async function pubRead(page, app, ctx, sid, pid) {
    return page.evaluate(async ({url}) => {
        const r = await fetch(url, {headers: {'X-Requested-With': 'XMLHttpRequest'}});
        const j = await r.json().catch(() => null);
        return j ? {status: r.status, urn: j['pub-id::other::urn'] ?? null, publisherId: j['pub-id::publisher-id'] ?? null, issueId: j.issueId ?? null, statusCode: j.status} : {status: r.status};
    }, {url: app.url(`/index.php/${ctx}/api/v1/submissions/${sid}/publications/${pid}`)});
}

// ---------------------------------------------------------------------------
// Seeding

function urnPlugin(settings) {
    return {urnpubidplugin: {enabled: true, settings: {urnPrefix: PREFIX, urnResolver: RESOLVER, urnNamespace: 'urn:nbn:de', ...settings}}};
}

async function seed(app) {
    const t = tag('u44k2');
    const S = {t, app: app.name};
    const isOJS = app.name === 'ojs';
    const users = (p) => [{username: `${p}mg`, roles: ['manager']}, {username: `${p}au`, roles: ['author']}];
    const issues = isOJS ? [{volume: 1, number: 2, year: 2014, published: true}, {volume: 2, number: 1, year: 2015}] : undefined;
    const kinds = isOJS ? {enableIssueURN: true, enablePublicationURN: true, enableRepresentationURN: true} : {enablePublicationURN: true, enableChapterURN: true, enableRepresentationURN: true, enableSubmissionFileURN: true};
    const sub = async (ctx, p, extra = {}) => app.api.createSubmission({tag: p, context: ctx, submitter: `${ctx}au`, ...extra});

    // win: nothing about the plugin; no acronym.
    S.win = await app.api.createContext({tag: `${t}w`, users: users(`${t}w`), issues});
    S.win.s1 = await sub(S.win.path, `${t}w1`);

    // def: default patterns, every kind, no check number.
    S.def = await app.api.createContext({tag: `${t}d`, context: {acronym: isOJS ? 'JPK' : 'PKP'}, users: users(`${t}d`), issues,
        plugins: urnPlugin({...kinds, urnSuffix: 'default', urnCheckNo: false})});
    S.def.s1 = await sub(S.def.path, `${t}d1`);
    S.def.s2 = await sub(S.def.path, `${t}d2`, isOJS ? {galleys: [{label: 'PDF', file: 'article.pdf'}]} : {});

    // own: own pattern with the publisher ID; publisher IDs on for publications.
    S.own = await app.api.createContext({tag: `${t}o`, context: {acronym: isOJS ? 'JPK' : 'PKP'}, users: users(`${t}o`), enablePublisherId: ['publication'],
        plugins: urnPlugin({enablePublicationURN: true, urnSuffix: 'pattern', urnPublicationSuffixPattern: isOJS ? '%j.%x' : '%p.%x', urnCheckNo: false})});
    S.own.s1 = await sub(S.own.path, `${t}o1`);

    // cus: individual suffix, check number on; galleys too on OJS (the typed-suffix read after Reassign).
    S.cus = await app.api.createContext({tag: `${t}c`, context: {acronym: isOJS ? 'JPK' : 'PKP'}, users: users(`${t}c`),
        plugins: urnPlugin({enablePublicationURN: true, enableRepresentationURN: true, urnSuffix: 'customId', urnCheckNo: true})});
    S.cus.s1 = await sub(S.cus.path, `${t}c1`);
    S.cus.s2 = await sub(S.cus.path, `${t}c2`);
    S.cus.s3 = await sub(S.cus.path, `${t}c3`, isOJS ? {galleys: [{label: 'PDF', file: 'article.pdf'}]} : {});
    S.cus.s4 = await sub(S.cus.path, `${t}c4`, {published: true});
    saveState(app, S);
    log('seeded', JSON.stringify({win: S.win.path, def: S.def.path, own: S.own.path, cus: S.cus.path,
        ids: ['win.s1', 'def.s1', 'def.s2', 'own.s1', 'cus.s1', 'cus.s2', 'cus.s3', 'cus.s4'].map((k) => { const [c, s] = k.split('.'); return `${k}=${S[c][s].submissionId}/${S[c][s].publicationId}`; })}));
    return S;
}

// ---------------------------------------------------------------------------
// Phase win: the Plugins row and the settings window, on a context where nobody touched the plugin

async function phaseWin(app, S, page) {
    const ctx = S.win.path;
    const n = (x) => `w-${x}`;
    const isOMP = app.name === 'omp';
    await signIn(page, `${ctx}mg`, {contextPath: ctx});

    // The Identifiers page before anything: listed or not.
    await readIdPage(page, app, ctx, S.win.s1.submissionId, S.win.s1.publicationId, n('01-idpage-plugin-untouched'));

    await gotoPlugins(page, app, ctx);
    const grid = await pluginsRead(page);
    const ctl0 = await urnRowControls(page);
    await snap(page, n('02-plugins-untouched'), {grid, rowLinks: ctl0.links});
    log('plugins untouched', JSON.stringify(grid.urnRow), 'links', JSON.stringify(ctl0.links));
    await loc(page, 'Website › Plugins: the URN row', urnRow(page));
    await loc(page, 'Website › Plugins: the URN row\'s Enabled box', urnRow(page).getByRole('checkbox'));

    // Enable on screen.
    await gotoPlugins(page, app, ctx);
    const en = await setUrnEnabled(page, true);
    const ctl1 = await urnRowControls(page);
    await snap(page, n('03-plugins-enabled'), {enable: en, rowLinks: ctl1.links});
    log('enable', JSON.stringify(en), 'links', JSON.stringify(ctl1.links));

    // Enabled, settings never saved: the Identifiers page.
    await readIdPage(page, app, ctx, S.win.s1.submissionId, S.win.s1.publicationId, n('04-idpage-enabled-unsaved'));

    // The window's defaults.
    await openUrnSettings(page, app, ctx);
    const w0 = await winState(page);
    await snap(page, n('05-window-defaults'), {win: w0});
    log('window defaults', JSON.stringify({title: w0.title, desc: w0.description, boxes: w0.checkboxes, radios: w0.radios.map((r) => `${r.value}:${r.checked}`), texts: w0.texts.map((x) => `${x.name}:${x.disabled}:${x.value}`), selects: w0.selects}));
    await loc(page, 'URN settings window: the form', win(page));
    await loc(page, 'URN settings window: "Save"', win(page).getByRole('button', {name: 'Save', exact: true}));

    // Which pattern boxes can be typed in: pattern radio × ticked kinds.
    const f = win(page);
    const boxNames = w0.checkboxes.filter((c) => /^enable.*URN$/.test(c.name)).map((c) => c.name);
    const patternBoxes = async () => f.locator('input[type=text][name$="SuffixPattern"]').evaluateAll((els) => els.map((e) => ({name: e.name, disabled: e.disabled})));
    const matrix = {};
    const pageErrors = [];
    const onPageError = (e) => pageErrors.push({at: matrixStep, message: String(e.message || e)});
    let matrixStep = 'start';
    page.on('pageerror', onPageError);
    matrix.defaultRadioNoneTicked = await patternBoxes();
    matrixStep = 'default radio: tick and untick Check Number';
    await f.locator('input[type=checkbox][name="urnCheckNo"]').click();
    await f.locator('input[type=checkbox][name="urnCheckNo"]').click();
    await sleep(200);
    matrixStep = 'pattern radio chosen';
    await f.locator('input[type=radio][value="pattern"]').check();
    await sleep(200);
    matrix.patternRadioNoneTicked = await patternBoxes();
    for (const b of boxNames) { matrixStep = `pattern radio: tick ${b}`; await f.locator(`input[type=checkbox][name="${b}"]`).check(); await sleep(150); }
    await sleep(200);
    matrix.patternRadioAllTicked = await patternBoxes();
    matrixStep = 'pattern radio: tick Check Number';
    await f.locator('input[type=checkbox][name="urnCheckNo"]').click();
    await sleep(200);
    matrixStep = 'customId radio chosen';
    await f.locator('input[type=radio][value="customId"]').check();
    await sleep(200);
    matrix.customRadioAllTicked = await patternBoxes();
    page.off('pageerror', onPageError);
    matrix.pageErrors = pageErrors;
    await snap(page, n('06-window-pattern-boxes'), {matrix});
    log('pattern boxes', JSON.stringify(matrix));
    await winCancel(page);

    // Refusal 1: nothing ticked, prefix and resolver empty.
    await openUrnSettings(page, app, ctx);
    const r1 = await winSave(page, {}, n('07-save-empty'));
    log('save empty', JSON.stringify({posted: r1.posted, status: r1.status, stillOpen: r1.stillOpen, errors: r1.after && r1.after.errors, notices: r1.notices}));
    if (r1.stillOpen) await winCancel(page);

    // Refusal 1b: every box valid, no kind ticked (the server's own check).
    await openUrnSettings(page, app, ctx);
    const r1b = await winSave(page, {texts: {urnPrefix: PREFIX, urnResolver: RESOLVER}, namespace: 'urn:nbn:de'}, n('07b-save-no-kind'));
    log('save no kind', JSON.stringify({posted: r1b.posted, status: r1b.status, stillOpen: r1b.stillOpen, errors: r1b.after && r1b.after.errors, notices: r1b.notices}));
    if (r1b.stillOpen) await winCancel(page);

    // Refusal 2: a kind ticked, a resolver that is not an address (and a good prefix), then a prefix without "urn:".
    await openUrnSettings(page, app, ctx);
    const r2 = await winSave(page, {boxes: {enablePublicationURN: true}, texts: {urnPrefix: PREFIX, urnResolver: 'not an address'}, namespace: 'urn:nbn:de'}, n('08-save-bad-resolver'));
    log('save bad resolver', JSON.stringify({posted: r2.posted, status: r2.status, stillOpen: r2.stillOpen, errors: r2.after && r2.after.errors}));
    if (r2.stillOpen) await winCancel(page);
    const prefixes = {};
    for (const [k, v] of [['noUrn', 'nbn:de:0000-'], ['noSecondColon', 'urn:nbn'], ['upper', 'URN:NBN:DE:0000-'], ['minimal', 'urn:x:']]) {
        await openUrnSettings(page, app, ctx);
        const r = await winSave(page, {boxes: {enablePublicationURN: true}, texts: {urnPrefix: v, urnResolver: RESOLVER}, namespace: 'urn:nbn:de'}, n(`08b-save-prefix-${k}`));
        prefixes[k] = {value: v, posted: r.posted, status: r.status, stillOpen: r.stillOpen, errors: r.after && r.after.errors, notices: r.notices};
        log('prefix', k, JSON.stringify(prefixes[k]));
        if (r.stillOpen) await winCancel(page);
    }
    const resolvers = {};
    for (const [k, v] of [['localhost', 'http://localhost'], ['noTld', 'https://nbn-resolving'], ['ftp', 'ftp://example.org/'], ['space', 'https://exa mple.org/']]) {
        await openUrnSettings(page, app, ctx);
        const r = await winSave(page, {boxes: {enablePublicationURN: true}, texts: {urnPrefix: PREFIX, urnResolver: v}, namespace: 'urn:nbn:de'}, n(`08c-save-resolver-${k}`));
        resolvers[k] = {value: v, posted: r.posted, status: r.status, stillOpen: r.stillOpen, errors: r.after && r.after.errors, notices: r.notices};
        log('resolver', k, JSON.stringify(resolvers[k]));
        if (r.stillOpen) await winCancel(page);
    }

    // A8 / q10: own pattern chosen, Articles ticked, "for articles" empty.
    await openUrnSettings(page, app, ctx);
    const r3 = await winSave(page, {boxes: {enablePublicationURN: true}, suffix: 'pattern', texts: {urnPrefix: PREFIX, urnResolver: RESOLVER, urnPublicationSuffixPattern: ''}, namespace: 'urn:nbn:de'}, n('09-save-empty-own-pattern'));
    log('save empty own pattern', JSON.stringify({posted: r3.posted, status: r3.status, stillOpen: r3.stillOpen, errors: r3.after && r3.after.errors}));
    // The same window: spaces only, then a real pattern (the other end); reopened to see what was kept.
    let r3b = null; let r3c = null;
    if (r3.stillOpen) {
        r3b = await winSave(page, {texts: {urnPublicationSuffixPattern: '   '}}, n('09b-save-own-pattern-spaces'));
        log('save own pattern spaces', JSON.stringify({posted: r3b.posted, status: r3b.status, stillOpen: r3b.stillOpen, errors: r3b.after && r3b.after.errors, notices: r3b.notices}));
        if (r3b.stillOpen) {
            r3c = await winSave(page, {texts: {urnPublicationSuffixPattern: '%j.%a'}}, n('09c-save-own-pattern-filled'));
            log('save own pattern filled', JSON.stringify({posted: r3c.posted, status: r3c.status, stillOpen: r3c.stillOpen, notices: r3c.notices}));
            if (r3c.stillOpen) await winCancel(page);
        }
    }
    if (r3c && !r3c.stillOpen) {
        await openUrnSettings(page, app, ctx);
        await snap(page, n('09d-window-reopened-own-pattern'), {win: await winState(page)});
        await winCancel(page);
    }

    // OMP1 / q15: a press ticks only Chapters, then only Files, then both, then Chapters + Monographs.
    const omp1 = {};
    if (isOMP) {
        const combos = [
            ['chaptersOnly', {enableChapterURN: true}],
            ['filesOnly', {enableSubmissionFileURN: true}],
            ['chaptersFiles', {enableChapterURN: true, enableSubmissionFileURN: true}],
            ['chaptersMonographs', {enableChapterURN: true, enableSubmissionFileURN: false, enablePublicationURN: true}],
        ];
        for (const [k, boxes] of combos) {
            await openUrnSettings(page, app, ctx);
            const r = await winSave(page, {boxes: {enablePublicationURN: false, enableRepresentationURN: false, ...boxes}, suffix: 'default', texts: {urnPrefix: PREFIX, urnResolver: RESOLVER}, namespace: 'urn:nbn:de'}, n(`10-omp1-${k}`));
            omp1[k] = {posted: r.posted, status: r.status, stillOpen: r.stillOpen, errors: r.after && r.after.errors, notices: r.notices};
            log('omp1', k, JSON.stringify(omp1[k]));
            if (r.stillOpen) await winCancel(page);
        }
    }

    // q21: Namespace left on its empty entry, everything else valid, a non-article kind only
    // (Galleys / Publication Formats): Rule 7's other end.
    await openUrnSettings(page, app, ctx);
    const other = isOMP ? {enableRepresentationURN: true} : {enableRepresentationURN: true};
    const r4 = await winSave(page, {boxes: {enablePublicationURN: false, ...other}, suffix: 'default', texts: {urnPrefix: PREFIX, urnResolver: RESOLVER}, namespace: ''}, n('11-save-empty-namespace-nonarticle'));
    log('save empty namespace', JSON.stringify({posted: r4.posted, status: r4.status, stillOpen: r4.stillOpen, errors: r4.after && r4.after.errors, notices: r4.notices}));
    if (r4.stillOpen) {
        // The browser refused: pick a namespace and save the same (so the non-article state is reached).
        const r4b = await winSave(page, {namespace: 'urn:nbn:de'}, n('11b-save-nonarticle-with-namespace'));
        log('save non-article with namespace', JSON.stringify({status: r4b.status, stillOpen: r4b.stillOpen, notices: r4b.notices}));
        if (r4b.stillOpen) await winCancel(page);
    }
    await readIdPage(page, app, ctx, S.win.s1.submissionId, S.win.s1.publicationId, n('12-idpage-nonarticle-kind'));

    // Reopen: what was kept.
    await openUrnSettings(page, app, ctx);
    const w1 = await winState(page);
    await snap(page, n('13-window-reopened'), {win: w1});
    // Unsaved leave: tick Articles, then the window's Cancel and its close button.
    await f.locator('input[type=checkbox][name="enablePublicationURN"]').check();
    const dialogs = [];
    const onDialog = async (d) => { dialogs.push({type: d.type(), message: d.message()}); await d.accept().catch(() => {}); };
    page.on('dialog', onDialog);
    await winCancel(page);
    page.off('dialog', onDialog);
    await openUrnSettings(page, app, ctx);
    const w2 = await winState(page);
    await snap(page, n('14-window-after-unsaved-cancel'), {win: w2, dialogs});
    log('unsaved cancel', JSON.stringify({dialogs, articles: w2.checkboxes.find((c) => c.name === 'enablePublicationURN')}));

    // "Reassign URNs": the question, then its cancel.
    const reassign = win(page).getByRole('link', {name: 'Reassign URNs'}).or(win(page).getByRole('button', {name: 'Reassign URNs'})).first();
    await loc(page, 'URN settings window: "Reassign URNs"', reassign);
    const bDialogs = [];
    const onD2 = async (d) => { bDialogs.push({type: d.type(), message: d.message()}); await d.dismiss().catch(() => {}); };
    page.on('dialog', onD2);
    await reassign.click();
    await sleep(900);
    const confirm = page.locator('[role="dialog"]:visible').filter({hasText: /Are you sure/}).last();
    const confirmText = (await confirm.count()) ? flat(await confirm.innerText()) : null;
    const confirmButtons = (await confirm.count()) ? await confirm.getByRole('button').allInnerTexts() : [];
    await snap(page, n('15-reassign-question'), {confirmText, confirmButtons, browserDialogs: bDialogs});
    log('reassign question', confirmText, JSON.stringify(confirmButtons), JSON.stringify(bDialogs));
    if (await confirm.count()) {
        const c = confirm.getByRole('button', {name: /^(Cancel|No)$/}).first();
        if (await c.count()) await c.click();
        await sleep(700);
    }
    page.off('dialog', onD2);

    // The successful save with Articles/Monographs ticked (Rule 7); the notice.
    const r5 = await winSave(page, {boxes: {enablePublicationURN: true}, suffix: 'default', texts: {urnPrefix: PREFIX, urnResolver: RESOLVER}, namespace: 'urn:nbn:de'}, n('16-save-articles'));
    log('save articles', JSON.stringify({status: r5.status, stillOpen: r5.stillOpen, notices: r5.notices}));
    if (r5.stillOpen) await winCancel(page);
    const idOn = await readIdPage(page, app, ctx, S.win.s1.submissionId, S.win.s1.publicationId, n('17-idpage-articles-default-no-acronym'));
    // Default patterns with no acronym: press Assign where offered and read the value (not saved).
    if (idOn.field.buttons && idOn.field.buttons.some((b) => b.text === 'Assign')) {
        await fieldButton(page, 'Assign').click();
        await sleep(300);
        const after = await urnField(page);
        await snap(page, n('18-idpage-assign-no-acronym'), {urnField: after});
        log('assign no acronym', after.value);
    }
    // OJS: the same page once the article is in an issue (the default pattern's initials are still missing).
    if (app.name === 'ojs') {
        await assignIssueOJS(page, app, ctx, S.win.s1.submissionId, S.win.s1.publicationId, n('19-assign-issue-no-acronym'));
        await readIdPage(page, app, ctx, S.win.s1.submissionId, S.win.s1.publicationId, n('20-idpage-issue-no-acronym'));
    }
    return {omp1, prefixes, resolvers};
}

// ---------------------------------------------------------------------------
// Phase def: the pattern shape with the default patterns

async function assignIssueOJS(page, app, ctx, sid, pid, name) {
    // Publication › "Publication Settings": "Assign To Current/Back Issue" with Vol. 1 No. 2, Save.
    await gotoVersionPage(page, app, ctx, sid, pid, 'issue');
    const d = wf(page);
    const back = d.getByRole('radio', {name: 'Assign To Current/Back Issue'});
    await back.waitFor({state: 'visible', timeout: T});
    await d.locator('input[name="assignment"]:checked').first().waitFor({timeout: T}).catch(() => {});
    await back.check();
    const sel = d.locator('select[name="issueId"]');
    await sel.waitFor({state: 'visible', timeout: T});
    const opt = sel.locator('option').filter({hasText: /Vol\. 1 No\. 2/});
    await opt.first().waitFor({state: 'attached', timeout: T});
    await sel.selectOption((await opt.first().getAttribute('value')) || '');
    await snap(page, name + '-before-save');
    const r = await pubSave(page, name);
    return r;
}

async function phaseDef(app, S, page) {
    const ctx = S.def.path;
    const {submissionId: sid, publicationId: pid} = S.def.s1;
    const n = (x) => `d-${x}`;
    const isOJS = app.name === 'ojs';
    await signIn(page, `${ctx}mg`, {contextPath: ctx});
    const out = {};

    // 1. Before an issue (OJS) / as seeded (OMP).
    out.first = await readIdPage(page, app, ctx, sid, pid, n('01-idpage-first'));
    await loc(page, 'Identifiers page: the URN box', urnInput(page));
    if (isOJS) {
        out.issue = await assignIssueOJS(page, app, ctx, sid, pid, n('02-assign-issue'));
        out.withIssue = await readIdPage(page, app, ctx, sid, pid, n('03-idpage-with-issue'));
    }
    // 2. Assign, then leave the page without saving (sweep and Rule 9's "Neither button saves").
    await loc(page, 'Identifiers page: "Assign"', fieldButton(page, 'Assign'));
    const dialogs = [];
    const onDialog = async (d) => { dialogs.push({type: d.type(), message: d.message()}); await d.accept().catch(() => {}); };
    page.on('dialog', onDialog);
    await fieldButton(page, 'Assign').click();
    await sleep(300);
    out.assigned = await urnField(page);
    await snap(page, n('04-after-assign-unsaved'), {urnField: out.assigned});
    out.expected = {urn: out.assigned.value};
    // Leave by the side menu to another entry, then come back.
    const titleLink = wf(page).getByRole('link', {name: 'Title & Abstract', exact: true}).first();
    await titleLink.click().catch(() => {});
    await sleep(1200);
    await idle(page);
    const leftTo = await wf(page).getByRole('heading').first().innerText().catch(() => null);
    out.leave = {dialogs: [...dialogs], leftTo, stayDialog: flat(await page.locator('[role="dialog"]:visible').filter({hasText: /unsaved|leave|discard/i}).last().innerText().catch(() => null))};
    await snap(page, n('05-left-unsaved'), {leave: out.leave});
    page.off('dialog', onDialog);
    out.afterLeave = await readIdPage(page, app, ctx, sid, pid, n('06-idpage-back-after-leave'));
    out.apiAfterLeave = await pubRead(page, app, ctx, sid, pid);
    log('after leave, API urn:', JSON.stringify(out.apiAfterLeave));

    // 3. Assign + Save; reload.
    await fieldButton(page, 'Assign').click();
    await sleep(300);
    out.save1 = await pubSave(page, n('07-assign-save'));
    out.reload1 = await readIdPage(page, app, ctx, sid, pid, n('08-idpage-reload-after-save'));
    out.api1 = await pubRead(page, app, ctx, sid, pid);
    // 3b. Save again with nothing changed (the pattern shape's own stored URN: A4 on this shape).
    out.saveAgain = await pubSave(page, n('09-save-again-unchanged'));

    // 4. Clear (a warnable button: any question?), leave unsaved check via API, then Save.
    await loc(page, 'Identifiers page: "Clear"', fieldButton(page, 'Clear'));
    const cDialogs = [];
    const onD2 = async (d) => { cDialogs.push({type: d.type(), message: d.message()}); await d.accept().catch(() => {}); };
    page.on('dialog', onD2);
    await fieldButton(page, 'Clear').click();
    await sleep(600);
    const clearQuestion = flat(await page.locator('[role="dialog"]:visible').filter({hasText: /Are you sure|delete/i}).last().innerText().catch(() => null));
    out.cleared = await urnField(page);
    await snap(page, n('10-after-clear-unsaved'), {urnField: out.cleared, clearQuestion, browserDialogs: cDialogs});
    page.off('dialog', onD2);
    out.apiAfterClearUnsaved = await pubRead(page, app, ctx, sid, pid);
    out.save2 = await pubSave(page, n('11-clear-save'));
    out.reload2 = await readIdPage(page, app, ctx, sid, pid, n('12-idpage-reload-after-clear-save'));
    out.api2 = await pubRead(page, app, ctx, sid, pid);
    log('clear', JSON.stringify({clearQuestion, cleared: out.cleared.value, apiUnsaved: out.apiAfterClearUnsaved, api2: out.api2}));

    // 5. Check Number ticked on screen; Assign again (A6: the digit appended).
    await openUrnSettings(page, app, ctx);
    const ck = await winSave(page, {boxes: {urnCheckNo: true}}, n('13-settings-check-number-on'));
    log('check number on', JSON.stringify({status: ck.status, stillOpen: ck.stillOpen, notices: ck.notices}));
    if (ck.stillOpen) await winCancel(page);
    out.ck = await readIdPage(page, app, ctx, sid, pid, n('14-idpage-check-number-on'));
    if (out.ck.field.buttons && out.ck.field.buttons.some((b) => b.text === 'Assign')) {
        await fieldButton(page, 'Assign').click();
        await sleep(300);
        const f = await urnField(page);
        const base = out.expected.urn || '';
        const suffix = base.startsWith(PREFIX) ? base.slice(PREFIX.length) : base;
        out.ckAssigned = {value: f.value, withoutDigit: base, digitSuffixOnly: checkDigit(suffix), digitWholeUrn: checkDigit(base)};
        await snap(page, n('15-assign-with-check-number'), {urnField: f, ckAssigned: out.ckAssigned});
        log('assign with check number', JSON.stringify(out.ckAssigned));
        out.ckSave = await pubSave(page, n('16-assign-with-check-number-save'));
    }
    // Tick it off again (the pub phase reads this context with the default patterns).
    await openUrnSettings(page, app, ctx);
    const ck2 = await winSave(page, {boxes: {urnCheckNo: false}}, n('17-settings-check-number-off'));
    if (ck2.stillOpen) await winCancel(page);
    return out;
}

// ---------------------------------------------------------------------------
// Phase own: the pattern shape with an own pattern that needs the publisher ID

async function phaseOwn(app, S, page) {
    const ctx = S.own.path;
    const {submissionId: sid, publicationId: pid} = S.own.s1;
    const n = (x) => `o-${x}`;
    await signIn(page, `${ctx}mg`, {contextPath: ctx});
    const out = {};
    out.first = await readIdPage(page, app, ctx, sid, pid, n('01-idpage-own-pattern-missing'));
    // Where the article's Publisher ID box is: this page or the Metadata page.
    const pidBox = wf(page).getByLabel('Publisher ID', {exact: true});
    let where = 'identifiers';
    if (!(await pidBox.count())) {
        where = 'metadata';
        await gotoVersionPage(page, app, ctx, sid, pid, 'metadata');
        await wf(page).getByLabel('Publisher ID', {exact: true}).first().waitFor({timeout: 15_000}).catch(() => {});
    }
    const box = wf(page).getByLabel('Publisher ID', {exact: true}).first();
    await loc(page, `the article's "Publisher ID" box (${where} page)`, box);
    out.publisherIdWhere = where;
    if (await box.count()) {
        await box.fill('pid77');
        out.pidSave = await pubSave(page, n('02-publisher-id-save'));
    } else {
        out.pidSave = 'no Publisher ID box on the Identifiers or Metadata page';
    }
    out.withPid = await readIdPage(page, app, ctx, sid, pid, n('03-idpage-own-pattern-with-pid'));
    if (out.withPid.field.buttons && out.withPid.field.buttons.some((b) => b.text === 'Assign')) {
        await fieldButton(page, 'Assign').click();
        await sleep(300);
        out.assigned = await urnField(page);
        await snap(page, n('04-own-pattern-assign'), {urnField: out.assigned});
        out.save = await pubSave(page, n('05-own-pattern-save'));
    }
    log('own', JSON.stringify({where, first: out.first.field.text, assigned: out.assigned && out.assigned.value}));
    return out;
}

// ---------------------------------------------------------------------------
// Phase cus: the individual shape

async function typeUrn(page, text) {
    const input = urnInput(page);
    await input.fill(text);
    await sleep(200);
}

async function phaseCus(app, S, page) {
    const ctx = S.cus.path;
    const n = (x) => `c-${x}`;
    const isOJS = app.name === 'ojs';
    await signIn(page, `${ctx}mg`, {contextPath: ctx});
    const out = {};
    const s1 = S.cus.s1; const s2 = S.cus.s2;

    // 1. The shape: help text, "Add Check Number" greyed while empty.
    out.first = await readIdPage(page, app, ctx, s1.submissionId, s1.publicationId, n('01-idpage-individual-empty'));
    await loc(page, 'Identifiers page (individual): "Add Check Number"', fieldButton(page, 'Add Check Number'));
    // 2. q8: type the prefix + "abc", press "Add Check Number".
    await typeUrn(page, `${PREFIX}abc`);
    out.typed = await urnField(page);
    await fieldButton(page, 'Add Check Number').click();
    await sleep(300);
    out.withDigit = await urnField(page);
    out.digits = {suffixOnly: checkDigit('abc'), wholeUrn: checkDigit(`${PREFIX}abc`)};
    await snap(page, n('02-add-check-number'), {urnField: out.withDigit, digits: out.digits, typedButtons: out.typed.buttons});
    log('add check number', out.withDigit.value, JSON.stringify(out.digits));
    // Press it twice: another digit?
    await fieldButton(page, 'Add Check Number').click();
    await sleep(300);
    out.twice = (await urnField(page)).value;
    // "Save stores the box as it stands": save a plain URN.
    await typeUrn(page, `${PREFIX}e2e1`);
    out.save1 = await pubSave(page, n('03-save-e2e1'));
    out.api1 = await pubRead(page, app, ctx, s1.submissionId, s1.publicationId);
    // A4 / q6: Save again with nothing changed.
    out.saveAgain = await pubSave(page, n('04-save-again-unchanged'));
    out.reloadAfterAgain = await readIdPage(page, app, ctx, s1.submissionId, s1.publicationId, n('05-idpage-reload-after-save-again'));
    // "The box takes any text": free text with the prefix, then without the prefix (q18 end).
    await typeUrn(page, 'e2e2');
    out.noPrefix = await pubSave(page, n('06-save-without-prefix'));
    await typeUrn(page, `${PREFIX}Any Text ÄÖ/;`);
    out.anyText = await pubSave(page, n('07-save-any-text-with-prefix'));
    out.apiAny = await pubRead(page, app, ctx, s1.submissionId, s1.publicationId);
    // q18: s1 holds e2e2 (with prefix), then s2 types the same.
    await readIdPage(page, app, ctx, s1.submissionId, s1.publicationId, n('08-idpage-s1-reload'));
    await typeUrn(page, `${PREFIX}e2e2`);
    out.s1e2e2 = await pubSave(page, n('09-s1-save-e2e2'));
    out.apiS1 = await pubRead(page, app, ctx, s1.submissionId, s1.publicationId);
    await readIdPage(page, app, ctx, s2.submissionId, s2.publicationId, n('10-idpage-s2'));
    await typeUrn(page, `${PREFIX}e2e2`);
    out.dup = await pubSave(page, n('11-s2-save-duplicate'));
    // The case axis: the same URN in capitals.
    await typeUrn(page, `${PREFIX}E2E2`);
    out.dupUpper = await pubSave(page, n('12-s2-save-duplicate-capitals'));
    out.apiS2 = await pubRead(page, app, ctx, s2.submissionId, s2.publicationId);
    // Empty box: accepted, removes the URN (on s1).
    await readIdPage(page, app, ctx, s1.submissionId, s1.publicationId, n('13-idpage-s1-before-empty'));
    await typeUrn(page, '');
    out.empty = await pubSave(page, n('14-s1-save-empty'));
    out.apiEmpty = await pubRead(page, app, ctx, s1.submissionId, s1.publicationId);
    out.reloadEmpty = await readIdPage(page, app, ctx, s1.submissionId, s1.publicationId, n('15-idpage-s1-after-empty'));
    log('cus', JSON.stringify({api1: out.api1, again: out.saveAgain.apiErrors, noPrefix: out.noPrefix.apiErrors, any: out.apiAny, dup: out.dup.apiErrors, dupUpper: out.dupUpper.apiErrors, apiS2: out.apiS2, empty: out.apiEmpty}));

    // q6 / Rule 7: the published s4 — type a URN? It is published; read the page, then "Create New Version".
    const s4 = S.cus.s4;
    out.pubRead = await readIdPage(page, app, ctx, s4.submissionId, s4.publicationId, n('16-idpage-published'));
    return out;
}

// q6 needs a URN on the first version before the new version: s3 gets one, is published on screen, then versioned.
async function phaseCusVersion(app, S, page) {
    const ctx = S.cus.path;
    const n = (x) => `cv-${x}`;
    const s3 = S.cus.s3;
    const isOJS = app.name === 'ojs';
    const out = {};
    await signIn(page, `${ctx}mg`, {contextPath: ctx});
    await readIdPage(page, app, ctx, s3.submissionId, s3.publicationId, n('01-idpage-s3'));
    await typeUrn(page, `${PREFIX}e2e3`);
    out.save = await pubSave(page, n('02-s3-save-e2e3'));
    // OJS: the galley's "Identifiers" tab gets a typed suffix (read again after Reassign in phase pub).
    if (isOJS) {
        // The typed suffix is stored by the first "Save"; the tab then offers the assign box, and a second "Save" assigns.
        out.galleySuffix = await galleyTabSave(page, app, ctx, s3, 'g3sfx', n('03-galley-typed-suffix'));
        out.galleyAssign = await galleyTabSave(page, app, ctx, s3, null, n('03b-galley-typed-suffix-assign'));
        out.galleyAssigned = await openGalleyIdentifiers(page, app, ctx, s3, n('03c-galley-typed-suffix-assigned'));
        await page.goto(app.url(`/index.php/${ctx}/management/settings/website`)).catch(() => {});
    }
    // Publish on screen.
    out.publish = await publishOnScreen(page, app, ctx, s3.submissionId, s3.publicationId, n('04-publish'), {});
    // Create New Version from the side menu.
    out.version = await createNewVersion(page, n('05-create-version'));
    const pubs = await page.evaluate(async ({url}) => { const r = await fetch(url, {headers: {'X-Requested-With': 'XMLHttpRequest'}}); const j = await r.json(); return (j.publications || []).map((p) => ({id: p.id, version: p.version, status: p.status, urn: p['pub-id::other::urn'] ?? null})); }, {url: app.url(`/index.php/${ctx}/api/v1/submissions/${s3.submissionId}`)});
    out.pubs = pubs;
    const newest = pubs.reduce((a, b) => (b.id > a.id ? b : a), pubs[0]);
    S.cus.s3v2 = newest.id;
    out.v2 = await readIdPage(page, app, ctx, s3.submissionId, newest.id, n('06-idpage-new-version'));
    out.v2Save = await pubSave(page, n('07-new-version-save-unchanged'));
    out.v1 = await readIdPage(page, app, ctx, s3.submissionId, s3.publicationId, n('08-idpage-first-version'));
    log('version', JSON.stringify({pubs, v2: out.v2.field.value, v2Save: out.v2Save.apiErrors, menuIds: out.v2.menu.identifiersLinks}));
    // Check Number unticked on screen: the individual shape without "Add Check Number".
    await openUrnSettings(page, app, ctx);
    const ck = await winSave(page, {boxes: {urnCheckNo: false}}, n('09-settings-check-number-off'));
    if (ck.stillOpen) await winCancel(page);
    out.noCk = await readIdPage(page, app, ctx, S.cus.s2.submissionId, S.cus.s2.publicationId, n('10-idpage-check-number-off'));
    return out;
}

// ---------------------------------------------------------------------------
// Galleys (OJS): a galley row's "Edit" window, its "Identifiers" tab

async function openGalleyIdentifiers(page, app, ctx, sub, name) {
    await gotoVersionPage(page, app, ctx, sub.submissionId, sub.publicationId, 'galleys');
    const d = wf(page);
    const row = d.locator('tr').filter({hasText: 'PDF'}).first();
    await row.waitFor({state: 'visible', timeout: T});
    await row.getByRole('button').last().click();
    const edit = page.getByRole('menuitem', {name: 'Edit', exact: true}).first();
    await edit.waitFor({state: 'visible', timeout: T});
    await edit.click();
    const tab = page.getByRole('tab', {name: 'Identifiers'}).or(page.getByRole('link', {name: 'Identifiers', exact: true})).first();
    const hasTab = await tab.waitFor({state: 'visible', timeout: 15_000}).then(() => true).catch(() => false);
    if (hasTab) {
        await tab.click();
        await idle(page);
        await sleep(800);
    }
    const panel = page.locator('#publicIdentifiersForm, form[id^="publicIdentifiersForm"]').first();
    await panel.waitFor({state: 'visible', timeout: 10_000}).catch(() => {});
    const text = flat(await panel.innerText().catch(() => null));
    const inputs = await panel.locator('input, button').evaluateAll((els) => els.filter((e) => e.type !== 'hidden').map((e) => ({tag: e.tagName, type: e.type, name: e.name, value: e.value, checked: e.checked, disabled: e.disabled, text: (e.innerText || '').trim()}))).catch(() => []);
    const tabs = await page.locator('[role="dialog"]:visible').last().getByRole('tab').allInnerTexts().catch(() => []);
    const s = await snap(page, name, {galleyTab: {hasTab, tabs, text, inputs}});
    log(name, JSON.stringify({hasTab, tabs, text: text && text.slice(0, 400), inputs: inputs.filter((i) => /urn|assign/i.test(i.name))}));
    return {hasTab, text, tabs, inputs, panel};
}

async function galleyTabSave(page, app, ctx, sub, suffix, name) {
    const g = await openGalleyIdentifiers(page, app, ctx, sub, name + '-open');
    if (!g.hasTab) return {hasTab: false};
    const form = g.panel;
    const sfx = form.locator('input[name="urnSuffix"]');
    if (suffix && (await sfx.count())) await sfx.fill(suffix);
    const assign = form.locator('input[type=checkbox][name*="assign"], input[type=checkbox][id*="assign"]').first();
    if (await assign.count()) await assign.check().catch(() => {});
    const before = flat(await form.innerText().catch(() => null));
    const w = page.waitForResponse((r) => r.request().method() === 'POST' && /identifiers|galley/i.test(r.url()), {timeout: 15_000}).catch(() => null);
    await form.getByRole('button', {name: 'Save', exact: true}).click();
    const resp = await w;
    await sleep(900);
    await idle(page);
    const stillOpen = await form.isVisible().catch(() => false);
    const after = await snap(page, name, {before, status: resp ? resp.status() : null, stillOpen, afterText: stillOpen ? flat(await form.innerText().catch(() => null)) : null});
    if (stillOpen) {
        const cancel = form.getByRole('link', {name: 'Cancel', exact: true}).or(form.getByRole('button', {name: 'Cancel', exact: true})).first();
        await cancel.click().catch(() => {});
        await sleep(700);
    }
    return {hasTab: true, before, status: resp ? resp.status() : null, stillOpen, inputs: g.inputs};
}

// ---------------------------------------------------------------------------
// Publishing and versions (the apps' own screens)

async function publishOnScreen(page, app, ctx, sid, pid, name, {backIssue} = {}) {
    const s = {};
    await gotoVersionPage(page, app, ctx, sid, pid, 'titleAbstract');
    if (app.name === 'ojs') {
        const {PublicationScreen} = require(path.join(app.suiteDir, 'pages', 'PublicationMetadataPages.js'));
        const pub = new PublicationScreen(page, ctx);
        const panel = await pub.openPublishPanel();
        await pub.fillVersionDetails(panel);
        const dontAssign = panel.getByRole('radio', {name: "Don't Assign To An Issue"});
        const hasGroup = await dontAssign.waitFor({state: 'visible', timeout: 5_000}).then(() => true).catch(() => false);
        if (hasGroup) {
            await pub.awaitAssignmentPreselected(panel).catch(() => {});
            if (backIssue) {
                await panel.getByRole('radio', {name: 'Assign To Current/Back Issue'}).check();
                await pub.selectIssueOption(panel, backIssue);
            } else {
                const checked = await panel.locator('input[name="assignment"]:checked').getAttribute('value').catch(() => null);
                s.preselected = checked;
                if (!/back|current/i.test(String(checked))) await dontAssign.check();
            }
        }
        await sleep(400);
        s.panel = await snap(page, name + '-panel');
        await panel.getByRole('button', {name: 'Confirm', exact: true}).click();
        const confirm = page.getByRole('dialog').filter({hasText: 'Are you sure you want to publish this?'});
        await confirm.waitFor({state: 'visible', timeout: T});
        const w = page.waitForResponse((r) => r.url().includes('/publish') && r.request().method() !== 'GET', {timeout: T}).catch(() => null);
        await confirm.getByRole('button', {name: 'Publish', exact: true}).click();
        const r = await w;
        s.status = r ? r.status() : null;
        await page.getByRole('button', {name: 'Unpublish', exact: true}).waitFor({state: 'visible', timeout: T}).catch(() => {});
    } else {
        await page.getByRole('button', {name: 'Publish', exact: true}).first().click();
        const modal = page.getByRole('dialog', {name: /Schedule For Publication/});
        await modal.waitFor({state: 'visible', timeout: T});
        await idle(page);
        const stage = modal.locator('select[name="versionStage"]');
        if (await stage.isVisible().catch(() => false)) { if (!(await stage.inputValue())) await stage.selectOption('VoR'); }
        const minor = modal.locator('select[name="versionIsMinor"]');
        if (await minor.isVisible().catch(() => false)) { if (!(await minor.inputValue())) await minor.selectOption('false'); }
        s.panel = await snap(page, name + '-panel');
        const w = page.waitForResponse((r) => r.url().includes('/publish') && r.request().method() !== 'GET', {timeout: T}).catch(() => null);
        await modal.getByRole('button', {name: 'Publish', exact: true}).click();
        const r = await w;
        s.status = r ? r.status() : null;
        await page.getByRole('button', {name: 'Unpublish', exact: true}).waitFor({state: 'visible', timeout: T}).catch(() => {});
    }
    await idle(page);
    await snap(page, name, {publish: {status: s.status, preselected: s.preselected}});
    log(name, 'publish status', s.status);
    return {status: s.status, preselected: s.preselected, panelUrnLines: s.panel && s.panel.text && s.panel.text.dialog ? s.panel.text.dialog.split('\n').filter((l) => /URN|Item|Galley|Publication/.test(l)) : null};
}

async function createNewVersion(page, name) {
    const dialog = wf(page);
    let link = dialog.getByRole('link', {name: 'Create New Version', exact: true}).first();
    if (!(await link.isVisible().catch(() => false))) {
        const group = dialog.getByRole('link', {name: /^(Publication)$/, exact: true}).first();
        if (await group.count()) await group.click();
        await idle(page);
    }
    if (!(await link.isVisible().catch(() => false))) return {offered: false};
    await link.click();
    const window = page.getByRole('dialog').filter({has: page.locator('select[name="versionStage"]')}).last();
    await window.locator('select[name="versionStage"]').waitFor({state: 'visible', timeout: T});
    await idle(page);
    await sleep(1500);
    const stage = window.locator('select[name="versionStage"]');
    if (!(await stage.inputValue())) await stage.selectOption('VoR');
    const minor = window.locator('select[name="versionIsMinor"]');
    if (await minor.isVisible().catch(() => false)) { if (!(await minor.inputValue())) await minor.selectOption('false'); }
    await snap(page, name + '-window');
    const w = page.waitForResponse((r) => /\/publications\/\d+\/version/.test(r.url()) && r.request().method() === 'POST', {timeout: T}).catch(() => null);
    await window.getByRole('button', {name: 'Confirm', exact: true}).click();
    const r = await w;
    await window.waitFor({state: 'detached', timeout: T}).catch(() => {});
    await idle(page);
    return {offered: true, status: r ? r.status() : null};
}

// ---------------------------------------------------------------------------
// Phase pub: a published article with a URN; plugin off/on (Rule 20); "Reassign URNs" (Rule 18)

async function readerPage(page, app, ctx, sid, name) {
    const url = app.name === 'omp' ? `/index.php/${ctx}/catalog/book/${sid}` : `/index.php/${ctx}/article/view/${sid}`;
    await page.goto(app.url(url));
    await idle(page);
    const body = (await page.locator('body').innerText().catch(() => '')) || '';
    const urnLines = body.split('\n').map((l) => l.trim()).filter((l) => /urn:|\bURN\b/i.test(l));
    const links = await page.locator('a[href*="urn:"]').evaluateAll((els) => els.map((e) => ({text: e.innerText.trim(), href: e.getAttribute('href')}))).catch(() => []);
    await snap(page, name, {urnLines, urnLinks: links});
    log(name, JSON.stringify({urnLines, links}));
    return {urnLines, links};
}

async function phasePub(app, S, page) {
    const ctx = S.def.path;
    const n = (x) => `p-${x}`;
    const isOJS = app.name === 'ojs';
    const sub = S.def.s2;
    const {submissionId: sid, publicationId: pid} = sub;
    const out = {};
    await signIn(page, `${ctx}mg`, {contextPath: ctx});
    // Give s2 its URN (OJS: through the issue first), its galley's URN (OJS), then publish.
    if (isOJS) await assignIssueOJS(page, app, ctx, sid, pid, n('01-assign-issue'));
    await readIdPage(page, app, ctx, sid, pid, n('02-idpage'));
    await fieldButton(page, 'Assign').click().catch(() => {});
    await sleep(300);
    out.save = await pubSave(page, n('03-assign-save'));
    if (isOJS) out.galley = await galleyTabSave(page, app, ctx, sub, null, n('04-galley-assign'));
    out.publish = await publishOnScreen(page, app, ctx, sid, pid, n('05-publish'), {backIssue: isOJS ? /Vol\. 1 No\. 2/ : undefined});
    out.api0 = await pubRead(page, app, ctx, sid, pid);
    out.reader0 = await readerPage(page, app, ctx, sid, n('06-reader-published'));
    await signIn(page, `${ctx}mg`, {contextPath: ctx});
    out.id0 = await readIdPage(page, app, ctx, sid, pid, n('07-idpage-published'));
    if (isOJS) out.g0 = await openGalleyIdentifiers(page, app, ctx, sub, n('08-galley-tab-published'));

    // Rule 20: disable the plugin on screen.
    await gotoPlugins(page, app, ctx);
    out.off = await setUrnEnabled(page, false);
    await snap(page, n('09-plugins-disabled'), {off: out.off});
    out.idOff = await readIdPage(page, app, ctx, sid, pid, n('10-idpage-plugin-off'));
    if (isOJS) out.gOff = await openGalleyIdentifiers(page, app, ctx, sub, n('11-galley-tab-plugin-off'));
    out.apiOff = await pubRead(page, app, ctx, sid, pid);
    out.readerOff = await readerPage(page, app, ctx, sid, n('12-reader-plugin-off'));
    await signIn(page, `${ctx}mg`, {contextPath: ctx});
    // An unpublished submission's page too (the Identifiers entry on a version that is not published).
    out.idOffS1 = await readIdPage(page, app, ctx, S.def.s1.submissionId, S.def.s1.publicationId, n('13-idpage-s1-plugin-off'));
    // Enable again.
    await gotoPlugins(page, app, ctx);
    out.onAgain = await setUrnEnabled(page, true);
    out.readerOn = await readerPage(page, app, ctx, sid, n('14-reader-plugin-on-again'));
    await signIn(page, `${ctx}mg`, {contextPath: ctx});
    out.idOn = await readIdPage(page, app, ctx, sid, pid, n('15-idpage-plugin-on-again'));

    // Rule 18: "Reassign URNs" › "Delete".
    await openUrnSettings(page, app, ctx);
    const reassign = win(page).getByRole('link', {name: 'Reassign URNs'}).or(win(page).getByRole('button', {name: 'Reassign URNs'})).first();
    await reassign.click();
    const confirm = page.locator('[role="dialog"]:visible').filter({hasText: /Are you sure you wish to delete all existing URNs/}).last();
    await confirm.waitFor({state: 'visible', timeout: T});
    out.reassignQuestion = {text: flat(await confirm.innerText()), buttons: await confirm.getByRole('button').allInnerTexts()};
    const w = page.waitForResponse((r) => /clearPubIds|manage/.test(r.url()) && r.request().method() === 'POST', {timeout: T}).catch(() => null);
    await confirm.getByRole('button', {name: /^(Delete|OK|Yes)$/}).first().click();
    const r = await w;
    await sleep(900);
    await idle(page);
    out.reassign = {status: r ? r.status() : null, url: r ? r.url().replace(/^https?:\/\/[^/]+/, '').replace(/csrfToken=[^&]+/, 'csrfToken=…') : null, notices: await page.locator('.pkpNotification, [role="alert"], [role="status"]').allInnerTexts().catch(() => []), windowOpen: await win(page).isVisible().catch(() => false)};
    await snap(page, n('16-after-reassign'), {reassign: out.reassign, question: out.reassignQuestion});
    log('reassign', JSON.stringify(out.reassign), JSON.stringify(out.reassignQuestion));
    if (out.reassign.windowOpen) await winCancel(page);
    out.apiAfter = await pubRead(page, app, ctx, sid, pid);
    out.readerAfter = await readerPage(page, app, ctx, sid, n('17-reader-after-reassign'));
    await signIn(page, `${ctx}mg`, {contextPath: ctx});
    out.idAfter = await readIdPage(page, app, ctx, sid, pid, n('18-idpage-after-reassign'));
    if (out.idAfter.field.buttons && out.idAfter.field.buttons.some((b) => b.text === 'Assign')) {
        await fieldButton(page, 'Assign').click();
        await sleep(300);
        out.reassignAgain = await pubSave(page, n('18b-idpage-assign-again-save'));
    }
    if (isOJS) out.gAfter = await openGalleyIdentifiers(page, app, ctx, sub, n('19-galley-tab-after-reassign'));
    // The unpublished s1 of the same journal (its URN from phase def, if saved).
    out.s1After = await pubRead(page, app, ctx, S.def.s1.submissionId, S.def.s1.publicationId);
    // The cus context: its own Reassign, then the galley with the typed suffix (OJS) and the published version's page.
    if (S.cus.s3v2 || isOJS) {
        const cctx = S.cus.path;
        await signIn(page, `${cctx}mg`, {contextPath: cctx});
        out.cusBefore = await pubRead(page, app, cctx, S.cus.s3.submissionId, S.cus.s3.publicationId);
        if (isOJS) out.cusGalleyBefore = await openGalleyIdentifiers(page, app, cctx, S.cus.s3, n('20-cus-galley-before-reassign'));
        await openUrnSettings(page, app, cctx);
        const re = win(page).getByRole('link', {name: 'Reassign URNs'}).or(win(page).getByRole('button', {name: 'Reassign URNs'})).first();
        await re.click();
        const c2 = page.locator('[role="dialog"]:visible').filter({hasText: /Are you sure you wish to delete all existing URNs/}).last();
        await c2.waitFor({state: 'visible', timeout: T});
        const w2 = page.waitForResponse((r2) => /clearPubIds|manage/.test(r2.url()) && r2.request().method() === 'POST', {timeout: T}).catch(() => null);
        await c2.getByRole('button', {name: /^(Delete|OK|Yes)$/}).first().click();
        const r2 = await w2;
        await sleep(900);
        out.cusReassign = {status: r2 ? r2.status() : null};
        if (await win(page).isVisible().catch(() => false)) await winCancel(page);
        out.cusAfter = await pubRead(page, app, cctx, S.cus.s3.submissionId, S.cus.s3.publicationId);
        if (isOJS) out.cusGalleyAfter = await openGalleyIdentifiers(page, app, cctx, S.cus.s3, n('21-cus-galley-after-reassign'));
        out.cusIdAfter = await readIdPage(page, app, cctx, S.cus.s3.submissionId, S.cus.s3.publicationId, n('22-cus-idpage-v1-after-reassign'));
    }
    log('pub', JSON.stringify({api0: out.api0, apiOff: out.apiOff, apiAfter: out.apiAfter, s1After: out.s1After, cusBefore: out.cusBefore, cusAfter: out.cusAfter}));
    return out;
}

// ---------------------------------------------------------------------------
// Phase a6 (OJS): the check digit a galley's tab previews, next to the one "Assign" gives on the article's page

async function phaseA6(app, S, page) {
    const ctx = S.def.path;
    const n = (x) => `a6-${x}`;
    const out = {};
    await signIn(page, `${ctx}mg`, {contextPath: ctx});
    await openUrnSettings(page, app, ctx);
    const ck = await winSave(page, {boxes: {urnCheckNo: true}}, n('01-settings-check-number-on'));
    if (ck.stillOpen) await winCancel(page);
    const g = await openGalleyIdentifiers(page, app, ctx, S.def.s2, n('02-galley-tab-preview'));
    const m = (g.text || '').match(/URN (urn:\S+)/);
    if (m) {
        const full = m[1];
        const base = full.slice(0, -1);
        out.galley = {preview: full, lastDigit: full.slice(-1), digitWholeUrn: checkDigit(base), digitSuffixOnly: checkDigit(base.slice(PREFIX.length))};
    }
    await gotoVersionPage(page, app, ctx, S.def.s1.submissionId, S.def.s1.publicationId, 'identifiers');
    const f = await readIdPage(page, app, ctx, S.def.s1.submissionId, S.def.s1.publicationId, n('03-idpage'));
    if (f.field.buttons && f.field.buttons.some((b) => b.text === 'Assign')) {
        await fieldButton(page, 'Assign').click();
        await sleep(300);
        const v = (await urnField(page)).value;
        const base = v.slice(0, -1);
        out.article = {assigned: v, lastDigit: v.slice(-1), digitWholeUrn: checkDigit(base), digitSuffixOnly: checkDigit(base.slice(PREFIX.length))};
        await snap(page, n('04-idpage-assign'), {a6: out.article});
    }
    await openUrnSettings(page, app, ctx);
    const ck2 = await winSave(page, {boxes: {urnCheckNo: false}}, n('05-settings-check-number-off'));
    if (ck2.stillOpen) await winCancel(page);
    log('a6', JSON.stringify(out));
    return out;
}

// ---------------------------------------------------------------------------
// Phase ops: the read-only control

async function phaseOps(app, S, page) {
    const out = {};
    const t = tag('u44k2');
    try {
        await app.api.createContext({tag: `${t}x`, plugins: {urnpubidplugin: {enabled: true}}});
        out.seedKey = 'accepted';
    } catch (e) { out.seedKey = flat(String(e.message || e), 400); }
    const ctx = await app.api.createContext({tag: `${t}p`, users: [{username: `${t}pmg`, roles: ['manager']}, {username: `${t}pau`, roles: ['author']}]});
    const s = await app.api.createSubmission({tag: `${t}p1`, context: ctx.path, submitter: `${t}pau`});
    await signIn(page, `${t}pmg`, {contextPath: ctx.path});
    await gotoPlugins(page, app, ctx.path);
    out.grid = await pluginsRead(page);
    await snap(page, 'x-01-plugins-control', {grid: out.grid});
    await gotoVersionPage(page, app, ctx.path, s.submissionId, s.publicationId, 'titleAbstract');
    out.menu = await sideMenu(page);
    await snap(page, 'x-02-menu-control', {menu: out.menu});
    await gotoVersionPage(page, app, ctx.path, s.submissionId, s.publicationId, 'identifiers');
    out.byAddress = {heading: await wf(page).getByRole('heading').allInnerTexts().catch(() => [])};
    await snap(page, 'x-03-identifiers-by-address-control', {byAddress: out.byAddress});
    log('ops control', JSON.stringify({seedKey: out.seedKey, cats: out.grid.categories, pubIds: out.grid.pubIdsRows, urn: out.grid.urnRow, ids: out.menu.identifiersLinks, byAddress: out.byAddress}));
    return out;
}

// ---------------------------------------------------------------------------

forEachApp(async (app) => {
    if (app.name === 'ops') {
        if (!on('ops')) return;
        const {page, close} = await launch(app);
        try { record('k2-ops', await phaseOps(app, null, page)); } finally { await close(); }
        return;
    }
    let S = fs.existsSync(statePath(app)) ? loadState(app) : null;
    if (on('seed') || !S) S = await seed(app);
    const {page, close} = await launch(app);
    try {
        if (on('win')) record('k2-win', await phaseWin(app, S, page), {merge: true});
        if (on('def')) record('k2-def', await phaseDef(app, S, page), {merge: true});
        if (on('own')) record('k2-own', await phaseOwn(app, S, page), {merge: true});
        if (on('cus')) {
            record('k2-cus', await phaseCus(app, S, page), {merge: true});
            record('k2-cusv', await phaseCusVersion(app, S, page), {merge: true});
            saveState(app, S);
        }
        if (on('pub')) record('k2-pub', await phasePub(app, S, page), {merge: true});
        if (on('a6') && app.name === 'ojs') record('k2-a6', await phaseA6(app, S, page), {merge: true});
    } finally {
        saveState(app, S);
        await close();
    }
});
