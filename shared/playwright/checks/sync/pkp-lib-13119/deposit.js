// Kept check for pkp/pkp-lib#13119 / pkp/ojs#5715 (issue pkp/pkp-lib#13062, regression read rr13062, 2026-10-28):
// the deposit path of a work's reviews, S6 / S10 / S2 / S3 of .reports/sync/rr13062/suspicions.md. OJS only; needs
// seed.js's journals (its seed-ojs.json in the same output folder). For each case the scratch journal's
// Registration Agency is set in its settings row, "Deposit DOIs" is pressed on the DOIs page for the work (which
// queues DepositSubmission), then deposit.php runs that job and the DepositPeerReview jobs it queued, the agency's
// HTTP answered in deposit.php's process (nothing leaves the machine).
//   cr-site   X, Crossref, W1 (four reviews), success; the first review job runs with the site's plugins only
//   dc-ok     X, DataCite, W3 (one open review, URL path), success
//   dc-fr     X, DataCite, W2 (a fr_CA-only work), success: the review job builds its title in CLI
//   dc-fail   X, DataCite, W1, every call refused
//   dc-test   X, DataCite "Testing" on, W1, success
//   cr-none   X, Crossref, W3, success; the agency set to "None" before the review job runs
//   dc-ver    V (DOI Versioning "Yes"), DataCite, W4 (review of version 1; version 2 published), success
// At the bases (pkp-lib 2a55911889 / ojs 7705b2aeb8) DataCite deposits no review (depositPeerReviews returned []) and
// DepositSubmission gated on the deposit's hasErrors; the same cases print what the base does.
//
// Run:   PROBE_FEATURE=sync PROBE_AGENT=rr13062 node bin/probe.js ojs shared/playwright/checks/sync/pkp-lib-13119/deposit.js
//        (ONLY_CASES=dc-ok,dc-fr narrows)
// Facts: .reports/sync/<agent>/deposit-ojs.json
const fs = require('fs');
const path = require('path');
const {execFileSync} = require('child_process');
const {forEachApp, launch, signIn, record, idle, sql, serverLog, outDir} = require('../../../probe');
const {DoisPage, recordNotices} = require('../../../pages/DoisPages.js');

const CASES = [
    ['cr-site', 'X', 'W1', 'crossrefplugin', ['--answer', 'ok', '--peer-as-site-first']],
    ['cr-other', 'X', 'W3', 'crossrefplugin', ['--answer', 'ok', '--peer-as-first', 'publicknowledge']],
    ['dc-ok', 'X', 'W3', 'dataciteplugin', ['--answer', 'ok']],
    ['dc-fr', 'X', 'W2', 'dataciteplugin', ['--answer', 'ok']],
    ['dc-fail', 'X', 'W1', 'dataciteplugin', ['--answer', 'fail']],
    ['dc-test', 'X', 'W1', 'dataciteplugin', ['--answer', 'ok', '--test-mode']],
    ['cr-none', 'X', 'W3', 'crossrefplugin', ['--answer', 'ok', '--switch-none']],
    ['dc-ver', 'V', 'W4', 'dataciteplugin', ['--answer', 'ok']],
];

forEachApp(async (app) => {
    if (app.name !== 'ojs') return console.log(`[deposit] ${app.name}: skipped (OJS only)`);
    const seed = JSON.parse(fs.readFileSync(path.join(outDir(), 'seed-ojs.json'), 'utf8'));
    const only = (process.env.ONLY_CASES || '').split(',').filter(Boolean);
    const root = path.resolve(process.cwd(), app.root);
    const config = path.isAbsolute(app.configFile) ? app.configFile : path.resolve(process.cwd(), app.configFile);
    const driver = path.join(__dirname, 'deposit.php');
    const out = {};
    const log = serverLog(app);
    const from = log.mark();
    const {page, close} = await launch(app);
    page.on('dialog', (d) => d.accept().catch(() => {}));
    let signedAs = null;
    try {
        await recordNotices(page);
        for (const [name, c, w, agency, opts] of CASES) {
            if (only.length && !only.includes(name)) continue;
            const ctx = seed.contexts[c], id = seed.works[w];
            sql(app, `update journal_settings set setting_value='${agency}' where setting_name='registrationAgency'
                and journal_id=(select journal_id from journals where path='${ctx}')`);
            if (signedAs !== ctx) {
                await signIn(page, `${ctx}mgr`, {contextPath: ctx});
                signedAs = ctx;
            }
            const dp = new DoisPage(page, ctx);
            await dp.goto();
            const pressed = (await dp.runBulk('Deposit DOIs', [id])).status();
            await idle(page);
            let res;
            try {
                res = JSON.parse(execFileSync('php', [driver, ctx, String(id), ...opts], {cwd: root, env: {...process.env, PKP_CONFIG_FILE: config},
                    encoding: 'utf8', timeout: 180000}).trim().split('\n').pop());
            } catch (e) {
                res = {driverError: String(e.stdout || '').slice(-1500) + String(e.stderr || '').slice(-1500)};
            }
            out[name] = {pressed, ...res};
            console.log(`[deposit] ojs ${name}: ${ctx} work ${id} agency ${agency} "Deposit DOIs" ${pressed}; before ${JSON.stringify(res.before)}; `
                + `DepositSubmission jobs ${res.depositSubmissionJobs}, after it ${JSON.stringify(res.afterSubmission)}; DepositPeerReview jobs queued ${res.depositPeerReviewJobs}; `
                + `jobs ${JSON.stringify(res.jobs)}; calls ${JSON.stringify(res.calls)}; after ${JSON.stringify(res.after)}`
                + `${res.pluginsAsSite ? `; site plugins ${JSON.stringify(res.pluginsAsSite)}` : ''}${res.driverError ? `; DRIVER ${res.driverError}` : ''}`);
        }
    } finally {
        // Leave every scratch journal on Crossref, as seeded.
        for (const ctx of Object.values(seed.contexts)) {
            sql(app, `update journal_settings set setting_value='crossrefplugin' where setting_name='registrationAgency' and journal_id=(select journal_id from journals where path='${ctx}')`);
        }
        out.serverLog = log.since(from);
        record('deposit', out);
        await close();
    }
});
