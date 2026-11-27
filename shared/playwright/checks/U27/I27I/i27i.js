// U27 claim check, incidentals chunk I27I (housekeeping 2026-11-27): two incidentals rows.
//   Row 1 (U27 A57 issue reporter hk27a): the review's XML export answers 500 on a review made with a review
//     form holding a "Drop-down box" or "Radio buttons" item saved with no response options (an item with
//     options left unanswered only logs warnings). Bears on Rule 15, A55, A56, A57 (Rule 14a's A57 sentence).
//   Row 2 (U28 claim check I27G): "Modify Review" (Rule 14b) refuses a recommendation the journal does not
//     offer or no longer offers; the legacy grid op `reviewer-grid/review-read` (U27 note a: no window posts
//     to it on main) answers 500 on an unknown or non-numeric value. Bears on Rule 14b, A23, note a.
// OJS and OMP drive; OPS has no review stage (U27 Purpose): the script logs that and returns.
//
// One scratch context per app and run (tag u27i27i…), seeded by the script through the test API: a manager
// (mg), a section/series editor participant (se, the sub-editor level), an author, and external reviewers.
// Everything else is made on screen:
//   forms (PART forms): as mg, Settings › Workflow › "Review" › "Review Forms", four forms made active:
//     "I27I Drop none"   one "Drop-down box" item saved with no response options
//     "I27I Radio none"  one "Radio buttons" item saved with no response options
//     "I27I Radio opts"  one "Radio buttons" item with two options (A56's open question: radios only, blank)
//     "I27I With opts"   a "Drop-down box" and a "Radio buttons" item, each with two options (the row's control)
//   then one submission F in External Review with five requests: rD, rR, rO, rC accepted on those forms (the
//   reviewer's own wizard submits each with every item left blank; OJS "Accept Submission"), rN seeded
//   completed with no form (its PDF makes the install's temporary files folder, A49). As mg: each review's
//   Review Details window and its four "Download Review Form" entries; as se: the two XML entries of rD and
//   rR (the sub-editor level).
//   modify (PART modify): submissions M1, M2, M3 with one seeded completed review each (OJS "Accept
//   Submission"). OJS: M1 as mg and M2 as se open "Modify Review"; a second browser signed in as mg then
//   switches a recommendation off on Settings › "Reviewer Recommendations" ("See Comments" / "Resubmit
//   Elsewhere"); the open window still lists it; it is chosen and "Save Changes" pressed (the screen's own
//   request, "no longer offers"), then a listed choice (control). M1 also: a select change left by "Cancel".
//   M3: "Accept Submission" (the review's own) switched off, then "Modify Review" opened and saved with a
//   comment change. OMP (no recommendation): M1 as mg and M2 as se, the window read, "Cancel" with typed
//   text, and a save with a typed comment (control).
//   legacy (PART legacy): submission L, one seeded completed review (OJS "Decline Submission", which the
//   modify part never switches off); the legacy op sent directly as mg (the
//   Frame's exception: no window posts to it) with reviewerRecommendationId 99999 and "abc"; then the row and
//   Review Details read on screen.
//
// Run from the repo root, twice (each run seeds afresh), one process per app (they may run at once):
//   PROBE_RUN=r1 PROBE_FEATURE=U27 PROBE_AGENT=ccI27I PROBE_NOTES_FEATURE=U27 \
//     node bin/probe.js ojs shared/playwright/checks/U27/I27I/i27i.js
//   … the same with omp, and again with PROBE_RUN=r2. PARTS=forms,modify,legacy narrows (default all three).
// A run takes about 6-9 min per app (start it with the Bash tool's run_in_background). No other script, env
// part or file is read. Outputs: .reports/U27/ccI27I/<nnn>-<label>-<run>-<app>.json/.png, facts
// facts-<run>-<app>.json, downloads dl-<review>-<entry>-<run>-<app>.<ext>.
// No assertions: the script records, the reader judges.
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, signOut, screen, shot, record, loc, note, idle, tag, sql, serverLog, outFile} =
    require('../../../probe');

const RUN = process.env.PROBE_RUN || 'r0';
const PARTS = process.env.PARTS ? process.env.PARTS.split(',') : ['forms', 'modify', 'legacy'];
const part = (p) => PARTS.includes(p);
const T = 30000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (s, n = 1500) => (s == null ? null : String(s).replace(/\s+/g, ' ').trim().slice(0, n));

const NAMES = {
    mg: ['Mira', 'Manager'], se: ['Seth', 'Subeditor'], au: ['Aria', 'Author'],
    rD: ['Dora', 'Dropnone'], rR: ['Rafe', 'Radionone'], rO: ['Olga', 'Radioopts'], rC: ['Cato', 'Withopts'], rN: ['Nell', 'Noform'],
    rM1: ['Milo', 'Modone'], rM2: ['Mara', 'Modtwo'], rM3: ['Mick', 'Modthree'], rL: ['Lena', 'Legacy'],
};
const full = (k) => NAMES[k].join(' ');
const FORMS = {
    rD: {title: 'I27I Drop none', items: [{question: 'I27I drop-down without options', type: 'Drop-down box', options: []}]},
    rR: {title: 'I27I Radio none', items: [{question: 'I27I radio without options', type: 'Radio buttons (you can only choose one)', options: []}]},
    rO: {title: 'I27I Radio opts', items: [{question: 'I27I radio with options', type: 'Radio buttons (you can only choose one)', options: ['I27I Yes', 'I27I No']}]},
    rC: {title: 'I27I With opts', items: [
        {question: 'I27I drop-down with options', type: 'Drop-down box', options: ['I27I Low', 'I27I High']},
        {question: 'I27I radio beside it', type: 'Radio buttons (you can only choose one)', options: ['I27I Left', 'I27I Right']},
    ]},
};
const ENTRIES = {
    editorXml: /All Review Sections.*XML/i, authorXml: /Author-Only.*XML/i,
    editorPdf: /All Review Sections.*PDF/i, authorPdf: /Author-Only.*PDF/i,
};

forEachApp(async (app) => {
    const N = app.name;
    const ojs = N === 'ojs';
    const log = (...a) => console.log(`[${RUN} ${N}]`, ...a);
    if (N === 'ops') { log('no review stage and no reviewer role (U27 Purpose): nothing to drive'); return; }
    const facts = {run: RUN, app: N, failed: {}};
    const fact = (k, v) => { facts[k] = v; record('facts', {[k]: v}, {merge: true}); log(`[${k}]`, JSON.stringify(v).slice(0, 2500)); };
    const sect = async (name, fn) => {
        try { await fn(); } catch (e) { facts.failed[name] = flat(e.message, 500); log(`[${name} FAILED]`, String(e.stack || e).split('\n').slice(0, 4).join(' | ')); }
    };
    const slog = serverLog(app);

    // ---------------------------------------------------------------- seed (test API: users only)
    const t = tag('u27i27i');
    const U = {};
    for (const k of Object.keys(NAMES)) U[k] = `${t}${k.toLowerCase()}`;
    const person = (k, roles) => ({username: U[k], roles, givenName: NAMES[k][0], familyName: NAMES[k][1]});
    const C = await app.api.createContext({
        tag: t, context: {name: `I27I ${t}`, contactName: 'I27I Contact', contactEmail: `${t}contact@mail.test`},
        users: [person('mg', ['manager']), person('se', ['sectionEditor']), person('au', ['author']),
            ...['rD', 'rR', 'rO', 'rC', 'rN', 'rM1', 'rM2', 'rM3', 'rL'].map((k) => person(k, ['externalReviewer']))],
    });
    const cp = C.path || t;
    fact('seed', {context: cp, users: U});
    const raOf = (subId, k) => Number(sql(app, `select review_id from review_assignments where submission_id=${subId} and reviewer_id=(select user_id from users where username='${U[k]}')`));
    const stored = (ra) => sql(app, `select coalesce(reviewer_recommendation_id::text,'null')||'|step='||step||'|completed='||(date_completed is not null) from review_assignments where review_id=${ra}`);
    const wfUrl = (s) => {
        const r0 = (s.rounds || [])[0];
        return app.url(`/index.php/${cp}/dashboard/editorial?workflowSubmissionId=${s.id}${r0 ? `&workflowMenuKey=workflow_${r0.stageId}_${r0.id}` : ''}`);
    };

    const {page} = await launch(app);
    const dialogs = [];
    page.on('dialog', async (d) => { dialogs.push({type: d.type(), message: flat(d.message(), 200)}); await d.accept().catch(() => {}); });
    const answers = [];
    page.on('response', async (r) => {
        const u = r.url();
        if (!/reviewAssignments\/\d+\/review(\?|$)|export-(pdf|xml)|review-read|update-review-form-element|saveStep/.test(u)) return;
        const req = r.request();
        if (req.method() === 'GET' && !/export-/.test(u)) return;
        const rec = {m: req.method(), s: r.status(), u: u.replace(/^https?:\/\/[^/]+/, '').slice(0, 200), override: req.headers()['x-http-method-override'] || null};
        if (r.status() >= 400 || /reviewAssignments/.test(u)) { try { rec.body = flat(await r.text(), 600); } catch (e) { rec.body = '(unread)'; } }
        answers.push(rec);
    });
    const take = () => answers.splice(0);
    let n = 0;
    const snap = async (name, pg = page) => {
        const label = `${String(++n).padStart(3, '0')}-${name}`;
        let s;
        try { s = await screen(pg); } catch (e) { s = {url: pg.url(), error: flat(e.message, 200)}; }
        record(label, s); await shot(pg, label).catch(() => {});
        return {label: `${label}-${RUN}-${N}`, notices: s.notices, dialog: s.text && s.text.dialog ? flat(s.text.dialog, 1500) : null};
    };
    const as = async (k, pg = page) => { await signIn(pg, U[k], {contextPath: cp}); await idle(pg); };
    const tbl = () => page.getByRole('table', {name: 'Reviewers', exact: true});
    const rowOf = (k) => tbl().getByRole('row').filter({hasText: full(k)}).first();
    async function openWf(s) {
        await page.goto('about:blank');
        await page.goto(wfUrl(s)); await idle(page);
        await page.locator('[role="dialog"]:visible').first().waitFor({timeout: T}).catch(() => {});
        await tbl().waitFor({timeout: T}).catch(() => log('no Reviewers table'));
        await idle(page);
    }
    const rd = () => page.getByRole('dialog', {name: /^Review Details:/}).last();
    async function openRD(k) {
        const r = rowOf(k);
        await r.waitFor({timeout: T});
        const out = {row: flat(await r.innerText(), 300)};
        const read = r.getByRole('button', {name: 'Read Review', exact: true});
        if (await read.count()) { out.via = 'Read Review'; await read.click(); }
        else {
            out.via = 'More Actions › Review Details';
            await r.getByRole('button', {name: /More Actions/}).first().click();
            await page.getByRole('menuitem', {name: 'Review Details', exact: true}).click();
        }
        await rd().waitFor({timeout: T});
        await rd().getByRole('button', {name: 'Modify Review', exact: true}).and(page.locator(':enabled')).waitFor({timeout: T}).catch(() => { out.modifyNeverEnabled = true; });
        await idle(page); await sleep(800);
        return out;
    }
    async function closeRD() {
        const c = rd().getByRole('button', {name: 'Close', exact: true}).first();
        if (await c.count()) await c.click().catch(() => {});
        await rd().waitFor({state: 'hidden', timeout: 10000}).catch(() => {});
        await sleep(600);
    }

    // pdf.js of the app's own PDF viewer plugin, in a browser that leaves the run record alone (from U27 I27)
    let pdfBrowser = null;
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
                for (let i = 1; i <= doc.numPages; i++) out.push((await (await doc.getPage(i)).getTextContent()).items.map((x) => x.str).join(' '));
                return {pages: doc.numPages, text: out.join(' \n ')};
            }, b64);
        } catch (e) { return {error: flat(e.message, 300)}; }
    }

    // Review Details › "Download Review Form" › entry: the export answer, the file, the "Error" window and its "OK"
    async function download(k, entry) {
        const out = {review: k, entry};
        const from = slog.mark();
        take(); dialogs.splice(0);
        const btn = rd().getByRole('button', {name: /Download Review Form/});
        await btn.first().click();
        await page.getByRole('menuitem').first().waitFor({timeout: 10000}).catch(() => {});
        out.items = (await page.getByRole('menuitem').allInnerTexts().catch(() => [])).map((x) => flat(x, 80));
        const item = page.getByRole('menuitem').filter({hasText: ENTRIES[entry]}).first();
        const answer = page.waitForResponse((r) => /\/reviews\/\d+\/\d+\/export-(pdf|xml)/.test(r.url()), {timeout: 60000}).catch(() => null);
        const arrived = page.waitForEvent('download', {timeout: 60000}).catch((e) => ({err: flat(e.message, 100)}));
        await item.click({timeout: 5000}).catch((e) => { out.itemClick = flat(e.message, 160); });
        const a = await answer;
        out.exportStatus = a ? a.status() : null;
        if (a && !a.ok()) out.exportBody = flat(await a.text().catch(() => ''), 300);
        const d = a && a.ok() ? await arrived : await Promise.race([arrived, sleep(4000).then(() => ({err: 'no download within 4 s of a failed export answer'}))]);
        await sleep(1000); await idle(page).catch(() => {});
        if (d && !d.err) {
            const file = await d.path().catch(() => null);
            out.file = d.suggestedFilename();
            if (file) {
                const keep = outFile(`dl-${k}-${entry}${path.extname(out.file) || ''}`);
                fs.copyFileSync(file, keep);
                out.kept = path.basename(keep);
                if (/\.xml$/i.test(out.file)) {
                    const xml = fs.readFileSync(file, 'utf8');
                    out.customMeta = [...xml.matchAll(/<custom-meta>\s*<meta-name>([^<]*)<\/meta-name>\s*<meta-value>([^<]*)<\/meta-value>/g)].map((m) => `${m[1]} = ${m[2]}`);
                    out.anonymous = /<anonymous\s*\/>/.test(xml);
                } else if (/\.pdf$/i.test(out.file)) {
                    const p = await pdfText(file);
                    out.pdf = p && p.text ? flat(p.text, 900) : p;
                }
            }
        } else out.noFile = d && d.err;
        const s = await snap(`dl-${k}-${entry}`);
        out.snap = s.label; out.notices = s.notices;
        const err = page.getByRole('dialog', {name: 'Error', exact: true});
        out.errorWindow = (await err.count()) > 0;
        if (out.errorWindow) {
            out.errorWindowText = flat(await err.last().innerText().catch(() => ''), 200);
            await err.last().getByRole('button', {name: 'OK', exact: true}).click().catch(() => {});
            await err.last().waitFor({state: 'hidden', timeout: 10000}).catch(() => {});
            await sleep(600);
            out.afterOk = {reviewDetailsOpen: await rd().isVisible().catch(() => false)};
        }
        const m = page.locator('[data-reka-menu-content][role="menu"]');
        if (await m.count()) await m.press('Escape').catch(() => {});
        out.requests = take().map((x) => `${x.m} ${x.s} ${x.u}`);
        out.dialogs = dialogs.splice(0);
        out.serverLog = slog.since(from).map((l) => flat(l, 400)).slice(0, 8);
        return out;
    }

    try {
        // ============================================================ forms (row 1)
        if (part('forms')) await sect('forms', async () => {
            const {ReviewSettingsPage} = require('../../../pages/ReviewSettingsPages.js');
            const {expect} = require('@playwright/test');
            await as('mg');
            const settings = new ReviewSettingsPage(page, cp);
            const forms = settings.forms;
            const made = {};
            for (const k of ['rD', 'rR', 'rO', 'rC']) {
                const f = FORMS[k];
                await settings.goto('Review Forms'); await idle(page);
                await forms.createForm(f.title);
                const controls = await forms.rowControls(forms.row(f.title).first());
                await forms.control(controls, 'Edit').click();
                await forms.windowHeading().waitFor({timeout: T});
                await forms.openWindowTab('Form Items');
                const saves = [];
                for (const item of f.items) {
                    await forms.openCreateItem();
                    await forms.fillItem({question: item.question, required: false, type: item.type});
                    for (const option of item.options) {
                        const inputs = forms.itemForm.locator('input[name^="newRowId[possibleResponse]"]');
                        const before = await inputs.count();
                        await forms.itemAddOptionLink.dispatchEvent('mousedown');
                        await expect.poll(() => inputs.count(), {timeout: T}).toBeGreaterThan(before);
                        const box = forms.itemForm.locator('input[name^="newRowId[possibleResponse]"][name$="[en]"]').last();
                        await box.fill(option); await box.press('Enter'); await idle(page);
                        await forms.responseOptionRow(option).first().waitFor({timeout: T});
                    }
                    if (!item.options.length) {
                        const s0 = await snap(`form-${k}-item-before-save`);
                        saves.push({beforeSave: s0.label});
                    }
                    take(); dialogs.splice(0);
                    const saved = page.waitForResponse((r) => r.url().includes('/update-review-form-element') && r.request().method() === 'POST', {timeout: T}).catch(() => null);
                    await forms.itemSaveButton.click();
                    const resp = await saved;
                    const body = resp ? await resp.json().catch(() => null) : null;
                    await forms.itemForm.waitFor({state: 'hidden', timeout: T}).catch(() => {});
                    await idle(page);
                    const s1 = await snap(`form-${k}-item-saved`);
                    saves.push({question: item.question, status: resp && resp.status(), refused: body && body.status === false ? flat(String(body.content || '').replace(/<[^>]+>/g, ' '), 300) : null,
                        notices: s1.notices, dialogs: dialogs.splice(0), snap: s1.label});
                }
                // the empty item reopened: its "Response Options"
                if (!f.items[0].options.length) {
                    const r = forms.itemRow(f.items[0].question).first();
                    const ctrls = await forms.rowControls(r).catch(() => null);
                    if (ctrls) {
                        await forms.control(ctrls, 'Edit').click().catch(() => {});
                        await forms.itemForm.waitFor({timeout: T}).catch(() => {});
                        await idle(page);
                        const s2 = await snap(`form-${k}-item-reopened`);
                        saves.push({reopened: s2.label, options: flat(await forms.itemForm.locator('#elementOptionsListbuilderContainer').innerText().catch(() => ''), 200)});
                        await page.getByRole('dialog').filter({has: forms.itemForm}).last().getByRole('button', {name: /Close|Cancel/}).first().click().catch(() => {});
                        await forms.itemForm.waitFor({state: 'hidden', timeout: 10000}).catch(() => {});
                    }
                }
                const listed = (await forms.itemRows().allInnerTexts()).map((x) => flat(x, 120));
                await forms.closeWindow();
                await settings.goto('Review Forms'); await idle(page);
                await forms.activeBox(forms.row(f.title).first()).click();
                await forms.answerConfirm(/activate this review form/i, 'OK');
                await idle(page);
                made[k] = {title: f.title, saves, items: listed, active: await forms.activeBox(forms.row(f.title).first()).isChecked()};
            }
            const s = await snap('forms-list');
            fact('forms', {made, listSnap: s.label,
                stored: sql(app, `select f.review_form_id||':'||e.element_type||':'||coalesce((select string_agg(locale||'='||setting_value, ';') from review_form_element_settings x where x.review_form_element_id=e.review_form_element_id and x.setting_name='possibleResponses'),'(no possibleResponses row)') from review_forms f join review_form_elements e on e.review_form_id=f.review_form_id where f.assoc_id=(select ${ojs ? 'journal_id from journals' : 'press_id from presses'} where path='${cp}') order by 1`).split('\n')});
            await signOut(page).catch(() => {});

            // the submission: the four requests on the forms, the free-form completed control
            const r = await app.api.createSubmission({
                tag: `${t}f`, context: cp, submitter: U.au, title: `I27I forms ${t}`,
                decisions: ['sendExternalReview'], participants: [{username: U.se, role: 'sectionEditor'}],
                reviewRounds: [{reviewers: [
                    ...['rD', 'rR', 'rO', 'rC'].map((k) => ({username: U[k], status: 'accepted', reviewForm: FORMS[k].title})),
                    {username: U.rN, status: 'completed', comments: 'I27I free-form review text.', ...(ojs ? {recommendation: 'accept'} : {})},
                ]}],
            });
            const F = {id: r.submissionId, rounds: r.reviewRounds};
            for (const k of ['rD', 'rR', 'rO', 'rC', 'rN']) F[k] = raOf(F.id, k);
            fact('F', F);

            // the reviewers' own wizards, every item left blank
            const {ReviewWizardPage} = require('../../../pages/ReviewerPages.js');
            for (const k of ['rD', 'rR', 'rO', 'rC']) await sect(`review-${k}`, async () => {
                await as(k);
                const w = new ReviewWizardPage(page, cp, {privateBoxLabel: ojs ? 'For editor' : 'For editor only'});
                await w.goto(F.id);
                await w.accept();
                await w.continueToStep3();
                await idle(page);
                const s3 = await snap(`review-${k}-step3`);
                const controls = await page.locator('#reviewStep3Form').evaluate((f) => [...f.querySelectorAll('select[name^="reviewFormResponses"], input[name^="reviewFormResponses"]')]
                    .map((e) => `${e.tagName}${e.type ? `[${e.type}]` : ''} ${e.name}${e.tagName === 'SELECT' ? ` options=${JSON.stringify([...e.options].map((o) => `${o.value}:${o.text.trim()}`))} value=${JSON.stringify(e.value)}` : ''}`));
                const rec = page.locator('#reviewStep3Form select[name="reviewerRecommendationId"]');
                if (await rec.count()) await rec.selectOption({label: 'Accept Submission'});
                take(); dialogs.splice(0);
                const posted = page.waitForRequest((q) => q.method() === 'POST' && /saveStep/.test(q.url()), {timeout: T}).catch(() => null);
                await w.submitReview();
                const req = await posted;
                await w.expectCompleted().catch((e) => log(`${k} not completed: ${flat(e.message, 120)}`));
                const s4 = await snap(`review-${k}-submitted`);
                fact(`review-${k}`, {step3: s3.label, controls, posted: req ? decodeURIComponent((req.postData() || '').replace(/\+/g, ' ')).split('&').filter((kv) => /^reviewFormResponses/.test(kv)) : null,
                    submitted: s4.label, answers: take().map((x) => `${x.m} ${x.s} ${x.u}`), dialogs: dialogs.splice(0), stored: stored(F[k]),
                    responses: sql(app, `select review_form_element_id||'|'||coalesce(response_type,'null')||'|'||coalesce(response_value,'null') from review_form_responses where review_id=${F[k]}`).split('\n').filter(Boolean)});
            });

            // the editor (manager level): the temporary folder first (A49), then each review
            await as('mg');
            await openWf(F);
            fact('F-row-list', {snap: (await snap('F-workflow')).label, rows: (await tbl().getByRole('row').allInnerTexts().catch(() => [])).map((x) => flat(x, 200))});
            await sect('tempFolder', async () => { await openRD('rN'); fact('tempFolder', await download('rN', 'editorPdf')); await closeRD(); });
            for (const k of ['rD', 'rR', 'rO', 'rC']) await sect(`exports-${k}`, async () => {
                await openWf(F);
                const o = await openRD(k);
                const s = await snap(`rd-${k}`);
                o.snap = s.label; o.window = s.dialog;
                o.downloads = [];
                for (const e of ['editorXml', 'authorXml', 'editorPdf', 'authorPdf']) o.downloads.push(await download(k, e));
                o.after = (await snap(`rd-${k}-after-downloads`)).label;
                o.windowAfter = await rd().isVisible().catch(() => false);
                await closeRD();
                fact(`exports-${k}`, o);
            });
            await signOut(page).catch(() => {});
            // the sub-editor level
            await sect('exports-se', async () => {
                await as('se');
                const o = {};
                for (const k of ['rD', 'rR']) {
                    await openWf(F);
                    o[k] = {open: await openRD(k), snap: (await snap(`se-rd-${k}`)).label, downloads: []};
                    for (const e of ['editorXml', 'authorXml']) o[k].downloads.push(await download(`se-${k}`, e));
                    await closeRD();
                }
                fact('exports-se', o);
                await signOut(page).catch(() => {});
            });
        });

        // ============================================================ modify (row 2, Rule 14b)
        if (part('modify')) await sect('modify', async () => {
            const M = {};
            for (const [key, k] of [['M1', 'rM1'], ['M2', 'rM2'], ['M3', 'rM3']]) {
                const r = await app.api.createSubmission({
                    tag: `${t}${key.toLowerCase()}`, context: cp, submitter: U.au, title: `I27I modify ${key} ${t}`,
                    decisions: ['sendExternalReview'], participants: [{username: U.se, role: 'sectionEditor'}],
                    reviewRounds: [{reviewers: [{username: U[k], status: 'completed', comments: `I27I ${key} seeded review text.`, ...(ojs ? {recommendation: 'accept'} : {})}]}],
                });
                M[key] = {id: r.submissionId, rounds: r.reviewRounds, k, ra: raOf(r.submissionId, k)};
            }
            const ctxId = sql(app, `select ${ojs ? 'journal_id from journals' : 'press_id from presses'} where path='${cp}'`);
            const recs = () => (ojs ? sql(app, `select r.reviewer_recommendation_id||'='||coalesce(s.setting_value,'?')||'='||r.status from reviewer_recommendations r left join reviewer_recommendation_settings s on s.reviewer_recommendation_id=r.reviewer_recommendation_id and s.setting_name='title' and s.locale='en' where r.context_id=${ctxId} order by 1`).split('\n') : []);
            fact('M', {subs: M, recommendations: recs()});

            // a second browser, the manager's, for the settings tab
            const B = await launch(app);
            const switchOff = async (title) => {
                const {ReviewSettingsPage} = require('../../../pages/ReviewSettingsPages.js');
                const s = new ReviewSettingsPage(B.page, cp);
                await s.goto('Reviewer Recommendations'); await idle(B.page);
                const tb = s.recommendations;
                await tb.tick(tb.row(title)).click();
                await tb.answerConfirm(`Are you sure you want to deactivate the recommendation ${title}`, 'Yes');
                await idle(B.page);
                const sn = await snap(`settings-off-${title.replace(/\W+/g, '')}`, B.page);
                return {snap: sn.label, notices: sn.notices, ticked: await tb.tick(tb.row(title)).isChecked().catch(() => null), recommendations: recs()};
            };
            if (ojs) { await signIn(B.page, U.mg, {contextPath: cp}); await idle(B.page); }

            const mr = () => page.getByRole('dialog', {name: 'Modify Review'}).last();
            const saveBtn = () => mr().getByRole('button', {name: 'Save Changes', exact: true});
            const sel = () => mr().locator('select[name="reviewerRecommendationId"], select[id*="reviewerRecommendationId"]').first();
            async function openModify(key) {
                await openWf(M[key]);
                const o = await openRD(M[key].k);
                o.rdSnap = (await snap(`${key}-rd`)).label;
                await rd().getByRole('button', {name: 'Modify Review', exact: true}).click();
                const conf = page.locator('[data-cy="dialog"]').filter({hasText: 'Modify this review?'}).last();
                await conf.waitFor({timeout: T});
                await conf.getByRole('button', {name: 'Modify Review', exact: true}).click();
                await saveBtn().waitFor({timeout: T}); await idle(page); await sleep(1500);
                const s = await snap(`${key}-modify`);
                o.modifySnap = s.label;
                o.select = await sel().evaluate((x) => ({value: x.value, shown: x.selectedIndex >= 0 ? x.options[x.selectedIndex].text : '(none selected)', options: [...x.options].map((p) => `${p.value}=${p.text}`)})).catch(() => 'absent');
                o.saveEnabled = await saveBtn().isEnabled().catch(() => null);
                return o;
            }
            const typeComment = async (text) => {
                const body = page.frameLocator('iframe[id^="reviewDetailsForm-comments-control"]').locator('body');
                await body.click({timeout: 10000}); await page.keyboard.press('End'); await page.keyboard.type(text);
                await sleep(400);
            };
            async function pressSave(label) {
                take(); dialogs.splice(0);
                const from = slog.mark();
                await saveBtn().click(); await idle(page); await sleep(2500);
                const s = await snap(label);
                return {snap: s.label, notices: s.notices, windowOpen: await mr().isVisible().catch(() => false),
                    fieldErrors: (await mr().locator('.pkpFormField__error, .pkpFieldError').allInnerTexts().catch(() => [])).map((x) => flat(x, 200)).filter(Boolean),
                    summary: flat(await mr().locator('.pkpFormErrors').innerText().catch(() => ''), 300),
                    saveEnabledAfter: await saveBtn().isEnabled().catch(() => null),
                    vueDialogs: (await page.locator('[data-cy="dialog"]').allInnerTexts().catch(() => [])).map((x) => flat(x, 200)),
                    answers: take(), dialogs: dialogs.splice(0), serverLog: slog.since(from).slice(0, 6)};
            }
            async function readAfterReload(key, label) {
                await openWf(M[key]);
                const o = {row: flat(await rowOf(M[key].k).innerText().catch(() => null), 300)};
                await openRD(M[key].k);
                const s = await snap(label);
                o.snap = s.label; o.window = s.dialog ? s.dialog.slice(0, 700) : null;
                await closeRD();
                o.stored = stored(M[key].ra);
                return o;
            }

            if (ojs) {
                // the race, at both levels: the window open, the recommendation switched off elsewhere, then chosen
                for (const [key, who, off, ctl] of [['M1', 'mg', 'See Comments', 'Revisions Required'], ['M2', 'se', 'Resubmit Elsewhere', 'Decline Submission']]) await sect(`race-${key}`, async () => {
                    await as(who);
                    const o = await openModify(key);
                    o.before = stored(M[key].ra);
                    o.switchedOff = await switchOff(off);
                    o.stillListed = await sel().evaluate((x, off) => [...x.options].some((p) => p.text.trim() === off), off).catch(() => null);
                    await sel().selectOption({label: off});
                    o.saveEnabledBeforeSave = await saveBtn().isEnabled().catch(() => null);
                    o.save = await pressSave(`${key}-save-off`);
                    o.save.stored = stored(M[key].ra);
                    // the refused save left "Save Changes" disabled? a field change: a listed choice
                    if (o.save.windowOpen) {
                        if (key === 'M1') {
                            // sweep: the changed choice, then "Cancel"
                            dialogs.splice(0);
                            await sel().selectOption({label: ctl});
                            o.saveEnabledAfterChange = await saveBtn().isEnabled().catch(() => null);
                            await mr().getByRole('button', {name: 'Cancel', exact: true}).click();
                            await sleep(1200);
                            const warn = page.locator('[data-cy="dialog"]').filter({hasText: 'The data on this form has changed'}).last();
                            o.cancel = {warning: (await warn.count()) ? flat(await warn.innerText(), 300) : null, browserDialogs: dialogs.splice(0)};
                            o.cancel.snap = (await snap(`${key}-cancel-after-change`)).label;
                            if (o.cancel.warning) {
                                await warn.getByRole('button', {name: 'No', exact: true}).click().catch(() => {});
                                await sleep(800);
                                o.cancel.afterNo = {windowOpen: await mr().isVisible().catch(() => false), select: await sel().evaluate((x) => x.options[x.selectedIndex]?.text).catch(() => null)};
                            }
                        } else {
                            await sel().selectOption({label: ctl});
                            o.saveEnabledAfterChange = await saveBtn().isEnabled().catch(() => null);
                        }
                        if (await mr().isVisible().catch(() => false)) {
                            o.control = await pressSave(`${key}-save-control`);
                            o.control.stored = stored(M[key].ra);
                            o.control.rdAfter = rd().isVisible ? flat(await rd().innerText().catch(() => ''), 600) : null;
                        }
                    }
                    o.reload = await readAfterReload(key, `${key}-reload`);
                    fact(`race-${key}`, o);
                    await signOut(page).catch(() => {});
                });
                // the review's own recommendation switched off, then "Modify Review" opened
                await sect('own-M3', async () => {
                    const o = {switchedOff: await switchOff('Accept Submission'), before: stored(M.M3.ra)};
                    await as('mg');
                    Object.assign(o, await openModify('M3'));
                    o.rdText = null;
                    await typeComment(' I27I edited.');
                    o.saveEnabledAfterTyping = await saveBtn().isEnabled().catch(() => null);
                    o.save = await pressSave('M3-save-own-inactive');
                    o.save.stored = stored(M.M3.ra);
                    o.reload = await readAfterReload('M3', 'M3-reload');
                    fact('own-M3', o);
                    await signOut(page).catch(() => {});
                });
            } else {
                // a press: the window carries no recommendation; Cancel with typed text; a save (control)
                for (const [key, who] of [['M1', 'mg'], ['M2', 'se']]) await sect(`omp-${key}`, async () => {
                    await as(who);
                    const o = await openModify(key);
                    o.before = stored(M[key].ra);
                    o.recommendationWords = /Recommendation/i.test(flat(await mr().innerText().catch(() => ''), 4000) || '');
                    if (key === 'M1') {
                        dialogs.splice(0);
                        await typeComment(' I27I typed then cancelled.');
                        await mr().getByRole('button', {name: 'Cancel', exact: true}).click();
                        await sleep(1200);
                        const warn = page.locator('[data-cy="dialog"]').filter({hasText: 'The data on this form has changed'}).last();
                        o.cancel = {warning: (await warn.count()) ? flat(await warn.innerText(), 300) : null, browserDialogs: dialogs.splice(0)};
                        if (o.cancel.warning) { await warn.getByRole('button', {name: 'No', exact: true}).click().catch(() => {}); await sleep(800); }
                        o.cancel.windowOpenAfterNo = await mr().isVisible().catch(() => false);
                    } else await typeComment(' I27I edited.');
                    o.control = await pressSave(`${key}-save-control`);
                    o.control.stored = stored(M[key].ra);
                    o.reload = await readAfterReload(key, `${key}-reload`);
                    fact(`omp-${key}`, o);
                    await signOut(page).catch(() => {});
                });
            }
            await B.close().catch(() => {});
        });

        // ============================================================ legacy (row 2, note a)
        if (part('legacy')) await sect('legacy', async () => {
            const r = await app.api.createSubmission({
                tag: `${t}l`, context: cp, submitter: U.au, title: `I27I legacy ${t}`,
                decisions: ['sendExternalReview'], participants: [{username: U.se, role: 'sectionEditor'}],
                reviewRounds: [{reviewers: [{username: U.rL, status: 'completed', comments: 'I27I legacy seeded review text.', ...(ojs ? {recommendation: 'decline'} : {})}]}],
            });
            const L = {id: r.submissionId, rounds: r.reviewRounds, ra: raOf(r.submissionId, 'rL')};
            await as('mg');
            await openWf(L);
            const o = {before: stored(L.ra), snapBefore: (await snap('L-workflow')).label, sends: []};
            const token = await page.evaluate(() => window.pkp?.currentUser?.csrfToken || null);
            const round = (L.rounds || [])[0] || {};
            const url = app.url(`/index.php/${cp}/$$$call$$$/grid/users/reviewer/reviewer-grid/review-read?submissionId=${L.id}&reviewAssignmentId=${L.ra}&stageId=${round.stageId || 3}&reviewRoundId=${round.id}`);
            const logRows = () => sql(app, `select count(*) from event_log where assoc_id=${L.id} and assoc_type=1048585`);
            const newRows = (after) => sql(app, `select log_id||'|'||event_type||'|'||message from event_log where assoc_id=${L.id} and assoc_type=1048585 and log_id>${after} order by log_id`).split('\n').filter(Boolean);
            const lastLog = Number(sql(app, `select coalesce(max(log_id),0) from event_log`));
            o.eventRowsBefore = logRows();
            for (const [name, code] of [['unknown', '99999'], ['nonNumeric', 'abc']]) {
                const from = slog.mark();
                const resp = await page.request.post(url, {form: {csrfToken: token, reviewerRecommendationId: code}, failOnStatusCode: false});
                o.sends.push({name, code, status: resp.status(), body: flat(await resp.text().catch(() => ''), 300), serverLog: slog.since(from).map((l) => flat(l, 400)).slice(0, 4),
                    stored: stored(L.ra), eventRows: logRows(), newEventRows: newRows(lastLog)});
            }
            await openWf(L);
            o.row = flat(await rowOf('rL').innerText().catch(() => null), 300);
            o.rowSnap = (await snap('L-row-after')).label;
            o.rd = await openRD('rL').catch((e) => ({error: flat(e.message, 120)}));
            const s = await snap('L-rd-after');
            o.rdSnap = s.label; o.rdText = s.dialog ? s.dialog.slice(0, 600) : null;
            await closeRD();
            fact('legacy', o);
            await signOut(page).catch(() => {});
        });
    } finally {
        record('facts', facts, {merge: true});
        if (pdfBrowser) await pdfBrowser.close().catch(() => {});
    }
});
