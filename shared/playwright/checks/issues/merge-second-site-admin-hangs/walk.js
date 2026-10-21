// U53 A21 walk (issue report docs/issues/U53-A21-merge-second-site-admin-hangs.md).
// On PKP's default test dataset, Settings > Users & Roles:
//   steps (default): precondition, `rvaca` (the context's manager) made a second Site
//     Administrator in the database (lib.js makeSiteAdmin(): no screen makes one). As `admin`:
//     search "Vaca", the row's "…" menu; "Merge user" > "Search" "Barnes" > Daniel Barnes's
//     "Merge into this User" > "OK" in "Confirm", and the screen 3 s later; a reload and the row
//     again, with the account in the database; then "…" > "Login As" > "OK" and the page it opens.
//     Control: Daniel Barnes's row menu.
//   nb (neighbour, alone, no precondition): what the fix must leave alone. As `admin`: rvaca's row
//     (an ordinary manager here) keeps "Login As" and "Merge user"; the own row offers neither;
//     an author merged into another goes through (the window closes, the account is gone). As
//     `rvaca` (a manager): Daniel Barnes's row keeps both, the Site Administrator's row neither.
// Each step records what it finds and goes on: with the fix in, an action may be absent.
//
// Reset first:  npm run fleet-prep -- --feature <feature> --dataset <n> --reset
// Run (main):   PROBE_FEATURE=<feature> PROBE_AGENT=<id> node bin/probe.js all shared/playwright/checks/issues/merge-second-site-admin-hangs/walk.js [nb]
// 3.5:          PKP_E2E_LINE=stable-3_5_0 PROBE_RUN=r35 PROBE_FEATURE=<line feature> PROBE_AGENT=<id> node bin/probe.js all …/walk.js
// Facts: .reports/<feature>/<id>/a21-walk[-<run>]-<app>.json (steps) or a21-nb[-<run>]-<app>.json
const {forEachApp, launch, signIn, signOut, shot, record, serverLog} = require('../../../probe');
const H = require('./lib.js');

const mode = process.argv[2] === 'nb' ? 'nb' : 'steps';

// The neighbour's ordinary merge: an author of the app's dataset into another.
const PAIR = {
    ojs: {from: 'zwoods', fromSearch: 'Woods', into: 'zzedd', intoSearch: 'Zedd'},
    omp: {from: 'mally', fromSearch: 'Ally', into: 'zzedd', intoSearch: 'Zedd'},
    ops: {from: 'zwoods', fromSearch: 'Woods', into: 'ccorino', intoSearch: 'Corino'},
};
const mail = (u) => (u === 'admin' ? 'pkpadmin@mailinator.com' : `${u}@mailinator.com`);

forEachApp(async (app) => {
    const facts = {app: app.name, line: app.line || 'main', mode};
    const name = mode === 'nb' ? 'a21-nb' : 'a21-walk';
    const log = serverLog(app);
    const {page, close} = await launch(app);
    try {
        if (mode === 'steps') {
            // Precondition: rvaca becomes a second Site Administrator.
            facts.precondition = H.makeSiteAdmin(app, 'rvaca');

            // 1–3. admin opens Users & Roles, searches "Vaca", the row's menu
            await signIn(page, 'admin', {contextPath: app.contextPath});
            let list = await H.openList(page, app);
            let row = await H.findRow(page, list, 'Vaca', mail('rvaca'));
            facts.row = await H.rowFacts(list, row);
            await list.openMenu(row);
            await shot(page, 'a21-01-menu');
            await list.closeMenu(row);

            // 4–6. "Merge user" > Daniel Barnes > "Merge into this User" > "OK"
            if (facts.row && facts.row.menu.includes('Merge user')) {
                facts.merge = await H.mergeInto(page, list, row, {intoSearch: 'Barnes', into: mail('dbarnes'), label: 'a21-02', log});
                await shot(page, 'a21-02-after-ok');
            } else facts.merge = 'not offered';

            // 7. reload, the row again; the account in the database
            list = await H.openList(page, app);
            row = await H.findRow(page, list, 'Vaca', mail('rvaca'));
            facts.afterReload = await H.rowFacts(list, row);
            facts.accounts = {rvaca: H.account(app, 'rvaca'), dbarnes: H.account(app, 'dbarnes')};

            // Control: Daniel Barnes's row
            list = await H.openList(page, app);
            const ctl = await H.findRow(page, list, 'Barnes', mail('dbarnes'));
            facts.control = await H.rowFacts(list, ctl);

            // 8. "Login As" on Ramiro Vaca's row
            list = await H.openList(page, app);
            row = await H.findRow(page, list, 'Vaca', mail('rvaca'));
            const menu = (await H.rowFacts(list, row) || {menu: []}).menu;
            if (menu.includes('Login As')) {
                const from = log.mark();
                facts.loginAs = await H.loginAs(page, list, row, {label: 'a21-03'});
                facts.loginAs.log = log.since(from).map((l) => H.flat(l, 400));
                await shot(page, 'a21-03-login-as');
            } else facts.loginAs = 'not offered';
            await signOut(page).catch(() => {});
        } else {
            // N1. admin: rvaca's row, own row, an ordinary merge
            await signIn(page, 'admin', {contextPath: app.contextPath});
            let list = await H.openList(page, app);
            let row = await H.findRow(page, list, 'Vaca', mail('rvaca'));
            facts.n1 = {rvaca: await H.rowFacts(list, row)};
            list = await H.openList(page, app);
            row = await H.findRow(page, list, 'admin', mail('admin'));
            facts.n1.own = await H.rowFacts(list, row);
            const p = PAIR[app.name];
            list = await H.openList(page, app);
            row = await H.findRow(page, list, p.fromSearch, mail(p.from));
            facts.n1.from = await H.rowFacts(list, row);
            if (facts.n1.from && facts.n1.from.menu.includes('Merge user')) {
                facts.n1.merge = await H.mergeInto(page, list, row, {intoSearch: p.intoSearch, into: mail(p.into), label: 'a21-nb-merge', log});
            } else facts.n1.merge = 'not offered';
            facts.n1.accounts = {[p.from]: H.account(app, p.from), [p.into]: H.account(app, p.into)};
            await signOut(page).catch(() => {});

            // N2. rvaca (a manager): Daniel Barnes's row, the Site Administrator's row
            await signIn(page, 'rvaca', {contextPath: app.contextPath});
            list = await H.openList(page, app);
            row = await H.findRow(page, list, 'Barnes', mail('dbarnes'));
            facts.n2 = {dbarnes: await H.rowFacts(list, row)};
            list = await H.openList(page, app);
            row = await H.findRow(page, list, 'admin', mail('admin'));
            facts.n2.admin = await H.rowFacts(list, row);
            await signOut(page).catch(() => {});
        }
    } catch (e) {
        facts.error = H.flat(String(e && e.stack), 1500);
        await shot(page, `${name}-error`).catch(() => {});
    } finally {
        record(name, facts);
        await close();
    }
});
