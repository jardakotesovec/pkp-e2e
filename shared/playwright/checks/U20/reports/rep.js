// U20 team write-ups: one re-drive of the numbered steps of the two OJS reports (register OJS2, OJS1).
// Spec: docs/specs/U20-search-engine-metadata-and-analytics.md, footnotes f-ojs2, f-ojs1;
// reports docs/reports/2026-09-26-ojs-sitemap-lists-no-article.md, docs/reports/2026-09-26-ojs-dc-source-uri-404.md.
//
//   PROBE_FEATURE=U20 PROBE_AGENT=rep node bin/probe.js ojs shared/playwright/checks/U20/reports/rep.js
//
// Scratch journal (tag prefix u20rep) "Tide Notes", with a Journal Manager (mg) and an author (au):
// issue Vol. 1 No. 1 (2025) published; "Tidal Patterns" and "Sea Study" published in it, each with a "PDF" galley.
// Phases (all by default): seed · ojs2 · ojs1. State in rep-state-<app>.json. No assertions: the script records.
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signOut, screen, shot, record, idle, tag, outDir} = require('../../../probe');

const PHASES = (process.env.PHASES || 'seed,ojs2,ojs1').split(',');
const on = (p) => PHASES.includes(p);
const flat = (s, n = 1500) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));

forEachApp(async (app) => {
    if (app.name !== 'ojs') return;
    const sp = path.join(outDir(), `rep-state-${app.name}.json`);
    const S = fs.existsSync(sp) ? JSON.parse(fs.readFileSync(sp, 'utf8')) : {};
    const save = () => fs.writeFileSync(sp, JSON.stringify(S, null, 1));
    const fact = (k, v) => { record('rep-facts', {[k]: v}, {merge: true}); console.log(`[rep ${k}]`, JSON.stringify(v).slice(0, 2500)); };
    const strip = (u) => (u || '').replace(/^https?:\/\/127\.0\.0\.1:\d+/, '');
    const cu = (ctx, p = '') => app.url(`/index.php/${ctx}${p}`);

    await app.api.bootstrapProbe(app.contextPath);
    if (on('seed') && !S.path) {
        const t = tag('u20rep');
        const p = t;
        const c = await app.api.createContext({tag: p,
            users: [{username: `${p}mg`, roles: ['manager'], givenName: 'Mona', familyName: 'Manager'}, {username: `${p}au`, roles: ['author'], givenName: 'Ada', familyName: 'Author'}],
            issues: [{volume: 1, number: 1, year: 2025, published: true}],
            context: {name: `Tide Notes ${t}`, acronym: 'TN'}});
        S.t = t; S.path = c.path; S.issues = c.issues; S.subs = {};
        for (const [k, title] of [['tp', 'Tidal Patterns'], ['ss', 'Sea Study']]) {
            const r = await app.api.createSubmission({tag: `${t}${k}`, context: c.path, submitter: `${p}au`, title,
                abstract: '<p>Tides follow the moon.</p>', published: true, issue: {volume: 1, number: 1, year: 2025},
                galleys: [{label: 'PDF', file: 'article.pdf'}]});
            S.subs[k] = {id: r.submissionId, pub: r.publicationId, galleys: r.galleys || null};
        }
        save();
        fact('seed', S);
    }
    const J = S.path;
    const {page, close} = await launch(app);
    const snap = async (name, extra = {}, png = false) => { let s; try { s = await screen(page); } catch (e) { s = {url: page.url(), error: String(e.message)}; } Object.assign(s, extra); record(name, s); if (png) await shot(page, name).catch(() => {}); return s; };
    try {
        await signOut(page).catch(() => {});
        if (on('ojs2')) {
            // 1. Signed out: the journal's "Archives", then the issue
            await page.goto(cu(J)); await idle(page);
            await page.getByRole('link', {name: 'Archives', exact: true}).first().click(); await idle(page);
            await page.getByRole('link', {name: /Vol\. 1 No\. 1 \(2025\)/}).first().click(); await idle(page);
            const issueLinks = await page.locator('a[href*="/article/view/"]').evaluateAll((els) => els.map((a) => ({text: a.innerText.replace(/\s+/g, ' ').trim(), href: a.getAttribute('href')})));
            await snap('ojs2-01-issue-page', {issueLinks}, true);
            fact('ojs2-01-issue-page', {url: strip(page.url()), title: await page.title(), issueLinks: issueLinks.map((l) => ({text: l.text, href: strip(l.href)}))});
            // 2. The sitemap
            const resp = await page.goto(cu(J, '/sitemap'));
            const body = await resp.text();
            const locs = [...body.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => strip(m[1]));
            await snap('ojs2-02-sitemap', {status: resp.status(), headers: {ct: resp.headers()['content-type'], cd: resp.headers()['content-disposition']}, locs, body}, true);
            fact('ojs2-02-sitemap', {url: strip(page.url()), status: resp.status(), ct: resp.headers()['content-type'], cd: resp.headers()['content-disposition'], locs, body: body.slice(0, 3000)});
            // control: each article and galley address the issue page links opens
            const follow = [];
            for (const l of [...new Set(issueLinks.map((x) => x.href))]) {
                const r = await page.request.get(l, {maxRedirects: 0}).catch((e) => ({err: e.message}));
                follow.push({href: strip(l), status: r.status ? r.status() : r.err});
            }
            fact('ojs2-03-issue-links-open', follow);
        }
        if (on('ojs1')) {
            // 1. Signed out: the journal's home page, the article "Tidal Patterns"
            await page.goto(cu(J)); await idle(page);
            await page.getByRole('link', {name: 'Tidal Patterns', exact: true}).first().click(); await idle(page);
            await snap('ojs1-01-article-page', {}, true);
            // 2. The page's source: its DC and GS tags
            const tags = await page.evaluate(() => [...document.querySelectorAll('meta[name^="DC."], link[rel="schema.DC"]')].map((m) => m.outerHTML));
            const src = await page.evaluate(() => document.querySelector('meta[name="DC.Source.URI"]')?.getAttribute('content'));
            fact('ojs1-02-source', {url: strip(page.url()), sourceUri: src, dcTags: tags.filter((x) => /DC\.(Source|Identifier\.URI)/.test(x))});
            // 3. Open that address
            const r3 = await page.goto(src); await idle(page);
            const s3 = await snap('ojs1-03-source-uri-opened', {status: r3 && r3.status()}, true);
            fact('ojs1-03-source-uri-opened', {url: strip(page.url()), status: r3 && r3.status(), title: await page.title(), main: flat(s3.text && (s3.text.main || s3.text.body), 400)});
            // control: the journal's home page
            const r4 = await page.goto(cu(J)); await idle(page);
            fact('ojs1-04-home-control', {url: strip(page.url()), status: r4 && r4.status(), title: await page.title()});
        }
    } finally {
        await close();
    }
});
