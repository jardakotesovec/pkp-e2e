// U17 claim check, chunk I03C (housekeeping 2026-11-03): the incidentals row on OMP's series cover "Delete" when the
// cover is already gone, plus the Fields row "Cover Image" and Rule 15's cover claims it bears on.
//
// Runs on a dataset fleet (PKP's default test dataset), as `rvaca` (Press manager / Journal manager / Preprint
// Server manager). Every series it adds is named "u17i03c <part> <run>" with the path "u17i03c<part><run>".
// PART= picks one phase (default: all that the app has):
//   controls {OJS OMP OPS}  the empty "Add Series" window (its "Cover Image" uploader, the file picker's types, no
//                           "Current Image"); on OJS and OPS the "Create Section" window, which has no cover at all.
//   stale    {OMP}  a series saved with cover.png; the series' page; its window open in two tabs (B, the kit's page,
//                   first; then A); in A "Delete" › "Cancel" (control), then "Delete" › "OK"; in B "Delete" › "OK"
//                   on the cover already gone: the message, the server's answer, the window; B reloaded: what the
//                   window offers; the stored record and the series' page.
//   gone     {OMP}  a series saved with cover.png, its window open in B; in A the series deleted from the table; in
//                   B "Delete" › "OK", then the stale window's "Save".
//   broken   {OMP}  a series saved with cover.png, then a damaged PNG (IDAT checksum flipped) saved over it (OMP10:
//                   the save never answers); reloaded: the broken "Current Image" and its "Delete" › "OK".
//   svg      {OMP}  a series without cover; "Edit", a subtitle and an SVG chosen, "Save" (OMP3).
//   gonesection {OJS OPS} (named only, not in the default): a section "u17i03c Gone <run>" created, its window open
//                   in B, deleted from the table in A, then B's "Save" (the sweep of "gone" on the other apps).
//   leave    {OMP}  a series without cover; "Edit", cover.png uploaded and a subtitle typed, unsaved, then "Cancel";
//                   again, then the window's "×"; reopened each time.
// Each run under its own PROBE_RUN (r1, r2). No other script and no file of another script is read; the picture
// files are written by this script through outFile().
//
// Reset first (fleet issues-cc6 is dataset fleet 6):  npm run fleet-prep -- --feature issues-cc6 --dataset 6 --reset
// Run (each app under the session's app lock, one app per call):
//   bin/app-lock.sh shared omp -- env PART=stale PROBE_RUN=r1 PROBE_FEATURE=issues-cc6 PROBE_NOTES_FEATURE=U17 \
//       PROBE_AGENT=ccI03C node bin/probe.js omp shared/playwright/checks/U17/I03C/i03c.js
//   (PART=controls also with ojs and ops)
// Facts: .reports/issues-cc6/ccI03C/facts-<part>-<run>-<app>.json; screens beside them (s-<part>-…).
const fs = require('fs');
const {forEachApp, launch, signIn, screen, shot, record, loc, note, idle, sql, serverLog, outFile, rawKeys} = require('../../../probe');

const T = 30_000;
const RUN = process.env.PROBE_RUN || 'r0';
const PART = process.env.PART || 'all';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tidy = (t) => String(t == null ? '' : t).replace(/\s+/g, ' ').trim();

// A 2×3 red PNG; damagedPng() flips the last byte of its IDAT checksum. A small SVG.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAADCAIAAAA2iEnWAAAAEElEQVR4nGP4z8AARAwoFABE0AX7pM/egAAAAABJRU5ErkJggg==', 'base64');
function damagedPng() {
    const b = Buffer.from(PNG);
    const at = b.indexOf('IDAT');
    const len = b.readUInt32BE(at - 4);
    b[at + 4 + len + 3] ^= 0xff;
    return b;
}
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="20" height="30"><rect width="20" height="30" fill="#c00"/></svg>');

const want = (p) => PART === 'all' || PART === p;

forEachApp(async (app) => {
    if (!app.dataset) throw new Error('i03c.js runs on a dataset fleet (fleet-prep --dataset n --reset)');
    const facts = {app: app.name, run: RUN, part: PART, steps: {}};
    const fact = (k, v) => {
        facts.steps[k] = v;
        console.log(`[fact] ${app.name} ${k}: ${JSON.stringify(v).slice(0, 1500)}`);
    };
    const snap = async (p, n) => {
        const s = await screen(p);
        record(`s-${n}`, s);
        return s;
    };
    const files = {
        cover: outFile('cover.png'),
        damaged: outFile('damaged.png'),
        svg: outFile('cover.svg'),
    };
    fs.writeFileSync(files.cover, PNG);
    fs.writeFileSync(files.damaged, damagedPng());
    fs.writeFileSync(files.svg, SVG);
    const log = serverLog(app);

    const {SectionsTab} = require('../../../pages/SectionsPages.js');
    const isOMP = app.name === 'omp';
    const tabOf = (p) =>
        isOMP
            ? new SectionsTab(p, app.contextPath, {tab: 'Series', addLabel: 'Add Series', formId: 'seriesForm'})
            : new SectionsTab(p, app.contextPath);
    const formId = isOMP ? 'seriesForm' : 'sectionForm';

    const {page, close} = await launch(app);
    const dialogs = [];
    const onDialog = (who) => (d) => {
        dialogs.push({tab: who, type: d.type(), message: d.message()});
        d.accept().catch(() => null);
    };
    page.on('dialog', onDialog('B'));
    let pageA = null;

    const step = async (label, action) => {
        try {
            const out = await action();
            const plain = out === undefined || (out && typeof out === 'object' && !['Object', 'Array'].includes(out.constructor && out.constructor.name));
            fact(label, plain ? 'done' : out);
            return out;
        } catch (e) {
            fact(`${label} threw`, String(e.message).split('\n')[0]);
            return null;
        }
    };

    // ---- the window, read as data
    const windowState = (p) =>
        p.evaluate((fid) => {
            const visible = (el) => !!(el && (el.offsetWidth || el.offsetHeight || el.getClientRects().length));
            const form = document.querySelector(`form#${fid}`);
            if (!form || !visible(form)) return {windowOpen: false};
            const preview = form.querySelector('#coverImagePreview');
            const input = form.querySelector('input[type=file]');
            const save = form.querySelector('button.submitFormButton');
            const area = form.querySelector('#coverImage');
            return {
                windowOpen: true,
                coverArea: area ? area.innerText.replace(/\s+/g, ' ').trim() : null,
                fileInputs: form.querySelectorAll('input[type=file]').length,
                accept: input ? input.getAttribute('accept') : null,
                previewImages: preview
                    ? [...preview.querySelectorAll('img')].map((i) => ({alt: i.getAttribute('alt'), src: i.getAttribute('src'), naturalWidth: i.naturalWidth, shown: visible(i)}))
                    : null,
                previewShown: preview ? visible(preview.querySelector('.pkp_form_image_view')) : null,
                deleteLinks: preview ? [...preview.querySelectorAll('a')].filter(visible).map((a) => a.textContent.trim()) : [],
                saveDisabled: save ? save.disabled : null,
                spinner: !!form.querySelector('.pkp_spinner.is_visible'),
                errors: [...form.querySelectorAll('label.error, #formErrors li, .pkp_form_error')].filter(visible).map((e) => e.textContent.replace(/\s+/g, ' ').trim()),
                subtitle: (form.querySelector('[name="subtitle[en]"]') || {}).value,
                title: (form.querySelector('[name="title[en]"]') || {}).value,
            };
        }, formId);
    const answerOf = async (p, url) => {
        const r = await p.request.get(new URL(url, p.url()).toString()).catch(() => null);
        return r ? {status: r.status(), type: r.headers()['content-type'], bytes: (await r.body().catch(() => Buffer.alloc(0))).length} : null;
    };
    const stored = (path) => sql(app, `select series_id, image from series where path = '${path}'`);
    const seriesPage = async (p, path) => {
        const resp = await p.goto(app.url(`/index.php/${app.contextPath}/catalog/series/${path}`));
        await idle(p).catch(() => null);
        const imgs = await p.locator('.pkp_structure_main img').evaluateAll((els) =>
            els.map((e) => ({src: e.getAttribute('src'), alt: e.getAttribute('alt'), naturalWidth: e.naturalWidth}))
        ).catch(() => []);
        for (const i of imgs) if (i.src) i.answer = await answerOf(p, i.src);
        return {status: resp ? resp.status() : null, images: imgs};
    };

    const upload = async (p, win, path) => {
        const answered = p
            .waitForResponse((r) => r.request().method() === 'POST' && /upload-image/.test(r.url()), {timeout: 15_000})
            .then((r) => r.status())
            .catch(() => null);
        await win.form().locator('input[type=file]').first().setInputFiles(path);
        const status = await answered;
        await sleep(800);
        await idle(p).catch(() => null);
        return {upload: status, box: tidy(await win.form().locator('#coverImage').innerText().catch(() => ''))};
    };
    const save = async (p, win, {expectClose = true} = {}) => {
        const from = log.mark();
        const answered = p.waitForResponse((r) => r.request().method() === 'POST' && /update-series/.test(r.url()), {timeout: T}).catch((e) => e);
        await win.saveButton().click();
        const r = await answered;
        if (r instanceof Error) return {answered: false, ...(await windowState(p)), serverLog: log.since(from).map((l) => l.slice(0, 300))};
        const body = (await r.text().catch(() => '')).slice(0, 400);
        if (expectClose) await win.form().waitFor({state: 'hidden', timeout: 8_000}).catch(() => null);
        await idle(p).catch(() => null);
        await sleep(1500);
        return {status: r.status(), body, ...(await windowState(p)), serverLog: log.since(from).map((l) => l.slice(0, 300))};
    };
    const openEdit = async (p, title) => {
        const tab = tabOf(p);
        await tab.goto();
        const win = await tab.openEdit(title);
        await idle(p);
        await sleep(500);
        return win;
    };
    const cancel = async (p, win) => {
        if (await win.form().isVisible().catch(() => false)) {
            await win.cancelLink().click().catch(() => null);
            await win.form().waitFor({state: 'hidden', timeout: 10_000}).catch(() => null);
            await sleep(600);
        }
        return {windowOpen: await win.form().isVisible().catch(() => false)};
    };
    const addSeries = async (p, title, path, cover) => {
        const tab = tabOf(p);
        await tab.goto();
        const win = await tab.openAdd();
        await win.type('title[en]', title);
        await win.box('path').fill(path);
        const up = cover ? await upload(p, win, cover) : null;
        const saved = await save(p, win);
        return {upload: up, save: {status: saved.status, windowOpen: saved.windowOpen, body: saved.body && saved.body.slice(0, 120)}};
    };

    // "Delete" on the window's cover: the "Confirm" window, then `answer` ("OK" | "Cancel"); returns what followed.
    const coverDelete = async (p, label, answer) => {
        const link = p.locator(`form#${formId} #coverImagePreview`).getByRole('link', {name: 'Delete', exact: true});
        if (!(await link.isVisible().catch(() => false))) return {deleteLink: false};
        const confirm = p.getByRole('dialog').filter({hasText: 'Are you sure you wish to delete this item?'});
        await link.click();
        await confirm.waitFor({state: 'visible', timeout: T});
        await idle(p).catch(() => null);
        const asked = {
            heading: tidy(await confirm.getByRole('heading').first().innerText().catch(() => '')),
            text: tidy(await confirm.innerText().catch(() => '')),
            buttons: (await confirm.getByRole('button').allInnerTexts().catch(() => [])).map(tidy),
        };
        if (p === page) record(`s-${label}-confirm`, await screen(p));
        const before = dialogs.length;
        const from = log.mark();
        const answered =
            answer === 'OK'
                ? p.waitForResponse((r) => r.request().method() === 'POST' && /delete-image/.test(r.url()), {timeout: T}).catch((e) => e)
                : Promise.resolve(null);
        await confirm.getByRole('button', {name: answer, exact: true}).click();
        const r = await answered;
        let reply = null;
        if (r && !(r instanceof Error)) reply = {status: r.status(), url: r.url().replace(/^https?:\/\/[^/]+/, ''), body: (await r.text().catch(() => '')).slice(0, 500)};
        else if (r instanceof Error) reply = {error: String(r.message).split('\n')[0]};
        await idle(p).catch(() => null);
        await sleep(2500);
        const confirmAfter = {
            open: await confirm.isVisible().catch(() => false),
            buttons: await confirm
                .getByRole('button')
                .evaluateAll((bs) => bs.map((b) => ({text: b.textContent.trim(), disabled: b.disabled || b.getAttribute('aria-disabled') === 'true'})))
                .catch(() => []),
        };
        const out = {asked, reply, browserDialogs: dialogs.slice(before), confirmAfter, window: await windowState(p), serverLog: log.since(from).map((l) => l.slice(0, 300))};
        if (p === page) {
            out.rawKeys = await rawKeys(p).catch(() => null);
            record(`s-${label}-after`, await screen(p));
            await shot(p, `s-${label}-after`);
        }
        return out;
    };
    // Close a "Confirm" window left open: its "Cancel", then Escape if that does nothing.
    const closeConfirm = async (p) => {
        const confirm = p.getByRole('dialog').filter({hasText: 'Are you sure you wish to delete this item?'});
        if (!(await confirm.isVisible().catch(() => false))) return 'not open';
        await confirm.getByRole('button', {name: 'Cancel', exact: true}).click({timeout: 3000}).catch(() => null);
        await sleep(1200);
        if (!(await confirm.isVisible().catch(() => false))) return 'closed by Cancel';
        await p.keyboard.press('Escape');
        await sleep(1200);
        return (await confirm.isVisible().catch(() => false)) ? 'still open after Cancel and Escape' : 'closed by Escape (Cancel did nothing)';
    };

    try {
        await step('sign in as rvaca', () => signIn(page, 'rvaca'));

        // -------------------------------------------------------------- controls (every app)
        if (want('controls')) {
            const tab = tabOf(page);
            await step('controls: settings tab', () => tab.goto().then(() => 'open'));
            await snap(page, 'controls-tab');
            const win = await step('controls: Add / Create window', () => tab.openAdd().then((w) => w));
            if (win) {
                await idle(page);
                await sleep(500);
                fact('controls: window', await windowState(page));
                fact('controls: window has "Cover Image"', (await page.locator(`form#${formId}`).innerText()).includes('Cover Image'));
                if (isOMP) {
                    fact('controls: Order of monographs', tidy(await win.selectedOption('sortOption').innerText().catch(() => '')));
                    await loc(page, 'series window: cover uploader', page.locator('form#seriesForm #coverImage'));
                    await loc(page, 'series window: Current Image preview', page.locator('form#seriesForm #coverImagePreview img'));
                }
                await snap(page, 'controls-window');
                await shot(page, `s-controls-window`);
                await cancel(page, win);
            }
        }

        // -------------------------------------------------------------- gonesection {OJS OPS}: the sweep of "gone"
        if (!isOMP && PART === 'gonesection') {
            const title = `u17i03c Gone ${RUN}`;
            const abbrev = `U17G${RUN}`;
            const sql1 = () =>
                sql(app, `select s.section_id from sections s join section_settings ss on ss.section_id = s.section_id where ss.setting_name = 'title' and ss.setting_value = '${title}'`) || '(none)';
            await step('gonesection 1 Create Section, Save', async () => {
                const tab = tabOf(page);
                await tab.goto();
                const win = await tab.openAdd();
                await win.type('title[en]', title);
                await win.type('abbrev[en]', abbrev);
                if (app.name === 'ops') await win.box('path').fill(`u17i03cgone${RUN}`);
                const r = await win.save();
                await win.form().waitFor({state: 'hidden', timeout: 8_000}).catch(() => null);
                return {status: r.status(), body: (await r.text().catch(() => '')).slice(0, 160)};
            });
            fact('gonesection 1 stored', sql1());
            const winB = await step('gonesection 2 B: Edit', () => openEdit(page, title));
            pageA = await page.context().newPage();
            pageA.on('dialog', onDialog('A'));
            await step('gonesection 3 A: the table, the row › Delete › OK', async () => {
                const tab = tabOf(pageA);
                await tab.goto();
                const w = await tab.openDelete(title);
                const r = await tab.confirm(w);
                return {status: r.status(), body: (await r.text().catch(() => '')).slice(0, 200), rowLeft: await tab.row(title).count()};
            });
            fact('gonesection 3 stored', sql1());
            await pageA.close().catch(() => null);
            pageA = null;
            await page.bringToFront();
            await step('gonesection 4 B: Save on the deleted section', async () => {
                if (!winB) return 'no window';
                const before = dialogs.length;
                const from = log.mark();
                const answered = page.waitForResponse((r) => r.request().method() === 'POST' && /update-section/.test(r.url()), {timeout: T});
                await winB.saveButton().click();
                const r = await answered;
                const body = (await r.text().catch(() => '')).slice(0, 300);
                await winB.form().waitFor({state: 'hidden', timeout: 8_000}).catch(() => null);
                await idle(page).catch(() => null);
                await sleep(1500);
                return {status: r.status(), body, ...(await windowState(page)), browserDialogs: dialogs.slice(before), serverLog: log.since(from).map((l) => l.slice(0, 300))};
            });
            await snap(page, 'gonesection-B-saved');
            fact('gonesection 4 stored', sql1());
            if (winB) await cancel(page, winB);
            await step('gonesection 5 reload: the table', async () => {
                const tab = tabOf(page);
                await tab.goto();
                return {rows: await tab.row(title).count()};
            });
        }

        if (isOMP) {
            // ---------------------------------------------------------- stale: the cover already deleted in tab A
            if (want('stale')) {
                const title = `u17i03c Stale ${RUN}`;
                const path = `u17i03cstale${RUN}`;
                await step('stale 1 Add Series with cover.png, Save', () => addSeries(page, title, path, files.cover));
                fact('stale 1 stored', stored(path));
                await step('stale 1 the series page', () => seriesPage(page, path));
                await snap(page, 'stale-seriespage-before');
                let winB = await step('stale 2 B: Edit', () => openEdit(page, title));
                fact('stale 2 B window', await windowState(page));
                await snap(page, 'stale-B-open');
                await loc(page, 'series window: cover "Delete" link', page.locator('form#seriesForm #coverImagePreview').getByRole('link', {name: 'Delete', exact: true}));
                pageA = await page.context().newPage();
                pageA.on('dialog', onDialog('A'));
                const winA = await step('stale 3 A: Edit (second tab)', () => openEdit(pageA, title));
                fact('stale 3 A window', await windowState(pageA));
                await step('stale 4 A: Delete › Cancel (control)', () => coverDelete(pageA, 'stale-A-cancel', 'Cancel'));
                await step('stale 5 A: Delete › OK', () => coverDelete(pageA, 'stale-A-ok', 'OK'));
                fact('stale 5 stored', stored(path));
                await page.bringToFront();
                fact('stale 6 B window before (unchanged)', await windowState(page));
                await step('stale 6 B: Delete › OK on the cover already gone', () => coverDelete(page, 'stale-B-ok', 'OK'));
                await step('stale 6a B: close the Confirm window', () => closeConfirm(page));
                fact('stale 6a B window', await windowState(page));
                await snap(page, 'stale-B-closed-confirm');
                fact('stale 6 stored', stored(path));
                if (winB) await step('stale 7 B: Cancel', () => cancel(page, winB));
                await step('stale 7 B: reload, Edit', async () => {
                    await page.reload();
                    winB = await openEdit(page, title);
                    return windowState(page);
                });
                await snap(page, 'stale-B-reloaded');
                await shot(page, `s-stale-B-reloaded`);
                if (winB) await cancel(page, winB);
                await step('stale 8 the series page', () => seriesPage(page, path));
                if (winA) await cancel(pageA, winA).catch(() => null);
                await pageA.close().catch(() => null);
                pageA = null;
            }

            // ---------------------------------------------------------- gone: the series deleted in tab A
            if (want('gone')) {
                const title = `u17i03c Gone ${RUN}`;
                const path = `u17i03cgone${RUN}`;
                await step('gone 1 Add Series with cover.png, Save', () => addSeries(page, title, path, files.cover));
                const id = (stored(path) || '').split('|')[0];
                fact('gone 1 stored', stored(path));
                let winB = await step('gone 2 B: Edit', () => openEdit(page, title));
                fact('gone 2 B window', await windowState(page));
                pageA = await page.context().newPage();
                pageA.on('dialog', onDialog('A'));
                await step('gone 3 A: the table, the series row › Delete › OK', async () => {
                    const tab = tabOf(pageA);
                    await tab.goto();
                    const w = await tab.openDelete(title);
                    const asked = tidy(await w.root().innerText().catch(() => ''));
                    const r = await tab.confirm(w);
                    return {asked, status: r.status(), body: (await r.text().catch(() => '')).slice(0, 200), rowLeft: await tab.row(title).count()};
                });
                fact('gone 3 stored', stored(path) || `(no row for path ${path})`);
                fact('gone 3 stored by id', id ? sql(app, `select series_id from series where series_id = ${Number(id)}`) || '(none)' : null);
                await pageA.close().catch(() => null);
                pageA = null;
                await page.bringToFront();
                await step('gone 4 B: Delete › OK on the deleted series', () => coverDelete(page, 'gone-B-ok', 'OK'));
                await step('gone 4a B: close the Confirm window', () => closeConfirm(page));
                fact('gone 4a B window', await windowState(page));
                await step('gone 5 B: Save on the deleted series (sweep)', async () => {
                    if (!winB) return 'no window';
                    const before = dialogs.length;
                    const out = await save(page, winB, {expectClose: false});
                    return {...out, browserDialogs: dialogs.slice(before)};
                });
                await snap(page, 'gone-B-saved');
                await shot(page, `s-gone-B-saved`);
                fact('gone 5 stored by path', stored(path) || '(none)');
                fact('gone 5 series named like it', sql(app, `select s.series_id, s.path from series s join series_settings ss on ss.series_id = s.series_id where ss.setting_name = 'title' and ss.setting_value = '${title}'`) || '(none)');
                if (winB) await cancel(page, winB);
                await step('gone 6 reload: the table', async () => {
                    const tab = tabOf(page);
                    await tab.goto();
                    return {rows: await tab.row(title).count()};
                });
            }

            // ---------------------------------------------------------- broken: OMP10's broken cover, then "Delete"
            if (want('broken')) {
                const title = `u17i03c Broken ${RUN}`;
                const path = `u17i03cbroken${RUN}`;
                await step('broken 1 Add Series with cover.png, Save', () => addSeries(page, title, path, files.cover));
                fact('broken 1 stored', stored(path));
                let win = await step('broken 2 Edit', () => openEdit(page, title));
                await step('broken 2 Subtitle, damaged.png', async () => {
                    await win.box('subtitle[en]').fill(`u17i03c broken ${RUN}`);
                    return upload(page, win, files.damaged);
                });
                await step('broken 3 Save', () => save(page, win, {expectClose: false}));
                await snap(page, 'broken-saved');
                await step('broken 3a Cancel', () => cancel(page, win));
                fact('broken 3 stored', stored(path));
                win = await step('broken 4 reload, Edit', async () => {
                    await page.reload();
                    return openEdit(page, title);
                });
                const st = await windowState(page);
                if (st.previewImages) for (const i of st.previewImages) i.answer = await answerOf(page, i.src);
                fact('broken 4 window (the broken picture)', st);
                await snap(page, 'broken-reopened');
                await step('broken 5 Delete › OK on the broken cover', () => coverDelete(page, 'broken-ok', 'OK'));
                await step('broken 5a close the Confirm window', () => closeConfirm(page));
                fact('broken 5 stored', stored(path));
                if (win) await cancel(page, win);
                await step('broken 6 reload, Edit', async () => {
                    await page.reload();
                    win = await openEdit(page, title);
                    return windowState(page);
                });
                await snap(page, 'broken-B-reloaded');
                if (win) await cancel(page, win);
                await step('broken 7 the series page', () => seriesPage(page, path));
            }

            // ---------------------------------------------------------- svg (OMP3)
            if (want('svg')) {
                const title = `u17i03c Svg ${RUN}`;
                const path = `u17i03csvg${RUN}`;
                await step('svg 1 Add Series, no cover, Save', () => addSeries(page, title, path, null));
                let win = await step('svg 2 Edit', () => openEdit(page, title));
                await step('svg 2 Subtitle, cover.svg', async () => {
                    await win.box('subtitle[en]').fill(`u17i03c svg ${RUN}`);
                    return upload(page, win, files.svg);
                });
                const before = dialogs.length;
                await step('svg 3 Save', () => save(page, win, {expectClose: false}));
                fact('svg 3 browser dialogs', dialogs.slice(before));
                await snap(page, 'svg-saved');
                await shot(page, `s-svg-saved`);
                await step('svg 3a Cancel', () => cancel(page, win));
                win = await step('svg 4 reload, Edit', async () => {
                    await page.reload();
                    return openEdit(page, title);
                });
                fact('svg 4 window', await windowState(page));
                fact('svg 4 stored', stored(path));
                if (win) await cancel(page, win);
            }

            // ---------------------------------------------------------- leave: unsaved cover and subtitle
            if (want('leave')) {
                const title = `u17i03c Leave ${RUN}`;
                const path = `u17i03cleave${RUN}`;
                await step('leave 1 Add Series, no cover, Save', () => addSeries(page, title, path, null));
                let win = await step('leave 2 Edit', () => openEdit(page, title));
                await step('leave 2 Subtitle, cover.png (unsaved)', async () => {
                    await win.box('subtitle[en]').fill('u17i03c unsaved');
                    await win.box('subtitle[en]').blur();
                    return upload(page, win, files.cover);
                });
                let before = dialogs.length;
                await step('leave 3 Cancel', () => cancel(page, win));
                fact('leave 3 browser dialogs', dialogs.slice(before));
                await snap(page, 'leave-cancelled');
                win = await step('leave 4 Edit again', () => openEdit(page, title));
                fact('leave 4 window', await windowState(page));
                fact('leave 4 stored', stored(path));
                await step('leave 5 Subtitle, cover.png (unsaved), then the window\'s ×', async () => {
                    await win.box('subtitle[en]').fill('u17i03c unsaved x');
                    await win.box('subtitle[en]').blur();
                    await upload(page, win, files.cover);
                    before = dialogs.length;
                    const x = page.getByRole('dialog').filter({has: page.locator('form#seriesForm')}).getByRole('button', {name: /close/i}).first();
                    const label = await x.getAttribute('aria-label').catch(() => null);
                    await x.click();
                    await sleep(1500);
                    const askedInPage = await page
                        .getByRole('dialog')
                        .filter({hasNot: page.locator('form#seriesForm')})
                        .allInnerTexts()
                        .catch(() => []);
                    await snap(page, 'leave-x');
                    return {closeLabel: label, browserDialogs: dialogs.slice(before), pageDialogs: askedInPage.map(tidy), window: await windowState(page)};
                });
                // Answer an in-page question, if any, with its leaving button.
                await step('leave 5a answer an in-page question', async () => {
                    const q = page.getByRole('dialog').filter({hasNot: page.locator('form#seriesForm')});
                    if (!(await q.count())) return 'none';
                    const buttons = (await q.getByRole('button').allInnerTexts()).map(tidy);
                    const yes = q.getByRole('button', {name: /^(OK|Yes|Leave|Close|Discard)/}).first();
                    if (await yes.count()) await yes.click();
                    await sleep(1200);
                    return {buttons, window: await windowState(page)};
                });
                win = await step('leave 6 Edit again', async () => {
                    await page.reload();
                    return openEdit(page, title);
                });
                fact('leave 6 window', await windowState(page));
                fact('leave 6 stored', stored(path));
                if (win) await cancel(page, win);
            }
        }
    } finally {
        if (pageA) await pageA.close().catch(() => null);
        facts.dialogs = dialogs;
        record(`facts-${PART}`, facts);
        await close();
    }
});
