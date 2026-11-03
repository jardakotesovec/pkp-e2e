// Helpers of walk.js and walk-signed-out.js here (issue reports docs/issues/U04-A5-assistant-orcid-controls-refused.md
// and docs/issues/U04-A5-orcid-field-refusal-shown-as-done.md). Requiring this file runs nothing.
// ORCID on and the verified iD: copied from ../publish-without-issue-orcid-contributor-error/lib.js
// (setOrcidMember, seedVerifiedOrcid), so this folder needs no other report's.
// The user menu's "Logout": copied from ../password-change-logout-audited-as-ip-change/lib.js.
// The newcomer's invitation: ../newcomer-not-signed-in-after-accepting/lib.js. The Participants box
// and its windows: shared/playwright/pages/StageParticipantsPages.js.
const path = require('path');
const {idle, screen, shot, sql} = require('../../../probe');
const N = require('../newcomer-not-signed-in-after-accepting/lib.js');

const T = 30_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (s, n = 400) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));

/** Per app, on PKP's default test dataset (docs/process/dataset.md): the submission, its contributor, the Assistant. */
const CASES = {
    ojs: {id: 3, contributor: 'Catherine Kwantes', email: 'ckwantes@mailinator.com', assistant: 'mfritz', assistantName: 'Maria Fritz', role: 'Copyeditor'},
    omp: {id: 7, contributor: 'Dietmar Kennepohl', email: 'dkennepohl@mailinator.com', assistant: 'mfritz', assistantName: 'Maria Fritz', role: 'Copyeditor'},
    // The dataset's preprint server has no Assistant who takes part in a stage: the steps give
    // "Editorial Board Member" the Production stage and invite a newcomer to it.
    ops: {id: 1, contributor: 'Carlo Corino', email: 'ccorino@mailinator.com', assistant: 'adau04r4', assistantName: 'Ada Assist-u04r4', role: 'Editorial Board Member', newcomer: true},
};

/** The OPS newcomer (names tagged u04r4; the password is the username twice, as the kit's signIn() expects). */
const NEWCOMER = {email: 'ada.u04r4@mailinator.com', givenName: 'Ada', familyName: 'Assist-u04r4', username: 'adau04r4', password: 'adau04r4adau04r4', country: 'Canada'};

/** The contributor the control adds (names tagged u04r4). */
const ADDED = {givenName: 'Ola', familyName: 'Added-u04r4', email: 'ola.u04r4@mailinator.com', country: 'Canada'};

/** Settings › Users & Roles › "ORCID": enable, the API type, dummy credentials, "Save". */
async function setOrcidMember(page, app, {apiType = 'memberSandbox'} = {}, rec = {}) {
    await page.goto(app.url(`/index.php/${app.contextPath}/management/settings/access`));
    await idle(page);
    const tab = page.getByRole('tab', {name: 'ORCID', exact: true});
    await tab.click();
    const box = page.getByRole('checkbox', {name: 'Enable ORCID functionality'});
    await box.waitFor({state: 'visible', timeout: T});
    if (!(await box.isChecked())) await box.check();
    const api = page.locator('select[name="orcidApiType"]');
    await api.waitFor({state: 'visible', timeout: T});
    await api.selectOption(apiType);
    await page.locator('input[name="orcidClientId"]').fill('APP-0000000000000000');
    await page.locator('input[name="orcidClientSecret"]').fill('00000000-0000-0000-0000-000000000000');
    const out = {apiChoice: flat(await api.locator('option:checked').innerText().catch(() => null), 60)};
    const saved = page.waitForResponse((r) => /\/api\/v1\/contexts\/\d+/.test(r.url()) && r.request().method() !== 'GET', {timeout: T}).catch(() => null);
    await page.locator('[id="orcidSettings"]').getByRole('button', {name: 'Save', exact: true}).click();
    const r = await saved;
    out.save = r ? r.status() : null;
    out.savedStatus = await page.locator('[role="status"]:has-text("Saved")').first().waitFor({timeout: 10_000}).then(() => true).catch(() => false);
    out.screen = await screen(page);
    await shot(page, (rec.prefix || '') + 'orcid-settings').catch(() => {});
    out.stored = sql(app, `select setting_name, setting_value from ${app.contextTables.settings} where setting_name in ('orcidEnabled','orcidApiType','orcidClientId') order by 1`);
    return out;
}

/**
 * The precondition only ORCID's sign-in creates: the contributor's verified iD and access
 * token, written as PKP\orcid\actions\VerifyIdentityWithOrcid::setIdentityData() and
 * saveIdentityData() store them (author_settings, locale '', the token's expiry as
 * Carbon::toDateTimeString(), a fixed date about 20 years ahead as ORCID grants).
 */
function seedVerifiedOrcid(app, submissionId, email) {
    const statement = `INSERT INTO author_settings (author_id, locale, setting_name, setting_value)
SELECT a.author_id, '', v.setting_name, v.setting_value
FROM authors a
JOIN submissions s ON s.current_publication_id = a.publication_id
CROSS JOIN (
  SELECT 'orcid' AS setting_name, 'https://sandbox.orcid.org/0000-0002-1825-0097' AS setting_value
  UNION ALL SELECT 'orcidIsVerified', '1'
  UNION ALL SELECT 'orcidAccessToken', '00000000-1111-2222-3333-444444444444'
  UNION ALL SELECT 'orcidAccessScope', '/activities/update'
  UNION ALL SELECT 'orcidRefreshToken', '55555555-6666-7777-8888-999999999999'
  UNION ALL SELECT 'orcidAccessExpiresOn', '2046-10-01 00:00:00'
) v
WHERE s.submission_id = ${submissionId}
  AND a.email = '${email}';`;
    const result = sql(app, statement);
    const rows = sql(app, `select a.author_id, s.setting_name, s.setting_value from authors a join author_settings s on s.author_id=a.author_id where a.email='${email}' and a.publication_id=(select current_publication_id from submissions where submission_id=${submissionId}) and s.setting_name like 'orcid%' order by 2`);
    return {statement, result, rows: rows.split('\n')};
}

const O = {setOrcidMember, seedVerifiedOrcid};

/**
 * In a second tab of the same browser: open the dashboard, the user menu (initials) › "Logout".
 * Returns the tab (left on the login page) and where the logout landed.
 */
async function logoutInOtherTab(page, app, other) {
    const tab = other || (await page.context().newPage());
    await tab.goto(app.url(`/index.php/${app.contextPath}/dashboard`));
    await idle(tab);
    const nav = tab.locator('[data-cy="app-user-nav"] button').first();
    await nav.click({timeout: 8000});
    const link = tab.locator('[data-cy="app-user-nav"]').getByRole('link', {name: 'Logout', exact: true});
    await Promise.all([tab.waitForURL(/\/login/, {timeout: 15000}), link.click({timeout: 5000})]);
    await idle(tab);
    return {tab, landed: tab.url().replace(/^https?:\/\/[^/]+/, '')};
}

/** On the login page the logout left the tab on: username, password, "Login". */
async function loginOnTab(tab, username, password) {
    await tab.locator('form#login input#username').fill(username);
    await tab.locator('form#login input#password').fill(password || username + username);
    await Promise.all([
        tab.waitForURL((u) => !/\/login(\/|$|\?)/.test(u.pathname), {timeout: 20000}).catch(() => null),
        tab.locator('form#login button[type="submit"]').click(),
    ]);
    await idle(tab);
    return tab.url().replace(/^https?:\/\/[^/]+/, '');
}

/**
 * Once the session has ended, the dashboard behind the workflow refreshes its counts on its own and
 * opens an "Error" window ("You are not authorized to access the requested resource.") over the
 * form. A person presses its "OK" before going on; this does the same, returning each window's text.
 */
async function dismissErrors(page) {
    const seen = [];
    for (let i = 0; i < 3; i++) {
        const error = page.getByRole('dialog').filter({hasText: /^\s*Error/}).last();
        if (!(await error.count())) break;
        seen.push(flat(await error.innerText().catch(() => null), 200));
        await error.getByRole('button', {name: 'OK', exact: true}).click().catch(() => {});
        await sleep(800);
    }
    return seen;
}

function pages(app) {
    return require(path.join(__dirname, '../../../pages/StageParticipantsPages.js'));
}

/** Settings › Users & Roles › "ORCID", Member Sandbox with dummy credentials (the U49 walk's helper). */
async function enableOrcid(page, app) {
    const out = await O.setOrcidMember(page, app, {apiType: 'memberSandbox'}, {prefix: 'p1-'});
    delete out.screen;
    return out;
}

/** Participants box › the person's row › "Edit": tick "Permissions", "OK". Returns the box before and after. */
async function grantPermissions(page, app, c) {
    const S = pages(app);
    const panel = new S.ParticipantsPanel(page, app.contextPath);
    await panel.goto(c.id);
    const win = await panel.openEdit(c.assistantName);
    const box = win.metadataBox();
    const before = await box.isChecked();
    if (!before) await box.check();
    const form = flat(await win.form().innerText().catch(() => ''), 600);
    await win.ok();
    return {before, after: true, form};
}

/** OPS: Settings › Users & Roles › Roles › "Editorial Board Member" › Edit: tick the stage "Production", "OK". */
async function roleTakesProduction(page, app, roleName) {
    const S = pages(app);
    const form = new S.RoleOptionsForm(page, app.contextPath);
    await form.gotoRoles();
    await form.openRole(roleName);
    const stage = form.root.getByRole('checkbox', {name: 'Production', exact: true});
    const before = await stage.isChecked();
    if (!before) await stage.check();
    await form.save();
    return {before, after: true};
}

/** OPS: invite the newcomer to the role and accept from the email as them; returns what each step showed. */
async function newcomerJoins(page, app, role, launch) {
    const since = new Date();
    const invited = await N.invite(page, app, {email: NEWCOMER.email, givenName: NEWCOMER.givenName, familyName: NEWCOMER.familyName, role});
    const link = await N.acceptLink(app, NEWCOMER.email, since);
    if (!link.accept) throw new Error('no invitation email with an accept link');
    const other = await launch(app);
    try {
        const met = await N.openAccept(other.page, link.accept);
        const p = other.page;
        await p.getByLabel(/^Username/).fill(NEWCOMER.username);
        await p.getByLabel(/^Password/).fill(NEWCOMER.password);
        await p.getByRole('checkbox').first().check();
        await p.getByRole('button', {name: 'Save and continue'}).click();
        await p.getByRole('heading', {name: /Enter details/}).waitFor({timeout: T});
        await idle(p);
        await p.getByLabel(/^Country/).first().selectOption({label: NEWCOMER.country});
        await p.getByRole('button', {name: 'Save and continue'}).click();
        await p.getByRole('heading', {name: /Review & create account/}).waitFor({timeout: T});
        await idle(p);
        const accepted = await N.acceptAndLeave(p);
        return {invited: invited.sentText, subject: link.subject, met, accepted: {dialog: accepted.dialog, finalize: accepted.finalize}};
    } finally {
        await other.close();
    }
}

/** OPS: Participants › "Assign": the role, the person, "Permissions" ticked, "OK". */
async function assign(page, app, c) {
    const S = pages(app);
    const panel = new S.ParticipantsPanel(page, app.contextPath);
    await panel.goto(c.id);
    const win = await panel.openAssign();
    await win.chooseRole(c.role);
    await win.search(NEWCOMER.familyName);
    await win.choosePerson(c.assistantName);
    const box = win.metadataBox();
    const before = await box.isChecked().catch(() => null);
    if (before === false) await box.check();
    await win.ok();
    return {before, rows: await panel.rowLines().catch(() => null)};
}

/** The contributor's verified iD, written as ORCID's sign-in leaves it (the U49 walk's helper). */
function verifiedId(app, c) {
    const r = O.seedVerifiedOrcid(app, c.id, c.email);
    return {statement: r.statement, rows: r.rows};
}

/** What the database holds for the contributor's iD now. */
function stored(app, c) {
    return sql(app, `select s.setting_name, s.setting_value from authors a join submissions sub on sub.current_publication_id = a.publication_id join author_settings s on s.author_id = a.author_id where sub.submission_id = ${c.id} and a.email = '${c.email}' and (s.setting_name like 'orcid%') order by 1`).split('\n').filter(Boolean);
}

/** Open the submission's workflow, Publication › "Contributors". */
async function openContributors(page, app, c) {
    await page.goto(app.url(`/index.php/${app.contextPath}/dashboard/editorial?workflowSubmissionId=${c.id}`));
    await idle(page);
    await page.getByRole('link', {name: 'Contributors', exact: true}).first().click();
    await page.locator('.listPanel__item').first().waitFor({timeout: T});
    await idle(page);
    return {
        addButton: await page.getByRole('button', {name: 'Add Contributor'}).count(),
        rows: flat(await page.locator('.listPanel--contributor').innerText().catch(() => ''), 600),
    };
}

/** The contributor's "Edit": the form's side window and its "ORCID iD" field. */
async function openContributor(page, name) {
    const item = page.locator('.listPanel__item').filter({hasText: name});
    await item.getByRole('button', {name: 'Edit', exact: true}).click();
    const modal = page.locator('[data-cy="active-modal"]').filter({has: page.locator('[id^="contributor-givenName"]')});
    await modal.locator('[id^="contributor-givenName"]').first().waitFor({timeout: T});
    await idle(page);
    const field = modal.locator('.pkpFormField').filter({hasText: 'ORCID iD'}).first();
    return {modal, field};
}

/** The field as the screen shows it: its text, its buttons, its iD link. */
async function fieldState(field) {
    return {
        text: flat(await field.innerText().catch(() => null), 400),
        buttons: (await field.getByRole('button').allInnerTexts().catch(() => [])).map((t) => flat(t, 80)),
        link: await field.locator('a[href*="orcid.org"]').first().getAttribute('href').catch(() => null),
    };
}

/** Close the contributor's side window by its own "Cancel" (never Escape: the workflow is a dialog too). */
async function closeContributor(page, modal) {
    const cancel = modal.getByRole('button', {name: 'Cancel', exact: true});
    if (await cancel.count()) await cancel.first().click().catch(() => {});
    await sleep(800);
    await idle(page);
}

/**
 * Press `button` in the field, read the question, answer "Yes"; return the answer of the ORCID request,
 * every dialog shown within 4 s after it (an error window included, however briefly), and the field after.
 */
async function pressAndConfirm(page, field, button, apiPart) {
    const seen = [];
    const watch = setInterval(async () => {
        try {
            const texts = await page.getByRole('dialog').allInnerTexts();
            for (const t of texts.map((x) => flat(x, 300))) if (t && !seen.includes(t)) seen.push(t);
        } catch (e) { /* page busy */ }
    }, 100);
    const out = {button};
    try {
        await field.getByRole('button', {name: button, exact: true}).click();
        const question = page.getByRole('dialog').filter({has: page.getByRole('button', {name: 'Yes', exact: true})}).last();
        await question.waitFor({timeout: T});
        out.question = flat(await question.innerText(), 300);
        const answered = page.waitForResponse((r) => r.url().includes(apiPart), {timeout: T}).catch(() => null);
        await question.getByRole('button', {name: 'Yes', exact: true}).click();
        const r = await answered;
        out.request = r ? {method: r.request().method(), path: r.url().replace(/^https?:\/\/[^/]+/, ''), status: r.status(), body: flat(await r.text().catch(() => null), 300)} : null;
        await sleep(4000);
        await idle(page);
    } finally {
        clearInterval(watch);
    }
    out.dialogsSeen = seen;
    out.dialogsOpenNow = (await page.getByRole('dialog').allInnerTexts().catch(() => [])).map((t) => flat(t, 200)).filter((t) => !/^(Publication|Contributors|Edit|Add)/.test(t)).slice(0, 4);
    out.field = await fieldState(field);
    // an error window, when one is open, is answered "OK", and the field read again
    const error = page.getByRole('dialog').filter({hasText: /^\s*Error/}).last();
    if (await error.count()) {
        await error.getByRole('button', {name: 'OK', exact: true}).click().catch(() => {});
        await sleep(800);
        out.fieldAfterOk = await fieldState(field);
    }
    return out;
}

/**
 * Close the contributor's form by its "Close" control (no reload) and press the row's "Edit" again; returns
 * how it closed, the contributor fetch the reopening sent, and the field as the reopened form shows it.
 */
async function reopenContributor(page, name) {
    const modal = page.locator('[data-cy="active-modal"]').filter({has: page.locator('[id^="contributor-givenName"]')});
    const close = modal.locator('button').filter({hasText: /^\s*Close\s*$/});
    let closedBy = null;
    if (await close.count()) {
        await close.first().click();
        closedBy = 'Close';
    }
    await modal.locator('[id^="contributor-givenName"]').first().waitFor({state: 'detached', timeout: T}).catch(() => {});
    await sleep(900); // the side-modal slot (patterns.md pitfall 4)
    const fetched = page.waitForResponse((r) => /\/contributors\/\d+(\?|$)/.test(r.url()) && r.request().method() === 'GET', {timeout: 15_000}).then((r) => r.status()).catch(() => null);
    const item = page.locator('.listPanel__item').filter({hasText: name});
    await item.locator('button').filter({hasText: /^\s*Edit\s*$/}).first().click();
    const again = page.locator('[data-cy="active-modal"]').filter({has: page.locator('[id^="contributor-givenName"]')});
    await again.locator('[id^="contributor-givenName"]').first().waitFor({timeout: T});
    await idle(page);
    const field = again.locator('.pkpFormField').filter({hasText: 'ORCID iD'}).first();
    return {closedBy, fetch: await fetched, field: await fieldState(field)};
}

/** Mail to `to` since `since` whose links point at this install (other installs mail the same dataset addresses). */
async function mailTo(app, to, since, waitMs = 12_000) {
    const origin = new URL(app.baseURL).origin;
    const deadline = Date.now() + waitMs;
    let found = [];
    do {
        const result = await app.mail._search({to, since});
        found = [];
        for (const m of result.messages || []) {
            const full = await app.mail.fullMessage(m.ID);
            if ((full.HTML || full.Text || '').includes(origin)) found.push({subject: full.Subject, created: m.Created});
        }
        if (found.length) break;
        await sleep(1000);
    } while (Date.now() < deadline);
    return found;
}

/** Control: "Add Contributor", the names, email and country, "Request verification" › "Yes", "Save". */
async function addWithRequest(page, app) {
    await page.getByRole('button', {name: 'Add Contributor'}).click();
    const modal = page.locator('[data-cy="active-modal"]').filter({has: page.locator('[id^="contributor-givenName"]')});
    await modal.locator('[id^="contributor-givenName"]').first().waitFor({timeout: T});
    await idle(page);
    await modal.locator('[id^="contributor-givenName"]').first().fill(ADDED.givenName);
    await modal.locator('[id^="contributor-familyName"]').first().fill(ADDED.familyName);
    await modal.locator('input[name="email"]').fill(ADDED.email);
    await modal.locator('select[name="country"]').selectOption({label: ADDED.country});
    // main's form asks for a contributor role ("Author") when the context has more than one
    const author = modal.getByRole('checkbox', {name: 'Author', exact: true});
    if (await author.count()) await author.first().check();
    const field = modal.locator('.pkpFormField').filter({hasText: 'ORCID iD'}).first();
    await field.getByRole('button', {name: 'Request verification', exact: true}).click();
    const question = page.getByRole('dialog').filter({has: page.getByRole('button', {name: 'Yes', exact: true})}).last();
    await question.waitFor({timeout: T});
    const asked = flat(await question.innerText(), 300);
    await question.getByRole('button', {name: 'Yes', exact: true}).click();
    await sleep(500);
    const answered = page.waitForResponse((r) => /\/contributors(\?|$)/.test(r.url()) && r.request().method() === 'POST', {timeout: T}).catch(() => null);
    await modal.getByRole('button', {name: 'Save', exact: true}).last().click();
    const r = await answered;
    await sleep(1500);
    await idle(page);
    return {asked, save: r ? r.status() : null, rows: flat(await page.locator('.listPanel--contributor').innerText().catch(() => ''), 600)};
}

module.exports = {T, sleep, flat, dismissErrors, setOrcidMember, seedVerifiedOrcid, logoutInOtherTab, loginOnTab, CASES, NEWCOMER, ADDED, enableOrcid, grantPermissions, roleTakesProduction, newcomerJoins, assign, verifiedId, stored, openContributors, openContributor, fieldState, closeContributor, reopenContributor, pressAndConfirm, mailTo, addWithRequest, screen, shot};
