// U56 claim check, chunk K2: the "Manage Emails" page cluster.
// Purpose, Actors & permissions (spec lines 10–51); the page's fields (76–86); Rules 6–8 (the list,
// search, filters, 175–230); Rule 19 "Reset All" (313–320); Rule 21 (emails the list does not show,
// 329–338); the canonical preamble and Coverage (444–521); register A2, A3, A7, OPS2; Reference.
// Spec: docs/specs/U56-emails-management.md.
//
//   PROBE_FEATURE=U56 PROBE_AGENT=ccK2 node bin/probe.js all shared/playwright/checks/U56/K2/k2.js
//   PHASES=read,rows,levels,scratch,offs,pay,ops2   (default all; each phase seeds what it needs)
//
// read    publicknowledge as manager.maya (read only): the tab's link, the page, the list, search,
//         filters, forgetting on reload/leave, the ORCID rows, "Tasks and Discussions", the side menu.
// rows    publicknowledge as manager.maya (read only): every row's "Edit" opened and closed.
// levels  every permission level at both addresses; the offer per manager level; a manager-level
//         role without "Permit changes to Settings" (OJS, OMP scratch).
// scratch scratch context S (mgr, ed on OJS/OMP, admin): per manager level the tab's "Save", an edit,
//         "Add Template", "Reset", "Remove", "Reset All"; the full Reset All flow (note t) as mgr.
// offs    scratch context O: the tab's choices off → which rows leave the list.
// pay     OJS scratch with "Manual Fee Payment" (+ a reader's payment notice); OMP set up by hand.
// ops2    OPS scratch server with a submission: the decisions a manager is offered.
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, signOut, screen, shot, record, loc, note, idle, tag, outDir} =
    require('../../../probe');

const ALL = ['read', 'rows', 'levels', 'scratch', 'kept', 'offs', 'pay', 'ops2'];
const PHASES = process.env.PHASES ? process.env.PHASES.split(',') : ALL;
const on = (p) => PHASES.includes(p);
const log = (...a) => console.log(...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (s, n) => (s == null ? null : String(s).replace(/\s+/g, ' ').trim().slice(0, n || 400));
const SELECT_ALL = process.platform === 'darwin' ? 'Meta+A' : 'Control+A';

async function sect(name, fn) {
    try { await fn(); } catch (e) { log(`[${name} FAILED]`, String(e.stack || e).split('\n').slice(0, 4).join(' | ')); record(`${name.replace(/[^a-z0-9]+/gi, '-')}-FAILED`, {error: String(e.stack || e).slice(0, 1200)}); }
}
async function snap(page, name, extra) {
    let s;
    try { s = await screen(page); } catch (e) { s = {url: page.url(), error: String(e.message).slice(0, 200)}; }
    if (extra) s.extra = extra;
    record(name, s);
    await shot(page, name).catch(() => {});
    return s;
}
const visDialogs = (page) => page.locator('[role="dialog"]:visible, [role="alertdialog"]:visible');
const topWin = (page) => visDialogs(page).last();
const dialogTexts = (page) => page.locator('[role="dialog"]:visible, [role="alertdialog"]:visible').evaluateAll((els) =>
    els.map((d) => ({
        role: d.getAttribute('role'),
        name: d.getAttribute('aria-label') || (d.getAttribute('aria-labelledby') && document.getElementById(d.getAttribute('aria-labelledby'))?.innerText.trim()) || null,
        text: d.innerText.slice(0, 5000),
        buttons: [...d.querySelectorAll('button, a')].filter((b) => b.getClientRects().length).map((b) => ({t: (b.innerText || b.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 80), cls: String(b.className).slice(0, 120), color: getComputedStyle(b).color, bg: getComputedStyle(b).backgroundColor})).filter((b) => b.t).slice(0, 40),
        headings: [...d.querySelectorAll('h1,h2,h3,h4')].filter((h) => h.getClientRects().length).map((h) => h.innerText.trim()).filter(Boolean).slice(0, 20),
        rows: [...d.querySelectorAll('.listPanel__item')].map((r) => ({text: r.innerText.trim().replace(/\s+/g, ' ').slice(0, 200), buttons: [...r.querySelectorAll('button')].map((b) => b.innerText.trim()).filter(Boolean), badge: r.querySelector('.pkpBadge')?.innerText.trim() || null})),
        inputs: [...d.querySelectorAll('input, textarea')].filter((i) => i.type !== 'hidden').map((i) => ({name: i.name || i.id, value: String(i.value).slice(0, 200)})).slice(0, 20),
    }))).catch(() => []);
async function closeTop(page) {
    const top = topWin(page);
    if (!(await top.count())) return;
    const c = top.getByRole('button', {name: /^(Close|Cancel)\b/}).last();
    if (await c.count()) await c.click({timeout: 5000}).catch(() => {});
    else await page.keyboard.press('Escape').catch(() => {});
    await idle(page); await sleep(600);
}
async function closeAll(page) {
    for (let i = 0; i < 5 && (await visDialogs(page).count()) > 0; i++) await closeTop(page);
}

// ---- the Manage Emails page ------------------------------------------------------------------
const LP = '.manageEmails__listPanel';
async function landManage(app, page, ctx) {
    await page.goto(app.url(`/index.php/${ctx}/management/settings/manageEmails`)); await idle(page);
    await page.locator(`${LP} .listPanel__item`).first().waitFor({timeout: 30000}).catch(() => {});
    await idle(page);
}
const rowsOf = (page) => page.locator(LP).first().evaluate((lp) => {
    const items = [...lp.querySelectorAll('.listPanel__items > .listPanel__item, .listPanel__item')].filter((i) => !i.closest('[role=dialog]'));
    return items.map((i) => {
        const t = i.querySelector('.listPanel__itemTitle');
        const s = i.querySelector('.listPanel__itemSubtitle');
        const b = [...i.querySelectorAll('button')];
        return {name: t ? t.innerText.trim() : null, desc: s ? s.innerText.trim() : null, weight: t ? getComputedStyle(t).fontWeight : null,
            buttons: b.map((x) => ({text: x.innerText.trim().replace(/\s+/g, ' '), aria: x.getAttribute('aria-label')}))};
    });
}, null, {timeout: 8000});
const listText = (page) => page.locator(LP).first().evaluate((lp) => lp.innerText.slice(0, 20000));
const noItems = async (page) => /No items found\./.test(await page.locator(LP).first().innerText().catch(() => ''));
const filterState = (page) => page.locator(`${LP} .listPanel__sidebar, ${LP}`).first().evaluate((root) => {
    const sb = root.querySelector('.listPanel__sidebar') || root;
    const out = [];
    const walk = (el) => {
        for (const c of el.children) {
            if (/^H[1-4]$/.test(c.tagName)) out.push({heading: c.innerText.trim()});
            else if (c.classList.contains('pkpFilter')) {
                const l = c.querySelector('.pkpFilter__label');
                out.push({button: l.innerText.trim(), active: l.classList.contains('-isActive'), hasRemove: !!c.querySelector('.pkpFilter__remove'), removeLabel: c.querySelector('.pkpFilter__remove')?.innerText.trim() || null});
            } else walk(c);
        }
    };
    walk(sb);
    return out;
});
async function doSearch(page, text, {enter = true} = {}) {
    const box = page.locator(`${LP} input[type="search"]`).first();
    await box.click();
    await box.fill(text);
    if (enter) await box.press('Enter');
    await idle(page); await sleep(300);
}
async function clickFilter(page, label, nth = 0) {
    await page.locator(`${LP} .pkpFilter__label`).filter({hasText: new RegExp(`^\\s*${label.replace(/[()]/g, '\\$&')}\\s*$`)}).nth(nth).click();
    await idle(page); await sleep(200);
}
async function removeFilter(page, label, nth = 0) {
    await page.locator(`${LP} .pkpFilter`).filter({has: page.locator('.pkpFilter__label', {hasText: new RegExp(`^\\s*${label}\\s*$`)})}).nth(nth).locator('.pkpFilter__remove').click();
    await idle(page); await sleep(200);
}
// Open a row's "Edit" by its exact name (search first so the row is on screen).
async function openEmail(page, name) {
    await doSearch(page, name);
    const rows = await rowsOf(page);
    const idx = rows.findIndex((r) => r.name === name);
    if (idx < 0) return {present: false, rows: rows.map((r) => r.name)};
    const item = page.locator(`${LP} .listPanel__item`).nth(idx);
    await item.getByRole('button', {name: new RegExp('Edit')}).first().click();
    await waitDialog(page);
    const d = (await dialogTexts(page)).slice(-1)[0];
    return {present: true, kind: d && d.headings.includes('Templates') ? 'mailable' : 'template', dialog: d};
}
async function waitDialog(page, predicate) {
    await visDialogs(page).first().waitFor({timeout: 30000}).catch(() => {});
    await page.waitForFunction(() => {
        const d = [...document.querySelectorAll('[role=dialog],[role=alertdialog]')].filter((e) => e.getClientRects().length).pop();
        return d && (d.querySelector('.listPanel__item') || d.querySelector('input[name^="subject"]') || d.innerText.length > 120);
    }, null, {timeout: 20000}).catch(() => {});
    await idle(page); await sleep(400);
}
// In an open email window: press a row's button ("Edit", "Reset", "Remove") on the row whose name matches.
async function rowButton(page, rowName, btn) {
    const w = topWin(page);
    const row = w.locator('.listPanel__item').filter({hasText: rowName}).first();
    await row.getByRole('button', {name: btn, exact: true}).click();
    await idle(page); await sleep(400);
}
async function templateFields(page) {
    const w = topWin(page);
    await w.locator('input[name^="subject"]').first().waitFor({timeout: 20000}).catch(() => {});
    await page.waitForFunction(() => { const m = window.tinymce; return m && m.get().some((e) => e.initialized); }, null, {timeout: 20000}).catch(() => {});
    await sleep(300);
    const name = await w.locator('input[name^="name"]').first().inputValue().catch(() => null);
    const subject = await w.locator('input[name^="subject"]').first().inputValue().catch(() => null);
    const body = await page.evaluate(() => { const m = window.tinymce; const eds = m ? m.get().filter((e) => /body/i.test(e.id)) : []; return eds.length ? eds[eds.length - 1].getContent().slice(0, 500) : null; }).catch(() => null);
    const title = (await dialogTexts(page)).slice(-1)[0]?.name || null;
    return {title, name, subject, body};
}
async function fillTemplate(page, {name, subject, body}) {
    const w = topWin(page);
    if (name != null) await w.locator('input[name^="name"]').first().fill(name);
    if (subject != null) await w.locator('input[name^="subject"]').first().fill(subject);
    if (body != null) {
        const fr = w.frameLocator('iframe[id*="body"]').first().locator('body');
        await fr.click();
        await page.keyboard.press(SELECT_ALL); await page.keyboard.press('Delete');
        await fr.pressSequentially(body);
    }
}
// Save the top "Edit Template"; returns what the window said and whether it closed.
async function saveTemplate(page) {
    const before = await visDialogs(page).count();
    const w = topWin(page);
    const statuses = [];
    const poll = (async () => { for (let i = 0; i < 25; i++) { const s = await page.locator('[role="status"]').allInnerTexts().catch(() => []); for (const x of s) if (x.trim() && !statuses.includes(x.trim())) statuses.push(x.trim()); await sleep(120); } })();
    await w.getByRole('button', {name: 'Save', exact: true}).click();
    await poll;
    await idle(page); await sleep(800);
    const after = await visDialogs(page).count();
    const errors = await page.locator('.pkpFieldError:visible, .pkpFormError:visible').allInnerTexts().catch(() => []);
    return {statuses, closed: after < before, dialogsBefore: before, dialogsAfter: after, errors};
}
async function confirmDialog(page, {cancel = false} = {}) {
    await page.waitForFunction(() => [...document.querySelectorAll('[role=dialog],[role=alertdialog]')].some((d) => d.getClientRects().length && /\?/.test(d.innerText)), null, {timeout: 10000}).catch(() => {});
    await sleep(300);
    const d = (await dialogTexts(page)).slice(-1)[0];
    const w = topWin(page);
    if (cancel) await w.getByRole('button', {name: 'Cancel', exact: true}).click();
    else {
        const btns = w.getByRole('button').filter({hasNotText: /^\s*(Cancel|Close)\s*$/});
        const n = await btns.count();
        // the warnable action button: the last non-cancel button with text
        let target = null;
        for (let i = 0; i < n; i++) { const t = (await btns.nth(i).innerText().catch(() => '')).trim(); if (t) target = btns.nth(i); }
        if (target) await target.click();
    }
    await idle(page); await sleep(900);
    return d;
}

// ---- the "Emails" tab ------------------------------------------------------------------------
async function landTab(app, page, ctx) {
    await page.goto(app.url(`/index.php/${ctx}/management/settings/workflow`)); await idle(page);
    const tab = page.locator('#emails-button');
    if (await tab.count()) { await tab.click(); await idle(page); }
    await sleep(500);
}
const tabPanel = (page) => page.locator('#emails');
async function tabFieldLabels(page) {
    return tabPanel(page).evaluate((p) => ({
        groups: [...p.querySelectorAll('.pkpFormGroup__heading, legend, .pkpFormGroup h2, .pkpFormGroup h3')].map((e) => e.innerText.trim()).filter(Boolean),
        labels: [...p.querySelectorAll('.pkpFormFieldLabel, legend.pkpFormFieldLabel, label')].map((e) => e.innerText.trim().replace(/\s+/g, ' ')).filter(Boolean).slice(0, 80),
        buttons: [...p.querySelectorAll('button, a')].filter((b) => b.getClientRects().length).map((b) => (b.innerText || b.getAttribute('aria-label') || '').trim()).filter(Boolean),
        links: [...p.querySelectorAll('a')].map((a) => ({text: a.innerText.trim(), href: a.getAttribute('href')})),
    })).catch((e) => ({error: String(e.message).slice(0, 200)}));
}
async function saveTab(page) {
    const statuses = [];
    const poll = (async () => { for (let i = 0; i < 30; i++) { const s = await tabPanel(page).locator('[role="status"]').allInnerTexts().catch(() => []); for (const x of s) if (x.trim() && !statuses.includes(x.trim())) statuses.push(x.trim()); await sleep(120); } })();
    const resp = page.waitForResponse((r) => /\/api\/v1\/contexts\/\d+/.test(r.url()) && r.request().method() !== 'GET', {timeout: 15000}).catch(() => null);
    await tabPanel(page).getByRole('button', {name: 'Save', exact: true}).click();
    const r = await resp;
    await poll; await idle(page);
    return {statuses, status: r ? r.status() : null, method: r ? (r.request().headers()['x-http-method-override'] || r.request().method()) : null};
}
async function setSignature(page, text) {
    const fr = tabPanel(page).frameLocator('iframe[id*="emailSignature"]').first().locator('body');
    await page.waitForFunction(() => { const m = window.tinymce; return m && m.get().some((e) => /emailSignature/.test(e.id) && e.initialized); }, null, {timeout: 20000}).catch(() => {});
    await fr.click();
    await page.keyboard.press(SELECT_ALL); await page.keyboard.press('Delete');
    await fr.pressSequentially(text);
}
const readSignature = (page) => page.evaluate(() => { const m = window.tinymce; const e = m && m.get().find((x) => /emailSignature/.test(x.id)); return e ? e.getContent() : null; }).catch(() => null);

// ---- landing a page as a role ------------------------------------------------------------------
async function landing(page, url) {
    const resp = await page.goto(url).catch((e) => ({error: String(e.message)}));
    await idle(page).catch(() => {});
    const h1 = await page.locator('h1').first().innerText().catch(() => null);
    const body = flat(await page.locator('body').innerText().catch(() => ''), 400);
    return {finalUrl: page.url(), status: resp && resp.status ? resp.status() : resp, h1, body,
        loginForm: await page.locator('input[name="username"], #username').count(),
        denied: /does not have access|not authori[sz]ed|access denied|You don't have access/i.test(body || '')};
}

const OPS_MULTI = 'Submission Declined';

forEachApp(async (app) => {
    const isOPS = app.name === 'ops';
    const isOJS = app.name === 'ojs';
    const PK = app.contextPath;
    const {page, context, close} = await launch(app);
    const dialogLog = [];
    page.on('dialog', async (d) => { dialogLog.push({type: d.type(), message: d.message(), url: page.url()}); await d.accept().catch(() => {}); });
    const facts = {};
    const fact = (k, v) => { facts[k] = v; record('facts', {[k]: v}, {merge: true}); };
    const MULTI = isOPS ? OPS_MULTI : 'Review Request';
    const ONE = isOPS ? 'Submission Acknowledgement (Pending Moderation)' : 'Submission Confirmation';
    try {
        // ====================================================================== read
        if (on('read')) await sect('read', async () => {
            const out = {};
            await signIn(page, 'manager.maya');
            // the tab and its link
            await landTab(app, page, PK);
            await snap(page, 'r01-tab');
            out.tab = await tabFieldLabels(page);
            await loc(page, 'Emails tab: the "Add and edit templates" link', tabPanel(page).getByRole('link', {name: 'Add and edit templates'}));
            // the side menu: any "Manage Emails" / "Emails" entry?
            out.sideMenu = await page.locator('nav, .app__nav, [class*="navigation"]').first().evaluate((n) => n.innerText.split('\n').map((x) => x.trim()).filter(Boolean)).catch(() => null);
            out.sideMenuHrefs = await page.locator('a[href*="manageEmails"]').evaluateAll((as) => as.map((a) => ({text: a.innerText.trim(), href: a.getAttribute('href'), inTab: !!a.closest('#emails')}))).catch(() => null);
            // the other workflow tabs' names
            out.workflowTabs = await page.getByRole('tab').allInnerTexts().catch(() => null);
            // follow the link
            await Promise.all([page.waitForURL(/manageEmails/, {timeout: 20000}).catch(() => {}), tabPanel(page).getByRole('link', {name: 'Add and edit templates'}).click()]);
            await idle(page);
            await page.locator(`${LP} .listPanel__item`).first().waitFor({timeout: 30000}).catch(() => {});
            out.linkLandsOn = page.url().replace(app.baseURL, '');
            const s0 = await snap(page, 'r02-manage-emails');
            out.h1 = await page.locator('main h1').allInnerTexts().catch(() => null);
            out.headings = await page.locator('main').evaluate((m) => [...m.querySelectorAll('h1,h2,h3')].map((h) => `${h.tagName}:${h.innerText.trim()}`)).catch(() => null);
            out.searchBox = await page.locator(`${LP} input[type="search"]`).evaluate((i) => ({placeholder: i.placeholder, aria: i.getAttribute('aria-label'), label: i.id && document.querySelector(`label[for="${i.id}"]`)?.innerText.trim()})).catch(() => null);
            const ra = page.getByRole('button', {name: 'Reset All', exact: true});
            out.resetAll = await ra.evaluate((b) => ({text: b.innerText.trim(), cls: b.className, color: getComputedStyle(b).color, bg: getComputedStyle(b).backgroundColor, border: getComputedStyle(b).borderColor, nextToSearch: !!b.closest('.pkpHeader__actions')?.querySelector('input[type=search]')})).catch((e) => ({error: String(e.message).slice(0, 100)}));
            await loc(page, 'Manage Emails: search box', page.locator(`${LP} input[type="search"]`));
            await loc(page, 'Manage Emails: Reset All', ra);
            await loc(page, 'Manage Emails: a row', page.locator(`${LP} .listPanel__item`));
            await loc(page, 'Manage Emails: filter buttons', page.locator(`${LP} .pkpFilter__label`));
            // the list
            const rows = await rowsOf(page);
            out.count = rows.length;
            out.names = rows.map((r) => r.name);
            out.noDesc = rows.filter((r) => !r.desc).map((r) => r.name);
            out.weights = [...new Set(rows.map((r) => r.weight))];
            out.editButtons = rows.filter((r) => !r.buttons.some((b) => /Edit/.test(b.text))).map((r) => r.name);
            out.editAccessibleSample = rows.slice(0, 2).map((r) => r.buttons);
            out.rowsFull = rows.map((r) => ({name: r.name, desc: r.desc}));
            out.sortedCodepoint = JSON.stringify(out.names) === JSON.stringify([...out.names].sort());
            out.sortedLocale = JSON.stringify(out.names) === JSON.stringify([...out.names].sort((a, b) => a.localeCompare(b)));
            out.pagination = await page.locator(`${LP} .pkpPagination, ${LP} nav`).count();
            out.filters = await filterState(page);
            fact('read', out);
            log(`[read] ${app.name} rows=${out.count}`);

            // ---- search (Rule 7)
            const S = {};
            await page.locator(`${LP} input[type="search"]`).fill('Change Email'); await sleep(1200);
            S.typedNoEnter = (await rowsOf(page)).length;
            await snap(page, 'r03-search-typed-no-enter');
            await page.locator(`${LP} input[type="search"]`).press('Enter'); await idle(page); await sleep(300);
            S.changeEmail = (await rowsOf(page)).map((r) => r.name); S.changeEmailNoItems = await noItems(page);
            await snap(page, 'r04-search-change-email');
            for (const q of ['review request', 'REVIEW REQUEST', 'request review', 'Review  Request', 'ORCID', 'Invitation', 'reviewer', 'zzqqxx nothing']) {
                await doSearch(page, q);
                const r = await rowsOf(page);
                S[q] = {count: r.length, names: r.map((x) => x.name), noItems: await noItems(page), byDescOnly: r.filter((x) => !x.name.toLowerCase().includes(q.toLowerCase())).map((x) => x.name)};
            }
            await doSearch(page, 'zzqqxx nothing');
            await snap(page, 'r05-search-no-items');
            S.noItemsText = flat(await listText(page), 300);
            // the × button
            const clear = page.locator(LP).getByRole('button', {name: /Clear search/});
            S.clearButton = {count: await clear.count(), aria: await clear.first().getAttribute('aria-label').catch(() => null), text: await clear.first().innerText().catch(() => null)};
            await loc(page, 'Manage Emails: the search box clear button', clear);
            if (S.clearButton.count) { await clear.first().click(); await idle(page); await sleep(300); }
            S.afterClear = {count: (await rowsOf(page)).length, box: await page.locator(`${LP} input[type="search"]`).inputValue()};
            await snap(page, 'r06-search-cleared');
            // Enter on an empty box
            await doSearch(page, 'review request');
            S.beforeEmptyEnter = (await rowsOf(page)).length;
            await doSearch(page, '');
            S.emptyEnter = (await rowsOf(page)).length;
            // backspace to empty without Enter
            await doSearch(page, 'review request');
            await page.locator(`${LP} input[type="search"]`).fill(''); await sleep(1000);
            S.emptiedNoEnter = (await rowsOf(page)).length;
            await doSearch(page, '');
            fact('search', S);

            // ---- filters (Rule 8)
            const F = {};
            const all = await filterState(page);
            const buttons = all.filter((x) => x.button).map((x) => x.button);
            // each button alone
            F.single = {};
            const btnSeen = {};
            for (const b of buttons) {
                const nth = btnSeen[b] = (btnSeen[b] === undefined ? 0 : btnSeen[b] + 1);
                await clickFilter(page, b, nth);
                const r = await rowsOf(page);
                F.single[`${b}#${nth}`] = {count: r.length, names: r.map((x) => x.name), state: (await filterState(page)).filter((x) => x.active).map((x) => x.button)};
                await clickFilter(page, b, nth); // press again: unmark
                F.single[`${b}#${nth}`].afterRepress = {count: (await rowsOf(page)).length, active: (await filterState(page)).filter((x) => x.active).length};
            }
            // Submission + Review (A3)
            await clickFilter(page, 'Submission');
            F.submission = (await rowsOf(page)).map((r) => r.name);
            await snap(page, 'r07-filter-submission');
            if (buttons.includes('Review')) {
                await clickFilter(page, 'Review');
                F.submissionReview = (await rowsOf(page)).map((r) => r.name);
                F.submissionReviewNoItems = await noItems(page);
                await snap(page, 'r08-filter-submission-review');
                F.stateTwo = await filterState(page);
                await removeFilter(page, 'Review');
                F.afterRemoveReview = {count: (await rowsOf(page)).length, active: (await filterState(page)).filter((x) => x.active).map((x) => x.button)};
            } else {
                await clickFilter(page, 'Production');
                F.submissionProduction = (await rowsOf(page)).map((r) => r.name);
                F.submissionProductionNoItems = await noItems(page);
                await snap(page, 'r08-filter-submission-production');
                await removeFilter(page, 'Production');
            }
            await removeFilter(page, 'Submission');
            F.afterRemoveAll = {count: (await rowsOf(page)).length, active: (await filterState(page)).filter((x) => x.active).length};
            // Sent To Author + Reviewer (or Moderator on OPS): the "Sent To" block is the second occurrence of the shared names
            const toIdx = (label) => { let seen = -1; let inTo = false; let fromSeen = 0; for (const x of all) { if (x.heading === 'Sent To') inTo = true; if (x.button === label) { seen++; if (inTo) return seen; } } return 0; };
            const secondTo = isOPS ? 'Moderator' : 'Reviewer';
            await clickFilter(page, 'Author', toIdx('Author'));
            F.toAuthor = (await rowsOf(page)).map((r) => r.name);
            await clickFilter(page, secondTo, toIdx(secondTo));
            F.toAuthorAndSecond = (await rowsOf(page)).map((r) => r.name);
            F.toAuthorAndSecondNoItems = await noItems(page);
            await snap(page, 'r09-filter-to-author-second');
            await clickFilter(page, 'Author', toIdx('Author'));
            await clickFilter(page, secondTo, toIdx(secondTo));
            // search + filter together
            await clickFilter(page, 'Submission');
            await doSearch(page, 'author');
            F.searchPlusFilter = (await rowsOf(page)).map((r) => r.name);
            await snap(page, 'r10-filter-plus-search');
            // reload: forgotten?
            await page.reload(); await idle(page); await page.locator(`${LP} .listPanel__item`).first().waitFor({timeout: 30000}).catch(() => {});
            F.afterReload = {count: (await rowsOf(page)).length, box: await page.locator(`${LP} input[type="search"]`).inputValue(), active: (await filterState(page)).filter((x) => x.active).map((x) => x.button)};
            await snap(page, 'r11-after-reload');
            // leave and come back through the tab's link
            await clickFilter(page, 'Submission');
            await doSearch(page, 'author');
            await landTab(app, page, PK);
            await Promise.all([page.waitForURL(/manageEmails/, {timeout: 20000}).catch(() => {}), tabPanel(page).getByRole('link', {name: 'Add and edit templates'}).click()]);
            await idle(page); await page.locator(`${LP} .listPanel__item`).first().waitFor({timeout: 30000}).catch(() => {});
            F.afterLeave = {count: (await rowsOf(page)).length, box: await page.locator(`${LP} input[type="search"]`).inputValue(), active: (await filterState(page)).filter((x) => x.active).map((x) => x.button)};
            // browser Back from the tab
            await clickFilter(page, 'Submission');
            await doSearch(page, 'author');
            await landTab(app, page, PK);
            for (let i = 0; i < 4 && !/manageEmails/.test(page.url()); i++) { await page.goBack().catch(() => {}); await sleep(500); }
            await idle(page); await page.locator(`${LP} .listPanel__item`).first().waitFor({timeout: 15000}).catch(() => {});
            F.afterBack = {url: page.url().replace(app.baseURL, ''), count: (await rowsOf(page).catch(() => [])).length, box: await page.locator(`${LP} input[type="search"]`).inputValue().catch(() => null), active: (await filterState(page)).filter((x) => x.active).map((x) => x.button)};
            fact('filters', F);

            // ---- ORCID rows (A2) and the template names they carry; OPS: Submission Accepted (OPS2)
            await landManage(app, page, PK);
            const O = {};
            const targets = isOPS ? ['Submission Accepted'] : ['orcidCollectAuthorId', 'orcidRequestAuthorAuthorization', 'orcidRequestUpdateScope'];
            for (const n of targets) {
                const r = await openEmail(page, n);
                const e = {present: r.present, kind: r.kind, title: r.dialog && r.dialog.name, headings: r.dialog && r.dialog.headings, rows: r.dialog && r.dialog.rows, buttons: r.dialog && r.dialog.buttons.map((b) => b.t)};
                if (r.present && r.kind === 'template') e.fields = await templateFields(page);
                if (r.present && r.kind === 'mailable' && r.dialog.rows.length) {
                    await snap(page, `r12-open-${n.replace(/[^a-z0-9]+/gi, '-')}`);
                    await rowButton(page, r.dialog.rows[0].text.split(' ')[0], 'Edit').catch(() => {});
                    const w = topWin(page);
                    if (await w.locator('input[name^="subject"]').count()) e.fields = await templateFields(page);
                } else await snap(page, `r12-open-${n.replace(/[^a-z0-9]+/gi, '-')}`);
                await closeAll(page);
                O[n] = e;
            }
            fact('orcidOps2', O);

            // ---- Rule 21: discussion templates; Tasks and Discussions tab
            await landManage(app, page, PK);
            const D = {};
            for (const q of ['Request Copyedit', 'Ready for Production', 'Copyedit', 'Manual', 'payment']) { await doSearch(page, q); D[q] = (await rowsOf(page)).map((r) => r.name); }
            await landTab(app, page, PK);
            const tdTab = page.getByRole('tab', {name: /Tasks and Discussions/});
            D.tdTab = await tdTab.count();
            if (D.tdTab) {
                await tdTab.first().click(); await idle(page); await sleep(800);
                const s = await snap(page, 'r13-tasks-and-discussions');
                const panelText = await page.locator('[role="tabpanel"]:visible').last().innerText().catch(() => '');
                D.tdHasRequestCopyedit = /Request Copyedit/.test(panelText);
                D.tdHasReadyForProduction = /Ready for Production/.test(panelText);
                D.tdText = flat(panelText, 1500);
            }
            fact('rule21', D);
        });

        // ====================================================================== rows
        if (on('rows')) await sect('rows', async () => {
            await signIn(page, 'manager.maya');
            await landManage(app, page, PK);
            const rows = await rowsOf(page);
            const res = [];
            const only = process.env.ROWS_ONLY ? process.env.ROWS_ONLY.split('|') : null;
            for (let i = 0; i < rows.length; i++) {
                const item = page.locator(`${LP} .listPanel__item`).nth(i);
                const nm = rows[i].name;
                if (only && !only.includes(nm)) continue;
                const t0 = Date.now();
                try {
                    await item.getByRole('button', {name: /Edit/}).first().click({timeout: 10000});
                    await waitDialog(page);
                    const d = (await dialogTexts(page)).slice(-1)[0];
                    const kind = d && d.headings.includes('Templates') ? 'mailable' : (d && /Edit Template/.test(d.name || '') ? 'template' : 'other');
                    const e = {name: nm, kind, title: d && d.name, templates: d && d.rows.map((r) => ({text: r.text, buttons: r.buttons, badge: r.badge})), addTemplate: !!(d && d.buttons.some((b) => b.t === 'Add Template')), ms: Date.now() - t0};
                    if (kind === 'template') e.fields = await templateFields(page);
                    if (kind === 'other') {
                        const s = await snap(page, `w00-row-other-${nm.replace(/[^a-z0-9]+/gi, '-')}`);
                        e.screenText = flat(s.text && s.text.main, 600);
                        e.spinner = await page.locator('[class*="spinner"]:visible, [class*="Spinner"]:visible, [class*="loading"]:visible').count();
                        e.notices = await page.locator('[role="alert"]:visible, .pkpNotification:visible, [class*="toast"]:visible, [class*="Toast"]:visible').allInnerTexts().catch(() => []);
                        e.clickable = await page.locator(`${LP} .listPanel__item`).nth(Math.min(i + 1, rows.length - 1)).getByRole('button', {name: /Edit/}).first().click({trial: true, timeout: 3000}).then(() => true).catch((x) => flat(String(x.message), 160));
                    }
                    res.push(e);
                } catch (err) { res.push({name: nm, error: flat(String(err.message), 200)}); }
                await closeAll(page);
                if ((await visDialogs(page).count()) || res[res.length - 1].kind === 'other' || res[res.length - 1].error) { await landManage(app, page, PK); }
            }
            record('rows-edit', res);
            const multi = res.filter((r) => r.kind === 'mailable').map((r) => r.name);
            const one = res.filter((r) => r.kind === 'template').map((r) => r.name);
            fact('rowsSummary', {total: res.length, multi: multi.length, one: one.length, other: res.filter((r) => r.kind !== 'mailable' && r.kind !== 'template').map((r) => r.name), multiNames: multi});
            await landManage(app, page, PK);
            await openEmail(page, MULTI);
            await snap(page, 'w01-multi-window');
            await closeAll(page);
            await openEmail(page, ONE);
            await snap(page, 'w02-one-template-window');
            await closeAll(page);
            log(`[rows] ${app.name} multi=${multi.length} one=${one.length}`);
        });

        // ====================================================================== levels
        if (on('levels')) await sect('levels', async () => {
            const out = {};
            const W = app.url(`/index.php/${PK}/management/settings/workflow`);
            const M = app.url(`/index.php/${PK}/management/settings/manageEmails`);
            // signed out
            await signOut(page).catch(() => {});
            out.signedOut = {workflow: await landing(page, W), manage: await landing(page, M)};
            await snap(page, 'l01-signed-out-manage');
            const users = isOPS ? ['sectioneditor.ana', 'assistant.rita', 'author.alex', 'reader.rosa'] :
                ['sectioneditor.ana', 'reviewer.julia', 'copyeditor.carla', 'assistant.rita', 'author.alex', 'reader.rosa'];
            for (const u of users) {
                await signIn(page, u);
                out[u] = {workflow: await landing(page, W), manage: await landing(page, M)};
                if (u === 'sectioneditor.ana') await snap(page, 'l02-section-editor-manage');
                if (u === 'reader.rosa') await snap(page, 'l03-reader-manage');
            }
            // the managers' offer
            const mgrs = isOPS ? ['admin', 'manager.maya'] : ['admin', 'manager.maya', 'editor.diana'];
            out.offer = {};
            for (const u of mgrs) {
                await signIn(page, u);
                const o = {};
                await landTab(app, page, PK);
                o.tab = await tabFieldLabels(page);
                await snap(page, `l04-${u.replace('.', '-')}-tab`);
                await landManage(app, page, PK);
                await snap(page, `l05-${u.replace('.', '-')}-manage`);
                o.rows = (await rowsOf(page)).length;
                o.names = (await rowsOf(page)).map((r) => r.name).join('|').length;
                o.filters = (await filterState(page)).map((x) => x.heading || x.button).join('|');
                o.headerButtons = await page.locator(`${LP} .pkpHeader`).first().getByRole('button').allInnerTexts().catch(() => null);
                const m = await openEmail(page, MULTI);
                o.multi = m.dialog && {buttons: m.dialog.buttons.map((b) => b.t), rows: m.dialog.rows};
                await closeAll(page);
                await landManage(app, page, PK);
                const one = await openEmail(page, ONE);
                o.one = one.dialog && {title: one.dialog.name, buttons: one.dialog.buttons.map((b) => b.t)};
                await closeAll(page);
                out.offer[u] = o;
            }
            // a manager-level role without "Permit changes to Settings" (OJS, OMP)
            if (!isOPS) {
                const t = tag('u56k2p');
                const r = await app.api.createContext({tag: t, roles: {editor: {permitSettings: false}}, users: [{username: `${t}ed`, roles: ['editor']}, {username: `${t}mg`, roles: ['manager']}]});
                const P = r.path || t;
                await signIn(page, `${t}ed`);
                out.noPermit = {workflow: await landing(page, app.url(`/index.php/${P}/management/settings/workflow`)), manage: await landing(page, app.url(`/index.php/${P}/management/settings/manageEmails`))};
                await snap(page, 'l06-no-permit-editor-manage');
                await signIn(page, `${t}mg`);
                out.noPermitControl = {manage: await landing(page, app.url(`/index.php/${P}/management/settings/manageEmails`))};
                out.noPermitControl.rows = (await rowsOf(page).catch(() => [])).length;
            }
            fact('levels', out);
        });

        // ====================================================================== scratch
        if (on('scratch')) await sect('scratch', async () => {
            const out = {};
            const t = tag('u56k2s');
            const users = [{username: `${t}mgr`, roles: ['manager']}];
            if (!isOPS) users.push({username: `${t}ed`, roles: ['editor']});
            const r = await app.api.createContext({tag: t, context: {contactEmail: `${t}pc@mail.test`, contactName: 'K2 Contact'}, users});
            const S = r.path || t;
            out.ctx = S;
            // the seeded journal's default of MULTI (read only), for "kept to this journal"
            await signIn(page, 'manager.maya');
            await landManage(app, page, PK);
            let m = await openEmail(page, MULTI);
            await rowButton(page, m.dialog.rows[0].text.split('  ')[0].slice(0, 12), 'Edit');
            out.pkDefault = await templateFields(page);
            await closeAll(page);

            const levels = isOPS ? [`${t}mgr`, 'admin'] : [`${t}mgr`, `${t}ed`, 'admin'];
            out.levels = {};
            for (const u of levels) {
                const L = {};
                const lab = u === 'admin' ? 'admin' : u.replace(t, '');
                await signIn(page, u);
                // line 44: the tab's Save
                await landTab(app, page, S);
                L.tabSave = await saveTab(page);
                // Edit the default of MULTI
                await landManage(app, page, S);
                m = await openEmail(page, MULTI);
                L.window = {title: m.dialog && m.dialog.name, rows: m.dialog && m.dialog.rows, buttons: m.dialog && m.dialog.buttons.map((b) => b.t)};
                const defName = m.dialog.rows[0].text.replace(/\s*(Default|Edit|Reset|Remove)\b.*$/, '').trim();
                L.defaultRowName = defName;
                await rowButton(page, defName, 'Edit');
                L.before = await templateFields(page);
                await fillTemplate(page, {name: `${lab} K2 renamed`, subject: `u56k2 ${lab} edited subject`});
                L.save = await saveTemplate(page);
                L.afterSaveWindow = (await dialogTexts(page)).map((d) => ({name: d.name, rows: d.rows}));
                await snap(page, `s01-${lab}-edited`);
                await closeAll(page);
                // reload read
                await landManage(app, page, S);
                m = await openEmail(page, MULTI);
                L.afterReloadRows = m.dialog && m.dialog.rows;
                await rowButton(page, `${lab} K2 renamed`, 'Edit').catch(() => {});
                L.afterReloadFields = await templateFields(page);
                await closeTop(page);
                // Add Template
                await topWin(page).getByRole('button', {name: 'Add Template', exact: true}).click(); await idle(page);
                await waitDialog(page);
                L.addWindow = await templateFields(page);
                await snap(page, `s02-${lab}-add-window`);
                await fillTemplate(page, {name: `u56k2 ${lab} added`, subject: `u56k2 ${lab} added subject`, body: `Added by ${lab} for K2.`});
                L.addSave = await saveTemplate(page);
                L.afterAdd = (await dialogTexts(page)).map((d) => ({name: d.name, rows: d.rows}));
                await snap(page, `s03-${lab}-added`);
                await closeAll(page);
                await landManage(app, page, S);
                m = await openEmail(page, MULTI);
                L.afterAddReloadRows = m.dialog && m.dialog.rows;
                // Reset the edited default
                await rowButton(page, `${lab} K2 renamed`, 'Reset').catch((e) => { L.resetErr = String(e.message).slice(0, 120); });
                L.resetConfirm = await confirmDialog(page);
                await sleep(500);
                L.afterReset = (await dialogTexts(page)).map((d) => ({name: d.name, rows: d.rows}));
                await snap(page, `s04-${lab}-after-reset`);
                // reopen the default and read
                const rowsNow = (await dialogTexts(page)).slice(-1)[0]?.rows || [];
                const defNow = (rowsNow.find((x) => x.badge) || rowsNow[0] || {}).text || '';
                await rowButton(page, defNow.replace(/\s*(Default|Edit|Reset|Remove)\b.*$/, '').trim().slice(0, 20), 'Edit').catch(() => {});
                L.afterResetFields = await templateFields(page);
                await closeTop(page);
                // Remove the added one
                await rowButton(page, `u56k2 ${lab} added`, 'Remove').catch((e) => { L.removeErr = String(e.message).slice(0, 120); });
                L.removeConfirm = await confirmDialog(page);
                L.afterRemove = (await dialogTexts(page)).map((d) => ({name: d.name, rows: d.rows}));
                await closeAll(page);
                await landManage(app, page, S);
                m = await openEmail(page, MULTI);
                L.afterRemoveReloadRows = m.dialog && m.dialog.rows;
                await closeAll(page);
                // a one-template email: edit subject, save
                await landManage(app, page, S);
                const one = await openEmail(page, ONE);
                L.oneWindow = one.dialog && {title: one.dialog.name, buttons: one.dialog.buttons.map((b) => b.t)};
                L.oneBefore = await templateFields(page);
                await fillTemplate(page, {subject: `u56k2 ${lab} one subject`});
                L.oneSave = await saveTemplate(page);
                await closeAll(page);
                await landManage(app, page, S);
                await openEmail(page, ONE);
                L.oneAfterReload = await templateFields(page);
                await closeAll(page);
                // Reset All (confirm) by this level
                await landManage(app, page, S);
                await page.getByRole('button', {name: 'Reset All', exact: true}).click();
                const nav = page.waitForNavigation({timeout: 15000}).catch(() => null);
                L.resetAllConfirm = await confirmDialog(page);
                L.reloaded = !!(await nav);
                await idle(page); await page.locator(`${LP} .listPanel__item`).first().waitFor({timeout: 30000}).catch(() => {});
                await openEmail(page, ONE);
                L.oneAfterResetAll = await templateFields(page);
                await closeAll(page);
                out.levels[lab] = L;
                log(`[scratch] ${app.name} ${lab} done`);
            }

            // ---- the full Reset All flow (note t) as mgr
            const R = {};
            await signIn(page, `${t}mgr`);
            await landManage(app, page, S);
            m = await openEmail(page, MULTI);
            const defName = m.dialog.rows[0].text.replace(/\s*(Default|Edit|Reset|Remove)\b.*$/, '').trim();
            await rowButton(page, defName, 'Edit');
            R.multiInstalled = await templateFields(page);
            await fillTemplate(page, {subject: 'u56k2 RA edited default'});
            R.save1 = await saveTemplate(page);
            await closeAll(page);
            await landManage(app, page, S);
            m = await openEmail(page, MULTI);
            await topWin(page).getByRole('button', {name: 'Add Template', exact: true}).click(); await idle(page); await waitDialog(page);
            await fillTemplate(page, {name: 'u56k2 RA added', subject: 'u56k2 RA added subject', body: 'RA added body.'});
            R.save2 = await saveTemplate(page);
            await closeAll(page);
            await landManage(app, page, S);
            await openEmail(page, ONE);
            R.oneInstalled = await templateFields(page);
            await fillTemplate(page, {subject: 'u56k2 RA one edited'});
            R.save3 = await saveTemplate(page);
            await closeAll(page);
            await landTab(app, page, S);
            R.sigBefore = await readSignature(page);
            await setSignature(page, 'u56k2 RA signature');
            R.sigSave = await saveTab(page);
            await page.reload(); await idle(page); await landTab(app, page, S);
            R.sigAfterSave = await readSignature(page);
            R.tabChoices = await tabPanel(page).locator('input[type=radio]:checked').evaluateAll((els) => els.map((e) => `${e.name}=${e.value}`));
            // Reset All → Cancel
            await landManage(app, page, S);
            R.countBefore = (await rowsOf(page)).length;
            await page.getByRole('button', {name: 'Reset All', exact: true}).click();
            R.confirm = await confirmDialog(page, {cancel: true});
            await snap(page, 's05-reset-all-cancelled');
            await page.getByRole('button', {name: 'Reset All', exact: true}).click();
            await page.waitForFunction(() => [...document.querySelectorAll('[role=dialog],[role=alertdialog]')].some((d) => d.getClientRects().length && /\?/.test(d.innerText)), null, {timeout: 10000}).catch(() => {});
            await snap(page, 's06-reset-all-confirmation');
            await topWin(page).getByRole('button', {name: 'Cancel', exact: true}).click(); await idle(page); await sleep(700);
            await page.reload(); await idle(page); await page.locator(`${LP} .listPanel__item`).first().waitFor({timeout: 30000}).catch(() => {});
            m = await openEmail(page, MULTI);
            R.afterCancelRows = m.dialog && m.dialog.rows;
            await rowButton(page, (m.dialog.rows.find((x) => x.badge) || m.dialog.rows[0]).text.replace(/\s*(Default|Edit|Reset|Remove)\b.*$/, '').trim().slice(0, 20), 'Edit').catch(() => {});
            R.afterCancelMulti = await templateFields(page);
            await closeAll(page);
            await landManage(app, page, S);
            await openEmail(page, ONE);
            R.afterCancelOne = await templateFields(page);
            await closeAll(page);
            // Reset All → confirm
            await landManage(app, page, S);
            await page.getByRole('button', {name: 'Reset All', exact: true}).click();
            const nav = page.waitForNavigation({timeout: 15000}).catch(() => null);
            R.confirm2 = await confirmDialog(page);
            R.reloaded = !!(await nav);
            await idle(page); await page.locator(`${LP} .listPanel__item`).first().waitFor({timeout: 30000}).catch(() => {});
            await snap(page, 's07-after-reset-all');
            R.countAfter = (await rowsOf(page)).length;
            m = await openEmail(page, MULTI);
            R.afterRows = m.dialog && m.dialog.rows;
            await rowButton(page, (m.dialog.rows.find((x) => x.badge) || m.dialog.rows[0]).text.replace(/\s*(Default|Edit|Reset|Remove)\b.*$/, '').trim().slice(0, 20), 'Edit').catch(() => {});
            R.afterMulti = await templateFields(page);
            await closeAll(page);
            await landManage(app, page, S);
            await openEmail(page, ONE);
            R.afterOne = await templateFields(page);
            await closeAll(page);
            await landTab(app, page, S);
            R.sigAfter = await readSignature(page);
            R.tabChoicesAfter = await tabPanel(page).locator('input[type=radio]:checked').evaluateAll((els) => els.map((e) => `${e.name}=${e.value}`));
            out.resetAll = R;

            // ---- leaving the page with an unsaved change in "Edit Template"
            const U = {};
            await landManage(app, page, S);
            await openEmail(page, ONE);
            await fillTemplate(page, {subject: 'u56k2 unsaved'});
            const dl0 = dialogLog.length;
            await page.locator(`${LP} input[type="search"]`).evaluate(() => {}).catch(() => {});
            await landTab(app, page, S);
            U.dialogsOnLeave = dialogLog.slice(dl0);
            U.landedOn = page.url().replace(app.baseURL, '');
            await landManage(app, page, S);
            await openEmail(page, ONE);
            U.reopened = await templateFields(page);
            await closeAll(page);
            out.leave = U;
            fact('scratch', out);
        });

        // ====================================================================== kept (note l: an edit stays on its journal)
        if (on('kept')) await sect('kept', async () => {
            const out = {};
            const t = tag('u56k2k');
            const r = await app.api.createContext({tag: t, users: [{username: `${t}mgr`, roles: ['manager']}]});
            const K = r.path || t;
            await signIn(page, `${t}mgr`);
            await landManage(app, page, K);
            let m = await openEmail(page, MULTI);
            await rowButton(page, MULTI, 'Edit');
            await fillTemplate(page, {subject: 'u56k2 kept edited subject'});
            out.save = await saveTemplate(page);
            await closeAll(page);
            await landManage(app, page, K);
            m = await openEmail(page, MULTI);
            await rowButton(page, MULTI, 'Edit');
            out.scratchAfterReload = (await templateFields(page)).subject;
            await closeAll(page);
            await signIn(page, 'manager.maya');
            await landManage(app, page, PK);
            m = await openEmail(page, MULTI);
            await rowButton(page, MULTI, 'Edit');
            out.seededSubject = (await templateFields(page)).subject;
            await snap(page, 'k01-seeded-default-unchanged');
            await closeAll(page);
            fact('kept', out);
        });

        // ====================================================================== offs
        if (on('offs')) await sect('offs', async () => {
            const out = {};
            const t = tag('u56k2o');
            const r = await app.api.createContext({tag: t, users: [{username: `${t}mgr`, roles: ['manager']}]});
            const O = r.path || t;
            await signIn(page, `${t}mgr`);
            await landManage(app, page, O);
            const base = (await rowsOf(page)).map((x) => x.name);
            out.base = base.length;
            // the masthead-visibility email's "Edit" on a fresh context (OMP answered 404 on publicknowledge)
            if (!isOPS) {
                const mv = 'User Role Masthead Visibility Update Notification';
                const resp = page.waitForResponse((r) => /emailTemplates\/|mailables\//.test(r.url()), {timeout: 15000}).catch(() => null);
                await doSearch(page, mv);
                await page.locator(`${LP} .listPanel__item`).first().getByRole('button', {name: /Edit/}).first().click();
                const rr = await resp;
                await sleep(4000);
                out.masthead = {request: rr && rr.url().replace(app.baseURL, ''), status: rr && rr.status(), dialogs: (await dialogTexts(page)).map((d) => d.name)};
                await snap(page, 'o00-masthead-edit');
                await closeAll(page);
                await landManage(app, page, O);
            }
            await landTab(app, page, O);
            out.radiosBefore = await tabPanel(page).locator('input[type=radio]').evaluateAll((els) => els.map((e) => ({name: e.name, value: e.value, checked: e.checked, label: e.closest('label')?.innerText.trim() || e.parentElement?.innerText.trim()})));
            // switch every "off" end
            const offLabels = ['Do not send an email.', 'Only send an email to authors assigned to the submission workflow. Usually, this is the submitting author.', 'Do not send the email to editors.'];
            const ticked = [];
            for (const l of offLabels) {
                const radios = tabPanel(page).getByRole('radio', {name: l, exact: true});
                const n = await radios.count();
                for (let i = 0; i < n; i++) { await radios.nth(i).check().catch(() => {}); ticked.push(l); }
            }
            out.ticked = ticked;
            out.save = await saveTab(page);
            await landManage(app, page, O);
            const after = (await rowsOf(page)).map((x) => x.name);
            out.after = after.length;
            out.gone = base.filter((n) => !after.includes(n));
            out.added = after.filter((n) => !base.includes(n));
            await snap(page, 'o01-after-offs');
            // one at a time: restore all, then each alone
            fact('offs', out);
        });

        // ====================================================================== pay
        if (on('pay') && !isOPS) await sect('pay', async () => {
            const out = {};
            const t = tag('u56k2y');
            let r;
            if (isOJS) {
                r = await app.api.createContext({tag: t, context: {contactName: 'K2 Pay Contact', contactEmail: `${t}pc@mail.test`},
                    publishingMode: 'subscription', payments: {currency: 'USD', paymentPluginName: 'ManualPayment', manualInstructions: 'Send a cheque to K2.'},
                    subscriptionTypes: [{name: 'K2 Online', cost: 40, currency: 'USD', duration: 12}],
                    users: [{username: `${t}mgr`, roles: ['manager']}, {username: `${t}rd`, roles: ['reader']}]});
            } else {
                r = await app.api.createContext({tag: t, context: {contactName: 'K2 Pay Contact', contactEmail: `${t}pc@mail.test`}, users: [{username: `${t}mgr`, roles: ['manager']}]});
            }
            const Y = r.path || t;
            out.ctx = Y;
            await signIn(page, `${t}mgr`);
            if (!isOJS) {
                // OMP: Settings › Distribution › "Payments" by hand
                await page.goto(app.url(`/index.php/${Y}/management/settings/distribution`)); await idle(page);
                const pt = page.getByRole('tab', {name: 'Payments', exact: true});
                out.paymentsTab = await pt.count();
                if (out.paymentsTab) {
                    await pt.first().click(); await idle(page); await sleep(600);
                    const panel = page.locator('[role="tabpanel"]:visible').last();
                    const en = panel.getByRole('checkbox').first();
                    if (!(await en.isChecked().catch(() => false))) await en.check().catch(() => {});
                    await sleep(400);
                    await panel.locator('select').first().selectOption({label: /US Dollar|USD/}).catch(async () => { await panel.locator('select').first().selectOption('USD').catch(() => {}); });
                    const method = panel.locator('select').nth(1);
                    await method.selectOption({label: 'Manual Fee Payment'}).catch(() => {});
                    await sleep(500);
                    const instr = panel.locator('textarea').first();
                    if (await instr.count()) await instr.fill('Send a cheque to K2.').catch(() => {});
                    const ifr = panel.frameLocator('iframe').first().locator('body');
                    if (!(await instr.isVisible().catch(() => false)) && await panel.locator('iframe').count()) { await ifr.click().catch(() => {}); await ifr.pressSequentially('Send a cheque to K2.').catch(() => {}); }
                    out.paymentsForm = flat(await panel.innerText(), 800);
                    const st = [];
                    await panel.getByRole('button', {name: 'Save', exact: true}).click();
                    for (let i = 0; i < 20; i++) { const s = await panel.locator('[role=status]').allInnerTexts().catch(() => []); for (const x of s) if (x.trim() && !st.includes(x.trim())) st.push(x.trim()); await sleep(150); }
                    out.paymentsSave = st;
                    await snap(page, 'p00-omp-payments-saved');
                }
            }
            await landManage(app, page, Y);
            out.count = (await rowsOf(page)).length;
            for (const q of ['Manual', 'payment', 'Payment', 'notification']) { await doSearch(page, q); out[q] = (await rowsOf(page)).map((x) => x.name); }
            await snap(page, 'p01-search-payment');
            // OJS: a reader reports a manual payment → the contact's mail
            if (isOJS) {
                await signIn(page, `${t}rd`, {contextPath: Y});
                await page.goto(app.url(`/index.php/${Y}/user/purchaseSubscription/individual`)); await idle(page);
                await page.locator('select[name="typeId"]').selectOption({index: 0}).catch(() => {});
                await Promise.all([page.waitForLoadState('load').catch(() => {}), page.getByRole('button', {name: /Save|Continue/}).first().click()]);
                await idle(page);
                await snap(page, 'p02-manual-payment-page');
                const send = page.getByRole('link', {name: /Send notification of payment/}).or(page.getByRole('button', {name: /Send notification of payment/})).first();
                out.sendPresent = await send.count();
                if (out.sendPresent) { await Promise.all([page.waitForLoadState('load').catch(() => {}), send.click()]); await idle(page); await snap(page, 'p03-after-notify'); }
                try {
                    const msg = await app.mail.find({to: `${t}pc@mail.test`, contains: t, timeoutMs: 20000}).catch(() => null) || await app.mail.find({to: `${t}pc@mail.test`, contains: 'K2', timeoutMs: 5000}).catch(() => null);
                    out.mail = msg ? {subject: msg.Subject || msg.subject, from: JSON.stringify(msg.From || msg.from).slice(0, 120)} : null;
                    if (msg) { const full = await app.mail.fullMessage(msg.ID || msg.id); out.mailBody = flat(full.Text || full.text || '', 600); }
                } catch (e) { out.mailErr = flat(String(e.message), 200); }
                // the manager's list once more, after the payment screens ran
                await signIn(page, `${t}mgr`);
                await landManage(app, page, Y);
                await doSearch(page, 'Manual');
                out.afterNotifyManual = (await rowsOf(page)).map((x) => x.name);
            }
            fact('pay', out);
        });

        // ====================================================================== ops2
        if (on('ops2') && isOPS) await sect('ops2', async () => {
            const out = {};
            const t = tag('u56k2d');
            const r = await app.api.createContext({tag: t, users: [{username: `${t}mgr`, roles: ['manager']}, {username: `${t}au`, roles: ['author']}]});
            const D = r.path || t;
            const sub = await app.api.createSubmission({tag: `${t}s`, context: D, submitter: `${t}au`, title: `U56 K2 ${t}`});
            out.sub = sub && (sub.id || sub.submissionId);
            await signIn(page, `${t}mgr`);
            await page.goto(app.url(`/index.php/${D}/dashboard/editorial?workflowSubmissionId=${out.sub}`)); await idle(page); await sleep(1500);
            const s = await snap(page, 'd01-ops-workflow');
            out.buttons = await page.locator('[role=dialog]:visible').last().evaluate((d) => [...d.querySelectorAll('button')].filter((b) => b.getClientRects().length).map((b) => b.innerText.trim()).filter(Boolean)).catch(() => null);
            fact('ops2', out);
        });
    } finally {
        record('dialogs', dialogLog);
        await close();
    }
});
