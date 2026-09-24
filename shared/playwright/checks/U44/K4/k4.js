// U44 claim check K4 — "Everything around" on all three apps (docs/specs/U44-identifiers.md, chunk K4):
// Purpose (10–35), Actors & permissions (36–60), Rule 21 what readers see (281–290), Side effects (291–305),
// Cross-feature interactions (331–360), the Canonical preamble (361–366) and the Coverage section.
//
// Run: PROBE_FEATURE=U44 PROBE_AGENT=ccK4 node bin/probe.js <all|ojs|omp|ops> shared/playwright/checks/U44/K4/k4.js
//      PHASES=seed,pk,settings,...  (default all; later phases read k4-state-<app>.json; FRESH=1 seeds anew)
//      A full run outlasts the Bash cap: launch it detached (nohup … &) and poll the pid.
//
// Scratch contexts per app (tag u44k4…):
//   J   every "Publisher ID" box ticked; OJS/OMP the URN plugin on (default patterns, no check number; OJS articles,
//       galleys, issues; OMP monographs, chapters, formats, files), the Author role with "Permit submission metadata
//       edit." (OPS: its default); OJS issues Vol. 1 No. 2 (2014, published) and Vol. 2 No. 1 (2015). Accounts: manager
//       mg, editor ed, productionEditor pe {OJS OMP}, sectionEditor se (assigned), sectionEditor sn (assigned without
//       "Permissions"), layoutEditor le {OJS OMP}, proofreader pr {OJS}, author au, reader rd.
//       Submissions: A (production, galley "PDF" on OJS/OPS; se, sn, le, pr assigned) and P (the one published with
//       identifiers, for the reader pages).
//   J2  the other ends: OJS/OMP Editor and Production Editor without "Permit changes to Settings"; the Author role
//       without "Permit submission metadata edit." (OPS set so; OJS/OMP the default). Submission B by its author.
//   J3  (phase admin) the site administrator enrolled with an assistant role and their manager role ended on screen.
//
// Phases:
//   seed      the contexts and submissions above
//   pk        publicknowledge read only (manager.maya): the "Publisher ID" boxes, the URN plugin row, "Issues" (361–365, 28–31)
//   settings  Actors rows 1–2 and 42–46: Settings › Workflow › "Metadata" and Website › "Plugins" per role; the Metadata tab
//             left with an unticked box (sweep)
//   idpage    Actors rows 3–4 (q1): the article's "Identifiers" page per role; the Editor's control save
//   meta      Actors row 5 (q2): the Metadata page's "Publisher ID" per role, author view at both ends of the permission
//   galley    Actors row 6 (q19): the galley row's "Edit" and its "Identifiers" tab per role; OPS before and after posting
//   issues    Actors rows 7–8 {OJS}: Issues › "Edit" › "Identifiers", the issue galley form, "Publish Issue" per role
//   press     Actors row 9 {OMP}: chapter, format and format-file windows per role
//   pub       P gets its identifiers on screen (URN assigned, cleared, assigned; Publisher IDs; galley / format tab; OJS
//             the issue's tab), mail / Activity Log / Tasks counted around it (302–304), JATS XML (297), then published
//   reader    Rule 21 (q22), Actors row 10, page tags (293–296) with the two tag plugins on, then off
//   exports   Native XML export of P (300–301)
//   plugoff   Cross-feature 339–340: the URN plugin turned off, is "Identifiers" still listed (OMP) / gone (OJS)
//   admin     42–46: a site administrator without a manager role in the context
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, signOut, screen, shot, record, loc, note, idle, tag, settled, outDir} = require('../../../probe');

const T = 30_000;
const ALL = ['seed', 'pk', 'settings', 'idpage', 'meta', 'galley', 'issues', 'press', 'pub', 'reader', 'exports', 'plugoff', 'admin'];
const PHASES = (process.env.PHASES || ALL.join(',')).split(',').map((s) => s.trim());
const on = (p) => PHASES.includes(p);
const log = (...a) => console.log('[k4]', ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (s, n = 4000) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));
const vis = '[role="dialog"]:visible';
const topWin = (page) => page.locator(vis).last();
const wf = (page) => page.locator(vis).first();
const PREFIX = 'urn:nbn:de:0000-';
const RESOLVER = 'https://nbn-resolving.de/';

async function snap(page, name, extra = {}) {
    let s;
    try { s = await screen(page); } catch (e) { s = {url: page.url(), error: String(e.message).slice(0, 200)}; }
    Object.assign(s, extra);
    record(name, s);
    await shot(page, name).catch(() => {});
    return s;
}
const dialogTexts = (page) => page.locator(vis).evaluateAll((els) => els.map((d) => ({
    name: d.getAttribute('aria-label') || (d.getAttribute('aria-labelledby') && document.getElementById(d.getAttribute('aria-labelledby'))?.innerText) || null,
    text: d.innerText.slice(0, 3000),
}))).catch(() => []);
const menuItems = (page) => page.locator('[role="menuitem"]:visible').evaluateAll((els) => els.map((e) => e.textContent.trim().replace(/\s+/g, ' '))).catch(() => []);
async function buttonState(locator) {
    const count = await locator.count().catch(() => 0);
    if (!count) return {count};
    const el = locator.first();
    return {count, visible: await el.isVisible().catch(() => null), enabled: await el.isEnabled().catch(() => null)};
}

forEachApp(async (app) => {
    const isOJS = app.name === 'ojs', isOMP = app.name === 'omp', isOPS = app.name === 'ops';
    const sf = path.join(outDir(), `k4-state-${app.name}.json`);
    let S = (!process.env.FRESH && fs.existsSync(sf)) ? JSON.parse(fs.readFileSync(sf, 'utf8')) : {};
    const save = () => fs.writeFileSync(sf, JSON.stringify(S, null, 1));
    const fact = (k, v) => { record('facts', {[k]: v}, {merge: true}); log(`[${app.name} ${k}]`, JSON.stringify(v).slice(0, 2500)); };
    const FILE = isOPS ? 'preprint.pdf' : 'article.pdf';
    const FIXTURE = path.resolve('apps', app.name, 'playwright/fixtures/files', FILE);
    const KINDS = isOJS ? ['publication', 'galley', 'issue', 'issueGalley'] : isOMP ? ['publication', 'chapter', 'representation', 'file'] : ['publication', 'galley'];

    // ================================================================ seed
    if (on('seed') && !S.J) {
        const t = tag('u44k4');
        const roleList = isOPS
            ? [['mg', 'manager'], ['se', 'sectionEditor'], ['sn', 'sectionEditor'], ['au', 'author'], ['rd', 'reader']]
            : [['mg', 'manager'], ['ed', 'editor'], ['pe', 'productionEditor'], ['se', 'sectionEditor'], ['sn', 'sectionEditor'], ['le', 'layoutEditor'], ...(isOJS ? [['pr', 'proofreader']] : []), ['au', 'author'], ['rd', 'reader']];
        const users = (c) => roleList.map(([k, r]) => ({username: `${t}${c}${k}`, roles: [r], givenName: k.toUpperCase(), familyName: `K4${c}`}));
        const urn = isOJS ? {enablePublicationURN: true, enableRepresentationURN: true, enableIssueURN: true}
            : {enablePublicationURN: true, enableChapterURN: true, enableRepresentationURN: true, enableSubmissionFileURN: true};
        const issues = isOJS ? [{volume: 1, number: 2, year: 2014, published: true}, {volume: 2, number: 1, year: 2015}] : undefined;
        const ctx = (c, name) => ({name: `U44 K4 ${name} ${t}`, acronym: isOJS ? 'JPK' : 'PKP', contactName: 'K4 Contact', contactEmail: `${t}${c}c@mail.test`});
        const J = await app.api.createContext({tag: `${t}j`, context: ctx('j', 'J'), users: users('j'), enablePublisherId: KINDS, issues,
            ...(isOPS ? {} : {roles: {author: {permitMetadataEdit: true}},
                plugins: {urnpubidplugin: {enabled: true, settings: {...urn, urnPrefix: PREFIX, urnSuffix: 'default', urnCheckNo: false, urnNamespace: 'urn:nbn:de', urnResolver: RESOLVER}}}})});
        S.t = t; S.J = J.path; S.issues = J.issues || null;
        S.u = Object.fromEntries(roleList.map(([k]) => [k, `${t}j${k}`]));
        const j2Roles = isOPS ? [['mg', 'manager'], ['au', 'author']] : [['mg', 'manager'], ['ed', 'editor'], ['pe', 'productionEditor'], ['au', 'author']];
        const J2 = await app.api.createContext({tag: `${t}k`, context: ctx('k', 'J2'), users: j2Roles.map(([k, r]) => ({username: `${t}k${k}`, roles: [r], givenName: k.toUpperCase(), familyName: 'K4k'})),
            enablePublisherId: isOMP ? ['publication', 'chapter'] : ['publication', 'galley'],
            roles: isOPS ? {author: {permitMetadataEdit: false}} : {editor: {permitSettings: false}, productionEditor: {permitSettings: false}}});
        S.J2 = J2.path; S.u2 = Object.fromEntries(j2Roles.map(([k]) => [k, `${t}k${k}`]));
        const prod = isOPS ? {} : {files: [{file: 'article.pdf'}], decisions: ['skipExternalReview', 'sendToProduction']};
        const gal = isOMP ? {} : {galleys: [{label: 'PDF', file: FILE}]};
        const parts = [{username: S.u.se, role: 'sectionEditor'}, {username: S.u.sn, role: 'sectionEditor', canChangeMetadata: false}]
            .concat(isOPS ? [] : [{username: S.u.le, role: 'layoutEditor'}]).concat(isOJS ? [{username: S.u.pr, role: 'proofreader'}] : []);
        for (const k of ['A', 'P']) {
            const r = await app.api.createSubmission({tag: `${t}${k.toLowerCase()}`, context: S.J, submitter: S.u.au, title: `K4 ${k} ${t}`,
                participants: k === 'A' ? parts : [{username: S.u.se, role: 'sectionEditor'}], ...prod, ...gal});
            S[k] = {id: r.submissionId, pub: r.publicationId, galleys: r.galleys || null};
        }
        const b = await app.api.createSubmission({tag: `${t}b`, context: S.J2, submitter: S.u2.au, title: `K4 B ${t}`});
        S.B = {id: b.submissionId, pub: b.publicationId};
        save();
        log('[seed]', JSON.stringify(S));
    }
    if (!S.J) { log('no state; run the seed phase'); return; }

    const cUrl = (ctx, p) => app.url(`/index.php/${ctx}${p}`);
    const wfUrl = (ctx, id, key, author) => cUrl(ctx, `/dashboard/${author ? 'mySubmissions' : 'editorial'}?workflowSubmissionId=${id}${key ? `&workflowMenuKey=${key}` : ''}`);

    const {page, close} = await launch(app);
    const jsDialogs = [];
    page.on('dialog', async (d) => {
        jsDialogs.push({at: Date.now(), type: d.type(), message: d.message()});
        if (d.type() === 'beforeunload') await d.accept().catch(() => {}); else await d.dismiss().catch(() => {});
    });
    const traffic = [];
    page.on('response', async (r) => {
        const m = r.request().method();
        const u = r.url();
        if (m === 'GET' && r.status() < 400) return;
        if (/\.(js|css|png|svg|woff2?)(\?|$)/.test(u)) return;
        let body = '';
        if (m !== 'GET') { try { body = (await r.text()).slice(0, 600); } catch { /* ignore */ } }
        traffic.push({at: Date.now(), method: m, override: r.request().headers()['x-http-method-override'] || null, status: r.status(), url: u.replace(/^.*\/index\.php/, '').slice(0, 200), body: flat(body, 300)});
    });
    const since = (t0) => traffic.filter((p) => p.at >= t0).map(({at, ...p}) => p);
    const dlgSince = (t0) => jsDialogs.filter((d) => d.at >= t0).map(({at, ...d}) => d);
    let who = null;
    const as = async (u, ctx = S.J) => {
        if (who === `${u}@${ctx}`) return;
        await signIn(page, u, {contextPath: ctx}); await idle(page); who = `${u}@${ctx}`;
    };
    const safe = async (label, fn) => {
        try { return await fn(); } catch (e) {
            const err = String(e.message || e).split('\n')[0].slice(0, 300);
            log(`[${app.name} ${label}] ERROR`, err);
            await snap(page, `err-${label.replace(/[^a-z0-9-]/gi, '-')}`).catch(() => {});
            return {error: err};
        }
    };

    // ---------------------------------------------------------------- workflow helpers
    async function openWf(ctx, id, key, {author = false, name} = {}) {
        await page.goto(wfUrl(ctx, id, key, author)); await idle(page);
        await page.locator(vis).first().waitFor({timeout: T}).catch(() => {});
        await page.waitForFunction(() => !document.body.innerText.includes('Loading'), null, {timeout: 15000}).catch(() => {});
        await idle(page); await sleep(400);
        return name ? snap(page, name) : null;
    }
    const sideMenu = () => wf(page).evaluate((d) => [...d.querySelectorAll('nav a, nav button, [role=treeitem]')].filter((e) => e.getClientRects().length).map((e) => e.innerText.trim().replace(/\s+/g, ' ')).filter(Boolean).slice(0, 80)).catch(() => []);
    const heading = () => wf(page).locator('h1, h2').allInnerTexts().catch(() => []);

    async function urnField() {
        return wf(page).evaluate((root) => {
            const t = (e) => (e ? e.innerText.replace(/\s+/g, ' ').trim() : null);
            const fields = [...root.querySelectorAll('.pkpFormField')];
            const f = fields.find((x) => /\bURN\b/.test(t(x.querySelector('label, .pkpFormFieldLabel')) || ''));
            const headings = [...root.querySelectorAll('h1, h2')].map(t).filter(Boolean);
            if (!f) return {found: false, headings, fieldLabels: fields.map((x) => t(x.querySelector('label'))).filter(Boolean)};
            const input = f.querySelector('input');
            return {found: true, headings, label: t(f.querySelector('label')), value: input ? input.value : null, disabled: input ? input.disabled : null, readOnly: input ? input.readOnly : null,
                buttons: [...f.querySelectorAll('button')].map((b) => ({text: t(b), disabled: b.disabled || b.getAttribute('aria-disabled') === 'true'})), text: t(f)};
        }).catch((e) => ({error: String(e.message || e)}));
    }
    async function readIdPage(ctx, sub, name, {author = false} = {}) {
        await openWf(ctx, sub.id, `publication_${sub.pub}_identifiers`, {author});
        await wf(page).locator('.pkpFormField').filter({hasText: 'URN'}).first().waitFor({state: 'visible', timeout: 12_000}).catch(() => {});
        await idle(page); await sleep(400);
        const field = await urnField();
        const menu = await sideMenu();
        const save = await buttonState(wf(page).getByRole('button', {name: 'Save', exact: true}));
        const banner = ((await wf(page).innerText().catch(() => '')) || '').split('\n').map((l) => l.trim()).filter((l) => /can not be edited|cannot be edited|has been published|not allowed|permission/i.test(l));
        const s = await snap(page, name, {urnField: field, menu, save, banner});
        return {listed: menu.includes('Identifiers'), menu, field, save, banner, url: s.url, headings: field.headings};
    }
    const urnButton = (label) => wf(page).locator('.pkpFormField').filter({hasText: 'URN'}).first().getByRole('button', {name: label, exact: true});
    async function pubSave(name) {
        const button = wf(page).getByRole('button', {name: 'Save', exact: true});
        const st = await buttonState(button);
        if (!st.count || !st.enabled) return {pressed: false, st};
        const t0 = Date.now();
        const w = page.waitForResponse((r) => /\/publications\/\d+/.test(r.url()) && r.request().method() === 'POST', {timeout: T}).catch(() => null);
        await button.click();
        const resp = await w;
        let body = null;
        try { body = resp ? await resp.json() : null; } catch { body = null; }
        await page.locator('[role="status"]').filter({hasText: /Saved|not saved/}).first().waitFor({timeout: 8000}).catch(() => {});
        await sleep(500);
        const status = await page.locator('[role="status"]').allInnerTexts().catch(() => []);
        const errs = await wf(page).locator('.pkpFieldError, .pkpFormPage__errors').allInnerTexts().catch(() => []);
        const out = {pressed: true, status: resp ? resp.status() : null, errors: body && body.errors ? body.errors : null,
            urn: body && !body.errors ? (body['pub-id::other::urn'] ?? null) : undefined, publisherId: body && !body.errors ? (body['pub-id::publisher-id'] ?? null) : undefined,
            inline: status.map((x) => flat(x, 100)).filter(Boolean), fieldErrors: errs.map((x) => flat(x, 200)), traffic: since(t0).filter((x) => x.method !== 'GET')};
        if (name) await snap(page, name, {pubSave: out});
        return out;
    }
    async function pubRead(ctx, sub) {
        return page.evaluate(async ({url}) => {
            const r = await fetch(url, {headers: {'X-Requested-With': 'XMLHttpRequest'}});
            const j = await r.json().catch(() => null);
            return j ? {status: r.status, urn: j['pub-id::other::urn'] ?? null, publisherId: j['pub-id::publisher-id'] ?? null, issueId: j.issueId ?? null, statusCode: j.status} : {status: r.status};
        }, {url: cUrl(ctx, `/api/v1/submissions/${sub.id}/publications/${sub.pub}`)});
    }
    async function assignIssueOJS(ctx, sub, name) {
        await openWf(ctx, sub.id, `publication_${sub.pub}_issue`);
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
        return pubSave(name);
    }

    // the Metadata page (Vue form)
    const metaForm = () => wf(page).locator('form').filter({has: page.getByRole('button', {name: 'Save', exact: true})}).first();
    async function readMeta(ctx, sub, name, {author = false} = {}) {
        await openWf(ctx, sub.id, `publication_${sub.pub}_metadata`, {author});
        await settled(page, wf(page).locator('form').first(), {timeout: 15000});
        const box = wf(page).getByRole('textbox', {name: 'Publisher ID', exact: true});
        const present = (await box.count()) > 0;
        const out = {menu: await sideMenu(), headings: await heading(), present,
            value: present ? await box.inputValue().catch(() => null) : null,
            disabled: present ? await box.isDisabled().catch(() => null) : null,
            readOnly: present ? await box.evaluate((e) => e.readOnly).catch(() => null) : null,
            save: await buttonState(wf(page).getByRole('button', {name: 'Save', exact: true})),
            labels: await wf(page).locator('form label, form legend').allInnerTexts().catch(() => []),
            pidHelp: present ? await wf(page).locator('.pkpFormField').filter({has: box}).first().innerText().catch(() => null) : null};
        out.labels = out.labels.map((x) => flat(x, 80)).filter(Boolean).slice(0, 40);
        out.pidHelp = flat(out.pidHelp, 400);
        const banner = ((await wf(page).innerText().catch(() => '')) || '').split('\n').map((l) => l.trim()).filter((l) => /can not be edited|cannot be edited|has been published|not allowed|permission|read.only/i.test(l));
        out.banner = banner;
        await snap(page, name, {meta: out});
        return out;
    }
    async function saveMetaPid(value, name) {
        const box = wf(page).getByRole('textbox', {name: 'Publisher ID', exact: true});
        if (!(await box.count())) return {present: false};
        if (await box.isDisabled().catch(() => true)) return {disabled: true};
        await box.fill(value);
        return pubSave(name);
    }

    // the galley window (Galleys page › row menu › "Edit") and its "Identifiers" tab
    async function openGalleyEdit(ctx, sub, name, {author = false} = {}) {
        await openWf(ctx, sub.id, `publication_${sub.pub}_galleys`, {author});
        const panel = wf(page);
        const row = panel.locator('tbody tr').filter({hasText: 'PDF'}).first();
        await row.waitFor({timeout: 20000}).catch(() => {});
        const rowButtons = await row.locator('button').evaluateAll((els) => els.map((e) => (e.innerText || e.getAttribute('aria-label') || '').trim())).catch(() => []);
        const out = {menu: await sideMenu(), rowText: flat(await row.innerText().catch(() => null), 200), rowButtons, items: [], tabs: []};
        const galleyControls = await panel.locator('button, a').evaluateAll((els) => els.filter((e) => e.getClientRects().length).map((e) => (e.innerText || e.getAttribute('aria-label') || '').trim()).filter(Boolean)).catch(() => []);
        out.pageControls = galleyControls.filter((x) => /Galley|Add|Edit|Upload|Delete/i.test(x)).slice(0, 20);
        if (!rowButtons.length) { await snap(page, name, {galley: out}); return out; }
        await row.locator('button').last().click(); await idle(page); await sleep(300);
        out.items = await menuItems(page);
        const edit = page.getByRole('menuitem', {name: 'Edit', exact: true}).first();
        if (!(await edit.count())) { await snap(page, name, {galley: out}); await page.keyboard.press('Escape').catch(() => {}); return out; }
        await edit.click(); await idle(page);
        await page.waitForFunction(() => { const d = [...document.querySelectorAll('[role=dialog]')].filter((e) => e.getClientRects().length).pop(); return d && d.querySelector('[role=tab], .ui-tabs-nav'); }, null, {timeout: 20000}).catch(() => {});
        await idle(page); await sleep(300);
        out.tabs = (await topWin(page).locator('[role=tab]').allInnerTexts().catch(() => [])).map((x) => x.trim());
        out.editMetaFields = await topWin(page).locator('input:visible, select:visible').evaluateAll((els) => els.map((e) => ({name: e.name, disabled: e.disabled}))).catch(() => []);
        await snap(page, name, {galley: out});
        return out;
    }
    async function openIdTab(name) {
        const t = topWin(page).getByRole('tab', {name: 'Identifiers', exact: true});
        if (!(await t.count())) return {absent: true};
        await t.click(); await idle(page);
        await topWin(page).locator('#publicIdentifiersForm').first().waitFor({timeout: 20000}).catch(() => {});
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
            out.boxDisabled = out.publisherIdBox ? await box.isDisabled() : null;
            out.boxReadOnly = out.publisherIdBox ? await box.evaluate((e) => e.readOnly) : null;
            out.inputs = await f.locator('input, button, select').evaluateAll((els) => els.filter((e) => e.type !== 'hidden').map((e) => ({tag: e.tagName, type: e.type, name: e.name, value: e.type === 'checkbox' ? e.checked : e.value, disabled: e.disabled, readOnly: e.readOnly, text: (e.innerText || '').trim()}))).catch(() => []);
            out.text = flat(await f.innerText().catch(() => ''), 1200);
            out.save = await buttonState(f.getByRole('button', {name: 'Save', exact: true}));
            out.links = await f.locator('a:visible').allInnerTexts().catch(() => []);
        }
        await snap(page, name, {idTab: out});
        return out;
    }
    async function saveIdTab(value, name, {assign = false} = {}) {
        const f = topWin(page).locator('#publicIdentifiersForm').first();
        const box = f.locator('input[name="publisherId"]');
        if (value !== null && (await box.count())) { await box.fill(value).catch(() => {}); await box.blur().catch(() => {}); }
        if (assign) {
            const cb = f.locator('input[type=checkbox]').first();
            if (await cb.count()) await cb.check().catch(() => {});
        }
        const save = f.getByRole('button', {name: 'Save', exact: true});
        if (!(await save.count())) return {noSave: true};
        const nBefore = (await dialogTexts(page)).length;
        const t0 = Date.now();
        await save.click().catch(() => {});
        await page.waitForResponse((r) => /updateIdentifiers|update-identifiers/i.test(r.url()), {timeout: 20000}).catch(() => {});
        await idle(page); await sleep(900); await idle(page);
        const nAfter = (await dialogTexts(page)).length;
        const notices = await page.locator('.app__notifications, .pkp_notification, [role="alert"]').allInnerTexts().catch(() => []);
        const out = {closed: nAfter < nBefore, traffic: since(t0).filter((x) => x.method !== 'GET'), notices: notices.map((x) => flat(x, 160)).filter(Boolean)};
        if (!out.closed) out.tab = await readIdTab(`${name}-after`); else await snap(page, `${name}-after`, {save: out});
        return out;
    }
    async function closeTopWin() {
        const w = topWin(page);
        const c = w.getByRole('button', {name: /^Close/}).first();
        if (await c.count()) await c.click().catch(() => {});
        await idle(page); await sleep(650);
    }

    // Settings pages
    async function settingsReach(ctx, name) {
        const out = {};
        const r = await page.goto(cUrl(ctx, '/management/settings/workflow')).catch((e) => ({err: String(e.message)}));
        out.status = r && r.status ? r.status() : r;
        await idle(page);
        const hasTab = await page.locator('#metadata-button').count();
        out.navSettings = await page.locator('nav').first().innerText().then((t) => /Settings/.test(t)).catch(() => null);
        out.nav = flat(await page.locator('nav').first().innerText().catch(() => ''), 600);
        if (!hasTab) {
            const s = await snap(page, `${name}-workflow`);
            out.reached = false; out.text = flat(s.text && s.text.main, 300); out.url = s.url;
            return out;
        }
        out.reached = true;
        await page.locator('#metadata-button').first().click(); await idle(page);
        const group = page.getByRole('group', {name: 'Publisher ID'});
        await group.waitFor({timeout: 20000}).catch(() => {});
        out.group = (await group.count()) > 0;
        if (out.group) {
            out.boxes = await group.getByRole('checkbox').evaluateAll((els) => els.map((b) => ({label: (b.closest('label')?.innerText || '').trim(), value: b.value, checked: b.checked, disabled: b.disabled})));
            out.groupText = flat(await group.innerText(), 600);
        }
        await snap(page, `${name}-workflow`, {settings: out});
        return out;
    }
    async function pluginsReach(ctx, name) {
        const out = {};
        const r = await page.goto(cUrl(ctx, '/management/settings/website')).catch((e) => ({err: String(e.message)}));
        out.status = r && r.status ? r.status() : r;
        await idle(page);
        if (!(await page.locator('#plugins-button').count())) {
            const s = await snap(page, `${name}-website`);
            out.reached = false; out.text = flat(s.text && s.text.main, 300);
            return out;
        }
        out.reached = true;
        await page.locator('#plugins-button').click();
        await page.locator('#pluginGridContainer tr.gridRow').first().waitFor({timeout: T}).catch(() => {});
        await idle(page); await sleep(300);
        out.grid = await page.locator('#pluginGridContainer').evaluate((root) => {
            const t = (e) => (e ? e.innerText.replace(/\s+/g, ' ').trim() : null);
            const rows = [...root.querySelectorAll('tr.gridRow')];
            const pick = (re) => { const r = rows.find((x) => re.test(x.id)); return r ? {id: r.id, text: t(r).slice(0, 200), checked: r.querySelector('input[type=checkbox]')?.checked ?? null, boxDisabled: r.querySelector('input[type=checkbox]')?.disabled ?? null, expander: !!r.querySelector('a.show_extras')} : null; };
            return {pubIdsRows: rows.filter((r) => /pubIds/i.test(r.id)).map((r) => ({id: r.id, text: t(r).slice(0, 160)})),
                pubIdCategory: [...root.querySelectorAll('tr')].some((r) => /Public Identifier Plugins/.test(r.innerText)),
                urn: pick(/-row-urnpubidplugin$/), gs: pick(/-row-googlescholarplugin$/), dc: pick(/-row-dublincoremetaplugin$/), jats: pick(/-row-jatstemplateplugin$/)};
        }).catch((e) => ({error: String(e.message)}));
        if (out.grid && out.grid.urn && out.grid.urn.expander) {
            await page.locator('#pluginGridContainer tr.gridRow[id$="-row-urnpubidplugin"] a.show_extras').first().click(); await sleep(400);
            out.urnLinks = await page.locator('#pluginGridContainer tr[id$="-row-urnpubidplugin"] + tr a').evaluateAll((els) => els.filter((e) => e.offsetParent !== null).map((e) => e.innerText.trim()).filter(Boolean)).catch(() => []);
        }
        await snap(page, `${name}-plugins`, {plugins: out});
        return out;
    }
    async function setPluginEnabled(ctx, id, want) {
        await page.goto(cUrl(ctx, '/management/settings/website')); await idle(page);
        await page.locator('#plugins-button').click();
        const row = page.locator(`#pluginGridContainer tr.gridRow[id$="-row-${id}"]`);
        await row.waitFor({timeout: T});
        const box = row.getByRole('checkbox').first();
        const before = await box.isChecked();
        if (before === want) return {before, after: before};
        const t0 = Date.now();
        const w = page.waitForResponse((r) => /settings-plugin-grid\/(enable|disable)/.test(r.url()), {timeout: T}).catch(() => null);
        await box.click({noWaitAfter: true}).catch(() => box.dispatchEvent('click'));
        await sleep(600);
        const dlg = page.locator(vis);
        let question = null;
        if (await dlg.count()) {
            question = flat(await dlg.last().innerText().catch(() => null), 300);
            const ok = dlg.last().getByRole('button', {name: /^(OK|Yes)$/}).first();
            if (await ok.count()) await ok.click();
        }
        const resp = await w;
        await sleep(600); await idle(page);
        return {before, question, status: resp ? resp.status() : null, after: await row.getByRole('checkbox').first().isChecked().catch(() => null), js: dlgSince(t0)};
    }

    // Activity Log / Tasks / mail
    async function activityLog(ctx, sub, name) {
        await openWf(ctx, sub.id, null);
        const btn = wf(page).getByRole('button', {name: 'Activity Log', exact: true}).first();
        if (!(await btn.count())) return {absent: true};
        await btn.click(); await idle(page);
        const dlg = page.locator(vis).last();
        await dlg.locator('table tbody tr td').first().waitFor({timeout: 20000}).catch(() => {});
        await idle(page); await sleep(500);
        const rows = await dlg.locator('table tbody tr').evaluateAll((els) => els.map((tr) => [...tr.querySelectorAll('td')].map((td) => td.innerText.trim().replace(/\s+/g, ' ')).join(' | '))).catch(() => []);
        await snap(page, name, {rows});
        const c = dlg.getByRole('button', {name: /^Close$/}).first();
        if (await c.count()) { await c.click(); await idle(page); await sleep(600); }
        const tasks = flat(await page.getByRole('button', {name: /^Tasks/}).first().innerText().catch(() => ''), 40);
        return {rows, tasks};
    }
    const allEmails = () => [...Object.values(S.u), 'admin'].map((u) => `${u}@mail.test`);
    async function mailCounts() {
        const o = {};
        for (const e of allEmails()) o[e] = await app.mail.count({to: e}).catch(() => null);
        return o;
    }
    async function mailSubjects(emails) {
        const out = [];
        for (const e of emails) {
            const list = await app.mail.inboxFor(e, {timeout: 3000}).catch(() => []);
            for (const m of list.slice(0, 10)) out.push({to: e, subject: m.Subject, created: m.Created});
        }
        return out;
    }

    // reader page read: URN / publisher ID anywhere (text, links, meta tags, attributes)
    async function readerRead(url, name) {
        const r = await page.goto(url).catch((e) => ({err: String(e.message)}));
        await idle(page);
        const data = await page.evaluate(() => {
            const body = document.body.innerText;
            const lines = body.split('\n').map((l) => l.trim()).filter((l) => /urn:|\bURN\b|pid-|Publisher ID/i.test(l));
            const links = [...document.querySelectorAll('a')].filter((a) => /urn:|pid-/i.test(a.getAttribute('href') || '') || /urn:|pid-/i.test(a.innerText)).map((a) => ({text: a.innerText.trim(), href: a.getAttribute('href')}));
            const metas = [...document.querySelectorAll('meta')].map((m) => ({name: m.getAttribute('name') || m.getAttribute('property'), content: m.getAttribute('content')})).filter((m) => m.name && /^(DC\.|citation_)/.test(m.name));
            const html = document.documentElement.outerHTML;
            const pidHits = [...html.matchAll(/.{0,80}pid-[a-z0-9]+.{0,40}/gi)].map((m) => m[0]).slice(0, 12);
            const urnBlocks = [...document.querySelectorAll('.pubid, .item.pubid, .pub_id, [class*="pubid"], [class*="pub_id"]')].map((e) => ({cls: e.className, text: e.innerText.replace(/\s+/g, ' ').trim().slice(0, 300), html: e.innerHTML.replace(/\s+/g, ' ').slice(0, 400)}));
            return {title: document.title, lines, links, metas, pidHits, urnBlocks};
        });
        data.status = r && r.status ? r.status() : r;
        await snap(page, name, {reader: data});
        return data;
    }

    try {
        // ============================================================ pk: publicknowledge read only
        if (on('pk')) fact('pk', await safe('pk', async () => {
            const out = {};
            await as('manager.maya', 'publicknowledge');
            out.settings = await settingsReach('publicknowledge', 'pk-maya');
            out.plugins = await pluginsReach('publicknowledge', 'pk-maya');
            const r = await page.goto(cUrl('publicknowledge', '/manageIssues')).catch((e) => ({err: String(e.message)}));
            await idle(page);
            const s = await snap(page, 'pk-maya-manageIssues');
            out.manageIssues = {status: r && r.status ? r.status() : r, url: s.url, text: flat(s.text && s.text.main, 300)};
            out.nav = flat(await page.locator('nav').first().innerText().catch(() => ''), 800);
            return out;
        }));

        // ============================================================ settings: Actors rows 1–2, 42–46
        if (on('settings')) {
            const levels = isOPS ? ['mg', 'se', 'au', 'admin'] : ['mg', 'ed', 'pe', 'se', 'le', 'au', 'admin'];
            const res = {};
            for (const k of levels) {
                res[k] = await safe(`settings-${k}`, async () => {
                    await as(k === 'admin' ? 'admin' : S.u[k]);
                    return {settings: await settingsReach(S.J, `set-${k}`), plugins: await pluginsReach(S.J, `set-${k}`)};
                });
            }
            if (!isOPS) for (const k of ['ed', 'pe']) {
                res[`J2${k}`] = await safe(`settings-J2${k}`, async () => {
                    await as(S.u2[k], S.J2);
                    return {settings: await settingsReach(S.J2, `set-J2${k}`), plugins: await pluginsReach(S.J2, `set-J2${k}`)};
                });
            }
            fact('settings', res);
            // sweep: the Metadata tab left with an unticked box, unsaved: another tab, then another page
            fact('settingsLeave', await safe('settings-leave', async () => {
                await as(S.u.mg);
                await settingsReach(S.J, 'set-leave-0');
                const group = page.getByRole('group', {name: 'Publisher ID'});
                const box = group.getByRole('checkbox').nth(1);
                await box.click();
                const t0 = Date.now();
                const tabs = await page.locator('[role=tab]:visible').allInnerTexts().catch(() => []);
                const other = page.locator('#components-button, #disableSubmissions-button, [role=tab]:visible').filter({hasNotText: 'Metadata'}).first();
                const otherName = flat(await other.innerText().catch(() => null), 60);
                await other.click().catch(() => {});
                await idle(page); await sleep(500);
                const afterTab = await snap(page, 'set-leave-1-othertab');
                await page.locator('#metadata-button').first().click().catch(() => {});
                await idle(page); await sleep(300);
                const stillUnticked = await group.getByRole('checkbox').nth(1).isChecked().catch(() => null);
                await page.goto(cUrl(S.J, '/management/settings/website')).catch((e) => ({err: String(e.message)}));
                await idle(page);
                const d = dlgSince(t0);
                const back = await settingsReach(S.J, 'set-leave-2-back');
                return {tabs, otherName, boxCheckedAfterTabSwitch: stillUnticked, dialogs: d, boxesAfterReturn: back.boxes, afterTabUrl: afterTab.url};
            }));
        }

        // ============================================================ idpage: Actors rows 3–4 (q1)
        if (on('idpage')) {
            if (isOPS) {
                fact('idpage', await safe('idpage-ops', async () => {
                    await as(S.u.mg);
                    const r = await readIdPage(S.J, S.A, 'id-ops-mg');
                    const pl = await pluginsReach(S.J, 'id-ops-mg');
                    return {listed: r.listed, menu: r.menu, field: r.field, url: r.url, pubIdsRows: pl.grid && pl.grid.pubIdsRows, category: pl.grid && pl.grid.pubIdCategory, urnRow: pl.grid && pl.grid.urn};
                }));
            } else {
                const res = {};
                if (isOJS && !S.aIssue) {
                    res.issue = await safe('idpage-issue', async () => { await as(S.u.ed); return assignIssueOJS(S.J, S.A, 'id-00-assign-issue'); });
                    S.aIssue = true; save();
                }
                const order = isOJS ? ['mg', 'pe', 'se', 'le', 'pr', 'au', 'sn', 'ed'] : ['mg', 'pe', 'se', 'le', 'au', 'sn', 'ed'];
                for (const k of order) {
                    res[k] = await safe(`idpage-${k}`, async () => {
                        await as(S.u[k]);
                        const o = await readIdPage(S.J, S.A, `id-${k}`, {author: k === 'au'});
                        if (k === 'au') {
                            // the author's own view: the menu, and whether the editorial address shows it
                            o.editorialAddress = await readIdPage(S.J, S.A, `id-${k}-editorial-address`).then((x) => ({listed: x.listed, url: x.url, field: x.field, headings: x.headings})).catch((e) => ({error: String(e.message)}));
                        }
                        if (k === 'sn' || k === 'ed') {
                            const assign = urnButton('Assign');
                            o.assignOffered = await buttonState(assign);
                            if (o.field && o.field.found && o.field.value) {
                                const clear = urnButton('Clear');
                                if (await clear.count()) { await clear.click(); await sleep(300); o.cleared = await pubSave(`id-${k}-clear-save`); }
                            }
                            if (await urnButton('Assign').count()) {
                                await urnButton('Assign').click().catch(() => {});
                                await sleep(400);
                                o.afterAssign = await urnField();
                                o.saved = await pubSave(`id-${k}-assign-save`);
                                o.stored = await pubRead(S.J, S.A);
                                o.reread = await readIdPage(S.J, S.A, `id-${k}-reread`).then((x) => x.field);
                            }
                        }
                        return o;
                    });
                }
                fact('idpage', res);
            }
        }

        // ============================================================ meta: Actors row 5 (q2)
        if (on('meta')) {
            const res = {};
            res.au = await safe('meta-au', async () => {
                await as(S.u.au);
                const o = await readMeta(S.J, S.A, 'meta-au-J', {author: true});
                if (o.present && !o.disabled && o.save.enabled) { o.save1 = await saveMetaPid('pid-au1', 'meta-au-J-save'); o.stored = await pubRead(S.J, S.A); }
                return o;
            });
            res.auJ2 = await safe('meta-auJ2', async () => {
                await as(S.u2.au, S.J2);
                const o = await readMeta(S.J2, S.B, 'meta-au-J2', {author: true});
                if (o.present && !o.disabled && o.save.enabled) { o.save1 = await saveMetaPid('pid-au2', 'meta-au-J2-save'); o.stored = await pubRead(S.J2, S.B); }
                return o;
            });
            res.sn = await safe('meta-sn', async () => {
                await as(S.u.sn);
                const o = await readMeta(S.J, S.A, 'meta-sn');
                if (o.present && !o.disabled && o.save.enabled) { o.save1 = await saveMetaPid('pid-sn1', 'meta-sn-save'); o.stored = await pubRead(S.J, S.A); }
                return o;
            });
            res.se = await safe('meta-se', async () => {
                await as(S.u.se);
                const o = await readMeta(S.J, S.A, 'meta-se');
                if (o.present && !o.disabled && o.save.enabled) { o.save1 = await saveMetaPid('pid-se1', 'meta-se-save'); o.stored = await pubRead(S.J, S.A); }
                return o;
            });
            if (!isOPS) res.le = await safe('meta-le', async () => {
                await as(S.u.le);
                const o = await readMeta(S.J, S.A, 'meta-le');
                if (o.present && !o.disabled && o.save.enabled) { o.save1 = await saveMetaPid('pid-le1', 'meta-le-save'); o.stored = await pubRead(S.J, S.A); }
                return o;
            });
            fact('meta', res);
        }

        // ============================================================ galley: Actors row 6 (q19)
        if (on('galley') && !isOMP) {
            const res = {};
            const drive = async (k, label, {author = false, saveValue} = {}) => {
                await as(k === 'admin' ? 'admin' : S.u[k]);
                const g = await openGalleyEdit(S.J, S.A, `gal-${label}`, {author});
                const o = {items: g.items, tabs: g.tabs, rowButtons: g.rowButtons, pageControls: g.pageControls, editMetaFields: g.editMetaFields};
                if (g.tabs.includes('Identifiers')) {
                    o.tab = await openIdTab(`gal-${label}-tab`);
                    if (saveValue && o.tab.formPresent) o.saved = await saveIdTab(saveValue, `gal-${label}-save`);
                    if (o.saved && o.saved.closed) {
                        const g2 = await openGalleyEdit(S.J, S.A, `gal-${label}-reopen`, {author});
                        if (g2.tabs.includes('Identifiers')) o.reopen = (await openIdTab(`gal-${label}-reopen-tab`)).value;
                    }
                }
                await closeTopWin();
                return o;
            };
            if (isOJS) {
                for (const k of ['mg', 'ed', 'admin', 'se', 'le', 'pr', 'sn']) res[k] = await safe(`galley-${k}`, () => drive(k, k, {saveValue: `pidg-${k}`}));
                res.au = await safe('galley-au', () => drive('au', 'au', {author: true, saveValue: 'pidg-au'}));
                res.pe = await safe('galley-pe', () => drive('pe', 'pe', {saveValue: 'pidg-pe'}));
            } else {
                for (const k of ['au']) res[`${k}Pre`] = await safe(`galley-${k}-pre`, () => drive(k, `${k}-pre`, {author: true, saveValue: `pidg-${k}pre`}));
                for (const k of ['se', 'sn', 'mg']) res[`${k}Pre`] = await safe(`galley-${k}-pre`, () => drive(k, `${k}-pre`, {saveValue: `pidg-${k}pre`}));
                res.post = await safe('galley-post', async () => {
                    await as(S.u.mg);
                    await openWf(S.J, S.A.id, `publication_${S.A.pub}_titleAbstract`);
                    const {postPreprint} = require(path.join(app.suiteDir, 'pages', 'PublicationPages.js'));
                    await postPreprint(page);
                    await snap(page, 'gal-posted');
                    return {posted: true, stored: await pubRead(S.J, S.A)};
                });
                res.auPost = await safe('galley-au-post', () => drive('au', 'au-post', {author: true, saveValue: 'pidg-aupost'}));
                for (const k of ['se', 'sn', 'mg', 'admin']) res[`${k}Post`] = await safe(`galley-${k}-post`, () => drive(k, `${k}-post`, {saveValue: `pidg-${k}post`}));
            }
            fact('galley', res);
        }

        // ============================================================ issues: Actors rows 7–8 {OJS}; controls on OMP / OPS
        if (on('issues')) {
            const res = {};
            const reach = async (k, label) => {
                await as(k === 'admin' ? 'admin' : S.u[k]);
                const r = await page.goto(cUrl(S.J, '/manageIssues')).catch((e) => ({err: String(e.message)}));
                await idle(page);
                const s = await snap(page, `iss-${label}-manage`);
                const nav = flat(await page.locator('nav').first().innerText().catch(() => ''), 800);
                const o = {status: r && r.status ? r.status() : r, url: s.url, text: flat(s.text && s.text.main, 300), navIssues: /\bIssues\b/.test(nav), nav};
                o.grid = await page.locator('tr.gridRow').allInnerTexts().then((x) => x.map((y) => flat(y, 120))).catch(() => []);
                return o;
            };
            const levels = isOJS ? ['mg', 'ed', 'pe', 'admin', 'se', 'le', 'au'] : ['mg', 'admin', 'se'];
            for (const k of levels) {
                res[k] = await safe(`issues-${k}`, async () => {
                    const o = await reach(k, k);
                    if (!isOJS || !o.grid.length) return o;
                    const row = page.locator('tr.gridRow').filter({hasText: 'Vol. 2 No. 1 (2015)'}).first();
                    if (!(await row.count())) return o;
                    await row.locator('a.show_extras').click(); await sleep(400);
                    o.rowLinks = await page.locator(`[id="${await row.getAttribute('id')}-control-row"] a`).evaluateAll((els) => els.filter((e) => e.getClientRects().length).map((e) => e.innerText.trim()).filter(Boolean)).catch(() => []);
                    await page.getByRole('link', {name: 'Edit', exact: true}).filter({visible: true}).first().click();
                    await idle(page);
                    await page.waitForFunction(() => { const d = [...document.querySelectorAll('[role=dialog]')].filter((e) => e.getClientRects().length).pop(); return d && d.querySelector('[role=tab]'); }, null, {timeout: 20000}).catch(() => {});
                    await idle(page); await sleep(300);
                    o.tabs = (await topWin(page).locator('[role=tab]').allInnerTexts().catch(() => [])).map((x) => x.trim());
                    if (o.tabs.includes('Identifiers')) o.idTab = await openIdTab(`iss-${k}-idtab`);
                    // the issue galley form's "Publisher ID"
                    const ig = topWin(page).getByRole('tab', {name: 'Issue Galleys', exact: true});
                    if (await ig.count()) {
                        await ig.click(); await idle(page); await sleep(600);
                        const create = topWin(page).getByRole('link', {name: /Create Issue Galley|Add Issue Galley/i}).first();
                        o.createGalley = await create.count();
                        if (o.createGalley) {
                            await create.click(); await idle(page);
                            await page.locator('form#issueGalleyForm').waitFor({timeout: 20000}).catch(() => {});
                            await idle(page); await sleep(300);
                            const f = page.locator('form#issueGalleyForm');
                            o.galleyForm = {labels: (await f.locator('label').allInnerTexts().catch(() => [])).map((x) => flat(x, 80)).filter(Boolean), publisherIdBox: await f.locator('input[name="publicGalleyId"]').count()};
                            await snap(page, `iss-${k}-galleyform`, {galleyForm: o.galleyForm});
                            const c = f.getByRole('link', {name: 'Cancel', exact: true});
                            if (await c.count()) { await c.click().catch(() => {}); await idle(page); await sleep(600); }
                        }
                    }
                    await closeTopWin();
                    return o;
                });
            }
            if (isOJS) {
                // sweep: the issue window left with a typed, unsaved Publisher ID (another tab; then the window's Close)
                res.leave = await safe('issues-leave', async () => {
                    await as(S.u.mg);
                    await page.goto(cUrl(S.J, '/manageIssues')); await idle(page);
                    const row = page.locator('tr.gridRow').filter({hasText: 'Vol. 2 No. 1 (2015)'}).first();
                    await row.locator('a.show_extras').click(); await sleep(400);
                    await page.getByRole('link', {name: 'Edit', exact: true}).filter({visible: true}).first().click();
                    await idle(page);
                    await page.waitForFunction(() => { const d = [...document.querySelectorAll('[role=dialog]')].filter((e) => e.getClientRects().length).pop(); return d && d.querySelector('[role=tab]'); }, null, {timeout: 20000}).catch(() => {});
                    await openIdTab('iss-leave-0');
                    const box = topWin(page).locator('#publicIdentifiersForm input[name="publisherId"]');
                    await box.fill('pid-unsaved'); await box.blur();
                    const t0 = Date.now();
                    await topWin(page).getByRole('tab', {name: 'Issue Data', exact: true}).click().catch(() => {});
                    await idle(page); await sleep(800);
                    const d1 = dlgSince(t0);
                    const s1 = await snap(page, 'iss-leave-1-tabswitch');
                    const t1 = Date.now();
                    await closeTopWin();
                    const d2 = dlgSince(t1);
                    // reopen: kept or lost
                    await page.goto(cUrl(S.J, '/manageIssues')); await idle(page);
                    const row2 = page.locator('tr.gridRow').filter({hasText: 'Vol. 2 No. 1 (2015)'}).first();
                    await row2.locator('a.show_extras').click(); await sleep(400);
                    await page.getByRole('link', {name: 'Edit', exact: true}).filter({visible: true}).first().click();
                    await idle(page);
                    await page.waitForFunction(() => { const d = [...document.querySelectorAll('[role=dialog]')].filter((e) => e.getClientRects().length).pop(); return d && d.querySelector('[role=tab]'); }, null, {timeout: 20000}).catch(() => {});
                    const back = await openIdTab('iss-leave-2-reopen');
                    await closeTopWin();
                    return {tabSwitchDialogs: d1, activeTabAfter: await page.locator('[role=tab][aria-selected=true]').allInnerTexts().catch(() => []), closeDialogs: d2, valueAfterReopen: back.value, s1: s1.url};
                });
                // "Publish Issue": the window's URN part and the email box (opened, then cancelled)
                res.publishWindow = await safe('issues-publish-window', async () => {
                    await as(S.u.mg);
                    await page.goto(cUrl(S.J, '/manageIssues')); await idle(page);
                    const row = page.locator('tr.gridRow').filter({hasText: 'Vol. 2 No. 1 (2015)'}).first();
                    await row.locator('a.show_extras').click(); await sleep(400);
                    const link = page.getByRole('link', {name: 'Publish Issue', exact: true}).filter({visible: true}).first();
                    if (!(await link.count())) return {offered: false};
                    await link.click(); await idle(page); await sleep(800);
                    const w = topWin(page);
                    const o = {text: flat(await w.innerText().catch(() => ''), 1500), boxes: await w.locator('input[type=checkbox]').evaluateAll((els) => els.map((e) => ({name: e.name, checked: e.checked, label: (e.closest('label')?.innerText || document.querySelector(`label[for="${e.id}"]`)?.innerText || '').trim()}))).catch(() => [])};
                    await snap(page, 'iss-publish-window', {publishWindow: o});
                    const c = w.getByRole('link', {name: 'Cancel', exact: true}).or(w.getByRole('button', {name: 'Cancel', exact: true})).first();
                    if (await c.count()) await c.click().catch(() => {}); else await closeTopWin();
                    await idle(page); await sleep(600);
                    return o;
                });
            }
            fact('issues', res);
        }

        // ============================================================ press: Actors row 9 {OMP}
        if (on('press') && isOMP) {
            const res = {};
            const pressGo = (sub, key) => openWf(S.J, sub.id, `publication_${sub.pub}_${key}`);
            if (!S.pressA) {
                res.setup = await safe('press-setup', async () => {
                    await as(S.u.mg);
                    await pressGo(S.A, 'chapters');
                    await wf(page).getByRole('link', {name: 'Add Chapter'}).first().click();
                    await topWin(page).locator('input[name^="title"]').first().waitFor({timeout: 20000});
                    await idle(page);
                    await topWin(page).locator('input[name^="title"]').first().fill('K4 Chapter');
                    await topWin(page).getByRole('button', {name: 'Save', exact: true}).click();
                    await idle(page); await sleep(1200); await idle(page);
                    await addFormatWithFile(S.A, 'PDF');
                    return {ok: true};
                });
                S.pressA = true; save();
            }
            for (const k of ['mg', 'ed', 'pe', 'admin', 'se', 'sn', 'le']) {
                res[k] = await safe(`press-${k}`, async () => {
                    await as(k === 'admin' ? 'admin' : S.u[k]);
                    const o = {};
                    for (const kind of ['chapter', 'format', 'file']) o[kind] = await pressWindow(S.A, kind, `press-${k}-${kind}`, kind === 'chapter' ? `pidc-${k}` : null);
                    return o;
                });
            }
            res.au = await safe('press-au', async () => {
                await as(S.u.au);
                await openWf(S.J, S.A.id, `publication_${S.A.pub}_chapters`, {author: true});
                const s = await snap(page, 'press-au-chapters');
                const links = await wf(page).locator('a.pkp_linkaction_editChapter, a').evaluateAll((els) => els.filter((e) => e.getClientRects().length).map((e) => e.innerText.trim()).filter(Boolean).slice(0, 40)).catch(() => []);
                return {menu: await sideMenu(), text: flat(s.text && s.text.dialog, 600), links};
            });
            fact('press', res);
        }

        async function addFormatWithFile(sub, fmt) {
            await openWf(S.J, sub.id, `publication_${sub.pub}_publicationFormats`);
            await wf(page).getByRole('link', {name: 'Add publication format'}).first().click();
            await topWin(page).locator('input[name^="name"]').first().waitFor({timeout: 20000});
            await idle(page);
            await topWin(page).locator('input[name^="name"]').first().fill(fmt);
            await topWin(page).getByRole('button', {name: 'OK', exact: true}).click();
            await idle(page); await sleep(1500); await idle(page);
            const cat = wf(page).locator('tr').filter({hasText: fmt}).filter({has: page.locator('.onix_code')}).first();
            await cat.getByRole('link', {name: 'Change File', exact: true}).first().click();
            const wiz = page.getByRole('dialog').filter({has: page.locator('div[id^="fileUploadWizard"]')});
            await wiz.locator('input[type="file"]').waitFor({state: 'attached', timeout: 30000});
            await idle(page);
            const genre = wiz.locator('select[id^="genreId"]');
            if (await genre.count()) {
                const opts = await genre.locator('option').evaluateAll((els) => els.map((o) => ({v: o.value, t: o.text.trim()})).filter((o) => o.v));
                await genre.selectOption(opts[0].v);
            }
            await wiz.locator('input[type="file"]').setInputFiles(path.resolve('apps', 'omp', 'playwright/fixtures/files', 'article.pdf'));
            await wiz.getByRole('button', {name: 'Continue', exact: true}).waitFor({timeout: 30000});
            await page.waitForFunction(() => { const b = [...document.querySelectorAll('[role=dialog] button')].find((x) => x.innerText.trim() === 'Continue' && x.getClientRects().length); return b && !b.disabled; }, null, {timeout: 30000}).catch(() => {});
            await wiz.getByRole('button', {name: 'Continue', exact: true}).click(); await idle(page); await sleep(800);
            await wiz.getByRole('button', {name: 'Continue', exact: true}).click(); await idle(page); await sleep(800);
            await wiz.getByRole('button', {name: 'Complete', exact: true}).click(); await idle(page); await sleep(1500); await idle(page);
        }
        async function pressWindow(sub, kind, name, saveValue) {
            await openWf(S.J, sub.id, `publication_${sub.pub}_${kind === 'chapter' ? 'chapters' : 'publicationFormats'}`);
            const panel = wf(page);
            const o = {menu: (await sideMenu()).filter((x) => /Chapters|Publication Formats|Identifiers/.test(x))};
            if (kind === 'chapter') {
                const a = panel.locator('a.pkp_linkaction_editChapter').first();
                o.opener = await a.count();
                if (!o.opener) { await snap(page, name, {press: o}); return o; }
                await a.click(); await idle(page);
            } else {
                const row = kind === 'file'
                    ? panel.locator('tr.gridRow').filter({has: page.locator('a.pkp_linkaction_downloadFile')}).first()
                    : panel.locator('tr.gridRow').filter({has: page.locator('.onix_code')}).first();
                o.opener = await row.count();
                if (!o.opener) { await snap(page, name, {press: o}); return o; }
                const id = await row.getAttribute('id');
                const ex = row.locator('a.show_extras').first();
                if (await ex.count()) { await ex.click(); await sleep(500); }
                const ctl = page.locator(`[id="${id}-control-row"]`);
                o.rowLinks = await ctl.locator('a').evaluateAll((els) => els.filter((e) => e.getClientRects().length).map((e) => e.innerText.trim()).filter(Boolean)).catch(() => []);
                const a = ctl.getByRole('link', {name: 'Edit', exact: true}).first();
                if (!(await a.count())) { await snap(page, name, {press: o}); return o; }
                await a.click(); await idle(page);
            }
            await page.waitForFunction(() => { const d = [...document.querySelectorAll('[role=dialog]')].filter((e) => e.getClientRects().length); return d.length >= 2 && d.pop().querySelector('form, [role=tab]'); }, null, {timeout: 20000}).catch(() => {});
            await page.waitForFunction(() => { const d = [...document.querySelectorAll('[role=dialog]')].filter((e) => e.getClientRects().length).pop(); return d && d.querySelector('[role=tab]'); }, null, {timeout: 6000}).catch(() => {});
            await idle(page); await sleep(400);
            o.tabs = (await topWin(page).locator('[role=tab]').allInnerTexts().catch(() => [])).map((x) => x.trim());
            o.title = flat(await topWin(page).locator('h1').first().innerText().catch(() => null), 120);
            await snap(page, name, {press: o});
            if (o.tabs.includes('Identifiers')) {
                o.tab = await openIdTab(`${name}-tab`);
                if (saveValue && o.tab.formPresent) o.saved = await saveIdTab(saveValue, `${name}-save`);
            }
            await closeTopWin();
            return o;
        }

        // ============================================================ pub: P's identifiers on screen; nothing else happens (302–304); JATS; publish
        if (on('pub') && !S.published) {
            const res = {};
            const actor = isOPS ? S.u.mg : S.u.ed;
            await as(actor);
            if (isOJS && !S.pIssue) { res.issue = await safe('pub-issue', () => assignIssueOJS(S.J, S.P, 'pub-00-assign-issue')); S.pIssue = true; save(); }
            if (isOMP && !S.pFormat) { res.format = await safe('pub-format', () => addFormatWithFile(S.P, 'PDF')); S.pFormat = true; save(); }
            res.before = await safe('pub-before', async () => ({log: await activityLog(S.J, S.P, 'pub-01-log-before'), mail: await mailCounts()}));
            const t0 = Date.now();
            if (!isOPS) {
                res.urn = await safe('pub-urn', async () => {
                    const o = {};
                    o.page0 = (await readIdPage(S.J, S.P, 'pub-02-id-0')).field;
                    await urnButton('Assign').click(); await sleep(400);
                    o.save1 = await pubSave('pub-03-assign-save');
                    await readIdPage(S.J, S.P, 'pub-04-id-1');
                    await urnButton('Clear').click(); await sleep(400);
                    o.save2 = await pubSave('pub-05-clear-save');
                    await readIdPage(S.J, S.P, 'pub-06-id-2');
                    await urnButton('Assign').click(); await sleep(400);
                    o.save3 = await pubSave('pub-07-assign-save');
                    o.stored = await pubRead(S.J, S.P);
                    return o;
                });
            }
            res.meta = await safe('pub-meta', async () => { await readMeta(S.J, S.P, 'pub-08-meta'); const o = await saveMetaPid('pid-a1', 'pub-09-meta-save'); o.stored = await pubRead(S.J, S.P); return o; });
            if (!isOMP) {
                res.galley = await safe('pub-galley', async () => {
                    await openGalleyEdit(S.J, S.P, 'pub-10-galley');
                    const tab = await openIdTab('pub-11-galley-tab');
                    const saved = await saveIdTab('pid-g1', 'pub-12-galley-save', {assign: true});
                    await openGalleyEdit(S.J, S.P, 'pub-13-galley-reopen');
                    const back = await openIdTab('pub-14-galley-reopen-tab');
                    await closeTopWin();
                    return {tab, saved, back};
                });
            } else {
                res.format = await safe('pub-format-tab', async () => {
                    const o = await pressWindowP('format', 'pub-10-format', 'pid-f1');
                    o.back = await pressWindowP('format', 'pub-13-format-reopen', null);
                    return o;
                });
            }
            if (isOJS) {
                res.issueTab = await safe('pub-issue-tab', async () => {
                    await page.goto(cUrl(S.J, '/manageIssues')); await idle(page);
                    const back = page.getByRole('tab', {name: 'Back Issues'}).or(page.getByRole('link', {name: 'Back Issues', exact: true})).first();
                    if (await back.count()) { await back.click(); await idle(page); await sleep(800); }
                    const row = page.locator('tr.gridRow:visible').filter({hasText: 'Vol. 1 No. 2 (2014)'}).first();
                    await row.waitFor({timeout: 20000});
                    await row.locator('a.show_extras').click(); await sleep(400);
                    await page.getByRole('link', {name: 'Edit', exact: true}).filter({visible: true}).first().click();
                    await idle(page);
                    await page.waitForFunction(() => { const d = [...document.querySelectorAll('[role=dialog]')].filter((e) => e.getClientRects().length).pop(); return d && d.querySelector('[role=tab]'); }, null, {timeout: 20000}).catch(() => {});
                    const tab = await openIdTab('pub-15-issue-tab');
                    const saved = await saveIdTab('pid-i1', 'pub-16-issue-save', {assign: true});
                    const after = saved.closed ? null : saved.tab;
                    await closeTopWin();
                    return {tab, saved, after};
                });
            }
            res.after = await safe('pub-after', async () => {
                await sleep(1500);
                return {log: await activityLog(S.J, S.P, 'pub-17-log-after'), mail: await mailCounts(), traffic: since(t0).filter((x) => x.method !== 'GET').map((x) => `${x.method} ${x.status} ${x.url}`)};
            });
            if (isOJS) {
                res.jats = await safe('pub-jats', async () => {
                    await openWf(S.J, S.P.id, `publication_${S.P.pub}_jats`);
                    await page.waitForFunction(() => /<article/.test(document.body.innerText), null, {timeout: 20000}).catch(() => {});
                    await idle(page);
                    const txt = await wf(page).innerText().catch(() => '');
                    const ids = [...txt.matchAll(/<article-id[^>]*>[^<]*<\/article-id>/g)].map((m) => m[0]);
                    const urnHits = [...txt.matchAll(/.{0,60}urn:nbn.{0,60}/g)].map((m) => m[0]);
                    const pidHits = [...txt.matchAll(/.{0,60}pid-[a-z0-9]+.{0,30}/g)].map((m) => m[0]);
                    await snap(page, 'pub-18-jats', {ids, urnHits, pidHits});
                    return {ids, urnHits, pidHits, submissionId: S.P.id, publicationId: S.P.pub};
                });
            }
            if (isOMP) {
                res.approve = await safe('pub-approve', async () => {
                    await openWf(S.J, S.P.id, `publication_${S.P.pub}_publicationFormats`);
                    const row = wf(page).locator('tr.gridRow').filter({has: page.locator('.onix_code')}).first();
                    const link = row.getByRole('link', {name: /Awaiting Approval|Not Approved/i}).first();
                    const o = {offered: await link.count()};
                    if (o.offered) {
                        const t1 = Date.now();
                        await link.click(); await idle(page); await sleep(700);
                        const dlg = topWin(page);
                        o.question = flat(await dlg.innerText().catch(() => null), 400);
                        const ok = dlg.getByRole('button', {name: /^(OK|Yes|Approve)$/}).first();
                        if (await ok.count()) await ok.click();
                        await idle(page); await sleep(1200);
                        o.traffic = since(t1).filter((x) => x.method !== 'GET');
                        o.row = flat(await wf(page).locator('tr.gridRow').filter({has: page.locator('.onix_code')}).first().innerText().catch(() => null), 200);
                    }
                    await snap(page, 'pub-19-format-approved', {approve: o});
                    return o;
                });
            }
            res.publish = await safe('pub-publish', async () => {
                await openWf(S.J, S.P.id, `publication_${S.P.pub}_titleAbstract`);
                if (isOPS) {
                    const {postPreprint} = require(path.join(app.suiteDir, 'pages', 'PublicationPages.js'));
                    await postPreprint(page);
                } else if (isOJS) {
                    const {PublicationScreen} = require(path.join(app.suiteDir, 'pages', 'PublicationMetadataPages.js'));
                    const pub = new PublicationScreen(page, S.J);
                    const panel = await pub.openPublishPanel();
                    await pub.fillVersionDetails(panel);
                    await pub.awaitAssignmentPreselected(panel).catch(() => {});
                    const back = panel.getByRole('radio', {name: 'Assign To Current/Back Issue'});
                    if (await back.count()) { await back.check(); await pub.selectIssueOption(panel, /Vol\. 1 No\. 2/); }
                    await sleep(400);
                    const pt = await snap(page, 'pub-20-publish-panel');
                    await panel.getByRole('button', {name: 'Confirm', exact: true}).click();
                    const confirm = page.getByRole('dialog').filter({hasText: 'Are you sure you want to publish this?'});
                    await confirm.waitFor({state: 'visible', timeout: T});
                    const confirmText = flat(await confirm.innerText().catch(() => null), 1200);
                    const w = page.waitForResponse((r) => r.url().includes('/publish') && r.request().method() !== 'GET', {timeout: T}).catch(() => null);
                    await confirm.getByRole('button', {name: 'Publish', exact: true}).click();
                    await w;
                    await page.getByRole('button', {name: 'Unpublish', exact: true}).waitFor({state: 'visible', timeout: T}).catch(() => {});
                    await idle(page);
                    await snap(page, 'pub-21-published', {confirmText, panel: flat(pt.text && pt.text.dialog, 300)});
                } else {
                    await page.getByRole('button', {name: 'Publish', exact: true}).first().click();
                    const modal = page.getByRole('dialog', {name: /Schedule For Publication/});
                    await modal.waitFor({state: 'visible', timeout: T});
                    await idle(page);
                    const stage = modal.locator('select[name="versionStage"]');
                    if (await stage.isVisible().catch(() => false)) { if (!(await stage.inputValue())) await stage.selectOption('VoR'); }
                    const minor = modal.locator('select[name="versionIsMinor"]');
                    if (await minor.isVisible().catch(() => false)) { if (!(await minor.inputValue())) await minor.selectOption('false'); }
                    const w = page.waitForResponse((r) => r.url().includes('/publish') && r.request().method() !== 'GET', {timeout: T}).catch(() => null);
                    await modal.getByRole('button', {name: 'Publish', exact: true}).click();
                    await w;
                    await page.getByRole('button', {name: 'Unpublish', exact: true}).waitFor({state: 'visible', timeout: T}).catch(() => {});
                    await idle(page);
                    await snap(page, 'pub-21-published');
                }
                return {stored: await pubRead(S.J, S.P)};
            });
            if (res.publish && res.publish.stored && res.publish.stored.statusCode === 3) { S.published = true; save(); }
            fact('pub', res);
        }
        async function pressWindowP(kind, name, saveValue) {
            await openWf(S.J, S.P.id, `publication_${S.P.pub}_publicationFormats`);
            const row = wf(page).locator('tr.gridRow').filter({has: page.locator('.onix_code')}).first();
            const id = await row.getAttribute('id');
            await row.locator('a.show_extras').first().click(); await sleep(500);
            await page.locator(`[id="${id}-control-row"]`).getByRole('link', {name: 'Edit', exact: true}).first().click();
            await idle(page);
            await page.waitForFunction(() => { const d = [...document.querySelectorAll('[role=dialog]')].filter((e) => e.getClientRects().length).pop(); return d && d.querySelector('[role=tab]'); }, null, {timeout: 20000}).catch(() => {});
            await idle(page); await sleep(400);
            const tab = await openIdTab(`${name}-tab`);
            const saved = saveValue ? await saveIdTab(saveValue, `${name}-save`, {assign: true}) : null;
            if (!saved || !saved.closed) await closeTopWin();
            return {tab, saved};
        }

        // ============================================================ reader: Rule 21, Actors row 10, page tags
        if (on('reader')) {
            const res = {};
            const gid = S.P.galleys && S.P.galleys[0] && (S.P.galleys[0].id || S.P.galleys[0].galleyId);
            const pages = isOJS
                ? [['article', `/article/view/${S.P.id}`], ['issue', `/issue/view/${S.issues && S.issues[0] && S.issues[0].id}`], ['archive', '/issue/archive'], ['galley', `/article/view/${S.P.id}/${gid}`], ['home', '/']]
                : isOMP ? [['book', `/catalog/book/${S.P.id}`], ['catalog', '/catalog']] : [['preprint', `/preprint/view/${S.P.id}`], ['galley', `/preprint/view/${S.P.id}/${gid}`], ['home', '/']];
            await signOut(page).catch(() => {}); who = null;
            for (const [k, p] of pages) res[`anon-${k}`] = await safe(`reader-${k}`, () => readerRead(cUrl(S.J, p), `rd-anon-${k}`));
            res.rd = await safe('reader-rd', async () => { await as(S.u.rd); return readerRead(cUrl(S.J, pages[0][1]), 'rd-reader-main'); });
            // the two tag plugins: their state, then off, then the main page's tags again
            res.tagPlugins = await safe('reader-tagplugins', async () => {
                await as(S.u.mg);
                const before = await pluginsReach(S.J, 'rd-plugins-before');
                const gs = await setPluginEnabled(S.J, 'googlescholarplugin', false);
                const dc = isOPS ? 'no Dublin Core plugin on OPS' : await setPluginEnabled(S.J, 'dublincoremetaplugin', false);
                await signOut(page).catch(() => {}); who = null;
                const off = await readerRead(cUrl(S.J, pages[0][1]), 'rd-anon-main-tagsoff');
                await as(S.u.mg);
                const gs2 = await setPluginEnabled(S.J, 'googlescholarplugin', true);
                const dc2 = isOPS ? null : await setPluginEnabled(S.J, 'dublincoremetaplugin', true);
                return {before: {gs: before.grid && before.grid.gs, dc: before.grid && before.grid.dc}, gs, dc, offMetas: off.metas, gs2, dc2};
            });
            fact('reader', res);
        }

        // ============================================================ exports: Native XML of P
        if (on('exports')) {
            fact('exports', await safe('exports', async () => {
                await as(S.u.mg);
                const nx = {};
                const resp = await page.goto(cUrl(S.J, '/management/importexport/plugin/NativeImportExportPlugin')).catch((e) => ({err: String(e.message)}));
                nx.status = resp && resp.status ? resp.status() : resp;
                await idle(page);
                await snap(page, 'exp-01-native');
                const tab = page.getByRole('link', {name: /^Export( (Articles|Submissions|Monographs|Preprints))?$/}).first();
                if (!(await tab.count())) return {...nx, tab: false};
                await tab.click(); await idle(page); await sleep(1000);
                const panel = page.locator('[role="tabpanel"]:visible');
                const cbRow = panel.locator('input[type="checkbox"]').first();
                await cbRow.waitFor({state: 'visible', timeout: 20000}).catch(() => {});
                const byTitle = panel.locator('label, tr, li').filter({hasText: `K4 P ${S.t}`}).locator('input[type="checkbox"]').first();
                const cb = (await byTitle.count()) ? byTitle : cbRow;
                await cb.check().catch(() => {});
                await snap(page, 'exp-02-native-export-tab');
                const dl = page.waitForEvent('download', {timeout: 30000}).catch(() => null);
                await panel.getByRole('button', {name: /^Export( (Articles|Submissions|Monographs|Preprints))?$/}).click().catch((e) => { nx.clickErr = String(e.message).slice(0, 200); });
                let d = await Promise.race([dl, page.getByText('Download Exported File').first().waitFor({timeout: 30000}).then(() => null).catch(() => null)]);
                if (!d) {
                    await idle(page);
                    const btn = page.getByRole('button', {name: 'Download Exported File'}).or(page.getByRole('link', {name: 'Download Exported File'})).first();
                    if (await btn.count()) { const dl2 = page.waitForEvent('download', {timeout: 30000}).catch(() => null); await btn.click().catch(() => {}); d = await dl2; }
                }
                if (d) {
                    const p = await d.path().catch(() => null);
                    const xml = p ? fs.readFileSync(p, 'utf8') : '';
                    fs.writeFileSync(path.join(outDir(), `exp-native-${app.name}.xml`), xml);
                    nx.file = d.suggestedFilename(); nx.len = xml.length;
                    nx.idLines = [...xml.matchAll(/<id [^>]*>[^<]*<\/id>/g)].map((m) => m[0]).slice(0, 30);
                    nx.pid = [...xml.matchAll(/.{0,60}pid-[a-z0-9]+.{0,20}/g)].map((m) => m[0]).slice(0, 10);
                    nx.urn = [...xml.matchAll(/.{0,60}urn:nbn.{0,40}/g)].map((m) => m[0]).slice(0, 10);
                    nx.title = xml.includes(`K4 P ${S.t}`);
                } else {
                    const s = await snap(page, 'exp-03-native-after');
                    nx.after = flat(s.text && s.text.main, 500);
                }
                return nx;
            }));
        }

        // ============================================================ plugoff: Cross-feature 339–340
        if (on('plugoff') && !isOPS) {
            fact('plugoff', await safe('plugoff', async () => {
                await as(S.u.mg);
                const off = await setPluginEnabled(S.J, 'urnpubidplugin', false);
                const a = await readIdPage(S.J, S.A, 'off-01-A-idpage');
                const p = await readIdPage(S.J, S.P, 'off-02-P-idpage');
                const onAgain = await setPluginEnabled(S.J, 'urnpubidplugin', true);
                const a2 = await readIdPage(S.J, S.A, 'off-03-A-idpage-on');
                return {off, A: {listed: a.listed, menu: a.menu, field: a.field, headings: a.headings, url: a.url}, P: {listed: p.listed, field: p.field, headings: p.headings, url: p.url}, onAgain, A2: {listed: a2.listed, value: a2.field && a2.field.value}};
            }));
        }

        // ============================================================ extra (only when named): follow-ups of the galley and press phases
        if (PHASES.includes('extra')) {
            const res = {};
            if (isOPS) res.auView = await safe('extra-au-view', async () => {
                // the posted preprint's galley row, as its Author: the row menu's only item "View"
                await as(S.u.au);
                await openWf(S.J, S.A.id, `publication_${S.A.pub}_galleys`, {author: true});
                const row = wf(page).locator('tbody tr').filter({hasText: 'PDF'}).first();
                await row.locator('button').last().click(); await idle(page);
                const items = await menuItems(page);
                const popup = page.context().waitForEvent('page', {timeout: 8000}).catch(() => null);
                const t0 = Date.now();
                await page.getByRole('menuitem', {name: 'View', exact: true}).first().click();
                const np = await popup;
                await idle(page); await sleep(1000);
                const o = {items, newTab: !!np, url: page.url(), dialogs: (await dialogTexts(page)).map((d) => ({name: d.name, text: flat(d.text, 400)})), traffic: since(t0).map((x) => `${x.method} ${x.status} ${x.url}`)};
                o.tabs = (await topWin(page).locator('[role=tab]').allInnerTexts().catch(() => [])).map((x) => x.trim());
                if (o.tabs.includes('Identifiers')) o.tab = await openIdTab('extra-au-view-tab');
                await snap(page, 'extra-au-view', {view: o});
                if (np) { await np.waitForLoadState().catch(() => {}); o.newUrl = np.url(); o.newTitle = await np.title().catch(() => null); await np.close().catch(() => {}); }
                return o;
            });
            if (isOMP) for (const k of ['le', 'sn']) {
                res[k] = await safe(`extra-${k}-format`, async () => {
                    await as(S.u[k]);
                    const o = await pressWindow(S.A, 'format', `extra-${k}-format`, `pidf-${k}`);
                    const back = await pressWindow(S.A, 'format', `extra-${k}-format-reopen`, null);
                    const f = await pressWindow(S.A, 'file', `extra-${k}-file`, `pidfile-${k}`);
                    const fback = await pressWindow(S.A, 'file', `extra-${k}-file-reopen`, null);
                    return {saved: o.saved, reopen: back.tab && back.tab.value, fileSaved: f.saved, fileReopen: fback.tab && fback.tab.value};
                });
            }
            if (isOMP) res.available = await safe('extra-available', async () => {
                // the published monograph's approved format made "Available", then the book page again (Rule 21's format block)
                await as(S.u.ed);
                await openWf(S.J, S.P.id, `publication_${S.P.pub}_publicationFormats`);
                const row = () => wf(page).locator('tr.gridRow').filter({has: page.locator('.onix_code')}).first();
                const o = {rowBefore: flat(await row().innerText().catch(() => null), 200)};
                const link = row().getByRole('link', {name: /^Not Available$/}).first();
                o.offered = await link.count();
                if (o.offered) {
                    const t1 = Date.now();
                    await link.click(); await idle(page); await sleep(700);
                    const dlg = topWin(page);
                    o.question = flat(await dlg.innerText().catch(() => null), 500);
                    await snap(page, 'extra-available-question');
                    const ok = dlg.getByRole('button', {name: /^(OK|Yes)$/}).first();
                    if (await ok.count()) await ok.click();
                    await idle(page); await sleep(1200);
                    o.traffic = since(t1).filter((x) => x.method !== 'GET').map((x) => `${x.method} ${x.status} ${x.url}`);
                    o.rowAfter = flat(await row().innerText().catch(() => null), 200);
                }
                await snap(page, 'extra-available-after', {available: o});
                await signOut(page).catch(() => {}); who = null;
                o.book = await readerRead(cUrl(S.J, `/catalog/book/${S.P.id}`), 'extra-book-available');
                return o;
            });
            if (isOPS) res.gsBack = await safe('extra-gs-back', async () => { await as(S.u.mg); return setPluginEnabled(S.J, 'googlescholarplugin', true); });
            fact('extra', res);
        }

        // ============================================================ rolewin (only when named): the role window's "Permit changes to Settings" (45), read only
        if (PHASES.includes('rolewin') && !isOPS) {
            const res = {};
            for (const [ctx, rn] of [[S.J2, isOJS ? 'Journal editor' : 'Press editor'], [S.J2, 'Production editor'], [S.J, isOJS ? 'Journal editor' : 'Press editor']]) {
                res[`${ctx === S.J2 ? 'J2' : 'J'} ${rn}`] = await safe(`rolewin-${rn}`, async () => {
                    await as(ctx === S.J2 ? S.u2.mg : S.u.mg, ctx);
                    await page.goto(cUrl(ctx, '/management/settings/access')); await idle(page);
                    await page.getByRole('tab', {name: 'Roles'}).click(); await idle(page);
                    const row = page.getByRole('row', {name: new RegExp(`^Settings ${rn}\\b`)});
                    await row.getByRole('link', {name: 'Settings'}).click();
                    await page.getByRole('link', {name: 'Edit', exact: true}).first().click();
                    await idle(page);
                    const form = page.locator('#userGroupForm');
                    await form.waitFor({timeout: T});
                    const boxes = await form.locator('input[type=checkbox]').evaluateAll((els) => els.map((e) => ({name: e.name, checked: e.checked, disabled: e.disabled, label: e.labels && e.labels[0] ? e.labels[0].innerText.trim() : null})));
                    await snap(page, `role-${ctx === S.J2 ? 'J2' : 'J'}-${rn.replace(/\W+/g, '')}`, {boxes});
                    const c = form.getByRole('link', {name: 'Cancel', exact: true}).or(form.getByRole('button', {name: 'Cancel', exact: true})).first();
                    if (await c.count()) await c.click().catch(() => {});
                    await idle(page); await sleep(600);
                    return {boxes: boxes.filter((b) => /Settings|metadata/i.test(b.label || ''))};
                });
            }
            fact('rolewin', res);
        }

        // ============================================================ clear (only when named): a tab's "Clear" and what else happens (302–304)
        if (PHASES.includes('clear') && !isOPS) {
            fact('clear', await safe('clear', async () => {
                await as(S.u.ed);
                const before = {log: await activityLog(S.J, S.A, 'clr-01-log-before'), mail: await mailCounts()};
                const t0 = Date.now();
                if (isOJS) await openGalleyEdit(S.J, S.A, 'clr-02-galley');
                else {
                    await openWf(S.J, S.A.id, `publication_${S.A.pub}_chapters`);
                    await wf(page).locator('a.pkp_linkaction_editChapter').first().click(); await idle(page);
                    await page.waitForFunction(() => { const d = [...document.querySelectorAll('[role=dialog]')].filter((e) => e.getClientRects().length).pop(); return d && d.querySelector('[role=tab]'); }, null, {timeout: 20000}).catch(() => {});
                }
                const tab = await openIdTab('clr-03-tab');
                const link = topWin(page).locator('#publicIdentifiersForm').getByRole('link', {name: 'Clear', exact: true}).first();
                const o = {tabText: tab.text, clearOffered: await link.count()};
                if (o.clearOffered) {
                    await link.click(); await idle(page); await sleep(600);
                    const dlg = topWin(page);
                    o.question = flat(await dlg.innerText().catch(() => null), 400);
                    o.buttons = await dlg.getByRole('button').allInnerTexts().catch(() => []);
                    await snap(page, 'clr-04-question');
                    const del = dlg.getByRole('button', {name: /^(Delete|OK|Yes)$/}).first();
                    if (await del.count()) await del.click();
                    await idle(page); await sleep(1200);
                    o.afterTab = await readIdTab('clr-05-after');
                }
                await closeTopWin();
                await sleep(1500);
                o.traffic = since(t0).filter((x) => x.method !== 'GET').map((x) => `${x.method} ${x.status} ${x.url}`);
                const after = {log: await activityLog(S.J, S.A, 'clr-06-log-after'), mail: await mailCounts()};
                return {before, o, after};
            }));
        }

        // ============================================================ admin: 42–46, a site administrator without a manager role
        if (on('admin')) {
            fact('admin', await safe('admin', async () => {
                const left = isOPS ? 'editorialBoardMember' : 'copyeditor';
                if (!S.J3) {
                    const t = S.t;
                    const J3 = await app.api.createContext({tag: `${t}m`, context: {name: `U44 K4 J3 ${t}`, acronym: 'KFM', contactName: 'K4', contactEmail: `${t}m@mail.test`},
                        users: [{username: `${t}mmg`, roles: ['manager']}, {username: 'admin', roles: [left], givenName: 'Site', familyName: 'Admin'}], enablePublisherId: KINDS,
                        ...(isOPS ? {} : {plugins: {urnpubidplugin: {enabled: true, settings: {enablePublicationURN: true, urnPrefix: PREFIX, urnSuffix: 'default', urnCheckNo: false, urnNamespace: 'urn:nbn:de', urnResolver: RESOLVER}}}})});
                    S.J3 = J3.path; save();
                }
                await signOut(page).catch(() => {}); who = null;
                await as('admin', S.J3);
                const rem = {};
                if (!S.j3Ended) {
                    await page.goto(cUrl(S.J3, '/management/settings/access')); await idle(page);
                    const table = page.locator('table').filter({hasText: /\badmin\b/}).first();
                    await table.waitFor({state: 'visible', timeout: T}).catch(() => {});
                    const adminRow = table.locator('tr').filter({hasText: /\badmin\b/}).first();
                    await adminRow.locator('button').last().click(); await idle(page);
                    await page.getByRole('menuitem', {name: /^Edit$/}).first().click().catch(() => {});
                    await page.waitForURL(/management\/settings\/user\/\d+/, {timeout: T}).catch(() => {});
                    await idle(page);
                    await page.getByRole('button', {name: /Remove Role/i}).first().waitFor({state: 'visible', timeout: 15000}).catch(() => {});
                    rem.rolesBefore = await page.locator('tr').filter({has: page.getByRole('button', {name: /Remove Role/i})}).evaluateAll((els) => els.map((e) => e.innerText.replace(/\s+/g, ' ').trim())).catch(() => []);
                    await snap(page, 'adm-01-edit-page');
                    const roleRow = page.locator('tr').filter({hasText: /manager/i}).filter({has: page.getByRole('button', {name: /Remove Role/i})}).first();
                    if (await roleRow.count()) {
                        await roleRow.getByRole('button', {name: /Remove Role/i}).click(); await idle(page);
                        const dlg = page.locator(vis).filter({hasText: /Remove Role/i}).last();
                        await dlg.waitFor({state: 'visible', timeout: 15000}).catch(() => {});
                        await dlg.getByRole('button', {name: /^Remove Role$/i}).click().catch(() => {});
                        await idle(page); await sleep(1200);
                        rem.rolesAfter = await page.locator('tr').filter({has: page.getByRole('button', {name: /Remove Role/i})}).evaluateAll((els) => els.map((e) => e.innerText.replace(/\s+/g, ' ').trim())).catch(() => []);
                        S.j3Ended = true; save();
                    } else rem.noManagerRow = true;
                    await signOut(page).catch(() => {}); who = null;
                    await as('admin', S.J3);
                }
                return {left, rem, settings: await settingsReach(S.J3, 'adm-02'), plugins: await pluginsReach(S.J3, 'adm-02')};
            }));
        }
    } finally {
        save();
        await close();
    }
});
