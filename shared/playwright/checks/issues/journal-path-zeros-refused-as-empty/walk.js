// Issue report docs/issues/U59-A11-journal-path-zeros-refused-as-empty.md (U59 A11): the report's
// Steps to reproduce, walked through the screens on PKP's default test datasets (a dataset fleet,
// harness.md "Dataset fleets"). The script builds nothing the steps do not say.
//   (default)  as `admin`, Hosted Journals › "Create Journal", the form filled with the path "00",
//              "Save" (steps 1–5); then a second journal created with the path "h21w" (step 6),
//              and its row's "Edit" with "Path" replaced by "000", "Save" (step 7). The dataset's
//              own `publicknowledge` is left as it is. A save that goes through (the fix in) is
//              followed by the new address opened as a reader would, `/index.php/00`, `/index.php/000`.
//   neighbour  (the fix's check): "Create Journal" with the path "0", "Save": the path the router
//              reads as none, which must stay refused with the fix in and out.
//   empty      "Create Journal" filled as in step 4 with "Path" left empty, "Save": what an
//              empty path shows (the OPS key question).
//
// Run (main):   npm run fleet-prep -- --feature issues-h21w --dataset 3 --reset   (before each run)
//               PROBE_FEATURE=issues-h21w PROBE_AGENT=h21w node bin/probe.js all shared/playwright/checks/issues/journal-path-zeros-refused-as-empty/walk.js [neighbour]
// 3.5: the same with PKP_E2E_LINE=stable-3_5_0, feature issues-h21w-3_5, PROBE_RUN=r35.
// Facts: .reports/<feature>/h21w/a11-facts[-<run>]-<app>.json
const {forEachApp, launch, signIn, signOut, screen, shot, record} = require('../../../probe');
const L = require('./lib');

const MODE = process.argv[2] || 'steps';

forEachApp(async (app) => {
    const {HostedJournalsPage} = require('../../../pages/HostedJournalsPages.js');
    const W = L.WORDS[app.name];
    const fact = (k, v) => {
        record('a11-facts', {[k]: v}, {merge: true});
        console.log('[a11]', app.name, k, JSON.stringify(v).slice(0, 900));
    };
    const snap = async (page, name) => {
        record(name, await screen(page));
        await shot(page, name).catch(() => {});
    };
    const {page} = await launch(app);
    const hosted = new HostedJournalsPage(page, W);

    // 1–3: sign in as admin, Hosted Journals, "Create Journal".
    await signIn(page, 'admin');
    await hosted.goto();
    const win = await hosted.openCreate();

    if (MODE === 'empty') {
        await L.fillCreate(win, W.noun, '');
        const empty = await L.saveAndRead(page, win.form);
        const box = win.path;
        const native = await box.evaluate((el) => el.validationMessage || null).catch(() => null);
        await snap(page, 'a11-empty');
        fact('empty-path', {...L.pathFacts(empty), native, paths: L.paths(app)});
        return;
    }

    if (MODE === 'neighbour') {
        await L.fillCreate(win, W.noun, '0');
        const zero = await L.saveAndRead(page, win.form);
        await snap(page, 'a11-nb-zero');
        fact('nb-path-0', {...L.pathFacts(zero), paths: L.paths(app)});
        return;
    }

    // 4: the form filled, "00" in "Path".  5: "Save".
    await L.fillCreate(win, W.noun, '00');
    const created = await L.saveAndRead(page, win.form);
    await snap(page, 'a11-step5');
    fact('step5-create', {...L.pathFacts(created), paths: L.paths(app)});

    // 6: Hosted Journals reloaded, "Create Journal" filled as in step 4 with the path "h21w", "Save".
    await hosted.goto();
    const second = await hosted.openCreate();
    await L.fillCreate(second, W.noun, 'h21w');
    const made = await L.saveAndRead(page, second.form);
    fact('step6-create-h21w', {...L.pathFacts(made), paths: L.paths(app)});

    // 7: Hosted Journals reloaded, the arrow of the h21w row, "Edit", "Path" → "000", "Save".
    await hosted.goto();
    const edit = await hosted.openEdit('h21w');
    fact('step7-opened', {path: await edit.path.inputValue()});
    await edit.type(edit.path, '000');
    const edited = await L.saveAndRead(page, edit.form);
    await snap(page, 'a11-step7');
    fact('step7-edit', {...L.pathFacts(edited), paths: L.paths(app)});

    // A path the save stored is opened as a reader types it.
    const stored = L.paths(app);
    for (const p of ['00', '000'].filter((x) => stored.includes(x))) {
        const home = await L.openHome(page, p);
        await snap(page, `a11-home-${p}`);
        fact(`home-${p}`, home);
    }
    await hosted.goto().catch(() => {});
    await signOut(page).catch(() => {});
});
