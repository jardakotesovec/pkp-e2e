// U25 claim check, housekeeping chunk K13a (2026-11-13): incidentals row for U25 (A3 ❓, Rule 6's
// deleted-submission sentence, fn-f, fn-a3). What does the leftover workflow dialog behind the "Invalid
// submission." error show now, its help link's text above all (pkp/ui-library#1046 changed that link's
// screen-reader text from "##common.help##" to "Help" on 2026-11-10)?
//
// One scratch context per app and run (tag prefix u25ccK13a): users mg (manager), ed (editor, a
// manager-level Journal/Press editor; OJS and OMP), se (sectionEditor), au (author, the submitter); `admin`
// is enrolled as a manager by the context scenario. Submissions (submitter au, se assigned as Section
// editor, ed as editor on OJS/OMP):
//   X1  declined at Submission (OJS/OMP `initialDecline`; OPS `decline`), deleted on screen by mg
//   X2  declined the same way, deleted on screen by admin
//   C   queued, never deleted: the control for the same frame on a live submission
// Steps, all in one process per app:
//   del       mg on X1's stage view (the Delete button, its dialog), Confirm; admin the same on X2. The
//             address the panel carried before the delete is the stale bookmark.
//   stale     every role on X1's (and mg, admin on X2's) stale dashboard address: the settled read with the
//             error dialog up, then after "OK", then after a reload, then the shell's own "Close"; the frame's
//             strip read (help link text and target, Tasks button), raw keys anywhere on the page; the help
//             link and the Tasks button pressed (sweep). au on My Submissions' address and on the editorial one.
//   old       mg and au on the older typed addresses of X1 (workflow/access/{id}, workflow/index/{id}/{stage},
//             authorDashboard/submission/{id}): status, final address, body.
//   control   mg on C's editorial address and au on C's My Submissions address: the same strip read.
//
//   PROBE_FEATURE=U25 PROBE_AGENT=ccK13a PROBE_RUN=r1 PROBE_NOTES_FEATURE=U25 \
//     bin/app-lock.sh shared ojs,omp,ops -- node bin/probe.js all shared/playwright/checks/U25/K13a/k13a.js
//   (then PROBE_RUN=r2 for the second, independent run). No other script or file is needed; each run seeds its
//   own scratch context; publicknowledge is never touched. Run on demand, never in CI.
const {forEachApp, launch, signIn, screen, shot, record, loc, note, idle, tag, rawKeys} = require('../../../probe');

const RUN = process.env.PROBE_RUN || 'r1';
const T = 30_000;
const log = (...a) => console.log(`[u25 k13a ${RUN}]`, ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (s, n = 600) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));

async function sect(name, fn) {
    try {
        await fn();
    } catch (e) {
        log(`[${name} FAILED]`, String(e.stack || e).split('\n').slice(0, 4).join(' | '));
        record(`FAILED-${name}`, {error: String(e.stack || e).slice(0, 2000)});
    }
}

/** The workflow frame as data: every visible dialog, the side-modal header and the strip above it. */
const frame = (page) => page.evaluate(() => {
    const vis = (e) => !!(e && (e.offsetWidth || e.offsetHeight || e.getClientRects().length));
    const txt = (e) => (e ? (e.innerText || e.textContent || '').replace(/\s+/g, ' ').trim() : null);
    const nameOf = (d) => {
        const ids = (d.getAttribute('aria-labelledby') || '').split(/\s+/).filter(Boolean);
        const byId = ids.map((i) => document.getElementById(i)).filter(Boolean).map((e) => e.textContent.trim()).join(' ');
        return byId || d.getAttribute('aria-label') || null;
    };
    const dialogs = [...document.querySelectorAll('[role="dialog"]')].filter(vis).map((d) => {
        const header = d.querySelector('[data-cy="sidemodal-header"]');
        const strip = d.querySelector('.bg-selection-dark');
        const help = strip ? strip.querySelector('a[target="_blank"]') : null;
        const tasks = strip ? [...strip.querySelectorAll('button')].find((b) => b.querySelector('.-screenReader')) : null;
        const closeBtn = [...d.querySelectorAll('button')].find((b) => /^Close$/.test((b.querySelector('.sr-only') || {}).textContent || ''));
        return {
            name: nameOf(d),
            ariaHidden: d.getAttribute('aria-hidden') || (d.closest('[aria-hidden="true"]') ? 'ancestor' : null),
            isWorkflow: !!header,
            text: txt(d).slice(0, 800),
            header: header ? {
                text: txt(header),
                number: txt(header.querySelector('.text-xl-medium')),
                h1: txt(header.querySelector('h1')),
                paragraphs: [...header.querySelectorAll('p')].map(txt),
            } : null,
            strip: strip ? {
                text: txt(strip),
                help: help ? {
                    href: help.getAttribute('href'),
                    srText: (help.querySelector('.-screenReader') || {}).textContent || null,
                    ariaLabel: help.getAttribute('aria-label'),
                    title: help.getAttribute('title'),
                    visible: vis(help),
                } : null,
                tasks: tasks ? {srText: tasks.querySelector('.-screenReader').textContent, disabled: tasks.disabled} : null,
                srTexts: [...strip.querySelectorAll('.-screenReader')].map((e) => e.textContent),
            } : null,
            closeButton: closeBtn ? {visible: vis(closeBtn)} : null,
            buttons: [...d.querySelectorAll('button')].filter(vis).map((b) => txt(b)).filter(Boolean),
            menuItems: [...d.querySelectorAll('nav a, nav button')].filter(vis).map((b) => txt(b)).filter(Boolean),
        };
    });
    // The page's own top bar (outside every dialog), for comparison.
    const top = [...document.querySelectorAll('header a[target="_blank"]')].map((a) => ({
        href: a.getAttribute('href'),
        srText: (a.querySelector('.-screenReader') || {}).textContent || null,
        inDialog: !!a.closest('[role="dialog"]'),
    }));
    return {url: location.href, dialogs, pageHelpLinks: top};
});

forEachApp(async (app) => {
    const isOPS = app.name === 'ops';
    const {WorkflowPage} = require('../../../pages/WorkflowPage.js');
    const t = tag('u25ccK13a');
    const users = [
        {username: `${t}mg`, roles: ['manager'], givenName: 'Mira', familyName: 'Manager'},
        {username: `${t}se`, roles: ['sectionEditor'], givenName: 'Sid', familyName: 'Sectioned'},
        {username: `${t}au`, roles: ['author'], givenName: 'Ava', familyName: 'Author'},
    ];
    if (!isOPS) users.push({username: `${t}ed`, roles: ['editor'], givenName: 'Eda', familyName: 'Editor'});
    const body = {tag: t, context: {name: `U25 K13a ${t}`, contactName: 'K13a Contact', contactEmail: `${t}c@mail.test`}, users};
    if (app.name === 'ojs') body.sections = [{abbrev: 'ART', title: 'Articles'}];
    const C = await app.api.createContext(body);
    const ctx = C.path || t;
    const U = {mg: `${t}mg`, se: `${t}se`, au: `${t}au`, ed: isOPS ? null : `${t}ed`, admin: 'admin'};
    const participants = [{username: U.se, role: 'sectionEditor'}];
    if (U.ed) participants.push({username: U.ed, role: 'editor'});
    const decline = isOPS ? 'decline' : 'initialDecline';
    const seed = async (k, extra) => {
        const r = await app.api.createSubmission({tag: `${t}${k}`, context: ctx, submitter: U.au, title: `K13a ${k} ${t}`, participants, ...extra});
        return {id: r.submissionId, stageId: r.stageId, title: `K13a ${k} ${t}`};
    };
    const S = {X1: await seed('x1', {decisions: [decline]}), X2: await seed('x2', {decisions: [decline]}), C: await seed('c', {})};
    const stageKey = isOPS ? 'workflow_5' : 'workflow_1';
    const fact = (name, data) => record(`facts-${name}`, data, {merge: true});
    fact('context', {ctx, run: RUN, users: U, submissions: S, stageKey});
    log(app.name, ctx, JSON.stringify(S));

    const editorial = (id, key) => app.url(`/index.php/${ctx}/dashboard/editorial?workflowSubmissionId=${id}${key ? `&workflowMenuKey=${key}` : ''}`);
    const mine = (id, key) => app.url(`/index.php/${ctx}/dashboard/mySubmissions?workflowSubmissionId=${id}${key ? `&workflowMenuKey=${key}` : ''}`);

    async function session(user) {
        const {page, close} = await launch(app);
        await signIn(page, user, {contextPath: ctx});
        await idle(page).catch(() => {});
        return {page, close, wf: new WorkflowPage(page, ctx)};
    }

    /** One settled read: screen, frame, raw keys, shot. */
    async function read(page, name) {
        const s = await screen(page);
        const f = await frame(page);
        const keys = await rawKeys(page);
        record(name, {screen: s, frame: f, rawKeys: keys});
        await shot(page, name);
        return {s, f, keys};
    }

    // ---- del: the delete on screen, mg on X1 and admin on X2 -------------------------------------------
    const stale = {};
    for (const [who, k] of [['mg', 'X1'], ['admin', 'X2']]) {
        await sect(`del-${k}`, async () => {
            const {page, close, wf} = await session(U[who]);
            try {
                await page.goto(editorial(S[k].id, stageKey));
                await wf.expectOpen(S[k].id);
                await wf.actionButton('Delete').waitFor({timeout: T});
                const before = await read(page, `del-${k}-${who}-stage`);
                await loc(page, 'workflow stage: the Delete button', wf.actionButton('Delete'));
                stale[k] = page.url();
                await wf.actionButton('Delete').click();
                const dlg = wf.confirmDialog('delete');
                await dlg.waitFor({timeout: T});
                await read(page, `del-${k}-${who}-dialog`);
                await dlg.getByRole('button', {name: 'Confirm', exact: true}).click();
                await wf.expectClosed();
                const after = await read(page, `del-${k}-${who}-after`);
                await page.reload();
                await idle(page);
                const reloaded = await read(page, `del-${k}-${who}-after-reload`);
                fact('del', {[k]: {who, stale: stale[k], buttons: before.f.dialogs.map((d) => d.buttons),
                    afterUrl: after.s.url, afterReloadUrl: reloaded.s.url,
                    afterNotices: after.s.notices, rowsMentionTitle: (after.s.text.main || '').includes(S[k].title)}});
            } finally {
                await close();
            }
        });
    }

    // ---- stale: each role on the stale dashboard addresses --------------------------------------------
    /** Visit an address that should give the error over the shell; read before and after "OK", reload, Close. */
    async function staleWalk(who, k, url, label, {sweep = false, timing = false} = {}) {
        await sect(`stale-${label}`, async () => {
            const {page, close, wf} = await session(U[who]);
            try {
                const out = {who, k, url};
                if (timing) {
                    // Pre-settle sampling (fn-a3's "~200 ms alone"): when the shell and the error dialog first show.
                    const t0 = Date.now();
                    const nav = page.goto(url);
                    const seen = {};
                    for (let i = 0; i < 400 && !(seen.shell && seen.error); i++) {
                        const [sh, er] = await Promise.all([
                            page.locator('[data-cy="sidemodal-header"]').count().catch(() => 0),
                            wf.errorDialog().count().catch(() => 0),
                        ]);
                        if (sh && !seen.shell) seen.shell = Date.now() - t0;
                        if (er && !seen.error) seen.error = Date.now() - t0;
                        await sleep(20);
                    }
                    await nav.catch(() => {});
                    out.timing = seen;
                } else {
                    await page.goto(url);
                }
                await wf.errorDialog().waitFor({timeout: T}).catch(() => {});
                const r1 = await read(page, `stale-${label}-1-error`);
                out.landed = r1.s.url;
                out.errorDialog = r1.f.dialogs.filter((d) => !d.isWorkflow).map((d) => ({name: d.name, text: d.text, buttons: d.buttons}));
                out.shell = r1.f.dialogs.filter((d) => d.isWorkflow).map((d) => ({header: d.header, strip: d.strip, ariaHidden: d.ariaHidden, text: d.text}));
                out.rawKeys1 = r1.keys;
                out.notices1 = r1.s.notices;
                if (sweep) await loc(page, 'stale address: the "Error" dialog\'s OK', wf.errorDialog().getByRole('button', {name: 'OK', exact: true}));
                if (await wf.errorDialog().count()) {
                    await wf.errorDialog().getByRole('button', {name: 'OK', exact: true}).click();
                    await wf.errorDialog().waitFor({state: 'detached', timeout: T}).catch(() => {});
                }
                const r2 = await read(page, `stale-${label}-2-afterOK`);
                out.afterOK = {url: r2.s.url, dialogs: r2.f.dialogs.map((d) => ({name: d.name, isWorkflow: d.isWorkflow, header: d.header, strip: d.strip, buttons: d.buttons, menuItems: d.menuItems, text: d.text})),
                    rawKeys: r2.keys, ariaDialogs: r2.s.aria.dialogs};
                if (sweep) {
                    const help = wf.dialog().locator('.bg-selection-dark a[target="_blank"]');
                    await loc(page, 'leftover shell: the strip\'s help link', help);
                    await loc(page, 'leftover shell: help link by role', wf.dialog().getByRole('link', {name: 'Help', exact: true}));
                    await loc(page, 'leftover shell: Tasks button by role', wf.dialog().getByRole('button', {name: /^Tasks( \d+)?$/}));
                    await loc(page, 'leftover shell: Close by role', wf.dialog().getByRole('button', {name: 'Close', exact: true}));
                    out.helpByRole = await wf.dialog().getByRole('link', {name: 'Help', exact: true}).count();
                    // The help link pressed: what opens.
                    if (await help.count()) {
                        const popupP = page.context().waitForEvent('page', {timeout: 10_000}).catch(() => null);
                        await help.first().click().catch((e) => { out.helpClickError = String(e).slice(0, 200); });
                        const popup = await popupP;
                        if (popup) {
                            await popup.waitForLoadState('commit', {timeout: 10_000}).catch(() => {});
                            out.helpPopup = {url: popup.url()};
                            await popup.close().catch(() => {});
                        } else {
                            out.helpPopup = null;
                        }
                    }
                    // The Tasks button pressed: what opens over the shell.
                    const tasks = wf.dialog().getByRole('button', {name: /^Tasks( \d+)?$/});
                    if (await tasks.count()) {
                        await tasks.click();
                        await idle(page);
                        await sleep(500);
                        const r3 = await read(page, `stale-${label}-3-tasks`);
                        out.tasks = {dialogs: r3.f.dialogs.map((d) => ({name: d.name, isWorkflow: d.isWorkflow, buttons: d.buttons, text: d.text.slice(0, 300)})), rawKeys: r3.keys};
                        const tdlg = page.getByRole('dialog', {name: /Tasks/}).last();
                        const tclose = tdlg.getByRole('button', {name: 'Close', exact: true});
                        if (await tclose.count()) {
                            await tclose.first().click();
                            await sleep(600);
                        }
                        out.afterTasksClose = (await frame(page)).dialogs.map((d) => ({name: d.name, isWorkflow: d.isWorkflow}));
                    }
                }
                // A reload of the same address.
                await page.reload();
                await wf.errorDialog().waitFor({timeout: T}).catch(() => {});
                const r4 = await read(page, `stale-${label}-4-reload`);
                out.reload = {url: r4.s.url, dialogs: r4.f.dialogs.map((d) => ({name: d.name, isWorkflow: d.isWorkflow, text: d.text.slice(0, 200)}))};
                if (await wf.errorDialog().count()) {
                    await wf.errorDialog().getByRole('button', {name: 'OK', exact: true}).click();
                    await wf.errorDialog().waitFor({state: 'detached', timeout: T}).catch(() => {});
                }
                // The shell's own "Close".
                const closeBtn = wf.dialog().getByRole('button', {name: 'Close', exact: true});
                if (await closeBtn.count()) {
                    await closeBtn.first().click();
                    await sleep(700);
                    const r5 = await read(page, `stale-${label}-5-closed`);
                    out.closed = {url: r5.s.url, dialogs: r5.f.dialogs.map((d) => ({name: d.name, isWorkflow: d.isWorkflow})), notices: r5.s.notices,
                        mainStart: flat(r5.s.text.main, 300)};
                }
                fact(`stale-${label}`, out);
            } finally {
                await close();
            }
        });
    }

    if (stale.X1) {
        await staleWalk('mg', 'X1', stale.X1, 'mg-X1-key', {sweep: true, timing: true});
        await staleWalk('mg', 'X1', editorial(S.X1.id), 'mg-X1-bare');
        await staleWalk('admin', 'X1', stale.X1, 'admin-X1-key', {sweep: true});
        await staleWalk('se', 'X1', stale.X1, 'se-X1-key', {sweep: true});
        if (U.ed) await staleWalk('ed', 'X1', stale.X1, 'ed-X1-key');
        await staleWalk('au', 'X1', mine(S.X1.id), 'au-X1-mine', {sweep: true});
        await staleWalk('au', 'X1', editorial(S.X1.id), 'au-X1-editorial');
    }
    if (stale.X2) {
        await staleWalk('admin', 'X2', stale.X2, 'admin-X2-key');
        await staleWalk('mg', 'X2', stale.X2, 'mg-X2-key');
    }

    // ---- old: the older typed addresses --------------------------------------------------------------
    for (const who of ['mg', 'au']) {
        await sect(`old-${who}`, async () => {
            const {page, close} = await session(U[who]);
            try {
                const stage = isOPS ? 5 : 1;
                const forms = {
                    access: `/index.php/${ctx}/workflow/access/${S.X1.id}`,
                    index: `/index.php/${ctx}/workflow/index/${S.X1.id}/${stage}`,
                    authorDashboard: `/index.php/${ctx}/authorDashboard/submission/${S.X1.id}`,
                };
                const out = {};
                for (const [f, p] of Object.entries(forms)) {
                    const chain = [];
                    const onResp = (r) => { if (r.request().isNavigationRequest() && r.frame() === page.mainFrame()) chain.push({url: r.url(), status: r.status()}); };
                    page.on('response', onResp);
                    const resp = await page.goto(app.url(p)).catch((e) => ({error: String(e).slice(0, 200)}));
                    await idle(page).catch(() => {});
                    page.off('response', onResp);
                    const s = await screen(page);
                    record(`old-${who}-${f}`, {screen: s, chain});
                    await shot(page, `old-${who}-${f}`);
                    out[f] = {status: resp && resp.status ? resp.status() : resp, chain, url: s.url, title: s.title,
                        body: flat(await page.locator('body').innerText().catch(() => null), 300),
                        html: flat(await page.content(), 300), dialogs: s.aria.dialogs.length};
                }
                fact(`old-${who}`, out);
            } finally {
                await close();
            }
        });
    }

    // ---- control: the same frame on a live submission ------------------------------------------------
    for (const [who, url, label] of [['mg', editorial(S.C.id), 'mg-C'], ['au', mine(S.C.id), 'au-C']]) {
        await sect(`control-${label}`, async () => {
            const {page, close, wf} = await session(U[who]);
            try {
                await page.goto(url);
                await wf.expectOpen(S.C.id);
                await wf.contributorsLine().waitFor({timeout: T}).catch(() => {});
                const r = await read(page, `control-${label}`);
                fact(`control-${label}`, {url: r.s.url, dialogs: r.f.dialogs.map((d) => ({name: d.name, isWorkflow: d.isWorkflow, header: d.header, strip: d.strip})),
                    rawKeys: r.keys, helpByRole: await wf.dialog().getByRole('link', {name: 'Help', exact: true}).count()});
            } finally {
                await close();
            }
        });
    }

    if (RUN === 'r1' && app.name === 'ojs') {
        note('Leftover shell after a deleted submission (K13a): the strip above the header is `.bg-selection-dark` inside the workflow dialog (SideModalBody → TopNavActions); its help link is `a[target="_blank"]` there, accessible name from its `.-screenReader` span; read it after the "Error" dialog\'s OK, since behind the open error dialog the shell is aria-hidden and role queries return nothing.');
    }
});
