// Issue report walk: docs/issues/U66-A13-institution-unknown-id-answers-success.md (spec U66
// register A13). Takes the report's Steps on a dataset fleet (PKP's default test dataset,
// harness.md "Dataset fleets"): signed in as the dataset's manager `rvaca`, then `admin`, on
// `publicknowledge`; the one institution is added on screen, and the programming interface's
// addresses are typed into the signed-in browser. The kit builds nothing. Reset the fleet before
// each walk: the walk adds an institution to the dataset.
//
// Modes (argument after the script):
//   (none)      the Steps, the control (an unknown id deleted from the page's console answers
//               404) and the reach (the ROR interface's single read of an unknown id).
//   neighbour   what a fix must leave alone (runs alone, on a fresh dataset): `rvaca` adds an
//               institution on screen and reads it back on its own (200 with the record), reads
//               one ROR record the dataset holds (200), deletes an unknown institution id from the
//               console (404); the section editor `dbuskins` and a signed-out browser asking for an
//               unknown institution id are refused (401).
//
// Run (main, then stable-3_5_0):
//   npm run fleet-prep -- --feature <feature> --dataset <n> --reset
//   PROBE_FEATURE=<feature> PROBE_AGENT=<id> node bin/probe.js all shared/playwright/checks/issues/institution-unknown-id-answers-success/walk.js [neighbour]
//   PKP_E2E_LINE=stable-3_5_0 PROBE_RUN=r35 … the same, with the line fleet's feature.
const {forEachApp, launch, signIn, signOut, screen, record, serverLog} = require('../../../probe');
const L = require('./lib');

const MODE = process.argv.slice(2).includes('neighbour') ? 'neighbour' : 'steps';
const UNKNOWN = 999999; // no institution and no ROR record on the dataset has this number
const NAME = MODE === 'neighbour' ? 'hkq23g Neighbour' : 'hkq23g Library';

forEachApp(async (app) => {
    if (!app.dataset) throw new Error('walk.js drives a dataset fleet (fleet-prep --dataset)');
    const facts = {mode: MODE, line: app.line};
    const fact = (k, v) => { facts[k] = v; console.log(`[${app.name}] ${k}: ${JSON.stringify(v).slice(0, 500)}`); };
    const base = `/index.php/${app.contextPath}/api/v1`;
    const log = serverLog(app);
    const from = log.mark();
    const {page, close} = await launch(app);
    let n = 0;
    const snap = async (name) => record(`${MODE === 'neighbour' ? 'nb' : 'walk'}-${String(++n).padStart(2, '0')}-${name}`, await screen(page));
    try {
        // 1
        await signIn(page, 'rvaca');
        // 2
        fact('step 2 page', await L.openInstitutions(page, app));
        await snap('institutions');
        // 3
        fact('step 3 add', await L.addInstitution(page, NAME));
        await snap('added');
        // 4
        const list = await L.openApi(page, app, `${base}/institutions`);
        const items = list.json && Array.isArray(list.json.items) ? list.json.items : [];
        const mine = items.find((i) => i.name && i.name.en === NAME);
        fact('step 4 list', {status: list.status, itemsMax: list.json && list.json.itemsMax, ids: items.map((i) => [i.id, i.name && i.name.en])});
        const id = mine ? mine.id : 1;
        // 5
        const held = await L.openApi(page, app, `${base}/institutions/${id}`);
        fact('step 5 held id', {address: held.address, status: held.status, id: held.json && held.json.id, name: held.json && held.json.name, error: held.json && held.json.error});
        if (MODE === 'steps') {
            // 6
            fact('step 6 unknown id as rvaca', await L.openApi(page, app, `${base}/institutions/${UNKNOWN}`));
            await snap('unknown-rvaca');
            // Control: the same id deleted from the page's console
            await L.openInstitutions(page, app);
            fact('control delete unknown id', await L.consoleRequest(page, 'DELETE', `/institutions/${UNKNOWN}`));
            fact('control edit unknown id', await L.consoleRequest(page, 'PUT', `/institutions/${UNKNOWN}`));
            // Reach: the ROR interface's single read
            fact('reach ror unknown id', await L.openApi(page, app, `${base}/rors/${UNKNOWN}`));
            // 7
            await signOut(page);
            await signIn(page, 'admin');
            fact('step 7 unknown id as admin', await L.openApi(page, app, `${base}/institutions/${UNKNOWN}`));
            await snap('unknown-admin');
        } else {
            const ror = await L.openApi(page, app, `${base}/rors/1`);
            fact('nb ror held id', {status: ror.status, id: ror.json && ror.json.id, ror: ror.json && ror.json.ror, error: ror.json && ror.json.error});
            await L.openInstitutions(page, app);
            fact('nb delete unknown id', await L.consoleRequest(page, 'DELETE', `/institutions/${UNKNOWN}`));
            fact('nb rows after', await L.institutionRows(page));
            await signOut(page);
            await signIn(page, 'dbuskins');
            fact('nb unknown id as dbuskins', await L.openApi(page, app, `${base}/institutions/${UNKNOWN}`));
            fact('nb held id as dbuskins', await L.openApi(page, app, `${base}/institutions/${id}`));
            await signOut(page);
            fact('nb unknown id signed out', await L.openApi(page, app, `${base}/institutions/${UNKNOWN}`));
        }
    } catch (err) {
        fact('ERROR', L.flat(err.stack || err, 1200));
        await snap('ERROR').catch(() => {});
        throw err;
    } finally {
        facts.serverLog = log.since(from);
        record(MODE === 'neighbour' ? 'neighbour' : 'facts', facts);
        await close();
    }
});
