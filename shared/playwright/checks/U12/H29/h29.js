// Claim check U12 H29 (incidentals row: a site announcement with a picture
// on the site's public pages). Drives a dataset fleet (PKP's default test
// dataset, harness.md "Dataset fleets"), signed in as the dataset's `admin`:
//
//   1. a second journal (press, server) `cc29bsecond`, made on screen in
//      Administration › Hosted Journals › "Create Journal" when the site
//      hosts only one, so the Site Settings show the "Announcements" tab;
//   2. Site Settings › Announcements › Settings: "Enable announcements"
//      ticked, "Display on Homepage" 3, "Save";
//   3. Site Settings › Announcements › Announcements: "Add Announcement"
//      twice, `cc29b <run> plain` (no picture, the control) and
//      `cc29b <run> picture` (a PNG in "Image");
//   4. signed out, then signed in as `admin`: the site's home page
//      (`/index.php/index`), the site's Announcements page
//      (`/index.php/index/announcement`) and each announcement's own page
//      (`…/announcement/view/{id}`): status, server log lines since the
//      visit, the pictures the page printed (src, loaded or broken) and the
//      answer to each picture request the browser made;
//   5. sweep: Site Settings › Announcements › Settings left with "Display on
//      Homepage" changed and unsaved (the browser's questions on the way out);
//   7. order: the home page prints only its newest announcement in full: a
//      newest one with a picture, then a newer one without, each followed by
//      the home page and the Announcements page signed out.
//
// PART=all (default) runs 1–7; PART=order runs 1 and 7 alone (after a
// PART=all run on the fleet).
//
// Idempotent on one fleet: the second journal and the settings are made
// only when missing, the titles carry PROBE_RUN. No other script or file is
// read. Run (main: wrap each app in the shared app lock; 3.5 takes none):
//   npm run fleet-prep -- --feature issues-cc29b --dataset 5 --reset
//   bin/app-lock.sh shared ojs -- env PROBE_NOTES_FEATURE=U12 PROBE_FEATURE=issues-cc29b PKP_E2E_DATASET=5 PROBE_AGENT=cc29b PROBE_RUN=r1 node bin/probe.js ojs shared/playwright/checks/U12/H29/h29.js
//   (then omp, ops; then PROBE_RUN=r2; then PART=order with PROBE_RUN=r3, r4)
//   PKP_E2E_LINE=stable-3_5_0 npm run fleet-prep -- --feature issues-cc29b-3_5 --dataset 5 --reset
//   PKP_E2E_LINE=stable-3_5_0 PROBE_NOTES_FEATURE=U12 PROBE_FEATURE=issues-cc29b-3_5 PKP_E2E_DATASET=5 PROBE_AGENT=cc29b PROBE_RUN=s1 node bin/probe.js all shared/playwright/checks/U12/H29/h29.js
//   (then PROBE_RUN=s2; then PART=order with PROBE_RUN=s3, s4)
const {forEachApp, launch, signIn, signOut, screen, shot, record, sql, serverLog, idle, loc} = require('../../../probe');

const T = 30_000;
const RUN = process.env.PROBE_RUN || 'r0';
const PART = process.env.PART || 'all';
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (s, n = 300) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));
const rel = (u) => (u ? String(u).replace(/^https?:\/\/[^/]+/, '') : u);
// A 1×1 PNG, uploaded as `cc29b.png`.
const PNG = {name: 'cc29b.png', mimeType: 'image/png',
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==', 'base64')};
const WORDS = {
    ojs: {noun: 'Journal', hosted: 'Hosted Journals', table: 'Journals', create: 'Create Journal'},
    omp: {noun: 'Press', hosted: 'Hosted Presses', table: 'Presses', create: 'Create Press'},
    ops: {noun: 'Server', hosted: 'Hosted Servers', table: 'Servers', create: 'Create Server'},
};
const SECOND = 'cc29bsecond';

forEachApp(async (app) => {
    if (!app.dataset) throw new Error('h29.js drives a dataset fleet (fleet-prep --dataset n --reset)');
    const facts = {run: RUN, line: app.line || 'main'};
    const fact = (k, v) => { facts[k] = v; console.log(`[${app.name}] ${k}: ${JSON.stringify(v).slice(0, 600)}`); };
    const log = serverLog(app);
    const {page, close} = await launch(app);
    const pictures = [];
    page.on('response', (r) => { if (/\/announcements\/\d+\.\w+/.test(r.url())) pictures.push({url: rel(r.url()), status: r.status()}); });
    page.on('requestfailed', (r) => { if (/\/announcements\/\d+\.\w+/.test(r.url())) pictures.push({url: rel(r.url()), failed: r.failure() && r.failure().errorText}); });
    let n = 0;
    const snap = async (name, extra = {}) => record(`h29-${String(++n).padStart(2, '0')}-${name}`, {...(await screen(page)), ...extra});
    const step = async (label, fn) => {
        const from = log.mark();
        let v;
        try { v = await fn(); fact(label, v); } catch (e) { fact(label, {threw: flat(e.message || e, 300)}); }
        const lines = log.since(from).filter((l) => !/PluginGallery|plugins\.xml/.test(l)).map((l) => l.slice(0, 400));
        if (lines.length) fact(`${label} server log`, lines);
        return v;
    };
    const contexts = () => sql(app, `SELECT path FROM ${app.contextTables.table} ORDER BY ${app.contextTables.id}`).split('\n').filter(Boolean);
    const siteRows = () => sql(app, "SELECT a.announcement_id, s.setting_value FROM announcements a LEFT JOIN announcement_settings s ON s.announcement_id = a.announcement_id AND s.setting_name = 'image' WHERE a.assoc_id IS NULL ORDER BY 1").split('\n').filter(Boolean);
    const openList = async () => {
        await page.goto(app.url('/index.php/index/en/admin/settings'));
        await idle(page).catch(() => {});
        await page.locator('#announcements-button').click();
        await page.locator('#announcements #announcement-items-button').click();
        const panel = page.locator('#announcements [role="tabpanel"]:visible .listPanel').first();
        await panel.waitFor({state: 'visible', timeout: T});
        await idle(page).catch(() => {});
        return panel;
    };
    let panel = null;
    const add = async (title, picture) => {
        panel = await openList();
        await panel.getByRole('button', {name: 'Add Announcement', exact: true}).click();
        const dialog = page.getByRole('dialog', {name: 'Add Announcement'});
        await dialog.getByRole('button', {name: 'Save', exact: true}).waitFor({state: 'visible', timeout: T});
        await dialog.locator('input[name="title-en"]').fill(title);
        let upload = null;
        if (picture) {
            const field = dialog.locator('.pkpFormField--uploadImage').first();
            const up = page.waitForResponse((r) => /temporaryFiles/.test(r.url()) && r.request().method() === 'POST', {timeout: T}).catch(() => null);
            await field.locator('input[type=file]').first().setInputFiles(picture);
            const r = await up;
            await idle(page).catch(() => {});
            await pause(800);
            upload = r ? r.status() : null;
        }
        const resp = page.waitForResponse((x) => /\/api\/v1\/announcements$/.test(x.url()) && x.request().method() === 'POST', {timeout: T}).catch(() => null);
        await dialog.getByRole('button', {name: 'Save', exact: true}).click();
        const r = await resp;
        await dialog.waitFor({state: 'hidden', timeout: 8000}).catch(() => {});
        await idle(page).catch(() => {});
        await pause(800);
        const row = panel.locator('.listPanel__item').filter({has: page.locator('.listPanel__itemTitle', {hasText: title})}).first();
        const href = await row.getByRole('link', {name: 'View', exact: true}).getAttribute('href', {timeout: 8000}).catch(() => null);
        const m = (href || '').match(/\/announcement\/view\/(\d+)/);
        return {title, upload, save: r ? r.status() : null, dialogOpen: await dialog.isVisible().catch(() => false), id: m ? Number(m[1]) : null, view: rel(href)};
    };
    const visit = async (who, key, address) => {
        pictures.length = 0;
        const from = log.mark();
        const res = await page.goto(app.url(address)).catch((e) => ({error: flat(e.message)}));
        await idle(page).catch(() => {});
        await pause(500);
        const imgs = await page.locator('img').evaluateAll((els) => els
            .filter((e) => /announcement/.test(e.className) || /\/announcements\//.test(e.getAttribute('src') || ''))
            .map((e) => ({cls: e.className, src: e.getAttribute('src'), alt: e.getAttribute('alt'), loaded: e.complete && e.naturalWidth > 0}))).catch(() => []);
        const lines = log.since(from).filter((l) => !/PluginGallery|plugins\.xml/.test(l)).map((l) => l.slice(0, 400));
        const out = {address, status: res && res.status ? res.status() : res, landed: rel(page.url()),
            heading: flat(await page.locator('h1, h2').first().innerText({timeout: 3000}).catch(() => null), 120),
            announcementTitles: (await page.locator('.obj_announcement_summary h2, .obj_announcement_summary h3, .obj_announcement_full h1').allInnerTexts().catch(() => [])).map((s) => flat(s, 80)),
            images: imgs, pictureRequests: [...pictures], serverLog: lines};
        fact(`5 ${who} ${key}`, out);
        await snap(`${who}-${key}`, {visit: out});
        await shot(page, `h29-${who}-${key}`);
        return out;
    };
    try {
        await step('1 sign in as admin', async () => { await signIn(page, 'admin'); return true; });
        fact('1 landed after sign-in', rel(page.url()));
        if (PART === 'all') await full();
        await order();
    } finally {
        record(`h29-${PART}-facts`, facts);
        await close();
    }

    /** Steps 2–6. */
    async function full() {
        fact('contexts before', contexts());
        if (contexts().length < 2) {
            await step(`2 Create ${WORDS[app.name].noun} "${SECOND}"`, async () => {
                const {HostedJournalsPage} = require('../../../pages/HostedJournalsPages.js');
                const hosted = new HostedJournalsPage(page, WORDS[app.name]);
                await page.goto(app.url('/index.php/index/en/admin/contexts'));
                await hosted.expectOpen();
                const win = await hosted.openCreate();
                await win.type(win.title('en'), 'cc29b Second');
                await win.type(win.initials('en'), 'CC29B');
                await win.type(win.contactName, 'cc29b Second');
                await win.type(win.contactEmail, 'cc29bsecond@mailinator.com');
                await win.country.selectOption({label: 'Canada'});
                await win.type(win.path, SECOND);
                if (await win.languageBox('en').count()) {
                    await win.setBox(win.languageBox('en'), true);
                    await win.setBox(win.primaryChoice('en'), true);
                }
                await win.setBox(win.enableBox, true);
                const r = await win.pressSave();
                await page.waitForURL(/\/admin\/wizard\/\d+/, {timeout: T}).catch(() => {});
                return {status: r.status(), landed: rel(page.url())};
            });
        }
        fact('contexts after', contexts());

        // Site Settings › Announcements › Settings
        await page.goto(app.url('/index.php/index/en/admin/settings'));
        await idle(page).catch(() => {});
        const top = page.locator('#announcements-button');
        await top.waitFor({state: 'visible', timeout: T});
        await loc(page, 'Site Settings: the "Announcements" top tab', top);
        await top.click();
        await page.locator('#announcements').getByRole('tab', {name: 'Settings', exact: true}).first().click();
        const form = page.locator('#announcement-settings');
        const box = form.getByRole('checkbox', {name: 'Enable announcements', exact: true});
        await box.waitFor({state: 'visible', timeout: T});
        const homeInput = form.locator('input[name=numAnnouncementsHomepage]').first();
        await snap('site-settings-before');
        await step('3 Enable announcements, Display on Homepage 3, Save', async () => {
            const before = {ticked: await box.isChecked(), display: await homeInput.inputValue().catch(() => null)};
            await box.check();
            await homeInput.fill('3');
            await form.getByRole('button', {name: 'Save', exact: true}).click();
            const saved = await form.locator('[role="status"]').filter({hasText: 'Saved'}).first()
                .waitFor({state: 'visible', timeout: T}).then(() => true, () => false);
            return {before, saved};
        });
        await snap('site-settings-saved');
        fact('3 site_settings', sql(app, "SELECT setting_name, setting_value FROM site_settings WHERE setting_name IN ('enableAnnouncements','numAnnouncementsHomepage') ORDER BY 1"));

        // Site Settings › Announcements › Announcements (after a reload, Rule 16)
        panel = await openList();
        const plain = await step(`4 Add Announcement "cc29b ${RUN} plain"`, () => add(`cc29b ${RUN} plain`, null));
        const pic = await step(`4 Add Announcement "cc29b ${RUN} picture" with cc29b.png`, () => add(`cc29b ${RUN} picture`, PNG));
        panel = await openList();
        await snap('site-list-after-add', {rows: await panel.locator('.listPanel__itemTitle').allInnerTexts().catch(() => [])});
        fact('4 site announcements (id | image)', siteRows());

        // The public pages, as a visitor and as admin.
        const pages = [['home', '/index.php/index'], ['list', '/index.php/index/announcement']];
        if (plain && plain.id) pages.push(['view-plain', `/index.php/index/announcement/view/${plain.id}`]);
        if (pic && pic.id) pages.push(['view-picture', `/index.php/index/announcement/view/${pic.id}`]);
        await signOut(page);
        for (const [k, a] of pages) await visit('visitor', k, a);
        await signIn(page, 'admin');
        for (const [k, a] of pages) await visit('admin', k, a);

        // Sweep: leave the Settings side tab with "Display on Homepage" changed and unsaved.
        await step('6 Settings: Display on Homepage 5 unsaved, then the Announcements side tab, then a new address', async () => {
            const dialogs = [];
            const onDialog = async (d) => { dialogs.push({type: d.type(), message: d.message()}); await d.dismiss().catch(() => {}); };
            page.on('dialog', onDialog);
            await page.goto(app.url('/index.php/index/en/admin/settings'));
            await idle(page).catch(() => {});
            await page.locator('#announcements-button').click();
            await page.locator('#announcements').getByRole('tab', {name: 'Settings', exact: true}).first().click();
            await homeInput.waitFor({state: 'visible', timeout: T});
            await homeInput.fill('5');
            await page.locator('#announcements #announcement-items-button').click();
            await pause(1000);
            const sideSwitch = {dialogs: [...dialogs], panel: flat(await page.locator('#announcements [role="tabpanel"]:visible').first().innerText().catch(() => ''), 200)};
            await page.locator('#announcements').getByRole('tab', {name: 'Settings', exact: true}).first().click();
            const back = await homeInput.inputValue().catch(() => null);
            await page.goto(app.url('/index.php/index/en/admin/contexts')).catch((e) => dialogs.push({gotoError: flat(e.message)}));
            await idle(page).catch(() => {});
            await pause(1000);
            page.off('dialog', onDialog);
            const stored = sql(app, "SELECT setting_value FROM site_settings WHERE setting_name = 'numAnnouncementsHomepage'");
            return {sideSwitch, valueBackOnSettings: back, landed: rel(page.url()), dialogs, storedAfterLeaving: stored};
        });
        await snap('after-leave-unsaved');
    }

    /**
     * 7: the home page shows its first (newest) announcement in full and the
     * next ones as titles: add a newest one with a picture, read the home page
     * and the Announcements page signed out; then a newer one without, and
     * read them again.
     */
    async function order() {
        if (contexts().length < 2 || !/^1/.test(sql(app, "SELECT setting_value FROM site_settings WHERE setting_name = 'enableAnnouncements'"))) {
            fact('7 skipped', 'run PART=all first: the site needs a second context and its announcements on');
            return;
        }
        await step(`7a Add Announcement "cc29b ${RUN} newest picture" with cc29b.png`, () => add(`cc29b ${RUN} newest picture`, PNG));
        await signOut(page);
        await visit('order-picture-newest', 'home', '/index.php/index');
        await visit('order-picture-newest', 'list', '/index.php/index/announcement');
        await signIn(page, 'admin');
        await step(`7b Add Announcement "cc29b ${RUN} newest plain"`, () => add(`cc29b ${RUN} newest plain`, null));
        await signOut(page);
        await visit('order-plain-newest', 'home', '/index.php/index');
        await visit('order-plain-newest', 'list', '/index.php/index/announcement');
        fact('7 site announcements (id | image)', siteRows());
    }
});
