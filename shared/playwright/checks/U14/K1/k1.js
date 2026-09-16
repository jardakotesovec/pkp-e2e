// U14 claim check, chunk K1: the switch, the menu entry and who gets in, on all
// three apps. Spec: docs/specs/U14-reader-comments-and-moderation.md — Purpose
// and the absence paragraph (10–34), Actors preamble and rows 5–6 (37–47, 53–54),
// Fields "Comments" tab (67–71), Rules 1 and 2 (85–104), Rule 10's opening
// (194–200), Rule 17 (256–264), Settings bullet 1 (302–308), Cross-feature
// (332–338), register A4 / OMP1 / OPS1 (437–475); footnotes a, b, j, m, f-a4,
// f-omp1, f-ops1.
//
// Seeds its own scratch context with public comments OFF (the install default),
// a roster (two managers, an editor on OJS/OMP, a section editor, an author,
// two readers, a reviewer on OJS/OMP, an assistant) plus `admin` given a second
// role (Reader) so the manager role can later be ended on admin's own edit page
// (a user's last role cannot be removed there, and the own row menu offers no
// "Remove User"), and one published submission; on OJS with three seeded
// comments (pending, approved, approved+reported) so the "switched off with
// comments kept" state exists from the start. Then, per app:
//   off       the setting off: side menu, Comments page by address, the
//             "Comments" tab (box unticked; Save pressed untouched), the
//             landing page (no blocks)
//   on        tick without saving and leave the tab (dialogs on the way out);
//             tick and Save (the status beside the button and the selected
//             tabs polled for 8 s: the page reloads itself onto Appearance ›
//             Theme, no "Saved"); after the reload the menu entry, the landing
//             page signed in and signed out, the Comments page from the entry
//             and its tabs
//   control   another Website form's Save (Setup › Information / Lists) as the
//             control for the Comments tab's reload
//   levels    every roster level: where the login lands, the side menu, the
//             Comments page by address, Settings › Website by address, the
//             landing page; signed out: both addresses
//   rule1     the dashboard, the workflow page and its activity log, grepped
//             for "comment"
//   offagain  untick and Save: landing page (the writer too), menu, Comments
//             page by address; tick and Save again: the landing page as before
//   permit    admin unticks "Permit changes to Settings" on the Journal/Press
//             editor role (the manager row has no Edit; OPS has no such role);
//             the editor signs in: menu, Settings › Website, Comments page;
//             re-tick
//   admin     admin holding the manager role (menu, Comments page, tab), then
//             admin ends the manager role on their own edit page (Reader kept);
//             admin again: menu, Comments page by address and from the entry,
//             Settings › Website, the Comments tab's Save where it opens
//   admin2    a second scratch context where admin keeps Section editor /
//             Series editor / Moderator instead of Reader, the same reads
//
//   PROBE_FEATURE=U14 PROBE_AGENT=ccK1 node bin/probe.js <app|all> shared/playwright/checks/U14/K1/k1.js
//   PHASES=seed,off,on,control,levels,rule1,offagain,permit,admin,admin2 (default
//   all; later phases reuse k1-state-<app>.json from the seed phase)
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, signOut, screen, shot, record, loc, note, idle, tag, outDir} =
    require('../../../probe');

const ALL_PHASES = ['seed', 'off', 'on', 'control', 'levels', 'rule1', 'offagain', 'permit', 'admin', 'admin2'];
const PHASES = process.env.PHASES ? process.env.PHASES.split(',') : ALL_PHASES;
const on = (p) => PHASES.includes(p);
const log = (...a) => console.log('[k1]', new Date().toISOString().slice(11,19), ...a);
const stateFile = (app) => path.join(outDir(), `k1-state-${app.name}.json`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const T = 30_000;
const BOX_LABEL = 'What do you think about this publication? Type your comments here.';
const DENIED = /does not have access to this operation/i;

// ---------------------------------------------------------------------------
// Reading helpers

/** screen() guarded: a closing dialog can detach under the aria read; never let one read kill the phase. */
async function snap(page, name, extra = {}) {
    let s;
    try {
        s = await screen(page);
    } catch (e) {
        s = {url: page.url(), title: await page.title().catch(() => null), error: String(e.message).slice(0, 300)};
    }
    Object.assign(s, extra);
    record(name, s);
    await shot(page, name).catch(() => {});
    return s;
}

/**
 * The editorial side menu, a PrimeVue panelmenu: group headers are [role="button"][aria-controls]
 * (only the open one carries aria-expanded="true"; the others' regions are display:none), items are
 * treeitems. Read without clicking: every group with its items, and the Comments entry with its group.
 */
async function readNav(page) {
    const nav = page.getByRole('navigation', {name: 'Site Navigation'});
    if (!(await nav.count().catch(() => 0))) return {present: false, url: page.url(), groups: [], commentsEntry: [], contentGroup: 0, settingsGroup: 0};
    const groups = await nav.locator('[role="button"][aria-controls]').evaluateAll((els) => els.map((e) => {
        const region = document.getElementById(e.getAttribute('aria-controls') || '');
        const link = e.querySelector('a');
        return {
            label: e.getAttribute('aria-label') || e.textContent.replace(/\s+/g, ' ').trim(),
            href: link ? link.getAttribute('href') : null,
            expanded: e.getAttribute('aria-expanded'),
            items: region ? [...region.querySelectorAll('[role="treeitem"]')].map((li) => ({label: li.getAttribute('aria-label') || li.textContent.replace(/\s+/g, ' ').trim(), href: (li.querySelector('a') || {}).getAttribute ? li.querySelector('a').getAttribute('href') : null})) : [],
        };
    })).catch(() => []);
    const text = (await nav.innerText().catch(() => '')).replace(/\n+/g, ' | ');
    const commentsEntry = [];
    for (const g of groups) for (const it of g.items) if (/^Comments$/i.test(it.label)) commentsEntry.push({group: g.label, ...it});
    return {
        present: true,
        url: page.url(),
        text,
        groups,
        groupLabels: groups.map((g) => `${g.label}${g.items.length ? ' › ' + g.items.map((i) => i.label).join(', ') : ''}`),
        contentGroup: groups.filter((g) => /^Content$/i.test(g.label)).length,
        commentsEntry,
        settingsGroup: groups.filter((g) => /^Settings$/i.test(g.label)).length,
    };
}

/** An "Error" dialog the page opened on landing (a refused fetch of its own): its text, then "OK" so the page behind can be read. */
async function dismissErrorDialog(page) {
    const dlg = page.getByRole('dialog', {name: 'Error'});
    if (!(await dlg.count().catch(() => 0))) return null;
    const text = (await dlg.innerText().catch(() => '')).replace(/\n+/g, ' | ');
    await dlg.getByRole('button', {name: 'OK', exact: true}).click().catch(() => {});
    await dlg.waitFor({state: 'hidden', timeout: 5_000}).catch(() => {});
    return text;
}

/** The landing page's comments blocks, as counts. */
async function landingBlocks(page) {
    return {
        mainHeading: await page.getByText('Comments on this publication', {exact: true}).count(),
        publicCommentsRegion: await page.locator('#public-comments').count(),
        sidebarCommentsHeading: await page.locator('h2, h3, h4').filter({hasText: /^\s*Comments\s*$/}).count(),
        allCommentsLink: await page.getByText(/All Comments \(\d+\)/).count(),
        allCommentsText: await page.getByText(/All Comments \(\d+\)/).allInnerTexts().catch(() => []),
        loginToComment: await page.getByText('Log in to comment', {exact: true}).count(),
        commentBox: await page.getByRole('textbox', {name: BOX_LABEL}).count(),
        submitButton: await page.getByRole('button', {name: 'Submit', exact: true}).count(),
        versionHeadings: await page.locator('#public-comments button, #public-comments h3, #public-comments h4').allInnerTexts().catch(() => []),
        commentsShown: await page.locator('#public-comments article').allInnerTexts().catch(() => []),
        anyCommentWord: (await page.locator('body').innerText().catch(() => '')).match(/[^\n]*comment[^\n]*/gi) || [],
    };
}

async function readLanding(page, app, st, name) {
    const resp = await page.goto(app.url(st.landing)).catch(() => null);
    await idle(page);
    const blocks = await landingBlocks(page);
    const s = await snap(page, name, {httpStatus: resp ? resp.status() : null, blocks});
    log(name, JSON.stringify({status: s.httpStatus, ...blocks, commentsShown: blocks.commentsShown.length, anyCommentWord: blocks.anyCommentWord.length}));
    return s;
}

/** The Comments page by address: status, heading, tabs and (optionally) each tab's table. */
async function readCommentsPage(page, app, st, name, {tabs = false} = {}) {
    const resp = await page.goto(app.url(st.commentsPage)).catch(() => null);
    await idle(page);
    const tableSettled = async () => { await page.locator('[role="tabpanel"]:visible tbody tr').filter({hasText: /^\s*Loading\s*$/}).first().waitFor({state: 'hidden', timeout: 15_000}).catch(() => {}); await idle(page); };
    await tableSettled();
    const extra = {
        httpStatus: resp ? resp.status() : null,
        errorDialog: await dismissErrorDialog(page),
        headings: await page.locator('main h1, main h2, h1').allInnerTexts().catch(() => []),
        tabs: await page.getByRole('tab').allInnerTexts().catch(() => []),
        denied: DENIED.test(await page.locator('body').innerText().catch(() => '')),
        nav: await readNav(page),
    };
    if (tabs && extra.tabs.length) {
        extra.perTab = {};
        for (const t of extra.tabs) {
            await page.getByRole('tab', {name: t, exact: true}).click().catch(() => {});
            await tableSettled();
            const panel = page.locator('[role="tabpanel"]:visible').last();
            extra.perTab[t] = {
                url: page.url(),
                rows: await panel.locator('table tbody tr').evaluateAll((trs) => trs.map((tr) => tr.innerText.replace(/\s+/g, ' ').trim().slice(0, 200))).catch(() => []),
                noItems: await panel.getByText('No Items', {exact: true}).count(),
                panelText: (await panel.innerText().catch(() => '')).replace(/\n+/g, ' | ').slice(0, 600),
            };
        }
        await page.getByRole('tab', {name: extra.tabs[0], exact: true}).click().catch(() => {});
        await tableSettled();
    }
    const s = await snap(page, name, extra);
    log(name, JSON.stringify({status: extra.httpStatus, errorDialog: extra.errorDialog, denied: extra.denied, headings: extra.headings, tabs: extra.tabs, comments: extra.nav.commentsEntry.length, perTab: extra.perTab && Object.fromEntries(Object.entries(extra.perTab).map(([k, v]) => [k, {rows: v.rows.length, noItems: v.noItems}]))}));
    return s;
}

/** Settings › Website by address; when it opens, the Content tab and its Comments side tab. */
async function readWebsiteCommentsTab(page, app, st, name) {
    const resp = await page.goto(app.url(st.website)).catch(() => null);
    await idle(page);
    const extra = {httpStatus: resp ? resp.status() : null, errorDialog: await dismissErrorDialog(page)};
    extra.denied = DENIED.test(await page.locator('body').innerText().catch(() => ''));
    extra.topTabs = await page.getByRole('tab').allInnerTexts().catch(() => []);
    const contentTab = page.getByRole('tab', {name: 'Content', exact: true});
    if (await contentTab.count()) {
        await contentTab.click();
        await idle(page);
        extra.sideTabs = await page.getByRole('tabpanel', {name: 'Content'}).getByRole('tab').allInnerTexts().catch(() => []);
        const commentsTab = page.getByRole('tab', {name: 'Comments', exact: true});
        extra.commentsTab = await commentsTab.count();
        if (extra.commentsTab) {
            await commentsTab.click();
            await idle(page);
            const box = page.getByRole('checkbox', {name: 'Enable Public Comments'});
            extra.box = (await box.count()) ? {checked: await box.isChecked(), enabled: await box.isEnabled()} : 'absent';
            const form = page.locator('form').filter({has: box});
            const save = form.getByRole('button', {name: 'Save', exact: true});
            extra.save = (await save.count()) ? {enabled: await save.isEnabled(), text: await save.innerText()} : 'absent';
            extra.formText = (await form.innerText().catch(() => '')).replace(/\n+/g, ' | ');
            extra.formFields = await form.locator('input, select, textarea').evaluateAll((els) => els.map((e) => ({type: e.type, name: e.name, checked: e.checked}))).catch(() => []);
            extra.panelHeadings = await page.locator('[role="tabpanel"]:visible h1, [role="tabpanel"]:visible h2, [role="tabpanel"]:visible h3, [role="tabpanel"]:visible legend').allInnerTexts().catch(() => []);
        }
    }
    const s = await snap(page, name, extra);
    log(name, JSON.stringify({status: extra.httpStatus, errorDialog: extra.errorDialog, denied: extra.denied, topTabs: extra.topTabs, sideTabs: extra.sideTabs, box: extra.box, save: extra.save}));
    return s;
}

/** Tick or untick "Enable Public Comments" and Save; what shows beside the button and on the page. */
async function saveCommentsTab(page, checked, name) {
    const box = page.getByRole('checkbox', {name: 'Enable Public Comments'});
    const before = await box.isChecked();
    if (before !== checked) await box.setChecked(checked);
    const form = page.locator('form').filter({has: box});
    const save = form.getByRole('button', {name: 'Save', exact: true});
    const formButtons = () => form.locator('button').evaluateAll((els) => els.map((e) => ({text: e.innerText.trim(), disabled: e.disabled, visible: e.offsetParent !== null}))).catch(() => 'err');
    const out = {boxBefore: before, boxSet: checked, saveEnabledBefore: await save.isEnabled({timeout: 10_000}).catch((e) => 'err ' + e.message.slice(0, 80)), statuses: [], notices: [], requests: []};
    page.on('response', (r) => {
        if (/\/api\/v1\/contexts\//.test(r.url())) out.requests.push({method: r.request().method(), url: r.url(), status: r.status(), postData: (r.request().postData() || '').slice(0, 200)});
    });
    const selectedTabs = () => page.locator('[role="tab"][aria-selected="true"]').allInnerTexts().catch(() => []);
    out.selectedTabsBefore = await selectedTabs();
    await save.click();
    const seen = new Set();
    const start = Date.now();
    out.timeline = [];
    while (Date.now() - start < 8_000) {
        const statuses = (await page.locator('[role="status"], .pkpFormPage__status').allInnerTexts().catch(() => [])).map((t) => t.trim()).filter(Boolean);
        for (const t of statuses) seen.add(t);
        for (const t of await page.locator('[role="alert"], .pkpNotification, .app__notifications *').allInnerTexts().catch(() => [])) if (t.trim()) out.notices.push(t.trim());
        out.timeline.push({ms: Date.now() - start, statuses, selectedTabs: await selectedTabs(), boxVisible: await box.isVisible().catch(() => null)});
        if (seen.has('Saved') && out.timeline.length > 6) break;
        await sleep(400);
    }
    out.statuses = [...seen];
    out.notices = [...new Set(out.notices)];
    // After the save the form may re-render: read what is there, bounded, never throw.
    out.afterSave = {
        saveCount: await save.count(),
        boxCount: await box.count(),
        formCount: await form.count(),
        formButtons: await formButtons(),
        boxChecked: (await box.count()) ? await box.isChecked() : null,
        panelAria: await page.locator('[role="tabpanel"]:visible').last().ariaSnapshot({timeout: 5_000}).catch((e) => 'err ' + e.message.slice(0, 80)),
        allCheckboxes: await page.locator('input[type="checkbox"]').evaluateAll((els) => els.map((e) => ({name: e.name, checked: e.checked, label: ((e.labels && e.labels[0]) || {}).innerText}))).catch(() => 'err'),
    };
    await sleep(5_500);
    out.afterSave.statusesAfter6s = await form.locator('[role="status"], .pkpFormPage__status').allInnerTexts().catch(() => []);
    out.afterSave.saveCountAfter6s = await save.count();
    await idle(page);
    out.navAfterSaveNoReload = await readNav(page);
    record(name, out);
    log(name, JSON.stringify({statuses: out.statuses, notices: out.notices, requests: out.requests, afterSave: {saveCount: out.afterSave.saveCount, boxCount: out.afterSave.boxCount, formButtons: out.afterSave.formButtons, boxChecked: out.afterSave.boxChecked, statusesAfter6s: out.afterSave.statusesAfter6s, saveCountAfter6s: out.afterSave.saveCountAfter6s}, comments: out.navAfterSaveNoReload.commentsEntry.length}));
    return out;
}

async function dashboardLanding(page, app, st, name) {
    const resp = await page.goto(app.url(`/index.php/${st.ctx}/submissions`)).catch(() => null);
    await idle(page);
    const errorDialog = await dismissErrorDialog(page);
    const nav = await readNav(page);
    const s = await snap(page, name, {httpStatus: resp ? resp.status() : null, errorDialog, nav});
    log(name, JSON.stringify({url: s.url, status: s.httpStatus, errorDialog, groups: nav.groupLabels, comments: nav.commentsEntry.map((c) => c.group + ' › ' + c.label)}));
    return s;
}

/** On the context's Users tab, admin's own row › Edit › the manager role's "Remove Role" (a user's last role cannot be removed there; "Remove User" is not offered on one's own row). */
async function endOwnManagerRole(page, app, ctx, prefix) {
    const rem = {};
    await page.goto(app.url(`/index.php/${ctx}/management/settings/access`));
    await idle(page);
    rem.errorDialog = await dismissErrorDialog(page);
    const table = page.locator('table').filter({hasText: /\badmin\b/}).first();
    await table.waitFor({state: 'visible', timeout: T}).catch(() => {});
    const adminRow = table.locator('tr').filter({hasText: /\badmin\b/}).first();
    rem.rowBefore = (await adminRow.innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 300);
    await adminRow.locator('button').last().click();
    await idle(page);
    rem.menu = await page.getByRole('menuitem').allInnerTexts().catch(() => []);
    await page.getByRole('menuitem', {name: /^Edit$/}).first().click().catch(() => {});
    await page.waitForURL(/management\/settings\/user\/\d+/, {timeout: T}).catch(() => {});
    await idle(page);
    await page.getByRole('button', {name: /Remove Role/i}).first().waitFor({state: 'visible', timeout: 15_000}).catch(() => {});
    await snap(page, `${prefix}-edit-page`);
    rem.editUrl = page.url();
    rem.roleRows = await page.locator('tr').filter({has: page.getByRole('button', {name: /Remove Role/i})}).evaluateAll((els) => els.map((e) => e.innerText.replace(/\s+/g, ' ').trim())).catch(() => []);
    const roleRow = page.locator('tr').filter({hasText: /manager/i}).filter({has: page.getByRole('button', {name: /Remove Role/i})}).first();
    if (await roleRow.count()) {
        await roleRow.getByRole('button', {name: /Remove Role/i}).click();
        await idle(page);
        const dlg = page.locator('[role="dialog"]:visible').filter({hasText: /Remove Role/i}).last();
        await dlg.waitFor({state: 'visible', timeout: 15_000}).catch(() => {});
        rem.removeRoleDialog = (await dlg.innerText().catch(() => '')).slice(0, 400);
        const resp = page.waitForResponse((r) => r.request().method() === 'POST' && /\/api\/v1\//.test(r.url()), {timeout: 15_000}).catch(() => null);
        await dlg.getByRole('button', {name: /^Remove Role$/i}).click().catch(() => {});
        const rr = await resp;
        rem.removeRoleResponse = rr ? {status: rr.status(), url: rr.url().replace(/^.*\/index\.php/, '')} : 'no request';
        await idle(page);
        await sleep(1500);
        rem.afterRemoveRoleNotices = await page.locator('[role="alert"], .pkpNotification').allInnerTexts().catch(() => []);
        rem.roleRowsAfter = await page.locator('tr').filter({has: page.getByRole('button', {name: /Remove Role/i})}).evaluateAll((els) => els.map((e) => e.innerText.replace(/\s+/g, ' ').trim())).catch(() => []);
        await snap(page, `${prefix}-edit-page-after`);
    }
    record(`${prefix}-role-removal`, rem);
    return rem;
}

/** Admin signed in again without the manager role: where the login lands, the side menu, the Comments entry pressed, the Comments page and Settings › Website by address, the Comments tab's Save where it opens, the landing page. */
async function readAdminWithoutManager(page, app, st, prefix) {
    await signIn(page, 'admin', {contextPath: st.ctx});
    await snap(page, `${prefix}-login-landing`, {errorDialog: await dismissErrorDialog(page), nav: await readNav(page)});
    await dashboardLanding(page, app, st, `${prefix}-dashboard`);
    const pressed = {entries: 0};
    const contentHeader = page.getByRole('navigation', {name: 'Site Navigation'}).locator('[role="button"][aria-label="Content"]');
    pressed.contentGroup = await contentHeader.count();
    if (pressed.contentGroup) { await contentHeader.first().click().catch(() => {}); await sleep(400); }
    const entry = page.getByRole('navigation', {name: 'Site Navigation'}).getByRole('link', {name: 'Comments', exact: true});
    pressed.entries = await entry.count();
    if (pressed.entries) {
        await entry.first().click();
        await idle(page);
        pressed.url = page.url();
        pressed.errorDialog = await dismissErrorDialog(page);
        pressed.denied = DENIED.test(await page.locator('body').innerText().catch(() => ''));
        pressed.headings = await page.locator('main h1, h1').allInnerTexts().catch(() => []);
        pressed.tabs = await page.getByRole('tab').allInnerTexts().catch(() => []);
        await snap(page, `${prefix}-commentspage-from-menu`);
    }
    record(`${prefix}-menu-entry-pressed`, pressed);
    log(`${prefix}-menu-entry-pressed`, JSON.stringify(pressed));
    await readCommentsPage(page, app, st, `${prefix}-commentspage`, {tabs: true});
    await readWebsiteCommentsTab(page, app, st, `${prefix}-website`);
    if (await page.getByRole('checkbox', {name: 'Enable Public Comments'}).count()) {
        const box = page.getByRole('checkbox', {name: 'Enable Public Comments'});
        const was = await box.isChecked();
        await saveCommentsTab(page, !was, `${prefix}-save-flip`);
        await dashboardLanding(page, app, st, `${prefix}-dashboard-flipped`);
        await readWebsiteCommentsTab(page, app, st, `${prefix}-website-flipped`);
        await saveCommentsTab(page, was, `${prefix}-save-restore`);
        await dashboardLanding(page, app, st, `${prefix}-dashboard-restored`);
    }
    await readLanding(page, app, st, `${prefix}-landing`);
    await signOut(page);
}

// ---------------------------------------------------------------------------

forEachApp(async (app) => {
    const isOjs = app.name === 'ojs', isOmp = app.name === 'omp', isOps = app.name === 'ops';
    await app.api.bootstrapProbe(app.contextPath);
    let st;
    if (on('seed')) {
        const ctx = tag('u14k1');
        const users = [
            {username: `${ctx}mgr`, roles: ['manager'], givenName: 'Mona', familyName: 'Manager'},
            {username: `${ctx}mgr2`, roles: ['manager'], givenName: 'Milo', familyName: 'Managertwo'},
            {username: `${ctx}se`, roles: ['sectionEditor'], givenName: 'Sam', familyName: 'Subeditor', ...(isOmp ? {} : {sections: [isOjs ? 'ART' : 'PRE']})},
            {username: `${ctx}au`, roles: ['author'], givenName: 'Ada', familyName: 'Author'},
            {username: `${ctx}rd`, roles: ['reader'], givenName: 'Rita', familyName: 'Reader'},
            {username: `${ctx}rd2`, roles: ['reader'], givenName: 'Rob', familyName: 'Readertwo'},
            {username: `${ctx}as`, roles: [isOps ? 'editorialBoardMember' : 'copyeditor'], givenName: 'Asa', familyName: 'Assistant'},
            // admin is auto-enrolled as a manager; a second role lets the manager role be ended on the edit page (rr3, 2026-09-09).
            {username: 'admin', roles: ['reader'], givenName: 'Site', familyName: 'Admin'},
        ];
        if (!isOps) {
            users.push({username: `${ctx}ed`, roles: ['editor'], givenName: 'Eve', familyName: 'Editor'});
            users.push({username: `${ctx}rv`, roles: ['externalReviewer'], givenName: 'Rex', familyName: 'Reviewer'});
        }
        const context = await app.api.createContext({tag: ctx, users});
        const sub = await app.api.createSubmission({
            tag: `${ctx}s`, context: ctx, submitter: `${ctx}au`, published: true, title: `K1 article ${ctx}`,
            ...(isOjs ? {userComments: [
                {user: `${ctx}rd`, text: `K1 pending comment ${ctx}.`},
                {user: `${ctx}rd`, text: `K1 approved comment ${ctx}.`, approved: true},
                {user: `${ctx}rd2`, text: `K1 reported comment ${ctx}.`, approved: true, reports: [{user: `${ctx}rd`, note: `K1 report note ${ctx}.`}]},
            ]} : {}),
        });
        st = {
            ctx, context, sub, submissionId: sub.submissionId,
            landing: {ojs: `/index.php/${ctx}/article/view/${sub.submissionId}`, omp: `/index.php/${ctx}/catalog/book/${sub.submissionId}`, ops: `/index.php/${ctx}/preprint/view/${sub.submissionId}`}[app.name],
            commentsPage: `/index.php/${ctx}/management/settings/userComments`,
            website: `/index.php/${ctx}/management/settings/website`,
        };
        fs.writeFileSync(stateFile(app), JSON.stringify(st, null, 2));
        record('seed', st);
        log('seeded', ctx, 'submission', sub.submissionId, 'comments', (sub.userComments || []).length);
    } else {
        st = JSON.parse(fs.readFileSync(stateFile(app), 'utf8'));
    }
    const ctx = st.ctx;
    const U = {mgr: `${ctx}mgr`, mgr2: `${ctx}mgr2`, ed: `${ctx}ed`, se: `${ctx}se`, au: `${ctx}au`, rd: `${ctx}rd`, rd2: `${ctx}rd2`, rv: `${ctx}rv`, as: `${ctx}as`};

    const {page, close} = await launch(app);
    const browserDialogs = [];
    page.on('framenavigated', (f) => { if (f === page.mainFrame()) log('navigated', f.url()); });
    page.on('request', (r) => { if (r.method() === 'POST' && /\/api\/v1\//.test(r.url())) log('POST', r.url().replace(/^.*\/index\.php/, ''), (r.postData() || '').slice(0, 120)); });
    page.on('dialog', async (d) => { browserDialogs.push({type: d.type(), message: d.message(), url: page.url()}); await d.dismiss().catch(() => {}); });
    try {
        // ── off: the seeded state (setting off, comments kept on OJS) ─────────
        if (on('off')) {
            await signIn(page, U.mgr, {contextPath: ctx});
            await dashboardLanding(page, app, st, 'off-mgr-dashboard');
            await readCommentsPage(page, app, st, 'off-mgr-commentspage', {tabs: true});
            await readWebsiteCommentsTab(page, app, st, 'off-mgr-website');
            await loc(page, 'the Comments side tab\'s "Enable Public Comments" box', page.getByRole('checkbox', {name: 'Enable Public Comments'}));
            // Rule 1: "off on a fresh journal" is the box; press Save with nothing changed (sweep).
            const box = page.getByRole('checkbox', {name: 'Enable Public Comments'});
            const form = page.locator('form').filter({has: box});
            const save = form.getByRole('button', {name: 'Save', exact: true});
            const untouched = {saveEnabled: await save.isEnabled()};
            if (untouched.saveEnabled) {
                await save.click();
                await sleep(2500);
                untouched.statuses = await form.locator('[role="status"], .pkpFormPage__status').allInnerTexts().catch(() => []);
            }
            record('off-mgr-save-untouched', untouched);
            log('off-mgr-save-untouched', JSON.stringify(untouched));
            await readLanding(page, app, st, 'off-mgr-landing');
            await signOut(page);
            await readLanding(page, app, st, 'off-anon-landing');
        }

        // ── on: leave the tab with an unsaved tick, then tick and Save ────────
        if (on('on')) {
            await signIn(page, U.mgr, {contextPath: ctx});
            await readWebsiteCommentsTab(page, app, st, 'on-mgr-website-before');
            const box = page.getByRole('checkbox', {name: 'Enable Public Comments'});
            await box.setChecked(true);
            const leave = {browserDialogs: [], steps: []};
            // to another side tab of Content and back
            const sideTabs = (await page.getByRole('tabpanel', {name: 'Content'}).getByRole('tab').allInnerTexts().catch(() => [])).filter((t) => !/^Comments$/.test(t));
            const otherSide = sideTabs[0];
            if (otherSide) {
                await page.getByRole('tab', {name: otherSide, exact: true}).click().catch(() => {});
                await idle(page);
                leave.steps.push({to: otherSide, url: page.url(), dialogs: await page.locator('[role="dialog"]:visible').allInnerTexts().catch(() => [])});
                await page.getByRole('tab', {name: 'Comments', exact: true}).click().catch(() => {});
                await idle(page);
                leave.steps.push({backToComments: true, boxChecked: await box.isChecked()});
            }
            // to another top tab and back
            const topTab = page.getByRole('tab', {name: /^(Appearance|Setup)$/}).first();
            if (await topTab.count()) {
                await topTab.click().catch(() => {});
                await idle(page);
                leave.steps.push({to: await topTab.innerText().catch(() => 'top tab'), url: page.url(), dialogs: await page.locator('[role="dialog"]:visible').allInnerTexts().catch(() => [])});
                await page.getByRole('tab', {name: 'Content', exact: true}).click().catch(() => {});
                await idle(page);
                await page.getByRole('tab', {name: 'Comments', exact: true}).click().catch(() => {});
                await idle(page);
                leave.steps.push({backToComments: true, boxChecked: await box.isChecked()});
            }
            // away from the page with the tick unsaved
            const dialogsBefore = browserDialogs.length;
            await page.goto(app.url(`/index.php/${ctx}/submissions`)).catch(() => {});
            await idle(page);
            leave.steps.push({navigatedAway: page.url(), browserDialogs: browserDialogs.slice(dialogsBefore)});
            await readWebsiteCommentsTab(page, app, st, 'on-mgr-website-after-leaving');
            leave.boxAfterReturn = await page.getByRole('checkbox', {name: 'Enable Public Comments'}).isChecked();
            record('on-mgr-leave-unsaved', leave);
            log('on-mgr-leave-unsaved', JSON.stringify(leave));

            // tick and Save
            await saveCommentsTab(page, true, 'on-mgr-save');
            await snap(page, 'on-mgr-website-after-save');
            await loc(page, 'the Comments form\'s "Saved" status', page.locator('[role="status"]:has-text("Saved")'));
            // reload: the entry and the tab
            await readWebsiteCommentsTab(page, app, st, 'on-mgr-website-reloaded');
            await dashboardLanding(page, app, st, 'on-mgr-dashboard');
            // the menu entry pressed
            const pressed = {entries: 0};
            const contentHeader = page.getByRole('navigation', {name: 'Site Navigation'}).locator('[role="button"][aria-label="Content"]');
            pressed.contentGroup = await contentHeader.count();
            if (pressed.contentGroup) { await contentHeader.first().click().catch(() => {}); await sleep(400); }
            const entry = page.getByRole('navigation', {name: 'Site Navigation'}).getByRole('link', {name: 'Comments', exact: true});
            pressed.entries = await entry.count();
            pressed.contentItemsShown = await page.getByRole('navigation', {name: 'Site Navigation'}).locator('[role="treeitem"]:visible').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label'))).catch(() => []);
            if (pressed.entries) {
                await loc(page, 'the side menu\'s Content › Comments entry (the Content group opened first)', entry);
                await entry.first().click();
                await idle(page);
                pressed.url = page.url();
                pressed.headings = await page.locator('main h1, h1').allInnerTexts().catch(() => []);
                pressed.tabs = await page.getByRole('tab').allInnerTexts().catch(() => []);
                await snap(page, 'on-mgr-commentspage-from-menu');
            }
            record('on-mgr-menu-entry-pressed', pressed);
            log('on-mgr-menu-entry-pressed', JSON.stringify(pressed));
            await readCommentsPage(page, app, st, 'on-mgr-commentspage', {tabs: true});
            await readLanding(page, app, st, 'on-mgr-landing');
            await signOut(page);
            await readLanding(page, app, st, 'on-anon-landing');
        }

        // ── control: another Website form's Save (does the page jump tabs there too?) ──
        if (on('control')) {
            await signIn(page, U.mgr, {contextPath: ctx});
            await page.goto(app.url(st.website));
            await idle(page);
            const out = {};
            const setupTab = page.getByRole('tab', {name: 'Setup', exact: true}).first();
            await setupTab.click();
            await idle(page);
            const panel = page.getByRole('tabpanel', {name: 'Setup'}).first();
            out.sideTabs = await panel.getByRole('tab').allInnerTexts().catch(() => []);
            const side = panel.getByRole('tab').filter({hasText: /^\s*(Information|Lists)\s*$/}).first();
            if (await side.count()) { await side.click(); await idle(page); }
            const selectedTabs = () => page.locator('[role="tab"][aria-selected="true"]').allInnerTexts().catch(() => []);
            out.selectedTabsBefore = await selectedTabs();
            const form = page.locator('[role="tabpanel"]:visible form:visible').first();
            const save = form.getByRole('button', {name: 'Save', exact: true}).first();
            out.saveCount = await save.count();
            if (out.saveCount) {
                out.formFirstLine = (await form.innerText().catch(() => '')).split('\n')[0];
                page.on('response', (r) => { if (/\/api\/v1\/contexts\//.test(r.url())) (out.requests = out.requests || []).push({method: r.request().method(), status: r.status(), postData: (r.request().postData() || '').slice(0, 120)}); });
                await save.click();
                out.timeline = [];
                const start = Date.now();
                while (Date.now() - start < 7_000) {
                    out.timeline.push({ms: Date.now() - start, statuses: (await page.locator('[role="status"], .pkpFormPage__status').allInnerTexts().catch(() => [])).map((t) => t.trim()).filter(Boolean), selectedTabs: await selectedTabs(), saveVisible: await save.isVisible().catch(() => null)});
                    await sleep(500);
                }
                await snap(page, 'control-mgr-other-form-after-save');
            }
            record('control-mgr-other-form-save', out);
            log('control-mgr-other-form-save', JSON.stringify({sideTabs: out.sideTabs, before: out.selectedTabsBefore, form: out.formFirstLine, requests: out.requests, last: out.timeline && out.timeline[out.timeline.length - 1], statuses: out.timeline && [...new Set(out.timeline.flatMap((t) => t.statuses))]}));
            await signOut(page);
        }

        // ── levels: every roster level, setting on ────────────────────────────
        if (on('levels')) {
            const levels = [['ed', 'editor'], ['se', 'sectioneditor'], ['au', 'author'], ['rd', 'reader'], ['rv', 'reviewer'], ['as', 'assistant']].filter(([k]) => !(isOps && (k === 'ed' || k === 'rv')));
            for (const [k, label] of levels) {
                await signIn(page, U[k], {contextPath: ctx});
                const landed = await snap(page, `lvl-${label}-login-landing`, {nav: await readNav(page)});
                log(`lvl-${label}-login-landing`, landed.url, 'comments entry', landed.nav.commentsEntry.length);
                await dashboardLanding(page, app, st, `lvl-${label}-dashboard`);
                await readCommentsPage(page, app, st, `lvl-${label}-commentspage`);
                await readWebsiteCommentsTab(page, app, st, `lvl-${label}-website`);
                await readLanding(page, app, st, `lvl-${label}-landing`);
                await signOut(page);
            }
            // signed out: the Comments page and the Website settings by address
            await readCommentsPage(page, app, st, 'lvl-anon-commentspage');
            await readWebsiteCommentsTab(page, app, st, 'lvl-anon-website');
        }

        // ── rule1: nothing about comments on the workflow, the dashboard, the activity log ──
        if (on('rule1')) {
            await signIn(page, U.mgr, {contextPath: ctx});
            const r1 = {};
            await page.goto(app.url(`/index.php/${ctx}/dashboard/editorial?currentViewId=active`)).catch(() => {});
            await idle(page);
            const dash = await snap(page, 'rule1-mgr-dashboard');
            r1.dashboardCommentLines = ((dash.text && dash.text.main) || '').match(/[^\n]*comment[^\n]*/gi) || [];
            await page.goto(app.url(`/index.php/${ctx}/dashboard/editorial?workflowSubmissionId=${st.submissionId}`)).catch(() => {});
            await idle(page);
            const wf = page.locator('[role="dialog"]:visible').first();
            await wf.getByRole('link', {name: /^(Title & Abstract|Publication|Preprint|Submission|Production)$/}).first().waitFor({state: 'visible', timeout: T}).catch(() => {});
            await idle(page);
            const w = await snap(page, 'rule1-mgr-workflow');
            r1.workflowMenu = await wf.getByRole('navigation').getByRole('link').allInnerTexts().catch(() => []);
            r1.workflowCommentLines = ((w.text && w.text.dialog) || '').match(/[^\n]*comment[^\n]*/gi) || [];
            const actLog = wf.getByRole('button', {name: /Activity Log/}).or(wf.getByRole('link', {name: /Activity Log/})).or(page.getByRole('button', {name: /Activity Log/}));
            r1.activityLogControls = await actLog.count();
            if (r1.activityLogControls) {
                await actLog.first().click().catch(() => {});
                await idle(page);
                const a = await snap(page, 'rule1-mgr-activitylog');
                r1.activityLogCommentLines = ((a.text && a.text.dialog) || (a.text && a.text.main) || '').match(/[^\n]*comment[^\n]*/gi) || [];
            }
            record('rule1-mgr', r1);
            log('rule1-mgr', JSON.stringify(r1));
            await signOut(page);
        }

        // ── offagain: untick and Save; then tick and Save again ───────────────
        if (on('offagain')) {
            await signIn(page, U.mgr, {contextPath: ctx});
            await readWebsiteCommentsTab(page, app, st, 'offagain-mgr-website-before');
            await saveCommentsTab(page, false, 'offagain-mgr-save-off');
            await readLanding(page, app, st, 'offagain-mgr-landing');
            await dashboardLanding(page, app, st, 'offagain-mgr-dashboard');
            await readCommentsPage(page, app, st, 'offagain-mgr-commentspage', {tabs: true});
            await signOut(page);
            await readLanding(page, app, st, 'offagain-anon-landing');
            await readCommentsPage(page, app, st, 'offagain-anon-commentspage');
            // the writer of the pending comment, setting off (OJS: the landing page offers nothing?)
            if (isOjs) {
                await signIn(page, U.rd, {contextPath: ctx});
                await readLanding(page, app, st, 'offagain-rd-landing');
                await signOut(page);
            }
            await signIn(page, U.mgr, {contextPath: ctx});
            await readWebsiteCommentsTab(page, app, st, 'onagain-mgr-website-before');
            await saveCommentsTab(page, true, 'onagain-mgr-save-on');
            await readLanding(page, app, st, 'onagain-mgr-landing');
            await dashboardLanding(page, app, st, 'onagain-mgr-dashboard');
            await signOut(page);
            await readLanding(page, app, st, 'onagain-anon-landing');
            if (isOjs) {
                await signIn(page, U.rd, {contextPath: ctx});
                await readLanding(page, app, st, 'onagain-rd-landing');
                await signOut(page);
            }
        }

        // ── permit: the manager role without "Permit changes to Settings" ─────
        if (on('permit')) {
            const setPermit = async (wanted, name) => {
                await signIn(page, 'admin', {contextPath: ctx});
                await page.goto(app.url(`/index.php/${ctx}/management/settings/access`));
                await idle(page);
                const rolesTab = page.getByRole('tab', {name: 'Roles', exact: true}).or(page.locator('#roles-button')).first();
                if (await rolesTab.count()) await rolesTab.click();
                await idle(page);
                const out = {wanted, rows: await page.locator('tr.gridRow').evaluateAll((els) => els.map((e) => e.innerText.replace(/\s+/g, ' ').trim()))};
                // The "Journal manager" row carries no controls arrow (no Edit); the manager-level role with an Edit is the Journal/Press editor. OPS has no such role.
                out.rowsWithEdit = await page.locator('tr.gridRow').filter({has: page.locator('a.show_extras')}).evaluateAll((els) => els.map((e) => e.innerText.replace(/\s+/g, ' ').trim()));
                const row = page.locator('tr.gridRow').filter({has: page.locator('td').filter({hasText: /^\s*(Settings\s+)?(Journal|Press)\s+editor\s*$/i})}).filter({has: page.locator('a.show_extras')}).first();
                out.row = (await row.count()) ? (await row.innerText()).replace(/\s+/g, ' ').trim() : 'absent';
                if (await row.count()) {
                    await row.locator('a.show_extras').click();
                    await idle(page);
                    await page.getByRole('link', {name: 'Edit', exact: true}).last().click();
                    const form = page.locator('form#userGroupForm');
                    await form.waitFor({state: 'visible', timeout: T}).catch(() => {});
                    const box = form.locator('input[name="permitSettings"]');
                    await box.waitFor({state: 'visible', timeout: 10_000}).catch(() => {});
                    out.box = (await box.count()) ? {checked: await box.isChecked(), label: await page.locator(`label[for="${await box.getAttribute('id')}"]`).innerText().catch(() => null)} : 'absent';
                    out.formBoxes = await form.locator('input[type="checkbox"]').evaluateAll((is) => is.map((i) => ({name: i.name, checked: i.checked, label: ((i.labels && i.labels[0]) || i.closest('label') || i.parentElement)?.innerText.trim().slice(0, 80)}))).catch(() => []);
                    await snap(page, `${name}-form`);
                    if (out.box !== 'absent') {
                        await loc(page, 'Roles › Edit › "Permit changes to Settings" box', box);
                        if ((await box.isChecked()) !== wanted) await box.setChecked(wanted);
                        const saveBtn = form.locator('button[type="submit"], input[type="submit"]').or(form.getByRole('button', {name: 'Save', exact: true})).first();
                        await saveBtn.click();
                        await idle(page);
                        await sleep(1000);
                        out.dialogsAfterSave = await page.locator('[role="dialog"]:visible').allInnerTexts().catch(() => []);
                        out.formStillOpen = await form.isVisible().catch(() => false);
                        out.notices = await page.locator('[role="alert"], .pkpNotification, .ui-pnotify-text').allInnerTexts().catch(() => []);
                        await snap(page, `${name}-after-save`);
                    }
                }
                record(name, out);
                log(name, JSON.stringify({row: out.row, box: out.box, dialogs: out.dialogsAfterSave, formStillOpen: out.formStillOpen}));
                await signOut(page);
                return out;
            };
            const untick = await setPermit(false, 'permit-admin-untick');
            if (untick.row !== 'absent' && !isOps) {
                await signIn(page, U.ed, {contextPath: ctx});
                await snap(page, 'permit-ed-login-landing', {nav: await readNav(page)});
                await dashboardLanding(page, app, st, 'permit-ed-dashboard');
                await readWebsiteCommentsTab(page, app, st, 'permit-ed-website');
                await readCommentsPage(page, app, st, 'permit-ed-commentspage', {tabs: true});
                await readLanding(page, app, st, 'permit-ed-landing');
                await signOut(page);
                await setPermit(true, 'permit-admin-retick');
                await signIn(page, U.ed, {contextPath: ctx});
                await readWebsiteCommentsTab(page, app, st, 'permit-ed-website-restored');
                await signOut(page);
            }
        }

        // ── admin: holding the manager role, then without it ──────────────────
        if (on('admin')) {
            await signIn(page, 'admin', {contextPath: ctx});
            await dashboardLanding(page, app, st, 'admin-mgr-dashboard');
            await readCommentsPage(page, app, st, 'admin-mgr-commentspage', {tabs: true});
            await readWebsiteCommentsTab(page, app, st, 'admin-mgr-website');
            // end admin's manager role through the screens: "Remove User" is not offered on one's own row (menu: Edit, Email); Edit › the manager role's "Remove Role".
            const rem = await endOwnManagerRole(page, app, ctx, 'admin');
            log('admin-role-removal', JSON.stringify({menu: rem.menu, editUrl: rem.editUrl, roleRows: rem.roleRows, dialog: rem.removeRoleDialog, response: rem.removeRoleResponse, roleRowsAfter: rem.roleRowsAfter, notices: rem.afterRemoveRoleNotices}));
            await readAdminWithoutManager(page, app, st, 'admin-norole');
        }

        // ── admin2: a second scratch context where admin holds Section editor (not Reader) beside the manager role, then ends the manager role ──
        if (on('admin2')) {
            const ctx2 = tag('u14k1b');
            const users2 = [
                {username: `${ctx2}mgr`, roles: ['manager'], givenName: 'Mira', familyName: 'Managerb'},
                {username: `${ctx2}au`, roles: ['author'], givenName: 'Abe', familyName: 'Authorb'},
                {username: 'admin', roles: ['sectionEditor'], givenName: 'Site', familyName: 'Admin'},
            ];
            const context2 = await app.api.createContext({tag: ctx2, enablePublicComments: true, users: users2});
            const sub2 = await app.api.createSubmission({tag: `${ctx2}s`, context: ctx2, submitter: `${ctx2}au`, published: true, title: `K1b article ${ctx2}`});
            const st2 = {
                ctx: ctx2, context: context2, sub: sub2, submissionId: sub2.submissionId,
                landing: {ojs: `/index.php/${ctx2}/article/view/${sub2.submissionId}`, omp: `/index.php/${ctx2}/catalog/book/${sub2.submissionId}`, ops: `/index.php/${ctx2}/preprint/view/${sub2.submissionId}`}[app.name],
                commentsPage: `/index.php/${ctx2}/management/settings/userComments`,
                website: `/index.php/${ctx2}/management/settings/website`,
            };
            record('seed-b', st2);
            st.b = st2;
            fs.writeFileSync(stateFile(app), JSON.stringify(st, null, 2));
            await signIn(page, 'admin', {contextPath: ctx2});
            const rem2 = await endOwnManagerRole(page, app, ctx2, 'admin2');
            log('admin2-role-removal', JSON.stringify({editUrl: rem2.editUrl, roleRows: rem2.roleRows, response: rem2.removeRoleResponse, roleRowsAfter: rem2.roleRowsAfter}));
            await readAdminWithoutManager(page, app, st2, 'admin2-se');
        }
        record('browser-dialogs', browserDialogs);
    } finally {
        await close();
    }
});
