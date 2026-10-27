// U12 claim check, chunk I27A (housekeeping incidentals, 2026-10-27): the two
// U12 rows about a picture on "Edit Announcement".
//   Row 1, register A2: does a refused picture on an edit still delete the
//     announcement, and are ".jpeg" and upper-case extensions still refused?
//   Row 2, the broken-picture candidate beside A12: an edit whose picture is
//     refused (a PNG named renamed.jpg; a text file named .png with PART=nonimage)
//     leaves the stored image setting
//     and the pages pointing at no file?
// Drives PKP's default test dataset (harness.md "Dataset fleets"), signed in
// as the manager `rvaca` on `publicknowledge` (and `admin` for one refused
// edit, the second permission level): announcements are turned on and every
// announcement is made on screen. No screen shows the stored setting or the
// public files folder, so the walk reads `announcement_settings` and lists
// `public/journals|presses|contexts/<id>/announcements/` after each step.
// Every step records the server log lines it caused; the run record has the
// crashes. Titles carry PROBE_RUN, so two runs share a fleet without a reset.
// Self-contained: the pictures sit beside this file (photo.png, photo.jpeg,
// PHOTO.PNG, IMG_0001.JPG, photo.gif, renamed.jpg = a PNG named .jpg,
// photo.webp = a real WebP, notapicture.png = a text file, photo.bmp, photo.svg,
// photo.tif). No other script
// or file is read.
// PART=all (default) every step below; PART=nonimage only the text file named
// .png on an edit and on an add (run it under its own PROBE_RUN, e.g. n1, n2);
// PART=restore only "Restore Original" after a refused save, in the same panel
// and on a later "Edit" (PROBE_RUN e.g. t1, t2); PART=formats a BMP, an SVG and
// a TIFF (photo.bmp, photo.svg, photo.tif, each named after its content) on
// "Add Announcement" and on "Edit" (PROBE_RUN e.g. f1); PART=kept the old
// picture's printed address fetched after the add, after a refused edit and
// after "Remove" then "Save" (PROBE_RUN e.g. k1).
//
// Run (main, then stable-3_5_0), each run twice (r1, r2; s1, s2 on 3.5):
//   npm run fleet-prep -- --feature <feature> --dataset <n> --reset
//   bin/app-lock.sh shared ojs -- env PROBE_RUN=r1 PROBE_FEATURE=<feature> PKP_E2E_DATASET=<n> PROBE_NOTES_FEATURE=U12 PROBE_AGENT=cc27a node bin/probe.js ojs shared/playwright/checks/U12/I27A/i27a.js
//   (likewise omp, ops; on 3.5: PKP_E2E_LINE=stable-3_5_0 in front of both, feature <feature>-3_5, PROBE_RUN=s1)
// Outputs: .reports/<feature>/cc27a/i27a-NN-<step>-<run>-<app>.json, i27a-facts-<run>-<app>.json, .png shots
// (the r1 run of 2026-10-27 named them i27a-r1-…-r1-<app>).
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, signOut, screen, shot, record, sql, serverLog, idle, note} = require('../../../probe');

const T = 30_000;
const RUN = process.env.PROBE_RUN || 'r0';
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (s, n = 300) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));
const rel = (u) => (u ? String(u).replace(/^https?:\/\/[^/]+/, '') : u);
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const PART = process.env.PART || 'all';
const PIC = Object.fromEntries(['photo.png', 'photo.jpeg', 'PHOTO.PNG', 'IMG_0001.JPG', 'photo.gif', 'renamed.jpg', 'photo.webp', 'notapicture.png', 'photo.bmp', 'photo.svg', 'photo.tif']
    .map((f) => [f, path.join(__dirname, f)]));
const CONTEXT_DIR = {ojs: 'journals', omp: 'presses', ops: 'contexts'};

function publicDir(app) {
    const cfgPath = path.isAbsolute(app.configFile) ? app.configFile : path.join(__dirname, '../../../../..', app.configFile);
    const cfg = fs.readFileSync(cfgPath, 'utf8');
    const m = cfg.match(/^\s*public_files_dir\s*=\s*"?([^"\n]+?)"?\s*$/m);
    const pub = m ? m[1] : 'public';
    return path.isAbsolute(pub) ? pub : path.join(app.root, pub);
}
const listFolder = (folder, id) => { try { return fs.readdirSync(folder).filter((n) => id == null || n.startsWith(`${id}.`)).sort(); } catch (e) { return {missing: folder}; } };

const panel = (page) => page.locator('main .listPanel').first();
const rowTitles = (page) => panel(page).locator('.listPanel__itemTitle').allInnerTexts().then((a) => a.map((s) => flat(s)));
const row = (page, title) => panel(page).locator('.listPanel__item')
    .filter({has: page.locator('.listPanel__itemTitle', {hasText: new RegExp(`^\\s*${esc(title)}\\s*$`)})});
const imageField = (dialog) => dialog.locator('.pkpFormField--uploadImage').first();

async function enableAnnouncements(app, page) {
    await page.goto(app.url(`/index.php/${app.contextPath}/en/management/settings/website`));
    await idle(page).catch(() => {});
    const setupTab = page.locator('#setup-button').first();
    await setupTab.waitFor({state: 'visible', timeout: T});
    if ((await setupTab.getAttribute('aria-selected')) !== 'true') await setupTab.click();
    await page.locator('#setup').first().getByRole('tab', {name: 'Announcements', exact: true}).click();
    const tab = page.locator('#setup').first().locator('[role="tabpanel"]:visible').first();
    const box = tab.getByRole('checkbox', {name: 'Enable announcements', exact: true});
    await box.waitFor({state: 'visible', timeout: T});
    const before = await box.isChecked();
    if (!before) {
        await box.check();
        await tab.getByRole('button', {name: 'Save', exact: true}).click();
        await tab.locator('[role="status"]').filter({hasText: 'Saved'}).first().waitFor({state: 'visible', timeout: T}).catch(() => {});
    }
    return {tickedBefore: before};
}

async function openList(app, page) {
    await page.goto(app.url(`/index.php/${app.contextPath}/en/management/settings/announcements`));
    await idle(page).catch(() => {});
    await panel(page).waitFor({state: 'visible', timeout: T});
    await idle(page).catch(() => {});
    return rowTitles(page);
}

/** The back-office row as a person reads it: its text and any picture in it. */
async function rowRead(page, title) {
    const r = row(page, title);
    if (!(await r.count())) return {present: false};
    return {present: true, text: flat(await r.innerText()), imgs: await r.locator('img').evaluateAll((els) => els.map((i) => ({src: i.getAttribute('src'), loaded: i.complete && i.naturalWidth > 0})))};
}

async function uploadImage(page, dialog, file) {
    const field = imageField(dialog);
    await field.waitFor({state: 'visible', timeout: T});
    const up = page.waitForResponse((r) => /temporaryFiles/.test(r.url()) && r.request().method() === 'POST', {timeout: T}).catch(() => null);
    await field.locator('input[type=file]').first().setInputFiles(file);
    const r = await up;
    await idle(page).catch(() => {});
    await pause(800);
    return {file: path.basename(file), upload: r ? r.status() : null, field: flat(await field.innerText().catch(() => ''), 200),
        preview: await field.locator('img').evaluateAll((els) => els.map((i) => ({alt: i.getAttribute('alt'), loaded: i.complete && i.naturalWidth > 0}))).catch(() => [])};
}

async function removeImage(page, dialog) {
    const btn = imageField(dialog).getByRole('button', {name: 'Remove', exact: true});
    const had = await btn.isVisible().catch(() => false);
    if (had) await btn.click();
    await pause(500);
    return had;
}

async function setAlt(dialog, text) {
    const box = imageField(dialog).locator('input[type="text"]').first();
    if (!(await box.isVisible().catch(() => false))) return false;
    await box.fill(text);
    return true;
}

async function setShort(page, dialog, text) {
    const fr = dialog.locator('.pkpFormField').filter({hasText: /Short Description/i}).locator('iframe').first();
    await fr.waitFor({state: 'visible', timeout: T});
    const body = fr.contentFrame().locator('body');
    await body.click();
    await body.pressSequentially(text);
    await pause(300);
}

/** "Save": the API answer, the panel's state, its messages, read on the same page right after. */
async function pressSave(page, dialog) {
    const resp = page.waitForResponse((x) => /\/api\/v1\/announcements(\/\d+)?$/.test(x.url()) && x.request().method() !== 'GET', {timeout: T}).catch(() => null);
    await dialog.getByRole('button', {name: 'Save', exact: true}).click();
    const r = await resp;
    const out = {status: r ? r.status() : null, method: r ? (r.request().headers()['x-http-method-override'] || r.request().method()) : null};
    if (r && r.status() >= 400) out.answer = flat(await r.text().catch(() => null), 400);
    await dialog.waitFor({state: 'hidden', timeout: 6000}).catch(() => {});
    await idle(page).catch(() => {});
    await pause(800);
    out.dialogOpen = await dialog.isVisible().catch(() => false);
    if (out.dialogOpen) {
        out.fieldErrors = [...new Set((await dialog.locator('.pkpFormFieldError, .pkpFormField__error, [id$="-error"]').allInnerTexts().catch(() => []))
            .map((s) => flat(s)).filter(Boolean))];
        out.formError = flat(await dialog.locator('.pkpFormPage__status, .pkpFormErrors, .pkpForm__errors').first().innerText({timeout: 1000}).catch(() => null));
        out.imageField = flat(await imageField(dialog).innerText().catch(() => ''), 300);
    }
    return out;
}

async function closeDialog(page, dialog) {
    if (!(await dialog.isVisible().catch(() => false))) return 'not open';
    await dialog.getByRole('button', {name: 'Close', exact: true}).first().click().catch(() => {});
    await dialog.waitFor({state: 'hidden', timeout: 6000}).catch(() => {});
    await pause(2000);
    return !(await dialog.isVisible().catch(() => false));
}

async function openEdit(page, title) {
    await row(page, title).getByRole('button', {name: 'Edit', exact: true}).click();
    const dialog = page.getByRole('dialog', {name: 'Edit Announcement'});
    await dialog.getByRole('button', {name: 'Save', exact: true}).waitFor({state: 'visible', timeout: T});
    await idle(page).catch(() => {});
    await pause(500);
    return dialog;
}

/** The stored announcement: row, dates, title, short text, image setting. */
function stored(app, id) {
    if (!id) return null;
    const q = (s) => sql(app, s);
    return {
        row: q(`SELECT date_posted || '|' || coalesce(date_expire::text, '-') FROM announcements WHERE announcement_id = ${Number(id)}`) || 'none',
        title: q(`SELECT setting_value FROM announcement_settings WHERE announcement_id = ${Number(id)} AND setting_name = 'title'`) || null,
        descriptionShort: flat(q(`SELECT setting_value FROM announcement_settings WHERE announcement_id = ${Number(id)} AND setting_name = 'descriptionShort'`), 120) || null,
        image: q(`SELECT setting_value FROM announcement_settings WHERE announcement_id = ${Number(id)} AND setting_name = 'image'`) || null,
    };
}

/** A public page as a visitor reads it (same browser): status, heading, pictures and whether each loads. */
async function publicRead(app, page, address) {
    const res = await page.goto(app.url(address));
    await idle(page).catch(() => {});
    const imgs = await page.locator('img').evaluateAll((els) => els.filter((i) => /announcement/.test(i.getAttribute('src') || '') || /announcement/i.test(i.closest('[class]')?.className || ''))
        .map((i) => ({src: i.getAttribute('src'), alt: i.getAttribute('alt'), loaded: i.complete && i.naturalWidth > 0}))).catch(() => []);
    for (const i of imgs) {
        if (!i.src) continue;
        const r = await page.request.get(i.src.startsWith('http') ? i.src : app.url(i.src)).catch(() => null);
        i.fetch = r ? `${r.status()} ${r.headers()['content-type'] || ''}` : 'no answer';
        i.src = rel(i.src);
    }
    const h = await page.locator('h1, h2').allInnerTexts().then((a) => a.map((s) => flat(s, 120)).filter(Boolean).slice(0, 6)).catch(() => []);
    return {address, status: res && res.status(), landed: rel(page.url()), headings: h, imgs};
}

forEachApp(async (app) => {
    if (!app.dataset) throw new Error('i27a.js drives a dataset fleet (fleet-prep --dataset n --reset)');
    const line = app.line || 'main';
    const facts = {run: RUN, line};
    const fact = (k, v) => { facts[k] = v; console.log(`[${app.name} ${line} ${RUN}] ${k}: ${JSON.stringify(v).slice(0, 600)}`); };
    const key = 'i27a'; // the kit adds PROBE_RUN to every name
    const contextId = Number(sql(app, `SELECT ${app.contextTables.id} FROM ${app.contextTables.table} WHERE path = '${app.contextPath}'`));
    const folder = path.join(publicDir(app), CONTEXT_DIR[app.name], String(contextId), 'announcements');
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
    const t = (s) => `u12i27a ${RUN} ${s}`;

    /** Add an announcement with title, short text, picture and alternate text; the new id from its "View". */
    const add = async (title, pic, alt) => {
        await panel(page).getByRole('button', {name: 'Add Announcement', exact: true}).click();
        const dialog = page.getByRole('dialog', {name: 'Add Announcement'});
        await dialog.getByRole('button', {name: 'Save', exact: true}).waitFor({state: 'visible', timeout: T});
        await dialog.locator('input[name="title-en"]').fill(title);
        await setShort(page, dialog, `Short text of ${title}.`);
        const upload = pic ? await uploadImage(page, dialog, PIC[pic]) : null;
        if (pic && alt) await setAlt(dialog, alt);
        const save = await pressSave(page, dialog);
        if (save.dialogOpen) save.closed = await closeDialog(page, dialog);
        const href = await row(page, title).getByRole('link', {name: 'View', exact: true}).getAttribute('href', {timeout: 5000}).catch(() => null);
        const m = (href || '').match(/\/announcement\/view\/(\d+)/);
        return {upload, save, id: m ? Number(m[1]) : null};
    };
    /** Every read after a save: same page, then reload; the DB, the folder, the public pages. */
    const after = async (label, id, title, dialog) => {
        await snap(`${label}-same-page`);
        fact(`${label} rows same page`, await rowTitles(page));
        fact(`${label} stored`, stored(app, id));
        fact(`${label} folder`, listFolder(folder, id));
        if (dialog) fact(`${label} close panel`, await closeDialog(page, dialog));
        fact(`${label} rows after reload`, await openList(app, page));
        fact(`${label} row after reload`, await rowRead(page, title));
        await snap(`${label}-list-after-reload`);
        fact(`${label} public page`, await publicRead(app, page, `/index.php/${app.contextPath}/announcement/view/${id}`));
        await snap(`${label}-public-page`);
        await shot(page, `${key}-${label}-public-page`);
        fact(`${label} public list`, await publicRead(app, page, `/index.php/${app.contextPath}/announcement`));
        await openList(app, page);
    };
    /** "Edit", "Remove" (unless keep), "Upload File" pic, "Save"; then every read. */
    const editPic = async (label, id, title, pic, {remove = true, retitle} = {}) => {
        let dialog;
        fact(`${label} stored before`, stored(app, id));
        fact(`${label} folder before`, listFolder(folder, id));
        await step(`${label} Edit, ${remove ? 'Remove, ' : ''}Upload File ${pic}${retitle ? `, Title "${retitle}"` : ''}, Save`, async () => {
            dialog = await openEdit(page, title);
            const out = {};
            if (remove) out.removed = await removeImage(page, dialog);
            if (pic) out.upload = await uploadImage(page, dialog, PIC[pic]);
            if (retitle) await dialog.locator('input[name="title-en"]').fill(retitle);
            out.save = await pressSave(page, dialog);
            return out;
        });
        await after(label, id, retitle || title, dialog);
    };

    try {
        await step('0 sign in as rvaca', async () => { await signIn(page, 'rvaca'); return true; });
        await step('0 Enable announcements', () => enableAnnouncements(app, page));
        await step('0 Announcements page', () => openList(app, page));
        await snap('announcements-page');

        if (PART === 'nonimage') {
            // Another refusal reason: a text file named .png (the box takes it by its name; the save's check reads the content).
            const X = t('nonimage notice');
            const x = await step(`X0 Add "${X}" with photo.png, alt "X alt"`, () => add(X, 'photo.png', 'X alt'));
            const xid = x && x.id;
            await editPic('X1-notapicture', xid, X, 'notapicture.png');
            const Y = t('nonimage add');
            const y = await step(`X2 Add "${Y}" with notapicture.png`, () => add(Y, 'notapicture.png', null));
            fact('X2 stored', stored(app, y && y.id));
            fact('X2 rows after reload', await openList(app, page));
            return;
        }

        if (PART === 'formats') {
            // Follow-up (a): real pictures in other formats, named after their content: the box, the upload, "Save".
            /** Choose a file in the open panel's "Image": the input's accept list, the upload's answer (or none), what the box says. */
            const choose = async (dialog, file) => {
                const field = imageField(dialog);
                await field.waitFor({state: 'visible', timeout: T});
                const input = field.locator('input[type=file]').first();
                const accept = await input.getAttribute('accept').catch(() => null);
                const up = page.waitForResponse((r) => /temporaryFiles/.test(r.url()) && r.request().method() === 'POST', {timeout: 8000}).catch(() => null);
                await input.setInputFiles(PIC[file]);
                const r = await up;
                await idle(page).catch(() => {});
                await pause(800);
                return {file, accept, upload: r ? r.status() : 'no request', uploadAnswer: r ? flat(await r.text().catch(() => null), 200) : null,
                    box: flat(await field.innerText().catch(() => ''), 400),
                    boxErrors: (await field.locator('.dz-error-message, .pkpFormFieldError, [id$="-error"]').allInnerTexts().catch(() => [])).map((x) => flat(x)).filter(Boolean),
                    saveDisabled: await dialog.getByRole('button', {name: 'Save', exact: true}).isDisabled().catch(() => null),
                    formError: flat(await dialog.locator('.pkpFormPage__status, .pkpFormErrors, .pkpForm__errors').first().innerText({timeout: 1000}).catch(() => null))};
            };
            for (const file of ['photo.bmp', 'photo.svg', 'photo.tif']) {
                const ext = file.split('.').pop();
                // On "Add Announcement".
                const AT = t(`add ${ext}`);
                let dialog;
                await step(`F-add-${ext} Add "${AT}" with ${file}, Save`, async () => {
                    await panel(page).getByRole('button', {name: 'Add Announcement', exact: true}).click();
                    dialog = page.getByRole('dialog', {name: 'Add Announcement'});
                    await dialog.getByRole('button', {name: 'Save', exact: true}).waitFor({state: 'visible', timeout: T});
                    await dialog.locator('input[name="title-en"]').fill(AT);
                    const box = await choose(dialog, file);
                    await snap(`F-add-${ext}-chosen`);
                    const save = await pressSave(page, dialog);
                    await snap(`F-add-${ext}-after-save`);
                    if (save.dialogOpen) save.closed = await closeDialog(page, dialog);
                    const rows = await openList(app, page);
                    const href = await row(page, AT).getByRole('link', {name: 'View', exact: true}).getAttribute('href', {timeout: 3000}).catch(() => null);
                    const m = (href || '').match(/\/announcement\/view\/(\d+)/);
                    const id = m ? Number(m[1]) : null;
                    const out = {box, save, rowListed: rows.includes(AT), id, stored: stored(app, id), folder: listFolder(folder, id)};
                    if (id) out.page = await publicRead(app, page, `/index.php/${app.contextPath}/announcement/view/${id}`);
                    await openList(app, page);
                    return out;
                });
                // On "Edit" of an announcement with photo.png.
                const ET = t(`edit ${ext}`);
                const e = await step(`F-edit-${ext} Add "${ET}" with photo.png`, () => add(ET, 'photo.png', `${ext} alt`));
                const eid = e && e.id;
                fact(`F-edit-${ext} stored before`, stored(app, eid));
                fact(`F-edit-${ext} page before`, await publicRead(app, page, `/index.php/${app.contextPath}/announcement/view/${eid}`));
                await openList(app, page);
                await step(`F-edit-${ext} Edit, Remove, choose ${file}, Save`, async () => {
                    dialog = await openEdit(page, ET);
                    await removeImage(page, dialog);
                    const box = await choose(dialog, file);
                    await snap(`F-edit-${ext}-chosen`);
                    const save = await pressSave(page, dialog);
                    await snap(`F-edit-${ext}-after-save`);
                    return {box, save};
                });
                fact(`F-edit-${ext} stored`, stored(app, eid));
                fact(`F-edit-${ext} folder`, listFolder(folder, eid));
                fact(`F-edit-${ext} close panel`, await closeDialog(page, dialog));
                fact(`F-edit-${ext} rows after reload`, await openList(app, page));
                fact(`F-edit-${ext} page`, await publicRead(app, page, `/index.php/${app.contextPath}/announcement/view/${eid}`));
                await shot(page, `${key}-F-edit-${ext}-page`);
                await openList(app, page);
            }
            return;
        }

        if (PART === 'kept') {
            // Follow-up (b): the old picture's printed address, fetched at each step.
            const K = t('kept notice');
            const k = await step(`K0 Add "${K}" with photo.png, alt "K alt"`, () => add(K, 'photo.png', 'K alt'));
            const kid = k && k.id;
            const view = `/index.php/${app.contextPath}/announcement/view/${kid}`;
            const p0 = await publicRead(app, page, view);
            fact('K0 page', p0);
            const addr = p0.imgs[0] && p0.imgs[0].src;
            const fetchOld = async (label) => {
                const r = await page.request.get(app.url(addr)).catch(() => null);
                fact(`${label} old address`, {address: addr, status: r ? r.status() : null, type: r ? r.headers()['content-type'] : null, bytes: r ? (await r.body().catch(() => Buffer.alloc(0))).length : null});
            };
            await fetchOld('K0');
            fact('K0 folder', listFolder(folder, kid));
            await openList(app, page);
            let dialog;
            await step('K1 Edit, Remove, Upload File renamed.jpg, Save (refused)', async () => {
                dialog = await openEdit(page, K);
                await removeImage(page, dialog);
                await uploadImage(page, dialog, PIC['renamed.jpg']);
                const save = await pressSave(page, dialog);
                return {save, closed: await closeDialog(page, dialog)};
            });
            fact('K1 stored', stored(app, kid));
            fact('K1 page', await publicRead(app, page, view));
            await snap('K1-page');
            await fetchOld('K1');
            fact('K1 folder', listFolder(folder, kid));
            await openList(app, page);
            await step('K2 Edit, Remove, Save', async () => {
                dialog = await openEdit(page, K);
                await removeImage(page, dialog);
                return pressSave(page, dialog);
            });
            fact('K2 stored', stored(app, kid));
            fact('K2 page', await publicRead(app, page, view));
            await snap('K2-page');
            await fetchOld('K2');
            fact('K2 folder', listFolder(folder, kid));
            return;
        }

        if (PART === 'restore') {
            // The way back: "Restore Original" in the refused panel itself, then "Save";
            // and on a later "Edit" of an announcement left broken, "Restore Original" then "Save".
            const R = t('restore notice');
            const r = await step(`R0 Add "${R}" with photo.png, alt "R alt"`, () => add(R, 'photo.png', 'R alt'));
            const rid = r && r.id;
            let dialog;
            await step('R1 Edit, Remove, Upload File renamed.jpg, Save (refused), Restore Original, Save', async () => {
                dialog = await openEdit(page, R);
                await removeImage(page, dialog);
                const upload = await uploadImage(page, dialog, PIC['renamed.jpg']);
                const refused = await pressSave(page, dialog);
                const restoreBtns = imageField(dialog).getByRole('button', {name: 'Restore Original', exact: true});
                const count = await restoreBtns.count();
                let pressed = false;
                for (let i = 0; i < count && !pressed; i++) {
                    if (await restoreBtns.nth(i).isVisible().catch(() => false)) { await restoreBtns.nth(i).click(); pressed = true; }
                }
                await pause(800);
                const field = flat(await imageField(dialog).innerText().catch(() => ''), 300);
                const preview = await imageField(dialog).locator('img').evaluateAll((els) => els.map((i) => ({alt: i.getAttribute('alt'), loaded: i.complete && i.naturalWidth > 0}))).catch(() => []);
                const alt = await imageField(dialog).locator('input[type="text"]').first().inputValue().catch(() => null);
                return {upload: upload.upload, refused: [refused.status, refused.fieldErrors], restoreButtons: count, pressed, field, preview, alt, save: await pressSave(page, dialog)};
            });
            await after('R1', rid, R, dialog);
            const Q = t('restore later');
            const q = await step(`R2 Add "${Q}" with photo.png, alt "Q alt"`, () => add(Q, 'photo.png', 'Q alt'));
            const qid = q && q.id;
            await editPic('R3-renamed', qid, Q, 'renamed.jpg');
            await step('R4 Edit, Restore Original, Save', async () => {
                dialog = await openEdit(page, Q);
                const restoreBtns = imageField(dialog).getByRole('button', {name: 'Restore Original', exact: true});
                const count = await restoreBtns.count();
                const visible = [];
                for (let i = 0; i < count; i++) visible.push(await restoreBtns.nth(i).isVisible().catch(() => false));
                const idx = visible.indexOf(true);
                if (idx >= 0) await restoreBtns.nth(idx).click();
                await pause(800);
                const preview = await imageField(dialog).locator('img').evaluateAll((els) => els.map((i) => ({alt: i.getAttribute('alt'), loaded: i.complete && i.naturalWidth > 0}))).catch(() => []);
                return {restoreButtons: count, visible, field: flat(await imageField(dialog).innerText().catch(() => ''), 300), preview, save: await pressSave(page, dialog)};
            });
            await after('R4', qid, Q, dialog);
            return;
        }

        // ---- Row 1 (A2): accepted names now? and a refused one keeps the announcement.
        const A = t('A2 notice');
        const a = await step(`A0 Add "${A}" with photo.png, alt "A2 alt"`, () => add(A, 'photo.png', 'A2 alt'));
        const aid = a && a.id;
        await after('A0', aid, A);
        await editPic('A1-jpeg', aid, A, 'photo.jpeg');
        await editPic('A2-PHOTO.PNG', aid, A, 'PHOTO.PNG');
        await editPic('A3-IMG_0001.JPG', aid, A, 'IMG_0001.JPG');
        await editPic('A4-renamed', aid, A, 'renamed.jpg');
        // A2's control: "Add Announcement" with the same names.
        for (const pic of ['photo.jpeg', 'PHOTO.PNG']) {
            const ct = t(`add ${pic}`);
            const c = await step(`AC Add "${ct}" with ${pic}`, () => add(ct, pic, null));
            fact(`AC ${pic} stored`, stored(app, c && c.id));
            fact(`AC ${pic} folder`, listFolder(folder, c && c.id));
        }
        fact('AC rows after reload', await openList(app, page));

        // ---- Row 2: a refused picture on an edit of an announcement that has one.
        const B = t('broken notice');
        const b = await step(`B0 Add "${B}" with photo.png, alt "B alt"`, () => add(B, 'photo.png', 'B alt'));
        const bid = b && b.id;
        await after('B0', bid, B);
        await editPic('B1-renamed', bid, B, 'renamed.jpg');
        // The broken announcement edited again: what the panel offers, and a title-only save.
        await step('B2 Edit (look only)', async () => {
            const dialog = await openEdit(page, B);
            await snap('B2-edit-panel');
            await shot(page, `${key}-B2-edit-panel`);
            const field = imageField(dialog);
            const out = {field: flat(await field.innerText().catch(() => ''), 300),
                imgs: await field.locator('img').evaluateAll((els) => els.map((i) => ({src: (i.getAttribute('src') || '').replace(/^https?:\/\/[^/]+/, '').slice(0, 160), loaded: i.complete && i.naturalWidth > 0}))).catch(() => []),
                buttons: await field.getByRole('button').allInnerTexts().then((a) => a.map((x) => flat(x))).catch(() => []),
                alt: await field.locator('input[type="text"]').first().inputValue().catch(() => null)};
            out.closed = await closeDialog(page, dialog);
            return out;
        });
        await editPic('B3-title-only', bid, B, null, {remove: false, retitle: `${B} edited`});
        const B2 = (facts['B3-title-only rows after reload'] || []).includes(`${B} edited`) ? `${B} edited` : B;
        await editPic('B4-remove', bid, B2, null, {remove: true});

        // A real WebP picture (accepted since getImageExtension() maps image/webp), then a refused one without "Remove".
        const W = t('webp notice');
        const w = await step(`W0 Add "${W}" with photo.png, alt "W alt"`, () => add(W, 'photo.png', 'W alt'));
        const wid = w && w.id;
        await editPic('W1-webp', wid, W, 'photo.webp');
        // Upload without pressing "Remove" first (the preview's own box).
        await editPic('W2-renamed-no-remove', wid, W, 'renamed.jpg', {remove: false});

        // Control: an accepted picture of the same edit.
        const C = t('control notice');
        const c = await step(`C0 Add "${C}" with photo.png, alt "C alt"`, () => add(C, 'photo.png', 'C alt'));
        const cid = c && c.id;
        await editPic('C1-gif', cid, C, 'photo.gif');

        // The second permission level: the site administrator (also the journal's manager in the dataset).
        await step('D0 sign out, sign in as admin', async () => { await signOut(page); await signIn(page, 'admin'); return true; });
        await openList(app, page);
        const D = t('admin notice');
        const d = await step(`D0 Add "${D}" with photo.png, alt "D alt"`, () => add(D, 'photo.png', 'D alt'));
        const did = d && d.id;
        await editPic('D1-renamed', did, D, 'renamed.jpg');
        fact('whole folder', listFolder(folder));
    } finally {
        record(`${key}-facts`, facts);
        await close();
    }
});
