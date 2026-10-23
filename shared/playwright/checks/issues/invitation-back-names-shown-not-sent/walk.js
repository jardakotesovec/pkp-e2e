// Kept walk of issue report docs/issues/U06-A15-invitation-back-names-shown-not-sent.md (U06 A15).
// On PKP's default test dataset, as `rvaca`: Settings > Users & Roles, "Invite to a role";
// "Search User" for hkq23d-first@example.com; on "Enter details" Given Name "Fey", Family Name
// "Firstperson" and a role row (Copyeditor; OPS: Moderator; today; "Does not appear on the
// masthead"); "Back"; "Search User" for hkq23d-second@example.com; what "Enter details" shows is
// recorded and sent as it stands (only an empty box is filled: "Sam" / "Second", the role row as
// before); "Invite user to the role", "View All Users"; the Invitations row and the email to the
// second address.
//
// `neighbour` as argument walks only the neighbour check instead: hkq23d-third@example.com,
// "Tia" / "Third" and the role row, "Save And Continue", on the email step "Back" to "Enter
// details" (not to "Search User"), what it shows, then sent: the Invitations row and the email.
//
// `variants` as argument walks the neighbouring cases instead, each from a fresh "Invite to a
// role": `same` (names and a role for hkq23d-same@, "Back", the same address searched again, sent
// as shown); `retype` (names for hkq23d-retype-a@, "Back", hkq23d-retype-b@, the names typed over
// as "Rita" / "Retyped", sent); `existing` (names for hkq23d-exist-a@, "Back", an existing
// account's address: OJS and OPS ccorino@mailinator.com, OMP aclark@mailinator.com, sent);
// `edit` (the `same` invitation's row > Edit > "Edit Invitation": names typed as "Sue" / "Same",
// "Save And Continue", "Back" to "Enter details", "Save And Continue", sent); `editDirect` (the
// same edit again, names "Sid" / "Same", sent without the "Back").
//
// Reset first:  npm run fleet-prep -- --feature issues-q23d --dataset 4 --reset
// Run (main):   PROBE_FEATURE=issues-q23d PROBE_AGENT=q23d node bin/probe.js all \
//                   shared/playwright/checks/issues/invitation-back-names-shown-not-sent/walk.js [neighbour]
// 3.5:          PKP_E2E_LINE=stable-3_5_0 in front of both (feature issues-q23d-3_5), PROBE_RUN=r35
// Facts: .reports/<feature>/q23d/walk[-<run>]-<app>.json (neighbour: neighbour[-<run>]-<app>.json)
const {forEachApp, launch, signIn, record, shot, idle, sql, serverLog} = require('../../../probe');
const H = require('./lib.js');

const neighbour = process.argv.slice(2).includes('neighbour');
const variants = process.argv.slice(2).includes('variants');
const EXISTING = {ojs: 'ccorino@mailinator.com', omp: 'aclark@mailinator.com', ops: 'ccorino@mailinator.com'};

forEachApp(async (app) => {
    const role = H.ROLE[app.name];
    const facts = {app: app.name, line: app.line || 'main', dataset: app.dataset, role, neighbour};
    const name = variants ? 'variants' : neighbour ? 'neighbour' : 'walk';
    const save = () => record(name, facts);
    const log = serverLog(app);
    const mark = log.mark();
    const since = new Date(Date.now() - 2000);
    const {page, close} = await launch(app);
    try {
        // 1-2. rvaca, Users & Roles, "Invite to a role"
        await signIn(page, 'rvaca', {contextPath: app.contextPath});
        await H.openWizard(page, app);

        if (variants) {
            const back = async () => {
                await page.getByRole('button', {name: 'Back', exact: true}).click();
                await page.getByRole('heading', {name: /Search User/}).waitFor({timeout: H.T});
                await idle(page);
            };
            const run = async (key, fn) => {
                try {
                    facts[key] = await fn();
                } catch (e) {
                    facts[key] = {error: String(e.message || e).slice(0, 600)};
                    await H.snap(page).then((x) => record(`v-${key}-error`, x)).catch(() => {});
                }
                save();
            };
            await run('same', async () => {
                const a = 'hkq23d-same@example.com', out = {};
                await H.search(page, a);
                await H.fillDetails(page, {given: 'Sue', family: 'Same', role});
                await back();
                await H.search(page, a);
                out.details = await H.readDetails(page);
                // with the fix the step comes back empty: fill only the role row, so the invitation
                // still goes out without names for the edit cases below
                const r = out.details;
                if (!r.role || !r.date || !r.masthead) await H.fillRole(page, role);
                await H.saveAndContinue(page);
                out.sent = await H.sendAndView(page);
                out.result = await H.result(page, app, a, since);
                return out;
            });
            await run('retype', async () => {
                const a = 'hkq23d-retype-a@example.com', b = 'hkq23d-retype-b@example.com', out = {};
                await H.openWizard(page, app);
                await H.search(page, a);
                await H.fillDetails(page, {given: 'Fey', family: 'Firstperson', role});
                await back();
                await H.search(page, b);
                out.details = await H.readDetails(page);
                await page.getByLabel(/^Given Name/).first().fill('Rita');
                await page.getByLabel(/^Family Name/).first().fill('Retyped');
                out.typed = await H.readDetails(page);
                await H.saveAndContinue(page);
                out.sent = await H.sendAndView(page);
                out.result = await H.result(page, app, b, since);
                return out;
            });
            await run('existing', async () => {
                const a = 'hkq23d-exist-a@example.com', b = EXISTING[app.name], out = {};
                await H.openWizard(page, app);
                await H.search(page, a);
                await H.fillDetails(page, {given: 'Fey', family: 'Firstperson', role});
                await back();
                await H.search(page, b);
                record('v-existing-details', await H.snap(page));
                out.details = await H.readDetails(page);
                out.detailsText = H.flat((await H.snap(page)).text.main, 900);
                const r = out.details;
                if (!r.role || !r.date || !r.masthead) await H.fillRole(page, role);
                await H.saveAndContinue(page);
                out.sent = await H.sendAndView(page);
                out.result = await H.result(page, app, b, since);
                return out;
            });
            const editRun = async (withBack, given, family) => {
                const a = 'hkq23d-same@example.com', out = {};
                await page.goto(app.url(`/index.php/${app.contextPath}/management/settings/access`));
                await idle(page);
                const row = page.getByRole('table', {name: /^Invitations \(/}).locator('tbody tr').filter({hasText: a}).first();
                await row.getByRole('button', {name: /management.options|^More Actions$/i}).click();
                await page.getByRole('menuitem', {name: /^Edit/}).click();
                const warn = page.getByRole('dialog').last();
                await warn.waitFor({timeout: H.T});
                out.warn = H.flat(await warn.innerText(), 300);
                await warn.getByRole('button', {name: 'Edit Invitation', exact: true}).click();
                await page.waitForURL(/\/invitation\/edit\/\d+/, {timeout: H.T});
                await page.getByRole('heading', {name: /Enter details/}).waitFor({timeout: H.T});
                await idle(page);
                out.opened = await H.readDetails(page);
                await page.getByLabel(/^Given Name/).first().fill(given);
                await page.getByLabel(/^Family Name/).first().fill(family);
                await H.saveAndContinue(page);
                if (withBack) {
                    await page.getByRole('button', {name: 'Back', exact: true}).click();
                    await page.getByRole('heading', {name: /Enter details/}).waitFor({timeout: H.T});
                    await idle(page);
                    out.afterBack = await H.readDetails(page);
                    await H.saveAndContinue(page);
                }
                const t0 = new Date(Date.now() - 1000);
                out.sent = await H.sendAndView(page);
                out.result = await H.result(page, app, a, t0);
                out.rows = (await page.getByRole('table', {name: /^Invitations \(/}).locator('tbody tr').filter({hasText: a}).allInnerTexts()).map((t) => H.flat(t, 200));
                out.db = H.dbRead(app, sql, [a]);
                return out;
            };
            // the `same` invitation went out without names: edit it with a "Back" first, then
            // (still without names when the fault shows) without one
            await run('edit', () => editRun(true, 'Sue', 'Same'));
            await run('editDirect', () => editRun(false, 'Sid', 'Same'));
            facts.serverErrors = log.since(mark);
            save();
            return;
        }

        if (neighbour) {
            const third = H.ADDR.third;
            await H.search(page, third);
            await H.fillDetails(page, {given: 'Tia', family: 'Third', role});
            facts.filled = await H.readDetails(page);
            await H.saveAndContinue(page);
            record('nb-01-compose', await H.snap(page));
            await page.getByRole('button', {name: 'Back', exact: true}).click();
            await page.getByRole('heading', {name: /Enter details/}).waitFor({timeout: H.T});
            await idle(page);
            record('nb-02-details-after-back', await H.snap(page));
            facts.afterBack = await H.readDetails(page);
            save();
            await H.saveAndContinue(page);
            facts.sent = await H.sendAndView(page);
            facts.result = await H.result(page, app, third, since);
            facts.db = H.dbRead(app, sql, [third]);
            facts.serverErrors = log.since(mark);
            save();
            return;
        }

        // 3-4. the first address, names and a role row
        const {first, second} = H.ADDR;
        await H.search(page, first);
        await H.fillDetails(page, {given: 'Fey', family: 'Firstperson', role});
        record('01-first-details', await H.snap(page));
        facts.first = await H.readDetails(page);
        save();

        // 5. "Back" to "Search User"
        await page.getByRole('button', {name: 'Back', exact: true}).click();
        await page.getByRole('heading', {name: /Search User/}).waitFor({timeout: H.T});
        await idle(page);
        record('02-search-after-back', await H.snap(page));
        facts.searchBoxAfterBack = await page.getByLabel(/Search for a user by email address/).inputValue();

        // 6. the second address
        await H.search(page, second);
        record('03-second-details', await H.snap(page));
        await shot(page, '03-second-details');
        facts.second = await H.readDetails(page);
        save();

        // 7. sent as it stands: only an empty box is filled
        facts.filledBeforeSend = await H.fillEmpty(page, facts.second, {given: 'Sam', family: 'Second', role});
        facts.secondAsSent = await H.readDetails(page);
        await H.saveAndContinue(page);
        record('04-compose', await H.snap(page));

        // 8. "Invite user to the role", "View All Users"
        facts.sent = await H.sendAndView(page);

        // 9. the Invitations row and the email
        facts.result = await H.result(page, app, second, since);
        record('05-users-after', await H.snap(page));
        await shot(page, '05-users-after');
        facts.firstMailed = await app.fleetMail.count({to: first, since}).catch((e) => `count: ${e.message}`);
        facts.db = H.dbRead(app, sql, [first, second]);
        facts.serverErrors = log.since(mark);
        save();
    } catch (error) {
        facts.error = String(error.stack || error).slice(0, 1500);
        save();
        throw error;
    } finally {
        await close();
    }
});
