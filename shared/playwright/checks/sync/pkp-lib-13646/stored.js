// PR review of pkp/pkp-lib#13646 (pkp/omp#2563 main, #2529 stable-3_5_0): after a dataset fleet's
// upgrade, the stored default English texts of the three emails the PRs change, and the install's
// version rows. Reads only.
//   PROBE_FEATURE=<feature> PROBE_AGENT=stored [PROBE_RUN=<label>] node bin/probe.js omp shared/playwright/checks/sync/pkp-lib-13646/stored.js
const {forEachApp, record, sql} = require('../../../probe');

forEachApp(async (app) => {
    if (app.name !== 'omp') return;
    const run = process.env.PROBE_RUN ? `-${process.env.PROBE_RUN}` : '';
    const versions = sql(app, "select major||'.'||minor||'.'||revision||'.'||build, current, date_installed from versions where product_type = 'core' order by date_installed").split('\n');
    const rows = sql(app, "select email_key, locale, subject, body from email_templates_default_data where email_key in ('REVIEW_COMPLETE','REVIEW_CANCEL','REVIEWER_UNASSIGN') order by email_key, locale").split('\n').filter(Boolean);
    const texts = rows.map((r) => {
        const [key, locale, subject, ...body] = r.split('|');
        const b = body.join('|');
        return {key, locale, subject, recommendation: /Recommendation|recommends/i.test(subject + b), journalName: /\{\$journalName\}/.test(subject + b), contextName: /\{\$contextName\}/.test(subject + b), body: b.replace(/\s+/g, ' ').slice(0, 400)};
    });
    for (const t of texts.filter((x) => x.locale === 'en')) console.log(`[stored] ${app.line || 'main'} ${t.key}: ${t.subject} | recommendation=${t.recommendation} journalName=${t.journalName} contextName=${t.contextName}`);
    console.log(`[stored] versions ${JSON.stringify(versions)}; locales ${[...new Set(texts.map((t) => t.locale))].join(',')}`);
    record(`stored${run}`, {line: app.line || 'main', versions, texts});
});
