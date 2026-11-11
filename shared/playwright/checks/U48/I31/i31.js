// U48 incidentals chunk I31 (housekeeping 2026-11-11): three incidentals rows of 2026-11-09 against
// Rule 23, Rule 24 ("Export"), register A2 and A5, on OJS's dataset fleet (PKP's default test dataset),
// reset before each run. One script, three parts (PART=a|b|c, default all, in that order):
//   A  row 1, Body Text "Export" as a Layout Editor. As dbarnes: Participants (Production) of submission 6,
//      "Edit" on Graham Cox (Layout Editor), "Permissions" ticked. As gcox on 5 (no Permissions) and on 6
//      (Permissions): Body Text, a sentence typed and not saved, "Export" › "Export to HTML", "Preview: PDF" ›
//      "Create PDF", then "Save"; the Galleys list read in a second tab after each; the reloaded Body Text;
//      leaving the page with a change unsaved (side menu › "Galleys").
//   B  row 2, which screen actions send the Body Text save (PUT …/bodyText) and whether its `bodyText`
//      field is there. As dbarnes on 9 (Body Text never saved): "Save" untouched, typed, emptied
//      (Ctrl+A, Delete), a pasted text larger than the server's post_max_size (8M), and a pasted HTML
//      with images whose address is not http(s) or is another submission's file, then "Export to HTML".
//   C  row 3 and the rest of Rule 24, as dbarnes on 17 (published): a sentence typed, a figure, "Save";
//      the signed-out article page and the "JATS XML" page; "Export to HTML"; the same reads; a second
//      sentence typed and exported unsaved; "Create PDF"; "Create New Version", its Body Text "Save"d
//      untouched, a third sentence exported; version 1's article page; on 15 "Export to HTML" pressed in
//      two tabs at once; the author of 17 (vkarbasizaed): the workflow's menu and the export routes as
//      that author (no screen calls them for an author: the Frame's direct check).
// Run (reset before each run; r1 and r2):
//   npm run reset:ojs -- --dataset 2
//   PART=abc PROBE_RUN=r1 PROBE_FEATURE=inc-U48 PROBE_AGENT=cc1111a PROBE_NOTES_FEATURE=U48 \
//     bin/app-lock.sh shared ojs -- node bin/probe.js ojs shared/playwright/checks/U48/I31/i31.js
// Facts: .reports/inc-U48/cc1111a/i31-facts-<run>-ojs.json; snapshots i31-<step>-<run>-ojs.json and .png.
// No other script or file is read. Runs on demand, never in CI.
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, signOut, screen, shot, record, loc, note, idle, sql, apiAs, serverLog} = require('../../../probe');

const T = 30_000;
const flat = (s, n = 400) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PART = (process.env.PART || 'abc').toLowerCase();
const RUN = process.env.PROBE_RUN || 'run';
const FIGURE = path.resolve(__dirname, '../../../../../apps/ojs/playwright/fixtures/files/figure.png');

forEachApp(async (app) => {
    if (app.name !== 'ojs') return;
    if (!app.dataset) throw new Error('i31.js runs on a dataset fleet (fleet-prep --dataset)');
    const {WorkflowPage} = require('../../../pages/WorkflowPage.js');
    const {GalleyManager} = require('../../../pages/GalleysPages.js');
    const {BodyTextPage, JatsPage} = require('../../../pages/JatsBodyTextPages.js');
    const {ParticipantsPanel} = require('../../../pages/StageParticipantsPages.js');
    const {expect} = require('@playwright/test');
    const ctx = app.contextPath;

    const facts = {app: app.name, run: RUN, part: PART};
    const fact = (k, v) => {
        facts[k] = v;
        console.log(`[fact] ${k}: ${flat(JSON.stringify(v), 1200)}`);
    };
    const pub = (sub) => Number(sql(app, `select current_publication_id from submissions where submission_id = ${sub}`));
    const configFile = path.isAbsolute(app.configFile) ? app.configFile : path.resolve(__dirname, '../../../../..', app.configFile);
    const filesDir = (fs.readFileSync(configFile, 'utf8').match(/^files_dir\s*=\s*"?([^"\n]+?)"?\s*$/m) || [])[1];
    const galleysDb = (publicationId) => String(sql(app, `select g.galley_id, g.label, coalesce(g.submission_file_id::text,'-'), coalesce(f.path,'-'),
            (select count(*) from submission_file_revisions r where r.submission_file_id = g.submission_file_id),
            coalesce((select setting_value from publication_galley_settings s where s.galley_id = g.galley_id and s.setting_name = 'generatedFrom'),'-')
        from publication_galleys g left join submission_files sf on sf.submission_file_id = g.submission_file_id
        left join files f on f.file_id = sf.file_id where g.publication_id = ${publicationId} order by g.galley_id`)).split('\n').filter(Boolean)
        .map((l) => {
            const [id, label, sfid, rel, revisions, generatedFrom] = l.split('|');
            let text = null;
            let imgs;
            if (rel && rel !== '-' && filesDir) {
                try {
                    const b = fs.readFileSync(path.join(filesDir, rel));
                    const html = /html/i.test(rel) || label === 'HTML';
                    text = html ? flat(b.toString('utf8').replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' '), 300) : flat(b.toString('latin1').slice(0, 8), 10);
                    if (html) imgs = [...b.toString('utf8').matchAll(/<img[^>]*>/g)].map((m) => flat(m[0], 160));
                } catch (e) { text = `unreadable: ${flat(e.message, 80)}`; }
            }
            return {id: Number(id), label, submissionFileId: sfid, revisions: Number(revisions), generatedFrom, text, imgs};
        });

    const {page, close} = await launch(app);
    const context = page.context();
    // every non-GET request to the Body Text API: method, override, size, the `bodyText` field
    const sent = [];
    const byReq = new WeakMap();
    context.on('request', (req) => {
        if (!/\/bodyText(\/pdf)?(\?|$)/.test(req.url()) || req.method() === 'GET') return;
        const h = req.headers();
        const buf = req.postDataBuffer();
        const e = {at: new Date().toISOString().slice(11, 19), method: req.method(), override: h['x-http-method-override'] || null,
            path: req.url().replace(/^.*\/api\/v1\//, ''), contentType: flat(h['content-type'], 50), size: buf ? buf.length : 0,
            bodyTextField: buf ? buf.includes('name="bodyText"') : false, status: null};
        sent.push(e);
        byReq.set(req, e);
    });
    context.on('response', (r) => {
        const e = byReq.get(r.request());
        if (e) e.status = r.status();
    });
    const sentSince = (n) => sent.slice(n).map((e) => ({...e}));

    let tab2 = null; // second tab of the same session, for the Galleys list while the editor keeps its text
    const snap = async (name, p = page) => {
        const s = await screen(p);
        record(`i31-${name}`, s);
        await shot(p, `i31-${name}`).catch(() => {});
        return s;
    };
    const errorWindow = (p = page) => p.getByRole('dialog').filter({hasText: /^\s*Error/}).last();
    const takeError = async (p = page) => {
        const w = errorWindow(p);
        if (!(await w.isVisible().catch(() => false))) return null;
        const text = flat(await w.innerText(), 300);
        await w.getByRole('button', {name: 'OK', exact: true}).click().catch(() => {});
        await sleep(400);
        return text;
    };
    const frame = (p = page) => new WorkflowPage(p, ctx);
    const body = (p = page) => new BodyTextPage(p, frame(p));
    const exportButton = () => page.getByRole('button', {name: 'Export', exact: true});
    const exportStatus = () => page.locator('.body-text-export ~ [role="status"], .body-text-export + p[role="status"]').first();

    const galleyList = async (name, sub, publicationId) => {
        if (!tab2) tab2 = await context.newPage();
        const manager = new GalleyManager(tab2, frame(tab2));
        await manager.open(sub, publicationId);
        await idle(tab2);
        const s = await snap(name, tab2);
        const names = (await manager.nameCells().allInnerTexts()).map((t) => flat(t, 120));
        const add = await manager.addButton().count();
        return {names, addGalley: add, db: galleysDb(publicationId), notices: s.notices};
    };
    const exportHtml = async (name) => {
        const n = sent.length;
        await exportButton().click();
        const item = page.getByRole('menuitem', {name: 'Export to HTML'});
        await expect(item).toBeVisible({timeout: T});
        const resp = page.waitForResponse((r) => /\/bodyText$/.test(r.url()) && r.request().method() === 'POST', {timeout: 60_000}).catch(() => null);
        await item.click();
        const r = await resp;
        let j = null;
        try { j = r ? await r.json() : null; } catch { /* not JSON */ }
        await sleep(800);
        const statusLine = flat(await exportStatus().innerText().catch(() => null), 80);
        const s = await snap(name);
        const err = await takeError();
        return {status: r ? r.status() : null, galley: j && {id: j.id, label: j.label, generatedFrom: j.generatedFrom, revisionCount: j.revisionCount, error: j.error},
            statusLine, errorWindow: err, notices: s.notices, requests: sentSince(n)};
    };
    const createPdf = async (name) => {
        const n = sent.length;
        await exportButton().click();
        await page.getByRole('menuitem', {name: 'Preview: PDF'}).click();
        const create = page.getByRole('button', {name: 'Create PDF', exact: true});
        await expect(create).toBeVisible({timeout: T});
        const section = page.locator('section.body-text-pdf-preview');
        await expect(page.frameLocator('section.body-text-pdf-preview iframe[srcdoc]').locator('body')).toContainText(/\S/, {timeout: T}).catch(() => {});
        const preview = await snap(`${name}-preview`);
        const previewText = flat(await page.frameLocator('section.body-text-pdf-preview iframe[srcdoc]').locator('body').innerText().catch(() => null), 300);
        const resp = page.waitForResponse((r) => /\/bodyText\/pdf$/.test(r.url()) && r.request().method() === 'POST', {timeout: 180_000}).catch(() => null);
        await create.click();
        const r = await resp;
        const status = section.locator('footer [role="status"]');
        await expect.poll(async () => flat(await status.innerText().catch(() => '')), {timeout: 60_000}).toMatch(/saved|Unable|created/i).catch(() => {});
        const statusLine = flat(await status.innerText().catch(() => null), 100);
        const s = await snap(`${name}-created`);
        const err = await takeError();
        await section.getByRole('button', {name: 'Edit', exact: true}).click();
        await expect(exportButton()).toBeVisible({timeout: T});
        return {status: r ? r.status() : null, statusLine, previewHeading: flat(await section.locator('h2').innerText().catch(() => null), 80),
            previewText, errorWindow: err, notices: [...preview.notices, ...s.notices], requests: sentSince(n)};
    };
    const pressSave = async (name, {wait = 8000} = {}) => {
        const n = sent.length;
        const resp = page.waitForResponse((r) => /\/bodyText(\?|$)/.test(r.url()) && r.request().method() === 'POST', {timeout: wait}).catch(() => null);
        await body().saveButton().click();
        const labels = [];
        for (let i = 0; i < 6; i++) { labels.push(flat(await body().saveButton().innerText().catch(() => null), 20)); await sleep(150); }
        const r = await resp;
        await sleep(600);
        const s = await snap(name);
        const err = await takeError();
        return {response: r ? r.status() : null, labels: [...new Set(labels)], unsaved: await body().unsavedBadge().isVisible().catch(() => null),
            errorWindow: err, notices: s.notices, requests: sentSince(n)};
    };
    const reader = async (name, url) => {
        const rctx = await context.browser().newContext({storageState: {cookies: [], origins: []}});
        const rp = await rctx.newPage();
        try {
            await rp.goto(app.url(url));
            await idle(rp);
            const s = await snap(name, rp);
            const links = (await rp.locator('a.obj_galley_link').evaluateAll((as) => as.map((a) => ({text: a.textContent.trim(), href: a.getAttribute('href')}))));
            const htmlLink = links.find((l) => /HTML/.test(l.text));
            let galleyText = null;
            if (htmlLink) {
                await rp.goto(htmlLink.href);
                await idle(rp);
                await snap(`${name}-html-galley`, rp);
                galleyText = flat(await rp.frameLocator('iframe').first().locator('body').innerText({timeout: 15_000}).catch((e) => `unread: ${flat(e.message, 60)}`), 300);
            }
            return {text: flat(s.text.main, 300), links, galleyText};
        } finally {
            await rctx.close();
        }
    };
    const jatsXml = async (name, sub, publicationId) => {
        if (!tab2) tab2 = await context.newPage();
        const jats = new JatsPage(tab2, frame(tab2));
        await jats.open(sub, publicationId);
        await snap(name, tab2);
        return jats.xmlText();
    };
    const step = async (key, fn) => {
        try {
            fact(key, await fn());
        } catch (e) {
            fact(key, {error: flat(e.stack || e.message, 600)});
            await page.screenshot({path: path.join(require('../../../probe').outDir(), `i31-error-${key}-${RUN}.png`)}).catch(() => {});
        }
    };

    try {
        // ------------------------------------------------------------------ A
        if (PART.includes('a')) {
            await signIn(page, 'dbarnes', {contextPath: ctx});
            await step('A0 Permissions for gcox on 6', async () => {
                const panel = new ParticipantsPanel(page, ctx);
                await panel.goto(6, {menuKey: 'workflow_5'});
                await snap('a0-participants-6');
                const win = await panel.openEdit('Graham Cox');
                const box = win.metadataBox();
                const before = await box.isChecked();
                await snap('a0-edit-assignment');
                await box.check();
                await win.ok();
                return {before, after: sql(app, "select can_change_metadata from stage_assignments sa join users u on u.user_id = sa.user_id where sa.submission_id = 6 and u.username = 'gcox'")};
            });
            await signOut(page, {origin: app.url('')}).catch(() => {});
            for (const [key, sub] of [['without', 5], ['with', 6]]) {
                const p = pub(sub);
                const k = `A ${key} (${sub})`;
                await signIn(page, 'gcox', {contextPath: ctx});
                await step(`${k} 1 Body Text`, async () => {
                    await body().open(sub, p);
                    const s = await snap(`a-${key}-1-bodytext`);
                    await exportButton().click();
                    const items = await page.getByRole('menuitem').evaluateAll((els) => els.map((e) => ({text: e.textContent.trim(), disabled: e.getAttribute('aria-disabled') || e.disabled || null})));
                    await snap(`a-${key}-1-export-menu`);
                    await exportButton().click();
                    await loc(page, 'Body Text: the "Export" menu button', exportButton());
                    return {heading: flat(s.text.dialog || s.text.main, 160), menu: items, save: flat(await body().saveButton().innerText(), 20), unsaved: await body().unsavedBadge().isVisible()};
                });
                const sentence = `I31 ${key} unsaved sentence ${RUN}`;
                await step(`${k} 2 typed`, async () => {
                    await body().typeAtEnd(sentence);
                    await snap(`a-${key}-2-typed`);
                    return {editor: await body().editorText(), unsaved: await body().unsavedBadge().isVisible()};
                });
                await step(`${k} 3 Export to HTML`, async () => exportHtml(`a-${key}-3-export-html`));
                await step(`${k} 3 galleys`, async () => galleyList(`a-${key}-3-galleys`, sub, p));
                await step(`${k} 4 Create PDF`, async () => createPdf(`a-${key}-4-pdf`));
                await step(`${k} 4 galleys`, async () => galleyList(`a-${key}-4-galleys`, sub, p));
                await step(`${k} 5 Save`, async () => ({...(await pressSave(`a-${key}-5-save`)), editor: await body().editorText()}));
                await step(`${k} 5 galleys`, async () => galleyList(`a-${key}-5-galleys`, sub, p));
                await step(`${k} 6 reloaded`, async () => {
                    await body().reload();
                    const s = await snap(`a-${key}-6-reloaded`);
                    return {editor: flat(await body().editorText(), 200), unsaved: await body().unsavedBadge().isVisible(), notices: s.notices};
                });
                await step(`${k} 7 leave unsaved`, async () => {
                    const d0 = Date.now();
                    const dialogs = [];
                    const onDialog = (d) => dialogs.push({type: d.type(), message: d.message(), ms: Date.now() - d0});
                    page.on('dialog', onDialog);
                    await body().typeAtEnd(' leave me');
                    await frame().selectPage('Galleys');
                    await idle(page);
                    const s = await snap(`a-${key}-7-left`);
                    page.off('dialog', onDialog);
                    return {dialogs, heading: flat(s.text.dialog || s.text.main, 120)};
                });
                if (tab2) { await tab2.close().catch(() => {}); tab2 = null; }
                await signOut(page, {origin: app.url('')}).catch(() => {});
            }
        }
        // ------------------------------------------------------------------ B
        if (PART.includes('b')) {
            await signIn(page, 'dbarnes', {contextPath: ctx});
            await context.grantPermissions(['clipboard-read', 'clipboard-write'], {origin: new URL(app.url('/')).origin});
            const sub = 9;
            const p = pub(sub);
            await step('B0 Body Text never saved', async () => {
                await body().open(sub, p);
                const s = await snap('b0-bodytext');
                return {editor: await body().editorText(), unsaved: await body().unsavedBadge().isVisible(), bodyTextRows: sql(app, `select count(*) from submission_files where file_stage = 20 and assoc_id = ${p}`), notices: s.notices};
            });
            await step('B1 Save untouched', async () => pressSave('b1-save-untouched'));
            await step('B2 Save typed', async () => {
                await body().typeAtEnd(`I31 b2 typed ${RUN}`);
                return pressSave('b2-save-typed');
            });
            await step('B3 Save emptied', async () => {
                await body().editor().click();
                await page.keyboard.press('ControlOrMeta+a');
                await page.keyboard.press('Delete');
                await snap('b3-emptied');
                const o = await pressSave('b3-save-emptied');
                await body().reload();
                o.reloaded = {editor: await body().editorText(), unsaved: await body().unsavedBadge().isVisible()};
                await snap('b3-reloaded');
                return o;
            });
            await step('B4 Save of a text larger than post_max_size', async () => {
                const log = serverLog(app);
                const from = log.mark();
                const line = 'I31 long paragraph '.padEnd(9_990, 'x') + '\n';
                const big = line.repeat(900); // about 9 MB of text
                await body().editor().click();
                await page.keyboard.press('ControlOrMeta+a');
                await page.evaluate(async (t) => navigator.clipboard.writeText(t), big);
                await page.keyboard.press('ControlOrMeta+v');
                await expect.poll(async () => body().paragraphs().count(), {timeout: 120_000}).toBeGreaterThan(800).catch(() => {});
                const o = await pressSave('b4-save-big', {wait: 120_000});
                o.paragraphs = await body().paragraphs().count();
                o.serverLog = log.since(from).map((l) => flat(l, 300)).slice(0, 8);
                await body().reload();
                o.reloaded = {editorChars: (await body().editorText()).length, unsaved: await body().unsavedBadge().isVisible()};
                return o;
            });
            await step('B5 pasted images, then Export to HTML', async () => {
                const other = String(sql(app, 'select submission_file_id from submission_files where submission_id = 17 and file_stage = 10 order by 1 limit 1')).trim();
                const otherUrl = app.url(`/index.php/${ctx}/$$$call$$$/api/file/file-api/download-file?submissionFileId=${other}&submissionId=17&stageId=5`);
                const out = {};
                for (const [k, src] of [['ftp', 'ftp://example.org/i31.png'], ['data', 'data:image/gif;base64,R0lGODlhAQABAAAAACw='], ['other', otherUrl]]) {
                    await body().open(sub, p);
                    await body().editor().click();
                    await page.keyboard.press('ControlOrMeta+a');
                    await page.evaluate(async (html) => {
                        await navigator.clipboard.write([new ClipboardItem({
                            'text/html': new Blob([html], {type: 'text/html'}),
                            'text/plain': new Blob(['I31 pasted'], {type: 'text/plain'}),
                        })]);
                    }, `<p>I31 pasted ${k}</p><figure><img src="${src}" alt="i31"></figure><p>after</p>`);
                    await page.keyboard.press('ControlOrMeta+v');
                    await sleep(1000);
                    await snap(`b5-${k}-pasted`);
                    const imgs = await body().figures().evaluateAll((els) => els.map((e) => (e.getAttribute('src') || '').slice(0, 120)));
                    out[k] = {imgsInEditor: imgs, export: await exportHtml(`b5-${k}-export`), stored: galleysDb(p)};
                }
                out.galleys = galleysDb(p);
                return out;
            });
            await signOut(page, {origin: app.url('')}).catch(() => {});
        }
        // ------------------------------------------------------------------ C
        if (PART.includes('c')) {
            await signIn(page, 'dbarnes', {contextPath: ctx});
            const sub = 17;
            const v1 = pub(sub);
            const S1 = `I31 saved sentence alpha ${RUN}`;
            const S2 = `I31 unsaved sentence beta ${RUN}`;
            const S3 = `I31 new version sentence gamma ${RUN}`;
            await step('C0 start', async () => ({publication: v1, status: sql(app, `select status from publications where publication_id = ${v1}`), galleys: galleysDb(v1),
                reader: await reader('c0-reader', `/index.php/${ctx}/article/view/${sub}`)}));
            await step('C1 typed, figure, Save', async () => {
                await body().open(sub, v1);
                await snap('c1-bodytext');
                await body().typeAtEnd(S1);
                const fig = await body().insertFigure(FIGURE);
                await expect(body().figures()).toHaveCount(1, {timeout: T});
                const o = await pressSave('c1-save');
                o.figureUpload = fig.status();
                return o;
            });
            await step('C2 after Save: reader, JATS XML, galleys', async () => {
                const xml = await jatsXml('c2-jats', sub, v1);
                return {reader: await reader('c2-reader', `/index.php/${ctx}/article/view/${sub}`), jatsCarriesS1: xml.includes(S1), jatsBody: /<body[\s>]/.test(xml),
                    galleys: await galleyList('c2-galleys', sub, v1)};
            });
            await step('C3 Export to HTML', async () => {
                const o = await exportHtml('c3-export-html');
                o.dependentFiles = sql(app, `select count(*) from submission_files d join publication_galleys g on d.assoc_id = g.submission_file_id and d.assoc_type = 515 where g.publication_id = ${v1} and g.label = 'HTML'`);
                return o;
            });
            await step('C3 reads', async () => {
                const xml = await jatsXml('c3-jats', sub, v1);
                const r = await reader('c3-reader', `/index.php/${ctx}/article/view/${sub}`);
                return {galleys: await galleyList('c3-galleys', sub, v1), reader: r, readerGalleyCarriesS1: (r.galleyText || '').includes(S1), jatsCarriesS1: xml.includes(S1), jatsBodyHead: flat((xml.match(/<body[\s\S]{0,300}/) || [''])[0], 300)};
            });
            await step('C4 unsaved sentence exported', async () => {
                await body().typeAtEnd(` ${S2}`);
                const o = await exportHtml('c4-export-html');
                o.galleys = await galleyList('c4-galleys', sub, v1);
                const r = await reader('c4-reader', `/index.php/${ctx}/article/view/${sub}`);
                o.readerGalleyCarriesS2 = (r.galleyText || '').includes(S2);
                o.reader = r;
                return o;
            });
            await step('C5 Create PDF', async () => {
                const o = await createPdf('c5-pdf');
                o.galleys = await galleyList('c5-galleys', sub, v1);
                o.reader = await reader('c5-reader', `/index.php/${ctx}/article/view/${sub}`);
                return o;
            });
            let v2 = null;
            await step('C6 Create New Version', async () => {
                const entry = await frame().revealPublicationEntry('Create New Version');
                await frame().expectVersionLoaded().catch(() => {});
                await entry.click();
                const dialog = page.getByRole('dialog').filter({hasText: 'Which version should metadata be copied from?'});
                await expect(dialog.locator('select[name="versionStage"]')).toBeVisible({timeout: T});
                await snap('c6-version-dialog');
                const created = page.waitForResponse((r) => r.url().includes('/version') && r.request().method() === 'POST', {timeout: T});
                await dialog.getByRole('button', {name: 'Confirm', exact: true}).click();
                const r = await created;
                v2 = (await r.json()).id;
                await expect(dialog).toHaveCount(0, {timeout: T});
                return {status: r.status(), v2, galleysV2: galleysDb(v2)};
            });
            if (v2) {
                await step('C7 new version Body Text, Save untouched', async () => {
                    await body().open(sub, v2);
                    const s = await snap('c7-bodytext-v2');
                    const o = await pressSave('c7-save-untouched');
                    o.opened = {editor: flat(await body().editorText(), 120), notices: s.notices};
                    return o;
                });
                await step('C8 new version: typed, Export to HTML', async () => {
                    await body().typeAtEnd(` ${S3}`);
                    const o = await exportHtml('c8-export-html');
                    o.galleysV2 = await galleyList('c8-galleys-v2', sub, v2);
                    o.galleysV1 = galleysDb(v1);
                    const r = await reader('c8-reader-v1', `/index.php/${ctx}/article/view/${sub}`);
                    o.readerV1 = r;
                    o.readerV1CarriesS3 = (r.galleyText || '').includes(S3);
                    o.readerV1CarriesS2 = (r.galleyText || '').includes(S2);
                    return o;
                });
            }
            await step('C9 two tabs press Export to HTML at once (15)', async () => {
                const p15 = pub(15);
                if (!tab2) tab2 = await context.newPage();
                await body().open(15, p15);
                await body(tab2).open(15, p15);
                for (const pg of [page, tab2]) { await pg.getByRole('button', {name: 'Export', exact: true}).click(); }
                const items = [page, tab2].map((pg) => pg.getByRole('menuitem', {name: 'Export to HTML'}));
                const waits = [page, tab2].map((pg) => pg.waitForResponse((r) => /\/bodyText$/.test(r.url()) && r.request().method() === 'POST', {timeout: 60_000}).catch(() => null));
                await Promise.all(items.map((i) => i.click()));
                const rs = await Promise.all(waits);
                await sleep(1000);
                await takeError(page);
                await takeError(tab2);
                return {statuses: rs.map((r) => r && r.status()), galleys: galleysDb(p15)};
            });
            await signOut(page, {origin: app.url('')}).catch(() => {});
            await step('C10 the author of 17', async () => {
                await signIn(page, 'vkarbasizaed', {contextPath: ctx});
                await frame().gotoAuthor(sub);
                await idle(page);
                const s = await snap('c10-author-workflow');
                const menu = flat(await page.locator('nav, [role="tree"]').first().innerText().catch(() => null), 400);
                const target = v2 || v1;
                const html = await apiAs(page, 'POST', `submissions/${sub}/publications/${target}/bodyText`, '<p>I31 author</p>');
                const pdf = await apiAs(page, 'POST', `submissions/${sub}/publications/${target}/bodyText/pdf`, '%PDF-1.4\n%%EOF\n');
                return {menu, mainText: flat(s.text.dialog || s.text.main, 300), html: {status: html.status(), body: flat(await html.text(), 160)}, pdf: {status: pdf.status(), body: flat(await pdf.text(), 160)}, galleys: galleysDb(target)};
            });
        }
    } finally {
        fact('requests sent to the Body Text API', sent);
        record(`i31-facts`, facts);
        if (tab2) await tab2.close().catch(() => {});
        await close();
    }
});
