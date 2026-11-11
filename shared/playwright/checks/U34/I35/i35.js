// U34 claim check I35 (housekeeping incidentals, U34 row 2026-11-11): a
// Moderator assigned "Only allowed to recommend" on a preprint server, and the
// recommending editor's rows of the Actors table (spec l.61, l.62, l.64's
// recommending-editor bullet) and OPS1's recommend-only clause, with the
// journal and press controls.
//
// Runs on PKP's default dataset, dataset fleet 2 (feature inc-U34), one app per
// process, each part twice (PROBE_RUN=r1, r2), the app's fleet reset before
// every run:
//   npm run reset:<app> -- --dataset 2
//   PART=<ops|ojs|omp> PROBE_RUN=<r1|r2> PROBE_FEATURE=inc-U34 PROBE_AGENT=cc1111e \
//     bin/app-lock.sh shared <app> -- node bin/probe.js <app> shared/playwright/checks/U34/I35/i35.js
// (the OJS and OMP fleets are prepared with
//   npm run fleet-prep -- --feature inc-U34 --dataset 2 --notes U34 --apps <app>)
// PART=ops (OPS): sberardo (Moderator, assigned to every preprint, no limit as
//   installed) reads the workflows of preprints 1 (Production, queued), 2
//   (posted, Done) and 4 (declined) and types the Decline / Revert Decline /
//   Recommend Accept addresses; dbarnes (manager, unassigned) the same reads
//   and addresses; dbarnes then opens Participants › Stephanie Berardo ›
//   "Edit" on each of the three, ticks "Only allowed to recommend" (on 2 first
//   leaving the window by "Cancel" with the box ticked), presses "OK", reads
//   the row on the page and after a reload; sberardo then reads the same
//   workflows, the dashboard and the addresses again; dbarnes re-reads 2.
// PART=ojs (OJS): sberardo (Section editor, recommend-only on submission 1 as
//   installed, Done) reads 1; minoue (recommend-only on submission 2, review
//   round 1, with deciding editors assigned) reads 2 and types a decision and a
//   recommendation address; rvaca removes the deciding editors from 2
//   (Participants › Remove) and minoue reads 2 and types the recommendation
//   again.
// PART=omp (OMP): the same as ojs's second half on submission 6 (internal
//   review round 1, minoue recommend-only, dbarnes and dbuskins deciding).
// Every part also types decision numbers no button sends: MOVE_TO_DONE on
// OPS 1 and RETURN_TO_WORKFLOW on OPS 2, OJS 1 and OMP 14 (the Done ones).
// Outputs (.reports/inc-U34/cc1111e/): snapshots `<part>-<name>-<run>-<app>.json/.png`
// and `facts-<run>-<app>.json` (outFile `facts-<part>.json`, whose part name,
// equal to the app's, the kit folds away; written here only); the run record
// `run-<app>-*.json`. No other script or file is read.
const {forEachApp, launch, signIn, signOut, screen, shot, record, idle, sql, note, outFile, loc, serverLog} = require('../../../probe');
const fs = require('fs');

const PART = process.env.PART || 'ops';
const RUN = process.env.PROBE_RUN || 'r1';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rel = (u) => String(u || '').replace(/^https?:\/\/[^/]+/, '');
const flat = (s, n = 600) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, n);
// Decision numbers (lib/pkp Decision.php); OPS's "Decline Submission" and
// "Revert Decline" are INITIAL_DECLINE (8) and REVERT_INITIAL_DECLINE (16).
const D = {ACCEPT: 2, EXTERNAL_REVIEW: 3, INITIAL_DECLINE: 8, RECOMMEND_ACCEPT: 9, REVERT_INITIAL_DECLINE: 16, DECLINE_INTERNAL: 22, RECOMMEND_ACCEPT_INTERNAL: 23, MOVE_TO_DONE: 33, RETURN_TO_WORKFLOW: 34};
const CP = 'publicknowledge';

// The workflow dialog as data: headings, the decision buttons region, the
// "Recommendation" box, header buttons, menu entries.
const wfInfo = (page) => page.evaluate(() => {
    const vis = (e) => e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
    const dlgs = [...document.querySelectorAll('[role=dialog]')].filter(vis);
    const root = dlgs[0] || null;
    if (!root) return {dialogCount: 0};
    const hs = [...root.querySelectorAll('h1,h2,h3,h4')].filter(vis);
    const actionRegion = root.querySelector('[data-cy="workflow-action-items"]');
    const byHeading = (re) => {
        const h = hs.find((x) => re.test(x.innerText.trim()));
        return h ? (h.parentElement || h).innerText.trim().replace(/\s+/g, ' ').slice(0, 400) : null;
    };
    return {
        dialogCount: dlgs.length,
        headings: hs.map((e) => e.innerText.trim()).filter(Boolean).slice(0, 40),
        actionButtons: actionRegion ? [...actionRegion.querySelectorAll('button')].filter(vis).map((b) => b.innerText.trim()) : null,
        actionText: actionRegion ? actionRegion.innerText.trim().replace(/\s+/g, ' ').slice(0, 600) : null,
        recommendation: byHeading(/^Recommendation$/i),
        buttons: [...root.querySelectorAll('button')].filter(vis).map((b) => (b.innerText || b.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ')).filter(Boolean).slice(0, 60),
        nav: [...root.querySelectorAll('nav a, nav button')].filter(vis).map((b) => b.innerText.trim().replace(/\s+/g, ' ')).filter(Boolean).slice(0, 30),
    };
}).catch((e) => ({error: String(e.message).slice(0, 200)}));

forEachApp(async (app) => {
    const {ParticipantsPanel, EditAssignmentWindow, RemoveParticipantDialog} = require('../../../pages/StageParticipantsPages.js');
    const facts = {app: app.name, part: PART, run: RUN, dataset: app.dataset};
    const fact = (k, v) => {
        facts[k] = v;
        console.log(`[${app.name}] ${k}: ${JSON.stringify(v).slice(0, 1200)}`);
        fs.writeFileSync(outFile(`facts-${PART}.json`), JSON.stringify(facts, null, 2));
    };
    const log = serverLog(app);
    const ctxUrl = (p) => app.url(`/index.php/${CP}${p}`);
    const workflowUrl = (id, key) => ctxUrl(`/dashboard/editorial?workflowSubmissionId=${id}${key ? `&workflowMenuKey=${key}` : ''}`);
    const decisionUrl = (id, d, round) => ctxUrl(`/decision/record/${id}?decision=${d}${round ? `&reviewRoundId=${round}` : ''}`);
    const assignments = (subs) => sql(app, `select sa.submission_id, u.username, sa.user_group_id, sa.recommend_only from stage_assignments sa join users u using(user_id) join user_groups g using(user_group_id) where g.role_id in (16,17) and sa.submission_id in (${subs.join(',')}) order by 1,2`).split('\n').filter(Boolean);

    const {page, close} = await launch(app);
    let cur = null;
    page.on('response', async (r) => {
        if (!cur) return;
        const u = r.url();
        if ((/\/api\/v1\/|\$\$\$call\$\$\$|\/decision\/record/.test(u) && !/_i18n/.test(u)) || r.status() >= 400) {
            cur.req.push(`${r.request().method()} ${r.status()} ${rel(u).replace(/^\/index\.php\/[^/]+/, '~').slice(0, 160)}`);
        }
    });
    page.on('console', (m) => { if (cur && m.type() === 'error') cur.console.push(flat(m.text(), 200)); });
    page.on('pageerror', (e) => { if (cur) cur.pageerror.push(flat(e.message, 200)); });
    const begin = () => { cur = {req: [], console: [], pageerror: [], logFrom: log.mark()}; };
    const end = () => {
        const c = cur;
        cur = null;
        const lines = log.since(c.logFrom);
        delete c.logFrom;
        c.serverLog = lines.map((l) => flat(l, 400)).slice(0, 8);
        return c;
    };
    async function snap(name) {
        await idle(page).catch(() => {});
        await sleep(600);
        const s = await screen(page);
        record(`${PART}-${name}`, s);
        await shot(page, `${PART}-${name}`).catch(() => {});
        return s;
    }
    const as = async (user) => {
        await signIn(page, user, {contextPath: CP});
        await page.waitForLoadState('load').catch(() => {});
    };

    // A workflow opened by its address (key optional), read once settled.
    async function readWorkflow(label, sub, key = null) {
        begin();
        await page.goto(workflowUrl(sub, key));
        await page.getByRole('dialog').first().waitFor({timeout: 30000}).catch(() => {});
        const s = await snap(label);
        const info = await wfInfo(page);
        const out = {url: rel(page.url()), dialog: flat(s.text && s.text.dialog, 1500), notices: s.notices, ...info, ...end()};
        out.submissionGET = out.req.filter((x) => new RegExp(`^GET \\d+ ~/api/v1/submissions/${sub}(\\?|$)`).test(x));
        await afterOpen(label, out);
        return out;
    }
    // What follows the opening: an "Error" window is answered with its "OK" and
    // the page left behind read; a "Change decision" is pressed and the
    // recommendation buttons it brings back read.
    async function afterOpen(label, out) {
        const err = page.getByRole('dialog', {name: 'Error', exact: true});
        if (await err.count()) {
            out.errorWindow = true;
            await loc(page, 'workflow: the "Error" window', err);
            begin();
            await err.getByRole('button', {name: 'OK', exact: true}).click();
            await sleep(800);
            const s2 = await snap(`${label}-error-ok`);
            out.afterErrorOk = {dialog: flat(s2.text && s2.text.dialog, 600), main: flat(s2.text && s2.text.main, 300), dialogs: await page.getByRole('dialog').count(), ...(await wfInfo(page)), ...end()};
        }
        const change = page.locator('[data-cy="workflow-action-items"]').getByRole('button', {name: 'Change decision', exact: true});
        if (await change.count()) {
            await change.click();
            await sleep(500);
            await snap(`${label}-change-decision`);
            out.afterChangeDecision = (await wfInfo(page)).actionButtons;
        }
    }
    // A typed decision address, read once settled.
    async function readAddress(label, sub, d, round = null) {
        begin();
        const resp = await page.goto(decisionUrl(sub, d, round)).catch(() => null);
        const s = await snap(label);
        return {url: rel(page.url()), status: resp ? resp.status() : null, title: s.title, main: flat(s.text && s.text.main, 500), h1: flat(await page.locator('h1').first().innerText().catch(() => ''), 120), ...end()};
    }
    // Participants › a row › "Edit" › the recommend-only box (ticked, then "OK"),
    // optionally first left by "Cancel" with the box ticked.
    async function setRecommendOnly(label, sub, key, name, role, {leaveFirst = false} = {}) {
        const panel = new ParticipantsPanel(page, CP);
        const out = {sub, name};
        begin();
        await page.goto(workflowUrl(sub, key));
        await panel.heading().waitFor({timeout: 30000});
        await snap(`${label}-panel-before`);
        out.rowsBefore = await panel.rowLines();
        await panel.openMenu(name, role);
        out.menu = await panel.menuLabels();
        await panel.menuItem('Edit').click();
        const win = new EditAssignmentWindow(page);
        await win.expectOpen();
        const sw = await snap(`${label}-edit-window`);
        out.window = flat(sw.text && sw.text.dialog, 800);
        out.boxBefore = await win.recommendOnlyBox().isChecked();
        await loc(page, 'Edit Assignment: the recommend-only box', win.recommendOnlyBox());
        if (leaveFirst) {
            await win.recommendOnlyBox().check();
            await win.cancel();
            await sleep(800);
            const sc = await snap(`${label}-after-cancel`);
            out.afterCancel = {notices: sc.notices, rows: await panel.rowLines(), sql: assignments([sub])};
            await sleep(600);
            await panel.openMenu(name, role);
            await panel.menuItem('Edit').click();
            await win.expectOpen();
            out.boxAfterCancelReopen = await win.recommendOnlyBox().isChecked();
        }
        await win.recommendOnlyBox().check();
        await win.ok();
        await sleep(800);
        const sa = await snap(`${label}-after-ok`);
        out.afterOk = {notices: sa.notices, rows: await panel.rowLines()};
        await page.reload();
        await panel.heading().waitFor({timeout: 30000}).catch(() => {});
        await snap(`${label}-after-reload`);
        out.afterReload = await panel.rowLines();
        out.sql = assignments([sub]);
        Object.assign(out, end());
        return out;
    }
    // Participants › a row › "Remove" › "OK".
    async function removeParticipant(label, sub, key, name, role) {
        const panel = new ParticipantsPanel(page, CP);
        begin();
        await page.goto(workflowUrl(sub, key));
        await panel.heading().waitFor({timeout: 30000});
        await panel.openMenu(name, role);
        await panel.menuItem('Remove').click();
        const dlg = new RemoveParticipantDialog(page);
        await dlg.expectOpen();
        await snap(`${label}-remove-dialog`);
        await dlg.ok();
        await sleep(800);
        await page.reload();
        await panel.heading().waitFor({timeout: 30000}).catch(() => {});
        const s = await snap(`${label}-after-remove`);
        return {rows: await panel.rowLines(), notices: s.notices, ...end()};
    }

    try {
        if (PART === 'ops') {
            fact('installed', assignments([1, 2, 4]));
            fact('status', sql(app, 'select submission_id, stage_id, status from submissions where submission_id in (1,2,4) order by 1').split('\n'));
            const reads = async (user, phase) => {
                await as(user);
                const o = {};
                o.w2 = await readWorkflow(`${phase}-${user}-w2`, 2);
                o.w2prod = await readWorkflow(`${phase}-${user}-w2-prod`, 2, 'workflow_5');
                o.w1 = await readWorkflow(`${phase}-${user}-w1`, 1, 'workflow_5');
                o.w4 = await readWorkflow(`${phase}-${user}-w4`, 4, 'workflow_5');
                o.declineAddr1 = await readAddress(`${phase}-${user}-addr-decline-1`, 1, D.INITIAL_DECLINE);
                o.revertAddr4 = await readAddress(`${phase}-${user}-addr-revert-4`, 4, D.REVERT_INITIAL_DECLINE);
                o.moveToDoneAddr1 = await readAddress(`${phase}-${user}-addr-mtd-1`, 1, D.MOVE_TO_DONE);
                o.recommendAddr1 = await readAddress(`${phase}-${user}-addr-recommend-1`, 1, D.RECOMMEND_ACCEPT);
                o.rtwAddr2 = await readAddress(`${phase}-${user}-addr-rtw-2`, 2, D.RETURN_TO_WORKFLOW);
                return o;
            };
            fact('before.sberardo', await reads('sberardo', 'before'));
            fact('before.dbarnes', await reads('dbarnes', 'before'));
            // dbarnes limits sberardo on 2 (first leaving the window unsaved), 1 and 4.
            fact('limit.2', await setRecommendOnly('limit-2', 2, 'workflow_5', 'Stephanie Berardo', 'Moderator', {leaveFirst: true}));
            fact('limit.1', await setRecommendOnly('limit-1', 1, 'workflow_5', 'Stephanie Berardo', 'Moderator'));
            fact('limit.4', await setRecommendOnly('limit-4', 4, 'workflow_5', 'Stephanie Berardo', 'Moderator'));
            fact('limited', assignments([1, 2, 4]));
            const after = await reads('sberardo', 'after');
            // The dashboard lists, as the limited Moderator.
            begin();
            await page.goto(ctxUrl('/dashboard/editorial'));
            const sd = await snap('after-sberardo-dashboard');
            after.dashboard = {main: flat(sd.text && sd.text.main, 800), ...end()};
            begin();
            await page.goto(ctxUrl('/dashboard/editorial?currentViewId=published'));
            const sp = await snap('after-sberardo-published');
            after.published = {main: flat(sp.text && sp.text.main, 800), ...end()};
            // The posted preprint opened from its row's "View" on the "Published" view.
            const row = page.locator('tr').filter({hasText: 'Kwantes'});
            begin();
            await row.getByRole('button', {name: 'View', exact: true}).click();
            await page.getByRole('dialog').first().waitFor({timeout: 30000}).catch(() => {});
            const sv = await snap('after-sberardo-published-view-2');
            after.publishedView2 = {url: rel(page.url()), dialog: flat(sv.text && sv.text.dialog, 600), ...end()};
            after.publishedView2.submissionGET = after.publishedView2.req.filter((x) => /^GET \d+ ~\/api\/v1\/submissions\/2(\?|$)/.test(x));
            await afterOpen('after-sberardo-published-view-2', after.publishedView2);
            fact('after.sberardo', after);
            await as('dbarnes');
            fact('after.dbarnes.w2', await readWorkflow('after-dbarnes-w2', 2));
            note(`I35 (OPS dataset): a Moderator's recommend-only limit is set through Participants (workflowMenuKey=workflow_5 on a posted preprint) › the row's "More Actions" › "Edit" › input[name="recommendOnly"] › "OK"; the dataset installs no recommend-only assignment on OPS.`);
        }

        if (PART === 'ojs' || PART === 'omp') {
            const S = PART === 'ojs'
                ? {done: 1, doneAny: 1, rev: 2, stage: 3, decide: D.ACCEPT, recommend: D.RECOMMEND_ACCEPT, deciders: [['Daniel Barnes', null], ['David Buskins', null], ['Stephanie Berardo', null]]}
                : {done: null, doneAny: 14, rev: 6, stage: 2, decide: D.DECLINE_INTERNAL, recommend: D.RECOMMEND_ACCEPT_INTERNAL, deciders: [['Daniel Barnes', null], ['David Buskins', null]]};
            const round = sql(app, `select review_round_id from review_rounds where submission_id=${S.rev} order by review_round_id desc limit 1`);
            // The round's own menu key (the bare stage key opens a page with no
            // round, which throws in the browser: U24 A6, U71 OMP7).
            S.stageKey = `workflow_${S.stage}_${round}`;
            fact('installed', assignments([S.done, S.rev].filter(Boolean)));
            fact('round', round);
            if (S.done) {
                await as('sberardo');
                fact('sberardo.done', await readWorkflow(`sberardo-w${S.done}`, S.done));
                fact('sberardo.rtwAddr', await readAddress(`sberardo-addr-rtw`, S.done, D.RETURN_TO_WORKFLOW));
            }
            // "Return to Workflow" typed by its decision number on a Done submission, by the editor.
            await as('dbarnes');
            fact('dbarnes.rtwAddr', await readAddress(`dbarnes-addr-rtw`, S.doneAny, D.RETURN_TO_WORKFLOW));
            await as('minoue');
            const m = {};
            m.w = await readWorkflow(`minoue-w${S.rev}`, S.rev);
            m.decideAddr = await readAddress(`minoue-addr-decide`, S.rev, S.decide, round);
            m.recommendAddr = await readAddress(`minoue-addr-recommend`, S.rev, S.recommend, round);
            fact('minoue.withDeciders', m);
            await as('rvaca');
            const removed = [];
            for (const [name, role] of S.deciders) {
                removed.push({name, ...(await removeParticipant(`rvaca-remove-${name.split(' ')[1]}`, S.rev, S.stageKey, name, role))});
            }
            fact('removed', removed);
            fact('afterRemove', assignments([S.rev]));
            await as('minoue');
            const n = {};
            n.w = await readWorkflow(`minoue-w${S.rev}-nodecider`, S.rev);
            n.recommendAddr = await readAddress(`minoue-addr-recommend-nodecider`, S.rev, S.recommend, round);
            fact('minoue.noDeciders', n);
        }
    } finally {
        fs.writeFileSync(outFile(`facts-${PART}.json`), JSON.stringify(facts, null, 2));
        await close();
    }
});
