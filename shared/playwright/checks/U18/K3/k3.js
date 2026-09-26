// U18 claim check, chunk K3: purpose (the plugin on a new context, the window's
// choices, the box, an item's parts and link), the gateway address and odd feed
// / plugin names (Rule 15, A2, td14), the LOCKSS and CLOCKSS pages {OJS}, the
// announcement feed beside the article feeds {OJS} with read-only controls on
// OMP and OPS, the placed box while the plugin is disabled, the site's own
// Plugins / Sidebar / home page (Rule 18, td16; restored afterwards), and the
// scenario preamble's premises (footnote s; the seeded journal's feeds).
// Spec: docs/specs/U18-web-feeds.md — Purpose (10–24), Rule 15 (187–194),
// Rule 18 (210–215), Cross-feature interactions (270–301), Canonical scenarios
// preamble (302–308), Coverage (310–345), register A2 (370–377); footnotes a,
// c, h, s, td14, td16, f-a2.
//
// Seeds per app (tag prefix u18k3):
//   P  a new context as the context scenario makes it (no plugin key),
//      announcements on, one category, users mgr / se / rd / au; two published
//      items with keywords (OJS, OPS) and the category, OJS one in a published
//      issue; one submitted, unpublished item
//   E  nothing published, the plugin and the box seeded through footnote s's
//      keys (`plugins` + `sidebar`)
// Phases (PHASES=a,b,…; default all, in this order):
//   seed purpose gateway lockss feeds cross site siterestore empty
// Run: PROBE_FEATURE=U18 PROBE_AGENT=ccK3 node bin/probe.js all shared/playwright/checks/U18/K3/k3.js
//   RESEED=1 seeds afresh; GW_CTX=E repeats `gateway` on E (g2-*); SITE_RUN=2 keeps a second `site` run under site2 / siterestore2. `site` always ends by restoring the site (`siterestore`
//   alone restores it after an interrupted run).
const fs = require('fs');
const path = require('path');
const {execFileSync} = require('child_process');
const {forEachApp, launch, signIn, signOut, screen, shot, record, loc, note, idle, tag, outDir} =
    require('../../../probe');

const ALL_PHASES = ['seed', 'purpose', 'gateway', 'lockss', 'feeds', 'cross', 'site', 'siterestore', 'empty'];
const PHASES = process.env.PHASES ? process.env.PHASES.split(',') : ALL_PHASES;
const on = (p) => PHASES.includes(p);
const log = (...a) => console.log('[k3]', ...a);
const stateFile = (app) => path.join(outDir(), `k3-state-${app.name}.json`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const T = 20_000;
const flat = (s, n = 400) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const short = (u) => String(u || '').replace(/^https?:\/\/[^/]+/, '');
const FEEDS = ['atom', 'rss2', 'rss'];

const ctxUrl = (app, ctxPath, p = '') => app.url(`/index.php/${ctxPath}${p}`);
const feedUrl = (app, ctxPath, type) => ctxUrl(app, ctxPath, `/gateway/plugin/WebFeedGatewayPlugin/${type}`);
const dialog = (page) => page.locator('[role="dialog"]:visible').last();

let FACTS = {};
function fact(key, value) {
    FACTS[key] = value;
    record('facts', {[key]: value}, {merge: true});
}
async function snap(page, name, extra = {}) {
    const s = await screen(page).catch((e) => ({screenError: String(e.message || e).slice(0, 200)}));
    record(name, {...s, ...extra});
    await shot(page, name).catch(() => {});
    return s;
}

// ---- DB read (psql is the parity ground truth) -----------------------------
function psql(app, sql) {
    const cfg = fs.readFileSync(app.configFile, 'utf8');
    const db = cfg.split(/^\[database\]/m)[1] || '';
    const get = (k) => ((db.match(new RegExp(`^${k}\\s*=\\s*(.*)$`, 'm')) || [])[1] || '').trim().replace(/^"|"$/g, '');
    try {
        return execFileSync('psql', ['-h', get('host') || '127.0.0.1', '-U', get('username'), get('name'), '-At', '-F', '|', '-c', sql],
            {env: {...process.env, PGPASSWORD: get('password')}, encoding: 'utf8', timeout: 20_000}).trim().split('\n').filter(Boolean);
    } catch (e) { return [`ERROR ${String(e.message).slice(0, 300)}`]; }
}
const siteRows = (app) => ({
    plugin: psql(app, "select plugin_name, context_id, setting_name, setting_value, setting_type from plugin_settings where context_id is null and plugin_name in ('webfeedplugin','webfeedblockplugin') order by setting_name"),
    sidebar: psql(app, "select setting_name, setting_value from site_settings where setting_name='sidebar'"),
});

// ---- page reads -----------------------------------------------------------
async function pageBits(page) {
    return page.evaluate(() => {
        const box = (sel) => {
            const b = document.querySelector(sel);
            return b ? {
                heading: b.querySelector('h2, .title')?.innerText.trim() ?? null,
                links: [...b.querySelectorAll('a')].map((a) => ({href: a.getAttribute('href'), alt: a.querySelector('img')?.getAttribute('alt') ?? null})),
            } : null;
        };
        return {
            bodyClass: document.body ? document.body.className : null,
            hasSidebar: !!document.querySelector('.pkp_structure_sidebar'),
            sidebarBlocks: [...document.querySelectorAll('.pkp_structure_sidebar .pkp_block')].map((x) => x.className.replace('pkp_block ', '')),
            webFeedBox: box('.block_web_feed'),
            annFeedBox: box('.block_announcement_feed'),
            alternates: [...document.querySelectorAll('head link[rel="alternate"]')].map((l) => ({type: l.getAttribute('type'), href: l.getAttribute('href')})),
            h1: [...document.querySelectorAll('h1')].map((h) => h.innerText.replace(/\s+/g, ' ').trim()).slice(0, 3),
        };
    }).catch((e) => ({error: String(e.message || e)}));
}

/** Navigate (goto or a click) and record the main-frame chain, the page shown and its tab title. */
async function nav(page, name, action) {
    const chain = [];
    const onResp = (r) => {
        try { if (r.request().isNavigationRequest() && r.frame() === page.mainFrame()) chain.push({url: short(r.url()), status: r.status(), type: (r.headers()['content-type'] || '').split(';')[0]}); } catch { /* */ }
    };
    page.on('response', onResp);
    const dlp = page.waitForEvent('download', {timeout: 10_000}).catch(() => null);
    let error = null;
    try { await action(); } catch (e) { error = String(e.message || e).split('\n')[0].slice(0, 200); }
    let download = null;
    if (error && /Download is starting/.test(error)) {
        const d = await dlp;
        download = d ? {file: d.suggestedFilename(), url: short(d.url())} : null;
    } else {
        await page.waitForLoadState('load', {timeout: 10_000}).catch(() => {});
        await Promise.race([idle(page), sleep(8000)]).catch(() => {});
    }
    page.off('response', onResp);
    const out = {chain, error, download, url: short(page.url()), title: await page.title().catch(() => null)};
    if (!download) {
        Object.assign(out, await pageBits(page));
        const text = await page.locator('body').innerText().catch(() => '');
        out.text = flat(text, 500);
        out.is404 = /404 Not Found/.test(text);
        await snap(page, name, out);
    } else {
        record(name, out);
    }
    return out;
}
const gotoNav = (page, name, url) => nav(page, name, () => page.goto(url));
const navBrief = (n) => ({chain: n.chain, url: n.url, title: n.title, h1: n.h1, bodyClass: n.bodyClass, is404: n.is404, download: n.download, error: n.error, text: flat(n.text, 160), webFeedBox: n.webFeedBox ? `${n.webFeedBox.heading} [${n.webFeedBox.links.map((l) => l.alt).join(', ')}]` : null, annFeedBox: n.annFeedBox ? `${n.annFeedBox.heading} [${n.annFeedBox.links.map((l) => short(l.href)).join(', ')}]` : null, alternates: (n.alternates || []).map((a) => `${a.type} ${short(a.href)}`)});

/** A feed read the way a feed reader reads it (NOT in the kit's run record: statuses kept here). */
async function readFeed(req, url) {
    const r = await req.get(url, {failOnStatusCode: false, maxRedirects: 5});
    const body = await r.text();
    const tagText = (s, t) => { const m = s.match(new RegExp(`<${t}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${t}>`)); return m ? m[1].trim() : null; };
    const items = [...body.matchAll(/<(entry|item)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/g)].map((m) => m[2]);
    return {
        url: short(url), finalUrl: short(r.url()), status: r.status(), contentType: r.headers()['content-type'] || null, length: body.length,
        channelTitle: tagText(body.replace(/<(entry|item)[\s\S]*$/, ''), 'title'),
        items: items.map((it) => ({
            title: tagText(it, 'title'),
            authors: [...it.matchAll(/<name>([\s\S]*?)<\/name>|<dc:creator>([\s\S]*?)<\/dc:creator>/g)].map((m) => (m[1] || m[2] || '').trim()),
            link: (it.match(/<link[^>]*href="([^"]+)"/) || it.match(/<link>([^<]+)<\/link>/) || [])[1] || null,
            summary: flat((tagText(it, 'summary') || tagText(it, 'description') || '').replace(/&lt;|&gt;|<!\[CDATA\[|\]\]>/g, ' '), 300),
            categories: [...it.matchAll(/<category term="([^"]*)" label="([^"]*)"/g)].map((m) => `${m[2]}: ${m[1]}`),
        })),
        head: body.slice(0, 200),
    };
}

// ---- Settings screens -------------------------------------------------------
async function openTab(page, app, ctxPath, top) {
    await page.goto(ctxPath === 'index' ? app.url('/index.php/index/en/admin/settings') : ctxUrl(app, ctxPath, '/management/settings/website'));
    await idle(page);
    await page.locator(`#${top}-button`).first().click();
    await idle(page);
    await sleep(700);
}
const pluginRow = (page, name) => page.locator('#pluginGridContainer tr.gridRow').filter({hasText: name}).first();
async function readRow(page, name, {expand = true} = {}) {
    const row = pluginRow(page, name);
    await row.waitFor({timeout: 8000}).catch(() => {});
    if (!(await row.count())) return {present: false};
    const data = await row.evaluate((r) => {
        const box = r.querySelector('input[type=checkbox]');
        const tb = r.closest('tbody');
        const first = tb ? tb.querySelector('tr') : null;
        return {present: true, id: r.id, text: r.innerText.replace(/\s+/g, ' ').trim(), enabled: box ? box.checked : null, category: first && first !== r ? first.innerText.replace(/\s+/g, ' ').trim() : null};
    });
    if (expand) {
        const ex = row.locator('a.show_extras').first();
        if (await ex.count()) { await ex.click(); await sleep(500); }
        data.controls = await row.locator('xpath=following-sibling::tr[1]').evaluate((tr) => [...tr.querySelectorAll('a')].filter((a) => a.offsetParent !== null).map((a) => a.innerText.trim())).catch(() => null);
    }
    return data;
}
async function allPluginRows(page) {
    return page.locator('#pluginGridContainer tr.gridRow').evaluateAll((rows) => rows.map((r) => {
        const cells = r.querySelectorAll('td');
        return (cells[0] ? cells[0].innerText : r.innerText).replace(/\s+/g, ' ').replace(/^Settings /, '').trim().slice(0, 60);
    })).catch(() => []);
}
async function toasts(page) { return (await page.locator('.pkpNotification, .app__notifications, [role="alert"]').allInnerTexts().catch(() => [])).map((x) => flat(x, 200)).filter(Boolean); }
async function setEnabled(page, name, want) {
    const box = pluginRow(page, name).getByRole('checkbox').first();
    const was = await box.isChecked();
    if (was === want) return {changed: false, checked: was};
    const w = page.waitForResponse((r) => /plugin-grid\/(enable|disable)/.test(r.url()), {timeout: T}).catch(() => null);
    await box.click({noWaitAfter: true}).catch(() => box.dispatchEvent('click'));
    await sleep(900);
    const dlg = page.locator('[role="dialog"]:visible');
    let dialogText = null;
    if (await dlg.count()) {
        dialogText = flat(await dlg.last().innerText(), 400);
        const ok = dlg.last().getByRole('button', {name: /^(OK|Yes)$/}).first();
        if (await ok.count()) await ok.click();
    }
    const resp = await w;
    let json = null;
    try { json = resp ? await resp.json() : null; } catch { json = null; }
    await sleep(900);
    await idle(page);
    return {changed: true, status: resp ? resp.status() : null, jsonStatus: json && json.status, dialogText, toasts: await toasts(page), checked: await pluginRow(page, name).getByRole('checkbox').first().isChecked().catch(() => null)};
}
async function windowState(page) {
    const d = dialog(page);
    if (!(await d.count())) return {open: false};
    return d.evaluate((root) => {
        const txt = (el) => (el ? el.innerText.replace(/\s+/g, ' ').trim() : null);
        const lab = (i) => { const l = root.querySelector(`label[for="${i.id}"]`) || i.closest('label'); return l ? l.innerText.replace(/\s+/g, ' ').trim() : null; };
        const form = root.querySelector('#webFeedSettingsForm');
        return {
            open: true,
            title: txt(root.querySelector('h1, .header')),
            formText: form ? txt(form) : null,
            radios: [...root.querySelectorAll('input[type=radio]')].map((r) => ({name: r.name, value: r.value, checked: r.checked, label: lab(r)})),
            text: [...root.querySelectorAll('input[type=text]')].map((i) => ({name: i.name, value: i.value, label: lab(i)})),
            checkboxes: [...root.querySelectorAll('input[type=checkbox]')].map((i) => ({name: i.name, checked: i.checked, label: lab(i)})),
            buttons: [...root.querySelectorAll('button, input[type=submit]')].filter((b) => b.offsetParent !== null).map((b) => (b.innerText || b.value || b.getAttribute('aria-label') || '').trim()),
            links: [...root.querySelectorAll('a')].filter((a) => a.offsetParent !== null).map((a) => a.innerText.trim()),
        };
    });
}
async function openWindow(page, name = 'Web Feed Plugin') {
    const row = pluginRow(page, name);
    await row.waitFor({timeout: T});
    const ex = row.locator('a.show_extras').first();
    if (await ex.count()) { await ex.click(); await sleep(500); }
    const settings = row.locator('xpath=following-sibling::tr[1]').getByRole('link', {name: 'Settings', exact: true}).first();
    if (!(await settings.count())) return {open: false, noSettingsAction: true};
    await settings.click();
    await page.locator('#webFeedSettingsForm').waitFor({timeout: T}).catch(() => {});
    await idle(page);
    await sleep(500);
    return windowState(page);
}
async function windowOK(page) {
    const w = page.waitForResponse((r) => r.request().method() === 'POST' && /manage/.test(r.url()), {timeout: T}).catch(() => null);
    await dialog(page).getByRole('button', {name: 'OK', exact: true}).click();
    const resp = await w;
    await sleep(900);
    await idle(page);
    return {status: resp ? resp.status() : null, url: resp ? short(resp.url()).replace(/csrfToken=[^&]+/, '') : null, stillOpen: (await page.locator('#webFeedSettingsForm:visible').count()) > 0, toasts: await toasts(page)};
}
async function windowCancel(page) {
    const d = dialog(page);
    if (!(await d.count())) return;
    await d.getByRole('link', {name: 'Cancel', exact: true}).first().click().catch(() => {});
    await page.locator('#webFeedSettingsForm').waitFor({state: 'detached', timeout: T}).catch(() => {});
    await sleep(700);
}
async function openAppearanceSetup(page, app, ctxPath) {
    await openTab(page, app, ctxPath, 'appearance');
    await page.locator('#appearance').getByRole('tab', {name: 'Setup', exact: true}).first().click();
    await idle(page);
    await sleep(800);
}
const sidebarList = (page) => page.locator('input[name="sidebar"]').evaluateAll((els) => els.map((e) => ({value: e.value, checked: e.checked, label: (e.closest('label') || e.parentElement).innerText.replace(/\s+/g, ' ').trim()})));
async function saveAppearance(page) {
    const form = page.locator('form').filter({has: page.locator('input[name="sidebar"]')}).first();
    const w = page.waitForResponse((r) => /\/api\/v1\/(contexts|site)/.test(r.url()) && r.request().method() !== 'GET', {timeout: T}).catch(() => null);
    await form.getByRole('button', {name: 'Save', exact: true}).click();
    const r = await w;
    const saved = await page.locator('[role="status"]:has-text("Saved")').first().waitFor({timeout: 8000}).then(() => true).catch(() => false);
    await sleep(400);
    const errors = (await page.locator('.pkpFieldError').allInnerTexts().catch(() => [])).map((x) => flat(x, 300));
    return {status: r ? r.status() : null, url: r ? short(r.url()) : null, saved, errors};
}

// ---- the page set that carries the box -------------------------------------
const gatewayProbes = [
    ['bare', '/gateway'],
    ['bare-slash', '/gateway/'],
    ['index', '/gateway/index'],
    ['unknown-op', '/gateway/nosuchop'],
    ['lockss', '/gateway/lockss'],
    ['clockss', '/gateway/clockss'],
    ['plugin-none', '/gateway/plugin'],
    ['nosuch', '/gateway/plugin/NoSuchPlugin/atom'],
    ['lowercase', '/gateway/plugin/webfeedgatewayplugin/atom'],
    ['generic-name', '/gateway/plugin/WebFeedPlugin/atom'],
    ['block-name', '/gateway/plugin/WebFeedBlockPlugin/atom'],
    ['announcement', '/gateway/plugin/AnnouncementFeedGatewayPlugin/atom'],
    ['json', '/gateway/plugin/WebFeedGatewayPlugin/json'],
    ['none', '/gateway/plugin/WebFeedGatewayPlugin'],
    ['none-slash', '/gateway/plugin/WebFeedGatewayPlugin/'],
    ['upper', '/gateway/plugin/WebFeedGatewayPlugin/ATOM'],
    ['xml-suffix', '/gateway/plugin/WebFeedGatewayPlugin/atom.xml'],
    ['extra-segment', '/gateway/plugin/WebFeedGatewayPlugin/atom/extra'],
    ['query-type', '/gateway/plugin/WebFeedGatewayPlugin?type=atom'],
    ['atom', '/gateway/plugin/WebFeedGatewayPlugin/atom'],
    ['rss2', '/gateway/plugin/WebFeedGatewayPlugin/rss2'],
];

// ---------------------------------------------------------------------------
forEachApp(async (app) => {
    const isOJS = app.name === 'ojs';
    const isOMP = app.name === 'omp';
    let st = fs.existsSync(stateFile(app)) ? JSON.parse(fs.readFileSync(stateFile(app), 'utf8')) : null;
    const saveState = () => fs.writeFileSync(stateFile(app), JSON.stringify(st, null, 2));
    FACTS = {};
    const step = async (name, fn) => {
        log(app.name, '== step', name);
        try { return await fn(); } catch (e) {
            fact(`ERROR-${name}`, String(e.stack || e).slice(0, 900));
            log(app.name, 'ERROR', name, String(e.message || e).slice(0, 300));
            return null;
        }
    };

    // ---- seed ---------------------------------------------------------------
    if ((on('seed') && (process.env.RESEED === '1' || !st)) || !st) {
        const t = tag('u18k3');
        const tP = `${t}p`, tE = `${t}e`;
        const users = [
            {username: `${tP}mgr`, roles: ['manager'], givenName: 'Mona', familyName: 'Manager'},
            {username: `${tP}se`, roles: ['sectionEditor'], givenName: 'Seb', familyName: 'Section'},
            {username: `${tP}rd`, roles: ['reader'], givenName: 'Rita', familyName: 'Reader'},
            {username: `${tP}au`, roles: ['author'], givenName: 'Ansel', familyName: 'Author'},
        ];
        const seedLog = {};
        const cP = await app.api.createContext({
            tag: tP, context: {name: `U18 K3 P ${tP}`, acronym: 'K3P'}, users, enableAnnouncements: true,
            categories: [{path: 'k3cat', title: 'K3 Category'}],
            ...(isOJS ? {issues: [{volume: 1, number: 1, year: 2025, published: true}]} : {}),
        });
        const terms = isOMP ? {} : {keywords: ['k3keyword']};
        const sub = async (k, spec) => (await app.api.createSubmission({tag: `${t}${k}`, context: tP, submitter: `${tP}au`, title: `K3 ${k} ${t}`, abstract: `Abstract of K3 ${k}.`, submitted: true, ...spec})).submissionId;
        const subs = {};
        subs.pub1 = await sub('pub1', {published: true, categories: ['k3cat'], ...terms, ...(isOJS ? {issue: {volume: 1, number: 1, year: 2025}} : {})});
        subs.pub2 = await sub('pub2', {published: true});
        subs.draft = await sub('draft', {});
        // footnote s: "a press takes categories only" — a keyword on a press
        if (isOMP) {
            seedLog.ompKeywords = await app.api.createSubmission({tag: `${t}kw`, context: tP, submitter: `${tP}au`, submitted: true, published: true, keywords: ['x']}).then((r) => ({accepted: true, id: r.submissionId})).catch((e) => ({refused: flat(e.message, 400)}));
        }
        // footnote s: `sidebar` alone, then with `plugins`
        seedLog.sidebarAlone = await app.api.createContext({tag: `${tE}x`, context: {name: `U18 K3 Ex ${tE}x`}, sidebar: ['WebFeedBlockPlugin']}).then((r) => ({accepted: true, path: r.path})).catch((e) => ({refused: flat(e.message, 400)}));
        const cE = await app.api.createContext({tag: tE, context: {name: `U18 K3 E ${tE}`, acronym: 'K3E'}, plugins: {webfeedplugin: {enabled: true}}, sidebar: ['WebFeedBlockPlugin']});
        st = {tag: t, P: {path: tP, id: cP.contextId, name: `U18 K3 P ${tP}`, u: Object.fromEntries(users.map((x) => [x.username.slice(tP.length), x.username])), subs, issueId: isOJS && cP.issues ? cP.issues[0].id : null}, E: {path: tE, name: `U18 K3 E ${tE}`}, seedLog};
        saveState();
        record('00-seed', {st, P: cP, E: cE});
        note(`ccK3 ${app.name}: scratch P ${tP} (mgr/se/rd/au; announcements on; category k3cat; items ${JSON.stringify(subs)}${isOJS ? ', issue ' + st.P.issueId : ''}); E ${tE} (nothing published, plugin + box seeded). Seed: sidebar alone ${seedLog.sidebarAlone.refused ? 'refused (400)' : 'accepted'}${isOMP ? '; keywords on a press ' + (seedLog.ompKeywords.refused ? 'refused (400)' : 'accepted') : ''}.`);
    }
    const P = st.P;

    const {page, close} = await launch(app);
    const dialogs = [];
    page.on('dialog', (d) => { dialogs.push({type: d.type(), message: d.message(), at: short(page.url())}); d.accept().catch(() => {}); });
    const as = async (user, ctxPath) => { if (!user) { await signOut(page).catch(() => {}); return; } await signIn(page, user, {contextPath: ctxPath}); await idle(page); };
    try {
        // ================= purpose: lines 12–23 ==============================
        if (on('purpose')) {
            await step('purpose', async () => {
                const out = {};
                await as(P.u.mgr, P.path);
                await openTab(page, app, P.path, 'plugins');
                out.rows = await allPluginRows(page);
                out.webFeedRow = await readRow(page, 'Web Feed Plugin');
                out.announcementRow = await readRow(page, 'Announcement Feed Plugin', {expand: false});
                await snap(page, 'p-01-plugins-mgr', {webFeedRow: out.webFeedRow, announcementRow: out.announcementRow, rows: out.rows});
                await loc(page, 'Website › Plugins: the "Web Feed Plugin" row', pluginRow(page, 'Web Feed Plugin'));
                await openTab(page, app, P.path, 'plugins');
                const w = await openWindow(page);
                out.window = {title: w.title, radios: (w.radios || []).map((r) => `${r.name}=${r.value}${r.checked ? '*' : ''} "${r.label}"`), text: w.text, checkboxes: w.checkboxes, buttons: w.buttons, links: w.links};
                await snap(page, 'p-02-window', {window: w});
                await windowCancel(page);
                // place the box through "Sidebar"
                await openAppearanceSetup(page, app, P.path);
                out.sidebarBefore = await sidebarList(page);
                // leave the tab once with a change unsaved (the sweep)
                const d0 = dialogs.length;
                await page.locator('input[name="sidebar"][value="WebFeedBlockPlugin"]').first().setChecked(true);
                await page.goto(ctxUrl(app, P.path, '')).catch((e) => { out.leaveError = String(e.message).slice(0, 120); });
                await idle(page);
                out.leaveDialogs = dialogs.slice(d0);
                await openAppearanceSetup(page, app, P.path);
                out.sidebarAfterLeave = (await sidebarList(page)).filter((o) => o.checked).map((o) => o.value);
                await page.locator('input[name="sidebar"][value="WebFeedBlockPlugin"]').first().setChecked(true);
                out.save = await saveAppearance(page);
                out.sidebarSamePage = (await sidebarList(page)).filter((o) => o.checked).map((o) => o.value);
                await snap(page, 'p-03-sidebar-saved', {save: out.save, list: out.sidebarBefore});
                await openAppearanceSetup(page, app, P.path);
                out.sidebarAfterReload = (await sidebarList(page)).filter((o) => o.checked).map((o) => o.value);
                // a role without the Settings pages (control)
                await as(P.u.se, P.path);
                out.seWebsite = navBrief(await gotoNav(page, 'p-04-se-website', ctxUrl(app, P.path, '/management/settings/website')));
                // the visitor: the box, "Atom logo", an item's parts and link
                await as(null);
                const home = await gotoNav(page, 'p-05-home-visitor', ctxUrl(app, P.path, ''));
                out.home = navBrief(home);
                await loc(page, 'public home: the "Latest publications" box', page.locator('.block_web_feed'));
                await loc(page, 'public home: the box\'s "Atom logo" link', page.getByRole('link', {name: 'Atom logo', exact: true}));
                out.atomClick = navBrief(await nav(page, 'p-06-atom-logo-click', () => page.getByRole('link', {name: 'Atom logo', exact: true}).first().click()));
                out.feeds = {};
                for (const f of FEEDS) out.feeds[f] = await readFeed(page.request, feedUrl(app, P.path, f));
                record('p-06b-feeds', out.feeds);
                const firstLink = (out.feeds.atom.items.find((i) => /pub1/.test(i.title || '')) || out.feeds.atom.items[0] || {}).link;
                if (firstLink) out.itemPage = navBrief(await gotoNav(page, 'p-07-item-page', firstLink));
                fact('purpose', out);
            });
        }

        // ================= gateway: Rule 15, A2, td14 ========================
        if (on('gateway')) {
            await step('gateway', async () => {
                // GW_CTX=E repeats the reads on E (LOCKSS never ticked there), prefix g2-
                const G = process.env.GW_CTX === 'E' ? {path: st.E.path, pre: 'g2'} : {path: P.path, pre: 'g'};
                const out = {ctx: G.path, visitor: {}, admin: {}};
                await as(null);
                for (const [k, p] of gatewayProbes) out.visitor[k] = navBrief(await gotoNav(page, `${G.pre}-${k}`, ctxUrl(app, G.path, p)));
                // the error answers as a signed-in Site Administrator and the journal's reader
                await as('admin');
                for (const k of ['json', 'none', 'nosuch']) out.admin[k] = navBrief(await gotoNav(page, `${G.pre}-admin-${k}`, ctxUrl(app, G.path, gatewayProbes.find((x) => x[0] === k)[1])));
                await as(P.u.rd, P.path);
                out.reader = {json: navBrief(await gotoNav(page, `${G.pre}-reader-json`, ctxUrl(app, G.path, '/gateway/plugin/WebFeedGatewayPlugin/json')))};
                fact(G.pre === 'g' ? 'gateway' : 'gateway2', out);
            });
        }

        // ================= lockss: the LOCKSS and CLOCKSS pages {OJS} ========
        if (on('lockss') && isOJS) {
            await step('lockss', async () => {
                const out = {};
                await as(P.u.mgr, P.path);
                const openArch = async () => {
                    await page.goto(ctxUrl(app, P.path, '/management/settings/distribution')); await idle(page);
                    await page.getByRole('tab', {name: 'Archiving', exact: true}).first().click(); await idle(page); await sleep(500);
                    await page.getByRole('tab', {name: 'LOCKSS and CLOCKSS', exact: true}).first().click(); await idle(page); await sleep(600);
                };
                const boxes = () => page.locator('input[name="enableLockss"], input[name="enableClockss"]').evaluateAll((els) => els.map((e) => ({name: e.name, checked: e.checked, label: (e.closest('label') || e.parentElement).innerText.replace(/\s+/g, ' ').trim(), links: [...(e.closest('label') || e.parentElement).querySelectorAll('a')].map((a) => a.getAttribute('href'))})));
                await openArch();
                out.before = await boxes();
                await snap(page, 'l-01-archiving-lockss', {boxes: out.before});
                await loc(page, 'Distribution › Archiving › "LOCKSS and CLOCKSS": the LOCKSS box', page.locator('input[name="enableLockss"]'));
                // leave with a change unsaved
                const d0 = dialogs.length;
                await page.locator('input[name="enableLockss"]').first().setChecked(true);
                await page.goto(ctxUrl(app, P.path, '')).catch(() => {}); await idle(page);
                out.leaveDialogs = dialogs.slice(d0);
                await openArch();
                out.afterLeave = await boxes();
                await page.locator('input[name="enableLockss"]').first().setChecked(true);
                await page.locator('input[name="enableClockss"]').first().setChecked(true);
                const form = page.locator('form').filter({has: page.locator('input[name="enableLockss"]')}).first();
                const w = page.waitForResponse((r) => /\/api\/v1\/contexts/.test(r.url()) && r.request().method() !== 'GET', {timeout: T}).catch(() => null);
                await form.getByRole('button', {name: 'Save', exact: true}).click();
                const r = await w;
                out.save = {status: r ? r.status() : null, saved: await page.locator('[role="status"]:has-text("Saved")').first().waitFor({timeout: 8000}).then(() => true).catch(() => false)};
                await openArch();
                out.afterReload = await boxes();
                await snap(page, 'l-02-archiving-saved', {boxes: out.afterReload, save: out.save});
                await as(null);
                out.lockss = navBrief(await gotoNav(page, 'l-03-lockss-on', ctxUrl(app, P.path, '/gateway/lockss')));
                out.clockss = navBrief(await gotoNav(page, 'l-04-clockss-on', ctxUrl(app, P.path, '/gateway/clockss')));
                fact('lockss', out);
            });
        }

        // ================= feeds: the announcement feed beside the article feeds; the box while disabled
        if (on('feeds')) {
            await step('feeds', async () => {
                const out = {};
                const readBoth = async (name) => {
                    await as(null);
                    const h = navBrief(await gotoNav(page, `${name}-home`, ctxUrl(app, P.path, '')));
                    const web = await readFeed(page.request, feedUrl(app, P.path, 'atom'));
                    const ann = await readFeed(page.request, ctxUrl(app, P.path, '/gateway/plugin/AnnouncementFeedGatewayPlugin/atom'));
                    return {home: {webFeedBox: h.webFeedBox, annFeedBox: h.annFeedBox, sidebarBlocks: h.sidebarBlocks}, webAtom: {status: web.status, type: web.contentType, items: web.items.length}, annAtom: {status: ann.status, type: ann.contentType, title: ann.channelTitle, items: ann.items.length}};
                };
                await as(P.u.mgr, P.path);
                await openTab(page, app, P.path, 'plugins');
                if (isOJS) {
                    out.annEnable = await setEnabled(page, 'Announcement Feed Plugin', true);
                    out.annRow = await readRow(page, 'Announcement Feed Plugin');
                    await snap(page, 'f-01-announcement-enabled', {annEnable: out.annEnable, annRow: out.annRow});
                    await openAppearanceSetup(page, app, P.path);
                    out.sidebarWithAnn = await sidebarList(page);
                    const annBox = page.locator('input[name="sidebar"][value="AnnouncementFeedBlockPlugin"]').first();
                    if (await annBox.count()) { await annBox.setChecked(true); out.annPlace = await saveAppearance(page); }
                    await snap(page, 'f-02-sidebar-with-announcement', {list: out.sidebarWithAnn, save: out.annPlace});
                }
                out.bothOn = await readBoth('f-03-both-on');
                // the Web Feed plugin disabled: the placed box, the list, the feeds
                await as(P.u.mgr, P.path);
                await openTab(page, app, P.path, 'plugins');
                out.webDisable = await setEnabled(page, 'Web Feed Plugin', false);
                await snap(page, 'f-04-webfeed-disabled', {webDisable: out.webDisable});
                await openAppearanceSetup(page, app, P.path);
                out.sidebarWebOff = await sidebarList(page);
                await snap(page, 'f-05-sidebar-webfeed-off', {list: out.sidebarWebOff});
                out.webOff = await readBoth('f-06-webfeed-off');
                await as(P.u.mgr, P.path);
                await openTab(page, app, P.path, 'plugins');
                out.webEnable = await setEnabled(page, 'Web Feed Plugin', true);
                await snap(page, 'f-07-webfeed-enabled-again', {webEnable: out.webEnable});
                await openAppearanceSetup(page, app, P.path);
                out.sidebarWebOnAgain = (await sidebarList(page)).map((o) => `${o.value}${o.checked ? '*' : ''}`);
                out.webOnAgain = await readBoth('f-08-webfeed-on-again');
                if (isOJS) {
                    await as(P.u.mgr, P.path);
                    await openTab(page, app, P.path, 'plugins');
                    out.annDisable = await setEnabled(page, 'Announcement Feed Plugin', false);
                    out.annOff = await readBoth('f-09-announcement-off');
                }
                fact('feeds', out);
            });
        }

        // ================= cross: channel text, item terms, access settings, language
        if (on('cross')) {
            await step('cross', async () => {
                const out = {};
                await as(null);
                const atom = await readFeed(page.request, feedUrl(app, P.path, 'atom'));
                out.channelTitle = atom.channelTitle;
                out.items = atom.items.map((i) => ({title: i.title, categories: i.categories, link: short(i.link)}));
                out.draftListed = atom.items.some((i) => /draft/.test(i.title || ''));
                // a feed read in another interface language (publicknowledge carries fr_CA; read only)
                const fr = await readFeed(page.request, ctxUrl(app, app.contextPath, '/fr_CA/gateway/plugin/WebFeedGatewayPlugin/rss2'));
                out.frRss2 = {status: fr.status, finalUrl: fr.finalUrl, language: (fr.head.match(/<language>([^<]+)/) || [])[1] || null};
                const frBody = await page.request.get(ctxUrl(app, app.contextPath, '/fr_CA/gateway/plugin/WebFeedGatewayPlugin/rss2')).then((r) => r.text()).catch(() => '');
                out.frRss2.language = (frBody.match(/<language>([^<]+)<\/language>/) || [])[1] || null;
                // the two access settings on their own screens (read only)
                await as(P.u.mgr, P.path);
                await page.goto(ctxUrl(app, P.path, '/management/settings/access')); await idle(page);
                await page.getByRole('tab', {name: 'Site Access Options', exact: true}).click().catch(() => {}); await idle(page); await sleep(500);
                const box = page.getByRole('checkbox', {name: /Users must be registered and log in to view the/});
                out.siteAccess = {label: await box.evaluate((e) => (e.closest('label') || e.parentElement).innerText.trim()).catch(() => null), checked: await box.isChecked().catch(() => null)};
                await snap(page, 'x-01-site-access-options', out.siteAccess);
                await as('admin');
                await page.goto(app.url('/index.php/index/en/admin/contexts')); await idle(page); await sleep(400);
                const row = page.locator('tr.gridRow').filter({hasText: P.name}).first();
                await row.locator('a.show_extras').click(); await idle(page); await sleep(300);
                await row.locator('xpath=following-sibling::tr[1]').getByRole('link', {name: 'Edit', exact: true}).click();
                const cb = page.getByRole('checkbox', {name: /appear publicly on the site/});
                await cb.waitFor({timeout: T}).catch(() => {});
                out.hosted = {label: await cb.evaluate((e) => (e.closest('label') || e.parentElement).innerText.trim()).catch(() => null), checked: await cb.isChecked().catch(() => null)};
                await snap(page, 'x-02-hosted-edit', out.hosted);
                fact('cross', out);
            });
        }

        // ================= site: Rule 18, td16 (restored at the end) ===========
        const siteRestore = async (why) => {
            const out = {why};
            await as('admin');
            await openAppearanceSetup(page, app, 'index');
            const wf = page.locator('input[name="sidebar"][value="WebFeedBlockPlugin"]').first();
            if ((await wf.count()) && (await wf.isChecked())) { await wf.setChecked(false); out.save = await saveAppearance(page); }
            out.sidebar = (await sidebarList(page)).map((o) => `${o.value}${o.checked ? '*' : ''}`);
            await openTab(page, app, 'index', 'plugins');
            out.disable = await setEnabled(page, 'Web Feed Plugin', false);
            out.row = await readRow(page, 'Web Feed Plugin');
            await snap(page, 's-20-restored-plugins', out);
            await as(null);
            out.home = navBrief(await gotoNav(page, 's-21-site-home-restored', app.url('/index.php/index')));
            out.db = siteRows(app);
            fact(process.env.SITE_RUN ? `siterestore${process.env.SITE_RUN}` : 'siterestore', out);
            return out;
        };
        if (on('site')) {
            await step('site', async () => {
                const out = {dbBefore: siteRows(app)};
                // before: the visitor's site home, the site's feed address
                await as(null);
                out.homeBefore = navBrief(await gotoNav(page, 's-01-site-home-before', app.url('/index.php/index')));
                out.gwBefore = navBrief(await gotoNav(page, 's-02-site-gateway-atom-before', app.url('/index.php/index/gateway/plugin/WebFeedGatewayPlugin/atom')));
                await as('admin');
                await openTab(page, app, 'index', 'plugins');
                out.tabs = await page.locator('[role="tab"]').allInnerTexts().then((a) => a.map((x) => flat(x, 40))).catch(() => []);
                out.rowBefore = await readRow(page, 'Web Feed Plugin');
                await snap(page, 's-03-site-plugins-before', {row: out.rowBefore, tabs: out.tabs});
                await openAppearanceSetup(page, app, 'index');
                out.sidebarBefore = await sidebarList(page);
                await snap(page, 's-04-site-sidebar-before', {list: out.sidebarBefore});
                // enable
                await openTab(page, app, 'index', 'plugins');
                out.enable = await setEnabled(page, 'Web Feed Plugin', true);
                out.rowOn = await readRow(page, 'Web Feed Plugin');
                await snap(page, 's-05-site-plugin-enabled', {enable: out.enable, row: out.rowOn});
                // the row's "Settings" on the site (the sweep): open, read, OK unchanged
                await openTab(page, app, 'index', 'plugins');
                const w = await openWindow(page);
                out.window = {open: w.open, title: w.title, radios: (w.radios || []).map((r) => `${r.name}=${r.value}${r.checked ? '*' : ''} "${r.label}"`), text: w.text, checkboxes: w.checkboxes, buttons: w.buttons, noSettingsAction: w.noSettingsAction};
                await snap(page, 's-06-site-window', {window: w});
                if (w.open) out.windowOK = await windowOK(page);
                await snap(page, 's-07-site-window-ok', {ok: out.windowOK});
                out.dbAfterOK = siteRows(app);
                // place the box on the site's "Sidebar": once left unsaved, then saved
                await openAppearanceSetup(page, app, 'index');
                out.sidebarOn = await sidebarList(page);
                const d0 = dialogs.length;
                await page.locator('input[name="sidebar"][value="WebFeedBlockPlugin"]').first().setChecked(true);
                await page.goto(app.url('/index.php/index')).catch(() => {}); await idle(page);
                out.leaveDialogs = dialogs.slice(d0);
                await openAppearanceSetup(page, app, 'index');
                out.sidebarAfterLeave = (await sidebarList(page)).filter((o) => o.checked).map((o) => o.value);
                await page.locator('input[name="sidebar"][value="WebFeedBlockPlugin"]').first().setChecked(true);
                out.place = await saveAppearance(page);
                await snap(page, 's-08-site-sidebar-placed', {list: out.sidebarOn, save: out.place});
                await openAppearanceSetup(page, app, 'index');
                out.sidebarAfterReload = (await sidebarList(page)).filter((o) => o.checked).map((o) => o.value);
                await loc(page, 'Administration › Site Settings › Appearance › Setup: the "Web Feed Plugin" box', page.locator('input[name="sidebar"][value="WebFeedBlockPlugin"]'));
                // the site's home page as the administrator and as a visitor, each link pressed
                for (const who of ['admin', 'visitor']) {
                    if (who === 'visitor') await as(null);
                    const h = await gotoNav(page, `s-09-site-home-${who}`, app.url('/index.php/index'));
                    out[`home-${who}`] = navBrief(h);
                    for (const alt of ['Atom logo', 'RSS2 logo', 'RSS1 logo']) {
                        await page.goto(app.url('/index.php/index')); await idle(page);
                        const k = alt.split(' ')[0].toLowerCase();
                        out[`press-${who}-${k}`] = navBrief(await nav(page, `s-10-site-${who}-${k}`, () => page.locator('.block_web_feed').getByRole('link', {name: alt, exact: true}).first().click()));
                    }
                }
                // the site's feed address with an odd feed name, and a journal's feed next to it (unchanged)
                out.gwJsonOn = navBrief(await gotoNav(page, 's-11-site-gateway-json-on', app.url('/index.php/index/gateway/plugin/WebFeedGatewayPlugin/json')));
                out.journalHome = navBrief(await gotoNav(page, 's-12-journal-home-while-site-on', ctxUrl(app, st.E.path, '')));
                fact(process.env.SITE_RUN ? `site${process.env.SITE_RUN}` : 'site', out);
            });
        }
        if (on('site') || on('siterestore')) {
            await step('siterestore', async () => siteRestore(on('site') ? 'after site' : 'alone'));
        }

        // ================= empty: the preamble's "nothing published" journal ===
        if (on('empty')) {
            await step('empty', async () => {
                const out = {publicknowledge: {}, E: {}};
                await as(null);
                for (const f of FEEDS) {
                    const x = await readFeed(page.request, feedUrl(app, app.contextPath, f));
                    out.publicknowledge[f] = {status: x.status, finalUrl: x.finalUrl, items: x.items.length};
                    const y = await readFeed(page.request, feedUrl(app, st.E.path, f));
                    out.E[f] = {status: y.status, items: y.items.length, type: y.contentType, length: y.length};
                }
                out.pkPublished = psql(app, `select count(*) from submissions s join ${isOJS ? 'journals' : isOMP ? 'presses' : 'servers'} c on c.${isOJS ? 'journal' : isOMP ? 'press' : 'server'}_id=s.context_id where c.path='${app.contextPath}' and s.status=3`);
                out.Ehome = navBrief(await gotoNav(page, 'e-01-empty-home', ctxUrl(app, st.E.path, '')));
                out.Erss2 = navBrief(await gotoNav(page, 'e-02-empty-rss2', feedUrl(app, st.E.path, 'rss2')));
                fact('empty', out);
            });
        }
    } finally {
        record('dialogs', {dialogs}, {merge: true});
        await close();
    }
});
