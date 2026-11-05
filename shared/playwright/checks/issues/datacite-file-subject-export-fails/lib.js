// Helpers of walk.js (issue report docs/issues/U45-OJS13-datacite-file-subject-export-fails.md).
// Requiring this file runs nothing. Adapted from the claim check shared/playwright/checks/U45/I05A/i05a.js.
const path = require('path');
const {execFileSync} = require('child_process');
const {expect} = require('@playwright/test');
const {record, shot, idle, serverLog} = require('../../../probe');

const T = 30_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (s, n = 400) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));

/** Every legacy and API call the page makes, with the body of the interesting ones. */
function traffic(page) {
    const seen = [];
    page.on('response', async (r) => {
        const u = r.url();
        if (!/\$\$\$call\$\$\$|\/api\/v1\//.test(u)) return;
        const e = {at: new Date().toISOString(), method: r.request().method(), status: r.status(), url: u.replace(/^https?:\/\/[^/]+/, '')};
        if (/\/dois\/|failed/.test(u) || r.status() >= 400) e.body = flat(await r.text().catch(() => ''), 600);
        seen.push(e);
    });
    return {since: (n) => seen.slice(n), get n() { return seen.length; }};
}

/** Page notices as they appear (they expire before a settled read). */
function noticeRecorder(page) {
    return page.context().addInitScript(() => {
        window.__seenNotices = [];
        const sweep = () => {
            document.querySelectorAll('.app__notifications .pkpNotification, .pkp_notification, [role="alert"]').forEach((e) => {
                const t = (e.innerText || '').replace(/\s+/g, ' ').trim();
                if (t && !window.__seenNotices.includes(t)) window.__seenNotices.push(t);
            });
        };
        new MutationObserver(sweep).observe(document, {childList: true, subtree: true, characterData: true});
    });
}
const notices = (page) => page.evaluate(() => window.__seenNotices || []).catch(() => []);

/**
 * step(id, fn): runs one numbered step, records what fn returns plus the step's page errors, dialogs,
 * non-GET requests, server-log error lines and notices into out.steps[id]; a throw is recorded, not raised.
 */
function stepper(app, page, name, out) {
    let cur = 'start';
    const errors = [];
    const dialogs = [];
    page.on('pageerror', (e) => errors.push({step: cur, kind: 'pageerror', text: flat(e.message)}));
    page.on('console', (m) => { if (m.type() === 'error') errors.push({step: cur, kind: 'console', text: flat(m.text())}); });
    page.on('dialog', async (d) => { dialogs.push({step: cur, type: d.type(), message: flat(d.message())}); await d.accept().catch(() => {}); });
    const tr = traffic(page);
    const slog = serverLog(app);
    const step = async (id, fn) => {
        cur = id;
        const e0 = errors.length, d0 = dialogs.length, t0 = tr.n, l0 = slog.mark();
        try {
            out.steps[id] = await fn();
        } catch (e) {
            out.steps[id] = {error: flat(e.message, 700)};
            console.log(`[${id} FAILED]`, flat(e.message, 300));
            await shot(page, `${name}-fail-${id}`).catch(() => {});
        }
        await sleep(800);
        out.steps[id] = {...out.steps[id], errors: errors.slice(e0), dialogs: dialogs.slice(d0),
            requests: tr.since(t0).filter((r) => r.method !== 'GET' || /dois|failed/.test(r.url) || r.status >= 400),
            serverLog: slog.since(l0).slice(0, 12), pageNotices: await notices(page)};
        await page.evaluate(() => { window.__seenNotices = []; }).catch(() => {});
        record(name, out);
        return out.steps[id];
    };
    return {step};
}

/** 3.5: a Publication side-menu page of the workflow ("Galleys", "Title & Abstract"). */
async function openMenuPage(page, frame, sub, label) {
    await page.goto('about:blank');
    await frame.gotoEditorial(sub);
    await idle(page);
    const link = frame.menuLink(label);
    if (!(await link.last().isVisible().catch(() => false))) await frame.publicationGroup().click();
    await expect(link.last()).toBeVisible({timeout: T});
    await link.last().click();
    await idle(page);
}

/**
 * read.php on the app's fleet: the DataCite record the plugin builds for the work and each galley of its
 * current version, validation off, as {objects: [{kind, id, label, subjects | exception}]}. Read only.
 */
function readRecords(app, submissionId) {
    const REPO = path.resolve(__dirname, '../../../../..');
    const root = path.resolve(REPO, app.root);
    const raw = execFileSync('php', [path.join(__dirname, 'read.php'), root, app.contextPath, String(submissionId)],
        {encoding: 'utf8', cwd: root, env: {...process.env, PKP_CONFIG_FILE: path.resolve(REPO, app.configFile)}, timeout: 120000});
    const line = raw.split('\n').filter((l) => l.startsWith('{')).pop();
    return line ? JSON.parse(line) : {raw: flat(raw, 1500)};
}

module.exports = {T, sleep, flat, noticeRecorder, notices, stepper, openMenuPage, readRecords};
