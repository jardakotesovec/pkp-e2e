// Issue walk for docs/issues/U21-A25-manager-turned-away-from-make-submission.md (spec U21, A25).
// On PKP's default test dataset (OJS, OMP), `rvaca` ("Journal manager" / "Press manager", no other
// role) opens "Make a Submission" from the side menu, keeps that form open, and in a second tab
// unticks "Allow user self-registration" on the author roles that allow it (Settings › Users & Roles › Roles:
// "Author"; on the press "Author", "Chapter Author" and "Volume editor"), opens "Make a Submission" again, then presses
// "Begin Submission" on the form loaded first. Each step records what the screen offers and never
// throws on a state the fix brings (the form where "Not Allowed" was).
//   MODE=walk (default): the Steps.
//   MODE=nb: the neighbour, alone: with the author roles closed as in step 2, a newcomer registered
//            on the "Register" page (Reader only) and `dbarnes` ("Journal editor" / "Press editor")
//            open "Make a Submission". Neither may change with the fix.
//   PROBE_FEATURE=issues-n23j PROBE_AGENT=n23j node bin/probe.js all shared/playwright/checks/issues/manager-turned-away-from-make-submission/walk.js
//   (on an install freshly loaded from the default dataset; PROBE_RUN=fix|nb-in|nb-out for a trial.)
const {forEachApp, launch, signIn, signOut, screen, shot, record, tag} = require('../../../probe');
const S = require('./lib.js');

const MODE = process.env.MODE || 'walk';

async function snap(page, name, facts) {
    let s;
    try { s = await screen(page); } catch (e) { s = {url: page.url(), error: String(e.message).slice(0, 300)}; }
    if (facts) s.facts = facts;
    record(name, s);
    await shot(page, name).catch(() => {});
}

async function step(facts, name, fn) {
    try { facts[name] = await fn(); } catch (e) { facts[name] = {error: String(e.stack || e).split('\n').slice(0, 4).join(' | ')}; }
    return facts[name];
}

forEachApp(async (app) => {
    const W = S.WORDS[app.name];
    if (!W) { console.log(`[${app.name}] no such surface in this walk (OJS and OMP only)`); return; }
    const F = {app: app.name, line: app.line || 'main', mode: MODE, run: process.env.PROBE_RUN || null};
    const {page, close} = await launch(app);
    try {
        F.groupStages = S.groupStages(app);
        if (MODE === 'walk') {
            F.rolesBefore = S.rolesOf(app, 'rvaca');
            // 1. rvaca: "Start A New Submission" in the side menu; the form stays open in this tab.
            await signIn(page, 'rvaca', {contextPath: app.contextPath});
            await step(F, 's1-entry', () => S.startFromSideMenu(page, app));
            await step(F, 's1-start', () => S.readStart(page));
            await snap(page, 'w1-start-open', F['s1-start']);
            // 2. A second tab: untick "Allow user self-registration" on the author roles.
            const tab = await page.context().newPage();
            await step(F, 's2-roles', () => S.setSelfRegistration(tab, app, W.authorGroups, false));
            await snap(tab, 'w2-roles-closed', F['s2-roles']);
            // 3. The second tab: "Start A New Submission" again.
            await step(F, 's3-entry', () => S.startFromSideMenu(tab, app));
            await step(F, 's3-start', () => S.readStart(tab));
            await snap(tab, 'w3-start-closed', F['s3-start']);
            await tab.close();
            // 4. The first tab: fill the form loaded in step 1, "Begin Submission".
            await step(F, 's4-begin', async () => {
                await S.fillStart(page, {title: `${tag('u21n23j')} manager submission`, section: W.section});
                return S.pressBegin(page);
            });
            await snap(page, 'w4-after-begin', F['s4-begin']);
            if (F['s4-begin'] && F['s4-begin'].id) F.participants = S.participantsOf(app, F['s4-begin'].id);
            F.rolesAfter = S.rolesOf(app, 'rvaca');
            F.groupStagesAfter = S.groupStages(app);
            await signOut(page);
        } else {
            // Precondition as step 2, as rvaca.
            await signIn(page, 'rvaca', {contextPath: app.contextPath});
            await step(F, 'n0-roles', () => S.setSelfRegistration(page, app, W.authorGroups, false));
            await signOut(page);
            // A newcomer registers (Reader only) and opens "Make a Submission".
            const u = tag('u21n23j').replace(/[^a-z0-9]/gi, '').toLowerCase();
            await step(F, 'n1-register', () => S.register(page, app, {givenName: 'Nell', familyName: 'Newcomer', username: u}));
            F.newcomerRoles = S.rolesOf(app, u);
            await step(F, 'n1-open', () => S.openStart(page, app));
            await step(F, 'n1-start', () => S.readStart(page));
            await snap(page, 'n1-newcomer-start', F['n1-start']);
            F.newcomerRolesAfter = S.rolesOf(app, u);
            await signOut(page).catch(() => {});
            // dbarnes, the editor: the start form either way.
            await signIn(page, 'dbarnes', {contextPath: app.contextPath});
            await step(F, 'n2-open', () => S.openStart(page, app));
            await step(F, 'n2-start', () => S.readStart(page));
            await snap(page, 'n2-editor-start', F['n2-start']);
            await signOut(page);
        }
    } finally {
        record(`facts-${MODE}`, F);
        console.log(JSON.stringify(F, null, 1));
        await close();
    }
});
