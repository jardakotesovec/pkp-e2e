// Reach check for docs/issues/U12-A21-refused-picture-edit-breaks-announcement-picture.md:
// a second manager's later "Save" of an announcement left with the refused
// upload's temporary reference. Steps 1-4 and 6 of the report as `rvaca`
// (walk.js), the panel closed; then sign out, sign in as `admin` (the site
// administrator, a manager of the journal in the dataset), "Edit" the row,
// change the title, "Save". Records the answer, the stored setting and the
// server log lines, then "Remove" and "Save" as `admin` (O5). Reset the fleet
// before it; helpers in lib.js.
// PART=all (default) every step; PART=break only steps 1-7 as `rvaca`;
// PART=other only `admin`'s steps (O1-O5) on an announcement PART=break left
// (a fix trial breaks the announcement unpatched, then applies the fix).
//
// Run: PROBE_RUN=reach PROBE_FEATURE=<feature> PROBE_AGENT=walk node bin/probe.js all shared/playwright/checks/issues/refused-picture-edit-breaks-announcement-picture/reach.js
const {forEachApp, launch, signIn, signOut, screen, record, sql, serverLog} = require('../../../probe');
const L = require('./lib.js');

const PART = process.env.PART || 'all';

forEachApp(async (app) => {
    if (!app.dataset) throw new Error('reach.js drives a dataset fleet (fleet-prep --dataset n --reset)');
    const facts = {line: app.line || 'main'};
    const fact = (k, v) => { facts[k] = v; console.log(`[${app.name} ${facts.line}] ${k}: ${JSON.stringify(v).slice(0, 600)}`); };
    const key = 'a21-reach';
    const log = serverLog(app);
    const {page, close} = await launch(app);
    const step = async (label, fn) => {
        const from = log.mark();
        let v;
        try { v = await fn(); fact(label, v); } catch (e) { fact(label, {threw: String(e.message || e).split('\n')[0]}); }
        const lines = log.since(from).filter((l) => !/PluginGallery|plugins\.xml/.test(l)).map((l) => l.slice(0, 400));
        if (lines.length) fact(`${label} server log`, lines);
        return v;
    };
    const T = 'hkq27c Spring notice';
    try {
      let id = Number(sql(app, `SELECT min(announcement_id) FROM announcements`)) || null;
      let dialog;
      if (PART !== 'other') {
        await step('1 sign in as rvaca', async () => { await signIn(page, 'rvaca'); return true; });
        await step('2 Enable announcements', () => L.enableAnnouncements(app, page));
        await step('3 Announcements from the side menu', () => L.openAnnouncementsFromMenu(app, page));
        const a = await step(`4 Add Announcement "${T}" with photo.png`, () =>
            L.addAnnouncement(page, {title: T, picture: L.PICTURES.png, alt: 'Spring picture'}));
        id = a && a.id;
        await step('6 Edit, Remove, Upload File renamed.jpg, Save', async () => {
            dialog = await L.openEdit(page, T);
            await L.pressImageButton(page, dialog, 'Remove');
            const upload = await L.uploadImage(page, dialog, L.PICTURES.renamed);
            return {upload: upload.upload, save: await L.pressSave(page, dialog), closed: await L.closeDialog(page, dialog)};
        });
        fact('6 stored', L.stored(app, id));
        if (PART === 'break') return;
        await signOut(page);
      }
        fact('O0 stored before', L.stored(app, id));
        await step('O1 sign in as admin', async () => { await signIn(page, 'admin'); return true; });
        await step('O2 Announcements', () => L.reloadAnnouncements(app, page));
        const T2 = `${T} (admin)`;
        await step(`O3 Edit, Title "${T2}", Save`, async () => {
            dialog = await L.openEdit(page, T);
            const field = await L.readImageField(dialog);
            await dialog.locator('input[name="title-en"]').fill(T2);
            return {field, save: await L.pressSave(page, dialog)};
        });
        record(`${key}-O3`, await screen(page));
        fact('O3 stored', L.stored(app, id));
        await L.closeDialog(page, dialog);
        const rows = await L.reloadAnnouncements(app, page);
        fact('O4 rows after reload', rows);
        await step('O5 Edit, Remove, Save', async () => {
            dialog = await L.openEdit(page, rows.includes(T2) ? T2 : T);
            const removed = await L.pressImageButton(page, dialog, 'Remove');
            return {removed, save: await L.pressSave(page, dialog), closed: await L.closeDialog(page, dialog)};
        });
        fact('O5 stored', L.stored(app, id));
        await step('O5 the announcement\'s page', () => L.publicRead(app, page, `/index.php/${app.contextPath}/announcement/view/${id}`));
    } finally {
        record(`${key}-facts`, facts);
        await close();
    }
});
