// U23 drift sweep SW18 (housekeeping 2026-11-18): the claim check of the whole spec
// docs/specs/U23-submissions-dashboard.md at the `main` tips, for every line the kept checks I05, I28, I29
// and the kept issue walks (A10, A15, A19) do not reach.
//
//   PROBE_FEATURE=U23 PROBE_AGENT=ccSW18 PROBE_NOTES_FEATURE=U23 PROBE_RUN=r1 \
//     node bin/probe.js <ojs|omp|ops|all> shared/playwright/checks/U23/SW18/sw18.js
//   (then PROBE_RUN=r2). PHASES=<comma list> narrows (default: every phase below). Every run seeds its own
//   scratch contexts (tag prefix u23sw18); its state file is outFile('sw18-state.json'), read again by a later
//   run with the same PROBE_RUN and app (RESEED=1 seeds afresh). publicknowledge and the roster users are only
//   read (phase "refused"). No assertions: the script records, the reader judges. No other script or env part
//   is needed; the outputs land in .reports/U23/ccSW18/ as sw18-<phase>-<step>-<run>-<app>.json and
//   sw18-facts-<run>-<app>.json.
//
// Phases (scratch context per phase; users: mg Journal/Press/Server Manager, se Section editor / Series editor /
// Moderator, as an assistant (OJS/OMP Copyeditor or Funding coordinator; OPS Editorial Board Member), au author,
// rd reader, rv external reviewer):
//   views     S1, Rules 1, 2, 5, 9 (cells), 11, Actors rows 1-7: the landing, every sidebar view and its rows per
//             role, the table, the Filters fields of a plain context, "More Actions", the sort cycle, the retired
//             address, "Complete submission" (A2), "View" in place per role, the address for author/reader/reviewer
//   scope     S2, S4, Rule 3, Rule 7: assigned-only views and the global search of a Section Editor who is also an
//             author and a reviewer; the manager's global search with a filter on the results
//   search    S3, Side effects (nothing sent, nothing logged)
//   filters   S5, Fields table, Rule 8, A11 (two values in one field), OMP1
//   triage    S8, Rule 9d, Rule 13 (assignment)
//   review    S9, Rules 9e, 9f, 10, A7, A14, A20 (cancelled and declined-only rounds), the due-date edits that
//             reach the overdue states (OJS/OMP)
//   conflict  S10, Rule 9a, A3
//   declined  S11, Rule 9b, Rule 13 (decision and deletion inside the panel)
//   bulk      S12, S15, Rule 12, Actors row 7
//   issue     S13 (OJS)
//   revdecline Rule 9b: a decline taken on a review stage (OJS, OMP)
//   spinner   Rule 5: the heading's spinner while the list request is held back
//   omprev    S14 (OMP)
//   refused   S16 (publicknowledge, read only)
//   minimum   S17, Rule 9e confirmed lines (OJS/OMP)
//   profile   A8, Settings bullet 2
//   admin     A9 (a Site Administrator left with Author, or Reviewer, only) and A3 (the administrator's own row)
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, signOut, screen, shot, record, loc, note, idle, tag, outFile, sql} = require('../../../probe');

const RUN = process.env.PROBE_RUN || 'r0';
const ALL = 'views,scope,search,filters,triage,review,conflict,declined,bulk,issue,revdecline,spinner,omprev,refused,minimum,profile,admin';
const PHASES = (process.env.PHASES || ALL).split(',');
const on = (p) => PHASES.includes(p);
const T0 = Date.now();
const log = (...a) => console.log(`[sw18 ${RUN} +${Math.round((Date.now() - T0) / 1000)}s]`, ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (s, n = 2000) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));
const appPages = (app, f) => path.resolve(__dirname, '../../../../../apps', app.name, 'playwright/pages', f);
const sharedPages = (f) => path.resolve(__dirname, '../../../pages', f);
const DENIED = 'The current role does not have access to this operation.';
const ymd = (d) => d.toISOString().slice(0, 10);
const daysFromNow = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d; };

forEachApp(async (app) => {
    const isOJS = app.name === 'ojs', isOMP = app.name === 'omp', isOPS = app.name === 'ops';
    const statePath = outFile('sw18-state.json');
    const S = fs.existsSync(statePath) && process.env.RESEED !== '1' ? JSON.parse(fs.readFileSync(statePath, 'utf8')) : {};
    const save = () => fs.writeFileSync(statePath, JSON.stringify(S, null, 1));
    const fact = (k, v) => { record('sw18-facts', {[k]: v}, {merge: true}); log(`[${app.name} ${k}]`, JSON.stringify(v).slice(0, 1500)); };
    const strip = (u) => (u || '').replace(/^https?:\/\/127\.0\.0\.1:\d+/, '');
    const short = (u) => strip(u).replace(/^\/index\.php\/[^/]+\/en\/dashboard\/editorial/, '…dash').replace(/^\/index\.php\//, '');
    const u = (t, k, roles, givenName, familyName) => ({username: `${t}${k}`, givenName, familyName, email: `${t}${k}@mail.test`, roles});
    const assistantRole = isOPS ? 'editorialBoardMember' : 'copyeditor';
    const reviewDecision = isOMP ? 'skipInternalReview' : 'sendExternalReview';
    const declineDecision = isOPS ? 'decline' : 'initialDecline';
    const seRole = 'sectionEditor';

    const {page, close} = await launch(app);
    page.setDefaultTimeout(20_000);
    const dialogs = [];
    page.on('dialog', (d) => { dialogs.push({at: Date.now(), type: d.type(), message: flat(d.message(), 300)}); d.accept().catch(() => {}); });
    const traffic = [];
    page.context().on('response', (r) => {
        const x = r.url();
        if (r.status() >= 400 || /\/api\/v1\/|\$\$\$call\$\$\$/.test(x)) traffic.push({at: Date.now(), m: r.request().method(), s: r.status(), u: short(x).slice(0, 220)});
    });
    const errors = [];
    page.on('pageerror', (e) => errors.push({at: Date.now(), msg: flat(e.message, 300)}));
    page.on('console', (m) => { if (m.type() === 'error') errors.push({at: Date.now(), console: true, msg: flat(m.text(), 300)}); });
    const mark = () => Date.now();
    const net = (t0, re = /_submissions|reviewAssignments|decisions|stageAssignments|\$\$\$call\$\$\$/) => traffic.filter((x) => x.at >= t0 && (x.s >= 400 || re.test(x.u))).map((x) => `${x.m} ${x.s} ${x.u.replace(/assignedWithRoles%5B%5D=/g, 'r=').slice(0, 200)}`);
    const fails = (t0) => ({server: traffic.filter((x) => x.at >= t0 && x.s >= 500).map((x) => `${x.m} ${x.s} ${x.u}`), script: errors.filter((e) => e.at >= t0).map((e) => e.msg), dialogs: dialogs.filter((d) => d.at >= t0)});

    // ------------------------------------------------------------------ reading the page
    async function readDash() {
        return page.evaluate(() => {
            const t = (e) => (e ? e.innerText.replace(/\s+/g, ' ').trim() : null);
            const main = document.querySelector('#app-main') || document.body;
            const headers = [...main.querySelectorAll('table thead th')].map((th) => ({text: t(th), ariaSort: th.getAttribute('aria-sort'), sortable: !!th.querySelector('button')}));
            const rows = [...main.querySelectorAll('table tbody tr')].map((tr) => {
                const cells = [...tr.children].map(t);
                const buttons = [...tr.querySelectorAll('button')].map((b) => (b.getAttribute('aria-label') || t(b) || '').slice(0, 160));
                const dot = tr.querySelector('[class*="bg-stage-"]');
                const cb = tr.querySelector('input[type="checkbox"]');
                return {cells, buttons, dot: dot ? dot.className : null, checkbox: cb ? {checked: cb.checked, disabled: cb.disabled} : null};
            });
            const chips = [...main.querySelectorAll('div.bg-selection-light')].map(t);
            const boxes = [...document.querySelectorAll('input[type="search"]')].map((i) => ({inNav: !!i.closest('#app-nav'), label: i.getAttribute('aria-label') || (i.labels && i.labels[0] ? t(i.labels[0]) : null), value: i.value, placeholder: i.placeholder, visible: !!(i.offsetWidth || i.offsetHeight)}));
            const nav = [...document.querySelectorAll('#app-nav a')].map((a) => {
                const badge = [...a.querySelectorAll('span')].find((s) => /^\s*\d+\s*$/.test(s.innerText || ''));
                return {text: t(a), href: (a.getAttribute('href') || '').replace(/^.*index\.php\/[^/]+\/(en\/)?/, ''), current: a.getAttribute('aria-current'),
                    badge: badge ? {n: badge.innerText.trim(), cls: badge.className, bg: getComputedStyle(badge).backgroundColor, color: getComputedStyle(badge).color} : null};
            });
            const btn = (name) => [...document.querySelectorAll('button')].filter((b) => (b.getAttribute('aria-label') || b.innerText || '').trim() === name).length;
            const sm = (main.innerText || '').match(/Showing \d+ to \d+ of \d+/);
            const showing = sm ? sm[0] : null;
            const pager = [...document.querySelectorAll('nav[aria-label="View additional pages"] button')].map((b) => ({text: t(b), label: b.getAttribute('aria-label'), current: b.getAttribute('aria-current'), disabled: b.disabled}));
            const announcer = [...document.querySelectorAll('#announcer')].map((e) => ({text: t(e), live: e.getAttribute('aria-live'), atomic: e.getAttribute('aria-atomic')}));
            const dlg = [...document.querySelectorAll('[role="dialog"]')].filter((d) => d.offsetWidth || d.offsetHeight).map((d) => (d.getAttribute('aria-label') || t(d.querySelector('h1,h2')) || '').slice(0, 120));
            return {url: location.pathname.replace(/^.*\/dashboard/, '…/dashboard') + location.search, h1: t(main.querySelector('h1')), headers, rows, chips, boxes, nav,
                moreActions: btn('More Actions'), filtersButton: btn('Filters'), clearFilters: btn('Clear Filters'), showing, pager, announcer, dialogs: dlg,
                denied: (document.body.innerText || '').includes('The current role does not have access to this operation.')};
        });
    }
    let snapN = 0;
    async function snap(name, extra = {}, {png = false} = {}) {
        let s;
        try { s = await screen(page); } catch (e) { s = {url: page.url(), error: flat(e.message, 200)}; }
        let d;
        try { d = await readDash(); } catch (e) { d = {error: flat(e.message, 200)}; }
        snapN++;
        record(`sw18-${name}`, {...s, read: d, ...extra});
        if (png) await shot(page, `sw18-${name}`).catch(() => {});
        return {...d, notices: s.notices};
    }
    const rowsBrief = (d) => (d.rows || []).map((r) => [r.cells && r.cells.slice(0, 6).join(' | '), r.buttons && r.buttons.join(' / ')].join(' ⟂ ').slice(0, 300));
    const navBrief = (d) => (d.nav || []).filter((n) => /dashboard\//.test(n.href) || /Dashboard|Submissions|Assignments/.test(n.text || '')).map((n) => `${n.text}${n.badge ? ` [${n.badge.bg}]` : ''}`);

    async function sect(name, fn) {
        log(`== ${name}`);
        const t0 = mark();
        try { await fn(); } catch (e) {
            fact(`${name}.FAILED`, flat(String(e.stack || e).split('\n').slice(0, 5).join(' | '), 900));
            await snap(`zz-failed-${name}`, {}, {png: true}).catch(() => {});
        }
        fact(`${name}.fails`, fails(t0));
    }
    async function go(url) {
        const r = await page.goto(url).catch((e) => ({err: flat(e.message, 200)}));
        await idle(page).catch(() => {});
        await page.locator('#app-main h1').first().waitFor({timeout: 15_000}).catch(() => {});
        await idle(page).catch(() => {});
        return r && typeof r.status === 'function' ? r.status() : r;
    }
    const dash = (ctx, q = '') => app.url(`/index.php/${ctx}/en/dashboard/editorial${q}`);
    const as = async (user, ctx) => { await signIn(page, user, ctx ? {contextPath: ctx} : {}); await idle(page).catch(() => {}); await page.locator('#app-main h1').first().waitFor({timeout: 15_000}).catch(() => {}); await idle(page).catch(() => {}); };
    const h1 = () => page.locator('#app-main h1').first();
    const navLink = (name) => page.locator('#app-nav a[href*="dashboard/editorial"]').filter({has: page.getByText(name, {exact: true})}).first();
    async function openView(name) {
        const l = navLink(name);
        if (!(await l.isVisible().catch(() => false))) {
            await page.locator('#app-nav a').filter({has: page.getByText('Editor Dashboard', {exact: true})}).first().click().catch(() => {});
            await sleep(300);
        }
        await l.click();
        await idle(page).catch(() => {});
        await page.waitForFunction((n) => { const e = document.querySelector('#app-main h1'); return e && e.innerText.trim().startsWith(n + ' ('); }, name, {timeout: 15_000}).catch(() => {});
        await idle(page).catch(() => {});
    }
    const inPage = () => page.locator('#app-main').getByRole('searchbox', {name: /Search submissions, ID/});
    const sideBox = () => page.locator('#app-nav').getByRole('searchbox', {name: /^Search submissions/});
    async function commit(box, phrase) {
        await box.click();
        await box.fill('');
        await box.pressSequentially(String(phrase), {delay: 15});
        await box.press('Enter');
        await idle(page).catch(() => {}); await sleep(500); await idle(page).catch(() => {});
    }
    // a row by its title, matched whole and case-sensitively (a hasText filter on "Pending study" also matches
    // "Recommend pending study")
    const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const row = (text) => page.locator('#app-main table tbody tr').filter({has: page.getByText(new RegExp(`(^|— )${esc(text)}\\s*$`))}).first();
    const filtersModal = () => page.locator('[data-cy="active-modal"]').filter({has: page.getByRole('button', {name: 'Apply Filters', exact: true})});
    async function openFilters() {
        await page.getByRole('button', {name: 'Filters', exact: true}).click();
        await filtersModal().getByRole('button', {name: 'Apply Filters', exact: true}).waitFor();
        await idle(page).catch(() => {}); await sleep(300);
        return filtersModal();
    }
    async function readPanel() {
        const m = filtersModal();
        if (!(await m.count())) return null;
        return m.evaluate((el) => {
            const t = (e) => (e ? e.innerText.replace(/\s+/g, ' ').trim() : null);
            const labels = [...el.querySelectorAll('legend, label, .pkpFormFieldLabel')].map(t).filter(Boolean);
            const checks = [...el.querySelectorAll('input[type="checkbox"]')].map((c) => ({label: c.labels && c.labels[0] ? t(c.labels[0]) : c.getAttribute('aria-label'), checked: c.checked}));
            const combos = [...el.querySelectorAll('[role="combobox"], input[type="text"]')].map((c) => ({label: c.getAttribute('aria-label') || (c.labels && c.labels[0] ? t(c.labels[0]) : null), value: c.value}));
            const slider = el.querySelector('[role="slider"]');
            const selected = [...el.querySelectorAll('button')].map((b) => (b.getAttribute('aria-label') || '')).filter((s) => /^Remove /.test(s));
            const buttons = [...el.querySelectorAll('button')].map((b) => (b.getAttribute('aria-label') || t(b) || '')).filter(Boolean);
            return {text: t(el).slice(0, 1500), labels, checks, combos, selected, buttons, slider: slider ? {min: slider.getAttribute('aria-valuemin'), max: slider.getAttribute('aria-valuemax'), now: slider.getAttribute('aria-valuenow'), label: slider.getAttribute('aria-label') || slider.getAttribute('aria-labelledby')} : null};
        });
    }
    async function applyFilters() {
        await filtersModal().getByRole('button', {name: 'Apply Filters', exact: true}).click();
        await filtersModal().waitFor({state: 'detached', timeout: 15_000}).catch(() => {});
        await idle(page).catch(() => {}); await sleep(500); await idle(page).catch(() => {});
    }
    async function closeFilters() {
        await filtersModal().getByRole('button', {name: 'Close', exact: true}).first().click();
        await filtersModal().waitFor({state: 'detached', timeout: 15_000}).catch(() => {});
        await idle(page).catch(() => {}); await sleep(600);
    }
    async function setDays(n) {
        const slider = filtersModal().getByRole('slider');
        await slider.focus();
        await slider.press('Home');
        for (let i = 0; i < n; i++) await slider.press('ArrowRight');
        return slider.getAttribute('aria-valuenow');
    }
    async function pickSuggest(label, typed, optionText) {
        const box = filtersModal().getByRole('combobox', {name: label});
        await box.click();
        await box.fill('');
        await box.pressSequentially(typed, {delay: 30});
        await sleep(900); await idle(page).catch(() => {});
        const opts = await page.locator('[role="listbox"]:visible [role="option"]').allInnerTexts().catch(() => []);
        if (optionText) {
            await page.locator('[role="listbox"]:visible [role="option"]').filter({hasText: optionText}).first().click();
            await sleep(500);
        }
        return opts.map((o) => flat(o, 120));
    }
    async function moreActionsItems() {
        const b = page.getByRole('button', {name: 'More Actions', exact: true});
        if (!(await b.count())) return {count: 0};
        await b.first().click(); await sleep(500);
        const items = await page.getByRole('menuitem').evaluateAll((els) => els.map((e) => ({text: e.innerText.trim(), ariaDisabled: e.getAttribute('aria-disabled'), disabled: e.hasAttribute('data-disabled')}))).catch(() => []);
        return {count: await b.count(), items};
    }
    async function closeMenu() {
        const menu = page.locator('[data-reka-menu-content][role="menu"]');
        if (await menu.count()) { await menu.first().press('Escape').catch(() => {}); await sleep(300); }
    }
    async function walkViews(prefix) {
        const d0 = await readDash();
        const names = (d0.nav || []).filter((n) => /dashboard\/editorial/.test(n.href)).map((n) => (n.text || '').replace(/^\d+\s*/, '').replace(/\s*\d+$/, '').trim()).filter(Boolean);
        const out = {};
        let i = 0;
        for (const n of names) {
            i++;
            await openView(n).catch(() => {});
            const d = await snap(`${prefix}-view${String(i).padStart(2, '0')}`);
            out[n] = {h1: d.h1, url: d.url, rows: rowsBrief(d), showing: d.showing, pager: d.pager.length};
        }
        return out;
    }
    const workflowHeading = () => page.getByRole('heading', {name: /^Workflow:/});
    // the workflow panel: the dialog the address's workflowSubmissionId opened (its heading reads "Workflow: …" on a
    // stage page, "Preprint: …" / "Publication: …" on a publication page, as a declined preprint opens)
    async function closeWorkflow() {
        await page.getByRole('dialog').filter({has: page.getByRole('button', {name: 'Close', exact: true})}).last().getByRole('button', {name: 'Close', exact: true}).first().click();
        await page.waitForURL((x) => !x.searchParams.get('workflowSubmissionId'), {timeout: 15_000}).catch(() => {});
        await workflowHeading().waitFor({state: 'detached', timeout: 15_000}).catch(() => {});
        await idle(page).catch(() => {}); await sleep(600);
    }
    async function inPlace(prefix, title) {
        const o = {};
        const before = page.url();
        o.before = short(before);
        let t0 = mark();
        await row(title).getByRole('button', {name: 'View', exact: true}).click();
        await workflowHeading().waitFor({timeout: 20_000}).catch(() => {});
        await idle(page).catch(() => {}); await sleep(500);
        o.opened = {url: short(page.url()), heading: flat(await workflowHeading().first().innerText().catch(() => null), 200), dialogText: flat(await page.getByRole('dialog').filter({has: workflowHeading()}).first().innerText().catch(() => null), 300), net: net(t0)};
        await snap(`${prefix}-a-open`);
        const openUrl = page.url();
        t0 = mark();
        await go(openUrl); await workflowHeading().waitFor({timeout: 20_000}).catch(() => {}); await sleep(500);
        o.reloaded = {url: short(page.url()), heading: flat(await workflowHeading().first().innerText().catch(() => null), 200)};
        await snap(`${prefix}-b-reload`);
        t0 = mark();
        await closeWorkflow();
        o.closed = {url: short(page.url()), sameAsBefore: strip(page.url()) === strip(before), net: net(t0), workflowLeft: await workflowHeading().count()};
        await snap(`${prefix}-c-closed`);
        await go(page.url());
        o.reloadAfterClose = {url: short(page.url()), workflow: await workflowHeading().count()};
        await snap(`${prefix}-d-reload-closed`);
        return o;
    }
    // indicators: every button of the activity cell that is not a named action
    const ACTIONS = /^(View|Assign Editor|Assign Reviewers|Complete submission)$/;
    async function indicators(title) {
        const r = row(title);
        return r.locator('button[id^="headlessui-popover-button"], button[aria-haspopup]').evaluateAll((els) => els.map((b) => {
            const cls = [...new Set([...b.querySelectorAll('*')].concat([b]).flatMap((e) => String(e.getAttribute('class') || '').split(/\s+/)).filter((c) => /attention|negative|success|primary|warning|danger|stroke|text-/.test(c)))].slice(0, 20);
            const num = b.querySelector('span[aria-hidden="true"]');
            return {name: (b.getAttribute('aria-label') || b.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 200), ring: num ? num.innerText.trim() : null, icon: !!b.querySelector('svg'), cls};
        })).catch((e) => [`err ${String(e.message).slice(0, 80)}`]);
    }
    const popPanel = (title) => row(title).locator('[id^="headlessui-popover-panel"]');
    async function openPopover(title, i) {
        const btns = row(title).locator('button[id^="headlessui-popover-button"], button[aria-haspopup]');
        await btns.nth(i).click();
        await popPanel(title).first().waitFor({timeout: 10_000}).catch(() => {});
        await sleep(300);
        const p = popPanel(title).first();
        return {text: flat(await p.innerText().catch(() => null), 600), buttons: await p.getByRole('button').evaluateAll((els) => els.map((b) => (b.getAttribute('aria-label') || b.innerText || '').replace(/\s+/g, ' ').trim())).catch(() => [])};
    }
    async function closePopover(title) {
        if (await popPanel(title).count()) { await h1().click().catch(() => {}); await sleep(400); }
    }
    async function readAllPopovers(title) {
        const inds = await indicators(title);
        const out = [];
        for (let i = 0; i < inds.length; i++) {
            const p = await openPopover(title, i).catch((e) => ({err: flat(e.message, 120)}));
            out.push({...inds[i], popover: p});
            await closePopover(title);
        }
        return out;
    }
    const topDialogText = async () => flat(await page.locator('[role="dialog"]:visible').last().innerText().catch(() => null), 500);
    async function closeTopDialog() {
        const d = page.locator('[role="dialog"]:visible').last();
        const btn = d.getByRole('button', {name: /^(Close|Cancel)$/}).first();
        if (await btn.count()) await btn.click().catch(() => {});
        else await d.getByRole('link', {name: 'Cancel', exact: true}).first().click().catch(() => {});
        await sleep(1200); await idle(page).catch(() => {});
    }
    async function pickDate(scope, fieldPrefix, date) {
        const input = scope.locator(`input.datepicker[id^="${fieldPrefix}"]`).first();
        await input.click();
        const picker = page.locator('#ui-datepicker-div');
        await picker.waitFor({state: 'visible'});
        await picker.locator('select.ui-datepicker-year').selectOption(String(date.getFullYear()));
        await picker.locator('select.ui-datepicker-month').selectOption(String(date.getMonth()));
        await picker.locator('td:not(.ui-datepicker-other-month) a').filter({hasText: new RegExp(`^${date.getDate()}$`)}).first().click();
        await picker.waitFor({state: 'hidden'}).catch(() => {});
    }
    async function mkCtx(key, users, extra = {}) {
        const t = tag(`u23sw18${key}`);
        const c = await app.api.createContext({tag: t, context: {name: `U23 SW18 ${key} ${t}`, acronym: 'SW18', contactName: 'SW18 Contact', contactEmail: `${t}c@mail.test`},
            users: users(t), ...extra});
        return {tag: t, path: c.path || t, ids: {}, resp: {issues: c.issues, categories: c.categories}};
    }
    async function mkSub(C, k, spec) {
        try {
            const r = await app.api.createSubmission({tag: `${C.tag}${k}`, context: C.path, ...spec});
            C.ids[k] = r.submissionId;
            if (r.reviewAssignments) C.ra = {...(C.ra || {}), [k]: r.reviewAssignments};
        } catch (e) { C.ids[k] = `error ${flat(e.message, 300)}`; }
        save();
    }
    const mailCount = async (to, since) => app.mail.count({to, since}).catch((e) => `err ${flat(e.message, 80)}`);

    try {
        // ============================================================ views
        if (on('views')) await sect('views', async () => {
            if (!S.A) {
                const C = await mkCtx('a', (t) => [u(t, 'mg', ['manager'], 'Mara', 'Manager'), u(t, 'se', [seRole], 'Sela', 'Section'),
                    u(t, 'as', [assistantRole], 'Asta', 'Assistant'), u(t, 'au', ['author'], 'Ada', 'Author'), u(t, 'rd', ['reader'], 'Rosa', 'Reader'),
                    ...(isOPS ? [] : [u(t, 'rv', ['externalReviewer'], 'Rex', 'Reviewer')])]);
                S.A = C; save();
                const au = `${C.tag}au`, se = {username: `${C.tag}se`, role: seRole};
                const asg = isOPS ? [] : [{username: `${C.tag}as`, role: assistantRole}];
                await mkSub(C, 'new', {submitter: au, title: 'Alpha new study', participants: [se, ...asg]});
                if (!isOPS) await mkSub(C, 'cpy', {submitter: au, title: 'Beta copyedit study', decisions: ['skipExternalReview'], participants: [se, ...asg]});
                await mkSub(C, 'prd', {submitter: au, title: 'Gamma production study', decisions: isOPS ? [] : ['skipExternalReview', 'sendToProduction'], participants: [se]});
                await mkSub(C, 'pub', {submitter: au, title: 'Delta published study', published: true, participants: [se]});
                await mkSub(C, 'drf', {submitter: au, title: 'Epsilon draft study', submitted: false});
                await mkSub(C, 'dec', {submitter: au, title: 'Zeta declined study', decisions: [declineDecision], participants: [se]});
                if (!isOPS) await mkSub(C, 'rev', {submitter: au, title: 'Eta review study', decisions: [reviewDecision], reviewRounds: [{reviewers: []}], participants: [se]});
                await mkSub(C, 'una', {submitter: au, title: 'Theta unassigned study'});
            }
            const C = S.A, P = C.path;
            fact('views.seed', {ctx: P, ids: C.ids});
            const o = {};
            // ---- manager
            await as(`${C.tag}mg`, P);
            o.mgLanding = short(page.url());
            const ann = [];
            for (let i = 0; i < 6; i++) { ann.push(await page.locator('#announcer').evaluateAll((els) => els.map((e) => `${e.getAttribute('aria-atomic') ? 'A' : 'P'}:${e.innerText.trim()}`)).catch(() => [])); await sleep(400); }
            o.mgLandingAnnouncer = ann;
            let d = await snap('v01-mg-landing', {}, {png: true});
            o.mgLandingRead = {h1: d.h1, nav: navBrief(d), headers: d.headers, rows: rowsBrief(d), visibleTextHasLoaded: /\bLoaded\b/.test(JSON.stringify(d.rows) + d.h1)};
            await loc(page, 'Dashboard sidebar: a view entry (Active submissions)', navLink('Active submissions'));
            o.mgViews = await walkViews('v02-mg');
            await go(dash(P, '?currentViewId=active'));
            d = await snap('v03-mg-active', {}, {png: true});
            o.mgActive = {h1: d.h1, headers: d.headers, rows: d.rows, showing: d.showing, pager: d.pager, moreActions: d.moreActions, filtersButton: d.filtersButton, nav: d.nav};
            // Filters on a one-section, no-category, no-issue context
            await openFilters();
            o.mgPanelPlain = await readPanel();
            await snap('v04-mg-filters-plain');
            await closeFilters();
            // More Actions
            o.mgMore = await moreActionsItems();
            await snap('v05-mg-more-actions');
            await closeMenu();
            // the sort cycle on "ID", then "Days"
            const ids = async () => (await readDash()).rows.map((r) => (r.cells || [])[0]);
            const sortBtn = (name) => page.getByRole('columnheader', {name: new RegExp(`^${name}`, 'i')}).getByRole('button');
            o.sort = {arrival: await ids()};
            for (const k of ['first', 'second', 'third']) {
                const t0 = mark();
                await sortBtn('ID').click(); await idle(page).catch(() => {}); await sleep(600);
                o.sort[k] = {url: short(page.url()), ids: await ids(), net: net(t0)};
            }
            await go(page.url());
            o.sort.reloadAfterThird = {url: short(page.url()), ids: await ids()};
            await sortBtn('ID').click(); await idle(page).catch(() => {}); await sleep(600);
            o.sort.descAgain = {url: short(page.url()), ids: await ids()};
            await go(page.url());
            o.sort.reloadDesc = {url: short(page.url()), ids: await ids()};
            await snap('v06-mg-sorted-reload');
            await go(dash(P, '?currentViewId=active'));
            o.sortDays = [];
            for (let i = 0; i < 3; i++) { await sortBtn('Days').click(); await idle(page).catch(() => {}); await sleep(500); o.sortDays.push(short(page.url())); }
            // the retired address
            await go(app.url(`/index.php/${P}/submissions`)); await sleep(800);
            o.retired = short(page.url());
            await snap('v07-mg-retired-address');
            // the cells of each row on "Active submissions", the draft's "Complete submission" (A2)
            await go(dash(P, '?currentViewId=active'));
            d = await readDash();
            o.cells = rowsBrief(d);
            const drf = row('Epsilon draft study');
            o.draftButtons = await drf.getByRole('button').allInnerTexts().catch(() => []);
            if (await drf.getByRole('button', {name: 'Complete submission', exact: true}).count()) {
                const t0 = mark();
                await drf.getByRole('button', {name: 'Complete submission', exact: true}).click();
                await page.waitForURL((x) => !/dashboard\/editorial/.test(x.pathname), {timeout: 20_000}).catch(() => {});
                await idle(page).catch(() => {}); await sleep(800);
                o.completeSubmission = {url: short(page.url()), title: await page.title(), h1: flat(await page.locator('h1').first().innerText().catch(() => null), 200), steps: flat(await page.locator('main, #app-main, body').first().innerText().catch(() => null), 500), net: net(t0)};
                await snap('v08-mg-complete-submission', {}, {png: true});
            }
            // "Declined": the declined row
            await go(dash(P, '?currentViewId=declined'));
            d = await snap('v09-mg-declined');
            o.declinedView = {h1: d.h1, rows: rowsBrief(d)};
            // open in place (manager)
            await go(dash(P, '?currentViewId=active'));
            o.mgInPlace = await inPlace('v10-mg-inplace', 'Alpha new study').catch((e) => ({err: flat(e.message, 200)}));
            fact('views.mg', o);

            // ---- Section editor, assistant
            for (const who of ['se', 'as']) {
                const r = {};
                await as(`${C.tag}${who}`, P);
                r.landing = short(page.url());
                d = await snap(`v20-${who}-landing`, {}, {png: true});
                r.nav = navBrief(d);
                r.h1 = d.h1; r.denied = d.denied;
                if (!d.denied && d.h1) {
                    r.views = await walkViews(`v21-${who}`);
                    await go(dash(P, '?currentViewId=active'));
                    d = await snap(`v22-${who}-active`);
                    r.active = {h1: d.h1, rows: rowsBrief(d), moreActions: d.moreActions, filtersButton: d.filtersButton};
                    if (d.filtersButton) { await openFilters(); r.panel = await readPanel(); await snap(`v23-${who}-filters`); await closeFilters(); }
                    r.more = await moreActionsItems(); await closeMenu();
                    for (const vid of ['needs-editor', 'declined']) {
                        await go(dash(P, `?currentViewId=${vid}`));
                        d = await snap(`v24-${who}-typed-${vid}`);
                        r[`typed_${vid}`] = {url: d.url, h1: d.h1, rows: rowsBrief(d)};
                    }
                    await go(dash(P, '?currentViewId=active'));
                    if (await row('Alpha new study').count()) r.inPlace = await inPlace(`v25-${who}-inplace`, 'Alpha new study').catch((e) => ({err: flat(e.message, 200)}));
                }
                fact(`views.${who}`, r);
            }
            // ---- author, reader, reviewer at the address
            for (const who of ['au', 'rd', ...(isOPS ? [] : ['rv'])]) {
                const r = {};
                await as(`${C.tag}${who}`, P);
                r.landing = short(page.url());
                const st = await go(dash(P));
                d = await snap(`v30-${who}-address`, {}, {png: who === 'au'});
                r.address = {status: st, url: d.url, h1: d.h1, denied: d.denied, body: flat(await page.locator('body').innerText().catch(() => null), 300)};
                fact(`views.${who}`, r);
            }
        });

        // ============================================================ scope
        if (on('scope')) await sect('scope', async () => {
            if (!S.B) {
                const C = await mkCtx('b', (t) => [u(t, 'mg', ['manager'], 'Mara', 'Manager'),
                    u(t, 'se', isOPS ? [seRole, 'author'] : [seRole, 'author', 'externalReviewer'], 'Sela', 'Section'), u(t, 'au', ['author'], 'Ada', 'Author')]);
                S.B = C; save();
                const au = `${C.tag}au`, se = {username: `${C.tag}se`, role: seRole};
                await mkSub(C, 'asg', {submitter: au, title: 'Assigned study', participants: [se]});
                await mkSub(C, 'una', {submitter: au, title: 'Unassigned study'});
                await mkSub(C, 'aut', {submitter: `${C.tag}se`, title: 'Authored study'});
                if (!isOPS) await mkSub(C, 'rvw', {submitter: au, title: 'Reviewed study', decisions: [reviewDecision], reviewRounds: [{reviewers: [{username: `${C.tag}se`, status: 'invited'}]}]});
                await mkSub(C, 'dec', {submitter: au, title: 'Declined study', participants: [se], decisions: [declineDecision]});
            }
            const C = S.B, P = C.path;
            fact('scope.seed', {ctx: P, ids: C.ids});
            const o = {};
            await as(`${C.tag}se`, P);
            o.seLanding = short(page.url());
            let d = await snap('s01-se-landing', {}, {png: true});
            o.seNav = navBrief(d);
            o.seNavAll = (d.nav || []).map((n) => n.text);
            o.seViews = await walkViews('s02-se');
            o.seSearch = {};
            for (const ttl of ['Assigned study', 'Unassigned study', 'Authored study', ...(isOPS ? [] : ['Reviewed study']), 'Declined study']) {
                await go(dash(P, '?currentViewId=active'));
                const t0 = mark();
                await commit(sideBox(), ttl);
                d = await snap(`s03-se-global-${ttl.split(' ')[0].toLowerCase()}`);
                o.seSearch[ttl] = {h1: d.h1, url: d.url, rows: rowsBrief(d), net: net(t0)};
            }
            await go(app.url(`/index.php/${P}/en/dashboard/mySubmissions`));
            d = await snap('s04-se-my-submissions', {}, {png: true});
            o.seMySubmissions = {url: d.url, h1: d.h1, rows: rowsBrief(d), nav: (d.nav || []).map((n) => n.text)};
            if (!isOPS) {
                await go(app.url(`/index.php/${P}/en/dashboard/reviewAssignments`));
                d = await snap('s05-se-review-assignments');
                o.seReviewList = {url: d.url, h1: d.h1, rows: rowsBrief(d)};
            }
            // manager
            await as(`${C.tag}mg`, P);
            await go(dash(P, '?currentViewId=active'));
            d = await snap('s10-mg-active');
            o.mgActive = {h1: d.h1, rows: rowsBrief(d)};
            await go(dash(P, '?currentViewId=assigned-to-me'));
            d = await snap('s11-mg-assigned');
            o.mgAssigned = {h1: d.h1, rows: rowsBrief(d)};
            // S4: from "Active submissions", the sidebar box, a filter on the results, the chips
            await go(dash(P, '?currentViewId=active'));
            await commit(sideBox(), 'Declined study');
            d = await snap('s12-mg-global-declined', {}, {png: true});
            o.s4a = {h1: d.h1, url: d.url, rows: rowsBrief(d), chips: d.chips, boxes: d.boxes};
            await openFilters(); o.s4daysNow = await setDays(30); await applyFilters();
            d = await snap('s13-mg-results-filtered');
            o.s4b = {h1: d.h1, url: d.url, rows: rowsBrief(d), chips: d.chips, clearFilters: d.clearFilters};
            await page.locator('#app-main').getByRole('button', {name: 'Clear search phrase'}).first().click(); await idle(page).catch(() => {}); await sleep(600);
            d = await snap('s14-mg-results-phrase-cleared');
            o.s4c = {h1: d.h1, url: d.url, rows: rowsBrief(d), chips: d.chips, boxes: d.boxes};
            await page.locator('#app-main').getByRole('button', {name: 'Clear Filters', exact: true}).first().click(); await idle(page).catch(() => {}); await sleep(800);
            d = await snap('s15-mg-results-filters-cleared', {}, {png: true});
            o.s4d = {h1: d.h1, url: d.url, rows: rowsBrief(d), chips: d.chips, boxes: d.boxes};
            await go(dash(P, '?currentViewId=active'));
            await commit(inPage(), 'Declined study');
            d = await snap('s16-mg-inpage-declined');
            o.s4control = {h1: d.h1, rows: rowsBrief(d), chips: d.chips};
            fact('scope', o);
        });

        // ============================================================ search
        if (on('search')) await sect('search', async () => {
            if (!S.C) {
                const C = await mkCtx('c', (t) => [u(t, 'mg', ['manager'], 'Mara', 'Manager'), u(t, 'au', ['author'], 'Ada', 'Author')]);
                S.C = C; save();
                const au = `${C.tag}au`;
                await mkSub(C, 't', {submitter: au, title: 'Search target'});
                await mkSub(C, 'a', {submitter: au, title: 'Other alpha'});
                await mkSub(C, 'b', {submitter: au, title: 'Other beta'});
                await mkSub(C, 'p', {submitter: au, title: 'Published study', published: true});
            }
            const C = S.C, P = C.path;
            const idList = Object.values(C.ids).filter((x) => /^\d+$/.test(String(x))).join(',');
            const logCount = async () => { try { return await sql(app, `select count(*) from event_log where assoc_id in (${idList})`); } catch (e) { return `err ${flat(e.message, 100)}`; } };
            const since = new Date();
            const o = {logBefore: await logCount()};
            await as(`${C.tag}mg`, P);
            await go(dash(P, '?currentViewId=active'));
            let d = await snap('c01-active');
            o.start = {h1: d.h1, rows: rowsBrief(d), box: d.boxes};
            await commit(inPage(), 'target');
            d = await snap('c02-target', {}, {png: true});
            o.target = {h1: d.h1, url: d.url, rows: rowsBrief(d), chips: d.chips};
            await page.locator('#app-main').getByRole('button', {name: 'Clear search phrase'}).first().click(); await idle(page).catch(() => {}); await sleep(500);
            d = await snap('c03-chip-x');
            o.chipX = {h1: d.h1, url: d.url, chips: d.chips, box: d.boxes.filter((b) => !b.inNav)};
            await commit(inPage(), 'target');
            await openFilters(); await setDays(30); await applyFilters();
            d = await snap('c04-target-days30', {}, {png: true});
            o.withFilter = {h1: d.h1, url: d.url, rows: rowsBrief(d), chips: d.chips, clearFilters: d.clearFilters};
            await openView('Published');
            d = await snap('c05-published');
            o.switched = {h1: d.h1, url: d.url, chips: d.chips, box: d.boxes.filter((b) => !b.inNav)};
            await openView('Active submissions');
            d = await snap('c06-back-active');
            o.back = {h1: d.h1, url: d.url, chips: d.chips};
            await commit(inPage(), 'target');
            await openFilters(); await setDays(30); await applyFilters();
            await page.locator('#app-main').getByRole('button', {name: 'Clear Filters', exact: true}).first().click(); await idle(page).catch(() => {}); await sleep(600);
            d = await snap('c07-chips-clear-filters');
            o.chipsClear = {h1: d.h1, url: d.url, rows: rowsBrief(d), chips: d.chips};
            await go(page.url());
            d = await snap('c07b-chips-clear-filters-reload');
            o.chipsClearReload = {h1: d.h1, url: d.url, chips: d.chips};
            await page.locator('#app-main').getByRole('button', {name: 'Clear search phrase'}).first().click(); await idle(page).catch(() => {}); await sleep(500);
            d = await readDash(); o.afterX = {h1: d.h1, url: d.url};
            // typed, no Enter
            await inPage().click(); await inPage().pressSequentially('target', {delay: 15}); await sleep(800);
            d = await snap('c08-typed-no-enter');
            o.typed = {h1: d.h1, url: d.url, chips: d.chips};
            const dlg0 = dialogs.length;
            await openView('Published');
            d = await snap('c09-typed-then-published');
            o.typedSwitch = {h1: d.h1, url: d.url, chips: d.chips, box: d.boxes.filter((b) => !b.inNav), dialogs: dialogs.slice(dlg0)};
            await inPage().fill(''); await sleep(200);
            await openView('Active submissions');
            await commit(inPage(), 'Published study');
            d = await snap('c10-control-published-study');
            o.control = {h1: d.h1, rows: rowsBrief(d), chips: d.chips};
            await sleep(3000);
            o.logAfter = await logCount();
            o.mail = {mg: await mailCount(`${C.tag}mg@mail.test`, since), au: await mailCount(`${C.tag}au@mail.test`, since)};
            fact('search', o);
        });

        // ============================================================ filters
        if (on('filters')) await sect('filters', async () => {
            if (!S.D) {
                const sec = (abbrev, title, x = {}) => ({abbrev, title, policy: `${title} policy`, ...(isOPS ? {path: abbrev.toLowerCase()} : {}), ...x});
                const extra = {categories: [{path: 'catone', title: 'Cat One'}, {path: 'cattwo', title: 'Cat Two'}]};
                if (isOMP) extra.series = [{path: 'main', title: 'Main'}, {path: 'archive', title: 'Archive', isInactive: true}, {path: 'editorials', title: 'Editorials', editorRestricted: true}];
                else extra.sections = [sec('MAIN', 'Main'), sec('ARC', 'Archive', {isInactive: true}), sec('EDT', 'Editorials', {editorRestricted: true})];
                if (isOJS) extra.issues = [{volume: 7, number: 1, year: 2026}];
                const C = await mkCtx('d', (t) => [u(t, 'mg', ['manager'], 'Mara', 'Manager'), u(t, 'se', [seRole], 'Sela', 'Section'), u(t, 'sx', [seRole], 'Omar', 'Other'),
                    ...(isOPS ? [] : [u(t, 'as', [assistantRole], 'Cora', 'Copy')]), u(t, 'au', ['author'], 'Ada', 'Author')], extra);
                S.D = C; save();
                const au = `${C.tag}au`, se = {username: `${C.tag}se`, role: seRole};
                const where = (k) => (isOMP ? {series: k.toLowerCase() === 'arc' ? 'archive' : 'main'} : {section: k});
                await mkSub(C, 'm1', {submitter: au, title: 'Main one', participants: [se], ...where('MAIN')});
                await mkSub(C, 'a1', {submitter: au, title: 'Archive one', ...where('ARC')});
                await mkSub(C, 'm2', {submitter: au, title: 'Main two', ...where('MAIN')});
            }
            const C = S.D, P = C.path;
            fact('filters.seed', {ctx: P, ids: C.ids});
            const o = {};
            await as(`${C.tag}mg`, P);
            await go(dash(P, '?currentViewId=active'));
            let d = await snap('f01-active');
            o.start = {h1: d.h1, rows: rowsBrief(d)};
            await openFilters();
            o.panel = await readPanel();
            await snap('f02-panel', {}, {png: true});
            const aLabel = isOPS ? 'Assigned to Moderator' : 'Assigned To Editor';
            const box = filtersModal().getByRole('combobox', {name: aLabel});
            o.assignedBox = await box.count();
            if (o.assignedBox) {
                await box.click(); await sleep(1200);
                o.suggestUntyped = await page.locator('[role="listbox"]:visible [role="option"]').allInnerTexts().catch(() => []);
                o.suggestTyped = {};
                for (const q of ['Cor', 'Ada', 'Mar', 'Oma', 'adm']) o.suggestTyped[q] = await pickSuggest(aLabel, q, null).catch((e) => `err ${flat(e.message, 80)}`);
                o.suggestTyped.Sel = await pickSuggest(aLabel, 'Sel', 'Sela');
                await snap('f03-picked');
            }
            await applyFilters();
            d = await snap('f04-applied-editor', {}, {png: true});
            o.editorApplied = {h1: d.h1, url: d.url, rows: rowsBrief(d), chips: d.chips, clearFilters: d.clearFilters};
            await openFilters(); o.daysSet = await setDays(30); await applyFilters();
            d = await snap('f05-editor-plus-days');
            o.editorDays = {h1: d.h1, url: d.url, rows: rowsBrief(d), chips: d.chips};
            const daysChipX = page.getByRole('button', {name: /^Clear filter: Days since last activity/});
            o.daysChipButtons = await daysChipX.count();
            if (o.daysChipButtons) { await daysChipX.first().click(); await idle(page).catch(() => {}); await sleep(600); }
            d = await snap('f06-days-chip-x');
            o.daysX = {h1: d.h1, url: d.url, rows: rowsBrief(d), chips: d.chips};
            await openView('Published');
            d = await snap('f07-switch-published');
            o.switched = {h1: d.h1, url: d.url, chips: d.chips};
            await openView('Active submissions');
            // the panel's own Clear Filters, Close, unapplied changes
            await openFilters();
            if (o.assignedBox) await pickSuggest(aLabel, 'Sel', 'Sela');
            await applyFilters();
            d = await readDash(); o.reapplied = {h1: d.h1, chips: d.chips};
            await openFilters();
            o.reopened = await readPanel();
            await filtersModal().getByRole('button', {name: 'Clear Filters', exact: true}).click(); await sleep(600);
            o.afterPanelClear = {panel: await readPanel(), behindH1: flat(await h1().innerText().catch(() => null)), behindChips: (await readDash()).chips};
            await snap('f08-panel-cleared');
            await closeFilters();
            d = await snap('f09-closed-after-clear');
            o.closedAfterClear = {h1: d.h1, url: d.url, chips: d.chips};
            await openFilters(); o.reopened2 = await readPanel();
            o.unappliedDays = await setDays(30);
            const dl0 = dialogs.length;
            await closeFilters(); await sleep(2000);
            d = await snap('f10-unapplied-closed');
            o.unapplied = {h1: d.h1, url: d.url, chips: d.chips, dialogs: dialogs.slice(dl0)};
            await openFilters(); o.reopened3 = await readPanel();
            await filtersModal().getByRole('button', {name: 'Clear Filters', exact: true}).click(); await sleep(400);
            await applyFilters();
            d = await snap('f11-panel-clear-apply');
            o.clearApply = {h1: d.h1, url: d.url, chips: d.chips, rows: rowsBrief(d)};
            // Section (OJS, OPS): one value, then two values in the field (A11)
            if (!isOMP) {
                await openFilters();
                await filtersModal().getByRole('checkbox', {name: 'Archive', exact: true}).check();
                await applyFilters();
                d = await snap('f12-section-archive', {}, {png: true});
                o.sectionOne = {h1: d.h1, url: d.url, rows: rowsBrief(d), chips: d.chips};
                await openFilters();
                await filtersModal().getByRole('checkbox', {name: 'Main', exact: true}).check();
                await applyFilters();
                d = await snap('f13-section-two-values', {}, {png: true});
                o.sectionTwo = {h1: d.h1, url: d.url, rows: rowsBrief(d), chips: d.chips, chipButtons: await page.getByRole('button', {name: /^Clear filter: /}).evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') || e.innerText))};
                const xArc = page.getByRole('button', {name: /^Clear filter: Section: Archive/});
                if (await xArc.count()) { await xArc.first().click(); await idle(page).catch(() => {}); await sleep(600); }
                d = await snap('f14-section-x-one');
                o.sectionXOne = {h1: d.h1, url: d.url, rows: rowsBrief(d), chips: d.chips};
                await page.locator('#app-main').getByRole('button', {name: 'Clear Filters', exact: true}).first().click().catch(() => {}); await idle(page).catch(() => {}); await sleep(500);
            }
            // Categories: two values
            await openFilters();
            o.catOptions1 = await pickSuggest('Categories', 'Cat', 'Cat One').catch((e) => `err ${flat(e.message, 100)}`);
            o.catOptions2 = await pickSuggest('Categories', 'Cat', 'Cat Two').catch((e) => `err ${flat(e.message, 100)}`);
            o.catPanel = await readPanel();
            await applyFilters();
            d = await snap('f15-categories-two');
            o.categories = {h1: d.h1, url: d.url, rows: rowsBrief(d), chips: d.chips};
            await page.locator('#app-main').getByRole('button', {name: 'Clear Filters', exact: true}).first().click().catch(() => {}); await idle(page).catch(() => {}); await sleep(500);
            if (isOJS) {
                await openFilters();
                o.issueOptions = await pickSuggest('Issues', '2026', 'Vol').catch((e) => `err ${flat(e.message, 100)}`);
                await applyFilters();
                d = await snap('f16-issue');
                o.issue = {h1: d.h1, url: d.url, rows: rowsBrief(d), chips: d.chips};
                await page.locator('#app-main').getByRole('button', {name: 'Clear Filters', exact: true}).first().click().catch(() => {}); await idle(page).catch(() => {}); await sleep(500);
            }
            fact('filters.mg', o);
            for (const who of ['se', ...(isOPS ? [] : ['as'])]) {
                await as(`${C.tag}${who}`, P);
                await go(dash(P, '?currentViewId=active'));
                const r = {h1: (await readDash()).h1};
                await openFilters();
                r.panel = await readPanel();
                await snap(`f20-${who}-panel`);
                await closeFilters();
                fact(`filters.${who}`, r);
            }
        });

        // ============================================================ triage
        if (on('triage')) await sect('triage', async () => {
            if (!S.F) {
                const C = await mkCtx('f', (t) => [u(t, 'mg', ['manager'], 'Mara', 'Manager'), u(t, 'se', [seRole], 'Sela', 'Section'), u(t, 'au', ['author'], 'Ada', 'Author')]);
                S.F = C; save();
                await mkSub(C, 'f1', {submitter: `${C.tag}au`, title: 'Fresh study'});
            }
            const C = S.F, P = C.path;
            const o = {};
            await as(`${C.tag}mg`, P);
            await go(dash(P, '?currentViewId=needs-editor'));
            let d = await snap('t01-needs-editor');
            o.before = {h1: d.h1, rows: rowsBrief(d), nav: navBrief(d)};
            await go(dash(P, '?currentViewId=active'));
            d = await snap('t02-active');
            o.active = {h1: d.h1, rows: rowsBrief(d)};
            const b = row('Fresh study').getByRole('button', {name: 'Assign Editor', exact: true});
            o.assignButton = await b.count();
            if (o.assignButton) {
                await b.click();
                const dlg = page.getByRole('dialog').filter({has: page.locator('select[name="filterUserGroupId"]')});
                await dlg.locator('select[name="filterUserGroupId"]').waitFor({timeout: 20_000});
                await idle(page).catch(() => {});
                o.window = await topDialogText();
                await snap('t03-assign-window', {}, {png: true});
                const opts = await dlg.locator('select[name="filterUserGroupId"] option').allInnerTexts();
                o.groupOptions = opts;
                const lbl = opts.find((x) => /Section editor|Series editor/i.test(x));
                if (lbl) await dlg.locator('select[name="filterUserGroupId"]').selectOption({label: lbl.trim()});
                await idle(page).catch(() => {});
                await dlg.locator('input[id^="namegrid-users-userselect-userselectgrid-"]').fill('Section');
                await dlg.locator('form[id="searchUserFilter-grid-users-userselect-userselectgrid"]').locator('button[id^="submitFormButton-"]').click();
                await idle(page).catch(() => {}); await sleep(600);
                await dlg.getByRole('row').filter({hasText: 'Sela'}).locator('input[name="userId"]').check();
                const t0 = mark();
                await dlg.getByRole('button', {name: 'OK', exact: true}).click();
                await dlg.waitFor({state: 'detached', timeout: 20_000}).catch(() => {});
                await idle(page).catch(() => {}); await sleep(1500);
                d = await snap('t04-after-assign', {}, {png: true});
                o.after = {h1: d.h1, rows: rowsBrief(d), nav: navBrief(d), net: net(t0), notices: d.notices};
                await sleep(5500);
                d = await readDash(); o.after6s = {h1: d.h1, nav: navBrief(d)};
                await openView('Needs editor');
                d = await snap('t05-needs-editor-after');
                o.needsAfter = {h1: d.h1, rows: rowsBrief(d)};
                await openView('All in submission stage');
                d = await snap('t06-submission-stage-after');
                o.stageAfter = {h1: d.h1, rows: rowsBrief(d)};
            }
            fact('triage', o);
        });

        // ============================================================ review (OJS, OMP)
        if (on('review') && !isOPS) await sect('review', async () => {
            if (!S.G) {
                const rv = (t, k, g) => u(t, k, ['externalReviewer'], g, 'Reviewer');
                const C = await mkCtx('g', (t) => [u(t, 'mg', ['manager'], 'Mara', 'Manager'), u(t, 'se', [seRole], 'Sela', 'Section'), u(t, 'sr', [seRole], 'Remy', 'Recommender'),
                    u(t, 'fc', ['funding'], 'Fern', 'Funding'), u(t, 'au', ['author'], 'Ada', 'Author'),
                    rv(t, 'r1', 'Rae'), rv(t, 'r2', 'Ron'), rv(t, 'r3', 'Ria'), rv(t, 'r4', 'Rob'), rv(t, 'r5', 'Rua'), rv(t, 'r6', 'Rik'), rv(t, 'r7', 'Rio')]);
                S.G = C; save();
                const t = C.tag, au = `${t}au`;
                const team = [{username: `${t}se`, role: seRole}, {username: `${t}fc`, role: 'funding'}];
                const R = (k, status) => ({username: `${t}${k}`, status});
                await mkSub(C, 'bare', {submitter: au, title: 'Bare study', decisions: [reviewDecision], reviewRounds: [{reviewers: []}], participants: team});
                await mkSub(C, 'pend', {submitter: au, title: 'Pending study', decisions: [reviewDecision], reviewRounds: [{reviewers: [R('r1', 'invited'), R('r2', 'invited'), R('r3', 'declined')]}], participants: team});
                await mkSub(C, 'revi', {submitter: au, title: 'Revise study', decisions: [reviewDecision, 'requestRevisions'], participants: team});
                await mkSub(C, 'resu', {submitter: au, title: 'Resubmit study', decisions: [reviewDecision, 'resubmit'], participants: team});
                await mkSub(C, 'acc', {submitter: au, title: 'Accepted study', decisions: [reviewDecision], reviewRounds: [{reviewers: [R('r4', 'accepted')]}], participants: team});
                await mkSub(C, 'done', {submitter: au, title: 'Completed study', decisions: [reviewDecision], reviewRounds: [{reviewers: [R('r5', 'completed')]}], participants: team});
                await mkSub(C, 'donly', {submitter: au, title: 'Declinedonly study', decisions: [reviewDecision], reviewRounds: [{reviewers: [R('r6', 'declined')]}], participants: team});
                await mkSub(C, 'canc', {submitter: au, title: 'Cancel study', decisions: [reviewDecision], reviewRounds: [{reviewers: [R('r7', 'accepted')]}], participants: team});
                const recTeam = [{username: `${t}se`, role: seRole}, {username: `${t}sr`, role: seRole, recommendOnly: true}];
                await mkSub(C, 'rec0', {submitter: au, title: 'Recommend bare study', decisions: [reviewDecision], reviewRounds: [{reviewers: []}], participants: recTeam});
                await mkSub(C, 'rec1', {submitter: au, title: 'Recommend pending study', decisions: [reviewDecision], reviewRounds: [{reviewers: [R('r2', 'invited')]}], participants: recTeam});
                await mkSub(C, 'rec2', {submitter: au, title: 'Recommend done study', decisions: [reviewDecision], reviewRounds: [{reviewers: [R('r5', 'completed')]}], participants: recTeam});
            }
            const C = S.G, P = C.path;
            fact('review.seed', {ctx: P, ids: C.ids});
            const titles = ['Bare study', 'Pending study', 'Revise study', 'Resubmit study', 'Accepted study', 'Completed study', 'Declinedonly study', 'Cancel study', 'Recommend bare study', 'Recommend pending study', 'Recommend done study'];
            const readRows = async () => { const out = {}; for (const ti of titles) { const r = row(ti); out[ti] = (await r.count()) ? {cell: flat(await r.locator('td').nth(3).innerText().catch(() => null), 300), all: flat(await r.innerText().catch(() => null), 300), ind: await indicators(ti)} : null; } return out; };
            const o = {};
            await as(`${C.tag}mg`, P);
            await go(dash(P, '?currentViewId=active'));
            let d = await snap('r01-mg-active', {}, {png: true});
            o.mgRows = await readRows();
            o.mgPopovers = {};
            for (const ti of ['Pending study', 'Accepted study', 'Completed study', 'Declinedonly study', 'Cancel study']) o.mgPopovers[ti] = await readAllPopovers(ti);
            await snap('r02-mg-popovers-read');
            // "Assign Reviewers"
            const ar = row('Bare study').getByRole('button', {name: 'Assign Reviewers', exact: true});
            if (await ar.count()) {
                await ar.click(); await sleep(2500); await idle(page).catch(() => {});
                o.assignReviewersWindow = await topDialogText();
                await snap('r03-add-reviewer-window', {}, {png: true});
                await closeTopDialog();
            }
            // popover buttons: each opens its window; closed unsaved, the list refetches
            const pressIn = async (ti, idx, btn, key) => {
                await openPopover(ti, idx);
                const t0 = mark();
                await popPanel(ti).first().getByRole('button', {name: btn, exact: true}).click();
                await sleep(2500); await idle(page).catch(() => {});
                const w = {title: await topDialogText(), names: await page.locator('[role="dialog"]:visible').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') || ''))};
                await snap(`r04-${key}`);
                const t1 = mark();
                await closeTopDialog();
                await closePopover(ti);
                w.netOpen = net(t0).filter((x) => !/\$\$\$call/.test(x)).slice(0, 6);
                w.netClose = net(t1);
                return w;
            };
            const idxOf = async (ti, re) => (await indicators(ti)).findIndex((x) => re.test(x.name));
            o.windows = {};
            let i = await idxOf('Pending study', /Awaiting Response/);
            if (i >= 0) {
                o.windows.viewDetails = await pressIn('Pending study', i, 'View details', 'view-details').catch((e) => `err ${flat(e.message, 100)}`);
                o.windows.unassign = await pressIn('Pending study', i, 'Unassign', 'unassign').catch((e) => `err ${flat(e.message, 100)}`);
                o.windows.editDue = await pressIn('Pending study', i, 'Edit Due Date', 'edit-due').catch((e) => `err ${flat(e.message, 100)}`);
            }
            i = await idxOf('Pending study', /declined/i);
            if (i >= 0) o.windows.resend = await pressIn('Pending study', i, 'Resend Review Request', 'resend').catch((e) => `err ${flat(e.message, 100)}`);
            // due dates through "Edit Due Date": a response due tomorrow, one overdue, a review overdue
            const editDates = async (ti, re, dates, key) => {
                const k = await idxOf(ti, re);
                if (k < 0) return 'no indicator';
                await openPopover(ti, k);
                await popPanel(ti).first().getByRole('button', {name: 'Edit Due Date', exact: true}).click();
                const w = page.getByRole('dialog').filter({has: page.locator('form#editReviewForm')});
                await w.locator('form#editReviewForm').waitFor({timeout: 20_000});
                await idle(page).catch(() => {}); await sleep(800);
                for (const [f, dt] of dates) await pickDate(w, f, dt);
                const t0 = mark();
                await w.getByRole('button', {name: 'OK', exact: true}).click();
                await w.locator('form#editReviewForm').waitFor({state: 'hidden', timeout: 20_000}).catch(() => {});
                await idle(page).catch(() => {}); await sleep(2500);
                await closePopover(ti);
                const after = (await indicators(ti));
                await snap(`r05-${key}`);
                return {net: net(t0).slice(0, 8), notices: (await screen(page)).notices, after, still: await w.locator('form#editReviewForm').isVisible().catch(() => false)};
            };
            o.due = {};
            o.due.tomorrow = await editDates('Pending study', /Awaiting Response/, [['responseDueDate', daysFromNow(1)]], 'due-tomorrow').catch((e) => `err ${flat(e.message, 150)}`);
            o.due.respYesterday = await editDates('Pending study', /Awaiting Response.*Ron|Awaiting Response/, [['responseDueDate', daysFromNow(-1)]], 'due-resp-overdue').catch((e) => `err ${flat(e.message, 150)}`);
            o.due.reviewYesterday = await editDates('Accepted study', /Ongoing/, [['responseDueDate', daysFromNow(-3)], ['reviewDueDate', daysFromNow(-1)]], 'due-review-overdue').catch((e) => `err ${flat(e.message, 150)}`);
            await go(dash(P, '?currentViewId=active'));
            o.afterDue = {pend: await readAllPopovers('Pending study'), acc: await readAllPopovers('Accepted study')};
            d = await snap('r06-after-due-edits', {}, {png: true});
            o.navAfterDue = navBrief(d);
            // the completed review: "View unread recommendation", then reopened
            i = await idxOf('Completed study', /completed/i);
            if (i >= 0) {
                await openPopover('Completed study', i);
                const consider = page.waitForResponse((r) => /\/reviewAssignments\/\d+\/consider$/.test(r.url()) && r.request().method() === 'POST', {timeout: 20_000}).catch(() => null);
                await popPanel('Completed study').first().getByRole('button', {name: 'View unread recommendation', exact: true}).click();
                const cr = await consider;
                await sleep(1000);
                o.readWindow = {title: await topDialogText(), consider: cr ? cr.status() : null};
                await snap('r07-read-review', {}, {png: true});
                await closeTopDialog();
                await closePopover('Completed study');
                o.completedReopened = await openPopover('Completed study', i);
                await closePopover('Completed study');
            }
            // cancel the accepted reviewer of "Cancel study" (A20), then the cancelled popover's "Reinstate Reviewer"
            i = await idxOf('Cancel study', /Ongoing/);
            if (i >= 0) {
                await openPopover('Cancel study', i);
                await popPanel('Cancel study').first().getByRole('button', {name: 'Cancel Reviewer', exact: true}).click();
                const w = page.getByRole('dialog').filter({has: page.locator('form#cancelReviewForm')});
                await w.locator('form#cancelReviewForm').waitFor({timeout: 20_000});
                await idle(page).catch(() => {}); await sleep(2500);
                o.cancelWindow = await topDialogText();
                const t0 = mark();
                await w.locator('form#cancelReviewForm').getByRole('button', {name: 'Cancel Reviewer', exact: true}).click();
                await w.locator('form#cancelReviewForm').waitFor({state: 'hidden', timeout: 20_000}).catch(() => {});
                await idle(page).catch(() => {}); await sleep(2500);
                await closePopover('Cancel study');
                o.cancelled = {net: net(t0).slice(0, 8), cell: flat(await row('Cancel study').locator('td').nth(3).innerText().catch(() => null), 300), pops: await readAllPopovers('Cancel study')};
                await snap('r08-cancelled', {}, {png: true});
                const k = await idxOf('Cancel study', /cancelled/i);
                if (k >= 0) {
                    await openPopover('Cancel study', k);
                    await popPanel('Cancel study').first().getByRole('button', {name: 'Reinstate Reviewer', exact: true}).click();
                    await sleep(2500); await idle(page).catch(() => {});
                    o.reinstateWindow = await topDialogText();
                    await snap('r09-reinstate-window');
                    await closeTopDialog(); await closePopover('Cancel study');
                    o.afterReinstateClose = await indicators('Cancel study');
                }
            }
            // view membership
            o.views = {};
            for (const v of ['Needs reviews', 'Awaiting reviews', 'Reviews submitted', 'Reviews overdue', 'All in review stage']) {
                await openView(v).catch(() => {});
                d = await snap(`r10-view-${v.replace(/\s+/g, '-').toLowerCase()}`);
                o.views[v] = {h1: d.h1, rows: (d.rows || []).map((r) => (r.cells || [])[1])};
            }
            await go(dash(P, '?currentViewId=active'));
            o.mgRowsEnd = await readRows();
            fact('review.mg', o);
            // assigned Section Editor (deciding on the recommend rows), assistant, recommending editor
            for (const who of ['se', 'fc', 'sr']) {
                const r = {};
                await as(`${C.tag}${who}`, P);
                await go(dash(P, '?currentViewId=active'));
                d = await snap(`r20-${who}-active`, {}, {png: true});
                r.h1 = d.h1;
                r.rows = await readRows();
                if (who !== 'sr') {
                    r.pend = await readAllPopovers('Pending study');
                    const k = (await indicators('Accepted study')).findIndex((x) => /Ongoing|overdue/i.test(x.name));
                    if (k >= 0) {
                        await openPopover('Accepted study', k);
                        await popPanel('Accepted study').first().getByRole('button', {name: 'Edit Due Date', exact: true}).click().catch(() => {});
                        await sleep(2500); await idle(page).catch(() => {});
                        r.editDueWindow = await topDialogText();
                        await snap(`r21-${who}-edit-due`);
                        await closeTopDialog(); await closePopover('Accepted study');
                    }
                }
                fact(`review.${who}`, r);
            }
        });

        // ============================================================ conflict
        if (on('conflict')) await sect('conflict', async () => {
            if (!S.H) {
                const C = await mkCtx('h', (t) => [u(t, 'cb', isOPS ? ['manager', 'author'] : ['manager', 'author', 'externalReviewer'], 'Cora', 'Combo'), u(t, 'au', ['author'], 'Ada', 'Author')]);
                S.H = C; save();
                await mkSub(C, 'own', {submitter: `${C.tag}cb`, title: 'Own study'});
                await mkSub(C, 'oth', {submitter: `${C.tag}au`, title: 'Other study'});
                if (!isOPS) await mkSub(C, 'rvw', {submitter: `${C.tag}au`, title: 'Reviewed study', decisions: [reviewDecision], reviewRounds: [{reviewers: [{username: `${C.tag}cb`, status: 'invited'}]}]});
            }
            const C = S.H, P = C.path;
            const o = {};
            await as(`${C.tag}cb`, P);
            o.landing = short(page.url());
            await go(dash(P, '?currentViewId=active'));
            let d = await snap('k01-combo-active', {}, {png: true});
            o.rows = d.rows;
            o.nav = (d.nav || []).map((n) => n.text);
            await go(dash(P, '?currentViewId=needs-editor'));
            d = await snap('k02-combo-needs-editor');
            o.needsEditor = {h1: d.h1, rows: d.rows};
            await go(app.url(`/index.php/${P}/en/dashboard/mySubmissions`));
            d = await snap('k03-combo-my-submissions');
            o.mySubmissions = {url: d.url, h1: d.h1, rows: rowsBrief(d)};
            // Fields: the panel follows the account's roles, not the dashboard page it opens from
            if (d.filtersButton) { await openFilters(); o.mySubmissionsPanel = await readPanel(); await snap('k04-combo-my-submissions-filters'); await closeFilters(); }
            await go(dash(P, '?currentViewId=active'));
            await openFilters(); o.editorialPanel = await readPanel(); await closeFilters();
            fact('conflict', o);
        });

        // ============================================================ declined
        if (on('declined')) await sect('declined', async () => {
            if (!S.I) {
                const C = await mkCtx('i', (t) => [u(t, 'mg', ['manager'], 'Mara', 'Manager'), u(t, 'se', [seRole], 'Sela', 'Section'), u(t, 'au', ['author'], 'Ada', 'Author')]);
                S.I = C; save();
                const se = {username: `${C.tag}se`, role: seRole};
                await mkSub(C, 'd', {submitter: `${C.tag}au`, title: 'Declined study', participants: [se]});
                await mkSub(C, 'l', {submitter: `${C.tag}au`, title: 'Live study', participants: [se]});
            }
            const C = S.I, P = C.path;
            const o = {};
            await as(`${C.tag}mg`, P);
            await go(dash(P, '?currentViewId=active'));
            let d = await snap('d01-active');
            o.before = {h1: d.h1, nav: navBrief(d)};
            await row('Declined study').getByRole('button', {name: 'View', exact: true}).click();
            await workflowHeading().waitFor({timeout: 20_000}).catch(() => {}); await idle(page).catch(() => {}); await sleep(1500);
            const wf = page.getByRole('dialog').filter({has: workflowHeading()});
            o.workflowButtons = await wf.getByRole('button').allInnerTexts().then((a) => a.map((x) => flat(x, 60)).filter(Boolean).slice(0, 40)).catch(() => []);
            await wf.getByRole('button', {name: 'Decline Submission', exact: true}).first().click();
            await page.getByRole('heading', {level: 1, name: /^Decline Submission/}).waitFor({timeout: 20_000}).catch(() => {});
            await snap('d02-decline-wizard');
            if (isOMP) {
                const {walkDecisionWizard} = require(appPages(app, 'ReviewStagePages.js'));
                await walkDecisionWizard(page);
                await page.getByRole('link', {name: /^View Submission/}).first().click();
            } else {
                const {DecisionPage} = require(appPages(app, isOJS ? 'ReviewStagePages.js' : 'DecisionPage.js'));
                await new DecisionPage(page).completeAll();
            }
            await page.waitForURL((x) => !!x.searchParams.get('workflowSubmissionId'), {timeout: 30_000}).catch(() => {});
            await idle(page).catch(() => {}); await sleep(1500);
            o.afterDecision = {url: short(page.url()), workflow: await workflowHeading().count(), dialog: await topDialogText()};
            let t0 = mark();
            await closeWorkflow();
            const tl = [];
            for (let k = 0; k < 8; k++) { const x = await readDash(); tl.push({ms: Date.now() - t0, h1: x.h1, nav: navBrief(x).filter((n) => /Declined|Active/.test(n))}); await sleep(1000); }
            o.afterClose = {timeline: tl, net: net(t0)};
            await snap('d03-after-close');
            await openView('Declined');
            d = await snap('d04-declined-view', {}, {png: true});
            o.declinedView = {h1: d.h1, rows: rowsBrief(d)};
            // Section editor
            await as(`${C.tag}se`, P);
            d = await snap('d05-se-landing');
            o.seNav = (d.nav || []).map((n) => n.text);
            o.seViews = await walkViews('d06-se');
            await go(dash(P, '?currentViewId=active'));
            await commit(sideBox(), 'Declined study');
            d = await snap('d07-se-global');
            o.seGlobal = {h1: d.h1, rows: rowsBrief(d)};
            // delete inside the panel
            await as(`${C.tag}mg`, P);
            await go(dash(P, '?currentViewId=declined'));
            d = await readDash(); o.beforeDelete = {h1: d.h1, nav: navBrief(d)};
            await row('Declined study').getByRole('button', {name: 'View', exact: true}).click();
            await workflowHeading().waitFor({timeout: 20_000}).catch(() => {}); await idle(page).catch(() => {}); await sleep(1500);
            const {WorkflowPage} = require(sharedPages('WorkflowPage.js'));
            const w = new WorkflowPage(page, P, isOPS ? {labels: {publicationGroup: 'Preprint'}} : {});
            // a declined preprint's panel opens on its "Preprint" pages: the stage is selected first (the OPS suite's S11)
            if (isOPS) await w.selectStage('Production');
            t0 = mark();
            await w.deleteSubmission({confirm: true});
            const tl2 = [];
            for (let k = 0; k < 9; k++) { const x = await readDash(); tl2.push({ms: Date.now() - t0, h1: x.h1, rows: x.rows.length, nav: navBrief(x).filter((n) => /Declined/.test(n)), workflow: await workflowHeading().count()}); await sleep(1000); }
            o.afterDelete = {timeline: tl2, net: net(t0)};
            await snap('d08-after-delete', {}, {png: true});
            fact('declined', o);
        });

        // ============================================================ bulk
        if (on('bulk')) await sect('bulk', async () => {
            if (!S.J) {
                const C = await mkCtx('j', (t) => [u(t, 'mg', ['manager'], 'Mara', 'Manager'), u(t, 'se', [seRole], 'Sela', 'Section'),
                    ...(isOPS ? [] : [u(t, 'as', [assistantRole], 'Asta', 'Assistant')]), u(t, 'a1', ['author'], 'Ada', 'Author'), u(t, 'a2', ['author'], 'Bo', 'Writer')]);
                S.J = C; save();
                await mkSub(C, 'd1', {submitter: `${C.tag}a1`, title: 'Draft one', submitted: false});
                await mkSub(C, 'd2', {submitter: `${C.tag}a2`, title: 'Draft two', submitted: false});
                await mkSub(C, 's1', {submitter: `${C.tag}a1`, title: 'Submitted one', participants: [{username: `${C.tag}se`, role: seRole}, ...(isOPS ? [] : [{username: `${C.tag}as`, role: assistantRole}])]});
            }
            const C = S.J, P = C.path;
            const since = new Date();
            const o = {};
            await as(`${C.tag}mg`, P);
            await go(dash(P, '?currentViewId=active'));
            let d = await snap('b01-active', {}, {png: true});
            o.start = {h1: d.h1, rows: rowsBrief(d), nav: navBrief(d)};
            const enter = async () => {
                const m = await moreActionsItems();
                await page.getByRole('menuitem', {name: 'Delete Incomplete Submissions'}).click();
                await sleep(600);
                return m;
            };
            const delBtn = () => page.locator('#app-main').getByRole('button', {name: 'Delete Incomplete Submissions', exact: true});
            const cancelAbove = () => page.locator('#app-main').getByRole('button', {name: 'Cancel', exact: true});
            // the row's box is visually hidden (sr-only): checked as MySubmissionsPage.checkRowCheckbox does
            const tick = async (ti) => { await row(ti).getByRole('checkbox').check({force: true}); await sleep(300); };
            o.menu = await enter();
            d = await snap('b02-selection', {}, {png: true});
            o.selection = {rows: d.rows.map((r) => ({c: (r.cells || []).slice(0, 2).join(' | '), cb: r.checkbox})), delDisabled: await delBtn().isDisabled().catch(() => null), cancel: await cancelAbove().count()};
            await tick('Draft one');
            o.delEnabledAfterTick = await delBtn().isEnabled().catch(() => null);
            await cancelAbove().click(); await sleep(600);
            d = await snap('b03-cancel-above');
            o.cancelAbove = {rows: d.rows.map((r) => ({c: (r.cells || []).slice(0, 2).join(' | '), cb: r.checkbox})), h1: d.h1};
            await enter(); await tick('Draft one');
            await delBtn().click(); await sleep(800);
            o.confirmDialog = await topDialogText();
            await snap('b04-confirm-dialog', {}, {png: true});
            await page.locator('[role="dialog"]:visible').last().getByRole('button', {name: 'Cancel', exact: true}).click(); await sleep(800);
            d = await snap('b05-dialog-cancel');
            o.dialogCancel = {rows: d.rows.map((r) => ({c: (r.cells || []).slice(0, 2).join(' | '), cb: r.checkbox})), h1: d.h1, delButton: await delBtn().count()};
            await enter(); await tick('Draft one');
            await openView('Published'); await openView('Active submissions');
            d = await snap('b06-view-switch');
            o.viewSwitch = {rows: d.rows.map((r) => ({c: (r.cells || []).slice(0, 2).join(' | '), cb: r.checkbox})), h1: d.h1, delButton: await delBtn().count()};
            await enter(); await tick('Draft one');
            await commit(inPage(), 'Draft');
            d = await snap('b07-search-change');
            o.searchChange = {rows: d.rows.map((r) => ({c: (r.cells || []).slice(0, 2).join(' | '), cb: r.checkbox})), h1: d.h1, delButton: await delBtn().count()};
            await go(dash(P, '?currentViewId=active'));
            await enter(); await tick('Draft one'); await tick('Draft two');
            await delBtn().click(); await sleep(800);
            const t0 = mark();
            await page.locator('[role="dialog"]:visible').last().getByRole('button', {name: 'Confirm', exact: true}).click();
            const tl = [];
            for (let k = 0; k < 7; k++) { await sleep(900); const x = await readDash(); tl.push({ms: Date.now() - t0, h1: x.h1, rows: rowsBrief(x), nav: navBrief(x).filter((n) => /Active|Needs|submission stage|production/.test(n))}); }
            o.deleted = {timeline: tl, net: net(t0), notices: (await screen(page)).notices};
            await snap('b08-after-confirm', {}, {png: true});
            o.menuAfter = await moreActionsItems(); await snap('b09-more-after'); await closeMenu();
            fact('bulk.mg', o);
            const r = {};
            await as(`${C.tag}a2`, P);
            await go(app.url(`/index.php/${P}/en/dashboard/mySubmissions`));
            d = await snap('b10-author2-my-submissions');
            r.a2 = {h1: d.h1, rows: rowsBrief(d), nav: (d.nav || []).map((n) => n.text)};
            for (const who of ['se', ...(isOPS ? [] : ['as'])]) {
                await as(`${C.tag}${who}`, P);
                await go(dash(P, '?currentViewId=active'));
                d = await snap(`b11-${who}-active`);
                r[who] = {h1: d.h1, moreActions: d.moreActions, filtersButton: d.filtersButton, rows: rowsBrief(d)};
            }
            await sleep(4000);
            r.mail = {a1: await mailCount(`${C.tag}a1@mail.test`, since), a2: await mailCount(`${C.tag}a2@mail.test`, since)};
            fact('bulk.others', r);
        });

        // ============================================================ issue (OJS)
        if (on('issue') && isOJS) await sect('issue', async () => {
            if (!S.K) {
                const C = await mkCtx('k', (t) => [u(t, 'mg', ['manager'], 'Mara', 'Manager'), u(t, 'se', [seRole], 'Sela', 'Section'), u(t, 'au', ['author'], 'Ada', 'Author')], {issues: [{volume: 9, number: 2, year: 2026}]});
                S.K = C; save();
                // a seeded scheduled article is stored at the Submission stage unless it is first sent to production
                // (the suite's S13 seed); the two stored at the Submission stage are the controls
                const iss = {published: true, issue: {volume: 9, number: 2, year: 2026}};
                await mkSub(C, 'sch', {submitter: `${C.tag}au`, title: 'Scheduled study', ...iss, decisions: ['skipExternalReview', 'sendToProduction']});
                await mkSub(C, 'ssn', {submitter: `${C.tag}au`, title: 'Scheduled noeditor study', ...iss});
                await mkSub(C, 'sce', {submitter: `${C.tag}au`, title: 'Scheduled edited study', ...iss, participants: [{username: `${C.tag}se`, role: seRole}]});
                await mkSub(C, 'act', {submitter: `${C.tag}au`, title: 'Active study'});
            }
            const C = S.K, P = C.path;
            const o = {};
            await as(`${C.tag}mg`, P);
            await go(dash(P, '?currentViewId=scheduled'));
            let d = await snap('i01-scheduled', {}, {png: true});
            o.scheduled = {h1: d.h1, url: d.url, rows: rowsBrief(d), nav: navBrief(d)};
            await openView('Active submissions');
            d = await snap('i02-active');
            o.active = {h1: d.h1, rows: rowsBrief(d)};
            await openFilters(); o.issueOptions = await pickSuggest('Issues', '2026', 'Vol'); await applyFilters();
            d = await snap('i03-active-issue', {}, {png: true});
            o.activeIssue = {h1: d.h1, url: d.url, rows: rowsBrief(d), chips: d.chips};
            await openView('Scheduled for publication');
            await openFilters(); await pickSuggest('Issues', '2026', 'Vol'); await applyFilters();
            d = await snap('i04-scheduled-issue');
            o.scheduledIssue = {h1: d.h1, url: d.url, rows: rowsBrief(d), chips: d.chips};
            await openView('Active submissions');
            await openFilters(); await pickSuggest('Issues', '2026', 'Vol'); await applyFilters();
            await page.locator('#app-main').getByRole('button', {name: 'Clear Filters', exact: true}).first().click(); await idle(page).catch(() => {}); await sleep(600);
            d = await snap('i05-active-cleared');
            o.cleared = {h1: d.h1, rows: rowsBrief(d), chips: d.chips};
            fact('issue', o);
        });

        // ============================================================ revdecline (OJS, OMP): Rule 9b's stage name of a review-stage decline
        if (on('revdecline') && !isOPS) await sect('revdecline', async () => {
            if (!S.RD) {
                const C = await mkCtx('rd', (t) => [u(t, 'mg', ['manager'], 'Mara', 'Manager'), u(t, 'au', ['author'], 'Ada', 'Author')]);
                S.RD = C; save();
                await mkSub(C, 'rd', {submitter: `${C.tag}au`, title: 'Review declined study', decisions: [reviewDecision, 'decline']});
                if (isOMP) await mkSub(C, 'ri', {submitter: `${C.tag}au`, title: 'Internal declined study', decisions: ['sendInternalReview', 'decline']});
            }
            const C = S.RD, P = C.path;
            await as(`${C.tag}mg`, P);
            await go(dash(P, '?currentViewId=declined'));
            const d = await snap('q01-declined-review-stage');
            fact('revdecline', {seed: C.ids, h1: d.h1, rows: rowsBrief(d)});
        });

        // ============================================================ spinner: Rule 5's heading spinner, read while the browser's own list
        // request is held back for three seconds (page.route delays it; no request is made up)
        if (on('spinner')) await sect('spinner', async () => {
            if (!S.SP) {
                const C = await mkCtx('sp', (t) => [u(t, 'mg', ['manager'], 'Mara', 'Manager'), u(t, 'au', ['author'], 'Ada', 'Author')]);
                S.SP = C; save();
                await mkSub(C, 's', {submitter: `${C.tag}au`, title: 'Spinner study'});
            }
            const C = S.SP, P = C.path;
            await as(`${C.tag}mg`, P);
            await go(dash(P, '?currentViewId=active'));
            const spin = () => page.evaluate(() => { const h = document.querySelector('#app-main h1'); const sp = h && h.querySelector('.ms-3 > *');
                return {heading: h ? h.innerText.trim() : null, spinner: sp ? {cls: sp.className, invisible: sp.classList.contains('invisible'), label: sp.getAttribute('aria-label') || sp.innerText} : null}; });
            const o = {settled: await spin()};
            await page.route(/\/_submissions\?/, async (route) => { await sleep(3000); await route.continue(); });
            await navLink('Published').click();
            await sleep(1200);
            o.during = await spin();
            await snap('y01-during-load', {}, {png: true});
            await sleep(3500); await idle(page).catch(() => {});
            o.after = await spin();
            await page.unroute(/\/_submissions\?/);
            fact('spinner', o);
        });

        // ============================================================ omprev (OMP)
        if (on('omprev') && isOMP) await sect('omprev', async () => {
            if (!S.L) {
                const C = await mkCtx('l', (t) => [u(t, 'mg', ['manager'], 'Mara', 'Manager'), u(t, 'au', ['author'], 'Ada', 'Author')]);
                S.L = C; save();
                await mkSub(C, 'int', {submitter: `${C.tag}au`, title: 'Internal study', decisions: ['sendInternalReview'], reviewRounds: [{reviewers: []}]});
                await mkSub(C, 'ext', {submitter: `${C.tag}au`, title: 'External study', decisions: ['skipInternalReview'], reviewRounds: [{reviewers: []}]});
            }
            const C = S.L, P = C.path;
            await as(`${C.tag}mg`, P);
            await go(dash(P, '?currentViewId=active'));
            let d = await snap('o01-active');
            const o = {active: rowsBrief(d), nav: (d.nav || []).map((n) => n.text)};
            await openView('All in review stage');
            d = await snap('o02-all-review', {}, {png: true});
            o.allReview = {h1: d.h1, url: d.url, rows: rowsBrief(d)};
            fact('omprev', o);
        });

        // ============================================================ refused (publicknowledge, read only)
        if (on('refused')) await sect('refused', async () => {
            const o = {};
            for (const user of ['author.alex', 'reader.rosa', ...(isOPS ? [] : ['reviewer.julia']), 'manager.maya']) {
                await as(user, app.contextPath);
                const landing = short(page.url());
                const st = await go(dash(app.contextPath));
                const d = await snap(`x01-${user.replace('.', '-')}`, {}, {png: user === 'author.alex'});
                o[user] = {landing, status: st, url: d.url, h1: d.h1, denied: d.denied, body: d.h1 ? null : flat(await page.locator('body').innerText().catch(() => null), 250)};
            }
            fact('refused', o);
        });

        // ============================================================ minimum (OJS, OMP)
        if (on('minimum') && !isOPS) await sect('minimum', async () => {
            for (const key of ['M0', 'M1']) {
                if (!S[key]) {
                    const C = await mkCtx(key.toLowerCase(), (t) => [u(t, 'mg', ['manager'], 'Mara', 'Manager'), u(t, 'au', ['author'], 'Ada', 'Author'), u(t, 'rv', ['externalReviewer'], 'Rex', 'Reviewer')],
                        key === 'M1' ? {review: {numReviewsPerSubmission: 1}} : {});
                    S[key] = C; save();
                    await mkSub(C, 'm', {submitter: `${C.tag}au`, title: 'Minimum study', decisions: [reviewDecision], reviewRounds: [{reviewers: [{username: `${C.tag}rv`, status: 'completed'}]}]});
                }
                const C = S[key], P = C.path;
                const o = {};
                await as(`${C.tag}mg`, P);
                await go(dash(P, '?currentViewId=active'));
                let d = await snap(`n01-${key}-before`);
                o.before = {cell: flat(await row('Minimum study').locator('td').nth(3).innerText().catch(() => null), 300), ind: await readAllPopovers('Minimum study'), nav: navBrief(d)};
                for (const v of ['Reviews submitted', 'Needs reviews']) { await openView(v); d = await readDash(); o[`before ${v}`] = {h1: d.h1, rows: rowsBrief(d)}; }
                await go(dash(P, '?currentViewId=active'));
                await openPopover('Minimum study', 0);
                await popPanel('Minimum study').first().getByRole('button', {name: 'View unread recommendation', exact: true}).click();
                const modal = page.getByRole('dialog', {name: /^Review Details:/});
                await modal.waitFor({timeout: 20_000});
                await modal.getByRole('button', {name: 'Modify Review', exact: true}).waitFor({timeout: 20_000}).catch(() => {});
                await sleep(1500);
                o.window = await topDialogText();
                await modal.getByRole('button', {name: 'Mark as Complete', exact: true}).click();
                const cd = page.locator('[data-cy="dialog"]').filter({hasText: 'Mark this review as complete?'});
                await cd.waitFor({timeout: 15_000});
                await cd.getByRole('button', {name: 'Mark as Complete', exact: true}).click();
                await page.getByText('The review has been marked as complete.').first().waitFor({timeout: 20_000}).catch(() => {});
                await sleep(1500);
                o.afterMark = {windowOpen: await modal.isVisible().catch(() => false)};
                if (o.afterMark.windowOpen) await closeTopDialog();
                await idle(page).catch(() => {}); await sleep(1500);
                await closePopover('Minimum study');
                d = await snap(`n02-${key}-after`, {}, {png: true});
                o.after = {cell: flat(await row('Minimum study').locator('td').nth(3).innerText().catch(() => null), 300), ind: await readAllPopovers('Minimum study')};
                for (const v of ['Reviews submitted', 'Needs reviews']) { await openView(v); d = await readDash(); o[`after ${v}`] = {h1: d.h1, rows: rowsBrief(d)}; }
                fact(`minimum.${key}`, o);
            }
        });

        // ============================================================ profile (A8)
        if (on('profile')) await sect('profile', async () => {
            const C = S.A || S.F || S.I;
            if (!C) return fact('profile', 'no context: run views first');
            const o = {};
            for (const who of ['mg', 'se']) {
                await as(`${C.tag}${who}`, C.path);
                await go(app.url(`/index.php/${C.path}/en/user/profile`));
                const tab = page.getByRole('tab', {name: /Notifications/}).or(page.getByRole('link', {name: /^Notifications$/})).first();
                if (await tab.count()) { await tab.click(); await sleep(1500); await idle(page).catch(() => {}); }
                const txt = await page.locator('body').innerText().catch(() => '');
                o[who] = {url: short(page.url()), outstanding: (txt.match(/[^\n]*outstanding[^\n]*/gi) || []).slice(0, 5), editorsGroup: flat((txt.split(/\n/).findIndex((l) => /^Editors?$/i.test(l.trim())) >= 0 ? txt : ''), 0)};
                await snap(`p01-${who}-profile-notifications`, {}, {png: who === 'mg'});
            }
            fact('profile', o);
        });

        // ============================================================ admin (A9 Author / Reviewer only, A3 the administrator's own row)
        if (on('admin')) await sect('admin', async () => {
            const legs = [['PA', 'author'], ...(isOPS ? [] : [['PR', 'externalReviewer']])];
            for (const [key, role] of legs) {
                if (!S[key]) {
                    const C = await mkCtx(key.toLowerCase(), (t) => [u(t, 'mg', ['manager'], 'Mara', 'Manager'), u(t, 'au', ['author'], 'Ada', 'Author'), {username: 'admin', roles: [role]}]);
                    S[key] = C; save();
                    if (role === 'author') await mkSub(C, 'own', {submitter: 'admin', title: 'Admin own study'});
                    else await mkSub(C, 'own', {submitter: `${C.tag}au`, title: 'Admin reviews study', decisions: [reviewDecision], reviewRounds: [{reviewers: [{username: 'admin', status: 'invited'}]}]});
                    await mkSub(C, 'oth', {submitter: `${C.tag}au`, title: 'Plain study'});
                }
                const C = S[key], P = C.path;
                const o = {role};
                await as('admin', P);
                await go(dash(P, '?currentViewId=active'));
                let d = await snap(`a01-${key}-admin-manager`, {}, {png: true});
                o.asManager = {h1: d.h1, rows: d.rows, nav: (d.nav || []).map((n) => n.text)};
                // end the manager role on the administrator's own edit page (I28's route)
                await go(app.url(`/index.php/${P}/en/management/settings/access`));
                const table = page.locator('table').filter({hasText: /\badmin\b/}).first();
                await table.waitFor({state: 'visible', timeout: 20_000}).catch(() => {});
                const adminRow = table.locator('tr').filter({hasText: /\badmin\b/}).first();
                await adminRow.locator('button').last().click().catch(() => {}); await idle(page).catch(() => {});
                await page.getByRole('menuitem', {name: /^Edit$/}).first().click().catch(() => {});
                await page.waitForURL(/management\/settings\/user\/\d+/, {timeout: 20_000}).catch(() => {});
                await idle(page).catch(() => {});
                await page.getByRole('button', {name: /Remove Role/i}).first().waitFor({state: 'visible', timeout: 15_000}).catch(() => {});
                o.rolesBefore = await page.locator('tr').filter({has: page.getByRole('button', {name: /Remove Role/i})}).evaluateAll((els) => els.map((e) => e.innerText.replace(/\s+/g, ' ').trim())).catch(() => []);
                const roleRow = page.locator('tr').filter({hasText: /manager/i}).filter({has: page.getByRole('button', {name: /Remove Role/i})}).first();
                if (await roleRow.count()) {
                    await roleRow.getByRole('button', {name: /Remove Role/i}).click(); await idle(page).catch(() => {});
                    const dlg = page.locator('[role="dialog"]:visible').filter({hasText: /Remove Role/i}).last();
                    await dlg.waitFor({state: 'visible', timeout: 15_000}).catch(() => {});
                    await dlg.getByRole('button', {name: /^Remove Role$/i}).click().catch(() => {});
                    await idle(page).catch(() => {}); await sleep(1200);
                }
                o.rolesAfter = await page.locator('tr').filter({has: page.getByRole('button', {name: /Remove Role/i})}).evaluateAll((els) => els.map((e) => e.innerText.replace(/\s+/g, ' ').trim())).catch(() => []);
                await signOut(page).catch(() => {});
                await as('admin', P);
                o.freshLanding = short(page.url());
                const t0 = mark();
                const st = await go(dash(P)); await sleep(5000);
                d = await snap(`a02-${key}-admin-${role}-only`, {}, {png: true});
                o.fresh = {status: st, h1: d.h1, url: d.url, rows: rowsBrief(d), nav: (d.nav || []).map((n) => n.text), dialogs: d.dialogs, dialogText: await topDialogText(), moreActions: d.moreActions, filtersButton: d.filtersButton, denied: d.denied, net: net(t0)};
                fact(`admin.${key}`, o);
            }
        });
    } finally {
        fact('end', {snapshots: snapN, crashes: traffic.filter((x) => x.s >= 500), pageErrors: errors.filter((e) => !e.console).map((e) => e.msg), consoleErrors: errors.filter((e) => e.console).map((e) => e.msg).slice(0, 20), dialogs});
        await close();
    }
});
