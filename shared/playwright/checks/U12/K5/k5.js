// U12 claim check, chunk K5: being told about a new announcement (the in-app
// notification, the "New Announcement" email, the queue, the Notifications tab's
// row, "Live at once") and the OJS announcement feed (the plugin's settings
// window, the Atom / RSS 2.0 / RSS 1.0 feeds, the sidebar block, the feeds with
// announcements off and with the plugin off), on all three apps (the feed on OJS,
// with a read-only control on OMP and OPS).
// Spec: docs/specs/U12-announcements.md — Actors rows 6–7 (44–45), the feed
// settings window (85–92), Rules 17–18 (241–260), Side effects (261–283),
// Settings bullets 8–10 (320–336), Coverage (373–413); register A7 (495–502);
// K2's declared lines 153 ("and the feed") and 217–218 (the email's language);
// footnotes f, g, o, k, h, r, f-a7.
//
// Seeds per app: A (announcements on, four throwaway users at every permission
// level, one type, three seeded announcements of which one expired; on OJS the
// feed plugin on and its block in the sidebar), F (French primary locale, for the
// email's language); on OJS also B (announcements OFF, plugin on, block placed)
// and C (announcements on, plugin left as installed). Phases:
//   seed     the contexts (state file reused later; RESEED=1 to seed again)
//   tab      Profile › Notifications: the row's defaults as the reader; the author
//            unticks "Enable…", the section editor ticks "Do not send me an email…";
//            two visitors register with the consent box ticked / unticked
//   add      the manager adds "Call for papers" with "Send Email" ticked: the
//            queue before/after, the public list before the queue ran (Rule 17),
//            the drain, who got the email and its text; "Quiet notice" with the
//            box unticked (no email); the oldest edited (its place and date);
//            an edit with the box ticked (nothing)
//   told     the recipients' screens after the drain: toasts, the Tasks bell and
//            panel, the front page
//   emails   Settings › Workflow › Emails › the "New Announcement" template
//   french   context F: an announcement added with the box ticked; the email's
//            language
//   feed     OJS: the block and the feeds on A (as found, then the settings window
//            driven: Cancel, the "Limit feed to" box at both ends, the three
//            "Display feed links…" choices), B (announcements off), C (plugin off,
//            then ticked, then unticked), the Sidebar list; OMP/OPS: the feed
//            addresses, the Plugins grid and the Sidebar list as read-only controls
// Run: PROBE_FEATURE=U12 PROBE_AGENT=ccK5 node bin/probe.js all shared/playwright/checks/U12/K5/k5.js
//   PHASES=seed,tab,… (default: all)
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, signOut, screen, shot, record, loc, note, idle, tag, outDir} =
    require('../../../probe');
const {execFileSync} = require('child_process');

const ALL_PHASES = ['seed', 'tab', 'add', 'told', 'emails', 'french', 'feed'];   // feed = feedA (A, the window, B) + feedC (C); PHASES=feedC reruns C alone
const PHASES = process.env.PHASES ? process.env.PHASES.split(',') : ALL_PHASES;
const on = (p) => PHASES.includes(p);
const log = (...a) => console.log('[k5]', ...a);
const stateFile = (app) => path.join(outDir(), `k5-state-${app.name}.json`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const T = 20_000;
const ymd = (d) => d.toISOString().slice(0, 10);
const dayOffset = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return ymd(d); };

// ---------------------------------------------------------------------------
// Reading helpers

const ctxUrl = (app, ctxPath, p = '', locale = '') => app.url(`/index.php/${ctxPath}${locale ? '/' + locale : ''}${p}`);
const dialog = (page) => page.locator('[role="dialog"]:visible').last();

async function snap(page, name, extra = {}) {
    const s = await screen(page);
    record(name, {...s, ...extra});
    await shot(page, name).catch(() => {});
    return s;
}

/** The Announcements page's list panel as data. */
async function listState(page) {
    const panel = page.locator('main .listPanel').first();
    if (!(await panel.count().catch(() => 0))) return {present: false};
    return panel.evaluate((root) => ({
        rows: [...root.querySelectorAll('.listPanel__item')].map((li) => ({
            title: li.querySelector('.listPanel__itemTitle')?.innerText.trim() ?? null,
            text: li.innerText.replace(/\s+/g, ' ').trim(),
            viewHref: li.querySelector('a')?.getAttribute('href') ?? null,
        })),
        empty: root.querySelector('.listPanel__empty')?.innerText.trim() ?? null,
    })).catch((e) => ({error: String(e.message || e)}));
}
const rowId = (ls, title) => { const r = (ls.rows || []).find((x) => x.title === title); const m = r && r.viewHref && r.viewHref.match(/announcement\/view\/(\d+)/); return m ? Number(m[1]) : null; };

/** The side panel's form as data (labels, inputs, footer). */
async function formState(page) {
    const d = dialog(page);
    if ((await d.count()) === 0) return {open: false};
    return d.evaluate((root) => {
        const txt = (el) => (el ? el.innerText.replace(/\s+/g, ' ').trim() : null);
        return {
            open: true,
            heading: txt(root.querySelector('h1, h2')),
            locales: [...root.querySelectorAll('.pkpFormLocales .pkpFormLocales__locale')].map((l) => ({text: txt(l), active: l.classList.contains('pkpFormLocales__locale--isActive'), primary: l.classList.contains('pkpFormLocales__locale--isPrimary')})),
            fields: [...root.querySelectorAll('.pkpFormField')].map((f) => ({
                label: txt(f.querySelector('.pkpFormFieldLabel, legend, .pkpFormField__heading')),
                visible: f.offsetParent !== null,
                error: txt(f.querySelector('.pkpFieldError')),
                inputs: [...f.querySelectorAll('input:not([type=hidden])')].map((i) => ({type: i.type, name: i.name, value: i.type === 'file' ? null : i.value, checked: i.checked, label: i.id && f.querySelector(`label[for="${i.id}"]`) ? txt(f.querySelector(`label[for="${i.id}"]`)) : (i.closest('label') ? txt(i.closest('label')) : null)})),
            })),
            footerButtons: [...root.querySelectorAll('.pkpFormPage__footer button')].map((b) => ({name: b.innerText.trim(), disabled: b.disabled})),
            footerText: txt(root.querySelector('.pkpFormPage__footer')),
        };
    });
}

// ---------------------------------------------------------------------------
// Driving helpers (the panel: K2's idioms)

function field(page, label, index = 0) {
    return dialog(page).locator('.pkpFormField').filter({hasText: new RegExp(`(^|\\s)${label}`)}).nth(index);
}
const textInput = (page, label, index = 0) => field(page, label, index).locator('input.pkpFormField__input, input[type=text]').first();
async function richBody(page, label, index = 0) {
    const f = field(page, label, index);
    const frame = f.locator('iframe').first();
    await frame.waitFor({timeout: T});
    const body = frame.contentFrame().locator('body');
    await body.waitFor({timeout: T});
    await page.waitForFunction((el) => el.contentDocument && el.contentDocument.body && el.contentDocument.body.getAttribute('contenteditable') === 'true', await frame.elementHandle(), {timeout: T}).catch(() => {});
    return body;
}
async function setRich(page, label, text, index = 0) {
    const body = await richBody(page, label, index);
    await body.click();
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.press('Delete');
    if (text) await body.pressSequentially(text);
    await sleep(150);
}
async function openAnnouncementsPage(page, app, ctxPath) {
    await page.goto(ctxUrl(app, ctxPath, '/management/settings/announcements'));
    await idle(page);
    await page.locator('main .listPanel').first().waitFor({timeout: T}).catch(() => {});
    await idle(page);
    return listState(page);
}
async function openAddPanel(page) {
    await page.locator('main .listPanel').first().getByRole('button', {name: 'Add Announcement', exact: true}).click();
    await dialog(page).waitFor({timeout: T});
    await dialog(page).locator('.pkpFormPage__footer').waitFor({timeout: T});
    await idle(page);
    await sleep(400);
}
async function openEditPanel(page, rowTitle) {
    const row = page.locator('main .listPanel .listPanel__item').filter({hasText: rowTitle}).first();
    await row.getByRole('button', {name: /^Edit$/}).click();
    await dialog(page).waitFor({timeout: T});
    await dialog(page).locator('.pkpFormPage__footer').waitFor({timeout: T});
    await idle(page);
    await sleep(400);
}
async function save(page) {
    const d = dialog(page);
    const btn = d.getByRole('button', {name: 'Save', exact: true});
    if (await btn.isDisabled().catch(() => null)) return {saveDisabled: true, form: await formState(page)};
    await btn.click();
    await idle(page);
    await sleep(600);
    await idle(page);
    const open = (await page.locator('[role="dialog"]:visible').count()) > 0;
    return {saveDisabled: false, stillOpen: open, form: open ? await formState(page) : {open: false}};
}
async function setSendEmail(page, on) {
    const box = field(page, 'Send Email').getByRole('checkbox').first();
    if (!(await box.count())) return null;
    await box.setChecked(on);
    return box.isChecked();
}
function trafficRecorder(page) {
    const calls = [];
    page.on('request', (r) => { if (/api\/v1\/announcements/.test(r.url()) && /POST|PUT|DELETE/.test(r.method())) calls.push({method: r.method(), url: r.url().replace(/^https?:\/\/[^/]+/, ''), override: r.headers()['x-http-method-override'] || null, body: (r.postData() || '').slice(0, 1500)}); });
    page.on('response', (r) => { if (/api\/v1\/announcements/.test(r.url()) && /POST|PUT|DELETE/.test(r.request().method())) { const c = calls.slice().reverse().find((x) => x.url === r.url().replace(/^https?:\/\/[^/]+/, '') && !x.status); if (c) c.status = r.status(); } });
    return {calls, take: () => calls.splice(0)};
}

async function as(page, user, ctxPath, password) {
    await signIn(page, user, {contextPath: ctxPath, password});
    await idle(page);
}

/** The queue's size as the probe server reports it. */
async function jobs(app) {
    try { const r = await app.api.context.get('/index.php/index/api/v1/_test/jobs', {failOnStatusCode: false}); return r.ok() ? await r.json() : {status: r.status()}; } catch (e) { return {error: String(e.message || e)}; }
}
/** Drain the app's job queue (K2's idiom: `jobs.php run` in app.root, then the probe server's `_test/jobs` until empty). */
async function drain(app, timeoutMs = 90_000) {
    const env = {...process.env, PKP_CONFIG_FILE: app.configFile};
    const run = () => { try { return execFileSync('php', ['lib/pkp/tools/jobs.php', 'run'], {cwd: app.root, env, encoding: 'utf8', timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024}); } catch (e) { return typeof e.stdout === 'string' ? e.stdout : String(e.message || e); } };
    const out = {runs: 1, output: String(run()).slice(-600)};
    const deadline = Date.now() + timeoutMs;
    for (;;) {
        const counts = await jobs(app);
        out.counts = counts;
        if (counts && counts.queued === 0 && counts.reserved === 0) return {ok: true, ...out};
        if (Date.now() > deadline) return {ok: false, ...out};
        await sleep(500);
        if (counts && counts.queued > 0) { run(); out.runs++; }
    }
}

/** One recipient's mail for a marker: the summary or null (bounded by timeoutMs). */
async function mailFor(app, to, contains, timeoutMs = 4000) {
    try {
        const m = await app.mail.find({to, contains, timeoutMs});
        return {found: true, id: m.ID, subject: m.Subject, from: m.From, to: m.To, count: await app.mail.count({to, contains})};
    } catch (e) { return {found: false, count: await app.mail.count({to, contains}).catch(() => null)}; }
}
/** A full message as data: headers, the HTML and text bodies, the links. */
async function fullMail(app, id) {
    const m = await app.mail.fullMessage(id);
    const html = m.HTML || '';
    const links = [...html.matchAll(/<a\s[^>]*href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gis)].map((x) => ({href: x[1], text: x[2].replace(/<[^>]+>/g, '').trim()}));
    return {from: m.From, to: m.To, cc: m.Cc, bcc: m.Bcc, replyTo: m.ReplyTo, subject: m.Subject, date: m.Date, html, text: m.Text, links};
}

/** The public pages as a visitor: the list, one announcement's page, the home page. */
async function publicRead(page, app, ctxPath, name, {id, locale = ''} = {}) {
    const out = {};
    const pages = [['list', '/announcement'], ['home', '']];
    if (id) pages.splice(1, 0, ['view', `/announcement/view/${id}`]);
    for (const [key, p] of pages) {
        const resp = await page.goto(ctxUrl(app, ctxPath, p, locale)).catch(() => null);
        await idle(page);
        const body = await page.locator('body').innerText().catch(() => '');
        out[key] = {
            url: page.url(), status: resp ? resp.status() : null, title: await page.title(),
            is404: /404 Not Found/i.test(body),
            summaries: await page.locator('.obj_announcement_summary').evaluateAll((els) => els.map((e) => e.innerText.replace(/\s+/g, ' ').trim())).catch(() => []),
            homeBlock: await page.locator('section.cmp_announcements').first().innerText().then((t) => t.replace(/\s+/g, ' ').trim().slice(0, 600)).catch(() => null),
            feedBlock: await feedBlock(page),
            altLinks: await altLinks(page),
        };
        await snap(page, `${name}-${key}`, out[key]);
    }
    return out;
}
/** The sidebar's announcement feed box, when the page has one. */
async function feedBlock(page) {
    return page.evaluate(() => {
        const b = document.querySelector('.block_announcement_feed');
        if (!b) return null;
        return {
            heading: b.querySelector('h2, .title')?.innerText.trim() ?? null,
            links: [...b.querySelectorAll('a')].map((a) => ({href: a.getAttribute('href'), alt: a.querySelector('img')?.getAttribute('alt') ?? null, name: a.innerText.trim(), src: a.querySelector('img')?.getAttribute('src') ?? null})),
            sidebarBlocks: [...document.querySelectorAll('.pkp_structure_sidebar .pkp_block')].map((x) => x.className),
        };
    }).catch(() => null);
}
async function altLinks(page) {
    return page.evaluate(() => [...document.querySelectorAll('head link[rel="alternate"]')].map((l) => ({type: l.getAttribute('type'), href: l.getAttribute('href')}))).catch(() => []);
}
/** A feed read the way the link is followed: the GET, its status and content type, the entries as data. */
async function readFeed(page, url) {
    const r = await page.request.get(url, {failOnStatusCode: false, maxRedirects: 3});
    const body = await r.text();
    const out = {url: url.replace(/^https?:\/\/[^/]+/, ''), status: r.status(), contentType: r.headers()['content-type'] || null, length: body.length, is404: /404 Not Found/i.test(body) && r.status() === 404, bodyHead: body.slice(0, 400)};
    const tagText = (s, t) => { const m = s.match(new RegExp(`<${t}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${t}>`)); return m ? m[1].trim() : null; };
    out.feedTitle = tagText(body, 'title');
    out.updated = tagText(body, 'updated') || tagText(body, 'pubDate') || tagText(body, 'dc:date');
    const items = [...body.matchAll(/<(entry|item)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/g)].map((m) => m[2]);
    out.entries = items.map((it) => ({
        title: tagText(it, 'title'),
        link: (it.match(/<link[^>]*href="([^"]+)"/) || [])[1] || tagText(it, 'link'),
        date: tagText(it, 'updated') || tagText(it, 'published') || tagText(it, 'pubDate') || tagText(it, 'dc:date'),
        summary: tagText(it, 'summary') ?? tagText(it, 'description'),
    }));
    out.body = body.slice(0, 6000);
    return out;
}
const FEEDS = ['atom', 'rss2', 'rss'];
const feedUrl = (app, ctxPath, type) => ctxUrl(app, ctxPath, `/gateway/plugin/AnnouncementFeedGatewayPlugin/${type}`);
async function readFeeds(page, app, ctxPath, name) {
    const out = {};
    for (const t of FEEDS) out[t] = await readFeed(page, feedUrl(app, ctxPath, t));
    record(name, out);
    return out;
}

/** Profile › Notifications as data (U05 K3's idiom): groups and rows with the two boxes. */
async function readTab(page) {
    const form = page.locator('form#notificationSettingsForm');
    await form.waitFor({timeout: 15000});
    return form.evaluate((f) => {
        const order = (a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1);
        const boxes = [...f.querySelectorAll('input[type=checkbox]')];
        const sections = [...new Set(boxes.map((b) => b.closest('.section')))].filter(Boolean);
        const items = [...f.querySelectorAll('h4'), ...sections].sort(order);
        const rows = [];
        const groups = [];
        let group = null;
        for (const el of items) {
            if (el.tagName === 'H4') { group = el.innerText.trim(); groups.push(group); continue; }
            const labelEl = el.querySelector(':scope > ul > label:not([for]), :scope > .label, :scope > label:not([for])');
            const inputs = [...el.querySelectorAll('input[type=checkbox]')];
            const lab = (i) => (i ? (f.querySelector(`label[for="${i.id}"]`) || i.closest('label') || {}).innerText || null : null);
            rows.push({group, sentence: labelEl ? labelEl.innerText.trim() : null,
                enableId: inputs[0] && inputs[0].id, enable: inputs[0] && inputs[0].checked, enableLabel: lab(inputs[0]) && lab(inputs[0]).trim(),
                emailId: inputs[1] && inputs[1].id, email: inputs[1] && inputs[1].checked, emailDisabled: inputs[1] && inputs[1].disabled, emailLabel: lab(inputs[1]) && lab(inputs[1]).trim()});
        }
        const full = f.innerText.replace(/\s+/g, ' ').trim();
        return {intro: groups[0] ? full.slice(0, full.indexOf(groups[0])).trim() : null, groups, rows, buttons: [...f.querySelectorAll('button, input[type=submit]')].map((b) => b.innerText || b.value)};
    });
}
const announcementRow = (tab) => (tab.rows || []).find((r) => /announcement/i.test(r.sentence || ''));
async function openTab(page, app, ctx, name) {
    await page.goto(app.url(`/index.php/${ctx}/user/profile/notificationSettings`));
    await idle(page);
    const tab = await readTab(page);
    await snap(page, name, {tab});
    return tab;
}
async function saveTab(page) {
    const form = page.locator('form#notificationSettingsForm');
    const saved = page.waitForResponse((r) => r.url().includes('save-notification-settings'), {timeout: 30000}).catch(() => null);
    await form.getByRole('button', {name: 'Save', exact: true}).click();
    const resp = await saved;
    await page.locator('.pkpNotification').first().waitFor({timeout: 10000}).catch(() => {});
    return {status: resp ? resp.status() : null, toast: await page.locator('.pkpNotification').allInnerTexts().catch(() => [])};
}

const regPassword = (username) => `${username}${username}`.slice(0, 32);
/** A visitor registers on the context with the consent box ticked or not (U05 K3's idiom). */
async function registerVisitor(page, app, ctx, username, {given, family, emailConsent, name}) {
    const out = {username, emailConsent};
    await page.goto(app.url(`/index.php/${ctx}/user/register`));
    await idle(page).catch(() => {});
    await page.locator('#givenName').fill(given);
    await page.locator('#familyName').fill(family);
    await page.locator('#affiliation').fill('Check University');
    await page.locator('#country').selectOption('CZ');
    await page.locator('#email').fill(`${username}@mail.test`);
    await page.locator('#username').fill(username);
    await page.locator('#password').fill(regPassword(username));
    await page.locator('#password2').fill(regPassword(username));
    const privacy = page.locator('input[name="privacyConsent"]');
    if (await privacy.count()) await privacy.check();
    const consent = page.locator('input[name="emailConsent"]');
    out.consentLabel = await consent.evaluate((i) => (i.closest('label') || document.querySelector(`label[for="${i.id}"]`) || {}).innerText?.replace(/\s+/g, ' ').trim() ?? null).catch(() => null);
    if (emailConsent) await consent.check(); else await consent.uncheck();
    await snap(page, `${name}-form`, {consentChecked: await consent.isChecked()});
    await page.getByRole('button', {name: 'Register', exact: true}).last().click();
    await page.waitForLoadState('domcontentloaded');
    await idle(page).catch(() => {});
    out.after = {url: page.url(), title: await page.title()};
    await snap(page, `${name}-after`, out);
    return out;
}

/** The recipients' screens after the queue ran: toasts, the bell's count, the Tasks panel, the front page. */
async function toldRead(page, app, ctxPath, name) {
    const out = {};
    await page.goto(ctxUrl(app, ctxPath, '/submissions'));
    await idle(page).catch(() => {});
    await sleep(1500);
    out.dashboard = {url: page.url(), title: await page.title(), toasts: await page.locator('.pkpNotification, [role="alert"], [role="status"]').allInnerTexts().catch(() => []),
        taskCounts: await page.locator('.task_count').evaluateAll((els) => els.map((e) => ({text: e.innerText.trim(), visible: e.getClientRects().length > 0}))).catch(() => [])};
    await snap(page, `${name}-dashboard`, out.dashboard);
    const bell = page.getByRole('button', {name: /^Tasks/}).first();
    if (await bell.count()) {
        await bell.click();
        await idle(page).catch(() => {});
        await sleep(800);
        out.tasksPanel = await page.locator('[role="dialog"]:visible, [data-cy="active-modal"]').last().innerText().then((t) => t.replace(/\s+/g, ' ').trim().slice(0, 1200)).catch(() => null);
        await snap(page, `${name}-tasks-panel`, {tasksPanel: out.tasksPanel});
        await page.keyboard.press('Escape');
        await sleep(300);
    } else out.tasksPanel = 'no Tasks bell';
    await page.goto(ctxUrl(app, ctxPath, ''));
    await idle(page).catch(() => {});
    out.front = {url: page.url(), toasts: await page.locator('.pkpNotification, [role="alert"]').allInnerTexts().catch(() => []), homeBlock: await page.locator('section.cmp_announcements').first().innerText().then((t) => t.replace(/\s+/g, ' ').trim().slice(0, 400)).catch(() => null)};
    await snap(page, `${name}-front`, out.front);
    return out;
}

// --- Website settings tabs (OJS feed) ---------------------------------------
async function openWebsite(page, app, ctxPath, top) {
    await page.goto(ctxUrl(app, ctxPath, '/management/settings/website'));
    await idle(page);
    await page.locator(`#${top}-button`).click();
    await idle(page);
    await sleep(500);
}
/** The Plugins grid's row for a plugin: its Enabled box, its links; the Generic Plugins names. */
async function pluginsGrid(page, name) {
    const grid = page.locator('#pluginGridContainer');
    await grid.locator('tr.gridRow').first().waitFor({timeout: T}).catch(() => {});
    const data = await grid.evaluate((root) => {
        const rows = [...root.querySelectorAll('tr.gridRow')];
        const cats = [...root.querySelectorAll('tr.category, tr.gridCategory, tr[class*="category"]')].map((c) => c.innerText.replace(/\s+/g, ' ').trim());
        return {
            categories: cats,
            generic: rows.filter((r) => r.previousElementSibling).map((r) => r.querySelector('td')?.innerText.replace(/\s+/g, ' ').trim()).filter(Boolean),
            feedRow: (() => { const r = rows.find((x) => /Announcement Feed Plugin/.test(x.innerText)); if (!r) return null; const box = r.querySelector('input[type=checkbox]'); return {text: r.innerText.replace(/\s+/g, ' ').trim(), enabled: box ? box.checked : null, links: [...r.querySelectorAll('a')].map((a) => ({text: a.innerText.trim(), cls: a.className}))}; })(),
        };
    }).catch((e) => ({error: String(e.message || e)}));
    record(name, data);
    return data;
}
const feedRow = (page) => page.locator('#pluginGridContainer tr.gridRow').filter({hasText: 'Announcement Feed Plugin'}).first();
/** Expand the feed plugin's row and press its "Settings" action; returns the window's state. */
async function openFeedSettings(page, app, ctxPath) {
    // always from a fresh Plugins tab: after the window's OK or Cancel the legacy grid redraws and swallows the next click on its controls (pitfall 10)
    await openWebsite(page, app, ctxPath, 'plugins');
    const row = feedRow(page);
    await row.waitFor({timeout: T});
    const expander = row.locator('a.show_extras').first();
    if (await expander.count()) { await expander.click(); await sleep(500); }
    const controls = page.locator('#pluginGridContainer tr.row_controls:visible').first();
    const settings = controls.getByRole('link', {name: 'Settings', exact: true}).first();
    await loc(page, 'Website › Plugins: the expanded feed row\'s "Settings" action', settings);
    await settings.click();
    const d = dialog(page);
    await d.waitFor({timeout: T});
    await d.getByRole('radio').first().waitFor({timeout: T});
    await idle(page);
    await sleep(400);
    return feedWindowState(page);
}
async function feedWindowState(page) {
    const d = dialog(page);
    if (!(await d.count())) return {open: false};
    return d.evaluate((root) => {
        const txt = (el) => (el ? el.innerText.replace(/\s+/g, ' ').trim() : null);
        const lab = (i) => (root.querySelector(`label[for="${i.id}"]`) || i.closest('label') || {}).innerText?.replace(/\s+/g, ' ').trim() ?? null;
        return {
            open: true,
            heading: txt(root.querySelector('h1')),
            radios: [...root.querySelectorAll('input[type=radio]')].map((r) => ({name: r.name, value: r.value, checked: r.checked, label: lab(r)})),
            textboxes: [...root.querySelectorAll('input[type=text]')].map((i) => ({name: i.name, value: i.value, size: i.getAttribute('size'), width: i.getBoundingClientRect().width, label: lab(i)})),
            buttons: [...root.querySelectorAll('button, input[type=submit]')].filter((b) => b.offsetParent !== null).map((b) => ({tag: b.tagName, text: (b.innerText || b.value || '').trim(), type: b.type})),
            links: [...root.querySelectorAll('a')].filter((a) => a.offsetParent !== null).map((a) => ({text: a.innerText.trim(), href: a.getAttribute('href')})),
            errors: [...root.querySelectorAll('.pkp_form_error, .error, .formError, [class*="error"]')].map(txt).filter(Boolean),
            text: txt(root),
        };
    });
}
/** Set the window's fields and press its submit; returns what happened. */
async function feedWindowSave(page, {displayPage, recentItems}) {
    const d = dialog(page);
    if (displayPage) await d.locator(`input[type=radio][value="${displayPage}"]`).check();
    if (recentItems !== undefined) await d.locator('input[name="recentItems"]').fill(String(recentItems));
    const before = await feedWindowState(page);
    const w = page.waitForResponse((r) => r.request().method() === 'POST' && /manage/.test(r.url()), {timeout: T}).catch(() => null);
    await d.locator('button[type=submit], button').filter({hasText: /^(OK|Save)$/}).first().click();
    const resp = await w;
    let json = null;
    try { json = resp ? await resp.json() : null; } catch { json = null; }
    await sleep(800);
    await idle(page);
    const stillOpen = (await page.locator('[role="dialog"]:visible').count()) > 0;
    return {before, status: resp ? resp.status() : null, jsonStatus: json && json.status, jsonContent: json && typeof json.content === 'string' ? json.content.replace(/\s+/g, ' ').slice(0, 300) : null, stillOpen, after: stillOpen ? await feedWindowState(page) : null};
}
async function closeWindow(page) {
    const d = dialog(page);
    if (!(await d.count())) return;
    const cancel = d.getByRole('link', {name: 'Cancel', exact: true}).first();
    if (await cancel.count()) await cancel.click(); else await d.getByRole('button', {name: 'Close', exact: true}).first().click().catch(() => page.keyboard.press('Escape'));
    await page.locator('[role="dialog"]:visible').waitFor({state: 'hidden', timeout: T}).catch(() => {});
    await idle(page);
}
/** Appearance › Setup › Sidebar: the options and which are ticked. */
async function sidebarOptions(page, app, ctxPath, name) {
    await openWebsite(page, app, ctxPath, 'appearance');
    await page.locator('#appearance').getByRole('tab', {name: 'Setup', exact: true}).click();
    await idle(page); await sleep(500);
    const panel = page.locator('#appearance').locator('[role="tabpanel"]:visible').filter({hasText: 'Sidebar'}).first();
    const f = panel.locator('.pkpFormField').filter({hasText: 'Sidebar'}).first();
    await f.waitFor({timeout: T}).catch(() => {});
    const options = await f.getByRole('checkbox').evaluateAll((els) => els.map((e) => ({value: e.value, label: (e.closest('label') || e.parentElement).innerText.trim(), checked: e.checked}))).catch(() => []);
    await snap(page, name, {options});
    return options;
}
async function setPluginEnabled(page, on) {
    // the grid redraws the row on the box's click (a new checkbox element), so setChecked's post-click verification throws: click and wait for the grid's request instead
    const box = feedRow(page).getByRole('checkbox').first();
    const w = page.waitForResponse((r) => /settings-plugin-grid\/(enable|disable)/.test(r.url()), {timeout: T}).catch(() => null);
    const wasChecked = await box.isChecked();
    if (wasChecked !== on) await box.click({noWaitAfter: true}).catch(() => box.dispatchEvent('click'));
    const resp = await w;
    await sleep(800);
    await idle(page);
    const toast = await page.locator('.pkpNotification').allInnerTexts().catch(() => []);
    const dlg = page.locator('[role="dialog"]:visible');
    const dialogText = (await dlg.count()) ? await dlg.last().innerText().then((t) => t.replace(/\s+/g, ' ').trim().slice(0, 400)) : null;
    if (dialogText) { const ok = dlg.last().getByRole('button', {name: /^(OK|Yes)$/}).first(); if (await ok.count()) { await ok.click(); await idle(page); await sleep(600); } }
    return {status: resp ? resp.status() : null, url: resp ? resp.url().replace(/^https?:\/\/[^/]+/, '') : null, toast, dialogText, checked: await feedRow(page).getByRole('checkbox').first().isChecked().catch(() => null)};
}

// ---------------------------------------------------------------------------
forEachApp(async (app) => {
    let st = fs.existsSync(stateFile(app)) ? JSON.parse(fs.readFileSync(stateFile(app), 'utf8')) : null;
    const saveState = () => fs.writeFileSync(stateFile(app), JSON.stringify(st, null, 2));
    const isOJS = app.name === 'ojs';

    // ---- seed ---------------------------------------------------------------
    if ((on('seed') && (process.env.RESEED === '1' || !st)) || !st) {
        const t = tag('u12k5');
        const seedOne = async (spec) => {
            for (let attempt = 1; attempt <= 2; attempt++) {
                try { return await app.api.createContext(spec); } catch (e) { log('seed failed', attempt, String(e.message || e).slice(0, 600)); if (attempt === 2) throw e; await sleep(3000); }
            }
            return null;
        };
        const users = (p) => [
            {username: `${p}mgr`, roles: ['manager'], givenName: 'Mira', familyName: 'Manager'},
            {username: `${p}se`, roles: ['sectionEditor'], givenName: 'Sonia', familyName: 'Section'},
            {username: `${p}au`, roles: ['author'], givenName: 'Aria', familyName: 'Author'},
            {username: `${p}rd`, roles: ['reader'], givenName: 'Rex', familyName: 'Reader'},
        ];
        const tA = `${t}a`, tB = `${t}b`, tC = `${t}c`, tF = `${t}f`;
        const feedOn = isOJS ? {plugins: {announcementfeedplugin: {enabled: true}}, sidebar: ['AnnouncementFeedBlockPlugin']} : {};
        const ctxA = await seedOne({
            tag: tA, context: {name: `U12 K5 ${tA}`, acronym: 'U12K5A'}, users: users(tA),
            enableAnnouncements: true, numAnnouncementsHomepage: 2, ...feedOn,
            announcementTypes: [{name: 'Conference'}],
            announcements: [
                {title: 'Oldest call', descriptionShort: '<p>The oldest short text.</p>', description: '<p>The oldest full text.</p>'},
                {title: 'Typed notice', descriptionShort: '<p>Typed short text.</p>', type: 'Conference'},
                {title: 'Expired item', descriptionShort: '<p>Expired yesterday.</p>', dateExpire: dayOffset(-1)},
            ],
        });
        const ctxF = await seedOne({
            tag: tF, context: {name: `U12 K5 ${tF} French`, acronym: 'U12K5F', primaryLocale: 'fr_CA', supportedLocales: ['fr_CA', 'en'], supportedFormLocales: ['fr_CA', 'en']},
            users: [{username: `${tF}mgr`, roles: ['manager'], givenName: 'Marie', familyName: 'Gestionnaire'}, {username: `${tF}rd`, roles: ['reader'], givenName: 'Rex', familyName: 'Reader'}],
            enableAnnouncements: true,
        });
        let ctxB = null, ctxC = null;
        if (isOJS) {
            ctxB = await seedOne({
                tag: tB, context: {name: `U12 K5 ${tB} off`, acronym: 'U12K5B'}, users: [{username: `${tB}mgr`, roles: ['manager'], givenName: 'Bea', familyName: 'Manager'}],
                enableAnnouncements: false, ...feedOn,
                announcements: [{title: 'Hidden while off', descriptionShort: '<p>Off.</p>'}],
            });
            ctxC = await seedOne({
                tag: tC, context: {name: `U12 K5 ${tC} plugin off`, acronym: 'U12K5C'}, users: [{username: `${tC}mgr`, roles: ['manager'], givenName: 'Cara', familyName: 'Manager'}],
                enableAnnouncements: true, numAnnouncementsHomepage: 1,
                announcements: [{title: 'Plugin off item', descriptionShort: '<p>Plugin as installed.</p>'}],
            });
        }
        st = {
            tag: t,
            A: {path: ctxA.path || tA, id: ctxA.contextId, users: {mgr: `${tA}mgr`, se: `${tA}se`, au: `${tA}au`, rd: `${tA}rd`}, seeded: ctxA.announcements || [], types: ctxA.announcementTypes || []},
            F: {path: ctxF.path || tF, id: ctxF.contextId, users: {mgr: `${tF}mgr`, rd: `${tF}rd`}},
            B: ctxB ? {path: ctxB.path || tB, id: ctxB.contextId, users: {mgr: `${tB}mgr`}, seeded: ctxB.announcements || []} : null,
            C: ctxC ? {path: ctxC.path || tC, id: ctxC.contextId, users: {mgr: `${tC}mgr`}, seeded: ctxC.announcements || []} : null,
            jobsAtSeed: await jobs(app),
        };
        saveState();
        record('00-seed', {A: ctxA, F: ctxF, B: ctxB, C: ctxC, jobs: st.jobsAtSeed});
        log('seeded', st.A.path, st.A.id, st.F.path, st.F.id, st.B && st.B.path, st.C && st.C.path);
        note(`K5 ${app.name}: scratch A ${st.A.path} (id ${st.A.id}, on, users mgr/se/au/rd, type Conference, three announcements incl. one expired${isOJS ? ', feed plugin on + block placed' : ''}); F ${st.F.path} (id ${st.F.id}, primary fr_CA)${isOJS ? `; B ${st.B.path} (id ${st.B.id}, announcements OFF, plugin on, block placed); C ${st.C.path} (id ${st.C.id}, on, plugin as installed)` : ''}; queue at seed ${JSON.stringify(st.jobsAtSeed)}`);
    }
    const A = st.A, F = st.F, B = st.B, C = st.C;
    const mailTo = (u) => `${u}@mail.test`;

    // ---- tab: Profile › Notifications, the row's defaults and the other end ----
    if (on('tab')) {
        const {page, close} = await launch(app);
        try {
            await as(page, A.users.rd, A.path);
            const tabRd = await openTab(page, app, A.path, '10-tab-reader-default');
            await loc(page, 'Profile › Notifications: the announcement row\'s "Enable…" box', page.locator(`#${announcementRow(tabRd)?.enableId}`));
            await loc(page, 'Profile › Notifications: the announcement row\'s "Do not send me an email…" box', page.locator(`#${announcementRow(tabRd)?.emailId}`));
            record('10b-tab-reader-row', {row: announcementRow(tabRd), groups: tabRd.groups, buttons: tabRd.buttons});
            // the author unticks "Enable these types of notifications." on the row
            await as(page, A.users.au, A.path);
            const tabAu = await openTab(page, app, A.path, '11-tab-author-before');
            const rowAu = announcementRow(tabAu);
            await page.locator(`#${rowAu.enableId}`).uncheck();
            const emailAfterUntick = await page.locator(`#${rowAu.emailId}`).evaluate((i) => ({checked: i.checked, disabled: i.disabled}));
            const saveAu = await saveTab(page);
            const tabAu2 = await openTab(page, app, A.path, '11b-tab-author-after');
            record('11c-tab-author-save', {emailAfterUntick, save: saveAu, rowAfter: announcementRow(tabAu2)});
            // the section editor ticks "Do not send me an email…" on the row
            await as(page, A.users.se, A.path);
            const tabSe = await openTab(page, app, A.path, '12-tab-se-before');
            const rowSe = announcementRow(tabSe);
            await page.locator(`#${rowSe.emailId}`).check();
            const saveSe = await saveTab(page);
            const tabSe2 = await openTab(page, app, A.path, '12b-tab-se-after');
            record('12c-tab-se-save', {save: saveSe, rowAfter: announcementRow(tabSe2)});
            // the manager's row, read as found (the poster)
            await as(page, A.users.mgr, A.path);
            const tabMgr = await openTab(page, app, A.path, '13-tab-manager-default');
            record('13b-tab-manager-row', {row: announcementRow(tabMgr)});
            // two visitors register: the consent box ticked and unticked
            await signOut(page);
            const rt = `${st.tag}rt`, ru = `${st.tag}ru`;
            const regT = await registerVisitor(page, app, A.path, rt, {given: 'Reg', family: 'Ticked', emailConsent: true, name: '14-register-ticked'});
            const tabRt = await openTab(page, app, A.path, '14b-tab-registered-ticked');
            await signOut(page);
            const regU = await registerVisitor(page, app, A.path, ru, {given: 'Reg', family: 'Unticked', emailConsent: false, name: '15-register-unticked'});
            const tabRu = await openTab(page, app, A.path, '15b-tab-registered-unticked');
            record('16-registered-rows', {ticked: {reg: regT, row: announcementRow(tabRt)}, unticked: {reg: regU, row: announcementRow(tabRu)}});
            st.A.users.rt = rt; st.A.users.ru = ru; saveState();
            note(`K5 ${app.name}: Profile › Notifications row "${announcementRow(tabRd)?.sentence}" (group "${announcementRow(tabRd)?.group}"): reader default enable=${announcementRow(tabRd)?.enable} email-box=${announcementRow(tabRd)?.email}; registered with consent ticked → email-box=${announcementRow(tabRt)?.email}, unticked → email-box=${announcementRow(tabRu)?.email}`);
        } finally { await close(); }
    }

    // ---- add: the manager posts with "Send Email" ticked, then unticked ---------
    if (on('add')) {
        const {page, close} = await launch(app);
        const visitor = await launch(app);
        const traffic = trafficRecorder(page);
        try {
            const jobs0 = await jobs(app);
            await as(page, A.users.mgr, A.path);
            const list0 = await openAnnouncementsPage(page, app, A.path);
            await snap(page, '20-page-before', {list: list0, jobs: jobs0});
            await openAddPanel(page);
            await textInput(page, 'Title').fill('Call for papers');
            await setRich(page, 'Short Description', 'Deadline 1 June.');
            await setRich(page, 'Announcement', 'The full call text for the feed.');
            const ticked = await setSendEmail(page, true);
            await loc(page, 'Add Announcement: "Send an email about this to all registered users." box', field(page, 'Send Email').getByRole('checkbox').first());
            await snap(page, '21-add-panel-ticked', {form: await formState(page), ticked});
            const r1 = await save(page);
            const jobs1 = await jobs(app);
            const list1 = await listState(page);
            await snap(page, '22-after-add-ticked', {result: r1, traffic: traffic.take(), jobsBefore: jobs0, jobsAfter: jobs1, list: list1});
            const callId = rowId(list1, 'Call for papers');
            st.A.callId = callId; saveState();
            // Rule 17: public at once, before the queue ran, to a visitor and to the reader
            const pubVisitor = await publicRead(visitor.page, app, A.path, '23-public-before-drain-visitor', {id: callId});
            await as(visitor.page, A.users.rd, A.path);
            const pubReader = await publicRead(visitor.page, app, A.path, '23b-public-before-drain-reader', {id: callId});
            record('23c-live-at-once', {jobsStillQueued: await jobs(app), visitorLists: pubVisitor.list.summaries, readerLists: pubReader.list.summaries, viewStatus: pubVisitor.view.status});
            // the drain, then the mail catcher
            const d1 = await drain(app);
            const who = {mgr: A.users.mgr, se: A.users.se, au: A.users.au, rd: A.users.rd, rt: A.users.rt, ru: A.users.ru};
            const mails = {};
            const control = await mailFor(app, mailTo(A.users.rd), 'Call for papers', 30000);
            for (const [k, u] of Object.entries(who)) if (u) mails[k] = await mailFor(app, mailTo(u), 'Call for papers', 3000);
            mails.admin = await mailFor(app, 'admin@mail.test', 'Call for papers', 3000);
            mails.noRoleControl = await mailFor(app, 'reader.rosa@mail.test', 'Call for papers', 2000);
            record('24-mail-after-drain', {drain: d1, control, mails});
            if (control.found) {
                const full = await fullMail(app, control.id);
                record('25-mail-full-reader', full);
                const view = full.links.find((l) => /announcement\/view\/\d+/.test(l.href));
                record('25b-mail-link', {fullAnnouncementLink: view || null, viewHrefMatchesId: view ? new RegExp(`announcement/view/${callId}$`).test(view.href) : null, hasUnsubscribe: /unsubscribe/i.test(full.html), footerText: (full.text || '').split('\n').slice(-6).join('\n')});
            }
            if (mails.mgr && mails.mgr.found) record('25c-mail-full-manager', await fullMail(app, mails.mgr.id));
            // a second announcement with the box unticked: no email
            await openAnnouncementsPage(page, app, A.path);
            await openAddPanel(page);
            await textInput(page, 'Title').fill('Quiet notice');
            await setRich(page, 'Short Description', 'Nobody is emailed.');
            const unticked = await setSendEmail(page, false);
            const jobs2 = await jobs(app);
            const r2 = await save(page);
            const jobs3 = await jobs(app);
            const d2 = await drain(app);
            let none = null;
            try { await app.mail.expectNone({to: mailTo(A.users.rd), contains: 'Quiet notice', afterControl: {to: mailTo(A.users.rd), contains: 'Call for papers'}}); none = {ok: true}; } catch (e) { none = {ok: false, error: String(e.message).split('\n')[0]}; }
            const quietCounts = {};
            for (const [k, u] of Object.entries(who)) if (u) quietCounts[k] = await app.mail.count({to: mailTo(u), contains: 'Quiet notice'});
            await snap(page, '26-after-add-unticked', {result: r2, unticked, traffic: traffic.take(), jobsBefore: jobs2, jobsAfter: jobs3, drain: d2, expectNone: none, quietCounts, list: await listState(page)});
            // Rule 17 / note o: edit the oldest and save: its place and its date
            const pubBefore = await publicRead(visitor.page, app, A.path, '27-public-before-oldest-edit');
            await openEditPanel(page, 'Oldest call');
            await textInput(page, 'Title').fill('Oldest call (edited)');
            const r3 = await save(page);
            const listAfter = await listState(page);
            const pubAfter = await publicRead(visitor.page, app, A.path, '27b-public-after-oldest-edit');
            record('27c-oldest-edit', {result: r3, traffic: traffic.take(), rowsBefore: (list1.rows || []).map((r) => r.title), rowsAfter: (listAfter.rows || []).map((r) => r.title), publicBefore: pubBefore.list.summaries, publicAfter: pubAfter.list.summaries});
            // an edit with the box ticked: nothing goes out (Side effects "never on an edit")
            await openEditPanel(page, 'Call for papers');
            const editTicked = await setSendEmail(page, true);
            const jobs4 = await jobs(app);
            const r4 = await save(page);
            const jobs5 = await jobs(app);
            const d3 = await drain(app);
            const afterEdit = {};
            for (const [k, u] of Object.entries(who)) if (u) afterEdit[k] = await app.mail.count({to: mailTo(u), contains: 'Call for papers'});
            record('28-edit-ticked', {editTicked, result: r4, traffic: traffic.take(), jobsBefore: jobs4, jobsAfter: jobs5, drain: d3, callForPapersCountsAfterEdit: afterEdit});
            note(`K5 ${app.name}: "Call for papers" with "Send Email" ticked: queue ${JSON.stringify(jobs0)} → ${JSON.stringify(jobs1)}; after the drain mail to ${Object.entries(mails).filter(([, v]) => v && v.found).map(([k]) => k).join('/')}, none to ${Object.entries(mails).filter(([, v]) => v && !v.found).map(([k]) => k).join('/')}; From ${control.from ? `${control.from.Name} <${control.from.Address}>` : '?'}`);
        } finally { await close(); await visitor.close(); }
    }

    // ---- told: what the recipients see after the drain ---------------------------
    if (on('told')) {
        const {page, close} = await launch(app);
        try {
            await as(page, A.users.rd, A.path);
            const rd = await toldRead(page, app, A.path, '30-told-reader');
            await as(page, A.users.mgr, A.path);
            const mgr = await toldRead(page, app, A.path, '31-told-manager');
            await as(page, A.users.au, A.path);
            const au = await toldRead(page, app, A.path, '32-told-author-enable-unticked');
            record('33-told-summary', {reader: {toasts: rd.dashboard.toasts, taskCounts: rd.dashboard.taskCounts, panel: rd.tasksPanel, frontToasts: rd.front.toasts}, manager: {toasts: mgr.dashboard.toasts, taskCounts: mgr.dashboard.taskCounts, panel: mgr.tasksPanel}, author: {toasts: au.dashboard.toasts, panel: au.tasksPanel}});
        } finally { await close(); }
    }

    // ---- emails: the "New Announcement" template ---------------------------------
    if (on('emails')) {
        const {page, close} = await launch(app);
        try {
            await as(page, A.users.mgr, A.path);
            await page.goto(ctxUrl(app, A.path, '/management/settings/workflow'));
            await idle(page);
            await page.getByRole('tab', {name: 'Emails', exact: true}).first().click();
            await idle(page); await sleep(500);
            await snap(page, '40-workflow-emails-tab');
            const go = page.getByRole('link', {name: /Templates/}).or(page.getByRole('button', {name: /Templates/})).first();
            const goText = (await go.count()) ? await go.innerText() : null;
            if (await go.count()) await go.click(); else await page.goto(ctxUrl(app, A.path, '/management/settings/manageEmails'));
            await page.locator('.listPanel__item').first().waitFor({timeout: T});
            await idle(page);
            const search = page.getByRole('searchbox').first();
            if (await search.count()) { await search.fill('New Announcement'); await search.press('Enter'); await idle(page); await sleep(600); }
            const items = await page.locator('.listPanel__item').evaluateAll((els) => els.map((e) => e.innerText.replace(/\s+/g, ' ').trim().slice(0, 200)));
            await snap(page, '41-email-templates-list', {goText, items});
            const item = page.locator('.listPanel__item').filter({hasText: /New Announcement/}).first();
            const editBtn = item.getByRole('button', {name: /Edit/}).first();
            if (await editBtn.count()) {
                await editBtn.click();
                const dlg = dialog(page);
                await dlg.waitFor({timeout: T});
                await dlg.locator('iframe, textarea, input').first().waitFor({timeout: T}).catch(() => {});
                await idle(page); await sleep(800);
                const s = await snap(page, '42-email-template-dialog');
                const bodies = await dlg.locator('iframe').evaluateAll((frs) => frs.map((f) => f.contentDocument?.body?.innerHTML?.slice(0, 1500) ?? null)).catch(() => []);
                const subjects = await dlg.locator('input[type=text]').evaluateAll((els) => els.map((i) => ({name: i.name, value: i.value}))).catch(() => []);
                record('42b-email-template-fields', {dialogText: s.text.dialog, subjects, bodies});
                await closeWindow(page);
            } else record('42-email-template-dialog', {noEdit: true, itemText: await item.innerText().catch(() => null)});
        } finally { await close(); }
    }

    // ---- french: the email's language on a French-primary journal --------------
    if (on('french')) {
        const {page, close} = await launch(app);
        const traffic = trafficRecorder(page);
        try {
            await as(page, F.users.mgr, F.path);
            await openAnnouncementsPage(page, app, F.path);
            await openAddPanel(page);
            const form0 = await formState(page);
            await snap(page, '50-french-add-panel', {form: form0});
            // the primary (French) "Title" is the unsuffixed one; the English twin is "Title in English"
            const titleFields = dialog(page).locator('.pkpFormField').filter({hasText: /(^|\s)Title/});
            const labels = await titleFields.evaluateAll((els) => els.map((e) => e.querySelector('.pkpFormFieldLabel, .pkpFormField__heading')?.innerText.replace(/\s+/g, ' ').trim()));
            const primaryIdx = labels.findIndex((l) => l && !/ in /.test(l));
            await titleFields.nth(primaryIdx).locator('input').first().fill('Appel à contributions');
            // the panel opens with the UI language's (English) twin shown and the primary (French) column always shown; press "English" only if its box is hidden
            const enIdx = labels.findIndex((l) => l && / in /.test(l));
            if (enIdx >= 0) {
                const enInput = titleFields.nth(enIdx).locator('input').first();
                if (!(await enInput.isVisible())) { await dialog(page).locator('.pkpFormLocales button').filter({hasText: /English/}).first().click(); await sleep(300); }
                await enInput.fill('Call for papers (French journal)');
            }
            await setRich(page, 'Short Description', 'Date limite le 1er juin.', primaryIdx >= 0 ? 0 : 0);
            await setSendEmail(page, true);
            await snap(page, '51-french-add-filled', {labels, form: await formState(page)});
            const r = await save(page);
            const list = await listState(page);
            const d = await drain(app);
            const m = await mailFor(app, mailTo(F.users.rd), 'Appel', 30000);
            const mEn = await mailFor(app, mailTo(F.users.rd), 'Call for papers (French journal)', 2000);
            const out = {result: r, traffic: traffic.take(), rows: (list.rows || []).map((x) => x.title), drain: d, mailFrench: m, mailEnglish: mEn};
            if (m.found) out.full = await fullMail(app, m.id);
            else if (mEn.found) out.full = await fullMail(app, mEn.id);
            record('52-french-mail', out);
            note(`K5 ${app.name}: French-primary journal ${F.path}: the announcement's mail subject "${(out.full && out.full.subject) || '?'}", body head "${(out.full && (out.full.text || '').replace(/\s+/g, ' ').slice(0, 160)) || '?'}"`);
        } finally { await close(); }
    }

    // ---- feed: OJS; the read-only controls on OMP and OPS ------------------------
    if (on('feed') || on('feedA') || on('feedC')) {
        const {page, close} = await launch(app);
        try {
            if (!isOJS) {
                // controls: the feed addresses, the Plugins grid, the Sidebar list
                const feeds = await readFeeds(page, app, A.path, '60-control-feeds');
                await as(page, A.users.mgr, A.path);
                await openWebsite(page, app, A.path, 'plugins');
                const grid = await pluginsGrid(page, '61-control-plugins-grid');
                await snap(page, '61b-control-plugins-page', {feedRow: grid.feedRow, generic: grid.generic});
                const options = await sidebarOptions(page, app, A.path, '62-control-sidebar');
                const home = await publicRead(page, app, A.path, '63-control-public');
                record('64-control-summary', {feeds: Object.fromEntries(Object.entries(feeds).map(([k, v]) => [k, {status: v.status, is404: v.is404, bodyHead: v.bodyHead.slice(0, 120)}])), feedRowPresent: !!grid.feedRow, sidebarOptions: options.map((o) => o.label), homeFeedBlock: home.home.feedBlock, altLinks: home.home.altLinks});
                return;
            }
            if (on('feed') || on('feedA')) {
            // --- A as found: the block on which pages, the feeds ---
            const pubA = await publicRead(page, app, A.path, '60-feed-a-asfound', {id: A.callId || (A.seeded[0] && A.seeded[0].id)});
            await page.goto(ctxUrl(app, A.path, '/about'));
            await idle(page);
            const aboutA = {url: page.url(), feedBlock: await feedBlock(page), altLinks: await altLinks(page)};
            await snap(page, '60-feed-a-asfound-about', aboutA);
            await loc(page, 'the sidebar\'s announcement feed box (home page)', page.locator('.block_announcement_feed'));
            const feedsA = await readFeeds(page, app, A.path, '61-feeds-a-asfound');
            const mgrList = await (async () => { await as(page, A.users.mgr, A.path); return openAnnouncementsPage(page, app, A.path); })();
            record('61b-feeds-a-summary', {managerRows: (mgrList.rows || []).map((r) => r.title), feedTitles: Object.fromEntries(FEEDS.map((t) => [t, {status: feedsA[t].status, contentType: feedsA[t].contentType, feedTitle: feedsA[t].feedTitle, entries: feedsA[t].entries.map((e) => e.title)}])), blockOn: {home: !!pubA.home.feedBlock, list: !!pubA.list.feedBlock, view: !!(pubA.view && pubA.view.feedBlock), about: !!aboutA.feedBlock}, altLinks: {home: pubA.home.altLinks, list: pubA.list.altLinks, about: aboutA.altLinks}});
            // --- the Plugins grid and the settings window ---
            await openWebsite(page, app, A.path, 'plugins');
            const gridA = await pluginsGrid(page, '62-plugins-grid-a');
            await snap(page, '62b-plugins-page-a', {feedRow: gridA.feedRow});
            await loc(page, 'Website › Plugins: the "Announcement Feed Plugin" row\'s Enabled box', feedRow(page).getByRole('checkbox').first());
            const win0 = await openFeedSettings(page, app, A.path);
            await snap(page, '63-feed-window-default', {window: win0});
            await loc(page, 'Announcement Feed Plugin window: the three "Display feed links…" radios', dialog(page).getByRole('radio'));
            await loc(page, 'Announcement Feed Plugin window: the "Limit feed to" box', dialog(page).locator('input[name="recentItems"]'));
            await loc(page, 'Announcement Feed Plugin window: the submit button', dialog(page).locator('button').filter({hasText: /^(OK|Save)$/}));
            await loc(page, 'Announcement Feed Plugin window: "Cancel" (a link)', dialog(page).getByRole('link', {name: 'Cancel', exact: true}));
            // Cancel with a change: nothing saved
            await dialog(page).locator('input[type=radio][value="all"]').check();
            await dialog(page).locator('input[name="recentItems"]').fill('7');
            await closeWindow(page);
            const winAfterCancel = await openFeedSettings(page, app, A.path);
            await snap(page, '64-feed-window-after-cancel', {window: winAfterCancel});
            // the box at the other end: text, zero, a negative, a decimal
            const boxTrials = {};
            for (const v of ['abc', '0', '-3', '2.5']) {
                const s = await feedWindowSave(page, {recentItems: v});
                const re = await openFeedSettings(page, app, A.path);
                boxTrials[v] = {save: {status: s.status, jsonStatus: s.jsonStatus, stillOpen: s.stillOpen, errors: s.after && s.after.errors}, reopened: {textboxes: re.textboxes, radios: re.radios.filter((r) => r.checked).map((r) => r.value)}};
            }
            record('65-feed-window-box-trials', boxTrials);
            // "Limit feed to 2" with "all": which two the feeds carry (A7)
            const s2 = await feedWindowSave(page, {displayPage: 'all', recentItems: '2'});
            const win2 = await openFeedSettings(page, app, A.path);
            await snap(page, '66-feed-window-limit2-all', {save: s2, window: win2});
            await closeWindow(page);
            const feedsLimit = await readFeeds(page, app, A.path, '67-feeds-limit2');
            record('67b-feeds-limit2-summary', Object.fromEntries(FEEDS.map((t) => [t, {entries: feedsLimit[t].entries.map((e) => ({title: e.title, date: e.date})), updated: feedsLimit[t].updated}])));
            // "all": the box on /about too (signed in as the manager is fine for the public pages; read signed out to be safe)
            await signOut(page);
            const pubAll = await publicRead(page, app, A.path, '68-feed-a-all');
            await page.goto(ctxUrl(app, A.path, '/about')); await idle(page);
            const aboutAll = {feedBlock: await feedBlock(page), altLinks: await altLinks(page)};
            await snap(page, '68-feed-a-all-about', aboutAll);
            // "announcement": the announcement pages only
            await as(page, A.users.mgr, A.path);
            await openWebsite(page, app, A.path, 'plugins');
            await openFeedSettings(page, app, A.path);
            await feedWindowSave(page, {displayPage: 'announcement'});
            await signOut(page);
            const pubAnn = await publicRead(page, app, A.path, '69-feed-a-announcement', {id: A.callId});
            await page.goto(ctxUrl(app, A.path, '/about')); await idle(page);
            const aboutAnn = {feedBlock: await feedBlock(page)};
            // "homepage": the home page and the announcement pages
            await as(page, A.users.mgr, A.path);
            await openWebsite(page, app, A.path, 'plugins');
            await openFeedSettings(page, app, A.path);
            await feedWindowSave(page, {displayPage: 'homepage', recentItems: ''});
            const winFinal = await openFeedSettings(page, app, A.path);
            await snap(page, '70-feed-window-homepage-cleared', {window: winFinal});
            await closeWindow(page);
            await signOut(page);
            const pubHome = await publicRead(page, app, A.path, '71-feed-a-homepage', {id: A.callId});
            await page.goto(ctxUrl(app, A.path, '/about')); await idle(page);
            const aboutHome = {feedBlock: await feedBlock(page)};
            const feedsCleared = await readFeeds(page, app, A.path, '72-feeds-limit-cleared');
            record('73-display-choices-summary', {
                none: {home: !!pubA.home.feedBlock, list: !!pubA.list.feedBlock, view: !!(pubA.view && pubA.view.feedBlock), about: !!aboutA.feedBlock},
                all: {home: !!pubAll.home.feedBlock, list: !!pubAll.list.feedBlock, about: !!aboutAll.feedBlock},
                announcement: {home: !!pubAnn.home.feedBlock, list: !!pubAnn.list.feedBlock, view: !!(pubAnn.view && pubAnn.view.feedBlock), about: !!aboutAnn.feedBlock},
                homepage: {home: !!pubHome.home.feedBlock, list: !!pubHome.list.feedBlock, view: !!(pubHome.view && pubHome.view.feedBlock), about: !!aboutHome.feedBlock},
                clearedEntries: feedsCleared.atom.entries.map((e) => e.title),
            });
            // the Sidebar list on A
            await as(page, A.users.mgr, A.path);
            const sidebarA = await sidebarOptions(page, app, A.path, '74-sidebar-a');
            await loc(page, 'Appearance › Setup › Sidebar: the "Announcement Feed Plugin" box', page.locator('#appearance [role="tabpanel"]:visible .pkpFormField').filter({hasText: 'Sidebar'}).first().getByRole('checkbox', {name: /Announcement Feed/}));
            // --- B: announcements off, plugin on, block placed ---
            await signOut(page);
            const feedsB = await readFeeds(page, app, B.path, '75-feeds-b-off');
            const pubB = await publicRead(page, app, B.path, '76-public-b-off');
            await as(page, B.users.mgr, B.path);
            const sidebarB = await sidebarOptions(page, app, B.path, '77-sidebar-b');
            await openWebsite(page, app, B.path, 'plugins');
            const gridB = await pluginsGrid(page, '77b-plugins-grid-b');
            record('78-b-summary', {feeds: Object.fromEntries(FEEDS.map((t) => [t, {status: feedsB[t].status, is404: feedsB[t].is404, bodyHead: feedsB[t].bodyHead.slice(0, 100)}])), home: {status: pubB.home.status, feedBlock: pubB.home.feedBlock, altLinks: pubB.home.altLinks}, list: {status: pubB.list.status, is404: pubB.list.is404}, sidebar: sidebarB, feedRow: gridB.feedRow});
            }
            if (on('feed') || on('feedC')) {
            // an unknown feed type on A (sweep): where the address lands
            record('79-feed-unknown-type', {unknown: await readFeed(page, feedUrl(app, A.path, 'foo')), noType: await readFeed(page, ctxUrl(app, A.path, '/gateway/plugin/AnnouncementFeedGatewayPlugin'))});
            // --- C: the plugin as installed ---
            await signOut(page).catch(() => {});
            const feedsC0 = await readFeeds(page, app, C.path, '80-feeds-c-asinstalled');
            const pubC0 = await publicRead(page, app, C.path, '81-public-c-asinstalled');
            await as(page, C.users.mgr, C.path);
            const sidebarC0 = await sidebarOptions(page, app, C.path, '82-sidebar-c-asinstalled');
            await openWebsite(page, app, C.path, 'plugins');
            const gridC0 = await pluginsGrid(page, '83-plugins-grid-c-asinstalled');
            await snap(page, '83b-plugins-page-c', {feedRow: gridC0.feedRow});
            const enable = await setPluginEnabled(page, true);
            const gridC1 = await pluginsGrid(page, '84-plugins-grid-c-ticked');
            await snap(page, '84b-plugins-page-c-ticked', {enable, feedRow: gridC1.feedRow});
            const sidebarC1 = await sidebarOptions(page, app, C.path, '85-sidebar-c-ticked');
            const feedsC1 = await readFeeds(page, app, C.path, '86-feeds-c-ticked');
            const pubC1 = await publicRead(page, app, C.path, '87-public-c-ticked');
            // place the block, then disable the plugin: the box and the feeds
            const panel = page.locator('#appearance [role="tabpanel"]:visible').filter({hasText: 'Sidebar'}).first();
            const f = panel.locator('.pkpFormField').filter({hasText: 'Sidebar'}).first();
            const box = f.locator('input[type=checkbox][value="AnnouncementFeedBlockPlugin"]').first();   // the box's accessible name is not its label text here; the value is the block's registry name
            let placed = null;
            if (await box.count()) {
                await box.check();
                const w = page.waitForResponse((r) => /api\/v1\/contexts\/\d+/.test(r.url()) && r.request().method() !== 'GET', {timeout: T}).catch(() => null);
                await panel.getByRole('button', {name: 'Save', exact: true}).click();
                const resp = await w;
                await panel.locator('[role="status"]:has-text("Saved")').waitFor({timeout: T}).catch(() => {});
                placed = {status: resp ? resp.status() : null};
                await snap(page, '88-sidebar-c-placed', placed);
            }
            const pubC2 = await publicRead(page, app, C.path, '89-public-c-placed');
            await openWebsite(page, app, C.path, 'plugins');
            const disable = await setPluginEnabled(page, false);
            const gridC2 = await pluginsGrid(page, '90-plugins-grid-c-unticked');
            const feedsC2 = await readFeeds(page, app, C.path, '91-feeds-c-unticked');
            const pubC3 = await publicRead(page, app, C.path, '92-public-c-unticked');
            const sidebarC2 = await sidebarOptions(page, app, C.path, '93-sidebar-c-unticked');
            record('94-c-summary', {
                asInstalled: {feedRow: gridC0.feedRow, sidebar: sidebarC0.map((o) => o.label), feeds: Object.fromEntries(FEEDS.map((t) => [t, feedsC0[t].status])), homeFeedBlock: pubC0.home.feedBlock},
                ticked: {enable, feedRow: gridC1.feedRow, sidebar: sidebarC1.map((o) => o.label), feeds: Object.fromEntries(FEEDS.map((t) => [t, feedsC1[t].status])), homeFeedBlock: pubC1.home.feedBlock},
                placed: {save: placed, homeFeedBlock: pubC2.home.feedBlock},
                unticked: {disable, feedRow: gridC2.feedRow, sidebar: sidebarC2, feeds: Object.fromEntries(FEEDS.map((t) => [t, feedsC2[t].status])), homeFeedBlock: pubC3.home.feedBlock},
            });
            }
            note(`K5 ojs: Website › Plugins: the feed row is \`#pluginGridContainer tr.gridRow\` filtered by "Announcement Feed Plugin"; its "Settings" link (class show_extras) only expands the row, the real Settings action is \`getByRole('link', {name: 'Settings', exact: true})\` inside the following \`tr.row_controls:visible\` scoped to #pluginGridContainer (the Navigation grids on the same page have row_controls too); the window is \`[role="dialog"]:visible\` headed "Announcement Feed Plugin" with radios by value (all/homepage/announcement), \`input[name="recentItems"]\`, a submit button "${(typeof win0 !== 'undefined' && win0.buttons || []).map((b) => b.text).join('/')}" and "Cancel" as a link (pitfall 7); the Enabled box's click redraws the row (setChecked throws on the verification, click + waitForResponse on settings-plugin-grid/enable works). Feeds are read with page.request.get (Chromium would download the XML).`);
        } finally { await close(); }
    }
});
