// Helpers for walk.js (U12 A20: an announcement added through the REST API
// without `sendEmail` logs a PHP warning). Requiring this file runs nothing.
const {idle} = require('../../../probe');

const T = 30_000;
const BOX = 'Send an email about this to all registered users.';
const flat = (s, n = 300) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));
const rel = (u) => String(u).replace(/^https?:\/\/[^/]+/, '');
const list = (page) => page.locator('main .listPanel').first();

/** Settings › Website › Setup › "Announcements": tick "Enable announcements", "Save". */
async function enableAnnouncements(app, page) {
    await page.goto(app.url(`/index.php/${app.contextPath}/en/management/settings/website`));
    await idle(page).catch(() => {});
    const setupTab = page.locator('#setup-button').first();
    await setupTab.waitFor({state: 'visible', timeout: T});
    if ((await setupTab.getAttribute('aria-selected')) !== 'true') await setupTab.click();
    await page.locator('#setup').first().getByRole('tab', {name: 'Announcements', exact: true}).click();
    const panel = page.locator('#setup').first().locator('[role="tabpanel"]:visible').first();
    const box = panel.getByRole('checkbox', {name: 'Enable announcements', exact: true});
    await box.waitFor({state: 'visible', timeout: T});
    const before = await box.isChecked();
    await box.check();
    await panel.getByRole('button', {name: 'Save', exact: true}).click();
    const saved = await panel.locator('[role="status"]').filter({hasText: 'Saved'}).first()
        .waitFor({state: 'visible', timeout: T}).then(() => true, () => false);
    return {tickedBefore: before, saved};
}

/** The side menu's "Announcements" (the address when no entry is found, and says so). */
async function openAnnouncements(app, page) {
    await page.goto(app.url(`/index.php/${app.contextPath}/en/dashboard/editorial`));
    await idle(page).catch(() => {});
    const nav = page.getByRole('navigation', {name: 'Site Navigation'});
    const entry = nav.locator('[aria-label="Announcements"], a, [role="button"]').filter({hasText: /^\s*Announcements\s*$/}).first();
    let via = 'side menu';
    if (await entry.isVisible().catch(() => false)) {
        await entry.click();
        await page.waitForURL(/\/management\/settings\/announcements/, {timeout: T, waitUntil: 'commit'});
    } else {
        via = 'address (no side menu entry found)';
        await page.goto(app.url(`/index.php/${app.contextPath}/en/management/settings/announcements`));
    }
    await idle(page).catch(() => {});
    await list(page).waitFor({state: 'visible', timeout: T});
    return {via, url: rel(page.url())};
}

/** The console request of the Steps: POST announcements, with or without `sendEmail`. */
async function apiAdd(page, {title, sendEmail}) {
    return page.evaluate(async ({title, sendEmail}) => {
        const body = {title: {en: title}, descriptionShort: {en: '<p>Submissions are open.</p>'}, description: {en: '<p>Submissions are open until 1 June.</p>'}};
        if (sendEmail !== undefined) body.sendEmail = sendEmail;
        const r = await fetch(pkp.context.apiBaseUrl + 'announcements', {method: 'POST', headers: {'Content-Type': 'application/json', 'X-Csrf-Token': pkp.currentUser.csrfToken}, body: JSON.stringify(body)});
        const text = await r.text();
        let json = null;
        try { json = JSON.parse(text); } catch (e) { /* not JSON */ }
        return {status: r.status, id: json && json.id, title: json && json.title, answer: json ? null : text.slice(0, 600)};
    }, {title, sendEmail});
}

/** "Add Announcement": title, the box ticked or left alone, "Save". Returns the save and what it posted. */
async function screenAdd(page, {title, tick}) {
    await list(page).getByRole('button', {name: 'Add Announcement', exact: true}).click();
    const dialog = page.getByRole('dialog', {name: 'Add Announcement'});
    const save = dialog.getByRole('button', {name: 'Save', exact: true});
    await save.waitFor({state: 'visible', timeout: T});
    await dialog.locator('input[name="title-en"]').fill(title);
    const box = dialog.getByRole('checkbox', {name: BOX, exact: true});
    const out = {title, boxOffered: await box.isVisible().catch(() => false)};
    if (tick && out.boxOffered) await box.check();
    out.ticked = out.boxOffered ? await box.isChecked() : null;
    const [r] = await Promise.all([
        page.waitForResponse((x) => /\/api\/v1\/announcements$/.test(new URL(x.url()).pathname) && x.request().method() === 'POST', {timeout: T}).catch(() => null),
        save.click(),
    ]);
    out.status = r ? r.status() : null;
    if (r) {
        const raw = r.request().postData() || '';
        let sent;
        try { sent = JSON.parse(raw).sendEmail; } catch (e) { sent = (raw.match(/sendEmail[^&]*/) || [null])[0]; }
        out.sendEmailPosted = sent === undefined ? '(absent)' : sent;
        try { out.id = (await r.json()).id; } catch (e) { out.id = null; }
    }
    await dialog.waitFor({state: 'detached', timeout: T}).catch(() => {});
    await idle(page).catch(() => {});
    return out;
}

/** The list's titles. */
async function titles(page) {
    return list(page).locator('.listPanel__itemTitle').allInnerTexts().then((a) => a.map((s) => flat(s)));
}

/** Messages on the slot's Mailpit with exactly this subject to a dataset address, since `since`. */
async function mails(app, subject, since) {
    const q = encodeURIComponent(`to:"@mailinator.com" subject:"${subject}"`);
    const res = await fetch(`${app.mailpitUrl.replace(/\/$/, '')}/api/v1/search?query=${q}&limit=1000`);
    const j = await res.json();
    const from = new Date(since).getTime();
    const msgs = (j.messages || []).filter((m) => m.Subject === subject && new Date(m.Created).getTime() >= from);
    const to = msgs.flatMap((m) => (m.To || []).map((t) => t.Address)).sort();
    return {count: msgs.length, to};
}

/** Let the dataset's job runner (`job_runner = On`) work: load the dashboard until `subject`'s mail count holds. */
async function pumpRunner(app, page, {subject, since, loads = 8}) {
    let last = -1, n = 0, i = 0;
    for (; i < loads; i++) {
        await page.goto(app.url(`/index.php/${app.contextPath}/en/dashboard/editorial`));
        await idle(page).catch(() => {});
        await page.waitForTimeout(1500);
        n = (await mails(app, subject, since)).count;
        if (n > 0 && n === last) { i++; break; }
        last = n;
    }
    return {loads: i, count: n};
}

module.exports = {BOX, flat, rel, enableAnnouncements, openAnnouncements, apiAdd, screenAdd, titles, mails, pumpRunner};
