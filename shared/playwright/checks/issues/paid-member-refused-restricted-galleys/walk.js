// Issue report docs/issues/U51-A33-paid-member-refused-restricted-galleys.md (U51 A33) {OJS}: the
// report's Steps to reproduce, walked through the screens on PKP's default test dataset (a dataset
// fleet, harness.md "Dataset fleets"). The kit builds nothing; the one SQL write is the Steps' own
// precondition (lib.js plantMembership()).
//
// Preconditions, as dbarnes:
//   a. Settings › Distribution › "Access": "The journal will require subscriptions…", "Save"
//   b. Settings › Distribution › "Payments": "Enable", USD, "Manual Fee Payment", instructions, "Save"
//   c. "Payments" › "Payment Types": "Association Membership" 7, the other fees empty, "Save"
//   d. Issues › "Back Issues" › "Vol. 1 No. 2 (2014)" › "Edit" › "Access": "Subscription", "Save"
//   e. the same issue › "Issue Galleys" › "Create Issue Galley": "PDF", u51n23m-issue.pdf, "Save"
//   f. (SQL) ccorino's membership paid today through PayPal, as OJS 3.3 recorded it (payment and end date)
// Steps (MODE=walk, the default):
//   1. sign in as ccorino   2. "Archives" › the issue   3. the "Antimicrobial…" "PDF"   4. the "Full Issue" "PDF"
//   Evidence after the steps: dsokoloff opens user/payMembership; the code PayPal's return runs
//   (paypal-return.php: OJSPaymentManager::fulfillQueuedPayment()) fulfils that queued payment;
//   what the account holds; dsokoloff presses both galleys.
// Neighbour (MODE=nb, runs alone after its own reset): a–e, then ckwantes with no membership and
//   with one paid two years ago (ended a year ago) presses both galleys (refused both times, fix in and out).
//
// Reset first:  npm run fleet-prep -- --feature issues-n23m --dataset 3 --reset
// Run (main):   PROBE_FEATURE=issues-n23m PROBE_AGENT=n23m node bin/probe.js ojs shared/playwright/checks/issues/paid-member-refused-restricted-galleys/walk.js
// Neighbour:    MODE=nb PROBE_RUN=nb-in PROBE_FEATURE=issues-n23m PROBE_AGENT=n23m node bin/probe.js ojs …/walk.js
// Run (3.5):    PKP_E2E_LINE=stable-3_5_0 npm run fleet-prep -- --feature issues-n23m-3_5 --dataset 3 --reset
//               PKP_E2E_LINE=stable-3_5_0 PROBE_RUN=r35 PROBE_FEATURE=issues-n23m-3_5 PROBE_AGENT=n23m node bin/probe.js ojs …/walk.js
// Facts: .reports/<feature>/n23m/a33-facts[-<run>]-ojs.json
const {forEachApp, launch, signIn, signOut, record, screen, shot, sql} = require('../../../probe');
const L = require('./lib');

const MODE = process.env.MODE || 'walk';

forEachApp(async (app) => {
    if (app.name !== 'ojs') return console.log(`[walk] ${app.name}: no subscriptions; not walked`);
    if (!app.dataset) throw new Error('walk.js runs on a dataset fleet only (fleet-prep --dataset n)');
    const f = {app: app.name, line: app.line || 'main', mode: MODE};
    const fact = (k, v) => {
        f[k] = v;
        console.log(`[fact] ojs ${k}: ${L.flat(JSON.stringify(v), 1600)}`);
    };
    const {page, close} = await launch(app);
    page.setDefaultTimeout(L.T);
    try {
        await signIn(page, 'dbarnes');
        fact('a access', await L.requireSubscriptions(page));
        fact('b payments', await L.setUpPayments(page, app));
        fact('c payment types', await L.setPaymentTypes(page, app, {fees: {'Association Membership': 7}}));
        fact('d issue access', await L.restrictIssue(page));
        fact('e issue galley', await L.createIssueGalley(page, {label: 'PDF', file: L.PDF('u51n23m-issue.pdf')}));

        if (MODE === 'walk') {
            fact('f membership row (SQL precondition)', L.plantMembership(app, 'ccorino', '0 days'));
            await signIn(page, 'ccorino');
            const r = await L.pressBoth(page, app, 'a33-ccorino');
            fact('2 links', r.links);
            fact('3 article PDF', r.article);
            fact('4 Full Issue PDF', r.full);
            record('a33-4-fullissue', await screen(page));

            // Evidence, not Steps: the store end.
            await signIn(page, 'dsokoloff');
            await page.goto(app.url(`/index.php/${L.CTX}/user/payMembership`));
            await page.waitForLoadState('load').catch(() => {});
            fact('ev payMembership page', await L.landed(page));
            record('a33-ev-paymembership', await screen(page));
            await shot(page, 'a33-ev-paymembership').catch(() => {});
            fact('ev payments before', L.paymentRows(app, 'dsokoloff'));
            const qid = sql(app, 'SELECT max(queued_payment_id) FROM queued_payments').trim();
            fact('ev paypal return (fulfillQueuedPayment)', L.paypalReturn(app, qid));
            fact('ev payments after', L.paymentRows(app, 'dsokoloff'));
            fact('ev membership rows after', L.membershipRows(app, 'dsokoloff'));
            const e = await L.pressBoth(page, app, 'a33-ev-dsokoloff');
            fact('ev article PDF', e.article);
            fact('ev Full Issue PDF', e.full);
        } else {
            await signIn(page, 'ckwantes');
            const none = await L.pressBoth(page, app, 'a33-nb-none');
            fact('nb none article PDF', none.article);
            fact('nb none Full Issue PDF', none.full);
            fact('nb expired row (SQL)', L.plantMembership(app, 'ckwantes', '2 years'));
            const ended = await L.pressBoth(page, app, 'a33-nb-ended');
            fact('nb ended article PDF', ended.article);
            fact('nb ended Full Issue PDF', ended.full);
        }
        await signOut(page);
    } catch (e) {
        f.error = String(e.stack || e.message).slice(0, 900);
        console.log(`[fact] ojs FAILED: ${f.error}`);
        await shot(page, 'a33-failed').catch(() => {});
    } finally {
        record(process.env.PROBE_NAME || 'a33-facts', f);
        await close();
    }
});
