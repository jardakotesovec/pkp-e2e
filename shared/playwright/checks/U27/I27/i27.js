// U27 claim check, incidentals chunk I27 (housekeeping 2026-11-23): the incidentals row (U27, 2026-11-20)
// "on main the PDF export of a review that used a review form answers 500 (Class "ReviewFormElement" not
// found); a review without a form exports". Spec lines: Rule 15 "Downloading a review", scenario 10
// "Download the review" and their footnotes (i, f-a49; A49 for the neighbouring XML entries).
// OJS and OMP drive; OPS (no review stage) is a read-only control that the surface is absent.
//
// One scratch context per app and run (tag u27i…), seeded by the script:
//   forms  "I27 All"    six items, one of each type the form editor offers (small text, text, textarea,
//                       checkboxes, radio buttons, drop-down), all "Included in message to author"
//          "I27 Hidden" one small text item, NOT included in the message to author
//   users  ed (editor: Journal editor / Press editor, manager level), se (sectionEditor, sub-editor level,
//          a participant), au (author); reviewers rF, rH, rS, rN, rB (externalReviewer)
//   one submission in review round 1 with five requests:
//          rF accepted on "I27 All"    -> the reviewer's wizard answers all six items (phase rev)
//          rH accepted on "I27 Hidden" -> the reviewer's wizard answers its item (phase rev)
//          rS seeded `completed` on "I27 All" (the seed records no answers)
//          rN accepted, no form        -> the wizard fills both comment blocks (phase rev)
//          rB accepted on "I27 All"    -> the reviewer's wizard submits with every item left blank (phase rev)
// Phases (PHASES=a,b narrows; state in outFile('i27-state.json') = i27-state-<PROBE_RUN>-<app>.json):
//   seed  rev  list  dl  se  (err: opt-in, after rev on the same run)
//   list: the Reviewers table and every row's "More Actions" menu (is there any "Export PDF"?),
//         and the Review Details window of each review swept (its buttons, the download menu's items)
//   dl:   as ed, each of the four "Download Review Form" entries on rF, rH, rS, rN, rB: the export request,
//         the download (file name, size, the PDF's text read with the app's own pdf.js), the screen
//         after, the page notices and dialogs, and the server log lines since the press
//   se:   as se, "Editor Form Shows All Review Sections (PDF)" on rF and rN (the sub-editor level)
//   err:  (opt-in, PHASES=err on a run whose rev is done) as ed, rF's All Sections PDF: the "Error" dialog, its
//         "OK", and the window's XML entry pressed afterwards; every failed press in dl/se also answers the dialog
//   OPS runs only the control (phase ops, implied): a scratch preprint's workflow as its manager.
// Run, one app per call on main, twice (r1, r2):
//   PROBE_RUN=r1 PROBE_FEATURE=U27 PROBE_AGENT=ccI27 bin/app-lock.sh shared ojs -- \
//     node bin/probe.js ojs shared/playwright/checks/U27/I27/i27.js
//   … the same for omp and ops, and again with PROBE_RUN=r2. Then, per app and run, the opt-in phase:
//   PHASES=err PROBE_RUN=r1 PROBE_FEATURE=U27 PROBE_AGENT=ccI27 bin/app-lock.sh shared ojs -- \
//     node bin/probe.js ojs shared/playwright/checks/U27/I27/i27.js
// A whole default run takes 8-10 min per app (start it with the Bash tool's run_in_background).
// The text extraction reads PDFs with the app's own pdf.js (plugins/generic/pdfJsViewer) in a second,
// unrecorded browser; no other script or file is needed.
// Facts: .reports/U27/ccI27/i27-facts-<run>-<app>.json; snapshots i27-<nnn>-<label>-<run>-<app>.json/.png;
// downloads i27-dl-<review>-<entry>-<run>-<app>.<ext>. No assertions: the script records, the reader judges.
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, screen, shot, record, loc, note, idle, tag, serverLog, outFile} = require('../../../probe');

const ALL = ['seed', 'rev', 'list', 'dl', 'se'];
const PHASES = process.env.PHASES ? process.env.PHASES.split(',') : ALL;
const on = (p) => PHASES.includes(p);
const T = 30000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (s, n = 1500) => (s == null ? null : String(s).replace(/\s+/g, ' ').trim().slice(0, n));

const NAMES = {
    ed: ['Edna', 'Exporter'], se: ['Sid', 'Subexporter'], au: ['Ava', 'Authoress'],
    rF: ['Faye', 'Formfull'], rH: ['Hal', 'Formhidden'], rS: ['Sela', 'Formseeded'], rN: ['Noor', 'Noform'], rB: ['Bo', 'Formblank'],
};
const full = (k) => NAMES[k].join(' ');
const person = (t, k, roles) => ({username: `${t}${k.toLowerCase()}`, roles, givenName: NAMES[k][0], familyName: NAMES[k][1]});
const FORM_ALL = 'I27 All';
const FORM_HIDDEN = 'I27 Hidden';
const A = {
    small: 'I27 small answer', text: 'I27 text field answer', area: 'I27 textarea answer line',
    check: 'I27 Check Beta', radio: 'I27 Radio Yes', drop: 'I27 Drop High', hidden: 'I27 hidden item answer',
    comments: 'I27 comments for author and editor.', priv: 'I27 comments for the editor only.',
};
const ENTRIES = {
    authorPdf: /Author-Only.*PDF/i, editorPdf: /All Review Sections.*PDF/i,
    authorXml: /Author-Only.*XML/i, editorXml: /All Review Sections.*XML/i,
};

forEachApp(async (app) => {
    const N = app.name;
    const RUN = process.env.PROBE_RUN || 'r0';
    const isOMP = N === 'omp';
    const facts = {};
    const fact = (k, v) => { facts[k] = v; record('i27-facts', {[k]: v}, {merge: true}); console.log(`[${RUN} ${N}] ${k}:`, JSON.stringify(v).slice(0, 1200)); };
    const log = (...a) => console.log(`[${RUN} ${N}]`, ...a);
    async function sect(name, fn) {
        try { await fn(); } catch (e) { log(`[${name} FAILED]`, String(e.stack || e).split('\n').slice(0, 5).join(' | ')); fact(`${name} FAILED`, flat(e.message, 600)); }
    }

    // ---------------------------------------------------------------- OPS: the control
    if (N === 'ops') {
        const t = tag('u27i');
        const ctx = await app.api.createContext({tag: t, context: {name: `I27 OPS ${t}`}, users: [{username: `${t}mg`, roles: ['manager']}, person(t, 'au', ['author'])]});
        const sub = await app.api.createSubmission({tag: `${t}s`, context: ctx.path, submitter: `${t}au`, title: `I27 preprint ${t}`});
        const {page} = await launch(app);
        await signIn(page, `${t}mg`, {contextPath: ctx.path});
        await page.goto(app.url(`/index.php/${ctx.path}/dashboard/editorial?workflowSubmissionId=${sub.submissionId}`));
        await idle(page);
        await page.locator('[role="dialog"]:visible').first().waitFor({timeout: T}).catch(() => {});
        await idle(page);
        const s = await screen(page);
        record('i27-001-ops-workflow', s);
        await shot(page, 'i27-001-ops-workflow');
        const d = s.text.dialog || '';
        fact('ops control', {context: ctx.path, submission: sub.submissionId, snap: `i27-001-ops-workflow-${RUN}-ops`,
            reviewersTable: await page.getByRole('table', {name: 'Reviewers', exact: true}).count(),
            downloadButtons: await page.getByRole('button', {name: /Download Review Form/}).count(),
            mentions: {review: /\bReview\b/.test(d), reviewers: /Reviewers/.test(d), exportPdf: /Export PDF/i.test(d), download: /Download Review/i.test(d)},
            menu: flat(d, 800)});
        return;
    }

    // ---------------------------------------------------------------- seed
    const sf = outFile('i27-state.json');
    const st = fs.existsSync(sf) && !on('seed') ? JSON.parse(fs.readFileSync(sf, 'utf8')) : {};
    const save = () => fs.writeFileSync(sf, JSON.stringify(st, null, 2));
    if (on('seed')) await sect('seed', async () => {
        const t = tag('u27i');
        st.t = t; st.u = {};
        for (const k of Object.keys(NAMES)) st.u[k] = `${t}${k.toLowerCase()}`;
        const C = await app.api.createContext({
            tag: t, context: {name: `I27 ${t}`},
            users: [person(t, 'ed', ['editor']), person(t, 'se', ['sectionEditor']), person(t, 'au', ['author']),
                ...['rF', 'rH', 'rS', 'rN', 'rB'].map((k) => person(t, k, ['externalReviewer']))],
            reviewForms: [
                {title: {en: FORM_ALL}, elements: [
                    {question: {en: 'I27 Q small text'}, type: 'smalltextfield'},
                    {question: {en: 'I27 Q text field'}, type: 'textfield'},
                    {question: {en: 'I27 Q textarea'}, type: 'textarea'},
                    {question: {en: 'I27 Q checkboxes'}, type: 'checkboxes', options: ['I27 Check Alpha', A.check, 'I27 Check Gamma']},
                    {question: {en: 'I27 Q radio buttons'}, type: 'radiobuttons', options: [A.radio, 'I27 Radio No']},
                    {question: {en: 'I27 Q drop-down'}, type: 'dropdownbox', options: ['I27 Drop Low', A.drop]},
                ]},
                {title: {en: FORM_HIDDEN}, elements: [{question: {en: 'I27 Q hidden from author'}, type: 'smalltextfield', included: false}]},
            ],
        });
        st.ctx = C.path;
        const u = st.u;
        const r = await app.api.createSubmission({
            tag: `${t}s`, context: st.ctx, submitter: u.au, title: `I27 review export ${t}`,
            decisions: ['sendExternalReview'], participants: [{username: u.se, role: 'sectionEditor'}],
            reviewRounds: [{reviewers: [
                {username: u.rF, status: 'accepted', reviewForm: FORM_ALL},
                {username: u.rH, status: 'accepted', reviewForm: FORM_HIDDEN},
                {username: u.rS, status: 'completed', reviewForm: FORM_ALL},
                {username: u.rN, status: 'accepted'},
                {username: u.rB, status: 'accepted', reviewForm: FORM_ALL},
            ]}],
        });
        st.sub = {id: r.submissionId, rounds: r.reviewRounds, ra: r.reviewAssignments};
        st.seededAt = new Date().toISOString();
        save();
        fact('seed', {ctx: st.ctx, sub: st.sub});
    });
    if (!st.t) { log('no state; run the seed phase'); return; }
    const u = st.u;
    const ctx = st.ctx;

    const {page} = await launch(app);
    const dialogsSeen = [];
    page.on('dialog', async (d) => { dialogsSeen.push({type: d.type(), message: d.message(), at: new Date().toISOString()}); log('[browser dialog]', d.type(), flat(d.message(), 160)); await d.accept().catch(() => {}); });
    const traffic = [];
    page.on('response', (r) => {
        const url = r.url();
        if (!/\/api\/v1\/|\$\$\$call\$\$\$/.test(url)) return;
        traffic.push({at: Date.now(), m: r.request().method(), s: r.status(), u: url.replace(/^https?:\/\/[^/]+/, '').slice(0, 220), cd: r.headers()['content-disposition'] || null});
    });
    const since = (t0) => traffic.filter((e) => e.at >= t0).map(({m, s, u: url, cd}) => `${m} ${s} ${url}${cd ? ` [${cd}]` : ''}`);
    const slog = serverLog(app);
    let snapN = 0;
    async function snap(label) {
        let s;
        try { s = await screen(page); } catch (e) { s = {url: page.url(), error: flat(e.message, 200)}; }
        const name = `i27-${String(++snapN).padStart(3, '0')}-${label}`;
        record(name, s);
        await shot(page, name).catch(() => {});
        return {name: `${name}-${RUN}-${N}`, s};
    }
    const as = async (who) => { await signIn(page, u[who], {contextPath: ctx}); await idle(page); };
    const wfUrl = () => {
        const r0 = st.sub.rounds && st.sub.rounds[0];
        return app.url(`/index.php/${ctx}/dashboard/editorial?workflowSubmissionId=${st.sub.id}${r0 ? `&workflowMenuKey=workflow_${r0.stageId}_${r0.id}` : ''}`);
    };
    const reviewersTable = () => page.getByRole('table', {name: 'Reviewers', exact: true});
    const row = (k) => reviewersTable().getByRole('row').filter({hasText: full(k)}).first();
    async function openWf() {
        await page.goto(wfUrl()); await idle(page);
        await page.locator('[role="dialog"]:visible').first().waitFor({timeout: T}).catch(() => {});
        await reviewersTable().waitFor({timeout: T}).catch(() => log('no Reviewers table'));
        await idle(page);
    }
    const rd = () => page.getByRole('dialog', {name: /^Review Details:/}).last();
    async function openReviewDetails(k) {
        const r = row(k);
        await r.waitFor({timeout: T});
        const rowText = flat(await r.innerText(), 300);
        const read = r.getByRole('button', {name: 'Read Review', exact: true});
        let via = 'Read Review';
        if (await read.count()) await read.click();
        else {
            via = 'More Actions › Review Details';
            await r.getByRole('button', {name: /More Actions/}).first().click();
            await page.getByRole('menuitem', {name: 'Review Details', exact: true}).click();
        }
        await rd().waitFor({timeout: T});
        await page.waitForFunction(() => {
            const d = [...document.querySelectorAll('[role=dialog]')].filter((x) => /^Review Details:/.test(x.getAttribute('aria-label') || '')).pop();
            const b = d && [...d.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Modify Review');
            return b && !b.disabled;
        }, null, {timeout: T}).catch(() => log('Modify Review never enabled'));
        await idle(page);
        return {rowText, via};
    }
    async function closeReviewDetails() {
        const c = rd().getByRole('button', {name: 'Close', exact: true}).first();
        if (await c.count()) await c.click().catch(() => {});
        await rd().waitFor({state: 'hidden', timeout: 10000}).catch(() => {});
        await sleep(600); // pitfall 4f: the modal store's 450 ms close slot
    }

    // pdf.js of the app's own PDF viewer plugin, in a browser that leaves the run record alone
    let pdfBrowser = null;
    let errLocNoted = false;
    async function pdfText(file) {
        try {
            if (!pdfBrowser) {
                pdfBrowser = await launch(app, {record: false});
                await pdfBrowser.page.goto(app.url('/plugins/generic/pdfJsViewer/pdf.js/LICENSE'));
            }
            const b64 = fs.readFileSync(file).toString('base64');
            return await pdfBrowser.page.evaluate(async (data) => {
                const lib = await import('/plugins/generic/pdfJsViewer/pdf.js/build/pdf.mjs');
                lib.GlobalWorkerOptions.workerSrc = '/plugins/generic/pdfJsViewer/pdf.js/build/pdf.worker.mjs';
                const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
                const doc = await lib.getDocument({data: bytes}).promise;
                const out = [];
                for (let i = 1; i <= doc.numPages; i++) {
                    const tc = await (await doc.getPage(i)).getTextContent();
                    out.push(tc.items.map((x) => x.str).join(' '));
                }
                return {pages: doc.numPages, text: out.join(' \n ')};
            }, b64);
        } catch (e) { return {error: flat(e.message, 300)}; }
    }

    async function press(k, entry) {
        const out = {review: k, entry};
        const t0 = Date.now();
        const from = slog.mark();
        const btn = rd().getByRole('button', {name: /Download Review Form/});
        out.buttons = await btn.count();
        await btn.first().click();
        await page.getByRole('menuitem').first().waitFor({timeout: 10000}).catch(() => {});
        out.items = (await page.getByRole('menuitem').allInnerTexts().catch(() => [])).map((x) => flat(x, 80));
        const item = page.getByRole('menuitem').filter({hasText: ENTRIES[entry]}).first();
        out.pressed = flat(await item.innerText({timeout: 5000}).catch(() => '(none)'), 80);
        const exportAnswer = page.waitForResponse((r) => /\/reviews\/\d+\/\d+\/export-(pdf|xml)/.test(r.url()), {timeout: 60000}).catch(() => null);
        const arrived = page.waitForEvent('download', {timeout: 60000}).catch((e) => ({err: flat(e.message, 100)}));
        await item.click({timeout: 5000}).catch((e) => { out.itemClick = flat(e.message, 160); });
        const ans = await exportAnswer;
        out.exportStatus = ans ? ans.status() : null;
        if (ans) out.exportBody = flat(await ans.text().catch(() => ''), 400);
        let d = null;
        if (ans && ans.ok()) d = await arrived;
        else d = await Promise.race([arrived, sleep(4000).then(() => ({err: 'no download within 4 s of a failed export answer'}))]);
        await sleep(1000);
        await idle(page).catch(() => {});
        if (d && !d.err) {
            const file = await d.path().catch(() => null);
            out.file = d.suggestedFilename();
            out.bytes = file ? fs.statSync(file).size : null;
            if (file) {
                const keep = outFile(`i27-dl-${k}-${entry}${path.extname(out.file) || ''}`);
                fs.copyFileSync(file, keep);
                out.kept = path.basename(keep);
                if (/\.xml$/i.test(out.file)) {
                    const xml = fs.readFileSync(file, 'utf8');
                    out.xml = flat(xml, 1500);
                    out.anonymous = /<anonymous\s*\/>/.test(xml);
                } else if (/\.pdf$/i.test(out.file)) {
                    out.pdf = await pdfText(file);
                    if (out.pdf && out.pdf.text) out.pdf.text = flat(out.pdf.text, 1500);
                }
            }
        } else {
            out.noFile = d && d.err;
        }
        out.urlAfter = page.url().replace(/^https?:\/\/[^/]+/, '');
        const s = await snap(`dl-${k}-${entry}-after`);
        out.snap = s.name;
        out.notices = s.s.notices;
        out.windowOpen = await rd().isVisible().catch(() => false);
        // A failed export opens an "Error" dialog over the window: read it, press its "OK", read what is left
        const err = page.getByRole('dialog', {name: 'Error', exact: true});
        if (await err.count()) {
            out.errorDialog = flat(await err.last().innerText().catch(() => ''), 300);
            if (!errLocNoted) { errLocNoted = true; await loc(page, 'the "Error" dialog over Review Details after a failed export', err); }
            await err.last().getByRole('button', {name: 'OK', exact: true}).click().catch((e) => { out.okClick = flat(e.message, 160); });
            await err.last().waitFor({state: 'hidden', timeout: 10000}).catch(() => {});
            await sleep(600);
            const s2 = await snap(`dl-${k}-${entry}-after-ok`);
            out.afterOk = {snap: s2.name, windowOpen: await rd().isVisible().catch(() => false), errorDialogs: await err.count(), notices: s2.s.notices,
                downloadButton: await rd().getByRole('button', {name: /Download Review Form/}).count()};
        }
        out.requests = since(t0);
        out.serverLog = slog.since(from).map((l) => flat(l, 400));
        out.dialogs = dialogsSeen.filter((x) => Date.parse(x.at) >= t0);
        // close the menu if it stayed open (never a page Escape: pitfall 3b)
        if (await page.locator('[data-reka-menu-content][role="menu"]').count()) {
            await page.locator('[data-reka-menu-content][role="menu"]').press('Escape').catch(() => {});
        }
        return out;
    }

    try {
        // ---------------------------------------------------------------- rev: the reviewers' wizards
        if (on('rev')) await sect('rev', async () => {
            const {ReviewWizardPage} = require(path.resolve(__dirname, '../../../pages/ReviewerPages.js'));
            for (const k of ['rF', 'rH', 'rN', 'rB']) {
                if (st[`done_${k}`]) continue;
                await as(k);
                const w = new ReviewWizardPage(page, ctx, {privateBoxLabel: isOMP ? 'For editor only' : 'For editor'});
                await w.goto(st.sub.id);
                await idle(page);
                // A seeded `accepted` request reopens on step 1 with "Save and continue" in place of the accept button.
                await w.expectStep(1);
                await snap(`rev-${k}-step1`);
                if (await w.acceptButton.count()) await w.accept();
                else {
                    if (await w.privacyBox.count()) await w.privacyBox.check();
                    await w.saveAndContinueButton.click();
                    await w.expectStep(2);
                }
                await w.continueToStep3();
                await idle(page);
                const form = w.step3Form;
                if (k === 'rF') {
                    const texts = form.locator('input[type="text"][name^="reviewFormResponses"]');
                    await texts.nth(0).fill(A.small);
                    await texts.nth(1).fill(A.text);
                    await form.locator('textarea[name^="reviewFormResponses"]').first().fill(A.area);
                    await w.formCheckbox(A.check).check();
                    await w.formRadio(A.radio).check();
                    await form.locator('select[name^="reviewFormResponses"]').first().selectOption({label: A.drop});
                } else if (k === 'rH') {
                    await form.locator('input[type="text"][name^="reviewFormResponses"]').first().fill(A.hidden);
                } else if (k === 'rB') {
                    // nothing typed: the form's six optional items are left blank
                } else {
                    await w.typeComments(A.comments);
                    await w.typePrivateComments(A.priv);
                }
                if (!isOMP) await w.chooseRecommendation('Accept Submission');
                const s3 = await snap(`rev-${k}-step3-filled`);
                try {
                    await w.submitReview();
                } catch (e) {
                    // a refused submit (the blank form): what the step shows, then on to the next reviewer
                    const sr = await snap(`rev-${k}-step3-refused`);
                    fact(`rev ${k} refused`, {snap: sr.name, error: flat(e.message, 300), notices: sr.s.notices, text: flat(sr.s.text && sr.s.text.main, 1500)});
                    continue;
                }
                await w.expectCompleted().catch(() => {});
                const s4 = await snap(`rev-${k}-step4`);
                st[`done_${k}`] = true; save();
                fact(`rev ${k}`, {snaps: [s3.name, s4.name], step4Text: flat(s4.s.text && s4.s.text.main, 600),
                    step4OffersDownload: /Download Review|Export PDF/i.test((s4.s.text && s4.s.text.main) || '')});
            }
        });

        // ---------------------------------------------------------------- list: where the export is offered
        if (on('list')) await sect('list', async () => {
            await as('ed');
            await openWf();
            const w = await snap('list-workflow');
            await loc(page, 'Workflow › Review: "Reviewers" table', reviewersTable());
            const wText = (w.s.text && w.s.text.dialog) || '';
            const menus = {};
            for (const k of ['rF', 'rH', 'rS', 'rN', 'rB']) {
                const r = row(k);
                await r.getByRole('button', {name: /More Actions/}).first().click();
                await page.getByRole('menuitem').first().waitFor({timeout: 10000}).catch(() => {});
                menus[k] = {row: flat(await r.innerText(), 300), rowButtons: (await r.getByRole('button').allInnerTexts()).map((x) => flat(x, 60)),
                    items: (await page.getByRole('menuitem').allInnerTexts()).map((x) => flat(x, 80))};
                if (k === 'rF') await snap('list-rF-more-actions');
                await page.locator('[data-reka-menu-content][role="menu"]').press('Escape').catch(() => {});
                await page.locator('[data-reka-menu-content][role="menu"]').waitFor({state: 'detached', timeout: 5000}).catch(() => {});
            }
            const windows = {};
            for (const k of ['rF', 'rH', 'rS', 'rN', 'rB']) {
                const o = await openReviewDetails(k);
                const s = await snap(`list-${k}-review-details`);
                const btns = (await rd().getByRole('button').allInnerTexts()).map((x) => flat(x, 60)).filter(Boolean);
                await rd().getByRole('button', {name: /Download Review Form/}).first().click();
                await page.getByRole('menuitem').first().waitFor({timeout: 10000}).catch(() => {});
                const items = (await page.getByRole('menuitem').allInnerTexts()).map((x) => flat(x, 80));
                if (k === 'rF') {
                    await snap('list-rF-download-menu');
                    await loc(page, 'Review Details: "Download Review Form" menu button', rd().getByRole('button', {name: /Download Review Form/}));
                    await loc(page, 'Review Details: "Editor Form Shows All Review Sections (PDF)" menu item', page.getByRole('menuitem').filter({hasText: ENTRIES.editorPdf}));
                }
                await page.locator('[data-reka-menu-content][role="menu"]').press('Escape').catch(() => {});
                windows[k] = {...o, snap: s.name, buttons: btns, downloadItems: items, text: flat(s.s.text && s.s.text.dialog, 1500)};
                await closeReviewDetails();
            }
            fact('list', {workflowSnap: w.name, exportPdfAnywhere: /Export PDF/i.test(wText), menus, windows});
        });

        // ---------------------------------------------------------------- dl: the four entries as the editor
        if (on('dl')) await sect('dl', async () => {
            await as('ed');
            const presses = [];
            for (const k of ['rN', 'rF', 'rH', 'rS', 'rB']) {
                await openWf();
                await openReviewDetails(k);
                for (const entry of ['editorPdf', 'authorPdf', 'editorXml', 'authorXml']) {
                    if (!(await rd().isVisible().catch(() => false))) { await openWf(); await openReviewDetails(k); }
                    const r = await press(k, entry).catch((e) => ({review: k, entry, threw: flat(e.message, 300)}));
                    presses.push(r);
                    log(`dl ${k} ${entry}`, JSON.stringify({status: r.exportStatus, file: r.file, noFile: r.noFile, notices: r.notices, log: r.serverLog}).slice(0, 800));
                }
            }
            fact('dl', presses);
        });

        // ---------------------------------------------------------------- err: the failed export's "Error" dialog and its "OK"
        if (on('err')) await sect('err', async () => {
            await as('ed');
            await openWf();
            await openReviewDetails('rF');
            const r1 = await press('err-rF', 'editorPdf');
            // the same window afterwards: does an entry still work (the XML one)?
            const r2 = (await rd().isVisible().catch(() => false)) ? await press('err-rF', 'editorXml') : {skipped: 'window gone'};
            fact('err', [r1, r2]);
        });

        // ---------------------------------------------------------------- se: the sub-editor level
        if (on('se')) await sect('se', async () => {
            await as('se');
            const presses = [];
            for (const k of ['rN', 'rF']) {
                await openWf();
                await openReviewDetails(k);
                presses.push(await press(`se-${k}`, 'editorPdf').catch((e) => ({review: k, threw: flat(e.message, 300)})));
                presses[presses.length - 1].as = 'se';
            }
            fact('se', presses);
        });
    } finally {
        fact('dialogs', dialogsSeen);
        if (pdfBrowser) await pdfBrowser.close().catch(() => {});
    }
});
