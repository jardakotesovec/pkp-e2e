// U17 claim check, chunk K4: the "Submissions" page, no section open, the interface, cross-feature.
// Spec: docs/specs/U17-sections.md — Rules 12, 13 (219–243), Rule 17 (278–285, declared: no screen reads the address),
// Cross-feature interactions (390–431), register A1, A4, A5; footnotes e, g, td11, td12, td15, f-a1, f-a4, f-a5.
//
//   PROBE_FEATURE=U17 PROBE_AGENT=ccK4 node bin/probe.js <ojs|omp|ops|all> shared/playwright/checks/U17/K4/k4.js
//   PHASES=seed,setup,about,link,notopen,cross,control,disable,disabledlink,omppub,enable,pkauthor   (default: all; state in k4-state-<app>.json under
//   the output folder, so a phase can be re-run alone; delete the state file for a fresh seed).
//
// Scratch contexts (tag prefix u17k4):
//   OJS/OPS A  sections "Open" (policy), "Closed" (policy), "EdOnly" (policy), "Bare" (no policy), "Later" (policy);
//              on screen: "Closed" inactive, "EdOnly" editor-only, "Later" dragged to the top ("Order", "Done").
//              users: mg manager, ed editor (OJS), se sectionEditor, ge guestEditor (OJS), ce copyeditor (OJS) /
//              eb editorialBoardMember (OPS), au author, rv externalReviewer (OJS), rd reader; one submission by au in
//              "Open". Last phase (disable): Settings › Workflow › Submission › "Disable Submissions" ticked.
//           B  one section "Only" (policy), ticked editor-only on screen; users mg, au.
//           C  "Shut" (policy, inactive on screen) and "Staff" (policy, editor-only on screen); users mg, au.
//   OMP     P  users mg, au; on screen a series "K4 Restricted" ("Don't allow authors to submit directly…").
// publicknowledge is read only: visitor Submissions pages (all apps), the OMP dashboard and My Submissions filters.
// The sections interface address is never opened (Frame: no screen sends it); every run record is swept for it.
// No assertions: the script records, the reader judges.
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, signOut, screen, shot, record, loc, note, idle, tag, outDir} = require('../../../probe');

const T = 30_000;
const ALL = ['seed', 'setup', 'about', 'link', 'notopen', 'cross', 'control', 'disable', 'disabledlink', 'omppub', 'enable', 'pkauthor'];
const PHASES = (process.env.PHASES || ALL.join(',')).split(',');
const on = (p) => PHASES.includes(p);
const log = (...a) => console.log('[k4]', ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (s, n = 1500) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));
// RUN=2 (or any tag) prefixes every snapshot and the facts file, so a repeat run keeps the first run's evidence.
const RUNP = process.env.RUN ? `r${process.env.RUN}-` : '';
const statePath = (app) => path.join(outDir(), `k4-state-${app.name}.json`);

// The "Submissions" page as data: the notice under the heading, the headings, every policy block (heading, text, the
// line under it and its link), every link of the page body with its address.
const SUBPAGE = () => {
    const t = (s) => (s || '').replace(/\s+/g, ' ').trim();
    const main = document.querySelector('.page_submissions') || document.querySelector('.pkp_structure_main') || document.body;
    return {
        h1: t((main.querySelector('h1') || {}).innerText),
        notice: t((main.querySelector('.cmp_notification') || {}).innerText),
        noticeLinks: [...main.querySelectorAll('.cmp_notification a')].map((a) => ({text: t(a.innerText), href: a.getAttribute('href')})),
        headings: [...main.querySelectorAll('h2')].map((h) => t(h.innerText)),
        policies: [...main.querySelectorAll('.section_policy')].map((d) => ({
            heading: t((d.querySelector('h2') || {}).innerText),
            text: t(d.innerText).slice(0, 300),
            line: t([...d.querySelectorAll('p')].map((p) => p.innerText).filter((x) => /Make a new submission/.test(x)).join(' | ')),
            links: [...d.querySelectorAll('a')].map((a) => ({text: t(a.innerText), href: a.getAttribute('href')})),
        })),
        links: [...main.querySelectorAll('a')].map((a) => ({text: t(a.innerText) || a.title || a.getAttribute('aria-label'), href: a.getAttribute('href')})).slice(0, 40),
    };
};
// The start form "Make a Submission" as data: every radio (name, label, checked), the headings, visible field labels.
const STARTFORM = () => {
    const t = (s) => (s || '').replace(/\s+/g, ' ').trim();
    const vis = (e) => e.getClientRects().length > 0;
    const main = document.querySelector('main') || document.body;
    return {
        h1: [...main.querySelectorAll('h1')].map((h) => t(h.innerText)),
        radios: [...main.querySelectorAll('input[type=radio]')].map((e) => ({name: e.name, value: e.value, label: t((e.closest('label') || e.parentElement).innerText), checked: e.checked, visible: vis(e)})),
        legends: [...main.querySelectorAll('legend, .pkpFormFieldLabel')].filter(vis).map((x) => t(x.innerText)).slice(0, 30),
        text: t(main.innerText).slice(0, 2500),
    };
};

forEachApp(async (app) => {
    const isOJS = app.name === 'ojs';
    const isOPS = app.name === 'ops';
    const isOMP = app.name === 'omp';
    const S = fs.existsSync(statePath(app)) ? JSON.parse(fs.readFileSync(statePath(app), 'utf8')) : {};
    const save = () => fs.writeFileSync(statePath(app), JSON.stringify(S, null, 1));
    const fact = (k, v) => { record(`${RUNP}k4-facts`, {[k]: v}, {merge: true}); log(`[${app.name} ${k}]`, JSON.stringify(v).slice(0, 2500)); };
    const strip = (u) => (u || '').replace(app.baseURL, '').replace(/^https?:\/\/127\.0\.0\.1:\d+/, '');
    const GRIDSEL = isOMP ? '#seriesGridContainer' : '#sectionsGridContainer';
    const FORMSEL = isOMP ? 'form#seriesForm' : 'form#sectionForm';
    const TAB = isOMP ? 'Series' : 'Sections';

    // ------------------------------------------------------------------ seed
    if (on('seed') && !S.seeded) {
        const t = tag('u17k4');
        S.t = t;
        const u = (p, k, roles, g, fam) => ({username: `${p}${k}`, roles, givenName: g, familyName: fam});
        const mk = async (key, spec) => {
            const p = `${t}${key}`;
            try {
                const r = await app.api.createContext({tag: p, ...spec});
                log('seed', p, 'ok');
                return {path: r.path || p};
            } catch (e) { log('seed FAILED', p, String(e.message).slice(0, 800)); return {path: p, error: String(e.message).slice(0, 800)}; }
        };
        const sec = (abbrev, title, policy) => ({abbrev, title, ...(policy ? {policy} : {}), ...(isOPS ? {path: abbrev.toLowerCase()} : {})});
        if (!isOMP) {
            const p = `${t}a`;
            const users = [u(p, 'mg', ['manager'], 'Mia', 'Manager'), u(p, 'se', ['sectionEditor'], 'Sam', 'Section'),
                u(p, 'au', ['author'], 'Amy', 'Author'), u(p, 'rd', ['reader'], 'Rae', 'Reader')];
            if (isOJS) users.push(u(p, 'ed', ['editor'], 'Eddie', 'Editor'), u(p, 'ge', ['guestEditor'], 'Gia', 'Guest'),
                u(p, 'ce', ['copyeditor'], 'Cole', 'Copy'), u(p, 'rv', ['externalReviewer'], 'Rex', 'Reviewer'));
            else users.push(u(p, 'eb', ['editorialBoardMember'], 'Eli', 'Board'));
            S.A = await mk('a', {context: {name: `U17 K4 ${app.name} A ${t}`, acronym: 'KFOUR'}, users,
                sections: [sec('OPN', 'Open', 'Open policy'), sec('CLS', 'Closed', 'Closed policy'), sec('EDO', 'EdOnly', 'Editors policy'),
                    sec('BAR', 'Bare'), sec('LAT', 'Later', 'Later policy')]});
            S.B = await mk('b', {context: {name: `U17 K4 ${app.name} B ${t}`}, sections: [sec('ONL', 'Only', 'Only policy')],
                users: [u(`${t}b`, 'mg', ['manager'], 'Bea', 'Manager'), u(`${t}b`, 'au', ['author'], 'Ben', 'Author')]});
            S.C = await mk('c', {context: {name: `U17 K4 ${app.name} C ${t}`}, sections: [sec('SHT', 'Shut', 'Shut policy'), sec('STF', 'Staff', 'Staff policy')],
                users: [u(`${t}c`, 'mg', ['manager'], 'Cy', 'Manager'), u(`${t}c`, 'au', ['author'], 'Cal', 'Author')]});
            try {
                const r = await app.api.createSubmission({tag: `${t}s1`, context: S.A.path, submitter: `${t}aau`, title: `K4 submission in Open ${t}`, section: 'OPN'});
                S.sub = r.submissionId;
            } catch (e) { S.subError = String(e.message).slice(0, 600); }
        } else {
            S.P = await mk('p', {context: {name: `U17 K4 press ${t}`}, users: [u(`${t}p`, 'mg', ['manager'], 'Pam', 'Manager'), u(`${t}p`, 'au', ['author'], 'Pia', 'Author')]});
        }
        S.seeded = true; save();
        record('seed', S);
    }
    if (!S.seeded) { log('no state; run seed first'); return; }
    if (PHASES.length === 1 && PHASES[0] === 'seed') return;
    const A = S.A && S.A.path;
    const B = S.B && S.B.path;
    const C = S.C && S.C.path;
    const P = S.P && S.P.path;
    const U = (ctx, k) => `${ctx}${k}`;

    // ------------------------------------------------------------------ browser and helpers
    const {page, close} = await launch(app);
    const jsDialogs = [];
    page.on('dialog', (d) => {
        jsDialogs.push({at: Date.now(), type: d.type(), message: flat(d.message(), 300), url: strip(page.url())});
        log('[browser dialog]', d.type(), flat(d.message(), 160));
        d.accept().catch(() => {});
    });
    const dialogsSince = (s) => jsDialogs.filter((d) => d.at >= s);
    const consoleMsgs = [];
    page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) consoleMsgs.push({at: Date.now(), type: m.type(), t: flat(m.text(), 300)}); });
    page.on('pageerror', (e) => consoleMsgs.push({at: Date.now(), type: 'pageerror', t: flat(e.message, 300)}));
    const bad = [];
    const apiSeen = [];
    page.on('response', (r) => {
        const url = strip(r.url());
        if (r.status() >= 400) bad.push({at: Date.now(), status: r.status(), m: r.request().method(), url: url.slice(0, 200)});
        if (/\/api\/v1\/sections/.test(url)) apiSeen.push({at: Date.now(), status: r.status(), url: url.slice(0, 200), from: strip(page.url())});
    });
    const since = (arr, s) => arr.filter((x) => x.at >= s);
    await page.context().addInitScript(() => {
        window.__notices = [];
        const seen = new WeakSet();
        const sweep = () => {
            document.querySelectorAll('[role="alert"], [role="status"], .pkpNotification, .pkp_notification, .ui-pnotify, [class*="toast"], [class*="Toast"]').forEach((e) => {
                const tx = (e.innerText || '').trim();
                if (tx && !seen.has(e)) { seen.add(e); window.__notices.push({t: tx.slice(0, 300), at: Date.now()}); }
            });
        };
        new MutationObserver(sweep).observe(document, {subtree: true, childList: true, characterData: true});
    });
    const noticesSince = async (s) => page.evaluate((x) => (window.__notices || []).filter((n) => n.at >= x).map((n) => n.t), s).catch(() => []);

    async function snap(name, extra = {}, {png = false} = {}) {
        let s;
        try { s = await screen(page); } catch (e) { s = {url: page.url(), error: String(e.message).slice(0, 200)}; }
        Object.assign(s, extra);
        record(RUNP + name, s);
        if (png) await shot(page, RUNP + name).catch(() => {});
        return s;
    }
    async function sect(name, fn) {
        try { return await fn(); } catch (e) {
            log(`[${name} FAILED]`, String(e.stack || e).split('\n').slice(0, 4).join(' | '));
            fact(`${name}.FAILED`, String(e.message || e).slice(0, 600));
            await snap(`zz-failed-${name.replace(/[^a-z0-9]+/gi, '-')}`, {}, {png: true}).catch(() => {});
            return null;
        }
    }
    const as = async (user, ctx) => { await signIn(page, user, {contextPath: ctx}); await idle(page).catch(() => {}); };
    const visitor = async () => { await signOut(page).catch(() => {}); };
    const cu = (ctx, p, l = 'en') => app.url(`/index.php/${ctx}${l ? `/${l}` : ''}${p}`);
    const go = async (url) => {
        const r = await page.goto(url, {waitUntil: 'domcontentloaded'}).catch((e) => ({err: String(e.message).slice(0, 200)}));
        await idle(page).catch(() => {});
        return r && r.status ? r.status() : r;
    };
    const grid = () => page.locator(GRIDSEL).first();
    const form = () => page.locator(FORMSEL).first();
    const top = () => page.locator('[role="dialog"]:visible').last();
    const gridTitles = async () => grid().locator('tbody:not(.empty) tr.gridRow').evaluateAll((trs) => trs.map((tr) => {
        const c = tr.querySelectorAll('td');
        const box = tr.querySelector('input[type=checkbox]');
        return {title: (c[0] ? c[0].innerText : '').replace(/\s+/g, ' ').replace(/^Settings\s*/, '').trim(), inactive: box ? box.checked : null};
    }));

    async function openTab(ctx) {
        const status = await go(cu(ctx, '/management/settings/context'));
        const tab = page.getByRole('tab', {name: TAB, exact: true}).first();
        await tab.click(); await idle(page);
        await grid().waitFor({timeout: T});
        await grid().locator('tr.gridRow, tbody.empty').first().waitFor({state: 'attached', timeout: T}).catch(() => {});
        await sleep(500);
        return status;
    }
    const rowOf = (title) => grid().locator('tr.gridRow').filter({hasText: title}).first();
    async function openEdit(title) {
        const row = rowOf(title);
        const tog = row.locator('a.show_extras');
        if (await tog.count()) { await tog.first().click(); await sleep(400); }
        const id = await row.getAttribute('id');
        await page.locator(`tr#${id} + tr`).getByRole('link', {name: 'Edit', exact: true}).first().click();
        await form().locator('input[name^="title"]').first().waitFor({timeout: T});
        await idle(page); await sleep(800);
    }
    async function openCreate() {
        await grid().getByRole('link', {name: isOMP ? /Add Series/ : /Create Section/}).first().click();
        await form().locator('input[name^="title"]').first().waitFor({timeout: T});
        await idle(page); await sleep(800);
    }
    async function pressSave(label) {
        const t0 = Date.now();
        const w = page.waitForResponse((r) => r.request().method() === 'POST' && /update-?(section|series)/i.test(r.url()), {timeout: T}).catch(() => null);
        await form().getByRole('button', {name: 'Save', exact: true}).click();
        const r = await w;
        await sleep(1200); await idle(page).catch(() => {});
        const open = await form().isVisible().catch(() => false);
        const out = {post: r ? {status: r.status(), url: strip(r.url()).slice(0, 160)} : null, windowOpen: open, notices: await noticesSince(t0), dialogs: dialogsSince(t0), failed: since(bad, t0)};
        await snap(label, {save: out});
        if (open) { await top().getByRole('button', {name: 'Close'}).first().click().catch(() => {}); await sleep(900); }
        return out;
    }
    async function tickBox(title, rx, label) {
        await openEdit(title);
        await form().getByRole('checkbox', {name: rx}).first().check();
        return pressSave(label);
    }
    // the "Submissions" page, read once per reader
    async function subPage(ctx, key, {png = false} = {}) {
        const t0 = Date.now();
        const status = await go(cu(ctx, '/about/submissions'));
        const o = await page.evaluate(SUBPAGE);
        o.status = status;
        o.failed = since(bad, t0); o.console = since(consoleMsgs, t0);
        await snap(key, {facts: o}, {png});
        return o;
    }
    async function readStart(key) {
        await page.locator('input[type=radio], .pkpForm, .page_message, main h1').first().waitFor({timeout: T}).catch(() => {});
        await idle(page); await sleep(1000);
        const o = await page.evaluate(STARTFORM);
        o.url = strip(page.url());
        await snap(key, {facts: o});
        return o;
    }

    // ================================================================== setup: the section states on screen (OJS, OPS A, B, C; OMP P)
    if (on('setup') && !S.setupDone) await sect('setup', async () => {
        const out = {};
        if (!isOMP) {
            await as(U(A, 'mg'), A);
            await openTab(A);
            out.aBefore = await gridTitles();
            out.closed = await tickBox('Closed', /Mark this section as inactive/, 's-01-a-closed-inactive');
            out.edonly = await tickBox('EdOnly', /Items can only be submitted by/, 's-02-a-edonly-restricted');
            // "Later" to the top: "Order", drag, "Done"
            await openTab(A);
            const order = grid().getByRole('link', {name: 'Order', exact: true}).first();
            await order.click(); await sleep(800);
            const rows = grid().locator('tr.gridRow');
            const src = rows.filter({hasText: 'Later'}).first();
            const dst = rows.first();
            const sb = await src.boundingBox();
            const tb = await dst.boundingBox();
            await page.mouse.move(sb.x + 40, sb.y + sb.height / 2);
            await page.mouse.down();
            await page.mouse.move(sb.x + 40, sb.y + sb.height / 2 - 5, {steps: 5});
            await page.mouse.move(tb.x + 40, tb.y + 3, {steps: 30});
            await sleep(300);
            await page.mouse.move(tb.x + 40, tb.y + 2, {steps: 2});
            await page.mouse.up();
            await sleep(700);
            out.whileOrdering = await gridTitles();
            const t0 = Date.now();
            await grid().getByRole('link', {name: 'Done', exact: true}).first().click();
            await sleep(1500); await idle(page);
            out.orderNotices = await noticesSince(t0);
            await openTab(A);
            out.aAfter = await gridTitles();
            await snap('s-03-a-grid-after-order', {grid: out.aAfter}, {png: true});
            // B: its one section editor-only
            await as(U(B, 'mg'), B);
            await openTab(B);
            out.only = await tickBox('Only', /Items can only be submitted by/, 's-04-b-only-restricted');
            await openTab(B);
            out.bAfter = await gridTitles();
            await snap('s-05-b-grid', {grid: out.bAfter});
            // C: one inactive, the other editor-only
            await as(U(C, 'mg'), C);
            await openTab(C);
            out.staff = await tickBox('Staff', /Items can only be submitted by/, 's-06-c-staff-restricted');
            out.shut = await tickBox('Shut', /Mark this section as inactive/, 's-07-c-shut-inactive');
            await openTab(C);
            out.cAfter = await gridTitles();
            await snap('s-08-c-grid', {grid: out.cAfter});
        } else {
            await as(U(P, 'mg'), P);
            await openTab(P);
            await openCreate();
            await form().locator('input[name="title[en]"]').fill('K4 Restricted');
            await form().locator('input[name="path"]').fill('k4-restricted');
            await form().getByRole('checkbox', {name: /Don't allow authors to submit directly/}).first().check();
            out.series = await pressSave('s-01-p-series-restricted');
            await openTab(P);
            out.pAfter = await gridTitles();
            await snap('s-02-p-grid', {grid: out.pAfter});
        }
        await visitor();
        S.setupDone = true; save();
        fact('setup', out);
    });

    // ================================================================== enable: "Disable Submissions" unticked again on A (before a repeat run)
    if (on('enable') && !isOMP) await sect('enable', async () => {
        await as(U(A, 'mg'), A);
        await go(cu(A, '/management/settings/workflow'));
        await page.locator('#submission-button').first().click().catch(() => {});
        await sleep(700);
        await page.getByRole('tab', {name: 'Disable Submissions', exact: true}).first().click(); await idle(page); await sleep(800);
        const panel = page.locator('#disableSubmissions');
        await panel.getByRole('checkbox').first().uncheck();
        await panel.getByRole('button', {name: 'Save', exact: true}).click();
        await sleep(2500); await idle(page);
        await go(cu(A, '/management/settings/workflow'));
        const banner = flat(await page.locator('.pkp_page_content, main').first().innerText().catch(() => ''), 200);
        await snap('e-01-mg-workflow-enabled', {banner});
        await visitor();
        fact('enable', {banner});
    });

    // ================================================================== about: Rule 12, 12a, 12b per permission level
    if (on('about')) await sect('about', async () => {
        const out = {};
        const ctx = isOMP ? P : A;
        await visitor();
        out.visitor = await subPage(ctx, 'a-00-visitor', {png: true});
        const levels = isOMP ? ['au', 'mg'] : isOJS ? ['rd', 'au', 'rv', 'ce', 'se', 'ge', 'ed', 'mg'] : ['rd', 'au', 'eb', 'se', 'mg'];
        let i = 1;
        for (const k of levels) {
            await as(U(ctx, k), ctx);
            out[k] = await subPage(ctx, `a-0${i++}-${k}`, {png: k === 'au' || k === 'mg'});
        }
        await as('admin', ctx);
        out.admin = await subPage(ctx, `a-0${i}-admin`);
        await visitor();
        fact('about', out);
    });

    // ================================================================== link: 12b, A1 — the section link and the start form
    if (on('link') && !isOMP) await sect('link', async () => {
        const out = {};
        await as(U(A, 'au'), A);
        await subPage(A, 'l-00-au-page');
        const link = page.locator('.section_policy').filter({hasText: 'Open policy'}).getByRole('link', {name: 'Open', exact: true}).first();
        await loc(page, 'Submissions page: a policy block\'s section link .section_policy getByRole(link, {name: <section>})', link);
        out.openHref = await link.getAttribute('href');
        await link.click();
        out.fromLink = await readStart('l-01-au-start-from-open-link');
        // the page's own "Make a new submission" at the top
        await subPage(A, 'l-02-au-page-again');
        const topLink = page.locator('.cmp_notification').getByRole('link', {name: 'Make a new submission', exact: true}).first();
        out.topHref = await topLink.getAttribute('href');
        await topLink.click();
        out.fromTop = await readStart('l-03-au-start-from-top');
        // leave the start form with a section chosen and a title typed
        const r0 = page.locator('input[type=radio][name="sectionId"]').first();
        if (await r0.count()) { await r0.check().catch(() => {}); }
        const title = page.locator('input[name^="title"], [id^="startSubmission-title"] [contenteditable], .tox-edit-area iframe').first();
        out.titleBox = await title.count();
        const t0 = Date.now();
        await go(cu(A, '/about/submissions'));
        out.leave = {dialogs: dialogsSince(t0), url: strip(page.url())};
        await snap('l-04-au-left-start-form', {leave: out.leave});
        // "view your pending submissions"
        const view = page.locator('.cmp_notification').getByRole('link', {name: /view your pending submissions/}).first();
        out.viewHref = await view.getAttribute('href').catch(() => null);
        if (await view.count()) { await view.click(); await idle(page); await sleep(1000); out.viewLands = strip(page.url()); await snap('l-05-au-view-pending'); }
        // the reader
        await as(U(A, 'rd'), A);
        await subPage(A, 'l-06-rd-page');
        await page.locator('.section_policy').filter({hasText: 'Later policy'}).getByRole('link', {name: 'Later', exact: true}).first().click();
        out.rdFromLink = await readStart('l-07-rd-start-from-later-link');
        // the manager: the editor-only and the inactive section's links
        await as(U(A, 'mg'), A);
        await subPage(A, 'l-08-mg-page');
        const edLink = page.locator('.section_policy').filter({hasText: 'Editors policy'}).getByRole('link', {name: 'EdOnly', exact: true}).first();
        out.mgEdHref = await edLink.getAttribute('href');
        await edLink.click();
        out.mgFromEdOnly = await readStart('l-09-mg-start-from-edonly-link');
        await subPage(A, 'l-10-mg-page-again');
        const clLink = page.locator('.section_policy').filter({hasText: 'Closed policy'}).getByRole('link', {name: 'Closed', exact: true}).first();
        out.mgClHref = await clLink.getAttribute('href').catch(() => null);
        if (await clLink.count()) { await clLink.click(); out.mgFromClosed = await readStart('l-11-mg-start-from-closed-link'); }
        // the manager's "Edit" beside a heading
        await subPage(A, 'l-12-mg-page-edit');
        const edit = page.locator('.page_submissions h2 a').first();
        out.editHref = await edit.getAttribute('href').catch(() => null);
        if (await edit.count()) { await edit.click(); await idle(page); await sleep(1200); out.editLands = strip(page.url()); await snap('l-13-mg-edit-lands'); }
        // one open section left for the manager: B's "Only"
        await as(U(B, 'mg'), B);
        await subPage(B, 'l-14-b-mg-page');
        const only = page.locator('.section_policy').getByRole('link', {name: 'Only', exact: true}).first();
        if (await only.count()) { await only.click(); out.bMgFromOnly = await readStart('l-15-b-mg-start-from-only-link'); }
        await visitor();
        fact('link', out);
    });

    // ================================================================== notopen: Rule 13 (B every section editor-only, C mixed, OMP restricted series)
    if (on('notopen')) await sect('notopen', async () => {
        const out = {};
        const list = isOMP ? [[P, 'p']] : [[B, 'b'], [C, 'c']];
        for (const [ctx, k] of list) {
            await visitor();
            out[`${k}Visitor`] = await subPage(ctx, `n-${k}-00-visitor`, {png: true});
            await as(U(ctx, 'au'), ctx);
            out[`${k}Au`] = await subPage(ctx, `n-${k}-01-au`);
            // typing the start form's address as the author
            await go(cu(ctx, '/submission'));
            out[`${k}AuStart`] = await readStart(`n-${k}-02-au-start-typed`);
            await as(U(ctx, 'mg'), ctx);
            out[`${k}Mg`] = await subPage(ctx, `n-${k}-03-mg`, {png: true});
            await go(cu(ctx, '/submission'));
            out[`${k}MgStart`] = await readStart(`n-${k}-04-mg-start-typed`);
        }
        await visitor();
        fact('notopen', out);
    });

    // ================================================================== cross: the pointers' screens (dashboard / My Submissions filters, workflow menu)
    const filtersWin = () => page.getByRole('dialog').filter({has: page.getByRole('button', {name: 'Apply Filters', exact: true})}).last();
    async function filters(ctx, view, key) {
        await go(cu(ctx, `/dashboard/${view}`));
        const btn = page.locator('main, #app-main').first().getByRole('button', {name: 'Filters', exact: true}).first();
        await btn.waitFor({timeout: T}).catch(() => {});
        await idle(page); await sleep(700);
        if (!(await btn.count())) { await snap(key, {filters: null}); return null; }
        await btn.click();
        await filtersWin().getByRole('button', {name: 'Apply Filters', exact: true}).waitFor({timeout: T});
        await idle(page); await sleep(900);
        const o = await filtersWin().evaluate((d) => {
            const t = (s) => (s || '').replace(/\s+/g, ' ').trim();
            const vis = (e) => e.getClientRects().length > 0;
            const sets = [...d.querySelectorAll('fieldset, .pkpFormField')].filter(vis).map((f) => ({
                label: t((f.querySelector('legend, .pkpFormFieldLabel, label') || {}).innerText),
                options: [...f.querySelectorAll('input[type=checkbox]')].map((b) => t((b.closest('label') || b.parentElement).innerText)),
            })).filter((x) => x.options.length);
            return {labels: [...d.querySelectorAll('legend, .pkpFormFieldLabel')].filter(vis).map((x) => t(x.innerText)), sets};
        });
        await snap(key, {filters: o});
        await filtersWin().getByRole('button', {name: 'Close'}).first().click().catch(() => {});
        await sleep(500);
        return o;
    }
    if (on('cross')) await sect('cross', async () => {
        const out = {};
        if (!isOMP) {
            await as(U(A, 'mg'), A);
            out.dashboard = await filters(A, 'editorial', 'x-01-mg-dashboard-filters');
            if (S.sub) {
                await go(cu(A, `/dashboard/editorial?workflowSubmissionId=${S.sub}`));
                await sleep(1500); await idle(page);
                const wf = page.locator('[role="dialog"]:visible').first();
                out.workflowMenu = await wf.locator('nav a, nav button, [role="menuitem"], a').evaluateAll((els) => els.filter((e) => e.getClientRects().length).map((e) => (e.innerText || '').replace(/\s+/g, ' ').trim()).filter(Boolean)).catch(() => []);
                await snap('x-02-mg-workflow', {menu: out.workflowMenu});
                const place = wf.getByRole('link', {name: /^(Issue|Publication Settings|Preprint Entry)$/i}).last();
                if (await place.count()) {
                    await place.click(); await idle(page); await sleep(2000);
                    out.sectionSelect = await page.locator('[role="dialog"]:visible').first().evaluate((d) => {
                        const t = (s) => (s || '').replace(/\s+/g, ' ').trim();
                        return [...d.querySelectorAll('select')].map((s) => {
                            const f = s.closest('.pkpFormField');
                            return {name: s.name, label: t((f && f.querySelector('.pkpFormFieldLabel, label') || {}).innerText), options: [...s.options].map((o) => t(o.text))};
                        });
                    }).catch((e) => ({error: String(e.message).slice(0, 200)}));
                    await snap('x-03-mg-placement-page', {selects: out.sectionSelect});
                }
                const ta = page.locator('[role="dialog"]:visible').first().getByRole('link', {name: 'Title & Abstract', exact: true}).first();
                out.titleAbstract = await ta.count();
            }
            await as(U(A, 'au'), A);
            out.mySubmissions = await filters(A, 'mySubmissions', 'x-04-au-mysubmissions-filters');
        } else {
            await as('manager.maya', 'publicknowledge');
            out.dashboard = await filters('publicknowledge', 'editorial', 'x-01-pk-mg-dashboard-filters');
            await as('author.alex', 'publicknowledge');
            out.mySubmissions = await filters('publicknowledge', 'mySubmissions', 'x-04-pk-au-mysubmissions-filters');
        }
        await visitor();
        fact('cross', out);
    });

    // ================================================================== control: publicknowledge, read only, as a visitor
    if (on('control')) await sect('control', async () => {
        await visitor();
        const o = await subPage('publicknowledge', 'c-01-pk-visitor');
        fact('control', o);
    });

    // ================================================================== disable: A with "Disable Submissions" ticked (Rule 13's other way there)
    if (on('disable') && !isOMP) await sect('disable', async () => {
        const out = {};
        await as(U(A, 'mg'), A);
        await go(cu(A, '/management/settings/workflow'));
        await page.locator('#submission-button').first().click().catch(() => {});
        await sleep(700);
        const inner = page.getByRole('tab', {name: 'Disable Submissions', exact: true}).first();
        await inner.click(); await idle(page); await sleep(800);
        const panel = page.locator('#disableSubmissions');
        const box = panel.getByRole('checkbox').first();
        out.panelText = flat(await panel.innerText().catch(() => ''), 600);
        await snap('d-01-mg-disable-tab', {text: out.panelText});
        await box.check();
        const t0 = Date.now();
        await panel.getByRole('button', {name: 'Save', exact: true}).click();
        await page.locator('[role="status"]:has-text("Saved")').first().waitFor({timeout: T}).catch(() => {});
        out.saveNotices = await noticesSince(t0);
        out.failed = since(bad, t0);
        await go(cu(A, '/management/settings/workflow'));
        out.banner = flat(await page.locator('.pkp_page_content, main').first().innerText().catch(() => ''), 300);
        await snap('d-02-mg-workflow-after', {banner: out.banner});
        out.mg = await subPage(A, 'd-03-mg-page');
        await visitor();
        out.visitor = await subPage(A, 'd-04-visitor-page', {png: true});
        await as(U(A, 'au'), A);
        out.au = await subPage(A, 'd-05-au-page');
        await visitor();
        fact('disable', out);
    });
    // the policy blocks' links on a page that says "not accepting" (after the disable phase)
    if (on('disabledlink') && !isOMP) await sect('disabledlink', async () => {
        const out = {};
        for (const k of ['au', 'mg']) {
            await as(U(A, k), A);
            await subPage(A, `d-06-${k}-page`);
            await page.locator('.section_policy').filter({hasText: 'Open policy'}).getByRole('link', {name: 'Open', exact: true}).first().click();
            out[`${k}FromOpen`] = await readStart(`d-07-${k}-start-from-open-link`);
        }
        await visitor();
        fact('disabledlink', out);
    });

    // ================================================================== pkauthor: publicknowledge, read only, as author.alex: the page and the section link (A1's example)
    if (on('pkauthor') && !isOMP) await sect('pkauthor', async () => {
        const out = {};
        await as('author.alex', 'publicknowledge');
        out.page = await subPage('publicknowledge', 'k-01-pk-author-page');
        const first = page.locator('.section_policy').first().getByRole('link').first();
        if (await first.count()) {
            out.href = await first.getAttribute('href');
            await first.click();
            out.start = await readStart('k-02-pk-author-start-from-link');
        }
        await visitor();
        fact('pkauthor', out);
    });

    // ================================================================== omppub: a book's "Series" on its Catalog Entry page (the Catalog management pointer)
    if (on('omppub') && isOMP) await sect('omppub', async () => {
        const out = {};
        if (!S.psub) {
            try {
                const r = await app.api.createSubmission({tag: `${S.t}ps`, context: P, submitter: U(P, 'au'), title: `K4 book ${S.t}`, series: 'k4-restricted'});
                S.psub = r.submissionId; save();
            } catch (e) { out.seedError = String(e.message).slice(0, 600); }
        }
        if (S.psub) {
            await as(U(P, 'mg'), P);
            await go(cu(P, `/dashboard/editorial?workflowSubmissionId=${S.psub}`));
            await sleep(1500); await idle(page);
            const wf = page.locator('[role="dialog"]:visible').first();
            out.menu = await wf.locator('a, button').evaluateAll((els) => els.filter((e) => e.getClientRects().length).map((e) => (e.innerText || '').replace(/\s+/g, ' ').trim()).filter(Boolean)).catch(() => []);
            const ce = wf.getByRole('link', {name: /^Catalog Entry$/i}).last();
            if (await ce.count()) {
                await ce.click(); await idle(page); await sleep(2000);
                out.fields = await page.locator('[role="dialog"]:visible').first().evaluate((d) => {
                    const t = (s) => (s || '').replace(/\s+/g, ' ').trim();
                    return [...d.querySelectorAll('.pkpFormField, fieldset')].map((f) => ({label: t((f.querySelector('.pkpFormFieldLabel, legend, label') || {}).innerText),
                        options: [...f.querySelectorAll('option')].map((o) => t(o.text)).slice(0, 10)})).filter((x) => x.label).slice(0, 30);
                }).catch((e) => ({error: String(e.message).slice(0, 200)}));
            }
            await snap('o-01-p-mg-catalog-entry', {facts: out});
        }
        await visitor();
        fact('omppub', out);
    });

    fact('apiSectionsSeen', apiSeen);
    fact('failedAll', bad.slice(0, 80));
    fact('consoleAll', consoleMsgs.filter((m) => !/TinyMCE 9/.test(m.t)).slice(0, 80));
    await close();
});
