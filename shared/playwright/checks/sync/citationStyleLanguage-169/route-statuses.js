// Kept check for pkp/citationStyleLanguage#169 (pkp/pkp-lib#13595): the plugin's `get` and `download` routes'
// answers on PKP's default test dataset, context `publicknowledge`, in every app (the handler is shared).
//   npm run fleet-prep -- --feature sync-13595-r --dataset 1 --reset --apps <apps>
//   PROBE_RUN=<base|head> PROBE_FEATURE=sync-13595-r PROBE_AGENT=r node bin/probe.js <apps> \
//     shared/playwright/checks/sync/citationStyleLanguage-169/route-statuses.js
// `rvaca` ticks "Citation Style Language" (Settings › Website › Plugins); then, signed out and as `ccorino`
// (a Reader; `bbarnetson` on OMP) and `rvaca`, each app's published item (its own page's RIS link, the control) and an unpublished
// submission named by `submissionId` alone, through `get/apa?return=json` and `download/ris`.
// Before the PR a signed-out visitor's request for the unpublished one fails with a server error (a TypeError
// in canUserAccess()); after it, it must be refused with 404, the Reader's stays 404, the manager's preview 200,
// and the published control 200 for all. No assertions: the session judges.
const {forEachApp, launch, signIn, signOut, record, idle} = require('../../../probe');

const ITEMS = {
    ojs: {page: '/article/view/17', unpublished: 9, reader: 'ccorino'},
    omp: {page: '/catalog/book/5', unpublished: 1, reader: 'bbarnetson'},
    ops: {page: '/preprint/view/2', unpublished: 1, reader: 'ccorino'},
};

forEachApp(async (app) => {
    const item = ITEMS[app.name];
    const {page, close} = await launch(app);
    const facts = {line: app.line, dataset: app.dataset, rows: []};
    try {
        const {CitationStyleSettings} = require('../../../pages/ArticleLandingPages');
        await signIn(page, 'rvaca');
        const settings = new CitationStyleSettings(page, app.contextPath);
        await settings.openPlugins();
        if (!(await settings.enabledBox().isChecked())) await settings.setEnabled(true);
        facts.pluginEnabled = await settings.enabledBox().isChecked();
        for (const who of ['(signed out)', item.reader, 'rvaca']) {
            if (who === '(signed out)') await signOut(page);
            else await signIn(page, who);
            await page.goto(app.url(`/index.php/${app.contextPath}${item.page}`));
            await idle(page);
            const ris = await page.locator('a[href*="citationstylelanguage/download/ris"]').first().getAttribute('href').catch(() => null);
            // The routes' own address, locale part included, taken from the page's link.
            const base = ris ? new URL(ris, page.url()).href.replace(/\/download\/ris\?.*$/, '') : null;
            const targets = [
                ['published (page link)', ris],
                ['unpublished get', base && `${base}/get/apa?submissionId=${item.unpublished}&return=json`],
                ['unpublished download', base && `${base}/download/ris?submissionId=${item.unpublished}`],
            ];
            for (const [what, url] of targets) {
                if (!url) {
                    facts.rows.push({who, what, status: 'no link on the page'});
                    continue;
                }
                const r = await page.request.get(url, {maxRedirects: 0});
                const body = (await r.text()).replace(/\s+/g, ' ').trim();
                facts.rows.push({who, what, url: url.replace(/^https?:\/\/[^/]+/, ''), status: r.status(), body: body.slice(0, 120)});
            }
        }
    } finally {
        record('routes', facts);
        for (const r of facts.rows) console.log(`${app.name} ${r.who.padEnd(13)} ${r.what.padEnd(22)} ${r.status}  ${(r.body || '').slice(0, 70)}`);
        await close();
    }
});
