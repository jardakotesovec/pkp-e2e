// U12 drift sweep SW09, chunk SWA (2026-11-09): the lines of spec lines 10–483 (Purpose to
// Cross-feature interactions) the kept checks K1–K5, I27A, I28, H15 and H29 do not reach.
// Every screen is recorded with the kit's screen() before it is read. No assertions: facts only.
//
// Seeds its own scratch context per PROBE_RUN (tag prefix u12swa): announcements on with an
// introduction in English and French, "Display on Homepage" 3, French under "Forms", the theme's
// "summary on the homepage" box ticked, one account per permission level, two announcements (one
// whose "Short Description" is French alone). Phases (PHASES=a,b,…; default all):
//   seed      the context (state file outFile('swa-state'), reused by the later phases of the run)
//   levels    every level with announcements ON: the side menu, Settings › Website and the
//             Announcements page by address (Actors rows 1–2); admin in the journal as a control
//   intro     Settings › Website › Setup › Announcements on a two-language journal: the
//             "Introduction" field per language; the public page under /en/ and /fr_CA/
//   fallback  the French-only short description read on the public pages under /en/ (Rule 14, A17)
//   a11       "Edit" › " Draft" added to "Title" › close control › "Edit" again › "Short
//             Description" changed › "Save": the row, a reload, the public page (Rule 6)
//   toobig    "Add Announcement" › "Image" with a 3 MiB file named .png (Fields "Image")
//   ico       "Add Announcement" › "Image" with an icon file (photo.ico), "Save": stored, printed, loaded
//   home      a highlight (Setup › Highlights) and a homepage image (Appearance › Setup) added by
//             screen, then the home page's block order signed out; the highlight on the
//             Announcements page (Rule 11; Cross-feature, Highlights)
//   hlfeed    OJS: the "Announcement Feed Plugin" ticked on the Plugins tab, then the three feeds
//             signed out: is the highlight in any of them (Cross-feature, Highlights)
//   jobfail   "Add Announcement" with "Send an email…" ticked, then "Delete" › "Yes" before the
//             background jobs run; the drain, the failed jobs, the mail (sweep of Side effects)
//   adminrole the administrator's row in Users & Roles: what the row's menu offers (Actors row 6)
//   adminnorole (not in the default set; PHASES=adminnorole) the manager's "Remove User" on
//             `admin`, then an add with "Send an email…" ticked: the drain, who is emailed and
//             notified. On main 2026-11-09 the removal ends in "An unexpected error has occurred…"
//             (U53 A2), so the administrator keeps the role and the add tells it as before.
//   PART=onejournal (dataset fleet only, no phases): the Site Settings tabs as `admin` on a
//             one-journal site (Rule 16), read-only
//
// Run (campaign fleet, main; each app under the shared app lock, twice: PROBE_RUN=r1 and r2):
//   bin/app-lock.sh shared ojs -- env PROBE_FEATURE=U12 PROBE_AGENT=ccSWA PROBE_RUN=r1 \
//       node bin/probe.js ojs shared/playwright/checks/U12/SWA/swa.js
//   (likewise omp, ops; then PROBE_RUN=r2. PHASES=seed,levels narrows; later phases read the
//   run's state file, so a narrowed run without seed needs the earlier run's PROBE_RUN.)
// One-journal site (PKP's dataset, read-only, no reset needed; main under the lock, 3.5 without):
//   bin/app-lock.sh shared ojs -- env PART=onejournal PKP_E2E_DATASET=6 PROBE_FEATURE=issues-sw09 \
//       PROBE_NOTES_FEATURE=U12 PROBE_AGENT=ccSWA PROBE_RUN=r1 node bin/probe.js ojs shared/playwright/checks/U12/SWA/swa.js
//   PKP_E2E_LINE=stable-3_5_0 PART=onejournal PKP_E2E_DATASET=6 PROBE_FEATURE=issues-sw09-3_5 \
//       PROBE_NOTES_FEATURE=U12 PROBE_AGENT=ccSWA PROBE_RUN=s1 node bin/probe.js all shared/playwright/checks/U12/SWA/swa.js
// No other script or file is read; the pictures are built in memory.
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, signOut, screen, shot, record, loc, note, idle, tag, outFile, drainJobs, sql, serverLog} =
    require('../../../probe');

const PART = process.env.PART || 'all';
const ALL_PHASES = ['seed', 'levels', 'intro', 'fallback', 'a11', 'toobig', 'ico', 'home', 'hlfeed', 'jobfail', 'adminrole'];
const PHASES = process.env.PHASES ? process.env.PHASES.split(',') : ALL_PHASES;
const on = (p) => PHASES.includes(p);
const RUN = process.env.PROBE_RUN || 'r0';
const log = (...a) => console.log('[swa]', ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const T = 20_000;
const DENIED = /does not have access to this operation/i;
const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAADwAAAAoEAIAAAB9SdLrAAAAIGNIUk0AAHomAACAhAAA+gAAAIDoAAB1MAAA6mAAADqYAAAXcJy6UTwAAAAGYktHRP///////wlY99wAAAAHdElNRQfqCREJDig6WX40AAAAJXRFWHRkYXRlOmNyZWF0ZQAyMDI2LTA5LTE3VDA5OjE0OjQwKzAwOjAwEcvpMQAAACV0RVh0ZGF0ZTptb2RpZnkAMjAyNi0wOS0xN1QwOToxNDo0MCswMDowMGCWUY0AAAAodEVYdGRhdGU6dGltZXN0YW1wADIwMjYtMDktMTdUMDk6MTQ6NDArMDA6MDA3g3BSAAAAq0lEQVRo3u3ZwQnDMBAF0RVsjq7LhbjNpKTgEr4PrkEjEPMqWMRnLhrJdZ1nabKu6v78Vp+xv67q7u/qM/bnoiHvQ7vo6d50uOjpXDTERkNcNMRGQ1w0xEZDXDTERkNcNMRGQ1w0xEZDXDTERkNcNMRGQ1w0xEZD/AWHuGiIjYa4aIiNhrhoiI2GuGiIjYa4aIiNhozkvv/H6jP2Z6MhNhpioyEjSZLVZ+zvAbdfK88pZb8oAAAAAElFTkSuQmCC';
const PNG = () => ({name: 'photo.png', mimeType: 'image/png', buffer: Buffer.from(PNG_B64, 'base64')});
// 3 MiB named as a picture: the box judges size before any upload, so the bytes need not be a PNG.
// a 16×16 icon (ICO holding a PNG): getimagesize() reads it as image/vnd.microsoft.icon
const ICO_B64 = 'AAABAAEAEBAAAAEAIABSAAAAFgAAAIlQTkcNChoKAAAADUlIRFIAAAAQAAAAEAgGAAAAH/P/YQAAABlJREFUeJxjOGFj858SzDBqwKgBowYMFwMA7fE/HyYCVCYAAAAASUVORK5CYII=';
const ICO = () => ({name: 'photo.ico', mimeType: 'image/vnd.microsoft.icon', buffer: Buffer.from(ICO_B64, 'base64')});
const BIG = () => ({name: 'big.png', mimeType: 'image/png', buffer: Buffer.alloc(3 * 1024 * 1024, 7)});

const ctxUrl = (app, p, sub = '', locale = '') => app.url(`/index.php/${p}${locale ? '/' + locale : ''}${sub}`);
const dialog = (page) => page.locator('[role="dialog"]:visible').last();
const stateName = 'swa-state';

async function snap(page, name, extra = {}) {
    const s = await screen(page).catch((e) => ({screenError: String(e.message || e)}));
    record(name, {...s, ...extra});
    await shot(page, name).catch(() => {});
    return s;
}

/** The backend side navigation: the group labels in order. */
async function readNav(page) {
    const nav = page.getByRole('navigation', {name: 'Site Navigation'});
    if (!(await nav.count().catch(() => 0))) return {present: false, url: page.url()};
    const order = await nav.locator('[role="button"]').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') || e.textContent.replace(/\s+/g, ' ').trim())).catch(() => []);
    return {present: true, url: page.url(), order, announcements: order.includes('Announcements'), settings: order.includes('Settings')};
}
async function openBackend(page, url) {
    const resp = await page.goto(url).catch(() => null);
    await idle(page);
    const body = await page.locator('body').innerText().catch(() => '');
    return {url: page.url(), httpStatus: resp ? resp.status() : null, denied: DENIED.test(body),
        h1: await page.locator('main h1, h1').allInnerTexts().then((a) => a.map((s) => s.trim())).catch(() => []),
        tabs: await page.getByRole('tab').allInnerTexts().then((a) => a.map((s) => s.trim())).catch(() => [])};
}

async function listState(page) {
    const panel = page.locator('main .listPanel').first();
    if (!(await panel.count().catch(() => 0))) return {present: false};
    return panel.evaluate((root) => ({
        present: true,
        headerButtons: [...root.querySelectorAll('.pkpHeader__actions button, .listPanel__header button')].map((b) => (b.getAttribute('aria-label') || b.innerText).replace(/\s+/g, ' ').trim()),
        empty: root.querySelector('.listPanel__empty')?.innerText.trim() ?? null,
        rows: [...root.querySelectorAll('.listPanel__item')].map((li) => ({
            title: li.querySelector('.listPanel__itemTitle')?.innerText.trim() ?? null,
            viewHref: li.querySelector('a')?.getAttribute('href') ?? null,
        })),
    })).catch((e) => ({error: String(e.message || e)}));
}
const rowId = (ls, title) => { const r = (ls.rows || []).find((x) => x.title === title); const m = r && r.viewHref && r.viewHref.match(/announcement\/view\/(\d+)/); return m ? Number(m[1]) : null; };

async function openAnnouncementsPage(page, app, P, locale = '') {
    await page.goto(ctxUrl(app, P, '/management/settings/announcements', locale));
    await idle(page);
    await page.locator('main .listPanel').first().waitFor({timeout: T}).catch(() => {});
    await idle(page);
    return listState(page);
}
function field(page, label, index = 0) {
    return dialog(page).locator('.pkpFormField').filter({hasText: new RegExp(`(^|\\s)${label}`)}).nth(index);
}
const textInput = (page, label, index = 0) => field(page, label, index).locator('input.pkpFormField__input, input[type=text]').first();
async function richBody(page, label, index = 0) {
    const f = field(page, label, index);
    const frame = f.locator('iframe').first();
    await frame.waitFor({timeout: T});
    const body = frame.contentFrame().locator('body');
    await body.waitFor({timeout: T});
    await page.waitForFunction((el) => el.contentDocument && el.contentDocument.body && el.contentDocument.body.getAttribute('contenteditable') === 'true', await frame.elementHandle(), {timeout: T}).catch(() => {});
    return body;
}
async function setRich(page, label, text, index = 0) {
    const body = await richBody(page, label, index);
    await body.click();
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.press('Delete');
    if (text) await body.pressSequentially(text);
    await sleep(150);
}
async function openPanel(page, buttonName, rowTitle) {
    if (rowTitle) {
        const row = page.locator('main .listPanel .listPanel__item').filter({hasText: rowTitle}).first();
        await row.getByRole('button', {name: buttonName, exact: true}).click();
    } else {
        await page.locator('main .listPanel').first().getByRole('button', {name: buttonName, exact: true}).click();
    }
    await dialog(page).waitFor({timeout: T});
    await dialog(page).locator('.pkpFormPage__footer').waitFor({timeout: T});
    await idle(page);
    await sleep(400);
}
/** The open panel as data: heading, error summary, field errors, footer buttons and the Image box. */
async function panelState(page) {
    const d = dialog(page);
    if (!(await d.count())) return {open: false};
    return d.evaluate((root) => {
        const txt = (el) => (el ? el.innerText.replace(/\s+/g, ' ').trim() : null);
        const img = [...root.querySelectorAll('.pkpFormField')].find((f) => /^Image/.test(txt(f.querySelector('.pkpFormFieldLabel, legend')) || ''));
        return {
            open: true,
            heading: txt(root.querySelector('h1, h2')),
            errorSummary: txt(root.querySelector('.pkpFormErrors, .pkpForm__errors')),
            fieldErrors: [...root.querySelectorAll('.pkpFieldError')].map(txt),
            footer: [...root.querySelectorAll('.pkpFormPage__footer button')].map((b) => ({name: b.innerText.trim(), disabled: b.disabled})),
            titleValues: [...root.querySelectorAll('input[name^="title"]')].map((i) => i.value),
            image: img ? {text: txt(img), buttons: [...img.querySelectorAll('button, a')].filter((b) => b.offsetParent !== null).map((b) => ({name: txt(b), disabled: b.disabled || false})), dzErrors: [...img.querySelectorAll('.dz-error-message')].map(txt).filter(Boolean)} : null,
        };
    });
}
async function pressSave(page) {
    const btn = dialog(page).getByRole('button', {name: 'Save', exact: true});
    if (await btn.isDisabled().catch(() => false)) return {saveDisabled: true};
    await btn.click();
    await idle(page); await sleep(600); await idle(page);
    return {saveDisabled: false, stillOpen: (await page.locator('[role="dialog"]:visible').count()) > 0};
}
async function closePanel(page) {
    const close = dialog(page).getByRole('button', {name: 'Close', exact: true}).first();
    if (await close.count()) await close.click();
    await page.locator('[role="dialog"]:visible').waitFor({state: 'hidden', timeout: T}).catch(() => {});
    await idle(page);
}
async function publicRead(page, url) {
    const resp = await page.goto(url).catch(() => null);
    await idle(page);
    return page.evaluate(() => {
        const txt = (el) => (el ? el.innerText.replace(/\s+/g, ' ').trim() : null);
        const main = document.querySelector('.pkp_structure_main');
        const pageDiv = main ? [...main.children].find((c) => c.tagName === 'DIV') : null;
        return {
            url: location.href, title: document.title,
            h1: [...document.querySelectorAll('h1')].map(txt),
            blocks: pageDiv ? [...pageDiv.children].map((c) => ({tag: c.tagName.toLowerCase(), cls: (c.className || '').toString().slice(0, 60), heading: c.querySelector('h1,h2,h3')?.innerText.trim().slice(0, 60) ?? null, text: txt(c).slice(0, 120)})) : null,
            summaries: [...document.querySelectorAll('.obj_announcement_summary, .obj_announcement_full')].map(txt),
            highlights: document.querySelectorAll('.highlights, .swiper').length,
            skip: [...document.querySelectorAll('.pkp_skip_links a, a[href^="#"]')].map(txt).filter((t) => /^Skip/.test(t || '')),
        };
    }).then((d) => ({status: resp ? resp.status() : null, ...d}));
}
async function openWebsiteTab(page, app, P, topId, sideName) {
    await page.goto(ctxUrl(app, P, '/management/settings/website'));
    await idle(page);
    const top = page.locator(`#${topId}-button`).first();
    await top.waitFor({timeout: T});
    if ((await top.getAttribute('aria-selected')) !== 'true') await top.click();
    await idle(page);
    const panel = page.locator(`[role="tabpanel"]#${topId}`).first();
    const tab = panel.getByRole('tab', {name: sideName, exact: true});
    const present = (await tab.count()) > 0;
    if (present) { await tab.first().click(); await idle(page); }
    return {present};
}
async function saveVueForm(page, form) {
    const resp = page.waitForResponse((r) => /^(PUT|POST)$/.test(r.request().method()) && /\/api\/v1\//.test(r.url()), {timeout: T}).catch(() => null);
    await form.getByRole('button', {name: 'Save', exact: true}).click();
    const r = await resp;
    await page.locator('[role="status"]:has-text("Saved")').first().waitFor({timeout: T}).catch(() => {});
    await idle(page);
    return r ? {status: r.status(), url: r.url().replace(/^https?:\/\/[^/]+/, '')} : null;
}
async function as(page, user, P) {
    await signIn(page, user, {contextPath: P});
    await idle(page);
}

// ---------------------------------------------------------------------------
// PART=onejournal: a dataset fleet, read-only.
async function oneJournal(app) {
    const {page, close} = await launch(app);
    try {
        await signIn(page, 'admin');
        await idle(page);
        let contexts; try { contexts = sql(app, `select path from ${app.contextTables.table}`); } catch (e) { contexts = `error ${e.message}`; }
        const res = await openBackend(page, app.url('/index.php/index/admin/settings'));
        const topTabs = await page.locator('main [role="tablist"]').first().getByRole('tab').allInnerTexts().then((a) => a.map((s) => s.trim())).catch(() => []);
        await snap(page, 'swa-90-onejournal-site-settings', {contexts: contexts.split('\n'), res, topTabs, announcementsTab: topTabs.includes('Announcements')});
        const hosted = await openBackend(page, app.url('/index.php/index/admin/contexts'));
        await snap(page, 'swa-91-onejournal-hosted', {hosted});
        log(app.name, 'onejournal', JSON.stringify({contexts, topTabs}));
        note(`ccSWA [${app.name} ${app.line || 'main'}]: one-context dataset site: Site Settings top tabs ${JSON.stringify(topTabs)}`);
    } finally { await close(); }
}

// ---------------------------------------------------------------------------

forEachApp(async (app) => {
    if (PART === 'onejournal') return oneJournal(app);
    const isOps = app.name === 'ops';
    const sf = outFile(stateName);
    let st = fs.existsSync(sf) ? JSON.parse(fs.readFileSync(sf, 'utf8')) : null;
    const saveState = () => fs.writeFileSync(sf, JSON.stringify(st, null, 2));

    // ---- seed ---------------------------------------------------------------
    if (on('seed') || !st) {
        const t = tag('u12swa');
        const summaryKey = {ojs: 'showDescriptionInJournalIndex', omp: 'showDescriptionInPressIndex', ops: 'showDescriptionInServerIndex'}[app.name];
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
        const res = await app.api.createContext({
            tag: t,
            context: {name: {en: `U12 SWA ${t}`, fr_CA: `U12 SWA FR ${t}`}, acronym: 'U12SWA', description: {en: '<p>The SWA about text.</p>'},
                supportedLocales: ['en', 'fr_CA'], supportedFormLocales: ['en', 'fr_CA']},
            users,
            enableAnnouncements: true,
            announcementsIntroduction: {en: '<p>SWA introduction in English.</p>', fr_CA: '<p>Introduction SWA en français.</p>'},
            numAnnouncementsHomepage: 3,
            themeOptions: {[summaryKey]: true},
            announcements: [
                {title: {en: 'Call for papers'}, descriptionShort: {en: '<p>Deadline 1 June.</p>'}, description: {en: '<p>Full text of the call.</p>'}},
                {title: {en: 'Fallback probe'}, descriptionShort: {fr_CA: '<p>Seulement en français.</p>'}, description: {fr_CA: '<p>Texte complet en français.</p>'}},
            ],
        });
        st = {tag: t, path: res.path || t, id: res.contextId, users: Object.fromEntries(users.map((u) => [u.username.slice(t.length), u.username])),
            announcements: res.announcements || []};
        saveState();
        record('swa-00-seed', {st, created: Object.keys(res)});
        note(`ccSWA [${app.name}] ${RUN}: scratch ${st.path} (id ${st.id}), announcements on, en+fr_CA forms, users ${Object.keys(st.users).join('/')}`);
    }
    const P = st.path;
    const U = st.users;

    // ---- levels: side menu, settings, the page, with announcements ON ---------
    if (on('levels')) {
        const {page, close} = await launch(app);
        try {
            const out = {};
            for (const [key, user] of [...Object.entries(U), ['admin', 'admin']]) {
                await as(page, user, P);
                const landed = page.url();
                // the side menu where the account lands (an author's or reviewer's own dashboard), then
                // the editorial dashboard by address when the landing page has none
                let nav = await readNav(page);
                if (!nav.present) {
                    await page.goto(ctxUrl(app, P, '/dashboard/editorial')).catch(() => {});
                    await idle(page);
                    const nav2 = await readNav(page);
                    if (nav2.present) nav = nav2;
                }
                await snap(page, `swa-10-levels-${key}-dashboard`, {nav, landed});
                const website = await openBackend(page, ctxUrl(app, P, '/management/settings/website'));
                await snap(page, `swa-11-levels-${key}-website`, {website});
                const annPage = await openBackend(page, ctxUrl(app, P, '/management/settings/announcements'));
                const navOnPage = annPage.denied ? null : await readNav(page);
                await snap(page, `swa-12-levels-${key}-announcements`, {annPage, navOnPage});
                out[key] = {landed: landed.replace(app.baseURL, ''), nav: nav.present ? nav.order : 'no side menu', navUrl: nav.url.replace(app.baseURL, ''), websiteDenied: website.denied, annDenied: annPage.denied, annH1: annPage.h1};
                await signOut(page);
            }
            record('swa-13-levels-summary', out);
            log(app.name, 'levels', JSON.stringify(out));
        } finally { await close(); }
    }

    // ---- intro: the "Introduction" field on a two-language journal -----------------
    if (on('intro')) {
        const {page, close} = await launch(app);
        try {
            await as(page, U.mgr, P);
            await openWebsiteTab(page, app, P, 'setup', 'Announcements');
            const form = page.locator('#setup [role="tabpanel"]:visible').filter({has: page.getByRole('checkbox', {name: 'Enable announcements'})}).first();
            await form.waitFor({timeout: T}).catch(() => {});
            const before = {text: await form.innerText().catch(() => null), localeButtons: await form.locator('.pkpFormLocales button, .pkpFormLocales__locale').allInnerTexts().catch(() => [])};
            await snap(page, 'swa-20-intro-tab', {before});
            const fr = form.getByRole('button', {name: /^French$/}).first();
            let after = null;
            if (await fr.count()) {
                await fr.click(); await sleep(500); await idle(page);
                after = {text: await form.innerText().catch(() => null), labels: await form.locator('.pkpFormFieldLabel').allInnerTexts().catch(() => [])};
            }
            await snap(page, 'swa-21-intro-tab-french-shown', {after});
            await signOut(page);
            const en = await publicRead(page, ctxUrl(app, P, '/announcement', 'en'));
            await snap(page, 'swa-22-intro-public-en', {read: en});
            const frp = await publicRead(page, ctxUrl(app, P, '/announcement', 'fr_CA'));
            await snap(page, 'swa-23-intro-public-fr', {read: frp});
            record('swa-24-intro-summary', {localeButtons: before.localeButtons, frenchLabels: after && after.labels, enText: (en.blocks || []).map((b) => b.text), frText: (frp.blocks || []).map((b) => b.text)});
        } finally { await close(); }
    }

    // ---- fallback: a French-only short description on the English pages (Rule 14, A17) ----
    if (on('fallback')) {
        const {page, close} = await launch(app);
        try {
            const id = (st.announcements.find((a) => /Fallback/.test(JSON.stringify(a.title || a))) || {}).id;
            const reads = {};
            for (const [k, u] of [['list-en', ctxUrl(app, P, '/announcement', 'en')], ['view-en', ctxUrl(app, P, `/announcement/view/${id}`, 'en')], ['home-en', ctxUrl(app, P, '', 'en')], ['list-fr', ctxUrl(app, P, '/announcement', 'fr_CA')], ['view-fr', ctxUrl(app, P, `/announcement/view/${id}`, 'fr_CA')]]) {
                reads[k] = await publicRead(page, u);
                await snap(page, `swa-30-fallback-${k}`, {read: reads[k]});
            }
            const pick = (r) => (r.summaries || []).filter((s) => /Fallback/.test(s));
            record('swa-31-fallback-summary', {id, listEn: pick(reads['list-en']), viewEn: reads['view-en'].summaries, homeEn: pick(reads['home-en']), listFr: pick(reads['list-fr']), viewFr: reads['view-fr'].summaries,
                frenchOnEnglish: [reads['list-en'], reads['view-en'], reads['home-en']].some((r) => (r.summaries || []).some((s) => /français/.test(s)))});
        } finally { await close(); }
    }

    // ---- a11: close an edited title unsaved, reopen, save another change (Rule 6) ----
    if (on('a11')) {
        const {page, close} = await launch(app);
        try {
            await as(page, U.mgr, P);
            const before = await openAnnouncementsPage(page, app, P);
            await openPanel(page, 'Edit', 'Call for papers');
            await textInput(page, 'Title').fill('Call for papers Draft');
            await snap(page, 'swa-40-a11-title-typed', {panel: await panelState(page)});
            await closePanel(page);
            const afterClose = await listState(page);
            await snap(page, 'swa-41-a11-after-close', {rows: afterClose.rows});
            await openPanel(page, 'Edit', 'Call for papers');
            const reopened = await panelState(page);
            await setRich(page, 'Short Description', 'Deadline in May.');
            const traffic = [];
            const onReq = (r) => { if (/\/api\/v1\/announcements\/\d+/.test(r.url()) && r.method() !== 'GET') traffic.push({method: r.method(), override: r.headers()['x-http-method-override'] || null, body: (r.postData() || '').slice(0, 300)}); };
            page.on('request', onReq);
            const saved = await pressSave(page);
            page.off('request', onReq);
            const rowsSaved = await listState(page);
            await snap(page, 'swa-42-a11-saved', {reopened, saved, traffic, rows: rowsSaved.rows});
            const reloaded = await openAnnouncementsPage(page, app, P);
            await snap(page, 'swa-43-a11-after-reload', {rows: reloaded.rows});
            await signOut(page);
            const pub = await publicRead(page, ctxUrl(app, P, '/announcement'));
            await snap(page, 'swa-44-a11-public', {read: pub});
            record('swa-45-a11-summary', {rowsBefore: before.rows.map((r) => r.title), afterClose: afterClose.rows.map((r) => r.title), reopenedTitle: reopened.titleValues, savedTitleSent: traffic.map((x) => decodeURIComponent((x.body.match(/title%5Ben%5D=([^&]*)/) || [])[1] || '').replace(/\+/g, ' ')), afterReload: reloaded.rows.map((r) => r.title), publicTitles: (pub.summaries || []).map((s) => s.split(' 20')[0])});
        } finally { await close(); }
    }

    // ---- toobig: a file over the upload limit in "Image" ------------------------------
    if (on('toobig')) {
        const {page, close} = await launch(app);
        try {
            await as(page, U.mgr, P);
            await openAnnouncementsPage(page, app, P);
            await openPanel(page, 'Add Announcement');
            await textInput(page, 'Title').fill('Too big picture');
            const uploads = [];
            const onResp = (r) => { if (/temporaryFiles/.test(r.url())) uploads.push(r.status()); };
            page.on('response', onResp);
            await field(page, 'Image').locator('input[type=file]').first().setInputFiles(BIG());
            await sleep(1500); await idle(page);
            const st1 = await panelState(page);
            await snap(page, 'swa-50-toobig-chosen', {panel: st1, uploads: [...uploads]});
            const saved = await pressSave(page);
            const st2 = await panelState(page);
            await snap(page, 'swa-51-toobig-save-pressed', {saved, panel: st2});
            // REMOVE FILE clears it
            const rm = field(page, 'Image').getByText('REMOVE FILE', {exact: false}).first();
            let afterRemove = null;
            if (await rm.count()) { await rm.click(); await sleep(500); afterRemove = await panelState(page); }
            page.off('response', onResp);
            await snap(page, 'swa-52-toobig-removed', {afterRemove, uploads});
            await closePanel(page);
            record('swa-53-toobig-summary', {imageText: st1.image && st1.image.text, dzErrors: st1.image && st1.image.dzErrors, errorSummary: st1.errorSummary, footer: st1.footer, imageButtons: st1.image && st1.image.buttons, uploads, savePressed: saved, afterRemoveFooter: afterRemove && afterRemove.footer, afterRemoveSummary: afterRemove && afterRemove.errorSummary});
        } finally { await close(); }
    }

    // ---- ico: an icon file in "Image" on "Add Announcement" (Fields "Image": the code keeps .ico) ----
    if (on('ico')) {
        const {page, close} = await launch(app);
        try {
            await as(page, U.mgr, P);
            await openAnnouncementsPage(page, app, P);
            await openPanel(page, 'Add Announcement');
            const title = `Icon picture ${RUN}`;
            await textInput(page, 'Title').fill(title);
            const up = page.waitForResponse((r) => /temporaryFiles/.test(r.url()) && r.request().method() === 'POST', {timeout: T}).catch(() => null);
            await field(page, 'Image').locator('input[type=file]').first().setInputFiles(ICO());
            const ur = await up; await idle(page); await sleep(800);
            const chosen = await panelState(page);
            await snap(page, 'swa-55-ico-chosen', {upload: ur ? {status: ur.status(), body: (await ur.text().catch(() => '')).slice(0, 200)} : null, panel: chosen});
            const resp = page.waitForResponse((r) => /\/api\/v1\/announcements$/.test(r.url()) && r.request().method() === 'POST', {timeout: T}).catch(() => null);
            const saved = await pressSave(page);
            const r = await resp;
            const after = await panelState(page);
            if (after.open) await closePanel(page);
            const ls = await openAnnouncementsPage(page, app, P);
            const id = rowId(ls, title);
            let stored = null;
            try { stored = id ? sql(app, `select setting_value from announcement_settings where announcement_id = ${id} and setting_name = 'image'`) : null; } catch (e) { stored = `error ${e.message}`; }
            await snap(page, 'swa-56-ico-saved', {saved, post: r ? {status: r.status(), body: (await r.text().catch(() => '')).slice(0, 300)} : null, after, id, stored});
            let pub = null, pic = null;
            if (id) {
                await signOut(page);
                pub = await publicRead(page, ctxUrl(app, P, `/announcement/view/${id}`));
                const img = await page.locator('img.obj_announcement_full_image').first().evaluate((i) => ({src: i.getAttribute('src'), alt: i.getAttribute('alt'), loaded: i.complete && i.naturalWidth > 0})).catch(() => null);
                if (img && img.src) { const fr = await page.request.get(new URL(img.src, page.url()).href); pic = {...img, fetch: `${fr.status()} ${fr.headers()['content-type']}`}; }
                await snap(page, 'swa-57-ico-public', {read: pub, pic});
            }
            record('swa-58-ico-summary', {uploadStatus: ur ? ur.status() : null, chosenImage: chosen.image && chosen.image.text, saved, postStatus: r ? r.status() : null, errorSummary: after.errorSummary, rowListed: !!id, stored, pic});
            log(app.name, 'ico', JSON.stringify({postStatus: r ? r.status() : null, stored, pic}));
        } finally { await close(); }
    }

    // ---- home: the block order with a highlight, a homepage image and the summary ----------
    if (on('home')) {
        const {page, close} = await launch(app);
        try {
            await as(page, U.mgr, P);
            // a highlight, through Settings › Website › Setup › Highlights
            const hl = await openWebsiteTab(page, app, P, 'setup', 'Highlights');
            await page.locator('.highlightsListPanel').waitFor({timeout: T}).catch(() => {});
            let hlAdd = null;
            if (!(await page.locator('.highlightsListPanel .listPanel__item').filter({hasText: 'SWA highlight'}).count())) {
                await page.locator('.highlightsListPanel').getByRole('button', {name: 'Add Highlight', exact: true}).click();
                await dialog(page).waitFor({timeout: T}); await idle(page); await sleep(400);
                await setRich(page, 'Title', 'SWA highlight');
                await field(page, 'URL').locator('input').first().fill('https://example.org/swa');
                await field(page, 'Button Label').locator('input').first().fill('SWA more');
                hlAdd = await pressSave(page);
                await page.locator('[role="dialog"]:visible').waitFor({state: 'hidden', timeout: T}).catch(() => {});
            }
            await snap(page, 'swa-60-home-highlight-added', {hl, hlAdd});
            // the homepage image, through Appearance › Setup
            await openWebsiteTab(page, app, P, 'appearance', 'Setup');
            const setupPanel = page.locator('[role="tabpanel"]#appearance');
            const homeInput = page.locator('input[type=file][id*="homepageImage"]').first();
            let homeUpload = null;
            if (await homeInput.count()) {
                const up = page.waitForResponse((r) => /temporaryFiles/.test(r.url()) && r.request().method() === 'POST', {timeout: T}).catch(() => null);
                await homeInput.setInputFiles(PNG());
                const r = await up;
                await idle(page); await sleep(800);
                const imgField = setupPanel.locator('.pkpFormField').filter({hasText: /Homepage image/i}).first();
                const altBox = imgField.locator('input.pkpFormField--uploadImage__altTextInput');
                if (await altBox.count()) await altBox.fill('SWA homepage image');
                const form = setupPanel.getByRole('tabpanel', {name: 'Setup'});
                homeUpload = {upload: r ? r.status() : null, save: await saveVueForm(page, form)};
            }
            await snap(page, 'swa-61-home-image-saved', {homeUpload});
            await signOut(page);
            const home = await publicRead(page, ctxUrl(app, P, '', 'en'));
            await snap(page, 'swa-62-home-order', {read: home});
            const list = await publicRead(page, ctxUrl(app, P, '/announcement', 'en'));
            await snap(page, 'swa-63-home-announcements-page', {read: list});
            const blocks = (home.blocks || []).map((b) => b.cls || b.tag);
            record('swa-64-home-summary', {blocks, blockHeads: (home.blocks || []).map((b) => `${b.cls}|${b.heading}`), skip: home.skip, listMentionsHighlight: (list.summaries || []).some((s) => /SWA highlight/.test(s)) || (list.blocks || []).some((b) => /SWA highlight/.test(b.text)), listHighlightsBlocks: list.highlights});
            log(app.name, 'home', JSON.stringify(blocks));
        } finally { await close(); }
    }

    // ---- hlfeed (OJS): the announcement feeds beside a highlight (Cross-feature, Highlights) ----
    if (on('hlfeed') && app.name === 'ojs') {
        const {page, close} = await launch(app);
        try {
            await as(page, U.mgr, P);
            await openWebsiteTab(page, app, P, 'plugins', 'Installed Plugins');
            const row = page.locator('#pluginGridContainer tr.gridRow').filter({hasText: 'Announcement Feed Plugin'}).first();
            await row.waitFor({timeout: T});
            const box = row.getByRole('checkbox').first();
            let enable = null;
            if (!(await box.isChecked())) {
                const w = page.waitForResponse((r) => /settings-plugin-grid\/enable/.test(r.url()), {timeout: T}).catch(() => null);
                await box.click({noWaitAfter: true}).catch(() => box.dispatchEvent('click'));
                const r = await w; await sleep(800); await idle(page);
                enable = {status: r ? r.status() : null, toast: await page.locator('.pkpNotification').allInnerTexts().catch(() => [])};
            }
            await snap(page, 'swa-65-hlfeed-plugin', {enable});
            await signOut(page);
            const feeds = {};
            for (const t of ['atom', 'rss2', 'rss']) {
                const r = await page.request.get(ctxUrl(app, P, `/gateway/plugin/AnnouncementFeedGatewayPlugin/${t}`));
                const body = await r.text();
                feeds[t] = {status: r.status(), type: r.headers()['content-type'], highlight: /SWA highlight/.test(body), entries: (body.match(/<title>[^<]*<\/title>/g) || []).map((x) => x.replace(/<\/?title>/g, ''))};
            }
            record('swa-66-hlfeed-summary', {feeds});
            log(app.name, 'hlfeed', JSON.stringify(feeds));
        } finally { await close(); }
    }

    // ---- jobfail: deleted before the background jobs ran ---------------------------
    if (on('jobfail')) {
        const {page, close} = await launch(app);
        try {
            const title = `Doomed mail ${RUN}`;
            const failedBefore = Number(await sql(app, `select count(*) from failed_jobs where payload like '%NewAnnouncementNotifyUsers%'`));
            await as(page, U.mgr, P);
            await openAnnouncementsPage(page, app, P);
            await openPanel(page, 'Add Announcement');
            await textInput(page, 'Title').fill(title);
            await setRich(page, 'Short Description', 'Removed before the queue ran.');
            const box = field(page, 'Send Email').getByRole('checkbox').first();
            await box.check();
            const added = await pressSave(page);
            const ls = await listState(page);
            const id = rowId(ls, title);
            // the payload is serialized PHP inside JSON (announcementId\\";i:<id>;): `_` stands for the backslash
            const forIt = `payload like '%NewAnnouncementNotifyUsers%' and payload like '%announcementId_";i:${id};%'`;
            const queued = await sql(app, `select count(*) from jobs where ${forIt}`);
            await snap(page, 'swa-70-jobfail-added', {added, id, queuedForIt: queued});
            // Delete › Yes
            const row = page.locator('main .listPanel .listPanel__item').filter({hasText: title}).first();
            await row.getByRole('button', {name: 'Delete', exact: true}).click();
            const yes = page.locator('[role="dialog"]:visible').getByRole('button', {name: 'Yes', exact: true});
            await yes.waitFor({timeout: T});
            await yes.click();
            await idle(page); await sleep(500);
            await snap(page, 'swa-71-jobfail-deleted', {rows: (await listState(page)).rows});
            const since = new Date();
            const drain = await drainJobs(app).catch((e) => ({error: String(e.message || e)}));
            const failedAfter = Number(await sql(app, `select count(*) from failed_jobs where payload like '%NewAnnouncementNotifyUsers%'`));
            const failedForIt = await sql(app, `select count(*) from failed_jobs where ${forIt}`);
            const queuedAfter = await sql(app, `select count(*) from jobs where ${forIt}`);
            const exc = await sql(app, `select substring(exception from 1 for 120) from failed_jobs where ${forIt} limit 1`);
            let mailToReader = null;
            try { mailToReader = await app.mail.count({to: `${U.rd}@mail.test`, contains: title}); } catch (e) { mailToReader = `error ${e.message}`; }
            // the administrator's Failed Jobs page
            await signOut(page);
            await as(page, 'admin', P);
            const jobsPage = await openBackend(page, app.url('/index.php/index/admin/failedJobs'));
            const jobsText = (await page.locator('main').innerText().catch(() => '')).slice(0, 1500);
            await snap(page, 'swa-72-jobfail-admin-failed-jobs', {jobsPage, jobsText});
            const summary = {id, queuedForIt: queued, drainOk: drain && drain.ok, drainTail: drain && drain.output ? drain.output.split('\n').filter((l) => /Failed|Processed/.test(l)).slice(-6) : drain, failedBefore, failedAfter, failedForIt, queuedAfter, exception: exc, mailToReader, failedJobsPage: {status: jobsPage.httpStatus, h1: jobsPage.h1, mentionsJob: /NewAnnouncementNotifyUsers/.test(jobsText)}};
            record('swa-73-jobfail-summary', summary);
            log(app.name, 'jobfail', JSON.stringify(summary));
        } finally { await close(); }
    }

    // ---- adminrole: the administrator's row in Users & Roles -------------------------
    if (on('adminrole')) {
        const {page, close} = await launch(app);
        try {
            await as(page, U.mgr, P);
            await page.goto(ctxUrl(app, P, '/management/settings/access'));
            await idle(page);
            const rows = page.locator('main tr').filter({hasText: /admin@|\badmin\b/});
            const rowCount = await rows.count();
            const rowTexts = await rows.allInnerTexts().catch(() => []);
            let menu = null;
            if (rowCount) {
                const more = rows.first().getByRole('button').last();
                await more.click().catch(() => {});
                await sleep(500);
                menu = await page.locator('[role="menu"]:visible [role="menuitem"], [role="menu"]:visible a, [role="menu"]:visible button').allInnerTexts().catch(() => []);
            }
            await snap(page, 'swa-80-adminrole-access', {rowCount, rowTexts: rowTexts.map((t) => t.replace(/\s+/g, ' ').slice(0, 200)), menu});
            await page.keyboard.press('Escape').catch(() => {});
            log(app.name, 'adminrole', JSON.stringify({rowCount, menu}));
        } finally { await close(); }
    }

    // ---- adminnorole: the manager removes `admin` from the journal, then a ticked add ----
    if (on('adminnorole')) {
        const {page, close} = await launch(app);
        try {
            const dialogs = [];
            page.on('dialog', async (d) => { dialogs.push({type: d.type(), message: d.message()}); await d.accept().catch(() => {}); });
            const rolesBefore = await sql(app, `select count(*) from user_user_groups uug join user_groups ug on ug.user_group_id = uug.user_group_id join users u on u.user_id = uug.user_id where u.username = 'admin' and ug.context_id = ${st.id}`);
            await as(page, U.mgr, P);
            await page.goto(ctxUrl(app, P, '/management/settings/access'));
            await idle(page);
            const row = page.locator('main tr').filter({hasText: /admin@|\badmin\b/}).first();
            await row.getByRole('button').last().click();
            await sleep(500);
            await page.locator('[role="menu"]:visible').getByText('Remove User', {exact: true}).first().click();
            await sleep(800);
            const confirmText = await page.locator('[role="dialog"]:visible, [role="alertdialog"]:visible').last().innerText().catch(() => null);
            await snap(page, 'swa-81-adminnorole-confirm', {confirmText});
            const confirmBtn = page.locator('[role="dialog"]:visible, [role="alertdialog"]:visible').last().getByRole('button', {name: /^(Remove User|Remove|Yes|OK|Confirm)$/}).first();
            if (await confirmBtn.count()) { await confirmBtn.click(); await idle(page); await sleep(800); }
            await snap(page, 'swa-82-adminnorole-after-remove', {dialogs});
            const rolesAfter = await sql(app, `select count(*) from user_user_groups uug join user_groups ug on ug.user_group_id = uug.user_group_id join users u on u.user_id = uug.user_id where u.username = 'admin' and ug.context_id = ${st.id} and (uug.date_end is null or uug.date_end > now())`);
            // a ticked add, the drain, the mail
            const title = `Admin-less notice ${RUN}`;
            // the queue drained first, so the drain below runs this add's jobs and the watermark marks them
            await drainJobs(app).catch(() => {});
            const mark = Number(await sql(app, 'select coalesce(max(notification_id), 0) from notifications'));
            await openAnnouncementsPage(page, app, P);
            await openPanel(page, 'Add Announcement');
            await textInput(page, 'Title').fill(title);
            await field(page, 'Send Email').getByRole('checkbox').first().check();
            const added = await pressSave(page);
            const drain = await drainJobs(app).catch((e) => ({error: String(e.message || e)}));
            const count = async (to) => { try { return await app.mail.count({to, contains: title}); } catch (e) { return `error ${e.message}`; } };
            const mails = {admin: await count('admin@mail.test'), mgr: await count(`${U.mgr}@mail.test`), rd: await count(`${U.rd}@mail.test`)};
            let notified; try { notified = sql(app, `select u.username from notifications n join users u on u.user_id = n.user_id where n.context_id = ${st.id} and n.type = 8 and n.notification_id > ${mark}`).split('\n'); } catch (e) { notified = `error ${e.message}`; }
            // the administrator's own view of the journal afterwards
            await signOut(page);
            await as(page, 'admin', P);
            const adminAnn = await openBackend(page, ctxUrl(app, P, '/management/settings/announcements'));
            await snap(page, 'swa-83-adminnorole-admin-page', {adminAnn});
            const summary = {rolesBefore, rolesAfter, confirmText, dialogs, added, drainOk: drain && drain.ok, mails, notifiedRecently: notified, adminPage: {denied: adminAnn.denied, h1: adminAnn.h1}};
            record('swa-84-adminnorole-summary', summary);
            log(app.name, 'adminnorole', JSON.stringify(summary));
        } finally { await close(); }
    }
});
