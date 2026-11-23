// U51 Subscriptions, claim check I51 (housekeeping 2026-11-23): the incidentals row of
// docs/tracking/incidentals.md (U51, 2026-11-20) "Reading a restricted galley as a paid-up association
// member": Rule 11's paid-up "Association Membership" bullet, Settings bullet 7 and note p, with the
// purchase rules (28, 32) as they bear on it.
//
// Run (twice, each run seeds its own scratch journals under a fresh u51i tag; one app per call):
//   bin/app-lock.sh shared ojs -- env PROBE_RUN=r1 PROBE_FEATURE=U51 PROBE_AGENT=ccI51 PROBE_NOTES_FEATURE=U51 \
//       node bin/probe.js ojs shared/playwright/checks/U51/I51/i51.js
//   bin/app-lock.sh shared omp -- env PROBE_RUN=r1 … node bin/probe.js omp shared/playwright/checks/U51/I51/i51.js
//   bin/app-lock.sh shared ops -- env PROBE_RUN=r1 … node bin/probe.js ops shared/playwright/checks/U51/I51/i51.js
//   (r2 the same with PROBE_RUN=r2). PARTS=manager (or visitor,before,pay,after,planted,controls,ends) seeds
//   and then drives only the named sections. No other script and no state file: the facts land in
//   .reports/U51/ccI51/i51-facts-<run>-<app>.json, one snapshot per screen beside them.
//
// OJS scratch journals (POST scenarios/context), each with one issue 1/1/2026 published with a "Full Issue"
// PDF and one article R (PDF) in it:
//   M  subscriptions required, payments set up ("Manual Fee Payment" with instructions), "Association
//      Membership" 7, subscription contact; type "I51 Individual" (10 USD, 12 months); mg (Journal manager),
//      sm (Subscription Manager), mb (Reader: the member, pays on screen), pl (Reader: a membership end date
//      written into user_settings by SQL, the read end of the row's claim, labelled as planted), sb (Reader,
//      active individual subscription, seeded), bu (Reader, buys "I51 Individual" on screen, the manager then
//      edits it to "Active").
//   Z  subscriptions required, payments set up, no fee (the default end of the membership box); mg, rd.
//   D  subscriptions required, payments NOT enabled, "Association Membership" 7; mg, rd.
// OMP, OPS: read-only controls on publicknowledge (the membership address signed out, the manager's
//   Distribution tabs and the "Payments" address).
// Database: SELECTs for evidence; one INSERT on the scratch user pl (user_settings dateEndMembership). No
// assertions.
const {forEachApp, launch, signIn, signOut, screen, shot, record, loc, note, idle, tag, sql, serverLog, users} = require('../../../probe');

const T = 30_000;
const log = (...a) => console.log('[i51]', ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (s, n = 1500) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));

forEachApp(async (app) => {
    const isOJS = app.name === 'ojs';
    const fact = (k, v) => { record('i51-facts', {[k]: v}, {merge: true}); log(`[${app.name} ${k}]`, flat(JSON.stringify(v), 2500)); };
    const q = (s) => { try { return sql(app, s); } catch (e) { return `sql error: ${flat(e.message, 200)}`; } };

    const {page, close} = await launch(app);
    const dialogs = [];
    page.on('dialog', async (d) => {
        dialogs.push({type: d.type(), message: d.message(), url: page.url()});
        if (d.type() === 'beforeunload' || (acceptConfirm && d.type() === 'confirm')) await d.accept().catch(() => {}); else await d.dismiss().catch(() => {});
    });
    let who = 'visitor';
    let acceptConfirm = false; // the sweep's second leave of "Payment Types" takes the confirm's OK branch
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
            await snap(`zz-failed-${name}`).catch(() => {});
            return null;
        }
    }
    const as = async (user, ctx) => {
        await signIn(page, user, {contextPath: ctx}).catch((e) => log('signIn slow', user, flat(e.message, 120)));
        await idle(page).catch(() => {});
        who = user;
    };
    const visitor = async () => { await signOut(page).catch(() => {}); who = 'visitor'; };

    /** The reader page as data (the frontend has no main landmark). */
    async function facts() {
        return page.evaluate(() => {
            const t = (s) => (s || '').replace(/\s+/g, ' ').trim();
            const vis = (e) => e.getClientRects().length > 0;
            const main = document.querySelector('.pkp_structure_main') || document.body;
            return {
                url: location.pathname + location.search,
                title: document.title,
                h1: [...main.querySelectorAll('h1')].filter(vis).map((e) => t(e.innerText)),
                paras: [...main.querySelectorAll('p')].filter(vis).map((e) => t(e.innerText)).filter(Boolean).slice(0, 30),
                tables: [...main.querySelectorAll('table')].filter(vis).map((tb) => [...tb.querySelectorAll('tr')].map((tr) => [...tr.children].map((c) => t(c.innerText)))),
                links: [...main.querySelectorAll('a')].filter(vis).map((a) => ({text: t(a.innerText), href: (a.getAttribute('href') || '').replace(location.origin, '')})).filter((l) => l.text),
                notices: [...document.querySelectorAll('.cmp_notification, .pkp_notification, [role=alert], #formErrors')].filter(vis).map((e) => t(e.innerText)).filter(Boolean),
                galleys: [...document.querySelectorAll('a.obj_galley_link')].filter(vis).map((a) => ({text: t(a.innerText), cls: a.className, href: (a.getAttribute('href') || '').replace(location.origin, '')})),
                galleyView: !!document.querySelector('header.header_view'),
                loginForm: !!document.querySelector('form.cmp_form.login'),
                nav: [...document.querySelectorAll('#navigationPrimary a')].map((a) => t(a.innerText)).filter(Boolean),
                userNav: [...document.querySelectorAll('#navigationUser a')].map((a) => t(a.innerText)).filter(Boolean),
                bodyLength: (document.body ? document.body.innerHTML : '').length,
                member: /membership/i.test(document.body ? document.body.innerText : ''),
                text: t(main.innerText).slice(0, 2000),
            };
        }).catch((e) => ({err: flat(e.message, 200)}));
    }
    function chainWatch() {
        const chain = [];
        const onResp = (r) => { try { if (r.request().isNavigationRequest() && r.frame() === page.mainFrame()) chain.push(`${r.status()} ${r.request().method()} ${r.url().replace(app.baseURL, '')}`); } catch (e) { /* none */ } };
        page.on('response', onResp);
        return {chain, stop: () => page.off('response', onResp)};
    }
    /** Land on a typed address; the screen first, then the facts. */
    async function land(p, name, extra = {}) {
        const w = chainWatch();
        const d0 = dialogs.length;
        await page.goto(p.startsWith('http') ? p : app.url(p)).catch((e) => w.chain.push(`goto error ${flat(e.message, 120)}`));
        await idle(page).catch(() => {});
        w.stop();
        await snap(name, extra);
        const f = await facts();
        f.chain = w.chain; f.dialogs = dialogs.slice(d0);
        record(name, {facts: f}, {merge: true});
        return f;
    }
    /** Press something that navigates; the screen first, then the facts. */
    async function press(locator, name, extra = {}) {
        const w = chainWatch();
        const d0 = dialogs.length;
        const n = await locator.count().catch(() => 0);
        if (!n) { w.stop(); const f = {missing: true}; record(name, {facts: f, ...extra}); return f; }
        const info = await locator.first().evaluate((e) => ({text: e.innerText.replace(/\s+/g, ' ').trim(), href: e.getAttribute('href')})).catch(() => null);
        const navP = page.waitForNavigation({timeout: 15_000, waitUntil: 'load'}).catch(() => null);
        await locator.first().click().catch((e) => w.chain.push(`click error ${flat(e.message, 100)}`));
        await navP;
        await idle(page).catch(() => {});
        await sleep(300);
        w.stop();
        await snap(name, extra);
        const f = await facts();
        f.chain = w.chain; f.pressed = info; f.dialogs = dialogs.slice(d0);
        record(name, {facts: f}, {merge: true});
        return f;
    }
    const brief = (f) => f && ({url: f.url, chain: f.chain, title: f.title, h1: f.h1, tables: f.tables && f.tables.length ? f.tables : undefined,
        notices: f.notices && f.notices.length ? f.notices : undefined, galleyView: f.galleyView, login: f.loginForm, bodyLength: f.bodyLength,
        dialogs: f.dialogs && f.dialogs.length ? f.dialogs : undefined, missing: f.missing,
        text: (f.galleyView ? undefined : flat(f.text, 400))});
    const cUrl = (ctx, p) => app.url(`/index.php/${ctx}${p}`);
    const isHome = (f, ctx) => !!f && new RegExp(`/index\\.php/${ctx}(/index)?/?$`).test(f.url || '');
    const W = () => page.locator('[role="dialog"]:visible').last();
    const articleGalley = (label = 'PDF') => page.locator('.item.galleys a.obj_galley_link').filter({hasText: new RegExp(`${label}\\s*(\\(|$)`)}).first();
    const fullIssueGalley = (label = 'PDF') => page.locator('.obj_issue_toc > .galleys a.obj_galley_link, .obj_issue_toc .heading ~ .galleys a.obj_galley_link').filter({hasText: label}).first();

    // ---- the manager's "Payments" page (legacy grids), as in K3
    async function paymentsTab(ctx, name) {
        await page.goto(cUrl(ctx, '/payments')); await idle(page);
        if (name) { await page.getByRole('tab', {name, exact: true}).click(); await idle(page); await sleep(400); }
        const panel = page.getByRole('tabpanel', {name: name || 'Individual Subscriptions'});
        await panel.locator('table, form').first().waitFor({timeout: T}).catch(() => {});
        await idle(page); await sleep(300);
        return panel;
    }
    async function readGrid(scope) {
        return scope.evaluate((root) => [...root.querySelectorAll('table')].filter((t) => t.getClientRects().length).map((t) => ({
            columns: [...t.querySelectorAll('thead th')].map((th) => th.innerText.trim()),
            rows: [...t.querySelectorAll('tbody tr')].filter((tr) => tr.getClientRects().length && !tr.classList.contains('row_controls') && !/control-row/.test(tr.id))
                .map((tr) => [...tr.querySelectorAll('td')].map((td) => td.innerText.replace(/\s+/g, ' ').trim()).join(' | ')),
        }))).catch((e) => [{err: String(e.message).slice(0, 200)}]);
    }
    const gridRow = (scope, re) => scope.locator('tr.gridRow').filter({hasText: re}).first();
    async function notices() {
        return page.evaluate(() => [...document.querySelectorAll('.pkp_notification, [role="alert"], [role="status"], .pkp_form_error, label.error, #formErrors')]
            .filter((e) => e.getClientRects().length).map((e) => e.innerText.replace(/\s+/g, ' ').trim()).filter(Boolean)).catch(() => []);
    }
    async function collectNotices(ms = 5000) {
        const seen = new Set();
        const end = Date.now() + ms;
        while (Date.now() < end) { for (const x of await notices()) seen.add(x); await sleep(150); }
        return [...seen];
    }
    async function setDate(w, which, value) {
        const box = w.locator(`[name="${which}-removed"]`).first();
        if (await box.count()) { await box.fill(value); await page.keyboard.press('Escape').catch(() => {}); }
        else await w.locator(`[name="${which}"]`).first().fill(value);
        await sleep(150);
    }
    const today = new Date().toISOString().slice(0, 10);
    const inAYear = (() => { const d = new Date(); d.setFullYear(d.getFullYear() + 1); return d.toISOString().slice(0, 10); })();

    const PARTS = process.env.PARTS ? process.env.PARTS.split(',') : null; // e.g. PARTS=manager: seed, then that section alone
    const want = (n) => !PARTS || PARTS.includes(n);
    try {
        if (!isOJS) {
            // ============================================================ OMP / OPS: read-only controls
            await sect('absence', async () => {
                const out = {};
                await visitor();
                let f = await land(`/index.php/${app.contextPath}/user/payMembership`, 'ab-01-visitor-paymembership');
                out.visitorPayMembership = brief(f);
                f = await land(`/index.php/${app.contextPath}/payments`, 'ab-02-visitor-payments');
                out.visitorPayments = {url: f.url, chain: f.chain, login: f.loginForm};
                await as('manager.maya', app.contextPath).catch(() => {});
                await page.goto(cUrl(app.contextPath, '/management/settings/distribution')); await idle(page); await sleep(500);
                out.distributionTabs = await page.getByRole('tab').allInnerTexts().catch(() => []);
                await snap('ab-03-manager-distribution');
                f = await land(`/index.php/${app.contextPath}/payments`, 'ab-04-manager-payments');
                out.managerPayments = brief(f);
                f = await land(`/index.php/${app.contextPath}/user/payMembership`, 'ab-05-manager-paymembership');
                out.managerPayMembership = brief(f);
                fact('absence', out);
            });
            return;
        }

        // ================================================================ seed (OJS)
        const t = tag('u51i');
        const C = {};
        const U = (p, k, role = 'reader') => ({username: `${p}${k}`, roles: [role], givenName: k.toUpperCase(), familyName: `Ififtyone${k}`});
        const base = (p, name) => ({name: `U51 I51 ${name}`, acronym: 'IFIFTYONE', contactName: 'I51 Principal', contactEmail: `${p}pc@mail.test`});
        const PAY = {currency: 'USD', paymentPluginName: 'ManualPayment', manualInstructions: 'Send a cheque to the I51 desk.'};
        const CONTACT = (p) => ({subscriptionName: 'I51 Subscriptions Desk', subscriptionEmail: `${p}desk@mail.test`, subscriptionMailingAddress: '1 Desk Road'});
        const T_IND = {name: 'I51 Individual', cost: 10, currency: 'USD', duration: 12};
        const PDF = {label: 'PDF', file: 'article.pdf'};
        const ISSUE = [{volume: 1, number: 1, year: 2026, published: true, galleys: [PDF]}];
        const mk = async (key, spec) => {
            const p = `${t}${key.toLowerCase()}`;
            try {
                const r = await app.api.createContext({tag: p, ...spec(p)});
                C[key] = {path: r.path || p, p, users: r.users || []};
                const s = await app.api.createSubmission({tag: `${p}r`, context: C[key].path, submitter: `${p}au`, title: `I51 R ${key} ${t}`,
                    published: true, issue: {volume: 1, number: 1, year: 2026}, galleys: [PDF]});
                C[key].sub = s.submissionId;
                log('seed', key, C[key].path, s.submissionId);
            } catch (e) { log('seed FAILED', key, flat(e.message, 900)); C[key] = {error: flat(e.message, 900)}; }
        };
        await mk('M', (p) => ({context: base(p, 'association'), publishingMode: 'subscription', payments: {...PAY, membershipFee: 7}, ...CONTACT(p),
            users: [U(p, 'mg', 'manager'), U(p, 'sm', 'subscriptionManager'), U(p, 'au', 'author'), U(p, 'mb'), U(p, 'pl'), U(p, 'sb'), U(p, 'bu')],
            subscriptionTypes: [T_IND], subscriptions: [{user: `${p}sb`, type: 'I51 Individual'}], issues: ISSUE}));
        await mk('Z', (p) => ({context: base(p, 'no fee'), publishingMode: 'subscription', payments: {...PAY}, ...CONTACT(p),
            users: [U(p, 'mg', 'manager'), U(p, 'au', 'author'), U(p, 'rd')], subscriptionTypes: [T_IND], issues: ISSUE}));
        await mk('D', (p) => ({context: base(p, 'payments off'), publishingMode: 'subscription', payments: {...PAY, enabled: false, membershipFee: 7}, ...CONTACT(p),
            users: [U(p, 'mg', 'manager'), U(p, 'au', 'author'), U(p, 'rd')], subscriptionTypes: [T_IND], issues: ISSUE}));
        fact('seed', C);
        const P = (k) => C[k] && !C[k].error && C[k].path;
        const u = (k, x) => `${C[k].p}${x}`;
        const art = (k) => `/index.php/${P(k)}/article/view/${C[k].sub}`;
        const iss = (k) => `/index.php/${P(k)}/issue/current`;
        const userId = (name) => q(`select user_id from users where username='${name}'`);
        const membershipRows = (name) => q(`select setting_name, locale, setting_value from user_settings where user_id=(select user_id from users where username='${name}') and setting_name ilike '%member%'`);
        const qpMax = () => q('select coalesce(max(queued_payment_id),0) from queued_payments');
        const cpRows = (k) => q(`select payment_type, user_id, amount, currency_code_alpha from completed_payments where context_id=(select journal_id from journals where path='${P(k)}')`);
        const lg0 = (() => { try { return serverLog(app); } catch (e) { return null; } })();
        const lg = {mark: () => (lg0 ? lg0.mark() : 0), since: (m) => { try { const r = lg0 ? lg0.since(m) : []; return Array.isArray(r) ? r : [String(r)]; } catch (e) { return [`log error ${flat(e.message, 100)}`]; } }};

        /** Press the article's PDF and the "Full Issue" PDF as whoever is signed in. */
        async function pressBoth(k, prefix) {
            const o = {};
            let f = await land(art(k), `${prefix}-a-article`);
            o.articleGalleys = f.galleys;
            o.article = brief(await press(articleGalley(), `${prefix}-b-article-pdf`));
            f = await land(iss(k), `${prefix}-c-issue`);
            o.issueGalleys = f.galleys;
            o.fullIssue = brief(await press(fullIssueGalley(), `${prefix}-d-fullissue-pdf`));
            return o;
        }

        // ================================================================ 1. signed out (Settings bullet 7: the message; Rule 32)
        if (P('M') && want('visitor')) await sect('visitor', async () => {
            const out = {};
            for (const k of ['M', 'Z', 'D']) {
                if (!P(k)) continue;
                await visitor();
                out[k] = await pressBoth(k, `vi-${k}`);
            }
            await visitor();
            const mark = lg.mark();
            const q0 = qpMax();
            out.payMembership = brief(await land(`/index.php/${P('M')}/user/payMembership`, 'vi-M-e-paymembership-typed'));
            out.payMembershipLog = lg.since(mark).slice(0, 8);
            out.queuedAfter = {before: q0, after: qpMax()};
            fact('visitor', out);
        });

        // ================================================================ 2. the member before paying
        if (P('M') && want('before')) await sect('before', async () => {
            await as(u('M', 'mb'), P('M'));
            const out = await pressBoth('M', 'mb-1-before');
            // where a membership could show to the reader
            let f = await land(`/index.php/${P('M')}/about/subscriptions`, 'mb-1-e-subscriptions-page');
            out.subscriptionsPage = {h1: f.h1, member: f.member, links: f.links, text: flat(f.text, 900)};
            f = await land(`/index.php/${P('M')}/user/subscriptions`, 'mb-1-f-my-subscriptions');
            out.mySubscriptions = {h1: f.h1, member: f.member, links: f.links, tables: f.tables, text: flat(f.text, 900)};
            out.profile = {};
            f = await land(`/index.php/${P('M')}/user/profile`, 'mb-1-g-profile');
            const tabs = await page.getByRole('tab').allInnerTexts().catch(() => []);
            out.profile.tabs = tabs.map((x) => flat(x, 60));
            for (const [i, name] of tabs.entries()) {
                await page.getByRole('tab').nth(i).click().catch(() => {});
                await idle(page).catch(() => {}); await sleep(500);
                const s = await snap(`mb-1-g-profile-tab-${i}`);
                const txt = await page.locator('[role="tabpanel"]:visible').first().innerText().catch(() => '');
                out.profile[flat(name, 40)] = {member: /membership/i.test(txt), date: /\d{4}-\d{2}-\d{2}/.test(txt), notices: s.notices};
            }
            f = await land(`/index.php/${P('M')}/index`, 'mb-1-h-home');
            out.home = {member: f.member, nav: f.nav, userNav: f.userNav};
            f = await land(`/index.php/${P('M')}/about`, 'mb-1-i-about');
            out.about = {member: f.member};
            out.db = membershipRows(u('M', 'mb'));
            fact('before', out);
        });

        // ================================================================ 3. the member pays (typed address; the manual method)
        if (P('M') && want('pay')) await sect('pay', async () => {
            const out = {};
            const mark = lg.mark();
            const q0 = qpMax();
            let f = await land(`/index.php/${P('M')}/user/payMembership`, 'mb-2-a-paymembership');
            out.paymentPage = {url: f.url, chain: f.chain, title: f.title, h1: f.h1, tables: f.tables, paras: f.paras, links: f.links};
            out.queued = {before: q0, after: qpMax()};
            out.queuedRow = q(`select queued_payment_id, payment_data from queued_payments where queued_payment_id > ${Number(q0) || 0}`).slice(0, 900);
            await loc(page, 'Manual Fee Payment: Send notification of payment', page.getByRole('link', {name: 'Send notification of payment'}));
            const since = new Date(Date.now() - 2000);
            f = await press(page.getByRole('link', {name: 'Send notification of payment'}), 'mb-2-b-notify');
            out.notified = {url: f.url, chain: f.chain, title: f.title, h1: f.h1, paras: f.paras, links: f.links, notices: f.notices};
            // every link the message page offers, pressed in turn
            out.notifiedLinks = [];
            for (const l of (f.links || [])) {
                if (!l.href || /^#/.test(l.href)) { out.notifiedLinks.push({...l, skipped: true}); continue; }
                out.notifiedLinks.push({...l});
            }
            const cont = page.locator('.pkp_structure_main a').filter({hasText: /Continue|Home/});
            if (await cont.count()) {
                const g = await press(cont.first(), 'mb-2-c-after-notify-link');
                out.afterLink = {url: g.url, chain: g.chain, home: isHome(g, P('M'))};
            }
            try {
                const m = await app.mail.find({to: `${C.M.p}pc@mail.test`, since, timeoutMs: 15_000});
                out.mail = {subject: m.Subject, from: m.From && m.From.Address, to: (m.To || []).map((x) => x.Address), snippet: flat(m.Snippet, 400)};
            } catch (e) { out.mail = {none: flat(e.message, 200)}; }
            out.log = lg.since(mark).slice(0, 10);
            out.db = {settings: membershipRows(u('M', 'mb')), completed: cpRows('M')};
            fact('pay', out);
        });

        // ================================================================ 4. the manager's screens: anything that marks it paid or shows it
        if (P('M') && want('manager')) await sect('manager', async () => {
            const out = {};
            for (const who2 of ['mg', 'sm']) {
                await as(u('M', who2), P('M'));
                const o = {};
                let panel = await paymentsTab(P('M'), 'Payments');
                await snap(`mg-${who2}-a-payments-list`);
                o.paymentsList = await readGrid(panel);
                o.paymentsPanel = flat(await panel.innerText().catch(() => null), 600);
                panel = await paymentsTab(P('M'), 'Individual Subscriptions');
                await snap(`mg-${who2}-b-individual`);
                o.individual = await readGrid(panel);
                o.tabs = await page.getByRole('tab').allInnerTexts().catch(() => []);
                if (who2 === 'mg') {
                    panel = await paymentsTab(P('M'), 'Payment Types');
                    await panel.locator('[name="membershipFee"]').waitFor({timeout: T}).catch(() => {});
                    await snap('mg-mg-c-payment-types');
                    await loc(page, 'Payment Types: Association Membership', panel.locator('[name="membershipFee"]'));
                    o.paymentTypes = await panel.evaluate((root) => {
                        const t = (s) => (s || '').replace(/\s+/g, ' ').trim();
                        const box = root.querySelector('[name="membershipFee"]');
                        const sec = box && box.closest('.section, fieldset');
                        return {
                            membershipFee: box ? box.value : null,
                            label: box ? t((root.querySelector(`label[for="${box.id}"]`) || {}).innerText) : null,
                            section: sec ? t((sec.querySelector('legend, .label, h3') || {}).innerText) : null,
                            legends: [...root.querySelectorAll('legend, h3, .pkp_helpers_title')].map((e) => t(e.innerText)).filter(Boolean),
                            boxes: [...root.querySelectorAll('input:not([type=hidden])')].map((i) => ({name: i.name, type: i.type, value: i.type === 'checkbox' ? i.checked : i.value})),
                        };
                    }).catch((e) => ({err: flat(e.message, 200)}));
                    // the sweep: leave the tab with the box changed and unsaved, to another tab and then off the page
                    const d0 = dialogs.length;
                    await panel.locator('[name="membershipFee"]').fill('9');
                    await panel.locator('[name="membershipFee"]').blur();
                    await page.getByRole('tab', {name: 'Subscription Policies', exact: true}).click(); await idle(page); await sleep(600);
                    await snap('mg-mg-d-left-tab-unsaved');
                    o.leftTab = {dialogs: dialogs.slice(d0)};
                    await page.getByRole('tab', {name: 'Payment Types', exact: true}).click(); await idle(page); await sleep(600);
                    o.backOnTab = await page.getByRole('tabpanel', {name: 'Payment Types'}).locator('[name="membershipFee"]').inputValue().catch(() => null);
                    o.activeTabAfterCancel = await page.locator('[role="tab"][aria-selected="true"]').allInnerTexts().catch(() => null);
                    // the OK branch: the same change, the tab switch confirmed
                    acceptConfirm = true;
                    const dA = dialogs.length;
                    await page.getByRole('tabpanel', {name: 'Payment Types'}).locator('[name="membershipFee"]').fill('11');
                    await page.getByRole('tabpanel', {name: 'Payment Types'}).locator('[name="membershipFee"]').blur();
                    await page.getByRole('tab', {name: 'Subscription Policies', exact: true}).click(); await idle(page); await sleep(800);
                    await snap('mg-mg-d2-left-tab-confirmed');
                    o.leftTabOk = {dialogs: dialogs.slice(dA), activeTab: await page.locator('[role="tab"][aria-selected="true"]').allInnerTexts().catch(() => null)};
                    acceptConfirm = false;
                    await page.getByRole('tab', {name: 'Payment Types', exact: true}).click(); await idle(page); await sleep(800);
                    o.backOnTabAfterOk = await page.getByRole('tabpanel', {name: 'Payment Types'}).locator('[name="membershipFee"]').inputValue().catch(() => null);
                    await snap('mg-mg-d3-back-on-tab');
                    const d1 = dialogs.length;
                    await page.goto(cUrl(P('M'), '/index')).catch(() => {}); await idle(page).catch(() => {});
                    o.leftPage = {dialogs: dialogs.slice(d1), url: page.url().replace(app.baseURL, '')};
                    panel = await paymentsTab(P('M'), 'Payment Types');
                    o.afterReload = await panel.locator('[name="membershipFee"]').inputValue().catch(() => null);
                    // the other end: no fee set (Z)
                    if (P('Z')) {
                        await as(u('Z', 'mg'), P('Z'));
                        panel = await paymentsTab(P('Z'), 'Payment Types');
                        await panel.locator('[name="membershipFee"]').waitFor({timeout: T}).catch(() => {});
                        await snap('mg-Z-e-payment-types');
                        o.zMembershipFee = await panel.locator('[name="membershipFee"]').inputValue().catch(() => null);
                    }
                }
                out[who2] = o;
            }
            fact('manager', out);
        });

        // ================================================================ 5. the member after paying
        if (P('M') && want('after')) await sect('after', async () => {
            await as(u('M', 'mb'), P('M'));
            const out = await pressBoth('M', 'mb-3-after');
            const f = await land(`/index.php/${P('M')}/user/subscriptions`, 'mb-3-e-my-subscriptions');
            out.mySubscriptions = {member: f.member, tables: f.tables};
            out.db = {settings: membershipRows(u('M', 'mb')), completed: cpRows('M')};
            fact('after', out);
        });

        // ================================================================ 6. the read end: a membership end date planted in user_settings
        if (P('M') && want('planted')) await sect('planted', async () => {
            const out = {};
            const id = userId(u('M', 'pl'));
            const end = Math.floor(Date.now() / 1000) + 365 * 86400;
            out.insert = q(`insert into user_settings (user_id, locale, setting_name, setting_value) values (${Number(id)}, '', 'dateEndMembership', '${end}') returning user_setting_id`);
            out.row = membershipRows(u('M', 'pl'));
            await as(u('M', 'pl'), P('M'));
            Object.assign(out, await pressBoth('M', 'pl-1'));
            let f = await land(`/index.php/${P('M')}/user/profile`, 'pl-1-e-profile');
            out.profileMember = f.member;
            f = await land(`/index.php/${P('M')}/user/subscriptions`, 'pl-1-f-my-subscriptions');
            out.mySubscriptionsMember = f.member;
            // a profile save, then the row read again (does a save keep a setting the schema does not name?)
            await land(`/index.php/${P('M')}/user/profile`, 'pl-1-g-profile-again');
            const saveBtn = page.locator('[role="tabpanel"]:visible').getByRole('button', {name: 'Save', exact: true}).first();
            if (await saveBtn.count()) {
                await saveBtn.click().catch(() => {});
                out.profileSaveNotices = await collectNotices(3000);
                await idle(page).catch(() => {});
                await snap('pl-1-h-profile-saved');
            }
            out.rowAfterProfileSave = membershipRows(u('M', 'pl'));
            fact('planted', out);
        });

        // ================================================================ 7. controls: a seeded subscriber; a reader who buys one and is marked paid
        if (P('M') && want('controls')) await sect('controls', async () => {
            const out = {};
            await as(u('M', 'sb'), P('M'));
            out.sb = await pressBoth('M', 'sb-1');
            // bu buys on screen (Rule 28), then is refused until the manager edits the subscription to Active (Rule 30)
            await as(u('M', 'bu'), P('M'));
            let f = await land(`/index.php/${P('M')}/user/subscriptions`, 'bu-1-a-my-subscriptions');
            out.buMy = {links: f.links, tables: f.tables};
            f = await press(page.locator('.pkp_structure_main a').filter({hasText: 'Purchase New Subscription'}), 'bu-1-b-purchase-page');
            out.buPurchasePage = {url: f.url, title: f.title, h1: f.h1, text: flat(f.text, 500)};
            f = await press(page.locator('form#subscriptionForm button.submit'), 'bu-1-c-save');
            out.buPayment = {url: f.url, title: f.title, h1: f.h1, tables: f.tables, paras: f.paras};
            out.buDb1 = q(`select s.status, s.date_start, s.date_end from subscriptions s join users us on us.user_id=s.user_id where us.username='${u('M', 'bu')}'`);
            f = await press(page.getByRole('link', {name: 'Send notification of payment'}), 'bu-1-d-notify');
            out.buNotify = {url: f.url, h1: f.h1, links: f.links};
            f = await land(`/index.php/${P('M')}/user/subscriptions`, 'bu-1-e-my-subscriptions-after');
            out.buMyAfter = {tables: f.tables};
            out.buBefore = await pressBoth('M', 'bu-2-awaiting');
            // the manager marks it paid as the screens allow: Edit › Status "Active"
            await as(u('M', 'mg'), P('M'));
            const panel = await paymentsTab(P('M'), 'Individual Subscriptions');
            const row = gridRow(panel, /Ififtyonebu/);
            const rid = await row.getAttribute('id');
            const arrow = row.locator('a.show_extras').first();
            if (await arrow.count()) { await arrow.click(); await sleep(400); }
            await page.locator(`[id="${rid}-control-row"]`).getByRole('link', {name: 'Edit', exact: true}).click();
            const w = W();
            await w.locator('form').first().waitFor({timeout: T}); await idle(page); await sleep(900);
            await snap('mg-f-edit-bu');
            out.editWindow = {status: await w.locator('[name="status"]').evaluate((s) => s.options[s.selectedIndex].text).catch(() => null)};
            await w.locator('[name="status"]').selectOption({label: 'Active'});
            await setDate(w, 'dateStart', today);
            await setDate(w, 'dateEnd', inAYear);
            await w.getByRole('button', {name: 'Save'}).first().click();
            out.editSave = await collectNotices(4500);
            await idle(page).catch(() => {});
            await snap('mg-g-edit-bu-saved');
            out.buDb2 = q(`select s.status, s.date_start, s.date_end from subscriptions s join users us on us.user_id=s.user_id where us.username='${u('M', 'bu')}'`);
            await as(u('M', 'bu'), P('M'));
            out.buAfter = await pressBoth('M', 'bu-3-active');
            fact('controls', out);
        });

        // ================================================================ 8. the membership address on Z (no fee) and D (payments off)
        if (want('ends')) await sect('ends', async () => {
            const out = {};
            for (const k of ['Z', 'D']) {
                if (!P(k)) continue;
                await as(u(k, 'rd'), P(k));
                const mark = lg.mark();
                const q0 = qpMax();
                const f = await land(`/index.php/${P(k)}/user/payMembership`, `en-${k}-a-paymembership`);
                out[k] = {page: brief(f), tables: f.tables, queued: {before: q0, after: qpMax()}, log: lg.since(mark).slice(0, 8)};
                out[k].pressed = await pressBoth(k, `en-${k}-rd`);
            }
            fact('ends', out);
        });
        if (process.env.PROBE_RUN !== 'r2') note('I51 (U51 membership): the manual method\'s page for `user/payMembership` is reached only by typing the address; '
            + 'the Payments page tab panels are found with getByRole(\'tabpanel\', {name}) after getByRole(\'tab\', {name, exact: true}).click(); '
            + 'the fee box on "Payment Types" is [name="membershipFee"].');
    } finally {
        await close();
    }
});
