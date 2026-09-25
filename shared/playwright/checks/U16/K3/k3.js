// U16 claim check, chunk K3: the category picker and its "Select Categories" window, placing a version in
// categories (Rules 16, 17), "Editorial Assignments" on arrival (Rule 18), the side effects, Settings 1
// ("Categories" in Settings › Workflow › Submission › "Metadata"), the Cross-feature list, register A12.
// Spec: docs/specs/U16-categories.md lines 92–109, 238–292, 322–358, 526–530; footnotes d, e, f, k, l, m,
// td4, td13, f-a12.
//
//   PROBE_FEATURE=U16 PROBE_AGENT=ccK3 node bin/probe.js <app|all> shared/playwright/checks/U16/K3/k3.js
//   PHASES=seed,settings,assign,filters1,picker,filters2,lists,wizard,arrival,published,version,delete,control,seeded,eentry,cross,noend
//   (default: all, in that order; state in .reports/U16/<agent>/k3-state-<app>.json, so a phase re-runs alone;
//   RESEED=1 starts over). A full run can outlast the Bash cap: run one app, or a few phases, at a time.
//
// Scratch contexts per app (tag prefix u16k3):
//   P  categories "Applied Science" › "Computer Science" › "Computer Vision", "Applied Science" › "Engineering",
//      "Arts"; the wizard asks for categories; users mg manager, ed editor {OJS OMP}, se sectionEditor
//      (OJS: the section's "Editorial Assignments"), sa sectionEditor in no section, rv externalReviewer
//      {OJS OMP}, au author. Submissions: PR in Production {OJS OMP} (OPS: submitted), PB published with
//      "Arts" and "Computer Vision", RV in review with rv {OJS OMP}, drafts D1 and D2 of au.
//   E  the wizard asks, no category (mg, au, one submitted, one draft).
//   N  "Arts" and "Science", the wizard does not ask (mg, au, a draft).
//   D  "Science" › "Physics", "Arts" (mg, au); DB published in "Physics" and "Arts", DS submitted in "Physics".
// Reads on publicknowledge only (the category window's "Editorial Assignments", opened and closed unsaved).
// No assertions: the script records, the reader judges.
const fs = require('fs');
const path = require('path');
const {execFileSync} = require('child_process');
const {forEachApp, launch, signIn, signOut, screen, shot, record, loc, note, idle, tag, outDir} = require('../../../probe');

const T = 30_000;
const ALL = ['seed', 'settings', 'assign', 'filters1', 'picker', 'filters2', 'lists', 'wizard', 'arrival', 'published', 'version', 'delete', 'control', 'seeded', 'eentry', 'cross', 'noend'];
const PHASES = (process.env.PHASES || ALL.join(',')).split(',');
const on = (p) => PHASES.includes(p);
const log = (...a) => console.log('[k3]', new Date().toISOString().slice(11, 19), ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (s, n = 1500) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));
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
    const statePath = path.join(outDir(), `k3-state-${app.name}.json`);
    const S = (!process.env.RESEED && fs.existsSync(statePath)) ? JSON.parse(fs.readFileSync(statePath, 'utf8')) : {};
    const save = () => fs.writeFileSync(statePath, JSON.stringify(S, null, 1));
    const fact = (k, v) => { record('k3-facts', {[k]: v}, {merge: true}); log(`[${app.name} ${k}]`, JSON.stringify(v).slice(0, 2500)); };
    const MENU = isOJS ? 'Publication Settings' : isOMP ? 'Catalog Entry' : 'Preprint entry';
    const lastStep = isOPS ? 'For Readers' : 'For the Editors';

    // ------------------------------------------------------------------ seed
    if (on('seed') && !S.seeded) {
        const t = tag('u16k3');
        S.t = t;
        const u = (p, k, roles, g, f, extra) => ({username: `${p}${k}`, roles, givenName: g, familyName: f, ...(extra || {})});
        const ctx = (p, name) => ({name: `U16 K3 ${name} ${p}`, acronym: 'KTHR', contactName: 'K3 Contact', contactEmail: `${p}c@mail.test`});
        const uname = (list, p) => Object.fromEntries(list.map((x) => [x.username.slice(p.length), x.username]));
        const issue = isOJS ? {issues: [{volume: 1, number: 1, year: 2026, published: true}]} : {};
        const inIssue = isOJS ? {issue: {volume: 1, number: 1, year: 2026}} : {};
        // P
        const pp = `${t}p`;
        const pUsers = isOPS
            ? [u(pp, 'mg', ['manager'], 'Pia', 'Manager'), u(pp, 'se', ['sectionEditor'], 'Sol', 'Moderator'), u(pp, 'au', ['author'], 'Abe', 'Author')]
            : [u(pp, 'mg', ['manager'], 'Pia', 'Manager'), u(pp, 'ed', ['editor'], 'Eda', 'Editor'),
                u(pp, 'se', ['sectionEditor'], 'Sol', 'Sectioned', isOJS ? {sections: ['ART']} : {}),
                u(pp, 'sa', ['sectionEditor'], 'Sia', 'Unsectioned'), u(pp, 'rv', ['externalReviewer'], 'Rex', 'Reviewer'),
                u(pp, 'au', ['author'], 'Abe', 'Author')];
        const pBody = {tag: pp, context: ctx(pp, 'picker'), submitWithCategories: true, users: pUsers, ...issue,
            categories: [{path: 'applied', title: 'Applied Science', children: [{path: 'cs', title: 'Computer Science', children: [{path: 'vision', title: 'Computer Vision'}]}, {path: 'eng', title: 'Engineering'}]},
                {path: 'arts', title: 'Arts'}]};
        if (isOJS) pBody.sections = [{abbrev: 'ART', title: 'Articles'}];
        const rp = await app.api.createContext(pBody);
        S.P = {path: rp.path || pp, id: rp.contextId, cats: rp.categories, u: uname(pUsers, pp)};
        save();
        // E: asks, no category
        const pe = `${t}e`;
        const eUsers = [u(pe, 'mg', ['manager'], 'Eli', 'Manager'), u(pe, 'au', ['author'], 'Eve', 'Author')];
        const re = await app.api.createContext({tag: pe, context: ctx(pe, 'asks none'), submitWithCategories: true, users: eUsers});
        S.E = {path: re.path || pe, u: uname(eUsers, pe)};
        // N: categories, not asked
        const pn = `${t}n`;
        const nUsers = [u(pn, 'mg', ['manager'], 'Nat', 'Manager'), u(pn, 'au', ['author'], 'Ned', 'Author')];
        const rn = await app.api.createContext({tag: pn, context: ctx(pn, 'not asked'), categories: [{path: 'arts', title: 'Arts'}, {path: 'sci', title: 'Science'}], users: nUsers});
        S.N = {path: rn.path || pn, u: uname(nUsers, pn)};
        // D: the delete
        const pd = `${t}d`;
        const dUsers = [u(pd, 'mg', ['manager'], 'Dee', 'Manager'), u(pd, 'au', ['author'], 'Dan', 'Author')];
        const rd = await app.api.createContext({tag: pd, context: ctx(pd, 'delete'), users: dUsers, ...issue,
            categories: [{path: 'sci', title: 'Science', children: [{path: 'phys', title: 'Physics'}]}, {path: 'arts', title: 'Arts'}]});
        S.D = {path: rd.path || pd, u: uname(dUsers, pd)};
        save();
        const sub = async (C, key, spec) => {
            try {
                const r = await app.api.createSubmission({tag: `${t}${key}`, context: C.path, submitter: C.u.au, title: `K3 ${key} ${t}`, abstract: `K3 ${key} abstract.`, ...spec});
                log('seed', key, r.submissionId, r.publicationId, r.status);
                await sleep(1100);
                return {id: r.submissionId, pub: r.publicationId, status: r.status, title: `K3 ${key} ${t}`};
            } catch (e) { log('seed FAILED', key, String(e.message).slice(0, 600)); return {error: String(e.message).slice(0, 600)}; }
        };
        const prod = isOPS ? {} : {files: [{file: 'article.pdf'}], decisions: ['skipExternalReview', 'sendToProduction']};
        S.s = {};
        S.s.PR = await sub(S.P, 'prod', {...prod, participants: isOPS ? [{username: S.P.u.se, role: 'sectionEditor'}] : [{username: S.P.u.ed, role: 'editor'}]});
        S.s.PB = await sub(S.P, 'pub', {categories: ['arts', 'vision'], published: true, ...inIssue});
        if (!isOPS) S.s.RV = await sub(S.P, 'rev', {files: [{file: 'article.pdf'}], decisions: ['sendExternalReview'], reviewRounds: [{reviewers: [{username: S.P.u.rv}]}]});
        S.s.D1 = await sub(S.P, 'draftone', {submitted: false});
        S.s.D2 = await sub(S.P, 'drafttwo', {submitted: false});
        S.s.ES = await sub(S.E, 'esub', {});
        S.s.ED = await sub(S.E, 'edraft', {submitted: false});
        S.s.ND = await sub(S.N, 'ndraft', {submitted: false});
        S.s.DB = await sub(S.D, 'dpub', {categories: ['phys', 'arts'], published: true, ...inIssue});
        S.s.DS = await sub(S.D, 'dsub', {categories: ['phys']});
        S.seeded = true;
        save();
        record('seed', S);
    }
    if (!S.seeded) { log('no state; run seed first'); return; }
    if (PHASES.length === 1 && PHASES[0] === 'seed') return;

    // ------------------------------------------------------------------ browser and helpers
    const {page, close} = await launch(app);
    const jsDialogs = [];
    page.on('dialog', (d) => {
        jsDialogs.push({at: new Date().toISOString(), url: page.url(), type: d.type(), message: d.message().slice(0, 300)});
        log('[browser dialog]', d.type(), flat(d.message(), 200));
        d.accept().catch(() => {});
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
    const as = async (user, ctx) => { await signIn(page, user, {contextPath: ctx}); await idle(page); };
    const visitor = async () => { await signOut(page).catch(() => {}); };
    const cu = (ctx, p) => app.url(`/index.php/${ctx}${p}`);
    const catPage = (ctx, p) => cu(ctx, `/${isOPS ? 'preprints' : 'catalog'}/category/${p}`);
    const itemPage = (ctx, id) => cu(ctx, isOJS ? `/article/view/${id}` : isOPS ? `/preprint/view/${id}` : `/catalog/book/${id}`);
    const wf = () => page.locator('[role="dialog"]:visible').first();
    const tasksCount = async () => flat(await page.locator('header').first().innerText().catch(() => ''), 300);

    // the "Categories" field, as data (in the open dialog, the workflow's included, else the page)
    const FIELD = () => {
        const txt = (e) => (e ? (e.innerText || '').replace(/\s+/g, ' ').trim() : null);
        const vis = (e) => e.getClientRects().length > 0;
        const scopes = [...document.querySelectorAll('[role=dialog]')].filter(vis);
        const scope = scopes.length ? scopes[scopes.length - 1] : document;
        const f = [...scope.querySelectorAll('.pkpFormField, .pkpAutosuggest')].filter(vis).find((x) => /^Categories\b/.test(txt(x.querySelector('.pkpFormFieldLabel, legend, label, .pkpFormField__heading')) || ''));
        if (!f) return {present: false, dialogTitle: scopes.length ? txt(scope.querySelector('h1,h2')) : null};
        const group = f.closest('.pkpFormGroup');
        const input = f.querySelector('input:not([type=hidden])');
        return {present: true,
            label: txt(f.querySelector('.pkpFormFieldLabel, legend, label, .pkpFormField__heading')),
            description: txt(f.querySelector('.pkpFormField__description')),
            text: txt(f).slice(0, 600),
            group: group ? txt(group.querySelector('.pkpFormGroup__heading, legend, h2, h3')) : null,
            groupDescription: group ? txt(group.querySelector('.pkpFormGroup__description')) : null,
            input: input ? {role: input.getAttribute('role'), ariaLabel: input.getAttribute('aria-label'), placeholder: input.getAttribute('placeholder'), value: input.value} : null,
            chips: [...f.querySelectorAll('.pkpBadge, [class*=chip], [class*=Chip], [class*=selected] li, .pkpAutosuggest__selection')].filter(vis).map(txt).filter(Boolean),
            buttons: [...f.querySelectorAll('button')].filter(vis).map((b) => txt(b) || b.getAttribute('aria-label')),
            // the field's position relative to the input: is the button under it?
            layout: (() => { const b = [...f.querySelectorAll('button')].filter(vis).find((x) => /Select Categories/.test(txt(x))); if (!b || !input) return null; const rb = b.getBoundingClientRect(); const ri = input.getBoundingClientRect(); return {buttonTop: Math.round(rb.top), inputBottom: Math.round(ri.bottom)}; })()};
    };
    const readField = () => page.evaluate(FIELD);
    const fieldLoc = () => page.locator('.pkpFormField, .pkpAutosuggest').filter({has: page.locator('.pkpFormFieldLabel, legend, label, .pkpFormField__heading').filter({hasText: /^\s*Categories/})}).last();
    const fieldInput = () => fieldLoc().locator('input:not([type=hidden])').first();
    async function typeSuggest(text) {
        const inp = fieldInput();
        await inp.click();
        await inp.fill('');
        await inp.pressSequentially(text, {delay: 40});
        await sleep(1500);
        const opts = (await suggestOptions().allInnerTexts().catch(() => [])).map((x) => flat(x, 200)).filter(Boolean);
        return opts;
    }
    // the suggestions of the field's own list (a page's native <select> options are role=option too)
    const suggestOptions = () => page.locator('[role=listbox]:visible [role=option]');
    async function chooseSuggest(text, option) {
        const opts = await typeSuggest(text);
        const o = suggestOptions().filter({hasText: option}).first();
        if (await o.count()) { await o.click(); await sleep(800); return {opts, chosen: true}; }
        await page.keyboard.press('Escape').catch(() => {});
        return {opts, chosen: false};
    }
    // the "Select Categories" window, as data
    const WINDOW = () => {
        const txt = (e) => (e ? (e.innerText || e.textContent || '').replace(/\s+/g, ' ').trim() : null);
        const vis = (e) => e.getClientRects().length > 0;
        const d = [...document.querySelectorAll('[role=dialog]')].filter(vis).filter((x) => /Select Categories/.test(txt(x.querySelector('h1,h2')) || '')).pop();
        if (!d) return {open: false};
        const r = d.getBoundingClientRect();
        const table = d.querySelector('table');
        const ths = table ? [...table.querySelectorAll('thead th')].map((th) => ({text: (th.textContent || '').trim(), shown: txt(th), srOnly: !!th.querySelector('.sr-only'), transform: getComputedStyle(th.querySelector('span') || th).textTransform})) : [];
        const rows = table ? [...table.querySelectorAll('tbody tr')].map((tr) => {
            const label = tr.querySelector('label, span');
            const box = tr.querySelector('input[type=checkbox]');
            const cell = tr.querySelector('td');
            const btn = tr.querySelector('td:last-child button');
            const lab = tr.querySelector('label') || tr.querySelector('td span');
            return {text: txt(tr), visible: vis(tr), weight: lab ? getComputedStyle(lab).fontWeight : null, pad: lab ? lab.style.paddingInlineStart || getComputedStyle(lab).paddingInlineStart : null,
                box: box ? {checked: box.checked, visible: vis(box)} : null,
                arrow: btn ? {name: txt(btn) || btn.getAttribute('aria-label'), expanded: btn.getAttribute('aria-expanded'), w: Math.round(btn.getBoundingClientRect().width)} : null};
        }) : [];
        return {open: true, heading: txt(d.querySelector('h1,h2')), box: {left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width), vw: window.innerWidth},
            headers: ths, rows, buttons: [...d.querySelectorAll('button')].filter(vis).map((b) => txt(b) || b.getAttribute('aria-label')), text: txt(d).slice(0, 1500)};
    };
    const readWindow = () => page.evaluate(WINDOW);
    const pickWin = () => page.getByRole('dialog', {name: 'Select Categories'}).last();
    async function openWindow() {
        await fieldLoc().getByRole('button', {name: 'Select Categories'}).first().click();
        await pickWin().waitFor({timeout: T}); await idle(page); await sleep(900);
    }
    const winRow = (name) => pickWin().locator('tbody tr').filter({has: page.locator('label').filter({hasText: new RegExp(`^\\s*${name}\\s*$`)})}).first();
    async function tick(name, want = true) {
        const row = winRow(name);
        const box = row.locator('input[type=checkbox]').first();
        if ((await box.isChecked()) !== want) await box.click();
        await sleep(300);
    }
    async function pageSave(key) {
        const form = fieldLoc().locator('xpath=ancestor::form[1]');
        const once = async () => {
            const w = page.waitForResponse((r) => /\/publications\/\d+/.test(r.url()) && r.request().method() !== 'GET', {timeout: 12_000}).catch(() => null);
            await form.getByRole('button', {name: 'Save', exact: true}).last().click();
            const r = await w; await idle(page); await sleep(900);
            const status = await page.locator('[role=status]').allInnerTexts().catch(() => []);
            const errors = (await form.locator('.pkpFieldError, .pkpFormPage__status, .pkpFormErrors, [class*=error]').allInnerTexts().catch(() => [])).map((x) => flat(x, 160)).filter(Boolean);
            return {status: r ? r.status() : null, method: r ? r.request().method() : null, override: r ? r.request().headers()['x-http-method-override'] || null : null, formStatus: status.map((x) => flat(x, 80)).filter(Boolean), errors: [...new Set(errors)].slice(0, 8)};
        };
        const first = await once();
        if (first.status || !isOJS) return first;
        // OJS: an unscheduled article's page refuses its Save until "Issue Assignment" is answered
        if (key) await snap(`${key}-refused`, {save: first});
        const radios = await form.locator('input[type=radio]').evaluateAll((els) => els.map((r) => ({name: r.name, value: r.value, checked: r.checked, label: ((r.closest('label') || {}).innerText || '').trim()})));
        const dont = form.getByRole('radio', {name: /Don't Assign To An Issue/}).first();
        if (await dont.count()) await dont.check();
        const second = await once();
        return {first, radios, retriedWith: "Don't Assign To An Issue", second};
    }
    async function openWorkflow(ctx, sid, author) {
        await page.goto(cu(ctx, `/dashboard/${author ? 'mySubmissions' : 'editorial'}?workflowSubmissionId=${sid}`)); await idle(page); await sleep(1500);
    }
    async function openEntry(ctx, sid, pubId) {
        if (pubId && S.menuKeyShape) {
            await page.goto(cu(ctx, `/dashboard/editorial?workflowSubmissionId=${sid}&workflowMenuKey=${S.menuKeyShape.replace('{pub}', pubId)}`));
            await idle(page); await sleep(1500);
        } else {
            await openWorkflow(ctx, sid);
            const link = wf().getByRole('link', {name: MENU, exact: true}).last();
            await link.click(); await idle(page); await sleep(1500);
            const m = /workflowMenuKey=([^&]+)/.exec(page.url());
            if (m && !S.menuKeyShape) { S.menuKeyShape = decodeURIComponent(m[1]).replace(/_\d+_/, '_{pub}_'); save(); }
        }
        await fieldLoc().waitFor({timeout: 12_000}).catch(() => {});
        await idle(page); await sleep(600);
    }
    const PARTICIPANTS = () => {
        const vis = (e) => e.getClientRects().length > 0;
        const dlg = [...document.querySelectorAll('[role=dialog]')].filter(vis)[0] || document.body;
        const h = [...dlg.querySelectorAll('h1,h2,h3,h4')].filter(vis).find((x) => /^participants$/i.test(x.textContent.trim()));
        if (!h) return {present: false};
        let box = h.parentElement;
        for (let i = 0; i < 4 && box && !box.querySelector('ul, [role=list]'); i++) box = box.parentElement;
        return {present: true, items: box ? [...box.querySelectorAll('li')].filter(vis).map((li) => li.innerText.split('\n').map((x) => x.trim()).filter(Boolean).join('/')) : []};
    };
    const readParticipants = async (ctx, sid) => { await openWorkflow(ctx, sid); await sleep(800); return page.evaluate(PARTICIPANTS); };
    async function inbox(username) {
        await sleep(3000);
        try { const res = await app.mail._search({to: `${username}@mail.test`}); return (res.messages || []).map((m) => `${m.Created || ''} ${flat(m.Subject || m.subject, 160)}`); } catch (e) { return {error: flat(e.message, 200)}; }
    }
    // the Filters window of a list
    const filtersWin = () => page.getByRole('dialog').filter({has: page.getByRole('button', {name: 'Apply Filters', exact: true})}).last();
    async function openFilters() {
        await page.locator('main, #app-main').first().getByRole('button', {name: 'Filters', exact: true}).first().click();
        await filtersWin().getByRole('button', {name: 'Apply Filters', exact: true}).waitFor({timeout: T});
        await idle(page); await sleep(700);
    }
    const FILTERS = () => {
        const txt = (e) => (e ? (e.innerText || '').replace(/\s+/g, ' ').trim() : null);
        const vis = (e) => e.getClientRects().length > 0;
        const d = [...document.querySelectorAll('[role=dialog]')].filter(vis).filter((x) => /Apply Filters/.test(txt(x))).pop();
        if (!d) return {open: false};
        const labels = [...d.querySelectorAll('.pkpFormFieldLabel, legend, label.pkpFormFieldLabel, .pkpFormField__heading')].filter(vis).map(txt).filter(Boolean);
        return {open: true, labels, text: txt(d).slice(0, 1500)};
    };
    const listRows = async () => page.evaluate(() => [...document.querySelectorAll('main table tbody tr, #app-main table tbody tr')].map((tr) => (tr.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 160)));
    const listHeading = async () => flat(await page.locator('main h1, #app-main h1').first().innerText().catch(() => null), 120);
    const chipsRow = async () => page.evaluate(() => [...document.querySelectorAll('button[aria-label^="Clear filter"], div.bg-selection-light')].map((e) => (e.getAttribute('aria-label') || e.innerText || '').replace(/\s+/g, ' ').trim()));

    // ---- the submission wizard (as checks/U16/K1/k1.js walks it)
    const fixture = (f) => path.join(REPO, 'apps', app.name, 'playwright/fixtures/files', f);
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
    async function wizardTo(ctx, draft, upload) {
        await page.goto(cu(ctx, `/submission?id=${draft}`));
        await currentStep().first().waitFor({timeout: T}); await idle(page);
        if (upload) await uploadWizardFile(upload);
        await continueTo('Details'); await continueTo('Contributors'); await continueTo(lastStep);
        await idle(page); await sleep(900);
    }
    async function wizardSubmit(name) {
        const validated = page.waitForResponse((r) => r.url().includes('/submit') && r.request().method() === 'POST' && r.status() < 500, {timeout: 45000}).catch(() => null);
        await continueTo('Review');
        await validated;
        await page.locator('.submissionWizard__loadingReview').waitFor({state: 'hidden', timeout: 20000}).catch(() => {});
        const review = flat(await page.locator('.submissionWizard').innerText().catch(() => ''), 3000);
        await snap(`${name}-review`, {review});
        await page.locator('.submissionWizard__footer').getByRole('button', {name: 'Submit', exact: true}).click();
        const d = page.getByRole('dialog').filter({hasText: /will be submitted to|Are you sure you want to (complete|submit)/});
        await d.waitFor({timeout: 30000});
        await d.getByRole('button', {name: 'Submit', exact: true}).click();
        await page.getByRole('heading', {name: 'Submission complete'}).waitFor({timeout: 45000});
        await snap(`${name}-complete`);
        return review;
    }
    // Settings › Journal › Categories: the category window by row
    async function editCategory(ctx, name) {
        await page.goto(cu(ctx, '/management/settings/context')); await idle(page);
        await page.locator('#categories-button').click(); await idle(page);
        const table = page.locator('#categories table').first();
        await table.waitFor({timeout: T});
        const row = table.locator('tbody tr').filter({has: page.getByRole('cell', {name, exact: true})}).first();
        await row.getByRole('button', {name: 'More Actions'}).click();
        await page.getByRole('menuitem', {name: 'Edit', exact: true}).click();
        const w = page.getByRole('dialog', {name: /Edit Category/}).last();
        await w.waitFor({timeout: T});
        await w.locator('[name="path"]').first().waitFor({timeout: T});
        for (let i = 0; i < 20 && !(await w.locator('[name="path"]').first().inputValue().catch(() => '')); i++) await sleep(300);
        await idle(page); await sleep(600);
        return w;
    }
    const assignBoxes = (w) => w.locator('input[name^="subEditors"]').evaluateAll((els) => els.map((b) => ({name: b.name, value: b.value, checked: b.checked, label: ((b.closest('label') || {}).innerText || '').trim()})));
    async function saveCategoryWin(w) {
        const r = page.waitForResponse((x) => /\/api\/v1\/categories/.test(x.url()) && x.request().method() !== 'GET', {timeout: 15_000}).catch(() => null);
        await w.getByRole('button', {name: 'Save', exact: true}).click();
        const resp = await r; await sleep(500);
        const toasts = await page.evaluate(() => [...document.querySelectorAll('[role=status], [role=alert], [data-pc-name=toast], .p-toast-message')].map((e) => (e.innerText || '').replace(/\s+/g, ' ').trim()).filter(Boolean));
        await idle(page); await sleep(400);
        return {status: resp ? resp.status() : null, method: resp ? resp.request().method() : null, toasts, stillOpen: await w.isVisible().catch(() => false)};
    }

    try {
        // ------------------------------------------------------------------ settings: Settings 1, the "Categories" radios, both ends
        if (on('settings')) await sect('settings', async () => {
            const out = {};
            const read = async (ctx, name) => {
                await page.goto(cu(ctx, '/management/settings/workflow')); await idle(page);
                await page.locator('#metadata-button').click(); await idle(page); await sleep(600);
                const radios = await page.locator('input[name="submitWithCategories"]').evaluateAll((els) => els.map((r) => ({value: r.value, checked: r.checked, label: ((r.closest('label') || {}).innerText || '').trim()})));
                const group = page.locator('fieldset, .pkpFormField').filter({has: page.locator('input[name="submitWithCategories"]')}).last();
                const o = {radios, group: flat(await group.innerText().catch(() => null), 600)};
                await snap(name, o);
                return o;
            };
            await as(S.N.u.mg, S.N.path);
            out.nBefore = await read(S.N.path, 's-01-N-metadata-default');
            await loc(page, 'Settings › Workflow › Submission › Metadata: "Categories" radios', page.locator('input[name="submitWithCategories"]'));
            // left once with a change, unsaved: tick "Yes" and go to another tab, then leave the page
            await page.locator('input[name="submitWithCategories"][value="true"]').check();
            const d0 = jsDialogs.length;
            await page.locator('#components-button, #submission-button, [id$="-button"]').filter({hasText: /Components|Review|Emails|Library/}).first().click().catch(() => {});
            await sleep(800);
            out.tabSwitchDialogs = jsDialogs.slice(d0);
            await page.goto(cu(S.N.path, '/management/settings/website')); await idle(page);
            out.leaveDialogs = jsDialogs.slice(d0);
            out.nAfterLeave = await read(S.N.path, 's-02-N-metadata-after-leaving-unsaved');
            // save "Yes" on screen, reload, read; then the wizard of N's draft (phase wizard) sees the field
            await page.locator('input[name="submitWithCategories"][value="true"]').check();
            const form = page.locator('form').filter({has: page.locator('input[name="submitWithCategories"]')}).first();
            const w = page.waitForResponse((x) => /\/api\/v1\/contexts\/\d+$/.test(x.url()) && x.request().method() !== 'GET', {timeout: T}).catch(() => null);
            await form.getByRole('button', {name: 'Save', exact: true}).click();
            const r = await w; await idle(page); await sleep(800);
            out.saveYes = {status: r ? r.status() : null, formStatus: (await page.locator('[role=status]').allInnerTexts()).map((x) => flat(x, 60)).filter(Boolean)};
            out.nAfterSave = await read(S.N.path, 's-03-N-metadata-saved-yes');
            S.N.askedOnScreen = true; save();
            await as(S.P.u.mg, S.P.path);
            out.p = await read(S.P.path, 's-04-P-metadata-seeded-yes');
            fact('settings', out);
        });

        // ------------------------------------------------------------------ assign: tick sa (and read the window) on "Arts"; the save's message, mail and Tasks
        if (on('assign')) await sect('assign', async () => {
            const out = {};
            await as(S.P.u.mg, S.P.path);
            out.tasksBefore = await tasksCount();
            const w = await editCategory(S.P.path, 'Arts');
            out.boxesBefore = await assignBoxes(w);
            out.group = flat(await w.locator('fieldset, .pkpFormGroup').filter({hasText: 'Editorial Assignments'}).last().innerText().catch(() => null), 800);
            await snap('a-01-arts-window', {boxes: out.boxesBefore, group: out.group});
            if (!isOPS) {
                const box = w.locator('label').filter({hasText: /Sia Unsectioned/}).locator('input').first();
                out.saBox = await box.count();
                if (out.saBox) await box.check();
                out.save = await saveCategoryWin(w);
                await snap('a-02-arts-saved', {save: out.save});
                const w2 = await editCategory(S.P.path, 'Arts');
                out.boxesAfter = await assignBoxes(w2);
                await snap('a-03-arts-reopened', {boxes: out.boxesAfter});
                await w2.getByRole('button', {name: 'Close', exact: true}).first().click().catch(() => {});
                out.tab = flat(await page.locator('#categories table').first().innerText().catch(() => null), 600);
            } else {
                out.save = await saveCategoryWin(w);
                await snap('a-02-arts-saved', {save: out.save});
            }
            await page.reload(); await idle(page); await sleep(800);
            out.tasksAfter = await tasksCount();
            S.assignedAt = new Date().toISOString(); save();
            fact('assign', out);
        });

        // ------------------------------------------------------------------ filters1: the dashboard's "Filters" window, before PR is placed
        const filterBy = async (ctx, name, key, pick, view = 'active') => {
            await page.goto(cu(ctx, `/dashboard/editorial?currentViewId=${view}`)); await idle(page); await sleep(1000);
            const o = {heading: await listHeading(), rowsBefore: await listRows()};
            await openFilters();
            o.window = await page.evaluate(FILTERS);
            o.field = await readField();
            await snap(`${key}-filters-open`, {filters: o.window, field: o.field});
            if (o.field.present && pick) {
                o.suggestVis = await typeSuggest('vis');
                await snap(`${key}-filters-typed-vis`, {options: o.suggestVis});
                await page.keyboard.press('Escape').catch(() => {});
                await fieldInput().fill('').catch(() => {});
                o.pick = await chooseSuggest(pick.slice(0, 3), pick);
                o.fieldAfterPick = await readField();
                const ar = page.waitForResponse((r) => /_submissions/.test(r.url()), {timeout: 15_000}).catch(() => null);
                await filtersWin().getByRole('button', {name: 'Apply Filters', exact: true}).click();
                const r = await ar; o.apply = r ? {status: r.status(), query: decodeURIComponent(r.url().split('?')[1] || '').slice(0, 300)} : null;
                await idle(page); await sleep(1200);
                o.heading2 = await listHeading(); o.rowsAfter = await listRows(); o.chips = await chipsRow();
                await snap(`${key}-filters-applied`, {rows: o.rowsAfter, chips: o.chips});
                await page.getByRole('button', {name: 'Clear Filters', exact: true}).first().click().catch(() => {});
                await idle(page);
            } else {
                await filtersWin().getByRole('button', {name: 'Close', exact: true}).first().click().catch(() => page.keyboard.press('Escape'));
            }
            return o;
        };
        if (on('filters1')) await sect('filters1', async () => {
            const out = {};
            await as(S.P.u.mg, S.P.path);
            out.pArtsBefore = await filterBy(S.P.path, 'P', 'f1-01-P-arts', 'Arts');
            // the Filters window's own "Select Categories"
            await page.goto(cu(S.P.path, '/dashboard/editorial?currentViewId=active')); await idle(page);
            await openFilters();
            const hasBtn = await fieldLoc().getByRole('button', {name: 'Select Categories'}).count();
            out.filtersSelectButton = hasBtn;
            if (hasBtn) { await openWindow(); out.filtersWindow = await readWindow(); await snap('f1-02-P-filters-select-window', {win: out.filtersWindow}); await loc(page, 'Filters › Categories › "Select Categories" window', pickWin()); await pickWin().getByRole('button', {name: 'Close', exact: true}).first().click().catch(() => {}); await sleep(900); }
            await as(S.E.u.mg, S.E.path);
            out.eNoCategory = await filterBy(S.E.path, 'E', 'f1-03-E-no-category', null);
            fact('filters1', out);
        });

        // ------------------------------------------------------------------ picker: td4 on PR's entry page, as Editor (OPS: Moderator)
        if (on('picker')) await sect('picker', async () => {
            const out = {};
            const who = isOPS ? S.P.u.se : S.P.u.ed;
            await as(who, S.P.path);
            await openEntry(S.P.path, S.s.PR.id);
            out.url = page.url().replace(app.baseURL, '');
            out.field = await readField();
            await snap('p-01-entry-page', {field: out.field});
            await loc(page, `${MENU}: "Categories" field`, fieldLoc());
            await loc(page, `${MENU}: "Categories" typing box`, fieldInput());
            // typing: one deep match, two matches, none, upper case
            out.vis = await typeSuggest('vis');
            await snap('p-02-typed-vis', {options: out.vis});
            await loc(page, 'picker suggestion options (the field\'s listbox)', suggestOptions());
            out.sci = await typeSuggest('sci');
            out.upper = await typeSuggest('SCI');
            out.none = await typeSuggest('zzz');
            await snap('p-03-typed-zzz', {options: out.none});
            out.choose = await chooseSuggest('vis', 'Computer Vision');
            out.afterChoose = await readField();
            await snap('p-04-chose-vision', {field: out.afterChoose});
            out.visAgain = await typeSuggest('vis');
            out.sciAfter = await typeSuggest('sci');
            await page.keyboard.press('Escape').catch(() => {});
            await fieldInput().fill('');
            // the chip's remove button
            const rm = fieldLoc().getByRole('button', {name: /^Remove/}).first();
            out.removeName = await rm.getAttribute('aria-label').catch(() => null) || flat(await rm.innerText().catch(() => null), 80);
            await rm.click().catch(() => {}); await sleep(600);
            out.afterRemove = await readField();
            await snap('p-05-removed', {field: out.afterRemove});
            out.choose2 = await chooseSuggest('vis', 'Computer Vision');
            // the window
            await openWindow();
            out.window = await readWindow();
            await snap('p-06-window-open', {win: out.window});
            await loc(page, '"Select Categories" window', pickWin());
            await loc(page, '"Select Categories" window: header cells', pickWin().locator('thead th'));
            await loc(page, '"Select Categories" window: a row box by name', winRow('Arts').locator('input[type=checkbox]'));
            // an arrow pressed: what it does
            const arrow = pickWin().locator('tbody tr').filter({hasText: /Applied Science/}).first().locator('td:last-child button').first();
            if (await arrow.count()) { await arrow.click().catch(() => {}); await sleep(500); out.windowAfterArrow = await readWindow(); await snap('p-07-window-arrow-pressed', {win: out.windowAfterArrow}); await arrow.click().catch(() => {}); await sleep(500); }
            // "Close" with a change: what the chips keep
            await tick('Arts', true);
            await pickWin().getByRole('button', {name: 'Close', exact: true}).first().click(); await sleep(900);
            out.afterCloseUnsaved = await readField();
            await snap('p-08-window-closed-unsaved', {field: out.afterCloseUnsaved});
            // tick Arts, Save
            await openWindow();
            out.windowReopen = await readWindow();
            await tick('Arts', true);
            await pickWin().getByRole('button', {name: 'Save', exact: true}).click(); await sleep(1000);
            out.afterWindowSave = await readField();
            await snap('p-09-window-saved-arts', {field: out.afterWindowSave});
            // untick in the window: replaces the chips
            await openWindow();
            await tick('Computer Vision', false);
            await pickWin().getByRole('button', {name: 'Save', exact: true}).click(); await sleep(1000);
            out.afterUntick = await readField();
            await snap('p-10-window-unticked-vision', {field: out.afterUntick});
            // leave the page with the choice unsaved: another publication menu item, then a reload
            const d0 = jsDialogs.length;
            await wf().getByRole('link', {name: 'Title & Abstract', exact: true}).first().click().catch(() => {});
            await idle(page); await sleep(1200);
            out.menuSwitch = {dialogs: jsDialogs.slice(d0), url: page.url().replace(app.baseURL, ''), text: flat(await wf().innerText().catch(() => ''), 300)};
            await snap('p-11-left-for-title-abstract', {menuSwitch: out.menuSwitch});
            await wf().getByRole('link', {name: MENU, exact: true}).last().click(); await idle(page); await sleep(1500);
            out.backUnsaved = await readField();
            await snap('p-12-back-unsaved', {field: out.backUnsaved});
            await openEntry(S.P.path, S.s.PR.id);
            out.afterReload = await readField();
            out.reloadDialogs = jsDialogs.slice(d0);
            await snap('p-13-reloaded-unsaved', {field: out.afterReload});
            // choose again, the page's Save, reload
            await chooseSuggest('Ar', 'Arts');
            await chooseSuggest('vis', 'Computer Vision');
            out.beforeSave = await readField();
            out.save = await pageSave('p-14');
            await snap('p-14-page-saved', {save: out.save, field: await readField()});
            await openEntry(S.P.path, S.s.PR.id);
            out.afterSaveReload = await readField();
            await snap('p-15-saved-reloaded', {field: out.afterSaveReload});
            S.placedPR = true; save();
            // a Section Editor assigned to PR {OJS OMP}: the same field (sweep at a second level)
            fact('picker', out);
        });

        // ------------------------------------------------------------------ filters2: PR under "Arts" and under its parent line after the page's Save
        if (on('filters2')) await sect('filters2', async () => {
            const out = {};
            await as(S.P.u.mg, S.P.path);
            out.arts = await filterBy(S.P.path, 'P', 'f2-01-P-arts', 'Arts');
            out.vision = await filterBy(S.P.path, 'P', 'f2-02-P-vision', 'Computer Vision');
            out.parent = await filterBy(S.P.path, 'P', 'f2-03-P-applied-parent', 'Applied Science');
            fact('filters2', out);
        });

        // ------------------------------------------------------------------ lists: My Submissions (author) and reviewer "Filters", with and without categories
        if (on('lists')) await sect('lists', async () => {
            const out = {};
            const read = async (ctx, user, url, key) => {
                await as(user, ctx);
                await page.goto(cu(ctx, url)); await idle(page); await sleep(1200);
                const o = {heading: await listHeading()};
                const fb = page.locator('main, #app-main').first().getByRole('button', {name: 'Filters', exact: true});
                o.filtersButton = await fb.count();
                if (o.filtersButton) {
                    await openFilters();
                    o.window = await page.evaluate(FILTERS); o.field = await readField();
                    if (o.field.present) { o.vis = await typeSuggest('vis'); await page.keyboard.press('Escape').catch(() => {}); }
                }
                await snap(key, o);
                return o;
            };
            out.authorP = await read(S.P.path, S.P.u.au, '/dashboard/mySubmissions', 'l-01-P-author-my-submissions');
            out.authorE = await read(S.E.path, S.E.u.au, '/dashboard/mySubmissions', 'l-02-E-author-my-submissions');
            if (!isOPS) out.reviewerP = await read(S.P.path, S.P.u.rv, '/dashboard/reviewAssignments', 'l-03-P-reviewer-assignments');
            if (!isOPS) out.sectionEditorP = await read(S.P.path, S.P.u.se, '/dashboard/editorial?currentViewId=active', 'l-04-P-section-editor-dashboard');
            fact('lists', out);
        });

        // ------------------------------------------------------------------ wizard: Settings 1 at both ends, D1 with "Arts" (typed), D2 without
        if (on('wizard')) await sect('wizard', async () => {
            const out = {};
            await as(S.P.u.au, S.P.path);
            if (!S.D1submitted) {
                await wizardTo(S.P.path, S.s.D1.id, `${S.t}d1`);
                out.p = await readField();
                await snap('w-01-P-for-the-editors', {field: out.p});
                await loc(page, `wizard "${lastStep}": "Categories" field`, fieldLoc());
                out.pVis = await typeSuggest('vis');
                out.pick = await chooseSuggest('Ar', 'Arts');
                out.pAfter = await readField();
                await snap('w-02-P-arts-picked', {field: out.pAfter});
                out.reviewD1 = await wizardSubmit('w-03-P-D1');
                S.D1submitted = new Date().toISOString(); save();
            }
            if (!S.D2submitted) {
                await wizardTo(S.P.path, S.s.D2.id, `${S.t}d2`);
                out.d2 = await readField();
                out.reviewD2 = await wizardSubmit('w-04-P-D2');
                S.D2submitted = new Date().toISOString(); save();
            }
            // E: asked, no category; N: asked on screen in phase settings (or not)
            await as(S.E.u.au, S.E.path);
            await wizardTo(S.E.path, S.s.ED.id, null);
            out.e = await readField();
            await snap('w-05-E-asked-no-category', {field: out.e});
            await as(S.N.u.au, S.N.path);
            await wizardTo(S.N.path, S.s.ND.id, null);
            out.n = {askedOnScreen: !!S.N.askedOnScreen, field: await readField()};
            await snap('w-06-N-after-settings-phase', out.n);
            fact('wizard', out);
        });

        // ------------------------------------------------------------------ arrival: Rule 18 on the scratch journal (td13)
        if (on('arrival')) await sect('arrival', async () => {
            const out = {};
            await as(S.P.u.mg, S.P.path);
            out.d1Participants = await readParticipants(S.P.path, S.s.D1.id);
            await snap('r-01-D1-participants', {participants: out.d1Participants});
            out.d1Categories = null;
            out.d2Before = await readParticipants(S.P.path, S.s.D2.id);
            await snap('r-02-D2-participants-before', {participants: out.d2Before});
            // as Editor (OPS: the manager; the Moderator is not assigned to D2 and is refused its workflow) add Arts to D2
            await as(isOPS ? S.P.u.mg : S.P.u.ed, S.P.path);
            await openEntry(S.P.path, S.s.D2.id);
            out.d2Field = await readField();
            if (out.d2Field.present) {
                await chooseSuggest('Ar', 'Arts');
                out.d2Save = await pageSave('r-03');
            }
            await snap('r-03-D2-arts-added', {field: await readField(), save: out.d2Save});
            await as(S.P.u.mg, S.P.path);
            out.d2After = await readParticipants(S.P.path, S.s.D2.id);
            await snap('r-04-D2-participants-after', {participants: out.d2After});
            // the ticked Section Editor's own dashboard and mailbox; the manager's (control: the needs-an-editor email)
            if (!isOPS) {
                await as(S.P.u.sa, S.P.path);
                await page.goto(cu(S.P.path, '/dashboard/editorial')); await idle(page); await sleep(1000);
                out.saDashboard = {heading: await listHeading(), rows: await listRows()};
                await snap('r-05-sa-dashboard', out.saDashboard);
                out.saMail = await inbox(S.P.u.sa);
                out.seMail = await inbox(S.P.u.se);
            }
            out.mgMail = await inbox(S.P.u.mg);
            out.auMail = await inbox(S.P.u.au);
            // changing the ticks after arrival: untick sa on Arts, read D1 again
            if (!isOPS) {
                await as(S.P.u.mg, S.P.path);
                const w = await editCategory(S.P.path, 'Arts');
                const box = w.locator('label').filter({hasText: /Sia Unsectioned/}).locator('input').first();
                if (await box.count()) await box.uncheck();
                out.untick = await saveCategoryWin(w);
                out.d1AfterUntick = await readParticipants(S.P.path, S.s.D1.id);
                await snap('r-06-D1-after-untick', {participants: out.d1AfterUntick});
            }
            fact('arrival', out);
        });

        // ------------------------------------------------------------------ published: Rule 17's second half and the index side effect (note l)
        if (on('published')) await sect('published', async () => {
            const out = {};
            await visitor();
            // a fresh item placed in "Engineering" read before and after the jobs run
            if (!S.s.PB2) {
                const r = await app.api.createSubmission({tag: `${S.t}pubtwo`, context: S.P.path, submitter: S.P.u.au, title: `K3 pubtwo ${S.t}`, abstract: 'K3 pubtwo abstract.', categories: ['eng'], published: true, ...(isOJS ? {issue: {volume: 1, number: 1, year: 2026}} : {})});
                S.s.PB2 = {id: r.submissionId, pub: r.publicationId}; save();
            }
            await page.goto(catPage(S.P.path, 'eng')); await idle(page);
            out.engBeforeJobs = flat(await page.locator('.page_catalog_category, body').first().innerText().catch(() => ''), 600);
            await snap('u-01-eng-before-jobs', {text: out.engBeforeJobs});
            await page.goto(itemPage(S.P.path, S.s.PB2.id)); await idle(page);
            out.pb2PageBeforeJobs = await page.evaluate(() => [...document.querySelectorAll('a')].filter((a) => /\/category\//.test(a.getAttribute('href') || '')).map((a) => ({text: a.innerText.trim(), href: a.getAttribute('href')})));
            await snap('u-02-pb2-page-before-jobs', {links: out.pb2PageBeforeJobs});
            out.jobs = drainJobs(app);
            for (const [p, key] of [['eng', 'u-03-eng-after-jobs'], ['arts', 'u-04-arts'], ['vision', 'u-05-vision'], ['cs', 'u-06-cs-parent'], ['applied', 'u-07-applied-grandparent']]) {
                await page.goto(catPage(S.P.path, p)); await idle(page);
                out[p] = flat(await page.locator('.page_catalog_category, body').first().innerText().catch(() => ''), 700);
                await snap(key, {text: out[p]});
            }
            await page.goto(itemPage(S.P.path, S.s.PB.id)); await idle(page);
            out.pbPage = {links: await page.evaluate(() => [...document.querySelectorAll('a')].filter((a) => /\/category\//.test(a.getAttribute('href') || '')).map((a) => ({text: a.innerText.trim(), href: a.getAttribute('href')}))),
                block: flat(await page.locator('.item.categories, .categories, .sub_item').filter({hasText: /Categor/}).first().innerText().catch(() => null), 300)};
            await snap('u-08-pb-item-page', out.pbPage);
            fact('published', out);
        });

        // ------------------------------------------------------------------ version: "it belongs to the version shown"
        if (on('version')) await sect('version', async () => {
            const out = {};
            await as(S.P.u.mg, S.P.path);
            await openWorkflow(S.P.path, S.s.PB.id);
            if (!S.v2) {
                const link = wf().getByRole('link', {name: 'Create New Version', exact: true}).or(wf().getByRole('button', {name: 'Create New Version', exact: true})).first();
                await link.waitFor({state: 'visible', timeout: 15000}).catch(() => {});
                out.offered = await link.isVisible().catch(() => false);
                if (out.offered) {
                    await link.click();
                    const w = page.getByRole('dialog').filter({has: page.locator('select[name="versionStage"]')}).last();
                    await w.locator('select[name="versionStage"]').waitFor({state: 'visible', timeout: T}).catch(() => {});
                    await idle(page); await sleep(1200);
                    const stage = w.locator('select[name="versionStage"]');
                    if (await stage.count() && !(await stage.inputValue())) await stage.selectOption('VoR').catch(() => {});
                    const minor = w.locator('select[name="versionIsMinor"]');
                    if (await minor.isVisible().catch(() => false)) { if (!(await minor.inputValue())) await minor.selectOption('false'); }
                    await snap('v-01-create-version-window');
                    const r = page.waitForResponse((x) => /\/publications\/\d+\/version/.test(x.url()) && x.request().method() === 'POST', {timeout: T}).catch(() => null);
                    await w.getByRole('button', {name: 'Confirm', exact: true}).click();
                    const resp = await r;
                    try { S.v2 = (await resp.json()).id; } catch (e) { S.v2 = null; }
                    out.create = resp ? resp.status() : null; save();
                    await idle(page); await sleep(1500);
                }
            }
            out.v2 = S.v2;
            if (S.v2) {
                await openEntry(S.P.path, S.s.PB.id, S.v2);
                out.v2Field = await readField();
                await snap('v-02-v2-entry', {field: out.v2Field, url: page.url()});
                // on the new version: remove "Arts", add "Engineering", Save
                const rm = fieldLoc().getByRole('button', {name: /^Remove Arts/}).first();
                if (await rm.count()) { await rm.click(); await sleep(500); }
                await chooseSuggest('Eng', 'Engineering');
                out.v2Save = await pageSave('v-03');
                await openEntry(S.P.path, S.s.PB.id, S.v2);
                out.v2After = await readField();
                await snap('v-03-v2-saved', {field: out.v2After});
                await openEntry(S.P.path, S.s.PB.id, S.s.PB.pub);
                out.v1After = await readField();
                await snap('v-04-v1-entry', {field: out.v1After, url: page.url()});
                await visitor();
                await page.goto(itemPage(S.P.path, S.s.PB.id)); await idle(page);
                out.itemPage = await page.evaluate(() => [...document.querySelectorAll('a')].filter((a) => /\/category\//.test(a.getAttribute('href') || '')).map((a) => a.innerText.trim()));
                await snap('v-05-item-page-visitor', {links: out.itemPage});
            }
            fact('version', out);
        });

        // ------------------------------------------------------------------ delete: the side effect on D (article page, category page, filter)
        if (on('delete')) await sect('delete', async () => {
            const out = {};
            if (!S.deleted) out.jobs = drainJobs(app);
            const readAll = async (key) => {
                const o = {};
                await visitor();
                await page.goto(itemPage(S.D.path, S.s.DB.id)); await idle(page);
                o.item = await page.evaluate(() => [...document.querySelectorAll('a')].filter((a) => /\/category\//.test(a.getAttribute('href') || '')).map((a) => a.innerText.trim()));
                await snap(`d-${key}-item`, {links: o.item});
                const resp = await page.goto(catPage(S.D.path, 'phys')); await idle(page);
                o.physPage = {status: resp && resp.status(), text: flat(await page.locator('body').innerText().catch(() => ''), 300)};
                await snap(`d-${key}-physics-page`, o.physPage);
                await as(S.D.u.mg, S.D.path);
                await page.goto(cu(S.D.path, '/dashboard/editorial?currentViewId=active')); await idle(page); await sleep(800);
                await openFilters();
                o.filterOptions = (await readField()).present ? await typeSuggest('Phy') : 'no Categories field';
                o.filterField = await readField();
                await page.keyboard.press('Escape').catch(() => {});
                await snap(`d-${key}-filters`, {options: o.filterOptions, field: o.filterField});
                await filtersWin().getByRole('button', {name: 'Close', exact: true}).first().click().catch(() => {});
                await openEntry(S.D.path, S.s.DS.id);
                o.dsField = await readField();
                await snap(`d-${key}-ds-entry`, {field: o.dsField});
                return o;
            };
            if (!S.deleted) out.before = await readAll('01-before');
            if (!S.deleted) {
                await as(S.D.u.mg, S.D.path);
                out.tasksBefore = await tasksCount();
                await page.goto(cu(S.D.path, '/management/settings/context')); await idle(page);
                await page.locator('#categories-button').click(); await idle(page);
                const table = page.locator('#categories table').first();
                await table.waitFor({timeout: T});
                const row = table.locator('tbody tr').filter({has: page.getByRole('cell', {name: 'Science', exact: true})}).first();
                await row.getByRole('button', {name: 'More Actions'}).click();
                await page.getByRole('menuitem', {name: 'Delete Category', exact: true}).click();
                const dlg = page.getByRole('dialog').filter({hasText: /Are you absolutely sure/}).last();
                await dlg.waitFor({timeout: T});
                await dlg.locator('input').first().fill('Science');
                const r = page.waitForResponse((x) => /\/api\/v1\/categories\/\d+/.test(x.url()) && x.request().method() !== 'GET', {timeout: T}).catch(() => null);
                await dlg.getByRole('button', {name: /I understand the consequences/}).click();
                const resp = await r; await sleep(1000);
                out.del = {status: resp ? resp.status() : null, method: resp ? resp.request().method() : null, override: resp ? resp.request().headers()['x-http-method-override'] || null : null};
                out.afterDialog = flat(await page.getByRole('dialog').last().innerText().catch(() => null), 400);
                await snap('d-02-deleted-dialog', out);
                await page.getByRole('button', {name: /Back to Categories|OK|Close/}).last().click().catch(() => {});
                await idle(page); await sleep(800);
                out.tab = flat(await page.locator('#categories table').first().innerText().catch(() => null), 400);
                await page.reload(); await idle(page);
                out.tasksAfter = await tasksCount();
                S.deleted = new Date().toISOString(); save();
            }
            out.after = await readAll('03-after');
            out.mgMail = await inbox(S.D.u.mg);
            out.auMail = await inbox(S.D.u.au);
            fact('delete', out);
        });

        // ------------------------------------------------------------------ control: a mail that must reach D's manager after the delete
        // (the login page's "Forgot your password?" as a visitor), bounding the "no email on delete" read
        if (on('control')) await sect('control', async () => {
            const out = {};
            await visitor();
            await page.goto(cu(S.D.path, '/login/lostPassword')); await idle(page);
            await page.locator('input[name="email"]').first().fill(`${S.D.u.mg}@mail.test`);
            await page.getByRole('button', {name: /^Reset Password$/i}).first().click();
            await idle(page); await sleep(1500);
            await snap('c-01-lost-password-sent');
            try { await app.mail.find({to: `${S.D.u.mg}@mail.test`, timeoutMs: 30_000}); out.controlArrived = true; } catch (e) { out.controlArrived = false; }
            out.mgMail = await inbox(S.D.u.mg);
            out.pMgMail = await inbox(S.P.u.mg);
            fact('control', out);
        });

        // ------------------------------------------------------------------ seeded: publicknowledge, read only
        if (on('seeded')) await sect('seeded', async () => {
            const out = {};
            await as('manager.maya', app.contextPath);
            const w = await editCategory(app.contextPath, 'Applied Science');
            out.boxes = await assignBoxes(w);
            out.group = flat(await w.locator('fieldset, .pkpFormGroup').filter({hasText: 'Editorial Assignments'}).last().innerText().catch(() => null), 1200);
            await snap('k-01-publicknowledge-applied-window', {boxes: out.boxes, group: out.group});
            await w.getByRole('button', {name: 'Close', exact: true}).first().click().catch(() => {});
            await sleep(700);
            // the seeded journal's Settings 1 radios, read only
            await page.goto(cu(app.contextPath, '/management/settings/workflow')); await idle(page);
            await page.locator('#metadata-button').click(); await idle(page); await sleep(600);
            out.radios = await page.locator('input[name="submitWithCategories"]').evaluateAll((els) => els.map((r) => ({value: r.value, checked: r.checked})));
            await snap('k-02-publicknowledge-metadata', {radios: out.radios});
            fact('seeded', out);
        });
        // ------------------------------------------------------------------ eentry: the entry page on a context with no category
        if (on('eentry')) await sect('eentry', async () => {
            await as(S.E.u.mg, S.E.path);
            await openEntry(S.E.path, S.s.ES.id);
            const o = {url: page.url().replace(app.baseURL, ''), field: await readField(), placement: flat(await wf().getByText('Placement', {exact: true}).first().locator('xpath=ancestor::*[contains(@class,"pkpFormGroup")][1]').innerText().catch(() => null), 500)};
            await snap('e-01-E-entry-no-category', o);
            fact('eentry', o);
        });

        // ------------------------------------------------------------------ cross: the Cross-feature pointers a screen can show
        if (on('cross')) await sect('cross', async () => {
            const out = {};
            // the "Category" menu item type {OMP}, with the journal and server as controls (a scratch context with categories)
            await as(S.P.u.mg, S.P.path);
            await page.goto(cu(S.P.path, '/management/settings/website#setup/navigationMenus')); await idle(page);
            await page.locator('table[id^="component-grid-navigationmenus-navigationmenuitemsgrid-"]').first().waitFor({timeout: T});
            await page.getByRole('link', {name: 'Add item', exact: true}).click();
            const iw = page.locator('[role="dialog"]:visible').filter({has: page.locator('form#navigationMenuItemsForm')}).first();
            await iw.locator('select[name="menuItemType"]').waitFor({timeout: T}); await idle(page); await sleep(600);
            out.types = await iw.locator('select[name="menuItemType"] option').allInnerTexts();
            const cat = out.types.find((x) => /Category/.test(x));
            if (cat) {
                await iw.locator('select[name="menuItemType"]').selectOption({label: cat}); await sleep(800);
                out.categoryType = flat(await iw.innerText().catch(() => null), 800);
                out.categoryOptions = await iw.locator('select').filter({hasNot: page.locator('option', {hasText: 'Remote URL'})}).last().locator('option').allInnerTexts().catch(() => null);
            }
            await snap('x-01-add-item-types', out);
            await iw.getByRole('button', {name: 'Cancel'}).or(iw.getByRole('link', {name: 'Cancel'})).first().click().catch(() => {});
            await sleep(700);
            // the site's pages as a visitor: home, archives {OPS}, a book's page {OMP}
            await visitor();
            await page.goto(cu(S.P.path, '')); await idle(page);
            out.homeCategoryLinks = await page.evaluate(() => [...document.querySelectorAll('a')].filter((a) => /\/category\//.test(a.getAttribute('href') || '')).map((a) => a.innerText.trim()));
            await snap('x-02-home-visitor', {links: out.homeCategoryLinks});
            if (isOPS) {
                await page.goto(cu(S.P.path, '/preprints')); await idle(page);
                out.archiveCategoryLinks = await page.evaluate(() => [...document.querySelectorAll('a')].filter((a) => /\/category\//.test(a.getAttribute('href') || '')).map((a) => a.innerText.trim()));
                await snap('x-03-archives-visitor', {links: out.archiveCategoryLinks});
            }
            if (isOMP) {
                await page.goto(cu(app.contextPath, '/catalog/category/applied-science')); await idle(page);
                out.pkCategoryPage = flat(await page.locator('.page_catalog_category, body').first().innerText().catch(() => ''), 900);
                await snap('x-04-publicknowledge-category-visitor', {text: out.pkCategoryPage});
            }
            fact('cross', out);
        });
        // ------------------------------------------------------------------ noend: Settings 1 back to "No" on screen, N's draft walked again
        if (on('noend')) await sect('noend', async () => {
            const out = {};
            await as(S.N.u.mg, S.N.path);
            await page.goto(cu(S.N.path, '/management/settings/workflow')); await idle(page);
            await page.locator('#metadata-button').click(); await idle(page); await sleep(600);
            await page.locator('input[name="submitWithCategories"][value="false"]').check();
            const form = page.locator('form').filter({has: page.locator('input[name="submitWithCategories"]')}).first();
            const w = page.waitForResponse((x) => /\/api\/v1\/contexts\/\d+$/.test(x.url()) && x.request().method() !== 'GET', {timeout: T}).catch(() => null);
            await form.getByRole('button', {name: 'Save', exact: true}).click();
            const r = await w; await idle(page); await sleep(800);
            out.saveNo = r ? r.status() : null;
            out.radios = await page.locator('input[name="submitWithCategories"]').evaluateAll((els) => els.map((x) => ({value: x.value, checked: x.checked})));
            await snap('n-01-N-metadata-saved-no', out);
            S.N.askedOnScreen = false; save();
            await as(S.N.u.au, S.N.path);
            await wizardTo(S.N.path, S.s.ND.id, null);
            out.field = await readField();
            out.step = flat(await currentStep().first().innerText().catch(() => null), 60);
            await snap('n-02-N-wizard-not-asked', {field: out.field, step: out.step});
            fact('noend', out);
        });
    } finally {
        record('k3-dialogs', {jsDialogs}, {merge: true});
        await close();
    }
});
