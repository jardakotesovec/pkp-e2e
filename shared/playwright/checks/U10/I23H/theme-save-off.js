// Claim check U10 I23H (housekeeping 2026-10-23): Appearance › "Theme" › "Save" while the theme in use
// ("Default Theme") is unticked on the Plugins list, on the site (as `admin`, with a second context
// created on screen so the site's Appearance and Plugins tabs show) and on the journal (press, server)
// as its manager `rvaca` and as `admin`; then "Default Theme" ticked again and the pages read styled.
//
// Runs on a dataset fleet (PKP's default dataset), freshly reset; one process per app and run:
//   npm run fleet-prep -- --feature issues-cc23h --dataset 6 --reset
//   bin/app-lock.sh shared ojs -- env PROBE_FEATURE=issues-cc23h PKP_E2E_DATASET=6 PROBE_NOTES_FEATURE=U10 \
//     PROBE_AGENT=cc23h PROBE_RUN=r1 node bin/probe.js ojs shared/playwright/checks/U10/I23H/theme-save-off.js
//   (omp, ops alike; PROBE_RUN=r2 for the second run after another reset)
//   stable-3_5_0: PKP_E2E_LINE=stable-3_5_0 PROBE_FEATURE=issues-cc23h-3_5 PKP_E2E_DATASET=6 PROBE_RUN=s1|s2
//   (fleet reset: PKP_E2E_LINE=stable-3_5_0 npm run fleet-prep -- --feature issues-cc23h-3_5 --dataset 6 --reset)
// No other script, file or env part. No assertions: the script records (i23h-<step>-<run>-<app>.json/png,
// facts in i23h-facts-<run>-<app>.json), the reader judges.
const {forEachApp, launch, signIn, signOut, screen, shot, record, idle, sql, serverLog, tag, outFile} = require('../../../probe');

const flat = (s, n = 600) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const WORDS = {
    ojs: {noun: 'Journal', hosted: 'Hosted Journals', table: 'Journals', create: 'Create Journal'},
    omp: {noun: 'Press', hosted: 'Hosted Presses', table: 'Presses', create: 'Create Press'},
    ops: {noun: 'Server', hosted: 'Hosted Servers', table: 'Servers', create: 'Create Server'},
};

forEachApp(async (app) => {
    const {SitePluginsPage, WebsitePluginsPage} = require('../../../pages/PluginsPages.js');
    const {SiteSettingsPage} = require('../../../pages/SiteSettingsPages.js');
    const {HostedJournalsPage} = require('../../../pages/HostedJournalsPages.js');
    const {table, id: idCol, settings} = app.contextTables;
    const ctxPath = app.contextPath;
    const stored = () => ({
        site: sql(app, `SELECT coalesce(string_agg(setting_value, ','), '<none>') FROM site_settings WHERE setting_name='themePluginPath'`),
        ctx: sql(app, `SELECT coalesce(string_agg(setting_value, ','), '<none>') FROM ${settings} s JOIN ${table} c ON c.${idCol}=s.${idCol} WHERE c.path='${ctxPath}' AND s.setting_name='themePluginPath'`),
        enabled: sql(app, `SELECT context_id||':'||setting_value FROM plugin_settings WHERE plugin_name='defaultthemeplugin' AND setting_name='enabled' ORDER BY context_id`).split('\n').filter(Boolean),
    });
    const facts = {line: app.line || 'main', run: process.env.PROBE_RUN || '', before: stored()};
    const fact = (k, v) => { facts[k] = v; console.log(`[i23h ${app.name}] ${k}`, flat(JSON.stringify(v), 900)); };
    const slog = serverLog(app);
    const {page, close} = await launch(app);
    const dialogs = [];
    page.on('dialog', async (d) => { dialogs.push(`${d.type()}: ${flat(d.message(), 200)}`); await d.accept().catch(() => {}); });

    const snap = async (name, extra = {}) => {
        const s = await screen(page).catch((e) => ({screenError: flat(e.message, 200)}));
        record(`i23h-${name}`, {...s, ...extra});
        await shot(page, `i23h-${name}`).catch(() => {});
        return s;
    };

    /** The Theme tab: the site's Administration › Site Settings › Appearance › Theme, or the context's Settings › Website › Appearance › Theme. */
    const openTheme = async (where) => {
        if (where === 'site') {
            const site = new SiteSettingsPage(page);
            await site.goto();
            await site.open('Appearance', 'Theme');
        } else {
            await page.goto(app.url(`/index.php/${ctxPath}/en/management/settings/website`));
            await idle(page).catch(() => {});
            await page.locator('#appearance-button').first().click().catch(() => {});
            await page.locator('#theme-button').first().click().catch(() => {});
        }
        await idle(page).catch(() => {});
        await sleep(800);
        const panel = page.locator('[role="tabpanel"]#theme').first();
        const select = await panel.locator('select').first().evaluate((s) => ({name: s.name, value: s.value, options: [...s.options].map((x) => `${x.text.trim()}=${x.value}${x.selected ? '*' : ''}`)})).catch((e) => flat(e.message, 120));
        const fields = await panel.locator('label, legend').allInnerTexts().then((a) => a.map((t) => flat(t, 60))).catch(() => []);
        return {panel, select, fields, panelText: flat(await panel.innerText().catch(() => ''), 400)};
    };

    /** Press the Theme tab's "Save": the request, its status and body, the page's message, the log, the stored theme; then a reload. */
    const saveTheme = async (where, name) => {
        const t = await openTheme(where);
        const o = {before: {select: t.select, fields: t.fields, panelText: t.panelText}};
        await snap(`${name}-before`, o.before);
        const traffic = [];
        const onResp = (r) => {
            if (!/\/api\/v1\//.test(r.url()) || r.request().method() === 'GET') return;
            traffic.push(r.text().then((b) => ({method: r.request().method(), override: r.request().headers()['x-http-method-override'] || '', url: r.url().replace(/^https?:\/\/[^/]+/, ''), status: r.status(), body: flat(b, 250), sent: flat(r.request().postData(), 250)})).catch(() => ({status: r.status(), url: r.url()})));
        };
        page.on('response', onResp);
        const from = slog.mark();
        const d0 = dialogs.length;
        await t.panel.getByRole('button', {name: 'Save', exact: true}).first().click({timeout: 15000}).catch((e) => { o.clickError = flat(e.message, 120); });
        await sleep(1200);
        o.instantPanelText = flat(await t.panel.innerText().catch(() => ''), 300);
        await sleep(1500); await idle(page).catch(() => {});
        page.off('response', onResp);
        o.traffic = await Promise.all(traffic);
        o.log = slog.since(from).map((l) => flat(l, 320)).slice(0, 6);
        o.dialogs = dialogs.slice(d0);
        o.fieldErrors = await t.panel.locator('.pkpFormFieldError, .pkpFormField__error, [id$="-error"]').allInnerTexts().then((a) => a.map((x) => flat(x, 150)).filter(Boolean)).catch(() => []);
        const after = await snap(`${name}-after`, o);
        o.notices = after.notices;
        o.panelText = flat(await t.panel.innerText().catch(() => ''), 300);
        o.stored = stored();
        const t2 = await openTheme(where);
        o.afterReload = {select: t2.select, fields: t2.fields, panelText: t2.panelText};
        await snap(`${name}-reload`, o.afterReload);
        fact(`save-${name}`, o);
        return o;
    };

    /** A public page: status, its style sheets, the header's colour and the body's font, the log since. */
    const publicPage = async (name, address) => {
        const from = slog.mark();
        const r = await page.goto(app.url(address)).catch((e) => ({status: () => flat(e.message, 120)}));
        await idle(page).catch(() => {});
        const o = {address, status: r && r.status()};
        o.sheets = await page.locator('link[rel="stylesheet"]').evaluateAll((ls) => ls.map((l) => l.getAttribute('href').replace(/^https?:\/\/[^/]+/, ''))).catch(() => []);
        o.look = await page.evaluate(() => {
            const h = document.querySelector('.pkp_structure_head');
            return {head: h ? getComputedStyle(h).backgroundColor : null, bodyFont: getComputedStyle(document.body).fontFamily, bodyText: (document.body.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 200)};
        }).catch((e) => flat(e.message, 120));
        o.log = slog.since(from).map((l) => flat(l, 300)).slice(0, 4);
        await snap(name, o);
        fact(name, o);
        return o;
    };

    /** A site-level page in a fresh, signed-out browser (the site's own theme; the dataset's site index redirects to its journal). */
    const visitorPage = async (name, address) => {
        const ctx = await page.context().browser().newContext({viewport: {width: 1280, height: 900}});
        const p = await ctx.newPage();
        const from = slog.mark();
        const o = {address};
        try {
            const r = await p.goto(app.url(address));
            o.status = r && r.status();
            await p.waitForLoadState('networkidle', {timeout: 15000}).catch(() => {});
            o.url = p.url().replace(/^https?:\/\/[^/]+/, '');
            o.sheets = await p.locator('link[rel="stylesheet"]').evaluateAll((ls) => ls.map((l) => l.getAttribute('href').replace(/^https?:\/\/[^/]+/, ''))).catch(() => []);
            o.look = await p.evaluate(() => {
                const h = document.querySelector('.pkp_structure_head');
                return {head: h ? getComputedStyle(h).backgroundColor : null, bodyFont: getComputedStyle(document.body).fontFamily, bodyText: (document.body.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 200)};
            }).catch((e) => flat(e.message, 120));
            o.log = slog.since(from).map((l) => flat(l, 300)).slice(0, 4);
            await p.screenshot({path: outFile(`i23h-${name}.png`), fullPage: true}).catch(() => {});
        } catch (e) { o.error = flat(e.message, 200); } finally { await ctx.close().catch(() => {}); }
        record(`i23h-${name}`, o);
        fact(name, o);
        return o;
    };

    /** The site's or the context's Plugins list: untick ("Disable" window, "OK") or tick "Default Theme". */
    const pressDefault = async (where, untick, name) => {
        const o = {};
        const p = where === 'site' ? new SitePluginsPage(page) : new WebsitePluginsPage(page, ctxPath);
        await p.goto();
        if (untick) {
            const win = await p.list.pressTicked('defaultthemeplugin');
            o.window = flat(await win.innerText().catch(() => ''), 200);
            o.status = (await p.list.confirmDisable('defaultthemeplugin')).status();
        } else {
            o.status = (await p.list.tick('defaultthemeplugin')).status();
        }
        await sleep(400);
        const s = await snap(name, o);
        o.notices = s.notices;
        o.stored = stored();
        fact(name, o);
    };

    try {
        // 1. admin: a second context, created on screen (the site's Appearance and Plugins show with two).
        await signIn(page, 'admin');
        await idle(page).catch(() => {});
        const t = tag('u10i23h');
        {
            const hosted = new HostedJournalsPage(page, WORDS[app.name]);
            await page.goto(app.url('/index.php/index/en/admin/contexts'));
            await hosted.expectOpen();
            const win = await hosted.openCreate();
            await win.type(win.title('en'), `${t} Second ${WORDS[app.name].noun}`);
            await win.type(win.initials('en'), 'U10I23H');
            await win.type(win.contactName, `${t} contact`);
            await win.type(win.contactEmail, `${t}@mailinator.com`);
            await win.country.selectOption({label: 'Canada'});
            await win.type(win.path, t);
            if (await win.languageBox('en').count()) await win.setBox(win.languageBox('en'), true);
            if (await win.primaryChoice('en').count()) await win.setBox(win.primaryChoice('en'), true);
            const r = await win.pressSave();
            await page.waitForURL(/\/admin\/wizard\/\d+/, {timeout: 30000}).catch(() => {});
            fact('create', {path: t, status: r.status(), url: page.url().replace(/^https?:\/\/[^/]+/, '')});
        }

        // 2. The site: control read, "Default Theme" unticked, the site's index and the journal's home, the Theme save.
        await publicPage('site-home-on', '/index.php/index');
        await visitorPage('site-login-on', '/index.php/index/en/login');
        await pressDefault('site', true, 'site-untick');
        await publicPage('site-home-off', '/index.php/index');
        await visitorPage('site-login-off', '/index.php/index/en/login');
        await publicPage('ctx-home-siteoff', `/index.php/${ctxPath}`);
        await signIn(page, 'admin');
        await saveTheme('site', 'site-save-off');

        // 3. The site: ticked again, the index styled, the Theme tab, a control save.
        await pressDefault('site', false, 'site-tick');
        await publicPage('site-home-reon', '/index.php/index');
        await visitorPage('site-login-reon', '/index.php/index/en/login');
        await saveTheme('site', 'site-save-on');

        // 4. The journal (press, server) as its manager: unticked, home page, Theme save.
        await signOut(page).catch(() => {});
        await signIn(page, 'rvaca', {contextPath: ctxPath});
        await pressDefault('ctx', true, 'ctx-untick');
        await publicPage('ctx-home-off', `/index.php/${ctxPath}`);
        await visitorPage('ctx-home-off-visitor', `/index.php/${ctxPath}`);
        await signIn(page, 'rvaca', {contextPath: ctxPath});
        await saveTheme('ctx', 'ctx-save-off-rvaca');

        // 5. The same save as admin (Site Administrator, also the journal's manager in the dataset).
        await signOut(page).catch(() => {});
        await signIn(page, 'admin');
        await saveTheme('ctx', 'ctx-save-off-admin');

        // 6. Back to rvaca: ticked again, home page styled, the Theme tab, an unsaved change left by reload, a control save.
        await signOut(page).catch(() => {});
        await signIn(page, 'rvaca', {contextPath: ctxPath});
        await pressDefault('ctx', false, 'ctx-tick');
        await publicPage('ctx-home-reon', `/index.php/${ctxPath}`);
        await visitorPage('ctx-home-reon-visitor', `/index.php/${ctxPath}`);
        await signIn(page, 'rvaca', {contextPath: ctxPath});
        {
            const th = await openTheme('ctx');
            const hex = th.panel.locator('input[aria-labelledby^="input__label__hex"]').first();
            const was = await hex.inputValue().catch(() => null);
            const d0 = dialogs.length;
            await hex.fill('#AA3311').catch(() => {});
            await hex.press('Enter').catch(() => {});
            await sleep(300);
            await page.reload().catch((e) => fact('leaveError', flat(e.message, 120)));
            const th2 = await openTheme('ctx');
            const now = await th2.panel.locator('input[aria-labelledby^="input__label__hex"]').first().inputValue().catch(() => null);
            await snap('ctx-leave-unsaved', {was, now, dialogs: dialogs.slice(d0)});
            fact('leave-unsaved', {was, typed: '#AA3311', afterReload: now, dialogs: dialogs.slice(d0), select: th2.select});
        }
        await saveTheme('ctx', 'ctx-save-on');
        // Screen notes for this drive were written once by hand (.reports/U10/screen-notes.md, cc23h); a re-run adds none.
    } catch (e) {
        fact('error', flat(e.stack || e.message, 600));
    } finally {
        facts.after = stored();
        facts.dialogs = dialogs;
        record('i23h-facts', facts);
        await close();
    }
});
