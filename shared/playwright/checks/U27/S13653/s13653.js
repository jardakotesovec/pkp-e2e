// U27 claim check S13653 (upstream-sync accommodation of pkp/pkp-lib#13653: pkp-lib 3ed5d1c3b3 / #13664,
// ui-library 836c01b5 / #1036). The PR made ReviewAssignmentController::editReview() complete the review on
// ANY "Save Changes" in "Modify Review" while the review is not submitted ($isReviewUpdated ||
// !dateCompleted). The chunk: Rules 14b, 14c, 14d (spec lines 451-575), Side effects "Submitting a review for
// the reviewer" (738), scenario 21 (1385-1434), the Coverage line (1500), register A29 A40 A41 OMP5.
// OJS and OMP (OPS has no review stage: skipped). Every run seeds its own scratch contexts:
//   P "S13653 P <t>"  a "Competing Interests" policy and one active review form "S13653 Req" (one required
//                     textarea). ed (editor, manager level), se (sectionEditor, sub-editor level, a stage
//                     participant: the acceptance-mail recipient), au (author); reviewers (externalReviewer) on SA:
//       n0U invited / n0A accepted   "Save Changes" with nothing entered
//       tdU invited / tdA accepted   a comment typed and deleted again, then saved ({OJS} then a recommendation)
//       ciU invited / ciA accepted   only the competing-interests answer recorded
//       roU invited                  {OJS} only a "Recommendation" picked (A41's log rows)
//       cU invited / cA accepted     a comment ({OJS} with a recommendation): Rule 14d proper
//       sfl invited                  accepts on screen (the acceptance-mail control), step 3 "Save for Later" with a
//                                    comment ({OJS} and a recommendation); then the editor saves with nothing changed
//       seU invited                  the Section/Series Editor's save with nothing entered ({OJS}: a recommendation)
//       dC declined                  the save refused (A30); dE declined, re-sent, then saved
//       rmU invited                  made overdue, reminded: the window's "Reviewer Reminded:" line, a star
//       vA accepted                  the window opened only (Rule 14c's reviewer side "Finish review")
//       fQ invited on "S13653 Req"   the form's window, the empty required question refused, then answered
//       sS completed                 modifying a submitted review (Rule 14b): texts, the leave warning, kept dates
//       pP completed                 "Publicly Show Reviewer Comments": the dialog before and after completion
//       uL completed                 the edit window's "Upload"
//   Q "S13653 Q <t>"  scenario 21: a policy; mg (manager), auQ; q1 completed (seeded "I do not have …"),
//                     q2 invited, q3 invited; the policy emptied on screen mid-phase.
// Phases (PHASES=a,b narrows; opt-in form2 re-drives the review-form request alone; state in outFile('s13653-state.json'), facts in record('facts')):
//   seed  sfl  mod  se  rside  mail  s21
// Run (each run seeds its own contexts; two runs per app, never two runs of one app at once):
//   PROBE_RUN=r1 PROBE_FEATURE=U27 PROBE_AGENT=ccS13653 PROBE_NOTES_FEATURE=U27 node bin/probe.js ojs shared/playwright/checks/U27/S13653/s13653.js
//   PROBE_RUN=r2 …  (the same, a second independent run); `omp` the same. Outputs: .reports/U27/ccS13653/.
const path = require('path');
const fs = require('fs');
const {forEachApp, launch, signIn, screen, shot, record, loc, note, idle, tag, outFile, sql} = require('../../../probe');

const RUN = process.env.PROBE_RUN || 'r1';
const ALL = ['seed', 'sfl', 'mod', 'se', 'rside', 'mail', 's21'];
const PHASES = process.env.PHASES ? process.env.PHASES.split(',') : ALL;
const on = (p) => PHASES.includes(p);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (s, n = 1500) => (s == null ? null : String(s).replace(/\s+/g, ' ').trim().slice(0, n));
const pad = (n) => String(n).padStart(2, '0');
const dayObj = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d; };
const T = 30000;

const NAMES = {
    ed: ['Edna', 'Chiefed'], se: ['Selma', 'Subed'], au: ['Aldo', 'Authorp'], mg: ['Magda', 'Managerq'], auQ: ['Quin', 'Authorq'],
    n0U: ['Nora', 'Emptyunans'], n0A: ['Nils', 'Emptyacc'], tdU: ['Tara', 'Typeddelu'], tdA: ['Ted', 'Typeddela'],
    ciU: ['Cora', 'Ciunans'], ciA: ['Cyrus', 'Ciacc'], roU: ['Rosa', 'Reconly'], cU: ['Carl', 'Commentu'], cA: ['Cleo', 'Commenta'],
    sfl: ['Sofia', 'Savelater'], seU: ['Sean', 'Subsaved'], dC: ['Dina', 'Declinedc'], dE: ['Dean', 'Resente'],
    rmU: ['Remy', 'Remindedu'], vA: ['Vera', 'Viewonly'], fQ: ['Faye', 'Formreq'], sS: ['Saul', 'Submitteds'],
    pP: ['Pola', 'Publicp'], uL: ['Ugo', 'Uploadl'],
    q1: ['Quentin', 'Firstq'], q2: ['Quella', 'Secondq'], q3: ['Quigley', 'Thirdq'],
};
const full = (k) => NAMES[k].join(' ');
const POLICY = 'S13653 competing interests policy: disclose any relationship with the authors.';
const CI_ED = 'I co-authored a paper with the author.';
const FORM_REQ = 'S13653 Req';
const FORM_Q = 'S13653 required question';
const P_REVS = ['n0U', 'n0A', 'tdU', 'tdA', 'ciU', 'ciA', 'roU', 'cU', 'cA', 'sfl', 'seU', 'dC', 'dE', 'rmU', 'vA', 'fQ', 'sS', 'pP', 'uL'];

forEachApp(async (app) => {
    if (app.name === 'ops') { console.log('[s13653] ops: no review stage; skipped'); return; }
    const A = app.name;
    const isOMP = A === 'omp';
    const REC = isOMP ? null : 'Accept Submission';
    const sf = outFile('s13653-state.json');
    const st = fs.existsSync(sf) && !on('seed') ? JSON.parse(fs.readFileSync(sf, 'utf8')) : {};
    const save = () => fs.writeFileSync(sf, JSON.stringify(st, null, 2));
    const T0 = Date.now();
    const log = (...a) => console.log(`[s13653 ${RUN} ${A} +${Math.round((Date.now() - T0) / 1000)}s]`, ...a);
    const fact = (k, v) => { record('facts', {[k]: v}, {merge: true}); log(`[${k}]`, JSON.stringify(v).slice(0, 1600)); };
    const db = (q) => { try { return sql(app, q).split('\n').filter(Boolean); } catch (e) { return [`ERROR ${flat(e.message, 200)}`]; } };
    async function sect(name, fn) {
        const t0 = Date.now();
        try { await fn(); } catch (e) { log(`[${name} FAILED]`, String(e.stack || e).split('\n').slice(0, 6).join(' | ')); fact(`${name} FAILED`, String(e.message || e).slice(0, 800)); }
        log(`[${name}] done in ${Math.round((Date.now() - t0) / 1000)}s`);
    }

    // ---- seed ---------------------------------------------------------------
    if (on('seed')) {
        const t = tag('u27s13653');
        st.t = t; st.u = {};
        for (const k of Object.keys(NAMES)) st.u[k] = `${t}${k.toLowerCase()}`;
        const u = st.u;
        const person = (k, roles) => ({username: u[k], roles, givenName: NAMES[k][0], familyName: NAMES[k][1]});
        const CP = await app.api.createContext({
            tag: t, context: {name: `S13653 P ${t}`},
            users: [person('ed', ['editor']), person('se', ['sectionEditor']), person('au', ['author']), ...P_REVS.map((k) => person(k, ['externalReviewer']))],
            review: {competingInterests: {en: POLICY}},
            reviewForms: [{title: {en: FORM_REQ}, elements: [{question: {en: FORM_Q}, type: 'textarea', required: true}]}],
        });
        st.P = CP.path;
        const CQ = await app.api.createContext({
            tag: `${t}q`, context: {name: `S13653 Q ${t}`},
            users: [person('mg', ['manager']), person('auQ', ['author']), ...['q1', 'q2', 'q3'].map((k) => person(k, ['externalReviewer']))],
            review: {competingInterests: {en: POLICY}},
        });
        st.Q = CQ.path;
        const R = (k, status, more = {}) => ({username: u[k], status, ...more});
        const sub = async (key, ctx, submitter, extra) => {
            const title = `S13653 ${key} ${t}`;
            const r = await app.api.createSubmission({tag: `${t}${key.toLowerCase()}`, context: ctx, submitter, title, decisions: ['sendExternalReview'], ...extra});
            st[key] = {id: r.submissionId, rounds: r.reviewRounds, title, ctx};
        };
        await sub('SA', st.P, u.au, {participants: [{username: u.se, role: 'sectionEditor'}], reviewRounds: [{reviewers: [
            R('n0U', 'invited'), R('n0A', 'accepted'), R('tdU', 'invited'), R('tdA', 'accepted'), R('ciU', 'invited'), R('ciA', 'accepted'),
            R('roU', 'invited'), R('cU', 'invited'), R('cA', 'accepted'), R('sfl', 'invited'), R('seU', 'invited'), R('dC', 'declined'), R('dE', 'declined'),
            R('rmU', 'invited'), R('vA', 'accepted'), R('fQ', 'invited', {reviewForm: FORM_REQ}),
            R('sS', 'completed', {comments: 'S13653 sS seeded comments.'}), R('pP', 'completed', {comments: 'S13653 pP seeded comments.'}), R('uL', 'completed', {comments: 'S13653 uL seeded comments.'})]}]});
        await sub('SQ', st.Q, u.auQ, {reviewRounds: [{reviewers: [R('q1', 'completed', {comments: 'S13653 q1 seeded comments.'}), R('q2', 'invited'), R('q3', 'invited')]}]});
        st.ra = {};
        for (const [key, ks] of [['SA', P_REVS], ['SQ', ['q1', 'q2', 'q3']]]) {
            for (const k of ks) st.ra[k] = Number(db(`select review_id from review_assignments where submission_id=${st[key].id} and reviewer_id=(select user_id from users where username='${u[k]}')`)[0]);
        }
        st.seededAt = new Date().toISOString();
        save();
        fact('seed', {P: st.P, Q: st.Q, SA: st.SA, SQ: st.SQ, ra: st.ra, seededAt: st.seededAt});
    }
    if (!st.t) { log('no state; run the seed phase'); return; }
    const u = st.u;
    const dbRA = (k) => db(`select date_confirmed, date_completed, step, declined, competing_interests_declared, coalesce(competing_interests,'(null)'), reviewer_recommendation_id, last_modified_by_id, date_assigned, date_notified, considered from review_assignments where review_id=${st.ra[k]}`)[0];

    const {page, close} = await launch(app);
    const dialogsSeen = [];
    page.on('dialog', async (d) => { dialogsSeen.push({type: d.type(), message: d.message(), url: page.url(), at: new Date().toISOString()}); log('[browser dialog]', d.type(), flat(d.message(), 160)); await d.accept().catch(() => {}); });
    // The review saves the screens send (the browser's own traffic) and the assignment the window refetches.
    const puts = [];
    const gets = [];
    page.on('request', (req) => {
        const url = req.url().split('?')[0];
        if (req.method() === 'POST' && /\/reviewAssignments\/\d+\/review$/.test(url)) {
            let body = null; try { body = req.postDataJSON(); } catch (_) { body = flat(req.postData(), 300); }
            puts.push({at: Date.now(), url: url.replace(/^https?:\/\/[^/]+/, ''), override: req.headers()['x-http-method-override'] || null,
                body: body && typeof body === 'object' ? Object.fromEntries(Object.entries(body).map(([k, v]) => [k, v === null ? null : flat(typeof v === 'string' ? v : JSON.stringify(v), 200)])) : body});
        }
    });
    page.on('response', async (r) => {
        const url = r.url().split('?')[0];
        const m = url.match(/\/reviewAssignments\/(\d+)$/);
        if (r.request().method() === 'GET' && m) {
            let j = null; try { j = await r.json(); } catch (_) { /* not json */ }
            gets.push({at: Date.now(), id: Number(m[1]), status: r.status(), a: j ? {dateConfirmed: j.dateConfirmed, dateCompleted: j.dateCompleted, step: j.step, statusId: j.status ?? j.statusId, declined: j.declined, reviewerRecommendationId: j.reviewerRecommendationId, competingInterestsDeclared: j.competingInterestsDeclared, lastModifiedBy: j.lastModifiedByName || j.lastModifiedBy || j.lastModifiedById || null} : null});
        }
        if (r.request().method() === 'POST' && /\/reviewAssignments\/\d+\/review$/.test(url)) {
            const p = [...puts].reverse().find((x) => x.url === url.replace(/^https?:\/\/[^/]+/, '') && x.status === undefined);
            let j = null; try { j = await r.json(); } catch (_) { /* not json */ }
            const e = {status: r.status(), answer: j && (j.errors || j.error) ? flat(JSON.stringify(j.errors || j.error), 400) : (j ? {dateCompleted: j.dateCompleted, dateConfirmed: j.dateConfirmed, step: j.step} : null)};
            if (p) Object.assign(p, e); else puts.push({at: Date.now(), url, ...e});
        }
    });
    const putsSince = (t0) => puts.filter((p) => p.at >= t0).map(({at, ...r}) => r);
    const getsOf = (k, t0) => gets.filter((g) => g.id === st.ra[k] && g.at >= t0).map(({at, ...r}) => ({t: new Date(at).toISOString(), ...r}));
    let snapN = 0;
    async function snap(label, extra) {
        let s;
        try { s = await screen(page); } catch (e) { s = {url: page.url(), error: String(e.message).slice(0, 200)}; }
        if (extra) Object.assign(s, extra);
        const name = `${String(++snapN).padStart(3, '0')}-${label}`;
        record(name, s);
        await shot(page, name).catch(() => {});
        return {name: `${name}-${RUN}-${A}`, s};
    }
    const as = async (who, ctx) => { await signIn(page, u[who], {contextPath: ctx}); await idle(page); };
    const wfUrl = (s) => `/index.php/${s.ctx}/dashboard/editorial?workflowSubmissionId=${s.id}${s.rounds && s.rounds[0] ? `&workflowMenuKey=workflow_${s.rounds[0].stageId}_${s.rounds[0].id}` : ''}`;
    const table = () => page.getByRole('table', {name: 'Reviewers', exact: true});
    const row = (k) => table().getByRole('row').filter({hasText: full(k)}).first();
    async function openWf(s, rowOf) {
        await page.goto(wfUrl(s)); await idle(page);
        await page.getByRole('button', {name: 'Add Reviewer', exact: true}).first().waitFor({timeout: T}).catch(() => log('no Add Reviewer button'));
        if (rowOf) await row(rowOf).waitFor({timeout: T}).catch(() => log('no row', rowOf));
        await idle(page);
    }
    async function rowRead(k) {
        const r = row(k);
        if (!(await r.count())) return {absent: true};
        return r.evaluate((el) => {
            const statusCell = el.querySelector('td');
            const title = statusCell && statusCell.querySelector('span.text-base-bold');
            return {cells: [...el.querySelectorAll('th,td')].map((c) => c.innerText.replace(/\s+/g, ' ').trim()),
                status: title ? title.innerText.trim() : null,
                badge: statusCell ? [...statusCell.querySelectorAll('span,div')].filter((x) => x.children.length === 0 && /Competing Interests/.test(x.innerText)).map((x) => x.innerText.trim()) : [],
                buttons: [...el.querySelectorAll('button')].map((b) => (b.innerText || b.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim()).filter(Boolean)};
        });
    }
    async function menu(k) {
        await row(k).getByRole('button', {name: /More Actions/}).first().click();
        await page.getByRole('menuitem').first().waitFor({timeout: 10000}).catch(() => {});
        return (await page.getByRole('menuitem').allInnerTexts()).map((x) => x.trim());
    }
    async function closeMenu(k) { await row(k).getByRole('button', {name: /More Actions/}).first().click().catch(() => {}); await page.getByRole('menu').waitFor({state: 'hidden', timeout: 5000}).catch(() => {}); }
    async function menuOf(k) { const m = await menu(k); await closeMenu(k); return m; }
    async function menuAction(k, entry) {
        const items = await menu(k);
        if (!items.includes(entry)) { await closeMenu(k); return {items, absent: true}; }
        await page.getByRole('menuitem', {name: entry, exact: true}).click();
        await idle(page);
        return {items};
    }
    const legacy = (formId) => page.getByRole('dialog').filter({has: page.locator(`form#${formId}`)}).last();
    async function mceReady(scopeSel) {
        await page.waitForFunction((sel) => {
            const ta = [...document.querySelectorAll(`${sel} textarea`)].pop();
            const mce = window.tinyMCE || window.tinymce;
            return !ta || !!(mce && mce.get(ta.id) && mce.get(ta.id).initialized);
        }, scopeSel, {timeout: 20000}).catch(() => {});
    }
    const notices = async () => (await page.locator('.app__notifications .pkpNotification').allInnerTexts().catch(() => [])).map((x) => flat(x, 300));

    // ---- the Review Details / Modify Review windows (locators from Ks29) -------
    const rd = () => page.getByRole('dialog', {name: /^Review Details:/}).last();
    const mr = () => page.getByRole('dialog', {name: 'Modify Review'}).last();
    async function settleRD() {
        await rd().waitFor({timeout: T});
        await page.waitForFunction(() => {
            const dd = [...document.querySelectorAll('[role=dialog]')].filter((x) => /^Review Details:/.test(x.getAttribute('aria-label') || '')).pop()
                || [...document.querySelectorAll('[role=dialog]')].filter((x) => /Review Details:/.test(x.innerText)).pop();
            if (!dd) return false;
            const b = [...dd.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Modify Review');
            return b && !b.disabled;
        }, null, {timeout: T}).catch(() => log('RD not settled'));
        await idle(page);
        await sleep(1000); // "Reviewer Files" fills after its own GET (screen-notes ccI28)
        await idle(page);
    }
    async function readWin(d) {
        return d.evaluate((el) => {
            const txt = el.innerText;
            const groups = [...el.querySelectorAll('fieldset, [role=group]')];
            const ciGroup = groups.find((g) => /^\s*Competing Interests/.test(g.innerText)) || null;
            let ci = null;
            if (ciGroup) {
                ci = {text: ciGroup.innerText.replace(/\s+\n/g, '\n').trim().slice(0, 600),
                    radios: [...ciGroup.querySelectorAll('input[type=radio]')].map((r) => ({value: r.value, checked: r.checked}))};
            } else if (/Competing Interests/.test(txt)) {
                const i = txt.indexOf('Competing Interests'); ci = {textOnly: txt.slice(i, i + 300)};
            }
            const mce = window.tinymce || window.tinyMCE;
            const editors = mce ? mce.get().filter((e) => el.contains(e.getContainer && e.getContainer())).map((e) => ({id: e.id, init: !!e.initialized, visible: !!(e.getContainer() && e.getContainer().getClientRects().length), content: (e.getContent() || '').slice(0, 200)})) : [];
            const btns = [...el.querySelectorAll('button')].filter((b) => b.getClientRects().length).map((b) => ({t: (b.innerText || b.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim(), disabled: b.disabled})).filter((b) => b.t);
            const selects = [...el.querySelectorAll('select')].map((s) => ({name: s.name, value: s.value, selected: s.selectedOptions[0] ? s.selectedOptions[0].text : null, options: [...s.options].map((o) => o.text).slice(0, 10)}));
            const textareas = [...el.querySelectorAll('textarea')].filter((x) => x.getClientRects().length).map((x) => ({id: x.id, name: x.name, value: x.value.slice(0, 200)}));
            const dated = (txt.match(/(Request Sent|Reviewer Reminded|Request Accepted|Request Declined|Request Resent|Review Submitted|Review Completed|Reviewer Thanked|Review Due|Response Due)[^:\n]*:[^\n]*/g) || []).slice(0, 6);
            return {textLen: txt.length, dated, ci, editors, buttons: btns, selects, textareas,
                lastModified: (txt.match(/Last modified by[^\n]*/) || [null])[0],
                headings: [...el.querySelectorAll('h1,h2,h3,legend')].map((h) => h.innerText.replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 30)};
        });
    }
    async function openRD(k, via = 'auto') {
        const hasRead = await row(k).getByRole('button', {name: 'Read Review', exact: true}).count();
        if (via === 'button' || (via === 'auto' && hasRead)) await row(k).getByRole('button', {name: 'Read Review', exact: true}).click();
        else { const a = await menuAction(k, 'Review Details'); if (a.absent) throw new Error(`no Review Details for ${k}: ${a.items}`); }
        await settleRD();
    }
    async function closeRD() { const d = rd(); await d.getByRole('button', {name: 'Cancel', exact: true}).last().click().catch(() => {}); await d.waitFor({state: 'hidden', timeout: 15000}).catch(() => {}); await sleep(1200); await idle(page); }
    async function rdRead(label) {
        const r = await readWin(rd());
        const sn = await snap(label);
        return {...r, snap: sn.name, notices: sn.s.notices, text: flat(sn.s.text && sn.s.text.dialog, 2500)};
    }
    async function openMR() {
        await rd().getByRole('button', {name: 'Modify Review', exact: true}).click();
        const conf = page.locator('[data-cy="dialog"]').filter({hasText: 'Modify this review?'}).last();
        await conf.waitFor({timeout: T});
        const confText = flat(await conf.innerText(), 400);
        const confButtons = (await conf.getByRole('button').allInnerTexts()).map((x) => x.trim());
        await conf.getByRole('button', {name: 'Modify Review', exact: true}).click();
        await mr().waitFor({timeout: T});
        await mr().getByRole('button', {name: 'Save Changes', exact: true}).waitFor({timeout: T}).catch(() => {});
        await page.waitForFunction(() => { const mce = window.tinymce || window.tinyMCE; const eds = mce ? mce.get() : []; return eds.filter((e) => e.getContainer() && e.getContainer().getClientRects().length).every((e) => e.initialized); }, null, {timeout: T}).catch(() => {});
        await idle(page); await sleep(600);
        return {confText, confButtons};
    }
    async function mrRead(label) {
        const r = await readWin(mr());
        const sn = await snap(label);
        return {...r, snap: sn.name, text: flat(sn.s.text && sn.s.text.dialog, 2500)};
    }
    const saveBtn = () => mr().getByRole('button', {name: 'Save Changes', exact: true});
    async function typeMce(field, text) {
        const id = await page.waitForFunction((f) => {
            const mce = window.tinymce || window.tinyMCE; if (!mce) return false;
            const e = mce.get().find((x) => x.id.includes(`-${f}-`) && x.getContainer() && x.getContainer().getClientRects().length);
            return e && e.initialized ? e.id : false;
        }, field, {timeout: T}).then((h) => h.jsonValue()).catch(() => null);
        if (!id) return {typed: false, reason: `no initialised ${field} editor`};
        const body = page.frameLocator(`iframe[id="${id}_ifr"]`).locator('body');
        await body.click();
        await page.keyboard.press('Control+A'); await page.keyboard.press('Delete');
        if (text) await body.pressSequentially(text, {delay: 10});
        await sleep(500);
        const content = await page.evaluate((i) => (window.tinymce || window.tinyMCE).get(i).getContent(), id);
        return {typed: true, id, content};
    }
    const ciRadio = (d, value) => {
        const l = d.locator(`input[type=radio][value="${value}"]`);
        return {check: async () => { try { await l.check({timeout: 5000}); } catch (_) { await l.check({force: true}); } }, locator: l};
    };
    // Press "Save Changes"; a save that leaves the window open is read as refused.
    async function saveMR() {
        const t0 = Date.now();
        const btn = saveBtn();
        const enabledBefore = !(await btn.isDisabled().catch(() => true));
        if (!enabledBefore) return {enabledBefore, puts: [], closed: false};
        await btn.click({timeout: 10000});
        const closed = await mr().waitFor({state: 'hidden', timeout: 8000}).then(() => true).catch(() => false);
        await sleep(1200); await idle(page);
        const out = {enabledBefore, puts: putsSince(t0), closed, notices: await notices()};
        if (!closed) {
            out.errors = (await mr().locator('.pkpFieldError, .pkpFormErrors, .pkpFormError').allInnerTexts().catch(() => [])).map((x) => flat(x, 200)).filter(Boolean);
            out.saveDisabledAfter = await btn.isDisabled().catch(() => null);
            out.refusedSnap = (await snap('refused')).name;
        }
        return out;
    }
    async function cancelMR() {
        await mr().getByRole('button', {name: 'Cancel', exact: true}).last().click();
        await sleep(1200);
        const warn = page.getByRole('dialog').filter({hasText: 'The data on this form has changed'}).last();
        if (await warn.isVisible().catch(() => false)) {
            const buttons = (await warn.getByRole('button').allInnerTexts()).map((x) => x.trim());
            return {warning: flat(await warn.innerText(), 300), buttons};
        }
        return {warning: null, closed: !(await mr().isVisible().catch(() => false))};
    }
    async function answerWarning(btn) {
        const warn = page.getByRole('dialog').filter({hasText: 'The data on this form has changed'}).last();
        await warn.getByRole('button', {name: btn, exact: true}).click();
        await sleep(1200); await idle(page);
        return {mrOpen: await mr().isVisible().catch(() => false)};
    }
    async function leaveMR() { if (await mr().isVisible().catch(() => false)) { const c = await cancelMR(); if (c.warning) await answerWarning('Yes'); return c; } return null; }
    async function activityLog(label) {
        await page.getByRole('button', {name: 'Activity Log', exact: true}).click();
        const lg = page.getByRole('dialog').filter({hasText: 'Activity Log & Notes'}).last();
        await lg.getByRole('row').first().waitFor({timeout: T}).catch(() => {});
        await idle(page); await sleep(600);
        const lines = (await lg.locator('tr.gridRow').allInnerTexts().catch(() => [])).map((x) => flat(x, 300));
        const sn = label ? await snap(label) : null;
        await lg.getByRole('button', {name: 'Close', exact: true}).first().click().catch(() => {});
        await lg.waitFor({state: 'hidden', timeout: 15000}).catch(() => {});
        await sleep(900);
        return {lines, snap: sn && sn.name};
    }
    let prevLog = null;
    async function logDiff(label) {
        const now = await activityLog(label);
        const before = prevLog ? [...prevLog] : [];
        const added = [];
        for (const l of now.lines) { const i = before.indexOf(l); if (i >= 0) before.splice(i, 1); else added.push(l); }
        prevLog = now.lines;
        return {added, total: now.lines.length, snap: now.snap};
    }
    async function history(k, label) {
        await menuAction(k, 'History');
        const h = page.getByRole('dialog').filter({has: page.locator('.pkp_review_history')}).last();
        await h.waitFor({timeout: T}).catch(() => {});
        await idle(page);
        const lines = (await h.locator('.pkp_review_history > div').allInnerTexts().catch(() => [])).map((x) => flat(x, 120));
        const sn = await snap(label);
        await h.getByRole('button', {name: 'Close', exact: true}).first().click().catch(() => {});
        await h.waitFor({state: 'hidden', timeout: 10000}).catch(() => {});
        await sleep(800);
        return {lines, snap: sn.name};
    }
    async function pickDate(scope, prefix, n) {
        const date = dayObj(n);
        await scope.locator(`input.datepicker[id^="${prefix}"]`).click();
        const picker = page.locator('#ui-datepicker-div');
        await picker.waitFor({timeout: T});
        await picker.locator('select.ui-datepicker-year').selectOption(String(date.getFullYear()));
        await picker.locator('select.ui-datepicker-month').selectOption(String(date.getMonth()));
        await picker.locator('td:not(.ui-datepicker-other-month) a').filter({hasText: new RegExp(`^${date.getDate()}$`)}).first().click();
        await picker.waitFor({state: 'hidden', timeout: T}).catch(() => {});
    }
    async function editDates(k, resp, rev) {
        await menuAction(k, 'Edit');
        const m = legacy('editReviewForm');
        await m.locator('input[name="isReviewPubliclyVisible"]').waitFor({timeout: T});
        await idle(page);
        if (resp != null) await pickDate(m, 'responseDueDate', resp);
        if (rev != null) await pickDate(m, 'reviewDueDate', rev);
        await m.getByRole('button', {name: 'OK', exact: true}).click();
        await m.locator('form#editReviewForm').waitFor({state: 'hidden', timeout: 20000}).catch(() => log('edit form still open'));
        await sleep(1000); await idle(page);
    }
    async function pickRec(label) {
        const sel = mr().locator('select[name="reviewerRecommendationId"]');
        await sel.selectOption({label});
        await sleep(500);
        return sel.evaluate((x) => x.selectedOptions[0].text);
    }

    // One "Modify Review" drive on a row of SA: the row and menu, the view window, the edit window, the
    // action, and everything after (view window, refetched assignment, row, menu, log rows, stored row).
    async function drive(k, label, action, {history: wantHistory = false} = {}) {
        const out = {};
        const t0 = Date.now();
        out.rowBefore = await rowRead(k);
        out.menuBefore = await menuOf(k);
        out.dbBefore = dbRA(k);
        await openRD(k, 'menu');
        const vb = await rdRead(`${label}-${k}-view-before`);
        out.viewBefore = {dated: vb.dated, ci: vb.ci, buttons: vb.buttons, headings: vb.headings, snap: vb.snap, text: flat(vb.text, 1600)};
        out.getsOpen = getsOf(k, t0);
        out.confirm = await openMR();
        const eb = await mrRead(`${label}-${k}-edit-open`);
        out.editOpen = {selects: eb.selects, editors: eb.editors, textareas: eb.textareas, ci: eb.ci, buttons: eb.buttons, headings: eb.headings, snap: eb.snap, text: flat(eb.text, 1800)};
        const t1 = Date.now();
        out.action = await action();
        out.mrOpenAfter = await mr().isVisible().catch(() => false);
        if (out.mrOpenAfter) out.leave = await leaveMR();
        await settleRD();
        const va = await rdRead(`${label}-${k}-view-after`);
        out.viewAfter = {dated: va.dated, lastModified: va.lastModified, ci: va.ci, buttons: va.buttons, snap: va.snap, notices: va.notices, text: flat(va.text, 1600)};
        out.getsAfterSave = getsOf(k, t1);
        await closeRD();
        out.rowAfter = await rowRead(k);
        out.menuAfter = await menuOf(k);
        out.log = await logDiff(`${label}-${k}-log`);
        await page.reload(); await idle(page); await row(k).waitFor({timeout: T}).catch(() => {});
        out.rowAfterReload = await rowRead(k);
        if (wantHistory) out.history = await history(k, `${label}-${k}-history`);
        out.dbAfter = dbRA(k);
        return out;
    }

    // The required review-form question is a rich-text box ("reviewDetailsForm-<elementId>-control"): saved
    // empty first (refused), then answered ({OJS}: with a recommendation) and saved.
    async function formAction() {
        const empty = await saveMR();
        const ed = await page.evaluate(() => { const mce = window.tinymce || window.tinyMCE; const e = mce && mce.get().find((x) => /^reviewDetailsForm-\d+-control$/.test(x.id) && x.getContainer() && x.getContainer().getClientRects().length); return e ? e.id.split('-')[1] : null; });
        const typed = ed ? await typeMce(ed, 'S13653 fQ answered by the editor.') : null;
        await mr().getByRole('heading').first().click().catch(() => {});
        const rec = REC ? await pickRec(REC) : null;
        return {empty, typed, rec, saveEnabledAfter: !(await saveBtn().isDisabled().catch(() => true)), save: await saveMR()};
    }

    try {
        // ---- sfl: the reviewer's "Save for Later" on step 3 (and an on-screen accept: the mail control) ----
        if (on('sfl')) await sect('sfl', async () => {
            const {ReviewWizardPage} = require(path.resolve(__dirname, '../../../pages/ReviewerPages.js'));
            await as('sfl', st.P);
            const w = new ReviewWizardPage(page, st.P, {privateBoxLabel: isOMP ? 'For editor only' : 'For editor'});
            await w.goto(st.SA.id); await idle(page);
            st.sflAcceptAt = new Date().toISOString(); save();
            await w.accept();
            await w.continueToStep3();
            await w.typeComments('S13653 sfl comment saved for later.');
            if (REC) await w.chooseRecommendation('Revisions Required');
            const t0 = Date.now();
            await w.saveForLater();
            const s1 = await snap('sfl-step3-saved');
            await page.reload(); await idle(page);
            await w.expectStep(3).catch(() => {});
            await sleep(1500);
            const back = await page.evaluate(() => {
                const mce = window.tinymce || window.tinyMCE;
                const e = mce && mce.get().find((x) => /^comments/.test(x.id) && !/Private/.test(x.id));
                const sel = document.querySelector('select#reviewerRecommendationId');
                return {comment: e ? e.getContent() : null, rec: sel && sel.selectedOptions[0] ? sel.selectedOptions[0].text : null};
            });
            const s2 = await snap('sfl-step3-reloaded');
            fact('sfl reviewer', {notices: s1.s.notices, snap: s1.name, reloaded: back, snap2: s2.name, db: dbRA('sfl'), comments: db(`select comment_type, viewable, left(comments,80) from submission_comments where assoc_id=${st.ra.sfl}`), ms: Date.now() - t0});
        });

        // ---- mod: the editor (manager level) on SA ----
        if (on('mod')) await sect('mod', async () => {
            await as('ed', st.P);
            await openWf(st.SA, 'n0U');
            const tbl = await snap('mod-table-start');
            prevLog = (await activityLog('mod-log-start')).lines;
            fact('mod start', {snap: tbl.name, logRows: prevLog.length});
            const run = async (k, label, action, opts) => {
                try { const r = await drive(k, label, action, opts); fact(`${label} ${k}`, r); } catch (e) {
                    fact(`${label} ${k} FAILED`, String(e.message).slice(0, 500));
                    await leaveMR().catch(() => {}); await closeRD().catch(() => {}); await openWf(st.SA, k);
                }
            };
            // (1) nothing entered: unanswered, accepted
            for (const k of ['n0U', 'n0A']) await run(k, 'empty', async () => saveMR(), {history: true});
            if (RUN === 'r1') {
                await openWf(st.SA, 'n0U');
                await loc(page, 'Reviewers row "More Actions"', row('n0U').getByRole('button', {name: /More Actions/}));
            }
            // (2) a comment typed and deleted again ({OJS}: then a recommendation, the save the select requires)
            for (const k of ['tdU', 'tdA']) await run(k, 'typeddel', async () => {
                const typed = await typeMce('comments', 'S13653 typed then deleted.');
                const deleted = await typeMce('comments', '');
                await mr().getByRole('heading').first().click().catch(() => {});
                await sleep(400);
                const s1 = await saveMR();
                let s2 = null; let rec = null;
                if (!isOMP && !s1.closed) { rec = await pickRec(REC); s2 = await saveMR(); }
                return {typed, deleted, save: s1, rec, save2: s2};
            }, {history: true});
            // (3) only the competing-interests answer
            for (const k of ['ciU', 'ciA']) await run(k, 'cionly', async () => {
                await ciRadio(mr(), 'hasCompetingInterests').check(); await sleep(800);
                const typed = await typeMce('competingInterests', CI_ED);
                const e = await mrRead(`cionly-${k}-filled`);
                return {typed, ci: e.ci, save: await saveMR()};
            }, {history: true});
            // (4) {OJS} only a recommendation (A41)
            if (!isOMP) await run('roU', 'reconly', async () => ({rec: await pickRec(REC), save: await saveMR()}), {history: true});
            // (5) a comment ({OJS}: refused first without a recommendation): Rule 14d proper
            for (const k of ['cU', 'cA']) await run(k, 'comment', async () => {
                const typed = await typeMce('comments', `S13653 ${k} entered by the editor.`);
                let refused = null; let rec = null;
                if (!isOMP) {
                    refused = await saveMR();
                    if (refused.closed) return {typed, save: refused};
                    rec = await pickRec(REC);
                    refused.saveEnabledAfterPick = !(await saveBtn().isDisabled().catch(() => true));
                }
                return {typed, refused, rec, save: await saveMR()};
            }, {history: true});
            // (6) the reviewer's "Save for Later" draft, saved by the editor with nothing changed
            await run('sfl', 'sfl', async () => saveMR(), {history: true});
            // (7) declined: refused (A30); re-sent: the window on "Request Resent", then saved
            await run('dC', 'declined', async () => {
                const typed = await typeMce('comments', 'S13653 dC entered by the editor.');
                const rec = REC ? await pickRec(REC) : null;
                return {typed, rec, save: await saveMR()};
            });
            try {
                await openWf(st.SA, 'dE');
                await menuAction('dE', 'Resend Review Request');
                const rm = legacy('resendRequestReviewerForm');
                await rm.waitFor({timeout: T}); await mceReady('#resendRequestReviewerForm'); await idle(page);
                await rm.getByRole('button', {name: 'Resend Review Request', exact: true}).click();
                await rm.locator('form#resendRequestReviewerForm').waitFor({state: 'hidden', timeout: 20000}).catch(() => {});
                await sleep(1200); await idle(page);
                prevLog = (await activityLog(null)).lines;
            } catch (e) { fact('resend dE FAILED', String(e.message).slice(0, 300)); }
            await run('dE', 'resent', async () => {
                const typed = await typeMce('comments', 'S13653 dE entered by the editor.');
                const rec = REC ? await pickRec(REC) : null;
                return {typed, rec, save: await saveMR()};
            }, {history: true});
            // (8) a reminded, unanswered request: the dated line, a star, Mark as Complete; no save
            try {
                await openWf(st.SA, 'rmU');
                await editDates('rmU', -1, null);
                await row('rmU').getByRole('button', {name: 'Send Reminder', exact: true}).click();
                const m = legacy('sendReminderForm');
                await m.getByText('Review Schedule').waitFor({timeout: T}); await mceReady('#sendReminderForm'); await idle(page);
                await m.locator('form#sendReminderForm').getByRole('button', {name: 'Send Reminder', exact: true}).click();
                await m.locator('form#sendReminderForm').waitFor({state: 'hidden', timeout: 20000}).catch(() => {});
                await sleep(1200); await idle(page);
                const rb = await rowRead('rmU');
                await openRD('rmU', 'menu');
                const v = await rdRead('remind-rmU-view');
                const star = rd().locator('input[name="quality"][value="3"]');
                await star.check({force: true}).catch(async () => { await rd().locator('label').filter({has: star}).click(); });
                const toast = await page.getByText('Reviewer rating saved').first().waitFor({timeout: 15000}).then(() => true).catch(() => false);
                const vs = await snap('remind-rmU-star');
                await closeRD();
                fact('remind rmU', {rowBefore: rb, view: {dated: v.dated, buttons: v.buttons, ci: v.ci, snap: v.snap, text: flat(v.text, 1600)}, starToast: toast, starNotices: vs.s.notices, rowAfter: await rowRead('rmU'), db: dbRA('rmU'), quality: db(`select quality from review_assignments where review_id=${st.ra.rmU}`)});
            } catch (e) { fact('remind rmU FAILED', String(e.message).slice(0, 400)); await closeRD().catch(() => {}); }
            // (9) an accepted request whose window is only opened
            try {
                await openWf(st.SA, 'vA');
                const rb = await rowRead('vA');
                await openRD('vA', 'menu');
                const v = await rdRead('view-vA');
                await closeRD();
                fact('view vA', {rowBefore: rb, view: {dated: v.dated, buttons: v.buttons, ci: v.ci, snap: v.snap, text: flat(v.text, 1600)}, rowAfter: await rowRead('vA'), db: dbRA('vA')});
            } catch (e) { fact('view vA FAILED', String(e.message).slice(0, 400)); await closeRD().catch(() => {}); }
            // (10) a request carrying a required review form
            await openWf(st.SA, 'fQ');
            await run('fQ', 'form', formAction, {history: true});
            // (11) a submitted review (Rule 14b): cancel with nothing typed; typed then the warning "No", "Yes"; then a saved edit
            try {
                await openWf(st.SA, 'sS');
                const out = {rowBefore: await rowRead('sS'), dbBefore: dbRA('sS')};
                await openRD('sS');
                const v0 = await rdRead('submitted-sS-view-before');
                out.view0 = {dated: v0.dated, ci: v0.ci, buttons: v0.buttons, headings: v0.headings, snap: v0.snap, text: flat(v0.text, 1600)};
                out.confirm = await openMR();
                const e0 = await mrRead('submitted-sS-edit-open');
                out.edit0 = {selects: e0.selects, editors: e0.editors, ci: e0.ci, buttons: e0.buttons, headings: e0.headings, snap: e0.snap, text: flat(e0.text, 1800)};
                out.cancelNothing = await cancelMR();
                await settleRD();
                await openMR();
                await typeMce('comments', 'S13653 sS typed and dropped.');
                out.cancelTyped = await cancelMR();
                out.warnSnap = (await snap('submitted-sS-warning')).name;
                if (out.cancelTyped.warning) {
                    out.answerNo = await answerWarning('No');
                    const c2 = await cancelMR();
                    out.cancelTyped2 = c2;
                    if (c2.warning) out.answerYes = await answerWarning('Yes');
                }
                await settleRD();
                await openMR();
                const e1 = await mrRead('submitted-sS-edit-reopened');
                out.reopenComment = (e1.editors.find((e) => /-comments-/.test(e.id)) || {}).content;
                const t1 = Date.now();
                out.typed = await typeMce('comments', 'S13653 sS revised by the editor.');
                out.save = await saveMR();
                await settleRD();
                const v1 = await rdRead('submitted-sS-view-after');
                out.view1 = {dated: v1.dated, lastModified: v1.lastModified, snap: v1.snap, notices: v1.notices, text: flat(v1.text, 1600)};
                out.getsAfterSave = getsOf('sS', t1);
                await closeRD();
                out.rowAfter = await rowRead('sS');
                out.log = await logDiff('submitted-sS-log');
                out.dbAfter = dbRA('sS');
                fact('submitted sS', out);
            } catch (e) { fact('submitted sS FAILED', String(e.message).slice(0, 400)); await leaveMR().catch(() => {}); await closeRD().catch(() => {}); }
            // (12) "Publicly Show Reviewer Comments" (pP): before completion asks nothing; after it asks
            try {
                await openWf(st.SA, 'pP');
                await menuAction('pP', 'Edit');
                const em = legacy('editReviewForm');
                await em.locator('input[name="isReviewPubliclyVisible"]').waitFor({timeout: T});
                await em.locator('input[name="isReviewPubliclyVisible"]').check();
                await em.getByRole('button', {name: 'OK', exact: true}).click();
                await em.locator('form#editReviewForm').waitFor({state: 'hidden', timeout: 20000}).catch(() => {});
                await sleep(1000); await idle(page);
                const out = {};
                await openRD('pP');
                await openMR();
                await typeMce('comments', 'S13653 pP edit before completion.');
                const tA = Date.now();
                await saveBtn().click();
                out.askedBefore = await page.locator('[data-cy="dialog"]').filter({hasText: 'Save changes to this review?'}).waitFor({timeout: 4000}).then(() => true).catch(() => false);
                await mr().waitFor({state: 'hidden', timeout: 10000}).catch(() => {});
                out.before = {mrOpen: await mr().isVisible().catch(() => false), puts: putsSince(tA)};
                await sleep(800); await idle(page);
                await settleRD();
                await rd().getByRole('button', {name: 'Mark as Complete', exact: true}).click();
                const mdlg = page.locator('[data-cy="dialog"]').filter({hasText: 'Mark this review as complete?'}).last();
                await mdlg.waitFor({timeout: T});
                out.markDialog = flat(await mdlg.innerText(), 500);
                await mdlg.getByRole('button', {name: 'Mark as Complete', exact: true}).click();
                await sleep(1500); await idle(page);
                await openMR();
                await typeMce('comments', 'S13653 pP edit after completion.');
                const t1 = Date.now();
                await saveBtn().click();
                const sdlg = page.locator('[data-cy="dialog"]').filter({hasText: 'Save changes to this review?'}).last();
                out.askedAfter = await sdlg.waitFor({timeout: 8000}).then(() => true).catch(() => false);
                out.askText = out.askedAfter ? flat(await sdlg.innerText(), 500) : null;
                out.askButtons = out.askedAfter ? (await sdlg.getByRole('button').allInnerTexts()).map((x) => x.trim()) : null;
                out.askSnap = (await snap('public-pP-ask')).name;
                if (out.askedAfter) {
                    await sdlg.getByRole('button', {name: 'Cancel', exact: true}).click(); await sleep(1200);
                    out.afterCancel = {mrOpen: await mr().isVisible().catch(() => false), puts: putsSince(t1)};
                    const t2 = Date.now();
                    await saveBtn().click();
                    await sdlg.waitFor({timeout: 8000}).catch(() => {});
                    await sdlg.getByRole('button', {name: 'Save Changes', exact: true}).click().catch(() => {});
                    await mr().waitFor({state: 'hidden', timeout: 20000}).catch(() => {});
                    await sleep(1200); await idle(page);
                    out.afterSave = {mrOpen: await mr().isVisible().catch(() => false), puts: putsSince(t2)};
                }
                await leaveMR();
                await settleRD();
                const pv = await rdRead('public-pP-view-after');
                out.view = {dated: pv.dated, lastModified: pv.lastModified, snap: pv.snap, text: flat(pv.text, 900)};
                await closeRD();
                out.log = await logDiff('public-pP-log');
                fact('public pP', out);
            } catch (e) { fact('public pP FAILED', String(e.message).slice(0, 400)); await leaveMR().catch(() => {}); await closeRD().catch(() => {}); }
            // (13) the edit window's "Upload" (uL), then "Cancel"
            try {
                await openWf(st.SA, 'uL');
                await openRD('uL');
                await openMR();
                const up = {};
                up.uploadButtons = await mr().getByRole('button', {name: 'Upload', exact: true}).count();
                up.viewUploadButtons = await rd().getByRole('button', {name: 'Upload', exact: true}).count();
                if (up.uploadButtons) {
                    await mr().getByRole('button', {name: 'Upload', exact: true}).first().click();
                    const wz = page.getByRole('dialog').filter({has: page.getByRole('tab', {name: '1. Upload File'})}).last();
                    await wz.waitFor({timeout: T}).catch(() => {});
                    up.tabs = (await wz.getByRole('tab').allInnerTexts().catch(() => [])).map((x) => x.trim());
                    await snap('upload-uL-step1');
                    await page.locator('input[type="file"]').last().setInputFiles({name: 's13653-editor-upload.txt', mimeType: 'text/plain', buffer: Buffer.from('S13653 file uploaded by the editor for the reviewer.')});
                    await wz.getByRole('button', {name: /Change File/}).waitFor({timeout: T}).catch(() => {});
                    const genre = wz.locator('select[id^="genreId"]');
                    if (await genre.count()) await genre.selectOption({index: 1}).catch(() => {});
                    await wz.getByRole('button', {name: 'Continue', exact: true}).click();
                    await sleep(1500); await idle(page);
                    await wz.getByRole('button', {name: 'Continue', exact: true}).click();
                    await sleep(1500); await idle(page);
                    await wz.getByRole('button', {name: 'Complete', exact: true}).click();
                    await wz.waitFor({state: 'hidden', timeout: T}).catch(() => {});
                    await sleep(1500); await idle(page);
                    up.editFiles = flat(await mr().evaluate((el) => { const t = el.innerText; const i = t.indexOf('Reviewer Files'); return i >= 0 ? t.slice(i, i + 300) : null; }), 300);
                    up.cancel = await cancelMR();
                    if (up.cancel.warning) up.cancel.answer = await answerWarning('Yes');
                    await settleRD();
                    up.viewFiles = flat(await rd().evaluate((el) => { const t = el.innerText; const i = t.indexOf('Reviewer Files'); return i >= 0 ? t.slice(i, i + 300) : null; }), 300);
                    up.viewSnap = (await snap('upload-uL-view-after')).name;
                } else await leaveMR();
                await closeRD();
                up.log = await logDiff('upload-uL-log');
                up.db = dbRA('uL');
                fact('upload uL', up);
            } catch (e) { fact('upload uL FAILED', String(e.message).slice(0, 400)); await leaveMR().catch(() => {}); await closeRD().catch(() => {}); }
            // every row after a reload
            await openWf(st.SA, 'n0U');
            const rows = {};
            for (const k of P_REVS) rows[k] = await rowRead(k);
            const tsn = await snap('mod-table-end');
            fact('mod rows at end', {rows, snap: tsn.name});
        });

        // ---- form2 (opt-in, PHASES=form2): the review-form drive alone on the run's state (fQ still unanswered) ----
        if (on('form2')) await sect('form2', async () => {
            await as('ed', st.P);
            await openWf(st.SA, 'fQ');
            prevLog = (await activityLog(null)).lines;
            try { fact('form2 fQ', await drive('fQ', 'form2', formAction, {history: true})); } catch (e) { fact('form2 fQ FAILED', String(e.message).slice(0, 400)); }
        });

        // ---- se: the Section/Series Editor (sub-editor level) ----
        if (on('se')) await sect('se', async () => {
            await as('se', st.P);
            await openWf(st.SA, 'seU');
            prevLog = (await activityLog(null)).lines;
            try {
                const r = await drive('seU', 'se', async () => {
                    const s1 = await saveMR();
                    let rec = null; let s2 = null;
                    if (!isOMP && !s1.closed) { rec = await pickRec(REC); s2 = await saveMR(); }
                    return {save: s1, rec, save2: s2};
                }, {history: true});
                fact('se seU', r);
            } catch (e) { fact('se seU FAILED', String(e.message).slice(0, 400)); }
        });

        // ---- rside: each reviewer's own list and review page ----
        if (on('rside')) await sect('rside', async () => {
            const VIEWS = ['reviewer-action-required', 'reviewer-assignments-all', 'reviewer-assignments-completed'];
            for (const k of ['n0U', 'n0A', 'tdU', 'tdA', 'ciU', 'ciA', 'roU', 'cU', 'cA', 'sfl', 'seU', 'rmU', 'vA', 'fQ', 'dE']) {
                if (isOMP && k === 'roU') continue;
                try {
                    await as(k, st.P);
                    const views = {};
                    for (const v of VIEWS) {
                        const listed = page.waitForResponse((r) => /\/_submissions\/reviewerAssignments\b/.test(r.url()) && r.request().method() === 'GET', {timeout: T}).catch(() => null);
                        await page.goto(`/index.php/${st.P}/dashboard/reviewAssignments?currentViewId=${v}`);
                        await listed; await idle(page); await sleep(800);
                        const vr = page.locator('table tbody tr').filter({hasText: st.SA.title}).first();
                        views[v] = {row: await vr.count() ? flat(await vr.innerText(), 300) : '(no row)', buttons: await vr.count() ? (await vr.getByRole('button').or(vr.getByRole('link')).allInnerTexts()).map((x) => x.trim()) : []};
                        if (v === 'reviewer-assignments-all') views[v].snap = (await snap(`rside-${k}-list-all`)).name;
                    }
                    await page.goto(`/index.php/${st.P}/reviewer/submission/${st.SA.id}`); await idle(page); await sleep(1500); await idle(page);
                    const tabs = await page.getByRole('tab').evaluateAll((els) => els.map((e) => ({t: e.innerText.trim(), selected: e.getAttribute('aria-selected'), disabled: e.getAttribute('aria-disabled') || (e.closest('li') && e.closest('li').className.includes('ui-state-disabled')) || null})));
                    const btns = await page.locator('main button:visible, main input[type=submit]:visible').evaluateAll((els) => els.map((b) => ({t: (b.innerText || b.value || '').trim(), disabled: b.disabled})).filter((b) => b.t));
                    const rw = await snap(`rside-${k}-review-page`);
                    fact(`rside ${k}`, {views, page: {url: page.url(), tabs, buttons: btns, snap: rw.name, text: flat(rw.s.text && rw.s.text.main, 700)}});
                } catch (e) { fact(`rside ${k} FAILED`, String(e.message).slice(0, 300)); }
            }
        });

        // ---- mail: what reached the reviewers and the assigned Section/Series Editor since the seed ----
        if (on('mail')) await sect('mail', async () => {
            const out = {};
            for (const k of ['se', 'n0U', 'n0A', 'tdU', 'ciU', 'cU', 'cA', 'sfl', 'seU', 'dE', 'rmU', 'roU']) {
                const r = await app.mail._search({to: `${u[k]}@mail.test`, since: st.seededAt}).catch((e) => ({error: String(e.message)}));
                out[k] = r.error ? r : (r.messages || []).map((m) => flat(m.Subject, 160));
            }
            fact('mail', out);
        });

        // ---- s21: scenario 21 on Q, the manager ----
        if (on('s21')) await sect('s21', async () => {
            const s = st.SQ;
            const out = {};
            await as('mg', st.Q);
            await openWf(s, 'q1');
            out.rowsStart = {q1: await rowRead('q1'), q2: await rowRead('q2'), q3: await rowRead('q3')};
            prevLog = (await activityLog(null)).lines;
            // the submitted review
            await openRD('q1', 'button');
            const v1 = await rdRead('s21-q1-read');
            out.q1read = {ci: v1.ci, dated: v1.dated, snap: v1.snap, text: flat(v1.text, 1400)};
            await openMR();
            const e1 = await mrRead('s21-q1-modify');
            out.q1modify = {ci: e1.ci, snap: e1.snap};
            await ciRadio(mr(), 'hasCompetingInterests').check(); await sleep(800);
            out.q1typed = await typeMce('competingInterests', CI_ED);
            out.q1save = await saveMR();
            if (out.q1save.closed) { await settleRD(); const v2 = await rdRead('s21-q1-after'); out.q1after = {ci: v2.ci, lastModified: v2.lastModified, snap: v2.snap, text: flat(v2.text, 1400)}; } else out.q1leave = await leaveMR();
            await closeRD();
            out.q1row = await rowRead('q1');
            out.q1log = await logDiff('s21-q1-log');
            // the press's unanswered request: nothing entered, then the answer alone ({OJS}: the control)
            await openRD('q3', 'menu');
            out.q3view = (await rdRead('s21-q3-view')).dated;
            await openMR();
            out.q3emptyEdit = (await mrRead('s21-q3-edit')).ci;
            out.q3empty = await saveMR();
            if (!out.q3empty.closed) out.q3emptyLeave = await leaveMR();
            await settleRD();
            const q3a = await rdRead('s21-q3-after-empty');
            out.q3afterEmpty = {dated: q3a.dated, lastModified: q3a.lastModified, buttons: q3a.buttons, snap: q3a.snap};
            await closeRD();
            out.q3rowAfterEmpty = await rowRead('q3');
            out.q3dbAfterEmpty = dbRA('q3');
            out.q3logEmpty = await logDiff('s21-q3-log-empty');
            await openRD('q3', 'auto');
            await openMR();
            await ciRadio(mr(), 'hasCompetingInterests').check(); await sleep(800);
            out.q3typed = await typeMce('competingInterests', CI_ED);
            out.q3ci = await saveMR();
            if (!out.q3ci.closed) out.q3ciLeave = await leaveMR();
            await settleRD();
            await closeRD();
            out.q3rowAfterCI = await rowRead('q3');
            out.q3dbAfterCI = dbRA('q3');
            out.q3logCI = await logDiff('s21-q3-log-ci');
            // the unanswered request
            await openRD('q2', 'menu');
            const v3 = await rdRead('s21-q2-view');
            out.q2view = {ci: v3.ci, dated: v3.dated, snap: v3.snap};
            await closeRD();
            // the policy emptied
            const {ReviewSettingsPage} = require(path.resolve(__dirname, '../../../pages/ReviewSettingsPages.js'));
            const sp = new ReviewSettingsPage(page, st.Q);
            await sp.goto('Reviewer Guidance'); await idle(page);
            const body = page.frameLocator('iframe[id^="reviewerGuidance-competingInterests-control"]').locator('body');
            await page.waitForFunction(() => { const mce = window.tinymce || window.tinyMCE; const e = mce && mce.get().find((x) => /competingInterests/.test(x.id)); return e && e.initialized; }, null, {timeout: T}).catch(() => {});
            await body.click();
            await page.keyboard.press('Control+A'); await page.keyboard.press('Delete');
            await sleep(500);
            await sp.guidance.saveButton.click();
            out.policySaved = await sp.guidance.savedStatus.waitFor({timeout: T}).then(() => true).catch(() => false);
            out.policySnap = (await snap('s21-policy-emptied')).name;
            out.policyDb = db(`select setting_value from ${isOMP ? 'press_settings' : 'journal_settings'} where setting_name='competingInterests' and ${isOMP ? 'press_id' : 'journal_id'}=(select ${isOMP ? 'press_id from presses' : 'journal_id from journals'} where path='${st.Q}')`);
            await openWf(s, 'q1');
            out.q1rowNoPolicy = await rowRead('q1');
            await openRD('q1', 'button');
            const v4 = await rdRead('s21-q1-read-nopolicy');
            out.q1readNoPolicy = {ci: v4.ci, snap: v4.snap};
            await openMR();
            const e4 = await mrRead('s21-q1-modify-nopolicy');
            out.q1modifyNoPolicy = {ci: e4.ci, snap: e4.snap};
            await ciRadio(mr(), 'noCompetingInterests').check(); await sleep(600);
            out.q1saveNo = await saveMR();
            if (out.q1saveNo.closed) { await settleRD(); const v5 = await rdRead('s21-q1-after-no'); out.q1afterNo = {ci: v5.ci, snap: v5.snap}; } else await leaveMR();
            await closeRD();
            out.q1rowNo = await rowRead('q1');
            out.q1logNo = await logDiff('s21-q1-log-no');
            await openRD('q2', 'menu');
            const v6 = await rdRead('s21-q2-control');
            out.q2control = {ci: v6.ci, headings: v6.headings, snap: v6.snap};
            await closeRD();
            await page.reload(); await idle(page); await row('q1').waitFor({timeout: T}).catch(() => {});
            out.rowsEndReload = {q1: await rowRead('q1'), q2: await rowRead('q2'), q3: await rowRead('q3')};
            fact('s21', out);
        });
    } finally {
        record('dialogs', dialogsSeen);
        record('puts', puts.map(({at, ...r}) => ({t: new Date(at).toISOString(), ...r})));
        record('gets', gets.map(({at, ...r}) => ({t: new Date(at).toISOString(), ...r})));
        await close();
    }
});
