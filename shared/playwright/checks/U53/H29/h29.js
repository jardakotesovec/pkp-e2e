// U53 claim check, chunk H29: the incidentals row "Settings › Users & Roles › 'Users', the Site
// Administrator's row › 'Edit'" (housekeeping 2026-10-29; bears on Rule 8, the Actors row "Edit",
// Rule 15 and register A13).
// Runs on a DATASET fleet only (PKP's default test dataset; docs/process/dataset.md): it signs in as
// the dataset's users and changes nothing (no role is saved, no invitation sent).
//   Reads (one fresh browser each):
//     rvaca-admin     rvaca (Journal manager) › Users & Roles › the "admin" row › "Edit"
//     dbarnes-admin   dbarnes (Journal editor, manager-level) › the same
//     rvaca-dbuskins  rvaca › the row of dbuskins (a section editor of this journal) › "Edit"
//     admin-admin     admin › own row › "Edit" (control)
//     admin-rvaca     admin › the row of rvaca › "Edit" (control)
//   Each read records: the list row's text (the "Roles" cell), the row menu's items, the landed
//   address, every GET of the single-user users API with status, error and the groups it names,
//   the dialogs open on landing, the step's roles table rows, "Remove Role" count, the new-role
//   list "Add Another Role" offers; then "OK" on any dialog, a reload, and the same reads again.
//   rvaca-admin also leaves the page once with a role chosen and nothing sent (the breadcrumb
//   "Users & Roles"), recording any question on the way out.
// Facts: outFile('h29-facts.json') → .reports/<PROBE_FEATURE>/<PROBE_AGENT>/h29-facts[-<PROBE_RUN>]-<app>.json
// Snapshots: h29-<read>-<landed|reload>[-<PROBE_RUN>]-<app>.json/.png
// Env: PROBE_RUN (r1, r2 on main; s1, s2 on stable-3_5_0) keeps two runs apart; READS=a,b narrows.
// Run (main, per app, under the app lock):
//   bin/app-lock.sh shared ojs -- env PROBE_RUN=r1 PROBE_FEATURE=issues-cc29c PKP_E2E_DATASET=6 \
//     PROBE_AGENT=cc29c PROBE_NOTES_FEATURE=U53 node bin/probe.js ojs shared/playwright/checks/U53/H29/h29.js
// Run (stable-3_5_0, no lock):
//   PKP_E2E_LINE=stable-3_5_0 PROBE_RUN=s1 PROBE_FEATURE=issues-cc29c-3_5 PKP_E2E_DATASET=6 \
//     PROBE_AGENT=cc29c node bin/probe.js all shared/playwright/checks/U53/H29/h29.js
// No other script or state file is read.
const fs = require('fs');
const {forEachApp, launch, signIn, screen, shot, record, idle, outFile, serverLog} = require('../../../probe');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (s, n = 1500) => (s || '').replace(/\s+/g, ' ').trim().slice(0, n);
const MAIL = (u) => (u === 'admin' ? 'pkpadmin@mailinator.com' : `${u}@mailinator.com`);
const ALL = [
    ['rvaca-admin', 'rvaca', 'admin'],
    ['dbarnes-admin', 'dbarnes', 'admin'],
    ['rvaca-dbuskins', 'rvaca', 'dbuskins'],
    ['admin-admin', 'admin', 'admin'],
    ['admin-rvaca', 'admin', 'rvaca'],
];
const READS = process.env.READS ? process.env.READS.split(',') : ALL.map((r) => r[0]);

forEachApp(async (app) => {
    if (!app.dataset) throw new Error('h29.js runs on a dataset fleet');
    const facts = {app: app.name, line: app.line || 'main', at: new Date().toISOString(), reads: {}};
    const save = () => fs.writeFileSync(outFile('h29-facts.json'), JSON.stringify(facts, null, 2));
    const log = serverLog(app);

    const readStep = async (page, key, phase, gets) => {
        const s = await screen(page);
        record(`h29-${key}-${phase}`, s);
        await shot(page, `h29-${key}-${phase}`);
        const out = {url: new URL(page.url()).pathname, notices: s.notices || [], gets: gets.splice(0)};
        out.dialogs = [];
        const dialogs = page.getByRole('dialog');
        for (let i = 0; i < (await dialogs.count()); i++) {
            if (await dialogs.nth(i).isVisible().catch(() => false)) out.dialogs.push(flat(await dialogs.nth(i).innerText(), 300));
        }
        const dlg = dialogs.filter({hasText: 'Error'}).filter({has: page.getByRole('button', {name: 'OK', exact: true})});
        if (await dlg.count()) {
            await dlg.first().getByRole('button', {name: 'OK', exact: true}).click().catch((e) => { out.okError = e.message; });
            await sleep(800);
            out.dialogsAfterOk = await page.getByRole('dialog').count();
        }
        const rows = page.locator('main').getByRole('row');
        out.tableRows = [];
        for (let i = 0; i < (await rows.count()); i++) out.tableRows.push(flat(await rows.nth(i).innerText(), 300));
        out.removeRole = await page.getByRole('button', {name: 'Remove Role'}).count();
        out.stepHeading = await page.getByRole('heading', {name: /Enter details/}).count();
        return out;
    };

    for (const [key, who, target] of ALL) {
        if (!READS.includes(key)) continue;
        const out = {who, target};
        const from = log.mark();
        const gets = [];
        const {page, close} = await launch(app);
        try {
            page.on('dialog', (d) => { out.browserDialogs = (out.browserDialogs || []).concat(`${d.type()}: ${d.message()}`); d.accept().catch(() => {}); });
            page.on('response', async (resp) => {
                const u = new URL(resp.url());
                if (resp.request().method() !== 'GET' || !/\/api\/v1\/users\/\d+$/.test(u.pathname)) return;
                const e = {path: u.pathname.replace(/^.*\/api\//, 'api/'), status: resp.status()};
                try {
                    const b = await resp.json();
                    e.error = b.error || null;
                    e.groups = Array.isArray(b.groups) ? b.groups.map((g) => `${g.name}${g.dateEnd ? ' (ended)' : ''}`) : null;
                } catch (err) { e.body = 'not JSON'; }
                gets.push(e);
            });
            await signIn(page, who);
            await page.goto(app.url(`/index.php/${app.contextPath}/management/settings/access`));
            await page.getByRole('heading', {name: 'Users & Roles'}).waitFor({state: 'visible', timeout: 30000});
            await idle(page);
            const table = page.getByRole('table', {name: /Current Users \(/});
            let row = table.locator('tbody tr').filter({hasText: MAIL(target)});
            if (!(await row.count())) {
                const search = page.getByRole('searchbox').first();
                await search.fill(MAIL(target)); await search.press('Enter'); await idle(page); await sleep(800);
                row = table.locator('tbody tr').filter({hasText: MAIL(target)});
            }
            out.listRow = (await row.count()) ? flat(await row.first().innerText(), 300) : null;
            out.rolesCell = (await row.count()) ? flat(await row.first().locator('td').nth(2).innerText(), 200) : null;
            if (key === 'rvaca-admin') {
                record(`h29-${key}-list`, await screen(page));
                await shot(page, `h29-${key}-list`);
            }
            if (!out.listRow) throw new Error(`no row for ${target}`);
            await row.first().locator('button').last().click();
            await sleep(400);
            out.menu = (await page.getByRole('menuitem').allInnerTexts()).map((t) => flat(t, 60));
            await page.getByRole('menuitem', {name: /^Edit$/}).click();
            await page.waitForURL(/management\/settings\/user\/\d+/, {timeout: 30000}).catch(() => {});
            await page.getByRole('heading', {name: /Enter details/}).waitFor({state: 'visible', timeout: 30000}).catch(() => {});
            await idle(page); await sleep(1200);
            out.landed = await readStep(page, key, 'landed', gets);
            await page.reload();
            await page.getByRole('heading', {name: /Enter details/}).waitFor({state: 'visible', timeout: 30000}).catch(() => {});
            await idle(page); await sleep(1200);
            out.reload = await readStep(page, key, 'reload', gets);
            const add = page.getByRole('button', {name: 'Add Another Role'});
            if (await add.count()) {
                await add.click(); await sleep(500);
                const sel = page.getByLabel(/^Select a new role/).last();
                out.newRoleOptions = (await sel.count()) ? (await sel.locator('option').allInnerTexts()).map((t) => flat(t, 80)) : null;
                if (key === 'rvaca-admin' && out.newRoleOptions && out.newRoleOptions.length > 1) {
                    // leave once with a role chosen and nothing sent
                    await sel.selectOption({index: 1}).catch(() => {});
                    await sleep(300);
                    await shot(page, `h29-${key}-unsaved`);
                    await page.getByRole('link', {name: 'Users & Roles'}).first().click().catch((e) => { out.leaveError = e.message; });
                    await page.waitForURL(/management\/settings\/access/, {timeout: 15000}).catch(() => {});
                    await idle(page); await sleep(800);
                    out.leftTo = new URL(page.url()).pathname;
                    record(`h29-${key}-left`, await screen(page));
                }
            }
        } catch (e) {
            out.error = flat(String((e && e.message) || e), 400);
        } finally {
            await close();
        }
        out.serverLog = log.since(from).slice(0, 10);
        facts.reads[key] = out;
        console.log(`[fact] ${app.name} ${key}: ${JSON.stringify(out).slice(0, 1500)}`);
        save();
    }
    save();
});
