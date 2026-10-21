// Issue report on U55 A5: on the "Notify" tab, "Copy" ticked and then unticked before "Save"
// still sends the manager a copy (the send posts copy=false, which the server reads as ticked).
// Takes the report's Steps on PKP's default test dataset (a dataset fleet, harness.md "Dataset
// fleets"); the kit builds nothing. "Section editor" ["Series editor", "Moderator"] is held by
// dbuskins, sberardo and minoue in the dataset of each app; rvaca holds only the manager role.
//
// Default mode, the Steps (OJS, OMP, OPS):
//   1    `admin`: Site Settings › "Site Setup" › "Bulk Emails": tick the dataset's context, "Save"
//   2    `rvaca`: Settings › Users & Roles › "Notify"
//   3-6  the editors' role; "Copy" ticked then unticked; Subject and Email typed; "Save", "Send Email"
//   7    the emails Mailpit received with that subject
// `neighbour` as the argument (the fix in and out; runs alone, on a fresh dataset), as `rvaca`
// after step 1: the same send with "Copy" never touched (must reach the three editors alone),
// then, from the page opened again, with "Copy" ticked at "Save" (must reach the three and rvaca).
// Each step records what it finds, never throwing.
//
// Reset first:  npm run fleet-prep -- --feature issues-h21u --dataset 7 --reset
// Run (main):   PROBE_FEATURE=issues-h21u PROBE_AGENT=h21u node bin/probe.js all shared/playwright/checks/issues/notify-copy-unticked-still-sent/walk.js [neighbour]
// Run (3.5):    PKP_E2E_LINE=stable-3_5_0 npm run fleet-prep -- --feature issues-h21u-3_5 --dataset 7 --reset
//               PKP_E2E_LINE=stable-3_5_0 PROBE_RUN=r35 PROBE_FEATURE=issues-h21u-3_5 PROBE_AGENT=h21u node bin/probe.js all shared/playwright/checks/issues/notify-copy-unticked-still-sent/walk.js
// The fix:      node bin/try-fix.js apply shared/playwright/checks/issues/notify-copy-unticked-still-sent/fix.diff ojs omp ops
// Facts: .reports/<feature>/h21u/a5-facts-<mode>-<app>.json (PROBE_RUN adds its tag)
const {forEachApp, launch, signIn, signOut, screen, shot, record, serverLog, idle} = require('../../../probe');
const L = require('./lib');

const MODE = process.argv.slice(2).includes('neighbour') ? 'neighbour' : 'steps';

forEachApp(async (app) => {
    if (!app.dataset) throw new Error('walk.js runs on a dataset fleet only (fleet-prep --dataset)');
    const facts = {app: app.name, line: app.line || 'main', dataset: app.dataset, mode: MODE, steps: {}};
    const fact = (k, v) => {
        facts.steps[k] = v;
        console.log(`[a5] ${app.name} ${k}: ${L.flat(JSON.stringify(v), 900)}`);
    };
    const snap = async (page, name) => {
        record(`a5-${MODE}-${name}`, await screen(page).catch((e) => ({error: e.message})));
        await shot(page, `a5-${MODE}-${name}`).catch(() => {});
    };
    const consoleErrors = [];
    const failed = [];
    const log = serverLog(app);
    const mark = log.mark();
    const {page, close} = await launch(app);
    page.on('pageerror', (e) => consoleErrors.push(L.flat(e.message)));
    page.on('console', (m) => {
        if (m.type() === 'error') consoleErrors.push(`console: ${L.flat(m.text())}`);
    });
    page.on('response', (r) => {
        if (r.status() >= 500) failed.push(`${r.status()} ${r.request().method()} ${r.url()}`);
    });
    const role = L.WORDS[app.name].editors;
    const body = 'The editors meet on Friday.';
    const stamp = Date.now().toString(36);

    /** One send: the role, "Copy" as `copy` says, type, "Save", read the window, "Send Email". */
    const sendOnce = async (key, tab, {copy, subject}) => {
        await idle(page).catch(() => {});
        await tab.roleBox(role).check().catch((e) => fact(`${key}-error-role`, L.flat(e.message)));
        const box = {};
        if (copy === 'ticked-unticked' || copy === 'ticked') {
            await tab.copyBox.check().catch((e) => fact(`${key}-error-tick`, L.flat(e.message)));
            box.afterTick = await tab.copyBox.isChecked().catch(() => null);
        }
        if (copy === 'ticked-unticked') {
            await tab.copyBox.uncheck().catch((e) => fact(`${key}-error-untick`, L.flat(e.message)));
            box.afterUntick = await tab.copyBox.isChecked().catch(() => null);
        }
        await tab.fill({subject, body}).catch((e) => fact(`${key}-error-fill`, L.flat(e.message)));
        box.atSave = await tab.copyBox.isChecked().catch(() => null);
        fact(`${key}-copy-box`, box);
        await idle(page).catch(() => {});
        const {out, win} = await L.readConfirm(page, tab, {keep: true});
        fact(`${key}-window`, out);
        await snap(page, `${key}-window`);
        if (!win) return;
        const answer = await win.sendAndWait().catch((e) => ({error: L.flat(e.message)}));
        const after = answer.error
            ? {...answer}
            : {
                  status: answer.status(),
                  body: L.flat(await answer.text().catch(() => null)),
                  posted: L.flat(decodeURIComponent((answer.request().postData() || '').replace(/\+/g, ' ')), 400),
              };
        after.queued = L.flat(await tab.queuedLine.innerText({timeout: 5_000}).catch(() => null));
        await snap(page, `${key}-sent`);
        fact(`${key}-send`, after);
    };

    try {
        // 1. The site allows the context bulk email.
        await signIn(page, 'admin');
        fact('1-bulk-emails', await L.allowBulkEmail(page, app));
        await snap(page, '1-bulk-emails');
        await signOut(page);

        // 2. The manager opens "Notify".
        await signIn(page, 'rvaca');
        let opened = await L.openNotify(page, app);
        fact('2-notify', {roles: opened.roles, copy: opened.copy, error: opened.error});
        await snap(page, '2-notify');
        if (!opened.tab) return;
        const since = new Date();

        if (MODE === 'steps') {
            // 3-6. The editors' role, "Copy" ticked and then unticked, typed, "Save", "Send Email".
            const subject = `Editorial meeting h21u ${app.name} ${stamp}`;
            await sendOnce('6', opened.tab, {copy: 'ticked-unticked', subject});
            // 7. The emails.
            fact('7-emails', await L.sentTo(app, page, {subject, since}));
        } else {
            // "Copy" never touched: the three editors alone.
            const never = `Editorial meeting h21u ${app.name} ${stamp} never`;
            await sendOnce('n1', opened.tab, {copy: 'never', subject: never});
            // The page opened again; "Copy" ticked at "Save": the three editors and the manager.
            opened = await L.openNotify(page, app);
            if (opened.error) fact('n2-notify', opened);
            const ticked = `Editorial meeting h21u ${app.name} ${stamp} ticked`;
            if (opened.tab) await sendOnce('n2', opened.tab, {copy: 'ticked', subject: ticked});
            fact('n1-emails', await L.sentTo(app, page, {subject: never, since}));
            fact('n2-emails', await L.sentTo(app, page, {subject: ticked, since}));
        }
    } catch (e) {
        fact('error', L.flat(e.stack, 1200));
    } finally {
        fact('page-errors', consoleErrors);
        fact('server-errors', failed);
        fact('server-log', log.since(mark));
        record(`a5-facts-${MODE}`, facts);
        await close();
    }
});
