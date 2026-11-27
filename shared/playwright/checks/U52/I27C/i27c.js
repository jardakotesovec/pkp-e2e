// U52 Payments & APCs, claim check I27C (housekeeping 2026-11-27): incidentals rows (U52, 2026-11-23)
// "Payments › Association Membership and {journal}/user/payMembership" and "The PayPal return of a
// membership payment". Spec lines: Actors row 6, Rule 7a, register A7 and A9, notes m, td13, f-a7, f-a9.
//
// Run (twice, each run seeds its own scratch journals under a fresh u52i27c tag):
//   bin/app-lock.sh shared ojs,omp,ops -- env PROBE_RUN=r1 PROBE_FEATURE=U52 PROBE_AGENT=ccI27C \
//       PROBE_NOTES_FEATURE=U52 node bin/probe.js all shared/playwright/checks/U52/I27C/i27c.js
//   (r2 the same with PROBE_RUN=r2). PARTS=levels,pay,ends,signedout,paypal,fulfil (any subset; default all)
//   seeds and then drives only the named parts.
// Other files: fulfil.php beside this script (part "fulfil": OJSPaymentManager::fulfillQueuedPayment() run
//   from PHP, catching the error) and the row's kept script
//   shared/playwright/checks/issues/paid-member-refused-restricted-galleys/paypal-return.php (run as it is,
//   on a second queued payment). The facts land in .reports/U52/ccI27C/i27c-facts-<run>-<app>.json, one
//   snapshot per screen beside them. The kept U51 script shared/playwright/checks/U51/I51/i51.js (run the
//   same way with PROBE_NOTES_FEATURE=U51) covers the reader's pages, the manager's Payments page and the
//   galleys before and after a manual payment; this one does not repeat them.
//
// OJS scratch journals (POST scenarios/context):
//   S  subscriptions required, payments set up ("Manual Fee Payment" with instructions, USD), "Association
//      Membership" 20; one issue 1/1/2026 with a "Full Issue" PDF and one article (PDF). Users, one per level:
//      mg Journal manager, sm Subscription Manager, se Section editor, ce Copyeditor, rv Reviewer, au Author,
//      rd Reader (pays on screen), pp and pk Readers (their queued payments are fulfilled from PHP); admin.
//   N  payments set up, no membership fee (the default end of the box); rd.
//   E  "Enable" unticked, the manual method still set up (instructions kept), fee 20; rd.
//   I  "Enable" ticked, "Manual Fee Payment" chosen with no instructions (method not set up), fee 20; rd.
//   F  a fresh journal: no payment settings at all; rd.
//   P  "Paypal Fee Payment" chosen, its "Account Name" typed on screen by the manager mg, fee 20; rd.
// OMP, OPS: read-only controls on publicknowledge (the address signed out, as reader.rosa, as manager.maya).
// Database: SELECTs only, for evidence. No assertions.
const path = require('path');
const {execFileSync} = require('child_process');
const {forEachApp, launch, signIn, signOut, screen, shot, record, loc, note, idle, tag, sql, serverLog} = require('../../../probe');

const T = 30_000;
const log = (...a) => console.log('[i27c]', ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (s, n = 1500) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));
const KEPT = path.join(__dirname, '../../issues/paid-member-refused-restricted-galleys/paypal-return.php');

forEachApp(async (app) => {
    const isOJS = app.name === 'ojs';
    const fact = (k, v) => { record('i27c-facts', {[k]: v}, {merge: true}); log(`[${app.name} ${k}]`, flat(JSON.stringify(v), 3000)); };
    const q = (s) => { try { return sql(app, s); } catch (e) { return `sql error: ${flat(e.message, 200)}`; } };
    const {page, close} = await launch(app);
    const dialogs = [];
    page.on('dialog', async (d) => {
        dialogs.push({type: d.type(), message: d.message(), url: page.url()});
        if (d.type() === 'beforeunload') await d.accept().catch(() => {}); else await d.dismiss().catch(() => {});
    });
    let who = 'visitor';
    async function snap(name, extra = {}) {
        let s;
        try { s = await screen(page); } catch (e) { s = {url: page.url(), screenError: flat(e.message, 300)}; }
        Object.assign(s, extra, {who});
        record(name, s);
        await shot(page, name).catch(() => {});
        return s;
    }
    async function sect(name, fn) {
        log(`--- ${name}`);
        try { return await fn(); } catch (e) {
            log(`[${name} FAILED]`, String(e.stack || e).split('\n').slice(0, 5).join(' | '));
            fact(`${name}.FAILED`, flat(e.stack || e.message, 1500));
            await snap(`c-zz-failed-${name}`).catch(() => {});
            return null;
        }
    }
    const as = async (user, ctx) => {
        await signIn(page, user, ctx ? {contextPath: ctx} : {}).catch((e) => log('signIn slow', user, flat(e.message, 120)));
        await idle(page).catch(() => {});
        who = user;
    };
    const visitor = async () => { await signOut(page).catch(() => {}); who = 'visitor'; };
    async function facts() {
        return page.evaluate(() => {
            const t = (s) => (s || '').replace(/\s+/g, ' ').trim();
            const vis = (e) => e.getClientRects().length > 0;
            const main = document.querySelector('.pkp_structure_main') || document.body;
            return {
                url: location.pathname + location.search,
                title: document.title,
                h1: [...main.querySelectorAll('h1')].filter(vis).map((e) => t(e.innerText)),
                paras: [...main.querySelectorAll('p')].filter(vis).map((e) => t(e.innerText)).filter(Boolean).slice(0, 20),
                tables: [...main.querySelectorAll('table')].filter(vis).map((tb) => [...tb.querySelectorAll('tr')].map((tr) => [...tr.children].map((c) => t(c.innerText)))),
                links: [...main.querySelectorAll('a, button')].filter(vis).map((a) => ({text: t(a.innerText), href: (a.getAttribute('href') || '').replace(location.origin, '')})).filter((l) => l.text),
                breadcrumb: [...document.querySelectorAll('.cmp_breadcrumbs li')].map((e) => t(e.innerText)),
                galleys: [...document.querySelectorAll('a.obj_galley_link')].filter(vis).map((a) => t(a.innerText)),
                galleyView: !!document.querySelector('header.header_view'),
                loginForm: !!document.querySelector('form.cmp_form.login'),
                bodyLength: (document.body ? document.body.innerHTML : '').length,
                member: /membership/i.test(document.body ? document.body.innerText : ''),
                text: t(main.innerText).slice(0, 1200),
            };
        }).catch((e) => ({err: flat(e.message, 200)}));
    }
    function chainWatch() {
        const chain = [];
        const onResp = (r) => { try { if (r.request().isNavigationRequest() && r.frame() === page.mainFrame()) chain.push(`${r.status()} ${r.request().method()} ${r.url().replace(app.baseURL, '')}`); } catch (e) { /* none */ } };
        page.on('response', onResp);
        return {chain, stop: () => page.off('response', onResp)};
    }
    async function land(p, name, extra = {}) {
        const w = chainWatch(); const d0 = dialogs.length;
        await page.goto(p.startsWith('http') ? p : app.url(p)).catch((e) => w.chain.push(`goto error ${flat(e.message, 120)}`));
        await idle(page).catch(() => {});
        w.stop();
        await snap(name, extra);
        const f = await facts();
        f.chain = w.chain; f.dialogs = dialogs.slice(d0);
        record(name, {facts: f}, {merge: true});
        return f;
    }
    async function press(locator, name) {
        const w = chainWatch(); const d0 = dialogs.length;
        if (!(await locator.count().catch(() => 0))) { w.stop(); record(name, {facts: {missing: true}}); return {missing: true}; }
        const info = await locator.first().evaluate((e) => ({text: e.innerText.replace(/\s+/g, ' ').trim(), href: e.getAttribute('href')})).catch(() => null);
        const navP = page.waitForNavigation({timeout: 15_000, waitUntil: 'load'}).catch(() => null);
        await locator.first().click().catch((e) => w.chain.push(`click error ${flat(e.message, 100)}`));
        await navP; await idle(page).catch(() => {}); await sleep(300);
        w.stop();
        await snap(name);
        const f = await facts();
        f.chain = w.chain; f.pressed = info; f.dialogs = dialogs.slice(d0);
        record(name, {facts: f}, {merge: true});
        return f;
    }
    const brief = (f) => f && ({url: f.url, chain: f.chain, title: f.title, h1: f.h1, breadcrumb: f.breadcrumb, tables: f.tables && f.tables.length ? f.tables : undefined,
        paras: f.paras, links: f.links, login: f.loginForm, bodyLength: f.bodyLength, dialogs: f.dialogs && f.dialogs.length ? f.dialogs : undefined,
        missing: f.missing, text: flat(f.text, 500)});
    const lg0 = (() => { try { return serverLog(app, {match: /invalid payment type|paypal|error|exception|fatal|warning|assert|\[5\d\d\]/i}); } catch (e) { return null; } })();
    const lg = {mark: () => (lg0 ? lg0.mark() : 0), since: (m) => { try { return lg0 ? lg0.since(m).slice(0, 12).map((x) => flat(x, 400)) : []; } catch (e) { return [`log error ${flat(e.message, 100)}`]; } }};
    const PARTS = process.env.PARTS ? process.env.PARTS.split(',') : null;
    const want = (n) => !PARTS || PARTS.includes(n);

    try {
        if (!isOJS) {
            // ====================================================== OMP / OPS: the address is absent (read-only)
            await sect('absence', async () => {
                const out = {};
                const lgm = lg.mark();
                await visitor();
                out.visitor = brief(await land(`/index.php/${app.contextPath}/user/payMembership`, 'c-ab-01-visitor-paymembership'));
                await as('reader.rosa', app.contextPath);
                out.reader = brief(await land(`/index.php/${app.contextPath}/user/payMembership`, 'c-ab-02-rosa-paymembership'));
                await as('manager.maya', app.contextPath);
                out.manager = brief(await land(`/index.php/${app.contextPath}/user/payMembership`, 'c-ab-03-maya-paymembership'));
                out.log = lg.since(lgm);
                fact('absence', out);
            });
            return;
        }

        // ============================================================ seed (OJS)
        const t = tag('u52i27c');
        const C = {};
        const U = (p, k, role = 'reader') => ({username: `${p}${k}`, roles: [role], givenName: k.toUpperCase(), familyName: `Itwentyseven${k}`});
        const base = (p, name) => ({name: `U52 I27C ${name}`, acronym: 'ITWSC', contactName: 'I27C Principal', contactEmail: `${p}pc@mail.test`});
        const PAY = {currency: 'USD', paymentPluginName: 'ManualPayment', manualInstructions: 'Send a cheque to the I27C desk.'};
        const PDF = {label: 'PDF', file: 'article.pdf'};
        const mk = async (key, spec, withArticle) => {
            const p = `${t}${key.toLowerCase()}`;
            try {
                const r = await app.api.createContext({tag: p, ...spec(p)});
                C[key] = {path: r.path || p, p};
                if (withArticle) {
                    const s = await app.api.createSubmission({tag: `${p}r`, context: C[key].path, submitter: `${p}au`, title: `I27C R ${key} ${t}`,
                        published: true, issue: {volume: 1, number: 1, year: 2026}, galleys: [PDF]});
                    C[key].sub = s.submissionId;
                }
                log('seed', key, C[key].path);
            } catch (e) { log('seed FAILED', key, flat(e.message, 900)); C[key] = {error: flat(e.message, 900)}; }
        };
        await mk('S', (p) => ({context: base(p, 'set up'), publishingMode: 'subscription', payments: {...PAY, membershipFee: 20},
            users: [U(p, 'mg', 'manager'), U(p, 'sm', 'subscriptionManager'), U(p, 'se', 'sectionEditor'), U(p, 'ce', 'copyeditor'),
                U(p, 'rv', 'externalReviewer'), U(p, 'au', 'author'), U(p, 'rd'), U(p, 'pp'), U(p, 'pk')],
            issues: [{volume: 1, number: 1, year: 2026, published: true, galleys: [PDF]}]}), true);
        await mk('N', (p) => ({context: base(p, 'no fee'), payments: {...PAY}, users: [U(p, 'rd')]}));
        await mk('E', (p) => ({context: base(p, 'enable off'), payments: {...PAY, enabled: false, membershipFee: 20}, users: [U(p, 'rd')]}));
        await mk('I', (p) => ({context: base(p, 'no instructions'), payments: {currency: 'USD', paymentPluginName: 'ManualPayment', membershipFee: 20}, users: [U(p, 'rd')]}));
        await mk('F', (p) => ({context: base(p, 'fresh'), users: [U(p, 'rd')]}));
        await mk('P', (p) => ({context: base(p, 'paypal'), payments: {currency: 'USD', paymentPluginName: 'PaypalPayment', membershipFee: 20},
            users: [U(p, 'mg', 'manager'), U(p, 'rd')]}));
        fact('seed', C);
        const P = (k) => C[k] && !C[k].error && C[k].path;
        const u = (k, x) => `${C[k].p}${x}`;
        const pm = (k) => `/index.php/${P(k)}/user/payMembership`;
                // queued_payments keeps the payment as one serialized object (payment_data): match its contextId / userId
        const inCtx = (k) => `payment_data like '%"contextId";i:' || (select journal_id from journals where path='${P(k)}') || ';%'`;
        const qpCount = (k) => q(`select count(*) from queued_payments where ${inCtx(k)}`);
        const qpLast = (k) => q(`select queued_payment_id, payment_data from queued_payments where ${inCtx(k)} order by queued_payment_id desc limit 1`);
        const cpRows = (k) => q(`select payment_type, user_id, assoc_id, amount, currency_code_alpha, payment_method_plugin_name from completed_payments where context_id=(select journal_id from journals where path='${P(k)}')`);
        const memberRows = (name) => q(`select setting_name, setting_value from user_settings where user_id=(select user_id from users where username='${name}') and setting_name ilike '%member%'`);
        const settingsRows = (k) => q(`select setting_name, setting_value from journal_settings where journal_id=(select journal_id from journals where path='${P(k)}') and setting_name in ('paymentsEnabled','paymentPluginName','currency','membershipFee')`);
        const pluginRows = (k) => q(`select plugin_name, setting_name, setting_value from plugin_settings where context_id=(select journal_id from journals where path='${P(k)}') and plugin_name ilike '%payment%'`);
        /** One typed visit of the address as whoever is signed in: the page, the queued rows, the log. */
        async function visit(k, name) {
            const m = lg.mark(); const q0 = qpCount(k);
            const f = await land(pm(k), name);
            return {page: brief(f), queued: {before: q0, after: qpCount(k)}, log: lg.since(m)};
        }
        const articleGalley = () => page.locator('.item.galleys a.obj_galley_link').filter({hasText: /PDF/}).first();
        const fullIssueGalley = () => page.locator('.obj_issue_toc > .galleys a.obj_galley_link, .obj_issue_toc .heading ~ .galleys a.obj_galley_link').filter({hasText: 'PDF'}).first();
        async function pressBoth(k, prefix) {
            const o = {};
            await land(`/index.php/${P(k)}/article/view/${C[k].sub}`, `${prefix}-a-article`);
            o.article = brief(await press(articleGalley(), `${prefix}-b-article-pdf`));
            o.article.galleyView = await page.locator('header.header_view').count().catch(() => 0);
            await land(`/index.php/${P(k)}/issue/current`, `${prefix}-c-issue`);
            o.fullIssue = brief(await press(fullIssueGalley(), `${prefix}-d-fullissue-pdf`));
            o.fullIssue.galleyView = await page.locator('header.header_view').count().catch(() => 0);
            for (const x of [o.article, o.fullIssue]) { delete x.links; delete x.paras; }
            return o;
        }
        fact('settings', Object.fromEntries(['S', 'N', 'E', 'I', 'F', 'P'].filter(P).map((k) => [k, {journal: settingsRows(k), plugins: pluginRows(k)}])));

        // ================================================ 1. one account per level at the typed address (S)
        if (P('S') && want('levels')) await sect('levels', async () => {
            const out = {};
            for (const k of ['admin', 'mg', 'sm', 'se', 'ce', 'rv', 'au', 'rd']) {
                await as(k === 'admin' ? 'admin' : u('S', k), P('S'));
                out[k] = await visit('S', `c-lv-${k}-paymembership`);
                delete out[k].page.paras;
                if (k === 'rd') {
                    await loc(page, 'Manual Fee Payment (membership): the Title/Fee table', page.locator('.pkp_structure_main table'));
                    await loc(page, 'Manual Fee Payment (membership): Send notification of payment', page.getByRole('link', {name: 'Send notification of payment'}));
                    out.rd.lastQueued = flat(qpLast('S'), 900);
                }
            }
            fact('levels', out);
        });

        // ================================================ 2. the Reader pays with the manual method (S)
        if (P('S') && want('pay')) await sect('pay', async () => {
            const out = {};
            await as(u('S', 'rd'), P('S'));
            out.first = await visit('S', 'c-pay-a-paymembership');
            out.reloaded = await visit('S', 'c-pay-b-paymembership-reloaded');
            const since = new Date(Date.now() - 2000);
            const m = lg.mark();
            const f = await press(page.getByRole('link', {name: 'Send notification of payment'}), 'c-pay-c-notified');
            out.notified = {...brief(f), log: lg.since(m)};
            try {
                const msg = await app.mail.find({to: `${C.S.p}pc@mail.test`, since, timeoutMs: 15_000});
                out.mail = {subject: msg.Subject, from: msg.From && msg.From.Address, to: (msg.To || []).map((x) => x.Address), snippet: flat(msg.Snippet, 500)};
                out.mailCost20 = await app.mail.count({to: `${C.S.p}pc@mail.test`, since, contains: 'The cost is 20 (USD)'});
                out.mailMembership = await app.mail.count({to: `${C.S.p}pc@mail.test`, since, contains: 'Individual Membership Fee'});
            } catch (e) { out.mail = {none: flat(e.message, 200)}; }
            out.mailToPayer = await app.mail.count({to: `${u('S', 'rd')}@mail.test`, since});
            // every link the message page offers, pressed in turn (the sweep)
            out.afterLinks = [];
            for (const l of (f.links || [])) {
                if (!l.href || /^#|^javascript/.test(l.href)) { out.afterLinks.push({...l, skipped: true}); continue; }
                await land(`/index.php/${P('S')}/user/payMembership`, 'c-pay-d-again').catch(() => {});
                await press(page.getByRole('link', {name: 'Send notification of payment'}), 'c-pay-d-again-notified');
                const g = await press(page.locator('.pkp_structure_main').getByRole('link', {name: l.text, exact: true}), `c-pay-e-link-${l.text.replace(/\W+/g, '').toLowerCase()}`);
                out.afterLinks.push({...l, landed: {url: g.url, chain: g.chain, h1: g.h1}});
            }
            out.db = {member: memberRows(u('S', 'rd')), completed: cpRows('S'), queued: qpCount('S')};
            // the manager's screens: the list of payments and the user's Edit window
            await as(u('S', 'mg'), P('S'));
            await page.goto(app.url(`/index.php/${P('S')}/payments`)); await idle(page);
            await page.locator('#subscriptionsTabs a[name=payments]').click().catch(() => {});
            await idle(page); await sleep(800);
            await snap('c-pay-f-manager-payments-list');
            out.paymentsList = flat(await page.locator('#subscriptionsTabs .pkp_controllers_grid:visible').first().innerText().catch(() => null), 500);
            await page.goto(app.url(`/index.php/${P('S')}/management/settings/access`)); await idle(page);
            // Users & Roles › Users (the Vue list): the row's options button, its menu, "Edit User"
            const table = page.getByRole('table', {name: /Current Users \(/});
            await table.waitFor({timeout: T}).catch(() => {});
            await idle(page);
            await snap('c-pay-g-manager-users');
            const row = table.getByRole('row').filter({hasText: `${u('S', 'rd')}@mail.test`});
            if (await row.count()) {
                await row.getByRole('button').last().click().catch(() => {});
                await page.getByRole('menuitem').first().waitFor({timeout: T}).catch(() => {});
                out.rowMenu = (await page.getByRole('menuitem').allInnerTexts().catch(() => [])).map((x) => flat(x, 60));
                await page.getByRole('menuitem').filter({hasText: /Edit/}).first().click().catch(() => {});
                // "Edit" opens the page Users & Roles / {user} (the roles step of the invitation flow), not a window
                await page.waitForURL(/management\/settings\/user\//, {timeout: T}).catch(() => {});
                await idle(page); await sleep(800);
                await snap('c-pay-h-manager-edit-user');
                const main = page.locator('main').first();
                const txt = await main.innerText().catch(() => '');
                out.editUser = {url: page.url().replace(app.baseURL, ''), member: /membership/i.test(txt), date: txt.match(/\d{4}-\d{2}-\d{2}/g), text: flat(txt, 600),
                    fields: await main.evaluate((d) => [...d.querySelectorAll('input,select,textarea')].map((i) => i.name || i.id).filter(Boolean)).catch(() => [])};
                await page.keyboard.press('Escape').catch(() => {});
            } else out.editUser = {row: 'not found'};
            fact('pay', out);
        });

        // ================================================ 3. the other ends: no fee, payments not set up (signed in)
        if (want('ends')) await sect('ends', async () => {
            const out = {};
            for (const k of ['N', 'E', 'I', 'F']) {
                if (!P(k)) continue;
                await as(u(k, 'rd'), P(k));
                out[k] = await visit(k, `c-en-${k}-paymembership`);
                const btn = page.getByRole('link', {name: 'Send notification of payment'});
                if (await btn.count().catch(() => 0)) {
                    out[k].notifyHref = await btn.first().getAttribute('href').catch(() => null);
                    const since = new Date(Date.now() - 2000);
                    const m = lg.mark();
                    out[k].notified = {...brief(await press(btn, `c-en-${k}-notified`)), log: lg.since(m)};
                    out[k].mailToContact = await app.mail.count({to: `${C[k].p}pc@mail.test`, since});
                }
                out[k].db = {queued: qpCount(k), completed: cpRows(k), last: flat(qpLast(k), 400)};
            }
            fact('ends', out);
        });

        // ================================================ 4. signed out: the address and the two purchase addresses (A9)
        if (want('signedout')) await sect('signedout', async () => {
            const out = {};
            await visitor();
            for (const k of ['S', 'E', 'F']) if (P(k)) out[k] = await visit(k, `c-so-${k}-paymembership`);
            if (P('S')) {
                for (const kind of ['individual', 'institutional']) {
                    const m = lg.mark();
                    out[`S-purchase-${kind}`] = {page: brief(await land(`/index.php/${P('S')}/user/purchaseSubscription/${kind}`, `c-so-S-purchase-${kind}`)), log: lg.since(m)};
                }
            }
            fact('signedout', out);
        });

        // ================================================ 5. the PayPal method (P): Account Name typed on screen, then the address
        if (P('P') && want('paypal')) await sect('paypal', async () => {
            const out = {};
            await as(u('P', 'mg'), P('P'));
            await page.goto(app.url(`/index.php/${P('P')}/management/settings/distribution`)); await idle(page);
            await page.locator('#payments-button').click(); await idle(page); await sleep(600);
            const pane = page.locator('#payments').first();
            await pane.locator('input[name="paymentsEnabled"]').check().catch(() => {});
            await pane.locator('select[name="paymentPluginName"]').selectOption('PaypalPayment').catch(() => {});
            await pane.locator('input[name="accountName"]').fill('i27c-account').catch((e) => log('acct', flat(e.message, 120)));
            const rs = page.waitForResponse((r) => /\/_payments/.test(r.url()) && r.request().method() !== 'GET', {timeout: T}).then((r) => r.status()).catch(() => null);
            await pane.getByRole('button', {name: 'Save', exact: true}).click();
            out.save = await rs;
            await idle(page); await sleep(800);
            await snap('c-pp-a-manager-paypal-saved');
            out.settings = {journal: settingsRows('P'), plugins: pluginRows('P')};
            await as(u('P', 'rd'), P('P'));
            out.reader = await visit('P', 'c-pp-b-paymembership');
            out.lastQueued = flat(qpLast('P'), 600);
            fact('paypal', out);
        });

        // ================================================ 6. the PayPal return's code, run from PHP (S)
        if (P('S') && want('fulfil')) await sect('fulfil', async () => {
            const out = {};
            const run = (script, id) => {
                try {
                    return execFileSync('php', [script, String(id)], {cwd: app.root, env: {...process.env, PKP_CONFIG_FILE: app.configFile}, encoding: 'utf8', timeout: 120_000}).trim();
                } catch (e) { return `FAILED: ${flat(String(e.stdout || '') + ' | ' + String(e.stderr || '') + ' | ' + e.message, 1500)}`; }
            };
            const qid = (name) => q(`select max(queued_payment_id) from queued_payments where payment_data like '%"userId";i:' || (select user_id from users where username='${name}') || ';%'`).trim();
            for (const [k, script] of [['pp', path.join(__dirname, 'fulfil.php')], ['pk', KEPT]]) {
                await as(u('S', k), P('S'));
                const o = {visit: await visit('S', `c-fu-${k}-paymembership`)};
                delete o.visit.page.links; delete o.visit.page.paras;
                o.queuedPaymentId = qid(u('S', k));
                const m = lg.mark();
                o.script = path.relative(path.join(__dirname, '../../../../..'), script);
                o.output = run(script, o.queuedPaymentId);
                o.log = lg.since(m);
                o.db = {member: memberRows(u('S', k)), completed: cpRows('S'), stillQueued: q(`select count(*) from queued_payments where queued_payment_id=${Number(o.queuedPaymentId) || 0}`)};
                if (k === 'pp') o.galleys = await pressBoth('S', 'c-fu-pp');
                out[k] = o;
            }
            await as(u('S', 'mg'), P('S'));
            await page.goto(app.url(`/index.php/${P('S')}/payments`)); await idle(page);
            await page.locator('#subscriptionsTabs a[name=payments]').click().catch(() => {});
            await idle(page); await sleep(800);
            await snap('c-fu-mg-payments-list');
            out.paymentsList = flat(await page.locator('#subscriptionsTabs .pkp_controllers_grid:visible').first().innerText().catch(() => null), 500);
            fact('fulfil', out);
        });
        if (process.env.PROBE_RUN !== 'r2') note('I27C: `{journal}/user/payMembership` is typed (no link); queued_payments has no context or user column (the payment is one serialized object in payment_data: match \'"contextId";i:<id>;\' / \'"userId";i:<id>;\'); '
            + 'Users & Roles › Users is a Vue table getByRole(table, {name: /Current Users \\(/}), a row by its email, its options button is the row\'s last button (named with a raw key), then getByRole(menuitem) "Edit…".');
    } finally {
        await close();
    }
});
