// U14 claim check, chunk K4: side effects, deletions and the Coverage table.
// Spec: docs/specs/U14-reader-comments-and-moderation.md — Actors row 56
// (the moderation tasks), Rule 16 (252–255), Rule 18 (265–269), Side effects
// (271–299), Cross-feature "The Tasks panel" (316–321), the scenario preamble
// (339–345), Coverage (346–385), register A2 (414–425); footnotes h, l, o,
// s0, f-a2.
//
// OJS (the app with a reader block): seeds a scratch journal (public comments
// on; a manager, an editor (manager-level), a section editor, an author, three
// readers, and `admin` given a Section editor role so the auto-enrolled
// manager role can later be ended on admin's own edit page) and four published
// articles: S1 (the comments written through the screens, plus one seeded
// approved-and-reported 300-character comment for the "first 200 characters"
// axis), S2 (seeded comment + report, then the submission is deleted), S3
// (seeded comments, then unpublished and published again), S4 (comments and
// reports by the account to be removed / merged). Phases:
//   seed      the context and the submissions (mail baseline)
//   write     rd1 writes C1 on S1 through the landing page
//   tasks     the Tasks panel of the manager, the editor, the section editor
//             (control) and admin-as-manager: the row, unread, the text under
//             the sentence, pressing it; Profile › Notifications
//   approve   the manager approves C1; the tasks stay (A2); the writer's side
//   report    rd2 reports C1; the report row; pressing it (both panels); the
//             seeded long comment's and report's rows (200-character axis)
//   hide      hide C1, then approve again: the tasks stay
//   delreport the manager deletes C1's report from the report panel
//   writerdel rd2 reports C1 again; rd1 deletes C1 from the landing page
//   moddel    the manager deletes the seeded C2 from the panel
//   log       S1's Activity Log
//   admin     admin ends the manager role; rd1 writes C3; admin's panel
//   unpub     S3 unpublished (Comments page, landing page), published again
//   delsub    S2 deleted through the workflow; Comments page; the tasks
//   mailctrl  the manager emails rd2 from Users & Roles (the positive control)
//   deluser   rd3's row menu on Users & Roles: Remove User, Merge User
//   leave     the Tasks panel left with a box ticked
//   mail      the mail counts at the end
// OMP / OPS (ctrl): a seeded approved-and-reported comment; the manager's Tasks
// panel, pressing both rows, deleting the comment from the panel.
//
//   PROBE_FEATURE=U14 PROBE_AGENT=ccK4 node bin/probe.js ojs shared/playwright/checks/U14/K4/k4.js
//   PHASES=seed,write,… narrows; later phases reuse k4-state-<app>.json.
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, signOut, screen, shot, record, loc, note, idle, tag, outDir} =
    require('../../../probe');

const ALL_PHASES = ['seed', 'write', 'tasks', 'approve', 'report', 'hide', 'delreport', 'writerdel', 'moddel', 'log', 'admin', 'unpub', 'delsub', 'mailctrl', 'deluser', 'leave', 'mail', 'ctrl', 'repub', 'decline', 'merge'];
const PHASES = process.env.PHASES ? process.env.PHASES.split(',') : ALL_PHASES;
const on = (p) => PHASES.includes(p);
const log = (...a) => console.log('[k4]', ...a);
const stateFile = (app) => path.join(outDir(), `k4-state-${app.name}.json`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const T = 30_000;
const BOX_LABEL = 'What do you think about this publication? Type your comments here.';
const COMMENT_TASK = 'A comment has been submitted and is pending review by a moderator.';
const REPORT_TASK = 'A report was submitted for a comment and requires review by a moderator.';
const LONG = (prefix) => (prefix + ' ' + 'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua ut enim ad minim veniam quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur excepteur sint occaecat.').slice(0, 300);

// ---------------------------------------------------------------------------
// helpers

const textOf = async (locator) => {
    try {
        if ((await locator.count()) === 0) return null;
        return (await locator.first().innerText()).trim();
    } catch { return null; }
};
async function snap(page, name, extra = {}) {
    let s;
    try { s = await screen(page); } catch (e) { s = {url: page.url(), title: await page.title().catch(() => null), error: String(e.message).slice(0, 300)}; }
    Object.assign(s, extra);
    record(name, s);
    await shot(page, name).catch(() => {});
    return s;
}
const captureResponse = async (page, predicate, action, timeout = 20_000) => {
    const waiting = page.waitForResponse(predicate, {timeout}).catch((e) => ({error: String(e).slice(0, 120)}));
    await action();
    const response = await waiting;
    if (response.error) return response;
    let body = null;
    try { body = await response.json(); } catch { body = await response.text().catch(() => null); }
    return {url: response.url().replace(/^.*\/index\.php/, ''), method: response.request().method(), status: response.status(), postData: response.request().postData(), body};
};
async function step(name, fn) {
    try { await fn(); } catch (e) {
        log('STEP FAILED', name, String(e).slice(0, 400));
        record(`error-${name}`, {step: name, error: String(e).slice(0, 2000)});
    }
}
const loadState = (app) => JSON.parse(fs.readFileSync(stateFile(app), 'utf8'));
const saveState = (app, st) => fs.writeFileSync(stateFile(app), JSON.stringify(st, null, 2));

// ── the Tasks panel (U05 K1's helpers) ──────────────────────────────────────
function bell(page) { return page.getByRole('button', {name: /^Tasks/}); }
async function bellState(page) {
    const b = bell(page);
    const count = await b.count();
    if (!count) return {present: false, url: page.url()};
    const data = await b.first().evaluate((el) => {
        const sr = el.querySelector('.-screenReader');
        const badge = [...el.querySelectorAll('span')].find((s) => !s.classList.contains('-screenReader') && /^\d+$/.test(s.textContent.trim()));
        return {srText: sr ? sr.textContent.trim() : null, accessibleName: el.getAttribute('aria-label') || el.textContent.replace(/\s+/g, ' ').trim(), badgeText: badge ? badge.textContent.trim() : null, disabled: el.disabled};
    });
    return {present: true, url: page.url(), visible: await b.first().isVisible(), ...data};
}
const dialog = (page) => page.locator('[role="dialog"]:visible').last();
async function openTasks(page) {
    await bell(page).first().click();
    const d = dialog(page);
    await d.waitFor({state: 'visible', timeout: T});
    await d.locator('.pkp_controllers_grid, table').first().waitFor({state: 'visible', timeout: T});
    await idle(page);
    await sleep(300);
    return d;
}
async function taskRows(page) {
    const d = dialog(page);
    const rows = await d.locator('tr.gridRow').evaluateAll((trs) => trs.map((tr) => {
        const msg = tr.querySelector('span.message');
        const task = tr.querySelector('div.task');
        const a = tr.querySelector('a');
        return {
            id: tr.id,
            unread: !!(task && task.classList.contains('unread')),
            sentence: msg ? msg.innerText.trim() : null,
            sentenceWeight: msg ? getComputedStyle(msg).fontWeight : null,
            acronym: tr.querySelector('span.acronym') ? tr.querySelector('span.acronym').innerText.trim() : null,
            title: tr.querySelector('span.submission') ? tr.querySelector('span.submission').innerText.trim() : null,
            titleLength: tr.querySelector('span.submission') ? tr.querySelector('span.submission').innerText.trim().length : null,
            rowText: tr.innerText.replace(/\s+/g, ' ').trim().slice(0, 400),
            href: a ? a.getAttribute('href').replace(/^.*\/index\.php/, '') : null,
        };
    }));
    const countLine = await textOf(d.locator('.gridPager, [class*="pager"], .pkp_controllers_grid').getByText(/\d+ - \d+ of \d+ items|No Items/).last());
    return {rows, countLine, headers: (await d.locator('th').allInnerTexts().catch(() => [])).map((s) => s.trim())};
}
async function closeTasks(page) {
    const d = dialog(page);
    await d.getByRole('button', {name: /close/i}).first().click();
    await d.waitFor({state: 'hidden', timeout: 10000}).catch(() => {});
}
/** The Tasks panel read: the bell before, the rows, the rows about `texts` (by the text under the sentence). */
async function readTasks(page, name, texts = []) {
    const before = await bellState(page);
    if (!before.present) {
        const s = await snap(page, name, {bell: before, rows: null, note: 'no bell on this page'});
        return {bell: before, rows: [], countLine: null, about: {}, screen: s};
    }
    await openTasks(page);
    const t = await taskRows(page);
    const about = {};
    for (const [key, txt] of Object.entries(texts)) {
        about[key] = t.rows.filter((r) => txt && ((r.title && r.title.length >= 20 && r.title === txt.slice(0, r.title.length)) || (r.rowText && r.rowText.includes(txt.slice(0, 60)))));
    }
    const s = await snap(page, name, {bell: before, tasks: t, about});
    await closeTasks(page);
    return {bell: before, ...t, about, screen: s};
}
/** Press the row about `text` (its link) and record where it lands. */
async function pressTask(page, name, text) {
    await openTasks(page);
    const row = dialog(page).locator('tr.gridRow').filter({hasText: text.slice(0, 60)}).first();
    const found = await row.count();
    if (!found) {
        const s = await snap(page, `${name}-norow`, {found: 0});
        await closeTasks(page);
        return {found: 0, screen: s};
    }
    const link = row.locator('a').first();
    const href = await link.getAttribute('href');
    const unreadBefore = await row.locator('div.task.unread').count();
    await loc(page, 'a task row\'s link (the sentence and the text under it)', link);
    await link.click();
    await page.waitForURL(/userComments/, {timeout: T}).catch(() => {});
    await idle(page);
    // the panels open after the page's own fetches; wait for a dialog with a heading
    await page.locator('[role="dialog"]:visible').first().waitFor({timeout: 15_000}).catch(() => {});
    await sleep(800);
    const dialogs = [];
    for (const d of await page.locator('[role="dialog"]:visible').all()) {
        dialogs.push({name: await d.getAttribute('aria-label').catch(() => null), heading: await textOf(d.getByRole('heading').first()), text: (await d.innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 500), buttons: (await d.getByRole('button').allInnerTexts().catch(() => [])).map((x) => x.trim())});
    }
    const s = await snap(page, name, {href: href && href.replace(/^.*\/index\.php/, ''), unreadBefore, dialogs, dialogsVisible: dialogs.length, url: page.url()});
    return {found, href, unreadBefore, dialogs, screen: s, url: page.url()};
}

// ── the Comments page (K3's helpers) ────────────────────────────────────────
const panelOf = (page) => page.locator('main [role="tabpanel"]:visible').first();
async function readRows(page) {
    const out = [];
    for (const r of await panelOf(page).locator('table tbody tr').all()) out.push((await r.locator('td').allInnerTexts()).map((c) => c.trim()));
    return out;
}
async function tableSettled(page) {
    await panelOf(page).locator('table tbody tr').first().waitFor({timeout: T}).catch(() => {});
    await idle(page);
    for (let i = 0; i < 20; i++) {
        const txt = (await panelOf(page).locator('table tbody').innerText().catch(() => '')).trim();
        if (txt && !/^Loading$/i.test(txt)) break;
        await sleep(250);
    }
}
async function gotoComments(page, app, ctx, suffix = '') {
    await page.goto(app.url(`/index.php/${ctx}/management/settings/userComments${suffix}`));
    await tableSettled(page);
}
async function clickTab(page, name) {
    await page.locator('main').getByRole('tab', {name, exact: true}).click();
    await sleep(300);
    await tableSettled(page);
}
/** Every row of the visible tab across its pages. */
async function allRows(page) {
    const rows = [];
    for (let n = 1; n <= 6; n++) {
        rows.push(...(await readRows(page)));
        const next = panelOf(page).locator('nav.pkpPagination').getByRole('button', {name: `Go to Page ${n + 1}`, exact: true});
        if (!(await next.count())) break;
        await next.first().click();
        await tableSettled(page);
    }
    return rows;
}
const commentDialog = (page) => page.getByRole('dialog', {name: /^View comment details by/});
const reportDialog = (page) => page.getByRole('dialog', {name: /^View report details by/});
const confirmDialog = (page, name) => page.getByRole('dialog', {name, exact: true});
async function commentsPageWith(page, app, ctx, name, texts) {
    await gotoComments(page, app, ctx);
    await clickTab(page, 'All');
    const rows = await allRows(page);
    const found = {};
    for (const [k, txt] of Object.entries(texts)) found[k] = rows.filter((r) => r.some((c) => c.includes(txt.slice(0, 50)))).length;
    await gotoComments(page, app, ctx);
    const s = await snap(page, name, {rowsAll: rows, found});
    return {rows, found, screen: s};
}
/** Approve / hide from the panel opened by the shared address. */
async function setApproval(page, app, ctx, id, button, name) {
    await gotoComments(page, app, ctx, `?commentId=${id}`);
    await commentDialog(page).waitFor({timeout: T});
    await idle(page);
    const before = await snap(page, `${name}-panel`);
    const resp = await captureResponse(page, (r) => r.url().includes('/setApproval'), () => commentDialog(page).getByRole('button', {name: button}).click());
    await commentDialog(page).waitFor({state: 'hidden', timeout: 15_000}).catch(() => {});
    await sleep(800);
    const toast = await textOf(page.getByText(/The comment has been/));
    record(`${name}-result`, {request: resp, toast, url: page.url(), dialogsVisible: await page.locator('[role="dialog"]:visible').count()});
    return {before, resp, toast};
}
async function deleteFromPanel(page, app, ctx, id, name) {
    await gotoComments(page, app, ctx, `?commentId=${id}`);
    await commentDialog(page).waitFor({timeout: T});
    await idle(page);
    await commentDialog(page).getByRole('button', {name: 'Delete Comment'}).click();
    await confirmDialog(page, 'Delete Comment').waitFor({timeout: T});
    const before = await snap(page, `${name}-confirm`);
    const resp = await captureResponse(page, (r) => /\/api\/v1\/comments\/\d+$/.test(r.url()) && r.request().method() !== 'GET', () => confirmDialog(page, 'Delete Comment').getByRole('button', {name: 'Delete', exact: true}).click());
    await commentDialog(page).waitFor({state: 'hidden', timeout: 15_000}).catch(() => {});
    await sleep(800);
    const toast = await textOf(page.getByText(/The comment has been/));
    record(`${name}-result`, {request: resp, toast, url: page.url(), dialogsVisible: await page.locator('[role="dialog"]:visible').count()});
    return {before, resp, toast};
}
async function deleteReportFromPanel(page, app, ctx, commentId, reportId, name) {
    await gotoComments(page, app, ctx, `?reportId=${reportId}&commentId=${commentId}`);
    await reportDialog(page).waitFor({timeout: T});
    await idle(page);
    const before = await snap(page, `${name}-panel`);
    await reportDialog(page).getByRole('button', {name: 'Delete Report'}).click();
    await confirmDialog(page, 'Delete Report').waitFor({timeout: T});
    const confirm = await snap(page, `${name}-confirm`);
    const resp = await captureResponse(page, (r) => /\/reports\/\d+$/.test(r.url()) && r.request().method() !== 'GET', () => confirmDialog(page, 'Delete Report').getByRole('button', {name: 'Delete', exact: true}).click());
    await reportDialog(page).waitFor({state: 'hidden', timeout: 15_000}).catch(() => {});
    await sleep(800);
    const toast = await textOf(page.getByText(/The report has been/));
    record(`${name}-result`, {request: resp, toast, url: page.url(), dialogsVisible: await page.locator('[role="dialog"]:visible').count()});
    return {before, confirm, resp, toast};
}

// ── the landing page (K2's helpers) ─────────────────────────────────────────
async function landing(page, app, ctx, id, name) {
    const resp = await page.goto(app.url(`/index.php/${ctx}/article/view/${id}`)).catch(() => null);
    await idle(page);
    const s = await snap(page, name, {
        httpStatus: resp ? resp.status() : null,
        bodies: (await page.locator('#public-comments article [class*="messageBody"]').allInnerTexts().catch(() => [])).map((x) => x.trim()),
        headings: (await page.locator('#public-comments').getByRole('heading', {level: 3}).allInnerTexts().catch(() => [])).map((x) => x.trim()),
        pendingNotices: await page.locator('[class*="NeedsApproval"]').count().catch(() => 0),
        notices: (await page.locator('[role="alert"], [role="status"], .pkpNotification, [class*="Notification"]').allInnerTexts().catch(() => [])).map((x) => x.replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 10),
        headerUserText: await textOf(page.locator('header')),
    });
    return s;
}
async function writeComment(page, app, ctx, id, text, name) {
    await landing(page, app, ctx, id, `${name}-before`);
    const box = page.getByRole('textbox', {name: BOX_LABEL});
    await box.waitFor({timeout: T});
    await box.fill(text);
    const post = await captureResponse(page, (r) => /\/api\/v1\/comments$/.test(r.url()) && r.request().method() === 'POST', () => page.locator('#public-comments').getByRole('button', {name: 'Submit', exact: true}).click());
    await sleep(800);
    const s = await landing(page, app, ctx, id, `${name}-after`);
    record(`${name}-post`, {request: post});
    return {id: post.body && post.body.id, post, screen: s};
}
async function articleOf(page, text) {
    return page.locator('#public-comments article').filter({hasText: text.slice(0, 60)}).last();
}
async function reportComment(page, app, ctx, id, text, reason, name) {
    await landing(page, app, ctx, id, `${name}-before`);
    const article = await articleOf(page, text);
    await article.getByRole('button').first().click();
    await sleep(300);
    const items = (await page.getByRole('menuitem').allInnerTexts()).map((x) => x.trim());
    await page.getByRole('menuitem', {name: 'Report', exact: true}).click();
    const dlg = page.getByRole('dialog');
    await dlg.waitFor({timeout: T});
    await dlg.getByRole('textbox').fill(reason);
    const before = await snap(page, `${name}-dialog`, {menuItems: items});
    const post = await captureResponse(page, (r) => /\/reports$/.test(r.url()) && r.request().method() === 'POST', () => dlg.getByRole('button', {name: 'Submit', exact: true}).click());
    await sleep(800);
    const s = await snap(page, `${name}-after`, {notices: (await page.locator('[role="alert"], [role="status"], .pkpNotification').allInnerTexts().catch(() => [])).map((x) => x.replace(/\s+/g, ' ').trim()).filter(Boolean)});
    record(`${name}-post`, {request: post, menuItems: items});
    return {id: post.body && post.body.id, post, before, screen: s};
}
async function deleteOwnComment(page, app, ctx, id, text, name) {
    await landing(page, app, ctx, id, `${name}-before`);
    const article = await articleOf(page, text);
    await article.getByRole('button').first().click();
    await sleep(300);
    const items = (await page.getByRole('menuitem').allInnerTexts()).map((x) => x.trim());
    await page.getByRole('menuitem', {name: 'Delete Comment', exact: true}).click();
    const dlg = page.getByRole('dialog');
    await dlg.waitFor({timeout: T});
    const before = await snap(page, `${name}-dialog`, {menuItems: items});
    const del = await captureResponse(page, (r) => /\/api\/v1\/comments\/\d+$/.test(r.url()) && r.request().method() !== 'GET', () => dlg.getByRole('button', {name: 'Delete', exact: true}).click());
    await sleep(800);
    const s = await landing(page, app, ctx, id, `${name}-after`);
    record(`${name}-post`, {request: del, menuItems: items});
    return {del, before, screen: s};
}

async function mailCounts(app, usernames) {
    const out = {total: await app.mail.messageCount().catch((e) => String(e).slice(0, 80))};
    for (const u of usernames) out[u] = await app.mail.count({to: `${u}@mail.test`}).catch((e) => String(e).slice(0, 80));
    return out;
}
/** Profile › Notifications: the form's labels, and whether any mentions comments. */
async function notificationsTab(page, app, ctx, name) {
    await page.goto(app.url(`/index.php/${ctx}/user/profile`));
    await idle(page);
    await page.getByRole('tab', {name: 'Notifications', exact: true}).click();
    const form = page.locator('#notificationSettingsForm');
    await form.waitFor({timeout: 15_000});
    await idle(page);
    const labels = (await form.locator('label').allInnerTexts()).map((x) => x.replace(/\s+/g, ' ').trim()).filter(Boolean);
    const text = (await form.innerText()).replace(/\s+/g, ' ');
    const s = await snap(page, name, {labels, mentionsComment: labels.filter((l) => /comment/i.test(l)), formMentionsComment: /comment/i.test(text), labelsCount: labels.length});
    return {labels, s};
}
/** admin's own row on Users & Roles › Users › Edit › the manager role's "Remove Role" (K1's recipe). */
async function endOwnManagerRole(page, app, ctx, prefix) {
    const rem = {};
    await page.goto(app.url(`/index.php/${ctx}/management/settings/access`));
    await idle(page);
    const table = page.locator('table').filter({hasText: /\badmin\b/}).first();
    await table.waitFor({state: 'visible', timeout: T}).catch(() => {});
    const adminRow = table.locator('tr').filter({hasText: /\badmin\b/}).first();
    await adminRow.locator('button').last().click();
    await idle(page);
    rem.menu = await page.getByRole('menuitem').allInnerTexts().catch(() => []);
    await page.getByRole('menuitem', {name: /^Edit$/}).first().click().catch(() => {});
    await page.waitForURL(/management\/settings\/user\/\d+/, {timeout: T}).catch(() => {});
    await idle(page);
    await page.getByRole('button', {name: /Remove Role/i}).first().waitFor({state: 'visible', timeout: 15_000}).catch(() => {});
    await snap(page, `${prefix}-edit-page`);
    rem.roleRows = await page.locator('tr').filter({has: page.getByRole('button', {name: /Remove Role/i})}).evaluateAll((els) => els.map((e) => e.innerText.replace(/\s+/g, ' ').trim())).catch(() => []);
    const roleRow = page.locator('tr').filter({hasText: /manager/i}).filter({has: page.getByRole('button', {name: /Remove Role/i})}).first();
    if (await roleRow.count()) {
        await roleRow.getByRole('button', {name: /Remove Role/i}).click();
        await idle(page);
        const dlg = page.locator('[role="dialog"]:visible').filter({hasText: /Remove Role/i}).last();
        await dlg.waitFor({state: 'visible', timeout: 15_000}).catch(() => {});
        rem.removeRoleDialog = (await dlg.innerText().catch(() => '')).slice(0, 400);
        const resp = page.waitForResponse((r) => r.request().method() === 'POST' && /\/api\/v1\//.test(r.url()), {timeout: 15_000}).catch(() => null);
        await dlg.getByRole('button', {name: /^Remove Role$/i}).click().catch(() => {});
        const rr = await resp;
        rem.removeRoleResponse = rr ? {status: rr.status(), url: rr.url().replace(/^.*\/index\.php/, '')} : 'no request';
        await idle(page);
        await sleep(1500);
        rem.roleRowsAfter = await page.locator('tr').filter({has: page.getByRole('button', {name: /Remove Role/i})}).evaluateAll((els) => els.map((e) => e.innerText.replace(/\s+/g, ' ').trim())).catch(() => []);
        await snap(page, `${prefix}-edit-page-after`);
    }
    record(`${prefix}-role-removal`, rem);
    return rem;
}
/** The workflow panel of a submission on the editorial dashboard. */
async function gotoWorkflow(page, app, ctx, id) {
    await page.goto(app.url(`/index.php/${ctx}/dashboard/editorial?workflowSubmissionId=${id}`));
    await page.getByRole('link', {name: 'Publication', exact: true}).waitFor({timeout: T});
    await idle(page);
    await sleep(500);
}
async function readActivityLog(page, name) {
    await page.getByRole('button', {name: 'Activity Log', exact: true}).click();
    const d = page.getByRole('dialog').filter({hasText: 'Activity Log & Notes'});
    await d.getByText('Event', {exact: true}).waitFor({timeout: T});
    await idle(page);
    await sleep(800);
    const rows = [];
    for (const r of await d.getByRole('row').all()) rows.push((await r.innerText()).replace(/\s+/g, ' ').trim());
    const s = await snap(page, name, {logRows: rows, mentionsComment: rows.filter((r) => /comment|report|moderat/i.test(r))});
    await d.getByRole('button', {name: 'Close', exact: true}).first().click().catch(() => {});
    await d.waitFor({state: 'hidden', timeout: 10_000}).catch(() => {});
    return {rows, s};
}

// ---------------------------------------------------------------------------

const SECOND = ['repub', 'decline', 'merge'];
const SECOND_PASS = PHASES.every((p) => SECOND.includes(p));
// the first pass; the second pass (below) runs after it, never alongside it
const firstPass = SECOND_PASS ? Promise.resolve() : forEachApp(async (app) => {
    const isOJS = app.name === 'ojs';
    let st = {};

    // ── OMP / OPS: the control ─────────────────────────────────────────────
    if (!isOJS) {
        if (!on('ctrl')) return;
        const t = tag('u14k4');
        const users = [
            {username: `${t}mgr`, roles: ['manager'], givenName: 'Maya', familyName: 'Moderator'},
            {username: `${t}au`, roles: ['author'], givenName: 'Alex', familyName: 'Author'},
            {username: `${t}rd1`, roles: ['reader'], givenName: 'Rosa', familyName: 'Writer'},
            {username: `${t}rd2`, roles: ['reader'], givenName: 'Rob', familyName: 'Reporter'},
        ];
        const C = `K4 ${app.name} control comment on the ${app.name} item.`;
        const R = `K4 ${app.name} control report reason.`;
        st.context = await app.api.createContext({tag: t, enablePublicComments: true, users});
        st.s1 = await app.api.createSubmission({tag: `${t}s1`, context: t, submitter: `${t}au`, title: `K4 ${app.name} item`, published: true,
            userComments: [{user: `${t}rd1`, text: C, approved: true, reports: [{user: `${t}rd2`, note: R}]}]});
        st.ctx = t; st.C = C; st.R = R;
        saveState(app, st);
        log('seeded', t, JSON.stringify(st.s1.userComments));
        const {page, close} = await launch(app);
        try {
            await signIn(page, `${t}mgr`, {contextPath: t});
            await page.goto(app.url(`/index.php/${t}/submissions`));
            await idle(page);
            const tasks = await readTasks(page, 'ctrl-mgr-tasks', {comment: C, report: R});
            log('ctrl tasks', JSON.stringify({count: tasks.countLine, rows: tasks.rows.map((r) => [r.sentence, r.title, r.unread])}));
            const pressed = await pressTask(page, 'ctrl-mgr-press-comment', C);
            log('ctrl press comment', pressed.url, JSON.stringify(pressed.dialogs.map((d) => d.name || d.heading)));
            await page.goto(app.url(`/index.php/${t}/submissions`));
            await idle(page);
            const pressedR = await pressTask(page, 'ctrl-mgr-press-report', R);
            log('ctrl press report', pressedR.url, JSON.stringify(pressedR.dialogs.map((d) => d.name || d.heading)));
            // the Comments page, then delete the comment from the panel
            await commentsPageWith(page, app, t, 'ctrl-mgr-commentspage', {comment: C});
            const cid = st.s1.userComments[0].id;
            const del = await deleteFromPanel(page, app, t, cid, 'ctrl-mgr-delete');
            log('ctrl delete', del.resp.status, del.toast);
            await page.goto(app.url(`/index.php/${t}/submissions`));
            await idle(page);
            const after = await readTasks(page, 'ctrl-mgr-tasks-after-delete', {comment: C, report: R});
            log('ctrl tasks after', JSON.stringify({count: after.countLine, about: Object.fromEntries(Object.entries(after.about).map(([k, v]) => [k, v.length]))}));
            record('ctrl-mail', await mailCounts(app, [`${t}mgr`, `${t}rd1`, `${t}rd2`]));
        } finally { await close(); }
        return;
    }

    // ── OJS ────────────────────────────────────────────────────────────────
    if (on('seed')) {
        const t = tag('u14k4');
        const users = [
            {username: `${t}mgr`, roles: ['manager'], givenName: 'Maya', familyName: 'Moderator'},
            {username: `${t}ed`, roles: ['editor'], givenName: 'Ed', familyName: 'Editor'},
            {username: `${t}se`, roles: ['sectionEditor'], givenName: 'Sam', familyName: 'Sectioned'},
            {username: `${t}au`, roles: ['author'], givenName: 'Alex', familyName: 'Author'},
            {username: `${t}rd1`, roles: ['reader'], givenName: 'Rosa', familyName: 'Writer'},
            {username: `${t}rd2`, roles: ['reader'], givenName: 'Rob', familyName: 'Reporter'},
            {username: `${t}rd3`, roles: ['reader'], givenName: 'Rita', familyName: 'Removed'},
            // admin is auto-enrolled as a manager; a second (non-manager) role lets the manager role be ended on the edit page (K1-4).
            {username: 'admin', roles: ['sectionEditor'], givenName: 'Site', familyName: 'Admin'},
        ];
        st.context = await app.api.createContext({tag: t, enablePublicComments: true, users});
        st.ctx = t;
        st.texts = {
            C1: 'K4 comment one, written through the landing page by Rosa.',
            C2: LONG('K4 long seeded comment C2 on S1 (300 characters)'),
            R2: LONG('K4 long seeded report on C2 (300 characters)'),
            C3: 'K4 comment three, the control after admin lost the manager role.',
            S2C: 'K4 S2 comment to go with the submission when it is deleted.',
            S2R: 'K4 S2 report to go with the submission when it is deleted.',
            S3A: 'K4 S3 approved comment kept through an unpublish.',
            S3P: 'K4 S3 pending comment kept through an unpublish.',
            S4A: 'K4 S4 comment written by the account to be removed.',
            S4AR: 'K4 S4 report by Rob on the removed account\'s comment.',
            S4B: 'K4 S4 comment by Rosa, reported by the account to be removed.',
            S4BR: 'K4 S4 report by the removed account on Rosa\'s comment.',
            R1: 'K4 report reason one on comment one.',
            R1b: 'K4 report reason two on comment one, after the first was deleted.',
        };
        const X = st.texts;
        st.s1 = await app.api.createSubmission({tag: `${t}s1`, context: t, submitter: `${t}au`, title: 'K4 article one (the comments written on screen)', published: true,
            userComments: [{user: `${t}rd1`, text: X.C2, approved: true, reports: [{user: `${t}rd2`, note: X.R2}]}]});
        st.s2 = await app.api.createSubmission({tag: `${t}s2`, context: t, submitter: `${t}au`, title: 'K4 article two (to be deleted)', published: true,
            userComments: [{user: `${t}rd1`, text: X.S2C, approved: true, reports: [{user: `${t}rd2`, note: X.S2R}]}]});
        st.s3 = await app.api.createSubmission({tag: `${t}s3`, context: t, submitter: `${t}au`, title: 'K4 article three (unpublished and back)', published: true,
            userComments: [{user: `${t}rd1`, text: X.S3A, approved: true}, {user: `${t}rd2`, text: X.S3P, approved: false}]});
        st.s4 = await app.api.createSubmission({tag: `${t}s4`, context: t, submitter: `${t}au`, title: 'K4 article four (the removed account)', published: true,
            userComments: [
                {user: `${t}rd3`, text: X.S4A, approved: true, reports: [{user: `${t}rd2`, note: X.S4AR}]},
                {user: `${t}rd1`, text: X.S4B, approved: true, reports: [{user: `${t}rd3`, note: X.S4BR}]},
            ]});
        st.mailBaseline = await mailCounts(app, [`${t}mgr`, `${t}ed`, `${t}se`, `${t}rd1`, `${t}rd2`, `${t}rd3`, 'admin']);
        saveState(app, st);
        log('seeded', t, 's1', st.s1.submissionId, 's2', st.s2.submissionId, 's3', st.s3.submissionId, 's4', st.s4.submissionId, JSON.stringify(st.s1.userComments));
        note(`ccK4: [ojs] Scratch journal ${t}: S1 ${st.s1.submissionId}, S2 ${st.s2.submissionId}, S3 ${st.s3.submissionId}, S4 ${st.s4.submissionId}; seeded userComments[] fire the moderators' tasks (the harness note), so a scratch manager's Tasks panel already lists rows before any screen is driven.`);
    } else {
        st = loadState(app);
    }
    const t = st.ctx; const X = st.texts;
    const mgr = `${t}mgr`, ed = `${t}ed`, se = `${t}se`, rd1 = `${t}rd1`, rd2 = `${t}rd2`, rd3 = `${t}rd3`;
    const s1 = st.s1.submissionId, s2 = st.s2.submissionId, s3 = st.s3.submissionId, s4 = st.s4.submissionId;
    const {page, close} = await launch(app);
    page.on('dialog', (d) => { log('browser dialog', d.type(), d.message()); d.accept().catch(() => {}); });
    const dashboard = async () => { await page.goto(app.url(`/index.php/${t}/submissions`)); await idle(page); };
    try {
        // ── write ──────────────────────────────────────────────────────────
        if (on('write')) await step('write', async () => {
            await signIn(page, rd1, {contextPath: t});
            const w = await writeComment(page, app, t, s1, X.C1, 'write-rd1-c1');
            st.c1 = w.id;
            saveState(app, st);
            log('C1 id', st.c1, w.post.status);
            // the writer's own bell (site profile page) and the reader-facing header
            await page.goto(app.url(`/index.php/${t}/user/profile`));
            await idle(page);
            await snap(page, 'write-rd1-profile', {bell: await bellState(page)});
            await signOut(page);
        });

        // ── tasks ──────────────────────────────────────────────────────────
        if (on('tasks')) await step('tasks', async () => {
            for (const [who, user] of [['mgr', mgr], ['ed', ed]]) {
                await signIn(page, user, {contextPath: t});
                await dashboard();
                const tk = await readTasks(page, `tasks-${who}`, {C1: X.C1, C2: X.C2, R2: X.R2});
                log(`tasks ${who}`, tk.countLine, JSON.stringify(tk.rows.slice(0, 6).map((r) => [r.sentence, r.title && r.title.slice(0, 40), r.unread, r.titleLength])));
                await loc(page, 'the Tasks bell', bell(page));
                const pressed = await pressTask(page, `tasks-${who}-press-c1`, X.C1);
                log(`press ${who}`, pressed.url, JSON.stringify(pressed.dialogs.map((d) => d.name || d.heading)));
                await loc(page, 'the comment panel opened by the task', commentDialog(page));
                // after pressing: the row read?
                await dashboard();
                const after = await readTasks(page, `tasks-${who}-after-press`, {C1: X.C1});
                log(`after press ${who}`, JSON.stringify(after.about.C1.map((r) => [r.unread, r.sentenceWeight])));
                await notificationsTab(page, app, t, `tasks-${who}-notifications-tab`);
                await signOut(page);
            }
            // the section editor: control
            await signIn(page, se, {contextPath: t});
            await dashboard();
            const tkse = await readTasks(page, 'tasks-se', {C1: X.C1, C2: X.C2});
            log('tasks se', tkse.countLine, JSON.stringify(tkse.rows.map((r) => [r.sentence, r.title && r.title.slice(0, 40)])));
            await signOut(page);
            // admin holding the manager role (auto-enrolled)
            await signIn(page, 'admin', {contextPath: t});
            await dashboard();
            const tka = await readTasks(page, 'tasks-admin-as-manager', {C1: X.C1, C2: X.C2});
            log('tasks admin', tka.countLine, JSON.stringify(tka.about.C1.map((r) => [r.sentence, r.acronym, r.unread])));
            await signOut(page);
        });

        // ── approve ────────────────────────────────────────────────────────
        if (on('approve')) await step('approve', async () => {
            await signIn(page, mgr, {contextPath: t});
            const a = await setApproval(page, app, t, st.c1, 'Approve Comment', 'approve-mgr-c1');
            log('approve', a.resp.status, a.toast);
            await dashboard();
            const tk = await readTasks(page, 'approve-mgr-tasks', {C1: X.C1});
            log('approve mgr tasks C1 rows', tk.about.C1.length);
            await signOut(page);
            await signIn(page, ed, {contextPath: t});
            await dashboard();
            const tke = await readTasks(page, 'approve-ed-tasks', {C1: X.C1});
            log('approve ed tasks C1 rows', tke.about.C1.length);
            await signOut(page);
            // the writer: landing page, profile bell, mail
            await signIn(page, rd1, {contextPath: t});
            await landing(page, app, t, s1, 'approve-rd1-landing');
            await page.goto(app.url(`/index.php/${t}/user/profile`));
            await idle(page);
            await snap(page, 'approve-rd1-profile', {bell: await bellState(page)});
            await signOut(page);
            record('approve-mail', await mailCounts(app, [mgr, ed, se, rd1, rd2, 'admin']));
        });

        // ── report ─────────────────────────────────────────────────────────
        if (on('report')) await step('report', async () => {
            await signIn(page, rd2, {contextPath: t});
            const r = await reportComment(page, app, t, s1, X.C1, X.R1, 'report-rd2-c1');
            st.r1 = r.id;
            saveState(app, st);
            log('R1 id', st.r1, r.post.status);
            await signOut(page);
            for (const [who, user] of [['mgr', mgr], ['ed', ed]]) {
                await signIn(page, user, {contextPath: t});
                await dashboard();
                const tk = await readTasks(page, `report-${who}-tasks`, {C1: X.C1, R1: X.R1, C2: X.C2, R2: X.R2});
                log(`report tasks ${who}`, JSON.stringify(Object.fromEntries(Object.entries(tk.about).map(([k, v]) => [k, v.map((x) => [x.sentence.slice(0, 30), x.titleLength, x.unread])]))));
                const pressed = await pressTask(page, `report-${who}-press-r1`, X.R1);
                log(`press report ${who}`, pressed.url, JSON.stringify(pressed.dialogs.map((d) => d.name || d.heading)));
                await loc(page, 'the report panel opened by the task', reportDialog(page));
                if (who === 'mgr') {
                    // the 200-character axis: press the seeded long comment's and long report's rows too
                    await dashboard();
                    const pc2 = await pressTask(page, 'report-mgr-press-c2-long', X.C2);
                    log('press C2', pc2.url, JSON.stringify(pc2.dialogs.map((d) => d.name || d.heading)));
                    await dashboard();
                    const pr2 = await pressTask(page, 'report-mgr-press-r2-long', X.R2);
                    log('press R2', pr2.url, JSON.stringify(pr2.dialogs.map((d) => d.name || d.heading)));
                }
                await signOut(page);
            }
            // the reporter: landing page and mail
            await signIn(page, rd2, {contextPath: t});
            await landing(page, app, t, s1, 'report-rd2-landing-after');
            await signOut(page);
            record('report-mail', await mailCounts(app, [mgr, ed, se, rd1, rd2, 'admin']));
        });

        // ── hide ───────────────────────────────────────────────────────────
        if (on('hide')) await step('hide', async () => {
            await signIn(page, mgr, {contextPath: t});
            const h = await setApproval(page, app, t, st.c1, 'Hide Comment', 'hide-mgr-c1');
            log('hide', h.resp.status, h.toast);
            await dashboard();
            const tk = await readTasks(page, 'hide-mgr-tasks', {C1: X.C1, R1: X.R1});
            log('hide mgr tasks', tk.about.C1.length, tk.about.R1.length);
            await signOut(page);
            await signIn(page, ed, {contextPath: t});
            await dashboard();
            const tke = await readTasks(page, 'hide-ed-tasks', {C1: X.C1, R1: X.R1});
            log('hide ed tasks', tke.about.C1.length, tke.about.R1.length);
            await signOut(page);
            await signIn(page, rd1, {contextPath: t});
            await landing(page, app, t, s1, 'hide-rd1-landing');
            await signOut(page);
            await signIn(page, mgr, {contextPath: t});
            const a = await setApproval(page, app, t, st.c1, 'Approve Comment', 'hide-mgr-c1-reapprove');
            log('re-approve', a.resp.status, a.toast);
            await signOut(page);
            record('hide-mail', await mailCounts(app, [mgr, ed, se, rd1, rd2, 'admin']));
        });

        // ── delreport ──────────────────────────────────────────────────────
        if (on('delreport')) await step('delreport', async () => {
            await signIn(page, mgr, {contextPath: t});
            const d = await deleteReportFromPanel(page, app, t, st.c1, st.r1, 'delreport-mgr-r1');
            log('delete report', d.resp.status, d.toast);
            await dashboard();
            const tk = await readTasks(page, 'delreport-mgr-tasks', {C1: X.C1, R1: X.R1});
            log('delreport mgr tasks', tk.about.C1.length, tk.about.R1.length);
            await signOut(page);
            await signIn(page, ed, {contextPath: t});
            await dashboard();
            const tke = await readTasks(page, 'delreport-ed-tasks', {C1: X.C1, R1: X.R1});
            log('delreport ed tasks', tke.about.C1.length, tke.about.R1.length);
            await signOut(page);
            await signIn(page, rd2, {contextPath: t});
            await landing(page, app, t, s1, 'delreport-rd2-landing');
            await page.goto(app.url(`/index.php/${t}/user/profile`));
            await idle(page);
            await snap(page, 'delreport-rd2-profile', {bell: await bellState(page)});
            await signOut(page);
            record('delreport-mail', await mailCounts(app, [mgr, ed, se, rd1, rd2, 'admin']));
        });

        // ── writerdel ──────────────────────────────────────────────────────
        if (on('writerdel')) await step('writerdel', async () => {
            await signIn(page, rd2, {contextPath: t});
            const r = await reportComment(page, app, t, s1, X.C1, X.R1b, 'writerdel-rd2-report-again');
            st.r1b = r.id;
            saveState(app, st);
            log('R1b id', st.r1b, r.post.status);
            await signOut(page);
            await signIn(page, mgr, {contextPath: t});
            await dashboard();
            const tk0 = await readTasks(page, 'writerdel-mgr-tasks-before', {C1: X.C1, R1b: X.R1b});
            log('before writer delete mgr', tk0.about.C1.length, tk0.about.R1b.length);
            await signOut(page);
            await signIn(page, rd1, {contextPath: t});
            const d = await deleteOwnComment(page, app, t, s1, X.C1, 'writerdel-rd1-delete-c1');
            log('writer delete', d.del.status);
            await signOut(page);
            for (const [who, user] of [['mgr', mgr], ['ed', ed]]) {
                await signIn(page, user, {contextPath: t});
                await dashboard();
                const tk = await readTasks(page, `writerdel-${who}-tasks-after`, {C1: X.C1, R1b: X.R1b, R1: X.R1});
                log(`after writer delete ${who}`, tk.about.C1.length, tk.about.R1b.length, tk.countLine);
                if (who === 'mgr') await commentsPageWith(page, app, t, 'writerdel-mgr-commentspage', {C1: X.C1});
                await signOut(page);
            }
        });

        // ── moddel ─────────────────────────────────────────────────────────
        if (on('moddel')) await step('moddel', async () => {
            const c2 = st.s1.userComments[0].id;
            await signIn(page, mgr, {contextPath: t});
            const d = await deleteFromPanel(page, app, t, c2, 'moddel-mgr-delete-c2');
            log('moderator delete C2', d.resp.status, d.toast);
            await dashboard();
            const tk = await readTasks(page, 'moddel-mgr-tasks-after', {C2: X.C2, R2: X.R2});
            log('after moderator delete mgr', tk.about.C2.length, tk.about.R2.length, tk.countLine);
            await signOut(page);
            await signIn(page, ed, {contextPath: t});
            await dashboard();
            const tke = await readTasks(page, 'moddel-ed-tasks-after', {C2: X.C2, R2: X.R2});
            log('after moderator delete ed', tke.about.C2.length, tke.about.R2.length, tke.countLine);
            await signOut(page);
            await signIn(page, rd1, {contextPath: t});
            await landing(page, app, t, s1, 'moddel-rd1-landing');
            await page.goto(app.url(`/index.php/${t}/user/profile`));
            await idle(page);
            await snap(page, 'moddel-rd1-profile', {bell: await bellState(page)});
            await signOut(page);
            record('moddel-mail', await mailCounts(app, [mgr, ed, se, rd1, rd2, 'admin']));
        });

        // ── log ────────────────────────────────────────────────────────────
        if (on('log')) await step('log', async () => {
            await signIn(page, mgr, {contextPath: t});
            await gotoWorkflow(page, app, t, s1);
            await snap(page, 'log-mgr-s1-workflow', {headerButtons: (await page.locator('[data-cy="sidemodal-header"], header').getByRole('button').allInnerTexts().catch(() => [])).map((x) => x.trim()).filter(Boolean)});
            const lg = await readActivityLog(page, 'log-mgr-s1-activity-log');
            log('activity log rows', lg.rows.length, JSON.stringify(lg.rows.slice(0, 12)));
            await signOut(page);
        });

        // ── admin ──────────────────────────────────────────────────────────
        if (on('admin')) await step('admin', async () => {
            await signIn(page, 'admin', {contextPath: t});
            const rem = await endOwnManagerRole(page, app, t, 'admin');
            log('admin role removal', JSON.stringify({menu: rem.menu, rows: rem.roleRows, resp: rem.removeRoleResponse, after: rem.roleRowsAfter}));
            await signOut(page);
            await signIn(page, rd1, {contextPath: t});
            const w = await writeComment(page, app, t, s1, X.C3, 'admin-rd1-c3');
            st.c3 = w.id;
            saveState(app, st);
            await signOut(page);
            await signIn(page, 'admin', {contextPath: t});
            await dashboard();
            const tka = await readTasks(page, 'admin-norole-tasks', {C3: X.C3, C1: X.C1});
            log('admin no-manager tasks', tka.countLine, 'C3 rows', tka.about.C3.length, JSON.stringify(tka.rows.slice(0, 3).map((r) => [r.sentence.slice(0, 40), r.acronym, r.title && r.title.slice(0, 30)])));
            await signOut(page);
            await signIn(page, mgr, {contextPath: t});
            await dashboard();
            const tkm = await readTasks(page, 'admin-mgr-tasks-control', {C3: X.C3});
            log('mgr control C3 rows', tkm.about.C3.length);
            await signOut(page);
        });

        // ── unpub ──────────────────────────────────────────────────────────
        if (on('unpub')) await step('unpub', async () => {
            const {PublishScreen} = require('../../../../../apps/ojs/playwright/pages/PublishSchedulePages.js');
            await signIn(page, mgr, {contextPath: t});
            const pub = new PublishScreen(page, t);
            await pub.gotoWorkflow(s3);
            await snap(page, 'unpub-mgr-s3-workflow-before');
            await pub.unpublish();
            await snap(page, 'unpub-mgr-s3-workflow-unpublished', {status: await textOf(page.locator('[data-cy="workflow-controls-left"]'))});
            await commentsPageWith(page, app, t, 'unpub-mgr-commentspage', {S3A: X.S3A, S3P: X.S3P});
            await signOut(page);
            await landing(page, app, t, s3, 'unpub-anon-landing');
            await signIn(page, rd1, {contextPath: t});
            await landing(page, app, t, s3, 'unpub-rd1-landing');
            await signOut(page);
            await signIn(page, mgr, {contextPath: t});
            await pub.gotoWorkflow(s3);
            await pub.publish();
            await snap(page, 'unpub-mgr-s3-workflow-republished', {status: await textOf(page.locator('[data-cy="workflow-controls-left"]'))});
            await signOut(page);
            await landing(page, app, t, s3, 'unpub-anon-landing-republished');
            await signIn(page, rd2, {contextPath: t});
            await landing(page, app, t, s3, 'unpub-rd2-landing-republished');
            await signOut(page);
        });

        // ── delsub ─────────────────────────────────────────────────────────
        if (on('delsub')) await step('delsub', async () => {
            await signIn(page, mgr, {contextPath: t});
            await dashboard();
            const tk0 = await readTasks(page, 'delsub-mgr-tasks-before', {S2C: X.S2C, S2R: X.S2R});
            log('delsub before', tk0.about.S2C.length, tk0.about.S2R.length);
            await gotoWorkflow(page, app, t, s2);
            const actions = page.locator('[data-cy="workflow-action-items"]');
            const labels = async () => (await actions.getByRole('button').allInnerTexts().catch(() => [])).map((x) => x.trim()).filter(Boolean);
            const menuLinks = (await page.locator('[data-cy="sidemodal-header"] ~ * nav a, [role="dialog"] nav a').allInnerTexts().catch(() => [])).map((x) => x.replace(/\s+/g, ' ').trim()).filter(Boolean);
            let before = await snap(page, 'delsub-mgr-s2-workflow', {actionLabels: await labels(), menuLinks});
            let del = actions.getByRole('button', {name: 'Delete', exact: true});
            if (!(await del.count())) {
                // a published item opens on a Publication page; the stage screens carry the action buttons
                for (const stage of ['Production', 'Submission']) {
                    const link = page.getByRole('link', {name: stage, exact: true}).last();
                    if (!(await link.count())) continue;
                    await link.click();
                    await idle(page);
                    await sleep(500);
                    const l = await labels();
                    await snap(page, `delsub-mgr-s2-stage-${stage.toLowerCase()}`, {actionLabels: l});
                    if (l.includes('Delete')) break;
                }
                del = actions.getByRole('button', {name: 'Delete', exact: true});
            }
            if (!(await del.count())) {
                // unpublish first, then look again
                const {PublishScreen} = require('../../../../../apps/ojs/playwright/pages/PublishSchedulePages.js');
                const pub = new PublishScreen(page, t);
                await pub.gotoWorkflow(s2);
                await pub.unpublish();
                await snap(page, 'delsub-mgr-s2-unpublished', {actionLabels: await labels()});
                for (const stage of ['Production', 'Submission']) {
                    const link = page.getByRole('link', {name: stage, exact: true}).last();
                    if (!(await link.count())) continue;
                    await link.click();
                    await idle(page);
                    await sleep(500);
                    const l = await labels();
                    await snap(page, `delsub-mgr-s2-unpublished-stage-${stage.toLowerCase()}`, {actionLabels: l});
                    if (l.includes('Delete')) break;
                }
                del = actions.getByRole('button', {name: 'Delete', exact: true});
            }
            record('delsub-mgr-delete-offered', {offered: await del.count(), url: page.url()});
            if (await del.count()) {
                await del.click();
                const dlg = page.getByRole('dialog', {name: 'Delete', exact: true});
                await dlg.waitFor({timeout: T});
                await snap(page, 'delsub-mgr-s2-delete-dialog');
                const resp = await captureResponse(page, (r) => /\/api\/v1\/(_?submissions|submissions)\/\d+$/.test(r.url()) && r.request().method() !== 'GET', () => dlg.getByRole('button', {name: 'Confirm', exact: true}).click());
                await sleep(1500);
                await idle(page);
                await snap(page, 'delsub-mgr-after-delete', {request: resp});
                log('delete submission', resp.status, resp.url);
            }
            await commentsPageWith(page, app, t, 'delsub-mgr-commentspage', {S2C: X.S2C});
            await dashboard();
            const tk = await readTasks(page, 'delsub-mgr-tasks-after', {S2C: X.S2C, S2R: X.S2R});
            log('delsub after tasks', tk.about.S2C.length, tk.about.S2R.length);
            if (tk.about.S2C.length) {
                const p = await pressTask(page, 'delsub-mgr-press-dangling', X.S2C);
                log('dangling press', p.url, JSON.stringify(p.dialogs.map((d) => d.name || d.heading)), JSON.stringify((p.screen.text && p.screen.text.main || '').slice(0, 200)));
            }
            await signOut(page);
        });

        // ── mailctrl ───────────────────────────────────────────────────────
        if (on('mailctrl')) await step('mailctrl', async () => {
            await signIn(page, mgr, {contextPath: t});
            await page.goto(app.url(`/index.php/${t}/management/settings/access`));
            await idle(page);
            const table = page.locator('table').filter({hasText: rd2}).first();
            await table.waitFor({timeout: T});
            const row = table.locator('tr').filter({hasText: rd2}).first();
            await row.locator('button').last().click();
            await sleep(300);
            const items = (await page.getByRole('menuitem').allInnerTexts()).map((x) => x.trim());
            record('mailctrl-row-menu', {items});
            await page.getByRole('menuitem', {name: /^Email$/}).first().click();
            const dlg = page.locator('[role="dialog"]:visible').last();
            await dlg.waitFor({timeout: T});
            await idle(page);
            await sleep(800);
            await snap(page, 'mailctrl-mgr-email-dialog');
            const subject = dlg.getByRole('textbox', {name: /subject/i}).first();
            if (await subject.count()) await subject.fill('K4 mail control');
            // the message body: a TinyMCE editor
            const iframe = dlg.locator('iframe').first();
            if (await iframe.count()) {
                const frame = await (await iframe.elementHandle()).contentFrame();
                await frame.locator('body').fill('K4 mail control body.').catch(async () => { await frame.locator('body').click(); await page.keyboard.type('K4 mail control body.'); });
            } else {
                const body = dlg.getByRole('textbox').last();
                await body.fill('K4 mail control body.').catch(() => {});
            }
            const sent = await captureResponse(page, (r) => r.request().method() === 'POST' && /email|Email|sendEmail|mail/.test(r.url()), () => dlg.getByRole('button', {name: /^(Send|Send Email|Submit)$/}).first().click(), 15_000);
            await sleep(1000);
            record('mailctrl-sent', {request: sent, dialogsVisible: await page.locator('[role="dialog"]:visible').count()});
            const found = await app.mail.find({to: `${rd2}@mail.test`, contains: 'K4 mail control', timeoutMs: 20_000}).catch((e) => ({error: String(e).slice(0, 120)}));
            record('mailctrl-found', {found: found && !found.error ? {id: found.ID || found.id, subject: found.Subject || found.subject} : found});
            log('mail control', JSON.stringify(sent.status), found && found.error ? found.error : 'found');
            await signOut(page);
        });

        // ── deluser ────────────────────────────────────────────────────────
        if (on('deluser')) await step('deluser', async () => {
            await signIn(page, mgr, {contextPath: t});
            await commentsPageWith(page, app, t, 'deluser-mgr-commentspage-before', {S4A: X.S4A, S4B: X.S4B});
            await page.goto(app.url(`/index.php/${t}/management/settings/access`));
            await idle(page);
            const table = page.locator('table').filter({hasText: rd3}).first();
            await table.waitFor({timeout: T});
            const row = table.locator('tr').filter({hasText: rd3}).first();
            await row.locator('button').last().click();
            await sleep(300);
            const items = (await page.getByRole('menuitem').allInnerTexts()).map((x) => x.trim());
            await snap(page, 'deluser-mgr-rd3-row-menu', {items});
            await loc(page, 'a user row\'s menu items', page.getByRole('menuitem'));
            // Remove User
            const remove = page.getByRole('menuitem', {name: /^Remove User$/});
            if (await remove.count()) {
                await remove.click();
                const dlg = page.locator('[role="dialog"]:visible').last();
                await dlg.waitFor({timeout: T});
                await snap(page, 'deluser-mgr-remove-dialog');
                const confirmBtn = dlg.getByRole('button', {name: /^(Remove User|Remove|Confirm|OK|Yes)$/}).first();
                const resp = await captureResponse(page, (r) => r.request().method() === 'POST' && /\/api\/v1\//.test(r.url()), () => confirmBtn.click(), 15_000);
                await sleep(1000);
                await idle(page);
                await snap(page, 'deluser-mgr-after-remove', {request: resp, rd3Rows: await page.locator('table tr').filter({hasText: rd3}).count()});
                log('remove user', resp.status, resp.url);
                await commentsPageWith(page, app, t, 'deluser-mgr-commentspage-after-remove', {S4A: X.S4A, S4B: X.S4B, S4AR: X.S4AR, S4BR: X.S4BR});
                await gotoComments(page, app, t, `?commentId=${st.s4.userComments[1].id}`);
                await commentDialog(page).waitFor({timeout: T}).catch(() => {});
                await idle(page);
                await snap(page, 'deluser-mgr-s4b-panel-after-remove');
            } else {
                await page.keyboard.press('Escape');
            }
            // Merge User (the account's deletion through the screens), if offered
            await page.goto(app.url(`/index.php/${t}/management/settings/access`));
            await idle(page);
            const t2 = page.locator('table').filter({hasText: rd3}).first();
            const stillListed = await t2.count();
            record('deluser-rd3-listed-after-remove', {stillListed});
            if (stillListed) {
                const row2 = t2.locator('tr').filter({hasText: rd3}).first();
                await row2.locator('button').last().click();
                await sleep(300);
                const items2 = (await page.getByRole('menuitem').allInnerTexts()).map((x) => x.trim());
                await snap(page, 'deluser-mgr-rd3-row-menu-after-remove', {items: items2});
                const merge = page.getByRole('menuitem', {name: /Merge/i});
                if (await merge.count()) {
                    await merge.click();
                    await idle(page);
                    await sleep(800);
                    await snap(page, 'deluser-mgr-merge-step1');
                    // the merge asks for the user to merge into: rd2's row › Merge
                    const t3 = page.locator('table').filter({hasText: rd2}).first();
                    const row3 = t3.locator('tr').filter({hasText: rd2}).first();
                    if (await row3.count()) {
                        await row3.locator('button').last().click();
                        await sleep(300);
                        const items3 = (await page.getByRole('menuitem').allInnerTexts()).map((x) => x.trim());
                        await snap(page, 'deluser-mgr-merge-step2-menu', {items: items3});
                        const into = page.getByRole('menuitem', {name: /Merge/i});
                        if (await into.count()) {
                            await into.click();
                            const dlg = page.locator('[role="dialog"]:visible').last();
                            await dlg.waitFor({timeout: 10_000}).catch(() => {});
                            await snap(page, 'deluser-mgr-merge-dialog');
                            const btn = dlg.getByRole('button', {name: /^(Merge|Merge Users|Merge User|Confirm|OK|Yes)$/}).first();
                            const resp = await captureResponse(page, (r) => r.request().method() === 'POST' && /\/api\/v1\/|merge/i.test(r.url()), () => btn.click(), 15_000);
                            await sleep(1500);
                            await idle(page);
                            await snap(page, 'deluser-mgr-after-merge', {request: resp, rd3Rows: await page.locator('table tr').filter({hasText: rd3}).count()});
                            log('merge', resp.status, resp.url);
                        }
                    }
                } else {
                    await page.keyboard.press('Escape');
                }
            }
            await commentsPageWith(page, app, t, 'deluser-mgr-commentspage-after-merge', {S4A: X.S4A, S4B: X.S4B, S4AR: X.S4AR, S4BR: X.S4BR});
            await gotoComments(page, app, t, `?commentId=${st.s4.userComments[1].id}`);
            await commentDialog(page).waitFor({timeout: T}).catch(() => {});
            await idle(page);
            await snap(page, 'deluser-mgr-s4b-panel-after-merge');
            await dashboard();
            const tk = await readTasks(page, 'deluser-mgr-tasks-after', {S4A: X.S4A, S4AR: X.S4AR, S4BR: X.S4BR});
            log('deluser tasks', tk.about.S4A.length, tk.about.S4AR.length, tk.about.S4BR.length);
            await signOut(page);
            await landing(page, app, t, s4, 'deluser-anon-landing-after');
        });

        // ── leave ──────────────────────────────────────────────────────────
        if (on('leave')) await step('leave', async () => {
            await signIn(page, mgr, {contextPath: t});
            await dashboard();
            await openTasks(page);
            const box = dialog(page).locator('tr.gridRow input[type=checkbox]').first();
            await box.setChecked(true);
            const s0 = await snap(page, 'leave-mgr-tasks-ticked', {checked: await box.isChecked()});
            await closeTasks(page);
            await sleep(500);
            const dialogsAfterClose = await page.locator('[role="dialog"]:visible').count();
            await openTasks(page);
            const s1v = await snap(page, 'leave-mgr-tasks-reopened', {firstBoxChecked: await dialog(page).locator('tr.gridRow input[type=checkbox]').first().isChecked(), dialogsAfterClose});
            await closeTasks(page);
            // leave the page with a box ticked (navigation)
            await openTasks(page);
            await dialog(page).locator('tr.gridRow input[type=checkbox]').first().setChecked(true);
            await page.goto(app.url(`/index.php/${t}/management/settings/userComments`));
            await tableSettled(page);
            await snap(page, 'leave-mgr-navigated-away', {dialogsVisible: await page.locator('[role="dialog"]:visible').count()});
            await signOut(page);
        });

        // ── mail ───────────────────────────────────────────────────────────
        if (on('mail')) await step('mail', async () => {
            const counts = await mailCounts(app, [mgr, ed, se, rd1, rd2, rd3, 'admin']);
            record('mail-final', {baseline: st.mailBaseline, final: counts});
            log('mail final', JSON.stringify(counts));
        });
    } finally {
        await close();
    }
});

// ---------------------------------------------------------------------------
// Second pass (OJS): the republish, the delete-through-decline path and the
// account's merge, phases `repub`, `decline`, `merge`. Run with PHASES=repub,…
// (the first pass's state file is reused).
if (PHASES.some((p) => SECOND.includes(p))) {
    firstPass.then(() => forEachApp(async (app) => {
        if (app.name !== 'ojs') return;
        const st = loadState(app);
        const t = st.ctx; const X = st.texts;
        const mgr = `${t}mgr`, ed = `${t}ed`, rd2 = `${t}rd2`, rd3 = `${t}rd3`;
        const s2 = st.s2.submissionId, s3 = st.s3.submissionId, s4 = st.s4.submissionId;
        const {page, close} = await launch(app);
        page.on('dialog', (d) => { log('browser dialog', d.type(), d.message()); d.accept().catch(() => {}); });
        const dashboard = async () => { await page.goto(app.url(`/index.php/${t}/submissions`)); await idle(page); };
        const {PublishScreen} = require('../../../../../apps/ojs/playwright/pages/PublishSchedulePages.js');
        const {DecisionPage} = require('../../../../../apps/ojs/playwright/pages/ReviewStagePages.js');
        try {
            // ── repub: S3 published again ──────────────────────────────────
            if (on('repub')) await step('repub', async () => {
                await signIn(page, mgr, {contextPath: t});
                const pub = new PublishScreen(page, t);
                await pub.gotoWorkflow(s3);
                await pub.openVersionEntry('Version of Record 1.0', 'Title & Abstract');
                await snap(page, 'repub-mgr-s3-before', {status: await textOf(page.locator('[data-cy="workflow-controls-left"]')), right: (await page.locator('[data-cy="workflow-controls-right"]').getByRole('button').allInnerTexts().catch(() => [])).map((x) => x.trim())});
                await pub.publish();
                await snap(page, 'repub-mgr-s3-republished', {status: await textOf(page.locator('[data-cy="workflow-controls-left"]'))});
                await commentsPageWith(page, app, t, 'repub-mgr-commentspage', {S3A: X.S3A, S3P: X.S3P});
                await signOut(page);
                await landing(page, app, t, s3, 'repub-anon-landing');
                await signIn(page, rd2, {contextPath: t});
                await landing(page, app, t, s3, 'repub-rd2-landing');
                await signOut(page);
            });

            // ── decline: S2 declined at the Submission stage, then "Delete" ──
            if (on('decline')) await step('decline', async () => {
                await signIn(page, mgr, {contextPath: t});
                await gotoWorkflow(page, app, t, s2);
                await page.getByRole('link', {name: 'Submission', exact: true}).last().click();
                await idle(page);
                await sleep(500);
                const actions = page.locator('[data-cy="workflow-action-items"]');
                const labels = async () => (await actions.getByRole('button').allInnerTexts().catch(() => [])).map((x) => x.trim()).filter(Boolean);
                await snap(page, 'decline-mgr-s2-submission-stage', {actionLabels: await labels()});
                await actions.getByRole('button', {name: 'Decline Submission', exact: true}).click();
                const decision = new DecisionPage(page);
                await decision.expectOpen('Decline Submission');
                await snap(page, 'decline-mgr-s2-wizard');
                await decision.completeAll();
                await idle(page);
                await sleep(800);
                const afterLabels = await labels();
                await snap(page, 'decline-mgr-s2-declined', {actionLabels: afterLabels});
                log('declined; actions', JSON.stringify(afterLabels));
                const del = actions.getByRole('button', {name: 'Delete', exact: true});
                record('decline-mgr-delete-offered', {offered: await del.count(), url: page.url()});
                if (await del.count()) {
                    await del.click();
                    const dlg = page.getByRole('dialog', {name: 'Delete', exact: true});
                    await dlg.waitFor({timeout: T});
                    await snap(page, 'decline-mgr-s2-delete-dialog');
                    const resp = await captureResponse(page, (r) => r.request().method() !== 'GET' && /submissions\/\d+|\$\$\$call\$\$\$/.test(r.url()) && !/\/_submissions/.test(r.url()), () => dlg.getByRole('button', {name: 'Confirm', exact: true}).click(), 20_000);
                    await sleep(1500);
                    await idle(page);
                    await snap(page, 'decline-mgr-after-delete', {request: resp, panelOpen: await page.locator('[data-cy="sidemodal-header"]').count()});
                    log('delete submission', resp.status, resp.url);
                }
                await commentsPageWith(page, app, t, 'decline-mgr-commentspage-after-delete', {S2C: X.S2C});
                await gotoComments(page, app, t);
                await clickTab(page, 'Reported');
                await snap(page, 'decline-mgr-commentspage-reported-tab', {rows: await allRows(page)});
                await dashboard();
                const tk = await readTasks(page, 'decline-mgr-tasks-after-delete', {S2C: X.S2C, S2R: X.S2R});
                log('after submission delete tasks', tk.about.S2C.length, tk.about.S2R.length, tk.countLine);
                if (tk.about.S2C.length) {
                    const p = await pressTask(page, 'decline-mgr-press-dangling-comment', X.S2C);
                    log('dangling comment press', p.url, JSON.stringify(p.dialogs.map((d) => d.heading)), (p.screen.text && p.screen.text.main || '').slice(0, 150).replace(/\n/g, ' | '));
                    await dashboard();
                }
                if (tk.about.S2R.length) {
                    const p = await pressTask(page, 'decline-mgr-press-dangling-report', X.S2R);
                    log('dangling report press', p.url, JSON.stringify(p.dialogs.map((d) => d.heading)));
                    await dashboard();
                }
                const tk2 = await readTasks(page, 'decline-mgr-tasks-after-press', {S2C: X.S2C, S2R: X.S2R});
                log('tasks after pressing dangling', tk2.about.S2C.length, tk2.about.S2R.length);
                await signOut(page);
                await signIn(page, ed, {contextPath: t});
                await dashboard();
                const tke = await readTasks(page, 'decline-ed-tasks-after-delete', {S2C: X.S2C, S2R: X.S2R});
                log('ed tasks after submission delete', tke.about.S2C.length, tke.about.S2R.length);
                await signOut(page);
            });

            // ── merge: rd3 merged into rd2 (the account's deletion through the screens) ──
            if (on('merge')) await step('merge', async () => {
                await signIn(page, mgr, {contextPath: t});
                await page.goto(app.url(`/index.php/${t}/management/settings/access`));
                await idle(page);
                const table = page.locator('table').filter({hasText: rd3}).first();
                await table.waitFor({timeout: T});
                const row = table.locator('tr').filter({hasText: rd3}).first();
                await row.locator('button').last().click();
                await sleep(300);
                await page.getByRole('menuitem', {name: /Merge/i}).click();
                const dlg = page.getByRole('dialog', {name: 'Merge user'});
                await dlg.waitFor({timeout: T});
                await idle(page);
                await sleep(800);
                await snap(page, 'merge-mgr-dialog', {intro: await textOf(dlg.locator('p').first())});
                const target = dlg.getByRole('row').filter({hasText: rd2}).first();
                await target.getByRole('link', {name: 'Settings'}).click();
                await sleep(500);
                const controls = target.locator('xpath=following-sibling::tr[1]');
                const links = (await controls.getByRole('link').allInnerTexts().catch(() => [])).map((x) => x.trim()).filter(Boolean);
                await snap(page, 'merge-mgr-dialog-row-controls', {links});
                await loc(page, 'the merge dialog\'s row action (after "Settings")', controls.getByRole('link'));
                const act = controls.getByRole('link', {name: /Merge/i}).first();
                if (await act.count()) {
                    await act.click();
                    await sleep(600);
                    const confirm = page.locator('[role="dialog"]:visible').last();
                    await snap(page, 'merge-mgr-confirm', {dialogText: (await confirm.innerText().catch(() => '')).slice(0, 500)});
                    const btn = confirm.getByRole('button', {name: /^(OK|Yes|Merge|Confirm)$/}).first();
                    const resp = await captureResponse(page, (r) => r.request().method() !== 'GET' && /merge/i.test(r.url()), () => btn.click(), 20_000);
                    await sleep(1500);
                    await idle(page);
                    await snap(page, 'merge-mgr-after', {request: resp, rd3Rows: await page.locator('table tr').filter({hasText: rd3}).count(), notices: (await page.locator('[role="alert"], .pkpNotification').allInnerTexts().catch(() => [])).map((x) => x.trim())});
                    log('merge', resp.status, resp.url);
                }
                await page.goto(app.url(`/index.php/${t}/management/settings/access`));
                await idle(page);
                await snap(page, 'merge-mgr-users-after', {rd3Rows: await page.locator('table tr').filter({hasText: rd3}).count(), rd2Rows: await page.locator('table tr').filter({hasText: rd2}).count()});
                await commentsPageWith(page, app, t, 'merge-mgr-commentspage-after', {S4A: X.S4A, S4B: X.S4B});
                for (const [k, i] of [['s4a', 0], ['s4b', 1]]) {
                    await gotoComments(page, app, t, `?commentId=${st.s4.userComments[i].id}`);
                    await commentDialog(page).waitFor({timeout: 15_000}).catch(() => {});
                    await idle(page);
                    await sleep(500);
                    await snap(page, `merge-mgr-${k}-panel-after`);
                }
                await dashboard();
                const tk = await readTasks(page, 'merge-mgr-tasks-after', {S4A: X.S4A, S4AR: X.S4AR, S4BR: X.S4BR});
                log('merge tasks', tk.about.S4A.length, tk.about.S4AR.length, tk.about.S4BR.length);
                await signOut(page);
                await landing(page, app, t, s4, 'merge-anon-landing-after');
                await signIn(page, rd2, {contextPath: t});
                await landing(page, app, t, s4, 'merge-rd2-landing-after');
                await signOut(page);
            });
        } finally { await close(); }
    }));
}

// ---------------------------------------------------------------------------
// Third pass (OJS): the dangling tasks left by a submission's deletion and an
// account's merge (`dangling`), and the seeded journal read-only (`seeded`).
if (PHASES.some((p) => ['dangling', 'seeded'].includes(p))) {
    firstPass.then(() => forEachApp(async (app) => {
        if (app.name !== 'ojs') return;
        const st = loadState(app);
        const t = st.ctx;
        const mgr = `${t}mgr`;
        const {page, close} = await launch(app);
        const dashboard = async () => { await page.goto(app.url(`/index.php/${t}/submissions`)); await idle(page); };
        try {
            if (on('dangling')) await step('dangling', async () => {
                await signIn(page, mgr, {contextPath: t});
                await dashboard();
                await openTasks(page);
                const rows = (await taskRows(page)).rows;
                const blank = rows.filter((r) => !r.title);
                record('dangling-mgr-rows', {count: rows.length, blank: blank.map((r) => ({sentence: r.sentence, rowText: r.rowText, href: r.href, unread: r.unread}))});
                log('blank-title rows', blank.length, JSON.stringify(blank.map((r) => r.sentence.slice(0, 20))));
                await snap(page, 'dangling-mgr-tasks');
                await closeTasks(page);
                for (const [kind, sentence] of [['comment', COMMENT_TASK], ['report', REPORT_TASK]]) {
                    await dashboard();
                    await openTasks(page);
                    const row = dialog(page).locator('tr.gridRow').filter({has: page.locator('span.message', {hasText: sentence})}).filter({hasNot: page.locator('span.submission:not(:empty)')}).first();
                    const n = await row.count();
                    log('dangling', kind, 'rows', n);
                    if (!n) { await closeTasks(page); continue; }
                    const href = await row.locator('a').first().getAttribute('href');
                    await row.locator('a').first().click();
                    await page.waitForURL(/userComments/, {timeout: T}).catch(() => {});
                    await idle(page);
                    await page.locator('[role="dialog"]:visible').first().waitFor({timeout: 10_000}).catch(() => {});
                    await sleep(1000);
                    const dialogs = [];
                    for (const d of await page.locator('[role="dialog"]:visible').all()) dialogs.push({heading: await textOf(d.getByRole('heading').first()), text: (await d.innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 300), buttons: (await d.getByRole('button').allInnerTexts().catch(() => [])).map((x) => x.trim())});
                    const s = await snap(page, `dangling-mgr-press-${kind}`, {href: href && href.replace(/^.*\/index\.php/, ''), url: page.url(), dialogs});
                    log('dangling press', kind, page.url().replace(/^.*\/index\.php/, ''), JSON.stringify(dialogs.map((d) => [d.heading, d.text.slice(0, 80)])));
                    // dismiss an Error dialog, then read the page behind
                    const err = page.getByRole('dialog', {name: 'Error'});
                    if (await err.count()) { await err.getByRole('button', {name: 'OK', exact: true}).click().catch(() => {}); await sleep(500); await snap(page, `dangling-mgr-press-${kind}-behind`, {dialogsVisible: await page.locator('[role="dialog"]:visible').count()}); }
                }
                await dashboard();
                const after = await taskRows(page.locator('body').count() ? page : page);
                await openTasks(page);
                const rows2 = (await taskRows(page)).rows;
                record('dangling-mgr-rows-after-press', {count: rows2.length, blank: rows2.filter((r) => !r.title).map((r) => ({sentence: r.sentence.slice(0, 30), unread: r.unread}))});
                await closeTasks(page);
                void after;
                note('ccK4: [ojs] Tasks panel: a comment/report task row is `tr.gridRow` with `span.message` (the sentence) and `span.submission` (the comment text / report reason, Str::limit 200 + "..."); its link is `…/task-notifications-grid/mark-read?redirect=1&selectedElements[]=<id>` (marks read, then redirects to management/settings/userComments?commentId=N[&reportId=R]); after the comment is gone with its submission (Decline → Delete) or its writer (Merge user), the row stays with an EMPTY `span.submission`, so a `filter({hasText})` on the comment text misses it.');
                note('ccK4: [ojs] Deleting a submission through the screens on this build: no "Delete" on any stage of a published or unpublished submission; Submission stage › "Decline Submission" wizard (DecisionPage.completeAll) then the stage offers "Schedule For Publication, Revert Decline, Delete"; the "Delete" dialog\'s Confirm answers no /api/ request (a $$$call$$$ one), so bound the waitForResponse. Users & Roles › a user row menu: Edit, Email, Login As, Remove User, Disable User, Merge user; "Remove User" = unenrol (dialog "Remove this user from this journal?…", OK), the row stays listed with no roles; "Merge user" opens a legacy grid dialog "Merge user" whose rows carry a "Settings" show_extras link revealing "Merge into this User" in the next tr, then a "Confirm" dialog with OK (POST …/user-grid/merge-users?oldUserId&newUserId 200).');
                note('ccK4: [ojs] Comments page panels opened by address have NO aria-label (dialogs[].name null); K3\'s getByRole("dialog", {name: /^View comment details by/}) still matches (the heading names it). The Users & Roles row "Email" opens a Vue dialog "Email" (Subject*, To, Body*, "Send Email") whose POST is …/user-grid/send-email 200 and the mail lands in Mailpit within seconds: a cheap positive control for a no-email claim.');
                await signOut(page);
            });
            if (on('seeded')) await step('seeded', async () => {
                await signIn(page, 'manager.maya');
                await page.goto(app.url(`/index.php/${app.contextPath}/management/settings/website`));
                await idle(page);
                await page.getByRole('tab', {name: 'Content', exact: true}).first().click().catch(() => {});
                await sleep(500);
                const box = page.getByRole('checkbox', {name: 'Enable Public Comments'});
                await box.waitFor({timeout: 15_000}).catch(() => {});
                await snap(page, 'seeded-maya-website-comments', {boxCount: await box.count(), checked: (await box.count()) ? await box.isChecked() : null});
                await signOut(page);
                for (const [name, p] of [['archive', 'issue/archive'], ['current', 'issue/current'], ['index', '']]) {
                    const resp = await page.goto(app.url(`/index.php/${app.contextPath}/${p}`)).catch(() => null);
                    await idle(page);
                    await snap(page, `seeded-anon-${name}`, {httpStatus: resp ? resp.status() : null, articleLinks: await page.locator('a[href*="/article/view/"]').count()});
                }
            });
        } finally { await close(); }
    }));
}
