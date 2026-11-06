// U11 drift sweep SW06 (housekeeping 2026-11-06), the fresh drive: the lines
// the kept checks' re-run outputs do not settle, all three apps on `main`.
// Spec: docs/specs/U11-highlights.md. The rest of the sweep is the kept checks
// re-run (K1/k1.js, K1/k1-fr0924.js, K2/k2.js, K3/k3.js, C11/c11.js, one lane
// per app, outputs .reports/U11/sw06-<id>-<app>/) and the register's issue
// walks through SW06/walks.sh (dataset fleet; see its header).
//
// Seeds its own scratch context (French under "UI" and "Forms", a manager)
// and, per app:
//   a4        Rule 6 / A4: "Edit", a changed title closed with the close
//             control; the row; "Edit" again; a "Save" that changes only
//             "URL"; the row and the panel after a reload; the home page;
//             then the same change left by Escape on "URL" and by a click
//             outside the panel (the row after each, and after a reload).
//   image     the "Image" row on "Add Highlight": a .txt dropped (the box,
//             the form's error summary, "Save" / "Upload File", no request),
//             then a PNG (the messages, the refused name, the preview, the
//             "Alternate text" box), saved; the stored file; the slide.
//             Then Rule 10 / A11: "Edit" › "Remove" › a PNG named photo.jpg ›
//             "Save" (the answer, the panel, the stored file), the panel
//             closed and reopened, the slide signed out; then a real PNG
//             saved over it (the slide put right).
//   btnlabel  Fields "Button Label": on an edit with two form languages,
//             "Button Label" emptied and saved.
//   order     A1's tail: ordering mode with a row moved, the moved-past
//             highlight deleted in a second tab, "Save Order" refused; the
//             dialog, the rows after "OK", after a reload.
//   roles     the manager on Settings › Users & Roles › Roles: each role's
//             permission level (Actors, the manager-level roles).
//   many      a scratch context of its own with 31 highlights (MANY=n for
//             another count) added through the panel: the panel's own list
//             request, the rows after a reload, any pager; the home page.
//   fill      MANY_CTX=<path> MANY=101: tops a `many` context up to MANY
//             highlights with a faster add loop (no settle waits), then
//             reads the rows after a reload as `many` does.
//   manyplus  MANY_CTX=<a `many` context's path> (run `many` with MANY=101
//             first): one more highlight added on a list past the API's cap
//             of 100; the rows right after "Save" and after a reload.
//   site      the Site Administrator on Site Settings › Highlights: a site
//             highlight with French "Title" and "Button Label" (Rule 11 at
//             site scope, Coverage "Planned"), the site's home page in
//             English and in French signed out, then deleted; and the
//             "Site refused …" rows the kept K2 check left before its
//             2026-11-06 fix deleted too.
//
//   PROBE_FEATURE=U11 PROBE_AGENT=ccSW06 PROBE_RUN=r1 node bin/probe.js all shared/playwright/checks/U11/SW06/sw06.js
//   PROBE_RUN=r2 for the second run; PHASES=seed,a4,image,btnlabel,order,roles,many,site
//   (default: all; later phases reuse sw06-state-<run>-<app>.json, named
//   through outFile(), from the seed phase). Run `site` only once the kept
//   checks on the same fleet are done: it changes the site's home page.
//   The past-100 end (A12 candidate, SW06-10) is not in the default list:
//   PROBE_RUN=r1b PHASES=many MANY=31 (or any count) seeds a context; then
//   MANY_CTX=<its path, in many-01-list-<run>-<app>.json> MANY=101 PHASES=fill,
//   then the same MANY_CTX with PHASES=manyplus (same PROBE_RUN). `many` with
//   MANY=101 also works but its settled adds took ~20 s each on OJS and OMP.
//   Outputs: .reports/U11/<PROBE_AGENT>/<name>-<run>-<app>.json|png.
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, signOut, screen, shot, record, loc, note, idle, tag, outFile, serverLog} =
    require('../../../probe');

const ALL = ['seed', 'a4', 'image', 'btnlabel', 'order', 'roles', 'many', 'site'];
const PHASES = process.env.PHASES ? process.env.PHASES.split(',') : ALL;
const on = (p) => PHASES.includes(p);
const log = (...a) => console.log('[sw06]', ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const T = 20_000;
const REPO = path.resolve(__dirname, '../../../../..');
const PNG = path.join(REPO, 'apps/ojs/playwright/fixtures/files/profile-image-400.png');

const dialog = (page) => page.locator('[role="dialog"]:visible').last();
const flat = (s, n = 800) => (s || '').replace(/\s+/g, ' ').trim().slice(0, n);

async function snap(page, name, extra = {}) {
    const s = await screen(page);
    record(name, {...s, ...extra});
    await shot(page, name).catch(() => {});
    return s;
}

async function panelState(page) {
    return page.locator('.highlightsListPanel').first().evaluate((root) => {
        const btn = (b) => ({name: (b.getAttribute('aria-label') || b.innerText).replace(/\s+/g, ' ').trim(), disabled: b.disabled || b.getAttribute('aria-disabled') === 'true'});
        return {
            title: root.querySelector('.pkpHeader__title')?.innerText.trim() ?? null,
            headerButtons: [...root.querySelectorAll('.pkpHeader__actions button')].map(btn),
            empty: root.querySelector('.listPanel__empty')?.innerText.trim() ?? null,
            rows: [...root.querySelectorAll('.listPanel__item')].map((li) => li.querySelector('.listPanel__itemTitle')?.innerText.trim()),
        };
    }).catch((e) => ({error: String(e.message || e)}));
}

/** The open side panel: heading, error summary, footer buttons, every field's label, error, visible inputs and buttons. */
async function formState(page) {
    const d = dialog(page);
    if ((await d.count()) === 0) return {open: false};
    return d.evaluate((root) => {
        const txt = (el) => (el ? el.innerText.replace(/\s+/g, ' ').trim() : null);
        return {
            open: true,
            heading: txt(root.querySelector('h1, h2')),
            errorSummary: txt(root.querySelector('.pkpFormErrors')),
            footerButtons: [...root.querySelectorAll('.pkpFormPage__footer button')].map((b) => ({name: b.innerText.trim(), disabled: b.disabled})),
            fields: [...root.querySelectorAll('.pkpFormField')].filter((f) => f.offsetParent !== null).map((f) => ({
                label: txt(f.querySelector('.pkpFormFieldLabel')),
                description: txt(f.querySelector('.pkpFormField__description')),
                error: txt(f.querySelector('.pkpFieldError')),
                inputs: [...f.querySelectorAll('input:not([type=hidden]), textarea')].filter((i) => i.offsetParent !== null || i.type === 'file').map((i) => ({type: i.type, id: i.id, value: i.value})),
                buttons: [...f.querySelectorAll('button')].filter((b) => b.offsetParent !== null).map((b) => ({name: (b.getAttribute('aria-label') || b.innerText).replace(/\s+/g, ' ').trim(), disabled: b.disabled})),
                preview: (() => { const img = f.querySelector('.pkpFormField--upload__preview img, img'); return img ? {src: (img.getAttribute('src') || '').slice(0, 120), alt: img.getAttribute('alt'), printed: txt(img.parentElement)} : null; })(),
                text: txt(f).slice(0, 600),
                dzErrors: [...f.querySelectorAll('.dz-error-message')].map(txt).filter(Boolean),
                dzNames: [...f.querySelectorAll('.dz-preview .dz-filename')].map(txt),
                dzRemove: [...f.querySelectorAll('.dz-preview .dz-remove')].map(txt),
            })),
        };
    });
}

async function slides(page) {
    return page.evaluate(() => {
        const block = document.querySelector('.highlights');
        if (!block) return {present: false};
        const vis = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return {w: Math.round(r.width), h: Math.round(r.height), display: cs.display, visibility: cs.visibility, color: cs.color}; };
        return {
            present: true,
            heading: block.querySelector('h2')?.innerText.trim() ?? null,
            slides: [...block.querySelectorAll('li.swiper-slide')].map((li) => ({
                classes: li.className,
                box: vis(li),
                title: li.querySelector('.swiper-slide-title')?.innerHTML.trim(),
                titleBox: vis(li.querySelector('.swiper-slide-title')),
                desc: li.querySelector('.swiper-slide-desc')?.innerHTML.trim(),
                button: {text: li.querySelector('.swiper-slide-button')?.innerText.trim(), href: li.querySelector('.swiper-slide-button')?.getAttribute('href'), box: vis(li.querySelector('.swiper-slide-button'))},
                img: ((i) => (i ? {src: i.getAttribute('src'), alt: i.getAttribute('alt'), complete: i.complete, naturalWidth: i.naturalWidth} : null))(li.querySelector('img')),
            })),
            dots: block.querySelectorAll('.swiper-pagination-bullet').length,
        };
    });
}

function highlightsDir(app, contextId) {
    const cfg = fs.readFileSync(path.join(app.root, 'config.test.inc.php'), 'utf8');
    const m = cfg.match(/^public_files_dir\s*=\s*(.+)$/m);
    const pub = path.resolve(app.root, m ? m[1].trim().replace(/^["']|["']$/g, '') : 'public');
    const seg = {ojs: 'journals', omp: 'presses', ops: 'contexts'}[app.name];
    return contextId === 'site' ? path.join(pub, 'site', 'highlights') : path.join(pub, seg, String(contextId), 'highlights');
}
function listFiles(dir) {
    try { return fs.readdirSync(dir).map((f) => ({name: f, size: fs.statSync(path.join(dir, f)).size, mtime: fs.statSync(path.join(dir, f)).mtime.toISOString()})); } catch { return []; }
}

const ctxUrl = (app, p, rest = '', locale = 'en') => app.url(`/index.php/${p}${locale ? '/' + locale : ''}${rest}`);

async function openTab(page, url, {setup = true} = {}) {
    await page.goto(url);
    await idle(page);
    if (setup) {
        const setupTab = page.locator('#setup-button').first(); // Site Settings carry two (U11 SW06)
        await setupTab.waitFor({timeout: T});
        if ((await setupTab.getAttribute('aria-selected')) !== 'true') await setupTab.click();
        await idle(page);
    }
    await page.getByRole('tab', {name: /^(Highlights|En vedette)$/}).first().click();
    await idle(page);
    await page.locator('.highlightsListPanel').first().waitFor({timeout: T});
    await idle(page);
}
const openJournalTab = (page, app, P) => openTab(page, ctxUrl(app, P, '/management/settings/website'));
const openSiteTab = (page, app, locale = 'en') => openTab(page, app.url(`/index.php/index/${locale}/admin/settings`));

async function openAdd(page) {
    await page.locator('.highlightsListPanel').getByRole('button', {name: 'Add Highlight', exact: true}).click();
    await dialog(page).locator('.pkpFormPage__footer').waitFor({timeout: T});
    await idle(page); await sleep(400);
}
async function openEdit(page, rowTitle) {
    const row = page.locator('.highlightsListPanel .listPanel__item').filter({hasText: rowTitle}).first();
    await row.getByRole('button', {name: 'Edit', exact: true}).click();
    await dialog(page).locator('.pkpFormPage__footer').waitFor({timeout: T});
    await idle(page); await sleep(400);
}
function field(page, label, index = 0) {
    return dialog(page).locator('.pkpFormField').filter({has: page.locator('label.pkpFormFieldLabel'), hasText: new RegExp(`(^|\\s)${label}`)}).nth(index);
}
async function richBody(page, label, index = 0) {
    const frame = field(page, label, index).locator('iframe').first();
    await frame.waitFor({timeout: T});
    await page.waitForFunction((el) => el.contentDocument && el.contentDocument.body && el.contentDocument.body.getAttribute('contenteditable') === 'true', await frame.elementHandle(), {timeout: T}).catch(() => {});
    return frame.contentFrame().locator('body');
}
async function setRich(page, label, text, index = 0) {
    const body = await richBody(page, label, index);
    await body.click();
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.press('Delete');
    if (text) await body.pressSequentially(text);
    await sleep(150);
}
const richHtml = async (page, label, index = 0) => (await richBody(page, label, index)).evaluate((b) => b.innerHTML);
const textBox = (page, label, index = 0) => field(page, label, index).locator('input.pkpFormField__input').first();

/** Press "Save" and return the API answer it produced (POST or the PUT override). */
async function saveAndAnswer(page) {
    const resp = page.waitForResponse((r) => /\/api\/v1\/highlights(\/\d+)?(\?|$)/.test(r.url()) && r.request().method() === 'POST', {timeout: T}).catch(() => null);
    await dialog(page).getByRole('button', {name: 'Save', exact: true}).click();
    const r = await resp;
    await idle(page); await sleep(600); await idle(page);
    return r ? {status: r.status(), override: r.request().headers()['x-http-method-override'] || null, body: await r.json().catch(() => null)} : null;
}
async function closePanel(page) {
    await dialog(page).getByRole('button', {name: 'Close', exact: true}).click();
    await page.locator('[role="dialog"]:visible').waitFor({state: 'hidden', timeout: T}).catch(() => {});
    await sleep(500); await idle(page);
}
async function addHighlight(page, {title, url, label, frTitle, frLabel}) {
    await openAdd(page);
    await setRich(page, 'Title', title);
    if (frTitle) {
        await dialog(page).getByRole('button', {name: 'French', exact: true}).click().catch(() => {});
        await sleep(300);
        await setRich(page, 'Title', frTitle, 1);
    }
    await textBox(page, 'URL').fill(url);
    await textBox(page, 'Button Label').fill(label);
    if (frLabel) await textBox(page, 'Button Label', 1).fill(frLabel);
    const a = await saveAndAnswer(page);
    await page.locator('[role="dialog"]:visible').waitFor({state: 'hidden', timeout: T}).catch(() => {});
    await idle(page);
    return a;
}

/** A signed-out read of a page in a browser of its own. */
async function signedOutRead(app, url, name, focus = null) {
    const {page, close} = await launch(app);
    try {
        await page.goto(url); await idle(page);
        const c = await slides(page);
        await snap(page, name, {carousel: c});
        if (focus && c.present) {
            // walk "Next slide" to the slide in question and picture it
            for (let i = 0; i < 6; i++) {
                const active = await page.locator('.highlights li.swiper-slide-active .swiper-slide-title').innerText().catch(() => '');
                if (focus.test(active)) break;
                await page.getByRole('button', {name: 'Next slide', exact: true}).click().catch(() => {});
                await sleep(500);
            }
            const slide = page.locator('.highlights li.swiper-slide-active');
            const seen = await slide.evaluate((li) => {
                const pt = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); const top = document.elementFromPoint(r.left + Math.min(10, r.width / 2), r.top + Math.min(8, r.height / 2)); return {x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), onTop: !!top && (el === top || el.contains(top))}; };
                return {title: pt(li.querySelector('.swiper-slide-title')), desc: pt(li.querySelector('.swiper-slide-desc')), button: pt(li.querySelector('.swiper-slide-button')), img: pt(li.querySelector('img')), slide: pt(li)};
            }).catch((e) => ({error: String(e.message || e)}));
            await shot(page, `${name}-active`).catch(() => {});
            record(`${name}-active`, {focus: String(focus), seen});
            c.focusSeen = seen;
        }
        return c;
    } finally { await close(); }
}

// ---------------------------------------------------------------------------

forEachApp(async (app) => {
    const stateFile = outFile('sw06-state.json');
    let st = fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile, 'utf8')) : null;
    const saveState = () => fs.writeFileSync(stateFile, JSON.stringify(st, null, 2));

    const needsState = PHASES.some((p) => ['a4', 'image', 'btnlabel', 'order', 'roles', 'site'].includes(p));
    if (on('seed') || (!st && needsState)) {
        const t = tag('u11sw06');
        const users = [{username: `${t}mgr`, roles: ['manager'], givenName: 'Mona', familyName: 'Manager'}];
        const ctx = await app.api.createContext({tag: t, context: {name: `U11 SW06 ${t}`, acronym: 'U11SW', supportedLocales: ['en', 'fr_CA'], supportedFormLocales: ['en', 'fr_CA']}, users});
        st = {tag: t, P: ctx.path || t, contextId: ctx.contextId, mgr: `${t}mgr`};
        saveState();
        log(app.name, 'seeded', st.P, st.contextId);
        note(`sw06 ${app.name}: scratch context ${st.P} (id ${st.contextId}), en+fr_CA under "UI" and "Forms"; manager ${st.mgr}`);
    }
    const P = st && st.P;
    const hDir = st ? highlightsDir(app, st.contextId) : null;

    // ---- a4 -------------------------------------------------------------------
    if (on('a4')) {
        const {page, close} = await launch(app);
        try {
            await signIn(page, st.mgr, {contextPath: P}); await idle(page);
            await openJournalTab(page, app, P);
            const add = await addHighlight(page, {title: 'Open call', url: 'https://example.org/a4', label: 'Read'});
            await snap(page, 'a4-01-added', {add: add && add.status, panel: await panelState(page)});
            // close control
            await openEdit(page, 'Open call');
            await setRich(page, 'Title', 'Open call Draft');
            const dialogs = [];
            page.on('dialog', (d) => { dialogs.push({type: d.type(), message: d.message()}); d.accept().catch(() => {}); });
            await closePanel(page);
            await snap(page, 'a4-02-closed-by-control', {panel: await panelState(page), browserDialogs: [...dialogs]});
            await openEdit(page, 'Open call');
            const reopened = await richHtml(page, 'Title');
            await snap(page, 'a4-03-edit-reopened', {titleBox: reopened});
            await textBox(page, 'URL').fill('https://example.org/a4b');
            const saved = await saveAndAnswer(page);
            await page.locator('[role="dialog"]:visible').waitFor({state: 'hidden', timeout: T}).catch(() => {});
            await snap(page, 'a4-04-saved-url-only', {answer: saved && {status: saved.status, title: saved.body && saved.body.title, url: saved.body && saved.body.url}, panel: await panelState(page)});
            await page.reload(); await idle(page);
            await openJournalTab(page, app, P);
            const afterReload = await panelState(page);
            await openEdit(page, 'Open call');
            const titleAfterReload = await richHtml(page, 'Title');
            await snap(page, 'a4-05-after-reload', {panel: afterReload, titleBox: titleAfterReload});
            await closePanel(page);
            // Escape on the URL box, with the title changed
            await openEdit(page, 'Open call');
            await setRich(page, 'Title', 'Escape draft');
            await textBox(page, 'URL').click();
            await page.keyboard.press('Escape');
            await sleep(600); await idle(page);
            const escOpen = await page.locator('[role="dialog"]:visible').count();
            await snap(page, 'a4-06-escape', {dialogsOpen: escOpen, panel: await panelState(page), browserDialogs: [...dialogs]});
            if (escOpen) await closePanel(page);
            // a click outside the panel
            await openEdit(page, /Escape draft|Open call/);
            await setRich(page, 'Title', 'Outside draft');
            await page.mouse.click(20, 450);
            await sleep(600); await idle(page);
            const outOpen = await page.locator('[role="dialog"]:visible').count();
            await snap(page, 'a4-07-outside-click', {dialogsOpen: outOpen, panel: await panelState(page), browserDialogs: [...dialogs]});
            if (outOpen) await closePanel(page);
            await page.reload(); await idle(page);
            await openJournalTab(page, app, P);
            await snap(page, 'a4-08-reload', {panel: await panelState(page)});
            await signOut(page);
            const home = await signedOutRead(app, ctxUrl(app, P), 'a4-09-home-signed-out');
            log(app.name, 'a4', JSON.stringify({home: home.slides && home.slides.map((s) => s.title)}).slice(0, 300));
        } finally { await close(); }
    }

    // ---- image ----------------------------------------------------------------
    if (on('image')) {
        const upl = outFile('upl'); fs.mkdirSync(upl, {recursive: true});
        const txt = path.join(upl, 'notes.txt'); fs.writeFileSync(txt, 'not a picture\n');
        const jpg = path.join(upl, 'photo.jpg'); fs.copyFileSync(PNG, jpg);
        const png2 = path.join(upl, 'photo2.png'); fs.copyFileSync(PNG, png2);
        const {page, close} = await launch(app);
        try {
            await signIn(page, st.mgr, {contextPath: P}); await idle(page);
            await openJournalTab(page, app, P);
            await openAdd(page);
            await setRich(page, 'Title', 'Annual conference');
            await textBox(page, 'URL').fill('https://example.org/conference');
            await textBox(page, 'Button Label').fill('Register');
            const tmpReq = [];
            page.on('request', (r) => { if (/temporaryFiles/.test(r.url())) tmpReq.push({method: r.method(), url: r.url()}); });
            await page.locator('[role="dialog"]:visible input[type=file]').last().setInputFiles(txt);
            await sleep(1200); await idle(page);
            await snap(page, 'img-01-txt-refused', {form: await formState(page), temporaryFilesRequests: [...tmpReq]});
            const up = page.waitForResponse((r) => /temporaryFiles/.test(r.url()) && r.request().method() === 'POST', {timeout: T}).catch(() => null);
            await page.locator('[role="dialog"]:visible input[type=file]').last().setInputFiles(PNG);
            const upR = await up; await idle(page); await sleep(800);
            await snap(page, 'img-02-png-after-txt', {form: await formState(page), uploadStatus: upR && upR.status()});
            await loc(page, 'Image: "Alternate text" box', field(page, 'Image').locator('input.pkpFormField--uploadImage__altTextInput'));
            await field(page, 'Image').locator('input.pkpFormField--uploadImage__altTextInput').fill('Conference hall');
            const a = await saveAndAnswer(page);
            await page.locator('[role="dialog"]:visible').waitFor({state: 'hidden', timeout: T}).catch(() => {});
            const files1 = listFiles(hDir);
            await snap(page, 'img-03-saved', {answer: a && {status: a.status, image: a.body && a.body.image}, panel: await panelState(page), files: files1});
            const home1 = await signedOutRead(app, ctxUrl(app, P), 'img-04-home', /Annual/);
            // A11: a PNG named photo.jpg over the stored picture
            await openEdit(page, 'Annual conference');
            await field(page, 'Image').getByRole('button', {name: 'Remove', exact: true}).click();
            await sleep(400);
            const up2 = page.waitForResponse((r) => /temporaryFiles/.test(r.url()) && r.request().method() === 'POST', {timeout: T}).catch(() => null);
            await page.locator('[role="dialog"]:visible input[type=file]').last().setInputFiles(jpg);
            const up2R = await up2; await idle(page); await sleep(800);
            const formBefore = await formState(page);
            const sl = serverLog(app); const from = sl.mark();
            const bad = await saveAndAnswer(page);
            await sleep(800);
            const formAfter = await formState(page);
            const filesAfterRefused = listFiles(hDir);
            await snap(page, 'img-05-photojpg-refused', {upload: up2R && up2R.status(), formBefore: formBefore.fields && formBefore.fields.find((f) => /^Image/.test(f.label || '')), answer: bad, formAfter, files: filesAfterRefused, serverLog: sl.since(from)});
            if (formAfter.open) await closePanel(page);
            await openEdit(page, 'Annual conference');
            const reopened = (await formState(page)).fields.find((f) => /^Image/.test(f.label || ''));
            await snap(page, 'img-06-reopened', {image: reopened});
            await closePanel(page);
            await page.reload(); await idle(page);
            await openJournalTab(page, app, P);
            await openEdit(page, 'Annual conference');
            const reopenedAfterReload = (await formState(page)).fields.find((f) => /^Image/.test(f.label || ''));
            await snap(page, 'img-06b-reopened-after-reload', {image: reopenedAfterReload});
            await closePanel(page);
            const sl2 = serverLog(app); const from2 = sl2.mark();
            const home2 = await signedOutRead(app, ctxUrl(app, P), 'img-07-home-after-refused', /Annual/);
            record('img-07b-home-server-log', {lines: serverLog(app, {match: /error|exception|fatal|warning|deprecated|\[5\d\d\]/i}).since(from2)});
            // put it right with a picture the app accepts
            await openEdit(page, 'Annual conference');
            const up3 = page.waitForResponse((r) => /temporaryFiles/.test(r.url()) && r.request().method() === 'POST', {timeout: T}).catch(() => null);
            await page.locator('[role="dialog"]:visible input[type=file]').last().setInputFiles(png2);
            await up3; await idle(page); await sleep(800);
            await field(page, 'Image').locator('input.pkpFormField--uploadImage__altTextInput').fill('Conference hall');
            const good = await saveAndAnswer(page);
            await page.locator('[role="dialog"]:visible').waitFor({state: 'hidden', timeout: T}).catch(() => {});
            await snap(page, 'img-08-good-png', {answer: good && {status: good.status, image: good.body && good.body.image}, files: listFiles(hDir)});
            const home3 = await signedOutRead(app, ctxUrl(app, P), 'img-09-home-put-right', /Annual/);
            const pick = (h) => ({seen: h.focusSeen, img: ((h.slides || []).find((s) => /Annual/.test(s.title || '')) || {}).img});
            log(app.name, 'image', JSON.stringify({bad: bad && bad.status, badBody: bad && bad.body, open: formAfter.open, files: filesAfterRefused.map((f) => f.name), home1: pick(home1), home2: pick(home2), home3: pick(home3)}).slice(0, 1500));
            await signOut(page);
        } finally { await close(); }
    }

    // ---- btnlabel ---------------------------------------------------------------
    if (on('btnlabel')) {
        const {page, close} = await launch(app);
        try {
            await signIn(page, st.mgr, {contextPath: P}); await idle(page);
            await openJournalTab(page, app, P);
            await addHighlight(page, {title: 'Label check', url: 'https://example.org/label', label: 'Open'});
            await openEdit(page, 'Label check');
            await textBox(page, 'Button Label').fill('');
            const r = await saveAndAnswer(page);
            await snap(page, 'btn-01-empty-label-on-edit', {answer: r && {status: r.status, body: r.body}, form: await formState(page)});
            await closePanel(page);
            // on an add (the other end): the same box empty
            await openAdd(page);
            await setRich(page, 'Title', 'Label check two');
            await textBox(page, 'URL').fill('https://example.org/label2');
            const r2 = await saveAndAnswer(page);
            await snap(page, 'btn-02-empty-label-on-add', {answer: r2 && {status: r2.status, body: r2.body}, form: await formState(page)});
            await closePanel(page);
            log(app.name, 'btnlabel', JSON.stringify({edit: r && r.body, add: r2 && r2.body}));
            await signOut(page);
        } finally { await close(); }
    }

    // ---- order: a refused "Save Order" ------------------------------------------------
    if (on('order')) {
        const {page, close} = await launch(app);
        try {
            await signIn(page, st.mgr, {contextPath: P}); await idle(page);
            await openJournalTab(page, app, P);
            for (const n of ['Ord one', 'Ord two', 'Ord three']) await addHighlight(page, {title: n, url: `https://example.org/${n.replace(' ', '')}`, label: 'Go'});
            const before = await panelState(page);
            await page.locator('.highlightsListPanel').getByRole('button', {name: 'Order', exact: true}).click(); await idle(page);
            await page.getByRole('button', {name: 'Increase position of Ord three', exact: true}).click(); await idle(page);
            const moved = await panelState(page);
            // the second tab deletes "Ord two" meanwhile
            const second = await page.context().newPage();
            await openJournalTab(second, app, P);
            const row = second.locator('.highlightsListPanel .listPanel__item').filter({hasText: 'Ord two'}).first();
            await row.getByRole('button', {name: 'Delete', exact: true}).click();
            const del = second.waitForResponse((r) => /highlights\/\d+/.test(r.url()) && r.request().method() === 'POST', {timeout: T}).catch(() => null);
            await second.locator('[role="dialog"]:visible').last().getByRole('button', {name: 'Yes', exact: true}).click();
            const delR = await del; await idle(second);
            await second.close();
            const ord = page.waitForResponse((r) => /highlights\/order/.test(r.url()), {timeout: T}).catch(() => null);
            await page.locator('.highlightsListPanel').getByRole('button', {name: 'Save Order', exact: true}).click();
            const ordR = await ord; await idle(page); await sleep(500);
            const dlgText = flat(await page.locator('[role="dialog"]:visible').last().innerText().catch(() => null));
            await snap(page, 'ord-01-refused', {before, moved, deleteStatus: delR && delR.status(), order: ordR && {status: ordR.status(), body: await ordR.json().catch(() => null)}, dialogText: dlgText, panel: await panelState(page)});
            const ok = page.locator('[role="dialog"]:visible').last().getByRole('button', {name: 'OK', exact: true});
            if (await ok.count()) { await ok.click(); await idle(page); }
            await snap(page, 'ord-02-after-ok', {panel: await panelState(page)});
            await page.reload(); await idle(page);
            await openJournalTab(page, app, P);
            await snap(page, 'ord-03-after-reload', {panel: await panelState(page)});
            log(app.name, 'order', JSON.stringify({moved: moved.rows, order: ordR && ordR.status(), dialogText: dlgText}));
            await signOut(page);
        } finally { await close(); }
    }

    // ---- roles: the Roles grid's permission level per role (Actors, lines 28–31) ---------------
    if (on('roles')) {
        const {page, close} = await launch(app);
        try {
            await signIn(page, st.mgr, {contextPath: P}); await idle(page);
            await page.goto(ctxUrl(app, P, '/management/settings/access')); await idle(page);
            await page.getByRole('tab', {name: 'Roles', exact: true}).click();
            await idle(page); await sleep(800);
            const rows = await page.locator('#roles tr, #roles [role="row"], #roles .listPanel__item').evaluateAll((els) => els.map((e) => e.innerText.replace(/\s+/g, ' ').trim()).filter(Boolean));
            await snap(page, 'roles-01-grid', {rows});
            log(app.name, 'roles', JSON.stringify(rows.filter((r) => /Manager|editor|Editor|Moderator/.test(r))).slice(0, 800));
            await signOut(page);
        } finally { await close(); }
    }

    // ---- many: the list past the panel's page size (its list request asks for 30) ----------
    if (on('many')) {
        const {page, close} = await launch(app);
        try {
            const N = Number(process.env.MANY || 31);
            const t = tag('u11sw06m');
            const ctx = await app.api.createContext({tag: t, context: {name: `U11 SW06 many ${t}`}, users: [{username: `${t}mgr`, roles: ['manager']}]});
            const MP = ctx.path || t;
            await signIn(page, `${t}mgr`, {contextPath: MP}); await idle(page);
            await openJournalTab(page, app, MP);
            for (let i = 1; i <= N; i++) await addHighlight(page, {title: `Many ${String(i).padStart(3, '0')}`, url: `https://example.org/m${i}`, label: 'Go'});
            const listReq = page.waitForResponse((r) => /\/api\/v1\/highlights\?/.test(r.url()) && r.request().method() === 'GET', {timeout: T}).catch(() => null);
            await page.reload(); await idle(page);
            await openJournalTab(page, app, MP);
            const lr = await listReq;
            const body = lr ? await lr.json().catch(() => null) : null;
            const panel = await panelState(page);
            const pager = await page.locator('.highlightsListPanel').first().evaluate((root) => [...root.querySelectorAll('.pkpPagination, nav[aria-label], .listPanel__footer')].map((e) => e.innerText.replace(/\s+/g, ' ').trim()));
            await snap(page, 'many-01-list', {n: N, request: lr && lr.url().replace(/^.*\/api\/v1\//, ''), itemsMax: body && body.itemsMax, items: body && body.items && body.items.length, rows: panel.rows && panel.rows.length, last: panel.rows && panel.rows.slice(-2), pager});
            await signOut(page);
            const home = await signedOutRead(app, ctxUrl(app, MP), 'many-02-home');
            log(app.name, 'many', JSON.stringify({n: N, itemsMax: body && body.itemsMax, items: body && body.items && body.items.length, rows: panel.rows && panel.rows.length, pager, slides: home.slides && home.slides.length}));
        } finally { await close(); }
    }

    // ---- fill: top a `many` context up to MANY highlights (MANY_CTX=<path>), a faster add loop ----------
    if (on('fill')) {
        const MP = process.env.MANY_CTX; const N = Number(process.env.MANY || 101);
        const {page, close} = await launch(app);
        try {
            await signIn(page, `${MP}mgr`, {contextPath: MP}); await idle(page);
            await openJournalTab(page, app, MP);
            let have = (await panelState(page)).rows.length;
            for (let i = have + 1; i <= N; i++) {
                await page.locator('.highlightsListPanel').getByRole('button', {name: 'Add Highlight', exact: true}).click();
                await dialog(page).locator('.pkpFormPage__footer').waitFor({timeout: T});
                await setRich(page, 'Title', `Many ${String(i).padStart(3, '0')}`);
                await textBox(page, 'URL').fill(`https://example.org/m${i}`);
                await textBox(page, 'Button Label').fill('Go');
                const resp = page.waitForResponse((r) => /\/api\/v1\/highlights$/.test(r.url()) && r.request().method() === 'POST', {timeout: T});
                await dialog(page).getByRole('button', {name: 'Save', exact: true}).click();
                await resp;
                await page.locator('.pkpFormPage__footer').waitFor({state: 'detached', timeout: T}).catch(() => {});
            }
            await page.reload(); await idle(page);
            await openJournalTab(page, app, MP);
            const panel = await panelState(page);
            await snap(page, 'many-01-list', {n: N, ctx: MP, rows: panel.rows.length, last: panel.rows.slice(-2)});
            log(app.name, 'fill', JSON.stringify({n: N, rows: panel.rows.length}));
            await signOut(page);
        } finally { await close(); }
    }

    // ---- manyplus: one more highlight on a list already past 100 (MANY_CTX=<path of a `many` context>) ----
    if (on('manyplus')) {
        const MP = process.env.MANY_CTX;
        const {page, close} = await launch(app);
        try {
            await signIn(page, `${MP}mgr`, {contextPath: MP}); await idle(page);
            await openJournalTab(page, app, MP);
            const before = await panelState(page);
            const title = `Plus ${Date.now() % 100000}`;
            const lists = [];
            page.on('response', async (r) => { if (/\/api\/v1\/highlights\?/.test(r.url()) && r.request().method() === 'GET') lists.push({url: r.url().replace(/^.*\/api\/v1\//, ''), body: await r.json().then((b) => ({itemsMax: b.itemsMax, items: b.items.length})).catch(() => null)}); });
            const a = await addHighlight(page, {title, url: 'https://example.org/plus', label: 'Go'});
            await sleep(800);
            const after = await panelState(page);
            await snap(page, 'manyplus-01-after-add', {title, answer: a && a.status, before: {rows: before.rows.length, last: before.rows.slice(-2)}, after: {rows: after.rows.length, last: after.rows.slice(-2), has: after.rows.includes(title)}, lists});
            await page.reload(); await idle(page);
            await openJournalTab(page, app, MP);
            const reloaded = await panelState(page);
            await snap(page, 'manyplus-02-after-reload', {rows: reloaded.rows.length, last: reloaded.rows.slice(-2), has: reloaded.rows.includes(title)});
            await signOut(page);
            const home = await signedOutRead(app, ctxUrl(app, MP), 'manyplus-03-home');
            log(app.name, 'manyplus', JSON.stringify({before: before.rows.length, after: after.rows.length, afterHas: after.rows.includes(title), lists, reloaded: reloaded.rows.length, reloadedHas: reloaded.rows.includes(title), slides: home.slides && home.slides.length}));
        } finally { await close(); }
    }

    // ---- site: a second language at site scope ----------------------------------------
    if (on('site')) {
        const {page, close} = await launch(app);
        const t = st.tag;
        try {
            await signIn(page, 'admin'); await idle(page);
            await openSiteTab(page, app);
            const before = await panelState(page);
            await openAdd(page);
            const form = await formState(page);
            await snap(page, 'site-01-add-panel', {panelBefore: before, form});
            await closePanel(page);
            const a = await addHighlight(page, {title: `Site call ${t}`, frTitle: `Appel du site ${t}`, url: 'https://example.org/site-call', label: 'Read on', frLabel: 'Lire'});
            await snap(page, 'site-02-saved', {answer: a && {status: a.status, title: a.body && a.body.title, urlText: a.body && a.body.urlText}, panel: await panelState(page)});
            await openSiteTab(page, app, 'fr_CA');
            await snap(page, 'site-03-list-fr', {panel: await panelState(page)});
            const en = await signedOutRead(app, app.url('/index.php/index/en'), 'site-04-home-en');
            const fr = await signedOutRead(app, app.url('/index.php/index/fr_CA'), 'site-05-home-fr');
            // cleanup: this phase's row, and the rows the kept K2 check left before its fix
            await openSiteTab(page, app);
            const removed = [];
            for (const title of [`Site call ${t}`, ...((await panelState(page)).rows || []).filter((r) => /^Site refused \d+$/.test(r || ''))]) {
                const row = page.locator('.highlightsListPanel .listPanel__item').filter({hasText: title}).first();
                if (!(await row.count())) continue;
                await row.getByRole('button', {name: 'Delete', exact: true}).click();
                const del = page.waitForResponse((r) => /highlights\/\d+/.test(r.url()) && r.request().method() === 'POST', {timeout: T}).catch(() => null);
                await page.locator('[role="dialog"]:visible').last().getByRole('button', {name: 'Yes', exact: true}).click();
                const d = await del; await idle(page);
                removed.push({title, status: d && d.status()});
            }
            await snap(page, 'site-06-after-cleanup', {removed, panel: await panelState(page)});
            const after = await signedOutRead(app, app.url('/index.php/index/en'), 'site-07-home-after-cleanup');
            const pick = (h) => ({present: h.present, slides: (h.slides || []).map((s) => [s.title, s.button.text])});
            log(app.name, 'site', JSON.stringify({save: a && a.status, en: pick(en), fr: pick(fr), removed, after: pick(after)}));
            await signOut(page);
        } finally { await close(); }
    }
});
