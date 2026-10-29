// Issue report walk: docs/issues/U12-A22-site-announcement-picture-breaks-site-pages.md
// (spec U12 register A22). Takes the report's Steps through the screens on a
// dataset fleet (PKP's default test dataset, harness.md "Dataset fleets"),
// signed in as the dataset's `admin`: a second journal (press, server) made
// on screen so the Site Settings show the "Announcements" tab, the site's
// announcements turned on with "Display on Homepage" 3, one site
// announcement with a picture, then the site's public pages signed out, the
// context's home page, and signing in again. The kit builds nothing. Fact
// keys carry the report's step numbers; every step records the server log
// lines it caused. Helpers and the picture sit beside this file (lib.js,
// photo.png). Reset the fleet before each walk.
//
// MODE=walk (default) Steps 1–10, then the Control: a site announcement
//                     without a picture added, and its page and the
//                     site's home page read signed out.
// MODE=neighbour      the fix's neighbour, which runs alone: a journal's
//                     (press's, server's) own announcement with a picture,
//                     as its manager `rvaca` (announcements on, "Display on
//                     Homepage" 3, "Add Announcement" with photo.png), then
//                     the context's home page, Announcements page and the
//                     announcement's page signed out: the picture must
//                     still be printed from the context's folder and load.
//
// Run (main, then stable-3_5_0; the trial under PROBE_RUN fix, nb-in, nb-out):
//   npm run fleet-prep -- --feature <feature> --dataset <n> --reset
//   PROBE_FEATURE=<feature> PROBE_AGENT=walk node bin/probe.js all shared/playwright/checks/issues/site-announcement-picture-breaks-site-pages/walk.js
//   PKP_E2E_LINE=stable-3_5_0 npm run fleet-prep -- --feature <feature>-3_5 --dataset <n> --reset
//   PKP_E2E_LINE=stable-3_5_0 PROBE_RUN=r35 PROBE_FEATURE=<feature>-3_5 PROBE_AGENT=walk node bin/probe.js all shared/playwright/checks/issues/site-announcement-picture-breaks-site-pages/walk.js
const {forEachApp, launch, signIn, signOut, screen, record, sql, serverLog} = require('../../../probe');
const L = require('./lib.js');

const MODE = process.env.MODE || 'walk';
const RUN = process.env.PROBE_RUN || 'main';

forEachApp(async (app) => {
    if (!app.dataset) throw new Error('walk.js drives a dataset fleet (fleet-prep --dataset n --reset)');
    const facts = {mode: MODE, run: RUN, line: app.line || 'main'};
    const fact = (k, v) => { facts[k] = v; console.log(`[${app.name}] ${k}: ${JSON.stringify(v).slice(0, 700)}`); };
    const key = `a22-${MODE}`;
    const log = serverLog(app);
    const {page, close} = await launch(app);
    let n = 0;
    const snap = async (name) => record(`${key}-${String(++n).padStart(2, '0')}-${name}`, await screen(page));
    const step = async (label, fn) => {
        const from = log.mark();
        let v;
        try { v = await fn(); fact(label, v); } catch (e) { fact(label, {threw: String(e.message || e).split('\n')[0]}); }
        const lines = log.since(from).filter((l) => !/PluginGallery|plugins\.xml/.test(l)).map((l) => l.slice(0, 400));
        if (lines.length) fact(`${label} server log`, lines);
        return v;
    };
    const contexts = () => sql(app, `SELECT path FROM ${app.contextTables.table} ORDER BY ${app.contextTables.id}`).split('\n').filter(Boolean);
    // Sign in, recording the answer of the page the sign-in lands on.
    const signInLanding = async (user) => {
        const docs = [];
        const onResp = (r) => { if (r.request().isNavigationRequest() && r.frame() === page.mainFrame()) docs.push({url: L.rel(r.url()), status: r.status()}); };
        page.on('response', onResp);
        try {
            await signIn(page, user).catch((e) => docs.push({signInThrew: String(e.message || e).split('\n')[0]}));
            return {landed: L.rel(page.url()), navigations: docs.slice(-3)};
        } finally {
            page.off('response', onResp);
        }
    };
    try {
        if (MODE === 'neighbour') await neighbour();
        else await walk();
    } finally {
        record(`${key}-facts-${RUN}`, facts);
        await close();
    }

    /** The report's Steps, then the Control. */
    async function walk() {
        await step('1 sign in as admin', () => signInLanding('admin'));
        fact('2 contexts before', contexts());
        if (contexts().length < 2) {
            await step('2 Create a second journal (press, server) "h29d Second"', () =>
                L.createContext(page, app, {name: 'h29d Second', initials: 'H29D', path: 'h29dsecond', email: 'h29dsecond@mailinator.com'}));
        }
        fact('2 contexts after', contexts());
        await step('3 Site Settings › Announcements › Settings: Enable announcements, Display on Homepage 3, Save', () => L.enableSiteAnnouncements(app, page, 3));
        fact('3 site_settings', sql(app, "SELECT setting_name, setting_value FROM site_settings WHERE setting_name IN ('enableAnnouncements','numAnnouncementsHomepage') ORDER BY 1"));
        L.useSiteScope(true);
        await step('4 Site Settings › Announcements › Announcements (after a reload)', () => L.openSiteAnnouncements(app, page));
        const a = await step('4 Add Announcement "h29d Site notice" with photo.png', () =>
            L.addAnnouncement(page, {title: 'h29d Site notice', picture: L.PICTURES.png}));
        const id = a && a.id;
        fact('4 stored', L.storedImage(app, sql, id));
        fact('4 site folder', L.listFolder(L.announcementsFolder(app, 'site'), id));
        await snap('site-list-after-add');
        await step('5 sign out', async () => { await signOut(page); return true; });
        const pages = [
            ['6 site home page', '/index.php/index'],
            ['7 site Announcements page', '/index.php/index/announcement'],
            ['8 the announcement\'s page', `/index.php/index/announcement/view/${id}`],
            [`9 ${app.contextPath}'s home page`, `/index.php/${app.contextPath}`],
        ];
        for (const [label, address] of pages) {
            await step(label, () => L.visitPublic(app, page, address));
            await snap(label.replace(/[^a-z0-9]+/gi, '-').toLowerCase());
        }
        await step('10 sign in as admin again', () => signInLanding('admin'));
        await snap('after-sign-in');

        // Control: a site announcement without a picture.
        const c = await step('C1 Add Announcement "h29d Site plain" (no picture)', async () => {
            await L.openSiteAnnouncements(app, page);
            return L.addAnnouncement(page, {title: 'h29d Site plain', picture: null});
        });
        await step('C2 sign out', async () => { await signOut(page); return true; });
        if (c && c.id) await step('C3 the plain announcement\'s page', () => L.visitPublic(app, page, `/index.php/index/announcement/view/${c.id}`));
        await step('C4 site home page (the plain one newest)', () => L.visitPublic(app, page, '/index.php/index'));
        await step('C5 site Announcements page', () => L.visitPublic(app, page, '/index.php/index/announcement'));
        L.useSiteScope(false);
    }

    /** The neighbour: a context's own announcement with a picture. */
    async function neighbour() {
        await step('N1 sign in as rvaca', () => signInLanding('rvaca'));
        await step('N2 Website › Setup › Announcements: Enable announcements, Display on Homepage 3, Save', () => L.enableAnnouncements(app, page, 3));
        await step('N3 Announcements from the side menu', () => L.openAnnouncementsFromMenu(app, page));
        const title = `h29d ${RUN} Journal notice`;
        const a = await step(`N4 Add Announcement "${title}" with photo.png`, () => L.addAnnouncement(page, {title, picture: L.PICTURES.png}));
        const id = a && a.id;
        const contextId = Number(sql(app, `SELECT ${app.contextTables.id} FROM ${app.contextTables.table} WHERE path = '${app.contextPath}'`));
        fact('N4 stored', L.storedImage(app, sql, id));
        fact('N4 context folder', L.listFolder(L.announcementsFolder(app, contextId), id));
        await step('N5 sign out', async () => { await signOut(page); return true; });
        for (const [label, address] of [
            [`N6 ${app.contextPath}'s home page`, `/index.php/${app.contextPath}`],
            [`N7 ${app.contextPath}'s Announcements page`, `/index.php/${app.contextPath}/announcement`],
            ['N8 the announcement\'s page', `/index.php/${app.contextPath}/announcement/view/${id}`],
        ]) {
            await step(label, () => L.visitPublic(app, page, address));
            await snap(label.replace(/[^a-z0-9]+/gi, '-').toLowerCase());
        }
    }
});
