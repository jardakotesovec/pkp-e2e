// PR review pkp-lib#13591 round 2: Crossref's status lookup (getStatusMessage)
// when Crossref cannot be reached. No screen links it on main (only
// statusMessage.tpl renders its answer), so the manager's request is made
// directly: the plugin grid's "manage" with verb=statusMessage for an article
// whose DOI has no stored failure message (the undeposited neighbour of the
// A18 walk, run first on the same fleet: OJS 1, OPS 5).
// Base: the ConnectException escapes (a 500 or an error page);
// head: a JSON answer whose content carries the "mdsError" text.
//   PROBE_FEATURE=<ds1 feature> PROBE_AGENT=pr13591 node bin/probe.js ojs,ops shared/playwright/checks/sync/pkp-lib-13591/status.js
const {forEachApp, launch, signIn, record} = require('../../../probe');

const ITEM = {ojs: 1, ops: 5};
const flat = (s, n = 600) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));

forEachApp(async (app) => {
    if (!ITEM[app.name]) return console.log(`[status] ${app.name}: no Crossref plugin; skipped`);
    const {page, close} = await launch(app);
    try {
        await signIn(page, 'dbarnes');
        const qs = new URLSearchParams({plugin: 'CrossrefExportPlugin', category: 'importexport', verb: 'statusMessage', articleId: String(ITEM[app.name]), batchId: 'u45-pr13591'});
        const url = app.url(`/index.php/${app.contextPath}/$$$call$$$/grid/settings/plugins/settings-plugin-grid/manage?${qs}`);
        const r = await page.request.get(url, {failOnStatusCode: false});
        const body = await r.text();
        let json = null;
        try { json = JSON.parse(body); } catch (e) { /* not JSON */ }
        const out = {app: app.name, run: process.env.PROBE_RUN || null, status: r.status(), json: !!json, jsonStatus: json && json.status,
            content: flat(json ? json.content : body, 700)};
        console.log(`[fact] ${app.name} status lookup: ${JSON.stringify(out)}`);
        record(`status-lookup-${process.env.PROBE_RUN || 'run'}`, out);
    } finally {
        await close();
    }
});
