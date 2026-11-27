// Issue report docs/issues/U52-A13-paypal-membership-payment-never-recorded.md (U52 A13) {OJS}: a
// membership paid through PayPal is never recorded, because the journal's code for PayPal's return
// fails before it records the payment. Takes the report's Steps on PKP's default test dataset (a
// dataset fleet, harness.md "Dataset fleets"). The kit builds nothing.
//
// Steps (MODE=walk, the default; OJS):
//   1. sign in as dbarnes; Settings › Distribution › "Payments": "Enable", "US Dollar",
//      "Paypal Fee Payment", "Account Name" u52hk52a, "Save"
//   2. "Payments" › "Payment Types": "Association Membership" 7, "Save"
//   3. sign in as ccorino; the journal's address followed by user/payMembership
//   4. (PayPal) the payment approved and the browser sent back: no test install reaches PayPal, so
//      paypal-return.php runs the two lines PaypalPaymentPlugin::handle() runs after PayPal's
//      confirmation, on the queued payment step 3 stored (Evidence, not a step)
//   5. sign in as dbarnes; "Payments" › the "Payments" tab
// Neighbour (MODE=nb, runs alone after its own reset; fix in and out): the same return for a
//   payment that has an object and an address of its own.
//   OJS: 1., then "Access": subscriptions required; "Vol. 1 No. 2 (2014)" › "Access": "Subscription";
//        "Payment Types": "Purchase Article" 5; ckwantes presses "Antimicrobial…" "PDF" (PayPal
//        page); the return run on that request; the "Payments" tab.
//   OMP: 1. on the press; book 14's "PDF" file "Segmentation of Vascular Ultrasound Imag.pdf" ›
//        "Direct Sales" 25.00; aclark presses the priced link (PayPal page); the return run.
//
// Reset first:  npm run fleet-prep -- --feature issues-hk52a --dataset 6 --reset
// Run (main):   PROBE_FEATURE=issues-hk52a PROBE_AGENT=hk52a node bin/probe.js ojs shared/playwright/checks/issues/paypal-membership-payment-never-recorded/walk.js
// Neighbour:    MODE=nb PROBE_RUN=nb-in PROBE_FEATURE=issues-hk52a PROBE_AGENT=hk52a node bin/probe.js all …/walk.js
// Run (3.5):    PKP_E2E_LINE=stable-3_5_0 npm run fleet-prep -- --feature issues-hk52a-3_5 --dataset 6 --reset
//               PKP_E2E_LINE=stable-3_5_0 PROBE_RUN=r35 PROBE_FEATURE=issues-hk52a-3_5 PROBE_AGENT=hk52a node bin/probe.js ojs …/walk.js
// Facts: .reports/<feature>/hk52a/a13-facts[-<run>]-<app>.json
const {forEachApp, launch, signIn, signOut, record, screen, shot, serverLog} = require('../../../probe');
const L = require('./lib');

const MODE = process.env.MODE || 'walk';
const ACCOUNT = 'u52hk52a';
const BOOK = 14;
const BOOK_TITLE = 'From Bricks to Brains: The Embodied Cognitive Science of LEGO Robots';
const BOOK_FILE = 'Segmentation of Vascular Ultrasound Imag.pdf';

forEachApp(async (app) => {
    if (app.name === 'ops') return console.log('[walk] ops: no payments; not walked');
    if (app.name === 'omp' && MODE !== 'nb') return console.log('[walk] omp: no membership (user/payMembership answers 404); only the neighbour runs');
    if (!app.dataset) throw new Error('walk.js runs on a dataset fleet only (fleet-prep --dataset n)');
    const f = {app: app.name, line: app.line || 'main', mode: MODE};
    const fact = (k, v) => {
        f[k] = v;
        console.log(`[fact] ${app.name} ${k}: ${L.flat(JSON.stringify(v), 1800)}`);
    };
    const log = serverLog(app);
    const from = log.mark();
    const {page, close} = await launch(app);
    page.setDefaultTimeout(L.T);
    try {
        await signIn(page, 'dbarnes');
        fact('1 payments', await L.setUpPaypal(page, app, {accountName: ACCOUNT}));

        if (MODE === 'walk') {
            fact('2 payment types', await L.setPaymentTypes(page, app, {'Association Membership': 7}));
            fact('payments list before', await L.readPaymentsList(page, app));

            await signIn(page, 'ccorino');
            fact('3 membership page', await L.typeAddress(page, app, 'user/payMembership'));
            record('a13-3-paymembership', await screen(page));
            await shot(page, 'a13-3-paymembership').catch(() => {});
            const qid = L.lastQueued(app, 'ccorino');
            fact('3 stored (evidence read)', L.paymentRows(app, 'ccorino'));

            fact('4 return (paypal-return.php)', qid ? L.paypalReturn(app, qid) : 'no queued payment');
            fact('4 stored after (evidence read)', L.paymentRows(app, 'ccorino'));

            await signIn(page, 'dbarnes');
            fact('5 payments list', await L.readPaymentsList(page, app));
            record('a13-5-payments', await screen(page));
            await shot(page, 'a13-5-payments').catch(() => {});
        } else if (app.name === 'ojs') {
            fact('nb access', await L.requireSubscriptions(page));
            fact('nb issue access', await L.restrictIssue(page));
            fact('nb payment types', await L.setPaymentTypes(page, app, {'Purchase Article': 5}));
            await signIn(page, 'ckwantes');
            fact('nb article PDF', await L.pressArticleGalley(page, app, 'Antimicrobial', 'PDF'));
            const qid = L.lastQueued(app, 'ckwantes');
            fact('nb stored', L.paymentRows(app, 'ckwantes'));
            fact('nb return (paypal-return.php)', qid ? L.paypalReturn(app, qid) : 'no queued payment');
            fact('nb stored after', L.paymentRows(app, 'ckwantes'));
            await signIn(page, 'dbarnes');
            fact('nb payments list', await L.readPaymentsList(page, app));
        } else {
            const formats = await L.openFormats(page, app, BOOK);
            fact('nb direct sales', await L.setDirectSales(page, formats, 'PDF', BOOK_FILE, '25.00'));
            await signIn(page, 'aclark');
            fact('nb book', await L.openBook(page, app, BOOK_TITLE));
            fact('nb priced link', await L.pressPricedLink(page, BOOK_FILE));
            const qid = L.lastQueued(app, 'aclark');
            fact('nb stored', L.paymentRows(app, 'aclark'));
            fact('nb return (paypal-return.php)', qid ? L.paypalReturn(app, qid) : 'no queued payment');
            fact('nb stored after', L.paymentRows(app, 'aclark'));
        }
        await signOut(page).catch(() => {});
    } catch (e) {
        f.error = String(e.stack || e.message).slice(0, 900);
        console.log(`[fact] ${app.name} FAILED: ${f.error}`);
        await shot(page, 'a13-failed').catch(() => {});
    } finally {
        f['server log'] = log.since(from).map((l) => L.flat(l, 400));
        record(process.env.PROBE_NAME || 'a13-facts', f);
        await close();
    }
});
