// U28 claim check, chunk I28 (housekeeping 2026-11-23): the incidental row
// U28 2026-11-20 of docs/tracking/incidentals.md, "uploading a new version of
// the reviewer's own attachment answers 500 'Invalid parameters!'; a first
// upload works". Spec: docs/specs/U28-reviewers-review.md, Actors row "Upload
// reviewer files", Fields step 3 "Reviewer Files", Rule 12 (the "Upload"
// section), Rule 13 (the submitted wizard's "Reviewer Files"), Side effects
// "Uploading a reviewer file". (The older i28.js beside this file is the
// 2026-09-28 I28 chunk, a different row set.)
//
// Per app (OJS, OMP) and per run, on a scratch context of its own (a manager,
// a section editor as stage participant, an author, one external reviewer
// "Rhea Reviewer"), one submission in External Review with Rhea accepted:
//   A  step 3 empty; "Upload File" #1 (first file, the end "a first upload");
//      the list on the page and after a reload
//   B  "Upload File" #2 with one file listed: step 1's revision select when
//      offered (the end "a revision"; main offers none), a second file picked;
//      "3. Confirm" › "Add Another File" and that window's "Cancel"; the list
//      on the page and after a reload
//   C  the row's "Edit": what the window offers; a name change saved; reload
//   D  "Upload File" #3: a file picked, "Change File", another picked, then
//      completed; the list and the stored rows
//   E  "Upload File" #4: a file picked and the window closed unsaved (the
//      leave question; what the list holds after)
//   F  the row's "Delete" on D's file; reload
//   G  "Submit Review" (OJS: a recommendation chosen); step 3 after: the
//      list's controls, the row's "Edit" pressed and saved; reload
//   H  the section editor's "Read Review" window: its "Reviewer Files"
// OPS: a read-only control (no reviewer role): the wizard's address typed as
// the seeded author.
//
// Run (one app per call, under the slot's shared app lock):
//   PROBE_RUN=r1 PROBE_FEATURE=U28 PROBE_AGENT=ccI28 \
//     bin/app-lock.sh shared ojs -- node bin/probe.js ojs shared/playwright/checks/U28/I28/i28-revise.js
//   … omp, ops likewise; PROBE_RUN=r2 a second run (each run seeds afresh).
// No other script or PART is needed. Outputs: .reports/U28/ccI28/, the facts
// file outFile('facts.json') and the console log carry what the report cites.
// No assertions.
const fs = require('fs');
const os = require('os');
const path = require('path');
const {forEachApp, launch, signIn, signOut, screen, shot, record, loc, note, idle, tag, sql, serverLog, outFile} =
    require('../../../probe');

const REPO = path.resolve(__dirname, '../../../../..');
const SRC = path.join(REPO, 'apps/ojs/playwright/fixtures/files/article.pdf');
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'u28i-'));
const FILES = Object.fromEntries(['first', 'second', 'third', 'fourth', 'fifth'].map((k) => {
    const p = path.join(DIR, `u28i-${k}.pdf`); fs.copyFileSync(SRC, p); return [k, {path: p, name: `u28i-${k}.pdf`}];
}));
const T = 30000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (s, n = 800) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));
const RUN = process.env.PROBE_RUN || 'r0';

forEachApp(async (app) => {
    const facts = {app: app.name, run: RUN, steps: {}};
    const log = (...a) => console.log(`[${RUN} ${app.name}]`, ...a);
    const put = (k, v) => { facts.steps[k] = v; log(k, JSON.stringify(v).slice(0, 1500)); fs.writeFileSync(outFile('facts.json'), JSON.stringify(facts, null, 2)); };
    const sect = async (name, fn) => { try { await fn(); } catch (e) { put(`${name} FAILED`, String(e).split('\n')[0]); } };
    const slog = serverLog(app);

    if (app.name === 'ops') {
        const {page, close} = await launch(app);
        try {
            await signIn(page, 'author.alex');
            const r = await page.goto(app.url(`/index.php/${app.contextPath}/reviewer/submission/1?step=3`)); await idle(page);
            const s = await screen(page); record('ops-wizard-typed', s); await shot(page, 'ops-wizard-typed');
            put('ops control', {status: r && r.status(), title: s.title, text: flat(s.text.main || JSON.stringify(s.text), 300), uploadLinks: await page.getByRole('link', {name: 'Upload File'}).count()});
            await signOut(page);
        } finally { await close(); }
        return;
    }

    // ------------------------------------------------------------ seed
    const t = tag('u28i');
    const U = {mgr: `${t}mgr`, ed: `${t}ed`, auth: `${t}auth`, rev: `${t}rev`};
    const ctx = await app.api.createContext({
        tag: t,
        context: {name: `I28 ${t}`, contactName: 'I28 Contact', contactEmail: `${t}contact@mail.test`},
        users: [
            {username: U.mgr, roles: ['manager'], givenName: 'Mira', familyName: 'Manager'},
            {username: U.ed, roles: ['sectionEditor'], givenName: 'Edna', familyName: 'Editor'},
            {username: U.auth, roles: ['author'], givenName: 'Arno', familyName: 'Author'},
            {username: U.rev, roles: ['externalReviewer'], givenName: 'Rhea', familyName: 'Reviewer'},
        ],
    });
    const cp = ctx.path;
    const sub = await app.api.createSubmission({
        tag: `${t}a`, context: cp, submitter: U.auth, submitted: true, title: `U28 I28 ${t}`,
        decisions: ['sendExternalReview'],
        reviewRounds: [{reviewers: [{username: U.rev, status: 'accepted'}]}],
        participants: [{username: U.ed, role: 'sectionEditor'}],
    });
    const sid = sub.submissionId;
    put('seed', {tag: t, contextPath: cp, contextId: ctx.contextId, submissionId: sid, assignments: sub.reviewAssignments});
    const wizURL = (step) => app.url(`/index.php/${cp}/reviewer/submission/${sid}${step ? `?step=${step}` : ''}`);
    const stored = () => {
        const out = sql(app, `select sf.submission_file_id, sf.file_stage, coalesce(sf.assoc_type::text,''), coalesce(sf.assoc_id::text,''), sf.file_id,
            (select string_agg(setting_value, '/') from submission_file_settings s where s.submission_file_id = sf.submission_file_id and s.setting_name = 'name'),
            (select string_agg(r.file_id::text, ',' order by r.revision_id) from submission_file_revisions r where r.submission_file_id = sf.submission_file_id)
            from submission_files sf where sf.submission_id = ${Number(sid)} order by 1`);
        return out ? out.split('\n') : [];
    };

    // ------------------------------------------------------------ helpers
    const grid = (page) => page.locator('[id^="component-grid-files-attachment-reviewerreviewattachmentsgrid"]').first();
    const wizard = (page) => page.getByRole('dialog').filter({has: page.locator('.pkp_controller_fileUpload, div[id^="fileUploadWizard"]')}).last();
    const upBox = (page) => wizard(page).locator('.pkp_controller_fileUpload').first();
    const watch = (page) => {
        const list = [];
        page.on('response', async (r) => {
            const u = r.url();
            if (!/file-upload-wizard|manage-file|editMetadata|edit-metadata|delete-file|deleteFile|reviewerreviewattachmentsgrid|reviewer-review-attachments-grid/i.test(u)) return;
            let body = null; try { body = flat(await r.text(), 300); } catch (e) {}
            const q = r.request();
            list.push({m: q.method(), op: u.replace(/^.*\$\$\$call\$\$\$\//, '').replace(/\?.*/, ''), query: (u.split('?')[1] || '').slice(0, 220),
                post: q.method() === 'POST' && !/upload-file/.test(u) ? flat(decodeURIComponent(q.postData() || '').replace(/csrfToken=[^&]*/, 'csrfToken=…'), 300) : undefined,
                status: r.status(), body});
        });
        return list;
    };
    const take = (list) => list.splice(0, list.length);
    const snap = async (page, name) => { const s = await screen(page); record(name, s); await shot(page, name); return s; };
    const listState = async (page) => {
        const g = grid(page);
        await g.waitFor({timeout: T}).catch(() => {});
        await page.waitForFunction(() => { const e = document.querySelector('[id^="component-grid-files-attachment-reviewerreviewattachmentsgrid"]'); return e && !/Loading/.test(e.innerText); }, null, {timeout: T}).catch(() => {});
        const rows = await g.locator('tbody tr.gridRow').evaluateAll((els) => els.map((e) => e.innerText.replace(/\s+/g, ' ').trim()));
        return {rows, text: flat(await g.innerText().catch(() => 'n/a'), 400), uploadLinks: await page.getByRole('link', {name: 'Upload File'}).count()};
    };
    const rowActions = async (page, nameRe) => {
        const g = grid(page);
        const row = g.locator('tbody tr.gridRow').filter({hasText: nameRe}).first();
        if (!(await row.count())) return {row: null, actions: []};
        const more = row.locator('a.show_extras');
        if (await more.count()) { await more.first().click(); await idle(page); }
        const ctl = row.locator('xpath=following-sibling::tr[1]');
        const actions = await ctl.locator('a').evaluateAll((els) => els.filter((e) => e.offsetParent !== null).map((e) => e.innerText.trim()));
        return {row, ctl, actions};
    };
    const toStep3 = async (page) => {
        await page.goto(wizURL()); await idle(page);
        const sc = page.getByRole('button', {name: 'Save and continue'});
        if (await sc.count() && await sc.isEnabled()) { await sc.click(); await page.getByRole('button', {name: 'Continue to Step #3'}).waitFor({timeout: T}); await idle(page); }
        const c3 = page.getByRole('button', {name: 'Continue to Step #3'});
        if (await c3.count() && await c3.isEnabled()) { await c3.click(); await idle(page); }
        await page.waitForFunction(() => document.querySelector('[role=tab][aria-selected=true]')?.textContent.trim().startsWith('3.'), null, {timeout: T}).catch(() => {});
        await idle(page);
        await grid(page).waitFor({timeout: T}).catch(() => {});
        await idle(page);
    };
    const stepOne = async (page) => {
        const w = wizard(page);
        const sel = w.locator('select[id^="revisedFileId"]');
        return {
            title: flat(await w.locator('.pkp_modal_panel > .header, h1, h2').first().innerText().catch(() => null), 80),
            tabs: await w.getByRole('tab').allInnerTexts().catch(() => []),
            revise: (await sel.count()) ? {label: flat(await w.locator('label[for^="revisedFileId"]').first().innerText().catch(() => null), 120),
                options: (await sel.locator('option').allInnerTexts()).map((x) => flat(x, 80)), visible: await sel.isVisible()} : null,
            genre: await w.locator('select[id^="genreId"]').count(),
            box: flat(await upBox(page).innerText().catch(() => null), 200),
            buttons: await w.locator('button:visible, a:visible').evaluateAll((els) => els.map((e) => `${e.tagName}:${e.innerText.trim().replace(/\s+/g, ' ').slice(0, 30)}${e.disabled ? ':disabled' : ''}`)),
            text: flat(await w.innerText().catch(() => null), 700),
        };
    };
    const openUpload = async (page) => {
        await page.getByRole('link', {name: 'Upload File'}).click();
        await wizard(page).waitFor({timeout: T});
        await upBox(page).waitFor({timeout: T}).catch(() => {});
        await idle(page);
    };
    const pick = async (page, file) => {
        const answered = page.waitForResponse((r) => /upload-file/.test(r.url()) && r.request().method() === 'POST', {timeout: 60000}).catch(() => null);
        await wizard(page).locator('input[type="file"]').first().setInputFiles(file.path);
        const r = await answered;
        let body = null; if (r) { try { body = flat(await r.text(), 400); } catch (e) {} }
        await upBox(page).getByText(file.name).first().waitFor({timeout: 10000}).catch(() => {});
        await sleep(500); await idle(page);
        return {status: r && r.status(), body};
    };
    const finish = async (page, {addAnother = false} = {}) => {
        const passed = [];
        for (const next of ['2. Review Details', '3. Confirm']) {
            const w = wizard(page);
            await w.getByRole('button', {name: 'Continue', exact: true}).click();
            await w.getByRole('tab', {name: next, exact: true}).and(page.locator('[aria-selected="true"]')).waitFor({timeout: T});
            await idle(page);
            passed.push({step: next, text: flat(await w.innerText().catch(() => null), 400)});
        }
        const w = wizard(page);
        if (addAnother) {
            // "Add Another File" on "3. Confirm": what it opens, then that window's "Cancel"
            await w.getByRole('button', {name: 'Add Another File'}).click();
            await sleep(1500); await idle(page);
            const s = await snap(page, 'add-another');
            const st = await stepOne(page);
            const closed = await closeWizard(page);
            return {passed, addAnother: {step1: st, notices: s.notices, close: closed}};
        }
        await w.getByRole('button', {name: 'Complete', exact: true}).click();
        await w.waitFor({state: 'hidden', timeout: T}).catch(() => {});
        await idle(page); await sleep(800); await idle(page);
        return {passed, closed: !(await w.isVisible().catch(() => false))};
    };
    const closeWizard = async (page) => {
        const dialogs = [];
        const h = async (d) => { dialogs.push(`${d.type()}: ${d.message()}`); await d.accept().catch(() => {}); };
        page.on('dialog', h);
        const w = wizard(page);
        const cancel = w.getByRole('link', {name: 'Cancel', exact: true});
        const closeBtn = w.getByRole('button', {name: /^Close/});
        const via = (await cancel.count()) && await cancel.first().isVisible() ? 'Cancel link' : 'Close button';
        if (via === 'Cancel link') await cancel.first().click(); else await closeBtn.first().click();
        await sleep(1500);
        const confirm = page.locator('[role=dialog]:visible, [data-cy="dialog"]:visible').filter({hasText: /sure|unsaved|changes/i});
        let inPage = null;
        if (await confirm.count()) { inPage = flat(await confirm.last().innerText(), 200); const ok = confirm.last().getByRole('button', {name: /^(OK|Yes)$/}); if (await ok.count()) await ok.first().click(); }
        await w.waitFor({state: 'hidden', timeout: T}).catch(() => {});
        await sleep(2000);
        page.off('dialog', h);
        await idle(page);
        return {via, browserDialogs: dialogs, inPageConfirm: inPage, stillOpen: await w.isVisible().catch(() => false)};
    };

    const {page, close} = await launch(app);
    const net = watch(page);
    try {
        await signIn(page, U.rev);

        // A. step 3 empty, first upload
        await sect('A', async () => {
            await toStep3(page);
            const s0 = await snap(page, 'A0-step3-empty');
            put('A0 step3 empty', {url: page.url(), list: await listState(page), uploadSection: flat((s0.text.main || '').match(/Upload[\s\S]{0,260}/)?.[0], 300)});
            await loc(page, 'step 3 › Reviewer Files › Upload File', page.getByRole('link', {name: 'Upload File'}));
            const from = slog.mark();
            await openUpload(page);
            await snap(page, 'A1-wizard-step1');
            put('A1 wizard step1 (no files yet)', await stepOne(page));
            await loc(page, 'upload wizard step 1 › revision select', wizard(page).locator('select[id^="revisedFileId"]'));
            put('A2 pick first', await pick(page, FILES.first));
            put('A2 step1 after pick', await stepOne(page));
            await loc(page, 'upload wizard step 1 › Change File', upBox(page).getByRole('button', {name: 'Change File', exact: true}));
            put('A3 finish', await finish(page));
            const s = await snap(page, 'A4-list-same-page');
            put('A4 list same page', {list: await listState(page), notices: s.notices});
            put('A4 net', take(net));
            await page.reload(); await idle(page); await grid(page).waitFor({timeout: T}).catch(() => {});
            await snap(page, 'A5-list-reload');
            put('A5 list after reload', {url: page.url(), list: await listState(page), stored: stored(), serverLog: slog.since(from)});
        });

        // B. "Upload File" with the revision select on the reviewer's own file
        await sect('B', async () => {
            const from = slog.mark();
            await openUpload(page);
            await snap(page, 'B1-wizard-step1-with-file');
            const s1 = await stepOne(page);
            put('B1 wizard step1 (one file listed)', s1);
            const sel = wizard(page).locator('select[id^="revisedFileId"]');
            if (await sel.count()) {
                await sel.selectOption({label: (s1.revise.options.find((o) => /first/.test(o)) || s1.revise.options[1])});
                await idle(page);
                put('B2 after choosing the file', await stepOne(page));
            } else put('B2', 'no revision select in step 1');
            const r = await pick(page, FILES.second);
            await sleep(1500);
            const s = await snap(page, 'B3-after-pick-revision');
            put('B3 pick second as revision', {answer: r, step1: await stepOne(page), notices: s.notices, dialogs: s.aria && s.aria.dialogs ? flat(JSON.stringify(s.aria.dialogs), 400) : null});
            const cont = wizard(page).getByRole('button', {name: 'Continue', exact: true});
            put('B3 Continue state', {visible: await cont.isVisible().catch(() => null), enabled: await cont.isEnabled().catch(() => null)});
            let fin = null;
            if (r.status === 200 && await cont.isEnabled().catch(() => false)) fin = await finish(page, {addAnother: true}).catch((e) => String(e).split('\n')[0]);
            else {
                // what pressing "Continue" does after the refused upload
                if (await cont.isVisible().catch(() => false) && await cont.isEnabled().catch(() => false)) {
                    await cont.click(); await sleep(2000); await idle(page);
                    const s4 = await snap(page, 'B4-continue-after-refusal');
                    put('B4 Continue after refused upload', {step1: await stepOne(page), notices: s4.notices});
                }
                put('B5 close', await closeWizard(page));
            }
            if (fin) put('B4 finish', fin);
            put('B net', take(net));
            const s6 = await snap(page, 'B6-list-same-page');
            put('B6 list same page', {list: await listState(page), notices: s6.notices});
            await page.reload(); await idle(page); await grid(page).waitFor({timeout: T}).catch(() => {});
            await snap(page, 'B7-list-reload');
            put('B7 list after reload', {list: await listState(page), stored: stored(), serverLog: slog.since(from)});
        });

        // C. the row's "Edit"
        await sect('C', async () => {
            const from = slog.mark();
            const {actions, ctl} = await rowActions(page, /first/);
            put('C1 row actions', actions);
            await snap(page, 'C1-row-expanded');
            if (!actions.includes('Edit')) return;
            await loc(page, 'Reviewer Files row › Edit', ctl.getByRole('link', {name: 'Edit', exact: true}));
            await ctl.getByRole('link', {name: 'Edit', exact: true}).click();
            const dlg = page.getByRole('dialog').last();
            await dlg.waitFor({timeout: T});
            await page.waitForFunction(() => { const d = [...document.querySelectorAll('[role=dialog]')].pop(); return d && d.querySelector('form, input, .pkp_controller_fileUpload'); }, null, {timeout: T}).catch(() => {});
            await idle(page); await sleep(500);
            const s = await snap(page, 'C2-edit-window');
            const ctrls = await dlg.locator('input:visible, select:visible, textarea, button:visible, a:visible').evaluateAll((els) => els.map((e) => `${e.tagName}${e.type ? `[${e.type}]` : ''}${e.name ? `[name=${e.name}]` : ''}:${(e.innerText || e.value || '').trim().replace(/\s+/g, ' ').slice(0, 40)}`));
            put('C2 Edit window', {title: flat(await dlg.locator('h1, h2, .header').first().innerText().catch(() => null), 80), tabs: await dlg.getByRole('tab').allInnerTexts().catch(() => []), text: flat(s.text.dialog, 900), controls: ctrls, hasUploader: await dlg.locator('input[type="file"]').count(), revise: await dlg.locator('select[id^="revisedFileId"]').count()});
            const nameBox = dlg.locator('input[name^="name"]:visible').first();
            if (await nameBox.count()) {
                await nameBox.fill('u28i-first-renamed.pdf');
                const save = dlg.getByRole('button', {name: /^(Save|OK|Complete)$/}).first();
                await save.click();
                await dlg.waitFor({state: 'hidden', timeout: T}).catch(() => {});
                await idle(page); await sleep(800);
                const s3 = await snap(page, 'C3-after-edit-save');
                put('C3 Edit saved (name)', {stillOpen: await dlg.isVisible().catch(() => false), list: await listState(page), notices: s3.notices});
            } else {
                put('C3', 'no name box in the Edit window');
                await dlg.getByRole('button', {name: /^Close/}).first().click().catch(() => {});
            }
            put('C net', take(net));
            await page.reload(); await idle(page); await grid(page).waitFor({timeout: T}).catch(() => {});
            await snap(page, 'C4-list-reload');
            put('C4 list after reload', {list: await listState(page), stored: stored(), serverLog: slog.since(from)});
        });

        // D. "Change File" inside the wizard before completing
        await sect('D', async () => {
            const from = slog.mark();
            await openUpload(page);
            put('D1 step1', await stepOne(page));
            put('D2 pick third', await pick(page, FILES.third));
            const chg = upBox(page).getByRole('button', {name: 'Change File', exact: true});
            put('D2 Change File shown', await chg.isVisible().catch(() => false));
            put('D3 pick fourth (Change File)', await pick(page, FILES.fourth));
            await snap(page, 'D3-after-change-file');
            put('D3 step1', await stepOne(page));
            put('D4 finish', await finish(page));
            await snap(page, 'D5-list-same-page');
            put('D5 list same page', await listState(page));
            put('D net', take(net));
            await page.reload(); await idle(page); await grid(page).waitFor({timeout: T}).catch(() => {});
            await snap(page, 'D6-list-reload');
            put('D6 list after reload', {list: await listState(page), stored: stored(), serverLog: slog.since(from)});
        });

        // E. a file picked and the wizard left unsaved
        await sect('E', async () => {
            const from = slog.mark();
            await openUpload(page);
            put('E1 pick fifth', await pick(page, FILES.fifth));
            put('E2 close unsaved', await closeWizard(page));
            await snap(page, 'E3-list-same-page');
            put('E3 list same page', await listState(page));
            put('E net', take(net));
            await page.reload(); await idle(page); await grid(page).waitFor({timeout: T}).catch(() => {});
            await snap(page, 'E4-list-reload');
            put('E4 list after reload', {list: await listState(page), stored: stored(), serverLog: slog.since(from)});
        });

        // F. "Delete" on D's file
        await sect('F', async () => {
            const from = slog.mark();
            const {actions, ctl} = await rowActions(page, /fourth|third/);
            put('F1 row actions', actions);
            if (!actions.includes('Delete')) return;
            const dialogs = [];
            const h = async (d) => { dialogs.push(`${d.type()}: ${d.message()}`); await d.accept().catch(() => {}); };
            page.on('dialog', h);
            await ctl.getByRole('link', {name: 'Delete', exact: true}).click();
            await sleep(1000);
            const conf = page.locator('[data-cy="dialog"]:visible, [role=dialog]:visible').last();
            const s = await snap(page, 'F2-delete-confirm');
            const ctext = flat(await conf.innerText().catch(() => null), 300);
            const ok = conf.getByRole('button', {name: /^(OK|Yes|Delete)$/});
            if (await ok.count()) await ok.first().click();
            await sleep(1500); await idle(page);
            page.off('dialog', h);
            const s3 = await snap(page, 'F3-after-delete');
            put('F2 delete', {confirm: ctext, browserDialogs: dialogs, list: await listState(page), notices: [...(s.notices || []), ...(s3.notices || [])]});
            put('F net', take(net));
            await page.reload(); await idle(page); await grid(page).waitFor({timeout: T}).catch(() => {});
            await snap(page, 'F4-list-reload');
            put('F4 list after reload', {list: await listState(page), stored: stored(), serverLog: slog.since(from)});
        });

        // G. submit, then the submitted step 3
        await sect('G', async () => {
            const from = slog.mark();
            await toStep3(page);
            const rec = page.locator('select#reviewerRecommendationId');
            if (await rec.count()) await rec.selectOption({label: 'Accept Submission'});
            await page.getByRole('button', {name: 'Submit Review'}).click();
            const confirm = page.getByRole('dialog', {name: 'Confirm'});
            await confirm.waitFor({timeout: 10000});
            await confirm.getByRole('button', {name: 'OK', exact: true}).click();
            await page.waitForFunction(() => document.querySelector('[role=tab][aria-selected=true]')?.textContent.includes('4.'), null, {timeout: T}).catch(() => {});
            await idle(page);
            await snap(page, 'G1-step4');
            await page.goto(wizURL(3)); await idle(page); await grid(page).waitFor({timeout: T}).catch(() => {});
            await snap(page, 'G2-step3-submitted');
            const st = await listState(page);
            const {actions, ctl} = await rowActions(page, /first|renamed/);
            put('G2 step3 after submit', {list: st, rowActions: actions});
            if (actions.includes('Edit')) {
                await ctl.getByRole('link', {name: 'Edit', exact: true}).click();
                const dlg = page.getByRole('dialog').last();
                await dlg.waitFor({timeout: T});
                await page.waitForFunction(() => { const d = [...document.querySelectorAll('[role=dialog]')].pop(); return d && d.querySelector('form, input'); }, null, {timeout: T}).catch(() => {});
                await idle(page); await sleep(500);
                const s = await snap(page, 'G3-edit-window-submitted');
                put('G3 Edit window after submit', {text: flat(s.text.dialog, 700), hasUploader: await dlg.locator('input[type="file"]').count()});
                const nameBox = dlg.locator('input[name^="name"]:visible').first();
                if (await nameBox.count()) {
                    await nameBox.fill('u28i-after-submit.pdf');
                    await dlg.getByRole('button', {name: /^(Save|OK|Complete)$/}).first().click();
                    await dlg.waitFor({state: 'hidden', timeout: T}).catch(() => {});
                    await idle(page); await sleep(800);
                    const s4 = await snap(page, 'G4-after-edit-save-submitted');
                    put('G4 Edit saved after submit', {stillOpen: await dlg.isVisible().catch(() => false), dialogText: await dlg.isVisible().catch(() => false) ? flat(await dlg.innerText(), 300) : null, list: await listState(page), notices: s4.notices});
                }
            }
            put('G net', take(net));
            await page.reload(); await idle(page); await grid(page).waitFor({timeout: T}).catch(() => {});
            await snap(page, 'G5-list-reload');
            put('G5 list after reload', {list: await listState(page), stored: stored(), serverLog: slog.since(from)});
        });
        await signOut(page);

        // H. the editor's Read Review window
        await sect('H', async () => {
            await signIn(page, U.ed);
            await page.goto(app.url(`/index.php/${cp}/dashboard/editorial?workflowSubmissionId=${sid}`)); await idle(page);
            await page.getByRole('link', {name: /Review Round 1|Round 1/}).first().click().catch(() => {}); await idle(page);
            const row = page.getByRole('table', {name: 'Reviewers', exact: true}).getByRole('row').filter({hasText: 'Rhea'}).first();
            await row.waitFor({timeout: T});
            await row.getByRole('button', {name: /Read Review/}).click();
            const dlg = page.getByRole('dialog').last();
            await dlg.waitFor({timeout: T});
            await page.waitForFunction(() => { const d = [...document.querySelectorAll('[role=dialog]')].pop(); return d && /u28i-/.test(d.innerText); }, null, {timeout: 15000}).catch(() => {});
            await idle(page);
            const d = {aria: await dlg.ariaSnapshot(), text: await dlg.innerText()};
            record('H1-editor-read-review', d); await shot(page, 'H1-editor-read-review');
            put('H1 editor Read Review', {files: (d.text.match(/u28i-[\w-]+\.pdf/g) || []), reviewerFilesBlock: flat((d.text.match(/Reviewer Files[\s\S]{0,300}/) || [''])[0], 300)});
            await signOut(page);
        });
    } finally {
        await close();
        fs.writeFileSync(outFile('facts.json'), JSON.stringify(facts, null, 2));
    }
});
