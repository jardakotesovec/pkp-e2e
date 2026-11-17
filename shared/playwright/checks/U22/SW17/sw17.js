// U22 claim check, chunk SW17 (drift sweep 2026-11-17, housekeeping): the whole spec
// docs/specs/U22-my-submissions.md, driven on the screens for the lines the kept checks
// I28 (landing of a Site Administrator, Rule 7c, Rule 10, section filters), C22 (Reader-level
// landings, A7) and H19 (draft deletion, A8) do not settle.
//
//   PROBE_FEATURE=U22 PROBE_AGENT=ccSW17 PROBE_RUN=r1 PROBE_NOTES_FEATURE=U22 \
//     bin/app-lock.sh shared <app> -- node bin/probe.js <ojs|omp|ops|all> shared/playwright/checks/U22/SW17/sw17.js
//
// PROBE_RUN (r1, r2) names every record, shot and the state file (outFile('sw17-state.json')),
// so two runs sit side by side; each run seeds its own scratch contexts (tag prefix u22sw17).
// PART= narrows to a comma list of: seed, author, view, roles, open, publish, paging, logs, leak,
// draftlink, groups, sched (sched: the author's Scheduled view alone, after publish) (default all;
// the later parts read the state file the seed part wrote; RESEED=1 seeds again).
// No other script is needed. No assertions: the script records, the reader judges.
// Facts: sw17-facts-<run>-<app>.json; snapshots s-<part>-<step>-<run>-<app>.json.
//
// Seed, per app and run (scratch journal A, the second journal B, the helper H, the open-review
// journal O {OJS OMP}, the paging journal P):
//   A users: au (Author), a2 (Author), co (Author, assigned as author on au's "Coauth"),
//     ma (Manager+Author), sa (Section Editor+Author), ar (Author+Reviewer) {OJS OMP},
//     sr (Section Editor+Reviewer) {OJS OMP}, ac (Author+Copyeditor; OPS Author+Editorial Board
//     Member), mg (Manager), se (Section Editor), rv (Reviewer) {OJS OMP}, as (Copyeditor; OPS
//     Editorial Board Member), rd (Reader), r1 r2 r3 (Reviewers) {OJS OMP}, ir (Internal Reviewer) {OMP}.
//     OJS: issues Vol. 1 No. 1 (2025) published and Vol. 2 No. 1 (2026) unpublished.
//   au's submissions on A: DraftA, DraftB (drafts), Queued (Submission stage), Coauth (co as
//     author), DeskDecl (declined at the Submission stage), PubA, PubB (published), Sched {OJS}
//     (published into the unpublished issue), Copyed, Revise (revisions requested), Resub
//     (resubmit for review), Underrev (accepted + completed + declined reviewers), RevDecl
//     (declined in review) {OJS OMP}, IntRev (internal revisions requested) {OMP}, Prod (at
//     Production, unpublished; the publish part saves a future date on its entry page and publishes
//     it: U49 Rule 6) {OMP OPS}. a2: Other. ma: MgSub, MgDraft.
//   B: au enrolled as Author with ElseWhere. H: nr (Reader in H only: no role in A).
//   O {OJS OMP}: open review mode; oa's OpenConf (reviewer completed, oe the editor confirms it on
//     screen) and OpenUnconf (reviewer completed, never confirmed).
//   P: pa's PgDraft (a draft, seeded first) and 31 submitted Pg<n>.
'use strict';

const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, screen, shot, record, loc, note, idle, tag, outFile} = require('../../../probe');

const REPO = path.resolve(__dirname, '../../../../..');
const T = 30_000;
const RUN = process.env.PROBE_RUN || 'r0';
const PARTS = (process.env.PART || 'seed,author,view,roles,open,publish,paging,logs,leak,draftlink,groups').split(',');
const on = (p) => PARTS.includes(p);
const T0 = Date.now();
const log = (...a) => console.log(`[sw17 ${RUN} +${Math.round((Date.now() - T0) / 1000)}s]`, ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (s, n = 1500) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));
const strip = (u) => (u || '').replace(/^https?:\/\/127\.0\.0\.1:\d+/, '').replace(/csrfToken=[^&]+/, '');

forEachApp(async (app) => {
    const isOJS = app.name === 'ojs', isOMP = app.name === 'omp', isOPS = app.name === 'ops';
    const review = !isOPS;
    const statePath = outFile('sw17-state.json');
    const S = fs.existsSync(statePath) && process.env.RESEED !== '1' ? JSON.parse(fs.readFileSync(statePath, 'utf8')) : {};
    const save = () => fs.writeFileSync(statePath, JSON.stringify(S, null, 1));
    const fact = (k, v) => { record('sw17-facts', {[k]: v}, {merge: true}); log(`[${app.name} ${k}]`, JSON.stringify(v).slice(0, 1500)); };
    const cu = (ctx, p = '') => app.url(`/index.php/${ctx}${p}`);

    await app.api.bootstrapProbe(app.contextPath);

    // ------------------------------------------------------------------ one browser = one person
    async function person(label) {
        const b = await launch(app);
        const P = {label, page: b.page, close: b.close, traffic: [], errors: [], dialogs: []};
        P.page.on('dialog', (d) => { P.dialogs.push({at: Date.now(), type: d.type(), message: flat(d.message(), 300), url: strip(P.page.url())}); d.accept().catch(() => {}); });
        P.page.context().on('response', (r) => {
            const url = r.url();
            if (r.status() >= 400 || /\/api\/v1\/|\$\$\$call\$\$\$/.test(url)) P.traffic.push({at: Date.now(), m: r.request().method(), s: r.status(), u: strip(url).replace(/^\/index\.php\//, '')});
        });
        P.page.on('pageerror', (e) => P.errors.push({at: Date.now(), msg: flat(e.message, 300)}));
        P.since = (t0) => P.traffic.filter((x) => x.at >= t0 && !/_i18n/.test(x.u)).map((x) => `${x.m} ${x.s} ${x.u.slice(0, 200)}`);
        P.bad = (t0 = 0) => P.traffic.filter((x) => x.at >= t0 && x.s >= 400).map((x) => `${x.m} ${x.s} ${x.u.slice(0, 200)}`);
        P.errs = (t0 = 0) => P.errors.filter((e) => e.at >= t0).map((e) => e.msg);
        P.dlg = (t0 = 0) => P.dialogs.filter((e) => e.at >= t0).map((e) => `${e.type}: ${e.message}`);
        P.as = async (user, ctx) => {
            const docs = [];
            const h = (r) => { if (r.request().resourceType() === 'document' && r.request().frame() === P.page.mainFrame()) docs.push(`${r.request().method()} ${r.status()} ${strip(r.url()).split('?')[0]}`); };
            P.page.on('response', h);
            await signIn(P.page, user, ctx ? {contextPath: ctx} : {});
            await idle(P.page).catch(() => {});
            P.page.off('response', h);
            return docs;
        };
        P.go = async (url) => {
            const r = await P.page.goto(url).catch((e) => ({err: String(e.message).slice(0, 200)}));
            await idle(P.page).catch(() => {});
            return r && typeof r.status === 'function' ? r.status() : (r && r.err) || null;
        };
        P.snap = async (name, extra = {}, {png = false} = {}) => {
            let s;
            try { s = await screen(P.page); } catch (e) { s = {url: P.page.url(), error: String(e.message).slice(0, 200)}; }
            Object.assign(s, extra);
            record(`s-${name}`, s);
            if (png) await shot(P.page, `s-${name}`).catch(() => {});
            return s;
        };
        return P;
    }
    async function sect(name, fn) {
        log(`== ${name}`);
        try { return await fn(); } catch (e) {
            log(`[${name} FAILED]`, String(e.stack || e).split('\n').slice(0, 4).join(' | '));
            fact(`${name}.FAILED`, String(e.message || e).slice(0, 600));
            return null;
        }
    }

    // ------------------------------------------------------------------ list readers (CSS: role reads miss rows behind a dialog)
    async function readList(page) {
        // a list still fetching shows one "Loading" row: read it settled
        await page.waitForFunction(() => ![...document.querySelectorAll('main table tbody tr')].some((tr) => /^\s*Loading/.test(tr.innerText)), null, {timeout: 15_000}).catch(() => {});
        return page.evaluate(() => {
            const t = (s) => (s || '').replace(/\s+/g, ' ').trim();
            const main = document.querySelector('main') || document.body;
            const table = [...main.querySelectorAll('table')].find((x) => !x.closest('[role=dialog]'));
            const head = table ? [...table.querySelectorAll('thead th')].map((th) => t(th.innerText)) : null;
            const rows = table ? [...table.querySelectorAll('tbody tr')].map((tr) => ({
                cells: [...tr.children].map((td) => t(td.innerText).slice(0, 200)),
                buttons: [...tr.querySelectorAll('button, a')].map((b) => t(b.innerText || b.getAttribute('aria-label'))).filter(Boolean),
                checkbox: !!tr.querySelector('input[type=checkbox]'),
                checked: !!tr.querySelector('input[type=checkbox]:checked'),
            })) : [];
            const nav = document.querySelector('#app-nav');
            const navLinks = nav ? [...nav.querySelectorAll('a')].map((a) => ({text: t(a.innerText), href: (a.getAttribute('href') || '').replace(/^https?:\/\/[^/]+/, ''), current: a.getAttribute('aria-current')})) : null;
            const dlg = [...document.querySelectorAll('[role=dialog]')].filter((d) => d.getClientRects().length);
            const above = t((main.querySelector('.pkpTable__header, .dashboardTable__controls, [class*=Controls]') || {}).innerText || '');
            return {url: location.pathname + location.search, h1: t((main.querySelector('h1') || {}).innerText), head, rows,
                navLinks, dialogOpen: dlg.length, dialogHead: dlg.length ? t(dlg[dlg.length - 1].innerText).slice(0, 300) : null,
                pagination: t((main.querySelector('nav[aria-label*=agination], .pkpPagination, [class*=agination]') || {}).innerText || '').slice(0, 200),
                above: above.slice(0, 300)};
        });
    }
    const rowOf = (list, title) => (list.rows || []).find((r) => r.cells.join(' ').includes(title)) || null;
    const navOf = (list) => (list.navLinks || []).map((l) => l.text);
    const viewLink = (page, name) => page.locator('#app-nav a').filter({has: page.getByText(name, {exact: true})});
    async function openView(page, name) {
        const link = viewLink(page, name).first();
        if (!(await link.isVisible().catch(() => false))) {
            await page.locator('#app-nav a').filter({has: page.getByText('My Submissions as Author', {exact: true})}).first().click().catch(() => {});
            await sleep(300);
        }
        await link.click({timeout: 15_000});
        await page.waitForURL((u) => true, {timeout: 2000}).catch(() => {});
        await idle(page).catch(() => {});
        await sleep(700);
    }
    const rowLoc = (page, title) => page.locator('main table tbody tr').filter({hasText: title}).first();
    async function search(page, phrase) {
        const box = page.getByRole('searchbox', {name: /Search submissions, ID/}).first();
        await box.click({timeout: 15_000});
        await box.fill('');
        if (phrase) await box.pressSequentially(phrase, {delay: 20});
        await box.press('Enter');
        await idle(page).catch(() => {});
        await sleep(800);
    }
    const filtersWin = (page) => page.getByRole('dialog').filter({has: page.getByRole('button', {name: 'Apply Filters', exact: true})}).last();
    async function readFilters(page) {
        const btn = page.locator('main').first().getByRole('button', {name: 'Filters', exact: true}).first();
        if (!(await btn.count())) return null;
        await btn.click();
        await filtersWin(page).getByRole('button', {name: 'Apply Filters', exact: true}).waitFor({timeout: T});
        await idle(page).catch(() => {}); await sleep(600);
        const f = await filtersWin(page).evaluate((d) => {
            const t = (s) => (s || '').replace(/\s+/g, ' ').trim();
            const vis = (e) => e.getClientRects().length > 0;
            return {labels: [...d.querySelectorAll('legend, .pkpFormFieldLabel')].filter(vis).map((x) => t(x.innerText)),
                buttons: [...d.querySelectorAll('button')].filter(vis).map((b) => t(b.innerText || b.getAttribute('aria-label'))).filter(Boolean),
                options: [...d.querySelectorAll('input[type=checkbox]')].filter(vis).map((b) => t((b.closest('label') || b.parentElement).innerText))};
        });
        await filtersWin(page).getByRole('button', {name: 'Close', exact: true}).first().click().catch(() => {});
        await sleep(700);
        return f;
    }
    const openDialog = (page) => page.locator('[role=dialog]:visible').last();
    async function dialogInfo(page) {
        return page.evaluate(() => {
            const t = (s) => (s || '').replace(/\s+/g, ' ').trim();
            const dlg = [...document.querySelectorAll('[role=dialog]')].filter((d) => d.getClientRects().length);
            return dlg.map((d) => ({heads: [...d.querySelectorAll('h1,h2,h3')].map((h) => t(h.innerText)).filter(Boolean).slice(0, 6),
                tabs: [...d.querySelectorAll('[role=tab]')].map((x) => t(x.innerText)), text: t(d.innerText).slice(0, 600)}));
        });
    }
    async function closeWorkflowPanel(page) {
        const d = page.getByRole('dialog').filter({has: page.getByRole('heading', {name: /^(Workflow|Preprint|Publication):?/})}).first();
        const btn = (await d.count()) ? d.getByRole('button', {name: 'Close', exact: true}).first() : page.getByRole('dialog').first().getByRole('button', {name: 'Close', exact: true}).first();
        await btn.click({timeout: 15_000});
        await page.waitForFunction(() => ![...document.querySelectorAll('[role=dialog]')].some((x) => x.getClientRects().length), null, {timeout: 15_000}).catch(() => {});
        await idle(page).catch(() => {}); await sleep(800);
    }
    async function menuItemState(page) {
        await page.getByRole('button', {name: 'More Actions', exact: true}).first().click({timeout: 15_000});
        const item = page.getByRole('menuitem', {name: 'Delete Incomplete Submissions'}).first();
        await item.waitFor({timeout: 15_000});
        const st = {disabled: await item.getAttribute('data-disabled'), ariaDisabled: await item.getAttribute('aria-disabled'),
            items: await page.locator('[data-reka-menu-content][role="menu"] [role=menuitem]').evaluateAll((els) => els.map((e) => e.innerText.replace(/\s+/g, ' ').trim()))};
        return {st, item};
    }
    async function closeMenu(page) {
        const menu = page.locator('[data-reka-menu-content][role="menu"]');
        if (await menu.count()) { await menu.press('Escape').catch(() => {}); await sleep(400); }
    }
    async function enterSelection(page) {
        const {st, item} = await menuItemState(page);
        if (st.disabled !== null || st.ariaDisabled === 'true') { await closeMenu(page); return {st, entered: false}; }
        await item.click();
        await page.getByRole('button', {name: 'Delete Incomplete Submissions', exact: true}).first().waitFor({timeout: 15_000});
        await sleep(400);
        return {st, entered: true};
    }
    async function selectionState(page) {
        const btn = page.getByRole('button', {name: 'Delete Incomplete Submissions', exact: true}).first();
        const n = await btn.count();
        return {mode: n > 0, deleteDisabled: n ? await btn.isDisabled() : null,
            controls: n ? await btn.locator('xpath=..').innerText().then((x) => flat(x, 200)).catch(() => null) : null};
    }
    async function tick(page, title) { await rowLoc(page, title).getByRole('checkbox').check({force: true, timeout: 10_000}); await sleep(300); }
    const mailCount = async (to) => app.mail.count({to}).catch((e) => `err ${String(e.message).slice(0, 80)}`);

    // wizard adapter (the app's own page objects, required inside fn: patterns "The app bag")
    function wizard(page, ctx) {
        const dir = path.join(REPO, 'apps', app.name, 'playwright/pages');
        if (isOJS) {
            const {SubmissionWizardPage} = require(path.join(dir, 'SubmissionWizardPage.js'));
            const w = new SubmissionWizardPage(page, ctx);
            return {open: (id) => w.goto(id), continueTo: (l) => w.continueTo(l), save: () => w.saveForLater()};
        }
        const W = require(path.join(dir, 'SubmissionWizardPages.js'));
        return {open: async (id) => { await page.goto(app.url(W.wizardUrl(ctx, id))); await W.expectWizardOpen(page); },
            continueTo: (l) => W.continueTo(page, l), save: () => W.saveForLater(page)};
    }
    const currentStep = (page) => page.locator('.pkpSteps__step__label--current').first().innerText().then((x) => flat(x, 80)).catch(() => null);

    // ================================================================== seed
    if (on('seed') && !S.A) await sect('seed', async () => {
        const t = tag('u22sw17');
        const U = (k) => `${t}${k}`;
        const u = (k, roles, g, f) => ({username: U(k), roles, givenName: g, familyName: f});
        const users = [
            u('au', ['author'], 'Ada', 'Author'), u('a2', ['author'], 'Bob', 'Second'), u('co', ['author'], 'Cy', 'Coauthor'),
            u('ma', ['manager', 'author'], 'Mia', 'Managerauthor'), u('sa', ['sectionEditor', 'author'], 'Sam', 'Seauthor'),
            u('ac', ['author', isOPS ? 'editorialBoardMember' : 'copyeditor'], 'Ace', 'Authorassistant'),
            u('mg', ['manager'], 'Max', 'Manager'), u('se', ['sectionEditor'], 'Sol', 'Sectioneditor'),
            u('as', [isOPS ? 'editorialBoardMember' : 'copyeditor'], 'Asa', 'Assistant'), u('rd', ['reader'], 'Rea', 'Reader'),
        ];
        if (review) users.push(u('ar', ['author', 'externalReviewer'], 'Ari', 'Authorreviewer'), u('sr', ['sectionEditor', 'externalReviewer'], 'Sue', 'Editorreviewer'),
            u('rv', ['externalReviewer'], 'Rex', 'Reviewer'), u('r1', ['externalReviewer'], 'Rae', 'One'), u('r2', ['externalReviewer'], 'Ray', 'Two'), u('r3', ['externalReviewer'], 'Roy', 'Three'));
        if (isOMP) users.push(u('ir', ['internalReviewer'], 'Ira', 'Internal'));
        const ctxSpec = {tag: t, context: {name: `U22 SW17 ${t}`, acronym: 'U22SW', contactName: 'SW17 Contact', contactEmail: `${t}c@mail.test`}, users};
        if (isOJS) ctxSpec.issues = [{volume: 1, number: 1, year: 2025, published: true}, {volume: 2, number: 1, year: 2026}];
        await app.api.createContext(ctxSpec);
        S.t = t; S.A = t; S.subs = {}; S.errors = {};
        const sub = async (key, spec) => {
            try { const r = await app.api.createSubmission({tag: `${t}${key.toLowerCase()}`.slice(0, 32), context: t, title: `${key} ${t}`, ...spec}); S.subs[key] = r.submissionId; }
            catch (e) { S.errors[key] = String(e.message).slice(0, 400); }
            save();
        };
        const toProd = ['skipExternalReview', 'sendToProduction'];
        await sub('DraftA', {submitter: U('au'), submitted: false});
        await sub('DraftB', {submitter: U('au'), submitted: false});
        await sub('Queued', {submitter: U('au')});
        await sub('Coauth', {submitter: U('au'), participants: [{username: U('co'), role: 'author'}]});
        await sub('DeskDecl', {submitter: U('au'), decisions: [isOPS ? 'decline' : 'initialDecline']});
        if (isOPS && S.errors.DeskDecl) await sub('DeskDecl', {submitter: U('au'), decisions: ['initialDecline']});
        await sub('PubA', {submitter: U('au'), ...(isOPS ? {} : {decisions: toProd}), published: true, ...(isOJS ? {issue: {volume: 1, number: 1, year: 2025}} : {})});
        await sub('PubB', {submitter: U('au'), ...(isOPS ? {} : {decisions: toProd}), published: true, ...(isOJS ? {issue: {volume: 1, number: 1, year: 2025}} : {})});
        if (isOJS) await sub('Sched', {submitter: U('au'), decisions: toProd, published: true, issue: {volume: 2, number: 1, year: 2026}});
        if (review) {
            await sub('Copyed', {submitter: U('au'), decisions: ['skipExternalReview']});
            await sub('Revise', {submitter: U('au'), decisions: ['sendExternalReview', 'requestRevisions'], reviewRounds: [{reviewers: [{username: U('r1'), status: 'accepted'}]}]});
            await sub('Resub', {submitter: U('au'), decisions: ['sendExternalReview', 'resubmit'], reviewRounds: [{reviewers: [{username: U('r1'), status: 'accepted'}]}]});
            await sub('Underrev', {submitter: U('au'), decisions: ['sendExternalReview'], reviewRounds: [{reviewers: [{username: U('r1'), status: 'accepted'}, {username: U('r2'), status: 'completed'}, {username: U('r3'), status: 'declined'}]}]});
            await sub('RevDecl', {submitter: U('au'), decisions: ['sendExternalReview', 'decline'], reviewRounds: [{reviewers: [{username: U('r1'), status: 'accepted'}, {username: U('r2'), status: 'accepted'}]}]});
        }
        if (isOMP) await sub('IntRev', {submitter: U('au'), decisions: ['sendInternalReview', 'requestRevisionsInternal'], reviewRounds: [{stage: 'internal', reviewers: [{username: U('ir'), status: 'accepted'}]}]});
        if (!isOJS) await sub('Prod', {submitter: U('au'), ...(isOMP ? {decisions: toProd} : {})});
        await sub('Other', {submitter: U('a2')});
        await sub('MgSub', {submitter: U('ma')});
        await sub('MgDraft', {submitter: U('ma'), submitted: false});
        // B: the same author on a second journal
        S.B = `${t}b`;
        await app.api.createContext({tag: S.B, context: {name: `U22 SW17 B ${t}`, acronym: 'U22SWB', contactName: 'SW17 Contact', contactEmail: `${t}c@mail.test`}, users: [{username: U('au'), roles: ['author']}]});
        try { S.subs.ElseWhere = (await app.api.createSubmission({tag: `${t}else`, context: S.B, submitter: U('au'), title: `ElseWhere ${t}`})).submissionId; } catch (e) { S.errors.ElseWhere = String(e.message).slice(0, 300); }
        // H: an account with no role in A
        S.H = `${t}h`;
        await app.api.createContext({tag: S.H, users: [u('nr', ['reader'], 'Nor', 'Ole')]});
        // O: open review
        if (review) {
            S.O = `${t}o`;
            await app.api.createContext({tag: S.O, review: {defaultReviewMode: 'open'}, users: [u('oa', ['author'], 'Ola', 'Author'), u('ov', ['externalReviewer'], 'Olga', 'Openreviewer'), u('ow', ['externalReviewer'], 'Otto', 'Secondreviewer'), u('oe', ['editor'], 'Oren', 'Editor')]});
            for (const [key, rev] of [['OpenConf', 'ov'], ['OpenUnconf', 'ow']]) {
                try { S.subs[key] = (await app.api.createSubmission({tag: `${t}${key.toLowerCase()}`, context: S.O, submitter: U('oa'), title: `${key} ${t}`, decisions: ['sendExternalReview'], reviewRounds: [{reviewers: [{username: U(rev), status: 'completed'}]}], participants: [{username: U('oe'), role: 'editor'}]})).submissionId; }
                catch (e) { S.errors[key] = String(e.message).slice(0, 300); }
            }
        }
        // P: paging
        S.P = `${t}p`;
        await app.api.createContext({tag: S.P, users: [u('pa', ['author'], 'Pia', 'Pager')]});
        try { S.subs.PgDraft = (await app.api.createSubmission({tag: `${t}pgd`, context: S.P, submitter: U('pa'), title: `PgDraft ${t}`, submitted: false})).submissionId; } catch (e) { S.errors.PgDraft = String(e.message).slice(0, 300); }
        for (let i = 1; i <= 31; i++) {
            try { await app.api.createSubmission({tag: `${t}pg${i}`, context: S.P, submitter: U('pa'), title: `Pg${i} ${t}`}); } catch (e) { S.errors[`Pg${i}`] = String(e.message).slice(0, 200); }
        }
        save();
        fact('seed', {t, subs: S.subs, errors: S.errors});
    });
    if (!S.A) { log('no state: run PART=seed first'); return; }
    const t = S.t, A = S.A, U = (k) => `${t}${k}`, TT = (k) => `${k} ${t}`;

    // ================================================================== author (au on A)
    if (on('author')) await sect('author', async () => {
        const P = await person('au');
        const F = {};
        const mailTo = `${U('au')}@mail.test`;
        F.mailBefore = await mailCount(mailTo);
        try {
            F.signInDocs = await P.as(U('au'), A);
            F.landing = await readList(P.page);
            await P.snap('author-01-landing', {}, {png: true});
            await loc(P.page, 'My Submissions sidebar group', P.page.locator('#app-nav a').filter({has: P.page.getByText('My Submissions as Author', {exact: true})}));
            await loc(P.page, 'Start A New Submission', P.page.locator('#app-nav').getByRole('link', {name: 'Start A New Submission', exact: true}));
            // every view of the sidebar (Rules 1, 2, 4, 7)
            const names = (F.landing.navLinks || []).map((l) => l.text.replace(/^\d+\s*/, '')).filter((x) => x && !/My Submissions as Author|Start A New Submission/.test(x));
            F.views = {};
            for (const n of names) {
                try {
                    await openView(P.page, n);
                    const l = await readList(P.page);
                    F.views[n] = {url: l.url, h1: l.h1, head: l.head, rows: l.rows.map((r) => ({cells: r.cells, buttons: r.buttons})), badge: (l.navLinks.find((x) => x.text.endsWith(n)) || {}).text};
                    await P.snap(`author-02-view-${n.replace(/\W+/g, '-')}`);
                } catch (e) { F.views[n] = {err: String(e.message).slice(0, 200)}; }
            }
            // the view address survives a reload
            await openView(P.page, 'Published');
            await P.page.reload(); await idle(P.page); await sleep(800);
            F.reloadPublished = await readList(P.page).then((l) => ({url: l.url, h1: l.h1}));
            // search (Rule 5)
            const ts = Date.now();
            await search(P.page, TT('PubA'));
            F.searchPubA = await readList(P.page).then((l) => ({url: l.url, h1: l.h1, rows: l.rows.map((r) => r.cells.join(' | '))}));
            await P.snap('author-03-search-published');
            await search(P.page, '');
            F.searchCleared = await readList(P.page).then((l) => ({url: l.url, h1: l.h1, n: l.rows.length}));
            await openView(P.page, 'Active submissions');
            await search(P.page, TT('Other'));
            F.searchOther = await readList(P.page).then((l) => ({h1: l.h1, rows: l.rows.map((r) => r.cells.join(' | '))}));
            await search(P.page, TT('PubA'));
            F.searchPubAOnActive = await readList(P.page).then((l) => ({h1: l.h1, rows: l.rows.map((r) => r.cells.join(' | '))}));
            await search(P.page, TT('ElseWhere'));
            F.searchElseWhere = await readList(P.page).then((l) => ({h1: l.h1, rows: l.rows.map((r) => r.cells.join(' | '))}));
            await search(P.page, '');
            F.searchTraffic = P.since(ts).filter((x) => /_submissions/.test(x)).slice(0, 12);
            // Filters (Rule 5)
            F.filters = await readFilters(P.page);
            await P.snap('author-04-after-filters');
            // View (Rule 8)
            const before = strip(P.page.url());
            await rowLoc(P.page, TT('Queued')).getByRole('button', {name: 'View', exact: true}).click({timeout: 15_000});
            await P.page.getByRole('dialog').first().waitFor({timeout: T}); await idle(P.page); await sleep(1000);
            F.view = {before, after: strip(P.page.url()), dialogs: await dialogInfo(P.page)};
            await P.snap('author-05-view-panel', {}, {png: true});
            // a menu entry of the panel moves the address
            const menuBtns = await P.page.getByRole('dialog').first().locator('nav button, nav a, [role=menuitem]').evaluateAll((els) => els.map((e) => e.innerText.replace(/\s+/g, ' ').trim()).filter(Boolean)).catch(() => []);
            F.view.panelMenu = menuBtns.slice(0, 20);
            const alt = menuBtns.find((x) => /^(Title & Abstract|Contributors|Metadata)$/.test(x));
            if (alt) {
                const entry = P.page.getByRole('dialog').first().getByRole('button', {name: alt, exact: true}).or(P.page.getByRole('dialog').first().getByRole('link', {name: alt, exact: true})).first();
                await entry.click().catch(() => {});
                await idle(P.page); await sleep(800);
                F.view.afterMenu = {pressed: alt, url: strip(P.page.url())};
                const bookmark = P.page.url();
                await closeWorkflowPanel(P.page);
                F.view.afterClose = strip(P.page.url());
                await P.go(bookmark);
                await sleep(800);
                F.view.bookmark = {url: strip(P.page.url()), dialogs: await dialogInfo(P.page)};
                await P.snap('author-06-bookmark-reopened');
                await closeWorkflowPanel(P.page);
                F.view.afterClose2 = strip(P.page.url());
            } else {
                await closeWorkflowPanel(P.page);
                F.view.afterClose = strip(P.page.url());
            }
            F.view.list = await readList(P.page).then((l) => ({h1: l.h1, dialogOpen: l.dialogOpen}));
            // old author-dashboard links (Rule 3, A5)
            for (const k of ['Queued', 'DraftB']) {
                const t1 = Date.now();
                await P.go(cu(A, `/authorDashboard/submission/${S.subs[k]}`));
                await sleep(1200);
                F[`oldLink${k}`] = {url: strip(P.page.url()), dialogs: await dialogInfo(P.page), bad: P.bad(t1), errors: P.errs(t1)};
                await P.snap(`author-07-oldlink-${k}`, {}, {png: true});
                if (F[`oldLink${k}`].dialogs.length) { await closeWorkflowPanel(P.page).catch(() => {}); F[`oldLink${k}`].afterClose = strip(P.page.url()); }
            }
            // Complete submission (Rule 6): DraftA saved at Details; DraftB continued to Contributors, not saved
            const W = wizard(P.page, A);
            await W.open(S.subs.DraftA); F.draftAOpenedAt = await currentStep(P.page);
            await W.continueTo('Details'); await W.save();
            await P.snap('author-08-draftA-saved-for-later');
            await W.open(S.subs.DraftB); F.draftBOpenedAt = await currentStep(P.page);
            await W.continueTo('Details'); await W.continueTo('Contributors');
            F.draftBContinuedTo = await currentStep(P.page);
            await P.go(cu(A, '/dashboard/mySubmissions'));
            F.leaveWizardDialogs = P.dlg(0);
            if (!isOPS) await openView(P.page, 'Incomplete submissions');
            F.draftRows = await readList(P.page).then((l) => ({h1: l.h1, rows: l.rows.filter((r) => /Draft[AB]/.test(r.cells.join(' '))).map((r) => ({cells: r.cells, buttons: r.buttons}))}));
            for (const k of ['DraftA', 'DraftB']) {
                if (!isOPS) await openView(P.page, 'Incomplete submissions');
                await rowLoc(P.page, TT(k)).getByRole('button', {name: 'Complete submission', exact: true}).click({timeout: 15_000});
                await P.page.waitForURL(/\/submission/, {timeout: T}).catch(() => {});
                await idle(P.page); await sleep(1200);
                F[`complete${k}`] = {url: strip(P.page.url()), step: await currentStep(P.page)};
                await P.snap(`author-09-complete-${k}`);
                if (k === 'DraftB') S.draftBWizard = P.page.url();
                await P.go(cu(A, '/dashboard/mySubmissions'));
            }
            save();
            // Start A New Submission (Rule 1)
            await P.page.locator('#app-nav').getByRole('link', {name: 'Start A New Submission', exact: true}).click({timeout: 15_000});
            await idle(P.page); await sleep(800);
            F.startNew = {url: strip(P.page.url()), h1: flat(await P.page.locator('h1').first().innerText().catch(() => ''), 100)};
            await P.snap('author-10-start-new');
            await P.go(cu(A, '/dashboard/mySubmissions'));
            // Submit revisions (Rule 7a, 10)
            if (review) {
                for (const k of isOMP ? ['Revise', 'IntRev'] : ['Revise']) {
                    await openView(P.page, 'Revisions requested');
                    const pre = await readList(P.page);
                    F[`rev${k}Before`] = {h1: pre.h1, nav: navOf(pre), row: rowOf(pre, TT(k)), resub: rowOf(pre, TT('Resub'))};
                    const t1 = Date.now();
                    await rowLoc(P.page, TT(k)).getByRole('button', {name: 'Submit revisions', exact: true}).click({timeout: 15_000});
                    const dlg = P.page.getByRole('dialog').filter({has: P.page.getByRole('tab', {name: '1. Upload File'})}).last();
                    await dlg.getByRole('tab', {name: '1. Upload File'}).waitFor({timeout: T}); await idle(P.page); await sleep(800);
                    F[`rev${k}Dialog`] = {info: await dialogInfo(P.page), url: strip(P.page.url())};
                    await P.snap(`author-11-revisions-dialog-${k}`, {}, {png: true});
                    const genre = dlg.locator('select[id^="genreId"]');
                    if (await genre.count()) {
                        const opts = await genre.locator('option').evaluateAll((os) => os.map((o) => ({v: o.value, l: o.innerText.trim()})));
                        F[`rev${k}Genres`] = opts.map((o) => o.l);
                        const pick = opts.find((o) => o.v && /Article Text|Book Manuscript|Preprint/.test(o.l)) || opts.find((o) => o.v);
                        if (pick) await genre.selectOption(pick.v);
                    }
                    const input = (await dlg.locator('input[type=file]').count()) ? dlg.locator('input[type=file]').first() : P.page.locator('input[type=file]').last();
                    await input.setInputFiles({name: `rev${k.toLowerCase()}${t}.txt`, mimeType: 'text/plain', buffer: Buffer.from(`Revision ${k} ${t}`)});
                    await dlg.getByRole('button', {name: 'Continue', exact: true}).waitFor({timeout: T});
                    await sleep(1500);
                    await dlg.getByRole('button', {name: 'Continue', exact: true}).click();
                    await dlg.getByRole('tab', {name: '2. Review Details'}).and(P.page.locator('[aria-selected=true]')).waitFor({timeout: T}).catch(() => {});
                    await sleep(800);
                    await dlg.getByRole('button', {name: 'Continue', exact: true}).click();
                    await dlg.getByRole('tab', {name: '3. Confirm'}).and(P.page.locator('[aria-selected=true]')).waitFor({timeout: T}).catch(() => {});
                    await sleep(800);
                    F[`rev${k}Confirm`] = await dialogInfo(P.page);
                    await dlg.getByRole('button', {name: 'Complete', exact: true}).click();
                    await dlg.waitFor({state: 'detached', timeout: T}).catch(() => {});
                    await idle(P.page); await sleep(1500);
                    const same = await readList(P.page);
                    F[`rev${k}After`] = {h1: same.h1, url: same.url, nav: navOf(same), row: rowOf(same, TT(k)), traffic: P.since(t1).filter((x) => !/\$\$\$call\$\$\$.*fetch/.test(x)).slice(0, 25), bad: P.bad(t1), errors: P.errs(t1), dialogs: P.dlg(t1)};
                    await P.snap(`author-12-after-revisions-${k}`);
                    await openView(P.page, 'Revisions submitted');
                    const sub = await readList(P.page);
                    F[`rev${k}Submitted`] = {h1: sub.h1, row: rowOf(sub, TT(k))};
                    await P.page.reload(); await idle(P.page); await sleep(1000);
                    const rl = await readList(P.page);
                    F[`rev${k}Reload`] = {h1: rl.h1, nav: navOf(rl), row: rowOf(rl, TT(k))};
                    await P.snap(`author-13-revisions-submitted-reload-${k}`);
                }
            }
            // Draft deletion (Rule 9, 10, Side effects)
            const D = {};
            await openView(P.page, 'Published');
            D.onPublished = (await menuItemState(P.page)).st; await closeMenu(P.page);
            await openView(P.page, 'Active submissions');
            const e1 = await enterSelection(P.page);
            D.onActive = e1.st;
            D.selection = await selectionState(P.page);
            D.rows = await readList(P.page).then((l) => l.rows.map((r) => ({t: r.cells.join(' ').replace(t, '').slice(0, 60), box: r.checkbox})));
            await P.snap('author-14-selection-mode', {}, {png: true});
            await loc(P.page, 'selection-mode Delete Incomplete Submissions', P.page.getByRole('button', {name: 'Delete Incomplete Submissions', exact: true}));
            // Cancel above the list
            await tick(P.page, TT('DraftB'));
            D.afterTick = await selectionState(P.page);
            const cancelAbove = P.page.getByRole('button', {name: 'Delete Incomplete Submissions', exact: true}).first().locator('xpath=following-sibling::button[1]');
            D.cancelAboveLabel = flat(await cancelAbove.innerText().catch(() => null), 40);
            await cancelAbove.click().catch(() => {}); await sleep(600);
            D.afterCancelAbove = {sel: await selectionState(P.page), boxes: (await readList(P.page)).rows.filter((r) => r.checkbox).length};
            // a changed view drops the selection
            await enterSelection(P.page); await tick(P.page, TT('DraftB'));
            await openView(P.page, 'Published'); await openView(P.page, 'Active submissions');
            D.afterViewChange = {sel: await selectionState(P.page), checked: (await readList(P.page)).rows.filter((r) => r.checked).length};
            // a search drops the selection
            if (!D.afterViewChange.sel.mode) { await enterSelection(P.page); await tick(P.page, TT('DraftB')); }
            await search(P.page, 'Draft');
            D.afterSearch = {sel: await selectionState(P.page), checked: (await readList(P.page)).rows.filter((r) => r.checked).length};
            await search(P.page, '');
            // the dialog's Cancel
            if (!(await selectionState(P.page)).mode) await enterSelection(P.page);
            await tick(P.page, TT('DraftB'));
            await P.page.getByRole('button', {name: 'Delete Incomplete Submissions', exact: true}).first().click();
            const conf = P.page.getByRole('dialog').filter({hasText: 'Confirm Delete of Incomplete Submissions'}).first();
            await conf.waitFor({timeout: T}); await sleep(500);
            D.confirmDialog = flat(await conf.innerText(), 400);
            await P.snap('author-15-confirm-dialog', {}, {png: true});
            await conf.getByRole('button', {name: 'Cancel', exact: true}).click(); await sleep(800);
            D.afterDialogCancel = {sel: await selectionState(P.page), checked: (await readList(P.page)).rows.filter((r) => r.checked).length, listed: !!rowOf(await readList(P.page), TT('DraftB'))};
            // Confirm
            if (!(await selectionState(P.page)).mode) await enterSelection(P.page);
            await tick(P.page, TT('DraftB'));
            const navBefore = navOf(await readList(P.page));
            const t2 = Date.now();
            await P.page.getByRole('button', {name: 'Delete Incomplete Submissions', exact: true}).first().click();
            await conf.waitFor({timeout: T}); await sleep(400);
            await conf.getByRole('button', {name: 'Confirm', exact: true}).click();
            await sleep(2500); await idle(P.page).catch(() => {});
            const after = await readList(P.page);
            D.confirm = {traffic: P.since(t2).filter((x) => /_submissions/.test(x)), bad: P.bad(t2), errors: P.errs(t2), browserDialogs: P.dlg(t2), dialogs: await dialogInfo(P.page),
                h1: after.h1, navBefore, navAfter: navOf(after), listed: !!rowOf(after, TT('DraftB')), sel: await selectionState(P.page)};
            await P.snap('author-16-after-confirm', {}, {png: true});
            if (D.confirm.dialogs.length) {
                await P.page.getByRole('dialog').last().getByRole('button', {name: 'OK', exact: true}).click().catch(() => {});
                await sleep(600);
                D.confirm.afterOk = await readList(P.page).then((l) => ({h1: l.h1, listed: !!rowOf(l, TT('DraftB')), sel: null}));
                D.confirm.afterOk.sel = await selectionState(P.page);
            }
            await P.page.reload(); await idle(P.page); await sleep(800);
            const rl = await readList(P.page);
            D.afterReload = {h1: rl.h1, nav: navOf(rl), listed: !!rowOf(rl, TT('DraftB'))};
            D.everyView = {};
            for (const n of ['Incomplete submissions', 'Declined', 'Published']) {
                if (!viewLink(P.page, n)) continue;
                try { await openView(P.page, n); const l = await readList(P.page); D.everyView[n] = {h1: l.h1, listed: !!rowOf(l, TT('DraftB'))}; } catch (e) { D.everyView[n] = String(e.message).slice(0, 80); }
            }
            D.restoreButtons = await P.page.getByRole('button', {name: /restore|undo/i}).count();
            // its wizard address afterwards
            if (S.draftBWizard) {
                const st = await P.go(S.draftBWizard);
                D.wizardAfter = {status: st, url: strip(P.page.url()), h1: flat(await P.page.locator('h1').first().innerText().catch(() => ''), 100)};
                await P.snap('author-17-wizard-after-delete', {}, {png: true});
            }
            // leaving the page with a tick
            await P.go(cu(A, '/dashboard/mySubmissions'));
            const t3 = Date.now();
            const ent = await enterSelection(P.page);
            if (ent.entered) await tick(P.page, TT('DraftA')).catch(() => {});
            await P.go(cu(A, '/user/profile'));
            D.leaveWithTick = {dialogs: P.dlg(t3), url: strip(P.page.url())};
            await P.go(cu(A, '/dashboard/mySubmissions'));
            D.backAfterLeave = {sel: await selectionState(P.page), draftA: !!rowOf(await readList(P.page), TT('DraftA'))};
            // the menu once no draft is on the page (OJS OMP: DraftA left; delete it too)
            F.delete = D;
            F.mailAfter = await mailCount(mailTo);
        } finally {
            fact('author', F);
            await P.close();
        }
    });

    // ================================================================== roles (Rule 3, Actors, A4, fn-a, fn-b)
    if (on('roles')) await sect('roles', async () => {
        const R = {};
        const accounts = ['au', 'a2', 'co', 'ma', 'sa', 'ac', 'mg', 'se', 'as', 'rd', 'nr'].concat(review ? ['ar', 'sr', 'rv'] : []);
        for (const k of accounts) {
            const P = await person(k);
            const o = {};
            try {
                o.docs = await P.as(U(k), A);
                const l = await readList(P.page);
                o.landing = {url: l.url, h1: l.h1, nav: l.navLinks ? navOf(l).slice(0, 14) : null};
                await P.snap(`roles-${k}-01-landing`);
                const t1 = Date.now();
                await P.go(cu(A, '/dashboard/mySubmissions'));
                const m = await readList(P.page);
                o.typed = {url: m.url, h1: m.h1, rows: m.rows.map((r) => r.cells.slice(0, 4).join(' | ').replace(t, 'T')), main: m.h1 ? null : flat(await P.page.locator('body').innerText().catch(() => ''), 300), bad: P.bad(t1)};
                await P.snap(`roles-${k}-02-typed-list`);
                if (m.h1) {
                    o.filters = await readFilters(P.page).catch((e) => String(e.message).slice(0, 80));
                    o.rowButtons = m.rows.map((r) => `${r.cells[1] ? r.cells[1].slice(0, 40) : ''}: ${r.buttons.join(',')}`);
                }
                await P.go(cu(A, '/submissions'));
                o.retired = strip(P.page.url());
                if (['a2', 'mg', 'se', 'rd', 'co', 'ma'].includes(k)) {
                    const t2 = Date.now();
                    await P.go(cu(A, `/authorDashboard/submission/${S.subs.Queued}`));
                    await sleep(1000);
                    o.oldLinkQueued = {url: strip(P.page.url()), dialogs: (await dialogInfo(P.page)).map((d) => d.heads.join(' / ')), text: flat(await P.page.locator('main, body').first().innerText().catch(() => ''), 200), bad: P.bad(t2)};
                    await P.snap(`roles-${k}-03-oldlink-queued`);
                }
                if (k === 'sa') {
                    // from the Dashboard to the author list through the sidebar group
                    await P.go(cu(A, '/dashboard/editorial'));
                    await openView(P.page, 'Active submissions').catch(() => {});
                    const viaNav = await P.page.locator('#app-nav a').filter({hasText: 'Active submissions'}).evaluateAll((els) => els.map((e) => e.getAttribute('href')));
                    o.sidebarHrefs = viaNav;
                    const l2 = await readList(P.page);
                    o.viaSidebar = {url: l2.url, h1: l2.h1};
                }
                if (k === 'au') {
                    // the second journal: only its own submission
                    await P.as(U('au'), S.B);
                    const b = await readList(P.page);
                    o.journalB = {url: b.url, h1: b.h1, rows: b.rows.map((r) => r.cells.slice(0, 3).join(' | ').replace(t, 'T'))};
                    await P.snap('roles-au-04-journal-b');
                    // site-wide login
                    await P.as(U('au'));
                    o.siteLogin = strip(P.page.url());
                }
            } catch (e) { o.err = String(e.message).slice(0, 300); } finally { R[k] = o; await P.close(); }
        }
        // a signed-out visitor typing the address, then signing in on the page it lands on
        const V = await person('visitor');
        try {
            await V.go(cu(A, '/dashboard/mySubmissions'));
            R.visitor = {url: strip(V.page.url())};
            await V.snap('roles-visitor-01-typed');
            const user = V.page.locator('input[name=username]').first();
            if (await user.count()) {
                await user.fill(U('au'));
                const pw = V.page.locator('input[name=password]').first();
                await pw.evaluate((e) => e.removeAttribute('maxlength'));
                await pw.fill(`${U('au')}${U('au')}`);
                await V.page.getByRole('button', {name: /^Log ?in$/i}).first().click();
                await V.page.waitForLoadState('load').catch(() => {}); await idle(V.page).catch(() => {}); await sleep(800);
                R.visitor.afterSignIn = strip(V.page.url());
                await V.snap('roles-visitor-02-after-sign-in');
            }
        } catch (e) { R.visitorErr = String(e.message).slice(0, 200); } finally { await V.close(); }
        fact('roles', R);
    });

    // ================================================================== open review (Rule 7b, A1) {OJS OMP}
    if (on('open') && review && S.O) await sect('open', async () => {
        const O = {};
        const Au = await person('oa');
        const Ed = await person('oe');
        try {
            await Au.as(U('oa'), S.O);
            const pre = await readList(Au.page);
            O.before = {conf: rowOf(pre, TT('OpenConf')), unconf: rowOf(pre, TT('OpenUnconf'))};
            await Au.snap('open-01-before-confirm');
            await Ed.as(U('oe'), S.O);
            await Ed.go(cu(S.O, `/dashboard/editorial?workflowSubmissionId=${S.subs.OpenConf}`));
            await Ed.page.getByRole('dialog').first().waitFor({timeout: T}); await sleep(1500);
            const row = Ed.page.getByRole('row').filter({hasText: 'Olga Openreviewer'}).first();
            await row.getByRole('button', {name: 'Read Review'}).click({timeout: T});
            const read = Ed.page.getByRole('dialog', {name: /^Review Details:/});
            await read.getByRole('button', {name: 'Modify Review', exact: true}).waitFor({timeout: T});
            await Ed.page.waitForFunction(() => true); await sleep(800);
            await read.getByRole('button', {name: 'Mark as Complete', exact: true}).click();
            const cd = Ed.page.locator('[data-cy="dialog"]').filter({hasText: 'Mark this review as complete?'});
            await cd.getByRole('button', {name: 'Mark as Complete', exact: true}).click();
            await Ed.page.getByText('The review has been marked as complete.').first().waitFor({timeout: T}).catch(() => {});
            O.marked = Ed.since(0).filter((x) => /reviewAssignments|reviews/.test(x)).slice(-4);
            await Ed.snap('open-02-editor-marked');
            await Au.page.reload(); await idle(Au.page); await sleep(1200);
            const post = await readList(Au.page);
            O.after = {conf: rowOf(post, TT('OpenConf')), unconf: rowOf(post, TT('OpenUnconf'))};
            await Au.snap('open-03-after-confirm', {}, {png: true});
            const r = rowLoc(Au.page, TT('OpenConf'));
            const av = r.locator('button[id^="headlessui-popover-button"]');
            O.avatars = await av.count();
            await loc(Au.page, 'reviewer avatar (popover button)', av);
            if (O.avatars) {
                await av.first().click();
                const pan = r.locator('[id^="headlessui-popover-panel"]');
                await pan.waitFor({timeout: T}).catch(() => {});
                O.popover = flat(await pan.innerText().catch(() => null), 300);
                await Au.snap('open-04-popover', {}, {png: true});
            }
            O.unconfAvatars = await rowLoc(Au.page, TT('OpenUnconf')).locator('button[id^="headlessui-popover-button"]').count();
        } finally {
            fact('open', O);
            await Au.close(); await Ed.close();
        }
    });

    // ================================================================== publish by a future date (A3, Rule 2) {OMP OPS}
    // U49 Rule 6: a press or preprint server schedules by a future date saved on the entry page
    // ("Date Published" on Catalog Entry, "Date Posted" on Preprint entry), then Publish / Post.
    if (on('publish') && !isOJS && S.subs.Prod) await sect('publish', async () => {
        const Q = {};
        const M = await person('mg');
        try {
            const {WorkflowPage} = require(path.join(REPO, 'shared/playwright/pages/WorkflowPage.js'));
            await M.as(U('mg'), A);
            await M.go(cu(A, `/dashboard/editorial?workflowSubmissionId=${S.subs.Prod}`));
            await M.page.getByRole('dialog').first().waitFor({timeout: T}); await sleep(1500);
            const entryName = isOMP ? 'Catalog Entry' : 'Preprint entry';
            const link = await new WorkflowPage(M.page, A).revealPublicationEntry(entryName);
            await link.click(); await idle(M.page); await sleep(1500);
            const fieldRe = isOMP ? /^Date Published/ : /^Date Posted/;
            const field = M.page.locator('.pkpFormField').filter({has: M.page.locator('label.pkpFormFieldLabel').filter({hasText: fieldRe})}).first();
            Q.entryUrl = strip(M.page.url());
            Q.field = flat(await field.innerText().catch(() => null), 300);
            await M.snap('publish-01-entry-page');
            const future = `${new Date().getFullYear() + 4}-01-01`;
            await field.locator('input').first().fill(future);
            const saved = M.page.waitForResponse((r) => /\/publications\/\d+/.test(r.url()) && r.request().method() === 'POST', {timeout: T}).catch(() => null);
            await field.locator('xpath=ancestor::form[1]').getByRole('button', {name: 'Save', exact: true}).first().click();
            const sr = await saved;
            Q.saved = {date: future, status: sr ? sr.status() : null};
            await sleep(1200);
            const stageAction = M.page.getByRole('button', {name: 'Post the preprint', exact: true});
            if (isOPS && (await stageAction.isVisible().catch(() => false))) { await stageAction.click(); await sleep(1000); }
            const pubBtn = M.page.getByRole('button', {name: isOMP ? 'Publish' : 'Post', exact: true}).first();
            Q.headerButtons = await M.page.getByRole('dialog').first().locator('button').evaluateAll((els) => els.filter((e) => e.getClientRects().length).map((e) => e.innerText.replace(/\s+/g, ' ').trim()).filter((x) => /Publish|Schedule|Post/i.test(x)));
            await pubBtn.click({timeout: T}); await idle(M.page); await sleep(1500);
            const win = M.page.getByRole('dialog').filter({hasText: isOMP ? /catalog entry public/ : /post this/}).last();
            Q.window = flat(await win.innerText().catch(() => null), 600);
            Q.windowDateInputs = await win.locator('input[type=date], input[name*=date i]').count().catch(() => null);
            await M.snap('publish-02-window', {}, {png: true});
            const published = M.page.waitForResponse((r) => /\/publish\b/.test(r.url()), {timeout: T}).catch(() => null);
            await win.getByRole('button', {name: isOMP ? 'Publish' : 'Post', exact: true}).last().click();
            const pr = await published;
            Q.publish = pr ? pr.status() : null;
            await idle(M.page); await sleep(1500);
            Q.statusAfter = flat(await M.page.locator('div:has(> span:text-is("Status:"))').first().innerText().catch(() => null), 80);
            Q.controlsAfter = await M.page.getByRole('dialog').first().locator('button').evaluateAll((els) => els.filter((e) => e.getClientRects().length).map((e) => e.innerText.replace(/\s+/g, ' ').trim()).filter((x) => /Publish|Schedule|Post|Unschedule|Preview/i.test(x)));
            await M.snap('publish-03-after');
            // the author's list
            await readScheduled(Q);
        } finally { fact('publish', Q); await M.close(); }
    });

    // the author's "Scheduled for publication" view (A3), read after the publish part
    async function readScheduled(Q) {
        const Au = await person('au');
        try {
            await Au.as(U('au'), A);
            const l0 = await readList(Au.page);
            Q.authorNav = navOf(l0);
            await openView(Au.page, 'Scheduled for publication');
            const l = await readList(Au.page);
            Q.authorScheduled = {url: l.url, h1: l.h1, row: rowOf(l, TT('Prod')), rows: l.rows.length};
            await Au.snap('publish-04-author-scheduled', {}, {png: true});
            await openView(Au.page, 'Active submissions');
            Q.authorActiveHasProd = !!rowOf(await readList(Au.page), TT('Prod'));
            await openView(Au.page, 'Published');
            Q.authorPublishedHasProd = !!rowOf(await readList(Au.page), TT('Prod'));
        } finally { await Au.close(); }
    }
    if (on('sched') && !isOJS && S.subs.Prod) await sect('sched', async () => { const Q = {}; try { await readScheduled(Q); } finally { fact('sched', Q); } });

    // ================================================================== paging (Rule 9's per-page qualifier)
    if (on('paging') && S.P) await sect('paging', async () => {
        const G = {};
        const P = await person('pa');
        try {
            await P.as(U('pa'), S.P);
            const l1 = await readList(P.page);
            G.page1 = {h1: l1.h1, n: l1.rows.length, pagination: l1.pagination, hasDraft: !!rowOf(l1, TT('PgDraft')), first: (l1.rows[0] || {}).cells, last: (l1.rows[l1.rows.length - 1] || {}).cells};
            G.page1.menu = (await menuItemState(P.page)).st; await closeMenu(P.page);
            await P.snap('paging-01-page1');
            const next = P.page.getByRole('button', {name: /^(Go to page 2|2|Next page|Next)$/}).first();
            G.nextFound = await next.count();
            if (G.nextFound) {
                await next.click(); await idle(P.page); await sleep(1000);
                const l2 = await readList(P.page);
                G.page2 = {url: l2.url, n: l2.rows.length, pagination: l2.pagination, hasDraft: !!rowOf(l2, TT('PgDraft')), rows: l2.rows.map((r) => (r.cells[1] || '').slice(0, 40))};
                G.page2.menu = (await menuItemState(P.page)).st; await closeMenu(P.page);
                await P.snap('paging-02-page2');
            } else {
                G.pagerButtons = await P.page.locator('main nav button, main [class*=agination] button').evaluateAll((els) => els.map((e) => (e.innerText || e.getAttribute('aria-label') || '').trim()));
            }
        } finally { fact('paging', G); await P.close(); }
    });

    // ================================================================== view (Rule 8: the panel's menu entry in the address, Close, a bookmark)
    if (on('view') && S.subs.Queued) await sect('view', async () => {
        const V = {};
        const P = await person('au');
        try {
            await P.as(U('au'), A);
            for (const k of ['Queued', 'Coauth']) {
                const o = {};
                await P.go(cu(A, '/dashboard/mySubmissions'));
                o.before = strip(P.page.url());
                await rowLoc(P.page, TT(k)).getByRole('button', {name: 'View', exact: true}).click({timeout: T});
                await P.page.getByRole('dialog').first().waitFor({timeout: T}); await idle(P.page); await sleep(1200);
                o.opened = strip(P.page.url());
                const d = P.page.getByRole('dialog').first();
                for (const entry of ['Contributors', 'Title & Abstract']) {
                    const el = d.getByRole('button', {name: entry, exact: true}).or(d.getByRole('link', {name: entry, exact: true})).first();
                    if (!(await el.count())) { o[entry] = 'absent'; continue; }
                    await el.click().catch(() => {}); await idle(P.page); await sleep(1000);
                    o[entry] = {url: strip(P.page.url()), heads: (await dialogInfo(P.page)).map((x) => x.heads.slice(0, 2).join(' / '))};
                }
                await P.snap(`view-${k}-01-entry-pressed`);
                const bookmark = P.page.url();
                await closeWorkflowPanel(P.page);
                o.afterClose = strip(P.page.url());
                o.backToBefore = o.afterClose === o.before;
                await P.go(bookmark); await sleep(1000);
                o.bookmark = {url: strip(P.page.url()), heads: (await dialogInfo(P.page)).map((x) => x.heads.slice(0, 2).join(' / '))};
                await P.snap(`view-${k}-02-bookmark`);
                V[k] = o;
            }
        } finally { fact('view', V); await P.close(); }
    });

    // ================================================================== draftlink (A5: the old link to a draft, then a publication page of the panel)
    if (on('draftlink') && S.subs.DraftA) await sect('draftlink', async () => {
        const Z = {};
        const P = await person('au');
        try {
            await P.as(U('au'), A);
            const t1 = Date.now();
            await P.go(cu(A, `/authorDashboard/submission/${S.subs.DraftA}`));
            await sleep(1500);
            Z.landed = {url: strip(P.page.url()), dialogs: (await dialogInfo(P.page)).map((x) => ({heads: x.heads.slice(0, 3), text: x.text.slice(0, 160)})), bad: P.bad(t1)};
            await P.snap('draftlink-01-landed', {}, {png: true});
            const err = P.page.getByRole('dialog').filter({hasText: 'Workflow access for incomplete submission is restricted.'});
            if (await err.count()) { await err.getByRole('button', {name: 'OK', exact: true}).click().catch(() => {}); await sleep(600); }
            const d = P.page.getByRole('dialog').first();
            const t2 = Date.now();
            const el = d.getByRole('button', {name: 'Title & Abstract', exact: true}).or(d.getByRole('link', {name: 'Title & Abstract', exact: true})).first();
            if (await el.count()) {
                await el.click().catch(() => {}); await idle(P.page); await sleep(1500);
                Z.titleAbstract = {url: strip(P.page.url()), dialogs: (await dialogInfo(P.page)).map((x) => ({heads: x.heads.slice(0, 3), text: x.text.slice(0, 160)})), bad: P.bad(t2), errors: P.errs(t2)};
                await P.snap('draftlink-02-title-abstract', {}, {png: true});
            } else Z.titleAbstract = 'no entry';
        } finally { fact('draftlink', Z); await P.close(); }
    });

    // ================================================================== groups (Rule 1, Rule 3: the sidebar groups each account lands with)
    if (on('groups')) await sect('groups', async () => {
        const G = {};
        for (const k of ['au', 'ma', 'sa', 'ac', 'mg', 'se', 'as'].concat(review ? ['ar', 'sr', 'rv'] : [])) {
            const P = await person(k);
            try {
                await P.as(U(k), A);
                const nav = await P.page.locator('#app-nav').innerText().then((x) => flat(x, 1500)).catch(() => null);
                G[k] = {landing: strip(P.page.url()).replace(/^\/index\.php\/[^/]+/, ''), authorGroup: !!nav && nav.includes('My Submissions as Author'),
                    reviewerGroup: !!nav && nav.includes('My Assignments as Reviewer'), startNew: !!nav && nav.includes('Start A New Submission')};
                if (G[k].authorGroup) {
                    const link = P.page.locator('#app-nav a[href*="dashboard/mySubmissions?currentViewId=active"]').first();
                    if (await link.count()) {
                        if (!(await link.isVisible())) { await P.page.locator('#app-nav a').filter({has: P.page.getByText('My Submissions as Author', {exact: true})}).first().click().catch(() => {}); await sleep(400); }
                        await link.click().catch(() => {}); await idle(P.page); await sleep(800);
                        const l = await readList(P.page);
                        G[k].viaGroup = {url: l.url.replace(/^\/index\.php\/[^/]+/, ''), h1: l.h1};
                    }
                }
                await P.snap(`groups-${k}`);
            } catch (e) { G[k] = {err: String(e.message).slice(0, 200)}; } finally { await P.close(); }
        }
        fact('groups', G);
    });

    // ================================================================== leak (fn-h: the author's own list data withholds anonymous reviewers)
    // The list's own `_submissions` answers, as the browser receives them, searched for the reviewers' names and usernames.
    if (on('leak') && review) await sect('leak', async () => {
        const K = {};
        const scan = async (who, ctx, needles) => {
            const P = await person(who);
            const bodies = [];
            P.page.on('response', async (r) => { if (/\/api\/v1\/_submissions(\/|\?|$)/.test(r.url()) && r.request().method() === 'GET') { try { bodies.push({u: strip(r.url()).slice(0, 160), b: await r.text()}); } catch (e) { /* gone */ } } });
            try {
                await P.as(U(who), ctx);
                for (const n of ['Active submissions', 'Declined']) await openView(P.page, n).catch(() => {});
                await sleep(800);
                const hits = {};
                for (const nd of needles) hits[nd] = bodies.filter((x) => x.b.includes(nd)).map((x) => x.u);
                const one = bodies.find((x) => /reviewAssignments/.test(x.b));
                let sample = null;
                if (one) { try { const j = JSON.parse(one.b); const it = (j.items || []).find((s) => (s.reviewAssignments || []).length); sample = it ? it.reviewAssignments.map((ra) => Object.fromEntries(Object.entries(ra).filter(([k]) => /name|initial|reviewer|method|status/i.test(k)))) : null; } catch (e) { sample = 'unparsed'; } }
                return {requests: bodies.map((x) => x.u), hits, sample};
            } finally { await P.close(); }
        };
        K.author = await scan('au', A, ['Rae', 'Ray', 'Roy', 'One', 'Two', 'Three', U('r1'), U('r2'), U('r3')]);
        if (S.O) K.openAuthor = await scan('oa', S.O, ['Olga', 'Openreviewer', 'Otto', 'Secondreviewer', U('ov'), U('ow')]);
        fact('leak', K);
    });

    // ================================================================== logs (Side effects: the list logs nothing)
    if (on('logs') && S.subs.Queued) await sect('logs', async () => {
        const L = {};
        const M = await person('mg');
        const readLog = async () => {
            await M.go(cu(A, `/dashboard/editorial?workflowSubmissionId=${S.subs.Queued}`));
            await M.page.getByRole('dialog').first().waitFor({timeout: T}); await sleep(1200);
            const fetched = M.page.waitForResponse((r) => r.url().includes('submission-event-log-grid/fetch-grid'), {timeout: T}).catch(() => null);
            await M.page.getByRole('dialog').first().getByRole('button', {name: 'Activity Log', exact: true}).first().click({timeout: T});
            await fetched; await idle(M.page); await sleep(800);
            const d = M.page.getByRole('dialog', {name: 'Activity Log & Notes', exact: true});
            const rows = await d.locator('tbody tr').evaluateAll((els) => els.filter((e) => e.getClientRects().length).map((e) => e.innerText.replace(/\s+/g, ' ').trim()));
            await d.getByRole('button', {name: 'Close', exact: true}).first().click().catch(() => {});
            await sleep(600);
            return rows;
        };
        try {
            await M.as(U('mg'), A);
            L.before = await readLog();
            await M.snap('logs-01-before');
            const Au = await person('au');
            const mailTo = `${U('au')}@mail.test`;
            L.mailBefore = await mailCount(mailTo);
            try {
                await Au.as(U('au'), A);
                await rowLoc(Au.page, TT('Queued')).getByRole('button', {name: 'View', exact: true}).click({timeout: T});
                await Au.page.getByRole('dialog').first().waitFor({timeout: T}); await sleep(1200);
                await closeWorkflowPanel(Au.page);
                await search(Au.page, TT('Queued')); await search(Au.page, '');
                await readFilters(Au.page);
                for (const n of ['Published', 'Declined', 'Active submissions']) await openView(Au.page, n);
                L.authorTraffic = Au.since(0).filter((x) => !/^GET /.test(x)).slice(0, 20);
            } finally { await Au.close(); }
            await sleep(3000);
            L.mailAfter = await mailCount(mailTo);
            L.after = await readLog();
            await M.snap('logs-02-after');
        } finally { fact('logs', L); await M.close(); }
    });

    if (RUN === 'r1') note(`SW17 (${app.name}): My Submissions rows read by CSS \`main table tbody tr\` with their \`td\` cells; the view entries are \`#app-nav a\` filtered by the view's exact name; the selection mode's Cancel is the button after "Delete Incomplete Submissions" (xpath following-sibling); the revisions upload dialog is \`getByRole('dialog')\` with tab "1. Upload File".`);
});
