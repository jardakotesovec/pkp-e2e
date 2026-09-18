// Sync claim check S18a — U06 Rule 14, register A6 (f-a6) and the Coverage "No seed" bullet "a disabled
// user met on the search step", after pkp/pkp-lib#13313 "Disable user edit page load fix" (2ecbd331ee):
// what Users & Roles › Edit opens on a DISABLED user's row, and the same user met on the invitation
// wizard's search step (by email and by username), beside an enabled user as the control.
//
//   PROBE_FEATURE=sync PROBE_AGENT=ccS18a node bin/probe.js all shared/playwright/checks/sync/pkp-lib-13313/s18a.js
//   S18A_LEGS=disable,edit …   runs only the named legs (the seed, the sign-in and the disabling always run)
//
// One scratch context per app per run, with its own manager and four scratch users (two to disable, on
// screen: the row menu's "Disable User"; two left enabled). publicknowledge and the roster are never
// touched. No assertions: every screen is recorded with screen() as <leg>-<step>-<app>.json, the facts
// read off each screen are collected into result-<app>.json, and the reader judges them against the spec.
const {forEachApp, launch, signIn, signOut, screen, record, shot, idle, tag, loc, note} = require('../../../probe');

const log = (...a) => console.log(...a);
const fold = (s) => (s || '').replace(/\s+/g, ' ').trim();
const ONLY = (process.env.S18A_LEGS || '').split(',').map((s) => s.trim()).filter(Boolean);
const want = (leg) => !ONLY.length || ONLY.includes(leg);

forEachApp(async (app) => {
    const T = tag('s18a');
    const U = {mgr: `${T}mgr`, disA: `${T}disa`, disB: `${T}disb`, ena: `${T}ena`, enb: `${T}enb`};
    const mail = (k) => `${U[k]}@mail.test`;
    await app.api.createContext({
        tag: T,
        users: [
            {username: U.mgr, roles: ['manager'], givenName: 'Mia', familyName: 'Manager'},
            {username: U.disA, roles: ['author', 'reader'], givenName: 'Dora', familyName: 'Disabled'},
            {username: U.disB, roles: ['author', 'reader'], givenName: 'Dan', familyName: 'Disabledtoo'},
            {username: U.ena, roles: ['author', 'reader'], givenName: 'Enzo', familyName: 'Enabled'},
            {username: U.enb, roles: ['author', 'reader'], givenName: 'Ella', familyName: 'Enabledtoo'},
        ],
    });
    log(`${app.name}: scratch context ${T}`);
    const R = {app: app.name, context: T, users: U, facts: {}};
    const {page, close} = await launch(app);
    const apiLog = [];
    page.on('response', (res) => {
        const u = res.url();
        if (/\/api\/v1\/|\$\$\$call\$\$\$/.test(u)) {
            apiLog.push(`${res.request().method()}${res.request().headers()['x-http-method-override'] ? '→' + res.request().headers()['x-http-method-override'] : ''} ${res.status()} ${u.replace(app.baseURL, '').replace(/\?.*$/, '?…')}`);
        }
    });
    const takeApi = () => apiLog.splice(0, apiLog.length);
    const browserDialogs = [];
    let step = 'start';
    page.on('dialog', async (d) => {
        browserDialogs.push(`[${step}] ${d.type()}: ${d.message()}`);
        await d.accept();
    });

    const accessUrl = app.url(`/index.php/${T}/management/settings/access`);
    const usersTable = page.getByRole('table', {name: /Current Users \(/});
    const userRow = (k) => usersTable.getByRole('row').filter({hasText: mail(k)});

    const snap = async (name) => {
        step = name;
        const s = await screen(page);
        record(name, s);
        await shot(page, name);
        return s;
    };
    const gotoAccess = async () => {
        await page.goto(app.url(`/index.php/${T}/index`));
        await page.goto(accessUrl);
        await page.getByRole('heading', {name: 'Users & Roles'}).waitFor();
        await usersTable.waitFor();
        await idle(page);
    };
    const openRowMenu = async (k) => {
        await userRow(k).getByRole('button', {name: /management.options|options/i}).click();
        await page.getByRole('menuitem').first().waitFor();
        return (await page.getByRole('menuitem').allInnerTexts()).map(fold);
    };
    /** What the wizard's details step shows, as facts. */
    const readWizard = async () => {
        const main = page.locator('main');
        const f = {url: page.url().replace(app.baseURL, '')};
        f.headings = (await main.getByRole('heading').allInnerTexts()).map(fold);
        f.disabledWarning = (await main.getByText('The user is currently disabled').count()) > 0;
        f.warningText = f.disabledWarning
            ? fold(await main.getByText('The user is currently disabled').first().locator('xpath=ancestor::*[self::div][1]').innerText())
            : null;
        f.errorDialog = (await page.getByRole('dialog').filter({hasText: 'The requested resource was not found'}).count()) > 0;
        f.dialogText = fold((await page.getByRole('dialog').allInnerTexts()).join(' | ')) || null;
        const rows = page.getByRole('row');
        f.tableRows = (await rows.allInnerTexts()).map(fold);
        const btn = async (name, exact = false) => {
            const b = page.getByRole('button', {name, exact});
            const n = await b.count();
            if (!n) return 'absent';
            const states = [];
            for (let i = 0; i < n; i++) states.push((await b.nth(i).isVisible()) ? ((await b.nth(i).isEnabled()) ? 'enabled' : 'disabled') : 'hidden');
            return states.join(',');
        };
        f.addAnotherRole = await btn('Add Another Role');
        f.removeRole = await btn('Remove Role');
        f.saveAndContinue = await btn('Save And Continue');
        f.cancel = await btn('Cancel', true);
        f.back = await btn('Back', true);
        const selects = main.getByRole('combobox');
        f.selects = [];
        for (let i = 0; i < (await selects.count()); i++) {
            const s = selects.nth(i);
            f.selects.push({label: await s.getAttribute('aria-label'), enabled: await s.isEnabled(), value: await s.inputValue().catch(() => null)});
        }
        const boxes = main.getByRole('textbox');
        f.textboxes = [];
        for (let i = 0; i < (await boxes.count()); i++) {
            const b = boxes.nth(i);
            f.textboxes.push({enabled: await b.isEnabled(), editable: await b.isEditable().catch(() => null), value: await b.inputValue().catch(() => null)});
        }
        return f;
    };
    const mailCounts = async () => {
        const out = {};
        for (const k of ['disA', 'disB', 'ena', 'enb']) out[k] = await app.mail.count({to: mail(k)});
        return out;
    };

    try {
        await signIn(page, U.mgr, {contextPath: T});
        R.facts.mailAtStart = await mailCounts();

        // ---- Leg "disable": Users & Roles, the row menu, "Disable User" on the two scratch users.
        await gotoAccess();
        const s0 = await snap('disable-0-users-list');
        R.facts.listBefore = (await usersTable.getByRole('row').allInnerTexts()).map(fold);
        await loc(page, 'Users & Roles: the Current Users table', usersTable);
        await loc(page, 'Users & Roles: a user row by email', userRow('disA'));
        await loc(page, 'Users & Roles: the row menu button', userRow('disA').getByRole('button', {name: /management.options|options/i}));
        R.facts.menuEnabledUser = await openRowMenu('disA');
        await snap('disable-1-row-menu-enabled-user');
        for (const k of ['disA', 'disB']) {
            if (k !== 'disA') await openRowMenu(k);
            takeApi();
            await page.getByRole('menuitem', {name: /^Disable/}).click();
            const dlg = page.getByRole('dialog').filter({hasText: /Disable/}).last();
            await dlg.locator('textarea, [name=userNote]').first().waitFor({timeout: 15000}).catch(() => {});
            await idle(page);
            const sd = await snap(`disable-2-window-${k}`);
            R.facts[`disableWindow_${k}`] = fold(sd.text.dialog);
            const ta = dlg.locator('textarea').first();
            if (await ta.count()) await ta.fill(`s18a: disabled for the claim check (${k})`);
            await loc(page, '"Disable User" window: the reason box', ta);
            await loc(page, '"Disable User" window: OK', dlg.getByRole('button', {name: 'OK'}));
            await dlg.getByRole('button', {name: /^(OK|Save|Disable)/}).first().click();
            await dlg.waitFor({state: 'hidden', timeout: 15000}).catch(() => {});
            await idle(page);
            R.facts[`disableCalls_${k}`] = takeApi();
        }
        await gotoAccess();
        await snap('disable-3-users-list-after');
        R.facts.listAfter = (await usersTable.getByRole('row').allInnerTexts()).map(fold);
        R.facts.menuDisabledUser = await openRowMenu('disA');
        await snap('disable-4-row-menu-disabled-user');
        await page.getByRole('button', {name: /management.options|options/i}).first().focus();
        await page.keyboard.press('Escape');

        // ---- Leg "control": Edit on an ENABLED user's row.
        if (want('control')) {
            await gotoAccess();
            takeApi();
            await openRowMenu('ena');
            await page.getByRole('menuitem', {name: 'Edit', exact: true}).click();
            await page.waitForURL(/management\/settings\/user\//, {timeout: 20000}).catch(() => {});
            await idle(page);
            await page.getByRole('button', {name: 'Save And Continue'}).waitFor({timeout: 20000}).catch(() => {});
            await snap('control-1-edit-enabled-user');
            R.facts.controlEdit = await readWizard();
            R.facts.controlEditCalls = takeApi();
        }

        // ---- Leg "edit": Edit on a DISABLED user's row (register A6).
        if (want('edit')) {
            await gotoAccess();
            takeApi();
            await openRowMenu('disA');
            await page.getByRole('menuitem', {name: 'Edit', exact: true}).click();
            await page.waitForURL(/management\/settings\/user\//, {timeout: 20000}).catch(() => {});
            await idle(page);
            await page.waitForTimeout(1500);
            await snap('edit-1-disabled-user-lands');
            R.facts.edit = await readWizard();
            R.facts.editCalls = takeApi();
            R.facts.editUrl = page.url().replace(app.baseURL, '');
            await loc(page, 'Edit wizard: the disabled-user warning', page.getByText('The user is currently disabled'));
            await loc(page, 'Edit wizard: Remove Role', page.getByRole('button', {name: 'Remove Role'}));
            await loc(page, 'Edit wizard: Add Another Role', page.getByRole('button', {name: 'Add Another Role'}));
            await loc(page, 'Edit wizard: Save And Continue', page.getByRole('button', {name: 'Save And Continue'}));

            // Press what the screen offers.
            const press = {};
            const add = page.getByRole('button', {name: 'Add Another Role'});
            if ((await add.count()) && (await add.first().isEnabled())) {
                await add.first().click();
                await idle(page);
                await snap('edit-2-after-add-another-role');
                press.afterAdd = await readWizard();
            } else press.afterAdd = 'Add Another Role not pressable';
            // A current role's masthead select and Remove Role.
            const roleRow = page.getByRole('row').filter({hasText: 'Reader'}).filter({hasNot: page.getByLabel(/^Select a new role/)});
            const mast = roleRow.getByRole('combobox');
            if ((await mast.count()) && (await mast.first().isEnabled())) {
                const before = await mast.first().inputValue();
                takeApi();
                await mast.first().selectOption(before === 'true' ? 'false' : 'true');
                await page.waitForTimeout(800);
                const sm = await snap('edit-3-masthead-change');
                press.mastheadDialog = fold(sm.text.dialog);
                const dlg = page.getByRole('dialog', {name: 'Confirm masthead visibility change'});
                if (await dlg.count()) {
                    press.mastheadDialogButtons = (await dlg.getByRole('button').allInnerTexts()).map(fold);
                    await dlg.getByRole('button', {name: 'Cancel'}).click();
                    await idle(page);
                    press.mastheadAfterCancelValue = await mast.first().inputValue();
                }
                press.mastheadCalls = takeApi();
            } else press.masthead = (await mast.count()) ? 'masthead select disabled' : 'no masthead select on the Reader row';
            const rem = roleRow.getByRole('button', {name: 'Remove Role'});
            if ((await rem.count()) && (await rem.first().isEnabled())) {
                takeApi();
                await rem.first().click();
                await page.waitForTimeout(800);
                const sr = await snap('edit-4-remove-role-dialog');
                press.removeDialog = fold(sr.text.dialog);
                const dlg = page.getByRole('dialog', {name: 'Remove Role'});
                if (await dlg.count()) {
                    press.removeDialogButtons = (await dlg.getByRole('button').allInnerTexts()).map(fold);
                    const yes = dlg.getByRole('button', {name: /^(Remove Role|Yes|OK|Remove)$/});
                    if (await yes.count()) {
                        await yes.first().click();
                        await idle(page);
                        await page.waitForTimeout(800);
                        await snap('edit-5-after-remove-confirmed');
                        press.afterRemove = await readWizard();
                    }
                }
                press.removeCalls = takeApi();
            } else press.remove = (await rem.count()) ? 'Remove Role disabled' : 'no Remove Role on the Reader row';
            // The other end of the masthead change: "Confirm", on the Author row ("The user will be notified").
            const authorRow = page.getByRole('row').filter({hasText: 'Author'}).filter({hasNot: page.getByLabel(/^Select a new role/)});
            const mast2 = authorRow.getByRole('combobox');
            if ((await mast2.count()) && (await mast2.first().isEnabled())) {
                const before = await mast2.first().inputValue();
                const mailBefore = await app.mail.count({to: mail('disA')});
                takeApi();
                await mast2.first().selectOption(before === 'true' ? 'false' : 'true');
                const dlg = page.getByRole('dialog', {name: 'Confirm masthead visibility change'});
                await dlg.waitFor({timeout: 5000}).catch(() => {});
                if (await dlg.count()) {
                    await dlg.getByRole('button', {name: 'Confirm'}).click();
                    await idle(page);
                    await page.waitForTimeout(1500);
                    const sm = await snap('edit-5b-masthead-confirmed');
                    press.mastheadConfirm = {before, after: await mast2.first().inputValue().catch(() => null), dialogAfter: fold(sm.text.dialog), calls: takeApi()};
                    const open = page.getByRole('dialog').getByRole('button', {name: /^(OK|Ok|Close)$/});
                    if (await open.count()) await open.first().click().catch(() => {});
                    await page.waitForTimeout(1500);
                    press.mastheadConfirm.mailBefore = mailBefore;
                    press.mastheadConfirm.mailAfter = await app.mail.count({to: mail('disA')});
                }
            }
            // "View more details".
            const more = page.getByRole('button', {name: 'View more details'});
            if (await more.count()) {
                await more.first().click();
                await idle(page);
                const sv = await snap('edit-5c-view-more-details');
                press.viewMoreDetails = {dialog: fold(sv.text.dialog), mainHas: fold(sv.text.main).slice(0, 900)};
                const cl = page.getByRole('dialog').getByRole('button', {name: /^Close/});
                if (await cl.count()) await cl.first().click().catch(() => {});
            } else press.viewMoreDetails = 'absent as a button';
            // Save And Continue.
            const save = page.getByRole('button', {name: 'Save And Continue'});
            if ((await save.count()) && (await save.first().isEnabled())) {
                takeApi();
                await save.first().click();
                await idle(page);
                await page.waitForTimeout(1000);
                await snap('edit-6-after-save-and-continue');
                press.afterSave = await readWizard();
                press.saveCalls = takeApi();
            } else press.save = (await save.count()) ? 'Save And Continue disabled' : 'Save And Continue absent';
            // Leave the wizard: Cancel.
            const cancel = page.getByRole('button', {name: 'Cancel', exact: true});
            if (await cancel.count()) {
                await cancel.first().click();
                await page.waitForTimeout(1000);
                const sc = await snap('edit-7-after-cancel');
                press.afterCancelUrl = page.url().replace(app.baseURL, '');
                press.afterCancelDialog = fold(sc.text.dialog);
            }
            R.facts.editPress = press;
        }

        // ---- Leg "search": the invitation wizard's search step meets the disabled user (Rule 14).
        if (want('search')) {
            for (const [name, k, term] of [
                ['control-email', 'enb', mail('enb')],
                ['disabled-email', 'disB', mail('disB')],
                ['disabled-username', 'disB', U.disB],
            ]) {
                await gotoAccess();
                await page.getByRole('button', {name: 'Invite to a role'}).click();
                await page.getByRole('heading', {name: /Search User/}).waitFor({timeout: 20000});
                await idle(page);
                if (name === 'control-email') await snap('search-0-search-step');
                takeApi();
                await page.getByLabel(/Search for a user by email address/).fill(term);
                await page.getByRole('button', {name: 'Search User', exact: true}).click();
                await page.getByRole('heading', {name: /Enter details/}).waitFor({timeout: 20000}).catch(() => {});
                await idle(page);
                await page.waitForTimeout(800);
                await snap(`search-1-${name}`);
                const f = await readWizard();
                f.calls = takeApi();
                // Press what is offered.
                const add = page.getByRole('button', {name: 'Add Another Role'});
                if ((await add.count()) && (await add.first().isVisible()) && (await add.first().isEnabled())) {
                    await add.first().click();
                    await idle(page);
                    f.afterAdd = {rows: (await page.getByRole('row').allInnerTexts()).map(fold)};
                }
                const save = page.getByRole('button', {name: 'Save And Continue'});
                f.savePressable = (await save.count()) > 0 && (await save.first().isEnabled());
                if (name.startsWith('disabled') && f.savePressable) {
                    takeApi();
                    await save.first().click();
                    await idle(page);
                    await page.waitForTimeout(800);
                    await snap(`search-2-${name}-after-save`);
                    f.afterSave = await readWizard();
                    f.afterSaveCalls = takeApi();
                }
                // Leave by Cancel.
                const cancel = page.getByRole('button', {name: 'Cancel', exact: true});
                if (await cancel.count()) {
                    await cancel.first().click();
                    await page.waitForTimeout(1000);
                    const sc = await screen(page);
                    record(`search-3-${name}-after-cancel`, sc);
                    f.afterCancelUrl = page.url().replace(app.baseURL, '');
                    f.afterCancelDialog = fold(sc.text.dialog);
                    const yes = page.getByRole('dialog').getByRole('button', {name: /^(Yes|OK|Leave|Cancel Invitation)/});
                    if (await yes.count()) await yes.first().click().catch(() => {});
                }
                R.facts[`search_${name}`] = f;
            }
        }

        // ---- Leg "admin": the site administrator's read of the same Edit screen (read-only).
        if (want('admin')) {
            await signOut(page);
            await signIn(page, 'admin', {contextPath: T});
            await gotoAccess();
            takeApi();
            await openRowMenu('disA');
            await page.getByRole('menuitem', {name: 'Edit', exact: true}).click();
            await page.waitForURL(/management\/settings\/user\//, {timeout: 20000}).catch(() => {});
            await idle(page);
            await page.waitForTimeout(1500);
            await snap('admin-1-edit-disabled-user');
            R.facts.adminEdit = await readWizard();
            R.facts.adminEditCalls = takeApi();
        }

        await gotoAccess();
        await snap('end-0-users-list');
        R.facts.listAtEnd = fold(await page.locator('main').innerText());
        R.facts.mailAtEnd = await mailCounts();
        R.facts.browserDialogs = browserDialogs;
        await signOut(page);
    } catch (e) {
        R.error = String(e && e.stack ? e.stack : e);
        log(`${app.name}: ERROR ${R.error}`);
        try {
            await snap('error-screen');
        } catch (_) {}
    } finally {
        record('result', R);
        await close();
    }
    note(`ccS18a [${app.name}]: 13313 disabled-user Edit and search step: scratch context ${T}; see .reports/sync/ccS18a/result-${app.name}.json`);
});
