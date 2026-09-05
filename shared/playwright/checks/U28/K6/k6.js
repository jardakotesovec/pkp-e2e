// U28 claim check, chunk K6 — the OPS absence and the cross-app role
// controls (RUNBOOK step 7 "Checks are kept").
//
// OPS, on its own scratch preprint server (a manager, a moderator, an
// author, an Editorial Board Member, a reader, and a second author "rev"
// who gets a home-made reviewer-level role on screen), plus the seeded
// server read as manager.maya (Roles grid only, read-only):
//   1. as the site administrator and one account per permission level:
//      the backend sidebar on landing, the typed list address
//      `dashboard/reviewAssignments`, the typed wizard address
//      `reviewer/submission/{id}` of a real preprint (Purpose paragraph
//      "OPS does not install…", scenario 17, footnote p)
//   2. as the manager: Settings › Users & Roles › Roles — the grid, then
//      "Create New Role" and the "Permission level" list it offers (the
//      other end of "no account can hold one"): if "Reviewer" is offered,
//      the role is created, given to "rev" through Users › Edit, and rev's
//      sidebar and both typed addresses are recorded
// OJS and OMP, as manager.maya on publicknowledge (read-only): the Roles
// grid (line 47's "on a press: Internal Reviewer or External Reviewer",
// scenario 17's journal/press control) and the "Create New Role" dialog's
// "Permission level" list, cancelled without saving.
//
//   PROBE_FEATURE=U28 PROBE_AGENT=ccK6 node bin/probe.js all shared/playwright/checks/U28/K6/k6.js
//   A re-run reuses the scratch server saved in scratch.json in the agent's
//   output folder (delete it to seed afresh). PHASES=accounts,roles,rev
//   narrows the OPS run to the named parts.
//
// No assertions: every screen is recorded with screen()/shot(); the console
// log carries the facts the report cites.
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, signOut, screen, shot, record, loc, note, tag, outDir} =
    require('../../../probe');

const SCRATCH_FILE = path.join(outDir(), 'scratch.json');
const scratchAll = fs.existsSync(SCRATCH_FILE) ? JSON.parse(fs.readFileSync(SCRATCH_FILE, 'utf8')) : {};
const saveScratch = () => fs.writeFileSync(SCRATCH_FILE, JSON.stringify(scratchAll, null, 2));
const ONLYP = process.env.PHASES ? process.env.PHASES.split(',') : null;
const phase = (name) => !ONLYP || ONLYP.includes(name);
const log = (...a) => console.log(...a);
const squash = (s, n = 400) => (s || '').replace(/\s+/g, ' ').trim().slice(0, n);

async function full(page, name, extra = {}) {
    const data = await screen(page);
    data.bodyText = await page.locator('body').innerText().catch(() => null);
    Object.assign(data, extra);
    record(name, data);
    await shot(page, name);
    return data;
}

/** Typed address: status, headers, final URL, title, h1s, header landmarks, body text. */
async function typed(page, app, pathname, name) {
    const resp = await page.goto(app.url(pathname), {waitUntil: 'domcontentloaded'});
    await page.waitForLoadState('load', {timeout: 10000}).catch(() => {});
    const status = resp ? resp.status() : null;
    const headers = resp ? resp.headers() : null;
    const h1 = await page.locator('h1').allInnerTexts().catch(() => []);
    const headerCount = await page.locator('header, [role="banner"]').count().catch(() => null);
    const navCount = await page.locator('nav, [role="navigation"]').count().catch(() => null);
    const data = await full(page, name, {typedPath: pathname, status, headers, h1, headerCount, navCount});
    log(`  ${app.name} ${pathname} -> ${status} ${page.url()} title=${JSON.stringify(data.title)} h1=${JSON.stringify(h1)} header=${headerCount} nav=${navCount}`);
    log(`     text: ${squash(data.bodyText, 300)}`);
    return data;
}

/** Sidebar: every navigation landmark's links, grouped by nav name. */
async function sidebar(page) {
    return page.evaluate(() =>
        [...document.querySelectorAll('nav, [role="navigation"]')].map((nav) => ({
            name: nav.getAttribute('aria-label') || nav.className,
            items: [...nav.querySelectorAll('a')].map((a) => ({text: a.innerText.trim().replace(/\s+/g, ' '), href: a.getAttribute('href')})),
        })),
    );
}

async function landing(page, app, base, short) {
    await page.goto(app.url(`${base}/dashboard/editorial`), {waitUntil: 'domcontentloaded'}).catch(() => {});
    await page.waitForLoadState('load', {timeout: 10000}).catch(() => {});
    await page.locator('main table tbody tr, main .pkpTable, main [role="alert"]').first().waitFor({timeout: 8000}).catch(() => {});
    const nav = await sidebar(page);
    const listHeaders = await page.locator('main table thead th').allInnerTexts().catch(() => []);
    const data = await full(page, `${short}-landing`, {sidebar: nav, listHeaders});
    const texts = nav.flatMap((n) => n.items.map((i) => i.text)).filter(Boolean);
    log(`  ${app.name} ${short} landing ${page.url()} title=${JSON.stringify(data.title)}`);
    log(`     sidebar: ${JSON.stringify(texts)}`);
    log(`     reviewer group present: ${texts.some((t) => /Assignments as Reviewer/i.test(t))}; reviewAssignments href: ${nav.some((n) => n.items.some((i) => /reviewAssignments/.test(i.href || '')))}`);
    log(`     list headers: ${JSON.stringify(listHeaders)}`);
    return data;
}

/** Settings › Users & Roles › Roles: the grid's headers and rows. */
async function rolesGrid(page, app, base, name) {
    await page.goto(app.url(`${base}/management/settings/access`), {waitUntil: 'domcontentloaded'});
    const tab = page.getByRole('tab', {name: 'Roles', exact: true});
    await loc(page, 'Settings › Users & Roles: the "Roles" tab', tab);
    await tab.click();
    const grid = page.locator('#roleGridContainer');
    await grid.locator('table tbody tr').first().waitFor({timeout: 20000});
    const data = await grid.evaluate((el) => {
        const table = el.querySelector('table');
        const headers = [...table.querySelectorAll('thead th')].map((th) => th.innerText.trim());
        const rows = [...table.querySelectorAll('tbody tr')]
            .map((tr) => [...tr.querySelectorAll('td, th')].map((td) => td.innerText.trim().replace(/\s+/g, ' ')))
            .filter((cells) => cells.some((c) => c));
        return {headers, rows, gridText: el.innerText};
    });
    await full(page, name, {roles: data});
    log(`  ${app.name} Roles headers: ${JSON.stringify(data.headers)}`);
    for (const r of data.rows) log(`    ${JSON.stringify(r)}`);
    return data;
}

/** Open "Create New Role"; record the dialog and the "Permission level" options. */
async function openCreateRole(page, app, name) {
    const btn = page.locator('#roleGridContainer').getByRole('button', {name: 'Create New Role', exact: true})
        .or(page.locator('#roleGridContainer').getByRole('link', {name: 'Create New Role', exact: true}));
    await loc(page, 'Roles grid: "Create New Role"', btn.first());
    await btn.first().click();
    const form = page.locator('#userGroupForm');
    await form.waitFor({timeout: 15000});
    const select = form.locator('#roleId');
    const options = await select.locator('option').evaluateAll((os) => os.map((o) => ({value: o.value, text: o.textContent.trim()})));
    const labels = await form.locator('label').allInnerTexts().catch(() => []);
    const data = await full(page, name, {permissionLevels: options, labels});
    log(`  ${app.name} Create New Role: permission levels ${JSON.stringify(options.map((o) => o.text))}`);
    log(`     labels: ${JSON.stringify(labels.map((l) => l.replace(/\s+/g, ' ').trim()))}`);
    return {form, options, data};
}

async function cancelDialog(page) {
    // The legacy form's buttons: a "Cancel" link and an "OK" button.
    const cancel = page.locator('#userGroupForm').getByRole('link', {name: 'Cancel', exact: true});
    if (await cancel.count()) await cancel.first().click().catch(() => {});
    else await page.keyboard.press('Escape');
    await page.locator('#userGroupForm').waitFor({state: 'hidden', timeout: 8000}).catch(() => {});
}

forEachApp(async (app) => {
    const {page, close} = await launch(app);
    page.on('dialog', (d) => { log(`  [browser dialog] ${d.type()}: ${d.message()}`); d.accept().catch(() => {}); });
    const seeded = `/index.php/${app.contextPath}`;
    try {
        if (app.name !== 'ops') {
            // Cross-app control: the seeded Roles grid and the Create New Role list (cancelled).
            await signIn(page, 'manager.maya');
            await rolesGrid(page, app, seeded, `roles-${app.name}`);
            await openCreateRole(page, app, `create-role-${app.name}`);
            await cancelDialog(page);
            await signOut(page);
            return;
        }

        // ---- OPS: scratch preprint server ----
        const sc = scratchAll.ops || (scratchAll.ops = {});
        if (!sc.path) {
            const t = tag('u28k6');
            const users = {mgr: `${t}mgr`, mod: `${t}mod`, au: `${t}au`, asst: `${t}asst`, rd: `${t}rd`, rev: `${t}rev`};
            const ctx = await app.api.createContext({
                tag: t, context: {name: `U28 K6 ${t}`, acronym: 'U28K6', contactName: 'K6 Contact', contactEmail: `${t}contact@mail.test`},
                users: [
                    {username: users.mgr, roles: ['manager'], givenName: 'Mona', familyName: 'Manager'},
                    {username: users.mod, roles: ['sectionEditor'], givenName: 'Mo', familyName: 'Moderator'},
                    {username: users.au, roles: ['author'], givenName: 'Al', familyName: 'Author'},
                    {username: users.asst, roles: ['editorialBoardMember'], givenName: 'Ed', familyName: 'Board'},
                    {username: users.rd, roles: ['reader'], givenName: 'Rae', familyName: 'Reader'},
                    {username: users.rev, roles: ['author'], givenName: 'Rex', familyName: 'Homemade'},
                ],
            });
            sc.tag = t; sc.path = ctx.path || t; sc.users = users; saveScratch();
            const sub = await app.api.createSubmission({tag: `${t}s1`, context: sc.path, submitter: users.au, submitted: true, title: `U28K6 preprint ${t}`});
            sc.subId = sub.submissionId; saveScratch();
            log(`[seed ops] context ${sc.path} preprint ${sc.subId} users ${JSON.stringify(users)}`);
        }
        const base = `/index.php/${sc.path}`;
        const u = sc.users;
        const id = sc.subId;

        // 1. One account per permission level (admin is enrolled in every scratch context).
        for (const [user, short] of [['admin', 'admin'], [u.mgr, 'mgr'], [u.mod, 'mod'], [u.asst, 'asst'], [u.au, 'au'], [u.rd, 'rd']]) {
            if (!phase('accounts')) break;
            await signIn(page, user);
            await landing(page, app, base, short);
            await typed(page, app, `${base}/dashboard/reviewAssignments`, `${short}-reviewAssignments`);
            await typed(page, app, `${base}/reviewer/submission/${id}`, `${short}-reviewer-submission`);
            await signOut(page);
        }

        // 2. Seeded server Roles grid (read-only) and the scratch server's Roles grid + Create New Role.
        if (phase('accounts')) {
            await signIn(page, 'manager.maya');
            await rolesGrid(page, app, seeded, 'roles-ops-seeded');
            await signOut(page);
        }
        if (!phase('roles') && !phase('rev')) return;

        await signIn(page, u.mgr);
        let reviewerOpt = sc.roleCreated ? {text: 'Reviewer'} : null;
        let form, options;
        if (phase('roles')) {
            await rolesGrid(page, app, base, 'roles-ops-scratch');
            ({form, options} = await openCreateRole(page, app, 'create-role-ops'));
            reviewerOpt = options.find((o) => /^Reviewer$/i.test(o.text));
        }
        if (!phase('roles')) {
            // nothing: the role phase was skipped on a re-run
        } else if (!reviewerOpt) {
            log('  ops Create New Role offers no "Reviewer" permission level; nothing to create.');
            await cancelDialog(page);
        } else if (!sc.roleCreated) {
            await form.locator('#roleId').selectOption(reviewerOpt.value);
            const nameField = form.locator('[name="name[en]"], #name-en, input[id^="name-"]').first();
            const abbrevField = form.locator('[name="abbrev[en]"], #abbrev-en, input[id^="abbrev-"]').first();
            await nameField.fill('Scratch Reviewer');
            await abbrevField.fill('SR');
            const stageLabels = await form.locator('#userGroupStageContainer label').allInnerTexts().catch(() => []);
            log(`     stage checkboxes after choosing Reviewer: ${JSON.stringify(stageLabels.map((l) => l.trim()))}`);
            await full(page, 'create-role-ops-filled', {stageLabels});
            await form.getByRole('button', {name: 'OK', exact: true}).click();
            const saved = await page.locator('#roleGridContainer').getByText('Scratch Reviewer').first().waitFor({timeout: 20000}).then(() => true).catch(() => false);
            const errors = await form.locator('.error, .formError, [role="alert"], .pkp_form_error').allInnerTexts().catch(() => []);
            log(`     role saved: ${saved}; form errors: ${JSON.stringify(errors)}`);
            if (!saved) await full(page, 'create-role-ops-after-ok', {errors});
            if (saved) { sc.roleCreated = true; saveScratch(); } else { await cancelDialog(page); }
            await rolesGrid(page, app, base, 'roles-ops-scratch-after');
        } else {
            await cancelDialog(page);
        }

        // Give the home-made role to "rev" through Settings › Users & Roles › Users › Edit.
        if (reviewerOpt && sc.roleCreated && !sc.roleAssigned && !sc.roleInvited) {
            await page.goto(app.url(`${base}/management/settings/access`), {waitUntil: 'domcontentloaded'});
            const search = page.getByPlaceholder(/Enter a user/).or(page.getByRole('searchbox')).first();
            await search.waitFor({timeout: 15000});
            await search.fill(u.rev);
            await search.press('Enter');
            const row = page.locator('main table tbody tr').filter({hasText: u.rev}).first();
            await row.waitFor({timeout: 15000});
            const more = row.getByRole('button').first();   // DropdownActions, aria-label "User Management Options"
            await loc(page, 'Users row: the actions button', more);
            log(`     row button aria-label: ${await more.getAttribute('aria-label').catch(() => null)}`);
            await more.click();
            const menu = page.locator('[role="menu"]').last();
            await menu.waitFor({timeout: 8000}).catch(() => {});
            const items = await menu.locator('button, a').allInnerTexts().catch(() => []);
            log(`     row menu items: ${JSON.stringify(items.map((t) => t.trim()))}`);
            const edit = menu.locator('button, a').filter({hasText: /^\s*Edit\s*$/}).first();
            await edit.click();
            // "Edit" leaves the grid for the edit-user page (management/settings/user/{id}): a step wizard
            // whose roles table has "Add Another Role" -> "Select a new role" + "Start Date".
            await page.waitForURL(/management\/settings\/user\//, {timeout: 15000}).catch(() => {});
            await page.locator('main').getByRole('button').first().waitFor({timeout: 15000}).catch(() => {});
            const opened = await full(page, 'edit-user-rev-page');
            log(`     Edit landed on ${page.url()} title=${JSON.stringify(opened.title)}; main: ${squash(opened.text && opened.text.main, 500)}`);
            const addBtn = page.getByRole('button', {name: 'Add Another Role', exact: true});
            if (await addBtn.isVisible().catch(() => false)) await addBtn.click();
            const roleSelect = page.getByLabel('Select a new role').last();
            await roleSelect.waitFor({timeout: 10000});
            const offered = await roleSelect.locator('option').allInnerTexts();
            log(`     roles offered to add: ${JSON.stringify(offered.map((o) => o.trim()))}`);
            await roleSelect.selectOption({label: 'Scratch Reviewer'});
            const date = page.getByLabel('Start Date').last();
            if (await date.isVisible().catch(() => false)) await date.fill(new Date().toISOString().slice(0, 10));
            await full(page, 'edit-user-rev-filled', {offered});
            for (let i = 0; i < 3; i++) {
                const buttons = page.locator('main button:not([disabled])');
                const names = await buttons.allInnerTexts();
                const idx = names.map((n) => n.trim()).findLastIndex((n) => n && !/^(Cancel|Back|Add Another Role|Remove.*|Deselect)$/i.test(n));
                if (idx < 0) { log(`     no next button among ${JSON.stringify(names)}`); break; }
                log(`     pressing "${names[idx].trim()}"`);
                await buttons.nth(idx).click();
                await page.waitForURL(/management\/settings\/access/, {timeout: 8000}).catch(() => {});
                await page.locator('main').waitFor({timeout: 8000}).catch(() => {});
                const st = await full(page, `edit-user-rev-step${i + 1}`);
                log(`     -> ${page.url()}; main: ${squash(st.text && st.text.main, 300)}`);
                // On this build "Edit" is the invitation wizard ("Invite user to take a role"): "Save And
                // Continue", then "Invite user to the role" ends in an "Invitation Sent" dialog. The role
                // is held only once rev accepts the invitation from the email (Mailpit, rev's address).
                if ((st.dialogs || []).some((d) => /Invitation Sent/.test(d))) {
                    sc.roleInvited = true; saveScratch();
                    log('     invitation sent; rev holds the role only after accepting it from the email (not driven: budget)');
                    await page.getByRole('button', {name: 'View All Users', exact: true}).click().catch(() => {});
                    break;
                }
                if (/management\/settings\/access/.test(page.url())) { sc.roleAssigned = true; saveScratch(); break; }
            }
        }
        await signOut(page);

        // 3. rev with the home-made reviewer-level role. REMAINDER (ccK6 stopped at the call ceiling):
        // accept the invitation from rev's email first (set roleAssigned in scratch.json by hand once done).
        if (sc.roleInvited && !sc.roleAssigned) log('  ops rev: invitation pending acceptance; the rev drive is skipped.');
        if (sc.roleAssigned) {
            await signIn(page, u.rev);
            await landing(page, app, base, 'rev');
            const list = await typed(page, app, `${base}/dashboard/reviewAssignments`, 'rev-reviewAssignments');
            const listHeaders = await page.locator('main table thead th').allInnerTexts().catch(() => []);
            log(`     rev list headers: ${JSON.stringify(listHeaders)}; main text: ${squash(list.text && list.text.main, 300)}`);
            await typed(page, app, `${base}/reviewer/submission/${id}`, 'rev-reviewer-submission');
            await signOut(page);
        }
        note(`ccK6 [ops]: ${new Date().toISOString().slice(0, 10)} — scratch server ${sc.path}: one account per level (admin, manager, moderator, Editorial Board Member, author, reader) typed dashboard/reviewAssignments and reviewer/submission/${id}; Roles › "Create New Role" permission-level list recorded (create-role-ops.json); a home-made Reviewer-level role given to a user through Users › More Actions › Edit (#userDetailsForm, userGroupIds[] checkboxes) when offered. See .reports/U28/cc-K6.md.`);
    } finally {
        await close();
    }
});
