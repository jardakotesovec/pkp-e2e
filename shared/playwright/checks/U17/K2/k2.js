// U17 claim check, chunk K2: the table's rules — list, create, edit, order, inactive, delete.
// Spec: docs/specs/U17-sections.md lines 109–191 (Rules 1–7), 286–299 (Side effects), 300–312 (Settings preamble,
// Settings 1), 383–384 (Settings 16), register OMP5, OPS3; footnotes c, h, i, k, n, o, p, td7–td10, td14, f-omp5, f-ops3.
//
//   PROBE_FEATURE=U17 PROBE_AGENT=ccK2 node bin/probe.js <ojs|omp|ops|all> shared/playwright/checks/U17/K2/k2.js
//   PHASES=seed,list,create,edit,landing,order,ompseq,inactive,last,delete,move,ompmove,ompreach,sweep,assign,paths,twinorder
//   (default: all, in the code's order; state in k2-state-<app>.json under the output folder, so a phase can be re-run
//   alone; RESEED=1 starts a fresh set of scratch contexts). `landing2` (where a new row lands once an order has been
//   saved) is the landing block run again in its own process after `order`: PHASES=landing2.
//   Every phase that changes something records its "before" first and, where it can, puts the state back
//   (order swapped back, sections reactivated), so a re-run drives both ends again. Deletions, moves and renames are
//   one-way and marked in the state; RESEED=1 for a second full pass. The run used for the chunk report:
//   seed · list,create · edit · landing · order · landing2 · inactive · last · delete · move{OJS} · assign · paths ·
//   ompseq{OMP} · ompmove{OMP} · order,ompseq,inactive,sweep (second sighting) · ompreach{OMP} · twinorder{OPS} ·
//   edit (second sighting of the window's leave question) · move2{OJS}.
//
// Scratch contexts (tag prefix u17k2), per app:
//   OJS/OPS  N  a new journal/server with no sections[] (its own default section); user mg. Rule 1 defaults, Rule 6 on
//               the only section (box, window, delete).
//            L  "Open" OPN + "Shut" SHT; user mg. Rule 6 with an inactive section present; an inactive empty one deleted.
//            O  "First" FST + "Second" SND (policies), an issue Vol 1 No 1 (2024) published {OJS}; one published item in
//               each; users mg, au. Rule 4: every list before and after "Order"+"Done", then "Cancel ordering".
//            C  "Alpha" ALP (policy; au's draft), "Beta" BET (submitted), "Gamma" GAM (policy; published), "Delta" DEL
//               (empty; s2 assigned), "Epsilon" EPS (empty); users mg, au, se (Section editor / Moderator), s2, rd.
//               Rules 2, 3, 5, 7, side effects; "Created" / "Created Two" made on screen.
//            T  {OPS} "Preprints" preprints; on screen "Twin" (path preprints) and "Odd" (path a b/c) (OPS3).
//   OMP      N  a new press; mg. No series; "Solo" and "Duo" added, both deactivated, both deleted (no minimum).
//            Q  a new press; mg. "Kilo", "Bravo", "Yankee", "Echo" added on screen; the row order read across reloads (ompseq).
//            P  users mg, au, se; series "First", "Second", then "Third" added on screen (td7); order, edit, inactive
//               (OMP5), delete with and without books; a duplicate and an odd path refused (OPS3's press end).
// publicknowledge and the seeded users are not touched. No assertions: the script records, the reader judges.
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, signOut, screen, shot, record, loc, note, idle, tag, outDir} = require('../../../probe');

const REPO = path.resolve(__dirname, '../../../../..');
const T = 30_000;
const ALL = ['seed', 'list', 'create', 'edit', 'landing', 'order', 'landing2', 'ompseq', 'inactive', 'last', 'delete', 'move', 'move2', 'assign', 'ompmove', 'ompreach', 'sweep', 'paths', 'twinorder'];
const PHASES = (process.env.PHASES || ALL.join(',')).split(',');
const on = (p) => PHASES.includes(p);
const log = (...a) => console.log('[k2]', ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (s, n = 1500) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));
const statePath = (app) => path.join(outDir(), `k2-state-${app.name}.json`);

// A legacy grid as data (K1's reader): heading, header actions, column heads, rows (cells, tick boxes), the empty line.
const GRID = (sel) => {
    const g = document.querySelector(sel);
    if (!g) return null;
    const t = (s) => (s || '').replace(/\s+/g, ' ').trim();
    const vis = (e) => !!(e.offsetWidth || e.offsetHeight || e.getClientRects().length);
    return {
        heading: [...g.querySelectorAll('h3, h4, .pkp_grid_title, .header span.title')].filter(vis).map((h) => t(h.innerText)),
        headerActions: [...g.querySelectorAll('.header a, .header button, .pkp_linkaction_toolbar a, .actions a')].filter(vis).map((a) => t(a.innerText) || a.title).filter(Boolean),
        th: [...g.querySelectorAll('thead th')].filter(vis).map((h) => t(h.innerText)),
        rows: [...g.querySelectorAll('tbody:not(.empty) tr.gridRow')].filter(vis).map((tr) => {
            const cells = [...tr.querySelectorAll('td')].map((td) => {
                const b = td.querySelector('input[type=checkbox]');
                const c = td.cloneNode(true);
                c.querySelectorAll('a.show_extras, a.hide_extras, script').forEach((a) => a.remove());
                return b ? {box: b.checked, disabled: b.disabled} : t(c.textContent);
            });
            return {id: tr.id, cells};
        }),
        empty: [...g.querySelectorAll('tbody.empty')].filter(vis).map((b) => t(b.innerText)),
    };
};
const titles = (g) => (g && g.rows ? g.rows.map((r) => r.cells[0]) : null);

// A legacy form as data (K1's reader).
const FORM = (sel) => {
    const f = document.querySelector(sel);
    if (!f) return null;
    const t = (s) => (s || '').replace(/\s+/g, ' ').trim();
    const vis = (e) => !!(e.offsetWidth || e.offsetHeight || e.getClientRects().length);
    const labelOf = (e) => {
        let l = e.id ? f.querySelector(`label[for="${CSS.escape(e.id)}"]`) : null;
        if (!l) l = e.closest('label');
        return l ? t(l.innerText) : null;
    };
    const dlg = f.closest('[role=dialog]');
    const mce = (id) => (window.tinymce && window.tinymce.get(id) ? window.tinymce.get(id).getContent() : null);
    return {
        dialogHeading: dlg ? [...dlg.querySelectorAll('h1, h2, .pkp_modal_panel > .header, .header h2')].filter(vis).map((h) => t(h.innerText)).slice(0, 3) : null,
        fields: [...f.querySelectorAll('input, select, textarea')].filter((e) => e.type !== 'hidden' && e.type !== 'file').map((e) => {
            const o = {name: e.name, label: labelOf(e)};
            if (e.type === 'checkbox' || e.type === 'radio') o.checked = e.checked;
            else if (e.tagName === 'SELECT') o.selected = e.options[e.selectedIndex] ? t(e.options[e.selectedIndex].text) : null;
            else if (e.tagName === 'TEXTAREA') o.value = mce(e.id) ?? e.value;
            else o.value = (e.value || '').slice(0, 300);
            return o;
        }).filter((o) => o.name && (!/\[fr_CA\]/.test(o.name))),
        messages: [...f.querySelectorAll('label.error, .pkp_form_error, #formErrors, .error')].filter(vis).map((e) => t(e.innerText).slice(0, 300)).filter(Boolean),
    };
};

forEachApp(async (app) => {
    const isOJS = app.name === 'ojs';
    const isOPS = app.name === 'ops';
    const isOMP = app.name === 'omp';
    if (process.env.RESEED && fs.existsSync(statePath(app))) fs.renameSync(statePath(app), `${statePath(app)}.${Date.now()}.old`);
    const S = fs.existsSync(statePath(app)) ? JSON.parse(fs.readFileSync(statePath(app), 'utf8')) : {};
    const save = () => fs.writeFileSync(statePath(app), JSON.stringify(S, null, 1));
    const fact = (k, v) => { record('k2-facts', {[k]: v}, {merge: true}); log(`[${app.name} ${k}]`, JSON.stringify(v).slice(0, 2500)); };
    const strip = (u) => (u || '').replace(/^https?:\/\/127\.0\.0\.1:\d+/, '');
    const GRIDSEL = isOMP ? '#seriesGridContainer' : '#sectionsGridContainer';
    const FORMSEL = isOMP ? 'form#seriesForm' : 'form#sectionForm';
    const TAB = isOMP ? 'Series' : 'Sections';
    const MENU = isOJS ? 'Publication Settings' : isOMP ? 'Catalog Entry' : /Preprint Entry/i;
    const SECLABEL = isOMP ? /^\s*Series\b/ : /^\s*Section\b/;

    // ------------------------------------------------------------------ seed
    if (on('seed') && !S.seeded) {
        const t = tag('u17k2');
        S.t = t;
        const u = (p, k, roles, g, fam, extra = {}) => ({username: `${p}${k}`, roles, givenName: g, familyName: fam, ...extra});
        const mk = async (key, spec) => {
            const p = `${t}${key}`;
            const r = await app.api.createContext({tag: p, ...spec});
            log('seed', p, 'ok');
            return {path: r.path || p, issues: r.issues || null};
        };
        const sub = async (C, key, spec) => {
            const r = await app.api.createSubmission({tag: `${t}${key}`, context: C.path, ...spec});
            return {id: r.submissionId, pub: r.publicationId, title: spec.title};
        };
        const sec = (abbrev, title, p, extra = {}) => ({abbrev, title, ...(isOPS ? {path: p} : {}), ...extra});
        const issue = isOJS ? {issues: [{volume: 1, number: 1, year: 2024, published: true}]} : {};
        const inIssue = isOJS ? {issue: {volume: 1, number: 1, year: 2024}} : {};
        const cname = (k) => ({name: `U17 K2 ${k} ${t}`, acronym: 'KTWO', contactName: 'K2 Contact', contactEmail: `${t}${k}c@mail.test`});
        if (!isOMP) {
            S.N = await mk('n', {context: cname('new'), users: [u(`${t}n`, 'mg', ['manager'], 'Nia', 'Manager')]});
            S.L = await mk('l', {context: cname('last'), sections: [sec('OPN', 'Open', 'open'), sec('SHT', 'Shut', 'shut')], users: [u(`${t}l`, 'mg', ['manager'], 'Lia', 'Manager')]});
            const po = `${t}o`;
            S.O = await mk('o', {context: cname('order'), ...issue,
                sections: [sec('FST', 'First', 'first', {policy: 'First policy K2'}), sec('SND', 'Second', 'second', {policy: 'Second policy K2'})],
                users: [u(po, 'mg', ['manager'], 'Oda', 'Manager'), u(po, 'au', ['author'], 'Otto', 'Author')]});
            S.O.subs = {
                f: await sub(S.O, 'of', {submitter: `${po}au`, title: 'K2 Order item in First', section: 'FST', published: true, datePublished: '2024-02-01', ...inIssue}),
                s: await sub(S.O, 'os', {submitter: `${po}au`, title: 'K2 Order item in Second', section: 'SND', published: true, datePublished: '2024-02-02', ...inIssue}),
            };
            const pc = `${t}c`;
            S.C = await mk('c', {context: cname('rules'), ...issue,
                sections: [sec('ALP', 'Alpha', 'alpha', {policy: 'Alpha policy K2'}), sec('BET', 'Beta', 'beta'), sec('GAM', 'Gamma', 'gamma', {policy: 'Gamma policy K2'}),
                    sec('DEL', 'Delta', 'delta'), sec('EPS', 'Epsilon', 'epsilon')],
                users: [u(pc, 'mg', ['manager'], 'Cara', 'Manager'), u(pc, 'au', ['author'], 'Cal', 'Author'), u(pc, 'se', ['sectionEditor'], 'Cy', 'Sectioned'),
                    u(pc, 's2', ['sectionEditor'], 'Dee', 'Deltaed', {sections: ['DEL']}), u(pc, 'rd', ['reader'], 'Cleo', 'Reader')]});
            S.C.subs = {
                a: await sub(S.C, 'ca', {submitter: `${pc}au`, title: 'K2 Draft in Alpha', section: 'ALP', submitted: false}),
                b: await sub(S.C, 'cb', {submitter: `${pc}au`, title: 'K2 Submitted in Beta', section: 'BET'}),
                g: await sub(S.C, 'cg', {submitter: `${pc}au`, title: 'K2 Published in Gamma', section: 'GAM', published: true, datePublished: '2024-03-01', ...inIssue}),
            };
            if (isOPS) {
                S.T = await mk('t', {context: cname('twin'), sections: [sec('PRE', 'Preprints', 'preprints')], users: [u(`${t}t`, 'mg', ['manager'], 'Tia', 'Manager'), u(`${t}t`, 'au', ['author'], 'Tom', 'Author')]});
                S.T.subs = {p: await sub(S.T, 'tp', {submitter: `${t}tau`, title: 'K2 Posted in Preprints', section: 'PRE', published: true, datePublished: '2024-04-01'})};
            }
        } else {
            S.N = await mk('n', {context: cname('new'), users: [u(`${t}n`, 'mg', ['manager'], 'Nia', 'Manager')]});
            const pp = `${t}p`;
            S.P = await mk('p', {context: cname('press'),
                users: [u(pp, 'mg', ['manager'], 'Pia', 'Manager'), u(pp, 'au', ['author'], 'Pat', 'Author'), u(pp, 'se', ['sectionEditor'], 'Sy', 'Seriesed'), u(pp, 'rd', ['reader'], 'Pru', 'Reader')]});
        }
        S.seeded = true; save();
        record('seed', S);
    }
    if (!S.seeded) { log('no state; run seed first'); return; }
    if (PHASES.length === 1 && PHASES[0] === 'seed') return;
    const t = S.t;

    // ------------------------------------------------------------------ browser and helpers
    const {page, close} = await launch(app);
    const jsDialogs = [];
    page.on('dialog', (d) => {
        jsDialogs.push({at: Date.now(), type: d.type(), message: flat(d.message(), 300), url: strip(page.url())});
        log('[browser dialog]', d.type(), flat(d.message(), 160));
        d.accept().catch(() => {});
    });
    const bad = [];
    page.on('response', (r) => { if (r.status() >= 400) bad.push({at: Date.now(), status: r.status(), m: r.request().method(), url: strip(r.url()).slice(0, 200)}); });
    const errs = [];
    page.on('pageerror', (e) => errs.push({at: Date.now(), t: flat(e.message, 300)}));
    page.on('console', (m) => { if (m.type() === 'error') errs.push({at: Date.now(), t: flat(m.text(), 300)}); });
    const since = (arr, s) => arr.filter((x) => x.at >= s).map(({at, ...r}) => r);
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
    const noticesSince = async (s) => page.evaluate((x) => (window.__notices || []).filter((n) => n.at >= x).map((n) => n.t.replace(/\s*×\s*Close\s*$/, '').trim()), s).catch(() => []);

    async function snap(name, extra = {}, {png = false} = {}) {
        let s;
        try { s = await screen(page); } catch (e) { s = {url: page.url(), error: String(e.message).slice(0, 200)}; }
        Object.assign(s, extra);
        record(name, s);
        if (png) await shot(page, name).catch(() => {});
        return s;
    }
    async function sect(name, fn) {
        try { return await fn(); } catch (e) {
            log(`[${name} FAILED]`, String(e.stack || e).split('\n').slice(0, 4).join(' | '));
            fact(`${name}.FAILED`, String(e.message || e).slice(0, 600));
            await snap(`zz-failed-${name.replace(/[^a-z0-9]+/gi, '-')}`, {}, {png: true}).catch(() => {});
            return null;
        }
    }
    const as = async (user, ctx) => { await signIn(page, user, {contextPath: ctx}); await idle(page).catch(() => {}); };
    const visitor = async () => { await signOut(page).catch(() => {}); };
    const cu = (ctx, p) => app.url(`/index.php/${ctx}${p}`);
    const go = async (url) => {
        const r = await page.goto(url, {waitUntil: 'domcontentloaded'}).catch((e) => ({err: String(e.message).slice(0, 200)}));
        await idle(page).catch(() => {});
        return r && r.status ? r.status() : r;
    };
    const grid = () => page.locator(GRIDSEL).first();
    const readGrid = async () => page.evaluate(GRID, GRIDSEL);
    const form = () => page.locator(FORMSEL).first();
    const readForm = async () => page.evaluate(FORM, FORMSEL);
    const top = () => page.locator('[role="dialog"]:visible').last();
    const readTop = async () => top().evaluate((d) => {
        const t = (s) => (s || '').replace(/\s+/g, ' ').trim();
        const vis = (e) => !!(e.offsetWidth || e.offsetHeight || e.getClientRects().length);
        return {heading: [...d.querySelectorAll('h1, h2, h3, .header')].filter(vis).map((h) => t(h.innerText)).slice(0, 2),
            text: t(d.innerText).slice(0, 600), buttons: [...d.querySelectorAll('button, a.pkpButton, a.cancelButton')].filter(vis).map((b) => t(b.innerText) || b.getAttribute('aria-label')).filter(Boolean)};
    }).catch((e) => ({error: String(e.message).slice(0, 200)}));

    // Settings › Journal (Press, Server) › the Sections (Series) tab
    async function openTab(ctx) {
        const status = await go(cu(ctx, '/management/settings/context'));
        const tab = page.getByRole('tab', {name: TAB, exact: true}).first();
        if (!(await tab.count())) return {status, tab: false};
        await tab.click(); await idle(page);
        await grid().waitFor({timeout: T});
        await grid().locator('tr.gridRow, tbody.empty').first().waitFor({state: 'attached', timeout: T}).catch(() => {});
        await sleep(500);
        return {status, tab: true};
    }
    const rowOf = (title) => grid().locator('tr.gridRow').filter({has: page.locator('td').first().filter({hasText: new RegExp(`^\\s*(Settings\\s*)?${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`)})}).first();
    async function rowLinks(title) {
        const row = rowOf(title);
        const tog = row.locator('a.show_extras');
        if (await tog.count()) { await tog.first().click(); await sleep(400); }
        const id = await row.getAttribute('id');
        const next = page.locator(`tr#${id} + tr`);
        return {next, links: (await next.locator('a:visible').allInnerTexts()).map((x) => flat(x))};
    }
    async function waitForm() {
        await form().locator('input[name^="title"]').first().waitFor({timeout: T});
        await idle(page); await sleep(900);
    }
    async function openEdit(title) {
        const {next} = await rowLinks(title);
        await next.getByRole('link', {name: 'Edit', exact: true}).first().click();
        await waitForm();
    }
    async function openCreate() {
        const name = isOMP ? /Add Series/ : /Create Section/;
        await grid().getByRole('link', {name}).first().click();
        await waitForm();
    }
    // Save and read what follows: the window (open or closed), its messages, the notices, dialogs, failed requests.
    async function pressSave(label) {
        const t0 = Date.now();
        const w = page.waitForResponse((r) => r.request().method() === 'POST' && /update-?(section|series)/i.test(r.url()), {timeout: T}).catch(() => null);
        await form().getByRole('button', {name: 'Save', exact: true}).click();
        const r = await w;
        await sleep(1500); await idle(page).catch(() => {});
        const open = await form().isVisible().catch(() => false);
        const out = {post: r ? r.status() : null, windowOpen: open, form: open ? await readForm() : null, notices: await noticesSince(t0),
            dialogs: jsDialogs.filter((d) => d.at >= t0).map((d) => d.message), failed: since(bad, t0), errors: since(errs, t0), grid: open ? null : await readGrid()};
        await snap(label, {save: out}, {png: open});
        return out;
    }
    async function cancelWindow() {
        const c = form().getByRole('link', {name: 'Cancel', exact: true});
        if (await c.count()) await c.first().click(); else await top().getByRole('button', {name: 'Close'}).first().click().catch(() => {});
        await sleep(900);
    }
    async function fillTitle(v) { await form().locator('input[name="title[en]"]').fill(v); }
    async function mceSet(name, html) {
        const id = await form().locator(`textarea[name="${name}"]`).getAttribute('id');
        await page.waitForFunction((i) => window.tinymce && window.tinymce.get(i) && window.tinymce.get(i).initialized, id, {timeout: T}).catch(() => {});
        await page.evaluate(([i, h]) => { const ed = window.tinymce.get(i); ed.setContent(h); ed.fire('change'); ed.save(); }, [id, html]);
    }
    // A row's "Inactive" box pressed: the window it opens, then OK / Cancel; the notices, the grid on the page and after a reload.
    async function pressBox(ctx, title, answer, label) {
        const t0 = Date.now();
        const before = await readGrid();
        await rowOf(title).locator('input[type=checkbox]').first().click();
        await sleep(1200);
        const ask = await readTop();
        await snap(`${label}-ask`, {ask}, {png: true});
        await top().getByRole('button', {name: answer, exact: true}).first().click().catch((e) => log('no', answer, e.message));
        await sleep(1800); await idle(page).catch(() => {});
        const samePage = await readGrid();
        const notices = await noticesSince(t0);
        await snap(label, {res: {notices, samePage}});
        await openTab(ctx);
        const afterReload = await readGrid();
        return {ask, answer, notices, before: boxOf(before, title), samePage: boxOf(samePage, title), afterReload: boxOf(afterReload, title),
            titlesAfter: titles(afterReload), failed: since(bad, t0), errors: since(errs, t0), dialogs: jsDialogs.filter((d) => d.at >= t0).map((d) => d.message)};
    }
    const boxOf = (g, title) => {
        const r = (g && g.rows || []).find((x) => x.cells[0] === title || x.cells[0] === `Settings ${title}` || String(x.cells[0]).endsWith(title));
        if (!r) return 'no row';
        const b = r.cells.find((c) => c && typeof c === 'object');
        return b ? (b.box ? 'ticked' : 'unticked') : 'no box';
    };
    // A row's "Delete": the window, then OK / Cancel; notices; the grid on the page and after a reload.
    async function pressDelete(ctx, title, answer, label) {
        const t0 = Date.now();
        const {next, links} = await rowLinks(title);
        await next.getByRole('link', {name: 'Delete', exact: true}).first().click();
        await sleep(1200);
        const ask = await readTop();
        await snap(`${label}-ask`, {ask}, {png: true});
        await top().getByRole('button', {name: answer, exact: true}).first().click().catch((e) => log('no', answer, e.message));
        await sleep(1800); await idle(page).catch(() => {});
        const samePage = await readGrid();
        const notices = await noticesSince(t0);
        await snap(label, {res: {notices, samePage}}, {png: true});
        await openTab(ctx);
        const afterReload = await readGrid();
        return {rowLinks: links, ask, answer, notices, samePage: titles(samePage), afterReload: titles(afterReload), empty: afterReload && afterReload.empty,
            failed: since(bad, t0), errors: since(errs, t0), dialogs: jsDialogs.filter((d) => d.at >= t0).map((d) => d.message)};
    }
    // "Order": drag row `from` onto row `to`'s top, then "Done" or "Cancel ordering".
    async function reorder(ctx, fromTitle, toTitle, finish, label) {
        const t0 = Date.now();
        const out = {before: titles(await readGrid())};
        const order = grid().getByRole('link', {name: 'Order', exact: true}).first();
        out.orderLink = await order.count();
        if (!out.orderLink) return out;
        await order.click(); await sleep(800);
        out.controlsWhileOrdering = await grid().locator('a:visible, button:visible').evaluateAll((els) => els.map((e) => (e.innerText || e.title || e.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim()).filter(Boolean)).catch(() => []);
        await snap(`${label}-ordering`, {controls: out.controlsWhileOrdering}, {png: true});
        const src = rowOf(fromTitle);
        const dst = rowOf(toTitle);
        const sb = await src.boundingBox();
        const tb = await dst.boundingBox();
        await page.mouse.move(sb.x + 40, sb.y + sb.height / 2);
        await page.mouse.down();
        await page.mouse.move(sb.x + 40, sb.y + sb.height / 2 - 5, {steps: 5});
        await page.mouse.move(tb.x + 40, tb.y + 3, {steps: 20});
        await sleep(300);
        await page.mouse.move(tb.x + 40, tb.y + 2, {steps: 2});
        await page.mouse.up();
        await sleep(700);
        out.whileOrdering = titles(await readGrid());
        const posts = [];
        const onResp = (r) => { if (r.request().method() === 'POST' && /sequence/i.test(r.url())) posts.push(r.status()); };
        page.on('response', onResp);
        await grid().getByRole('link', {name: finish, exact: true}).first().click();
        await sleep(1800); await idle(page).catch(() => {});
        page.off('response', onResp);
        out.finish = finish;
        out.posts = posts;
        out.samePage = titles(await readGrid());
        out.notices = await noticesSince(t0);
        await snap(label, {res: out}, {png: true});
        await openTab(ctx);
        out.afterReload = titles(await readGrid());
        out.failed = since(bad, t0); out.errors = since(errs, t0);
        return out;
    }

    // ---- lists elsewhere: the start form, the dashboard filter, the publication page's list, About › Submissions
    async function startFormChoices(ctx, key) {
        await go(cu(ctx, '/submission'));
        await page.locator('input[type=radio], .pkpFormField').first().waitFor({timeout: T}).catch(() => {});
        await sleep(800);
        const radios = await page.locator('input[type=radio][name="sectionId"]').evaluateAll((els) => els.map((e) => ((e.closest('label') || e.parentElement).innerText || '').replace(/\s+/g, ' ').trim()));
        await snap(key, {radios});
        return radios;
    }
    async function ompWizardSeries(ctx, draftId, key) {
        await go(cu(ctx, `/submission?id=${draftId}`));
        await page.locator('.pkpSteps').waitFor({timeout: T}).catch(() => {});
        await idle(page); await sleep(800);
        const ed = page.locator('.pkpSteps').getByRole('button', {name: /For the Editors$/}).first();
        if (await ed.count()) { await ed.click(); await sleep(1500); }
        const radios = await page.locator('input[type=radio][name="seriesId"]').evaluateAll((els) => els.map((e) => ((e.closest('label') || e.parentElement).innerText || '').replace(/\s+/g, ' ').trim()));
        await snap(key, {radios});
        return radios;
    }
    const filtersWin = () => page.getByRole('dialog').filter({has: page.getByRole('button', {name: 'Apply Filters', exact: true})}).last();
    async function dashboardFilter(ctx, key) {
        await go(cu(ctx, '/dashboard/editorial'));
        await page.locator('main, #app-main').first().getByRole('button', {name: 'Filters', exact: true}).first().waitFor({timeout: T});
        await idle(page); await sleep(600);
        await page.locator('main, #app-main').first().getByRole('button', {name: 'Filters', exact: true}).first().click();
        await filtersWin().getByRole('button', {name: 'Apply Filters', exact: true}).waitFor({timeout: T});
        await idle(page); await sleep(900);
        const out = await filtersWin().evaluate((d) => {
            const t = (s) => (s || '').replace(/\s+/g, ' ').trim();
            const vis = (e) => e.getClientRects().length > 0;
            const sets = [...d.querySelectorAll('fieldset, .pkpFormField')].filter(vis).map((f) => ({
                label: t((f.querySelector('legend, .pkpFormFieldLabel, label') || {}).innerText),
                options: [...f.querySelectorAll('input[type=checkbox]')].map((b) => t((b.closest('label') || b.parentElement).innerText)),
            })).filter((x) => x.options.length);
            return {labels: [...d.querySelectorAll('legend, .pkpFormFieldLabel')].filter(vis).map((x) => t(x.innerText)), sets, text: t(d.innerText).slice(0, 1200)};
        });
        await snap(key, {filters: out});
        await filtersWin().getByRole('button', {name: 'Close'}).first().click().catch(() => {});
        await sleep(500);
        return out;
    }
    async function publicationList(ctx, sid, key) {
        await go(cu(ctx, `/dashboard/editorial?workflowSubmissionId=${sid}`));
        await sleep(1500); await idle(page);
        const wf = page.locator('[role="dialog"]:visible').first();
        const menu = await wf.locator('a, button').evaluateAll((els) => els.filter((e) => e.getClientRects().length).map((e) => (e.innerText || '').replace(/\s+/g, ' ').trim()).filter(Boolean)).catch(() => []);
        const link = wf.getByRole('link', {name: MENU}).last();
        let clicked = false;
        if (await link.count()) { await link.click(); clicked = true; await idle(page); await sleep(1800); }
        const sel = page.locator('select').filter({has: page.locator('option')});
        const fields = await page.locator('[role="dialog"]:visible').first().evaluate((d, src) => {
            const t = (s) => (s || '').replace(/\s+/g, ' ').trim();
            const re = new RegExp(src);
            return [...d.querySelectorAll('select')].map((s) => {
                const l = s.id ? d.querySelector(`label[for="${CSS.escape(s.id)}"]`) : null;
                const f = s.closest('.pkpFormField');
                const label = t((l || (f && f.querySelector('.pkpFormFieldLabel, label')) || {}).innerText);
                return {name: s.name, label, selected: s.options[s.selectedIndex] ? t(s.options[s.selectedIndex].text) : null, options: [...s.options].map((o) => t(o.text))};
            }).filter((x) => re.test(x.label) || /section|series/i.test(x.name));
        }, SECLABEL.source).catch((e) => ({error: String(e.message)}));
        await snap(key, {menuClicked: clicked, menu: menu.slice(0, 60), fields});
        return {clicked, url: strip(page.url()), fields};
    }
    async function submissionsPage(ctx, key) {
        const st = await go(cu(ctx, '/about/submissions'));
        const o = await page.evaluate(() => {
            const t = (s) => (s || '').replace(/\s+/g, ' ').trim();
            const main = document.querySelector('.pkp_structure_main') || document.body;
            return {policies: [...document.querySelectorAll('.section_policy')].map((e) => t(e.innerText).slice(0, 200)),
                headings: [...main.querySelectorAll('h2, h3')].map((h) => t(h.innerText)), text: t(main.innerText).slice(0, 2500)};
        });
        await snap(key, {status: st, facts: o});
        return {status: st, ...o};
    }
    async function mailCounts(users) {
        await sleep(3000);
        const out = {};
        for (const u2 of users) { try { out[u2] = await app.mail.count({to: `${u2}@mail.test`}); } catch (e) { out[u2] = `err ${flat(e.message, 80)}`; } }
        return out;
    }

    // ---- the submission wizard (as checks/U16/K3/k3.js walks it)
    const fixture = (f) => path.join(REPO, 'apps', app.name, 'playwright/fixtures/files', f);
    const currentStep = () => page.locator('.pkpSteps__step__label--current');
    const lastStep = isOPS ? 'For Readers' : 'For the Editors';
    async function continueTo(label) {
        const button = page.locator('.submissionWizard__footer').getByRole('button', {name: 'Continue', exact: true});
        for (let attempt = 0; ; attempt++) {
            await button.click();
            try { await currentStep().filter({hasText: label}).waitFor({timeout: 6000}); return; } catch (e) { if (attempt >= 2) throw e; }
        }
    }
    async function uploadWizardFile(marker) {
        if (isOJS) {
            const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', {name: 'Add File', exact: true}).click()]);
            await chooser.setFiles(fixture('article.pdf'));
            await page.getByRole('button', {name: 'Article Text', exact: true}).click();
            await page.locator('.listPanel__item--submissionFile').filter({hasText: 'article.pdf'}).getByText('Article Text').waitFor({timeout: 30000});
        } else if (isOMP) {
            await page.locator('.submissionFilesListPanel input[type="file"]').setInputFiles({name: `ms-${marker}.txt`, mimeType: 'text/plain', buffer: Buffer.from(`Manuscript ${marker}`)});
            const genreButton = page.locator('.listPanel--submissionFiles__setGenre').getByRole('button', {name: 'Book Manuscript', exact: true});
            await genreButton.waitFor({timeout: 30000});
            const saved = page.waitForResponse((r) => r.url().includes('/files/') && r.ok());
            await genreButton.click();
            await saved;
            await page.locator('.listPanel--submissionFiles__itemGenre').filter({hasText: 'Book Manuscript'}).first().waitFor({timeout: 20000});
        } else {
            const labelDialog = page.getByRole('dialog').filter({has: page.locator('#preprintGalleyForm')});
            await idle(page);
            for (let attempt = 0; ; attempt++) {
                await page.getByRole('link', {name: 'Add File', exact: true}).click();
                try { await labelDialog.first().waitFor({timeout: 5000}); break; } catch (e) { if (attempt >= 2) throw e; }
            }
            await labelDialog.locator('input[name="label"]').fill('PDF');
            await labelDialog.getByRole('button', {name: 'Save', exact: true}).click();
            const upload = page.getByRole('dialog').filter({has: page.locator('div[id^="fileUploadWizard"]')});
            const genreSelect = upload.locator('select[name="genreId"]').first();
            await genreSelect.waitFor({timeout: 30000});
            await genreSelect.selectOption({label: 'Preprint Text'});
            await upload.locator('input[type="file"]').setInputFiles(fixture('preprint.pdf'));
            const cont = upload.getByRole('button', {name: 'Continue', exact: true});
            await cont.waitFor({timeout: 30000});
            await page.waitForFunction(() => { const b = [...document.querySelectorAll('[role="dialog"] button')].find((x) => x.innerText.trim() === 'Continue'); return b && !b.disabled; }, null, {timeout: 30000});
            await cont.click();
            await upload.getByRole('tab', {name: '2. Review Details'}).waitFor({timeout: 30000});
            await upload.getByRole('button', {name: 'Continue', exact: true}).click();
            await upload.getByRole('tab', {name: '3. Confirm'}).waitFor({timeout: 30000});
            await upload.getByRole('button', {name: 'Complete', exact: true}).click();
            await upload.waitFor({state: 'hidden', timeout: 30000});
            await idle(page);
            await page.locator('.submissionWizard').getByRole('link', {name: 'PDF'}).first().waitFor({timeout: 20000});
        }
    }
    async function wizardSubmitDraft(ctx, draft, marker, name) {
        await go(cu(ctx, `/submission?id=${draft}`));
        await currentStep().first().waitFor({timeout: T}); await idle(page);
        await uploadWizardFile(marker);
        await continueTo('Details'); await continueTo('Contributors'); await continueTo(lastStep);
        await idle(page); await sleep(900);
        const validated = page.waitForResponse((r) => r.url().includes('/submit') && r.request().method() === 'POST' && r.status() < 500, {timeout: 45000}).catch(() => null);
        await continueTo('Review');
        await validated;
        await page.locator('.submissionWizard__loadingReview').waitFor({state: 'hidden', timeout: 20000}).catch(() => {});
        const review = flat(await page.locator('.submissionWizard').innerText().catch(() => ''), 3000);
        await snap(`${name}-review`, {review});
        await page.locator('.submissionWizard__footer').getByRole('button', {name: 'Submit', exact: true}).click();
        const d = page.getByRole('dialog').filter({hasText: /will be submitted to|Are you sure you want to (complete|submit)/});
        await d.waitFor({timeout: 30000});
        await d.getByRole('button', {name: 'Submit', exact: true}).click();
        await page.getByRole('heading', {name: 'Submission complete'}).waitFor({timeout: 45000});
        await snap(`${name}-complete`);
        return review;
    }
    const PARTICIPANTS = () => {
        const vis = (e) => e.getClientRects().length > 0;
        const dlg = [...document.querySelectorAll('[role=dialog]')].filter(vis)[0] || document.body;
        const h = [...dlg.querySelectorAll('h1,h2,h3,h4')].filter(vis).find((x) => /^participants$/i.test(x.textContent.trim()));
        if (!h) return {present: false};
        let box = h.parentElement;
        for (let i = 0; i < 4 && box && !box.querySelector('ul, [role=list]'); i++) box = box.parentElement;
        return {present: true, items: box ? [...box.querySelectorAll('li')].filter(vis).map((li) => li.innerText.split('\n').map((x) => x.trim()).filter(Boolean).join('/')) : []};
    };
    async function readParticipants(ctx, sid, key) {
        await go(cu(ctx, `/dashboard/editorial?workflowSubmissionId=${sid}`)); await sleep(2000); await idle(page);
        const p = await page.evaluate(PARTICIPANTS);
        await snap(key, {participants: p});
        return p;
    }
    async function activityLog(ctx, sid, key) {
        await go(cu(ctx, `/dashboard/editorial?workflowSubmissionId=${sid}`)); await sleep(2000); await idle(page);
        const b = page.getByRole('button', {name: 'Activity Log', exact: true}).first();
        if (!(await b.count())) { await snap(key, {activityLog: 'no button'}); return 'no button'; }
        await b.click(); await sleep(2000); await idle(page);
        const txt = flat(await top().innerText().catch(() => ''), 3000);
        await snap(key, {activityLog: txt});
        return txt;
    }
    async function inbox(username) {
        try { const res = await app.mail._search({to: `${username}@mail.test`}); return (res.messages || []).map((m) => flat(m.Subject || m.subject, 160)); } catch (e) { return {error: flat(e.message, 200)}; }
    }
    // Reader pages, signed out or not: a page's heading(s), the section headings and item titles, raw keys.
    async function reader(url, key) {
        const status = await go(url);
        const o = await page.evaluate(() => {
            const t = (s) => (s || '').replace(/\s+/g, ' ').trim();
            const main = document.querySelector('.pkp_structure_main') || document.body;
            return {h1: [...main.querySelectorAll('h1')].map((h) => t(h.innerText)), h2: [...main.querySelectorAll('h2, h3')].map((h) => t(h.innerText)).slice(0, 30),
                sections: [...main.querySelectorAll('.section h2, .section h3, .sections .section > h2')].map((h) => t(h.innerText)),
                items: [...main.querySelectorAll('.obj_article_summary .title, .obj_preprint_summary .title, .obj_monograph_summary .title')].map((h) => t(h.innerText)),
                raw: (main.innerText.match(/##[^#\s]+##/g) || []), text: t(main.innerText).slice(0, 1500)};
        });
        await snap(key, {status, facts: o});
        return {status, ...o};
    }

    try {
        const U = (ctxKey, k) => `${t}${ctxKey}${k}`;
        const DEF = isOPS ? 'Preprints' : 'Articles';

        // ================================================================== list: Rule 1 (a new context's list; every row, active and inactive)
        if (on('list')) await sect('list', async () => {
            const out = {};
            await as(U('n', 'mg'), S.N.path);
            out.nTab = await openTab(S.N.path);
            out.nGrid = await readGrid();
            await snap('l-01-new-context-tab', {grid: out.nGrid}, {png: true});
            await loc(page, `${TAB} tab: the grid`, grid());
            await loc(page, `${TAB} tab: "Order" link`, grid().getByRole('link', {name: 'Order', exact: true}));
            if (!isOMP) {
                out.nRowLinks = (await rowLinks(DEF)).links;
                await openEdit(DEF);
                out.nDefault = await readForm();
                await snap('l-02-new-context-default-section-window', {form: out.nDefault}, {png: true});
                await cancelWindow();
            }
            if (!isOMP) {
                await as(U('c', 'mg'), S.C.path);
                await openTab(S.C.path);
                out.cGrid = await readGrid();
                await snap('l-03-rules-context-tab', {grid: out.cGrid});
                await loc(page, `${TAB} tab: a row's "Inactive" box`, rowOf('Alpha').locator('input[type=checkbox]'));
                await loc(page, `${TAB} tab: a row's arrow`, rowOf('Alpha').locator('a.show_extras'));
            }
            await visitor();
            fact('list', out);
        });

        // ================================================================== create: Rule 2, Settings 16, Side effects (notice, no email)
        if (on('create')) await sect('create', async () => {
            const out = {};
            if (!isOMP) {
                const users = ['mg', 'au', 'se', 's2', 'rd'].map((k) => U('c', k));
                out.mailBefore = await mailCounts(users);
                await as(U('c', 'mg'), S.C.path);
                await openTab(S.C.path);
                out.gridBefore = titles(await readGrid());
                if (!S.createdOne) {
                    await openCreate();
                    out.createWindow = await readForm();
                    await snap('c-01-create-window', {form: out.createWindow}, {png: true});
                    await loc(page, 'section window: form', form());
                    await fillTitle('Created');
                    await form().locator('input[name="abbrev[en]"]').fill('CRT');
                    if (isOPS) await form().locator('input[name="path"]').fill('created');
                    out.saveCreated = await pressSave('c-02-save-created');
                    await openTab(S.C.path);
                    out.gridAfterReload1 = await readGrid();
                    S.createdOne = true; save();
                    // with an editor ticked
                    await openCreate();
                    await fillTitle('Created Two');
                    await form().locator('input[name="abbrev[en]"]').fill('CR2');
                    if (isOPS) await form().locator('input[name="path"]').fill('created-two');
                    const boxes = await form().locator('input[type=checkbox]').evaluateAll((els) => els.map((b) => ({name: b.name, value: b.value, label: ((b.closest('label') || b.parentElement).innerText || '').replace(/\s+/g, ' ').trim()})));
                    out.createTwoBoxes = boxes.filter((b) => /Assign/.test(b.label));
                    const se = form().locator('label').filter({hasText: /Cy Sectioned/}).locator('input[type=checkbox]').first();
                    out.seBox = await se.count();
                    if (out.seBox) await se.check();
                    out.saveCreatedTwo = await pressSave('c-03-save-created-two');
                    await openTab(S.C.path);
                    out.gridAfterReload2 = await readGrid();
                    S.createdTwo = true; save();
                }
                out.mailAfter = await mailCounts(users);
                // where the new section shows: the start form (author)
                await as(U('c', 'au'), S.C.path);
                out.startFormAu = await startFormChoices(S.C.path, 'c-04-start-form-author');
            } else {
                // OMP: series made on screen in order First, Second (Sy Seriesed ticked), Third (td7)
                const P = S.P.path;
                const users = ['mg', 'au', 'se', 'rd'].map((k) => U('p', k));
                out.mailBefore = await mailCounts(users);
                await as(U('p', 'mg'), P);
                await openTab(P);
                out.grid0 = await readGrid();
                if (!S.seriesMade) {
                    for (const [name, p, tick] of [['First', 'first', false], ['Second', 'second', true], ['Third', 'third', false]]) {
                        await openCreate();
                        if (name === 'First') { out.createWindow = await readForm(); await snap('c-01-add-series-window', {form: out.createWindow}, {png: true}); }
                        await fillTitle(name);
                        await form().locator('input[name="path"]').fill(p);
                        if (tick) {
                            const se = form().locator('label').filter({hasText: /Sy Seriesed/}).locator('input[type=checkbox]').first();
                            out.seBox = await se.count();
                            if (out.seBox) await se.check();
                        }
                        out[`save${name}`] = await pressSave(`c-02-save-${p}`);
                        await openTab(P);
                        out[`gridAfter${name}`] = await readGrid();
                    }
                    S.seriesMade = true; save();
                }
                // books: a draft of the author's (the wizard's "Series" choice), a submitted book in Second, a published one in First
                if (!S.P.subs) {
                    S.P.subs = {};
                    const sub = async (key, spec) => { const r = await app.api.createSubmission({tag: `${t}${key}`, context: P, ...spec}); return {id: r.submissionId, pub: r.publicationId, title: spec.title}; };
                    S.P.subs.d = await sub('pd', {submitter: U('p', 'au'), title: 'K2 Draft book', submitted: false});
                    S.P.subs.dm = await sub('pm', {submitter: U('p', 'mg'), title: 'K2 Manager draft book', submitted: false});
                    S.P.subs.s = await sub('ps', {submitter: U('p', 'au'), title: 'K2 Submitted in Second', series: 'second'});
                    S.P.subs.p = await sub('pp', {submitter: U('p', 'au'), title: 'K2 Published in First', series: 'first', published: true, datePublished: '2024-05-01'});
                    save();
                }
                out.mailAfter = await mailCounts(users);
                await as(U('p', 'au'), P);
                out.wizardSeriesAu = await ompWizardSeries(P, S.P.subs.d.id, 'c-03-wizard-series-author');
                await as(U('p', 'mg'), P);
                out.catalogEntry = await publicationList(P, S.P.subs.s.id, 'c-04-catalog-entry-series');
                // N: "Solo" and "Duo" for the no-minimum drive
                if (!S.N.made) {
                    await as(U('n', 'mg'), S.N.path);
                    await openTab(S.N.path);
                    for (const [name, p] of [['Solo', 'solo'], ['Duo', 'duo']]) {
                        await openCreate(); await fillTitle(name); await form().locator('input[name="path"]').fill(p);
                        out[`saveN${name}`] = await pressSave(`c-05-n-save-${p}`);
                    }
                    await openTab(S.N.path);
                    out.nGrid = await readGrid();
                    S.N.made = true; save();
                }
            }
            await visitor();
            fact('create', out);
        });

        // ================================================================== edit: Rule 3 (the window filled; Save replaces; the change reaches every list)
        if (on('edit')) await sect('edit', async () => {
            const out = {};
            if (!isOMP) {
                const C = S.C.path;
                const cur = S.renamed ? 'Gamma Renamed' : 'Gamma';
                // before: the reader pages and lists naming Gamma
                const readAll = async (tagk) => {
                    const r = {};
                    await visitor();
                    r.submissions = await submissionsPage(C, `e-${tagk}-submissions-page`);
                    if (isOJS) {
                        r.issue = await reader(cu(C, `/issue/view/${S.C.issues[0].id}`), `e-${tagk}-issue-toc`);
                        r.article = await reader(cu(C, `/article/view/${S.C.subs.g.id}`), `e-${tagk}-article-page`);
                    } else {
                        r.preprint = await reader(cu(C, `/preprint/view/${S.C.subs.g.id}`), `e-${tagk}-preprint-page`);
                        r.sectionPage = await reader(cu(C, '/preprints/section/gamma'), `e-${tagk}-section-page`);
                        r.archives = await reader(cu(C, '/preprints'), `e-${tagk}-archives`);
                    }
                    await as(U('c', 'au'), C);
                    r.start = await startFormChoices(C, `e-${tagk}-start-form-author`);
                    await as(U('c', 'mg'), C);
                    r.filter = (await dashboardFilter(C, `e-${tagk}-dashboard-filter`)).sets;
                    r.pubList = (await publicationList(C, S.C.subs.g.id, `e-${tagk}-publication-list`)).fields;
                    return r;
                };
                out.before = await readAll(S.renamed ? 'renamed' : 'before');
                await as(U('c', 'mg'), C);
                await openTab(C);
                await openEdit(cur);
                out.windowSaved = await readForm();
                await snap('e-01-edit-window-filled', {form: out.windowSaved}, {png: true});
                // left once with a change unsaved, through the window's "×"
                await fillTitle('Unsaved change');
                await form().locator('input[name="title[en]"]').blur();
                const t0 = Date.now();
                await top().getByRole('button', {name: 'Close'}).first().click().catch(() => {});
                await sleep(1500);
                out.leaveX = {dialogs: jsDialogs.filter((d) => d.at >= t0).map((d) => `${d.type}: ${d.message}`), stillOpen: await form().isVisible().catch(() => false)};
                await openTab(C);
                out.leaveX.gridAfter = titles(await readGrid());
                await snap('e-02-left-unsaved', {leave: out.leaveX});
                // Save replaces all: title, abbreviation, policy, identify-as
                if (!S.renamed) {
                    await openEdit('Gamma');
                    await fillTitle('Gamma Renamed');
                    await form().locator('input[name="abbrev[en]"]').fill('GMR');
                    await mceSet('policy[en]', '<p>Gamma policy K2 renamed</p>');
                    await form().locator('input[name="identifyType[en]"]').fill('K2 Kind');
                    out.saveRename = await pressSave('e-03-save-renamed');
                    S.renamed = true; save();
                    await openTab(C);
                    await openEdit('Gamma Renamed');
                    out.windowAfter = await readForm();
                    await snap('e-04-edit-window-after-save', {form: out.windowAfter});
                    await cancelWindow();
                    out.after = await readAll('renamed');
                }
            } else {
                const P = S.P.path;
                const cur = S.renamed ? 'Second Renamed' : 'Second';
                const readAll = async (tagk) => {
                    const r = {};
                    await visitor();
                    r.catalogSeries = await reader(cu(P, '/catalog/series/second'), `e-${tagk}-series-page`);
                    r.book = await reader(cu(P, `/catalog/book/${S.P.subs.p.id}`), `e-${tagk}-book-page`);
                    await as(U('p', 'au'), P);
                    r.wizard = await ompWizardSeries(P, S.P.subs.d.id, `e-${tagk}-wizard-series`);
                    await as(U('p', 'mg'), P);
                    r.filter = (await dashboardFilter(P, `e-${tagk}-dashboard-filter`)).labels;
                    r.entry = (await publicationList(P, S.P.subs.p.id, `e-${tagk}-catalog-entry`)).fields;
                    return r;
                };
                out.before = await readAll(S.renamed ? 'renamed' : 'before');
                await as(U('p', 'mg'), P);
                await openTab(P);
                const curRow = (await rowOf(cur).count()) ? cur : titles(await readGrid())[0]; // "Second" is gone once ompmove has run
                await openEdit(curRow);
                out.windowSaved = await readForm();
                await snap('e-01-edit-window-filled', {form: out.windowSaved}, {png: true});
                await fillTitle('Unsaved change');
                await form().locator('input[name="title[en]"]').blur();
                const t0 = Date.now();
                await top().getByRole('button', {name: 'Close'}).first().click().catch(() => {});
                await sleep(1500);
                out.leaveX = {dialogs: jsDialogs.filter((d) => d.at >= t0).map((d) => `${d.type}: ${d.message}`), stillOpen: await form().isVisible().catch(() => false)};
                await openTab(P);
                out.leaveX.gridAfter = titles(await readGrid());
                if (!S.renamed) {
                    await openEdit('Second');
                    await fillTitle('Second Renamed');
                    await form().locator('input[name="prefix[en]"]').fill('The');
                    await form().locator('input[name="subtitle[en]"]').fill('K2 Sub');
                    out.saveRename = await pressSave('e-03-save-renamed');
                    S.renamed = true; save();
                    await openTab(P);
                    out.gridAfter = titles(await readGrid());
                    await openEdit('The Second Renamed');
                    out.windowAfter = await readForm();
                    await snap('e-04-edit-window-after-save', {form: out.windowAfter});
                    await cancelWindow();
                    out.after = await readAll('renamed');
                }
            }
            await visitor();
            fact('edit', out);
        });

        // ================================================================== landing: where a new row lands (Rule 2's press question, Settings 16), before and after an order is saved
        if (on('landing') || (on('landing2') && S.orderedOnce)) await sect('landing', async () => {
            const out = {};
            const ctx = isOMP ? S.P.path : S.O.path;
            const mg = isOMP ? U('p', 'mg') : U('o', 'mg');
            const adds = isOMP ? (S.orderedOnce ? [['Mike', 'mike']] : [['Zulu', 'zulu'], ['Able', 'able']]) : [[S.orderedOnce ? 'Late After Order' : 'Late', S.orderedOnce ? 'LAO' : 'LTE']];
            await as(mg, ctx);
            await openTab(ctx);
            out.before = titles(await readGrid());
            for (const [name, k] of adds) {
                if ((out.before || []).some((x) => x.endsWith(name))) continue;
                await openCreate(); await fillTitle(name);
                if (isOMP) await form().locator('input[name="path"]').fill(k);
                else { await form().locator('input[name="abbrev[en]"]').fill(k); if (isOPS) await form().locator('input[name="path"]').fill(k.toLowerCase()); }
                const r = await pressSave(`n-save-${k.toLowerCase()}`);
                out[`save${k}`] = {samePage: titles(r.grid), notices: r.notices};
                await openTab(ctx);
                out[`reload${k}`] = titles(await readGrid());
            }
            if (isOMP) {
                await as(U('p', 'au'), ctx);
                out.wizard = await ompWizardSeries(ctx, S.P.subs.d.id, `n-wizard-series-${S.orderedOnce ? 'after-order' : 'before-order'}`);
                await as(mg, ctx);
                out.entry = (await publicationList(ctx, S.P.subs.s.id, `n-catalog-entry-${S.orderedOnce ? 'after-order' : 'before-order'}`)).fields;
            } else {
                await as(U('o', 'au'), ctx);
                out.start = await startFormChoices(ctx, `n-start-form-${S.orderedOnce ? 'after-order' : 'before-order'}`);
            }
            out.orderedOnce = !!S.orderedOnce;
            await visitor();
            fact(`landing-${S.orderedOnce ? 'after-order' : 'before-order'}`, out);
        });

        // ================================================================== order: Rule 4, Settings 16 (Done, reload, every list; Cancel ordering)
        if (on('order')) await sect('order', async () => {
            const out = {};
            if (!isOMP) {
                const O = S.O.path;
                const readAll = async (tagk) => {
                    const r = {};
                    await as(U('o', 'mg'), O);
                    await openTab(O);
                    r.grid = titles(await readGrid());
                    r.filter = (await dashboardFilter(O, `o-${tagk}-dashboard-filter`)).sets;
                    r.pubList = (await publicationList(O, S.O.subs.f.id, `o-${tagk}-publication-list`)).fields;
                    await as(U('o', 'au'), O);
                    r.start = await startFormChoices(O, `o-${tagk}-start-form-author`);
                    await visitor();
                    const sp = await submissionsPage(O, `o-${tagk}-submissions-page`);
                    r.submissionsPage = {headings: sp.headings, policies: sp.policies};
                    if (isOJS) { const i = await reader(cu(O, `/issue/view/${S.O.issues[0].id}`), `o-${tagk}-issue-toc`); r.issueToc = {sections: i.sections, h2: i.h2, items: i.items}; }
                    else { const a = await reader(cu(O, '/preprints'), `o-${tagk}-archives`); r.archives = a.items; }
                    return r;
                };
                const g0 = await (async () => { await as(U('o', 'mg'), O); await openTab(O); return titles(await readGrid()); })();
                const firstTop = g0[0];
                const other = firstTop === 'First' ? 'Second' : 'First';
                out.before = await readAll(`${firstTop.toLowerCase()}-top`);
                await as(U('o', 'mg'), O);
                await openTab(O);
                out.done = await reorder(O, other, firstTop, 'Done', 'o-02-reorder-done');
                out.after = await readAll(`${other.toLowerCase()}-top`);
                await as(U('o', 'mg'), O);
                await openTab(O);
                out.cancel = await reorder(O, firstTop, other, 'Cancel ordering', 'o-03-reorder-cancel');
                // put it back, so a re-run drives from the other end
                out.restore = await reorder(O, firstTop, other, 'Done', 'o-04-reorder-restore');
            } else {
                const P = S.P.path;
                await as(U('p', 'mg'), P);
                await openTab(P);
                const g0 = titles(await readGrid());
                out.g0 = g0;
                const readAll = async (tagk) => {
                    const r = {};
                    await as(U('p', 'mg'), P);
                    await openTab(P);
                    r.grid = titles(await readGrid());
                    r.entry = (await publicationList(P, S.P.subs.p.id, `o-${tagk}-catalog-entry`)).fields;
                    await as(U('p', 'au'), P);
                    r.wizard = await ompWizardSeries(P, S.P.subs.d.id, `o-${tagk}-wizard-series`);
                    await visitor();
                    const c = await reader(cu(P, '/catalog'), `o-${tagk}-catalog`);
                    r.catalogText = flat(c.text, 600);
                    return r;
                };
                out.before = await readAll('before');
                await as(U('p', 'mg'), P);
                await openTab(P);
                const last = g0[g0.length - 1];
                out.done = await reorder(P, last, g0[0], 'Done', 'o-02-reorder-done');
                out.after = await readAll('after');
                await as(U('p', 'mg'), P);
                await openTab(P);
                const g1 = titles(await readGrid());
                out.cancel = await reorder(P, g1[g1.length - 1], g1[0], 'Cancel ordering', 'o-03-reorder-cancel');
                out.restore = await reorder(P, g1[0], g1[g1.length - 1], 'Done', 'o-04-reorder-restore');
            }
            S.orderedOnce = true; save();
            await visitor();
            fact('order', out);
        });

        // ================================================================== ompseq {OMP}: the series list's order before any order is saved (td7)
        if (on('ompseq') && isOMP) await sect('ompseq', async () => {
            const out = {reads: []};
            if (!S.Q) {
                const r = await app.api.createContext({tag: `${t}q`, context: {name: `U17 K2 seq ${t}`, acronym: 'KSEQ'}, users: [{username: `${t}qmg`, roles: ['manager'], givenName: 'Quin', familyName: 'Manager'}]});
                S.Q = {path: r.path || `${t}q`}; save();
            }
            const Q = S.Q.path;
            await as(`${t}qmg`, Q);
            await openTab(Q);
            if (!S.Q.made) {
                for (const [name, p] of [['Kilo', 'kilo'], ['Bravo', 'bravo'], ['Yankee', 'yankee'], ['Echo', 'echo']]) {
                    await openCreate(); await fillTitle(name); await form().locator('input[name="path"]').fill(p);
                    const r = await pressSave(`q-save-${p}`);
                    out.reads.push({after: `add ${name}`, samePage: titles(r.grid)});
                }
                S.Q.made = true; save();
            }
            for (let i = 0; i < 4; i++) { await openTab(Q); out.reads.push({after: `reload ${i + 1}`, grid: titles(await readGrid())}); }
            // an unchanged Save on one row, then reloads
            const firstRow = titles(await readGrid())[0];
            await openEdit(firstRow);
            const r = await pressSave(`q-save-${firstRow.toLowerCase()}-unchanged`);
            out.reads.push({after: `${firstRow} (the first row) saved unchanged`, samePage: titles(r.grid)});
            for (let i = 0; i < 2; i++) { await openTab(Q); out.reads.push({after: `reload after save ${i + 1}`, grid: titles(await readGrid())}); }
            await snap('q-grid-end', {reads: out.reads}, {png: true});
            await visitor();
            fact(`ompseq-${Date.now()}`, out);
        });

        // ================================================================== inactive: Rule 5, Settings 1, OMP5, side effects
        if (on('inactive')) await sect('inactive', async () => {
            const out = {};
            if (!isOMP) {
                const C = S.C.path;
                const users = ['mg', 'au', 'se', 's2', 'rd'].map((k) => U('c', k));
                out.mailBefore = await mailCounts(users);
                await as(U('c', 'mg'), C);
                out.logBefore = await activityLog(C, S.C.subs.g.id, 'i-00-activity-log-before');
                await openTab(C);
                out.cancel = await pressBox(C, 'Alpha', 'Cancel', 'i-01-alpha-box-cancel');
                out.deactivate = await pressBox(C, 'Alpha', 'OK', 'i-02-alpha-deactivate');
                const gName = S.renamed ? 'Gamma Renamed' : 'Gamma';
                out.deactivateGamma = await pressBox(C, gName, 'OK', 'i-03-gamma-deactivate');
                // 5a: the start form per level; the draft in Alpha
                for (const k of ['au', 'se', 'mg']) { await as(U('c', k), C); out[`start_${k}`] = await startFormChoices(C, `i-04-start-form-${k}`); }
                await as(U('c', 'au'), C);
                const st = await go(cu(C, `/submission?id=${S.C.subs.a.id}`));
                await sleep(1000);
                out.draftAlpha = {status: st, url: strip(page.url()), h1: flat(await page.locator('h1').first().innerText().catch(() => null), 200),
                    main: flat(await page.locator('main, .pkp_structure_main, body').first().innerText().catch(() => ''), 800)};
                await snap('i-05-draft-in-inactive-section', {facts: out.draftAlpha}, {png: true});
                // 5b: the dashboard filter, the publication page's list
                await as(U('c', 'mg'), C);
                out.filter = (await dashboardFilter(C, 'i-06-dashboard-filter')).sets;
                out.pubListB = (await publicationList(C, S.C.subs.b.id, 'i-07-publication-list-beta')).fields;
                out.pubListG = (await publicationList(C, S.C.subs.g.id, 'i-08-publication-list-gamma')).fields;
                // 5b {OPS}: the inactive section's own page; 5c: the published item where it was
                await visitor();
                if (isOPS) {
                    out.sectionPageAlpha = await reader(cu(C, '/preprints/section/alpha'), 'i-09-section-page-alpha');
                    out.sectionPageGamma = await reader(cu(C, '/preprints/section/gamma'), 'i-10-section-page-gamma');
                    out.archives = (await reader(cu(C, '/preprints'), 'i-11-archives')).items;
                    out.preprint = await reader(cu(C, `/preprint/view/${S.C.subs.g.id}`), 'i-12-preprint-page');
                } else {
                    out.issue = await reader(cu(C, `/issue/view/${S.C.issues[0].id}`), 'i-11-issue-toc');
                    out.article = await reader(cu(C, `/article/view/${S.C.subs.g.id}`), 'i-12-article-page');
                }
                // 5d: the Submissions page per level
                out.submissionsVisitor = await submissionsPage(C, 'i-13-submissions-visitor');
                for (const k of ['rd', 'au', 'se', 'mg']) { await as(U('c', k), C); out[`submissions_${k}`] = await submissionsPage(C, `i-14-submissions-${k}`); }
                // activation: the question, OK unticks
                await as(U('c', 'mg'), C);
                out.logAfter = await activityLog(C, S.C.subs.g.id, 'i-15-activity-log-after');
                await openTab(C);
                out.activate = await pressBox(C, 'Alpha', 'OK', 'i-16-alpha-activate');
                out.activateGamma = await pressBox(C, gName, 'OK', 'i-17-gamma-activate');
                // Settings 1: the window's box does the same on Save (and back)
                await openEdit('Alpha');
                out.windowBoxBefore = (await readForm()).fields.filter((f) => f.name === 'isInactive');
                await form().locator('input[name="isInactive"]').check();
                out.windowDeactivate = await pressSave('i-18-window-deactivate');
                await openTab(C);
                out.windowDeactivateReload = boxOf(await readGrid(), 'Alpha');
                await openEdit('Alpha');
                out.windowBoxReopened = (await readForm()).fields.filter((f) => f.name === 'isInactive');
                await form().locator('input[name="isInactive"]').uncheck();
                out.windowActivate = await pressSave('i-19-window-activate');
                await openTab(C);
                out.windowActivateReload = boxOf(await readGrid(), 'Alpha');
                out.mailAfter = await mailCounts(users);
                out.inboxes = {};
                for (const u2 of users) out.inboxes[u2] = await inbox(u2);
            } else {
                const P = S.P.path;
                const users = ['mg', 'au', 'se', 'rd'].map((k) => U('p', k));
                out.mailBefore = await mailCounts(users);
                await as(U('p', 'mg'), P);
                await openTab(P);
                out.cancel = await pressBox(P, 'First', 'Cancel', 'i-01-first-box-cancel');
                out.deactivate = await pressBox(P, 'First', 'OK', 'i-02-first-deactivate');
                await as(U('p', 'au'), P);
                out.wizardAu = await ompWizardSeries(P, S.P.subs.d.id, 'i-04-wizard-series-author');
                await as(U('p', 'mg'), P);
                out.wizardMg = await ompWizardSeries(P, S.P.subs.dm.id, 'i-04-wizard-series-manager');
                out.entry = (await publicationList(P, S.P.subs.s.id, 'i-07-catalog-entry-list')).fields;
                await visitor();
                out.seriesPage = await reader(cu(P, '/catalog/series/first'), 'i-09-series-page-first');
                out.book = await reader(cu(P, `/catalog/book/${S.P.subs.p.id}`), 'i-12-book-page');
                out.catalog = flat((await reader(cu(P, '/catalog'), 'i-11-catalog')).text, 600);
                await as(U('p', 'mg'), P);
                await openTab(P);
                out.activate = await pressBox(P, 'First', 'OK', 'i-16-first-activate');
                await openEdit('First');
                await form().locator('input[name="isInactive"]').check();
                out.windowDeactivate = await pressSave('i-18-window-deactivate');
                await openTab(P);
                out.windowDeactivateReload = boxOf(await readGrid(), 'First');
                await openEdit('First');
                await form().locator('input[name="isInactive"]').uncheck();
                out.windowActivate = await pressSave('i-19-window-activate');
                await openTab(P);
                out.windowActivateReload = boxOf(await readGrid(), 'First');
                out.mailAfter = await mailCounts(users);
            }
            await visitor();
            fact('inactive', out);
        });

        // ================================================================== last: Rule 6 (the last active section), 7b; an inactive empty section deleted
        if (on('last')) await sect('last', async () => {
            const out = {};
            if (!isOMP) {
                const N = S.N.path;
                await as(U('n', 'mg'), N);
                await openTab(N);
                out.nBox = await pressBox(N, DEF, 'OK', 'x-01-only-section-box');
                await openEdit(DEF);
                await form().locator('input[name="isInactive"]').check();
                out.nWindow = await pressSave('x-02-only-section-window');
                await cancelWindow();
                await openTab(N);
                out.nWindowReload = boxOf(await readGrid(), DEF);
                out.nDelete = await pressDelete(N, DEF, 'OK', 'x-03-only-section-delete');
                const L = S.L.path;
                await as(U('l', 'mg'), L);
                await openTab(L);
                if (S.L.shutDeleted) {
                    out.note = 'Shut already deleted in an earlier run';
                } else {
                    out.shut = await pressBox(L, 'Shut', 'OK', 'x-04-shut-deactivate');
                }
                out.openBox = await pressBox(L, 'Open', 'OK', 'x-05-last-active-box');
                await openEdit('Open');
                await form().locator('input[name="isInactive"]').check();
                out.openWindow = await pressSave('x-06-last-active-window');
                await cancelWindow();
                await openTab(L);
                out.openDelete = await pressDelete(L, 'Open', 'OK', 'x-07-last-active-delete');
                if (!S.L.shutDeleted) {
                    out.shutDelete = await pressDelete(L, 'Shut', 'OK', 'x-08-inactive-empty-delete');
                    S.L.shutDeleted = true; save();
                }
            } else {
                const N = S.N.path;
                await as(U('n', 'mg'), N);
                await openTab(N);
                out.grid0 = await readGrid();
                if (!S.N.gone) {
                    out.solo = await pressBox(N, 'Solo', 'OK', 'x-01-solo-deactivate');
                    out.duo = await pressBox(N, 'Duo', 'OK', 'x-02-duo-deactivate');
                    out.gridAllInactive = await readGrid();
                    out.soloWindowAsk = null;
                    out.delSolo = await pressDelete(N, 'Solo', 'OK', 'x-03-solo-delete');
                    out.delDuo = await pressDelete(N, 'Duo', 'OK', 'x-04-duo-delete');
                    S.N.gone = true; save();
                }
                out.gridEnd = await readGrid();
                await snap('x-05-no-series-left', {grid: out.gridEnd}, {png: true});
            }
            await visitor();
            fact('last', out);
        });

        // ================================================================== delete: Rule 7, side effects on deleting
        if (on('delete')) await sect('delete', async () => {
            const out = {};
            if (!isOMP) {
                const C = S.C.path;
                const users = ['mg', 'au', 'se', 's2', 'rd'].map((k) => U('c', k));
                out.mailBefore = await mailCounts(users);
                await as(U('c', 'mg'), C);
                await openTab(C);
                out.grid0 = await readGrid();
                const gName = S.renamed ? 'Gamma Renamed' : 'Gamma';
                out.cancelAlpha = await pressDelete(C, 'Alpha', 'Cancel', 'd-01-alpha-cancel');
                out.draftAlpha = await pressDelete(C, 'Alpha', 'OK', 'd-02-alpha-draft');
                out.submittedBeta = await pressDelete(C, 'Beta', 'OK', 'd-03-beta-submitted');
                out.publishedGamma = await pressDelete(C, gName, 'OK', 'd-04-gamma-published');
                if (!S.C.deleted) {
                    out.emptyDelta = await pressDelete(C, 'Delta', 'OK', 'd-05-delta-empty');
                    out.epsDeactivate = await pressBox(C, 'Epsilon', 'OK', 'd-06-epsilon-deactivate');
                    out.inactiveEpsilon = await pressDelete(C, 'Epsilon', 'OK', 'd-07-epsilon-inactive-empty');
                    // move Beta's item on its publication page, then delete Beta
                    const pl = await publicationList(C, S.C.subs.b.id, 'd-08-publication-list-before-move');
                    out.moveList = pl.fields;
                    const sel = page.locator('[role="dialog"]:visible select[name="sectionId"]').first();
                    await sel.selectOption({label: 'Created'});
                    const w = page.waitForResponse((r) => /\/publications\/\d+/.test(r.url()) && r.request().method() !== 'GET', {timeout: 15_000}).catch(() => null);
                    await sel.locator('xpath=ancestor::form[1]').getByRole('button', {name: 'Save', exact: true}).last().click();
                    const r = await w; await idle(page); await sleep(1200);
                    out.moveSave = {status: r ? r.status() : null, status2: (await page.locator('[role=status]').allInnerTexts().catch(() => [])).map((x) => flat(x, 80)).filter(Boolean),
                        errors: (await page.locator('.pkpFieldError, .pkpFormErrors').allInnerTexts().catch(() => [])).map((x) => flat(x, 160))};
                    await snap('d-09-moved', {save: out.moveSave});
                    out.afterMove = (await publicationList(C, S.C.subs.b.id, 'd-10-publication-list-after-move')).fields;
                    await openTab(C);
                    out.betaAfterMove = await pressDelete(C, 'Beta', 'OK', 'd-11-beta-after-move');
                    out.afterMoveAgain = (await publicationList(C, S.C.subs.b.id, 'd-12-publication-list-after-delete')).fields;
                    out.participantsB = await readParticipants(C, S.C.subs.b.id, 'd-13-beta-item-workflow');
                    // the deleted section's editorial assignment: a new "Delta" made on screen
                    await openTab(C);
                    await openCreate();
                    await fillTitle('Delta'); await form().locator('input[name="abbrev[en]"]').fill('DEL');
                    if (isOPS) await form().locator('input[name="path"]').fill('delta');
                    out.deltaAgainWindow = (await readForm()).fields.filter((f) => /subEditors|assign/i.test(f.name + f.label) && f.checked);
                    out.deltaAgain = await pressSave('d-14-delta-again');
                    S.C.deleted = true; save();
                }
                out.mailAfter = await mailCounts(users);
            } else {
                const P = S.P.path;
                await as(U('p', 'mg'), P);
                await openTab(P);
                out.grid0 = await readGrid();
                const sName = S.renamed ? 'The Second Renamed' : 'Second';
                out.cancel = await pressDelete(P, 'First', 'Cancel', 'd-01-first-cancel');
                out.publishedFirst = await pressDelete(P, 'First', 'OK', 'd-02-first-published');
                out.submittedSecond = await pressDelete(P, sName, 'OK', 'd-03-second-submitted');
                out.draftSeries = null;
                if (!S.P.deleted) {
                    // a draft in Third: the author's draft put in Third through its wizard would need the wizard; a draft seeded in Third instead
                    const r = await app.api.createSubmission({tag: `${t}p3`, context: P, submitter: U('p', 'au'), title: 'K2 Draft in Third', series: 'third', submitted: false});
                    S.P.subs.t = {id: r.submissionId}; save();
                    await openTab(P);
                    out.draftThird = await pressDelete(P, 'Third', 'OK', 'd-04-third-draft');
                    await openCreate(); await fillTitle('Empty'); await form().locator('input[name="path"]').fill('empty');
                    out.saveEmpty = await pressSave('d-05-save-empty');
                    await openTab(P);
                    out.emptyDelete = await pressDelete(P, 'Empty', 'OK', 'd-06-empty-delete');
                    S.P.deleted = true; save();
                }
            }
            await visitor();
            fact('delete', out);
        });

        // ================================================================== move {OJS}: an article moved on its "Publication Settings" page, then its old section deleted (7a)
        if (on('move') && isOJS) await sect('move', async () => {
            const out = {};
            const C = S.C.path;
            await as(U('c', 'mg'), C);
            const pl = await publicationList(C, S.C.subs.b.id, 'm-01-publication-settings-before-move');
            out.before = pl.fields;
            const dlg = page.locator('[role="dialog"]:visible').first();
            const sel = dlg.locator('select[name="sectionId"]').first();
            await sel.selectOption({label: 'Created'});
            const formL = sel.locator('xpath=ancestor::form[1]');
            out.radios = await formL.locator('input[type=radio]').evaluateAll((els) => els.map((r) => ({name: r.name, checked: r.checked, label: ((r.closest('label') || {}).innerText || '').trim()})));
            const saveOnce = async (k) => {
                const w = page.waitForResponse((r) => /\/publications\/\d+/.test(r.url()) && r.request().method() !== 'GET', {timeout: 15_000}).catch(() => null);
                await formL.getByRole('button', {name: 'Save', exact: true}).last().click();
                const r = await w; await idle(page); await sleep(1200);
                const o = {status: r ? r.status() : null, formStatus: (await page.locator('[role=status]').allInnerTexts().catch(() => [])).map((x) => flat(x, 80)).filter(Boolean),
                    errors: [...new Set((await formL.locator('.pkpFieldError, .pkpFormErrors, .pkpFormPage__status').allInnerTexts().catch(() => [])).map((x) => flat(x, 160)).filter(Boolean))]};
                await snap(k, {save: o}, {png: true});
                return o;
            };
            out.first = await saveOnce('m-02-save-section-only');
            if (!out.first.status) {
                const dont = formL.getByRole('radio', {name: /Don't Assign To An Issue/}).first();
                if (await dont.count()) { await dont.check(); out.retriedWith = "Don't Assign To An Issue"; out.second = await saveOnce('m-03-save-with-issue-answer'); }
            }
            out.afterMove = (await publicationList(C, S.C.subs.b.id, 'm-04-publication-settings-after-move')).fields;
            await openTab(C);
            out.deleteBeta = await pressDelete(C, 'Beta', 'OK', 'm-05-beta-delete-after-move');
            out.afterDelete = (await publicationList(C, S.C.subs.b.id, 'm-06-publication-settings-after-delete')).fields;
            out.participants = await readParticipants(C, S.C.subs.b.id, 'm-07-beta-item-workflow');
            await visitor();
            fact('move', out);
        });

        // ================================================================== move2 {OJS}: a second submitted, unscheduled article moved (the refusal read again)
        if (on('move2') && isOJS && S.aa) await sect('move2', async () => {
            const out = {};
            const C = S.C.path;
            await as(U('c', 'mg'), C);
            const pl = await publicationList(C, S.aa.id, 'm2-01-publication-settings-before');
            out.before = pl.fields;
            const dlg = page.locator('[role="dialog"]:visible').first();
            const sel = dlg.locator('select[name="sectionId"]').first();
            const target = (pl.fields[0].selected === 'Delta') ? 'Created Two' : 'Delta';
            await sel.selectOption({label: target});
            const formL = sel.locator('xpath=ancestor::form[1]');
            out.radios = await formL.locator('input[type=radio]').evaluateAll((els) => els.map((r) => ({checked: r.checked, label: ((r.closest('label') || {}).innerText || '').trim()})));
            const w = page.waitForResponse((r) => /\/publications\/\d+/.test(r.url()) && r.request().method() !== 'GET', {timeout: 10_000}).catch(() => null);
            await formL.getByRole('button', {name: 'Save', exact: true}).last().click();
            const r = await w; await idle(page); await sleep(1200);
            out.first = {status: r ? r.status() : null, errors: [...new Set((await formL.locator('.pkpFieldError, .pkpFormErrors').allInnerTexts().catch(() => [])).map((x) => flat(x, 160)).filter(Boolean))]};
            await snap('m2-02-save-section-only', {save: out.first}, {png: true});
            out.after = (await publicationList(C, S.aa.id, 'm2-03-publication-settings-after')).fields;
            await visitor();
            fact('move2', out);
        });

        // ================================================================== ompmove {OMP}: books moved on their "Catalog Entry" page's "Series" list, then the series deleted (7a)
        if (on('ompmove') && isOMP) await sect('ompmove', async () => {
            const out = {};
            const P = S.P.path;
            await as(U('p', 'mg'), P);
            for (const [k, sid] of [['s', S.P.subs.s.id], ['aa', S.aa && S.aa.id]]) {
                if (!sid) continue;
                const pl = await publicationList(P, sid, `v-01-catalog-entry-before-${k}`);
                const dlg = page.locator('[role="dialog"]:visible').first();
                const sel = dlg.locator('select[name="seriesId"]').first();
                await sel.selectOption({label: 'Zulu'});
                const formL = sel.locator('xpath=ancestor::form[1]');
                const w = page.waitForResponse((r) => /\/publications\/\d+/.test(r.url()) && r.request().method() !== 'GET', {timeout: 15_000}).catch(() => null);
                await formL.getByRole('button', {name: 'Save', exact: true}).last().click();
                const r = await w; await idle(page); await sleep(1200);
                const o = {before: pl.fields, status: r ? r.status() : null, formStatus: (await page.locator('[role=status]').allInnerTexts().catch(() => [])).map((x) => flat(x, 80)).filter(Boolean),
                    errors: [...new Set((await formL.locator('.pkpFieldError, .pkpFormErrors').allInnerTexts().catch(() => [])).map((x) => flat(x, 160)).filter(Boolean))]};
                await snap(`v-02-catalog-entry-saved-${k}`, {save: o}, {png: true});
                o.after = (await publicationList(P, sid, `v-03-catalog-entry-after-${k}`)).fields;
                out[k] = o;
            }
            await openTab(P);
            out.deleteSecond = await pressDelete(P, 'The Second Renamed', 'OK', 'v-04-second-delete-after-move');
            await visitor();
            fact('ompmove', out);
        });

        // ================================================================== sweep: the table's other controls while ordering; a dragged order left unsaved through another tab
        if (on('sweep')) await sect('sweep', async () => {
            const out = {};
            const ctx = isOMP ? S.P.path : S.O.path;
            await as(isOMP ? U('p', 'mg') : U('o', 'mg'), ctx);
            await openTab(ctx);
            const g0 = titles(await readGrid());
            out.g0 = g0;
            const order = grid().getByRole('link', {name: 'Order', exact: true}).first();
            // (1) "Order" pressed a second time while ordering
            await order.click(); await sleep(800);
            const t0 = Date.now();
            await order.click().catch((e) => { out.orderAgainErr = flat(e.message, 200); });
            await sleep(1200);
            out.orderAgain = {controls: await grid().locator('a:visible, button:visible').evaluateAll((els) => els.map((e) => (e.innerText || '').replace(/\s+/g, ' ').trim()).filter(Boolean)).catch(() => []),
                dialogs: await page.locator('[role="dialog"]:visible').count(), failed: since(bad, t0)};
            await snap('w-01-order-pressed-twice', {res: out.orderAgain}, {png: true});
            // (2) the "Inactive" box pressed while ordering
            const t1 = Date.now();
            const box = rowOf(g0[0]).locator('input[type=checkbox]').first();
            out.boxWhileOrdering = {visible: await box.isVisible().catch(() => false), enabled: await box.isEnabled().catch(() => false)};
            if (out.boxWhileOrdering.visible) {
                await box.click({timeout: 5000}).catch((e) => { out.boxWhileOrdering.err = flat(e.message, 200); });
                await sleep(1200);
                out.boxWhileOrdering.ask = await page.locator('[role="dialog"]:visible').count() ? await readTop() : null;
                if (out.boxWhileOrdering.ask) await top().getByRole('button', {name: 'Cancel', exact: true}).first().click().catch(() => {});
                await sleep(800);
                out.boxWhileOrdering.failed = since(bad, t1);
            }
            await snap('w-02-box-while-ordering', {res: out.boxWhileOrdering}, {png: true});
            // (3) "Create Section" / "Add Series" pressed while ordering
            const t2 = Date.now();
            await grid().getByRole('link', {name: isOMP ? /Add Series/ : /Create Section/}).first().click().catch((e) => { out.createErr = flat(e.message, 200); });
            await sleep(2000);
            out.createWhileOrdering = {formOpen: await form().isVisible().catch(() => false), failed: since(bad, t2)};
            await snap('w-03-create-while-ordering', {res: out.createWhileOrdering}, {png: true});
            if (out.createWhileOrdering.formOpen) await cancelWindow();
            // (4) a row dragged, then another tab pressed without "Done"
            await openTab(ctx);
            await order.click(); await sleep(800);
            const rows = titles(await readGrid());
            const src = rowOf(rows[1]); const dst = rowOf(rows[0]);
            const sb = await src.boundingBox(); const tb = await dst.boundingBox();
            await page.mouse.move(sb.x + 40, sb.y + sb.height / 2); await page.mouse.down();
            await page.mouse.move(sb.x + 40, sb.y + sb.height / 2 - 5, {steps: 5});
            await page.mouse.move(tb.x + 40, tb.y + 3, {steps: 20}); await sleep(300);
            await page.mouse.move(tb.x + 40, tb.y + 2, {steps: 2}); await page.mouse.up(); await sleep(700);
            out.dragged = titles(await readGrid());
            const t3 = Date.now();
            await page.getByRole('tab', {name: 'Masthead', exact: true}).first().click(); await sleep(1500); await idle(page);
            out.leaveTab = {dialogs: jsDialogs.filter((d) => d.at >= t3).map((d) => `${d.type}: ${d.message}`), url: strip(page.url())};
            await page.getByRole('tab', {name: TAB, exact: true}).first().click(); await sleep(1500); await idle(page);
            out.leaveTab.backOnTab = titles(await readGrid());
            out.leaveTab.stillOrdering = await grid().getByRole('link', {name: 'Done', exact: true}).first().isVisible().catch(() => false);
            await snap('w-04-back-on-tab', {res: out.leaveTab}, {png: true});
            await openTab(ctx);
            out.leaveTab.afterReload = titles(await readGrid());
            await visitor();
            fact('sweep', out);
        });

        // ================================================================== ompreach {OMP}: a renamed series on the reader pages of its published book (Rule 3)
        if (on('ompreach') && isOMP) await sect('ompreach', async () => {
            const out = {};
            const P = S.P.path;
            const bookSeries = async (k) => {
                await visitor();
                const b = await reader(cu(P, `/catalog/book/${S.P.subs.p.id}`), `r-${k}-book-page`);
                const sp = await reader(cu(P, '/catalog/series/first'), `r-${k}-series-page`);
                const cat = await reader(cu(P, '/catalog'), `r-${k}-catalog`);
                const series = await page.evaluate(() => [...document.querySelectorAll('a[href*="/catalog/series/"]')].map((a) => (a.innerText || '').trim()));
                return {bookTail: flat(b.text, 2000).split('Series').slice(-1)[0].slice(0, 120), seriesPageTitle: await page.title(), seriesPageH1: sp.h1, catalogSeriesLinks: series};
            };
            out.before = await bookSeries('before');
            await as(U('p', 'mg'), P);
            await openTab(P);
            const cur = S.firstRenamed ? 'First Renamed' : 'First';
            if (!S.firstRenamed) {
                await openEdit('First'); await fillTitle('First Renamed');
                out.save = (await pressSave('r-save-first-renamed')).notices;
                S.firstRenamed = true; save();
                out.after = await bookSeries('after');
            }
            fact('ompreach', out);
        });

        // ================================================================== assign: side effects on a submission arriving in a section with "Editorial Assignments"
        if (on('assign')) await sect('assign', async () => {
            const out = {};
            const ctxKey = isOMP ? 'p' : 'c';
            const C = isOMP ? S.P.path : S.C.path;
            const secKey = isOMP ? {series: 'second'} : {section: 'CR2'};
            if (!S.aa) {
                const r = await app.api.createSubmission({tag: `${t}aa`, context: C, submitter: U(ctxKey, 'au'), title: 'K2 Arriving in an assigned section', submitted: false, ...secKey});
                S.aa = {id: r.submissionId}; save();
            }
            const se = U(ctxKey, 'se');
            out.inboxBefore = await inbox(se);
            await as(U(ctxKey, 'au'), C);
            if (!S.aaSubmitted) {
                out.review = await wizardSubmitDraft(C, S.aa.id, `${t}aa`, 'a-01-submit');
                S.aaSubmitted = true; save();
            }
            await sleep(3000);
            out.inboxAfter = await inbox(se);
            await as(U(ctxKey, 'mg'), C);
            out.participants = await readParticipants(C, S.aa.id, 'a-02-participants');
            await as(se, C);
            await go(cu(C, '/dashboard/editorial?currentViewId=assigned-to-me'));
            await sleep(1500);
            out.seAssignedToMe = flat(await page.locator('main, #app-main').first().innerText().catch(() => ''), 800);
            await snap('a-03-section-editor-assigned-to-me', {text: out.seAssignedToMe});
            await visitor();
            fact('assign', out);
        });

        // ================================================================== twinorder {OPS}: the shared path's page under either order (OPS3, both ends)
        if (on('twinorder') && isOPS) await sect('twinorder', async () => {
            const out = {};
            const TT = S.T.path;
            await as(U('t', 'mg'), TT);
            await openTab(TT);
            const g = titles(await readGrid());
            out.orderBefore = g;
            out.swap = await reorder(TT, 'Twin', 'Preprints', 'Done', 't-01-twin-first');
            await visitor();
            out.pageTwinFirst = await reader(cu(TT, '/preprints/section/preprints'), 't-02-shared-path-twin-first');
            await as(U('t', 'mg'), TT);
            await openTab(TT);
            out.restore = await reorder(TT, 'Preprints', 'Twin', 'Done', 't-03-preprints-first-again');
            await visitor();
            out.pagePreprintsFirst = await reader(cu(TT, '/preprints/section/preprints'), 't-04-shared-path-preprints-first');
            fact('twinorder', out);
        });

        // ================================================================== paths: OPS3 (a shared and an odd section path) and the press's refusals
        if (on('paths')) await sect('paths', async () => {
            const out = {};
            if (isOPS) {
                const TT = S.T.path;
                await as(U('t', 'mg'), TT);
                await openTab(TT);
                if (!S.T.made) {
                    for (const [name, ab, p] of [['Twin', 'TWN', 'preprints'], ['Odd', 'ODD', 'a b/c']]) {
                        await openCreate(); await fillTitle(name);
                        await form().locator('input[name="abbrev[en]"]').fill(ab);
                        await form().locator('input[name="path"]').fill(p);
                        out[`save${name}`] = await pressSave(`p-01-save-${ab.toLowerCase()}`);
                        if (out[`save${name}`].windowOpen) await cancelWindow();
                        await openTab(TT);
                    }
                    const r = await app.api.createSubmission({tag: `${t}tw`, context: TT, submitter: U('t', 'au'), title: 'K2 Posted in Twin', section: 'TWN', published: true, datePublished: '2024-04-02'});
                    S.T.subs.w = {id: r.submissionId};
                    S.T.made = true; save();
                }
                out.grid = await readGrid();
                await openEdit('Odd');
                out.oddWindow = (await readForm()).fields.filter((f) => f.name === 'path');
                await cancelWindow();
                await visitor();
                out.shared = await reader(cu(TT, '/preprints/section/preprints'), 'p-02-shared-path-page');
                out.oddTyped = await reader(cu(TT, '/preprints/section/a b/c'), 'p-03-odd-path-typed');
                out.oddEnc = await reader(cu(TT, '/preprints/section/a%20b%2Fc'), 'p-04-odd-path-encoded');
                out.archives = (await reader(cu(TT, '/preprints'), 'p-05-archives')).items;
            } else if (isOMP) {
                const P = S.P.path;
                await as(U('p', 'mg'), P);
                await openTab(P);
                for (const [name, p] of [['Dup', 'first'], ['Odd', 'a b/c']]) {
                    await openCreate(); await fillTitle(name);
                    await form().locator('input[name="path"]').fill(p);
                    out[`save${name}`] = await pressSave(`p-01-save-${name.toLowerCase()}`);
                    if (out[`save${name}`].windowOpen) await cancelWindow();
                    await openTab(P);
                }
                out.grid = titles(await readGrid());
            } else {
                // OJS: the section window has no path (read-only control)
                await as(U('c', 'mg'), S.C.path);
                await openTab(S.C.path);
                await openCreate();
                out.ojsWindowFields = (await readForm()).fields.map((f) => f.name);
                await cancelWindow();
            }
            await visitor();
            fact('paths', out);
        });
    } finally {
        await close();
    }
});
