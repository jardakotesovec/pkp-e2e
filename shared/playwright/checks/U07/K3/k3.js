// U07 claim check, chunk K3: the public About pages (except the masthead and
// history lists themselves) and the Settings tabs behind them, on all three apps.
// Spec: docs/specs/U07-journal-identity-and-about-pages.md — Fields ("Information"
// and "Privacy Statement" tabs, 102–124), Rules 12–13 (226–240), 17–22 (297–358),
// Side effects "Privacy Statement emptied" (370–374), Settings bullets 4–11
// (401–435), register OMP2 and OPS1; footnotes c, d, i, j, l, p, q, r, u, v, w, x,
// td3, td10, td15–td18, f-omp2, f-ops1.
//
// Seeds per app (tag prefix u07k3):
//   A  the main scratch context: one account per permission level (manager, editor
//      [OJS/OMP], section editor, assistant, author, reader, reviewer [OJS/OMP]),
//      a past member in two masthead roles, the Information block placed [OJS/OMP],
//      a submission in review with the reviewer invited [OJS/OMP]
//   E  [OJS/OMP] an Editor whose role lost "Permit changes to Settings"
//   R  a fresh context (defaults), later closed to visitors on screen
//   N  a context the Site Administrator un-enables on Hosted Journals
//   I  [OJS/OMP] a fresh context where the manager places the Information block
//      on screen and then disables the plugin
//   L  a context with English and French form locales (the per-language boxes)
// Phases (PHASES=a,b to narrow; the seed is kept in k3-state-<app>.json, RESEED=1):
//   public   publicknowledge and the site's own pages signed out; the footer logo
//   fresh    R's defaults: header menu, the tabs' default texts, Sidebar list,
//            Plugins grid, Site Access Options, Settings › Journal notice
//   lang     L's Information / Privacy Statement tabs per language
//   about    A: "About the Journal" filled on the Masthead tab (td10)
//   contact  A: the Contact tab filled in two steps (td15)
//   edit     the "Edit" link on every About page for every level (td3)
//   info     A: the Information block and pages; texts emptied (td17)
//   privacy  A: before/after emptying (menu, page, Register, wizard, reviewer);
//            the site-level statement set and restored (td16, bullet 10)
//   masthead A: Appearance › "Editorial Masthead" reordered (bullet 4)
//   iblock   I: the block placed on screen, then the plugin disabled (bullets 5–6)
//   closed   R: "Users must be registered…" ticked; N: un-enabled (Rule 22)
//   formlang R: French ticked under "Forms" on the Languages grid, the French privacy default
//   leave    a Website tab left with an unsaved change
// Run: PROBE_FEATURE=U07 PROBE_AGENT=ccK3 node bin/probe.js all shared/playwright/checks/U07/K3/k3.js
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, signOut, screen, shot, record, loc, note, idle, tag, outDir} =
    require('../../../probe');

const ALL = ['public', 'fresh', 'lang', 'about', 'contact', 'edit', 'info', 'privacy', 'masthead', 'iblock', 'closed', 'formlang', 'leave'];
const PHASES = process.env.PHASES ? process.env.PHASES.split(',') : ALL;
const on = (p) => PHASES.includes(p);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const T = 20_000;
const flat = (s, n = 4000) => (s || '').replace(/\s+/g, ' ').trim().slice(0, n);
const stateFile = (app) => path.join(outDir(), `k3-state-${app.name}.json`);

// ---------------------------------------------------------------------------
// Reading helpers

const cUrl = (app, ctx, p = '') => app.url(`/index.php/${ctx}${p}`);

/** A public page as data: status, heading, breadcrumb, edit link, sidebar, menu. */
async function pub(page, url, name, {shotIt = false} = {}) {
    let resp = null;
    try { resp = await page.goto(url); } catch (e) { return {error: String(e.message || e)}; }
    await idle(page).catch(() => {});
    const s = await screen(page);
    const data = await page.evaluate(() => {
        const txt = (e) => (e ? e.innerText.replace(/\s+/g, ' ').trim() : null);
        const main = document.querySelector('.pkp_structure_main') || document.body;
        const edit = [...main.querySelectorAll('a.cmp_edit_link')].map((a) => ({
            visible: txt(a), sr: txt(a.querySelector('.pkp_screen_reader')), href: a.getAttribute('href'), target: a.getAttribute('target'),
            afterHeading: !!(a.previousElementSibling && /^H[1-3]$/.test(a.previousElementSibling.tagName)) || !!a.closest('.page')?.querySelector('h1 ~ a.cmp_edit_link'),
        }));
        return {
            h1: [...document.querySelectorAll('h1')].map(txt),
            crumbs: txt(document.querySelector('.cmp_breadcrumbs')),
            edit,
            nav: [...document.querySelectorAll('#navigationPrimary a')].map((a) => ({t: txt(a), h: a.getAttribute('href')})),
            sidebar: [...document.querySelectorAll('.pkp_structure_sidebar .pkp_block')].map((b) => ({cls: b.className, heading: txt(b.querySelector('h2,h3,.title')), links: [...b.querySelectorAll('a')].map((a) => [txt(a), a.getAttribute('href')])})),
            mainText: txt(main),
            pageHtml: (main.querySelector('.page') || main).innerHTML.replace(/\s+/g, ' ').slice(0, 5000),
            loginForm: !!document.querySelector('form#login, form.cmp_form.login, input[name="username"]'),
        };
    }).catch((e) => ({error: String(e.message || e)}));
    const out = {status: resp ? resp.status() : null, url: page.url(), title: await page.title().catch(() => null), ...data};
    record(name, {...s, extracted: out});
    if (shotIt) await shot(page, name).catch(() => {});
    return out;
}

async function snap(page, name, extra = {}) {
    const s = await screen(page);
    record(name, {...s, ...extra});
    await shot(page, name).catch(() => {});
    return s;
}

async function waitMce(page, id) {
    await page.waitForFunction((i) => !!(window.tinymce && window.tinymce.get(i) && window.tinymce.get(i).initialized), id, {timeout: T});
}
async function mceGet(page, id) {
    return page.evaluate((i) => (window.tinymce && window.tinymce.get(i) ? window.tinymce.get(i).getContent() : null), id).catch(() => null);
}
/** Types into a rich-text box the way a user does: select all, delete, type. */
async function mceSet(page, id, text) {
    await waitMce(page, id);
    const body = page.frameLocator(`#${id}_ifr`).locator('body');
    await body.click();
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Delete');
    if (text) await page.keyboard.type(text);
    await sleep(300);
    return mceGet(page, id);
}

/** Press a Vue form's Save; the form is the one holding `inner`. */
async function saveForm(page, inner) {
    const form = page.locator('form').filter({has: page.locator(inner)}).first();
    const w = page.waitForResponse((r) => /\/api\/v1\/(contexts|site)/.test(r.url()) && r.request().method() !== 'GET', {timeout: T}).catch(() => null);
    await form.getByRole('button', {name: 'Save', exact: true}).click();
    const resp = await w;
    let body = null;
    try { body = resp ? await resp.json() : null; } catch { body = null; }
    const saved = await page.locator('[role="status"]:has-text("Saved")').first().waitFor({timeout: 8000}).then(() => true).catch(() => false);
    const errors = await page.locator('.pkpFieldError, .pkpFormPage__error, .pkpFormPage__status').allInnerTexts().catch(() => []);
    const bar = await page.locator('.pkpNotification, [role="alert"]').allInnerTexts().catch(() => []);
    return {status: resp ? resp.status() : null, url: resp ? resp.url().replace(/^https?:\/\/[^/]+/, '') : null, saved, errors: errors.map((e) => flat(e, 200)), bar: bar.map((e) => flat(e, 300)), bodyKeys: body && typeof body === 'object' ? Object.keys(body).slice(0, 20) : null, body: resp && resp.status() >= 400 ? body : undefined};
}

async function openWebsite(page, app, ctx, top) {
    await page.goto(cUrl(app, ctx, '/management/settings/website'));
    await idle(page);
    await page.locator(`#${top}-button`).click();
    await idle(page);
    await sleep(500);
}
async function sideTab(page, name) {
    const t = page.getByRole('tab', {name, exact: true}).filter({visible: true}).first();
    await t.click();
    await idle(page); await sleep(500);
}
const selectedTabs = (page) => page.locator('[role="tab"][aria-selected="true"]').evaluateAll((els) => els.filter((e) => e.offsetParent !== null).map((e) => e.innerText.trim()));

// ---------------------------------------------------------------------------
forEachApp(async (app) => {
    const isOPS = app.name === 'ops';
    const hasInfo = !isOPS;
    const steps = [];
    const step = (s, data = {}) => { steps.push({at: new Date().toISOString(), s, ...data}); console.log(`[k3 ${app.name}]`, s, JSON.stringify(data).slice(0, 300)); };
    const summary = {};
    let st = fs.existsSync(stateFile(app)) ? JSON.parse(fs.readFileSync(stateFile(app), 'utf8')) : null;

    // ---- seed ------------------------------------------------------------------
    if (!st || process.env.RESEED === '1') {
        const t = tag('u07k3');
        const P = (s) => `${t}${s}`;
        const assistantRole = isOPS ? 'editorialBoardMember' : 'copyeditor';
        const pastRoles = isOPS ? [{role: 'sectionEditor'}, {role: 'editorialBoardMember'}] : [{role: 'editor'}, {role: 'sectionEditor'}];
        const usersA = [
            {username: P('am'), roles: ['manager'], givenName: 'Mira', familyName: 'Manager'},
            ...(isOPS ? [] : [{username: P('ae'), roles: ['editor'], givenName: 'Edda', familyName: 'Editor'}]),
            {username: P('as'), roles: ['sectionEditor'], givenName: 'Sonia', familyName: 'Section'},
            {username: P('aa'), roles: [assistantRole], givenName: 'Asa', familyName: 'Assistant'},
            {username: P('au'), roles: ['author'], givenName: 'Aria', familyName: 'Author'},
            {username: P('ar'), roles: ['reader'], givenName: 'Rex', familyName: 'Reader'},
            ...(isOPS ? [] : [{username: P('av'), roles: ['externalReviewer'], givenName: 'Vera', familyName: 'Reviewer'}]),
            {username: P('ah'), roles: ['reader'], givenName: 'Hal', familyName: 'Historian', pastRoles},
        ];
        const A = await app.api.createContext({tag: `${t}a`, context: {name: `U07 K3 A ${t}`, acronym: 'K3A'}, users: usersA, ...(hasInfo ? {sidebar: ['informationblockplugin']} : {})});
        let sub = null;
        if (!isOPS) {
            sub = await app.api.createSubmission({tag: `${t}s`, context: `${t}a`, submitter: P('au'), title: `Consent check ${t}`, submitted: true, decisions: ['sendExternalReview'], reviewRounds: [{reviewers: [{username: P('av'), status: 'invited'}]}]});
        }
        const E = isOPS ? null : await app.api.createContext({tag: `${t}e`, context: {name: `U07 K3 E ${t}`, acronym: 'K3E'}, roles: {editor: {permitSettings: false}}, users: [{username: P('ee'), roles: ['editor'], givenName: 'Nora', familyName: 'NoSettings'}]});
        const R = await app.api.createContext({tag: `${t}r`, context: {name: `U07 K3 R ${t}`, acronym: 'K3R'}, users: [{username: P('rm'), roles: ['manager'], givenName: 'Rita', familyName: 'Restrict'}]});
        const N = await app.api.createContext({tag: `${t}n`, context: {name: `U07 K3 N ${t}`, acronym: 'K3N'}, users: [{username: P('nm'), roles: ['manager'], givenName: 'Nils', familyName: 'Enabled'}]});
        const I = isOPS ? null : await app.api.createContext({tag: `${t}i`, context: {name: `U07 K3 I ${t}`, acronym: 'K3I'}, users: [{username: P('im'), roles: ['manager'], givenName: 'Ines', familyName: 'Block'}]});
        const L = await app.api.createContext({tag: `${t}l`, context: {name: `U07 K3 L ${t}`, acronym: 'K3L', supportedLocales: ['en', 'fr_CA'], supportedFormLocales: ['en', 'fr_CA']}, users: [{username: P('lm'), roles: ['manager'], givenName: 'Lea', familyName: 'Lang'}]});
        st = {t, A: `${t}a`, E: E ? `${t}e` : null, R: `${t}r`, N: `${t}n`, I: I ? `${t}i` : null, L: `${t}l`, sub: sub ? sub.submissionId : null,
            u: {am: P('am'), ae: isOPS ? null : P('ae'), as: P('as'), aa: P('aa'), au: P('au'), ar: P('ar'), av: isOPS ? null : P('av'), ee: isOPS ? null : P('ee'), rm: P('rm'), nm: P('nm'), im: isOPS ? null : P('im'), lm: P('lm')},
            ids: {A: A.contextId, R: R.contextId, N: N.contextId}};
        fs.writeFileSync(stateFile(app), JSON.stringify(st, null, 2));
        step('seeded', st);
    }
    const U = st.u;

    const {page, close} = await launch(app);
    const dialogs = [];
    page.on('dialog', async (d) => { dialogs.push({at: new Date().toISOString(), type: d.type(), message: d.message(), url: page.url()}); await d.dismiss().catch(() => {}); });
    const as = async (user) => { if (user) await signIn(page, user); else await signOut(page).catch(() => {}); };
    const phase = async (name, fn) => {
        if (!on(name)) return;
        step(`phase ${name} start`);
        try { await fn(); } catch (e) { summary[`${name}Error`] = String(e.stack || e).slice(0, 1500); step(`phase ${name} FAILED`, {e: String(e.message || e).slice(0, 400)}); await shot(page, `err-${name}`).catch(() => {}); }
        step(`phase ${name} end`);
    };

    try {
        // ---- public: publicknowledge and the site, signed out ---------------------
        await phase('public', async () => {
            await as(null);
            const pk = app.contextPath;
            const o = {};
            o.home = await pub(page, cUrl(app, pk), 'p01-pk-home');
            for (const [k, p] of [['about', '/about'], ['masthead', '/about/editorialMasthead'], ['history', '/about/editorialHistory'], ['contact', '/about/contact'], ['privacy', '/about/privacy'], ['software', '/about/aboutThisPublishingSystem'], ['submissions', '/about/submissions'], ['readers', '/information/readers'], ['authors', '/information/authors'], ['librarians', '/information/librarians'], ['infoOther', '/information/foo'], ['infoBare', '/information']]) {
                o[k] = await pub(page, cUrl(app, pk, p), `p02-pk-${k}`, {shotIt: ['about', 'contact', 'software', 'readers'].includes(k)});
            }
            // the footer logo, pressed
            await page.goto(cUrl(app, pk, '/about/contact')); await idle(page);
            const logo = page.locator('.pkp_brand_footer a, .pkp_structure_footer a').filter({has: page.locator('img')}).last();
            await loc(page, 'the footer\'s application logo link', logo);
            o.logoAlt = await logo.locator('img').getAttribute('alt').catch(() => null);
            await logo.click(); await page.waitForLoadState('load'); await idle(page);
            o.afterLogo = await pub(page, page.url(), 'p03-pk-after-logo', {shotIt: true});
            o.softwareLinks = await page.locator('.pkp_structure_main a').evaluateAll((as) => as.map((a) => ({t: a.innerText.trim(), h: a.getAttribute('href'), target: a.getAttribute('target')}))).catch(() => []);
            // "contact the journal" pressed
            const contactLink = page.locator('.pkp_structure_main a[href*="about/contact"]').first();
            if (await contactLink.count()) { await contactLink.click(); await page.waitForLoadState('load'); o.afterContactLink = page.url(); }
            // the site's own pages
            o.siteHome = await pub(page, app.url('/index.php/index'), 'p04-site-home', {shotIt: true});
            const slogo = page.locator('.pkp_brand_footer a, .pkp_structure_footer a').filter({has: page.locator('img')}).last();
            o.siteLogoHref = await slogo.getAttribute('href').catch(() => null);
            if (await slogo.count()) { await slogo.click(); await page.waitForLoadState('load'); await idle(page); }
            o.siteSoftware = await pub(page, page.url(), 'p05-site-software', {shotIt: true});
            o.siteSoftwareLinks = await page.locator('.pkp_structure_main a').evaluateAll((as) => as.map((a) => ({t: a.innerText.trim(), h: a.getAttribute('href')}))).catch(() => []);
            o.sitePrivacy = await pub(page, app.url('/index.php/index/about/privacy'), 'p06-site-privacy', {shotIt: true});
            o.siteAbout = await pub(page, app.url('/index.php/index/about'), 'p07-site-about');
            summary.public = o;
        });

        // ---- fresh: R's defaults -----------------------------------------------------
        await phase('fresh', async () => {
            const o = {};
            await as(null);
            o.home = await pub(page, cUrl(app, st.R), 'f01-r-home', {shotIt: true});
            o.about = await pub(page, cUrl(app, st.R, '/about'), 'f02-r-about');
            o.contact = await pub(page, cUrl(app, st.R, '/about/contact'), 'f03-r-contact');
            await as(U.rm);
            // Settings › Journal: any upgrade notice (bullet 11)
            await page.goto(cUrl(app, st.R, '/management/settings/context')); await idle(page); await sleep(800);
            await snap(page, 'f04-r-settings-context');
            o.contextNotices = await page.locator('.pkpNotification, [role="alert"], .notification, .pkp_notification').allInnerTexts().catch(() => []);
            o.contextHeading = await page.locator('main h1').first().innerText().catch(() => null);
            // Website › Setup › Information and Privacy Statement: labels and default texts
            await openWebsite(page, app, st.R, 'setup');
            o.setupSideTabs = await page.locator('#setup').getByRole('tab').allInnerTexts().catch(() => []);
            if (hasInfo) {
                await sideTab(page, 'Information');
                await snap(page, 'f05-r-info-tab');
                const ids = ['information-readerInformation-control-en', 'information-authorInformation-control-en', 'information-librarianInformation-control-en'];
                o.info = {};
                for (const id of ids) { await waitMce(page, id).catch(() => {}); o.info[id] = await mceGet(page, id); }
                o.infoFormText = flat(await page.locator('form').filter({has: page.locator('#information-readerInformation-control-en')}).first().innerText().catch(() => ''), 1500);
                o.infoRequired = await page.locator('form').filter({has: page.locator('#information-readerInformation-control-en')}).first().locator('.pkpFormFieldLabel__required, [aria-required="true"], .pkpFormField__required').count().catch(() => null);
                o.infoToolbar = await page.locator('form').filter({has: page.locator('#information-readerInformation-control-en')}).first().locator('.tox-toolbar button, .tox-tbtn').evaluateAll((bs) => bs.map((b) => b.getAttribute('aria-label') || b.title).slice(0, 12)).catch(() => []);
                await loc(page, 'Website › Setup › "Information": the "For Readers" rich-text box', page.locator('#information-readerInformation-control-en'));
            }
            await sideTab(page, 'Privacy Statement');
            await snap(page, 'f06-r-privacy-tab');
            await waitMce(page, 'privacy-privacyStatement-control-en').catch(() => {});
            o.privacy = await mceGet(page, 'privacy-privacyStatement-control-en');
            o.privacyFormText = flat(await page.locator('form').filter({has: page.locator('#privacy-privacyStatement-control-en')}).first().innerText().catch(() => ''), 800);
            await loc(page, 'Website › Setup › "Privacy Statement": the rich-text box', page.locator('#privacy-privacyStatement-control-en'));
            // Masthead tab: Editorial History toolbar for the "same controls" comparison
            await page.goto(cUrl(app, st.R, '/management/settings/context#masthead')); await idle(page); await sleep(800);
            o.historyToolbar = await page.locator('form').filter({has: page.locator('#masthead-editorialHistory-control-en')}).first().locator('.pkpFormField').filter({has: page.locator('#masthead-editorialHistory-control-en')}).locator('.tox-toolbar button, .tox-tbtn').evaluateAll((bs) => bs.map((b) => b.getAttribute('aria-label') || b.title).slice(0, 12)).catch(() => []);
            // Appearance › Setup: the Sidebar list
            await openWebsite(page, app, st.R, 'appearance');
            await page.locator('#appearance').getByRole('tab', {name: 'Setup', exact: true}).click(); await idle(page); await sleep(500);
            o.sidebar = await page.locator('input[name="sidebar"]').evaluateAll((els) => els.map((e) => ({value: e.value, checked: e.checked, label: (e.closest('label') || e.parentElement).innerText.trim()})));
            await snap(page, 'f07-r-appearance-setup', {sidebar: o.sidebar});
            // Appearance › Editorial Masthead: the default order
            await page.locator('#appearance').getByRole('tab', {name: 'Editorial Masthead', exact: true}).click(); await idle(page); await sleep(500);
            o.mastheadOrder = flat(await page.locator('#appearance [role="tabpanel"]:visible form').first().innerText().catch(() => ''), 800);
            await snap(page, 'f08-r-appearance-masthead');
            // Plugins › Installed Plugins: the Information Block row
            await openWebsite(page, app, st.R, 'plugins');
            await page.locator('#pluginGridContainer tr.gridRow').first().waitFor({timeout: T}).catch(() => {});
            const row = page.locator('#pluginGridContainer tr.gridRow').filter({hasText: 'Information Block'}).first();
            o.infoPluginRow = (await row.count()) ? {text: flat(await row.innerText()), enabled: await row.getByRole('checkbox').first().isChecked().catch(() => null)} : null;
            o.blockRows = await page.locator('#pluginGridContainer tr.gridRow').filter({hasText: /Block/}).allInnerTexts().then((a) => a.map((x) => flat(x, 120))).catch(() => []);
            await snap(page, 'f09-r-plugins', {infoPluginRow: o.infoPluginRow});
            // Users & Roles › Site Access Options
            await page.goto(cUrl(app, st.R, '/management/settings/access')); await idle(page);
            await page.getByRole('tab', {name: 'Site Access Options', exact: true}).click(); await idle(page); await sleep(500);
            const box = page.getByRole('checkbox', {name: /Users must be registered and log in to view the (journal|press|server) site\./});
            o.restrictLabel = await box.evaluate((e) => (e.closest('label') || e.parentElement).innerText.trim()).catch(() => null);
            o.restrictDefault = await box.isChecked().catch(() => null);
            await loc(page, 'Site Access Options: "Users must be registered and log in to view the … site."', box);
            await snap(page, 'f10-r-site-access');
            summary.fresh = o;
        });

        // ---- lang: L's per-language boxes ----------------------------------------------
        await phase('lang', async () => {
            const o = {};
            await as(U.lm);
            await openWebsite(page, app, st.L, 'setup');
            if (hasInfo) {
                await sideTab(page, 'Information');
                await sleep(1500);
                o.infoAreas = await page.locator('textarea[id^="information-"]').evaluateAll((els) => els.map((e) => e.id));
                o.infoLangButtons = await page.locator('form').filter({has: page.locator('textarea[id^="information-"]')}).first().getByRole('button').allInnerTexts().then((a) => a.filter((x) => /French|English|fran|Eng/i.test(x))).catch(() => []);
                o.infoContent = {};
                for (const id of o.infoAreas) { await waitMce(page, id).catch(() => {}); o.infoContent[id] = flat(await mceGet(page, id), 160); }
                await snap(page, 'l01-l-info-tab', o);
            }
            await sideTab(page, 'Privacy Statement');
            await sleep(1000);
            o.privAreas = await page.locator('textarea[id^="privacy-"]').evaluateAll((els) => els.map((e) => e.id));
            o.privContent = {};
            for (const id of o.privAreas) { await waitMce(page, id).catch(() => {}); o.privContent[id] = flat(await mceGet(page, id), 200); }
            await snap(page, 'l02-l-privacy-tab', {privAreas: o.privAreas, privContent: o.privContent});
            summary.lang = o;
        });

        // ---- about: fill "About the Journal" (td10) ---------------------------------
        await phase('about', async () => {
            const o = {};
            await as(null);
            o.before = await pub(page, cUrl(app, st.A, '/about'), 'a01-a-about-before');
            await as(U.am);
            await page.goto(cUrl(app, st.A, '/management/settings/context#masthead')); await idle(page); await sleep(800);
            o.typed = await mceSet(page, 'masthead-about-control-en', 'Our journal publishes probe articles.');
            o.save1 = await saveForm(page, '#masthead-about-control-en');
            await snap(page, 'a02-a-masthead-save1', {save: o.save1});
            if (!o.save1.saved) {
                // a scratch context has no initials and no country: both are required on this tab
                const acr = page.locator('#masthead-acronym-control-en');
                if ((await acr.count()) && !(await acr.inputValue())) { await acr.fill('PRB'); o.initialsTyped = 'PRB'; }
                const country = page.locator('#masthead-country-control');
                if (await country.count()) { await country.selectOption('CA'); o.countryPicked = 'CA'; }
                o.save2 = await saveForm(page, '#masthead-about-control-en');
                await snap(page, 'a03-a-masthead-save2', {save: o.save2});
            }
            await as(null);
            o.after = await pub(page, cUrl(app, st.A, '/about'), 'a04-a-about-after', {shotIt: true});
            summary.about = o;
        });

        // ---- contact: fill the Contact tab in steps (td15) ----------------------------
        await phase('contact', async () => {
            const o = {};
            const openContact = async () => { await page.goto(cUrl(app, st.A, '/management/settings/context#contact')); await idle(page); await sleep(800); };
            await as(U.am);
            await openContact();
            // 1. the principal contact's parts alone (the support contact left as a new journal has it)
            await page.locator('#contact-contactPhone-control').fill('+1 555 0100');
            await page.locator('#contact-contactAffiliation-control-en').fill('Probe University');
            await page.locator('#contact-mailingAddress-control').fill('1 Probe Street\nProbe City');
            o.save1 = await saveForm(page, '#contact-contactPhone-control');
            o.save1.flagged = await page.locator('.pkpFormField').filter({has: page.locator('.pkpFieldError')}).evaluateAll((fs) => fs.map((f) => f.innerText.replace(/\s+/g, ' ').trim().slice(0, 120))).catch(() => []);
            await snap(page, 'c01-a-contact-save1', {save: o.save1});
            // 2. the support contact's name and email added (no support phone)
            await page.locator('#contact-supportName-control').fill('Sam Support');
            await page.locator('#contact-supportEmail-control').fill('support@mail.test');
            o.save2 = await saveForm(page, '#contact-supportName-control');
            await snap(page, 'c02-a-contact-save2', {save: o.save2});
            await as(null);
            o.pub2 = await pub(page, cUrl(app, st.A, '/about/contact'), 'c03-a-contact-no-support-phone', {shotIt: true});
            // 3. the support phone added
            await as(U.am);
            await openContact();
            await page.locator('#contact-supportPhone-control').fill('+1 555 0199');
            o.save3 = await saveForm(page, '#contact-supportPhone-control');
            await snap(page, 'c04-a-contact-save3', {save: o.save3});
            await as(null);
            o.pub3 = await pub(page, cUrl(app, st.A, '/about/contact'), 'c05-a-contact-full', {shotIt: true});
            o.structure = await page.evaluate(() => {
                const p = document.querySelector('.page_contact') || document.querySelector('.pkp_structure_main');
                return {
                    headings: [...p.querySelectorAll('h1,h2,h3,h4')].map((h) => h.tagName + ':' + h.innerText.trim()),
                    parts: [...p.querySelectorAll('.address, .contact, .name, .affiliation, .phone, .email, .title')].map((e) => ({cls: e.className, text: e.innerText.replace(/\s+/g, ' ').trim().slice(0, 160)})),
                    mailto: [...p.querySelectorAll('a[href^="mailto:"]')].map((a) => ({text: a.innerText.trim(), href: a.getAttribute('href')})),
                    addressHtml: (p.querySelector('.address') || {}).innerHTML || null,
                    orderText: p.innerText.replace(/\s+/g, ' ').trim(),
                };
            });
            record('c06-a-contact-structure', o.structure);
            await loc(page, 'Contact page: the principal contact\'s email link', page.locator('.contact.primary a[href^="mailto:"]'));
            o.nav = o.pub3.nav;
            summary.contact = o;
        });

        // ---- edit: the "Edit" link on every About page, every level (td3) -----------
        await phase('edit', async () => {
            const o = {};
            const pages = [['about', '/about'], ['history', '/about/editorialHistory'], ['contact', '/about/contact'], ['masthead', '/about/editorialMasthead'], ['privacy', '/about/privacy'], ...(hasInfo ? [['readers', '/information/readers'], ['authors', '/information/authors'], ['librarians', '/information/librarians']] : [])];
            const levels = [['signedOut', null], ['manager', U.am], ['editor', U.ae], ['sectionEditor', U.as], ['assistant', U.aa], ['author', U.au], ['reader', U.ar], ['reviewer', U.av], ['admin', 'admin']].filter(([, u]) => u !== undefined && !(u === null && false));
            for (const [lv, user] of levels) {
                if (user === null && lv !== 'signedOut') continue;
                await as(user);
                o[lv] = {};
                for (const [k, p] of pages) {
                    const r = await pub(page, cUrl(app, st.A, p), `e-${lv}-${k}`);
                    o[lv][k] = {status: r.status, h1: r.h1, edit: r.edit};
                }
            }
            // follow each link as the manager
            await as(U.am);
            o.follow = {};
            for (const [k, p] of pages) {
                await page.goto(cUrl(app, st.A, p)); await idle(page);
                const link = page.locator('a.cmp_edit_link').first();
                if (!(await link.count())) { o.follow[k] = null; continue; }
                if (k === 'about') await loc(page, '"About the Journal": the "Edit" link', page.getByRole('link', {name: /^Edit /}).first());
                const pagesBefore = page.context().pages().length;
                await link.click(); await page.waitForLoadState('load'); await idle(page); await sleep(1200);
                o.follow[k] = {url: page.url(), newWindow: page.context().pages().length > pagesBefore, selectedTabs: await selectedTabs(page), heading: await page.locator('main h1').first().innerText().catch(() => null)};
                await snap(page, `e-follow-${k}`, o.follow[k]);
            }
            // E: the Editor without "Permit changes to Settings"
            if (st.E) {
                await as(U.ee);
                o.noSettings = {};
                for (const [k, p] of [['about', '/about'], ['contact', '/about/contact'], ['history', '/about/editorialHistory'], ['readers', '/information/readers']]) {
                    const r = await pub(page, cUrl(app, st.E, p), `e-nosettings-${k}`);
                    o.noSettings[k] = {status: r.status, edit: r.edit};
                }
                await page.goto(cUrl(app, st.E, '/about')); await idle(page);
                const link = page.locator('a.cmp_edit_link').first();
                if (await link.count()) {
                    const resp = page.waitForResponse((r) => /management\/settings\/context/.test(r.url()), {timeout: T}).catch(() => null);
                    await link.click(); await page.waitForLoadState('load'); await idle(page);
                    const rr = await resp;
                    o.noSettings.follow = {url: page.url(), status: rr ? rr.status() : null, main: flat(await page.locator('main, body').first().innerText().catch(() => ''), 400)};
                    await snap(page, 'e-nosettings-follow', o.noSettings.follow);
                }
            }
            summary.edit = o;
        });

        // ---- info: block and pages; texts emptied (td17) ----------------------------
        await phase('info', async () => {
            const o = {};
            if (!hasInfo) {
                await as(null);
                o.readers = await pub(page, cUrl(app, st.A, '/information/readers'), 'i01-ops-readers', {shotIt: true});
                o.home = await pub(page, cUrl(app, st.A), 'i02-ops-home');
                summary.info = o;
                return;
            }
            await as(null);
            o.home = await pub(page, cUrl(app, st.A), 'i01-a-home', {shotIt: true});
            o.aboutPage = await pub(page, cUrl(app, st.A, '/about'), 'i02-a-about-sidebar');
            o.contactPage = await pub(page, cUrl(app, st.A, '/about/contact'), 'i03-a-contact-sidebar');
            await page.goto(cUrl(app, st.A)); await idle(page);
            await loc(page, 'the sidebar\'s Information block', page.locator('.pkp_structure_sidebar .block_information'));
            o.clicked = {};
            for (const n of ['For Readers', 'For Authors', 'For Librarians']) {
                await page.goto(cUrl(app, st.A)); await idle(page);
                const l = page.locator('.pkp_structure_sidebar').getByRole('link', {name: n, exact: true});
                if (!(await l.count())) { o.clicked[n] = null; continue; }
                await l.click(); await page.waitForLoadState('load'); await idle(page);
                o.clicked[n] = await pub(page, page.url(), `i04-a-${n.replace(/ /g, '')}`);
            }
            // empty "For Librarians"
            await as(U.am);
            await openWebsite(page, app, st.A, 'setup');
            await sideTab(page, 'Information');
            o.emptyLib = await mceSet(page, 'information-librarianInformation-control-en', '');
            o.save1 = await saveForm(page, '#information-librarianInformation-control-en');
            await snap(page, 'i05-a-info-lib-emptied', {save: o.save1});
            await as(null);
            o.home2 = await pub(page, cUrl(app, st.A), 'i06-a-home-no-lib', {shotIt: true});
            o.libPage = await pub(page, cUrl(app, st.A, '/information/librarians'), 'i07-a-librarians-empty', {shotIt: true});
            // empty all three
            await as(U.am);
            await openWebsite(page, app, st.A, 'setup');
            await sideTab(page, 'Information');
            await mceSet(page, 'information-readerInformation-control-en', '');
            await mceSet(page, 'information-authorInformation-control-en', '');
            o.save2 = await saveForm(page, '#information-readerInformation-control-en');
            await snap(page, 'i08-a-info-all-emptied', {save: o.save2});
            await as(null);
            o.home3 = await pub(page, cUrl(app, st.A), 'i09-a-home-none', {shotIt: true});
            o.readers3 = await pub(page, cUrl(app, st.A, '/information/readers'), 'i10-a-readers-empty');
            summary.info = o;
        });

        // ---- privacy: before/after emptying; the site statement ----------------------
        await phase('privacy', async () => {
            const o = {};
            const consent = async (label) => {
                const r = {};
                await as(null);
                await page.goto(cUrl(app, st.A, '/user/register')); await idle(page);
                r.register = await page.evaluate(() => ({
                    boxes: [...document.querySelectorAll('input[type=checkbox]')].map((b) => ({name: b.name, label: (b.closest('label') || b.parentElement).innerText.replace(/\s+/g, ' ').trim().slice(0, 200), privacyLink: !!(b.closest('label') || b.parentElement).querySelector('a[href*="about/privacy"]')})),
                }));
                await snap(page, `v-${label}-register`, r.register);
                await as(U.au);
                await page.goto(cUrl(app, st.A, '/submission')); await idle(page); await sleep(1500);
                r.wizard = await page.evaluate(() => ({
                    url: location.href,
                    boxes: [...document.querySelectorAll('input[type=checkbox]')].map((b) => ({name: b.name, label: (b.closest('label') || b.parentElement).innerText.replace(/\s+/g, ' ').trim().slice(0, 200), privacyLink: !!(b.closest('label') || b.parentElement).querySelector('a[href*="about/privacy"]')})),
                }));
                await snap(page, `v-${label}-wizard`, r.wizard);
                if (st.sub) {
                    await as(U.av);
                    await page.goto(cUrl(app, st.A, `/reviewer/submission/${st.sub}`)); await idle(page); await sleep(1000);
                    r.reviewer = await page.evaluate(() => ({
                        url: location.href,
                        boxes: [...document.querySelectorAll('input[type=checkbox]')].map((b) => ({name: b.name, label: (b.closest('label') || b.parentElement).innerText.replace(/\s+/g, ' ').trim().slice(0, 200), privacyLink: !!(b.closest('label') || b.parentElement).querySelector('a[href*="about/privacy"]')})),
                    }));
                    await snap(page, `v-${label}-reviewer`, r.reviewer);
                }
                return r;
            };
            await as(U.am);
            o.mgrPrivacy = await pub(page, cUrl(app, st.A, '/about/privacy'), 'v01-a-privacy-as-manager', {shotIt: true});
            o.before = await consent('before');
            await as(null);
            o.pubBefore = await pub(page, cUrl(app, st.A, '/about/privacy'), 'v02-a-privacy-before');
            await as(U.am);
            await openWebsite(page, app, st.A, 'setup');
            await sideTab(page, 'Privacy Statement');
            o.emptied = await mceSet(page, 'privacy-privacyStatement-control-en', '');
            o.save = await saveForm(page, '#privacy-privacyStatement-control-en');
            await snap(page, 'v03-a-privacy-emptied', {save: o.save});
            await as(null);
            o.pubAfter = await pub(page, cUrl(app, st.A, '/about/privacy'), 'v04-a-privacy-after', {shotIt: true});
            o.homeAfter = await pub(page, cUrl(app, st.A), 'v05-a-home-after');
            o.after = await consent('after');
            // the site-level statement (bullet 10): set, read, restore
            await as('admin');
            await page.goto(app.url('/index.php/index/admin/settings')); await idle(page);
            await page.locator('#setup-button').first().click(); await idle(page); await sleep(500);
            await sideTab(page, 'Information');
            const sid = await page.locator('textarea:visible, textarea').evaluateAll((els) => els.map((e) => e.id).filter((id) => /privacyStatement/.test(id)));
            o.siteFieldIds = sid;
            const siteId = sid.find((x) => /-en$/.test(x)) || sid[0];
            if (siteId) {
                await waitMce(page, siteId).catch(() => {});
                o.siteBefore = await mceGet(page, siteId);
                o.siteFormText = flat(await page.locator('form').filter({has: page.locator(`#${siteId}`)}).first().innerText().catch(() => ''), 1200);
                await snap(page, 'v06-site-information-tab', {siteBefore: o.siteBefore});
                await mceSet(page, siteId, 'Site probe privacy statement.');
                o.siteSave = await saveForm(page, `#${siteId}`);
                await as(null);
                o.sitePub = await pub(page, app.url('/index.php/index/about/privacy'), 'v07-site-privacy-set', {shotIt: true});
                o.journalWithSite = await pub(page, cUrl(app, st.A, '/about/privacy'), 'v08-a-privacy-with-site-statement');
                o.pkWithSite = await pub(page, cUrl(app, app.contextPath, '/about/privacy'), 'v08b-pk-privacy-with-site-statement');
                await as('admin');
                await page.goto(app.url('/index.php/index/admin/settings')); await idle(page);
                await page.locator('#setup-button').first().click(); await idle(page); await sleep(500);
                await sideTab(page, 'Information');
                await mceSet(page, siteId, '');
                o.siteRestore = await saveForm(page, `#${siteId}`);
                await as(null);
                o.sitePubRestored = await pub(page, app.url('/index.php/index/about/privacy'), 'v09-site-privacy-restored');
            }
            summary.privacy = o;
        });

        // ---- masthead: Appearance › "Editorial Masthead" reordered (bullet 4) --------
        await phase('masthead', async () => {
            const o = {};
            const heads = async (p, name) => {
                const r = await pub(page, cUrl(app, st.A, p), name);
                const h2 = await page.locator('.pkp_structure_main h2').allInnerTexts().catch(() => []);
                return {status: r.status, h1: r.h1, h2};
            };
            await as(null);
            o.mastBefore = await heads('/about/editorialMasthead', 'm01-a-masthead-before');
            o.histBefore = await heads('/about/editorialHistory', 'm02-a-history-before');
            await as(U.am);
            await openWebsite(page, app, st.A, 'appearance');
            await page.locator('#appearance').getByRole('tab', {name: 'Editorial Masthead', exact: true}).click(); await idle(page); await sleep(500);
            const form = page.locator('#appearance [role="tabpanel"]:visible form').first();
            o.listBefore = flat(await form.innerText(), 600);
            const second = isOPS ? 'Editorial Board Member' : (app.name === 'omp' ? 'Series editor' : 'Section editor');
            // the up arrow's accessible name reads "{role} Decrease position of {role}" (see the report), so find it by its text
            const up = form.locator('button').filter({hasText: `Increase position of ${second}`}).first();
            o.upName = await up.evaluate((b) => b.getAttribute('aria-label') || b.getAttribute('aria-labelledby') || null).catch(() => null);
            o.upHtml = await up.evaluate((b) => b.outerHTML.slice(0, 600)).catch(() => null);
            await loc(page, `Appearance › "Editorial Masthead": "Increase position of ${second}"`, up);
            await up.click(); await sleep(400);
            o.listMoved = flat(await form.innerText(), 600);
            const w = page.waitForResponse((r) => /\/api\/v1\/contexts/.test(r.url()) && r.request().method() !== 'GET', {timeout: T}).catch(() => null);
            await form.getByRole('button', {name: 'Save', exact: true}).click();
            const resp = await w;
            o.save = {status: resp ? resp.status() : null, saved: await page.locator('[role="status"]:has-text("Saved")').first().waitFor({timeout: 8000}).then(() => true).catch(() => false)};
            await snap(page, 'm03-a-appearance-masthead-saved', o);
            await as(null);
            o.mastAfter = await heads('/about/editorialMasthead', 'm04-a-masthead-after');
            o.histAfter = await heads('/about/editorialHistory', 'm05-a-history-after');
            summary.masthead = o;
        });

        // ---- iblock: the block placed on screen, then the plugin disabled -----------
        await phase('iblock', async () => {
            if (!st.I) return;
            const o = {};
            await as(null);
            o.homeBefore = await pub(page, cUrl(app, st.I), 'b01-i-home-before');
            await as(U.im);
            await openWebsite(page, app, st.I, 'appearance');
            await page.locator('#appearance').getByRole('tab', {name: 'Setup', exact: true}).click(); await idle(page); await sleep(500);
            const box = page.locator('input[name="sidebar"][value="informationblockplugin"]');
            await loc(page, 'Appearance › Setup › Sidebar: the "Information Block" box', page.getByRole('checkbox', {name: /^Information Block/}));
            await box.check();
            o.save = await saveForm(page, 'input[name="sidebar"][value="informationblockplugin"]');
            await snap(page, 'b02-i-sidebar-placed', {save: o.save});
            await as(null);
            o.homePlaced = await pub(page, cUrl(app, st.I), 'b03-i-home-placed', {shotIt: true});
            o.aboutPlaced = await pub(page, cUrl(app, st.I, '/about'), 'b04-i-about-placed');
            // disable the plugin
            await as(U.im);
            await openWebsite(page, app, st.I, 'plugins');
            const row = page.locator('#pluginGridContainer tr.gridRow').filter({hasText: 'Information Block'}).first();
            await row.waitFor({timeout: T});
            const w = page.waitForResponse((r) => /settings-plugin-grid\/(enable|disable)/.test(r.url()), {timeout: T}).catch(() => null);
            await row.getByRole('checkbox').first().click({noWaitAfter: true});
            await sleep(800);
            const dlg = page.locator('[role="dialog"]:visible').last();
            o.confirmText = (await dlg.count()) ? flat(await dlg.innerText(), 400) : null;
            if (o.confirmText) { await snap(page, 'b05-i-disable-confirm'); await dlg.getByRole('button', {name: /^(OK|Yes)$/}).first().click().catch(() => {}); }
            const resp = await w;
            await idle(page); await sleep(800);
            o.disable = {status: resp ? resp.status() : null, url: resp ? resp.url().replace(/^https?:\/\/[^/]+/, '') : null, toast: await page.locator('.pkpNotification, .pkp_notification').allInnerTexts().catch(() => []), checked: await page.locator('#pluginGridContainer tr.gridRow').filter({hasText: 'Information Block'}).first().getByRole('checkbox').first().isChecked().catch(() => null)};
            await snap(page, 'b06-i-plugin-disabled', o.disable);
            await openWebsite(page, app, st.I, 'appearance');
            await page.locator('#appearance').getByRole('tab', {name: 'Setup', exact: true}).click(); await idle(page); await sleep(500);
            o.sidebarAfter = await page.locator('input[name="sidebar"]').evaluateAll((els) => els.map((e) => ({value: e.value, checked: e.checked})));
            await snap(page, 'b07-i-sidebar-after-disable', {sidebar: o.sidebarAfter});
            await as(null);
            o.homeDisabled = await pub(page, cUrl(app, st.I), 'b08-i-home-disabled', {shotIt: true});
            o.readersDisabled = await pub(page, cUrl(app, st.I, '/information/readers'), 'b09-i-readers-disabled');
            summary.iblock = o;
        });

        // ---- closed: R restricted on screen; N un-enabled by the admin (Rule 22) ------
        await phase('closed', async () => {
            const o = {};
            const aboutPages = [['about', '/about'], ['masthead', '/about/editorialMasthead'], ['history', '/about/editorialHistory'], ['contact', '/about/contact'], ['privacy', '/about/privacy'], ['software', '/about/aboutThisPublishingSystem'], ['submissions', '/about/submissions'], ...(hasInfo ? [['readers', '/information/readers']] : []), ['home', '']];
            const sweep = async (ctx, label) => {
                const r = {};
                for (const [k, p] of aboutPages) { const x = await pub(page, cUrl(app, ctx, p), `x-${label}-${k}`); r[k] = {status: x.status, url: x.url, h1: x.h1, loginForm: x.loginForm}; }
                return r;
            };
            // R
            await as(U.rm);
            await page.goto(cUrl(app, st.R, '/management/settings/access')); await idle(page);
            await page.getByRole('tab', {name: 'Site Access Options', exact: true}).click(); await idle(page); await sleep(500);
            const box = page.getByRole('checkbox', {name: /Users must be registered and log in to view the (journal|press|server) site\./});
            await box.check();
            o.restrictSave = await saveForm(page, 'input[name="restrictSiteAccess"]');
            await snap(page, 'x01-r-restricted-saved', {save: o.restrictSave});
            o.rSignedInReader = {};
            await as(null);
            o.rSignedOut = await sweep(st.R, 'r-out');
            await shot(page, 'x02-r-out-last').catch(() => {});
            await as(U.rm);
            o.rManager = await sweep(st.R, 'r-mgr');
            // N: the admin un-enables it
            await as('admin');
            await page.goto(app.url('/index.php/index/admin/contexts')); await idle(page); await sleep(400);
            const openEdit = async (name) => {
                const row = page.locator('tr.gridRow').filter({hasText: name}).first();
                await row.locator('a.show_extras').click(); await idle(page); await sleep(300);
                await row.locator('xpath=following-sibling::tr[1]').getByRole('link', {name: 'Edit', exact: true}).click();
                const cb = page.getByRole('checkbox', {name: /appear publicly on the site/});
                await cb.waitFor({timeout: T});
                return cb;
            };
            const pkName = {ojs: 'Journal of Public Knowledge', omp: 'Public Knowledge Press', ops: 'Public Knowledge Preprint Server'}[app.name];
            const pkBox = await openEdit(pkName);
            o.pkEnabled = {label: await pkBox.evaluate((e) => (e.closest('label') || e.parentElement).innerText.trim()).catch(() => null), checked: await pkBox.isChecked()};
            await snap(page, 'x03-pk-hosted-edit', o.pkEnabled);
            await page.locator('[role="dialog"]:visible').last().getByRole('button', {name: /Close|Cancel/}).first().click().catch(() => page.keyboard.press('Escape'));
            await sleep(800);
            await page.goto(app.url('/index.php/index/admin/contexts')); await idle(page); await sleep(400);
            const nBox = await openEdit(`U07 K3 N ${st.t}`);
            o.nEnabledBefore = await nBox.isChecked();
            await nBox.uncheck();
            const acr = page.locator('[role="dialog"]:visible input[id^="context-acronym-control"]').first();
            if ((await acr.count()) && !(await acr.inputValue())) { await acr.fill('K3N'); o.nInitialsTyped = true; }
            const dlg = page.locator('[role="dialog"]:visible').last();
            const w = page.waitForResponse((r) => /\/api\/v1\/contexts\/\d+/.test(r.url()) && r.request().method() !== 'GET', {timeout: T}).catch(() => null);
            await dlg.getByRole('button', {name: 'Save', exact: true}).click();
            const resp = await w;
            o.nSave = {status: resp ? resp.status() : null};
            await sleep(1500); await idle(page);
            if (o.nSave.status >= 400) {
                // a context with no country is refused here ("This is not a valid string."): pick one, as an admin would
                o.nSave.errors = await dlg.locator('.pkpFieldError, .pkpFormPage__errors').allInnerTexts().then((a) => a.map((x) => flat(x, 200))).catch(() => []);
                await snap(page, 'x04a-n-unenable-refused', o.nSave);
                await dlg.locator('select[id^="context-country-control"]').first().selectOption('CA');
                const w2 = page.waitForResponse((r) => /\/api\/v1\/contexts\/\d+/.test(r.url()) && r.request().method() !== 'GET', {timeout: T}).catch(() => null);
                await dlg.getByRole('button', {name: 'Save', exact: true}).click();
                const r2 = await w2;
                o.nSave2 = {status: r2 ? r2.status() : null, countryPicked: 'CA'};
                await sleep(1500); await idle(page);
            }
            await snap(page, 'x04-n-unenabled', o.nSave);
            await as(null);
            o.nSignedOut = await sweep(st.N, 'n-out');
            await as(U.nm);
            o.nManager = await sweep(st.N, 'n-mgr');
            summary.closed = o;
        });

        // ---- formlang: French ticked under "Forms" on the Languages grid (R), the default texts it writes ----
        await phase('formlang', async () => {
            const o = {};
            await as(U.rm);
            await openWebsite(page, app, st.R, 'setup');
            await sideTab(page, 'Languages');
            const row = page.locator('tr.gridRow').filter({hasText: 'fr_CA'}).first();
            await row.waitFor({timeout: T});
            const boxes = row.locator('input[type="checkbox"]');
            o.rowBoxes = await boxes.evaluateAll((els) => els.map((e) => ({name: e.name, id: e.id, checked: e.checked})));
            const formsBox = row.locator('input[type="checkbox"][id*="Form" i], input[type="checkbox"][name*="Form" i]').first();
            const target = (await formsBox.count()) ? formsBox : boxes.last();
            const w = page.waitForResponse((r) => /manage-language-grid/.test(r.url()) && r.request().method() === 'POST', {timeout: T}).catch(() => null);
            await target.click({noWaitAfter: true});
            await sleep(800);
            const dlg = page.locator('[role="dialog"]:visible').last();
            o.confirm = (await dlg.count()) ? flat(await dlg.innerText(), 300) : null;
            if (o.confirm) await dlg.getByRole('button', {name: /^(OK|Yes)$/}).first().click().catch(() => {});
            const r = await w;
            o.gridSave = r ? r.status() : null;
            await sleep(1500); await idle(page);
            await snap(page, 'g01-r-languages-forms-french', o);
            await openWebsite(page, app, st.R, 'setup');
            await sideTab(page, 'Privacy Statement');
            await sleep(1000);
            o.privAreas = await page.locator('textarea[id^="privacy-"]').evaluateAll((els) => els.map((e) => e.id));
            o.privContent = {};
            for (const id of o.privAreas) { await waitMce(page, id).catch(() => {}); o.privContent[id] = flat(await mceGet(page, id), 300); }
            await snap(page, 'g02-r-privacy-french', o);
            summary.formlang = o;
        });

        // ---- leave: a Website tab left with an unsaved change --------------------------
        await phase('leave', async () => {
            const o = {};
            await as(U.am);
            await openWebsite(page, app, st.A, 'setup');
            await sideTab(page, 'Privacy Statement');
            await mceSet(page, 'privacy-privacyStatement-control-en', 'Unsaved privacy words.');
            const n0 = dialogs.length;
            if (hasInfo) { await sideTab(page, 'Information'); } else { await sideTab(page, 'Languages'); }
            o.afterSideTab = {dialogs: dialogs.slice(n0), selected: await selectedTabs(page)};
            await sideTab(page, 'Privacy Statement');
            o.backContent = await mceGet(page, 'privacy-privacyStatement-control-en');
            await page.locator('#appearance-button').click(); await idle(page); await sleep(500);
            o.afterTopTab = {dialogs: dialogs.slice(n0), selected: await selectedTabs(page)};
            await page.locator('#setup-button').click(); await idle(page); await sleep(500);
            await sideTab(page, 'Privacy Statement');
            o.backContent2 = await mceGet(page, 'privacy-privacyStatement-control-en');
            await page.goto(cUrl(app, st.A, '/about')).catch((e) => { o.gotoError = String(e.message || e); });
            await sleep(800);
            o.afterLeave = {dialogs: dialogs.slice(n0), url: page.url()};
            await page.goto(cUrl(app, st.A, '/management/settings/website#setup/privacy')); await idle(page); await sleep(800);
            await waitMce(page, 'privacy-privacyStatement-control-en').catch(() => {});
            o.reopened = await mceGet(page, 'privacy-privacyStatement-control-en');
            await snap(page, 'z01-a-privacy-reopened', o);
            summary.leave = o;
        });
    } finally {
        summary.dialogs = dialogs;
        summary.steps = steps;
        const sumFile = path.join(outDir(), `k3-summary-${app.name}.json`);
        const prev = fs.existsSync(sumFile) && process.env.RESEED !== '1' ? JSON.parse(fs.readFileSync(sumFile, 'utf8')) : {};
        record('k3-summary', {...prev, ...summary, steps: [...(prev.steps || []), ...steps], dialogs: [...(prev.dialogs || []), ...dialogs]});
        await close();
    }
});
