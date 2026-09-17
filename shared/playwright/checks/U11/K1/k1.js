// U11 claim check, chunk K1: the journal's Highlights tab (Settings › Website ›
// Setup › Highlights) as the manager, on all three apps.
// Spec: docs/specs/U11-highlights.md — Purpose, Actors & permissions, Fields &
// validation (10–58), Rules 5–8 (83–98), Rules 10–11 (110–123), register A2
// (253–266); footnotes a, b, d, e, g, h, l, n, f-a2.
//
// Seeds its own scratch context (French under "UI" only, one throwaway account
// per permission level), signs in from the roster and records every screen
// with screen(). Per app: who reaches the tab (one account per level, the
// access-denied page below the manager level, `admin` in the journal, the
// seeded roster on publicknowledge read-only), the "Add Highlight" panel's
// five fields and their hints, the empty save refused, a title with Enter
// pressed and one bold word, "URL" without a scheme and with one (A2), the
// row without a reload and the slide, "Edit" pre-filled, closing without
// saving, the image (upload, preview, alternate text, the stored file, the
// slide's <img>, "Remove" / "Restore Original", a .txt refused), "Delete
// Highlight" ("No" then "Yes", the file gone), Rule 7 (a new highlight after a
// saved reorder), French under "Forms" (two-language panel, the edit-time
// primary-language refusal, the list under /fr_CA/), the site's "Add
// Highlight" panel as `admin` (read-only, closed unsaved) and a sweep of the
// way out (unsaved panel: Escape, the close control, leaving the page).
//
//   PROBE_FEATURE=U11 PROBE_AGENT=ccK1 node bin/probe.js all shared/playwright/checks/U11/K1/k1.js
//   PHASES=seed,access,roster,panel,add,edit,image,delete,order7,lang,site,siteMgr,sweep
//   (default: all; later phases reuse k1-state-<app>.json from the seed phase)
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, signOut, screen, shot, record, loc, note, idle, tag, outDir} =
    require('../../../probe');

const ALL_PHASES = ['seed', 'access', 'roster', 'panel', 'add', 'edit', 'image', 'delete', 'order7', 'lang', 'site', 'siteMgr', 'sweep'];
const PHASES = process.env.PHASES ? process.env.PHASES.split(',') : ALL_PHASES;
const on = (p) => PHASES.includes(p);
const log = (...a) => console.log('[k1]', ...a);
const stateFile = (app) => path.join(outDir(), `k1-state-${app.name}.json`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const T = 20_000;
const REPO = path.resolve(__dirname, '../../../../..');
const PNG = path.join(REPO, 'apps/ojs/playwright/fixtures/files/profile-image-400.png');

// ---------------------------------------------------------------------------
// Reading helpers

/** The visible side modal (the panel), the last one when they stack. */
const dialog = (page) => page.locator('[role="dialog"]:visible').last();

async function snap(page, name, extra = {}) {
    const s = await screen(page);
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
                titleHtml: li.querySelector('.listPanel__itemTitle')?.innerHTML.trim(),
                subtitle: li.querySelector('.listPanel__itemSubtitle')?.innerText.trim() ?? null,
                text: li.innerText.replace(/\s+/g, ' ').trim(),
                buttons: [...li.querySelectorAll('button')].map(btn),
            })),
        };
    }).catch((e) => ({error: String(e.message || e)}));
}

/** The side panel's form as data: fields (label, required mark, locale label, hint, kind), errors, footer buttons. */
async function formState(page) {
    const d = dialog(page);
    if ((await d.count()) === 0) return {open: false};
    return d.evaluate((root) => {
        const txt = (el) => (el ? el.innerText.replace(/\s+/g, ' ').trim() : null);
        return {
            open: true,
            heading: txt(root.querySelector('h1, h2, [id*="title"]')),
            errorSummary: txt(root.querySelector('.pkpFormErrors')),
            errorLinks: [...root.querySelectorAll('.pkpFormErrors li button, .pkpFormErrors li a')].map(txt),
            errorsAfterFields: (() => { const e = root.querySelector('.pkpFormErrors'); const f = root.querySelector('.pkpFormField'); return e && f ? !!(f.compareDocumentPosition(e) & Node.DOCUMENT_POSITION_FOLLOWING) : null; })(),
            locales: [...root.querySelectorAll('.pkpFormLocales .pkpFormLocales__locale')].map((l) => ({text: txt(l), tag: l.tagName.toLowerCase(), active: l.classList.contains('pkpFormLocales__locale--isActive'), primary: l.classList.contains('pkpFormLocales__locale--isPrimary')})),
            fields: [...root.querySelectorAll('.pkpFormField')].map((f) => ({
                classes: f.className.replace(/\s+/g, ' ').trim(),
                localeGroupVisible: f.closest('.pkpFormGroup__locale') ? f.closest('.pkpFormGroup__locale').classList.contains('pkpFormGroup__locale--isVisible') : null,
                label: txt(f.querySelector('.pkpFormFieldLabel')),
                localeLabel: txt(f.querySelector('.pkpFormFieldLabel .aria-hidden')),
                required: !!f.querySelector('.pkpFormFieldLabel__required'),
                description: txt(f.querySelector('.pkpFormField__description')),
                error: txt(f.querySelector('.pkpFieldError')),
                inputs: [...f.querySelectorAll('input:not([type=hidden]), textarea, iframe')].map((i) => ({tag: i.tagName.toLowerCase(), type: i.type || null, id: i.id, value: i.value ?? null, visible: i.offsetParent !== null})),
                buttons: [...f.querySelectorAll('button')].filter((b) => b.offsetParent !== null).map((b) => ({name: (b.getAttribute('aria-label') || b.innerText).replace(/\s+/g, ' ').trim(), disabled: b.disabled})),
                preview: (() => {
                    const img = f.querySelector('.pkpFormField--upload__preview img');
                    return img ? {src: img.getAttribute('src'), alt: img.getAttribute('alt'), naturalWidth: img.naturalWidth, complete: img.complete} : null;
                })(),
                dropzoneText: txt(f.querySelector('.dropzone, .vue-dropzone')),
                dropzoneHidden: !!f.querySelector('.-screenReader .dropzone, .-screenReader .vue-dropzone'),
                dropzoneMax: (() => { const dz = f.querySelector('.dropzone, .vue-dropzone'); return dz && dz.dropzone ? {maxFilesize: dz.dropzone.options.maxFilesize, acceptedFiles: dz.dropzone.options.acceptedFiles, dictInvalidFileType: dz.dropzone.options.dictInvalidFileType, dictFileTooBig: dz.dropzone.options.dictFileTooBig} : null; })(),
            })),
            footerButtons: [...root.querySelectorAll('.pkpFormPage__footer button')].map((b) => ({name: b.innerText.trim(), disabled: b.disabled})),
            status: txt(root.querySelector('.pkpFormPage__status')),
            closeControl: [...root.querySelectorAll('button')].filter((b) => b.querySelector('.sr-only')).map((b) => b.querySelector('.sr-only').innerText.trim()),
        };
    });
}

/** The home-page carousel as data. */
async function slides(page) {
    return page.evaluate(() => {
        const block = document.querySelector('.highlights');
        if (!block) return {present: false};
        const all = [...block.querySelectorAll('li.swiper-slide')];
        const parent = block.parentElement;
        return {
            present: true,
            heading: block.querySelector('h2')?.innerText.trim() ?? null,
            slides: all.map((li) => ({
                duplicate: li.classList.contains('swiper-slide-duplicate'),
                classes: li.className,
                title: li.querySelector('.swiper-slide-title')?.innerHTML.trim(),
                desc: li.querySelector('.swiper-slide-desc')?.innerHTML.trim(),
                button: {text: li.querySelector('.swiper-slide-button')?.innerText.trim(), href: li.querySelector('.swiper-slide-button')?.getAttribute('href'), resolved: li.querySelector('.swiper-slide-button')?.href},
                img: ((i) => (i ? {src: i.getAttribute('src'), alt: i.getAttribute('alt'), complete: i.complete, naturalWidth: i.naturalWidth, naturalHeight: i.naturalHeight, width: i.width, height: i.height} : null))(li.querySelector('img')),
            })),
            prev: block.querySelector('.swiper-button-prev')?.getAttribute('aria-label') ?? (block.querySelector('.swiper-button-prev') ? '(no aria-label)' : null),
            next: block.querySelector('.swiper-button-next')?.getAttribute('aria-label') ?? (block.querySelector('.swiper-button-next') ? '(no aria-label)' : null),
            dots: block.querySelectorAll('.swiper-pagination-bullet').length,
            positionAmongSiblings: [...parent.children].indexOf(block),
            siblings: [...parent.children].map((c) => (c.className || c.tagName).toString().slice(0, 60)),
        };
    });
}

/** The public files directory of the app (config.test.inc.php) and the context's highlights folder. */
function highlightsDir(app, contextId) {
    const cfg = fs.readFileSync(path.join(app.root, 'config.test.inc.php'), 'utf8');
    const m = cfg.match(/^public_files_dir\s*=\s*(.+)$/m);
    const pub = m ? m[1].trim() : path.join(app.root, 'public');
    const seg = {ojs: 'journals', omp: 'presses', ops: 'contexts'}[app.name];
    return path.join(pub, seg, String(contextId), 'highlights');
}
function listFiles(dir) {
    try { return fs.readdirSync(dir).map((f) => ({name: f, size: fs.statSync(path.join(dir, f)).size})); } catch { return []; }
}

// ---------------------------------------------------------------------------
// Driving helpers

function ctxUrl(app, ctxPath, p = '', locale = '') {
    return app.url(`/index.php/${ctxPath}${locale ? '/' + locale : ''}${p}`);
}

/** Open Settings › Website, select the top "Setup" tab, then the "Highlights" side tab. Returns the side tab names in order. */
async function openHighlightsTab(page, app, ctxPath, {locale = 'en'} = {}) {
    await page.goto(ctxUrl(app, ctxPath, '/management/settings/website', locale));
    await idle(page);
    const setupTab = page.locator('#setup-button');
    await setupTab.waitFor({timeout: T});
    if ((await setupTab.getAttribute('aria-selected')) !== 'true') await setupTab.click();
    await idle(page);
    const topTabs = await page.locator('main [role="tablist"]').first().getByRole('tab').allInnerTexts();
    const sidePanel = page.locator('#setup');
    const sideTabs = await sidePanel.locator('[role="tablist"]').first().getByRole('tab').allInnerTexts();
    const tab = sidePanel.getByRole('tab', {name: locale === 'fr_CA' ? /Highlights|Points|En vedette|Faits saillants/i : 'Highlights', exact: locale !== 'fr_CA'});
    const present = (await tab.count()) > 0;
    if (present) {
        await tab.first().click();
        await idle(page);
        await page.locator('.highlightsListPanel').waitFor({timeout: T}).catch(() => {});
        await idle(page);
    }
    return {topTabs: topTabs.map((t) => t.trim()), sideTabs: sideTabs.map((t) => t.trim()), highlightsTabPresent: present};
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
/** The TinyMCE body of a rich-text field (waits for the editor to be ready). */
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
async function setText(page, label, value) {
    const input = field(page, label).locator('input.pkpFormField__input, textarea').first();
    await input.fill(value);
}
async function save(page) {
    const d = dialog(page);
    await d.getByRole('button', {name: 'Save', exact: true}).click();
    await idle(page);
    await sleep(600);
    await idle(page);
}
async function waitClosed(page) {
    await page.locator('[role="dialog"]:visible').waitFor({state: 'hidden', timeout: T}).catch(() => {});
    await idle(page);
}

async function homePage(page, app, ctxPath, name, {locale = ''} = {}) {
    await page.goto(ctxUrl(app, ctxPath, '', locale));
    await idle(page);
    const s = await slides(page);
    await snap(page, name, {carousel: s});
    return s;
}

/** Sign in as a user of the scratch context through its own login page. */
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
    if (on('seed') || !st) {
        const t = tag('u11k1');
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
        const ctx = await app.api.createContext({tag: t, context: {name: `U11 K1 ${t}`, acronym: 'U11K1', supportedLocales: ['en', 'fr_CA']}, users});
        st = {tag: t, ctxPath: ctx.path || t, contextId: ctx.contextId, users: Object.fromEntries(users.map((u) => [u.username.slice(t.length), u.username]))};
        saveState();
        log('seeded', st.ctxPath, st.contextId);
        note(`K1 ${app.name}: scratch context ${st.ctxPath} (id ${st.contextId}); highlights files under ${highlightsDir(app, st.contextId)}`);
    }
    const P = st.ctxPath;
    const U = st.users;
    const hDir = highlightsDir(app, st.contextId);

    // ---- access: one account per permission level -----------------------------
    if (on('access')) {
        const {page, close} = await launch(app);
        try {
            const levels = [
                ['mgr', 'manager (ROLE_ID_MANAGER)'],
                ...(isOps ? [] : [['ed', 'editor (ROLE_ID_MANAGER)'], ['pe', 'productionEditor (ROLE_ID_MANAGER)']]),
                ['se', 'sectionEditor (ROLE_ID_SUB_EDITOR)'],
                ['ast', isOps ? 'editorialBoardMember (ROLE_ID_ASSISTANT)' : 'copyeditor (ROLE_ID_ASSISTANT)'],
                ['au', 'author (ROLE_ID_AUTHOR)'],
                ...(isOps ? [] : [['rev', 'externalReviewer (ROLE_ID_REVIEWER)']]),
                ['rd', 'reader (ROLE_ID_READER)'],
            ];
            for (const [key, level] of levels) {
                await as(page, U[key], P);
                const landed = page.url();
                await page.goto(ctxUrl(app, P, '/management/settings/website'));
                await idle(page);
                const managerLevel = ['mgr', 'ed', 'pe'].includes(key);
                let tabs = null;
                if (managerLevel) tabs = await openHighlightsTab(page, app, P);
                await snap(page, `01-access-${key}`, {level, user: U[key], landedAfterLogin: landed, tabs, panel: managerLevel ? await panelState(page) : null});
                if (!managerLevel) {
                    // the sweep: what the side navigation offers this role (Settings group present?)
                    await page.goto(ctxUrl(app, P, '/submissions')).catch(() => {});
                    await idle(page);
                    const nav = await page.locator('nav a, [role="navigation"] a').evaluateAll((els) => els.filter((e) => e.offsetParent !== null).map((e) => e.innerText.replace(/\s+/g, ' ').trim()).filter(Boolean)).catch(() => []);
                    record(`01-access-${key}-nav`, {user: U[key], level, url: page.url(), nav: [...new Set(nav)]});
                }
            }
            // the Site Administrator working in the journal
            await signIn(page, 'admin');
            const tabs = await openHighlightsTab(page, app, P);
            await snap(page, '01-access-admin', {level: 'site admin (ROLE_ID_SITE_ADMIN)', tabs, panel: await panelState(page)});
            await loc(page, 'Highlights tab: "Add Highlight"', page.locator('.highlightsListPanel').getByRole('button', {name: 'Add Highlight', exact: true}));
            await loc(page, 'Highlights tab: "Order"', page.locator('.highlightsListPanel').getByRole('button', {name: 'Order', exact: true}));
            await loc(page, 'Setup side tab "Highlights"', page.locator('#setup').getByRole('tab', {name: 'Highlights', exact: true}));
            await signOut(page);
        } finally { await close(); }
    }

    // ---- roster: the seeded accounts on publicknowledge, read-only ----------------
    if (on('roster')) {
        const {page, close} = await launch(app);
        try {
            const pk = app.contextPath;
            const roster = isOps ? ['manager.maya', 'sectioneditor.ana', 'author.alex'] : ['editor.diana', 'sectioneditor.ana', 'author.alex'];
            for (const user of roster) {
                await signIn(page, user);
                await page.goto(ctxUrl(app, pk, '/management/settings/website'));
                await idle(page);
                const manager = ['editor.diana', 'manager.maya'].includes(user);
                const tabs = manager ? await openHighlightsTab(page, app, pk) : null;
                await snap(page, `02-roster-${user.replace('.', '-')}`, {user, tabs, panel: manager ? await panelState(page) : null});
            }
            await signOut(page);
        } finally { await close(); }
    }

    // ---- panel: the "Add Highlight" panel's fields and the empty save ------------
    if (on('panel')) {
        const {page, close} = await launch(app);
        try {
            await as(page, U.mgr, P);
            const tabs = await openHighlightsTab(page, app, P);
            await snap(page, '03-tab-empty', {tabs, panel: await panelState(page)});
            await openAddPanel(page);
            const form0 = await formState(page);
            await snap(page, '04-add-panel', {form: form0});
            // the Title's toolbar shows on focus; the Description's is static
            const titleBody = await richBody(page, 'Title');
            await titleBody.click();
            await sleep(300);
            const toolbars = await dialog(page).evaluate((root) => [...root.querySelectorAll('.pkpFormField')].map((f) => ({label: f.querySelector('.pkpFormFieldLabel')?.innerText.replace(/\s+/g, ' ').trim(), toolbar: [...f.querySelectorAll('.tox-toolbar__group button, .tox-tbtn')].filter((b) => b.offsetParent !== null).map((b) => b.getAttribute('aria-label') || b.title || b.innerText.trim())})).filter((x) => x.toolbar.length));
            record('04-add-panel-toolbars', {toolbars});
            const fmt = dialog(page).getByRole('button', {name: 'Formatting', exact: true});
            if (await fmt.count()) {
                await fmt.first().click(); await sleep(300);
                const opened = await dialog(page).evaluate((root) => [...root.querySelectorAll('.tox-toolbar__group button, .tox-tbtn, .tox-toolbar__overflow button')].filter((b) => b.offsetParent !== null).map((b) => b.getAttribute('aria-label') || b.title || b.innerText.trim()));
                const overflow = await page.locator('.tox-toolbar__overflow button, .tox-pop button, .tox-tinymce-aux button').evaluateAll((els) => els.filter((b) => b.offsetParent !== null).map((b) => b.getAttribute('aria-label') || b.title || b.innerText.trim()));
                record('04-add-panel-formatting-open', {titleToolbarAfterFormatting: opened, overflowButtons: overflow});
                await loc(page, 'Add Highlight: Title "Formatting" button', fmt.first());
            }
            // Enter in the Title
            await titleBody.pressSequentially('Alpha');
            await page.keyboard.press('Enter');
            await titleBody.pressSequentially('Beta');
            await sleep(200);
            const titleHtmlAfterEnter = await titleBody.evaluate((b) => b.innerHTML);
            record('04-add-panel-enter', {titleHtmlAfterEnter, lines: (titleHtmlAfterEnter.match(/<br|<p|<div/g) || []).length});
            // the description's toolbar
            const descBody = await richBody(page, 'Description');
            await descBody.click();
            await sleep(300);
            const toolbars2 = await dialog(page).evaluate((root) => [...root.querySelectorAll('.pkpFormField')].map((f) => ({label: f.querySelector('.pkpFormFieldLabel')?.innerText.replace(/\s+/g, ' ').trim(), toolbar: [...f.querySelectorAll('.tox-toolbar__group button, .tox-tbtn')].filter((b) => b.offsetParent !== null).map((b) => b.getAttribute('aria-label') || b.title || b.innerText.trim())})).filter((x) => x.toolbar.length));
            record('04-add-panel-toolbars-desc', {toolbars: toolbars2});
            // empty everything and save
            await setRich(page, 'Title', '');
            await save(page);
            await snap(page, '05-add-empty-save', {form: await formState(page)});
            await loc(page, 'Add Highlight: error summary', dialog(page).locator('.pkpForm__errors'));
            await loc(page, 'Add Highlight: Title field error', field(page, 'Title').locator('.pkpFieldError'));
            // one fault only: "Save" stays disabled after a refused save while any error stands, so close and reopen, fill URL and Button Label, leave Title empty
            await dialog(page).getByRole('button', {name: 'Close', exact: true}).click();
            await waitClosed(page);
            await openAddPanel(page);
            await setText(page, 'URL', 'https://example.org/one');
            await setText(page, 'Button Label', 'One');
            await save(page);
            await snap(page, '05b-add-one-error', {form: await formState(page)});
            // close the panel with its close control (nothing saved)
            await dialog(page).getByRole('button', {name: 'Close', exact: true}).click();
            await waitClosed(page);
            await snap(page, '05c-after-close', {panel: await panelState(page)});
            await signOut(page);
        } finally { await close(); }
    }

    // ---- add: a bold word, "read more" as URL (A2), the row and the slide ---------
    if (on('add')) {
        const {page, close} = await launch(app);
        try {
            await as(page, U.mgr, P);
            await openHighlightsTab(page, app, P);
            await openAddPanel(page);
            const body = await setRich(page, 'Title', 'Bold');
            for (let i = 0; i < 4; i++) await page.keyboard.press('Shift+ArrowLeft');
            await page.keyboard.press('ControlOrMeta+B');
            await page.keyboard.press('ArrowRight');
            await body.pressSequentially(' title one');
            await setRich(page, 'Description', 'Description one');
            await setText(page, 'URL', 'read more');
            await setText(page, 'Button Label', 'Read more');
            const titleHtml = await body.evaluate((b) => b.innerHTML);
            const before = await panelState(page);
            const reloads = [];
            page.on('framenavigated', (f) => { if (f === page.mainFrame()) reloads.push(f.url()); });
            await save(page);
            await waitClosed(page);
            await snap(page, '06-add-saved', {titleHtml, before, panel: await panelState(page), navigationsDuringSave: reloads, dialogOpen: (await page.locator('[role="dialog"]:visible').count()) > 0});
            // control: a full address
            await openAddPanel(page);
            await setRich(page, 'Title', 'Second highlight');
            await setText(page, 'URL', 'https://example.org/cfp');
            await setText(page, 'Button Label', 'Call for papers');
            await save(page);
            await waitClosed(page);
            await snap(page, '06b-add-second', {panel: await panelState(page)});
            st.titles = ['Bold title one', 'Second highlight'];
            saveState();
            // the home page, signed in, then signed out
            const s = await homePage(page, app, P, '07-home-after-add');
            await signOut(page);
            const s2 = await homePage(page, app, P, '07b-home-signed-out');
            // follow the "read more" button
            const btn = page.locator('.highlights .swiper-slide:not(.swiper-slide-duplicate) .swiper-slide-button').filter({hasText: 'Read more'}).first();
            const href = await btn.getAttribute('href');
            const resp = await Promise.all([page.waitForResponse((r) => r.request().resourceType() === 'document', {timeout: T}).catch(() => null), btn.click({force: true})]);
            await idle(page);
            await snap(page, '08-follow-read-more', {href, landedUrl: page.url(), status: resp[0] ? resp[0].status() : null, slidesBefore: s2.slides.length, slidesSignedIn: s.slides.length});
            await signOut(page).catch(() => {});
        } finally { await close(); }
    }

    // ---- edit: pre-filled, close without saving, save in place --------------------
    if (on('edit')) {
        const {page, close} = await launch(app);
        try {
            await as(page, U.mgr, P);
            await openHighlightsTab(page, app, P);
            await openEditPanel(page, 'Second highlight');
            const values = {
                title: await (await richBody(page, 'Title')).evaluate((b) => b.innerHTML),
                description: await (await richBody(page, 'Description')).evaluate((b) => b.innerHTML),
                url: await field(page, 'URL').locator('input').first().inputValue(),
                urlText: await field(page, 'Button Label').locator('input').first().inputValue(),
            };
            await snap(page, '09-edit-panel', {form: await formState(page), values});
            // change the title, then close with the close control
            const dialogs = [];
            page.on('dialog', (d) => { dialogs.push({type: d.type(), message: d.message()}); d.accept().catch(() => {}); });
            await setRich(page, 'Title', 'Changed but not saved');
            await dialog(page).getByRole('button', {name: 'Close', exact: true}).click();
            await sleep(500);
            await idle(page);
            await snap(page, '10-edit-closed-unsaved', {panel: await panelState(page), browserDialogs: dialogs, vueDialogsOpen: await page.locator('[role="dialog"]:visible').count(), dialogText: (await page.locator('[role="dialog"]:visible').last().innerText().catch(() => null))});
            // reopen: still the old values?
            await page.reload(); await idle(page);
            await openHighlightsTab(page, app, P);
            await openEditPanel(page, 'Second highlight');
            const reopened = await (await richBody(page, 'Title')).evaluate((b) => b.innerHTML);
            // now change and save
            await setRich(page, 'Title', 'Second highlight edited');
            const reloads = [];
            page.on('framenavigated', (f) => { if (f === page.mainFrame()) reloads.push(f.url()); });
            await save(page);
            await waitClosed(page);
            await snap(page, '11-edit-saved', {reopenedTitle: reopened, panel: await panelState(page), navigationsDuringSave: reloads});
            st.titles[1] = 'Second highlight edited';
            saveState();
            await homePage(page, app, P, '12-home-after-edit');
            await signOut(page);
        } finally { await close(); }
    }

    // ---- image: upload, preview, alt text, the file, the slide, Remove / Restore, .txt
    if (on('image')) {
        const {page, close} = await launch(app);
        try {
            await as(page, U.mgr, P);
            await openHighlightsTab(page, app, P);
            await openEditPanel(page, /title one/);
            const before = await formState(page);
            const fileInput = page.locator('input[type=file]').last();
            await loc(page, 'Image: the dropzone hidden file input', fileInput);
            const uploadResp = page.waitForResponse((r) => /temporaryFiles/.test(r.url()) && r.request().method() === 'POST', {timeout: T}).catch(() => null);
            await fileInput.setInputFiles(PNG);
            const up = await uploadResp;
            await idle(page);
            await sleep(800);
            const afterUpload = await formState(page);
            await snap(page, '13-image-uploaded', {uploadStatus: up ? up.status() : null, imageFieldBefore: before.fields.find((f) => /^Image/.test(f.label || '')), imageField: afterUpload.fields.find((f) => /^Image/.test(f.label || ''))});
            await loc(page, 'Image: the preview', field(page, 'Image').locator('.pkpFormField--upload__preview img'));
            await loc(page, 'Image: "Alternate text" box', field(page, 'Image').locator('input.pkpFormField--uploadImage__altTextInput'));
            await field(page, 'Image').locator('input.pkpFormField--uploadImage__altTextInput').fill('A picture of the first highlight');
            await save(page);
            await waitClosed(page);
            const files1 = listFiles(hDir);
            await snap(page, '14-image-saved', {panel: await panelState(page), highlightsDir: hDir, files: files1});
            // the slide
            const home = await homePage(page, app, P, '15-home-with-image');
            const img = home.slides.find((s) => s.img)?.img;
            let imgFetch = null;
            if (img?.resolved || img?.src) {
                const r = await page.request.get(img.src.startsWith('http') ? img.src : app.url(img.src)).catch(() => null);
                imgFetch = r ? {status: r.status(), type: r.headers()['content-type']} : null;
            }
            record('15-home-with-image-fetch', {img, imgFetch});
            // Edit: preview, Remove, Restore Original, Remove, Save
            await openHighlightsTab(page, app, P);
            await openEditPanel(page, /title one/);
            const editImg = (await formState(page)).fields.find((f) => /^Image/.test(f.label || ''));
            await field(page, 'Image').getByRole('button', {name: 'Remove', exact: true}).click();
            await sleep(400);
            const afterRemove = (await formState(page)).fields.find((f) => /^Image/.test(f.label || ''));
            await loc(page, 'Image: "Restore Original"', field(page, 'Image').getByRole('button', {name: 'Restore Original', exact: true}));
            await field(page, 'Image').getByRole('button', {name: 'Restore Original', exact: true}).click();
            await sleep(400);
            const afterRestore = (await formState(page)).fields.find((f) => /^Image/.test(f.label || ''));
            await snap(page, '16-image-remove-restore', {editImg, afterRemove, afterRestore});
            await field(page, 'Image').getByRole('button', {name: 'Remove', exact: true}).click();
            await sleep(300);
            await save(page);
            await waitClosed(page);
            const files2 = listFiles(hDir);
            await snap(page, '17-image-removed-saved', {panel: await panelState(page), files: files2});
            await homePage(page, app, P, '18-home-text-only');
            // a .txt refused in the box; then an image again (for the delete phase's file)
            await openHighlightsTab(page, app, P);
            await openEditPanel(page, /title one/);
            const txt = path.join(outDir(), 'k1-not-an-image.txt');
            fs.writeFileSync(txt, 'not an image\n');
            const apiCalls = [];
            page.on('request', (r) => { if (/temporaryFiles/.test(r.url())) apiCalls.push({method: r.method(), url: r.url()}); });
            await page.locator('input[type=file]').last().setInputFiles(txt);
            await sleep(1200);
            await idle(page);
            const afterTxt = (await formState(page)).fields.find((f) => /^Image/.test(f.label || ''));
            const dzText = await field(page, 'Image').evaluate((f) => ({errors: [...f.querySelectorAll('.dz-error-message, .dz-error-message span, .pkpFieldError')].map((e) => e.innerText.trim()).filter(Boolean), previewItems: [...f.querySelectorAll('.dz-preview')].map((p) => p.className)}));
            await snap(page, '19-image-txt-refused', {imageField: afterTxt, dropzone: dzText, temporaryFilesRequests: apiCalls});
            // the other end of the size axis: a file over the server's limit, refused in the box before any request
            try {
                const bigCount = 101;
                const big = path.join(outDir(), 'k1-too-big.png');
                if (!fs.existsSync(big) || fs.statSync(big).size !== bigCount * 1024 * 1024) { const fd = fs.openSync(big, 'w'); fs.ftruncateSync(fd, bigCount * 1024 * 1024); fs.closeSync(fd); }
                const calls2 = [];
                page.on('request', (r) => { if (/temporaryFiles/.test(r.url())) calls2.push({method: r.method(), url: r.url()}); });
                await page.locator('input[type=file]').last().setInputFiles(big);
                await sleep(1500); await idle(page);
                const dzBig = await field(page, 'Image').evaluate((f) => ({errors: [...f.querySelectorAll('.dz-error-message, .dz-error-message span, .pkpFieldError')].map((e) => e.innerText.trim()).filter(Boolean), previewItems: [...f.querySelectorAll('.dz-preview')].map((p) => p.className), text: f.innerText.replace(/\s+/g, ' ').trim()}));
                record('19c-image-too-big', {dropzone: dzBig, temporaryFilesRequests: calls2, imageField: (await formState(page)).fields.find((f) => /^Image/.test(f.label || ''))});
                fs.unlinkSync(big);
            } catch (e) { record('19c-image-too-big', {error: String(e.message || e)}); }
            // upload the PNG again and save (the delete phase deletes this file with the highlight)
            const up2 = page.waitForResponse((r) => /temporaryFiles/.test(r.url()) && r.request().method() === 'POST', {timeout: T}).catch(() => null);
            await page.locator('input[type=file]').last().setInputFiles(PNG);
            await up2; await idle(page); await sleep(600);
            await field(page, 'Image').locator('input.pkpFormField--uploadImage__altTextInput').fill('Picture again');
            await save(page);
            await waitClosed(page);
            record('19b-image-again', {files: listFiles(hDir), panel: await panelState(page)});
            await signOut(page);
        } finally { await close(); }
    }

    // ---- delete: the dialog, "No", "Yes", the file gone ----------------------------
    if (on('delete')) {
        const {page, close} = await launch(app);
        try {
            await as(page, U.mgr, P);
            await openHighlightsTab(page, app, P);
            const filesBefore = listFiles(hDir);
            const row = page.locator('.highlightsListPanel .listPanel__item').filter({hasText: /title one/}).first();
            await row.getByRole('button', {name: 'Delete', exact: true}).click();
            await page.locator('[role="dialog"]:visible').waitFor({timeout: T});
            await sleep(300);
            const dlg = page.locator('[role="dialog"]:visible').last();
            const dialogData = {text: await dlg.innerText(), html: await dlg.evaluate((d) => d.innerHTML.slice(0, 4000)), buttons: await dlg.getByRole('button').allInnerTexts(), title: await dlg.locator('h1, h2, h3, [id*="title"]').first().innerText().catch(() => null)};
            await snap(page, '20-delete-dialog', {dialogData, filesBefore});
            await loc(page, 'Delete Highlight dialog', dlg);
            await dlg.getByRole('button', {name: 'No', exact: true}).click();
            await sleep(400); await idle(page);
            await snap(page, '21-delete-no', {panel: await panelState(page), dialogsOpen: await page.locator('[role="dialog"]:visible').count(), files: listFiles(hDir)});
            await row.getByRole('button', {name: 'Delete', exact: true}).click();
            await page.locator('[role="dialog"]:visible').waitFor({timeout: T});
            const del = page.waitForResponse((r) => /highlights\/\d+/.test(r.url()) && r.request().method() === 'POST', {timeout: T}).catch(() => null);
            await page.locator('[role="dialog"]:visible').last().getByRole('button', {name: 'Yes', exact: true}).click();
            const dr = await del;
            await idle(page); await sleep(600);
            await snap(page, '22-delete-yes', {deleteStatus: dr ? dr.status() : null, deleteOverride: dr ? dr.request().headers()['x-http-method-override'] : null, panel: await panelState(page), files: listFiles(hDir), focused: await page.evaluate(() => { const a = document.activeElement; return a ? {tag: a.tagName, text: (a.innerText || '').slice(0, 60), cls: a.className.toString().slice(0, 80)} : null; })});
            st.titles = st.titles.filter((t) => !/title one/.test(t));
            saveState();
            await homePage(page, app, P, '23-home-after-delete');
            await signOut(page);
        } finally { await close(); }
    }

    // ---- order7: a new highlight goes last after a saved reorder ---------------------
    if (on('order7')) {
        const {page, close} = await launch(app);
        try {
            await as(page, U.mgr, P);
            await openHighlightsTab(page, app, P);
            // bring the list to three: A (existing "Second highlight edited"), B, C
            for (const [t, u] of [['Third highlight', 'https://example.org/3'], ['Fourth highlight', 'https://example.org/4']]) {
                await openAddPanel(page);
                await setRich(page, 'Title', t);
                await setText(page, 'URL', u);
                await setText(page, 'Button Label', 'Go');
                await save(page); await waitClosed(page);
            }
            const three = await panelState(page);
            const panel = page.locator('.highlightsListPanel');
            await panel.getByRole('button', {name: 'Order', exact: true}).click();
            await sleep(300);
            const ordering = await panelState(page);
            // move the last row to the top
            const lastRow = () => panel.locator('.listPanel__item').filter({hasText: 'Fourth highlight'}).first();
            await lastRow().getByRole('button', {name: /Increase position of/}).click(); await sleep(200);
            await lastRow().getByRole('button', {name: /Increase position of/}).click(); await sleep(200);
            const moved = await panelState(page);
            const orderResp = page.waitForResponse((r) => /highlights\/order/.test(r.url()), {timeout: T}).catch(() => null);
            await panel.getByRole('button', {name: 'Save Order', exact: true}).click();
            const orr = await orderResp; await idle(page); await sleep(400);
            const saved = await panelState(page);
            await openAddPanel(page);
            await setRich(page, 'Title', 'Fifth highlight');
            await setText(page, 'URL', 'https://example.org/5');
            await setText(page, 'Button Label', 'Go');
            await save(page); await waitClosed(page);
            const afterAdd = await panelState(page);
            await snap(page, '24-order7', {three: three.rows.map((r) => r.title), ordering: {headerButtons: ordering.headerButtons, rowButtons: ordering.rows[0]?.buttons}, moved: moved.rows.map((r) => r.title), orderStatus: orr ? orr.status() : null, saved: saved.rows.map((r) => r.title), afterAdd: afterAdd.rows.map((r) => r.title)});
            await page.reload(); await idle(page);
            await openHighlightsTab(page, app, P);
            record('24b-order7-reloaded', {rows: (await panelState(page)).rows.map((r) => r.title)});
            await homePage(page, app, P, '25-home-after-order7');
            st.titles = ['Fourth highlight', 'Second highlight edited', 'Third highlight', 'Fifth highlight'];
            saveState();
            await signOut(page);
        } finally { await close(); }
    }

    // ---- lang: French under "Forms", the two-language panel, the fr_CA list ----------
    if (on('lang')) {
        const {page, close} = await launch(app);
        try {
            await as(page, U.mgr, P);
            // the list under /fr_CA/ before any French title (fallback to the primary language)
            const tabsFr = await openHighlightsTab(page, app, P, {locale: 'fr_CA'});
            await snap(page, '26-list-fr-before', {tabs: tabsFr, panel: await panelState(page)});
            // tick French under "Forms"
            await page.goto(ctxUrl(app, P, '/management/settings/website', 'en')); await idle(page);
            const setupTab = page.locator('#setup-button');
            if ((await setupTab.getAttribute('aria-selected').catch(() => null)) !== 'true') await setupTab.click();
            await page.locator('#setup').getByRole('tab', {name: 'Languages', exact: true}).click(); await idle(page);
            await page.locator('#languageGridContainer .pkp_controllers_grid').waitFor({timeout: T});
            const formsBox = page.locator('#languageGridContainer input[type=checkbox][id*="fr_CA-formLocale"]').first();
            const gridBefore = await page.locator('#languageGridContainer').evaluate((c) => [...c.querySelectorAll('tbody tr.gridRow')].map((r) => r.innerText.trim().replace(/\s+/g, ' ')));
            if (await formsBox.count() && !(await formsBox.isChecked())) {
                const w = page.waitForResponse((r) => r.request().method() === 'POST' && /save-language-setting/.test(r.url()), {timeout: T}).catch(() => null);
                await formsBox.click();
                await w; await idle(page);
                await page.waitForFunction(() => { const b = [...document.querySelectorAll('#languageGridContainer input[id*="fr_CA-formLocale"]')].pop(); return b && b.checked; }, null, {timeout: T}).catch(() => {});
            }
            await snap(page, '27-languages-forms-ticked', {gridBefore});
            // the panel with two languages
            await openHighlightsTab(page, app, P);
            await openAddPanel(page);
            await snap(page, '28-add-panel-two-languages', {form: await formState(page)});
            const frToggle = dialog(page).locator('.pkpFormLocales button').filter({hasText: /Fran|French/}).first();
            await loc(page, 'Add Highlight: the French locale toggle', frToggle);
            if (await frToggle.count()) { await frToggle.click(); await sleep(400); }
            await snap(page, '28b-add-panel-french-shown', {form: await formState(page)});
            // empty save on an add with two languages
            await save(page);
            await snap(page, '29-add-empty-two-languages', {form: await formState(page)});
            // fill French only (the primary empty): what is refused ("Save" stays disabled while an error stands, so reopen first)
            await dialog(page).getByRole('button', {name: 'Close', exact: true}).click();
            await waitClosed(page);
            await openAddPanel(page);
            const frToggleB = dialog(page).locator('.pkpFormLocales button').filter({hasText: /Fran|French/}).first();
            if (await frToggleB.count()) { await frToggleB.click(); await sleep(400); }
            await setRich(page, 'Title', 'Titre en français', 1);
            await setText(page, 'URL', 'https://example.org/fr');
            await field(page, 'Button Label', 1).locator('input').first().fill('Lire');
            await save(page);
            await snap(page, '29b-add-french-only', {form: await formState(page)});
            await dialog(page).getByRole('button', {name: 'Close', exact: true}).click();
            await waitClosed(page);
            // edit an English-only highlight: empty the primary title and save
            await openEditPanel(page, 'Third highlight');
            const frToggle2 = dialog(page).locator('.pkpFormLocales button').filter({hasText: /Fran|French/}).first();
            if (await frToggle2.count()) { await frToggle2.click(); await sleep(400); }
            await setRich(page, 'Title', '', 0);
            await save(page);
            await snap(page, '30-edit-empty-primary', {form: await formState(page)});
            // restore the English title, add a French one, save
            await setRich(page, 'Title', 'Third highlight', 0);
            await setRich(page, 'Title', 'Troisième en vedette', 1);
            await field(page, 'Button Label', 1).locator('input').first().fill('Allez');
            await save(page); await waitClosed(page);
            await snap(page, '31-edit-french-saved', {panel: await panelState(page)});
            // the list under /fr_CA/ now
            const tabsFr2 = await openHighlightsTab(page, app, P, {locale: 'fr_CA'});
            await snap(page, '32-list-fr-after', {tabs: tabsFr2, panel: await panelState(page)});
            // the slide under /fr_CA/ (the French title where it exists, the English one otherwise)
            await homePage(page, app, P, '33-home-fr', {locale: 'fr_CA'});
            await homePage(page, app, P, '33b-home-en', {locale: 'en'});
            await signOut(page);
        } finally { await close(); }
    }

    // ---- site: the site's "Add Highlight" panel as admin, read-only -------------------
    if (on('site')) {
        const {page, close} = await launch(app);
        try {
            await signIn(page, 'admin');
            await page.goto(app.url('/index.php/index/en/admin/settings')); await idle(page);
            // the admin page carries two `#setup-button` tabs (the top "Site Setup" and an inner "Setup"), so go by name
            const setupTab = page.getByRole('tab', {name: 'Site Setup', exact: true});
            const hasSetup = (await setupTab.count()) > 0;
            let tabs = null;
            if (hasSetup) {
                if ((await setupTab.first().getAttribute('aria-selected')) !== 'true') await setupTab.first().click();
                await idle(page);
                const setupPanel = page.locator('[role="tabpanel"]#setup').first();
                tabs = await setupPanel.locator('[role="tablist"]').first().getByRole('tab').allInnerTexts();
                const hl = setupPanel.getByRole('tab', {name: 'Highlights', exact: true});
                if (await hl.count()) {
                    await hl.click(); await idle(page);
                    await page.locator('.highlightsListPanel').waitFor({timeout: T}).catch(() => {});
                    await openAddPanel(page);
                    await snap(page, '34-site-add-panel', {tabs: tabs.map((t) => t.trim()), form: await formState(page)});
                    await dialog(page).getByRole('button', {name: 'Close', exact: true}).click();
                    await waitClosed(page);
                } else {
                    await snap(page, '34-site-no-highlights-tab', {tabs});
                }
            } else {
                await snap(page, '34-site-no-setup-tab', {});
            }
            await signOut(page);
        } finally { await close(); }
    }

    // ---- siteMgr: the site's settings address as a journal manager (Actors row 2, "never") ----
    if (on('siteMgr')) {
        const {page, close} = await launch(app);
        try {
            await as(page, U.mgr, P);
            const nav = await page.locator('nav a, [role="navigation"] a').evaluateAll((els) => els.filter((e) => e.offsetParent !== null).map((e) => e.innerText.replace(/\s+/g, ' ').trim()).filter(Boolean)).catch(() => []);
            await page.goto(app.url('/index.php/index/en/admin/settings')); await idle(page);
            await snap(page, '39-site-settings-as-manager', {user: U.mgr, sideNavBeforehand: [...new Set(nav)], denied: /does not have access|Access denied/i.test((await page.locator('body').innerText().catch(() => '')) || '')});
            await page.goto(app.url('/index.php/index/en/admin')); await idle(page);
            await snap(page, '39b-admin-index-as-manager', {user: U.mgr});
            await signOut(page);
        } finally { await close(); }
    }

    // ---- sweep: the way out with something unsaved --------------------------------------
    if (on('sweep')) {
        const {page, close} = await launch(app);
        try {
            const browserDialogs = [];
            page.on('dialog', (d) => { browserDialogs.push({type: d.type(), message: d.message()}); d.accept().catch(() => {}); });
            await as(page, U.mgr, P);
            await openHighlightsTab(page, app, P);
            // Escape with unsaved text
            await openAddPanel(page);
            await setRich(page, 'Title', 'Unsaved by Escape');
            await page.keyboard.press('Escape');
            await sleep(500); await idle(page);
            const escapeInEditor = {dialogsOpen: await page.locator('[role="dialog"]:visible').count()};
            // Escape inside the TinyMCE frame is the editor's; press it again with the focus on the URL box
            if (escapeInEditor.dialogsOpen) { await field(page, 'URL').locator('input').first().click(); await page.keyboard.press('Escape'); await sleep(500); await idle(page); }
            await snap(page, '35-sweep-escape', {escapeInEditor,dialogsOpen: await page.locator('[role="dialog"]:visible').count(), dialogText: await page.locator('[role="dialog"]:visible').last().innerText().catch(() => null), browserDialogs, panel: await panelState(page)});
            if (await page.locator('[role="dialog"]:visible').count()) {
                await page.locator('[role="dialog"]:visible').last().getByRole('button', {name: 'Close', exact: true}).click().catch(() => {});
                await waitClosed(page);
            }
            // clicking the overlay outside the panel
            await openAddPanel(page);
            await setRich(page, 'Title', 'Unsaved by overlay click');
            await page.mouse.click(20, 450);
            await sleep(500); await idle(page);
            await snap(page, '36-sweep-overlay', {dialogsOpen: await page.locator('[role="dialog"]:visible').count(), dialogText: await page.locator('[role="dialog"]:visible').last().innerText().catch(() => null), browserDialogs});
            if (await page.locator('[role="dialog"]:visible').count()) {
                await page.locator('[role="dialog"]:visible').last().getByRole('button', {name: 'Close', exact: true}).click().catch(() => {});
                await waitClosed(page);
            }
            // leaving the page with the panel open and text typed
            await openAddPanel(page);
            await setRich(page, 'Title', 'Unsaved by leaving');
            await page.goto(ctxUrl(app, P, '/submissions')).catch((e) => record('37-sweep-leave-error', {error: String(e.message)}));
            await idle(page);
            await snap(page, '37-sweep-leave', {browserDialogs, url: page.url()});
            // back on the tab: nothing was saved
            await openHighlightsTab(page, app, P);
            await snap(page, '38-sweep-list-after', {panel: await panelState(page)});
            // the row: what a row shows besides the title (the sweep)
            const rowHtml = await page.locator('.highlightsListPanel .listPanel__item').first().evaluate((li) => li.outerHTML.slice(0, 3000)).catch(() => null);
            record('38-sweep-row-html', {rowHtml});
            await signOut(page);
        } finally { await close(); }
    }

});
