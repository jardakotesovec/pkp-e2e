// U16 claim check, chunk K1: who may use the "Categories" tab, the tab's fields, the category window and the
// delete dialog; Settings bullets 2–4 and 6; the Canonical scenarios preamble and the Coverage rows;
// register A9 and OPS1. Spec: docs/specs/U16-categories.md lines 10–91, 293–298, 301–305, 361–404, 504–509,
// 552–562; footnotes a, b, c, d, e, f, g, h, i, k, m, s, td1, td2, td3, f-a9, f-ops1.
//
//   PROBE_FEATURE=U16 PROBE_AGENT=ccK1 node bin/probe.js all shared/playwright/checks/U16/K1/k1.js
//   PHASES=seed,access,tab,window,refusals,assign,delete,cover,place,wizard,autoassign,visitor,settings,leave,leave2,depth
//   (default: all; later phases read k1-state-<app>.json, so a phase can be re-run alone). A full run can
//   outlast the Bash cap: run one app at a time.
//
// Scratch contexts per app:
//   C  en + fr_CA forms; categories Arts, Science > Physics > Optics; "Categories" asked in the wizard;
//      Browse block on and in the sidebar; users: mg manager, ed editor, pe productionEditor, se sectionEditor,
//      ge guestEditor {OJS}, fc funding, ce copyeditor, rv externalReviewer, au author, rd reader
//      (OPS: mg, se Moderator, eb Editorial Board Member, au, rd). A published item placed in Science and
//      Arts; D1, D2 drafts of au (the wizard, the automatic assignment).
//   E  a manager alone, no category ("No Items", the empty "Editorial Assignments").
//   F  the wizard asks for categories, the context has none (mg, au, a draft).
//   N  one category, the wizard does not ask (mg, au, a draft); OJS/OMP also ed, an Editor whose role lost
//      "Permit changes to Settings".
//   R  "Users must be registered and log in to view the … site." ticked; one category with a published item.
// Reads on publicknowledge only (the roster's permission levels on the tab's address).
// No assertions: the script records, the reader judges.
const fs = require('fs');
const path = require('path');
const {execFileSync} = require('child_process');
const {forEachApp, launch, signIn, signOut, screen, shot, record, loc, note, idle, tag, outDir} = require('../../../probe');

const T = 30_000;
const ALL = ['seed', 'access', 'tab', 'window', 'refusals', 'assign', 'delete', 'cover', 'place', 'wizard', 'autoassign', 'visitor', 'settings', 'leave', 'leave2', 'depth'];
const PHASES = (process.env.PHASES || ALL.join(',')).split(',');
const on = (p) => PHASES.includes(p);
const log = (...a) => console.log('[k1]', ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (s, n = 1500) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));
const statePath = (app) => path.join(outDir(), `k1-state-${app.name}.json`);
const REPO = path.resolve(__dirname, '../../../../..');

// the app's own queue worker (the search index jobs a publish queues)
const drainJobs = (app) => {
    try {
        return execFileSync('php', ['lib/pkp/tools/jobs.php', 'run'], {cwd: app.root, env: {...process.env, PKP_CONFIG_FILE: app.configFile}, encoding: 'utf8', timeout: 180_000})
            .split('\n').filter((l) => l.trim()).slice(-3).join(' | ');
    } catch (e) { return `error: ${String(e.message).split('\n')[0]}`; }
};


forEachApp(async (app) => {
    const isOJS = app.name === 'ojs';
    const isOMP = app.name === 'omp';
    const isOPS = app.name === 'ops';
    const S = fs.existsSync(statePath(app)) ? JSON.parse(fs.readFileSync(statePath(app), 'utf8')) : {};
    const save = () => fs.writeFileSync(statePath(app), JSON.stringify(S, null, 1));
    const fact = (k, v) => { record('k1-facts', {[k]: v}, {merge: true}); log(`[${app.name} ${k}]`, JSON.stringify(v).slice(0, 3000)); };
    const fixture = (f) => path.join(REPO, 'apps', app.name, 'playwright/fixtures/files', f);

    // ------------------------------------------------------------------ seed
    if (on('seed') && !S.seeded) {
        const t = tag('u16k1');
        S.t = t;
        const u = (p, k, roles, g, f, extra) => ({username: `${p}${k}`, roles, givenName: g, familyName: f, ...(extra || {})});
        const ctx = (p, name) => ({name: `U16 K1 ${name} ${p}`, acronym: 'KONE', contactName: 'K1 Contact', contactEmail: `${p}c@mail.test`});
        const uname = (list, p) => Object.fromEntries(list.map((x) => [x.username.slice(p.length), x.username]));
        // C
        const pc = `${t}c`;
        const cUsers = isOPS
            ? [u(pc, 'mg', ['manager'], 'Mia', 'Manager'), u(pc, 'se', ['sectionEditor'], 'Sam', 'Moderator'), u(pc, 'eb', ['editorialBoardMember'], 'Ebba', 'Board'),
                u(pc, 'au', ['author'], 'Ari', 'Author'), u(pc, 'rd', ['reader'], 'Rae', 'Reader')]
            : [u(pc, 'mg', ['manager'], 'Mia', 'Manager'), u(pc, 'ed', ['editor'], 'Eve', 'Editor'), u(pc, 'pe', ['productionEditor'], 'Pat', 'Production'),
                u(pc, 'se', ['sectionEditor'], 'Sam', 'Section'), ...(isOJS ? [u(pc, 'ge', ['guestEditor'], 'Gil', 'Guest')] : []),
                u(pc, 'fc', ['funding'], 'Fay', 'Funding'), u(pc, 'ce', ['copyeditor'], 'Cal', 'Copy'), u(pc, 'rv', ['externalReviewer'], 'Rui', 'Reviewer'),
                u(pc, 'au', ['author'], 'Ari', 'Author'), u(pc, 'rd', ['reader'], 'Rae', 'Reader')];
        const cBody = {tag: pc, context: {...ctx(pc, 'categories'), supportedLocales: ['en', 'fr_CA'], supportedFormLocales: ['en', 'fr_CA']},
            categories: [{path: 'arts', title: {en: 'Arts', fr_CA: 'Arts FR'}},
                {path: 'sci', title: {en: 'Science', fr_CA: 'Sciences'}, children: [{path: 'phys', title: {en: 'Physics', fr_CA: 'Physique'}, children: [{path: 'optics', title: {en: 'Optics', fr_CA: 'Optique'}}]}]}],
            submitWithCategories: true, plugins: {browseblockplugin: {enabled: true}}, sidebar: ['browseblockplugin'], users: cUsers};
        if (isOJS) { cBody.issues = [{volume: 1, number: 1, year: 2025, published: true}]; cBody.themeOptions = {journalContentOrganization: [1, 2, 3]}; }
        let rc;
        try { rc = await app.api.createContext(cBody); } catch (e) {
            log('C seed refused', String(e.message).slice(0, 600));
            if (cBody.themeOptions) { delete cBody.themeOptions; S.themeRefused = String(e.message).slice(0, 400); rc = await app.api.createContext(cBody); } else throw e;
        }
        S.C = {path: rc.path || pc, id: rc.contextId, cats: rc.categories, u: uname(cUsers, pc)};
        save();
        // E: a manager alone
        const pe = `${t}e`;
        const re = await app.api.createContext({tag: pe, context: ctx(pe, 'empty'), users: [u(pe, 'mg', ['manager'], 'Ema', 'Manager')]});
        S.E = {path: re.path || pe, u: {mg: `${pe}mg`}};
        // F: the wizard asks, no category
        const pf = `${t}f`;
        const fUsers = [u(pf, 'mg', ['manager'], 'Fia', 'Manager'), u(pf, 'au', ['author'], 'Fin', 'Author')];
        const rf = await app.api.createContext({tag: pf, context: ctx(pf, 'asks, none'), submitWithCategories: true, users: fUsers});
        S.F = {path: rf.path || pf, u: uname(fUsers, pf)};
        // N: one category, the wizard does not ask; an Editor without "Permit changes to Settings"
        const pn = `${t}n`;
        const nUsers = [u(pn, 'mg', ['manager'], 'Nia', 'Manager'), u(pn, 'au', ['author'], 'Ned', 'Author'), ...(isOPS ? [] : [u(pn, 'ed', ['editor'], 'Nora', 'Editor')])];
        const nBody = {tag: pn, context: ctx(pn, 'not asked'), categories: [{path: 'ncat', title: 'N Category'}], users: nUsers};
        if (!isOPS) nBody.roles = {editor: {permitSettings: false}};
        const rn = await app.api.createContext(nBody);
        S.N = {path: rn.path || pn, u: uname(nUsers, pn)};
        // R: restricted site
        const pr = `${t}r`;
        const rUsers = [u(pr, 'mg', ['manager'], 'Ria', 'Manager'), u(pr, 'au', ['author'], 'Rob', 'Author'), u(pr, 'rd', ['reader'], 'Roz', 'Reader')];
        const rr = await app.api.createContext({tag: pr, context: ctx(pr, 'restricted'), restrictSiteAccess: true, categories: [{path: 'rcat', title: 'R Category'}], users: rUsers});
        S.R = {path: rr.path || pr, u: uname(rUsers, pr)};
        save();
        const sub = async (C, key, spec) => {
            try {
                const r = await app.api.createSubmission({tag: `${t}${key}`, context: C.path, submitter: C.u.au, title: `K1 ${key} ${t}`, ...spec});
                log('seed', key, r.submissionId, r.publicationId, r.status);
                return {id: r.submissionId, pub: r.publicationId, status: r.status};
            } catch (e) { log('seed FAILED', key, String(e.message).slice(0, 600)); return {error: String(e.message).slice(0, 600)}; }
        };
        S.s = {};
        S.s.A = await sub(S.C, 'placed', {title: `K1 Placed ${t}`, abstract: 'Placed abstract.', categories: ['sci', 'arts'], published: true});
        S.s.P = await sub(S.C, 'unplaced', {title: `K1 Unplaced ${t}`, abstract: 'Unplaced abstract.', participants: [{username: S.C.u.se, role: 'sectionEditor'}]});
        S.s.FS = await sub(S.F, 'fsubmitted', {title: `K1 F submitted ${t}`, abstract: 'F submitted abstract.'});
        S.s.D1 = await sub(S.C, 'draftone', {title: `K1 Draft one ${t}`, abstract: 'Draft one abstract.', submitted: false});
        S.s.D2 = await sub(S.C, 'drafttwo', {title: `K1 Draft two ${t}`, abstract: 'Draft two abstract.', submitted: false});
        S.s.FD = await sub(S.F, 'fdraft', {title: `K1 F draft ${t}`, abstract: 'F draft abstract.', submitted: false});
        S.s.ND = await sub(S.N, 'ndraft', {title: `K1 N draft ${t}`, abstract: 'N draft abstract.', submitted: false});
        S.s.RA = await sub(S.R, 'rplaced', {title: `K1 R placed ${t}`, abstract: 'R abstract.', categories: ['rcat'], published: true});
        S.jobsAtSeed = drainJobs(app);
        S.seeded = true;
        save();
        record('seed', S);
    }
    if (!S.seeded) { log('no state; run seed first'); return; }
    if (PHASES.length === 1 && PHASES[0] === 'seed') return;

    // ------------------------------------------------------------------ browser and helpers
    const {page, close} = await launch(app);
    const jsDialogs = [];
    let dialogAnswer = 'accept';
    page.on('dialog', (d) => {
        jsDialogs.push({at: new Date().toISOString(), type: d.type(), message: d.message().slice(0, 300)});
        log('[browser dialog]', d.type(), flat(d.message(), 200));
        (d.type() === 'beforeunload' || dialogAnswer === 'accept' ? d.accept() : d.dismiss()).catch(() => {});
    });
    async function snap(name, extra = {}) {
        let s;
        try { s = await screen(page); } catch (e) { s = {url: page.url(), error: String(e.message).slice(0, 200)}; }
        Object.assign(s, extra);
        record(name, s);
        await shot(page, name).catch(() => {});
        return s;
    }
    async function sect(name, fn) {
        try { return await fn(); } catch (e) {
            log(`[${name} FAILED]`, String(e.stack || e).split('\n').slice(0, 4).join(' | '));
            fact(`${name}.FAILED`, String(e.message || e).slice(0, 600));
            await snap(`zz-failed-${name.replace(/[^a-z0-9]+/gi, '-')}`).catch(() => {});
            return null;
        }
    }
    let who = 'visitor';
    const as = async (user, ctx) => { await signIn(page, user, {contextPath: ctx}); await idle(page); who = user; };
    const visitor = async () => { await signOut(page).catch(() => {}); who = 'visitor'; };
    const cu = (ctx, p) => app.url(`/index.php/${ctx}${p}`);
    const catPage = (ctx, p) => cu(ctx, `/${isOPS ? 'preprints' : 'catalog'}/category/${p}`);

    // The Categories tab as data: headers, rows (name, assigned, arrow name, arrow visible), toolbar buttons.
    const TAB = () => {
        const txt = (e) => (e ? (e.innerText || '').replace(/\s+/g, ' ').trim() : null);
        const panel = document.querySelector('#categories');
        if (!panel) return {panel: null};
        const table = panel.querySelector('table');
        const out = {panelText: txt(panel).slice(0, 1500)};
        out.headings = [...panel.querySelectorAll('h1,h2,h3,h4,caption,[class*=title]')].map(txt).filter(Boolean).slice(0, 6);
        out.buttonsOutsideTable = [...panel.querySelectorAll('button')].filter((b) => !b.closest('table')).map((b) => txt(b) || b.getAttribute('aria-label'));
        if (!table) return out;
        out.tableLabel = table.getAttribute('aria-label') || (table.getAttribute('aria-labelledby') && txt(document.getElementById(table.getAttribute('aria-labelledby'))));
        out.headers = [...table.querySelectorAll('thead th')].map((th) => ({t: txt(th), srOnly: !!th.querySelector('.sr-only') || /sr-only/.test(th.className) || th.offsetWidth < 3}));
        out.rows = [...table.querySelectorAll('tbody tr')].map((tr) => {
            const cells = [...tr.querySelectorAll('td, th')];
            const arrow = tr.querySelector('td:last-child button');
            const icon = arrow ? arrow.querySelector('svg, .pkpIcon, [class*=icon], [class*=Icon]') : null;
            return {cells: cells.map(txt), indent: cells[0] ? getComputedStyle(cells[0].firstElementChild || cells[0]).paddingLeft : null,
                arrow: arrow ? {name: txt(arrow) || arrow.getAttribute('aria-label'), ariaExpanded: arrow.getAttribute('aria-expanded'), visibleBox: arrow.getBoundingClientRect().width + 'x' + arrow.getBoundingClientRect().height, icon: !!icon, iconVisible: icon ? icon.getBoundingClientRect().width > 0 : false} : null,
                bold: cells[0] ? getComputedStyle(cells[0].querySelector('*') || cells[0]).fontWeight : null};
        });
        return out;
    };
    const readTab = () => page.evaluate(TAB);
    async function openTab(ctx, name) {
        await page.goto(cu(ctx, '/management/settings/context')); await idle(page);
        await page.locator('#categories-button').click(); await idle(page);
        await page.locator('#categories table').first().waitFor({timeout: T}).catch(() => {});
        await sleep(400);
        const tab = await readTab();
        if (name) await snap(name, {tab});
        return tab;
    }
    const table = () => page.locator('#categories table').first();
    const row = (name) => table().locator('tbody tr').filter({has: page.getByRole('cell', {name, exact: true})}).first();
    async function rowMenu(name, item) {
        await row(name).getByRole('button', {name: 'More Actions'}).click();
        await page.getByRole('menuitem').first().waitFor({timeout: 10_000});
        const items = (await page.getByRole('menuitem').allInnerTexts()).map((x) => x.trim());
        if (item) await page.getByRole('menuitem', {name: item, exact: true}).click();
        else await page.keyboard.press('Escape');
        return items;
    }
    const win = (title) => page.getByRole('dialog', {name: title}).last();
    // The category window as data: title, where it sits, language buttons, every field with its label, boxes, description, errors.
    const WIN = (title) => {
        const txt = (e) => (e ? (e.innerText || '').replace(/\s+/g, ' ').trim() : null);
        const d = [...document.querySelectorAll('[role=dialog]')].filter((x) => x.getClientRects().length && (txt(x.querySelector('h1,h2')) || '').startsWith(title)).pop();
        if (!d) return {open: false};
        const r = d.getBoundingClientRect();
        const out = {open: true, title: txt(d.querySelector('h1,h2')), box: {left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width), vw: window.innerWidth}};
        out.localeButtons = [...d.querySelectorAll('.pkpFormLocales button, .pkpFormLocales__locale')].map((b) => ({t: txt(b), pressed: b.getAttribute('aria-pressed'), cls: b.className}));
        out.fields = [...d.querySelectorAll('.pkpFormField, fieldset')].filter((f) => f.getClientRects().length).map((f) => ({
            cls: f.className.split(' ').filter((c) => /--/.test(c)).join(' '),
            label: txt(f.querySelector('.pkpFormFieldLabel, legend')),
            description: txt(f.querySelector('.pkpFormField__description, [id$="-description"]')),
            inputs: [...f.querySelectorAll('input:not([type=hidden]):not([type=submit]), select, textarea')].filter((i) => i.type === 'file' || i.getClientRects().length).map((i) => ({name: i.name, id: i.id, type: i.type, value: i.type === 'checkbox' ? i.checked : i.tagName === 'SELECT' ? (i.options[i.selectedIndex] || {}).text : i.value, required: i.required, invalid: i.getAttribute('aria-invalid'), accept: i.getAttribute('accept'), label: i.labels && i.labels[0] ? txt(i.labels[0]) : null})),
            options: f.querySelector('select') ? [...f.querySelector('select').options].map((o) => o.text) : undefined,
            toolbar: [...f.querySelectorAll('.tox-tbtn')].filter((b) => b.getClientRects().length).map((b) => b.getAttribute('aria-label')),
            errors: [...f.querySelectorAll('.pkpFieldError, [class*=FieldError]')].map(txt).filter(Boolean),
            footer: txt(f.querySelector('.pkpFormField--richTextarea__controlFooter, [id*=multilingualProgress]')),
        }));
        out.groups = [...d.querySelectorAll('.pkpFormGroup, fieldset.pkpFormField--options')].filter((g) => g.getClientRects().length).map((g) => ({legend: txt(g.querySelector('legend, .pkpFormGroup__heading')), text: txt(g).slice(0, 600)}));
        out.footer = txt(d.querySelector('.pkpFormPage__footer, .pkpForm__footer, [class*=footer]'));
        out.footerLinks = [...d.querySelectorAll('.pkpFormPage__footer a, .pkpFormPage__footer button, [class*=footer] a, [class*=footer] button')].map((b) => ({t: txt(b), disabled: b.disabled || b.getAttribute('aria-disabled') === 'true'}));
        out.text = txt(d).slice(0, 4000);
        return out;
    };
    const readWin = (title) => page.evaluate(WIN, title);
    async function waitWin(title) {
        await win(title).waitFor({timeout: T});
        await win(title).locator('#editCategory-path-control, [name="path"]').first().waitFor({timeout: T}).catch(() => {});
        await idle(page); await sleep(700);
    }
    const toasts = () => page.evaluate(() => [...document.querySelectorAll('[role=status], [role=alert], .p-toast, [class*=toast], [class*=Toast], .pkpNotify, [data-pc-name=toast]')]
        .map((e) => (e.innerText || '').replace(/\s+/g, ' ').trim()).filter(Boolean));
    async function saveWin(title) {
        const resp = page.waitForResponse((r) => /\/api\/v1\/categories/.test(r.url()) && r.request().method() !== 'GET', {timeout: 15_000}).catch(() => null);
        await win(title).getByRole('button', {name: 'Save', exact: true}).click();
        const r = await resp;
        await sleep(600);
        const seen = await toasts();
        await idle(page); await sleep(500);
        return {status: r ? r.status() : null, method: r ? r.request().method() : null, url: r ? r.url().replace(app.baseURL, '') : null, toasts: seen, stillOpen: await win(title).isVisible().catch(() => false)};
    }
    async function closeWin(title) {
        const w = win(title);
        if (await w.isVisible().catch(() => false)) await w.getByRole('button', {name: 'Close', exact: true}).first().click().catch(() => {});
        await sleep(700);
    }
    const fillName = (title, v, loc_ = 'en') => win(title).locator(`#editCategory-title-control-${loc_}`).fill(v);
    const fillPath = (title, v) => win(title).locator('#editCategory-path-control').fill(v);

    // ---- the submission wizard (as checks/U35/K5/k5.js walks it)
    const currentStep = () => page.locator('.pkpSteps__step__label--current');
    async function continueTo(label) {
        const button = page.locator('.submissionWizard__footer').getByRole('button', {name: 'Continue', exact: true});
        for (let attempt = 0; ; attempt++) {
            await button.click();
            try { await currentStep().filter({hasText: label}).waitFor({timeout: 6000}); return; } catch (e) { if (attempt >= 2) throw e; }
        }
    }
    async function uploadWizardFile(marker) {
        if (isOJS) {
            const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', {name: 'Add File', exact: true}).click()]);
            await chooser.setFiles(fixture('article.pdf'));
            await page.getByRole('button', {name: 'Article Text', exact: true}).click();
            await page.locator('.listPanel__item--submissionFile').filter({hasText: 'article.pdf'}).getByText('Article Text').waitFor({timeout: 30000});
        } else if (isOMP) {
            await page.locator('.submissionFilesListPanel input[type="file"]').setInputFiles({name: `ms-${marker}.txt`, mimeType: 'text/plain', buffer: Buffer.from(`Manuscript ${marker}`)});
            const genreButton = page.locator('.listPanel--submissionFiles__setGenre').getByRole('button', {name: 'Book Manuscript', exact: true});
            await genreButton.waitFor({timeout: 30000});
            const saved = page.waitForResponse((r) => r.url().includes('/files/') && r.ok());
            await genreButton.click();
            await saved;
            await page.locator('.listPanel--submissionFiles__itemGenre').filter({hasText: 'Book Manuscript'}).first().waitFor({timeout: 20000});
        } else {
            const labelDialog = page.getByRole('dialog').filter({has: page.locator('#preprintGalleyForm')});
            await idle(page);
            for (let attempt = 0; ; attempt++) {
                await page.getByRole('link', {name: 'Add File', exact: true}).click();
                try { await labelDialog.first().waitFor({timeout: 5000}); break; } catch (e) { if (attempt >= 2) throw e; }
            }
            await labelDialog.locator('input[name="label"]').fill('PDF');
            await labelDialog.getByRole('button', {name: 'Save', exact: true}).click();
            const upload = page.getByRole('dialog').filter({has: page.locator('div[id^="fileUploadWizard"]')});
            const genreSelect = upload.locator('select[name="genreId"]').first();
            await genreSelect.waitFor({timeout: 30000});
            await genreSelect.selectOption({label: 'Preprint Text'});
            await upload.locator('input[type="file"]').setInputFiles(fixture('preprint.pdf'));
            const cont = upload.getByRole('button', {name: 'Continue', exact: true});
            await cont.waitFor({timeout: 30000});
            await page.waitForFunction(() => { const b = [...document.querySelectorAll('[role="dialog"] button')].find((x) => x.innerText.trim() === 'Continue'); return b && !b.disabled; }, null, {timeout: 30000});
            await cont.click();
            await upload.getByRole('tab', {name: '2. Review Details'}).waitFor({timeout: 30000});
            await upload.getByRole('button', {name: 'Continue', exact: true}).click();
            await upload.getByRole('tab', {name: '3. Confirm'}).waitFor({timeout: 30000});
            await upload.getByRole('button', {name: 'Complete', exact: true}).click();
            await upload.waitFor({state: 'hidden', timeout: 30000});
            await idle(page);
            await page.locator('.submissionWizard').getByRole('link', {name: 'PDF'}).first().waitFor({timeout: 20000});
        }
    }
    const lastStep = isOPS ? 'For Readers' : 'For the Editors';
    // the "Categories" field of a form, as data
    const CATFIELD = () => {
        const txt = (e) => (e ? (e.innerText || '').replace(/\s+/g, ' ').trim() : null);
        const vis = (e) => e.getClientRects().length > 0;
        const scope = [...document.querySelectorAll('[role=dialog]')].filter(vis).pop() || document;
        const labels = [...scope.querySelectorAll('.pkpFormFieldLabel, legend, label')].filter(vis).filter((l) => /^Categories\b/.test(txt(l)));
        const f = labels.length ? labels[0].closest('.pkpFormField') : null;
        const group = f ? f.closest('.pkpFormGroup') : null;
        return {present: !!f, label: labels.length ? txt(labels[0]) : null, field: f ? txt(f).slice(0, 500) : null,
            group: group ? txt(group.querySelector('.pkpFormGroup__heading, legend, h2, h3')) : null, groupDescription: group ? txt(group.querySelector('.pkpFormGroup__description, p')) : null,
            input: f ? !!f.querySelector('input') : null, selectButton: f ? [...f.querySelectorAll('button')].map(txt).filter(Boolean) : null,
            saveButtons: [...scope.querySelectorAll('button')].filter(vis).filter((b) => /^Save$/.test(txt(b))).map((b) => ({disabled: b.disabled}))};
    };

    try {
        // ------------------------------------------------------------------ access: who opens the tab
        if (on('access')) await sect('access', async () => {
            const levels = isOPS
                ? ['admin', 'manager.maya', 'sectioneditor.ana', 'assistant.rita', 'author.alex', 'reader.rosa']
                : ['admin', 'manager.maya', 'editor.diana', 'sectioneditor.ana', 'assistant.rita', 'copyeditor.carla', 'layouteditor.leo', 'reviewer.julia', 'author.alex', 'reader.rosa'];
            const out = {};
            const probe = async (label) => {
                const resp = await page.goto(cu(app.contextPath, '/management/settings/context')).catch((e) => ({err: e.message}));
                await idle(page).catch(() => {});
                const o = {status: resp && resp.status ? resp.status() : resp && resp.err, url: page.url().replace(app.baseURL, ''),
                    tabButton: await page.locator('#categories-button').count(),
                    h1: flat(await page.locator('h1').first().innerText().catch(() => null), 200),
                    body: flat(await page.locator('main, body').first().innerText().catch(() => ''), 300),
                    navSettings: await page.getByRole('button', {name: 'Settings', exact: true}).or(page.getByRole('link', {name: 'Settings', exact: true})).count()};
                if (o.tabButton) {
                    await page.locator('#categories-button').click(); await idle(page); await sleep(500);
                    const tab = await readTab();
                    o.rows = tab.rows ? tab.rows.map((r) => r.cells[0]) : null;
                    o.add = await page.getByRole('button', {name: 'Add Category'}).count();
                }
                await snap(`a-${label}`, {access: o});
                return o;
            };
            await visitor();
            out.signedOut = await probe('signed-out');
            for (const u of levels) {
                await as(u, app.contextPath);
                out[u] = await probe(u.replace(/\./g, '-'));
            }
            if (!isOPS) { await as(S.N.u.ed, S.N.path); await page.goto(cu(S.N.path, '/management/settings/context')); await idle(page);
                out.editorWithoutPermit = {url: page.url().replace(app.baseURL, ''), tabButton: await page.locator('#categories-button').count(), body: flat(await page.locator('main, body').first().innerText().catch(() => ''), 300)};
                await snap('a-editor-no-permit', {access: out.editorWithoutPermit}); }
            await as('admin', S.C.path);
            await page.goto(cu(S.C.path, '/management/settings/context')); await idle(page);
            out.adminScratch = {tabButton: await page.locator('#categories-button').count()};
            await visitor();
            fact('access', out);
        });

        // ------------------------------------------------------------------ tab: rows, arrows, menu, empty table
        if (on('tab')) await sect('tab', async () => {
            const out = {};
            await as(S.C.u.mg, S.C.path);
            out.onLoad = await openTab(S.C.path, 't-01-tab-onload');
            out.positions = {addButton: await page.getByRole('button', {name: 'Add Category'}).boundingBox(), table: await table().boundingBox(),
                title: await page.locator('#categories').getByText('Categories', {exact: true}).first().boundingBox()};
            await loc(page, 'Categories tab button', page.locator('#categories-button'));
            await loc(page, 'Categories table', page.getByRole('table', {name: 'Categories'}));
            await loc(page, 'Add Category button', page.getByRole('button', {name: 'Add Category'}));
            await loc(page, 'a row by its name cell', row('Science'));
            await loc(page, 'row More Actions', row('Science').getByRole('button', {name: 'More Actions'}));
            out.menuScience = await rowMenu('Science');
            out.menuArts = await rowMenu('Arts');
            await loc(page, 'row menu items (portalled)', page.getByRole('menuitem'));
            const arrow = (name) => row(name).locator('td').last().getByRole('button');
            await arrow('Science').click(); await sleep(700);
            out.afterScience = await readTab(); await snap('t-02-science-open', {tab: out.afterScience});
            await arrow('Physics').click(); await sleep(700);
            out.afterPhysics = await readTab(); await snap('t-03-physics-open', {tab: out.afterPhysics});
            out.menuOptics = await rowMenu('Optics');
            await arrow('Arts').click({timeout: 5000}).then(() => (out.artsClick = 'clicked'), (e) => (out.artsClick = `click failed: ${String(e.message).split('\n')[0]}`));
            await sleep(700);
            out.afterArts = await readTab(); await snap('t-04-arts-arrow', {tab: out.afterArts});
            await arrow('Science').click(); await sleep(700);
            out.afterScienceClose = await readTab(); await snap('t-05-science-closed', {tab: out.afterScienceClose});
            await as(S.E.u.mg, S.E.path);
            out.empty = await openTab(S.E.path, 't-06-empty-tab');
            fact('tab', out);
        });

        // ------------------------------------------------------------------ window: the fields, a sub-category, "Edit"
        if (on('window')) await sect('window', async () => {
            const out = {};
            await as(S.C.u.mg, S.C.path);
            await openTab(S.C.path);
            await page.getByRole('button', {name: 'Add Category'}).click();
            await waitWin('Add Category');
            out.add = await readWin('Add Category'); await snap('w-01-add-window', {win: out.add});
            await loc(page, 'category window', win('Add Category'));
            await loc(page, 'Name (English)', win('Add Category').locator('#editCategory-title-control-en'));
            await loc(page, 'Path', win('Add Category').locator('#editCategory-path-control'));
            await loc(page, 'Order select', win('Add Category').locator('select[name="sortOption"]'));
            await loc(page, 'Cover Image file input', win('Add Category').locator('input[type=file]'));
            await loc(page, 'Editorial Assignments boxes', win('Add Category').locator('input[name^="subEditors"]'));
            await loc(page, 'French language button', win('Add Category').getByRole('button', {name: 'French', exact: true}));
            const fr = win('Add Category').getByRole('button', {name: 'French', exact: true});
            if (await fr.count()) { await fr.click(); await sleep(700); out.addFrench = await readWin('Add Category'); await snap('w-02-add-window-french', {win: out.addFrench}); }
            await closeWin('Add Category');
            // a sub-category under Arts, from the row's "Add"
            out.artsMenu = await rowMenu('Arts', 'Add');
            await waitWin('Add Category');
            out.rowAdd = await readWin('Add Category'); await snap('w-03-row-add-window', {win: out.rowAdd});
            await fillName('Add Category', 'Arts Sub'); await fillPath('Add Category', 'artssub');
            out.rowAddSave = await saveWin('Add Category');
            out.afterRowAdd = await readTab(); await snap('w-04-after-row-add', {tab: out.afterRowAdd, save: out.rowAddSave});
            // "Edit" on Science
            await openTab(S.C.path);
            out.sciMenu = await rowMenu('Science', 'Edit');
            await waitWin('Edit Category');
            out.edit = await readWin('Edit Category'); await snap('w-05-edit-science', {win: out.edit});
            const frE = win('Edit Category').getByRole('button', {name: 'French', exact: true});
            if (await frE.count()) { await frE.click(); await sleep(600); out.editFrench = await readWin('Edit Category'); await snap('w-06-edit-science-french', {win: out.editFrench}); }
            await closeWin('Edit Category');
            // a manager alone (E): "Editorial Assignments" with nobody to offer
            await as(S.E.u.mg, S.E.path);
            await openTab(S.E.path);
            await page.getByRole('button', {name: 'Add Category'}).click();
            await waitWin('Add Category');
            out.emptyCtx = await readWin('Add Category'); await snap('w-07-add-window-manager-alone', {win: out.emptyCtx});
            await closeWin('Add Category');
            fact('window', out);
        });

        // ------------------------------------------------------------------ refusals: empty, characters, taken, duplicate name (td2, A9)
        if (on('refusals')) await sect('refusals', async () => {
            const out = {};
            await as(S.C.u.mg, S.C.path);
            await openTab(S.C.path);
            const W = 'Add Category';
            const attempt = async (key, name, pathV, frName) => {
                if (!(await win(W).isVisible().catch(() => false))) { await page.getByRole('button', {name: 'Add Category'}).click(); await waitWin(W); }
                if (name !== undefined) await fillName(W, name);
                if (frName !== undefined) {
                    const frB = win(W).getByRole('button', {name: 'French', exact: true});
                    if (!(await win(W).locator('#editCategory-title-control-fr_CA').isVisible().catch(() => false))) { await frB.click(); await sleep(400); }
                    await fillName(W, frName, 'fr_CA');
                }
                if (pathV !== undefined) await fillPath(W, pathV);
                const saveBtn = win(W).getByRole('button', {name: 'Save', exact: true});
                const before = {saveDisabled: await saveBtn.isDisabled().catch(() => null)};
                const r = before.saveDisabled ? {status: null, note: 'Save disabled, not pressed'} : await saveWin(W);
                const o = {name, path: pathV, frName, before, save: r};
                o.win = r.stillOpen ? await readWin(W) : {open: false};
                o.saveDisabledAfter = r.stillOpen ? await saveBtn.isDisabled().catch(() => null) : null;
                await snap(`r-${key}`, {attempt: o});
                out[key] = {save: r, saveDisabledAfter: o.saveDisabledAfter, errors: o.win.fields ? o.win.fields.filter((f) => f.errors.length).map((f) => ({label: f.label, errors: f.errors})) : null, footer: o.win.footer, footerLinks: o.win.footerLinks};
                if (!r.stillOpen) out[key].rows = (await readTab()).rows.map((x) => x.cells[0]);
                return o;
            };
            await attempt('01-empty', '', '');
            // Save stays grayed out after a refusal until a flagged box changes
            await attempt('02-space', 'Refused path', 'my path');
            await attempt('03-dotted', 'Dotted', 'a-b_c.d');
            await attempt('04-slashed', 'Slashed', 'sci/phys');
            await attempt('05-taken', 'Taken', 'arts');
            await attempt('06-taken-upper', 'Taken upper', 'ARTS');
            await attempt('07-accented', 'Accented', 'café');
            await closeWin(W);
            await attempt('08-twin-one', 'Twin', 'twin1');
            await closeWin(W);
            await attempt('08-duplicate-name', 'Twin', 'twin2');
            await attempt('09-french-only', '', 'fronly', 'Seulement');
            await closeWin(W);
            out.tabAfter = await openTab(S.C.path, 'r-10-tab-after');
            fact('refusals', out);
        });

        // ------------------------------------------------------------------ assign: "Editorial Assignments" ticked, the "Assigned To" column
        if (on('assign')) await sect('assign', async () => {
            const out = {};
            await as(S.C.u.mg, S.C.path);
            await openTab(S.C.path);
            await rowMenu('Arts', 'Edit');
            await waitWin('Edit Category');
            const boxes = win('Edit Category').locator('input[name^="subEditors"]');
            out.boxCount = await boxes.count();
            const n = Math.min(2, out.boxCount);
            for (let i = 0; i < n; i++) await boxes.nth(i).check();
            out.ticked = await boxes.evaluateAll((els) => els.filter((e) => e.checked).map((e) => (e.labels && e.labels[0] ? e.labels[0].innerText.trim() : e.name)));
            await snap('as-01-edit-arts-ticked', {win: await readWin('Edit Category')});
            out.save = n ? await saveWin('Edit Category') : 'nothing to tick';
            if (!n) await closeWin('Edit Category');
            out.tab = await readTab(); await snap('as-02-tab-assigned-to', {tab: out.tab});
            await rowMenu('Arts', 'Edit');
            await waitWin('Edit Category');
            out.reopen = (await readWin('Edit Category')).fields.filter((f) => /options/.test(f.cls)).map((f) => ({label: f.label, inputs: f.inputs.map((i) => [i.label, i.value])}));
            await snap('as-03-edit-arts-reopened');
            await closeWin('Edit Category');
            S.assigned = out.ticked; save();
            fact('assign', out);
        });

        // ------------------------------------------------------------------ delete: the dialog, its count, its grayed-out button, Cancel, one delete
        if (on('delete')) await sect('delete', async () => {
            const out = {};
            await as(S.C.u.mg, S.C.path);
            await openTab(S.C.path);
            const dlg = () => page.getByRole('dialog').filter({hasText: /Are you absolutely sure/}).last();
            const DLG = () => page.evaluate(() => {
                const txt = (e) => (e ? (e.innerText || '').replace(/\s+/g, ' ').trim() : null);
                const d = [...document.querySelectorAll('[role=dialog], [role=alertdialog]')].filter((x) => x.getClientRects().length).pop();
                if (!d) return null;
                return {role: d.getAttribute('role'), name: d.getAttribute('aria-label') || txt(document.getElementById(d.getAttribute('aria-labelledby'))), title: txt(d.querySelector('h1,h2,h3')), text: (d.innerText || '').trim().slice(0, 2000),
                    lists: [...d.querySelectorAll('li')].map(txt), inputs: [...d.querySelectorAll('input')].map((i) => ({type: i.type, value: i.value, label: i.labels && i.labels[0] ? txt(i.labels[0]) : i.getAttribute('aria-label'), placeholder: i.placeholder})),
                    buttons: [...d.querySelectorAll('button')].map((b) => ({t: txt(b) || b.getAttribute('aria-label'), disabled: b.disabled}))};
            });
            const open = async (name) => { await rowMenu(name, 'Delete Category'); await dlg().waitFor({timeout: T}); await sleep(500); return DLG(); };
            const cancel = async () => { await dlg().getByRole('button', {name: 'Cancel', exact: true}).click(); await sleep(800); };
            out.science = await open('Science'); await snap('d-01-science-dialog', {dialog: out.science});
            await loc(page, 'delete dialog', dlg());
            await loc(page, 'delete dialog text box', dlg().locator('input'));
            await loc(page, 'delete confirm button', dlg().getByRole('button', {name: /I understand the consequences/}));
            await dlg().locator('input').first().fill('science'); await sleep(300);
            out.scienceLower = await DLG(); await snap('d-02-science-lowercase-typed', {dialog: out.scienceLower});
            await dlg().locator('input').first().fill('Science '); await sleep(300);
            out.scienceTrailing = await DLG();
            await dlg().locator('input').first().fill('Science'); await sleep(300);
            out.scienceTyped = await DLG(); await snap('d-03-science-typed', {dialog: out.scienceTyped});
            await cancel();
            out.afterCancel = (await readTab()).rows.map((r) => r.cells[0]); await snap('d-04-after-cancel', {rows: out.afterCancel});
            await page.getByRole('cell', {name: 'Science', exact: true}).waitFor({timeout: 5000}).catch(() => {});
            // Physics (one below it), Arts (Arts Sub below it)
            await sleep(600);
            await row('Science').locator('td').last().getByRole('button').click(); await sleep(700);
            out.physics = await open('Physics'); await snap('d-05-physics-dialog', {dialog: out.physics}); await cancel();
            await sleep(600);
            out.arts = await open('Arts'); await snap('d-06-arts-dialog', {dialog: out.arts}); await cancel();
            // "Dotted" (none below it): delete it
            await sleep(600);
            if (await row('Dotted').count()) {
                out.dotted = await open('Dotted'); await snap('d-07-dotted-dialog', {dialog: out.dotted});
                await dlg().locator('input').first().fill('Dotted'); await sleep(300);
                const resp = page.waitForResponse((r) => /\/api\/v1\/categories\/\d+/.test(r.url()) && r.request().method() !== 'GET', {timeout: 15_000}).catch(() => null);
                await dlg().getByRole('button', {name: /I understand the consequences/}).click();
                const r = await resp; out.deleteResp = r ? {status: r.status(), method: r.request().method(), override: r.request().headers()['x-http-method-override'] || null} : null;
                await sleep(1200);
                out.afterDelete = await DLG(); await snap('d-08-deleted-dialog', {dialog: out.afterDelete});
                const btns = out.afterDelete ? out.afterDelete.buttons.map((b) => b.t).filter((t) => t && t !== 'Close') : [];
                if (btns.length) { await page.getByRole('button', {name: btns[btns.length - 1], exact: true}).last().click().catch(() => {}); await sleep(900); }
                out.rowsAfterDelete = (await readTab()).rows.map((x) => x.cells[0]); await snap('d-09-tab-after-delete', {rows: out.rowsAfterDelete});
            } else out.dotted = 'no Dotted row (refusals phase not run)';
            fact('delete', out);
        });

        // ------------------------------------------------------------------ cover: "Cover Image" upload, its "Alternate text", refused files
        if (on('cover')) await sect('cover', async () => {
            const out = {};
            await as(S.C.u.mg, S.C.path);
            await openTab(S.C.path);
            const W = 'Edit Category';
            const input = () => win(W).locator('input[type=file]').first();
            const upload = async (key, file) => {
                const resp = page.waitForResponse((r) => /temporaryFiles/.test(r.url()) && r.request().method() === 'POST', {timeout: 15_000}).catch(() => null);
                await input().setInputFiles(file);
                const r = await resp; await sleep(1500); await idle(page);
                const w = await readWin(W);
                const o = {file: path.basename(typeof file === 'string' ? file : file.name), upload: r ? r.status() : null,
                    cover: w.fields ? w.fields.filter((f) => /upload|Cover|Alternate/i.test(`${f.cls} ${f.label}`)) : null,
                    coverText: await win(W).locator('.pkpFormField--upload, .pkpFormField--uploadImage').first().innerText().catch(() => null),
                    img: await win(W).locator('.pkpFormField--upload img, .pkpFormField--uploadImage img').evaluateAll((els) => els.map((e) => ({src: e.getAttribute('src'), alt: e.getAttribute('alt')}))).catch(() => [])};
                await snap(`c-${key}`, {cover: o});
                return o;
            };
            await rowMenu('Arts', 'Edit'); await waitWin(W);
            out.txt = await upload('01-text-file', fixture('not-an-image.txt'));
            await closeWin(W);
            await rowMenu('Arts', 'Edit'); await waitWin(W);
            out.fakePng = await upload('02-fake-png', fixture('not-an-image.png'));
            const altFake = win(W).getByRole('textbox', {name: /Alternate text/i}).first();
            out.fakePngAltBox = await altFake.count();
            out.fakePngSave = await saveWin(W);
            out.fakePngWin = out.fakePngSave.stillOpen ? await readWin(W) : null;
            await snap('c-03-fake-png-saved', {save: out.fakePngSave});
            await closeWin(W);
            await openTab(S.C.path);
            await rowMenu('Arts', 'Edit'); await waitWin(W);
            out.png = await upload('04-png', fixture('profile-image-400.png'));
            const alt = win(W).getByRole('textbox', {name: /Alternate text/i}).first();
            out.altBox = await alt.count();
            await loc(page, 'Cover Image "Alternate text" box', alt);
            if (out.altBox) await alt.fill('Arts picture');
            out.pngSave = await saveWin(W);
            await snap('c-05-png-saved', {save: out.pngSave});
            await closeWin(W);
            await openTab(S.C.path);
            await rowMenu('Arts', 'Edit'); await waitWin(W);
            out.reopen = {coverText: await win(W).locator('.pkpFormField--upload, .pkpFormField--uploadImage').first().innerText().catch(() => null),
                img: await win(W).locator('.pkpFormField--upload img, .pkpFormField--uploadImage img').evaluateAll((els) => els.map((e) => ({src: e.getAttribute('src'), alt: e.getAttribute('alt')}))).catch(() => []),
                alt: await win(W).getByRole('textbox', {name: /Alternate text/i}).first().inputValue().catch(() => null)};
            await snap('c-06-reopened', {cover: out.reopen});
            await closeWin(W);
            fact('cover', out);
        });

        // ------------------------------------------------------------------ place: the entry page's "Categories" field, by who opens it (Actors row 2)
        if (on('place')) await sect('place', async () => {
            const out = {};
            const MENU = isOJS ? 'Publication Settings' : isOMP ? 'Catalog Entry' : 'Preprint entry';
            const read = async (ctx, sid, user, key, author) => {
                await as(user, ctx);
                await page.goto(cu(ctx, `/dashboard/${author ? 'mySubmissions' : 'editorial'}?workflowSubmissionId=${sid}`)); await idle(page);
                const link = page.getByRole('link', {name: MENU, exact: true}).last();
                const o = {menu: await link.count()};
                if (o.menu) {
                    await link.click(); await idle(page); await sleep(1500);
                    await page.getByText(/^Categories/).first().waitFor({timeout: 8000}).catch(() => {});
                    Object.assign(o, await page.evaluate(CATFIELD));
                } else o.menus = flat(await page.locator('[role=dialog]').first().innerText().catch(() => ''), 600);
                await snap(`p-${key}`, {place: o});
                return o;
            };
            out.manager = await read(S.C.path, S.s.P.id, S.C.u.mg, '01-manager');
            await loc(page, 'entry page Categories "Select Categories" button', page.getByRole('button', {name: 'Select Categories'}));
            out.sectionEditor = await read(S.C.path, S.s.P.id, S.C.u.se, '02-section-editor');
            out.author = await read(S.C.path, S.s.P.id, S.C.u.au, '03-author', true);
            if (S.s.FS && S.s.FS.id) out.noCategoryContext = await read(S.F.path, S.s.FS.id, S.F.u.mg, '04-manager-no-category');
            await visitor();
            fact('place', out);
        });

        // ------------------------------------------------------------------ wizard: the author's "Categories" field, asked or not, with and without categories (Actors row 3)
        if (on('wizard')) await sect('wizard', async () => {
            const out = {};
            const walk = async (ctx, user, draft, key) => {
                await as(user, ctx);
                await page.goto(cu(ctx, `/submission?id=${draft}`));
                await currentStep().first().waitFor({timeout: T}); await idle(page);
                const o = {};
                try { await continueTo('Details'); await continueTo('Contributors'); await continueTo(lastStep); } catch (e) { o.stepError = String(e.message).split('\n')[0]; }
                await idle(page); await sleep(800);
                o.step = flat(await currentStep().first().innerText().catch(() => null), 80);
                Object.assign(o, await page.evaluate(CATFIELD));
                await snap(`wz-${key}`, {wizard: o});
                return o;
            };
            out.askedWithCategories = await walk(S.C.path, S.C.u.au, S.s.D2.id, '01-asked-with-categories');
            out.askedNoCategory = await walk(S.F.path, S.F.u.au, S.s.FD.id, '02-asked-no-category');
            out.notAsked = await walk(S.N.path, S.N.u.au, S.s.ND.id, '03-not-asked');
            await visitor();
            fact('wizard', out);
        });

        // ------------------------------------------------------------------ autoassign: a submission arriving with "Arts", whose window ticks two editors (Actors row 4)
        if (on('autoassign') && !isOPS) await sect('autoassign', async () => {
            const out = {assignedInWindow: S.assigned || null};
            if (!S.D1submitted) {
                await as(S.C.u.au, S.C.path);
                await page.goto(cu(S.C.path, `/submission?id=${S.s.D1.id}`));
                await currentStep().first().waitFor({timeout: T}); await idle(page);
                await uploadWizardFile(`${S.t}d1`);
                await continueTo('Details'); await continueTo('Contributors'); await continueTo(lastStep);
                await idle(page); await sleep(800);
                await page.getByRole('button', {name: 'Select Categories'}).first().click();
                const picker = page.getByRole('dialog', {name: 'Select Categories'}).last();
                await picker.waitFor({timeout: T}); await sleep(800);
                const box = picker.getByRole('checkbox', {name: 'Arts', exact: true});
                if (await box.count()) await box.check(); else await picker.locator('tr').filter({hasText: /^\s*Arts\s*$/}).locator('input[type=checkbox]').first().check();
                await snap('aa-01-picker-arts', {picker: flat(await picker.innerText().catch(() => ''), 800)});
                await picker.getByRole('button', {name: 'Save', exact: true}).click(); await sleep(800);
                out.field = await page.evaluate(CATFIELD);
                await snap('aa-02-step-with-arts', {field: out.field});
                const validated = page.waitForResponse((r) => r.url().includes('/submit') && r.request().method() === 'POST' && r.status() < 500, {timeout: 45000}).catch(() => null);
                await continueTo('Review');
                await validated;
                await page.locator('.submissionWizard__loadingReview').waitFor({state: 'hidden', timeout: 20000}).catch(() => {});
                out.review = flat(await page.locator('.submissionWizard').innerText().catch(() => ''), 2500);
                await snap('aa-03-review', {review: out.review});
                await page.locator('.submissionWizard__footer').getByRole('button', {name: 'Submit', exact: true}).click();
                const d = page.getByRole('dialog').filter({hasText: /will be submitted to|Are you sure you want to (complete|submit)/});
                await d.waitFor({timeout: 30000});
                await d.getByRole('button', {name: 'Submit', exact: true}).click();
                await page.getByRole('heading', {name: 'Submission complete'}).waitFor({timeout: 45000});
                S.D1submitted = true; save();
                await snap('aa-04-complete');
            }
            await as(S.C.u.mg, S.C.path);
            await page.goto(cu(S.C.path, `/dashboard/editorial?workflowSubmissionId=${S.s.D1.id}`)); await idle(page); await sleep(1500);
            out.participants = await page.evaluate(() => {
                const vis = (e) => e.getClientRects().length > 0;
                const dlg = [...document.querySelectorAll('[role=dialog]')].filter(vis)[0] || document.body;
                const h = [...dlg.querySelectorAll('h1,h2,h3,h4')].filter(vis).find((x) => /^participants$/i.test(x.textContent.trim()));
                if (!h) return {present: false};
                let box = h.parentElement;
                for (let i = 0; i < 4 && box && !box.querySelector('ul, [role=list]'); i++) box = box.parentElement;
                return {present: true, items: box ? [...box.querySelectorAll('li')].filter(vis).map((li) => li.innerText.split('\n').map((x) => x.trim()).filter(Boolean).join('/')) : []};
            });
            await snap('aa-05-manager-workflow-participants', {participants: out.participants});
            // the ticked Editor's own dashboard
            await as(S.C.u.ed, S.C.path);
            await page.goto(cu(S.C.path, '/dashboard/editorial')); await idle(page); await sleep(1000);
            out.editorDashboard = flat(await page.locator('main').innerText().catch(() => ''), 1200);
            out.editorSeesD1 = out.editorDashboard ? out.editorDashboard.includes(`Draft one ${S.t}`) : null;
            await snap('aa-06-ticked-editor-dashboard', {sees: out.editorSeesD1});
            await visitor();
            fact('autoassign', out);
        });

        // ------------------------------------------------------------------ visitor: the pages a reader reaches, signed out, signed in, on a restricted site (Actors row 5; Purpose; the preamble)
        if (on('visitor')) await sect('visitor', async () => {
            const out = {};
            const VIS = () => {
                const txt = (e) => (e ? (e.innerText || '').replace(/\s+/g, ' ').trim() : null);
                const links = (sc) => (sc ? [...sc.querySelectorAll('a')].map((a) => ({t: txt(a), h: a.getAttribute('href')})) : []);
                return {title: document.title, h1: [...document.querySelectorAll('h1')].map(txt), breadcrumb: txt(document.querySelector('.cmp_breadcrumbs')),
                    count: txt(document.querySelector('.page_catalog_category .count, .page_catalog_category h2, .cmp_catalog_category .count')),
                    main: txt(document.querySelector('.pkp_structure_main, main, body')).slice(0, 700),
                    browse: (() => { const b = document.querySelector('.block_browse, .pkp_block.block_browse'); return b ? {text: txt(b), links: links(b)} : null; })(),
                    categoryLinks: [...document.querySelectorAll('a[href*="/category/"]')].map((a) => ({t: txt(a), h: a.getAttribute('href'), where: (a.closest('.pkp_block, .categories, .item, .cmp_breadcrumbs, section, nav, div[class]') || {}).className || null})),
                    images: [...document.querySelectorAll('.page_catalog_category img, .cover img')].map((i) => ({src: i.getAttribute('src'), alt: i.getAttribute('alt'), w: i.naturalWidth, h: i.naturalHeight, complete: i.complete}))};
            };
            const land = async (url, key) => {
                const resp = await page.goto(url.startsWith('http') ? url : app.url(url)).catch((e) => ({err: e.message}));
                await idle(page).catch(() => {});
                const o = {status: resp && resp.status ? resp.status() : resp && resp.err, finalUrl: page.url().replace(app.baseURL, ''), who, ...(await page.evaluate(VIS))};
                await snap(`v-${key}`, {visit: o});
                return o;
            };
            await visitor();
            out.homeSignedOut = await land(cu(S.C.path, ''), '01-home-signed-out');
            const itemUrl = isOMP ? `/catalog/book/${S.s.A.id}` : isOPS ? `/preprint/view/${S.s.A.id}` : `/article/view/${S.s.A.id}`;
            out.itemSignedOut = await land(cu(S.C.path, itemUrl), '02-item-signed-out');
            out.sciSignedOut = await land(catPage(S.C.path, 'sci'), '03-sci-signed-out');
            const slashed = (out.homeSignedOut.browse ? out.homeSignedOut.browse.links : []).concat(out.homeSignedOut.categoryLinks).find((l) => /sci(%2F|\/)phys/i.test(l.h || ''));
            out.slashedHref = slashed ? slashed.h : null;
            if (slashed) out.slashedFromLink = await land(slashed.h, '04-slashed-from-link');
            out.lowerArts = await land(catPage(S.C.path, 'arts'), '05-arts');
            out.upperArts = await land(catPage(S.C.path, 'ARTS'), '06-ARTS');
            await as(S.C.u.rd, S.C.path);
            out.sciReader = await land(catPage(S.C.path, 'sci'), '07-sci-reader');
            await visitor();
            out.restrictedSignedOut = await land(catPage(S.R.path, 'rcat'), '08-restricted-signed-out');
            await as(S.R.u.rd, S.R.path);
            out.restrictedReader = await land(catPage(S.R.path, 'rcat'), '09-restricted-reader');
            await visitor();
            // the preamble: an item published into "Physics" shows on its page only once the background jobs have run
            if (!S.s.J) { S.s.J = await app.api.createSubmission({tag: `${S.t}jobs`, context: S.C.path, submitter: S.C.u.au, title: `K1 Jobs ${S.t}`, abstract: 'Jobs abstract.', categories: ['phys'], published: true}).then((r) => ({id: r.submissionId}), (e) => ({error: String(e.message).slice(0, 300)})); save(); }
            out.physBeforeJobs = await land(catPage(S.C.path, 'phys'), '10-phys-before-jobs');
            out.jobs = drainJobs(app);
            out.physAfterJobs = await land(catPage(S.C.path, 'phys'), '11-phys-after-jobs');
            fact('visitor', out);
        });

        // ------------------------------------------------------------------ settings: OMP cover sizes (Appearance › Advanced), the Browse Block's "Settings" (Actors row 6)
        if (on('settings')) await sect('settings', async () => {
            const out = {};
            await as(S.C.u.mg, S.C.path);
            await page.goto(cu(S.C.path, '/management/settings/website')); await idle(page);
            out.websiteTabs = await page.getByRole('tab').allInnerTexts().catch(() => []);
            await page.locator('#appearance-button').click().catch(() => {}); await idle(page);
            const adv = page.locator('#advanced-button');
            out.advancedTab = await adv.count();
            if (out.advancedTab) {
                await adv.first().click(); await idle(page); await sleep(800);
                out.advanced = await page.evaluate(() => {
                    const txt = (e) => (e ? (e.innerText || '').replace(/\s+/g, ' ').trim() : null);
                    const p = document.querySelector('#advanced');
                    return p ? {text: txt(p).slice(0, 1500), fields: [...p.querySelectorAll('.pkpFormField')].map((f) => ({label: txt(f.querySelector('.pkpFormFieldLabel, legend')), description: txt(f.querySelector('.pkpFormField__description')), value: (f.querySelector('input') || {}).value}))} : null;
                });
                await snap('s-01-appearance-advanced', {advanced: out.advanced});
            }
            // the Browse Block row of the Plugins grid
            await page.goto(cu(S.C.path, '/management/settings/website')); await idle(page);
            await page.locator('#plugins-button').click().catch(() => {}); await idle(page); await sleep(1000);
            const browseRow = page.locator('tr').filter({hasText: 'Browse Block'}).first();
            await browseRow.waitFor({timeout: T}).catch(() => {});
            out.browseRow = flat(await browseRow.innerText().catch(() => null), 300);
            const extras = browseRow.locator('a.show_extras');
            out.browseExtras = await extras.count();
            if (out.browseExtras) { await extras.click(); await sleep(600); }
            const actionsRow = page.locator('tr').filter({hasText: 'Browse Block'}).first().locator('xpath=following-sibling::tr[1]');
            out.browseActions = out.browseExtras ? (await actionsRow.getByRole('link').allInnerTexts().catch(() => [])).map((x) => x.trim()).filter(Boolean) : [];
            await snap('s-02-plugins-browse-row', {browseRow: out.browseRow, actions: out.browseActions});
            const settingsLink = actionsRow.getByRole('link', {name: 'Settings', exact: true});
            if (out.browseExtras && await settingsLink.count()) {
                await settingsLink.click(); await sleep(1500); await idle(page);
                const w = page.locator('[role=dialog]:visible').last();
                await w.locator('input[type=checkbox]').first().waitFor({timeout: T}).catch(() => {});
                out.browseSettings = {text: flat(await w.innerText().catch(() => ''), 1000), boxes: await w.locator('input[type=checkbox]').evaluateAll((els) => els.map((e) => ({name: e.name, checked: e.checked, label: e.labels && e.labels[0] ? e.labels[0].innerText.trim() : null})))};
                await snap('s-03-browse-block-settings', {browseSettings: out.browseSettings});
                await w.getByRole('link', {name: 'Cancel'}).or(w.getByRole('button', {name: 'Cancel'})).first().click().catch(() => {});
                await sleep(800);
            }
            // OMP: the cover sizes change the small copy made at the category's next save
            if (isOMP && out.advanced) {
                const coverImg = async (key) => {
                    await visitor();
                    const imgs = [];
                    const onResp = (r) => { if (/thumbnail|category|public\/presses/.test(r.url()) && r.request().resourceType() === 'image') { const h = r.headers(); imgs.push({url: r.url().replace(app.baseURL, ''), status: r.status(), type: h['content-type'] || null, length: h['content-length'] || null}); } };
                    page.on('response', onResp);
                    await page.goto(catPage(S.C.path, 'arts')); await idle(page); await sleep(800);
                    page.off('response', onResp);
                    const o = {requests: imgs, imgs: await page.locator('.pkp_structure_main img, main img').evaluateAll((els) => els.map((i) => ({src: i.getAttribute('src'), alt: i.getAttribute('alt'), w: i.naturalWidth, h: i.naturalHeight})))};
                    await snap(`s-${key}`, {cover: o});
                    return o;
                };
                out.pageBefore = await coverImg('04-omp-arts-page-before');
                await as(S.C.u.mg, S.C.path);
                await page.goto(cu(S.C.path, '/management/settings/website')); await idle(page);
                await page.locator('#appearance-button').click(); await idle(page);
                await page.locator('#advanced-button').first().click(); await idle(page); await sleep(600);
                const wBox = page.locator('#advanced input[name="coverThumbnailsMaxWidth"]');
                const hBox = page.locator('#advanced input[name="coverThumbnailsMaxHeight"]');
                out.boxes = {w: await wBox.count(), h: await hBox.count()};
                if (out.boxes.w && out.boxes.h) {
                    await wBox.fill('50'); await hBox.fill('40');
                    const panel = page.locator('#advanced');
                    await panel.getByRole('button', {name: 'Save', exact: true}).click();
                    await panel.locator('[role="status"]').filter({hasText: 'Saved'}).first().waitFor({timeout: 15_000}).catch(() => {});
                    await snap('s-05-omp-advanced-saved');
                    await openTab(S.C.path);
                    await rowMenu('Arts', 'Edit'); await waitWin('Edit Category');
                    out.resave = await saveWin('Edit Category');
                    out.pageAfter = await coverImg('06-omp-arts-page-after');
                    // restore
                    await as(S.C.u.mg, S.C.path);
                    await page.goto(cu(S.C.path, '/management/settings/website')); await idle(page);
                    await page.locator('#appearance-button').click(); await idle(page);
                    await page.locator('#advanced-button').first().click(); await idle(page); await sleep(600);
                    await page.locator('#advanced input[name="coverThumbnailsMaxWidth"]').fill('106'); await page.locator('#advanced input[name="coverThumbnailsMaxHeight"]').fill('100');
                    await page.locator('#advanced').getByRole('button', {name: 'Save', exact: true}).click(); await sleep(1500);
                }
            } else if (!isOMP) {
                await visitor();
                await page.goto(catPage(S.C.path, 'arts')); await idle(page);
                out.artsPageImages = await page.locator('.pkp_structure_main img').evaluateAll((els) => els.map((i) => ({src: i.getAttribute('src'), alt: i.getAttribute('alt'), w: i.naturalWidth, h: i.naturalHeight})));
                await snap('s-04-arts-page-image', {images: out.artsPageImages});
            }
            await visitor();
            fact('settings', out);
        });

        // ------------------------------------------------------------------ leave: the window left with a change unsaved (Close, reopen; leave the page)
        if (on('leave')) await sect('leave', async () => {
            const out = {};
            await as(S.C.u.mg, S.C.path);
            await openTab(S.C.path);
            await rowMenu('Science', 'Edit'); await waitWin('Edit Category');
            await fillName('Edit Category', 'Science changed');
            await win('Edit Category').locator('#editCategory-path-control').focus();
            const n0 = jsDialogs.length;
            await closeWin('Edit Category');
            out.afterClose = {dialogs: jsDialogs.slice(n0), windowOpen: await win('Edit Category').isVisible().catch(() => false), otherDialogs: await page.locator('[role=dialog]:visible, [role=alertdialog]:visible').count()};
            await snap('l-01-after-close-with-change', {leave: out.afterClose});
            out.rows = (await readTab()).rows.map((r) => r.cells[0]);
            await sleep(600);
            await rowMenu('Science', 'Edit'); await waitWin('Edit Category');
            out.reopenedName = await win('Edit Category').locator('#editCategory-title-control-en').inputValue();
            await snap('l-02-reopened', {name: out.reopenedName});
            await fillName('Edit Category', 'Science changed again');
            await win('Edit Category').locator('#editCategory-path-control').focus();
            const n1 = jsDialogs.length;
            await page.goto(cu(S.C.path, '/management/settings/website')).catch((e) => (out.gotoError = String(e.message).split('\n')[0]));
            await idle(page).catch(() => {});
            out.afterLeave = {dialogs: jsDialogs.slice(n1), url: page.url().replace(app.baseURL, '')};
            await snap('l-03-after-leaving-page', {leave: out.afterLeave});
            await openTab(S.C.path);
            out.rowsAfter = (await readTab()).rows.map((r) => r.cells[0]);
            fact('leave', out);
        });

        // ------------------------------------------------------------------ leave2: what an unsaved, closed window leaves in the next window opened
        if (on('leave2')) await sect('leave2', async () => {
            const out = {};
            await as(S.C.u.mg, S.C.path);
            await openTab(S.C.path);
            const vals = async (W) => ({name: await win(W).locator('#editCategory-title-control-en').inputValue().catch(() => null), path: await win(W).locator('#editCategory-path-control').inputValue().catch(() => null)});
            // Edit "Science", change the name, Close; then Edit "Arts"
            await rowMenu('Science', 'Edit'); await waitWin('Edit Category');
            await fillName('Edit Category', 'Science unsaved'); await fillPath('Edit Category', 'sciunsaved');
            await closeWin('Edit Category'); await sleep(600);
            await rowMenu('Arts', 'Edit'); await waitWin('Edit Category');
            out.artsAfterScienceUnsaved = await vals('Edit Category');
            await snap('l2-01-edit-arts-after-unsaved-science', {values: out.artsAfterScienceUnsaved});
            await closeWin('Edit Category'); await sleep(600);
            await rowMenu('Science', 'Edit'); await waitWin('Edit Category');
            out.scienceReopened = await vals('Edit Category');
            await snap('l2-02-edit-science-reopened', {values: out.scienceReopened});
            await closeWin('Edit Category'); await sleep(600);
            // "Add Category", type, Close; then "Add Category" again, and a row's "Add"
            await page.getByRole('button', {name: 'Add Category'}).click(); await waitWin('Add Category');
            await fillName('Add Category', 'Unsaved add'); await fillPath('Add Category', 'unsavedadd');
            await closeWin('Add Category'); await sleep(600);
            await page.getByRole('button', {name: 'Add Category'}).click(); await waitWin('Add Category');
            out.addReopened = await vals('Add Category');
            await snap('l2-03-add-reopened', {values: out.addReopened});
            await closeWin('Add Category'); await sleep(600);
            await rowMenu('Arts', 'Add'); await waitWin('Add Category');
            out.rowAddAfter = await vals('Add Category');
            await snap('l2-04-row-add-after-unsaved-add', {values: out.rowAddAfter});
            await closeWin('Add Category'); await sleep(600);
            // a reload drops it
            await openTab(S.C.path);
            await rowMenu('Science', 'Edit'); await waitWin('Edit Category');
            out.scienceAfterReload = await vals('Edit Category');
            await snap('l2-05-edit-science-after-reload', {values: out.scienceAfterReload});
            await closeWin('Edit Category');
            out.rows = (await readTab()).rows.map((r) => r.cells[0]);
            fact('leave2', out);
        });

        // ------------------------------------------------------------------ depth: a fourth level, from the third level's "Add" (Purpose: "to any depth")
        if (on('depth')) await sect('depth', async () => {
            const out = {};
            await as(S.C.u.mg, S.C.path);
            await openTab(S.C.path);
            const arrow = (name) => row(name).locator('td').last().getByRole('button');
            await arrow('Science').click(); await sleep(700);
            await arrow('Physics').click(); await sleep(700);
            if (!(await row('Lenses').count())) {
                out.menu = await rowMenu('Optics', 'Add');
                await waitWin('Add Category');
                await fillName('Add Category', 'Lenses'); await fillPath('Add Category', 'lenses');
                out.save = await saveWin('Add Category');
            }
            out.tab = (await readTab()).rows.map((r) => `${r.cells[0]} @${r.indent}`);
            await snap('dp-01-fourth-level', {rows: out.tab});
            await visitor();
            await page.goto(catPage(S.C.path, 'lenses')); await idle(page);
            out.page = {h1: flat(await page.locator('h1').first().innerText().catch(() => null), 100), breadcrumb: flat(await page.locator('.cmp_breadcrumbs').innerText().catch(() => null), 200)};
            await snap('dp-02-lenses-page', {page: out.page});
            fact('depth', out);
        });
    } finally {
        if (jsDialogs.length) record('js-dialogs', jsDialogs);
        await close();
    }
});
