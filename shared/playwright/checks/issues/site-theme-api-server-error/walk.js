// Kept walk of docs/issues/U10-A24-site-theme-api-server-error.md (U10 A24): while "Default Theme" is
// switched off on the site's own Plugins list, the programming interface's read of the site's theme
// (`GET index/api/v1/site/theme`) fails with a server error instead of a refusal.
//
// Runs on a dataset fleet (PKP's default dataset), reset before each walk:
//   npm run fleet-prep -- --feature issues-q23h --dataset 2 --reset
//   bin/app-lock.sh shared ojs -- env PROBE_FEATURE=issues-q23h PROBE_AGENT=q23h \
//     node bin/probe.js ojs shared/playwright/checks/issues/site-theme-api-server-error/walk.js
//   (omp, ops alike; stable-3_5_0: PKP_E2E_LINE=stable-3_5_0 PROBE_FEATURE=issues-q23h-3_5 PROBE_RUN=r35)
// MODE=steps (default) takes the report's Steps: `admin` creates a second journal (press, server) on
//   Administration › Hosted Journals › "Create Journal" (the site's Plugins list shows only with two), unticks
//   "Default Theme" on Administration › Site Settings › "Plugins", opens the read's address, ticks the theme
//   again and opens the address once more.
// MODE=neighbour, on a freshly reset fleet: the site's read with the theme switched on (must stay 200 with
//   the site's options), and the journal's read (`…/api/v1/contexts/1/theme`) as `admin`, also 200.
// No assertions: the script records, the reader judges (facts in a24-<mode>[-<run>]-<app>.json).
const {forEachApp, launch, signIn, screen, shot, record, idle, sql, serverLog} = require('../../../probe');
const {createContext, WORDS} = require('./lib');

const MODE = process.env.MODE || 'steps';
const flat = (s, n = 600) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const CTX = {ojs: ['journals', 'journal_id'], omp: ['presses', 'press_id'], ops: ['servers', 'server_id']};

forEachApp(async (app) => {
    const {SitePluginsPage} = require('../../../pages/PluginsPages.js');
    const [table, idCol] = CTX[app.name];
    const stored = () => ({
        siteTheme: sql(app, `SELECT setting_value FROM site_settings WHERE setting_name='themePluginPath'`),
        defaultEnabled: sql(app, `SELECT context_id||':'||setting_value FROM plugin_settings WHERE plugin_name='defaultthemeplugin' AND setting_name='enabled' ORDER BY context_id`).split('\n').filter(Boolean),
        contexts: sql(app, `SELECT ${idCol}||':'||path FROM ${table} ORDER BY ${idCol}`).split('\n').filter(Boolean),
    });
    const facts = {mode: MODE, line: app.line || 'main', before: stored()};
    const fact = (k, v) => { facts[k] = v; console.log(`[a24 ${app.name}] ${k}`, flat(JSON.stringify(v), 700)); };
    const slog = serverLog(app);
    const siteAddress = '/index.php/index/api/v1/site/theme';
    const {page, close} = await launch(app);

    /** Open an address in this browser tab, as a person would type it; status, body, server log since. */
    const openRead = async (name, address = siteAddress) => {
        const from = slog.mark();
        let status = null;
        try { const r = await page.goto(app.url(address)); status = r && r.status(); } catch (e) { status = flat(e.message, 150); }
        await sleep(500);
        const body = flat(await page.locator('body').innerText().catch(() => ''), 800);
        const o = {address, status, body, log: slog.since(from).map((l) => flat(l, 500)).slice(0, 6)};
        record(`a24-${name}`, {...(await screen(page).catch((e) => ({screenError: flat(e.message, 200)}))), ...o});
        await shot(page, `a24-${name}`).catch(() => {});
        return o;
    };
    /** Administration › Site Settings › "Plugins", then press "Default Theme"'s box ("OK" when the "Disable" window asks). */
    const pressDefault = async (name, untick) => {
        const o = {};
        try {
            const plugins = new SitePluginsPage(page);
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
        record(`a24-${name}`, await screen(page).catch(() => ({})));
        await shot(page, `a24-${name}`).catch(() => {});
        return {...o, stored: stored()};
    };

    try {
        // 1. admin signs in.
        await signIn(page, 'admin');
        await idle(page).catch(() => {});
        if (MODE === 'steps') {
            // 2. Administration › Hosted Journals › "Create Journal": a second context, so the site's lists show.
            const name = `hkq23h Second ${WORDS[app.name].noun}`;
            let created;
            try { created = await createContext(page, app, {name, initials: 'HKQ23H', path: 'hkq23h', email: 'hkq23h@mailinator.com'}); } catch (e) { created = `failed: ${flat(e.message, 300)}`; }
            fact('create-context', {name, save: created, contexts: stored().contexts});
            // 3. Administration › Site Settings › "Plugins": untick "Default Theme", "OK".
            fact('untick', await pressDefault('3-site-default-unticked', true));
            // 4. The read's address.
            fact('read-site-off', await openRead('4-read-site-off'));
            // 5. Tick it again, open the address once more.
            fact('retick', await pressDefault('5-site-default-ticked', false));
            fact('read-site-on', await openRead('5-read-site-on'));
        } else {
            fact('nb-read-site', await openRead('nb-read-site'));
            fact('nb-read-journal', await openRead('nb-read-journal', `/index.php/${app.contextPath}/api/v1/contexts/1/theme`));
        }
        fact('after', stored());
    } finally {
        record('a24-' + MODE, facts);
        await close();
    }
});
