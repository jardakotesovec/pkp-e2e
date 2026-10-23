// U62 claim check, chunk I23B (housekeeping 2026-10-23): two incidental rows.
//   U62 A8: the theme a journal uses, a theme that overrides the home page template, switched off and then deleted.
//   U10 (for other specs): the themes API with a theme the install lacks, on the context route and the site route.
//
// Runs on a dataset fleet (PKP's default dataset; `rvaca` the manager, `admin` the Site Administrator):
//   bin/app-lock.sh shared ojs -- env PROBE_FEATURE=issues-cc23b PKP_E2E_DATASET=7 PROBE_NOTES_FEATURE=U62 \
//     PROBE_AGENT=cc23b PROBE_RUN=r1 node bin/probe.js ojs shared/playwright/checks/U62/I23B/i23b.js
//   (stable-3_5_0: PKP_E2E_LINE=stable-3_5_0 PROBE_FEATURE=issues-cc23b-3_5 … PROBE_RUN=s1)
// Reset the fleet before each run (npm run fleet-prep -- --feature issues-cc23b --dataset 7 --reset): the run
// leaves its journal on the Default Theme but a version record of the scratch theme and, in the `site` phase, a
// second journal.
// PHASES=theme,api,site (default all). `theme` installs the scratch theme as `admin`, the manager ticks it and
// chooses it in Appearance › Theme, unticks it ("Disable" › "OK"), `admin` deletes it, Administration › "Delete
// Template Cache", then the manager chooses "Default Theme" and saves; the home page is read signed out and signed
// in after each step, with `themePluginPath` from the database and the server log. `api` (inside `theme`, while
// the stored theme is missing) sends the themes API requests the U10 row names. `site` adds a second journal so the
// site's own lists show, unticks "Default Theme" on the site's list and reads the site's theme route.
// The theme's folder lands in the app checkout: removed in `finally` if the app's Delete left it, and
// `git status -- plugins` is recorded. No assertions: the script records, the reader judges.
const path = require('path');
const {execFileSync} = require('child_process');
const {forEachApp, launch, signIn, signOut, screen, shot, record, note, idle, sql, serverLog, outDir, loc} = require('../../../probe');
const G = require('../K1/grid');
const {buildTheme, themeNames, themeFolder, removeThemeFolder} = require('./theme');

const {T, sleep, flat, rel} = G;
const RUN = process.env.PROBE_RUN || 'r0';
const PHASES = (process.env.PHASES || 'theme,api,site').split(',');
const on = (p) => PHASES.includes(p);
const log = (...a) => console.log('[i23b]', new Date().toISOString().slice(11, 19), ...a);
const CTX = {ojs: ['journals', 'journal_id', 'journal_settings'], omp: ['presses', 'press_id', 'press_settings'], ops: ['servers', 'server_id', 'server_settings']};

forEachApp(async (app) => {
    const product = `u62i23b${RUN.replace(/[^a-z0-9]/g, '')}theme`;
    const N = themeNames(product);
    const displayName = `U62 I23B ${RUN} Theme`;
    const root = path.resolve(app.root);
    const fact = (k, v) => { record('i23b-facts', {[k]: v}, {merge: true}); log(`[${app.name} ${k}]`, JSON.stringify(v).slice(0, 2500)); };
    const [ctable, cid, csettings] = CTX[app.name];
    const ctxId = Number(sql(app, `SELECT ${cid} FROM ${ctable} WHERE path='${app.contextPath}'`));
    const db = () => ({
        context: sql(app, `SELECT setting_value FROM ${csettings} WHERE ${cid}=${ctxId} AND setting_name='themePluginPath'`),
        site: sql(app, `SELECT setting_value FROM site_settings WHERE setting_name='themePluginPath'`),
        themeEnabled: sql(app, `SELECT context_id||':'||setting_value FROM plugin_settings WHERE plugin_name='${N.id}' AND setting_name='enabled' ORDER BY context_id`).split('\n').filter(Boolean),
        defaultEnabled: sql(app, `SELECT context_id||':'||setting_value FROM plugin_settings WHERE plugin_name='defaultthemeplugin' AND setting_name='enabled' ORDER BY context_id`).split('\n').filter(Boolean),
        version: sql(app, `SELECT current||' '||product_type FROM versions WHERE product='${product}'`),
    });
    const gitPlugins = () => { try { return execFileSync('git', ['-C', root, 'status', '--porcelain', '--', 'plugins']).toString().trim(); } catch (e) { return `git failed ${flat(e.message, 80)}`; } };
    const slog = serverLog(app);
    fact('before', {product, ctxId, db: db(), folder: themeFolder(root, product), git: gitPlugins(), line: app.line});

    const {page, close} = await launch(app);
    const visitor = await launch(app);
    // The "Delete Template Cache" confirm() and any page-leave question: accepted here (the script's listener decides alone).
    const dialogs = [];
    page.on('dialog', async (d) => { dialogs.push(`${d.type()}: ${flat(d.message(), 200)}`); await d.accept().catch(() => {}); });
    const as = async (user) => { await signIn(page, user, {contextPath: app.contextPath}); await idle(page).catch(() => {}); };
    const out = async () => { await signOut(page).catch(() => {}); };
    const go = async (p, u) => { let st = null; try { const r = await p.goto(app.url(u)); st = r && r.status(); } catch (e) { st = flat(e.message, 100); } await idle(p).catch(() => {}); return st; };
    const snap = async (p, name, extra = {}) => { const s = await screen(p).catch((e) => ({url: p.url(), screenError: flat(e.message, 300)})); record(name, {...s, ...extra}); await shot(p, name).catch(() => {}); return s; };

    /** The context's home page in `p`: status, the theme's marker, stylesheets, the page text and the server log. */
    const home = async (p, name) => {
        const from = slog.mark();
        const st = await go(p, `/index.php/${app.contextPath}`);
        const o = await p.evaluate((marker) => ({
            title: document.title,
            marker: !!document.getElementById(marker),
            structure: !!document.querySelector('.pkp_structure_page'),
            sheets: [...document.querySelectorAll('link[rel="stylesheet"]')].map((l) => (l.getAttribute('href') || '').replace(/^https?:\/\/[^/]+/, '').replace(/\?.*$/, '')),
            text: document.body ? document.body.innerText.replace(/\s+/g, ' ').trim().slice(0, 500) : null,
            htmlLength: document.documentElement.outerHTML.length,
        }), N.marker).catch((e) => ({error: flat(e.message, 200)}));
        o.status = st;
        o.url = rel(p.url());
        await sleep(300);
        o.log = slog.since(from).map((l) => flat(l, 400)).slice(0, 8);
        await snap(p, name, o);
        return o;
    };
    const both = async (name) => ({signedOut: await home(visitor.page, `${name}-out`), signedIn: await home(page, `${name}-in`)});

    /** Settings › Website › Appearance › Theme: the theme list as offered (and, with `choose`, a save). */
    const themeTab = async (name, choose) => {
        const o = {};
        o.status = await go(page, `/index.php/${app.contextPath}/management/settings/website`);
        await page.locator('#appearance-button').first().click().catch(() => {}); await idle(page).catch(() => {});
        await page.locator('#theme-button').first().click().catch(() => {}); await idle(page).catch(() => {});
        await sleep(600);
        const panel = page.locator('[role="tabpanel"]#theme').first();
        const sel = panel.locator('select').first();
        await loc(page, 'Appearance › Theme: the "Theme" select', sel);
        const readSel = () => sel.evaluate((s) => ({name: s.name, value: s.value, selectedIndex: s.selectedIndex, selectedText: s.selectedIndex >= 0 ? s.options[s.selectedIndex].text.trim() : null, options: [...s.options].map((x) => `${x.text.trim()}=${x.value}${x.selected ? '*' : ''}`)})).catch((e) => ({error: flat(e.message, 120)}));
        o.select = await readSel();
        o.panelText = flat(await panel.innerText().catch(() => ''), 600);
        await snap(page, `${name}-tab`, o);
        if (choose) {
            const traffic = [];
            const onResp = (r) => { if (/\/theme(\?|$)/.test(r.url())) traffic.push(r.text().then((t) => `${r.request().method()}${r.request().headers()['x-http-method-override'] ? '(' + r.request().headers()['x-http-method-override'] + ')' : ''} ${rel(r.url())} ${r.status()} ${flat(t, 300)}`).catch(() => `${r.status()}`)); };
            page.on('response', onResp);
            o.chooseResult = await sel.selectOption({label: choose}).catch((e) => `select failed: ${flat(e.message, 150)}`);
            await idle(page).catch(() => {}); await sleep(500);
            o.selectAfterChoose = await readSel();
            const save = panel.getByRole('button', {name: 'Save', exact: true}).first();
            await loc(page, 'Appearance › Theme: Save', save);
            await save.click();
            o.saved = await page.locator('[role="status"]').filter({hasText: 'Saved'}).first().waitFor({timeout: 15000}).then(() => true).catch(() => false);
            await idle(page).catch(() => {}); await sleep(800);
            page.off('response', onResp);
            o.traffic = await Promise.all(traffic);
            o.fieldErrors = (await panel.locator('.pkpFieldError').allInnerTexts().catch(() => [])).map((t) => flat(t, 200));
            o.selectAfterSave = await readSel();
            await snap(page, `${name}-saved`, o);
            // The same tab after a reload.
            await go(page, `/index.php/${app.contextPath}/management/settings/website`);
            await page.locator('#appearance-button').first().click().catch(() => {}); await idle(page).catch(() => {});
            await page.locator('#theme-button').first().click().catch(() => {}); await idle(page).catch(() => {});
            await sleep(600);
            o.selectAfterReload = await readSel();
            await snap(page, `${name}-reloaded`, {select: o.selectAfterReload});
        }
        return o;
    };

    /** A request the Frame checks directly, sent from a page of the role's session with its CSRF token. */
    const api = async (method, url, body) => page.evaluate(async ({method, url, body}) => {
        const res = await fetch(url, {method, headers: {'Content-Type': 'application/json', 'X-Csrf-Token': (window.pkp && window.pkp.currentUser && window.pkp.currentUser.csrfToken) || ''}, body: body ? JSON.stringify(body) : undefined});
        return {status: res.status, body: (await res.text()).slice(0, 500)};
    }, {method, url, body}).catch((e) => ({error: flat(e.message, 200)}));
    const backOffice = async (u) => { await go(page, u); return page.evaluate(() => !!(window.pkp && window.pkp.currentUser && window.pkp.currentUser.csrfToken)).catch(() => false); };
    const ctxTheme = `/index.php/${app.contextPath}/api/v1/contexts/${ctxId}/theme`;
    const siteTheme = '/index.php/index/api/v1/site/theme';
    const NOSUCH = `${product.replace(/theme$/, '')}nosuchtheme`;

    /** The U10 row's requests as the role signed in now; `site` adds the site route (admin). */
    const apiSet = async (label, {site = false} = {}) => {
        const o = {};
        o.token = await backOffice(`/index.php/${app.contextPath}/management/settings/website`);
        let from = slog.mark();
        o.ctxGet = await api('GET', ctxTheme);
        o.ctxPutMissing = await api('PUT', ctxTheme, {themePluginPath: NOSUCH});
        o.ctxLog = slog.since(from).map((l) => flat(l, 400)).slice(0, 8);
        o.dbAfterCtx = db();
        if (site) {
            o.siteToken = await backOffice('/index.php/index/admin');
            from = slog.mark();
            o.siteGet = await api('GET', siteTheme);
            o.sitePutMissing = await api('PUT', siteTheme, {themePluginPath: NOSUCH});
            o.siteGetAfter = await api('GET', siteTheme);
            o.siteLog = slog.since(from).map((l) => flat(l, 400)).slice(0, 8);
            o.dbAfterSite = db();
        }
        fact(`api-${label}`, o);
        return o;
    };

    /** Delete a row through its arrow › "Delete" › "OK" (Site Administrator). */
    const deleteRow = async (id) => {
        const o = {};
        const row = G.rowLoc(page, id);
        o.listedBefore = await row.count() > 0;
        if (!o.listedBefore) return o;
        if (await row.locator('a.show_extras').count()) { await row.locator('a.show_extras').first().click(); await sleep(400); }
        const del = row.locator('xpath=following-sibling::tr[1]').locator('a[id*="-delete-button"]').first();
        o.linkText = flat(await del.innerText().catch(() => null), 40);
        await del.click();
        const dlg = page.locator('[role="dialog"]:visible').last();
        await dlg.waitFor({timeout: T}).catch(() => {});
        o.window = flat(await dlg.innerText().catch(() => ''), 300);
        await dlg.getByRole('button', {name: 'OK', exact: true}).click();
        o.toast = await G.readToast(page, 8000);
        await idle(page).catch(() => {}); await sleep(800);
        o.listedAfter = await G.rowLoc(page, id).count() > 0;
        return o;
    };

    /** "Upload A New Plugin" with the package (Site Administrator). */
    const upload = async (file) => {
        const o = {};
        const link = page.locator(G.GRID).first().locator('a[id*="-upload-button"]').first();
        o.linkText = flat(await link.innerText().catch(() => null), 80);
        await link.click();
        const dlg = page.locator('[role="dialog"]:visible').filter({has: page.locator('input[type=file]')}).last();
        await dlg.waitFor({timeout: T});
        await idle(page).catch(() => {});
        await dlg.locator('input[type=file]').first().setInputFiles(file);
        const tf = dlg.locator('input[name=temporaryFileId]');
        const end = Date.now() + 20000;
        while (Date.now() < end && !(await tf.inputValue().catch(() => ''))) await sleep(200);
        o.uploaded = !!(await tf.inputValue().catch(() => ''));
        await dlg.locator('button[type=submit], button.submitFormButton').first().click();
        o.toast = await G.readToast(page, 10000);
        await idle(page).catch(() => {}); await sleep(800);
        o.windowOpen = await dlg.isVisible().catch(() => false);
        return o;
    };

    const pkg = buildTheme(outDir(), {appName: app.name, appRoot: root, product, displayName});
    try {
        if (on('theme')) {
            // 0. The home page before anything (Default Theme).
            fact('home-0-before', await both('i23b-00-home-before'));
            // 1. admin installs the theme: Settings › Website › Plugins › "Upload A New Plugin".
            await as('admin');
            fact('open-admin', await G.openWebsitePlugins(page, app, app.contextPath));
            fact('upload', await upload(pkg));
            await G.openWebsitePlugins(page, app, app.contextPath);
            fact('row-after-upload', G.findRow(await G.readGrid(page), N.id));
            await snap(page, 'i23b-01-installed');
            fact('db-1-installed', {db: db(), folder: themeFolder(root, product)});
            await out();
            // 2. The manager ticks it, chooses it in Appearance › Theme and saves.
            await as('rvaca');
            await G.openWebsitePlugins(page, app, app.contextPath);
            fact('enable', await G.pressBox(page, N.id));
            await snap(page, 'i23b-02-enabled');
            fact('choose-theme', await themeTab('i23b-03-appearance-choose', displayName));
            fact('db-3-chosen', db());
            fact('home-3-chosen', await both('i23b-03-home-chosen'));
            // 3. The manager unticks it: the "Disable" window's "OK".
            await G.openWebsitePlugins(page, app, app.contextPath);
            fact('disable', await G.pressBox(page, N.id, {answer: 'OK'}));
            await snap(page, 'i23b-04-disabled');
            fact('db-4-disabled', db());
            fact('home-4-disabled', await both('i23b-04-home-disabled'));
            fact('appearance-4-disabled', await themeTab('i23b-04-appearance-disabled'));
            if (on('api')) await apiSet('disabled-manager');
            await out();
            // 4. admin deletes it.
            await as('admin');
            await G.openWebsitePlugins(page, app, app.contextPath);
            fact('delete', await deleteRow(N.id));
            await snap(page, 'i23b-05-deleted');
            fact('db-5-deleted', {db: db(), folder: themeFolder(root, product), git: gitPlugins()});
            fact('home-5-deleted', await both('i23b-05-home-deleted'));
            if (on('api')) await apiSet('deleted-admin', {site: true});
            fact('appearance-5-deleted-admin', await themeTab('i23b-05-appearance-deleted-admin'));
            // 5. Administration › "Delete Template Cache" alone.
            await go(page, '/index.php/index/admin');
            await snap(page, 'i23b-06-admin');
            // The button reads "Delete Template Cache" on main and stable-3_5_0 alike (the brief named it "Clear Template Cache").
            const clear = page.getByRole('button', {name: /^(Clear|Delete) Template Cache$/}).first();
            await loc(page, 'Administration: "Delete Template Cache" ', clear);
            fact('clear-label', flat(await clear.innerText().catch(() => null), 60));
            const d0 = dialogs.length;
            await clear.click().catch((e) => fact('clear-error', flat(e.message, 200)));
            await page.waitForLoadState('load').catch(() => {}); await idle(page).catch(() => {}); await sleep(800);
            fact('clear-cache', {dialogs: dialogs.slice(d0), url: rel(page.url()), toast: await G.readToast(page, 3000)});
            await snap(page, 'i23b-06-cleared');
            fact('db-6-cleared', db());
            fact('home-6-cleared', await both('i23b-06-home-cleared'));
            await out();
            // 6. The manager: Appearance › Theme, "Default Theme", Save.
            await as('rvaca');
            if (on('api')) await apiSet('deleted-manager');
            fact('choose-default', await themeTab('i23b-07-appearance-default', 'Default Theme'));
            fact('db-7-default', db());
            fact('home-7-default', await both('i23b-07-home-default'));
            await out();
        }
        if (on('site')) {
            // The site's own theme: a second journal shows the site's "Plugins" and "Appearance" tabs; "Default
            // Theme" unticked on the site's list leaves the site's stored theme switched off.
            const o = {};
            const p2 = `${product.replace(/theme$/, '')}j2`;
            o.second = await app.api.createContext({tag: p2, context: {name: `U62 I23B second ${RUN}`, acronym: 'I23B2'}}).then((r) => flat(JSON.stringify(r), 200)).catch((e) => `createContext failed: ${flat(e.message, 200)}`);
            await as('admin');
            await go(page, '/index.php/index/admin/settings');
            o.siteTabs = await G.tabStrips(page);
            const pt = page.locator('#plugins-button').first();
            o.pluginsTab = await pt.count() > 0;
            await snap(page, 'i23b-10-site-settings', o);
            if (o.pluginsTab) {
                await pt.click(); await idle(page).catch(() => {});
                await page.locator(G.GRID).first().locator('tr.gridRow').first().waitFor({timeout: T}).catch(() => {});
                await sleep(400);
                o.defaultRow = G.findRow(await G.readGrid(page), 'defaultthemeplugin');
                o.untick = await G.pressBox(page, 'defaultthemeplugin', {answer: 'OK'});
                await snap(page, 'i23b-11-site-default-unticked', {untick: o.untick});
                o.db = db();
                o.siteToken = await backOffice('/index.php/index/admin');
                let from = slog.mark();
                o.siteGet = await api('GET', siteTheme);
                o.sitePutSame = null;
                o.sitePutMissing = await api('PUT', siteTheme, {themePluginPath: NOSUCH});
                o.siteLog = slog.since(from).map((l) => flat(l, 400)).slice(0, 8);
                o.dbAfterPut = db();
                // The site's Appearance › Theme tab as offered now.
                await go(page, '/index.php/index/admin/settings');
                await page.locator('#appearance-button').first().click().catch(() => {}); await idle(page).catch(() => {});
                await page.locator('#theme-button').first().click().catch(() => {}); await idle(page).catch(() => {});
                await sleep(600);
                o.siteThemeSelect = await page.locator('[role="tabpanel"]#theme select').first().evaluate((s) => ({value: s.value, options: [...s.options].map((x) => `${x.text.trim()}=${x.value}${x.selected ? '*' : ''}`)})).catch((e) => ({error: flat(e.message, 120)}));
                await snap(page, 'i23b-12-site-appearance', {select: o.siteThemeSelect});
                from = slog.mark();
                o.siteIndexOut = await go(visitor.page, '/index.php/index');
                o.siteIndexText = flat(await visitor.page.locator('body').innerText().catch(() => ''), 300);
                o.siteIndexLog = slog.since(from).map((l) => flat(l, 400)).slice(0, 8);
                await snap(visitor.page, 'i23b-12-site-index-out', {status: o.siteIndexOut});
                // Tick it again, and read the route once more.
                await go(page, '/index.php/index/admin/settings');
                await page.locator('#plugins-button').first().click(); await idle(page).catch(() => {});
                await page.locator(G.GRID).first().locator('tr.gridRow').first().waitFor({timeout: T}).catch(() => {});
                await sleep(400);
                o.retick = await G.pressBox(page, 'defaultthemeplugin');
                await backOffice('/index.php/index/admin');
                o.siteGetRestored = await api('GET', siteTheme);
                o.dbRestored = db();
            }
            fact('site', o);
            await out();
        }
    } finally {
        fact('dialogs', dialogs);
        await visitor.close().catch(() => {});
        await close();
        const removed = removeThemeFolder(root, product);
        fact('after', {removedByScript: removed, folder: themeFolder(root, product), git: gitPlugins(), db: db()});
    }
});
