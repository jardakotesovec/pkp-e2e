// Helpers for walk.js (U19 OMP9 issue report). Requiring this file runs nothing. Every helper drives a
// screen a person uses, or reads an OAI address as a harvester does (no session).
const {idle, screen, record, shot} = require('../../../probe');
const {readOai} = require('../../../pages/OaiPages.js');

const T = 30_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (s, n = 600) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));

/** A book's workflow › "Unpublish", confirmed. Returns the request's status and the question asked. */
async function unpublish(page, app, ctx, sid) {
    await page.goto(app.url(`/index.php/${ctx}/en/dashboard/editorial?workflowSubmissionId=${sid}`));
    await idle(page).catch(() => {});
    const button = page.getByRole('dialog').getByRole('button', {name: 'Unpublish', exact: true}).first();
    await button.waitFor({timeout: T});
    await sleep(1000);
    await button.click();
    const win = page.getByRole('dialog').filter({hasText: /Are you sure/}).last();
    await win.waitFor({timeout: T});
    const question = flat(await win.innerText(), 300);
    const w = page.waitForResponse((x) => /\/unpublish/.test(x.url()) && x.request().method() !== 'GET', {timeout: T}).catch(() => null);
    await win.getByRole('button', {name: 'Unpublish', exact: true}).click();
    const r = await w;
    await idle(page).catch(() => {});
    await sleep(1000);
    return {status: r ? r.status() : null, question};
}

/** One OAI address read as a harvester, as data: the error or the headers. */
async function oai(app, ctx, params) {
    const a = await readOai(app.baseURL, ctx, params);
    return {
        address: `/index.php/${ctx}/oai?${params}`,
        status: a.status,
        error: a.error ? `${a.error.code}: ${a.error.message}` : null,
        headers: a.headers.map((h) => `${h.deleted ? 'DELETED ' : ''}${h.identifier.replace(/^oai:[^:]+:/, '')} ${h.datestamp} [${h.setSpecs.join(', ')}]`),
    };
}

/**
 * Read an OAI address as a harvester; with a page, also open it in the browser (signed out) and record the
 * screen under `label`. Returns the harvester read.
 */
async function ask(page, app, label, ctx, params) {
    const r = {label, ...(await oai(app, ctx, params))};
    if (page) {
        const resp = await page.goto(app.url(r.address)).catch(() => null);
        await idle(page).catch(() => {});
        record(label.replace(/[^a-z0-9]+/gi, '-'), await screen(page));
        await shot(page, label.replace(/[^a-z0-9]+/gi, '-')).catch(() => {});
        r.browserStatus = resp ? resp.status() : null;
    }
    return r;
}

const line = (app, r) => `[read] ${app.name} ${r.label}: ${r.status} ${r.error || (r.headers.length ? r.headers.join(' | ') : '(none)')}`;

module.exports = {T, sleep, flat, unpublish, oai, ask, line};
