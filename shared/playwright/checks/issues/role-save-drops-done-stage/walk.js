// U54 A15 walk (issue report docs/issues/U54-A15-role-save-stops-editing-published-submissions.md).
// On PKP's default test dataset, freshly loaded, per app (OJS submission 1, OMP 14, OPS 2, each
// published and so in the Done stage):
//   A0 (OMP) `dbarnes` assigns `dbuskins` as "Series editor" (Production › Participants › Assign).
//   A. `dbuskins` (Section editor / Series editor / Moderator) adds to the latest version's
//      "Abstract" (OJS 1.1, unpublished; OMP and OPS 1.0, published) and saves; `dbarnes` opens the role's "Edit" in Settings › Users & Roles › "Roles"
//      and presses "OK" with nothing changed (the row read before, after and after a reload);
//      `dbuskins` edits and saves again.
//   B. (OJS) the same for the author `amwandenga` and the "Author" role.
//   MODE=nb: the neighbour check instead (the same with and without the fix): as `dbarnes`,
//      N1 "Copyeditor" › "Edit", "Production" ticked, "OK" (stored 4 → 4,5); N2 "Create New Role" at
//      the Section Editor (Moderator) level, "u54n13b role" / "U54N", its first stage ticked, "OK".
//   ONLY=ojs,omp,ops PROBE_FEATURE=<feature> PROBE_AGENT=<id> node bin/probe.js all shared/playwright/checks/issues/role-save-drops-done-stage/walk.js
const {forEachApp, launch, signIn, signOut, record, screen} = require('../../../probe');
const H = require('./lib.js');

const MODE = process.env.MODE || 'steps';
const LEVEL = {ojs: 'Section Editor', omp: 'Series Editor', ops: 'Moderator'};

async function steps(app, page, c, facts) {
    const ctx = {contextPath: app.contextPath};
    // A0
    if (c.assign) {
        await signIn(page, 'dbarnes', ctx);
        facts.a0assign = await H.assignParticipant(page, app, c.id, c.assign).catch((e) => ({error: H.flat(e.message, 300)}));
    }
    // A1
    await signIn(page, c.editor, ctx);
    await H.openWorkflow(page, app, c.id);
    facts.a1edit = await H.editAbstract(page, ' u54n13b');
    record('a1-editor-edit', await screen(page));

    // A2
    await signIn(page, 'dbarnes', ctx);
    const tab = await H.rolesTab(page, app);
    facts.columns = tab.stages;
    facts.a2storedBefore = H.stored(app, c.editorRole);
    facts.a2rowBefore = await H.row(tab, c.editorRole);
    facts.a2save = await H.saveRole(page, tab, c.editorRole);
    facts.a2rowAfter = await H.row(tab, c.editorRole);
    await tab.reload();
    facts.a2rowAfterReload = await H.row(tab, c.editorRole);
    facts.a2storedAfter = H.stored(app, c.editorRole);
    record('a2-roles-after', await screen(page));

    // A3
    await signIn(page, c.editor, ctx);
    await H.openWorkflow(page, app, c.id);
    facts.a3edit = await H.editAbstract(page, ' again');
    facts.a3stored = H.abstractEnds(app, c.id, ' again');
    record('a3-editor-edit', await screen(page));

    // B
    if (c.author) {
        await signIn(page, c.author, ctx);
        await H.openWorkflow(page, app, c.id, {author: true});
        facts.b1edit = await H.editAbstract(page, ' author');
        await signIn(page, 'dbarnes', ctx);
        const t = await H.rolesTab(page, app);
        facts.b2storedBefore = H.stored(app, 'Author');
        facts.b2save = await H.saveRole(page, t, 'Author');
        facts.b2storedAfter = H.stored(app, 'Author');
        await signIn(page, c.author, ctx);
        await H.openWorkflow(page, app, c.id, {author: true});
        facts.b3edit = await H.editAbstract(page, ' author again');
        facts.b3stored = H.abstractEnds(app, c.id, ' author again');
        record('b3-author-edit', await screen(page));
    }
}

async function neighbour(app, page, facts) {
    await signIn(page, 'dbarnes', {contextPath: app.contextPath});
    let tab = await H.rolesTab(page, app);
    const n = {};
    if (tab.stages.includes('Production') && app.name !== 'ops') {
        n.copyeditorBefore = H.stored(app, 'Copyeditor');
        n.copyeditorSave = await H.saveRole(page, tab, 'Copyeditor', (w) => w.stageBox('Production').check());
        n.copyeditorAfter = H.stored(app, 'Copyeditor');
    }
    tab = await H.rolesTab(page, app);
    const win = await tab.openCreate();
    await win.chooseLevel(LEVEL[app.name]);
    await win.nameBox().fill('u54n13b role');
    await win.abbrevBox().fill('U54N');
    const first = tab.stages[0];
    if (await win.stageBox(first).isVisible().catch(() => false)) await win.stageBox(first).check();
    n.createPostLabels = await win.stageLabels().catch(() => []);
    const resp = await win.save();
    n.createStatus = resp.status();
    n.created = H.stored(app, 'u54n13b role');
    record('nb-roles', await screen(page));
    facts.neighbour = n;
}

forEachApp(async (app) => {
    const c = H.CASES[app.name];
    const facts = {app: app.name, line: app.line || 'main', mode: MODE};
    const {page, close} = await launch(app);
    try {
        if (MODE === 'nb') await neighbour(app, page, facts);
        else await steps(app, page, c, facts);
        await signOut(page).catch(() => {});
    } catch (e) {
        facts.error = H.flat(e.stack || e.message, 1200);
        record('error', await screen(page).catch(() => null));
    } finally {
        record(MODE === 'nb' ? 'facts-nb' : 'facts', facts);
        console.log(JSON.stringify(facts, null, 1));
        await close();
    }
});
