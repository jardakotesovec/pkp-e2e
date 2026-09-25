// U53 claim check, chunk K3: the Site Administrator's older grid
// (Administration › Hosted Journals › "Settings wizard" › "Users"): "Add User" and
// "Edit User" fields, Rules 19–24, their Side effects, Settings that modify
// behavior, Cross-feature interactions, the Canonical preamble; all three apps.
// Spec: docs/specs/U53-users-management.md — body 88–107, 251–295, 322–423;
// footnotes k, l, m, r, s, t, td11, td12, td15.
//
// Seeds per app (tag prefix u53k3): context C (en + fr_CA, forms en + fr_CA, a
// principal contact of its own) with throwaway users: mgr (manager), se
// (sectionEditor), au (author), rd (reader), x (author: Edit User roles and password),
// rv (externalReviewer, OJS/OMP), dz (author, seeded disabled), em (author: Email),
// ds (author: Disable/Enable), cm (author: published submission with an approved
// comment; Remove), mg1 / mg2 (merge source / target), lg (manager: Login As),
// sb (author: a submission in review, OJS/OMP, for the reviewer search).
// Context P: 27 authors (paging).
// Phases (PHASES=a,b to narrow; state in k3-state-<app>.json, RESEED=1 to reseed):
//   nav     the path to the grid, its heading, form, columns, "Add User", paging (C and P)
//   access  the wizard address typed by one account per level (exclusivity)
//   add1    "Add User" step 1: fields, defaults, refusals, "Suggest", More User Details,
//           leaving with unsaved text
//   td12    step 2 refused with no role, closed without saving; the no-role account;
//           the same username again
//   add2    Notify ticked, typed password, Change Password left ticked; mail; first sign-in
//   add3    Generate Password, Change Password unticked; mail; sign-in with the mailed password
//   add4    neither: no mail
//   edit    Edit User: fields, roles tick/untick, refusal with none, new password ends
//           sessions, own row (look only), reviewer masthead box, leaving unsaved
//   rows    the row actions on each kind of row (own, throwaway, disabled, no role)
//   acts    Email, Disable User, Enable, Remove, Merge User from the grid
//   impers  "Login As" from the grid, then the wizard address while impersonating
//   site    "Bulk Emails" both ends; "Minimum password length" 6 and 8 (restored)
//   xfeat   Users & Roles tabs, Invitations, "Edit" roles page, French session,
//           reviewer search, Statistics › Users, the "User Created" template
//   bulkread which journals Site Settings › "Bulk Emails" has ticked (read only)
// Run: PROBE_FEATURE=U53 PROBE_AGENT=ccK3 node bin/probe.js all shared/playwright/checks/U53/K3/k3.js
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, signOut, screen, shot, record, loc, note, idle, settled, tag, outDir} =
    require('../../../probe');

const ALL = ['nav', 'access', 'add1', 'td12', 'add2', 'add3', 'add4', 'edit', 'rows', 'acts', 'impers', 'site', 'xfeat', 'bulkread'];
const PHASES = process.env.PHASES ? process.env.PHASES.split(',') : ALL;
const on = (p) => PHASES.includes(p);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const T = 20_000;
const flat = (s, n = 4000) => (s || '').replace(/\s+/g, ' ').trim().slice(0, n);
const stateFile = (app) => path.join(outDir(), `k3-state-${app.name}.json`);
const log = (...a) => console.log('[k3]', new Date().toISOString().slice(11, 19), ...a);
const mail = (u) => `${u}@mail.test`;

let CUR = 'init';
const CRASH = {};
const DIALOGS = [];
function watch(page) {
    page.on('response', (r) => { if (r.status() >= 500) (CRASH[CUR] = CRASH[CUR] || []).push(`server ${r.status()} ${r.request().method()} ${r.url().replace(/^https?:\/\/[^/]+/, '').slice(0, 200)}`); });
    page.on('pageerror', (e) => { (CRASH[CUR] = CRASH[CUR] || []).push(`script ${String(e.message || e).slice(0, 200)}`); });
    page.on('dialog', (d) => { DIALOGS.push({phase: CUR, type: d.type(), message: d.message()}); d.type() === 'beforeunload' ? d.accept().catch(() => {}) : d.dismiss().catch(() => {}); });
    return page;
}
async function snap(page, name, extra = {}) {
    let s;
    try { s = await screen(page); } catch (e) { s = {url: page.url(), error: String(e.message).slice(0, 300)}; }
    Object.assign(s, extra);
    record(name, s);
    await shot(page, name).catch(() => {});
    return s;
}
async function notices(page) {
    return (await page.locator('.pkp_notification:visible, .ui-pnotify:visible, [role="alert"]:visible, [role="status"]:visible, [class*="pnotify"]:visible, .pkpNotification:visible')
        .allInnerTexts().catch(() => [])).map((x) => flat(x, 300)).filter(Boolean);
}

// ── the wizard and its grid ─────────────────────────────────────────────────
async function openWizardUsers(page, app, ctxId) {
    await page.goto(app.url(`/index.php/index/en/admin/wizard/${ctxId}`));
    await idle(page);
    const tab = page.getByRole('tab', {name: 'Users', exact: true}).first();
    await tab.waitFor({timeout: T});
    await tab.click();
    const panel = gridPanel(page);
    await panel.locator('tr.gridRow').first().waitFor({timeout: T});
    await idle(page); await sleep(400);
    return panel;
}
function gridPanel(page) { return page.locator('[role="tabpanel"]:visible').filter({has: page.locator('.pkp_controllers_grid')}).last(); }
async function gridRows(scope) {
    return scope.locator('tr.gridRow').evaluateAll((rows) => rows.filter((r) => r.offsetParent !== null).map((r) => ({
        cells: [...r.querySelectorAll('td')].map((td) => td.innerText.replace(/\s+/g, ' ').trim()),
        arrow: r.querySelector('a.show_extras') ? {text: r.querySelector('a.show_extras').innerText.trim(), title: r.querySelector('a.show_extras').getAttribute('title'), aria: r.querySelector('a.show_extras').getAttribute('aria-label')} : null,
    })));
}
async function gridFacts(scope) {
    return scope.evaluate((p) => {
        const txt = (e) => (e ? e.innerText.replace(/\s+/g, ' ').trim() : null);
        const grid = p.querySelector('.pkp_controllers_grid') || p;
        const order = [...grid.querySelectorAll('h4, .header, a, table, .gridPaging, .pkp_linkActions, .pkp_controller_grid_paging, [class*="paging"]')]
            .filter((e) => e.offsetParent !== null).map((e) => `${e.tagName.toLowerCase()}.${(e.className || '').toString().split(' ')[0]}:${txt(e).slice(0, 60)}`);
        return {
            title: [...grid.querySelectorAll('.header h4, h4')].map(txt),
            headerLinks: [...grid.querySelectorAll('.header a, .actions a')].filter((e) => e.offsetParent !== null).map(txt),
            columns: [...grid.querySelectorAll('th')].filter((e) => e.offsetParent !== null).map(txt),
            paging: [...grid.querySelectorAll('.gridPaging, [class*="paging"]')].filter((e) => e.offsetParent !== null).map(txt),
            orderSample: order.slice(0, 20).concat(order.slice(-12)),
            text: txt(grid).slice(0, 1500),
        };
    }).catch((e) => ({error: String(e.message)}));
}
async function openFilter(scope) {
    const f = scope.locator('form.filter').first();
    if (!(await f.locator('input[name="search"]').isVisible().catch(() => false))) {
        await scope.locator('a').filter({hasText: /^\s*Search\s*$/}).first().click();
        await f.locator('input[name="search"]').waitFor({state: 'visible', timeout: T});
    }
    return f;
}
async function filterRun(page, scope, {search = '', noRole = false}) {
    const f = await openFilter(scope);
    await f.locator('input[name="search"]').fill(search);
    await f.locator('select[name="userGroup"]').selectOption({index: 0});
    await f.locator('input[name="includeNoRole"]').setChecked(noRole);
    await f.getByRole('button', {name: 'Search'}).click();
    await idle(page); await sleep(700);
    return (await gridRows(scope)).map((r) => r.cells.slice(0, 5).join(' | '));
}
async function openRow(page, scope, rowText) {
    const row = scope.locator('tr.gridRow').filter({hasText: rowText}).first();
    if (!(await row.count())) return null;
    const arrow = row.locator('a.show_extras');
    if (await arrow.count()) {
        await arrow.click();
        await row.locator('xpath=following-sibling::tr[1]').getByRole('link').first().waitFor({timeout: 5000}).catch(() => {});
    }
    return row;
}
async function rowActions(page, scope, rowText) {
    const row = scope.locator('tr.gridRow').filter({hasText: rowText}).first();
    if (!(await row.count())) return {present: false};
    const a = row.locator('a.show_extras, a.hide_extras').first();
    const arrow = (await a.count()) ? await a.evaluate((e) => ({text: e.innerText.trim(), title: e.getAttribute('title'), cls: e.className})) : null;
    if (!arrow) return {present: true, arrow: null, links: []};
    if (/show_extras/.test(arrow.cls)) await a.click();
    const next = row.locator('xpath=following-sibling::tr[1]');
    await next.locator('a').first().waitFor({timeout: 5000}).catch(() => {});
    const links = (await next.locator('a').allInnerTexts()).map((t) => flat(t)).filter(Boolean);
    return {present: true, arrow, links, cells: (await row.locator('td').allInnerTexts()).map((c) => flat(c, 100))};
}
async function rowLink(page, scope, rowText, name) {
    const row = scope.locator('tr.gridRow').filter({hasText: rowText}).first();
    const next = row.locator('xpath=following-sibling::tr[1]');
    const link = next.locator('a').filter({hasText: new RegExp(`^\\s*${name}\\s*$`)}).first();
    if (!(await link.isVisible().catch(() => false))) await row.locator('a.show_extras').click();
    await link.click();
}

// ── legacy windows ──────────────────────────────────────────────────────────
async function formWindow(page, sel = 'form#userDetailsForm') {
    const form = page.locator(sel).last();
    await form.waitFor({timeout: T});
    await idle(page); await sleep(500);
    return form;
}
function dlgOf(page, form) { return page.getByRole('dialog').filter({has: form}).last(); }
async function formFacts(scope) {
    return scope.evaluate((f) => {
        const txt = (e) => (e ? e.innerText.replace(/\s+/g, ' ').trim() : null);
        const vis = (e) => !!(e && (e.offsetWidth || e.offsetHeight || e.getClientRects().length));
        const lab = (el) => {
            const l = (el.id && f.querySelector(`label[for="${CSS.escape(el.id)}"]`)) || el.closest('label');
            return txt(l);
        };
        const sectionOf = (el) => { const s = el.closest('.section, fieldset'); const lg = s && s.querySelector('legend, .label'); return txt(lg); };
        return {
            headings: [...f.querySelectorAll('h1,h2,h3,h4,legend')].filter(vis).map(txt),
            inputs: [...f.querySelectorAll('input:not([type=hidden]), select, textarea')].map((el) => ({
                name: el.name, type: el.type, label: lab(el), section: sectionOf(el), visible: vis(el), disabled: el.disabled,
                checked: el.type === 'checkbox' ? el.checked : undefined, value: el.type === 'password' || el.type === 'text' || el.type === 'email' ? el.value : undefined,
                maxlength: el.getAttribute('maxlength'), required: el.required || el.classList.contains('required') || null,
            })),
            descriptions: [...f.querySelectorAll('.description, .sub_label, label.sub_label, .pkp_help')].filter(vis).map(txt).filter(Boolean),
            links: [...f.querySelectorAll('a')].filter(vis).map(txt).filter(Boolean),
            buttons: [...f.querySelectorAll('button, input[type=submit]')].filter(vis).map((b) => txt(b) || b.value).filter(Boolean),
            errors: [...f.querySelectorAll('.error, label.error, #formErrors, .pkp_form_error, .formError, [class*="Error"]')].filter(vis).map(txt).filter(Boolean),
            text: txt(f).slice(0, 3000),
        };
    }).catch((e) => ({error: String(e.message)}));
}
async function closeDialog(page, dlg) {
    const c = dlg.getByRole('button', {name: /^Close/}).first();
    if (await c.count()) await c.click(); else await page.keyboard.press('Escape');
    await dlg.waitFor({state: 'hidden', timeout: T}).catch(() => {});
    await sleep(700);
}
async function cancelForm(page, form) {
    const c = form.getByRole('link', {name: 'Cancel', exact: true}).or(form.getByRole('button', {name: 'Cancel', exact: true}));
    await c.first().click();
    await form.waitFor({state: 'hidden', timeout: T}).catch(() => {});
    await sleep(700);
}
async function tryLogin(page, app, ctx, username, password, name) {
    await signOut(page).catch(() => {});
    await page.goto(app.url(`/index.php/${ctx}/en/login`));
    await page.locator('input#username').fill(username);
    await page.locator('input#password').evaluate((el) => el.removeAttribute('maxlength'));
    await page.locator('input#password').fill(password);
    await Promise.all([page.waitForLoadState('load'), page.locator('form#login button[type="submit"]').click()]);
    await page.waitForURL(() => true, {timeout: 3000}).catch(() => {});
    await idle(page).catch(() => {});
    const s = await snap(page, name);
    return {url: page.url().replace(/^https?:\/\/[^/]+/, ''), h1: flat(await page.locator('h1').first().innerText().catch(() => ''), 120), main: flat(s.text && s.text.main, 500),
        messages: (await page.locator('.pkp_form_error, .cmp_notification, [role="alert"]').allInnerTexts().catch(() => [])).map((m) => flat(m, 300))};
}
async function mailOf(app, to, {contains, timeoutMs = 15000} = {}) {
    try {
        const msg = await app.mail.find({to, contains, timeoutMs});
        const full = await app.mail.fullMessage(msg.ID);
        return {count: await app.mail.count({to}), from: full.From, to: full.To, replyTo: full.ReplyTo, subject: full.Subject, text: flat(full.Text, 1500)};
    } catch (e) { return {count: await app.mail.count({to}).catch(() => null), none: String(e.message).slice(0, 200)}; }
}

// Fill "Add User" step 1.
async function fillStep1(form, v) {
    if (v.given !== undefined) await form.locator('input[name="givenName[en]"]').fill(v.given);
    if (v.family !== undefined) await form.locator('input[name="familyName[en]"]').fill(v.family);
    if (v.username !== undefined) await form.locator('input[name="username"]').fill(v.username);
    if (v.email !== undefined) await form.locator('input[name="email"]').fill(v.email);
    if (v.password !== undefined) { await form.locator('input[name="password"]').fill(v.password); await form.locator('input[name="password2"]').fill(v.password2 !== undefined ? v.password2 : v.password); }
}
async function pressOK(page, form) {
    await form.getByRole('button', {name: 'OK', exact: true}).click();
    await sleep(1200); await idle(page);
}
async function openAddUser(page, panel) {
    await panel.locator('a').filter({hasText: /^\s*Add User\s*$/}).first().click();
    return formWindow(page);
}

// ---------------------------------------------------------------------------

forEachApp(async (app) => {
    const isOjs = app.name === 'ojs', isOmp = app.name === 'omp', isOps = app.name === 'ops';
    const MGR = isOjs ? 'Journal manager' : isOmp ? 'Press manager' : 'Preprint Server manager';
    const SE = isOjs ? 'Section editor' : isOmp ? 'Series editor' : 'Moderator';
    const REV = isOjs ? 'Reviewer' : isOmp ? 'External Reviewer' : null;
    await app.api.bootstrapProbe(app.contextPath);
    const F = {app: app.name, errors: []};
    const factsName = 'k3-facts';
    const step = async (name, fn) => {
        CUR = `${app.name}:${name}`;
        log(app.name, 'step', name);
        F[name] = {};
        try { await fn(F[name]); } catch (e) { F.errors.push({step: name, error: String(e.message || e).slice(0, 500)}); log(app.name, 'ERROR', name, String(e.stack || e).slice(0, 600)); }
        F[name].crashes = CRASH[CUR] || [];
        F[name].dialogs = DIALOGS.filter((d) => d.phase === CUR);
        record(factsName, {[name]: F[name], errors: F.errors}, {merge: true});
    };

    // ── seed ────────────────────────────────────────────────────────────────
    let st = null;
    if (!process.env.RESEED && fs.existsSync(stateFile(app))) st = JSON.parse(fs.readFileSync(stateFile(app), 'utf8'));
    const saveSt = () => fs.writeFileSync(stateFile(app), JSON.stringify(st, null, 2));
    if (!st) {
        const t = tag('u53k3');
        const C = `${t}c`, P = `${t}p`;
        const sec = isOjs ? 'ART' : isOps ? 'PRE' : null;
        const secSpec = sec ? {sections: [{abbrev: sec, title: isOjs ? 'Articles' : 'Preprints'}]} : {};
        const u = (k, g, f, roles, extra = {}) => ({username: `${t}${k}`, givenName: g, familyName: f, roles, ...extra});
        const users = [
            u('mgr', 'Mona', 'Kmanager', ['manager']),
            u('se', 'Sid', 'Ksection', ['sectionEditor']),
            u('au', 'Ava', 'Kauthor', ['author']),
            u('rd', 'Rae', 'Kreader', ['reader']),
            u('x', 'Xander', 'Ktarget', ['author']),
            ...(isOps ? [] : [u('rv', 'Rowan', 'Kreviewer', ['externalReviewer'])]),
            u('dz', 'Dora', 'Kdisabled', ['author'], {disabled: true}),
            u('em', 'Emma', 'Kemail', ['author']),
            u('ds', 'Dean', 'Kdisable', ['author']),
            u('cm', 'Cora', 'Kcomment', ['author']),
            u('mg1', 'Merle', 'Ksource', ['author']),
            u('mg2', 'Mia', 'Kchosen', ['author']),
            u('lg', 'Liam', 'Kloginas', ['manager']),
            u('sb', 'Sam', 'Ksubmitter', ['author']),
        ];
        const ctxC = await app.api.createContext({tag: C, context: {name: `K3 Journal ${t}`, acronym: 'K3C', contactName: 'Kay Contact', contactEmail: `contact${t}@mail.test`,
            supportedLocales: ['en', 'fr_CA'], supportedFormLocales: ['en', 'fr_CA']}, ...secSpec, users});
        const pu = [];
        for (let i = 1; i <= 27; i++) pu.push({username: `${t}p${String(i).padStart(2, '0')}`, givenName: `Page${i}`, familyName: 'Kpaging', roles: ['author']});
        const ctxP = await app.api.createContext({tag: P, context: {name: `K3 Paging ${t}`, acronym: 'K3P'}, ...secSpec, users: pu});
        const s1 = await app.api.createSubmission({tag: `${t}s1`, context: C, submitter: `${t}cm`, published: true, title: `K3 Cora article ${t}`,
            userComments: [{user: `${t}cm`, text: `K3 comment by Cora ${t}.`, approved: true}]});
        let s2 = null;
        if (!isOps) s2 = await app.api.createSubmission({tag: `${t}s2`, context: C, submitter: `${t}sb`, title: `K3 in review ${t}`, decisions: ['sendExternalReview']});
        const ids = {};
        for (const x of ctxC.users) ids[x.username.replace(t, '')] = x.id;
        st = {t, C, P, idC: ctxC.contextId, idP: ctxP.contextId, ids, s1: s1.submissionId, s2: s2 && s2.submissionId};
        saveSt();
        record('seed', {st, ctxC, ctxP: {contextId: ctxP.contextId, path: ctxP.path}, s1, s2});
        log(app.name, 'seeded', t);
    }
    const {t, C, P} = st;
    const U = (k) => `${t}${k}`;
    const E = (k) => mail(U(k));
    const PW = (k) => `Pw-${k}-${t}`.slice(0, 30);

    const {page, close} = await launch(app);
    watch(page);
    const OPEN = [];
    const extra = async () => { const x = await launch(app); watch(x.page); OPEN.push(x); return x; };
    const asAdmin = async () => { await signOut(page).catch(() => {}); await page.goto(app.url('/index.php/index/en/login')).catch(() => {}); await signIn(page, 'admin'); };
    try {
        // ── nav: Rule 19 ─────────────────────────────────────────────────────
        if (on('nav')) await step('nav', async (R) => {
            await signIn(page, 'admin');
            await page.goto(app.url('/index.php/index/en/admin'));
            await idle(page);
            await snap(page, 'n01-admin');
            R.adminLinks = (await page.locator('main a').allInnerTexts()).map((x) => flat(x, 60)).filter(Boolean).slice(0, 30);
            await page.getByRole('link', {name: /Hosted (Journals|Presses|Servers)/}).first().click();
            await page.waitForURL(/admin\/contexts/, {timeout: T});
            await idle(page); await sleep(500);
            await snap(page, 'n02-hosted');
            R.hostedHeading = flat(await page.locator('main h1, main h2, main h3, main h4').first().innerText().catch(() => ''), 80);
            const row = page.locator('tr.gridRow').filter({hasText: `K3 Journal ${t}`}).first();
            const arrow = row.locator('a.show_extras');
            R.hostedArrow = await arrow.evaluate((e) => ({text: e.innerText.trim(), title: e.getAttribute('title')})).catch(() => null);
            await arrow.click();
            const nxt = row.locator('xpath=following-sibling::tr[1]');
            await nxt.getByRole('link').first().waitFor({timeout: T});
            R.hostedRowLinks = (await nxt.getByRole('link').allInnerTexts()).map((x) => flat(x, 60));
            await snap(page, 'n03-hosted-row-open');
            await loc(page, 'Hosted Journals: a row\'s "Settings wizard" link', nxt.getByRole('link', {name: 'Settings wizard', exact: true}));
            await nxt.getByRole('link', {name: 'Settings wizard', exact: true}).click();
            await page.waitForURL(/admin\/wizard/, {timeout: T});
            await idle(page); await sleep(500);
            R.wizardUrl = page.url().replace(/^https?:\/\/[^/]+/, '');
            R.wizardH1 = flat(await page.locator('main h1, h1').first().innerText().catch(() => ''), 120);
            R.tabs = (await page.getByRole('tab').allInnerTexts()).map((x) => flat(x, 60));
            await snap(page, 'n04-wizard');
            await page.getByRole('tab', {name: 'Users', exact: true}).first().click();
            const panel = gridPanel(page);
            await panel.locator('tr.gridRow').first().waitFor({timeout: T});
            await idle(page); await sleep(500);
            await snap(page, 'n05-wizard-users');
            await loc(page, 'Wizard Users tab: the grid panel', panel);
            await loc(page, 'Wizard Users grid: "Add User"', panel.getByRole('link', {name: 'Add User', exact: true}));
            R.grid = await gridFacts(panel);
            R.rows = (await gridRows(panel)).map((r) => ({cells: r.cells.slice(0, 5).join(' | '), arrow: r.arrow}));
            R.filterHidden = !(await panel.locator('form.filter input[name="search"]').isVisible().catch(() => false));
            await openFilter(panel);
            R.filterForm = flat(await panel.locator('form.filter').first().innerText(), 1500);
            await snap(page, 'n06-wizard-users-filter');
            // "Add User" above, paging below: compare positions
            R.positions = await panel.evaluate((p) => {
                const box = (e) => (e ? Math.round(e.getBoundingClientRect().top) : null);
                const add = [...p.querySelectorAll('a')].find((a) => a.innerText.trim() === 'Add User');
                const tbl = p.querySelector('table');
                const pg = [...p.querySelectorAll('.gridPaging, [class*="paging"], .pkp_linkaction_moreItems')].find((e) => e.offsetParent !== null);
                return {addUser: box(add), table: box(tbl), tableBottom: tbl ? Math.round(tbl.getBoundingClientRect().bottom) : null, paging: box(pg), pagingText: pg ? pg.innerText.replace(/\s+/g, ' ').trim() : null};
            });
            // P: 28 rows → paging
            const pp = await openWizardUsers(page, app, st.idP);
            await snap(page, 'n07-paging-p1');
            R.p = {grid: await gridFacts(pp), rows: (await gridRows(pp)).length};
            const pagingLinks = (await pp.locator('.gridPaging a, [class*="paging"] a').allInnerTexts().catch(() => [])).map((x) => flat(x, 30));
            R.p.pagingLinks = pagingLinks;
            const nextLink = pp.locator('.gridPaging a, [class*="paging"] a').filter({hasText: /^\s*(2|>|Next|»)\s*$/}).first();
            if (await nextLink.count()) {
                await nextLink.click(); await idle(page); await sleep(800);
                await snap(page, 'n08-paging-p2');
                R.p.page2 = {grid: await gridFacts(pp), rows: (await gridRows(pp)).map((r) => r.cells.slice(0, 3).join(' | '))};
            }
            await loc(page, 'Wizard Users grid: paging links', pp.locator('.gridPaging a, [class*="paging"] a'));
        });

        // ── access: the wizard page typed by each level ──────────────────────
        if (on('access')) await step('access', async (R) => {
            for (const k of ['mgr', 'se', 'au', 'rd']) {
                await signIn(page, U(k), {contextPath: C});
                const r = {};
                for (const [n, p] of [['wizard', `/index.php/index/en/admin/wizard/${st.idC}`], ['contexts', '/index.php/index/en/admin/contexts'], ['wizardCtx', `/index.php/${C}/en/admin/wizard/${st.idC}`]]) {
                    const resp = await page.goto(app.url(p)).catch(() => null);
                    await idle(page).catch(() => {});
                    const s = await snap(page, `a-${k}-${n}`);
                    r[n] = {status: resp ? resp.status() : null, url: page.url().replace(/^https?:\/\/[^/]+/, ''), h1: flat(await page.locator('h1').first().innerText().catch(() => ''), 100), main: flat(s.text && s.text.main, 300),
                        tabUsers: await page.getByRole('tab', {name: 'Users', exact: true}).count()};
                }
                R[k] = r;
            }
            await signOut(page);
        });

        // ── add1: Add User step 1 ─────────────────────────────────────────────
        if (on('add1')) await step('add1', async (R) => {
            await signIn(page, 'admin');
            let panel = await openWizardUsers(page, app, st.idC);
            let form = await openAddUser(page, panel);
            await snap(page, 'b01-add-step1');
            await loc(page, 'Add User: the form', form);
            await loc(page, 'Add User: "Suggest"', form.getByRole('button', {name: 'Suggest', exact: true}));
            await loc(page, 'Add User: "More User Details"', form.getByRole('link', {name: /More User Details/}));
            await loc(page, 'Add User: "OK"', form.getByRole('button', {name: 'OK', exact: true}));
            R.open = await formFacts(form);
            R.dialogTitle = flat(await dlgOf(page, form).locator('h1, h2').first().innerText().catch(() => ''), 100);
            R.emailLabel = flat(await form.locator('label[for^="email"]').first().innerText().catch(() => ''), 80);
            // French twin of the name boxes
            await form.locator('input[name="familyName[en]"]').focus(); await sleep(400);
            R.frenchFamilyVisible = await form.locator('input[name="familyName[fr_CA]"]').isVisible().catch(() => false);
            R.frenchGivenVisible = await form.locator('input[name="givenName[fr_CA]"]').isVisible().catch(() => false);
            await snap(page, 'b02-add-french-twin');
            // More User Details
            R.extrasBefore = await form.locator('.extrasContainer').first().evaluate((e) => ({display: getComputedStyle(e).display, h: e.offsetHeight})).catch(() => null);
            await form.getByRole('link', {name: /More User Details/}).click(); await sleep(800);
            R.extrasAfter = await form.locator('.extrasContainer').first().evaluate((e) => ({display: getComputedStyle(e).display, h: e.offsetHeight})).catch(() => null);
            R.toggleText = flat(await form.locator('a.toggleExtras').first().innerText().catch(() => ''), 60);
            R.more = await formFacts(form);
            await snap(page, 'b03-add-more-details');
            // empty OK
            let before = DIALOGS.length;
            await pressOK(page, form);
            R.emptyOK = {errors: (await formFacts(form)).errors, notices: await notices(page), stillOpen: await form.isVisible().catch(() => false)};
            await snap(page, 'b04-add-empty-ok');
            // Suggest with no names
            await form.getByRole('button', {name: 'Suggest', exact: true}).click(); await sleep(1200);
            R.suggestEmpty = {value: await form.locator('input[name="username"]').inputValue(), dialogs: DIALOGS.slice(before), notices: await notices(page)};
            // Suggest: given only
            await form.locator('input[name="givenName[en]"]').fill('Nova');
            await form.getByRole('button', {name: 'Suggest', exact: true}).click();
            R.suggestGiven = await settled(page, form.locator('input[name="username"]'));
            await form.locator('input[name="username"]').fill('');
            await form.locator('input[name="familyName[en]"]').fill('Quinn-O\'Brien');
            await form.getByRole('button', {name: 'Suggest', exact: true}).click();
            R.suggestFull = await settled(page, form.locator('input[name="username"]'));
            await form.locator('input[name="username"]').fill('');
            await form.locator('input[name="givenName[en]"]').fill('Al');
            await form.locator('input[name="familyName[en]"]').fill('Dmin');
            await form.getByRole('button', {name: 'Suggest', exact: true}).click();
            R.suggestTaken = await settled(page, form.locator('input[name="username"]'));
            await snap(page, 'b05-add-suggest');
            // refusals, one field at a time
            const tryRefusal = async (name, v) => {
                await fillStep1(form, {given: 'Rex', family: 'Refused', username: `${t}rf`, email: `${t}rf@mail.test`, password: 'abcdef12', ...v});
                if (v.url !== undefined) { if (!(await form.locator('input[name="userUrl"]').isVisible())) await form.getByRole('link', {name: /More User Details/}).click(); await form.locator('input[name="userUrl"]').fill(v.url); }
                if (v.frFamily !== undefined) {
                    await form.locator('input[name="familyName[en]"]').focus(); await sleep(300);
                    await form.locator('input[name="familyName[fr_CA]"]').fill(v.frFamily).catch((e) => { R[`${name}FillErr`] = String(e.message).slice(0, 120); });
                    await form.locator('input[name="givenName[fr_CA]"]').fill('').catch(() => {});
                }
                await pressOK(page, form);
                const ff = await formFacts(form);
                const r = {errors: ff.errors, notices: await notices(page), stillOpen: await form.isVisible().catch(() => false), step2: await page.locator('form#userRoleForm').count()};
                await snap(page, `b06-refuse-${name}`);
                if (v.url !== undefined) await form.locator('input[name="userUrl"]').fill('');
                if (v.frFamily !== undefined) { await form.locator('input[name="familyName[en]"]').focus(); await sleep(200); await form.locator('input[name="familyName[fr_CA]"]').fill('').catch(() => {}); }
                return r;
            };
            R.refuse = {};
            R.refuse.givenEmpty = await tryRefusal('given', {given: ''});
            R.refuse.usernameUpper = await tryRefusal('upper', {username: `Rex${t}`.slice(0, 20)});
            R.refuse.usernameDot = await tryRefusal('dot', {username: `rex.${t}`.slice(0, 20)});
            R.refuse.usernameEdge = await tryRefusal('edge', {username: `_${t}rf`});
            // 33 characters typed: maxlength
            await form.locator('input[name="username"]').fill('');
            await form.locator('input[name="username"]').pressSequentially('abcdefghijklmnopqrstuvwxyz0123456');
            R.username33 = await form.locator('input[name="username"]').inputValue();
            R.refuse.usernameTaken = await tryRefusal('utaken', {username: 'admin'});
            R.refuse.emailTaken = await tryRefusal('etaken', {email: 'admin@mail.test'});
            R.refuse.emailBad = await tryRefusal('ebad', {email: 'not-an-address'});
            R.refuse.pwShort = await tryRefusal('pwshort', {password: 'ab1c5'});
            R.refuse.pwLen6 = {note: 'six characters: see add3/site'};
            R.refuse.pwMismatch = await tryRefusal('pwmis', {password: 'abcdef12', password2: 'abcdef13'});
            R.refuse.pwEmpty = await tryRefusal('pwempty', {password: '', password2: ''});
            R.refuse.url = await tryRefusal('url', {url: 'not a url'});
            R.refuse.frFamily = await tryRefusal('frfam', {frFamily: 'Famillefr'});
            // Generate Password toggled (look only)
            await form.locator('input[name="generatePassword"]').check(); await sleep(500);
            R.generate = await form.evaluate((f) => ({
                pw: f.querySelector('input[name=password]').value, pwDisabled: f.querySelector('input[name=password]').disabled,
                pw2: f.querySelector('input[name=password2]').value, pw2Disabled: f.querySelector('input[name=password2]').disabled,
                notify: f.querySelector('input[name=sendNotify]').checked, notifyDisabled: f.querySelector('input[name=sendNotify]').disabled,
                change: f.querySelector('input[name=mustChangePassword]').checked,
            }));
            await snap(page, 'b07-add-generate');
            await form.locator('input[name="generatePassword"]').uncheck(); await sleep(500);
            R.generateOff = await form.evaluate((f) => ({pw: f.querySelector('input[name=password]').value, pwDisabled: f.querySelector('input[name=password]').disabled, notify: f.querySelector('input[name=sendNotify]').checked, notifyDisabled: f.querySelector('input[name=sendNotify]').disabled}));
            // leave with typed text: Cancel
            before = DIALOGS.length;
            await form.locator('input[name="givenName[en]"]').fill('Unsaved');
            await form.locator('input[name="givenName[en]"]').blur();
            await cancelForm(page, form);
            R.leaveCancel = {dialogs: DIALOGS.slice(before), stillOpen: await form.isVisible().catch(() => false)};
            await sleep(2000);
            const addLink = gridPanel(page).locator('a').filter({hasText: /^\s*Add User\s*$/}).first();
            R.addLinkAfterCancel = await addLink.evaluate((a) => ({disabled: a.getAttribute('disabled'), ariaHidden: a.getAttribute('aria-hidden')})).catch((e) => String(e.message).slice(0, 100));
            await addLink.click({timeout: 5000}).then(() => { R.addLinkClickAfterCancel = 'clicked'; }).catch((e) => { R.addLinkClickAfterCancel = String(e.message).slice(0, 80); });
            await sleep(1500);
            R.windowAfterCancelClick = await page.locator('form#userDetailsForm').count();
            await snap(page, 'b08-after-cancel-add-again');
            // leave with typed text: the window's Close (fresh page)
            if (R.windowAfterCancelClick) { await page.goto(app.url('/index.php/index/en/admin/contexts')); await idle(page); }
            panel = await openWizardUsers(page, app, st.idC);
            form = await openAddUser(page, panel);
            before = DIALOGS.length;
            await form.locator('input[name="givenName[en]"]').fill('Unsaved2'); await form.locator('input[name="givenName[en]"]').blur();
            const dlg = dlgOf(page, form);
            R.dialogButtons = (await dlg.getByRole('button').allInnerTexts()).map((x) => flat(x, 40));
            await closeDialog(page, dlg);
            R.leaveClose = {dialogs: DIALOGS.slice(before), stillOpen: await form.isVisible().catch(() => false)};
            await snap(page, 'b09-after-close-confirm-dismissed');
            // the same, the question accepted
            const acc = (d) => { d.accept().catch(() => {}); };
            page.prependListener('dialog', acc);
            before = DIALOGS.length;
            await closeDialog(page, dlg);
            page.off('dialog', acc);
            R.leaveCloseAccepted = {dialogs: DIALOGS.slice(before), stillOpen: await form.isVisible().catch(() => false)};
            // leave the page with the window open and typed text
            panel = await openWizardUsers(page, app, st.idC);
            form = await openAddUser(page, panel);
            before = DIALOGS.length;
            await form.locator('input[name="givenName[en]"]').fill('Unsaved3'); await form.locator('input[name="givenName[en]"]').blur();
            await page.goto(app.url('/index.php/index/en/admin/contexts')); await idle(page);
            R.leaveGoto = {dialogs: DIALOGS.slice(before), url: page.url().replace(/^https?:\/\/[^/]+/, '')};
            R.rfCreated = await app.mail.count({to: `${t}rf@mail.test`});
            // did any refused attempt create the account? read the grid with no-role users
            panel = await openWizardUsers(page, app, st.idC);
            R.rfInGrid = await filterRun(page, panel, {search: `${t}rf`, noRole: true});
        });

        // ── td12: step 2 refused, closed; the no-role account; the username again ─
        if (on('td12')) await step('td12', async (R) => {
            await signIn(page, 'admin');
            let panel = await openWizardUsers(page, app, st.idC);
            let form = await openAddUser(page, panel);
            await fillStep1(form, {given: 'Nova', username: U('nv'), email: E('nv'), password: PW('nv')});
            await pressOK(page, form);
            const rf = page.locator('form#userRoleForm').last();
            await rf.waitFor({timeout: T});
            await idle(page); await sleep(500);
            await snap(page, 'c01-step2');
            await loc(page, 'Add User step 2: the form', rf);
            R.step2 = await formFacts(rf);
            R.step2Title = flat(await dlgOf(page, rf).locator('h1, h2').first().innerText().catch(() => ''), 100);
            R.step1Gone = !(await page.locator('form#userDetailsForm').isVisible().catch(() => false));
            // untick every role box (none is ticked) and Save
            await rf.getByRole('button', {name: 'Save', exact: true}).click();
            await sleep(1200); await idle(page);
            R.saveNone = {errors: (await formFacts(rf)).errors, notices: await notices(page), stillOpen: await rf.isVisible().catch(() => false)};
            await snap(page, 'c02-step2-none');
            // close without saving
            await closeDialog(page, dlgOf(page, rf));
            panel = gridPanel(page);
            R.gridAfterClose = (await gridRows(panel)).map((r) => r.cells.slice(0, 5).join(' | ')).filter((x) => x.includes(U('nv')));
            await snap(page, 'c03-grid-after-close');
            await page.reload(); await idle(page);
            panel = await openWizardUsers(page, app, st.idC);
            R.gridReload = (await gridRows(panel)).map((r) => r.cells.slice(0, 5).join(' | ')).filter((x) => x.includes(U('nv')));
            R.searchNoRoleOff = await filterRun(page, panel, {search: U('nv'), noRole: false});
            R.searchNoRoleOn = await filterRun(page, panel, {search: U('nv'), noRole: true});
            await snap(page, 'c04-grid-norole-on');
            R.nvRow = await rowActions(page, panel, U('nv'));
            await snap(page, 'c05-nv-row-open');
            // Add User again with the same username and email
            form = await openAddUser(page, gridPanel(page));
            await fillStep1(form, {given: 'Nova', username: U('nv'), email: `${t}nv2@mail.test`, password: PW('nv')});
            await pressOK(page, form);
            R.again = {errors: (await formFacts(form)).errors, notices: await notices(page), step2: await page.locator('form#userRoleForm').isVisible().catch(() => false)};
            await snap(page, 'c06-same-username');
            await cancelForm(page, form).catch(() => {});
            R.mailNv = await app.mail.count({to: E('nv')});
            // the Vue list and the no-role account signing in
            await page.goto(app.url(`/index.php/${C}/en/management/settings/access`)); await idle(page); await sleep(800);
            R.vueList = flat((await page.locator('table').first().innerText().catch(() => '')), 3000).includes(U('nv'));
            R.invitations = flat(await page.locator('main').innerText().catch(() => ''), 400);
            R.nvLogin = await tryLogin(page, app, C, U('nv'), PW('nv'), 'c07-nv-login');
            st.nv = true; saveSt();
        });

        // ── add2: Notify ticked, typed password, Change Password ticked ────────
        if (on('add2')) await step('add2', async (R) => {
            await signIn(page, 'admin');
            const panel = await openWizardUsers(page, app, st.idC);
            const form = await openAddUser(page, panel);
            await fillStep1(form, {given: 'Quinn', family: 'Kfullname', username: U('qn'), email: E('qn'), password: PW('qn')});
            await form.locator('input[name="sendNotify"]').check();
            R.changeDefault = await form.locator('input[name="mustChangePassword"]').isChecked();
            await snap(page, 'd01-add2-step1');
            await pressOK(page, form);
            const rf = page.locator('form#userRoleForm').last();
            await rf.waitFor({timeout: T}); await idle(page); await sleep(500);
            R.step2 = await formFacts(rf);
            await snap(page, 'd02-add2-step2');
            await rf.getByRole('checkbox', {name: 'Author', exact: true}).first().check();
            if (REV) await rf.getByRole('checkbox', {name: REV, exact: true}).first().check();
            await rf.getByRole('button', {name: 'Save', exact: true}).click();
            await sleep(1500); await idle(page);
            R.afterSave = {notices: await notices(page), windowOpen: await rf.isVisible().catch(() => false),
                row: (await gridRows(gridPanel(page))).map((r) => r.cells.slice(0, 5).join(' | ')).filter((x) => x.includes(U('qn')))};
            await snap(page, 'd03-add2-after-save');
            await page.reload(); await idle(page);
            const p2 = await openWizardUsers(page, app, st.idC);
            R.afterReload = (await gridRows(p2)).map((r) => r.cells.slice(0, 5).join(' | ')).filter((x) => x.includes(U('qn')));
            R.mail = await mailOf(app, E('qn'), {contains: U('qn')});
            R.mailAll = await app.mail.count({to: E('qn')});
            R.mailPasswordShown = R.mail.text ? R.mail.text.includes(PW('qn')) : null;
            // first sign-in
            R.login = await tryLogin(page, app, C, U('qn'), PW('qn'), 'd04-qn-first-login');
            st.qn = true; saveSt();
        });

        // ── add3: Generate Password, Change Password unticked ────────────────
        if (on('add3')) await step('add3', async (R) => {
            await signIn(page, 'admin');
            const panel = await openWizardUsers(page, app, st.idC);
            const form = await openAddUser(page, panel);
            await fillStep1(form, {given: 'Gene', family: 'Kgenerated', username: U('gn'), email: E('gn')});
            await form.locator('input[name="generatePassword"]').check(); await sleep(400);
            await form.locator('input[name="mustChangePassword"]').uncheck();
            R.before = await form.evaluate((f) => ({pw: f.querySelector('input[name=password]').value, notify: f.querySelector('input[name=sendNotify]').checked, notifyDisabled: f.querySelector('input[name=sendNotify]').disabled, change: f.querySelector('input[name=mustChangePassword]').checked}));
            await snap(page, 'e01-add3-step1');
            await pressOK(page, form);
            const rf = page.locator('form#userRoleForm').last();
            await rf.waitFor({timeout: T}); await idle(page); await sleep(500);
            R.step2Title = flat(await dlgOf(page, rf).locator('h1, h2, h3').allInnerTexts().then((a) => a.join(' / ')).catch(() => ''), 200);
            R.step2Masthead = await rf.locator('input[name="mastheadUserGroupIds[]"]').evaluateAll((els) => els.map((e) => ({checked: e.checked, disabled: e.disabled, label: (e.closest('label') || {}).innerText})));
            await rf.getByRole('checkbox', {name: 'Reader', exact: true}).first().check();
            await rf.getByRole('button', {name: 'Save', exact: true}).click();
            await sleep(1500); await idle(page);
            R.mail = await mailOf(app, E('gn'), {contains: U('gn')});
            const m = R.mail.text && R.mail.text.match(/Password:\s*(\S+)/i);
            R.mailedPassword = m ? m[1].length : null;
            if (m) {
                R.login = await tryLogin(page, app, C, U('gn'), m[1], 'e02-gn-login');
                st.gnPw = m[1]; saveSt();
            }
        });

        // ── add4: neither Notify nor Generate: no mail ────────────────────────
        if (on('add4')) await step('add4', async (R) => {
            await signIn(page, 'admin');
            const panel = await openWizardUsers(page, app, st.idC);
            const form = await openAddUser(page, panel);
            await fillStep1(form, {given: 'Nell', family: 'Knomail', username: U('nm'), email: E('nm'), password: PW('nm')});
            R.notifyDefault = await form.locator('input[name="sendNotify"]').isChecked();
            await pressOK(page, form);
            const rf = page.locator('form#userRoleForm').last();
            await rf.waitFor({timeout: T}); await idle(page); await sleep(400);
            await rf.getByRole('checkbox', {name: 'Reader', exact: true}).first().check();
            await rf.getByRole('button', {name: 'Save', exact: true}).click();
            await sleep(1500); await idle(page);
            // bound: a control message to the same kind of address, the Email window
            const p = gridPanel(page);
            await rowLink(page, p, U('nm'), 'Email');
            const ef = page.locator('#sendEmailForm').last();
            await ef.waitFor({timeout: T}); await idle(page);
            await page.waitForFunction(() => ((window.tinymce && window.tinymce.get()) || []).some((e) => /^message/.test(e.id) && e.initialized), undefined, {timeout: T}).catch(() => {});
            await ef.locator('input[name="subject"]').fill(`K3 control ${t}`);
            await ef.frameLocator('iframe').first().locator('body').click();
            await page.keyboard.type(`K3 control body ${t}`);
            await ef.getByRole('button', {name: 'Send Email'}).click();
            await sleep(1500); await idle(page);
            R.control = await mailOf(app, E('nm'), {contains: `K3 control body ${t}`});
            R.otherMail = (await app.mail.count({to: E('nm')})) - 1;
            R.login = await tryLogin(page, app, C, U('nm'), PW('nm'), 'f01-nm-login');
        });

        // ── edit: Edit User ────────────────────────────────────────────────────
        if (on('edit')) await step('edit', async (R) => {
            await signIn(page, 'admin');
            let panel = await openWizardUsers(page, app, st.idC);
            await rowLink(page, panel, U('x'), 'Edit User');
            let form = await formWindow(page);
            await sleep(800);
            await snap(page, 'g01-edit-x');
            await loc(page, 'Edit User: the form', form);
            R.open = await formFacts(form);
            R.title = flat(await dlgOf(page, form).locator('h1, h2').first().innerText().catch(() => ''), 100);
            R.gossip = {label: flat(await form.locator('label[for^="gossip"]').first().innerText().catch(() => ''), 100), count: await form.locator('[name="gossip"], textarea[id^="gossip"]').count()};
            R.roles = await form.locator('input[name="userGroupIds[]"]').evaluateAll((els) => els.map((e) => ({label: (e.closest('label') || document.querySelector(`label[for="${e.id}"]`) || {}).innerText, checked: e.checked})).filter((x) => x.checked));
            R.masthead = await form.locator('input[name="mastheadUserGroupIds[]"]').evaluateAll((els) => els.map((e) => ({label: ((e.closest('label') || document.querySelector(`label[for="${e.id}"]`) || {}).innerText || '').trim(), checked: e.checked, disabled: e.disabled})));
            // untick every role → refused
            const author = form.getByRole('checkbox', {name: 'Author', exact: true}).first();
            await author.uncheck();
            await pressOK(page, form);
            R.noRole = {errors: (await formFacts(form)).errors, notices: await notices(page), stillOpen: await form.isVisible().catch(() => false)};
            await snap(page, 'g02-edit-no-role');
            // tick Author again plus the section-editor role; OK
            await author.check();
            await form.getByRole('checkbox', {name: SE, exact: true}).first().check();
            const x2 = await extra();
            await signIn(x2.page, U('x'), {contextPath: C});
            await x2.page.goto(app.url(`/index.php/${C}/en/submissions`)); await idle(x2.page).catch(() => {});
            await form.getByRole('button', {name: 'OK', exact: true}).click();
            R.editedNotice = await page.getByText('User edited.').first().waitFor({timeout: 8000}).then(() => true).catch(() => false);
            R.editedNoticeText = (await page.locator('.ui-pnotify, [class*="pnotify"], .pkp_notification, [role="status"], [role="alert"]').allInnerTexts().catch(() => [])).map((x) => flat(x, 120));
            await snap(page, 'g03a-edit-ok-notice');
            await sleep(800); await idle(page);
            R.grant = {notices: await notices(page), windowOpen: await form.isVisible().catch(() => false),
                row: (await gridRows(gridPanel(page))).map((r) => r.cells.slice(0, 5).join(' | ')).filter((x) => x.includes(U('x')))};
            await snap(page, 'g03-edit-granted');
            await page.reload(); await idle(page);
            panel = await openWizardUsers(page, app, st.idC);
            R.grantReload = (await gridRows(panel)).map((r) => r.cells.slice(0, 5).join(' | ')).filter((x) => x.includes(U('x')));
            // the Users & Roles roles page for x
            await page.goto(app.url(`/index.php/${C}/en/management/settings/user/${st.ids.x}`)); await idle(page); await sleep(1200);
            const sr = await snap(page, 'g04-x-roles-page');
            R.rolesPage = flat(sr.text && sr.text.main, 1500);
            // x's open session: a reload after the role came
            await x2.page.reload().catch(() => {}); await idle(x2.page).catch(() => {});
            R.xSessionAfterRole = {url: x2.page.url().replace(/^https?:\/\/[^/]+/, ''), header: flat((await snap(x2.page, 'g05-x-session-after-role')).text.header, 200)};
            // untick the section-editor role
            panel = await openWizardUsers(page, app, st.idC);
            await rowLink(page, panel, U('x'), 'Edit User');
            form = await formWindow(page); await sleep(800);
            R.reopenRoles = await form.locator('input[name="userGroupIds[]"]').evaluateAll((els) => els.map((e) => ({label: ((e.closest('label') || document.querySelector(`label[for="${e.id}"]`) || {}).innerText || '').trim(), checked: e.checked})).filter((x) => x.checked));
            await form.getByRole('checkbox', {name: SE, exact: true}).first().uncheck();
            await pressOK(page, form);
            R.end = {notices: await notices(page), row: (await gridRows(gridPanel(page))).map((r) => r.cells.slice(0, 5).join(' | ')).filter((x) => x.includes(U('x')))};
            panel = await openWizardUsers(page, app, st.idC);
            R.endReload = (await gridRows(panel)).map((r) => r.cells.slice(0, 5).join(' | ')).filter((x) => x.includes(U('x')));
            await snap(page, 'g05a-grid-after-end-reload');
            await page.goto(app.url(`/index.php/${C}/en/management/settings/user/${st.ids.x}`)); await idle(page); await sleep(1200);
            R.rolesPageAfterEnd = flat((await snap(page, 'g06-x-roles-page-after-end')).text.main, 1500);
            R.mailX = await app.mail.count({to: E('x')});
            // new password ends x's session
            panel = await openWizardUsers(page, app, st.idC);
            await rowLink(page, panel, U('x'), 'Edit User');
            form = await formWindow(page); await sleep(800);
            await form.locator('input[name="password"]').fill(PW('xnew'));
            await form.locator('input[name="password2"]').fill(PW('xnew'));
            await pressOK(page, form);
            R.pwSaved = {notices: await notices(page), windowOpen: await form.isVisible().catch(() => false)};
            await x2.page.reload().catch(() => {}); await x2.page.waitForLoadState('load').catch(() => {}); await sleep(1000);
            const sx = await snap(x2.page, 'g07-x-session-after-pw');
            R.xSessionAfterPw = {url: x2.page.url().replace(/^https?:\/\/[^/]+/, ''), header: flat(sx.text && sx.text.header, 200)};
            await x2.page.goto(app.url(`/index.php/${C}/en/dashboard/mySubmissions`)).catch(() => {}); await x2.page.waitForLoadState('load').catch(() => {}); await sleep(800);
            R.xSessionDash = {url: x2.page.url().replace(/^https?:\/\/[^/]+/, ''), header: flat((await snap(x2.page, 'g08-x-session-dashboard')).text.header, 200)};
            R.xLoginNew = await tryLogin(x2.page, app, C, U('x'), PW('xnew'), 'g09-x-login-new');
            R.xLoginOld = await tryLogin(x2.page, app, C, U('x'), `${U('x')}${U('x')}`, 'g10-x-login-old');
            // an empty password on Edit keeps it: OK with blanks after a text change
            panel = await openWizardUsers(page, app, st.idC);
            await rowLink(page, panel, U('x'), 'Edit User');
            form = await formWindow(page); await sleep(800);
            await form.locator('input[name="familyName[en]"]').fill('Ktargetedited');
            await pressOK(page, form);
            R.blankPw = {notices: await notices(page), row: (await gridRows(gridPanel(page))).map((r) => r.cells.slice(0, 5).join(' | ')).filter((x) => x.includes(U('x')))};
            R.xLoginAfterBlank = await tryLogin(x2.page, app, C, U('x'), PW('xnew'), 'g11-x-login-after-blank');
            // the reviewer's masthead box (OJS, OMP)
            if (REV) {
                panel = await openWizardUsers(page, app, st.idC);
                await rowLink(page, panel, U('rv'), 'Edit User');
                form = await formWindow(page); await sleep(800);
                R.rvGossip = {section: flat(await form.locator('textarea[name="gossip"], textarea[id^="gossip"]').first().evaluate((t) => { const s = t.closest('.section'); return s ? s.innerText : ''; }).catch(() => ''), 300), count: await form.locator('textarea[name="gossip"], textarea[id^="gossip"]').count(), label: flat(await form.locator('label[for^="gossip"]').first().innerText().catch(() => ''), 80), desc: (await formFacts(form)).descriptions.filter((d) => /note|gossip|Editorial/i.test(d))};
                R.rvMasthead = await form.locator('input[name="mastheadUserGroupIds[]"]').evaluateAll((els) => els.map((e) => ({label: ((e.closest('label') || document.querySelector(`label[for="${e.id}"]`) || {}).innerText || '').trim(), checked: e.checked, disabled: e.disabled})));
                await snap(page, 'g12-rv-edit');
                await cancelForm(page, form);
            }
            // own row: look only
            panel = gridPanel(page);
            if (!(await panel.isVisible().catch(() => false))) panel = await openWizardUsers(page, app, st.idC);
            await rowLink(page, panel, 'admin@mail.test', 'Edit User');
            form = await formWindow(page); await sleep(800);
            R.own = await formFacts(form);
            R.ownGossip = await form.locator('[name="gossip"], textarea[id^="gossip"]').count();
            await snap(page, 'g13-own-edit');
            // leave with a change: Cancel
            let before = DIALOGS.length;
            await form.locator('input[name="familyName[en]"]').fill('Unsavedadmin'); await form.locator('input[name="familyName[en]"]').blur();
            await cancelForm(page, form);
            R.ownLeave = {dialogs: DIALOGS.slice(before)};
            panel = await openWizardUsers(page, app, st.idC);
            R.ownRowAfter = (await gridRows(panel)).map((r) => r.cells.slice(0, 5).join(' | ')).filter((x) => x.includes('admin@mail.test'));
        });

        // ── rows: Rule 20 ──────────────────────────────────────────────────────
        if (on('rows')) await step('rows', async (R) => {
            await signIn(page, 'admin');
            const panel = await openWizardUsers(page, app, st.idC);
            await loc(page, 'Wizard Users grid: a row\'s arrow', panel.locator('tr.gridRow').first().locator('a.show_extras'));
            R.arrowName = await panel.locator('tr.gridRow').first().locator('a.show_extras').evaluate((e) => ({text: e.innerText.trim(), title: e.getAttribute('title'), aria: e.getAttribute('aria-label'), role: e.getAttribute('role')}));
            R.arrowAccName = await panel.getByRole('link', {name: 'Settings', exact: true}).count();
            R.own = await rowActions(page, panel, 'admin@mail.test');
            R.x = await rowActions(page, panel, E('x'));
            R.dz = await rowActions(page, panel, E('dz'));
            R.lg = await rowActions(page, panel, E('lg'));
            await snap(page, 'k01-rows-open');
            await loc(page, 'Wizard Users grid: row action links (the next tr)', panel.locator('tr.gridRow').first().locator('xpath=following-sibling::tr[1]').getByRole('link'));
            if (st.nv) {
                await filterRun(page, panel, {search: U('nv'), noRole: true});
                R.nv = await rowActions(page, panel, U('nv'));
                await snap(page, 'k02-nv-row');
            }
            // own row: "Disable User" window and "Remove" confirmation, cancelled
            await filterRun(page, panel, {search: '', noRole: false});
            await rowLink(page, panel, 'admin@mail.test', 'Disable User');
            const dlg = page.getByRole('dialog').last();
            await dlg.waitFor({timeout: T}); await idle(page); await sleep(600);
            R.ownDisable = {text: flat(await dlg.innerText(), 600), form: await dlg.locator('textarea[name="disableReason"]').count()};
            await snap(page, 'k03-own-disable-window');
            const c = dlg.getByRole('link', {name: 'Cancel', exact: true});
            if (await c.count()) await c.click(); else await closeDialog(page, dlg);
            await sleep(900);
            await rowLink(page, gridPanel(page), 'admin@mail.test', 'Remove');
            const cd = page.locator('[role="dialog"], [data-cy="dialog"]').filter({hasText: /remove|unenrol/i}).last();
            await cd.waitFor({timeout: T}).catch(() => {});
            R.ownRemove = {text: flat(await cd.innerText().catch(() => ''), 400), buttons: (await cd.getByRole('button').allInnerTexts().catch(() => [])).map((x) => flat(x, 30))};
            await snap(page, 'k04-own-remove-confirm');
            const cb = cd.getByRole('button', {name: /^(Cancel|No)$/});
            if (await cb.count()) await cb.first().click(); else await page.keyboard.press('Escape');
            await sleep(900);
            R.ownAfter = (await gridRows(gridPanel(page))).map((r) => r.cells.slice(0, 5).join(' | ')).filter((x) => x.includes('admin@mail.test'));
        });

        // ── acts: Email, Disable, Enable, Remove, Merge from the grid ──────────
        if (on('acts')) await step('acts', async (R) => {
            await asAdmin();
            let panel = await openWizardUsers(page, app, st.idC);
            // Email
            await rowLink(page, panel, E('em'), 'Email');
            const ef = page.locator('#sendEmailForm').last();
            await ef.waitFor({timeout: T}); await idle(page);
            await page.waitForFunction(() => ((window.tinymce && window.tinymce.get()) || []).some((e) => /^message/.test(e.id) && e.initialized), undefined, {timeout: T}).catch(() => {});
            await snap(page, 'm01-email-window');
            R.email = {window: await formFacts(ef), to: await ef.locator('input[name="user"]').evaluate((i) => ({value: i.value, disabled: i.disabled})).catch(() => null)};
            await ef.locator('input[name="subject"]').fill(`K3 grid email ${t}`);
            await ef.frameLocator('iframe').first().locator('body').click();
            await page.keyboard.type(`K3 grid body ${t}`);
            await ef.getByRole('button', {name: 'Send Email'}).click();
            await sleep(1500); await idle(page);
            R.email.after = {notices: await notices(page), open: await ef.isVisible().catch(() => false)};
            R.email.mail = await mailOf(app, E('em'), {contains: `K3 grid body ${t}`});
            // Disable
            panel = gridPanel(page);
            await rowLink(page, panel, E('ds'), 'Disable User');
            let dlg = page.getByRole('dialog').last();
            await dlg.locator('textarea[name="disableReason"]').waitFor({timeout: T});
            await idle(page); await sleep(400);
            await snap(page, 'm02-disable-window');
            R.disable = {window: flat(await dlg.innerText(), 600)};
            await dlg.locator('textarea[name="disableReason"]').fill(`K3 reason ${t}`);
            await dlg.getByRole('button', {name: 'OK', exact: true}).click();
            await dlg.waitFor({state: 'hidden', timeout: T}).catch(() => {});
            await sleep(1000); await idle(page);
            R.disable.after = {notices: await notices(page), row: await rowActions(page, gridPanel(page), E('ds'))};
            await snap(page, 'm03-after-disable');
            const side = await extra();
            R.disable.login = await tryLogin(side.page, app, C, U('ds'), `${U('ds')}${U('ds')}`, 'm04-ds-login-disabled');
            panel = await openWizardUsers(page, app, st.idC);
            R.disable.reload = await rowActions(page, panel, E('ds'));
            // Enable
            await rowLink(page, panel, E('ds'), 'Enable');
            dlg = page.getByRole('dialog').last();
            await dlg.waitFor({timeout: T}); await idle(page); await sleep(600);
            await snap(page, 'm05-enable-window');
            R.enable = {window: flat(await dlg.innerText(), 600), reason: await dlg.locator('textarea[name="disableReason"]').inputValue().catch(() => null)};
            await dlg.getByRole('button', {name: 'OK', exact: true}).click();
            await dlg.waitFor({state: 'hidden', timeout: T}).catch(() => {});
            await sleep(1000); await idle(page);
            R.enable.after = await rowActions(page, gridPanel(page), E('ds'));
            R.enable.login = await tryLogin(side.page, app, C, U('ds'), `${U('ds')}${U('ds')}`, 'm06-ds-login-enabled');
            // Remove (the commenter)
            await page.goto(app.url(`/index.php/${C}/en/management/settings/userComments`)); await idle(page); await sleep(1200);
            R.commentsBefore = flat((await snap(page, 'm07-comments-before')).text.main, 800);
            panel = await openWizardUsers(page, app, st.idC);
            await rowLink(page, panel, E('cm'), 'Remove');
            const cd = page.locator('[role="dialog"], [data-cy="dialog"]').filter({hasText: /remove|unenrol/i}).last();
            await cd.waitFor({timeout: T});
            await snap(page, 'm08-remove-confirm');
            R.remove = {confirm: flat(await cd.innerText(), 400), buttons: (await cd.getByRole('button').allInnerTexts()).map((x) => flat(x, 30))};
            await cd.getByRole('button', {name: /^(OK|Yes|Remove)$/}).first().click();
            await sleep(1500); await idle(page);
            R.remove.after = {notices: await notices(page), grid: (await gridRows(gridPanel(page))).map((r) => r.cells.slice(0, 5).join(' | ')).filter((x) => x.includes(U('cm')))};
            await snap(page, 'm09-after-remove');
            panel = await openWizardUsers(page, app, st.idC);
            R.remove.reload = (await gridRows(panel)).map((r) => r.cells.slice(0, 5).join(' | ')).filter((x) => x.includes(U('cm')));
            R.remove.noRole = await filterRun(page, panel, {search: U('cm'), noRole: true});
            R.remove.row = await rowActions(page, panel, U('cm'));
            await page.goto(app.url(`/index.php/${C}/en/management/settings/user/${st.ids.cm}`)); await idle(page); await sleep(1200);
            R.remove.rolesPage = flat((await snap(page, 'm10-cm-roles-page')).text.main, 1200);
            await page.goto(app.url(`/index.php/${C}/en/management/settings/userComments`)); await idle(page); await sleep(1200);
            R.remove.comments = flat((await snap(page, 'm11-comments-after-remove')).text.main, 800);
            R.remove.mail = await app.mail.count({to: E('cm')});
            // Merge User: mg1 into mg2
            panel = await openWizardUsers(page, app, st.idC);
            await rowLink(page, panel, E('mg1'), 'Merge User');
            const mw = page.getByRole('dialog').last();
            await mw.locator('tr.gridRow').first().waitFor({timeout: T}); await idle(page); await sleep(600);
            await snap(page, 'm12-merge-window');
            R.merge = {window: flat(await mw.innerText(), 1200)};
            const f = await openFilter(mw);
            await f.locator('input[name="search"]').fill(U('mg2'));
            await f.getByRole('button', {name: 'Search'}).click();
            await idle(page); await sleep(800);
            const trow = mw.locator('tr.gridRow').filter({hasText: U('mg2')}).first();
            await trow.locator('a.show_extras').click();
            const tnext = trow.locator('xpath=following-sibling::tr[1]');
            R.merge.targetLinks = (await tnext.getByRole('link').allInnerTexts()).map((x) => flat(x, 40));
            await tnext.getByRole('link', {name: /Merge into this User/i}).click();
            const mc = page.locator('[role="dialog"]').filter({hasText: /will not exist|merge/i}).last();
            await mc.waitFor({timeout: T}).catch(() => {});
            R.merge.confirm = flat(await mc.innerText().catch(() => ''), 500);
            await snap(page, 'm13-merge-confirm');
            await mc.getByRole('button', {name: /^(OK|Yes)$/}).first().click();
            await sleep(2000); await idle(page);
            R.merge.after = {notices: await notices(page), dialogs: (await page.getByRole('dialog').allInnerTexts().catch(() => [])).map((x) => flat(x, 200))};
            await snap(page, 'm14-after-merge');
            panel = await openWizardUsers(page, app, st.idC);
            R.merge.grid = (await gridRows(panel)).map((r) => r.cells.slice(0, 5).join(' | ')).filter((x) => x.includes(U('mg')));
            R.merge.oldLogin = await tryLogin(side.page, app, C, U('mg1'), `${U('mg1')}${U('mg1')}`, 'm15-mg1-login');
            R.merge.newLogin = await tryLogin(side.page, app, C, U('mg2'), `${U('mg2')}${U('mg2')}`, 'm16-mg2-login');
        });

        // ── impers: Login As from the grid, then the wizard ──────────────────
        if (on('impers')) await step('impers', async (R) => {
            await signIn(page, 'admin');
            const panel = await openWizardUsers(page, app, st.idC);
            await rowLink(page, panel, E('lg'), 'Login As');
            const cd = page.locator('[role="dialog"], [data-cy="dialog"]').last();
            await cd.waitFor({timeout: 5000}).catch(() => {});
            R.confirm = flat(await cd.innerText().catch(() => ''), 300);
            const ok = cd.getByRole('button', {name: /^(OK|Yes)$/}).first();
            if (await ok.count()) await ok.click();
            await page.waitForLoadState('load').catch(() => {}); await sleep(1500); await idle(page).catch(() => {});
            R.landed = {url: page.url().replace(/^https?:\/\/[^/]+/, ''), header: flat((await snap(page, 'p01-loginas-landed')).text.header, 300)};
            const resp = await page.goto(app.url(`/index.php/index/en/admin/wizard/${st.idC}`)).catch(() => null);
            await idle(page).catch(() => {});
            const s = await snap(page, 'p02-loginas-wizard');
            R.wizard = {status: resp ? resp.status() : null, url: page.url().replace(/^https?:\/\/[^/]+/, ''), h1: flat(await page.locator('h1').first().innerText().catch(() => ''), 100), main: flat(s.text && s.text.main, 300)};
            await page.goto(app.url(`/index.php/${C}/en/management/settings/access`)); await idle(page); await sleep(800);
            await snap(page, 'p03-loginas-access');
            R.vueMenuAdmin = null;
            // log out as
            await page.goto(app.url('/index.php/index/en/login/signOutAsUser')).catch(() => {});
            await page.waitForLoadState('load').catch(() => {}); await sleep(800);
            R.after = {url: page.url().replace(/^https?:\/\/[^/]+/, ''), header: flat((await snap(page, 'p04-after-signoutas')).text.header, 300)};
        });

        // ── site: Bulk Emails both ends; Minimum password length ──────────────
        if (on('site')) await step('site', async (R) => {
            await signIn(page, 'admin');
            const tabsOf = async () => { await page.goto(app.url(`/index.php/${C}/en/management/settings/access`)); await idle(page); await sleep(500); return (await page.getByRole('tab').allInnerTexts()).map((x) => flat(x, 60)); };
            const openSite = async (sub) => {
                await page.goto(app.url('/index.php/index/en/admin/settings')); await idle(page);
                await page.locator('#setup-button').first().click().catch(() => {});
                await page.locator(`#${sub}-button`).first().click();
                await idle(page); await sleep(700);
            };
            await openSite('bulkEmails');
            const s0 = await snap(page, 's01-site-bulk');
            R.bulkPanel = flat(await page.locator('[role="tabpanel"]:visible').last().innerText().catch(() => ''), 1500);
            R.bulkTicked = await page.locator('[role="tabpanel"]:visible input[type=checkbox]:checked').evaluateAll((els) => els.map((e) => ((e.closest('label') || {}).innerText || '').trim()));
            R.tabsBefore = await tabsOf();
            await openSite('bulkEmails');
            const box = page.getByRole('checkbox', {name: `K3 Journal ${t}`.replace('Journal', isOjs ? 'Journal' : 'Journal')});
            R.boxCount = await box.count();
            const setBox = async (v) => {
                if (v) await box.check(); else await box.uncheck();
                const form = page.locator('form').filter({has: box}).last();
                await form.getByRole('button', {name: 'Save', exact: true}).click();
                await page.locator('[role="status"]').filter({hasText: 'Saved'}).first().waitFor({timeout: T}).catch(() => {});
                await sleep(600);
            };
            if (R.boxCount) {
                await setBox(true);
                await snap(page, 's02-site-bulk-ticked');
                R.tabsTicked = await tabsOf();
                await snap(page, 's03-access-notify');
                await openSite('bulkEmails');
                await setBox(false);
                R.tabsAfter = await tabsOf();
            }
            // Minimum password length
            await openSite('security');
            await snap(page, 's04-site-security');
            R.securityPanel = flat(await page.locator('[role="tabpanel"]:visible').last().innerText().catch(() => ''), 800);
            const min = page.getByRole('spinbutton', {name: /Minimum password length/}).or(page.getByRole('textbox', {name: /Minimum password length/})).first();
            R.minCount = await min.count();
            R.minDefault = await min.inputValue().catch(() => null);
            await loc(page, 'Site Settings › Security: "Minimum password length"', min);
            const saveMin = async (v) => {
                await min.fill(String(v));
                const form = page.locator('form').filter({has: min}).last();
                await form.getByRole('button', {name: 'Save', exact: true}).click();
                await page.locator('[role="status"]').filter({hasText: 'Saved'}).first().waitFor({timeout: T}).catch(() => {});
                await sleep(600);
            };
            if (R.minCount && R.minDefault) {
                try {
                    await saveMin(8);
                    await openSite('security');
                    R.minAfterSave = await min.inputValue().catch(() => null);
                    // Add User with 7 characters
                    const panel = await openWizardUsers(page, app, st.idC);
                    const form = await openAddUser(page, panel);
                    await fillStep1(form, {given: 'Min', family: 'Keight', username: U('m8'), email: E('m8'), password: 'abcd123'});
                    await pressOK(page, form);
                    R.add7 = {errors: (await formFacts(form)).errors, notices: await notices(page), step2: await page.locator('form#userRoleForm').isVisible().catch(() => false)};
                    await snap(page, 's05-add-7-at-8');
                    await fillStep1(form, {password: 'abcd1234'});
                    await pressOK(page, form);
                    R.add8 = {errors: (await formFacts(form)).errors, step2: await page.locator('form#userRoleForm').isVisible().catch(() => false)};
                    if (R.add8.step2) {
                        const rf = page.locator('form#userRoleForm').last();
                        await rf.getByRole('checkbox', {name: 'Reader', exact: true}).first().check();
                        await rf.getByRole('button', {name: 'Save', exact: true}).click(); await sleep(1500); await idle(page);
                    } else await cancelForm(page, form).catch(() => {});
                    // Edit User with 7
                    const p2 = await openWizardUsers(page, app, st.idC);
                    await rowLink(page, p2, E('au'), 'Edit User');
                    const ef = await formWindow(page); await sleep(800);
                    R.editHint = (await formFacts(ef)).descriptions;
                    await ef.locator('input[name="password"]').fill('abcd123'); await ef.locator('input[name="password2"]').fill('abcd123');
                    await pressOK(page, ef);
                    R.edit7 = {errors: (await formFacts(ef)).errors, notices: await notices(page), open: await ef.isVisible().catch(() => false)};
                    await snap(page, 's06-edit-7-at-8');
                    await cancelForm(page, ef).catch(() => {});
                } finally {
                    await openSite('security');
                    await saveMin(R.minDefault);
                    await openSite('security');
                    R.minRestored = await min.inputValue().catch(() => null);
                }
                // Edit User hint at 6
                const p3 = await openWizardUsers(page, app, st.idC);
                await rowLink(page, p3, E('au'), 'Edit User');
                const ef6 = await formWindow(page); await sleep(800);
                R.editHint6 = (await formFacts(ef6)).descriptions;
                await cancelForm(page, ef6).catch(() => {});
            }
        });

        // ── xfeat: cross-feature screen facts ─────────────────────────────────
        if (on('xfeat')) await step('xfeat', async (R) => {
            await signIn(page, U('mgr'), {contextPath: C});
            await page.goto(app.url(`/index.php/${C}/en/management/settings/access`)); await idle(page); await sleep(800);
            const s = await snap(page, 'x01-access-mgr');
            R.tabs = (await page.getByRole('tab').allInnerTexts()).map((x) => flat(x, 60));
            R.main = flat(s.text && s.text.main, 800);
            R.invite = await page.getByRole('button', {name: 'Invite to a role'}).count();
            R.invHeading = (await page.locator('main h2, main h3, main caption, main [role=heading]').allInnerTexts().catch(() => [])).map((x) => flat(x, 60)).slice(0, 10);
            // row "Edit" → roles page
            const row = page.getByRole('table', {name: /Current Users/}).getByRole('row').filter({hasText: E('au')}).first();
            await row.getByRole('button', {name: /options/i}).click();
            await page.getByRole('menuitem', {name: 'Edit', exact: true}).click();
            await page.waitForURL(/management\/settings\/user\/\d+/, {timeout: T}).catch(() => {});
            await idle(page); await sleep(1000);
            const se = await snap(page, 'x02-edit-roles-page');
            R.editUrl = page.url().replace(/^https?:\/\/[^/]+/, '');
            R.removeRole = await page.getByRole('button', {name: /Remove Role/}).count();
            R.editMain = flat(se.text && se.text.main, 600);
            // French: the whole session switches
            await page.goto(app.url(`/index.php/${C}/fr_CA/management/settings/access`)); await idle(page); await sleep(800);
            const sf = await snap(page, 'x03-access-fr');
            R.fr = {header: flat(sf.text && sf.text.header, 200), main: flat(sf.text && sf.text.main, 300)};
            await page.goto(app.url(`/index.php/${C}/dashboard/mySubmissions`)); await idle(page); await sleep(800);
            const sd = await snap(page, 'x04-dashboard-after-fr');
            R.frAfter = {url: page.url().replace(/^https?:\/\/[^/]+/, ''), header: flat(sd.text && sd.text.header, 200), main: flat(sd.text && sd.text.main, 200), lang: await page.locator('html').getAttribute('lang')};
            await page.goto(app.url(`/index.php/${C}/en/management/settings/access`)); await idle(page);
            await page.goto(app.url(`/index.php/${C}/dashboard/mySubmissions`)); await idle(page); await sleep(500);
            R.enAfter = {lang: await page.locator('html').getAttribute('lang')};
            // Statistics › Users
            await page.goto(app.url(`/index.php/${C}/en/stats/users/users`)); await idle(page); await sleep(800);
            const su = await snap(page, 'x05-stats-users');
            R.stats = {url: page.url().replace(/^https?:\/\/[^/]+/, ''), main: flat(su.text && su.text.main, 800), exportBtn: await page.getByRole('button', {name: 'Export'}).count()};
            // the "User Created" template on the Emails settings screen
            await page.goto(app.url(`/index.php/${C}/en/management/settings/manageEmails`)); await idle(page); await sleep(1000);
            const sm = await snap(page, 'x06-emails');
            R.emails = {url: page.url().replace(/^https?:\/\/[^/]+/, ''), userCreated: (sm.text && sm.text.main || '').includes('User Created'), sample: flat(sm.text && sm.text.main, 300)};
            if (!R.emails.userCreated) {
                const sb = page.getByRole('searchbox').or(page.getByRole('textbox', {name: /Search/})).first();
                if (await sb.count()) { await sb.fill('User Created'); await sb.press('Enter'); await idle(page); await sleep(800); }
                const sm2 = await snap(page, 'x07-emails-search');
                R.emails.search = flat(sm2.text && sm2.text.main, 600);
            }
            // reviewer search (OJS/OMP): Quinn got a reviewer role on the grid (add2)
            if (st.s2 && st.qn) {
                await page.goto(app.url(`/index.php/${C}/en/dashboard/editorial?workflowSubmissionId=${st.s2}&workflowMenuKey=workflow_3_1`)); await idle(page); await sleep(1500);
                const add = page.getByRole('button', {name: 'Add Reviewer', exact: true}).first();
                await add.waitFor({timeout: T}).catch(() => {});
                R.addReviewerBtn = await add.count();
                if (R.addReviewerBtn) {
                    await add.click();
                    const dlg = page.getByRole('dialog', {name: /Add Reviewer/i}).last();
                    await dlg.waitFor({timeout: 30000}).catch(() => {});
                    await page.waitForFunction(() => { const d = [...document.querySelectorAll('[role=dialog]')].pop(); return d && d.innerText.length > 100; }, null, {timeout: 15000}).catch(() => {});
                    await idle(page);
                    const sbx = dlg.getByRole('searchbox').or(dlg.getByRole('textbox', {name: /Search/})).first();
                    await sbx.fill('Kfullname'); await sbx.press('Enter'); await idle(page); await sleep(1200);
                    const sr = await snap(page, 'x08-reviewer-search');
                    R.reviewerSearch = flat(sr.text && sr.text.dialog, 800);
                }
            }
            await signOut(page);
        });
        // ── bulkread: which journals "Bulk Emails" has ticked (read only) ──────
        if (on('bulkread')) await step('bulkread', async (R) => {
            await signIn(page, 'admin');
            await page.goto(app.url('/index.php/index/en/admin/settings')); await idle(page);
            await page.locator('#setup-button').first().click().catch(() => {});
            await page.locator('#bulkEmails-button').first().click();
            await idle(page); await sleep(700);
            await snap(page, 'u01-site-bulk-read');
            R.boxes = await page.locator('[role="tabpanel"]:visible input[type=checkbox]').evaluateAll((els) => els.map((e) => {
                const l = (e.id && document.querySelector(`label[for="${CSS.escape(e.id)}"]`)) || e.closest('label') || e.parentElement;
                return {label: (l ? l.innerText : '').trim().slice(0, 80), checked: e.checked};
            }));
            R.ticked = R.boxes.filter((b) => b.checked).map((b) => b.label);
            R.total = R.boxes.length;
            R.publicknowledge = R.boxes.filter((b) => /Public Knowledge/.test(b.label));
            delete R.boxes;
        });
    } finally {
        record(factsName, {errors: F.errors, crashIndex: CRASH, dialogs: DIALOGS}, {merge: true});
        for (const x of OPEN) await x.close().catch(() => {});
        await close();
    }
});
