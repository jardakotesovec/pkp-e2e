// U51 claim check K1: staff management on the "Payments" page (Actors & permissions, the subscription lists, the
// subscription window, "Subscription Types", the type window, "Subscription Policies", Rules 14–25, the subscription
// and payment emails, Settings bullets 7–10, register A2–A4, A8, A15 and the register summary rows).
// OJS carries the feature; OMP and OPS get the absence and control probes (phase `absence`, run on `all`).
//   PROBE_FEATURE=U51 PROBE_AGENT=ccK1 node bin/probe.js all shared/playwright/checks/U51/K1/k1.js
//   PHASES=seed,absence,roles,smgr,galleys,pages,paypage,policies,win0,types,win,mail,renew,search,access,delsub,
//          deltype,inst,partial,hidden,paging,manual,summary,reminders   (default all, in that order)
// State lives in .reports/U51/ccK1/k1-state-<app>.json so a phase re-runs alone; delete it to reseed. No assertions:
// every screen is recorded with screen() (+ PNG) and the facts go to k1-facts-<app>.json.
//
// Scratch journals (OJS; every one requires subscriptions unless said otherwise):
//   A  payments off (the default), every role key, readers r1..r5, one "Subscription" issue with an article + PDF;
//      fresh "Subscription Policies"; types, subscriptions, the contact and the institutions are made BY SCREEN here.
//   B  payments set up (manual, instructions), contact, six types, eleven individual subscriptions in every status,
//      an institution far away (10.0.0.0/8) with an institutional subscription, the Subscription block placed.
//   C  an institution at 127.0.0.1 with an active institutional "Online" subscription, the block placed (td22).
//   D  "Partial expiry", r1 subscribed 2025-01-01..2025-12-31, issues dated 2025-06-01 and 2026-03-01 (td21).
//   E  payments enabled but not set up (no manual instructions).
//   F  institutional partial expiry: 127.0.0.1 subscribed 2025-01-01..2025-12-31, the same two issues.
//   G  open access (no mode row), payments set up, one type (the "Subscriptions" page on an open journal).
//   H  itemsPerPage 3, four subscriptions and four types (the lists split into pages).
//   I  an institution with no IP range, an institutional subscription with the domain "localhost" (Rule 18 domain).
//   J  payments set up with "Only Restrict Access to PDF…" and no fee, an article with PDF and HTML galleys (A14).
//   K  payments set up with a "Purchase Article" fee of 5 (A6).
const fs = require('fs');
const path = require('path');
const {execSync} = require('child_process');
const {forEachApp, launch, signIn, signOut, screen, shot, record, loc, note, idle, tag, outDir} = require('../../../probe');

const T = 30_000;
const ALL = ['seed', 'absence', 'roles', 'smgr', 'galleys', 'pages', 'paypage', 'policies', 'policies2', 'win0', 'types', 'win', 'mail', 'renew', 'search', 'search2',
    'access', 'delsub', 'deltype', 'inst', 'partial', 'hidden', 'paging', 'manual', 'summary', 'paytypes', 'reminders'];
const PHASES = (process.env.PHASES || ALL.join(',')).split(',');
const on = (p) => PHASES.includes(p);
const log = (...a) => console.log('[k1]', ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (s, n = 1500) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));
const statePath = (app) => path.join(outDir(), `k1-state-${app.name}.json`);
const DENIED = /does not have access to this operation/i;
const SUB_MODE = 'The journal will require subscriptions to access some or all of its contents.';
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return ymd(d); };
const addMonths = (n, from = new Date()) => { const d = new Date(from); d.setMonth(d.getMonth() + n); return ymd(d); };
const TODAY = ymd(new Date());
const dayBefore = (s) => { const d = new Date(`${s}T12:00:00`); d.setDate(d.getDate() - 1); return ymd(d); };

const ROLE_KEYS = [
    ['mg', 'manager'], ['ed', 'editor'], ['pe', 'productionEditor'], ['se', 'sectionEditor'], ['ge', 'guestEditor'],
    ['ce', 'copyeditor'], ['ds', 'designer'], ['fc', 'funding'], ['ix', 'indexer'], ['le', 'layoutEditor'], ['mk', 'marketing'],
    ['pr', 'proofreader'], ['eb', 'editorialBoardMember'], ['au', 'author'], ['tr', 'translator'], ['rv', 'externalReviewer'],
    ['rd', 'reader'], ['sm', 'subscriptionManager'],
];

forEachApp(async (app) => {
    const isOJS = app.name === 'ojs';
    const S = fs.existsSync(statePath(app)) ? JSON.parse(fs.readFileSync(statePath(app), 'utf8')) : {};
    const save = () => fs.writeFileSync(statePath(app), JSON.stringify(S, null, 1));
    const fact = (k, v) => { record('k1-facts', {[k]: v}, {merge: true}); log(`[${app.name} ${k}]`, JSON.stringify(v).slice(0, 3000)); };

    // ================================================================== seed (OJS)
    if (on('seed') && isOJS && !S.seeded) {
        const t = tag('u51k1');
        S.t = t; S.C = {}; S.s = {};
        const U = (p, k, role) => ({username: `${p}${k}`, roles: [role], givenName: k.toUpperCase(), familyName: `Kone${k}`});
        const base = (p, name) => ({name: `U51 K1 ${name}`, acronym: 'KONE', contactName: 'K1 Principal', contactEmail: `${p}pc@mail.test`});
        const PAY = {currency: 'USD', paymentPluginName: 'ManualPayment', manualInstructions: 'Pay by cheque to K1.'};
        const mk = async (key, spec) => {
            const p = `${t}${key}`;
            try {
                const r = await app.api.createContext({tag: p, ...spec(p)});
                S.C[key] = {path: r.path || p, p, id: r.contextId, users: Object.fromEntries((r.users || []).map((u) => [u.username.slice(p.length), u.id])),
                    issues: r.issues || [], types: r.subscriptionTypes || [], subs: r.subscriptions || [], insts: r.institutions || []};
                log('seed ctx', key, S.C[key].path);
            } catch (e) { log('seed ctx FAILED', key, String(e.message).slice(0, 900)); S.C[key] = {error: String(e.message).slice(0, 900)}; }
            save();
            return S.C[key];
        };
        const sub = async (key, k, spec) => {
            const C = S.C[key];
            if (C.error) return;
            try {
                const r = await app.api.createSubmission({tag: `${C.p}${k}`, context: C.path, submitter: `${C.p}au`, title: `K1 ${k} Article ${C.p}`,
                    galleys: [{label: 'PDF', file: 'article.pdf'}], ...spec});
                S.s[`${key}.${k}`] = {id: r.submissionId, pub: r.publicationId, status: r.status, title: `K1 ${k} Article ${C.p}`};
                log('seed sub', key, k, r.submissionId, r.status);
            } catch (e) { log('seed sub FAILED', key, k, String(e.message).slice(0, 700)); S.s[`${key}.${k}`] = {error: String(e.message).slice(0, 700)}; }
            save();
        };
        const pubIssue = [{volume: 1, number: 1, year: 2026, published: true, galleys: [{label: 'PDF', file: 'article.pdf'}]}];
        // A
        await mk('A', (p) => ({context: base(p, 'by screen'), publishingMode: 'subscription',
            users: [...ROLE_KEYS.map(([k, r]) => U(p, k, r)), ...['r1', 'r2', 'r3', 'r4', 'r5'].map((k) => U(p, k, 'reader'))], issues: pubIssue}));
        await sub('A', 'a1', {issue: {volume: 1, number: 1, year: 2026}, published: true});
        // B
        const bReaders = ['act', 'ni', 'na', 'amp', 'aop', 'oth', 'prn', 'fut', 'past', 'tdy', 'for', 'mem'];
        await mk('B', (p) => ({context: base(p, 'set up'), publishingMode: 'subscription', payments: PAY, sidebar: ['subscriptionblockplugin'],
            subscriptionName: 'K1 Subs Desk', subscriptionEmail: `${p}desk@mail.test`, subscriptionPhone: '555-0101', subscriptionMailingAddress: '1 K1 Street',
            subscriptionAdditionalInformation: '<p>K1 subscription information.</p>',
            users: [...['mg', 'ed', 'pe', 'se', 'sm', 'rd', 'au', 'r2', 'ce'].map((k) => U(p, k, {mg: 'manager', ed: 'editor', pe: 'productionEditor', se: 'sectionEditor', sm: 'subscriptionManager', au: 'author', ce: 'copyeditor'}[k] || 'reader')),
                ...bReaders.map((k) => U(p, k, 'reader'))],
            institutions: [{name: 'K1 Far Library', ipRanges: ['10.0.0.0/8']}],
            subscriptionTypes: [
                {name: 'K1 Online', cost: 40, currency: 'USD', duration: 12, description: '<p>Online for a year.</p>'},
                {name: 'K1 Forever', cost: 100, currency: 'USD'},
                {name: 'K1 Print', cost: 30, currency: 'USD', duration: 12, format: 'print'},
                {name: 'K1 Hidden', cost: 1, currency: 'USD', duration: 12, hidden: true},
                {name: 'K1 Member', cost: 20, currency: 'USD', duration: 12, membership: true},
                {name: 'K1 Campus', cost: 500, currency: 'USD', duration: 12, institutional: true},
            ],
            subscriptions: [
                {user: `${p}act`, type: 'K1 Online', dateStart: '2026-01-01', dateEnd: '2026-12-31', referenceNumber: 'REF-ACT', notes: '<p>note act</p>'},
                {user: `${p}ni`, type: 'K1 Online', status: 'needsInformation'},
                {user: `${p}na`, type: 'K1 Online', status: 'needsApproval'},
                {user: `${p}amp`, type: 'K1 Online', status: 'awaitingManualPayment'},
                {user: `${p}aop`, type: 'K1 Online', status: 'awaitingOnlinePayment'},
                {user: `${p}oth`, type: 'K1 Online', status: 'other'},
                {user: `${p}prn`, type: 'K1 Print'},
                {user: `${p}fut`, type: 'K1 Online', dateStart: addDays(1), dateEnd: addMonths(12)},
                {user: `${p}past`, type: 'K1 Online', dateStart: '2025-09-01', dateEnd: addDays(-1)},
                {user: `${p}tdy`, type: 'K1 Online', dateStart: '2025-10-01', dateEnd: TODAY},
                {user: `${p}for`, type: 'K1 Forever'},
                {user: `${p}mem`, type: 'K1 Member', membership: 'MEM-77'},
                {user: `${p}mg`, type: 'K1 Campus', institution: 'K1 Far Library', domain: 'far.example.org', mailingAddress: 'Far Rd', referenceNumber: 'REF-CAMPUS'},
            ],
            issues: pubIssue}));
        await sub('B', 'b1', {issue: {volume: 1, number: 1, year: 2026}, published: true});
        // C
        await mk('C', (p) => ({context: base(p, 'campus'), publishingMode: 'subscription', sidebar: ['subscriptionblockplugin'],
            users: [U(p, 'mg', 'manager'), U(p, 'rd', 'reader'), U(p, 'au', 'author')],
            institutions: [{name: 'K1 Local Library', ipRanges: ['127.0.0.1']}],
            subscriptionTypes: [{name: 'K1 Campus', cost: 500, currency: 'USD', duration: 12, institutional: true}],
            subscriptions: [{user: `${p}mg`, type: 'K1 Campus', institution: 'K1 Local Library'}],
            issues: pubIssue}));
        await sub('C', 'c1', {issue: {volume: 1, number: 1, year: 2026}, published: true});
        // D (issues unpublished at seed; published by screen in phase `partial` so the articles inherit the dates)
        const dIssues = [{volume: 1, number: 1, year: 2025, datePublished: '2025-06-01', galleys: [{label: 'PDF', file: 'article.pdf'}]},
            {volume: 2, number: 1, year: 2026, datePublished: '2026-03-01', galleys: [{label: 'PDF', file: 'article.pdf'}]}];
        await mk('D', (p) => ({context: base(p, 'partial'), publishingMode: 'subscription', subscriptionExpiryPartial: true,
            subscriptionName: 'K1 Desk', subscriptionEmail: `${p}desk@mail.test`,
            users: [U(p, 'mg', 'manager'), U(p, 'r1', 'reader'), U(p, 'r2', 'reader'), U(p, 'au', 'author')],
            subscriptionTypes: [{name: 'K1 Online', cost: 40, currency: 'USD', duration: 12}],
            subscriptions: [{user: `${p}r1`, type: 'K1 Online', dateStart: '2025-01-01', dateEnd: '2025-12-31'}],
            issues: dIssues}));
        await sub('D', 'd25', {issue: {volume: 1, number: 1, year: 2025}, published: true});
        await sub('D', 'd26', {issue: {volume: 2, number: 1, year: 2026}, published: true});
        // E
        await mk('E', (p) => ({context: base(p, 'enabled not set up'), publishingMode: 'subscription',
            payments: {currency: 'USD', paymentPluginName: 'ManualPayment'},
            users: [U(p, 'mg', 'manager'), U(p, 'se', 'sectionEditor'), U(p, 'sm', 'subscriptionManager'), U(p, 'rd', 'reader')],
            subscriptionTypes: [{name: 'K1 Online', cost: 40, currency: 'USD', duration: 12}]}));
        // F
        await mk('F', (p) => ({context: base(p, 'campus partial'), publishingMode: 'subscription', subscriptionExpiryPartial: true,
            users: [U(p, 'mg', 'manager'), U(p, 'au', 'author')],
            institutions: [{name: 'K1 Old Library', ipRanges: ['127.0.0.1']}],
            subscriptionTypes: [{name: 'K1 Campus', cost: 500, currency: 'USD', duration: 12, institutional: true}],
            subscriptions: [{user: `${p}mg`, type: 'K1 Campus', institution: 'K1 Old Library', dateStart: '2025-01-01', dateEnd: '2025-12-31'}],
            issues: dIssues}));
        await sub('F', 'f25', {issue: {volume: 1, number: 1, year: 2025}, published: true});
        await sub('F', 'f26', {issue: {volume: 2, number: 1, year: 2026}, published: true});
        // G (open access: no publishingMode row)
        await mk('G', (p) => ({context: base(p, 'open'), payments: PAY, users: [U(p, 'mg', 'manager'), U(p, 'rd', 'reader')],
            subscriptionTypes: [{name: 'K1 Online', cost: 40, currency: 'USD', duration: 12}]}));
        // H (paging)
        await mk('H', (p) => ({context: base(p, 'paging'), publishingMode: 'subscription', itemsPerPage: 3,
            users: [U(p, 'mg', 'manager'), ...['p1', 'p2', 'p3', 'p4'].map((k) => U(p, k, 'reader'))],
            subscriptionTypes: ['T1', 'T2', 'T3', 'T4'].map((n) => ({name: `K1 ${n}`, cost: 10, currency: 'USD', duration: 12})),
            subscriptions: ['p1', 'p2', 'p3', 'p4'].map((k) => ({user: `${p}${k}`, type: 'K1 T1'}))}));
        // I (domain)
        await mk('I', (p) => ({context: base(p, 'domain'), publishingMode: 'subscription', sidebar: ['subscriptionblockplugin'],
            users: [U(p, 'mg', 'manager'), U(p, 'au', 'author')],
            institutions: [{name: 'K1 Domain Library'}],
            subscriptionTypes: [{name: 'K1 Campus', cost: 500, currency: 'USD', duration: 12, institutional: true}],
            subscriptions: [{user: `${p}mg`, type: 'K1 Campus', institution: 'K1 Domain Library', domain: 'localhost'}],
            issues: pubIssue}));
        await sub('I', 'i1', {issue: {volume: 1, number: 1, year: 2026}, published: true});
        // J (A14)
        await mk('J', (p) => ({context: base(p, 'only pdf'), publishingMode: 'subscription', payments: {...PAY, restrictOnlyPdf: true},
            users: [U(p, 'mg', 'manager'), U(p, 'rd', 'reader'), U(p, 'au', 'author')], issues: pubIssue}));
        await sub('J', 'j1', {issue: {volume: 1, number: 1, year: 2026}, published: true,
            galleys: [{label: 'PDF', file: 'article.pdf'}, {label: 'HTML', file: 'article.html'}]});
        // K (A6)
        await mk('K', (p) => ({context: base(p, 'article fee'), publishingMode: 'subscription', payments: {...PAY, purchaseArticleFee: 5},
            users: [U(p, 'mg', 'manager'), U(p, 'rd', 'reader'), U(p, 'au', 'author')], issues: pubIssue}));
        await sub('K', 'k1', {issue: {volume: 1, number: 1, year: 2026}, published: true});
        S.seeded = true;
        save();
    }
    if (isOJS && !S.seeded) { log('not seeded'); return; }

    const {page, close} = await launch(app);
    page.on('dialog', (d) => { log('browser dialog', d.type(), d.message()); (S.dialogs ||= []).push({type: d.type(), message: d.message()}); d.accept().catch(() => {}); });
    let who = 'visitor';
    const cUrl = (ctx, p) => app.url(`/index.php/${ctx}${p}`);
    async function snap(name, extra = {}) {
        let s;
        try { s = await screen(page); } catch (e) { s = {url: page.url(), error: String(e.message).slice(0, 200)}; }
        Object.assign(s, extra, {who});
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
    const as = async (user, ctx) => { await signIn(page, user, {contextPath: ctx}); await idle(page).catch(() => {}); who = user; };
    const visitor = async () => { await signOut(page).catch(() => {}); who = 'visitor'; };
    const W = () => page.locator('[role="dialog"]:visible').last();
    async function land(url, name, extra = {}) {
        const chain = [];
        const onResp = (r) => { try { if (r.request().isNavigationRequest() && r.frame() === page.mainFrame()) chain.push({url: r.url().replace(app.baseURL, ''), status: r.status()}); } catch (e) { /* none */ } };
        page.on('response', onResp);
        const resp = await page.goto(url.startsWith('http') ? url : app.url(url)).catch((e) => ({err: String(e.message).slice(0, 200)}));
        await idle(page).catch(() => {});
        page.off('response', onResp);
        return landInfo(name, resp, chain, extra);
    }
    async function landInfo(name, resp, chain, extra = {}) {
        const body = await page.locator('body').innerText().catch(() => '');
        const d = {
            status: resp && typeof resp.status === 'function' ? resp.status() : (resp && resp.err) || null,
            finalUrl: page.url().replace(app.baseURL, ''), chain, title: await page.title().catch(() => null),
            h1: (await page.locator('h1').allInnerTexts().catch(() => [])).map((x) => flat(x, 120)), denied: DENIED.test(body),
            login: /\/login(\?|$|\/)/.test(page.url()), pdf: await page.locator('iframe, #pdfCanvasContainer, .galley_view').count().catch(() => 0),
            bodyStart: flat(body, 400),
        };
        if (name) await snap(name, {landing: d, ...extra});
        return d;
    }
    const brief = (d) => d && ({status: d.status, finalUrl: d.finalUrl, h1: d.h1, denied: d.denied, login: d.login, pdf: d.pdf, title: d.title,
        body: (d.denied || d.status !== 200) ? d.bodyStart : undefined});
    /** Press a link and follow where it lands (the redirect chain included). */
    async function press(locator, name) {
        const chain = [];
        const onResp = (r) => { try { if (r.request().isNavigationRequest() && r.frame() === page.mainFrame()) chain.push({url: r.url().replace(app.baseURL, ''), status: r.status()}); } catch (e) { /* none */ } };
        page.on('response', onResp);
        const href = await locator.getAttribute('href').catch(() => null);
        await Promise.all([page.waitForLoadState('load').catch(() => {}), locator.click({timeout: 10_000}).catch((e) => chain.push({clickErr: String(e.message).slice(0, 120)}))]);
        await page.waitForTimeout(300);
        await idle(page).catch(() => {});
        page.off('response', onResp);
        const d = await landInfo(name, null, chain);
        d.href = href && href.replace(app.baseURL, '');
        return d;
    }
    /** The editorial side menu (PrimeVue panelmenu): every group with its items, read without clicking. */
    async function readNav() {
        const nav = page.getByRole('navigation', {name: 'Site Navigation'});
        if (!(await nav.count().catch(() => 0))) return {present: false};
        const items = await nav.evaluate((n) => [...n.querySelectorAll('a, [role="treeitem"], [role="button"]')].map((e) => (e.getAttribute('aria-label') || e.textContent || '').replace(/\s+/g, ' ').trim()).filter(Boolean)).catch(() => []);
        const uniq = [...new Set(items)];
        return {present: true, payments: uniq.some((x) => /^Payments$/.test(x)), institutions: uniq.some((x) => /^Institutions$/.test(x)), items: uniq.slice(0, 60)};
    }
    // ---- legacy grid helpers
    async function readGrid(scope) {
        return scope.evaluate((root) => [...root.querySelectorAll('table')].filter((t) => t.getClientRects().length).map((t) => ({
            columns: [...t.querySelectorAll('thead th')].map((th) => th.innerText.trim()),
            rows: [...t.querySelectorAll('tbody tr')].filter((tr) => tr.getClientRects().length && !tr.classList.contains('row_controls') && !/control-row/.test(tr.id))
                .map((tr) => ({id: tr.id, cells: [...tr.querySelectorAll('td')].map((td) => td.innerText.replace(/\s+/g, ' ').trim())})),
        }))).catch((e) => [{err: String(e.message).slice(0, 200)}]);
    }
    const gridRow = (scope, text) => scope.locator('tr.gridRow').filter({hasText: text}).first();
    async function rowActions(row) {
        const id = await row.getAttribute('id');
        const arrow = row.locator('a.show_extras').first();
        if (await arrow.count()) { await arrow.click(); await sleep(400); }
        const ctl = page.locator(`[id="${id}-control-row"]`);
        const links = await ctl.locator('a').evaluateAll((els) => els.filter((e) => e.getClientRects().length).map((e) => e.innerText.trim())).catch(() => []);
        return {id, links, ctl};
    }
    async function paymentsTab(ctx, name) {
        await page.goto(cUrl(ctx, '/payments')); await idle(page);
        if (name) { await page.getByRole('tab', {name, exact: true}).click(); await idle(page); await sleep(300); }
        const panel = page.getByRole('tabpanel', {name: name || 'Individual Subscriptions'});
        await panel.locator('table, form').first().waitFor({timeout: T}).catch(() => {});
        await idle(page);
        return panel;
    }
    async function notices() {
        return page.evaluate(() => {
            const vis = (e) => e.getClientRects().length;
            return [...document.querySelectorAll('.pkp_notification, .pkpNotification, [role="alert"], [role="status"], .ui-pnotify, .pnotify, .pkp_form_error, label.error, .error')]
                .filter(vis).map((e) => e.innerText.replace(/\s+/g, ' ').trim()).filter(Boolean);
        }).catch(() => []);
    }
    /** Watch the requests an action sends (non-GET, grid fetches aside) and what they answer. */
    function watch(re) {
        const posts = [];
        const onReq = (r) => { if (r.method() !== 'GET' && re.test(r.url())) posts.push({url: r.url().replace(/^.*\$\$\$call\$\$\$/, ''), method: r.method()}); };
        const onResp = async (r) => {
            if (r.request().method() !== 'GET' && re.test(r.url())) {
                let body = null; try { body = flat(await r.text(), 400); } catch (e) { /* none */ }
                posts.push({resp: r.status(), url: r.url().replace(/^.*\$\$\$call\$\$\$/, ''), body});
            }
        };
        page.on('request', onReq); page.on('response', onResp);
        return {posts, stop: () => { page.off('request', onReq); page.off('response', onResp); }};
    }
    async function savedNotice(ms = 4000) {
        const end = Date.now() + ms;
        let seen = [];
        while (Date.now() < end) {
            seen = await notices();
            if (seen.some((x) => /changes have been saved/i.test(x))) break;
            await sleep(250);
        }
        return seen;
    }
    /** Every notice seen while polling for `ms` (a toast can come and go in between). */
    async function collectNotices(ms = 5000) {
        const seen = new Set();
        const end = Date.now() + ms;
        while (Date.now() < end) { for (const x of await notices()) seen.add(x); await sleep(150); }
        return [...seen];
    }
    async function openWindow(linkName) {
        await page.getByRole('link', {name: linkName, exact: true}).first().click();
        await W().locator('form').first().waitFor({timeout: T}).catch(() => {});
        await idle(page); await sleep(500);
        return W();
    }
    const winText = async () => flat(await W().innerText().catch(() => null), 2500);
    async function closeWindow() {
        const w = W();
        if (!(await w.count())) return;
        const c = w.getByRole('button', {name: 'Close', exact: true}).first();
        if (await c.count()) await c.click().catch(() => {}); else await page.keyboard.press('Escape');
        await sleep(700); await idle(page).catch(() => {});
    }
    async function pickUser(w, username, id) {
        const sb = w.getByRole('searchbox', {name: 'Search'}).first();
        if (await sb.count()) {
            await sb.fill(username); await sb.press('Enter');
            await idle(page); await sleep(700);
        }
        const r = w.locator(`#user_${id}, input[type="radio"][value="${id}"]`).first();
        await r.check({timeout: 10_000});
    }
    async function setDate(w, which, value) {
        const box = w.locator(`[name="${which}-removed"]`).first();
        if (await box.count()) { await box.fill(value); await page.keyboard.press('Escape').catch(() => {}); }
        else await w.locator(`[name="${which}"]`).first().fill(value);
        await sleep(150);
    }
    async function typeOption(w, prefix) {
        const opts = (await w.locator('[name="typeId"] option').allInnerTexts()).map((o) => o.trim());
        return opts.find((o) => o.startsWith(prefix));
    }
    /** Fill and save the subscription window; returns what the save did. */
    async function saveSub(w, s, name) {
        if (s.user) await pickUser(w, s.user, s.userId);
        if (s.type) await w.locator('[name="typeId"]').selectOption({label: await typeOption(w, `${s.type} - `)});
        if (s.status) await w.locator('[name="status"]').selectOption({label: s.status});
        if (s.start !== undefined) await setDate(w, 'dateStart', s.start);
        if (s.end !== undefined) await setDate(w, 'dateEnd', s.end);
        if (s.membership !== undefined) await w.locator('[name="membership"]').fill(s.membership);
        if (s.ref) await w.locator('[name="referenceNumber"]').fill(s.ref);
        if (s.institution) await w.locator('[name="institutionId"]').selectOption({label: s.institution});
        if (s.domain !== undefined) await w.locator('[name="domain"]').fill(s.domain);
        if (s.notify) await w.locator('[name="notifyEmail"]').check();
        const wt = watch(/update-subscription/);
        await w.getByRole('button', {name: 'Save'}).first().click();
        const seen = await collectNotices(4500);
        await idle(page).catch(() => {});
        wt.stop();
        const open = await W().count() > 0 && await W().locator('form').count() > 0;
        const out = {posts: wt.posts, windowOpen: open, notices: seen, windowText: open ? await winText() : null};
        await snap(name, {save: out});
        return out;
    }
    const isOpenGalley = (d) => d && !d.login && !d.denied && /\/view\/\d+\/\d+/.test(d.finalUrl);
    async function galleyLinks(scopeSel = 'body') {
        return page.locator(scopeSel).first().evaluate((root) => [...root.querySelectorAll('a.obj_galley_link, a.obj_galley_link_supplementary')].map((a) => ({
            text: a.innerText.replace(/\s+/g, ' ').trim(), cls: a.className, href: a.getAttribute('href')}))).catch(() => []);
    }
    /** Open the article page, read its title/abstract/galley links, then press the named galley. */
    async function articleAndGalley(ctx, subId, label, key) {
        const art = await land(`/index.php/${ctx}/article/view/${subId}`, `${key}-article`);
        const r = {article: {status: art.status, finalUrl: art.finalUrl, h1: art.h1, login: art.login, denied: art.denied},
            abstract: await page.locator('.item.abstract, section.abstract').count().catch(() => 0), links: await galleyLinks()};
        const link = page.locator('a.obj_galley_link').filter({hasText: label}).first();
        if (await link.count()) r.press = brief(await press(link, `${key}-galley`));
        else r.press = {noLink: true};
        return r;
    }
    const issueId = (key, v, n, y) => (S.C[key].issues || []).find((i) => String(i.volume) === String(v) && String(i.number) === String(n) && String(i.year) === String(y))?.id;
    async function issuePageLinks(ctx, id, key) {
        const d = await land(`/index.php/${ctx}/issue/view/${id}`, key);
        return {status: d.status, finalUrl: d.finalUrl, links: await galleyLinks(), block: flat(await page.locator('.block_subscription, .pkp_block.block_subscription').first().innerText().catch(() => null), 300)};
    }

    // ================================================================== absence (all apps; OMP/OPS absence, OJS control)
    if (on('absence')) await sect('absence', async () => {
        const out = {};
        const ctx = 'publicknowledge';
        await as('manager.maya', ctx);
        await page.goto(cUrl(ctx, '/dashboard/editorial')); await idle(page);
        out.nav = await readNav();
        await snap('ab-01-manager-nav', {nav: out.nav});
        for (const [k, p] of [['payments', '/payments'], ['subsPage', '/about/subscriptions'], ['mySubs', '/user/subscriptions'], ['policies', '/payments/subscriptionPolicies']]) {
            out[`mgr_${k}`] = brief(await land(`/index.php/${ctx}${p}`, `ab-02-manager-${k}`));
        }
        if (!isOJS) {
            // the role key: an unknown key answers 400 before anything is made (users.md section 2)
            try {
                await app.api.createContext({tag: tag('u51k1ab'), users: [{username: `${tag('u51k1x')}sm`, roles: ['subscriptionManager']}]});
                out.smKey = 'accepted';
            } catch (e) { out.smKey = flat(String(e.message), 600); }
            // a scratch context's Distribution tabs as its manager
            const t = tag('u51k1ab');
            try {
                const r = await app.api.createContext({tag: t, users: [{username: `${t}mg`, roles: ['manager']}]});
                await as(`${t}mg`, r.path || t);
                await page.goto(cUrl(r.path || t, '/management/settings/distribution')); await idle(page);
                out.distTabs = (await page.getByRole('tab').allInnerTexts().catch(() => [])).map((x) => x.trim());
                await snap('ab-03-scratch-distribution', {tabs: out.distTabs});
                const accessTab = page.getByRole('tab', {name: 'Access', exact: true});
                if (await accessTab.count()) {
                    await accessTab.click(); await idle(page);
                    const panel = page.getByRole('tabpanel', {name: 'Access'});
                    out.access = flat(await panel.innerText().catch(() => null), 800);
                    await snap('ab-04-scratch-access');
                    if (app.name === 'ops') {
                        const radios = panel.getByRole('radio');
                        out.opsRadios = await radios.evaluateAll((els) => els.map((e) => ({checked: e.checked, label: (e.closest('label') || e.parentElement).innerText.trim()})));
                        const second = radios.nth(1);
                        if (await second.count()) {
                            await second.check();
                            await panel.getByRole('button', {name: 'Save', exact: true}).click();
                            await page.locator('[role="status"]:has-text("Saved")').first().waitFor({timeout: 8000}).catch(() => {});
                            out.opsSaved = flat(await panel.locator('[role="status"]').allInnerTexts().catch(() => []).then((a) => a.join(' | ')), 200);
                            await page.reload(); await idle(page);
                            await page.getByRole('tab', {name: 'Access', exact: true}).click(); await idle(page);
                            out.opsRadiosAfter = await page.getByRole('tabpanel', {name: 'Access'}).getByRole('radio').evaluateAll((els) => els.map((e) => e.checked));
                            await snap('ab-05-ops-posting-mode-after-save', {after: out.opsRadiosAfter});
                        }
                    }
                }
                const payTab = page.getByRole('tab', {name: 'Payments', exact: true});
                if (await payTab.count()) {
                    await payTab.click(); await idle(page);
                    out.payTab = flat(await page.getByRole('tabpanel', {name: 'Payments'}).innerText().catch(() => null), 600);
                    await snap('ab-06-scratch-payments-tab');
                }
                out.scratchPayments = brief(await land(`/index.php/${r.path || t}/payments`, 'ab-07-scratch-payments-url'));
            } catch (e) { out.scratch = flat(String(e.message), 400); }
        }
        await as('reader.rosa', ctx);
        out.reader_mySubs = brief(await land(`/index.php/${ctx}/user/subscriptions`, 'ab-08-reader-mysubs'));
        out.reader_payments = brief(await land(`/index.php/${ctx}/payments`, 'ab-09-reader-payments'));
        await visitor();
        out.visitor_subsPage = brief(await land(`/index.php/${ctx}/about/subscriptions`, 'ab-10-visitor-subspage'));
        fact('absence', out);
    });
    if (!isOJS) { await close(); return; }
    const C = S.C;
    const P = (k) => C[k].path;

    // ================================================================== roles (Actors rows 1–3; td2)
    if (on('roles')) await sect('roles', async () => {
        const out = {A: {}, B: {}, E: {}};
        const driveRole = async (key, user, ctx, extra) => {
            const r = {};
            if (user) {
                await as(user, ctx);
                r.landing = page.url().replace(app.baseURL, '');
                await page.goto(cUrl(ctx, '/submissions')).catch(() => {}); await idle(page).catch(() => {});
                r.nav = await readNav();
            } else await visitor();
            r.payments = brief(await land(`/index.php/${ctx}/payments`, `ro-${key}-payments`));
            r.tabs = (await page.getByRole('tab').allInnerTexts().catch(() => [])).map((x) => x.trim());
            if (extra) Object.assign(r, await extra(r));
            return r;
        };
        // A: payments off, every role
        const aExtra = async () => ({
            distribution: brief(await land(`/index.php/${P('A')}/management/settings/distribution`, null)),
            manageIssues: brief(await land(`/index.php/${P('A')}/manageIssues`, null)),
        });
        out.A.visitor = await driveRole('A-visitor', null, P('A'));
        out.A.admin = await driveRole('A-admin', 'admin', P('A'), aExtra);
        for (const [k] of ROLE_KEYS) out.A[k] = await driveRole(`A-${k}`, `${C.A.p}${k}`, P('A'), aExtra);
        // B: payments set up — the side menu and each tab's content for the manager-level roles and the SM
        const tabsWork = async () => {
            const res = {};
            for (const tb of ['Individual Subscriptions', 'Institutional Subscriptions', 'Subscription Types', 'Subscription Policies', 'Payment Types', 'Payments']) {
                const wt = watch(/./);
                const tab = page.getByRole('tab', {name: tb, exact: true});
                if (!(await tab.count())) { res[tb] = 'no tab'; continue; }
                await tab.click(); await idle(page); await sleep(400);
                wt.stop();
                res[tb] = flat(await page.getByRole('tabpanel', {name: tb}).innerText().catch(() => null), 160);
            }
            return {tabsWork: res};
        };
        out.B.visitor = await driveRole('B-visitor', null, P('B'));
        for (const k of ['admin', 'mg', 'ed', 'pe', 'sm', 'se', 'ce', 'au', 'rd']) {
            out.B[k] = await driveRole(`B-${k}`, k === 'admin' ? 'admin' : `${C.B.p}${k}`, P('B'), ['admin', 'mg', 'ed', 'pe', 'sm'].includes(k) ? tabsWork : null);
            if (k === 'sm') await snap('ro-B-sm-last-tab');
        }
        // E: payments enabled, not set up
        for (const k of ['mg', 'sm', 'se']) out.E[k] = await driveRole(`E-${k}`, `${C.E.p}${k}`, P('E'));
        fact('roles', out);
    });

    // ================================================================== smgr (td3: the Subscription Manager's sign-in)
    if (on('smgr')) await sect('smgr', async () => {
        const out = {};
        for (const key of ['B', 'A', 'E']) {
            await visitor();
            await page.goto(cUrl(P(key), '/en/login')); await idle(page);
            await page.locator('input[name="username"]').fill(`${C[key].p}sm`);
            await page.locator('input[name="password"]').evaluate((e) => e.removeAttribute('maxlength'));
            await page.locator('input[name="password"]').fill(`${C[key].p}sm${C[key].p}sm`);
            await Promise.all([page.waitForURL((u) => !u.pathname.includes('/login'), {timeout: 15_000}).catch(() => {}), page.getByRole('button', {name: /Login|Log In|Sign in/i}).first().click()]);
            await idle(page).catch(() => {});
            who = `${C[key].p}sm`;
            const d = await landInfo(`sm-${key}-landing`, null, []);
            out[key] = {landing: brief(d), nav: await readNav(), header: flat(await page.locator('header').first().innerText().catch(() => null), 300)};
            out[key].payments = brief(await land(`/index.php/${P(key)}/payments`, `sm-${key}-payments`));
            out[key].paymentsTabs = (await page.getByRole('tab').allInnerTexts().catch(() => [])).map((x) => x.trim());
            out[key].navOnPayments = await readNav();
            out[key].dashboard = brief(await land(`/index.php/${P(key)}/dashboard/editorial`, `sm-${key}-dashboard`));
            out[key].institutions = brief(await land(`/index.php/${P(key)}/management/settings/institutions`, `sm-${key}-institutions`));
            out[key].submissions = brief(await land(`/index.php/${P(key)}/submissions`, `sm-${key}-submissions`));
        }
        fact('smgr', out);
    });

    // ================================================================== galleys (td9 on A; payments set up end on B; A5; A7)
    if (on('galleys')) await sect('galleys', async () => {
        const out = {A: {}, B: {}};
        const a1 = S.s['A.a1']; const b1 = S.s['B.b1'];
        const aIss = issueId('A', 1, 1, 2026); const bIss = issueId('B', 1, 1, 2026);
        const drive = async (key, ctx, user, sub, iss) => {
            if (user) await as(user, ctx); else await visitor();
            const r = await articleAndGalley(ctx, sub.id, 'PDF', `ga-${key}`);
            r.issue = await issuePageLinks(ctx, iss, `ga-${key}-issue`);
            return r;
        };
        out.A.visitor = await drive('A-visitor', P('A'), null, a1, aIss);
        out.A.admin = await drive('A-admin', P('A'), 'admin', a1, aIss);
        for (const [k] of ROLE_KEYS) out.A[k] = await drive(`A-${k}`, P('A'), `${C.A.p}${k}`, a1, aIss);
        for (const k of [null, 'rd', 'act', 'mg']) out.B[k || 'visitor'] = await drive(`B-${k || 'visitor'}`, P('B'), k && `${C.B.p}${k}`, b1, bIss);
        fact('galleys', out);
    });

    // ================================================================== pages (Actors rows 5–6: the "Subscriptions" page and "My Subscriptions")
    if (on('pages')) await sect('pages', async () => {
        const out = {};
        for (const key of ['A', 'E', 'B', 'G']) {
            await visitor();
            out[`${key}_visitor_subs`] = brief(await land(`/index.php/${P(key)}/about/subscriptions`, `pg-${key}-visitor-subs`));
            out[`${key}_visitor_my`] = brief(await land(`/index.php/${P(key)}/user/subscriptions`, `pg-${key}-visitor-my`));
            await as(`${C[key].p}${C[key].users.rd ? 'rd' : 'r1'}`, P(key));
            out[`${key}_reader_subs`] = brief(await land(`/index.php/${P(key)}/about/subscriptions`, `pg-${key}-reader-subs`));
            out[`${key}_reader_my`] = brief(await land(`/index.php/${P(key)}/user/subscriptions`, `pg-${key}-reader-my`));
            out[`${key}_reader_my_text`] = flat(await page.locator('.page, main, body').first().innerText().catch(() => null), 900);
        }
        // B: a subscriber's "My Subscriptions" (the buttons)
        await as(`${C.B.p}act`, P('B'));
        out.B_act_my = brief(await land(`/index.php/${P('B')}/user/subscriptions`, 'pg-B-act-my'));
        out.B_act_my_text = flat(await page.locator('.page, main, body').first().innerText().catch(() => null), 900);
        fact('pages', out);
    });

    // ================================================================== paypage (the "Payments" page: tabs, lists, search forms, row actions, windows)
    if (on('paypage')) await sect('paypage', async () => {
        const out = {};
        await as(`${C.B.p}mg`, P('B'));
        let panel = await paymentsTab(P('B'));
        const s0 = await snap('pp-01-payments-landing');
        out.h1 = await page.locator('main h1').allInnerTexts().catch(() => []);
        out.tabs = (await page.getByRole('tab').allInnerTexts()).map((x) => x.trim());
        out.selected = flat(await page.locator('[role=tab][aria-selected="true"]').first().innerText().catch(() => null), 80);
        out.title = s0.title;
        for (const tb of ['Individual Subscriptions', 'Institutional Subscriptions']) {
            panel = await paymentsTab(P('B'), tb);
            const k = tb.startsWith('Ind') ? 'ind' : 'inst';
            out[`${k}_heading`] = await panel.locator('h1,h2,h3,h4').allInnerTexts().catch(() => []);
            out[`${k}_actionsAbove`] = (await panel.locator('ul.actions a, .pkp_linkActions a').allInnerTexts().catch(() => [])).map((x) => flat(x, 60));
            out[`${k}_grid`] = await readGrid(panel);
            await snap(`pp-02-${k}-list`);
            // the search form
            const sLink = panel.getByRole('link', {name: /Search/}).first();
            if (await sLink.count()) { await sLink.click(); await sleep(500); }
            out[`${k}_searchForm`] = {
                fields: await panel.locator('select[name="searchField"] option').allInnerTexts().catch(() => []),
                match: await panel.locator('select[name="searchMatch"] option').allInnerTexts().catch(() => []),
                box: await panel.locator('input[name="search"]').count(),
                button: await panel.getByRole('button', {name: 'Search'}).count(),
                label: flat(await panel.locator('form.filter').first().innerText().catch(() => null), 200),
            };
            await snap(`pp-03-${k}-search-form`);
            await loc(page, `Payments › ${tb}: the search field list`, panel.locator('select[name="searchField"]'));
        }
        // row actions: expiring (act), non-expiring (for), institutional
        panel = await paymentsTab(P('B'), 'Individual Subscriptions');
        for (const who2 of ['Koneact', 'Konefor']) {
            const row = gridRow(panel, who2);
            const ra = await rowActions(row);
            out[`rowActions_${who2}`] = ra.links;
            await snap(`pp-04-row-actions-${who2}`);
        }
        await loc(page, 'Individual Subscriptions: a row\'s arrow (a.show_extras)', gridRow(panel, 'Koneact').locator('a.show_extras'));
        // the Edit window of act
        panel = await paymentsTab(P('B'), 'Individual Subscriptions');
        let ra = await rowActions(gridRow(panel, 'Koneact'));
        await ra.ctl.getByRole('link', {name: 'Edit', exact: true}).click();
        await W().locator('form').first().waitFor({timeout: T}); await idle(page); await sleep(800);
        let w = W();
        out.editWindow = {
            title: flat(await w.locator('h1').first().innerText().catch(() => null), 100),
            text: await winText(),
            checkedUser: await w.locator('input[type="radio"]:checked').evaluateAll((els) => els.map((e) => e.id)).catch(() => []),
            usersListed: await w.locator('input[type="radio"]').count(),
            searchValue: await w.getByRole('searchbox').first().inputValue().catch(() => null),
            roleOptions: (await w.locator('select[name="userGroup"] option').allInnerTexts().catch(() => [])).slice(0, 5),
            typeOptions: await w.locator('[name="typeId"] option').allInnerTexts(),
            statusOptions: await w.locator('[name="status"] option').allInnerTexts(),
            statusSelected: await w.locator('[name="status"]').evaluate((s) => s.options[s.selectedIndex]?.text),
            dates: {start: await w.locator('[name="dateStart"]').inputValue().catch(() => null), end: await w.locator('[name="dateEnd"]').inputValue().catch(() => null),
                startBox: await w.locator('[name="dateStart-removed"]').inputValue().catch(() => null)},
            notify: await w.locator('[name="notifyEmail"]').isChecked().catch(() => null),
            labels: await w.locator('label, .label, legend').allInnerTexts().catch(() => []),
            ref: await w.locator('[name="referenceNumber"]').inputValue().catch(() => null),
        };
        await snap('pp-05-edit-window');
        // the date picker
        await w.locator('[name="dateStart-removed"]').click().catch(() => {});
        await sleep(400);
        out.datePicker = await page.locator('#ui-datepicker-div').isVisible().catch(() => null);
        await page.keyboard.press('Escape').catch(() => {});
        // leave with something changed: type in Reference Number, then Close
        await w.locator('[name="referenceNumber"]').fill('REF-CHANGED-UNSAVED');
        await w.locator('[name="referenceNumber"]').blur();
        S.dialogs = [];
        await closeWindow();
        out.leaveEditWindow = {dialogs: S.dialogs.slice(), windowOpen: await W().count()};
        await snap('pp-06-after-close-changed-window');
        panel = await paymentsTab(P('B'), 'Individual Subscriptions');
        out.refAfterLeave = (await readGrid(panel))[0]?.rows?.find((r) => r.cells.join(' ').includes('Koneact'))?.cells;
        // Create New Subscription (individual): the empty window
        w = await openWindow('Create New Subscription');
        out.createInd = {text: await winText(), typeOptions: await w.locator('[name="typeId"] option').allInnerTexts(), notify: await w.locator('[name="notifyEmail"]').isChecked().catch(() => null),
            checkedUser: await w.locator('input[type="radio"]:checked').count(), required: await w.locator('.required, [required]').evaluateAll((els) => els.map((e) => e.getAttribute('name') || e.innerText).slice(0, 20))};
        await snap('pp-07-create-individual-window');
        await closeWindow();
        // institutional: the list, row actions and windows
        panel = await paymentsTab(P('B'), 'Institutional Subscriptions');
        ra = await rowActions(gridRow(panel, 'Far Library'));
        out.rowActions_inst = ra.links;
        await ra.ctl.getByRole('link', {name: 'Edit', exact: true}).click();
        await W().locator('form').first().waitFor({timeout: T}); await idle(page); await sleep(800);
        w = W();
        out.editInst = {text: await winText(), typeOptions: await w.locator('[name="typeId"] option').allInnerTexts(),
            institutionOptions: await w.locator('[name="institutionId"] option').allInnerTexts().catch(() => []),
            domain: await w.locator('[name="domain"]').inputValue().catch(() => null), membership: await w.locator('[name="membership"]').count()};
        await snap('pp-08-edit-institutional-window');
        await closeWindow();
        // types list + row actions + the Edit window of an institutional type
        panel = await paymentsTab(P('B'), 'Subscription Types');
        out.types_grid = await readGrid(panel);
        out.types_heading = await panel.locator('h1,h2,h3,h4').allInnerTexts().catch(() => []);
        out.types_actionsAbove = (await panel.locator('ul.actions a, .pkp_linkActions a').allInnerTexts().catch(() => [])).map((x) => flat(x, 60));
        await snap('pp-09-types-list');
        ra = await rowActions(gridRow(panel, 'K1 Campus'));
        out.types_rowActions = ra.links;
        await ra.ctl.getByRole('link', {name: 'Edit', exact: true}).click();
        await W().locator('form').first().waitFor({timeout: T}); await idle(page); await sleep(800);
        w = W();
        out.editTypeCampus = {title: flat(await w.locator('h1').first().innerText().catch(() => null), 100), text: await winText(),
            radios: await w.locator('input[name="institutional"]').evaluateAll((els) => els.map((e) => ({v: e.value, checked: e.checked, disabled: e.disabled}))),
            membership: await w.locator('input[name="membership"]').evaluate((e) => ({checked: e.checked, disabled: e.disabled})).catch(() => null),
            formatOptions: await w.locator('[name="format"] option').allInnerTexts().catch(() => []),
            currencySelected: await w.locator('[name="currency"]').inputValue().catch(() => null), cost: await w.locator('[name="cost"]').inputValue().catch(() => null)};
        await snap('pp-10-edit-type-institutional');
        await closeWindow();
        fact('paypage', out);
    });

    // ================================================================== policies (td14 on A fresh; A3; Rule 24; Rule 25 on A/E/B; A15)
    if (on('policies')) await sect('policies', async () => {
        const out = {};
        const readPolicies = async (panel) => panel.evaluate((root) => {
            const f = root.querySelector('form') || root;
            const vals = [...f.querySelectorAll('input, select, textarea')].filter((e) => e.type !== 'hidden').map((e) => ({
                name: e.name, type: e.type, value: e.tagName === 'SELECT' ? e.options[e.selectedIndex]?.text : e.value, checked: e.checked, disabled: e.disabled, required: e.required}));
            const selects = Object.fromEntries([...f.querySelectorAll('select')].map((s) => [s.name, [...s.options].map((o) => o.text)]));
            const labels = [...f.querySelectorAll('label, legend, .label, p')].map((e) => e.innerText.replace(/\s+/g, ' ').trim()).filter(Boolean);
            return {vals, selects, labels};
        });
        await as(`${C.A.p}mg`, P('A'));
        let panel = await paymentsTab(P('A'), 'Subscription Policies');
        await panel.locator('[name="subscriptionName"]').waitFor({timeout: T});
        out.A_fresh = await readPolicies(panel);
        out.A_text = flat(await panel.innerText(), 3000);
        await snap('po-01-A-fresh-policies');
        await loc(page, 'Subscription Policies: "Name" box', panel.locator('[name="subscriptionName"]'));
        // Save with everything empty
        let wt = watch(/saveSubscriptionPolicies/);
        await panel.getByRole('button', {name: 'Save', exact: true}).click();
        await sleep(1500);
        out.A_saveEmpty = {notices: await savedNotice(3000), posts: null};
        wt.stop(); out.A_saveEmpty.posts = wt.posts;
        await snap('po-02-A-save-empty');
        panel = await paymentsTab(P('A'), 'Subscription Policies');
        out.A_afterEmptySave = (await readPolicies(panel)).vals.filter((v) => /subscription(Name|Email|MailingAddress)|Expiry/.test(v.name));
        // malformed email
        await panel.locator('[name="subscriptionEmail"]').fill('sub@');
        wt = watch(/saveSubscriptionPolicies/);
        await panel.getByRole('button', {name: 'Save', exact: true}).click();
        await sleep(1500);
        out.A_badEmail = {notices: await notices(), text: flat(await panel.innerText(), 1500)};
        wt.stop(); out.A_badEmail.posts = wt.posts;
        out.A_badEmail.validity = await panel.locator('[name="subscriptionEmail"]').evaluate((e) => ({valid: e.checkValidity(), msg: e.validationMessage})).catch(() => null);
        await snap('po-03-A-bad-email');
        // other end: the server's own check (the browser's type=email check lets "sub@x" through)
        await panel.locator('[name="subscriptionEmail"]').fill('sub@x');
        wt = watch(/saveSubscriptionPolicies/);
        await panel.getByRole('button', {name: 'Save', exact: true}).click();
        await sleep(1500);
        out.A_badEmail2 = {notices: await notices(), text: flat(await panel.innerText(), 1500)};
        wt.stop(); out.A_badEmail2.posts = wt.posts;
        await snap('po-04-A-bad-email-2');
        // leave the tab with an unsaved change
        panel = await paymentsTab(P('A'), 'Subscription Policies');
        await panel.locator('[name="subscriptionPhone"]').fill('555-UNSAVED');
        await panel.locator('[name="subscriptionPhone"]').blur();
        S.dialogs = [];
        await page.getByRole('tab', {name: 'Subscription Types', exact: true}).click(); await idle(page); await sleep(600);
        out.A_leaveTab = {dialogs: S.dialogs.slice(), selected: flat(await page.locator('[role=tab][aria-selected="true"]').first().innerText().catch(() => null), 80)};
        await page.getByRole('tab', {name: 'Subscription Policies', exact: true}).click(); await idle(page); await sleep(600);
        out.A_leaveTab.phoneBack = await page.getByRole('tabpanel', {name: 'Subscription Policies'}).locator('[name="subscriptionPhone"]').inputValue().catch(() => null);
        await snap('po-05-A-leave-tab-unsaved');
        S.dialogs = [];
        await page.getByRole('tabpanel', {name: 'Subscription Policies'}).locator('[name="subscriptionPhone"]').fill('555-UNSAVED-2');
        await page.getByRole('tabpanel', {name: 'Subscription Policies'}).locator('[name="subscriptionPhone"]').blur();
        await page.goto(cUrl(P('A'), '/submissions')).catch(() => {}); await idle(page).catch(() => {});
        out.A_leavePage = {dialogs: S.dialogs.slice(), url: page.url().replace(app.baseURL, '')};
        // E (enabled, not set up) and B (set up): the four payment boxes
        for (const key of ['E', 'B']) {
            await as(`${C[key].p}mg`, P(key));
            panel = await paymentsTab(P(key), 'Subscription Policies');
            await panel.locator('[name="subscriptionName"]').waitFor({timeout: T});
            const r = await readPolicies(panel);
            out[`${key}_boxes`] = r.vals.filter((v) => /Notification/.test(v.name));
            out[`${key}_note`] = r.labels.filter((l) => /Note:|enable these options/i.test(l));
            await snap(`po-06-${key}-policies`);
        }
        // B: tick one payment box and save; the page comes back with it
        panel = await paymentsTab(P('B'), 'Subscription Policies');
        await panel.locator('[name="enableSubscriptionOnlinePaymentNotificationPurchaseIndividual"]').check();
        await panel.getByRole('button', {name: 'Save', exact: true}).click();
        out.B_tickSave = await savedNotice(4000);
        panel = await paymentsTab(P('B'), 'Subscription Policies');
        out.B_afterTick = await panel.locator('[name="enableSubscriptionOnlinePaymentNotificationPurchaseIndividual"]').isChecked();
        // A15: the lists' first choices and the Distribution "Delayed Open Access" list
        out.A15 = {policySelects: out.A_fresh.selects};
        await page.goto(cUrl(P('B'), '/management/settings/distribution')); await idle(page);
        await page.getByRole('tab', {name: 'Access', exact: true}).click(); await idle(page);
        out.A15.delayed = (await page.getByRole('tabpanel', {name: 'Access'}).getByRole('combobox', {name: 'Delayed Open Access'}).locator('option').allInnerTexts().catch(() => [])).slice(0, 4);
        await snap('po-07-B-access-tab');
        fact('policies', out);
    });

    // ================================================================== policies2 (the server's email check once the browser's pass; a whole save; a type save's notice)
    if (on('policies2')) await sect('policies2', async () => {
        const out = {};
        await as(`${C.E.p}mg`, P('E'));
        let panel = await paymentsTab(P('E'), 'Subscription Policies');
        await panel.locator('[name="subscriptionName"]').fill('K1 E Desk');
        await panel.locator('[name="subscriptionMailingAddress"]').fill('3 E Street');
        for (const [k, v] of [['bad1', 'sub@'], ['bad2', 'sub@x'], ['bad3', 'sub@@x.org'], ['good', `${C.E.p}desk@mail.test`]]) {
            await panel.locator('[name="subscriptionEmail"]').fill(v);
            const wt = watch(/saveSubscriptionPolicies/);
            await panel.getByRole('button', {name: 'Save', exact: true}).click();
            const n = await collectNotices(4000);
            wt.stop();
            out[k] = {value: v, notices: n, posts: wt.posts, fieldMsgs: await panel.locator('label.error, .error').evaluateAll((els) => els.filter((e) => e.getClientRects().length).map((e) => e.innerText.trim()))};
            await snap(`p2-${k}`);
            panel = page.getByRole('tabpanel', {name: 'Subscription Policies'});
        }
        panel = await paymentsTab(P('E'), 'Subscription Policies');
        out.reloaded = {email: await panel.locator('[name="subscriptionEmail"]').inputValue(), name: await panel.locator('[name="subscriptionName"]').inputValue()};
        // a type save's notice, polled from the click on
        await as(`${C.H.p}mg`, P('H'));
        await paymentsTab(P('H'), 'Subscription Types');
        const w = await openWindow('Create New Subscription Type');
        await w.locator('[name="name[en]"]').fill('K1 T5');
        await w.locator('[name="currency"]').selectOption('USD');
        await w.locator('[name="cost"]').fill('5');
        await w.locator('[name="format"]').selectOption({label: 'Online'});
        await w.locator('[name="duration"]').fill('3');
        await w.getByRole('button', {name: 'Save'}).first().click();
        out.typeSaveNotices = await collectNotices(5000);
        await snap('p2-type-saved');
        fact('policies2', out);
    });

    // ================================================================== win0 (td11: the windows with no type and no institution, on A)
    if (on('win0')) await sect('win0', async () => {
        const out = {};
        await as(`${C.A.p}mg`, P('A'));
        for (const tb of ['Individual Subscriptions', 'Institutional Subscriptions']) {
            const k = tb.startsWith('Ind') ? 'ind' : 'inst';
            await paymentsTab(P('A'), tb);
            out[`${k}_list`] = await readGrid(page.getByRole('tabpanel', {name: tb}));
            const w = await openWindow('Create New Subscription');
            out[`${k}_onOpen`] = await winText();
            out[`${k}_typeOptions`] = await w.locator('[name="typeId"] option').allInnerTexts().catch(() => []);
            await snap(`w0-${k}-window-no-type`);
            const wt = watch(/update-subscription/);
            await w.getByRole('button', {name: 'Save'}).first().click();
            await sleep(1500); await idle(page).catch(() => {});
            wt.stop();
            out[`${k}_afterSave`] = {posts: wt.posts, text: await W().count() ? await winText() : 'closed'};
            await snap(`w0-${k}-window-no-type-saved`);
            await closeWindow();
        }
        fact('win0', out);
    });

    // ================================================================== types (td12, Rules 14–15, A2; the types made by screen on A)
    if (on('types')) await sect('types', async () => {
        const out = {};
        await as(`${C.A.p}mg`, P('A'));
        const openType = async () => { await paymentsTab(P('A'), 'Subscription Types'); return openWindow('Create New Subscription Type'); };
        const trySave = async (w, name) => {
            const wt = watch(/update-subscription-type/);
            await w.getByRole('button', {name: 'Save'}).first().click();
            const seen = await collectNotices(4500);
            await idle(page).catch(() => {});
            wt.stop();
            const open = await W().count() > 0 && await W().locator('form').count() > 0;
            const r = {posts: wt.posts, windowOpen: open, notices: seen,
                marks: open ? await W().locator('label.error, .error, .pkp_form_error').evaluateAll((els) => els.filter((e) => e.getClientRects().length).map((e) => e.innerText.trim()).filter(Boolean)) : []};
            await snap(name, {save: r});
            return r;
        };
        // 1. the empty window + empty name
        let w = await openType();
        out.window = {title: flat(await w.locator('h1').first().innerText().catch(() => null), 100), text: await winText(),
            currency: (await w.locator('[name="currency"] option').allInnerTexts()).slice(0, 5), currencyCount: await w.locator('[name="currency"] option').count(),
            format: await w.locator('[name="format"] option').allInnerTexts(), radios: await w.locator('input[name="institutional"]').evaluateAll((els) => els.map((e) => ({v: e.value, checked: e.checked, disabled: e.disabled}))),
            membership: await w.locator('input[name="membership"]').evaluate((e) => ({checked: e.checked, disabled: e.disabled})).catch(() => null)};
        await snap('ty-01-type-window');
        out.emptyAll = await trySave(w, 'ty-02-save-empty');
        // institutional radio greys the membership box
        await w.locator('input[name="institutional"][value="1"]').check();
        out.instGreysMembership = await w.locator('input[name="membership"]').evaluate((e) => ({checked: e.checked, disabled: e.disabled})).catch(() => null);
        await w.locator('input[name="institutional"][value="0"]').check();
        out.indUngreys = await w.locator('input[name="membership"]').evaluate((e) => ({disabled: e.disabled})).catch(() => null);
        // 2. cost "forty"
        await w.locator('[name="name[en]"]').fill('K1 Online');
        await w.locator('[name="currency"]').selectOption('USD');
        await w.locator('[name="cost"]').fill('forty');
        await w.locator('[name="format"]').selectOption({label: 'Online'});
        out.costWord = await trySave(w, 'ty-03-cost-forty');
        // 3. cost 40, duration "a"
        if (await W().count()) {
            w = W();
            await w.locator('[name="cost"]').fill('40');
            await w.locator('[name="duration"]').fill('a');
            out.durationWord = await trySave(w, 'ty-04-duration-a');
        }
        // 4. the other end: duration -1, then cost -5
        if (await W().count()) {
            w = W();
            await w.locator('[name="duration"]').fill('-1');
            out.durationNegative = await trySave(w, 'ty-05-duration-negative');
        }
        if (await W().count()) {
            w = W();
            await w.locator('[name="duration"]').fill('12');
            await w.locator('[name="cost"]').fill('-5');
            out.costNegative = await trySave(w, 'ty-06-cost-negative');
        }
        // 5. a good save: cost 40, duration 12
        if (await W().count()) {
            w = W();
            await w.locator('[name="cost"]').fill('40');
            await w.locator('[name="duration"]').fill('12');
            out.goodSave = await trySave(w, 'ty-07-good-save');
        }
        if (await W().count()) await closeWindow();
        // 6. more types, in this order
        const make = async (t) => {
            w = await openType();
            await w.locator('[name="name[en]"]').fill(t.name);
            await w.locator('[name="currency"]').selectOption(t.currency || 'USD');
            await w.locator('[name="cost"]').fill(t.cost);
            await w.locator('[name="format"]').selectOption({label: t.format || 'Online'});
            if (t.duration !== undefined) await w.locator('[name="duration"]').fill(t.duration);
            if (t.institutional) await w.locator('input[name="institutional"][value="1"]').check();
            if (t.membership) await w.locator('input[name="membership"]').check();
            if (t.hidden) await w.locator('input[type="checkbox"]').filter({hasNot: page.locator('[name="membership"]')}).last().check();
            const r = await trySave(w, `ty-08-make-${t.name.replace(/\W+/g, '-')}`);
            if (await W().count()) await closeWindow();
            return r;
        };
        out.make = {};
        for (const t of [
            {name: 'K1 Forever', cost: '100', duration: ''},
            {name: 'K1 Half', cost: '12.5', duration: '18'},
            {name: 'K1 Thirty', cost: '0', duration: '30'},
            {name: 'K1 Six', cost: '6', duration: '6'},
            {name: 'K1 Print', cost: '30', duration: '12', format: 'Print'},
            {name: 'K1 Member', cost: '20', duration: '12', membership: true},
            {name: 'K1 Hidden', cost: '1', duration: '12', hidden: true},
            {name: 'K1 Del', cost: '9', duration: '12'},
            {name: 'K1 Campus', cost: '500', duration: '12', institutional: true},
            {name: 'K1 CampusPrint', cost: '400', duration: '12', institutional: true, format: 'Print'},
            {name: 'K1 Euro', cost: '15', duration: '1', currency: 'EUR'},
        ]) out.make[t.name] = await make(t);
        const panel = await paymentsTab(P('A'), 'Subscription Types');
        out.list = await readGrid(panel);
        await snap('ty-09-types-list');
        // Edit: the institutional choice is greyed; the hidden type's box
        for (const nm of ['K1 Campus', 'K1 Hidden', 'K1 Online']) {
            const p2 = await paymentsTab(P('A'), 'Subscription Types');
            const ra = await rowActions(gridRow(p2, nm));
            await ra.ctl.getByRole('link', {name: 'Edit', exact: true}).click();
            await W().locator('form').first().waitFor({timeout: T}); await idle(page); await sleep(700);
            w = W();
            out[`edit_${nm}`] = {title: flat(await w.locator('h1').first().innerText().catch(() => null), 100),
                radios: await w.locator('input[name="institutional"]').evaluateAll((els) => els.map((e) => ({v: e.value, checked: e.checked, disabled: e.disabled}))),
                boxes: await w.locator('input[type="checkbox"]').evaluateAll((els) => els.map((e) => ({name: e.name, checked: e.checked, disabled: e.disabled}))),
                cost: await w.locator('[name="cost"]').inputValue(), duration: await w.locator('[name="duration"]').inputValue()};
            await snap(`ty-10-edit-${nm.replace(/\W+/g, '-')}`);
            await closeWindow();
        }
        fact('types', out);
    });

    // ================================================================== win (Rule 19 on A: every refusal, then good saves; td10 columns)
    if (on('win')) await sect('win', async () => {
        const out = {};
        const u = C.A.users;
        const user = (k) => ({user: `${C.A.p}${k}`, userId: u[k]});
        await as(`${C.A.p}mg`, P('A'));
        const openInd = async () => { await paymentsTab(P('A'), 'Individual Subscriptions'); return openWindow('Create New Subscription'); };
        const openInst = async () => { await paymentsTab(P('A'), 'Institutional Subscriptions'); return openWindow('Create New Subscription'); };
        const attempt = async (key, spec, opener = openInd) => {
            const w = await opener();
            out[key] = await saveSub(w, spec, `wi-${key}`);
            if (await W().count()) await closeWindow();
            return out[key];
        };
        // institutional with no institution yet
        let w = await openInst();
        out.instNoInstitution = await winText();
        await snap('wi-00-inst-no-institution');
        await closeWindow();
        await attempt('noUser', {type: 'K1 Online', start: '2026-01-01', end: '2026-12-31'});
        await attempt('nonExpiringStart', {...user('r2'), type: 'K1 Forever', start: '2026-01-01'});
        await attempt('nonExpiringEnd', {...user('r2'), type: 'K1 Forever', end: '2026-12-31'});
        await attempt('missingDates', {...user('r2'), type: 'K1 Online'});
        await attempt('startTooOld', {...user('r2'), type: 'K1 Online', start: '2015-06-01', end: '2026-12-31'});
        await attempt('endTooFar', {...user('r2'), type: 'K1 Online', start: '2026-01-01', end: '2037-01-01'});
        await attempt('membershipEmpty', {...user('r2'), type: 'K1 Member', start: '2026-01-01', end: '2026-12-31'});
        await attempt('notifyNoContact', {...user('r2'), type: 'K1 Online', start: '2026-01-01', end: '2026-12-31', notify: true});
        // the good saves
        await attempt('good_r1', {...user('r1'), type: 'K1 Online', start: '2026-01-01', end: '2026-12-31', ref: 'REF-R1'});
        await attempt('existing_r1', {...user('r1'), type: 'K1 Forever'});
        await attempt('edgeYears_r2', {...user('r2'), type: 'K1 Del', start: '2016-01-01', end: '2036-12-31'});
        await attempt('startAfterEnd_r3', {...user('r3'), type: 'K1 Online', start: '2026-12-01', end: '2026-01-01'});
        await attempt('forever_r5', {...user('r5'), type: 'K1 Forever'});
        let panel = await paymentsTab(P('A'), 'Individual Subscriptions');
        out.list = await readGrid(panel);
        await snap('wi-20-individual-list');
        // institutions by screen (Settings › Institutions): one with an IP range, one without
        for (const [nm, ip] of [['K1 Screen Library', '10.1.1.1'], ['K1 NoIP Library', '']]) {
            await page.goto(cUrl(P('A'), '/management/settings/institutions')); await idle(page);
            await page.getByRole('button', {name: 'Add Institution'}).click(); await idle(page); await sleep(500);
            await W().getByRole('textbox', {name: 'Name'}).fill(nm);
            if (ip) await W().getByRole('textbox', {name: 'IP ranges'}).fill(ip);
            await W().getByRole('button', {name: 'Save', exact: true}).click();
            await sleep(1500); await idle(page);
            if (await W().count()) await closeWindow();
        }
        w = await openInst();
        out.instWindow = {text: await winText(), institutions: await w.locator('[name="institutionId"] option').allInnerTexts().catch(() => []),
            types: await w.locator('[name="typeId"] option').allInnerTexts().catch(() => [])};
        await snap('wi-21-inst-window');
        await closeWindow();
        await attempt('instBadDomain', {...user('mg'), type: 'K1 Campus', start: '2026-01-01', end: '2026-12-31', institution: 'K1 Screen Library', domain: 'not a domain'}, openInst);
        await attempt('instNoIpNoDomain', {...user('mg'), type: 'K1 Campus', start: '2026-01-01', end: '2026-12-31', institution: 'K1 NoIP Library'}, openInst);
        await attempt('instPrintNoIp', {...user('mg'), type: 'K1 CampusPrint', start: '2026-01-01', end: '2026-12-31', institution: 'K1 NoIP Library'}, openInst);
        await attempt('instGood', {...user('mg'), type: 'K1 Campus', start: '2026-01-01', end: '2026-12-31', institution: 'K1 Screen Library', domain: 'screen.example.org', ref: 'REF-INST'}, openInst);
        panel = await paymentsTab(P('A'), 'Institutional Subscriptions');
        out.instList = await readGrid(panel);
        await snap('wi-22-institutional-list');
        fact('win', out);
    });

    // ================================================================== mail (td28, A4 done in `win`: the contact set by screen, then the email)
    if (on('mail')) await sect('mail', async () => {
        const out = {};
        const u = C.A.users;
        await as(`${C.A.p}mg`, P('A'));
        let panel = await paymentsTab(P('A'), 'Subscription Policies');
        await panel.locator('[name="subscriptionName"]').fill('K1 Desk Person');
        await panel.locator('[name="subscriptionEmail"]').fill(`${C.A.p}desk@mail.test`);
        await panel.locator('[name="subscriptionMailingAddress"]').fill('K1 Desk, 2 Screen Road');
        await panel.getByRole('button', {name: 'Save', exact: true}).click();
        out.contactSaved = await collectNotices(4000);
        // a new subscription with the box ticked
        await paymentsTab(P('A'), 'Individual Subscriptions');
        let w = await openWindow('Create New Subscription');
        out.newSave = await saveSub(w, {user: `${C.A.p}r4`, userId: u.r4, type: 'K1 Six', start: '2026-09-01', end: '2027-02-28', notify: true}, 'ma-01-new-with-email');
        if (await W().count()) await closeWindow();
        try {
            const m = await app.mail.find({to: `${C.A.p}r4@mail.test`, subject: 'Subscription Notification', timeoutMs: 20000});
            const full = await app.mail.fullMessage(m.ID);
            out.email = {subject: full.Subject, from: full.From, to: (full.To || []).map((x) => x.Address), text: flat(full.Text, 1500)};
        } catch (e) { out.email = {none: flat(String(e.message), 200)}; }
        // edit with the box ticked: a second email; the box arrives unticked on Edit
        panel = await paymentsTab(P('A'), 'Individual Subscriptions');
        const ra = await rowActions(gridRow(panel, 'Koner4'));
        await ra.ctl.getByRole('link', {name: 'Edit', exact: true}).click();
        await W().locator('form').first().waitFor({timeout: T}); await idle(page); await sleep(800);
        w = W();
        out.editNotifyArrives = await w.locator('[name="notifyEmail"]').isChecked().catch(() => null);
        out.editSave = await saveSub(w, {ref: 'REF-R4-EDIT', notify: true}, 'ma-02-edit-with-email');
        if (await W().count()) await closeWindow();
        await sleep(1500);
        try { out.countAfterEdit = await app.mail.count({to: `${C.A.p}r4@mail.test`, subject: 'Subscription Notification'}); } catch (e) { out.countAfterEdit = flat(String(e.message), 200); }
        // an edit with the box unticked sends nothing
        panel = await paymentsTab(P('A'), 'Individual Subscriptions');
        const ra2 = await rowActions(gridRow(panel, 'Koner4'));
        await ra2.ctl.getByRole('link', {name: 'Edit', exact: true}).click();
        await W().locator('form').first().waitFor({timeout: T}); await idle(page); await sleep(800);
        out.editNoNotify = await saveSub(W(), {ref: 'REF-R4-EDIT2'}, 'ma-03-edit-without-email');
        if (await W().count()) await closeWindow();
        await sleep(2000);
        try { out.countAfterPlainEdit = await app.mail.count({to: `${C.A.p}r4@mail.test`, subject: 'Subscription Notification'}); } catch (e) { out.countAfterPlainEdit = flat(String(e.message), 200); }
        fact('mail', out);
    });

    // ================================================================== renew (td15, Rule 20 on A)
    if (on('renew')) await sect('renew', async () => {
        const out = {};
        const u = C.A.users;
        await as(`${C.A.p}mg`, P('A'));
        // r2's edge-years subscription is edited to end in 30 days; r3's to have ended 10 days ago with "Needs Information"
        const edit = async (who2, spec, name) => {
            const panel = await paymentsTab(P('A'), 'Individual Subscriptions');
            const ra = await rowActions(gridRow(panel, who2));
            await ra.ctl.getByRole('link', {name: 'Edit', exact: true}).click();
            await W().locator('form').first().waitFor({timeout: T}); await idle(page); await sleep(800);
            const r = await saveSub(W(), spec, name);
            if (await W().count()) await closeWindow();
            return r;
        };
        out.e2 = await edit('Koner2', {start: '2025-10-25', end: addDays(30)}, 're-01-r2-ends-in-30');
        out.e3 = await edit('Koner3', {start: '2025-09-01', end: addDays(-10), status: 'Needs Information'}, 're-02-r3-ended-10-ago');
        let panel = await paymentsTab(P('A'), 'Individual Subscriptions');
        out.before = (await readGrid(panel))[0]?.rows?.map((r) => r.cells.join(' | '));
        for (const who2 of ['Koner2', 'Koner3']) {
            panel = await paymentsTab(P('A'), 'Individual Subscriptions');
            const ra = await rowActions(gridRow(panel, who2));
            out[`links_${who2}`] = ra.links;
            await ra.ctl.getByRole('link', {name: 'Renew', exact: true}).click();
            await sleep(800);
            out[`dialog_${who2}`] = flat(await W().innerText().catch(() => null), 400);
            out[`dialogButtons_${who2}`] = await W().getByRole('button').allInnerTexts().catch(() => []);
            await snap(`re-03-renew-question-${who2}`);
            const wt = watch(/renew/i);
            await W().getByRole('button', {name: 'OK', exact: true}).click();
            await sleep(1500); await idle(page);
            wt.stop();
            out[`renew_${who2}`] = {posts: wt.posts, notices: await notices()};
        }
        // Cancel leaves it as it was
        panel = await paymentsTab(P('A'), 'Individual Subscriptions');
        const ra = await rowActions(gridRow(panel, 'Koner1'));
        await ra.ctl.getByRole('link', {name: 'Renew', exact: true}).click(); await sleep(800);
        await W().getByRole('button', {name: 'Cancel'}).first().click().catch(() => {}); await sleep(800);
        panel = await paymentsTab(P('A'), 'Individual Subscriptions');
        out.after = (await readGrid(panel))[0]?.rows?.map((r) => r.cells.join(' | '));
        const r5 = await rowActions(gridRow(panel, 'Koner5'));
        out.links_forever = r5.links;
        await snap('re-04-after-renew');
        fact('renew', out);
    });

    // ================================================================== search (Rule 22 on B)
    if (on('search')) await sect('search', async () => {
        const out = {};
        await as(`${C.B.p}mg`, P('B'));
        const run = async (tb, field, match, text, name) => {
            const panel = await paymentsTab(P('B'), tb);
            const sLink = panel.getByRole('link', {name: /Search/}).first();
            if (!(await panel.locator('select[name="searchField"]').isVisible().catch(() => false)) && await sLink.count()) { await sLink.click(); await sleep(600); }
            if (field) await panel.locator('select[name="searchField"]').selectOption({label: field});
            if (match) await panel.locator('select[name="searchMatch"]').selectOption({label: match});
            await panel.locator('input[name="search"]').fill(text);
            await panel.getByRole('button', {name: 'Search'}).click();
            await sleep(800); await idle(page);
            const g = await readGrid(panel);
            const rows = (g.find((x) => x.rows) || {rows: []}).rows.map((r) => r.cells.slice(0, 2).join(' | '));
            await snap(`se-${name}`, {rows});
            return rows;
        };
        const p = C.B.p;
        out.username_contains = await run('Individual Subscriptions', 'Username', 'contains', 'fut', 'username-contains');
        out.username_is_partial = await run('Individual Subscriptions', 'Username', 'is', 'fut', 'username-is-partial');
        out.username_is_full = await run('Individual Subscriptions', 'Username', 'is', `${p}fut`, 'username-is-full');
        out.given = await run('Individual Subscriptions', 'Given Name', 'contains', 'PAST', 'given-contains');
        out.email = await run('Individual Subscriptions', 'Email', 'contains', 'tdy@', 'email-contains');
        out.membership = await run('Individual Subscriptions', 'Membership', 'is', 'MEM-77', 'membership-is');
        out.ref = await run('Individual Subscriptions', 'Reference Number', 'contains', 'REF-ACT', 'ref-contains');
        out.notes = await run('Individual Subscriptions', 'Notes', 'contains', 'note act', 'notes-contains');
        out.family = await run('Individual Subscriptions', 'Family Name', 'contains', 'Konena', 'family-contains');
        out.empty = await run('Individual Subscriptions', null, null, '', 'empty');
        out.inst_name = await run('Institutional Subscriptions', 'Institution name', 'contains', 'Far', 'inst-name');
        out.inst_domain = await run('Institutional Subscriptions', 'Domain', 'contains', 'far.example', 'inst-domain');
        out.inst_ip = await run('Institutional Subscriptions', 'IP ranges', 'contains', '10.0', 'inst-ip');
        out.inst_none = await run('Institutional Subscriptions', 'Institution name', 'is', 'Far', 'inst-none');
        fact('search', out);
    });

    // ================================================================== search2 (a second journal: the list-typed fields and the institutional fields)
    if (on('search2')) await sect('search2', async () => {
        const out = {};
        await as(`${C.A.p}mg`, P('A'));
        const run = async (tb, field, match, text, name) => {
            const panel = await paymentsTab(P('A'), tb);
            const sLink = panel.getByRole('link', {name: /Search/}).first();
            if (!(await panel.locator('select[name="searchField"]').isVisible().catch(() => false)) && await sLink.count()) { await sLink.click(); await sleep(600); }
            await panel.locator('select[name="searchField"]').selectOption({label: field});
            await panel.locator('select[name="searchMatch"]').selectOption({label: match});
            await panel.locator('input[name="search"]').fill(text);
            const wt = watch(/fetch-grid|fetchGrid/);
            await panel.getByRole('button', {name: 'Search'}).click();
            await sleep(900); await idle(page);
            wt.stop();
            const g = await readGrid(panel);
            const rows = (g.find((x) => x.rows) || {rows: []}).rows.map((r) => r.cells.slice(0, 2).join(' | '));
            await snap(`s2-${name}`, {rows});
            return {rows, requested: wt.posts.filter((x) => x.method).map((x) => x.url.slice(0, 200))};
        };
        out.ref_contains = await run('Individual Subscriptions', 'Reference Number', 'contains', 'REF-R4', 'ref');
        out.membership_is = await run('Individual Subscriptions', 'Membership', 'is', 'nothing-like-this', 'membership');
        out.notes_contains = await run('Individual Subscriptions', 'Notes', 'contains', 'nothing-like-this', 'notes');
        out.username_control = await run('Individual Subscriptions', 'Username', 'contains', 'r4', 'username');
        out.inst_name = await run('Institutional Subscriptions', 'Institution name', 'contains', 'Screen', 'inst-name');
        out.inst_domain = await run('Institutional Subscriptions', 'Domain', 'is', 'screen.example.org', 'inst-domain');
        out.inst_ip = await run('Institutional Subscriptions', 'IP ranges', 'contains', '10.1.1', 'inst-ip');
        out.inst_username = await run('Institutional Subscriptions', 'Username', 'contains', 'nothing-like-this', 'inst-username');
        fact('search2', out);
    });

    // ================================================================== access (Rule 17 on B, td10's ends)
    if (on('access')) await sect('access', async () => {
        const out = {};
        const b1 = S.s['B.b1'];
        for (const k of ['act', 'ni', 'na', 'amp', 'aop', 'oth', 'prn', 'fut', 'past', 'tdy', 'for', 'mem']) {
            await as(`${C.B.p}${k}`, P('B'));
            const r = await articleAndGalley(P('B'), b1.id, 'PDF', `ac-${k}`);
            out[k] = {links: r.links.map((l) => l.cls), press: r.press, opened: isOpenGalley(r.press)};
        }
        // the list's dates for the same subscriptions
        await as(`${C.B.p}mg`, P('B'));
        const panel = await paymentsTab(P('B'), 'Individual Subscriptions');
        out.list = (await readGrid(panel))[0]?.rows?.map((r) => r.cells.join(' | '));
        await snap('ac-99-list');
        fact('access', out);
    });

    // ================================================================== delsub (Rule 21 on A: r1's subscription)
    if (on('delsub')) await sect('delsub', async () => {
        const out = {};
        const a1 = S.s['A.a1'];
        await as(`${C.A.p}r1`, P('A'));
        out.before = (await articleAndGalley(P('A'), a1.id, 'PDF', 'ds-01-r1-before')).press;
        await as(`${C.A.p}mg`, P('A'));
        let panel = await paymentsTab(P('A'), 'Individual Subscriptions');
        const ra = await rowActions(gridRow(panel, 'Koner1'));
        out.links = ra.links;
        await ra.ctl.getByRole('link', {name: 'Delete', exact: true}).click(); await sleep(800);
        out.dialog = flat(await W().innerText().catch(() => null), 400);
        out.buttons = await W().getByRole('button').allInnerTexts().catch(() => []);
        await snap('ds-02-delete-question');
        await W().getByRole('button', {name: 'OK', exact: true}).click(); await sleep(1500); await idle(page);
        out.notices = await notices();
        panel = await paymentsTab(P('A'), 'Individual Subscriptions');
        out.after = (await readGrid(panel))[0]?.rows?.map((r) => r.cells.slice(0, 2).join(' | '));
        await snap('ds-03-list-after-delete');
        await as(`${C.A.p}r1`, P('A'));
        out.afterPress = (await articleAndGalley(P('A'), a1.id, 'PDF', 'ds-04-r1-after')).press;
        fact('delsub', out);
    });

    // ================================================================== deltype (td13 on A: "K1 Del" holds r2's subscription)
    if (on('deltype')) await sect('deltype', async () => {
        const out = {};
        const a1 = S.s['A.a1'];
        await as(`${C.A.p}r2`, P('A'));
        out.before = (await articleAndGalley(P('A'), a1.id, 'PDF', 'dt-01-r2-before')).press;
        await as(`${C.A.p}mg`, P('A'));
        let panel = await paymentsTab(P('A'), 'Subscription Types');
        const ra = await rowActions(gridRow(panel, 'K1 Del'));
        out.links = ra.links;
        await ra.ctl.getByRole('link', {name: 'Delete', exact: true}).click(); await sleep(800);
        out.dialog = flat(await W().innerText().catch(() => null), 500);
        out.buttons = await W().getByRole('button').allInnerTexts().catch(() => []);
        await snap('dt-02-delete-type-question');
        await W().getByRole('button', {name: 'OK', exact: true}).click(); await sleep(1500); await idle(page);
        out.notices = await notices();
        panel = await paymentsTab(P('A'), 'Subscription Types');
        out.typesAfter = (await readGrid(panel))[0]?.rows?.map((r) => r.cells[0]);
        panel = await paymentsTab(P('A'), 'Individual Subscriptions');
        out.subsAfter = (await readGrid(panel))[0]?.rows?.map((r) => r.cells.slice(0, 3).join(' | '));
        await snap('dt-03-individual-after-type-delete');
        await as(`${C.A.p}r2`, P('A'));
        out.afterPress = (await articleAndGalley(P('A'), a1.id, 'PDF', 'dt-04-r2-after')).press;
        fact('deltype', out);
    });

    // ================================================================== inst (td22 on C, Rule 18's domain on I)
    if (on('inst')) await sect('inst', async () => {
        const out = {};
        for (const key of ['C', 'I'].filter((k) => !C[k].error)) {
            const s = S.s[`${key}.${key.toLowerCase()}1`];
            await visitor();
            const r = await articleAndGalley(P(key), s.id, 'PDF', `in-${key}-visitor`);
            out[`${key}_visitor`] = {links: r.links, press: r.press, opened: isOpenGalley(r.press)};
            out[`${key}_issue`] = await issuePageLinks(P(key), issueId(key, 1, 1, 2026), `in-${key}-issue`);
            await land(`/index.php/${P(key)}`, `in-${key}-home`);
            out[`${key}_block`] = flat(await page.locator('.block_subscription').first().innerText().catch(() => null), 300);
            await as(`${C[key].p}au`, P(key));
            await land(`/index.php/${P(key)}`, `in-${key}-home-signed-in`);
            out[`${key}_block_signedIn`] = flat(await page.locator('.block_subscription').first().innerText().catch(() => null), 300);
        }
        // B's far institution: a visitor gets nothing from it
        await visitor();
        const rb = await articleAndGalley(P('B'), S.s['B.b1'].id, 'PDF', 'in-B-visitor');
        out.B_visitor = {press: rb.press, opened: isOpenGalley(rb.press)};
        fact('inst', out);
    });

    // ================================================================== partial (td21 on D and F; Rule 23; A7's partial reader)
    if (on('partial')) await sect('partial', async () => {
        const out = {};
        // publish the two issues by screen so the articles inherit the issue dates
        for (const key of ['D', 'F']) {
            if (S[`published_${key}`]) continue;
            await as(`${C[key].p}mg`, P(key));
            for (const [v, y] of [[1, 2025], [2, 2026]]) {
                const name = `Vol. ${v} No. 1 (${y})`;
                await page.goto(cUrl(P(key), '/manageIssues')); await idle(page);
                const row = page.locator('tr.gridRow').filter({hasText: name}).first();
                await row.locator('a.show_extras').first().click(); await sleep(400);
                const id = await row.getAttribute('id');
                await page.locator(`[id="${id}-control-row"]`).getByRole('link', {name: 'Publish Issue', exact: true}).click();
                await W().locator('form').first().waitFor({timeout: T}); await idle(page);
                const box = W().getByRole('checkbox', {name: 'Send an email about this to all registered users.'});
                if (await box.count()) await box.uncheck();
                await W().getByRole('button', {name: 'OK', exact: true}).click();
                await sleep(2000); await idle(page);
            }
            S[`published_${key}`] = true; save();
        }
        const d25 = S.s['D.d25']; const d26 = S.s['D.d26'];
        const run = async (label) => {
            const r = {};
            for (const [k, s, v, y] of [['a25', d25, 1, 2025], ['a26', d26, 2, 2026]]) {
                const x = await articleAndGalley(P('D'), s.id, 'PDF', `pa-${label}-${k}`);
                r[k] = {published: flat(await page.locator('.item.published, .published').first().innerText().catch(() => null), 80), press: x.press, opened: isOpenGalley(x.press)};
                const iss = await issuePageLinks(P('D'), issueId('D', v, 1, y), `pa-${label}-${k}-issue`);
                r[`${k}_issue`] = iss.links;
                const full = page.locator('a.obj_galley_link').filter({hasText: 'PDF'}).first();
                // the issue's own galley ("Full Issue") is the first galley link in the issue's heading area
                const fullIssue = page.locator('.galleys a.obj_galley_link, .obj_issue_toc .galleys a').first();
                if (await fullIssue.count()) r[`${k}_fullIssue`] = brief(await press(fullIssue, `pa-${label}-${k}-fullissue`));
                else r[`${k}_fullIssue`] = {none: true, any: await full.count()};
            }
            return r;
        };
        await as(`${C.D.p}r1`, P('D'));
        out.partial_r1 = await run('partial-r1');
        await as(`${C.D.p}r2`, P('D'));
        out.partial_r2 = await run('partial-r2');
        // switch to "Full expiry" by screen
        await as(`${C.D.p}mg`, P('D'));
        const panel = await paymentsTab(P('D'), 'Subscription Policies');
        await panel.getByRole('radio', {name: 'Full expiry'}).check();
        if (!(await panel.locator('[name="subscriptionMailingAddress"]').inputValue())) await panel.locator('[name="subscriptionMailingAddress"]').fill('K1 Desk Road');
        await panel.getByRole('button', {name: 'Save', exact: true}).click();
        out.fullSaved = await collectNotices(4000);
        await as(`${C.D.p}r1`, P('D'));
        out.full_r1 = await run('full-r1');
        // institutional partial (F), signed out
        await visitor();
        for (const [k, s] of [['f25', S.s['F.f25']], ['f26', S.s['F.f26']]]) {
            const x = await articleAndGalley(P('F'), s.id, 'PDF', `pa-F-${k}`);
            out[`F_${k}`] = {press: x.press, opened: isOpenGalley(x.press), links: x.links.map((l) => l.cls)};
        }
        fact('partial', out);
    });

    // ================================================================== hidden (Rule 16a on B)
    if (on('hidden')) await sect('hidden', async () => {
        const out = {};
        await visitor();
        await land(`/index.php/${P('B')}/about/subscriptions`, 'hi-01-subs-page-visitor');
        out.subsPage = flat(await page.locator('.page, body').first().innerText().catch(() => null), 1500);
        await as(`${C.B.p}rd`, P('B'));
        await land(`/index.php/${P('B')}/user/purchaseSubscription/individual`, 'hi-02-purchase-individual');
        out.purchaseInd = {options: await page.locator('select[name="typeId"] option').allInnerTexts().catch(() => []), text: flat(await page.locator('body').innerText(), 600)};
        await land(`/index.php/${P('B')}/user/purchaseSubscription/institutional`, 'hi-03-purchase-institutional');
        out.purchaseInst = {options: await page.locator('select[name="typeId"] option').allInnerTexts().catch(() => [])};
        await as(`${C.B.p}mg`, P('B'));
        await paymentsTab(P('B'), 'Individual Subscriptions');
        const w = await openWindow('Create New Subscription');
        out.window = await w.locator('[name="typeId"] option').allInnerTexts();
        await snap('hi-04-window-types');
        await closeWindow();
        fact('hidden', out);
    });

    // ================================================================== paging (H: itemsPerPage 3)
    if (on('paging')) await sect('paging', async () => {
        const out = {};
        await as(`${C.H.p}mg`, P('H'));
        for (const tb of ['Individual Subscriptions', 'Subscription Types']) {
            const panel = await paymentsTab(P('H'), tb);
            out[tb] = {grid: await readGrid(panel), pager: flat(await panel.locator('.gridPaging, .pkp_linkActions, .grid_paging').allInnerTexts().catch(() => []).then((a) => a.join(' | ')), 300)};
            await snap(`pg-H-${tb.replace(/\W+/g, '-')}`);
            const next = panel.getByRole('link', {name: /^(2|>|Next)$/}).first();
            if (await next.count()) {
                await next.click(); await sleep(800); await idle(page);
                out[`${tb}_page2`] = await readGrid(panel);
                await snap(`pg-H-${tb.replace(/\W+/g, '-')}-page2`);
            }
        }
        fact('paging', out);
    });

    // ================================================================== manual (Side effects 551–552 on B: a manual purchase completes nothing)
    if (on('manual')) await sect('manual', async () => {
        const out = {};
        await as(`${C.B.p}r2`, P('B'));
        await land(`/index.php/${P('B')}/user/purchaseSubscription/individual`, 'mn-01-purchase-page');
        await page.locator('select[name="typeId"]').selectOption({index: 0}).catch(() => {});
        out.chosen = await page.locator('select[name="typeId"]').evaluate((s) => s.options[s.selectedIndex]?.text).catch(() => null);
        await Promise.all([page.waitForLoadState('load').catch(() => {}), page.getByRole('button', {name: /Save|Continue/}).first().click()]);
        await idle(page);
        const pay = await snap('mn-02-manual-payment-page');
        out.payPage = flat(pay.text && pay.text.main || await page.locator('body').innerText(), 800);
        const send = page.getByRole('link', {name: /Send notification of payment/}).or(page.getByRole('button', {name: /Send notification of payment/})).first();
        if (await send.count()) {
            await Promise.all([page.waitForLoadState('load').catch(() => {}), send.click()]);
            await idle(page);
            await snap('mn-03-after-notification');
            out.afterNotify = {url: page.url().replace(app.baseURL, ''), text: flat(await page.locator('body').innerText(), 500)};
        }
        await land(`/index.php/${P('B')}/user/subscriptions`, 'mn-04-my-subscriptions');
        out.my = flat(await page.locator('body').innerText(), 800);
        await land(`/index.php/${P('B')}`, 'mn-05-home-block');
        out.block = flat(await page.locator('.block_subscription').first().innerText().catch(() => null), 300);
        await as(`${C.B.p}mg`, P('B'));
        const panel = await paymentsTab(P('B'), 'Individual Subscriptions');
        out.row = (await readGrid(panel))[0]?.rows?.find((r) => r.cells.join(' ').includes('Koner2'))?.cells;
        await paymentsTab(P('B'), 'Payments');
        out.paymentsTab = flat(await page.getByRole('tabpanel', {name: 'Payments'}).innerText().catch(() => null), 500);
        await snap('mn-06-payments-tab');
        await sleep(1500);
        for (const subj of ['Subscription Purchase: Individual', 'Subscription Renewal: Individual']) {
            try { out[`mail_${subj}`] = await app.mail.count({to: `${C.B.p}desk@mail.test`, subject: subj}); } catch (e) { out[`mail_${subj}`] = flat(String(e.message), 120); }
        }
        try { out.mail_principal = await app.mail.count({to: `${C.B.p}pc@mail.test`}); } catch (e) { out.mail_principal = flat(String(e.message), 120); }
        fact('manual', out);
    });

    // ================================================================== summary (the register rows owned elsewhere: A1, A5, A6, A9–A14, driven lightly)
    if (on('summary')) await sect('summary', async () => {
        const out = {};
        // A1: a fresh journal's Access tab (E was made with a mode; H too; use a new bare one)
        const t = tag('u51k1a1');
        const r = await app.api.createContext({tag: t, users: [{username: `${t}mg`, roles: ['manager']}]});
        await as(`${t}mg`, r.path || t);
        await page.goto(cUrl(r.path || t, '/management/settings/distribution')); await idle(page);
        await page.getByRole('tab', {name: 'Access', exact: true}).click(); await idle(page);
        const panel = page.getByRole('tabpanel', {name: 'Access'});
        out.A1 = {radios: await panel.getByRole('radio').evaluateAll((els) => els.map((e) => e.checked)), delayed: await panel.getByRole('combobox', {name: 'Delayed Open Access'}).count()};
        await snap('su-01-A1-fresh-access');
        // A12: signed-out purchase addresses
        await visitor();
        out.A12_ind = brief(await land(`/index.php/${P('B')}/user/purchaseSubscription/individual`, 'su-02-A12-visitor-ind'));
        out.A12_inst = brief(await land(`/index.php/${P('B')}/user/purchaseSubscription/institutional`, 'su-03-A12-visitor-inst'));
        // A9: membership type, empty membership
        await as(`${C.B.p}ce`, P('B'));
        await land(`/index.php/${P('B')}/user/purchaseSubscription/individual`, 'su-04-A9-page');
        const mem = (await page.locator('select[name="typeId"] option').allInnerTexts().catch(() => [])).find((o) => /K1 Member/.test(o));
        if (mem) {
            await page.locator('select[name="typeId"]').selectOption({label: mem});
            await Promise.all([page.waitForLoadState('load').catch(() => {}), page.getByRole('button', {name: /Save|Continue/}).first().click()]);
            await idle(page);
            await snap('su-05-A9-after-save');
            out.A9 = {url: page.url().replace(app.baseURL, ''), text: flat(await page.locator('body').innerText(), 600)};
            await land(`/index.php/${P('B')}/user/subscriptions`, 'su-06-A9-my');
            out.A9.my = flat(await page.locator('body').innerText(), 400);
        }
        // A10: an active subscriber presses "Purchase" on My Subscriptions
        await as(`${C.B.p}act`, P('B'));
        await land(`/index.php/${P('B')}/user/subscriptions`, 'su-07-A10-my-before');
        out.A10 = {before: flat(await page.locator('body').innerText(), 600)};
        const purchase = page.getByRole('link', {name: 'Purchase', exact: true}).first();
        if (await purchase.count()) {
            await Promise.all([page.waitForLoadState('load').catch(() => {}), purchase.click()]);
            await idle(page);
            await snap('su-08-A10-purchase-page');
            out.A10.page = flat(await page.locator('body').innerText(), 400);
            await Promise.all([page.waitForLoadState('load').catch(() => {}), page.getByRole('button', {name: /Save|Continue/}).first().click()]);
            await idle(page);
            await snap('su-09-A10-after-save');
            await land(`/index.php/${P('B')}/user/subscriptions`, 'su-10-A10-my-after');
            out.A10.after = flat(await page.locator('body').innerText(), 600);
            const x = await articleAndGalley(P('B'), S.s['B.b1'].id, 'PDF', 'su-11-A10-galley');
            out.A10.press = x.press;
            await land(`/index.php/${P('B')}`, 'su-12-A13-block');
            out.A13_block = flat(await page.locator('.block_subscription').first().innerText().catch(() => null), 300);
        }
        // A11: an institutional purchase adds an institution
        const instCount = async () => {
            await as(`${C.B.p}mg`, P('B'));
            await page.goto(cUrl(P('B'), '/management/settings/institutions')); await idle(page);
            return flat(await page.getByRole('main').innerText().catch(() => null), 600);
        };
        out.A11 = {before: await instCount()};
        await as(`${C.B.p}au`, P('B'));
        await land(`/index.php/${P('B')}/user/purchaseSubscription/institutional`, 'su-13-A11-page');
        const f = page.locator('form').filter({has: page.locator('[name="institutionName"]')}).first();
        if (await f.count()) {
            await f.locator('[name="institutionName"]').fill('K1 Far Library');
            await f.locator('[name="domain"]').fill('bought.example.org').catch(() => {});
            await Promise.all([page.waitForLoadState('load').catch(() => {}), page.getByRole('button', {name: /Continue|Save/}).first().click()]);
            await idle(page);
            await snap('su-14-A11-after-continue');
            out.A11.afterPage = flat(await page.locator('body').innerText(), 400);
        }
        out.A11.after = await instCount();
        // A6: K's fee
        await as(`${C.K.p}rd`, P('K'));
        const k1 = await articleAndGalley(P('K'), S.s['K.k1'].id, 'PDF', 'su-15-A6');
        out.A6 = {links: k1.links, press: k1.press};
        const k2 = await articleAndGalley(P('K'), S.s['K.k1'].id, 'PDF', 'su-16-A6-again');
        out.A6.again = k2.press;
        // A14: J's HTML galley
        await as(`${C.J.p}rd`, P('J'));
        const j1 = await articleAndGalley(P('J'), S.s['J.j1'].id, 'HTML', 'su-17-A14-html');
        out.A14 = {links: j1.links, htmlPress: j1.press};
        const j2 = await articleAndGalley(P('J'), S.s['J.j1'].id, 'PDF', 'su-18-A14-pdf');
        out.A14.pdfPress = j2.press;
        fact('summary', out);
    });

    // ================================================================== paytypes (Settings bullet 7: "Association Membership"; Users & Roles' role list)
    if (on('paytypes')) await sect('paytypes', async () => {
        const out = {};
        for (const key of ['A', 'B']) {
            await as(`${C[key].p}mg`, P(key));
            const panel = await paymentsTab(P(key), 'Payment Types');
            await panel.locator('[name="membershipFee"]').waitFor({timeout: T}).catch(() => {});
            out[`${key}_text`] = flat(await panel.innerText().catch(() => null), 1500);
            out[`${key}_membershipFee`] = await panel.locator('[name="membershipFee"]').inputValue().catch(() => null);
            await snap(`pt-${key}-payment-types`);
        }
        await as(`${C.A.p}mg`, P('A'));
        await page.goto(cUrl(P('A'), '/management/settings/access')); await idle(page);
        const rolesTab = page.getByRole('tab', {name: 'Roles', exact: true});
        if (await rolesTab.count()) { await rolesTab.click(); await idle(page); await sleep(800); }
        out.roles = flat(await page.getByRole('main').innerText().catch(() => null), 2500);
        await snap('pt-A-users-roles-roles');
        fact('paytypes', out);
    });

    // ================================================================== reminders (A8 / Side effects: the task's schedule, and one run by hand)
    if (on('reminders')) await sect('reminders', async () => {
        const out = {};
        const env = {...process.env, PKP_CONFIG_FILE: app.configFile || path.join(app.root, 'config.test.inc.php')};
        try { out.list = execSync('php lib/pkp/tools/scheduler.php list', {cwd: app.root, env}).toString().split('\n').filter((l) => /SubscriptionExpiry|OpenAccessNotification/.test(l)); } catch (e) { out.list = flat(String(e.message), 300); }
        // a journal with "1 Months" before: one subscription ending exactly a month from today, one a day earlier
        const t = tag('u51k1rm');
        try {
            const r = await app.api.createContext({tag: t, publishingMode: 'subscription', subscriptionName: 'K1 Reminder Desk', subscriptionEmail: `${t}desk@mail.test`,
                numMonthsBeforeSubscriptionExpiryReminder: 1, numWeeksBeforeSubscriptionExpiryReminder: 1,
                users: [{username: `${t}x1`, roles: ['reader']}, {username: `${t}x2`, roles: ['reader']}, {username: `${t}x3`, roles: ['reader']}],
                subscriptionTypes: [{name: 'K1 Online', cost: 40, currency: 'USD', duration: 12}],
                subscriptions: [{user: `${t}x1`, type: 'K1 Online', dateStart: '2025-11-01', dateEnd: addMonths(1)},
                    {user: `${t}x2`, type: 'K1 Online', dateStart: '2025-11-01', dateEnd: dayBefore(addMonths(1))},
                    {user: `${t}x3`, type: 'K1 Online', dateStart: '2025-11-01', dateEnd: addDays(7)}]});
            out.ctx = r.path || t;
            out.ends = {x1: addMonths(1), x2: dayBefore(addMonths(1)), x3: addDays(7)};
        } catch (e) { out.ctx = flat(String(e.message), 400); }
        try {
            out.run = flat(execSync('php lib/pkp/tools/scheduler.php test --name="APP\\tasks\\SubscriptionExpiryReminder"', {cwd: app.root, env, timeout: 120000}).toString(), 400);
        } catch (e) { out.run = flat(String(e.stdout || e.message), 400); }
        await sleep(3000);
        for (const k of ['x1', 'x2', 'x3']) {
            try {
                const m = await app.mail.find({to: `${t}${k}@mail.test`, timeoutMs: 6000});
                const full = await app.mail.fullMessage(m.ID);
                out[`mail_${k}`] = {subject: full.Subject, from: full.From, text: flat(full.Text, 300)};
            } catch (e) { out[`mail_${k}`] = {none: flat(String(e.message), 120)}; }
        }
        fact('reminders', out);
    });

    await close();
});
