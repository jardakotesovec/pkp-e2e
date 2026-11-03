// Helpers of walk.js (issue report docs/issues/U17-OMP11-series-cover-delete-raw-code.md: a series cover's
// "Delete" when the cover or the series is already gone, or on a broken picture). Requiring this file runs nothing.
// Adapted from shared/playwright/checks/U17/I03C/i03c.js (copied, not required).
const {idle, sql, screen, shot, record, rawKeys} = require('../../../probe');

const T = 30_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tidy = (t) => String(t == null ? '' : t).replace(/\s+/g, ' ').trim();

// A 2×3 red PNG; damagedPng() is the same picture with the last byte of its IDAT checksum flipped (OMP10's
// `damaged.png`, base64 iVBORw0KGgoAAAANSUhEUgAAAAIAAAADCAIAAAA2iEnWAAAAEElEQVR4nGP4z8AARAwoFABE0AX7pM/efwAAAABJRU5ErkJggg==).
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAADCAIAAAA2iEnWAAAAEElEQVR4nGP4z8AARAwoFABE0AX7pM/egAAAAABJRU5ErkJggg==', 'base64');
function damagedPng() {
    const b = Buffer.from(PNG);
    const at = b.indexOf('IDAT');
    const len = b.readUInt32BE(at - 4);
    b[at + 4 + len + 3] ^= 0xff;
    return b;
}

function seriesTab(p, app) {
    const {SectionsTab} = require('../../../pages/SectionsPages.js');
    return new SectionsTab(p, app.contextPath, {tab: 'Series', addLabel: 'Add Series', formId: 'seriesForm'});
}

/** The series window, read as data. */
function windowState(p) {
    return p.evaluate(() => {
        const visible = (el) => !!(el && (el.offsetWidth || el.offsetHeight || el.getClientRects().length));
        const form = document.querySelector('form#seriesForm');
        if (!form || !visible(form)) return {windowOpen: false};
        const preview = form.querySelector('#coverImagePreview');
        const save = form.querySelector('button.submitFormButton');
        return {
            windowOpen: true,
            previewImages: preview
                ? [...preview.querySelectorAll('img')].filter(visible).map((i) => ({alt: i.getAttribute('alt'), src: i.getAttribute('src'), naturalWidth: i.naturalWidth}))
                : [],
            deleteLinks: preview ? [...preview.querySelectorAll('a')].filter(visible).map((a) => a.textContent.trim()) : [],
            uploadFile: [...form.querySelectorAll('#coverImage a, #coverImage button')].filter(visible).map((a) => a.textContent.trim()).filter(Boolean),
            saveDisabled: save ? save.disabled : null,
            spinner: !!form.querySelector('.pkp_spinner.is_visible'),
        };
    });
}

async function openEdit(p, app, title) {
    const tab = seriesTab(p, app);
    await tab.goto();
    const win = await tab.openEdit(title);
    await idle(p);
    await sleep(500);
    return win;
}

async function upload(p, win, path) {
    const answered = p
        .waitForResponse((r) => r.request().method() === 'POST' && /upload-image/.test(r.url()), {timeout: 15_000})
        .then((r) => r.status())
        .catch(() => null);
    await win.form().locator('input[type=file]').first().setInputFiles(path);
    const status = await answered;
    await sleep(800);
    await idle(p).catch(() => null);
    return {upload: status, box: tidy(await win.form().locator('#coverImage').innerText().catch(() => ''))};
}

async function save(p, win, log) {
    const from = log.mark();
    const answered = p.waitForResponse((r) => r.request().method() === 'POST' && /update-series/.test(r.url()), {timeout: T}).catch((e) => e);
    await win.saveButton().click();
    const r = await answered;
    if (r instanceof Error) return {answered: false, ...(await windowState(p))};
    const body = (await r.text().catch(() => '')).slice(0, 300);
    await win.form().waitFor({state: 'hidden', timeout: 8_000}).catch(() => null);
    await idle(p).catch(() => null);
    await sleep(1500);
    return {status: r.status(), body, ...(await windowState(p)), serverLog: log.since(from).map((l) => l.slice(0, 300)).slice(0, 8)};
}

async function cancel(p, win) {
    if (await win.form().isVisible().catch(() => false)) {
        await win.cancelLink().click().catch(() => null);
        await win.form().waitFor({state: 'hidden', timeout: 10_000}).catch(() => null);
        await sleep(600);
    }
    return {windowOpen: await win.form().isVisible().catch(() => false)};
}

/** "Delete" under the window's cover, then "OK": the "Confirm" window, the answer, the browser messages, what stays. */
async function coverDelete(p, dialogs, log, label) {
    const link = p.locator('form#seriesForm #coverImagePreview').getByRole('link', {name: 'Delete', exact: true});
    if (!(await link.isVisible().catch(() => false))) return {deleteLink: false};
    const confirm = p.getByRole('dialog').filter({hasText: 'Are you sure you wish to delete this item?'});
    await link.click();
    await confirm.waitFor({state: 'visible', timeout: T});
    await idle(p).catch(() => null);
    const asked = {heading: tidy(await confirm.getByRole('heading').first().innerText().catch(() => '')), text: tidy(await confirm.innerText().catch(() => ''))};
    const before = dialogs.length;
    const from = log.mark();
    const answered = p.waitForResponse((r) => r.request().method() === 'POST' && /delete-image/.test(r.url()), {timeout: T}).catch((e) => e);
    await confirm.getByRole('button', {name: 'OK', exact: true}).click();
    const r = await answered;
    const reply = r instanceof Error ? {error: String(r.message).split('\n')[0]} : {status: r.status(), url: r.url().replace(/^https?:\/\/[^/]+/, ''), body: (await r.text().catch(() => '')).slice(0, 400)};
    await idle(p).catch(() => null);
    await sleep(2500);
    const out = {
        asked,
        reply,
        browserMessages: dialogs.slice(before),
        confirmStillOpen: await confirm.isVisible().catch(() => false),
        confirmSpinner: await confirm
            .locator('[class*="spinner"]')
            .evaluateAll((els) => els.filter((e) => !!(e.offsetWidth || e.offsetHeight) && getComputedStyle(e).visibility !== 'hidden').map((e) => e.className))
            .catch(() => []),
        window: await windowState(p),
        rawKeys: await rawKeys(p).catch(() => null),
        serverLog: log.since(from).map((l) => l.slice(0, 300)).slice(0, 8),
    };
    record(label, await screen(p));
    await shot(p, label).catch(() => null);
    return out;
}

/** Close a "Confirm" window left open with its "Cancel". */
async function closeConfirm(p) {
    const confirm = p.getByRole('dialog').filter({hasText: 'Are you sure you wish to delete this item?'});
    if (!(await confirm.isVisible().catch(() => false))) return 'not open';
    await confirm.getByRole('button', {name: 'Cancel', exact: true}).click({timeout: 3000}).catch(() => null);
    await sleep(1200);
    return (await confirm.isVisible().catch(() => false)) ? 'still open after Cancel' : 'closed by Cancel';
}

function stored(app, path) {
    return sql(app, `select series_id, image from series where path = '${path}'`) || '(no row)';
}

async function seriesPage(p, app, path) {
    const resp = await p.goto(app.url(`/index.php/${app.contextPath}/catalog/series/${path}`));
    await idle(p).catch(() => null);
    const imgs = await p.locator('.pkp_structure_main img').evaluateAll((els) => els.map((e) => ({src: e.getAttribute('src'), naturalWidth: e.naturalWidth}))).catch(() => []);
    return {status: resp ? resp.status() : null, images: imgs};
}

module.exports = {T, sleep, tidy, PNG, damagedPng, seriesTab, windowState, openEdit, upload, save, cancel, coverDelete, closeConfirm, stored, seriesPage};
