// U74 A20 {OMP}: a book's "Marketing" › "Representatives". The press's first representative (the
// one stored with id 1) is not redrawn by the table after "Add Representative", "Edit" or "Delete":
// each save is stored and its notice shows, the table's request for the row answers 500, and only a
// reload shows the change. The issue report's Steps, on PKP's default test dataset (submission 4,
// "How Canadians Communicate", no representative on the install), as `dbarnes`.
// Spec: docs/specs/U74-onix-metadata-export.md, register A20.
//
// Run (reset the dataset fleet first):
//   PROBE_FEATURE=<dataset fleet feature> PROBE_AGENT=<id> node bin/probe.js omp \
//     shared/playwright/checks/issues/first-representative-not-listed/walk.js [supplier|neighbour]
// (PKP_E2E_LINE=stable-3_5_0 in front for 3.5.)
// No argument: steps 1 to 9. `supplier`: the first representative added as a supplier, then a
// reload. `again`: the first representative added a second time instead of a reload, the reload,
// the first of the two rows deleted and its "Delete" pressed again on the row that stays, the
// list emptied, and one more added (listed at once: the fault does not come back). `neighbour` runs alone what the fix must leave alone, on every app (run it with `all`):
// Settings › Website › Plugins, "Google Analytics Plugin" ticked and unticked again, each press
// redrawing its row (the one other table that asks for a row by its group); and on OMP, with the
// first representative in place, a second agent and a supplier listed at once, the second agent's
// "Edit" redrawing its row and its "Delete" removing it, and the "PDF" format's "Awaiting
// Approval" › "OK" redrawing the format's line (a whole-group refresh). Records the screens,
// asserts nothing.
const {forEachApp, launch, signIn, record, screen, shot, serverLog} = require('../../../probe');
const R = require('../representative-window-refuses-supplier/lib');
const {watchRedraws} = require('./lib');

const MODE = process.argv[2] || process.env.MODE || 'walk';
const BETA = 'Beta Agency hkre';
const BETA2 = 'Beta Agency hkre renamed';
const GAMMA = 'Gamma Agency hkre';
const ALPHA = 'Alpha Books hkre';
const PLUGIN = 'googleanalyticsplugin';

forEachApp(async (app) => {
    if (app.name !== 'omp' && MODE !== 'neighbour') return;
    if (app.name !== 'omp') return pluginsOnly(app);
    const {watchDialogs, PublicationFormatsPage} = require('../../../../../apps/omp/playwright/pages/PublicationFormatPages.js');
    const {page, close} = await launch(app);
    const dialogs = watchDialogs(page);
    const redraws = watchRedraws(page);
    const log = serverLog(app);
    const facts = {mode: MODE, line: app.line};
    const fact = (k, v) => {
        facts[k] = v;
        console.log(`[${MODE}] ${k}:`, String(JSON.stringify(v)).slice(0, 2200));
    };
    /** One step: what it returns, the table's redraw requests it caused, the server's error lines, both groups. */
    const act = async (name, reps, fn) => {
        const from = log.mark();
        await redraws.take();
        const out = await R.step(page, name, fn);
        await R.pause(800);
        const result = {
            result: out,
            redraws: await redraws.take(),
            serverLog: log.since(from).map((l) => R.flat(l, 500)),
            groups: reps ? await R.groups(reps).catch((e) => ({error: R.flat(e.message, 300)})) : undefined,
        };
        await shot(page, `a20-${MODE}-${name}`).catch(() => {});
        return result;
    };
    const addAgent = (reps, name, role) => async () => {
        const a = await R.openAdd(reps);
        await a.win.chooseType('agent');
        await a.win.roleList('agent').selectOption({label: role});
        await a.win.nameBox().fill(name);
        return R.pressOk(page, a.win);
    };
    const addSupplier = (reps, name, role) => async () => {
        const a = await R.openAdd(reps);
        await a.win.roleList('supplier').selectOption({label: role});
        await a.win.nameBox().fill(name);
        // The U74 A12 way round: a supplier saves only after both types are clicked.
        await a.win.chooseType('agent');
        await a.win.chooseType('supplier');
        return R.pressOk(page, a.win);
    };
    const reload = (reps) => async () => {
        await reps.reload();
        return {ok: true};
    };
    try {
        fact('stored-before', R.stored(app));
        await signIn(page, 'dbarnes');
        // Step 2.
        const reps = await R.step(page, 'open', () => R.openRepresentatives(app, page));
        fact('s2-groups', await R.step(page, 'groups-0', () => R.groups(reps)));
        record(`a20-${MODE}-s2-page`, await screen(page));

        if (MODE === 'walk') {
            // Steps 3-4: the first representative, an agent.
            fact('s3-add-first', await act('s3-add-first', reps, addAgent(reps, BETA, 'Sales agent (08)')));
            record(`a20-${MODE}-s3-page`, await screen(page));
            fact('s3-stored', R.stored(app));
            fact('s4-reload', await act('s4-reload', reps, reload(reps)));
            // Steps 5-6: its "Edit".
            fact('s5-edit-first', await act('s5-edit-first', reps, async () => {
                const e = await R.openEdit(reps, 'Agents', BETA);
                await e.win.roleList('agent').selectOption({label: 'Exclusive sales agent (05)'});
                await e.win.nameBox().fill(BETA2);
                return R.pressOk(page, e.win);
            }));
            fact('s5-stored', R.stored(app));
            fact('s6-reload', await act('s6-reload', reps, reload(reps)));
            // Step 7: a second agent, the control.
            fact('s7-add-second', await act('s7-add-second', reps, addAgent(reps, GAMMA, 'Sales agent (08)')));
            // Steps 8-9: the first one's "Delete".
            fact('s8-delete-first', await act('s8-delete-first', reps, async () => {
                const names = await reps.names('Agents').allInnerTexts();
                const name = names.map((n) => n.trim()).find((n) => n.startsWith(BETA)) || BETA2;
                return R.deleteRow(page, reps, 'Agents', name, dialogs);
            }));
            record(`a20-${MODE}-s8-page`, await screen(page));
            fact('s8-stored', R.stored(app));
            fact('s9-reload', await act('s9-reload', reps, reload(reps)));
        } else if (MODE === 'again') {
            // The same list with `row()` answering the row at a position, for two rows of one name.
            const nth = (i) => Object.assign(Object.create(reps), {row: () => reps.rows('Agents').nth(i)});
            fact('g1-add-first', await act('g1-add-first', reps, addAgent(reps, BETA, 'Sales agent (08)')));
            // Not listed, so the editor adds it again instead of reloading.
            fact('g2-add-again', await act('g2-add-again', reps, addAgent(reps, BETA, 'Sales agent (08)')));
            record(`a20-${MODE}-g2-page`, await screen(page));
            fact('g2-stored', R.stored(app));
            fact('g3-reload', await act('g3-reload', reps, reload(reps)));
            // The first of the two rows (the representative stored first): "Delete" › "OK"; then again on the row that stays.
            fact('g4-delete-first-row', await act('g4-delete-first-row', reps, () => R.deleteRow(page, nth(0), 'Agents', BETA, dialogs)));
            fact('g4-stored', R.stored(app));
            fact('g5-delete-stale-row', await act('g5-delete-stale-row', reps, () => R.deleteRow(page, nth(0), 'Agents', BETA, dialogs)));
            record(`a20-${MODE}-g5-page`, await screen(page));
            fact('g5-stored', R.stored(app));
            fact('g6-reload', await act('g6-reload', reps, reload(reps)));
            // The list emptied, then one more: the screen is back at "No Items", the fault is not.
            fact('g7-delete-last', await act('g7-delete-last', reps, () => R.deleteRow(page, nth(0), 'Agents', BETA, dialogs)));
            fact('g7-stored', R.stored(app));
            fact('g8-add-after-empty', await act('g8-add-after-empty', reps, addAgent(reps, GAMMA, 'Sales agent (08)')));
            fact('g8-stored', R.stored(app));
        } else if (MODE === 'supplier') {
            fact('v1-add-first-supplier', await act('v1-add-first-supplier', reps, addSupplier(reps, ALPHA, 'Distributor to end-customers (12)')));
            record(`a20-${MODE}-v1-page`, await screen(page));
            fact('v1-stored', R.stored(app));
            fact('v2-reload', await act('v2-reload', reps, reload(reps)));
        } else {
            // The first representative in place (its own redraw is the Steps' matter), then a reload.
            fact('n0-add-first', await act('n0-add-first', reps, addAgent(reps, BETA, 'Sales agent (08)')));
            fact('n0-reload', await act('n0-reload', reps, reload(reps)));
            // Neighbour 1: a second agent and a supplier, each listed at once; the agent edited, then deleted.
            fact('n1-add-second', await act('n1-add-second', reps, addAgent(reps, GAMMA, 'Sales agent (08)')));
            fact('n1-add-supplier', await act('n1-add-supplier', reps, addSupplier(reps, ALPHA, 'Distributor to end-customers (12)')));
            fact('n1-edit-second', await act('n1-edit-second', reps, async () => {
                const e = await R.openEdit(reps, 'Agents', GAMMA);
                await e.win.roleList('agent').selectOption({label: 'Non-exclusive sales agent (06)'});
                await e.win.nameBox().fill(`${GAMMA} renamed`);
                return R.pressOk(page, e.win);
            }));
            fact('n1-delete-second', await act('n1-delete-second', reps, async () => {
                return R.deleteRow(page, reps, 'Agents', `${GAMMA} renamed`, dialogs);
            }));
            fact('n1-stored', R.stored(app));
            // Neighbour 2: a whole-group refresh on another table of the same kind: the "PDF" format's approval.
            fact('n2-format-approval', await act('n2-format-approval', null, async () => {
                const formats = new PublicationFormatsPage(page, app.contextPath);
                await formats.gotoEditorial(R.BOOK.id, R.BOOK.publicationId);
                const row = formats.formatRow(R.BOOK.format);
                const links = async () => (await row.locator('a').allInnerTexts()).map((t) => t.trim()).filter(Boolean);
                const before = await links();
                const win = await formats.openStatus(row, 'Awaiting Approval', 'Format Approval');
                await win.ok();
                await R.pause(1500);
                return {before, after: await links()};
            }));
            // Neighbour 3: the plugins table.
            fact('n3-plugin', await plugin(app, page, redraws, log));
        }
    } finally {
        redraws.stop();
        facts.dialogs = dialogs.seen;
        record(`a20-${MODE}`, facts);
        await close();
    }
});

/**
 * Settings › Website › Plugins: tick "Google Analytics Plugin" (off in the dataset), then untick
 * it ("Disable" › "OK"); each press's row request and the box after it.
 */
async function plugin(app, page, redraws, log) {
    const {WebsitePluginsPage} = require('../../../pages/PluginsPages.js');
    const out = {};
    const from = log.mark();
    await redraws.take();
    const plugins = new WebsitePluginsPage(page, app.contextPath);
    out.open = await R.step(page, 'plugins-open', () => plugins.goto());
    const ticked = () => plugins.list.box(PLUGIN).isChecked().catch((e) => R.flat(e.message, 200));
    out.before = await ticked();
    out.tick = await R.step(page, 'plugin-tick', async () => ({status: (await plugins.list.tick(PLUGIN)).status()}));
    await R.pause(800);
    out.afterTick = {ticked: await ticked(), redraws: await redraws.take()};
    out.untick = await R.step(page, 'plugin-untick', async () => {
        await plugins.list.pressTicked(PLUGIN);
        return {status: (await plugins.list.confirmDisable(PLUGIN)).status()};
    });
    await R.pause(800);
    out.afterUntick = {ticked: await ticked(), redraws: await redraws.take()};
    out.serverLog = log.since(from).map((l) => R.flat(l, 500));
    await shot(page, `a20-${MODE}-plugins`).catch(() => {});
    return out;
}

/** The neighbour on an app without the "Representatives" page: the plugins table alone. */
async function pluginsOnly(app) {
    const {page, close} = await launch(app);
    const redraws = watchRedraws(page);
    const facts = {mode: MODE, line: app.line};
    try {
        await signIn(page, 'dbarnes');
        facts['n3-plugin'] = await plugin(app, page, redraws, serverLog(app));
        console.log(`[${MODE}] ${app.name} n3-plugin:`, JSON.stringify(facts['n3-plugin']).slice(0, 2200));
    } finally {
        redraws.stop();
        record(`a20-${MODE}`, facts);
        await close();
    }
}
