// U12 claim check, chunk K2: the "Add Announcement" / "Edit Announcement" panel
// on the journal's Announcements page, on all three apps.
// Spec: docs/specs/U12-announcements.md — Fields & validation (47–69), Rules 5–8
// (131–158), Rules 14–15 (212–225), Settings bullet 6 (311–314); register A2, A3,
// A6, A9; footnotes h, i, j, k, l, f, c, o, r, f-a2, f-a3, f-a6, f-a9.
//
// Seeds two scratch contexts per app (announcements on, a manager, a section
// editor and a reader each): A with two types and three seeded announcements
// (one expired) and the primary language alone under "Forms"; B with French
// under "Forms" and no type. Signs in from the roster and records every screen
// with screen(). Phases:
//   seed     the two contexts (state file reused later)
//   panel    the Add panel's fields, the empty save, the malformed expiry, the
//            .txt in "Image", a full add with a PNG and "Send Email" ticked, the
//            list and public pages, the home page block
//   edit     "Edit": values filled, the title changed, the row's place, the
//            public page; the panel left unsaved by close control / Escape /
//            backdrop; "Send Email" on an edit (A9) with a dated positive
//            control; the type buttons (A6)
//   image    photo.jpeg / PHOTO.PNG on an add and on an edit (A2), .gif and
//            .jpg saving, "Remove" + "Restore Original", the file replaced, the
//            files on disk
//   delete   the "Delete Announcement" dialog: "No" then "Yes"; the row, the
//            public page, the image file
//   expiry   today / tomorrow / a past date cleared (Rule 8)
//   lang     context B: two languages on the panel, the labels, the refusals,
//            the list and the public pages under /fr_CA/; no type → no buttons
//   dateshort Settings › Website › Setup › Date & Time "Date (Short)" changed,
//            then "Edit Announcement" on one with an expiry (A3); restored after
//   admin    the site administrator in journal A: the Add panel as a control level
// Run: PROBE_FEATURE=U12 PROBE_AGENT=ccK2 node bin/probe.js all shared/playwright/checks/U12/K2/k2.js
//   PHASES=seed,panel,… (default: all; seed runs only without a state file or with RESEED=1)
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, signOut, screen, shot, record, loc, note, idle, tag, outDir} =
    require('../../../probe');
const {execFileSync} = require('child_process');

const ALL_PHASES = ['seed', 'panel', 'edit', 'image', 'imgedit', 'delete', 'expiry', 'lang', 'dateshort', 'admin'];
const PHASES = process.env.PHASES ? process.env.PHASES.split(',') : ALL_PHASES;
const on = (p) => PHASES.includes(p);
const log = (...a) => console.log('[k2]', ...a);
const stateFile = (app) => path.join(outDir(), `k2-state-${app.name}.json`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const T = 20_000;
const REPO = path.resolve(__dirname, '../../../../..');
const PNG400 = path.join(REPO, 'apps/ojs/playwright/fixtures/files/profile-image-400.png');

// Small images built with ImageMagick (60×40 gradients), embedded so the script needs no fixture.
const JPEG_B64 = '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAA0JCgsKCA0LCgsODg0PEyAVExISEyccHhcgLikxMC4pLSwzOko+MzZGNywtQFdBRkxOUlNSMj5aYVpQYEpRUk//2wBDAQ4ODhMREyYVFSZPNS01T09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT0//wAARCAAoADwDASIAAhEBAxEB/8QAFgABAQEAAAAAAAAAAAAAAAAAAAUB/8QAFhABAQEAAAAAAAAAAAAAAAAAABNh/8QAFwEBAAMAAAAAAAAAAAAAAAAAAAMEBf/EABYRAQEBAAAAAAAAAAAAAAAAAAASEf/aAAwDAQACEQMRAD8A2JFSiRaFM+U2JFSiRKJTYkVKJEolNiRUokSiVGGEMUY4RxXpYlOhhDFGOEcKJToYQxRjhHCiU6GEMUY4RwolSiRBBqfCJEDTCJEDTCJEDTH/2Q==';
const GIF_B64 = 'R0lGODlhPAAoAPUAAEmDsUuFs0+ItVOMuVmPu16Tv12UvWCVvWGUv2OXvmWWv22fxG6exnKfxnCgxHWjxXaix3qmyX+qzIOu0Iix0Yqx0JG00Ja405291qDA2aTC2qfG26nF3a7K36/J4LPO4bTN47jO47bQ4bzT473S5cHX5cPW58bZ6Mnb6cze7NLi79fl8OLr8uXs8ufu9Ovy+PH2+vX6/vn9//v//wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACH5BAAAAAAALAAAAAA8ACgAAAb/QIBwSCwaj8ikcslsOp+CqHRKrVqv2Cx1wO16v+CweEz+FgqEtDqNXrvV5zdb/o7TCee8fs/v+/+AfAiDhIWGh4iJiouMhgmKj42RiJOMDJeYmZqbnJ2en5oNDqKko6alqKcOq6mtqq6pq7KztLW2t7i5tRG8vb6/wMHCw8S/EhITx8rHycsTzc7QyNLQz8vO18zTz9zd3t/g4eLj3RTm5+jp6uvs7e7v8PHy8xb19vf4+fr7/P34FwADChxIsKDBgwgHYljIsKHDhxAjSpzoMIPFixgzatzIsaPHjyBDihzJIUPJkyZTolzJoeXJliphrozpUqXNkiA6eNDZIWfO5Z1AeQb92bPoTp9Ckx41yhPpURBQo0qdSrWq1atYpYYQsbUr169ew4IdK7Ys2bNeR6hdy7at27dw48pta6Ku3bt4894tobev378nAgseTLiw4cOIExNGwbix48eQI0ueTLmy5cuYM6vYzJnzis6gN38O3Xk0adGnQ69Yzbq169ewY8ue7ZqF7du4c+vezbu379/Agwsf7mK3i+PIWRS/jTz5ctvNcTc/rlz6dOUvsmvfzr279+/gw3OHQb68+fPo06tfz/58jPfw48ufT7++/fvyZejfz7+///8ABijggAQWaOCBQQAAOw==';
const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAADwAAAAoEAIAAAB9SdLrAAAAIGNIUk0AAHomAACAhAAA+gAAAIDoAAB1MAAA6mAAADqYAAAXcJy6UTwAAAAGYktHRP///////wlY99wAAAAHdElNRQfqCREJDig6WX40AAAAJXRFWHRkYXRlOmNyZWF0ZQAyMDI2LTA5LTE3VDA5OjE0OjQwKzAwOjAwEcvpMQAAACV0RVh0ZGF0ZTptb2RpZnkAMjAyNi0wOS0xN1QwOToxNDo0MCswMDowMGCWUY0AAAAodEVYdGRhdGU6dGltZXN0YW1wADIwMjYtMDktMTdUMDk6MTQ6NDArMDA6MDA3g3BSAAAAq0lEQVRo3u3ZwQnDMBAF0RVsjq7LhbjNpKTgEr4PrkEjEPMqWMRnLhrJdZ1nabKu6v78Vp+xv67q7u/qM/bnoiHvQ7vo6d50uOjpXDTERkNcNMRGQ1w0xEZDXDTERkNcNMRGQ1w0xEZDXDTERkNcNMRGQ1w0xEZD/AWHuGiIjYa4aIiNhrhoiI2GuGiIjYa4aIiNhozkvv/H6jP2Z6MhNhpioyEjSZLVZ+zvAbdfK88pZb8oAAAAAElFTkSuQmCC';
const file = (name, b64, mimeType) => ({name, mimeType, buffer: Buffer.from(b64, 'base64')});
const FILES = {
    jpeg: () => file('photo.jpeg', JPEG_B64, 'image/jpeg'),
    jpg: () => file('photo.jpg', JPEG_B64, 'image/jpeg'),
    gif: () => file('photo.gif', GIF_B64, 'image/gif'),
    png: () => file('photo.png', PNG_B64, 'image/png'),
    PNG: () => file('PHOTO.PNG', PNG_B64, 'image/png'),
    txt: () => ({name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('not an image\n')}),
};

const ymd = (d) => d.toISOString().slice(0, 10);
const dayOffset = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return ymd(d); };
const TODAY = ymd(new Date());

// ---------------------------------------------------------------------------
// Reading helpers

const ctxUrl = (app, ctxPath, p = '', locale = '') => app.url(`/index.php/${ctxPath}${locale ? '/' + locale : ''}${p}`);
const dialog = (page) => page.locator('[role="dialog"]:visible').last();

async function snap(page, name, extra = {}) {
    const s = await screen(page);
    record(name, {...s, ...extra});
    await shot(page, name).catch(() => {});
    return s;
}

/** The public files directory of the app (config.test.inc.php) and the context's announcements folder. */
function announcementsDir(app, contextId) {
    const cfg = fs.readFileSync(app.configFile, 'utf8');
    const m = cfg.match(/^public_files_dir\s*=\s*(.+)$/m);
    const pub = path.resolve(app.root, m ? m[1].trim() : 'public'); // relative to the app root since 2026-09-24
    const seg = {ojs: 'journals', omp: 'presses', ops: 'contexts'}[app.name];
    return path.join(pub, seg, String(contextId), 'announcements');
}
function listFiles(dir) {
    try { return fs.readdirSync(dir).map((f) => ({name: f, size: fs.statSync(path.join(dir, f)).size})); } catch { return []; }
}

/** The Announcements page's list panel as data. */
async function listState(page) {
    const panel = page.locator('main .listPanel').first();
    if (!(await panel.count().catch(() => 0))) return {present: false};
    const data = await panel.evaluate((root) => {
        const btn = (b) => ({tag: b.tagName, name: (b.getAttribute('aria-label') || b.innerText).replace(/\s+/g, ' ').trim(), href: b.getAttribute('href'), disabled: b.disabled || b.getAttribute('aria-disabled') === 'true'});
        return {
            title: root.querySelector('.pkpHeader__title, .listPanel__title')?.innerText.trim() ?? null,
            headerButtons: [...root.querySelectorAll('.pkpHeader__actions button')].map(btn),
            empty: root.querySelector('.listPanel__empty')?.innerText.trim() ?? null,
            rows: [...root.querySelectorAll('.listPanel__item')].map((li) => ({
                title: li.querySelector('.listPanel__itemTitle')?.innerText.trim() ?? null,
                subtitle: li.querySelector('.listPanel__itemSubtitle')?.innerText.trim() ?? null,
                text: li.innerText.replace(/\s+/g, ' ').trim(),
                viewHref: li.querySelector('a')?.getAttribute('href') ?? null,
                buttons: [...li.querySelectorAll('button, a')].map(btn),
            })),
            pagination: root.querySelector('.pkpPagination')?.innerText.replace(/\s+/g, ' ').trim() ?? null,
        };
    }).catch((e) => ({error: String(e.message || e)}));
    return {present: true, ...data};
}
const rowTitles = (ls) => (ls.rows || []).map((r) => r.title);
const rowId = (ls, title) => { const r = (ls.rows || []).find((x) => x.title === title); const m = r && r.viewHref && r.viewHref.match(/announcement\/view\/(\d+)/); return m ? Number(m[1]) : null; };

/** The side panel's form as data: heading, locales, fields (label, required, hint, inputs, radios, buttons, preview, dropzone), errors, footer. */
async function formState(page) {
    const d = dialog(page);
    if ((await d.count()) === 0) return {open: false};
    return d.evaluate((root) => {
        const txt = (el) => (el ? el.innerText.replace(/\s+/g, ' ').trim() : null);
        const vis = (el) => el.offsetParent !== null;
        return {
            open: true,
            heading: txt(root.querySelector('h1, h2, [id*="title"]')),
            closeControls: [...root.querySelectorAll('button')].filter((b) => vis(b) && (b.querySelector('.sr-only') || /close/i.test(b.getAttribute('aria-label') || ''))).map((b) => (b.querySelector('.sr-only')?.innerText || b.getAttribute('aria-label') || b.innerText).trim()),
            errorSummary: txt(root.querySelector('.pkpFormErrors, .pkpForm__errors')),
            errorLinks: [...root.querySelectorAll('.pkpFormErrors button, .pkpFormErrors a, .pkpForm__errors button, .pkpForm__errors a')].map(txt),
            errorsAfterFields: (() => { const e = root.querySelector('.pkpFormErrors, .pkpForm__errors'); const f = root.querySelector('.pkpFormField'); return e && f ? !!(f.compareDocumentPosition(e) & Node.DOCUMENT_POSITION_FOLLOWING) : null; })(),
            locales: [...root.querySelectorAll('.pkpFormLocales .pkpFormLocales__locale')].map((l) => ({text: txt(l), tag: l.tagName.toLowerCase(), active: l.classList.contains('pkpFormLocales__locale--isActive'), primary: l.classList.contains('pkpFormLocales__locale--isPrimary')})),
            fields: [...root.querySelectorAll('.pkpFormField')].map((f) => ({
                classes: f.className.replace(/\s+/g, ' ').trim(),
                visible: vis(f),
                localeGroupVisible: f.closest('.pkpFormGroup__locale') ? f.closest('.pkpFormGroup__locale').classList.contains('pkpFormGroup__locale--isVisible') : null,
                label: txt(f.querySelector('.pkpFormFieldLabel, legend, .pkpFormField__heading')),
                localeLabel: txt(f.querySelector('.pkpFormFieldLabel .aria-hidden, .pkpFormField__heading .aria-hidden')),
                required: !!f.querySelector('.pkpFormFieldLabel__required, .pkpFormField__required'),
                description: txt(f.querySelector('.pkpFormField__description')),
                error: txt(f.querySelector('.pkpFieldError')),
                inputs: [...f.querySelectorAll('input:not([type=hidden]), textarea, iframe')].map((i) => ({tag: i.tagName.toLowerCase(), type: i.type || null, id: i.id, name: i.name || null, value: i.type === 'file' ? null : (i.value ?? null), checked: i.checked ?? null, visible: vis(i), size: i.getAttribute('size'), width: i.getBoundingClientRect().width, label: i.id && f.querySelector(`label[for="${i.id}"]`) ? txt(f.querySelector(`label[for="${i.id}"]`)) : (i.closest('label') ? txt(i.closest('label')) : null)})),
                buttons: [...f.querySelectorAll('button')].filter(vis).map((b) => ({name: (b.getAttribute('aria-label') || b.getAttribute('title') || b.innerText).replace(/\s+/g, ' ').trim(), disabled: b.disabled})),
                toolbar: [...f.querySelectorAll('.tox-toolbar__primary button, .tox-toolbar button')].map((b) => b.getAttribute('aria-label') || b.getAttribute('title') || b.innerText.trim()),
                editorHeight: (() => { const fr = f.querySelector('iframe'); return fr ? fr.getBoundingClientRect().height : null; })(),
                preview: (() => { const img = f.querySelector('.pkpFormField--upload__preview img, img'); return img ? {src: img.getAttribute('src'), alt: img.getAttribute('alt'), naturalWidth: img.naturalWidth, complete: img.complete} : null; })(),
                previewCaption: txt(f.querySelector('.pkpFormField--upload__preview')),
                dropzoneText: txt(f.querySelector('.dropzone, .vue-dropzone')),
                dropzoneHidden: !!f.querySelector('.-screenReader .dropzone, .-screenReader .vue-dropzone'),
                dropzoneMax: (() => { const dz = f.querySelector('.dropzone, .vue-dropzone'); return dz && dz.dropzone ? {maxFilesize: dz.dropzone.options.maxFilesize, acceptedFiles: dz.dropzone.options.acceptedFiles, dictInvalidFileType: dz.dropzone.options.dictInvalidFileType, dictFileTooBig: dz.dropzone.options.dictFileTooBig} : null; })(),
                dzErrors: [...f.querySelectorAll('.dz-error-message')].map(txt).filter(Boolean),
                text: txt(f).slice(0, 400),
            })),
            footerButtons: [...root.querySelectorAll('.pkpFormPage__footer button')].map((b) => ({name: b.innerText.trim(), disabled: b.disabled})),
            footerText: txt(root.querySelector('.pkpFormPage__footer')),
            status: txt(root.querySelector('.pkpFormPage__status')),
        };
    });
}
const fieldOf = (form, label) => (form.fields || []).find((f) => f.label && new RegExp(`(^|\\s)${label}`).test(f.label));

// ---------------------------------------------------------------------------
// Driving helpers

/** The field wrapper in the panel by its label text prefix (index for the second language's twin). */
function field(page, label, index = 0) {
    return dialog(page).locator('.pkpFormField').filter({hasText: new RegExp(`(^|\\s)${label}`)}).nth(index);
}
const textInput = (page, label, index = 0) => field(page, label, index).locator('input.pkpFormField__input, input[type=text]').first();

async function richBody(page, label, index = 0) {
    const f = field(page, label, index);
    const frame = f.locator('iframe').first();
    await frame.waitFor({timeout: T});
    const body = frame.contentFrame().locator('body');
    await body.waitFor({timeout: T});
    await page.waitForFunction((el) => el.contentDocument && el.contentDocument.body && el.contentDocument.body.getAttribute('contenteditable') === 'true', await frame.elementHandle(), {timeout: T}).catch(() => {});
    return body;
}
async function setRich(page, label, text, index = 0) {
    const body = await richBody(page, label, index);
    await body.click();
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.press('Delete');
    if (text) await body.pressSequentially(text);
    await sleep(150);
}
async function readRich(page, label, index = 0) {
    const body = await richBody(page, label, index).catch(() => null);
    return body ? body.innerHTML().catch(() => null) : null;
}

async function openAnnouncementsPage(page, app, ctxPath, locale = '') {
    await page.goto(ctxUrl(app, ctxPath, '/management/settings/announcements', locale));
    await idle(page);
    await page.locator('main .listPanel').first().waitFor({timeout: T}).catch(() => {});
    await idle(page);
    return listState(page);
}
async function openAddPanel(page) {
    await page.locator('main .listPanel').first().getByRole('button', {name: 'Add Announcement', exact: true}).click();
    await dialog(page).waitFor({timeout: T});
    await dialog(page).locator('.pkpFormPage__footer').waitFor({timeout: T});
    await idle(page);
    await sleep(400);
}
async function openEditPanel(page, rowTitle) {
    const row = page.locator('main .listPanel .listPanel__item').filter({hasText: rowTitle}).first();
    await row.getByRole('button', {name: /^(Edit|Modifier)$/}).click();   // "Modifier" under /fr_CA/
    await dialog(page).waitFor({timeout: T});
    await dialog(page).locator('.pkpFormPage__footer').waitFor({timeout: T});
    await idle(page);
    await sleep(400);
}
/** Press "Save"; returns the panel's state after (open with errors, or closed). */
async function save(page) {
    const d = dialog(page);
    const btn = d.getByRole('button', {name: 'Save', exact: true});
    const disabled = await btn.isDisabled().catch(() => null);
    if (disabled) return {saveDisabled: true, form: await formState(page)};
    await btn.click();
    await idle(page);
    await sleep(600);
    await idle(page);
    const open = (await page.locator('[role="dialog"]:visible').count()) > 0;
    return {saveDisabled: false, stillOpen: open, form: open ? await formState(page) : {open: false}};
}
async function waitClosed(page) {
    await page.locator('[role="dialog"]:visible').waitFor({state: 'hidden', timeout: T}).catch(() => {});
    await idle(page);
}
async function closePanel(page) {
    const d = dialog(page);
    if (!(await d.count())) return;
    const c = d.getByRole('button', {name: /^(Close|Fermer)$/}).first();
    if (await c.count()) await c.click(); else await page.keyboard.press('Escape');
    await waitClosed(page);
}
async function upload(page, f) {
    const input = dialog(page).locator('input[type=file]').first();
    const resp = page.waitForResponse((r) => /temporaryFiles/.test(r.url()) && r.request().method() === 'POST', {timeout: 8000}).catch(() => null);
    await input.setInputFiles(f);
    const r = await resp;
    await idle(page);
    await sleep(800);
    return r ? {status: r.status()} : {status: null, noRequest: true};
}
async function setAlt(page, text) {
    const alt = field(page, 'Image').locator('input.pkpFormField--uploadImage__altTextInput, input[id*="altText"]').first();
    if (await alt.count()) await alt.fill(text);
}
async function pickType(page, name) {
    const f = field(page, 'Announcement Type');
    const r = f.getByRole('radio', {name, exact: true});
    if (await r.count()) { await r.check(); return true; }
    const l = f.locator('label').filter({hasText: new RegExp(`^\\s*${name}\\s*$`)}).first();
    if (await l.count()) { await l.click(); return true; }
    return false;
}
async function setSendEmail(page, on) {
    const box = field(page, 'Send Email').getByRole('checkbox').first();
    if (!(await box.count())) return null;
    await box.setChecked(on);
    return box.isChecked();
}

/** The public pages: the list, one announcement's page, the home page. */
async function publicRead(page, app, ctxPath, name, {id, locale = ''} = {}) {
    const out = {};
    const pages = [['list', '/announcement'], ['home', '']];
    if (id) pages.splice(1, 0, ['view', `/announcement/view/${id}`]);
    for (const [key, p] of pages) {
        const resp = await page.goto(ctxUrl(app, ctxPath, p, locale)).catch(() => null);
        await idle(page);
        const body = await page.locator('body').innerText().catch(() => '');
        out[key] = {
            url: page.url(), status: resp ? resp.status() : null, title: await page.title(),
            h1: await page.locator('h1').allInnerTexts().then((a) => a.map((s) => s.trim())).catch(() => []),
            h2: await page.locator('h2').allInnerTexts().then((a) => a.map((s) => s.trim())).catch(() => []),
            is404: /404 Not Found/i.test(body),
            images: await page.locator('.obj_announcement_summary img, .obj_announcement_full img, .announcements img, article img, .page img, main img').evaluateAll((els) => els.map((e) => ({src: e.getAttribute('src'), alt: e.getAttribute('alt'), complete: e.complete, naturalWidth: e.naturalWidth}))).catch(() => []),
            summaries: await page.locator('.obj_announcement_summary').evaluateAll((els) => els.map((e) => e.innerText.replace(/\s+/g, ' ').trim())).catch(() => []),
            announcementsBlock: await page.locator('.cmp_announcements, .announcements, #announcements, [class*=announcement]').first().innerText().then((t) => t.replace(/\s+/g, ' ').trim().slice(0, 600)).catch(() => null),
            bodyHead: body.replace(/\s+/g, ' ').slice(0, 700),
        };
        await snap(page, `${name}-${key}`, out[key]);
    }
    return out;
}

/** Announcement API traffic (the browser's own): method, url, status and the posted body of POST/PUT to announcements. */
function trafficRecorder(page) {
    const calls = [];
    page.on('request', (r) => { if (/api\/v1\/announcements/.test(r.url()) && /POST|PUT|DELETE/.test(r.method())) calls.push({method: r.method(), url: r.url().replace(/^https?:\/\/[^/]+/, ''), override: r.headers()['x-http-method-override'] || null, body: (r.postData() || '').slice(0, 1500)}); });
    page.on('response', (r) => { if (/api\/v1\/announcements/.test(r.url()) && /POST|PUT|DELETE/.test(r.request().method())) { const c = calls.slice().reverse().find((x) => x.url === r.url().replace(/^https?:\/\/[^/]+/, '') && !x.status); if (c) c.status = r.status(); } });
    return {calls, take: () => calls.splice(0)};
}
function navRecorder(page) {
    const navs = [];
    page.on('framenavigated', (f) => { if (f === page.mainFrame()) navs.push(f.url()); });
    return navs;
}

async function as(page, user, ctxPath) {
    await signIn(page, user, {contextPath: ctxPath});
    await idle(page);
}
/** Drain the app's job queue: the app's own worker (`jobs.php run`, as support/jobs.js runs it), then the probe server's `_test/jobs` count until empty (support/jobs.js polls worker 0's server with a shell key, which a probe process has not). */
async function drain(app, timeoutMs = 90_000) {
    const env = {...process.env, PKP_CONFIG_FILE: app.configFile};
    const run = () => { try { return execFileSync('php', ['lib/pkp/tools/jobs.php', 'run'], {cwd: app.root, env, encoding: 'utf8', timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024}); } catch (e) { return typeof e.stdout === 'string' ? e.stdout : String(e.message || e); } };
    const out = {runs: 1, output: String(run()).slice(-400)};
    const deadline = Date.now() + timeoutMs;
    for (;;) {
        let counts = null;
        try { const r = await app.api.context.get('/index.php/index/api/v1/_test/jobs', {failOnStatusCode: false}); counts = r.ok() ? await r.json() : {status: r.status()}; } catch (e) { counts = {error: String(e.message || e)}; }
        out.counts = counts;
        if (counts && counts.queued === 0 && counts.reserved === 0) return {ok: true, ...out};
        if (Date.now() > deadline) return {ok: false, ...out};
        await sleep(500);
        if (counts && counts.queued > 0) { run(); out.runs++; }
    }
}

// ---------------------------------------------------------------------------
forEachApp(async (app) => {
    let st = fs.existsSync(stateFile(app)) ? JSON.parse(fs.readFileSync(stateFile(app), 'utf8')) : null;
    const saveState = () => fs.writeFileSync(stateFile(app), JSON.stringify(st, null, 2));

    // ---- seed ---------------------------------------------------------------
    if ((on('seed') && (process.env.RESEED === '1' || !st)) || !st) {
        const t = tag('u12k2');
        const users = (p) => [
            {username: `${p}mgr`, roles: ['manager'], givenName: 'Mira', familyName: 'Manager'},
            {username: `${p}se`, roles: ['sectionEditor'], givenName: 'Sonia', familyName: 'Section'},
            {username: `${p}rd`, roles: ['reader'], givenName: 'Rex', familyName: 'Reader'},
        ];
        const seedOne = async (spec) => {
            for (let attempt = 1; attempt <= 2; attempt++) {
                try { return await app.api.createContext(spec); } catch (e) { log('seed failed', attempt, String(e.message || e)); if (attempt === 2) throw e; await sleep(3000); }
            }
            return null;
        };
        const tA = t, tB = `${t}b`;
        const ctxA = await seedOne({
            tag: tA, context: {name: `U12 K2 ${tA}`, acronym: 'U12K2'}, users: users(tA),
            enableAnnouncements: true, numAnnouncementsHomepage: 2,
            announcementTypes: [{name: 'Call'}, {name: 'Event'}],
            announcements: [
                {title: 'Old news', descriptionShort: '<p>Expired yesterday.</p>', dateExpire: dayOffset(-1)},
                {title: 'Annual conference', descriptionShort: '<p>Save the date.</p>', description: '<p>The full programme.</p>', dateExpire: dayOffset(30), type: 'Event'},
                {title: 'Third item', descriptionShort: '<p>Third short.</p>'},
            ],
        });
        const ctxB = await seedOne({
            tag: tB, context: {name: `U12 K2 ${tB} French`, acronym: 'U12K2B', supportedLocales: ['en', 'fr_CA'], supportedFormLocales: ['en', 'fr_CA']}, users: users(tB),
            enableAnnouncements: true, numAnnouncementsHomepage: 2,
            announcements: [{title: 'English only', descriptionShort: '<p>Only in English.</p>'}],
        });
        st = {
            tag: t,
            A: {path: ctxA.path || tA, id: ctxA.contextId, users: {mgr: `${tA}mgr`, se: `${tA}se`, rd: `${tA}rd`}, seeded: ctxA.announcements || [], types: ctxA.announcementTypes || []},
            B: {path: ctxB.path || tB, id: ctxB.contextId, users: {mgr: `${tB}mgr`, se: `${tB}se`, rd: `${tB}rd`}, seeded: ctxB.announcements || []},
        };
        saveState();
        record('00-seed', {A: ctxA, B: ctxB});
        log('seeded', st.A.path, st.A.id, st.B.path, st.B.id);
        note(`K2 ${app.name}: scratch contexts ${st.A.path} (id ${st.A.id}, en, types Call/Event, three announcements) and ${st.B.path} (id ${st.B.id}, fr_CA under Forms, no type), announcements on at creation`);
    }
    const A = st.A, B = st.B;
    const filesA = announcementsDir(app, A.id);

    // ---- panel: the Add panel, the refusals, a full add ------------------------
    if (on('panel')) {
        const {page, close} = await launch(app);
        const traffic = trafficRecorder(page);
        try {
            await as(page, A.users.mgr, A.path);
            const list0 = await openAnnouncementsPage(page, app, A.path);
            await snap(page, '10-page', {list: list0});
            await openAddPanel(page);
            const form0 = await formState(page);
            await snap(page, '11-add-panel', {form: form0});
            await loc(page, 'Add Announcement: the panel', dialog(page));
            await loc(page, 'Add Announcement: "Title"', textInput(page, 'Title'));
            await loc(page, 'Add Announcement: "Expiry Date"', textInput(page, 'Expiry Date'));
            await loc(page, 'Add Announcement: "Send Email" box', field(page, 'Send Email').getByRole('checkbox').first());
            await loc(page, 'Add Announcement: the "Announcement Type" radios', field(page, 'Announcement Type').getByRole('radio'));
            await loc(page, 'Add Announcement: the file input', dialog(page).locator('input[type=file]').first());
            await loc(page, 'Add Announcement: "Save"', dialog(page).getByRole('button', {name: 'Save', exact: true}));
            // empty save
            const r1 = await save(page);
            await snap(page, '12-add-empty-save', {result: r1});
            // type a title: does "Save" come back?
            await textInput(page, 'Title').fill('x');
            await sleep(300);
            const afterType = await formState(page);
            await textInput(page, 'Title').fill('');
            await sleep(300);
            record('12b-add-after-title-typed', {footerAfterTyping: afterType.footerButtons, errorSummary: afterType.errorSummary, titleError: fieldOf(afterType, 'Title')?.error, footerAfterCleared: (await formState(page)).footerButtons});
            // malformed expiry with the title still empty: two errors
            await textInput(page, 'Expiry Date').fill('17/09/2026');
            await sleep(300);
            const r2 = await save(page);
            await snap(page, '13-add-two-errors', {result: r2});
            // title filled, expiry still malformed: one error, the message under the field
            await textInput(page, 'Title').fill('Bad date');
            await sleep(300);
            const r3 = await save(page);
            await snap(page, '14-add-bad-date', {result: r3});
            // other malformed shapes
            const shapes = {};
            for (const v of ['2026-9-7', '2026-13-01', 'tomorrow']) {
                await textInput(page, 'Expiry Date').fill(v);
                await sleep(300);
                const r = await save(page);
                shapes[v] = {saveDisabled: r.saveDisabled, stillOpen: r.stillOpen, error: fieldOf(r.form, 'Expiry Date')?.error, summary: r.form.errorSummary};
            }
            record('14b-add-date-shapes', shapes);
            // a .txt in "Image"
            await textInput(page, 'Expiry Date').fill('');
            await sleep(300);
            const up = await upload(page, FILES.txt());
            const formTxt = await formState(page);
            await snap(page, '15-add-txt-refused', {upload: up, form: formTxt, imageField: fieldOf(formTxt, 'Image'), traffic: traffic.take()});
            // clear the refused file if the box offers a way
            const imgButtons = fieldOf(formTxt, 'Image')?.buttons || [];
            record('15b-add-txt-buttons', {imgButtons});
            // the dropzone's own "REMOVE FILE" control on the refused file (an <a>, not a button)
            const rm = field(page, 'Image').locator('a, button').filter({hasText: /Remove file/i}).first();
            const rmInfo = await rm.count() ? await rm.evaluate((e) => ({tag: e.tagName, text: e.innerText.trim(), href: e.getAttribute('href'), class: e.className})) : null;
            if (rmInfo) { await rm.click(); await sleep(500); }
            const afterRm = await formState(page);
            record('15c-add-txt-after-remove-file', {control: rmInfo, imageField: fieldOf(afterRm, 'Image'), errorSummary: afterRm.errorSummary, footer: afterRm.footerButtons});
            // the panel left with an unsaved title and a refused/removed file: dialogs on the way out
            const dialogs = [];
            page.on('dialog', async (d) => { dialogs.push({type: d.type(), message: d.message()}); await d.dismiss().catch(() => {}); });
            await closePanel(page);
            record('16-add-closed-unsaved', {browserDialogs: dialogs, vueDialogs: await page.locator('[role="dialog"]:visible').allInnerTexts().catch(() => []), list: await listState(page)});
            // a full add: every field, a PNG with alt text, type "Call", "Send Email" ticked
            const navs = navRecorder(page);
            await openAddPanel(page);
            await textInput(page, 'Title').fill('Call for papers');
            await setRich(page, 'Short Description', 'Deadline 1 June.');
            await setRich(page, 'Announcement', 'Send your paper by 1 June to the editorial office.');
            const upPng = await upload(page, FILES.png());
            await setAlt(page, 'A blue gradient');
            await textInput(page, 'Expiry Date').fill(dayOffset(60));
            const typePicked = await pickType(page, 'Call');
            const emailTicked = await setSendEmail(page, true);
            const formFull = await formState(page);
            await snap(page, '17-add-full-before-save', {form: formFull, upPng, typePicked, emailTicked});
            const r4 = await save(page);
            await waitClosed(page);
            await sleep(800);
            await idle(page);
            const listAfter = await listState(page);
            await snap(page, '18-add-full-saved', {result: r4, navigationsDuringSave: navs.slice(), list: listAfter, files: listFiles(filesA), traffic: traffic.take()});
            st.callId = rowId(listAfter, 'Call for papers');
            st.ids = Object.fromEntries((listAfter.rows || []).map((r) => [r.title, rowId(listAfter, r.title)]));
            saveState();
            // the row's posted date after a reload
            const listReload = await openAnnouncementsPage(page, app, A.path);
            record('18b-list-after-reload', {rows: (listReload.rows || []).map((r) => ({title: r.title, text: r.text})), today: TODAY});
            // the public pages signed out
            await signOut(page);
            await publicRead(page, app, A.path, '19-public-after-add', {id: st.callId});
            // the queue drained: the email as the positive control of the "Send Email" box
            const dr = await drain(app);
            const mail = await app.mail.find({to: `${A.users.rd}@mail.test`, contains: 'Call for papers', timeoutMs: 20_000}).catch((e) => ({error: String(e.message || e)}));
            record('19b-mail-after-add', {drain: dr, mail: mail && mail.error ? mail : {id: mail.ID || mail.id, subject: mail.Subject || mail.subject, from: mail.From || mail.from, to: mail.To || mail.to}});
        } finally { await close(); }
    }

    // ---- edit: values filled, the title changed, the panel left unsaved, A9, A6 ----
    if (on('edit')) {
        const {page, close} = await launch(app);
        const traffic = trafficRecorder(page);
        try {
            await as(page, A.users.mgr, A.path);
            const list0 = await openAnnouncementsPage(page, app, A.path);
            const before = (list0.rows || []).map((r) => ({title: r.title, text: r.text}));
            // edit the oldest (seeded first: "Old news") → its place and posted date
            await openEditPanel(page, 'Old news');
            const formEdit = await formState(page);
            await snap(page, '20-edit-panel-old-news', {form: formEdit, short: await readRich(page, 'Short Description'), full: await readRich(page, 'Announcement')});
            await textInput(page, 'Title').fill('Old news edited');
            const navs = navRecorder(page);
            const r1 = await save(page);
            await waitClosed(page);
            await sleep(600);
            const listAfter = await listState(page);
            await snap(page, '21-edit-saved', {result: r1, navigations: navs.slice(), rowsBefore: before, rowsAfter: (listAfter.rows || []).map((r) => ({title: r.title, text: r.text})), traffic: traffic.take()});
            const listReload = await openAnnouncementsPage(page, app, A.path);
            record('21b-edit-after-reload', {rows: (listReload.rows || []).map((r) => ({title: r.title, text: r.text}))});
            // "Call for papers": the panel with an image and an expiry
            await openEditPanel(page, 'Call for papers');
            const formCall = await formState(page);
            await snap(page, '22-edit-panel-call', {form: formCall, imageField: fieldOf(formCall, 'Image'), expiry: fieldOf(formCall, 'Expiry Date'), type: fieldOf(formCall, 'Announcement Type'), sendEmail: fieldOf(formCall, 'Send Email')});
            await loc(page, 'Edit Announcement: "Remove" (image)', field(page, 'Image').getByRole('button', {name: 'Remove', exact: true}));
            // change the title, leave by the close control: the row before and after a reload
            const dialogs = [];
            page.on('dialog', async (d) => { dialogs.push({type: d.type(), message: d.message()}); await d.dismiss().catch(() => {}); });
            await textInput(page, 'Title').fill('Call for papers UNSAVED');
            await sleep(300);
            const closeBtn = dialog(page).getByRole('button', {name: /^Close$/}).first();
            const closeName = await closeBtn.count() ? await closeBtn.evaluate((b) => (b.querySelector('.sr-only')?.innerText || b.getAttribute('aria-label') || b.innerText).trim()) : null;
            await closeBtn.click().catch(async () => { await page.keyboard.press('Escape'); });
            await sleep(600);
            const afterClose = {closeName, browserDialogs: dialogs.slice(), vueDialogs: await page.locator('[role="dialog"]:visible').allInnerTexts().catch(() => []), rows: rowTitles(await listState(page))};
            const afterCloseReload = rowTitles(await openAnnouncementsPage(page, app, A.path));
            record('23-edit-close-control', {afterClose, afterCloseReload});
            // Escape on the Title box
            await openEditPanel(page, 'Call for papers');
            await textInput(page, 'Title').fill('Call for papers ESC');
            await textInput(page, 'Title').press('Escape');
            await sleep(600);
            const afterEsc = {open: (await page.locator('[role="dialog"]:visible').count()) > 0, browserDialogs: dialogs.slice(), vueDialogs: await page.locator('[role="dialog"]:visible').allInnerTexts().catch(() => []), rows: rowTitles(await listState(page))};
            if (afterEsc.open) await closePanel(page);
            const afterEscReload = rowTitles(await openAnnouncementsPage(page, app, A.path));
            record('24-edit-escape', {afterEsc, afterEscReload});
            // a click outside the panel
            await openEditPanel(page, 'Call for papers');
            await textInput(page, 'Title').fill('Call for papers OUTSIDE');
            const box = await dialog(page).boundingBox();
            const vp = page.viewportSize();
            const x = box && box.x > 40 ? box.x / 2 : 20;
            await page.mouse.click(x, vp.height / 2);
            await sleep(600);
            const afterOutside = {clickAt: [x, vp.height / 2], panelBox: box, open: (await page.locator('[role="dialog"]:visible').count()) > 0, browserDialogs: dialogs.slice(), vueDialogs: await page.locator('[role="dialog"]:visible').allInnerTexts().catch(() => []), rows: rowTitles(await listState(page))};
            if (afterOutside.open) await closePanel(page);
            const afterOutsideReload = rowTitles(await openAnnouncementsPage(page, app, A.path));
            await snap(page, '25-edit-click-outside', {afterOutside, afterOutsideReload});
            // A6: the type on an edit — any way back to none? change to "Event"
            await openEditPanel(page, 'Call for papers');
            const typeField = fieldOf(await formState(page), 'Announcement Type');
            const typeRadios = await field(page, 'Announcement Type').getByRole('radio').evaluateAll((els) => els.map((e) => ({value: e.value, checked: e.checked, label: e.labels && e.labels[0] ? e.labels[0].innerText.trim() : null})));
            await pickType(page, 'Event');
            const r2 = await save(page);
            await waitClosed(page);
            await openEditPanel(page, 'Call for papers');
            const typeAfter = await field(page, 'Announcement Type').getByRole('radio').evaluateAll((els) => els.map((e) => ({value: e.value, checked: e.checked, label: e.labels && e.labels[0] ? e.labels[0].innerText.trim() : null})));
            await snap(page, '26-edit-type-changed', {typeFieldBefore: typeField, typeRadios, saveResult: r2.stillOpen, typeAfter, traffic: traffic.take()});
            // A9: "Send Email" on an edit, ticked and saved; a dated add with the box ticked as the control
            const sendField = fieldOf(await formState(page), 'Send Email');
            const ticked = await setSendEmail(page, true);
            const r3 = await save(page);
            await waitClosed(page);
            const editTraffic = traffic.take();
            await openAddPanel(page);
            await textInput(page, 'Title').fill('Past dated control');
            await setRich(page, 'Short Description', 'Sent with a past expiry.');
            await textInput(page, 'Expiry Date').fill(dayOffset(-3));
            await setSendEmail(page, true);
            const r4 = await save(page);
            await waitClosed(page);
            const listAfterControl = await listState(page);
            st.ids = {...(st.ids || {}), ...Object.fromEntries((listAfterControl.rows || []).map((r) => [r.title, rowId(listAfterControl, r.title)]))};
            saveState();
            const dr = await drain(app);
            const control = await app.mail.find({to: `${A.users.rd}@mail.test`, contains: 'Past dated control', timeoutMs: 20_000}).catch((e) => ({error: String(e.message || e)}));
            const editCount = await app.mail.count({to: `${A.users.rd}@mail.test`, contains: 'Call for papers'}).catch((e) => ({error: String(e.message || e)}));
            const seCount = await app.mail.count({to: `${A.users.se}@mail.test`, contains: 'Call for papers'}).catch((e) => ({error: String(e.message || e)}));
            const mgrCount = await app.mail.count({to: `${A.users.mgr}@mail.test`, contains: 'Call for papers'}).catch((e) => ({error: String(e.message || e)}));
            await snap(page, '27-edit-send-email', {sendFieldOnEdit: sendField, ticked, editSave: r3.stillOpen, editTraffic, controlAdd: r4.stillOpen, drain: dr, controlMail: control && control.error ? control : {subject: control.Subject || control.subject, to: control.To || control.to}, callForPapersMailsToReader: editCount, toSectionEditor: seCount, toManager: mgrCount, addTraffic: traffic.take()});
            await signOut(page);
        } finally { await close(); }
    }

    // ---- image: the refused names on add and edit (A2), .gif/.jpg saving, Remove/Restore, replace ----
    if (on('image')) {
        const {page, close} = await launch(app);
        const traffic = trafficRecorder(page);
        try {
            await as(page, A.users.mgr, A.path);
            await openAnnouncementsPage(page, app, A.path);
            // on an add: photo.jpeg accepted in the box, refused on Save
            await openAddPanel(page);
            await textInput(page, 'Title').fill('Jpeg on add');
            const upJpeg = await upload(page, FILES.jpeg());
            const formJpeg = await formState(page);
            const r1 = await save(page);
            const listAfterJpeg = await listState(page);
            await snap(page, '30-add-jpeg-refused', {upJpeg, imageFieldAfterUpload: fieldOf(formJpeg, 'Image'), result: r1, imageFieldAfterSave: fieldOf(r1.form, 'Image'), rows: rowTitles(listAfterJpeg), traffic: traffic.take()});
            if (r1.stillOpen) await closePanel(page);
            const rowsReload1 = rowTitles(await openAnnouncementsPage(page, app, A.path));
            record('30b-add-jpeg-after-reload', {rows: rowsReload1, files: listFiles(filesA)});
            // PHOTO.PNG on an add
            await openAddPanel(page);
            await textInput(page, 'Title').fill('Upper PNG on add');
            const upPNG = await upload(page, FILES.PNG());
            const r2 = await save(page);
            await snap(page, '31-add-upper-png-refused', {upPNG, result: r2, imageFieldAfterSave: fieldOf(r2.form, 'Image'), rows: rowTitles(await listState(page)), traffic: traffic.take()});
            if (r2.stillOpen) await closePanel(page);
            // .gif and .jpg save; the files on disk
            for (const [title, f] of [['Gif one', FILES.gif()], ['Jpg one', FILES.jpg()]]) {
                await openAddPanel(page);
                await textInput(page, 'Title').fill(title);
                const u = await upload(page, f);
                await setAlt(page, `${title} picture`);
                const r = await save(page);
                await waitClosed(page);
                const ls = await listState(page);
                record(`32-add-${f.name}`, {upload: u, result: r.stillOpen ? r : {closed: true}, rows: rowTitles(ls), id: rowId(ls, title), files: listFiles(filesA), traffic: traffic.take()});
            }
            let ls = await openAnnouncementsPage(page, app, A.path);
            st.ids = {...(st.ids || {}), ...Object.fromEntries((ls.rows || []).map((r) => [r.title, rowId(ls, r.title)]))};
            saveState();
            // two throwaways with a PNG, for the edit-time refusals (A2)
            for (const title of ['Doomed jpeg', 'Doomed upper']) {
                await openAddPanel(page);
                await textInput(page, 'Title').fill(title);
                await upload(page, FILES.png());
                await setAlt(page, 'doomed');
                await save(page);
                await waitClosed(page);
            }
            ls = await openAnnouncementsPage(page, app, A.path);
            st.ids = {...(st.ids || {}), ...Object.fromEntries((ls.rows || []).map((r) => [r.title, rowId(ls, r.title)]))};
            saveState();
            const filesBeforeDoom = listFiles(filesA);
            for (const [title, f, name] of [['Doomed jpeg', FILES.jpeg(), '33-edit-jpeg-refused'], ['Doomed upper', FILES.PNG(), '34-edit-upper-png-refused']]) {
                const id = st.ids[title];
                await openEditPanel(page, title);
                const u = await upload(page, f);
                const formUp = await formState(page);
                const r = await save(page);
                const rowsAfterSave = rowTitles(await listState(page));
                await snap(page, name, {id, upload: u, imageFieldAfterUpload: fieldOf(formUp, 'Image'), result: r, imageFieldAfterSave: fieldOf(r.form, 'Image'), rowsWhilePanelOpen: rowsAfterSave, traffic: traffic.take()});
                if (r.stillOpen) await closePanel(page);
                const rowsNoReload = rowTitles(await listState(page));
                const rowsReload = rowTitles(await openAnnouncementsPage(page, app, A.path));
                const resp = await page.goto(ctxUrl(app, A.path, `/announcement/view/${id}`)).catch(() => null);
                await idle(page);
                const body = await page.locator('body').innerText().catch(() => '');
                record(`${name}-after`, {rowsAfterPanelClosedNoReload: rowsNoReload, rowsAfterReload: rowsReload, publicView: {url: page.url(), status: resp ? resp.status() : null, is404: /404 Not Found/i.test(body), h1: await page.locator('h1').allInnerTexts().catch(() => [])}, filesBefore: filesBeforeDoom, filesAfter: listFiles(filesA)});
                await openAnnouncementsPage(page, app, A.path);
            }
        } finally { await close(); }
    }

    // ---- imgedit: Remove + Restore Original, Remove + Save: the file and the pages; then a new upload replaces the file ----
    if (on('imgedit')) {
        const {page, close} = await launch(app);
        const traffic = trafficRecorder(page);
        try {
            await as(page, A.users.mgr, A.path);
            await openAnnouncementsPage(page, app, A.path);
            await openEditPanel(page, 'Call for papers');
            const imgBefore = fieldOf(await formState(page), 'Image');
            await field(page, 'Image').getByRole('button', {name: 'Remove', exact: true}).click();
            await sleep(400);
            const afterRemove = fieldOf(await formState(page), 'Image');
            const restore = field(page, 'Image').getByRole('button', {name: 'Restore Original', exact: true});
            const hasRestore = await restore.count();
            if (hasRestore) { await restore.click(); await sleep(400); }
            const afterRestore = fieldOf(await formState(page), 'Image');
            await snap(page, '35-edit-remove-restore', {imgBefore, afterRemove, hasRestore, afterRestore});
            await field(page, 'Image').getByRole('button', {name: 'Remove', exact: true}).click();
            await sleep(300);
            const r5 = await save(page);
            await waitClosed(page);
            const filesAfterRemove = listFiles(filesA);
            record('36-edit-image-removed', {result: r5.stillOpen ? r5 : {closed: true}, files: filesAfterRemove, traffic: traffic.take()});
            await signOut(page);
            await publicRead(page, app, A.path, '37-public-text-only', {id: st.callId});
            // a new upload replaces the file
            await as(page, A.users.mgr, A.path);
            await openAnnouncementsPage(page, app, A.path);
            await openEditPanel(page, 'Call for papers');
            await upload(page, FILES.gif());
            await setAlt(page, 'A gif now');
            const r6 = await save(page);
            await waitClosed(page);
            const filesGif = listFiles(filesA);
            await openEditPanel(page, 'Call for papers');
            const imgGif = fieldOf(await formState(page), 'Image');
            await upload(page, PNG400);
            await setAlt(page, 'A big PNG now');
            const r7 = await save(page);
            await waitClosed(page);
            const filesPng = listFiles(filesA);
            await snap(page, '38-edit-image-replaced', {gifSave: r6.stillOpen ? r6 : {closed: true}, filesAfterGif: filesGif, imgGif, pngSave: r7.stillOpen ? r7 : {closed: true}, filesAfterPng: filesPng, traffic: traffic.take()});
            await signOut(page);
            await publicRead(page, app, A.path, '39-public-replaced', {id: st.callId});
        } finally { await close(); }
    }

    // ---- delete: the dialog, "No", "Yes", the pages and the file --------------
    if (on('delete')) {
        const {page, close} = await launch(app);
        const traffic = trafficRecorder(page);
        try {
            await as(page, A.users.mgr, A.path);
            const ls = await openAnnouncementsPage(page, app, A.path);
            const id = rowId(ls, 'Gif one');
            const filesBefore = listFiles(filesA);
            const row = page.locator('main .listPanel .listPanel__item').filter({hasText: 'Gif one'}).first();
            await row.getByRole('button', {name: 'Delete', exact: true}).click();
            await sleep(500);
            const d = dialog(page);
            await d.waitFor({timeout: T});
            const dlg = {heading: await d.locator('h1, h2, [id*="title"]').first().innerText().catch(() => null), text: await d.innerText().catch(() => null), buttons: await d.locator('button').evaluateAll((els) => els.filter((e) => e.offsetParent !== null).map((e) => e.innerText.trim()))};
            await snap(page, '40-delete-dialog', {dlg});
            await loc(page, 'Delete Announcement: "Yes"', d.getByRole('button', {name: 'Yes', exact: true}));
            await d.getByRole('button', {name: 'No', exact: true}).click();
            await sleep(500);
            const afterNo = {open: (await page.locator('[role="dialog"]:visible').count()) > 0, rows: rowTitles(await listState(page)), traffic: traffic.take()};
            await row.getByRole('button', {name: 'Delete', exact: true}).click();
            await dialog(page).waitFor({timeout: T});
            await dialog(page).getByRole('button', {name: 'Yes', exact: true}).click();
            await idle(page);
            await sleep(800);
            const afterYes = {open: (await page.locator('[role="dialog"]:visible').count()) > 0, rows: rowTitles(await listState(page)), traffic: traffic.take(), files: listFiles(filesA), filesBefore};
            await snap(page, '41-delete-yes', {afterNo, afterYes});
            await signOut(page);
            await publicRead(page, app, A.path, '42-public-after-delete', {id});
        } finally { await close(); }
    }

    // ---- expiry: today, tomorrow, a past date cleared ------------------------------
    if (on('expiry')) {
        const {page, close} = await launch(app);
        try {
            await as(page, A.users.mgr, A.path);
            await openAnnouncementsPage(page, app, A.path);
            for (const [title, date] of [['Expires today', TODAY], ['Expires tomorrow', dayOffset(1)]]) {
                await openAddPanel(page);
                await textInput(page, 'Title').fill(title);
                await textInput(page, 'Expiry Date').fill(date);
                const r = await save(page);
                await waitClosed(page);
                record(`50-add-${title.replace(/\s+/g, '-').toLowerCase()}`, {date, result: r.stillOpen ? r : {closed: true}});
            }
            let ls = await openAnnouncementsPage(page, app, A.path);
            st.ids = {...(st.ids || {}), ...Object.fromEntries((ls.rows || []).map((r) => [r.title, rowId(ls, r.title)]))};
            saveState();
            await snap(page, '51-list-with-expiries', {rows: (ls.rows || []).map((r) => ({title: r.title, text: r.text}))});
            // the past-dated one: clear the date and save
            await openEditPanel(page, 'Old news edited');
            const printed = fieldOf(await formState(page), 'Expiry Date');
            await textInput(page, 'Expiry Date').fill('');
            const r = await save(page);
            await waitClosed(page);
            record('52-old-news-date-cleared', {printedExpiry: printed, result: r.stillOpen ? r : {closed: true}});
            await signOut(page);
            for (const [key, title] of [['today', 'Expires today'], ['tomorrow', 'Expires tomorrow'], ['old', 'Old news edited'], ['past-control', 'Past dated control']]) {
                await publicRead(page, app, A.path, `53-public-expiry-${key}`, {id: st.ids[title]});
            }
        } finally { await close(); }
    }

    // ---- lang: context B, French under "Forms" ----------------------------------------
    if (on('lang')) {
        const {page, close} = await launch(app);
        try {
            await as(page, B.users.mgr, B.path);
            const ls0 = await openAnnouncementsPage(page, app, B.path);
            await snap(page, '60-lang-page', {list: ls0});
            const fresh = !rowTitles(ls0).includes('Call for papers');   // a rerun skips the adds already made
            if (fresh) {
            await openAddPanel(page);
            const form0 = await formState(page);
            await snap(page, '61-lang-add-panel', {form: form0, typeField: fieldOf(form0, 'Announcement Type') || null});
            const frToggle = dialog(page).locator('.pkpFormLocales button').filter({hasText: /Fran|French/}).first();
            await loc(page, 'Add Announcement: the French locale toggle', frToggle);
            if (await frToggle.count()) { await frToggle.click(); await sleep(400); }
            const formFr = await formState(page);
            await snap(page, '62-lang-add-french-shown', {form: formFr, labels: formFr.fields.map((f) => [f.label, f.visible, f.localeGroupVisible])});
            // empty save with two languages
            const r1 = await save(page);
            await snap(page, '63-lang-add-empty', {result: r1});
            await closePanel(page);
            // French only
            await openAddPanel(page);
            const frToggleB = dialog(page).locator('.pkpFormLocales button').filter({hasText: /Fran|French/}).first();
            if (await frToggleB.count()) { await frToggleB.click(); await sleep(400); }
            await textInput(page, 'Title', 1).fill('Appel à contributions');
            const r2 = await save(page);
            await snap(page, '64-lang-add-french-only', {result: r2, titleFields: r2.form.fields ? r2.form.fields.filter((f) => /Title/.test(f.label || '')) : null});
            // both languages
            await textInput(page, 'Title', 0).fill('Call for papers');
            await setRich(page, 'Short Description', 'In English.', 0);
            await setRich(page, 'Short Description', 'En français.', 1);
            const r3 = await save(page);
            await waitClosed(page);
            let ls = await listState(page);
            record('65-lang-add-both-saved', {result: r3.stillOpen ? r3 : {closed: true}, rows: rowTitles(ls)});
            // edit the English-only one: empty the primary title
            await openEditPanel(page, 'English only');
            const frToggle2 = dialog(page).locator('.pkpFormLocales button').filter({hasText: /Fran|French/}).first();
            if (await frToggle2.count()) { await frToggle2.click(); await sleep(400); }
            await textInput(page, 'Title', 0).fill('');
            const r4 = await save(page);
            await snap(page, '66-lang-edit-empty-primary', {result: r4, titleFields: r4.form.fields ? r4.form.fields.filter((f) => /Title/.test(f.label || '')) : null});
            await textInput(page, 'Title', 0).fill('English only');
            await closePanel(page);
            }
            let ls = await openAnnouncementsPage(page, app, B.path);
            st.B.ids = Object.fromEntries((ls.rows || []).map((r) => [r.title, rowId(ls, r.title)]));
            saveState();
            const lsFr = await openAnnouncementsPage(page, app, B.path, 'fr_CA');
            await snap(page, '67-lang-list-fr', {rows: (lsFr.rows || []).map((r) => r.title), h1: await page.locator('main h1').first().innerText().catch(() => null)});
            // the edit panel under /fr_CA/: which language's boxes show first
            await openEditPanel(page, /Appel|Call for papers/);
            await snap(page, '67b-lang-edit-panel-fr', {form: await formState(page)});
            await closePanel(page);
            await signOut(page);
            await publicRead(page, app, B.path, '68-public-fr', {id: st.B.ids['Call for papers'], locale: 'fr_CA'});
            await publicRead(page, app, B.path, '68-public-en', {id: st.B.ids['Call for papers'], locale: 'en'});
            await publicRead(page, app, B.path, '69-public-fr-fallback', {id: st.B.ids['English only'], locale: 'fr_CA'});
        } finally { await close(); }
    }

    // ---- dateshort: "Date (Short)" changed, the edit panel's printed date (A3) ------------
    if (on('dateshort')) {
        const {page, close} = await launch(app);
        try {
            await as(page, A.users.mgr, A.path);
            await page.goto(ctxUrl(app, A.path, '/management/settings/website'));
            await idle(page);
            await page.locator('#setup-button').click();
            await idle(page);
            const dt = page.locator('#setup').getByRole('tab', {name: /Date/});
            const dtName = await dt.first().innerText().catch(() => null);
            await dt.first().click();
            await idle(page);
            await sleep(400);
            const panel = page.locator('#setup [role="tabpanel"]:visible').first();
            const readDateForm = () => panel.evaluate((root) => ({
                text: root.innerText.replace(/\s+/g, ' ').trim().slice(0, 1500),
                groups: [...root.querySelectorAll('.pkpFormField')].map((f) => ({label: f.querySelector('.pkpFormFieldLabel, legend')?.innerText.trim() ?? null, radios: [...f.querySelectorAll('input[type=radio]')].map((r) => ({name: r.name, value: r.value, checked: r.checked, label: r.labels && r.labels[0] ? r.labels[0].innerText.trim() : null})), texts: [...f.querySelectorAll('input[type=text]')].map((i) => ({name: i.name, value: i.value}))})),
                status: root.querySelector('.pkpFormPage__status')?.innerText.trim() ?? null,
            }));
            const before = await readDateForm();
            await snap(page, '70-datetime-tab', {tabName: dtName, form: before});
            const shortGroup = before.groups.find((g) => /Date \(Short\)|dateFormatShort/i.test(g.label || '') || g.radios.some((r) => /dateFormatShort/i.test(r.name || '')));
            const other = shortGroup && shortGroup.radios.find((r) => !r.checked && r.value && !/custom|^$/i.test(r.value));
            let changed = null;
            if (other) {
                const radio = panel.locator(`input[type=radio][name="${other.name}"][value="${other.value.replace(/"/g, '\\"')}"]`).first();
                await radio.check({force: true}).catch(async () => { await panel.locator('label').filter({hasText: other.label}).first().click(); });
                await sleep(300);
                await panel.getByRole('button', {name: 'Save', exact: true}).click();
                await panel.locator('[role="status"]:has-text("Saved"), .pkpFormPage__status:has-text("Saved")').first().waitFor({timeout: T}).catch(() => {});
                await sleep(500);
                changed = {picked: other, form: await readDateForm()};
                st.dateShortOriginal = shortGroup.radios.find((r) => r.checked);
                saveState();
            }
            await snap(page, '71-datetime-changed', {shortGroup, changed});
            // the edit panel of one with an expiry
            await openAnnouncementsPage(page, app, A.path);
            await openEditPanel(page, 'Annual conference');
            const formA3 = await formState(page);
            const r1 = await save(page);
            await snap(page, '72-edit-with-other-date-format', {printedExpiry: fieldOf(formA3, 'Expiry Date'), result: r1, expiryAfterSave: fieldOf(r1.form, 'Expiry Date'), listRowText: (await listState(page)).rows?.find((r) => r.title === 'Annual conference')?.text});
            if (r1.stillOpen) {
                await textInput(page, 'Expiry Date').fill(dayOffset(30));
                const r2 = await save(page);
                record('72b-edit-retyped-date', {result: r2.stillOpen ? r2 : {closed: true}});
                if (r2.stillOpen) await closePanel(page);
            }
            // the public list's date format
            await signOut(page);
            await publicRead(page, app, A.path, '73-public-other-date-format', {id: st.ids ? st.ids['Annual conference'] : null});
            // restore
            await as(page, A.users.mgr, A.path);
            await page.goto(ctxUrl(app, A.path, '/management/settings/website'));
            await idle(page);
            await page.locator('#setup-button').click();
            await idle(page);
            await dt.first().click();
            await idle(page);
            await sleep(400);
            if (st.dateShortOriginal) {
                const radio = panel.locator(`input[type=radio][name="${st.dateShortOriginal.name}"][value="${st.dateShortOriginal.value.replace(/"/g, '\\"')}"]`).first();
                await radio.check({force: true}).catch(() => {});
                await sleep(300);
                await panel.getByRole('button', {name: 'Save', exact: true}).click();
                await panel.locator('[role="status"]:has-text("Saved"), .pkpFormPage__status:has-text("Saved")').first().waitFor({timeout: T}).catch(() => {});
            }
            record('74-datetime-restored', {form: await readDateForm()});
            await signOut(page);
        } finally { await close(); }
    }

    // ---- admin: the site administrator in journal A as a control level ----------------
    if (on('admin')) {
        const {page, close} = await launch(app);
        try {
            await as(page, 'admin', A.path);
            const ls = await openAnnouncementsPage(page, app, A.path);
            await openAddPanel(page);
            await snap(page, '80-admin-add-panel', {list: ls, form: await formState(page)});
            await closePanel(page);
            await openEditPanel(page, 'Call for papers');
            await snap(page, '81-admin-edit-panel', {form: await formState(page)});
            await closePanel(page);
            await signOut(page);
        } finally { await close(); }
    }
});
