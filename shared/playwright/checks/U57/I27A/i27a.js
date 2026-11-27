// U57 claim check, incidental I27A: overlapping saves on Settings › Website › Setup › "Languages".
// Spec: docs/specs/U57-languages-and-locales.md — Rule 15a (331–333), Side effects' A6 sentence (441–442),
// register A6 (1086–1093) and its footnote f-a6, note i ("typed text survives the tick"); the incidentals row
// I27A (docs/tracking/incidentals.md, pkp/pkp-lib#13756).
//
//   PROBE_FEATURE=U57 PROBE_AGENT=ccI27A PROBE_RUN=r1 node bin/probe.js ojs shared/playwright/checks/U57/I27A/i27a.js
//   (then omp, ops; then the same with PROBE_RUN=r2). The three apps may run at once (separate servers);
//   two runs of one app may NOT (they share the app's two server processes and the race timing).
//   PHASES=seed,overlap,combo,a6,rdef,r15a,notei,leave   (default: all; rdef signs in as admin in both browsers). Every phase after seed reads the state file
//   outFile('i27a-state') (i27a-state-<run>-<app>.json), which seed writes; a new PROBE_RUN seeds new journals.
//   A run outlasts the Bash cap: start it in the background.
//
// The race needs two server processes: browser A on the probe server (base+50), browser B on the validation
// server (base+90), the same install (screen-notes, ccK2 GOTCHA). One browser on one php -S process never overlaps.
//
// Scratch contexts per app and run (tag prefix u57i27a):
//   O    en+fr_CA UI, en Forms; managers mga (browser A) and mgb (browser B)   overlap (the row), combo
//   P1   en+fr_CA UI, en Forms; manager mg (browser A)                          a6 (two journals at once)
//   P2   en+fr_CA UI, en Forms; manager mg (browser B)                          a6
//   S    en UI only; manager mg                                                 r15a ("Submissions" with "Metadata" unticked)
//   SC   en UI only; manager mg                                                 r15a control ("Metadata" ticked first)
//   N    en+fr_CA UI and Forms; manager mg                                      notei (typed / emptied French privacy)
// `publicknowledge` and the seeded users are not touched. No assertions: the script records, the reader judges.
const fs = require('fs');
const {forEachApp, launch, signIn, screen, shot, record, note, idle, tag, outFile, sql} = require('../../../probe');

const T = 30_000;
const ALL = ['seed', 'overlap', 'combo', 'a6', 'rdef', 'r15a', 'notei', 'leave'];
const PHASES = (process.env.PHASES || ALL.join(',')).split(',');
const on = (p) => PHASES.includes(p);
const log = (...a) => console.log('[i27a]', ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (s, n = 1500) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));
const SELECT_ALL = process.platform === 'darwin' ? 'Meta+A' : 'Control+A';
const SAVE_RE = /languages\/(manage-language-grid\/save-language-setting|submission-language-grid\/(save-language-setting|add-languages|set-default))/;

// page instrumentation: notices, browser dialogs, console errors, failed responses, the language saves with times
async function instrument(page) {
    const ev = {dialogs: [], errs: [], bad: [], saves: []};
    page.on('dialog', (d) => {
        ev.dialogs.push({at: Date.now(), type: d.type(), message: d.message().slice(0, 400)});
        d.accept().catch(() => {});
    });
    page.on('console', (m) => { if (m.type() === 'error') ev.errs.push({at: Date.now(), t: m.text().slice(0, 300)}); });
    page.on('pageerror', (e) => ev.errs.push({at: Date.now(), t: `pageerror: ${String(e.message).slice(0, 300)}`}));
    page.on('request', (r) => {
        if (r.method() === 'POST' && SAVE_RE.test(r.url())) {
            const s = {sent: Date.now(), u: r.url().replace(/^.*\/grid\/settings\/languages\//, '').replace(/csrfToken=[^&]+/, '').slice(0, 160)};
            ev.saves.push(s); r.__i27a = s;
        }
    });
    page.on('response', async (r) => {
        const s = r.request().__i27a;
        if (s) { s.done = Date.now(); s.status = r.status(); s.body = flat(await r.text().catch(() => ''), 300); }
        if (r.status() >= 400) ev.bad.push({at: Date.now(), s: r.status(), m: r.request().method(), u: r.url().replace(/^.*\/index\.php/, '').slice(0, 200)});
    });
    await page.context().addInitScript(() => {
        window.__notices = [];
        const seen = new WeakSet();
        const sweep = () => {
            document.querySelectorAll('.app__notifications *, .pkpNotification, .ui-pnotify, [role="alert"]').forEach((e) => {
                const t = (e.innerText || '').trim();
                if (t && !seen.has(e)) { seen.add(e); window.__notices.push({t: t.slice(0, 300), at: Date.now()}); }
            });
        };
        new MutationObserver(sweep).observe(document, {subtree: true, childList: true, characterData: true});
    });
    ev.since = async (t0) => ({
        notices: [...new Set(await page.evaluate((s) => (window.__notices || []).filter((n) => n.at >= s).map((n) => n.t), t0).catch(() => []))].filter((t) => !/^(Saving|Loading)/.test(t)),
        dialogs: ev.dialogs.filter((d) => d.at >= t0).map((d) => `${d.type}: ${d.message}`),
        errs: ev.errs.filter((d) => d.at >= t0).map((d) => d.t),
        bad: ev.bad.filter((d) => d.at >= t0).map((d) => `${d.s} ${d.m} ${d.u}`),
    });
    ev.savesSince = (t0) => ev.saves.filter((s) => s.sent >= t0).map((s) => ({...s}));
    return ev;
}

async function snap(page, name, extra = {}) {
    let s;
    try { s = await screen(page); } catch (e) { s = {url: page.url(), error: String(e.message).slice(0, 200)}; }
    Object.assign(s, extra);
    record(name, s);
    await shot(page, name).catch(() => {});
    return s;
}

// The journal's Languages tab (Settings › Website › Setup › Languages).
async function landLanguages(page, url) {
    await page.goto(url).catch(() => {});
    await idle(page).catch(() => {});
    const setup = page.locator('#setup-button').first();
    if (await setup.count() && (await setup.getAttribute('aria-selected').catch(() => null)) !== 'true') await setup.click().catch(() => {});
    const tab = page.locator('#languages-button').filter({visible: true}).first();
    if (await tab.count()) await tab.click().catch(() => {});
    await page.locator('#languageGridContainer .pkp_controllers_grid').first().waitFor({timeout: 20000}).catch(() => {});
    await page.locator('#submissionLanguageGridContainer .pkp_controllers_grid').first().waitFor({timeout: 20000}).catch(() => {});
    await idle(page).catch(() => {}); await sleep(400);
}
async function readGrids(page) {
    return page.evaluate(() => {
        const one = (c) => {
            if (!c) return null;
            return [...c.querySelectorAll('tbody tr.gridRow')].map((r) => {
                const code = r.id.replace(/^.*-row-/, '');
                const cells = [...r.querySelectorAll('input[type=checkbox], input[type=radio]')].map((b) => {
                    const k = (b.id.match(/-(contextPrimary|uiLocale|formLocale|defaultSubmissionLocale|submissionLocale|submissionMetadataLocale)/) || [])[1] || b.id;
                    return `${k}=${b.checked ? 'X' : '-'}`;
                });
                return `${code}[${cells.join(' ')}]`;
            }).join(' ');
        };
        return {site: one(document.querySelector('#languageGridContainer')), sub: one(document.querySelector('#submissionLanguageGridContainer'))};
    }).catch((e) => ({error: String(e.message).slice(0, 200)}));
}
const cellSel = (grid, code, col) => `#${grid === 'sub' ? 'submissionLanguageGridContainer' : 'languageGridContainer'} input[id^="select-cell-${code}-${col}"]`;
const waitSave = (page, timeout = 30000) => page.waitForResponse((r) => r.request().method() === 'POST' && SAVE_RE.test(r.url()), {timeout}).catch(() => null);

// Every TinyMCE editor on the page: id → text.
const editors = (page) => page.evaluate(() => {
    const m = window.tinymce; if (!m) return {};
    const out = {}; m.get().forEach((e) => { out[e.id] = (e.getContent() || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160); });
    return out;
}).catch(() => ({}));
async function openPrivacy(page, url) {
    await page.goto(url).catch(() => {}); await idle(page).catch(() => {});
    await page.locator('#setup-button').first().click().catch(() => {});
    await page.locator('#privacy-button').filter({visible: true}).first().click().catch(() => {});
    await idle(page).catch(() => {});
    await page.waitForFunction(() => window.tinymce && window.tinymce.get().some((e) => e.initialized), null, {timeout: 15000}).catch(() => {});
    await sleep(600);
    const frB = page.locator('#privacy .pkpFormLocales button, #privacy [class*="FormLocales"] button').filter({hasText: /French|Fran/}).first();
    const buttons = await page.locator('#privacy .pkpFormLocales button, #privacy [class*="FormLocales"] button').allInnerTexts().catch(() => []);
    if (await frB.count()) { await frB.click().catch(() => {}); await sleep(900); }
    const ed = await editors(page);
    return {localeButtons: buttons.map((b) => b.trim()), privacy: Object.fromEntries(Object.entries(ed).filter(([k]) => /privacyStatement/.test(k)))};
}

forEachApp(async (app) => {
    const RUN = process.env.PROBE_RUN || 'r0';
    const statePath = outFile('i27a-state') + '.json';
    const S = fs.existsSync(statePath) ? JSON.parse(fs.readFileSync(statePath, 'utf8')) : {};
    const save = () => fs.writeFileSync(statePath, JSON.stringify(S, null, 1));
    const fact = (k, v) => { record('i27a-facts', {[k]: v}, {merge: true}); log(`[${app.name} ${RUN} ${k}]`, JSON.stringify(v).slice(0, 3000)); };
    const CT = app.contextTables;
    const db = (id, names = ['supportedLocales', 'supportedFormLocales', 'supportedAddedSubmissionLocales', 'supportedSubmissionLocales', 'supportedSubmissionMetadataLocales']) =>
        sql(app, `select setting_name||'='||setting_value from ${CT.settings} where ${CT.id}=${id} and setting_name in (${names.map((n) => `'${n}'`).join(',')}) order by 1`)
            .split('\n').map((l) => l.replace(/^supported/, '').replace(/SubmissionLocales/, 'Sub').replace(/SubmissionMetadataLocales/, 'Meta')).join(' ');
    const dbPriv = (id) => sql(app, `select locale||'='||left(coalesce(setting_value,'<null>'),60) from ${CT.settings} where ${CT.id}=${id} and setting_name='privacyStatement' order by 1`).split('\n').join(' | ');

    // ------------------------------------------------------------------ seed
    if (on('seed') && !S.seeded) {
        const t = tag('u57i27a');
        S.t = t;
        const mk = async (k, spec) => {
            const p = `${t}${k}`;
            const r = await app.api.createContext({tag: p, ...spec(p)});
            return {path: r.path || p, id: r.contextId || r.id};
        };
        const base = (p, name) => ({name: `U57 I27A ${name} ${p}`, acronym: 'IAA', contactName: 'I27A Contact', contactEmail: `${p}c@mail.test`});
        const mg = (p, sfx = 'mg', gn = 'Mia') => ({username: `${p}${sfx}`, roles: ['manager'], givenName: gn, familyName: 'Manager'});
        const bi = {supportedLocales: ['en', 'fr_CA']};
        S.O = await mk('o', (p) => ({context: {...base(p, 'O'), ...bi}, users: [mg(p, 'mga', 'Ana'), mg(p, 'mgb', 'Bea')]}));
        S.O.u = {a: `${S.O.path}mga`, b: `${S.O.path}mgb`};
        for (const k of ['P1', 'P2']) { S[k] = await mk(k.toLowerCase(), (p) => ({context: {...base(p, k), ...bi}, users: [mg(p)]})); S[k].u = {mg: `${S[k].path}mg`}; }
        for (const k of ['S', 'SC']) { S[k] = await mk(k.toLowerCase(), (p) => ({context: {...base(p, k), supportedLocales: ['en']}, users: [mg(p)]})); S[k].u = {mg: `${S[k].path}mg`}; }
        S.N = await mk('n', (p) => ({context: {...base(p, 'N'), ...bi, supportedFormLocales: ['en', 'fr_CA']}, users: [mg(p)]}));
        S.N.u = {mg: `${S.N.path}mg`};
        S.seeded = true; save(); record('seed', S);
        log('seeded', JSON.stringify(S));
    }
    if (!S.seeded) { log('no state; run seed first'); return; }

    const v2 = app.variant('validation');
    const app2 = {...app, baseURL: v2, url: (pp) => `${v2}${pp}`};
    const lang = (ctx) => app.url(`/index.php/${ctx}/en/management/settings/website`);
    const lang2 = (ctx) => app2.url(`/index.php/${ctx}/en/management/settings/website`);
    const A = await launch(app);
    const evA = await instrument(A.page);
    let B = null; let evB = null;
    const openB = async () => { if (!B) { B = await launch(app2); evB = await instrument(B.page); } };
    const pa = () => A.page;
    const pb = () => B.page;
    async function sect(name, fn) {
        try { return await fn(); } catch (e) {
            log(`[${name} FAILED]`, String(e.stack || e).split('\n').slice(0, 4).join(' | '));
            fact(`${name}.FAILED`, String(e.message || e).slice(0, 600));
            await snap(pa(), `zz-failed-${name}`).catch(() => {});
            return null;
        }
    }
    // one press on a grid box, waited out
    const press = async (page, grid, code, col) => {
        const box = page.locator(cellSel(grid, code, col)).first();
        const w = waitSave(page);
        await box.click();
        const r = await w; await idle(page).catch(() => {}); await sleep(700);
        return {status: r && r.status(), checked: await page.locator(cellSel(grid, code, col)).first().isChecked().catch(() => null)};
    };
    const ensure = async (page, grid, code, col, want) => {
        const box = page.locator(cellSel(grid, code, col)).first();
        if (!(await box.count())) return 'absent';
        if ((await box.isChecked()) !== want) return press(page, grid, code, col);
        return 'as-is';
    };
    // "Add/Remove Languages": open, set fr_CA, optionally save
    const openAdd = async (page) => {
        await page.locator('#submissionLanguageGridContainer .header a[id*="addLanguageModal"]').first().click();
        const f = page.locator('form#addLanguageForm').first();
        await f.waitFor({timeout: T}); await idle(page).catch(() => {}); await sleep(500);
        return f;
    };
    const setFr = async (f, want) => {
        const b = f.locator('input[type=checkbox][value="fr_CA"]').first();
        if ((await b.isChecked()) !== want) await b.click();
    };
    const addRemove = async (page, want) => {
        const f = await openAdd(page);
        await setFr(f, want);
        const w = waitSave(page);
        await f.getByRole('button', {name: 'Save', exact: true}).first().click();
        const r = await w; await idle(page).catch(() => {}); await sleep(1200);
        return r && r.status();
    };
    const hasFrSub = async (page) => (await page.locator('#submissionLanguageGridContainer tr.gridRow[id$="-row-fr_CA"]').count()) > 0;

    try {
        // ============================================================ overlap: the row — "Forms" tick (A) with "Add/Remove Languages" › Save (B), same journal
        if (on('overlap')) await sect('overlap', async () => {
            await openB();
            const O = S.O;
            await signIn(pa(), O.u.a, {contextPath: O.path}); await idle(pa()).catch(() => {});
            await signIn(pb(), O.u.b, {contextPath: O.path}); await idle(pb()).catch(() => {});
            const out = {rounds: []};
            const reset = async () => {
                await landLanguages(pa(), lang(O.path));
                await ensure(pa(), 'site', 'fr_CA', 'formLocale', false);
                await landLanguages(pb(), lang2(O.path));
                if (await hasFrSub(pb())) await addRemove(pb(), false);
                await landLanguages(pa(), lang(O.path)); await landLanguages(pb(), lang2(O.path));
                return db(O.id);
            };
            const round = async (label, delay) => {
                const before = await reset();
                const f = await openAdd(pb());
                await setFr(f, true);
                const saveBtn = f.getByRole('button', {name: 'Save', exact: true}).first();
                const t0 = Date.now();
                const wa = waitSave(pa()); const wb = waitSave(pb());
                const clickA = pa().locator(cellSel('site', 'fr_CA', 'formLocale')).first().click();
                if (delay === 'seq') { await clickA; await wa; } else { await sleep(Math.round(delay * 1000)); }
                await saveBtn.click();
                await Promise.all([clickA, wa, wb]);
                await idle(pa()).catch(() => {}); await idle(pb()).catch(() => {}); await sleep(1500);
                const sa = evA.savesSince(t0); const sb = evB.savesSince(t0);
                const r = {label, delay, before,
                    a: sa.map((s) => ({u: s.u.slice(0, 70), sentMs: s.sent - t0, durMs: s.done - s.sent, status: s.status, body: s.body.slice(0, 120)})),
                    b: sb.map((s) => ({u: s.u.slice(0, 70), sentMs: s.sent - t0, durMs: s.done - s.sent, status: s.status, body: s.body.slice(0, 120)})),
                    aSame: await readGrids(pa()), bSame: await readGrids(pb()),
                    aEv: await evA.since(t0), bEv: await evB.since(t0), dbAfter: db(O.id)};
                await snap(pa(), `ov-${label}-a-same`, {round: r}); await snap(pb(), `ov-${label}-b-same`, {round: r});
                await landLanguages(pa(), lang(O.path)); await landLanguages(pb(), lang2(O.path));
                r.aReload = await readGrids(pa()); r.bReload = await readGrids(pb());
                await snap(pa(), `ov-${label}-a-reload`, {grids: r.aReload}); await snap(pb(), `ov-${label}-b-reload`, {grids: r.bReload});
                const aS = sa.find((s) => /save-language-setting/.test(s.u)); const bS = sb.find((s) => /add-languages/.test(s.u));
                r.offsetMs = aS && bS ? bS.sent - aS.sent : null;
                r.overlapMs = aS && bS ? Math.min(aS.done, bS.done) - Math.max(aS.sent, bS.sent) : null;
                r.lost = /FormLocales=\["en"\]/.test(r.dbAfter) ? 'supportedFormLocales' : /AddedSub=\["en"\]/.test(r.dbAfter) ? 'supportedAddedSubmissionLocales' : 'none';
                out.rounds.push(r);
                log(`[${app.name} ${RUN} overlap ${label}]`, `offset=${r.offsetMs} a=${JSON.stringify(r.a.map((x) => [x.status, x.durMs]))} b=${JSON.stringify(r.b.map((x) => [x.status, x.durMs]))} lost=${r.lost} db=${r.dbAfter}`);
                return r;
            };
            const seq = await round('seq', 'seq');
            const dA = (seq.a.find((x) => /save-language-setting/.test(x.u)) || {}).durMs || 700;
            out.formsTickMs = dA;
            for (const d of [0.1, 0.3, 0.5]) await round(`d${String(d).replace('.', '')}`, d);
            for (const fr of [0.25, 0.6, 0.9]) await round(`f${String(fr).replace('.', '')}`, Math.round(dA * fr) / 1000);
            await round('d0', 0);
            await reset();
            fact('overlap', out);
        });

        // ============================================================ combo: "Forms" tick (A) and "Submissions" tick (B) of French at once, same journal
        if (on('combo')) await sect('combo', async () => {
            await openB();
            const O = S.O;
            await signIn(pa(), O.u.a, {contextPath: O.path}); await idle(pa()).catch(() => {});
            await signIn(pb(), O.u.b, {contextPath: O.path}); await idle(pb()).catch(() => {});
            const out = {rounds: []};
            for (let k = 1; k <= 3; k++) {
                await landLanguages(pa(), lang(O.path));
                await ensure(pa(), 'site', 'fr_CA', 'formLocale', false);
                await landLanguages(pb(), lang2(O.path));
                if (!(await hasFrSub(pb()))) await addRemove(pb(), true);
                await landLanguages(pb(), lang2(O.path));
                await ensure(pb(), 'sub', 'fr_CA', 'submissionMetadataLocale', false);
                await landLanguages(pa(), lang(O.path)); await landLanguages(pb(), lang2(O.path));
                const before = db(O.id);
                const t0 = Date.now();
                const wa = waitSave(pa()); const wb = waitSave(pb());
                await Promise.all([pa().locator(cellSel('site', 'fr_CA', 'formLocale')).first().click(), pb().locator(cellSel('sub', 'fr_CA', 'submissionLocale')).first().click()]);
                await Promise.all([wa, wb]); await idle(pa()).catch(() => {}); await idle(pb()).catch(() => {}); await sleep(1500);
                const r = {round: k, before,
                    a: evA.savesSince(t0).map((s) => ({u: s.u.slice(0, 70), sentMs: s.sent - t0, durMs: s.done - s.sent, status: s.status, body: s.body.slice(0, 160)})),
                    b: evB.savesSince(t0).map((s) => ({u: s.u.slice(0, 70), sentMs: s.sent - t0, durMs: s.done - s.sent, status: s.status, body: s.body.slice(0, 160)})),
                    aSame: await readGrids(pa()), bSame: await readGrids(pb()), aEv: await evA.since(t0), bEv: await evB.since(t0), dbAfter: db(O.id)};
                await snap(pa(), `cb-${k}-a-same`, {round: r}); await snap(pb(), `cb-${k}-b-same`, {round: r});
                await landLanguages(pa(), lang(O.path)); await landLanguages(pb(), lang2(O.path));
                r.aReload = await readGrids(pa()); r.bReload = await readGrids(pb());
                await snap(pa(), `cb-${k}-a-reload`, {grids: r.aReload});
                out.rounds.push(r);
                log(`[${app.name} ${RUN} combo ${k}]`, `a=${JSON.stringify(r.a.map((x) => [x.status, x.durMs]))} b=${JSON.stringify(r.b.map((x) => [x.status, x.durMs]))} db=${r.dbAfter}`);
            }
            fact('combo', out);
        });

        // ============================================================ a6: two journals tick French at once ("Forms", then "Submissions")
        if (on('a6')) await sect('a6', async () => {
            await openB();
            const [P1, P2] = [S.P1, S.P2];
            await signIn(pa(), P1.u.mg, {contextPath: P1.path}); await idle(pa()).catch(() => {});
            await signIn(pb(), P2.u.mg, {contextPath: P2.path}); await idle(pb()).catch(() => {});
            const out = {forms: [], subs: []};
            const both = async (kind, k, grid, col, resetCol) => {
                await landLanguages(pa(), lang(P1.path)); await landLanguages(pb(), lang2(P2.path));
                await ensure(pa(), grid, 'fr_CA', resetCol, false); await ensure(pb(), grid, 'fr_CA', resetCol, false);
                await ensure(pa(), grid, 'fr_CA', col, false); await ensure(pb(), grid, 'fr_CA', col, false);
                await landLanguages(pa(), lang(P1.path)); await landLanguages(pb(), lang2(P2.path));
                const t0 = Date.now();
                const wa = waitSave(pa()); const wb = waitSave(pb());
                await Promise.all([pa().locator(cellSel(grid, 'fr_CA', col)).first().click(), pb().locator(cellSel(grid, 'fr_CA', col)).first().click()]);
                const [ra, rb] = await Promise.all([wa, wb]); await idle(pa()).catch(() => {}); await idle(pb()).catch(() => {}); await sleep(1500);
                const r = {kind, round: k, sA: ra && ra.status(), sB: rb && rb.status(),
                    a: evA.savesSince(t0).map((s) => ({sentMs: s.sent - t0, durMs: s.done - s.sent, status: s.status, body: s.body.slice(0, 200)})),
                    b: evB.savesSince(t0).map((s) => ({sentMs: s.sent - t0, durMs: s.done - s.sent, status: s.status, body: s.body.slice(0, 200)})),
                    aChecked: await pa().locator(cellSel(grid, 'fr_CA', col)).first().isChecked().catch(() => null),
                    bChecked: await pb().locator(cellSel(grid, 'fr_CA', col)).first().isChecked().catch(() => null),
                    aEv: await evA.since(t0), bEv: await evB.since(t0), db1: db(P1.id), db2: db(P2.id)};
                const failed = r.sA >= 500 ? 'a' : r.sB >= 500 ? 'b' : null;
                if (failed || k === 1) { await snap(pa(), `a6-${kind}-${k}-a-same`, {round: r}); await snap(pb(), `a6-${kind}-${k}-b-same`, {round: r}); }
                await landLanguages(pa(), lang(P1.path)); await landLanguages(pb(), lang2(P2.path));
                r.aReload = await readGrids(pa()); r.bReload = await readGrids(pb());
                if (failed) {
                    const pg = failed === 'a' ? pa() : pb();
                    await snap(pg, `a6-${kind}-${k}-${failed}-reload`, {grids: failed === 'a' ? r.aReload : r.bReload});
                    const t1 = Date.now();
                    r.retick = await press(pg, grid, 'fr_CA', col);
                    r.retickEv = await (failed === 'a' ? evA : evB).since(t1);
                    await landLanguages(pg, failed === 'a' ? lang(P1.path) : lang2(P2.path));
                    r.retickReload = await readGrids(pg);
                    await snap(pg, `a6-${kind}-${k}-${failed}-retick-reload`, {retick: r.retick, grids: r.retickReload});
                }
                log(`[${app.name} ${RUN} a6 ${kind} ${k}]`, JSON.stringify({sA: r.sA, sB: r.sB, aChecked: r.aChecked, bChecked: r.bChecked, failed, aEv: r.aEv, bEv: r.bEv, retick: r.retick, reload: failed && (failed === 'a' ? r.aReload : r.bReload)}).slice(0, 900));
                return r;
            };
            for (let k = 1; k <= 4; k++) out.forms.push(await both('forms', k, 'site', 'formLocale', 'formLocale'));
            // French (Canada) onto both submission lists, then "Submissions" ticked on both at once ("Metadata" unticked before each round)
            await landLanguages(pa(), lang(P1.path)); if (!(await hasFrSub(pa()))) await addRemove(pa(), true);
            await landLanguages(pb(), lang2(P2.path)); if (!(await hasFrSub(pb()))) await addRemove(pb(), true);
            for (let k = 1; k <= 4; k++) out.subs.push(await both('subs', k, 'sub', 'submissionLocale', 'submissionMetadataLocale'));
            out.summary = {forms500: out.forms.filter((r) => r.sA >= 500 || r.sB >= 500).length, subs500: out.subs.filter((r) => r.sA >= 500 || r.sB >= 500).length};
            fact('a6', out);
        });

        // ============================================================ rdef: "Reload defaults" for French on P1 and P2 at once (f-a6: the same call), the Site Administrator in both browsers
        if (on('rdef')) await sect('rdef', async () => {
            await openB();
            const [P1, P2] = [S.P1, S.P2];
            await signIn(pa(), 'admin'); await idle(pa()).catch(() => {});
            await signIn(pb(), 'admin'); await idle(pb()).catch(() => {});
            const out = {rounds: []};
            const RE = /reload-locale|reloadLocale/;
            const openQ = async (page) => {
                await page.locator('#languageGridContainer tr.gridRow[id$="-row-fr_CA"] a.show_extras').first().click();
                await sleep(400);
                await page.locator('#languageGridContainer tr[id$="-row-fr_CA-control-row"] a').filter({hasText: 'Reload defaults'}).first().click();
                const d = page.getByRole('dialog', {name: 'Reload defaults'});
                await d.waitFor({timeout: T}); await sleep(500);
                return d;
            };
            for (let k = 1; k <= 4; k++) {
                await landLanguages(pa(), lang(P1.path)); await landLanguages(pb(), lang2(P2.path));
                await ensure(pa(), 'site', 'fr_CA', 'formLocale', true); await ensure(pb(), 'site', 'fr_CA', 'formLocale', true);
                await landLanguages(pa(), lang(P1.path)); await landLanguages(pb(), lang2(P2.path));
                const [da, dbq] = [await openQ(pa()), await openQ(pb())];
                const t0 = Date.now();
                const wa = pa().waitForResponse((r) => RE.test(r.url()), {timeout: T}).catch(() => null);
                const wb = pb().waitForResponse((r) => RE.test(r.url()), {timeout: T}).catch(() => null);
                await Promise.all([da.getByRole('button', {name: 'OK', exact: true}).click(), dbq.getByRole('button', {name: 'OK', exact: true}).click()]);
                const [ra, rb] = await Promise.all([wa, wb]); await idle(pa()).catch(() => {}); await idle(pb()).catch(() => {}); await sleep(1500);
                const r = {round: k, sA: ra && ra.status(), sB: rb && rb.status(), aEv: await evA.since(t0), bEv: await evB.since(t0),
                    aDialogOpen: await pa().getByRole('dialog', {name: 'Reload defaults'}).isVisible().catch(() => null),
                    bDialogOpen: await pb().getByRole('dialog', {name: 'Reload defaults'}).isVisible().catch(() => null)};
                if (k === 1 || (r.sA || 0) >= 500 || (r.sB || 0) >= 500) { await snap(pa(), `rd-${k}-a`, {round: r}); await snap(pb(), `rd-${k}-b`, {round: r}); }
                out.rounds.push(r);
                log(`[${app.name} ${RUN} rdef ${k}]`, JSON.stringify({sA: r.sA, sB: r.sB, nA: r.aEv.notices.slice(0, 1), nB: r.bEv.notices.slice(0, 1), dA: r.aEv.dialogs, dB: r.bEv.dialogs, open: [r.aDialogOpen, r.bDialogOpen]}));
            }
            out.summary = {r500: out.rounds.filter((r) => r.sA >= 500 || r.sB >= 500).length};
            fact('rdef', out);
        });

        // ============================================================ r15a: Rule 15a — "Submissions" ticks "Metadata"; the default texts fill only when "Metadata" was unticked
        if (on('r15a')) await sect('r15a', async () => {
            const out = {};
            const V = await launch(app);
            const visit = async (ctx, name) => {
                await V.page.goto(app.url(`/index.php/${ctx}/fr_CA/about/privacy`)).catch(() => {}); await idle(V.page).catch(() => {});
                const s = await snap(V.page, name);
                const m = (s.text && s.text.main) || ''; const i = m.lastIndexOf('confidentialité');
                return flat(i >= 0 ? m.slice(i + 'confidentialité'.length) : m, 300);
            };
            try {
                for (const [k, metaFirst] of [['S', false], ['SC', true]]) {
                    const X = S[k]; const o = {};
                    await signIn(pa(), X.u.mg, {contextPath: X.path}); await idle(pa()).catch(() => {});
                    await landLanguages(pa(), lang(X.path));
                    await snap(pa(), `r15-${k}-01-languages`, {grids: await readGrids(pa())});
                    o.ui = await press(pa(), 'site', 'fr_CA', 'uiLocale');
                    o.privDb0 = dbPriv(X.id);
                    o.pub0 = await visit(X.path, `r15-${k}-02-visitor-fr-privacy-before`);
                    await landLanguages(pa(), lang(X.path));
                    o.add = await addRemove(pa(), true);
                    await landLanguages(pa(), lang(X.path));
                    o.afterAdd = await readGrids(pa());
                    await snap(pa(), `r15-${k}-03-fr-added`, {grids: o.afterAdd});
                    if (metaFirst) {
                        const t0 = Date.now();
                        o.meta = {...(await press(pa(), 'sub', 'fr_CA', 'submissionMetadataLocale')), ...(await evA.since(t0)), same: await readGrids(pa())};
                        await snap(pa(), `r15-${k}-04-metadata-ticked-first`, {press: o.meta});
                        o.privDbMeta = dbPriv(X.id);
                    }
                    const t1 = Date.now();
                    o.sub = {...(await press(pa(), 'sub', 'fr_CA', 'submissionLocale')), ...(await evA.since(t1)), same: await readGrids(pa()),
                        metaCheckedSame: await pa().locator(cellSel('sub', 'fr_CA', 'submissionMetadataLocale')).first().isChecked().catch(() => null)};
                    await snap(pa(), `r15-${k}-05-submissions-ticked-same`, {press: o.sub});
                    await landLanguages(pa(), lang(X.path));
                    o.subReload = await readGrids(pa());
                    await snap(pa(), `r15-${k}-06-submissions-ticked-reload`, {grids: o.subReload});
                    o.db = db(X.id);
                    o.privDb1 = dbPriv(X.id);
                    o.pub1 = await visit(X.path, `r15-${k}-07-visitor-fr-privacy-after`);
                    out[k] = o;
                }
            } finally { await V.close(); }
            fact('r15a', out);
        });

        // ============================================================ notei: note i — a typed French text survives the tick; an emptied box
        if (on('notei')) await sect('notei', async () => {
            const N = S.N; const out = {};
            await signIn(pa(), N.u.mg, {contextPath: N.path}); await idle(pa()).catch(() => {});
            const typeFr = async (text, name) => {
                await openPrivacy(pa(), lang(N.path));
                const fr = pa().frameLocator('#privacy iframe[id*="privacyStatement-control-fr_CA"]').first().locator('body');
                await fr.click();
                await pa().keyboard.press(SELECT_ALL); await pa().keyboard.press('Delete');
                if (text) await fr.pressSequentially(text);
                const t0 = Date.now();
                const wr = pa().waitForResponse((r) => /\/api\/v1\/contexts\//.test(r.url()) && r.request().method() !== 'GET', {timeout: T}).catch(() => null);
                await pa().locator('#privacy').getByRole('button', {name: 'Save', exact: true}).first().click();
                const r = await wr; await sleep(1200);
                const o = {status: r && r.status(), ...(await evA.since(t0)), privacy: Object.fromEntries(Object.entries(await editors(pa())).filter(([kk]) => /privacyStatement/.test(kk))), db: dbPriv(N.id)};
                await snap(pa(), name, {typed: o});
                return o;
            };
            const readBack = async (name) => {
                const x = await openPrivacy(pa(), lang(N.path));
                x.db = dbPriv(N.id);
                await snap(pa(), name, {priv: x});
                return x;
            };
            const retickForms = async (name) => {
                await landLanguages(pa(), lang(N.path));
                const un = await press(pa(), 'site', 'fr_CA', 'formLocale');
                const t0 = Date.now();
                const re = await press(pa(), 'site', 'fr_CA', 'formLocale');
                const o = {untick: un, retick: re, ...(await evA.since(t0)), db: db(N.id)};
                await snap(pa(), name, {press: o});
                return o;
            };
            // typed end
            out.typed = await typeFr('Notre politique.', 'ni-01-fr-typed-saved');
            out.read0 = await readBack('ni-02-fr-typed-reload');
            out.forms = await retickForms('ni-03-forms-untick-retick');
            out.read1 = await readBack('ni-04-fr-after-forms-retick-reload');
            await landLanguages(pa(), lang(N.path));
            out.add = await addRemove(pa(), true);
            await landLanguages(pa(), lang(N.path));
            out.subTick = await press(pa(), 'sub', 'fr_CA', 'submissionLocale');
            await snap(pa(), 'ni-05-submissions-ticked', {press: out.subTick, grids: await readGrids(pa())});
            out.read2 = await readBack('ni-06-fr-after-submissions-tick-reload');
            // emptied end: the French box emptied and saved, then "Forms" unticked and ticked again
            out.emptied = await typeFr('', 'ni-07-fr-emptied-saved');
            out.read3 = await readBack('ni-08-fr-emptied-reload');
            out.forms2 = await retickForms('ni-09-forms-untick-retick-after-empty');
            out.read4 = await readBack('ni-10-fr-after-empty-retick-reload');
            fact('notei', out);
        });

        // ============================================================ leave: the Languages tab left with the "Add/Remove Languages" window changed and unsaved
        if (on('leave')) await sect('leave', async () => {
            const O = S.O; const out = {};
            await signIn(pa(), O.u.a, {contextPath: O.path}); await idle(pa()).catch(() => {});
            await landLanguages(pa(), lang(O.path));
            const before = db(O.id);
            const f = await openAdd(pa());
            await f.locator('input[type=checkbox][value="es"]').first().click().catch(() => {});
            await f.locator('input[type=checkbox][value="es"]').first().blur().catch(() => {});
            await snap(pa(), 'lv-01-window-changed');
            const t0 = Date.now();
            await pa().locator('#appearance-button').first().click().catch(() => {});
            await sleep(1200);
            out.otherTab = {...(await evA.since(t0)), windowOpen: await f.isVisible().catch(() => false)};
            await snap(pa(), 'lv-02-after-appearance-tab', {leave: out.otherTab});
            const t1 = Date.now();
            await pa().goto(app.url(`/index.php/${O.path}/en/management/settings/context`)).catch(() => {}); await idle(pa()).catch(() => {});
            out.leavePage = {...(await evA.since(t1)), url: pa().url().replace(/^https?:\/\/[^/]+/, '')};
            await snap(pa(), 'lv-03-after-leave', {leave: out.leavePage});
            out.dbBefore = before; out.dbAfter = db(O.id);
            fact('leave', out);
        });
    } finally {
        if (B) await B.close().catch(() => {});
        await A.close().catch(() => {});
    }
});
