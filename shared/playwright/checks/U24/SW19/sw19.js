// U24 claim check, chunk SW19: the housekeeping drift sweep of 2026-11-19, the whole spec
// (docs/specs/U24-workflow-screen-and-stage-access.md, Purpose to Cross-feature interactions, the
// scenarios' states and the register's live claims) driven on one scratch context per app and run.
//
// The kept checks that cover the rest (run beside this one in a sweep): I28 (review entry, the author's
// entry, no-number addresses, A5), I29 (French, the frame's dialogs, the second version), I30 fra/frb,
// H19 + issues/author-editor-editorial-view-refused (Rule 20), I34 + issues/recommending-editor-… (A14),
// issues/not-found-page-bare (A9), issues/press-identifiers-page-stays-after-plugin-off (OMP3, the
// Identifiers setting), issues/preprint-draft-labelled-production (OPS3).
//
// Scratch contexts per app and run (tag u24sw19<run>…): `main` (the install defaults), and on OJS `pay0`
// / `pay50` (payments set up, Article Processing Charge 0 / 50), and `meta` on every app (References and
// Funding off, Data on; the Copyeditor's stage set widened to Review on OJS/OMP).
// Users (main): mgr manager · ed editor (OJS/OMP) · se sectionEditor (assigned) · seu sectionEditor
//   (assigned to nothing) · ge guestEditor (OJS) · ce copyeditor · le layoutEditor · fc funding (OJS/OMP)
//   · au, au2 authors · rv externalReviewer (OJS/OMP) · rd reader · ebm editorialBoardMember · mla
//   manager+layoutEditor+author (OPS manager+author) · mrv manager+externalReviewer (OJS/OMP); admin
//   is given sectionEditor + reader there (phase a8).
// Submissions (main, submitter au): S submitted · R review round 1 (rv, mrv accepted; se, ge, ce, fc)
//   · RU review round 1, nobody assigned · R2 two rounds · RI (OMP) internal round 1 · C copyediting
//   (accept) · P production · X declined at Submission · XR declined in review · XD declined (deleted in
//   phase del) · D published through Production (se, le) · D2 the same (se round trip) · DS published
//   straight from Submission · SCH (OJS) scheduled into a future issue · DR draft · A2 (au2's) · L
//   (review round 1, mla as layoutEditor) · MO (mla's own). OPS: P, X, XD, D, D2, DR, A2, MO.
//
// Phases (PHASES=…, default all; they run in this order whatever PHASES lists, one process; `seed` writes outFile('sw19-seed.json'),
// which every later phase reads, so a phase run alone needs a seed of the same PROBE_RUN first):
//   seed mgr ed se ge ce le fc au doors mla a4 rolesgrid stageset2 meta pay rtw ver del edX pe a8
//            (not in the default list: stageset, the stage-set change through the database; repub, rtw's publish-again
//            leg alone, on a D that an earlier rtw left unpublished)
//   mgr      Journal Manager: every state's landing, stage entries, pages, publication frame, deep links,
//            Close, the typed addresses (2a–2d), Preview/View pressed, a page left with a change unsaved
//   ed … fc  the role levels on their assigned (and unassigned) submissions
//   au       the Author (and au2 the stranger) at My Submissions and every door
//   doors    Reviewer, Reader, Editorial Board Member at the three doors
//   mla      scenario 12 / Rule 20 (manager + layoutEditor + author)
//   a4       a manager who is also an accepted reviewer
//   rolesgrid Settings › Users & Roles › Roles: every row's stage boxes, as the Journal Manager
//   stageset2 the Copyeditor's Review box pressed on the Roles grid and pressed back; the assigned Copyeditor's
//            next open of R read before, between and after (stageset: the same through the database, kept as a variant)
//   meta     the metadata options' pages, and a seeded widened stage set
//   pay      (OJS) the "Payments" dropdown at fee 0 and 50, Journal Manager, Copyeditor, Author
//   rtw      Return to Workflow / Return to Done, Activity Log, Unpublish, publish again; the assigned
//            Section Editor's round trip; the Layout Editor and Author controls
//   ver      Rule 17 with a second version: "Create New Version" confirmed on P (never published) and on D2
//            (published, after rtw), each version's Title & Abstract frame read
//   del      Delete: Cancel, Confirm, the stale addresses, the Author's My Submissions address
//   edX      (OJS/OMP) the Journal editor's stage actions on the declined X
//   pe       (OJS/OMP) the Production editor, a manager-level group with a stage set (own side context)
//   a8       the Site Administrator with Journal Manager ended (Section Editor left, then Reader left)
//
// Run (each run twice, on the U24 scenario fleet; one app per process is fine):
//   PROBE_RUN=r1 PROBE_FEATURE=U24 PROBE_AGENT=ccSW19 PROBE_NOTES_FEATURE=U24 \
//     bin/app-lock.sh shared ojs -- node bin/probe.js ojs shared/playwright/checks/U24/SW19/sw19.js
//   PROBE_RUN=r2 … (the second, independent run: its own contexts)
// Summary: sw19-summary-<run>-<app>.json lists every phase per process (key phases:<PHASES>) and whether it died
// (a dead phase is a script fault). Facts merge into sw19-facts-<run>-<app>.json across processes.
const fs = require('fs');
const {forEachApp, launch, signIn, screen, shot, record, loc, note, idle, tag, sql, outFile} = require('../../../probe');

const RUN = process.env.PROBE_RUN || 'r1';
const ALL = ['seed', 'mgr', 'ed', 'se', 'ge', 'ce', 'le', 'fc', 'au', 'doors', 'mla', 'a4', 'rolesgrid', 'stageset2', 'meta', 'pay', 'rtw', 'ver', 'del', 'edX', 'pe', 'a8'];
const PHASES = process.env.PHASES ? process.env.PHASES.split(',') : ALL;
const on = (p) => PHASES.includes(p);
const log = (...a) => console.log(`[sw19 ${RUN}]`, ...a);
const flat = (s, n) => (s == null ? null : String(s).replace(/\s+/g, ' ').trim().slice(0, n || 400));
const rel = (u) => String(u).replace(/^https?:\/\/[^/]+/, '');

/** The workflow panel as data (DOM facts as in I29's wfInfo, plus the header's order and the Assign buttons). */
const wfInfo = (page) => page.evaluate(() => {
    const vis = (e) => !!(e && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden');
    const txt = (e) => (e ? e.innerText.trim().replace(/\s+/g, ' ') : null);
    const header = document.querySelector('[data-cy="sidemodal-header"]');
    const root = header ? header.closest('[role=dialog]') || header.parentElement : null;
    const others = () => [...document.querySelectorAll('[role=dialog], [role=alertdialog]')].filter((d) => vis(d) && d !== root && !(root && d.contains(root)) && !(root && root.contains(d) && d.querySelector('[data-cy="sidemodal-header"]'))).map((d) => txt(d).slice(0, 500));
    if (!root) return {panel: false, otherDialogs: others()};
    const nav = root.querySelector('nav');
    const links = nav ? [...nav.querySelectorAll('a')] : [];
    const menu = links.map((a) => {
        const cls = a.className || '';
        let level = 1;
        if (/!px-(7|9)\b/.test(cls)) level = 2;
        if (/!px-(10|12)\b/.test(cls)) level = 3;
        if (/!px-(14|16)\b/.test(cls)) level = 4;
        return {t: (a.textContent || '').trim().replace(/\s+/g, ' '), level, visible: vis(a), striped: /!border-s-8/.test(cls), selected: /bg-selection-dark/.test(cls), exp: a.getAttribute('aria-expanded')};
    });
    const h2 = root.querySelector('.pkp-modal-scroll-container h2');
    const prim = root.querySelector('[data-cy="workflow-primary-items"]');
    const statusH = prim ? [...prim.querySelectorAll('h3')].find((x) => /Status/.test(x.innerText) && x.closest('div.border')) : null;
    const box = prim ? prim.querySelector(':scope > div.border, :scope div.border') : null;
    const cl = root.querySelector('[data-cy="workflow-controls-left"]');
    const cr = root.querySelector('[data-cy="workflow-controls-right"]');
    const bubble = header ? header.querySelector('span[class*="bg-stage-"] + span') : null;
    const sec = root.querySelector('[data-cy="workflow-secondary-items"]');
    // the header's lines top to bottom (leaf texts in document order), and the contributors' line style
    const hdrLines = header ? [...header.querySelectorAll('*')].filter((e) => vis(e) && e.children.length === 0 && e.innerText && e.innerText.trim()).map((e) => ({t: e.innerText.trim().replace(/\s+/g, ' ').slice(0, 120), tag: e.tagName, deco: getComputedStyle(e).textDecorationLine})) : [];
    return {
        panel: true,
        headerText: txt(header),
        headerLines: hdrLines.slice(0, 25),
        headerButtons: header ? [...header.querySelectorAll('button')].filter(vis).map((b) => txt(b) || b.getAttribute('aria-label')).filter(Boolean) : [],
        bubble: txt(bubble),
        heading: txt(h2),
        statusBox: statusH ? {h3: txt(statusH), text: txt(statusH.closest('div.border'))} : (box ? {h3: null, text: txt(box)} : null),
        controlsLeft: cl ? txt(cl) : null,
        controlsLeftLinks: cl ? [...cl.querySelectorAll('button, a')].filter(vis).map(txt).filter(Boolean) : null,
        controlsRight: cr ? txt(cr) : null,
        controlsRightButtons: cr ? [...cr.querySelectorAll('button, a')].filter(vis).map(txt).filter(Boolean) : null,
        primaryStart: prim ? txt(prim).slice(0, 400) : null,
        primaryH3: prim ? [...prim.querySelectorAll('h3')].filter(vis).map(txt).slice(0, 14) : [],
        primaryTables: prim ? [...prim.querySelectorAll('table')].filter(vis).length : 0,
        noAccess: /You don't currently have access to that stage of the workflow\./.test(root.innerText),
        actions: (() => { const a = root.querySelector('[data-cy="workflow-action-items"]'); return a ? [...a.querySelectorAll('button, a')].filter(vis).map(txt).filter(Boolean) : null; })(),
        secondaryH3: sec ? [...sec.querySelectorAll('h3')].filter(vis).map(txt) : null,
        secondaryButtons: sec ? [...sec.querySelectorAll('button')].filter(vis).map((b) => txt(b) || b.getAttribute('aria-label')).filter(Boolean).slice(0, 12) : null,
        menu,
        dialogText: txt(root).slice(0, 2500),
        otherDialogs: others(),
    };
}).catch((e) => ({error: String(e.message)}));

const menuKey = (page) => { try { return new URL(page.url()).searchParams.get('workflowMenuKey'); } catch (e) { return null; } };
const menuShape = (info) => (info.menu || []).map((m) => `${'  '.repeat(m.level - 1)}${m.t}${m.visible ? '' : ' (hidden)'}${m.striped ? ' [stripe]' : ''}${m.selected ? ' [sel]' : ''}`);

forEachApp(async (app) => {
    const isOJS = app.name === 'ojs';
    const isOMP = app.name === 'omp';
    const isOPS = app.name === 'ops';
    const seedFile = outFile('sw19-seed.json');
    const summary = {phases: {}};
    const facts = {};
    const fact = (k, v) => { facts[k] = v; log(app.name, k, JSON.stringify(v).slice(0, 600)); };
    async function sect(name, fn) {
        const t0 = Date.now();
        try { await fn(); summary.phases[name] = {ok: true, s: Math.round((Date.now() - t0) / 1000)}; } catch (e) {
            summary.phases[name] = {ok: false, error: String(e.stack || e).split('\n').slice(0, 5).join(' | ')};
            log(`[${name} FAILED]`, summary.phases[name].error);
        }
        record(`sw19-facts`, facts, {merge: true});
        record(`sw19-summary`, {[`phases:${PHASES.join('+')}`]: summary.phases}, {merge: true});
    }

    // ------------------------------------------------------------------ seed
    if (on('seed')) await sect('seed', async () => {
        const t = tag(`u24sw19${RUN}`);
        const u = (k) => `${t}${k}`;
        const users = isOPS
            ? [['mgr', ['manager']], ['se', ['sectionEditor']], ['seu', ['sectionEditor']], ['au', ['author']], ['au2', ['author']], ['rd', ['reader']], ['ebm', ['editorialBoardMember']], ['mla', ['manager', 'author']]]
            : [['mgr', ['manager']], ['ed', ['editor']], ['se', ['sectionEditor']], ['seu', ['sectionEditor']], ...(isOJS ? [['ge', ['guestEditor']]] : []), ['ce', ['copyeditor']], ['le', ['layoutEditor']], ['fc', ['funding']],
                ['au', ['author']], ['au2', ['author']], ['rv', ['externalReviewer']], ['rd', ['reader']], ['ebm', ['editorialBoardMember']], ['mla', ['manager', 'layoutEditor', 'author']], ['mrv', ['manager', 'externalReviewer']]];
        const ctx = {tag: t, context: {contactName: `Contact ${t}`, contactEmail: `${t}c@mail.test`},
            users: [...users.map(([k, roles]) => ({username: u(k), roles})), {username: 'admin', roles: ['sectionEditor', 'reader']}]};
        if (isOJS) ctx.issues = [{volume: 1, number: 1, year: 2025, published: true}, {volume: 2, number: 1, year: 2027}];
        await app.api.createContext(ctx);
        const subs = {};
        const P = (k, role) => ({username: u(k), role});
        const mk = async (k, spec, submitter) => {
            try {
                const r = await app.api.createSubmission({tag: `${t}${k}`, context: t, submitter: submitter || u('au'), title: `${k} sw19 ${t}`, ...spec});
                subs[k] = {id: r.submissionId, pub: r.publicationId, stageId: r.stageId, status: r.status, rounds: (r.reviewRounds || []).map((x) => ({id: x.id, round: x.round, stageId: x.stageId}))};
            } catch (e) { subs[k] = {error: String(e.message).slice(0, 400)}; }
            log(app.name, 'seed', k, JSON.stringify(subs[k]));
        };
        if (isOPS) {
            await mk('P', {participants: [P('se', 'sectionEditor')]});
            await mk('X', {decisions: ['decline'], participants: [P('se', 'sectionEditor')]});
            await mk('XD', {decisions: ['decline']});
            await mk('D', {published: true, participants: [P('se', 'sectionEditor')]});
            await mk('D2', {published: true, participants: [P('se', 'sectionEditor')]});
            await mk('DR', {submitted: false});
            await mk('A2', {}, u('au2'));
            await mk('MO', {}, u('mla'));
        } else {
            const ext = 'sendExternalReview';
            await mk('S', {participants: [P('se', 'sectionEditor'), P('ed', 'editor')]});
            await mk('R', {decisions: [ext], reviewRounds: [{reviewers: [{username: u('rv'), status: 'accepted'}, {username: u('mrv'), status: 'accepted'}]}],
                participants: [P('se', 'sectionEditor'), P('ce', 'copyeditor'), P('fc', 'funding'), ...(isOJS ? [P('ge', 'guestEditor')] : [])]});
            await mk('RU', {decisions: [ext]});
            await mk('R2', {decisions: [ext], reviewRounds: [{reviewers: []}, {reviewers: []}], participants: [P('se', 'sectionEditor')]});
            if (isOMP) await mk('RI', {decisions: ['sendInternalReview'], participants: [P('se', 'sectionEditor')]});
            await mk('C', {decisions: [ext, 'accept'], participants: [P('se', 'sectionEditor'), P('ce', 'copyeditor')]});
            await mk('P', {decisions: ['skipExternalReview', 'sendToProduction'], participants: [P('se', 'sectionEditor'), P('le', 'layoutEditor')]});
            await mk('X', {decisions: ['initialDecline'], participants: [P('se', 'sectionEditor')]});
            await mk('XR', {decisions: [ext, 'decline']});
            await mk('XD', {decisions: ['initialDecline']});
            const iss = isOJS ? {issue: {volume: 1, number: 1, year: 2025}} : {};
            await mk('D', {decisions: [ext, 'accept', 'sendToProduction'], reviewRounds: [{reviewers: []}], published: true, ...iss, participants: [P('se', 'sectionEditor'), P('le', 'layoutEditor')]});
            await mk('D2', {decisions: [ext, 'accept', 'sendToProduction'], reviewRounds: [{reviewers: []}], published: true, ...iss, participants: [P('se', 'sectionEditor'), P('le', 'layoutEditor')]});
            await mk('DS', {published: true, ...iss});
            if (isOJS) await mk('SCH', {decisions: ['skipExternalReview', 'sendToProduction'], published: true, issue: {volume: 2, number: 1, year: 2027}});
            await mk('DR', {submitted: false});
            await mk('A2', {}, u('au2'));
            await mk('L', {decisions: [ext], participants: [P('mla', 'layoutEditor')]});
            await mk('MO', {}, u('mla'));
        }
        // the side contexts: metadata options + a widened Copyeditor; OJS payments at fee 0 and 50
        const side = {};
        const mt = tag(`u24sw19${RUN}m`);
        const metaCtx = {tag: mt, context: {contactName: `Contact ${mt}`, contactEmail: `${mt}c@mail.test`},
            metadata: {citations: 'off', funders: 'off', dataAvailability: 'request'},
            users: [{username: `${mt}mgr`, roles: ['manager']}, {username: `${mt}au`, roles: ['author']}, ...(isOPS ? [] : [{username: `${mt}ce`, roles: ['copyeditor']}])]};
        if (!isOPS) metaCtx.roles = {copyeditor: {stages: {review: true}}};
        await app.api.createContext(metaCtx);
        const mr = await app.api.createSubmission({tag: `${mt}R`, context: mt, submitter: `${mt}au`, title: `meta sw19 ${mt}`,
            ...(isOPS ? {} : {decisions: ['sendExternalReview'], participants: [{username: `${mt}ce`, role: 'copyeditor'}]})});
        side.meta = {context: mt, R: {id: mr.submissionId, pub: mr.publicationId}};
        if (isOJS) {
            for (const fee of [0, 50]) {
                const pt = tag(`u24sw19${RUN}p${fee}`);
                await app.api.createContext({tag: pt, context: {contactName: `Contact ${pt}`, contactEmail: `${pt}c@mail.test`},
                    payments: {enabled: true, currency: 'USD', paymentPluginName: 'ManualPayment', manualInstructions: 'Pay by hand.', publicationFee: fee},
                    users: [{username: `${pt}mgr`, roles: ['manager']}, {username: `${pt}ce`, roles: ['copyeditor']}, {username: `${pt}au`, roles: ['author']}]});
                const pr = await app.api.createSubmission({tag: `${pt}C`, context: pt, submitter: `${pt}au`, title: `pay sw19 ${pt}`,
                    decisions: ['sendExternalReview', 'accept'], participants: [{username: `${pt}ce`, role: 'copyeditor'}]});
                side[`pay${fee}`] = {context: pt, C: {id: pr.submissionId}};
            }
        }
        const seed = {context: t, users: Object.fromEntries(users.map(([k]) => [k, u(k)])), subs, side};
        fs.writeFileSync(seedFile, JSON.stringify(seed, null, 2));
        note(`SW19 [${app.name}] ${RUN}: scratch context ${t}, users ${Object.keys(seed.users).map((k) => `${k}=${seed.users[k]}`).join(' ')}; subs ${Object.entries(subs).map(([k, v]) => `${k}=${v.id}`).join(' ')}; side ${JSON.stringify(side)}`);
        fact('seed', seed);
    });
    if (PHASES.length === 1 && on('seed')) return;
    if (!fs.existsSync(seedFile)) { log(app.name, 'no seed file', seedFile); summary.phases.noSeed = {ok: false}; record('sw19-summary', {[`phases:${PHASES.join('+')}`]: summary.phases}, {merge: true}); return; }
    const seed = JSON.parse(fs.readFileSync(seedFile, 'utf8'));
    const t = seed.context;
    const S = seed.subs;
    const U = seed.users;
    const ctxUrl = (ctx, p) => app.url(`/index.php/${ctx}/en${p}`);
    const wf = (id, key, ctx) => ctxUrl(ctx || t, `/dashboard/editorial?workflowSubmissionId=${id}${key ? `&workflowMenuKey=${key}` : ''}`);
    const my = (id, key, ctx) => ctxUrl(ctx || t, `/dashboard/mySubmissions?workflowSubmissionId=${id}${key ? `&workflowMenuKey=${key}` : ''}`);
    const addr = (p, ctx) => app.url(`/index.php/${ctx || t}${p}`);

    const {page, close} = await launch(app);
    const errs = [];
    page.on('console', (m) => { if (m.type() === 'error') errs.push({at: rel(page.url()).slice(0, 160), console: m.text().slice(0, 300)}); });
    page.on('pageerror', (e) => errs.push({at: rel(page.url()).slice(0, 160), pageerror: String(e.message).slice(0, 300)}));
    const bad = [];
    page.on('response', (r) => { if (r.status() >= 400) bad.push({status: r.status(), method: r.request().method(), url: rel(r.url()).slice(0, 220)}); });
    const browserDialogs = [];
    page.on('dialog', async (d) => { browserDialogs.push({type: d.type(), message: d.message().slice(0, 200)}); await d.accept().catch(() => {}); });

    async function settle(p = page) {
        await p.locator('[data-cy="sidemodal-header"]').first().waitFor({timeout: 20000}).catch(() => {});
        await p.waitForFunction(() => {
            const h = document.querySelector('[data-cy="sidemodal-header"]');
            const d = h && h.closest('[role=dialog]');
            return d && d.querySelector('nav a') && !/Loading|Refreshing data/.test(d.innerText);
        }, null, {timeout: 15000}).catch(() => {});
        await idle(p); await p.waitForTimeout(500); await idle(p);
    }
    async function snap(label, extra, p = page) {
        let s;
        try { s = await screen(p); } catch (e) { s = {url: p.url(), error: String(e.message).slice(0, 200)}; }
        const info = await wfInfo(p);
        record(`sw19-${label}`, {...s, info, ...(extra || {})});
        await shot(p, `sw19-${label}`).catch(() => {});
        return {s, info};
    }
    const brief = (info, e0, b0, s) => ({
        key: menuKey(page), heading: info.heading, bubble: info.bubble, headerButtons: info.headerButtons,
        status: info.statusBox && flat(info.statusBox.text, 220), statusH3: info.statusBox && info.statusBox.h3,
        noAccess: info.noAccess, left: flat(info.controlsLeft, 200), leftLinks: info.controlsLeftLinks, right: info.controlsRightButtons,
        primaryStart: flat(info.primaryStart, 160), primaryH3: info.primaryH3, tables: info.primaryTables, actions: info.actions,
        secondaryH3: info.secondaryH3, secondaryButtons: info.secondaryButtons,
        otherDialogs: info.otherDialogs && info.otherDialogs.length ? info.otherDialogs.map((d) => flat(d, 200)) : undefined,
        notices: s && s.notices && s.notices.length ? s.notices : undefined,
        errors: errs.slice(e0).length ? errs.slice(e0) : undefined, bad: bad.slice(b0).length ? bad.slice(b0) : undefined,
    });
    async function open(u_, label) {
        const e0 = errs.length; const b0 = bad.length;
        await page.goto(u_); await settle();
        const {info, s} = await snap(label);
        return {url: rel(page.url()), landing: brief(info, e0, b0, s), header: flat(info.headerText, 300), headerLines: (info.headerLines || []).map((l) => `${l.t}${l.deco && l.deco !== 'none' ? ` {${l.deco}}` : ''}`), menu: menuShape(info)};
    }
    const panelLoc = () => page.locator('[data-cy="sidemodal-header"]').first().locator('xpath=ancestor::*[@role="dialog"][1]');
    async function press(label, level, nth, snapLabel) {
        const nav = panelLoc().locator('nav');
        const idx = await nav.locator('a').evaluateAll((as, [lab, lev, n]) => {
            const lv = (a) => { const c = a.className || ''; if (/!px-(7|9)\b/.test(c)) return 2; if (/!px-(10|12)\b/.test(c)) return 3; if (/!px-(14|16)\b/.test(c)) return 4; return 1; };
            const hits = as.map((a, i) => ({i, t: (a.textContent || '').trim().replace(/\s+/g, ' '), l: lv(a)})).filter((x) => x.t === lab && (lev == null || x.l === lev));
            return hits[n] ? hits[n].i : -1;
        }, [label, level, nth || 0]);
        if (idx < 0) return {label, missing: true};
        const e0 = errs.length; const b0 = bad.length;
        await nav.locator('a').nth(idx).click({timeout: 10000}).catch((x) => log('click failed', label, String(x.message).slice(0, 100)));
        await idle(page); await page.waitForTimeout(800); await idle(page);
        const {info, s} = await snap(snapLabel);
        return {label, menu: menuShape(info), ...brief(info, e0, b0, s)};
    }
    // every visible entry of the first ("Workflow") group, rounds included, pressed in turn
    async function walkStages(prefix) {
        const info = await wfInfo(page);
        const groups = info.menu.filter((m) => m.level === 1).map((m) => m.t);
        const out = [];
        if (groups[0] !== 'Workflow') return {groups, entries: []};
        let group = null; const seen = {}; const targets = [];
        for (const m of info.menu) {
            if (m.level === 1) { group = m.t; continue; }
            if (group !== groups[0] || !m.visible) continue;
            const nth = (seen[`${m.t}|${m.level}`] = (seen[`${m.t}|${m.level}`] || 0) + 1) - 1;
            targets.push({t: m.t, level: m.level, nth});
        }
        let n = 0;
        for (const x of targets) {
            n++;
            if (x.level === 3) { // a stage entry pressed folds its rounds: unfold through the parent first
                const now = (await wfInfo(page)).menu;
                const me = now.map((m, i) => ({...m, i})).filter((m) => m.t === x.t && m.level === 3)[x.nth];
                if (me && !me.visible) { const parent = now.slice(0, me.i).filter((m) => m.level === 2).pop(); if (parent) await press(parent.t, 2, 0, `${prefix}-s${n}-unfold`); }
            }
            const r = await press(x.t, x.level, x.nth, `${prefix}-s${String(n).padStart(2, '0')}`);
            out.push(r);
        }
        return {groups, entries: out.map((r) => ({label: r.label, key: r.key, heading: r.heading, status: r.status, statusH3: r.statusH3, noAccess: r.noAccess, primaryStart: r.primaryStart && r.primaryStart.slice(0, 90), primaryH3: r.primaryH3, tables: r.tables, actions: r.actions, secondaryH3: r.secondaryH3, secondaryButtons: r.secondaryButtons, otherDialogs: r.otherDialogs, errors: r.errors, bad: r.bad}))};
    }
    // the last group (Publication / Preprint): its nodes, the newest node unfolded, its pages
    async function pubGroup(prefix, {pressPages = false} = {}) {
        let info = await wfInfo(page);
        const lv1 = info.menu.map((m, i) => ({...m, i})).filter((m) => m.level === 1);
        const g = lv1[lv1.length - 1];
        if (!g) return {group: null, groups: [], nodes: [], pages: []};
        const end = info.menu.length;
        const items = () => info.menu.slice(g.i + 1, end);
        const nodes = items().filter((m) => m.level === 2).map((m) => m.t);
        const withPages = info.menu.map((m, i) => ({...m, i})).filter((m) => m.i > g.i && m.level === 2 && info.menu[m.i + 1] && info.menu[m.i + 1].level === 3);
        const last = withPages[withPages.length - 1];
        if (last && !info.menu[last.i + 1].visible) {
            const nth = withPages.filter((n) => n.t === last.t && n.i < last.i).length;
            await press(last.t, 2, nth, `${prefix}-node`);
            info = await wfInfo(page);
        }
        const all = info.menu.map((m, i) => ({...m, i}));
        const lastNode = all.filter((m) => m.i > g.i && m.level === 2 && all[m.i + 1] && all[m.i + 1].level === 3).pop();
        const pages = [];
        if (lastNode) for (let i = lastNode.i + 1; i < all.length && all[i].level === 3; i++) pages.push(all[i].t);
        const out = {group: g.t, groups: lv1.map((m) => m.t), nodes, pages};
        if (pressPages) {
            out.read = [];
            for (const pg of pages) { const r = await press(pg, 3, 0, `${prefix}-p-${pg.replace(/\W+/g, '')}`); out.read.push({page: pg, heading: r.heading, left: r.left, leftLinks: r.leftLinks, right: r.right, errors: r.errors, bad: r.bad, otherDialogs: r.otherDialogs}); }
        }
        return out;
    }
    async function pressPage(name, prefix) { await pubGroup(prefix); return press(name, 3, 0, `${prefix}-${name.replace(/\W+/g, '')}`); }
    // a typed address: where it ends, its status, what it says, the panel and any dialog
    async function door(p, label, {full = false} = {}) {
        const e0 = errs.length; const b0 = bad.length;
        const resp = await page.goto(p.startsWith('http') ? p : addr(p)).catch((e) => ({err: String(e.message)}));
        await idle(page); await page.waitForTimeout(1500); await idle(page);
        const info = await wfInfo(page);
        const s = await screen(page).catch(() => ({}));
        record(`sw19-door-${label}`, {...s, info});
        await shot(page, `sw19-door-${label}`).catch(() => {});
        const body = flat(await page.locator('body').innerText().catch(() => ''), 2000) || '';
        const says = (body.match(/(The current role does not have access to this operation\.|You don't currently have access to that stage of the workflow\.|You do not currently have sufficient privileges to view the submission\.|Workflow access for incomplete submission is restricted\.|A workflow stage was not specified\.|404 Not Found|Invalid submission\.)/g) || []);
        return {status: resp && resp.status ? resp.status() : resp && resp.err, url: rel(page.url()).slice(0, 220), title: await page.title().catch(() => ''), bodyLen: body.length, says: [...new Set(says)],
            panel: info.panel, header: info.panel ? flat(info.headerText, 160) : undefined, headerButtons: info.panel ? info.headerButtons : undefined, heading: info.panel ? info.heading : undefined, key: menuKey(page),
            otherDialogs: (info.otherDialogs || []).map((d) => flat(d, 200)), body: full ? body.slice(0, 600) : undefined,
            errors: errs.slice(e0).length ? errs.slice(e0) : undefined, bad: bad.slice(b0).length ? bad.slice(b0) : undefined};
    }
    async function as(who, ctx) { await signIn(page, who === 'admin' ? 'admin' : (U[who] || who), {contextPath: ctx || t}); await idle(page); }
    async function okError() {
        const d = page.locator('[role=dialog]:visible, [role=alertdialog]:visible').filter({hasText: /^\s*Error/}).last();
        if (await d.count()) { await d.getByRole('button', {name: 'OK', exact: true}).click({timeout: 4000}).catch(() => {}); await page.waitForTimeout(600); return true; }
        return false;
    }
    async function headerPress(name) {
        const b = panelLoc().locator('[data-cy="sidemodal-header"]').getByRole('button', {name, exact: true}).first();
        if (!(await b.count())) return false;
        await b.click({timeout: 8000}); await page.waitForTimeout(700); await idle(page);
        return true;
    }
    async function dlgAnswer(title, answer) {
        const d = page.getByRole('dialog', {name: title, exact: true}).last();
        await d.waitFor({timeout: 6000}).catch(() => {});
        const text = flat(await d.innerText().catch(() => null), 300);
        const buttons = await d.locator('button').evaluateAll((bs) => bs.filter((b) => b.getClientRects().length).map((b) => ({t: b.innerText.trim(), cls: b.className.slice(0, 160)}))).catch(() => []);
        if (answer) await d.getByRole('button', {name: answer, exact: true}).click({timeout: 6000}).catch((e) => log('dlg answer failed', title, answer, String(e.message).slice(0, 80)));
        await page.waitForTimeout(1500); await idle(page);
        return {text, buttons};
    }
    // the stage entries' "Workflow" labels per app
    const stages = isOPS ? ['Production'] : isOMP ? ['Submission', 'Internal Review', 'External Review', 'Copyediting', 'Production'] : ['Submission', 'Review', 'Copyediting', 'Production'];
    const rev = isOMP ? 'External Review' : 'Review';

    try {
        // ------------------------------------------------------------------ mgr: the Journal Manager (assigned to nothing)
        if (on('mgr')) await sect('mgr', async () => {
            await as('mgr');
            const keys = isOPS ? ['P', 'X', 'D', 'DR', 'A2'] : ['S', 'R', 'R2', ...(isOMP ? ['RI'] : []), 'C', 'P', 'X', 'XR', 'D', 'DS', ...(isOJS ? ['SCH'] : []), 'DR'];
            for (const k of keys) {
                if (!S[k] || !S[k].id) continue;
                const o = await open(wf(S[k].id), `mgr-${k}-landing`);
                if (k === 'DR') { o.dlg = await okError(); }
                o.walk = await walkStages(`mgr-${k}`);
                o.pub = await pubGroup(`mgr-${k}`, {pressPages: ['S', 'P', 'D'].includes(k)});
                if (!['S', 'P', 'D'].includes(k) && o.pub.pages.length) { const r = await press(o.pub.pages[0], 3, 0, `mgr-${k}-ta`); o.ta = {heading: r.heading, left: r.left, leftLinks: r.leftLinks, right: r.right, otherDialogs: r.otherDialogs}; }
                if (k === 'R' && !isOPS) { // Rule 8: the stage entry pressed twice folds and unfolds
                    const a = await press(rev, 2, 0, `mgr-R-entry1`); const b = await press(rev, 2, 0, `mgr-R-entry2`);
                    o.fold = {after1: a.menu, after2: b.menu, heading1: a.heading, status1: a.status, actions1: a.actions, tables1: a.tables};
                }
                fact(`mgr:${k}`, o);
            }
            // Rule 1 / scenario 1: "View" on the dashboard row, then "Close"
            await sect('mgr-view', async () => {
                const first = isOPS ? 'P' : 'S';
                await page.goto(ctxUrl(t, '/dashboard/editorial?currentViewId=active')); await idle(page); await page.waitForTimeout(1500);
                const row = page.locator('tbody tr').filter({hasText: `${first} sw19`}).first();
                const rowText = flat(await row.innerText().catch(() => null), 300);
                const vb = row.getByRole('button', {name: /^View/}).first();
                await loc(page, 'editorial dashboard row: "View"', vb);
                await vb.click({timeout: 8000}).catch(() => {});
                await settle();
                const {info} = await snap('mgr-view-opened');
                const opened = {url: rel(page.url()), headerLines: info.headerLines, heading: info.heading, bubble: info.bubble, rowText};
                const listReq = bad.length;
                const reqs = [];
                const onReq = (r) => { if (/api\/v1\/_submissions|api\/v1\/submissions\?/.test(r.url())) reqs.push(rel(r.url()).slice(0, 160)); };
                page.on('request', onReq);
                const cb = panelLoc().getByRole('button', {name: 'Close', exact: true}).first();
                await loc(page, 'workflow panel: "Close"', cb);
                await cb.click({timeout: 8000}).catch(() => {});
                await idle(page); await page.waitForTimeout(1200);
                page.off('request', onReq);
                const {info: i2} = await snap('mgr-view-closed');
                fact('mgr:view-close', {opened, closed: {url: rel(page.url()), panel: i2.panel, listRequests: reqs, bad: bad.slice(listReq)}});
            });
            // Rule 12 / scenario 5: deep link, new tab, reload, an unknown entry
            await sect('mgr-deep', async () => {
                const k = isOPS ? 'P' : 'S';
                await page.goto(wf(S[k].id)); await settle();
                const r = await pressPage('Contributors', 'mgr-deep');
                const u0 = page.url();
                const p2 = await page.context().newPage();
                await p2.goto(u0); await settle(p2);
                const i2 = await wfInfo(p2); await snap('mgr-deep-newtab', null, p2);
                await p2.close();
                await page.reload(); await settle();
                const i3 = await wfInfo(page); await snap('mgr-deep-reload');
                await page.goto(wf(S[k].id, 'nonsense')); await settle();
                const i4 = await wfInfo(page); await snap('mgr-deep-nonsense');
                const u4 = page.url();
                // Rule 12: a stage entry named for an unreached stage is honoured
                await page.goto(wf(S[k].id, isOPS ? 'workflow_5' : 'workflow_4')); await settle();
                const i5 = await wfInfo(page); await snap('mgr-deep-unreached');
                fact('mgr:deep', {pressed: {key: r.key, heading: r.heading}, newTab: {url: rel(u0), heading: i2.heading}, reload: {heading: i3.heading, key: menuKey(page)}, nonsense: {heading: i4.heading, url: rel(u4)}, unreached: {heading: i5.heading, status: i5.statusBox && i5.statusBox.text}});
            });
            // Rule 6: "Preview" and "View" pressed (same tab, the public page)
            await sect('mgr-preview', async () => {
                const out = {};
                for (const [k, btn] of [[isOPS ? 'P' : 'C', 'Preview'], ['D', 'View']]) {
                    await page.goto(wf(S[k].id)); await settle();
                    const pages0 = page.context().pages().length;
                    const had = await headerPress(btn);
                    await page.waitForLoadState('domcontentloaded').catch(() => {}); await idle(page); await page.waitForTimeout(1200);
                    const s = await screen(page).catch(() => ({}));
                    record(`sw19-mgr-${btn}-page`, s); await shot(page, `sw19-mgr-${btn}-page`).catch(() => {});
                    const body = flat(await page.locator('body').innerText().catch(() => ''), 3000) || '';
                    out[btn] = {had, url: rel(page.url()).slice(0, 200), sameTab: page.context().pages().length === pages0, previewNotice: /This is a preview and has not been published\./.test(body), title: await page.title()};
                }
                fact('mgr:preview', out);
            });
            // the typed addresses (Rule 2) as the Journal Manager
            await sect('mgr-addr', async () => {
                const id = isOPS ? S.P.id : S.R.id;
                const o = {};
                const forms = isOPS
                    ? [`/workflow/access/${id}`, `/workflow/index/${id}/5`, `/workflow/production/${id}`, `/workflow/index/${id}/1`, `/workflow/index/${id}/3`, `/workflow/index/${id}/4`, `/workflow/submission/${id}`, `/workflow/externalReview/${id}`, `/workflow/editorial/${id}`, `/workflow/internalReview/${id}`, `/workflow/index/${id}`, `/workflow/index/${id}/9`, '/workflow/access', '/workflow/internalReview', '/workflow/index', '/workflow/production']
                    : [`/workflow/access/${id}`, ...[1, 2, 3, 4, 5].filter((n) => n !== 2 || isOMP).map((n) => `/workflow/index/${id}/${n}`), `/workflow/submission/${id}`, `/workflow/externalReview/${id}`, `/workflow/editorial/${id}`, `/workflow/production/${id}`, `/workflow/internalReview/${id}`,
                        `/workflow/index/${id}`, `/workflow/index/${id}/9`, '/workflow/access', '/workflow/internalReview', '/workflow/index', '/workflow/submission',
                        `/authorDashboard/submission/${id}`, `/workflow/access/${S.DR.id}`, `/workflow/index/${S.DR.id}/1`, `/workflow/submission/${S.DR.id}`, `/workflow/access/999999`, `/workflow/index/999999/1`];
                if (isOPS) forms.push(`/authorDashboard/submission/${id}`, `/workflow/access/${S.DR.id}`, `/workflow/index/${S.DR.id}/5`, `/workflow/production/${S.DR.id}`, '/workflow/access/999999', '/workflow/index/999999/5');
                for (const f of forms) o[f] = await door(f, `mgr${f.replace(/\W+/g, '-')}`);
                // Rule 2c: the draft by the dashboard address (OPS5: "Post the preprint" pressed)
                fact('mgr:addr', o);
                if (isOPS) {
                    await page.goto(wf(S.DR.id)); await settle();
                    const i0 = await wfInfo(page);
                    await press('Production', 2, 0, 'mgr-DR-production');
                    const i1 = await wfInfo(page);
                    const pb = panelLoc().locator('[data-cy="workflow-action-items"]').getByRole('button', {name: 'Post the preprint'}).first();
                    let after = null;
                    if (await pb.count()) { await pb.click().catch(() => {}); await page.waitForTimeout(2000); await idle(page); const {info} = await snap('mgr-DR-post'); after = {key: menuKey(page), otherDialogs: info.otherDialogs}; await okError(); }
                    fact('mgr:ops-draft', {landingBubble: i0.bubble, actions: i1.actions, after});
                }
            });
            // sweep: a publication page left with a change unsaved for a stage entry
            await sect('mgr-leave', async () => {
                const k = isOPS ? 'P' : 'S';
                await page.goto(wf(S[k].id)); await settle();
                await pressPage('Title & Abstract', 'mgr-leave');
                const box = panelLoc().locator('[data-cy="workflow-primary-items"] input[type="text"]:visible').first();
                const before = await box.inputValue().catch(() => null);
                await box.fill(`${before || ''} unsaved sw19`).catch(() => {}); await box.blur().catch(() => {});
                const d0 = browserDialogs.length;
                const r = await press(stages[0], 2, 0, 'mgr-leave-stage');
                await page.waitForTimeout(1000);
                const back = await pressPage('Title & Abstract', 'mgr-leave-back');
                const v1 = await panelLoc().locator('[data-cy="workflow-primary-items"] input[type="text"]:visible').first().inputValue().catch(() => null);
                await page.reload(); await settle();
                const v2 = await panelLoc().locator('[data-cy="workflow-primary-items"] input[type="text"]:visible').first().inputValue().catch(() => null);
                fact('mgr:leave', {before, browserDialogs: browserDialogs.slice(d0), otherDialogs: r.otherDialogs, heading: r.heading, onReturn: v1, afterReload: v2, backHeading: back.heading});
            });
        });

        // ------------------------------------------------------------------ ed: Editor (manager-level; assigned on S, not on R)
        if (on('ed') && U.ed) await sect('ed', async () => {
            await as('ed');
            for (const k of ['S', 'R', 'P']) {
                const o = await open(wf(S[k].id), `ed-${k}-landing`);
                o.walk = await walkStages(`ed-${k}`);
                o.pub = await pubGroup(`ed-${k}`);
                const r = await press('Title & Abstract', 3, 0, `ed-${k}-ta`); o.ta = {left: r.left, leftLinks: r.leftLinks, right: r.right};
                fact(`ed:${k}`, o);
            }
            fact('ed:doors', {authorDashboard: await door(`/authorDashboard/submission/${S.S.id}`, 'ed-authorDashboard'), access: await door(`/workflow/access/${S.S.id}`, 'ed-access')});
        });

        // ------------------------------------------------------------------ se: assigned Section Editor / Moderator
        if (on('se')) await sect('se', async () => {
            await as('se');
            const keys = isOPS ? ['P', 'X', 'D'] : ['P', 'R', 'X'];
            for (const k of keys) {
                const o = await open(wf(S[k].id), `se-${k}-landing`);
                o.walk = await walkStages(`se-${k}`);
                o.pub = await pubGroup(`se-${k}`);
                if (o.pub.pages.length) { const r = await press('Title & Abstract', 3, 0, `se-${k}-ta`); o.ta = {heading: r.heading, left: r.left, leftLinks: r.leftLinks, right: r.right}; }
                fact(`se:${k}`, o);
            }
            const other = isOPS ? S.A2.id : S.RU.id;
            const o = {};
            o.dash = await door(wf(other), 'se-unassigned-dash');
            o.dashAfterOk = {ok: await okError(), info: await wfInfo(page).then((i) => ({panel: i.panel, header: flat(i.headerText, 80), url: rel(page.url())}))};
            o.access = await door(`/workflow/access/${other}`, 'se-unassigned-access');
            o.index = await door(`/workflow/index/${other}/${isOPS ? 5 : 1}`, 'se-unassigned-index');
            o.accessOwn = await door(`/workflow/access/${isOPS ? S.P.id : S.R.id}`, 'se-own-access');
            o.authorDashboard = await door(`/authorDashboard/submission/${isOPS ? S.P.id : S.R.id}`, 'se-authorDashboard');
            o.dashboardList = await door(ctxUrl(t, '/dashboard/editorial'), 'se-dashboard');
            fact('se:doors', o);
            // seu: a Section Editor / Moderator assigned to nothing
            await as('seu');
            fact('seu:doors', {dash: await door(wf(isOPS ? S.P.id : S.S.id), 'seu-dash'), access: await door(`/workflow/access/${isOPS ? S.P.id : S.S.id}`, 'seu-access')});
        });

        // ------------------------------------------------------------------ ge: Guest Editor (OJS, assigned on R)
        if (on('ge') && U.ge) await sect('ge', async () => {
            await as('ge');
            const o = await open(wf(S.R.id), 'ge-R-landing');
            o.walk = await walkStages('ge-R');
            o.pub = await pubGroup('ge-R');
            fact('ge:R', o);
        });

        // ------------------------------------------------------------------ ce: Copyeditor (assigned on R and C)
        if (on('ce') && U.ce) await sect('ce', async () => {
            await as('ce');
            const o = await open(wf(S.R.id), 'ce-R-landing');
            o.walk = await walkStages('ce-R');
            // Rule 12: reload on "Submission" keeps the entry
            await press('Submission', 2, 0, 'ce-R-sub');
            await page.reload(); await settle();
            const ri = await wfInfo(page); await snap('ce-R-sub-reload');
            o.reload = {key: menuKey(page), heading: ri.heading, noAccess: ri.noAccess};
            // A2: the empty Publication heading, pressed
            const before = menuShape(await wfInfo(page));
            const lv1 = (await wfInfo(page)).menu.filter((m) => m.level === 1);
            const g = lv1[lv1.length - 1].t;
            const pr = await press(g, 1, 0, 'ce-R-pubheading');
            o.pubHeading = {group: g, before, after: pr.menu, keyAfter: pr.key, headingAfter: pr.heading};
            fact('ce:R', o);
            const c = await open(wf(S.C.id), 'ce-C-landing');
            c.walk = await walkStages('ce-C');
            c.pub = await pubGroup('ce-C');
            if (c.pub.pages.length) { const r = await press('Title & Abstract', 3, 0, 'ce-C-ta'); c.ta = {left: r.left, leftLinks: r.leftLinks, right: r.right}; }
            fact('ce:C', c);
            fact('ce:doors', {dash: await door(wf(S.RU.id), 'ce-RU-dash'), afterOk: await okError(), access: await door(`/workflow/access/${S.RU.id}`, 'ce-RU-access'), accessOwn: await door(`/workflow/access/${S.R.id}`, 'ce-R-access'), index1: await door(`/workflow/index/${S.R.id}/1`, 'ce-R-index1'), index4: await door(`/workflow/index/${S.R.id}/4`, 'ce-R-index4')});
        });

        // ------------------------------------------------------------------ le: Layout Editor (assigned on P and D)
        if (on('le') && U.le) await sect('le', async () => {
            await as('le');
            for (const k of ['P', 'D']) {
                const o = await open(wf(S[k].id), `le-${k}-landing`);
                o.walk = await walkStages(`le-${k}`);
                o.pub = await pubGroup(`le-${k}`);
                if (o.pub.pages.length) { const r = await press('Title & Abstract', 3, 0, `le-${k}-ta`); o.ta = {left: r.left, leftLinks: r.leftLinks, right: r.right}; }
                fact(`le:${k}`, o);
            }
        });

        // ------------------------------------------------------------------ fc: Funding Coordinator (assigned on R)
        if (on('fc') && U.fc) await sect('fc', async () => {
            await as('fc');
            const o = await open(wf(S.R.id), 'fc-R-landing');
            o.walk = await walkStages('fc-R');
            o.pub = await pubGroup('fc-R');
            if (o.pub.pages.length) { const r = await press('Title & Abstract', 3, 0, 'fc-R-ta'); o.ta = {heading: r.heading, left: r.left, leftLinks: r.leftLinks, right: r.right}; }
            fact('fc:R', o);
            // control: the Journal Manager on the same submission's Title & Abstract
            await as('mgr');
            await page.goto(wf(S.R.id)); await settle();
            const m = await pubGroup('fc-mgrctl');
            const r = await press('Title & Abstract', 3, 0, 'fc-mgrctl-ta');
            fact('fc:mgrControl', {pages: m.pages, nodes: m.nodes, left: r.left, leftLinks: r.leftLinks, right: r.right});
        });

        // ------------------------------------------------------------------ au: the Author (and au2, a stranger Author)
        if (on('au')) await sect('au', async () => {
            await as('au');
            const k0 = isOPS ? 'P' : 'C';
            const o = await open(my(S[k0].id), `au-${k0}-landing`);
            o.walk = await walkStages(`au-${k0}`);
            if (!isOPS) { const r = await press(rev, 2, 0, `au-${k0}-review-entry`); o.reviewEntry = {heading: r.heading, status: r.status, primaryH3: r.primaryH3, errors: r.errors}; }
            o.pub = await pubGroup(`au-${k0}`, {pressPages: true});
            fact(`au:${k0}`, o);
            // Rule 12: an Editor's entry key (Permissions & Disclosure = license) and a nonsense key
            const pub = S[k0].pub;
            fact('au:keys', {license: await door(my(S[k0].id, `publication_${pub}_license`), 'au-key-license'), nonsense: await door(my(S[k0].id, 'nonsense'), 'au-key-nonsense')});
            // My Submissions list: the row's "View"
            await sect('au-view', async () => {
                await page.goto(ctxUrl(t, '/dashboard/mySubmissions')); await idle(page); await page.waitForTimeout(1500);
                const row = page.locator('tbody tr').filter({hasText: `${k0} sw19`}).first();
                const vb = row.getByRole('button', {name: /^View/}).first();
                await loc(page, 'My Submissions row: "View"', vb);
                await vb.click({timeout: 8000}).catch(() => {}); await settle();
                const {info} = await snap('au-view-opened');
                fact('au:view', {url: rel(page.url()), headerButtons: info.headerButtons, bubble: info.bubble, heading: info.heading});
            });
            const others = {};
            for (const k of (isOPS ? ['D', 'DR'] : ['D', 'R', 'DR', 'S'])) {
                const x = await open(my(S[k].id), `au-${k}-landing`);
                if (k === 'DR') { x.errorDialog = x.landing.otherDialogs; x.ok = await okError(); }
                x.walk = await walkStages(`au-${k}`);
                x.pub = await pubGroup(`au-${k}`);
                if (k === 'DR' && x.pub.pages.length) { const r = await press('Title & Abstract', 3, 0, 'au-DR-ta'); x.ta = {heading: r.heading, otherDialogs: r.otherDialogs}; await okError(); }
                others[k] = x;
            }
            fact('au:others', others);
            const id = S[k0].id;
            fact('au:doors', {
                other: await door(my(S.A2.id), 'au-other-my'),
                otherOk: await okError(),
                dash: await door(wf(id), 'au-dash'),
                access: await door(`/workflow/access/${id}`, 'au-access'),
                index: await door(`/workflow/index/${id}/${isOPS ? 5 : 1}`, 'au-index'),
                stageForm: await door(`/workflow/${isOPS ? 'production' : 'submission'}/${id}`, 'au-stageform'),
                authorDashboard: await door(`/authorDashboard/submission/${id}`, 'au-authorDashboard'),
                authorDashboardDraft: await door(`/authorDashboard/submission/${S.DR.id}`, 'au-authorDashboard-draft'),
            });
            await okError();
            await as('au2');
            fact('au2:doors', {authorDashboard: await door(`/authorDashboard/submission/${id}`, 'au2-authorDashboard'), my: await door(my(id), 'au2-my')});
        });

        // ------------------------------------------------------------------ doors: Reviewer, Reader, Editorial Board Member
        if (on('doors')) await sect('doors', async () => {
            const id = isOPS ? S.P.id : S.R.id;
            for (const who of ['rv', 'rd', 'ebm']) {
                if (!U[who]) continue;
                await as(who);
                fact(`doors:${who}`, {
                    dash: await door(wf(id), `${who}-dash`),
                    dashOk: await okError(),
                    access: await door(`/workflow/access/${id}`, `${who}-access`),
                    authorDashboard: await door(`/authorDashboard/submission/${id}`, `${who}-authorDashboard`),
                    index: await door(`/workflow/index/${id}/${isOPS ? 5 : 3}`, `${who}-index`),
                    dashboard: await door(ctxUrl(t, '/dashboard/editorial'), `${who}-dashboard`),
                });
            }
        });

        // ------------------------------------------------------------------ mla: scenario 12 / Rule 20
        if (on('mla')) await sect('mla', async () => {
            await as('mla');
            if (S.L) {
                const o = await open(wf(S.L.id), 'mla-L-landing');
                o.walk = await walkStages('mla-L');
                o.pub = await pubGroup('mla-L');
                fact('mla:L', o);
                const c = await open(wf(S.RU.id), 'mla-RU-landing');
                c.walk = await walkStages('mla-RU');
                fact('mla:RU', c);
                fact('mla:RUdoors', {access: await door(`/workflow/access/${S.RU.id}`, 'mla-RU-access'), index5: await door(`/workflow/index/${S.RU.id}/5`, 'mla-RU-index5')});
            }
            const mo = await open(wf(S.MO.id), 'mla-MO-landing');
            mo.walk = await walkStages('mla-MO');
            mo.pub = await pubGroup('mla-MO');
            fact('mla:MO', mo);
            const mine = await open(my(S.MO.id), 'mla-MO-my');
            mine.pub = await pubGroup('mla-MO-my');
            fact('mla:MOmy', mine);
            const id = S.MO.id;
            const forms = [`/authorDashboard/submission/${id}`, `/workflow/access/${id}`, ...(isOPS ? [5] : isOMP ? [1, 2, 3, 4, 5] : [1, 3, 4, 5]).map((n) => `/workflow/index/${id}/${n}`),
                ...(isOPS ? [`/workflow/production/${id}`] : [`/workflow/submission/${id}`, `/workflow/externalReview/${id}`, `/workflow/editorial/${id}`, `/workflow/production/${id}`, ...(isOMP ? [`/workflow/internalReview/${id}`] : [])])];
            const d = {};
            for (const f of forms) d[f] = await door(f, `mla${f.replace(/\W+/g, '-')}`);
            fact('mla:MOdoors', d);
            // Rule 2b: a Journal Manager who also holds Author, at another author's old author-dashboard address
            fact('mla:otherAuthorDashboard', await door(`/authorDashboard/submission/${isOPS ? S.P.id : S.S.id}`, 'mla-other-authorDashboard'));
        });

        // ------------------------------------------------------------------ a4: a manager who is an accepted reviewer of R
        if (on('a4') && U.mrv) await sect('a4', async () => {
            await as('mrv');
            const list = await door(ctxUrl(t, '/dashboard/editorial'), 'a4-dashboard', {full: true});
            const o = await open(wf(S.R.id), 'a4-R-landing');
            o.walk = await walkStages('a4-R');
            o.pub = await pubGroup('a4-R');
            fact('a4:R', {list, ...o});
        });

        // ------------------------------------------------------------------ stageset: the Copyeditor's stage set changed (both directions)
        if (on('stageset') && U.ce) await sect('stageset', async () => {
            const cid = sql(app, `select ${app.contextTables.id} from ${app.contextTables.table} where path='${t}'`);
            const gid = sql(app, `select ug.user_group_id from user_groups ug join user_group_settings s on s.user_group_id=ug.user_group_id where ug.context_id=${cid} and s.setting_name='nameLocaleKey' and s.setting_value='default.groups.name.copyeditor'`);
            const stagesBefore = sql(app, `select stage_id from user_group_stage where user_group_id=${gid} order by stage_id`).split('\n');
            await as('ce');
            const read = async (label) => { await page.goto(wf(S.R.id)); await settle(); const {info} = await snap(label); return {key: menuKey(page), noAccess: info.noAccess, heading: info.heading, primaryH3: info.primaryH3, pubMenu: menuShape(info).slice(-4)}; };
            const r0 = await read('stageset-before');
            sql(app, `insert into user_group_stage (context_id, user_group_id, stage_id) values (${cid}, ${gid}, 3)`);
            const r1 = await read('stageset-widened');
            sql(app, `delete from user_group_stage where user_group_id=${gid} and stage_id=3`);
            const r2 = await read('stageset-back');
            fact('stageset', {gid, stagesBefore, before: r0, widened: r1, back: r2, stagesAfter: sql(app, `select stage_id from user_group_stage where user_group_id=${gid} order by stage_id`).split('\n')});
        });

        // ------------------------------------------------------------------ rolesgrid / stageset2: Settings › Users & Roles › Roles,
        // every row's stage boxes read; then the Copyeditor's Review box pressed on the screen (assign-stage), the assigned
        // Copyeditor's next open of R read, the box pressed again (unassign-stage), read again
        async function rolesGrid(label) {
            await page.goto(ctxUrl(t, '/management/settings/access')); await idle(page);
            await page.getByRole('tab', {name: 'Roles', exact: true}).click({timeout: 15000});
            await page.locator('#roleGridContainer tbody tr.gridRow').first().waitFor({timeout: 20000});
            await idle(page); await page.waitForTimeout(800);
            await loc(page, 'Roles grid: a row\'s stage boxes', page.locator('#roleGridContainer tbody tr.gridRow input[type="checkbox"]'));
            const cols = (await page.locator('#roleGridContainer thead th').allInnerTexts()).map((x) => flat(x, 60));
            const rows = await page.locator('#roleGridContainer tbody tr.gridRow').evaluateAll((trs) => trs.map((tr) => ({
                name: (tr.querySelector('[id$="-name"] .label') || {}).innerText, level: (tr.querySelector('[id$="-roleId"] .label') || {}).innerText,
                boxes: [...tr.querySelectorAll('input[type=checkbox]')].map((b) => `${b.checked ? 'x' : '-'}${b.disabled ? 'd' : ''}`).join(' '), visible: tr.getClientRects().length > 0,
            })));
            const paging = flat(await page.locator('#roleGridContainer').innerText().catch(() => ''), 4000).match(/\d+\s*-\s*\d+ of \d+|Showing[^.]*/g);
            await snap(label);
            return {cols, rows, paging};
        }
        if (on('rolesgrid')) await sect('rolesgrid', async () => { await as('mgr'); fact('rolesgrid', await rolesGrid('rolesgrid')); });
        if (on('stageset2') && U.ce) await sect('stageset2', async () => {
            const stageWord = isOMP ? 'External Review' : 'Review';
            const readCe = async (label) => { await as('ce'); await page.goto(wf(S.R.id)); await settle(); const {info} = await snap(label); return {key: menuKey(page), noAccess: info.noAccess, heading: info.heading, primaryH3: info.primaryH3, actions: info.actions, pubMenu: menuShape(info).slice(-6)}; };
            const pressBox = async () => {
                await as('mgr');
                const g = await rolesGrid('stageset2-grid');
                const stageCols = g.cols.filter((c) => /^(Submission|Internal Review|External Review|Review|Copyediting|Production)$/i.test(c));
                const idx = stageCols.findIndex((c) => c.toLowerCase() === stageWord.toLowerCase());
                const row = page.locator('#roleGridContainer tbody tr.gridRow').filter({has: page.locator('[id$="-name"] .label', {hasText: 'Copyeditor'})}).first();
                const box = row.locator('input[type="checkbox"]').nth(idx);
                const before = await box.isChecked().catch(() => null);
                const ans = page.waitForResponse((r) => /user-group-grid\/(un)?assign-stage/.test(r.url()), {timeout: 15000}).catch(() => null);
                await box.scrollIntoViewIfNeeded().catch(() => {});
                await box.click({timeout: 8000}).catch(async (e) => { log('box click fell back to element.click()', String(e.message).slice(0, 80)); await box.evaluate((b) => b.click()).catch(() => {}); });
                const r = await ans;
                await idle(page); await page.waitForTimeout(800);
                return {stageCols, idx, before, after: await box.isChecked().catch(() => null), answer: r ? `${r.status()} ${rel(r.url()).replace(/\?.*/, '')}` : null};
            };
            const o = {};
            o.before = await readCe('stageset2-ce-before');
            o.press1 = await pressBox();
            o.widened = await readCe('stageset2-ce-widened');
            o.press2 = await pressBox();
            o.back = await readCe('stageset2-ce-back');
            fact('stageset2', o);
        });

        // ------------------------------------------------------------------ meta: metadata options and a widened Copyeditor (seeded)
        if (on('meta') && seed.side.meta) await sect('meta', async () => {
            const m = seed.side.meta;
            await as(`${m.context}mgr`, m.context);
            await page.goto(wf(m.R.id, null, m.context)); await settle();
            const mg = await pubGroup('meta-mgr');
            await as(`${m.context}au`, m.context);
            await page.goto(my(m.R.id, null, m.context)); await settle();
            const au = await pubGroup('meta-au');
            let ce = null;
            if (!isOPS) {
                await as(`${m.context}ce`, m.context);
                const o = await open(wf(m.R.id, null, m.context), 'meta-ce-landing');
                o.pub = await pubGroup('meta-ce');
                ce = o;
            }
            fact('meta', {mgrPages: mg.pages, auPages: au.pages, ce});
        });

        // ------------------------------------------------------------------ pay: the "Payments" dropdown (OJS)
        if (on('pay') && isOJS) await sect('pay', async () => {
            const out = {};
            for (const fee of [0, 50]) {
                const s = seed.side[`pay${fee}`];
                for (const who of ['mgr', 'ce', 'au']) {
                    await as(`${s.context}${who}`, s.context);
                    const u_ = who === 'au' ? my(s.C.id, null, s.context) : wf(s.C.id, null, s.context);
                    const o = await open(u_, `pay${fee}-${who}`);
                    out[`${fee}:${who}`] = {headerButtons: o.landing.headerButtons, bubble: o.landing.bubble};
                    if (who !== 'au' && o.landing.headerButtons.some((b) => /Payment/.test(b))) {
                        const b = panelLoc().locator('[data-cy="sidemodal-header"]').getByRole('button').filter({hasText: /Payment/}).first();
                        await b.click().catch(() => {}); await page.waitForTimeout(800);
                        out[`${fee}:${who}`].menu = await page.getByRole('menuitem').evaluateAll((es) => es.filter((e) => e.getClientRects().length).map((e) => e.innerText.trim())).catch(() => null);
                        await snap(`pay${fee}-${who}-menu`);
                        await page.keyboard.press('Escape').catch(() => {});
                    }
                }
            }
            fact('pay', out);
        });

        // ------------------------------------------------------------------ rtw: Done and the two return buttons
        if (on('rtw')) await sect('rtw', async () => {
            const hdr = async (label) => { await settle(); const {info} = await snap(label); return {bubble: info.bubble, headerButtons: info.headerButtons, key: menuKey(page), heading: info.heading, menu: menuShape(info).filter((l) => /stripe|sel/.test(l)), status: info.statusBox && flat(info.statusBox.text, 200), left: flat(info.controlsLeft, 160), leftLinks: info.controlsLeftLinks, right: info.controlsRightButtons, other: info.otherDialogs}; };
            // A7 and the Done reads on DS before it moves (OJS/OMP)
            await as('mgr');
            const o = {};
            await page.goto(wf(S.D.id)); o.D0 = await hdr('rtw-D-0');
            await headerPress('Return to Workflow'); o.rtwCancel = await dlgAnswer('Return to Workflow', 'Cancel'); o.afterCancel = await hdr('rtw-D-cancel');
            const e0 = errs.length;
            let refreshSeen = false;
            await headerPress('Return to Workflow');
            const watch = page.waitForFunction(() => /Refreshing data/.test(document.body.innerText), null, {timeout: 6000}).then(() => { refreshSeen = true; }).catch(() => {});
            o.rtwConfirm = await dlgAnswer('Return to Workflow', 'Confirm');
            await watch;
            o.afterConfirm = await hdr('rtw-D-confirm'); o.refreshSeen = refreshSeen;
            await page.reload(); o.afterReload = await hdr('rtw-D-reload');
            const st = await press('Production', 2, 0, 'rtw-D-production'); o.production = {status: st.status, actions: st.actions, primaryH3: st.primaryH3};
            const ta = await pressPage('Title & Abstract', 'rtw-D-ta'); o.ta = {left: ta.left, leftLinks: ta.leftLinks, right: ta.right};
            await headerPress('Return to Done'); o.rtdCancel = await dlgAnswer('Return to Done', 'Cancel'); o.afterRtdCancel = await hdr('rtw-D-rtdcancel');
            await headerPress('Return to Done'); o.rtdConfirm = await dlgAnswer('Return to Done', 'Confirm'); o.afterRtd = await hdr('rtw-D-rtd');
            o.errors = errs.slice(e0);
            // the Activity Log
            if (await headerPress('Activity Log')) {
                await page.waitForTimeout(1500); await idle(page);
                const lg = page.getByRole('dialog').filter({hasText: /Activity Log/}).last();
                o.log = flat(await lg.innerText().catch(() => ''), 1500);
                await snap('rtw-D-log');
                await lg.getByRole('button', {name: 'Close', exact: true}).first().click().catch(() => {}); await page.waitForTimeout(600);
            }
            fact('rtw:D', o);
            // Unpublish from Done, then reopen; then publish again
            const u = {};
            await page.goto(wf(S.D.id)); await settle();
            await headerPress('Return to Workflow'); await dlgAnswer('Return to Workflow', 'Confirm'); u.returned = await hdr('rtw-U-returned');
            await pressPage('Title & Abstract', 'rtw-U-ta');
            const unp = panelLoc().locator('[data-cy="workflow-controls-right"]').getByRole('button', {name: isOPS ? 'Unpost' : 'Unpublish', exact: true});
            if (await unp.count()) {
                await unp.click(); await page.waitForTimeout(1200);
                const d = page.locator('[role=dialog]:visible').filter({hasNot: page.locator('[data-cy="sidemodal-header"]')}).last();
                u.unpublishDialog = flat(await d.innerText().catch(() => ''), 300);
                const ok = d.getByRole('button', {name: /^(Unpublish|Unpost|Confirm|OK|Yes)$/}).last();
                await ok.click().catch(() => {}); await page.waitForTimeout(2000);
                u.afterUnpublish = await hdr('rtw-U-unpublished');
            } else u.noUnpublish = await wfInfo(page).then((i) => i.controlsRightButtons);
            await page.goto(wf(S.D.id)); u.reopened = await hdr('rtw-U-reopened');
            // publish again: the right region's publish control and its dialog's own publish button
            await pressPage('Title & Abstract', 'rtw-U-ta2');
            // (U49's flow, as in checks/U49/I28: the "Review Publishing Details" panel, then the confirming window)
            const PUB_RE = /^(Schedule For Publication|Publish|Post)$/;
            const pubBtn = page.locator('[data-cy="workflow-controls-right"]').getByRole('button', {name: PUB_RE}).first();
            u.publishControls = await wfInfo(page).then((i) => i.controlsRightButtons);
            if (await pubBtn.count()) {
                await pubBtn.click(); await page.waitForTimeout(2000); await idle(page);
                const pnl = page.locator('[data-cy="active-modal"]').filter({hasText: 'Review Publishing Details'}).last();
                const win = () => page.getByRole('dialog').filter({hasText: /Are you sure you want to|requirements must be met|requirements have been met/}).last();
                if (await pnl.isVisible().catch(() => false)) {
                    const st = pnl.locator('select[name="versionStage"]');
                    if ((await st.count()) && !(await st.inputValue().catch(() => ''))) await st.selectOption('VoR').catch(() => {});
                    const mi = pnl.locator('select[name="versionIsMinor"]');
                    if ((await mi.count()) && !(await mi.inputValue().catch(() => ''))) await mi.selectOption('false').catch(() => {});
                    await pnl.getByRole('button', {name: 'Confirm', exact: true}).click().catch(() => {});
                    await win().waitFor({timeout: 20000}).catch(() => {});
                }
                const {info} = await snap('rtw-U-publish-window');
                u.publishWindow = info.otherDialogs;
                const go = win().getByRole('button', {name: PUB_RE}).last();
                if (await go.count()) {
                    const resp = page.waitForResponse((r) => /\/publish(\?|$)/.test(r.url()) && r.request().method() !== 'GET', {timeout: 20000}).catch(() => null);
                    await go.click().catch(() => {});
                    const r = await resp; u.publishStatus = r ? r.status() : null;
                    await page.waitForTimeout(2500); await idle(page);
                    u.afterPublishSamePage = await hdr('rtw-U-republished-same');
                }
                await page.goto(wf(S.D.id)); u.republished = await hdr('rtw-U-republished');
            }
            fact('rtw:unpublish', u);
            // DS: A7 reads in Done, then Return to Workflow (OJS/OMP)
            if (S.DS) {
                const ds = {};
                await page.goto(wf(S.DS.id)); ds.landing = await hdr('rtw-DS-0');
                ds.walk = await walkStages('rtw-DS-done');
                await page.goto(wf(S.DS.id)); await settle();
                await headerPress('Return to Workflow'); await dlgAnswer('Return to Workflow', 'Confirm'); ds.returned = await hdr('rtw-DS-returned');
                ds.walkAfter = await walkStages('rtw-DS-after');
                fact('rtw:DS', ds);
            }
            // SCH: the scheduled article's publication page (OJS)
            if (S.SCH) {
                await page.goto(wf(S.SCH.id)); const sc = {landing: await hdr('rtw-SCH-0')};
                const r = await pressPage('Title & Abstract', 'rtw-SCH-ta'); sc.ta = {left: r.left, right: r.right};
                fact('rtw:SCH', sc);
            }
            // the assigned Section Editor / Moderator's round trip on D2, with the Layout Editor and the Author as controls
            const t2 = {};
            if (U.le) { await as('le'); await page.goto(wf(S.D2.id)); t2.le0 = await hdr('rtw-D2-le0'); const pg = await pubGroup('rtw-D2-le0'); t2.le0.pages = pg.pages; }
            await as('au'); await page.goto(my(S.D2.id)); t2.au0 = await hdr('rtw-D2-au0');
            await as('se'); await page.goto(wf(S.D2.id)); t2.se0 = await hdr('rtw-D2-se0');
            const e1 = errs.length;
            await headerPress('Return to Workflow'); t2.seRtw = await dlgAnswer('Return to Workflow', 'Confirm'); t2.se1 = await hdr('rtw-D2-se1');
            if (U.le) { await as('le'); await page.goto(wf(S.D2.id)); t2.le1 = await hdr('rtw-D2-le1'); }
            await as('au'); await page.goto(my(S.D2.id)); t2.au1 = await hdr('rtw-D2-au1');
            await as('se'); await page.goto(wf(S.D2.id)); await settle();
            await headerPress('Return to Done'); t2.seRtd = await dlgAnswer('Return to Done', 'Confirm'); t2.se2 = await hdr('rtw-D2-se2');
            t2.errors = errs.slice(e1);
            fact('rtw:D2', t2);
        });

        // ------------------------------------------------------------------ ver: Rule 17 with a second version (P unpublished; D2 published)
        if (on('ver')) await sect('ver', async () => {
            await as('mgr');
            const out = {};
            for (const k of ['P', 'D2']) {
                await page.goto(wf(S[k].id)); await settle();
                const before = await pressPage('Title & Abstract', `ver-${k}-before`);
                const link = panelLoc().locator('nav').getByRole('link', {name: 'Create New Version', exact: true}).last();
                await loc(page, 'side menu: "Create New Version"', link);
                if (!(await link.count())) { out[k] = {before: {left: before.left, right: before.right}, noCreate: true}; continue; }
                await link.click();
                const dlg = page.getByRole('dialog').filter({has: page.locator('select[name="versionStage"]')});
                await dlg.locator('select[name="versionStage"]').waitFor({timeout: 25000}).catch(() => {});
                await idle(page); await page.waitForTimeout(500);
                await dlg.getByRole('button', {name: /^(Confirm|Create|Create New Version|OK)$/}).first().click({timeout: 8000}).catch((e) => log('ver confirm failed', String(e.message).slice(0, 80)));
                await page.waitForTimeout(2000); await idle(page); await settle();
                await page.reload(); await settle();
                const info = await wfInfo(page);
                const lv1 = info.menu.map((m, i) => ({...m, i})).filter((m) => m.level === 1);
                const g = lv1[lv1.length - 1];
                const nodes = info.menu.map((m, i) => ({...m, i})).filter((m) => m.i > g.i && m.level === 2 && m.t !== 'Create New Version');
                const reads = {};
                for (let n = 0; n < nodes.length; n++) {
                    const node = nodes[n];
                    await press(node.t, 2, nodes.filter((x, j) => j < n && x.t === node.t).length, `ver-${k}-node${n}`);
                    const r = await press('Title & Abstract', 3, n, `ver-${k}-node${n}-ta`);
                    // keyed by position: two versions can share a name ("Unassigned version (date)"); the selected line says which page is open
                    reads[`${n}:${node.t}`] = {selected: (r.menu || []).filter((l) => /\[sel\]/.test(l)), left: r.left, leftLinks: r.leftLinks, right: r.right, heading: r.heading};
                }
                out[k] = {before: {left: before.left, leftLinks: before.leftLinks, right: before.right}, nodes: nodes.map((x) => x.t), reads, menu: menuShape(info)};
            }
            fact('ver', out);
        });

        // ------------------------------------------------------------------ del: Delete, Cancel and Confirm; the stale addresses
        if (on('del')) await sect('del', async () => {
            await as('mgr');
            const o = {};
            const id = S.XD.id;
            o.landing = await open(wf(id), 'del-landing');
            if (isOPS) await press('Production', 2, 0, 'del-production');
            const delBtn = () => panelLoc().getByRole('button', {name: 'Delete', exact: true}).first();
            await loc(page, 'workflow stage actions: "Delete"', delBtn());
            o.offered = await delBtn().count();
            if (o.offered) {
                await delBtn().click(); o.cancel = await dlgAnswer('Delete', 'Cancel');
                o.afterCancel = {panel: (await wfInfo(page)).panel, stillOffered: await delBtn().count()};
                const since = new Date();
                await delBtn().click(); o.confirm = await dlgAnswer('Delete', 'Confirm');
                await page.waitForTimeout(2500); await idle(page);
                const {info} = await snap('del-after');
                o.after = {url: rel(page.url()), panel: info.panel};
                await page.goto(ctxUrl(t, '/dashboard/editorial?currentViewId=archived')); await idle(page); await page.waitForTimeout(2000);
                const archived = flat(await page.locator('main, #app-main, body').first().innerText().catch(() => ''), 3000) || '';
                o.archivedHasIt = archived.includes(`XD sw19`);
                await snap('del-archived');
                await page.waitForTimeout(8000);
                const mails = await app.mail.count({to: `${U.au}@mail.test`, since}).catch((e) => `err ${e.message}`);
                o.authorMailsSince = mails;
            }
            o.staleDash = await door(wf(id), 'del-stale-dash');
            o.staleOk = await okError();
            o.staleAccess = await door(`/workflow/access/${id}`, 'del-stale-access');
            o.staleIndex = await door(`/workflow/index/${id}/${isOPS ? 5 : 1}`, 'del-stale-index');
            await as('au');
            o.authorMy = await door(my(id), 'del-author-my');
            o.authorOk = await okError();
            o.authorOwn = await door(my(isOPS ? S.P.id : S.S.id), 'del-author-own');
            // the assigned Section Editor / Moderator on a declined submission: no "Delete"
            await as('se');
            await page.goto(wf(S.X.id)); await settle();
            if (isOPS) await press('Production', 2, 0, 'del-se-production');
            o.seActions = (await wfInfo(page)).actions;
            await snap('del-se-X');
            fact('del', o);
        });

        // ------------------------------------------------------------------ edX: the Editor's actions on the declined X (Rule 19, who is offered "Delete")
        if (on('edX') && U.ed) await sect('edX', async () => { await as('ed'); await page.goto(wf(S.X.id)); await settle(); const {info} = await snap('ed-X-actions'); fact('ed:X', {actions: info.actions}); });

        // ------------------------------------------------------------------ pe: the Production editor (a manager-level group with a stage
        // set of its own, Copyediting + Production): assigned as such on A, assigned to nothing on B (its own side context)
        if (on('pe') && !isOPS) await sect('pe', async () => {
            const pt = tag(`u24sw19${RUN}pe`);
            await app.api.createContext({tag: pt, context: {contactName: `Contact ${pt}`, contactEmail: `${pt}c@mail.test`},
                users: [{username: `${pt}pe`, roles: ['productionEditor']}, {username: `${pt}au`, roles: ['author']}]});
            const o = {context: pt};
            const mkp = async (k, spec) => { try { const r = await app.api.createSubmission({tag: `${pt}${k}`, context: pt, submitter: `${pt}au`, title: `${k} sw19pe ${pt}`, ...spec}); return r.submissionId; } catch (e) { o[`${k}error`] = String(e.message).slice(0, 300); return null; } };
            const A = await mkp('A', {decisions: ['sendExternalReview'], participants: [{username: `${pt}pe`, role: 'productionEditor'}]});
            const B = await mkp('B', {decisions: ['sendExternalReview']});
            await as(`${pt}pe`, pt);
            for (const [k, id] of [['A', A], ['B', B]]) {
                if (!id) continue;
                const x = await open(wf(id, null, pt), `pe-${k}-landing`);
                x.walk = await walkStages(`pe-${k}`);
                x.pub = await pubGroup(`pe-${k}`);
                o[k] = x;
            }
            fact('pe', o);
        });

        // ------------------------------------------------------------------ repub: Rule 18b's last sentence, on D left unpublished by rtw
        if (on('repub')) await sect('repub', async () => {
            await as('mgr');
            const hdr = async (label) => { await settle(); const {info} = await snap(label); return {bubble: info.bubble, headerButtons: info.headerButtons, key: menuKey(page), menu: menuShape(info).filter((l) => /stripe|sel/.test(l)), left: flat(info.controlsLeft, 160), right: info.controlsRightButtons}; };
            const u = {};
            await page.goto(wf(S.D.id)); u.before = await hdr('repub-before');
            await pressPage('Title & Abstract', 'repub-ta');
            const PUB_RE = /^(Schedule For Publication|Publish|Post)$/;
            const pubBtn = page.locator('[data-cy="workflow-controls-right"]').getByRole('button', {name: PUB_RE}).first();
            u.controls = await wfInfo(page).then((i) => i.controlsRightButtons);
            if (await pubBtn.count()) {
                await pubBtn.click(); await page.waitForTimeout(2000); await idle(page);
                const pnl = page.locator('[data-cy="active-modal"]').filter({hasText: 'Review Publishing Details'}).last();
                const win = () => page.getByRole('dialog').filter({hasText: /Are you sure you want to|requirements must be met|requirements have been met/}).last();
                if (await pnl.isVisible().catch(() => false)) {
                    const st = pnl.locator('select[name="versionStage"]');
                    if ((await st.count()) && !(await st.inputValue().catch(() => ''))) await st.selectOption('VoR').catch(() => {});
                    const mi = pnl.locator('select[name="versionIsMinor"]');
                    if ((await mi.count()) && !(await mi.inputValue().catch(() => ''))) await mi.selectOption('false').catch(() => {});
                    await pnl.getByRole('button', {name: 'Confirm', exact: true}).click().catch(() => {});
                    await win().waitFor({timeout: 20000}).catch(() => {});
                }
                const {info} = await snap('repub-window');
                u.window = info.otherDialogs;
                const go = win().getByRole('button', {name: PUB_RE}).last();
                if (await go.count()) {
                    const resp = page.waitForResponse((r) => /\/publish(\?|$)/.test(r.url()) && r.request().method() !== 'GET', {timeout: 20000}).catch(() => null);
                    await go.click().catch(() => {});
                    const r = await resp; u.publishStatus = r ? r.status() : null;
                    await page.waitForTimeout(2500); await idle(page);
                    u.samePage = await hdr('repub-same');
                }
                await page.goto(wf(S.D.id)); u.reopened = await hdr('repub-reopened');
            }
            fact('repub', u);
        });

        // ------------------------------------------------------------------ a8: the Site Administrator with Journal Manager ended
        if (on('a8')) await sect('a8', async () => {
            const cid = sql(app, `select ${app.contextTables.id} from ${app.contextTables.table} where path='${t}'`);
            const uid = sql(app, `select user_id from users where username='admin'`);
            const grp = (role) => sql(app, `select user_group_id from user_groups where context_id=${cid} and role_id=${role}`).split('\n').filter(Boolean);
            const rows = () => sql(app, `select uug.user_group_id, ug.role_id, uug.date_end from user_user_groups uug join user_groups ug on ug.user_group_id=uug.user_group_id where uug.user_id=${uid} and ug.context_id=${cid}`);
            const o = {before: rows()};
            const end = (role) => sql(app, `update user_user_groups set date_end = now() - interval '1 day' where user_id=${uid} and date_end is null and user_group_id in (${grp(role).join(',')})`);
            const restore = () => sql(app, `update user_user_groups set date_end = null where user_id=${uid} and user_group_id in (select user_group_id from user_groups where context_id=${cid})`);
            try {
                end(16);
                o.seLeft = rows();
                await as('admin');
                const id = isOPS ? S.A2.id : S.RU.id;
                const x = await open(wf(id), 'a8-se-landing');
                x.pub = await pubGroup('a8-se');
                x.list = await door(ctxUrl(t, '/dashboard/editorial'), 'a8-se-dashboard', {full: true});
                o.se = x;
                end(17);
                o.readerLeft = rows();
                await as('admin');
                o.reader = await door(wf(id), 'a8-reader-dash');
            } finally { restore(); o.after = rows(); }
            fact('a8', o);
        });
    } finally {
        record('sw19-facts', {...facts, [`errs:${PHASES.join('+')}`]: errs, [`bad:${PHASES.join('+')}`]: bad, [`browserDialogs:${PHASES.join('+')}`]: browserDialogs}, {merge: true});
        record('sw19-summary', {[`phases:${PHASES.join('+')}`]: summary.phases}, {merge: true});
        log(app.name, 'summary', JSON.stringify(summary));
        await close();
    }
});
