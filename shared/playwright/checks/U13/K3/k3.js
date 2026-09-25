// U13 claim check, chunk K3: the "How to Cite" block and the "Citation Style Language" settings window.
// Spec: docs/specs/U13-article-landing-page-and-reading.md lines 129–148, 292–314 (Rules 15–16), 380–382,
// 396–402 (Settings 4–5), register OJS1 (618–626); footnotes h, i, o, q11, q12, f-ojs1.
//
// Per app (OJS, OPS) one scratch context J (acronym KCJ), the plugin left as a new context has it (off).
// Users: mgr (manager), se (sectionEditor, assigned), su (sectionEditor, unassigned; OJS), cp (copyeditor,
// assigned; OJS), au (author, the submitter "Ada Quillfeather"), rd (reader). OMP: a scratch press, the
// settings window as a read-only control.
// Submissions (submitter au):
//   A  long title (> 60 characters), published (OJS into the published issue Vol. 1 No. 1), PDF galley
//   V  short title, published (OJS Vol. 1 No. 1); the phase "pubprep" makes a second version with a new title
//   N  (OJS) published with no issue (continuous publication)
//   F  (OJS) in Production; "pubprep" publishes it on screen with "Assign To Future Issue and Publish
//      Immediately" into the unpublished Vol. 1 No. 2
//   D  seeded by the phase "dated": "Date Published" 2026-09-01 and (OJS) "Pages" 12-34 typed on screen, published,
//      then a second version with a new title published: which date and pages each version's citation names
//
//   PROBE_FEATURE=U13 PROBE_AGENT=ccK3 node bin/probe.js all shared/playwright/checks/U13/K3/k3.js
//   PHASES=seed,off,enable,window,pubprep,cite,roles,restore,dated,london,q12,nodl,noadd,disable,omp,ompbook (default all; state in
//   k3-state-<app>.json; the mutating phases run once per seed: delete the state file for a fresh run).
// No assertions: the script records, the reader judges.
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, signOut, screen, shot, record, loc, note, idle, settled, tag, outDir} =
    require('../../../probe');

const ALL = ['seed', 'off', 'enable', 'window', 'pubprep', 'cite', 'roles', 'restore', 'dated', 'london', 'q12', 'nodl', 'noadd', 'disable', 'omp', 'ompbook'];
const PHASES = process.env.PHASES ? process.env.PHASES.split(',') : ALL;
const on = (p) => PHASES.includes(p);
const log = (...a) => console.log(...a);
const flat = (s, n) => (s == null ? null : String(s).replace(/\s+/g, ' ').trim().slice(0, n || 600));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const T = 30000;
const stateFile = (app) => path.join(outDir(), `k3-state-${app.name}.json`);
const factsFile = 'k3-facts';

async function sect(name, fn) {
    try { await fn(); } catch (e) {
        log(`[${name} FAILED]`, String(e.stack || e).split('\n').slice(0, 6).join(' | '));
        record(`${name}-FAILED`, {error: String(e.stack || e).slice(0, 2000)});
    }
}

forEachApp(async (app) => {
    const sf = stateFile(app);
    const sc = fs.existsSync(sf) ? JSON.parse(fs.readFileSync(sf, 'utf8')) : {};
    const save = () => fs.writeFileSync(sf, JSON.stringify(sc, null, 2));
    const isOJS = app.name === 'ojs';
    const isOMP = app.name === 'omp';
    const isOPS = app.name === 'ops';
    const fact = (k, v) => { record(factsFile, {[k]: v}, {merge: true}); log(`[fact ${k}]`, flat(JSON.stringify(v), 1500)); };

    // ---- seed ------------------------------------------------------------------------------
    if (on('seed') && !sc.J) {
        const t = tag('u13k3');
        const roleUsers = isOJS
            ? [['mgr', 'manager', 'Mira', 'Manager'], ['se', 'sectionEditor', 'Sid', 'Section'], ['su', 'sectionEditor', 'Una', 'Unassigned'],
                ['cp', 'copyeditor', 'Cora', 'Copy'], ['au', 'author', 'Ada', 'Quillfeather'], ['rd', 'reader', 'Rex', 'Reader']]
            : isOPS
                ? [['mgr', 'manager', 'Mira', 'Manager'], ['se', 'sectionEditor', 'Mo', 'Moderator'], ['au', 'author', 'Ada', 'Quillfeather'], ['rd', 'reader', 'Rex', 'Reader']]
                : [['mgr', 'manager', 'Mira', 'Manager']];
        const users = roleUsers.map(([k, role, g, f]) => ({username: `${t}${k}`, roles: [role], givenName: g, familyName: f}));
        const spec = {tag: t, context: {name: `K3 Citation ${isOPS ? 'Server' : isOMP ? 'Press' : 'Journal'} ${t}`, acronym: 'KCJ',
            contactName: 'K3 Contact', contactEmail: `${t}c@mail.test`}, users};
        if (isOJS) spec.issues = [{volume: 1, number: 1, year: 2026, published: true}, {volume: 1, number: 2, year: 2026, published: false}];
        const ctx = await app.api.createContext(spec);
        sc.J = ctx.path || t; sc.t = t; sc.name = spec.context.name;
        sc.u = Object.fromEntries(roleUsers.map(([k]) => [k, `${t}${k}`]));
        save();
        if (!isOMP) {
            const U = sc.u;
            const parts = isOJS ? [{username: U.se, role: 'sectionEditor'}, {username: U.cp, role: 'copyeditor'}] : [{username: U.se, role: 'sectionEditor'}];
            const pdf = isOPS ? 'preprint.pdf' : 'article.pdf';
            const issue1 = isOJS ? {issue: {volume: 1, number: 1, year: 2026}} : {};
            const subs = {};
            const mk = async (k, title, extra) => {
                try {
                    const r = await app.api.createSubmission({tag: `${t}${k}`, context: sc.J, submitter: U.au, title, participants: parts, ...extra});
                    subs[k] = {id: r.submissionId, pub: r.publicationId, title, status: r.status};
                    log(`[seed ${k}]`, r.submissionId, 'status', r.status);
                } catch (e) { log(`[seed ${k} FAILED]`, flat(e.message, 700)); subs[k] = {error: flat(e.message, 700)}; }
            };
            await mk('A', `Kestrel migration corridors along the northern ridge and their seasonal shifts ${t}`,
                {published: true, galleys: [{label: 'PDF', file: pdf}], ...issue1});
            await mk('V', `Kestrel first version ${t}`, {published: true, ...issue1});
            if (isOJS) {
                await mk('N', `Kestrel continuous ${t}`, {published: true});
                await mk('F', `Kestrel future issue ${t}`, {decisions: ['skipExternalReview', 'sendToProduction'], galleys: [{label: 'PDF', file: pdf}]});
            }
            sc.subs = subs; save();
        }
        record('seed', sc);
    }
    if (!sc.J) { log('[k3] no state; run the seed phase first'); return; }
    const J = sc.J; const u = sc.u; const S = sc.subs || {};

    const {page, close} = await launch(app);
    const jsDialogs = [];
    page.on('dialog', (d) => {
        jsDialogs.push({at: Date.now(), type: d.type(), message: flat(d.message(), 300), url: page.url().replace(/^.*\/index\.php/, '')});
        log('[browser dialog]', d.type(), flat(d.message(), 160));
        d.accept().catch(() => {});
    });
    const dialogsSince = (s) => jsDialogs.filter((d) => d.at >= s);
    await page.context().addInitScript(() => {
        window.__notices = [];
        const seen = new WeakSet();
        const sweep = () => {
            document.querySelectorAll('[role="alert"], [role="status"], .pkpNotification, .pkp_notification, .ui-pnotify, [class*="toast"], [class*="Toast"]').forEach((e) => {
                const tx = (e.innerText || '').trim();
                if (tx && !seen.has(e)) { seen.add(e); window.__notices.push({t: tx.slice(0, 300), at: Date.now()}); }
            });
        };
        new MutationObserver(sweep).observe(document, {subtree: true, childList: true, characterData: true});
    });
    const noticesSince = async (s) => page.evaluate((x) => (window.__notices || []).filter((n) => n.at >= x).map((n) => n.t), s).catch(() => []);
    // The page's own citation traffic.
    const cslTraffic = [];
    page.on('response', async (r) => {
        if (!/citationstylelanguage\/(get|download)/.test(r.url())) return;
        const e = {at: Date.now(), url: r.url().replace(/^.*\/index\.php/, ''), status: r.status(), type: r.headers()['content-type'] || null, disposition: r.headers()['content-disposition'] || null};
        if (r.status() >= 400 || /json/.test(e.type || '')) {
            try { const b = await r.text(); e.body = flat(b, 300); } catch (err) { /* download bodies are not readable */ }
        }
        cslTraffic.push(e);
    });
    const trafficSince = (s) => cslTraffic.filter((x) => x.at >= s);

    async function snap(name, extra) {
        let s;
        try { s = await screen(page); } catch (e) { s = {url: page.url(), error: flat(e.message, 200)}; }
        if (extra) Object.assign(s, extra);
        record(name, s);
        await shot(page, name).catch(() => {});
        return s;
    }
    const as = async (who) => {
        if (!who) { await signOut(page).catch(() => {}); return; }
        await signIn(page, who, {contextPath: J}); await idle(page);
    };
    const itemUrl = (id, pubId) => app.url(`/index.php/${J}/${isOPS ? 'preprint' : 'article'}/view/${id}${pubId ? `/version/${pubId}` : ''}`);

    // ---- Settings › Website › Plugins ---------------------------------------------------------
    const cslRow = () => page.locator('#pluginGridContainer tr.gridRow[id$="-row-citationstylelanguageplugin"]');
    async function gotoPlugins() {
        await page.goto(app.url(`/index.php/${J}/management/settings/website`));
        await idle(page);
        await page.locator('#plugins-button').first().click();
        await page.locator('#pluginGridContainer tr.gridRow').first().waitFor({timeout: T});
        await idle(page); await sleep(400);
    }
    async function rowRead() {
        const row = cslRow();
        const out = {count: await row.count()};
        if (!out.count) return out;
        out.text = flat(await row.innerText());
        out.checked = await row.getByRole('checkbox').first().isChecked().catch(() => null);
        const exp = row.locator('a.show_extras').first();
        out.expander = await exp.count();
        if (out.expander) { await exp.click(); await sleep(500); }
        const controls = page.locator('#pluginGridContainer tr[id$="-row-citationstylelanguageplugin"] + tr');
        out.links = await controls.locator('a').evaluateAll((els) => els.filter((e) => e.offsetParent !== null).map((e) => e.innerText.trim()).filter(Boolean)).catch(() => []);
        if (out.expander) { await row.locator('a.hide_extras').first().click().catch(() => {}); await sleep(300); }
        return out;
    }
    async function setCsl(want) {
        const box = cslRow().getByRole('checkbox').first();
        const out = {before: await box.isChecked(), want};
        if (out.before === want) return out;
        const t0 = Date.now();
        const w = page.waitForResponse((r) => /settings-plugin-grid\/(enable|disable)/.test(r.url()), {timeout: T}).catch(() => null);
        await box.click({noWaitAfter: true});
        await sleep(700);
        const dlg = page.locator('[role="dialog"]:visible');
        if (await dlg.count()) {
            out.confirm = flat(await dlg.last().innerText().catch(() => null), 400);
            const ok = dlg.last().getByRole('button', {name: /^(OK|Yes)$/}).first();
            if (await ok.count()) await ok.click();
        }
        const resp = await w;
        out.status = resp ? resp.status() : null;
        await sleep(1200); await idle(page);
        out.after = await cslRow().getByRole('checkbox').first().isChecked().catch(() => null);
        out.notices = await noticesSince(t0);
        out.dialogs = dialogsSince(t0);
        return out;
    }

    // ---- the settings window -------------------------------------------------------------------
    const form = () => page.locator('#citationStyleLanguageSettingsForm');
    async function openSettings() {
        await gotoPlugins();
        const row = cslRow();
        const exp = row.locator('a.show_extras').first();
        if (await exp.count()) { await exp.click(); await sleep(500); }
        const link = page.locator('#pluginGridContainer tr[id$="-row-citationstylelanguageplugin"] + tr').getByRole('link', {name: 'Settings', exact: true}).first();
        await loc(page, 'Website › Plugins: the "Citation Style Language" row\'s "Settings" (after the row\'s arrow)', link);
        await link.click();
        await form().locator('input[name="publisherLocation"]').waitFor({state: 'visible', timeout: T});
        await settled(page, form().locator('label').first());
        await idle(page); await sleep(400);
    }
    async function winState() {
        const dialog = page.locator('[role="dialog"]:visible').filter({has: form()}).last();
        const data = await form().evaluate((root) => {
            const t = (e) => (e ? e.innerText.replace(/\s+/g, ' ').trim() : null);
            const lab = (i) => { const l = root.querySelector(`label[for="${i.id}"]`) || i.closest('label'); return l ? t(l) : null; };
            const sections = [...root.querySelectorAll('.section, fieldset')].map((s) => ({label: t(s.querySelector('legend, .label, label.sub_label, h3')), text: t(s).slice(0, 700)}));
            return {
                sections,
                radios: [...root.querySelectorAll('input[type=radio]')].map((i) => ({value: i.value, label: lab(i), checked: i.checked})),
                styles: [...root.querySelectorAll('input[type=checkbox][name="enabledCitationStyles[]"]')].map((i) => ({value: i.value, label: lab(i), checked: i.checked})),
                downloads: [...root.querySelectorAll('input[type=checkbox][name="enabledCitationDownloads[]"]')].map((i) => ({value: i.value, label: lab(i), checked: i.checked})),
                location: (() => { const i = root.querySelector('input[name="publisherLocation"]'); return i ? {value: i.value, label: lab(i), required: i.required} : null; })(),
                description: t(root.querySelector('#description')),
                buttons: [...root.querySelectorAll('button, input[type=submit], a')].filter((b) => b.offsetParent !== null).map((b) => (b.innerText || b.value || '').replace(/\s+/g, ' ').trim()).filter(Boolean),
                text: t(root),
            };
        });
        return {open: await form().isVisible().catch(() => false), title: flat(await dialog.locator('h1, h2, .pkp_modal_title, [class*="title"]').first().innerText().catch(() => null), 200),
            dialogButtons: await dialog.locator('button').evaluateAll((els) => els.filter((e) => e.offsetParent !== null).map((e) => (e.innerText || e.getAttribute('aria-label') || '').trim())).catch(() => []),
            ...data};
    }
    // set: {primary: id, styles: [ids], downloads: [ids], location: string}
    async function applySettings(set) {
        const f = form();
        if (set.primary) await f.locator(`input[type=radio][name="primaryCitationStyle"][value="${set.primary}"]`).check();
        if (set.styles) {
            for (const b of await f.locator('input[type=checkbox][name="enabledCitationStyles[]"]').all()) {
                const want = set.styles.includes(await b.getAttribute('value'));
                if ((await b.isChecked()) !== want) await b.click();
            }
        }
        if (set.downloads) {
            for (const b of await f.locator('input[type=checkbox][name="enabledCitationDownloads[]"]').all()) {
                const want = set.downloads.includes(await b.getAttribute('value'));
                if ((await b.isChecked()) !== want) await b.click();
            }
        }
        if (set.location !== undefined) await f.locator('input[name="publisherLocation"]').fill(set.location);
    }
    async function saveSettings(set, name) {
        await openSettings();
        await applySettings(set);
        const t0 = Date.now();
        const w = page.waitForResponse((r) => r.request().method() === 'POST' && /citationstylelanguageplugin|manage/.test(r.url()), {timeout: 15000}).catch(() => null);
        await form().getByRole('button', {name: /^(OK|Save)$/}).click();
        const resp = await w;
        await sleep(1500); await idle(page); await sleep(800);
        const out = {set, status: resp ? resp.status() : null, stillOpen: await form().isVisible().catch(() => false), notices: await noticesSince(t0), dialogs: dialogsSince(t0)};
        await snap(name, {save: out});
        // what the window shows when reopened
        await openSettings();
        out.reopened = await winState();
        await snap(`${name}-reopened`, {win: out.reopened});
        await closeWindow('cancel');
        return out;
    }
    async function closeWindow(how) {
        const f = form();
        if (how === 'cancel') {
            const c = f.getByRole('link', {name: 'Cancel', exact: true}).or(f.getByRole('button', {name: 'Cancel', exact: true})).first();
            await c.click().catch(() => {});
        } else {
            await page.locator('[role="dialog"]:visible').filter({has: f}).last().getByRole('button', {name: /Close/}).first().click().catch(() => {});
        }
        await f.waitFor({state: 'hidden', timeout: 10000}).catch(() => {});
        await idle(page); await sleep(700);
    }

    // ---- the block on the item's page ----------------------------------------------------------
    async function blockRead() {
        return page.evaluate(() => {
            const t = (e) => (e ? e.innerText.replace(/\s+/g, ' ').trim() : null);
            const v = (e) => !!e && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
            const out = document.getElementById('citationOutput');
            const heads = [...document.querySelectorAll('h2, h3')].map(t).filter((x) => /How to Cite/i.test(x || ''));
            if (!out) return {present: false, headings: heads};
            const block = out.closest('.item, section') || out.parentElement;
            const btn = document.querySelector('[aria-controls="cslCitationFormats"]');
            const list = document.getElementById('cslCitationFormats');
            const uls = list ? [...list.querySelectorAll('ul')] : [];
            const labels = list ? [...list.querySelectorAll('.label')].map(t) : [];
            const col = out.closest('.entry_details, .main_entry, .row, aside, .col-md-4, .col-md-8');
            return {
                present: true,
                headings: heads,
                blockHeading: t(block && block.querySelector('h2, h3, .label')),
                citation: t(out),
                citationHtml: out.innerHTML.replace(/\s+/g, ' ').trim().slice(0, 1500),
                button: btn ? {text: t(btn), expanded: btn.getAttribute('aria-expanded'), visible: v(btn)} : null,
                list: list ? {ariaHidden: list.getAttribute('aria-hidden'), visible: v(list), className: list.className} : null,
                styles: uls[0] ? [...uls[0].querySelectorAll('a')].map((a) => ({text: t(a), visible: v(a), href: (a.getAttribute('href') || '').replace(/^.*\/index\.php/, ''), json: !!a.dataset.jsonHref})) : [],
                downloadLabels: labels,
                downloads: uls[1] ? [...uls[1].querySelectorAll('a')].map((a) => ({text: t(a), visible: v(a), href: (a.getAttribute('href') || '').replace(/^.*\/index\.php/, '')})) : [],
                column: col ? col.className : null,
            };
        });
    }
    async function openItem(id, pubId, name) {
        await page.goto(itemUrl(id, pubId));
        await idle(page); await sleep(300);
        const b = await blockRead();
        const s = await snap(name, {block: b});
        return {status: s.title, block: b, url: page.url().replace(/^.*\/index\.php/, '')};
    }
    const btn = () => page.locator('[aria-controls="cslCitationFormats"]').first();
    async function toggleList() {
        const b = btn();
        await b.click();
        await sleep(400);
        return {expanded: await b.getAttribute('aria-expanded'), listVisible: await page.locator('#cslCitationFormats').isVisible().catch(() => null),
            ariaHidden: await page.locator('#cslCitationFormats').getAttribute('aria-hidden').catch(() => null)};
    }
    async function ensureOpen() {
        if ((await btn().getAttribute('aria-expanded')) !== 'true') return toggleList();
        return null;
    }
    async function choose(label) {
        await ensureOpen();
        const before = {url: page.url(), citation: flat(await page.locator('#citationOutput').innerText().catch(() => null), 1500)};
        const t0 = Date.now();
        const link = page.locator('#cslCitationFormats ul').first().locator('a').filter({hasText: new RegExp(`^\\s*${label.replace(/[()]/g, '\\$&')}\\s*$`)}).first();
        const w = page.waitForResponse((r) => /citationstylelanguage\/get/.test(r.url()), {timeout: 15000}).catch(() => null);
        await link.click();
        await w;
        await sleep(900);
        return {label, urlBefore: before.url.replace(/^.*\/index\.php/, ''), urlAfter: page.url().replace(/^.*\/index\.php/, ''),
            citationBefore: before.citation, citationAfter: flat(await page.locator('#citationOutput').innerText().catch(() => null), 1500),
            changed: before.citation !== flat(await page.locator('#citationOutput').innerText().catch(() => null), 1500),
            listAfter: {expanded: await btn().getAttribute('aria-expanded').catch(() => null), visible: await page.locator('#cslCitationFormats').isVisible().catch(() => null)},
            traffic: trafficSince(t0), notices: await noticesSince(t0)};
    }
    async function download(label) {
        await ensureOpen();
        const link = page.locator('#cslCitationFormats ul').nth(1).locator('a').filter({hasText: label}).first();
        if (!(await link.count())) return {label, offered: false};
        const href = (await link.getAttribute('href') || '').replace(/^.*\/index\.php/, '');
        const before = page.url();
        const t0 = Date.now();
        // A download starts as a navigation that the browser aborts: a failed URL wait must not end the race.
        const dlP = page.waitForEvent('download', {timeout: 15000}).then((d) => ({d}), () => null);
        const navP = page.waitForURL((x) => x.href !== before, {timeout: 15000, waitUntil: 'load'}).then(() => ({nav: true}), () => new Promise(() => {}));
        await link.click();
        const r = await Promise.race([dlP, navP]);
        const out = {label, href};
        if (r && r.d) {
            out.kind = 'download';
            out.filename = r.d.suggestedFilename();
            const p = await r.d.path().catch(() => null);
            if (p) { const txt = fs.readFileSync(p, 'utf8'); out.firstLine = flat(txt.split(/\r?\n/)[0], 300); out.text = txt.slice(0, 1500); }
        } else if (r && r.nav) {
            out.kind = 'navigation';
            await idle(page).catch(() => {});
            out.url = page.url().replace(/^.*\/index\.php/, '');
            out.title = await page.title().catch(() => null);
            out.body = flat(await page.locator('body').innerText().catch(() => null), 500);
            await snap(`dl-nav-${label.replace(/[^a-z]+/gi, '').slice(0, 12)}-${Date.now() % 100000}`);
        } else {
            out.kind = 'nothing';
        }
        await sleep(500);
        out.traffic = trafficSince(t0);
        if (page.url() !== before) { await page.goto(before); await idle(page); }
        return out;
    }
    const titleOf = (k) => S[k] && S[k].title;
    const markers = (k) => ({title: titleOf(k), author: 'Quillfeather', journal: sc.name, acronym: 'KCJ', issue: isOJS ? 'Vol. 1 No. 1|1(1)|vol. 1|no. 1' : null, year: '2026', url: `/${isOPS ? 'preprint' : 'article'}/view/${S[k] && S[k].id}`, london: 'London'});
    function hits(text, k) {
        const m = markers(k); const o = {};
        const low = (text || '').toLowerCase();
        for (const [key, val] of Object.entries(m)) {
            if (!val) continue;
            o[key] = val.split('|').some((x) => low.includes(x.toLowerCase()));
        }
        return o;
    }

    try {
        if (isOMP) {
            // ============================================================ OMP read-only control: the plugin row and the window
            if (on('omp')) await sect('omp', async () => {
                const out = {};
                await as(u.mgr);
                await gotoPlugins();
                out.rowOff = await rowRead();
                await snap('o-01-plugins-off', {row: out.rowOff});
                out.enable = await setCsl(true);
                out.rowOn = await rowRead();
                await snap('o-02-plugins-on', {row: out.rowOn, enable: out.enable});
                await openSettings();
                out.window = await winState();
                await snap('o-03-settings-window', {win: out.window});
                const t0 = Date.now();
                await form().getByRole('button', {name: /^(OK|Save)$/}).click();
                await sleep(1800); await idle(page);
                out.saveUntouched = {stillOpen: await form().isVisible().catch(() => false), notices: await noticesSince(t0)};
                await snap('o-04-saved-untouched', {save: out.saveUntouched});
                fact('omp', out);
            });
            // ============================================================ OMP control for Rule 15c ({OJS}): a published book's formats and download, visitor
            if (on('ompbook')) await sect('ompbook', async () => {
                const out = {};
                if (!sc.B) {
                    const r = await app.api.createSubmission({tag: `${sc.t}B`, context: J, submitter: u.mgr, title: `Kestrel book ${sc.t}`, published: true});
                    sc.B = {id: r.submissionId, status: r.status}; save();
                }
                await as(null);
                await page.goto(app.url(`/index.php/${J}/catalog/book/${sc.B.id}`)); await idle(page);
                const b = await blockRead();
                await snap('o-05-book-visitor', {block: b});
                out.present = b.present; out.citation = b.citation; out.styles = b.styles.map((x) => x.text); out.downloads = b.downloads.map((x) => x.text);
                if (b.present) {
                    const m = await choose('MLA'); out.mla = {changed: m.changed, traffic: m.traffic.map((x) => x.status)};
                    const d = await download('BibTeX'); out.bib = {kind: d.kind, filename: d.filename, traffic: (d.traffic || []).map((x) => x.status)};
                }
                fact('ompbook', out);
            });
            return;
        }

        // ============================================================ off: a new context (Settings bullet 4, line 140 off end)
        if (on('off')) await sect('off', async () => {
            const out = {};
            await as(null);
            out.pageA = await openItem(S.A.id, null, 'f-01-item-A-plugin-off-visitor');
            await as(u.mgr);
            await gotoPlugins();
            out.row = await rowRead();
            await snap('f-02-plugins-off', {row: out.row});
            await loc(page, 'Website › Plugins: the "Citation Style Language" row', cslRow());
            await loc(page, 'Website › Plugins: the row\'s box', cslRow().getByRole('checkbox'));
            fact('off', out);
        });

        // ============================================================ enable
        if (on('enable')) await sect('enable', async () => {
            const out = {};
            await as(u.mgr);
            await gotoPlugins();
            out.enable = await setCsl(true);
            out.row = await rowRead();
            await snap('e-01-plugins-on', {row: out.row, enable: out.enable});
            await gotoPlugins();
            out.rowReload = await rowRead();
            await as(null);
            out.pageA = await openItem(S.A.id, null, 'e-02-item-A-plugin-on-visitor');
            fact('enable', out);
        });

        // ============================================================ window: defaults, Cancel after a change, the close button after a change
        if (on('window')) await sect('window', async () => {
            const out = {};
            await as(u.mgr);
            await openSettings();
            out.defaults = await winState();
            await snap('w-01-settings-defaults', {win: out.defaults});
            await loc(page, 'CSL settings: the form #citationStyleLanguageSettingsForm', form());
            await loc(page, 'CSL settings: "Primary Citation Format" radio (IEEE)', form().locator('input[type=radio][name="primaryCitationStyle"][value="ieee"]'));
            await loc(page, 'CSL settings: "Additional Citation Formats" box (MLA)', form().locator('input[type=checkbox][name="enabledCitationStyles[]"][value="modern-language-association"]'));
            await loc(page, 'CSL settings: "Downloadable Formats" box (BibTeX)', form().locator('input[type=checkbox][name="enabledCitationDownloads[]"][value="bibtex"]'));
            await loc(page, 'CSL settings: "Publisher Location" input[name="publisherLocation"]', form().locator('input[name="publisherLocation"]'));
            await loc(page, 'CSL settings: the submit button ("OK")', form().getByRole('button', {name: /^(OK|Save)$/}));
            await loc(page, 'CSL settings: "Cancel"', form().getByRole('link', {name: 'Cancel', exact: true}).or(form().getByRole('button', {name: 'Cancel', exact: true})));
            // Cancel after changing every field
            await applySettings({primary: 'vancouver', styles: ['ama'], downloads: ['ris'], location: 'Cancelled City'});
            let t0 = Date.now();
            await closeWindow('cancel');
            out.cancel = {dialogs: dialogsSince(t0), notices: await noticesSince(t0), traffic: trafficSince(t0)};
            await openSettings();
            out.afterCancel = await winState();
            await snap('w-02-after-cancel-reopened', {win: out.afterCancel, cancel: out.cancel});
            // the window's close button after a change
            await applySettings({primary: 'ama', location: 'Closed City'});
            await form().locator('input[name="publisherLocation"]').blur().catch(() => {});
            t0 = Date.now();
            await closeWindow('close');
            out.closeX = {dialogs: dialogsSince(t0), notices: await noticesSince(t0), stillOpen: await form().isVisible().catch(() => false)};
            await snap('w-03-after-close-button', {close: out.closeX});
            // leave the page with the window changed and unsaved
            await openSettings();
            await applySettings({primary: 'harvard-cite-them-right'});
            t0 = Date.now();
            await page.goto(app.url(`/index.php/${J}/management/settings/context`)).catch((e) => { out.leaveErr = flat(e.message, 200); });
            await idle(page);
            out.leave = {dialogs: dialogsSince(t0), url: page.url().replace(/^.*\/index\.php/, '')};
            await openSettings();
            out.afterLeave = await winState();
            await snap('w-04-after-leave-reopened', {win: out.afterLeave, leave: out.leave});
            await closeWindow('cancel');
            fact('window', out);
        });

        // ============================================================ pubprep: a second version of V; OJS F published at once into the unpublished issue
        if (on('pubprep') && !sc.pubprepDone) await sect('pubprep', async () => {
            const out = {};
            await as(u.mgr);
            const wfUrl = (sid, key) => app.url(`/index.php/${J}/dashboard/editorial?workflowSubmissionId=${sid}${key ? `&workflowMenuKey=${key}` : ''}`);
            // second version of V
            await page.goto(wfUrl(S.V.id, `publication_${S.V.pub}_titleAbstract`)); await idle(page); await sleep(1500);
            const link = page.getByRole('link', {name: 'Create New Version', exact: true}).or(page.getByRole('button', {name: 'Create New Version', exact: true})).first();
            await link.waitFor({state: 'visible', timeout: T});
            await link.click();
            const w = page.getByRole('dialog').filter({hasText: 'Which version should metadata be copied from?'}).last();
            await w.getByRole('button', {name: 'Confirm', exact: true}).waitFor({timeout: T});
            await idle(page); await sleep(800);
            const stage = w.locator('select[name="versionStage"]');
            if (await stage.count() && !(await stage.inputValue())) await stage.selectOption('VoR');
            const minor = w.locator('select[name="versionIsMinor"]');
            if (await minor.count() && await minor.isVisible().catch(() => false) && !(await minor.inputValue())) await minor.selectOption('false');
            const r = page.waitForResponse((x) => /\/publications\/\d+\/version/.test(x.url()) && x.request().method() === 'POST', {timeout: T}).catch(() => null);
            await w.getByRole('button', {name: 'Confirm', exact: true}).click();
            const resp = await r;
            let v2 = null; try { v2 = (await resp.json()).id; } catch (e) { /* none */ }
            out.v2 = v2;
            S.V.v2 = v2; S.V.v2title = `Kestrel second version ${sc.t}`;
            await sleep(1500); await idle(page);
            await page.goto(wfUrl(S.V.id, `publication_${v2}_titleAbstract`)); await idle(page); await sleep(1500);
            await page.waitForFunction((id) => !!window.tinymce?.get(id)?.initialized, 'titleAbstract-title-control-en', {timeout: T});
            await page.evaluate(([id, val]) => { const e = window.tinymce.get(id); e.setContent(val); e.fire('change'); }, ['titleAbstract-title-control-en', S.V.v2title]);
            const sv = page.waitForResponse((x) => x.url().includes('/publications/') && x.request().method() === 'POST', {timeout: T}).catch(() => null);
            await page.getByRole('button', {name: 'Save', exact: true}).first().click();
            out.saveTitle = (await sv)?.status();
            await sleep(1000);
            if (isOJS) {
                const {PublicationScreen} = require(path.join(app.suiteDir, 'pages', 'PublicationMetadataPages.js'));
                const ps = new PublicationScreen(page, J);
                const pr = page.waitForResponse((x) => x.url().includes('/publish') && x.request().method() !== 'GET', {timeout: 60000}).catch(() => null);
                await ps.publish({backIssueLabel: /Vol\. 1 No\. 1/}).catch((e) => { out.v2PublishErr = flat(e.message, 300); });
                out.v2Publish = (await pr)?.status();
                await snap('p-01-v2-published', {out});
                if (out.v2PublishErr) {
                    // a new version of an article already in an issue may offer no issue choice
                    await page.goto(wfUrl(S.V.id, `publication_${v2}_titleAbstract`)); await idle(page); await sleep(1000);
                    const pr2 = page.waitForResponse((x) => x.url().includes('/publish') && x.request().method() !== 'GET', {timeout: 60000}).catch(() => null);
                    await ps.publish({}).catch((e) => { out.v2PublishErr2 = flat(e.message, 300); });
                    out.v2Publish2 = (await pr2)?.status();
                    await snap('p-01b-v2-published-retry', {out});
                }
                // F: "Assign To Future Issue and Publish Immediately"
                await page.goto(wfUrl(S.F.id, `publication_${S.F.pub}_titleAbstract`)); await idle(page); await sleep(1500);
                const pf = page.waitForResponse((x) => x.url().includes('/publish') && x.request().method() !== 'GET', {timeout: 60000}).catch(() => null);
                await ps.publish({futureIssueLabel: /Vol\. 1 No\. 2/}).catch((e) => { out.fPublishErr = flat(e.message, 300); });
                out.fPublish = (await pf)?.status();
                await snap('p-02-F-published-future-issue', {out});
            } else {
                await page.goto(wfUrl(S.V.id, `publication_${v2}_titleAbstract`)); await idle(page); await sleep(1500);
                const post = page.getByRole('button', {name: 'Post', exact: true}).first();
                await post.waitFor({timeout: T});
                await post.click();
                const conf = page.getByRole('dialog').filter({hasText: /Are you sure you want to post this\?/});
                await conf.waitFor({timeout: T});
                const pr = page.waitForResponse((x) => /\/publish/.test(x.url()), {timeout: T}).catch(() => null);
                await conf.getByRole('button', {name: 'Post', exact: true}).last().click();
                out.v2Publish = (await pr)?.status();
                await sleep(1500); await idle(page);
                await snap('p-01-v2-posted', {out});
            }
            sc.subs = S; sc.pubprepDone = true; save();
            fact('pubprep', out);
        });

        // ============================================================ cite: Rule 15, 15a, 15b, 15c (q11), defaults, visitor
        if (on('cite')) await sect('cite', async () => {
            const out = {};
            await as(null);
            // A: every format, the toggle, reload, both downloads
            const a = await openItem(S.A.id, null, 'c-01-item-A-visitor');
            out.A = {block: a.block, primaryHits: hits(a.block.citation, 'A')};
            await loc(page, 'Item page: the "How to Cite" citation #citationOutput', page.locator('#citationOutput'));
            await loc(page, 'Item page: "More Citation Formats" [aria-controls="cslCitationFormats"]', btn());
            await loc(page, 'Item page: the formats list #cslCitationFormats', page.locator('#cslCitationFormats'));
            out.A.toggle1 = await toggleList();
            await snap('c-02-item-A-list-open', {toggle: out.A.toggle1, block: await blockRead()});
            out.A.toggle2 = await toggleList();
            out.A.formats = {};
            for (const s of a.block.styles) {
                const c = await choose(s.text);
                c.hits = hits(c.citationAfter, 'A');
                out.A.formats[s.text] = c;
            }
            await snap('c-03-item-A-after-formats', {formats: out.A.formats});
            await page.reload(); await idle(page);
            out.A.afterReload = flat(await page.locator('#citationOutput').innerText().catch(() => null), 1500);
            out.A.reloadIsPrimary = out.A.afterReload === a.block.citation;
            await snap('c-04-item-A-reloaded');
            out.A.downloads = [];
            for (const d of a.block.downloads) out.A.downloads.push(await download(d.text));
            await snap('c-05-item-A-after-downloads', {downloads: out.A.downloads});
            // V: current and older version
            const vc = await openItem(S.V.id, null, 'c-06-item-V-current-visitor');
            out.Vcurrent = {citation: vc.block.citation, hits: hits(vc.block.citation, 'V'), mla: await choose('MLA'), bib: await download('BibTeX')};
            out.Vcurrent.versionLinks = await page.locator('a[href*="/version/"]').evaluateAll((els) => els.map((e) => ({text: e.innerText.trim(), href: (e.getAttribute('href') || '').replace(/^.*\/index\.php/, '')}))).catch(() => []);
            const vo = await openItem(S.V.id, S.V.pub, 'c-07-item-V-older-version-visitor');
            out.Vold = {url: vo.url, citation: vo.block.citation, namesV1: (vo.block.citation || '').includes('first version'), namesV2: (vo.block.citation || '').includes('second version'),
                styleHref0: vo.block.styles[0] && vo.block.styles[0].href};
            out.Vold.mla = await choose('MLA');
            out.Vold.mlaNamesV1 = (out.Vold.mla.citationAfter || '').includes('first version');
            out.Vold.bib = await download('BibTeX');
            out.Vold.ris = await download('RIS');
            await snap('c-08-item-V-older-after', {vold: out.Vold});
            if (isOJS) {
                for (const k of ['N', 'F']) {
                    const n = await openItem(S[k].id, null, `c-09-item-${k}-visitor`);
                    out[k] = {citation: n.block.citation, hits: hits(n.block.citation, k), styles: n.block.styles.length, downloads: n.block.downloads.map((d) => d.text)};
                    out[k].mla = await choose('MLA');
                    out[k].apa = await choose('APA');
                    out[k].bib = await download('BibTeX');
                    out[k].ris = await download('RIS');
                    await snap(`c-10-item-${k}-after`, {res: out[k]});
                    if (k === 'F') {
                        // where F sits: the issue it names, and the unpublished issue's page for a visitor
                        out.F.issueLine = flat(await page.locator('.item.issue, .issue').first().innerText().catch(() => null), 300);
                    }
                }
            }
            fact('cite', out);
        });

        // ============================================================ roles: the same choice and download per permission level
        if (on('roles')) await sect('roles', async () => {
            const out = {};
            const levels = isOJS ? [['reader', u.rd], ['author', u.au], ['sub-editor assigned', u.se], ['sub-editor unassigned', u.su], ['assistant assigned', u.cp], ['manager', u.mgr]]
                : [['reader', u.rd], ['author', u.au], ['moderator assigned', u.se], ['manager', u.mgr]];
            const items = isOJS ? ['A', 'N', 'F'] : ['A'];
            for (const [lvl, who] of levels) {
                await as(who);
                out[lvl] = {};
                for (const k of items) {
                    const n = await openItem(S[k].id, null, `r-${lvl.replace(/[^a-z]+/g, '-')}-${k}`);
                    const mla = await choose('MLA');
                    const bib = await download('BibTeX');
                    out[lvl][k] = {present: n.block.present, citation: flat(n.block.citation, 300), mlaChanged: mla.changed, mlaTraffic: mla.traffic.map((x) => `${x.status} ${x.type}`),
                        bib: {kind: bib.kind, filename: bib.filename, title: bib.title, traffic: (bib.traffic || []).map((x) => x.status)}};
                }
            }
            fact('roles', out);
        });

        // ============================================================ restore: every format back (a rerun after the settings phases)
        if (on('restore')) await sect('restore', async () => {
            await as(u.mgr);
            const all = ['associacao-brasileira-de-normas-tecnicas', 'acm-sig-proceedings', 'acs-nano', 'ama', 'apa', 'chicago-author-date',
                'harvard-cite-them-right', 'ieee', 'modern-language-association', 'turabian-fullnote-bibliography', 'vancouver'];
            const r = await saveSettings({primary: 'apa', styles: all, downloads: ['ris', 'bibtex'], location: ''}, 's-01-restore');
            fact('restore', {status: r.status, notices: r.notices, primary: r.reopened.radios.filter((x) => x.checked).map((x) => x.label), styles: r.reopened.styles.filter((x) => x.checked).length});
        });

        // ============================================================ dated: the date and pages a version's citation names (Rule 15)
        if (on('dated')) await sect('dated', async () => {
            const out = sc.dated || {};
            const wf = () => page.locator('[role="dialog"]:visible').first();
            const wfUrl = (sid, key) => app.url(`/index.php/${J}/dashboard/editorial?workflowSubmissionId=${sid}${key ? `&workflowMenuKey=${key}` : ''}`);
            const openEntry = async (sid, pid, name) => {
                await page.goto(wfUrl(sid, `publication_${pid}_titleAbstract`)); await idle(page); await sleep(800);
                if (name !== 'Title & Abstract') {
                    const l = page.getByRole('link', {name, exact: true}).last();
                    await l.waitFor({state: 'visible', timeout: T}); await l.click(); await idle(page); await sleep(800);
                }
                const t0 = Date.now();
                while (Date.now() - t0 < 20000 && !(await wf().getByRole('button', {name: 'Save', exact: true}).count())) await sleep(250);
                await idle(page);
            };
            const pressSave = async () => {
                const r = page.waitForResponse((x) => /\/publications\/\d+/.test(x.url()) && ['POST', 'PUT'].includes(x.request().method()), {timeout: T}).catch(() => null);
                await wf().getByRole('button', {name: 'Save', exact: true}).last().click();
                const resp = await r; await sleep(800);
                return {status: resp ? resp.status() : null, errors: await page.locator('.pkpFieldError').allInnerTexts().catch(() => [])};
            };
            const publish = async (sid, pid) => {
                await page.goto(wfUrl(sid, `publication_${pid}_titleAbstract`)); await idle(page); await sleep(1500);
                if (isOJS) {
                    const {PublicationScreen} = require(path.join(app.suiteDir, 'pages', 'PublicationMetadataPages.js'));
                    const ps = new PublicationScreen(page, J);
                    const pr = page.waitForResponse((x) => x.url().includes('/publish') && x.request().method() !== 'GET', {timeout: 60000}).catch(() => null);
                    let err = null;
                    await ps.publish({backIssueLabel: /Vol\. 1 No\. 1/}).catch((e) => { err = flat(e.message, 300); });
                    return {status: (await pr)?.status(), err};
                }
                const post = page.getByRole('button', {name: 'Post', exact: true}).first();
                await post.waitFor({timeout: T}); await post.click();
                const conf = page.getByRole('dialog').filter({hasText: /Are you sure you want to post this\?/});
                await conf.waitFor({timeout: T});
                const pr = page.waitForResponse((x) => /\/publish/.test(x.url()), {timeout: T}).catch(() => null);
                await conf.getByRole('button', {name: 'Post', exact: true}).last().click();
                const st = (await pr)?.status(); await sleep(1500); await idle(page);
                return {status: st};
            };
            if (!sc.D) {
                const pdf = isOPS ? 'preprint.pdf' : 'article.pdf';
                const r = await app.api.createSubmission({tag: `${sc.t}D`, context: J, submitter: u.au, title: `Kestrel dated ${sc.t}`,
                    participants: [{username: u.se, role: 'sectionEditor'}],
                    ...(isOJS ? {decisions: ['skipExternalReview', 'sendToProduction'], galleys: [{label: 'PDF', file: pdf}]} : {galleys: [{label: 'PDF', file: pdf}]})});
                sc.D = {id: r.submissionId, pub: r.publicationId, title: `Kestrel dated ${sc.t}`}; save();
            }
            const D = sc.D;
            await as(u.mgr);
            if (!out.v1) {
                const entry = isOPS ? 'Preprint entry' : 'Publication Settings';
                await openEntry(D.id, D.pub, entry);
                const date = page.locator('input[name="datePublished"]').first();
                const pages = page.locator('input[name="pages"]').first();
                out.boxes = {date: await date.count(), pages: await pages.count()};
                if (out.boxes.date) { await date.fill('2026-09-01'); await date.press('Tab').catch(() => {}); }
                if (out.boxes.pages) { await pages.fill('12-34'); await pages.press('Tab').catch(() => {}); }
                if (isOJS) {
                    const back = page.getByRole('radio', {name: 'Assign To Current/Back Issue'}).first();
                    if (await back.isVisible().catch(() => false)) {
                        await back.check();
                        const sel = page.locator('select[name="issueId"]').first();
                        await sel.waitFor({timeout: T}).catch(() => {});
                        const opt = sel.locator('option').filter({hasText: /Vol\. 1 No\. 1/});
                        await opt.first().waitFor({state: 'attached', timeout: T}).catch(() => {});
                        if (await opt.count()) await sel.selectOption(await opt.first().getAttribute('value'));
                    }
                }
                out.v1save = await pressSave();
                await snap('t-01-D-settings-saved', {dated: out});
                out.v1publish = await publish(D.id, D.pub);
                out.v1 = true; sc.dated = out; save();
            }
            if (!out.v2) {
                await page.goto(wfUrl(D.id, `publication_${D.pub}_titleAbstract`)); await idle(page); await sleep(1500);
                const link = page.getByRole('link', {name: 'Create New Version', exact: true}).or(page.getByRole('button', {name: 'Create New Version', exact: true})).first();
                await link.waitFor({state: 'visible', timeout: T}); await link.click();
                const w = page.getByRole('dialog').filter({hasText: 'Which version should metadata be copied from?'}).last();
                await w.getByRole('button', {name: 'Confirm', exact: true}).waitFor({timeout: T}); await idle(page); await sleep(800);
                const stage = w.locator('select[name="versionStage"]');
                if (await stage.count() && !(await stage.inputValue())) await stage.selectOption('VoR');
                const minor = w.locator('select[name="versionIsMinor"]');
                if (await minor.count() && await minor.isVisible().catch(() => false) && !(await minor.inputValue())) await minor.selectOption('false');
                const r = page.waitForResponse((x) => /\/publications\/\d+\/version/.test(x.url()) && x.request().method() === 'POST', {timeout: T}).catch(() => null);
                await w.getByRole('button', {name: 'Confirm', exact: true}).click();
                const resp = await r; let v2 = null; try { v2 = (await resp.json()).id; } catch (e) { /* none */ }
                D.v2 = v2; sc.D = D; save();
                await sleep(1200);
                await page.goto(wfUrl(D.id, `publication_${v2}_titleAbstract`)); await idle(page); await sleep(1500);
                await page.waitForFunction((id) => !!window.tinymce?.get(id)?.initialized, 'titleAbstract-title-control-en', {timeout: T});
                await page.evaluate(([id, val]) => { const e = window.tinymce.get(id); e.setContent(val); e.fire('change'); }, ['titleAbstract-title-control-en', `Kestrel dated second ${sc.t}`]);
                out.v2titleSave = await pressSave();
                const entry = isOPS ? 'Preprint entry' : 'Publication Settings';
                await openEntry(D.id, v2, entry);
                out.v2boxes = {date: await page.locator('input[name="datePublished"]').first().inputValue().catch(() => null),
                    pages: await page.locator('input[name="pages"]').first().inputValue().catch(() => null)};
                await snap('t-02-D-v2-settings', {v2boxes: out.v2boxes});
                out.v2publish = await publish(D.id, v2);
                out.v2 = true; sc.dated = out; save();
            }
            await as(null);
            const reads = {};
            for (const [k, pid] of [['current', null], ['older', D.pub]]) {
                const o = await openItem(D.id, pid, `t-03-D-${k}-visitor`);
                const dateLine = await page.evaluate(() => [...document.querySelectorAll('.item.published, .published, .item.versions')].map((e) => e.innerText.replace(/\s+/g, ' ').trim()).join(' | ')).catch(() => null);
                const r = {primary: o.block.citation, dateLine: flat(dateLine, 300)};
                for (const f of ['Turabian', 'Vancouver', 'MLA']) r[f] = (await choose(f)).citationAfter;
                r.ris = (await download('RIS')).text;
                reads[k] = r;
            }
            out.reads = reads; sc.dated = out; save();
            fact('dated', out);
        });

        // ============================================================ london: "Publisher Location" alone, which formats print it
        if (on('london')) await sect('london', async () => {
            const out = {};
            await as(u.mgr);
            out.save = await saveSettings({location: 'London, U.K.'}, 'l-01-save-london');
            await as(null);
            const a = await openItem(S.A.id, null, 'l-02-item-A-london');
            out.primary = {citation: a.block.citation, london: /London/.test(a.block.citation || '')};
            out.formats = {};
            for (const s of a.block.styles) {
                const c = await choose(s.text);
                out.formats[s.text] = {london: /London/.test(c.citationAfter || ''), citation: c.citationAfter};
            }
            out.downloads = [];
            for (const d of a.block.downloads) { const r = await download(d.text); out.downloads.push({label: d.text, london: /London/.test(r.text || ''), where: ((r.text || '').match(/[^\n,]{0,20}London[^\n,]{0,20}/) || [null])[0], filename: r.filename}); }
            out.printing = Object.entries(out.formats).filter(([, v]) => v.london).map(([k]) => k);
            await snap('l-03-item-A-london-after', {london: out});
            fact('london', out);
        });

        // ============================================================ q12: IEEE primary, MLA alone, BibTeX unticked
        if (on('q12')) await sect('q12', async () => {
            const out = {};
            await as(u.mgr);
            out.save = await saveSettings({primary: 'ieee', styles: ['modern-language-association'], downloads: ['ris'], location: 'London, U.K.'}, 'q-01-save-ieee-mla-ris');
            await as(null);
            for (const k of ['A', 'V']) {
                const a = await openItem(S[k].id, null, `q-02-item-${k}-after-q12`);
                out[k] = {citation: a.block.citation, looksIEEE: /^\[1\]/.test(a.block.citation || '') || /“|"/.test(a.block.citation || ''), styles: a.block.styles.map((s) => s.text), downloads: a.block.downloads.map((d) => d.text), downloadLabels: a.block.downloadLabels};
                if (k === 'A') { out.A.mla = await choose('MLA'); out.A.ris = await download('RIS'); }
            }
            fact('q12', out);
        });

        // ============================================================ nodl: no download format ticked
        if (on('nodl')) await sect('nodl', async () => {
            const out = {};
            await as(u.mgr);
            out.save = await saveSettings({downloads: []}, 'd-01-save-no-downloads');
            await as(null);
            const a = await openItem(S.A.id, null, 'd-02-item-A-no-downloads');
            out.toggle = await toggleList();
            out.block = await blockRead();
            await snap('d-03-item-A-no-downloads-open', {block: out.block});
            fact('nodl', out);
        });

        // ============================================================ noadd: no additional format ticked (downloads back on)
        if (on('noadd')) await sect('noadd', async () => {
            const out = {};
            await as(u.mgr);
            out.save = await saveSettings({styles: [], downloads: ['ris', 'bibtex']}, 'n-01-save-no-additional');
            await as(null);
            const a = await openItem(S.A.id, null, 'n-02-item-A-no-additional');
            out.blockBefore = a.block;
            out.toggle = await toggleList();
            out.blockAfterPress = await blockRead();
            await snap('n-03-item-A-no-additional-pressed', {block: out.blockAfterPress, toggle: out.toggle});
            out.toggle2 = await toggleList();
            fact('noadd', out);
        });

        // ============================================================ disable: off again, then on again (what the window kept)
        if (on('disable')) await sect('disable', async () => {
            const out = {};
            await as(u.mgr);
            await gotoPlugins();
            out.disable = await setCsl(false);
            out.row = await rowRead();
            await snap('x-01-plugins-off-again', {row: out.row, disable: out.disable});
            await as(null);
            out.pageA = await openItem(S.A.id, null, 'x-02-item-A-off-again');
            await as(u.mgr);
            await gotoPlugins();
            out.enable = await setCsl(true);
            await openSettings();
            out.windowKept = await winState();
            await snap('x-03-settings-after-reenable', {win: out.windowKept});
            await closeWindow('cancel');
            await as(null);
            out.pageAOn = await openItem(S.A.id, null, 'x-04-item-A-on-again');
            fact('disable', out);
        });
    } finally {
        record('k3-dialogs', {jsDialogs});
        record('k3-csl-traffic', {cslTraffic});
        await close();
    }
});
