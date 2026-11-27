// U28 claim check, incidentals chunk I27G (housekeeping 2026-11-27): the incidentals row (U28,
// 2026-11-26, seen on OJS stable-3_5_0) "any code a reviewer posts as the step-3 recommendation is
// stored; the editor's proxy save stores the raw value", driven on `main`. Spec lines: Fields step 3
// "Recommendation" row (line 93), Rule 12's list (249-252), Rule 13 (273-282), Purpose 43-44, OMP1
// and footnotes h, i, q, f-omp1.
//
// One scratch context per app and run (tag u28i27g…), seeded by the script: a manager (mgr), a
// section editor participant (se), an author, one external reviewer per submission. On OJS one
// recommendation of the scratch journal ("See Comments") is switched inactive with SQL (scratch data).
// OJS submissions (all External Review, se a participant):
//   SV  accepted, free-form: control (an offered code); also leaves step 3 once with a changed choice
//   SU  accepted: "Submit Review" with an option 99999 added to the list in the page; then recovery
//   SA  accepted: submit with the code "abc" added as an option
//   SI  accepted: submit with the journal's own inactive code added as an option (then the editor's
//       row and the "Review complete" email are read)
//   VU, VA, VI: the same three codes with "Save for Later"; then a reload; VI then submits with the
//       saved code as the list now preselects it
//   EM, ES  completed (accept): the editor's "Read Review" › "Modify Review" › "Save Changes" with the
//       window's own request rewritten (99999, "abc", own inactive), then a choice
//       made in the window (control); EM as the manager, ES as the section editor
//   EL  completed: the legacy grid op `reviewer-grid/review-read` sent directly as the manager
//       (U27 note: no window posts to it), with reviewerRecommendationId 99999 and "abc"
// OMP (no list on a press, OMP1): MU / MA submit with a `reviewerRecommendationId` field added to the
//   form in the page (99999, "abc"), then a reload (and the "4. Completion" tab pressed), then recovery;
//   MV "Save for Later" with 99999; EM, ES the editor's
//   "Save Changes" with a reviewerRecommendationId put into the request; EL the legacy op.
// OPS: no reviewer role and no review stage (U28 Purpose): the script logs that and returns.
//
// Run, twice (each run seeds afresh), from the repo root:
//   PROBE_RUN=r1 PROBE_FEATURE=U28 PROBE_AGENT=ccI27G PROBE_NOTES_FEATURE=U28 \
//     node bin/probe.js all shared/playwright/checks/U28/I27G/i27g.js
//   PROBE_RUN=r2 … the same. PARTS=rev,save,ed,legacy narrows (default all). ONLY=ojs,omp narrows apps.
//   Runs of this check (2026-11-27): r1, r2 (an earlier cut of the script), c1, c2 (this one).
// No other script, env part or file is read. Outputs: .reports/U28/ccI27G/<label>-<run>-<app>.json/.png
// and facts-<run>-<app>.json (every saveStep / review PUT answer, the stored
// review_assignments.reviewer_recommendation_id after each action and after the reload).
// No assertions: the script records, the reader judges.
const {forEachApp, launch, signIn, signOut, screen, shot, record, loc, note, idle, tag, sql, serverLog} =
    require('../../../probe');

const RUN = process.env.PROBE_RUN || 'r1';
const PARTS = process.env.PARTS ? process.env.PARTS.split(',') : ['rev', 'save', 'ed', 'legacy'];
const part = (p) => PARTS.includes(p);
const log = (...a) => console.log(`[${RUN}]`, ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (s, n = 1500) => (s || '').replace(/\s+/g, ' ').trim().slice(0, n);
const T = 30000;

async function waitTab(page, n) {
    await page.waitForFunction((n) => document.querySelector('[role=tab][aria-selected=true]')?.textContent.trim().startsWith(`${n}.`), n, {timeout: T}).catch(() => {});
    await idle(page);
}
async function noLoading(page) {
    await page.waitForFunction(() => !document.querySelector('main')?.innerText.includes('Loading'), null, {timeout: 20000}).catch(() => {});
}
const tabsOf = (page) => page.getByRole('tab').evaluateAll((els) =>
    els.map((e) => `${e.textContent.trim()}:disabled=${e.getAttribute('aria-disabled')}:selected=${e.getAttribute('aria-selected')}`));

async function toastWatch(page) {
    await page.evaluate(() => {
        window.__toasts = [];
        if (window.__toastObs) window.__toastObs.disconnect();
        window.__toastObs = new MutationObserver((ms) => {
            for (const m of ms) for (const n of m.addedNodes) {
                if (n.nodeType !== 1) continue;
                const hit = n.matches('.pkpNotification, .ui-pnotify, .pkp_notification, [role=alert], .pkpNotify') ? n : n.querySelector('.pkpNotification, .ui-pnotify, .pkp_notification, [role=alert], .pkpNotify');
                if (hit) { const t = (hit.innerText || '').trim(); if (t) window.__toasts.push(t.replace(/\s+/g, ' ').slice(0, 200)); }
            }
        });
        window.__toastObs.observe(document.body, {childList: true, subtree: true});
    }).catch(() => {});
}
const toasts = (page) => page.evaluate(() => window.__toasts || []).catch(() => []);

// What step 3 shows that could read as a refusal.
async function readStep3(page) {
    return page.evaluate(() => {
        const vis = (e) => !!e && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
        const errs = [...document.querySelectorAll('label.error, .pkp_form_error, #formErrors, .pkpFormField__error, ul.pkp_form_error_list li, .error')]
            .filter(vis).map((e) => `${e.tagName}.${e.className}: ${e.innerText.trim().replace(/\s+/g, ' ').slice(0, 160)}`).filter((x) => !x.endsWith(': '));
        const rec = document.querySelector('#reviewerRecommendationId, [name="reviewerRecommendationId"]');
        const box = document.querySelector('#reviewStep3MessageBox');
        return {
            errors: [...new Set(errs)],
            messageBox: box ? (vis(box) ? box.innerText.trim().replace(/\s+/g, ' ').slice(0, 200) : 'hidden') : 'absent',
            recommendation: rec ? {tag: rec.tagName, value: rec.value, text: rec.options ? rec.options[rec.selectedIndex]?.text : null,
                options: rec.options ? [...rec.options].map((o) => `${o.value}=${o.text}`) : null} : 'absent',
        };
    }).catch((e) => ({error: String(e.message).slice(0, 120)}));
}

forEachApp(async (app) => {
    if (app.name === 'ops') { log('[ops] no reviewer role and no review stage (U28 Purpose): nothing to drive'); return; }
    const ojs = app.name === 'ojs';
    const facts = {run: RUN, app: app.name, failed: {}};
    const done = (k, v) => { facts[k] = v; log(`[${k}]`, app.name, JSON.stringify(v).slice(0, 3000)); };
    const sect = async (name, fn) => {
        try { await fn(); } catch (e) { facts.failed[name] = String(e).split('\n')[0]; log(`[${name} FAILED]`, String(e).split('\n')[0]); }
    };
    let n = 0;
    const snap = async (page, name) => {
        const label = `${String(++n).padStart(3, '0')}-${name}`;
        let s;
        try { s = await screen(page); } catch (e) { s = {url: page.url(), error: String(e.message).slice(0, 200)}; }
        record(label, s); await shot(page, label).catch(() => {});
        return {label, notices: s.notices, dialogText: s.text && s.text.dialog ? flat(s.text.dialog, 600) : null};
    };
    const slog = serverLog(app);

    // ---- seed ---------------------------------------------------------------------------------
    const t = tag('u28i27g');
    const keysO = ['SV', 'SU', 'SA', 'SI', 'VU', 'VA', 'VI'];
    const keysM = ['MU', 'MA', 'MV'];
    const revKeys = ojs ? keysO : keysM;
    const U = {mgr: `${t}mgr`, se: `${t}se`, au: `${t}au`};
    for (const k of [...revKeys, 'EM', 'ES', 'EL']) U[k] = `${t}r${k.toLowerCase()}`;
    const ctx = await app.api.createContext({
        tag: t,
        context: {name: `I27G ${t}`, contactName: 'I27G Contact', contactEmail: `${t}contact@mail.test`},
        users: [
            {username: U.mgr, roles: ['manager'], givenName: 'Mona', familyName: 'Manager'},
            {username: U.se, roles: ['sectionEditor'], givenName: 'Sam', familyName: 'Editor'},
            {username: U.au, roles: ['author'], givenName: 'Ada', familyName: 'Author'},
            ...[...revKeys, 'EM', 'ES', 'EL'].map((k) => ({username: U[k], roles: ['externalReviewer'], givenName: 'Rev', familyName: k})),
        ],
    });
    const cp = ctx.path || t;
    const ct = ojs ? {table: 'journals', id: 'journal_id'} : {table: 'presses', id: 'press_id'};
    const contextId = sql(app, `select ${ct.id} from ${ct.table} where path='${cp}'`);
    const S = {};
    for (const k of [...revKeys, 'EM', 'ES', 'EL']) {
        const completed = ['EM', 'ES', 'EL'].includes(k);
        const r = await app.api.createSubmission({
            tag: `${t}${k.toLowerCase()}`, context: cp, submitter: U.au, title: `I27G ${k} ${t}`,
            decisions: ['sendExternalReview'],
            participants: [{username: U.se, role: 'sectionEditor'}],
            reviewRounds: [{reviewers: [{username: U[k], status: completed ? 'completed' : 'accepted',
                ...(completed ? {comments: `I27G ${k} seeded review text.`, ...(ojs ? {recommendation: 'accept'} : {})} : {})}]}],
        });
        const raId = sql(app, `select review_id from review_assignments where submission_id=${r.submissionId} and reviewer_id=(select user_id from users where username='${U[k]}')`);
        S[k] = {id: r.submissionId, ra: Number(raId), round: (r.reviewRounds || [])[0]};
    }
    const recs = ojs ? sql(app, `select r.reviewer_recommendation_id||'='||coalesce(s.setting_value,'?')||'='||r.status from reviewer_recommendations r left join reviewer_recommendation_settings s on s.reviewer_recommendation_id=r.reviewer_recommendation_id and s.setting_name='title' and s.locale='en' where r.context_id=${contextId} order by 1`).split('\n') : [];
    const recId = (title) => { const row = recs.find((x) => x.split('=')[1] === title); return row ? row.split('=')[0] : null; };
    const C = {};
    if (ojs) {
        C.inactive = recId('See Comments');
        sql(app, `update reviewer_recommendations set status=false where reviewer_recommendation_id=${C.inactive}`);
        C.accept = recId('Accept Submission');
        C.revisions = recId('Revisions Required');
    }
    C.unknown = '99999'; C.abc = 'abc';
    done('seed', {context: cp, contextId, subs: S, recommendations: recs, codes: C,
        omp_recommendation_rows: ojs ? undefined : sql(app, 'select count(*) from reviewer_recommendations')});
    const stored = (k) => sql(app, `select coalesce(reviewer_recommendation_id::text,'null')||'|step='||step||'|completed='||(date_completed is not null)||'|considered='||considered from review_assignments where review_id=${S[k].ra}`);
    const wizard = (id, step) => app.url(`/index.php/${cp}/reviewer/submission/${id}${step ? `?step=${step}` : ''}`);
    const wfUrl = (k) => app.url(`/index.php/${cp}/dashboard/editorial?workflowSubmissionId=${S[k].id}${S[k].round ? `&workflowMenuKey=workflow_${S[k].round.stageId}_${S[k].round.id}` : ''}`);

    const {page, close} = await launch(app);
    const dialogs = [];
    page.on('dialog', async (d) => {
        dialogs.push({type: d.type(), message: d.message().slice(0, 200), url: page.url().replace(/^.*index\.php/, '')});
        await d.accept().catch(() => {});
    });
    const answers = [];
    page.on('response', async (r) => {
        const u = r.url();
        if (!/saveStep|reviewAssignments\/\d+\/review|review-read/.test(u)) return;
        const req = r.request();
        const rec = {status: r.status(), method: req.method(), override: req.headers()['x-http-method-override'] || null,
            url: u.replace(/^.*index\.php\/[^/]+\//, ''), sent: flat(req.postData() || '', 400)};
        try { rec.body = flat(await r.text(), 900); } catch (e) { rec.body = `(unread: ${String(e.message).slice(0, 60)})`; }
        answers.push(rec);
    });
    const take = () => answers.splice(0);
    const consoleAll = [];
    page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) consoleAll.push(`${m.type()}: ${m.text().slice(0, 200)}`); });
    page.on('pageerror', (e) => consoleAll.push(`pageerror: ${String(e.message).slice(0, 200)}`));
    const takeConsole = () => consoleAll.splice(0);

    const toStep3 = async (id) => {
        await page.goto(wizard(id)); await idle(page); await noLoading(page);
        const s1 = page.getByRole('button', {name: 'Save and continue', exact: true});
        if (await s1.isVisible().catch(() => false)) { await s1.click(); await waitTab(page, 2); }
        const c3 = page.getByRole('button', {name: 'Continue to Step #3'});
        if (await c3.isVisible().catch(() => false)) { await c3.click(); await waitTab(page, 3); }
        await page.locator('form#reviewStep3Form').waitFor({timeout: T}); await noLoading(page);
        await page.waitForFunction(() => { const m = window.tinymce || window.tinyMCE; return !m || m.get().every((e) => e.initialized); }, null, {timeout: T}).catch(() => {});
        await idle(page);
    };
    const reloadStep3 = async (id) => {
        await page.goto(wizard(id, 3)); await idle(page); await noLoading(page);
        await page.locator('form#reviewStep3Form').waitFor({timeout: T}).catch(() => {});
        await page.waitForFunction(() => { const m = window.tinymce || window.tinyMCE; return !m || m.get().every((e) => e.initialized); }, null, {timeout: T}).catch(() => {});
        await idle(page);
    };
    const typeReview = async (text) => {
        const ae = page.frameLocator('iframe[id^="comments"]:not([id^="commentsPrivate"])').locator('body');
        await ae.click(); await page.keyboard.type(text);
    };
    // Put a code into the step-3 form in the page: OJS adds an option to the list and selects it;
    // OMP (no list) adds a one-option select named reviewerRecommendationId to the form.
    const forge = async (value, label) => page.evaluate(({value, label}) => {
        let s = document.querySelector('#reviewerRecommendationId');
        if (!s) {
            s = document.createElement('select'); s.name = 'reviewerRecommendationId'; s.id = 'i27gForged';
            document.querySelector('form#reviewStep3Form').appendChild(s);
        }
        const o = new Option(label, value); s.add(o); s.value = value;
        s.dispatchEvent(new Event('change', {bubbles: true}));
        return {value: s.value, name: s.name};
    }, {value, label});
    const pressSubmitOK = async (label) => {
        take(); takeConsole(); const from = slog.mark(); dialogs.splice(0);
        await toastWatch(page);
        await page.getByRole('button', {name: 'Submit Review'}).click();
        const conf = page.getByRole('dialog').filter({hasText: /Are you sure/}).last();
        const shown = await conf.waitFor({timeout: 15000}).then(() => true).catch(() => false);
        if (shown) {
            await conf.getByRole('button', {name: 'OK', exact: true}).click();
            await conf.waitFor({state: 'hidden', timeout: 15000}).catch(() => {});
        }
        await sleep(3000); await idle(page); await noLoading(page);
        const s = await snap(page, label);
        return {confirm: shown, snap: s.label, notices: s.notices, openDialog: s.dialogText, tabs: await tabsOf(page), step3: await readStep3(page),
            answers: take(), toasts: await toasts(page), dialogs: dialogs.splice(0), console: takeConsole(), serverLog: slog.since(from).slice(0, 6)};
    };
    const saveForLater = async (label) => {
        take(); takeConsole(); const from = slog.mark(); dialogs.splice(0);
        await toastWatch(page);
        await page.getByRole('button', {name: 'Save for Later'}).click();
        await page.waitForFunction(() => (window.__toasts || []).length > 0, null, {timeout: 8000}).catch(() => {});
        await sleep(1500); await idle(page);
        const s = await snap(page, label);
        return {snap: s.label, notices: s.notices, openDialog: s.dialogText, tabs: await tabsOf(page), step3: await readStep3(page),
            answers: take(), toasts: await toasts(page), dialogs: dialogs.splice(0), console: takeConsole(), serverLog: slog.since(from).slice(0, 6)};
    };
    // type into the first rich-text box of a Vue side window ("For author and editor" in "Modify Review")
    const typeInWindow = async (win, text) => {
        const fr = win.locator('iframe').first();
        if (!(await fr.count())) return 'no rich-text box';
        const id = await fr.getAttribute('id', {timeout: 5000}).catch(() => null);
        const body = id ? page.frameLocator(`iframe[id="${id}"]`).locator('body') : win.frameLocator('iframe').first().locator('body');
        await body.click({timeout: 10000}); await page.keyboard.press('End'); await page.keyboard.type(text);
        return `typed into ${id || 'iframe'}`;
    };
    const afterReload = async (k, label) => {
        await reloadStep3(S[k].id);
        const s = await snap(page, label);
        return {snap: s.label, tabs: await tabsOf(page), step3: await readStep3(page), stored: stored(k)};
    };

    try {
        // ---- rev: "Submit Review" with a forged code -------------------------------------------
        if (part('rev')) {
            const cases = ojs
                ? [['SU', C.unknown, 'Forged 99999'], ['SA', C.abc, 'Forged abc'], ['SI', C.inactive, 'Inactive: See Comments']]
                : [['MU', C.unknown, 'Forged 99999'], ['MA', C.abc, 'Forged abc']];
            if (ojs) await sect('SV', async () => {
                await signIn(page, U.SV);
                await toStep3(S.SV.id);
                const s0 = await snap(page, 'sv-step3');
                await loc(page, 'step 3 › "Recommendation" list', page.locator('select#reviewerRecommendationId'));
                const offered = await readStep3(page);
                await typeReview('I27G SV review text.');
                await page.locator('select#reviewerRecommendationId').selectOption({label: 'Accept Submission'});
                // leave the step once with the choice unsaved: tab "2. Guidelines"
                dialogs.splice(0);
                await page.getByRole('tab', {name: '2. Guidelines'}).click(); await idle(page); await sleep(1000);
                const left = {dialogs: dialogs.splice(0), tabs: await tabsOf(page)};
                left.snap = (await snap(page, 'sv-left-to-step2')).label;
                await page.getByRole('tab', {name: '3. Download & Review'}).click(); await idle(page); await sleep(1500);
                await page.locator('form#reviewStep3Form').waitFor({timeout: T}).catch(() => {});
                await idle(page);
                left.back = await readStep3(page);
                left.backSnap = (await snap(page, 'sv-back-on-step3')).label;
                done('SV-offered-and-leave', {snap: s0.label, offered: offered.recommendation, left, stored: stored('SV')});
                await typeReview(' again');
                await page.locator('select#reviewerRecommendationId').selectOption({label: 'Accept Submission'});
                const r = await pressSubmitOK('sv-submit-offered');
                r.stored = stored('SV');
                done('SV-submit-offered', r);
                await signOut(page).catch(() => {});
            });
            for (const [k, code, label] of cases) await sect(k, async () => {
                await signIn(page, U[k]);
                await toStep3(S[k].id);
                await snap(page, `${k.toLowerCase()}-step3`);
                await typeReview(`I27G ${k} review text.`);
                const f = await forge(code, label);
                const r = await pressSubmitOK(`${k.toLowerCase()}-submit-forged`);
                r.forged = f; r.stored = stored(k);
                done(`${k}-submit`, r);
                const rl = await afterReload(k, `${k.toLowerCase()}-submit-forged-reload`);
                // OMP: the refused submit can leave "4. Completion" open; press it
                if (!ojs && /disabled=null/.test(rl.tabs[3] || '')) {
                    await page.getByRole('tab', {name: '4. Completion'}).click(); await idle(page); await sleep(1500);
                    const s4 = await snap(page, `${k.toLowerCase()}-tab4-after-refusal`);
                    rl.tab4 = {snap: s4.label, tabs: await tabsOf(page), text: flat(await page.locator('main').innerText().catch(() => ''), 500), stored: stored(k)};
                    await reloadStep3(S[k].id);
                }
                done(`${k}-submit-reload`, rl);
                // recovery: a real choice (OJS) or no added field (OMP), and submit again
                if (!/completed=true/.test(rl.stored)) {
                    if (ojs) await page.locator('select#reviewerRecommendationId').selectOption({label: 'Revisions Required'});
                    const rec = await pressSubmitOK(`${k.toLowerCase()}-submit-recovery`);
                    rec.stored = stored(k);
                    done(`${k}-recovery`, rec);
                }
                if (k === 'SI' && /completed=true/.test(stored('SI'))) {
                    await signOut(page).catch(() => {});
                    await signIn(page, U.se);
                    await page.goto(wfUrl('SI')); await idle(page);
                    const tbl = page.getByRole('table', {name: 'Reviewers', exact: true});
                    await tbl.waitFor({timeout: T}).catch(() => {});
                    await idle(page);
                    const row = tbl.getByRole('row').filter({hasText: 'Rev SI'}).first();
                    const ed = {snap: (await snap(page, 'si-editor-row')).label, row: flat(await row.innerText().catch(() => null), 300)};
                    await row.getByRole('button', {name: 'Read Review', exact: true}).click().catch((e) => ed.readErr = String(e.message).slice(0, 80));
                    const rd = page.getByRole('dialog', {name: /^Review Details:/}).last();
                    await rd.waitFor({timeout: T}).catch(() => {}); await idle(page); await sleep(1000);
                    const dsn = await snap(page, 'si-editor-review-details');
                    ed.details = {snap: dsn.label, text: dsn.dialogText};
                    const m = await app.mail.find({to: `${U.se}@mail.test`, subject: 'Review complete', contains: `I27G SI ${t}`, timeoutMs: 20000}).catch((e) => ({error: String(e.message).slice(0, 120)}));
                    const full = m && m.ID ? await app.mail.fullMessage(m.ID).catch(() => null) : null;
                    ed.mail = {subject: full?.Subject || m.Subject || m.error, text: flat(full?.Text || '', 600)};
                    done('SI-editor-side', ed);
                }
                await signOut(page).catch(() => {});
            });
        }

        // ---- save: "Save for Later" with a forged code ------------------------------------------
        if (part('save')) {
            const cases = ojs
                ? [['VU', C.unknown, 'Forged 99999'], ['VA', C.abc, 'Forged abc'], ['VI', C.inactive, 'Inactive: See Comments']]
                : [['MV', C.unknown, 'Forged 99999']];
            for (const [k, code, label] of cases) await sect(k, async () => {
                await signIn(page, U[k]);
                await toStep3(S[k].id);
                await typeReview(`I27G ${k} saved text.`);
                const f = await forge(code, label);
                const r = await saveForLater(`${k.toLowerCase()}-save-forged`);
                r.forged = f; r.stored = stored(k);
                done(`${k}-save`, r);
                done(`${k}-save-reload`, await afterReload(k, `${k.toLowerCase()}-save-forged-reload`));
                // the saved code is now preselected: "Submit Review" with it as it stands
                if (k === 'VI') {
                    await typeReview(` I27G ${k} submit after save.`);
                    const r2 = await pressSubmitOK(`${k.toLowerCase()}-submit-saved-code`);
                    r2.stored = stored(k);
                    done(`${k}-submit-saved-code`, r2);
                }
                await signOut(page).catch(() => {});
            });
        }

        // ---- ed: the editor's "Modify Review" › "Save Changes" with the request rewritten --------
        if (part('ed')) for (const [k, who] of [['EM', 'mgr'], ['ES', 'se']]) await sect(k, async () => {
            await signIn(page, U[who]);
            await page.goto(wfUrl(k)); await idle(page);
            const tbl = page.getByRole('table', {name: 'Reviewers', exact: true});
            await tbl.waitFor({timeout: T}); await idle(page);
            const row = tbl.getByRole('row').filter({hasText: `Rev ${k}`}).first();
            const out = {before: stored(k), rowBefore: flat(await row.innerText().catch(() => null), 300)};
            out.rowSnap = (await snap(page, `${k.toLowerCase()}-row`)).label;
            await row.getByRole('button', {name: 'Read Review', exact: true}).click();
            const rd = page.getByRole('dialog', {name: /^Review Details:/}).last();
            await rd.waitFor({timeout: T});
            await rd.getByRole('button', {name: 'Modify Review', exact: true}).and(page.locator(':enabled')).waitFor({timeout: T}).catch(() => {});
            await idle(page);
            out.detailsSnap = (await snap(page, `${k.toLowerCase()}-details`)).label;
            await rd.getByRole('button', {name: 'Modify Review', exact: true}).click();
            const conf = page.locator('[data-cy="dialog"]').filter({hasText: 'Modify this review?'}).last();
            await conf.waitFor({timeout: T});
            await conf.getByRole('button', {name: 'Modify Review', exact: true}).click();
            const mr = page.getByRole('dialog', {name: 'Modify Review'}).last();
            const save = mr.getByRole('button', {name: 'Save Changes', exact: true});
            await save.waitFor({timeout: T}); await idle(page); await sleep(1500);
            const sel = mr.locator('select[name="reviewerRecommendationId"], select[id*="reviewerRecommendationId"]').first();
            out.modifySnap = (await snap(page, `${k.toLowerCase()}-modify`)).label;
            out.select = await sel.evaluate((s) => ({value: s.value, options: [...s.options].map((o) => `${o.value}=${o.text}`)})).catch(() => 'absent');
            if (k === 'EM') await loc(page, '"Modify Review" › "Recommendation" select', sel);
            let rewrite = null;
            await page.route(/reviewAssignments\/\d+\/review(\?|$)/, async (route) => {
                const req = route.request();
                if (rewrite === null || req.method() === 'GET') return route.continue();
                let body = req.postData() || '';
                try { const j = JSON.parse(body); j.reviewerRecommendationId = rewrite; body = JSON.stringify(j); }
                catch (e) { body = body.replace(/reviewerRecommendationId=[^&]*/, `reviewerRecommendationId=${encodeURIComponent(rewrite)}`); }
                return route.continue({postData: body});
            });
            const codes = ojs ? [['unknown', 99999], ['abc', 'abc'], ['inactive', Number(C.inactive)]] : [['unknown', 99999]];
            out.saves = [];
            let flip = 0;
            for (const [name, code] of codes) {
                // a refused save leaves "Save Changes" disabled until the form changes: change the choice
                // (OJS) or type (OMP); the request is rewritten either way
                if (flip++) {
                    if (ojs) await sel.selectOption({label: flip % 2 ? 'Accept Submission' : 'Revisions Required'}).catch(() => {});
                    else await typeInWindow(mr, ' x');
                    await save.and(page.locator(':enabled')).waitFor({timeout: 5000}).catch(() => {});
                }
                rewrite = code; take(); takeConsole(); const from = slog.mark(); dialogs.splice(0);
                await toastWatch(page);
                await save.click(); await idle(page); await sleep(2500);
                const sv = await snap(page, `${k.toLowerCase()}-save-${name}`);
                const fieldErr = await mr.locator('.pkpFormField__error, .pkpFormError, [role=alert]').allInnerTexts().catch(() => []);
                const stillOpen = await mr.isVisible().catch(() => false);
                const vueDialogs = await page.locator('[data-cy="dialog"]').allInnerTexts().catch(() => []);
                out.saves.push({name, code, snap: sv.label, saveEnabledAfter: await save.isEnabled().catch(() => null), notices: sv.notices, toasts: await toasts(page), fieldErrors: fieldErr.map((x) => flat(x, 200)),
                    windowOpen: stillOpen, vueDialogs: vueDialogs.map((x) => flat(x, 200)), answers: take(), dialogs: dialogs.splice(0), console: takeConsole(),
                    serverLog: slog.since(from).slice(0, 6), stored: stored(k)});
                // an error dialog, if any, is answered
                const ok = page.locator('[data-cy="dialog"]').getByRole('button', {name: 'OK', exact: true});
                if (await ok.count()) await ok.last().click().catch(() => {});
                if (!stillOpen) break;
            }
            rewrite = null;
            // control: a choice made in the window itself (OJS); OMP saves with nothing changed
            if (await mr.isVisible().catch(() => false)) {
                if (ojs) await sel.selectOption({label: 'Resubmit for Review'}).catch((e) => out.selectErr = String(e.message).slice(0, 80));
                else {
                    // OMP: the refused save leaves "Save Changes" disabled and the window has no field the
                    // script can change reliably: leave it by "Cancel" and open "Modify Review" afresh
                    out.typed = await typeInWindow(mr, ' control').catch((e) => String(e.message).slice(0, 80));
                    if (!(await save.isEnabled().catch(() => false))) {
                        dialogs.splice(0);
                        await mr.getByRole('button', {name: 'Cancel', exact: true}).click();
                        const leave = page.locator('[data-cy="dialog"]').last();
                        if (await leave.isVisible({timeout: 3000}).catch(() => false)) {
                            out.cancelDialog = flat(await leave.innerText().catch(() => ''), 300);
                            const yes = leave.getByRole('button').first();
                            await yes.click().catch(() => {});
                        }
                        await mr.waitFor({state: 'hidden', timeout: 10000}).catch(() => {});
                        out.cancelBrowserDialogs = dialogs.splice(0);
                        out.reopenedFrom = (await snap(page, `${k.toLowerCase()}-after-cancel`)).label;
                        await rd.getByRole('button', {name: 'Modify Review', exact: true}).click();
                        await conf.waitFor({timeout: T});
                        await conf.getByRole('button', {name: 'Modify Review', exact: true}).click();
                        await save.waitFor({timeout: T}); await idle(page); await sleep(1500);
                    }
                }
                await save.and(page.locator(':enabled')).waitFor({timeout: 5000}).catch(() => {});
                take(); takeConsole(); const from = slog.mark();
                await toastWatch(page);
                await save.click(); await idle(page); await sleep(2500);
                const sv = await snap(page, `${k.toLowerCase()}-save-control`);
                out.control = {snap: sv.label, notices: sv.notices, toasts: await toasts(page), windowOpen: await mr.isVisible().catch(() => false), answers: take(),
                    console: takeConsole(), serverLog: slog.since(from).slice(0, 6), stored: stored(k)};
            }
            await page.unroute(/reviewAssignments\/\d+\/review(\?|$)/).catch(() => {});
            // reload: the row and the window again
            await page.goto(wfUrl(k)); await idle(page);
            await tbl.waitFor({timeout: T}).catch(() => {}); await idle(page);
            out.rowAfter = flat(await tbl.getByRole('row').filter({hasText: `Rev ${k}`}).first().innerText().catch(() => null), 300);
            out.rowAfterSnap = (await snap(page, `${k.toLowerCase()}-row-reload`)).label;
            done(`${k}-modify`, out);
            await signOut(page).catch(() => {});
        });

        // ---- legacy: the grid op no window posts to, sent directly as the manager ---------------
        if (part('legacy')) await sect('EL', async () => {
            await signIn(page, U.mgr);
            await page.goto(wfUrl('EL')); await idle(page);
            await snap(page, 'el-workflow');
            const token = await page.evaluate(() => window.pkp?.currentUser?.csrfToken || null);
            const url = app.url(`/index.php/${cp}/$$$call$$$/grid/users/reviewer/reviewer-grid/review-read?submissionId=${S.EL.id}&reviewAssignmentId=${S.EL.ra}&stageId=3&reviewRoundId=${S.EL.round?.id}`);
            const out = {before: stored('EL'), sends: []};
            const codes = ojs ? [['unknown', '99999'], ['abc', 'abc']] : [['unknown', '99999']];
            for (const [name, code] of codes) {
                const from = slog.mark();
                const r = await page.request.post(url, {form: {csrfToken: token, reviewerRecommendationId: code}, failOnStatusCode: false});
                out.sends.push({name, code, status: r.status(), body: flat(await r.text().catch(() => ''), 400), serverLog: slog.since(from).slice(0, 4), stored: stored('EL')});
            }
            await page.goto(wfUrl('EL')); await idle(page);
            const tbl = page.getByRole('table', {name: 'Reviewers', exact: true});
            await tbl.waitFor({timeout: T}).catch(() => {}); await idle(page);
            out.row = flat(await tbl.getByRole('row').filter({hasText: 'Rev EL'}).first().innerText().catch(() => null), 300);
            out.snap = (await snap(page, 'el-row-after')).label;
            done('EL-legacy', out);
            await signOut(page).catch(() => {});
        });
    } finally {
        record('facts', facts);
        await close();
    }
});
