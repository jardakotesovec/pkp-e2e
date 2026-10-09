// U37 A33 walk (issue report docs/issues/U37-A33-history-same-second-order.md).
// On PKP's default test dataset for main, dbarnes at Production of the submission the U37 A29 walk's lib names
// (OJS 5, OMP 4, OPS 1):
//   add      "Tasks & Discussions" › "Add": "hkrh order", the first person ticked, a message, "Save"
//   reply    the discussion's name › "Add New Message", a message, "Attach Files" › "Upload File" ›
//            replacement.pdf › "Attach Files", "Save", "Close"; the row's "History"
//   edit     the row's "Edit": the second person ticked, figure.png uploaded the same way, "Save"; "History"
// After each "History" the item's rows of event_log are read (evidence, not a step): which lines share a second,
// and the order the History is meant to give (newest first, of one second the latest saved first).
//   PROBE_FEATURE=<dataset fleet> PROBE_AGENT=<id> node bin/probe.js all shared/playwright/checks/issues/history-same-second-order/walk.js
//   (PROBE_RUN=fix in front for the walk with the fix applied.)
// On stable-3_5_0 (PKP_E2E_LINE=stable-3_5_0 PROBE_RUN=r35 in front, PROBE_FEATURE the line's fleet) the stage has
// the older "Production Discussions" grid: "Add discussion" with the person, a subject, a message and a file,
// "OK"; then the row's actions, read for a "History".
const {forEachApp, launch, signIn, record} = require('../../../probe');
const L = require('./lib.js');

forEachApp(async (app) => {
    const {A29} = L;
    const facts = {app: app.name, line: app.line || 'main', words: A29.WORDS[app.name], second: L.SECOND[app.name]};
    const step = async (name, fn) => {
        try {
            facts[name] = await fn();
        } catch (e) {
            facts[name] = {failed: String(e.stack || e).split('\n').slice(0, 4).join(' | ')};
        }
        console.log(`[${app.name}]`, name, JSON.stringify(facts[name]).slice(0, 4000));
    };
    const name = 'hkrh order';
    const {page, close} = await launch(app);
    try {
        await signIn(page, 'dbarnes', {contextPath: app.contextPath});
        if (facts.line !== 'main') {
            await step('r35', () => A29.walk35(page, app, {subject: name, message: 'First message.', file: A29.REPLY_FILE}));
            return;
        }
        const panel = await A29.openPanel(page, app);
        await step('add', () => A29.addItem(page, app, panel, {name, message: 'First message.', label: 'add'}));
        await step('reply', async () => {
            const replied = await A29.replyWithFile(page, app, panel, name, {message: 'A file for you.', file: A29.REPLY_FILE, label: 'reply'});
            return {...replied, history: await L.historyAndLog(page, app, panel, name, 'reply')};
        });
        await step('edit', async () => {
            const edited = await L.editAddPersonAndFile(page, app, panel, name, {person: L.SECOND[app.name], file: A29.FIRST_FILE, label: 'edit'});
            return {...edited, history: await L.historyAndLog(page, app, panel, name, 'edit')};
        });
    } finally {
        record('facts', facts);
        await close();
    }
});
