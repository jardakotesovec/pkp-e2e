// Kept walk of docs/issues/U10-A23-theme-api-refusal-raw-placeholder.md (U10 A23): while the journal's
// theme ("Default Theme") is switched off on its Plugins list, the programming interface's read of the
// journal's theme is refused with "The active theme, {$themePluginPath}, …", the theme's name never filled in.
//
// Runs on a dataset fleet (PKP's default dataset, context `publicknowledge`), reset before each walk:
//   npm run fleet-prep -- --feature issues-q23h --dataset 2 --reset
//   bin/app-lock.sh shared ojs -- env PROBE_FEATURE=issues-q23h PROBE_AGENT=q23h \
//     node bin/probe.js ojs shared/playwright/checks/issues/theme-api-refusal-raw-placeholder/walk.js
//   (omp, ops alike; stable-3_5_0: PKP_E2E_LINE=stable-3_5_0 PROBE_FEATURE=issues-q23h-3_5 PROBE_RUN=r35)
// MODE=steps (default) takes the report's Steps: `rvaca` unticks "Default Theme" on Settings › Website ›
//   "Plugins" ("Disable" › "OK"), opens the read's address in the same browser, then `admin` opens it too.
// MODE=neighbour, on a freshly reset fleet: the same address as `rvaca` and `admin` with the theme switched on
//   (must stay 200 with the theme's options and its folder name).
// No assertions: the script records, the reader judges (facts in a23-<mode>[-<run>]-<app>.json).
const {forEachApp, launch, signIn, signOut, screen, shot, record, idle, sql, serverLog} = require('../../../probe');

const MODE = process.env.MODE || 'steps';
const flat = (s, n = 600) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const CTX = {ojs: ['journals', 'journal_id', 'journal_settings'], omp: ['presses', 'press_id', 'press_settings'], ops: ['servers', 'server_id', 'server_settings']};

forEachApp(async (app) => {
    const {WebsitePluginsPage} = require('../../../pages/PluginsPages.js');
    const [table, idCol, settings] = CTX[app.name];
    const ctxId = Number(sql(app, `SELECT ${idCol} FROM ${table} WHERE path='${app.contextPath}'`));
    const stored = () => ({
        themePluginPath: sql(app, `SELECT setting_value FROM ${settings} WHERE ${idCol}=${ctxId} AND setting_name='themePluginPath'`),
        defaultEnabled: sql(app, `SELECT context_id||':'||setting_value FROM plugin_settings WHERE plugin_name='defaultthemeplugin' AND setting_name='enabled' ORDER BY context_id`).split('\n').filter(Boolean),
    });
    const facts = {mode: MODE, line: app.line || 'main', ctxId, before: stored()};
    const fact = (k, v) => { facts[k] = v; console.log(`[a23 ${app.name}] ${k}`, flat(JSON.stringify(v), 700)); };
    const slog = serverLog(app);
    const address = `/index.php/${app.contextPath}/api/v1/contexts/${ctxId}/theme`;
    const {page, close} = await launch(app);

    /** Open the read's address in this browser tab, as a person would type it. */
    const openRead = async (name) => {
        const from = slog.mark();
        let status = null;
        try { const r = await page.goto(app.url(address)); status = r && r.status(); } catch (e) { status = flat(e.message, 150); }
        await sleep(300);
        const body = flat(await page.locator('body').innerText().catch(() => ''), 800);
        const o = {address, status, body, log: slog.since(from).map((l) => flat(l, 400)).slice(0, 6)};
        record(`a23-${name}`, {...(await screen(page).catch((e) => ({screenError: flat(e.message, 200)}))), ...o});
        await shot(page, `a23-${name}`).catch(() => {});
        return o;
    };

    try {
        if (MODE === 'steps') {
            // 1. rvaca, the Journal manager, signs in on the journal's login page.
            await signIn(page, 'rvaca', {contextPath: app.contextPath});
            await idle(page).catch(() => {});
            fact('control-before-untick', await openRead('0-read-theme-on'));
            // 2. Settings › Website › "Plugins": untick "Default Theme", "OK" in the "Disable" window.
            const plugins = new WebsitePluginsPage(page, app.contextPath);
            const untick = {};
            try {
                await plugins.goto();
                const win = await plugins.list.pressTicked('defaultthemeplugin');
                untick.window = flat(await win.innerText().catch(() => ''), 200);
                const r = await plugins.list.confirmDisable('defaultthemeplugin');
                untick.disable = r.status();
                await sleep(500);
                untick.notices = flat(await page.locator('.app__notifications, .pkp_notification, #pkpNotificationsContainer, .pkpNotification').allInnerTexts().catch(() => []).then((a) => a.join(' | ')), 300);
            } catch (e) { untick.error = flat(e.message, 300); }
            record('a23-2-unticked', await screen(page).catch(() => ({})));
            await shot(page, 'a23-2-unticked').catch(() => {});
            fact('untick', {...untick, stored: stored()});
            // 3. The read's address in the same browser.
            fact('read-manager', await openRead('3-read-manager'));
            // 4. admin, the Site Administrator, opens the same address.
            await signOut(page).catch(() => {});
            await signIn(page, 'admin', {contextPath: app.contextPath});
            await idle(page).catch(() => {});
            fact('read-admin', await openRead('4-read-admin'));
            fact('after', stored());
        } else {
            // Neighbour: the theme switched on. The read must answer 200 with the theme's options for both users.
            await signIn(page, 'rvaca', {contextPath: app.contextPath});
            await idle(page).catch(() => {});
            fact('nb-read-manager', await openRead('nb-read-manager'));
            await signOut(page).catch(() => {});
            await signIn(page, 'admin', {contextPath: app.contextPath});
            await idle(page).catch(() => {});
            fact('nb-read-admin', await openRead('nb-read-admin'));
            fact('after', stored());
        }
    } finally {
        record('a23-' + MODE, facts);
        await close();
    }
});
