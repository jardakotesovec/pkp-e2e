// U18 claim check, chunk K2: who may (the Settings pages at every permission
// level), the "Web Feed Plugin" row and its "Settings" window (every field, both
// ends, refused values, "OK" / "Cancel" / the close button, reopened with and
// without a reload), the "Latest publications" box placed through "Sidebar" and
// read on the public pages, the discovery links at every "Display web feed
// links on…" choice, the journal closed to visitors and not enabled publicly,
// the plugin disabled and enabled again, the site's own Plugins / Sidebar (read
// only), on all three apps.
// Spec: docs/specs/U18-web-feeds.md — Actors (25–43), the settings window table
// (85–101), Rule 1 (105–108), Rules 11–14 (154–186), 16–17 (195–209), Side
// effects (216–222), Settings 1–2 (226–236), 6–8 (250–261); register A4, A5;
// footnotes a, b, d, e, h, td1, td10–td13, td15, td16, f-a4, f-a5, s.
//
// Seeds per app (tag prefix u18k2):
//   N  a new context as the context scenario makes it, no plugin key: one
//      throwaway user per permission level; two published items (OJS: one in a
//      published issue, one without an issue); the drive places the box through
//      "Sidebar" and changes the window, then disables and re-enables the plugin
//   R  {OJS OMP} the Editor role with "Permit changes to Settings" off
//   E  nothing published, the plugin seeded with `settings` and the box with
//      `sidebar` (the footnote s seeding path, its stored types read back)
//   C  "Users must be registered…" ticked, one published item, a reader
//   D  not enabled publicly (context.enabled false), one published item, a reader
//   M  {OJS} 31 published articles and nothing else (Rule 17's 30)
// Phases (PHASES=a,b,…; default all, in this order):
//   seed roles arrive window place choices follow empty closed disable site m30
// Run: PROBE_FEATURE=U18 PROBE_AGENT=ccK2 node bin/probe.js all shared/playwright/checks/U18/K2/k2.js
//   RESEED=1 seeds afresh; STEPS=name,… narrows the steps inside a phase.
const fs = require('fs');
const path = require('path');
const {execFileSync} = require('child_process');
const {forEachApp, launch, signIn, signOut, screen, shot, record, loc, note, idle, tag, outDir} =
    require('../../../probe');

const ALL_PHASES = ['seed', 'roles', 'arrive', 'window', 'place', 'choices', 'follow', 'empty', 'closed', 'disable', 'site', 'm30', 'adminwin'];
const PHASES = process.env.PHASES ? process.env.PHASES.split(',') : ALL_PHASES;
const on = (p) => PHASES.includes(p);
const STEPS = process.env.STEPS ? process.env.STEPS.split(',') : null;
const log = (...a) => console.log('[k2]', ...a);
const stateFile = (app) => path.join(outDir(), `k2-state-${app.name}.json`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const T = 20_000;
const flat = (s, n = 400) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const FEEDS = ['atom', 'rss2', 'rss'];
const DENIED_ROLE = /does not have access to this operation/i;

const ctxUrl = (app, ctxPath, p = '') => app.url(`/index.php/${ctxPath}${p}`);
const feedUrl = (app, ctxPath, type) => ctxUrl(app, ctxPath, `/gateway/plugin/WebFeedGatewayPlugin/${type}`);
const dialog = (page) => page.locator('[role="dialog"]:visible').last();

// ---------------------------------------------------------------------------
// Facts: one JSON per app, merged as the phases run

let FACTS = {};
function fact(key, value) {
    FACTS[key] = value;
    record('facts', {[key]: value}, {merge: true});
}

async function snap(page, name, extra = {}) {
    const s = await screen(page);
    record(name, {...s, ...extra});
    await shot(page, name).catch(() => {});
    return s;
}

// ---------------------------------------------------------------------------
// DB read (psql is the parity ground truth, scenarios.md)

function psql(app, sql) {
    const cfg = fs.readFileSync(app.configFile, 'utf8');
    const db = cfg.split(/^\[database\]/m)[1] || '';
    const get = (k) => ((db.match(new RegExp(`^${k}\\s*=\\s*(.*)$`, 'm')) || [])[1] || '').trim().replace(/^"|"$/g, '');
    try {
        return execFileSync('psql', ['-h', get('host') || '127.0.0.1', '-U', get('username'), get('name'), '-At', '-F', '|', '-c', sql],
            {env: {...process.env, PGPASSWORD: get('password')}, encoding: 'utf8', timeout: 20_000}).trim().split('\n').filter(Boolean);
    } catch (e) { return [`ERROR ${String(e.message).slice(0, 300)}`]; }
}
const contextTable = (app) => ({ojs: ['journals', 'journal_id'], omp: ['presses', 'press_id'], ops: ['servers', 'server_id']}[app.name]);
function pluginRows(app, ctxPath) {
    const [tbl, idc] = contextTable(app);
    return psql(app, `select setting_name, setting_value, setting_type from plugin_settings where plugin_name='webfeedplugin' and context_id=(select ${idc} from ${tbl} where path='${ctxPath}') order by setting_name`);
}

// ---------------------------------------------------------------------------
// Reading helpers

async function bodyText(page) { return (await page.locator('body').innerText().catch(() => '')) || ''; }

/** The editorial side menu (U07 K1's reader). */
async function readNav(page) {
    const nav = page.getByRole('navigation', {name: 'Site Navigation'});
    if (!(await nav.count().catch(() => 0))) return {present: false, groupLabels: [], settingsGroup: null};
    const groups = await nav.locator('[role="button"][aria-controls]').evaluateAll((els) => els.map((e) => {
        const region = document.getElementById(e.getAttribute('aria-controls') || '');
        return {
            label: e.getAttribute('aria-label') || e.textContent.replace(/\s+/g, ' ').trim(),
            items: region ? [...region.querySelectorAll('[role="treeitem"]')].map((li) => li.getAttribute('aria-label') || li.textContent.replace(/\s+/g, ' ').trim()) : [],
        };
    })).catch(() => []);
    const settings = groups.find((g) => /^Settings$/i.test(g.label)) || null;
    return {present: true, groupLabels: groups.map((g) => g.label), settingsGroup: settings ? settings.items : null};
}

async function classify(page) {
    const text = await bodyText(page);
    const url = page.url();
    return {
        url: url.replace(/^https?:\/\/[^/]+/, ''),
        title: await page.title().catch(() => null),
        h1: (await page.locator('h1').allInnerTexts().catch(() => [])).map((x) => flat(x, 120)),
        loginForm: (await page.locator('input[name="username"]').count()) > 0 && /\/login/.test(url),
        deniedRole: DENIED_ROLE.test(text),
        notFound: /404 Not Found/i.test(text),
        websiteTabs: await page.locator('[role="tab"]').allInnerTexts().then((a) => a.map((x) => flat(x, 60)).slice(0, 12)).catch(() => []),
    };
}

/** The sidebar box and the head's alternate links of the page open now. */
async function pageFeedBits(page) {
    return page.evaluate(() => {
        const b = document.querySelector('.block_web_feed');
        const sidebar = document.querySelector('.pkp_structure_sidebar');
        return {
            hasSidebar: !!sidebar,
            sidebarBlocks: [...document.querySelectorAll('.pkp_structure_sidebar .pkp_block')].map((x) => x.className.replace('pkp_block ', '')),
            box: b ? {
                heading: b.querySelector('h2, .title')?.innerText.trim() ?? null,
                visible: b.offsetParent !== null,
                links: [...b.querySelectorAll('a')].map((a) => ({href: a.getAttribute('href'), alt: a.querySelector('img')?.getAttribute('alt') ?? null, src: (a.querySelector('img')?.getAttribute('src') || '').replace(/^https?:\/\/[^/]+/, ''), text: a.innerText.trim()})),
            } : null,
            alternates: [...document.querySelectorAll('head link[rel="alternate"]')].map((l) => ({type: l.getAttribute('type'), href: l.getAttribute('href')})),
        };
    }).catch((e) => ({error: String(e.message || e)}));
}

/** A public page as the current session sees it. */
async function pub(page, url, name) {
    const resp = await page.goto(url).catch((e) => ({error: String(e.message)}));
    await idle(page);
    const bits = await pageFeedBits(page);
    const out = {
        url: page.url().replace(/^https?:\/\/[^/]+/, ''),
        status: resp && resp.status ? resp.status() : (resp && resp.error) || null,
        title: await page.title().catch(() => null),
        h1: (await page.locator('h1').allInnerTexts().catch(() => [])).map((x) => flat(x, 100)).slice(0, 3),
        loginForm: (await page.locator('input[name="username"]').count()) > 0 && /\/login/.test(page.url()),
        ...bits,
    };
    await snap(page, name, out);
    return out;
}
const brief = (p) => ({url: p.url, status: p.status, title: p.title, box: p.box ? `${p.box.heading} [${p.box.links.map((l) => l.alt).join(', ')}]` : null, alternates: (p.alternates || []).map((a) => `${a.type} ${String(a.href).replace(/^https?:\/\/[^/]+/, '')}`), sidebarBlocks: p.sidebarBlocks, loginForm: p.loginForm});

/** A feed read the way a feed reader reads it: the GET, status, type, title, items. */
async function readFeed(req, url) {
    const r = await req.get(url, {failOnStatusCode: false, maxRedirects: 5});
    const body = await r.text();
    const tagText = (s, t) => { const m = s.match(new RegExp(`<${t}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${t}>`)); return m ? m[1].trim() : null; };
    const items = [...body.matchAll(/<(entry|item)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/g)].map((m) => m[2]);
    return {
        url: url.replace(/^https?:\/\/[^/]+/, ''),
        finalUrl: r.url().replace(/^https?:\/\/[^/]+/, ''),
        status: r.status(),
        contentType: r.headers()['content-type'] || null,
        length: body.length,
        is404Text: /404 Not Found/i.test(body),
        loginPage: /name="username"/.test(body),
        htmlTitle: tagText(body, 'title'),
        items: items.map((it) => tagText(it, 'title')),
        bodyHead: body.slice(0, 300),
        body,
    };
}
const feedBrief = (f) => ({status: f.status, finalUrl: f.finalUrl, contentType: f.contentType, title: f.htmlTitle, items: f.items, is404Text: f.is404Text, loginPage: f.loginPage});

// ---------------------------------------------------------------------------
// Settings › Website › Plugins: the row and its window

async function openWebsite(page, app, ctxPath, top) {
    await page.goto(ctxUrl(app, ctxPath, '/management/settings/website'));
    await idle(page);
    await page.locator(`#${top}-button`).first().click();
    await idle(page);
    await sleep(600);
}
const feedRow = (page) => page.locator('#pluginGridContainer tr.gridRow').filter({hasText: 'Web Feed Plugin'}).first();

/** The row as data: its text, its Enabled box, its category, its controls once expanded. */
async function readRow(page, {expand = true} = {}) {
    const row = feedRow(page);
    await row.waitFor({timeout: T}).catch(() => {});
    if (!(await row.count())) return {present: false};
    const data = await row.evaluate((r) => {
        const box = r.querySelector('input[type=checkbox]');
        // the category heading: the first row of the row group the row sits in (the grid's category row)
        const tb = r.closest('tbody');
        const first = tb ? tb.querySelector('tr') : null;
        const cat = first && first !== r ? first.innerText.replace(/\s+/g, ' ').trim() : null;
        return {present: true, id: r.id, text: r.innerText.replace(/\s+/g, ' ').trim(), enabled: box ? box.checked : null, boxDisabled: box ? box.disabled : null, category: cat, links: [...r.querySelectorAll('a')].map((a) => ({text: a.innerText.trim(), cls: a.className}))};
    });
    if (expand) {
        const expander = row.locator('a.show_extras').first();
        if (await expander.count()) { await expander.click(); await sleep(500); }
        const controls = row.locator('xpath=following-sibling::tr[1]');
        data.controls = await controls.evaluate((tr) => ({cls: tr.className, links: [...tr.querySelectorAll('a')].filter((a) => a.offsetParent !== null).map((a) => a.innerText.trim())})).catch(() => null);
    }
    return data;
}

/** Press "Settings" in the expanded row; wait for the window's form. */
async function openWindow(page, app, ctxPath) {
    await openWebsite(page, app, ctxPath, 'plugins');
    const row = feedRow(page);
    await row.waitFor({timeout: T});
    const expander = row.locator('a.show_extras').first();
    if (await expander.count()) { await expander.click(); await sleep(500); }
    const settings = row.locator('xpath=following-sibling::tr[1]').getByRole('link', {name: 'Settings', exact: true}).first();
    await loc(page, 'Website › Plugins: the expanded "Web Feed Plugin" row\'s "Settings" action', settings);
    await settings.click();
    await page.locator('#webFeedSettingsForm').waitFor({timeout: T});
    await idle(page);
    await sleep(400);
    return windowState(page);
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
            title: txt(root.querySelector('h1, .pkp_modal_panel > .header, .header')),
            description: form ? form.querySelector('#description')?.innerHTML.trim() ?? null : null,
            descriptionText: form ? txt(form.querySelector('#description')) : null,
            headings: [...root.querySelectorAll('h2, h3, h4')].map(txt),
            radios: [...root.querySelectorAll('input[type=radio]')].map((r) => ({name: r.name, value: r.value, checked: r.checked, label: lab(r), checkedAttr: r.hasAttribute('checked')})),
            text: [...root.querySelectorAll('input[type=text]')].map((i) => ({name: i.name, value: i.value, label: lab(i), required: i.required || i.getAttribute('aria-required'), cls: i.className})),
            checkboxes: [...root.querySelectorAll('input[type=checkbox]')].map((i) => ({name: i.name, checked: i.checked, label: lab(i)})),
            buttons: [...root.querySelectorAll('button, input[type=submit]')].filter((b) => b.offsetParent !== null).map((b) => ({text: (b.innerText || b.value || b.getAttribute('aria-label') || '').trim(), type: b.type, cls: b.className})),
            links: [...root.querySelectorAll('a')].filter((a) => a.offsetParent !== null).map((a) => a.innerText.trim()),
            asterisks: [...root.querySelectorAll('.req, .required, abbr, span')].filter((s) => /\*/.test(s.innerText || '') && s.offsetParent !== null).map(txt),
            errors: [...root.querySelectorAll('.error, .pkp_form_error, .formError, #formErrors, [class*="error"], .pkp_helpers_error')].filter((e) => e.offsetParent !== null).map(txt).filter(Boolean),
            fullText: txt(root),
        };
    });
}

/** Set the window's fields (any given) and press "OK": what came back and what shows. */
async function windowOK(page, {displayPage, displayItems, recentItems, includeIdentifiers} = {}) {
    const d = dialog(page);
    if (displayPage) await d.locator(`input[name="displayPage"][value="${displayPage}"]`).check();
    if (displayItems) await d.locator(`input[name="displayItems"][value="${displayItems}"]`).check();
    if (recentItems !== undefined) await d.locator('input[name="recentItems"]').fill(String(recentItems));
    if (includeIdentifiers !== undefined) await d.locator('input[name="includeIdentifiers"]').setChecked(includeIdentifiers);
    const posted = [];
    const onReq = (r) => { if (r.method() === 'POST' && /manage/.test(r.url())) posted.push(r.postData()); };
    page.on('request', onReq);
    const w = page.waitForResponse((r) => r.request().method() === 'POST' && /manage/.test(r.url()), {timeout: T}).catch(() => null);
    await d.getByRole('button', {name: 'OK', exact: true}).click();
    const resp = await w;
    page.off('request', onReq);
    let json = null;
    try { json = resp ? await resp.json() : null; } catch { json = null; }
    await sleep(900);
    await idle(page);
    const stillOpen = (await page.locator('#webFeedSettingsForm:visible').count()) > 0;
    const notices = (await page.locator('.pkpNotification, .app__notifications, [role="alert"]').allInnerTexts().catch(() => [])).map((x) => flat(x, 200)).filter(Boolean);
    return {
        status: resp ? resp.status() : null,
        jsonStatus: json && json.status,
        contentIsForm: !!(json && typeof json.content === 'string' && json.content.includes('webFeedSettingsForm')),
        posted: (posted[0] || '').replace(/csrfToken=[^&]+/, 'csrfToken=…'),
        stillOpen,
        notices,
        after: stillOpen ? await windowState(page) : null,
    };
}
async function windowCancel(page) {
    const d = dialog(page);
    if (!(await d.count())) return {open: false};
    const cancel = d.getByRole('link', {name: 'Cancel', exact: true}).first();
    await cancel.click();
    await page.locator('#webFeedSettingsForm').waitFor({state: 'detached', timeout: T}).catch(() => {});
    await idle(page);
    await sleep(700);   // the modal slot (patterns pitfall 4)
    return {open: (await page.locator('#webFeedSettingsForm:visible').count()) > 0};
}

/** Enable or disable through the row's box; a confirmation is recorded and accepted. */
async function setEnabled(page, want) {
    const box = feedRow(page).getByRole('checkbox').first();
    const wasChecked = await box.isChecked();
    if (wasChecked === want) return {changed: false, checked: wasChecked};
    const w = page.waitForResponse((r) => /settings-plugin-grid\/(enable|disable)/.test(r.url()), {timeout: T}).catch(() => null);
    await box.click({noWaitAfter: true}).catch(() => box.dispatchEvent('click'));
    await sleep(900);
    const dlg = page.locator('[role="dialog"]:visible');
    let dialogText = null;
    let dialogButtons = null;
    if (await dlg.count()) {
        dialogText = flat(await dlg.last().innerText(), 400);
        dialogButtons = await dlg.last().locator('button, a').allInnerTexts().then((a) => a.map((x) => x.trim()).filter(Boolean)).catch(() => null);
        await snap(page, `dlg-${want ? 'enable' : 'disable'}-${Date.now() % 100000}`, {dialogText});
        const ok = dlg.last().getByRole('button', {name: /^(OK|Yes)$/}).first();
        if (await ok.count()) await ok.click();
    }
    const resp = await w;
    let json = null;
    try { json = resp ? await resp.json() : null; } catch { json = null; }
    await sleep(900);
    await idle(page);
    const notices = (await page.locator('.pkpNotification, .app__notifications').allInnerTexts().catch(() => [])).map((x) => flat(x, 200)).filter(Boolean);
    return {changed: true, status: resp ? resp.status() : null, url: resp ? resp.url().replace(/^https?:\/\/[^/]+/, '').replace(/csrfToken=[^&]+/, '') : null, jsonStatus: json && json.status, dialogText, dialogButtons, notices, checked: await feedRow(page).getByRole('checkbox').first().isChecked().catch(() => null)};
}

/** Appearance › Setup › "Sidebar": the options, which are ticked. */
async function openSetup(page, app, ctxPath) {
    await openWebsite(page, app, ctxPath, 'appearance');
    await page.locator('#appearance').getByRole('tab', {name: 'Setup', exact: true}).first().click();
    await idle(page);
    await sleep(800);
}
const sidebarList = (page) => page.locator('#appearance-setup input[name="sidebar"]').evaluateAll((els) => els.map((e) => ({value: e.value, checked: e.checked, label: ((e.closest('label') || e.parentElement).querySelector('.pkpFormField--options__optionLabel') || e.closest('label') || {}).textContent?.replace(/\s+/g, ' ').trim()})));
async function saveSetup(page) {
    const form = page.locator('#appearance-setup form').first();
    const w = page.waitForResponse((r) => /\/api\/v1\/contexts\/\d+/.test(r.url()) && r.request().method() !== 'GET', {timeout: T}).catch(() => null);
    await form.getByRole('button', {name: 'Save', exact: true}).last().click();
    const r = await w;
    const saved = await form.locator('[role="status"]:has-text("Saved")').first().waitFor({timeout: 8000}).then(() => true).catch(() => false);
    await sleep(500);
    const errors = await form.locator('.pkpFieldError').allInnerTexts().then((a) => a.map((x) => flat(x, 200))).catch(() => []);
    return {status: r ? r.status() : null, saved, errors};
}

// ---------------------------------------------------------------------------
// Public page sets per app

function pageSet(app, ctx) {
    const P = ctx.path;
    const s = ctx.subs || {};
    if (app.name === 'ojs') {
        return [
            ['home', ''], ['about', '/about'], ['archive', '/issue/archive'], ['issue', `/issue/view/${ctx.issueId}`],
            ['current', '/issue/current'], ['article', `/article/view/${s.inIssue}`], ['article2', `/article/view/${s.noIssue}`],
            ['search', '/search/search'], ['login', '/login'], ['category', null],
        ].filter(([, p]) => p !== null).map(([k, p]) => [k, ctxUrl(app, P, p)]);
    }
    if (app.name === 'omp') {
        return [['home', ''], ['about', '/about'], ['catalog', '/catalog'], ['book', `/catalog/book/${s.a}`], ['search', '/search/search'], ['login', '/login']].map(([k, p]) => [k, ctxUrl(app, P, p)]);
    }
    return [['home', ''], ['about', '/about'], ['preprint', `/preprint/view/${s.a}`], ['search', '/search/search'], ['login', '/login']].map(([k, p]) => [k, ctxUrl(app, P, p)]);
}

// ---------------------------------------------------------------------------
forEachApp(async (app) => {
    const isOJS = app.name === 'ojs';
    const hasEditor = app.name !== 'ops';
    let st = fs.existsSync(stateFile(app)) ? JSON.parse(fs.readFileSync(stateFile(app), 'utf8')) : null;
    const saveState = () => fs.writeFileSync(stateFile(app), JSON.stringify(st, null, 2));
    FACTS = {};
    const step = async (name, fn) => {
        if (STEPS && !STEPS.includes(name)) return null;
        log(app.name, '== step', name);
        try { return await fn(); } catch (e) {
            fact(`ERROR-${name}`, String(e.stack || e).slice(0, 900));
            log(app.name, 'ERROR', name, String(e.message || e).slice(0, 300));
            return null;
        }
    };

    // ---- seed ---------------------------------------------------------------
    if ((on('seed') && (process.env.RESEED === '1' || !st)) || !st) {
        const t = tag('u18k2');
        const seedCtx = async (spec) => {
            for (let attempt = 1; attempt <= 2; attempt++) {
                try { return await app.api.createContext(spec); } catch (e) { log('seed failed', attempt, String(e.message || e).slice(0, 600)); if (attempt === 2) throw e; await sleep(3000); }
            }
            return null;
        };
        const sub = async (ctxPath, submitter, k, spec) => {
            const r = await app.api.createSubmission({tag: `${t}${k}`, context: ctxPath, submitter, title: `K2 ${k} ${t}`, abstract: `Abstract of ${k}.`, submitted: true, published: true, ...spec});
            return r.submissionId;
        };
        const lvl = (p) => [
            {username: `${p}mgr`, roles: ['manager'], givenName: 'Mira', familyName: 'Manager'},
            ...(hasEditor ? [{username: `${p}ed`, roles: ['editor'], givenName: 'Eddy', familyName: 'Editor'}, {username: `${p}pe`, roles: ['productionEditor'], givenName: 'Pat', familyName: 'Production'}] : []),
            {username: `${p}se`, roles: ['sectionEditor'], givenName: 'Sonia', familyName: 'Section'},
            {username: `${p}as`, roles: [hasEditor ? 'copyeditor' : 'editorialBoardMember'], givenName: 'Asa', familyName: 'Assistant'},
            ...(hasEditor ? [{username: `${p}rv`, roles: ['externalReviewer'], givenName: 'Rae', familyName: 'Reviewer'}] : []),
            {username: `${p}au`, roles: ['author'], givenName: 'Aria', familyName: 'Author'},
            {username: `${p}rd`, roles: ['reader'], givenName: 'Rex', familyName: 'Reader'},
        ];
        const tN = `${t}n`, tR = `${t}r`, tE = `${t}e`, tC = `${t}c`, tD = `${t}d`, tM = `${t}m`;
        const issues = isOJS ? {issues: [{volume: 1, number: 1, year: 2025, published: true}]} : {};
        const cN = await seedCtx({tag: tN, context: {name: `U18 K2 N ${tN}`, acronym: 'K2N'}, users: lvl(tN), ...issues});
        const nSubs = {};
        if (isOJS) {
            nSubs.inIssue = await sub(tN, `${tN}au`, 'nissue', {issue: {volume: 1, number: 1, year: 2025}});
            nSubs.noIssue = await sub(tN, `${tN}au`, 'nloose', {});
        } else {
            nSubs.a = await sub(tN, `${tN}au`, 'na', {});
            nSubs.b = await sub(tN, `${tN}au`, 'nb', {});
        }
        let cR = null;
        if (hasEditor) cR = await seedCtx({tag: tR, context: {name: `U18 K2 R ${tR}`, acronym: 'K2R'}, roles: {editor: {permitSettings: false}}, users: [{username: `${tR}ed`, roles: ['editor'], givenName: 'Nell', familyName: 'Nopermit'}]});
        // E: the footnote s seeding path (settings + sidebar), nothing published
        const eSettings = {displayPage: 'all', recentItems: 5, includeIdentifiers: true, ...(isOJS ? {displayItems: 'recent'} : {})};
        let cE = null;
        let eErr = null;
        try {
            cE = await seedCtx({tag: tE, context: {name: `U18 K2 E ${tE}`, acronym: 'K2E'}, users: [{username: `${tE}mgr`, roles: ['manager'], givenName: 'Emma', familyName: 'Manager'}], plugins: {webfeedplugin: {enabled: true, settings: eSettings}}, sidebar: ['WebFeedBlockPlugin']});
        } catch (e) {
            eErr = String(e.message).slice(0, 800);
            cE = await seedCtx({tag: `${tE}x`, context: {name: `U18 K2 E ${tE}x`, acronym: 'K2E'}, users: [{username: `${tE}xmgr`, roles: ['manager'], givenName: 'Emma', familyName: 'Manager'}], plugins: {webfeedplugin: {enabled: true, settings: eSettings}}, sidebar: ['webfeedblockplugin']}).catch((e2) => { eErr += ' | ' + String(e2.message).slice(0, 500); return null; });
        }
        const cC = await seedCtx({tag: tC, context: {name: `U18 K2 C ${tC}`, acronym: 'K2C'}, restrictSiteAccess: true, users: [{username: `${tC}mgr`, roles: ['manager'], givenName: 'Cleo', familyName: 'Manager'}, {username: `${tC}rd`, roles: ['reader'], givenName: 'Cyd', familyName: 'Reader'}, {username: `${tC}au`, roles: ['author'], givenName: 'Cas', familyName: 'Author'}]});
        const cSub = await sub(tC, `${tC}au`, 'cpub', {});
        const cD = await seedCtx({tag: tD, context: {name: `U18 K2 D ${tD}`, acronym: 'K2D', enabled: false}, users: [{username: `${tD}mgr`, roles: ['manager'], givenName: 'Dora', familyName: 'Manager'}, {username: `${tD}rd`, roles: ['reader'], givenName: 'Dan', familyName: 'Reader'}, {username: `${tD}au`, roles: ['author'], givenName: 'Dee', familyName: 'Author'}]});
        const dSub = await sub(tD, `${tD}au`, 'dpub', {});
        let mInfo = null;
        if (isOJS) {
            const cM = await seedCtx({tag: tM, context: {name: `U18 K2 M ${tM}`, acronym: 'K2M'}, users: [{username: `${tM}au`, roles: ['author'], givenName: 'Max', familyName: 'Author'}]});
            const ids = [];
            for (let i = 1; i <= 31; i++) ids.push(await sub(tM, `${tM}au`, `m${String(i).padStart(2, '0')}`, {title: `K2 M${String(i).padStart(2, '0')} ${t}`}));
            mInfo = {path: cM.path || tM, ids};
        }
        st = {
            tag: t,
            N: {path: cN.path || tN, id: cN.contextId, u: Object.fromEntries(lvl(tN).map((x) => [x.username.slice(tN.length), x.username])), subs: nSubs, issueId: isOJS && cN.issues ? cN.issues[0].id : null},
            R: cR ? {path: cR.path || tR, u: {ed: `${tR}ed`}} : null,
            E: cE ? {path: cE.path, u: {mgr: `${cE.path}mgr`}, seededSettings: eSettings, err: eErr} : {err: eErr},
            C: {path: cC.path || tC, u: {mgr: `${tC}mgr`, rd: `${tC}rd`}, sub: cSub},
            D: {path: cD.path || tD, u: {mgr: `${tD}mgr`, rd: `${tD}rd`}, sub: cD ? dSub : null},
            M: mInfo,
        };
        saveState();
        record('00-seed', {st, N: cN, E: cE, eErr});
        note(`K2 ${app.name}: scratch N ${st.N.path} (users ${Object.keys(st.N.u).join('/')}, ${isOJS ? 'published issue id ' + st.N.issueId + ', articles ' + JSON.stringify(nSubs) : 'items ' + JSON.stringify(nSubs)}); R ${st.R ? st.R.path : '—'} (editor without Permit changes to Settings); E ${st.E.path || '—'} (plugin seeded with settings + sidebar; ${eErr ? 'first try refused: ' + flat(eErr, 200) : 'accepted'}); C ${st.C.path} (restrictSiteAccess); D ${st.D.path} (enabled false)${st.M ? '; M ' + st.M.path + ' (31 published)' : ''}`);
    }
    const N = st.N;

    const {page, close} = await launch(app);
    const dialogs = [];
    page.on('dialog', (d) => { dialogs.push({type: d.type(), message: d.message(), at: page.url()}); d.accept().catch(() => {}); });
    const as = async (user, ctxPath) => { if (!user) { await signOut(page).catch(() => {}); return; } await signIn(page, user, {contextPath: ctxPath}); await idle(page); };
    try {
        // ======================= roles: lines 27–33, 39–41 ===================
        if (on('roles')) {
            await step('roles', async () => {
                const levels = Object.keys(N.u).map((k) => [k, N.u[k], N.path]);
                levels.push(['admin', 'admin', N.path]);
                if (st.R) levels.push(['edNoPermit', st.R.u.ed, st.R.path]);
                const out = {};
                for (const [k, user, ctxPath] of levels) {
                    await as(user, ctxPath);
                    await page.goto(ctxUrl(app, ctxPath, '/submissions')).catch(() => {});
                    await idle(page);
                    const nav = await readNav(page);
                    await page.goto(ctxUrl(app, ctxPath, '/management/settings/website'));
                    await idle(page);
                    const cls = await classify(page);
                    const r = {nav: nav.settingsGroup, navGroups: nav.groupLabels, website: cls};
                    if (!cls.deniedRole && !cls.loginForm && cls.websiteTabs.length) {
                        await page.locator('#plugins-button').first().click(); await idle(page); await sleep(600);
                        r.row = await readRow(page);
                        await snap(page, `r-${k}-plugins`, r);
                        await page.goto(ctxUrl(app, ctxPath, '/management/settings/website')); await idle(page);
                        await page.locator('#appearance-button').first().click(); await idle(page);
                        await page.locator('#appearance').getByRole('tab', {name: 'Setup', exact: true}).first().click(); await idle(page); await sleep(600);
                        r.sidebar = await sidebarList(page).catch(() => null);
                    } else {
                        await snap(page, `r-${k}-website`, r);
                    }
                    out[k] = r;
                    log(app.name, 'role', k, JSON.stringify({nav: r.nav, denied: cls.deniedRole, login: cls.loginForm, enabled: r.row && r.row.enabled, controls: r.row && r.row.controls}));
                }
                await as(null);
                await page.goto(ctxUrl(app, N.path, '/management/settings/website')); await idle(page);
                out.signedOut = {website: await classify(page)};
                await snap(page, 'r-signedout-website', out.signedOut);
                fact('roles', out);
            });
        }

        // ======================= arrive: Rule 1, td1, td15 (arrival), td11 (new) =
        if (on('arrive')) {
            await step('arrive-db', async () => fact('arrive-db', {N: pluginRows(app, N.path), E: st.E.path ? pluginRows(app, st.E.path) : null}));
            await step('arrive-row', async () => {
                await as(N.u.mgr, N.path);
                await openWebsite(page, app, N.path, 'plugins');
                const row = await readRow(page);
                const categories = await page.locator('#pluginGridContainer tr[class*="category"]').allInnerTexts().then((a) => a.map((x) => flat(x, 60))).catch(() => []);
                await loc(page, 'Website › Plugins: the "Web Feed Plugin" row', feedRow(page));
                await loc(page, 'Website › Plugins: the row\'s Enabled box', feedRow(page).getByRole('checkbox'));
                await snap(page, 'a-01-plugins-row-new', {row, categories});
                const win = await openWindow(page, app, N.path);
                await snap(page, 'a-02-window-new', {win});
                await loc(page, 'the settings window (legacy modal)', page.locator('[role="dialog"]:visible').last());
                await loc(page, 'the window\'s form', page.locator('#webFeedSettingsForm'));
                await loc(page, 'the window\'s "OK"', dialog(page).getByRole('button', {name: 'OK', exact: true}));
                await loc(page, 'the window\'s "Cancel" (a link)', dialog(page).getByRole('link', {name: 'Cancel', exact: true}));
                await loc(page, 'the "Number of publications to display" box', page.locator('#webFeedSettingsForm input[name="recentItems"]'));
                const html = await page.locator('#webFeedSettingsForm').evaluate((f) => [...f.querySelectorAll('input[type=radio]')].map((r) => r.outerHTML)).catch(() => null);
                await windowCancel(page);
                await openSetup(page, app, N.path);
                const sidebar = await sidebarList(page);
                await snap(page, 'a-03-sidebar-new', {sidebar});
                fact('arrive-row', {row, categories, win, radioHtml: html, sidebar});
            });
            await step('arrive-public', async () => {
                await as(null);
                const feeds = {};
                for (const f of FEEDS) feeds[f] = feedBrief(await readFeed(page.request, feedUrl(app, N.path, f)));
                const pages = {};
                for (const [k, u] of pageSet(app, N)) pages[k] = brief(await pub(page, u, `a-10-${k}-signedout`));
                // signed in as the Reader: the Atom feed compared with the signed-out one
                const outAtom = await readFeed(page.request, feedUrl(app, N.path, 'atom'));
                await as(N.u.rd, N.path);
                const inAtom = await readFeed(page.request, feedUrl(app, N.path, 'atom'));
                const inRss2 = await readFeed(page.request, feedUrl(app, N.path, 'rss2'));
                await page.goto(feedUrl(app, N.path, 'atom')).catch(() => {});
                await sleep(800);
                await snap(page, 'a-11-atom-reader-browser');
                await as(null);
                const outRss2 = await readFeed(page.request, feedUrl(app, N.path, 'rss2'));
                fact('arrive-public', {feeds, pages, readerAtomSame: inAtom.body === outAtom.body, readerRss2Same: inRss2.body === outRss2.body, readerAtom: feedBrief(inAtom), atomDiff: inAtom.body === outAtom.body ? null : {out: outAtom.body.slice(0, 1500), in: inAtom.body.slice(0, 1500)}});
            });
        }

        // ======================= window: td15, Rules 16–17, Side effects ======
        if (on('window')) {
            await as(N.u.mgr, N.path);
            const mgrMail = `${N.u.mgr}@mail.test`;
            const mailBefore = await app.mail.count({to: mgrMail}).catch(() => null);
            await step('w-refusals', async () => {
                const out = {};
                const w0 = await openWindow(page, app, N.path);
                out.opened = w0;
                // make an unrelated change too, so "nothing is saved" is visible on reopen
                await dialog(page).locator('input[name="displayPage"][value="all"]').check();
                await dialog(page).locator('input[name="includeIdentifiers"]').setChecked(true);
                for (const v of ['abc', '0', '-3', '', ' ']) {
                    out[`v:${v}`] = await windowOK(page, {recentItems: v});
                    await snap(page, `w-01-refused-${v.trim() === '' ? (v === '' ? 'empty' : 'space') : v}`, {result: out[`v:${v}`]});
                    if (!out[`v:${v}`].stillOpen) break;
                }
                await loc(page, 'the refusal under the box (field error)', dialog(page).locator('.error, [class*="error"]').first());
                // leave through Cancel; reopen: nothing saved
                out.cancel = await windowCancel(page);
                out.reopen = await openWindow(page, app, N.path);
                await snap(page, 'w-02-reopen-after-refusals', {win: out.reopen});
                await windowCancel(page);
                out.db = pluginRows(app, N.path);
                fact('w-refusals', out);
            });
            await step('w-empty-fresh', async () => {
                // an emptied box pressed at once on a freshly opened window (no earlier refusal)
                const out = {};
                await openWindow(page, app, N.path);
                out.empty = await windowOK(page, {recentItems: ''});
                await snap(page, 'w-01b-empty-fresh', {result: out.empty});
                if (out.empty.stillOpen) await windowCancel(page);
                out.db = pluginRows(app, N.path);
                fact('w-empty-fresh', out);
            });
            await step('w-accepts', async () => {
                const out = {};
                for (const v of ['2.5', '3abc', '1', '1000000', '30']) {
                    await openWindow(page, app, N.path);
                    out[`ok:${v}`] = await windowOK(page, {recentItems: v});
                    await sleep(300);
                    const re = await openWindow(page, app, N.path);
                    out[`reopen:${v}`] = {recentItems: (re.text.find((x) => x.name === 'recentItems') || {}).value, radios: re.radios.filter((r) => r.checked).map((r) => `${r.name}=${r.value}`)};
                    if (v === '2.5') {
                        await snap(page, 'w-03-reopen-2_5', {ok: out[`ok:${v}`], re});
                        await windowCancel(page);
                        await page.reload(); await idle(page);
                        const re2 = await openWindow(page, app, N.path);
                        out['reload:2.5'] = {recentItems: (re2.text.find((x) => x.name === 'recentItems') || {}).value};
                        await snap(page, 'w-04-reopen-2_5-after-reload', {re2});
                    }
                    await windowCancel(page);
                    out[`db:${v}`] = pluginRows(app, N.path).filter((r) => /recentItems/.test(r));
                }
                fact('w-accepts', out);
            });
            await step('w-issue-empty', async () => {
                if (!isOJS) return;
                const out = {};
                await openWindow(page, app, N.path);
                out.ok = await windowOK(page, {displayItems: 'issue', recentItems: ''});
                await snap(page, 'w-05-issue-empty-ok', {ok: out.ok});
                out.reopen = await openWindow(page, app, N.path);
                await snap(page, 'w-06-issue-empty-reopen', {win: out.reopen});
                await windowCancel(page);
                out.db = pluginRows(app, N.path);
                // the other refused values under the current-issue choice
                await openWindow(page, app, N.path);
                out.issueAbc = await windowOK(page, {displayItems: 'issue', recentItems: 'abc'});
                const re = await openWindow(page, app, N.path);
                out.issueAbcReopen = {recentItems: (re.text.find((x) => x.name === 'recentItems') || {}).value, radios: re.radios.filter((r) => r.checked).map((r) => `${r.name}=${r.value}`)};
                await windowCancel(page);
                // back to the recent list with 30, as the rest of the drive assumes
                await openWindow(page, app, N.path);
                out.restore = await windowOK(page, {displayItems: 'recent', recentItems: '30'});
                out.dbRestored = pluginRows(app, N.path);
                fact('w-issue-empty', out);
            });
            await step('w-cancel-close', async () => {
                const out = {};
                const before = await openWindow(page, app, N.path);
                await dialog(page).locator('input[name="displayPage"][value="all"]').check();
                await dialog(page).locator('input[name="recentItems"]').fill('7');
                await dialog(page).locator('input[name="includeIdentifiers"]').setChecked(true);
                if (isOJS) await dialog(page).locator('input[name="displayItems"][value="issue"]').check();
                const nd = dialogs.length;
                out.cancel = await windowCancel(page);
                out.dialogsOnCancel = dialogs.slice(nd);
                const after = await openWindow(page, app, N.path);
                out.sameAfterCancel = JSON.stringify(before.radios.map((r) => r.checked)) === JSON.stringify(after.radios.map((r) => r.checked)) && JSON.stringify(before.text) === JSON.stringify(after.text) && JSON.stringify(before.checkboxes) === JSON.stringify(after.checkboxes);
                out.afterCancel = {radios: after.radios.filter((r) => r.checked).map((r) => r.value), text: after.text, checkboxes: after.checkboxes};
                // the window's own close button with a change: what asks
                await dialog(page).locator('input[name="recentItems"]').fill('8');
                await dialog(page).locator('input[name="recentItems"]').blur();
                const closeBtn = dialog(page).locator('button.pkpModalCloseButton, a.close, button[aria-label*="Close"], .pkp_modal_panel > .close, button:has-text("Close")').first();
                await loc(page, 'the window\'s close button (×)', closeBtn);
                const nd2 = dialogs.length;
                await closeBtn.click().catch(async (e) => { out.closeErr = String(e.message).slice(0, 200); await page.keyboard.press('Escape'); });
                await sleep(1200);
                const pkpConfirm = page.locator('[role="dialog"]:visible').filter({hasText: /unsaved|changes|leave|discard/i});
                out.pkpConfirm = (await pkpConfirm.count()) ? flat(await pkpConfirm.last().innerText(), 300) : null;
                if (out.pkpConfirm) { await snap(page, 'w-07-close-confirm', {text: out.pkpConfirm}); const ok = pkpConfirm.last().getByRole('button', {name: /^(OK|Yes|Close)/}).first(); if (await ok.count()) await ok.click(); await sleep(800); }
                out.dialogsOnClose = dialogs.slice(nd2);
                out.openAfterClose = (await page.locator('#webFeedSettingsForm:visible').count()) > 0;
                await snap(page, 'w-08-after-close', {out});
                if (out.openAfterClose) await windowCancel(page);
                await page.reload(); await idle(page);
                const again = await openWindow(page, app, N.path);
                out.afterCloseReopen = {recentItems: (again.text.find((x) => x.name === 'recentItems') || {}).value};
                // leave the Settings page with the window open and a change typed: the page-leave question
                await dialog(page).locator('input[name="recentItems"]').fill('9');
                await dialog(page).locator('input[name="recentItems"]').blur();
                const nd3 = dialogs.length;
                await page.goto(ctxUrl(app, N.path, '/submissions')).catch((e) => { out.leaveErr = String(e.message).slice(0, 200); });
                await idle(page);
                out.dialogsOnLeave = dialogs.slice(nd3);
                const again2 = await openWindow(page, app, N.path);
                out.afterLeaveReopen = {recentItems: (again2.text.find((x) => x.name === 'recentItems') || {}).value};
                await windowCancel(page);
                fact('w-cancel-close', out);
            });
            await step('w-save-effects', async () => {
                const out = {};
                const bell0 = await page.locator('header').innerText().then((x) => flat(x, 300)).catch(() => null);
                await openWindow(page, app, N.path);
                out.ok = await windowOK(page, {});
                await snap(page, 'w-09-ok-unchanged', {ok: out.ok});
                await loc(page, 'the save notice ("Your changes have been saved.")', page.locator('.pkpNotification, .app__notifications').first());
                out.dbAfterPlainOK = pluginRows(app, N.path);
                await page.reload(); await idle(page);
                out.noticeAfterReload = (await page.locator('.pkpNotification').allInnerTexts().catch(() => [])).map((x) => flat(x, 200));
                out.header0 = bell0;
                out.header1 = await page.locator('header').innerText().then((x) => flat(x, 300)).catch(() => null);
                await sleep(2500);
                out.mailBefore = mailBefore;
                out.mailAfter = await app.mail.count({to: mgrMail}).catch(() => null);
                out.notificationsDb = psql(app, `select n.type, n.level, count(*) from notifications n join users u on u.user_id=n.user_id where u.username='${N.u.mgr}' group by n.type, n.level`);
                const subId = isOJS ? N.subs.inIssue : N.subs.a;
                out.eventLog = psql(app, `select count(*), max(date_logged) from event_log where assoc_type=1048585 and assoc_id=${subId}`);
                fact('w-save-effects', out);
            });
        }

        // ======================= place: line 39, Settings 6, td10 ==============
        if (on('place')) {
            await step('place', async () => {
                const out = {};
                await as(N.u.mgr, N.path);
                await openSetup(page, app, N.path);
                out.before = await sidebarList(page);
                const wf = (out.before.find((o) => /web ?feed/i.test(`${o.label} ${o.value}`)) || {}).value;
                out.value = wf;
                await page.locator(`#appearance-setup input[name="sidebar"][value="${wf}"]`).first().setChecked(true);
                await loc(page, 'Appearance › Setup: the "Sidebar" box "Web Feed Plugin"', page.locator(`#appearance-setup input[name="sidebar"][value="${wf}"]`));
                // leave once with the tick unsaved: the tab switch, then the page
                const nd = dialogs.length;
                await page.locator('#appearance').getByRole('tab', {name: 'Theme', exact: true}).first().click(); await idle(page); await sleep(600);
                out.dialogsOnTabSwitch = dialogs.slice(nd);
                await page.locator('#appearance').getByRole('tab', {name: 'Setup', exact: true}).first().click(); await idle(page); await sleep(600);
                out.afterTabSwitch = await sidebarList(page);
                const nd2 = dialogs.length;
                await page.locator('#plugins-button').first().click(); await idle(page); await sleep(600);
                await page.goto(ctxUrl(app, N.path, '/submissions')).catch((e) => { out.leaveErr = String(e.message).slice(0, 200); });
                await idle(page);
                out.dialogsOnLeave = dialogs.slice(nd2);
                await openSetup(page, app, N.path);
                out.afterLeave = await sidebarList(page);
                await page.locator(`#appearance-setup input[name="sidebar"][value="${wf}"]`).first().setChecked(true);
                out.save = await saveSetup(page);
                await snap(page, 'p-01-sidebar-saved', {save: out.save});
                await page.reload(); await idle(page);
                await page.locator('#appearance').getByRole('tab', {name: 'Setup', exact: true}).first().click().catch(() => {}); await idle(page); await sleep(600);
                out.afterReload = await sidebarList(page);
                st.N.wf = wf; saveState();
                fact('place', out);
            });
        }

        // ======================= choices: Rules 11–12, A4, Settings 2 ==========
        if (on('choices')) {
            await step('choices', async () => {
                const choices = isOJS ? ['homepage', 'all', 'issue', 'homepage'] : ['homepage', 'all', 'homepage'];
                const out = [];
                let i = 0;
                for (const c of choices) {
                    await as(N.u.mgr, N.path);
                    await openWindow(page, app, N.path);
                    const ok = await windowOK(page, {displayPage: c});
                    await as(null);
                    const pages = {};
                    for (const [k, u] of pageSet(app, N)) pages[k] = brief(await pub(page, u, `c-${i}-${c}-${k}`));
                    out.push({choice: c, ok: {status: ok.status, stillOpen: ok.stillOpen, notices: ok.notices}, pages});
                    log(app.name, 'choice', c, JSON.stringify(Object.fromEntries(Object.entries(pages).map(([k, p]) => [k, `${p.box ? 'box' : '-'}/${p.alternates.length}`]))));
                    i++;
                }
                fact('choices', out);
                note(`K2 ${app.name}: public pages: the box is \`.block_web_feed\` (heading h2.title), its links \`.block_web_feed a\` with the image alt as name; discovery links read with \`head link[rel="alternate"]\`; the feed choice is set through the window's \`input[name="displayPage"][value=all|homepage|issue]\` and "OK" (\`getByRole('button', {name: 'OK', exact: true})\`).`);
            });
        }

        // ======================= follow: "each opening its feed" ===============
        if (on('follow')) {
            await step('follow', async () => {
                const out = {};
                await as(null);
                await page.goto(ctxUrl(app, N.path, '/about')); await idle(page);
                const links = await page.locator('.block_web_feed a').evaluateAll((els) => els.map((a) => ({href: a.getAttribute('href'), alt: a.querySelector('img')?.getAttribute('alt')})));
                out.links = links;
                for (const l of links) {
                    const f = await readFeed(page.request, l.href);
                    out[l.alt] = feedBrief(f);
                }
                await loc(page, 'the box\'s "Atom logo" link', page.getByRole('link', {name: 'Atom logo', exact: true}));
                await loc(page, 'the box\'s "RSS2 logo" link', page.getByRole('link', {name: 'RSS2 logo', exact: true}));
                await loc(page, 'the box\'s "RSS1 logo" link', page.getByRole('link', {name: 'RSS1 logo', exact: true}));
                // press each in the browser: what the visitor gets
                for (const name of ['Atom logo', 'RSS2 logo', 'RSS1 logo']) {
                    await page.goto(ctxUrl(app, N.path, '/about')); await idle(page);
                    const dl = page.waitForEvent('download', {timeout: 6000}).then((d) => ({download: d.suggestedFilename()})).catch(() => null);
                    const nav = page.waitForNavigation({timeout: 6000}).then((r) => ({navStatus: r ? r.status() : null, ct: r ? r.headers()['content-type'] : null})).catch(() => null);
                    await page.getByRole('link', {name, exact: true}).click().catch((e) => { out[`click:${name}:err`] = String(e.message).slice(0, 200); });
                    const [d, n] = await Promise.all([dl, nav]);
                    await sleep(800);
                    out[`click:${name}`] = {download: d, nav: n, url: page.url().replace(/^https?:\/\/[^/]+/, ''), textHead: flat(await bodyText(page), 200)};
                    await snap(page, `f-${name.split(' ')[0].toLowerCase()}-pressed`, out[`click:${name}`]);
                }
                fact('follow', out);
            });
        }

        // ======================= empty: the box whatever is published; E's seeded window
        if (on('empty')) {
            await step('empty', async () => {
                if (!st.E.path) { fact('empty', {skipped: st.E.err}); return; }
                const out = {};
                await as(null);
                out.home = brief(await pub(page, ctxUrl(app, st.E.path, ''), 'e-01-home-empty'));
                out.about = brief(await pub(page, ctxUrl(app, st.E.path, '/about'), 'e-02-about-empty'));
                out.feeds = {};
                for (const f of FEEDS) out.feeds[f] = feedBrief(await readFeed(page.request, feedUrl(app, st.E.path, f)));
                await as(st.E.u.mgr, st.E.path);
                out.window = await openWindow(page, app, st.E.path);
                await snap(page, 'e-03-window-seeded', {win: out.window});
                out.dbSeeded = pluginRows(app, st.E.path);
                out.ok = await windowOK(page, {});
                out.dbAfterOK = pluginRows(app, st.E.path);
                fact('empty', out);
            });
        }

        // ======================= closed: Rule 13, Settings 7–8 =================
        if (on('closed')) {
            await step('closed', async () => {
                const out = {};
                for (const K of ['C', 'D']) {
                    const X = st[K];
                    await as(null);
                    out[K] = {signedOut: {}, reader: {}};
                    for (const f of FEEDS) out[K].signedOut[f] = feedBrief(await readFeed(page.request, feedUrl(app, X.path, f)));
                    const r = await page.goto(feedUrl(app, X.path, 'atom')).catch(() => null);
                    await idle(page);
                    out[K].signedOutBrowser = {url: page.url().replace(/^https?:\/\/[^/]+/, ''), status: r ? r.status() : null, title: await page.title(), h1: (await page.locator('h1').allInnerTexts().catch(() => [])).map((x) => flat(x, 80))};
                    await snap(page, `x-${K}-atom-signedout`, out[K].signedOutBrowser);
                    await as(X.u.rd, X.path);
                    for (const f of FEEDS) out[K].reader[f] = feedBrief(await readFeed(page.request, feedUrl(app, X.path, f)));
                    await page.goto(ctxUrl(app, X.path, '')).catch(() => {}); await idle(page);
                    out[K].readerHome = {url: page.url().replace(/^https?:\/\/[^/]+/, ''), title: await page.title()};
                    await snap(page, `x-${K}-home-reader`, out[K].readerHome);
                }
                // Settings 7: the Site Access Options box as the manager, on N (default) and C (ticked)
                for (const [K, X] of [['N', N], ['C', st.C]]) {
                    await as(K === 'N' ? N.u.mgr : st.C.u.mgr, X.path);
                    await page.goto(ctxUrl(app, X.path, '/management/settings/access')); await idle(page);
                    const tabs = await page.locator('[role="tab"]').allInnerTexts().then((a) => a.map((x) => flat(x, 60))).catch(() => []);
                    await page.getByRole('tab', {name: 'Site Access Options', exact: true}).click().catch(() => {}); await idle(page); await sleep(500);
                    const box = page.getByRole('checkbox', {name: /Users must be registered and log in to view the (journal|press|server) site\./});
                    out[`access-${K}`] = {tabs, label: await box.evaluate((e) => (e.closest('label') || e.parentElement).innerText.trim()).catch(() => null), checked: await box.isChecked().catch(() => null)};
                    await snap(page, `x-access-${K}`, out[`access-${K}`]);
                }
                // Settings 8: Administration › Hosted Journals › "Edit", read only (N ticked, D not)
                await as('admin');
                for (const [K, name] of [['N', `U18 K2 N ${N.path}`], ['D', `U18 K2 D ${st.D.path}`]]) {
                    await page.goto(app.url('/index.php/index/admin/contexts')); await idle(page); await sleep(400);
                    const row = page.locator('tr.gridRow').filter({hasText: name}).first();
                    await row.locator('a.show_extras').click(); await idle(page); await sleep(300);
                    await row.locator('xpath=following-sibling::tr[1]').getByRole('link', {name: 'Edit', exact: true}).click();
                    const cb = page.getByRole('checkbox', {name: /appear publicly on the site/});
                    await cb.waitFor({timeout: T});
                    out[`hosted-${K}`] = {label: await cb.evaluate((e) => (e.closest('label') || e.parentElement).innerText.trim()).catch(() => null), checked: await cb.isChecked()};
                    await snap(page, `x-hosted-${K}`, out[`hosted-${K}`]);
                    await page.locator('[role="dialog"]:visible').last().getByRole('button', {name: /Close|Cancel/}).first().click().catch(() => page.keyboard.press('Escape'));
                    await sleep(800);
                }
                fact('closed', out);
            });
        }

        // ======================= disable: Rule 14, Settings 1, td13 ============
        if (on('disable')) {
            await step('disable', async () => {
                const out = {};
                await as(N.u.mgr, N.path);
                await openWindow(page, app, N.path);
                out.setAll = await windowOK(page, {displayPage: 'all'});
                await openWebsite(page, app, N.path, 'plugins');
                out.off = await setEnabled(page, false);
                await snap(page, 'd-01-disabled', {off: out.off});
                out.rowOff = await readRow(page);
                await openSetup(page, app, N.path);
                out.sidebarOff = await sidebarList(page);
                await snap(page, 'd-02-sidebar-off', {list: out.sidebarOff});
                out.dbOff = pluginRows(app, N.path);
                out.sidebarDbOff = psql(app, `select setting_value from ${{ojs: 'journal', omp: 'press', ops: 'server'}[app.name]}_settings where setting_name='sidebar' and ${contextTable(app)[1]}=(select ${contextTable(app)[1]} from ${contextTable(app)[0]} where path='${N.path}')`);
                await as(null);
                out.feedsOff = {};
                for (const f of FEEDS) out.feedsOff[f] = feedBrief(await readFeed(page.request, feedUrl(app, N.path, f)));
                const r = await page.goto(feedUrl(app, N.path, 'atom')).catch(() => null);
                out.atomOffBrowser = {status: r ? r.status() : null, title: await page.title(), text: flat(await bodyText(page), 200)};
                await snap(page, 'd-03-atom-off', out.atomOffBrowser);
                out.pagesOff = {};
                for (const [k, u] of pageSet(app, N)) out.pagesOff[k] = brief(await pub(page, u, `d-04-${k}-off`));
                // the Site Administrator's view of the disabled row (the expander and what it offers)
                await as('admin');
                await openWebsite(page, app, N.path, 'plugins');
                out.rowOffAdmin = await readRow(page);
                await snap(page, 'd-04b-row-off-admin', {row: out.rowOffAdmin});
                // enabled again
                await as(N.u.mgr, N.path);
                await openWebsite(page, app, N.path, 'plugins');
                out.on = await setEnabled(page, true);
                out.rowOn = await readRow(page);
                await snap(page, 'd-05-enabled-again', {on: out.on, row: out.rowOn});
                await openSetup(page, app, N.path);
                out.sidebarOn = await sidebarList(page);
                out.windowOn = await openWindow(page, app, N.path).then((w) => ({radios: w.radios.filter((x) => x.checked).map((x) => `${x.name}=${x.value}`), text: w.text.map((x) => `${x.name}=${x.value}`), checkboxes: w.checkboxes})).catch((e) => String(e.message));
                await windowCancel(page);
                out.dbOn = pluginRows(app, N.path);
                await as(null);
                out.feedsOn = {};
                for (const f of FEEDS) out.feedsOn[f] = feedBrief(await readFeed(page.request, feedUrl(app, N.path, f)));
                out.pagesOn = {};
                for (const [k, u] of pageSet(app, N)) out.pagesOn[k] = brief(await pub(page, u, `d-06-${k}-on`));
                fact('disable', out);
            });
        }

        // ======================= site: line 42 (read only) =====================
        if (on('site')) {
            await step('site', async () => {
                const out = {};
                await as('admin');
                await page.goto(app.url('/index.php/index/admin/settings')); await idle(page);
                out.tabs = await page.locator('[role="tab"]').allInnerTexts().then((a) => a.map((x) => flat(x, 60))).catch(() => []);
                await page.locator('#plugins-button').first().click().catch(() => {}); await idle(page); await sleep(800);
                out.row = await readRow(page, {expand: true});
                await snap(page, 's-01-site-plugins', out);
                await page.goto(app.url('/index.php/index/admin/settings')); await idle(page);
                await page.locator('#appearance-button').first().click().catch(() => {}); await idle(page);
                await page.locator('#appearance').getByRole('tab', {name: 'Setup', exact: true}).first().click().catch(() => {}); await idle(page); await sleep(800);
                out.siteSidebar = await page.locator('input[name="sidebar"]').evaluateAll((els) => els.map((e) => ({value: e.value, checked: e.checked, label: ((e.closest('label') || e.parentElement).querySelector('.pkpFormField--options__optionLabel') || e.closest('label') || {}).textContent?.replace(/\s+/g, ' ').trim()}))).catch(() => null);
                await snap(page, 's-02-site-sidebar', {siteSidebar: out.siteSidebar});
                // the other end: a Journal Manager at the Administration address
                await as(N.u.mgr, N.path);
                await page.goto(app.url('/index.php/index/admin/settings')); await idle(page);
                out.managerAtAdmin = await classify(page);
                await snap(page, 's-03-manager-admin', out.managerAtAdmin);
                fact('site', out);
            });
        }

        // ======================= m30: Rule 17's 30 (OJS) ======================
        if (on('m30') && st.M) {
            await step('m30', async () => {
                await as(null);
                const out = {db: pluginRows(app, st.M.path)};
                for (const f of FEEDS) { const x = await readFeed(page.request, feedUrl(app, st.M.path, f)); out[f] = {status: x.status, count: x.items.length, first: x.items[0], last: x.items[x.items.length - 1]}; }
                fact('m30', out);
            });
        }
        // ======================= adminwin: the Site Administrator saves; the feeds follow
        if (on('adminwin')) {
            await step('adminwin', async () => {
                const out = {};
                await as('admin');
                out.win = await openWindow(page, app, N.path).then((w) => ({title: w.title, radios: w.radios.filter((x) => x.checked).map((x) => x.value), text: w.text.map((x) => x.value)}));
                out.ok1 = await windowOK(page, {recentItems: '1'});
                await snap(page, 'aw-01-admin-ok-1', {ok: out.ok1});
                await as(null);
                out.feeds1 = {};
                for (const f of FEEDS) { const x = await readFeed(page.request, feedUrl(app, N.path, f)); out.feeds1[f] = {status: x.status, items: x.items}; }
                await as('admin');
                await openWindow(page, app, N.path);
                out.ok30 = await windowOK(page, {recentItems: '30'});
                await as(null);
                out.feeds30 = {};
                for (const f of FEEDS) { const x = await readFeed(page.request, feedUrl(app, N.path, f)); out.feeds30[f] = {status: x.status, items: x.items}; }
                fact('adminwin', {...out, ok1: {stillOpen: out.ok1.stillOpen, notices: out.ok1.notices}, ok30: {stillOpen: out.ok30.stillOpen, notices: out.ok30.notices}});
            });
        }
    } finally {
        record('dialogs', {dialogs}, {merge: true});
        await close();
    }
});
