// Helpers of walk.js here (U27 A51: an assigned Funding coordinator's search, filters and further
// pages in the Add Reviewer window refused; docs/issues/U27-A51-assistant-add-reviewer-search-refused.md).
// Requiring this file runs nothing. Every helper drives the screens a person uses: the Register page,
// Administration's Settings wizard, the workflow's "Assign" window and the Add Reviewer window. None
// throws on a state a fix brings (no error dialog, a filtered list): each records what it finds.
// The register, role and assign helpers are copied from other reports' folders
// (press-site-register-consent-raw-codes, manager-level-role-save-ticks-every-stage,
// permissions-tick-carries-to-other-role) so this folder stays self-contained.
const {idle, signOut} = require('../../../probe');

const T = 30_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (s, n = 600) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));
const rel = (u) => (u ? String(u).replace(/^https?:\/\/[^/]+/, '') : u);

/**
 * Per app, on PKP's default test dataset (docs/process/dataset.md): the submission in review the
 * Funding coordinator is assigned to, the reviewer searched for and added (not yet on the round,
 * a reviewer of the round's stage), the Hosted page's label, and whether the assigned section
 * editor is a neighbour.
 */
const CASES = {
    ojs: {id: 7, title: 'Developing efficacy beliefs in the classroom', search: 'Julie', pick: 'Julie Janssen', hosted: 'Hosted Journals', sectionEditor: 'dbuskins'},
    omp: {id: 16, title: "A Designer's Log: Case Studies in Instructional Design", search: 'Catherine', pick: 'Catherine Turner', hosted: 'Hosted Presses', sectionEditor: null},
};

// ---- Register page ----------------------------------------------------------------------------

/** The context's Register page typed into the address bar. */
async function openRegister(page, app) {
    const loc = app.line && /3_[34]/.test(app.line) ? '' : '/en';
    const res = await page.goto(app.url(`/index.php/${app.contextPath}${loc}/user/register`));
    await idle(page).catch(() => {});
    return {status: res && res.status()};
}

/**
 * Register one account with the reviewer box ticked: "Profile" and "Login" filled, the privacy
 * box ticked when shown, "Register" pressed; then the new account signs out.
 */
async function registerReviewer(page, app, who) {
    await signOut(page).catch(() => {});
    await openRegister(page, app);
    const form = page.locator('form#register');
    await form.locator('input[name="givenName"]').fill(who.givenName);
    await form.locator('input[name="familyName"]').fill(who.familyName);
    await form.locator('input[name="affiliation"]').fill(who.affiliation);
    await form.locator('select[name="country"]').selectOption({label: 'Canada'});
    await form.locator('input[name="email"]').fill(who.email);
    await form.locator('input[name="username"]').fill(who.username);
    await form.locator('input[name="password"]').fill(who.password);
    await form.locator('input[name="password2"]').fill(who.password);
    const privacy = form.locator('input[name="privacyConsent"]');
    if (await privacy.count()) await privacy.first().check({force: true});
    const optin = page.locator('#reviewerOptinGroup input[type="checkbox"]');
    const reviewerBox = (await optin.count()) ? flat(await page.locator('#reviewerOptinGroup label').first().innerText().catch(() => null), 200) : null;
    if (reviewerBox) await optin.first().check({force: true});
    await Promise.all([page.waitForLoadState('domcontentloaded'), form.locator('button.submit').click()]);
    await page.waitForLoadState('load').catch(() => {});
    await idle(page).catch(() => {});
    const errors = (await page.locator('#formErrors li').allInnerTexts().catch(() => [])).map((e) => flat(e, 200));
    const out = {username: who.username, reviewerBox, landed: rel(page.url()), h1: flat(await page.locator('h1').first().innerText().catch(() => null), 80), errors};
    await signOut(page).catch(() => {});
    return out;
}

// ---- Settings wizard and Assign ---------------------------------------------------------------

/**
 * As the site administrator: Administration › Hosted Journals (Presses), the context's
 * "Settings wizard", tab "Users", search the username, "Edit User", tick the role, "OK".
 */
async function giveRoleAsAdmin(page, app, {username, role}) {
    const {HostedContextsPage, UserDetailsWindow} = require('../../../pages/UsersManagementPages.js');
    const hosted = new HostedContextsPage(page, {hostedLabel: CASES[app.name].hosted});
    await hosted.gotoFromAdministration();
    await hosted.openSettingsWizard(app.contextPath);
    const grid = await hosted.openWizardTab('Users');
    await grid.search({text: username});
    await grid.chooseAction(username, 'Edit User');
    const win = new UserDetailsWindow(page, 'Edit User');
    await win.expectOpen();
    await win.roleBox(role).check();
    await win.pressOk();
    await win.expectClosed();
    await idle(page);
    return {given: role};
}

/** Open the submission's workflow from the editorial dashboard's address; returns the Participants panel. */
async function openParticipants(page, app, id) {
    const {ParticipantsPanel} = require('../../../pages/StageParticipantsPages.js');
    const panel = new ParticipantsPanel(page, app.contextPath);
    await page.goto('about:blank');
    await page.goto(app.url(`/index.php/${app.contextPath}/en/dashboard/editorial?workflowSubmissionId=${id}`));
    await panel.heading().waitFor({timeout: 60_000});
    await idle(page);
    return panel;
}

/** The submission's workflow, "Assign": the role, "Search", the person, "OK"; returns the save's answer. */
async function assignAs(page, app, id, {role, personName}) {
    const panel = await openParticipants(page, app, id);
    const win = await panel.openAssign();
    await idle(page);
    await win.chooseRole(role);
    await win.search();
    await win.choosePerson(personName);
    const answered = page.waitForResponse((r) => r.url().includes('save-participant'), {timeout: T});
    await win.root.getByRole('button', {name: 'OK', exact: true}).click();
    const response = await answered;
    await win.expectClosed();
    await idle(page);
    return {status: response.status()};
}

// ---- the Add Reviewer window ------------------------------------------------------------------

const modalOf = (page) => page.getByRole('dialog').filter({has: page.locator('.listPanel--selectReviewer')}).last();
const errorDlg = (page) => page.locator('[data-cy="dialog"]').filter({hasText: 'does not have access'});

/** Record every `users/reviewers` request the page sends: status and query (without the cache buster). */
function watchListing(page) {
    const seen = [];
    page.on('response', (r) => {
        const u = r.url();
        if (!/\/api\/v1\/users\/reviewers/.test(u)) return;
        const q = {};
        for (const [k, v] of new URL(u).searchParams) if (k !== '_') q[k] = v;
        seen.push({at: Date.now(), status: r.status(), query: q});
    });
    return (t0) => seen.filter((x) => x.at >= t0).map(({at, ...x}) => x);
}

/** The visible confirmation dialogs' texts. */
function openDialogs(page) {
    return page.evaluate(() => [...document.querySelectorAll('[data-cy="dialog"]')].filter((d) => d.getClientRects().length).map((d) => d.innerText.replace(/\s+/g, ' ').trim().slice(0, 300)));
}

/** The window's list as data: entries, their "Select" buttons, the empty line, the search box, the page bar, the filters. */
async function listRead(page) {
    return modalOf(page).evaluate((m) => {
        const panels = [...m.querySelectorAll('.listPanel--selectReviewer')];
        const p = panels[panels.length - 1];
        if (!p) return null;
        const vis = (x) => x && x.getClientRects().length;
        const t = (x) => (x.innerText || '').replace(/\s+/g, ' ').trim();
        const nav = p.querySelector('nav');
        const input = p.querySelector('input.pkpSearch__input');
        const items = [...p.querySelectorAll('.listPanel__item')].filter(vis);
        return {
            count: items.length,
            names: [...p.querySelectorAll('button')].filter(vis).map(t).filter((x) => /^Select /.test(x)).map((x) => x.replace(/^Select /, '')),
            empty: vis(p.querySelector('.listPanel__empty')) ? t(p.querySelector('.listPanel__empty')) : null,
            search: input ? input.value : null,
            nav: nav ? [...nav.querySelectorAll('button')].map((b) => ({t: t(b), current: b.getAttribute('aria-current'), disabled: b.disabled})) : null,
            filterButtons: [...p.querySelectorAll('button.pkpFilter__add, button.pkpFilter__remove')].filter(vis).map(t),
        };
    }).catch((e) => ({error: flat(e.message, 200)}));
}

/** One action on the open window: act, wait out its requests, read the dialogs, the list and the listing requests sent. */
async function act(page, since, fn) {
    const t0 = Date.now();
    if (fn) await fn();
    await idle(page);
    await sleep(1200);
    const dialogs = await openDialogs(page);
    return {listing: since(t0), dialogs, error: dialogs.find((d) => /does not have access/.test(d)) || null, list: await listRead(page)};
}

/** "OK" on the error dialog when one is open; returns the window's list after it. */
async function okError(page) {
    const d = errorDlg(page);
    if (!(await d.count())) return {dialog: false};
    await d.getByRole('button', {name: 'OK', exact: true}).first().click();
    await d.first().waitFor({state: 'hidden', timeout: 10_000}).catch(() => {});
    await sleep(500);
    return {dialog: true, list: await listRead(page)};
}

/** Open the submission's workflow (its current round), press "Add Reviewer" and wait for the window's list. */
async function openAddReviewer(page, app, id, since) {
    await page.goto('about:blank');
    await page.goto(app.url(`/index.php/${app.contextPath}/en/dashboard/editorial?workflowSubmissionId=${id}`));
    await idle(page);
    const add = page.getByRole('button', {name: 'Add Reviewer', exact: true}).first();
    const offered = await add.waitFor({timeout: T}).then(() => true).catch(() => false);
    const heading = flat(await page.getByRole('heading', {name: /^Workflow:/}).first().innerText().catch(() => null), 120);
    if (!offered) return {offered, heading};
    const r = await act(page, since, async () => {
        await add.click();
        await modalOf(page).locator('input.pkpSearch__input').waitFor({timeout: T});
    });
    return {offered, heading, ...r};
}

/** Type a phrase in "Search" and press Enter. */
async function search(page, since, phrase) {
    const box = modalOf(page).locator('input.pkpSearch__input');
    await box.fill(phrase);
    return act(page, since, () => box.press('Enter'));
}

/** "Clear search phrase", when shown. */
async function clearSearch(page, since) {
    const b = modalOf(page).getByRole('button', {name: 'Clear search phrase', exact: true}).first();
    if (!(await b.isVisible().catch(() => false))) return {shown: false};
    return {shown: true, ...(await act(page, since, () => b.click()))};
}

/** "Filters" opened, then the first filter's "Add filter: …" button ("Rated at least"). */
async function addFilter(page, since) {
    const m = modalOf(page);
    const filters = m.getByRole('button', {name: 'Filters', exact: true}).first();
    if (!(await filters.isVisible().catch(() => false))) return {shown: false};
    await filters.click();
    await sleep(500);
    const add = m.locator('button.pkpFilter__add').first();
    const label = flat(await add.innerText().catch(() => null), 80);
    return {shown: true, label, ...(await act(page, since, () => add.click()))};
}

/** The page bar's "Next", when shown. */
async function next(page, since) {
    const b = modalOf(page).getByRole('navigation').getByRole('button', {name: /Next/}).first();
    if (!(await b.isVisible().catch(() => false))) return {shown: false, list: await listRead(page)};
    return {shown: true, ...(await act(page, since, () => b.click()))};
}

/** "Select {name}" in the list as it stands, then "Add Reviewer": the notice and the window's state. */
async function selectAndAdd(page, name) {
    const m = modalOf(page);
    const pick = m.getByRole('button', {name: `Select ${name}`, exact: true}).first();
    if (!(await pick.isVisible().catch(() => false))) return {pickShown: false};
    await pick.click();
    const submit = m.getByRole('button', {name: 'Add Reviewer', exact: true});
    await submit.waitFor({timeout: T});
    await m.frameLocator('iframe[id^="personalMessage"]').locator('body').filter({hasText: /\S/}).waitFor({timeout: T}).catch(() => {});
    await idle(page);
    await sleep(800);
    const answered = page.waitForResponse((r) => /update-reviewer/.test(r.url()), {timeout: T}).then((r) => r.status()).catch(() => null);
    await submit.click();
    const status = await answered;
    await m.waitFor({state: 'hidden', timeout: T}).catch(() => {});
    await idle(page);
    const notices = (await page.locator('.app__notifications .pkpNotification').allInnerTexts().catch(() => [])).map((x) => flat(x, 200));
    return {pickShown: true, status, notices, windowOpen: await m.isVisible().catch(() => false)};
}

/** The "Reviewers" table's rows of the open workflow. */
async function reviewerRows(page) {
    const rows = await page.getByRole('table', {name: 'Reviewers', exact: true}).getByRole('row').allInnerTexts().catch(() => []);
    return rows.map((r) => flat(r, 140));
}

/** The window's own "Close". */
async function closeWindow(page) {
    const m = modalOf(page);
    if (!(await m.isVisible().catch(() => false))) return false;
    await m.getByRole('button', {name: 'Close', exact: true}).first().click();
    await m.waitFor({state: 'hidden', timeout: 10_000}).catch(() => {});
    await sleep(600);
    return true;
}

module.exports = {T, sleep, flat, CASES, registerReviewer, giveRoleAsAdmin, assignAs, watchListing, listRead, act, okError, openAddReviewer, search, clearSearch, addFilter, next, selectAndAdd, reviewerRows, closeWindow, modalOf};
