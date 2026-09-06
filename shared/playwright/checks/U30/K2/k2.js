// U30 claim check, chunk K2: the "Request Author Response" page and the
// request email on OJS — Fields (spec 70–84), Rules 4, 4a and 5 (127–187),
// Side effects (308–350) and register entries A1, A5, A6.
// Spec: docs/specs/U30-author-response-to-reviews.md
//
// Seeds its own scratch state (three submissions on the seeded journal, a
// scratch journal with "Minimum Confirmed Reviews Required" 1, a scratch
// journal in open review mode with a review form), signs in from the roster
// and records every screen with screen().
//
//   PROBE_FEATURE=U30 PROBE_AGENT=ccK2 node bin/probe.js ojs shared/playwright/checks/U30/K2/k2.js
//   PHASES=seed,page,sends,notif,author,after,min,notify,addrev,open,openfile   (default: all; later phases reuse k2-state-ojs.json)
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, signOut, screen, shot, record, loc, note, idle, tag, outDir} =
    require('../../../probe');

const PHASES = process.env.PHASES ? process.env.PHASES.split(',') : ['seed', 'page', 'sends', 'notif', 'author', 'after', 'min', 'notify', 'addrev', 'open', 'openfile'];
const on = (p) => PHASES.includes(p);
const log = (...a) => console.log(...a);
const stateFile = (app) => path.join(outDir(), `k2-state-${app.name}.json`);
const RESPONSE_TEXT = 'We added the control group the reviewers asked for.';

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
    for (const d of await page.locator('[role="dialog"]:visible').all()) out.push(await d.innerText().catch(() => null));
    return out;
}
const wfModal = (page) => page.locator('[role="dialog"]:visible').last();

// every response ≥ 400 and every call to the request endpoint, per phase
function watchTraffic(page) {
    const seen = [];
    page.on('response', (r) => {
        const u = r.url();
        if (r.status() >= 400 || /authorResponse/.test(u)) seen.push({method: r.request().method(), status: r.status(), url: u.replace(/^https?:\/\/[^/]+/, '')});
    });
    return seen;
}

async function captureWorkflow(page, name) {
    const s = await screen(page);
    s.dialogText = await dialogTexts(page);
    const wf = page.getByRole('dialog').first();
    s.panels = await wf.locator('h3, h4').allInnerTexts().catch(() => []);
    s.requestResponse = await buttonState(page.getByRole('button', {name: 'Request Response', exact: true}));
    const table = page.getByRole('table', {name: 'Author Response'});
    s.table = null;
    if (await table.count()) {
        s.table = {rows: []};
        for (const tr of await table.locator('tbody tr').all()) {
            s.table.rows.push({
                dom: await tr.locator('td').evaluateAll((els) => els.map((e) => e.textContent.replace(/\s+/g, ' ').trim())),
                rendered: await tr.locator('td').allInnerTexts(),
            });
        }
    }
    record(name, s);
    await shot(page, name).catch(() => {});
    return s;
}
async function editorStage(page, app, ctx, id, round) {
    await page.goto(app.url(`/index.php/${ctx}/dashboard/editorial?workflowSubmissionId=${id}&workflowMenuKey=workflow_3_${round}`));
    await idle(page);
    await page.getByRole('heading', {name: 'Author Response'}).first().waitFor({timeout: 30_000});
    await page.getByRole('table', {name: 'Author Response'}).locator('tbody tr').filter({hasNotText: 'No Items'}).first().waitFor({timeout: 30_000}).catch(() => {});
    await idle(page);
}
async function authorStage(page, app, ctx, id, round) {
    await page.goto(app.url(`/index.php/${ctx}/dashboard/mySubmissions?workflowSubmissionId=${id}&workflowMenuKey=workflow_3_${round}`));
    await idle(page);
    await page.getByRole('dialog').first().waitFor({timeout: 30_000});
    await idle(page);
}
async function waitRequestPage(page) {
    await page.waitForURL(/requestAuthorResponse/, {timeout: 30_000});
    await idle(page);
    await page.getByRole('button', {name: 'Submit Request'}).waitFor({timeout: 30_000});
    await page.locator('iframe').first().waitFor({timeout: 30_000});
    await page.waitForFunction(() => {
        const t = document.querySelector('input[name="subject"], [aria-label="Subject"], input#subject');
        return t && t.value && t.value.length > 0;
    }, null, {timeout: 30_000}).catch(() => {});
    await page.getByText('Loading', {exact: true}).waitFor({state: 'hidden', timeout: 30_000}).catch(() => {});
    await page.waitForFunction(() => { const f = document.querySelector('iframe'); return f && f.contentDocument && f.contentDocument.body && f.contentDocument.body.innerText.length > 20; }, null, {timeout: 30_000}).catch(() => {});
    await idle(page);
}
const subjectBox = (page) => page.getByRole('textbox', {name: 'Subject'});
const bodyFrame = (page) => page.frameLocator('iframe[id^="composer-body"]').locator('body');

async function captureRequestPage(page, name) {
    const s = await screen(page);
    s.browserTitle = await page.title();
    s.h1 = await page.locator('h1').allInnerTexts().catch(() => []);
    s.h2 = await page.locator('h2').evaluateAll((els) => els.map((e) => ({dom: e.textContent.trim(), rendered: e.innerText, transform: getComputedStyle(e).textTransform, cls: e.className}))).catch(() => []);
    s.breadcrumb = await page.locator('nav, ol, ul').filter({hasText: 'Request Author Response'}).filter({hasText: 'Dashboard'}).first().evaluate((e) => ({text: e.innerText, label: e.getAttribute('aria-label'), links: [...e.querySelectorAll('a')].map((a) => ({text: a.textContent.trim(), href: a.getAttribute('href')}))})).catch(() => null);
    s.toolbar = await page.locator('.tox-tbtn').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') || e.getAttribute('title') || e.textContent.trim())).catch(() => []);
    s.frames = [];
    for (const f of await page.locator('iframe').all()) {
        const id = await f.getAttribute('id');
        try {
            const body = f.contentFrame().locator('body');
            s.frames.push({id, html: await body.innerHTML(), text: await body.innerText()});
        } catch (e) {
            s.frames.push({id, error: String(e.message).slice(0, 200)});
        }
    }
    s.textboxes = [];
    for (const t of await page.getByRole('textbox').all()) {
        s.textboxes.push({name: await t.getAttribute('aria-label') || await t.getAttribute('name') || await t.getAttribute('id'), value: await t.inputValue().catch(() => null), visible: await t.isVisible()});
    }
    s.buttons = await page.getByRole('button').filter({visible: true}).allInnerTexts().catch(() => []);
    s.searchboxes = await page.getByRole('searchbox').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') || e.placeholder)).catch(() => []);
    s.toText = await page.locator('label, legend, span').filter({hasText: /^To$/}).first().locator('xpath=ancestor::*[contains(@class,"pkpFormField") or self::fieldset or contains(@class,"composer")][1]').innerText().catch(() => null);
    record(name, s);
    await shot(page, name).catch(() => {});
    return s;
}
async function submitRequest(page, name) {
    await page.getByRole('button', {name: 'Submit Request'}).click();
    await page.getByRole('dialog').filter({hasText: /Request for review response sent|Error/}).waitFor({timeout: 30_000}).catch(() => {});
    await idle(page);
    const s = await screen(page);
    s.dialogText = await dialogTexts(page);
    const dlg = page.getByRole('dialog').filter({hasText: /Request for review response sent|Error/}).last();
    s.dialogControls = {
        buttons: await dlg.getByRole('button').evaluateAll((els) => els.map((e) => ({text: e.textContent.trim(), label: e.getAttribute('aria-label')}))).catch(() => []),
        links: await dlg.getByRole('link').evaluateAll((els) => els.map((e) => ({text: e.textContent.trim(), href: e.getAttribute('href')}))).catch(() => []),
        closeLike: await dlg.locator('button[aria-label*="lose" i], .modal__closeButton, [class*="close"]').count().catch(() => null),
    };
    record(name, s);
    await shot(page, name).catch(() => {});
    return s;
}
async function okDialog(page) {
    const ok = page.locator('[role="dialog"]:visible').last().getByRole('button', {name: 'OK', exact: true});
    if (await ok.count()) await ok.click();
    await idle(page);
}
async function mailOf(app, to, contains, extra = {}) {
    const m = await app.mail.find({to, contains, timeoutMs: 20_000, ...extra});
    const full = await app.mail.fullMessage(m.ID);
    const text = full.Text || '';
    return {
        id: m.ID, subject: full.Subject, from: full.From, to: full.To, cc: full.Cc, bcc: full.Bcc, date: full.Date,
        attachments: full.Attachments, attachmentNames: (full.Attachments || []).map((a) => a.FileName),
        greeting: (text.match(/Hello[^\n]*/) || [null])[0],
        text,
        html: full.HTML,
        href: app.mail.extractLink(full.HTML, 'Submit Author Response'),
        reviewerHeadings: [...(full.HTML || '').matchAll(/<strong>([^<]*)<\/strong>/g)].map((x) => x[1]),
        commentsBlock: ((full.HTML || '').match(/<hr>[\s\S]*<hr>/) || [null])[0],
    };
}
async function openActivityLog(page, name) {
    await page.getByRole('button', {name: 'Activity Log', exact: true}).first().click();
    const dlg = page.locator('[role="dialog"]:visible').last();
    await dlg.locator('table tbody tr').first().waitFor({timeout: 30_000}).catch(() => {});
    await idle(page);
    const s = await screen(page);
    s.dialogText = (await dlg.innerText().catch(() => '')).trim().slice(0, 6000);
    s.rows = await dlg.locator('table tbody tr').allInnerTexts().catch(() => []);
    record(name, s);
    await shot(page, name).catch(() => {});
    await page.keyboard.press('Escape');
    await idle(page);
    return s;
}
async function responseWindow(page, name) {
    const modal = page.locator('[role="dialog"]:visible').filter({hasText: 'Submit Your Response to Reviewer Feedback'}).last();
    await modal.waitFor({timeout: 30_000});
    await modal.locator('iframe').first().waitFor({timeout: 30_000});
    await idle(page);
    const s = await screen(page);
    s.dialogText = await dialogTexts(page);
    s.toolbar = await modal.locator('.tox-tbtn').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') || e.getAttribute('title') || e.textContent.trim())).catch(() => []);
    s.iframes = await modal.locator('iframe').count();
    s.boxes = [];
    for (const cb of await modal.getByRole('checkbox').all()) {
        s.boxes.push({label: await cb.evaluate((e) => (document.querySelector(`label[for="${e.id}"]`) || e.closest('label') || {}).innerText || e.getAttribute('aria-label')), checked: await cb.isChecked()});
    }
    s.submit = await buttonState(modal.getByRole('button', {name: 'Submit Response', exact: true}));
    record(name, s);
    await shot(page, name).catch(() => {});
    return {modal, s};
}
async function closeAttachWindows(page) {
    // the Attach Files window and its "Review Files" sub-view both answer Escape; the sub-view re-renders the window on "Back"
    for (let i = 0; i < 4; i++) {
        if (!(await page.locator('[role="dialog"]:visible').count())) break;
        await page.keyboard.press('Escape');
        await page.locator('[role="dialog"]:visible').first().waitFor({state: 'hidden', timeout: 3_000}).catch(() => {});
        await idle(page);
    }
    for (const d of await page.locator('[role="dialog"]:visible').all()) {
        await d.getByRole('button', {name: 'Close', exact: true}).last().click({timeout: 5_000}).catch(() => {});
        await idle(page);
    }
}
function smallFile(name, text) {
    const p = path.join(outDir(), name);
    fs.writeFileSync(p, text);
    return p;
}

forEachApp(async (app) => {
    if (app.name !== 'ojs') return; // the request page's screens are OJS-only (K5 owns the other apps)
    let sc = fs.existsSync(stateFile(app)) ? JSON.parse(fs.readFileSync(stateFile(app), 'utf8')) : {};
    const save = () => fs.writeFileSync(stateFile(app), JSON.stringify(sc, null, 2));
    const done = (name, data) => { record(`k2-${name}`, data); log(`[${name}]`, JSON.stringify(data).slice(0, 1500)); };
    const ctx = app.contextPath;

    if (on('seed')) {
        const seedPk = async (key, reviewers, extra = {}) => {
            const t = tag('u30k2' + key.toLowerCase());
            const title = `U30 K2 ${key} ${t}`;
            const r = await app.api.createSubmission({
                tag: t, context: ctx, submitter: 'author.alex', title, section: 'ART',
                decisions: ['sendExternalReview'],
                participants: [{username: 'sectioneditor.ana', role: 'sectionEditor'}, ...(extra.participants || [])],
                reviewRounds: [{reviewers}],
            });
            sc[key] = {tag: t, title, id: r.submissionId, round: r.reviewRounds[0].id};
        };
        // M: two anonymous completed reviews, two assigned authors
        await seedPk('M', [
            {username: 'reviewer.julia', status: 'completed', recommendation: 'pendingRevisions', comments: 'The method needs a control group.'},
            {username: 'reviewer.paul', status: 'completed', recommendation: 'accept', comments: 'The figures are clear and complete.'},
        ], {participants: [{username: 'author.bea', role: 'author'}]});
        // N: not ready (one review outstanding)
        await seedPk('N', [{username: 'reviewer.julia', status: 'accepted'}]);
        // D: one completed, one declined
        await seedPk('D', [
            {username: 'reviewer.julia', status: 'completed', recommendation: 'pendingRevisions', comments: 'The method needs a control group.'},
            {username: 'reviewer.paul', status: 'declined'},
        ]);
        // J: minimum 1
        {
            const t = tag('u30k2j');
            const u = {mgr: `${t}m`, rv1: `${t}r1`, rv2: `${t}r2`, au: `${t}a`};
            const c = await app.api.createContext({
                tag: t, context: {name: `U30 K2 ${t}`},
                users: [
                    {username: u.mgr, roles: ['manager'], givenName: 'Mira', familyName: 'Manager'},
                    {username: u.rv1, roles: ['externalReviewer'], givenName: 'Rowan', familyName: 'ReviewerOne'},
                    {username: u.rv2, roles: ['externalReviewer'], givenName: 'Riva', familyName: 'ReviewerTwo'},
                    {username: u.au, roles: ['author'], givenName: 'Ada', familyName: 'Authoress'},
                ],
                review: {numReviewsPerSubmission: 1},
            });
            const s1 = await app.api.createSubmission({
                tag: `${t}s1`, context: t, submitter: u.au, title: `U30 K2 S1 ${t}`, decisions: ['sendExternalReview'],
                reviewRounds: [{reviewers: [
                    {username: u.rv1, status: 'completed', recommendation: 'accept', comments: `Reviewer one comments for ${t}.`},
                    {username: u.rv2, status: 'accepted'},
                ]}],
            });
            const s2 = await app.api.createSubmission({
                tag: `${t}s2`, context: t, submitter: u.au, title: `U30 K2 S2 ${t}`, decisions: ['sendExternalReview'],
                reviewRounds: [{reviewers: [{username: u.rv1, status: 'completed', recommendation: 'accept', comments: `Reviewer one comments for ${t} S2.`}]}],
            });
            sc.J = {tag: t, users: u, contextId: c.contextId,
                S1: {id: s1.submissionId, round: s1.reviewRounds[0].id, title: `U30 K2 S1 ${t}`},
                S2: {id: s2.submissionId, round: s2.reviewRounds[0].id, title: `U30 K2 S2 ${t}`}};
        }
        // O: open review mode with a review form
        {
            const t = tag('u30k2o');
            const u = {mgr: `${t}m`, rv1: `${t}r1`, au: `${t}a`};
            const c = await app.api.createContext({
                tag: t, context: {name: `U30 K2 open ${t}`},
                users: [
                    {username: u.mgr, roles: ['manager'], givenName: 'Mira', familyName: 'Manager'},
                    {username: u.rv1, roles: ['externalReviewer'], givenName: 'Rowan', familyName: 'Openreviewer'},
                    {username: u.au, roles: ['author'], givenName: 'Ada', familyName: 'Authoress'},
                ],
                review: {defaultReviewMode: 'open'},
                reviewForms: [{title: 'Method check', elements: [
                    {question: 'Is the method sound?', type: 'textarea', included: true},
                    {question: 'For the editor only', type: 'textarea', included: false},
                ]}],
            });
            const s = await app.api.createSubmission({
                tag: `${t}s`, context: t, submitter: u.au, title: `U30 K2 open ${t}`, decisions: ['sendExternalReview'],
                reviewRounds: [{reviewers: [{username: u.rv1, status: 'accepted', reviewForm: 'Method check'}]}],
            });
            sc.O = {tag: t, users: u, contextId: c.contextId, id: s.submissionId, round: s.reviewRounds[0].id, title: `U30 K2 open ${t}`};
        }
        save();
        done('seeds', sc);
    }

    const {page, close} = await launch(app);
    const traffic = watchTraffic(page);
    try {
        const M = sc.M;
        const mailCounts = async (title) => ({
            alex: await app.mail.count({to: 'author.alex@mail.test', contains: title}),
            bea: await app.mail.count({to: 'author.bea@mail.test', contains: title}),
            diana: await app.mail.count({to: 'editor.diana@mail.test', contains: title}),
            ana: await app.mail.count({to: 'sectioneditor.ana@mail.test', contains: title}),
        });

        // ---- page: Rule 4 and the Fields rows, Rule 4a's emptied fields (A5) ----
        if (on('page')) {
            await signIn(page, 'editor.diana');
            await editorStage(page, app, ctx, M.id, M.round);
            const before = await captureWorkflow(page, 'page-table-M-before');
            await page.getByRole('button', {name: 'Request Response', exact: true}).click();
            await waitRequestPage(page);
            const rp = await captureRequestPage(page, 'page-request-M');
            await loc(page, 'K2 request page: "Subject" textbox', subjectBox(page));
            await loc(page, 'K2 request page: "Add CC/BCC" button', page.getByRole('button', {name: 'Add CC/BCC'}));
            await loc(page, 'K2 request page: "Find Template" searchbox', page.getByRole('searchbox', {name: 'Find Template'}));
            await loc(page, 'K2 request page: TinyMCE toolbar buttons', page.locator('.tox-tbtn'));
            // Add CC/BCC
            await page.getByRole('button', {name: 'Add CC/BCC'}).click();
            await idle(page);
            const cc = await captureRequestPage(page, 'page-request-M-after-ccbcc');
            // Attach Files
            await page.getByRole('button', {name: 'Attach Files'}).click();
            const att = page.locator('[role="dialog"]:visible').last();
            await att.waitFor({timeout: 30_000});
            await idle(page);
            const attach = await screen(page);
            attach.dialogText = await dialogTexts(page);
            attach.buttons = await att.getByRole('button').allInnerTexts().catch(() => []);
            record('page-attach-files-window', attach);
            await shot(page, 'page-attach-files-window').catch(() => {});
            await page.keyboard.press('Escape');
            await idle(page);
            // Cancel: back to the workflow, nothing sent
            const mailBefore = await mailCounts(M.title);
            await page.getByRole('button', {name: 'Cancel', exact: true}).click();
            await page.waitForURL(/dashboard\/editorial/, {timeout: 30_000});
            await idle(page);
            await page.getByRole('table', {name: 'Author Response'}).locator('tbody tr').filter({hasNotText: 'No Items'}).first().waitFor({timeout: 30_000}).catch(() => {});
            const afterCancel = await captureWorkflow(page, 'page-after-cancel');
            afterCancel.mail = await mailCounts(M.title);
            // Rule 4a / A5: emptied Subject, then emptied Message
            await page.getByRole('button', {name: 'Request Response', exact: true}).click();
            await waitRequestPage(page);
            const original = await subjectBox(page).inputValue();
            await subjectBox(page).fill('');
            const eSubj = await submitRequest(page, 'page-empty-subject');
            eSubj.traffic = traffic.slice();
            await okDialog(page);
            const keptSubj = await captureRequestPage(page, 'page-empty-subject-after-ok');
            await subjectBox(page).fill(original);
            await bodyFrame(page).click();
            await page.keyboard.press('ControlOrMeta+A');
            await page.keyboard.press('Delete');
            await idle(page);
            const bodyEmptied = await bodyFrame(page).innerHTML();
            const eMsg = await submitRequest(page, 'page-empty-message');
            eMsg.traffic = traffic.slice();
            await okDialog(page);
            const keptMsg = await captureRequestPage(page, 'page-empty-message-after-ok');
            keptMsg.mail = await mailCounts(M.title);
            done('page', {
                tableBefore: {table: before.table, button: before.requestResponse},
                page: {url: rp.url, browserTitle: rp.browserTitle, h1: rp.h1, h2: rp.h2, breadcrumb: rp.breadcrumb, toolbar: rp.toolbar, textboxes: rp.textboxes, searchboxes: rp.searchboxes, buttons: rp.buttons, toText: rp.toText, bodyHtml: rp.frames[0] && rp.frames[0].html},
                afterCcBcc: {textboxes: cc.textboxes, buttons: cc.buttons},
                attach: {text: attach.dialogText.slice(-1), buttons: attach.buttons},
                cancel: {url: afterCancel.url, table: afterCancel.table, button: afterCancel.requestResponse, mailBefore, mailAfter: afterCancel.mail},
                emptySubject: {dialog: eSubj.dialogText, controls: eSubj.dialogControls, url: eSubj.url, traffic: eSubj.traffic, afterOk: {url: keptSubj.url, textboxes: keptSubj.textboxes, bodyText: keptSubj.frames[0] && keptSubj.frames[0].text.slice(0, 120), buttons: keptSubj.buttons}},
                emptyMessage: {bodyEmptied, dialog: eMsg.dialogText, controls: eMsg.dialogControls, traffic: eMsg.traffic, afterOk: {url: keptMsg.url, textboxes: keptMsg.textboxes, bodyHtml: keptMsg.frames[0] && keptMsg.frames[0].html, buttons: keptMsg.buttons, mail: keptMsg.mail}},
            });
            await signOut(page);
        }

        // ---- sends: a send with CC, BCC, an edited body and an attachment; then A1's second and third send; the dialog's link and Escape; the activity log ----
        if (on('sends')) {
            await signIn(page, 'editor.diana');
            const t = M.tag;
            const ccAddr = `cc.${t}@mail.test`, bccAddr = `bcc.${t}@mail.test`;
            const extraLine = `Editor's added line ${t}.`;
            await editorStage(page, app, ctx, M.id, M.round);
            await page.getByRole('button', {name: 'Request Response', exact: true}).click();
            await waitRequestPage(page);
            await page.getByRole('button', {name: 'Add CC/BCC'}).click();
            await idle(page);
            await page.getByRole('textbox', {name: 'CC', exact: true}).fill(ccAddr);
            await page.getByRole('textbox', {name: 'BCC', exact: true}).fill(bccAddr);
            // rewrite: add a line at the end of the body
            const body = bodyFrame(page);
            await body.click();
            await page.keyboard.press('ControlOrMeta+End');
            await page.keyboard.press('Enter');
            await page.keyboard.type(extraLine);
            await idle(page);
            // attachment: "Attach Files" › "Upload File"
            let upload = {tried: false};
            try {
                const filePath = smallFile(`k2-attachment-${t}.txt`, `Attachment for ${t}\n`);
                await page.getByRole('button', {name: 'Attach Files'}).click();
                const att = page.locator('[role="dialog"]:visible').last();
                await att.waitFor({timeout: 30_000});
                await idle(page);
                upload.tried = true;
                await att.getByRole('button', {name: 'Upload File', exact: true}).click();
                await idle(page);
                const input = page.locator('input[type="file"]').last();
                await input.waitFor({state: 'attached', timeout: 15_000});
                await input.setInputFiles(filePath);
                await idle(page);
                const afterPick = await screen(page); afterPick.dialogText = await dialogTexts(page);
                afterPick.buttons = await page.locator('[role="dialog"]:visible').last().getByRole('button').allInnerTexts().catch(() => []);
                record('sends-upload-after-pick', afterPick);
                await shot(page, 'sends-upload-after-pick').catch(() => {});
                upload.afterPickButtons = afterPick.buttons;
                upload.afterPickText = afterPick.dialogText.slice(-1);
                const confirm = page.locator('[role="dialog"]:visible').last().getByRole('button', {name: /^(Attach|Attach Files|Add|Save|Continue|Complete|OK)$/}).last();
                if (await confirm.count()) {
                    upload.pressed = await confirm.innerText();
                    await confirm.click();
                    await idle(page);
                }
                await page.locator('[role="dialog"]:visible').filter({hasText: 'Attach Files'}).last().waitFor({state: 'hidden', timeout: 15_000}).catch(async () => { await page.keyboard.press('Escape'); await idle(page); });
                upload.ok = true;
            } catch (e) {
                upload.error = String(e.message).slice(0, 300);
                for (const d of await page.locator('[role="dialog"]:visible').all()) { await page.keyboard.press('Escape').catch(() => {}); }
                await idle(page);
            }
            const filled = await captureRequestPage(page, 'sends-request-filled');
            const mailBefore = await mailCounts(M.title);
            const dlg1 = await submitRequest(page, 'sends-sent-1');
            await loc(page, 'K2 sent dialog: "View Submission Summary" link', page.getByRole('link', {name: 'View Submission Summary'}));
            // Escape closes it and lands on the workflow screen
            await page.keyboard.press('Escape');
            await page.waitForURL(/dashboard\/editorial/, {timeout: 30_000});
            await idle(page);
            await page.getByRole('table', {name: 'Author Response'}).locator('tbody tr').filter({hasNotText: 'No Items'}).first().waitFor({timeout: 30_000}).catch(() => {});
            const afterEsc = await captureWorkflow(page, 'sends-after-escape');
            const m1 = await mailOf(app, 'author.alex@mail.test', M.title).catch((e) => ({error: String(e.message).slice(0, 200)}));
            const m1bea = await mailOf(app, 'author.bea@mail.test', M.title).catch((e) => ({error: String(e.message).slice(0, 200)}));
            const ccCount = await app.mail.count({to: ccAddr, contains: M.title});
            const bccCount = await app.mail.count({to: bccAddr, contains: M.title});
            const ccMail = ccCount ? await mailOf(app, ccAddr, M.title).catch(() => null) : null;
            record('sends-mail-1', {m1, m1bea, ccCount, bccCount, ccMail: ccMail && {to: ccMail.to, cc: ccMail.cc, bcc: ccMail.bcc, subject: ccMail.subject}});
            // second send: the link
            await page.getByRole('button', {name: 'Request Response', exact: true}).click();
            await waitRequestPage(page);
            const dlg2 = await submitRequest(page, 'sends-sent-2');
            await page.getByRole('link', {name: 'View Submission Summary'}).click();
            await page.waitForURL(/dashboard\/editorial/, {timeout: 30_000});
            await idle(page);
            await page.getByRole('table', {name: 'Author Response'}).locator('tbody tr').filter({hasNotText: 'No Items'}).first().waitFor({timeout: 30_000}).catch(() => {});
            const afterLink = await captureWorkflow(page, 'sends-after-link');
            // third send
            await page.getByRole('button', {name: 'Request Response', exact: true}).click();
            await waitRequestPage(page);
            const dlg3 = await submitRequest(page, 'sends-sent-3');
            await page.keyboard.press('Escape');
            await page.waitForURL(/dashboard\/editorial/, {timeout: 30_000});
            await idle(page);
            await page.getByRole('table', {name: 'Author Response'}).locator('tbody tr').filter({hasNotText: 'No Items'}).first().waitFor({timeout: 30_000}).catch(() => {});
            const after3 = await captureWorkflow(page, 'sends-after-third');
            await app.mail.find({to: 'author.alex@mail.test', contains: M.title, timeoutMs: 20_000}).catch(() => {});
            const mailAfter = await mailCounts(M.title);
            const alog = await openActivityLog(page, 'sends-activity-log');
            done('sends', {
                filled: {textboxes: filled.textboxes, bodyTail: filled.frames[0] && filled.frames[0].text.slice(-300), attachmentsOnPage: (filled.text && filled.text.main || '').match(/k2-attachment[^\n]*/g)},
                upload,
                sent1: {dialog: dlg1.dialogText, controls: dlg1.dialogControls},
                escape: {url: afterEsc.url, table: afterEsc.table, button: afterEsc.requestResponse},
                mail1: {from: m1.from, to: m1.to, cc: m1.cc, bcc: m1.bcc, subject: m1.subject, attachments: m1.attachmentNames, greeting: m1.greeting, headings: m1.reviewerHeadings, hasExtraLine: (m1.text || '').includes(extraLine), sameAsBea: m1.id === m1bea.id, ccCount, bccCount, textHead: (m1.text || '').slice(0, 900), textTail: (m1.text || '').slice(-400)},
                sent2: {dialog: dlg2.dialogText}, afterLink: {url: afterLink.url, table: afterLink.table, button: afterLink.requestResponse},
                sent3: {dialog: dlg3.dialogText}, after3: {table: after3.table, button: after3.requestResponse},
                mailBefore, mailAfter,
                activityLogRows: alog.rows.slice(0, 8),
                traffic: traffic.slice(),
            });
            await signOut(page);
        }

        // ---- notif: the "Notifications" list and window, the window's button, the author's "Tasks" panel (Side effects bullets 1 and 4) ----
        if (on('notif')) {
            await signIn(page, 'author.alex');
            await authorStage(page, app, ctx, M.id, M.round);
            const st = await captureWorkflow(page, 'notif-author-stage-M');
            const rows = page.locator('[role="dialog"]:visible').last().getByRole('listitem').filter({hasText: 'Request For Author Response'});
            const rowTexts = await rows.allInnerTexts();
            await loc(page, 'K2 author Notifications list: first row', rows.first());
            const dialogsBefore = await page.locator('[role="dialog"]:visible').count();
            await rows.first().locator('a').first().click();
            await page.waitForFunction((n) => document.querySelectorAll('[role="dialog"]').length > n, dialogsBefore, {timeout: 20_000}).catch(() => {});
            const nw = page.locator('[role="dialog"]:visible').last();
            await page.waitForFunction(() => { const d = [...document.querySelectorAll('[role=dialog]')].pop(); return d && d.innerText.length > 200; }, null, {timeout: 20_000}).catch(() => {});
            await idle(page);
            const win = await screen(page);
            win.dialogText = await dialogTexts(page);
            win.dialogs = await page.locator('[role="dialog"]:visible').count();
            win.links = await nw.getByRole('link').evaluateAll((els) => els.map((e) => ({text: e.textContent.trim(), href: e.getAttribute('href')}))).catch(() => []);
            win.headings = await nw.locator('h1, h2, h3').allInnerTexts().catch(() => []);
            record('notif-window', win);
            await shot(page, 'notif-window').catch(() => {});
            const btn = nw.getByRole('link', {name: 'Submit Author Response'});
            let viaButton = {count: await btn.count()};
            if (viaButton.count) {
                await btn.click();
                await idle(page);
                const opened = await page.locator('[role="dialog"]:visible').filter({hasText: /Submit Your Response to Reviewer Feedback|Author Response to Reviews/}).last().waitFor({timeout: 20_000}).then(() => true).catch(() => false);
                await idle(page);
                viaButton = {...viaButton, url: page.url(), responseWindowOpened: opened, dialogs: (await dialogTexts(page)).map((t) => (t || '').slice(0, 300))};
                record('notif-after-window-button', {...(await screen(page)), viaButton});
                await shot(page, 'notif-after-window-button').catch(() => {});
            }
            // the author's Tasks panel
            await page.goto(app.url(`/index.php/${ctx}/dashboard/mySubmissions`));
            await idle(page);
            const tasksBtn = page.getByRole('button', {name: /Tasks/}).first();
            const tasksLabel = (await tasksBtn.innerText().catch(() => '')).trim();
            await tasksBtn.click();
            const tdlg = page.locator('[role="dialog"]:visible').last();
            await tdlg.waitFor({timeout: 30_000});
            await tdlg.locator('table tbody tr').first().waitFor({timeout: 20_000}).catch(() => {});
            await idle(page);
            const tasks = await screen(page); tasks.dialogText = (await tdlg.innerText().catch(() => '')).trim().slice(0, 4000);
            record('notif-author-tasks', tasks);
            await shot(page, 'notif-author-tasks').catch(() => {});
            done('notif', {panels: st.panels, notificationRows: rowTexts, window: {dialogs: win.dialogs, headings: win.headings, text: (win.dialogText.slice(-1)[0] || '').slice(0, 1500), links: win.links}, viaButton, tasks: {label: tasksLabel, text: tasks.dialogText.slice(0, 1500)}});
            await signOut(page);
        }

        // ---- author: the response window's fields (Fields rows 6–7), submit ----
        if (on('author')) {
            await signIn(page, 'author.alex');
            await authorStage(page, app, ctx, M.id, M.round);
            const st = await captureWorkflow(page, 'author-stage-M');
            await page.getByRole('dialog').first().getByRole('button', {name: 'Submit Response', exact: true}).click();
            const {modal, s: w0} = await responseWindow(page, 'author-window-empty');
            const box = modal.getByRole('checkbox', {name: 'Alex Author'});
            await box.check();
            await idle(page);
            const tickedOnly = await buttonState(modal.getByRole('button', {name: 'Submit Response', exact: true}));
            const body = modal.frameLocator('iframe').first().locator('body');
            await body.click();
            await body.pressSequentially(RESPONSE_TEXT);
            await idle(page);
            const both = await buttonState(modal.getByRole('button', {name: 'Submit Response', exact: true}));
            await box.uncheck();
            await idle(page);
            const textOnly = await buttonState(modal.getByRole('button', {name: 'Submit Response', exact: true}));
            await box.check();
            await idle(page);
            record('author-window-filled', {...(await screen(page)), states: {tickedOnly, both, textOnly}});
            await modal.getByRole('button', {name: 'Submit Response', exact: true}).click();
            await idle(page);
            await modal.waitFor({state: 'hidden', timeout: 30_000}).catch(() => {});
            await idle(page);
            const afterSubmit = await captureWorkflow(page, 'author-stage-M-after-submit');
            done('author', {panels: st.panels, responseWindow: {toolbar: w0.toolbar, iframes: w0.iframes, boxes: w0.boxes, submitEmpty: w0.submit, description: (w0.dialogText.slice(-1)[0] || '').match(/Authors[\s\S]{0,200}/)?.[0]}, states: {tickedOnly, both, textOnly}, panelsAfter: afterSubmit.panels, traffic: traffic.slice()});
            await signOut(page);
        }

        // ---- after: Rule 4a's typed-address refusals (holds a response; not ready), Rule 5's declined row, Side effects 4–5, delete ----
        if (on('after')) {
            await signIn(page, 'editor.diana');
            const mailBefore = await mailCounts(M.title);
            await editorStage(page, app, ctx, M.id, M.round);
            await page.getByRole('table', {name: 'Author Response'}).getByText('A response was submitted').first().waitFor({timeout: 30_000}).catch(() => {});
            const withResp = await captureWorkflow(page, 'after-table-M-with-response');
            // typed address on M (holds a response)
            await page.goto(app.url(`/index.php/${ctx}/reviewResponse/requestAuthorResponse?stageId=3&reviewRoundId=${M.round}&submissionId=${M.id}`));
            await waitRequestPage(page);
            const typedM = await captureRequestPage(page, 'after-typed-M');
            traffic.length = 0;
            const refM = await submitRequest(page, 'after-typed-M-submit');
            refM.traffic = traffic.slice();
            await okDialog(page);
            const keptM = await captureRequestPage(page, 'after-typed-M-after-ok');
            // N: greyed button, typed address refusal
            await editorStage(page, app, ctx, sc.N.id, sc.N.round);
            const tableN = await captureWorkflow(page, 'after-table-N');
            await page.goto(app.url(`/index.php/${ctx}/reviewResponse/requestAuthorResponse?stageId=3&reviewRoundId=${sc.N.round}&submissionId=${sc.N.id}`));
            await waitRequestPage(page);
            traffic.length = 0;
            const refN = await submitRequest(page, 'after-typed-N-submit');
            refN.traffic = traffic.slice();
            await okDialog(page);
            const keptN = await captureRequestPage(page, 'after-typed-N-after-ok');
            // D: the page's message with one completed and one declined
            await editorStage(page, app, ctx, sc.D.id, sc.D.round);
            const tableD = await captureWorkflow(page, 'after-table-D');
            await page.getByRole('button', {name: 'Request Response', exact: true}).click();
            await waitRequestPage(page);
            const pageD = await captureRequestPage(page, 'after-request-D');
            await page.getByRole('button', {name: 'Cancel', exact: true}).click();
            await page.waitForURL(/dashboard\/editorial/, {timeout: 30_000});
            await idle(page);
            // Side effects: activity log after the response, Tasks, dashboard row, mail counts
            await editorStage(page, app, ctx, M.id, M.round);
            const alog1 = await openActivityLog(page, 'after-activity-log-with-response');
            // delete the response
            const table = page.getByRole('table', {name: 'Author Response'});
            const alexRow = table.locator('tbody tr').filter({has: page.locator('td:first-child', {hasText: 'Alex Author'})});
            await alexRow.getByRole('button', {name: /More Actions|…/}).first().click();
            await idle(page);
            const menu = await page.locator('[role="menu"]:visible').getByRole('menuitem').evaluateAll((els) => els.map((e) => ({text: e.textContent.trim(), disabled: e.hasAttribute('disabled') || e.getAttribute('aria-disabled') === 'true'})));
            await page.locator('[role="menu"]:visible').getByText('Delete', {exact: true}).click();
            const ddlg = page.locator('[role="dialog"]:visible').last();
            await ddlg.waitFor({timeout: 30_000});
            const delDialog = await dialogTexts(page);
            await ddlg.getByRole('button', {name: 'OK', exact: true}).click();
            await idle(page);
            await table.locator('td').filter({hasText: /Ready to invite author/i}).first().waitFor({timeout: 30_000}).catch(() => {});
            await idle(page);
            const afterDel = await captureWorkflow(page, 'after-table-M-after-delete');
            const alog2 = await openActivityLog(page, 'after-activity-log-after-delete');
            // Tasks and the dashboard row
            await page.goto(app.url(`/index.php/${ctx}/dashboard/editorial?currentViewId=assigned-to-me`));
            await idle(page);
            await page.getByText(M.title).first().waitFor({timeout: 30_000});
            await idle(page);
            const dash = await screen(page);
            dash.row = (await page.locator('tr, li, [role="row"]').filter({hasText: M.title}).first().innerText().catch(() => 'n/a')).trim();
            record('after-dashboard-list', dash);
            const tasksBtn = page.getByRole('button', {name: /Tasks/}).first();
            const tasksLabel = (await tasksBtn.innerText().catch(() => '')).trim();
            await tasksBtn.click();
            const tdlg = page.locator('[role="dialog"]:visible').last();
            await tdlg.waitFor({timeout: 30_000});
            await tdlg.locator('table tbody tr').first().waitFor({timeout: 20_000}).catch(() => {});
            await idle(page);
            const tasks = await screen(page); tasks.dialogText = (await tdlg.innerText().catch(() => '')).trim().slice(0, 3000);
            record('after-tasks', tasks);
            await shot(page, 'after-tasks').catch(() => {});
            await page.keyboard.press('Escape');
            const mailAfter = await mailCounts(M.title);
            done('after', {
                withResponse: {table: withResp.table, button: withResp.requestResponse},
                typedM: {url: typedM.url, dialog: refM.dialogText, controls: refM.dialogControls, traffic: refM.traffic, afterOk: {url: keptM.url, subject: keptM.textboxes, bodyHead: keptM.frames[0] && keptM.frames[0].text.slice(0, 80)}},
                tableN: {table: tableN.table, button: tableN.requestResponse},
                typedN: {dialog: refN.dialogText, controls: refN.dialogControls, traffic: refN.traffic, afterOk: {url: keptN.url, bodyHead: keptN.frames[0] && keptN.frames[0].text.slice(0, 80)}},
                D: {reviewers: (tableD.dialogText[0] || '').match(/Reviewers[\s\S]*?Author Response/)?.[0]?.slice(0, 500), table: tableD.table, button: tableD.requestResponse, bodyHtml: pageD.frames[0] && pageD.frames[0].html},
                activityLogWithResponse: alog1.rows.slice(0, 8),
                delete: {menu, delDialog: delDialog.slice(-1), tableAfter: afterDel.table, buttonAfter: afterDel.requestResponse},
                activityLogAfterDelete: alog2.rows.slice(0, 8),
                dashboardRow: dash.row, tasks: {label: tasksLabel, text: tasks.dialogText.slice(0, 400)},
                mailBefore, mailAfter,
            });
            await signOut(page);
            // the author's card after the deletion (Side effects: "even after a deletion")
            await signIn(page, 'author.alex');
            await authorStage(page, app, ctx, M.id, M.round);
            const card = await captureWorkflow(page, 'after-author-stage-M-after-delete');
            done('after-author', {panels: card.panels, card: (card.dialogText[0] || '').match(/Author Response[\s\S]{0,200}/)?.[0], notifications: await page.locator('[role="dialog"]:visible').last().getByRole('listitem').filter({hasText: 'Request For Author Response'}).count()});
            await signOut(page);
        }

        // ---- min: A6 (the opening sentence under a minimum) and the refusal text for a round holding a response while a review is open ----
        if (on('min')) {
            const J = sc.J, t = J.tag, u = J.users, S1 = J.S1;
            await signIn(page, u.mgr, {contextPath: t});
            await editorStage(page, app, t, S1.id, S1.round);
            const s1a = await captureWorkflow(page, 'min-S1-submitted');
            await wfModal(page).getByRole('button', {name: 'Read Review', exact: true}).first().click();
            const rd = page.getByRole('dialog').last();
            await rd.waitFor({timeout: 30_000});
            await page.waitForFunction(() => { const d = [...document.querySelectorAll('[role=dialog]')].pop(); return d && d.innerText.length > 200; }, null, {timeout: 15_000}).catch(() => {});
            await idle(page);
            await rd.getByRole('button', {name: 'Mark as Complete', exact: true}).click();
            await idle(page);
            const confirmDlg = page.getByRole('dialog').last();
            const confirmText = await dialogTexts(page);
            await confirmDlg.getByRole('button', {name: 'Mark as Complete', exact: true}).last().click();
            await idle(page);
            await editorStage(page, app, t, S1.id, S1.round);
            const s1b = await captureWorkflow(page, 'min-S1-complete');
            const before = await app.mail.count({to: `${u.au}@mail.test`, contains: S1.title});
            await page.getByRole('button', {name: 'Request Response', exact: true}).click();
            await waitRequestPage(page);
            const rp = await captureRequestPage(page, 'min-S1-request-page');
            const dlg = await submitRequest(page, 'min-S1-sent');
            const mail = await mailOf(app, `${u.au}@mail.test`, S1.title).catch((e) => ({error: String(e.message).slice(0, 200)}));
            await signOut(page);
            // the author responds
            await signIn(page, u.au, {contextPath: t});
            await authorStage(page, app, t, S1.id, S1.round);
            await page.getByRole('dialog').first().getByRole('button', {name: 'Submit Response', exact: true}).click();
            const {modal} = await responseWindow(page, 'min-S1-author-window');
            const body = modal.frameLocator('iframe').first().locator('body');
            await body.click();
            await body.pressSequentially(RESPONSE_TEXT);
            await modal.getByRole('checkbox').first().check();
            await idle(page);
            await modal.getByRole('button', {name: 'Submit Response', exact: true}).click();
            await modal.waitFor({state: 'hidden', timeout: 30_000}).catch(() => {});
            await idle(page);
            const au = await captureWorkflow(page, 'min-S1-author-after-submit');
            await signOut(page);
            // typed address: which refusal wins
            await signIn(page, u.mgr, {contextPath: t});
            await editorStage(page, app, t, S1.id, S1.round);
            const withResp = await captureWorkflow(page, 'min-S1-table-with-response');
            await page.goto(app.url(`/index.php/${t}/reviewResponse/requestAuthorResponse?stageId=3&reviewRoundId=${S1.round}&submissionId=${S1.id}`));
            await waitRequestPage(page);
            traffic.length = 0;
            const ref = await submitRequest(page, 'min-S1-typed-submit');
            ref.traffic = traffic.slice();
            await okDialog(page);
            done('min', {
                submitted: {reviewers: (s1a.dialogText[0] || '').match(/Reviewers[\s\S]*?Author Response/)?.[0]?.slice(0, 500), table: s1a.table, button: s1a.requestResponse},
                confirm: confirmText.slice(-1),
                complete: {reviewers: (s1b.dialogText[0] || '').match(/Reviewers[\s\S]*?Author Response/)?.[0]?.slice(0, 500), table: s1b.table, button: s1b.requestResponse},
                request: {opening: rp.frames[0] && rp.frames[0].text.slice(0, 400), headings: rp.frames[0] && [...rp.frames[0].html.matchAll(/<strong>([^<]*)<\/strong>/g)].map((x) => x[1]), dialog: dlg.dialogText, mailBefore: before, mail: mail.error || {subject: mail.subject, greeting: mail.greeting, textHead: mail.text.slice(0, 500), headings: mail.reviewerHeadings}},
                authorCard: (au.dialogText[0] || '').match(/Author Response[\s\S]{0,200}/)?.[0],
                withResponse: {reviewers: (withResp.dialogText[0] || '').match(/Reviewers[\s\S]*?Author Response/)?.[0]?.slice(0, 500), table: withResp.table, button: withResp.requestResponse},
                typed: {dialog: ref.dialogText, controls: ref.dialogControls, traffic: ref.traffic},
            });
            await signOut(page);
        }

        // ---- notify: "Notify All Authors" both ends on S2 (Side effects bullet 2) ----
        if (on('notify')) {
            const J = sc.J, t = J.tag, u = J.users, S2 = J.S2;
            const cora = `cora.${t}@mail.test`;
            await signIn(page, u.mgr, {contextPath: t});
            await page.goto(app.url(`/index.php/${t}/management/settings/workflow#emails`));
            await idle(page);
            const emailsTab = page.getByRole('tab', {name: 'Emails', exact: true});
            await emailsTab.waitFor({timeout: 30_000});
            await emailsTab.click();
            await idle(page);
            const radios = page.locator('input[name="notifyAllAuthors"]');
            await radios.first().waitFor({timeout: 30_000});
            const es = await screen(page);
            es.notifyAllAuthors = await radios.evaluateAll((els) => els.map((e) => ({value: e.value, checked: e.checked, label: (document.querySelector(`label[for="${e.id}"]`) || e.closest('label') || {}).innerText})));
            es.block = await radios.first().evaluate((e) => { const f = e.closest('.pkpFormField, fieldset'); return f ? f.innerText : null; });
            record('notify-settings-emails', es);
            await shot(page, 'notify-settings-emails').catch(() => {});
            const panel = page.getByRole('tabpanel', {name: 'Emails', exact: true});
            const allRadio = page.locator('input[name="notifyAllAuthors"][value="true"], input[name="notifyAllAuthors"][value="1"]').first();
            if (!(await allRadio.isChecked())) {
                await allRadio.check();
                await panel.getByRole('button', {name: 'Save', exact: true}).first().click();
                await idle(page);
            }
            // add a contributor with no account
            await page.goto(app.url(`/index.php/${t}/dashboard/editorial?workflowSubmissionId=${S2.id}&workflowMenuKey=publication_${S2.id}_contributors`));
            await idle(page);
            await page.getByRole('dialog').first().waitFor({timeout: 30_000});
            await idle(page);
            const wf = page.locator('[role="dialog"]:visible').first();
            const addBtn = wf.getByRole('button', {name: 'Add Contributor', exact: true});
            await addBtn.waitFor({timeout: 30_000});
            await addBtn.click();
            const addDlg = page.getByRole('dialog', {name: 'Add Contributor'});
            await addDlg.waitFor({timeout: 30_000});
            await idle(page);
            await addDlg.locator('input[name="givenName-en"]').fill('Cora');
            await addDlg.locator('input[name="familyName-en"]').fill('Coauthor');
            await addDlg.locator('input[name="email"]').fill(cora);
            const country = addDlg.locator('select[name="country"]');
            if (await country.count()) await country.selectOption({index: 1});
            const authorRole = addDlg.getByRole('checkbox', {name: 'Author', exact: true});
            if (await authorRole.count()) {
                if (await authorRole.isChecked()) await authorRole.uncheck();
                await authorRole.check();
            }
            await addDlg.getByRole('button', {name: 'Save', exact: true}).click();
            await idle(page);
            await addDlg.waitFor({state: 'hidden', timeout: 30_000}).catch(() => {});
            await idle(page);
            const contribs = await screen(page); contribs.dialogText = await dialogTexts(page);
            record('notify-contributors-after', contribs);
            const counts = async () => ({author: await app.mail.count({to: `${u.au}@mail.test`, contains: S2.title}), cora: await app.mail.count({to: cora, contains: S2.title})});
            const before1 = await counts();
            await editorStage(page, app, t, S2.id, S2.round);
            await page.getByRole('button', {name: 'Request Response', exact: true}).click();
            await waitRequestPage(page);
            const rp1 = await captureRequestPage(page, 'notify-request-default');
            const d1 = await submitRequest(page, 'notify-sent-default');
            const mAu = await mailOf(app, `${u.au}@mail.test`, S2.title).catch((e) => ({error: String(e.message).slice(0, 200)}));
            const mCora = await mailOf(app, cora, S2.title).catch((e) => ({error: String(e.message).slice(0, 200)}));
            const after1 = await counts();
            record('notify-mail-default', {mAu, mCora});
            // flip to "Only send an email to authors assigned…"
            await page.goto(app.url(`/index.php/${t}/management/settings/workflow#emails`));
            await idle(page);
            await emailsTab.waitFor({timeout: 30_000});
            await emailsTab.click();
            await idle(page);
            const onlyRadio = page.locator('input[name="notifyAllAuthors"][value="false"], input[name="notifyAllAuthors"][value="0"]').first();
            await onlyRadio.waitFor({timeout: 30_000});
            await onlyRadio.check();
            await panel.getByRole('button', {name: 'Save', exact: true}).first().click();
            await idle(page);
            const es2 = await screen(page);
            es2.notifyAllAuthors = await radios.evaluateAll((els) => els.map((e) => ({value: e.value, checked: e.checked})));
            record('notify-settings-emails-after-save', es2);
            await editorStage(page, app, t, S2.id, S2.round);
            await page.getByRole('button', {name: 'Request Response', exact: true}).click();
            await waitRequestPage(page);
            const d2 = await submitRequest(page, 'notify-sent-assigned-only');
            await app.mail.find({to: `${u.au}@mail.test`, contains: S2.title, timeoutMs: 20_000}).catch(() => {});
            // bound the negative: wait until the author has two
            for (let i = 0; i < 20 && (await counts()).author < after1.author + 1; i++) await new Promise((r) => setTimeout(r, 500));
            const after2 = await counts();
            done('notify', {
                setting: es.notifyAllAuthors, block: es.block,
                toChips: rp1.toText, sentDefault: d1.dialogText,
                before1, after1, after2,
                authorMail: mAu.error || {subject: mAu.subject, to: mAu.to, from: mAu.from, greeting: mAu.greeting},
                coraMail: mCora.error || {subject: mCora.subject, to: mCora.to, from: mCora.from, textHead: mCora.text.slice(0, 900), hasButton: !!mCora.href, href: mCora.href},
                afterSave: es2.notifyAllAuthors, sentAssignedOnly: d2.dialogText,
            });
            await signOut(page);
        }

        // ---- addrev: Rule 4a "a round that holds a response while a review is still open" without a minimum: a reviewer added after the response ----
        if (on('addrev')) {
            await signIn(page, 'author.alex');
            await authorStage(page, app, ctx, M.id, M.round);
            const cardBtn = page.getByRole('dialog').first().getByRole('button', {name: 'Submit Response', exact: true});
            if (await cardBtn.count()) { // a re-run finds the response already there
                await cardBtn.click();
                const {modal} = await responseWindow(page, 'addrev-author-window');
                const body = modal.frameLocator('iframe').first().locator('body');
                await body.click();
                await body.pressSequentially(RESPONSE_TEXT + ' (second response)');
                await modal.getByRole('checkbox', {name: 'Alex Author'}).check();
                await idle(page);
                await modal.getByRole('button', {name: 'Submit Response', exact: true}).click();
                await modal.waitFor({state: 'hidden', timeout: 30_000}).catch(() => {});
                await idle(page);
            }
            await signOut(page);
            await signIn(page, 'editor.diana');
            await editorStage(page, app, ctx, M.id, M.round);
            await page.getByRole('table', {name: 'Author Response'}).getByText('A response was submitted').first().waitFor({timeout: 30_000}).catch(() => {});
            const before = await captureWorkflow(page, 'addrev-table-before');
            await wfModal(page).getByRole('button', {name: 'Add Reviewer', exact: true}).first().click();
            const ad = page.getByRole('dialog', {name: /Add Reviewer/i}).last();
            await ad.waitFor({timeout: 30_000});
            await page.waitForFunction(() => { const d = [...document.querySelectorAll('[role=dialog]')].pop(); return d && /Select Reviewer|Amara/.test(d.innerText); }, null, {timeout: 20_000}).catch(() => {});
            await idle(page);
            const list = await screen(page); list.dialogText = await dialogTexts(page);
            record('addrev-add-reviewer-list', list);
            await shot(page, 'addrev-add-reviewer-list').catch(() => {});
            // each unassigned reviewer's row offers the button "Select {name}" (aria); "Select Reviewer" is its visible text
            await ad.getByRole('button', {name: /^Select (Amara|Adam) Reviewer$/}).first().click();
            await idle(page);
            await ad.getByRole('button', {name: 'Add Reviewer', exact: true}).waitFor({timeout: 30_000});
            const form = await screen(page); form.dialogText = await dialogTexts(page);
            record('addrev-add-reviewer-form', form);
            await ad.getByRole('button', {name: 'Add Reviewer', exact: true}).click();
            await idle(page);
            await ad.waitFor({state: 'hidden', timeout: 30_000}).catch(() => {});
            await idle(page);
            await editorStage(page, app, ctx, M.id, M.round);
            const after = await captureWorkflow(page, 'addrev-table-after');
            await page.goto(app.url(`/index.php/${ctx}/reviewResponse/requestAuthorResponse?stageId=3&reviewRoundId=${M.round}&submissionId=${M.id}`));
            await waitRequestPage(page);
            traffic.length = 0;
            const ref = await submitRequest(page, 'addrev-typed-submit');
            ref.traffic = traffic.slice();
            await okDialog(page);
            done('addrev', {
                before: {reviewers: (before.dialogText[0] || '').match(/Reviewers[\s\S]*?Author Response/)?.[0]?.replace(/\s+/g, ' ').slice(0, 400), rows: before.table && before.table.rows.map((r) => r.dom), button: before.requestResponse},
                after: {reviewers: (after.dialogText[0] || '').match(/Reviewers[\s\S]*?Author Response/)?.[0]?.replace(/\s+/g, ' ').slice(0, 500), rows: after.table && after.table.rows.map((r) => r.dom), button: after.requestResponse},
                typed: {dialog: ref.dialogText, controls: ref.dialogControls, traffic: ref.traffic},
            });
            await signOut(page);
        }

        // ---- open: an open review on a review form with a reviewer file (Rule 5's heading, form questions, files not attached) ----
        if (on('open')) {
            const O = sc.O, t = O.tag, u = O.users;
            if (!O.reviewed) {
            await signIn(page, u.rv1, {contextPath: t});
            await page.goto(app.url(`/index.php/${t}/reviewer/submission/${O.id}`));
            await idle(page);
            const step3Button = page.getByRole('button', {name: 'Continue to Step #3'});
            const saveContinue = page.getByRole('button', {name: 'Save and continue', exact: true});
            const submitButton = page.getByRole('button', {name: 'Submit Review', exact: true});
            await step3Button.or(saveContinue).filter({visible: true}).first().waitFor({timeout: 30_000});
            if (await saveContinue.filter({visible: true}).count()) await saveContinue.filter({visible: true}).first().click();
            await step3Button.filter({visible: true}).first().waitFor({timeout: 30_000});
            await step3Button.filter({visible: true}).first().click();
            await submitButton.filter({visible: true}).waitFor({timeout: 30_000});
            await idle(page);
            record('open-wizard-step3', await screen(page));
            const fields = page.locator('textarea[name^="reviewFormResponses"]');
            const answers = ['Sound.', 'Editor note.'];
            for (let i = 0; i < Math.min(await fields.count(), 2); i++) {
                const f = fields.nth(i);
                if (await f.isVisible()) await f.fill(answers[i]);
                else { const id = await f.getAttribute('id'); const b = page.frameLocator(`iframe[id="${id}_ifr"]`).locator('body'); await b.click(); await b.pressSequentially(answers[i]); }
            }
            // a reviewer file: "Upload" under "Reviewer Files"
            let upload = {tried: false};
            try {
                const filePath = smallFile(`k2-reviewer-file-${t}.txt`, `Reviewer file for ${t}\n`);
                const up = page.getByRole('link', {name: /Upload File/}).or(page.getByRole('button', {name: /Upload File/})).first();
                await up.waitFor({timeout: 10_000});
                upload.tried = true;
                await up.click();
                await idle(page);
                const input = page.locator('input[type="file"]').last();
                await input.waitFor({state: 'attached', timeout: 15_000});
                await input.setInputFiles(filePath);
                await idle(page);
                const s = await screen(page); s.dialogText = await dialogTexts(page);
                s.buttons = await page.locator('[role="dialog"]:visible').last().getByRole('button').allInnerTexts().catch(() => []);
                record('open-upload-after-pick', s);
                upload.afterPickButtons = s.buttons;
                for (let i = 0; i < 3; i++) {
                    const btn = page.locator('[role="dialog"]:visible').last().getByRole('button', {name: /^(Continue|Save|Complete|OK|Add File|Upload)$/}).filter({visible: true}).last();
                    if (!(await btn.count())) break;
                    upload[`pressed${i}`] = await btn.innerText();
                    await btn.click();
                    await idle(page);
                }
                await idle(page);
                upload.ok = true;
                upload.reviewerFilesText = await page.getByText('Reviewer Files', {exact: true}).first().locator('xpath=..').innerText().catch(() => null);
            } catch (e) {
                upload.error = String(e.message).slice(0, 300);
                await page.keyboard.press('Escape').catch(() => {});
                await idle(page);
            }
            const rec = page.locator('select[id="reviewerRecommendationId"]');
            if (await rec.count()) await rec.selectOption({label: 'Accept Submission'});
            record('open-wizard-step3-filled', await screen(page));
            await submitButton.click();
            await idle(page);
            await page.getByRole('button', {name: 'OK', exact: true}).click();
            await page.getByRole('heading', {name: 'Review Submitted'}).waitFor({timeout: 30_000});
            await idle(page);
            await signOut(page);
            O.reviewed = true; O.upload = upload; save();
            }
            const upload = O.upload;
            // the manager: the page and the email
            await signIn(page, u.mgr, {contextPath: t});
            await editorStage(page, app, t, O.id, O.round);
            const stage = await captureWorkflow(page, 'open-stage');
            await page.getByRole('button', {name: 'Request Response', exact: true}).click();
            await waitRequestPage(page);
            const rp = await captureRequestPage(page, 'open-request-page');
            // Attach Files › Review Files: what is offered
            await page.getByRole('button', {name: 'Attach Files'}).click();
            const att = page.locator('[role="dialog"]:visible').last();
            await att.waitFor({timeout: 30_000});
            await idle(page);
            await att.getByRole('button', {name: 'Attach Review Files', exact: true}).click().catch(() => {});
            await idle(page);
            await page.waitForFunction(() => { const d = [...document.querySelectorAll('[role=dialog]')].pop(); return d && /k2-reviewer-file|No Items|no files/i.test(d.innerText); }, null, {timeout: 15_000}).catch(() => {});
            const rf = await screen(page); rf.dialogText = await dialogTexts(page);
            record('open-attach-review-files', rf);
            await shot(page, 'open-attach-review-files').catch(() => {});
            await closeAttachWindows(page);
            const before = await app.mail.count({to: `${u.au}@mail.test`, contains: O.title});
            const dlg = await submitRequest(page, 'open-sent');
            const mail = await mailOf(app, `${u.au}@mail.test`, O.title).catch((e) => ({error: String(e.message).slice(0, 200)}));
            done('open', {
                upload,
                reviewers: (stage.dialogText[0] || '').match(/Reviewers[\s\S]*?Author Response/)?.[0]?.slice(0, 500),
                bodyHtml: rp.frames[0] && rp.frames[0].html,
                reviewFilesWindow: (rf.dialogText.slice(-1)[0] || '').slice(0, 800),
                dialog: dlg.dialogText, mailBefore: before,
                mail: mail.error || {subject: mail.subject, attachments: mail.attachmentNames, headings: mail.reviewerHeadings, commentsBlock: mail.commentsBlock, from: mail.from},
            });
            await signOut(page);
        }
        // ---- openfile: a reviewer's uploaded file is not attached by itself; the editor picks it under "Attach Files" › "Review Files" ----
        if (on('openfile')) {
            const O = sc.O, t = O.tag, u = O.users;
            if (!sc.O2) {
                const r = await app.api.createSubmission({
                    tag: `${t}s2`, context: t, submitter: u.au, title: `U30 K2 open file ${t}`, decisions: ['sendExternalReview'],
                    reviewRounds: [{reviewers: [{username: u.rv1, status: 'accepted'}]}],
                });
                sc.O2 = {id: r.submissionId, round: r.reviewRounds[0].id, title: `U30 K2 open file ${t}`};
                save();
            }
            const O2 = sc.O2;
            let upload = {tried: false};
            if (!O2.reviewed) {
                await signIn(page, u.rv1, {contextPath: t});
                await page.goto(app.url(`/index.php/${t}/reviewer/submission/${O2.id}`));
                await idle(page);
                const step3Button = page.getByRole('button', {name: 'Continue to Step #3'});
                const saveContinue = page.getByRole('button', {name: 'Save and continue', exact: true});
                const submitButton = page.getByRole('button', {name: 'Submit Review', exact: true});
                await step3Button.or(saveContinue).filter({visible: true}).first().waitFor({timeout: 30_000});
                if (await saveContinue.filter({visible: true}).count()) await saveContinue.filter({visible: true}).first().click();
                await step3Button.filter({visible: true}).first().waitFor({timeout: 30_000});
                await step3Button.filter({visible: true}).first().click();
                await submitButton.filter({visible: true}).waitFor({timeout: 30_000});
                await idle(page);
                record('openfile-wizard-step3', await screen(page));
                // the comments box ("For author and editor"): the first TinyMCE frame on the step
                const frames = page.locator('iframe');
                if (await frames.count()) { const b = page.frameLocator('iframe').first().locator('body'); await b.click(); await b.pressSequentially(`Comments with a file for ${t}.`); }
                try {
                    const filePath = smallFile(`k2-reviewer-file-${t}.txt`, `Reviewer file for ${t}\n`);
                    const up = page.getByRole('link', {name: /Upload File/}).or(page.getByRole('button', {name: /Upload File/})).first();
                    await up.waitFor({timeout: 10_000});
                    upload.tried = true;
                    await up.click();
                    await idle(page);
                    const input = page.locator('input[type="file"]').last();
                    await input.waitFor({state: 'attached', timeout: 15_000});
                    await input.setInputFiles(filePath);
                    await idle(page);
                    const s = await screen(page); s.dialogText = await dialogTexts(page);
                    s.buttons = await page.locator('[role="dialog"]:visible').last().getByRole('button').allInnerTexts().catch(() => []);
                    record('openfile-upload-after-pick', s);
                    await shot(page, 'openfile-upload-after-pick').catch(() => {});
                    upload.afterPickButtons = s.buttons;
                    for (let i = 0; i < 4; i++) {
                        const dlg = page.locator('[role="dialog"]:visible').last();
                        const btn = dlg.getByRole('button', {name: /^(Continue|Save|Complete|OK|Add File|Upload)$/}).filter({visible: true}).last();
                        if (!(await btn.count()) || !(await dlg.count())) break;
                        upload[`pressed${i}`] = await btn.innerText();
                        await btn.click();
                        await idle(page);
                        await page.waitForFunction(() => document.querySelectorAll('[role="dialog"]').length === 0 || !/Upload/.test([...document.querySelectorAll('[role="dialog"]')].pop().innerText), null, {timeout: 5_000}).catch(() => {});
                    }
                    await idle(page);
                    upload.ok = true;
                    const s2 = await screen(page);
                    const tx = s2.text && s2.text.main || '';
                    upload.reviewerFilesText = tx.slice(tx.indexOf('Reviewer Files'), tx.indexOf('Reviewer Files') + 300);
                    record('openfile-wizard-after-upload', s2);
                } catch (e) {
                    upload.error = String(e.message).slice(0, 300);
                    await page.keyboard.press('Escape').catch(() => {});
                    await idle(page);
                }
                const rec = page.locator('select[id="reviewerRecommendationId"]');
                if (await rec.count()) await rec.selectOption({label: 'Accept Submission'});
                await submitButton.click();
                await idle(page);
                await page.getByRole('button', {name: 'OK', exact: true}).click();
                await page.getByRole('heading', {name: 'Review Submitted'}).waitFor({timeout: 30_000});
                await idle(page);
                await signOut(page);
                O2.reviewed = true; O2.upload = upload; save();
            }
            upload = O2.upload;
            await signIn(page, u.mgr, {contextPath: t});
            await editorStage(page, app, t, O2.id, O2.round);
            const stage = await captureWorkflow(page, 'openfile-stage');
            await page.getByRole('button', {name: 'Request Response', exact: true}).click();
            await waitRequestPage(page);
            const rp = await captureRequestPage(page, 'openfile-request-page');
            await page.getByRole('button', {name: 'Attach Files'}).click();
            const att = page.locator('[role="dialog"]:visible').last();
            await att.waitFor({timeout: 30_000});
            await idle(page);
            await att.getByRole('button', {name: 'Attach Review Files', exact: true}).click().catch(() => {});
            await idle(page);
            await page.waitForFunction(() => { const d = [...document.querySelectorAll('[role=dialog]')].pop(); return d && /k2-reviewer-file|No items found/i.test(d.innerText); }, null, {timeout: 15_000}).catch(() => {});
            const rf = await screen(page); rf.dialogText = await dialogTexts(page);
            record('openfile-attach-review-files', rf);
            await shot(page, 'openfile-attach-review-files').catch(() => {});
            await closeAttachWindows(page);
            const before = await app.mail.count({to: `${u.au}@mail.test`, contains: O2.title});
            const dlg = await submitRequest(page, 'openfile-sent');
            const mail = await mailOf(app, `${u.au}@mail.test`, O2.title).catch((e) => ({error: String(e.message).slice(0, 200)}));
            done('openfile', {
                upload,
                reviewers: (stage.dialogText[0] || '').match(/Reviewers[\s\S]*?Author Response/)?.[0]?.replace(/\s+/g, ' ').slice(0, 400),
                bodyHtml: rp.frames[0] && rp.frames[0].html.slice(rp.frames[0].html.indexOf('<hr>')),
                reviewFilesWindow: (rf.dialogText.slice(-1)[0] || '').slice(0, 800),
                dialog: dlg.dialogText, mailBefore: before,
                mail: mail.error || {subject: mail.subject, attachments: mail.attachmentNames, headings: mail.reviewerHeadings, commentsBlock: mail.commentsBlock},
            });
            await signOut(page);
        }
    } finally {
        await close();
    }
});
