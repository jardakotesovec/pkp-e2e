// U30 claim check, chunk K1: the editor's "Author Response" table on the OJS
// review stage — placement, "Response Status", when "Request Response" is
// enabled, the settings behind it ("Minimum Confirmed Reviews Required",
// "Notify All Authors") and who is named on the request — and where the
// author's "Author Response" card sits on the stage (Rule 1's last sentence,
// Rule 6's three states, S1 "The author's view", notes c and h).
// Spec: docs/specs/U30-author-response-to-reviews.md — Purpose (14–30),
// Rules 1–3 (84–126), Rule 6 (185–205), Rule 13, S1 (458–463), Coverage.
//
// Seeds its own scratch context(s) (a journal with "Minimum Confirmed Reviews
// Required" 1; a journal on open review for the author's Reviewers panel)
// plus throwaway submissions on the seeded journal, signs in from the roster
// and records every screen with screen(). This one file is the whole drive:
// no other script and no input file. Each run keeps its state in
// outFile('k1-state.json'), so give each run its own PROBE_RUN and run both:
//
//   PROBE_FEATURE=U30 PROBE_AGENT=ccK1s PROBE_RUN=r1 PROBE_NOTES_FEATURE=U30 node bin/probe.js ojs shared/playwright/checks/U30/K1/k1.js
//   PROBE_FEATURE=U30 PROBE_AGENT=ccK1s PROBE_RUN=r2 PROBE_NOTES_FEATURE=U30 node bin/probe.js ojs shared/playwright/checks/U30/K1/k1.js
//   PHASES=seed,table,card,request,author,states,open,response,scratch,notify   (default: all; later phases reuse the run's state file)
//   the card-placement drive alone: PHASES=seed,card,request,author,states,open
//
// OJS only: the table and the card exist nowhere else (note a), so `all`
// skips OMP and OPS.
const fs = require('fs');
const {forEachApp, launch, signIn, signOut, screen, shot, record, loc, note, idle, tag, outFile} =
    require('../../../probe');

const PHASES = process.env.PHASES ? process.env.PHASES.split(',') : ['seed', 'table', 'card', 'request', 'author', 'states', 'open', 'response', 'scratch', 'notify'];
const on = (p) => PHASES.includes(p);
const log = (...a) => console.log(...a);
// state per run: outFile() carries PROBE_RUN and the app, so r1 and r2 never share it
const scratchFile = () => outFile('k1-state.json');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const RESPONSE_TEXT = 'We added the control group the reviewer asked for.';

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

// Where the card sits: every visible h2–h4 of the workflow dialog in DOM
// order with its tag and its top on the page (DOM order and drawn order can
// differ), the card's index among them, what follows it, and the card's box.
async function placement(page) {
    const wf = page.getByRole('dialog').first();
    return wf.evaluate((root) => {
        const hs = [...root.querySelectorAll('h2, h3, h4')].filter((h) => h.offsetParent !== null);
        const list = hs.map((h) => ({tag: h.tagName.toLowerCase(), text: h.innerText.trim(), top: Math.round(h.getBoundingClientRect().top + window.scrollY)}));
        const i = list.findIndex((h) => h.text === 'Author Response');
        const card = i >= 0 ? hs[i] : null;
        const sortedByTop = [...list].sort((a, b) => a.top - b.top).map((h) => h.text);
        return {
            headings: list,
            drawnOrderMatchesDom: JSON.stringify(sortedByTop) === JSON.stringify(list.map((h) => h.text)),
            cardIndex: i,
            cardIsLast: i >= 0 && i === list.length - 1,
            before: i > 0 ? list[i - 1].text : null,
            after: i >= 0 && i < list.length - 1 ? list.slice(i + 1).map((h) => h.text) : [],
            cardBox: card ? card.parentElement.innerText.trim() : null,
            cardButtons: card ? [...card.parentElement.querySelectorAll('button')].map((b) => b.innerText.trim()) : [],
        };
    });
}

// The workflow screen is a side modal: screen() carries it in aria.dialogs.
// This adds the verbatim text, the panel headings in order, the table's
// rows (DOM text and rendered text per cell) and the button state.
async function captureWorkflow(page, name) {
    const s = await screen(page);
    s.dialogText = await dialogTexts(page);
    const wf = page.getByRole('dialog').first();
    s.panels = await wf.locator('h3, h4').allInnerTexts().catch(() => []);
    s.order = await placement(page).catch((e) => ({error: String(e.message).slice(0, 200)}));
    s.requestResponse = await buttonState(page.getByRole('button', {name: 'Request Response', exact: true}));
    const table = page.getByRole('table', {name: 'Author Response'});
    s.table = null;
    if (await table.count()) {
        s.table = {
            headersDom: await table.locator('th').evaluateAll((els) => els.map((e) => ({text: e.textContent.replace(/\s+/g, ' ').trim(), srOnly: !!e.querySelector('.sr-only')}))),
            headersRendered: await table.locator('th').allInnerTexts(),
            rows: [],
        };
        for (const tr of await table.locator('tbody tr').all()) {
            s.table.rows.push({
                dom: await tr.locator('td').evaluateAll((els) => els.map((e) => e.textContent.replace(/\s+/g, ' ').trim())),
                rendered: await tr.locator('td').allInnerTexts(),
                buttons: await tr.getByRole('button').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') || e.textContent.trim())),
            });
        }
        // the description sits between the heading and the table
        s.table.description = await wf.locator('h3, h4').filter({hasText: /^Author Response$/}).first().locator('xpath=..').innerText().catch(() => null);
    }
    record(name, s);
    await shot(page, name).catch(() => {});
    return s;
}
async function editorStage(page, app, ctx, id, round) {
    await page.goto(app.url(`/index.php/${ctx}/dashboard/editorial?workflowSubmissionId=${id}&workflowMenuKey=workflow_3_${round}`));
    await idle(page);
    await page.getByRole('heading', {name: 'Author Response'}).first().waitFor({timeout: 30_000});
    // the table can read "No Items" for a few seconds (screen notes, pD)
    await page.getByRole('table', {name: 'Author Response'}).locator('tbody tr').filter({hasNotText: 'No Items'}).first().waitFor({timeout: 30_000}).catch(() => {});
    await idle(page);
}
async function authorStage(page, app, ctx, id, round) {
    await page.goto(app.url(`/index.php/${ctx}/dashboard/mySubmissions?workflowSubmissionId=${id}&workflowMenuKey=workflow_3_${round}`));
    await idle(page);
    await page.getByRole('dialog').first().waitFor({timeout: 30_000});
    await idle(page);
}
// The request page: a full page; the template arrives after the page's own request.
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
    await idle(page);
}
async function captureRequestPage(page, name) {
    const s = await screen(page);
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
    // the "To" field: its chips and whether any input sits inside it
    const toField = page.locator('.pkpFormField, fieldset, div').filter({has: page.getByText('To', {exact: true})}).filter({hasNot: page.getByText('Subject')}).last();
    s.to = {
        text: (await toField.innerText().catch(() => '')).trim().slice(0, 400),
        inputs: await toField.locator('input:visible, textarea:visible').count().catch(() => null),
        buttons: await toField.getByRole('button').allInnerTexts().catch(() => []),
    };
    s.textboxes = [];
    for (const t of await page.getByRole('textbox').all()) {
        s.textboxes.push({name: await t.getAttribute('aria-label') || await t.getAttribute('name') || await t.getAttribute('id'), value: await t.inputValue().catch(() => null), visible: await t.isVisible()});
    }
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
    record(name, s);
    await shot(page, name).catch(() => {});
    return s;
}
async function mailOf(app, to, contains) {
    const m = await app.mail.find({to, contains, timeoutMs: 20_000});
    const full = await app.mail.fullMessage(m.ID);
    return {
        id: m.ID, subject: full.Subject, from: full.From, to: full.To, cc: full.Cc, bcc: full.Bcc, date: full.Date,
        greeting: ((full.Text || '').match(/Hello[^\n]*/) || [null])[0],
        opening: (full.Text || '').slice(0, 700),
        href: app.mail.extractLink(full.HTML, 'Submit Author Response'),
    };
}
async function authorWindow(page, name) {
    const wfa = page.getByRole('dialog').first();
    const cardBtn = wfa.getByRole('button', {name: 'Submit Response', exact: true});
    await cardBtn.waitFor({timeout: 30_000});
    await cardBtn.click();
    const modal = page.locator('[role="dialog"]:visible').filter({hasText: 'Submit Your Response to Reviewer Feedback'}).last();
    await modal.waitFor({timeout: 30_000});
    await modal.locator('iframe').first().waitFor({timeout: 30_000});
    await idle(page);
    const s = await screen(page);
    s.dialogText = await dialogTexts(page);
    s.authorBoxes = [];
    for (const cb of await modal.getByRole('checkbox').all()) {
        s.authorBoxes.push({label: await cb.evaluate((e) => (document.querySelector(`label[for="${e.id}"]`) || e.closest('label') || {}).innerText || e.getAttribute('aria-label')), checked: await cb.isChecked()});
    }
    record(name, s);
    await shot(page, name).catch(() => {});
    return {modal, s};
}

forEachApp(async (app) => {
    if (app.name !== 'ojs') return; // the chunk is OJS-only (the table exists nowhere else)
    let sc = fs.existsSync(scratchFile()) ? JSON.parse(fs.readFileSync(scratchFile(), 'utf8')) : {};
    const saveScratch = () => fs.writeFileSync(scratchFile(), JSON.stringify(sc, null, 2));
    const done = (name, data) => { record(`k1-${name}`, data); log(`[${name}]`, JSON.stringify(data).slice(0, 1200)); };
    const ctx = app.contextPath;

    // ---- seed: four submissions on the seeded journal, one scratch journal with two ----
    if (on('seed')) {
        const seedPk = async (key, reviewers, extra = {}) => {
            const t = tag('u30k1s' + key.toLowerCase());
            const title = `U30 K1 ${key} ${t}`;
            const r = await app.api.createSubmission({
                tag: t, context: ctx, submitter: 'author.alex', title, section: 'ART',
                decisions: ['sendExternalReview'],
                participants: [{username: 'sectioneditor.ana', role: 'sectionEditor'}, ...(extra.participants || [])],
                reviewRounds: [{reviewers}],
            });
            sc[key] = {tag: t, title, id: r.submissionId, round: r.reviewRounds[0].id};
        };
        await seedPk('A0', []);
        await seedPk('A1', [{username: 'reviewer.julia', status: 'accepted'}]);
        await seedPk('A2', [
            {username: 'reviewer.julia', status: 'completed', recommendation: 'pendingRevisions', comments: 'The method needs a control group.'},
            {username: 'reviewer.paul', status: 'declined'},
        ]);
        await seedPk('B', [{username: 'reviewer.julia', status: 'completed', recommendation: 'pendingRevisions', comments: 'The method needs a control group.'}],
            {participants: [{username: 'author.bea', role: 'author'}]});
        // Rule 6's other two states, no request: R a Request Revisions round, C an accepted round
        if (on('states')) {
            for (const [key, decision] of [['R', 'requestRevisions'], ['C', 'accept']]) {
                const t = tag('u30k1s' + key.toLowerCase());
                const title = `U30 K1 ${key} ${t}`;
                const r = await app.api.createSubmission({
                    tag: t, context: ctx, submitter: 'author.alex', title, section: 'ART',
                    decisions: ['sendExternalReview', decision],
                    participants: [{username: 'sectioneditor.ana', role: 'sectionEditor'}],
                    reviewRounds: [{reviewers: [{username: 'reviewer.julia', status: 'completed', recommendation: 'pendingRevisions', comments: `Reviewer comments for K1 ${key}.`}]}],
                });
                sc[key] = {tag: t, title, id: r.submissionId, round: r.reviewRounds[0].id};
            }
        }
        // open review: a journal whose reviews are open, so the author's Reviewers panel can show (note c)
        if (on('open')) {
            const t = tag('u30k1so');
            const u = {mgr: `${t}m`, rv: `${t}r`, au: `${t}a`};
            const c = await app.api.createContext({
                tag: t, context: {name: `U30 K1 open ${t}`},
                users: [
                    {username: u.mgr, roles: ['manager'], givenName: 'Mira', familyName: 'Manager'},
                    {username: u.rv, roles: ['externalReviewer'], givenName: 'Rowan', familyName: 'Openreviewer'},
                    {username: u.au, roles: ['author'], givenName: 'Ada', familyName: 'Authoress'},
                ],
                review: {defaultReviewMode: 'open'},
            });
            const o = await app.api.createSubmission({
                tag: `${t}s`, context: t, submitter: u.au, title: `U30 K1 O ${t}`, decisions: ['sendExternalReview'],
                reviewRounds: [{reviewers: [{username: u.rv, status: 'completed', recommendation: 'pendingRevisions', comments: `Open reviewer comments for ${t}.`}]}],
            });
            sc.O = {tag: t, users: u, contextId: c.contextId, id: o.submissionId, round: o.reviewRounds[0].id, title: `U30 K1 O ${t}`};
        }
        if (on('scratch') || on('notify')) {
        // scratch journal: minimum 1
        const t = tag('u30k1sj');
        const u = {mgr: `${t}m`, rv1: `${t}r1`, rv2: `${t}r2`, au: `${t}a`};
        const c = await app.api.createContext({
            tag: t, context: {name: `U30 K1 ${t}`},
            users: [
                {username: u.mgr, roles: ['manager'], givenName: 'Mira', familyName: 'Manager'},
                {username: u.rv1, roles: ['externalReviewer'], givenName: 'Rowan', familyName: 'ReviewerOne'},
                {username: u.rv2, roles: ['externalReviewer'], givenName: 'Riva', familyName: 'ReviewerTwo'},
                {username: u.au, roles: ['author'], givenName: 'Ada', familyName: 'Authoress'},
            ],
            review: {numReviewsPerSubmission: 1},
        });
        const s1 = await app.api.createSubmission({
            tag: `${t}s1`, context: t, submitter: u.au, title: `U30 K1 S1 ${t}`, decisions: ['sendExternalReview'],
            reviewRounds: [{reviewers: [
                {username: u.rv1, status: 'completed', recommendation: 'accept', comments: `Reviewer one comments for ${t}.`},
                {username: u.rv2, status: 'accepted'},
            ]}],
        });
        const s2 = await app.api.createSubmission({
            tag: `${t}s2`, context: t, submitter: u.au, title: `U30 K1 S2 ${t}`, decisions: ['sendExternalReview'],
            reviewRounds: [{reviewers: [{username: u.rv1, status: 'completed', recommendation: 'accept', comments: `Reviewer one comments for ${t} S2.`}]}],
        });
        sc.J = {tag: t, users: u, contextId: c.contextId,
            S1: {id: s1.submissionId, round: s1.reviewRounds[0].id, title: `U30 K1 S1 ${t}`},
            S2: {id: s2.submissionId, round: s2.reviewRounds[0].id, title: `U30 K1 S2 ${t}`}};
        }
        saveScratch();
        done('seeds', sc);
    }

    const {page, close} = await launch(app);
    try {
        // ---- table: Rules 1–3 on the seeded journal, as editor.diana ----
        if (on('table')) {
            await signIn(page, 'editor.diana');
            const out = {};
            for (const key of ['A0', 'A1', 'A2', 'B']) {
                await editorStage(page, app, ctx, sc[key].id, sc[key].round);
                const s = await captureWorkflow(page, `table-${key}`);
                out[key] = {panels: s.panels, table: s.table, requestResponse: s.requestResponse, reviewers: (s.dialogText[0] || '').match(/Reviewers[\s\S]*?Author Response/)?.[0]?.slice(0, 600)};
            }
            await loc(page, 'K1 table: "Request Response" header button', page.getByRole('button', {name: 'Request Response', exact: true}));
            await loc(page, 'K1 table: the "Author Response" table', page.getByRole('table', {name: 'Author Response'}));
            await signOut(page);
            // the sub-editor level: the assigned Section Editor on the ready round
            await signIn(page, 'sectioneditor.ana');
            await editorStage(page, app, ctx, sc.A2.id, sc.A2.round);
            const ana = await captureWorkflow(page, 'table-A2-sectioneditor');
            out.A2sectionEditor = {panels: ana.panels, table: ana.table, requestResponse: ana.requestResponse};
            done('table', out);
            await signOut(page);
        }

        // ---- card: Rule 1's last sentence — no card for the author before any request (A1 outstanding, A2 ready) ----
        if (on('card')) {
            await signIn(page, 'author.alex');
            const out = {};
            for (const key of ['A1', 'A2']) {
                await authorStage(page, app, ctx, sc[key].id, sc[key].round);
                const s = await captureWorkflow(page, `author-stage-${key}-no-request`);
                out[key] = {panels: s.panels, order: s.order, cardHeading: await page.getByRole('dialog').first().getByRole('heading', {name: 'Author Response'}).count(), submitResponse: await buttonState(page.getByRole('dialog').first().getByRole('button', {name: 'Submit Response', exact: true}))};
            }
            done('card', out);
            await signOut(page);
        }

        // ---- request: Rule 13 (two assigned authors) and Rule 3's "changes nothing" on B ----
        if (on('request')) {
            await signIn(page, 'editor.diana');
            const B = sc.B;
            const before = {alex: await app.mail.count({to: 'author.alex@mail.test', contains: B.title}), bea: await app.mail.count({to: 'author.bea@mail.test', contains: B.title})};
            await editorStage(page, app, ctx, B.id, B.round);
            await page.getByRole('button', {name: 'Request Response', exact: true}).click();
            await waitRequestPage(page);
            const rp = await captureRequestPage(page, 'request-page-B');
            await loc(page, 'K1 request page: the "To" field', page.getByText('To', {exact: true}).first());
            const dlg = await submitRequest(page, 'request-sent-B');
            const link = page.getByRole('link', {name: 'View Submission Summary'});
            await link.click();
            await page.waitForURL(/dashboard\/editorial/, {timeout: 30_000});
            await idle(page);
            await page.getByRole('table', {name: 'Author Response'}).locator('tbody tr').filter({hasNotText: 'No Items'}).first().waitFor({timeout: 30_000}).catch(() => {});
            const after = await captureWorkflow(page, 'table-B-after-request');
            const mailAlex = await mailOf(app, 'author.alex@mail.test', B.title).catch((e) => ({error: String(e.message).slice(0, 200)}));
            const mailBea = await mailOf(app, 'author.bea@mail.test', B.title).catch((e) => ({error: String(e.message).slice(0, 200)}));
            const counts = {alex: await app.mail.count({to: 'author.alex@mail.test', contains: B.title}), bea: await app.mail.count({to: 'author.bea@mail.test', contains: B.title})};
            done('request', {to: rp.to, greeting: rp.frames[0] && rp.frames[0].text.split('\n')[0], dialog: dlg.dialogText, tableAfter: after.table, buttonAfter: after.requestResponse, before, counts, mailAlex, mailBea, sameMessage: mailAlex.id === mailBea.id});
            await signOut(page);
        }

        // ---- author: the card, the Notifications list, the window's boxes (bea assigned, no box) ----
        if (on('author')) {
            const B = sc.B;
            await signIn(page, 'author.alex');
            await authorStage(page, app, ctx, B.id, B.round);
            const st = await captureWorkflow(page, 'author-stage-B');
            const notif = await page.locator('[role="dialog"]:visible').last().getByRole('listitem').filter({hasText: 'Request For Author Response'}).allInnerTexts().catch(() => []);
            const {modal, s} = await authorWindow(page, 'author-window-B');
            // Purpose: the author "says which of the submission's contributors the response speaks for"
            const body = modal.frameLocator('iframe').first().locator('body');
            await body.click();
            await body.pressSequentially(RESPONSE_TEXT);
            await modal.getByRole('checkbox', {name: 'Alex Author'}).check();
            await idle(page);
            const submitBtn = modal.getByRole('button', {name: 'Submit Response', exact: true});
            const submitState = await buttonState(submitBtn);
            await submitBtn.click();
            await idle(page);
            await modal.waitFor({state: 'hidden', timeout: 30_000}).catch(() => {});
            await idle(page);
            const afterSubmit = await captureWorkflow(page, 'author-stage-B-after-submit');
            // the same read after a reload
            await authorStage(page, app, ctx, B.id, B.round);
            const afterReload = await captureWorkflow(page, 'author-stage-B-after-submit-reload');
            done('author', {panels: st.panels, order: st.order, notifications: notif, boxes: s.authorBoxes, submitState,
                cardAfter: afterSubmit.order, cardAfterReload: afterReload.order});
            await signOut(page);
        }

        // ---- states: the card on a Request Revisions round and an accepted round, no request (Rule 6) ----
        if (on('states')) {
            await signIn(page, 'author.alex');
            const out = {};
            for (const key of ['R', 'C']) {
                await authorStage(page, app, ctx, sc[key].id, sc[key].round);
                await page.getByRole('dialog').first().getByRole('heading', {name: 'Author Response', exact: true}).waitFor({timeout: 15_000}).catch(() => {});
                const st = await captureWorkflow(page, `author-stage-${key}`);
                out[key] = {panels: st.panels, order: st.order, status: (st.dialogText[0] || '').match(/Round 1 Status\n+[^\n]*/)?.[0]};
            }
            await loc(page, 'K1s author stage: the "Author Response" card heading', page.getByRole('dialog').first().getByRole('heading', {name: 'Author Response', exact: true}));
            // leave the response window with text typed and unsaved (R), then reopen it
            // the accepted round's card opens the same window (read only, left by navigating away)
            out.cWindow = await authorWindow(page, 'author-window-C').then((r) => r.s.authorBoxes).catch((e) => ({error: String(e.message).slice(0, 200)}));
            const seen = [];
            const onDialog = async (d) => { seen.push({type: d.type(), message: d.message()}); await d.accept().catch(() => {}); };
            page.on('dialog', onDialog);
            await authorStage(page, app, ctx, sc.R.id, sc.R.round);
            const w = await authorWindow(page, 'author-window-R');
            const body = w.modal.frameLocator('iframe').first().locator('body');
            await body.click();
            await body.pressSequentially('Unsaved text typed before Cancel.');
            await w.modal.getByRole('button', {name: 'Cancel', exact: true}).click();
            await sleep(2000);
            await idle(page);
            const leave = await screen(page);
            leave.dialogText = await dialogTexts(page);
            leave.browserDialogs = [...seen];
            leave.windowStillOpen = await w.modal.isVisible().catch(() => false);
            record('author-window-R-after-cancel', leave);
            await shot(page, 'author-window-R-after-cancel').catch(() => {});
            // a Vue confirm may stand over the stage: answer it with its own leave button, if any
            const confirm = page.locator('[role="dialog"]:visible').filter({hasText: /unsaved|discard|leave/i}).last();
            let confirmButtons = [];
            if (await confirm.count()) {
                confirmButtons = await confirm.getByRole('button').allInnerTexts();
                const yes = confirm.getByRole('button', {name: /^(Yes|OK|Discard|Leave|Close)/}).first();
                if (await yes.count()) { await yes.click(); await idle(page); }
            }
            const again = await authorWindow(page, 'author-window-R-reopened');
            const reopenedText = await again.modal.frameLocator('iframe').first().locator('body').innerText().catch(() => null);
            await again.modal.getByRole('button', {name: 'Cancel', exact: true}).click();
            await sleep(1000);
            page.off('dialog', onDialog);
            out.leave = {browserDialogs: seen, vueDialogs: leave.dialogText.slice(1), windowStillOpen: leave.windowStillOpen, confirmButtons, reopenedText};
            done('states', out);
            await signOut(page);
        }

        // ---- open: an open-review journal, the author's Reviewers panel before and after "Mark as Complete" (note c) ----
        if (on('open')) {
            const O = sc.O, t = O.tag, u = O.users;
            const out = {};
            await signIn(page, u.mgr, {contextPath: t});
            await editorStage(page, app, t, O.id, O.round);
            out.editorBefore = (await captureWorkflow(page, 'open-editor-stage')).panels;
            await page.getByRole('button', {name: 'Request Response', exact: true}).click();
            await waitRequestPage(page);
            await captureRequestPage(page, 'open-request-page');
            out.sent = (await submitRequest(page, 'open-request-sent')).dialogText;
            await signOut(page);
            await signIn(page, u.au, {contextPath: t});
            await authorStage(page, app, t, O.id, O.round);
            const a1 = await captureWorkflow(page, 'open-author-unconfirmed');
            out.unconfirmed = {panels: a1.panels, order: a1.order};
            await signOut(page);
            await signIn(page, u.mgr, {contextPath: t});
            await editorStage(page, app, t, O.id, O.round);
            await wfModal(page).getByRole('button', {name: 'Read Review', exact: true}).first().click();
            const rd = page.getByRole('dialog').last();
            await rd.waitFor({timeout: 30_000});
            await page.waitForFunction(() => { const d = [...document.querySelectorAll('[role=dialog]')].pop(); return d && d.innerText.length > 200; }, null, {timeout: 15_000}).catch(() => {});
            await idle(page);
            await rd.getByRole('button', {name: 'Mark as Complete', exact: true}).click();
            await idle(page);
            await page.getByRole('dialog').last().getByRole('button', {name: 'Mark as Complete', exact: true}).last().click();
            await idle(page);
            await editorStage(page, app, t, O.id, O.round);
            out.editorAfter = (await captureWorkflow(page, 'open-editor-stage-complete')).panels;
            await signOut(page);
            await signIn(page, u.au, {contextPath: t});
            await authorStage(page, app, t, O.id, O.round);
            const a2 = await captureWorkflow(page, 'open-author-confirmed');
            out.confirmed = {panels: a2.panels, order: a2.order};
            done('open', out);
            await signOut(page);
        }

        // ---- response: Rule 2 row 3 and Rule 3 "greyed again once a response exists"; Purpose's read/correct/remove ----
        if (on('response')) {
            const B = sc.B;
            await signIn(page, 'editor.diana');
            await editorStage(page, app, ctx, B.id, B.round);
            await page.getByRole('table', {name: 'Author Response'}).getByText('A response was submitted').first().waitFor({timeout: 30_000}).catch(() => {});
            const s = await captureWorkflow(page, 'table-B-with-response');
            const table = page.getByRole('table', {name: 'Author Response'});
            const beaRow = table.locator('tbody tr').filter({has: page.locator('td:first-child', {hasText: 'Bea Author'})});
            const more = beaRow.getByRole('button', {name: /More Actions|…/}).first();
            let menu = null;
            if (await more.count()) {
                await more.click();
                await idle(page);
                menu = await page.locator('[role="menu"]:visible').getByRole('menuitem').evaluateAll((els) => els.map((e) => ({text: e.textContent.trim(), disabled: e.hasAttribute('disabled') || e.getAttribute('aria-disabled') === 'true'})));
                // never a page-level Escape (patterns pitfall 3b): close the menu on itself
                const {closeMenu} = require('../../../support/menus.js');
                await closeMenu(page);
                await idle(page);
            }
            done('response', {table: s.table, requestResponse: s.requestResponse, beaRowMenu: menu});
            await signOut(page);
        }

        // ---- scratch: "Minimum Confirmed Reviews Required" 1 (Rule 3, Coverage settings rows 1–2) ----
        if (on('scratch')) {
            const J = sc.J, t = J.tag, u = J.users;
            await signIn(page, u.mgr, {contextPath: t});
            // the setting's screen
            await page.goto(app.url(`/index.php/${t}/management/settings/workflow#reviewSetup`));
            await idle(page);
            await page.getByRole('tab', {name: 'Review', exact: true}).click().catch(() => {});
            await idle(page);
            const minField = page.locator('input[name="numReviewsPerSubmission"]');
            await minField.waitFor({timeout: 30_000});
            const settings = await screen(page);
            settings.numReviewsPerSubmission = await minField.inputValue();
            settings.tabs = await page.locator('[role="tab"]').allInnerTexts();
            settings.selectedTab = await page.locator('[role="tab"][aria-selected="true"]').allInnerTexts();
            settings.minLabel = await minField.evaluate((e) => { const l = document.querySelector(`label[for="${e.id}"]`); return l ? l.innerText : null; });
            record('settings-review-setup', settings);
            await shot(page, 'settings-review-setup').catch(() => {});
            // S1: submitted-not-confirmed
            await editorStage(page, app, t, J.S1.id, J.S1.round);
            const s1a = await captureWorkflow(page, 'scratch-S1-submitted');
            const modal = wfModal(page);
            const readReview = modal.getByRole('button', {name: 'Read Review', exact: true}).first();
            await readReview.click();
            const rd = page.getByRole('dialog').last();
            await rd.waitFor({timeout: 30_000});
            await page.waitForFunction(() => { const d = [...document.querySelectorAll('[role=dialog]')].pop(); return d && d.innerText.length > 200; }, null, {timeout: 15_000}).catch(() => {});
            await idle(page);
            const markBtn = rd.getByRole('button', {name: 'Mark as Complete', exact: true});
            await markBtn.click();
            await idle(page);
            const confirmDlg = page.getByRole('dialog').last();
            const confirmShot = await screen(page);
            confirmShot.dialogText = await dialogTexts(page);
            confirmShot.buttons = await confirmDlg.getByRole('button').allInnerTexts().catch(() => []);
            record('scratch-S1-mark-complete-confirm', confirmShot);
            await confirmDlg.getByRole('button', {name: 'Mark as Complete', exact: true}).last().click();
            await idle(page);
            await editorStage(page, app, t, J.S1.id, J.S1.round);
            const s1b = await captureWorkflow(page, 'scratch-S1-complete');
            // "Reviewer Thanked": Thank Reviewer on the completed row, if offered
            let thanked = null;
            const thank = wfModal(page).getByRole('button', {name: 'Thank Reviewer', exact: true}).first();
            if (await thank.count()) {
                await thank.click();
                const td = page.getByRole('dialog').last();
                await td.waitFor({timeout: 30_000});
                await td.locator('iframe').first().waitFor({timeout: 30_000}).catch(() => {});
                await idle(page);
                const ts = await screen(page); ts.dialogText = await dialogTexts(page);
                ts.buttons = await td.getByRole('button').allInnerTexts().catch(() => []);
                record('scratch-S1-thank-window', ts);
                const send = td.getByRole('button', {name: /^(Thank Reviewer|Send|OK)$/}).last();
                if (await send.count()) {
                    await send.click();
                    await idle(page);
                    await td.waitFor({state: 'hidden', timeout: 30_000}).catch(() => {});
                }
                await editorStage(page, app, t, J.S1.id, J.S1.round);
                const s1c = await captureWorkflow(page, 'scratch-S1-thanked');
                thanked = {reviewers: (s1c.dialogText[0] || '').match(/Reviewers[\s\S]*?Author Response/)?.[0]?.slice(0, 600), table: s1c.table, requestResponse: s1c.requestResponse};
            }
            // Request Response on S1 (minimum branch): the email goes out with one review outstanding
            const before = await app.mail.count({to: `${u.au}@mail.test`, contains: J.S1.title});
            await page.getByRole('button', {name: 'Request Response', exact: true}).click();
            await waitRequestPage(page);
            const rp = await captureRequestPage(page, 'scratch-S1-request-page');
            const dlg = await submitRequest(page, 'scratch-S1-request-sent');
            const mail = await mailOf(app, `${u.au}@mail.test`, J.S1.title).catch((e) => ({error: String(e.message).slice(0, 200)}));
            done('scratch', {
                setting: {value: settings.numReviewsPerSubmission, label: settings.minLabel, tabs: settings.tabs, selected: settings.selectedTab, url: settings.url},
                submitted: {reviewers: (s1a.dialogText[0] || '').match(/Reviewers[\s\S]*?Author Response/)?.[0]?.slice(0, 600), table: s1a.table, requestResponse: s1a.requestResponse, roundStatus: (s1a.dialogText[0] || '').match(/Round 1 Status[\s\S]{0,200}/)?.[0]},
                confirm: {text: confirmShot.dialogText.slice(-1), buttons: confirmShot.buttons},
                complete: {reviewers: (s1b.dialogText[0] || '').match(/Reviewers[\s\S]*?Author Response/)?.[0]?.slice(0, 600), table: s1b.table, requestResponse: s1b.requestResponse, roundStatus: (s1b.dialogText[0] || '').match(/Round 1 Status[\s\S]{0,200}/)?.[0]},
                thanked,
                request: {to: rp.to, opening: rp.frames[0] && rp.frames[0].text.slice(0, 300), dialog: dlg.dialogText, mailBefore: before, mail},
            });
            await signOut(page);
        }

        // ---- notify: "Notify All Authors" both ends on S2 (Rule 13, Coverage settings rows 3–4) ----
        if (on('notify')) {
            const J = sc.J, t = J.tag, u = J.users, S2 = J.S2;
            const cora = `cora.${t}@mail.test`;
            await signIn(page, u.mgr, {contextPath: t});
            // "Review Viewed" (Rule 3's list): Read Review › Cancel on the completed row, then reload
            await editorStage(page, app, t, S2.id, S2.round);
            const v0 = await captureWorkflow(page, 'notify-S2-stage-before');
            await wfModal(page).getByRole('button', {name: 'Read Review', exact: true}).first().click();
            const rdv = page.getByRole('dialog').last();
            await rdv.waitFor({timeout: 30_000});
            await page.waitForFunction(() => { const d = [...document.querySelectorAll('[role=dialog]')].pop(); return d && d.innerText.length > 200; }, null, {timeout: 15_000}).catch(() => {});
            await idle(page);
            const rv = await screen(page); rv.dialogText = await dialogTexts(page);
            record('notify-S2-read-review', rv);
            await rdv.getByRole('button', {name: 'Cancel', exact: true}).last().click();
            await idle(page);
            await editorStage(page, app, t, S2.id, S2.round);
            const v1 = await captureWorkflow(page, 'notify-S2-viewed');
            const viewed = {before: (v0.dialogText[0] || '').match(/Reviewers[\s\S]*?Author Response/)?.[0]?.slice(0, 400), after: (v1.dialogText[0] || '').match(/Reviewers[\s\S]*?Author Response/)?.[0]?.slice(0, 400), table: v1.table && v1.table.rows, requestResponse: v1.requestResponse};
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
            es.groupHeading = await radios.first().evaluate((e) => { let n = e.closest('.pkpFormField, fieldset'); while (n && !n.querySelector('h2, h3, legend')) n = n.parentElement; const h = n && n.querySelector('h2, h3, legend'); return h ? h.innerText : null; });
            record('settings-emails', es);
            await shot(page, 'settings-emails').catch(() => {});
            await loc(page, 'K1 Settings › Workflow › Emails: "Notify All Authors" radios', radios);
            const panel = page.getByRole('tabpanel', {name: 'Emails', exact: true});
            // a re-run finds the journal flipped by the previous run: put the default back first
            const allRadio = page.locator('input[name="notifyAllAuthors"][value="true"], input[name="notifyAllAuthors"][value="1"]').first();
            if (!(await allRadio.isChecked())) {
                await allRadio.check();
                await panel.getByRole('button', {name: 'Save', exact: true}).first().click();
                await idle(page);
                record('settings-emails-reset-to-default', {checked: await radios.evaluateAll((els) => els.map((e) => ({value: e.value, checked: e.checked})))});
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
            // "Contributor Roles" is required and its "Author" box, though drawn ticked, does not count until it is clicked
            const authorRole = addDlg.getByRole('checkbox', {name: 'Author', exact: true});
            if (await authorRole.count()) {
                if (await authorRole.isChecked()) await authorRole.uncheck();
                await authorRole.check();
            }
            await addDlg.getByRole('button', {name: 'Save', exact: true}).click();
            await idle(page);
            await addDlg.waitFor({state: 'hidden', timeout: 30_000}).catch(() => {});
            await idle(page);
            record('contributors-after', await screen(page));
            const counts = async () => ({author: await app.mail.count({to: `${u.au}@mail.test`, contains: S2.title}), cora: await app.mail.count({to: cora, contains: S2.title})});
            const before1 = await counts();
            await editorStage(page, app, t, S2.id, S2.round);
            const st = await captureWorkflow(page, 'notify-S2-stage');
            await page.getByRole('button', {name: 'Request Response', exact: true}).click();
            await waitRequestPage(page);
            const rp1 = await captureRequestPage(page, 'notify-request-default');
            await submitRequest(page, 'notify-sent-default');
            const authorMail = await mailOf(app, `${u.au}@mail.test`, S2.title).catch((e) => ({error: String(e.message).slice(0, 200)}));
            const coraMail = await mailOf(app, cora, S2.title).catch((e) => ({error: String(e.message).slice(0, 200)}));
            const after1 = await counts();
            // flip to assigned-only, save
            await page.goto(app.url(`/index.php/${t}/management/settings/workflow#emails`));
            await idle(page);
            await emailsTab.click();
            await idle(page);
            const assignedRadio = page.locator('input[name="notifyAllAuthors"][value="false"], input[name="notifyAllAuthors"][value="0"]').first();
            await assignedRadio.waitFor({timeout: 30_000});
            await assignedRadio.check();
            await panel.getByRole('button', {name: 'Save', exact: true}).first().click();
            await idle(page);
            const es2 = await screen(page);
            es2.notifyAllAuthors = await radios.evaluateAll((els) => els.map((e) => ({value: e.value, checked: e.checked})));
            record('settings-emails-after-save', es2);
            const before2 = await counts();
            await editorStage(page, app, t, S2.id, S2.round);
            await page.getByRole('button', {name: 'Request Response', exact: true}).click();
            await waitRequestPage(page);
            await captureRequestPage(page, 'notify-request-assigned-only');
            await submitRequest(page, 'notify-sent-assigned-only');
            await app.mail.find({to: `${u.au}@mail.test`, contains: S2.title, timeoutMs: 20_000}).catch(() => {});
            let after2 = await counts();
            for (let i = 0; i < 10 && after2.author < before2.author + 1; i++) { await sleep(1000); after2 = await counts(); }
            await signOut(page);
            // the author's window: the "Authors" boxes list Cora too
            await signIn(page, u.au, {contextPath: t});
            await authorStage(page, app, t, S2.id, S2.round);
            const {modal, s} = await authorWindow(page, 'notify-author-window');
            await modal.getByRole('button', {name: 'Cancel', exact: true}).click();
            await idle(page);
            done('notify', {
                viewed,
                setting: {radios: es.notifyAllAuthors, block: es.block, groupHeading: es.groupHeading, url: es.url},
                stageRows: st.table && st.table.rows,
                toDefault: rp1.to,
                mail: {before1, after1, authorMail, coraMail, before2, after2},
                afterSave: es2.notifyAllAuthors,
                authorBoxes: s.authorBoxes,
            });
            await signOut(page);
        }
    } finally {
        await close();
    }
});
