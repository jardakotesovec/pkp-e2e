// U24 claim check, chunk I20: incidental row "Contributors address typed per role" (docs/tracking/incidentals.md),
// seen by the U41 drift sweep (ccSW20, shared/playwright/checks/U41/SW20/sw20.js part `access`).
// Spec: docs/specs/U24-workflow-screen-and-stage-access.md (Actors "Terms used below" and rows 1-3; Rules 2c, 3,
// 10-13; scenario 11; register A2, A4, OPS1). Records; asserts nothing: the reader judges.
//
// The five sightings, each driven at both ends of its axis:
//   ce    (OJS, OMP) an assigned Copyeditor types the Contributors entry address of an item at the Submission stage
//         (S); reload; the plain dashboard address; the "Publication" heading and the "Submission" entry pressed;
//         header "Library" pressed; control: the same address on an item in Copyediting (C)
//   ebm   an Editorial Board Member, unassigned (ebm) and assigned through the seed (ebma), at the Contributors
//         address, the plain dashboard address, workflow/access/{id}, authorDashboard/submission/{id} and the
//         editorial dashboard list (all three apps; the Error dialog read, then "OK", then the shell)
//   rd    a Reader at the same four addresses (all three apps)
//   rv    (OJS, OMP) a Reviewer accepted on R at R's four addresses and at S's Contributors address (a submission not
//         theirs); rvu, a Reviewer with no assignment, at S's Contributors and plain addresses
//   au    the submitter at the editorial dashboard address of their own S (Contributors key and plain) and of
//         another author's A2; control: their own My Submissions Contributors address
//   a4    (OJS, OMP) a manager who is an accepted reviewer of R (register A4) at R's Contributors and plain addresses,
//         then every stage entry pressed in turn; control: S's Contributors address
//   ctl   control: the Journal editor (OPS: the manager) at S's plain and Contributors addresses
//   assign the manager's Participants "Assign" window on S: the roles it offers (is an assigned Copyeditor at the
//         Submission stage / an assigned Editorial Board Member reachable on screen?); a role picked, then "Cancel"
//
// Seed (one scratch context per app and run, tag prefix u24i20; publicknowledge and the roster untouched):
//   users mgr (manager), ed (editor, OJS/OMP), ce (copyeditor, OJS/OMP), ebm / ebma (editorialBoardMember),
//   rd (reader), rv / rvu (externalReviewer, OJS/OMP), mrv (manager + externalReviewer, OJS/OMP), au / au2 (author)
//   S  submitted (OPS: a queued preprint in Production); participants ce (OJS/OMP) and ebma
//   R  (OJS/OMP) external review round 1, rv and mrv accepted
//   C  (OJS/OMP) Copyediting (skipExternalReview), ce assigned
//   A2 submitted by au2
//
// Run (twice, each run its own context; no other script or file is read; PART= narrows, default all):
//   PROBE_RUN=r1 PROBE_FEATURE=U24 PROBE_AGENT=ccI20 PROBE_NOTES_FEATURE=U24 node bin/probe.js all shared/playwright/checks/U24/I20/i20.js
//   PROBE_RUN=r2 … (the same line)
// Outputs: .reports/U24/ccI20/i20-<door>-<run>-<app>.{json,png} (screen() + the panel as data), i20-facts-<run>-<app>.json
// (one key per part, merged across processes, so a PART= rerun replaces only its own keys and `seed`),
// run-<run>-<app>-*.json (the kit's run record: crashes, dialogs, notices).
const {forEachApp, launch, signIn, screen, shot, record, loc, note, idle, tag} = require('../../../probe');

const RUN = process.env.PROBE_RUN || 'r1';
const ALL = ['ce', 'ebm', 'rd', 'rv', 'au', 'a4', 'ctl', 'assign'];
const PARTS = (process.env.PART || ALL.join(',')).split(',');
const on = (p) => PARTS.includes(p);
const log = (...a) => console.log(`[i20 ${RUN}]`, ...a);
const flat = (s, n) => (s == null ? null : String(s).replace(/\s+/g, ' ').trim().slice(0, n || 400));
const rel = (u) => String(u).replace(/^https?:\/\/[^/]+/, '');
const SAYS = /(The current role does not have access to this operation\.|You don't currently have access to that stage of the workflow\.|You do not currently have sufficient privileges to view the submission\.|Workflow access for incomplete submission is restricted\.|A workflow stage was not specified\.|404 Not Found|Invalid submission\.)/g;

/** The workflow panel as data, read through CSS (the panel goes aria-hidden under the "Error" dialog). */
const wfInfo = (page) => page.evaluate(() => {
    const vis = (e) => !!(e && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden');
    const txt = (e) => (e ? e.innerText.trim().replace(/\s+/g, ' ') : null);
    const header = document.querySelector('[data-cy="sidemodal-header"]');
    const root = header ? header.closest('[role=dialog]') || header.parentElement : null;
    const others = [...document.querySelectorAll('[role=dialog], [role=alertdialog]')].filter((d) => vis(d) && d !== root && !(root && d.contains(root)) && !d.querySelector('[data-cy="sidemodal-header"]')).map((d) => ({
        text: txt(d).slice(0, 400), buttons: [...d.querySelectorAll('button')].filter(vis).map(txt).filter(Boolean),
    }));
    if (!root) return {panel: false, otherDialogs: others};
    const nav = root.querySelector('nav');
    const menu = (nav ? [...nav.querySelectorAll('a')] : []).map((a) => {
        const c = a.className || '';
        let level = 1;
        if (/!px-(7|9)\b/.test(c)) level = 2;
        if (/!px-(10|12)\b/.test(c)) level = 3;
        if (/!px-(14|16)\b/.test(c)) level = 4;
        return {t: (a.textContent || '').trim().replace(/\s+/g, ' '), level, visible: vis(a), selected: /bg-selection-dark/.test(c), exp: a.getAttribute('aria-expanded')};
    });
    const prim = root.querySelector('[data-cy="workflow-primary-items"]');
    const sec = root.querySelector('[data-cy="workflow-secondary-items"]');
    const act = root.querySelector('[data-cy="workflow-action-items"]');
    const h2 = root.querySelector('.pkp-modal-scroll-container h2');
    return {
        panel: true,
        headerText: txt(header),
        headerButtons: [...header.querySelectorAll('button')].filter(vis).map((b) => txt(b) || b.getAttribute('aria-label')).filter(Boolean),
        heading: txt(h2),
        noAccess: /You don't currently have access to that stage of the workflow\./.test(root.innerText),
        primary: prim ? txt(prim).slice(0, 500) : null,
        primaryH3: prim ? [...prim.querySelectorAll('h3')].filter(vis).map(txt) : [],
        secondary: sec ? txt(sec).slice(0, 300) : null,
        actions: act ? [...act.querySelectorAll('button, a')].filter(vis).map(txt).filter(Boolean) : null,
        contributorRows: [...root.querySelectorAll('.listPanel__item')].filter(vis).map((i) => txt(i).slice(0, 120)),
        menu,
        otherDialogs: others,
    };
}).catch((e) => ({error: String(e.message)}));
const menuShape = (info) => (info.menu || []).map((m) => `${'  '.repeat(m.level - 1)}${m.t}${m.visible ? '' : ' (hidden)'}${m.selected ? ' [sel]' : ''}`);
const lastGroup = (info) => {
    const m = info.menu || [];
    const idx = m.map((x, i) => (x.level === 1 ? i : -1)).filter((i) => i >= 0);
    if (!idx.length) return null;
    const g = idx[idx.length - 1];
    return {group: m[g].t, items: m.slice(g + 1).map((x) => x.t)};
};

forEachApp(async (app) => {
    const isOJS = app.name === 'ojs';
    const isOMP = app.name === 'omp';
    const isOPS = app.name === 'ops';
    const facts = {};
    const fact = (k, v) => { facts[k] = v; log(app.name, k, JSON.stringify(v).slice(0, 700)); record('i20-facts', {[k]: v}, {merge: true}); };
    async function sect(name, fn) {
        try { await fn(); } catch (e) { fact(`${name} FAILED`, String(e.stack || e).split('\n').slice(0, 5).join(' | ')); }
    }

    // ------------------------------------------------------------------ seed
    const t = tag('u24i20');
    const u = (k) => `${t}${k}`;
    const users = isOPS
        ? [['mgr', ['manager']], ['ebm', ['editorialBoardMember']], ['ebma', ['editorialBoardMember']], ['rd', ['reader']], ['au', ['author']], ['au2', ['author']]]
        : [['mgr', ['manager']], ['ed', ['editor']], ['ce', ['copyeditor']], ['ebm', ['editorialBoardMember']], ['ebma', ['editorialBoardMember']], ['rd', ['reader']],
            ['rv', ['externalReviewer']], ['rvu', ['externalReviewer']], ['mrv', ['manager', 'externalReviewer']], ['au', ['author']], ['au2', ['author']]];
    await app.api.createContext({tag: t, context: {contactName: `Contact ${t}`, contactEmail: `${t}c@mail.test`}, users: users.map(([k, roles]) => ({username: u(k), roles}))});
    const S = {};
    const P = (k, role) => ({username: u(k), role});
    const mk = async (k, spec, submitter) => {
        try {
            const r = await app.api.createSubmission({tag: `${t}${k}`, context: t, submitter: submitter || u('au'), title: `${k} i20 ${t}`, ...spec});
            S[k] = {id: r.submissionId, pub: r.publicationId, stageId: r.stageId};
        } catch (e) { S[k] = {error: String(e.message).slice(0, 400)}; }
    };
    await mk('S', {participants: [...(isOPS ? [] : [P('ce', 'copyeditor')]), P('ebma', 'editorialBoardMember')]});
    if (!isOPS) {
        await mk('R', {decisions: ['sendExternalReview'], reviewRounds: [{reviewers: [{username: u('rv'), status: 'accepted'}, {username: u('mrv'), status: 'accepted'}]}]});
        await mk('C', {decisions: ['skipExternalReview'], participants: [P('ce', 'copyeditor')]});
    }
    await mk('A2', {}, u('au2'));
    fact('seed', {context: t, subs: S});

    const ctxUrl = (p) => app.url(`/index.php/${t}/en${p}`);
    const wf = (id, key) => ctxUrl(`/dashboard/editorial?workflowSubmissionId=${id}${key ? `&workflowMenuKey=${key}` : ''}`);
    const my = (id, key) => ctxUrl(`/dashboard/mySubmissions?workflowSubmissionId=${id}${key ? `&workflowMenuKey=${key}` : ''}`);
    const contrib = (k) => `publication_${S[k].pub}_contributors`;

    const {page, close} = await launch(app);
    const errs = [];
    page.on('console', (m) => { if (m.type() === 'error') errs.push({at: rel(page.url()).slice(0, 160), console: m.text().slice(0, 300)}); });
    page.on('pageerror', (e) => errs.push({at: rel(page.url()).slice(0, 160), pageerror: String(e.message).slice(0, 300)}));
    const bad = [];
    const api = [];
    page.on('response', (r) => {
        const url = rel(r.url());
        if (r.status() >= 400) bad.push({status: r.status(), method: r.request().method(), url: url.slice(0, 220)});
        if (/\/api\/v1\//.test(url) && !/_test\//.test(url)) api.push({status: r.status(), method: r.request().method(), url: url.split('?')[0].slice(0, 160)});
    });
    const browserDialogs = [];
    page.on('dialog', async (d) => { browserDialogs.push({type: d.type(), message: d.message().slice(0, 200)}); await d.accept().catch(() => {}); });
    const as = async (who) => { await signIn(page, u(who), {contextPath: t}); await idle(page); };

    /** Waits until the page has answered: the denied page, the "Error" dialog, or a panel with its menu loaded. */
    async function settle() {
        await idle(page);
        await page.waitForFunction(() => {
            if (/authorizationDenied/.test(location.href)) return true;
            if ([...document.querySelectorAll('[role=dialog]')].some((d) => d.getClientRects().length && /^\s*Error/.test(d.innerText))) return true;
            const h = document.querySelector('[data-cy="sidemodal-header"]');
            const d = h && h.closest('[role=dialog]');
            if (d && d.querySelector('nav a') && !/Loading|Refreshing data/.test(d.innerText)) return true;
            return !h && document.readyState === 'complete' && !/dashboard/.test(location.pathname);
        }, null, {timeout: 20000}).catch(() => {});
        await page.waitForTimeout(1500); await idle(page);
    }
    async function snap(label, extra) {
        let s;
        try { s = await screen(page); } catch (e) { s = {url: page.url(), error: String(e.message).slice(0, 200)}; }
        const info = await wfInfo(page);
        record(`i20-${label}`, {...s, info, ...(extra || {})});
        await shot(page, `i20-${label}`).catch(() => {});
        return {s, info};
    }
    const sum = async (label, resp, e0, b0, a0, d0, s, info) => {
        const body = flat(await page.locator('body').innerText().catch(() => ''), 3000) || '';
        let key = null;
        try { key = new URL(page.url()).searchParams.get('workflowMenuKey'); } catch (e) { /* none */ }
        return {
            status: resp && resp.status ? resp.status() : null, url: rel(page.url()).slice(0, 220), key, title: await page.title().catch(() => ''),
            says: [...new Set(body.match(SAYS) || [])],
            h1: flat(await page.locator('h1').allInnerTexts().catch(() => []), 200),
            breadcrumb: flat(await page.locator('.cmp_breadcrumbs, nav.cmp_breadcrumbs, [aria-label*="readcrumb"]').allInnerTexts().catch(() => []), 200),
            panel: info.panel, header: info.panel ? flat(info.headerText, 200) : undefined, headerButtons: info.panel ? info.headerButtons : undefined,
            heading: info.panel ? info.heading : undefined, noAccess: info.panel ? info.noAccess : undefined,
            primary: info.panel ? flat(info.primary, 200) : undefined, primaryH3: info.panel ? info.primaryH3 : undefined,
            contributorRows: info.panel && info.contributorRows.length ? info.contributorRows : undefined,
            menu: info.panel ? menuShape(info) : undefined, pubGroup: info.panel ? lastGroup(info) : undefined,
            otherDialogs: info.otherDialogs && info.otherDialogs.length ? info.otherDialogs : undefined,
            notices: s && s.notices && s.notices.length ? s.notices : undefined,
            browserDialogs: browserDialogs.slice(d0).length ? browserDialogs.slice(d0) : undefined,
            api: api.slice(a0), errors: errs.slice(e0).length ? errs.slice(e0) : undefined, bad: bad.slice(b0).length ? bad.slice(b0) : undefined,
            bodyStart: info.panel ? undefined : body.slice(0, 500),
        };
    };
    async function door(url, label) {
        const e0 = errs.length; const b0 = bad.length; const a0 = api.length; const d0 = browserDialogs.length;
        const resp = await page.goto(url).catch((e) => ({err: String(e.message)}));
        await settle();
        const {s, info} = await snap(label);
        return sum(label, resp, e0, b0, a0, d0, s, info);
    }
    async function reload(label) {
        const e0 = errs.length; const b0 = bad.length; const a0 = api.length; const d0 = browserDialogs.length;
        const resp = await page.reload().catch((e) => ({err: String(e.message)}));
        await settle();
        const {s, info} = await snap(label);
        return sum(label, resp, e0, b0, a0, d0, s, info);
    }
    /** Presses "OK" on the "Error" dialog and reads what stays. */
    async function okError(label) {
        const d = page.locator('[role=dialog]:visible, [role=alertdialog]:visible').filter({hasText: /^\s*Error/}).last();
        if (!(await d.count())) return {errorDialog: false};
        await loc(page, 'the "Error" dialog\'s "OK"', d.getByRole('button', {name: 'OK', exact: true}));
        const e0 = errs.length; const b0 = bad.length; const a0 = api.length; const d0 = browserDialogs.length;
        await d.getByRole('button', {name: 'OK', exact: true}).click({timeout: 5000}).catch(() => {});
        await page.waitForTimeout(800); await idle(page);
        const {s, info} = await snap(label);
        return sum(label, null, e0, b0, a0, d0, s, info);
    }
    const panelLoc = () => page.locator('[data-cy="sidemodal-header"]').first().locator('xpath=ancestor::*[@role="dialog"][1]');
    async function pressMenu(text, level, label) {
        const nav = panelLoc().locator('nav');
        const idx = await nav.locator('a').evaluateAll((as_, [lab, lev]) => {
            const lv = (a) => { const c = a.className || ''; if (/!px-(7|9)\b/.test(c)) return 2; if (/!px-(10|12)\b/.test(c)) return 3; if (/!px-(14|16)\b/.test(c)) return 4; return 1; };
            return as_.findIndex((a) => (a.textContent || '').trim().replace(/\s+/g, ' ') === lab && lv(a) === lev);
        }, [text, level]).catch(() => -1);
        if (idx < 0) return {missing: text};
        const before = page.url();
        const e0 = errs.length; const b0 = bad.length; const a0 = api.length; const d0 = browserDialogs.length;
        await nav.locator('a').nth(idx).click({timeout: 8000}).catch(() => {});
        await page.waitForTimeout(800); await idle(page);
        const {s, info} = await snap(label);
        return {urlChanged: page.url() !== before, ...(await sum(label, null, e0, b0, a0, d0, s, info))};
    }
    async function headerPress(name, label) {
        const b = page.locator('[data-cy="sidemodal-header"]').getByRole('button', {name, exact: true}).first();
        if (!(await b.count())) return {missing: name};
        await loc(page, `workflow header "${name}"`, b);
        const e0 = errs.length; const b0 = bad.length; const a0 = api.length; const d0 = browserDialogs.length;
        await b.click({timeout: 8000}).catch(() => {});
        await page.waitForTimeout(1200); await idle(page);
        const {s, info} = await snap(label);
        const dialogs = await page.locator('[role=dialog]:visible').evaluateAll((ds) => ds.map((d) => (d.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 300))).catch(() => []);
        return {dialogs, ...(await sum(label, null, e0, b0, a0, d0, s, info))};
    }
    /** The four doors of scenario 11 plus the Contributors address. */
    async function doors(who, k, {ok = true, tagK = k} = {}) {
        const id = S[k].id;
        const out = {};
        out.contrib = await door(wf(id, contrib(k)), `${who}-${tagK}-contrib`);
        if (ok && out.contrib.otherDialogs) out.contribOk = await okError(`${who}-${tagK}-contrib-after-ok`);
        out.plain = await door(wf(id), `${who}-${tagK}-plain`);
        if (ok && out.plain.otherDialogs) out.plainOk = await okError(`${who}-${tagK}-plain-after-ok`);
        out.access = await door(app.url(`/index.php/${t}/workflow/access/${id}`), `${who}-${tagK}-access`);
        out.authorDashboard = await door(app.url(`/index.php/${t}/authorDashboard/submission/${id}`), `${who}-${tagK}-authorDashboard`);
        return out;
    }

    try {
        // ------------------------------------------------------------ ce: sighting 1 (OJS, OMP)
        if (on('ce') && !isOPS) await sect('ce', async () => {
            await as('ce');
            const o = {};
            o.contrib = await door(wf(S.S.id, contrib('S')), 'ce-S-contrib');
            o.reload = await reload('ce-S-contrib-reload');
            o.pubHeading = await pressMenu('Publication', 1, 'ce-S-pubheading-pressed');
            o.submissionEntry = await pressMenu('Submission', 2, 'ce-S-submission-pressed');
            o.library = await headerPress('Library', 'ce-S-library');
            await page.keyboard.press('Escape').catch(() => {});
            await page.waitForTimeout(600);
            o.plain = await door(wf(S.S.id), 'ce-S-plain');
            o.controlC = await door(wf(S.C.id, contrib('C')), 'ce-C-contrib');
            fact('ce', o);
        });

        // ------------------------------------------------------------ ebm: sighting 2 (all apps), unassigned and assigned
        if (on('ebm')) await sect('ebm', async () => {
            for (const who of ['ebm', 'ebma']) {
                await as(who);
                const o = await doors(who, 'S');
                o.dashboard = await door(ctxUrl('/dashboard/editorial'), `${who}-dashboard`);
                fact(who, o);
            }
        });

        // ------------------------------------------------------------ rd: sighting 3 (all apps)
        if (on('rd')) await sect('rd', async () => {
            await as('rd');
            fact('rd', await doors('rd', 'S'));
        });

        // ------------------------------------------------------------ rv: sighting 4 (OJS, OMP)
        if (on('rv') && !isOPS) await sect('rv', async () => {
            await as('rv');
            const o = await doors('rv', 'R');
            o.otherContrib = await door(wf(S.S.id, contrib('S')), 'rv-S-contrib');
            fact('rv', o);
            await as('rvu');
            fact('rvu', {contrib: await door(wf(S.S.id, contrib('S')), 'rvu-S-contrib'), plain: await door(wf(S.S.id), 'rvu-S-plain')});
        });

        // ------------------------------------------------------------ au: sighting 5 (all apps)
        if (on('au')) await sect('au', async () => {
            await as('au');
            fact('au', {
                ownContrib: await door(wf(S.S.id, contrib('S')), 'au-S-editorial-contrib'),
                ownPlain: await door(wf(S.S.id), 'au-S-editorial-plain'),
                otherContrib: await door(wf(S.A2.id, contrib('A2')), 'au-A2-editorial-contrib'),
                editorialList: await door(ctxUrl('/dashboard/editorial'), 'au-editorial-list'),
                controlMy: await door(my(S.S.id, contrib('S')), 'au-S-my-contrib'),
            });
        });

        // ------------------------------------------------------------ a4: the reviewing manager (OJS, OMP)
        if (on('a4') && !isOPS) await sect('a4', async () => {
            await as('mrv');
            const o = {contrib: await door(wf(S.R.id, contrib('R')), 'mrv-R-contrib'), plain: await door(wf(S.R.id), 'mrv-R-plain')};
            // every stage entry pressed in turn (A4: "every stage entry shows" the no-access box)
            o.walk = [];
            for (const st of isOMP ? ['Submission', 'Internal Review', 'External Review', 'Copyediting', 'Production'] : ['Submission', 'Review', 'Copyediting', 'Production']) {
                const r = await pressMenu(st, 2, `mrv-R-stage-${st.replace(/\W+/g, '')}`);
                o.walk.push({stage: st, heading: r.heading, noAccess: r.noAccess, primary: r.primary, key: r.key, missing: r.missing});
            }
            o.controlS = await door(wf(S.S.id, contrib('S')), 'mrv-S-contrib');
            fact('a4', o);
        });

        // ------------------------------------------------------------ ctl: the Editor (OPS manager) control
        if (on('ctl')) await sect('ctl', async () => {
            await as(isOPS ? 'mgr' : 'ed');
            fact('ctl', {plain: await door(wf(S.S.id), 'ctl-S-plain'), contrib: await door(wf(S.S.id, contrib('S')), 'ctl-S-contrib')});
        });

        // ------------------------------------------------------------ assign: which roles the Assign window offers on S
        if (on('assign')) await sect('assign', async () => {
            await as('mgr');
            await door(wf(S.S.id, isOPS ? 'workflow_5' : 'workflow_1'), 'assign-S-stage');
            const btn = page.locator('[data-cy="workflow-secondary-items"]').getByRole('button', {name: 'Assign', exact: true});
            await loc(page, 'Participants "Assign"', btn);
            if (!(await btn.count())) { fact('assign', {noAssign: true}); return; }
            await btn.first().click();
            const win = page.getByRole('dialog').filter({has: page.locator('select[name="filterUserGroupId"]')}).last();
            await win.locator('select[name="filterUserGroupId"]').waitFor({timeout: 20000}).catch(() => {});
            await idle(page); await page.waitForTimeout(500);
            await loc(page, 'Assign window: role select', win.locator('select[name="filterUserGroupId"]'));
            const options = await win.locator('select[name="filterUserGroupId"] option').allInnerTexts().catch(() => []);
            const {s} = await snap('assign-window');
            // something changed, then "Cancel": what the way out asks
            const d0 = browserDialogs.length;
            const pick = options.find((x) => /Copyeditor|Editorial Board/i.test(x)) || options[options.length - 1];
            if (pick) await win.locator('select[name="filterUserGroupId"]').selectOption({label: pick}).catch(() => {});
            await win.locator('form').getByRole('link', {name: /^\s*Cancel\s*$/}).first().click({timeout: 5000}).catch(() => {});
            await page.waitForTimeout(1000); await idle(page);
            const after = await snap('assign-after-cancel');
            fact('assign', {stage: isOPS ? 'Production' : 'Submission', options: options.map((x) => x.trim()), title: flat(s.text && s.text.dialog, 120), picked: pick,
                cancel: {browserDialogs: browserDialogs.slice(d0), windowStillOpen: await win.isVisible().catch(() => false), panelHeading: after.info.heading}});
        });
    } finally {
        fact('errorsTotal', errs.length);
        await close();
    }
    if (RUN === 'r1' && isOJS) note(`ccI20 [${app.name}]: the reader, the reviewer and the submitter at dashboard/editorial?workflowSubmissionId=… are sent to user/authorizationDenied?message=user.authorization.roleBasedAccessDenied before any API call; settle on that URL, the "Error" dialog, or a loaded panel menu (i20.js settle())`);
});
