// U12 claim check, chunk K1: the Announcements settings tab (Settings › Website ›
// Setup › Announcements) and the journal's Announcements page as the manager,
// on all three apps.
// Spec: docs/specs/U12-announcements.md — Purpose and Actors rows 1–3 (12–41),
// the settings tab's fields (70–79), Rules 1–4 (93–130), Settings bullets 1–5
// (290–310), register OMP1 (529–539); footnotes a, b, c, d, e, m, n, f-omp1.
//
// Seeds its own scratch context (one throwaway account per permission level),
// signs in from the roster and records every screen with screen(). Phases:
//   seed      the scratch context and its users (state file reused later)
//   access    every level: Settings › Website by address, the Announcements
//             page by address, the side menu (the switch still off); admin in
//             the journal; manager.maya on publicknowledge read-only
//   pageoff   as the manager with the switch off: the page's heading, tabs,
//             empty list; "Call for papers" added while off (A8); "View" → 404;
//             the public page and header signed out (Rule 2, off end)
//   settings  the tab's fields before/after ticking, "abc" / "-1" / "2.5" /
//             "0" / "2" in "Display on Homepage", the introduction, "Saved",
//             the side menu before and after a reload; the sweep out of the
//             tab with an unsaved change
//   pageon    the side menu entry and its position, the page from the entry,
//             the list newest first, the row buttons, "View" (same window,
//             public page; an expired one), Search at both ends, paging at
//             30/31 rows; the public page and header signed out (Rule 2, on
//             end); Rule 1: publicknowledge's list and the site's list do not
//             carry the scratch journal's rows
//   permit    admin unticks "Permit changes to Settings" on the Journal/Press
//             editor role; the editor's side menu, Settings › Website (denied),
//             the Announcements page (opens); re-tick. OPS: the Roles grid's
//             manager row has no Edit (recorded)
//   site      admin: Site Settings › Announcements › Settings (read-only
//             defaults); the manager at the site's settings address
//   offagain  untick and Save: the side menu after a reload, the page by
//             address, "View" → 404, the public page 404
//
//   PROBE_FEATURE=U12 PROBE_AGENT=ccK1 node bin/probe.js all shared/playwright/checks/U12/K1/k1.js
//   PHASES=seed,access,pageoff,settings,pageon,permit,site,offagain (default: all; the seed
//   phase runs only without a state file, or with RESEED=1)
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, signOut, screen, shot, record, loc, note, idle, tag, outDir} =
    require('../../../probe');

const ALL_PHASES = ['seed', 'access', 'pageoff', 'settings', 'pageon', 'permit', 'site', 'offagain'];
const PHASES = process.env.PHASES ? process.env.PHASES.split(',') : ALL_PHASES;
const on = (p) => PHASES.includes(p);
const log = (...a) => console.log('[k1]', ...a);
const stateFile = (app) => path.join(outDir(), `k1-state-${app.name}.json`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const T = 20_000;
const DENIED = /does not have access to this operation/i;
const PAGING_ROWS = Number(process.env.PAGING_ROWS || 31);

// ---------------------------------------------------------------------------
// Reading helpers

const ctxUrl = (app, ctxPath, p = '', locale = '') => app.url(`/index.php/${ctxPath}${locale ? '/' + locale : ''}${p}`);
const dialog = (page) => page.locator('[role="dialog"]:visible').last();

async function snap(page, name, extra = {}) {
    const s = await screen(page);
    record(name, {...s, ...extra});
    await shot(page, name).catch(() => {});
    return s;
}

/** The backend side navigation ("Site Navigation", a PrimeVue panelmenu): groups, items, and the Announcements/Settings entries. */
async function readNav(page) {
    const nav = page.getByRole('navigation', {name: 'Site Navigation'});
    if (!(await nav.count().catch(() => 0))) return {present: false, url: page.url()};
    const groups = await nav.locator('[role="button"][aria-controls], [role="button"]').evaluateAll((els) => els.map((e) => {
        const region = document.getElementById(e.getAttribute('aria-controls') || '');
        const link = e.querySelector('a');
        const icon = e.querySelector('svg, i, .p-panelmenu-header-icon, [class*=icon]');
        return {
            label: e.getAttribute('aria-label') || e.textContent.replace(/\s+/g, ' ').trim(),
            href: link ? link.getAttribute('href') : null,
            expanded: e.getAttribute('aria-expanded'),
            hasIcon: !!icon,
            iconClass: icon ? (icon.getAttribute('class') || icon.tagName) : null,
            items: region ? [...region.querySelectorAll('[role="treeitem"]')].map((li) => ({label: li.getAttribute('aria-label') || li.textContent.replace(/\s+/g, ' ').trim(), href: li.querySelector('a') ? li.querySelector('a').getAttribute('href') : null})) : [],
        };
    })).catch(() => []);
    const order = groups.map((g) => g.label);
    const idxA = order.findIndex((l) => /^Announcements$/i.test(l));
    const idxS = order.findIndex((l) => /^Settings$/i.test(l));
    return {
        present: true,
        url: page.url(),
        text: (await nav.innerText().catch(() => '')).replace(/\n+/g, ' | '),
        order,
        announcementsEntry: idxA >= 0 ? groups[idxA] : null,
        announcementsAboveSettings: idxA >= 0 && idxS >= 0 ? idxA < idxS : null,
        settingsGroup: idxS >= 0 ? groups[idxS] : null,
        groups,
    };
}

/** Open a backend address: HTTP status, the access-denied text, headings, the tab strip. */
async function openBackend(page, url) {
    const resp = await page.goto(url).catch(() => null);
    await idle(page);
    const body = await page.locator('body').innerText().catch(() => '');
    return {
        url: page.url(),
        httpStatus: resp ? resp.status() : null,
        denied: DENIED.test(body),
        loginForm: (await page.locator('form#login, input[name="username"]').count()) > 0,
        h1: await page.locator('main h1, h1').allInnerTexts().then((a) => a.map((s) => s.trim())).catch(() => []),
        tabs: await page.getByRole('tab').allInnerTexts().then((a) => a.map((s) => s.trim())).catch(() => []),
        bodyHead: body.slice(0, 300),
    };
}

/** Settings › Website › Setup: the side tabs, then the "Announcements" side tab pressed. */
async function openAnnouncementsSettingsTab(page, app, ctxPath) {
    await page.goto(ctxUrl(app, ctxPath, '/management/settings/website'));
    await idle(page);
    const setupTab = page.locator('#setup-button');
    await setupTab.waitFor({timeout: T});
    if ((await setupTab.getAttribute('aria-selected')) !== 'true') await setupTab.click();
    await idle(page);
    const topTabs = await page.locator('main [role="tablist"]').first().getByRole('tab').allInnerTexts();
    const sidePanel = page.locator('#setup');
    const sideTabs = await sidePanel.locator('[role="tablist"]').first().getByRole('tab').allInnerTexts();
    const tab = sidePanel.getByRole('tab', {name: 'Announcements', exact: true});
    const present = (await tab.count()) > 0;
    if (present) {
        await tab.first().click();
        await idle(page);
    }
    return {topTabs: topTabs.map((t) => t.trim()), sideTabs: sideTabs.map((t) => t.trim()), announcementsTabPresent: present};
}

/** The Announcements settings form (the visible tabpanel under Setup). */
const settingsForm = (page) => page.locator('#setup [role="tabpanel"]:visible').filter({has: page.getByRole('checkbox', {name: 'Enable announcements'})}).first();

/** The settings form as data: every field (label, description, tooltip, kind, value), the errors, the buttons. */
async function settingsFormState(page) {
    const f = settingsForm(page);
    if (!(await f.count().catch(() => 0))) return {present: false};
    const data = await f.evaluate((root) => {
        const txt = (el) => (el ? el.innerText.replace(/\s+/g, ' ').trim() : null);
        const fields = [...root.querySelectorAll('.pkpFormField')].map((fld) => {
            const legend = fld.querySelector('legend, .pkpFormFieldLabel, label.pkpFormFieldLabel');
            const tip = fld.querySelector('.tooltipButton, [class*=tooltip] button, button[aria-describedby], .pkpFormField__tooltip');
            const tipText = fld.querySelector('.tooltip, [role="tooltip"], .pkpFormField__tooltipText');
            const boxes = [...fld.querySelectorAll('input[type="checkbox"]')].map((i) => ({label: txt(i.closest('label') || (i.labels && i.labels[0])), checked: i.checked, name: i.name}));
            const input = fld.querySelector('input.pkpFormField__input, input[type="text"], input[type="number"], textarea');
            return {
                class: fld.className,
                label: txt(legend),
                description: txt(fld.querySelector('.pkpFormField__description')),
                tooltip: tip ? {tag: tip.tagName, attrs: Object.fromEntries([...tip.attributes].map((a) => [a.name, a.value])), text: txt(tip), hiddenText: txt(tipText)} : null,
                boxes,
                input: input ? {tag: input.tagName, type: input.type, name: input.name, value: input.value, size: input.getAttribute('size'), className: input.className} : null,
                richEditor: !!fld.querySelector('iframe, .tox, .pkpFormField--richTextarea'),
                localeLabels: [...fld.querySelectorAll('.pkpFormField__localeLabel, .pkpFormField__label--locale')].map(txt),
                errors: [...fld.querySelectorAll('.pkpFieldError, .pkpFormField__error')].map(txt),
                visible: fld.offsetParent !== null,
            };
        });
        return {
            fields,
            errorSummary: txt(root.querySelector('.pkpForm__errors')),
            status: [...root.querySelectorAll('[role="status"], .pkpFormPage__status')].map(txt).filter(Boolean),
            buttons: [...root.querySelectorAll('button')].filter((b) => b.offsetParent !== null).map((b) => ({name: (b.getAttribute('aria-label') || b.innerText).replace(/\s+/g, ' ').trim(), disabled: b.disabled || b.getAttribute('aria-disabled') === 'true'})),
        };
    }).catch((e) => ({error: String(e.message || e)}));
    data.pageNotices = await page.locator('[role="alert"], .pkpNotification, .app__notifications, .ui-pnotify-text').allInnerTexts().then((a) => a.map((s) => s.trim()).filter(Boolean)).catch(() => []);
    return {present: true, ...data};
}

/** Hover the field's tooltip button and read the tooltip shown. */
async function readTooltip(page, fieldLabelRe) {
    const f = settingsForm(page).locator('.pkpFormField').filter({hasText: fieldLabelRe}).first();
    const btn = f.locator('.tooltipButton, button[aria-describedby], [class*=tooltip] button').first();
    if (!(await btn.count().catch(() => 0))) return {button: false};
    const out = {button: true, ariaLabel: await btn.getAttribute('aria-label').catch(() => null), title: await btn.getAttribute('title').catch(() => null), describedby: await btn.getAttribute('aria-describedby').catch(() => null)};
    out.headingText = await f.locator('.pkpFormField__heading, .pkpFormFieldLabel, legend').first().innerText().then((t) => t.replace(/\s+/g, ' ').trim()).catch(() => null);
    out.screenReaderText = await f.locator('.-screenReader').allInnerTexts().then((a) => a.map((s) => s.trim()).filter(Boolean)).catch(() => []);
    await btn.hover({force: true}).catch(() => {});
    await sleep(500);
    out.shown = await page.locator('.v-popper__popper, [role="tooltip"], .tooltip').evaluateAll((els) => els.filter((e) => e.offsetParent !== null || getComputedStyle(e).visibility === 'visible').map((e) => e.innerText.replace(/\s+/g, ' ').trim()).filter(Boolean)).catch(() => []);
    if (out.describedby) out.describedText = await page.locator(`#${CSS.escape ? out.describedby : out.describedby}`).innerText().catch(() => null);
    await btn.focus().catch(() => {});
    await sleep(200);
    out.shownOnFocus = await page.locator('[role="tooltip"]:visible, .tooltip:visible').allInnerTexts().then((a) => a.map((s) => s.trim()).filter(Boolean)).catch(() => []);
    await page.mouse.move(0, 0).catch(() => {});
    return out;
}

const enableBox = (page) => settingsForm(page).getByRole('checkbox', {name: 'Enable announcements'});
const homepageInput = (page) => settingsForm(page).locator('.pkpFormField').filter({hasText: /Display on Homepage/}).locator('input').first();

async function saveSettings(page) {
    const f = settingsForm(page);
    await f.getByRole('button', {name: 'Save', exact: true}).click();
    await idle(page);
    const status = f.locator('[role="status"]').filter({hasText: /Saved/}).first();
    const errors = f.locator('.pkpForm__errors, .pkpFieldError').first();
    let savedSeen = false;
    await Promise.race([
        status.waitFor({timeout: 8_000}).then(() => { savedSeen = true; }),
        errors.waitFor({timeout: 8_000}),
    ]).catch(() => {});
    const statusTexts = await f.locator('[role="status"], .pkpFormPage__status').allInnerTexts().then((a) => a.map((s) => s.trim()).filter(Boolean)).catch(() => []);
    await sleep(300);
    const state = await settingsFormState(page);
    state.savedSeen = savedSeen;
    state.statusAtOnce = statusTexts;
    return state;
}

/** The TinyMCE body of a rich-text field inside the visible dialog. */
async function richBody(page, root, labelRe) {
    const f = root.locator('.pkpFormField').filter({hasText: labelRe}).first();
    const frame = f.locator('iframe').first();
    await frame.waitFor({timeout: T});
    const body = frame.contentFrame().locator('body');
    await body.waitFor({timeout: T});
    await page.waitForFunction((el) => el.contentDocument && el.contentDocument.body && el.contentDocument.body.getAttribute('contenteditable') === 'true', await frame.elementHandle(), {timeout: T}).catch(() => {});
    return body;
}
async function setRich(page, root, labelRe, text) {
    const body = await richBody(page, root, labelRe);
    await body.click();
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.press('Delete');
    if (text) await body.pressSequentially(text);
    await sleep(150);
}

/** The Announcements page's list panel as data. */
async function listState(page) {
    const panel = page.locator('main .listPanel').first();
    if (!(await panel.count().catch(() => 0))) return {present: false};
    const data = await panel.evaluate((root) => {
        const btn = (b) => ({tag: b.tagName, name: (b.getAttribute('aria-label') || b.innerText).replace(/\s+/g, ' ').trim(), href: b.getAttribute('href'), target: b.getAttribute('target'), disabled: b.disabled || b.getAttribute('aria-disabled') === 'true'});
        const search = root.querySelector('input[type="search"], .pkpSearch input, input');
        return {
            title: root.querySelector('.pkpHeader__title, .listPanel__title')?.innerText.trim() ?? null,
            headerButtons: [...root.querySelectorAll('.pkpHeader__actions button, .listPanel__header button')].map(btn),
            search: search ? {type: search.type, placeholder: search.placeholder, ariaLabel: search.getAttribute('aria-label'), value: search.value, labelText: (search.labels && search.labels[0]) ? search.labels[0].innerText.trim() : null} : null,
            searchClearButton: [...root.querySelectorAll('.pkpSearch button, .pkpSearch__clear')].map(btn),
            empty: root.querySelector('.listPanel__empty')?.innerText.trim() ?? null,
            rows: [...root.querySelectorAll('.listPanel__item')].map((li) => ({
                title: li.querySelector('.listPanel__itemTitle')?.innerText.trim() ?? null,
                subtitle: li.querySelector('.listPanel__itemSubtitle')?.innerText.trim() ?? null,
                text: li.innerText.replace(/\s+/g, ' ').trim(),
                buttons: [...li.querySelectorAll('button, a')].map(btn),
            })),
            pagination: root.querySelector('.pkpPagination, [class*=pagination]') ? {text: root.querySelector('.pkpPagination, [class*=pagination]').innerText.replace(/\s+/g, ' ').trim(), buttons: [...root.querySelectorAll('.pkpPagination button, [class*=pagination] button')].map(btn)} : null,
            count: root.querySelector('.listPanel__count, .pkpHeader__count')?.innerText.trim() ?? null,
            columnsHeader: [...root.querySelectorAll('th, .listPanel__columns, [role="columnheader"]')].map((e) => e.innerText.trim()),
        };
    }).catch((e) => ({error: String(e.message || e)}));
    return {present: true, ...data};
}

const searchBox = (page) => page.locator('main .listPanel').first().locator('input[type="search"], .pkpSearch input').first();

/** Type a phrase, wait, read the rows (the typing end); then press Enter, wait for the panel's fetch, read again (the Enter end). */
async function search(page, phrase) {
    const box = searchBox(page);
    const fetches = [];
    const listener = (r) => { if (/api\/v1\/announcements\?/.test(r.url())) fetches.push(decodeURIComponent(r.url().split('?')[1]).replace(/&_=\d+/, '')); };
    page.on('request', listener);
    await box.fill('');
    if (phrase) await box.pressSequentially(phrase, {delay: 30});
    await sleep(1500);
    await idle(page);
    const typed = await listState(page);
    const fetchesWhileTyping = [...fetches];
    await box.press('Enter');
    await sleep(1200);
    await idle(page);
    await sleep(300);
    page.off('request', listener);
    const entered = await listState(page);
    return {...entered, typedRows: typed.rows.map((r) => r.title), typedEmpty: typed.empty, fetchesWhileTyping, fetchesAfterEnter: fetches.slice(fetchesWhileTyping.length)};
}

/** Open the Announcements page by address; the heading, tabs, list. */
async function openAnnouncementsPage(page, app, ctxPath) {
    const res = await openBackend(page, ctxUrl(app, ctxPath, '/management/settings/announcements'));
    const panel = page.locator('main .listPanel').first();
    await panel.waitFor({timeout: 10_000}).catch(() => {});
    await idle(page);
    return {...res, mainH1: await page.locator('main h1').first().innerText().catch(() => null), list: await listState(page)};
}

/** Add an announcement through the panel: title, optional short description and expiry. Returns the panel's state after Save. */
async function addAnnouncement(page, {title, short, expiry}) {
    const existing = page.locator('main .listPanel .listPanel__item').filter({hasText: title});
    if (await existing.count().catch(() => 0)) return {title, dialogStillOpen: false, alreadyPresent: true};
    await page.locator('main .listPanel').first().getByRole('button', {name: 'Add Announcement', exact: true}).click();
    const d = dialog(page);
    await d.waitFor({timeout: T});
    await idle(page);
    const titleInput = d.locator('.pkpFormField').filter({hasText: /^\s*Title/}).locator('input').first();
    await titleInput.waitFor({timeout: T});
    await titleInput.fill(title);
    if (short !== undefined) await setRich(page, d, /Short Description/i, short);
    if (expiry !== undefined) {
        const exp = d.locator('.pkpFormField').filter({hasText: /Expiry Date/i}).locator('input').first();
        await exp.fill(expiry);
    }
    await d.getByRole('button', {name: 'Save', exact: true}).click();
    await idle(page);
    await sleep(500);
    const still = await page.locator('[role="dialog"]:visible').count();
    const out = {title, dialogStillOpen: still > 0};
    if (still > 0) {
        out.errorSummary = await d.locator('.pkpForm__errors').innerText().catch(() => null);
        out.fieldErrors = await d.locator('.pkpFieldError').allInnerTexts().catch(() => []);
        out.dialogText = (await d.innerText().catch(() => '')).slice(0, 800);
    }
    await idle(page);
    return out;
}

/** The public Announcements page and the header, signed out. */
async function publicRead(page, app, ctxPath, name) {
    const out = {};
    for (const [key, p] of [['list', '/announcement'], ['view1', '/announcement/view/1'], ['home', '']]) {
        const resp = await page.goto(ctxUrl(app, ctxPath, p)).catch(() => null);
        await idle(page);
        const body = await page.locator('body').innerText().catch(() => '');
        const headerLinks = await page.locator('header a, .pkp_structure_head a, #navigationPrimary a, .pkp_navigation_primary a').evaluateAll((els) => els.filter((e) => e.offsetParent !== null).map((e) => e.innerText.replace(/\s+/g, ' ').trim()).filter(Boolean)).catch(() => []);
        const primary = await page.locator('#navigationPrimary, .pkp_navigation_primary, nav.pkp_navigation_primary_row').first().innerText().then((t) => t.replace(/\n+/g, ' | ').trim()).catch(() => null);
        out[key] = {url: page.url(), status: resp ? resp.status() : null, title: await page.title(), h1: await page.locator('h1').allInnerTexts().then((a) => a.map((s) => s.trim())).catch(() => []), is404: /404 Not Found/i.test(body), headerLinks: [...new Set(headerLinks)], primaryNav: primary, bodyHead: body.slice(0, 400), editLink: await page.locator('a').filter({hasText: /^\s*Edit\b/}).evaluateAll((els) => els.map((e) => ({text: e.innerText.trim(), href: e.getAttribute('href')}))).catch(() => [])};
        await snap(page, `${name}-${key}`, out[key]);
    }
    if (app.name === 'ojs') {
        const resp = await page.goto(ctxUrl(app, ctxPath, '/gateway/plugin/AnnouncementFeedGatewayPlugin/atom')).catch(() => null);
        await idle(page).catch(() => {});
        const body = await page.locator('body').innerText().catch(() => '');
        out.feed = {url: page.url(), status: resp ? resp.status() : null, is404: /404 Not Found/i.test(body), bodyHead: body.slice(0, 300)};
        record(`${name}-feed`, out.feed);
    }
    return out;
}

async function as(page, user, ctxPath) {
    await signIn(page, user, {contextPath: ctxPath});
    await idle(page);
}

// ---------------------------------------------------------------------------

forEachApp(async (app) => {
    const isOps = app.name === 'ops';
    let st = fs.existsSync(stateFile(app)) ? JSON.parse(fs.readFileSync(stateFile(app), 'utf8')) : null;
    const saveState = () => fs.writeFileSync(stateFile(app), JSON.stringify(st, null, 2));

    // ---- seed ---------------------------------------------------------------
    if ((on('seed') && (process.env.RESEED === '1' || !st)) || !st) {
        const t = tag('u12k1');
        const users = [
            {username: `${t}mgr`, roles: ['manager'], givenName: 'Mira', familyName: 'Manager'},
            {username: `${t}se`, roles: ['sectionEditor'], givenName: 'Sonia', familyName: 'Section'},
            {username: `${t}ast`, roles: [isOps ? 'editorialBoardMember' : 'copyeditor'], givenName: 'Ari', familyName: 'Assistant'},
            {username: `${t}au`, roles: ['author'], givenName: 'Ada', familyName: 'Author'},
            {username: `${t}rd`, roles: ['reader'], givenName: 'Rex', familyName: 'Reader'},
        ];
        if (!isOps) {
            users.push({username: `${t}ed`, roles: ['editor'], givenName: 'Edith', familyName: 'Editor'});
            users.push({username: `${t}pe`, roles: ['productionEditor'], givenName: 'Pat', familyName: 'Production'});
            users.push({username: `${t}rev`, roles: ['externalReviewer'], givenName: 'Rita', familyName: 'Reviewer'});
        }
        let ctx;
        for (let attempt = 1; attempt <= 2; attempt++) {
            try {
                ctx = await app.api.createContext({tag: t, context: {name: `U12 K1 ${t}`, acronym: 'U12K1'}, users});
                break;
            } catch (e) {
                log('seed failed', attempt, String(e.message || e));
                if (attempt === 2) throw e;
                await sleep(3000);
            }
        }
        st = {tag: t, ctxPath: ctx.path || t, contextId: ctx.contextId, users: Object.fromEntries(users.map((u) => [u.username.slice(t.length), u.username]))};
        saveState();
        log('seeded', st.ctxPath, st.contextId);
        note(`K1 ${app.name}: scratch context ${st.ctxPath} (id ${st.contextId}), announcements off at creation`);
    }
    const P = st.ctxPath;
    const U = st.users;
    const levels = [
        ['mgr', 'manager (ROLE_ID_MANAGER)'],
        ...(isOps ? [] : [['ed', 'editor (ROLE_ID_MANAGER)'], ['pe', 'productionEditor (ROLE_ID_MANAGER)']]),
        ['se', 'sectionEditor (ROLE_ID_SUB_EDITOR)'],
        ['ast', isOps ? 'editorialBoardMember (ROLE_ID_ASSISTANT)' : 'copyeditor (ROLE_ID_ASSISTANT)'],
        ['au', 'author (ROLE_ID_AUTHOR)'],
        ...(isOps ? [] : [['rev', 'externalReviewer (ROLE_ID_REVIEWER)']]),
        ['rd', 'reader (ROLE_ID_READER)'],
    ];
    const managerKeys = ['mgr', 'ed', 'pe'];

    // ---- access: one account per permission level, the switch off -------------
    if (on('access')) {
        const {page, close} = await launch(app);
        try {
            for (const [key, level] of levels) {
                await as(page, U[key], P);
                const landed = page.url();
                const nav = await readNav(page);
                const website = await openBackend(page, ctxUrl(app, P, '/management/settings/website'));
                await snap(page, `01-access-${key}-website`, {level, user: U[key], landedAfterLogin: landed, website});
                let tabs = null;
                if (!website.denied && (await page.locator('#setup-button').count())) {
                    tabs = await openAnnouncementsSettingsTab(page, app, P);
                    await snap(page, `01-access-${key}-setup-tab`, {level, tabs, form: await settingsFormState(page)});
                }
                const annPage = await openAnnouncementsPage(page, app, P);
                await snap(page, `01-access-${key}-announcements-page`, {level, user: U[key], annPage, nav});
                log(app.name, key, JSON.stringify({websiteDenied: website.denied, annDenied: annPage.denied, annH1: annPage.mainH1, tabs: annPage.tabs, navAnn: !!nav.announcementsEntry, navSettings: !!nav.settingsGroup, sideTabs: tabs && tabs.sideTabs}));
            }
            // admin working in the journal
            await as(page, 'admin', P);
            const navA = await readNav(page);
            const websiteA = await openBackend(page, ctxUrl(app, P, '/management/settings/website'));
            const tabsA = websiteA.denied ? null : await openAnnouncementsSettingsTab(page, app, P);
            await snap(page, '01-access-admin-setup-tab', {level: 'site admin (ROLE_ID_SITE_ADMIN)', website: websiteA, tabs: tabsA, form: await settingsFormState(page)});
            if (tabsA && tabsA.announcementsTabPresent) {
                await loc(page, 'Setup side tab "Announcements"', page.locator('#setup').getByRole('tab', {name: 'Announcements', exact: true}));
                await loc(page, 'Announcements settings: "Enable announcements" box', enableBox(page));
            }
            const annA = await openAnnouncementsPage(page, app, P);
            await snap(page, '01-access-admin-announcements-page', {annPage: annA, nav: navA});
            log(app.name, 'admin', JSON.stringify({websiteDenied: websiteA.denied, annDenied: annA.denied, annH1: annA.mainH1, navAnn: !!navA.announcementsEntry, sideTabs: tabsA && tabsA.sideTabs}));
            // the seeded journal, read-only: the manager's switch state
            await as(page, 'manager.maya', app.contextPath);
            const tabsPk = await openAnnouncementsSettingsTab(page, app, app.contextPath);
            const formPk = await settingsFormState(page);
            await snap(page, '02-roster-manager-maya-setup-tab', {tabs: tabsPk, form: formPk});
            const annPk = await openAnnouncementsPage(page, app, app.contextPath);
            await snap(page, '02-roster-manager-maya-announcements-page', {annPage: annPk, nav: await readNav(page)});
            log(app.name, 'publicknowledge', JSON.stringify({box: formPk.fields && formPk.fields[0] && formPk.fields[0].boxes, rows: annPk.list.rows && annPk.list.rows.length, empty: annPk.list.empty}));
            await signOut(page).catch(() => {});
        } finally {
            await close();
        }
    }

    // ---- pageoff: the page with the switch off, an announcement added (A8) ------
    if (on('pageoff')) {
        const {page, close} = await launch(app);
        try {
            await as(page, U.mgr, P);
            const annPage = await openAnnouncementsPage(page, app, P);
            await snap(page, '10-pageoff-page', {annPage, nav: await readNav(page)});
            await loc(page, 'Announcements page: "Add Announcement"', page.locator('main .listPanel').first().getByRole('button', {name: 'Add Announcement', exact: true}));
            await loc(page, 'Announcements page: "Search"', searchBox(page));
            await loc(page, 'Announcements page: tab "Announcement Types"', page.getByRole('tab', {name: 'Announcement Types', exact: true}));
            // the empty save (K2 owns the panel's refusals; recorded once here for the title-only path)
            const added = await addAnnouncement(page, {title: 'Call for papers', short: 'Deadline 1 June.'});
            await snap(page, '10-pageoff-add-call', {added, list: await listState(page)});
            if (added.dialogStillOpen) {
                await dialog(page).getByRole('button', {name: /Cancel|Close/, exact: false}).first().click().catch(() => {});
                await page.keyboard.press('Escape').catch(() => {});
            }
            st.callAddedWhileOff = !added.dialogStillOpen;
            saveState();
            // "View" with the switch off
            const list = await listState(page);
            const row = page.locator('main .listPanel .listPanel__item').filter({hasText: 'Call for papers'}).first();
            if (await row.count()) {
                const view = row.getByRole('link', {name: 'View', exact: true}).or(row.getByRole('button', {name: 'View', exact: true})).first();
                await loc(page, 'Announcements row: "View"', view);
                const viewInfo = {tag: await view.evaluate((e) => e.tagName).catch(() => null), href: await view.getAttribute('href').catch(() => null), target: await view.getAttribute('target').catch(() => null)};
                const pagesBefore = page.context().pages().length;
                await view.click();
                await sleep(1500);
                await idle(page).catch(() => {});
                const body = await page.locator('body').innerText().catch(() => '');
                await snap(page, '10-pageoff-view', {viewInfo, landedUrl: page.url(), newWindow: page.context().pages().length > pagesBefore, is404: /404 Not Found/i.test(body), rowsBefore: list.rows});
            }
            await signOut(page).catch(() => {});
            await publicRead(page, app, P, '11-public-off');
        } finally {
            await close();
        }
    }

    // ---- settings: the tab's fields and the switch ------------------------------
    if (on('settings')) {
        const {page, close} = await launch(app);
        const dialogs = [];
        page.on('dialog', async (d) => { dialogs.push({type: d.type(), message: d.message()}); await d.dismiss().catch(() => {}); });
        try {
            await as(page, U.mgr, P);
            const tabs = await openAnnouncementsSettingsTab(page, app, P);
            const before = await settingsFormState(page);
            await snap(page, '20-settings-before-tick', {tabs, form: before, nav: await readNav(page)});
            log(app.name, 'settings before', JSON.stringify({sideTabs: tabs.sideTabs, fields: before.fields && before.fields.map((f) => [f.label, f.visible, f.boxes])}));
            // Save with nothing changed (sweep)
            const nothing = await saveSettings(page);
            record('20-settings-save-unchanged', {form: nothing});
            // tick: the two fields appear without a save?
            await enableBox(page).check();
            await sleep(300);
            const afterTick = await settingsFormState(page);
            afterTick.introTooltip = await readTooltip(page, /Introduction|Additional Information/);
            await snap(page, '21-settings-after-tick', {form: afterTick});
            log(app.name, 'after tick', JSON.stringify({fields: afterTick.fields && afterTick.fields.map((f) => [f.label, f.visible, f.description, f.tooltip && f.tooltip.attrs, f.input && f.input.size]), tip: afterTick.introTooltip}));
            await loc(page, 'Announcements settings: "Introduction" field', settingsForm(page).locator('.pkpFormField').filter({hasText: /Introduction|Additional Information/}).first());
            await loc(page, 'Announcements settings: "Display on Homepage" input', homepageInput(page));
            // the sweep out: leave the tab with the unsaved tick
            await page.locator('#setup').getByRole('tab', {name: 'Highlights', exact: true}).click().catch(() => {});
            await sleep(500);
            const outSide = {dialogs: [...dialogs], vueDialogs: await page.locator('[role="dialog"]:visible').allInnerTexts().catch(() => []), url: page.url()};
            await page.locator('#setup').getByRole('tab', {name: 'Announcements', exact: true}).click();
            await sleep(300);
            outSide.boxStillTicked = await enableBox(page).isChecked().catch(() => null);
            await page.locator('#appearance-button').click().catch(() => {});
            await sleep(500);
            outSide.afterTopTab = {dialogs: [...dialogs], vueDialogs: await page.locator('[role="dialog"]:visible').allInnerTexts().catch(() => [])};
            await page.locator('#setup-button').click();
            await page.locator('#setup').getByRole('tab', {name: 'Announcements', exact: true}).click();
            await sleep(300);
            outSide.boxStillTickedAfterTopTab = await enableBox(page).isChecked().catch(() => null);
            await page.goto(ctxUrl(app, P, '/submissions'));
            await idle(page);
            outSide.afterLeave = {dialogs: [...dialogs], url: page.url()};
            record('22-settings-sweep-out-unsaved', outSide);
            log(app.name, 'sweep out', JSON.stringify(outSide));
            // back, tick, and the refused values
            await openAnnouncementsSettingsTab(page, app, P);
            const reopened = await settingsFormState(page);
            record('23-settings-reopened', {form: reopened});
            await enableBox(page).check();
            await sleep(300);
            const trials = {};
            for (const [key, value] of [['abc', 'abc'], ['minus1', '-1'], ['decimal', '2.5'], ['zero', '0']]) {
                await homepageInput(page).fill(value);
                const r = await saveSettings(page);
                trials[key] = {value, errors: r.fields && r.fields.map((f) => [f.label, f.errors]).filter((x) => x[1] && x[1].length), summary: r.errorSummary, status: r.status, notices: r.pageNotices, saveDisabled: r.buttons && r.buttons.find((b) => b.name === 'Save')?.disabled};
                await snap(page, `24-settings-homepage-${key}`, {trial: trials[key], form: r});
                log(app.name, 'homepage', key, JSON.stringify(trials[key]));
                // a refused Vue save disables Save until a flagged box changes: change it back to something before the next trial
            }
            // after "0" saved: the switch is on; the side menu without a reload?
            const navAfterZero = await readNav(page);
            record('25-settings-nav-after-save-no-reload', {nav: navAfterZero});
            // "2" + the introduction
            await homepageInput(page).fill('2');
            await setRich(page, settingsForm(page), /Introduction|Additional Information/, 'Welcome to our news.');
            const saved = await saveSettings(page);
            const navNoReload = await readNav(page);
            await snap(page, '26-settings-saved-2-intro', {form: saved, navNoReload});
            log(app.name, 'saved 2+intro', JSON.stringify({status: saved.status, notices: saved.pageNotices, navAnn: !!navNoReload.announcementsEntry}));
            await page.reload();
            await idle(page);
            const navReload = await readNav(page);
            await page.locator('#setup-button').click().catch(() => {});
            await page.locator('#setup').getByRole('tab', {name: 'Announcements', exact: true}).click().catch(() => {});
            await sleep(400);
            const persisted = await settingsFormState(page);
            await snap(page, '27-settings-after-reload', {form: persisted, nav: navReload});
            log(app.name, 'after reload', JSON.stringify({navAnn: navReload.announcementsEntry && navReload.announcementsEntry.label, order: navReload.order, above: navReload.announcementsAboveSettings, fields: persisted.fields && persisted.fields.map((f) => [f.label, f.boxes, f.input && f.input.value])}));
            st.switchOn = true;
            saveState();
            // the switch's description text per app
            note(`K1 ${app.name}: settings tab description: ${JSON.stringify(persisted.fields && persisted.fields[0] && persisted.fields[0].description)}`);
            await signOut(page).catch(() => {});
        } finally {
            await close();
        }
    }

    // ---- pageon: the side menu entry, the page, the list, search, paging --------
    if (on('pageon')) {
        const {page, close} = await launch(app);
        try {
            await as(page, U.mgr, P);
            const nav = await readNav(page);
            await snap(page, '30-pageon-side-menu', {nav});
            // from the entry
            const entry = page.getByRole('navigation', {name: 'Site Navigation'}).locator('[role="button"]').filter({hasText: /^\s*Announcements\s*$/}).first();
            let fromEntry = null;
            if (await entry.count()) {
                await loc(page, 'Side menu: "Announcements" entry', entry);
                await entry.click();
                await idle(page);
                await page.locator('main .listPanel').first().waitFor({timeout: 10_000}).catch(() => {});
                fromEntry = {url: page.url(), h1: await page.locator('main h1').first().innerText().catch(() => null), tabs: await page.getByRole('tab').allInnerTexts().catch(() => [])};
            }
            await snap(page, '31-pageon-from-entry', {fromEntry});
            const annPage = await openAnnouncementsPage(page, app, P);
            await snap(page, '32-pageon-page', {annPage});
            // the second tab and back (sweep)
            await page.getByRole('tab', {name: 'Announcement Types', exact: true}).click();
            await idle(page);
            const typesTab = {url: page.url(), text: (await page.locator('main [role="tabpanel"]:visible').innerText().catch(() => '')).slice(0, 500)};
            await page.getByRole('tab', {name: 'Announcements', exact: true}).first().click();
            await idle(page);
            record('33-pageon-types-tab-and-back', {typesTab, list: await listState(page)});
            // add the second and an expired one (newest first)
            const yesterday = new Date(Date.now() - 86400_000).toISOString().slice(0, 10);
            const addedConf = await addAnnouncement(page, {title: 'Annual conference'});
            await snap(page, '34-pageon-add-conference', {addedConf, list: await listState(page)});
            if (addedConf.dialogStillOpen) { await page.keyboard.press('Escape'); await idle(page); }
            const addedOld = await addAnnouncement(page, {title: 'Old news', expiry: yesterday});
            await snap(page, '35-pageon-add-expired', {addedOld, yesterday, list: await listState(page)});
            if (addedOld.dialogStillOpen) { await page.keyboard.press('Escape'); await idle(page); }
            const listNow = await listState(page);
            log(app.name, 'list', JSON.stringify({rows: listNow.rows.map((r) => [r.title, r.buttons.map((b) => b.name)]), empty: listNow.empty, count: listNow.count}));
            // Rule 4: "View" on a live row (same window, the public page) and on the expired one
            for (const [key, title] of [['call', 'Call for papers'], ['old', 'Old news']]) {
                // the row may sit on page 2 of a long list: bring it up through "Search" (Enter commits)
                await search(page, title);
                const row = page.locator('main .listPanel .listPanel__item').filter({hasText: title}).first();
                if (!(await row.count())) { record(`36-pageon-view-${key}`, {absent: true}); continue; }
                const view = row.getByRole('link', {name: 'View', exact: true}).or(row.getByRole('button', {name: 'View', exact: true})).first();
                const viewInfo = {tag: await view.evaluate((e) => e.tagName).catch(() => null), href: await view.getAttribute('href').catch(() => null), target: await view.getAttribute('target').catch(() => null)};
                const pagesBefore = page.context().pages().length;
                await view.click();
                await sleep(1500);
                await idle(page).catch(() => {});
                const body = await page.locator('body').innerText().catch(() => '');
                await snap(page, `36-pageon-view-${key}`, {viewInfo, landedUrl: page.url(), newWindow: page.context().pages().length > pagesBefore, is404: /404 Not Found/i.test(body), h1: await page.locator('h1').allInnerTexts().catch(() => [])});
                await openAnnouncementsPage(page, app, P);
            }
            // Search at both ends
            const searches = {};
            for (const [key, phrase] of [['call', 'call'], ['CALL', 'CALL'], ['june', 'june'], ['juneconference', 'june conference'], ['junecall', 'june call'], ['calljune', 'call june'], ['callpapers', 'call papers'], ['junedeadline', 'june deadline'], ['deadline1', 'deadline 1'], ['nothing', 'zzzqqq'], ['cleared', '']]) {
                const r = await search(page, phrase);
                searches[key] = {phrase, typedRows: r.typedRows, typedEmpty: r.typedEmpty, fetchesWhileTyping: r.fetchesWhileTyping, fetchesAfterEnter: r.fetchesAfterEnter, rowsAfterEnter: r.rows.map((x) => x.title), emptyAfterEnter: r.empty, count: r.count};
                await snap(page, `37-pageon-search-${key}`, {search: searches[key]});
            }
            log(app.name, 'search', JSON.stringify(searches));
            // the Search box's clear control (sweep)
            await search(page, 'call');
            const clear = page.locator('main .listPanel').first().locator('.pkpSearch button, .pkpSearch__clear').first();
            let cleared = null;
            if (await clear.count()) {
                await loc(page, 'Search: clear button', clear);
                await clear.click();
                await sleep(900); await idle(page);
                cleared = {rows: (await listState(page)).rows.map((x) => x.title), value: await searchBox(page).inputValue().catch(() => null)};
            }
            record('38-pageon-search-clear', {clearPresent: (await clear.count()) > 0, cleared});
            // paging: fill to 30 then 31
            const target30 = 30;
            let current = (await listState(page)).rows.length;
            const addFails = [];
            for (let i = current + 1; i <= target30 && PAGING_ROWS >= 30; i++) {
                const r = await addAnnouncement(page, {title: `Filler ${String(i).padStart(2, '0')}`});
                if (r.dialogStillOpen) { addFails.push(r); await page.keyboard.press('Escape'); await idle(page); }
            }
            const at30 = await listState(page);
            await snap(page, '39-pageon-list-30', {rows: at30.rows.length, pagination: at30.pagination, count: at30.count, addFails, firstTitles: at30.rows.slice(0, 3).map((r) => r.title)});
            if (PAGING_ROWS >= 31) {
                const r = await addAnnouncement(page, {title: 'Filler 31'});
                if (r.dialogStillOpen) { addFails.push(r); await page.keyboard.press('Escape'); await idle(page); }
                await page.reload(); await idle(page);
                await page.locator('main .listPanel').first().waitFor({timeout: 10_000}).catch(() => {});
                const at31 = await listState(page);
                await snap(page, '39-pageon-list-31', {rows: at31.rows.length, pagination: at31.pagination, count: at31.count, firstTitles: at31.rows.slice(0, 3).map((r) => r.title), lastTitles: at31.rows.slice(-2).map((r) => r.title)});
                if (at31.pagination) {
                    await loc(page, 'Announcements list: pagination', page.locator('main .listPanel').first().locator('.pkpPagination, [class*=pagination]').first());
                    const next = page.locator('main .listPanel').first().locator('.pkpPagination button, [class*=pagination] button').filter({hasText: /2|Next/}).first();
                    if (await next.count()) {
                        await next.click(); await sleep(900); await idle(page);
                        const p2 = await listState(page);
                        await snap(page, '39-pageon-list-page2', {rows: p2.rows.length, titles: p2.rows.map((r) => r.title), pagination: p2.pagination});
                    }
                }
                log(app.name, 'paging', JSON.stringify({at30: at30.rows.length, pag30: !!at30.pagination, at31: at31.rows.length, pag31: at31.pagination && at31.pagination.text}));
            }
            st.rowsAdded = true;
            saveState();
            // Rule 1: the seeded journal's list and the site's list carry none of these
            await as(page, 'manager.maya', app.contextPath);
            const pk = await openAnnouncementsPage(page, app, app.contextPath);
            await snap(page, '40-rule1-publicknowledge-list', {rows: pk.list.rows && pk.list.rows.map((r) => r.title), empty: pk.list.empty, scratchTitlesPresent: pk.list.rows && pk.list.rows.filter((r) => /Call for papers|Annual conference|Filler/.test(r.title)).length});
            await as(page, 'admin', app.contextPath);
            await page.goto(app.url('/index.php/index/admin/settings'));
            await idle(page);
            const annTab = page.locator('#announcements-button').or(page.getByRole('tab', {name: 'Announcements', exact: true})).first();
            let site = {tabPresent: (await annTab.count()) > 0};
            if (site.tabPresent) {
                await annTab.click(); await idle(page);
                site.sideTabs = await page.locator('#announcements [role="tablist"], [role="tabpanel"]:visible [role="tablist"]').first().getByRole('tab').allInnerTexts().catch(() => []);
                site.panelText = (await page.locator('#announcements, [role="tabpanel"]:visible').first().innerText().catch(() => '')).slice(0, 600);
                const itemsTab = page.getByRole('tab', {name: 'Announcements', exact: true}).nth(1);
                if (await itemsTab.count()) { await itemsTab.click(); await idle(page); site.itemsList = await listState(page); }
            }
            await snap(page, '41-rule1-site-list', {site});
            await signOut(page).catch(() => {});
            await publicRead(page, app, P, '42-public-on');
        } finally {
            await close();
        }
    }

    // ---- permit: the manager-level role without "Permit changes to Settings" ----
    if (on('permit')) {
        const {page, close} = await launch(app);
        try {
            const readRoles = async (name) => {
                await as(page, 'admin', P);
                await page.goto(ctxUrl(app, P, '/management/settings/access'));
                await idle(page);
                const rolesTab = page.locator('#roles-button').or(page.getByRole('tab', {name: 'Roles', exact: true})).first();
                if (await rolesTab.count()) await rolesTab.click();
                await idle(page);
                await page.locator('tr.gridRow').first().waitFor({timeout: 10_000}).catch(() => {});
                const out = {
                    header: await page.locator('table th').allInnerTexts().then((a) => a.map((s) => s.trim())).catch(() => []),
                    rows: await page.locator('tr.gridRow').evaluateAll((els) => els.map((e) => ({text: e.innerText.replace(/\s+/g, ' ').trim(), cells: [...e.querySelectorAll('td')].map((c) => c.innerText.replace(/\s+/g, ' ').trim()), hasEdit: !!e.querySelector('a.show_extras')}))),
                };
                await snap(page, name, out);
                return out;
            };
            const roles = await readRoles('50-permit-roles-grid');
            log(app.name, 'roles', JSON.stringify(roles.rows.map((r) => [r.cells[0], r.cells[1], r.hasEdit])));
            const setPermit = async (wanted, name) => {
                const grid = await page.locator('tr.gridRow').evaluateAll((els) => els.map((e) => ({name: (e.querySelector('td') || e).innerText.replace(/\s+/g, ' ').trim(), hasEdit: !!e.querySelector('a.show_extras')})));
                const idx = grid.findIndex((r) => /(journal|press|server)\s+editor$/i.test(r.name) && r.hasEdit);
                const row = page.locator('tr.gridRow').nth(idx);
                const out = {wanted, rowPresent: idx >= 0, rowName: idx >= 0 ? grid[idx].name : null};
                if (!out.rowPresent) { record(name, out); return out; }
                await row.locator('a.show_extras').click();
                await sleep(400);
                const controls = row.locator('xpath=following-sibling::tr[1]');
                await controls.getByRole('link', {name: 'Edit', exact: true}).first().click();
                const form = page.locator('form#userGroupForm');
                await form.waitFor({state: 'visible', timeout: T}).catch(() => {});
                const box = form.locator('input[name="permitSettings"]');
                await box.waitFor({state: 'visible', timeout: 10_000}).catch(() => {});
                out.box = (await box.count()) ? {checked: await box.isChecked(), label: await page.locator(`label[for="${await box.getAttribute('id')}"]`).innerText().catch(() => null)} : 'absent';
                await snap(page, `${name}-form`, out);
                if (out.box !== 'absent') {
                    if ((await box.isChecked()) !== wanted) await box.setChecked(wanted);
                    const saveBtn = form.locator('button[type="submit"], input[type="submit"]').or(form.getByRole('button', {name: /^(Save|OK)$/})).first();
                    await saveBtn.click();
                    await idle(page);
                    await sleep(1000);
                    out.formStillOpen = await form.isVisible().catch(() => false);
                    out.notices = await page.locator('[role="alert"], .pkpNotification, .ui-pnotify-text').allInnerTexts().catch(() => []);
                    await snap(page, `${name}-after-save`, out);
                }
                record(name, out);
                return out;
            };
            if (!isOps && U.ed) {
                const off = await setPermit(false, '51-permit-untick');
                if (off.box && off.box !== 'absent') {
                    await as(page, U.ed, P);
                    const nav = await readNav(page);
                    const website = await openBackend(page, ctxUrl(app, P, '/management/settings/website'));
                    await snap(page, '52-permit-editor-website', {website, nav});
                    const annPage = await openAnnouncementsPage(page, app, P);
                    await snap(page, '53-permit-editor-announcements-page', {annPage});
                    log(app.name, 'editor w/o permit', JSON.stringify({navAnn: nav.announcementsEntry && nav.announcementsEntry.label, navSettings: !!nav.settingsGroup, order: nav.order, websiteDenied: website.denied, annDenied: annPage.denied, annH1: annPage.mainH1, rows: annPage.list.rows && annPage.list.rows.length}));
                    // the sweep: press the entry itself
                    const entry = page.getByRole('navigation', {name: 'Site Navigation'}).locator('[role="button"]').filter({hasText: /^\s*Announcements\s*$/}).first();
                    if (await entry.count()) { await entry.click(); await idle(page); record('54-permit-editor-from-entry', {url: page.url(), h1: await page.locator('main h1').first().innerText().catch(() => null)}); }
                    await readRoles('55-permit-roles-grid-before-retick');
                    await setPermit(true, '56-permit-retick');
                }
            } else {
                note(`K1 ${app.name}: Roles grid rows with an Edit control: ${JSON.stringify(roles.rows.filter((r) => r.hasEdit).map((r) => r.cells[0]))}; manager-level rows: ${JSON.stringify(roles.rows.filter((r) => /manager/i.test(r.cells[1] || '')).map((r) => [r.cells[0], r.hasEdit]))}`);
            }
            await signOut(page).catch(() => {});
        } finally {
            await close();
        }
    }

    // ---- site: Site Settings › Announcements › Settings, read-only; the manager at the address
    if (on('site')) {
        const {page, close} = await launch(app);
        try {
            await as(page, 'admin', P);
            const res = await openBackend(page, app.url('/index.php/index/admin/settings'));
            const annTab = page.locator('#announcements-button').or(page.getByRole('tab', {name: 'Announcements', exact: true})).first();
            const out = {res, tabPresent: (await annTab.count()) > 0};
            if (out.tabPresent) {
                await loc(page, 'Site Settings: "Announcements" tab', annTab);
                await annTab.click(); await idle(page);
                const panel = page.locator('#announcements').first();
                out.sideTabs = await panel.locator('[role="tablist"]').first().getByRole('tab').allInnerTexts().then((a) => a.map((s) => s.trim())).catch(() => []);
                const settingsSide = panel.getByRole('tab', {name: 'Settings', exact: true}).first();
                if (await settingsSide.count()) { await settingsSide.click(); await idle(page); }
                out.form = await panel.locator('[role="tabpanel"]:visible').first().evaluate((root) => ({
                    fields: [...root.querySelectorAll('.pkpFormField')].map((fld) => ({label: fld.querySelector('legend, .pkpFormFieldLabel')?.innerText.replace(/\s+/g, ' ').trim() ?? null, description: fld.querySelector('.pkpFormField__description')?.innerText.replace(/\s+/g, ' ').trim() ?? null, boxes: [...fld.querySelectorAll('input[type=checkbox]')].map((i) => ({label: i.closest('label')?.innerText.trim(), checked: i.checked})), value: fld.querySelector('input.pkpFormField__input')?.value ?? null, visible: fld.offsetParent !== null})),
                    text: root.innerText.slice(0, 800),
                })).catch((e) => ({error: String(e)}));
                for (const t of out.sideTabs.filter((x) => x !== 'Settings')) {
                    const side = panel.getByRole('tab', {name: t, exact: true}).first();
                    if (await side.count()) { await side.click(); await idle(page); out[`side_${t}`] = (await panel.locator('[role="tabpanel"]:visible').first().innerText().catch(() => '')).slice(0, 400); }
                }
            }
            await snap(page, '60-site-announcements-tab', out);
            log(app.name, 'site tab', JSON.stringify({present: out.tabPresent, side: out.sideTabs, fields: out.form && out.form.fields}));
            // the manager at the site's settings address
            await as(page, U.mgr, P);
            const mgrSite = await openBackend(page, app.url('/index.php/index/admin/settings'));
            await snap(page, '61-site-as-manager', {mgrSite});
            const mgrAdmin = await openBackend(page, app.url('/index.php/index/admin'));
            record('61-site-as-manager-admin-index', {mgrAdmin});
            log(app.name, 'manager at site settings', JSON.stringify({status: mgrSite.httpStatus, denied: mgrSite.denied, login: mgrSite.loginForm, url: mgrSite.url, h1: mgrSite.h1}));
            await signOut(page).catch(() => {});
        } finally {
            await close();
        }
    }

    // ---- offagain: untick and Save; the entry gone after a reload; the page still open; "View" → 404
    if (on('offagain')) {
        const {page, close} = await launch(app);
        try {
            await as(page, U.mgr, P);
            await openAnnouncementsSettingsTab(page, app, P);
            const wasChecked = await enableBox(page).isChecked();
            if (wasChecked) await enableBox(page).uncheck();
            await sleep(300);
            const afterUntick = await settingsFormState(page);
            const saved = await saveSettings(page);
            const navNoReload = await readNav(page);
            await snap(page, '70-offagain-saved', {wasChecked, afterUntick: afterUntick.fields && afterUntick.fields.map((f) => [f.label, f.visible]), form: saved, navNoReload: {ann: !!navNoReload.announcementsEntry, order: navNoReload.order}});
            await page.reload(); await idle(page);
            const navReload = await readNav(page);
            const annPage = await openAnnouncementsPage(page, app, P);
            await snap(page, '71-offagain-page', {nav: navReload, annPage});
            await search(page, 'Call for papers');
            const row = page.locator('main .listPanel .listPanel__item').filter({hasText: 'Call for papers'}).first();
            if (await row.count()) {
                const view = row.getByRole('link', {name: 'View', exact: true}).or(row.getByRole('button', {name: 'View', exact: true})).first();
                await view.click(); await sleep(1500); await idle(page).catch(() => {});
                const body = await page.locator('body').innerText().catch(() => '');
                await snap(page, '72-offagain-view', {landedUrl: page.url(), is404: /404 Not Found/i.test(body)});
            }
            log(app.name, 'offagain', JSON.stringify({navAnnNoReload: !!navNoReload.announcementsEntry, navAnnReload: !!navReload.announcementsEntry, annDenied: annPage.denied, rows: annPage.list.rows && annPage.list.rows.length, addBtn: annPage.list.headerButtons}));
            await signOut(page).catch(() => {});
            await publicRead(page, app, P, '73-public-offagain');
        } finally {
            await close();
        }
    }
});
