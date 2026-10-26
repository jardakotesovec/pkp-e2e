// Helpers of walk.js (issue report docs/issues/U08-A2-section-editor-dashboard-opens-profile.md).
// Requiring this file runs nothing. Every helper presses what a person presses.
const {idle, screen, record} = require('../../../probe');

/** The Guest editor the steps invite on OJS (names tagged u08h20d; the password is the username twice). */
const GUEST = {email: 'u08h20d@example.com', givenName: 'Gwen', familyName: 'Guest-u08h20d', username: 'u08h20d',
    password: 'u08h20du08h20d', country: 'Canada', role: 'Guest editor'};

const T = 30_000;
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const rel = (u) => String(u || '').replace(/^https?:\/\/[^/]+/, '');
const flat = (s) => String(s || '').replace(/\s+/g, ' ').trim();
const is35 = (app) => app.line === 'stable-3_5_0';
const today = () => new Intl.DateTimeFormat('en-CA', {year: 'numeric', month: '2-digit', day: '2-digit'}).format(new Date());

/** The editorial header's bell as it reads after signing in ("Tasks 2"), and the page it is on. */
async function readBell(page) {
    await idle(page);
    const bell = page.getByRole('button', {name: /^Tasks/}).first();
    await bell.waitFor({timeout: T}).catch(() => {});
    return {address: rel(page.url()), bell: (await bell.count()) ? flat(await bell.innerText()) : null};
}

/** Open a public page by its address (the journal's home page, or a site page) and wait for the header. */
async function openPublic(page, app, path) {
    const r = await page.goto(app.url(path));
    const header = await page.locator('header.pkp_structure_head').waitFor({timeout: T}).then(() => true, () => false);
    await idle(page);
    return {asked: path, status: r ? r.status() : null, address: rel(page.url()), header,
        title: await page.title()};
}

/**
 * The header's user menu: the name as shown (with its count, when it has one), then pressed open,
 * the entries under it with their addresses.
 */
async function readUserMenu(page) {
    const wrapper = page.locator('#navigationUserWrapper');
    const toggle = wrapper.locator('#navigationUser > li > a').first();
    await toggle.waitFor({timeout: T});
    const name = flat(await toggle.innerText());
    const nameCount = (await toggle.locator('span.task_count').count())
        ? flat(await toggle.locator('span.task_count').innerText()) : null;
    await toggle.click();
    const list = wrapper.locator('#navigationUser > li > ul').first();
    const opened = await list.waitFor({state: 'visible', timeout: 8000}).then(() => true, () => false);
    const links = list.getByRole('link');
    const entries = [];
    for (let i = 0; i < (await links.count()); i++) {
        const a = links.nth(i);
        entries.push({text: flat(await a.innerText()), href: rel(await a.getAttribute('href'))});
    }
    return {name, nameCount, opened, entries};
}

/**
 * The same page in a window narrower than 992 px (a phone or a narrow browser): reload, press "Open Menu",
 * read the user menu as displayed (innerText skips what the theme hides), then the window back to its width.
 */
async function readUserMenuNarrow(page, width = 800) {
    const size = page.viewportSize();
    await page.setViewportSize({width, height: size.height});
    try {
        await page.reload();
        await page.locator('header.pkp_structure_head').waitFor({timeout: T});
        await idle(page);
        const toggle = page.locator('button.pkp_site_nav_toggle');
        const toggled = await toggle.isVisible().catch(() => false);
        if (toggled) await toggle.click();
        await pause(400);
        const top = page.locator('#navigationUser > li > a').first();
        const entries = (await page.locator('#navigationUser > li > ul a').allInnerTexts()).map(flat);
        return {width, openMenuButton: toggled, name: flat(await top.innerText()), entries};
    } finally {
        await page.setViewportSize(size);
        await page.reload();
        await page.locator('header.pkp_structure_head').waitFor({timeout: T});
        await idle(page);
    }
}

/** Press "Dashboard" in the open user menu; where it lands. */
async function pressDashboard(page) {
    const entry = page.locator('#navigationUser > li > ul').getByRole('link', {name: /^Dashboard(\s+\d+)?$/}).first();
    const before = page.url();
    await entry.click();
    await page.waitForURL((u) => String(u) !== before, {timeout: T}).catch(() => {});
    await idle(page);
    await pause(300);
    return {
        address: rel(page.url()),
        title: await page.title(),
        heading: await page.locator('h1').first().innerText().then(flat, () => null),
    };
}

/**
 * Settings › Website › "Setup" › "Languages" (U57's page object): press French's box in the "Forms"
 * column once, as the journal's manager; the box before, the list's answer, the box after a fresh load.
 * The page object is required here, inside the walk, because it reads the app's environment.
 */
async function untickFrenchForms(page, ctx) {
    const {JournalLanguagesTab} = require('../../../pages/LanguagesPages.js');
    const tab = new JournalLanguagesTab(page, ctx, {locale: 'en'});
    await tab.goto();
    const box = () => tab.website.cell('fr_CA', 'formLocale');
    const before = await box().isChecked();
    const {response, alerts} = await tab.pressWebsite('fr_CA', 'formLocale');
    await tab.goto();
    const after = await box().isChecked();
    return {before, status: response ? response.status() : null, url: rel(response && response.url()), alerts, after};
}

// ---------------------------------------------------------------------------------------------
// The invitation (Settings › Users & Roles › "Invite to a role") and the accept wizard it mails.

/**
 * "Invite to a role": search `email`, the names on "Enter details", one role row (role, today,
 * "Appear on the masthead"), "Save And Continue", "Invite user to the role". Returns the sent dialog's text.
 */
async function invite(page, app, {email, givenName, familyName, role}) {
    await page.goto(app.url(`/index.php/${app.contextPath}/en/management/settings/access`));
    await page.getByRole('heading', {name: 'Users & Roles'}).first().waitFor({timeout: T});
    await idle(page);
    await page.getByRole('button', {name: 'Invite to a role'}).click();
    await page.getByLabel(/Search for a user by email address/).fill(email);
    await page.getByRole('button', {name: 'Search User', exact: true}).click();
    const newRow = page.getByRole('row').filter({has: page.getByLabel(/^Select a new role/)}).last();
    await newRow.waitFor({timeout: T});
    await idle(page);
    await page.getByLabel(/^Given Name/).first().fill(givenName);
    await page.getByLabel(/^Family Name/).first().fill(familyName);
    await newRow.getByLabel(/^Select a new role/).selectOption({label: role});
    await newRow.getByRole('textbox').fill(today());
    await newRow.getByRole('combobox').last().selectOption({label: 'Appear on the masthead'});
    await page.getByRole('button', {name: 'Save And Continue'}).click();
    await page.locator('input[name="subject"]').waitFor({timeout: T});
    await page.locator('.composer__loadingTemplateMask').waitFor({state: 'detached', timeout: T}).catch(() => {});
    await page.getByRole('button', {name: 'Invite user to the role'}).click();
    const sent = page.getByRole('dialog').filter({hasText: 'Invitation Sent'});
    await sent.waitFor({timeout: T});
    const sentText = flat(await sent.innerText());
    await sent.getByRole('button', {name: 'View All Users'}).click();
    await idle(page);
    return {email, sentText};
}

/** The accept link of the newest invitation email to `email` since `since` that points at this install. */
async function acceptLink(app, email, since) {
    const origin = new URL(app.baseURL).origin;
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
        const result = await app.mail._search({to: email, since});
        for (const m of result.messages || []) {
            const full = await app.mail.fullMessage(m.ID);
            const found = (full.HTML || '').match(/href=['"]([^'"]*\/invitation\/accept\?[^'"]+)['"]/i);
            const link = found ? found[1].replace(/&amp;/g, '&') : null;
            if (link && link.startsWith(origin)) return {subject: full.Subject, accept: link};
        }
        await pause(500);
    }
    return {subject: null, accept: null};
}

/** The accept wizard's step heading ("STEP 1 - …"), or null. */
async function stepHeading(page) {
    const h = page.getByRole('heading', {name: /^STEP \d/});
    return (await h.count()) ? (await h.first().innerText()).trim() : null;
}

/** Open the accept link; skip the ORCID step when shown. Returns the headings met. */
async function openAccept(page, link) {
    const met = [];
    await page.goto(link);
    await page.getByRole('heading', {name: /^STEP \d/}).first().waitFor({timeout: T});
    await idle(page);
    met.push(await stepHeading(page));
    const skip = page.getByRole('button', {name: 'Skip ORCID verification'});
    if (await skip.count()) {
        await skip.click();
        await idle(page);
        met.push(await stepHeading(page));
    }
    return met;
}

/** "Accept And Continue to …", then the closing dialog's "View All Submissions". Never throws on the outcome. */
async function acceptAndLeave(page) {
    const out = {};
    const answers = [];
    const onResponse = (r) => {
        if (/\/invitations\/\d+\/key\/[^/]+\/finalize/.test(r.url())) answers.push(r.status());
    };
    page.on('response', onResponse);
    await page.getByRole('button', {name: /^Accept And Continue to/}).click();
    const dialog = page.getByRole('dialog').filter({hasText: /assigned a new role/});
    await dialog.waitFor({timeout: T}).catch(() => {});
    out.dialog = (await dialog.count()) ? flat(await dialog.innerText()) : null;
    out.finalize = answers.slice();
    if (out.dialog) {
        await Promise.all([
            page.waitForURL((u) => !/\/invitation\/accept/.test(String(u)), {timeout: T}).catch(() => {}),
            dialog.getByRole('button', {name: 'View All Submissions'}).click(),
        ]);
        await page.waitForLoadState('load').catch(() => {});
        await idle(page);
    }
    page.off('response', onResponse);
    out.landed = rel(page.url());
    return out;
}

/**
 * As the signed-in manager: Settings › Users & Roles › "Invite to a role", the newcomer as Guest editor; then,
 * in a browser of their own, the email's accept link: username and password, the privacy box, the country,
 * "Accept And Continue to …". Returns what each step showed.
 */
async function guestEditorJoins(page, app, launch) {
    const since = new Date();
    const invited = await invite(page, app, {email: GUEST.email, givenName: GUEST.givenName, familyName: GUEST.familyName, role: GUEST.role});
    const link = await acceptLink(app, GUEST.email, since);
    if (!link.accept) throw new Error('no invitation email with an accept link');
    const other = await launch(app);
    try {
        const p = other.page;
        const met = await openAccept(p, link.accept);
        await p.getByLabel(/^Username/).fill(GUEST.username);
        await p.getByLabel(/^Password/).fill(GUEST.password);
        await p.getByRole('checkbox').first().check();
        await p.getByRole('button', {name: 'Save and continue'}).click();
        await p.getByRole('heading', {name: /Enter details/}).waitFor({timeout: T});
        await idle(p);
        await p.getByLabel(/^Country/).first().selectOption({label: GUEST.country});
        await p.getByRole('button', {name: 'Save and continue'}).click();
        await p.getByRole('heading', {name: /Review & create account/}).waitFor({timeout: T});
        await idle(p);
        const accepted = await acceptAndLeave(p);
        return {invited: invited.sentText, subject: link.subject, met, accepted: {dialog: accepted.dialog, finalize: accepted.finalize}};
    } finally {
        await other.close();
    }
}

/** Where the Guest editor gets a task on OJS: submission 2, its review round, and the discussion they are added to. */
const GUEST_TASK = {where: {id: 2, menuKey: 'workflow_3_2', panelTitle: 'Review Tasks & Discussions'},
    name: 'u08h20d question', message: 'u08h20d: a question for the Guest editor.'};

/**
 * "Review Tasks & Discussions" › "Add" on main's panel (3.5: the discussions grid's "Add discussion"): the name,
 * the participant ticked, the message, "Save". Returns the save's status.
 */
async function addDiscussion(page, app, {id, menuKey, panelTitle}, {name, participant, participantName, message, label}) {
    if (is35(app)) {
        await page.goto(app.url(`/index.php/${app.contextPath}/dashboard/editorial?workflowSubmissionId=${id}&workflowMenuKey=${menuKey}`));
        await idle(page);
        const grid = page.locator('[id^="component-grid-queries-queriesgrid"]').first();
        await grid.waitFor({timeout: T});
        await idle(page);
        await grid.getByText(/Add discussion/i).first().click();
        const form = page.locator('form#queryForm').last();
        await form.waitFor({timeout: T});
        await idle(page);
        await form.locator('label', {hasText: participantName}).locator('input[type="checkbox"]').first().check();
        await form.locator('input[name="subject"]').fill(name);
        const tid = await form.locator('textarea[name="comment"]').getAttribute('id');
        await page.waitForFunction((i) => !!(window.tinymce && window.tinymce.get(i) && window.tinymce.get(i).initialized), tid, {timeout: T});
        await page.frameLocator(`#${tid}_ifr`).locator('body').click();
        await page.keyboard.type(message);
        record(`${label}-add-filled`, await screen(page));
        const resp = page.waitForResponse((r) => /update-?query/i.test(r.url()), {timeout: T}).catch(() => null);
        await form.getByRole('button', {name: /^(Save|OK)$/}).last().click();
        const r = await resp;
        await pause(1500);
        await idle(page);
        return {status: r ? r.status() : null};
    }
    const {TasksDiscussionsPanel} = require('../../../pages/TasksDiscussionsPages.js');
    const panel = new TasksDiscussionsPanel(page, app.contextPath, {title: panelTitle});
    await panel.gotoEditorial(id, menuKey);
    await idle(page);
    const win = await panel.openAdd();
    await win.nameField().fill(name);
    await win.tick(participant);
    await win.typeMessage(message);
    record(`${label}-add-filled`, await screen(page));
    const answer = await win.saveAndAnswer();
    await win.root.waitFor({state: 'hidden', timeout: T}).catch(() => {});
    await idle(page);
    return {status: answer.status()};
}

/**
 * As the signed-in manager, on submission 2's review round: Participants › "Assign", role "Guest editor",
 * the Guest editor, "OK"; then "Review Tasks & Discussions" › "Add": a name, the Guest editor ticked, a
 * message, "Save". Returns the Participants rows after the assignment and the save's status.
 */
async function guestEditorGetsTask(page, app) {
    const S = require('../../../pages/StageParticipantsPages.js');
    const panel = new S.ParticipantsPanel(page, app.contextPath);
    await panel.goto(GUEST_TASK.where.id, {menuKey: GUEST_TASK.where.menuKey});
    const win = await panel.openAssign();
    await win.chooseRole(GUEST.role);
    await win.search(GUEST.familyName);
    await win.choosePerson(`${GUEST.givenName} ${GUEST.familyName}`);
    await win.ok();
    await idle(page);
    const rows = await panel.rowLines().catch((e) => String(e).slice(0, 200));
    const discussion = await addDiscussion(page, app, GUEST_TASK.where, {name: GUEST_TASK.name, participant: GUEST.username,
        participantName: `${GUEST.givenName} ${GUEST.familyName}`, message: GUEST_TASK.message, label: '7b-guest-task'});
    return {rows, discussion};
}

module.exports = {GUEST, GUEST_TASK, guestEditorJoins, guestEditorGetsTask, readBell, openPublic, readUserMenu, readUserMenuNarrow, pressDashboard, untickFrenchForms};
