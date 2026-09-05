// U28 claim check, chunk K1: "My Assignments as Reviewer" (the list, its six
// views, the row per state, search, pager, filters, the header "Dashboard"
// link) on OJS and OMP. Spec: docs/specs/U28-reviewers-review.md, Rules 1–5,
// scenario 1, register A1 and A5.
//
// Seeds its own scratch journal (throwaway reviewer-only, reviewer+section
// editor, section-editor-only, author and manager accounts; one assignment
// per row state of Rule 3; 30 filler requests so a view passes the pager's
// 30 rows) and one fresh request for reviewer.julia on the seeded journal
// (scenario 1 as written). Records every screen with screen().
//
//   PROBE_FEATURE=U28 PROBE_AGENT=ccK1 node bin/probe.js all shared/playwright/checks/U28/K1/k1.js
//   PHASES=seed,rev1,ed1,rev2,both,julia   (default: all; later phases reuse k1-scratch-<app>.json)
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, signOut, screen, shot, record, loc, note, idle, tag, outDir} =
    require('../../../probe');

const PHASES = process.env.PHASES ? process.env.PHASES.split(',') : ['seed', 'rev1', 'ed1', 'rev2', 'both', 'julia'];
const on = (p) => PHASES.includes(p);
const VIEWS = ['Action Required by me', 'All assignments', 'Completed', 'Declined', 'Published', 'Archived'];
const FILLERS = 30;

const scratchFile = (app) => path.join(outDir(), `k1-scratch-${app.name}.json`);
function daysAgo(n) { const d = new Date(); d.setDate(d.getDate() - n); return d; }

async function full(page, name) {
    let data;
    try { data = await screen(page); } catch (e) { data = {url: page.url(), error: String(e.message).slice(0, 200)}; }
    data.heading = await page.locator('main h1').first().innerText().catch(() => null);
    data.tabSelected = await page.locator('[role="tab"][aria-selected="true"]').allInnerTexts().catch(() => null);
    record(name, data);
    await shot(page, name).catch(() => {});
    return data;
}
/** Rows of the first table in main; each cell's text and its links/buttons. */
async function readList(page) {
    await page.locator('main table tbody tr').first().waitFor({timeout: 20000}).catch(() => {});
    return page.evaluate(() => {
        const table = document.querySelector('main table');
        if (!table) return {headers: null, rows: [], note: 'no table in main'};
        const headers = [...table.querySelectorAll('thead th')].map((th) => th.innerText.trim());
        const headerControls = [...table.querySelectorAll('thead button, thead a')].map((b) => b.innerText.trim());
        const rows = [...table.querySelectorAll('tbody tr')].map((tr) =>
            [...tr.querySelectorAll('td, th')].map((td) => ({
                tag: td.tagName,
                text: td.innerText.trim(),
                links: [...td.querySelectorAll('a, button')].map((a) => ({tag: a.tagName, text: a.innerText.trim(), href: a.getAttribute('href')})),
            })),
        );
        const main = document.querySelector('main') || document.body;
        const text = main.innerText;
        const pagerButtons = [...main.querySelectorAll('button, a')].filter((b) => /^(Previous|Next|\d+)$/.test(b.innerText.trim()) || /page/i.test(b.getAttribute('aria-label') || '')).map((b) => ({text: b.innerText.trim(), aria: b.getAttribute('aria-label'), disabled: b.disabled || b.getAttribute('aria-disabled')}));
        const bulk = {checkboxes: table.querySelectorAll('input[type="checkbox"]').length, menus: table.querySelectorAll('[role="menu"], [aria-haspopup="menu"], [aria-haspopup="true"]').length};
        const searchLine = (text.match(/Search:.*$/m) || [null])[0];
        const clearSearch = [...main.querySelectorAll('button, a')].filter((b) => /Clear search/i.test(b.innerText + (b.getAttribute('aria-label') || ''))).map((b) => b.innerText.trim() || b.getAttribute('aria-label'));
        const filterChips = (text.match(/^(Filters?:|Section:|Categories:|Issues?:|Days since).*$/gm) || []);
        return {headers, headerControls, rows, pagerButtons, bulk, searchLine, clearSearch, filterChips, resultsLine: (text.match(/.*(of \d+|per page|results).*/i) || [null])[0]};
    });
}
async function sidebar(page) {
    return page.evaluate(() => {
        const nav = document.querySelector('nav[aria-label="Site Navigation"]') || document.querySelector('nav');
        const groups = nav ? [...nav.querySelectorAll('button')].map((b) => b.innerText.trim().replace(/\s+/g, ' ')).filter(Boolean) : [];
        const items = nav ? [...nav.querySelectorAll('[role="treeitem"] a, a')].map((a) => ({text: a.innerText.trim().replace(/\s+/g, ' '), href: a.getAttribute('href')})).filter((x) => x.text) : [];
        return {navText: nav ? nav.innerText.replace(/\s+/g, ' ').trim() : null, groups, items};
    });
}
async function signInAt(page, app, contextPath, username) {
    await signOut(page).catch(() => {});
    await page.goto(app.url(`/index.php/${contextPath}/login`));
    await page.locator('input#username').fill(username);
    await page.locator('input#password').evaluate((el) => el.removeAttribute('maxlength'));
    await page.locator('input#password').fill(app.users.getPassword(username));
    await page.locator('form#login button[type="submit"]').click();
    await page.waitForURL((url) => !url.pathname.includes('/login'), {timeout: 15000, waitUntil: 'commit'});
    await page.waitForLoadState('domcontentloaded');
    await settled(page);
}
async function settled(page) {
    await page.waitForFunction(() => {
        const t = document.querySelector('main table');
        return t && !/Loading/i.test(t.innerText) && t.querySelector('tbody tr td, tbody tr th, tbody');
    }, null, {timeout: 20000}).catch(() => {});
}
async function openView(page, name) {
    const link = page.getByRole('treeitem', {name, exact: true}).getByRole('link').first();
    const waited = page.waitForResponse((r) => r.url().includes('/_submissions/reviewerAssignments') && r.request().method() === 'GET', {timeout: 15000}).catch(() => null);
    await link.click();
    await waited;
    await settled(page);
}
const rowsFor = (list, needle) => list.rows.filter((r) => r.some((c) => c.text.includes(needle)));
const rowText = (r) => r.map((c) => c.text + (c.links.length ? ` [${c.links.map((l) => `${l.tag}:${l.text}`).join('|')}]` : ''));
async function membership(page, needle) {
    const out = {};
    for (const v of VIEWS) {
        await openView(page, v);
        const list = await readList(page);
        out[v] = rowsFor(list, needle).map(rowText);
    }
    return out;
}
async function pressAction(page, app, title, name) {
    const tr = page.locator('main table tbody tr').filter({hasText: title}).first();
    const btn = tr.locator('td').last().getByRole('button', {name, exact: true});
    await loc(page, `row action "${name}"`, btn);
    await btn.click();
    await page.waitForURL(/reviewer\/submission/, {timeout: 30000}).catch(() => {});
    await idle(page).catch(() => {});
}
async function submitReview(page, app, id, t, name) {
    await page.goto(app.url(`/index.php/${t}/reviewer/submission/${id}`));
    await idle(page);
    const out = {opened: page.url()};
    const saveBtn = page.getByRole('button', {name: 'Save and continue', exact: true}).filter({visible: true});
    const step3Btn = page.getByRole('button', {name: 'Continue to Step #3'}).filter({visible: true});
    const submitBtn = page.getByRole('button', {name: 'Submit Review', exact: true}).filter({visible: true});
    await full(page, `${name}-wizard-open`);
    if (await saveBtn.count()) await saveBtn.first().click();
    await step3Btn.or(submitBtn).first().waitFor({timeout: 30000});
    if (await step3Btn.count()) await step3Btn.first().click();
    await submitBtn.first().waitFor({timeout: 30000});
    const body = page.frameLocator('iframe[id^="comments"]:not([id^="commentsPrivate"])').locator('body');
    await body.click();
    await body.pressSequentially(`Review text ${t}`);
    const rec = page.locator('select#reviewerRecommendationId');
    if (await rec.count()) await rec.selectOption({index: 1});
    await submitBtn.first().click();
    const confirm = page.locator('[role="dialog"]:visible').first();
    await confirm.waitFor({timeout: 15000}).catch(() => {});
    out.confirm = await confirm.innerText().catch(() => null);
    await page.getByRole('button', {name: 'OK', exact: true}).click();
    await page.getByRole('heading', {name: /Review Submitted/}).waitFor({timeout: 30000}).catch(() => {});
    const done = await full(page, `${name}-wizard-done`);
    out.after = {url: done.url, tabSelected: done.tabSelected, heading: (done.text && done.text.main || '').split('\n').slice(0, 4)};
    return out;
}
async function pickDate(page, scope, fieldPrefix, date) {
    const input = scope.locator(`input.datepicker[id^="${fieldPrefix}"]`);
    await input.click();
    const picker = page.locator('#ui-datepicker-div');
    await picker.waitFor({timeout: 15000});
    await picker.locator('select.ui-datepicker-year').selectOption(String(date.getFullYear()));
    await picker.locator('select.ui-datepicker-month').selectOption(String(date.getMonth()));
    await picker.locator('td:not(.ui-datepicker-other-month) a').filter({hasText: new RegExp(`^${date.getDate()}$`)}).first().click();
    await picker.waitFor({state: 'hidden', timeout: 15000});
}
async function reviewerRow(page, app, t, id, reviewerName) {
    await page.goto(app.url(`/index.php/${t}/dashboard/editorial?workflowSubmissionId=${id}`));
    await page.getByRole('heading', {name: /^Workflow:/}).waitFor({timeout: 30000});
    const panel = page.locator('div').filter({has: page.getByRole('table', {name: 'Reviewers', exact: true})}).last();
    await panel.getByRole('row').filter({hasText: reviewerName}).first().waitFor({timeout: 30000});
    return panel.getByRole('row').filter({hasText: reviewerName}).first();
}
async function menuItems(page) {
    return page.locator('[role="menuitem"]:visible').allInnerTexts();
}

forEachApp(async (app) => {
    const S = {app: app.name, errors: {}};
    let scratch = fs.existsSync(scratchFile(app)) ? JSON.parse(fs.readFileSync(scratchFile(app), 'utf8')) : null;

    if (on('seed')) {
        const t = tag('u28k1');
        const U = {rev: `${t}rev`, both: `${t}both`, ed: `${t}ed`, au: `${t}au`, mgr: `${t}mgr`};
        await app.api.createContext({
            tag: t,
            context: {name: `K1 scratch ${t}`},
            users: [
                {username: U.rev, roles: ['externalReviewer'], givenName: 'Rev', familyName: 'Kone'},
                {username: U.both, roles: ['externalReviewer', 'sectionEditor'], givenName: 'Bo', familyName: 'Thrice'},
                {username: U.ed, roles: ['sectionEditor'], givenName: 'Ed', familyName: 'Itor'},
                {username: U.au, roles: ['author'], givenName: 'Au', familyName: 'Thor'},
                {username: U.mgr, roles: ['manager'], givenName: 'Ma', familyName: 'Nager'},
            ],
        });
        scratch = {tag: t, users: U, ids: {}, titles: {}, seedErrors: {}};
        const seeds = {
            S1: {title: `S1 invited ${t}`, reviewers: [{username: U.rev, status: 'invited'}], decisions: ['sendExternalReview']},
            S2: {title: `S2 accepted zebra${t}`, reviewers: [{username: U.rev, status: 'accepted'}], decisions: ['sendExternalReview']},
            S3: {title: `S3 declined ${t}`, reviewers: [{username: U.rev, status: 'declined'}], decisions: ['sendExternalReview']},
            S4: {title: `S4 tosubmit ${t}`, reviewers: [{username: U.rev, status: 'accepted'}], decisions: ['sendExternalReview']},
            S5: {title: `S5 copyedit ${t}`, reviewers: [{username: U.rev, status: 'accepted'}], decisions: ['sendExternalReview', 'accept']},
            S6: {title: `S6 tocancel ${t}`, reviewers: [{username: U.rev, status: 'invited'}], decisions: ['sendExternalReview']},
            S7: {title: `S7 production ${t}`, reviewers: [{username: U.rev, status: 'accepted'}], decisions: ['sendExternalReview', 'accept', 'sendToProduction']},
            S8: {title: `S8 published ${t}`, reviewers: [{username: U.rev, status: 'accepted'}], decisions: ['sendExternalReview', 'accept', 'sendToProduction'], published: true},
            S9: {title: `S9 forboth ${t}`, reviewers: [{username: U.both, status: 'invited'}], decisions: ['sendExternalReview']},
        };
        for (let i = 1; i <= FILLERS; i++) seeds[`F${String(i).padStart(2, '0')}`] = {title: `F${String(i).padStart(2, '0')} filler ${t}`, reviewers: [{username: U.rev, status: 'invited'}], decisions: ['sendExternalReview']};
        for (const [key, s] of Object.entries(seeds)) {
            try {
                const res = await app.api.createSubmission({
                    tag: `${t}${key.toLowerCase()}`, context: t, submitter: U.au, title: s.title, submitted: true,
                    decisions: s.decisions, reviewRounds: [{reviewers: s.reviewers}],
                    participants: [{username: U.ed, role: 'sectionEditor'}], ...(s.published ? {published: true} : {}),
                });
                scratch.ids[key] = res.submissionId; scratch.titles[key] = s.title;
            } catch (e) { scratch.seedErrors[key] = String(e.message).slice(0, 400); }
        }
        // Scenario 1 as written: one fresh request for reviewer.julia on the seeded journal.
        try {
            const res = await app.api.createSubmission({
                tag: `${t}pk`, context: app.contextPath, submitter: 'author.alex', title: `K1 fresh request ${t}`, submitted: true,
                decisions: ['sendExternalReview'], reviewRounds: [{reviewers: [{username: 'reviewer.julia', status: 'invited'}]}],
                participants: [{username: 'sectioneditor.ana', role: 'sectionEditor'}],
            });
            scratch.ids.PK = res.submissionId; scratch.titles.PK = `K1 fresh request ${t}`;
        } catch (e) { scratch.seedErrors.PK = String(e.message).slice(0, 400); }
        fs.writeFileSync(scratchFile(app), JSON.stringify(scratch, null, 2));
        console.log(`[u28k1] ${app.name} seeded`, scratch.ids, scratch.seedErrors);
    }
    if (!scratch) throw new Error('no scratch; run the seed phase first');
    const t = scratch.tag, U = scratch.users, T = scratch.titles;
    S.tag = t;

    const {page, close} = await launch(app);
    page.setDefaultTimeout(30000);
    try {
        // ------------------------------------------------ rev1: the reviewer-only account on the scratch journal
        if (on('rev1')) {
            try {
                await signInAt(page, app, t, U.rev);
                const landing = await full(page, `rev1-landing-${app.name}`);
                S.rev1 = {landing: {url: landing.url, title: landing.title, heading: landing.heading}, sidebar: await sidebar(page)};
                await loc(page, 'sidebar group button "My Assignments as Reviewer"', page.getByRole('button', {name: 'My Assignments as Reviewer'}));
                await loc(page, 'sidebar "Start A New Submission"', page.getByRole('navigation').getByText('Start A New Submission'));
                // Views: membership per seed, counts, heading, pager.
                S.rev1.views = {};
                for (const v of VIEWS) {
                    await openView(page, v);
                    const data = await full(page, `rev1-view-${v.replace(/\s+/g, '')}-${app.name}`);
                    const list = await readList(page);
                    const sb = await sidebar(page);
                    S.rev1.views[v] = {url: data.url, title: data.title, heading: data.heading, headers: list.headers, headerControls: list.headerControls,
                        rowCount: list.rows.length, pagerButtons: list.pagerButtons, bulk: list.bulk, resultsLine: list.resultsLine,
                        sidebarEntry: sb.items.filter((i) => i.text.endsWith(v)).map((i) => i.text),
                        seeds: Object.fromEntries(['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8'].map((k) => [k, rowsFor(list, `${k} `).map(rowText)])),
                        fillerRows: rowsFor(list, 'filler').length};
                }
                // Sort control on "All assignments".
                await openView(page, 'All assignments');
                const before = await readList(page);
                const sortBtn = page.locator('main table thead').getByRole('button').first();
                await loc(page, 'the "ID" header Sort button', sortBtn);
                S.rev1.sort = {button: await sortBtn.innerText().catch(() => null), firstIdsBefore: before.rows.slice(0, 3).map((r) => r[0].text)};
                if (await sortBtn.count()) {
                    const w = page.waitForResponse((r) => r.url().includes('/_submissions/reviewerAssignments'), {timeout: 15000}).catch(() => null);
                    await sortBtn.click(); await w; await settled(page);
                    const after = await readList(page);
                    S.rev1.sort.firstIdsAfter = after.rows.slice(0, 3).map((r) => r[0].text);
                    S.rev1.sort.url = page.url();
                }
                // Pager on "All assignments" (more than 30 rows).
                await page.goto(app.url(`/index.php/${t}/dashboard/reviewAssignments?currentViewId=reviewer-assignments-all`)); await settled(page);
                const p1 = await readList(page);
                S.rev1.pager = {page1: {rowCount: p1.rows.length, firstIds: p1.rows.slice(0, 5).map((r) => r[0].text), lastId: (p1.rows.at(-1) || [{}])[0].text, buttons: p1.pagerButtons, resultsLine: p1.resultsLine, url: page.url()}};
                await full(page, `rev1-pager-page1-${app.name}`);
                const next = page.locator('main').getByRole('button', {name: /^(Next|2)$/}).or(page.locator('main').getByRole('link', {name: /^(Next|2)$/})).or(page.locator('main [aria-label*="page 2" i], main [aria-label*="Next" i]')).first();
                await loc(page, 'pager "Next"/"2" control', next);
                if (await next.count()) {
                    const w = page.waitForResponse((r) => r.url().includes('/_submissions/reviewerAssignments'), {timeout: 15000}).catch(() => null);
                    await next.click(); const resp = await w; await settled(page);
                    const p2 = await readList(page);
                    S.rev1.pager.page2 = {request: resp ? resp.url() : 'no request', rowCount: p2.rows.length, firstIds: p2.rows.slice(0, 5).map((r) => r[0].text), lastId: (p2.rows.at(-1) || [{}])[0].text, buttons: p2.pagerButtons, resultsLine: p2.resultsLine, url: page.url()};
                    await full(page, `rev1-pager-page2-${app.name}`);
                }
                // Search box.
                await page.goto(app.url(`/index.php/${t}/dashboard/reviewAssignments?currentViewId=reviewer-assignments-all`)); await settled(page);
                const search = page.locator('main').getByRole('searchbox').first();
                await loc(page, 'list search box', search);
                S.rev1.search = {placeholder: await search.getAttribute('placeholder'), ariaLabel: await search.getAttribute('aria-label'), before: (await readList(page)).rows.length};
                for (const [label, phrase] of [['s2', `zebra${t}`], ['none', `nomatch${t}xyz`]]) {
                    const w = page.waitForResponse((r) => r.url().includes('/_submissions/reviewerAssignments'), {timeout: 10000}).catch(() => null);
                    await search.fill(''); await search.pressSequentially(phrase, {delay: 20}); await search.press('Enter');
                    const resp = await w; await settled(page);
                    const data = await full(page, `rev1-search-${label}-${app.name}`);
                    const list = await readList(page);
                    S.rev1.search[label] = {phrase, url: data.url, heading: data.heading, request: resp ? resp.url() : 'no request', rowCount: list.rows.length, s2Present: rowsFor(list, 'S2 ').length, searchLine: list.searchLine, clearSearch: list.clearSearch, filterChips: list.filterChips};
                }
                const clear = page.locator('main').getByRole('button', {name: /Clear search phrase/i}).first();
                await loc(page, '"Clear search phrase" control', clear);
                if (await clear.count()) { await clear.click(); await settled(page); const l = await readList(page); S.rev1.search.afterClear = {url: page.url(), rowCount: l.rows.length, searchLine: l.searchLine}; }
                // Filters window.
                const filters = page.locator('main').getByRole('button', {name: 'Filters', exact: true});
                await loc(page, 'Filters button', filters);
                await filters.first().click();
                await page.locator('[role="dialog"]:visible').first().waitFor({timeout: 10000}).catch(() => {});
                const fd = await full(page, `rev1-filters-${app.name}`);
                S.rev1.filters = {dialogs: fd.aria && fd.aria.dialogs, controls: await page.evaluate(() => [...document.querySelectorAll('[role="dialog"] form legend, [role="dialog"] form .pkpFormField__heading, [role="dialog"] form label, [role="dialog"] form button')].filter((e) => e.getClientRects().length).map((e) => e.innerText.trim()).filter(Boolean))};
                await page.locator('[role="dialog"]:visible').getByRole('button', {name: /^Close$/}).first().click().catch(() => page.keyboard.press('Escape'));
                await page.locator('form:visible').filter({hasText: 'Apply Filters'}).waitFor({state: 'hidden', timeout: 10000}).catch(() => {});
                S.rev1.afterFilters = {chips: (await readList(page)).filterChips, url: page.url()};
                // Row actions: S1 "Respond to request", S2 "Finish review" (+ step 1's Review Due Date, A5).
                S.rev1.actions = {};
                await page.goto(app.url(`/index.php/${t}/dashboard/reviewAssignments?currentViewId=reviewer-assignments-all`)); await settled(page);
                await pressAction(page, app, T.S1, 'Respond to request');
                let d = await full(page, `rev1-action-S1-${app.name}`);
                S.rev1.actions.S1 = {url: d.url, title: d.title, tabSelected: d.tabSelected, heading: d.heading};
                await page.goto(app.url(`/index.php/${t}/dashboard/reviewAssignments?currentViewId=reviewer-assignments-all`)); await settled(page);
                await pressAction(page, app, T.S2, 'Finish review');
                d = await full(page, `rev1-action-S2-${app.name}`);
                S.rev1.actions.S2 = {url: d.url, title: d.title, tabSelected: d.tabSelected, dueLines: ((d.text && d.text.main) || '').split('\n').filter((l) => /Due Date|\d{4}-\d{2}-\d{2}/.test(l))};
                // Submit S4 (→ "Completed") and S8 (published → "Published"?).
                S.rev1.submitS4 = await submitReview(page, app, scratch.ids.S4, t, `rev1-S4-${app.name}`);
                if (scratch.ids.S8) { try { S.rev1.submitS8 = await submitReview(page, app, scratch.ids.S8, t, `rev1-S8-${app.name}`); } catch (e) { S.errors.submitS8 = String(e.message).slice(0, 300); await full(page, `rev1-S8-failed-${app.name}`); } }
                await page.goto(app.url(`/index.php/${t}/dashboard/reviewAssignments`)); await settled(page);
                S.rev1.afterSubmit = {S4: await membership(page, 'S4 '), S8: scratch.ids.S8 ? await membership(page, 'S8 ') : 'not seeded', sidebar: (await sidebar(page)).items.map((i) => i.text)};
                await openView(page, 'Completed');
                await full(page, `rev1-completed-${app.name}`);
                await pressAction(page, app, T.S4, 'View');
                d = await full(page, `rev1-action-S4-view-${app.name}`);
                S.rev1.actions.S4view = {url: d.url, tabSelected: d.tabSelected};
                await signOut(page);
            } catch (e) { S.errors.rev1 = String(e.stack || e).slice(0, 800); await full(page, `rev1-error-${app.name}`); }
        }
        // ------------------------------------------------ ed1: the section editor cancels S6, re-sends S3, moves S1/S2's dates; editorial search control
        if (on('ed1')) {
            try {
                await signInAt(page, app, t, U.ed);
                const dl = await full(page, `ed1-landing-${app.name}`);
                S.ed1 = {landing: {url: dl.url, title: dl.title, heading: dl.heading}, sidebar: (await sidebar(page)).groups};
                // Cancel S6.
                let row;
                try { row = await reviewerRow(page, app, t, scratch.ids.S6, 'Rev Kone'); } catch { row = null; }
                if (row) {
                await row.getByRole('button', {name: 'More Actions'}).click();
                S.ed1.S6menu = await menuItems(page);
                // An unanswered request's menu offers "Unassign Reviewer"; an accepted one's "Cancel Reviewer" (pD2).
                const removeItem = page.getByRole('menuitem', {name: /(Cancel|Unassign) Reviewer/}).first();
                S.ed1.S6removeItem = await removeItem.innerText();
                await removeItem.click();
                const removeForm = page.locator('[role="dialog"]:visible form').filter({has: page.getByRole('button', {name: /^(Cancel|Unassign) Reviewer$/})}).last();
                await removeForm.waitFor({timeout: 30000});
                await full(page, `ed1-cancel-S6-${app.name}`);
                S.ed1.S6removeForm = {id: await removeForm.getAttribute('id'), buttons: await removeForm.getByRole('button').allInnerTexts()};
                const cw = page.waitForResponse((r) => r.request().method() === 'POST' && /reviewer-grid|reviewerGrid/i.test(r.url()), {timeout: 15000}).catch(() => null);
                await removeForm.getByRole('button', {name: /^(Cancel|Unassign) Reviewer$/}).click();
                const cr = await cw; S.ed1.cancelS6 = cr ? {status: cr.status(), url: cr.url()} : 'no response';
                await removeForm.waitFor({state: 'hidden', timeout: 15000}).catch(() => {});
                await idle(page);
                }
                await page.goto(app.url(`/index.php/${t}/dashboard/editorial?workflowSubmissionId=${scratch.ids.S6}`));
                await page.getByRole('heading', {name: /^Workflow:/}).waitFor({timeout: 30000});
                await page.getByRole('table', {name: 'Reviewers', exact: true}).waitFor({timeout: 30000}).catch(() => {});
                S.ed1.S6panelAfter = await page.locator('div').filter({has: page.getByRole('table', {name: 'Reviewers', exact: true})}).last().innerText().catch(() => null);
                await full(page, `ed1-S6-after-${app.name}`);
                // Re-send S3's declined request (whatever the row's menu offers).
                row = await reviewerRow(page, app, t, scratch.ids.S3, 'Rev Kone');
                S.ed1.S3rowBefore = await row.innerText();
                await row.getByRole('button', {name: 'More Actions'}).click();
                S.ed1.S3menu = await menuItems(page);
                const resend = page.getByRole('menuitem', {name: /Resend|Reinstate/i}).first();
                if (await resend.count()) {
                    S.ed1.resendItem = await resend.innerText();
                    await resend.click();
                    await page.locator('form:visible').filter({has: page.getByRole('button')}).last().waitFor({timeout: 30000}).catch(() => {});
                    await idle(page);
                    const rd = await full(page, `ed1-resend-S3-${app.name}`);
                    S.ed1.resendDialog = rd.aria && rd.aria.dialogs;
                    const form = page.locator('[role="dialog"]:visible form').last();
                    const btn = form.getByRole('button').filter({hasText: /Resend|Reinstate|OK|Send/i}).last();
                    S.ed1.resendButton = await btn.innerText().catch(() => null);
                    const rw = page.waitForResponse((r) => r.request().method() === 'POST' && /reviewer-grid|reviewerGrid/i.test(r.url()), {timeout: 15000}).catch(() => null);
                    await btn.click();
                    const rr = await rw; S.ed1.resendS3 = rr ? {status: rr.status(), url: rr.url()} : 'no response';
                    await form.waitFor({state: 'hidden', timeout: 15000}).catch(() => {});
                    await idle(page);
                    S.ed1.S3rowAfter = await (await reviewerRow(page, app, t, scratch.ids.S3, 'Rev Kone')).innerText().catch(() => null);
                } else { await page.keyboard.press('Escape'); }
                // Past due dates on S1 (unanswered) and S2 (accepted).
                S.ed1.dates = {};
                for (const key of ['S1', 'S2']) {
                    row = await reviewerRow(page, app, t, scratch.ids[key], 'Rev Kone');
                    await row.getByRole('button', {name: 'More Actions'}).click();
                    await page.getByRole('menuitem', {name: 'Edit', exact: true}).click();
                    const modal = page.getByRole('dialog').filter({has: page.locator('form#editReviewForm')});
                    await modal.locator('form#editReviewForm input.datepicker').first().waitFor({timeout: 30000});
                    await pickDate(page, modal, 'responseDueDate', daysAgo(10));
                    await pickDate(page, modal, 'reviewDueDate', daysAgo(3));
                    const values = await modal.locator('input.datepicker').evaluateAll((els) => els.map((e) => ({id: e.id, value: e.value})));
                    const ow = page.waitForResponse((r) => r.url().includes('update-review'), {timeout: 15000}).catch(() => null);
                    await modal.getByRole('button', {name: 'OK', exact: true}).click();
                    const orr = await ow;
                    let closed = true;
                    try { await modal.locator('form#editReviewForm').waitFor({state: 'hidden', timeout: 10000}); } catch { closed = false; await full(page, `ed1-edit-${key}-stuck-${app.name}`); await modal.getByRole('button', {name: 'Close', exact: true}).first().click().catch(() => {}); }
                    await idle(page);
                    S.ed1.dates[key] = {values, ok: orr ? orr.status() : 'no response', closed};
                }
                // A1's control: the editorial dashboard's identical search box filters.
                await page.goto(app.url(`/index.php/${t}/dashboard/editorial?currentViewId=assigned-to-me`)); await settled(page);
                const es = page.locator('main').getByRole('searchbox').first();
                const eb = await readList(page);
                const ew = page.waitForResponse((r) => r.url().includes('/api/v1/') && r.request().method() === 'GET', {timeout: 10000}).catch(() => null);
                await es.fill(''); await es.pressSequentially(`zebra${t}`, {delay: 20}); await es.press('Enter');
                const er = await ew; await settled(page);
                const ea = await readList(page);
                const ed = await full(page, `ed1-editorial-search-${app.name}`);
                S.ed1.editorialSearch = {placeholder: await es.getAttribute('placeholder'), before: eb.rows.length, after: ea.rows.length, afterTitles: ea.rows.map((r) => (r[1] || {}).text).slice(0, 5), request: er ? er.url() : 'no request', searchLine: ea.searchLine, heading: ed.heading};
                await signOut(page);
            } catch (e) { S.errors.ed1 = String(e.stack || e).slice(0, 800); await full(page, `ed1-error-${app.name}`); }
        }
        // ------------------------------------------------ rev2: the reviewer after the editor's changes
        if (on('rev2')) {
            try {
                await signInAt(page, app, t, U.rev);
                S.rev2 = {S6: await membership(page, 'S6 '), S3: await membership(page, 'S3 '), S1: await membership(page, 'S1 '), S2: await membership(page, 'S2 '), sidebar: (await sidebar(page)).items.map((i) => i.text)};
                await openView(page, 'All assignments');
                await full(page, `rev2-all-${app.name}`);
                // The "ID" header's Sort control, pressed twice: request sent, order before/after.
                S.rev2.sort = [];
                const sortBtn = page.locator('main table thead').getByRole('button').first();
                for (let i = 0; i < 2; i++) {
                    const b = await readList(page);
                    const w = page.waitForResponse((r) => r.url().includes('/_submissions/reviewerAssignments'), {timeout: 10000}).catch(() => null);
                    await sortBtn.click(); const resp = await w; await settled(page);
                    const a = await readList(page);
                    S.rev2.sort.push({request: resp ? resp.url() : 'no request', url: page.url(), before: b.rows.slice(0, 6).map((r) => r[0].text), after: a.rows.slice(0, 6).map((r) => r[0].text), headerAria: await sortBtn.getAttribute('aria-sort').catch(() => null)});
                }
                await full(page, `rev2-sorted-${app.name}`);
                await signOut(page);
            } catch (e) { S.errors.rev2 = String(e.stack || e).slice(0, 800); await full(page, `rev2-error-${app.name}`); }
        }
        // ------------------------------------------------ both: reviewer + section editor
        if (on('both')) {
            try {
                await signInAt(page, app, t, U.both);
                const bl = await full(page, `both-landing-${app.name}`);
                S.both = {landing: {url: bl.url, title: bl.title, heading: bl.heading}, sidebarAtLanding: (await sidebar(page)).groups};
                await page.goto(app.url(`/index.php/${t}/dashboard/reviewAssignments`)); await settled(page);
                const bd = await full(page, `both-list-${app.name}`);
                const sb = await sidebar(page);
                S.both.list = {url: bd.url, heading: bd.heading, groups: sb.groups, items: sb.items.map((i) => i.text), S9: rowsFor(await readList(page), 'S9 ').map(rowText)};
                await signOut(page);
            } catch (e) { S.errors.both = String(e.stack || e).slice(0, 800); await full(page, `both-error-${app.name}`); }
        }
        // ------------------------------------------------ julia: scenario 1 on the seeded journal, Rule 4's window there, Rule 5
        if (on('julia')) {
            try {
                await signInAt(page, app, app.contextPath, 'reviewer.julia');
                const jl = await full(page, `julia-landing-${app.name}`);
                const sb = await sidebar(page);
                const list = await readList(page);
                S.julia = {landing: {url: jl.url, title: jl.title, heading: jl.heading, rowCount: list.rows.length, pager: list.pagerButtons}, sidebar: sb.items.map((i) => i.text), groups: sb.groups, PK: rowsFor(list, 'K1 fresh').map(rowText)};
                S.julia.membership = await membership(page, 'K1 fresh');
                await openView(page, 'All assignments');
                const filters = page.locator('main').getByRole('button', {name: 'Filters', exact: true});
                await filters.first().click();
                await page.locator('[role="dialog"]:visible').first().waitFor({timeout: 10000}).catch(() => {});
                const fd = await full(page, `julia-filters-${app.name}`);
                S.julia.filters = {dialogs: fd.aria && fd.aria.dialogs, controls: await page.evaluate(() => [...document.querySelectorAll('[role="dialog"] form legend, [role="dialog"] form .pkpFormField__heading, [role="dialog"] form label, [role="dialog"] form button')].filter((e) => e.getClientRects().length).map((e) => e.innerText.trim()).filter(Boolean))};
                await page.locator('[role="dialog"]:visible').getByRole('button', {name: /^Close$/}).first().click().catch(() => page.keyboard.press('Escape'));
                await page.locator('form:visible').filter({hasText: 'Apply Filters'}).waitFor({state: 'hidden', timeout: 10000}).catch(() => {});
                S.julia.afterFilters = {chips: (await readList(page)).filterChips};
                // Rule 5: the reader-side header's "Dashboard".
                await page.goto(app.url(`/index.php/${app.contextPath}/index`));
                await page.waitForLoadState('domcontentloaded');
                S.julia.home = {url: page.url(), dashboardLinks: await page.evaluate(() => [...document.querySelectorAll('a')].filter((a) => /Dashboard/i.test(a.innerText)).map((a) => ({text: a.innerText.trim(), href: a.getAttribute('href'), visible: a.getClientRects().length > 0})))};
                const userMenu = page.locator('header, nav').getByRole('link', {name: /^reviewer\.julia|^Julia/}).first();
                if (await userMenu.count()) await userMenu.click().catch(() => {});
                await full(page, `julia-home-${app.name}`);
                const dash = page.getByRole('link', {name: 'Dashboard', exact: true}).first();
                await loc(page, 'reader-side header "Dashboard" link', dash);
                if (await dash.count()) { await dash.click(); await page.waitForLoadState('domcontentloaded'); await settled(page); const hd = await full(page, `julia-dashboard-${app.name}`); S.julia.dashboard = {url: hd.url, title: hd.title, heading: hd.heading}; }
                else { const href = (S.julia.home.dashboardLinks[0] || {}).href; if (href) { await page.goto(href); await settled(page); const hd = await full(page, `julia-dashboard-${app.name}`); S.julia.dashboard = {viaHref: href, url: hd.url, title: hd.title, heading: hd.heading}; } }
                await signOut(page);
            } catch (e) { S.errors.julia = String(e.stack || e).slice(0, 800); await full(page, `julia-error-${app.name}`); }
        }
    } finally {
        record(`k1-summary-${PHASES.join('_')}-${app.name}`, S);
        await close();
    }
    return S;
});
