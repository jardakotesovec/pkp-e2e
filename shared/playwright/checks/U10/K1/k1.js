// U10 claim check, chunk K1: the "Theme" tab and what its options do on the
// public pages, on all three apps.
// Spec: docs/specs/U10-appearance-and-theming.md — the "Theme" fields table
// (65–82), Rules 1–9 (142–205), Rule 35 (433–439), Settings 1–8 (455–472),
// register A6, OJS1 (the side-tab switch: no register entry; did not reproduce); footnotes c, e, k, l, m, o, q, y, z, td8–td14, td37.
//
// Seeds its own scratch contexts, signs in from its own scratch manager and
// records every screen with screen():
//   A  French under "UI" only, a summary text, a published issue (OJS) and one
//      published item: the theme options, saving and leaving, the public pages
//   B  English and French under "Forms", a summary text, no issue, one
//      published item: the per-language fields (Rule 3), the second journal
//      of Rule 1, the no-issue end of "Journal Content Organization"
//
//   PROBE_FEATURE=U10 PROBE_AGENT=ccK1 node bin/probe.js all shared/playwright/checks/U10/K1/k1.js
//   PHASES=seed,defaults,french,leave,leave2,look,summary,headerimg,stats,series,series2,lang,lang2,nav2
//   (default: all; later phases reuse k1-state-<app>.json from the seed phase)
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, signOut, screen, shot, record, loc, note, idle, tag, outDir} =
    require('../../../probe');

const ALL = ['seed', 'defaults', 'french', 'leave', 'leave2', 'look', 'summary', 'headerimg', 'stats', 'series', 'series2', 'lang', 'lang2', 'nav2'];
const PHASES = process.env.PHASES ? process.env.PHASES.split(',') : ALL;
const on = (p) => PHASES.includes(p);
const log = (...a) => console.log('[k1]', ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const T = 20_000;
const REPO = path.resolve(__dirname, '../../../../..');
const PNG = path.join(REPO, 'apps/ojs/playwright/fixtures/files/profile-image-400.png');
const stateFile = (app) => path.join(outDir(), `k1-state-${app.name}.json`);

// ---------------------------------------------------------------------------
// helpers

function ctxUrl(app, ctxPath, p = '', locale = '') {
    return app.url(`/index.php/${ctxPath}${locale ? '/' + locale : ''}${p}`);
}

async function snap(page, name, extra = {}) {
    const s = await screen(page).catch((e) => ({screenError: String(e.message || e)}));
    record(name, {...s, ...extra});
    await shot(page, name).catch(() => {});
    return s;
}

async function as(page, user, ctxPath) {
    await signIn(page, user, {contextPath: ctxPath});
    await idle(page);
}

/** Open Settings › Website on a side tab: the top tab by its outer id, then the side tab button by id. */
async function openTab(page, app, P, topId, sideId, {locale = 'en', reload = true} = {}) {
    if (reload) {
        await page.goto(ctxUrl(app, P, '/management/settings/website', locale));
        await idle(page);
    }
    const top = page.locator(`#${topId}-button`).first();
    await top.waitFor({timeout: T});
    if ((await top.getAttribute('aria-selected')) !== 'true') { await top.click(); await idle(page); }
    if (sideId) {
        const side = page.locator(`#${sideId}-button`).first();
        await side.waitFor({timeout: T});
        if ((await side.getAttribute('aria-selected')) !== 'true') { await side.click(); await idle(page); }
    }
    await sleep(300);
    return page.locator(`[role="tabpanel"]#${sideId || topId}`).first();
}

async function tabStrips(page) {
    return page.evaluate(() => {
        const lists = [...document.querySelectorAll('main [role="tablist"]')];
        return lists.map((l) => [...l.querySelectorAll(':scope > [role="tab"], [role="tab"]')].filter((t) => t.closest('[role="tablist"]') === l).map((t) => ({id: t.id, text: t.innerText.trim(), selected: t.getAttribute('aria-selected')})));
    });
}

/** A Vue form's fields as data: label, description, options with state, inputs and their values. */
async function formFields(panel) {
    return panel.evaluate((root) => {
        const txt = (el) => (el ? el.innerText.replace(/\s+/g, ' ').trim() : null);
        return {
            locales: [...root.querySelectorAll('.pkpFormLocales button, .pkpFormLocales .pkpFormLocales__locale')].map((b) => ({text: txt(b), pressed: b.getAttribute('aria-pressed'), cls: b.className})),
            fields: [...root.querySelectorAll('.pkpFormField')].map((f) => ({
                cls: f.className.replace(/\s+/g, ' ').trim(),
                label: txt(f.querySelector('.pkpFormFieldLabel, legend, .pkpFormField__heading, label')),
                description: txt(f.querySelector('.pkpFormField__description')),
                error: txt(f.querySelector('.pkpFieldError')),
                visible: f.offsetParent !== null,
                options: [...f.querySelectorAll('input[type=radio], input[type=checkbox]')].map((i) => ({type: i.type, name: i.name, value: i.value, checked: i.checked, label: txt(i.closest('label')) || (i.labels && i.labels[0] ? txt(i.labels[0]) : null)})),
                selects: [...f.querySelectorAll('select')].map((s) => ({name: s.name, id: s.id, value: s.value, options: [...s.options].map((o) => ({value: o.value, label: o.label, selected: o.selected}))})),
                texts: [...f.querySelectorAll('input:not([type=radio]):not([type=checkbox]):not([type=hidden]), textarea')].map((i) => ({type: i.type, id: i.id, name: i.name, value: i.value, aria: i.getAttribute('aria-label') || i.getAttribute('aria-labelledby'), visible: i.offsetParent !== null})),
            })),
            buttons: [...root.querySelectorAll('button')].filter((b) => b.offsetParent !== null).map((b) => ({text: txt(b), disabled: b.disabled})),
            links: [...root.querySelectorAll('a')].filter((a) => a.offsetParent !== null).map((a) => ({text: txt(a), href: a.getAttribute('href')})),
            status: [...root.querySelectorAll('[role="status"], .pkpFormPage__status')].map(txt),
            text: txt(root),
        };
    }).catch((e) => ({error: String(e.message || e)}));
}

async function saveForm(page, panel) {
    const resp = page.waitForResponse((r) => /^(PUT|POST)$/.test(r.request().method()) && /\/api\/v1\//.test(r.url()) && !/temporaryFiles/.test(r.url()), {timeout: T}).catch(() => null);
    await panel.getByRole('button', {name: /^(Save|Enregistrer)$/}).last().click();
    const r = await resp;
    const saved = await page.locator('[role="status"]').filter({hasText: /Saved|Enregistré/}).first().waitFor({timeout: 8000}).then(() => true).catch(() => false);
    const statusText = await panel.locator('[role="status"], .pkpFormPage__status').allInnerTexts().catch(() => []);
    await idle(page);
    const errBar = await page.locator('.pkpFormPage__status, .pkpNotification, [role=alert]').allInnerTexts().catch(() => []);
    return r ? {status: r.status(), url: r.url(), method: r.request().method(), override: r.request().headers()['x-http-method-override'] || null, saved, statusText, errBar} : {status: null, saved, statusText, errBar};
}

const themePanel = (page) => page.locator('[role="tabpanel"]#theme').first();
const fieldByLabel = (panel, re) => panel.locator('.pkpFormField').filter({hasText: re}).first();

/** What a visitor's page shows that the theme options drive. */
async function pub(page) {
    return page.evaluate(() => {
        const cs = (el) => (el ? getComputedStyle(el) : null);
        const txt = (el) => (el ? el.innerText.replace(/\s+/g, ' ').trim() : null);
        const head = document.querySelector('.pkp_structure_head');
        const siteName = document.querySelector('.pkp_site_name a, .pkp_site_name');
        const navLink = document.querySelector('.pkp_navigation_primary > li > a');
        const userLink = document.querySelector('.pkp_navigation_user > li > a');
        const h1 = document.querySelector('.pkp_structure_main h1');
        const h2 = document.querySelector('.pkp_structure_main h2');
        const p = document.querySelector('.pkp_structure_main p, .pkp_structure_main .value, .pkp_structure_main .abstract');
        const main = document.querySelector('.pkp_structure_main');
        const pageDiv = main ? [...main.children].find((c) => c.tagName === 'DIV') : null;
        const blocks = pageDiv ? [...pageDiv.children].map((c) => ({tag: c.tagName.toLowerCase(), cls: (c.className || '').toString().slice(0, 60), id: c.id || null, heading: c.querySelector('h1,h2,h3') ? c.querySelector('h1,h2,h3').innerText.trim().slice(0, 60) : null, text: c.innerText.replace(/\s+/g, ' ').trim().slice(0, 160), visible: c.getBoundingClientRect().height > 0})) : null;
        return {
            url: location.href,
            header: head ? {bg: cs(head).backgroundColor, bgImage: cs(head).backgroundImage.slice(0, 200), color: cs(head).color, style: head.getAttribute('style')} : null,
            siteName: siteName ? {text: txt(siteName), color: cs(siteName).color} : null,
            navLink: navLink ? {text: txt(navLink), color: cs(navLink).color} : null,
            userLink: userLink ? {text: txt(userLink), color: cs(userLink).color} : null,
            fonts: {body: cs(document.body).fontFamily, h1: h1 ? {text: txt(h1).slice(0, 60), font: cs(h1).fontFamily} : null, h2: h2 ? {text: txt(h2).slice(0, 60), font: cs(h2).fontFamily} : null, p: p ? {text: txt(p).slice(0, 60), font: cs(p).fontFamily} : null},
            loadedFonts: [...new Set([...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family))],
            stylesheets: [...document.querySelectorAll('link[rel=stylesheet]')].map((l) => l.getAttribute('href')),
            inlineStyles: [...document.querySelectorAll('style')].map((s) => s.textContent.slice(0, 300)).filter((s) => /pkp_structure_head|background/.test(s)),
            logo: [...document.querySelectorAll('.pkp_site_name img, .pkp_structure_head img')].map((i) => ({src: i.getAttribute('src'), alt: i.getAttribute('alt'), w: i.naturalWidth})),
            favicon: [...document.querySelectorAll('link[rel~="icon"]')].map((l) => l.getAttribute('href')),
            mainImages: [...document.querySelectorAll('.pkp_structure_main img')].map((i) => ({src: i.getAttribute('src'), alt: i.getAttribute('alt'), w: i.naturalWidth, parent: i.parentElement.className})),
            footer: txt(document.querySelector('.pkp_footer_content')),
            additional: txt(document.querySelector('.additional_content')),
            skipLinks: [...document.querySelectorAll('.cmp_skip_to_content a')].map((a) => ({text: txt(a), href: a.getAttribute('href'), target: (a.getAttribute('href') || '').startsWith('#') ? !!document.getElementById(a.getAttribute('href').slice(1)) : null})),
            about: (() => { const a = document.querySelector('.homepage_about'); return a ? {id: a.id, heading: txt(a.querySelector('h2')), text: txt(a)} : null; })(),
            headings: [...document.querySelectorAll('.pkp_structure_main h2, .pkp_structure_main h3')].map((h) => txt(h)),
            downloads: (() => { const c = document.querySelector('canvas.usageStatsGraph'); const u = document.querySelector('.usageStatsUnavailable'); const s = c ? c.closest('section, .item, div') : null; return {canvas: !!c, canvasVisible: c ? c.getBoundingClientRect().height > 0 : null, unavailable: u ? {text: txt(u), visible: u.offsetParent !== null} : null, section: s ? txt(s).slice(0, 200) : null}; })(),
            blocks,
            lang: document.documentElement.lang,
            published: txt(document.querySelector('.item.published, .item.date_published, .published')),
        };
    });
}

async function visit(page, url, name, extra = {}) {
    await page.goto(url);
    await idle(page);
    await page.evaluate(() => document.fonts && document.fonts.ready).catch(() => {});
    const p = await pub(page).catch((e) => ({error: String(e.message || e)}));
    await snap(page, name, {pub: p, ...extra});
    return p;
}

function itemUrl(app, st) {
    if (app.name === 'ojs') return ctxUrl(app, st.A, `/article/view/${st.itemA}`);
    if (app.name === 'omp') return ctxUrl(app, st.A, `/catalog/book/${st.itemA}`);
    return ctxUrl(app, st.A, `/preprint/view/${st.itemA}`);
}
function itemUrlB(app, st, locale = '') {
    if (app.name === 'ojs') return ctxUrl(app, st.B, `/article/view/${st.itemB}`, locale);
    if (app.name === 'omp') return ctxUrl(app, st.B, `/catalog/book/${st.itemB}`, locale);
    return ctxUrl(app, st.B, `/preprint/view/${st.itemB}`, locale);
}
function listUrl(app, st) {
    if (app.name === 'ojs') return ctxUrl(app, st.A, `/issue/view/${st.issueA}`);
    if (app.name === 'omp') return ctxUrl(app, st.A, '/catalog');
    return ctxUrl(app, st.A, '/preprints');
}

/** Set the theme form's colour through the picker's hex box. */
async function typeColour(page, panel, value) {
    const f = fieldByLabel(panel, /Colour|Couleur|##plugins\.themes\.default\.option\.colour/);
    const inputs = f.locator('input');
    const n = await inputs.count();
    const info = await inputs.evaluateAll((els) => els.map((e) => ({id: e.id, aria: e.getAttribute('aria-labelledby'), value: e.value, label: e.closest('.vc-editable-input') ? e.closest('.vc-editable-input').innerText.trim() : null})));
    const hex = inputs.first();
    await hex.click();
    await hex.fill(value);
    await hex.press('Enter').catch(() => {});
    await hex.blur().catch(() => {});
    await sleep(400);
    const after = await inputs.evaluateAll((els) => els.map((e) => e.value));
    return {count: n, info, after};
}

// ---------------------------------------------------------------------------

forEachApp(async (app) => {
    const isOjs = app.name === 'ojs';
    const isOmp = app.name === 'omp';
    let st = fs.existsSync(stateFile(app)) ? JSON.parse(fs.readFileSync(stateFile(app), 'utf8')) : null;
    const saveState = () => fs.writeFileSync(stateFile(app), JSON.stringify(st, null, 2));
    const summaryRe = /Show the (journal|press|server) summary on the homepage\./;
    const ctxWord = isOjs ? 'journal' : isOmp ? 'press' : 'server';

    // ---- seed ---------------------------------------------------------------
    if (on('seed') || !st) {
        const a = tag('u10k1a');
        const b = tag('u10k1b');
        const usersA = [{username: `${a}m`, roles: ['manager'], givenName: 'Kai', familyName: 'Manager'}];
        const usersB = [{username: `${b}m`, roles: ['manager'], givenName: 'Kira', familyName: 'Manager'}];
        const specA = {tag: a, context: {name: `U10 K1 A ${a}`, acronym: 'K1A', supportedLocales: ['en', 'fr_CA'], description: {en: '<p>The K1 summary text of journal A.</p>'}}, users: usersA};
        if (isOjs) specA.issues = [{volume: 1, number: 1, year: 2026, published: true}];
        const ctxA = await app.api.createContext(specA);
        const specB = {tag: b, context: {name: `U10 K1 B ${b}`, acronym: 'K1B', supportedLocales: ['en', 'fr_CA'], supportedFormLocales: ['en', 'fr_CA'], description: {en: '<p>The K1 summary text of journal B.</p>'}}, users: usersB};
        const ctxB = await app.api.createContext(specB);
        const subA = {tag: `${a}s`, context: a, submitter: `${a}m`, title: `K1 article of A ${a}`, published: true};
        if (isOjs) subA.issue = {volume: 1, number: 1, year: 2026};
        const sA = await app.api.createSubmission(subA);
        let sB = null;
        try {
            sB = await app.api.createSubmission({tag: `${b}s`, context: b, submitter: `${b}m`, title: `K1 article of B ${b}`, published: true});
        } catch (e) { log('B submission', String(e.message || e).slice(0, 300)); }
        st = {A: a, B: b, idA: ctxA.contextId, idB: ctxB.contextId, mA: `${a}m`, mB: `${b}m`, itemA: sA.submissionId, itemB: sB ? sB.submissionId : null, issueA: isOjs && ctxA.issues ? ctxA.issues[0].id : null};
        saveState();
        log('seeded', JSON.stringify(st));
        note(`K1 ${app.name}: scratch A ${a} (fr_CA UI only, summary text, ${isOjs ? 'published issue Vol 1 No 1 (2026) with ' : ''}one published item ${st.itemA}), scratch B ${b} (en+fr_CA Forms, no issue, published item ${st.itemB})`);
    }
    const A = st.A, B = st.B;

    // ---- defaults: the Theme tab as a new journal opens it, A (issue) and B (no issue) ----
    if (on('defaults')) {
        const {page, close} = await launch(app);
        try {
            await as(page, st.mA, A);
            await page.goto(ctxUrl(app, A, '/management/settings/website'));
            await idle(page);
            const strips = await tabStrips(page);
            const landing = {url: page.url(), strips};
            const panel = themePanel(page);
            await panel.locator('.pkpFormField').first().waitFor({timeout: T});
            await idle(page);
            const ff = await formFields(panel);
            await snap(page, '01-theme-defaults-A', {landing, form: ff});
            await loc(page, 'Appearance › Theme: the tab panel', panel);
            await loc(page, 'Appearance › Theme: the "Theme" select', panel.locator('select').first());
            await loc(page, 'Appearance › Theme: summary box', panel.getByRole('checkbox', {name: summaryRe}));
            await loc(page, 'Appearance › Theme: colour picker inputs', fieldByLabel(panel, /Colour/).locator('input'));
            await loc(page, 'Appearance › Theme: Save', panel.getByRole('button', {name: 'Save', exact: true}));
            // the Plugins tab link in the Theme description
            const plugLink = panel.locator('a').filter({hasText: /Plugins/}).first();
            let plugClick = null;
            if (await plugLink.count()) {
                const href = await plugLink.getAttribute('href');
                await plugLink.click(); await idle(page);
                plugClick = {href, url: page.url(), strips: await tabStrips(page)};
                await snap(page, '01b-theme-plugins-link-A', {plugClick});
            }
            log('defaults A fields', JSON.stringify(ff.fields && ff.fields.map((f) => f.label)));
            // Plugins › Installed Plugins: the theme plugins listed
            await openTab(page, app, A, 'plugins', 'installedPlugins');
            await page.locator('#installedPlugins tr.gridRow, [role="tabpanel"]#installedPlugins tr').first().waitFor({timeout: T}).catch(() => {});
            await idle(page);
            const themeRows = await page.locator('[role="tabpanel"]#installedPlugins').evaluate((root) => {
                const rows = [...root.querySelectorAll('tr')];
                const out = []; let inThemes = false;
                for (const r of rows) {
                    const t = r.innerText.replace(/\s+/g, ' ').trim();
                    if (r.classList.contains('category') || /^Theme Plugins/.test(t)) inThemes = /Theme Plugins/.test(t);
                    else if (inThemes && t) out.push({text: t.slice(0, 160), checked: (r.querySelector('input[type=checkbox]') || {}).checked ?? null});
                }
                return out;
            }).catch((e) => ({error: String(e.message || e)}));
            await snap(page, '01c-plugins-theme-rows-A', {themeRows});
            log('theme plugin rows', JSON.stringify(themeRows));
            await as(page, st.mB, B);
            await page.goto(ctxUrl(app, B, '/management/settings/website'));
            await idle(page);
            const pB = themePanel(page);
            await pB.locator('.pkpFormField').first().waitFor({timeout: T});
            await snap(page, '02-theme-defaults-B', {form: await formFields(pB)});
            await signOut(page);
        } finally { await close(); }
    }

    // ---- french: the Theme tab in the French interface (Rule 35, A6) ----
    if (on('french')) {
        const {page, close} = await launch(app);
        try {
            await as(page, st.mA, A);
            const panel = await openTab(page, app, A, 'appearance', 'theme', {locale: 'fr_CA'});
            await panel.locator('.pkpFormField').first().waitFor({timeout: T});
            const ff = await formFields(panel);
            const raw = [...new Set((ff.text || '').match(/##[^#\s]+##/g) || [])];
            await snap(page, '03-theme-french-A', {form: ff, rawCodes: raw, strips: await tabStrips(page)});
            log('french raw codes', raw.length, JSON.stringify(raw));
            await signOut(page);
        } finally { await close(); }
    }

    // ---- leave: td8, Rule 2 (no register entry; did not reproduce) ----
    if (on('leave')) {
        const {page, close} = await launch(app);
        const dialogs = [];
        page.on('dialog', (d) => { dialogs.push({type: d.type(), message: d.message()}); (d.type() === 'beforeunload' ? d.accept() : d.dismiss()).catch(() => {}); });
        try {
            await as(page, st.mA, A);
            const out = {};
            // 1 Theme: tick the summary, open Setup, back to Theme
            let panel = await openTab(page, app, A, 'appearance', 'theme');
            let box = panel.getByRole('checkbox', {name: summaryRe});
            await box.check();
            const typo = panel.getByRole('radio', {name: /^Lato:/});
            await typo.check();
            out.themeBefore = {summary: await box.isChecked(), lato: await typo.isChecked()};
            await page.locator('#appearance-setup-button').click(); await idle(page); await sleep(300);
            await snap(page, '10-leave-setup-after-theme');
            await page.locator('#theme-button').click(); await idle(page); await sleep(300);
            panel = themePanel(page);
            out.themeAfterSideTab = {summary: await panel.getByRole('checkbox', {name: summaryRe}).isChecked(), lato: await panel.getByRole('radio', {name: /^Lato:/}).isChecked(), noto: await panel.getByRole('radio', {name: /^Noto Sans:/}).isChecked()};
            await snap(page, '11-leave-theme-back', {out});
            // 1b Theme changed, then the top tab "Setup" and back
            await panel.getByRole('checkbox', {name: summaryRe}).check();
            await page.locator('#setup-button').first().click(); await idle(page);
            await page.locator('#appearance-button').first().click(); await idle(page); await sleep(300);
            out.themeAfterTopTab = {summary: await themePanel(page).getByRole('checkbox', {name: summaryRe}).isChecked()};
            // 2 Setup: type a footer, open Advanced, come back
            panel = await openTab(page, app, A, 'appearance', 'appearance-setup', {reload: false});
            const footerFrame = fieldByLabel(panel, /Page Footer/).locator('iframe').first();
            await footerFrame.waitFor({timeout: T});
            await page.waitForFunction((el) => el.contentDocument && el.contentDocument.body && el.contentDocument.body.getAttribute('contenteditable') === 'true', await footerFrame.elementHandle(), {timeout: T}).catch(() => {});
            const fbody = footerFrame.contentFrame().locator('body');
            await fbody.click(); await fbody.pressSequentially('Footer draft'); await sleep(300);
            await page.locator('#advanced-button').click(); await idle(page); await sleep(300);
            await page.locator('#appearance-setup-button').click(); await idle(page); await sleep(500);
            out.footerAfterSideTab = await fieldByLabel(themePanel(page).page().locator('[role="tabpanel"]#appearance-setup'), /Page Footer/).locator('iframe').first().evaluate((f) => f.contentDocument.body.innerText).catch((e) => 'ERR ' + e.message);
            // 3 Lists: 7, open Date & Time, come back
            panel = await openTab(page, app, A, 'setup', 'lists', {reload: false});
            const ipp = fieldByLabel(panel, /Items per page/).locator('input').first();
            await ipp.fill('7');
            await page.locator('#dateTime-button').click(); await idle(page); await sleep(300);
            // save Date & Time untouched while Lists holds 7 unsaved
            const dt = page.locator('[role="tabpanel"]#dateTime').first();
            out.dateTimeSave = await saveForm(page, dt);
            await page.locator('#lists-button').click(); await idle(page); await sleep(300);
            out.listsAfterSideTab = await fieldByLabel(page.locator('[role="tabpanel"]#lists'), /Items per page/).locator('input').first().inputValue();
            await snap(page, '12-leave-lists-back', {out});
            // Lists after a reload: the Date & Time save stored nothing of Lists
            panel = await openTab(page, app, A, 'setup', 'lists');
            out.listsAfterReload = await fieldByLabel(panel, /Items per page/).locator('input').first().inputValue();
            // 4 footer typed again, then the side menu's "Website"
            panel = await openTab(page, app, A, 'appearance', 'appearance-setup');
            const ff2 = fieldByLabel(panel, /Page Footer/).locator('iframe').first();
            await ff2.waitFor({timeout: T});
            await page.waitForFunction((el) => el.contentDocument && el.contentDocument.body && el.contentDocument.body.getAttribute('contenteditable') === 'true', await ff2.elementHandle(), {timeout: T}).catch(() => {});
            await ff2.contentFrame().locator('body').click(); await ff2.contentFrame().locator('body').pressSequentially('Footer draft'); await sleep(300);
            await page.locator('main h1').first().click().catch(() => {});
            const nDialogs = dialogs.length;
            const website = page.getByRole('link', {name: 'Website', exact: true}).first();
            out.websiteLink = {count: await website.count(), href: await website.getAttribute('href').catch(() => null)};
            await website.click(); await page.waitForLoadState('load').catch(() => {}); await idle(page);
            out.dialogsOnLeave = dialogs.slice(nDialogs);
            panel = await openTab(page, app, A, 'appearance', 'appearance-setup', {reload: false});
            const ff3 = fieldByLabel(panel, /Page Footer/).locator('iframe').first();
            await ff3.waitFor({timeout: T}); await sleep(800);
            out.footerAfterLeave = await ff3.evaluate((f) => f.contentDocument.body.innerText).catch((e) => 'ERR ' + e.message);
            // 5 Theme changed, then leave for the Dashboard by a link
            panel = await openTab(page, app, A, 'appearance', 'theme');
            await panel.getByRole('checkbox', {name: summaryRe}).check();
            const n2 = dialogs.length;
            await page.goto(ctxUrl(app, A, '/dashboard/editorial')).catch(() => {}); await idle(page);
            out.dialogsOnThemeLeave = dialogs.slice(n2);
            panel = await openTab(page, app, A, 'appearance', 'theme');
            out.summaryAfterThemeLeave = await panel.getByRole('checkbox', {name: summaryRe}).isChecked();
            out.allDialogs = dialogs;
            await snap(page, '13-leave-summary', {out});
            log('leave', JSON.stringify(out));
            await signOut(page);
        } finally { await close(); }
    }

    // ---- leave2: the second run of the side-tab switch, kept ticks saved and read back; the side menu's
    //      "Website" with a footer typed (a marker on window tells a reload from none); the unsaved-change dot ----
    if (on('leave2')) {
        const {page, close} = await launch(app);
        const dialogs = [];
        page.on('dialog', (d) => { dialogs.push({type: d.type(), message: d.message()}); (d.type() === 'beforeunload' ? d.accept() : d.dismiss()).catch(() => {}); });
        try {
            await as(page, st.mA, A);
            const out = {};
            let panel = await openTab(page, app, A, 'appearance', 'theme');
            out.stripsClean = await tabStrips(page);
            const hdr = /Show the homepage image as the header background\./;
            await panel.getByRole('radio', {name: /^Use line type/}).check();
            await panel.getByRole('checkbox', {name: hdr}).check();
            out.stripsDirty = await tabStrips(page);
            for (const side of ['appearance-masthead', 'advanced', 'appearance-setup']) {
                await page.locator(`#${side}-button`).click(); await idle(page); await sleep(300);
            }
            await page.locator('#theme-button').click(); await idle(page); await sleep(300);
            panel = themePanel(page);
            out.afterThreeTabs = {line: await panel.getByRole('radio', {name: /^Use line type/}).isChecked(), hdr: await panel.getByRole('checkbox', {name: hdr}).isChecked()};
            await snap(page, '14-leave2-theme-back', {out});
            out.save = await saveForm(page, panel);
            out.stripsAfterSave = await tabStrips(page);
            await page.reload(); await idle(page);
            panel = await openTab(page, app, A, 'appearance', 'theme', {reload: false});
            out.afterReload = {line: await panel.getByRole('radio', {name: /^Use line type/}).isChecked(), hdr: await panel.getByRole('checkbox', {name: hdr}).isChecked()};
            // put them back
            await panel.getByRole('radio', {name: /^Do not display submission usage/}).check();
            await panel.getByRole('checkbox', {name: hdr}).uncheck();
            out.saveBack = await saveForm(page, panel);
            // footer typed, then the side menu's "Website"
            panel = await openTab(page, app, A, 'appearance', 'appearance-setup');
            const fr = fieldByLabel(panel, /Page Footer/).locator('iframe').first();
            await fr.waitFor({timeout: T});
            await page.waitForFunction((el) => el.contentDocument && el.contentDocument.body && el.contentDocument.body.getAttribute('contenteditable') === 'true', await fr.elementHandle(), {timeout: T}).catch(() => {});
            await fr.contentFrame().locator('body').click(); await fr.contentFrame().locator('body').pressSequentially('Footer draft two'); await sleep(300);
            await page.locator('main h1').first().click().catch(() => {});
            out.stripsFooterDirty = await tabStrips(page);
            await page.evaluate(() => { window.__k1marker = 1; });
            out.urlBefore = page.url();
            const website = page.getByRole('link', {name: 'Website', exact: true}).first();
            const nav = page.waitForEvent('framenavigated', {timeout: 8000}).then(() => true).catch(() => false);
            await website.click();
            out.navigated = await nav;
            await page.waitForLoadState('load').catch(() => {}); await idle(page);
            out.urlAfter = page.url();
            out.markerAfter = await page.evaluate(() => window.__k1marker || null);
            out.dialogsOnWebsite = [...dialogs];
            panel = await openTab(page, app, A, 'appearance', 'appearance-setup', {reload: false});
            const fr2 = fieldByLabel(panel, /Page Footer/).locator('iframe').first();
            await fr2.waitFor({timeout: T}); await sleep(1000);
            out.footerAfterWebsite = await fr2.evaluate((f) => f.contentDocument.body.innerText).catch((e) => 'ERR ' + e.message);
            await snap(page, '15-leave2-after-website-link', {out});
            // a plain reload
            await page.reload(); await idle(page);
            panel = await openTab(page, app, A, 'appearance', 'appearance-setup', {reload: false});
            const fr3 = fieldByLabel(panel, /Page Footer/).locator('iframe').first();
            await fr3.waitFor({timeout: T}); await sleep(1000);
            out.footerAfterReload = await fr3.evaluate((f) => f.contentDocument.body.innerText).catch((e) => 'ERR ' + e.message);
            out.allDialogs = dialogs;
            record('16-leave2', out);
            log('leave2', JSON.stringify(out));
            await signOut(page);
        } finally { await close(); }
    }

    // ---- look: typography and colour (td10, td11, Rules 4–6, Rule 1) ----
    if (on('look')) {
        const {page, close} = await launch(app);
        try {
            await visit(page, ctxUrl(app, A, ''), '20-home-default-A');
            await as(page, st.mA, A);
            await page.goto(ctxUrl(app, A, '/dashboard/editorial')); await idle(page);
            const dashBefore = await page.evaluate(() => { const h = document.querySelector('header'); const cs = h ? getComputedStyle(h) : null; return {bg: cs && cs.backgroundColor, stylesheets: [...document.querySelectorAll('link[rel=stylesheet]')].map((l) => l.getAttribute('href'))}; });
            const runs = [
                {name: 'lora-yellow', typo: /^Lora\/Open Sans:/, colour: '#FFFF00'},
                {name: 'lato-navy', typo: /^Lato:/, colour: '#000080'},
                {name: 'serifsans-navy', typo: /^Noto Serif\/Noto Sans:/, colour: null},
                {name: 'notosans-red', typo: /^Noto Sans:/, colour: 'red'},
                {name: 'notoserif-hex5', typo: /^Noto Serif:/, colour: '#12345'},
            ];
            const results = {dashBefore};
            const P2 = process.env.LOOK_ONLY ? process.env.LOOK_ONLY.split(',') : null;
            for (const r of runs) {
                if (P2 && !P2.includes(r.name)) continue;
                await as(page, st.mA, A);
                const panel = await openTab(page, app, A, 'appearance', 'theme');
                await panel.getByRole('radio', {name: r.typo}).check();
                const typed = r.colour ? await typeColour(page, panel, r.colour) : null;
                const save = await saveForm(page, panel);
                await page.reload(); await idle(page);
                const p2 = themePanel(page);
                await p2.locator('.pkpFormField').first().waitFor({timeout: T});
                const after = await formFields(p2);
                const colourField = after.fields ? after.fields.find((f) => /Colour/.test(f.label || '')) : null;
                const typoField = after.fields ? after.fields.find((f) => /Typography/.test(f.label || '')) : null;
                await snap(page, `21-theme-saved-${r.name}`, {typed, save, colour: colourField, typography: typoField && typoField.options.filter((o) => o.checked)});
                if (r.name === 'lora-yellow') {
                    await page.goto(ctxUrl(app, A, '/dashboard/editorial')); await idle(page);
                    const dashAfter = await page.evaluate(() => { const h = document.querySelector('header'); const cs = h ? getComputedStyle(h) : null; return {bg: cs && cs.backgroundColor, font: getComputedStyle(document.body).fontFamily, stylesheets: [...document.querySelectorAll('link[rel=stylesheet]')].map((l) => l.getAttribute('href'))}; });
                    await snap(page, '22-dashboard-after-colour', {dashBefore, dashAfter});
                    results.dashAfter = dashAfter;
                }
                await signOut(page);
                results[r.name] = {
                    save, typed,
                    home: await visit(page, ctxUrl(app, A, ''), `23-home-${r.name}`),
                    item: await visit(page, itemUrl(app, st), `24-item-${r.name}`),
                    list: await visit(page, listUrl(app, st), `25-list-${r.name}`),
                    about: await visit(page, ctxUrl(app, A, '/about'), `26-about-${r.name}`),
                };
                if (r.name === 'lora-yellow') results.homeB = await visit(page, ctxUrl(app, B, ''), '27-home-B-while-A-yellow');
                log(r.name, 'save', JSON.stringify(save), 'header', JSON.stringify(results[r.name].home.header), 'fonts', JSON.stringify(results[r.name].home.fonts));
            }
            record('28-look-summary', results);
        } finally { await close(); }
    }

    // ---- summary: td12, Rule 7 ----
    if (on('summary')) {
        const {page, close} = await launch(app);
        try {
            const before = await visit(page, ctxUrl(app, A, ''), '30-home-summary-off');
            await as(page, st.mA, A);
            let panel = await openTab(page, app, A, 'appearance', 'theme');
            await panel.getByRole('checkbox', {name: summaryRe}).check();
            const save = await saveForm(page, panel);
            await snap(page, '31-theme-summary-saved', {save});
            await signOut(page);
            const afterOn = await visit(page, ctxUrl(app, A, ''), '32-home-summary-on');
            const inB = await visit(page, ctxUrl(app, B, ''), '33-home-B-summary-control');
            // the skip link followed
            const skip = page.locator('.cmp_skip_to_content a').filter({hasText: /About/});
            await page.goto(ctxUrl(app, A, '')); await idle(page);
            let skipFollow = null;
            if (await skip.count()) { const href = await skip.first().getAttribute('href'); skipFollow = {href, target: await page.locator(href).count().catch(() => null)}; }
            // untick
            await as(page, st.mA, A);
            panel = await openTab(page, app, A, 'appearance', 'theme');
            await panel.getByRole('checkbox', {name: summaryRe}).uncheck();
            const save2 = await saveForm(page, panel);
            await signOut(page);
            const afterOff = await visit(page, ctxUrl(app, A, ''), '34-home-summary-off-again');
            record('35-summary', {save, save2, before: before.about, afterOn: {about: afterOn.about, blocks: afterOn.blocks, skip: afterOn.skipLinks}, inB: inB.about, skipFollow, afterOff: afterOff.about});
            log('summary', JSON.stringify(afterOn.about), JSON.stringify(afterOn.skipLinks));
        } finally { await close(); }
    }

    // ---- headerimg: td13, Rule 8 ----
    if (on('headerimg')) {
        const {page, close} = await launch(app);
        try {
            const res = {};
            await as(page, st.mA, A);
            // ticked with no image first
            let panel = await openTab(page, app, A, 'appearance', 'theme');
            const hdr = /Show the homepage image as the header background\./;
            await panel.getByRole('checkbox', {name: hdr}).check();
            res.saveNoImage = await saveForm(page, panel);
            await signOut(page);
            res.homeNoImage = await visit(page, ctxUrl(app, A, ''), '40-home-header-ticked-no-image');
            // upload a homepage image
            await as(page, st.mA, A);
            panel = await openTab(page, app, A, 'appearance', 'appearance-setup');
            const fileInputs = await page.locator('input[type=file]').evaluateAll((els) => els.map((e) => e.id));
            const inp = page.locator('input[type=file][id*="homepageImage"]').first();
            const up = page.waitForResponse((r) => /temporaryFiles/.test(r.url()) && r.request().method() === 'POST', {timeout: T}).catch(() => null);
            await inp.setInputFiles(PNG);
            const upr = await up; await idle(page); await sleep(800);
            const alt = fieldByLabel(panel, /Homepage Image/).locator('input[type=text], input.pkpFormField--uploadImage__altTextInput').first();
            if (await alt.count()) await alt.fill('K1 homepage image');
            res.upload = {fileInputs, status: upr ? upr.status() : null, save: await saveForm(page, panel)};
            await snap(page, '41-setup-image-saved', {res});
            await signOut(page);
            res.homeImageTicked = await visit(page, ctxUrl(app, A, ''), '42-home-header-image');
            res.aboutImageTicked = await visit(page, ctxUrl(app, A, '/about'), '43-about-header-image');
            res.itemImageTicked = await visit(page, itemUrl(app, st), '44-item-header-image');
            // untick: the image back in the body
            await as(page, st.mA, A);
            panel = await openTab(page, app, A, 'appearance', 'theme');
            await panel.getByRole('checkbox', {name: hdr}).uncheck();
            res.saveUntick = await saveForm(page, panel);
            await signOut(page);
            res.homeImageUnticked = await visit(page, ctxUrl(app, A, ''), '45-home-image-in-body');
            // tick again, then Remove the image with the box ticked
            await as(page, st.mA, A);
            panel = await openTab(page, app, A, 'appearance', 'theme');
            await panel.getByRole('checkbox', {name: hdr}).check();
            res.saveRetick = await saveForm(page, panel);
            panel = await openTab(page, app, A, 'appearance', 'appearance-setup');
            const rm = fieldByLabel(panel, /Homepage Image/).getByRole('button', {name: /^Remove/}).first();
            res.removeCount = await rm.count();
            if (res.removeCount) { await rm.click(); await sleep(400); }
            res.saveRemoved = await saveForm(page, panel);
            await signOut(page);
            res.homeRemoved = await visit(page, ctxUrl(app, A, ''), '46-home-header-removed-image');
            res.aboutRemoved = await visit(page, ctxUrl(app, A, '/about'), '47-about-header-removed-image');
            record('48-headerimg', res);
            log('headerimg', JSON.stringify({no: res.homeNoImage.header, on: res.homeImageTicked.header, onImgs: res.homeImageTicked.mainImages, off: res.homeImageUnticked.mainImages, removed: res.homeRemoved.header}));
        } finally { await close(); }
    }

    // ---- stats: td14, Rule 9 ----
    if (on('stats')) {
        const {page, close} = await launch(app);
        try {
            const res = {};
            res.none0 = await visit(page, itemUrl(app, st), '50-item-stats-none');
            for (const [k, re] of [['bar', /^Use bar type/], ['line', /^Use line type/], ['none', /^Do not display submission usage/]]) {
                await as(page, st.mA, A);
                const panel = await openTab(page, app, A, 'appearance', 'theme');
                await panel.getByRole('radio', {name: re}).check();
                const save = await saveForm(page, panel);
                await signOut(page);
                res[k] = {save, item: await visit(page, itemUrl(app, st), `51-item-stats-${k}`)};
                log('stats', k, JSON.stringify(res[k].item.downloads), JSON.stringify(res[k].item.headings));
            }
            record('52-stats', res);
        } finally { await close(); }
    }

    // ---- series: Settings 8 {OMP} ----
    if (on('series') && isOmp) {
        const {page, close} = await launch(app);
        try {
            const res = {};
            await as(page, st.mA, A);
            const addSeries = async (n) => {
                await page.goto(ctxUrl(app, A, '/management/settings/context')); await idle(page);
                await page.getByRole('tab', {name: 'Series', exact: true}).first().click(); await idle(page);
                const grid = page.locator('#seriesGridContainer').first();
                await grid.waitFor({timeout: T});
                await grid.getByRole('link', {name: /Add Series/}).first().click();
                const form = page.locator('form#seriesForm');
                await form.locator('input[name="title[en]"]').waitFor({timeout: T});
                await idle(page);
                await form.locator('input[name="title[en]"]').fill(`K1 Series ${n}`);
                await form.locator('input[name="path"]').fill(`k1s${n}${A.slice(-4)}`);
                await form.getByRole('button', {name: 'Save', exact: true}).click();
                await form.waitFor({state: 'hidden', timeout: T}).catch(() => {});
                await idle(page);
            };
            await addSeries(1);
            let panel = await openTab(page, app, A, 'appearance', 'theme');
            await panel.getByRole('checkbox', {name: /Add list of links to all of the press's series/}).check();
            res.save = await saveForm(page, panel);
            await signOut(page);
            res.oneSeries = await visit(page, ctxUrl(app, A, '/catalog'), '60-catalog-show-series-one');
            await as(page, st.mA, A);
            await addSeries(2);
            await signOut(page);
            res.twoSeries = await visit(page, ctxUrl(app, A, '/catalog'), '61-catalog-show-series-two');
            await as(page, st.mA, A);
            panel = await openTab(page, app, A, 'appearance', 'theme');
            await panel.getByRole('checkbox', {name: /Add list of links to all of the press's series/}).uncheck();
            res.save2 = await saveForm(page, panel);
            await signOut(page);
            res.twoSeriesOff = await visit(page, ctxUrl(app, A, '/catalog'), '62-catalog-show-series-off');
            const seriesLinks = async () => page.evaluate(() => [...document.querySelectorAll('.pkp_structure_main a')].filter((a) => /\/catalog\/series\//.test(a.getAttribute('href') || '')).map((a) => ({text: a.innerText.trim(), href: a.getAttribute('href')})));
            await page.goto(ctxUrl(app, A, '/catalog')); await idle(page);
            res.linksOff = await seriesLinks();
            record('63-series', res);
        } finally { await close(); }
    }

    // ---- lang: td9, Rule 3 (journal B, en + fr_CA forms) ----
    if (on('lang')) {
        const {page, close} = await launch(app);
        try {
            const res = {};
            await as(page, st.mB, B);
            // Setup: logo and homepage image in English only, footer in French only
            let panel = await openTab(page, app, B, 'appearance', 'appearance-setup');
            res.setupForm0 = await formFields(panel);
            res.fileInputs = await page.locator('input[type=file]').evaluateAll((els) => els.map((e) => e.id));
            await snap(page, '70-B-setup-two-languages', {form: res.setupForm0, fileInputs: res.fileInputs});
            const upl = async (sel) => {
                const inp = page.locator(sel).first();
                if (!(await inp.count())) return {missing: sel};
                const up = page.waitForResponse((r) => /temporaryFiles/.test(r.url()) && r.request().method() === 'POST', {timeout: T}).catch(() => null);
                await inp.setInputFiles(PNG);
                const r = await up; await idle(page); await sleep(800);
                return {sel, status: r ? r.status() : null};
            };
            res.logoUp = await upl('input[type=file][id*="pageHeaderLogoImage"][id*="en"]');
            res.homeUp = await upl('input[type=file][id*="homepageImage"][id*="en"]');
            // French toggle then the French footer
            const frToggle = panel.locator('.pkpFormLocales button').filter({hasText: /Fran|French/}).first();
            res.frToggle = await frToggle.count();
            if (res.frToggle) { await frToggle.click(); await sleep(600); }
            const footers = fieldByLabel(panel, /Page Footer/);
            const frames = panel.locator('.pkpFormField').filter({hasText: /Page Footer/}).locator('iframe');
            res.footerFrames = await frames.count();
            res.footerFieldIds = await panel.locator('.pkpFormField').filter({hasText: /Page Footer/}).evaluateAll((els) => els.map((e) => ({text: e.innerText.slice(0, 80), ids: [...e.querySelectorAll('textarea, iframe')].map((x) => x.id)})));
            const frFrame = panel.locator('iframe[id*="pageFooter"][id*="fr_CA"]').first();
            res.frFrame = await frFrame.count();
            if (res.frFrame) {
                await page.waitForFunction((el) => el.contentDocument && el.contentDocument.body && el.contentDocument.body.getAttribute('contenteditable') === 'true', await frFrame.elementHandle(), {timeout: T}).catch(() => {});
                await frFrame.contentFrame().locator('body').click();
                await frFrame.contentFrame().locator('body').pressSequentially('Pied de page');
                await sleep(300);
            }
            void footers;
            res.setupSave = await saveForm(page, panel);
            res.setupForm1 = await formFields(panel);
            await snap(page, '71-B-setup-saved', {res});
            // Advanced: favicon in English, additional content in English
            panel = await openTab(page, app, B, 'appearance', 'advanced');
            res.advancedFileInputs = await page.locator('input[type=file]').evaluateAll((els) => els.map((e) => e.id));
            res.favUp = await upl('input[type=file][id*="favicon"][id*="en"]');
            const enAdd = panel.locator('iframe[id*="additionalHomeContent"][id*="en"]').first();
            res.enAdd = await enAdd.count();
            if (res.enAdd) {
                await page.waitForFunction((el) => el.contentDocument && el.contentDocument.body && el.contentDocument.body.getAttribute('contenteditable') === 'true', await enAdd.elementHandle(), {timeout: T}).catch(() => {});
                await enAdd.contentFrame().locator('body').click();
                await enAdd.contentFrame().locator('body').pressSequentially('English additional content');
                await sleep(300);
            }
            res.advancedSave = await saveForm(page, panel);
            await snap(page, '72-B-advanced-saved', {form: await formFields(panel)});
            // Date & Time: the groups per language; French "Date (Short)" to 24.09.2026-like
            panel = await openTab(page, app, B, 'setup', 'dateTime');
            if (res.frToggle) {
                const t2 = panel.locator('.pkpFormLocales button').filter({hasText: /Fran|French/}).first();
                if (await t2.count()) { await t2.click(); await sleep(600); }
            }
            res.dateForm0 = await formFields(panel);
            const frShort = panel.locator('input[type=radio][name*="dateFormatShort"][name*="fr_CA"][value="d.m.Y"], input[type=radio][id*="dateFormatShort"][id*="fr_CA"][value="d.m.Y"]').first();
            res.frShort = await frShort.count();
            if (res.frShort) await frShort.check();
            res.dateSave = await saveForm(page, panel);
            await snap(page, '73-B-datetime-saved', {form: await formFields(panel), frShort: res.frShort});
            await signOut(page);
            res.homeEn = await visit(page, ctxUrl(app, B, '', 'en'), '74-B-home-en');
            res.homeFr = await visit(page, ctxUrl(app, B, '', 'fr_CA'), '75-B-home-fr');
            if (st.itemB) {
                res.itemEn = await visit(page, itemUrlB(app, st, 'en'), '76-B-item-en');
                res.itemFr = await visit(page, itemUrlB(app, st, 'fr_CA'), '77-B-item-fr');
            }
            record('78-lang', res);
            log('lang en', JSON.stringify({logo: res.homeEn.logo, fav: res.homeEn.favicon, footer: res.homeEn.footer, add: res.homeEn.additional, imgs: res.homeEn.mainImages}));
            log('lang fr', JSON.stringify({logo: res.homeFr.logo, fav: res.homeFr.favicon, footer: res.homeFr.footer, add: res.homeFr.additional, imgs: res.homeFr.mainImages}));
        } finally { await close(); }
    }

    // ---- nav2: the menu window's area list on A (theme saved many times) and B (theme never saved) ----
    if (on('nav2')) {
        const {page, close} = await launch(app);
        try {
            const res = {};
            for (const [key, P, mgr] of [['A', A, st.mA], ['B', B, st.mB]]) {
                await as(page, mgr, P);
                await openTab(page, app, P, 'setup', 'navigationMenus');
                const grid = page.locator('#navigationMenuGridContainer').first();
                await grid.locator('tr.gridRow').first().waitFor({timeout: T});
                await idle(page);
                const rows = await grid.locator('tr.gridRow').allInnerTexts();
                await grid.getByRole('link', {name: /Add Menu/}).first().click();
                const sel = page.locator('form select[name="areaName"]').first();
                await sel.waitFor({timeout: T});
                await idle(page); await sleep(1500);
                const addAreas = await sel.evaluate((s) => [...s.options].map((o) => ({value: o.value, label: o.label, selected: o.selected})));
                await snap(page, `81-nav-add-menu-${key}`, {rows, addAreas});
                const cancel = page.locator('form#navigationMenuForm a, form a').filter({hasText: /^\s*Cancel\s*$/}).first();
                if (await cancel.count()) await cancel.click().catch(() => {});
                await idle(page); await sleep(600);
                res[key] = {rows, addAreas};
                log('nav2', key, JSON.stringify(addAreas));
                await signOut(page);
            }
            record('83-nav2', res);
        } finally { await close(); }
    }

    // ---- series2 {OMP}: the series links need series holding a published book; one such series, then two ----
    if (on('series2') && isOmp) {
        const {page, close} = await launch(app);
        try {
            const res = {};
            const s1 = `k1s1${A.slice(-4)}`, s2 = `k1s2${A.slice(-4)}`;
            const links = async () => page.evaluate(() => { const n = document.querySelector('.pkp_series_nav_menu'); return n ? {text: n.innerText.replace(/\s+/g, ' ').trim(), links: [...n.querySelectorAll('a')].map((a) => a.getAttribute('href'))} : null; });
            await as(page, st.mA, A);
            await page.goto(ctxUrl(app, A, '/management/settings/context')); await idle(page);
            await page.getByRole('tab', {name: 'Series', exact: true}).first().click(); await idle(page);
            await page.locator('#seriesGridContainer tr.gridRow').first().waitFor({timeout: T}).catch(() => {});
            res.grid = await page.locator('#seriesGridContainer tr.gridRow').allInnerTexts();
            await snap(page, '64-series-grid', {grid: res.grid});
            let panel = await openTab(page, app, A, 'appearance', 'theme');
            await panel.getByRole('checkbox', {name: /Add list of links to all of the press's series/}).check();
            res.save = await saveForm(page, panel);
            await signOut(page);
            if (!st.book1) { const b1 = await app.api.createSubmission({tag: `${A}b1`, context: A, submitter: st.mA, title: `K1 book in series 1 ${A}`, series: s1, published: true}); st.book1 = b1.submissionId; saveState(); }
            await visit(page, ctxUrl(app, A, '/catalog'), '65-catalog-one-series-with-book');
            res.oneWithBook = await links();
            if (!st.book2) { const b2 = await app.api.createSubmission({tag: `${A}b2`, context: A, submitter: st.mA, title: `K1 book in series 2 ${A}`, series: s2, published: true}); st.book2 = b2.submissionId; saveState(); }
            await visit(page, ctxUrl(app, A, '/catalog'), '66-catalog-two-series-with-books');
            res.twoWithBooks = await links();
            await as(page, st.mA, A);
            panel = await openTab(page, app, A, 'appearance', 'theme');
            await panel.getByRole('checkbox', {name: /Add list of links to all of the press's series/}).uncheck();
            res.save2 = await saveForm(page, panel);
            await signOut(page);
            await visit(page, ctxUrl(app, A, '/catalog'), '67-catalog-two-series-unticked');
            res.twoUnticked = await links();
            record('68-series2', res);
            log('series2', JSON.stringify(res));
        } finally { await close(); }
    }

    // ---- lang2: what each footer box holds after the save; an English footer added (both ends of the fallback) ----
    if (on('lang2')) {
        const {page, close} = await launch(app);
        try {
            const res = {};
            await as(page, st.mB, B);
            let panel = await openTab(page, app, B, 'appearance', 'appearance-setup');
            await panel.locator('iframe[id*="pageFooter"]').first().waitFor({timeout: T});
            await sleep(1500);
            const read = () => page.evaluate(() => Object.fromEntries((window.tinymce ? window.tinymce.get() : []).map((e) => [e.id, e.getContent()])));
            res.stored = await read();
            await snap(page, '79-B-setup-stored', {stored: res.stored});
            const en = panel.locator('iframe[id*="pageFooter"][id$="-en_ifr"]').first();
            await page.waitForFunction((el) => el.contentDocument && el.contentDocument.body && el.contentDocument.body.getAttribute('contenteditable') === 'true', await en.elementHandle(), {timeout: T}).catch(() => {});
            await en.contentFrame().locator('body').click();
            await en.contentFrame().locator('body').pressSequentially('English footer');
            await sleep(300);
            res.save = await saveForm(page, panel);
            await page.reload(); await idle(page);
            panel = await openTab(page, app, B, 'appearance', 'appearance-setup', {reload: false});
            await sleep(1500);
            res.stored2 = await read();
            await signOut(page);
            res.homeEn = (await visit(page, ctxUrl(app, B, '', 'en'), '79b-B-home-en-both-footers')).footer;
            res.homeFr = (await visit(page, ctxUrl(app, B, '', 'fr_CA'), '79c-B-home-fr-both-footers')).footer;
            record('79d-lang2', res);
            log('lang2', JSON.stringify(res));
        } finally { await close(); }
    }
});
