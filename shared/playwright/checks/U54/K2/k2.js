// U54 claim check K2: the stage boxes in the "Roles" list (spec Rules 6-11,
// lines 182-214; register A2 and A5), driven on a scratch context per app.
//
// Run: PROBE_FEATURE=U54 PROBE_AGENT=ccK2 node bin/probe.js all shared/playwright/checks/U54/K2/k2.js
//      PH=seed,levels,...  runs only those phases (default: all, in order).
//      Seeds live in .reports/U54/ccK2/state-<app>.json; delete it (or PH=reseed,...) to reseed.
//
// Context per app (tag prefix u54k2): one scratch journal / press / server with
//   m manager, ed editor + pe production editor (OJS, OMP), se section editor,
//   ce copyeditor (OJS, OMP) or eb editorial board member (OPS), au author,
//   one custom role per permission level, a one-stage custom role and an
//   unheld custom role to remove; a submission in Production with ce (eb) as
//   a participant.
// Phases:
//   levels   the list as every manager-level account and admin sees it; one
//            press + revert each; lower levels typing the address (control)
//   greyed   a click on a greyed box of every greyed row; every open box of
//            the Subscription Manager row and of the reviewer rows pressed
//   stage6   Rule 6: the participant's stage access and the "Assign" window's
//            roles before and after the list's Production box is ticked
//   press8   Rule 8: notices, box look at once and after reload, browser dialogs
//   last9    Rule 9: a role's only stage unticked in the list, then in its window
//   twice10  Rule 10 / A5: a box pressed twice (tick, untick), and "Remove"
//   mgr11    Rule 11 / A2: the stage filter per stage, the manager's own
//            stage access and "Assign" roles, a manager-level window saved
//   sweep    tab switch after a press, keyboard Space on a box, leaving the page
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, screen, shot, record, loc, note, idle, tag} = require('../../../probe');

const T = 20_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PHASES = (process.env.PH || 'seed,levels,greyed,stage6,press8,last9,twice10,mgr11,sweep').split(',');
const on = (p) => PHASES.includes(p);
const outDir = path.join(__dirname, '../../../../../.reports/U54/ccK2');
const stateFile = (app) => path.join(outDir, `state-${app.name}.json`);

// ---------------------------------------------------------------- seeding
async function seed(app) {
    const isOjs = app.name === 'ojs', isOps = app.name === 'ops';
    const t = tag('u54k2');
    const U = (k, roles, g, f) => ({username: `${t}${k}`, roles, givenName: g, familyName: f});
    const users = [U('m', ['manager'], 'Mira', 'Manager'), U('se', ['sectionEditor'], 'Sela', 'Section'), U('au', ['author'], 'Ava', 'Author')];
    if (!isOps) users.push(U('ed', ['editor'], 'Edda', 'Editor'), U('pe', ['productionEditor'], 'Pema', 'Production'), U('ce', ['copyeditor'], 'Cora', 'Copy'));
    else users.push(U('eb', ['editorialBoardMember'], 'Ebba', 'Board'));
    // Few enough custom roles that every row fits the list's first page (25 rows).
    const customRoles = [
        {key: 'kasst', level: 'assistant', name: 'K2 assistant role', abbrev: 'K2A'},
        {key: 'kmgr', level: 'manager', name: 'K2 manager role', abbrev: 'K2M'},
        {key: 'krev', level: 'reviewer', name: 'K2 reviewer role', abbrev: 'K2V'},
        {key: 'kread', level: 'reader', name: 'K2 reader role', abbrev: 'K2R'},
        {key: 'kdel', level: 'assistant', name: 'K2 removable role', abbrev: 'K2D'},
        ...(isOjs ? [{key: 'kssm', level: 'subscriptionManager', name: 'K2 subscription role', abbrev: 'K2B'}] : []),
        ...(isOps ? [
            {key: 'ksub', level: 'subEditor', name: 'K2 subeditor role', abbrev: 'K2S'},
            {key: 'kauth', level: 'author', name: 'K2 author role', abbrev: 'K2U'},
            {key: 'kone', level: 'assistant', name: 'K2 one-stage role', abbrev: 'K2O', stages: ['production']},
        ] : []),
    ];
    const res = await app.api.createContext({tag: t, context: {name: `U54 K2 ${t}`, acronym: 'KTWO', contactName: 'K2 Contact', contactEmail: `${t}c@mail.test`}, customRoles, users});
    const part = isOps ? {username: `${t}eb`, role: 'editorialBoardMember'} : {username: `${t}ce`, role: 'copyeditor'};
    const sub = await app.api.createSubmission({tag: `${t}s`, context: t, submitter: `${t}au`, title: `K2 production item ${t}`,
        ...(isOps ? {} : {files: [{file: 'article.pdf'}], decisions: ['skipExternalReview', 'sendToProduction']}), participants: [part]});
    const S = {t, ctx: t, custom: res.customRoles, sub: sub.submissionId};
    fs.mkdirSync(outDir, {recursive: true});
    fs.writeFileSync(stateFile(app), JSON.stringify(S, null, 2));
    return S;
}

// ---------------------------------------------------------------- helpers
const grid = (page) => page.locator('#roleGridContainer');
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

async function gotoRoles(page, app, ctx) {
    await page.goto(app.url(`/index.php/${ctx}/en/management/settings/access`));
    await idle(page);
    await page.locator('#roles-button').first().click();
    await page.locator('#roleGridContainer tr.gridRow').first().waitFor({timeout: T});
    await idle(page);
}

async function readGrid(page) {
    return grid(page).evaluate((g) => {
        const vis = (e) => !!(e && (e.offsetWidth || e.offsetHeight || e.getClientRects().length));
        const cols = [...g.querySelectorAll('thead th')].map((th) => th.innerText.trim());
        const rows = [...g.querySelectorAll('tbody tr.gridRow')].filter(vis).map((tr) => ({
            id: tr.id.replace(/^.*-row-/, ''),
            name: (tr.querySelector('[id$="-name"] .label') || {}).innerText?.trim(),
            level: (tr.querySelector('[id$="-roleId"] .label') || {}).innerText?.trim(),
            boxes: [...tr.querySelectorAll('input[type=checkbox]')].map((i) => `${i.checked ? 'x' : 'o'}${i.disabled ? 'd' : ''}`).join(' '),
            arrow: !!tr.querySelector('a.show_extras, a.hide_extras'),
        }));
        return {cols, rows};
    });
}
const rowsLine = (g) => g.rows.map((r) => `${r.name} | ${r.level} | ${r.boxes}${r.arrow ? '' : ' | NO ARROW'}`);

function rowLoc(page, name) {
    return grid(page).locator('tr.gridRow').filter({has: page.locator('[id$="-name"] .label', {hasText: new RegExp(`^\\s*${esc(name)}\\s*$`)})}).first();
}
const rowBoxes = (page, name) => rowLoc(page, name).evaluate((tr) => [...tr.querySelectorAll('input[type=checkbox]')].map((i) => `${i.checked ? 'x' : 'o'}${i.disabled ? 'd' : ''}`).join(' ')).catch(() => 'ROW ABSENT');
const rowPresent = async (page, name) => (await rowLoc(page, name).count()) > 0;

async function snap(page, name, extra) {
    const s = await screen(page);
    record(name, {...s, ...(extra ? {extra} : {})});
    await shot(page, name).catch(() => {});
    return s;
}

// Every notice text now on the page (toasts pile up; callers diff before/after).
const noticeTexts = (page) => page.locator('.app__notifications, .ui-pnotify').evaluateAll((els) => els.map((e) => e.innerText.replace(/\s+/g, ' ').trim()).filter(Boolean)).catch(() => []);
async function newNotices(page, before, ms = 5000) {
    const end = Date.now() + ms;
    let now = [];
    while (Date.now() < end) {
        now = await noticeTexts(page);
        const joined = now.join(' || ');
        if (joined !== before.join(' || ') && joined.length > before.join(' || ').length) break;
        await sleep(200);
    }
    await sleep(300);
    now = await noticeTexts(page);
    const b = before.join(' || ');
    const j = now.join(' || ');
    return j.startsWith(b) ? j.slice(b.length).replace(/^ \|\| /, '') : j;
}
async function clearNotices(page) {
    // Close every toast so the next read starts empty.
    for (const c of await page.locator('.app__notifications button, .ui-pnotify-closer').all()) await c.click({timeout: 1000}).catch(() => {});
    await sleep(200);
}

// Press box idx of a row; return what the browser sent and got, and the box look at once / settled.
async function press(page, rowName, idx) {
    const row = rowLoc(page, rowName);
    const box = row.locator('input[type=checkbox]').nth(idx);
    const out = {row: rowName, idx, before: await rowBoxes(page, rowName)};
    const before = await noticeTexts(page);
    const ww = page.waitForResponse((x) => /assign-stage|unassign-stage/.test(x.url()), {timeout: 8000}).catch(() => null);
    const fr = page.waitForResponse((x) => /fetch-row|fetchRow/.test(x.url()), {timeout: 8000}).catch(() => null);
    out.click = await box.click({timeout: 5000}).then(() => 'ok').catch((e) => String(e.message).split('\n')[0].slice(0, 120));
    out.boxAtOnce = await box.evaluate((i) => `${i.checked ? 'x' : 'o'}${i.disabled ? 'd' : ''}`).catch(() => 'gone');
    const resp = await ww;
    if (resp) {
        out.request = `${resp.request().method()} ${resp.url().replace(/^.*\$\$\$call\$\$\$\//, '').replace(/csrfToken=[^&]+/, 'csrfToken=…')}`;
        out.status = resp.status();
        out.body = (await resp.text().catch(() => '')).slice(0, 400);
    } else out.request = null;
    const f = await fr;
    out.fetchRow = f ? {status: f.status(), url: f.url().replace(/^.*\$\$\$call\$\$\$\//, ''), body: (await f.text().catch(() => '')).slice(0, 200)} : null;
    out.notices = resp ? await newNotices(page, before) : '';
    await idle(page);
    out.boxSettled = await box.evaluate((i) => `${i.checked ? 'x' : 'o'}${i.disabled ? 'd' : ''}`).catch(() => 'gone');
    out.rowSettled = await rowBoxes(page, rowName);
    return out;
}

async function openRowActions(page, name) {
    const row = rowLoc(page, name);
    const arrow = row.locator('a.show_extras');
    if (!(await arrow.count())) return null;
    await arrow.click();
    const ctl = row.locator('xpath=following-sibling::tr[1]');
    await ctl.getByRole('link', {name: 'Edit', exact: true}).waitFor({timeout: 5000}).catch(() => {});
    return ctl;
}
async function openEdit(page, name) {
    const ctl = await openRowActions(page, name);
    if (!ctl) return null;
    await ctl.getByRole('link', {name: 'Edit', exact: true}).click();
    const form = page.locator('form#userGroupForm');
    await form.waitFor({state: 'visible', timeout: T});
    await form.locator('input[name="permitMetadataEdit"]').waitFor({timeout: T}).catch(() => {});
    await idle(page);
    await sleep(300);
    return form;
}
const formStages = (form) => form.evaluate((el) => [...el.querySelectorAll('input[name="assignedStages[]"]')].map((i) => {
    const l = el.querySelector(`label[for="${i.id}"]`) || i.closest('label');
    return `${l ? l.innerText.trim() : i.value}:${i.checked ? 'x' : 'o'}${i.disabled ? 'd' : ''}`;
}));
async function cancelForm(page) {
    const form = page.locator('form#userGroupForm');
    await form.getByRole('link', {name: 'Cancel', exact: true}).or(form.getByRole('button', {name: 'Cancel', exact: true})).first().click().catch(() => {});
    await form.waitFor({state: 'detached', timeout: 10000}).catch(() => {});
    await sleep(700);
}
async function okForm(page) {
    const form = page.locator('form#userGroupForm');
    const before = await noticeTexts(page);
    const w = page.waitForResponse((x) => x.url().includes('update-user-group'), {timeout: T}).catch(() => null);
    await form.getByRole('button', {name: 'OK', exact: true}).click();
    const r = await w;
    const n = await newNotices(page, before);
    await form.waitFor({state: 'detached', timeout: T}).catch(() => {});
    await sleep(700);
    return {status: r && r.status(), body: r ? (await r.text().catch(() => '')).slice(0, 300) : null, notices: n};
}

async function openFilters(page) {
    const form = grid(page).locator('#userGroupSearchForm');
    if (!(await form.isVisible())) {
        await grid(page).locator('.header a').filter({hasText: /^\s*Search\s*$/}).first().click();
        await form.waitFor({state: 'visible', timeout: 5000}).catch(() => {});
    }
    return form;
}
async function chooseFilter(page, name, label) {
    const form = await openFilters(page);
    const w = page.waitForResponse((r) => r.url().includes('user-group-grid/fetch-grid'), {timeout: T}).catch(() => null);
    await form.locator(`select[name="${name}"]`).selectOption({label});
    const resp = await w;
    await idle(page);
    await sleep(400);
    return resp ? resp.status() : null;
}

const wfUrl = (app, ctx, sid, key) => app.url(`/index.php/${ctx}/en/dashboard/editorial?workflowSubmissionId=${sid}${key ? `&workflowMenuKey=${key}` : ''}`);
async function stageRead(page) {
    return page.evaluate(() => {
        const vis = (e) => e.getClientRects().length > 0;
        const dlgs = [...document.querySelectorAll('[role=dialog]')].filter(vis);
        const text = dlgs.map((d) => d.innerText).join('\n');
        const heads = dlgs.length ? [...dlgs[0].querySelectorAll('h1,h2,h3')].filter(vis).map((h) => h.innerText.trim()).slice(0, 12) : [];
        return {
            noAccess: /You don't currently have access to that stage of the workflow\./.test(text),
            roleRefused: /The current role does not have access to this operation\./.test(text),
            heads,
            assignButton: dlgs.length ? [...dlgs[0].querySelectorAll('button')].filter(vis).some((b) => b.innerText.trim() === 'Assign') : false,
            textHead: text.replace(/\s+/g, ' ').slice(0, 500),
        };
    });
}
async function assignRoles(page) {
    const btn = page.locator('[data-cy="workflow-secondary-items"]').getByRole('button', {name: 'Assign', exact: true});
    if (!(await btn.count())) return {noAssign: true};
    await btn.click();
    const win = page.getByRole('dialog').filter({has: page.locator('select[name="filterUserGroupId"]')}).last();
    await win.locator('select[name="filterUserGroupId"]').waitFor({timeout: T});
    await idle(page);
    const opts = await win.locator('select[name="filterUserGroupId"] option').allInnerTexts();
    await win.locator('form').getByRole('link', {name: /^\s*Cancel\s*$/}).first().click().catch(() => {});
    await sleep(900);
    return {options: opts.map((o) => o.trim())};
}

// ---------------------------------------------------------------- main
forEachApp(async (app) => {
    const isOjs = app.name === 'ojs', isOmp = app.name === 'omp', isOps = app.name === 'ops';
    let S = fs.existsSync(stateFile(app)) ? JSON.parse(fs.readFileSync(stateFile(app), 'utf8')) : null;
    if (!S || on('reseed')) S = await seed(app);
    const C = S.ctx;
    const fact = (k, v) => { record('facts', {[k]: v}, {merge: true}); console.log(`[${app.name}] ${k}:`, JSON.stringify(v).slice(0, 2500)); };
    const {page, close} = await launch(app);
    const dialogs = [];
    page.on('dialog', async (d) => { dialogs.push(`${d.type()}: ${d.message()}`); await d.accept().catch(() => {}); });
    const as = async (u) => signIn(page, u, {contextPath: C});
    const step = async (name, fn) => {
        if (!on(name)) return;
        try { await fn(); } catch (e) { fact(`${name}-ERROR`, String(e.stack || e).slice(0, 800)); await shot(page, `err-${name}`).catch(() => {}); }
    };
    // Row names per app.
    const CE = isOps ? 'Editorial Board Member' : 'Copyeditor';
    const MGR = isOjs ? 'Journal manager' : isOmp ? 'Press manager' : 'Preprint Server manager';
    const PROD = isOjs ? 3 : isOmp ? 4 : 0; // Production column index
    const COPY = isOjs ? 2 : isOmp ? 3 : null;
    const SUBM = isOps ? null : 0;
    try {
        // ---- levels: the list as each manager-level account and admin sees it (Rules 7, 8 for every manager)
        await step('levels', async () => {
            const who = isOps ? [['m', `${S.t}m`], ['admin', 'admin']] : [['m', `${S.t}m`], ['ed', `${S.t}ed`], ['pe', `${S.t}pe`], ['admin', 'admin']];
            const r = {};
            for (const [k, u] of who) {
                await as(u);
                await gotoRoles(page, app, C);
                const g = await readGrid(page);
                await snap(page, `k2-01-roles-as-${k}`);
                r[k] = {cols: g.cols, rows: rowsLine(g)};
                // one press + revert on a live box (Copyeditor's Submission; OPS the board member's Production)
                const idx = isOps ? PROD : SUBM;
                const p1 = await press(page, CE, idx);
                await gotoRoles(page, app, C);
                const mid = await rowBoxes(page, CE);
                const p2 = await press(page, CE, idx);
                await gotoRoles(page, app, C);
                r[k].pressRevert = {p1: {status: p1.status, notices: p1.notices, before: p1.before}, afterReload1: mid, p2: {status: p2.status, notices: p2.notices}, afterReload2: await rowBoxes(page, CE)};
            }
            fact('levels', r);
            if (isOjs) {
                await loc(page, 'Roles list: a row by its name', rowLoc(page, 'Copyeditor'));
                await loc(page, 'Roles list: a row\'s stage boxes (column order)', rowLoc(page, 'Copyeditor').locator('input[type=checkbox]'));
            }
            // Controls: lower levels typing the address.
            const low = isOps ? [['se', `${S.t}se`], ['eb', `${S.t}eb`], ['au', `${S.t}au`]] : [['se', `${S.t}se`], ['ce', `${S.t}ce`], ['au', `${S.t}au`]];
            const c = {};
            for (const [k, u] of low) {
                await as(u);
                const resp = await page.goto(app.url(`/index.php/${C}/en/management/settings/access`)).catch(() => null);
                await idle(page);
                await snap(page, `k2-02-typed-address-as-${k}`);
                c[k] = {status: resp && resp.status(), url: page.url().replace(/^.*index\.php/, ''), roleGrid: await page.locator('#roleGridContainer').count(), h1: await page.locator('h1').first().innerText().catch(() => null)};
            }
            fact('lowLevels', c);
        });

        // ---- greyed: clicks on greyed boxes, and the open boxes of the Subscription Manager and reviewer rows (Rule 7, fn-g)
        await step('greyed', async () => {
            await as(`${S.t}m`);
            await gotoRoles(page, app, C);
            const g = await readGrid(page);
            await snap(page, 'k2-03-greyed-grid');
            const r = {grid: rowsLine(g), greyClicks: {}};
            for (const row of g.rows) {
                const boxes = row.boxes.split(' ');
                const di = boxes.findIndex((b) => b.endsWith('d'));
                if (di < 0) continue;
                // a user's click on the greyed box (force: the browser itself ignores clicks on a disabled input)
                const ww = page.waitForResponse((x) => /assign-stage|unassign-stage/.test(x.url()), {timeout: 2000}).catch(() => null);
                await rowLoc(page, row.name).locator('input[type=checkbox]').nth(di).click({force: true, timeout: 3000}).catch(() => {});
                const resp = await ww;
                r.greyClicks[row.name] = {box: di, request: resp ? `${resp.status()} ${resp.url().slice(-80)}` : null, after: await rowBoxes(page, row.name)};
            }
            // The open boxes the question names: every open box of these rows, ticked then unticked, read after reload each time.
            const targets = [];
            if (isOjs) targets.push(['Subscription Manager', [0, 1, 2, 3]], ['K2 subscription role', [0, 1, 2, 3]], ['Reviewer', [1]], ['K2 reviewer role', [1]]);
            if (isOmp) targets.push(['Internal Reviewer', [1, 2]], ['External Reviewer', [1, 2]], ['K2 reviewer role', [1, 2]]);
            if (isOps) targets.push(['K2 reviewer role', [0]], ['K2 reader role', [0]]);
            r.open = {};
            for (const [name, idxs] of targets) {
                for (const i of idxs) {
                    await gotoRoles(page, app, C);
                    if (!(await rowPresent(page, name))) { r.open[`${name}#${i}`] = 'ROW ABSENT'; continue; }
                    const a = await press(page, name, i);
                    await gotoRoles(page, app, C);
                    const afterA = await rowBoxes(page, name);
                    let b = null, afterB = null;
                    if (a.status) {
                        b = await press(page, name, i);
                        await gotoRoles(page, app, C);
                        afterB = await rowBoxes(page, name);
                    }
                    r.open[`${name}#${i}`] = {before: a.before, click: a.click, s1: a.status, n1: a.notices, reload1: afterA, s2: b && b.status, n2: b && b.notices, reload2: afterB};
                }
            }
            if (isOmp) await snap(page, 'k2-04-omp-reviewer-rows-after');
            fact('greyed', r);
        });

        // ---- stage6: what a ticked box gives the role's member and the stage's "Assign" (Rule 6)
        await step('stage6', async () => {
            const r = {};
            const member = isOps ? `${S.t}eb` : `${S.t}ce`;
            const key = 'workflow_5';
            const readMember = async (label) => {
                await as(member);
                await page.goto(wfUrl(app, C, S.sub, key));
                await idle(page); await sleep(800);
                await snap(page, `k2-05-member-production-${label}`);
                return stageRead(page);
            };
            const readAssign = async (label) => {
                await as(`${S.t}m`);
                await page.goto(wfUrl(app, C, S.sub, key));
                await idle(page); await sleep(800);
                await snap(page, `k2-06-manager-production-${label}`);
                return assignRoles(page);
            };
            await as(`${S.t}m`);
            await gotoRoles(page, app, C);
            r.rowBefore = await rowBoxes(page, CE);
            r.memberBefore = await readMember('before');
            r.assignBefore = await readAssign('before');
            await gotoRoles(page, app, C);
            r.tick = await press(page, CE, PROD);
            await gotoRoles(page, app, C);
            r.rowTicked = await rowBoxes(page, CE);
            r.memberTicked = await readMember('ticked');
            r.assignTicked = await readAssign('ticked');
            await gotoRoles(page, app, C);
            r.untick = await press(page, CE, PROD);
            await gotoRoles(page, app, C);
            r.rowAfter = await rowBoxes(page, CE);
            r.memberAfter = await readMember('unticked');
            r.assignAfter = await readAssign('unticked');
            fact('stage6', r);
        });

        // ---- press8: a press saves at once; notice wording; nothing asks (Rule 8)
        await step('press8', async () => {
            await as(`${S.t}m`);
            const r = {dialogsBefore: dialogs.length};
            await gotoRoles(page, app, C);
            r.tick = await press(page, CE, PROD);
            await snap(page, 'k2-07-press-tick-same-page');
            await gotoRoles(page, app, C);
            r.tickReload = await rowBoxes(page, CE);
            await snap(page, 'k2-08-press-tick-reloaded');
            r.untick = await press(page, CE, PROD);
            await snap(page, 'k2-09-press-untick-same-page');
            await gotoRoles(page, app, C);
            r.untickReload = await rowBoxes(page, CE);
            // a custom role's box too
            r.customTick = await press(page, 'K2 assistant role', PROD);
            await gotoRoles(page, app, C);
            r.customTickReload = await rowBoxes(page, 'K2 assistant role');
            r.customUntick = await press(page, 'K2 assistant role', PROD);
            await gotoRoles(page, app, C);
            r.customUntickReload = await rowBoxes(page, 'K2 assistant role');
            r.dialogs = dialogs.slice(r.dialogsBefore);
            r.modalOpen = await page.locator('[role=dialog]:visible').count();
            fact('press8', r);
            if (isOjs) await loc(page, 'Roles list: page notice toast after a press', page.locator('.app__notifications'));
        });

        // ---- last9: a role's only stage (Rule 9, fn-h)
        await step('last9', async () => {
            await as(`${S.t}m`);
            const r = {};
            const ONE = isOps ? 'K2 one-stage role' : 'Copyeditor';
            const idx = isOps ? PROD : COPY;
            await gotoRoles(page, app, C);
            r.before = await rowBoxes(page, ONE);
            r.untick = await press(page, ONE, idx);
            await gotoRoles(page, app, C);
            r.reload = await rowBoxes(page, ONE);
            await snap(page, 'k2-10-last-stage-unticked-reloaded');
            let f = await openEdit(page, ONE);
            r.windowAfterListUntick = f ? await formStages(f) : 'no edit';
            await snap(page, 'k2-11-last-stage-window');
            if (f) await cancelForm(page);
            // put the one stage back through the list, then untick it in the window
            await gotoRoles(page, app, C);
            r.retick = await press(page, ONE, idx);
            await gotoRoles(page, app, C);
            r.retickReload = await rowBoxes(page, ONE);
            f = await openEdit(page, ONE);
            r.windowBefore = await formStages(f);
            const boxes = f.locator('input[name="assignedStages[]"]');
            const n = await boxes.count();
            for (let i = 0; i < n; i++) if (await boxes.nth(i).isChecked()) await boxes.nth(i).uncheck();
            r.windowUnticked = await formStages(f);
            await snap(page, 'k2-12-window-last-stage-unticked');
            r.ok = await okForm(page);
            r.samePageRow = await rowBoxes(page, ONE);
            await gotoRoles(page, app, C);
            r.reloadRow = await rowBoxes(page, ONE);
            f = await openEdit(page, ONE);
            r.windowReopened = await formStages(f);
            await snap(page, 'k2-13-window-reopened');
            await cancelForm(page);
            fact('last9', r);
        });

        // ---- twice10: a box pressed twice without a reload; "Remove" (Rule 10, A5, fn-i)
        await step('twice10', async () => {
            await as(`${S.t}m`);
            const r = {};
            // tick, then the same box again
            await gotoRoles(page, app, C);
            r.tickStart = await rowBoxes(page, CE);
            r.tick1 = await press(page, CE, PROD);
            r.tick2 = await press(page, CE, PROD);
            await snap(page, 'k2-14-twice-tick-same-page');
            await gotoRoles(page, app, C);
            r.tickReload = await rowBoxes(page, CE);
            await snap(page, 'k2-15-twice-tick-reloaded');
            // now ticked: untick, then the same box again
            r.untick1 = await press(page, CE, PROD);
            r.untick2 = await press(page, CE, PROD);
            await snap(page, 'k2-16-twice-untick-same-page');
            await gotoRoles(page, app, C);
            r.untickReload = await rowBoxes(page, CE);
            // a third press after the double press: which way does it go?
            r.third1 = await press(page, CE, PROD);
            r.third2 = await press(page, CE, PROD);
            r.third3 = await press(page, CE, PROD);
            await gotoRoles(page, app, C);
            r.thirdReload = await rowBoxes(page, CE);
            // another row pressed after a press: does the second row behave?
            r.other1 = await press(page, CE, PROD);
            r.other2 = await press(page, 'K2 assistant role', PROD);
            await gotoRoles(page, app, C);
            r.otherReload = {[CE]: await rowBoxes(page, CE), 'K2 assistant role': await rowBoxes(page, 'K2 assistant role')};
            // clean up to unticked
            for (const nm of [CE, 'K2 assistant role']) {
                if ((await rowBoxes(page, nm)).split(' ')[PROD].startsWith('x')) { await press(page, nm, PROD); await gotoRoles(page, app, C); }
            }
            r.cleanup = {[CE]: await rowBoxes(page, CE), 'K2 assistant role': await rowBoxes(page, 'K2 assistant role')};
            // Remove an unheld custom role
            const ctl = await openRowActions(page, 'K2 removable role');
            r.removeOffered = !!ctl;
            if (ctl) {
                await ctl.getByRole('link', {name: 'Remove', exact: true}).click();
                const dlg = page.getByRole('dialog').last();
                await dlg.getByRole('button', {name: 'OK', exact: true}).waitFor({timeout: T});
                r.confirmText = (await dlg.innerText()).replace(/\s+/g, ' ').trim();
                await snap(page, 'k2-17-remove-confirm');
                const before = await noticeTexts(page);
                const w = page.waitForResponse((x) => x.url().includes('remove-user-group'), {timeout: T}).catch(() => null);
                await dlg.getByRole('button', {name: 'OK', exact: true}).click();
                const resp = await w;
                r.removeStatus = resp && resp.status();
                r.removeBody = resp ? (await resp.text().catch(() => '')).slice(0, 300) : null;
                r.removeNotices = await newNotices(page, before);
                await idle(page); await sleep(800);
                r.listedSamePage = await rowPresent(page, 'K2 removable role');
                r.samePageRows = rowsLine(await readGrid(page)).slice(-6);
                await snap(page, 'k2-18-after-remove-same-page');
                // the removed role's row, still listed: a press on one of its boxes
                if (r.listedSamePage) r.staleRowPress = await press(page, 'K2 removable role', PROD);
                await gotoRoles(page, app, C);
                r.listedAfterReload = await rowPresent(page, 'K2 removable role');
                await snap(page, 'k2-19-after-remove-reloaded');
            }
            fact('twice10', r);
        });

        // ---- mgr11: the manager-level rows (Rule 11, A2, fn-j)
        await step('mgr11', async () => {
            await as(`${S.t}m`);
            const r = {};
            await gotoRoles(page, app, C);
            const g = await readGrid(page);
            r.mgrRows = rowsLine(g).filter((x) => /manager|editor/i.test(x) && /Manager\s*\|/.test(x));
            r.allRows = rowsLine(g);
            // the stage filter, each stage
            const stages = g.cols.filter((c) => /Submission|Review|Copyediting|Production/.test(c));
            r.filter = {};
            for (const st of stages) {
                await gotoRoles(page, app, C);
                const status = await chooseFilter(page, 'selectedStageId', st);
                const gg = await readGrid(page);
                r.filter[st] = {status, rows: gg.rows.map((x) => x.name)};
                await snap(page, `k2-20-filter-${st.replace(/\W+/g, '')}`);
            }
            // the manager's own access to every stage and the "Assign" roles at each
            const keys = isOps ? ['workflow_5'] : isOmp ? ['workflow_1', 'workflow_2', 'workflow_3', 'workflow_4', 'workflow_5'] : ['workflow_1', 'workflow_3', 'workflow_4', 'workflow_5'];
            r.managerStages = {};
            for (const k of keys) {
                await page.goto(wfUrl(app, C, S.sub, k));
                await idle(page); await sleep(800);
                const s = await stageRead(page);
                await snap(page, `k2-21-manager-${k}`);
                let a = null;
                if (s.assignButton) a = await assignRoles(page).catch((e) => ({error: String(e.message).slice(0, 100)}));
                r.managerStages[k] = {noAccess: s.noAccess, roleRefused: s.roleRefused, heads: s.heads, assignOptions: a && a.options};
            }
            // a manager-level window saved: its stages change (Rule 11 "only a save of the role's window")
            const target = isOps ? 'K2 manager role' : 'Production editor';
            await gotoRoles(page, app, C);
            r.winRowBefore = await rowBoxes(page, target);
            const f = await openEdit(page, target);
            r.winStages = f ? await formStages(f) : 'no edit';
            await snap(page, 'k2-22-manager-level-window');
            if (f) {
                r.winOk = await okForm(page);
                r.winRowSamePage = await rowBoxes(page, target);
                await gotoRoles(page, app, C);
                r.winRowReload = await rowBoxes(page, target);
                await snap(page, 'k2-23-manager-level-window-saved-reloaded');
            }
            // the custom manager-level role's row
            r.customMgrRow = await rowBoxes(page, 'K2 manager role');
            fact('mgr11', r);
        });

        // ---- sweep: tab switch after a press, keyboard Space, leaving the page
        await step('sweep', async () => {
            await as(`${S.t}m`);
            const r = {};
            await gotoRoles(page, app, C);
            r.pressed = await press(page, CE, PROD);
            // switch to "Users" (or the first other tab) and back
            const tabs = await page.getByRole('tab').allInnerTexts();
            r.tabs = tabs.map((x) => x.trim());
            const other = page.getByRole('tab').filter({hasNotText: /^\s*Roles\s*$/}).first();
            await other.click(); await idle(page); await sleep(500);
            await page.locator('#roles-button').first().click(); await idle(page); await sleep(800);
            r.afterTabSwitch = await rowBoxes(page, CE);
            await snap(page, 'k2-24-after-tab-switch');
            await gotoRoles(page, app, C);
            r.reload = await rowBoxes(page, CE);
            // keyboard: focus the same box, Space
            const box = rowLoc(page, CE).locator('input[type=checkbox]').nth(PROD);
            await box.focus();
            const ww = page.waitForResponse((x) => /assign-stage|unassign-stage/.test(x.url()), {timeout: 5000}).catch(() => null);
            const before = await noticeTexts(page);
            await page.keyboard.press('Space');
            const resp = await ww;
            r.space = {request: resp ? `${resp.status()} ${resp.url().replace(/^.*\$\$\$call\$\$\$\//, '').split('?')[0]}` : null, notices: resp ? await newNotices(page, before) : '', boxAtOnce: await box.evaluate((i) => i.checked)};
            await gotoRoles(page, app, C);
            r.spaceReload = await rowBoxes(page, CE);
            // the cell around the box: a click beside it
            const cell = rowLoc(page, CE).locator('td').nth(2 + PROD);
            const ww2 = page.waitForResponse((x) => /assign-stage|unassign-stage/.test(x.url()), {timeout: 3000}).catch(() => null);
            await cell.click({position: {x: 2, y: 2}}).catch(() => {});
            r.cellClick = (await ww2) ? 'request' : 'nothing';
            // column heading: is it a control?
            r.headerLinks = await grid(page).locator('thead th a, thead th button').count();
            // leave with the filter chosen (nothing unsaved on this tab beyond the filter)
            await chooseFilter(page, 'selectedStageId', await grid(page).locator('select[name="selectedStageId"] option').nth(1).innerText());
            const dl = dialogs.length;
            await page.goto(app.url(`/index.php/${C}/en/management/settings/context`)).catch(() => {});
            await idle(page);
            r.leaveDialogs = dialogs.slice(dl);
            // clean up
            await gotoRoles(page, app, C);
            if ((await rowBoxes(page, CE)).split(' ')[PROD].startsWith('x')) { await press(page, CE, PROD); await gotoRoles(page, app, C); }
            r.cleanup = await rowBoxes(page, CE);
            fact('sweep', r);
        });
    } finally {
        fact('allDialogs', dialogs);
        await close();
    }
});
