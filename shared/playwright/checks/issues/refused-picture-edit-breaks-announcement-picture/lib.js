// Helpers for walk.js (issue report
// docs/issues/U12-A21-refused-picture-edit-breaks-announcement-picture.md).
// Requiring this file runs nothing. Every helper drives the screens a person
// uses, apart from the stored-setting read and the folder listing, which show
// what no screen shows. The pictures the steps upload sit beside this file:
// photo.png (a PNG), renamed.jpg (the same PNG named .jpg), photo.gif (a GIF).
// Adapted from the A12 report's lib.js (announcement-image-files-left-behind),
// copied so this folder stays self-contained.
const fs = require('fs');
const path = require('path');
const {idle, sql} = require('../../../probe');

const T = 30_000;
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const flat = (s, n = 300) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));
const rel = (u) => (u ? String(u).replace(/^https?:\/\/[^/]+/, '') : u);

const PICTURES = {
    png: path.join(__dirname, 'photo.png'),
    gif: path.join(__dirname, 'photo.gif'),
    renamed: path.join(__dirname, 'renamed.jpg'),
};

/** Settings › Website › Setup › "Announcements": tick "Enable announcements", "Save". */
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
    await box.check();
    await tab.getByRole('button', {name: 'Save', exact: true}).click();
    const saved = await tab.locator('[role="status"]').filter({hasText: 'Saved'}).first()
        .waitFor({state: 'visible', timeout: T}).then(() => true, () => false);
    return {tickedBefore: before, saved};
}

const panel = (page) => page.locator('main .listPanel').first();
const rowTitles = (page) => panel(page).locator('.listPanel__itemTitle').allInnerTexts().then((a) => a.map((s) => flat(s)));
const row = (page, title) => panel(page).locator('.listPanel__item')
    .filter({has: page.locator('.listPanel__itemTitle', {hasText: new RegExp(`^\\s*${esc(title)}\\s*$`)})});
const imageField = (dialog) => dialog.locator('.pkpFormField--uploadImage').first();

/** Reload, then the side menu's "Announcements" (the address when no entry is found, said in `via`). */
async function openAnnouncementsFromMenu(app, page) {
    await page.goto(app.url(`/index.php/${app.contextPath}/en/dashboard/editorial`));
    await idle(page).catch(() => {});
    const nav = page.getByRole('navigation', {name: 'Site Navigation'});
    const entry = nav.locator('[aria-label="Announcements"], a, [role="button"]')
        .filter({hasText: /^\s*Announcements\s*$/}).first();
    let via = 'side menu';
    if (await entry.isVisible().catch(() => false)) {
        await entry.click();
        await page.waitForURL(/\/management\/settings\/announcements/, {timeout: T, waitUntil: 'commit'});
    } else {
        via = 'address (no side menu entry found)';
        await page.goto(app.url(`/index.php/${app.contextPath}/en/management/settings/announcements`));
    }
    await idle(page).catch(() => {});
    await panel(page).waitFor({state: 'visible', timeout: T});
    return {via, url: rel(page.url()), rows: await rowTitles(page)};
}

/** Reload the Announcements page. */
async function reloadAnnouncements(app, page) {
    await page.goto(app.url(`/index.php/${app.contextPath}/en/management/settings/announcements`));
    await idle(page).catch(() => {});
    await panel(page).waitFor({state: 'visible', timeout: T});
    await idle(page).catch(() => {});
    return rowTitles(page);
}

/** What "Image" in an open panel shows: its text, its pictures (loaded or not), its buttons, the alternate text. */
async function readImageField(dialog) {
    const field = imageField(dialog);
    return {
        text: flat(await field.innerText().catch(() => ''), 300),
        previews: await field.locator('img').evaluateAll((els) => els.map((i) => ({src: (i.getAttribute('src') || '').replace(/^https?:\/\/[^/]+/, '').slice(0, 160), alt: i.getAttribute('alt'), loaded: i.complete && i.naturalWidth > 0}))).catch(() => []),
        buttons: await field.getByRole('button').allInnerTexts().then((a) => a.map((x) => flat(x)).filter(Boolean)).catch(() => []),
        altText: await field.locator('input[type="text"]').first().inputValue({timeout: 2000}).catch(() => null),
    };
}

/** "Upload File" a picture into "Image": the temporary upload's answer and what the box then shows. */
async function uploadImage(page, dialog, file) {
    const field = imageField(dialog);
    await field.waitFor({state: 'visible', timeout: T});
    const up = page.waitForResponse((r) => /temporaryFiles/.test(r.url()) && r.request().method() === 'POST', {timeout: T}).catch(() => null);
    await field.locator('input[type=file]').first().setInputFiles(file);
    const r = await up;
    await idle(page).catch(() => {});
    await pause(800);
    return {file: path.basename(file), upload: r ? r.status() : null, field: flat(await field.innerText().catch(() => ''), 200)};
}

/** Type the "Alternate text" under the chosen picture. */
async function setAlt(dialog, text) {
    const box = imageField(dialog).locator('input[type="text"]').first();
    if (!(await box.isVisible().catch(() => false))) return false;
    await box.fill(text);
    return true;
}

/** Press a button of "Image" ("Remove", "Restore Original") when it shows. */
async function pressImageButton(page, dialog, name) {
    const btns = imageField(dialog).getByRole('button', {name, exact: true});
    const count = await btns.count();
    for (let i = 0; i < count; i++) {
        if (await btns.nth(i).isVisible().catch(() => false)) {
            await btns.nth(i).click();
            await pause(600);
            return true;
        }
    }
    return false;
}

/** "Save" in an announcement panel: the API answer, whether the panel stayed open, the messages it shows. */
async function pressSave(page, dialog) {
    const resp = page.waitForResponse((x) => /\/api\/v1\/announcements(\/\d+)?$/.test(x.url()) && x.request().method() !== 'GET', {timeout: T}).catch(() => null);
    await dialog.getByRole('button', {name: 'Save', exact: true}).click();
    const r = await resp;
    const out = {status: r ? r.status() : null, method: r ? (r.request().headers()['x-http-method-override'] || r.request().method()) : null};
    if (r && r.status() >= 400) out.answer = flat(await r.text().catch(() => null), 400);
    await dialog.waitFor({state: 'hidden', timeout: 6000}).catch(() => {});
    await idle(page).catch(() => {});
    await pause(800);
    out.panelOpen = await dialog.isVisible().catch(() => false);
    if (out.panelOpen) {
        out.fieldErrors = [...new Set((await dialog.locator('.pkpFormFieldError, .pkpFormField__error, [id$="-error"]').allInnerTexts().catch(() => []))
            .map((s) => flat(s)).filter(Boolean))];
        out.formError = flat(await dialog.locator('.pkpFormPage__status, .pkpFormErrors, .pkpForm__errors').first().innerText({timeout: 1000}).catch(() => null));
        out.notice = flat(await page.locator('[role="alert"], .pkpNotify, .app__notifications').allInnerTexts().then((a) => a.join(' | ')).catch(() => null));
    }
    return out;
}

/** Close an open panel with its close control. */
async function closeDialog(page, dialog) {
    if (!(await dialog.isVisible().catch(() => false))) return 'not open';
    await dialog.getByRole('button', {name: 'Close', exact: true}).first().click().catch(() => {});
    await dialog.waitFor({state: 'hidden', timeout: 6000}).catch(() => {});
    await pause(1500);
    return !(await dialog.isVisible().catch(() => false));
}

/** "Add Announcement" with a title and, optionally, a picture and its alternate text; "Save". The new id from "View". */
async function addAnnouncement(page, {title, picture, alt}) {
    await panel(page).getByRole('button', {name: 'Add Announcement', exact: true}).click();
    const dialog = page.getByRole('dialog', {name: 'Add Announcement'});
    await dialog.getByRole('button', {name: 'Save', exact: true}).waitFor({state: 'visible', timeout: T});
    await dialog.locator('input[name="title-en"]').fill(title);
    const upload = picture ? await uploadImage(page, dialog, picture) : null;
    if (picture && alt) await setAlt(dialog, alt);
    const save = await pressSave(page, dialog);
    if (save.panelOpen) save.closed = await closeDialog(page, dialog);
    const href = await row(page, title).getByRole('link', {name: 'View', exact: true}).getAttribute('href', {timeout: 5000}).catch(() => null);
    const m = (href || '').match(/\/announcement\/view\/(\d+)/);
    return {title, upload, save, id: m ? Number(m[1]) : null, rows: await rowTitles(page)};
}

/** "Edit" on the row: the open "Edit Announcement" panel. */
async function openEdit(page, title) {
    await row(page, title).getByRole('button', {name: 'Edit', exact: true}).click();
    const dialog = page.getByRole('dialog', {name: 'Edit Announcement'});
    await dialog.getByRole('button', {name: 'Save', exact: true}).waitFor({state: 'visible', timeout: T});
    await idle(page).catch(() => {});
    await pause(800);
    return dialog;
}

/** A public page as a visitor reads it: status, heading, the announcement pictures and whether each loads (fetched too). */
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
    const heading = await page.locator('main h1, .pkp_structure_main h1, h1').first().innerText({timeout: 5000}).catch(() => null);
    return {address, status: res && res.status(), heading: flat(heading, 120), imgs};
}

/** Open an address in the browser as a visitor would: status and content type. */
async function openAddress(app, page, address) {
    const res = await page.goto(address.startsWith('http') ? address : app.url(address)).catch(() => null);
    return {address: rel(address), status: res && res.status(), type: res && res.headers()['content-type']};
}

/** The announcement's stored title and image setting (no screen shows the setting). */
function stored(app, id) {
    if (!id) return null;
    const q = (s) => sql(app, s);
    return {
        row: q(`SELECT count(*) FROM announcements WHERE announcement_id = ${Number(id)}`),
        title: q(`SELECT setting_value FROM announcement_settings WHERE announcement_id = ${Number(id)} AND setting_name = 'title'`) || null,
        image: q(`SELECT setting_value FROM announcement_settings WHERE announcement_id = ${Number(id)} AND setting_name = 'image'`) || null,
    };
}

/** All announcements' titles in the database (a refused add must leave none). */
function storedTitles(app) {
    return (sql(app, `SELECT string_agg(setting_value, ' | ' ORDER BY announcement_id) FROM announcement_settings WHERE setting_name = 'title'`) || '').split(' | ').filter(Boolean);
}

const CONTEXT_DIR = {ojs: 'journals', omp: 'presses', ops: 'contexts'};

/** The fleet's public files directory (public_files_dir of its config, relative to the app root or absolute). */
function publicDir(app) {
    const cfgPath = path.isAbsolute(app.configFile) ? app.configFile : path.join(__dirname, '../../../../..', app.configFile);
    const cfg = fs.readFileSync(cfgPath, 'utf8');
    const m = cfg.match(/^\s*public_files_dir\s*=\s*"?([^"\n]+?)"?\s*$/m);
    const pub = m ? m[1] : 'public';
    return path.isAbsolute(pub) ? pub : path.join(app.root, pub);
}

/** The context's announcements folder. */
const announcementsFolder = (app, contextId) => path.join(publicDir(app), CONTEXT_DIR[app.name], String(contextId), 'announcements');

/** The folder's files whose name starts with `{id}.` (all files when id is null). */
function listFolder(folder, id = null) {
    try { return fs.readdirSync(folder).filter((n) => id == null || n.startsWith(`${id}.`)).sort(); } catch (e) { return []; }
}

module.exports = {
    PICTURES, enableAnnouncements, openAnnouncementsFromMenu, reloadAnnouncements, readImageField, uploadImage, setAlt,
    pressImageButton, pressSave, closeDialog, addAnnouncement, openEdit, publicRead, openAddress, stored, storedTitles,
    announcementsFolder, listFolder, rowTitles, flat, rel, pause,
};
