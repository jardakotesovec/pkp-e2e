// Helpers of walk.js (U10 A22: a logo, thumbnail, homepage image, favicon or site logo replaced by a picture of
// another file type stays public at its old address). Requiring this file runs nothing. The Appearance tab and upload
// box helpers are copied from removed-thumbnail-stays-public/lib.js (U10 A20), createContext from
// all-dates-error-nothing-published/lib.js (U64 A1), so this folder stands alone.
const fs = require('fs');
const path = require('path');
const {idle} = require('../../../probe');

const T = 30_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tidy = (t) => (t == null ? null : String(t).replace(/\s+/g, ' ').trim());
const FIXTURES = path.join(__dirname, '..', '..', '..', '..', '..', 'apps', 'ojs', 'playwright', 'fixtures', 'files');

/** The thumbnail setting's name in each app. */
const THUMB = {ojs: 'journalThumbnail', omp: 'pressThumbnail', ops: 'serverThumbnail'};

/** Per-app screen words of Administration's context list. */
const WORDS = {
    ojs: {noun: 'Journal', hosted: 'Hosted Journals', table: 'Journals', create: 'Create Journal'},
    omp: {noun: 'Press', hosted: 'Hosted Presses', table: 'Presses', create: 'Create Press'},
    ops: {noun: 'Server', hosted: 'Hosted Servers', table: 'Servers', create: 'Create Server'},
};

/** A 1×1 GIF (the favicon box takes icons, PNGs and GIFs only). */
const GIF = 'R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==';

/**
 * The walk's pictures under <dir>/files: q23e-picture.png (400×400), q23e-picture-2.png (another PNG, for the
 * same-type replacement), q23e-picture.gif; q23e-picture.jpg is drawn later by makeJpeg().
 */
function makeFiles(dir) {
    const d = path.join(dir, 'files');
    fs.mkdirSync(d, {recursive: true});
    const out = {png: path.join(d, 'q23e-picture.png'), png2: path.join(d, 'q23e-picture-2.png'), gif: path.join(d, 'q23e-picture.gif')};
    fs.copyFileSync(path.join(FIXTURES, 'profile-image-400.png'), out.png);
    fs.copyFileSync(path.join(FIXTURES, 'figure.png'), out.png2);
    fs.writeFileSync(out.gif, Buffer.from(GIF, 'base64'));
    return out;
}

/** A real JPEG `<name>` under <dir>/files, drawn by the browser's own encoder in `page`. */
async function makeJpeg(page, dir, name) {
    const f = path.join(dir, 'files', name);
    if (!fs.existsSync(f)) {
        const b64 = await page.evaluate(() => {
            const c = document.createElement('canvas');
            c.width = 64; c.height = 64;
            const g = c.getContext('2d');
            g.fillStyle = '#1e6292'; g.fillRect(0, 0, 64, 64);
            return c.toDataURL('image/jpeg', 0.9).split(',')[1];
        });
        fs.writeFileSync(f, Buffer.from(b64, 'base64'));
    }
    return f;
}

const lang = (app) => (/3_[34]/.test(app.line || '') ? '' : '/en');

/** Settings › Website, the "Appearance" tab, then its `sub` tab ("setup" or "advanced"). */
async function openAppearance(page, app, sub) {
    await page.goto(app.url(`/index.php/${app.contextPath}${lang(app)}/management/settings/website`));
    await idle(page);
    await page.locator('[id="appearance-button"]').first().click();
    const side = page.locator(`[id="${sub === 'setup' ? 'appearance-setup' : sub}-button"]`).first();
    await side.waitFor({timeout: T});
    await side.click();
    await idle(page);
}

/** Administration › Site Settings, the "Appearance" tab, then its "Setup" tab. */
async function openSiteAppearance(page, app) {
    await page.goto(app.url(`/index.php/index${lang(app)}/admin/settings`));
    await idle(page);
    await page.locator('[id="appearance-button"]').first().click();
    const side = page.locator('[id="setup-button"]').last();
    await side.waitFor({timeout: T});
    await side.click();
    await idle(page);
}

/** One upload box of a form: its ids, from the form id, the field name and the locale (null when not multilingual). */
function box(page, formId, field, locale) {
    const id = (part) => `${formId}-${field}-${part}${locale ? '-' + locale : ''}`;
    const control = page.locator(`[id="${id('control')}"]`);
    const fieldEl = control.locator('xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " pkpFormField ")][1]');
    const form = control.locator('xpath=ancestor::form[1]');
    return {
        id,
        control,
        field: fieldEl,
        form,
        button: page.locator(`[id="${id('clickable')}"]`),
        save: form.getByRole('button', {name: 'Save', exact: true}).first(),
    };
}

/** The address of the picture the box shows (null when it shows none). */
async function pictureSrc(b) {
    await sleep(300);
    const img = b.field.locator('img').first();
    return (await img.count()) ? img.getAttribute('src') : null;
}

/** Press the box's "Upload File" and, when a file chooser opens, choose `file`. */
async function pressUploadFile(page, b, file) {
    const disabled = await b.button.isDisabled().catch(() => null);
    const chooser = page.waitForEvent('filechooser', {timeout: 4000}).catch(() => null);
    await b.button.click({force: !!disabled, timeout: 5000}).catch(() => null);
    const c = await chooser;
    if (c && file) await c.setFiles(file);
    await sleep(1500);
    await idle(page);
    return {chooserOpened: !!c, chose: c && file ? path.basename(file) : null};
}

/** Press the box's "Remove". */
async function pressRemove(b) {
    const btn = b.field.getByRole('button', {name: 'Remove', exact: true}).first();
    if (!(await btn.count())) return {pressed: false};
    await btn.click();
    await sleep(500);
    return {pressed: true};
}

/** "Remove" (when shown), then "Upload File" with `file`. */
async function replace(page, b, file) {
    const r = await pressRemove(b);
    const u = await pressUploadFile(page, b, file);
    return {remove: r.pressed, ...u};
}

/** Press the form's "Save" and wait for the save (`/contexts/<id>` or `/site`); its status and the form's foot text. */
async function save(page, b) {
    const saved = page.waitForResponse((r) => /\/(contexts\/\d+|site)(\?|$)/.test(r.url()) && r.request().method() !== 'GET', {timeout: T}).catch(() => null);
    await b.save.click();
    const r = await saved;
    await sleep(1000);
    const foot = await b.form.locator('.pkpFormPage__status, .pkpFormPage__footer').allInnerTexts().catch(() => []);
    return {saveStatus: r ? r.status() : null, foot: tidy(foot.join(' | '))};
}

/** Press the form's language button reading `label` ("French"), which shows that language's boxes. */
async function showLanguage(b, label) {
    const btn = b.form.locator('.pkpFormLocales__locale').filter({hasText: label}).first();
    if (!(await btn.count())) return {pressed: false};
    await btn.click();
    await sleep(500);
    return {pressed: true};
}

/** Open `url` in the page as a visitor would; its status, content type and size. */
async function openAddress(page, url) {
    if (!url) return null;
    const res = await page.goto(url).catch((e) => ({error: String(e.message).split('\n')[0]}));
    if (!res || res.error) return {url, error: res && res.error};
    const type = res.headers()['content-type'] || null;
    const body = /text|css|html/.test(type || '') ? tidy((await res.text()).slice(0, 120)) : `(${(await res.body()).length} bytes)`;
    return {url: url.replace(/^https?:\/\/[^/]+/, ''), status: res.status(), type, body};
}

/** The file names in a public folder (absolute path), sorted; null when it is missing. */
function listDir(dir) {
    try { return fs.readdirSync(dir).filter((n) => n !== 'index.html').sort(); } catch (e) { return null; }
}

/**
 * Administration › Hosted Journals (Presses, Servers) › "Create Journal" (…), filled and saved:
 * name, initials, contact, country Canada, path, English, enabled. Returns the save's status.
 */
async function createContext(page, app, {name, initials, path: urlPath, email}) {
    const {HostedJournalsPage} = require('../../../pages/HostedJournalsPages.js');
    const hosted = new HostedJournalsPage(page, WORDS[app.name]);
    await page.goto(app.url(`/index.php/index${lang(app)}/admin/contexts`));
    await hosted.expectOpen();
    const win = await hosted.openCreate();
    await win.type(win.title('en'), name);
    await win.type(win.initials('en'), initials);
    await win.type(win.contactName, name);
    await win.type(win.contactEmail, email);
    await win.country.selectOption({label: 'Canada'});
    await win.type(win.path, urlPath);
    if (await win.languageBox('en').count()) {
        await win.setBox(win.languageBox('en'), true);
        await win.setBox(win.primaryChoice('en'), true);
    }
    await win.setBox(win.enableBox, true);
    const r = await win.pressSave();
    await page.waitForURL(/\/admin\/wizard\/\d+/, {timeout: T}).catch(() => {});
    return r.status();
}

module.exports = {T, sleep, THUMB, makeFiles, makeJpeg, openAppearance, openSiteAppearance, box, pictureSrc, pressUploadFile, pressRemove, replace, save, showLanguage, openAddress, listDir, createContext};
