// Regression report docs/reports/2026-10-28-pkp-lib-8887.md: the editorial dashboard offers its
// "Declined" view only to managers and admins, so a section editor (series editor, moderator) or
// an assistant never finds a declined submission they are assigned to in any view of the
// dashboard, where 3.4's "Archives" tab listed it.
// Takes the report's Steps on PKP's default test dataset (a dataset fleet, harness.md "Dataset
// fleets"); every state is made through the screens. The declined submission: OJS 18 (declined
// in Submission, dbuskins assigned), OPS 4 (declined in Production, dbuskins assigned), OMP 6
// (dbarnes declines it in Internal Review here; dbuskins assigned).
// Setup (OJS, OMP): admin gives svogt the "Funding coordinator" role (Administration > Hosted
//   Journals (Presses) > Settings wizard > Users > Edit User); dbarnes assigns Sarah Vogt as
//   Funding coordinator on the submission; OMP: dbarnes then declines it. A preprint server has
//   no assistant role with a stage, so OPS walks the moderator alone.
// Then, per user (dbarnes the control, dbuskins, svogt, and a section editor not assigned to it:
// minoue, on OMP sberardo):
//   1 sign in, the editorial dashboard: every side-menu view and its count
//   2 each view opened: is the declined submission listed?
//   3 main: the side menu's "Search submissions" for the title (3.5 has no such box)
//   4 the submission's workflow by its address: does it open?
// Changes nothing beyond the setup. The neighbour check of a fix trial is that last user's row: a
// section editor not assigned to the submission must not see it in "Declined".
// Reads fixed when: `dbuskins 1 views` (and `svogt 1 views` on OJS, OMP) list "Declined" and
// `… 2 views listing <id>` names "Declined (1)", while the unassigned editor's
// (`minoue`, OMP `sberardo`) `2 Declined view` lists no row.
// Fix tried: fix.diff here (lib/pkp, the Declined view's role list), applied with bin/try-fix.js.
// Reset first: npm run fleet-prep -- --feature <feature> --dataset <n> --reset
// Run: PROBE_FEATURE=<feature> PROBE_AGENT=<id> node bin/probe.js all shared/playwright/checks/sync/pkp-lib-8887/declined-view.js
//      (PKP_E2E_LINE=stable-3_5_0 PROBE_RUN=r35 in front for 3.5; PROBE_RUN=fix for the fix trial)
const {forEachApp, launch, signIn, signOut, screen, record, idle} = require('../../../probe');
const {EditorialDashboardPage} = require('../../../pages/EditorialDashboardPage.js');
const R = require('../../issues/manager-level-role-save-ticks-every-stage/lib.js');
const W = require('../../issues/internal-round-revised-files-not-carried/lib.js');
const {decide} = require('../../issues/copyediting-no-assign-copyeditor-notice/lib');

const T = 30_000;
const flat = (s, n = 400) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));

/** Per app: the declined submission, the words searched for, whether an assistant is walked, and
 * `other`, a section editor not assigned to it (OMP's minoue is: book 6 has dbarnes, dbuskins, minoue). */
const CASES = {
    ojs: {id: 18, words: 'Self-Organization', assistant: true, decline: false, other: 'minoue'},
    omp: {id: 6, words: 'Information Literacy', assistant: true, decline: true, other: 'sberardo'},
    ops: {id: 4, words: 'Genetic transformation', assistant: false, decline: false, other: 'minoue'},
};
const COORD = {username: 'svogt', name: 'Sarah Vogt', role: 'Funding coordinator'};

/** The side menu's editorial views: label, count and address. */
async function views(page) {
    return page.locator('#app-nav a[href*="dashboard/editorial"]').evaluateAll((as) => as.map((a) => {
        const t = (a.innerText || '').replace(/\s+/g, ' ').trim();
        const m = t.match(/^(.*?)\s*(\d+)?$/);
        return {label: m ? m[1] : t, count: m && m[2] ? Number(m[2]) : null, href: a.getAttribute('href')};
    }));
}

/** The open view: its heading and the IDs of the rows listed (first page). */
async function listed(page) {
    await idle(page);
    await page.waitForFunction(() => !/Loading/.test(document.querySelector('#app-main')?.innerText || ''), null, {timeout: T}).catch(() => {});
    await page.waitForTimeout(500);
    const heading = flat(await page.getByRole('heading', {level: 1}).first().innerText().catch(() => null));
    const ids = await page.locator('#app-main table tbody tr').evaluateAll((trs) => trs
        .map((tr) => (tr.querySelector('td, th')?.innerText || '').trim())
        .filter((s) => /^\d+$/.test(s))
        .map(Number));
    return {heading, ids};
}

forEachApp(async (app) => {
    if (!app.dataset) throw new Error('declined-view.js runs on a dataset fleet (fleet-prep --dataset n --reset)');
    const c = CASES[app.name];
    const ctx = app.contextPath;
    const main = !(app.line && /3_5/.test(app.line));
    const facts = {app: app.name, line: app.line || 'main', item: c.id};
    const fact = (k, v) => {
        facts[k] = v;
        console.log(`[fact] ${app.name} ${k}: ${JSON.stringify(v).slice(0, 2000)}`);
    };
    const step = async (k, fn) => { try { fact(k, await fn()); } catch (e) { fact(k, {error: flat(e.message, 400)}); } };
    const {page, close} = await launch(app);
    try {
        // Setup
        if (c.assistant) {
            await signIn(page, 'admin');
            await step('setup role given', () => R.giveRoleAsAdmin(page, app, {username: COORD.username, role: COORD.role}).then(() => COORD.role));
            await signOut(page).catch(() => {});
        }
        await signIn(page, 'dbarnes', {contextPath: ctx});
        if (c.assistant) {
            await step('setup coordinator assigned', () => R.assignAs(page, app, c.id, {role: COORD.role, personName: COORD.name}).then((o) => ({status: o.status})));
        }
        if (c.decline) {
            await W.openWorkflow(page, app, c.id);
            await step('setup decline', () => decide(page, /^Decline Submission$/));
            await page.waitForTimeout(800);
        }
        await signOut(page).catch(() => {});

        const users = ['dbarnes', 'dbuskins', ...(c.assistant ? [COORD.username] : []), c.other];
        for (const u of users) {
            await signIn(page, u, {contextPath: ctx});
            const dash = new EditorialDashboardPage(page, ctx);
            // 1
            await page.goto(dash.url());
            await idle(page);
            await page.locator('#app-nav').waitFor({timeout: T});
            const vs = await views(page);
            fact(`${u} 1 views`, vs.map((v) => `${v.label}${v.count == null ? '' : ` (${v.count})`}`));
            // 2
            const where = [];
            for (const v of vs) {
                if (!v.href || !/currentViewId=/.test(v.href)) continue;
                if (v.count === 0 && !/^Declined/.test(v.label)) continue; // an empty view lists nothing
                await page.goto(new URL(v.href, page.url()).toString());
                const l = await listed(page);
                if (l.ids.includes(c.id)) where.push(l.heading);
                if (/^Declined/.test(v.label)) {
                    fact(`${u} 2 Declined view`, l);
                    record(`${u}-declined`, await screen(page));
                }
            }
            fact(`${u} 2 views listing ${c.id}`, where);
            // 3
            if (main) {
                await step(`${u} 3 search "${c.words}"`, async () => {
                    await page.goto(dash.url());
                    await dash.globalSearch(c.words);
                    return listed(page);
                });
                record(`${u}-search`, await screen(page));
            } else {
                fact(`${u} 3 search box`, await page.locator('#app-nav').getByRole('searchbox').count());
            }
            // 4
            await step(`${u} 4 workflow by address`, async () => {
                await W.openWorkflow(page, app, c.id);
                const dlg = page.locator('[role="dialog"]:visible').first();
                return {open: await dlg.isVisible().catch(() => false), head: flat(await dlg.innerText().catch(() => page.locator('body').innerText()), 300)};
            });
            await signOut(page).catch(() => {});
        }
    } finally {
        record('walk-facts', facts);
        await close();
    }
});
