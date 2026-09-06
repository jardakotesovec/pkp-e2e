// U30 claim check, chunk K3: the author's "Author Response" card, the email's
// "Submit Author Response" button, the response window ("Submit Your
// Response to Reviewer Feedback"), re-reading as the author, and register
// entry A2 (nobody is told when the response arrives). OJS, seeded journal.
// Spec: docs/specs/U30-author-response-to-reviews.md — Rules 6–9 (188–241), A2.
//
// Seeds four throwaway submissions on the seeded journal (S1 the main drive,
// S2 a "requestRevisions" round, S3 a round the editor takes through the
// Request Revisions wizard, S4 an accepted round), signs in from the roster
// and records every screen with screen(). State lives in k3-state-ojs.json
// so later phases can be re-run alone.
//
//   PROBE_FEATURE=U30 PROBE_AGENT=ccK3 node bin/probe.js ojs shared/playwright/checks/U30/K3/k3.js
//   PHASES=seed,before,request,card,link,submit,reread,bea,editor,afterdelete,rounds,revisions,discussion,extra,upload,edit,stage,lost   (UPLOAD_ON=S1|S3 picks the upload's seed)
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, signOut, screen, shot, record, loc, note, idle, tag, outDir, users} =
    require('../../../probe');

const ALL = ['seed', 'before', 'request', 'card', 'link', 'submit', 'reread', 'bea', 'editor', 'afterdelete', 'rounds', 'revisions', 'discussion', 'extra', 'upload', 'edit', 'stage', 'lost'];
const PHASES = process.env.PHASES ? process.env.PHASES.split(',') : ALL;
const on = (p) => PHASES.includes(p);
const log = (...a) => console.log(...a);
const stateFile = (app) => path.join(outDir(), `k3-state-${app.name}.json`);

const RESPONSE = 'We thank the reviewer and will add a control group.';
const EXTRA = ' Extra typed on re-read.';
const WINDOW_AUTHOR = 'Submit Your Response to Reviewer Feedback';

async function buttonState(locator) {
    const count = await locator.count();
    if (!count) return {count};
    const el = locator.first();
    return {
        count,
        visible: await el.isVisible(),
        enabled: await el.isEnabled().catch(() => null),
        disabledAttr: await el.getAttribute('disabled'),
        ariaDisabled: await el.getAttribute('aria-disabled'),
        text: (await el.innerText().catch(() => '')).trim(),
    };
}
async function dialogTexts(page) {
    const out = [];
    for (const d of await page.locator('[role="dialog"]:visible').all()) out.push((await d.innerText().catch(() => '')).trim());
    return out;
}
const wf = (page) => page.getByRole('dialog').first();
const sideModal = (page, titleText) => page.locator('[role="dialog"]:visible').filter({hasText: titleText}).last();

async function mailCounts(app, title) {
    const counts = {};
    for (const u of ['author.alex', 'author.bea', 'editor.diana', 'sectioneditor.ana']) {
        counts[u] = await app.mail.count({to: `${u}@mail.test`, contains: title});
    }
    return counts;
}
async function mailOf(app, {to, contains, subject}) {
    const m = await app.mail.find({to, contains, subject, timeoutMs: 20_000});
    const full = await app.mail.fullMessage(m.ID);
    return {
        id: m.ID, subject: full.Subject, from: full.From, to: full.To, cc: full.Cc, bcc: full.Bcc,
        href: app.mail.extractLink(full.HTML, 'Submit Author Response'),
        text: (full.Text || '').slice(0, 2500),
    };
}

// ---- the author's stage ------------------------------------------------------
async function authorStage(page, app, id, round) {
    await page.goto(app.url(`/index.php/${app.contextPath}/dashboard/mySubmissions?workflowSubmissionId=${id}&workflowMenuKey=workflow_3_${round}`));
    await idle(page);
    await wf(page).waitFor({timeout: 30_000});
    await wf(page).locator('h3').first().waitFor({timeout: 30_000}).catch(() => {});
    await idle(page);
}
// The card and the round's status box, as data.
async function cardState(page) {
    const w = wf(page);
    const heading = w.getByRole('heading', {name: 'Author Response', exact: true});
    const cardText = await heading.first().locator('xpath=..').innerText().catch(() => null);
    const statusHeading = w.locator('h3').filter({hasText: /Status$/}).first();
    return {
        panels: await w.locator('h2, h3, h4').allInnerTexts().catch(() => []),
        cardHeadingCount: await heading.count(),
        cardText: cardText && cardText.trim(),
        submitResponse: await buttonState(w.getByRole('button', {name: 'Submit Response', exact: true})),
        viewSubmitted: await buttonState(w.getByRole('button', {name: 'View Submitted Response', exact: true})),
        statusHeading: (await statusHeading.innerText().catch(() => '')).trim(),
        statusBox: (await statusHeading.locator('xpath=..').innerText().catch(() => '')).trim(),
        notifications: (await w.locator('h3').filter({hasText: /^Notifications$/}).first().locator('xpath=..').innerText().catch(() => '')).trim(),
    };
}
async function captureAuthor(page, name) {
    const s = await screen(page);
    s.dialogText = await dialogTexts(page);
    s.card = await cardState(page);
    record(name, s);
    await shot(page, name).catch(() => {});
    return s;
}
// The response window (author's or editor's), as data.
async function windowState(page, modal) {
    const body = modal.frameLocator('iframe').first().locator('body');
    const boxes = [];
    for (const cb of await modal.getByRole('checkbox').all()) {
        boxes.push({name: await cb.getAttribute('aria-label') || (await cb.locator('xpath=..').innerText().catch(() => '')).trim(), checked: await cb.isChecked()});
    }
    return {
        title: (await modal.locator('h1, h2').first().innerText().catch(() => '')).trim(),
        text: (await modal.innerText()).trim(),
        bodyText: (await body.innerText().catch(() => null)),
        bodyContentEditable: await body.getAttribute('contenteditable').catch(() => null),
        checkboxes: boxes,
        submit: await buttonState(modal.getByRole('button', {name: 'Submit Response', exact: true})),
        save: await buttonState(modal.getByRole('button', {name: 'Save', exact: true})),
        cancel: await buttonState(modal.getByRole('button', {name: 'Cancel', exact: true})),
        buttons: await modal.getByRole('button').allInnerTexts().catch(() => []),
    };
}
async function captureWindow(page, modal, name) {
    const s = await screen(page);
    s.window = await windowState(page, modal);
    record(name, s);
    await shot(page, name).catch(() => {});
    return s;
}
async function openWindow(page, buttonName, title) {
    await wf(page).getByRole('button', {name: buttonName, exact: true}).click();
    const modal = sideModal(page, title);
    await modal.waitFor({timeout: 30_000});
    await modal.locator('iframe').first().waitFor({timeout: 30_000});
    await idle(page);
    return modal;
}
async function typeInBody(page, modal, text, {replace = false} = {}) {
    const body = modal.frameLocator('iframe').first().locator('body');
    await body.click();
    if (replace) await page.keyboard.press('ControlOrMeta+A');
    await body.pressSequentially(text);
    await idle(page);
}

// ---- the editor's stage --------------------------------------------------------
async function editorStage(page, app, id, round) {
    await page.goto(app.url(`/index.php/${app.contextPath}/dashboard/editorial?workflowSubmissionId=${id}&workflowMenuKey=workflow_3_${round}`));
    await idle(page);
    await page.getByRole('heading', {name: 'Author Response'}).first().waitFor({timeout: 30_000});
    await page.getByRole('table', {name: 'Author Response'}).locator('tbody tr').filter({hasNotText: 'No Items'}).first().waitFor({timeout: 30_000}).catch(() => {});
    await idle(page);
}
async function editorTable(page) {
    const table = page.getByRole('table', {name: 'Author Response'});
    if (!(await table.count())) return null;
    const rows = [];
    for (const tr of await table.locator('tbody tr').all()) {
        rows.push({
            dom: await tr.locator('td').evaluateAll((els) => els.map((e) => e.textContent.replace(/\s+/g, ' ').trim())),
            buttons: await tr.getByRole('button').evaluateAll((els) => els.map((e) => ({name: e.getAttribute('aria-label') || e.textContent.trim(), disabled: e.disabled || e.getAttribute('aria-disabled') === 'true'}))),
        });
    }
    return {
        headersDom: await table.locator('th').evaluateAll((els) => els.map((e) => e.textContent.replace(/\s+/g, ' ').trim())),
        rows,
        requestResponse: await buttonState(page.getByRole('button', {name: 'Request Response', exact: true})),
    };
}
async function captureEditor(page, name, extra = {}) {
    const s = await screen(page);
    s.dialogText = await dialogTexts(page);
    s.table = await editorTable(page);
    const statusHeading = wf(page).locator('h3').filter({hasText: /Status$/}).first();
    s.statusBox = (await statusHeading.locator('xpath=..').innerText().catch(() => '')).trim();
    s.panels = await wf(page).locator('h2, h3, h4').allInnerTexts().catch(() => []);
    Object.assign(s, extra);
    record(name, s);
    await shot(page, name).catch(() => {});
    return s;
}
async function waitRequestPage(page) {
    await page.waitForURL(/requestAuthorResponse/, {timeout: 30_000});
    await idle(page);
    await page.getByRole('button', {name: 'Submit Request'}).waitFor({timeout: 30_000});
    await page.locator('iframe').first().waitFor({timeout: 30_000});
    await page.getByText('Loading', {exact: true}).waitFor({state: 'hidden', timeout: 30_000}).catch(() => {});
    await page.waitForFunction(() => { const f = document.querySelector('iframe'); const b = f && f.contentDocument && f.contentDocument.body; return b && b.innerText.trim().length > 20; }, null, {timeout: 30_000}).catch(() => {});
    await idle(page);
}
async function dashboardRow(page, app, title) {
    await page.goto(app.url(`/index.php/${app.contextPath}/dashboard/editorial?currentViewId=assigned-to-me`));
    await idle(page);
    const row = page.locator('main').getByText(title, {exact: false}).first().locator('xpath=ancestor::*[self::li or self::tr][1]');
    return (await row.innerText().catch(() => 'row not found')).trim();
}
async function openTasks(page) {
    const btn = page.getByRole('button', {name: /^Tasks/}).first();
    const buttonText = (await btn.innerText().catch(() => '')).trim();
    await btn.click();
    const dlg = page.locator('[role="dialog"]:visible').last();
    await dlg.waitFor({timeout: 30_000});
    await dlg.locator('table tbody tr, .pkp_controllers_grid tr, [role="row"], .listPanel__item, li').first().waitFor({timeout: 30_000}).catch(() => {});
    await idle(page);
    return {buttonText, dialogText: (await dlg.innerText()).trim().slice(0, 4000)};
}
async function openActivityLog(page) {
    await page.getByRole('button', {name: /Activity Log/}).first().click();
    const dlg = page.locator('[role="dialog"]:visible').last();
    await dlg.waitFor({timeout: 30_000});
    await dlg.locator('table tbody tr').first().waitFor({timeout: 30_000}).catch(() => {});
    await idle(page);
    return (await dlg.innerText()).trim().slice(0, 6000);
}

forEachApp(async (app) => {
    const ctx = app.contextPath;
    let st = fs.existsSync(stateFile(app)) ? JSON.parse(fs.readFileSync(stateFile(app), 'utf8')) : {};
    const save = () => fs.writeFileSync(stateFile(app), JSON.stringify(st, null, 2));

    if (on('seed') && !st.S1) {
        const seed = async (key, prefix, spec) => {
            const t = tag(prefix);
            const title = `U30 K3 ${key} ${t}`;
            const r = await app.api.createSubmission(Object.assign({
                tag: t, context: ctx, submitter: 'author.alex', title, section: 'ART',
                decisions: ['sendExternalReview'],
                participants: [{username: 'sectioneditor.ana', role: 'sectionEditor'}],
            }, spec));
            st[key] = {id: r.submissionId, round: r.reviewRounds[0].id, rounds: r.reviewRounds, title, tag: t};
            log(`seeded ${key}: submission ${r.submissionId}, round ${st[key].round}`);
        };
        await seed('S1', 'u30k3a', {
            participants: [{username: 'sectioneditor.ana', role: 'sectionEditor'}, {username: 'author.bea', role: 'author'}],
            reviewRounds: [{reviewers: [{username: 'reviewer.julia', status: 'completed', recommendation: 'pendingRevisions', comments: 'Reviewer comments for K3 S1.'}]}],
        });
        await seed('S2', 'u30k3b', {
            decisions: ['sendExternalReview', 'requestRevisions'],
            reviewRounds: [{reviewers: [{username: 'reviewer.julia', status: 'completed'}]}],
        });
        await seed('S3', 'u30k3c', {
            reviewRounds: [{reviewers: [{username: 'reviewer.julia', status: 'completed'}]}],
        });
        await seed('S4', 'u30k3d', {
            decisions: ['sendExternalReview', 'accept'],
            reviewRounds: [{reviewers: [{username: 'reviewer.julia', status: 'completed'}]}],
        });
        st.mail = {seeded: await mailCounts(app, st.S1.title)};
        save();
        record('k3-seeds', st);
    }
    const {S1, S2, S3, S4} = st;
    const {page, close} = await launch(app);
    try {
        // ---- before: no card before a request (S1, S3; the exclusive side of Rule 6)
        if (on('before')) {
            await signIn(page, 'author.alex');
            await authorStage(page, app, S1.id, S1.round);
            await captureAuthor(page, 'k3-before-alex-S1');
            await loc(page, 'K3 author stage: "Author Response" card heading (absent before a request)', wf(page).getByRole('heading', {name: 'Author Response', exact: true}));
            await authorStage(page, app, S3.id, S3.round);
            await captureAuthor(page, 'k3-before-alex-S3');
            await signOut(page);
        }

        // ---- request: editor.diana sends the request on S1; the dashboard row before
        if (on('request')) {
            await signIn(page, 'editor.diana');
            st.dashboardRowBefore = await dashboardRow(page, app, S1.title);
            await editorStage(page, app, S1.id, S1.round);
            await captureEditor(page, 'k3-request-editor-before');
            await page.getByRole('button', {name: 'Request Response', exact: true}).click();
            await waitRequestPage(page);
            record('k3-request-page', await screen(page));
            await page.getByRole('button', {name: 'Submit Request'}).click();
            await page.getByRole('dialog').filter({hasText: /Request for review response sent|Error/}).waitFor({timeout: 30_000}).catch(() => {});
            await idle(page);
            const s = await screen(page); s.dialogText = await dialogTexts(page);
            record('k3-request-sent', s);
            const mail = await mailOf(app, {to: 'author.alex@mail.test', contains: S1.title});
            st.requestMail = mail;
            st.mail.afterRequest = await mailCounts(app, S1.title);
            save();
            record('k3-request-mail', {mail, counts: st.mail});
            await signOut(page);
        }

        // ---- card: Rule 6 (before a response) and Rule 8's empty window
        if (on('card')) {
            await signIn(page, 'author.alex');
            await authorStage(page, app, S1.id, S1.round);
            await captureAuthor(page, 'k3-card-alex-S1');
            await loc(page, 'K3 author card: "Submit Response"', wf(page).getByRole('button', {name: 'Submit Response', exact: true}));
            const modal = await openWindow(page, 'Submit Response', WINDOW_AUTHOR);
            await loc(page, 'K3 response window', modal);
            const empty = await captureWindow(page, modal, 'k3-window-empty');
            const submit = modal.getByRole('button', {name: 'Submit Response', exact: true});
            const box = modal.getByRole('checkbox').first();
            const states = {empty: empty.window.submit};
            await typeInBody(page, modal, RESPONSE);
            states.textOnly = await buttonState(submit);
            await box.check(); await idle(page);
            states.textAndTick = await buttonState(submit);
            await box.uncheck(); await idle(page);
            states.textUnticked = await buttonState(submit);
            await box.check(); await idle(page);
            states.textReticked = await buttonState(submit);
            record('k3-window-button-states', states);
            // Cancel: closes, nothing kept
            await modal.getByRole('button', {name: 'Cancel', exact: true}).click();
            await modal.waitFor({state: 'hidden', timeout: 15_000}).catch(() => {});
            await idle(page);
            await captureAuthor(page, 'k3-window-after-cancel');
            const modal2 = await openWindow(page, 'Submit Response', WINDOW_AUTHOR);
            await captureWindow(page, modal2, 'k3-window-reopened');
            await modal2.getByRole('button', {name: 'Cancel', exact: true}).click();
            await modal2.waitFor({state: 'hidden', timeout: 15_000}).catch(() => {});
            await signOut(page);
        }

        // ---- link: Rule 7, the email's "Submit Author Response"
        if (on('link')) {
            const href = st.requestMail.href;
            await signIn(page, 'author.alex');
            await page.goto(href);
            await idle(page);
            const modal = sideModal(page, WINDOW_AUTHOR);
            const opened = await modal.waitFor({timeout: 30_000}).then(() => true).catch(() => false);
            await idle(page);
            const s1 = await captureAuthor(page, 'k3-link-landing');
            s1.windowOpen = opened; s1.landingUrl = page.url();
            if (opened) s1.window = await windowState(page, modal);
            record('k3-link-landing', s1);
            await modal.getByRole('button', {name: 'Cancel', exact: true}).click();
            await modal.waitFor({state: 'hidden', timeout: 15_000}).catch(() => {});
            await idle(page);
            const s2 = await captureAuthor(page, 'k3-link-after-cancel');
            record('k3-link-after-cancel', Object.assign(s2, {windowVisible: await modal.isVisible().catch(() => false)}));
            await page.reload();
            await idle(page);
            await wf(page).waitFor({timeout: 30_000}).catch(() => {});
            await idle(page);
            const s3 = await captureAuthor(page, 'k3-link-after-reload');
            record('k3-link-after-reload', Object.assign(s3, {windowVisible: await sideModal(page, WINDOW_AUTHOR).isVisible().catch(() => false)}));
            await signOut(page);
            // signed out: a fresh browser context
            const fresh = await launch(app);
            try {
                const p2 = fresh.page;
                await p2.goto(href);
                await idle(p2);
                record('k3-link-signed-out', await screen(p2));
                await shot(p2, 'k3-link-signed-out');
                await p2.locator('input#username').fill('author.alex');
                await p2.locator('input#password').evaluate((el) => el.removeAttribute('maxlength'));
                await p2.locator('input#password').fill(users.getPassword('author.alex'));
                await p2.locator('form#login button[type="submit"]').click();
                await idle(p2);
                const m2 = sideModal(p2, WINDOW_AUTHOR);
                const opened2 = await m2.waitFor({timeout: 30_000}).then(() => true).catch(() => false);
                await idle(p2);
                const s4 = await captureAuthor(p2, 'k3-link-after-login');
                s4.windowOpen = opened2; s4.landingUrl = p2.url();
                if (opened2) s4.window = await windowState(p2, m2);
                record('k3-link-after-login', s4);
                await signOut(p2);
            } finally {
                await fresh.close();
            }
        }

        // ---- submit: Rule 8's second half; A2's mail counts
        if (on('submit')) {
            st.mail.beforeSubmit = await mailCounts(app, S1.title);
            await signIn(page, 'author.alex');
            await authorStage(page, app, S1.id, S1.round);
            const modal = await openWindow(page, 'Submit Response', WINDOW_AUTHOR);
            await typeInBody(page, modal, RESPONSE);
            await modal.getByRole('checkbox').first().check();
            await idle(page);
            const submit = modal.getByRole('button', {name: 'Submit Response', exact: true});
            const posted = page.waitForResponse((r) => /authorResponse$/.test(r.url()) && r.request().method() === 'POST', {timeout: 30_000}).catch(() => null);
            await submit.click();
            const resp = await posted;
            await modal.waitFor({state: 'hidden', timeout: 30_000}).catch(() => {});
            await idle(page);
            const s = await captureAuthor(page, 'k3-submit-after');
            record('k3-submit-after', Object.assign(s, {postStatus: resp && resp.status(), windowVisible: await modal.isVisible().catch(() => false)}));
            st.mail.afterSubmit = await mailCounts(app, S1.title);
            save();
            record('k3-submit-mail-counts', st.mail);
            await signOut(page);
        }

        // ---- reread: Rule 9
        if (on('reread')) {
            await signIn(page, 'author.alex');
            await authorStage(page, app, S1.id, S1.round);
            await loc(page, 'K3 author card: "View Submitted Response"', wf(page).getByRole('button', {name: 'View Submitted Response', exact: true}));
            const modal = await openWindow(page, 'View Submitted Response', WINDOW_AUTHOR);
            await captureWindow(page, modal, 'k3-reread-window');
            await typeInBody(page, modal, EXTRA);
            const afterType = await windowState(page, modal);
            await modal.getByRole('checkbox').first().uncheck(); await idle(page);
            const afterUntick = await windowState(page, modal);
            record('k3-reread-edit-attempt', {afterType, afterUntick});
            await modal.getByRole('button', {name: 'Cancel', exact: true}).click();
            await modal.waitFor({state: 'hidden', timeout: 15_000}).catch(() => {});
            await idle(page);
            await captureAuthor(page, 'k3-reread-after-cancel');
            const modal2 = await openWindow(page, 'View Submitted Response', WINDOW_AUTHOR);
            await captureWindow(page, modal2, 'k3-reread-window-again');
            await modal2.getByRole('button', {name: 'Cancel', exact: true}).click();
            await modal2.waitFor({state: 'hidden', timeout: 15_000}).catch(() => {});
            await signOut(page);
        }

        // ---- bea: the second assigned author (Rule 8 last sentence)
        if (on('bea')) {
            await signIn(page, 'author.bea');
            await authorStage(page, app, S1.id, S1.round);
            await captureAuthor(page, 'k3-bea-stage');
            const modal = await openWindow(page, 'View Submitted Response', WINDOW_AUTHOR);
            await captureWindow(page, modal, 'k3-bea-window');
            await modal.getByRole('button', {name: 'Cancel', exact: true}).click();
            await modal.waitFor({state: 'hidden', timeout: 15_000}).catch(() => {});
            await signOut(page);
        }

        // ---- editor: the table with a response (Rule 8), A2's Tasks / dashboard / log, then Delete
        if (on('editor')) {
            await signIn(page, 'editor.diana');
            st.dashboardRowAfter = await dashboardRow(page, app, S1.title);
            record('k3-editor-dashboard-row', {before: st.dashboardRowBefore, after: st.dashboardRowAfter});
            await shot(page, 'k3-editor-dashboard');
            const tasks = await openTasks(page);
            record('k3-editor-tasks', Object.assign(await screen(page), tasks));
            await shot(page, 'k3-editor-tasks');
            await page.keyboard.press('Escape');
            await idle(page);
            await editorStage(page, app, S1.id, S1.round);
            await captureEditor(page, 'k3-editor-table-with-response');
            const log1 = await openActivityLog(page);
            record('k3-editor-activity-log', Object.assign(await screen(page), {logText: log1}));
            await shot(page, 'k3-editor-activity-log');
            await page.keyboard.press('Escape');
            await idle(page);
            // Delete › OK (Rule 6 last sentence needs the round without a response)
            const table = page.getByRole('table', {name: 'Author Response'});
            const row = table.locator('tbody tr').filter({has: page.locator('td:first-child', {hasText: 'Alex Author'})});
            await row.getByRole('button', {name: /More Actions/}).first().click();
            await idle(page);
            await page.locator('[role="menu"]:visible').last().getByRole('menuitem', {name: 'Delete'}).click();
            const confirm = page.getByRole('dialog').filter({hasText: 'Are you sure'}).last();
            await confirm.waitFor({timeout: 30_000});
            record('k3-editor-delete-dialog', Object.assign(await screen(page), {dialogText: await dialogTexts(page)}));
            await confirm.getByRole('button', {name: 'OK', exact: true}).click();
            await confirm.waitFor({state: 'hidden', timeout: 30_000}).catch(() => {});
            const refreshed = await page.waitForFunction(() => [...document.querySelectorAll('table td')].some((td) => /Ready to invite author/.test(td.textContent)), null, {timeout: 30_000}).then(() => true).catch(() => false);
            await idle(page);
            await captureEditor(page, 'k3-editor-after-delete', {refreshedWithin30s: refreshed});
            st.mail.afterDelete = await mailCounts(app, S1.title);
            save();
            await signOut(page);
        }

        // ---- afterdelete: Rule 6 last sentence — the card stays after the delete
        if (on('afterdelete')) {
            await signIn(page, 'author.alex');
            await authorStage(page, app, S1.id, S1.round);
            await captureAuthor(page, 'k3-afterdelete-alex-S1');
            await signOut(page);
        }

        // ---- rounds: Rule 6's other two triggers (S2 revisions requested, S4 accepted)
        if (on('rounds')) {
            await signIn(page, 'author.alex');
            await authorStage(page, app, S2.id, S2.round);
            await captureAuthor(page, 'k3-rounds-alex-S2-revisions');
            await authorStage(page, app, S4.id, S4.round);
            await captureAuthor(page, 'k3-rounds-alex-S4-accepted');
            await signOut(page);
            await signIn(page, 'manager.maya');
            await editorStage(page, app, S4.id, S4.round);
            await captureEditor(page, 'k3-rounds-maya-S4-accepted');
            await signOut(page);
            st.mail.S2seeded = await mailCounts(app, S2.title);
            save();
            record('k3-rounds-S2-mail', st.mail.S2seeded);
        }

        // ---- revisions: the Request Revisions decision email on OJS (Rule 6), then the author from its button
        if (on('revisions')) {
            await signIn(page, 'editor.diana');
            await editorStage(page, app, S3.id, S3.round);
            const rr = wf(page).getByRole('button', {name: 'Request Revisions', exact: true});
            await rr.waitFor({timeout: 30_000});
            await loc(page, 'K3 editor review stage: "Request Revisions"', rr);
            await rr.click();
            const choose = page.getByRole('dialog').filter({hasText: 'Require New Review Round'});
            const hasModal = await choose.waitFor({timeout: 10_000}).then(() => true).catch(() => false);
            if (hasModal) {
                await idle(page);
                record('k3-revisions-choose-round', Object.assign(await screen(page), {dialogText: await dialogTexts(page)}));
                await choose.getByRole('radio', {name: 'Revisions will not be subject to a new round of peer reviews.'}).check();
                await choose.getByRole('button', {name: 'Next', exact: true}).click();
            }
            await page.waitForURL(/decision/, {timeout: 30_000}).catch(() => {});
            await idle(page);
            await page.locator('.composer__loadingTemplateMask').waitFor({state: 'hidden', timeout: 30_000}).catch(() => {});
            await page.locator('iframe').first().waitFor({timeout: 30_000}).catch(() => {});
            await page.waitForFunction(() => { const f = document.querySelector('iframe'); const b = f && f.contentDocument && f.contentDocument.body; return b && b.innerText.trim().length > 20; }, null, {timeout: 30_000}).catch(() => {});
            const s = await screen(page);
            s.hasModal = hasModal;
            s.messageText = (await page.frameLocator('iframe').first().locator('body').innerText().catch(() => null));
            s.messageHtmlHasButton = /Submit Author Response/.test(await page.frameLocator('iframe').first().locator('body').innerHTML().catch(() => ''));
            s.subject = await page.getByRole('textbox', {name: 'Subject'}).inputValue().catch(() => null);
            record('k3-revisions-notify-authors', s);
            await shot(page, 'k3-revisions-notify-authors');
            const cont = page.getByRole('button', {name: 'Continue', exact: true});
            const rec = page.getByRole('button', {name: 'Record Decision', exact: true});
            for (let i = 0; i < 5 && !(await rec.isVisible().catch(() => false)); i++) { await cont.click(); await idle(page); }
            await rec.click();
            await page.getByRole('dialog').first().waitFor({timeout: 30_000}).catch(() => {});
            await idle(page);
            record('k3-revisions-recorded', Object.assign(await screen(page), {dialogText: await dialogTexts(page)}));
            await shot(page, 'k3-revisions-recorded');
            const mail = await mailOf(app, {to: 'author.alex@mail.test', contains: S3.title, subject: 'encourage you to submit revisions'});
            st.decisionMail = mail; save();
            record('k3-revisions-mail', mail);
            await signOut(page);
            // the author, from the decision email's button
            await signIn(page, 'author.alex');
            await page.goto(mail.href);
            await idle(page);
            const modal = sideModal(page, WINDOW_AUTHOR);
            const opened = await modal.waitFor({timeout: 30_000}).then(() => true).catch(() => false);
            await idle(page);
            const s2 = await captureAuthor(page, 'k3-revisions-alex-from-mail');
            s2.windowOpen = opened; s2.landingUrl = page.url();
            if (opened) s2.window = await windowState(page, modal);
            record('k3-revisions-alex-from-mail', s2);
            if (opened) {
                await modal.getByRole('button', {name: 'Cancel', exact: true}).click();
                await modal.waitFor({state: 'hidden', timeout: 15_000}).catch(() => {});
            }
            await signOut(page);
        }

        // ---- discussion: A2's lean — another author action (a discussion) does raise a task
        if (on('discussion')) {
            const name = `K3 discussion ${S1.tag}`;
            await signIn(page, 'author.alex');
            await authorStage(page, app, S1.id, S1.round);
            const panel = page.locator('[data-cy="discussion-manager"]').first();
            await panel.getByRole('button', {name: 'Add', exact: true}).click();
            const modal = page.locator('[data-cy="active-modal"]').filter({has: page.locator('input[name="title"]')});
            await modal.locator('input[name="title"]').fill(name);
            const boxNames = await modal.getByRole('checkbox').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') || e.parentElement.textContent.trim()));
            const diana = modal.getByRole('checkbox', {name: /editor\.diana|Diana Editor/});
            await diana.first().waitFor({timeout: 30_000});
            await diana.first().check();
            const body = modal.frameLocator('iframe').first().locator('body');
            await body.click();
            await body.fill(`Discussion message for ${S1.tag}.`);
            const saved = page.waitForResponse((r) => r.request().method() === 'POST' && /\/submissions\/\d+\/tasks$/.test(r.url()), {timeout: 30_000}).catch(() => null);
            await modal.getByRole('button', {name: 'Save', exact: true}).click();
            const resp = await saved;
            await modal.waitFor({state: 'hidden', timeout: 30_000}).catch(() => {});
            await idle(page);
            record('k3-discussion-added', Object.assign(await captureAuthor(page, 'k3-discussion-added'), {saveStatus: resp && resp.status(), participantBoxes: boxNames}));
            await signOut(page);
            await signIn(page, 'editor.diana');
            await page.goto(app.url(`/index.php/${ctx}/dashboard/editorial?currentViewId=assigned-to-me`));
            await idle(page);
            const tasks = await openTasks(page);
            record('k3-discussion-editor-tasks', Object.assign(await screen(page), tasks));
            await shot(page, 'k3-discussion-editor-tasks');
            const dmail = await app.mail.find({to: 'editor.diana@mail.test', subject: name, timeoutMs: 20_000}).then((m) => ({id: m.ID, subject: m.Subject})).catch((e) => ({error: String(e.message).slice(0, 200)}));
            record('k3-discussion-editor-mail', dmail);
            await signOut(page);
        }
        // ---- extra: S3 after the on-screen decision; then A2's other lean example (a revision upload
        // raises a task). On S1 (no revisions requested) the author's "Upload" refuses; the UPLOAD_ON
        // env picks the seed (default S3, where revisions were requested).
        if (on('extra')) {
            await signIn(page, 'author.alex');
            await authorStage(page, app, S3.id, S3.round);
            await captureAuthor(page, 'k3-extra-alex-S3-after-decision');
            await signOut(page);
        }
        if (on('upload')) {
            const sub = st[process.env.UPLOAD_ON || 'S3'];
            const label = process.env.UPLOAD_ON || 'S3';
            await signIn(page, 'author.alex');
            await authorStage(page, app, sub.id, sub.round);
            const fileName = `revision-${sub.tag}.txt`;
            await wf(page).getByRole('button', {name: 'Upload', exact: true}).first().click();
            const wizard = page.getByRole('dialog').filter({has: page.getByRole('tab', {name: '1. Upload File'})});
            const wizardSeen = await wizard.waitFor({timeout: 30_000}).then(() => true).catch(() => false);
            await idle(page);
            record(`k3-upload-${label}-wizard`, Object.assign(await screen(page), {wizardSeen, dialogText: await dialogTexts(page)}));
            if (wizardSeen) {
                const select = wizard.locator('select').first();
                if (await select.count()) {
                    const opts = await select.locator('option').evaluateAll((els) => els.map((o) => ({value: o.value, text: o.textContent.trim()})));
                    const pick = opts.find((o) => o.value && !/^(0|)$/.test(o.value));
                    if (pick) await select.selectOption(pick.value);
                }
                await page.locator('input[type="file"]').last().setInputFiles({name: fileName, mimeType: 'text/plain', buffer: Buffer.from(`Revision ${fileName}`)});
                await wizard.getByRole('button', {name: /Change File/}).waitFor({timeout: 30_000}).catch(() => {});
                await wizard.getByRole('button', {name: 'Continue', exact: true}).click();
                await idle(page);
                await wizard.getByRole('button', {name: 'Continue', exact: true}).click();
                await idle(page);
                await wizard.getByRole('button', {name: 'Complete', exact: true}).click();
                await wizard.waitFor({state: 'hidden', timeout: 30_000}).catch(() => {});
                await idle(page);
            } else {
                await page.keyboard.press('Escape');
                await idle(page);
            }
            await captureAuthor(page, `k3-upload-${label}-after`);
            await signOut(page);
            await signIn(page, 'editor.diana');
            await page.goto(app.url(`/index.php/${ctx}/dashboard/editorial?currentViewId=assigned-to-me`));
            await idle(page);
            const tasks = await openTasks(page);
            record(`k3-upload-${label}-editor-tasks`, Object.assign(await screen(page), tasks));
            await shot(page, `k3-upload-${label}-editor-tasks`);
            const rmail = await app.mail.find({to: 'editor.diana@mail.test', contains: sub.title, timeoutMs: 15_000}).then((m) => ({id: m.ID, subject: m.Subject})).catch((e) => ({error: String(e.message).slice(0, 200)}));
            record(`k3-upload-${label}-editor-mail`, Object.assign(rmail, {counts: await mailCounts(app, sub.title)}));
            await signOut(page);
        }
        // ---- edit: A2's "edits are not announced" — a response on S3, then the editor's "Save"
        if (on('edit')) {
            const E = st[process.env.EDIT_ON || 'S1'];
            await signIn(page, 'author.alex');
            await authorStage(page, app, E.id, E.round);
            const modal = await openWindow(page, 'Submit Response', WINDOW_AUTHOR);
            await typeInBody(page, modal, 'Response on the revisions round.');
            await modal.getByRole('checkbox').first().check();
            await idle(page);
            await modal.getByRole('button', {name: 'Submit Response', exact: true}).click();
            await modal.waitFor({state: 'hidden', timeout: 30_000}).catch(() => {});
            await idle(page);
            await captureAuthor(page, 'k3-edit-alex-after-submit');
            await signOut(page);
            const before = {mail: await mailCounts(app, E.title)};
            await signIn(page, 'editor.diana');
            before.dashboardRow = await dashboardRow(page, app, E.title);
            await editorStage(page, app, E.id, E.round);
            const table = page.getByRole('table', {name: 'Author Response'});
            const row = table.locator('tbody tr').filter({has: page.locator('td:first-child', {hasText: 'Alex Author'})});
            await row.getByRole('button', {name: /More Actions/}).first().click();
            await idle(page);
            await page.locator('[role="menu"]:visible').last().getByRole('menuitem', {name: 'View'}).click();
            const win = sideModal(page, 'Author Response to Reviews');
            await win.waitFor({timeout: 30_000});
            await win.locator('iframe').first().waitFor({timeout: 30_000});
            await idle(page);
            await captureWindow(page, win, 'k3-edit-editor-window');
            await typeInBody(page, win, ' Edited by the editor.');
            const saved = page.waitForResponse((r) => /authorResponse\/\d+$/.test(r.url()) && r.request().method() === 'POST', {timeout: 30_000}).catch(() => null);
            await win.getByRole('button', {name: 'Save', exact: true}).click();
            const resp = await saved;
            await win.waitFor({state: 'hidden', timeout: 30_000}).catch(() => {});
            await idle(page);
            await captureEditor(page, 'k3-edit-editor-after-save', {saveStatus: resp && resp.status()});
            const after = {mail: await mailCounts(app, E.title), dashboardRow: await dashboardRow(page, app, E.title)};
            const tasks = await openTasks(page);
            record('k3-edit-editor-tasks', Object.assign(await screen(page), tasks, {before, after}));
            await shot(page, 'k3-edit-editor-tasks');
            await signOut(page);
        }
        // ---- stage: one settled read of the author's stage on a seed (STAGE_ON=S1|S2|S3|S4)
        if (on('stage')) {
            const label = process.env.STAGE_ON || 'S3';
            const sub = st[label];
            await signIn(page, 'author.alex');
            await authorStage(page, app, sub.id, sub.round);
            await captureAuthor(page, `k3-stage-alex-${label}`);
            await signOut(page);
        }
        // ---- lost: S3 after the author uploaded a revision — the decision email's button, and the editor's table
        if (on('lost')) {
            await signIn(page, 'author.alex');
            await page.goto(st.decisionMail.href);
            await idle(page);
            const modal = sideModal(page, WINDOW_AUTHOR);
            const opened = await modal.waitFor({timeout: 20_000}).then(() => true).catch(() => false);
            await idle(page);
            const s = await captureAuthor(page, 'k3-lost-alex-S3-from-decision-mail');
            record('k3-lost-alex-S3-from-decision-mail', Object.assign(s, {windowOpen: opened, landingUrl: page.url()}));
            await signOut(page);
            await signIn(page, 'editor.diana');
            await editorStage(page, app, S3.id, S3.round);
            await captureEditor(page, 'k3-lost-editor-S3');
            await signOut(page);
        }
    } finally {
        await close();
    }
});
