// U19 claim check K2 — Rule 5 (q9's "metadata edit of a published version") and Rule 4a's "each of its formats":
//   every app: the published item A's "Title & Abstract" page as C1's manager — is there a "Save" to press;
//   OMP: book A (two formats) unpublished on screen: both formats' records read at the site-wide address; then
//   published again.
//   STEP=edit: instead, the published A's "Prefix" typed and saved on its Title & Abstract page (the warned edit of a
//   published version), the record's datestamp read at the site-wide address before and after.
//   PROBE_FEATURE=U19 PROBE_AGENT=ccK2 node bin/probe.js all shared/playwright/checks/U19/K2/published-edit.js
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, screen, shot, record, loc, idle, outDir} = require('../../../probe');

const T = 30_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

forEachApp(async (app) => {
    const isOMP = app.name === 'omp', isOPS = app.name === 'ops';
    const S = JSON.parse(fs.readFileSync(path.join(outDir(), `k2-state-${app.name}.json`), 'utf8'));
    const A = S.subs.A;
    const out = {};
    const {page, close} = await launch(app);
    const vis = await launch(app);
    const wf = () => page.locator('[role="dialog"]:visible').first();
    const wfUrl = app.url(`/index.php/${S.C1.path}/dashboard/editorial?workflowSubmissionId=${A.id}&workflowMenuKey=publication_${A.pub}_titleAbstract`);
    const siteGet = async (label, f) => {
        const url = app.url(`/index.php/index/oai?verb=GetRecord&metadataPrefix=oai_dc&identifier=oai:${app.name}-test.localhost:${isOMP ? 'publicationFormat' : isOPS ? 'preprint' : 'article'}/${f}`);
        await vis.page.goto(url); await idle(vis.page).catch(() => {});
        record(label, await screen(vis.page));
        const x = await (await vis.page.request.get(url)).text();
        return `${/status="deleted"/.test(x) ? 'DELETED ' : ''}${(x.match(/<datestamp>([^<]*)/) || [])[1]} [${(x.match(/<setSpec>([^<]*)/) || [])[1]}]${/<metadata>/.test(x) ? ' md' : ''}`;
    };
    if (process.env.STEP === 'edit') {
        try {
            const rid = isOMP ? A.formats[0].id : A.id;
            out.before = await siteGet('pe-10-edit-before', rid);
            await signIn(page, S.C1.mg, {contextPath: S.C1.path});
            await page.goto(wfUrl); await idle(page); await sleep(1500);
            const prefix = wf().locator('input[name^="prefix"]').first();
            await prefix.waitFor({state: 'visible', timeout: T});
            await sleep(2000);
            await prefix.fill('K2');
            const w = page.waitForResponse((r) => /\/publications\/\d+/.test(r.url()) && r.request().method() !== 'GET', {timeout: T}).catch(() => null);
            await wf().getByRole('button', {name: 'Save', exact: true}).first().click();
            out.save = (await w)?.status() ?? null; out.savedAt = new Date().toISOString();
            await page.locator('[role="status"]').filter({hasText: 'Saved'}).first().waitFor({timeout: 10_000}).catch(() => {});
            record('pe-11-edit-saved', await screen(page)); await shot(page, 'pe-11-edit-saved');
            await sleep(1500);
            out.after = await siteGet('pe-12-edit-after', rid);
        } finally {
            record('pe-edit-facts', out);
            console.log('[k2p]', app.name, JSON.stringify(out));
            await close(); await vis.close();
        }
        return;
    }
    try {
        await signIn(page, S.C1.mg, {contextPath: S.C1.path});
        await page.goto(wfUrl); await idle(page); await sleep(1500);
        const s = await screen(page); record('pe-01-published-title-abstract', s); await shot(page, 'pe-01-published-title-abstract');
        const save = wf().getByRole('button', {name: 'Save', exact: true});
        await loc(page, 'Published version: Title & Abstract "Save"', save);
        out.save = {count: await save.count(), enabled: (await save.count()) ? await save.first().isEnabled() : null};
        out.lockText = ((s.text.dialog || '').split('\n').find((l) => /cannot be edited|can not be edited|has been published|has been posted|create a new version/i.test(l)) || null);
        out.titleDisabled = await wf().locator('input[name^="title"], [id*="title-control"]').first().evaluate((e) => e.disabled || e.getAttribute('contenteditable') === 'false' || e.getAttribute('aria-disabled')).catch(() => null);
        if (isOMP) {
            const fmts = A.formats.map((f) => f.id);
            out.before = {};
            for (const f of fmts) out.before[f] = await siteGet(`pe-02-before-${f}`, f);
            await page.getByRole('button', {name: 'Unpublish', exact: true}).first().click();
            const d = page.getByRole('dialog').filter({hasText: "Are you sure you don't want this to be published?"}).last();
            await d.waitFor({timeout: T});
            const w1 = page.waitForResponse((r) => r.url().includes('/unpublish') && r.request().method() !== 'GET', {timeout: T}).catch(() => null);
            await d.getByRole('button', {name: 'Unpublish', exact: true}).last().click();
            out.unpublish = (await w1)?.status() ?? null; out.unpublishAt = new Date().toISOString();
            await idle(page); await sleep(1500);
            out.deleted = {};
            for (const f of fmts) out.deleted[f] = await siteGet(`pe-03-deleted-${f}`, f);
            await page.goto(wfUrl); await idle(page);
            await page.locator('[data-cy="workflow-controls-right"]').getByRole('button', {name: 'Publish', exact: true}).click();
            const m = page.getByRole('dialog', {name: /Schedule For Publication/});
            await m.waitFor({timeout: T}); await idle(page);
            const w2 = page.waitForResponse((r) => /\/publish/.test(r.url()) && r.request().method() !== 'GET', {timeout: T}).catch(() => null);
            await m.getByRole('button', {name: 'Publish', exact: true}).click();
            out.publish = (await w2)?.status() ?? null;
            await idle(page); await sleep(1500);
            out.after = {};
            for (const f of fmts) out.after[f] = await siteGet(`pe-04-after-${f}`, f);
        }
    } finally {
        record('pe-facts', out);
        console.log('[k2p]', app.name, JSON.stringify(out));
        await close(); await vis.close();
    }
});
