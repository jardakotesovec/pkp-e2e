// U11 sync check fr0924 (after lib/pkp 25182919bf, the fr_CA translation of
// common.highlights): Rule 11's French interface, scenario 4 "The list in
// French" / "The slides in French", register A7, on a running install.
// Seeds per app, through POST scenarios/context: a journal with French under
// "UI" and "Forms", a manager. Through the manager's own panel (in English):
// "Call for papers" (English only) and "Second call" / "Appel à
// contributions" (both languages).
// Screens, each recorded with screen() and swept for raw "##key##" codes:
//   01     Settings › Website › Setup › Highlights in French: top tabs, side
//          tabs, the panel's heading, rows and buttons
//   02     "Add Highlight" in French: the panel's heading, labels; then a
//          title typed and the panel closed unsaved
//   03     "Edit" on a row in French: the heading
//   04     "Delete" on a row in French: the dialog, then cancelled
//   05     "Order" in French, then cancelled
//   06/07  the home page signed out, French then English (the carousel)
//   08     the site's Highlights tab in French, as admin (multi-journal site)
// Run: PROBE_FEATURE=sync PROBE_AGENT=fr0924 node bin/probe.js all shared/playwright/checks/U11/K1/k1-fr0924.js
const {forEachApp, launch, signIn, signOut, screen, shot, record, loc, note, idle, tag} = require('../../../probe');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const T = 20_000;
const log = (...a) => console.log('[fr0924]', ...a);
const ctxUrl = (app, ctx, p = '', locale = '') => app.url(`/index.php/${ctx}${locale ? '/' + locale : ''}${p}`);
const dialog = (page) => page.locator('[role="dialog"]:visible').last();

/** Every "##key##" left on the page (rendered text and naming attributes), with where it sits and whether it is visible. */
const rawKeys = (page) => page.evaluate(() => {
    const re = /##[A-Za-z0-9_.\-]+##/g;
    const vis = (e) => !!(e && (e.offsetWidth || e.offsetHeight || e.getClientRects().length));
    const where = (e) => {
        const land = e.closest('nav[aria-label], [role="dialog"], header, main, aside, footer, [role="tabpanel"], .highlights');
        const own = `${e.tagName.toLowerCase()}${e.id ? '#' + e.id : ''}${typeof e.className === 'string' && e.className ? '.' + e.className.trim().split(/\s+/).slice(0, 2).join('.') : ''}`;
        const l = land ? `${land.tagName.toLowerCase()}${land.id ? '#' + land.id : ''}${land.getAttribute('aria-label') ? '[' + land.getAttribute('aria-label') + ']' : ''}` : 'body';
        return `${l} > ${own}`;
    };
    const found = new Map();
    const add = (k, e, how) => found.set(`${k} @ ${where(e)} (${how}${vis(e) ? '' : ', hidden'})`, true);
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        if (n.parentElement && n.parentElement.tagName === 'SCRIPT') continue;
        (n.nodeValue.match(re) || []).forEach((k) => add(k, n.parentElement, 'text'));
    }
    for (const el of document.querySelectorAll('[aria-label],[title],[alt],[placeholder]')) {
        for (const a of ['aria-label', 'title', 'alt', 'placeholder']) {
            const v = el.getAttribute(a);
            if (v) (v.match(re) || []).forEach((k) => add(k, el, a));
        }
    }
    (document.title.match(re) || []).forEach((k) => found.set(`${k} @ <title>`, true));
    return [...found.keys()];
});

async function snap(page, name, extra = {}) {
    const s = await screen(page);
    const raw = await rawKeys(page).catch(() => null);
    record(name, {...s, rawKeys: raw, ...extra});
    await shot(page, name).catch(() => {});
    return raw;
}

function watchDialogs(page) {
    const seen = [];
    page.on('dialog', async (d) => {
        seen.push({type: d.type(), message: d.message(), url: page.url()});
        await d.accept().catch(() => {});
    });
    return seen;
}

/** The Highlights list panel: heading, header buttons, rows. */
const panelState = (page) => page.locator('.highlightsListPanel').first().evaluate((root) => {
    const btn = (b) => ({name: (b.getAttribute('aria-label') || b.innerText).replace(/\s+/g, ' ').trim(), disabled: b.disabled});
    return {
        title: root.querySelector('.pkpHeader__title')?.innerText.trim() ?? null,
        headerButtons: [...root.querySelectorAll('.pkpHeader button, .listPanel__header button')].map(btn),
        empty: root.querySelector('.listPanel__empty')?.innerText.trim() ?? null,
        rows: [...root.querySelectorAll('.listPanel__item')].map((li) => ({title: li.querySelector('.listPanel__itemTitle')?.innerText.trim(), buttons: [...li.querySelectorAll('button')].map(btn)})),
    };
}).catch((e) => ({error: String(e.message || e)}));

/** The side panel's form: heading, locale buttons, field labels, footer buttons. */
const formState = (page) => dialog(page).evaluate((root) => {
    const txt = (el) => (el ? el.innerText.replace(/\s+/g, ' ').trim() : null);
    return {
        heading: txt(root.querySelector('h1, h2')),
        locales: txt(root.querySelector('.pkpFormLocales')),
        labels: [...root.querySelectorAll('.pkpFormFieldLabel')].filter((l) => l.offsetParent !== null).map(txt),
        descriptions: [...root.querySelectorAll('.pkpFormField__description')].filter((l) => l.offsetParent !== null).map(txt),
        footer: [...root.querySelectorAll('.pkpFormPage__footer button')].map((b) => b.innerText.trim()),
        text: txt(root).slice(0, 1500),
    };
}).catch((e) => ({error: String(e.message || e)}));

/** The home-page carousel: screen-reader heading, arrows, slides. */
const carousel = (page) => page.evaluate(() => {
    const block = document.querySelector('.highlights');
    if (!block) return {present: false};
    const arrow = (b) => (b ? {ariaLabel: b.getAttribute('aria-label'), disabled: b.getAttribute('aria-disabled')} : null);
    return {
        present: true,
        heading: block.querySelector('h2')?.innerText.trim() ?? null,
        headingClass: block.querySelector('h2')?.className ?? null,
        prev: arrow(block.querySelector('.swiper-button-prev')),
        next: arrow(block.querySelector('.swiper-button-next')),
        slides: [...block.querySelectorAll('li.swiper-slide')].map((li) => ({title: li.querySelector('.swiper-slide-title')?.innerText.trim() ?? null, desc: li.querySelector('.swiper-slide-desc')?.innerText.trim() ?? null, button: li.querySelector('.swiper-slide-button')?.innerText.trim() ?? null, ariaLabel: li.getAttribute('aria-label')})),
        dots: [...block.querySelectorAll('.swiper-pagination-bullet')].map((b) => b.getAttribute('aria-label')),
    };
});

async function openHighlights(page, app, ctx, locale) {
    await page.goto('about:blank');
    await page.goto(ctxUrl(app, ctx, '/management/settings/website', locale));
    await idle(page);
    const top = page.locator('#setup-button').first();
    await top.waitFor({timeout: T});
    if ((await top.getAttribute('aria-selected')) !== 'true') await top.click();
    await page.locator('#highlights-button').first().click();
    await page.locator('.highlightsListPanel').first().waitFor({timeout: T});
    await idle(page);
    return page.evaluate(() => ({
        topTabs: [...document.querySelectorAll('main [role="tablist"]')][0] ? [...[...document.querySelectorAll('main [role="tablist"]')][0].querySelectorAll('[role="tab"]')].map((t) => t.innerText.trim()) : null,
        setupSideTabs: [...(document.querySelector('[role="tabpanel"]#setup [role="tablist"]')?.querySelectorAll('[role="tab"]') || [])].map((t) => t.innerText.trim()),
        highlightsTab: document.querySelector('#highlights-button')?.innerText.trim() ?? null,
    }));
}

function field(page, label, index = 0) {
    return dialog(page).locator('.pkpFormField').filter({has: page.locator('label.pkpFormFieldLabel'), hasText: new RegExp(`(^|\\s)${label}`)}).nth(index);
}
async function setRich(page, label, text, index = 0) {
    const f = field(page, label, index);
    const frame = f.locator('iframe').first();
    await frame.waitFor({timeout: T});
    const body = frame.contentFrame().locator('body');
    await page.waitForFunction((el) => el.contentDocument && el.contentDocument.body && el.contentDocument.body.getAttribute('contenteditable') === 'true', await frame.elementHandle(), {timeout: T}).catch(() => {});
    await body.click();
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.press('Delete');
    await body.pressSequentially(text);
    await sleep(150);
}
async function openAdd(page, name = /^(Add Highlight|Ajouter)/) {
    await page.locator('.highlightsListPanel').first().getByRole('button', {name}).first().click();
    await dialog(page).locator('.pkpFormPage__footer').waitFor({timeout: T});
    await idle(page);
    await sleep(400);
}
async function saveAndWait(page) {
    await dialog(page).getByRole('button', {name: /^(Save|Enregistrer)$/}).first().click();
    await page.locator('[role="dialog"]:visible').waitFor({state: 'hidden', timeout: T}).catch(() => {});
    await idle(page);
}

forEachApp(async (app) => {
    const t = tag('u11f');
    const mgr = `${t}mgr`;
    await app.api.createContext({tag: t, context: {name: `FR0924 ${t}`, supportedLocales: ['en', 'fr_CA'], supportedFormLocales: ['en', 'fr_CA']},
        users: [{username: mgr, roles: ['manager']}]});
    note(`fr0924 [${app.name}]: U11 scratch context ${t} (en+fr_CA UI and Forms; ${mgr}=manager)`);
    const {page, close} = await launch(app);
    const dialogs = watchDialogs(page);
    const out = {ctx: t};
    try {
        await signIn(page, mgr, {contextPath: t});
        await idle(page);
        // the two highlights, through the panel in English
        await openHighlights(page, app, t, 'en');
        await openAdd(page);
        await setRich(page, 'Title', 'Call for papers');
        await field(page, 'URL').locator('input').first().fill('https://example.org/cfp');
        await field(page, 'Button Label').locator('input').first().fill('Read more');
        await saveAndWait(page);
        await openAdd(page);
        await setRich(page, 'Title', 'Second call');
        await field(page, 'URL').locator('input').first().fill('https://example.org/appel');
        await field(page, 'Button Label').locator('input').first().fill('Read on');
        const fr = dialog(page).locator('.pkpFormLocales button').filter({hasText: /Fran|French/}).first();
        if (await fr.count()) { await fr.click(); await sleep(400); }
        await setRich(page, 'Title', 'Appel à contributions', 1);
        await field(page, 'Button Label', 1).locator('input').first().fill('Lire');
        await saveAndWait(page);
        out.enPanel = await panelState(page);

        // 01 the tab in French
        out.tabsFr = await openHighlights(page, app, t, 'fr_CA');
        out.panelFr = await panelState(page);
        out.raw01 = await snap(page, '01-highlights-tab-fr', {tabs: out.tabsFr, panel: out.panelFr});
        await loc(page, 'Setup › Highlights side tab (fr_CA), by id', page.locator('#highlights-button').first());

        // 02 "Add" in French, then left with a title typed
        await openAdd(page, /^(Ajouter|Mettre en vedette)/);
        out.addFormFr = await formState(page);
        out.raw02 = await snap(page, '02-add-panel-fr', {form: out.addFormFr});
        await setRich(page, 'Titre', 'Non enregistré').catch(async () => setRich(page, 'Title', 'Non enregistré'));
        const closeBtn = dialog(page).getByRole('button', {name: /^(Fermer|Close)$/}).first();
        out.addCloseLabel = await closeBtn.innerText().catch(() => null);
        await closeBtn.click().catch(() => {});
        await sleep(800);
        out.addCloseDialogs = dialogs.splice(0);
        out.addOpenAfterClose = await page.locator('[role="dialog"]:visible').count();
        if (out.addOpenAfterClose) out.addStillOpen = await formState(page);
        out.panelAfterAddClose = await panelState(page);

        // 03 "Edit" in French
        await openHighlights(page, app, t, 'fr_CA');
        const row = page.locator('.highlightsListPanel .listPanel__item').first();
        await row.locator('button').filter({hasText: /Modifier|Edit/}).first().click();
        await dialog(page).locator('.pkpFormPage__footer').waitFor({timeout: T});
        await idle(page);
        await sleep(400);
        out.editFormFr = await formState(page);
        out.raw03 = await snap(page, '03-edit-panel-fr', {form: out.editFormFr});
        await dialog(page).getByRole('button', {name: /^(Fermer|Close)$/}).first().click().catch(() => {});
        await sleep(800);
        out.editCloseDialogs = dialogs.splice(0);

        // 04 "Delete" in French, cancelled
        await openHighlights(page, app, t, 'fr_CA');
        await page.locator('.highlightsListPanel .listPanel__item').first().locator('button').filter({hasText: /Supprimer|Delete/}).first().click();
        await page.locator('[role="dialog"]:visible, [role="alertdialog"]:visible').first().waitFor({timeout: T});
        await sleep(300);
        out.deleteDialogFr = await page.locator('[role="dialog"]:visible, [role="alertdialog"]:visible').last().innerText();
        out.raw04 = await snap(page, '04-delete-dialog-fr', {dialogText: out.deleteDialogFr});
        await page.locator('[role="dialog"]:visible, [role="alertdialog"]:visible').last().getByRole('button', {name: /Annuler|Cancel|Non|No/}).first().click().catch(() => {});
        await sleep(500);
        out.rowsAfterDeleteCancel = (await panelState(page)).rows?.map((r) => r.title);

        // 05 "Order" in French, cancelled
        await page.locator('.highlightsListPanel').first().getByRole('button', {name: /^(Classer|Order)/}).first().click().catch(() => {});
        await sleep(400);
        out.orderingFr = await panelState(page);
        out.raw05 = await snap(page, '05-ordering-fr', {panel: out.orderingFr});
        await page.locator('.highlightsListPanel').first().getByRole('button', {name: /^(Annuler|Cancel)$/}).first().click().catch(() => {});
        await sleep(300);
        // leave the page
        await page.goto(ctxUrl(app, t, '/management/settings/website', 'en'));
        await idle(page);
        out.leaveDialogs = dialogs.splice(0);
        await signOut(page);

        // 06/07 the home page, signed out
        await page.goto(ctxUrl(app, t, '', 'fr_CA'));
        await idle(page);
        out.homeFr = await carousel(page);
        out.raw06 = await snap(page, '06-home-fr', {carousel: out.homeFr});
        await page.goto(ctxUrl(app, t, '', 'en'));
        await idle(page);
        out.homeEn = await carousel(page);
        out.raw07 = await snap(page, '07-home-en', {carousel: out.homeEn});

        // 08 the site's Highlights tab in French, as admin
        await signIn(page, 'admin');
        await page.goto(app.url('/index.php/index/fr_CA/admin/settings'));
        await idle(page);
        await page.locator('#setup-button').first().click().catch(() => {});
        await idle(page);
        out.siteSetupTabsFr = await page.evaluate(() => [...document.querySelectorAll('[role="tab"]')].filter((x) => x.offsetParent !== null).map((x) => ({id: x.id, text: x.innerText.trim()})));
        const siteTab = page.locator('#highlights-button').first();
        if (await siteTab.count()) {
            await siteTab.click();
            await page.locator('.highlightsListPanel').first().waitFor({timeout: T}).catch(() => {});
            await idle(page);
            out.sitePanelFr = await panelState(page);
        }
        out.raw08 = await snap(page, '08-site-highlights-fr', {tabs: out.siteSetupTabsFr, panel: out.sitePanelFr || null});
        await page.goto(app.url('/index.php/index/en/admin'));
        await idle(page);
        await signOut(page);
    } finally {
        record('u11-summary', out);
        log(app.name, JSON.stringify({tab: out.tabsFr?.highlightsTab, panel: out.panelFr?.title, rows: out.panelFr?.rows?.map((r) => r.title), carousel: out.homeFr?.heading, arrows: [out.homeFr?.prev?.ariaLabel, out.homeFr?.next?.ariaLabel]}));
        await close();
    }
});
