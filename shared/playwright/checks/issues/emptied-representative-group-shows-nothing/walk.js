// U74 A21 {OMP}: a book's "Marketing" › "Representatives". When "Delete" removes the last agent (or
// the last supplier), the row goes and "Representative removed." shows, but the group's "No Items"
// line does not come back until the page is reloaded. The issue report's Steps, on PKP's default
// test dataset, as `dbarnes`: the install's first representative put on submission 5 first
// (the table never redraws that one, U74 A20), then on submission 4 ("How Canadians Communicate",
// no representative) one agent added and deleted, and the page reloaded.
// Spec: docs/specs/U74-onix-metadata-export.md, register A21.
//
// Run (reset the dataset fleet first):
//   PROBE_FEATURE=<dataset fleet feature> PROBE_AGENT=<id> node bin/probe.js omp \
//     shared/playwright/checks/issues/emptied-representative-group-shows-nothing/walk.js [neighbour]
// (PKP_E2E_LINE=stable-3_5_0 in front for 3.5.)
// No argument: the Steps (an agent). `supplier`: the same with a supplier, which saves only after
// "Agent" and then "Supplier" are clicked (U74 A12). `neighbour` runs alone what a fix must leave alone, after the same
// precondition: two agents added to submission 4, the first deleted (the other stays listed and
// no "No Items" line shows), then the second (the line shows); one more added (the line goes
// again). Records the screens, asserts nothing.
const {forEachApp, launch, signIn, record, screen, shot, serverLog} = require('../../../probe');
const L = require('./lib');

const MODE = process.argv[2] || process.env.MODE || 'walk';
const RUN = process.env.PROBE_RUN || 'r0';
const BOOK = 4;
const OTHER_BOOK = 5;
const FIRST = 'First Agency h21k';
const BETA = 'Beta Agency h21k';
const GAMMA = 'Gamma Agency h21k';
const ALPHA = 'Alpha Books h21k';
const ROLE = 'Sales agent (08)';

forEachApp(async (app) => {
    if (app.name !== 'omp') return;
    const {page, close} = await launch(app);
    const log = serverLog(app);
    const watch = L.watchTable(page);
    const facts = {mode: MODE, run: RUN, line: app.line};
    const fact = (k, v) => {
        facts[k] = v;
        console.log(`[a21 ${MODE} ${RUN} ${app.line}] ${k}:`, String(JSON.stringify(v)).slice(0, 2000));
    };
    /** One step, with the server's error lines written while it ran and a screenshot after. */
    const act = async (name, fn) => {
        const from = log.mark();
        const out = await L.step(page, name, fn);
        const errs = log.since(from).map((l) => L.flat(l, 400));
        await shot(page, `a21-${MODE}-${name}`).catch(() => {});
        return errs.length ? {...out, serverLog: errs} : out;
    };
    try {
        fact('stored-0', L.stored(app));
        await signIn(page, 'dbarnes');
        // Precondition: the install's first representative, on submission 5, then a reload.
        fact('p0-first-on-book-5', await act('p0', async () => {
            const rp5 = await L.openReps(app, page, OTHER_BOOK);
            const added = await L.addAgent(app, page, rp5, watch, FIRST, ROLE);
            return {added, afterReload: await L.reload(app, page, rp5, watch)};
        }));
        fact('stored-1', L.stored(app));

        // Step 1: submission 4's "Representatives".
        let rp;
        fact('s1-open', await act('s1', async () => {
            rp = await L.openReps(app, page, BOOK);
            await watch.take();
            return {table: await L.table(app, rp)};
        }));
        record(`a21-${MODE}-s1-page`, await screen(page));
        if (!rp) return;

        if (MODE === 'walk') {
            // Step 2: one agent added.
            fact('s2-add-agent', await act('s2', () => L.addAgent(app, page, rp, watch, BETA, ROLE)));
            record(`a21-${MODE}-s2-page`, await screen(page));
            // Step 3: its "Delete" › "OK".
            fact('s3-delete-last-agent', await act('s3', () => L.deleteRow(app, page, rp, watch, 'Agents', BETA)));
            record(`a21-${MODE}-s3-page`, await screen(page));
            fact('s3-stored', L.stored(app));
            // Step 4: the reload.
            fact('s4-reload', await act('s4', () => L.reload(app, page, rp, watch)));
            record(`a21-${MODE}-s4-page`, await screen(page));
        } else if (MODE === 'supplier') {
            // The Steps' supplier group: one supplier added and deleted ("Agents" reads "No Items" throughout), the reload.
            fact('v2-add-supplier', await act('v2', () => L.addSupplier(app, page, rp, watch, ALPHA, 'Distributor to end-customers (12)')));
            fact('v3-delete-last-supplier', await act('v3', () => L.deleteRow(app, page, rp, watch, 'Suppliers', ALPHA)));
            record(`a21-${MODE}-v3-page`, await screen(page));
            fact('v3-stored', L.stored(app));
            fact('v4-reload', await act('v4', () => L.reload(app, page, rp, watch)));
        } else {
            // Neighbour: a delete that leaves a row in the group, then the last one, then an add.
            fact('n1-add-two', await act('n1', async () => ({
                beta: await L.addAgent(app, page, rp, watch, BETA, ROLE),
                gamma: await L.addAgent(app, page, rp, watch, GAMMA, 'Non-exclusive sales agent (06)'),
            })));
            fact('n2-delete-one-of-two', await act('n2', () => L.deleteRow(app, page, rp, watch, 'Agents', BETA)));
            record(`a21-${MODE}-n2-page`, await screen(page));
            fact('n3-delete-last', await act('n3', () => L.deleteRow(app, page, rp, watch, 'Agents', GAMMA)));
            record(`a21-${MODE}-n3-page`, await screen(page));
            fact('n4-add-after-empty', await act('n4', () => L.addAgent(app, page, rp, watch, `${BETA} again`, ROLE)));
            fact('n4-stored', L.stored(app));
        }
    } finally {
        watch.stop();
        record(`a21-${MODE}`, facts);
        await close();
    }
});
