// U36 claim check, chunk I27B (housekeeping 2026-11-27): the incidental row
// U36 2026-11-23 of docs/tracking/incidentals.md, "the reviewer's step 3
// 'Upload File' window, 'Change File' after a pick: the window's own removal of
// the first pick is refused 'not authorized' (a PHP warning in the server log),
// and the first file stays beside the new one". Spec:
// docs/specs/U36-submission-files.md, Rule 5 (the reviewer's "Upload File"
// bullet), Rule 5a, register A14 (its reach and footnote f-a14).
// The row's own kept script, shared/playwright/checks/U28/I28/i28-revise.js
// (its section D), was run beside this one as PROBE_RUN=k1; this script
// needs no other script; PART=ctl (below) is its second part.
//
// Per app (OJS, OMP) and per run, on a scratch context of its own (a manager,
// a section editor as stage participant, an author, one external reviewer),
// one submission in External Review with the reviewer accepted. As the
// reviewer, on the review's step 3 "Reviewer Files":
//   A  "Upload File": step 1 as it opens (upload box, component and revise
//      lists); a first file picked; the upload box's "Change File" pressed
//      (the browser's file chooser) and a second file picked; the requests it
//      sends and their answers; the server log; "Continue", "Continue",
//      "Complete"; the list on the page and after a reload; the stored rows
//   B  the same swap, then the window's "Cancel" link: list, reload, stored
//   C  the same swap, then the window's header "Close" at step 1 (the leave
//      question accepted): list, reload, stored
//   D  the row's "Delete" on A's first file (the way round): list, reload
//   E  "Submit Review" (OJS: a recommendation chosen)
// As the section editor: F the round's "Read Review" window for the reviewer,
// its files; G the review round's file lists (what the editor's page shows of
// the reviewer's files).
// OPS: a read-only control (no reviewer role): the reviewer wizard's address
// typed as the seeded author.
//
// PART=ctl runs, on a fresh scratch context of its own, the controls instead:
//   H  the reviewer: one pick and the header "Close" at step 1 (no swap);
//      one pick and "Cancel"
//   I  the manager on "Submission Files" (a component chosen): a swap and
//      "Cancel"; a swap and the header "Close" at step 1; one pick and the
//      header "Close" at step 1 (the step-1 question Rule 6 names); I4 a
//      file chosen to revise instead of a component, then "Cancel"
// PART=lvl: one account per further permission level, a swap and "Complete"
//   on its own list: L1 the assigned Section Editor (OMP: Series Editor) and
//   L2 the assigned Funding coordinator on "Submission Files"; L3 the author
//   on "Revisions Uploaded" (a second submission, revisions requested)
//
// Run (both apps, two runs, each seeding afresh; then PART=ctl and PART=lvl likewise):
//   PROBE_RUN=r1 PROBE_NOTES_FEATURE=U36 PROBE_FEATURE=U36 PROBE_AGENT=ccI27B \
//     bin/app-lock.sh shared ojs,omp,ops -- node bin/probe.js all shared/playwright/checks/U36/I27B/i27b.js
//   PROBE_RUN=r2 … likewise; PART=ctl PROBE_RUN=r1 / r2 … (ONLY=ojs,omp).
// Outputs: .reports/U36/ccI27B/; outFile('facts.json') (with a PART:
// outFile('facts-<PART>.json')) and the console carry what the report cites.
// No assertions.
const fs = require('fs');
const os = require('os');
const path = require('path');
const {forEachApp, launch, signIn, signOut, screen, shot, record, loc, idle, tag, sql, serverLog, outFile} =
    require('../../../probe');

const REPO = path.resolve(__dirname, '../../../../..');
const SRC = path.join(REPO, 'apps/ojs/playwright/fixtures/files/article.pdf');
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'u36i27b-'));
const RUN = process.env.PROBE_RUN || 'r0';
const PART = process.env.PART || '';
const FILES = Object.fromEntries(['a1', 'a2', 'b1', 'b2', 'c1', 'c2', 'h1', 'h2', 'i1', 'i2', 'j1', 'j2', 'k1'].map((k) => {
    const name = `u36i27b-${RUN}-${k}.pdf`;
    const p = path.join(DIR, name); fs.copyFileSync(SRC, p); return [k, {path: p, name}];
}));
const T = 30000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (s, n = 800) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));

forEachApp(async (app) => {
    const facts = {app: app.name, run: RUN, steps: {}};
    const log = (...a) => console.log(`[${RUN} ${app.name}]`, ...a);
    const put = (k, v) => { facts.steps[k] = v; log(k, JSON.stringify(v).slice(0, 1500)); fs.writeFileSync(outFile(PART ? `facts-${PART}.json` : 'facts.json'), JSON.stringify(facts, null, 2)); };
    const sect = async (name, fn) => { try { await fn(); } catch (e) { put(`${name} FAILED`, String(e).split('\n')[0]); } };
    const slog = serverLog(app);

    if (app.name === 'ops') {
        const {page, close} = await launch(app);
        try {
            await signIn(page, 'author.alex');
            const r = await page.goto(app.url(`/index.php/${app.contextPath}/reviewer/submission/1?step=3`)); await idle(page);
            const s = await screen(page); record('ops-reviewer-wizard-typed', s); await shot(page, 'ops-reviewer-wizard-typed');
            put('ops control', {status: r && r.status(), url: page.url(), title: s.title, text: flat(s.text.main || JSON.stringify(s.text), 300),
                uploadLinks: await page.getByRole('link', {name: 'Upload File'}).count()});
            await signOut(page);
        } finally { await close(); }
        return;
    }

    // ------------------------------------------------------------ seed
    const t = tag('u36i27b');
    const U = {mgr: `${t}mgr`, ed: `${t}ed`, auth: `${t}auth`, rev: `${t}rev`, fund: `${t}fund`};
    const ctx = await app.api.createContext({
        tag: t,
        context: {name: `I27B ${t}`, contactName: 'I27B Contact', contactEmail: `${t}contact@mail.test`},
        users: [
            {username: U.mgr, roles: ['manager'], givenName: 'Mira', familyName: 'Manager'},
            {username: U.ed, roles: ['sectionEditor'], givenName: 'Edna', familyName: 'Editor'},
            {username: U.auth, roles: ['author'], givenName: 'Arno', familyName: 'Author'},
            {username: U.rev, roles: ['externalReviewer'], givenName: 'Rhea', familyName: 'Reviewer'},
            {username: U.fund, roles: ['funding'], givenName: 'Fran', familyName: 'Funding'},
        ],
    });
    const cp = ctx.path;
    const sub = await app.api.createSubmission({
        tag: `${t}a`, context: cp, submitter: U.auth, submitted: true, title: `U36 I27B ${t}`,
        decisions: ['sendExternalReview'],
        reviewRounds: [{reviewers: [{username: U.rev, status: 'accepted'}]}],
        participants: [{username: U.ed, role: 'sectionEditor'}, ...(PART === 'lvl' ? [{username: U.fund, role: 'funding'}] : [])],
    });
    const sid = sub.submissionId;
    // PART=lvl: a second submission whose author has been asked for revisions
    const subR = PART === 'lvl' ? await app.api.createSubmission({
        tag: `${t}r`, context: cp, submitter: U.auth, submitted: true, title: `U36 I27B revisions ${t}`,
        decisions: ['sendExternalReview', 'requestRevisions'], participants: [{username: U.ed, role: 'sectionEditor'}],
    }) : null;
    if (subR) put('seed revisions', {submissionId: subR.submissionId, rounds: subR.reviewRounds});
    put('seed', {tag: t, contextPath: cp, contextId: ctx.contextId, submissionId: sid, assignments: sub.reviewAssignments});
    const wizURL = (step) => app.url(`/index.php/${cp}/reviewer/submission/${sid}${step ? `?step=${step}` : ''}`);
    const stored = () => {
        const out = sql(app, `select sf.submission_file_id, sf.file_stage, coalesce(sf.genre_id::text,'-'), coalesce(sf.assoc_type::text,''), coalesce(sf.assoc_id::text,''), sf.file_id,
            (select string_agg(setting_value, '/') from submission_file_settings s where s.submission_file_id = sf.submission_file_id and s.setting_name = 'name')
            from submission_files sf where sf.submission_id = ${Number(sid)} order by 1`);
        return out ? out.split('\n') : [];
    };

    // ------------------------------------------------------------ helpers
    const grid = (page) => page.locator('[id^="component-grid-files-attachment-reviewerreviewattachmentsgrid"]').first();
    const wizard = (page) => page.getByRole('dialog').filter({has: page.locator('div[id^="fileUploadWizard"]')}).last();
    const panel = (page) => wizard(page).locator('[role=tabpanel]:visible').first();
    const upBox = (page) => wizard(page).locator('.pkp_controller_fileUpload').first();
    const net = [];
    const watch = (page) => {
        page.on('response', async (r) => {
            const u = r.url();
            if (!/file-upload-wizard|manage-file|delete-file|cancel-file-upload|reviewer-review-attachments|reviewerreviewattachments/i.test(u)) return;
            let body = null; try { body = flat(await r.text(), 300); } catch (e) {}
            const q = r.request();
            net.push({at: new Date().toISOString(), m: q.method(), op: u.replace(/^.*\$\$\$call\$\$\$\//, '').replace(/\?.*/, ''), query: (u.split('?')[1] || '').slice(0, 220),
                post: q.method() === 'POST' && !/upload-file/.test(u) ? flat(decodeURIComponent(q.postData() || '').replace(/csrfToken=[^&]*/, 'csrfToken=…'), 300) : undefined,
                status: r.status(), body: /upload-file|delete-file|cancel-file-upload/.test(u) ? body : undefined});
        });
    };
    const take = () => net.splice(0, net.length);
    const snap = async (page, name) => { const s = await screen(page); record(name, s); await shot(page, name); return s; };
    const listState = async (page) => {
        const g = grid(page);
        await g.waitFor({timeout: T}).catch(() => {});
        await page.waitForFunction(() => { const e = document.querySelector('[id^="component-grid-files-attachment-reviewerreviewattachmentsgrid"]'); return e && !/Loading/.test(e.innerText); }, null, {timeout: T}).catch(() => {});
        const rows = await g.locator('tbody tr.gridRow').evaluateAll((els) => els.map((e) => e.innerText.replace(/\s+/g, ' ').trim()));
        return {rows, header: flat(await g.locator('thead').innerText().catch(() => null), 120)};
    };
    const toStep3 = async (page) => {
        await page.goto(wizURL()); await idle(page);
        const sc = page.getByRole('button', {name: 'Save and continue'});
        if (await sc.count() && await sc.isEnabled()) { await sc.click(); await page.getByRole('button', {name: 'Continue to Step #3'}).waitFor({timeout: T}); await idle(page); }
        const c3 = page.getByRole('button', {name: 'Continue to Step #3'});
        if (await c3.count() && await c3.isEnabled()) { await c3.click(); await idle(page); }
        await page.waitForFunction(() => { const s = document.querySelector('[role=tab][aria-selected=true]'); return s && s.textContent.trim().startsWith('3.') && !s.classList.contains('ui-tabs-loading'); }, null, {timeout: T}).catch(() => {});
        await idle(page);
        await grid(page).waitFor({timeout: T}).catch(() => {});
        await idle(page);
    };
    const stepOne = async (page) => {
        const w = wizard(page);
        const p = panel(page);
        return {
            tabs: await w.getByRole('tab').allInnerTexts().catch(() => []),
            genreSelect: await w.locator('select[id^="genreId"]').count(),
            reviseSelect: await w.locator('select[id^="revisedFileId"]').count(),
            boxVisible: await upBox(page).isVisible().catch(() => null),
            box: flat(await upBox(page).innerText().catch(() => null), 200),
            changeFile: await upBox(page).getByRole('button', {name: 'Change File', exact: true}).isVisible().catch(() => false),
            continueEnabled: await w.getByRole('button', {name: 'Continue', exact: true}).isEnabled().catch(() => null),
            text: flat(await p.innerText().catch(() => null), 500),
        };
    };
    const openUpload = async (page) => {
        await page.getByRole('link', {name: 'Upload File'}).click();
        await wizard(page).waitFor({timeout: T});
        await upBox(page).waitFor({timeout: T}).catch(() => {});
        await idle(page);
    };
    const uploaded = (page) => page.waitForResponse((r) => /upload-file/.test(r.url()) && r.request().method() === 'POST', {timeout: 60000}).catch(() => null);
    const settle = async (page, file) => { await upBox(page).getByText(file.name).first().waitFor({timeout: 10000}).catch(() => {}); await sleep(800); await idle(page); };
    const pickFirst = async (page, file) => {
        const answered = uploaded(page);
        await wizard(page).locator('input[type="file"]').first().setInputFiles(file.path);
        const r = await answered; await settle(page, file);
        return {status: r && r.status()};
    };
    // "Change File" pressed: the browser's file chooser, then the second file
    const changeFile = async (page, file) => {
        const chg = upBox(page).getByRole('button', {name: 'Change File', exact: true});
        const chooserP = page.waitForEvent('filechooser', {timeout: 10000}).catch(() => null);
        const answered = uploaded(page);
        const deleted = page.waitForResponse((r) => /delete-file/.test(r.url()), {timeout: 15000}).catch(() => null);
        await chg.click();
        const chooser = await chooserP;
        let via = 'filechooser';
        if (chooser) await chooser.setFiles(file.path);
        else { via = 'input (no chooser opened)'; await wizard(page).locator('input[type="file"]').first().setInputFiles(file.path); }
        const [r, d] = await Promise.all([answered, deleted]);
        await settle(page, file);
        let delBody = null; if (d) { try { delBody = flat(await d.text(), 300); } catch (e) {} }
        return {via, upload: r && r.status(), deleteFile: d ? {status: d.status(), url: d.url().replace(/^.*\$\$\$call\$\$\$\//, ''), body: delBody} : null};
    };
    const finish = async (page) => {
        for (const next of ['2. Review Details', '3. Confirm']) {
            const w = wizard(page);
            await w.getByRole('button', {name: 'Continue', exact: true}).click();
            await w.getByRole('tab', {name: next, exact: true}).and(page.locator('[aria-selected="true"]')).waitFor({timeout: T});
            await idle(page);
        }
        const w = wizard(page);
        await w.getByRole('button', {name: 'Complete', exact: true}).click();
        await w.waitFor({state: 'hidden', timeout: T}).catch(() => {});
        await idle(page); await sleep(800); await idle(page);
        return {closed: !(await w.isVisible().catch(() => false))};
    };
    const leave = async (page, how) => {
        const dialogs = [];
        const h = async (d) => { dialogs.push(`${d.type()}: ${d.message()}`); await d.accept().catch(() => {}); };
        page.on('dialog', h);
        const w = wizard(page);
        const cancelled = page.waitForResponse((r) => /cancel-file-upload/.test(r.url()), {timeout: 10000}).catch(() => null);
        if (how === 'Cancel') await w.getByRole('link', {name: 'Cancel', exact: true}).first().click();
        else await w.getByRole('button', {name: /^Close/}).first().click();
        const c = how === 'Cancel' ? await cancelled : null;
        await w.waitFor({state: 'hidden', timeout: T}).catch(() => {});
        await sleep(1500);
        page.off('dialog', h);
        await idle(page);
        let body = null; if (c) { try { body = flat(await c.text(), 300); } catch (e) {} }
        return {how, browserDialogs: dialogs, cancelFileUpload: c ? {status: c.status(), body} : null, stillOpen: await w.isVisible().catch(() => false)};
    };
    const reloadList = async (page, name) => {
        await page.reload(); await idle(page);
        await page.waitForFunction(() => { const s = document.querySelector('[role=tab][aria-selected=true]'); return s && !s.classList.contains('ui-tabs-loading'); }, null, {timeout: T}).catch(() => {});
        await grid(page).waitFor({timeout: T}).catch(() => {}); await idle(page);
        const s = await snap(page, name);
        return {list: await listState(page), notices: s.notices};
    };
    // a swap: first pick, "Change File", second pick
    const swap = async (page, label, f1, f2) => {
        await openUpload(page);
        await snap(page, `${label}1-step1-open`);
        put(`${label}1 step1 as opened`, await stepOne(page));
        put(`${label}2 first pick`, await pickFirst(page, f1));
        await snap(page, `${label}2-after-first-pick`);
        put(`${label}2 step1 after first pick`, await stepOne(page));
        put(`${label}3 Change File + second pick`, await changeFile(page, f2));
        const s = await snap(page, `${label}3-after-change-file`);
        put(`${label}3 step1 after Change File`, {...(await stepOne(page)), notices: s.notices});
    };

    // the workflow's Vue file lists (PART=ctl and PART=lvl)
    const wf = () => page.getByRole('dialog').filter({has: page.locator('[data-cy="sidemodal-header"]')}).first();
    const listRows = async (W) => {
        const tb = wf().getByRole('table', {name: W.list, exact: true}).first();
        await idle(page);
        return tb.evaluate((el) => [...el.querySelectorAll('tbody tr')].map((tr) => tr.innerText.replace(/\s+/g, ' ').trim())).catch((e) => String(e).slice(0, 100));
    };
    const openWf = async (W, name) => {
        await page.goto(app.url(`/index.php/${cp}/dashboard/${W.author ? 'mySubmissions' : 'editorial'}?workflowSubmissionId=${W.id}&workflowMenuKey=${W.key}`));
        await wf().locator('[data-cy="sidemodal-header"]').waitFor({timeout: T}).catch(() => {});
        await page.waitForFunction(() => !/Loading|Refreshing data/.test((document.querySelector('[data-cy="sidemodal-header"]') || {}).innerText || ''), null, {timeout: 15000}).catch(() => {});
        await idle(page);
        await wf().getByRole('table', {name: W.list, exact: true}).first().waitFor({timeout: T}).catch(() => {});
        await idle(page);
        await snap(page, name);
        return listRows(W);
    };
    const boxState = () => wizard(page).evaluate((d) => {
        const up = d.querySelector('.pkp_controller_fileUpload');
        const c = [...d.querySelectorAll('button')].find((b) => b.innerText.trim() === 'Continue');
        return {box: up ? {screenReaderOnly: up.classList.contains('pkp_screen_reader') || !!up.closest('.pkp_screen_reader'), text: up.innerText.replace(/\s+/g, ' ').trim()} : null,
            continueDisabled: c ? c.disabled : null};
    });
    // "Upload" above the list; step 1 read as it opens, then the first component chosen
    const openListUpload = async (W, name) => {
        const box = wf().locator('div').filter({has: page.getByRole('table', {name: W.list, exact: true})}).last();
        const btn = box.getByRole('button', {name: 'Upload', exact: true});
        await loc(page, `"${W.list}" › "Upload"`, btn);
        await btn.click();
        await wizard(page).locator('input[type="file"]').waitFor({state: 'attached', timeout: T});
        await idle(page);
        await snap(page, `${name}-open`);
        const before = await boxState();
        const g = wizard(page).locator('select[id^="genreId"]');
        const opts = await g.locator('option').allInnerTexts();
        await g.selectOption({index: 1}); await idle(page);
        const after = await boxState();
        await snap(page, `${name}-component-chosen`);
        return {before, component: opts[1], after};
    };

    const {page, close} = await launch(app);
    watch(page);
    if (PART === 'ctl') {
        try {
            await signIn(page, U.rev);
            await sect('H', async () => {
                await toStep3(page);
                await snap(page, 'H0-step3');
                const from = slog.mark();
                await openUpload(page);
                put('H1 one pick', await pickFirst(page, FILES.h1));
                await snap(page, 'H1-after-pick');
                put('H1 header Close at step 1', await leave(page, 'Close'));
                const s = await snap(page, 'H2-list-same-page');
                put('H2 list same page', {list: await listState(page), notices: s.notices});
                put('H2 list after reload', {...(await reloadList(page, 'H2-list-reload')), stored: stored()});
                await openUpload(page);
                put('H3 one pick', await pickFirst(page, FILES.h2));
                put('H3 Cancel', await leave(page, 'Cancel'));
                const s3 = await snap(page, 'H3-list-same-page');
                put('H3 list same page', {list: await listState(page), notices: s3.notices});
                put('H3 list after reload', {...(await reloadList(page, 'H3-list-reload')), stored: stored(), serverLog: slog.since(from)});
                put('H net', take());
            });
            await signOut(page);
            await signIn(page, U.mgr);
            await sect('I', async () => {
                const cases = [['I1', 'swap', 'Cancel', FILES.i1, FILES.i2], ['I2', 'swap', 'Close', FILES.j1, FILES.j2], ['I3', 'one', 'Close', FILES.k1, null]];
                const W = {id: sid, key: 'workflow_1', list: 'Submission Files'};
                put('I0 Submission Files before', await openWf(W, 'I0-submission-files'));
                for (const [k, kind, how, f1, f2] of cases) {
                    const from = slog.mark();
                    put(`${k} step1 before and after the component`, await openListUpload(W, `${k}-step1`));
                    put(`${k} first pick`, await pickFirst(page, f1));
                    if (kind === 'swap') put(`${k} Change File + second pick`, await changeFile(page, f2));
                    await snap(page, `${k}-before-leaving`);
                    put(`${k} ${how}`, await leave(page, how));
                    await sleep(1000);
                    const s = await snap(page, `${k}-list-same-page`);
                    put(`${k} list same page`, {rows: await listRows(W), notices: s.notices});
                    put(`${k} list after reload`, {rows: await openWf(W, `${k}-list-reload`), stored: stored(), serverLog: slog.since(from)});
                    put(`${k} net`, take());
                }
                // I4: a file chosen to revise instead of a component; then "Cancel" with nothing uploaded
                {
                    const box = wf().locator('div').filter({has: page.getByRole('table', {name: W.list, exact: true})}).last();
                    await box.getByRole('button', {name: 'Upload', exact: true}).click();
                    await wizard(page).locator('input[type="file"]').waitFor({state: 'attached', timeout: T});
                    await idle(page);
                    const before = await boxState();
                    const rv = wizard(page).locator('select[id^="revisedFileId"]');
                    const opts = await rv.locator('option').allInnerTexts();
                    await rv.selectOption({index: 1}); await idle(page);
                    const g = wizard(page).locator('select[id^="genreId"]');
                    await snap(page, 'I4-revise-chosen');
                    put('I4 revise chosen', {before, reviseOptions: opts, after: await boxState(), genreDisabled: await g.isDisabled(), genreValue: await g.evaluate((e) => e.options[e.selectedIndex].text)});
                    put('I4 Cancel with nothing uploaded', await leave(page, 'Cancel'));
                    put('I4 list', await listRows(W));
                }
            });
            await signOut(page);
        } finally {
            put('rest net', take());
            await close();
        }
        return;
    }
    if (PART === 'lvl') {
        // one account per permission level, each on a list it uploads to: a swap, then "Complete"
        const r0 = subR && (subR.reviewRounds || [])[0];
        const levels = [
            ['L1', U.ed, 'sub-editor (assigned Section Editor / Series Editor)', {id: sid, key: 'workflow_1', list: 'Submission Files'}],
            ['L2', U.fund, 'assistant (assigned Funding coordinator)', {id: sid, key: 'workflow_1', list: 'Submission Files'}],
            ['L3', U.auth, 'author (revisions requested)', {id: subR && subR.submissionId, key: r0 ? `workflow_${r0.stageId}_${r0.id}` : 'workflow_3', list: 'Revisions Uploaded', author: true}],
        ];
        const lf = (k, n) => { const name = `u36i27b-${RUN}-${k.toLowerCase()}${n}.pdf`; const q = path.join(DIR, name); fs.copyFileSync(SRC, q); return {path: q, name}; };
        try {
            for (const [k, user, level, W] of levels) {
                await sect(k, async () => {
                    await signIn(page, user);
                    const from = slog.mark();
                    put(`${k} ${level}: list before`, await openWf(W, `${k}-list-before`));
                    put(`${k} step1`, await openListUpload(W, `${k}-step1`));
                    const f1 = lf(k, 'a'), f2 = lf(k, 'b');
                    put(`${k} first pick`, await pickFirst(page, f1));
                    put(`${k} Change File + second pick`, await changeFile(page, f2));
                    const s = await snap(page, `${k}-after-change-file`);
                    put(`${k} after Change File`, {box: await boxState(), notices: s.notices});
                    put(`${k} finish`, await finish(page));
                    await sleep(800);
                    const s2 = await snap(page, `${k}-list-same-page`);
                    put(`${k} list same page`, {rows: await listRows(W), notices: s2.notices});
                    put(`${k} list after reload`, {rows: await openWf(W, `${k}-list-reload`), serverLog: slog.since(from)});
                    put(`${k} net`, take());
                    await signOut(page);
                });
            }
        } finally {
            put('rest net', take());
            await close();
        }
        return;
    }
    try {
        await signIn(page, U.rev);

        await sect('A', async () => {
            await toStep3(page);
            await snap(page, 'A0-step3');
            put('A0 step3 list', await listState(page));
            await loc(page, 'reviewer step 3 › Reviewer Files › Upload File', page.getByRole('link', {name: 'Upload File'}));
            const from = slog.mark();
            await swap(page, 'A', FILES.a1, FILES.a2);
            await loc(page, 'upload wizard step 1 › upload box › Change File', upBox(page).getByRole('button', {name: 'Change File', exact: true}));
            put('A4 finish', await finish(page));
            const s = await snap(page, 'A5-list-same-page');
            put('A5 list same page', {list: await listState(page), notices: s.notices});
            put('A5 net', take());
            put('A6 list after reload', {...(await reloadList(page, 'A6-list-reload')), stored: stored(), serverLog: slog.since(from)});
        });

        await sect('B', async () => {
            const from = slog.mark();
            await swap(page, 'B', FILES.b1, FILES.b2);
            put('B4 Cancel', await leave(page, 'Cancel'));
            const s = await snap(page, 'B5-list-same-page');
            put('B5 list same page', {list: await listState(page), notices: s.notices});
            put('B5 net', take());
            put('B6 list after reload', {...(await reloadList(page, 'B6-list-reload')), stored: stored(), serverLog: slog.since(from)});
        });

        await sect('C', async () => {
            const from = slog.mark();
            await swap(page, 'C', FILES.c1, FILES.c2);
            put('C4 header Close', await leave(page, 'Close'));
            const s = await snap(page, 'C5-list-same-page');
            put('C5 list same page', {list: await listState(page), notices: s.notices});
            put('C5 net', take());
            put('C6 list after reload', {...(await reloadList(page, 'C6-list-reload')), stored: stored(), serverLog: slog.since(from)});
        });

        await sect('D', async () => {
            const from = slog.mark();
            const row = grid(page).locator('tbody tr.gridRow').filter({hasText: FILES.a1.name}).first();
            if (!(await row.count())) { put('D', 'no row for the first pick'); return; }
            const more = row.locator('a.show_extras');
            if (await more.count()) { await more.first().click(); await idle(page); }
            const ctl = row.locator('xpath=following-sibling::tr[1]');
            const actions = await ctl.locator('a').evaluateAll((els) => els.filter((e) => e.offsetParent !== null).map((e) => e.innerText.trim()));
            await snap(page, 'D1-row-expanded');
            put('D1 row actions', actions);
            if (!actions.includes('Delete')) return;
            await ctl.getByRole('link', {name: 'Delete', exact: true}).click();
            await sleep(1000);
            const conf = page.locator('[role=dialog]:visible').last();
            const s = await snap(page, 'D2-delete-confirm');
            const ctext = flat(s.text.dialog, 300);
            const ok = conf.getByRole('button', {name: /^(OK|Yes|Delete)$/});
            if (await ok.count()) await ok.first().click();
            await sleep(1500); await idle(page);
            const s3 = await snap(page, 'D3-after-delete');
            put('D2 delete', {confirm: ctext, list: await listState(page), notices: [...(s.notices || []), ...(s3.notices || [])]});
            put('D net', take());
            put('D4 list after reload', {...(await reloadList(page, 'D4-list-reload')), stored: stored(), serverLog: slog.since(from)});
        });

        await sect('E', async () => {
            await toStep3(page);
            const rec = page.locator('select#reviewerRecommendationId');
            if (await rec.count()) await rec.selectOption({label: 'Accept Submission'});
            await page.getByRole('button', {name: 'Submit Review'}).click();
            const confirm = page.getByRole('dialog', {name: 'Confirm'});
            await confirm.waitFor({timeout: 10000});
            await confirm.getByRole('button', {name: 'OK', exact: true}).click();
            await page.waitForFunction(() => document.querySelector('[role=tab][aria-selected=true]')?.textContent.includes('4.'), null, {timeout: T}).catch(() => {});
            await idle(page);
            await snap(page, 'E1-step4');
            put('E1 submitted', {url: page.url(), stored: stored()});
        });
        await signOut(page);

        await sect('F', async () => {
            await signIn(page, U.ed);
            await page.goto(app.url(`/index.php/${cp}/dashboard/editorial?workflowSubmissionId=${sid}`)); await idle(page);
            await page.getByRole('link', {name: /Review Round 1|Round 1/}).first().click().catch(() => {}); await idle(page);
            await snap(page, 'G1-editor-review-round');
            const s = await screen(page);
            put('G1 editor round page', {files: [...new Set((s.text.main || JSON.stringify(s.text)).match(/u36i27b-[\w-]+\.pdf/g) || [])],
                reviewerFiles: flat(((s.text.dialog || s.text.main || '').match(/Reviewer Files[\s\S]{0,400}/) || [''])[0], 400)});
            const row = page.getByRole('table', {name: 'Reviewers', exact: true}).getByRole('row').filter({hasText: 'Rhea'}).first();
            await row.waitFor({timeout: T});
            await row.getByRole('button', {name: /Read Review/}).click();
            const dlg = page.getByRole('dialog').last();
            await dlg.waitFor({timeout: T});
            await page.waitForFunction(() => { const d = [...document.querySelectorAll('[role=dialog]')].pop(); return d && /u36i27b-/.test(d.innerText); }, null, {timeout: 15000}).catch(() => {});
            await idle(page);
            const s2 = await snap(page, 'F1-editor-read-review');
            put('F1 editor Read Review', {files: [...new Set((s2.text.dialog || '').match(/u36i27b-[\w-]+\.pdf/g) || [])],
                reviewerFilesBlock: flat(((s2.text.dialog || '').match(/Reviewer Files[\s\S]{0,400}/) || [''])[0], 400)});
            await signOut(page);
        });
    } finally {
        put('rest net', take());
        await close();
        fs.writeFileSync(outFile(PART ? `facts-${PART}.json` : 'facts.json'), JSON.stringify(facts, null, 2));
    }
});
