// U01 A17 issue walk: with the security audit log on, a session the app ends
// because the account's password was changed in another browser is written
// as "User forcibly logged out after a session IP address change".
//   docs/issues/U01-A17-password-change-logout-audited-as-ip-change.md
// On a dataset fleet (PKP's default test dataset); the script sets
// `[logs] log_audit = On` in the fleet's config, as the Steps' precondition.
//   modes: walk (default)  the Steps: B dbarnes on the Dashboard; A dbarnes changes
//                          the password on Profile › Password; B reloads; the log read;
//                          A puts the password back
//          nb              the neighbour: B dbarnes, Dashboard reloaded twice with
//                          nothing changed (no forced logout line), then "Logout"
//                          ("User logged out")
//   npm run fleet-prep -- --feature <f> --dataset <n> --reset
//   PROBE_FEATURE=<f> PROBE_AGENT=h21c bin/app-lock.sh shared ojs -- \
//     node bin/probe.js ojs shared/playwright/checks/issues/password-change-logout-audited-as-ip-change/walk.js [nb]
const {forEachApp, launch, signIn, signOut, record, serverLog, sql} = require('../../../probe');
const {ensureAudit, auditSince, where, snap, changeOwnPassword, logout} = require('./lib');

const MODE = process.argv.slice(2).includes('nb') ? 'nb' : 'walk';
const USER = 'dbarnes';
const ORIGINAL = 'dbarnesdbarnes';
const CHANGED = 'h21cChanged-1';

forEachApp(async (app) => {
    const loc = app.line && /3_[34]/.test(app.line) ? '' : '/en';
    const dashboard = `/index.php/${app.contextPath}${loc}/dashboard/editorial`;
    const id = sql(app, `select user_id from users where username='${USER}'`);
    const facts = {app: app.name, line: app.line || 'main', run: process.env.PROBE_RUN || null, mode: MODE, userId: id,
        audit: ensureAudit(app), steps: {}};
    await new Promise((r) => setTimeout(r, 3000)); // opcache revalidate_freq 2 s: let the config change show
    const log = serverLog(app, {match: /"event":"/});
    const f = facts.steps;
    const B = await launch(app);
    let A = null;
    try {
        // 1. B: dbarnes signs in, the Dashboard
        let from = log.mark();
        await signIn(B.page, USER, {contextPath: app.contextPath});
        await B.page.goto(dashboard);
        await snap(B.page, `${MODE}-1-B-dashboard`);
        f.s1 = {where: await where(B.page), audit: auditSince(log, from)};

        if (MODE === 'nb') {
            from = log.mark();
            for (let i = 0; i < 2; i++) await B.page.goto(dashboard);
            await snap(B.page, 'nb-2-B-dashboard-again');
            f.again = {where: await where(B.page), audit: auditSince(log, from)};
            from = log.mark();
            await logout(B.page);
            await snap(B.page, 'nb-3-B-after-logout');
            f.logout = {where: await where(B.page), audit: auditSince(log, from)};
        } else {
            // 2-3. A: dbarnes too, Profile › Password, "Save"
            A = await launch(app);
            await signIn(A.page, USER, {contextPath: app.contextPath});
            from = log.mark();
            f.s3 = {change: await changeOwnPassword(app, A.page, ORIGINAL, CHANGED)};
            await snap(A.page, 'walk-3-A-password-saved');
            f.s3.audit = auditSince(log, from);
            const fromChange = from;
            // 4. B: the Dashboard again
            from = log.mark();
            const resp = await B.page.goto(dashboard);
            await snap(B.page, 'walk-4-B-reload');
            f.s4 = {status: resp ? resp.status() : null, where: await where(B.page), audit: auditSince(log, from)};
            // 5. everything written since the save (the open Dashboard's own requests may come first)
            f.s5 = {auditSinceSave: auditSince(log, fromChange)};
            // put back
            from = log.mark();
            await A.page.goto(dashboard);
            f.restore = await changeOwnPassword(app, A.page, CHANGED, ORIGINAL);
            f.restore.audit = auditSince(log, from);
            await signOut(A.page);
        }
    } catch (e) {
        f.error = String(e).slice(0, 600);
        await snap(B.page, `${MODE}-error-B`).catch(() => {});
        if (A) await snap(A.page, `${MODE}-error-A`).catch(() => {});
    } finally {
        if (A) await A.close();
        await B.close();
    }
    record(`facts-${MODE}`, facts);
    console.log(JSON.stringify(facts, null, 1));
});
