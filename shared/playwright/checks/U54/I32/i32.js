// U54 claim check I32 (housekeeping incidentals, U54 row 2026-11-10): what
// the role window's "OK" leaves of a role's stage-6 (Done) grant, which the
// window has no box for, and what that grant changes on a submission resting
// in Done; with the default-roles paragraph (spec l.71-115), the "Stage
// Assignment" row (l.125) and the level table (l.132-147) read on a new
// context.
//
// Runs on PKP's default dataset, dataset fleet 3 (feature inc-U54), one app
// per process, three parts, each part twice (PROBE_RUN=r1, r2), the fleet
// reset before every "before" and "after" part:
//   npm run reset:<app> -- --dataset 3
//   PART=<defaults|before|after> PROBE_RUN=<r1|r2> PROBE_FEATURE=inc-U54 PROBE_AGENT=cc1111b \
//     bin/app-lock.sh shared <app> -- node bin/probe.js <app> shared/playwright/checks/U54/I32/i32.js
// PART=defaults seeds its own scratch context (tag i32…) with one manager and
//   reads every role row, every row's "Edit" window and each level of "Create
//   New Role"; one window left by "Cancel" with a box changed; a role created
//   through level changes (greyed boxes keep their ticks); then "OK" on two
//   rows' windows with nothing changed, and the context's user_group_stage /
//   user_group_settings rows before and after.
// PART=before reads, on the dataset's publicknowledge as installed, the Done
//   submissions of the accounts below (workflow, Production entry, the
//   dashboard's "Published" view); on OJS the recommend-only Section editor
//   presses "Return to Workflow" › "Confirm" on submission 1 (the dataset as
//   installed; I32-4).
// PART=after: the manager rvaca saves the target roles' windows (one box
//   changed on the first, nothing changed on the rest), the rows and windows
//   read before, right after and after a reload, the SQL rows before and
//   after each save; then the same reads as PART=before.
// Outputs (.reports/inc-U54/cc1111b/): `<part>-<name>-<run>-<app>.json/.png`
// snapshots and `facts-<part>-<run>-<app>.json` (outFile, written here only).
// No other script or file is read.
const {forEachApp, launch, signIn, signOut, screen, shot, record, idle, tag, sql, note, outFile, loc} = require('../../../probe');
const fs = require('fs');

const PART = process.env.PART || 'defaults';
const RUN = process.env.PROBE_RUN || 'r1';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rel = (u) => String(u || '').replace(/^https?:\/\/[^/]+/, '');
const flat = (s, n = 600) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, n);

// The roles saved in PART=after: [role name, change] (change: the option box
// unticked, or null for "OK" with nothing changed).
const TARGETS = {
    ojs: [['Journal editor', 'Permit changes to Settings'], ['Section editor', null], ['Layout Editor', null], ['Author', null]],
    omp: [['Press editor', 'Permit changes to Settings'], ['Series editor', null], ['Layout Editor', null], ['Author', null]],
    ops: [['Moderator', 'Consider role in masthead list'], ['Author', null]],
};
// The accounts read on a Done submission: [username, submission, dashboard, press "Return to Workflow"?]
const ACCOUNTS = {
    ojs: [['dbarnes', 1, 'editorial'], ['dbuskins', 17, 'editorial'], ['shellier', 1, 'editorial'], ['amwandenga', 1, 'mySubmissions'], ['sberardo', 1, 'editorial', true]],
    omp: [['dbarnes', 14, 'editorial'], ['gcox', 14, 'editorial'], ['mdawson', 14, 'mySubmissions']],
    ops: [['dbuskins', 2, 'editorial'], ['ckwantes', 2, 'mySubmissions']],
};
// The scratch context's rows saved with nothing changed in PART=defaults.
const SCRATCH_SAVES = {ojs: ['Journal editor', 'Section editor'], omp: ['Press editor', 'Series editor'], ops: ['Moderator', 'Author']};

forEachApp(async (app) => {
    const {RolesTab} = require('../../../pages/RolesConfigurationPages.js');
    const facts = {app: app.name, part: PART, run: RUN, dataset: app.dataset};
    const fact = (k, v) => {
        facts[k] = v;
        console.log(`[${app.name}] ${k}: ${JSON.stringify(v).slice(0, 900)}`);
    };
    const save = () => fs.writeFileSync(outFile(`facts-${PART}.json`), JSON.stringify(facts, null, 2));
    const {table, id: idCol} = app.contextTables;

    const groups = (ctxId) => sql(app, `select ug.user_group_id, ug.role_id,
            (select setting_value from user_group_settings s where s.user_group_id=ug.user_group_id and setting_name='name' and locale='en'),
            coalesce((select string_agg(stage_id::text, ',' order by stage_id) from user_group_stage x where x.user_group_id=ug.user_group_id), ''),
            coalesce((select setting_value from user_group_settings s where s.user_group_id=ug.user_group_id and setting_name='recommendOnly'), '(no row)'),
            ug.permit_self_registration, ug.permit_metadata_edit, ug.permit_settings, ug.masthead
          from user_groups ug where ug.context_id=${ctxId} order by 1`).split('\n').filter(Boolean).map((l) => {
        const [id, role, name, stages, recommendOnly, sr, me, ps, mh] = l.split('|');
        return {id: +id, role: +role, name, stages, recommendOnly, sr, me, ps, mh};
    });
    const settingsRows = (ugId) => sql(app, `select locale, setting_name, setting_value from user_group_settings where user_group_id=${ugId} and setting_name not in ('name','abbrev') order by 2,1`).split('\n').filter(Boolean);

    const {page, close} = await launch(app);
    let cur = null;
    page.on('response', async (r) => {
        if (!cur) return;
        const u = r.url();
        if (/\/api\/v1\/|\$\$\$call\$\$\$/.test(u) && !/\/css\?|_i18n/.test(u) || r.status() >= 400) {
            const line = `${r.request().method()} ${r.status()} ${rel(u).replace(/^\/index\.php\/[^/]+/, '~')}`;
            cur.req.push(line);
            if (/\/decisions/.test(u) && r.request().method() !== 'GET') {
                cur.decisionBody = flat(await r.text().catch(() => ''), 600);
            }
        }
    });
    page.on('console', (m) => {
        if (cur && m.type() === 'error') cur.console.push(flat(m.text(), 200));
    });
    page.on('pageerror', (e) => {
        if (cur) cur.pageerror.push(flat(e.message, 200));
    });
    const begin = () => (cur = {req: [], console: [], pageerror: []});
    const end = () => {
        const c = cur;
        cur = null;
        return c;
    };
    async function snap(name) {
        await idle(page).catch(() => {});
        await sleep(500);
        const s = await screen(page);
        record(`${PART}-${name}`, s);
        await shot(page, `${PART}-${name}`).catch(() => {});
        return s;
    }

    // The role window, as data.
    async function readWindow() {
        return page.locator('form#userGroupForm').evaluate((form) => {
            const vis = (e) => !!(e && (e.offsetWidth || e.offsetHeight || e.getClientRects().length));
            const lab = (i) => {
                const l = i.id && form.querySelector(`label[for="${i.id}"]`);
                return ((l && l.innerText) || (i.closest('label') && i.closest('label').innerText) || '').trim().replace(/\s+/g, ' ');
            };
            const sel = form.querySelector('select[name="roleId"]');
            const sc = form.querySelector('#userGroupStageContainer');
            return {
                level: sel ? sel.options[sel.selectedIndex].text.trim() : null,
                levelDisabled: sel ? sel.disabled : null,
                stageSectionShown: vis(sc),
                stages: [...form.querySelectorAll('input[name="assignedStages[]"]')].map((i) => ({label: lab(i), value: i.value, checked: i.checked, disabled: i.disabled, shown: vis(i)})),
                options: [...form.querySelectorAll('input[type="checkbox"]:not([name="assignedStages[]"])')].map((i) => ({label: lab(i), name: i.name, checked: i.checked, disabled: i.disabled, shown: vis(i)})),
            };
        });
    }
    const winClose = async () => {
        await page.locator('form#userGroupForm').getByRole('link', {name: 'Cancel', exact: true}).click().catch(() => {});
        await page.locator('form#userGroupForm').waitFor({state: 'detached', timeout: 15000}).catch(() => {});
        await sleep(700);
    };

    // The whole Roles list: columns and every row's level and boxes.
    async function readList(roles) {
        const columns = await roles.columns();
        const rows = await roles.grid.locator('tbody tr.gridRow').evaluateAll((trs) => trs.map((tr) => ({
            id: tr.id,
            name: (tr.querySelector('[id$="-name"] .label') || {}).innerText?.trim(),
            level: (tr.querySelector('[id$="-roleId"] .label') || {}).innerText?.trim(),
            boxes: [...tr.querySelectorAll('input[type="checkbox"]')].map((b) => `${b.checked ? 'x' : '-'}${b.disabled ? 'g' : ''}`).join(' '),
            arrow: !!tr.querySelector('a.show_extras, a.hide_extras'),
        })));
        return {columns, paging: await roles.pagingLine(), rows};
    }

    // A Done submission, read as one account.
    async function effect([user, sub, dash, decide], label) {
        const out = {user, sub, dash};
        begin();
        await signIn(page, user, {contextPath: 'publicknowledge'});
        await page.waitForLoadState('load').catch(() => {});
        const s0 = await snap(`${label}-${user}-landing`);
        out.landing = {url: rel(page.url()), main: flat(s0.text && s0.text.main, 300), ...end()};
        if (dash === 'editorial') {
            begin();
            await page.goto(app.url('/index.php/publicknowledge/dashboard/editorial?currentViewId=published'));
            const s1 = await snap(`${label}-${user}-published`);
            out.published = {url: rel(page.url()), main: flat(s1.text && s1.text.main, 500), ...end()};
        }
        begin();
        await page.goto(app.url(`/index.php/publicknowledge/dashboard/${dash}?workflowSubmissionId=${sub}`));
        await page.getByRole('dialog').first().waitFor({timeout: 30000}).catch(() => {});
        const s2 = await snap(`${label}-${user}-workflow`);
        const dlg = page.getByRole('dialog').first();
        out.workflow = {
            url: rel(page.url()),
            dialog: flat(s2.text && s2.text.dialog, 1500),
            buttons: (await dlg.getByRole('button').allInnerTexts().catch(() => [])).map((x) => flat(x, 60)).filter(Boolean),
            nav: (await dlg.locator('nav a, nav button').allInnerTexts().catch(() => [])).map((x) => flat(x, 60)).filter(Boolean),
            ...end(),
        };
        const prod = dlg.locator('nav').getByText('Production', {exact: true}).first();
        if (await prod.count()) {
            begin();
            await prod.click({timeout: 10000}).catch((e) => cur.console.push(`press Production: ${flat(e.message, 80)}`));
            const s3 = await snap(`${label}-${user}-production`);
            out.production = {dialog: flat(s3.text && s3.text.dialog, 1500).replace(/^.*?WORKFLOW: PRODUCTION/, 'WORKFLOW: PRODUCTION'), ...end()};
        }
        const rtw = dlg.getByRole('button', {name: 'Return to Workflow', exact: true});
        out.returnToWorkflowOffered = (await rtw.count()) > 0;
        if (decide && PART === 'before' && out.returnToWorkflowOffered) {
            begin();
            await rtw.first().click();
            const confirm = page.getByRole('dialog', {name: 'Return to Workflow', exact: true});
            await confirm.waitFor({timeout: 20000}).catch(() => {});
            const s4 = await snap(`${label}-${user}-rtw-dialog`);
            out.rtwDialog = flat(s4.text && s4.text.dialog, 300);
            await confirm.getByRole('button', {name: 'Confirm', exact: true}).click().catch((e) => cur.console.push(`confirm: ${flat(e.message, 80)}`));
            await page.waitForResponse((r) => /\/decisions/.test(r.url()) && r.request().method() !== 'GET', {timeout: 20000}).catch(() => {});
            await sleep(1500);
            const s5 = await snap(`${label}-${user}-rtw-after`);
            out.rtwAfter = {dialog: flat(s5.text && s5.text.dialog, 600), notices: s5.notices, ...end()};
            out.stageAfter = sql(app, `select stage_id from submissions where submission_id=${sub}`);
            out.decisionsAfter = sql(app, `select decision, stage_id, editor_id from edit_decisions where submission_id=${sub} order by edit_decision_id desc limit 2`);
            await page.reload().catch(() => {});
            await page.getByRole('dialog').first().waitFor({timeout: 30000}).catch(() => {});
            const s6 = await snap(`${label}-${user}-rtw-reload`);
            out.rtwReload = flat(s6.text && s6.text.dialog, 400);
        }
        await signOut(page).catch(() => {});
        return out;
    }

    try {
        if (PART === 'defaults') {
            const t = tag('i32');
            await app.api.createContext({tag: t, context: {name: `U54 I32 ${t}`}, users: [{username: `${t}m`, roles: ['manager'], givenName: 'Mana', familyName: 'Ithirtytwo'}]});
            const ctxId = +sql(app, `select ${idCol} from ${table} where path='${t}'`);
            fact('scratch', {path: t, ctxId});
            fact('sql new context', groups(ctxId));
            await signIn(page, `${t}m`, {contextPath: t});
            const roles = new RolesTab(page, t, {stages: []});
            await roles.goto();
            roles.stages = (await roles.columns()).slice(2);
            await snap('list');
            const list = await readList(roles);
            fact('list', list);
            const windows = {};
            for (const row of list.rows) {
                if (!row.arrow) {
                    windows[row.name] = 'no Settings arrow';
                    continue;
                }
                const win = await roles.openEdit(row.name);
                await win.expectReady();
                windows[row.name] = await readWindow();
                await snap(`win-${row.name.replace(/[^A-Za-z]/g, '')}`);
                await winClose();
            }
            fact('edit windows', windows);
            // Left once with a box changed and unsaved: "Cancel", the browser
            // dialogs on the way out recorded and accepted, then read again.
            {
                const name = app.name === 'ops' ? 'Moderator' : SCRATCH_SAVES[app.name][1];
                const g0 = groups(ctxId).find((x) => x.name === name);
                const asked = [];
                const onDialog = async (d) => {
                    asked.push(`${d.type()}: ${flat(d.message(), 160)}`);
                    await d.accept().catch(() => {});
                };
                page.on('dialog', onDialog);
                await roles.openEdit(name);
                await page.locator('form#userGroupForm').getByRole('checkbox', {name: 'Consider role in masthead list', exact: true}).last().uncheck();
                begin();
                await page.locator('form#userGroupForm').getByRole('link', {name: 'Cancel', exact: true}).click();
                await sleep(2500);
                const s = await snap('unsaved-cancel');
                const stillOpen = await page.locator('form#userGroupForm').count();
                const traffic = end();
                page.off('dialog', onDialog);
                if (stillOpen) await winClose();
                await roles.reload();
                await roles.openEdit(name);
                const reopened = await readWindow();
                await winClose();
                fact('unsaved cancel', {name, asked, stillOpen, notices: s.notices, traffic, sqlBefore: g0, sqlAfter: groups(ctxId).find((x) => x.name === name),
                    mastheadAfterReopen: reopened.options.find((o) => o.name === 'masthead')});
            }
            // "Create New Role": each level, read on the window as it redraws.
            const cw = await roles.openCreate();
            const levels = {};
            for (const lvl of await cw.levelOptions()) {
                await cw.chooseLevel(lvl);
                await sleep(800);
                levels[lvl] = await readWindow();
            }
            await snap('create-window');
            fact('create window levels', levels);
            fact('window frame', {
                title: flat(await page.getByRole('dialog').filter({has: page.locator('form#userGroupForm')}).getByRole('heading', {level: 1}).innerText().catch(() => null), 80),
                details: await page.locator('form#userGroupForm').getByRole('heading', {name: 'Role details', exact: true}).count(),
                required: await page.locator('form#userGroupForm').getByText('Required fields are marked with an asterisk: *', {exact: true}).count(),
                ok: await page.locator('form#userGroupForm').getByRole('button', {name: 'OK', exact: true}).count(),
                cancelLink: await page.locator('form#userGroupForm').getByRole('link', {name: 'Cancel', exact: true}).count(),
            });
            await winClose();
            // A created role: "Allow user self-registration" ticked under "Author",
            // the level changed to "Assistant" (it greys out); the first stage box
            // ticked there, the level changed to "Reviewer" (it greys out on OJS
            // and OMP); then "OK"; SQL and the row read after.
            {
                const cw2 = await roles.openCreate();
                await cw2.chooseLevel('Author');
                await cw2.optionBox('Allow user self-registration').check();
                await cw2.chooseLevel('Assistant');
                await sleep(800);
                const afterAssistant = await readWindow();
                await page.locator('form#userGroupForm input[name="assignedStages[]"]').first().check();
                await cw2.chooseLevel('Reviewer');
                await sleep(800);
                const greyed = await readWindow();
                greyed.afterAssistantSR = afterAssistant.options.find((o) => o.name === 'permitSelfRegistration');
                await cw2.nameBox('en').fill(`I32 Role ${t.slice(-4)}`);
                await cw2.abbrevBox('en').fill('I32R');
                const resp = await cw2.save();
                const g = groups(ctxId).find((x) => x.name === `I32 Role ${t.slice(-4)}`);
                await roles.reload();
                fact('created role', {srUnderAssistant: greyed.afterAssistantSR, underReviewer: {stageSectionShown: greyed.stageSectionShown, stages: greyed.stages, sr: greyed.options.find((o) => o.name === 'permitSelfRegistration')},
                    answer: flat(await resp.text().catch(() => ''), 80), sql: g, settings: g && settingsRows(g.id),
                    row: (await readList(roles)).rows.find((r) => r.name === `I32 Role ${t.slice(-4)}`)});
            }
            // "OK" with nothing changed on two rows; SQL and rows before/after.
            const saves = {};
            for (const name of SCRATCH_SAVES[app.name]) {
                const g = groups(ctxId).find((x) => x.name === name);
                const o = {group: g && g.id, sqlBefore: g, settingsBefore: g && settingsRows(g.id)};
                const win = await roles.openEdit(name);
                o.window = await readWindow();
                begin();
                const resp = await win.save();
                o.answer = flat(await resp.text().catch(() => ''), 200);
                const s = await snap(`scratch-saved-${name.replace(/[^A-Za-z]/g, '')}`);
                o.notices = s.notices;
                o.traffic = end();
                o.rowSamePage = (await readList(roles)).rows.find((r) => r.name === name);
                o.sqlAfter = groups(ctxId).find((x) => x.id === o.group);
                o.settingsAfter = settingsRows(o.group);
                await roles.reload();
                o.rowAfterReload = (await readList(roles)).rows.find((r) => r.name === name);
                saves[name] = o;
            }
            fact('scratch saves', saves);
            await signOut(page).catch(() => {});
        } else {
            const ctxId = +sql(app, `select ${idCol} from ${table} where path='publicknowledge'`);
            fact('sql before', groups(ctxId));
            fact('done submissions', sql(app, `select submission_id, stage_id, status from submissions where stage_id=6 order by 1`).split('\n'));
            if (PART === 'after') {
                await signIn(page, 'rvaca', {contextPath: 'publicknowledge'});
                const roles = new RolesTab(page, 'publicknowledge', {stages: []});
                await roles.goto();
                roles.stages = (await roles.columns()).slice(2);
                await snap('m-list-before');
                fact('list before', await readList(roles));
                const saves = {};
                for (const [name, change] of TARGETS[app.name]) {
                    const g = groups(ctxId).find((x) => x.name === name);
                    const o = {change, group: g && g.id, sqlBefore: g, settingsBefore: g && settingsRows(g.id)};
                    o.rowBefore = (await readList(roles)).rows.find((r) => r.name === name);
                    const win = await roles.openEdit(name);
                    o.windowBefore = await readWindow();
                    await snap(`m-win-${name.replace(/[^A-Za-z]/g, '')}-before`);
                    if (change) {
                        await win.optionBox(change).uncheck();
                        o.windowChanged = await readWindow();
                    }
                    begin();
                    const resp = await win.save();
                    o.answer = flat(await resp.text().catch(() => ''), 200);
                    const s = await snap(`m-saved-${name.replace(/[^A-Za-z]/g, '')}`);
                    o.notices = s.notices;
                    o.traffic = end();
                    o.rowSamePage = (await readList(roles)).rows.find((r) => r.name === name);
                    o.sqlAfter = groups(ctxId).find((x) => x.id === o.group);
                    o.settingsAfter = settingsRows(o.group);
                    await roles.reload();
                    o.rowAfterReload = (await readList(roles)).rows.find((r) => r.name === name);
                    await roles.openEdit(name);
                    o.windowAfterReload = await readWindow();
                    await snap(`m-win-${name.replace(/[^A-Za-z]/g, '')}-after`);
                    await winClose();
                    saves[name] = o;
                }
                fact('saves', saves);
                await loc(page, 'Roles list rows', page.locator('#roleGridContainer tbody tr.gridRow'));
                await signOut(page).catch(() => {});
                fact('sql after saves', groups(ctxId));
            }
            const effects = {};
            for (const acc of ACCOUNTS[app.name]) {
                try {
                    effects[acc[0]] = await effect(acc, PART);
                } catch (e) {
                    effects[acc[0]] = {error: flat(e.message, 300), traffic: end()};
                    await signOut(page).catch(() => {});
                }
                save();
            }
            fact('effects', effects);
        }
    } finally {
        save();
        await close();
    }
    if (PART === 'after' && RUN === 'r1') {
        note(`cc1111b: I32: on a dataset fleet the role window's "OK" is RoleWindow.save() (RolesConfigurationPages.js); a Done submission's workflow opened by workflowSubmissionId lands on its newest version's "Title & Abstract" (OJS sub 1: "Version of Record 1.1", unpublished), and the stage entries (Production) request stage 5, never 6.`);
    }
});
