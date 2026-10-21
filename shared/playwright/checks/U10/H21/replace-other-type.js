// U10 H21 (claim checker cc21c, housekeeping 2026-10-21): what a picture replaced on Settings › Website ›
// "Appearance" › "Setup" leaves behind. Incidentals row: a "Logo" or thumbnail ("Journal thumbnail", "Press
// thumbnail", "Server thumbnail") replaced by a picture of another type (a JPEG over a PNG) and saved leaves the old
// file in the context's public files, still answering 200 at its old address; a same-type replacement overwrites it.
// Beside A20 (docs/issues/U10-A20-removed-thumbnail-stays-public.md). "Homepage Image" is driven the same way.
// Runs on a DATASET fleet (PKP's default test dataset), as the dataset's manager `rvaca`, on its one context:
//   P0  Setup: the three boxes and the context's public files before anything
//   P1  "Upload File" a PNG (A) under "Logo", the thumbnail and "Homepage Image", "Save"; read on the page, reload,
//       the addresses read; each address opened signed out
//   P2  the control: "Remove" and "Upload File" another PNG (B) under each, "Save"; reload; the old addresses opened
//       signed out (the same name, B's bytes) and the public files listed
//   P3  "Remove" and "Upload File" a JPEG under each, "Save"; reload; the public files listed; signed out, the old PNG
//       addresses and the new JPEG ones opened, and the home page's header logo read
//   P4  the sweep: "Remove" and "Upload File" a PNG under "Logo" left unsaved; the "Theme" tab and back; away to the
//       dashboard (dialogs recorded); Setup reloaded; the public files listed (an unsaved upload adds none)
// Each step records what it saw and never throws on a state a fix changes.
//
// Reset first:  npm run fleet-prep -- --feature issues-cc21c --dataset 7 --reset
// Run (main):   bin/app-lock.sh shared ojs -- env PROBE_FEATURE=issues-cc21c PKP_E2E_DATASET=7 PROBE_AGENT=cc21c PROBE_RUN=r1 node bin/probe.js ojs shared/playwright/checks/U10/H21/replace-other-type.js
// Run (3.5):    PKP_E2E_LINE=stable-3_5_0 PROBE_FEATURE=issues-cc21c-3_5 PKP_E2E_DATASET=7 PROBE_AGENT=cc21c PROBE_RUN=s1 node bin/probe.js all shared/playwright/checks/U10/H21/replace-other-type.js
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const {request} = require('@playwright/test');
const {forEachApp, launch, signIn, signOut, screen, record, shot, idle, outFile, serverLog} = require('../../../probe');

const T = 30_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tidy = (t) => (t == null ? null : String(t).replace(/\s+/g, ' ').trim());
const REPO = path.join(__dirname, '..', '..', '..', '..', '..');
const FIXTURES = path.join(REPO, 'apps', 'ojs', 'playwright', 'fixtures', 'files');
const THUMB = {ojs: 'journalThumbnail', omp: 'pressThumbnail', ops: 'serverThumbnail'};
const short = (src) => (src && src.startsWith('data:') ? `${src.slice(0, src.indexOf(',') + 1)}…(${src.length} chars)` : src);
const sha = (buf) => crypto.createHash('sha1').update(buf).digest('hex').slice(0, 12);

/** PNG A, PNG B (other bytes) and a JPEG drawn by the browser's encoder, under <dir>/files. */
async function makeFiles(page, dir) {
    const d = path.join(dir, 'files');
    fs.mkdirSync(d, {recursive: true});
    const out = {pngA: path.join(d, 'cc21c-a.png'), pngB: path.join(d, 'cc21c-b.png'), jpg: path.join(d, 'cc21c-c.jpg'), pngD: path.join(d, 'cc21c-d.png')};
    fs.copyFileSync(path.join(FIXTURES, 'profile-image-400.png'), out.pngA);
    fs.copyFileSync(path.join(FIXTURES, 'figure.png'), out.pngB);
    fs.copyFileSync(path.join(FIXTURES, 'figure.png'), out.pngD);
    const b64 = await page.evaluate(() => {
        const c = document.createElement('canvas');
        c.width = 64; c.height = 64;
        const g = c.getContext('2d');
        g.fillStyle = '#1e6292'; g.fillRect(0, 0, 64, 64);
        return c.toDataURL('image/jpeg', 0.9).split(',')[1];
    });
    fs.writeFileSync(out.jpg, Buffer.from(b64, 'base64'));
    out.hash = {};
    for (const k of ['pngA', 'pngB', 'jpg']) out.hash[sha(fs.readFileSync(out[k]))] = path.basename(out[k]);
    return out;
}

async function openAppearance(page, app, sub) {
    const lang = /3_[34]/.test(app.line || '') ? '' : '/en';
    await page.goto(app.url(`/index.php/${app.contextPath}${lang}/management/settings/website`));
    await idle(page);
    await page.locator('[id="appearance-button"]').first().click();
    const side = page.locator(`[id="${sub === 'setup' ? 'appearance-setup' : sub}-button"]`).first();
    await side.waitFor({timeout: T});
    await side.click();
    await idle(page);
}

function box(page, field) {
    const id = (part) => `appearanceSetup-${field}-${part}-en`;
    const control = page.locator(`[id="${id('control')}"]`);
    const fieldEl = control.locator('xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " pkpFormField ")][1]');
    const form = control.locator('xpath=ancestor::form[1]');
    return {field, control, fieldEl, form, button: page.locator(`[id="${id('clickable')}"]`), save: form.getByRole('button', {name: 'Save', exact: true}).first()};
}

async function boxState(b) {
    await sleep(300);
    const img = b.fieldEl.locator('img').first();
    const removeBtn = b.fieldEl.getByRole('button', {name: 'Remove', exact: true});
    const restore = b.fieldEl.getByRole('button', {name: 'Restore Original', exact: true});
    return {
        text: tidy(await b.fieldEl.innerText().catch(() => null)),
        src: (await img.count()) ? short(await img.getAttribute('src')) : null,
        remove: (await removeBtn.count()) ? await removeBtn.first().isVisible() : false,
        restoreOriginal: (await restore.count()) ? await restore.first().isVisible() : false,
    };
}

async function pressRemove(b) {
    const btn = b.fieldEl.getByRole('button', {name: 'Remove', exact: true}).first();
    if (!(await btn.count())) return {pressed: false};
    await btn.click();
    await sleep(500);
    return {pressed: true};
}

async function pressUpload(page, b, file) {
    const disabled = await b.button.isDisabled().catch(() => null);
    const chooser = page.waitForEvent('filechooser', {timeout: 5000}).catch(() => null);
    await b.button.click({force: !!disabled, timeout: 5000}).catch(() => null);
    const c = await chooser;
    if (c) await c.setFiles(file);
    await sleep(1500);
    await idle(page);
    return {chooserOpened: !!c, chose: c ? path.basename(file) : null};
}

async function save(page, b) {
    const saved = page.waitForResponse((r) => /\/contexts\/\d+/.test(r.url()) && r.request().method() !== 'GET', {timeout: T}).catch(() => null);
    await b.save.click();
    const r = await saved;
    await sleep(1000);
    const foot = await b.form.locator('.pkpFormPage__status, .pkpFormPage__footer').allInnerTexts().catch(() => []);
    return {saveStatus: r ? r.status() : null, foot: tidy(foot.join(' | '))};
}

/** The context's public folder on disk, from a picture address (`/<public dir>/<kind>/<id>/<file>`). */
function publicDirOf(app, src) {
    if (!src) return null;
    const p = new URL(src, app.url('/')).pathname.split('/').filter(Boolean);
    return path.resolve(REPO, app.root, ...p.slice(0, -1));
}
function listDir(dir, hashes) {
    if (!dir || !fs.existsSync(dir)) return {dir, missing: true};
    return fs.readdirSync(dir).filter((f) => /Thumbnail|pageHeaderLogoImage|homepageImage/.test(f)).sort().map((f) => {
        const buf = fs.readFileSync(path.join(dir, f));
        const h = sha(buf);
        return {file: f, bytes: buf.length, sha1: h, is: hashes[h] || '?', mtime: fs.statSync(path.join(dir, f)).mtime.toISOString()};
    });
}

forEachApp(async (app) => {
    if (!app.dataset) throw new Error('replace-other-type.js runs on a dataset fleet (fleet-prep --dataset n --reset)');
    const name = (s) => `h21-${s}`;
    const facts = {app: app.name, line: app.line || 'main', steps: {}};
    const fact = (k, v) => {
        facts.steps[k] = v;
        console.log(`[fact] ${app.name} ${k}: ${JSON.stringify(v).slice(0, 1800)}`);
    };
    const {page, close} = await launch(app);
    const visitor = await request.newContext();
    page.on('dialog', (d) => {
        fact(`dialog ${Object.keys(facts.steps).length}`, {type: d.type(), message: d.message()});
        d.accept().catch(() => null);
    });
    const step = async (label, action) => {
        try {
            const out = await action();
            fact(label, out || {});
            return out;
        } catch (e) {
            fact(`${label} threw`, String(e.message).split('\n')[0]);
            return null;
        } finally {
            await idle(page).catch(() => null);
        }
    };
    const files = await makeFiles(page, path.dirname(outFile('files.txt')));
    const boxes = {logo: box(page, 'pageHeaderLogoImage'), thumbnail: box(page, THUMB[app.name]), homepage: box(page, 'homepageImage')};
    const setup = async () => { await openAppearance(page, app, 'setup'); await boxes.thumbnail.fieldEl.waitFor({timeout: T}); };
    const states = async () => { const o = {}; for (const [k, b] of Object.entries(boxes)) o[k] = await boxState(b); return o; };
    const srcs = (st) => Object.fromEntries(Object.entries(st || {}).map(([k, v]) => [k, v && v.src]));
    const open = async (src) => {
        if (!src) return null;
        const r = await visitor.get(new URL(src, app.url('/')).href).catch((e) => ({err: String(e.message).split('\n')[0]}));
        if (r.err) return {src, error: r.err};
        const body = await r.body();
        const h = sha(body);
        return {path: new URL(src, app.url('/')).pathname, status: r.status(), type: r.headers()['content-type'] || null, bytes: body.length, sha1: h, is: files.hash[h] || (r.status() >= 400 ? 'error page' : '?')};
    };
    const openAll = async (s) => { const o = {}; for (const [k, v] of Object.entries(s || {})) o[k] = await open(v); return o; };
    const replaceAll = async (file) => {
        const o = {};
        for (const [k, b] of Object.entries(boxes)) o[k] = {remove: await pressRemove(b), upload: await pressUpload(page, b, file)};
        o.onPage = await states();
        Object.assign(o, await save(page, boxes.logo));
        o.afterSave = srcs(await states());
        return o;
    };
    const log = serverLog(app);
    let dir = null;
    try {
        await step('P0 sign in as rvaca, Setup: the boxes', async () => {
            await signIn(page, 'rvaca');
            await setup();
            return await states();
        });
        record(name('p0-setup'), await screen(page));

        await step('P1 Upload File PNG A under Logo, thumbnail, Homepage Image; Save', async () => {
            const from = log.mark();
            const o = {};
            for (const [k, b] of Object.entries(boxes)) o[k] = await pressUpload(page, b, files.pngA);
            Object.assign(o, await save(page, boxes.logo));
            o.afterSave = srcs(await states());
            o.serverLog = log.since(from);
            return o;
        });
        const p1 = await step('P1 reload, Setup: the boxes', async () => { await setup(); return await states(); });
        record(name('p1-setup'), await screen(page));
        dir = publicDirOf(app, p1 && p1.logo && p1.logo.src);
        await step('P1 public files', async () => ({dir: dir && path.relative(REPO, dir), files: listDir(dir, files.hash)}));
        await step('P1 signed out: the PNG A addresses', async () => openAll(srcs(p1)));

        await step('P2 control: Remove and Upload File PNG B under each; Save', async () => {
            await setup();
            const from = log.mark();
            const o = await replaceAll(files.pngB);
            o.serverLog = log.since(from);
            return o;
        });
        const p2 = await step('P2 reload, Setup: the boxes', async () => { await setup(); return await states(); });
        record(name('p2-setup'), await screen(page));
        await step('P2 public files', async () => ({files: listDir(dir, files.hash)}));
        await step('P2 signed out: the P1 addresses (same names)', async () => openAll(srcs(p1)));

        await step('P3 Remove and Upload File the JPEG under each; Save', async () => {
            await setup();
            const from = log.mark();
            const o = await replaceAll(files.jpg);
            o.serverLog = log.since(from);
            return o;
        });
        const p3 = await step('P3 reload, Setup: the boxes', async () => { await setup(); return await states(); });
        record(name('p3-setup'), await screen(page));
        await shot(page, name('p3-setup'));
        await step('P3 public files', async () => ({files: listDir(dir, files.hash)}));
        await step('P3 signed out: the old PNG addresses', async () => openAll(srcs(p2)));
        await step('P3 signed out: the new JPEG addresses', async () => openAll(srcs(p3)));
        await step('P3 signed out: the home page header logo', async () => {
            const r = await visitor.get(app.url(`/index.php/${app.contextPath}`));
            const html = await r.text();
            const m = html.match(/<img[^>]+pageHeaderLogoImage[^>]*>/);
            return {status: r.status(), logoImg: m ? m[0].replace(/\s+/g, ' ') : null};
        });

        await step('P4 sweep: Remove and Upload File PNG D under Logo, unsaved; the Theme tab and back', async () => {
            await setup();
            const r = await pressRemove(boxes.logo);
            const u = await pressUpload(page, boxes.logo, files.pngD);
            const onPage = await boxState(boxes.logo);
            await page.locator('[id="theme-button"]').first().click().catch(() => null);
            await sleep(800);
            await page.locator('[id="appearance-setup-button"]').first().click().catch(() => null);
            await sleep(800);
            return {remove: r, upload: u, onPage, afterTabs: await boxState(boxes.logo)};
        });
        record(name('p4-unsaved'), await screen(page));
        await step('P4 away to the dashboard, then Setup reloaded', async () => {
            await page.goto(app.url(`/index.php/${app.contextPath}/dashboard`)).catch(() => null);
            await idle(page);
            const away = page.url();
            await setup();
            return {away, logo: await boxState(boxes.logo), publicFiles: listDir(dir, files.hash)};
        });
        record(name('p4-reloaded'), await screen(page));
        await signOut(page).catch(() => null);
    } finally {
        record(name('facts'), facts);
        await visitor.dispose().catch(() => null);
        await close();
    }
});
