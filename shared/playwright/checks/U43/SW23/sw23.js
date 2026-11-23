// U43 drift sweep 2026-11-23, chunk SW23 (the whole spec): every body claim, the scenarios as walked, and the
// register entries (A1–A12, A15, OPS1). Spec: docs/specs/U43-funding.md. Records; asserts nothing: the reader judges.
//
// Run (scenario fleet, one app per process; PROBE_RUN r1 then r2; every part seeds its own scratch context, tag
// prefix u43sw23, so a later build re-runs it as is; publicknowledge and the roster are never touched; the one
// site-wide write is `POST site` `rors` with NSERC, idempotent, which every suite of U43 makes too):
//   bin/app-lock.sh shared ojs -- env PROBE_FEATURE=U43 PROBE_AGENT=ccSW23 PROBE_NOTES_FEATURE=U43 PROBE_RUN=r1 \
//       node bin/probe.js ojs shared/playwright/checks/U43/SW23/sw23.js
//   PART=access,panel,french,wizard,reader,setting,versions,review narrows (default: all eight; review is OJS/OMP);
//   PART=a3gain (not in the default list) adds A3's recovery: a made-up registry record picked, then put into the copy.
// No other script or file is read. Outputs: .reports/U43/ccSW23/<part>-<nn>-<step>-<run>-<app>.{json,png} (screen
// snapshots), facts-<part>-<run>-<app>.json (one key per step), run-<run>-<app>-*.json (the kit's run record).
//
//   access   one scratch context; the manager records a funder on three items (OJS/OMP: one at Copyediting, one at
//            the Submission stage, one published; OPS: one unposted, one posted), then every permission level signs in
//            and types each item's workflow Funding address: manager, editor (OJS/OMP), the assigned section editor,
//            an unassigned section editor, the assigned assistant (copyeditor; OPS editorial board member), the
//            submitter (also on the editorial address), a reviewer (OJS/OMP), a reader, the site administrator.
//            Read: the menu, the heading, the list's buttons and row menus, the banner. The manager adds, edits and
//            orders on the published item; the OPS author adds, edits and orders on the unposted one (Actors; Rule 8;
//            OPS1).
//   panel    S1 walked by a manager on a scratch context: the empty save, the search below and at four characters,
//            the typed-text suggestion and registry suggestions (A6), the name box and "Delete", grants (bad DOI,
//            blank row), the unheld registry pick (A3), Order / Save Order (A5), a funder added after the order (A7),
//            Edit / Close, a grant row deleted or added and left with Close (A15), a grant cell changed and left
//            with Close, Delete / Cancel / OK, the held registry pick (NSERC), its Delete and search again, a failed
//            registry query (A9), the panel left unsaved, the log, the notifications and the mailbox (Side effects).
//   french   a context with English and French as UI and submission languages: S1's French leg and the Author's
//            French list (Rule 14), the bilingual name boxes and a French-only save (A5, A12).
//   wizard   S2 walked by a throwaway author: the Details step's sections, the funder saved and read at once and
//            after a reload (A4), the Review step, the held registry pick in the wizard (A10), a grant row added and
//            left with Close (A15), the panel left unsaved, the submit, the manager's list; and the Details step with
//            the Funding Statement asked too (Rule 10).
//   reader   S3 walked: two typed funders with a grant, the held registry funder (NSERC) and an unheld one (A3),
//            ordered, read on the landing page signed out; the funder-less control (Rule 9; A10).
//   setting  S4 walked: the Metadata settings' Funders section, off / enabled / ask / require (Rule 2, A8), the
//            wizard and the workflow at each, the landing page with the setting off, the require warning and submit
//            (A1), grant validation on with an unknown NSERC number (A11), the Funding Statement with funders off and
//            on (Rules 2, 3), who reaches the settings screen, the settings left unsaved.
//   versions a published item with a funder and a new version: "Funding" under each version, a grant edited under
//            the old one and read under the new one (Rule 12, A2).
//   review   S6 walked (OJS, OMP): the reviewer's screens and every response their browser received, on an
//            anonymous and an open assignment; then, as the Frame allows for an API no screen calls, the reviewer's
//            own GET of the submission and of the publication (Rule 13).
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, signOut, screen, shot, record, idle, tag, sql, apiAs, rawKeys, note} = require('../../../probe');

const ROOT = path.resolve(__dirname, '../../../../..');
const RUN = process.env.PROBE_RUN || 'r0';
const ALL = ['access', 'panel', 'french', 'wizard', 'reader', 'setting', 'versions', 'review'];
const PARTS = (process.env.PART || ALL.join(',')).split(',');
const T = 30_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (s, n = 800) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));
const NSERC_NAME = 'Natural Sciences and Engineering Research Council of Canada';
const NSERC_ROR = 'https://ror.org/01h531d29';
const NIH = {
    admin: {created: {date: '2018-11-14', schema_version: '1.0'}, last_modified: {date: '2026-03-31', schema_version: '2.1'}},
    domains: [],
    established: 1887,
    external_ids: [],
    id: 'https://ror.org/01cwqze88',
    links: [],
    locations: [{geonames_details: {continent_code: 'NA', continent_name: 'North America', country_code: 'US', country_name: 'United States', lat: 39.0, lng: -77.1, name: 'Bethesda'}, geonames_id: 4348599}],
    names: [{lang: 'en', types: ['label', 'ror_display'], value: 'National Institutes of Health'}, {lang: 'en', types: ['acronym'], value: 'NIH'}],
    relationships: [],
    status: 'active',
    types: ['government', 'funder'],
};

forEachApp(async (app) => {
    const A = app.name;
    const NSERC = JSON.parse(fs.readFileSync(path.join(ROOT, 'apps', A, 'playwright', 'fixtures', 'ror-nserc-v2.json'), 'utf8'));
    const log = (...a) => console.log(`[sw23 ${RUN} ${A}]`, ...a);
    const facts = {};
    let part = '';
    const fact = (k, v) => {
        facts[part] = facts[part] || {};
        facts[part][k] = v;
        log(`${part}.${k}: ${flat(JSON.stringify(v), 1500)}`);
        record(`facts-${part}`, facts[part]);
    };
    const cu = (ctx, p = '', loc = 'en') => `/index.php/${ctx}/${loc}${p}`;
    const published = A === 'omp' ? {decisions: ['skipExternalReview', 'sendToProduction'], published: true} : A === 'ojs' ? {decisions: ['skipExternalReview', 'sendToProduction'], published: true} : {published: true};
    const LANDING = {ojs: 'article/view', omp: 'catalog/book', ops: 'preprint/view'}[A];
    const GROUP = A === 'ops' ? 'Preprint' : 'Publication';

    // ------------------------------------------------------------------ seeding
    const mkContext = async (suffix, {users = ['mg', 'au'], context = {}, extra = {}} = {}) => {
        const t = tag(`u43sw23${suffix}`);
        const defs = {
            mg: ['manager', 'Mona', 'Manager'],
            ed: ['editor', 'Eddie', 'Editor'],
            se: ['sectionEditor', 'Sid', 'Subeditor'],
            se2: ['sectionEditor', 'Sue', 'Unassigned'],
            as: [A === 'ops' ? 'editorialBoardMember' : 'copyeditor', 'Asa', 'Assistant'],
            au: ['author', 'Ada', 'Author'],
            rv: ['externalReviewer', 'Rex', 'Reviewer'],
            rd: ['reader', 'Rae', 'Reader'],
        };
        const list = users.map((u) => ({username: `${t}${u}`, roles: [defs[u][0]], givenName: defs[u][1], familyName: defs[u][2], email: `${t}${u}@mail.test`}));
        const ctx = await app.api.createContext({tag: t, users: list, context: {name: `U43 SW23 ${suffix} ${t}`, contactName: 'Paula Principal', contactEmail: `principal${t}@mail.test`, ...context}, ...extra});
        const out = {t, path: ctx.path || t};
        for (const u of users) out[u] = `${t}${u}`;
        return out;
    };
    const mkSub = async (C, key, extra = {}) => {
        const s = await app.api.createSubmission({tag: `${C.t}${key}`, context: C.path, submitter: C.au, title: `SW23 ${key} ${C.t}`, ...extra});
        return {id: s.submissionId, pub: s.publicationId, title: `SW23 ${key} ${C.t}`};
    };
    const contextId = (C) => sql(app, `select ${app.contextTables.id} from ${app.contextTables.table} where path = '${C.path}'`).trim();
    const stored = (sub) =>
        sql(app, `select f.funder_id, coalesce(f.ror, ''), f.seq, coalesce((select string_agg(s.locale || ':' || s.setting_name || '=' || left(coalesce(s.setting_value, ''), 200), ' ; ' order by s.setting_name, s.locale) from funder_settings s where s.funder_id = f.funder_id), '') from funders f where f.submission_id = ${sub.id} order by f.seq, f.funder_id`)
            .split('\n')
            .filter(Boolean);

    // ------------------------------------------------------------------ browser and traffic
    const {page, close} = await launch(app);
    const dialogs = [];
    page.on('dialog', async (d) => {
        dialogs.push({at: Date.now(), type: d.type(), message: flat(d.message(), 300)});
        await (d.type() === 'beforeunload' ? d.accept() : d.dismiss()).catch(() => {});
    });
    const writes = [];
    const ror = {mode: 'records', records: [], hits: []};
    await page.route('https://api.ror.org/**', (route) => {
        const url = new URL(route.request().url());
        const q = (url.searchParams.get('query') || url.searchParams.get('affiliation') || '').toLowerCase();
        ror.hits.push({at: Date.now(), q, mode: ror.mode});
        if (ror.mode === 'abort') return route.abort('failed');
        if (typeof ror.mode === 'number') return route.fulfill({status: ror.mode, contentType: 'application/json', headers: {'Access-Control-Allow-Origin': '*'}, body: '{}'});
        const items = q ? ror.records.filter((r) => r.names.some((n) => n.value.toLowerCase().includes(q))) : [];
        // A reply the browser must refuse: the matching records, but no CORS header (the 2026-08-28 outage's shape).
        if (ror.mode === 'nocors') return route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify({number_of_results: items.length, items})});
        return route.fulfill({status: 200, contentType: 'application/json', headers: {'Access-Control-Allow-Origin': '*'}, body: JSON.stringify({number_of_results: items.length, items})});
    });
    page.on('response', async (r) => {
        const u = r.url();
        const m = r.request().method();
        if (!/\/api\/v1\//.test(u) || /_test\//.test(u) || m === 'GET') return;
        const e = {at: Date.now(), op: r.request().headers()['x-http-method-override'] || m, url: u.split('?')[0].replace(/^.*\/api\/v1\//, ''), status: r.status()};
        if (r.status() >= 400) e.answer = flat(await r.text().catch(() => ''), 600);
        if (/\/funders/.test(u)) e.sent = flat(r.request().postData() || '', 600);
        writes.push(e);
    });
    const since = (list, t0) => list.filter((x) => x.at >= t0).map(({at, ...x}) => x);

    let stepNo = 0;
    const snap = async (name, p = page) => {
        const n = `${part}-${String(++stepNo).padStart(2, '0')}-${name}`;
        let s;
        try {
            s = await screen(p);
        } catch (e) {
            s = {url: p.url(), error: flat(e.message, 300)};
        }
        record(n, s);
        await shot(p, n).catch(() => {});
        return s;
    };
    const step = async (key, fn) => {
        const t0 = Date.now();
        try {
            await fn();
        } catch (e) {
            fact(`${key} ERROR`, flat(e.stack || e.message, 900));
            await snap(`${key}-error`);
            const d = panelDialog();
            if (await d.count().catch(() => 0)) await d.getByRole('button', {name: /^(Close|Fermer)$/}).first().click({timeout: 3000}).catch(() => {});
        }
        const w = since(writes, t0);
        const dl = since(dialogs, t0);
        if (w.length || dl.length) fact(`${key} traffic`, {writes: w, browserDialogs: dl});
    };
    const sign = async (user, ctx) => {
        await signIn(page, user, ctx ? {contextPath: ctx} : {});
    };

    // ------------------------------------------------------------------ readers of the screen
    const fmTable = () => page.locator('table[aria-labelledby], table[aria-label]').filter({has: page.locator('thead')}).filter({hasText: /Funder|##|Bailleur|Financ|No funders|Aucun/});
    /** The funders list as data: heading, description, top buttons, columns, rows (text, marks, buttons). */
    const readFM = async () =>
        page.evaluate(() => {
            const vis = (n) => !!(n && (n.offsetWidth || n.offsetHeight || n.getClientRects().length));
            const nm = (b) => (b.getAttribute('aria-label') || b.innerText || '').replace(/\s+/g, ' ').trim();
            const tables = [...document.querySelectorAll('table')].filter((t) => {
                const lab = t.getAttribute('aria-labelledby');
                const name = (lab && document.getElementById(lab) ? document.getElementById(lab).innerText : t.getAttribute('aria-label') || '').trim();
                return vis(t) && /fund|financ|bailleur|##submission\.funders/i.test(name);
            });
            if (!tables.length) return {table: null};
            return tables.map((t) => {
                const wrap = t.parentElement;
                const lab = t.getAttribute('aria-labelledby');
                const top = [...wrap.querySelectorAll('button')].filter((b) => !t.contains(b) && vis(b));
                return {
                    name: (lab && document.getElementById(lab) ? document.getElementById(lab).innerText : t.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim(),
                    heading: [...wrap.querySelectorAll('h3')].map((h) => h.innerText.trim()),
                    description: [...wrap.querySelectorAll('p')].filter((p) => !t.contains(p)).map((p) => p.innerText.replace(/\s+/g, ' ').trim()),
                    top: top.map((b) => ({name: nm(b), disabled: b.disabled || b.getAttribute('aria-disabled') === 'true' || undefined})),
                    columns: [...t.querySelectorAll('thead th')].map((th) => ({text: th.innerText.replace(/\s+/g, ' ').trim(), srOnly: !!th.querySelector('.sr-only'), textContent: th.textContent.replace(/\s+/g, ' ').trim()})),
                    rows: [...t.querySelectorAll('tbody tr')].filter(vis).map((r) => ({
                        text: r.innerText.replace(/\s+/g, ' ').trim(),
                        marks: r.querySelectorAll('svg, img').length,
                        nameCellMarks: r.querySelector('td') ? r.querySelector('td').querySelectorAll('svg, img').length : null,
                        buttons: [...r.querySelectorAll('button')].map((b) => ({name: nm(b), visible: vis(b), inner: b.innerText.trim(), aria: b.getAttribute('aria-label')})),
                    })),
                };
            })[0];
        }).catch((e) => ({error: flat(e.message, 200)}));
    const panelDialog = () => page.getByRole('dialog').filter({has: page.locator('.pkpFormField--funder')}).last();
    /** The open Add/Edit Funder panel as data. */
    const readPanel = async (d = panelDialog()) =>
        d.evaluate((el) => {
            const vis = (n) => !!(n && (n.offsetWidth || n.offsetHeight || n.getClientRects().length));
            const nm = (b) => (b.getAttribute('aria-label') || b.innerText || '').replace(/\s+/g, ' ').trim();
            const lab = el.getAttribute('aria-labelledby');
            const f = el.querySelector('.pkpFormField--funder');
            const g = el.querySelector('.pkpFormField--funder-grants');
            const labelOf = (i) => {
                const ls = i.labels ? [...i.labels].map((l) => l.innerText.replace(/\s+/g, ' ').trim()) : [];
                const lb = i.getAttribute('aria-labelledby');
                return {labels: ls, labelledby: lb ? lb.split(' ').map((id) => (document.getElementById(id) ? document.getElementById(id).innerText.replace(/\s+/g, ' ').trim() : `#${id}?`)) : undefined, aria: i.getAttribute('aria-label') || undefined};
            };
            return {
                title: lab && document.getElementById(lab) ? document.getElementById(lab).innerText.trim() : [...el.querySelectorAll('h1, h2')].map((h) => h.innerText.trim()).slice(0, 2),
                buttons: [...el.querySelectorAll('button')].filter(vis).map((b) => ({name: nm(b), disabled: b.disabled || undefined})),
                funder: f
                    ? {
                          text: f.innerText.replace(/\s+/g, ' ').trim().slice(0, 900),
                          description: [...f.querySelectorAll('.pkpFormField__description')].map((x) => x.innerText.replace(/\s+/g, ' ').trim()),
                          search: [...f.querySelectorAll('input.pkpAutosuggest__input')].map((i) => ({value: i.value, ...labelOf(i), placeholder: i.placeholder || undefined})),
                          nameBoxes: [...f.querySelectorAll('input[name="name"]')].map((i) => ({value: i.value, ...labelOf(i), required: i.required || i.getAttribute('aria-required') || undefined, readonly: i.readOnly || undefined, disabled: i.disabled || undefined})),
                          otherInputs: [...f.querySelectorAll('input:not([name="name"]):not(.pkpAutosuggest__input)')].filter(vis).map((i) => ({name: i.name, value: i.value})),
                          links: [...f.querySelectorAll('a')].map((a) => ({href: a.getAttribute('href'), target: a.target, text: a.innerText.trim(), aria: a.getAttribute('aria-label'), marks: a.querySelectorAll('svg, img').length})),
                          errors: [...f.querySelectorAll('.pkpFieldError')].filter(vis).map((x) => x.innerText.replace(/\s+/g, ' ').trim()),
                          suggestions: [...f.querySelectorAll('li.autosuggest__results-item')].filter(vis).map((li) => ({
                              text: li.innerText.replace(/\s+/g, ' ').trim(),
                              cls: li.className,
                              selected: li.getAttribute('aria-selected'),
                              sub: [...li.querySelectorAll('sub')].map((s) => s.innerText.trim()),
                              marks: li.querySelectorAll('svg, img').length,
                              links: [...li.querySelectorAll('a')].map((a) => ({href: a.getAttribute('href'), target: a.target, aria: a.getAttribute('aria-label'), sr: [...a.querySelectorAll('.sr-only, .-screenReader')].map((s) => s.textContent.trim()), title: a.title || undefined})),
                          })),
                      }
                    : null,
                grants: g
                    ? {
                          text: g.innerText.replace(/\s+/g, ' ').trim().slice(0, 600),
                          headers: [...g.querySelectorAll('thead th')].map((th) => th.innerText.replace(/\s+/g, ' ').trim()),
                          rows: [...g.querySelectorAll('tbody tr')].filter(vis).map((r) => ({
                              cells: [...r.querySelectorAll('input')].map((i) => ({name: i.name, value: i.value, ...labelOf(i)})),
                              buttons: [...r.querySelectorAll('button, a')].filter(vis).map(nm),
                              errors: [...r.querySelectorAll('.pkpFieldError')].filter(vis).map((x) => x.innerText.replace(/\s+/g, ' ').trim()),
                              text: r.innerText.replace(/\s+/g, ' ').trim().slice(0, 200),
                          })),
                          errors: [...g.querySelectorAll('.pkpFieldError')].filter(vis).map((x) => x.innerText.replace(/\s+/g, ' ').trim()),
                      }
                    : null,
                foot: [...el.querySelectorAll('*')].filter((x) => vis(x) && x.children.length === 0 && /correct|error|erreur|corriger/i.test(x.innerText || '')).map((x) => x.innerText.replace(/\s+/g, ' ').trim()).slice(0, 4),
                requiredMarks: [...el.querySelectorAll('.pkpFormFieldLabel__required, [class*="required"]')].filter(vis).map((x) => x.innerText.replace(/\s+/g, ' ').trim()).slice(0, 4),
            };
        }).catch((e) => ({error: flat(e.message, 200)}));
    const openFunding = async (ctx, sub, {author = false, loc = 'en', editorial = false} = {}) => {
        await page.goto(cu(ctx, `/dashboard/${author && !editorial ? 'mySubmissions' : 'editorial'}?workflowSubmissionId=${sub.id}&workflowMenuKey=publication_${sub.pub}_funding`, loc));
        await idle(page);
        await fmTable().first().waitFor({timeout: 15_000}).catch(() => {});
        await idle(page);
    };
    const menuEntries = async () =>
        page.evaluate((group) => {
            const vis = (n) => !!(n && (n.offsetWidth || n.offsetHeight || n.getClientRects().length));
            const links = [...document.querySelectorAll('[role="dialog"] nav a, [role="dialog"] nav button, [role="dialog"] [role="treeitem"], [role="dialog"] a, [role="dialog"] button')].filter(vis).map((a) => a.innerText.replace(/\s+/g, ' ').trim()).filter(Boolean);
            const i = links.indexOf(group);
            return i < 0 ? {group: null, all: [...new Set(links)].slice(0, 40)} : {group, after: links.slice(i + 1, i + 14)};
        }, GROUP).catch((e) => ({error: flat(e.message, 200)}));
    const heading = async () =>
        page.evaluate(() => {
            const vis = (n) => !!(n && (n.offsetWidth || n.offsetHeight || n.getClientRects().length));
            return [...document.querySelectorAll('[role="dialog"] h1, [role="dialog"] h2, main h1')].filter(vis).map((h) => h.innerText.replace(/\s+/g, ' ').trim()).slice(0, 4);
        }).catch(() => []);
    const banners = async () => {
        const t = (await page.locator('[role="dialog"]').allInnerTexts().catch(() => [])).join('\n');
        return (t.match(/[^\n]*(has been published|a été publiée|Editing it may)[^\n]*/g) || []).map((x) => flat(x, 200));
    };
    const addButton = () => page.getByRole('button', {name: 'Add Funder', exact: true});
    const openAdd = async (btn = addButton()) => {
        await btn.click();
        await panelDialog().locator('.pkpFormField--funder').waitFor({timeout: T});
        await idle(page);
        await sleep(300);
        return panelDialog();
    };
    const searchBox = (d) => d.locator('.pkpFormField--funder input.pkpAutosuggest__input');
    const typeSearch = async (d, text) => {
        const s = searchBox(d);
        await s.click();
        await s.fill('');
        await s.pressSequentially(text, {delay: 25});
        await sleep(900);
        await idle(page);
    };
    const suggestions = (d) => d.locator('.pkpFormField--funder li.autosuggest__results-item');
    const pickTyped = async (d, text) => {
        await typeSearch(d, text);
        await suggestions(d).filter({hasText: text}).first().click();
        await sleep(500);
        await idle(page);
    };
    const pickRegistry = async (d, text, ror) => {
        await typeSearch(d, text);
        const sug = suggestions(d).filter({has: page.locator(`a[href="${ror}"]`)}).first();
        await sug.waitFor({timeout: 15_000});
        const t0 = Date.now();
        const posted = page.waitForResponse((r) => /\/api\/v1\/rors\/?(\?|$)/.test(r.url()) && r.request().method() === 'POST', {timeout: 15_000}).then((r) => r.status()).catch(() => null);
        await sug.click();
        const status = await posted;
        await sleep(1200);
        await idle(page);
        const errorDialog = await page.getByRole('dialog').filter({hasText: 'An unexpected error has occurred'}).allInnerTexts().catch(() => []);
        return {rorsStatus: status, errorDialog: errorDialog.map((x) => flat(x, 300)), browserDialogs: since(dialogs, t0)};
    };
    const errorWindow = () => page.getByRole('dialog').filter({hasText: /An unexpected error has occurred|ROR API Error/}).filter({hasNot: page.locator('.pkpFormField--funder')});
    const dismissError = async () => {
        const e = errorWindow();
        for (let i = 0; i < 3 && (await e.count()); i++) {
            await e.last().getByRole('button', {name: 'OK', exact: true}).first().click().catch(() => {});
            await sleep(700);
        }
    };
    const grantRows = (d) => d.locator('.pkpFormField--funder-grants tbody tr');
    const addGrant = async (d, {name, number, doi} = {}, addLabel = 'Add') => {
        await d.locator('.pkpFormField--funder-grants').getByRole('button', {name: addLabel, exact: true}).click();
        await sleep(300);
        if (doi !== undefined) await d.locator('input[name="grantDoi"]').last().fill(doi);
        if (number !== undefined) await d.locator('input[name="grantNumber"]').last().fill(number);
        if (name !== undefined) await d.locator('input[name="grantName"]').last().fill(name);
        await sleep(200);
    };
    const pressPanel = async (d, name) => {
        await d.getByRole('button', {name, exact: true}).last().click();
        await sleep(900);
        await idle(page);
    };
    /** Save the panel; returns whether it closed and the funders write. */
    const savePanel = async (d, label = 'Save') => {
        const t0 = Date.now();
        await d.getByRole('button', {name: label, exact: true}).last().click();
        await sleep(1500);
        await idle(page);
        const open = (await panelDialog().count()) > 0;
        return {panel: open ? 'open' : 'closed', writes: since(writes, t0).filter((w) => /funders/.test(w.url))};
    };
    const closePanel = async (label = 'Close') => {
        const d = panelDialog();
        if (await d.count()) await d.getByRole('button', {name: label, exact: true}).first().click().catch(() => {});
        await sleep(900);
    };
    const rowByName = (name) => fmTable().first().locator('tbody tr').filter({hasText: name});
    const openRowMenu = async (name) => {
        await rowByName(name).first().getByRole('button').first().click();
        await sleep(500);
        return page.getByRole('menuitem').allInnerTexts();
    };
    const rowAction = async (name, item) => {
        await openRowMenu(name);
        await page.getByRole('menuitem', {name: item, exact: true}).click();
        await sleep(800);
        await idle(page);
    };
    const openEdit = async (name, item = 'Edit') => {
        await rowAction(name, item);
        await panelDialog().locator('.pkpFormField--funder').waitFor({timeout: T});
        await sleep(500);
        return panelDialog();
    };
    const confirmDialog = () => page.getByRole('dialog').filter({hasText: /Are you sure|Êtes-vous/}).last();
    const readConfirm = async () =>
        confirmDialog().evaluate((d) => ({
            text: d.innerText.replace(/\s+/g, ' ').trim(),
            title: [...d.querySelectorAll('h1, h2, h3, [id*="title"]')].map((h) => h.innerText.trim()),
            buttons: [...d.querySelectorAll('button')].map((b) => (b.getAttribute('aria-label') || b.innerText).replace(/\s+/g, ' ').trim()),
        })).catch((e) => ({error: flat(e.message, 200)}));
    const orderButton = (label = 'Order') => page.getByRole('button', {name: label, exact: true});
    /** Move a row up n times in ordering mode (the arrows are reached positionally: first button is up). */
    const moveUp = async (name, n = 1) => {
        for (let i = 0; i < n; i++) {
            await rowByName(name).first().locator('button').first().click();
            await sleep(300);
        }
    };
    const saveOrder = async (label = 'Save Order') => {
        const t0 = Date.now();
        await orderButton(label).click();
        await sleep(1500);
        await idle(page);
        return since(writes, t0).filter((w) => /funders/.test(w.url));
    };
    const reload = async () => {
        await page.reload();
        await idle(page);
        await fmTable().first().waitFor({timeout: 15_000}).catch(() => {});
        await idle(page);
    };
    const activityLog = async () => {
        await page.getByRole('button', {name: 'Activity Log', exact: true}).click();
        const d = page.getByRole('dialog').filter({hasText: 'Activity Log & Notes'});
        await d.locator('tr.gridRow').first().waitFor({timeout: T}).catch(() => {});
        await idle(page);
        const rows = await d.locator('tr.gridRow').allInnerTexts();
        await d.getByRole('button', {name: 'Close', exact: true}).first().click().catch(() => {});
        await sleep(700);
        return rows.map((r) => flat(r, 200));
    };
    /** Record one funder through the panel's typed-name path (with grants), on the open list. */
    const addTypedFunder = async (name, grants = []) => {
        const d = await openAdd();
        await pickTyped(d, name);
        for (const g of grants) await addGrant(d, g);
        return savePanel(d);
    };
    const readLanding = async () =>
        page.evaluate(() => {
            const b = document.querySelector('#funding-data');
            if (!b) return {block: null, headings: [...document.querySelectorAll('h1, h2')].map((h) => h.innerText.trim()).slice(0, 6)};
            return {
                block: b.tagName.toLowerCase(),
                heading: [...b.querySelectorAll('h2, h3')].map((h) => h.innerText.trim()),
                text: b.innerText.replace(/\s+/g, ' ').trim().slice(0, 1500),
                funders: [...b.querySelectorAll('span.funder')].map((s) => ({text: s.innerText.replace(/\s+/g, ' ').trim(), html: s.innerHTML.replace(/\s+/g, ' ').slice(0, 300)})),
                items: [...b.querySelectorAll('li')].map((li) => li.innerText.replace(/\s+/g, ' ').trim()).slice(0, 12),
                links: [...b.querySelectorAll('a')].map((a) => ({href: a.getAttribute('href'), target: a.target || null, text: a.innerText.trim(), aria: a.getAttribute('aria-label'), imgs: [...a.querySelectorAll('img, svg')].map((i) => i.getAttribute('alt') || i.getAttribute('aria-label') || i.tagName)})),
            };
        });
    // The wizard, through each app's own page objects (required inside fn, the kit's rule).
    const wiz = (() => {
        if (A === 'ojs') {
            const {SubmissionWizardPage} = require(path.join(ROOT, 'apps/ojs/playwright/pages/SubmissionWizardPage.js'));
            let w;
            return {
                open: async (ctx, id) => {
                    w = new SubmissionWizardPage(page, ctx);
                    await page.goto(cu(ctx, `/submission?id=${id}`));
                    await idle(page);
                },
                upload: async () => w.uploadFile(),
                to: async (label) => w.continueTo(label),
                steps: ['Details', 'Contributors', 'For the Editors'],
                review: async (id) => w.continueToReview(id),
                current: async () => flat(await w.currentStepLabel().textContent().catch(() => ''), 80),
                submit: async () => w.submitAndConfirm(),
            };
        }
        const W = require(path.join(ROOT, `apps/${A}/playwright/pages/SubmissionWizardPages.js`));
        return {
            open: async (ctx, id) => {
                await page.goto(cu(ctx, `/submission?id=${id}`));
                await idle(page);
            },
            upload: async () => (A === 'omp' ? W.uploadWizardFile(page, `ms-${RUN}.txt`) : W.addGalleyFile(page)),
            to: async (label) => W.continueTo(page, label),
            steps: A === 'omp' ? ['Details', 'Contributors', 'For the Editors'] : ['Details', 'Contributors', 'For Readers'],
            review: async () => {
                if (A === 'ops') await W.setRelationStatus(page).catch(() => {});
                await W.openReview(page);
            },
            current: async () => flat(await W.currentRailStep(page).textContent().catch(() => ''), 80),
            submit: async () => (A === 'omp' ? W.confirmSubmit(page) : W.confirmSubmit(page, {message: /./})),
        };
    })();
    const wizardSections = async () =>
        page.evaluate(() => {
            const vis = (n) => !!(n && (n.offsetWidth || n.offsetHeight || n.getClientRects().length));
            return [...document.querySelectorAll('.panelSection, .submissionWizard__step section, h2')].filter(vis).filter((x) => x.tagName === 'H2').map((h) => h.innerText.replace(/\s+/g, ' ').trim());
        }).catch(() => []);
    const reviewDetails = async () =>
        flat(await page.locator('.submissionWizard__reviewPanel').filter({has: page.getByRole('heading', {name: 'Details', exact: true})}).innerText().catch(() => ''), 1200);
    const toDetails = async (ctx, id) => {
        await wiz.open(ctx, id);
        for (let i = 0; i < 2 && !/Details/.test(await wiz.current()); i++) {
            await wiz.to('Details').catch(() => {});
        }
        await idle(page);
        await sleep(500);
    };
    const toReview = async (ctx, id) => {
        await toDetails(ctx, id);
        for (const s of wiz.steps.slice(1)) await wiz.to(s);
        await wiz.review(id);
        await idle(page);
        await sleep(500);
    };
    const openMetadataSettings = async (ctx) => {
        await page.goto(cu(ctx, '/management/settings/workflow'));
        await idle(page);
        await page.locator('#metadata-button').click().catch(() => {});
        await page.getByRole('checkbox', {name: 'Enable funder metadata'}).waitFor({timeout: 15_000}).catch(() => {});
        await idle(page);
    };
    const metadataForm = () => page.locator('form').filter({has: page.getByRole('checkbox', {name: 'Enable funder metadata'})});
    const readFundersSetting = async () =>
        page.evaluate(() => {
            const vis = (n) => !!(n && (n.offsetWidth || n.offsetHeight || n.getClientRects().length));
            const box = [...document.querySelectorAll('input[type="checkbox"]')].find((i) => i.labels && i.labels[0] && /Enable funder metadata/.test(i.labels[0].innerText));
            if (!box) return {box: null};
            let f = box.closest('.pkpFormField') || box.parentElement;
            const group = f.closest('.pkpFormGroup') || f.parentElement;
            const all = (root) => [...root.querySelectorAll('input')].filter(vis).map((i) => ({type: i.type, name: i.name, value: i.value, checked: i.checked, label: i.labels && i.labels[0] ? i.labels[0].innerText.replace(/\s+/g, ' ').trim() : null}));
            const gv = [...document.querySelectorAll('input[type="checkbox"]')].find((i) => i.labels && i.labels[0] && /Grant ID validation/.test(i.labels[0].innerText));
            const gvf = gv ? gv.closest('.pkpFormGroup') || gv.closest('fieldset') || gv.parentElement : null;
            const fs = [...document.querySelectorAll('input[type="checkbox"]')].find((i) => i.labels && i.labels[0] && /funding statement/i.test(i.labels[0].innerText));
            return {
                groupText: group.innerText.replace(/\s+/g, ' ').trim().slice(0, 900),
                inputs: all(group),
                grantValidation: gv ? {visible: vis(gv), checked: gv.checked, groupText: gvf ? gvf.innerText.replace(/\s+/g, ' ').trim().slice(0, 400) : null} : null,
                fundingStatementBox: fs ? {checked: fs.checked, label: fs.labels[0].innerText.trim()} : null,
            };
        }).catch((e) => ({error: flat(e.message, 200)}));
    const saveMetadata = async () => {
        const t0 = Date.now();
        await metadataForm().getByRole('button', {name: 'Save', exact: true}).click();
        await sleep(1500);
        await idle(page);
        return {writes: since(writes, t0), status: flat(await metadataForm().locator('[role="status"]').allInnerTexts().catch(() => []), 200)};
    };
    const mailCount = async (address, t0) => {
        try {
            return await app.mail.count({to: address, since: t0});
        } catch (e) {
            return `mail read failed: ${flat(e.message, 120)}`;
        }
    };

    // ------------------------------------------------------------------ parts
    const parts = {};

    // ---------------------------------------------------------------- access
    parts.access = async () => {
        const levels = ['mg', 'se', 'se2', 'as', 'au', 'rd', ...(A !== 'ops' ? ['ed', 'rv'] : [])];
        const C = await mkContext('x', {users: levels});
        const parts0 = [{username: C.se, role: 'sectionEditor'}, {username: C.as, role: A === 'ops' ? 'editorialBoardMember' : 'copyeditor'}];
        const subOpts = async (key, extra) => {
            try {
                return await mkSub(C, key, {participants: parts0, ...extra});
            } catch (e) {
                fact(`seed-${key}-participants-refused`, flat(e.message, 300));
                return mkSub(C, key, {participants: [parts0[0]], ...extra});
            }
        };
        const subs = {};
        if (A !== 'ops') {
            subs.c = await subOpts('c', {decisions: ['skipExternalReview']});
            subs.s = await subOpts('s', {});
        } else {
            subs.s = await subOpts('s', {});
        }
        subs.p = await subOpts('p', published);
        fact('seed', {C, subs});
        ror.records = [];
        // The manager records one funder on each item.
        await sign(C.mg, C.path);
        for (const [k, sub] of Object.entries(subs)) {
            await step(`mg-record-${k}`, async () => {
                await openFunding(C.path, sub);
                fact(`mg-record-${k}`, await addTypedFunder(`Access Foundation ${k}`));
            });
        }
        for (const u of [...levels, 'admin']) {
            const user = u === 'admin' ? 'admin' : C[u];
            await sign(user, C.path);
            for (const [k, sub] of Object.entries(subs)) {
                await step(`${u}-${k}`, async () => {
                    await openFunding(C.path, sub, {author: u === 'au'});
                    const s = await snap(`${u}-${k}`);
                    fact(`${u}-${k}`, {url: s.url, heading: await heading(), menu: await menuEntries(), list: await readFM(), banner: await banners(), text: flat(s.text && (s.text.dialog || s.text.main), 300)});
                });
                if (u === 'au' && k === 's') {
                    await step('au-s-editorial-address', async () => {
                        await openFunding(C.path, sub, {author: true, editorial: true});
                        const s = await snap('au-s-editorial');
                        fact('au-s-editorial-address', {url: s.url, heading: await heading(), list: await readFM(), text: flat(s.text && (s.text.dialog || s.text.main), 300)});
                    });
                }
            }
        }
        // The manager on the published item: add, edit a grant, order, reload (Actors: publishing does not lock).
        await sign(C.mg, C.path);
        await step('mg-published-edits', async () => {
            await openFunding(C.path, subs.p);
            const out = {banner: await banners()};
            out.add = await addTypedFunder('Published Second', [{name: 'Pub Grant', number: '77'}]);
            const d = await openEdit('Access Foundation p');
            await addGrant(d, {number: '88'});
            out.edit = await savePanel(d);
            await orderButton().click();
            await sleep(400);
            await moveUp('Published Second', 2);
            out.order = await saveOrder();
            await reload();
            out.afterReload = await readFM();
            out.stored = stored(subs.p);
            await snap('mg-published-after');
            fact('mg-published-edits', out);
        });
        // OPS1 both ends: the submitter's own list on the unposted preprint (add, edit, order) and on the posted one.
        if (A === 'ops') {
            await sign(C.au, C.path);
            await step('au-ops-edit', async () => {
                await openFunding(C.path, subs.s, {author: true});
                const out = {before: await readFM()};
                out.add = await addTypedFunder('Author Added');
                const d = await openEdit('Access Foundation s');
                out.editPanel = await readPanel(d);
                await snap('au-ops-edit-panel');
                await addGrant(d, {number: '42'});
                out.edit = await savePanel(d);
                await orderButton().click();
                await sleep(400);
                await moveUp('Author Added', 1);
                out.order = await saveOrder();
                await reload();
                out.after = await readFM();
                out.stored = stored(subs.s);
                await snap('au-ops-after');
                fact('au-ops-edit', out);
            });
        }
    };

    // ---------------------------------------------------------------- panel (S1 and the Fields table)
    parts.panel = async () => {
        const C = await mkContext('p', {users: ['mg', 'au']});
        const S = await mkSub(C, 's');
        fact('seed', {C, S});
        await app.api.setSite({rors: [NSERC]});
        ror.records = [NSERC, NIH];
        ror.mode = 'records';
        const t0 = new Date();
        const cid = contextId(C);
        const notes0 = sql(app, `select count(*) from notifications where context_id = ${cid}`).trim();
        const ev0 = sql(app, `select count(*) from event_log where assoc_type = 1048585 and assoc_id = ${S.id}`).trim();
        await sign(C.mg, C.path);
        let log0;
        await step('list', async () => {
            await openFunding(C.path, S);
            log0 = await activityLog();
            await snap('list-empty');
            fact('list', {heading: await heading(), menu: await menuEntries(), list: await readFM(), log: log0, notes0, ev0});
        });
        await step('empty-save', async () => {
            const d = await openAdd();
            await snap('add-open');
            fact('add-open', await readPanel(d));
            await pressPanel(d, 'Save');
            await snap('add-empty-save');
            fact('add-empty-save', await readPanel(d));
            // Does Save come back once the field is touched? (typed text, then the typed text picked)
            await typeSearch(d, 'Te');
            fact('after-two-chars', {panel: await readPanel(d), rorHits: ror.hits.length});
            const h0 = ror.hits.length;
            await typeSearch(d, 'Tes');
            fact('after-three-chars', {suggestions: (await readPanel(d)).funder.suggestions, rorHitsSince: ror.hits.length - h0});
            await typeSearch(d, 'Test');
            await snap('after-four-chars');
            fact('after-four-chars', {suggestions: (await readPanel(d)).funder.suggestions, rorHitsSince: ror.hits.slice(h0)});
            await typeSearch(d, 'National');
            await snap('suggestions-registry');
            fact('suggestions-registry', (await readPanel(d)).funder.suggestions);
            await pickTyped(d, 'Test Foundation');
            await snap('typed-picked');
            fact('typed-picked', await readPanel(d));
            await d.locator('.pkpFormField--funder').getByRole('button', {name: 'Delete', exact: true}).click();
            await sleep(600);
            fact('typed-deleted', await readPanel(d));
            await pickTyped(d, 'Test Foundation');
            await addGrant(d, {name: 'Field Study', number: '1234', doi: 'not-a-doi'});
            await pressPanel(d, 'Save');
            await snap('bad-doi');
            fact('bad-doi', await readPanel(d));
            await d.locator('input[name="grantDoi"]').last().fill('10.1234/example');
            await sleep(500);
            fact('doi-fixed-save-state', (await readPanel(d)).buttons);
            await addGrant(d, {});
            fact('two-rows', (await readPanel(d)).grants);
            const saved = await savePanel(d);
            const listNow = await readFM();
            await snap('typed-saved');
            await reload();
            fact('typed-saved', {saved, listNow, afterReload: await readFM(), stored: stored(S)});
        });
        await step('unheld-registry', async () => {
            const d = await openAdd();
            const pick = await pickRegistry(d, 'National Institutes of Health', NIH.id);
            await snap('unheld-picked');
            fact('unheld-picked', {pick, panel: await readPanel(d)});
            await dismissError();
            fact('unheld-after-ok', await readPanel(d));
            const saved = await savePanel(d);
            const listNow = await readFM();
            await snap('unheld-saved');
            fact('unheld-saved', {saved, listNow, stored: stored(S)});
        });
        await step('order', async () => {
            await orderButton().click();
            await sleep(600);
            await snap('ordering-mode');
            fact('ordering-mode', await readFM());
            await moveUp('Test Foundation', 0);
            // The registry funder (nameless) is the second row: move it up by its position.
            await fmTable().first().locator('tbody tr').nth(1).locator('button').first().click();
            await sleep(300);
            fact('order-saved', await saveOrder());
            fact('order-after-save', await readFM());
            await reload();
            await snap('order-after-reload');
            fact('order-after-reload', {list: await readFM(), stored: stored(S)});
        });
        await step('a7', async () => {
            fact('a7-add', await addTypedFunder('Later Foundation'));
            const now = await readFM();
            await reload();
            fact('a7', {now, afterReload: await readFM(), stored: stored(S)});
        });
        await step('edit', async () => {
            let d = await openEdit('Test Foundation');
            await snap('edit-open');
            fact('edit-open', await readPanel(d));
            await d.locator('input[name="grantNumber"]').first().fill('5678');
            const saved = await savePanel(d);
            fact('edit-saved', {saved, list: await readFM()});
            d = await openEdit('Test Foundation');
            fact('edit-reopened-same-page', (await readPanel(d)).grants);
            await closePanel();
            await reload();
            d = await openEdit('Test Foundation');
            fact('edit-reopened-after-reload', {grants: (await readPanel(d)).grants, buttons: (await readPanel(d)).buttons});
            await closePanel();
        });
        await step('a15', async () => {
            // A grant cell changed and left with Close.
            let d = await openEdit('Test Foundation');
            await d.locator('input[name="grantNumber"]').first().fill('9999');
            await closePanel();
            d = await openEdit('Test Foundation');
            fact('cell-changed-closed-reopen', (await readPanel(d)).grants);
            await closePanel();
            // A grant row deleted and left with Close.
            d = await openEdit('Test Foundation');
            await grantRows(d).first().getByRole('button', {name: 'Delete'}).first().click();
            await sleep(400);
            fact('row-deleted-before-close', (await readPanel(d)).grants);
            await closePanel();
            d = await openEdit('Test Foundation');
            await snap('a15-reopen-after-delete-close');
            fact('row-deleted-closed-reopen', (await readPanel(d)).grants);
            await closePanel();
            // A row added and left with Close.
            d = await openEdit('Test Foundation');
            await addGrant(d, {});
            await closePanel();
            d = await openEdit('Test Foundation');
            fact('row-added-closed-reopen', (await readPanel(d)).grants);
            const saved = await savePanel(d);
            await reload();
            fact('a15-after-save-reload', {saved, stored: stored(S)});
            d = await openEdit('Test Foundation');
            fact('a15-after-reload-panel', (await readPanel(d)).grants);
            // Put the grant back.
            if ((await d.locator('input[name="grantNumber"]').count()) === 0) await addGrant(d, {name: 'Field Study', number: '5678', doi: '10.1234/example'});
            fact('a15-restore', await savePanel(d));
        });
        await step('delete', async () => {
            const items = await openRowMenu('Later Foundation');
            await page.getByRole('menuitem', {name: 'Delete', exact: true}).click();
            await sleep(700);
            await snap('delete-confirm');
            fact('delete-confirm', {menu: items, confirm: await readConfirm()});
            await confirmDialog().getByRole('button', {name: 'Cancel', exact: true}).click();
            await sleep(700);
            fact('delete-cancelled', {list: await readFM(), stored: stored(S)});
            await rowAction('Later Foundation', 'Delete');
            await confirmDialog().getByRole('button', {name: 'OK', exact: true}).click();
            await sleep(1500);
            await idle(page);
            const now = await readFM();
            await reload();
            fact('delete-ok', {now, afterReload: await readFM(), stored: stored(S)});
        });
        await step('held-registry', async () => {
            const d = await openAdd();
            await typeSearch(d, 'Natural Sciences');
            fact('held-suggestions', (await readPanel(d)).funder.suggestions);
            const pick = await pickRegistry(d, NSERC_NAME, NSERC_ROR);
            await snap('held-picked');
            fact('held-picked', {pick, panel: await readPanel(d)});
            const saved = await savePanel(d);
            const now = await readFM();
            await reload();
            await snap('held-saved');
            fact('held-saved', {saved, now, afterReload: await readFM(), stored: stored(S)});
        });
        await step('held-change', async () => {
            // Rule 5: a registry funder's identity is changed by its "Delete" and a new search.
            const d = await openEdit(NSERC_NAME);
            fact('held-edit-open', await readPanel(d));
            await d.locator('.pkpFormField--funder').getByRole('button', {name: 'Delete', exact: true}).click();
            await sleep(500);
            fact('held-edit-deleted', await readPanel(d));
            await closePanel();
            const d2 = await openEdit(NSERC_NAME).catch(() => null);
            fact('held-edit-after-close', d2 ? await readPanel(d2) : 'row not found');
            await closePanel();
        });
        await step('a9', async () => {
            // The registry query failing in the browser: a network failure, a 503, a 429, a reply without CORS headers.
            for (const mode of ['abort', 503, 429, 'nocors']) {
                ror.mode = mode;
                const t1 = Date.now();
                const d = await openAdd();
                await typeSearch(d, 'Natural Sciences');
                await sleep(1500);
                const s = await snap(`a9-${mode}`);
                const out = {panelWithWindowOpen: await readPanel(d), notices: s.notices, browserDialogs: since(dialogs, t1), errorWindow: (await errorWindow().allInnerTexts().catch(() => [])).map((x) => flat(x, 300))};
                await dismissError();
                out.panelAfterOk = await readPanel(d);
                // The registry answering again: does the same panel search again?
                ror.mode = 'records';
                if (await d.locator('.pkpFormField--funder').getByRole('button', {name: 'Delete', exact: true}).count()) {
                    await d.locator('.pkpFormField--funder').getByRole('button', {name: 'Delete', exact: true}).click();
                    await sleep(500);
                }
                const h0 = ror.hits.length;
                await typeSearch(d, 'Natural Sciences and');
                await sleep(1200);
                out.searchAgainSamePanel = {suggestions: (await readPanel(d)).funder.suggestions, queries: ror.hits.length - h0};
                await dismissError();
                await closePanel();
                const d2 = await openAdd();
                const h1 = ror.hits.length;
                await typeSearch(d2, 'Natural Sciences and');
                await sleep(1200);
                out.searchAgainNewPanel = {suggestions: (await readPanel(d2)).funder.suggestions, queries: ror.hits.length - h1};
                fact(`a9-${mode}`, out);
                await closePanel();
            }
            ror.mode = 'records';
        });
        await step('leave-unsaved', async () => {
            const t1 = Date.now();
            let d = await openAdd();
            await pickTyped(d, 'Unsaved Foundation');
            await closePanel();
            await sleep(2200);
            fact('close-unsaved', {panelOpen: await panelDialog().count(), browserDialogs: since(dialogs, t1), list: await readFM()});
            d = await openAdd();
            fact('reopen-after-unsaved-close', await readPanel(d));
            await pickTyped(d, 'Unsaved Foundation');
            const t2 = Date.now();
            await openFunding(C.path, S);
            fact('navigate-unsaved', {browserDialogs: since(dialogs, t2), list: await readFM(), stored: stored(S)});
        });
        await step('silence', async () => {
            await openFunding(C.path, S);
            const log1 = await activityLog();
            const notes1 = sql(app, `select count(*) from notifications where context_id = ${cid}`).trim();
            const ev1 = sql(app, `select count(*) from event_log where assoc_type = 1048585 and assoc_id = ${S.id}`).trim();
            await snap('silence');
            // Positive control for the mailbox: the submitter's own password-reset mail, asked for on the screen.
            await signOut(page);
            await page.goto(cu(C.path, '/login/lostPassword'));
            await idle(page);
            await page.locator('input[name="email"]').fill(`${C.au}@mail.test`);
            await page.getByRole('button', {name: /Reset Password/i}).click();
            await idle(page);
            let control = null;
            try {
                control = await app.mail.find({to: `${C.au}@mail.test`, contains: C.path, timeoutMs: 30_000}).then((m) => flat(m.Subject || m.subject, 120));
            } catch (e) {
                control = `control not found: ${flat(e.message, 120)}`;
            }
            fact('silence', {logBefore: log0, logAfter: log1, notes0, notes1, ev0, ev1, mailToSubmitter: await mailCount(`${C.au}@mail.test`, t0), mailToManager: await mailCount(`${C.mg}@mail.test`, t0), control});
        });
    };

    // ---------------------------------------------------------------- french (Rule 14, A5 name boxes, A12)
    parts.french = async () => {
        const C = await mkContext('f', {users: ['mg', 'au'], context: {supportedLocales: ['en', 'fr_CA'], supportedFormLocales: ['en', 'fr_CA'], supportedSubmissionLocales: ['en', 'fr_CA']}});
        const S = await mkSub(C, 's');
        fact('seed', {C, S});
        ror.records = [];
        ror.mode = 'records';
        await sign(C.mg, C.path);
        await step('bilingual-boxes', async () => {
            await openFunding(C.path, S);
            fact('add-test', await addTypedFunder('Test Foundation'));
            const d = await openAdd();
            await pickTyped(d, 'Bilingual Fund');
            await snap('bilingual-boxes');
            fact('bilingual-boxes', await readPanel(d));
            // A12: the primary box emptied, only the French one filled.
            await d.locator('input[name="name"]').first().fill('');
            await d.locator('input[name="name"]').nth(1).fill('Fonds bilingue FR');
            await sleep(300);
            fact('a12-before-save', await readPanel(d));
            const saved = await savePanel(d);
            if (saved.panel === 'open') fact('a12-refused', await readPanel(d));
            await closePanel();
            await reload();
            fact('a12', {saved, list: await readFM(), stored: stored(S)});
            // The second label clicked: where does the cursor go? (A5)
            const d2 = await openAdd();
            await pickTyped(d2, 'Label Check');
            const lbls = d2.locator('.pkpFormField--funder label');
            const n = await lbls.count();
            const focus = [];
            for (let i = 0; i < n; i++) {
                await lbls.nth(i).click().catch(() => {});
                await sleep(200);
                focus.push(await page.evaluate(() => {
                    const a = document.activeElement;
                    const boxes = [...document.querySelectorAll('.pkpFormField--funder input[name="name"]')];
                    return {label: null, boxIndex: boxes.indexOf(a), tag: a && a.tagName};
                }));
            }
            fact('a5-label-clicks', {labels: await lbls.allInnerTexts(), focus});
            await closePanel();
        });
        await step('fr-list', async () => {
            await openFunding(C.path, S, {loc: 'fr_CA'});
            await snap('fr-list');
            fact('fr-list', {heading: await heading(), list: await readFM(), raw: await rawKeys(page).catch((e) => flat(e.message, 200))});
            const t = await readFM();
            const orderLabel = (t.top || []).map((b) => b.name).find((n) => /Trier|Order|##/.test(n));
            await orderButton(orderLabel).click();
            await sleep(500);
            fact('fr-ordering', await readFM());
            const saveLabel = ((await readFM()).top || []).map((b) => b.name).find((n) => n !== orderLabel && !/Ajouter|Add/.test(n));
            fact('fr-order-saved', await saveOrder(saveLabel));
            const items = await openRowMenu('Test Foundation');
            fact('fr-menu', items);
            await page.getByRole('menuitem').nth(1).click();
            await sleep(700);
            await snap('fr-confirm');
            fact('fr-confirm', await readConfirm());
            const cancel = confirmDialog().getByRole('button').filter({hasNotText: /^OK$/}).last();
            fact('fr-cancel-label', await cancel.innerText().catch(() => null));
            await cancel.click();
            await sleep(700);
            fact('fr-after-cancel', await readFM());
            const addFr = page.getByRole('button', {name: orderLabel, exact: true}).locator('xpath=..').getByRole('button').filter({hasNotText: orderLabel});
            const d = await openAdd(addFr.first());
            await pickTyped(d, 'Fondation Exemple');
            await snap('fr-panel');
            const p = await readPanel(d);
            fact('fr-panel', p);
            const saveFr = p.buttons.map((b) => b.name).find((n) => /Enregistrer|Save/.test(n));
            const saved = await savePanel(d, saveFr);
            const now = await readFM();
            await reload();
            fact('fr-saved', {saveFr, saved, now, afterReload: await readFM()});
        });
        await step('fr-author', async () => {
            await sign(C.au, C.path);
            await openFunding(C.path, S, {author: true, loc: 'fr_CA'});
            await snap('fr-author');
            fact('fr-author', await readFM());
        });
    };

    // ---------------------------------------------------------------- wizard (S2, A4, A10, A15, Rule 10)
    parts.wizard = async () => {
        await app.api.setSite({rors: [NSERC]});
        ror.records = [NSERC];
        ror.mode = 'records';
        const C = await mkContext('w', {users: ['mg', 'au']});
        const D = await mkSub(C, 'd', {submitted: false});
        fact('seed', {C, D});
        await sign(C.au, C.path);
        await step('details', async () => {
            await wiz.open(C.path, D.id);
            await wiz.upload();
            await wiz.to('Details');
            await idle(page);
            await snap('details');
            fact('details', {sections: await wizardSections(), list: await readFM()});
            fact('add', await addTypedFunder('Test Foundation'));
            const now = await readFM();
            await snap('details-after-save');
            fact('details-after-save', now);
        });
        await step('review', async () => {
            for (const s of wiz.steps.slice(1)) await wiz.to(s);
            await wiz.review(D.id);
            await snap('review');
            fact('review-before-reload', await reviewDetails());
            await page.reload();
            await idle(page);
            await sleep(800);
            fact('review-after-reload', {step: await wiz.current(), details: await reviewDetails()});
            await toDetails(C.path, D.id);
            fact('details-after-reload', await readFM());
        });
        await step('wizard-held', async () => {
            const d = await openAdd();
            const pick = await pickRegistry(d, NSERC_NAME, NSERC_ROR);
            fact('wizard-held-picked', {pick, panel: await readPanel(d)});
            const saved = await savePanel(d);
            const now = await readFM();
            await toDetails(C.path, D.id);
            fact('wizard-held', {saved, now, afterReload: await readFM(), stored: stored(D)});
        });
        await step('wizard-a15', async () => {
            let d = await openEdit('Test Foundation');
            await addGrant(d, {});
            await closePanel();
            d = await openEdit('Test Foundation');
            fact('wizard-a15-reopen', (await readPanel(d)).grants);
            await closePanel();
        });
        await step('wizard-leave-unsaved', async () => {
            const t1 = Date.now();
            const d = await openAdd();
            await pickTyped(d, 'Unsaved Wizard Fund');
            await closePanel();
            await sleep(2200);
            const d2 = await openAdd();
            await pickTyped(d2, 'Unsaved Wizard Fund');
            await page.goto(cu(C.path, '/submissions'));
            await idle(page);
            fact('wizard-leave-unsaved', {browserDialogs: since(dialogs, t1), stored: stored(D)});
        });
        await step('submit', async () => {
            await toReview(C.path, D.id);
            await snap('review-final');
            fact('review-final', await reviewDetails());
            await wiz.submit();
            await snap('complete');
        });
        await step('manager-list', async () => {
            await sign(C.mg, C.path);
            await openFunding(C.path, D);
            await snap('manager-list');
            fact('manager-list', await readFM());
        });
        // Rule 10: the Funding Statement asked too.
        await step('statement', async () => {
            const C2 = await mkContext('ws', {users: ['au'], context: {}, extra: {metadata: {fundingStatement: 'request'}}});
            const D2 = await mkSub(C2, 'd', {submitted: false});
            await sign(C2.au, C2.path);
            await wiz.open(C2.path, D2.id);
            await wiz.upload();
            await wiz.to('Details');
            await idle(page);
            const s = await snap('statement-details');
            const t = (s.text && s.text.main) || '';
            const i = t.lastIndexOf('Funding');
            fact('statement', {sections: await wizardSections(), tail: flat(t.slice(Math.max(0, i - 50), i + 700), 900)});
        });
    };

    // ---------------------------------------------------------------- reader (S3, Rule 9, A3 and A10 on the landing page)
    parts.reader = async () => {
        await app.api.setSite({rors: [NSERC]});
        ror.records = [NSERC, NIH];
        ror.mode = 'records';
        const C = await mkContext('r', {users: ['mg', 'au']});
        const P = await mkSub(C, 'p', published);
        const Q = await mkSub(C, 'q', published);
        fact('seed', {C, P, Q});
        await sign(C.mg, C.path);
        await step('record', async () => {
            await openFunding(C.path, P);
            fact('banner', await banners());
            fact('add-test', await addTypedFunder('Test Foundation', [{name: 'Field Study', number: '1234', doi: '10.1234/example'}]));
            fact('add-second', await addTypedFunder('Second Foundation'));
            let d = await openAdd();
            fact('nserc', await pickRegistry(d, NSERC_NAME, NSERC_ROR));
            fact('nserc-saved', await savePanel(d));
            d = await openAdd();
            fact('nih', await pickRegistry(d, 'National Institutes of Health', NIH.id));
            await dismissError();
            fact('nih-saved', await savePanel(d));
            await orderButton().click();
            await sleep(500);
            await moveUp('Second Foundation', 3);
            fact('order', await saveOrder());
            await reload();
            await snap('workflow-list');
            fact('workflow-list', {list: await readFM(), stored: stored(P)});
        });
        await signOut(page);
        await step('landing', async () => {
            await page.goto(cu(C.path, `/${LANDING}/${P.id}`));
            await idle(page);
            await snap('landing');
            fact('landing', await readLanding());
        });
        await step('landing-none', async () => {
            await page.goto(cu(C.path, `/${LANDING}/${Q.id}`));
            await idle(page);
            await snap('landing-none');
            fact('landing-none', await readLanding());
        });
    };

    // ---------------------------------------------------------------- setting (S4, Rule 2, A1, A8, A11, Rules 2–3 with the statement)
    parts.setting = async () => {
        await app.api.setSite({rors: [NSERC]});
        ror.records = [NSERC];
        ror.mode = 'records';
        const C = await mkContext('g', {users: ['mg', 'au', 'se', 'rd']});
        const P = await mkSub(C, 'p', published);
        const D = await mkSub(C, 'd', {submitted: false});
        fact('seed', {C, P, D});
        const wizRead = async (key) => {
            await sign(C.au, C.path);
            await toDetails(C.path, D.id);
            await snap(`wizard-${key}`);
            fact(`wizard-${key}`, {step: await wiz.current(), sections: await wizardSections(), list: await readFM()});
        };
        const wfRead = async (key) => {
            await sign(C.mg, C.path);
            await openFunding(C.path, P);
            await snap(`workflow-${key}`);
            fact(`workflow-${key}`, {heading: await heading(), menu: await menuEntries(), list: await readFM()});
        };
        await sign(C.mg, C.path);
        await step('settings-default', async () => {
            await openMetadataSettings(C.path);
            await snap('settings-default');
            fact('settings-default', await readFundersSetting());
            await openFunding(C.path, P);
            fact('record', await addTypedFunder('Test Foundation'));
        });
        await step('wizard-ask-control', async () => {
            await sign(C.au, C.path);
            await wiz.open(C.path, D.id);
            await wiz.upload();
            await wiz.to('Details');
            await idle(page);
            await snap('wizard-ask-control');
            fact('wizard-ask-control', {sections: await wizardSections(), list: await readFM()});
        });
        await step('off', async () => {
            await sign(C.mg, C.path);
            await openMetadataSettings(C.path);
            await page.getByRole('checkbox', {name: 'Enable funder metadata'}).uncheck();
            await sleep(400);
            fact('off-before-save', await readFundersSetting());
            fact('off-save', await saveMetadata());
            await openMetadataSettings(C.path);
            fact('off-after-reload', await readFundersSetting());
            await wfRead('off');
            await wizRead('off');
            await signOut(page);
            await page.goto(cu(C.path, `/${LANDING}/${P.id}`));
            await idle(page);
            await snap('landing-off');
            fact('landing-off', await readLanding());
        });
        await step('retick', async () => {
            await sign(C.mg, C.path);
            await openMetadataSettings(C.path);
            await page.getByRole('checkbox', {name: 'Enable funder metadata'}).check();
            await sleep(500);
            await snap('retick');
            fact('retick', await readFundersSetting());
            fact('retick-save', await saveMetadata());
            await openMetadataSettings(C.path);
            fact('enabled-after-reload', await readFundersSetting());
            await wfRead('enabled');
            await wizRead('enabled');
        });
        await step('ask', async () => {
            await sign(C.mg, C.path);
            await openMetadataSettings(C.path);
            await page.getByRole('radio', {name: 'Ask the author for funder metadata during submission.'}).check();
            fact('ask-save', await saveMetadata());
            await wfRead('ask');
            await wizRead('ask');
        });
        await step('require', async () => {
            await sign(C.mg, C.path);
            await openMetadataSettings(C.path);
            await page.getByRole('radio', {name: 'Require the author to add funder metadata before accepting their submission.'}).check();
            fact('require-save', await saveMetadata());
            await sign(C.au, C.path);
            await toReview(C.path, D.id);
            const s = await snap('require-review');
            const submit = page.getByRole('button', {name: 'Submit', exact: true}).last();
            fact('require-review', {details: await reviewDetails(), warning: flat(await page.locator('.submissionWizard__fundersEmptyWarning').allInnerTexts().catch(() => []), 300), problems: flat(await page.locator('.submissionWizard__review_errors').allInnerTexts().catch(() => []), 400), submitEnabled: await submit.isEnabled().catch(() => null), notices: s.notices});
            if (await submit.isEnabled().catch(() => false)) await wiz.submit();
            const s2 = await snap('require-submitted');
            fact('require-submitted', {text: flat(s2.text && s2.text.main, 300), status: sql(app, `select status, coalesce(submission_progress, '') , coalesce(to_char(date_submitted, 'YYYY-MM-DD'), '') from submissions where submission_id = ${D.id}`)});
        });
        await step('grant-validation', async () => {
            await sign(C.mg, C.path);
            await openMetadataSettings(C.path);
            await page.getByRole('checkbox', {name: 'Enable Grant ID validation.'}).check();
            fact('gv-save', await saveMetadata());
            await openMetadataSettings(C.path);
            fact('gv-after-reload', await readFundersSetting());
            await openFunding(C.path, P);
            const d = await openAdd();
            fact('gv-pick', await pickRegistry(d, NSERC_NAME, NSERC_ROR));
            await addGrant(d, {number: 'XXNONSENSE99ZZ'});
            const saved = await savePanel(d);
            await snap('gv-saved');
            if (saved.panel === 'open') fact('gv-refused', await readPanel(d));
            fact('gv-saved', {saved, list: await readFM(), stored: stored(P)});
            await closePanel();
        });
        await step('settings-leave-unsaved', async () => {
            const t1 = Date.now();
            await openMetadataSettings(C.path);
            await page.getByRole('checkbox', {name: 'Enable funder metadata'}).uncheck();
            await sleep(300);
            await page.locator('#emails-button, #review-button, #submission-button').first().click().catch(() => {});
            await sleep(800);
            const tabDialogs = since(dialogs, t1);
            await page.goto(cu(C.path, '/submissions'));
            await idle(page);
            await openMetadataSettings(C.path);
            fact('settings-leave-unsaved', {tabDialogs, browserDialogs: since(dialogs, t1), after: await readFundersSetting()});
        });
        await step('who-configures', async () => {
            const out = {};
            for (const u of ['admin', 'se', 'au', 'rd']) {
                await sign(u === 'admin' ? 'admin' : C[u], C.path);
                await page.goto(cu(C.path, '/management/settings/workflow'));
                await idle(page);
                await page.locator('#metadata-button').click({timeout: 5000}).catch(() => {});
                await idle(page);
                const s = await snap(`settings-${u}`);
                out[u] = {url: s.url, title: s.title, hasBox: await page.getByRole('checkbox', {name: 'Enable funder metadata'}).count(), text: flat(s.text && s.text.main, 200)};
            }
            fact('who-configures', out);
        });
        // The Funding Statement: funders off with the statement on, and both on (Rules 2, 3).
        await step('statement', async () => {
            for (const [key, metadata] of [['off-stmt', {funders: 'off', fundingStatement: 'request'}], ['both', {fundingStatement: 'request'}]]) {
                const C2 = await mkContext(`g${key[0]}`, {users: ['mg', 'au'], extra: {metadata}});
                const S2 = await mkSub(C2, 's');
                await sign(C2.mg, C2.path);
                await openFunding(C2.path, S2);
                await sleep(800);
                const s = await snap(`statement-${key}`);
                fact(`statement-${key}`, {heading: await heading(), menu: await menuEntries(), list: await readFM(), text: flat(s.text && s.text.dialog, 900)});
            }
        });
    };

    // ---------------------------------------------------------------- versions (Rule 12, A2)
    parts.versions = async () => {
        ror.records = [];
        const C = await mkContext('v', {users: ['mg', 'au']});
        const P = await mkSub(C, 'p', published);
        fact('seed', {C, P});
        await sign(C.mg, C.path);
        await step('version', async () => {
            await openFunding(C.path, P);
            fact('add', await addTypedFunder('Version Foundation', [{name: 'Old Grant', number: '1'}]));
            await page.goto(cu(C.path, `/dashboard/editorial?workflowSubmissionId=${P.id}&workflowMenuKey=publication_${P.pub}_titleAbstract`));
            await idle(page);
            await page.getByRole('button', {name: 'Create New Version'}).or(page.getByRole('link', {name: 'Create New Version'})).first().click();
            const vd = page.getByRole('dialog').filter({hasText: 'Which version should metadata be copied from?'});
            await vd.getByRole('button', {name: 'Confirm', exact: true}).waitFor({timeout: T});
            await sleep(600);
            const created = page.waitForResponse((r) => /\/version/.test(r.url()) && r.request().method() === 'POST', {timeout: T});
            await vd.getByRole('button', {name: 'Confirm', exact: true}).click();
            const res = await created;
            const newPub = (await res.json().catch(() => ({}))).id;
            fact('version-created', {status: res.status(), newPub});
            const V = {id: P.id, pub: newPub};
            await openFunding(C.path, V);
            await snap('new-version-funding');
            fact('new-version', {menu: await menuEntries(), heading: await heading(), list: await readFM()});
            await openFunding(C.path, P);
            await snap('old-version-funding');
            fact('old-version', {heading: await heading(), banner: await banners(), list: await readFM()});
            const d = await openEdit('Version Foundation');
            await d.locator('input[name="grantNumber"]').first().fill('2');
            fact('old-edit', await savePanel(d));
            await openFunding(C.path, V);
            const d2 = await openEdit('Version Foundation');
            fact('new-version-grants', (await readPanel(d2)).grants);
            await closePanel();
            fact('stored', stored(P));
        });
    };

    // ---------------------------------------------------------------- review (S6, Rule 13)
    parts.review = async () => {
        if (A === 'ops') return fact('skipped', 'a preprint server installs no review stage');
        ror.records = [];
        for (const [key, review] of [['anonymous', undefined], ['open', {defaultReviewMode: 'open'}]]) {
            const C = await mkContext(`v${key[0]}`, {users: ['mg', 'au', 'rv'], extra: review ? {review} : {}});
            const S = await mkSub(C, 'r', {decisions: ['sendExternalReview'], reviewRounds: [{reviewers: [{username: C.rv, status: 'accepted'}]}]});
            const NAME = `Test Foundation ${C.t}`;
            await step(`${key}-manager`, async () => {
                await sign(C.mg, C.path);
                await openFunding(C.path, S);
                fact(`${key}-add`, await addTypedFunder(NAME));
                const got = page.waitForResponse((r) => new RegExp(`/api/v1/submissions/${S.id}(\\?|$)`).test(r.url()) && r.request().method() === 'GET', {timeout: T});
                await openFunding(C.path, S);
                const body = await (await got).text().catch(() => '');
                fact(`${key}-manager-control`, {list: await readFM(), submissionGetCarriesName: body.includes(NAME)});
            });
            await step(`${key}-reviewer`, async () => {
                await sign(C.rv, C.path);
                const bodies = [];
                const listener = async (r) => {
                    const ct = r.headers()['content-type'] || '';
                    if (!/json|html|javascript/.test(ct)) return;
                    const b = await r.text().catch(() => '');
                    bodies.push({url: flat(r.url(), 160), status: r.status(), carriesName: b.includes(NAME), carriesFunders: /"funders"/.test(b)});
                };
                page.on('response', listener);
                await page.goto(cu(C.path, `/reviewer/submission/${S.id}`));
                await idle(page);
                const s = await snap(`${key}-review-page`);
                const pageText = JSON.stringify(s.text || {});
                const fetched = page.waitForResponse((r) => r.url().includes(`/api/v1/submissions/${S.id}/publications/`) && r.request().method() === 'GET', {timeout: T});
                await page.getByRole('link', {name: 'View All Submission Details'}).or(page.getByRole('button', {name: 'View All Submission Details'})).first().click();
                const r = await fetched;
                const j = await r.json().catch(() => ({}));
                await idle(page);
                const s2 = await snap(`${key}-details-window`);
                page.off('response', listener);
                fact(`${key}-reviewer`, {pageNamesFunder: pageText.includes(NAME), windowNamesFunder: JSON.stringify(s2.text || {}).includes(NAME), fundersTable: await fmTable().count(), publication: {status: r.status(), hasFundersKey: 'funders' in j, carriesName: JSON.stringify(j).includes(NAME), authors: (j.authors || []).map((a) => a.fullName)}, responses: bodies.filter((b) => b.carriesName || b.carriesFunders), responseCount: bodies.length});
                // The Frame's exception: the API no reviewer screen calls, as the reviewer.
                const api = {};
                for (const p of [`submissions/${S.id}`, `submissions/${S.id}/publications/${S.pub}`]) {
                    const res = await apiAs(page, 'GET', p).catch((e) => ({status: () => `error ${flat(e.message, 100)}`, text: async () => ''}));
                    const txt = await res.text();
                    let parsed = {};
                    try {
                        parsed = JSON.parse(txt);
                    } catch (e) {}
                    api[p.replace(/\d+/g, '{id}')] = {status: res.status(), carriesName: txt.includes(NAME), hasFundersKey: 'funders' in parsed, funders: Array.isArray(parsed.funders) ? parsed.funders.length : null, authors: Array.isArray(parsed.authors) ? parsed.authors.length : undefined, keys: Object.keys(parsed).slice(0, 60), error: parsed.error};
                }
                fact(`${key}-reviewer-api`, api);
            });
        }
    };

    // ---------------------------------------------------------------- a3gain (A3: a nameless registry funder once the copy gains it)
    // Not in the default list: PART=a3gain. A made-up registry record (its own id per run, so the install's copy
    // never holds it before), picked in the wizard and in the workflow, then put into the copy with `POST site` `rors`.
    parts.a3gain = async () => {
        const n = String(Math.floor(Math.random() * 90) + 10);
        const id = `https://ror.org/05sw23x${n}`;
        const FAKE = {...NIH, id, names: [{lang: 'en', types: ['label', 'ror_display'], value: `Probe Gain Fund ${n}`}], locations: NIH.locations};
        ror.records = [FAKE];
        ror.mode = 'records';
        const C = await mkContext('a', {users: ['mg', 'au']});
        const D = await mkSub(C, 'd', {submitted: false});
        const P = await mkSub(C, 'p', published);
        fact('seed', {C, D, P, id});
        await sign(C.au, C.path);
        await step('wizard-pick', async () => {
            await wiz.open(C.path, D.id);
            await wiz.upload();
            await wiz.to('Details');
            await idle(page);
            const d = await openAdd();
            const pick = await pickRegistry(d, FAKE.names[0].value, id);
            await dismissError();
            const saved = await savePanel(d);
            await toDetails(C.path, D.id);
            await snap('wizard-nameless');
            const list = await readFM();
            const e = await openEdit('').catch(() => null);
            fact('wizard-pick', {pick, saved, list, editPanel: e ? await readPanel(e) : 'no row'});
            await closePanel();
        });
        await sign(C.mg, C.path);
        await step('workflow-pick', async () => {
            await openFunding(C.path, P);
            const d = await openAdd();
            const pick = await pickRegistry(d, FAKE.names[0].value, id);
            await snap('workflow-error-over-panel');
            const t1 = Date.now();
            // The first press after the error window opens: does it reach the panel? (A3: "can swallow the next click")
            await d.getByRole('button', {name: 'Save', exact: true}).last().click({timeout: 5000}).catch((e) => fact('first-press', flat(e.message, 200)));
            await sleep(1200);
            fact('first-press-result', {panelOpen: await panelDialog().count(), errorWindowOpen: await errorWindow().count(), writes: since(writes, t1)});
            await dismissError();
            if (await panelDialog().count()) fact('saved', await savePanel(d));
            await reload();
            const list = await readFM();
            const e = await openEdit('').catch(() => null);
            fact('workflow-pick', {pick, list, editPanel: e ? await readPanel(e) : 'no row', stored: stored(P)});
            await closePanel();
        });
        await step('gain', async () => {
            const res = await app.api.setSite({rors: [FAKE]});
            fact('seeded-copy', flat(JSON.stringify(res), 300));
            await openFunding(C.path, P);
            await snap('workflow-after-gain');
            fact('workflow-after-gain', await readFM());
            await signOut(page);
            await page.goto(cu(C.path, `/${LANDING}/${P.id}`));
            await idle(page);
            await snap('landing-after-gain');
            fact('landing-after-gain', await readLanding());
        });
    };

    // ------------------------------------------------------------------ run
    try {
        for (const p of PARTS) {
            if (!parts[p]) continue;
            part = p;
            stepNo = 0;
            log(`part ${p}`);
            try {
                await parts[p]();
            } catch (e) {
                fact('PART ERROR', flat(e.stack || e.message, 900));
                await snap('part-error');
            }
        }
    } finally {
        record('facts-all', facts);
        await close();
    }
});
