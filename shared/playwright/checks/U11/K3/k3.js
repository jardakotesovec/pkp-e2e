// U11 claim check, chunk K3: the reader's side of highlights, on all three apps.
// Spec: docs/specs/U11-highlights.md — Rules 2–4 (66–82), Settings that modify
// behavior, Cross-feature interactions and the Canonical scenarios preamble
// (151–195); footnotes a, d, j, k, o.
//
// Seeds its own scratch context (French under "UI" only, a manager and a
// reader), signs in from the roster and records every screen with screen().
// Per app: the home page with no highlights (no carousel, the next block
// first); the neighbouring blocks set up through their own screens (theme
// option "summary on the homepage", the homepage image, announcements enabled
// and one added, a category on OJS) and the home page with them; one highlight
// (arrows, dot, the slide's parts, the button's address as typed); three
// highlights (one without a description, one with an image and alternate
// text): "Next slide" / "Previous slide" / the dots, the button followed, the
// image fetched; the other public pages and the announcements list (no
// highlight there), the site home page read as found, publicknowledge's home
// as control; "Forms" languages (the single-language panel, the two-language
// panel after the tick, the French reader); the settings catalogue (no
// highlights setting anywhere, the "Theme" select's options, the theme's
// "header background" option moving the homepage image); the site's
// "Journal redirect" select (its label per app, set and unset around one
// signed-out read of the site address); the OJS announcement feed plugin; and
// a sweep of leaving the theme form changed and unsaved.
//
//   PROBE_FEATURE=U11 PROBE_AGENT=ccK3 node bin/probe.js all shared/playwright/checks/U11/K3/k3.js
//   PHASES=seed,empty,blocks,one,several,other,lang,settings,site,feed,sweep
//   (default: all; later phases reuse k3-state-<app>.json from the seed phase)
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, signOut, screen, shot, record, loc, note, idle, tag, outDir} =
    require('../../../probe');

const ALL_PHASES = ['seed', 'empty', 'blocks', 'one', 'several', 'other', 'lang', 'settings', 'labels', 'site', 'feed', 'sweep'];
const PHASES = process.env.PHASES ? process.env.PHASES.split(',') : ALL_PHASES;
const on = (p) => PHASES.includes(p);
const log = (...a) => console.log('[k3]', ...a);
const stateFile = (app) => path.join(outDir(), `k3-state-${app.name}.json`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const T = 20_000;
const REPO = path.resolve(__dirname, '../../../../..');
const PNG = path.join(REPO, 'apps/ojs/playwright/fixtures/files/profile-image-400.png');

// ---------------------------------------------------------------------------
// Reading helpers

/** The visible side modal (the panel), the last one when they stack. */
const dialog = (page) => page.locator('[role="dialog"]:visible').last();

async function snap(page, name, extra = {}) {
    const s = await screen(page).catch((e) => ({screenError: String(e.message || e)}));
    record(name, {...s, ...extra});
    await shot(page, name).catch(() => {});
    return s;
}

/** The Highlights list panel's header buttons and rows. */
async function panelState(page) {
    return page.locator('.highlightsListPanel').evaluate((root) => {
        const btn = (b) => ({
            name: (b.getAttribute('aria-label') || b.innerText).replace(/\s+/g, ' ').trim(),
            disabled: b.disabled || b.getAttribute('aria-disabled') === 'true',
        });
        return {
            title: root.querySelector('.pkpHeader__title')?.innerText.trim() ?? null,
            headerButtons: [...root.querySelectorAll('.pkpHeader__actions button')].map(btn),
            empty: root.querySelector('.listPanel__empty')?.innerText.trim() ?? null,
            rows: [...root.querySelectorAll('.listPanel__item')].map((li) => ({
                title: li.querySelector('.listPanel__itemTitle')?.innerText.trim(),
                text: li.innerText.replace(/\s+/g, ' ').trim(),
                buttons: [...li.querySelectorAll('button')].map(btn),
            })),
            text: root.innerText.replace(/\s+/g, ' ').trim(),
        };
    }).catch((e) => ({error: String(e.message || e)}));
}

/** The side panel's form as data: fields (label, locale label, kind), locales, errors, footer buttons. */
async function formState(page) {
    const d = dialog(page);
    if ((await d.count()) === 0) return {open: false};
    return d.evaluate((root) => {
        const txt = (el) => (el ? el.innerText.replace(/\s+/g, ' ').trim() : null);
        return {
            open: true,
            heading: txt(root.querySelector('h1, h2, [id*="title"]')),
            errorSummary: txt(root.querySelector('.pkpFormErrors')),
            locales: [...root.querySelectorAll('.pkpFormLocales .pkpFormLocales__locale')].map((l) => ({text: txt(l), active: l.classList.contains('pkpFormLocales__locale--isActive'), primary: l.classList.contains('pkpFormLocales__locale--isPrimary')})),
            progress: txt(root.querySelector('.pkpFormLocales')),
            fields: [...root.querySelectorAll('.pkpFormField')].map((f) => ({
                classes: f.className.replace(/\s+/g, ' ').trim(),
                localeGroupVisible: f.closest('.pkpFormGroup__locale') ? f.closest('.pkpFormGroup__locale').classList.contains('pkpFormGroup__locale--isVisible') : null,
                label: txt(f.querySelector('.pkpFormFieldLabel')),
                localeLabel: txt(f.querySelector('.pkpFormFieldLabel .aria-hidden')),
                required: !!f.querySelector('.pkpFormFieldLabel__required'),
                description: txt(f.querySelector('.pkpFormField__description')),
                error: txt(f.querySelector('.pkpFieldError')),
                inputs: [...f.querySelectorAll('input:not([type=hidden]), textarea, iframe')].map((i) => ({tag: i.tagName.toLowerCase(), id: i.id, visible: i.offsetParent !== null})),
            })),
            footerButtons: [...root.querySelectorAll('.pkpFormPage__footer button')].map((b) => ({name: b.innerText.trim(), disabled: b.disabled})),
        };
    });
}

/** The home-page carousel as data, plus the page's block order between header and footer. */
async function carousel(page) {
    return page.evaluate(() => {
        const vis = (el) => {
            if (!el) return null;
            const cs = getComputedStyle(el);
            const r = el.getBoundingClientRect();
            return {display: cs.display, visibility: cs.visibility, opacity: cs.opacity, width: Math.round(r.width), height: Math.round(r.height), top: Math.round(r.top), offscreen: r.right < 0 || r.bottom < 0, position: cs.position, clip: cs.clip};
        };
        const main = document.querySelector('.pkp_structure_main');
        const pageDiv = main ? [...main.children].find((c) => c.tagName === 'DIV') : null;
        const blocks = pageDiv ? [...pageDiv.children].map((c) => ({tag: c.tagName.toLowerCase(), cls: (c.className || '').toString().slice(0, 60), heading: c.querySelector('h1,h2,h3')?.innerText.trim().slice(0, 60) ?? null, text: c.innerText.replace(/\s+/g, ' ').trim().slice(0, 80), visible: c.getBoundingClientRect().height > 0})) : null;
        const header = document.querySelector('.pkp_structure_head');
        const footer = document.querySelector('.pkp_structure_footer_wrapper');
        const block = document.querySelector('.highlights');
        const out = {
            present: !!block,
            count: document.querySelectorAll('.highlights').length,
            pageDiv: pageDiv ? {tag: pageDiv.tagName.toLowerCase(), cls: pageDiv.className, prevSibling: pageDiv.previousElementSibling ? pageDiv.previousElementSibling.className : null} : null,
            blocks,
            headerBeforeFooter: header && footer ? !!(header.compareDocumentPosition(footer) & Node.DOCUMENT_POSITION_FOLLOWING) : null,
            headingsOnPage: [...document.querySelectorAll('.pkp_structure_main h2')].map((h) => h.innerText.trim()),
        };
        if (!block) return out;
        const h2 = block.querySelector('h2');
        const all = [...block.querySelectorAll('li.swiper-slide')];
        const prev = block.querySelector('.swiper-button-prev');
        const next = block.querySelector('.swiper-button-next');
        const pag = block.querySelector('.swiper-pagination');
        const arrow = (b) => (b ? {ariaLabel: b.getAttribute('aria-label'), role: b.getAttribute('role'), tabindex: b.getAttribute('tabindex'), ariaDisabled: b.getAttribute('aria-disabled'), disabled: b.disabled, classes: b.className, style: vis(b), text: b.innerText.trim()} : null);
        return {
            ...out,
            afterHeader: header ? !!(header.compareDocumentPosition(block) & Node.DOCUMENT_POSITION_FOLLOWING) : null,
            beforeFooter: footer ? !!(block.compareDocumentPosition(footer) & Node.DOCUMENT_POSITION_FOLLOWING) : null,
            firstInPage: pageDiv ? [...pageDiv.children].find((c) => c.tagName !== 'A') === block : null,
            heading: h2 ? {text: h2.innerText.trim(), classes: h2.className, style: vis(h2)} : null,
            swiperClasses: block.querySelector('.swiper')?.className ?? null,
            wrapper: ((w) => (w ? {tag: w.tagName.toLowerCase(), ariaLive: w.getAttribute('aria-live'), id: w.id} : null))(block.querySelector('.swiper-wrapper')),
            activeIndex: all.findIndex((li) => li.classList.contains('swiper-slide-active')),
            slides: all.map((li) => ({
                classes: li.className,
                role: li.getAttribute('role'),
                ariaLabel: li.getAttribute('aria-label'),
                hasImageClass: li.classList.contains('-has-image'),
                title: li.querySelector('.swiper-slide-title')?.innerText.trim() ?? null,
                titleTag: li.querySelector('.swiper-slide-title')?.tagName.toLowerCase() ?? null,
                desc: li.querySelector('.swiper-slide-desc')?.innerHTML.trim() ?? null,
                descText: li.querySelector('.swiper-slide-desc')?.innerText.trim() ?? null,
                button: ((b) => (b ? {text: b.innerText.trim(), href: b.getAttribute('href'), resolved: b.href, target: b.getAttribute('target'), classes: b.className} : null))(li.querySelector('.swiper-slide-button')),
                img: ((i) => (i ? {src: i.getAttribute('src'), alt: i.getAttribute('alt'), complete: i.complete, naturalWidth: i.naturalWidth, naturalHeight: i.naturalHeight, classes: i.className} : null))(li.querySelector('img')),
                order: [...li.querySelectorAll('img, .swiper-slide-title, .swiper-slide-desc, .swiper-slide-button')].map((e) => e.className.split(' ')[0]),
                visible: li.getBoundingClientRect().height > 0,
            })),
            prev: arrow(prev),
            next: arrow(next),
            pagination: pag ? {classes: pag.className, style: vis(pag), bullets: [...pag.querySelectorAll('.swiper-pagination-bullet')].map((b) => ({classes: b.className, ariaLabel: b.getAttribute('aria-label'), ariaCurrent: b.getAttribute('aria-current'), role: b.getAttribute('role'), tabindex: b.getAttribute('tabindex'), active: b.classList.contains('swiper-pagination-bullet-active')}))} : null,
            dots: block.querySelectorAll('.swiper-pagination-bullet').length,
            blockStyle: vis(block),
        };
    });
}

// ---------------------------------------------------------------------------
// Driving helpers

function ctxUrl(app, ctxPath, p = '', locale = '') {
    return app.url(`/index.php/${ctxPath}${locale ? '/' + locale : ''}${p}`);
}

/** Open Settings › Website, select the top tab (#<id>-button, the OUTER one), then a side tab by name. */
async function openWebsiteTab(page, app, ctxPath, topId, sideName, {locale = 'en'} = {}) {
    await page.goto(ctxUrl(app, ctxPath, '/management/settings/website', locale));
    await idle(page);
    const top = page.locator(`#${topId}-button`).first();
    await top.waitFor({timeout: T});
    if ((await top.getAttribute('aria-selected')) !== 'true') await top.click();
    await idle(page);
    const topTabs = await page.locator('main [role="tablist"]').first().getByRole('tab').allInnerTexts();
    const panel = page.locator(`[role="tabpanel"]#${topId}`).first();
    const sideTabs = await panel.locator('[role="tablist"]').first().getByRole('tab').allInnerTexts();
    let present = false;
    if (sideName) {
        const tab = panel.getByRole('tab', {name: sideName, exact: true});
        present = (await tab.count()) > 0;
        if (present) { await tab.first().click(); await idle(page); }
    }
    return {topTabs: topTabs.map((t) => t.trim()), sideTabs: sideTabs.map((t) => t.trim()), sideTabPresent: present};
}
async function openHighlightsTab(page, app, ctxPath, opts) {
    const r = await openWebsiteTab(page, app, ctxPath, 'setup', 'Highlights', opts);
    await page.locator('.highlightsListPanel').waitFor({timeout: T}).catch(() => {});
    await idle(page);
    return r;
}
async function openAddPanel(page) {
    await page.locator('.highlightsListPanel').getByRole('button', {name: 'Add Highlight', exact: true}).click();
    await dialog(page).waitFor({timeout: T});
    await dialog(page).locator('.pkpFormPage__footer').waitFor({timeout: T});
    await idle(page);
    await sleep(400);
}
async function openEditPanel(page, rowTitle) {
    const row = page.locator('.highlightsListPanel .listPanel__item').filter({hasText: rowTitle}).first();
    await row.getByRole('button', {name: 'Edit', exact: true}).click();
    await dialog(page).waitFor({timeout: T});
    await dialog(page).locator('.pkpFormPage__footer').waitFor({timeout: T});
    await idle(page);
    await sleep(400);
}
/** The field wrapper in the panel by its label text prefix. */
function field(page, label, index = 0) {
    return dialog(page).locator('.pkpFormField').filter({has: page.locator('label.pkpFormFieldLabel'), hasText: new RegExp(`(^|\\s)${label}`)}).nth(index);
}
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
    return body;
}
async function setText(page, label, value, index = 0) {
    const input = field(page, label, index).locator('input.pkpFormField__input, textarea').first();
    await input.fill(value);
}
async function save(page) {
    await dialog(page).getByRole('button', {name: 'Save', exact: true}).click();
    await idle(page);
    await sleep(600);
    await idle(page);
}
async function waitClosed(page) {
    await page.locator('[role="dialog"]:visible').waitFor({state: 'hidden', timeout: T}).catch(() => {});
    await idle(page);
}
/** Add a highlight through the journal's own panel (the page must be on the Highlights tab). */
async function addHighlight(page, {title, description, url, label, image, alt}) {
    await openAddPanel(page);
    await setRich(page, 'Title', title);
    if (description) await setRich(page, 'Description', description);
    await setText(page, 'URL', url);
    await setText(page, 'Button Label', label);
    let uploadStatus = null;
    if (image) {
        const up = page.waitForResponse((r) => /temporaryFiles/.test(r.url()) && r.request().method() === 'POST', {timeout: T}).catch(() => null);
        await page.locator('input[type=file]').last().setInputFiles(image);
        const r = await up; uploadStatus = r ? r.status() : null;
        await idle(page); await sleep(800);
        if (alt) await field(page, 'Image').locator('input.pkpFormField--uploadImage__altTextInput').fill(alt);
    }
    await save(page);
    await waitClosed(page);
    return {uploadStatus, dialogOpen: (await page.locator('[role="dialog"]:visible').count()) > 0};
}

/** Wait for a Vue settings form's "Saved" status after clicking its Save. */
async function saveVueForm(page, form) {
    const resp = page.waitForResponse((r) => /^(PUT|POST)$/.test(r.request().method()) && /\/api\/v1\//.test(r.url()), {timeout: T}).catch(() => null);
    await form.getByRole('button', {name: 'Save', exact: true}).click();
    const r = await resp;
    await page.locator('[role="status"]:has-text("Saved")').first().waitFor({timeout: T}).catch(() => {});
    await idle(page);
    return r ? {status: r.status(), url: r.url()} : null;
}

async function homePage(page, app, ctxPath, name, {locale = '', extra = {}} = {}) {
    await page.goto(ctxUrl(app, ctxPath, '', locale));
    await idle(page);
    const c = await carousel(page);
    await snap(page, name, {carousel: c, ...extra});
    return c;
}

async function as(page, user, ctxPath) {
    await signIn(page, user, {contextPath: ctxPath});
    await idle(page);
}

const summaryOption = /Show the (journal|press|server) summary on the homepage\./i;
const headerImageOption = /Show the homepage image as the header background\./i;

// ---------------------------------------------------------------------------

forEachApp(async (app) => {
    const isOjs = app.name === 'ojs';
    let st = fs.existsSync(stateFile(app)) ? JSON.parse(fs.readFileSync(stateFile(app), 'utf8')) : null;
    const saveState = () => fs.writeFileSync(stateFile(app), JSON.stringify(st, null, 2));

    // ---- seed ---------------------------------------------------------------
    if (on('seed') || !st) {
        const t = tag('u11k3');
        const users = [
            {username: `${t}mgr`, roles: ['manager'], givenName: 'Mira', familyName: 'Manager'},
            {username: `${t}rd`, roles: ['reader'], givenName: 'Rex', familyName: 'Reader'},
        ];
        const ctx = await app.api.createContext({tag: t, context: {name: `U11 K3 ${t}`, acronym: 'U11K3', supportedLocales: ['en', 'fr_CA'], description: {en: '<p>The K3 summary text for the home page.</p>'}}, users});
        st = {tag: t, ctxPath: ctx.path || t, contextId: ctx.contextId, users: {mgr: `${t}mgr`, rd: `${t}rd`}};
        saveState();
        log('seeded', st.ctxPath, st.contextId);
        note(`K3 ${app.name}: scratch context ${st.ctxPath} (id ${st.contextId}), seeded with a description (the "About the …" text) and fr_CA under "UI"`);
    }
    const P = st.ctxPath;
    const U = st.users;

    // ---- empty: no highlights, no carousel; the list reads "No items found." ----
    if (on('empty')) {
        const {page, close} = await launch(app);
        try {
            const c0 = await homePage(page, app, P, '01-home-empty');
            log('empty home: carousel present', c0.present, '| blocks', JSON.stringify(c0.blocks?.map((b) => b.cls)));
            await loc(page, 'home page: the carousel block (absent while the list is empty)', page.locator('.highlights'));
            await as(page, U.mgr, P);
            const tabs = await openHighlightsTab(page, app, P);
            await snap(page, '02-panel-empty', {tabs, panel: await panelState(page)});
            await signOut(page);
        } finally { await close(); }
    }

    // ---- blocks: the neighbouring blocks through their own screens ------------
    if (on('blocks')) {
        const {page, close} = await launch(app);
        try {
            await as(page, U.mgr, P);
            // Appearance › Theme: the "Theme" select and the theme's options
            const th = await openWebsiteTab(page, app, P, 'appearance', 'Theme');
            const themeSelect = page.locator('[role="tabpanel"]#appearance select').first();
            await themeSelect.waitFor({timeout: T}).catch(() => {});
            const themeOptions = await themeSelect.evaluate((s) => [...s.options].map((o) => ({value: o.value, label: o.label, selected: o.selected}))).catch((e) => ({error: String(e.message || e)}));
            const themeForm = page.locator('[role="tabpanel"]#appearance').getByRole('tabpanel', {name: 'Theme'});
            const optionBoxes = await themeForm.getByRole('checkbox').evaluateAll((els) => els.map((e) => ({name: e.getAttribute('aria-label') || (e.labels && e.labels[0] ? e.labels[0].innerText.trim() : e.id), checked: e.checked})));
            const fieldLabels = await themeForm.locator('.pkpFormField').evaluateAll((els) => els.map((e) => (e.querySelector('.pkpFormFieldLabel, legend, label') || {innerText: ''}).innerText.trim().replace(/\s+/g, ' ')));
            await snap(page, '03-appearance-theme', {tabs: th, themeOptions, optionBoxes, fieldLabels});
            await loc(page, 'Appearance › Theme: the "Theme" select', themeSelect);
            const summaryBox = themeForm.getByRole('checkbox', {name: summaryOption});
            await loc(page, 'Appearance › Theme: "Show the … summary on the homepage." box', summaryBox);
            let themeSave = null;
            const catBox = themeForm.getByRole('checkbox', {name: /Include a listing of categories/i});
            if (await summaryBox.count()) {
                if (!(await summaryBox.isChecked())) await summaryBox.check();
                if (await catBox.count() && !(await catBox.isChecked())) await catBox.check();
                themeSave = await saveVueForm(page, themeForm);
            }
            record('03b-appearance-theme-saved', {themeSave, summaryChecked: await summaryBox.isChecked().catch(() => null)});

            // Appearance › Setup: the homepage image
            const ap = await openWebsiteTab(page, app, P, 'appearance', 'Setup');
            const setupPanel = page.locator('[role="tabpanel"]#appearance');
            const imgField = setupPanel.locator('.pkpFormField').filter({hasText: /Homepage image/i}).first();
            await imgField.waitFor({timeout: T}).catch(() => {});
            const fileInputs = await page.locator('input[type=file]').evaluateAll((els) => els.map((e) => e.id));
            const homeInput = page.locator('input[type=file][id*="homepageImage"]').first();
            let homeUpload = null;
            if (await homeInput.count()) {
                const up = page.waitForResponse((r) => /temporaryFiles/.test(r.url()) && r.request().method() === 'POST', {timeout: T}).catch(() => null);
                await homeInput.setInputFiles(PNG);
                const r = await up; homeUpload = r ? r.status() : null;
                await idle(page); await sleep(800);
                const altBox = imgField.locator('input.pkpFormField--uploadImage__altTextInput');
                if (await altBox.count()) await altBox.fill('The K3 homepage image');
                const form = setupPanel.getByRole('tabpanel', {name: 'Setup'});
                homeUpload = {upload: homeUpload, save: await saveVueForm(page, form)};
            }
            await snap(page, '04-appearance-setup-image', {tabs: ap, fileInputs, homeUpload, imgFieldText: await imgField.innerText().catch(() => null)});
            await loc(page, 'Appearance › Setup: the homepage image hidden file input', homeInput);

            // Setup › Announcements: enable, then add one
            const an = await openWebsiteTab(page, app, P, 'setup', 'Announcements');
            const enableBox = page.getByRole('checkbox', {name: /Enable announcements/i}).first();
            await enableBox.waitFor({timeout: T}).catch(() => {});
            const annForm = page.locator('[role="tabpanel"]#setup').getByRole('tabpanel', {name: 'Announcements'});
            const wasChecked = await enableBox.isChecked().catch(() => null);
            const annFields = await annForm.locator('.pkpFormField').evaluateAll((els) => els.map((e) => (e.querySelector('.pkpFormFieldLabel, legend, label') || {innerText: ''}).innerText.trim().replace(/\s+/g, ' '))).catch(() => []);
            if (wasChecked === false) await enableBox.check();
            const annSave = await saveVueForm(page, annForm).catch((e) => ({error: String(e.message || e)}));
            // "Display on Homepage" shows once announcements are enabled; the home page block needs a count
            const numBox = annForm.locator('.pkpFormField').filter({hasText: /Display on Homepage/i}).locator('input').first();
            const annFields2 = await annForm.locator('.pkpFormField').evaluateAll((els) => els.map((e) => (e.querySelector('.pkpFormFieldLabel, legend, label') || {innerText: ''}).innerText.trim().replace(/\s+/g, ' '))).catch(() => []);
            let numSave = null;
            if (await numBox.count()) { await numBox.fill('3'); numSave = await saveVueForm(page, annForm); }
            record('05a-announcements-count', {annFields2, numSave});
            await snap(page, '05-setup-announcements', {tabs: an, wasChecked, annFields, annSave});
            await page.goto(ctxUrl(app, P, '/management/settings/announcements')); await idle(page);
            const addAnn = page.getByRole('button', {name: /Add Announcement/i}).first();
            await addAnn.waitFor({timeout: T});
            const already = await page.locator('.listPanel__item').filter({hasText: 'K3 announcement one'}).count();
            if (!already) {
            await addAnn.click();
            const annDlg = dialog(page);
            await annDlg.waitFor({timeout: T});
            await annDlg.locator('.pkpFormPage__footer').waitFor({timeout: T}).catch(() => {});
            await idle(page); await sleep(400);
            const annTitle = annDlg.locator('input[name^="title"], input[id*="title"]').first();
            await annTitle.waitFor({timeout: T});
            await annTitle.fill('K3 announcement one');
            const annBody = annDlg.locator('iframe').first().contentFrame().locator('body');
            await annBody.waitFor({timeout: T}).catch(() => {});
            await annBody.click().catch(() => {});
            await annBody.pressSequentially('Short description of the K3 announcement.').catch(() => {});
            await save(page);
            await waitClosed(page);
            }
            await snap(page, '05b-announcement-added', {rows: await page.locator('.listPanel__item').allInnerTexts().catch(() => [])});

            // Settings › Journal › Categories (OJS: the category list block on the home page)
            if (isOjs) {
                await page.goto(ctxUrl(app, P, '/management/settings/context')); await idle(page);
                const catTab = page.locator('#categories-button').first();
                await catTab.waitFor({timeout: T});
                await catTab.click(); await idle(page);
                const addCat = page.getByRole('button', {name: /Add Category/i}).first();
                await addCat.waitFor({timeout: T});
                if (!(await page.getByText('K3 Category', {exact: true}).count())) {
                await addCat.click();
                const catDlg = dialog(page);
                await catDlg.waitFor({timeout: T});
                await catDlg.locator('.pkpFormPage__footer').waitFor({timeout: T}).catch(() => {});
                await idle(page); await sleep(400);
                const catFields = await catDlg.locator('.pkpFormField').evaluateAll((els) => els.map((e) => ({label: (e.querySelector('.pkpFormFieldLabel, legend, label') || {innerText: ''}).innerText.trim().replace(/\s+/g, ' '), inputs: [...e.querySelectorAll('input:not([type=hidden]), select, iframe')].map((i) => i.id)})));
                record('06-category-form', {catFields});
                const nameInput = catDlg.locator('input[id*="title"]').first();
                if (await nameInput.count()) await nameInput.fill('K3 Category'); else await setRich(page, 'Name', 'K3 Category');
                await catDlg.locator('input[id*="path"]').first().fill('k3cat');
                await save(page);
                await snap(page, '06b-category-saved', {dialogOpen: (await page.locator('[role="dialog"]:visible').count()) > 0, form: await formState(page)});
                await waitClosed(page);
                }
            }
            await signOut(page);
            const c = await homePage(page, app, P, '07-home-blocks-no-highlights');
            log('home with blocks, no highlights: carousel', c.present, '| blocks', JSON.stringify(c.blocks?.map((b) => b.cls)));
        } finally { await close(); }
    }

    // ---- one: a single highlight ------------------------------------------------
    if (on('one')) {
        const {page, close} = await launch(app);
        try {
            await as(page, U.mgr, P);
            await openHighlightsTab(page, app, P);
            const r1 = await addHighlight(page, {title: 'K3 first highlight', description: 'The first description.', url: 'https://example.org/cfp?issue=2&x=y#top', label: 'Read the call'});
            await snap(page, '08-panel-one', {added: r1, panel: await panelState(page)});
            await signOut(page);
            const c = await homePage(page, app, P, '09-home-one');
            log('one highlight: slides', c.slides?.length, 'dots', c.dots, 'prev', JSON.stringify(c.prev?.style), 'next', JSON.stringify(c.next?.style));
            await loc(page, 'home page: the carousel block', page.locator('.highlights'));
            await loc(page, 'home page: a slide', page.locator('.highlights li.swiper-slide'));
            await loc(page, 'home page: "Previous slide"', page.getByRole('button', {name: 'Previous slide', exact: true}));
            await loc(page, 'home page: "Next slide"', page.getByRole('button', {name: 'Next slide', exact: true}));
            await loc(page, 'home page: the dots', page.locator('.highlights .swiper-pagination-bullet'));
            await loc(page, 'home page: the slide button', page.locator('.highlights .swiper-slide-button'));
            // pressing the arrows with one slide: what changes
            const before = await carousel(page);
            await page.getByRole('button', {name: 'Next slide', exact: true}).click({force: true}).catch((e) => record('09b-one-next-click-error', {error: String(e.message || e)}));
            await sleep(500);
            const after = await carousel(page);
            record('09b-one-after-next', {activeBefore: before.activeIndex, activeAfter: after.activeIndex, next: after.next, prev: after.prev, pagination: after.pagination});
            st.one = {url: 'https://example.org/cfp?issue=2&x=y#top'};
            saveState();
        } finally { await close(); }
    }

    // ---- several: three highlights, the arrows, the dots, the button, the image ----
    if (on('several')) {
        const {page, close} = await launch(app);
        try {
            await as(page, U.mgr, P);
            await openHighlightsTab(page, app, P);
            const inSite = `${app.baseURL}/index.php/${P}/announcement?from=k3#list`;
            const r2 = await addHighlight(page, {title: 'K3 second highlight', url: inSite, label: 'See announcements'});
            const r3 = await addHighlight(page, {title: 'K3 third highlight', description: 'Third, with a picture.', url: 'https://example.org/third', label: 'Third button', image: PNG, alt: 'K3 alternate text'});
            await snap(page, '10-panel-three', {r2, r3, panel: await panelState(page)});
            await signOut(page);
            const c = await homePage(page, app, P, '11-home-three');
            log('three: slides', JSON.stringify(c.slides?.map((s) => s.title)), 'dots', c.dots, 'active', c.activeIndex);
            const next = page.getByRole('button', {name: 'Next slide', exact: true});
            const prev = page.getByRole('button', {name: 'Previous slide', exact: true});
            const state = async () => { const x = await carousel(page); return {activeIndex: x.activeIndex, activeTitle: x.slides[x.activeIndex]?.title ?? null, bullets: x.pagination?.bullets, prev: {classes: x.prev?.classes, ariaDisabled: x.prev?.ariaDisabled, disabled: x.prev?.disabled}, next: {classes: x.next?.classes, ariaDisabled: x.next?.ariaDisabled, disabled: x.next?.disabled}, visibleSlides: x.slides.map((s) => s.visible)}; };
            const steps = [{step: 'start', ...(await state())}];
            await next.click(); await sleep(500); steps.push({step: 'next 1', ...(await state())});
            await snap(page, '12-after-next', {state: steps[steps.length - 1]});
            await next.click(); await sleep(500); steps.push({step: 'next 2', ...(await state())});
            await next.click({force: true}).catch(() => {}); await sleep(500); steps.push({step: 'next 3 (past the last)', ...(await state())});
            await prev.click(); await sleep(500); steps.push({step: 'prev 1', ...(await state())});
            const dot1 = page.locator('.highlights .swiper-pagination-bullet').first();
            await dot1.click(); await sleep(500); steps.push({step: 'dot 1', ...(await state())});
            await prev.click({force: true}).catch(() => {}); await sleep(500); steps.push({step: 'prev at the first', ...(await state())});
            const dot3 = page.locator('.highlights .swiper-pagination-bullet').nth(2);
            await dot3.click(); await sleep(500); steps.push({step: 'dot 3', ...(await state())});
            // keyboard: Tab focus order inside the block
            record('13-carousel-steps', {steps});
            await snap(page, '13-after-dot3', {state: steps[steps.length - 1]});
            // the image: fetch the slide's <img src>
            const img = c.slides.find((s) => s.img)?.img;
            let imgFetch = null;
            if (img?.src) {
                const r = await page.request.get(img.src.startsWith('http') ? img.src : app.url(img.src)).catch(() => null);
                imgFetch = r ? {status: r.status(), type: r.headers()['content-type']} : null;
            }
            record('14-image', {img, imgFetch});
            // the button: follow the in-site address (slide 2)
            await dot1.click(); await sleep(300);
            await next.click(); await sleep(500);
            const btn = page.locator('.highlights .swiper-slide-button').filter({hasText: 'See announcements'}).first();
            const href = await btn.getAttribute('href');
            const [resp] = await Promise.all([page.waitForResponse((r) => r.request().resourceType() === 'document', {timeout: T}).catch(() => null), btn.click()]);
            await idle(page);
            await snap(page, '15-button-landing', {href, landing: page.url(), status: resp ? resp.status() : null, responseUrl: resp ? resp.url() : null});
            st.three = true; saveState();
        } finally { await close(); }
    }

    // ---- other: no other page shows highlights; the announcements list; the site home as found; publicknowledge ----
    if (on('other')) {
        const {page, close} = await launch(app);
        try {
            const pages = ['/about', '/announcement', '/search', '/login', '/user/register', isOjs ? '/issue/archive' : app.name === 'omp' ? '/catalog' : '/preprints', '/index'];
            const seen = [];
            for (const p of pages) {
                await page.goto(ctxUrl(app, P, p)); await idle(page);
                const c = await carousel(page);
                const text = await page.evaluate(() => document.body.innerText);
                seen.push({path: p, url: page.url(), title: await page.title(), highlightsBlocks: c.count, mentionsHighlightTitle: /K3 (first|second|third) highlight/.test(text), mentionsAnnouncement: /K3 announcement one/.test(text), blocks: c.blocks?.map((b) => b.cls)});
                if (p === '/announcement') await snap(page, '16-announcements-page', {c});
            }
            record('16-other-pages', {seen});
            // the site's home page, read as found (K2's shared state)
            await page.goto(app.url('/index.php/index')); await idle(page);
            const site = await carousel(page);
            await snap(page, '17-site-home-as-found', {carousel: site, journals: await page.locator('.journals li, .presses li, .servers li').allInnerTexts().catch(() => [])});
            // the site home in a second window a moment later, and the journal home again: nothing shared
            await page.goto(app.url(`/index.php/${app.contextPath}`)); await idle(page);
            const pk = await carousel(page);
            await snap(page, '18-publicknowledge-home', {carousel: pk});
            // the home page with the announcements block: the highlight title is not in it
            await page.goto(ctxUrl(app, P)); await idle(page);
            const annBlock = await page.locator('.cmp_announcements, .announcements, [class*="announcement"]').first().innerText().catch(() => null);
            record('19-home-announcements-block', {annBlock, hasHighlightTitle: annBlock ? /K3 (first|second|third) highlight/.test(annBlock) : null});
        } finally { await close(); }
    }

    // ---- lang: "Forms" languages, the two-language panel, the French reader ----
    if (on('lang')) {
        const {page, close} = await launch(app);
        try {
            await as(page, U.mgr, P);
            const lg = await openWebsiteTab(page, app, P, 'setup', 'Languages');
            await page.locator('#languageGridContainer .pkp_controllers_grid').waitFor({timeout: T});
            const grid = await page.locator('#languageGridContainer').evaluate((c) => ({header: [...c.querySelectorAll('thead th')].map((h) => h.innerText.trim()), rows: [...c.querySelectorAll('tbody tr.gridRow')].map((r) => ({text: r.innerText.trim().replace(/\s+/g, ' '), boxes: [...r.querySelectorAll('input[type=checkbox]')].map((b) => ({id: b.id, checked: b.checked, disabled: b.disabled}))}))}));
            await snap(page, '20-languages-default', {tabs: lg, grid});
            // the panel at the default end: one language
            await openHighlightsTab(page, app, P);
            await openAddPanel(page);
            const single = await formState(page);
            await snap(page, '21-panel-single-language', {form: single});
            await dialog(page).getByRole('button', {name: 'Close', exact: true}).click();
            await waitClosed(page);
            // tick French under "Forms"
            await openWebsiteTab(page, app, P, 'setup', 'Languages');
            await page.locator('#languageGridContainer .pkp_controllers_grid').waitFor({timeout: T});
            const formsBox = page.locator('#languageGridContainer input[type=checkbox][id*="fr_CA-formLocale"]').first();
            await loc(page, 'Setup › Languages: the "Forms" box of French', formsBox);
            if (await formsBox.count() && !(await formsBox.isChecked())) {
                const w = page.waitForResponse((r) => r.request().method() === 'POST' && /save-language-setting/i.test(r.url()), {timeout: T}).catch(() => null);
                await formsBox.click();
                await w; await idle(page);
                await page.waitForFunction(() => { const b = [...document.querySelectorAll('#languageGridContainer input[id*="fr_CA-formLocale"]')].pop(); return b && b.checked; }, null, {timeout: T}).catch(() => {});
            }
            const grid2 = await page.locator('#languageGridContainer').evaluate((c) => [...c.querySelectorAll('tbody tr.gridRow')].map((r) => ({text: r.innerText.trim().replace(/\s+/g, ' '), boxes: [...r.querySelectorAll('input[type=checkbox]')].map((b) => ({id: b.id, checked: b.checked}))})));
            await snap(page, '22-languages-forms-ticked', {grid2});
            await openHighlightsTab(page, app, P);
            await openAddPanel(page);
            const two = await formState(page);
            const frToggle = dialog(page).locator('.pkpFormLocales button').filter({hasText: /Fran|French/}).first();
            if (await frToggle.count()) { await frToggle.click(); await sleep(400); }
            const twoShown = await formState(page);
            await snap(page, '23-panel-two-languages', {form: two, afterFrench: twoShown});
            await dialog(page).getByRole('button', {name: 'Close', exact: true}).click();
            await waitClosed(page);
            // a French title and button label on the first highlight
            await openEditPanel(page, 'K3 first highlight');
            const frToggle2 = dialog(page).locator('.pkpFormLocales button').filter({hasText: /Fran|French/}).first();
            if (await frToggle2.count()) { await frToggle2.click(); await sleep(400); }
            await setRich(page, 'Title', 'Premier point fort K3', 1);
            await setRich(page, 'Description', 'La première description.', 1);
            await field(page, 'Button Label', 1).locator('input').first().fill('Lire l’appel');
            await save(page); await waitClosed(page);
            await snap(page, '24-edit-french-saved', {panel: await panelState(page)});
            await signOut(page);
            const fr = await homePage(page, app, P, '25-home-fr', {locale: 'fr_CA'});
            log('fr home: titles', JSON.stringify(fr.slides?.map((s) => s.title)), 'heading', JSON.stringify(fr.heading?.text), 'arrows', fr.prev?.ariaLabel, fr.next?.ariaLabel);
            await homePage(page, app, P, '25b-home-en', {locale: 'en'});
        } finally { await close(); }
    }

    // ---- settings: no setting of its own; the catalogue; the header-image theme option ----
    if (on('settings')) {
        const {page, close} = await launch(app);
        try {
            await as(page, U.mgr, P);
            const cat = {};
            for (const [topId, side] of [['setup', null], ['appearance', null], ['plugins', null]]) {
                const r = await openWebsiteTab(page, app, P, topId, side).catch((e) => ({error: String(e.message || e)}));
                cat[topId] = r;
            }
            // every side tab of Setup and Appearance: does its text mention highlights?
            const mentions = [];
            for (const topId of ['setup', 'appearance']) {
                const r = await openWebsiteTab(page, app, P, topId, null);
                for (const side of r.sideTabs) {
                    await page.locator(`[role="tabpanel"]#${topId}`).first().getByRole('tab', {name: side, exact: true}).first().click().catch(() => {});
                    await idle(page);
                    const text = await page.locator(`[role="tabpanel"]#${topId}`).first().innerText().catch(() => '');
                    mentions.push({top: topId, side, mentionsHighlight: /highlight/i.test(text), length: text.length});
                }
            }
            const others = [];
            for (const p of ['/management/settings/context', '/management/settings/workflow', '/management/settings/distribution']) {
                await page.goto(ctxUrl(app, P, p)); await idle(page);
                const text = await page.locator('main').innerText().catch(() => '');
                const tabs = await page.locator('main [role="tab"]').allInnerTexts().catch(() => []);
                others.push({path: p, tabs: tabs.map((t) => t.trim()), mentionsHighlight: /highlight/i.test(text)});
            }
            await snap(page, '26-settings-catalogue', {cat, mentions, others});
            // the theme's "header background" option: the homepage image leaves the page body
            await openWebsiteTab(page, app, P, 'appearance', 'Theme');
            const themeSelect = page.locator('[role="tabpanel"]#appearance select').first();
            const themeForm = page.locator('[role="tabpanel"]#appearance').getByRole('tabpanel', {name: 'Theme'});
            const hdrBox = themeForm.getByRole('checkbox', {name: headerImageOption});
            let hdrSave = null;
            if (await hdrBox.count()) { await hdrBox.check(); hdrSave = await saveVueForm(page, themeForm); }
            record('27-theme-header-image-saved', {hdrSave, present: await hdrBox.count()});
            await signOut(page);
            const c = await homePage(page, app, P, '27-home-header-image', {extra: {headerImage: await page.evaluate(() => { const h = document.querySelector('.pkp_structure_head'); return h ? {classes: h.className, bg: getComputedStyle(h).backgroundImage.slice(0, 120)} : null; })}});
            log('header image on: blocks', JSON.stringify(c.blocks?.map((b) => b.cls)));
            // restore
            await as(page, U.mgr, P);
            await openWebsiteTab(page, app, P, 'appearance', 'Theme');
            const themeForm2 = page.locator('[role="tabpanel"]#appearance').getByRole('tabpanel', {name: 'Theme'});
            const hdrBox2 = themeForm2.getByRole('checkbox', {name: headerImageOption});
            if (await hdrBox2.count() && await hdrBox2.isChecked()) { await hdrBox2.uncheck(); await saveVueForm(page, themeForm2); }
            await signOut(page);
        } finally { await close(); }
    }

    // ---- labels: every settings tab's field labels (no highlights setting anywhere); the Plugins list ----
    if (on('labels')) {
        const {page, close} = await launch(app);
        try {
            await as(page, U.mgr, P);
            const tabs = [];
            for (const topId of ['setup', 'appearance']) {
                const r = await openWebsiteTab(page, app, P, topId, null);
                for (const side of r.sideTabs) {
                    const panel = page.locator(`[role=tabpanel]#${topId}`).first();
                    await panel.getByRole('tab', {name: side, exact: true}).first().click().catch(() => {});
                    await idle(page);
                    const inner = panel.getByRole('tabpanel', {name: side}).first();
                    const labels = await inner.locator('.pkpFormFieldLabel, legend, label, th, .pkpHeader__title').evaluateAll((els) => [...new Set(els.map((e) => e.innerText.replace(/\s+/g, ' ').trim()).filter(Boolean))]).catch(() => []);
                    const text = await inner.innerText().catch(() => '');
                    tabs.push({top: topId, side, labels, mentionsHighlight: /highlight/i.test(text), highlightLines: text.split('\n').filter((l) => /highlight/i.test(l)).slice(0, 5)});
                }
            }
            await openWebsiteTab(page, app, P, 'plugins', null);
            await page.locator('tr.gridRow').first().waitFor({timeout: T}).catch(() => {});
            const plugins = await page.locator('tr.gridRow').evaluateAll((rows) => rows.map((r) => r.innerText.replace(/\s+/g, ' ').trim().slice(0, 80)));
            await snap(page, '33-settings-labels', {tabs, pluginsMentioningFeedOrHighlight: plugins.filter((p) => /feed|highlight/i.test(p)), pluginCount: plugins.length});
            await signOut(page);
        } finally { await close(); }
    }

    // ---- site: the "Journal redirect" select (read, then set and unset around one read) ----
    if (on('site')) {
        const {page, close} = await launch(app);
        try {
            await signIn(page, 'admin');
            await page.goto(app.url('/index.php/index/en/admin/settings')); await idle(page);
            const siteTab = page.getByRole('tab', {name: 'Site Setup', exact: true});
            if ((await siteTab.getAttribute('aria-selected').catch(() => null)) !== 'true') await siteTab.click().catch(() => {});
            await idle(page);
            const topTabs = await page.locator('main [role="tablist"]').first().getByRole('tab').allInnerTexts();
            const setupPanel = page.locator('[role="tabpanel"]#setup').first();
            const sideTabs = await setupPanel.locator('[role="tablist"]').first().getByRole('tab').allInnerTexts();
            await setupPanel.getByRole('tab', {name: 'Settings', exact: true}).click(); await idle(page);
            const redirect = setupPanel.locator('.pkpFormField').filter({hasText: /redirect/i}).first();
            const redirectData = await redirect.evaluate((f) => ({label: f.querySelector('.pkpFormFieldLabel')?.innerText.trim(), description: f.querySelector('.pkpFormField__description')?.innerText.trim(), options: [...(f.querySelector('select')?.options || [])].map((o) => ({value: o.value, label: o.label, selected: o.selected}))})).catch((e) => ({error: String(e.message || e)}));
            await snap(page, '28-site-settings-redirect', {topTabs: topTabs.map((t) => t.trim()), sideTabs: sideTabs.map((t) => t.trim()), redirectData});
            await loc(page, 'Site Settings › Settings: the redirect select', redirect.locator('select'));
            // set it to the K3 journal, read the site address signed out in a second browser, unset it
            const sel = redirect.locator('select');
            const opt = (redirectData.options || []).find((o) => o.label.includes('U11 K3'));
            const form = setupPanel.getByRole('tabpanel', {name: 'Settings'});
            const saveBtn = form.getByRole('button', {name: 'Save', exact: true});
            const formAfter = () => form.evaluate((root) => ({
                errors: root.querySelector('.pkpFormErrors')?.innerText.replace(/\s+/g, ' ').trim() ?? null,
                fieldErrors: [...root.querySelectorAll('.pkpFieldError')].map((e) => e.innerText.trim()),
                fieldsWithErrors: [...root.querySelectorAll('.pkpFormField')].filter((e) => e.querySelector('.pkpFieldError')).map((e) => e.querySelector('.pkpFormFieldLabel')?.innerText.trim()),
                status: root.querySelector('.pkpFormPage__status')?.innerText.trim() ?? null,
                saveDisabled: [...root.querySelectorAll('button')].filter((b) => b.innerText.trim() === 'Save').map((b) => b.disabled),
                pageNotice: document.querySelector('.app__notifications, [role="alert"]')?.innerText.trim() ?? null,
            })).catch((e) => ({error: String(e.message || e)}));
            const saveSite = async () => {
                const enabledBefore = await saveBtn.isEnabled().catch(() => null);
                if (!enabledBefore) return {enabledBefore, response: null, after: await formAfter()};
                const resp = page.waitForResponse((r) => /\/api\/v1\/site/.test(r.url()) && r.request().method() !== 'GET', {timeout: 8000}).catch(() => null);
                await saveBtn.click();
                const r = await resp; await idle(page); await sleep(600);
                return {enabledBefore, response: r ? {status: r.status(), method: r.request().method(), url: r.url()} : null, after: await formAfter()};
            };
            let windowLog = null;
            if (opt) {
                // the test install's site has no "Site Name", and the form refuses every save until it has one
                const siteName = form.locator('.pkpFormField').filter({hasText: /^Site Name/}).locator('input').first();
                const siteNameBefore = await siteName.inputValue().catch(() => null);
                if (siteNameBefore === '') await siteName.fill('Test site');
                record('28a-site-name', {siteNameBefore});
                await sel.selectOption(opt.value);
                const s1 = await saveSite();
                const setAt = new Date().toISOString();
                await snap(page, '28b-site-settings-after-save', {s1, selectedValue: await sel.inputValue().catch(() => null)});
                const other = await launch(app);
                let landing = null;
                try {
                    await other.page.goto(app.url('/index.php/index')); await idle(other.page);
                    const c = await carousel(other.page);
                    landing = {url: other.page.url(), title: await other.page.title(), carouselPresent: c.present, firstBlocks: c.blocks?.map((b) => b.cls).slice(0, 4)};
                    record('29-site-address-with-redirect', {...(await screen(other.page)), landing});
                } finally { await other.close(); }
                let s2 = null;
                if (s1.response && s1.response.status === 200) {
                    await sel.selectOption('');
                    s2 = await saveSite();
                }
                const unsetAt = new Date().toISOString();
                windowLog = {setAt, unsetAt, s1, s2, landing};
                const back = await launch(app);
                try {
                    await back.page.goto(app.url('/index.php/index')); await idle(back.page);
                    record('30-site-address-redirect-unset', {url: back.page.url(), title: await back.page.title(), s2});
                } finally { await back.close(); }
                if (s1.response && s1.response.status === 200) note(`K3 ${app.name}: the site's redirect was set to the K3 journal between ${setAt} and ${unsetAt} (one signed-out read of /index.php/index); unset since (s2 ${JSON.stringify(s2 && s2.response)})`);
            }
            record('29b-redirect-window', {windowLog, opt});
            await signOut(page).catch(() => {});
        } finally { await close(); }
    }

    // ---- feed (OJS): the announcement feed plugin lists announcements, not highlights ----
    if (on('feed') && isOjs) {
        const {page, close} = await launch(app);
        try {
            await as(page, U.mgr, P);
            await openWebsiteTab(page, app, P, 'plugins', null);
            await idle(page);
            const row = page.locator('tr.gridRow').filter({hasText: /Announcement Feed/i}).first();
            await row.waitFor({timeout: T}).catch(() => {});
            const box = row.locator('input[type=checkbox]').first();
            let feed = {rowFound: await row.count(), wasEnabled: await box.isChecked().catch(() => null)};
            if (await box.count() && !(await box.isChecked())) {
                await box.click(); await idle(page); await sleep(1000);
                feed.nowEnabled = await box.isChecked().catch(() => null);
            }
            await snap(page, '31-plugins-announcement-feed', {feed, rowText: await row.innerText().catch(() => null)});
            await signOut(page);
            const results = [];
            for (const fmt of ['rss2', 'atom', 'rss']) {
                const r = await page.request.get(ctxUrl(app, P, `/gateway/plugin/AnnouncementFeedGatewayPlugin/${fmt}`)).catch(() => null);
                const body = r ? await r.text() : '';
                results.push({fmt, status: r ? r.status() : null, type: r ? r.headers()['content-type'] : null, hasAnnouncement: /K3 announcement one/.test(body), hasHighlight: /K3 (first|second|third) highlight/.test(body), head: body.slice(0, 200)});
            }
            await page.goto(ctxUrl(app, P)); await idle(page);
            const links = await page.evaluate(() => [...document.querySelectorAll('link[rel="alternate"]')].map((l) => ({type: l.type, href: l.href})));
            record('31b-announcement-feed', {results, alternateLinks: links});
        } finally { await close(); }
    }

    // ---- sweep: leave the theme form changed and unsaved --------------------------
    if (on('sweep')) {
        const {page, close} = await launch(app);
        try {
            await as(page, U.mgr, P);
            const dialogs = [];
            page.on('dialog', (d) => { dialogs.push({type: d.type(), message: d.message()}); d.dismiss().catch(() => {}); });
            await openWebsiteTab(page, app, P, 'appearance', 'Theme');
            const themeSelect = page.locator('[role="tabpanel"]#appearance select').first();
            const themeForm = page.locator('[role="tabpanel"]#appearance').getByRole('tabpanel', {name: 'Theme'});
            const box = themeForm.getByRole('checkbox', {name: headerImageOption});
            if (await box.count()) await box.check();
            // switch side tab, then top tab, then leave the page
            await page.locator('[role="tabpanel"]#appearance').first().getByRole('tab', {name: 'Setup', exact: true}).first().click().catch(() => {});
            await idle(page);
            const afterSide = await screen(page);
            await page.locator('#setup-button').first().click(); await idle(page);
            const afterTop = await screen(page);
            await page.goto(ctxUrl(app, P, '/management/settings/context')); await idle(page);
            const afterLeave = await screen(page);
            // back: is the unsaved tick kept?
            await openWebsiteTab(page, app, P, 'appearance', 'Theme');
            const kept = await page.locator('[role="tabpanel"]#appearance').getByRole('tabpanel', {name: 'Theme'}).getByRole('checkbox', {name: headerImageOption}).isChecked().catch(() => null);
            record('32-sweep-theme-unsaved', {dialogs, afterSideUrl: afterSide.url, afterTopUrl: afterTop.url, afterLeaveUrl: afterLeave.url, afterLeaveTitle: afterLeave.title, unsavedTickKeptAfterLeave: kept});
            await signOut(page);
        } finally { await close(); }
    }
});
