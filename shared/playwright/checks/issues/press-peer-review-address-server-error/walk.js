// Issue report docs/issues/U29-OMP4-press-peer-review-address-server-error.md (U29 OMP4): a press's
// public peer-review address answers a server error for every request. No screen calls the address,
// so the Steps type it in the browser's address bar (a GET), on PKP's default test dataset (a dataset
// fleet, harness.md "Dataset fleets"), context `publicknowledge`, as the dataset's own users. The kit
// builds nothing.
//
// Steps (default mode), OMP:
//   1  signed out: api/v1/publicationPeerReviews/open/submissions/5   (book 5, published)
//   2  signed out: api/v1/publicationPeerReviews/open/submissions/5/summary
//   3  signed out: api/v1/publicationPeerReviews                      (nothing after it)
//   4  as dbarnes: the address of step 1
//   control: signed out, api/v1/peerReviews/open/submissions/5 (the journal's address)
// OJS (control only): signed out, api/v1/peerReviews/open/submissions/1 and the same address
// under publicationPeerReviews. OPS has no review stage and no such address: skipped.
//
// Neighbour (`public` as the script's argument; OMP only; walked alone, with the fix in and out;
// each step recorded, none throws): submission 16 "A Designer's Log: Case Studies in Instructional
// Design", as dbarnes: Adela Gallego's row › "More Actions" › "Edit": "Open", "Publicly Show
// Reviewer Comments" ticked, "OK"; her "Read Review" › "Mark as Complete"; "Accept Submission";
// "Send To Production"; "Publish". Then signed out: api/v1/peerReviews/open/submissions/16 (her
// review alone), …/open/submissions/16/summary, …/open/submissions/5 (no review made public:
// an empty record) and the old address api/v1/publicationPeerReviews/open/submissions/16.
//
// Reset first:  npm run fleet-prep -- --feature <dataset fleet's feature> --dataset <n> --reset
// Run (main):   PROBE_FEATURE=<feature> PROBE_AGENT=<id> node bin/probe.js omp shared/playwright/checks/issues/press-peer-review-address-server-error/walk.js [public]
//               (`ojs` for the control)
// Run (3.5):    PKP_E2E_LINE=stable-3_5_0 PROBE_RUN=r35 PROBE_FEATURE=<3.5 fleet's feature> … the same command
const {forEachApp, launch, signIn, signOut, screen, record, serverLog} = require('../../../probe');
const L = require('./lib.js');

const PUBLIC = process.argv.includes('public');
const RUN = (process.env.PROBE_RUN || 'r0').toLowerCase().replace(/[^a-z0-9]/g, '');
const OLD = 'api/v1/publicationPeerReviews';
const NEW = 'api/v1/peerReviews';
const BOOK = 16;
const REVIEWER = 'Adela Gallego';

/** Run one step, record what it gave or how it failed; never throws. */
async function step(facts, name, fn) {
    try {
        const r = await fn();
        facts.steps.push({step: name, ...r});
        return r;
    } catch (e) {
        facts.steps.push({step: name, error: L.flat(e.message, 600)});
        return null;
    }
}

/** What a record names: each round's reviewers (or the summary's shape), so the reader sees who is listed. */
function names(json) {
    if (!json || typeof json !== 'object') return null;
    const rounds = json.reviewRounds;
    if (!Array.isArray(rounds)) return {keys: Object.keys(json).slice(0, 12)};
    return rounds.map((r) => ({round: r.roundNumber, version: r.publication && r.publication.versionString,
        reviewers: (r.reviews || []).map((v) => (v.reviewer && (v.reviewer.fullName || v.reviewer.name)) || v.reviewerFullName || '(anonymous)')}));
}

forEachApp(async (app) => {
    if (!['omp', 'ojs'].includes(app.name)) return; // OPS has no review stage, so no such address
    if (PUBLIC && app.name !== 'omp') return;
    const {page, close} = await launch(app);
    const slog = serverLog(app, {match: /./});
    const facts = {line: app.line, dataset: app.dataset, run: RUN, mode: PUBLIC ? 'public' : 'steps', steps: [], reads: []};
    const read = async (as, address, label) => {
        const r = await L.readAddress(page, app, slog, address);
        facts.reads.push({label, as, ...r, names: names(r.json)});
        return r;
    };
    try {
        if (!PUBLIC && app.name === 'omp') {
            await read('signed out', `${OLD}/open/submissions/5`, 'step 1');
            record(`step1-${app.name}`, await screen(page));
            await read('signed out', `${OLD}/open/submissions/5/summary`, 'step 2');
            await read('signed out', OLD, 'step 3');
            await read('signed out', `${NEW}/open/submissions/5`, 'control: the journal\'s address');
            await signIn(page, 'dbarnes');
            await read('dbarnes', `${OLD}/open/submissions/5`, 'step 4');
            record(`step4-${app.name}`, await screen(page));
            await signOut(page).catch(() => {});
        } else if (!PUBLIC) {
            await read('signed out', `${NEW}/open/submissions/1`, 'control: a journal\'s record');
            record(`control-${app.name}`, await screen(page));
            await read('signed out', `${OLD}/open/submissions/1`, 'control: the old address on a journal');
        } else {
            await signIn(page, 'dbarnes');
            const edit = await step(facts, 'n1', () => L.editReview(page, app, BOOK, REVIEWER, {reviewType: 'Open', makePublic: true}));
            if (edit && edit.boxCount) {
                await step(facts, 'n2', () => L.markComplete(page, app, BOOK, REVIEWER));
                await step(facts, 'n3', () => L.decide(page, app, BOOK, 'Accept Submission'));
                await step(facts, 'n4', () => L.decide(page, app, BOOK, 'Send To Production'));
                await step(facts, 'n5', () => L.publish(page, app, BOOK));
            } else {
                facts.stoppedAt = 'n1';
            }
            await signOut(page).catch(() => {});
            await read('signed out', `${NEW}/open/submissions/${BOOK}`, 'n6: the book made public');
            record(`nb-record-${BOOK}`, await screen(page));
            await read('signed out', `${NEW}/open/submissions/${BOOK}/summary`, 'n7: its summary');
            await read('signed out', `${NEW}/open/submissions/5`, 'n8: a book with no review made public');
            await read('signed out', `${OLD}/open/submissions/${BOOK}`, 'n9: the old address');
        }
    } catch (e) {
        facts.error = L.flat(e.stack, 1500);
    } finally {
        record(`${PUBLIC ? 'public' : 'facts'}-${app.name}`, facts);
        for (const s of facts.steps) console.log(`step ${s.step}`, L.flat(JSON.stringify(s), 700));
        for (const r of facts.reads) console.log(`${r.label} (${r.as}) ${r.address}: ${r.status} ${r.type} len=${r.length}`, L.flat(r.body, 300), JSON.stringify(r.names), r.log.length ? `LOG ${L.flat(r.log.join(' | '), 600)}` : '');
        if (facts.error) console.log('error', facts.error);
        await close();
    }
});
