// U05 A15 issue walk (docs/specs/U05-notifications-center-and-email-preferences.md#a15):
// on a journal whose "Forms" languages include one other than the page's
// language, the reader-side header's name loses its unread count.
//
//   steps 1–4: on the default dataset (French under "Forms"), as `dbarnes`:
//              the "Tasks" number on the dashboard, then the name on the
//              journal's home page in English.
//   steps 5–7: Settings › Website › "Setup" › "Languages": untick French
//              "Forms"; the home page in English (control), then in French.
//   neighbour  (WALK_MODE=nb, alone): on the default dataset, `dbuskins`
//              (Section editor) keeps the bare name (the role gate), and
//              `dbarnes`'s "Dashboard" entry keeps its number.
//
// Run (fleet reset first, harness.md "Dataset fleets"):
//   PROBE_FEATURE=issues-h21g PROBE_AGENT=h21g node bin/probe.js all \
//     shared/playwright/checks/issues/unread-count-gone-with-french-forms/walk.js
//   WALK_MODE=nb PROBE_RUN=nb-in … (the neighbour alone)
const {forEachApp, launch, signIn, signOut, screen, shot, record} = require('../../../probe');
const L = require('./lib');

const MODE = process.env.WALK_MODE || 'steps';

forEachApp(async (app) => {
    const {JournalLanguagesTab} = require('../../../pages/LanguagesPages.js');
    const ctx = app.contextPath;
    const out = {app: app.name, line: app.line || 'main', mode: MODE};
    const fact = (k, v) => { out[k] = v; record(`facts-${MODE}`, out); };
    const snap = async (page, name) => { record(name, await screen(page)); await shot(page, name).catch(() => {}); };
    const home = (loc) => app.url(`/index.php/${ctx}/${loc}`);

    const {page} = await launch(app);
    try {
        if (MODE === 'steps') {
            // 1. Sign in as dbarnes at the journal's login; the dashboard opens.
            await signIn(page, 'dbarnes', {contextPath: ctx});
            await page.waitForLoadState('load').catch(() => {});
            // 2. The number on "Tasks".
            fact('step2-bell', await L.bellCount(page).catch((e) => ({error: L.flat(e.message)})));
            fact('step1-landed', page.url());
            // 3–4. The journal's home page, the name at the top right.
            await L.open(page, home('en'));
            fact('step4-name', await L.userNav(page));
            await snap(page, 'step4-home-en');

            // 5. Settings › Website › "Setup" › "Languages": untick French "Forms".
            const tab = new JournalLanguagesTab(page, ctx, {locale: 'en'});
            await tab.goto();
            try {
                const r = await tab.pressWebsite('fr_CA', 'formLocale');
                fact('step5-untick', {status: r.response.status(), alerts: r.alerts});
            } catch (e) {
                fact('step5-untick', {error: L.flat(e.message)});
            }
            await snap(page, 'step5-languages');
            // 6. The home page in English again (control).
            await L.open(page, home('en'));
            fact('step6-name', await L.userNav(page));
            await snap(page, 'step6-home-en');
            // 7. The home page in French.
            await L.open(page, home('fr_CA'));
            fact('step7-name', await L.userNav(page));
            await snap(page, 'step7-home-fr');
        } else {
            // Neighbour: the role gate and the "Dashboard" entry, on the default dataset.
            await signIn(page, 'dbarnes', {contextPath: ctx});
            await page.waitForLoadState('load').catch(() => {});
            fact('nb-dbarnes-bell', await L.bellCount(page).catch((e) => ({error: L.flat(e.message)})));
            await L.open(page, home('en'));
            fact('nb-dbarnes-name', await L.userNav(page));
            await snap(page, 'nb-dbarnes-home');
            await signOut(page);
            await signIn(page, 'dbuskins', {contextPath: ctx});
            await page.waitForLoadState('load').catch(() => {});
            fact('nb-dbuskins-bell', await L.bellCount(page).catch((e) => ({error: L.flat(e.message)})));
            await L.open(page, home('en'));
            fact('nb-dbuskins-name', await L.userNav(page));
            await snap(page, 'nb-dbuskins-home');
        }
    } catch (e) {
        fact('error', L.flat(e.stack, 1500));
        await snap(page, `error-${MODE}`).catch(() => {});
    }
});
