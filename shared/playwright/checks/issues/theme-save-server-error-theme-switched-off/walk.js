// Kept walk of docs/issues/U10-A26-theme-save-server-error-theme-switched-off.md (U10 A26): while the theme in
// use ("Default Theme") is unticked, "Save" under Appearance › "Theme" fails with a server error, on the
// journal's (press's, server's) Settings › Website and on the site's Administration › "Site Settings".
//
// Runs on a dataset fleet (PKP's default dataset), reset before each walk:
//   npm run fleet-prep -- --feature <feature> --dataset <n> --reset
//   bin/app-lock.sh shared ojs -- env PROBE_FEATURE=<feature> PROBE_AGENT=<id> \
//     node bin/probe.js ojs shared/playwright/checks/issues/theme-save-server-error-theme-switched-off/walk.js
//   (omp, ops alike; stable-3_5_0: PKP_E2E_LINE=stable-3_5_0 PROBE_FEATURE=<feature>-3_5 PROBE_RUN=r35)
// MODE=steps (default) takes the report's Steps: `rvaca` unticks "Default Theme" on Settings › Website ›
//   "Plugins", opens "Appearance" › "Theme" and presses "Save", ticks the theme again and saves once more;
//   then `admin` creates a second journal (press, server) on Administration › Hosted Journals › "Create
//   Journal" (the site's "Appearance" and "Plugins" tabs show only with two), unticks "Default Theme" on
//   Administration › Site Settings › "Plugins", opens the site's "Appearance" › "Theme" and presses "Save",
//   ticks it again and saves once more. TAG names the created context (default hkq27a).
// MODE=neighbour, on a freshly reset fleet, the theme ticked throughout: `rvaca` changes "Typography" on the
//   journal's "Theme" tab and saves; `admin` creates the second context and changes the site's "Typography"
//   and saves. Both must stay "Saved" with the new value stored (the fix must not refuse an ordinary save).
// No assertions: the script records, the reader judges (facts in a26-<mode>[-<run>]-<app>.json).
const {forEachApp, launch, signIn, signOut, screen, shot, record, idle, sql, serverLog} = require('../../../probe');
const {WORDS, flat, sleep, createContext, themeForm, readThemeForm, saveTheme, openContextTheme, openSiteTheme} = require('./lib');

const MODE = process.env.MODE || 'steps';
const TAG = process.env.TAG || 'hkq27a';

forEachApp(async (app) => {
    const {WebsitePluginsPage, SitePluginsPage} = require('../../../pages/PluginsPages.js');
    const {table, id: idCol, settings} = app.contextTables;
    const stored = () => ({
        contextTheme: sql(app, `SELECT setting_value FROM ${settings} WHERE ${idCol}=1 AND setting_name='themePluginPath'`),
        siteTheme: sql(app, `SELECT setting_value FROM site_settings WHERE setting_name='themePluginPath'`),
        defaultEnabled: sql(app, `SELECT COALESCE(context_id::text,'site')||':'||setting_value FROM plugin_settings WHERE plugin_name='defaultthemeplugin' AND setting_name='enabled' ORDER BY context_id`).split('\n').filter(Boolean),
        typography: sql(app, `SELECT COALESCE(context_id::text,'site')||':'||setting_value FROM plugin_settings WHERE plugin_name='defaultthemeplugin' AND setting_name='typography' ORDER BY context_id`).split('\n').filter(Boolean),
        contexts: sql(app, `SELECT ${idCol}||':'||path FROM ${table} ORDER BY ${idCol}`).split('\n').filter(Boolean),
    });
    const facts = {mode: MODE, line: app.line || 'main', before: stored()};
    const fact = (k, v) => { facts[k] = v; console.log(`[a26 ${app.name}] ${k}`, flat(JSON.stringify(v), 900)); };
    const slog = serverLog(app);
    const {page, close} = await launch(app);

    const snap = async (name) => {
        record(`a26-${name}`, await screen(page).catch((e) => ({screenError: flat(e.message, 200)})));
        await shot(page, `a26-${name}`).catch(() => {});
    };

    /** A plugins list (the context's or the site's): press "Default Theme"'s box ("OK" when the "Disable" window asks). */
    const pressDefault = async (name, plugins, untick) => {
        const o = {};
        try {
            await plugins.goto();
            if (untick) {
                const win = await plugins.list.pressTicked('defaultthemeplugin');
                o.window = flat(await win.innerText().catch(() => ''), 200);
                o.request = (await plugins.list.confirmDisable('defaultthemeplugin')).status();
            } else {
                o.request = (await plugins.list.tick('defaultthemeplugin')).status();
            }
            await sleep(500);
            o.notices = flat(await page.locator('.app__notifications, .pkp_notification, #pkpNotificationsContainer, .pkpNotification').allInnerTexts().catch(() => []).then((a) => a.join(' | ')), 300);
        } catch (e) { o.error = flat(e.message, 300); }
        await snap(name);
        return {...o, stored: stored()};
    };

    /** Open a "Theme" tab, read what it offers, press "Save", read what follows and the server log. */
    const themeSave = async (name, open) => {
        const o = {};
        try {
            await open();
            o.offers = await readThemeForm(page);
            await snap(`${name}-open`);
            const from = slog.mark();
            o.save = await saveTheme(page);
            o.log = slog.since(from).map((l) => flat(l, 400)).slice(0, 4);
            await snap(`${name}-saved`);
        } catch (e) { o.error = flat(e.message, 300); }
        return {...o, stored: stored()};
    };

    /** Choose another "Typography" on the open "Theme" tab; the value chosen. */
    const chooseTypography = async () => {
        const radios = themeForm(page).locator('input[name="typography"]');
        const n = await radios.count();
        for (let i = 0; i < n; i++) {
            if (!(await radios.nth(i).isChecked())) {
                await radios.nth(i).check();
                return radios.nth(i).getAttribute('value');
            }
        }
        return null;
    };

    const ctxPlugins = new WebsitePluginsPage(page, app.contextPath);
    const sitePlugins = new SitePluginsPage(page);
    const secondContext = async () => {
        const name = `${TAG} Second ${WORDS[app.name].noun}`;
        let created;
        try { created = await createContext(page, app, {name, initials: TAG.toUpperCase(), path: TAG, email: `${TAG}@mailinator.com`}); } catch (e) { created = `failed: ${flat(e.message, 300)}`; }
        return {name, save: created, contexts: stored().contexts};
    };

    try {
        if (MODE === 'steps') {
            // Journal (press, server). 1. rvaca signs in on the context's login page.
            await signIn(page, 'rvaca', {contextPath: app.contextPath});
            await idle(page).catch(() => {});
            // 2. Settings › Website › "Plugins": untick "Default Theme", "OK".
            fact('2-ctx-untick', await pressDefault('2-ctx-untick', ctxPlugins, true));
            // 3.–4. "Appearance" › "Theme", "Save".
            fact('4-ctx-save-off', await themeSave('4-ctx-save-off', () => openContextTheme(page, app)));
            // 5. Tick it again; "Theme" › "Save" (control).
            fact('5-ctx-retick', await pressDefault('5-ctx-retick', ctxPlugins, false));
            fact('5-ctx-save-on', await themeSave('5-ctx-save-on', () => openContextTheme(page, app)));
            // Site. 6. Sign out, sign in as admin.
            await signOut(page).catch(() => {});
            await signIn(page, 'admin');
            await idle(page).catch(() => {});
            // 7. A second journal (press, server).
            fact('7-create-context', await secondContext());
            // 8. Site Settings › "Plugins": untick "Default Theme", "OK".
            fact('8-site-untick', await pressDefault('8-site-untick', sitePlugins, true));
            // 9. Site Settings › "Appearance" › "Theme", "Save".
            fact('9-site-save-off', await themeSave('9-site-save-off', () => openSiteTheme(page)));
            // 10. Tick it again; "Theme" › "Save" (control).
            fact('10-site-retick', await pressDefault('10-site-retick', sitePlugins, false));
            fact('10-site-save-on', await themeSave('10-site-save-on', () => openSiteTheme(page)));
        } else {
            await signIn(page, 'rvaca', {contextPath: app.contextPath});
            await idle(page).catch(() => {});
            let chosen;
            fact('nb-ctx-save', await themeSave('nb-ctx-save', async () => { await openContextTheme(page, app); chosen = await chooseTypography(); }));
            fact('nb-ctx-chosen', chosen);
            await signOut(page).catch(() => {});
            await signIn(page, 'admin');
            await idle(page).catch(() => {});
            fact('nb-create-context', await secondContext());
            fact('nb-site-save', await themeSave('nb-site-save', async () => { await openSiteTheme(page); chosen = await chooseTypography(); }));
            fact('nb-site-chosen', chosen);
        }
        fact('after', stored());
    } finally {
        record('a26-' + MODE, facts);
        await close();
    }
});
