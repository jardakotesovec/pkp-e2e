// U19 claim check K2 — follow-up to k2.js (run after its "section" phase), OJS and OPS:
// Rule 7c's "while deleted records remain in it": the deleted section OLD is listed while W's deleted record
// carries it; W is then published again on screen (now in the first section) and ListSets is read again.
// Also reads the site-wide list for W's deleted record before the publish.
// OMP (ONLY=omp): book N (one format, no series) unpublished and published again on screen; its record's
// datestamp read before, while deleted and after (Rule 5 on a press, a second sighting after k2.js's X).
//   PROBE_FEATURE=U19 PROBE_AGENT=ccK2 ONLY=ojs,ops node bin/probe.js all shared/playwright/checks/U19/K2/followup.js
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, screen, shot, record, idle, outDir} = require('../../../probe');

const T = 30_000;
const log = (...a) => console.log('[k2f]', ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

forEachApp(async (app) => {
    if (app.name === 'omp') return ompRepublish(app);
    const isOPS = app.name === 'ops';
    const S = JSON.parse(fs.readFileSync(path.join(outDir(), `k2-state-${app.name}.json`), 'utf8'));
    const W = S.subs.W;
    const out = {};
    const {page, close} = await launch(app);
    const vis = await launch(app);
    const get = async (label, ctx, qs) => {
        const url = app.url(`/index.php/${ctx}/oai?${qs}`);
        await vis.page.goto(url); await idle(vis.page).catch(() => {});
        const s = await screen(vis.page);
        const body = await (await vis.page.request.get(url)).text();
        record(label, {url: url.replace(app.baseURL, ''), screen: s});
        return body;
    };
    const setsOf = (x) => [...x.matchAll(/<setSpec>([^<]*)<\/setSpec>\s*<setName>([^<]*)</g)].map((m) => `${m[1]}=${m[2]}`);
    const wIn = (x) => [...x.matchAll(/<header( status="deleted")?>([\s\S]*?)<\/header>/g)].filter((h) => h[2].includes(`/${W.id}<`)).map((h) => `${h[1] ? 'DELETED ' : ''}${(h[2].match(/<datestamp>([^<]*)/) || [])[1]} [${[...h[2].matchAll(/<setSpec>([^<]*)/g)].map((m) => m[1])}]`);
    try {
        out.setsBefore = setsOf(await get('f-01-c1-listsets-before', S.C1.path, 'verb=ListSets'));
        let x = await get('f-02-site-li-before', 'index', 'verb=ListIdentifiers&metadataPrefix=oai_dc');
        const all = [x];
        let tok = (x.match(/<resumptionToken[^>]*>([^<]+)</) || [])[1];
        while (tok) { x = await (await vis.page.request.get(app.url(`/index.php/index/oai?verb=ListIdentifiers&resumptionToken=${tok}`))).text(); all.push(x); tok = (x.match(/<resumptionToken[^>]*>([^<]+)</) || [])[1]; }
        out.siteW = all.flatMap(wIn);
        out.c1W = wIn(await get('f-03-c1-li-before', S.C1.path, 'verb=ListIdentifiers&metadataPrefix=oai_dc'));
        // publish W again on screen (the manager of C1)
        await signIn(page, S.C1.mg, {contextPath: S.C1.path});
        await page.goto(app.url(`/index.php/${S.C1.path}/dashboard/editorial?workflowSubmissionId=${W.id}&workflowMenuKey=publication_${W.pub}_titleAbstract`));
        await idle(page);
        const pb = page.locator('[data-cy="workflow-controls-right"]').getByRole('button', {name: isOPS ? /^Post$/ : /^(Schedule For Publication|Publish)$/}).first();
        await pb.waitFor({state: 'visible', timeout: T});
        await pb.click(); await idle(page); await sleep(600);
        const panel = page.locator('[role="dialog"]:visible').last();
        const stage = panel.locator('select[name="versionStage"]');
        if (await stage.isVisible().catch(() => false)) { if (!(await stage.inputValue().catch(() => ''))) await stage.selectOption('VoR').catch(() => {}); }
        const dont = panel.getByRole('radio', {name: "Don't Assign To An Issue"});
        if (await dont.isVisible().catch(() => false)) { await panel.locator('input[name="assignment"]:checked').first().waitFor({timeout: 10_000}).catch(() => {}); await dont.check(); }
        const done = page.waitForResponse((r) => /\/publish/.test(r.url()) && r.request().method() !== 'GET', {timeout: T}).catch(() => null);
        await panel.getByRole('button', {name: /^(Confirm|Publish|Post)$/}).last().click(); await sleep(800);
        const conf = page.getByRole('dialog').filter({hasText: /Are you sure you want to (publish|post) this\?/}).last();
        if (await conf.isVisible().catch(() => false)) await conf.getByRole('button', {name: /^(Publish|Post)$/}).last().click();
        const r = await done; out.publish = r ? r.status() : null; out.at = new Date().toISOString();
        await idle(page); await sleep(1200);
        record('f-04-w-published', await screen(page)); await shot(page, 'f-04-w-published');
        out.setsAfter = setsOf(await get('f-05-c1-listsets-after', S.C1.path, 'verb=ListSets'));
        out.c1WAfter = wIn(await get('f-06-c1-li-after', S.C1.path, 'verb=ListIdentifiers&metadataPrefix=oai_dc'));
    } finally {
        record('f-facts', out);
        log(app.name, JSON.stringify(out));
        await close(); await vis.close();
    }
});

async function ompRepublish(app) {
    const S = JSON.parse(fs.readFileSync(path.join(outDir(), 'k2-state-omp.json'), 'utf8'));
    const N = S.subs.N;
    const fmt = N.formats[0].id;
    const out = {};
    const {page, close} = await launch(app);
    const vis = await launch(app);
    const rec = async (label) => {
        const url = app.url(`/index.php/index/oai?verb=GetRecord&metadataPrefix=oai_dc&identifier=oai:omp-test.localhost:publicationFormat/${fmt}`);
        await vis.page.goto(url); await idle(vis.page).catch(() => {});
        record(label, await screen(vis.page));
        const x = await (await vis.page.request.get(url)).text();
        return `${/status="deleted"/.test(x) ? 'DELETED ' : ''}${(x.match(/<datestamp>([^<]*)/) || [])[1]}`;
    };
    const wf = app.url(`/index.php/${S.C1.path}/dashboard/editorial?workflowSubmissionId=${N.id}&workflowMenuKey=publication_${N.pub}_titleAbstract`);
    try {
        out.before = await rec('f-omp-01-before');
        await signIn(page, S.C1.mg, {contextPath: S.C1.path});
        await page.goto(wf); await idle(page);
        await page.getByRole('button', {name: 'Unpublish', exact: true}).first().click();
        const d = page.getByRole('dialog').filter({hasText: "Are you sure you don't want this to be published?"}).last();
        await d.waitFor({timeout: T});
        const w1 = page.waitForResponse((r) => r.url().includes('/unpublish') && r.request().method() !== 'GET', {timeout: T}).catch(() => null);
        await d.getByRole('button', {name: 'Unpublish', exact: true}).last().click();
        out.unpublish = (await w1)?.status() ?? null; out.unpublishAt = new Date().toISOString();
        await idle(page); await sleep(1500);
        out.deleted = await rec('f-omp-02-deleted');
        await page.goto(wf); await idle(page);
        await page.locator('[data-cy="workflow-controls-right"]').getByRole('button', {name: 'Publish', exact: true}).click();
        const m = page.getByRole('dialog', {name: /Schedule For Publication/});
        await m.waitFor({timeout: T}); await idle(page);
        const w2 = page.waitForResponse((r) => /\/publish/.test(r.url()) && r.request().method() !== 'GET', {timeout: T}).catch(() => null);
        await m.getByRole('button', {name: 'Publish', exact: true}).click();
        out.publish = (await w2)?.status() ?? null; out.publishAt = new Date().toISOString();
        await idle(page); await sleep(1500);
        record('f-omp-03-published', await screen(page));
        out.after = await rec('f-omp-04-after');
    } finally {
        record('f-facts', out);
        log('omp', JSON.stringify(out));
        await close(); await vis.close();
    }
}
