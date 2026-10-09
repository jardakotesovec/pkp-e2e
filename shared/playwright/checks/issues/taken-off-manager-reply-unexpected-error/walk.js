// U37 A36 issue walk (docs/issues/U37-A36-taken-off-manager-reply-unexpected-error.md): a manager-level
// person whom someone else's "Edit" takes off a discussion while they have its window open replies from
// that window and is told "An unexpected error has occurred. Please reload the page and try again.".
//
// Runs on a dataset fleet (PKP's default test dataset, docs/process/dataset.md), main or 3.5:
//   PROBE_FEATURE=<dataset feature> PROBE_AGENT=<id> node bin/probe.js all \
//     shared/playwright/checks/issues/taken-off-manager-reply-unexpected-error/walk.js [neighbour|late]
// Reset the fleet first (the walk adds a discussion). No assertions: each step is recorded with
// screen(); facts-<app>.json (neighbour-facts-<app>.json, late-facts-<app>.json) holds the reads.
//
// Steps (per app: lib.js WORDS), two browsers:
//  1-2. Browser 1, dbarnes: the stage's "Tasks & Discussions" ("Discussions" grid on 3.5), "Add",
//       name "Reference check hkrg", the two others ticked, a message, "Save".
//  3.   dbarnes presses the row's name; the window stays open.
//  4.   Browser 2, rvaca: the row's "Edit", "Daniel Barnes (dbarnes)" unticked, "Save".
//  5.   Browser 1, the open window: "Add New Message" ("Add Message" on 3.5), a reply, "Save".
//  6.   "OK" (what the window behind "Error" still holds), the page reloaded, the row's name pressed
//       again; rvaca's read of the same window.
//
// `neighbour` (main only; runs alone, the path a fix must leave as it is): dbarnes adds "Control hkrg"
// with the same two; the first of them, who is not manager-level, has its window open in browser 2
// while dbarnes unticks them in "Edit"; their reply is refused with the reason; the second, still a
// participant, replies and the reply is saved.
//
// `late` (main only; runs alone): the window opened after the untick. dbarnes adds "Late check hkrg"
// and stays on the stage's page with no window open; rvaca unticks dbarnes in "Edit"; dbarnes then
// presses the row's name without reloading the page.
const {forEachApp, launch, signIn, signOut, screen, shot, record, idle, serverLog} = require('../../../probe');
const L = require('./lib.js');

const ARGS = process.argv.slice(2);
const MODE = ARGS.includes('neighbour') ? 'neighbour' : ARGS.includes('late') ? 'late' : 'steps';
const NAME = 'Reference check hkrg';
const CONTROL = 'Control hkrg';
const LATE = 'Late check hkrg';
const OPENING = 'Please check the references.';
const REPLY = 'References checked.';

async function steps(app, w, facts, b1, b2) {
    const is35 = app.line === 'stable-3_5_0';
    const p1 = b1.page;
    const p2 = b2.page;
    const log = serverLog(app);

    // 1-2. dbarnes adds the discussion.
    await signIn(p1, w.manager, {contextPath: app.contextPath});
    if (is35) {
        await L.openWorkflow35(p1, app, w);
        facts.add = await L.addQuery35(p1, {tickNames: [w.managerName, ...w.otherNames], subject: NAME, message: OPENING, label: '01'});
        await L.openWorkflow35(p1, app, w);
    } else {
        const panel1 = L.panelOf(p1, app, w);
        await panel1.gotoEditorial(w.id, w.menuKey);
        facts.add = await L.addDiscussion(p1, panel1, {name: NAME, tick: w.others, message: OPENING, label: '01'});
    }
    record('02-panel-after-add', await screen(p1));

    // 3. dbarnes opens the discussion's window and leaves it open.
    let win1;
    if (is35) {
        win1 = await L.openQuery35(p1, NAME, '03-manager');
    } else {
        win1 = await L.panelOf(p1, app, w).openItem(NAME);
        facts.windowParticipants = await win1.participantUsernames().catch(() => null);
        record('03-manager-window', await screen(p1));
    }

    // 4. rvaca unticks dbarnes in "Edit".
    await signIn(p2, w.editor, {contextPath: app.contextPath});
    let panel2 = null;
    if (is35) {
        await L.openWorkflow35(p2, app, w);
        facts.untick = await L.untickInEdit35(p2, NAME, w.managerName, '04');
    } else {
        panel2 = L.panelOf(p2, app, w);
        await panel2.gotoEditorial(w.id, w.menuKey);
        facts.untick = await L.untickInEdit(p2, panel2, NAME, w.manager, '04');
    }

    // 5. dbarnes replies from the window still open.
    const from = log.mark();
    facts.reply = is35 ? await L.replyInOpenWindow35(p1, win1, REPLY, '05') : await L.replyInOpenWindow(p1, win1, REPLY, '05');
    await shot(p1, '05-after-save').catch(() => {});
    facts.serverLog = log.since(from);

    // 6. The page reloaded; then rvaca's read of the same discussion.
    if (is35) {
        facts.afterReload = await L.readAfterReload35(p1, app, w, NAME, '06-manager');
        facts.editorRead = await L.readAfterReload35(p2, app, w, NAME, '06-editor');
    } else {
        facts.afterReload = await L.readAfterReload(p1, L.panelOf(p1, app, w), NAME, '06-manager');
        await shot(p1, '06-manager-reloaded').catch(() => {});
        facts.editorRead = await L.readAfterReload(p2, panel2, NAME, '06-editor');
    }
}

async function neighbour(app, w, facts, b1, b2) {
    const p1 = b1.page;
    const p2 = b2.page;
    const [takenOff, stays] = w.others;
    facts.takenOff = `${takenOff} (${w.otherRoles[0]})`;
    facts.stays = `${stays} (${w.otherRoles[1]})`;
    const openStage = async (panel, role) => (role === 'Author' ? panel.gotoAuthor(w.id, w.menuKey) : panel.gotoEditorial(w.id, w.menuKey));

    // dbarnes adds the control discussion.
    await signIn(p1, w.manager, {contextPath: app.contextPath});
    const panel1 = L.panelOf(p1, app, w);
    await panel1.gotoEditorial(w.id, w.menuKey);
    facts.add = await L.addDiscussion(p1, panel1, {name: CONTROL, tick: w.others, message: OPENING, label: 'n1'});

    // The person who is not manager-level opens its window.
    await signIn(p2, takenOff, {contextPath: app.contextPath});
    const panel2 = L.panelOf(p2, app, w);
    await openStage(panel2, w.otherRoles[0]);
    const win2 = await panel2.openItem(CONTROL);
    record('n2-window', await screen(p2));

    // dbarnes unticks them.
    facts.untick = await L.untickInEdit(p1, panel1, CONTROL, takenOff, 'n3');

    // Their reply from the open window, then their page reloaded.
    facts.reply = await L.replyInOpenWindow(p2, win2, REPLY, 'n4');
    await shot(p2, 'n4-after-save').catch(() => {});
    facts.afterReload = await L.readAfterReload(p2, panel2, CONTROL, 'n5');
    await signOut(p2);

    // The person still ticked replies.
    await signIn(p2, stays, {contextPath: app.contextPath});
    const panel3 = L.panelOf(p2, app, w);
    await openStage(panel3, w.otherRoles[1]);
    const win3 = await panel3.openItem(CONTROL);
    facts.participantReply = await L.replyInOpenWindow(p2, win3, `${REPLY} (participant)`, 'n6');
}

async function late(app, w, facts, b1, b2) {
    const p1 = b1.page;
    const p2 = b2.page;

    // dbarnes adds the discussion and stays on the stage's page, no window open.
    await signIn(p1, w.manager, {contextPath: app.contextPath});
    const panel1 = L.panelOf(p1, app, w);
    await panel1.gotoEditorial(w.id, w.menuKey);
    facts.add = await L.addDiscussion(p1, panel1, {name: LATE, tick: w.others, message: OPENING, label: 'l1'});

    // rvaca unticks dbarnes.
    await signIn(p2, w.editor, {contextPath: app.contextPath});
    const panel2 = L.panelOf(p2, app, w);
    await panel2.gotoEditorial(w.id, w.menuKey);
    facts.untick = await L.untickInEdit(p2, panel2, LATE, w.manager, 'l2');

    // dbarnes presses the row's name on the page loaded before the untick.
    facts.openedAfter = await L.openWithoutReload(p1, panel1, LATE, REPLY, 'l3');
    await shot(p1, 'l3-window').catch(() => {});
}

forEachApp(async (app) => {
    const w = L.WORDS[app.name];
    const facts = {app: app.name, line: app.line || 'main', mode: MODE, submission: w.id, stage: w.stage};
    const b1 = await launch(app);
    const b2 = await launch(app);
    try {
        if (MODE === 'neighbour') await neighbour(app, w, facts, b1, b2);
        else if (MODE === 'late') await late(app, w, facts, b1, b2);
        else await steps(app, w, facts, b1, b2);
    } catch (e) {
        facts.error = String(e && e.message).slice(0, 800);
        record('error-screen-1', await screen(b1.page).catch(() => null));
        record('error-screen-2', await screen(b2.page).catch(() => null));
        await shot(b1.page, 'error-screen-1').catch(() => {});
        await shot(b2.page, 'error-screen-2').catch(() => {});
    } finally {
        record(MODE === 'steps' ? 'facts' : `${MODE}-facts`, facts);
        console.log(`[${app.name}] ${JSON.stringify(facts)}`);
        await b1.close();
        await b2.close();
    }
});
