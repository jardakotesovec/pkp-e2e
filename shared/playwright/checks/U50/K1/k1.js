// U50 claim check K1: the "Issues" page and the "Issue Management" window (Purpose and the OMP/OPS absence,
// Actors & permissions, Fields & validation up to the issue's page, Rules 1–13, register A1, Reference).
// OJS carries the feature; OMP and OPS get the absence probes (phase `absence`, run on `all`).
//   PROBE_FEATURE=U50 PROBE_AGENT=ccK1 node bin/probe.js all shared/playwright/checks/U50/K1/k1.js
//   PHASES=seed,absence,roles,page,create,a1,a1b,names,data,date2,cover,urlpath,window,access,toc,order,remove,galleys,mail,mail2,modes,datefmt,orderlinks,notice,sortable,sortable2,publish,republish,galleyreq
//   (default all, in that order; state in .reports/U50/ccK1/k1-state-<app>.json so a phase re-runs alone;
//   delete the state file to reseed). No assertions: every screen is recorded with screen() (+ PNG) and the
//   facts go to k1-facts-<app>.json.
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, signOut, screen, shot, record, loc, note, idle, tag, outDir} = require('../../../probe');
const {runJobs} = require('../../../support/jobs');

const REPO = path.resolve(__dirname, '../../../../..');
const T = 30_000;
const ALL = ['seed', 'absence', 'roles', 'page', 'create', 'a1', 'a1b', 'names', 'data', 'date2', 'cover', 'urlpath', 'window', 'access', 'toc', 'order', 'remove', 'galleys', 'mail', 'mail2', 'modes', 'datefmt', 'orderlinks', 'notice', 'sortable', 'sortable2', 'publish', 'republish', 'galleyreq'];
const PHASES = (process.env.PHASES || ALL.join(',')).split(',');
const on = (p) => PHASES.includes(p);
const log = (...a) => console.log('[k1]', ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (s, n = 1500) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));
const statePath = (app) => path.join(outDir(), `k1-state-${app.name}.json`);
const fx = (f) => path.join(REPO, `apps/ojs/playwright/fixtures/files/${f}`);
const DENIED = /does not have access to this operation|Invalid issue requested|does not publish its content online/i;
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="#c33"/></svg>');

// Role keys of an OJS journal (users.md section 2), with the permission level each resolves to.
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
    const fact = (k, v) => { record('k1-facts', {[k]: v}, {merge: true}); log(`[${app.name} ${k}]`, JSON.stringify(v).slice(0, 2500)); };

    // ------------------------------------------------------------------ seed (OJS)
    if (on('seed') && isOJS && !S.seeded) {
        const t = tag('u50k1');
        S.t = t;
        const U = (p, k, role, extra = {}) => ({username: `${p}${k}`, roles: [role], givenName: k.toUpperCase(), familyName: `K1${k}`, ...extra});
        const base = (p, name, extra = {}) => ({name: `U50 K1 ${name}`, acronym: 'KONE', contactName: 'K1 Contact', contactEmail: `${p}c@mail.test`, ...extra});
        const mk = async (key, spec) => {
            const p = `${t}${key}`;
            try {
                const r = await app.api.createContext({tag: p, ...spec(p)});
                S.C[key] = {path: r.path || p, p, issues: r.issues || []};
                log('seed ctx', key, S.C[key].path, JSON.stringify(r.issues || []).slice(0, 600));
            } catch (e) { log('seed ctx FAILED', key, String(e.message).slice(0, 900)); S.C[key] = {error: String(e.message).slice(0, 900)}; }
            save();
            return S.C[key];
        };
        const sub = async (C, k, spec) => {
            try {
                const r = await app.api.createSubmission({tag: `${t}${k}`, context: C.path, submitter: `${C.p}au`, title: `K1 ${k} Article ${t}`, ...spec});
                log('seed sub', k, r.submissionId, r.publicationId, r.status);
                return {id: r.submissionId, pub: r.publicationId, status: r.status, title: `K1 ${k} Article ${t}`};
            } catch (e) { log('seed sub FAILED', k, String(e.message).slice(0, 700)); return {error: String(e.message).slice(0, 700)}; }
        };
        S.C = {};
        S.s = {};
        const iss = (C, v, n, y) => (C.issues || []).find((i) => String(i.volume) === String(v) && String(i.number) === String(n) && String(i.year) === String(y));
        // C0: an empty open journal (fresh: no publishingMode row) for "Create Issue" and the email.
        await mk('c0', (p) => ({context: base(p, 'empty'), users: [U(p, 'mg', 'manager'), U(p, 'r1', 'reader'), U(p, 'r2', 'reader'), U(p, 'r3', 'reader'), U(p, 'au', 'author')]}));
        // C1: an open journal, two sections, five future and two back issues, every role key.
        await mk('c1', (p) => ({context: base(p, 'open'), sections: [{abbrev: 'ART', title: 'Articles'}, {abbrev: 'REV', title: 'Reviews'}],
            users: ROLE_KEYS.map(([k, role]) => U(p, k, role, role === 'sectionEditor' ? {sections: ['ART']} : {})),
            issues: [
                {volume: 2, number: 1, year: 2027}, {volume: 1, number: 2, year: 2026}, {volume: 3, number: 1, year: 2025},
                {volume: 1, number: 1, year: 2026}, {volume: 1, number: 10, year: 2026},
                {volume: 1, number: 1, year: 2024, published: true, datePublished: '2024-03-01', galleys: [{label: 'PDF', file: 'article.pdf'}]},
                {volume: 1, number: 2, year: 2024, published: true, datePublished: '2024-06-01'},
            ]}));
        const C1 = S.C.c1;
        if (!C1.error) {
            for (const [k, sec, v, n, y] of [['s1', 'ART', 1, 2, 2026], ['s2', 'ART', 1, 2, 2026], ['s3', 'REV', 1, 2, 2026],
                ['p1', 'ART', 1, 1, 2024], ['p2', 'ART', 1, 1, 2024], ['p3', 'REV', 1, 1, 2024], ['p4', 'ART', 1, 2, 2024]]) {
                S.s[k] = await sub(C1, k, {section: sec, issue: {volume: v, number: n, year: y}, published: true});
                S.s[k].section = sec; S.s[k].issue = iss(C1, v, n, y)?.id;
            }
            // an article that is submitted but not in any issue (the Items count's control)
            S.s.q0 = await sub(C1, 'q0', {section: 'ART'});
        }
        save();
        // C2: a subscription journal with two languages (form and UI).
        await mk('c2', (p) => ({context: base(p, 'subscription', {supportedLocales: ['en', 'fr_CA'], supportedFormLocales: ['en', 'fr_CA']}),
            publishingMode: 'subscription', sections: [{abbrev: 'ART', title: 'Articles'}],
            users: [U(p, 'mg', 'manager'), U(p, 'sm', 'subscriptionManager'), U(p, 'au', 'author'), U(p, 'rd', 'reader')],
            issues: [{volume: 1, number: 1, year: 2026}, {volume: 1, number: 1, year: 2025, published: true, datePublished: '2025-02-01'}]}));
        if (!S.C.c2.error) {
            for (const [k, v, n, y] of [['t1', 1, 1, 2026], ['t2', 1, 1, 2025], ['t3', 1, 1, 2025]]) {
                S.s[k] = await sub(S.C.c2, k, {section: 'ART', issue: {volume: v, number: n, year: y}, published: true});
                S.s[k].issue = iss(S.C.c2, v, n, y)?.id;
            }
        }
        // C3: a journal that does not publish online.
        await mk('c3', (p) => ({context: base(p, 'none'), publishingMode: 'none',
            users: [['mg', 'manager'], ['se', 'sectionEditor'], ['ce', 'copyeditor'], ['sm', 'subscriptionManager'], ['au', 'author'], ['rv', 'externalReviewer'], ['rd', 'reader'], ['ed', 'editor']].map(([k, r]) => U(p, k, r)),
            issues: [{volume: 1, number: 1, year: 2025, published: true, datePublished: '2025-01-15', galleys: [{label: 'PDF', file: 'article.pdf'}]}, {volume: 1, number: 2, year: 2026}]}));
        if (!S.C.c3.error) S.s.n1 = await sub(S.C.c3, 'n1', {issue: {volume: 1, number: 1, year: 2025}, published: true});
        // C4: an open journal whose readers must be registered and signed in.
        await mk('c4', (p) => ({context: base(p, 'restricted'), restrictArticleAccess: true, users: [U(p, 'rd', 'reader'), U(p, 'au', 'author'), U(p, 'mg', 'manager')],
            issues: [{volume: 1, number: 1, year: 2025, published: true, galleys: [{label: 'PDF', file: 'article.pdf'}]}]}));
        // C5: publisher IDs on for issues and issue galleys.
        await mk('c5', (p) => ({context: base(p, 'pubid'), enablePublisherId: ['issue', 'issueGalley'], users: [U(p, 'mg', 'manager')],
            issues: [{volume: 1, number: 1, year: 2026, galleys: [{label: 'PDF', file: 'article.pdf'}]}]}));
        // C6: the URN plugin on for publications only; C7: on for issues too.
        const urn = (issue) => ({urnpubidplugin: {enabled: true, settings: {enableIssueURN: issue, enablePublicationURN: true, urnPrefix: 'urn:nbn:de:0000-', urnSuffix: 'default', urnCheckNo: false, urnResolver: 'https://nbn-resolving.de/', urnNamespace: 'urn:nbn:de'}}});
        await mk('c6', (p) => ({context: base(p, 'urn-pub'), plugins: urn(false), users: [U(p, 'mg', 'manager')], issues: [{volume: 1, number: 1, year: 2026}]}));
        await mk('c7', (p) => ({context: base(p, 'urn-issue'), plugins: urn(true), users: [U(p, 'mg', 'manager')], issues: [{volume: 1, number: 1, year: 2026}]}));
        S.seeded = true;
        save();
    }
    if (isOJS && !S.seeded) { log('not seeded'); return; }

    const {page, close} = await launch(app);
    page.on('dialog', (d) => { log('browser dialog', d.type(), d.message()); d.accept().catch(() => {}); });
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
    const as = async (user, ctx) => { await signIn(page, user, {contextPath: ctx}); await idle(page); who = user; };
    const visitor = async () => { await signOut(page).catch(() => {}); who = 'visitor'; };
    const W = () => page.locator('[role="dialog"]:visible').last();
    async function land(url, name, extra = {}) {
        const chain = [];
        const onResp = (r) => { try { if (r.request().isNavigationRequest() && r.frame() === page.mainFrame()) chain.push({url: r.url().replace(app.baseURL, ''), status: r.status()}); } catch (e) { /* none */ } };
        page.on('response', onResp);
        const resp = await page.goto(url.startsWith('http') ? url : app.url(url)).catch((e) => ({err: String(e.message).slice(0, 200)}));
        await idle(page).catch(() => {});
        page.off('response', onResp);
        const body = await page.locator('body').innerText().catch(() => '');
        const d = {
            status: resp && typeof resp.status === 'function' ? resp.status() : (resp && resp.err) || null,
            finalUrl: page.url().replace(app.baseURL, ''), chain, title: await page.title().catch(() => null),
            h1: await page.locator('h1').allInnerTexts().catch(() => []), denied: DENIED.test(body),
            login: /\/login(\?|$)/.test(page.url()), notFound: /404 Not Found|could not be found/i.test(body), bodyStart: flat(body, 400),
        };
        await snap(name, {landing: d, ...extra});
        return d;
    }
    const brief = (d) => d && ({status: d.status, finalUrl: d.finalUrl, h1: d.h1, denied: d.denied, login: d.login, notFound: d.notFound, title: d.title, body: (d.denied || d.notFound || d.status !== 200) ? d.bodyStart : undefined});

    /** The editorial side menu (PrimeVue panelmenu): every group with its items, read without clicking. */
    async function readNav() {
        const nav = page.getByRole('navigation', {name: 'Site Navigation'});
        if (!(await nav.count().catch(() => 0))) return {present: false, url: page.url().replace(app.baseURL, '')};
        const groups = await nav.locator('[role="button"][aria-controls]').evaluateAll((els) => els.map((e) => {
            const region = document.getElementById(e.getAttribute('aria-controls') || '');
            return {label: e.getAttribute('aria-label') || e.textContent.replace(/\s+/g, ' ').trim(),
                items: region ? [...region.querySelectorAll('[role="treeitem"]')].map((li) => ({label: li.getAttribute('aria-label') || li.textContent.replace(/\s+/g, ' ').trim(), href: li.querySelector('a') ? li.querySelector('a').getAttribute('href') : null})) : []};
        })).catch(() => []);
        const issues = [];
        for (const g of groups) for (const it of g.items) if (/Issues/i.test(it.label) || /manageIssues/.test(it.href || '')) issues.push({group: g.label, ...it});
        return {present: true, url: page.url().replace(app.baseURL, ''), groups: groups.map((g) => `${g.label}${g.items.length ? ' › ' + g.items.map((i) => i.label).join(', ') : ''}`), issues};
    }

    // ---- the legacy grid helpers
    const gridRows = (scope) => scope.locator('tr.gridRow');
    async function readGrid(scope) {
        return scope.evaluate((root) => [...root.querySelectorAll('table')].filter((t) => t.getClientRects().length).map((t) => ({
            columns: [...t.querySelectorAll('thead th')].map((th) => th.innerText.trim()),
            rows: [...t.querySelectorAll('tbody tr')].filter((tr) => tr.getClientRects().length && !tr.classList.contains('row_controls')).map((tr) => ({cls: tr.className, id: tr.id, text: tr.innerText.replace(/\s+/g, ' ').trim()})),
        }))).catch((e) => [{err: String(e.message).slice(0, 200)}]);
    }
    /** Press a row's arrow ("Settings", a.show_extras) and read the control row's links in order. */
    async function rowActions(row) {
        const id = await row.getAttribute('id');
        await row.locator('a.show_extras').first().click(); await sleep(350);
        const ctl = page.locator(`[id="${id}-control-row"]`);
        const links = await ctl.locator('a').evaluateAll((els) => els.filter((e) => e.getClientRects().length).map((e) => ({t: e.innerText.trim(), x: Math.round(e.getBoundingClientRect().x)}))).catch(() => []);
        return {id, links: links.map((l) => l.t), xs: links.map((l) => l.x), ctl};
    }
    const issueRow = (scope, name) => gridRows(scope).filter({has: page.getByRole('link', {name, exact: true})}).first();
    async function issuesPage(ctx, tab = 'Future Issues') {
        await page.goto(cUrl(ctx, '/manageIssues')); await idle(page);
        if (tab !== 'Future Issues') {
            await page.getByRole('tab', {name: tab, exact: true}).click(); await idle(page);
        }
        const panel = page.getByRole('tabpanel', {name: tab});
        await panel.locator('table').first().waitFor({timeout: T}).catch(() => {});
        await idle(page); await sleep(200);
        return panel;
    }
    /** Open an issue's "Issue Management" window from its name link and wait for its tabs. */
    async function openIssue(ctx, name, tab = 'Future Issues') {
        const panel = await issuesPage(ctx, tab);
        await panel.getByRole('link', {name, exact: true}).first().click();
        await page.waitForFunction(() => { const d = [...document.querySelectorAll('[role=dialog]')].filter((e) => e.getClientRects().length).pop(); return d && d.querySelector('[role=tab]'); }, null, {timeout: T}).catch(() => {});
        await idle(page); await sleep(300);
        return W();
    }
    async function windowTab(tabName) {
        const w = W();
        await w.getByRole('tab', {name: tabName, exact: true}).click();
        await idle(page); await sleep(400);
        return w.getByRole('tabpanel', {name: tabName});
    }
    async function winInfo() {
        const w = W();
        return {
            title: flat(await w.locator('h1').first().innerText().catch(() => null), 200),
            tabs: (await w.getByRole('tab').allInnerTexts().catch(() => [])).map((x) => x.trim()),
            selected: flat(await w.locator('[role=tab][aria-selected="true"]').first().innerText().catch(() => null), 80),
        };
    }
    async function formMessages(scope) {
        return scope.evaluate((root) => {
            const vis = (e) => e.getClientRects().length;
            return {
                errors: [...root.querySelectorAll('label.error, .error, .pkp_form_error, .pkpFormError, [id$="-error"], .formError')].filter(vis).map((e) => ({cls: e.className, t: e.innerText.replace(/\s+/g, ' ').trim()})).filter((x) => x.t),
                notices: [...document.querySelectorAll('.pkp_notification, .pkpNotification, [role="alert"], [role="status"]')].filter(vis).map((e) => e.innerText.replace(/\s+/g, ' ').trim()).filter(Boolean),
            };
        }).catch((e) => ({err: String(e.message).slice(0, 200)}));
    }
    const listNames = async (panel) => (await readGrid(panel)).flatMap((g) => (g.rows || []).map((r) => r.text));

    // ================================================================== absence (OMP, OPS; OJS control)
    if (on('absence')) await sect('absence', async () => {
        const ctx = 'publicknowledge';
        const out = {};
        await as('manager.maya', ctx);
        await page.goto(cUrl(ctx, '/dashboard/editorial')); await idle(page);
        out.nav = await readNav();
        await snap(`ab-01-nav`);
        await visitor();
        await land(`/index.php/${ctx}`, 'ab-02-home');
        out.header = await page.evaluate(() => [...document.querySelectorAll('.pkp_navigation_primary a, nav a')].map((a) => a.innerText.trim()).filter(Boolean)).catch(() => []);
        for (const [k, p] of [['archive', '/issue/archive'], ['current', '/issue/current'], ['view1', '/issue/view/1'], ['manage', '/manageIssues']]) {
            out[k] = brief(await land(`/index.php/${ctx}${p}`, `ab-03-visitor-${k}`));
        }
        await as('manager.maya', ctx);
        for (const [k, p] of [['archive', '/issue/archive'], ['current', '/issue/current'], ['manage', '/manageIssues']]) {
            out[`mgr_${k}`] = brief(await land(`/index.php/${ctx}${p}`, `ab-04-manager-${k}`));
        }
        fact('absence', out);
    });
    if (!isOJS) { await close(); return; }
    const C = S.C;
    const iid = (key, v, n, y) => (C[key].issues || []).find((i) => String(i.volume) === String(v) && String(i.number) === String(n) && String(i.year) === String(y))?.id;

    // ================================================================== roles (Actors)
    if (on('roles')) await sect('roles', async () => {
        const out = {c1: {}, pk: {}, c3: {}, c4: {}};
        const c1 = C.c1.path;
        const F = iid('c1', 1, 1, 2026); const P2 = iid('c1', 1, 2, 2024); const P1 = iid('c1', 1, 1, 2024);
        const P1g = (C.c1.issues.find((i) => i.id === P1)?.galleys || [])[0]?.id;
        S.ids = {F, P1, P2, P1g}; save();
        const drive = async (key, user) => {
            const r = {};
            if (user) {
                await as(user, c1);
                r.landing = page.url().replace(app.baseURL, '');
                r.nav = await readNav();
                await snap(`ro-01-${key}-landing`, {nav: r.nav});
            } else { await visitor(); }
            r.manage = brief(await land(`/index.php/${c1}/manageIssues`, `ro-02-${key}-manage`));
            r.preview = brief(await land(`/index.php/${c1}/issue/view/${F}`, `ro-03-${key}-preview`));
            r.previewMarker = await page.evaluate(() => [...document.querySelectorAll('.cmp_notification, .pkp_structure_head .preview, .obj_issue_toc .heading, h1, h2')].map((e) => e.innerText.replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 8)).catch(() => []);
            return r;
        };
        out.c1.visitor = await drive('visitor', null);
        out.c1.admin = await drive('admin', 'admin');
        for (const [k] of ROLE_KEYS) out.c1[k] = await drive(k, `${C.c1.p}${k}`);
        // td2 on the seeded journal (read-only): Vol. 2 No. 1 (2015)
        await as('manager.maya', 'publicknowledge');
        const fp = await issuesPage('publicknowledge');
        const link = fp.getByRole('link', {name: 'Vol. 2 No. 1 (2015)', exact: true});
        const href = await link.getAttribute('href').catch(() => null);
        const pkId = href && (href.match(/issueId=(\d+)/) || [])[1];
        out.pk.id = pkId;
        for (const u of ['manager.maya', 'author.alex', 'reader.rosa', null, 'copyeditor.carla', 'sectioneditor.ana', 'reviewer.julia', 'layouteditor.leo', 'assistant.rita']) {
            if (u) await as(u, 'publicknowledge'); else await visitor();
            const k = u || 'visitor';
            out.pk[k] = brief(await land(`/index.php/publicknowledge/issue/view/${pkId}`, `ro-04-pk-${k.replace('.', '-')}`));
        }
        // C3: publishing mode "none": a published issue's page, current and archive
        const N1 = iid('c3', 1, 1, 2025);
        const N1g = (C.c3.issues.find((i) => i.id === N1)?.galleys || [])[0]?.id;
        for (const k of [null, 'rd', 'au', 'rv', 'se', 'ce', 'sm', 'mg']) {
            if (k) await as(`${C.c3.p}${k}`, C.c3.path); else await visitor();
            const key = k || 'visitor';
            out.c3[key] = {
                view: brief(await land(`/index.php/${C.c3.path}/issue/view/${N1}`, `ro-05-none-${key}-view`)),
                current: brief(await land(`/index.php/${C.c3.path}/issue/current`, `ro-05-none-${key}-current`)),
                archive: brief(await land(`/index.php/${C.c3.path}/issue/archive`, `ro-05-none-${key}-archive`)),
                galley: brief(await land(`/index.php/${C.c3.path}/issue/view/${N1}/${N1g}`, `ro-05-none-${key}-galley`)),
            };
        }
        // C4: "Users must be registered…" ticked: the Full Issue galley; C1 is the open control
        const G = C.c4.issues[0]; const Gg = (G.galleys || [])[0]?.id;
        for (const k of [null, 'rd']) {
            if (k) await as(`${C.c4.p}${k}`, C.c4.path); else await visitor();
            const key = k || 'visitor';
            out.c4[key] = {
                view: brief(await land(`/index.php/${C.c4.path}/issue/view/${G.id}`, `ro-06-restricted-${key}-view`)),
                galley: brief(await land(`/index.php/${C.c4.path}/issue/view/${G.id}/${Gg}`, `ro-06-restricted-${key}-galley`)),
            };
        }
        await visitor();
        out.c1.visitorGalley = brief(await land(`/index.php/${c1}/issue/view/${P1}/${P1g}`, 'ro-07-open-visitor-galley'));
        out.c1.visitorPublished = brief(await land(`/index.php/${c1}/issue/view/${P1}`, 'ro-07-open-visitor-view'));
        fact('roles', out);
    });

    /** The "Issues" page as one reader of it: headings, links above each list, grid columns and rows. */
    async function readIssuesPage(ctx, name) {
        const out = {};
        for (const tab of ['Future Issues', 'Back Issues']) {
            const panel = await issuesPage(ctx, tab);
            const k = tab.startsWith('Future') ? 'future' : 'back';
            out[k] = {
                h1: await page.locator('main h1').allInnerTexts().catch(() => []),
                tabs: await page.getByRole('main').getByRole('tab').allInnerTexts().catch(() => []),
                headings: await panel.locator('h1,h2,h3,h4').allInnerTexts().catch(() => []),
                linksAbove: await panel.locator('ul, .pkp_linkActions').first().locator('a').allInnerTexts().catch(() => []),
                allPanelLinks: (await panel.locator('a:visible').allInnerTexts().catch(() => [])).map((x) => x.trim()).filter((x) => x && x !== 'Settings'),
                grid: await readGrid(panel),
            };
            await snap(`${name}-${k}`, {read: out[k]});
        }
        return out;
    }
    const popupFrom = async (action) => {
        const pop = page.context().waitForEvent('page', {timeout: 15000}).catch(() => null);
        await action();
        const p = await pop;
        if (!p) return {popup: false, sameTabUrl: page.url().replace(app.baseURL, '')};
        await p.waitForLoadState('domcontentloaded').catch(() => {});
        await sleep(800);
        const r = {popup: true, url: p.url().replace(app.baseURL, ''), title: await p.title().catch(() => null), h1: await p.locator('h1').allInnerTexts().catch(() => [])};
        await p.close().catch(() => {});
        return r;
    };

    // ================================================================== page (Fields: the "Issues" page, Rule 1, Rule 5 openers)
    if (on('page')) await sect('page', async () => {
        const out = {};
        const c1 = C.c1.path;
        await as(`${C.c1.p}mg`, c1);
        // reached from the side menu
        await page.goto(cUrl(c1, '/dashboard/editorial')); await idle(page);
        const nav = page.getByRole('navigation', {name: 'Site Navigation'});
        const contentHeader = nav.locator('[role="button"][aria-label="Content"]');
        if (await contentHeader.count()) { await contentHeader.first().click().catch(() => {}); await sleep(400); }
        await nav.getByRole('link', {name: 'Issues', exact: true}).first().click();
        await idle(page);
        out.fromMenu = page.url().replace(app.baseURL, '');
        await loc(page, 'Issues page: side menu › Content › "Issues"', nav.getByRole('link', {name: 'Issues', exact: true}).first());
        out.c1 = await readIssuesPage(c1, 'pg-01-c1');
        await loc(page, 'Issues page: "Back Issues" tab', page.getByRole('main').getByRole('tab', {name: 'Back Issues', exact: true}));
        // row actions, each kind of row
        let panel = await issuesPage(c1, 'Future Issues');
        const fr = await rowActions(issueRow(panel, 'Vol. 1 No. 1 (2026)'));
        out.futureRowActions = {links: fr.links, xs: fr.xs};
        await snap('pg-02-future-row-actions', {rowActions: out.futureRowActions});
        await loc(page, 'Issues › Future Issues: a row\'s arrow (named "Settings")', issueRow(panel, 'Vol. 1 No. 1 (2026)').locator('a.show_extras'));
        out.preview = await popupFrom(() => fr.ctl.getByRole('link', {name: 'Preview', exact: true}).click());
        panel = await issuesPage(c1, 'Back Issues');
        const cur = await rowActions(issueRow(panel, 'Vol. 1 No. 2 (2024)'));
        out.backCurrentRowActions = {links: cur.links, xs: cur.xs};
        out.view = await popupFrom(() => cur.ctl.getByRole('link', {name: 'View', exact: true}).click());
        panel = await issuesPage(c1, 'Back Issues');
        const old = await rowActions(issueRow(panel, 'Vol. 1 No. 1 (2024)'));
        out.backOldRowActions = {links: old.links, xs: old.xs};
        await snap('pg-03-back-row-actions', {rowActions: out.backOldRowActions});
        // Rule 5: the row's "Edit" and the name link
        panel = await issuesPage(c1, 'Future Issues');
        const e = await rowActions(issueRow(panel, 'Vol. 2 No. 1 (2027)'));
        await e.ctl.getByRole('link', {name: 'Edit', exact: true}).click();
        await page.waitForFunction(() => { const d = [...document.querySelectorAll('[role=dialog]')].filter((x) => x.getClientRects().length).pop(); return d && d.querySelector('[role=tab]'); }, null, {timeout: T}).catch(() => {});
        await idle(page); await sleep(300);
        out.viaEdit = await winInfo();
        await snap('pg-04-window-via-edit', {win: out.viaEdit});
        await openIssue(c1, 'Vol. 1 No. 2 (2026)');
        out.viaName = await winInfo();
        out.viaNameToc = await readGrid(W());
        await snap('pg-05-window-via-name', {win: out.viaName});
        await openIssue(c1, 'Vol. 1 No. 1 (2024)', 'Back Issues');
        out.viaNameBack = await winInfo();
        await snap('pg-06-window-back', {win: out.viaNameBack});
        // other manager-level accounts and the site administrator see the same page
        for (const k of ['ed', 'pe', 'admin']) {
            await as(k === 'admin' ? 'admin' : `${C.c1.p}${k}`, c1);
            panel = await issuesPage(c1, 'Future Issues');
            const r = await rowActions(issueRow(panel, 'Vol. 1 No. 1 (2026)'));
            out[`as_${k}`] = {future: await readGrid(panel), actions: r.links, links: (await panel.locator('a:visible').allInnerTexts()).map((x) => x.trim()).filter(Boolean)};
            await snap(`pg-07-as-${k}`, {read: out[`as_${k}`]});
        }
        // an empty journal: both lists
        await as(`${C.c0.p}mg`, C.c0.path);
        out.c0 = await readIssuesPage(C.c0.path, 'pg-08-c0-empty');
        fact('page', out);
    });

    // ---- the "Create Issue" window
    const issueForm = () => page.locator('form#issueForm:visible').last();
    async function openCreate(ctx) {
        const panel = await issuesPage(ctx, 'Future Issues');
        await panel.getByRole('link', {name: 'Create Issue', exact: true}).click();
        await issueForm().locator('input[name=volume]').waitFor({timeout: T});
        await idle(page); await sleep(300);
        return issueForm();
    }
    async function readForm(f) {
        return f.evaluate((form) => {
            const vis = (e) => e.getClientRects().length;
            const items = [];
            for (const el of form.querySelectorAll('legend, label, .label, input, select, textarea, button, a, .description, p, span.error, label.error')) {
                if (!vis(el)) continue;
                const t = (el.innerText || el.value || '').replace(/\s+/g, ' ').trim();
                if (el.tagName === 'INPUT' && el.type === 'checkbox') items.push(`[${el.checked ? 'x' : ' '}] ${el.name}`);
                else if (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA') items.push(`<${el.tagName.toLowerCase()} ${el.name}${el.type ? ':' + el.type : ''}${el.maxLength > 0 ? ' max' + el.maxLength : ''}${el.accept ? ' accept=' + el.accept : ''}>=${JSON.stringify(el.value)}`);
                else if (t) items.push(`${el.tagName.toLowerCase()}${el.className ? '.' + String(el.className).split(' ')[0] : ''}: ${t.slice(0, 160)}`);
            }
            return items;
        }).catch((e) => [`err ${String(e.message).slice(0, 200)}`]);
    }
    async function fillIdent(f, {v, n, y, title, boxes, date}) {
        if (v !== undefined) await f.locator('input[name=volume]').fill(String(v));
        if (n !== undefined) await f.locator('input[name=number]').fill(String(n));
        if (y !== undefined) await f.locator('input[name=year]').fill(String(y));
        if (title !== undefined) await f.locator('input[name^="title"]').first().fill(title);
        if (date !== undefined) await f.getByRole('group', {name: 'Date Published'}).getByRole('textbox').fill(date);
        if (boxes) for (const [nm, want] of Object.entries(boxes)) {
            const b = f.getByRole('checkbox', {name: nm, exact: true});
            if ((await b.isChecked()) !== want) await b.click();
        }
    }
    /** Press the form's "Save" and report what the screen does: the window closes, or stays with messages. */
    async function saveForm(f, name) {
        const resp = page.waitForResponse((r) => r.request().method() === 'POST' && /update-issue|update-access|update\b|updateIssue|update\?/.test(r.url()), {timeout: T}).catch(() => null);
        await f.getByRole('button', {name: 'Save', exact: true}).click();
        const r = await resp;
        await idle(page); await sleep(700);
        const open = await f.isVisible().catch(() => false);
        const res = {status: r ? r.status() : null, url: r ? r.url().replace(app.baseURL, '').slice(0, 160) : null, windowOpen: open};
        let body = null;
        if (r) { try { body = await r.text(); } catch (e) { /* none */ } }
        if (body) { try { const j = JSON.parse(body); res.json = {status: j.status, hasContent: !!j.content, event: j.event ? (j.event.name || JSON.stringify(j.event).slice(0, 120)) : undefined}; } catch (e) { res.bodyStart = body.slice(0, 200); } }
        if (open) { res.form = await readForm(f); res.messages = await formMessages(f); }
        res.notices = await page.locator('.pkp_notification:visible, [role="alert"]:visible, .ui-pnotify:visible').allInnerTexts().catch(() => []);
        await snap(name, {save: res});
        return res;
    }
    async function cancelWindow() {
        const w = W();
        const c = w.getByRole('link', {name: 'Cancel', exact: true});
        if (await c.count()) await c.first().click().catch(() => {});
        else await w.getByRole('button', {name: 'Close', exact: true}).first().click().catch(() => {});
        await idle(page); await sleep(700);
    }

    // ================================================================== create (Fields "Create Issue", Rules 3–4, A1, td3, td4)
    if (on('create')) await sect('create', async () => {
        const out = {};
        const c0 = C.c0.path;
        await as(`${C.c0.p}mg`, c0);
        let f = await openCreate(c0);
        out.window = await winInfo();
        out.form = await readForm(f);
        out.dateHelp = await f.getByRole('group', {name: 'Date Published'}).innerText().catch(() => null);
        await snap('cr-01-create-window', {win: out.window, form: out.form});
        await loc(page, 'Create Issue: "Volume" box', f.locator('input[name=volume]'));
        await loc(page, 'Create Issue: "Title" box (no accessible name)', f.locator('input[name^="title"]').first());
        await loc(page, 'Create Issue: the "Title" show box', f.getByRole('checkbox', {name: 'Title', exact: true}));
        // A1 / td4 (1): all ticked, no title
        await fillIdent(f, {v: 1, n: 1, y: 2026});
        out.a1 = await saveForm(f, 'cr-02-a1-no-title');
        out.a1.titleBoxArea = await f.locator('input[name=showTitle]').evaluate((b) => (b.closest('li, .pkp_controllers_form_checkboxes, fieldset') || b.parentElement).outerHTML.slice(0, 900)).catch(() => null);
        await cancelWindow();
        let panel = await issuesPage(c0);
        out.a1.listAfter = await listNames(panel);
        // td4 (2): untick all four
        f = await openCreate(c0);
        await fillIdent(f, {v: 1, n: 1, y: 2026, boxes: {Volume: false, Number: false, Year: false, Title: false}});
        out.none = await saveForm(f, 'cr-03-no-box');
        await cancelWindow();
        // td4 (3) and the per-part messages: a ticked part left empty
        for (const [k, boxes, vals] of [
            ['volEmpty', {Volume: true, Number: false, Year: false, Title: false}, {v: '', n: '1', y: '2026'}],
            ['numEmpty', {Volume: false, Number: true, Year: false, Title: false}, {v: '1', n: '', y: '2026'}],
            ['yearEmpty', {Volume: false, Number: false, Year: true, Title: false}, {v: '1', n: '1', y: ''}],
            ['allEmptyTicked', {Volume: true, Number: true, Year: true, Title: true}, {v: '', n: '', y: ''}],
        ]) {
            f = await openCreate(c0);
            await fillIdent(f, {...vals, boxes});
            out[k] = await saveForm(f, `cr-04-${k}`);
            await cancelWindow();
        }
        // td3: Title unticked, Volume 1, Number "2a", Year "20a6"; then Volume 99999; also "abc", a long number, a 5-digit year
        for (const [k, vals] of [
            ['td3a', {v: '1', n: '2a', y: '20a6'}],
            ['td3b', {v: '99999', n: '1', y: '2026'}],
            ['volAlpha', {v: 'abc', n: '1', y: '2026'}],
            ['num41', {v: '7', n: 'N'.repeat(41), y: '2026'}],
            ['year5', {v: '8', n: '1', y: '20261'}],
            ['emptyUnticked', {v: '', n: '', y: '2031'}],
        ]) {
            f = await openCreate(c0);
            const boxes = k === 'emptyUnticked' ? {Volume: false, Number: false, Year: true, Title: false} : {Title: false};
            await fillIdent(f, {...vals, boxes});
            out[k] = {typed: {v: await f.locator('input[name=volume]').inputValue(), n: await f.locator('input[name=number]').inputValue(), y: await f.locator('input[name=year]').inputValue()}};
            Object.assign(out[k], await saveForm(f, `cr-05-${k}`));
            if (out[k].windowOpen) await cancelWindow();
            panel = await issuesPage(c0);
            out[k].listAfter = await listNames(panel);
        }
        // a saved issue: all four ticked, a title
        f = await openCreate(c0);
        await fillIdent(f, {v: 1, n: 2, y: 2014, title: 'Special Issue'});
        out.ok = await saveForm(f, 'cr-06-saved');
        panel = await issuesPage(c0);
        out.ok.listAfter = await readGrid(panel);
        // leaving the window with a change unsaved: "Cancel", then "Close"
        f = await openCreate(c0);
        await f.locator('input[name=volume]').fill('55');
        await f.locator('input[name=volume]').blur();
        const d0 = [];
        const dl = (d) => d0.push({type: d.type(), message: d.message()});
        page.on('dialog', dl);
        await cancelWindow();
        out.cancelUnsaved = {dialogs: [...d0], windowOpen: await f.isVisible().catch(() => false)};
        f = await openCreate(c0);
        await f.locator('input[name=volume]').fill('56');
        await f.locator('input[name=volume]').blur();
        await W().getByRole('button', {name: 'Close', exact: true}).first().click().catch(() => {});
        await idle(page); await sleep(700);
        out.closeUnsaved = {dialogs: d0.slice(out.cancelUnsaved.dialogs.length), windowOpen: await f.isVisible().catch(() => false)};
        page.off('dialog', dl);
        await snap('cr-07-after-close-unsaved');
        panel = await issuesPage(c0);
        out.finalList = await listNames(panel);
        S.c0names = out.finalList; save();
        fact('create', out);
    });

    // ================================================================== a1 (A1: how long the refusal's reason stays, and what the form keeps)
    if (on('a1')) await sect('a1', async () => {
        const out = {};
        const c0 = C.c0.path;
        await as(`${C.c0.p}mg`, c0);
        const f = await openCreate(c0);
        await fillIdent(f, {v: 3, n: 3, y: 2033});
        await f.getByRole('button', {name: 'Save', exact: true}).click();
        const toast = page.locator('.pkp_notification:visible, [role="alert"]:visible, .ui-pnotify:visible').filter({hasText: 'Title is required for the issue.'});
        const t0 = Date.now();
        out.samples = [];
        for (const wait of [500, 3000, 6000, 10000, 16000]) {
            await sleep(Math.max(0, wait - (Date.now() - t0)));
            out.samples.push({ms: wait, toastVisible: await toast.count(), titleBoxMarked: await f.locator('.error, label.error').count()});
            if (wait === 500) await snap('a1-01-toast', {sample: out.samples[0]});
        }
        out.formAfter = await readForm(f);
        out.values = {v: await f.locator('input[name=volume]').inputValue(), n: await f.locator('input[name=number]').inputValue(), y: await f.locator('input[name=year]').inputValue(), showTitle: await f.locator('input[name=showTitle]').isChecked()};
        out.toastRole = await page.locator('.pkp_notification, .ui-pnotify').first().evaluate((e) => ({cls: e.className, role: e.getAttribute('role'), live: e.getAttribute('aria-live'), html: e.outerHTML.slice(0, 400)})).catch(() => null);
        await snap('a1-02-after-16s', out);
        await cancelWindow();
        out.list = await listNames(await issuesPage(c0));
        fact('a1', out);
    });

    // ================================================================== a1b (A1: the refusal's toast by its text, timed from the response; the date box after it)
    if (on('a1b')) await sect('a1b', async () => {
        const out = {};
        const c0 = C.c0.path;
        await as(`${C.c0.p}mg`, c0);
        const f = await openCreate(c0);
        out.dateBefore = await f.getByRole('group', {name: 'Date Published'}).getByRole('textbox').inputValue().catch(() => null);
        await fillIdent(f, {v: 4, n: 4, y: 2034});
        const resp = page.waitForResponse((r) => r.request().method() === 'POST' && /update-issue/.test(r.url()), {timeout: T}).catch(() => null);
        await f.getByRole('button', {name: 'Save', exact: true}).click();
        await resp;
        const t0 = Date.now();
        const toast = page.getByText('Title is required for the issue.', {exact: true});
        out.samples = [];
        for (const wait of [300, 2000, 4000, 6000, 8000, 12000]) {
            await sleep(Math.max(0, wait - (Date.now() - t0)));
            const vis = await toast.evaluateAll((els) => els.filter((e) => e.getClientRects().length).map((e) => { const box = e.closest('[class]'); return {cls: box ? box.className : null, parentCls: e.parentElement && e.parentElement.parentElement ? e.parentElement.parentElement.className : null, role: (e.closest('[role]') || {}).getAttribute ? e.closest('[role]').getAttribute('role') : null}; })).catch(() => []);
            out.samples.push({ms: wait, visible: vis.length, where: vis[0] || null});
        }
        await f.evaluate((el) => el.closest('[role=dialog]') && el.scrollIntoView({block: 'start'})).catch(() => {});
        await f.getByRole('group', {name: 'Date Published'}).scrollIntoViewIfNeeded().catch(() => {});
        out.dateAfter = await f.getByRole('group', {name: 'Date Published'}).getByRole('textbox').inputValue().catch(() => null);
        await snap('a1b-01-form-top', out);
        // untick "Title" and save as it stands: which date does the new issue carry?
        await fillIdent(f, {boxes: {Title: false}});
        out.secondSave = await saveForm(f, 'a1b-02-saved-after-untick');
        const panel = await issuesPage(c0);
        out.list = await listNames(panel);
        const f2 = await openData(c0, 'Vol. 4 No. 4 (2034)').catch(() => null);
        if (f2) { out.savedDate = await f2.getByRole('group', {name: 'Date Published'}).getByRole('textbox').inputValue().catch(() => null); await snap('a1b-03-saved-issue-data', {savedDate: out.savedDate}); await cancelWindow(); }
        fact('a1b', out);
    });

    /** Open an issue's "Issue Data" tab; returns the form. */
    async function openData(ctx, name, tab = 'Future Issues') {
        await openIssue(ctx, name, tab);
        const panel = await windowTab('Issue Data');
        const f = panel.locator('form#issueForm');
        await f.locator('input[name=volume]').waitFor({timeout: T});
        await idle(page); await sleep(300);
        return f;
    }
    const issueIdOf = async (ctx, name, tab = 'Future Issues') => {
        const panel = await issuesPage(ctx, tab);
        const href = await panel.getByRole('link', {name, exact: true}).first().getAttribute('href').catch(() => null);
        return href && (href.match(/issueId=(\d+)/) || [])[1];
    };
    /** After a save on "Issue Data": the page behind the window, read at once by CSS (the window hides it from role queries). */
    const behindNow = async () => page.locator('main').evaluate((m) => [...m.querySelectorAll('tr.gridRow')].map((tr) => tr.innerText.replace(/\s+/g, ' ').trim())).catch(() => []);

    // ================================================================== names (Rule 2; Rule 6's "at once")
    if (on('names')) await sect('names', async () => {
        const out = {c0: [], c2: {}};
        const c0 = C.c0.path;
        await as(`${C.c0.p}mg`, c0);
        const nameOf = async (iss) => (await (await issuesPage(c0)).locator(`a[href*="edit-issue?issueId=${iss}"]`).first().innerText().catch(() => '')).trim();
        let id = S.c0id || await issueIdOf(c0, 'Vol. 1 No. 2 (2014): Special Issue');
        if (!id) {
            const rows = await (await issuesPage(c0)).locator('tr.gridRow').evaluateAll((els) => els.map((e) => ({id: e.id, t: e.innerText})));
            const hit = rows.find((r) => /2014/.test(r.t));
            id = hit && (hit.id.match(/row-(\d+)/) || [])[1];
        }
        S.c0id = id; save();
        let name = await nameOf(id);
        out.startName = name;
        out.id = id;
        for (const [k, boxes] of [
            ['all0', {Volume: true, Number: true, Year: true, Title: true}],
            ['VY', {Volume: true, Number: false, Year: true, Title: false}],
            ['T', {Volume: false, Number: false, Year: false, Title: true}],
            ['Y', {Volume: false, Number: false, Year: true, Title: false}],
            ['YT', {Volume: false, Number: false, Year: true, Title: true}],
            ['NY', {Volume: false, Number: true, Year: true, Title: false}],
            ['VT', {Volume: true, Number: false, Year: false, Title: true}],
            ['all', {Volume: true, Number: true, Year: true, Title: true}],
        ]) {
            const f = await openData(c0, name);
            await fillIdent(f, {boxes});
            const r = await saveForm(f, `nm-01-${k}`);
            const behind = await behindNow();
            const win = await winInfo();
            await cancelWindow();
            const panel = await issuesPage(c0);
            const list = await listNames(panel);
            const row = list.find((x) => !/^No Items/.test(x) && x.includes('')) || null;
            const pv = await land(`/index.php/${c0}/issue/view/${id}`, `nm-02-${k}-page`);
            out.c0.push({k, boxes, save: {windowOpen: r.windowOpen, notices: r.notices, status: r.status}, behindAtOnce: behind, windowTitleAfter: win.title, list, pageH1: pv.h1, pageTitle: pv.title});
            // the new name: the row whose link has this issue's id
            name = await nameOf(id);
            out.c0[out.c0.length - 1].nameNow = name;
        }
        S.c0name = name; S.c0id = id; save();
        // a ticked "Title" with the title in French only, read in English and in French
        const c2 = C.c2.path;
        await as(`${C.c2.p}mg`, c2);
        const f = await openCreate(c2);
        out.c2.form = await readForm(f);
        await fillIdent(f, {v: 5, n: 1, y: 2030});
        const en = f.locator('input[name="title[en]"]');
        await en.click();
        await sleep(400);
        out.c2.frBoxVisible = await f.locator('input[name="title[fr_CA]"]').isVisible().catch(() => false);
        await snap('nm-03-c2-title-fr-open', {form: await readForm(f)});
        await f.locator('input[name="title[fr_CA]"]').fill('Numéro spécial K1').catch((e) => { out.c2.frFillError = String(e.message).slice(0, 200); });
        out.c2.save = await saveForm(f, 'nm-04-c2-fr-only-saved');
        if (out.c2.save.windowOpen) await cancelWindow();
        out.c2.listEn = await listNames(await issuesPage(c2));
        const fid = await issueIdOf(c2, 'Vol. 5 No. 1 (2030)').catch(() => null);
        out.c2.id = fid;
        if (fid) out.c2.pageEn = brief(await land(`/index.php/${c2}/issue/view/${fid}`, 'nm-05-c2-page-en'));
        await page.goto(cUrl(c2, '/fr_CA/manageIssues')); await idle(page);
        await page.getByRole('main').locator('table').first().waitFor({timeout: T}).catch(() => {});
        await idle(page);
        out.c2.listFr = await page.getByRole('main').evaluate((m) => [...m.querySelectorAll('tr.gridRow')].map((tr) => tr.innerText.replace(/\s+/g, ' ').trim())).catch(() => []);
        await snap('nm-06-c2-list-fr');
        if (fid) out.c2.pageFr = brief(await land(`/index.php/${c2}/fr_CA/issue/view/${fid}`, 'nm-07-c2-page-fr'));
        await page.goto(cUrl(c2, '/en/manageIssues')); await idle(page);
        fact('names', out);
    });

    // ================================================================== data (Fields "Issue Data", Rule 6)
    if (on('data')) await sect('data', async () => {
        const out = {};
        const c1 = C.c1.path;
        await as(`${C.c1.p}mg`, c1);
        // an unpublished issue's form; a save with a changed part
        let f = await openData(c1, 'Vol. 3 No. 1 (2025)');
        out.unpub = {win: await winInfo(), form: await readForm(f), dateGroup: flat(await f.getByRole('group', {name: 'Date Published'}).innerText().catch(() => null))};
        await snap('da-01-unpublished-data', out.unpub);
        await loc(page, 'Issue Data: the "Date Published" box', f.getByRole('group', {name: 'Date Published'}).getByRole('textbox'));
        await f.locator('input[name=number]').fill('5');
        out.unpub.save = await saveForm(f, 'da-02-unpublished-saved');
        out.unpub.behindAtOnce = await behindNow();
        out.unpub.winAfter = await winInfo();
        await cancelWindow();
        out.unpub.listAfter = await listNames(await issuesPage(c1));
        // a published issue: the date emptied, then changed
        f = await openData(c1, 'Vol. 1 No. 1 (2024)', 'Back Issues');
        out.pub = {form: await readForm(f), dateGroup: flat(await f.getByRole('group', {name: 'Date Published'}).innerText().catch(() => null)), dateValue: await f.getByRole('group', {name: 'Date Published'}).getByRole('textbox').inputValue().catch(() => null)};
        await snap('da-03-published-data', out.pub);
        await f.getByRole('group', {name: 'Date Published'}).getByRole('textbox').fill('');
        await page.keyboard.press('Escape').catch(() => {});
        out.pub.emptySave = await saveForm(f, 'da-04-published-date-emptied');
        await cancelWindow();
        f = await openData(c1, 'Vol. 1 No. 1 (2024)', 'Back Issues');
        await f.getByRole('group', {name: 'Date Published'}).getByRole('textbox').fill('2024-03-15');
        await f.locator('input[name=volume]').click();
        out.pub.changeSave = await saveForm(f, 'da-05-published-date-changed');
        await cancelWindow();
        out.pub.backList = await readGrid(await issuesPage(c1, 'Back Issues'));
        const P1 = iid('c1', 1, 1, 2024);
        const pv = await land(`/index.php/${c1}/issue/view/${P1}`, 'da-06-published-page');
        out.pub.pageDate = await page.locator('.published, .heading .published, .obj_issue_toc .published').allInnerTexts().catch(() => []);
        out.pub.pageH1 = pv.h1;
        // the forms of a single-language and a two-language journal
        f = await openData(c1, 'Vol. 2 No. 1 (2027)');
        out.c1TitleInputs = await f.locator('input[name^="title"]').evaluateAll((els) => els.map((e) => ({name: e.name, visible: !!e.getClientRects().length})));
        out.c1DescTextareas = await f.locator('textarea[name^="description"]').evaluateAll((els) => els.map((e) => e.name));
        // leaving the tab and the window with a change unsaved
        await f.locator('input[name=volume]').fill('22');
        await f.locator('input[name=volume]').blur();
        const d0 = [];
        const dl = (d) => d0.push({type: d.type(), message: d.message()});
        page.on('dialog', dl);
        await W().getByRole('tab', {name: 'Table of Contents', exact: true}).click(); await idle(page); await sleep(700);
        out.leaveTab = {dialogs: [...d0], win: await winInfo(), dialogsVisible: await page.locator('[role="dialog"]:visible').count()};
        await snap('da-07-left-tab-unsaved', out.leaveTab);
        await W().getByRole('tab', {name: 'Issue Data', exact: true}).click(); await idle(page); await sleep(700);
        out.leaveTab.volumeBack = await W().locator('input[name=volume]').inputValue().catch(() => null);
        await W().locator('input[name=volume]').fill('23').catch(() => {});
        await W().locator('input[name=volume]').blur().catch(() => {});
        await W().getByRole('button', {name: 'Close', exact: true}).first().click().catch(() => {});
        await idle(page); await sleep(700);
        out.leaveWindow = {dialogs: d0.slice(out.leaveTab.dialogs.length), dialogsVisible: await page.locator('[role="dialog"]:visible').count(), topDialog: flat(await W().innerText().catch(() => null), 300)};
        await snap('da-08-left-window-unsaved', out.leaveWindow);
        page.off('dialog', dl);
        out.listAfterLeave = await listNames(await issuesPage(c1));
        // two form languages; a description typed and shown on the issue's page and the archive
        const c2 = C.c2.path;
        await as(`${C.c2.p}mg`, c2);
        f = await openData(c2, 'Vol. 1 No. 1 (2025)', 'Back Issues');
        out.c2 = {form: await readForm(f), titleInputs: await f.locator('input[name^="title"]').evaluateAll((els) => els.map((e) => ({name: e.name, visible: !!e.getClientRects().length}))), descTextareas: await f.locator('textarea[name^="description"]').evaluateAll((els) => els.map((e) => e.name))};
        await snap('da-09-c2-data', out.c2);
        const frame = f.frameLocator('iframe').first();
        await frame.locator('body').click();
        await page.keyboard.type('K1 description English text');
        out.c2.save = await saveForm(f, 'da-10-c2-description-saved');
        await cancelWindow();
        const S2 = iid('c2', 1, 1, 2025);
        await visitor();
        await land(`/index.php/${c2}/issue/view/${S2}`, 'da-11-c2-page-desc');
        out.c2.pageDesc = await page.locator('.description').allInnerTexts().catch(() => []);
        await land(`/index.php/${c2}/issue/archive`, 'da-12-c2-archive-desc');
        out.c2.archiveDesc = await page.locator('.obj_issue_summary .description, .issues_archive .description').allInnerTexts().catch(() => []);
        out.c2.archiveText = flat(await page.locator('.issues_archive, .page_issue_archive').first().innerText().catch(() => null), 600);
        fact('data', out);
    });

    // ================================================================== date2 (Rule 6: a typed and a picked date on a published issue; the save notice, timed)
    async function saveWatch(f, name) {
        let posted = null;
        const onReq = (r) => { if (r.method() === 'POST' && /update-issue/.test(r.url())) posted = r.postData(); };
        page.on('request', onReq);
        const resp = page.waitForResponse((r) => r.request().method() === 'POST' && /update-issue/.test(r.url()), {timeout: T}).catch(() => null);
        await f.getByRole('button', {name: 'Save', exact: true}).click();
        const r = await resp;
        const t0 = Date.now();
        const seen = [];
        const txt = page.getByText('Your changes have been saved.', {exact: true});
        while (Date.now() - t0 < 6000) {
            const n = await txt.evaluateAll((els) => els.filter((e) => e.getClientRects().length).length).catch(() => 0);
            if (n) seen.push(Date.now() - t0);
            await sleep(200);
        }
        page.off('request', onReq);
        const params = posted ? Object.fromEntries([...new URLSearchParams(posted)].filter(([k]) => /date|volume|number|year/i.test(k))) : null;
        const res = {status: r ? r.status() : null, noticeSeenAtMs: seen.length ? [seen[0], seen[seen.length - 1]] : null, posted: params, windowOpen: await f.isVisible().catch(() => false)};
        await snap(name, res);
        return res;
    }
    if (on('date2')) await sect('date2', async () => {
        const out = {};
        const c1 = C.c1.path;
        const P1 = iid('c1', 1, 1, 2024);
        await as(`${C.c1.p}mg`, c1);
        let f = await openData(c1, 'Vol. 1 No. 1 (2024)', 'Back Issues');
        const box = () => f.getByRole('group', {name: 'Date Published'}).getByRole('textbox');
        out.before = await box().inputValue();
        out.hidden = await f.locator('input[name="datePublished"]').evaluateAll((els) => els.map((e) => ({type: e.type, value: e.value}))).catch(() => []);
        await box().click();
        await page.keyboard.press('ControlOrMeta+a');
        await page.keyboard.type('2024-03-15');
        await page.keyboard.press('Tab');
        out.typedShown = await box().inputValue();
        out.hiddenAfterType = await f.locator('input[name="datePublished"]').evaluateAll((els) => els.map((e) => e.value)).catch(() => []);
        out.typed = await saveWatch(f, 'd2-01-typed-date-saved');
        if (out.typed.windowOpen) await cancelWindow();
        out.backAfterTyped = await listNames(await issuesPage(c1, 'Back Issues'));
        f = await openData(c1, 'Vol. 1 No. 1 (2024)', 'Back Issues');
        out.reopenedTyped = await box().inputValue();
        // the date picker
        await box().click(); await sleep(500);
        const dp = page.locator('#ui-datepicker-div');
        out.pickerVisible = await dp.isVisible().catch(() => false);
        if (out.pickerVisible) {
            out.pickerMonth = flat(await dp.locator('.ui-datepicker-title').innerText().catch(() => null));
            await snap('d2-02-picker-open', {month: out.pickerMonth});
            await dp.locator('a.ui-state-default', {hasText: /^20$/}).first().click();
            await sleep(300);
            out.pickedShown = await box().inputValue();
            out.hiddenAfterPick = await f.locator('input[name="datePublished"]').evaluateAll((els) => els.map((e) => e.value)).catch(() => []);
            out.picked = await saveWatch(f, 'd2-03-picked-date-saved');
            if (out.picked.windowOpen) await cancelWindow();
        }
        out.backAfterPicked = await readGrid(await issuesPage(c1, 'Back Issues'));
        await land(`/index.php/${c1}/issue/view/${P1}`, 'd2-04-issue-page');
        out.pageDate = await page.locator('.published').allInnerTexts().catch(() => []);
        // an unpublished issue: a name change, the notice timed
        f = await openData(c1, 'Vol. 1 No. 1 (2026)');
        await f.locator('input[name=number]').fill('1');
        out.unpubSave = await saveWatch(f, 'd2-05-unpublished-saved');
        fact('date2', out);
    });

    // ================================================================== cover (Rule 7, td5)
    if (on('cover')) await sect('cover', async () => {
        const out = {};
        const c1 = C.c1.path;
        await as(`${C.c1.p}mg`, c1);
        const name = 'Vol. 1 No. 10 (2026)';
        let f = await openData(c1, name);
        out.fileInputs = await f.locator('input[type=file]').evaluateAll((els) => els.map((e) => ({accept: e.accept, name: e.name, multiple: e.multiple})));
        out.coverGroup = flat(await f.getByRole('group', {name: 'Cover image'}).innerText().catch(() => null));
        await loc(page, 'Issue Data: cover image file input', f.locator('input[type=file]').first());
        // an SVG
        const up = () => page.waitForResponse((r) => /upload-file|uploadFile/.test(r.url()) && r.request().method() === 'POST', {timeout: T}).catch(() => null);
        let u = up();
        await f.locator('input[type=file]').first().setInputFiles({name: 'k1-cover.svg', mimeType: 'image/svg+xml', buffer: SVG});
        let ur = await u;
        out.svgUpload = {status: ur ? ur.status() : null, body: ur ? (await ur.text().catch(() => '')).slice(0, 300) : null};
        await sleep(800);
        out.svgAfterUpload = flat(await f.getByRole('group', {name: 'Cover image'}).innerText().catch(() => null));
        await snap('co-01-svg-uploaded');
        out.svgSave = await saveForm(f, 'co-02-svg-saved');
        if (out.svgSave.windowOpen) await cancelWindow();
        // a PNG, saved; the tab reopened
        f = await openData(c1, name);
        u = up();
        await f.locator('input[type=file]').first().setInputFiles(fx('profile-image-400.png'));
        ur = await u;
        out.pngUpload = {status: ur ? ur.status() : null};
        await sleep(800);
        out.pngSave = await saveForm(f, 'co-03-png-saved');
        if (out.pngSave.windowOpen) await cancelWindow();
        f = await openData(c1, name);
        out.reopened = {form: await readForm(f), img: await f.locator('img').evaluateAll((els) => els.map((e) => ({src: e.getAttribute('src'), alt: e.alt}))), coverGroup: flat(await f.getByRole('group', {name: 'Cover image'}).innerText().catch(() => null))};
        await snap('co-04-reopened', out.reopened);
        const alt = f.locator('input[name^="coverImageAltText"]').first();
        out.altBox = await alt.count();
        if (out.altBox) {
            await loc(page, 'Issue Data: "Alternate text" box', alt);
            await alt.fill('K1 cover alt');
            out.altSave = await saveForm(f, 'co-05-alt-saved');
            if (out.altSave.windowOpen) await cancelWindow();
            f = await openData(c1, name);
            out.altAfter = await f.locator('input[name^="coverImageAltText"]').first().inputValue().catch(() => null);
        }
        // "Delete"
        const del = f.getByRole('link', {name: 'Delete', exact: true}).or(f.getByRole('button', {name: 'Delete', exact: true})).first();
        out.deleteCount = await del.count();
        if (out.deleteCount) {
            await del.click(); await idle(page); await sleep(700);
            const conf = page.locator('[role="dialog"]:visible').last();
            out.confirm = {text: flat(await conf.innerText().catch(() => null), 400), title: flat(await conf.locator('h1,h2,h3,.pkp_modal_title, [id$="-title"]').first().innerText().catch(() => null), 120)};
            await snap('co-06-delete-confirm', out.confirm);
            const ok = conf.getByRole('button', {name: 'OK', exact: true}).or(conf.getByRole('link', {name: 'OK', exact: true})).first();
            await ok.click().catch(() => {});
            await idle(page); await sleep(900);
            out.afterDelete = {form: await readForm(W().locator('form#issueForm')), img: await W().locator('form#issueForm img').count()};
            await snap('co-07-after-delete', out.afterDelete);
            await cancelWindow();
            f = await openData(c1, name);
            out.afterDeleteReopen = {img: await f.locator('img').count(), alt: await f.locator('input[name^="coverImageAltText"]').count(), coverGroup: flat(await f.getByRole('group', {name: 'Cover image'}).innerText().catch(() => null))};
            await cancelWindow();
        }
        // which language the cover belongs to: saved in English on a two-language journal, read in French
        const c2 = C.c2.path;
        await as(`${C.c2.p}mg`, c2);
        f = await openData(c2, 'Vol. 1 No. 1 (2026)');
        u = up();
        await f.locator('input[type=file]').first().setInputFiles(fx('profile-image-400.png'));
        await u; await sleep(800);
        out.c2Save = await saveForm(f, 'co-08-c2-png-saved-en');
        if (out.c2Save.windowOpen) await cancelWindow();
        f = await openData(c2, 'Vol. 1 No. 1 (2026)');
        out.c2En = {img: await f.locator('img').count()};
        await cancelWindow();
        await page.goto(cUrl(c2, '/fr_CA/manageIssues')); await idle(page);
        const mainTbl = page.getByRole('main').locator('table').first();
        await mainTbl.waitFor({timeout: T}).catch(() => {});
        await page.getByRole('main').getByRole('link', {name: 'Vol. 1 No. 1 (2026)', exact: true}).first().click().catch(() => {});
        await page.waitForFunction(() => { const d = [...document.querySelectorAll('[role=dialog]')].filter((e) => e.getClientRects().length).pop(); return d && d.querySelector('[role=tab]'); }, null, {timeout: T}).catch(() => {});
        await idle(page);
        out.c2FrTabs = (await W().getByRole('tab').allInnerTexts().catch(() => [])).map((x) => x.trim());
        await W().getByRole('tab').nth(1).click().catch(() => {}); await idle(page); await sleep(600);
        await W().locator('form#issueForm input[name=volume]').waitFor({timeout: T}).catch(() => {});
        out.c2Fr = {img: await W().locator('form#issueForm img').count(), coverGroup: flat(await W().locator('form#issueForm').innerText().catch(() => null), 900)};
        await snap('co-09-c2-data-fr', out.c2Fr);
        await page.goto(cUrl(c2, '/en/manageIssues')); await idle(page);
        fact('cover', out);
    });

    // ================================================================== urlpath (Rule 8, td6)
    if (on('urlpath')) await sect('urlpath', async () => {
        const out = {};
        const c1 = C.c1.path;
        await as(`${C.c1.p}mg`, c1);
        let f = await openData(c1, 'Vol. 2 No. 1 (2027)');
        out.help = flat(await f.locator('input[name=urlPath]').evaluate((i) => (i.closest('.section, fieldset, div') || i.parentElement).innerText).catch(() => null));
        await f.locator('input[name=urlPath]').fill('spring-2026');
        out.ok = await saveForm(f, 'up-01-saved');
        if (out.ok.windowOpen) await cancelWindow();
        for (const [k, v] of [['dup', 'spring-2026'], ['digits', '123'], ['space', 'a b'], ['dots', 'a..b'], ['lead', '-ab'], ['accent', 'é1']]) {
            f = await openData(c1, 'Vol. 1 No. 10 (2026)');
            await f.locator('input[name=urlPath]').fill(v);
            out[k] = await saveForm(f, `up-02-${k}`);
            if (out[k].windowOpen) await cancelWindow();
        }
        const id = iid('c1', 2, 1, 2027);
        out.byPath = brief(await land(`/index.php/${c1}/issue/view/spring-2026`, 'up-03-by-path'));
        out.byId = brief(await land(`/index.php/${c1}/issue/view/${id}`, 'up-04-by-id'));
        const panel = await issuesPage(c1);
        const r = await rowActions(issueRow(panel, 'Vol. 2 No. 1 (2027)'));
        out.previewHref = await r.ctl.getByRole('link', {name: 'Preview', exact: true}).getAttribute('href').catch(() => null);
        out.previewPopup = await popupFrom(() => r.ctl.getByRole('link', {name: 'Preview', exact: true}).click());
        fact('urlpath', out);
    });

    /** The "Publish Issue" window of a row, read top to bottom by position; then "Cancel". */
    async function readPublishWindow(ctx, name, snapName) {
        const panel = await issuesPage(ctx);
        const r = await rowActions(issueRow(panel, name));
        await r.ctl.getByRole('link', {name: 'Publish Issue', exact: true}).click();
        const w = page.locator('[role="dialog"]:visible').filter({has: page.getByRole('heading', {name: 'Publish Issue'})}).last();
        await w.locator('form').first().waitFor({timeout: T}).catch(() => {});
        await idle(page); await sleep(500);
        const items = await w.evaluate((d) => {
            const vis = (e) => e.getClientRects().length;
            const form = d.querySelector('form') || d;
            return [...form.querySelectorAll('p, label, legend, input, button, a, h1, h2, h3, .description, span.label')].filter(vis).map((e) => ({tag: e.tagName.toLowerCase(), type: e.type || undefined, checked: e.type === 'checkbox' ? e.checked : undefined, name: e.name || undefined, t: (e.innerText || e.value || '').replace(/\s+/g, ' ').trim().slice(0, 200), y: Math.round(e.getBoundingClientRect().y)})).sort((a, b) => a.y - b.y);
        }).catch((e) => [{err: String(e.message).slice(0, 200)}]);
        await snap(snapName, {items});
        const cancel = w.getByRole('link', {name: 'Cancel', exact: true}).or(w.getByRole('button', {name: 'Cancel', exact: true})).first();
        await cancel.click().catch(() => {});
        await idle(page); await sleep(600);
        const after = await listNames(await issuesPage(ctx));
        return {items, rowLinks: r.links, afterCancel: after};
    }

    // ================================================================== window (Rule 5; the "Publish Issue" window's Fields)
    if (on('window')) await sect('window', async () => {
        const out = {};
        for (const key of ['c1', 'c5', 'c6', 'c7', 'c2']) {
            await as(`${C[key].p}mg`, C[key].path);
            await openIssue(C[key].path, 'Vol. 1 No. 1 (2026)');
            out[key] = await winInfo();
            await snap(`wi-01-${key}-tabs`, {win: out[key]});
            if (out[key].tabs.includes('Identifiers')) {
                await windowTab('Identifiers');
                out[key].identifiers = flat(await W().getByRole('tabpanel', {name: 'Identifiers'}).innerText().catch(() => null), 800);
                await snap(`wi-02-${key}-identifiers`);
            }
            await cancelWindow();
            if (key === 'c1' || key === 'c7') out[`${key}Publish`] = await readPublishWindow(C[key].path, 'Vol. 1 No. 1 (2026)', `wi-03-${key}-publish-window`);
        }
        fact('window', out);
    });

    // ================================================================== access (Fields "Access"; the TOC "Open Access" column's axis)
    if (on('access')) await sect('access', async () => {
        const out = {};
        const c2 = C.c2.path;
        await as(`${C.c2.p}mg`, c2);
        const tocCols = async (name, tab) => {
            await openIssue(c2, name, tab);
            const g = await readGrid(W());
            await cancelWindow();
            return g;
        };
        out.tocBefore = await tocCols('Vol. 1 No. 1 (2026)');
        await openIssue(c2, 'Vol. 1 No. 1 (2026)');
        const panel = await windowTab('Access');
        await panel.locator('form').first().waitFor({timeout: T}).catch(() => {});
        await idle(page); await sleep(400);
        const form = panel.locator('form').first();
        out.form = await readForm(form);
        out.options = await form.locator('select').first().evaluate((s) => [...s.options].map((o) => ({v: o.value, t: o.text, sel: o.selected}))).catch(() => null);
        out.required = await form.evaluate((f) => [...f.querySelectorAll('.req, .required, abbr, span.req')].map((e) => e.innerText)).catch(() => []);
        await snap('ac-01-access-tab', out);
        await loc(page, 'Issue Management › Access: "Access status" list', form.locator('select').first());
        await form.locator('select').first().selectOption({label: 'Open access'});
        out.saveOpen = await saveForm(form, 'ac-02-set-open');
        await cancelWindow();
        out.tocAfterOpen = await tocCols('Vol. 1 No. 1 (2026)');
        await openIssue(c2, 'Vol. 1 No. 1 (2026)');
        const p2 = await windowTab('Access');
        const form2 = p2.locator('form').first();
        await form2.locator('select').first().waitFor({timeout: T});
        out.reopenValue = await form2.locator('select').first().evaluate((s) => s.options[s.selectedIndex].text).catch(() => null);
        await form2.locator('select').first().selectOption({label: 'Subscription'});
        out.saveSub = await saveForm(form2, 'ac-03-set-subscription');
        await cancelWindow();
        out.tocAfterSub = await tocCols('Vol. 1 No. 1 (2026)');
        // the published issue's Access tab
        await openIssue(c2, 'Vol. 1 No. 1 (2025)', 'Back Issues');
        const p3 = await windowTab('Access');
        await p3.locator('form').first().waitFor({timeout: T}).catch(() => {});
        out.publishedForm = await readForm(p3.locator('form').first());
        await snap('ac-04-published-access');
        await cancelWindow();
        fact('access', out);
    });

    // ================================================================== toc (Fields "Table of Contents", Rules 9, 11, 13)
    if (on('toc')) await sect('toc', async () => {
        const out = {};
        const c1 = C.c1.path;
        await as(`${C.c1.p}mg`, c1);
        await openIssue(c1, 'Vol. 1 No. 2 (2026)');
        const w = W();
        await w.locator('tr.gridRow').first().waitFor({timeout: T}).catch(() => {});
        out.full = {grid: await readGrid(w), links: (await w.getByRole('tabpanel', {name: 'Table of Contents'}).locator('a:visible').allInnerTexts().catch(() => [])).map((x) => x.trim()).filter(Boolean),
            rowsHtml: await w.locator('table').first().evaluate((t) => [...t.querySelectorAll('tr')].map((tr) => `${tr.className}|${tr.id}|${tr.innerText.replace(/\s+/g, ' ').trim().slice(0, 80)}`)).catch(() => [])};
        await snap('to-01-toc', out.full);
        const art = w.locator('tr.gridRow').filter({hasText: S.s.s1.title}).first();
        await loc(page, 'Issue Management › Table of Contents: an article row', art);
        const ra = await rowActions(art);
        out.articleActions = ra.links;
        await snap('to-02-article-actions', {links: ra.links});
        const nav = page.waitForURL((u) => /workflowSubmissionId|workflow/.test(String(u)), {timeout: T}).catch(() => null);
        await ra.ctl.getByRole('link', {name: 'Submission', exact: true}).click();
        await nav; await idle(page); await sleep(800);
        out.submission = {url: page.url().replace(app.baseURL, ''), dialogTitle: flat(await page.locator('[role="dialog"]:visible h1, [role="dialog"]:visible h2').first().innerText().catch(() => null), 200)};
        await snap('to-03-submission', out.submission);
        await openIssue(c1, 'Vol. 1 No. 1 (2026)');
        out.empty = await readGrid(W());
        await snap('to-04-empty');
        await cancelWindow();
        // "Open Access" on a subscription journal's subscription issue
        const c2 = C.c2.path;
        await as(`${C.c2.p}mg`, c2);
        await openIssue(c2, 'Vol. 1 No. 1 (2025)', 'Back Issues');
        const w2 = W();
        await w2.locator('tr.gridRow').first().waitFor({timeout: T}).catch(() => {});
        const row = w2.locator('tr.gridRow').filter({hasText: S.s.t2.title}).first();
        out.oa = {grid: await readGrid(w2), control: await row.locator('input[type=checkbox], a, button').evaluateAll((els) => els.map((e) => ({tag: e.tagName, type: e.type, checked: e.checked, cls: e.className, aria: e.getAttribute('aria-label'), title: e.getAttribute('title'), t: (e.innerText || '').trim()})))};
        await snap('to-05-oa-before', out.oa);
        const box = row.locator('input[type=checkbox]').first();
        await loc(page, 'Table of Contents: the "Open Access" box of an article', box);
        const set = () => page.waitForResponse((r) => /set-access-status|setAccessStatus/i.test(r.url()), {timeout: T}).catch(() => null);
        let rs = set();
        await box.click();
        let resp = await rs;
        out.oa.tick = {status: resp ? resp.status() : null, url: resp ? resp.url().replace(app.baseURL, '').slice(0, 160) : null, checkedNow: await box.isChecked().catch(() => null)};
        await idle(page); await sleep(500);
        await cancelWindow();
        await openIssue(c2, 'Vol. 1 No. 1 (2025)', 'Back Issues');
        const row2 = W().locator('tr.gridRow').filter({hasText: S.s.t2.title}).first();
        await row2.waitFor({timeout: T});
        out.oa.afterReopen = await row2.locator('input[type=checkbox]').first().isChecked().catch(() => null);
        out.oa.otherAfterReopen = await W().locator('tr.gridRow').filter({hasText: S.s.t3.title}).first().locator('input[type=checkbox]').first().isChecked().catch(() => null);
        await snap('to-06-oa-ticked-reopened', {afterReopen: out.oa.afterReopen});
        rs = set();
        await row2.locator('input[type=checkbox]').first().click();
        resp = await rs;
        out.oa.untick = {status: resp ? resp.status() : null};
        await idle(page); await sleep(500);
        await cancelWindow();
        await openIssue(c2, 'Vol. 1 No. 1 (2025)', 'Back Issues');
        const row3 = W().locator('tr.gridRow').filter({hasText: S.s.t2.title}).first();
        await row3.waitFor({timeout: T});
        out.oa.afterUntick = await row3.locator('input[type=checkbox]').first().isChecked().catch(() => null);
        await cancelWindow();
        // what a reader sees on the issue's page for the ticked article is Subscriptions & open access control's; one read for the record
        fact('toc', out);
    });

    /** "Order" mode on the open TOC tab: drag the row matched by `src` to just above the row matched by `dst`. */
    async function dragRow(srcLoc, dstLoc, below = false) {
        const handle = srcLoc.locator('.pkp_helpers_move_handle, .ordering_handle, [class*="move"], [class*="handle"]').first();
        const hs = (await handle.count()) ? handle : srcLoc;
        await hs.scrollIntoViewIfNeeded().catch(() => {});
        const a = await hs.boundingBox();
        const b = await dstLoc.boundingBox();
        if (!a || !b) return {moved: false, reason: 'no box'};
        await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
        await page.mouse.down();
        const ty = below ? b.y + b.height + 6 : b.y + 4;
        for (let i = 1; i <= 15; i++) { await page.mouse.move(a.x + a.width / 2, a.y + (ty - a.y) * (i / 15)); await sleep(40); }
        await sleep(200);
        await page.mouse.up();
        await sleep(500);
        return {moved: true, from: Math.round(a.y), to: Math.round(ty)};
    }
    const tocOrder = async () => W().locator('table').first().evaluate((t) => [...t.querySelectorAll('tr')].filter((tr) => tr.getClientRects().length && !tr.classList.contains('row_controls')).map((tr) => `${/category/.test(tr.className) ? '# ' : ''}${tr.innerText.replace(/\s+/g, ' ').trim().slice(0, 60)}`).filter((x) => x && x !== '#')).catch(() => []);
    const pageOrder = async (ctx, id, name) => {
        await land(`/index.php/${ctx}/issue/view/${id}`, name);
        return page.locator('.obj_issue_toc .sections, .obj_issue_toc').first().evaluate((r) => [...r.querySelectorAll('h2, h3, .title a')].map((e) => `${/^H/.test(e.tagName) ? '# ' : ''}${e.innerText.trim().slice(0, 60)}`)).catch(() => []);
    };

    // ================================================================== order (Rule 10, td7)
    if (on('order')) await sect('order', async () => {
        const out = {};
        const c1 = C.c1.path;
        await as(`${C.c1.p}mg`, c1);
        const F = iid('c1', 1, 2, 2026); const P1 = iid('c1', 1, 1, 2024);
        await openIssue(c1, 'Vol. 1 No. 2 (2026)');
        await W().locator('tr.gridRow').first().waitFor({timeout: T}).catch(() => {});
        out.never = {tab: await tocOrder()};
        await cancelWindow();
        out.never.page = await pageOrder(c1, F, 'or-01-page-never-ordered');
        // "Order": what the mode offers; "Cancel ordering" after a drag
        await openIssue(c1, 'Vol. 1 No. 2 (2026)');
        const tp = W().getByRole('tabpanel', {name: 'Table of Contents'});
        await tp.getByRole('link', {name: 'Order', exact: true}).click(); await idle(page); await sleep(500);
        out.mode = {links: (await tp.locator('a:visible, button:visible').allInnerTexts()).map((x) => x.trim()).filter(Boolean), html: await W().locator('table').first().evaluate((t) => t.outerHTML.replace(/\s+/g, ' ').slice(0, 3000)).catch(() => null)};
        await snap('or-02-order-mode', {links: out.mode.links});
        const cat = (title) => W().locator('tr.gridRow:not(.has_extras)').filter({hasText: new RegExp(`^\\s*${title}\\s*$`)}).first();
        out.dragCancel = await dragRow(cat('Reviews'), cat('Articles'));
        out.dragCancel.during = await tocOrder();
        await tp.getByRole('link', {name: 'Cancel ordering', exact: true}).or(tp.getByRole('button', {name: 'Cancel ordering', exact: true})).first().click().catch((e) => { out.dragCancel.cancelErr = String(e.message).slice(0, 200); });
        await idle(page); await sleep(500);
        out.dragCancel.after = await tocOrder();
        await cancelWindow();
        await openIssue(c1, 'Vol. 1 No. 2 (2026)');
        await W().locator('tr.gridRow').first().waitFor({timeout: T}).catch(() => {});
        out.dragCancel.reopened = await tocOrder();
        // sections: Reviews above Articles, "Done"
        const tp2 = W().getByRole('tabpanel', {name: 'Table of Contents'});
        await tp2.getByRole('link', {name: 'Order', exact: true}).click(); await idle(page); await sleep(500);
        out.dragSec = await dragRow(cat('Reviews'), cat('Articles'));
        out.dragSec.during = await tocOrder();
        const saveResp = page.waitForResponse((r) => /save-sequence|saveSequence/i.test(r.url()), {timeout: T}).catch(() => null);
        await tp2.getByRole('link', {name: 'Done', exact: true}).or(tp2.getByRole('button', {name: 'Done', exact: true})).first().click();
        const sr = await saveResp;
        out.dragSec.saveStatus = sr ? sr.status() : null;
        await idle(page); await sleep(600);
        await cancelWindow();
        await openIssue(c1, 'Vol. 1 No. 2 (2026)');
        await W().locator('tr.gridRow').first().waitFor({timeout: T}).catch(() => {});
        out.dragSec.reopened = await tocOrder();
        await snap('or-03-sections-reordered', {order: out.dragSec.reopened});
        // an article dragged under another section
        const tp3 = W().getByRole('tabpanel', {name: 'Table of Contents'});
        await tp3.getByRole('link', {name: 'Order', exact: true}).click(); await idle(page); await sleep(500);
        const s1row = W().locator('tr.gridRow').filter({hasText: S.s.s1.title}).first();
        const s3row = W().locator('tr.gridRow').filter({hasText: S.s.s3.title}).first();
        out.dragArt = await dragRow(s1row, s3row, true);
        out.dragArt.during = await tocOrder();
        const saveResp2 = page.waitForResponse((r) => /save-sequence|saveSequence/i.test(r.url()), {timeout: T}).catch(() => null);
        await tp3.getByRole('link', {name: 'Done', exact: true}).or(tp3.getByRole('button', {name: 'Done', exact: true})).first().click();
        const sr2 = await saveResp2;
        out.dragArt.saveStatus = sr2 ? sr2.status() : null;
        await idle(page); await sleep(600);
        await cancelWindow();
        await openIssue(c1, 'Vol. 1 No. 2 (2026)');
        await W().locator('tr.gridRow').first().waitFor({timeout: T}).catch(() => {});
        out.dragArt.reopened = await tocOrder();
        await snap('or-04-article-moved', {order: out.dragArt.reopened});
        await cancelWindow();
        out.pageAfter = await pageOrder(c1, F, 'or-05-page-after');
        // the other issue and the journal's section list
        await openIssue(c1, 'Vol. 1 No. 1 (2024)', 'Back Issues');
        await W().locator('tr.gridRow').first().waitFor({timeout: T}).catch(() => {});
        out.otherIssue = await tocOrder();
        await cancelWindow();
        await page.goto(cUrl(c1, '/management/settings/context')); await idle(page);
        await page.getByRole('tab', {name: 'Sections', exact: true}).click(); await idle(page); await sleep(500);
        out.journalSections = (await page.locator('tr.gridRow:visible').allInnerTexts()).map((x) => flat(x, 60));
        await snap('or-06-journal-sections', {rows: out.journalSections});
        // the moved article's own "Section"
        const wf = app.url(`/index.php/${c1}/dashboard/editorial?workflowSubmissionId=${S.s.s1.id}&workflowMenuKey=publication_${S.s.s1.pub}_titleAbstract`);
        await page.goto(wf); await idle(page); await sleep(1500);
        out.s1Workflow = {sectionSelects: await page.locator('select').evaluateAll((els) => els.map((s) => ({name: s.name, sel: s.options[s.selectedIndex] ? s.options[s.selectedIndex].text : null}))).catch(() => []), dialogText: flat(await page.locator('[role="dialog"]:visible').last().innerText().catch(() => null), 1500)};
        await snap('or-07-s1-title-abstract', out.s1Workflow);
        for (const label of ['Issue', 'Publication Settings']) {
            const l = page.getByRole('link', {name: label, exact: true}).last();
            if (await l.count()) {
                await l.click().catch(() => {}); await idle(page); await sleep(1500);
                out.s1Workflow[label] = {sectionSelects: await page.locator('select:visible').evaluateAll((els) => els.map((s) => ({name: s.name, sel: s.options[s.selectedIndex] ? s.options[s.selectedIndex].text : null}))).catch(() => []), text: flat(await page.locator('[role="dialog"]:visible').last().innerText().catch(() => null), 1200)};
                await snap(`or-08-s1-${label.replace(/\W+/g, '-')}`, out.s1Workflow[label]);
            }
        }
        fact('order', out);
    });

    // ================================================================== remove (Rule 12, td8)
    if (on('remove')) await sect('remove', async () => {
        const out = {};
        const c1 = C.c1.path;
        const P1 = iid('c1', 1, 1, 2024);
        await as(`${C.c1.p}mg`, c1);
        await openIssue(c1, 'Vol. 1 No. 1 (2024)', 'Back Issues');
        await W().locator('tr.gridRow').first().waitFor({timeout: T}).catch(() => {});
        out.before = await tocOrder();
        // (a section cannot be dragged above another on this build, phase sortable/sortable2, so no custom section order is set up here)
        const p3row = W().locator('tr.gridRow').filter({hasText: S.s.p3.title}).first();
        const ra = await rowActions(p3row);
        await ra.ctl.getByRole('link', {name: 'Remove', exact: true}).click();
        await idle(page); await sleep(600);
        const conf = page.locator('[role="dialog"]:visible').last();
        out.confirm = {text: flat(await conf.innerText().catch(() => null), 500), heading: await conf.locator('h1, h2, h3').allInnerTexts().catch(() => [])};
        await snap('rm-01-remove-confirm', out.confirm);
        await conf.getByRole('button', {name: 'OK', exact: true}).or(conf.getByRole('link', {name: 'OK', exact: true})).first().click();
        await idle(page); await sleep(900);
        out.afterAtOnce = await tocOrder();
        await snap('rm-02-after-remove', {order: out.afterAtOnce});
        await cancelWindow();
        out.backList = await listNames(await issuesPage(c1, 'Back Issues'));
        await visitor();
        out.articlePage = brief(await land(`/index.php/${c1}/article/view/${S.s.p3.id}`, 'rm-03-article-visitor'));
        out.otherArticle = brief(await land(`/index.php/${c1}/article/view/${S.s.p1.id}`, 'rm-04-other-article-visitor'));
        out.issuePage = await pageOrder(c1, P1, 'rm-05-issue-page-after');
        await as(`${C.c1.p}mg`, c1);
        await page.goto(app.url(`/index.php/${c1}/dashboard/editorial?workflowSubmissionId=${S.s.p3.id}`)); await idle(page); await sleep(1500);
        out.workflow = {text: flat(await page.locator('[role="dialog"]:visible').last().innerText().catch(() => null), 1200)};
        await snap('rm-06-workflow', out.workflow);
        await page.goto(app.url(`/index.php/${c1}/dashboard/editorial?workflowSubmissionId=${S.s.p3.id}&workflowMenuKey=publication_${S.s.p3.pub}_titleAbstract`)); await idle(page); await sleep(1500);
        out.workflowPub = {text: flat(await page.locator('[role="dialog"]:visible').last().innerText().catch(() => null), 1500)};
        await snap('rm-07-workflow-publication', out.workflowPub);
        const button = page.locator('[data-cy="workflow-controls-right"]').getByRole('button', {name: /^(Schedule For Publication|Publish)$/});
        out.button = await button.count() ? flat(await button.first().innerText()) : null;
        if (out.button) {
            await sleep(800);
            await button.first().click();
            const panel = page.locator('[data-cy="active-modal"]').filter({hasText: 'Review Publishing Details'}).last();
            const confirm = page.getByRole('dialog').filter({hasText: /Are you sure you want to publish this\?/});
            const which = await Promise.race([
                panel.waitFor({state: 'visible', timeout: 20_000}).then(() => 'panel'),
                confirm.waitFor({state: 'visible', timeout: 20_000}).then(() => 'confirm'),
            ]).catch(() => null);
            out.opened = which;
            await idle(page); await sleep(1500);
            if (which === 'panel') {
                out.panel = {checked: await panel.locator('input[name="assignment"]:checked').evaluate((e) => (e.closest('label') || e.parentElement).innerText.trim()).catch(() => null),
                    issue: await panel.locator('select[name="issueId"]').evaluate((s) => (s.options[s.selectedIndex] || {}).text || null).catch(() => null),
                    options: await panel.locator('select[name="issueId"] option').allInnerTexts().catch(() => []),
                    text: flat(await panel.innerText().catch(() => null), 1500)};
                await snap('rm-08-publish-panel', out.panel);
                for (const [sel, val] of [['select[name="versionStage"]', 'VoR'], ['select[name="versionIsMinor"]', 'false']]) {
                    const el = panel.locator(sel);
                    if (await el.isVisible().catch(() => false)) { if (!(await el.inputValue().catch(() => ''))) await el.selectOption(val).catch(() => {}); }
                }
                const back = panel.getByRole('radio', {name: 'Assign To Current/Back Issue'});
                if (await back.count()) {
                    await back.check().catch(() => {});
                    const opt = panel.locator('select[name="issueId"] option').filter({hasText: 'Vol. 1 No. 1 (2024)'});
                    if (await opt.count()) await panel.locator('select[name="issueId"]').selectOption(await opt.first().getAttribute('value'));
                }
                await panel.getByRole('button', {name: 'Confirm', exact: true}).click();
                await confirm.waitFor({state: 'visible', timeout: T}).catch(() => {});
            }
            if (await confirm.isVisible().catch(() => false)) {
                out.confirmText = flat(await confirm.innerText().catch(() => null), 500);
                const done = page.waitForResponse((r) => /\/publications\/\d+\/publish/.test(r.url()) && r.request().method() !== 'GET', {timeout: T}).catch(() => null);
                await confirm.getByRole('button', {name: 'Publish', exact: true}).click();
                const r = await done;
                out.publishStatus = r ? r.status() : null;
                await idle(page); await sleep(1000);
                await snap('rm-09-republished');
            }
            await openIssue(c1, 'Vol. 1 No. 1 (2024)', 'Back Issues');
            await W().locator('tr.gridRow').first().waitFor({timeout: T}).catch(() => {});
            out.afterRepublish = await tocOrder();
            await snap('rm-10-toc-after-republish', {order: out.afterRepublish});
            await cancelWindow();
        }
        fact('remove', out);
    });

    // ================================================================== galleys (Fields "Issue Galleys" and its window)
    async function galleyWindow(action) {
        await action();
        const f = page.locator('form#issueGalleyForm:visible').last();
        await f.waitFor({timeout: T});
        await idle(page); await sleep(400);
        return f;
    }
    if (on('galleys')) await sect('galleys', async () => {
        const out = {};
        const c1 = C.c1.path;
        await as(`${C.c1.p}mg`, c1);
        const openG = async (ctx, name, tab) => { await openIssue(ctx, name, tab); const p = await windowTab('Issue Galleys'); await p.locator('table').first().waitFor({timeout: T}).catch(() => {}); await idle(page); return p; };
        let p = await openG(c1, 'Vol. 1 No. 1 (2024)', 'Back Issues');
        out.c1 = {grid: await readGrid(p), links: (await p.locator('a:visible').allInnerTexts()).map((x) => x.trim()).filter(Boolean)};
        const pdf = p.locator('tr.gridRow').filter({hasText: 'PDF'}).first();
        const ra = await rowActions(pdf);
        out.c1.rowActions = ra.links;
        await snap('ga-01-c1-tab', out.c1);
        let f = await galleyWindow(() => ra.ctl.getByRole('link', {name: 'Edit', exact: true}).click());
        out.edit = {title: flat(await W().locator('h1').first().innerText().catch(() => null)), form: await readForm(f), fileLink: await f.locator('a[href*="download"], a[target]').evaluateAll((els) => els.map((a) => ({t: a.innerText.trim(), target: a.target, href: (a.getAttribute('href') || '').replace(/^https?:\/\/[^/]+/, '').slice(0, 160)}))).catch(() => [])};
        await snap('ga-02-edit-window', out.edit);
        await f.locator('input[name=urlPath]').fill('g1');
        out.editSave = await saveForm(f, 'ga-03-edit-urlpath-saved');
        if (out.editSave.windowOpen) await cancelWindow();
        p = W().getByRole('tabpanel', {name: 'Issue Galleys'});
        f = await galleyWindow(() => p.getByRole('link', {name: 'Create Issue Galley', exact: true}).click());
        out.create = {title: flat(await W().locator('h1').first().innerText().catch(() => null)), form: await readForm(f), lang: await f.locator('select').first().evaluate((s) => ({name: s.name, sel: s.options[s.selectedIndex] ? s.options[s.selectedIndex].text : null, options: [...s.options].map((o) => o.text)})).catch(() => null)};
        await snap('ga-04-create-window', out.create);
        out.emptySave = await saveForm(f, 'ga-05-create-empty-save');
        const up = page.waitForResponse((r) => /upload/.test(r.url()) && r.request().method() === 'POST', {timeout: T}).catch(() => null);
        await f.locator('input[type=file]').first().setInputFiles(fx('notes.md'));
        const ur = await up;
        out.mdUpload = ur ? ur.status() : null;
        await sleep(600);
        await f.locator('input[name="label"]').fill('Notes');
        await f.locator('input[name=urlPath]').fill('g1');
        out.dupSave = await saveForm(f, 'ga-06-create-dup-urlpath');
        if (out.dupSave.windowOpen) {
            await f.locator('input[name=urlPath]').fill('g2');
            out.okSave = await saveForm(f, 'ga-07-create-md-saved');
            if (out.okSave.windowOpen) await cancelWindow();
        }
        out.c1After = await readGrid(W().getByRole('tabpanel', {name: 'Issue Galleys'}));
        await cancelWindow();
        // the same URL path on another issue's galley
        p = await openG(c1, 'Vol. 1 No. 2 (2024)', 'Back Issues');
        f = await galleyWindow(() => p.getByRole('link', {name: 'Create Issue Galley', exact: true}).click());
        const up2 = page.waitForResponse((r) => /upload/.test(r.url()) && r.request().method() === 'POST', {timeout: T}).catch(() => null);
        await f.locator('input[type=file]').first().setInputFiles(fx('article.pdf'));
        await up2; await sleep(600);
        await f.locator('input[name="label"]').fill('PDF');
        await f.locator('input[name=urlPath]').fill('g1');
        out.otherIssueSave = await saveForm(f, 'ga-08-other-issue-same-path');
        if (out.otherIssueSave.windowOpen) await cancelWindow();
        out.otherIssueGrid = await readGrid(W().getByRole('tabpanel', {name: 'Issue Galleys'}));
        await cancelWindow();
        // two languages
        await as(`${C.c2.p}mg`, C.c2.path);
        p = await openG(C.c2.path, 'Vol. 1 No. 1 (2026)');
        out.c2 = {grid: await readGrid(p)};
        f = await galleyWindow(() => p.getByRole('link', {name: 'Create Issue Galley', exact: true}).click());
        out.c2.lang = await f.locator('select').first().evaluate((s) => ({name: s.name, sel: s.options[s.selectedIndex] ? s.options[s.selectedIndex].text : null, options: [...s.options].map((o) => o.text)})).catch(() => null);
        out.c2.form = await readForm(f);
        await snap('ga-09-c2-create-window', out.c2);
        await cancelWindow();
        await cancelWindow();
        // publisher IDs on
        await as(`${C.c5.p}mg`, C.c5.path);
        p = await openG(C.c5.path, 'Vol. 1 No. 1 (2026)');
        out.c5 = {grid: await readGrid(p)};
        const r5 = await rowActions(p.locator('tr.gridRow').filter({hasText: 'PDF'}).first());
        f = await galleyWindow(() => r5.ctl.getByRole('link', {name: 'Edit', exact: true}).click());
        out.c5.form = await readForm(f);
        await snap('ga-10-c5-edit-window', out.c5);
        await cancelWindow();
        fact('galleys', out);
    });

    // ================================================================== mail (Actors row "Receive the issue notification and email"; Rule 2's archive and email)
    async function notifRow(user, ctx, mode) {
        await as(user, ctx);
        await page.goto(cUrl(ctx, '/user/profile/notificationSettings')); await idle(page);
        const form = page.locator('form#notificationSettingsForm');
        await form.waitFor({timeout: T});
        const rowBoxes = await form.evaluate((f) => {
            const boxes = [...f.querySelectorAll('input[type=checkbox]')];
            const sec = boxes.map((b) => b.closest('.section')).find((s) => s && /An issue has been published/.test(s.innerText));
            return sec ? [...sec.querySelectorAll('input[type=checkbox]')].map((b) => ({id: b.id, checked: b.checked})) : [];
        });
        const ids = rowBoxes.map((b) => b.id);
        if (mode === 'off' && ids[0]) await page.locator(`[id="${ids[0]}"]`).uncheck();
        if (mode === 'emailOff' && ids[1]) await page.locator(`[id="${ids[1]}"]`).check();
        const r = page.waitForResponse((x) => x.request().method() === 'POST' && /notification/i.test(x.url()), {timeout: T}).catch(() => null);
        await form.getByRole('button', {name: 'Save', exact: true}).click();
        await r; await idle(page);
        const after = await form.evaluate((f, list) => list.map((id) => { const b = f.querySelector(`[id="${id}"]`); return {id, checked: b && b.checked, disabled: b && b.disabled}; }), ids).catch(() => null);
        await snap(`ml-01-prefs-${mode}`, {before: rowBoxes, after});
        return {before: rowBoxes, after};
    }
    if (on('mail')) await sect('mail', async () => {
        const out = {};
        const c0 = C.c0.path; const p = C.c0.p;
        await as(`${p}mg`, c0);
        const name = S.c0name || 'Vol. 1 No. 2 (2014): Special Issue';
        const already = (await listNames(await issuesPage(c0, 'Back Issues'))).some((x) => x.includes(name));
        if (!already) {
        out.r2 = await notifRow(`${p}r2`, c0, 'off');
        out.r3 = await notifRow(`${p}r3`, c0, 'emailOff');
        await as(`${p}mg`, c0);
        const panel = await issuesPage(c0);
        const ra = await rowActions(issueRow(panel, name));
        await ra.ctl.getByRole('link', {name: 'Publish Issue', exact: true}).click();
        const w = page.locator('[role="dialog"]:visible').filter({has: page.getByRole('heading', {name: 'Publish Issue'})}).last();
        await w.locator('input[name=sendIssueNotification]').waitFor({timeout: T});
        out.boxDefault = await w.locator('input[name=sendIssueNotification]').isChecked();
        const posted = page.waitForResponse((r) => r.request().method() === 'POST' && /publish-issue/.test(r.url()), {timeout: T}).catch(() => null);
        await w.getByRole('button', {name: 'OK', exact: true}).click();
        const rp = await posted;
        out.publishStatus = rp ? rp.status() : null;
        await idle(page); await sleep(1000);
        out.futureAfter = await listNames(await issuesPage(c0));
        out.backAfter = await readGrid(await issuesPage(c0, 'Back Issues'));
        await snap('ml-02-back-after-publish', {back: out.backAfter});
        }
        out.already = already;
        process.env.PKP_CONFIG_FILE = app.configFile;
        try { out.jobs = runJobs({appRoot: app.root, timeoutMs: 60_000}).split('\n').filter((l) => l.trim()).slice(-8).join('\n'); } catch (e) { out.jobs = String(e.message).slice(0, 200); }
        await sleep(1500);
        out.mail = {};
        for (const k of ['r1', 'r2', 'r3', 'mg', 'au']) {
            try {
                const m = await app.mail.find({to: `${p}${k}@mail.test`, contains: 'Just published', timeoutMs: k === 'r1' ? 20000 : 4000});
                const full = await app.mail.fullMessage(m.ID);
                out.mail[k] = {subject: full.Subject, textStart: flat(full.Text, 500)};
            } catch (e) { out.mail[k] = {none: String(e.message).split('\n')[0].slice(0, 160)}; }
        }
        await visitor();
        await land(`/index.php/${c0}/issue/archive`, 'ml-03-archive');
        out.archive = flat(await page.locator('.issues_archive, .page_issue_archive').first().innerText().catch(() => null), 500);
        out.page = brief(await land(`/index.php/${c0}/issue/view/${S.c0id}`, 'ml-04-issue-page'));
        // the notification, where a reader sees it
        for (const k of ['r1', 'r2', 'r3']) {
            await as(`${p}${k}`, c0);
            await page.goto(cUrl(c0, '/notification')); await idle(page);
            out[`notif_${k}`] = {url: page.url().replace(app.baseURL, ''), text: flat(await page.locator('main, body').first().innerText().catch(() => null), 500)};
            await snap(`ml-05-notifications-${k}`);
        }
        fact('mail', out);
    });

    // ================================================================== mail2 (a second publish: one reader with "Do not send me an email…" ticked)
    const mailsFor = async (p, keys, contains) => {
        const res = {};
        for (const k of keys) {
            try {
                const m = await app.mail.find({to: `${p}${k}@mail.test`, contains, timeoutMs: k === keys[0] ? 20000 : 3000});
                const full = await app.mail.fullMessage(m.ID);
                res[k] = {subject: full.Subject, from: (full.From || {}).Address, textStart: flat(full.Text, 300)};
            } catch (e) { res[k] = {none: String(e.message).split('\n')[0].slice(0, 120)}; }
        }
        return res;
    };
    if (on('mail2')) await sect('mail2', async () => {
        const out = {};
        const c0 = C.c0.path; const p = C.c0.p;
        out.first = await mailsFor(p, ['r1', 'r2', 'r3', 'mg', 'au'], S.c0name || 'Special Issue');
        out.r3 = await notifRow(`${p}r3`, c0, 'emailOff');
        await as(`${p}mg`, c0);
        let f = await openCreate(c0);
        await fillIdent(f, {v: 12, n: 1, y: 2032, boxes: {Title: false}});
        await saveForm(f, 'm2-01-created');
        const panel = await issuesPage(c0);
        const ra = await rowActions(issueRow(panel, 'Vol. 12 No. 1 (2032)'));
        await ra.ctl.getByRole('link', {name: 'Publish Issue', exact: true}).click();
        const w = page.locator('[role="dialog"]:visible').filter({has: page.getByRole('heading', {name: 'Publish Issue'})}).last();
        await w.locator('input[name=sendIssueNotification]').waitFor({timeout: T});
        out.boxDefault = await w.locator('input[name=sendIssueNotification]').isChecked();
        const posted = page.waitForResponse((r) => r.request().method() === 'POST' && /publish-issue/.test(r.url()), {timeout: T}).catch(() => null);
        await w.getByRole('button', {name: 'OK', exact: true}).click();
        const rp = await posted;
        out.publishStatus = rp ? rp.status() : null;
        await idle(page); await sleep(1000);
        process.env.PKP_CONFIG_FILE = app.configFile;
        try { out.jobs = runJobs({appRoot: app.root, timeoutMs: 90_000}).split('\n').filter((l) => l.trim()).slice(-6).join('\n'); } catch (e) { out.jobs = String(e.message).slice(0, 200); }
        await sleep(1500);
        out.second = await mailsFor(p, ['r1', 'r2', 'r3', 'mg', 'au'], 'Vol. 12 No. 1 (2032)');
        await visitor();
        await land(`/index.php/${c0}/issue/archive`, 'm2-02-archive');
        out.archive = flat(await page.locator('.issues_archive, .page_issue_archive').first().innerText().catch(() => null), 500);
        for (const k of ['r1', 'r2', 'r3']) {
            await as(`${p}${k}`, c0);
            await page.goto(cUrl(c0, '/notification')); await idle(page);
            out[`notif_${k}`] = {url: page.url().replace(app.baseURL, ''), text: flat(await page.locator('body').innerText().catch(() => null), 700)};
            await snap(`m2-03-notifications-${k}`);
        }
        fact('mail2', out);
    });

    // ================================================================== modes (Rule 3: the access status an issue is born with)
    async function setMode(ctx, label) {
        await page.goto(cUrl(ctx, '/management/settings/distribution')); await idle(page);
        await page.getByRole('tab', {name: 'Access', exact: true}).click(); await idle(page); await sleep(500);
        const radio = page.getByRole('radio', {name: label});
        await radio.check();
        const panel = page.getByRole('tabpanel', {name: 'Access'});
        await panel.getByRole('button', {name: 'Save', exact: true}).click();
        await page.locator('[role="status"]:has-text("Saved")').first().waitFor({timeout: 15000}).catch(() => {});
        await idle(page);
    }
    if (on('modes')) await sect('modes', async () => {
        const out = {};
        const c0 = C.c0.path;
        await as(`${C.c0.p}mg`, c0);
        await setMode(c0, "OJS will not be used to publish the journal's contents online.");
        let f = await openCreate(c0);
        await fillIdent(f, {v: 9, n: 9, y: 2029, boxes: {Title: false}});
        out.createNone = await saveForm(f, 'mo-01-created-under-none');
        await setMode(c0, 'The journal will require subscriptions to access some or all of its contents.');
        const accessOf = async (name, tab) => {
            await openIssue(c0, name, tab);
            const info = await winInfo();
            if (!info.tabs.includes('Access')) { await cancelWindow(); return {tabs: info.tabs}; }
            const pn = await windowTab('Access');
            const sel = pn.locator('select').first();
            await sel.waitFor({timeout: T}).catch(() => {});
            const v = await sel.evaluate((s) => s.options[s.selectedIndex].text).catch(() => null);
            await snap(`mo-02-access-${name.replace(/\W+/g, '-')}`, {value: v});
            await cancelWindow();
            return {value: v};
        };
        out.bornNone = await accessOf('Vol. 9 No. 9 (2029)');
        out.bornNoRow = await accessOf('2031');
        out.bornNoRowPublished = await accessOf(S.c0name || 'Vol. 1 No. 2 (2014): Special Issue', 'Back Issues');
        // a fresh open journal (no row): an issue created there, read after the switch
        await setMode(c0, 'The journal will provide open access to its contents.');
        f = await openCreate(c0);
        await fillIdent(f, {v: 9, n: 8, y: 2029, boxes: {Title: false}});
        out.createOpen = await saveForm(f, 'mo-03-created-under-open');
        await setMode(c0, 'The journal will require subscriptions to access some or all of its contents.');
        out.bornOpen = await accessOf('Vol. 9 No. 8 (2029)');
        f = await openCreate(c0);
        await fillIdent(f, {v: 9, n: 7, y: 2029, boxes: {Title: false}});
        out.createSub = await saveForm(f, 'mo-04-created-under-subscription');
        out.bornSub = await accessOf('Vol. 9 No. 7 (2029)');
        fact('modes', out);
    });

    // ================================================================== datefmt (Fields "Published" column: the journal's short date format, both ends)
    if (on('datefmt')) await sect('datefmt', async () => {
        const out = {};
        const c2 = C.c2.path;
        await as(`${C.c2.p}mg`, c2);
        out.before = await readGrid(await issuesPage(c2, 'Back Issues'));
        await page.goto(cUrl(c2, '/en/management/settings/website')); await idle(page);
        await page.locator('#setup-button').first().click().catch(() => {});
        await idle(page);
        await page.getByRole('tab', {name: 'Date & Time'}).first().click().catch(() => {});
        await idle(page); await sleep(600);
        const form = page.locator('form').filter({hasText: 'Date (Short)'}).first();
        await form.waitFor({timeout: 20000}).catch(() => {});
        const fsShort = form.locator('fieldset').filter({has: page.locator('legend', {hasText: /^\s*Date \(Short\)/})}).first();
        out.options = await fsShort.locator('input[type=radio]').evaluateAll((els) => els.map((r) => ({v: r.value, c: r.checked})));
        await fsShort.locator('input[type=radio][value="d.m.Y"]').check().catch((e) => { out.err = String(e.message).slice(0, 120); });
        await form.getByRole('button', {name: 'Save', exact: true}).click();
        await page.locator('[role="status"]').filter({hasText: 'Saved'}).first().waitFor({timeout: 10000}).catch(() => {});
        out.after = await readGrid(await issuesPage(c2, 'Back Issues'));
        await snap('df-01-back-after-format', out);
        fact('datefmt', out);
    });

    // ================================================================== orderlinks ("Order" above a list, by how many rows it holds)
    if (on('orderlinks')) await sect('orderlinks', async () => {
        const out = {};
        const vis = async (scope) => (await scope.locator('a:visible, button:visible').allInnerTexts().catch(() => [])).map((x) => x.trim()).filter((x) => x && x !== 'Settings');
        await as(`${C.c2.p}mg`, C.c2.path);
        out.c2Back1 = await vis(await issuesPage(C.c2.path, 'Back Issues'));
        await snap('ol-01-back-one-row', {links: out.c2Back1});
        await as(`${C.c1.p}mg`, C.c1.path);
        for (const [k, name, tab] of [['toc1', 'Vol. 1 No. 2 (2024)', 'Back Issues'], ['toc0', 'Vol. 1 No. 1 (2026)', 'Future Issues'], ['toc3', 'Vol. 1 No. 2 (2026)', 'Future Issues']]) {
            await openIssue(C.c1.path, name, tab);
            await sleep(500);
            out[k] = await vis(W().getByRole('tabpanel', {name: 'Table of Contents'}));
            await snap(`ol-02-${k}`, {links: out[k]});
            await cancelWindow();
        }
        fact('orderlinks', out);
    });

    // ================================================================== notice (Rule 6: what a successful "Save" shows, frame by frame; the A1 toast's life)
    if (on('notice')) await sect('notice', async () => {
        const out = {};
        await as(`${C.c1.p}mg`, C.c1.path);
        const f = await openData(C.c1.path, 'Vol. 1 No. 1 (2026)');
        await f.locator('input[name=urlPath]').fill('k1-notice');
        const resp = page.waitForResponse((r) => r.request().method() === 'POST' && /update-issue/.test(r.url()), {timeout: T}).catch(() => null);
        await f.getByRole('button', {name: 'Save', exact: true}).click();
        const r = await resp;
        out.body = r ? (await r.text().catch(() => '')).slice(0, 600) : null;
        const t0 = Date.now();
        out.frames = [];
        for (const ms of [150, 600, 1200, 2500, 4000]) {
            await sleep(Math.max(0, ms - (Date.now() - t0)));
            const texts = await page.evaluate((re) => { const out = []; const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) { const e = n.parentElement; if (e && new RegExp(re, 'i').test(n.textContent) && e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden') out.push(`${e.tagName}.${e.className}<${e.parentElement ? e.parentElement.className : ''}: ${n.textContent.trim().slice(0, 80)}`); } return out; }, 'saved|your changes').catch(() => []);
            out.frames.push({ms, texts});
            await shot(page, `no-01-after-save-${ms}`);
        }
        // the A1 refusal's toast: its life, read by the selector that found it
        await as(`${C.c0.p}mg`, C.c0.path);
        const f2 = await openCreate(C.c0.path);
        await fillIdent(f2, {v: 6, n: 6, y: 2036});
        const resp2 = page.waitForResponse((x) => x.request().method() === 'POST' && /update-issue/.test(x.url()), {timeout: T}).catch(() => null);
        await f2.getByRole('button', {name: 'Save', exact: true}).click();
        await resp2;
        const t1 = Date.now();
        out.toast = [];
        for (const ms of [200, 1500, 3000, 4500, 6000, 8000, 10000]) {
            await sleep(Math.max(0, ms - (Date.now() - t1)));
            const texts = await page.evaluate((re) => { const out = []; const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) { const e = n.parentElement; if (e && new RegExp(re).test(n.textContent) && e.getClientRects().length) out.push(`${e.tagName}.${e.className}<${e.parentElement ? e.parentElement.className : ''}<${e.parentElement && e.parentElement.parentElement ? e.parentElement.parentElement.className : ''}`); } return out; }, 'Title is required').catch(() => []);
            if (ms === 200 || ms === 4500) await shot(page, `no-02-toast-${ms}`);
            out.toast.push({ms, texts});
        }
        await cancelWindow();
        fact('notice', out);
    });

    // ================================================================== sortable (td7: what "Order" lets move: the page's own sortable settings, read)
    if (on('sortable')) await sect('sortable', async () => {
        const out = {};
        await as(`${C.c1.p}mg`, C.c1.path);
        await openIssue(C.c1.path, 'Vol. 1 No. 2 (2026)');
        const tp = W().getByRole('tabpanel', {name: 'Table of Contents'});
        await tp.getByRole('link', {name: 'Order', exact: true}).click(); await idle(page); await sleep(600);
        out.sortables = await page.evaluate(() => {
            const $ = window.jQuery;
            return [...document.querySelectorAll('.ui-sortable')].filter((e) => e.getClientRects().length || e.closest('[role=dialog]')).map((e) => {
                const o = {};
                for (const k of ['items', 'handle', 'connectWith', 'containment', 'axis']) { try { o[k] = String($(e).sortable('option', k)); } catch (x) { o[k] = 'err'; } }
                return {tag: e.tagName, cls: e.className, id: e.id, opts: o, rows: e.querySelectorAll(':scope > tr').length};
            });
        }).catch((e) => String(e.message).slice(0, 200));
        out.handles = await W().locator('tr.gridRow').evaluateAll((rows) => rows.filter((r) => r.getClientRects().length).map((r) => ({id: r.id, t: r.innerText.replace(/\s+/g, ' ').trim().slice(0, 30), move: [...r.querySelectorAll('[class*="move"], [class*="handle"], [class*="drag"]')].map((h) => h.className)})));
        await snap('so-01-order-mode', out);
        // one more try at the section drag, by the section row's own move handle, slowly
        const rev = W().locator('tr.gridRow:not(.has_extras)').filter({hasText: /^\s*Reviews\s*$/}).first();
        const art = W().locator('tr.gridRow:not(.has_extras)').filter({hasText: /^\s*Articles\s*$/}).first();
        const h = rev.locator('[class*="move"]').first();
        const a = await ((await h.count()) ? h : rev).boundingBox();
        const b = await art.boundingBox();
        if (a && b) {
            await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
            await page.mouse.down();
            await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2 - 5, {steps: 3});
            for (let y = a.y; y > b.y - 20; y -= 8) { await page.mouse.move(a.x + a.width / 2, y, {steps: 2}); await sleep(30); }
            await sleep(300);
            await page.mouse.up();
            await sleep(500);
        }
        out.orderAfterSlowDrag = await tocOrder();
        await tp.getByRole('link', {name: 'Cancel ordering', exact: true}).or(tp.getByRole('button', {name: 'Cancel ordering', exact: true})).first().click().catch(() => {});
        await idle(page);
        await cancelWindow();
        fact('sortable', out);
    });

    // ================================================================== sortable2 (td7 again: the Reviews article dragged up into Articles, "Done"; a section heading dragged)
    if (on('sortable2')) await sect('sortable2', async () => {
        const out = {};
        await as(`${C.c1.p}mg`, C.c1.path);
        await openIssue(C.c1.path, 'Vol. 1 No. 2 (2026)');
        let tp = W().getByRole('tabpanel', {name: 'Table of Contents'});
        await tp.getByRole('link', {name: 'Order', exact: true}).click(); await idle(page); await sleep(600);
        const s3 = W().locator('tr.gridRow').filter({hasText: S.s.s3.title}).first();
        const s2 = W().locator('tr.gridRow').filter({hasText: S.s.s2.title}).first();
        out.drag = await dragRow(s3, s2, true);
        out.during = await tocOrder();
        await snap('s2-01-during', {order: out.during});
        const sr = page.waitForResponse((r) => /save-sequence|saveSequence/i.test(r.url()), {timeout: 15000}).catch(() => null);
        await tp.getByRole('link', {name: 'Done', exact: true}).or(tp.getByRole('button', {name: 'Done', exact: true})).first().click();
        const r = await sr;
        out.saveStatus = r ? r.status() : null;
        await idle(page); await sleep(600);
        await cancelWindow();
        await openIssue(C.c1.path, 'Vol. 1 No. 2 (2026)');
        await W().locator('tr.gridRow').first().waitFor({timeout: T}).catch(() => {});
        out.reopened = await tocOrder();
        // the "Reviews" heading row dragged down below its own article
        tp = W().getByRole('tabpanel', {name: 'Table of Contents'});
        await tp.getByRole('link', {name: 'Order', exact: true}).click(); await idle(page); await sleep(600);
        const rev = W().locator('tr.gridRow:not(.has_extras)').filter({hasText: /^\s*Reviews\s*$/}).first();
        const s3b = W().locator('tr.gridRow').filter({hasText: S.s.s3.title}).first();
        out.headDrag = await dragRow(rev, s3b, true);
        out.headDuring = await tocOrder();
        await snap('s2-02-heading-dragged', {order: out.headDuring});
        await tp.getByRole('link', {name: 'Cancel ordering', exact: true}).or(tp.getByRole('button', {name: 'Cancel ordering', exact: true})).first().click().catch(() => {});
        await idle(page); await sleep(400);
        out.afterCancel = await tocOrder();
        await cancelWindow();
        fact('sortable2', out);
    });

    // ================================================================== publish (Purpose; Rule 1: the row moves at once, and back; the reader side)
    if (on('publish')) await sect('publish', async () => {
        const out = {};
        const c1 = C.c1.path;
        const F = iid('c1', 1, 2, 2026);
        await visitor();
        out.before = {s1: brief(await land(`/index.php/${c1}/article/view/${S.s.s1.id}`, 'pu-01-s1-before')), current: brief(await land(`/index.php/${c1}/issue/current`, 'pu-02-current-before'))};
        await as(`${C.c1.p}mg`, c1);
        let panel = await issuesPage(c1);
        const ra = await rowActions(issueRow(panel, 'Vol. 1 No. 2 (2026)'));
        await ra.ctl.getByRole('link', {name: 'Publish Issue', exact: true}).click();
        const w = page.locator('[role="dialog"]:visible').filter({has: page.getByRole('heading', {name: 'Publish Issue'})}).last();
        await w.locator('input[name=sendIssueNotification]').waitFor({timeout: T});
        await w.locator('input[name=sendIssueNotification]').uncheck();
        const posted = page.waitForResponse((r) => r.request().method() === 'POST' && /publish-issue/.test(r.url()), {timeout: T}).catch(() => null);
        await w.getByRole('button', {name: 'OK', exact: true}).click();
        const rp = await posted;
        out.publishStatus = rp ? rp.status() : null;
        await idle(page); await sleep(800);
        out.futureAtOnce = await page.getByRole('tabpanel', {name: 'Future Issues'}).locator('tr.gridRow').allInnerTexts().catch(() => []);
        await page.getByRole('main').getByRole('tab', {name: 'Back Issues', exact: true}).click(); await idle(page); await sleep(500);
        out.backAtOnce = await page.getByRole('tabpanel', {name: 'Back Issues'}).locator('tr.gridRow').allInnerTexts().catch(() => []);
        await snap('pu-03-lists-after-publish', {future: out.futureAtOnce, back: out.backAtOnce});
        await visitor();
        out.after = {s1: brief(await land(`/index.php/${c1}/article/view/${S.s.s1.id}`, 'pu-04-s1-after')), s3: brief(await land(`/index.php/${c1}/article/view/${S.s.s3.id}`, 'pu-05-s3-after'))};
        await land(`/index.php/${c1}`, 'pu-06-home');
        out.headerLinks = await page.locator('.pkp_navigation_primary a').evaluateAll((els) => els.map((a) => ({t: a.innerText.trim(), h: (a.getAttribute('href') || '').replace(/^https?:\/\/[^/]+/, '')}))).catch(() => []);
        const cur = page.locator('.pkp_navigation_primary').getByRole('link', {name: 'Current', exact: true}).first();
        if (await cur.count()) { await cur.click(); await idle(page); out.currentVia = {url: page.url().replace(app.baseURL, ''), h1: await page.locator('h1').allInnerTexts()}; await snap('pu-07-current'); out.currentToc = await page.locator('.obj_issue_toc').first().innerText().then((t) => flat(t, 600)).catch(() => null); }
        await land(`/index.php/${c1}`, 'pu-08-home2');
        const arc = page.locator('.pkp_navigation_primary').getByRole('link', {name: 'Archives', exact: true}).first();
        if (await arc.count()) { await arc.click(); await idle(page); out.archives = {url: page.url().replace(app.baseURL, ''), list: await page.locator('.issues_archive .obj_issue_summary .title, .issues_archive h2 a, .issues_archive a.title').allInnerTexts().catch(() => [])}; await snap('pu-09-archives'); }
        // "Unpublish Issue": back to "Future Issues" at once
        await as(`${C.c1.p}mg`, c1);
        panel = await issuesPage(c1, 'Back Issues');
        const rb = await rowActions(issueRow(panel, 'Vol. 1 No. 2 (2026)'));
        out.backRowActions = rb.links;
        await rb.ctl.getByRole('link', {name: 'Unpublish Issue', exact: true}).click();
        await idle(page); await sleep(600);
        const conf = page.locator('[role="dialog"]:visible').last();
        out.unpublishConfirm = flat(await conf.innerText().catch(() => null), 300);
        const up = page.waitForResponse((r) => r.request().method() === 'POST' && /unpublish/.test(r.url()), {timeout: T}).catch(() => null);
        await conf.getByRole('button', {name: 'OK', exact: true}).or(conf.getByRole('link', {name: 'OK', exact: true})).first().click().catch(() => {});
        const ur = await up;
        out.unpublishStatus = ur ? ur.status() : null;
        await idle(page); await sleep(800);
        out.backAfterUnpub = await page.getByRole('tabpanel', {name: 'Back Issues'}).locator('tr.gridRow').allInnerTexts().catch(() => []);
        await page.getByRole('main').getByRole('tab', {name: 'Future Issues', exact: true}).click(); await idle(page); await sleep(500);
        out.futureAfterUnpub = await page.getByRole('tabpanel', {name: 'Future Issues'}).locator('tr.gridRow').allInnerTexts().catch(() => []);
        await snap('pu-10-lists-after-unpublish', {future: out.futureAfterUnpub, back: out.backAfterUnpub});
        fact('publish', out);
    });

    // ================================================================== republish (td8: after "Remove", what "Schedule For Publication" offers for the issue)
    if (on('republish')) await sect('republish', async () => {
        const out = {};
        const c1 = C.c1.path;
        await as(`${C.c1.p}mg`, c1);
        await page.goto(app.url(`/index.php/${c1}/dashboard/editorial?workflowSubmissionId=${S.s.p3.id}&workflowMenuKey=publication_${S.s.p3.pub}_titleAbstract`)); await idle(page); await sleep(2000);
        const button = page.locator('[data-cy="workflow-controls-right"]').getByRole('button', {name: /^(Schedule For Publication|Publish)$/}).first();
        await button.waitFor({timeout: T});
        await sleep(1000);
        await button.click();
        await sleep(3000); await idle(page);
        out.dialogs = await page.locator('[role="dialog"]:visible').evaluateAll((ds) => ds.map((d) => d.innerText.replace(/\s+/g, ' ').trim().slice(0, 1500)));
        out.checked = await page.locator('input[name="assignment"]:checked').evaluateAll((els) => els.map((e) => (e.closest('label') || e.parentElement).innerText.trim())).catch(() => []);
        out.issueSel = await page.locator('select[name="issueId"]:visible').evaluateAll((els) => els.map((s) => ({sel: (s.options[s.selectedIndex] || {}).text || null, options: [...s.options].map((o) => o.text)}))).catch(() => []);
        await snap('rp-01-after-schedule-press', out);
        fact('republish', out);
    });

    // ================================================================== galleyreq (Fields "Issue Galley": required for a new galley; a label with no file)
    if (on('galleyreq')) await sect('galleyreq', async () => {
        const out = {};
        await as(`${C.c1.p}mg`, C.c1.path);
        await openIssue(C.c1.path, 'Vol. 1 No. 2 (2024)', 'Back Issues');
        const p = await windowTab('Issue Galleys');
        await p.locator('table').first().waitFor({timeout: T}).catch(() => {});
        await p.getByRole('link', {name: 'Create Issue Galley', exact: true}).click();
        const f = page.locator('form#issueGalleyForm:visible').last();
        await f.waitFor({timeout: T}); await idle(page); await sleep(400);
        await f.locator('input[name="label"]').fill('NoFile');
        out.save = await saveForm(f, 'gr-01-label-no-file');
        out.form = (out.save.form || []).filter((x) => /error|required|file/i.test(x));
        await cancelWindow();
        out.grid = await readGrid(W().getByRole('tabpanel', {name: 'Issue Galleys'}));
        await cancelWindow();
        fact('galleyreq', out);
    });

    await close();
});
