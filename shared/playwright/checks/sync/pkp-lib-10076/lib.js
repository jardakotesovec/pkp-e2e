// Helpers of walk.js here (an assigned assistant, the Funding coordinator, does not see the
// declined and cancelled reviewers in the workflow's "Reviewers" table). Requiring this file runs
// nothing. Every helper drives the screens a person uses: Administration's Settings wizard, the
// workflow's "Participants" and "Reviewers" panels, the reviewer's review page and the editorial
// dashboard. None throws on a state a fix brings: each records what it finds.
// The role and assign helpers are copied from assistant-add-reviewer-search-refused/lib.js so this
// folder stays self-contained.
const {idle} = require('../../../probe');

const T = 30_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (s, n = 600) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));
const rel = (u) => (u ? String(u).replace(/^https?:\/\/[^/]+/, '') : u);

/**
 * Per app, on PKP's default test dataset (docs/process/dataset.md): the submission in review with
 * two reviewers who have not responded, the one who accepts and is then cancelled, the one who
 * declines, the submission's author, the Hosted page's label.
 */
const CASES = {
    ojs: {
        id: 12, title: 'Sodium butyrate improves growth performance of weaned piglets during the first period after weaning',
        cancel: {username: 'jjanssen', name: 'Julie Janssen'}, decline: {username: 'phudson', name: 'Paul Hudson'},
        author: 'lchristopher', hosted: 'Hosted Journals',
    },
    omp: {
        id: 2, title: 'The West and Beyond: New Perspectives on an Imagined Region',
        cancel: {username: 'alzacharia', name: 'Al Zacharia'}, decline: {username: 'gfavio', name: 'Gonzalo Favio'},
        author: 'afinkel', hosted: 'Hosted Presses',
    },
};

const ASSISTANT = {username: 'mfritz', name: 'Maria Fritz', role: 'Funding coordinator'};

const wfUrl = (app, id) => app.url(`/index.php/${app.contextPath}/en/dashboard/editorial?workflowSubmissionId=${id}`);

// ---- the role and the assignment ----------------------------------------------------------------

/**
 * As the site administrator: Administration > Hosted Journals (Presses), the context's
 * "Settings wizard", tab "Users", search the username, "Edit User", tick the role, "OK".
 * Returns the role boxes the window offered and which were ticked before.
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
    const boxes = await win.form.locator('input[name="userGroupIds[]"]').evaluateAll((els) =>
        els.map((e) => ({label: ((e.closest('label') || {}).innerText || '').replace(/\s+/g, ' ').trim(), checked: e.checked}))
    );
    await win.roleBox(role).check();
    await win.pressOk();
    await win.expectClosed();
    await idle(page);
    return {given: role, before: boxes.filter((b) => b.checked).map((b) => b.label), offered: boxes.map((b) => b.label)};
}

/** Open the submission's workflow from the editorial dashboard's address; returns the Participants panel. */
async function openParticipants(page, app, id) {
    const {ParticipantsPanel} = require('../../../pages/StageParticipantsPages.js');
    const panel = new ParticipantsPanel(page, app.contextPath);
    await page.goto('about:blank');
    await page.goto(wfUrl(app, id));
    await panel.heading().waitFor({timeout: 60_000});
    await idle(page);
    return panel;
}

/** The submission's workflow, "Assign": the role, "Search", the person, "OK"; returns the save's answer. */
async function assignAs(page, app, id, {role, personName}) {
    const panel = await openParticipants(page, app, id);
    const win = await panel.openAssign();
    await idle(page);
    const roles = (await win.root.locator('select[name="filterUserGroupId"] option').allInnerTexts().catch(() => [])).map((x) => flat(x, 80));
    await win.chooseRole(role);
    await win.search();
    await win.choosePerson(personName);
    const answered = page.waitForResponse((r) => r.url().includes('save-participant'), {timeout: T});
    await win.root.getByRole('button', {name: 'OK', exact: true}).click();
    const response = await answered;
    await win.expectClosed();
    await idle(page);
    const participants = (await page.locator('[data-cy="workflow-secondary-items"] li').allInnerTexts().catch(() => []))
        .map((x) => flat(x.replace(/\S+ More Actions/g, ''), 120)).filter(Boolean);
    return {status: response.status(), rolesOffered: roles, participants};
}

// ---- the workflow's "Reviewers" table -----------------------------------------------------------

const table = (page) => page.getByRole('table', {name: 'Reviewers', exact: true});
const reviewerRow = (page, name) => table(page).getByRole('row').filter({hasText: name}).first();

/** Open the workflow on the submission's current stage and wait for the "Reviewers" table or the stage's page. */
async function openReviewStage(page, app, id) {
    await page.goto('about:blank');
    await page.goto(wfUrl(app, id));
    await idle(page);
    await table(page).waitFor({timeout: T}).catch(() => {});
    await table(page).locator('tbody').waitFor({timeout: T}).catch(() => {});
    await sleep(1500);
    await idle(page);
}

/**
 * What the open workflow shows of the review stage: the stage heading, the side menu's selected
 * entry, the "Reviewers" table's header and rows (each row's cells and buttons), and the table's
 * empty message when it has one.
 */
async function readReviewers(page) {
    const out = {url: rel(page.url())};
    out.selectedMenu = flat(await page.locator('[role="dialog"] [aria-current="page"], [role="dialog"] .is-active').first().innerText().catch(() => null), 120);
    out.stageHeading = flat(await page.locator('[role="dialog"] h2').first().innerText().catch(() => null), 160);
    out.tableShown = (await table(page).count()) > 0;
    if (!out.tableShown) {
        out.headings = (await page.locator('[role="dialog"]:visible').first().locator('h2, h3').allInnerTexts().catch(() => [])).map((x) => flat(x, 120));
        return out;
    }
    out.caption = flat(await table(page).locator('caption').innerText().catch(() => null), 200);
    out.header = flat(await table(page).locator('thead').innerText().catch(() => null), 200);
    out.rows = await table(page).locator('tbody tr').evaluateAll((trs) =>
        trs.map((tr) => ({
            text: tr.innerText.replace(/\s+/g, ' ').trim(),
            cells: [...tr.querySelectorAll('th,td')].map((c) => c.innerText.replace(/\s+/g, ' ').trim()),
            buttons: [...tr.querySelectorAll('button')].map((b) => (b.innerText || b.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim()).filter(Boolean),
        }))
    );
    // The panel around the table: heading, its buttons and any text the table's own body does not hold.
    out.panel = await table(page).evaluate((t) => {
        let box = t.parentElement;
        for (let i = 0; i < 6 && box && !box.querySelector('h2,h3,h4'); i++) box = box.parentElement;
        if (!box) return null;
        return {
            heading: [...box.querySelectorAll('h2,h3,h4')].map((h) => h.innerText.trim()).join(' | '),
            buttons: [...box.querySelectorAll('button')].filter((b) => !t.contains(b)).map((b) => (b.innerText || b.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim()).filter(Boolean),
            text: box.innerText.replace(/\s+/g, ' ').trim().slice(0, 800),
        };
    }).catch(() => null);
    return out;
}

/** A row's "More Actions" menu: its labels; leaves the menu open. */
async function rowMenu(page, name) {
    await reviewerRow(page, name).getByRole('button', {name: /More Actions/}).first().click();
    await page.getByRole('menuitem').first().waitFor({timeout: 10_000}).catch(() => {});
    return (await page.getByRole('menuitem').allInnerTexts()).map((x) => flat(x, 80));
}

/**
 * On the reviewer's row: "More Actions" > the cancel entry (`entry`); the window's title, its
 * button, then the button pressed; the notices and the row after.
 */
async function cancelReviewer(page, name, entry = 'Cancel Reviewer') {
    const out = {name};
    out.menu = await rowMenu(page, name);
    if (!out.menu.includes(entry)) {
        await page.keyboard.press('Escape').catch(() => {});
        out.absent = entry;
        return out;
    }
    out.entry = entry;
    await page.getByRole('menuitem', {name: entry, exact: true}).click();
    const win = page.getByRole('dialog').filter({has: page.locator('form#cancelReviewForm, form#unassignReviewerForm')}).last();
    await win.waitFor({timeout: T});
    await page.waitForFunction(() => {
        const ta = [...document.querySelectorAll('form#cancelReviewForm textarea, form#unassignReviewerForm textarea')].pop();
        const mce = window.tinyMCE || window.tinymce;
        return !ta || !!(mce && mce.get(ta.id) && mce.get(ta.id).initialized);
    }, null, {timeout: 20_000}).catch(() => {});
    await idle(page);
    out.window = {
        title: flat(await win.getAttribute('aria-label').catch(() => null), 120) || flat(await win.locator('h1,h2').first().innerText().catch(() => null), 120),
        form: await win.locator('form').first().getAttribute('id').catch(() => null),
        buttons: (await win.locator('form button, form a').allInnerTexts().catch(() => [])).map((x) => flat(x, 60)).filter(Boolean),
        text: flat(await win.locator('form').first().innerText().catch(() => null), 500),
    };
    const answered = page.waitForResponse((r) => /update-cancel-review|update-unassign-reviewer|updateCancelReview|updateUnassignReviewer/i.test(r.url()), {timeout: T}).catch(() => null);
    await win.locator('form').first().getByRole('button', {name: entry, exact: true}).click();
    const r = await answered;
    out.status = r ? r.status() : null;
    await win.waitFor({state: 'hidden', timeout: T}).catch(() => {});
    const notices = new Set();
    for (let i = 0; i < 12; i++) {
        for (const t of await page.locator('.app__notifications .pkpNotification').allInnerTexts().catch(() => [])) notices.add(flat(t, 200));
        if (notices.size) break;
        await sleep(250);
    }
    out.notices = [...notices];
    await sleep(1200);
    await idle(page);
    out.rowAfter = flat(await reviewerRow(page, name).innerText().catch(() => '(no row)'), 200);
    return out;
}

// ---- the reviewer's review page -----------------------------------------------------------------

/** The signed-in reviewer opens the review request of the submission. */
async function openRequest(page, app, id) {
    const {ReviewWizardPage} = require('../../../pages/ReviewerPages.js');
    await page.goto(app.url(`/index.php/${app.contextPath}/en/reviewer/submission/${id}`));
    const w = new ReviewWizardPage(page, app.contextPath);
    await page.getByRole('heading', {level: 1}).first().waitFor({timeout: T});
    await w.expectStep(1).catch(() => {});
    await idle(page);
    return w;
}

/** The reviewer accepts: "No competing interests" when asked, the privacy box when shown, "Accept Review, Continue to Step #2". */
async function accept(page, app, id) {
    const w = await openRequest(page, app, id);
    const out = {heading: flat(await page.getByRole('heading', {level: 1}).first().innerText(), 200)};
    out.competingInterestsAsked = (await w.noCompetingInterestsRadio.count()) > 0;
    if (out.competingInterestsAsked) {
        out.competingInterestsLabel = flat(await page.locator('label').filter({has: w.noCompetingInterestsRadio}).first().innerText().catch(() => null), 120);
        await w.noCompetingInterestsRadio.check();
    }
    out.privacyAsked = (await w.privacyBox.count()) > 0;
    out.button = flat(await w.acceptButton.first().innerText().catch(() => null), 80);
    await w.accept();
    await idle(page);
    out.landedStep = flat(await page.getByRole('tab', {selected: true}).first().innerText().catch(() => null), 80);
    return out;
}

/** The reviewer declines: "Decline Review Request", then the window's "Decline Review Request". */
async function decline(page, app, id) {
    const w = await openRequest(page, app, id);
    const out = {heading: flat(await page.getByRole('heading', {level: 1}).first().innerText(), 200)};
    out.link = flat(await w.declineLink.first().innerText().catch(() => null), 80);
    const dialog = await w.openDecline();
    out.window = {
        title: flat(await dialog.getAttribute('aria-label').catch(() => null), 120) || flat(await dialog.locator('h1,h2').first().innerText().catch(() => null), 120),
        text: flat(await dialog.innerText().catch(() => null), 400),
        buttons: (await dialog.getByRole('button').allInnerTexts().catch(() => [])).map((x) => flat(x, 60)).filter(Boolean),
    };
    await w.confirmDecline();
    await idle(page);
    out.landed = rel(page.url());
    out.landedHeading = flat(await page.getByRole('heading', {level: 1}).first().innerText().catch(() => null), 120);
    return out;
}

// ---- the editorial dashboard --------------------------------------------------------------------

/** The submission's row of the dashboard's list as shown: its cells, and every button with its name (the activity cell's reviewer indicators are buttons). */
async function readRow(page, id) {
    const rows = await page.locator('main table tbody tr').evaluateAll((trs, wanted) => {
        const cellsOf = (tr) => [...tr.querySelectorAll('th,td')];
        const tr = trs.find((r) => cellsOf(r).length && cellsOf(r)[0].innerText.trim() === wanted);
        if (!tr) return null;
        const cells = cellsOf(tr);
        const heads = [...tr.closest('table').querySelectorAll('thead th')].map((th) => th.innerText.trim());
        const at = heads.findIndex((h) => /activity/i.test(h));
        const activity = cells[at < 0 ? 4 : at];
        return {
            cells: cells.map((c) => c.innerText.replace(/\s+/g, ' ').trim()),
            buttons: [...tr.querySelectorAll('button')].map((b) => ({
                text: (b.innerText || '').replace(/\s+/g, ' ').trim(),
                label: b.getAttribute('aria-label'),
                title: b.getAttribute('title'),
            })),
            activityCell: activity
                ? {
                      text: activity.innerText.replace(/\s+/g, ' ').trim(),
                      header: heads[at],
                      visibleText: [...activity.querySelectorAll('*')].filter((e) => e.children.length === 0 && e.getClientRects().length && (e.textContent || '').trim()).map((e) => (e.textContent || '').replace(/\s+/g, ' ').trim()),
                      buttons: [...activity.querySelectorAll('button')].map((b) => ({
                          name: (b.getAttribute('aria-label') || b.innerText || '').replace(/\s+/g, ' ').trim(),
                          visible: b.getClientRects().length > 0,
                          ringDays: (b.querySelector('span[aria-hidden="true"]') || {}).textContent || null,
                          icon: !!b.querySelector('span.absolute svg'),
                      })),
                      svgs: activity.querySelectorAll('svg').length,
                  }
                : null,
        };
    }, String(id));
    return rows;
}

/**
 * The dashboard as the signed-in user lands on it: the sidebar's views, the view shown, the list's
 * header and the submission's row. When the landing view does not list it, the views in `prefer`
 * are opened in turn.
 */
async function findInViews(page, app, id, prefer = ['Assigned to me', 'My Assigned', 'Active submissions']) {
    await page.goto(app.url(`/index.php/${app.contextPath}/en/dashboard/editorial`));
    await idle(page);
    await page.locator('main table tbody tr').first().waitFor({timeout: T}).catch(() => {});
    await sleep(1500);
    await idle(page);
    const out = {landed: rel(page.url())};
    out.views = (await page.locator('nav a, nav button').filter({hasText: /\S/}).allInnerTexts().catch(() => [])).map((x) => flat(x, 60)).filter((x) => x && x.length < 60);
    out.viewHeading = flat(await page.locator('main h1, main h2').first().innerText().catch(() => null), 120);
    out.header = flat(await page.locator('main table thead').first().innerText().catch(() => null), 300);
    out.row = await readRow(page, id);
    for (const name of prefer) {
        if (out.row) break;
        const link = page.locator('nav').getByRole('link', {name: new RegExp(`^(\\d+\\s*)?${name}`)}).first();
        if (!(await link.count())) continue;
        await link.click();
        await idle(page);
        await sleep(1500);
        out.openedView = name;
        out.viewHeading = flat(await page.locator('main h1, main h2').first().innerText().catch(() => null), 120);
        out.row = await readRow(page, id);
    }
    return out;
}

module.exports = {
    T, sleep, flat, rel, CASES, ASSISTANT, wfUrl, giveRoleAsAdmin, openParticipants, assignAs, table, reviewerRow,
    openReviewStage, readReviewers, rowMenu, cancelReviewer, openRequest, accept, decline, readRow, findInViews,
};
