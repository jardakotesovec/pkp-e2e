// Helpers for walk.js (issue report U45 OJS4). Runs nothing when required.
const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '../../../../..');
const flat = (s, n = 400) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));

/**
 * The report's precondition, as an administrator sets it in config.inc.php:
 * `[queues] job_runner = Off`, so a queued deposit waits for the queue to be
 * run instead of running at the end of the next web request. The fleet's
 * reset writes the config afresh (`On`, as the dataset ships it), so every
 * walk sets it. Returns the value before and after.
 */
function holdQueue(app) {
    const file = path.isAbsolute(app.configFile) ? app.configFile : path.join(REPO, app.configFile);
    const text = fs.readFileSync(file, 'utf8');
    const m = /^job_runner\s*=\s*(\S+)/m.exec(text);
    if (!m) throw new Error(`no job_runner line in ${app.configFile}`);
    if (m[1] !== 'Off') fs.writeFileSync(file, text.replace(/^job_runner\s*=.*$/m, 'job_runner = Off'));
    return {before: m[1], after: 'Off'};
}

/** The queue as stored: each queued job's class and each failed job's class and first exception line (read only). */
function queueFacts(sql, app) {
    const rows = (q) => sql(app, q).split('\n').filter(Boolean);
    return {
        queued: rows(`select replace(substring(payload from 'displayName":"([^"]+)'), E'\\\\\\\\', E'\\\\') from jobs order by id`),
        failed: rows(`select replace(substring(payload from 'displayName":"([^"]+)'), E'\\\\\\\\', E'\\\\') || ' | ' || left(split_part(exception, E'\\n', 1), 300) from failed_jobs order by id`),
    };
}

/** Every DOI as stored: `doi | status` (1 unregistered, 2 submitted, 3 registered, 4 error, 5 needs sync). */
function storedDois(sql, app) {
    return sql(app, 'select doi, status from dois order by doi_id').split('\n').filter(Boolean);
}

/**
 * A row of the DOIs page as it reads now: its name, its badge and, expanded,
 * the agency panel's sentence and buttons. Leaves the row collapsed.
 *
 * @param {any} dois a DoisPage
 * @param {import('@playwright/test').Locator} row
 * @param {number} id
 */
async function rowState(dois, row, id, {expand = true} = {}) {
    const out = {name: flat(await dois.rowLink(row).innerText()), badge: flat(await dois.rowBadge(row).innerText())};
    if (!expand) return out;
    await dois.expand(row, id);
    out.table = flat(await dois.expanded(row).locator('table').innerText());
    out.panel = flat(await dois.agencySentence(row).innerText().catch(() => null));
    out.panelButtons = (await dois.agencyButtons(row).allInnerTexts()).map((t) => flat(t));
    await dois.collapse(row, id);
    return out;
}

/**
 * Confirm an open "Deposit DOIs" window, whatever the answer: a refusal
 * closes the window too and fetches no list. Returns {question, status,
 * body, notices} (the notices shown since the press).
 *
 * @param {import('@playwright/test').Page} page
 * @param {any} dois a DoisPage
 * @param {import('@playwright/test').Locator} dialog
 */
async function confirmDeposit(page, dois, dialog) {
    const question = flat(await dialog.innerText(), 300);
    const acted = page.waitForResponse((r) => /\/api\/v1\/dois\/[a-z]+\/deposit/.test(r.url()) && r.request().method() !== 'GET', {timeout: 30_000});
    await dialog.getByRole('button', {name: 'Deposit DOIs', exact: true}).click();
    const response = await acted;
    const body = flat(await response.text().catch(() => ''), 300);
    await dialog.waitFor({state: 'hidden', timeout: 30_000}).catch(() => {});
    await page.waitForTimeout(1500);
    await dois.expectListSettled().catch(() => {});
    const notices = await page.evaluate(() => /** @type {any} */ (window).__doiNotices || []);
    return {question, url: response.url().replace(/^https?:\/\/[^/]+/, ''), method: response.request().method(),
        override: response.request().headers()['x-http-method-override'] || null, status: response.status(), body, notices};
}

/**
 * Tick rows, choose "Bulk Actions" › "Deposit DOIs" and confirm it.
 *
 * @param {import('@playwright/test').Page} page
 * @param {any} dois a DoisPage
 * @param {number[]} ids
 * @param {'submission' | 'issue'} type
 */
async function depositTicked(page, dois, ids, type) {
    await page.evaluate(() => { /** @type {any} */ (window).__doiNotices = []; });
    await dois.tick(ids, type);
    const dialog = await dois.chooseBulkAction('Deposit DOIs');
    return confirmDeposit(page, dois, dialog);
}

/**
 * Expand a row and press its agency box's "Deposit DOI(s)", then confirm
 * the "Deposit DOIs" window it opens. Returns {offered: false} when the
 * box has no such button.
 *
 * @param {import('@playwright/test').Page} page
 * @param {any} dois a DoisPage
 * @param {import('@playwright/test').Locator} row
 * @param {number} id
 */
async function depositFromPanel(page, dois, row, id) {
    await page.evaluate(() => { /** @type {any} */ (window).__doiNotices = []; });
    await dois.expand(row, id);
    const button = dois.agencyButtons(row).filter({hasText: 'Deposit DOI(s)'});
    if ((await button.count()) === 0) return {offered: false};
    await button.first().click();
    const dialog = dois.dialog('Deposit DOIs');
    await dialog.waitFor({timeout: 30_000});
    return {offered: true, ...(await confirmDeposit(page, dois, dialog))};
}

/**
 * The report's other precondition, the dataset's own setting: `[queues]
 * job_runner = On` (queued jobs run at the end of web requests). Returns
 * the value before and after.
 */
function releaseQueue(app) {
    const file = path.isAbsolute(app.configFile) ? app.configFile : path.join(REPO, app.configFile);
    const text = fs.readFileSync(file, 'utf8');
    const m = /^job_runner\s*=\s*(\S+)/m.exec(text);
    if (!m) throw new Error(`no job_runner line in ${app.configFile}`);
    if (m[1] !== 'On') fs.writeFileSync(file, text.replace(/^job_runner\s*=.*$/m, 'job_runner = On'));
    return {before: m[1], after: 'On'};
}

/** Each queued deposit job as stored: `class | attempts | reserved` (read only). */
function depositJobs(sql, app) {
    return sql(app, `select replace(substring(payload from 'displayName":"([^"]+)'), E'\\\\\\\\', E'\\\\') || ' | attempts ' || attempts || ' | reserved ' || (reserved_at is not null) from jobs where payload like '%Deposit%' order by id`).split('\n').filter(Boolean);
}

module.exports = {flat, holdQueue, releaseQueue, queueFacts, depositJobs, storedDois, rowState, depositTicked, depositFromPanel};
