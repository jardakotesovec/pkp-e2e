// U14 claim check, chunk K3: the Comments page (Content › Comments), its tabs,
// table, row menu, comment panel, approve / hide / delete, the "Reports" table
// and the report panel, on the three apps that mount the page.
// Spec: docs/specs/U14-reader-comments-and-moderation.md — Actors row 55,
// Fields 73–82, Rules 10 (tabs, table, paging) to 15 (201–251); footnotes i, j,
// k, l (the "neither clears the task" clause), m (no register entry).
//
// Seeds its own scratch context per app (public comments on; a manager, an
// editor (OJS/OMP), a section editor, an author, three readers, two readers
// with an ORCID iD), two published submissions (S2 first with 26 pending
// comments for the paging, then S1 with ten comments in every state, two of
// them reported) and a second scratch context B with one reported comment as
// the other-journal control. Phases:
//   seed     the contexts and the submissions
//   profile  the verified-iD reader sets an affiliation (Profile › Contact)
//   page     the manager: heading, tabs, columns, the "Status" cell per tab,
//            the address after a tab press and after a reload, paging (page 2
//            kept across a tab switch, after a reload), the other journal's
//            comment absent, the shared address with a foreign / unknown number
//   panel    the manager: the row menu, the comment panel on a pending comment
//            (c2), the address, Close, the shared address; approve → hide →
//            approve (toast, tab, note, grayed buttons, Tasks count, the
//            landing page signed out); the manager's own pending comment (c5);
//            the ORCID readers' panels (c3, c4)
//   delete   the manager: "Delete Comment" from the row menu (c7: Cancel, then
//            Delete) and from the panel (c8); the landing page afterwards
//   reports  the manager: c1's "Reports" table (two reports), "View Report",
//            the report panel and its address, "Delete Report" there (Cancel,
//            Delete), the second from the row menu, the empty text, the
//            "Reported" tab and the "Status" under "All"; c6: hide keeps its
//            report, approve again
//   editor   OJS/OMP: the editor (manager-level) hides and re-approves c4 and
//            deletes c9 from the row menu
//   leave    the manager leaves the page with a panel open (any dialog?)
//   verify   three comments seeded seconds apart (the order), a hidden-and-
//            reported comment's "Status" on every tab, c1's "Status" under "All"
//   extra    the report panel for a reporter with a verified iD and an
//            affiliation
//
//   PROBE_FEATURE=U14 PROBE_AGENT=ccK3 node bin/probe.js ojs shared/playwright/checks/U14/K3/k3.js
//   PHASES=seed,page,… narrows; later phases reuse k3-state-<app>.json from the seed phase.
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, signOut, screen, shot, record, loc, note, idle, tag, outDir} =
    require('../../../probe');

const ALL_PHASES = ['seed', 'profile', 'page', 'panel', 'delete', 'reports', 'editor', 'leave', 'verify', 'extra'];
const PHASES = process.env.PHASES ? process.env.PHASES.split(',') : ALL_PHASES;
const on = (p) => PHASES.includes(p);
const log = (...a) => console.log('[k3]', ...a);
const stateFile = (app) => path.join(outDir(), `k3-state-${app.name}.json`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const T = 30_000;

const UPDATED = 'The comment has been updated successfully.';
const DELETED = 'The comment has been deleted successfully.';
const REPORT_DELETED = 'The report has been deleted successfully.';
const NO_REPORTS = 'No one has reported this comment yet';

// ---------------------------------------------------------------------------
// Reading helpers

const textOf = async (locator) => {
    try {
        if ((await locator.count()) === 0) return null;
        return (await locator.first().innerText()).trim();
    } catch { return null; }
};

/** A button's state: visible, the disabled attribute, aria-disabled, its classes. */
async function buttonState(locator) {
    const count = await locator.count().catch(() => 0);
    if (!count) return {count};
    const el = locator.first();
    return {
        count,
        text: (await el.innerText().catch(() => '')).trim(),
        visible: await el.isVisible().catch(() => null),
        enabled: await el.isEnabled().catch(() => null),
        disabledAttr: await el.getAttribute('disabled').catch(() => null),
        ariaDisabled: await el.getAttribute('aria-disabled').catch(() => null),
        className: await el.getAttribute('class').catch(() => null),
    };
}

/** The visible tab's panel: the other three panels keep their tables in the DOM (screen-notes, ccK1). */
const panelOf = (page) => page.locator('main [role="tabpanel"]:visible').first();

/** The comments table read through CSS (safe after a closed modal's shell lingers), visible tab only. */
async function readRows(page) {
    const rows = panelOf(page).locator('table tbody tr');
    const out = [];
    for (const r of await rows.all()) {
        const cells = await r.locator('td').allInnerTexts();
        out.push(cells.map((c) => c.trim()));
    }
    return out;
}

/** Heading, tabs, selected tab, column headers, rows, the paging line and nav, the address. */
async function readPage(page) {
    const main = page.locator('main');
    const tabs = [];
    for (const t of await main.getByRole('tab').all()) {
        tabs.push({label: (await t.innerText()).trim(), selected: await t.getAttribute('aria-selected'), id: await t.getAttribute('id')});
    }
    const tablist = main.getByRole('tablist');
    const panel = panelOf(page);
    const columns = await panel.locator('table thead th').allInnerTexts();
    const columnsAria = await panel.locator('table thead').ariaSnapshot().catch(() => null);
    const nav = panel.locator('nav.pkpPagination');
    return {
        panelName: await panel.getAttribute('aria-label').catch(() => null) || await panel.getAttribute('id').catch(() => null),
        panelTextTail: (await panel.innerText().catch(() => '')).trim().split('\n').slice(-6).join(' | '),
        url: page.url(),
        heading: await textOf(main.getByRole('heading', {level: 1})),
        headingSpinner: await main.locator('h1 [class*="spinner"], h1 svg').count(),
        tablistLabel: await tablist.first().getAttribute('aria-label').catch(() => null),
        tabs,
        columns: columns.map((c) => c.trim()),
        columnsAria,
        rows: await readRows(page),
        tbodyText: (await panel.locator('table tbody').innerText().catch(() => '')).trim().slice(0, 120),
        showingLine: await textOf(panel.getByText(/^Showing\b/)),
        pagination: (await nav.count()) ? {
            ariaLabel: await nav.first().getAttribute('aria-label'),
            aria: await nav.first().ariaSnapshot(),
            buttons: (await nav.first().getByRole('button').all().then((bs) => Promise.all(bs.map(async (b) => ({text: (await b.innerText()).trim(), ariaLabel: await b.getAttribute('aria-label'), current: await b.getAttribute('aria-current'), disabled: await b.getAttribute('disabled')}))))),
        } : {count: 0},
    };
}

/** Wait until the table shows a row or its empty text. */
async function tableSettled(page) {
    await panelOf(page).locator('table tbody tr').first().waitFor({timeout: T}).catch(() => {});
    await idle(page);
    // "Loading" may still be in the body cell right after a tab click.
    for (let i = 0; i < 20; i++) {
        const txt = (await panelOf(page).locator('table tbody').innerText().catch(() => '')).trim();
        if (txt && !/^Loading$/i.test(txt)) break;
        await sleep(250);
    }
}

async function gotoComments(page, app, ctx, suffix = '') {
    await page.goto(app.url(`/index.php/${ctx}/management/settings/userComments${suffix}`));
    await tableSettled(page);
}

async function clickTab(page, name) {
    await page.locator('main').getByRole('tab', {name, exact: true}).click();
    await sleep(300);
    await tableSettled(page);
}

/** The row on the visible tab, on page 1 or, failing that, on the next pages (the table lists oldest first, so a
 *  scratch journal's later comments sit past page 1 of "All"). Returns {row, page}. */
async function findRow(page, rowRegex) {
    for (let n = 1; n <= 4; n++) {
        const row = panelOf(page).getByRole('row', {name: rowRegex}).first();
        if (await row.count()) return {row, page: n};
        const next = panelOf(page).locator('nav.pkpPagination').getByRole('button', {name: `Go to Page ${n + 1}`, exact: true});
        if (!(await next.count())) return {row, page: n, missing: true};
        await next.first().click();
        await tableSettled(page);
    }
    return {row: panelOf(page).getByRole('row', {name: rowRegex}).first(), missing: true};
}

/** A row's "…" menu: opens it and returns the items; leaves it open. */
async function openRowMenu(page, rowRegex) {
    const found = await findRow(page, rowRegex);
    const row = found.row;
    await row.waitFor({timeout: T});
    const trigger = row.getByRole('button', {name: 'More Actions'});
    await trigger.click();
    await sleep(300);
    const items = (await page.getByRole('menuitem').allInnerTexts()).map((s) => s.trim());
    return {row, trigger, items, onPage: found.page};
}
async function closeMenu(page) {
    await page.keyboard.press('Escape');
    await sleep(200);
}

const commentDialog = (page) => page.getByRole('dialog', {name: /^View comment details by/});
const reportDialog = (page) => page.getByRole('dialog', {name: /^View report details by/});
const confirmDialog = (page, name) => page.getByRole('dialog', {name, exact: true});

/** The comment panel as data. */
async function readCommentPanel(page) {
    const d = commentDialog(page);
    await d.waitFor({timeout: T});
    await idle(page);
    await sleep(500);
    const s = await screen(page);
    const reportRows = [];
    const table = d.getByRole('table', {name: 'Reports'});
    for (const r of await table.locator('tbody tr').all()) {
        reportRows.push((await r.locator('td').allInnerTexts()).map((c) => c.trim()));
    }
    const orcidLink = d.locator('a[href*="orcid.org"]');
    return {
        screen: s,
        url: page.url(),
        title: await textOf(d.getByRole('heading', {level: 1})),
        buttons: {
            approve: await buttonState(d.getByRole('button', {name: 'Approve Comment'})),
            hide: await buttonState(d.getByRole('button', {name: 'Hide Comment'})),
            del: await buttonState(d.getByRole('button', {name: 'Delete Comment'})),
            close: await buttonState(d.getByRole('button', {name: 'Close', exact: true})),
            all: (await d.getByRole('button').allInnerTexts()).map((x) => x.trim()),
        },
        note: await textOf(d.getByText(/Approving this comment will|This comment was approved on/)),
        reportsTable: {
            heading: await textOf(d.getByText('Reports', {exact: true})),
            description: await textOf(d.getByText(/This is the list of all the users/)),
            columns: (await table.locator('thead th').allInnerTexts()).map((c) => c.trim()),
            rows: reportRows,
            empty: await textOf(d.getByText(NO_REPORTS)),
            pagination: await d.locator('nav.pkpPagination').count(),
            showingLine: await textOf(d.locator('table').locator('xpath=following-sibling::div[1]').locator('span').first()),
        },
        orcid: (await orcidLink.count()) ? {
            href: await orcidLink.first().getAttribute('href'),
            text: (await orcidLink.first().innerText()).trim(),
            icon: await orcidLink.first().locator('svg, img').first().evaluate((el) => ({class: el.getAttribute('class'), label: el.getAttribute('aria-label'), title: el.querySelector('title')?.textContent, html: el.outerHTML.replace(/\s+/g, ' ').slice(0, 300)})).catch(() => null),
            iconBefore: await orcidLink.first().evaluate((a) => {
                const prev = a.previousElementSibling;
                return prev ? {tag: prev.tagName, src: prev.getAttribute('src'), alt: prev.getAttribute('alt'), class: prev.getAttribute('class'), html: prev.outerHTML.replace(/\s+/g, ' ').slice(0, 400)} : null;
            }).catch(() => null),
        } : null,
        text: (await d.innerText()).trim(),
    };
}

/** The report panel as data. */
async function readReportPanel(page) {
    const d = reportDialog(page);
    await d.waitFor({timeout: T});
    await idle(page);
    await sleep(400);
    const s = await screen(page);
    return {
        screen: s,
        url: page.url(),
        title: await textOf(d.getByRole('heading', {level: 1})),
        buttons: (await d.getByRole('button').allInnerTexts()).map((x) => x.trim()),
        deleteReport: await buttonState(d.getByRole('button', {name: 'Delete Report'})),
        text: (await d.innerText()).trim(),
        dialogsOpen: await page.locator('[role="dialog"]:visible').count(),
    };
}

/** The confirm dialog as data. */
async function readConfirm(page, name) {
    const d = confirmDialog(page, name);
    await d.waitFor({timeout: T});
    await sleep(300);
    return {
        title: await textOf(d.getByRole('heading')),
        text: (await d.innerText()).trim(),
        buttons: (await d.getByRole('button').allInnerTexts()).map((x) => x.trim()),
        aria: await d.ariaSnapshot(),
    };
}

/** The notice: waits for the text, then its box, the viewport, its container. */
async function toastInfo(page, text) {
    const loc_ = page.getByText(text);   // substring: the notice's element also holds its "×" button
    let seen = true;
    await loc_.first().waitFor({timeout: 10_000}).catch(() => { seen = false; });
    if (!seen) return {seen: false, bodyTail: (await page.locator('body').innerText()).slice(-600)};
    const info = await loc_.first().evaluate((el, t) => {
        let node = el;
        while (node.parentElement && node.parentElement.innerText.trim().replace(/\s*×\s*$/, '') === t) node = node.parentElement;
        const container = node.closest('[class*="toast"], [class*="Toast"], [role="status"], [role="alert"], [aria-live]') || node;
        const r = container.getBoundingClientRect();
        return {
            rect: {top: Math.round(r.top), right: Math.round(r.right), bottom: Math.round(r.bottom), left: Math.round(r.left), width: Math.round(r.width), height: Math.round(r.height)},
            viewport: {w: window.innerWidth, h: window.innerHeight},
            containerClass: container.getAttribute('class'),
            role: container.getAttribute('role'),
            ariaLive: container.getAttribute('aria-live'),
            text: container.innerText.trim(),
            hasCloseX: /×/.test(container.innerText),
        };
    }, text);
    return {seen: true, ...info};
}

/** Runs an action and captures one matching response (never a throw). */
const idsOf = (body) => (body && Array.isArray(body.items)) ? body.items.map((x) => x.id) : null;
const captureResponse = async (page, predicate, action, timeout = 20_000) => {
    const waiting = page.waitForResponse(predicate, {timeout}).catch((e) => ({error: String(e).slice(0, 120)}));
    await action();
    const response = await waiting;
    if (response.error) return response;
    let body = null;
    try { body = await response.json(); } catch { body = await response.text().catch(() => null); }
    return {url: response.url(), method: response.request().method(), status: response.status(), postData: response.request().postData(), body};
};
const isCommentsList = (r) => /\/api\/v1\/comments(\?|$)/.test(r.url()) && r.request().method() === 'GET';
const isReportsList = (r) => /\/api\/v1\/comments\/\d+\/reports(\?|$)/.test(r.url()) && r.request().method() === 'GET';

/** After an action that closed the panel: the toast, the refetch, the rows, the address, the open dialogs. */
async function afterClosingAction(page, toastText, listCapture) {
    const toast = await toastInfo(page, toastText);
    const raw = await listCapture;
    await sleep(800);
    const refetch = raw && raw.error ? raw : (raw && typeof raw.url === 'function' ? {url: raw.url(), status: raw.status()} : raw);
    return {
        toast,
        refetch,
        url: page.url(),
        dialogsVisible: await page.locator('[role="dialog"]:visible').count(),
        rows: await readRows(page),
    };
}

async function tasksCount(page) {
    return (await page.getByRole('button', {name: /^Tasks/}).first().innerText().catch(() => '')).trim();
}

/** The landing page's comment bodies (OJS), signed out or not. */
async function landingBodies(page, app, ctx, id) {
    await page.goto(app.url(`/index.php/${ctx}/article/view/${id}`));
    await idle(page);
    return {
        url: page.url(),
        bodies: (await page.locator('#public-comments article [class*="messageBody"]').allInnerTexts()).map((s) => s.trim()),
        headings: (await page.locator('#public-comments').getByRole('heading', {level: 3}).allInnerTexts()).map((s) => s.trim()),
    };
}

async function mailCounts(app, users) {
    const out = {};
    for (const u of users) out[u] = await app.mail.count({to: `${u}@mail.test`}).catch((e) => String(e).slice(0, 80));
    return out;
}

const loadState = (app) => JSON.parse(fs.readFileSync(stateFile(app), 'utf8'));
const saveState = (app, st) => fs.writeFileSync(stateFile(app), JSON.stringify(st, null, 2));

/** Runs a step, records an error instead of dying. */
async function step(name, fn) {
    try { await fn(); } catch (e) {
        log('STEP FAILED', name, String(e).slice(0, 400));
        record(`error-${name}`, {step: name, error: String(e).slice(0, 2000)});
    }
}

// ---------------------------------------------------------------------------

forEachApp(async (app) => {
    const isOJS = app.name === 'ojs';
    const hasEditor = app.name !== 'ops';
    let st = {};

    // ── seed ───────────────────────────────────────────────────────────────
    if (on('seed')) {
        const t = tag('u14k3');
        const users = [
            {username: `${t}mgr`, roles: ['manager'], givenName: 'Maya', familyName: 'Moderator'},
            ...(hasEditor ? [{username: `${t}ed`, roles: ['editor'], givenName: 'Ed', familyName: 'Editor'}] : []),
            {username: `${t}se`, roles: ['sectionEditor'], givenName: 'Sam', familyName: 'Sectioned'},
            {username: `${t}au`, roles: ['author'], givenName: 'Alex', familyName: 'Author'},
            {username: `${t}rd1`, roles: ['reader'], givenName: 'Rosa', familyName: 'Writer'},
            {username: `${t}rd2`, roles: ['reader'], givenName: 'Rob', familyName: 'Reporter'},
            {username: `${t}rd3`, roles: ['reader'], givenName: 'Rita', familyName: 'Third'},
            {username: `${t}orcv`, roles: ['reader'], givenName: 'Vera', familyName: 'Verified', orcid: 'https://orcid.org/0000-0002-1825-0097', orcidIsVerified: true},
            {username: `${t}orcu`, roles: ['reader'], givenName: 'Uma', familyName: 'Unverified', orcid: 'https://orcid.org/0000-0001-5109-3700', orcidIsVerified: false},
        ];
        st.tag = t;
        st.context = await app.api.createContext({tag: t, enablePublicComments: true, users});
        // S2 first: 26 pending comments, so S1's rows are the newest and sit on page 1 of "All".
        st.s2 = await app.api.createSubmission({
            tag: `${t}s2`, context: t, submitter: `${t}au`, published: true, title: `K3 bulk article ${t}`,
            userComments: Array.from({length: 26}, (_, i) => ({user: `${t}rd2`, text: `K3 bulk comment ${String(i + 1).padStart(2, '0')}.`})),
        });
        st.s1 = await app.api.createSubmission({
            tag: `${t}s1`, context: t, submitter: `${t}au`, published: true, title: `K3 article one ${t}`,
            userComments: [
                {user: `${t}rd1`, text: 'K3 c1 approved and twice reported.', approved: true, reports: [{user: `${t}rd2`, note: 'K3 report one by Rob.'}, {user: `${t}rd3`, note: 'K3 report two by Rita.'}]},
                {user: `${t}rd1`, text: 'K3 c2 pending for approve-hide-approve.'},
                {user: `${t}orcv`, text: 'K3 c3 by the verified iD.', approved: true},
                {user: `${t}orcu`, text: 'K3 c4 by the unverified iD.', approved: true},
                {user: `${t}mgr`, text: 'K3 c5 the moderator\'s own pending comment.'},
                {user: `${t}rd2`, text: 'K3 c6 approved with one report.', approved: true, reports: [{user: `${t}rd3`, note: 'K3 single report by Rita.'}]},
                {user: `${t}rd1`, text: 'K3 c7 to delete from the row menu.', approved: true},
                {user: `${t}rd1`, text: 'K3 c8 to delete from the panel.'},
                {user: `${t}rd2`, text: 'K3 c9 a long one: ' + 'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor '.repeat(6) + 'the end.', approved: true},
                {user: `${t}rd3`, text: 'K3 c10 pending by Rita.'},
            ],
        });
        // Context B: the other journal's comment (control).
        st.b = await app.api.createContext({tag: `${t}b`, enablePublicComments: true, users: [
            {username: `${t}bmgr`, roles: ['manager']}, {username: `${t}bau`, roles: ['author']},
            {username: `${t}brd1`, roles: ['reader'], givenName: 'Bea', familyName: 'Other'}, {username: `${t}brd2`, roles: ['reader']},
        ]});
        st.sb = await app.api.createSubmission({
            tag: `${t}sb`, context: `${t}b`, submitter: `${t}bau`, published: true, title: `K3 other journal article ${t}`,
            userComments: [{user: `${t}brd1`, text: 'K3 other journal comment by Bea.', approved: true, reports: [{user: `${t}brd2`, note: 'K3 other journal report.'}]}],
        });
        const ids = {};
        st.s1.userComments.forEach((c, i) => { ids[`c${i + 1}`] = c; });
        st.c = ids;
        st.mailBefore = await mailCounts(app, [`${t}rd1`, `${t}rd2`, `${t}rd3`, `${t}mgr`]);
        saveState(app, st);
        record('seed', st);
        log('seeded', t, 's2', st.s2.submissionId, 's1', st.s1.submissionId, 'B', st.sb.submissionId, JSON.stringify(ids));
    } else {
        st = loadState(app);
    }
    const t = st.tag;
    const ctx = st.context.path;
    const s1 = st.s1.submissionId;
    const c = st.c;   // c1..c10: {id, user, approved, reports: [ids]}
    const {page, close} = await launch(app);
    try {
        // ── profile: the verified-iD reader sets an affiliation ──────────────
        if (on('profile')) await step('profile', async () => {
            const {ProfilePage} = require('../../../pages/ProfilePage.js');
            await signIn(page, `${t}orcv`, {contextPath: ctx});
            const profile = new ProfilePage(page, ctx);
            await profile.goto('contact');
            await profile.country().selectOption({label: 'Canada'});   // the Contact tab's required Country (screen-notes)
            await profile.affiliation('en').fill('K3 Verified Institute');
            await profile.save();
            record('profile-orcv-saved', {status: await page.locator('[role="status"]').allInnerTexts()});
            await signOut(page);
        });

        // ── page: the Comments page as the manager ──────────────────────────
        if (on('page')) await step('page', async () => {
            await signIn(page, `${t}mgr`, {contextPath: ctx});
            const landed = await captureResponse(page, isCommentsList, () => gotoComments(page, app, ctx));
            record('page-all', {screen: await screen(page), page: await readPage(page), firstFetch: {url: landed.url, status: landed.status, bodyKeys: landed.body && Object.keys(landed.body), itemsMax: landed.body && landed.body.itemsMax, ids: idsOf(landed.body)}});
            await shot(page, 'page-all');
            await loc(page, 'the Comments page heading', page.locator('main').getByRole('heading', {level: 1, name: 'Comments'}));
            await loc(page, 'the "Approved" tab', page.locator('main').getByRole('tab', {name: 'Approved', exact: true}));
            await clickTab(page, 'Reported');
            await loc(page, 'a comment row by its text (visible tab panel)', panelOf(page).getByRole('row', {name: /K3 c1 approved and twice reported\./}));
            await loc(page, 'the row\'s "…" button', panelOf(page).getByRole('row', {name: /K3 c1 approved and twice reported\./}).getByRole('button', {name: 'More Actions'}));
            await clickTab(page, 'All');
            // The comment cell of the long comment: one line?
            const longFound = await findRow(page, /K3 c9 a long one/);
            const longCell = longFound.row.locator('td').nth(1);
            record('page-long-cell', await longCell.evaluate((el) => {
                const cs = getComputedStyle(el);
                const r = el.getBoundingClientRect();
                return {text: el.innerText, textLength: el.textContent.trim().length, whiteSpace: cs.whiteSpace, overflow: cs.overflow, textOverflow: cs.textOverflow, maxWidth: cs.maxWidth, height: Math.round(r.height), width: Math.round(r.width), lineHeight: cs.lineHeight, scrollWidth: el.scrollWidth, clientWidth: el.clientWidth, title: el.getAttribute('title')};
            }).then((x) => ({onPage: longFound.page, ...x})).catch((e) => ({error: String(e).slice(0, 200)})));
            await gotoComments(page, app, ctx);
            // Each tab: the address, the rows and their "Status".
            for (const name of ['Approved', 'Hidden/Needs Approval', 'Reported', 'All']) {
                const fetched = await captureResponse(page, isCommentsList, () => clickTab(page, name));
                record(`page-tab-${name.replace(/[^a-z]/gi, '').toLowerCase()}`, {screen: await screen(page), page: await readPage(page), fetch: {url: fetched.url, status: fetched.status, itemsMax: fetched.body && fetched.body.itemsMax, ids: idsOf(fetched.body)}});
            }
            // Press "Approved", then reload: the tab shown.
            await clickTab(page, 'Approved');
            const urlAfterApproved = page.url();
            await page.reload();
            await tableSettled(page);
            record('page-approved-reload', {urlBefore: urlAfterApproved, page: await readPage(page)});
            // Paging on "All": page 2, the address, a switch to "Approved" and back, then a reload.
            await clickTab(page, 'All');
            const before = await readPage(page);
            const nav = panelOf(page).locator('nav.pkpPagination').first();
            const page2 = nav.getByRole('button', {name: 'Go to Page 2', exact: true});
            const fetched2 = await captureResponse(page, isCommentsList, () => page2.click());
            await tableSettled(page);
            const p2 = await readPage(page);
            record('page-all-page2', {before: {showing: before.showingLine, pagination: before.pagination}, fetch: {url: fetched2.url, status: fetched2.status, ids: idsOf(fetched2.body)}, page: p2, screen: await screen(page)});
            await loc(page, 'the paging nav under the table', nav);
            await loc(page, 'the paging nav\'s page 2 button', page2);
            await clickTab(page, 'Approved');
            const onApproved = await readPage(page);
            await clickTab(page, 'All');
            const backOnAll = await readPage(page);
            record('page-all-page2-kept', {approved: {showing: onApproved.showingLine, rows: onApproved.rows.length, url: onApproved.url}, backOnAll: {showing: backOnAll.showingLine, rows: backOnAll.rows.slice(0, 3), url: backOnAll.url, pagination: backOnAll.pagination}});
            // Hidden/Needs Approval has two pages too: go to its page 2, then All (its own page), then back.
            await clickTab(page, 'Hidden/Needs Approval');
            const hnaBefore = await readPage(page);
            await panelOf(page).locator('nav.pkpPagination').first().getByRole('button', {name: 'Go to Page 2', exact: true}).click();
            await tableSettled(page);
            const hnaP2 = await readPage(page);
            await clickTab(page, 'All');
            const allAgain = await readPage(page);
            await clickTab(page, 'Hidden/Needs Approval');
            const hnaAgain = await readPage(page);
            record('page-hna-page2-kept', {hnaBefore: hnaBefore.showingLine, hnaP2: hnaP2.showingLine, allAgain: allAgain.showingLine, hnaAgain: {showing: hnaAgain.showingLine, url: hnaAgain.url}});
            // The other end: reload while on page 2 of All.
            await clickTab(page, 'All');
            const urlP2 = page.url();
            await page.reload();
            await tableSettled(page);
            const reloaded = await readPage(page);
            record('page-all-page2-reload', {urlBefore: urlP2, after: {url: reloaded.url, showing: reloaded.showingLine, tabs: reloaded.tabs.filter((x) => x.selected === 'true')}});
            // Sweep: Previous / Next buttons.
            const nav2 = panelOf(page).locator('nav.pkpPagination').first();
            const next = nav2.getByRole('button', {name: /next/i});
            const prev = nav2.getByRole('button', {name: /previous/i});
            const sweep = {prevBefore: await buttonState(prev), nextBefore: await buttonState(next)};
            if (sweep.nextBefore.enabled) { await next.click(); await tableSettled(page); sweep.afterNext = (await readPage(page)).showingLine; }
            if (await prev.isEnabled().catch(() => false)) { await prev.click(); await tableSettled(page); sweep.afterPrev = (await readPage(page)).showingLine; }
            sweep.afterPrevState = {prev: await buttonState(prev), next: await buttonState(next)};
            record('page-paging-sweep', sweep);
            // The other journal's comment: absent from this journal's page.
            await gotoComments(page, app, ctx, '#reported');
            const reported = await readPage(page);
            record('page-other-journal-absent', {reportedRows: reported.rows, mentionsOther: JSON.stringify(reported.rows).includes('other journal'), otherCommentId: st.sb.userComments[0].id});
            // The shared address with a comment number of context B (recorded neutrally: the address, the answer's status, whether a panel opened), and with a number no comment has.
            const check1 = await captureResponse(page, (r) => /\/api\/v1\/comments\/\d+$/.test(r.url()), () => gotoComments(page, app, ctx, `?commentId=${st.sb.userComments[0].id}`));
            await sleep(1500);
            record('page-check-1', {url: page.url(), status: check1.error ? check1 : check1.status, dialogsVisible: await page.locator('[role="dialog"]:visible').count()});
            const unknown = await captureResponse(page, (r) => /\/api\/v1\/comments\/\d+$/.test(r.url()), () => gotoComments(page, app, ctx, '?commentId=999999'));
            await sleep(1500);
            record('page-address-unknown-comment', {url: page.url(), fetch: unknown.error ? unknown : {url: unknown.url, status: unknown.status, body: unknown.body}, dialogsVisible: await page.locator('[role="dialog"]:visible').count(), screen: await screen(page)});
            // Context B's own page lists its comment (control).
            await signOut(page);
            await signIn(page, `${t}bmgr`, {contextPath: st.b.path});
            await gotoComments(page, app, st.b.path);
            record('page-other-journal-own', {page: await readPage(page)});
            await signOut(page);
        });

        // ── panel: the row menu, the comment panel, approve / hide / approve ─
        if (on('panel')) await step('panel', async () => {
            await signIn(page, `${t}mgr`, {contextPath: ctx});
            st.tasksStart = null;
            await gotoComments(page, app, ctx);
            st.tasksStart = await tasksCount(page);
            // The row menu on c2 (pending).
            const menu = await openRowMenu(page, /K3 c2 pending for approve-hide-approve\./);
            record('panel-row-menu', {items: menu.items, menuAria: await page.getByRole('menu').first().ariaSnapshot().catch(() => null)});
            await loc(page, 'the row menu\'s "View Comment" item', page.getByRole('menuitem', {name: 'View Comment'}));
            await page.getByRole('menuitem', {name: 'View Comment'}).click();
            const p1 = await readCommentPanel(page);
            record('panel-c2-pending', p1);
            await shot(page, 'panel-c2-pending');
            await loc(page, 'the comment panel', commentDialog(page));
            await loc(page, 'the panel\'s "Approve Comment" button', commentDialog(page).getByRole('button', {name: 'Approve Comment'}));
            await loc(page, 'the panel\'s "Hide Comment" button', commentDialog(page).getByRole('button', {name: 'Hide Comment'}));
            await loc(page, 'the panel\'s "Close" button', commentDialog(page).getByRole('button', {name: 'Close', exact: true}));
            // Close: the address and the refetch.
            const closed = await captureResponse(page, isCommentsList, () => commentDialog(page).getByRole('button', {name: 'Close', exact: true}).click(), 8_000);
            await sleep(800);
            record('panel-c2-closed', {url: page.url(), refetch: closed.error ? closed : {url: closed.url, status: closed.status}, dialogsVisible: await page.locator('[role="dialog"]:visible').count(), rowsCss: (await readRows(page)).length, rowsRole: await page.getByRole('row').count()});
            // Escape closes it too? (sweep)
            await gotoComments(page, app, ctx);
            const m2 = await openRowMenu(page, /K3 c2 pending for approve-hide-approve\./);
            await page.getByRole('menuitem', {name: 'View Comment'}).click();
            await commentDialog(page).waitFor({timeout: T});
            await sleep(500);
            await page.keyboard.press('Escape');
            await sleep(800);
            record('panel-c2-escape', {url: page.url(), dialogsVisible: await page.locator('[role="dialog"]:visible').count()});
            // The shared address opened directly.
            const direct = await captureResponse(page, (r) => new RegExp(`/api/v1/comments/${c.c2.id}$`).test(r.url()), () => gotoComments(page, app, ctx, `?commentId=${c.c2.id}`));
            const p2 = await readCommentPanel(page);
            record('panel-c2-direct-address', {fetch: direct.error ? direct : {url: direct.url, status: direct.status}, title: p2.title, url: p2.url, note: p2.note, buttons: p2.buttons, screen: p2.screen});
            // Approve.
            const tasksBefore = await tasksCount(page);
            const listAfterApprove = page.waitForResponse(isCommentsList, {timeout: 20_000}).catch((e) => ({error: String(e).slice(0, 100)}));
            const approve = await captureResponse(page, (r) => r.url().includes('/setApproval'), () => commentDialog(page).getByRole('button', {name: 'Approve Comment'}).click());
            const a1 = await afterClosingAction(page, UPDATED, listAfterApprove);
            record('panel-c2-approved', {request: {status: approve.status, postData: approve.postData, isApproved: approve.body && approve.body.isApproved, approvedByUserName: approve.body && approve.body.approvedByUserName}, ...a1, tasksBefore, tasksAfter: await tasksCount(page)});
            await shot(page, 'panel-c2-approved-toast');
            // The toast: how long it stays.
            const toastGone = await page.getByText(UPDATED, {exact: true}).first().waitFor({state: 'hidden', timeout: 15_000}).then(() => 'gone within 15 s').catch(() => 'still shown after 15 s');
            record('panel-c2-approved-toast-life', {toastGone});
            await gotoComments(page, app, ctx, '#approved');
            record('panel-c2-approved-tab', {approvedRows: (await readRows(page)).filter((r) => r[1] && r[1].includes('K3 c2'))});
            await clickTab(page, 'Hidden/Needs Approval');
            record('panel-c2-hna-tab', {hnaRows: (await readRows(page)).filter((r) => r[1] && r[1].includes('K3 c2')), showing: (await readPage(page)).showingLine});
            // Reopen: the note and the grayed buttons.
            await gotoComments(page, app, ctx, `?commentId=${c.c2.id}`);
            const p3 = await readCommentPanel(page);
            record('panel-c2-after-approve', {title: p3.title, note: p3.note, buttons: p3.buttons, text: p3.text, screen: p3.screen});
            await shot(page, 'panel-c2-after-approve');
            // The landing page signed out (OJS): c2 shows.
            if (isOJS) {
                await signOut(page);
                record('landing-anon-after-approve', await landingBodies(page, app, ctx, s1));
                await signIn(page, `${t}mgr`, {contextPath: ctx});
                await gotoComments(page, app, ctx, `?commentId=${c.c2.id}`);
                await commentDialog(page).waitFor({timeout: T});
                await sleep(500);
            }
            // Hide.
            const tasksBeforeHide = await tasksCount(page);
            const listAfterHide = page.waitForResponse(isCommentsList, {timeout: 20_000}).catch((e) => ({error: String(e).slice(0, 100)}));
            const hide = await captureResponse(page, (r) => r.url().includes('/setApproval'), () => commentDialog(page).getByRole('button', {name: 'Hide Comment'}).click());
            const h1 = await afterClosingAction(page, UPDATED, listAfterHide);
            record('panel-c2-hidden', {request: {status: hide.status, postData: hide.postData, isApproved: hide.body && hide.body.isApproved}, ...h1, tasksBefore: tasksBeforeHide, tasksAfter: await tasksCount(page)});
            await gotoComments(page, app, ctx, '#needsApproval');
            record('panel-c2-hidden-tab', {hnaRows: (await readRows(page)).filter((r) => r[1] && r[1].includes('K3 c2')), page: await readPage(page)});
            await clickTab(page, 'Approved');
            record('panel-c2-hidden-approved-tab', {approvedRows: (await readRows(page)).filter((r) => r[1] && r[1].includes('K3 c2'))});
            await gotoComments(page, app, ctx, `?commentId=${c.c2.id}`);
            const p4 = await readCommentPanel(page);
            record('panel-c2-after-hide', {title: p4.title, note: p4.note, buttons: p4.buttons, screen: p4.screen});
            if (isOJS) {
                await signOut(page);
                record('landing-anon-after-hide', await landingBodies(page, app, ctx, s1));
                await signIn(page, `${t}rd1`, {contextPath: ctx});
                record('landing-writer-after-hide', await landingBodies(page, app, ctx, s1));
                await signOut(page);
                await signIn(page, `${t}mgr`, {contextPath: ctx});
                await gotoComments(page, app, ctx, `?commentId=${c.c2.id}`);
                await commentDialog(page).waitFor({timeout: T});
                await sleep(500);
            }
            // Approve again: the note rewritten.
            await sleep(1500);   // a later minute, if the clock allows, for the date's shape
            const listAfterApprove2 = page.waitForResponse(isCommentsList, {timeout: 20_000}).catch((e) => ({error: String(e).slice(0, 100)}));
            const approve2 = await captureResponse(page, (r) => r.url().includes('/setApproval'), () => commentDialog(page).getByRole('button', {name: 'Approve Comment'}).click());
            const a2 = await afterClosingAction(page, UPDATED, listAfterApprove2);
            record('panel-c2-approved-again', {request: {status: approve2.status, postData: approve2.postData, approvedAt: approve2.body && approve2.body.approvedAt, approvedByUserName: approve2.body && approve2.body.approvedByUserName}, toast: a2.toast, url: a2.url});
            await gotoComments(page, app, ctx, `?commentId=${c.c2.id}`);
            const p5 = await readCommentPanel(page);
            record('panel-c2-after-second-approve', {note: p5.note, buttons: p5.buttons, previousNote: p3.note});
            // The manager's own pending comment (c5): approve, then hide (line 55, "their own included").
            await gotoComments(page, app, ctx, `?commentId=${c.c5.id}`);
            const own = await readCommentPanel(page);
            record('panel-c5-own-pending', {title: own.title, note: own.note, buttons: own.buttons, text: own.text});
            const listOwn = page.waitForResponse(isCommentsList, {timeout: 20_000}).catch((e) => ({error: String(e).slice(0, 100)}));
            const ownApprove = await captureResponse(page, (r) => r.url().includes('/setApproval'), () => commentDialog(page).getByRole('button', {name: 'Approve Comment'}).click());
            const o1 = await afterClosingAction(page, UPDATED, listOwn);
            record('panel-c5-own-approved', {request: {status: ownApprove.status, isApproved: ownApprove.body && ownApprove.body.isApproved, approvedByUserName: ownApprove.body && ownApprove.body.approvedByUserName}, toast: o1.toast});
            await gotoComments(page, app, ctx, `?commentId=${c.c5.id}`);
            const own2 = await readCommentPanel(page);
            const listOwn2 = page.waitForResponse(isCommentsList, {timeout: 20_000}).catch((e) => ({error: String(e).slice(0, 100)}));
            const ownHide = await captureResponse(page, (r) => r.url().includes('/setApproval'), () => commentDialog(page).getByRole('button', {name: 'Hide Comment'}).click());
            const o2 = await afterClosingAction(page, UPDATED, listOwn2);
            record('panel-c5-own-hidden', {noteAfterApprove: own2.note, request: {status: ownHide.status, isApproved: ownHide.body && ownHide.body.isApproved}, toast: o2.toast});
            // The ORCID readers' panels (c3 verified, c4 unverified) and the affiliation.
            await gotoComments(page, app, ctx, `?commentId=${c.c3.id}`);
            const v = await readCommentPanel(page);
            record('panel-c3-orcid-verified', {text: v.text, orcid: v.orcid, screen: v.screen});
            await shot(page, 'panel-c3-orcid-verified');
            await gotoComments(page, app, ctx, `?commentId=${c.c4.id}`);
            const u = await readCommentPanel(page);
            record('panel-c4-orcid-unverified', {text: u.text, orcid: u.orcid, screen: u.screen});
            await shot(page, 'panel-c4-orcid-unverified');
            // c10: pending, "Hide Comment" grayed; the panel's Delete button present (no press).
            await gotoComments(page, app, ctx, `?commentId=${c.c10.id}`);
            const p10 = await readCommentPanel(page);
            record('panel-c10-pending-buttons', {buttons: p10.buttons, note: p10.note});
            // Is a grayed button pressable? Press "Hide Comment" on the pending c10 and record any request (sweep).
            const grayed = await captureResponse(page, (r) => r.url().includes('/setApproval'), () => commentDialog(page).getByRole('button', {name: 'Hide Comment'}).click({force: true, timeout: 5_000}).catch((e) => ({clickError: String(e).slice(0, 100)})), 4_000);
            record('panel-c10-grayed-hide-press', {request: grayed, dialogsVisible: await page.locator('[role="dialog"]:visible').count(), toast: await toastInfo(page, UPDATED).then((x) => x.seen).catch(() => null)});
            st.mailAfterPanel = await mailCounts(app, [`${t}rd1`, `${t}rd2`, `${t}rd3`, `${t}mgr`]);
            record('panel-mail-counts', {before: st.mailBefore, after: st.mailAfterPanel});
            saveState(app, st);
            await signOut(page);
        });

        // ── delete: from the row menu (c7) and from the panel (c8) ───────────
        if (on('delete')) await step('delete', async () => {
            await signIn(page, `${t}mgr`, {contextPath: ctx});
            await gotoComments(page, app, ctx);
            const tasksBefore = await tasksCount(page);
            // c7 from the row menu: the dialog, Cancel, then Delete.
            const m = await openRowMenu(page, /K3 c7 to delete from the row menu\./);
            await page.getByRole('menuitem', {name: 'Delete Comment'}).click();
            const dlg = await readConfirm(page, 'Delete Comment');
            record('delete-c7-dialog', dlg);
            await shot(page, 'delete-c7-dialog');
            await loc(page, 'the "Delete Comment" dialog', confirmDialog(page, 'Delete Comment'));
            const cancelled = await captureResponse(page, (r) => /\/api\/v1\/comments\/\d+$/.test(r.url()) && r.request().method() !== 'GET', () => confirmDialog(page, 'Delete Comment').getByRole('button', {name: 'Cancel', exact: true}).click(), 4_000);
            await sleep(500);
            record('delete-c7-cancel', {request: cancelled, dialogsVisible: await page.locator('[role="dialog"]:visible').count(), rowStill: (await readRows(page)).some((r) => r[1] && r[1].includes('K3 c7'))});
            await gotoComments(page, app, ctx);
            await openRowMenu(page, /K3 c7 to delete from the row menu\./);
            await page.getByRole('menuitem', {name: 'Delete Comment'}).click();
            await confirmDialog(page, 'Delete Comment').waitFor({timeout: T});
            const list1 = page.waitForResponse(isCommentsList, {timeout: 20_000}).catch((e) => ({error: String(e).slice(0, 100)}));
            const del1 = await captureResponse(page, (r) => /\/api\/v1\/comments\/\d+$/.test(r.url()) && r.request().method() !== 'GET', () => confirmDialog(page, 'Delete Comment').getByRole('button', {name: 'Delete', exact: true}).click());
            const d1 = await afterClosingAction(page, DELETED, list1);
            record('delete-c7-deleted', {request: {url: del1.url, method: del1.method, status: del1.status}, ...d1, rowStill: d1.rows.some((r) => r[1] && r[1].includes('K3 c7')), tasksBefore, tasksAfter: await tasksCount(page)});
            await shot(page, 'delete-c7-deleted');
            // c8 from the panel.
            await gotoComments(page, app, ctx, `?commentId=${c.c8.id}`);
            const p8 = await readCommentPanel(page);
            await commentDialog(page).getByRole('button', {name: 'Delete Comment'}).click();
            const dlg8 = await readConfirm(page, 'Delete Comment');
            record('delete-c8-dialog', {panelButtons: p8.buttons, dialog: dlg8, dialogsVisible: await page.locator('[role="dialog"]:visible').count()});
            await confirmDialog(page, 'Delete Comment').getByRole('button', {name: 'Cancel', exact: true}).click();
            await sleep(500);
            record('delete-c8-cancel', {dialogsVisible: await page.locator('[role="dialog"]:visible').count(), panelStill: await commentDialog(page).isVisible().catch(() => null), url: page.url()});
            await commentDialog(page).getByRole('button', {name: 'Delete Comment'}).click();
            await confirmDialog(page, 'Delete Comment').waitFor({timeout: T});
            const list2 = page.waitForResponse(isCommentsList, {timeout: 20_000}).catch((e) => ({error: String(e).slice(0, 100)}));
            const del2 = await captureResponse(page, (r) => /\/api\/v1\/comments\/\d+$/.test(r.url()) && r.request().method() !== 'GET', () => confirmDialog(page, 'Delete Comment').getByRole('button', {name: 'Delete', exact: true}).click());
            const d2 = await afterClosingAction(page, DELETED, list2);
            record('delete-c8-deleted', {request: {url: del2.url, method: del2.method, status: del2.status}, ...d2, rowStill: d2.rows.some((r) => r[1] && r[1].includes('K3 c8')), tasksAfter: await tasksCount(page)});
            await gotoComments(page, app, ctx);
            record('delete-after-both', {page: await readPage(page)});
            if (isOJS) {
                await signOut(page);
                record('landing-anon-after-delete', await landingBodies(page, app, ctx, s1));
                await signIn(page, `${t}rd1`, {contextPath: ctx});
                record('landing-writer-after-delete', await landingBodies(page, app, ctx, s1));
            }
            st.mailAfterDelete = await mailCounts(app, [`${t}rd1`, `${t}rd2`, `${t}rd3`, `${t}mgr`]);
            record('delete-mail-counts', {before: st.mailBefore, after: st.mailAfterDelete});
            saveState(app, st);
            await signOut(page);
        });

        // ── reports: c1's two reports, the report panel, Delete Report ───────
        if (on('reports')) await step('reports', async () => {
            await signIn(page, `${t}mgr`, {contextPath: ctx});
            await gotoComments(page, app, ctx, '#reported');
            record('reports-reported-tab-before', {page: await readPage(page)});
            const m = await openRowMenu(page, /K3 c1 approved and twice reported\./);
            await page.getByRole('menuitem', {name: 'View Comment'}).click();
            const p1 = await readCommentPanel(page);
            record('reports-c1-panel', p1);
            await shot(page, 'reports-c1-panel');
            await loc(page, 'the panel\'s "Reports" table', commentDialog(page).getByRole('table', {name: 'Reports'}));
            // The report row's menu.
            const reportRow = commentDialog(page).getByRole('table', {name: 'Reports'}).getByRole('row', {name: /K3 report two by Rita\./});
            await reportRow.getByRole('button', {name: 'More Actions'}).click();
            await sleep(300);
            record('reports-row-menu', {items: (await page.getByRole('menuitem').allInnerTexts()).map((s) => s.trim())});
            await loc(page, 'a report row\'s "…" button', reportRow.getByRole('button', {name: 'More Actions'}));
            const rep = await captureResponse(page, (r) => /\/api\/v1\/comments\/\d+\/reports\/\d+$/.test(r.url()) && r.request().method() === 'GET', () => page.getByRole('menuitem', {name: 'View Report'}).click(), 8_000);
            const rp = await readReportPanel(page);
            record('reports-report-panel', {fetch: rep.error ? rep : {url: rep.url, status: rep.status}, ...rp});
            await shot(page, 'reports-report-panel');
            await loc(page, 'the report panel', reportDialog(page));
            await loc(page, 'the report panel\'s "Delete Report" button', reportDialog(page).getByRole('button', {name: 'Delete Report'}));
            // Close the report panel: the address.
            await reportDialog(page).getByRole('button', {name: 'Close', exact: true}).click();
            await sleep(800);
            record('reports-report-panel-closed', {url: page.url(), dialogsVisible: await page.locator('[role="dialog"]:visible').count(), commentPanelStill: await commentDialog(page).isVisible().catch(() => null)});
            // The shared address with reportId and commentId opened directly.
            await gotoComments(page, app, ctx, `?reportId=${c.c1.reports[1]}&commentId=${c.c1.id}`);
            const rp2 = await readReportPanel(page);
            record('reports-report-direct-address', {url: rp2.url, title: rp2.title, dialogsOpen: rp2.dialogsOpen, screen: rp2.screen});
            // Delete Report from the report panel: Cancel, then Delete.
            await reportDialog(page).getByRole('button', {name: 'Delete Report'}).click();
            const dlg = await readConfirm(page, 'Delete Report');
            record('reports-delete-dialog', dlg);
            await shot(page, 'reports-delete-dialog');
            await confirmDialog(page, 'Delete Report').getByRole('button', {name: 'Cancel', exact: true}).click();
            await sleep(500);
            record('reports-delete-cancel', {dialogsVisible: await page.locator('[role="dialog"]:visible').count(), reportPanelStill: await reportDialog(page).isVisible().catch(() => null), url: page.url()});
            await reportDialog(page).getByRole('button', {name: 'Delete Report'}).click();
            await confirmDialog(page, 'Delete Report').waitFor({timeout: T});
            const reportsRefetch = page.waitForResponse(isReportsList, {timeout: 20_000}).catch((e) => ({error: String(e).slice(0, 100)}));
            const del = await captureResponse(page, (r) => /\/api\/v1\/comments\/\d+\/reports\/\d+$/.test(r.url()) && r.request().method() !== 'GET', () => confirmDialog(page, 'Delete Report').getByRole('button', {name: 'Delete', exact: true}).click());
            const toast = await toastInfo(page, REPORT_DELETED);
            const refetchRaw = await reportsRefetch;
            const refetch = refetchRaw && refetchRaw.error ? refetchRaw : (typeof refetchRaw.url === 'function' ? {url: refetchRaw.url(), status: refetchRaw.status()} : refetchRaw);
            await sleep(800);
            const afterDel = {
                request: {url: del.url, method: del.method, status: del.status},
                toast, refetch,
                url: page.url(),
                reportPanelVisible: await reportDialog(page).isVisible().catch(() => null),
                commentPanelVisible: await commentDialog(page).isVisible().catch(() => null),
                reportRows: [],
            };
            for (const r of await commentDialog(page).locator('table tbody tr').all()) afterDel.reportRows.push((await r.locator('td').allInnerTexts()).map((x) => x.trim()));
            afterDel.dialogText = (await commentDialog(page).innerText().catch(() => '')).trim();
            record('reports-deleted-from-panel', afterDel);
            await shot(page, 'reports-deleted-from-panel');
            // The second report from the row menu, in the comment panel that is still open.
            const row1 = commentDialog(page).locator('table tbody tr').filter({hasText: 'K3 report one by Rob.'});
            await row1.locator('button').first().click();
            await sleep(300);
            await page.getByRole('menuitem', {name: 'Delete Report'}).click();
            const dlg2 = await readConfirm(page, 'Delete Report');
            const reportsRefetch2 = page.waitForResponse(isReportsList, {timeout: 20_000}).catch((e) => ({error: String(e).slice(0, 100)}));
            const del2 = await captureResponse(page, (r) => /\/api\/v1\/comments\/\d+\/reports\/\d+$/.test(r.url()) && r.request().method() !== 'GET', () => confirmDialog(page, 'Delete Report').getByRole('button', {name: 'Delete', exact: true}).click());
            const toast2 = await toastInfo(page, REPORT_DELETED);
            const refetch2Raw = await reportsRefetch2;
            const refetch2 = refetch2Raw && refetch2Raw.error ? refetch2Raw : (typeof refetch2Raw.url === 'function' ? {url: refetch2Raw.url(), status: refetch2Raw.status()} : refetch2Raw);
            await sleep(800);
            record('reports-deleted-from-row', {dialog: dlg2, request: {url: del2.url, method: del2.method, status: del2.status}, toast: toast2, refetch: refetch2, url: page.url(), commentPanelVisible: await commentDialog(page).isVisible().catch(() => null), emptyText: await textOf(commentDialog(page).getByText(NO_REPORTS)), dialogText: (await commentDialog(page).innerText().catch(() => '')).trim(), note: await textOf(commentDialog(page).getByText(/This comment was approved on|Approving this comment/))});
            await shot(page, 'reports-deleted-from-row');
            // Close the comment panel: the Reported tab no longer lists c1; "All" reads "Approved".
            await commentDialog(page).getByRole('button', {name: 'Close', exact: true}).click();
            await sleep(800);
            await gotoComments(page, app, ctx, '#reported');
            const reportedAfter = await readPage(page);
            await clickTab(page, 'All');
            const c1All = await findRow(page, /K3 c1 approved and twice reported\./);
            record('reports-after-both-deleted', {reportedRows: reportedAfter.rows, reportedTbody: reportedAfter.tbodyText, c1UnderAll: {onPage: c1All.page, missing: !!c1All.missing, cells: await c1All.row.locator('td').allInnerTexts().catch(() => null)}});
            // c6: hide keeps the report; approve again.
            await gotoComments(page, app, ctx, `?commentId=${c.c6.id}`);
            const c6 = await readCommentPanel(page);
            const list6 = page.waitForResponse(isCommentsList, {timeout: 20_000}).catch((e) => ({error: String(e).slice(0, 100)}));
            const hide6 = await captureResponse(page, (r) => r.url().includes('/setApproval'), () => commentDialog(page).getByRole('button', {name: 'Hide Comment'}).click());
            const h6 = await afterClosingAction(page, UPDATED, list6);
            record('reports-c6-hidden', {before: {reports: c6.reportsTable.rows, note: c6.note}, request: {status: hide6.status, isReported: hide6.body && hide6.body.isReported}, toast: h6.toast});
            await gotoComments(page, app, ctx, `?commentId=${c.c6.id}`);
            const c6b = await readCommentPanel(page);
            await commentDialog(page).getByRole('button', {name: 'Close', exact: true}).click();
            await sleep(600);
            await gotoComments(page, app, ctx, '#reported');
            const rep6 = await readPage(page);
            await clickTab(page, 'All');
            const c6All = await findRow(page, /K3 c6 approved with one report\./);
            record('reports-c6-hidden-reports-kept', {reports: c6b.reportsTable.rows, note: c6b.note, buttons: c6b.buttons, reportedTabRows: rep6.rows.filter((r) => r[1] && r[1].includes('K3 c6')), c6UnderAll: {onPage: c6All.page, missing: !!c6All.missing, cells: await c6All.row.locator('td').allInnerTexts().catch(() => null)}});
            await gotoComments(page, app, ctx, `?commentId=${c.c6.id}`);
            await commentDialog(page).waitFor({timeout: T});
            await sleep(500);
            const list6b = page.waitForResponse(isCommentsList, {timeout: 20_000}).catch((e) => ({error: String(e).slice(0, 100)}));
            const app6 = await captureResponse(page, (r) => r.url().includes('/setApproval'), () => commentDialog(page).getByRole('button', {name: 'Approve Comment'}).click());
            await afterClosingAction(page, UPDATED, list6b);
            record('reports-c6-approved-again', {status: app6.status, isApproved: app6.body && app6.body.isApproved, isReported: app6.body && app6.body.isReported});
            // Sweep: "Delete Comment" on a reported comment (c6) from the row on the Reported tab, its reports going with it (Rule 14): the API's report list after.
            await gotoComments(page, app, ctx, '#reported');
            await openRowMenu(page, /K3 c6 approved with one report\./);
            await page.getByRole('menuitem', {name: 'Delete Comment'}).click();
            await confirmDialog(page, 'Delete Comment').waitFor({timeout: T});
            const list6c = page.waitForResponse(isCommentsList, {timeout: 20_000}).catch((e) => ({error: String(e).slice(0, 100)}));
            const del6 = await captureResponse(page, (r) => /\/api\/v1\/comments\/\d+$/.test(r.url()) && r.request().method() !== 'GET', () => confirmDialog(page, 'Delete Comment').getByRole('button', {name: 'Delete', exact: true}).click());
            const d6 = await afterClosingAction(page, DELETED, list6c);
            record('reports-c6-deleted-from-reported-tab', {request: {status: del6.status}, toast: d6.toast, rows: d6.rows, url: d6.url});
            // Its shared address afterwards (a deleted comment's number).
            const gone = await captureResponse(page, (r) => /\/api\/v1\/comments\/\d+$/.test(r.url()), () => gotoComments(page, app, ctx, `?commentId=${c.c6.id}`));
            await sleep(1200);
            record('reports-c6-deleted-address', {url: page.url(), fetch: gone.error ? gone : {status: gone.status, body: gone.body}, dialogsVisible: await page.locator('[role="dialog"]:visible').count(), screen: await screen(page)});
            st.mailAfterReports = await mailCounts(app, [`${t}rd1`, `${t}rd2`, `${t}rd3`, `${t}mgr`]);
            record('reports-mail-counts', {before: st.mailBefore, after: st.mailAfterReports});
            saveState(app, st);
            await signOut(page);
        });

        // ── editor: the manager-level Editor moderates too (OJS, OMP) ────────
        if (on('editor') && hasEditor) await step('editor', async () => {
            await signIn(page, `${t}ed`, {contextPath: ctx});
            await gotoComments(page, app, ctx);
            record('editor-page', {page: await readPage(page), screen: await screen(page)});
            await gotoComments(page, app, ctx, `?commentId=${c.c4.id}`);
            const p = await readCommentPanel(page);
            const listE = page.waitForResponse(isCommentsList, {timeout: 20_000}).catch((e) => ({error: String(e).slice(0, 100)}));
            const hideE = await captureResponse(page, (r) => r.url().includes('/setApproval'), () => commentDialog(page).getByRole('button', {name: 'Hide Comment'}).click());
            const he = await afterClosingAction(page, UPDATED, listE);
            record('editor-c4-hidden', {before: {note: p.note, buttons: p.buttons}, request: {status: hideE.status, isApproved: hideE.body && hideE.body.isApproved}, toast: he.toast});
            await gotoComments(page, app, ctx, `?commentId=${c.c4.id}`);
            const p2 = await readCommentPanel(page);
            const listE2 = page.waitForResponse(isCommentsList, {timeout: 20_000}).catch((e) => ({error: String(e).slice(0, 100)}));
            const appE = await captureResponse(page, (r) => r.url().includes('/setApproval'), () => commentDialog(page).getByRole('button', {name: 'Approve Comment'}).click());
            const ae = await afterClosingAction(page, UPDATED, listE2);
            record('editor-c4-approved', {hiddenNote: p2.note, hiddenButtons: p2.buttons, request: {status: appE.status, approvedByUserName: appE.body && appE.body.approvedByUserName}, toast: ae.toast});
            await gotoComments(page, app, ctx, `?commentId=${c.c4.id}`);
            const p3 = await readCommentPanel(page);
            record('editor-c4-note', {note: p3.note});
            await gotoComments(page, app, ctx);
            await openRowMenu(page, /K3 c9 a long one/);
            await page.getByRole('menuitem', {name: 'Delete Comment'}).click();
            await confirmDialog(page, 'Delete Comment').waitFor({timeout: T});
            const listE3 = page.waitForResponse(isCommentsList, {timeout: 20_000}).catch((e) => ({error: String(e).slice(0, 100)}));
            const delE = await captureResponse(page, (r) => /\/api\/v1\/comments\/\d+$/.test(r.url()) && r.request().method() !== 'GET', () => confirmDialog(page, 'Delete Comment').getByRole('button', {name: 'Delete', exact: true}).click());
            const de = await afterClosingAction(page, DELETED, listE3);
            record('editor-c9-deleted', {request: {status: delE.status}, toast: de.toast, rowStill: de.rows.some((r) => r[1] && r[1].includes('K3 c9'))});
            await signOut(page);
        });

        // ── leave: the page left with a panel open ───────────────────────────
        if (on('leave')) await step('leave', async () => {
            await signIn(page, `${t}mgr`, {contextPath: ctx});
            await gotoComments(page, app, ctx, `?commentId=${c.c3.id}`);
            await commentDialog(page).waitFor({timeout: T});
            await sleep(500);
            const dialogs = [];
            page.on('dialog', (d) => { dialogs.push({type: d.type(), message: d.message()}); d.dismiss().catch(() => {}); });
            // Leave through the side menu's "Settings" group's first entry, or by address.
            await page.goto(app.url(`/index.php/${ctx}/management/settings/website`));
            await sleep(1500);
            record('leave-with-panel-open', {browserDialogs: dialogs, url: page.url(), dialogsVisible: await page.locator('[role="dialog"]:visible').count()});
            // And back: the panel is not remembered.
            await page.goBack();
            await sleep(2500);
            await idle(page);
            record('leave-back', {url: page.url(), dialogsVisible: await page.locator('[role="dialog"]:visible').count(), panelVisible: await commentDialog(page).isVisible().catch(() => null)});
            await signOut(page);
        });
        // ── verify: the order across seconds, the "Status" cell of a hidden and reported comment ──
        if (on('verify')) await step('verify', async () => {
            // Three more comments, each in its own second (the seeded batch above shares one created_at second).
            st.s3 = await app.api.createSubmission({tag: `${t}s3`, context: t, submitter: `${t}au`, published: true, title: `K3 article three ${t}`,
                userComments: [{user: `${t}rd1`, text: 'K3 c11 approved and reported, to hide.', approved: true, reports: [{user: `${t}rd3`, note: 'K3 report on c11.'}]}]});
            await sleep(2500);
            st.s4 = await app.api.createSubmission({tag: `${t}s4`, context: t, submitter: `${t}au`, published: true, title: `K3 article four ${t}`,
                userComments: [{user: `${t}rd2`, text: 'K3 c12 pending, the second-newest.'}]});
            await sleep(2500);
            st.s5 = await app.api.createSubmission({tag: `${t}s5`, context: t, submitter: `${t}au`, published: true, title: `K3 article five ${t}`,
                userComments: [{user: `${t}rd3`, text: 'K3 c13 approved, the newest.', approved: true}]});
            st.c.c11 = st.s3.userComments[0]; st.c.c12 = st.s4.userComments[0]; st.c.c13 = st.s5.userComments[0];
            saveState(app, st);
            await signIn(page, `${t}mgr`, {contextPath: ctx});
            const landed = await captureResponse(page, isCommentsList, () => gotoComments(page, app, ctx));
            const all = await readPage(page);
            record('verify-order-all', {fetchBodyKeys: landed.body && Object.keys(landed.body), ids: idsOf(landed.body), createdAt: landed.body && Array.isArray(landed.body.items) ? landed.body.items.map((x) => [x.id, x.createdAt]) : null, rows: all.rows.map((r) => r[1]), showing: all.showingLine, seeded: {c11: st.c.c11.id, c12: st.c.c12.id, c13: st.c.c13.id}});
            await clickTab(page, 'Approved');
            record('verify-order-approved', {rows: (await readRows(page)).map((r) => r[1])});
            // The Reports table's order: c1's two reports were seeded in one second; a report added later on c11 is the newest (seeded above), so read c11's table after a second report... (one report only: its date's shape and the row).
            await gotoComments(page, app, ctx, `?commentId=${st.c.c11.id}`);
            const p11 = await readCommentPanel(page);
            const list11 = page.waitForResponse(isCommentsList, {timeout: 20_000}).catch((e) => ({error: String(e).slice(0, 100)}));
            const hide11 = await captureResponse(page, (r) => r.url().includes('/setApproval'), () => commentDialog(page).getByRole('button', {name: 'Hide Comment'}).click());
            await afterClosingAction(page, UPDATED, list11);
            await gotoComments(page, app, ctx);
            const c11All = await findRow(page, /K3 c11 approved and reported, to hide\./);
            const c11Cells = await c11All.row.locator('td').allInnerTexts().catch(() => null);
            await clickTab(page, 'Reported');
            const c11Rep = await findRow(page, /K3 c11 approved and reported, to hide\./);
            const c11RepCells = await c11Rep.row.locator('td').allInnerTexts().catch(() => null);
            await clickTab(page, 'Hidden/Needs Approval');
            const c11Hna = await findRow(page, /K3 c11 approved and reported, to hide\./);
            const c11HnaCells = await c11Hna.row.locator('td').allInnerTexts().catch(() => null);
            record('verify-c11-hidden-reported-status', {before: {note: p11.note, reports: p11.reportsTable.rows}, hide: {status: hide11.status, isReported: hide11.body && hide11.body.isReported}, all: {onPage: c11All.page, cells: c11Cells}, reported: {onPage: c11Rep.page, cells: c11RepCells}, hna: {onPage: c11Hna.page, cells: c11HnaCells}});
            // c1 (approved, its reports deleted): its "Status" under "All".
            await clickTab(page, 'All');
            const c1All = await findRow(page, /K3 c1 approved and twice reported\./);
            record('verify-c1-status-all', {onPage: c1All.page, missing: !!c1All.missing, cells: await c1All.row.locator('td').allInnerTexts().catch(() => null)});
            await signOut(page);
        });
        // ── extra: the report panel for a reporter with a verified iD and an affiliation ──
        if (on('extra')) await step('extra', async () => {
            st.s6 = await app.api.createSubmission({tag: `${t}s6`, context: t, submitter: `${t}au`, published: true, title: `K3 article six ${t}`,
                userComments: [{user: `${t}rd1`, text: 'K3 c14 approved, reported by the verified iD.', approved: true, reports: [{user: `${t}orcv`, note: 'K3 report by Vera.'}]}]});
            st.c.c14 = st.s6.userComments[0];
            saveState(app, st);
            await signIn(page, `${t}mgr`, {contextPath: ctx});
            await gotoComments(page, app, ctx, `?reportId=${st.c.c14.reports[0]}&commentId=${st.c.c14.id}`);
            const rp = await readReportPanel(page);
            const d = reportDialog(page);
            const orcidLink = d.locator('a[href*="orcid.org"]');
            record('extra-report-panel-orcid', {url: rp.url, title: rp.title, text: rp.text, buttons: rp.buttons, screen: rp.screen, orcid: (await orcidLink.count()) ? {href: await orcidLink.first().getAttribute('href'), text: (await orcidLink.first().innerText()).trim(), icon: await orcidLink.first().evaluate((a) => a.previousElementSibling ? a.previousElementSibling.outerHTML.replace(/\s+/g, ' ').slice(0, 200) : null)} : null});
            await shot(page, 'extra-report-panel-orcid');
            // The comment panel's Reports table for it: the reporter's name.
            await d.getByRole('button', {name: 'Close', exact: true}).click();
            await sleep(600);
            const cp = await readCommentPanel(page);
            record('extra-comment-panel-c14', {reports: cp.reportsTable.rows, url: cp.url});
            if (!fs.existsSync(path.join(outDir(), `page-check-1-${app.name}.json`))) {
                const check1 = await captureResponse(page, (r) => /\/api\/v1\/comments\/\d+$/.test(r.url()), () => gotoComments(page, app, ctx, `?commentId=${st.sb.userComments[0].id}`));
                await sleep(1500);
                record('page-check-1', {url: page.url(), status: check1.error ? check1 : check1.status, dialogsVisible: await page.locator('[role="dialog"]:visible').count()});
            }
            await signOut(page);
        });
    } finally {
        await close();
    }
});
