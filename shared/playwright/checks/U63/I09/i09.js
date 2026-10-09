// U63 claim check, chunk I09 (housekeeping hk09, 2026-10-09): the incidentals rows of .reports/hk09/chunks/U63.md
// driven through the screens.
// Spec: docs/specs/U63-import-export.md — Rules 8, 9, 10, 13 (the Native XML import), 37, 42, 43, 44 (the DOAJ
// statuses and the daily deposit); register A7, OJS9, the retired A5; footnotes e, f, s, t, u, x, f-a5.
//
// Rows L9 and L10 (doaj.js; OJS, the campaign fleet): a scratch journal of the run's own, tag prefix u63i09<run>.
//   bin/app-lock.sh shared ojs -- env PROBE_FEATURE=U63 PROBE_AGENT=ccI09 PROBE_RUN=r1 PHASES=doaj \
//       node bin/probe.js ojs shared/playwright/checks/U63/I09/i09.js
//   The phase runs the installation's daily DOAJ task and the fleet's queued jobs: two runs of it never overlap.
//   Its 3.5 control (doaj35.js): PKP_E2E_LINE=stable-3_5_0 PROBE_FEATURE=U63 PROBE_AGENT=ccI09 PROBE_RUN=r1x35 \
//       PHASES=doaj35 node bin/probe.js ojs shared/playwright/checks/U63/I09/i09.js
// Row L11 (native.js; a dataset fleet of the run's own, reloaded before each run):
//   npm run fleet-prep -- --feature issues-c1 --dataset 4 --reset
//   bin/app-lock.sh shared ojs,omp -- env PKP_E2E_DATASET=4 PROBE_FEATURE=U63 PROBE_AGENT=ccI09 PROBE_RUN=r1 \
//       PHASES=size,grow,ten,hundred node bin/probe.js omp,ojs shared/playwright/checks/U63/I09/i09.js
//   OPS takes `size` only (bin/app-lock.sh shared ops -- … PHASES=size node bin/probe.js ops …). The press's part
//   holds the lock about eleven minutes and the journal's about four: name only the apps the run drives.
//
// State: <phase>-state-<PROBE_RUN>-<app>.json in the output folder (RESEED=1 starts over). DB reads (psql) and the
// fleet's server log are evidence beside the screens. One write goes to the database, on the run's own scratch
// journal: the stored "Failed" state of row L10, which no screen of a test install reaches (doaj.js says why).
// No assertions: the script records, the reader judges.
const {forEachApp, launch} = require('../../../probe');
const {flat, rel, makeCtx} = require('./lib');

const PHASES = (process.env.PHASES || '').split(',').filter(Boolean);
const on = (p) => PHASES.includes(p);
if (!PHASES.length) { console.error('PHASES=doaj | doaj35 | size,grow,ten,hundred (see the header)'); process.exit(1); }

forEachApp(async (app) => {
    const {page, close} = await launch(app);
    page.setDefaultTimeout(20_000);
    const dialogs = [];
    page.on('dialog', (d) => { dialogs.push({type: d.type(), message: flat(d.message(), 300), url: rel(page.url())}); d.accept().catch(() => {}); });
    const phase = on('doaj') ? 'doaj' : on('doaj35') ? 'doaj35' : 'native';
    const c = makeCtx(app, page, phase);
    c.dialogs = dialogs;
    const step = async (name, fn) => {
        c.log('== phase', name);
        try { await fn(); } catch (e) { c.log('phase FAILED', name, flat(e.stack, 1500)); c.fact(`${name}-error`, flat(e.stack, 1500)); await c.snap(`err-${name}`).catch(() => {}); }
        c.save();
    };
    try {
        if (phase === 'doaj' && app.name === 'ojs') await step('doaj', () => require('./doaj').rowsL9L10(c));
        if (phase === 'doaj35' && app.name === 'ojs') await step('doaj35', () => require('./doaj35').rowL9on35(c));
        if (phase === 'native') await step('native', () => require('./native').rowL11(c, (p) => on(p) && (app.name !== 'ops' || p === 'size')));
        c.fact(`dialogs-${app.name}`, dialogs);
    } finally {
        c.save();
        await close();
    }
});
