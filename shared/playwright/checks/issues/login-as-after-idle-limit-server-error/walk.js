// U01 A8 walk (issue report docs/issues/U01-A8-login-as-after-idle-limit-server-error.md).
// On PKP's default test dataset, as the manager `rvaca`:
//   steps (default):
//     1. signed out, the Login page: sign in with "Keep me logged in" as the page shows it (ticked)
//     2. the idle limit passes: stood in for by moving the sessions' last activity back 8 days
//        (lib.lapseSessions; the app's session lifetime is 7 days)
//     3. Settings › Users & Roles: where it lands (signed in, or the Login page)
//     4. row "David Buskins" › "Login As" › "OK": the answer, and the server log since; not taken
//        when step 3 opened the Login page (recorded as such)
//     then (reads, not steps): the journal's home page header and the Login page in the same
//     session; when step 3 was signed out, the bare Dashboard address and Users & Roles once
//     more; and the control: sign out, sign in again, step 4 once more.
//   nb (the fix's neighbour check, run alone, fix in and out):
//     a. signed out, the sign-in-as address typed for David Buskins: the Login page
//     b. "Keep me logged in" ticked, the idle limit passes, the address typed for `admin`, whom a
//        manager may not impersonate: the "no administrative rights" page, never an impersonation
//     c. "Keep me logged in" unticked, the idle limit passes, Settings › Users & Roles: signed out
//        (the Login page), as before
//   dash (a read beside the steps, unpatched code): "Keep me logged in" ticked, the idle limit
//     passes, then the bare Dashboard address first, whose handler is the one place left that asks
//     Laravel's guard for the user without a signed-in check; then Users & Roles and the home page
//   cookie (a read beside the steps, unpatched code): the browser's cookies before and after the
//     first page opened past the idle limit (Users & Roles)
// Every step records its result or its error and goes on.
// Since pkp-lib 3407fc5bc0 (2026-10-06; 3.5 edc3d36c74) the app does not read the "Keep me logged in"
// cookie, so on unpatched code step 3 opens the Login page and the fault does not show. The two
// trial diffs beside this file put the cookie read back as it was before that commit
// (trial-cookie-read.diff) and add the report's fix.diff on top (trial-cookie-read-fix.diff);
// trial.sh runs the steps and nb under each, and the steps under fix.diff alone.
//   Reset first: npm run fleet-prep -- --feature <feature> --dataset <n> --reset
//   PROBE_FEATURE=<feature> PROBE_AGENT=<id> [PROBE_RUN=<run>] node bin/probe.js all shared/playwright/checks/issues/login-as-after-idle-limit-server-error/walk.js [steps|nb|dash|cookie] [gone]
//   `gone` also takes the session cookie out of the browser at the idle limit (what a real wait
//   leaves: that cookie expires with the row); without it only the rows are aged.
// Facts: .reports/<feature>/<id>/facts-<mode>[-<run>]-<app>.json
const {forEachApp, launch, signOut, record, screen, sql, serverLog} = require('../../../probe');
const L = require('./lib.js');

const args = process.argv.slice(2);
const mode = args.find((a) => a !== 'gone') || 'steps';
// `gone`: the session cookie is taken out of the browser when the idle limit passes, as a real wait
// leaves it (lib.idleLimitPasses); without it the browser keeps the cookie of the lapsed row.
const gone = args.includes('gone');
const ACTOR = 'rvaca';
const TARGET = 'David Buskins';

async function step(facts, key, fn) {
    try {
        facts[key] = await fn();
    } catch (e) {
        facts[key] = {error: L.flat(String((e && e.message) || e), 300)};
    }
    console.log(`[fact] ${key}: ${JSON.stringify(facts[key]).slice(0, 1500)}`);
    return facts[key];
}

forEachApp(async (app) => {
    if (!app.dataset) throw new Error('walk.js runs on a dataset fleet');
    const facts = {app: app.name, line: app.line || 'main', mode, sessionCookie: gone ? 'removed at the idle limit' : 'kept'};
    const log = serverLog(app);
    const targetId = sql(app, `SELECT user_id FROM users WHERE username = 'dbuskins'`);
    const adminId = sql(app, `SELECT user_id FROM users WHERE username = 'admin'`);
    const signInAs = (id) => `/index.php/${app.contextPath}${L.loc(app)}/login/signInAsUser/${id}`;
    const {page, close} = await launch(app);
    try {
        await signOut(page).catch(() => {});
        if (mode === 'steps') {
            await step(facts, '1 sign in, box as shown', () => L.signInWithBox(page, app, ACTOR, null));
            await step(facts, '2 idle limit passes', () => L.idleLimitPasses(page, app, gone));
            const access = `/index.php/${app.contextPath}${L.loc(app)}/management/settings/access`;
            const at3 = await step(facts, '3 Users & Roles', async () => {
                const r = await L.typeAddress(page, app, access);
                const s = await screen(page);
                record('3-users-roles', s);
                const cookies = (await page.context().cookies()).map((c) => c.name);
                return {...r, signedIn: !/\/login(\?|$)/.test(r.landed), header: L.flat(s.text && s.text.header, 200), cookies};
            });
            const from = log.mark();
            await step(facts, '4 Login As David Buskins', async () => {
                if (!at3.signedIn) return {taken: false, why: 'step 3 did not open Users & Roles signed in'};
                const row = await L.usersRow(page, app, TARGET);
                const r = await L.loginAsOnRow(page, row);
                record('4-login-as', await screen(page));
                return r;
            });
            facts['4 server log'] = log.since(from).map((l) => L.flat(l, 400)).slice(0, 6);
            console.log(`[fact] 4 server log: ${JSON.stringify(facts['4 server log'])}`);
            await step(facts, 'read: home page header', () => L.homeHeader(page, app));
            await step(facts, 'read: Login page', () => L.typeAddress(page, app, `/index.php/${app.contextPath}${L.loc(app)}/login`));
            if (!at3.signedIn) {
                // Signed out with the remember cookie still in the browser: the one address whose
                // handler asks Laravel's guard for the user without a signed-in check (the bare
                // Dashboard address, PKPPageRouter::getHomeUrl()), then Users & Roles once more.
                const from5 = log.mark();
                await step(facts, 'read: bare Dashboard address', () => L.typeAddress(page, app, `/index.php/${app.contextPath}${L.loc(app)}/dashboard`));
                facts['read: bare Dashboard server log'] = log.since(from5).map((l) => L.flat(l, 300)).slice(0, 3);
                await step(facts, 'read: Users & Roles after it', () => L.typeAddress(page, app, access));
            }
            await step(facts, 'control: sign out, sign in, Login As', async () => {
                await signOut(page).catch(() => {});
                const signedIn = await L.signInWithBox(page, app, ACTOR, null);
                const row = await L.usersRow(page, app, TARGET);
                return {signedIn: signedIn.landed, loginAs: await L.loginAsOnRow(page, row)};
            });
        } else if (mode === 'nb') {
            await step(facts, 'a signed out, address for David Buskins', () => L.typeAddress(page, app, signInAs(targetId)));
            await step(facts, 'b sign in, box ticked', () => L.signInWithBox(page, app, ACTOR, true));
            await step(facts, 'b idle limit passes', () => L.idleLimitPasses(page, app, gone));
            const from = log.mark();
            await step(facts, 'b address for admin', () => L.typeAddress(page, app, signInAs(adminId)));
            facts['b server log'] = log.since(from).map((l) => L.flat(l, 400)).slice(0, 6);
            await step(facts, 'b Users & Roles after', async () => {
                const r = await L.typeAddress(page, app, `/index.php/${app.contextPath}${L.loc(app)}/management/settings/access`);
                const s = await screen(page);
                return {landed: r.landed, status: r.status, header: L.flat(s.text && s.text.header, 200)};
            });
            await signOut(page).catch(() => {});
            await step(facts, 'c sign in, box unticked', () => L.signInWithBox(page, app, ACTOR, false));
            await step(facts, 'c idle limit passes', () => L.idleLimitPasses(page, app, gone));
            await step(facts, 'c Users & Roles', () => L.typeAddress(page, app, `/index.php/${app.contextPath}${L.loc(app)}/management/settings/access`));
        } else if (mode === 'dash') {
            // A read, not the steps: past the idle limit with the remember cookie in the browser,
            // the bare Dashboard address first. Its handler asks Laravel's guard for the user
            // without a signed-in check (PKPPageRouter::getHomeUrl()), the one such call left.
            const names = async () => (await page.context().cookies()).map((c) => c.name);
            await step(facts, 'sign in, box ticked', () => L.signInWithBox(page, app, ACTOR, true));
            await step(facts, 'idle limit passes', () => L.idleLimitPasses(page, app, gone));
            await step(facts, 'cookies before', names);
            const from = log.mark();
            await step(facts, 'bare Dashboard address', () => L.typeAddress(page, app, `/index.php/${app.contextPath}${L.loc(app)}/dashboard`));
            facts['server log'] = log.since(from).map((l) => L.flat(l, 300)).slice(0, 3);
            await step(facts, 'cookies after', names);
            // per session row used in the last ten minutes: Laravel's login key / PKP's userId / the user_id column
            await step(facts, 'recent sessions: laravel key/userId/user_id', async () => sql(app, `SELECT coalesce(string_agg((convert_from(decode(payload,'base64'),'UTF8') LIKE '%login_web_%')::text || '/' || (convert_from(decode(payload,'base64'),'UTF8') LIKE '%"userId"%')::text || '/' || coalesce(user_id::text,'null'), ', '), 'none') FROM sessions WHERE last_activity > extract(epoch from now()) - 600`));
            await step(facts, 'Users & Roles', () => L.typeAddress(page, app, `/index.php/${app.contextPath}${L.loc(app)}/management/settings/access`));
            await step(facts, 'home page header', () => L.homeHeader(page, app));
        } else if (mode === 'cookie') {
            // A read, not the steps: what becomes of the remember cookie on the first page opened
            // past the idle limit (Users & Roles, as in step 3), on unpatched code.
            const names = async () => (await page.context().cookies()).map((c) => c.name);
            await step(facts, 'sign in, box ticked', () => L.signInWithBox(page, app, ACTOR, true));
            await step(facts, 'idle limit passes', () => L.idleLimitPasses(page, app, gone));
            await step(facts, 'cookies before', names);
            await step(facts, 'Users & Roles', async () => {
                const r = await L.typeAddress(page, app, `/index.php/${app.contextPath}${L.loc(app)}/management/settings/access`);
                return {status: r.status, landed: r.landed, title: r.title};
            });
            await step(facts, 'cookies after', names);
        } else {
            throw new Error(`unknown mode ${mode}`);
        }
    } finally {
        record(`facts-${mode}`, facts);
        await close();
    }
});
