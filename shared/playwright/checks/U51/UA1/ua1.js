// U51 claim check, chunk UA1: the UNASSIGNED entry ROUTE-043, OJS's legacy
// `manager` page (pages/manager/index.php, a `switch ($op)` over the old
// subscription ops that sets no handler). Typed addresses only, GET, as a
// person types them: `/manager`, `/manager/index`, each listed op and an
// unknown op, signed out and as each role. OMP and OPS (no pages/manager)
// are controls: `/manager/subscriptionTypes` as the manager only.
//
// No seeds and no scratch context: the drive only reads, on a dataset fleet
// (docs/process/dataset.md users), so it never calls bootstrap or a scenario
// key. One record per app and role: ua1-<role>-<run>-<app>.json (the kit adds
// PROBE_RUN and the app), each address with its HTTP status, final URL, title, heading,
// a body excerpt and the server log lines written during the request.
//
// Run (two runs each, r1/r2 on main, s1/s2 on stable-3_5_0; no other script
// or PART is needed):
//   bin/app-lock.sh shared ojs -- env PROBE_FEATURE=issues-cc29f PKP_E2E_DATASET=4 PROBE_AGENT=cc29f PROBE_RUN=r1 PROBE_NOTES_FEATURE=U51 node bin/probe.js ojs shared/playwright/checks/U51/UA1/ua1.js
//   PKP_E2E_LINE=stable-3_5_0 PROBE_FEATURE=issues-cc29f-3_5 PKP_E2E_DATASET=4 PROBE_AGENT=cc29f PROBE_RUN=s1 PROBE_NOTES_FEATURE=U51 node bin/probe.js ojs shared/playwright/checks/U51/UA1/ua1.js
//   (then omp, ops: the control only; UA1_NOTE=1 appends the answer to
//   .reports/U51/screen-notes.md through note(), once per line is enough)
// The campaign fleet works too (PROBE_FEATURE=U51, no PKP_E2E_DATASET) if
// ROLES names roster users: ROLES=visitor,reader:reader.rita,manager:manager.maya
const {forEachApp, launch, signIn, signOut, screen, shot, record, note, serverLog} = require('../../../probe');

const OPS_OJS = ['', 'index', 'subscriptionPolicies', 'saveSubscriptionPolicies', 'subscriptionTypes', 'deleteSubscriptionType',
    'createSubscriptionType', 'selectSubscriber', 'editSubscriptionType', 'updateSubscriptionType', 'moveSubscriptionType', 'noSuchOp'];
// the dataset has no subscription manager (dataset.md): skipped
const DEFAULT_ROLES = 'visitor,reader:amwandenga,manager:rvaca,admin:admin';
const ROLES = (process.env.ROLES || DEFAULT_ROLES).split(',').map((r) => {
    const [role, user] = r.split(':');
    return {role, user};
});
const flat = (t, n = 300) => String(t ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

forEachApp(async (app) => {
    const ops = app.name === 'ojs' ? OPS_OJS : ['subscriptionTypes'];
    const roles = app.name === 'ojs' ? ROLES : ROLES.filter((r) => r.role === 'manager');
    const log = serverLog(app);
    const seen = new Set();
    for (const {role, user} of roles) {
        const {page, close} = await launch(app);
        const rows = [];
        let landed = null;
        try {
            if (user) {
                await signIn(page, user, {contextPath: app.contextPath});
                await page.waitForURL((u) => !/\/login(\/|$)/.test(u.pathname), {timeout: 15_000}).catch(() => {});
                landed = page.url(); // where the account lands: not the login page proves the sign-in
            }
            for (const op of ops) {
                const address = `/index.php/${app.contextPath}/manager${op ? `/${op}` : ''}`;
                const from = log.mark();
                const response = await page.goto(app.url(address)).catch((e) => ({error: e.message}));
                const snap = await screen(page);
                const status = response && typeof response.status === 'function' ? response.status() : response?.error;
                const heading = flat(await page.locator('h1').first().textContent({timeout: 2000}).catch(() => ''));
                const body = flat(await page.locator('main, body').first().innerText().catch(() => ''));
                const row = {op: op || '(none)', address, status, finalUrl: page.url(), title: snap.title, heading, body, log: log.since(from)};
                rows.push(row);
                seen.add(`${status} "${heading}"`);
                console.log(`[ua1] ${app.name} ${role} ${row.op}: ${status} "${snap.title}" h1="${heading}" log=${row.log.length}`);
                if (op === 'subscriptionTypes') await shot(page, `ua1-${role}-${op}`);
            }
            if (user) await signOut(page);
        } finally {
            record(`ua1-${role}`, {role, user: user || null, landed, line: app.line || 'main', rows});
            await close();
        }
    }
    if (process.env.UA1_NOTE) {
        note(`${app.name} ${app.line || 'main'} typed /manager/<op> (UA1, ROUTE-043), ${ops.length} addresses x ${roles.length} roles answered: ${[...seen].join('; ')}. Read page.goto's response.status() and the first h1; no locator beyond that.`);
    }
});
