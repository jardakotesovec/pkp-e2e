// Helpers of walk.js (issue report docs/issues/U57-A8-french-default-texts-stored-as-codes.md):
// a press or server created on screen with English and French, "Reload defaults" on a
// "Website Languages" row, the French "Author Guidelines" box typed and saved, a backend
// tab's text and a page's main text; for walk-invite.js, a context created with French primary
// and a role invitation sent from Users & Roles (the email read from the install's mail catcher).
// Requiring this file runs nothing.
const {idle} = require('../../../probe');

const T = 30_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (s, n = 1500) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));

const WORDS = {
    ojs: {noun: 'Journal', hosted: 'Hosted Journals', table: 'Journals', create: 'Create Journal'},
    omp: {noun: 'Press', hosted: 'Hosted Presses', table: 'Presses', create: 'Create Press'},
    ops: {noun: 'Server', hosted: 'Hosted Servers', table: 'Servers', create: 'Create Server'},
};

/** Administration › Hosted … › "Create …" with the given languages ticked, the first primary. Returns the save's status. */
async function createContext(page, app, {name, initials, path: urlPath, email, locales = ['en']}) {
    const {HostedJournalsPage} = require('../../../pages/HostedJournalsPages.js');
    const hosted = new HostedJournalsPage(page, WORDS[app.name]);
    await page.goto(app.url('/index.php/index/en/admin/contexts'));
    await hosted.expectOpen();
    const win = await hosted.openCreate();
    await win.type(win.title('en'), name);
    await win.type(win.initials('en'), initials);
    await win.type(win.contactName, name);
    await win.type(win.contactEmail, email);
    await win.country.selectOption({label: 'Canada'});
    await win.type(win.path, urlPath);
    for (const code of locales) {
        if (await win.languageBox(code).count()) await win.setBox(win.languageBox(code), true);
    }
    if (await win.primaryChoice(locales[0]).count()) await win.setBox(win.primaryChoice(locales[0]), true);
    const r = await win.pressSave();
    await page.waitForURL(/\/admin\/wizard\/\d+/, {timeout: T}).catch(() => {});
    return r.status();
}

/** Settings › Website › "Setup" › "Languages", the row's arrow › "Reload defaults" › confirm. Returns what the screen said. */
async function reloadDefaults(page, app, contextPath, code) {
    await page.goto(app.url(`/index.php/${contextPath}/en/management/settings/website`));
    await idle(page).catch(() => {});
    const setup = page.locator('#setup-button').first();
    if ((await setup.getAttribute('aria-selected').catch(() => null)) !== 'true') await setup.click().catch(() => {});
    await page.locator('#languages-button').filter({visible: true}).first().click();
    await page.locator('#languageGridContainer .pkp_controllers_grid').first().waitFor({timeout: T});
    const row = page.locator(`#languageGridContainer tr.gridRow[id$="-row-${code}"]`).first();
    const rowText = flat(await row.innerText().catch(() => ''), 200);
    await row.locator('a.show_extras').first().click();
    await sleep(400);
    await page.locator(`#languageGridContainer tr[id$="-row-${code}-control-row"] a`).filter({hasText: 'Reload defaults'}).first().click();
    const d = page.locator('[role=dialog]:visible, [data-cy="dialog"]:visible').last();
    await d.waitFor({timeout: 10000});
    const question = flat(await d.innerText().catch(() => ''), 400);
    const resp = page.waitForResponse((r) => /reload-locale|reloadLocale/.test(r.url()), {timeout: T}).catch(() => null);
    await d.getByRole('button', {name: /^(Reload defaults|OK|Yes)$/}).first().click();
    const r = await resp;
    await sleep(1500);
    await idle(page).catch(() => {});
    const notice = flat(await page.locator('.pkpNotify__message, .pkp_notification, [role="alert"]').allInnerTexts().catch(() => []).then((a) => a.join(' | ')), 300);
    return {rowText, question, status: r && r.status(), notice};
}

/** Settings › Workflow › "Submission" › "Author Guidance": the French "Author Guidelines" box replaced by `text`, saved. Returns the save's status. */
async function typeFrenchGuidelines(page, app, contextPath, text) {
    const {WorkflowSubmissionSettings} = require('../../../pages/SubmissionIntakePages.js');
    const wf = new WorkflowSubmissionSettings(page, contextPath, {locale: 'en'});
    await wf.goto('Author Guidance');
    await wf.guidance.form.locator('.pkpFormLocales button').filter({hasText: /French/}).first().click();
    await sleep(500);
    const id = 'submissionGuidanceSettings-authorGuidelines-control-fr_CA';
    await wf.guidance.typeRich(id, text);
    const r = await wf.guidance.pressSave();
    await sleep(1000);
    return {status: r.status(), saved: flat(await wf.guidance.richContent(id), 300)};
}

/** A backend page's tab (Users & Roles › "Users" or "Roles"): its text once its grid shows. */
async function readTab(page, app, path, tabId) {
    await page.goto(app.url(path));
    await idle(page).catch(() => {});
    const tab = page.locator(`#${tabId}-button`).first();
    if (await tab.count()) await tab.click();
    await page.locator(`#${tabId} table tbody tr`).first().waitFor({timeout: T}).catch(() => {});
    await idle(page).catch(() => {});
    return flat(await page.locator(`#${tabId}`).first().innerText().catch(() => ''), 3000);
}

/** A public page's heading and main text. */
async function readPage(page, app, path) {
    const resp = await page.goto(app.url(path));
    await idle(page).catch(() => {});
    const main = page.locator('main, .pkp_structure_main').first();
    return {path, status: resp && resp.status(), title: await page.title(), text: flat(await main.innerText().catch(() => ''), 2500)};
}

/** Every `##key##` in a text. */
const codes = (text) => [...new Set(String(text || '').match(/##[\w.]+##/g) || [])];

const ROLE = {ojs: 'Section editor', omp: 'Series editor', ops: 'Moderator'};

/**
 * Administration › Hosted … › "Create …": the name and acronym in English and (after "French"
 * above the form) in French, English and French ticked, French primary. Returns the save's
 * status and the new context's languages as the answer gives them.
 */
async function createFrenchPrimaryContext(page, app, {name, frName, initials, path: urlPath, email}) {
    await page.goto(app.url('/index.php/index/en/admin/contexts'));
    await idle(page).catch(() => {});
    await page.locator('#contextGridContainer tr.gridRow').first().waitFor({timeout: T});
    await page.locator('#contextGridContainer .header a[id*="createContext"]').first().click();
    await page.locator('[id^="context-name-control"]').first().waitFor({state: 'visible', timeout: T});
    await idle(page).catch(() => {});
    await sleep(800);
    const cf = page.locator('form').filter({has: page.locator('[id^="context-name-control"]')}).last();
    const setText = async (id, v) => {
        const i = cf.locator(`[id="${id}"]`).first();
        await i.fill(v);
        await i.blur().catch(() => {});
    };
    await setText('context-name-control-en', name);
    if (await cf.locator('[id="context-name-control-fr_CA"]').first().isHidden().catch(() => true)) {
        await cf.locator('.pkpFormLocales button').filter({hasText: /^\s*French/}).first().click().catch(() => {});
    }
    await sleep(400);
    await setText('context-name-control-fr_CA', frName);
    await setText('context-acronym-control-en', initials);
    await setText('context-acronym-control-fr_CA', initials);
    await setText('context-contactName-control', initials);
    await setText('context-contactEmail-control', email);
    await cf.locator('select[name="country"]').first().selectOption({label: 'Canada'}).catch(() => {});
    await setText('context-urlPath-control', urlPath);
    for (const code of ['en', 'fr_CA']) {
        const b = cf.locator(`input[name="supportedLocales"][value="${code}"]`).first();
        if ((await b.count()) && !(await b.isChecked())) await b.click();
    }
    const prim = cf.locator('input[name="primaryLocale"][value="fr_CA"]').first();
    if (await prim.count()) await prim.click();
    await sleep(300);
    const answered = page.waitForResponse((r) => /\/api\/v1\/contexts(\?|$)/.test(r.url()) && r.request().method() === 'POST', {timeout: 60_000});
    await cf.getByRole('button', {name: 'Save', exact: true}).click();
    const resp = await answered;
    const body = await resp.json().catch(() => null);
    await idle(page).catch(() => {});
    await sleep(1500);
    return {status: resp.status(), primaryLocale: body && body.primaryLocale, supportedLocales: body && body.supportedLocales, errors: body && !body.id ? body : undefined};
}

/**
 * Settings › Users & Roles › "Invite to a role" on `ctx` (screens in English): a new address,
 * Given Name "Ivo", Family Name "Invitee", the app's section-level role from today, "Appear on
 * the masthead", "Save And Continue", "Invite user to the role". Returns the compose step's text
 * and whether "Invitation Sent" showed. Each step records rather than throws past the search.
 */
async function inviteToRole(page, app, ctx, email, snap, role = ROLE[app.name]) {
    const out = {role};
    await page.goto(app.url(`/index.php/${ctx}/en/management/settings/access`));
    await idle(page).catch(() => {});
    await page.getByRole('button', {name: 'Invite to a role'}).click();
    await page.waitForURL(/invitation\/create/, {timeout: T}).catch(() => {});
    await idle(page).catch(() => {});
    await page.getByLabel(/Search for a user by email address/).fill(email);
    await page.getByRole('button', {name: 'Search User', exact: true}).click();
    await page.getByRole('heading', {name: /Enter details/}).waitFor({timeout: T});
    await idle(page).catch(() => {});
    await sleep(600);
    await page.getByLabel(/^Given Name/).first().fill('Ivo');
    await page.getByLabel(/^Family Name/).first().fill('Invitee');
    const row = page.getByRole('row').filter({has: page.getByLabel(/^Select a new role/)}).last();
    const roleSelect = row.getByLabel(/^Select a new role/);
    out.roleOptions = await roleSelect.locator('option').allInnerTexts().then((a) => a.map((x) => flat(x, 120)));
    await roleSelect.selectOption({label: role});
    await row.getByRole('textbox').fill(new Date().toISOString().slice(0, 10));
    await row.getByRole('combobox').last().selectOption({label: 'Appear on the masthead'});
    if (snap) await snap('s20-details');
    await page.getByRole('button', {name: 'Save And Continue'}).click();
    await page.getByLabel(/^Subject/).waitFor({timeout: T});
    await sleep(1500);
    out.subject = await page.getByLabel(/^Subject/).inputValue().catch(() => null);
    out.composeBody = flat(await page.frameLocator('iframe').first().locator('body').innerText().catch(() => ''), 3000);
    if (snap) await snap('s21-compose');
    out.sentAt = new Date(Date.now() - 2000);
    await page.getByRole('button', {name: 'Invite user to the role'}).click();
    out.sent = await page.getByRole('dialog').filter({hasText: 'Invitation Sent'}).waitFor({timeout: T}).then(() => true, () => false);
    if (snap) await snap('s21-sent');
    return out;
}

/** The email to `email` sent after `since`: subject, its text, the lines naming a role, and every `##key##` in text and HTML. */
async function readInviteMail(app, email, since) {
    try {
        const m = await app.mail.find({to: email, since, timeoutMs: 60_000});
        const full = await app.mail.fullMessage(m.ID);
        const text = String(full.Text || '');
        return {
            subject: full.Subject,
            text: text.slice(0, 4000),
            roleLines: text.split('\n').filter((l) => /##|Moderator|editor|Rédact|masthead|rôle|role/i.test(l)).map((l) => flat(l, 300)),
            codesText: codes(text),
            codesHtml: codes(full.HTML),
            acceptUrl: (String(full.Text || '').match(/https?:\/\/\S+\/invitation\/accept\?[^\s)]+/) || [])[0] || null,
        };
    } catch (e) {
        return {error: flat(e.message, 300)};
    }
}

module.exports = {T, sleep, flat, WORDS, ROLE, createContext, reloadDefaults, typeFrenchGuidelines, readTab, readPage, codes, createFrenchPrimaryContext, inviteToRole, readInviteMail};
