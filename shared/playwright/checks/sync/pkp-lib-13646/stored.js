// PR review of pkp/pkp-lib#13646 (pkp/omp#2563 main, #2529 stable-3_5_0): after a dataset fleet's
// upgrade, the stored default English texts of the three emails the PRs change, and the install's
// version rows. Reads only.
//   PROBE_FEATURE=<feature> PROBE_AGENT=stored [PROBE_RUN=<label>] node bin/probe.js omp shared/playwright/checks/sync/pkp-lib-13646/stored.js
const {forEachApp, record, sql} = require('../../../probe');

forEachApp(async (app) => {
    if (app.name !== 'omp') return;
    const run = process.env.PROBE_RUN ? `-${process.env.PROBE_RUN}` : '';
    const versions = sql(app, "select major||'.'||minor||'.'||revision||'.'||build, current, date_installed from versions where product_type = 'core' order by date_installed").split('\n');
    // One JSON row per template text: bodies can hold line breaks.
    const rows = sql(app, "select row_to_json(t) from (select email_key as key, locale, subject, body from email_templates_default_data where email_key in ('REVIEW_COMPLETE','REVIEW_CANCEL','REVIEWER_UNASSIGN') order by email_key, locale) t").split('\n').filter(Boolean).map((l) => JSON.parse(l));
    const texts = rows.map(({key, locale, subject, body}) => {
        const all = `${subject} ${body}`;
        return {key, locale, subject, recommendation: /Recommendation|recommends|recommande/i.test(all), journalName: /\{\$journalName\}/.test(all), contextName: /\{\$contextName\}/.test(all), body: String(body).replace(/\s+/g, ' ').slice(0, 400)};
    });
    for (const t of texts.filter((x) => x.locale === 'en')) console.log(`[stored] ${app.line || 'main'} ${t.key}: ${t.subject} | recommendation=${t.recommendation} journalName=${t.journalName} contextName=${t.contextName}`);
    console.log(`[stored] versions ${JSON.stringify(versions)}; locales ${[...new Set(texts.map((t) => t.locale))].join(',')}`);
    record(`stored${run}`, {line: app.line || 'main', versions, texts});
});
