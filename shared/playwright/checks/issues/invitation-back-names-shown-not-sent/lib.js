// Helpers of walk.js here (issue report docs/issues/U06-A15-invitation-back-names-shown-not-sent.md).
// Requiring this file runs nothing. The send wizard's locators are those of the U06 drift sweep
// (shared/playwright/checks/U06/SW22/back.js), proven on main and stable-3_5_0.
const {idle, screen, drainJobs} = require('../../../probe');

const T = 30_000;
const ROLE = {ojs: 'Copyeditor', omp: 'Copyeditor', ops: 'Moderator'};
const ADDR = {
    first: 'hkq23d-first@example.com',
    second: 'hkq23d-second@example.com',
    third: 'hkq23d-third@example.com',
};
const flat = (s, n = 1500) => (s || '').replace(/\s+/g, ' ').trim().slice(0, n);

function today() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const snap = (page) => screen(page);
const newRow = (page) => page.getByRole('row').filter({has: page.getByLabel(/^Select a new role/)}).last();

/** Settings > Users & Roles, "Invite to a role": the "Search User" step. */
async function openWizard(page, app) {
    await page.goto(app.url(`/index.php/${app.contextPath}/management/settings/access`));
    await idle(page);
    await page.getByRole('button', {name: 'Invite to a role'}).click();
    await page.getByRole('heading', {name: /Search User/}).waitFor({timeout: T});
    await idle(page);
}

/** "Search User" for `address`: lands on "Enter details". */
async function search(page, address) {
    await page.getByLabel(/Search for a user by email address/).fill(address);
    await page.getByRole('button', {name: 'Search User', exact: true}).click();
    await page.getByRole('heading', {name: /Enter details/}).waitFor({timeout: T});
    await idle(page);
}

/** Type the names and fill the role row (role, today, "Does not appear on the masthead"). */
async function fillDetails(page, {given, family, role}) {
    await page.getByLabel(/^Given Name/).first().fill(given);
    await page.getByLabel(/^Family Name/).first().fill(family);
    await fillRole(page, role);
}

async function fillRole(page, role) {
    await newRow(page).getByLabel(/^Select a new role/).selectOption({label: role});
    await newRow(page).getByRole('textbox').fill(today());
    await newRow(page).getByRole('combobox').last().selectOption({label: 'Does not appear on the masthead'});
}

/** What "Enter details" shows: the step's heading line, the boxes, the role row. */
async function readDetails(page) {
    const W = {timeout: 5000};
    const opt = async (loc) => {
        // a select whose value matches no option has no checked option: read the value with a
        // timeout so an empty row is recorded, never waited on
        const t = await loc.evaluate((el) => (el.selectedIndex >= 0 ? el.options[el.selectedIndex].text : ''), null, {timeout: 5000}).catch(() => null);
        return t === null ? null : flat(t, 100);
    };
    return {
        heading: flat(await page.getByRole('heading', {name: /Enter details/}).innerText(W).catch(() => null), 200),
        email: await page.getByLabel(/^Email address/).first().inputValue(W).catch(() => null),
        given: await page.getByLabel(/^Given Name/).first().inputValue(W).catch(() => null),
        family: await page.getByLabel(/^Family Name/).first().inputValue(W).catch(() => null),
        roleRows: await page.getByLabel(/^Select a new role/).count(),
        role: await opt(newRow(page).getByLabel(/^Select a new role/)),
        date: await newRow(page).getByRole('textbox').inputValue(W).catch(() => null),
        masthead: await opt(newRow(page).getByRole('combobox').last()),
    };
}

/** Fill only what is empty on "Enter details"; returns what was filled. */
async function fillEmpty(page, shown, {given, family, role}) {
    const filled = [];
    if (!shown.given) {
        await page.getByLabel(/^Given Name/).first().fill(given);
        filled.push('given');
    }
    if (!shown.family) {
        await page.getByLabel(/^Family Name/).first().fill(family);
        filled.push('family');
    }
    const emptyRole = !shown.role || /^\s*$|Select/i.test(shown.role);
    if (emptyRole || !shown.date || !shown.masthead || /Select/i.test(shown.masthead)) {
        await fillRole(page, role);
        filled.push('roleRow');
    }
    return filled;
}

/** "Save And Continue" to the email step, its Subject filled in. */
async function saveAndContinue(page) {
    await page.getByRole('button', {name: 'Save And Continue'}).click();
    const subject = page.getByLabel(/^Subject/);
    await subject.waitFor({timeout: T});
    for (let i = 0; i < 60 && !(await subject.inputValue()); i++) await page.waitForTimeout(500);
    await idle(page);
}

/** "Invite user to the role", the "Invitation Sent" dialog's text, "View All Users". */
async function sendAndView(page) {
    await page.getByRole('button', {name: 'Invite user to the role'}).click();
    const dialog = page.getByRole('dialog').filter({hasText: 'Invitation Sent'});
    await dialog.waitFor({timeout: T});
    const text = flat(await dialog.innerText(), 400);
    await dialog.getByRole('button', {name: 'View All Users'}).click();
    await page.waitForURL(/management\/settings\/access/, {timeout: T});
    await idle(page);
    return {dialog: text};
}

/** The Invitations table's row for `address`, and the email that address got from this fleet. */
async function result(page, app, address, since) {
    const table = page.getByRole('table', {name: /^Invitations \(/});
    await table.waitFor({timeout: T}).catch(() => {});
    const header = (await table.locator('thead th').allInnerTexts().catch(() => [])).map((t) => flat(t, 60));
    const row = table.locator('tbody tr').filter({hasText: address});
    const cells = (await row.first().locator('td, th').allInnerTexts().catch(() => [])).map((t) => flat(t, 200));
    let message = await app.fleetMail.find({to: address, since, timeoutMs: 20_000}).catch(() => null);
    if (!message) {
        await drainJobs(app).catch(() => {});
        message = await app.fleetMail.find({to: address, since, timeoutMs: 30_000}).catch(() => null);
    }
    let mail = null;
    if (message) {
        const full = await app.fleetMail.fullMessage(message.ID);
        const text = (full.Text || '').replace(/\r/g, '');
        mail = {
            subject: full.Subject,
            to: (full.To || []).map((t) => ({name: t.Name, address: t.Address})),
            greeting: (text.match(/Dear[^\n]*/) || [null])[0],
            roles: flat((text.match(/Newly assigned roles[\s\S]{0,400}/) || [''])[0], 400),
        };
    }
    return {invitationsHeader: header, invitationRow: cells, invitationRows: await row.count(), mail};
}

/** What the database holds for the walk (Evidence only; the steps read the screens). */
function dbRead(app, sql, emails) {
    const list = emails.map((e) => `'${e}'`).join(',');
    try {
        return sql(app, `select invitation_id, email, status, payload::jsonb->'givenName', payload::jsonb->'familyName', payload::jsonb->'userGroupsToAdd' from invitations where email in (${list}) order by invitation_id`).split('\n').filter(Boolean);
    } catch (e) {
        return [`ERR ${String(e.message).slice(0, 200)}`];
    }
}

module.exports = {T, ROLE, ADDR, flat, today, snap, openWizard, search, fillDetails, fillRole, readDetails, fillEmpty, saveAndContinue, sendAndView, result, dbRead};
