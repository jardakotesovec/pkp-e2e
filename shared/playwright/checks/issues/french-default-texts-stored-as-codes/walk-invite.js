// Issue report docs/issues/U57-A8-french-default-texts-stored-as-codes.md, U07 OPS4's
// invitation email: the report's steps 17 to 22, walked through the screens on PKP's default
// test dataset (a dataset fleet, harness.md "Dataset fleets"). OJS and OMP are the control.
// The kit builds nothing: the French-primary server is created on screen (the dataset's
// server is English-primary, and the email is written in the context's primary language).
//
//   17. as admin, Administration › Hosted … › "Create …": path u07hk3, English and French,
//       French primary
//   18. /u07hk3/en/management/settings/access › "Invite to a role"
//   19. a new address, "Search User"
//   20. Given/Family Name, role Moderator (OJS Section editor, OMP Series editor), today,
//       "Appear on the masthead", "Save And Continue"
//   21. "Invite user to the role"
//   22. the email (the slot's Mailpit): its role lines and every `##key##`
// Besides the screens it reads the new context's saved role names (fr_CA, en).
//
// MODE=nb (the neighbour, runs alone, for a fix trial): a French-primary context created on
// screen (path u07hk3<run>), its "Rôles" tab under /fr_CA/ and its saved fr_CA role names,
// and publicknowledge's saved fr_CA role names: with the fix in, only the names the app's
// French file lacks may change; translated names and the dataset's saved names stay.
//
// INVITE_ROLE=<label> in front invites to another role (the manager role) on a fleet the
// steps already ran on (the context is there; step 17's second create is refused, recorded).
// ACCEPT=1 in front then opens the email's "Accept Invitation" link signed out and records the
// page it opens (what it names the role).
//
// The address in step 19 carries the app and the run (u07hk3-<app>-<run>@example.org), since
// the slot's Mailpit is shared by every app and line.
//
// Reset first:  npm run fleet-prep -- --feature issues-hk3 --dataset 7 --reset
// Run (main):   PROBE_FEATURE=issues-hk3 PROBE_AGENT=hk3 node bin/probe.js all shared/playwright/checks/issues/french-default-texts-stored-as-codes/walk-invite.js
// Run (3.5):    PKP_E2E_LINE=stable-3_5_0 npm run fleet-prep -- --feature issues-hk3-3_5 --dataset 7 --reset
//               PKP_E2E_LINE=stable-3_5_0 PROBE_RUN=r35 PROBE_FEATURE=issues-hk3-3_5 PROBE_AGENT=hk3 node bin/probe.js all <this file>
// Facts: .reports/<feature>/hk3/invite[-<run>]-<app>.json
const {forEachApp, launch, signIn, signOut, record, screen, sql} = require('../../../probe');
const L = require('./lib');

const MODE = process.env.MODE || 'steps';
const RUN = process.env.PROBE_RUN || 'main';

function storedRoles(app, path) {
    const T_ = app.contextTables;
    return sql(app, `SELECT g.role_id || ' ' || COALESCE((SELECT setting_value FROM user_group_settings WHERE user_group_id = g.user_group_id AND setting_name = 'name' AND locale = 'fr_CA'), '(none)') || ' | ' || COALESCE((SELECT setting_value FROM user_group_settings WHERE user_group_id = g.user_group_id AND setting_name = 'name' AND locale = 'en'), '(none)') FROM user_groups g JOIN ${T_.table} c ON c.${T_.id} = g.context_id WHERE c.path = '${path}' ORDER BY g.user_group_id`).split('\n').filter(Boolean);
}

forEachApp(async (app) => {
    if (!app.dataset) throw new Error('walk-invite.js runs on a dataset fleet only (fleet-prep --dataset n)');
    const f = {app: app.name, line: app.line || 'main', run: RUN, mode: MODE, steps: {}};
    const {page, close} = await launch(app);
    page.setDefaultTimeout(L.T);
    const bad = [];
    page.on('response', (r) => {
        if (r.status() >= 500) bad.push(`${r.status()} ${r.request().method()} ${r.url().replace(/^https?:\/\/[^/]+/, '').slice(0, 160)}`);
    });
    page.on('pageerror', (e) => bad.push(`pageerror ${L.flat(e.message, 200)}`));
    const snap = async (key) => record(key, await screen(page).catch((e) => ({error: L.flat(e.message, 200)})));
    const ctx = MODE === 'nb' ? `u07hk3${RUN.replace(/[^a-z0-9]/g, '')}` : 'u07hk3';
    try {
        await signIn(page, 'admin');
        // 17 (or the neighbour's context)
        try {
            f.steps.s17create = await L.createFrenchPrimaryContext(page, app, {
                name: `${ctx} ${L.WORDS[app.name].noun}`, frName: `${L.WORDS[app.name].noun} ${ctx} FR`, initials: ctx, path: ctx, email: `${ctx}@example.org`,
            });
        } catch (e) {
            f.steps.s17create = {error: L.flat(e.message, 300)};
        }
        await snap('s17-created');
        f.storedNew = storedRoles(app, ctx);
        if (MODE === 'nb') {
            const text = await L.readTab(page, app, `/index.php/${ctx}/fr_CA/management/settings/access`, 'roles');
            f.steps.nbRolesFr = {text, codes: L.codes(text)};
            await snap('nb-roles-fr');
            f.storedPk = storedRoles(app, app.contextPath);
        } else {
            // 18 to 21
            const email = `u07hk3-${app.name}-${RUN.replace(/[^a-z0-9]/g, '')}@example.org`;
            try {
                f.steps.invite = await L.inviteToRole(page, app, ctx, email, snap, process.env.INVITE_ROLE || L.ROLE[app.name]);
            } catch (e) {
                f.steps.invite = {error: L.flat(e.message, 300)};
                await snap('s18-21-error');
            }
            // 22
            f.steps.s22mail = await L.readInviteMail(app, email, (f.steps.invite && f.steps.invite.sentAt) || new Date(Date.now() - 600_000));
            if (process.env.ACCEPT && f.steps.s22mail.acceptUrl) {
                await signOut(page).catch(() => {});
                const u = f.steps.s22mail.acceptUrl.replace(/^https?:\/\/[^/]+/, '');
                const r = await page.goto(app.url(u)).catch((e) => ({error: e.message}));
                await page.waitForLoadState('networkidle').catch(() => {});
                await L.sleep(1500);
                const text = L.flat(await page.locator('main, body').first().innerText().catch(() => ''), 2500);
                f.steps.acceptPage = {status: r && r.status ? r.status() : r, text, codes: L.codes(text)};
                await snap('accept-page');
            }
        }
        await signOut(page).catch(() => {});
    } finally {
        f.serverOrScriptErrors = bad;
        record('invite', f);
        const m = f.steps.s22mail || {};
        console.log(`[${app.name} ${f.line} ${RUN} ${MODE}]`, JSON.stringify({create: f.steps.s17create, sent: f.steps.invite && f.steps.invite.sent, roleLines: m.roleLines, codes: m.codesText, err: m.error || (f.steps.invite && f.steps.invite.error), nb: f.steps.nbRolesFr && f.steps.nbRolesFr.codes, accept: f.steps.acceptPage, storedNew: f.storedNew, bad}));
        await close();
    }
});
