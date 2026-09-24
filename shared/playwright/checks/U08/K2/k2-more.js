// U08 claim check K2, the second half of k2.js (same state file, same run):
//   lang    L (en + fr_CA): Rule 12, td11, Settings 12–13
//   flips   S: Settings 2–9, 15–18, each at both ends where a screen reaches it
//   permit  P: Settings 11 ("Permit changes to Settings")
//   depth   B: Settings 14 at its default (2), the menu window
//   site    Settings 10 (the site's "Enable institutional statistics", put
//           back at once) and the site's header after a site item is added
//           and removed (side effects)
const {launch, signIn, signOut, record, loc, note, idle, shot} = require('../../../probe');
const H = require('./lib');
const {T, sleep, log, flat1, ctxUrl, snap, as, watchDialogs, openNav, grids, rowControls, rowAction, editor, menuWindow, openMenu, panels, brief, panelItem, drag, assignTop, dialogs, notice, pressWindowButton, saveMenu, itemWindow, openItemWindow, itemState, itemSave, closeItemWindow, setType, fillTitle, addItem, header, flat, hflat, readNav, sideMenu, openSettings, saveForm, mceSet, visibleBoxes} = H;

const titleBoxes = (st) => st.inputs.filter((i) => /^(title|remoteUrl|queryParams)\[/.test(i.name)).map((i) => `${i.name}${i.visible ? '' : '(hidden)'}=${JSON.stringify(i.value)}`);

/** The editorial header's initials menu: open it and list its entries. */
async function initialsMenu(page, app, ctx) {
    await page.goto(ctxUrl(app, ctx, '/submissions'));
    await idle(page);
    const nav = page.locator('[data-cy="app-user-nav"]');
    const btn = nav.getByRole('button').first();
    const name = await btn.getAttribute('aria-label').catch(() => null) || await btn.innerText().catch(() => null);
    await btn.click().catch(() => {});
    await sleep(600);
    const entries = await page.locator('[role="menu"]:visible [role="menuitem"], [data-cy="app-user-nav"] a:visible, [data-cy="app-user-nav"] button:visible, [role="menu"]:visible a, [role="menu"]:visible button').evaluateAll((els) => [...new Set(els.map((e) => e.innerText.replace(/\s+/g, ' ').trim()).filter(Boolean))]);
    return {buttonName: name, entries};
}

/** An editorial-side address: denied, the form, or somewhere else. */
async function classify(page) {
    const text = (await page.locator('body').innerText().catch(() => '')) || '';
    return {url: page.url(), h1: await page.locator('main h1, h1').allInnerTexts().catch(() => []), denied: /(does not have access|not have access|Access denied|not authorized)/i.test(text), snippet: (text.match(/[^\n]*(access|denied|authoriz)[^\n]*/gi) || []).slice(0, 3)};
}

module.exports = async function more({app, S, on, isOjs, isOps, removeRow, pressIcons, editorialHeader, archivesLike}) {
    const {B, L, P} = S;
    const SS = S.S;
    const isOmp = app.name === 'omp';

    // ---- lang: Rule 12, td11, Settings 12–13 ----
    if (on('lang')) {
        const {page, close} = await launch(app);
        try {
            const out = {};
            const al = archivesLike(app);
            out.hOutEn0 = hflat(await header(page, app, L.path, 'en'));
            out.hOutFr0 = hflat(await header(page, app, L.path, 'fr_CA'));
            await snap(page, 'l0-l-header-fr-before');
            await page.goto(ctxUrl(app, L.path, '', 'en'));
            await as(page, L.users.mgr, L.path);
            await openNav(page, app, L.path, 'en');
            out.gridsEn0 = await grids(page);
            await openItemWindow(page, 'edit', al);
            out.alOpened = await itemState(page);
            await snap(page, 'l1-l-archives-window', {boxes: titleBoxes(out.alOpened)});
            await fillTitle(page, 'Back issues', 'en');
            out.alSave = await itemSave(page);
            await openNav(page, app, L.path, 'en');
            await openItemWindow(page, 'add');
            await fillTitle(page, 'Our news', 'en');
            await setType(page, 'Remote URL');
            out.remoteBoxes = titleBoxes(await itemState(page));
            await itemWindow(page).locator('input[name="remoteUrl[en]"]').fill('https://pkp.sfu.ca');
            out.newsSave = await itemSave(page);
            if (out.newsSave.windowOpen) await closeItemWindow(page);
            await openNav(page, app, L.path, 'en');
            await openMenu(page, 'Primary Navigation Menu');
            out.newsPlaced = await assignTop(page, 'Our news');
            out.newsMenuSave = await saveMenu(page);
            // a French title typed on "Submissions" (the other end: a typed French title)
            await openNav(page, app, L.path, 'en');
            await openItemWindow(page, 'edit', 'Submissions');
            out.subOpened = titleBoxes(await itemState(page));
            await itemWindow(page).locator('input[name="title[en]"]').click();
            await itemWindow(page).locator('input[name="title[fr_CA]"]').fill('Soumissions K2');
            out.subSave = await itemSave(page);
            out.hInEn1 = hflat(await header(page, app, L.path, 'en'));
            out.hInFr1 = hflat(await header(page, app, L.path, 'fr_CA'));
            await snap(page, 'l2-l-header-fr-after');
            await page.goto(ctxUrl(app, L.path, '', 'en'));
            await signOut(page).catch(() => {});
            out.hOutEn1 = hflat(await header(page, app, L.path, 'en'));
            out.hOutFr1 = hflat(await header(page, app, L.path, 'fr_CA'));
            await page.goto(ctxUrl(app, L.path, '', 'en'));
            await as(page, L.users.mgr, L.path);
            // the Archives item reopened: both boxes; the French box emptied
            await openNav(page, app, L.path, 'en');
            await openItemWindow(page, 'edit', 'Back issues');
            out.alReopened = titleBoxes(await itemState(page));
            await itemWindow(page).locator('input[name="title[en]"]').click();
            await itemWindow(page).locator('input[name="title[fr_CA]"]').fill('');
            out.alFrEmptySave = await itemSave(page);
            await openNav(page, app, L.path, 'en');
            await openItemWindow(page, 'edit', 'Back issues');
            out.alAfterEmpty = titleBoxes(await itemState(page));
            await snap(page, 'l3-l-archives-after-french-emptied', {boxes: out.alAfterEmpty});
            await closeItemWindow(page);
            // the typed French title emptied again
            await openNav(page, app, L.path, 'en');
            await openItemWindow(page, 'edit', 'Submissions');
            await itemWindow(page).locator('input[name="title[en]"]').click();
            await itemWindow(page).locator('input[name="title[fr_CA]"]').fill('');
            out.subFrEmptySave = await itemSave(page);
            await openNav(page, app, L.path, 'en');
            await openItemWindow(page, 'edit', 'Submissions');
            out.subAfterEmpty = titleBoxes(await itemState(page));
            await closeItemWindow(page);
            out.hInFr2 = hflat(await header(page, app, L.path, 'fr_CA'));
            // the tables in French
            await openNav(page, app, L.path, 'fr_CA');
            out.gridsFr = await grids(page);
            await snap(page, 'l4-l-tables-french', {g: out.gridsFr});
            await page.goto(ctxUrl(app, L.path, '', 'en'));
            // Settings 13: the item window's boxes on L (two form languages) and on B (one)
            await openNav(page, app, L.path, 'en');
            await openItemWindow(page, 'add');
            await setType(page, 'Search');
            out.boxesL = titleBoxes(await itemState(page));
            await setType(page, 'Remote URL');
            out.boxesLRemote = titleBoxes(await itemState(page));
            await closeItemWindow(page);
            // Settings 12: the initials menu with two UI languages
            out.initialsL = await initialsMenu(page, app, L.path);
            await snap(page, 'l5-l-initials-menu');
            await signOut(page).catch(() => {});
            await as(page, B.users.mgr, B.path);
            await openNav(page, app, B.path);
            await openItemWindow(page, 'add');
            await setType(page, 'Search');
            out.boxesB = titleBoxes(await itemState(page));
            await setType(page, 'Remote URL');
            out.boxesBRemote = titleBoxes(await itemState(page));
            await snap(page, 'l6-b-add-item-one-language');
            await closeItemWindow(page);
            out.initialsB = await initialsMenu(page, app, B.path);
            await snap(page, 'l7-b-initials-menu');
            await signOut(page).catch(() => {});
            await as(page, 'manager.maya', 'publicknowledge');
            out.initialsPk = await initialsMenu(page, app, 'publicknowledge');
            await signOut(page).catch(() => {});
            record('l9-lang-summary', out);
            log(app.name, 'lang before', JSON.stringify({outEn: out.hOutEn0, outFr: out.hOutFr0, items: out.gridsEn0.items.rows}));
            log(app.name, 'lang archives', JSON.stringify({opened: titleBoxes(out.alOpened), save: out.alSave.notice, remoteBoxes: out.remoteBoxes, news: out.newsSave.notice, placed: out.newsPlaced, menuSave: out.newsMenuSave, subOpened: out.subOpened, subSave: out.subSave.notice}));
            log(app.name, 'lang headers', JSON.stringify({inEn: out.hInEn1, inFr: out.hInFr1, outEn: out.hOutEn1, outFr: out.hOutFr1}));
            log(app.name, 'lang emptied', JSON.stringify({reopened: out.alReopened, save: out.alFrEmptySave.notice, open: out.alFrEmptySave.windowOpen, after: out.alAfterEmpty, subSave: out.subFrEmptySave.notice, subAfter: out.subAfterEmpty, inFr2: out.hInFr2}));
            log(app.name, 'lang fr tables', JSON.stringify(out.gridsFr.items.rows));
            log(app.name, 'lang boxes', JSON.stringify({L: out.boxesL, LRemote: out.boxesLRemote, B: out.boxesB, BRemote: out.boxesBRemote}));
            log(app.name, 'lang initials', JSON.stringify({L: out.initialsL, B: out.initialsB, pk: out.initialsPk}));
        } finally { await close(); }
    }

    // ---- lang2: French as a UI language only, then ticked under "Forms" on screen (Rule 12's axis) ----
    if (on('lang2')) {
        const fs = require('fs');
        const pth = require('path');
        if (!S.L2) {
            const t = require('../../../probe').tag('u08k2m');
            await app.api.createContext({tag: t, users: [{username: `${t}mgr`, roles: ['manager']}], context: {supportedLocales: ['en', 'fr_CA']}});
            S.L2 = {path: t, users: {mgr: `${t}mgr`}};
            fs.writeFileSync(pth.join(H.outDir(), `k2-state-${app.name}.json`), JSON.stringify(S, null, 1));
        }
        const L2 = S.L2;
        const {page, close} = await launch(app);
        try {
            const out = {};
            out.outFr0 = hflat(await header(page, app, L2.path, 'fr_CA'));
            await snap(page, 'm0-l2-header-fr-ui-only');
            await page.goto(ctxUrl(app, L2.path, '', 'en'));
            await as(page, L2.users.mgr, L2.path);
            await openNav(page, app, L2.path, 'en');
            await openItemWindow(page, 'edit', 'About');
            out.boxes0 = titleBoxes(await itemState(page));
            await closeItemWindow(page);
            await page.goto(ctxUrl(app, L2.path, '/management/settings/website', 'en'));
            await idle(page);
            await page.locator('#setup-button').first().click();
            await idle(page);
            await page.getByRole('tab', {name: 'Languages', exact: true}).filter({visible: true}).first().click();
            await idle(page); await sleep(800);
            const row = page.locator('tr.gridRow').filter({hasText: 'fr_CA'}).first();
            await row.waitFor({timeout: T});
            out.gridBefore = await page.locator('#languageGridContainer').evaluate((c) => ({columns: [...c.querySelectorAll('thead th')].map((t) => t.innerText.trim()), rows: [...c.querySelectorAll('tbody tr.gridRow')].map((r) => ({text: r.innerText.trim().replace(/\s+/g, ' '), boxes: [...r.querySelectorAll('input[type=checkbox]')].map((b) => ({id: b.id.replace(/-[0-9a-f]{10,}$/, ''), checked: b.checked}))}))})).catch(() => null);
            await snap(page, 'm1-l2-languages-grid-before', {grid: out.gridBefore});
            const formsBox = row.locator('input[type="checkbox"][id*="formLocale"]').first();
            const w = page.waitForResponse((r) => r.request().method() === 'POST' && /language/.test(r.url()), {timeout: T}).catch(() => null);
            await formsBox.click({noWaitAfter: true});
            const r = await w;
            out.formsSave = r ? r.status() : null;
            await sleep(1500); await idle(page);
            out.gridAfter = await page.locator('#languageGridContainer').evaluate((c) => [...c.querySelectorAll('tbody tr.gridRow')].map((r) => ({text: r.innerText.trim().replace(/\s+/g, ' ').slice(0, 40), boxes: [...r.querySelectorAll('input[type=checkbox]')].map((b) => b.checked)}))).catch(() => null);
            await snap(page, 'm2-l2-languages-grid-after', {grid: out.gridAfter});
            await openNav(page, app, L2.path, 'en');
            await openItemWindow(page, 'edit', 'About');
            out.boxes1 = titleBoxes(await itemState(page));
            await closeItemWindow(page);
            await signOut(page).catch(() => {});
            out.outFr1 = hflat(await header(page, app, L2.path, 'fr_CA'));
            await snap(page, 'm3-l2-header-fr-after-forms');
            record('m9-lang2-summary', out);
            log(app.name, 'lang2', JSON.stringify(out));
        } finally { await close(); }
    }

    // ---- flips: Settings 2–9, 15–18 on S ----
    if (on('flips')) {
        const {page, close} = await launch(app);
        const bd = watchDialogs(page);
        try {
            const out = {};
            const U = SS.users;
            const readAll = async (label, whos = ['out', 'rd', 'mgr']) => {
                const r = {};
                for (const who of whos) {
                    if (who === 'out') await signOut(page).catch(() => {});
                    else await as(page, U[who], SS.path);
                    r[who] = hflat(await header(page, app, SS.path));
                    if (who === 'mgr') r.nav = (await sideMenu(page, app, SS.path)).groupLabels.map((g) => g.replace(/^Editor Dashboard › .*/, 'Editor Dashboard › …'));
                }
                await as(page, U.mgr, SS.path);
                out[label] = r;
                log(app.name, 'flips read', label, JSON.stringify(r));
                return r;
            };
            await as(page, U.mgr, SS.path);
            // OJS: the Subscriptions items placed in the primary menu first
            if (isOjs) {
                await openNav(page, app, SS.path);
                out.addSubs = await addItem(page, 'Subscriptions', 'Subscriptions');
                out.addMySubs = await addItem(page, 'My Subscriptions', 'My Subscriptions');
                await openNav(page, app, SS.path);
                await openMenu(page, 'Primary Navigation Menu');
                await assignTop(page, 'Subscriptions');
                await assignTop(page, 'My Subscriptions');
                out.subsArranged = brief(await panels(page));
                out.subsSave = await saveMenu(page);
            }
            await readAll('r0-defaults');
            await snap(page, 'f0-s-defaults');

            // Settings 2: publishing / posting mode
            await openSettings(page, app, SS.path, 'distribution', null, null);
            out.distTabs = await page.locator('[role="tab"]').evaluateAll((els) => els.filter((e) => e.offsetParent).map((e) => e.innerText.trim()));
            await snap(page, 'f1-s-distribution');
            const accessTab = page.locator('[id="access-button"]');
            if (await accessTab.count()) { await accessTab.first().click(); await idle(page); await sleep(500); }
            out.accessRadios = await page.locator('input[name="publishingMode"]').evaluateAll((els) => els.map((e) => ({value: e.value, checked: e.checked, label: (e.closest('label') || e.parentElement).innerText.trim()})));
            await snap(page, 'f2-s-access-tab', {radios: out.accessRadios});
            if (out.accessRadios.length) {
                const none = page.locator('input[name="publishingMode"]').nth(out.accessRadios.findIndex((r) => /will not be used/.test(r.label)));
                await none.check({force: true});
                out.modeNoneSave = await saveForm(page, 'input[name="publishingMode"]');
                await readAll('r2-mode-none', ['out', 'mgr']);
                await openSettings(page, app, SS.path, 'distribution', 'access', null);
                await page.locator('input[name="publishingMode"]').nth(out.accessRadios.findIndex((r) => /open access/.test(r.label))).check({force: true});
                out.modeBackSave = await saveForm(page, 'input[name="publishingMode"]');
            }

            // Settings 3: the contact
            await openSettings(page, app, SS.path, 'context', 'contact', null);
            await snap(page, 'f3-s-contact-tab');
            const f = (n) => page.locator(`form [name="${n}"]`).first();
            out.contactFields = await page.locator('[role="tabpanel"]:visible form').first().evaluate((fm) => [...fm.querySelectorAll('input[name], textarea[name]')].filter((e) => e.type !== 'hidden').map((e) => ({name: e.name, value: e.value.slice(0, 40), required: e.required || e.getAttribute('aria-required')}))).catch(() => null);
            const addrId = await page.evaluate(() => (window.tinymce ? window.tinymce.get().map((e) => e.id).find((i) => /mailingAddress/.test(i)) : null)).catch(() => null);
            out.addrEditor = addrId;
            if (await f('supportName').count()) await f('supportName').fill('Support K2');
            if (await f('supportEmail').count()) await f('supportEmail').fill('supportk2@mail.test');
            // (a) the mailing address alone emptied, the name kept
            if (addrId) await mceSet(page, addrId, '');
            else await page.locator('textarea[name="mailingAddress"]').first().fill('').catch(() => {});
            out.addrEmptySave = await saveForm(page, '[name="contactName"]');
            await readAll('r3a-address-empty-name-kept', ['out']);
            // (b) the name emptied too
            await openSettings(page, app, SS.path, 'context', 'contact', null);
            await f('contactName').fill('');
            if (await f('supportName').count()) await f('supportName').fill('Support K2');
            if (await f('supportEmail').count()) await f('supportEmail').fill('supportk2@mail.test');
            out.nameEmptySave = await saveForm(page, '[name="contactName"]');
            await snap(page, 'f3b-s-contact-name-emptied', out.nameEmptySave);
            await readAll('r3b-name-emptied', ['out']);

            // Settings 4: the privacy statement
            await openSettings(page, app, SS.path, 'website', 'setup', null);
            out.setupSideTabs = await page.locator('[role="tabpanel"]:visible [role="tab"]').allInnerTexts().catch(() => []);
            await page.getByRole('tab', {name: 'Privacy Statement', exact: true}).filter({visible: true}).first().click().catch(() => {});
            await idle(page); await sleep(500);
            await snap(page, 'f4-s-privacy-tab');
            const privId = await page.evaluate(() => (window.tinymce ? window.tinymce.get().map((e) => e.id).find((i) => /privacyStatement/.test(i) && /-en$/.test(i)) : null)).catch(() => null);
            out.privEditor = privId;
            if (privId) {
                out.privBefore = flat1(await page.evaluate((i) => window.tinymce.get(i).getContent(), privId), 120);
                await mceSet(page, privId, '');
                out.privEmptySave = await saveForm(page, `[id="${privId}"]`);
                await readAll('r4-privacy-empty', ['out']);
                await openSettings(page, app, SS.path, 'website', 'setup', null);
                await page.getByRole('tab', {name: 'Privacy Statement', exact: true}).filter({visible: true}).first().click().catch(() => {});
                await idle(page); await sleep(500);
                await mceSet(page, privId, 'K2 privacy');
                out.privBackSave = await saveForm(page, `[id="${privId}"]`);
                await readAll('r4b-privacy-back', ['out']);
            }

            // Settings 5: registration
            await openSettings(page, app, SS.path, 'access', null, null);
            out.accessTabs = await page.locator('[role="tab"]').evaluateAll((els) => els.filter((e) => e.offsetParent).map((e) => e.innerText.trim()));
            const sao = page.getByRole('tab', {name: 'Site Access Options', exact: true}).first();
            if (await sao.count()) { await sao.click(); await idle(page); await sleep(500); }
            out.regRadios = await page.locator('input[name="disableUserReg"]').evaluateAll((els) => els.map((e) => ({value: e.value, checked: e.checked, label: (e.closest('label') || e.parentElement).innerText.trim()})));
            await snap(page, 'f5-s-site-access-options', {radios: out.regRadios});
            if (out.regRadios.length) {
                await page.locator('input[name="disableUserReg"][value="true"]').first().check({force: true});
                out.regOffSave = await saveForm(page, 'input[name="disableUserReg"]');
                await readAll('r5-registration-off', ['out']);
                await openSettings(page, app, SS.path, 'access', null, null);
                if (await sao.count()) { await sao.click(); await idle(page); await sleep(500); }
                await page.locator('input[name="disableUserReg"][value="false"]').first().check({force: true});
                out.regOnSave = await saveForm(page, 'input[name="disableUserReg"]');
            }

            // Settings 6: payments
            await openSettings(page, app, SS.path, 'distribution', null, null);
            const payTab = page.locator('[id="payments-button"]');
            out.payTab = await payTab.count();
            if (out.payTab) {
                await payTab.first().click(); await idle(page); await sleep(600);
                await snap(page, 'f6-s-payments-tab');
                out.payFields = await page.locator('[role="tabpanel"]:visible form').first().evaluate((fm) => [...fm.querySelectorAll('input[name], select[name], textarea[name]')].map((e) => ({name: e.name, type: e.type, value: e.value.slice(0, 30), checked: e.checked}))).catch(() => null);
                // (a) "Enable" alone
                const enable = page.locator('input[name="paymentsEnabled"]').first();
                await enable.check({force: true});
                await sleep(500);
                out.payEnableOnlySave = await saveForm(page, 'input[name="paymentsEnabled"]');
                await readAll('r6a-payments-enabled-only', ['out', 'mgr']);
                // (b) currency and the manual plugin
                await openSettings(page, app, SS.path, 'distribution', 'payments', null);
                await page.locator('select[name="currency"]').first().selectOption({label: 'US Dollar'}).catch((e) => { out.curErr = e.message.slice(0, 80); });
                await page.locator('select[name="paymentPluginName"]').first().selectOption({label: 'Manual Fee Payment'}).catch((e) => { out.plugErr = e.message.slice(0, 80); });
                await sleep(700);
                const instr = page.locator('textarea[name*="manualInstructions"], input[name*="manualInstructions"]').first();
                if (await instr.count()) await instr.fill('K2 manual payment instructions');
                out.paySetupSave = await saveForm(page, 'input[name="paymentsEnabled"]');
                await snap(page, 'f6b-s-payments-set-up', out.paySetupSave);
                await readAll('r6b-payments-set-up');
                if (isOjs) {
                    await openSettings(page, app, SS.path, 'distribution', 'access', null);
                    const radios = await page.locator('input[name="publishingMode"]').evaluateAll((els) => els.map((e) => (e.closest('label') || e.parentElement).innerText.trim()));
                    await page.locator('input[name="publishingMode"]').nth(radios.findIndex((r) => /subscription/i.test(r))).check({force: true});
                    out.subModeSave = await saveForm(page, 'input[name="publishingMode"]');
                    await readAll('r6c-subscription-mode');
                    // payments off again, the mode kept
                    await openSettings(page, app, SS.path, 'distribution', 'payments', null);
                    await page.locator('input[name="paymentsEnabled"]').first().uncheck({force: true});
                    out.payOffSave = await saveForm(page, 'input[name="paymentsEnabled"]');
                    await readAll('r6d-payments-off-subscription-mode');
                    await openSettings(page, app, SS.path, 'distribution', 'access', null);
                    await page.locator('input[name="publishingMode"]').nth(radios.findIndex((r) => /open access/i.test(r))).check({force: true});
                    out.openModeSave = await saveForm(page, 'input[name="publishingMode"]');
                } else {
                    await openSettings(page, app, SS.path, 'distribution', 'payments', null);
                    await page.locator('input[name="paymentsEnabled"]').first().uncheck({force: true});
                    out.payOffSave = await saveForm(page, 'input[name="paymentsEnabled"]');
                }
                // the type list offered
                await openNav(page, app, SS.path);
                await openItemWindow(page, 'add');
                out.typeOptions = (await itemState(page)).typeOptions;
                await closeItemWindow(page);
            }

            // Settings 7: public comments
            await openSettings(page, app, SS.path, 'website', null, null);
            const contentTab = page.getByRole('tab', {name: 'Content', exact: true}).first();
            out.contentTab = await contentTab.count();
            if (out.contentTab) {
                await contentTab.click(); await idle(page); await sleep(500);
                const commentsTab = page.getByRole('tab', {name: 'Comments', exact: true}).first();
                if (await commentsTab.count()) { await commentsTab.click(); await idle(page); await sleep(500); }
                const box = page.getByRole('checkbox', {name: 'Enable Public Comments'});
                out.commentsBox = await box.count();
                await snap(page, 'f7-s-comments-tab');
                if (out.commentsBox) {
                    await box.check();
                    const form = page.locator('form').filter({has: box});
                    await form.getByRole('button', {name: 'Save', exact: true}).click();
                    await page.waitForLoadState('load').catch(() => {});
                    await sleep(4000);
                    await idle(page);
                    await readAll('r7-comments-on', ['mgr']);
                }
            }

            // Settings 8: disable submissions
            await openSettings(page, app, SS.path, 'workflow', 'submission', null);
            out.subSideTabs = await page.locator('[role="tabpanel"]:visible [role="tab"]').allInnerTexts().catch(() => []);
            const dis = page.locator('[role="tabpanel"]:visible [role="tab"]').filter({hasText: /Disable|Accept/i}).first();
            if (await dis.count()) { await dis.click(); await idle(page); await sleep(400); }
            const ctl = page.locator('input[name="disableSubmissions"]').first();
            out.disableBox = await ctl.count() ? {label: await ctl.evaluate((e) => (e.closest('label') || e.parentElement).innerText.trim()), checked: await ctl.isChecked()} : null;
            await snap(page, 'f8-s-disable-submissions', {box: out.disableBox});
            if (out.disableBox) {
                await ctl.check({force: true});
                out.disableSave = await saveForm(page, 'input[name="disableSubmissions"]');
                await readAll('r8-submissions-disabled', ['mgr']);
                await openSettings(page, app, SS.path, 'workflow', 'submission', null);
                if (await dis.count()) { await dis.click(); await idle(page); await sleep(400); }
                await ctl.uncheck({force: true});
                out.enableSave = await saveForm(page, 'input[name="disableSubmissions"]');
            }

            // Settings 9: DOIs (as found; off; on with no kind; on with one kind)
            await openSettings(page, app, SS.path, 'distribution', 'dois', null);
            await snap(page, 'f9-s-dois-tab');
            out.doiBoxes = await visibleBoxes(page);
            out.doiPrefix = await page.locator('input[name="doiPrefix"]').first().inputValue().catch(() => null);
            const enableDois = () => page.locator('input[name="enableDois"]').first();
            const doiSave = () => saveForm(page, 'input[name="enableDois"]');
            if (await enableDois().count()) {
                out.doiWasOn = await enableDois().isChecked();
                await enableDois().uncheck({force: true});
                out.doiOffSave = await doiSave();
                await readAll('r9a-dois-off', ['mgr']);
                await openSettings(page, app, SS.path, 'distribution', 'dois', null);
                await enableDois().check({force: true});
                await sleep(600);
                await page.locator('input[name="enabledDoiTypes"]').evaluateAll((els) => els.forEach((e) => { if (e.checked) e.click(); }));
                await page.locator('input[name="doiPrefix"]').first().fill('10.1234').catch(() => {});
                out.doiNoKinds = await visibleBoxes(page);
                out.doiNoKindsSave = await doiSave();
                await snap(page, 'f9b-s-dois-no-kinds', out.doiNoKindsSave);
                await readAll('r9b-dois-on-no-kinds', ['mgr']);
                await openSettings(page, app, SS.path, 'distribution', 'dois', null);
                out.doiAfterNoKinds = await visibleBoxes(page);
                if (!(await enableDois().isChecked())) { await enableDois().check({force: true}); await sleep(600); }
                await page.locator('input[name="enabledDoiTypes"]').first().check({force: true}).catch(() => {});
                await page.locator('input[name="doiPrefix"]').first().fill('10.1234').catch(() => {});
                out.doiOneKindSave = await doiSave();
                await readAll('r9c-dois-on-one-kind', ['mgr']);
            }
            // the seeded journal's Access and DOIs tabs, read only
            await as(page, 'manager.maya', 'publicknowledge');
            await openSettings(page, app, 'publicknowledge', 'distribution', null, null);
            out.pkDistTabs = await page.locator('[role="tab"]').evaluateAll((els) => els.filter((e) => e.offsetParent).map((e) => e.innerText.trim()));
            if (await page.locator('[id="access-button"]').count()) { await page.locator('[id="access-button"]').first().click(); await idle(page); await sleep(500); }
            out.pkAccess = await visibleBoxes(page);
            await snap(page, 'f9c-pk-access-tab');
            await openSettings(page, app, 'publicknowledge', 'distribution', 'dois', null);
            out.pkDois = await visibleBoxes(page);
            out.pkDoiPrefix = await page.locator('input[name="doiPrefix"]').first().inputValue().catch(() => null);
            await snap(page, 'f9d-pk-dois-tab');
            out.pkNav = (await sideMenu(page, app, 'publicknowledge')).groupLabels.map((g) => g.replace(/^Editor Dashboard › .*/, 'Editor Dashboard › …'));
            await signOut(page).catch(() => {});
            await as(page, U.mgr, SS.path);

            // Settings 15: the "Developed By" block
            await openSettings(page, app, SS.path, 'website', 'plugins', null);
            await page.locator('#pluginGridContainer tr.gridRow').first().waitFor({timeout: T}).catch(() => {});
            const row = page.locator('#pluginGridContainer tr.gridRow').filter({hasText: 'Developed By'}).first();
            out.devRow = (await row.count()) ? flat1(await row.innerText(), 200) : null;
            const cb = row.getByRole('checkbox').first();
            out.devWasOn = await cb.isChecked().catch(() => null);
            await snap(page, 'fa-s-plugins-developed-by');
            const w = page.waitForResponse((r) => /settings-plugin-grid\/(enable|disable)/.test(r.url()), {timeout: T}).catch(() => null);
            await cb.click({noWaitAfter: true}).catch(() => {});
            const r = await w; await idle(page); await sleep(800);
            out.devEnable = r ? r.status() : null;
            await signOut(page).catch(() => {});
            await page.goto(ctxUrl(app, SS.path, '')); await idle(page);
            out.devEnabledNotPlaced = await page.locator('.pkp_structure_sidebar').innerText().catch(() => null);
            await as(page, U.mgr, SS.path);
            await openSettings(page, app, SS.path, 'website', 'appearance', null);
            await page.locator('#appearance').getByRole('tab', {name: 'Setup', exact: true}).click().catch(() => {}); await idle(page); await sleep(600);
            out.sidebarList = await page.locator('input[name="sidebar"]').evaluateAll((els) => els.map((e) => ({value: e.value, checked: e.checked, label: (e.closest('label') || e.parentElement).innerText.trim()})));
            await snap(page, 'fb-s-appearance-setup', {sidebar: out.sidebarList});
            const sbox = page.locator('input[name="sidebar"][value="developedbyblockplugin"]');
            if (await sbox.count()) { await sbox.check(); out.sidebarSave = await saveForm(page, 'input[name="sidebar"]'); }
            // Settings 17: the page footer (same form? its own box)
            const footerBox = page.locator('textarea[id*="pageFooter"]').first();
            const footerId = await page.evaluate(() => (window.tinymce ? window.tinymce.get().map((e) => e.id).find((i) => /pageFooter/.test(i) && /-en$/.test(i)) : null)).catch(() => null);
            out.footerEditor = footerId;
            if (footerId) {
                await mceSet(page, footerId, 'K2 footer text');
                out.footerSave = await saveForm(page, `[id="${footerId}"]`);
            } else if (await footerBox.count()) {
                await footerBox.fill('K2 footer text');
                out.footerSave = await saveForm(page, 'textarea[id*="pageFooter"]');
            }
            // the header logo
            const logoInput = page.locator('input[type=file][id*="pageHeaderLogoImage"]').first();
            out.logoInput = await logoInput.count();
            if (out.logoInput) {
                await logoInput.setInputFiles(require('path').join(__dirname, '../../../../../apps/ojs/playwright/fixtures/files/profile-image-400.png'));
                await sleep(2500); await idle(page);
                const alt = page.locator('input[id*="pageHeaderLogoImage"][id*="altText"], input[name*="altText"]').first();
                if (await alt.count()) await alt.fill('K2 logo').catch(() => {});
                const fid = footerId ? `[id="${footerId}"]` : 'textarea[id*="pageFooter"]';
                out.logoSave = await saveForm(page, fid);
            }
            await snap(page, 'fc-s-appearance-saved', {footer: out.footerSave, logo: out.logoSave});
            await signOut(page).catch(() => {});
            await page.goto(ctxUrl(app, SS.path, '')); await idle(page);
            out.publicAfter = {
                sidebar: flat1(await page.locator('.pkp_structure_sidebar').innerText().catch(() => null), 300),
                devLink: await page.locator('.pkp_structure_sidebar a').evaluateAll((as) => as.map((a) => ({text: a.innerText.trim(), href: a.getAttribute('href')}))).catch(() => null),
                footer: flat1(await page.locator('.pkp_footer_content').innerText().catch(() => null), 200),
                logo: await page.locator('.pkp_site_name a').evaluate((a) => ({cls: a.className, img: a.querySelector('img') ? {src: a.querySelector('img').getAttribute('src'), alt: a.querySelector('img').alt, naturalWidth: a.querySelector('img').naturalWidth, complete: a.querySelector('img').complete} : null, text: a.innerText.trim()})).catch(() => null),
            };
            await snap(page, 'fd-s-public-home-after');
            await as(page, U.mgr, SS.path);

            // Settings 16: the "Lists" tab
            await openSettings(page, app, SS.path, 'website', 'setup', null);
            const lists = page.getByRole('tab', {name: 'Lists', exact: true}).filter({visible: true}).first();
            out.listsTab = await lists.count();
            if (out.listsTab) {
                await lists.click(); await idle(page); await sleep(500);
                out.lists = {itemsPerPage: await page.locator('input[name="itemsPerPage"]').first().inputValue().catch(() => null), numPageLinks: await page.locator('input[name="numPageLinks"]').first().inputValue().catch(() => null), text: flat1(await page.locator('form').filter({has: page.locator('input[name="itemsPerPage"]')}).first().innerText().catch(() => ''), 500)};
                await snap(page, 'fe-s-lists-tab', out.lists);
                await page.locator('input[name="itemsPerPage"]').first().fill('10');
                out.listsSave = await saveForm(page, 'input[name="itemsPerPage"]');
            }

            // Settings 18: the theme list; the menu window's areas
            await openSettings(page, app, SS.path, 'website', 'appearance', null);
            await page.locator('#appearance').getByRole('tab', {name: 'Theme', exact: true}).click().catch(() => {}); await idle(page); await sleep(600);
            out.themes = await page.locator('select[name="themePluginPath"], [role="tabpanel"]:visible select').first().evaluate((s) => ({name: s.name, value: s.value, options: [...s.options].map((o) => o.text)})).catch(() => null);
            out.themeRadios = await page.locator('input[name="themePluginPath"]').evaluateAll((els) => els.map((e) => (e.closest('label') || e.parentElement).innerText.trim())).catch(() => null);
            await snap(page, 'ff-s-appearance-theme', {themes: out.themes, radios: out.themeRadios});
            await openNav(page, app, SS.path);
            await openMenu(page, 'Primary Navigation Menu');
            out.areas = await menuWindow(page).locator('select[name="areaName"]').evaluate((s) => [...s.options].map((o) => o.text)).catch(() => null);
            await pressWindowButton(page, 'Cancel');
            out.browserDialogs = bd;
            record('f9-flips-summary', out);
            log(app.name, 'flips setup', JSON.stringify({addSubs: out.addSubs && out.addSubs.notice, addMySubs: out.addMySubs && out.addMySubs.notice, subsArranged: out.subsArranged, subsSave: out.subsSave}));
            log(app.name, 'flips s2', JSON.stringify({distTabs: out.distTabs, radios: out.accessRadios, none: out.modeNoneSave, back: out.modeBackSave}));
            log(app.name, 'flips s3', JSON.stringify({fields: out.contactFields, addrEditor: out.addrEditor, addrEmpty: out.addrEmptySave, nameEmpty: out.nameEmptySave}));
            log(app.name, 'flips s4', JSON.stringify({sideTabs: out.setupSideTabs, editor: out.privEditor, before: out.privBefore, empty: out.privEmptySave, back: out.privBackSave}));
            log(app.name, 'flips s5', JSON.stringify({tabs: out.accessTabs, radios: out.regRadios, off: out.regOffSave, on: out.regOnSave}));
            log(app.name, 'flips s6', JSON.stringify({payTab: out.payTab, fields: out.payFields, enableOnly: out.payEnableOnlySave, curErr: out.curErr, plugErr: out.plugErr, setup: out.paySetupSave, subMode: out.subModeSave, off: out.payOffSave, types: out.typeOptions}));
            log(app.name, 'flips s7', JSON.stringify({contentTab: out.contentTab, box: out.commentsBox}));
            log(app.name, 'flips s8', JSON.stringify({sideTabs: out.subSideTabs, box: out.disableBox, save: out.disableSave, back: out.enableSave}));
            log(app.name, 'flips s9', JSON.stringify({boxes: out.doiBoxes, prefix: out.doiPrefix, wasOn: out.doiWasOn, off: out.doiOffSave, noKinds: out.doiNoKinds, noKindsSave: out.doiNoKindsSave, afterNoKinds: out.doiAfterNoKinds, oneKind: out.doiOneKindSave}));
            log(app.name, 'flips pk', JSON.stringify({distTabs: out.pkDistTabs, access: out.pkAccess, dois: out.pkDois, prefix: out.pkDoiPrefix, nav: out.pkNav}));
            log(app.name, 'flips s15', JSON.stringify({row: out.devRow, wasOn: out.devWasOn, enable: out.devEnable, enabledNotPlaced: out.devEnabledNotPlaced, sidebar: out.sidebarList, sidebarSave: out.sidebarSave}));
            log(app.name, 'flips s17', JSON.stringify({footerEditor: out.footerEditor, footerSave: out.footerSave, logoInput: out.logoInput, logoSave: out.logoSave, publicAfter: out.publicAfter}));
            log(app.name, 'flips s16 s18', JSON.stringify({lists: out.lists, listsSave: out.listsSave, themes: out.themes, themeRadios: out.themeRadios, areas: out.areas, bd}));
        } finally { await close(); }
    }

    // ---- posting: Settings 2 re-driven alone (the saved choice read back after a reload) ----
    if (on('posting') && !isOmp) {
        const {page, close} = await launch(app);
        try {
            const out = {};
            const U = SS.users;
            const radios = () => page.locator('input[name="publishingMode"]').evaluateAll((els) => els.map((e) => ({value: e.value, checked: e.checked, label: (e.closest('label') || e.parentElement).innerText.trim()})));
            await as(page, U.mgr, SS.path);
            await openSettings(page, app, SS.path, 'distribution', 'access', null);
            out.before = await radios();
            await page.locator('input[name="publishingMode"][value="2"]').check({force: true});
            out.traffic = [];
            const onResp = async (r) => {
                if (!/\/api\/v1\/contexts\//.test(r.url())) return;
                let body = null;
                try { body = await r.json(); } catch { body = null; }
                out.traffic.push({method: r.request().method(), override: r.request().headers()['x-http-method-override'] || null, status: r.status(), sent: (() => { try { const d = JSON.parse(r.request().postData() || '{}'); return {publishingMode: d.publishingMode}; } catch { return (r.request().postData() || '').slice(0, 200); } })(), returnedPublishingMode: body && typeof body === 'object' ? (Object.prototype.hasOwnProperty.call(body, 'publishingMode') ? body.publishingMode : '<absent>') : null});
            };
            page.on('response', onResp);
            out.save = await saveForm(page, 'input[name="publishingMode"]');
            await sleep(1000);
            page.off('response', onResp);
            await openSettings(page, app, SS.path, 'distribution', 'access', null);
            out.reloaded = await radios();
            await snap(page, 'g0-s-access-none-reloaded', {radios: out.reloaded});
            const h = await header(page, app, SS.path);
            out.headerIn = hflat(h);
            out.archiveHref = (h.primary || []).filter((n) => /Archives|Current/.test(n.title)).map((n) => n.href);
            await snap(page, 'g1-s-header-in-mode-none');
            if (out.archiveHref.length) {
                await page.goto(out.archiveHref[0]); await idle(page);
                out.archivePage = {url: page.url(), title: await page.title(), h1: await page.locator('h1').allInnerTexts().catch(() => [])};
                await snap(page, 'g2-s-archives-page-mode-none', out.archivePage);
            }
            await signOut(page).catch(() => {});
            out.headerOut = hflat(await header(page, app, SS.path));
            await as(page, U.mgr, SS.path);
            await openSettings(page, app, SS.path, 'distribution', 'access', null);
            await page.locator('input[name="publishingMode"][value="0"]').check({force: true});
            out.back = await saveForm(page, 'input[name="publishingMode"]');
            record('g9-posting-summary', out);
            log(app.name, 'posting', JSON.stringify(out));
        } finally { await close(); }
    }

    // ---- inst: Settings 10 with the journal's own Statistics box (the site's box put back at once) ----
    if (on('inst')) {
        const {page, close} = await launch(app);
        try {
            const out = {};
            const siteBox = async (want) => {
                await signIn(page, 'admin');
                await page.goto(app.url('/index.php/index/admin/settings'));
                await idle(page);
                await page.getByRole('tab', {name: 'Statistics', exact: true}).first().click(); await idle(page); await sleep(500);
                const b = page.locator('input[name="enableInstitutionUsageStats"]').first();
                if ((await b.isChecked()) !== want) { if (want) await b.check(); else await b.uncheck(); }
                const r = await saveForm(page, b);
                await signOut(page);
                return r;
            };
            const ctxStats = async (who, ctx, tick) => {
                await as(page, who, ctx);
                await openSettings(page, app, ctx, 'distribution', null, null);
                const st = page.locator('[id="statistics-button"]');
                if (await st.count()) { await st.first().click(); await idle(page); await sleep(500); }
                const boxes = await visibleBoxes(page);
                let save = null;
                const b = page.locator('[role="tabpanel"]:visible input[name="enableInstitutionUsageStats"]').first();
                if (tick !== undefined && await b.count()) {
                    if (tick) await b.check({force: true}); else await b.uncheck({force: true});
                    save = await saveForm(page, 'input[name="enableInstitutionUsageStats"]');
                }
                const nav = (await sideMenu(page, app, ctx)).groupLabels.filter((g) => !/^Editor Dashboard/.test(g));
                return {boxes: boxes.filter((x) => /nstitution/.test(x.name + x.label)), save, nav};
            };
            out.siteOn = await siteBox(true);
            out.sFirst = await ctxStats(SS.users.mgr, SS.path);
            await snap(page, 'y0-s-side-menu-site-inst-on');
            out.pk = await ctxStats('manager.maya', 'publicknowledge');
            await snap(page, 'y1-pk-side-menu-site-inst-on');
            out.sTicked = await ctxStats(SS.users.mgr, SS.path, true);
            await snap(page, 'y2-s-side-menu-context-inst-ticked');
            out.sUnticked = await ctxStats(SS.users.mgr, SS.path, false);
            await signOut(page).catch(() => {});
            out.siteOff = await siteBox(false);
            out.sAfter = await ctxStats(SS.users.mgr, SS.path);
            record('y9-inst-summary', out);
            log(app.name, 'inst', JSON.stringify(out));
        } finally { await close(); }
    }

    // ---- pktypes: the type list on the seeded context (read, never saved); OMP's Series / Category ----
    if (on('pktypes')) {
        const {page, close} = await launch(app);
        watchDialogs(page);
        try {
            const out = {};
            await as(page, 'manager.maya', 'publicknowledge');
            await openNav(page, app, 'publicknowledge', 'en');
            await openItemWindow(page, 'add');
            out.types = (await itemState(page)).typeOptions;
            for (const t of ['Series', 'Category']) {
                if (!out.types.includes(t)) continue;
                await setType(page, t);
                const st = await itemState(page);
                out[t] = {typeLine: st.typeLine, labels: st.labels.slice(0, 8), options: await itemWindow(page).locator('select:not([name="menuItemType"])').first().evaluate((x) => [...x.options].map((o) => o.text)).catch(() => null)};
            }
            await snap(page, 'k0-pk-add-item-types', out);
            await closeItemWindow(page);
            record('k9-pktypes-summary', out);
            log(app.name, 'pktypes', JSON.stringify(out));
        } finally { await close(); }
    }

    // ---- notice: where the save notice sits (side effects) ----
    if (on('notice')) {
        const {page, close} = await launch(app);
        try {
            const out = {};
            const rect = async (re) => {
                const end = Date.now() + 6000;
                while (Date.now() < end) {
                    const r = await page.evaluate((src) => {
                        const rx = new RegExp(src);
                        for (const c of document.querySelectorAll('[role="alert"], [role="status"], .pkp_notification, [class*="otification"]')) {
                            const t = (c.innerText || '').trim();
                            if (rx.test(t) && c.getBoundingClientRect().width) { const b = c.getBoundingClientRect(); return {text: t.split('\n')[0], x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height), vw: innerWidth}; }
                        }
                        return null;
                    }, re.source);
                    if (r) return r;
                    await sleep(150);
                }
                return null;
            };
            await as(page, B.users.mgr, B.path);
            await openNav(page, app, B.path);
            await openItemWindow(page, 'add');
            await fillTitle(page, 'K2 notice');
            await setType(page, 'Search');
            const p1 = rect(/successfully added/);
            await itemWindow(page).getByRole('button', {name: 'Save', exact: true}).click();
            out.added = await p1;
            await shot(page, 'n0-b-notice-added');
            await openNav(page, app, B.path);
            await rowAction(page, 'items', 'K2 notice', 'Remove');
            await sleep(500);
            const p2 = rect(/successfully removed/);
            await page.locator('[role="dialog"]:visible, [data-cy="dialog"]:visible').filter({hasText: /Are you sure/}).last().getByRole('button', {name: 'OK', exact: true}).click();
            out.removed = await p2;
            await shot(page, 'n1-b-notice-removed');
            record('n9-notice-summary', out);
            log(app.name, 'notice', JSON.stringify(out));
        } finally { await close(); }
    }

    // ---- closeask: the item window's "Close", the browser's own question answered both ways ----
    if (on('closeask')) {
        const {page, close} = await launch(app);
        try {
            const out = [];
            let answer = 'accept';
            const seen = [];
            page.on('dialog', async (d) => { seen.push({type: d.type(), message: d.message(), answer}); if (answer === 'accept') await d.accept(); else await d.dismiss(); });
            await as(page, B.users.mgr, B.path);
            for (const [how, change, ans] of [['edit', false, 'dismiss'], ['edit', true, 'dismiss'], ['add', false, 'dismiss'], ['edit', true, 'accept']]) {
                await openNav(page, app, B.path);
                await openItemWindow(page, how, 'Search');
                if (change) await fillTitle(page, 'Search K2 changed');
                answer = ans;
                const n0 = seen.length;
                await itemWindow(page).getByRole('button', {name: 'Close', exact: true}).click();
                await sleep(1000);
                const r = {how, change, answer: ans, dialogs: seen.slice(n0), windowOpenAfter: await itemWindow(page).isVisible().catch(() => false)};
                out.push(r);
                if (r.windowOpenAfter) { answer = 'accept'; await itemWindow(page).getByRole('button', {name: 'Close', exact: true}).click(); await sleep(800); }
            }
            await openNav(page, app, B.path);
            const g = await grids(page);
            record('h9-closeask-summary', {out, searchTitle: g.items.rows.filter((t) => /^Search/.test(t))});
            log(app.name, 'closeask', JSON.stringify({out, searchTitle: g.items.rows.filter((t) => /^Search/.test(t))}));
        } finally { await close(); }
    }

    // ---- permit: Settings 11 ----
    if (on('permit')) {
        const {page, close} = await launch(app);
        try {
            const out = {forms: {}};
            const U = P.users;
            const openRoles = async () => {
                await page.goto(ctxUrl(app, P.path, '/management/settings/access'));
                await idle(page);
                await page.getByRole('tab', {name: 'Roles'}).click();
                await idle(page); await sleep(500);
            };
            const roleForm = async (rn) => {
                await openRoles();
                const row = page.getByRole('row', {name: new RegExp(`^Settings ${rn}\\b`, 'i')}).first();
                await row.getByRole('link', {name: 'Settings'}).click();
                await sleep(300);
                await page.locator(`[id="${await row.getAttribute('id')}-control-row"]`).getByRole('link', {name: 'Edit', exact: true}).click();
                await idle(page);
                const form = page.locator('#userGroupForm');
                await form.waitFor({timeout: T});
                await sleep(500);
                return form;
            };
            await as(page, U.mgr, P.path);
            await openRoles();
            out.grid = await page.locator('tr.gridRow').evaluateAll((els) => els.map((e) => e.innerText.replace(/\s+/g, ' ').trim()));
            await snap(page, 'p0-p-roles-grid');
            const roles = isOps ? ['Preprint Server manager'] : isOmp ? ['Press manager', 'Press editor', 'Production editor'] : ['Journal manager', 'Journal editor', 'Production editor'];
            for (const rn of roles) {
                try {
                    const form = await roleForm(rn);
                    const box = form.getByRole('checkbox', {name: 'Permit changes to Settings'});
                    out.forms[rn] = {present: await box.count(), checked: await box.isChecked().catch(() => null), disabled: await box.isDisabled().catch(() => null)};
                    await snap(page, `p1-p-role-form-${rn.replace(/\W+/g, '')}`, out.forms[rn]);
                    const target = isOps ? 'Preprint Server manager' : isOmp ? 'Press editor' : 'Journal editor';
                    if (rn === target && out.forms[rn].present && out.forms[rn].checked) {
                        await box.uncheck();
                        const resp = page.waitForResponse((r) => r.url().includes('update-user-group'), {timeout: 15_000}).catch(() => null);
                        await form.getByRole('button', {name: 'OK'}).click();
                        const rr = await resp;
                        out.forms[rn].uncheckSave = rr ? rr.status() : null;
                        await idle(page); await sleep(800);
                    } else {
                        await page.locator('[role="dialog"]:visible').last().getByRole('button', {name: /Close|Cancel/}).first().click().catch(() => page.keyboard.press('Escape'));
                        await sleep(400);
                    }
                } catch (e) { out.forms[rn] = {error: String(e.message).split('\n')[0]}; }
            }
            await signOut(page).catch(() => {});
            // the unticked role's user, and a still-ticked one
            const who = isOps ? ['mgr2'] : ['ed', 'pe'];
            for (const u of who) {
                const r = {};
                await as(page, U[u], P.path);
                r.nav = (await sideMenu(page, app, P.path)).groupLabels.map((g) => g.replace(/^Editor Dashboard › .*/, 'Editor Dashboard › …'));
                await snap(page, `p2-p-${u}-side-menu`);
                await page.goto(ctxUrl(app, P.path, '/management/settings/website#setup/navigationMenus'));
                await idle(page); await sleep(800);
                r.navTab = {...(await classify(page)), grids: await page.locator('table[id^="component-grid-navigationmenus-navigationmenuitemsgrid-"]').count()};
                await snap(page, `p3-p-${u}-navigation-tab`, r.navTab);
                await page.goto(ctxUrl(app, P.path, '/about'));
                await idle(page);
                r.editLinks = await page.locator('a.cmp_edit_link').evaluateAll((as) => as.map((a) => ({text: a.innerText.trim(), href: a.getAttribute('href')})));
                await snap(page, `p4-p-${u}-about-page`, {editLinks: r.editLinks});
                if (r.editLinks.length) {
                    await page.locator('a.cmp_edit_link').first().click();
                    await idle(page); await sleep(800);
                    r.editLanded = await classify(page);
                    await snap(page, `p5-p-${u}-edit-landed`, r.editLanded);
                }
                out[u] = r;
                await signOut(page).catch(() => {});
            }
            record('p9-permit-summary', out);
            log(app.name, 'permit grid', JSON.stringify(out.grid));
            log(app.name, 'permit forms', JSON.stringify(out.forms));
            for (const u of who) log(app.name, 'permit', u, JSON.stringify(out[u]));
        } finally { await close(); }
    }

    // ---- depth: Settings 14 at its default ----
    if (on('depth')) {
        const {page, close} = await launch(app);
        try {
            const out = {};
            await as(page, B.users.mgr, B.path);
            await openNav(page, app, B.path);
            await openMenu(page, 'Primary Navigation Menu');
            out.before = brief(await panels(page));
            const child = (await panels(page)).assigned.items.find((i) => i.level === 1).title;
            out.child = child;
            await drag(page, 'unassigned', 'Search', panelItem(page, 'assigned', child), 'center');
            out.afterDrop = brief(await panels(page));
            await snap(page, 'x0-b-depth-third-level', {p: out.afterDrop});
            await pressWindowButton(page, 'Cancel');
            const yes = page.locator('[role="dialog"]:visible').filter({hasText: 'The data on this form has changed'}).getByRole('button', {name: 'Yes', exact: true});
            if (await yes.count()) await yes.click();
            record('x9-depth-summary', out);
            log(app.name, 'depth', JSON.stringify(out));
        } finally { await close(); }
    }

    // ---- site: Settings 10 and the site's header after a site item change ----
    if (on('site')) {
        const {page, close} = await launch(app);
        try {
            const out = {};
            // Settings 10: the institutional statistics switch, ticked and put back
            await signIn(page, 'admin');
            await page.goto(app.url('/index.php/index/admin/settings'));
            await idle(page);
            const stat = page.getByRole('tab', {name: 'Statistics', exact: true}).first();
            if (await stat.count()) { await stat.click(); await idle(page); await sleep(500); }
            out.siteStatBoxes = await visibleBoxes(page);
            await snap(page, 'z0-site-statistics');
            const inst = page.getByRole('checkbox', {name: 'Enable institutional statistics'}).or(page.locator('input[name="isSiteInstitutionStatsEnabled"]')).first();
            out.instFound = await inst.count();
            if (out.instFound && !(await inst.isChecked())) {
                await inst.check();
                out.instOnSave = await saveForm(page, inst);
                await signOut(page);
                await as(page, SS.users.mgr, SS.path);
                out.navInstOn = (await sideMenu(page, app, SS.path)).groupLabels.filter((g) => !/^Editor Dashboard/.test(g));
                await snap(page, 'z1-s-side-menu-institutions-on');
                await signOut(page);
                await signIn(page, 'admin');
                await page.goto(app.url('/index.php/index/admin/settings'));
                await idle(page);
                if (await stat.count()) { await stat.click(); await idle(page); await sleep(500); }
                await inst.uncheck();
                out.instOffSave = await saveForm(page, inst);
                out.siteStatBoxesAfter = await visibleBoxes(page);
                await signOut(page);
                await as(page, SS.users.mgr, SS.path);
                out.navInstOff = (await sideMenu(page, app, SS.path)).groupLabels.filter((g) => !/^Editor Dashboard/.test(g));
                await signOut(page);
            }
            log(app.name, 'site s10', JSON.stringify({boxes: out.siteStatBoxes, found: out.instFound, on: out.instOnSave, navOn: out.navInstOn, off: out.instOffSave, after: out.siteStatBoxesAfter, navOff: out.navInstOff}));
            // the site's header after a site item's title changes (the site's menu window does not open, K1-4,
            // so an item cannot be placed: an installed item of the user menu is renamed and named back)
            out.siteOut0 = hflat(await header(page, app, 'index'));
            await signIn(page, 'admin');
            await openNav(page, app, 'index');
            out.siteGrids0 = await grids(page);
            if (out.siteGrids0.items.rows.includes('K2 site link')) out.cleanup = await removeRow(page, 'items', 'K2 site link', 'OK');
            await openNav(page, app, 'index');
            await openItemWindow(page, 'edit', 'Login');
            out.loginOpened = titleBoxes(await itemState(page));
            await fillTitle(page, 'Login K2');
            out.renameSave = await itemSave(page);
            out.siteIn1 = hflat(await header(page, app, 'index'));
            await signOut(page);
            out.siteOut1 = hflat(await header(page, app, 'index'));
            await snap(page, 'z3-site-header-out-renamed');
            await signIn(page, 'admin');
            await openNav(page, app, 'index');
            await openItemWindow(page, 'edit', 'Login K2');
            await fillTitle(page, 'Login');
            out.restoreSave = await itemSave(page);
            await openNav(page, app, 'index');
            out.siteGrids2 = await grids(page);
            await signOut(page);
            out.siteOut2 = hflat(await header(page, app, 'index'));
            record('z9-site-summary', out);
            log(app.name, 'site header', JSON.stringify({out0: out.siteOut0, items0: out.siteGrids0.items.rows, cleanup: out.cleanup && out.cleanup.notice, opened: out.loginOpened, rename: out.renameSave.notice, in1: out.siteIn1, out1: out.siteOut1, restore: out.restoreSave.notice, items2: out.siteGrids2.items.rows, out2: out.siteOut2}));
        } finally { await close(); }
    }
};
