// PR review of pkp-lib#13789 (sitemap: all published articles, best IDs, PDF download URLs,
// batched queries, the editorial masthead; Google Scholar URLs). Runs on PKP's default dataset.
//   MODE=change (once per fleet, at the PR head): puts the dataset in the states the change is about
//     OJS  sub 15 published with no issue; sub 17 unpublished; sub 1 keeps its draft second version
//     OMP  book 14 "Create New Version", then that version published (chapters by source id)
//     OPS  preprint 19 new version with URL path "nineteen-v2", published
//   MODE=read (default, at any ref): the sitemap signed out, every entry followed, and the
//     Google Scholar URL tags of every item page listed, compared with the sitemap.
// Reset first: npm run fleet-prep -- --feature sync --dataset --reset
// Run: PROBE_FEATURE=sync PROBE_RUN=<label> MODE=<change|read> node bin/probe.js <app> shared/playwright/checks/sync/pkp-lib-13789/walk.js
//      (PKP_E2E_LINE=stable-3_5_0 in front for 3.5)
const {forEachApp, launch, signIn, idle, apiAs, sql} = require('../../../probe');

const rel = (u, app) => String(u).replace(/^https?:\/\/[^/]+/, '').replace(`/index.php/${app.contextPath}`, '');

async function change(app, page) {
    await signIn(page, 'admin', {password: 'admin', contextPath: app.contextPath});
    await page.goto(app.url(`/index.php/${app.contextPath}/en/dashboard/editorial`));
    await idle(page).catch(() => {});
    const call = async (m, p, b) => {
        const r = await apiAs(page, m, p, b);
        const j = await r.json().catch(() => ({}));
        console.log(`[fact] ${app.name} ${m} ${p} -> ${r.status()} ${JSON.stringify(j).slice(0, 200)}`);
        return j;
    };
    const cur = (id) => Number(sql(app, `select current_publication_id from submissions where submission_id=${id}`));
    if (app.name === 'ojs') {
        await call('PUT', `submissions/15/publications/${cur(15)}/publish`);
        await call('PUT', `submissions/17/publications/${cur(17)}/unpublish`);
    } else if (app.name === 'omp') {
        const v = await call('POST', `submissions/14/publications/${cur(14)}/version`, {versionStage: 'VoR', versionIsMinor: true});
        if (v.id) await call('PUT', `submissions/14/publications/${v.id}/publish`);
    } else {
        const v = await call('POST', `submissions/19/publications/${cur(19)}/version`, {versionStage: 'VoR', versionIsMinor: true});
        if (v.id) {
            await call('PUT', `submissions/19/publications/${v.id}`, {urlPath: 'nineteen-v2'});
            await call('PUT', `submissions/19/publications/${v.id}/publish`);
        }
    }
}

async function read(app, page) {
    const fact = (k, v) => console.log(`[fact] ${app.name} ${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`);
    const res = await page.request.get(app.url(`/index.php/${app.contextPath}/en/sitemap`));
    const locs = [...(await res.text()).matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1]);
    fact('sitemap', {status: res.status(), entries: locs.length});
    const bad = [];
    for (const l of locs) {
        const r = await page.request.get(l, {maxRedirects: 5, failOnStatusCode: false});
        const type = (r.headers()['content-type'] || '').split(';')[0];
        const line = `${rel(l, app)} -> ${r.status()} ${type}`;
        fact('entry', line);
        if (r.status() !== 200) bad.push(line);
    }
    fact('entries not 200', bad);
    const items = locs.filter((l) => /\/(article\/view|preprint\/view|catalog\/book)\/[^/]+(\/chapter\/\d+)?$/.test(l));
    const tagged = [];
    for (const l of items) {
        const html = await (await page.request.get(l)).text();
        for (const m of html.matchAll(/<meta name="(citation_(?:pdf|fulltext_html|abstract_html)_url)" content="([^"]*)"/g)) {
            tagged.push({page: rel(l, app), tag: m[1], url: rel(m[2], app)});
        }
    }
    fact('tags', tagged.map((t) => `${t.page} ${t.tag} ${t.url}`));
    const plain = new Set(locs.map((l) => rel(l, app).replace(/^\/[a-z]{2}(_[A-Z]{2})?\//, '/')));
    fact('pdf tags missing from the sitemap', tagged.filter((t) => t.tag === 'citation_pdf_url' && !plain.has(t.url)).map((t) => `${t.page} ${t.url}`));
}

forEachApp(async (app) => {
    if (!app.dataset) throw new Error('walk.js runs on a dataset fleet (fleet-prep --dataset --reset)');
    const {page, close} = await launch(app);
    try {
        if (process.env.MODE === 'change') await change(app, page);
        else await read(app, page);
    } finally {
        await close();
    }
});
