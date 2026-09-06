// U30 claim check, chunk K4: the editor's view of a response, "Delete", rounds, roles, cross-feature
// pointers. Spec: docs/specs/U30-author-response-to-reviews.md — Actors & permissions (lines 45–69),
// Rules 10–12 (242–279), Cross-feature interactions (406–435), register A3 and A4.
//
// Seeds one scratch journal with throwaway accounts at every permission level the Actors table names
// (site admin = the installer's `admin`, manager, an assigned section editor, an assigned guest editor,
// funding coordinator, the submitting author, an assigned co-author, an unassigned author, reviewer,
// reader) and three submissions: S1 (one completed review, the co-author and the funding coordinator
// assigned), S2 (two rounds: round 1 completed, round 2 accepted), S3 (accepted after one completed
// review). OJS only: the screens exist nowhere else (the spec's absence paragraph, chunk K5).
//
//   PROBE_FEATURE=U30 PROBE_AGENT=ccK4 node bin/probe.js ojs shared/playwright/checks/U30/K4/k4.js
//   PHASES=seed,roles,edit,address,rounds,xf   (default: all; later phases reuse k4-state-<app>.json)
//
// Phases: roles — one account per level on S1 (a response exists) and S2 round 1 (ready): the table,
// "Request Response", the row menu, "View", the typed request address, the Funding Coordinator's
// refusals (A3); edit — Rule 10 (the editor's window, "Save") and Rule 11 ("Delete" › Cancel / OK, the
// second response), the activity log; address — A4 and Actors row 8 (the typed page without `ret`);
// rounds — Rule 12 on S2 and S3 (the request on a past round, the author's cards, Copyediting and
// Production), the Reviewers panel, the request email's link, the Request Revisions message; xf — the
// Review settings tab and the Emails tab (the cross-feature premises).
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, signOut, screen, shot, record, loc, idle, tag, outDir} =
    require('../../../probe');

const PHASES = process.env.PHASES ? process.env.PHASES.split(',') : ['seed', 'roles', 'edit', 'address', 'rounds', 'xf'];
const on = (p) => PHASES.includes(p);
const log = (...a) => console.log(...a);
const stateFile = (app) => path.join(outDir(), `k4-state-${app.name}.json`);
const factsFile = (app) => path.join(outDir(), `k4-facts-${app.name}.json`);

// ---- helpers (idioms from pB/cluster-b.js and pD/lib.js, screen-notes "pB", "pD") -----------------
const rows = (t) => (t && t.rows) || [];
const rowOf = (t, name) => t.locator('tbody tr').filter({has: t.page().locator('td:first-child', {hasText: name})});
const sideModal = (page, titleText) => page.locator('[role="dialog"]:visible').filter({hasText: titleText}).last();
const wfModal = (page) => page.getByRole('dialog').first();

async function buttonState(locator) {
    const count = await locator.count();
    if (!count) return {count};
    const el = locator.first();
    return {
        count,
        visible: await el.isVisible().catch(() => null),
        disabled: await el.isDisabled().catch(() => null),
        ariaDisabled: await el.getAttribute('aria-disabled').catch(() => null),
        className: await el.getAttribute('class').catch(() => null),
        text: (await el.innerText().catch(() => '')).trim(),
    };
}
async function dialogTexts(page) {
    const out = [];
    for (const d of await page.locator('[role="dialog"]:visible').all()) out.push((await d.innerText().catch(() => '')).trim());
    return out;
}
// A settled read of the screen plus the verbatim text of open dialogs (the workflow screen is one).
async function capture(page, name, extra = {}) {
    await idle(page);
    const s = await screen(page);
    s.landedUrl = page.url();
    s.dialogText = await dialogTexts(page);
    s.bodyText = (await page.locator('body').innerText().catch(() => '')).trim().slice(0, 6000);
    Object.assign(s, extra);
    record(name, s);
    await shot(page, name);
    return s;
}
async function gotoStage(page, app, P, kind, id, menuKey) {
    await page.goto(app.url(`/index.php/${P}/dashboard/${kind}?workflowSubmissionId=${id}${menuKey ? `&workflowMenuKey=${menuKey}` : ''}`));
    await idle(page);
    await wfModal(page).waitFor({timeout: 30_000}).catch(() => {});
    await idle(page);
}
// After a stage or round switch the table can read "No Items" for a few seconds (screen-notes pD).
async function waitTableRows(page) {
    await page.waitForFunction(() => {
        const t = [...document.querySelectorAll('table')].find((x) => /Author Response/.test(x.getAttribute('aria-label') || ''));
        if (!t) return false;
        const rows = [...t.querySelectorAll('tbody tr')];
        return rows.length > 0 && !rows.every((r) => /No Items/i.test(r.textContent));
    }, null, {timeout: 20_000}).catch(() => {});
    await idle(page);
}
// The editor's "Author Response" table as data.
async function tableState(page) {
    const t = page.getByRole('table', {name: 'Author Response'});
    const count = await t.count();
    const requestResponse = await buttonState(page.getByRole('button', {name: 'Request Response', exact: true}));
    if (!count) return {tableCount: 0, requestResponse};
    const rows = [];
    for (const tr of await t.locator('tbody tr').all()) {
        rows.push({
            cells: await tr.locator('td').evaluateAll((tds) => tds.map((td) => td.innerText.trim())),
            cellsDom: await tr.locator('td').evaluateAll((tds) => tds.map((td) => td.textContent.replace(/\s+/g, ' ').trim())),
            moreActions: await buttonState(tr.getByRole('button', {name: /More Actions|…/})),
        });
    }
    return {
        tableCount: count,
        headersDom: await t.locator('thead th').evaluateAll((ths) => ths.map((th) => ({text: th.textContent.trim(), srOnly: !!th.querySelector('.sr-only')}))),
        rows,
        requestResponse,
    };
}
async function openMenu(page, row) {
    const more = row.getByRole('button', {name: /More Actions|…/}).first();
    await more.click();
    await idle(page);
    const menu = page.locator('[role="menu"]:visible, [role="listbox"]:visible').last();
    await menu.waitFor({timeout: 10_000}).catch(() => {});
    const items = [];
    for (const it of await menu.locator('[role="menuitem"], button, a').all()) {
        items.push({
            text: (await it.innerText()).trim(),
            disabled: await it.isDisabled().catch(() => null),
            ariaDisabled: await it.getAttribute('aria-disabled'),
            className: await it.getAttribute('class'),
        });
    }
    return {menu, items};
}
async function readMenus(page, names) {
    const t = page.getByRole('table', {name: 'Author Response'});
    const out = {};
    for (const n of names) {
        const row = rowOf(t, n);
        if (!(await row.getByRole('button', {name: /More Actions|…/}).count())) { out[n] = {noMenu: true}; continue; }
        const m = await openMenu(page, row);
        out[n] = m.items;
        await page.keyboard.press('Escape');
        await idle(page);
    }
    return out;
}
async function richTextBody(modal) {
    await modal.locator('iframe').first().waitFor({timeout: 30_000});
    return modal.frameLocator('iframe').first().locator('body');
}
// The editor's (or the assistant's) "View" window as data.
async function windowState(page, em) {
    const s = {
        modalText: (await em.innerText().catch(() => '')).trim(),
        headings: await em.locator('h1,h2,h3').evaluateAll((hs) => hs.map((h) => `${h.tagName.toLowerCase()}: ${h.innerText.trim()}`)).catch(() => null),
        buttons: [],
        checkboxes: [],
        body: null, bodyEditable: null,
    };
    for (const b of await em.getByRole('button').all()) if (await b.isVisible()) s.buttons.push({text: (await b.innerText()).trim(), enabled: await b.isEnabled()});
    for (const c of await em.getByRole('checkbox').all()) s.checkboxes.push({name: await c.getAttribute('aria-label') || (await c.evaluate((el) => (el.labels && el.labels[0] && el.labels[0].innerText) || el.value || '')), checked: await c.isChecked(), enabled: await c.isEnabled()});
    try {
        const body = await richTextBody(em);
        s.body = (await body.innerText()).trim();
        s.bodyEditable = await body.getAttribute('contenteditable');
    } catch (e) { s.bodyError = String(e.message).slice(0, 120); }
    return s;
}
// Row › "…" › "View", then the window; closes it with "Cancel" unless keepOpen.
async function viewViaMenu(page, name, {keepOpen = false} = {}) {
    const t = page.getByRole('table', {name: 'Author Response'});
    const row = rowOf(t, name);
    if (!(await row.getByRole('button', {name: /More Actions|…/}).count())) return {noMenu: true};
    const m = await openMenu(page, row);
    const out = {items: m.items};
    await m.menu.getByText('View', {exact: true}).click();
    const em = sideModal(page, 'Author Response to Reviews');
    const opened = await em.waitFor({timeout: 30_000}).then(() => true).catch(() => false);
    out.opened = opened;
    if (!opened) { out.dialogs = await dialogTexts(page); return out; }
    await idle(page);
    Object.assign(out, await windowState(page, em));
    if (!keepOpen) {
        await em.getByRole('button', {name: 'Cancel', exact: true}).click().catch(() => {});
        await em.waitFor({state: 'hidden', timeout: 15_000}).catch(() => {});
        await idle(page);
    }
    return out;
}
async function authorCard(page) {
    const wf = wfModal(page);
    const h = wf.getByRole('heading', {name: 'Author Response'});
    const out = {cardHeadings: await h.count()};
    out.submit = await buttonState(wf.getByRole('button', {name: 'Submit Response', exact: true}));
    out.view = await buttonState(wf.getByRole('button', {name: 'View Submitted Response', exact: true}));
    const t = await wf.innerText().catch(() => '');
    const i = t.indexOf('Author Response\n');
    out.cardText = i >= 0 ? t.slice(i, i + 220) : null;
    out.headings = await wf.locator('h1,h2,h3,h4').evaluateAll((hs) => hs.filter((h) => h.offsetParent !== null).map((h) => `${h.tagName.toLowerCase()}: ${h.innerText.trim()}`)).catch(() => null);
    const st = t.match(/(?:Round \d+ )?Status\n([^\n]+)/);
    out.statusBox = st ? st[0] : null;
    out.hasNotifications = /Notifications/.test(t);
    return out;
}
// The author submits a response on the round open on screen, ticking the named boxes.
async function submitResponse(page, sentence, tick) {
    const wf = wfModal(page);
    await wf.getByRole('button', {name: 'Submit Response', exact: true}).click();
    const modal = sideModal(page, 'Submit Your Response to Reviewer Feedback');
    await modal.waitFor({timeout: 30_000});
    await idle(page);
    const before = await windowState(page, modal);
    const body = await richTextBody(modal);
    await body.click();
    await body.pressSequentially(sentence);
    for (const name of tick) await modal.getByRole('checkbox', {name}).check();
    await idle(page);
    await modal.getByRole('button', {name: 'Submit Response', exact: true}).click();
    await modal.waitFor({state: 'hidden', timeout: 30_000}).catch(() => {});
    await idle(page);
    return {windowBefore: before, windowStillOpen: await modal.isVisible().catch(() => false), dialogs: await dialogTexts(page)};
}
// The request page: wait for the template (Subject filled, the TinyMCE iframe attached, "Loading" gone).
async function waitRequestPage(page) {
    const submit = page.getByRole('button', {name: 'Submit Request', exact: true});
    const rendered = await submit.waitFor({timeout: 20_000}).then(() => true).catch(() => false);
    if (!rendered) return false;
    await page.waitForFunction(() => {
        const el = [...document.querySelectorAll('input')].find((i) => /subject/i.test(i.getAttribute('aria-label') || i.name || ''));
        return !!(el && el.value);
    }, null, {timeout: 30_000}).catch(() => {});
    await page.locator('iframe').first().waitFor({timeout: 30_000}).catch(() => {});
    await page.getByText('Loading', {exact: true}).waitFor({state: 'hidden', timeout: 30_000}).catch(() => {});
    await page.waitForFunction(() => { const f = document.querySelector('iframe'); const b = f && f.contentDocument && f.contentDocument.body; return b && b.innerText.trim().length > 20; }, null, {timeout: 30_000}).catch(() => {});
    await idle(page);
    return true;
}
async function requestPageState(page) {
    const s = {rendered: (await page.getByRole('button', {name: 'Submit Request', exact: true}).count()) > 0, textboxes: [], buttons: [], message: null, anchors: null};
    for (const t of await page.getByRole('textbox').all()) {
        s.textboxes.push({name: await t.getAttribute('aria-label') || await t.getAttribute('name') || await t.getAttribute('id'), value: await t.inputValue().catch(() => null)});
    }
    for (const b of await page.getByRole('button').all()) if (await b.isVisible()) s.buttons.push({text: (await b.innerText()).trim(), enabled: await b.isEnabled()});
    if (await page.locator('iframe').first().count()) {
        const body = page.frameLocator('iframe').first().locator('body');
        s.message = (await body.innerText().catch(() => '')).trim();
        s.anchors = await body.evaluate((b) => [...b.querySelectorAll('a')].map((a) => ({text: a.innerText.trim(), href: a.getAttribute('href')}))).catch(() => null);
    }
    return s;
}
// Where a click on "Request Response" (or a typed address) lands: the page, the denial page, or the stage.
async function landing(page) {
    return {
        landedUrl: page.url(),
        requestPage: (await page.getByRole('button', {name: 'Submit Request', exact: true}).count()) > 0,
        denied: /authorizationDenied/.test(page.url()),
        h1: await page.locator('h1').first().innerText().catch(() => null),
        bodyText: (await page.locator('body').innerText().catch(() => '')).trim().slice(0, 1500),
    };
}
async function openSideList(page, buttonName, name) {
    const btn = page.getByRole('button', {name: buttonName}).first();
    await btn.click();
    const dlg = page.locator('[role="dialog"]:visible').last();
    await dlg.waitFor({timeout: 30_000}).catch(() => {});
    await dlg.locator('table tbody tr').first().waitFor({timeout: 30_000}).catch(() => {});
    await idle(page);
    const s = await capture(page, name, {listText: (await dlg.innerText().catch(() => '')).trim().slice(0, 5000)});
    await page.keyboard.press('Escape');
    await idle(page);
    return s;
}
async function mailOf(app, {to, contains, skipIds = []}) {
    await app.mail.find({to, contains, timeoutMs: 20_000}).catch(() => null);
    const list = await app.mail.inboxFor(to).catch(() => []);
    for (const m of list) {
        if (skipIds.includes(m.ID)) continue;
        const full = await app.mail.fullMessage(m.ID);
        if (contains && !(full.Text || '').includes(contains) && !(full.Subject || '').includes(contains)) continue;
        return {id: m.ID, subject: full.Subject, from: full.From, to: full.To, date: full.Date,
            href: app.mail.extractLink(full.HTML, 'Submit Author Response'), text: (full.Text || '').slice(0, 3000)};
    }
    return null;
}

forEachApp(async (app) => {
    if (app.name !== 'ojs') { log('K4 is OJS-only; skipping', app.name); return; }
    let st = fs.existsSync(stateFile(app)) ? JSON.parse(fs.readFileSync(stateFile(app), 'utf8')) : null;
    const save = () => fs.writeFileSync(stateFile(app), JSON.stringify(st, null, 2));
    const facts = fs.existsSync(factsFile(app)) ? JSON.parse(fs.readFileSync(factsFile(app), 'utf8')) : {app: app.name, steps: {}};
    const done = (label, data) => { facts.steps[label] = data; log(`[${label}]`, JSON.stringify(data).slice(0, 1500)); fs.writeFileSync(factsFile(app), JSON.stringify(facts, null, 2)); };

    // ---- seed ------------------------------------------------------------------------------------
    if (on('seed') && !st) {
        const t = tag('u30k4');
        const u = {mgr: `${t}mgr`, se: `${t}se`, ge: `${t}ge`, fund: `${t}fund`, au: `${t}au`, au2: `${t}au2`, au3: `${t}au3`, rev: `${t}rev`, rd: `${t}rd`};
        const users = [
            {username: u.mgr, roles: ['manager'], givenName: 'Mira', familyName: 'Manager'},
            {username: u.se, roles: ['sectionEditor'], givenName: 'Sena', familyName: 'Editor'},
            {username: u.ge, roles: ['guestEditor'], givenName: 'Gus', familyName: 'Guest'},
            {username: u.fund, roles: ['funding'], givenName: 'Fia', familyName: 'Funding'},
            {username: u.au, roles: ['author'], givenName: 'Ava', familyName: 'Author'},
            {username: u.au2, roles: ['author'], givenName: 'Cleo', familyName: 'Coauthor'},
            {username: u.au3, roles: ['author'], givenName: 'Uma', familyName: 'Unassigned'},
            {username: u.rev, roles: ['externalReviewer'], givenName: 'Rowan', familyName: 'Reviewer'},
            {username: u.rd, roles: ['reader'], givenName: 'Rea', familyName: 'Reader'},
        ];
        const ctx = await app.api.createContext({tag: t, users});
        st = {tag: t, path: ctx.path || t, contextId: ctx.contextId, users: u, names: {mgr: 'Mira Manager', se: 'Sena Editor', ge: 'Gus Guest', fund: 'Fia Funding', au: 'Ava Author', au2: 'Cleo Coauthor', au3: 'Uma Unassigned', rev: 'Rowan Reviewer', rd: 'Rea Reader'}, subs: {}, seedNotes: []};
        const sub = async (key, spec) => {
            const r = await app.api.createSubmission({tag: `${t}${key.toLowerCase()}`, context: st.path, submitter: u.au, ...spec});
            st.subs[key] = {id: r.submissionId, rounds: r.reviewRounds || [], title: spec.title, stageId: r.stageId};
        };
        const s1Participants = [{username: u.se, role: 'sectionEditor'}, {username: u.ge, role: 'guestEditor'}, {username: u.fund, role: 'funding'}, {username: u.au2, role: 'author'}];
        try {
            await sub('S1', {title: `K4 S1 response ${t}`, decisions: ['sendExternalReview'], participants: s1Participants,
                reviewRounds: [{reviewers: [{username: u.rev, status: 'completed', comments: `Round one comments for S1 ${t}.`}]}]});
        } catch (e) {
            st.seedNotes.push(`S1 with guestEditor participant refused: ${String(e.message).slice(0, 300)}`);
            await sub('S1', {title: `K4 S1 response ${t}`, decisions: ['sendExternalReview'], participants: s1Participants.filter((p) => p.role !== 'guestEditor'),
                reviewRounds: [{reviewers: [{username: u.rev, status: 'completed', comments: `Round one comments for S1 ${t}.`}]}]});
        }
        await sub('S2', {title: `K4 S2 two rounds ${t}`, decisions: ['sendExternalReview'],
            participants: [{username: u.se, role: 'sectionEditor'}, {username: u.fund, role: 'funding'}],
            reviewRounds: [{reviewers: [{username: u.rev, status: 'completed', comments: `Round one comments for S2 ${t}.`}]}, {reviewers: [{username: u.rev, status: 'accepted'}]}]});
        await sub('S3', {title: `K4 S3 accepted ${t}`, decisions: ['sendExternalReview', 'accept'],
            participants: [{username: u.se, role: 'sectionEditor'}],
            reviewRounds: [{reviewers: [{username: u.rev, status: 'completed'}]}]});
        save();
        done('seed', st);
    }
    if (!st) throw new Error('no scratch context; run with PHASES=seed first');
    const U = st.users, N = st.names, P = st.path;
    const S1 = st.subs.S1, S2 = st.subs.S2, S3 = st.subs.S3;
    const r = (s, i = 0) => s.rounds[i].id;
    const addr = (id, round) => app.url(`/index.php/${P}/reviewResponse/requestAuthorResponse?stageId=3&reviewRoundId=${round}&submissionId=${id}`);
    const auMail = `${U.au}@mail.test`;
    const editorLevels = [['admin', 'admin'], ['mgr', U.mgr], ['se', U.se], ['ge', U.ge], ['fund', U.fund]];

    const {page, close} = await launch(app);
    page.on('dialog', (d) => d.accept());
    const asUser = (username) => (username === 'admin' ? signIn(page, 'admin') : signIn(page, username, {contextPath: P}));
    const editorStage = (id, round, menuKey) => gotoStage(page, app, P, 'editorial', id, menuKey || (round ? `workflow_3_${round}` : undefined));
    const authorStage = (id, round, menuKey) => gotoStage(page, app, P, 'mySubmissions', id, menuKey || (round ? `workflow_3_${round}` : undefined));
    try {
        // ---- roles: Actors rows, A3, Rule 10 line 253 ------------------------------------------------
        if (on('roles')) {
            // a contributor without an account on S1 (Actors "contributor"; cross-feature "Contributors & affiliations")
            await asUser(U.mgr);
            if (!st.contributor) {
            await page.goto(app.url(`/index.php/${P}/dashboard/editorial?workflowSubmissionId=${S1.id}&workflowMenuKey=publication_${S1.id}_contributors`));
            await idle(page);
            await wfModal(page).waitFor({timeout: 30_000});
            await idle(page);
            const addBtn = wfModal(page).getByRole('button', {name: 'Add Contributor', exact: true});
            await addBtn.waitFor({timeout: 30_000});
            await addBtn.click();
            const addDlg = page.getByRole('dialog', {name: 'Add Contributor'});
            await addDlg.waitFor({timeout: 30_000});
            await idle(page);
            await addDlg.locator('input[name="givenName-en"]').fill('Cora');
            await addDlg.locator('input[name="familyName-en"]').fill('Contributor');
            await addDlg.locator('input[name="email"]').fill(`${st.tag}cora@mail.test`);
            const country = addDlg.locator('select[name="country"]');
            if (await country.count()) await country.selectOption({index: 1});
            const authorRole = addDlg.getByRole('checkbox', {name: 'Author', exact: true});
            if (await authorRole.count()) { if (await authorRole.isChecked()) await authorRole.uncheck(); await authorRole.check(); }
            await addDlg.getByRole('button', {name: 'Save', exact: true}).click();
            await idle(page);
            await addDlg.waitFor({state: 'hidden', timeout: 30_000}).catch(() => {});
            await capture(page, 'roles-S1-contributors', {contributorsText: (await wfModal(page).innerText().catch(() => '')).slice(0, 2500)});
            st.contributor = 'Cora Contributor'; save();
            }
            // the request on S1 from the button (the card needs a request or a decision, Rule 6): the manager
            if (!st.s1Requested) {
                await editorStage(S1.id, r(S1));
                await waitTableRows(page);
                const before = await capture(page, 'roles-mgr-S1-before-request', {table: await tableState(page)});
                await page.getByRole('button', {name: 'Request Response', exact: true}).click();
                await page.waitForURL(/requestAuthorResponse/, {timeout: 30_000});
                await waitRequestPage(page);
                const rp = await capture(page, 'roles-mgr-S1-request-page', {request: await requestPageState(page)});
                await page.getByRole('button', {name: 'Submit Request', exact: true}).click();
                const sdlg = page.locator('[role="dialog"]:visible').last();
                await sdlg.waitFor({timeout: 30_000});
                await idle(page);
                await capture(page, 'roles-mgr-S1-sent', {dialog: await sdlg.innerText().catch(() => null)});
                await sdlg.getByRole('link', {name: 'View Submission Summary'}).or(sdlg.getByRole('button', {name: 'View Submission Summary'})).first().click();
                await idle(page);
                st.s1Requested = true; save();
                done('roles-mgr-S1-request', {before: rows(before.table).map((x) => [x.cells[0], x.cells[1]]), rr: before.table.requestResponse, to: rp.request.textboxes.map((x) => x.name), messageHead: (rp.request.message || '').slice(0, 300)});
            }

            // the co-author (assigned, not the submitter) sees the card on S1 and submits
            await asUser(U.au2);
            await authorStage(S1.id, r(S1));
            const c1 = await capture(page, 'roles-au2-S1-stage', {card: await authorCard(page)});
            await loc(page, 'K4 co-author S1: card "Submit Response"', wfModal(page).getByRole('button', {name: 'Submit Response', exact: true}));
            const sub1 = await submitResponse(page, 'K4 first response, by the co-author.', [N.au]);
            const c1b = await capture(page, 'roles-au2-S1-after-submit', Object.assign({card: await authorCard(page)}, sub1));
            done('roles-au2-submit', {cardBefore: c1.card, boxes: sub1.windowBefore.checkboxes, after: c1b.card, dialogs: sub1.dialogs});

            // the submitter (another assigned author) reads it: "View Submitted Response"
            await asUser(U.au);
            await authorStage(S1.id, r(S1));
            const c2 = await capture(page, 'roles-au-S1-stage', {card: await authorCard(page)});
            await wfModal(page).getByRole('button', {name: 'View Submitted Response', exact: true}).click();
            const am = sideModal(page, 'Submit Your Response to Reviewer Feedback');
            await am.waitFor({timeout: 30_000});
            await idle(page);
            const aw = await windowState(page, am);
            await capture(page, 'roles-au-S1-view-window', {window: aw});
            await am.getByRole('button', {name: 'Cancel', exact: true}).click();
            await am.waitFor({state: 'hidden', timeout: 15_000}).catch(() => {});
            done('roles-au-view', {card: c2.card, window: {buttons: aw.buttons, checkboxes: aw.checkboxes, text: aw.modalText.slice(0, 600)}});

            // an author with the Author role but no assignment on S1
            await asUser(U.au3);
            await page.goto(app.url(`/index.php/${P}/dashboard/mySubmissions?workflowSubmissionId=${S1.id}&workflowMenuKey=workflow_3_${r(S1)}`));
            await idle(page);
            await page.waitForFunction(() => document.readyState === 'complete', null, {timeout: 15_000}).catch(() => {});
            const c3 = await capture(page, 'roles-au3-S1-stage', {card: await authorCard(page), landing: await landing(page)});
            done('roles-au3', {url: c3.landedUrl, card: c3.card, dialogs: c3.dialogText.map((d) => d.slice(0, 300))});
            // the unassigned author on the typed request address, and on the editorial address
            await page.goto(addr(S1.id, r(S1)));
            await idle(page);
            done('roles-au3-address', (await capture(page, 'roles-au3-S1-address', {landing: await landing(page)})).landing);

            // one account per editorial permission level, plus the Funding Coordinator: S1 (a response exists)
            for (const [key, username] of editorLevels) {
                await asUser(username);
                await editorStage(S1.id, r(S1));
                await waitTableRows(page);
                const ts = await tableState(page);
                const menus = await readMenus(page, [N.au, N.au2]);
                const s = await capture(page, `roles-${key}-S1-stage`, {table: ts, menus, participantsText: ((await wfModal(page).innerText().catch(() => '')).match(/Participants[\s\S]{0,600}/) || [null])[0]});
                const view = await viewViaMenu(page, N.au2);
                await capture(page, `roles-${key}-S1-view`, {view});
                done(`roles-${key}-S1`, {tableRows: ts.rows && rows(ts).map((x) => [x.cells[0], x.cells[1], x.moreActions.count]), headers: ts.headersDom, requestResponse: ts.requestResponse, menus, viewButtons: view.buttons, viewNote: (view.modalText || '').slice(0, 300), stageHeadings: (s.dialogText[0] || '').split('\n').filter((l) => /^[A-Z][A-Za-z &]+$/.test(l)).slice(0, 12)});
            }
            // the Funding Coordinator's "Delete" › "OK" on S1 (A3), then a manager's read
            await asUser(U.fund);
            await editorStage(S1.id, r(S1));
            await waitTableRows(page);
            const ft = page.getByRole('table', {name: 'Author Response'});
            const fm = await openMenu(page, rowOf(ft, N.au2));
            await fm.menu.getByText('Delete', {exact: true}).click();
            const fdlg = page.getByRole('dialog').filter({hasText: 'Are you sure'}).last();
            await fdlg.waitFor({timeout: 30_000});
            await capture(page, 'roles-fund-S1-delete-dialog', {dialog: await fdlg.innerText()});
            await fdlg.getByRole('button', {name: 'OK', exact: true}).click();
            await idle(page);
            const errDlg = page.getByRole('dialog').filter({hasText: 'Error'}).last();
            const errShown = await errDlg.waitFor({timeout: 15_000}).then(() => true).catch(() => false);
            const fa = await capture(page, 'roles-fund-S1-after-ok', {errShown, errText: errShown ? await errDlg.innerText() : null});
            if (errShown) { await errDlg.getByRole('button', {name: 'OK', exact: true}).click().catch(() => {}); await idle(page); }
            await page.reload();
            await idle(page);
            await wfModal(page).waitFor({timeout: 30_000}).catch(() => {});
            await waitTableRows(page);
            const fr = await capture(page, 'roles-fund-S1-after-reload', {table: await tableState(page)});
            done('roles-fund-delete', {errShown, errText: fa.errText, dialogsAfterOk: fa.dialogText.map((d) => d.slice(0, 200)), rowsAfterReload: rows(fr.table).map((x) => [x.cells[0], x.cells[1], x.moreActions.count])});

            // S2 round 1 (ready, no response): the table and "Request Response" per level; the typed address per role
            const press = {};
            for (const [key, username] of editorLevels) {
                await asUser(username);
                await editorStage(S2.id, r(S2, 0));
                await waitTableRows(page);
                const ts = await tableState(page);
                await capture(page, `roles-${key}-S2r1-stage`, {table: ts});
                const btn = page.getByRole('button', {name: 'Request Response', exact: true});
                if (key === 'se') await loc(page, 'K4 section editor S2 round 1: "Request Response"', btn);
                let after = null;
                if ((await btn.count()) && (await btn.isEnabled())) {
                    await btn.click();
                    await page.waitForURL((u) => !/dashboard\/editorial/.test(u.href), {timeout: 20_000}).catch(() => {});
                    await waitRequestPage(page);
                    after = await landing(page);
                    await capture(page, `roles-${key}-S2r1-after-press`, {landing: after, requestPage: after.requestPage ? await requestPageState(page) : null});
                    if (after.requestPage) {
                        await page.getByRole('button', {name: 'Cancel', exact: true}).click();
                        await page.waitForURL(/dashboard/, {timeout: 30_000}).catch(() => {});
                        await idle(page);
                        await wfModal(page).waitFor({timeout: 30_000}).catch(() => {});
                        await waitTableRows(page);
                        await capture(page, `roles-${key}-S2r1-after-cancel`, {table: await tableState(page)});
                    }
                }
                // the typed address, no ret (Actors row 8)
                await page.goto(addr(S2.id, r(S2, 0)));
                await waitRequestPage(page);
                const typed = await landing(page);
                await capture(page, `roles-${key}-S2r1-address`, {landing: typed});
                press[key] = {cell: ts.rows && ts.rows[0] && ts.rows[0].cells[1], requestResponse: ts.requestResponse, pressLanded: after && {url: after.landedUrl, requestPage: after.requestPage, denied: after.denied, h1: after.h1}, typed: {url: typed.landedUrl, requestPage: typed.requestPage, denied: typed.denied, h1: typed.h1}};
            }
            // reviewer and reader: the editorial address and the typed request address
            for (const [key, username] of [['rev', U.rev], ['rd', U.rd]]) {
                await asUser(username);
                await page.goto(app.url(`/index.php/${P}/dashboard/editorial?workflowSubmissionId=${S2.id}&workflowMenuKey=workflow_3_${r(S2, 0)}`));
                await idle(page);
                const st1 = await capture(page, `roles-${key}-S2r1-editorial-address`, {landing: await landing(page), table: await tableState(page)});
                await page.goto(addr(S2.id, r(S2, 0)));
                await waitRequestPage(page);
                const typed = await landing(page);
                await capture(page, `roles-${key}-S2r1-address`, {landing: typed});
                press[key] = {editorialAddress: {url: st1.landedUrl, tableCount: st1.table.tableCount, dialogs: st1.dialogText.map((d) => d.slice(0, 200))}, typed: {url: typed.landedUrl, requestPage: typed.requestPage, denied: typed.denied, h1: typed.h1}};
            }
            done('roles-S2r1', press);
        }

        // ---- edit: Rule 10 and Rule 11 on S1 ---------------------------------------------------------
        if (on('edit')) {
            const submitter = N.au2, other = N.au;
            if (!st.s1Edited) {
            await asUser(U.mgr);
            await editorStage(S1.id, r(S1));
            await waitTableRows(page);
            const t0 = await tableState(page);
            const menus = await readMenus(page, [other, submitter]);
            await capture(page, 'edit-mgr-S1-stage', {table: t0, menus});
            const v = await viewViaMenu(page, submitter, {keepOpen: true});
            const em = sideModal(page, 'Author Response to Reviews');
            await loc(page, 'K4 editor window: "Save"', em.getByRole('button', {name: 'Save', exact: true}));
            await capture(page, 'edit-mgr-S1-view', {view: v});
            // untick every box: "Save" greys; tick the contributor only; replace the text
            const boxes = await em.getByRole('checkbox').all();
            for (const c of boxes) if (await c.isChecked()) await c.uncheck();
            await idle(page);
            const saveNone = await buttonState(em.getByRole('button', {name: 'Save', exact: true}));
            const cora = em.getByRole('checkbox', {name: st.contributor});
            const hasCora = await cora.count();
            if (hasCora) await cora.check(); else await em.getByRole('checkbox').first().check();
            await idle(page);
            const saveOne = await buttonState(em.getByRole('button', {name: 'Save', exact: true}));
            const body = await richTextBody(em);
            await body.click();
            await page.keyboard.press('ControlOrMeta+A');
            await page.keyboard.press('Delete');
            await body.pressSequentially('K4 edited by the manager.');
            await idle(page);
            const before = await windowState(page, em);
            await em.getByRole('button', {name: 'Save', exact: true}).click();
            await em.waitFor({state: 'hidden', timeout: 30_000}).catch(() => {});
            await idle(page);
            const afterSave = await capture(page, 'edit-mgr-S1-after-save', {windowStillOpen: await em.isVisible().catch(() => false), table: await tableState(page)});
            done('edit-save', {menus, viewButtons: v.buttons, note: (v.modalText || '').slice(0, 300), bodyEditable: v.bodyEditable, saveNone, saveOne, hasCora, windowBefore: {checkboxes: before.checkboxes, body: before.body}, afterSave: {windowStillOpen: afterSave.windowStillOpen, rows: rows(afterSave.table).map((x) => [x.cells[0], x.cells[1]]), dialogs: afterSave.dialogText.map((d) => d.slice(0, 200))}});
            // the submitter re-reads: the edited text, headed with the original submitter's name
            await asUser(U.au2);
            await authorStage(S1.id, r(S1));
            const c = await capture(page, 'edit-au2-S1-stage', {card: await authorCard(page)});
            await wfModal(page).getByRole('button', {name: 'View Submitted Response', exact: true}).click();
            const am = sideModal(page, 'Submit Your Response to Reviewer Feedback');
            await am.waitFor({timeout: 30_000});
            await idle(page);
            const aw = await windowState(page, am);
            await capture(page, 'edit-au2-S1-view', {window: aw});
            await am.getByRole('button', {name: 'Cancel', exact: true}).click();
            await am.waitFor({state: 'hidden', timeout: 15_000}).catch(() => {});
            done('edit-author-reread', {card: c.card.cardText, body: aw.body, checkboxes: aw.checkboxes, buttons: aw.buttons});
            st.s1Edited = true; save();
            }

            // Rule 11 as the section editor: Cancel, then OK
            if (!st.s1Deleted) {
            await asUser(U.se);
            await editorStage(S1.id, r(S1));
            await waitTableRows(page);
            const t = page.getByRole('table', {name: 'Author Response'});
            let m = await openMenu(page, rowOf(t, submitter));
            await m.menu.getByText('Delete', {exact: true}).click();
            const dlg = page.getByRole('dialog').filter({hasText: 'Are you sure'}).last();
            await dlg.waitFor({timeout: 30_000});
            await idle(page);
            const d = {dialogText: await dlg.innerText(), buttons: await dlg.getByRole('button').evaluateAll((bs) => bs.map((b) => ({text: b.textContent.trim(), className: b.className, color: getComputedStyle(b).color})))};
            await capture(page, 'edit-se-S1-delete-dialog', d);
            await loc(page, 'K4 "Delete" dialog: "OK"', dlg.getByRole('button', {name: 'OK', exact: true}));
            await dlg.getByRole('button', {name: 'Cancel', exact: true}).click();
            await idle(page);
            const afterCancel = await capture(page, 'edit-se-S1-after-cancel', {table: await tableState(page)});
            m = await openMenu(page, rowOf(t, submitter));
            await m.menu.getByText('Delete', {exact: true}).click();
            await dlg.waitFor({timeout: 30_000});
            await dlg.getByRole('button', {name: 'OK', exact: true}).click();
            await idle(page);
            const early = await tableState(page);
            const changedWithin = await page.waitForFunction(() => [...document.querySelectorAll('table td')].some((td) => /Ready to invite author/i.test(td.textContent)), null, {timeout: 20_000}).then(() => true).catch(() => false);
            await idle(page);
            const settled = await capture(page, 'edit-se-S1-after-ok', {early, changedWithin, table: await tableState(page)});
            await page.reload();
            await idle(page);
            await wfModal(page).waitFor({timeout: 30_000}).catch(() => {});
            await waitTableRows(page);
            const reloaded = await capture(page, 'edit-se-S1-after-reload', {table: await tableState(page)});
            done('edit-delete', {dialog: d, afterCancel: rows(afterCancel.table).map((x) => [x.cells[0], x.cells[1], x.moreActions.count]), early: rows(early).map((x) => [x.cells[1], x.moreActions.count]), changedWithin, settled: {rows: rows(settled.table).map((x) => [x.cells[0], x.cells[1], x.moreActions.count]), rr: settled.table.requestResponse, dialogs: settled.dialogText.map((x) => x.slice(0, 200))}, reloaded: {headers: reloaded.table.headersDom, rows: rows(reloaded.table).map((x) => [x.cells[0], x.cells[1], x.moreActions.count]), rr: reloaded.table.requestResponse}});
            st.s1Deleted = true; save();
            }

            // the authors after the delete: the card returns; the submitter submits again without a new request
            const mailBefore = await app.mail.count({to: auMail, contains: S1.title});
            await asUser(U.au2);
            await authorStage(S1.id, r(S1));
            const c4 = await capture(page, 'edit-au2-S1-after-delete', {card: await authorCard(page)});
            await asUser(U.au);
            await authorStage(S1.id, r(S1));
            const c5 = await capture(page, 'edit-au-S1-after-delete', {card: await authorCard(page)});
            const sub2 = await submitResponse(page, 'K4 second response, by the submitter.', [N.au]);
            const c6 = await capture(page, 'edit-au-S1-second-submit', Object.assign({card: await authorCard(page)}, sub2));
            await asUser(U.mgr);
            await editorStage(S1.id, r(S1));
            await waitTableRows(page);
            const t2 = await tableState(page);
            const menus2 = await readMenus(page, [other, submitter]);
            await capture(page, 'edit-mgr-S1-after-second', {table: t2, menus: menus2});
            // the activity log after request-less submit, edit, delete, re-submit on S1
            const al = await openSideList(page, /Activity Log/, 'edit-mgr-S1-activity-log');
            done('edit-second', {mailBefore, mailAfter: await app.mail.count({to: auMail, contains: S1.title}), au2Card: c4.card, auCard: c5.card, afterSecond: c6.card, dialogs: sub2.dialogs, rows: rows(t2).map((x) => [x.cells[0], x.cells[1], x.moreActions.count]), menus: menus2, activityLog: al.listText.slice(0, 1500)});
        }

        // ---- address: A4 and Actors row 8 on S3 round 1 (ready, no request, no response) ----------------
        if (on('address')) {
            await asUser(U.mgr);
            const mailBefore = await app.mail.count({to: auMail, contains: S3.title});
            await page.goto(addr(S3.id, r(S3)));
            await waitRequestPage(page);
            const p1 = await capture(page, 'address-mgr-S3-page', {landing: await landing(page), request: await requestPageState(page)});
            await loc(page, 'K4 typed request page: "Cancel"', page.getByRole('button', {name: 'Cancel', exact: true}));
            await page.getByRole('button', {name: 'Cancel', exact: true}).click();
            await page.waitForURL((u) => !/requestAuthorResponse/.test(u.href), {timeout: 20_000}).catch(() => {});
            await idle(page);
            const p2 = await capture(page, 'address-mgr-S3-after-cancel', {landing: await landing(page), title: await page.title()});
            await page.goto(addr(S3.id, r(S3)));
            await waitRequestPage(page);
            await page.getByRole('button', {name: 'Submit Request', exact: true}).click();
            const dlg = page.locator('[role="dialog"]:visible').last();
            await dlg.waitFor({timeout: 30_000});
            await idle(page);
            const control = {
                dialogText: await dlg.innerText(),
                links: await dlg.getByRole('link').evaluateAll((as) => as.map((a) => ({text: a.innerText.trim(), href: a.getAttribute('href')}))),
                buttons: await dlg.getByRole('button').evaluateAll((bs) => bs.map((b) => b.innerText.trim())),
                anchors: await dlg.locator('a').evaluateAll((as) => as.map((a) => ({text: a.innerText.trim(), href: a.getAttribute('href'), className: a.className}))),
            };
            await capture(page, 'address-mgr-S3-sent-dialog', control);
            const ctl = dlg.getByText('View Submission', {exact: true});
            await loc(page, 'K4 sent dialog (no ret): "View Submission"', ctl);
            if (await ctl.count()) await ctl.first().click();
            await idle(page);
            const p3 = await capture(page, 'address-mgr-S3-after-control', {landing: await landing(page), dialogStillOpen: await dlg.isVisible().catch(() => false)});
            await page.keyboard.press('Escape');
            await page.waitForURL((u) => !/requestAuthorResponse/.test(u.href), {timeout: 20_000}).catch(() => {});
            await idle(page);
            const p4 = await capture(page, 'address-mgr-S3-after-escape', {landing: await landing(page), title: await page.title()});
            const mail = await mailOf(app, {to: auMail, contains: S3.title});
            // "any round of the submission": round 2 of S2 (not ready) by address
            await page.goto(addr(S2.id, r(S2, 1)));
            await waitRequestPage(page);
            const p5 = await capture(page, 'address-mgr-S2r2-page', {landing: await landing(page), request: await requestPageState(page)});
            await page.getByRole('button', {name: 'Cancel', exact: true}).click().catch(() => {});
            await page.waitForURL((u) => !/requestAuthorResponse/.test(u.href), {timeout: 20_000}).catch(() => {});
            await idle(page);
            done('address', {page: {url: p1.landedUrl, rendered: p1.request.rendered, subject: p1.request.textboxes.find((x) => /subject/i.test(x.name || ''))}, afterCancel: {url: p2.landedUrl, body: p2.bodyText.slice(0, 200), title: p2.title}, sent: control, afterControl: {url: p3.landedUrl, dialogStillOpen: p3.dialogStillOpen}, afterEscape: {url: p4.landedUrl, body: p4.bodyText.slice(0, 200)}, mail: mail && {subject: mail.subject, to: mail.to, href: mail.href}, mailCount: [mailBefore, await app.mail.count({to: auMail, contains: S3.title})], s2r2: {url: p5.landedUrl, rendered: p5.request.rendered, denied: p5.landing.denied}});
        }

        // ---- rounds: Rule 12 on S2 and S3; the cross-feature premises on the stage --------------------
        if (on('rounds')) {
            await asUser(U.mgr);
            await editorStage(S2.id, r(S2, 0));
            await waitTableRows(page);
            const wfText = await wfModal(page).innerText().catch(() => '');
            const reviewers = (wfText.match(/Reviewers[\s\S]{0,500}/) || [null])[0];
            const t1 = await capture(page, 'rounds-mgr-S2r1', {table: await tableState(page), reviewers});
            // the Reviewers panel: "Read Review" and the window's "Mark as Complete" (cross-feature premise)
            const rr = wfModal(page).getByRole('button', {name: 'Read Review', exact: true}).first();
            let readReview = null;
            if (await rr.count()) {
                await rr.click();
                const rd = page.locator('[role="dialog"]:visible').last();
                await rd.waitFor({timeout: 30_000}).catch(() => {});
                await idle(page);
                await rd.getByRole('button', {name: 'Mark as Complete', exact: true}).waitFor({timeout: 15_000}).catch(() => {});
                readReview = {text: (await rd.innerText().catch(() => '')).slice(0, 1500), buttons: await rd.getByRole('button').evaluateAll((bs) => bs.map((b) => b.innerText.trim()).filter(Boolean))};
                await capture(page, 'rounds-mgr-S2r1-read-review', readReview);
                await rd.getByRole('button', {name: 'Cancel', exact: true}).click().catch(() => page.keyboard.press('Escape'));
                await rd.waitFor({state: 'hidden', timeout: 15_000}).catch(() => {});
                await idle(page);
            }
            // the request on round 1
            const mailBefore = await app.mail.count({to: auMail, contains: S2.title});
            await page.getByRole('button', {name: 'Request Response', exact: true}).click();
            await page.waitForURL(/requestAuthorResponse/, {timeout: 30_000});
            await waitRequestPage(page);
            const rp = await capture(page, 'rounds-mgr-S2r1-request-page', {request: await requestPageState(page)});
            await page.getByRole('button', {name: 'Submit Request', exact: true}).click();
            const sdlg = page.locator('[role="dialog"]:visible').last();
            await sdlg.waitFor({timeout: 30_000});
            await idle(page);
            await capture(page, 'rounds-mgr-S2r1-sent', {dialog: await sdlg.innerText().catch(() => null)});
            await sdlg.getByRole('link', {name: 'View Submission Summary'}).or(sdlg.getByRole('button', {name: 'View Submission Summary'})).first().click();
            await idle(page);
            await wfModal(page).waitFor({timeout: 30_000}).catch(() => {});
            await waitTableRows(page);
            await capture(page, 'rounds-mgr-S2r1-after-sent', {table: await tableState(page)});
            const mail = await mailOf(app, {to: auMail, contains: S2.title});
            // round 2
            await editorStage(S2.id, r(S2, 1));
            await waitTableRows(page);
            const t2 = await capture(page, 'rounds-mgr-S2r2', {table: await tableState(page), menus: await readMenus(page, [N.au])});
            done('rounds-request', {r1: {rows: rows(t1.table).map((x) => [x.cells[0], x.cells[1], x.moreActions.count]), rr: t1.table.requestResponse, reviewers, readReview: readReview && readReview.buttons}, messageQuotes: rp.request.message && rp.request.message.includes(`Round one comments for S2 ${st.tag}.`), messageHead: (rp.request.message || '').slice(0, 400), mail: mail && {subject: mail.subject, href: mail.href}, mailCount: [mailBefore, await app.mail.count({to: auMail, contains: S2.title})], r2: {rows: rows(t2.table).map((x) => [x.cells[0], x.cells[1], x.moreActions.count]), rr: t2.table.requestResponse}});

            // the author: round 1 card and status box, round 2 no card; submit on round 1; round 2 again
            await asUser(U.au);
            await authorStage(S2.id, r(S2, 0));
            const a1 = await capture(page, 'rounds-au-S2r1', {card: await authorCard(page)});
            await authorStage(S2.id, r(S2, 1));
            const a2 = await capture(page, 'rounds-au-S2r2', {card: await authorCard(page)});
            await authorStage(S2.id, r(S2, 0));
            const sub = await submitResponse(page, 'K4 round-one response.', [N.au]);
            const a3 = await capture(page, 'rounds-au-S2r1-after-submit', Object.assign({card: await authorCard(page)}, sub));
            await authorStage(S2.id, r(S2, 1));
            const a4 = await capture(page, 'rounds-au-S2r2-after-submit', {card: await authorCard(page)});
            done('rounds-author', {r1: a1.card, r2: a2.card, r1After: a3.card, r2After: a4.card, dialogs: sub.dialogs});

            // the manager: round 2 by address, then "Review Round 1" by the workflow menu, "View"
            await asUser(U.mgr);
            await editorStage(S2.id, r(S2, 1));
            await waitTableRows(page);
            const m2 = await capture(page, 'rounds-mgr-S2r2-after', {table: await tableState(page)});
            await wfModal(page).getByText('Review Round 1', {exact: true}).first().click();
            await idle(page);
            await waitTableRows(page);
            const view = await viewViaMenu(page, N.au);
            const m1 = await capture(page, 'rounds-mgr-S2r1-via-menu', {table: await tableState(page), view});
            const al = await openSideList(page, /Activity Log/, 'rounds-mgr-S2-activity-log');
            done('rounds-past-round', {r2: rows(m2.table).map((x) => [x.cells[0], x.cells[1], x.moreActions.count]), r1Url: m1.landedUrl, r1Rows: rows(m1.table).map((x) => [x.cells[0], x.cells[1], x.moreActions.count]), r1RR: m1.table.requestResponse, viewBody: view.body, viewButtons: view.buttons, activityLog: al.listText.slice(0, 1200)});

            // "Request Revisions" on round 2: the Notify Authors message, then Cancel (cross-feature premise, Rule 6 pointer)
            await editorStage(S2.id, r(S2, 1));
            await waitTableRows(page);
            const rrBtn = wfModal(page).getByRole('button', {name: 'Request Revisions', exact: true});
            let revisions = {offered: await rrBtn.count()};
            if (revisions.offered) {
                await rrBtn.click();
                const choose = page.getByRole('dialog').filter({hasText: 'Require New Review Round'});
                revisions.chooseModal = await choose.waitFor({timeout: 10_000}).then(() => true).catch(() => false);
                if (revisions.chooseModal) {
                    await choose.getByRole('radio', {name: 'Revisions will not be subject to a new round of peer reviews.'}).check();
                    await choose.getByRole('button', {name: 'Next', exact: true}).click();
                }
                await page.waitForURL(/decision/, {timeout: 30_000}).catch(() => {});
                await idle(page);
                await page.locator('.composer__loadingTemplateMask').waitFor({state: 'hidden', timeout: 30_000}).catch(() => {});
                await page.locator('iframe').first().waitFor({timeout: 30_000}).catch(() => {});
                await page.waitForFunction(() => { const f = document.querySelector('iframe'); const b = f && f.contentDocument && f.contentDocument.body; return b && b.innerText.trim().length > 20; }, null, {timeout: 30_000}).catch(() => {});
                const body = page.frameLocator('iframe').first().locator('body');
                revisions.url = page.url();
                revisions.message = (await body.innerText().catch(() => '')).slice(0, 2500);
                revisions.anchors = await body.evaluate((b) => [...b.querySelectorAll('a')].map((a) => ({text: a.innerText.trim(), href: a.getAttribute('href')}))).catch(() => null);
                revisions.steps = await page.locator('main, body').first().innerText().then((x) => (x.match(/Notify Authors|Notify Reviewers/g) || [])).catch(() => null);
                await capture(page, 'rounds-mgr-S2r2-request-revisions-message', revisions);
                await page.getByRole('button', {name: 'Cancel', exact: true}).first().click();
                const cd = page.getByRole('dialog').filter({hasText: 'Cancel Decision'}).last();
                revisions.cancelDialog = await cd.waitFor({timeout: 10_000}).then(async () => (await cd.innerText()).slice(0, 300)).catch(() => null);
                if (revisions.cancelDialog) await cd.getByRole('button', {name: 'Cancel Decision', exact: true}).click();
                await page.waitForURL((u) => !/decision/.test(u.href), {timeout: 30_000}).catch(() => {});
                await idle(page);
                revisions.afterCancelUrl = page.url();
            }
            done('rounds-revisions-message', {offered: revisions.offered, chooseModal: revisions.chooseModal, url: revisions.url, anchors: revisions.anchors, hasButton: /Submit Author Response/.test(revisions.message || ''), cancelDialog: revisions.cancelDialog, afterCancelUrl: revisions.afterCancelUrl});

            // S3 (accepted): the author submits on the review round; the manager's Copyediting and Production
            await asUser(U.au);
            await authorStage(S3.id, r(S3));
            const s3a = await capture(page, 'rounds-au-S3-review', {card: await authorCard(page)});
            const sub3 = await submitResponse(page, 'K4 accepted-round response.', [N.au]);
            const s3b = await capture(page, 'rounds-au-S3-after-submit', Object.assign({card: await authorCard(page)}, sub3));
            await asUser(U.mgr);
            await gotoStage(page, app, P, 'editorial', S3.id);
            const land = await capture(page, 'rounds-mgr-S3-landing', {table: await tableState(page), headings: await wfModal(page).locator('h1,h2,h3,h4').evaluateAll((hs) => hs.filter((h) => h.offsetParent !== null).map((h) => h.innerText.trim())).catch(() => null)});
            await wfModal(page).getByText('Production', {exact: true}).first().click();
            await idle(page);
            const prod = await capture(page, 'rounds-mgr-S3-production', {table: await tableState(page), headings: await wfModal(page).locator('h1,h2,h3,h4').evaluateAll((hs) => hs.filter((h) => h.offsetParent !== null).map((h) => h.innerText.trim())).catch(() => null)});
            await wfModal(page).getByText('Review Round 1', {exact: true}).first().click();
            await idle(page);
            await waitTableRows(page);
            const view3 = await viewViaMenu(page, N.au);
            const rev3 = await capture(page, 'rounds-mgr-S3-review', {table: await tableState(page), view: view3});
            done('rounds-accepted', {authorCard: s3a.card, afterSubmit: s3b.card, landing: {url: land.landedUrl, headings: land.headings, tableCount: land.table.tableCount, responseInText: /response was submitted|Author Response/.test(land.dialogText.join('\n'))}, production: {url: prod.landedUrl, headings: prod.headings, tableCount: prod.table.tableCount, responseInText: /response was submitted|Author Response/.test(prod.dialogText.join('\n'))}, review: {url: rev3.landedUrl, rows: rows(rev3.table).map((x) => [x.cells[0], x.cells[1], x.moreActions.count]), viewBody: view3.body, viewButtons: view3.buttons}});
        }

        // ---- xf: the settings screens the cross-feature pointers name ---------------------------------
        if (on('xf')) {
            await asUser(U.mgr);
            await page.goto(app.url(`/index.php/${P}/management/settings/workflow#review`));
            await idle(page);
            await page.getByRole('tab', {name: 'Review', exact: true}).click().catch(() => {});
            await idle(page);
            const rv = await capture(page, 'xf-settings-review');
            const rvText = rv.bodyText;
            await page.getByRole('tab', {name: 'Emails', exact: true}).click().catch(() => {});
            await idle(page);
            const em = await capture(page, 'xf-settings-emails');
            // the templates list is its own page, the tab's link "Add and edit templates" (management/settings/manageEmails)
            await page.getByRole('link', {name: 'Add and edit templates'}).click();
            await idle(page);
            const search = page.getByRole('searchbox').or(page.getByRole('textbox', {name: /Search/i})).first();
            const found = {emailsTabHasLink: em.bodyText.includes('Add and edit templates'), url: page.url()};
            for (const name of ['Request Author Review Response', 'Notify Other Authors']) {
                if (await search.count()) { await search.fill(name); await page.keyboard.press('Enter'); await idle(page); }
                const s = await capture(page, `xf-manage-emails-${name.replace(/\s+/g, '-').toLowerCase()}`);
                found[name] = s.bodyText.includes(name);
            }
            done('xf-settings', {review: {minimum: rvText.includes('Minimum Confirmed Reviews Required'), publicly: rvText.includes('Publicly Show Reviewer Comments'), reviewMode: rvText.includes('Default Review Mode'), reviewForms: rvText.includes('Review Forms')}, emails: found});
        }
        await signOut(page);
    } finally {
        await close();
    }
});
