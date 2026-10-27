// Issue report walk: docs/issues/U12-A21-refused-picture-edit-breaks-announcement-picture.md
// (spec U12 register A21). Takes the report's Steps through the screens on a
// dataset fleet (PKP's default test dataset, harness.md "Dataset fleets"),
// signed in as the dataset's manager `rvaca` on `publicknowledge`: the kit
// builds nothing; announcements are turned on and the announcement is added
// on screen. No screen shows the stored `image` setting or the public files
// folder, so the walk reads `announcement_settings` and lists
// `public/journals|presses|contexts/<id>/announcements/` beside the screens.
// Every step records the server log lines it caused. Fact keys carry the
// report's step numbers. Reset the fleet before each walk. Helpers and the
// pictures sit beside this file (lib.js, photo.png, renamed.jpg = the same
// PNG named .jpg, photo.gif).
//
// MODE=walk (default) the Steps (1-12).
// MODE=neighbour      what the fix must leave alone, run alone on a reset
//                     fleet: an accepted replacement (photo.gif) saves and
//                     shows (N3); a title-only edit keeps the picture (N4);
//                     "Add Announcement" with renamed.jpg is refused and
//                     adds nothing (N5); a refused edit, then "Restore
//                     Original" in the same panel, then "Save" puts the
//                     picture back (N6, N7).
//
// Run (main, then stable-3_5_0):
//   npm run fleet-prep -- --feature <feature> --dataset <n> --reset
//   PROBE_FEATURE=<feature> PROBE_AGENT=walk node bin/probe.js all shared/playwright/checks/issues/refused-picture-edit-breaks-announcement-picture/walk.js
//   PKP_E2E_LINE=stable-3_5_0 npm run fleet-prep -- --feature <feature>-3_5 --dataset <n> --reset
//   PKP_E2E_LINE=stable-3_5_0 PROBE_RUN=r35 PROBE_FEATURE=<feature>-3_5 PROBE_AGENT=walk node bin/probe.js all shared/playwright/checks/issues/refused-picture-edit-breaks-announcement-picture/walk.js
const {forEachApp, launch, signIn, screen, shot, record, sql, serverLog} = require('../../../probe');
const L = require('./lib.js');

const MODE = process.env.MODE || 'walk';

forEachApp(async (app) => {
    if (!app.dataset) throw new Error('walk.js drives a dataset fleet (fleet-prep --dataset n --reset)');
    const facts = {mode: MODE, line: app.line || 'main'};
    const fact = (k, v) => { facts[k] = v; console.log(`[${app.name} ${facts.line}] ${k}: ${JSON.stringify(v).slice(0, 600)}`); };
    const key = `a21-${MODE}`;
    const contextId = Number(sql(app, `SELECT ${app.contextTables.id} FROM ${app.contextTables.table} WHERE path = '${app.contextPath}'`));
    const folder = L.announcementsFolder(app, contextId);
    fact('folder', folder);
    const log = serverLog(app);
    const {page, close} = await launch(app);
    let n = 0;
    const snap = async (name) => record(`${key}-${String(++n).padStart(2, '0')}-${name}`, await screen(page));
    const step = async (label, fn) => {
        const from = log.mark();
        let v;
        try { v = await fn(); fact(label, v); } catch (e) { fact(label, {threw: String(e.message || e).split('\n')[0]}); }
        const lines = log.since(from).filter((l) => !/PluginGallery|plugins\.xml/.test(l)).map((l) => l.slice(0, 300));
        if (lines.length) fact(`${label} server log`, lines);
        return v;
    };
    const view = (id) => `/index.php/${app.contextPath}/announcement/view/${id}`;
    const state = (label, id) => {
        fact(`${label} stored`, L.stored(app, id));
        fact(`${label} folder`, L.listFolder(folder, id));
    };

    try {
        await step('1 sign in as rvaca', async () => { await signIn(page, 'rvaca'); return true; });
        await step('2 Enable announcements', () => L.enableAnnouncements(app, page));
        await step('3 Announcements from the side menu', () => L.openAnnouncementsFromMenu(app, page));

        if (MODE === 'walk') {
            const T = 'hkq27c Spring notice';
            const a = await step(`4 Add Announcement "${T}" with photo.png, alt "Spring picture"`, () =>
                L.addAnnouncement(page, {title: T, picture: L.PICTURES.png, alt: 'Spring picture'}));
            const id = a && a.id;
            state('4', id);
            const p5 = await step('5 the announcement\'s page', () => L.publicRead(app, page, view(id)));
            const address = p5 && p5.imgs && p5.imgs[0] && p5.imgs[0].src;
            fact('5 picture address', address || null);
            await snap('5-page');
            await shot(page, `${key}-5-page`);

            await L.reloadAnnouncements(app, page);
            let dialog;
            await step('6 Edit, Remove, Upload File renamed.jpg, Save', async () => {
                dialog = await L.openEdit(page, T);
                const removed = await L.pressImageButton(page, dialog, 'Remove');
                const upload = await L.uploadImage(page, dialog, L.PICTURES.renamed);
                return {removed, upload, save: await L.pressSave(page, dialog)};
            });
            await snap('6-after-save');
            await shot(page, `${key}-6-after-save`);
            state('6', id);

            await step('7 close the panel', () => L.closeDialog(page, dialog));
            await step('7 the announcement\'s page', () => L.publicRead(app, page, view(id)));
            await snap('7-page');
            await shot(page, `${key}-7-page`);
            await step('7 the public Announcements page', () => L.publicRead(app, page, `/index.php/${app.contextPath}/announcement`));

            fact('8 rows after reload', await L.reloadAnnouncements(app, page));
            await step('8 Edit, look at "Image"', async () => {
                dialog = await L.openEdit(page, T);
                return L.readImageField(dialog);
            });
            await snap('8-edit-panel');
            await shot(page, `${key}-8-edit-panel`);

            const T2 = `${T} (edited)`;
            await step(`9 Title "${T2}", Save`, async () => {
                await dialog.locator('input[name="title-en"]').fill(T2);
                return L.pressSave(page, dialog);
            });
            await snap('9-after-save');
            state('9', id);
            await L.closeDialog(page, dialog);

            const rows10 = await step('10 reload Announcements', () => L.reloadAnnouncements(app, page));
            const T3 = (rows10 || []).includes(T2) ? T2 : T;

            await step('11 Edit, Remove, Save', async () => {
                dialog = await L.openEdit(page, T3);
                const removed = await L.pressImageButton(page, dialog, 'Remove');
                return {removed, save: await L.pressSave(page, dialog)};
            });
            state('11', id);
            await L.closeDialog(page, dialog);
            await step('11 the announcement\'s page', () => L.publicRead(app, page, view(id)));

            if (address) await step('12 the picture\'s address from step 5', () => L.openAddress(app, page, address));
            await snap('12-address');
        } else {
            const S = 'hkq27c Summer notice';
            const s = await step(`N2 Add Announcement "${S}" with photo.png, alt "Summer picture"`, () =>
                L.addAnnouncement(page, {title: S, picture: L.PICTURES.png, alt: 'Summer picture'}));
            const sid = s && s.id;
            state('N2', sid);
            let dialog;
            await step('N3 Edit, Remove, Upload File photo.gif, Save', async () => {
                dialog = await L.openEdit(page, S);
                const removed = await L.pressImageButton(page, dialog, 'Remove');
                const upload = await L.uploadImage(page, dialog, L.PICTURES.gif);
                return {removed, upload, save: await L.pressSave(page, dialog)};
            });
            await L.closeDialog(page, dialog);
            state('N3', sid);
            await step('N3 the announcement\'s page', () => L.publicRead(app, page, view(sid)));
            await L.reloadAnnouncements(app, page);

            const S2 = `${S} (edited)`;
            await step(`N4 Edit, Title "${S2}", Save`, async () => {
                dialog = await L.openEdit(page, S);
                await dialog.locator('input[name="title-en"]').fill(S2);
                return L.pressSave(page, dialog);
            });
            await L.closeDialog(page, dialog);
            state('N4', sid);
            await step('N4 the announcement\'s page', () => L.publicRead(app, page, view(sid)));
            await L.reloadAnnouncements(app, page);

            const R = 'hkq27c Refused add';
            await step(`N5 Add Announcement "${R}" with renamed.jpg`, () => L.addAnnouncement(page, {title: R, picture: L.PICTURES.renamed}));
            fact('N5 rows after reload', await L.reloadAnnouncements(app, page));
            fact('N5 stored titles', L.storedTitles(app));
            fact('N5 whole folder', L.listFolder(folder));

            await step('N6 Edit, Remove, Upload File renamed.jpg, Save; then Restore Original, Save', async () => {
                dialog = await L.openEdit(page, S2);
                const removed = await L.pressImageButton(page, dialog, 'Remove');
                const upload = await L.uploadImage(page, dialog, L.PICTURES.renamed);
                const refused = await L.pressSave(page, dialog);
                const restored = await L.pressImageButton(page, dialog, 'Restore Original');
                const field = await L.readImageField(dialog);
                return {removed, upload, refused, restored, field, save: await L.pressSave(page, dialog)};
            });
            await L.closeDialog(page, dialog);
            state('N7', sid);
            await step('N7 the announcement\'s page', () => L.publicRead(app, page, view(sid)));
            await snap('neighbour-end');
        }
    } finally {
        record(`${key}-facts`, facts);
        await close();
    }
});
