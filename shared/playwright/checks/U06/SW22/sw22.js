// U06 drift sweep SW22 (housekeeping 2026-10-22): the spec lines the kept checks
// (H13D, Ks27, I28, I29, S02) no longer reach, driven per app on scratch
// contexts of this run's own (ORCID off, plus one with ORCID on):
//   cancel   Scenario 5 / Rule 16 / Rule 4: "Cancel Invite" (its recap, the row),
//            then the accept and decline links, and the accept link cut short.
//   edit     Scenario 6 / Rule 12 / A3: "Edit" > "Edit Invitation", the prefilled
//            wizard, the replacement sent; the second email's link, both of the
//            first email's links, the Invitations table.
//   wrong    Scenario 7 / Rule 6: a member's link opened by a signed-in bystander,
//            "Logout", the session after it, the link again.
//   row      Scenario 8 / Rule 13: last active role's "Remove Role", "Save And
//            Continue" gating, an empty row's inline errors.
//   disabled Rule 14: a disabled user found on "Search User" and through Edit (read only).
//   fields   Fields: search by username / partial address, the role offered in a
//            second row, a blank masthead select, the second row's field names (A8);
//            Rule 15: "Back" to the search step, "Cancel" with nothing changed.
//   past     Rule 8: an existing member invited with a past start date, accepted.
//   a12      A12: the create address with "reviewerAccess" as its last word.
//   orcid    Scenario 10 / Rules 5, 7: ORCID on; a newcomer, a member without an
//            iD and a member with a verified iD; search by ORCID iD.
//   emails   Scenario 9 / OPS1: the Emails screen searched for the template
//            (read only, publicknowledge as manager.maya; OJS and OMP the control).
// Every screen is recorded with screen(); run twice, each under its own PROBE_RUN:
//   bin/app-lock.sh shared ojs -- env PROBE_FEATURE=U06 PROBE_AGENT=ccSW22 PROBE_RUN=r1 \
//       node bin/probe.js ojs shared/playwright/checks/U06/SW22/sw22.js
// ONLY_PHASES=cancel,edit narrows the phases.
const {forEachApp, launch, signIn, screen, record, idle, tag} = require('../../../probe');

const ROLE = {ojs: 'Copyeditor', omp: 'Author', ops: 'Moderator'};
const ROLE2 = {ojs: 'Author', omp: 'Copyeditor', ops: 'Author'};
const ROLE3 = {ojs: 'Copyeditor', omp: 'Copyeditor', ops: 'Moderator'};
const ACR = {ojs: 'OJS', omp: 'OMP', ops: 'OPS'};
const ORCID_ID = 'https://sandbox.orcid.org/0000-0002-1825-0097';

function today() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

forEachApp(async (app) => {
    const {expect} = require('@playwright/test');
    const T = tag('u06sw22');
    const S = T;
    const O = `${T}o`;
    const want = (p) => !process.env.ONLY_PHASES || process.env.ONLY_PHASES.split(',').includes(p);
    const facts = {app: app.name, run: process.env.PROBE_RUN || null, tag: T, today: today(), errors: {}};
    const snap = async (page, name) => {
        const s = await screen(page);
        record(name, s);
        return s;
    };
    const step = async (name, fn) => {
        try {
            await fn();
        } catch (e) {
            facts.errors[name] = String(e.message || e).split('\n')[0];
            console.log(`[${app.name}] ${name} FAILED: ${facts.errors[name]}`);
        }
        record('facts', facts);
    };
    const rcpt = (k) => `rcpt${T}${k}@mail.test`;
    const person = (u, given, family, roles, extra = {}) => ({username: u, givenName: given, familyName: family, roles, ...extra});

    await app.api.createContext({tag: S, users: [
        {username: `mgr${T}`, roles: ['manager']},
        person(`mem${T}`, 'Mira', 'Member', ['author', 'reader']),
        person(`dis${T}`, 'Dora', 'Disabled', ['author'], {disabled: true}),
        person(`byst${T}`, 'Bea', 'Bystander', ['reader']),
        person(`ex${T}`, 'Ezra', 'Existing', ['author']),
        person(`past${T}`, 'Pia', 'Past', ['author']),
    ]});
    await app.api.createContext({tag: O, orcid: {}, users: [
        {username: `mgr${O}`, roles: ['manager']},
        person(`ver${O}`, 'Vera', 'Verified', ['author'], {orcid: ORCID_ID, orcidIsVerified: true}),
        person(`nov${O}`, 'Noah', 'Noorcid', ['author']),
    ]});
    facts.contexts = {S, O};

    const readMail = async (to, marker) => {
        const summary = await app.mail.find({to, contains: marker, timeoutMs: 30_000});
        const full = await app.mail.fullMessage(summary.ID);
        const grab = (op) => {
            const m = (full.HTML || '').match(new RegExp(`href=['"]([^'"]*/invitation/${op}\\?[^'"]+)['"]`, 'i'));
            return m ? m[1].replace(/&amp;/g, '&') : null;
        };
        return {subject: full.Subject, text: (full.Text || '').replace(/\r/g, '').slice(0, 3000), accept: grab('accept'), decline: grab('decline')};
    };
    const usersTable = (page) => page.getByRole('table', {name: /^Current Users \(/});
    const invTable = (page) => page.getByRole('table', {name: /^Invitations \(/});
    const gotoAccess = async (page, ctx) => {
        await page.goto(`/index.php/${ctx}/management/settings/access`);
        await expect(usersTable(page).locator('tbody tr').first()).toBeVisible({timeout: 30_000});
        await idle(page);
    };
    const invRows = async (page) => (await invTable(page).locator('tbody tr').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim());
    const rowAction = async (page, row, item) => {
        await row.getByRole('button', {name: /management.options|^More Actions$/i}).click();
        await page.getByRole('menuitem', {name: item}).click();
    };
    const newRow = (page) => page.getByRole('row').filter({has: page.getByLabel(/^Select a new role/)}).last();
    const heldRow = (page, role) => page.getByRole('row').filter({hasText: role}).filter({hasNot: page.getByLabel(/^Select a new role/)});
    const openWizard = async (page, ctx) => {
        await gotoAccess(page, ctx);
        await page.getByRole('button', {name: 'Invite to a role'}).click();
        await expect(page.getByRole('heading', {name: /Search User/})).toBeVisible({timeout: 30_000});
        await idle(page);
    };
    const search = async (page, text) => {
        await page.getByLabel(/Search for a user by email address/).fill(text);
        await page.getByRole('button', {name: 'Search User', exact: true}).click();
        await expect(page.getByRole('heading', {name: /Enter details/})).toBeVisible({timeout: 30_000});
        await idle(page);
    };
    const fillRow = async (page, row, {role, date = today(), masthead = 'Appear on the masthead'}) => {
        await row.getByLabel(/^Select a new role/).selectOption({label: role});
        await row.getByRole('textbox').fill(date);
        const mast = row.getByRole('combobox').last();
        if (masthead && await mast.count() && await mast.isEnabled()) {
            await mast.selectOption({label: masthead}).catch(() => {});
        }
    };
    const compose = async (page, marker, key) => {
        await page.getByRole('button', {name: 'Save And Continue'}).click();
        const subject = page.getByLabel(/^Subject/);
        await expect(subject).toBeVisible({timeout: 30_000});
        await expect(subject).not.toHaveValue('', {timeout: 30_000});
        await idle(page);
        await snap(page, `${key}-compose`);
        await subject.fill(marker);
        await page.getByRole('button', {name: 'Invite user to the role'}).click();
        const sent = page.getByRole('dialog').filter({hasText: 'Invitation Sent'});
        await expect(sent).toBeVisible({timeout: 30_000});
        await sent.getByRole('button', {name: 'View All Users'}).click();
        await page.waitForURL(/management\/settings\/access/, {timeout: 30_000});
        await expect(usersTable(page).locator('tbody tr').first()).toBeVisible({timeout: 30_000});
        await idle(page);
    };
    const sendNew = async (page, ctx, {to, given = 'Nova', role, marker, key}) => {
        await openWizard(page, ctx);
        await search(page, to);
        if (given) await page.getByLabel(/^Given Name/).first().fill(given);
        await fillRow(page, newRow(page), {role});
        await snap(page, `${key}-details`);
        await compose(page, marker, key);
        return readMail(to, marker);
    };
    const sendExisting = async (page, ctx, {to, role, marker, key, date}) => {
        await openWizard(page, ctx);
        await search(page, to);
        await fillRow(page, newRow(page), {role, date});
        await snap(page, `${key}-details`);
        await compose(page, marker, key);
        return readMail(to, marker);
    };
    const landing = async (page, url, key) => {
        const resp = await page.goto(url);
        await idle(page);
        const s = await snap(page, key);
        return {status: resp ? resp.status() : null, url: s.url.replace(/key=[^&#]+/, 'key=…'), headings: (s.aria.main.match(/heading "[^"]*"/g) || []).slice(0, 4),
            main: (s.text.main || '').replace(/\s+/g, ' ').trim().slice(0, 400), dialog: s.text.dialog,
            links: (s.aria.main.match(/link "[^"]*"/g) || []).slice(0, 8), buttons: (s.aria.main.match(/button "[^"]*"/g) || []).slice(0, 10)};
    };

    const {page: mp, close: closeM} = await launch(app);
    const {page: vp, close: closeV} = await launch(app);
    const {page: bp, close: closeB} = await launch(app);
    try {
        await signIn(mp, `mgr${T}`);

        // ── cancel ──────────────────────────────────────────────────────
        if (want('cancel')) await step('cancel', async () => {
            const to = rcpt('c');
            const mail = await sendNew(mp, S, {to, role: ROLE[app.name], marker: `Invitation${T}c`, key: 'cancel-send'});
            const out = facts.cancel = {};
            await gotoAccess(mp, S);
            const row = invTable(mp).getByRole('row').filter({hasText: to});
            await rowAction(mp, row, 'Cancel Invite');
            const dialog = mp.getByRole('dialog').last();
            await expect(dialog).toBeVisible({timeout: 15_000});
            const d = await snap(mp, 'cancel-dialog');
            out.dialog = d.text.dialog;
            out.buttons = await dialog.getByRole('button').allInnerTexts();
            await dialog.getByRole('button', {name: 'Cancel Invitation', exact: true}).click();
            await expect(dialog).toBeHidden({timeout: 15_000});
            await idle(mp);
            await snap(mp, 'cancel-after');
            out.rowsSamePage = await invRows(mp);
            await gotoAccess(mp, S);
            out.rowsReload = await invRows(mp);
            out.accept = await landing(vp, mail.accept, 'cancel-accept-link');
            out.decline = await landing(vp, mail.decline, 'cancel-decline-link');
            out.truncated = await landing(vp, mail.accept.slice(0, -3), 'cancel-accept-truncated');
        });

        // ── edit ────────────────────────────────────────────────────────
        if (want('edit')) await step('edit', async () => {
            const to = rcpt('e');
            const first = await sendNew(mp, S, {to, role: ROLE[app.name], marker: `${T}first`, key: 'edit-first'});
            const out = facts.edit = {};
            await gotoAccess(mp, S);
            await rowAction(mp, invTable(mp).getByRole('row').filter({hasText: to}), 'Edit');
            const warn = mp.getByRole('dialog').last();
            await expect(warn).toBeVisible({timeout: 15_000});
            out.warn = (await snap(mp, 'edit-warn')).text.dialog;
            await warn.getByRole('button', {name: 'Edit Invitation'}).click();
            await mp.waitForURL(/\/invitation\/edit\/\d+/, {timeout: 30_000});
            await expect(mp.getByRole('heading', {name: /Enter details/})).toBeVisible({timeout: 30_000});
            await idle(mp);
            const w = await snap(mp, 'edit-wizard');
            out.wizardSteps = (w.aria.main.match(/listitem[^\n]*/g) || []).slice(0, 6);
            out.searchInputs = await mp.getByLabel(/Search for a user by email address/).count();
            out.emailValue = await mp.getByLabel(/^Email/).first().inputValue().catch(() => null);
            out.givenValue = await mp.getByLabel(/^Given Name/).first().inputValue().catch(() => null);
            out.rowSelectValue = await newRow(mp).getByLabel(/^Select a new role/).inputValue().catch(() => null);
            await fillRow(mp, newRow(mp), {role: ROLE2[app.name]});
            await compose(mp, `${T}second`, 'edit-second');
            const second = await readMail(to, `${T}second`);
            out.rowsAfter = await invRows(mp);
            out.secondAccept = await landing(vp, second.accept, 'edit-second-accept');
            out.firstAccept = await landing(vp, first.accept, 'edit-first-accept');
            out.firstDecline = await landing(vp, first.decline, 'edit-first-decline');
            out.secondRoles = (second.text.match(/Newly assigned roles[\s\S]*?On accepting/) || [''])[0].replace(/\s+/g, ' ').slice(0, 300);
        });

        // ── wrong person ────────────────────────────────────────────────
        if (want('wrong')) await step('wrong', async () => {
            const to = `ex${T}@mail.test`;
            const mail = await sendExisting(mp, S, {to, role: ROLE3[app.name], marker: `Invitation${T}w`, key: 'wrong-send'});
            const out = facts.wrong = {};
            await signIn(bp, `byst${T}`);
            out.refused = await landing(bp, mail.accept, 'wrong-refused');
            const refusal = bp.getByRole('dialog').filter({hasText: 'different user'});
            out.refusalButtons = await refusal.getByRole('button').allInnerTexts().catch(() => null);
            await refusal.getByRole('button', {name: 'Logout'}).click();
            await bp.waitForTimeout(1500);
            await idle(bp);
            out.afterLogout = (await snap(bp, 'wrong-after-logout')).url;
            out.sessionCheck = await landing(bp, `/index.php/${S}/submissions`, 'wrong-session-check');
            out.reopened = await landing(bp, mail.accept, 'wrong-reopened');
            out.reopenedAccept = await bp.getByRole('button', {name: new RegExp(`^Accept And Continue to ${ACR[app.name]}`)}).count();
            out.reopenedPassword = await bp.getByLabel(/^Password/).count();
        });

        // ── user row (scenario 8 extras) ────────────────────────────────
        if (want('row')) await step('row', async () => {
            const out = facts.row = {};
            const email = `mem${T}@mail.test`;
            await gotoAccess(mp, S);
            await rowAction(mp, usersTable(mp).getByRole('row').filter({hasText: email}), /^Edit$/);
            await expect(mp.getByRole('heading', {name: /Enter details/})).toBeVisible({timeout: 30_000});
            await idle(mp);
            const e = await snap(mp, 'row-edit');
            out.steps = (e.aria.main.match(/listitem[^\n]*/g) || []).slice(0, 6);
            out.saveBefore = await mp.getByRole('button', {name: 'Save And Continue'}).isEnabled();
            out.newRowsBefore = await mp.getByLabel(/^Select a new role/).count();
            await heldRow(mp, 'Reader').getByRole('button', {name: 'Remove Role'}).click();
            const rd = mp.getByRole('dialog', {name: 'Remove Role'});
            await expect(rd).toBeVisible({timeout: 15_000});
            out.removeReader = (await snap(mp, 'row-remove-reader-dialog')).text.dialog;
            const ended = mp.waitForResponse((r) => r.url().includes('/endRole/'), {timeout: 30_000}).catch(() => null);
            await rd.getByRole('button', {name: 'Remove Role'}).click();
            out.endRoleStatus = (await ended)?.status() ?? null;
            await expect(rd).toBeHidden({timeout: 15_000});
            await idle(mp);
            await heldRow(mp, 'Author').getByRole('button', {name: 'Remove Role'}).click();
            const last = mp.getByRole('dialog').last();
            await expect(last).toBeVisible({timeout: 15_000});
            out.lastRole = (await snap(mp, 'row-remove-last-dialog')).text.dialog;
            out.lastRoleButtons = await last.getByRole('button').allInnerTexts();
            await last.getByRole('button', {name: 'Close'}).click();
            await expect(last).toBeHidden({timeout: 15_000});
            out.authorAfterClose = {remove: await heldRow(mp, 'Author').getByRole('button', {name: 'Remove Role'}).count(),
                select: await heldRow(mp, 'Author').getByRole('combobox').count()};
            out.saveStill = await mp.getByRole('button', {name: 'Save And Continue'}).isEnabled();
            await mp.getByRole('button', {name: 'Add Another Role'}).click();
            await idle(mp);
            out.saveAfterAdd = await mp.getByRole('button', {name: 'Save And Continue'}).isEnabled();
            await mp.getByRole('button', {name: 'Save And Continue'}).click();
            await mp.waitForTimeout(1500);
            await idle(mp);
            const er = await snap(mp, 'row-empty-errors');
            out.emptyErrors = await newRow(mp).getByText('This field is required.').count();
            out.stillDetails = await mp.getByRole('heading', {name: /Enter details/}).count();
            out.notices = er.notices;
            // Leave with the empty row unsaved, by a typed address.
            const dialogs = [];
            mp.on('dialog', (d) => { dialogs.push(d.message()); d.accept().catch(() => {}); });
            await gotoAccess(mp, S);
            out.leaveDialogs = dialogs;
            out.rowsAfterLeave = await invRows(mp);
        });

        // ── disabled user, read only ────────────────────────────────────
        if (want('disabled')) await step('disabled', async () => {
            const out = facts.disabled = {};
            const email = `dis${T}@mail.test`;
            const read = async (key) => {
                const s = await snap(mp, key);
                return {
                    heading: await mp.getByRole('heading', {name: 'The user is currently disabled.'}).count(),
                    text: (s.text.main.match(/The user (was|is)[^\n]*/g) || []),
                    addEnabled: await mp.getByRole('button', {name: 'Add Another Role'}).isEnabled().catch(() => null),
                    saveEnabled: await mp.getByRole('button', {name: 'Save And Continue'}).isEnabled().catch(() => null),
                    newRows: await mp.getByLabel(/^Select a new role/).count(),
                    authorSelect: await heldRow(mp, 'Author').getByRole('combobox').isEnabled().catch(() => null),
                    authorRemove: await heldRow(mp, 'Author').getByRole('button', {name: 'Remove Role'}).isEnabled().catch(() => null),
                };
            };
            await openWizard(mp, S);
            await search(mp, email);
            out.search = await read('disabled-search');
            await gotoAccess(mp, S);
            await rowAction(mp, usersTable(mp).getByRole('row').filter({hasText: email}), /^Edit$/);
            await expect(mp.getByRole('heading', {name: /Enter details/})).toBeVisible({timeout: 30_000});
            await idle(mp);
            out.edit = await read('disabled-edit');
        });

        // ── fields and wizard navigation ────────────────────────────────
        if (want('fields')) await step('fields', async () => {
            const out = facts.fields = {};
            // Search by username: the member is found.
            await openWizard(mp, S);
            await search(mp, `mem${T}`);
            const u = await snap(mp, 'fields-search-username');
            out.byUsername = (u.text.main.match(/The user [^\n]*/) || [null])[0];
            out.byUsernameEmailShown = u.text.main.includes(`mem${T}@mail.test`);
            // Search by a partial address: a miss.
            await openWizard(mp, S);
            await search(mp, `mem${T}@mail`);
            const p = await snap(mp, 'fields-search-partial');
            out.byPartial = (p.text.main.match(/The user [^\n]*/) || [null])[0];
            out.byPartialEmailBox = await mp.getByLabel(/^Email address/).inputValue().catch(() => null);
            // A newcomer's rows: masthead blank refused, the role chosen in row 1 in row 2's list, row 2's names.
            await openWizard(mp, S);
            await search(mp, rcpt('f'));
            await mp.getByLabel(/^Given Name/).first().fill('Fey');
            const r1 = newRow(mp);
            await r1.getByLabel(/^Select a new role/).selectOption({label: ROLE[app.name]});
            await r1.getByRole('textbox').fill(today());
            out.mastheadBlank = await r1.getByRole('combobox').last().inputValue();
            await mp.getByRole('button', {name: 'Save And Continue'}).click();
            await mp.waitForTimeout(1500);
            await idle(mp);
            const b = await snap(mp, 'fields-masthead-blank');
            out.mastheadBlankErrors = await mp.getByText('This field is required.').count();
            out.mastheadBlankStayed = await mp.getByRole('heading', {name: /Enter details/}).count();
            out.notices = b.notices;
            await mp.getByRole('button', {name: 'Add Another Role'}).click();
            await idle(mp);
            const rows = mp.getByRole('row').filter({has: mp.locator('select')}).filter({hasNot: mp.getByRole('columnheader')});
            out.rowCount = await rows.count();
            const second = mp.locator('main tbody tr').last();
            out.row2Options = await second.locator('select').first().locator('option').evaluateAll((os) => os.map((o) => `${o.textContent.trim()}${o.disabled ? ' [disabled]' : ''}`));
            const a = await snap(mp, 'fields-two-rows');
            out.rowsAria = (a.aria.main.match(/row "[^\n]*/g) || []).slice(-3);
            out.row2Names = await second.locator('select, input').evaluateAll((els) => els.map((el) => ({tag: el.tagName, type: el.type, id: el.id || null,
                labelled: el.labels && el.labels.length ? Array.from(el.labels).map((l) => l.textContent.replace(/\s+/g, ' ').trim()).join(' | ') : null,
                ariaLabel: el.getAttribute('aria-label'), ariaLabelledby: el.getAttribute('aria-labelledby')})));
            out.row1Names = await mp.locator('main tbody tr').filter({has: mp.locator('select')}).first().locator('select, input').evaluateAll((els) => els.map((el) => ({tag: el.tagName, id: el.id || null,
                labelled: el.labels && el.labels.length ? Array.from(el.labels).map((l) => l.textContent.replace(/\s+/g, ' ').trim()).join(' | ') : null})));
            // "Back" to the search step, then forward again: what is kept.
            await mp.getByRole('button', {name: 'Back', exact: true}).click();
            await expect(mp.getByRole('heading', {name: /Search User/})).toBeVisible({timeout: 30_000});
            await idle(mp);
            const bk = await snap(mp, 'fields-back-search');
            out.backSearchValue = await mp.getByLabel(/Search for a user by email address/).inputValue();
            out.backDialog = bk.text.dialog;
            await search(mp, rcpt('f'));
            await snap(mp, 'fields-back-forward');
            out.forwardGiven = await mp.getByLabel(/^Given Name/).first().inputValue();
            out.forwardRows = await mp.getByLabel(/^Select a new role/).count();
            out.forwardRole = await newRow(mp).getByLabel(/^Select a new role/).inputValue();
            out.forwardDate = await newRow(mp).getByRole('textbox').inputValue().catch(() => null);
            // "Back" again, then another person's address: what reaches them.
            await mp.getByRole('button', {name: 'Back', exact: true}).click();
            await expect(mp.getByRole('heading', {name: /Search User/})).toBeVisible({timeout: 30_000});
            await search(mp, rcpt('g'));
            await snap(mp, 'fields-back-other-address');
            out.otherEmail = await mp.getByLabel(/^Email address/).inputValue().catch(() => null);
            out.otherGiven = await mp.getByLabel(/^Given Name/).first().inputValue();
            out.otherRows = await mp.getByLabel(/^Select a new role/).count();
            out.otherRole = await newRow(mp).getByLabel(/^Select a new role/).inputValue();
            // "Back" again, then an existing member: what the step shows.
            await mp.getByRole('button', {name: 'Back', exact: true}).click();
            await expect(mp.getByRole('heading', {name: /Search User/})).toBeVisible({timeout: 30_000});
            await search(mp, `ex${T}@mail.test`);
            const om = await snap(mp, 'fields-back-member');
            out.memberAfterBack = {notice: (om.text.main.match(/The user [^\n]*/) || [null])[0], newRows: await mp.getByLabel(/^Select a new role/).count(),
                role: await newRow(mp).getByLabel(/^Select a new role/).inputValue().catch(() => null), givenBoxes: await mp.getByLabel(/^Given Name/).count()};
            // "Cancel" with nothing changed.
            await openWizard(mp, S);
            const dialogs = [];
            const onD = (d) => { dialogs.push(d.message()); d.accept().catch(() => {}); };
            mp.on('dialog', onD);
            await mp.getByRole('button', {name: 'Cancel', exact: true}).click();
            await mp.waitForTimeout(1500);
            await idle(mp);
            const c = await snap(mp, 'fields-cancel-unchanged');
            mp.off('dialog', onD);
            out.cancelUnchanged = {url: c.url, dialog: c.text.dialog, browserDialogs: dialogs};
            if (c.text.dialog) {
                out.cancelUnchanged.buttons = await mp.getByRole('dialog').last().getByRole('button').allInnerTexts();
                await mp.keyboard.press('Escape');
            }
        });

        // ── past start date ─────────────────────────────────────────────
        if (want('past')) await step('past', async () => {
            const out = facts.past = {};
            const to = `past${T}@mail.test`;
            const mail = await sendExisting(mp, S, {to, role: ROLE3[app.name], marker: `Invitation${T}p`, key: 'past-send', date: '2026-10-01'});
            out.mailRoles = (mail.text.match(/Newly assigned roles[\s\S]*?On accepting/) || [''])[0].replace(/\s+/g, ' ').slice(0, 300);
            await gotoAccess(mp, S);
            out.invRow = (await invRows(mp)).filter((t) => t.includes(to));
            const {page: pp, close: closeP} = await launch(app);
            try {
                await landing(pp, mail.accept, 'past-accept');
                await pp.getByRole('button', {name: new RegExp(`^Accept And Continue to ${ACR[app.name]}`)}).click();
                await expect(pp.getByRole('dialog')).toBeVisible({timeout: 30_000});
                out.dialog = (await snap(pp, 'past-accepted')).text.dialog;
            } finally {
                await closeP();
            }
            await gotoAccess(mp, S);
            out.userRow = (await usersTable(mp).locator('tbody tr').filter({hasText: to}).allInnerTexts()).map((t) => t.replace(/\s+/g, ' '));
            await rowAction(mp, usersTable(mp).getByRole('row').filter({hasText: to}), /^Edit$/);
            await expect(mp.getByRole('heading', {name: /Enter details/})).toBeVisible({timeout: 30_000});
            await idle(mp);
            await snap(mp, 'past-edit');
            out.roleRow = (await heldRow(mp, ROLE3[app.name]).allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').slice(0, 160));
        });

        // ── A12: a real type with no wizard ─────────────────────────────
        if (want('a12')) await step('a12', async () => {
            facts.a12 = {
                reviewerAccess: await landing(mp, `/index.php/${S}/invitation/create/reviewerAccess`, 'a12-reviewer-access'),
                control: await landing(mp, `/index.php/${S}/invitation/create`, 'a12-no-type'),
            };
        });

        // ── ORCID on ────────────────────────────────────────────────────
        if (want('orcid')) await step('orcid', async () => {
            const out = facts.orcid = {};
            await signIn(mp, `mgr${O}`);
            // Search by the verified member's ORCID iD.
            await openWizard(mp, O);
            await search(mp, ORCID_ID);
            const s = await snap(mp, 'orcid-search-by-id');
            out.byOrcid = (s.text.main.match(/The user [^\n]*/) || [null])[0];
            out.byOrcidShowsVera = s.text.main.includes(`ver${O}@mail.test`);
            const n = await sendNew(mp, O, {to: rcpt('o'), role: ROLE[app.name], marker: `Invitation${T}on`, key: 'orcid-newcomer-send'});
            out.newcomer = await landing(vp, n.accept, 'orcid-newcomer-accept');
            out.newcomerButtons = await vp.locator('main').getByRole('button').allInnerTexts();
            const skip = vp.getByRole('button', {name: 'Skip ORCID verification'});
            if (await skip.count()) {
                await skip.click();
                await vp.waitForTimeout(1500);
                await idle(vp);
                const k = await snap(vp, 'orcid-newcomer-skipped');
                out.afterSkip = (k.aria.main.match(/heading "STEP[^"]*"/) || [null])[0];
            }
            // The ORCID step's own "Cancel": its dialog, "Go Back".
            await landing(vp, n.accept, 'orcid-newcomer-again');
            const cancel = vp.getByRole('button', {name: 'Cancel', exact: true});
            if (await cancel.count()) {
                await cancel.click();
                const dlg = vp.getByRole('dialog').last();
                await expect(dlg).toBeVisible({timeout: 15_000});
                out.orcidCancel = {dialog: (await snap(vp, 'orcid-cancel-dialog')).text.dialog, buttons: await dlg.getByRole('button').allInnerTexts()};
                await dlg.getByRole('button', {name: 'Go Back'}).click();
                await expect(dlg).toBeHidden({timeout: 15_000});
                out.orcidCancel.afterGoBack = (((await snap(vp, 'orcid-cancel-go-back')).aria.main.match(/heading "STEP[^"]*"/)) || [null])[0];
            }
            const v = await sendExisting(mp, O, {to: `ver${O}@mail.test`, role: ROLE3[app.name], marker: `Invitation${T}ov`, key: 'orcid-verified-send'});
            out.verified = await landing(vp, v.accept, 'orcid-verified-accept');
            const x = await sendExisting(mp, O, {to: `nov${O}@mail.test`, role: ROLE3[app.name], marker: `Invitation${T}ox`, key: 'orcid-noid-send'});
            out.memberNoId = await landing(vp, x.accept, 'orcid-member-noid-accept');
            out.memberNoIdButtons = await vp.locator('main').getByRole('button').allInnerTexts();
            await signIn(mp, `mgr${T}`);
        });

        // ── Emails screen (read only, publicknowledge) ──────────────────
        if (want('emails')) await step('emails', async () => {
            const out = facts.emails = {};
            const {page: ep, close: closeE} = await launch(app);
            try {
                await signIn(ep, 'manager.maya');
                await ep.goto(`/index.php/${app.contextPath}/management/settings/manageEmails`);
                await expect(ep.getByRole('heading', {name: 'Manage Emails'})).toBeVisible({timeout: 30_000});
                await idle(ep);
                const sb = ep.getByRole('searchbox');
                for (const [k, q] of [['invited', 'User Invited to Role Notification'], ['control', 'Password Reset Confirm']]) {
                    await sb.fill('');
                    await sb.pressSequentially(q, {delay: 20});
                    await sb.press('Enter');
                    await ep.waitForTimeout(1500);
                    await idle(ep);
                    const s = await snap(ep, `emails-search-${k}`);
                    out[k] = {noItems: s.text.main.includes('No items found.'), rowShown: await ep.getByText(q, {exact: true}).count(),
                        edit: await ep.getByRole('button', {name: `Edit ${q}`}).count()};
                }
            } finally {
                await closeE();
            }
        });
    } finally {
        record('facts', facts);
        await closeM();
        await closeV();
        await closeB();
    }
});
