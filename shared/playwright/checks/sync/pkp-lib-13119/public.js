// Kept check for pkp/pkp-lib#13119 / pkp/ojs#5715 / pkp/crossref-ojs#112 (issue pkp/pkp-lib#13062, regression read
// rr13062, 2026-10-28): the reader pages the review records point at, opened signed out. OJS only; needs seed.js's
// journals (seed-ojs.json in the same output folder). S7 and S11 of .reports/sync/rr13062/suspicions.md.
//   new-*   the URL both agencies send at the heads: article/view/{bestId}/version/{round's publication}
//           ?tab=peer-review-record&reviewId={id} (W1's review 1; W3's review, a work with a URL path; W4's review
//           of version 1 after version 2 is published)
//   amp-*   the URL as DataCite's /doi call carries it at the head (`&amp;reviewId=`, deposit.js dc-ok)
//   base-*  the URL Crossref sent at the base: article/view/{urlPath or id}?tab=peer-review-record&reviewId={id}
// For each: the answer's status, the tab selected, the review items on the page with their open/closed state, the
// title the page shows, and a screenshot.
//
// Run:   PROBE_FEATURE=sync PROBE_AGENT=rr13062 node bin/probe.js ojs shared/playwright/checks/sync/pkp-lib-13119/public.js
// Facts: .reports/sync/<agent>/public-ojs.json and public-<case>-ojs.png
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, record, shot, idle, sql, outDir} = require('../../../probe');

forEachApp(async (app) => {
    if (app.name !== 'ojs') return console.log(`[public] ${app.name}: skipped (OJS only)`);
    const seed = JSON.parse(fs.readFileSync(path.join(outDir(), 'seed-ojs.json'), 'utf8'));
    const {X, V} = seed.contexts;
    const {W1, W3, W4} = seed.works;
    const r1 = seed.reviews.W1[0], r6 = seed.reviews.W3[0], r7 = seed.reviews.W4[0];
    const pub = (id) => Number(String(sql(app, `select rr.publication_id from review_assignments ra join review_rounds rr on rr.review_round_id=ra.review_round_id where ra.review_id=${id}`)).trim());
    const urlPath = String(sql(app, `select coalesce(url_path,'') from publications where submission_id=${W3} order by publication_id desc limit 1`)).trim();
    const cases = [
        ['new-w1', `/index.php/${X}/article/view/${W1}/version/${pub(r1)}?tab=peer-review-record&reviewId=${r1}`, r1],
        ['new-urlpath', `/index.php/${X}/article/view/${urlPath || W3}/version/${pub(r6)}?tab=peer-review-record&reviewId=${r6}`, r6],
        ['new-v1', `/index.php/${V}/article/view/${W4}/version/${pub(r7)}?tab=peer-review-record&reviewId=${r7}`, r7],
        ['amp-urlpath', `/index.php/${X}/article/view/${urlPath || W3}/version/${pub(r6)}?tab=peer-review-record&amp;reviewId=${r6}`, r6],
        ['base-w1', `/index.php/${X}/article/view/${W1}?tab=peer-review-record&reviewId=${r1}`, r1],
        ['base-urlpath', `/index.php/${X}/article/view/${urlPath || W3}?tab=peer-review-record&reviewId=${r6}`, r6],
        ['base-v1', `/index.php/${V}/article/view/${W4}?tab=peer-review-record&reviewId=${r7}`, r7],
    ];
    const out = {};
    const {page, close} = await launch(app);
    try {
        for (const [name, url, rid] of cases) {
            const resp = await page.goto(app.url(url));
            await idle(page);
            await page.waitForTimeout(1500);
            const read = await page.evaluate((rid) => ({
                href: location.pathname + location.search,
                tabs: [...document.querySelectorAll('[role="tab"]')].map((t) => `${(t.textContent || '').trim().replace(/\s+/g, ' ')}${t.getAttribute('aria-selected') === 'true' ? ' [selected]' : ''}`),
                reviews: [...document.querySelectorAll('[data-review-id]')].map((e) => `${e.getAttribute('data-review-id')}:${e.getAttribute('data-state') || '?'}${e.getBoundingClientRect().height > 0 ? '' : ' (hidden)'}`),
                target: (() => {
                    const e = document.querySelector(`[data-review-id="${rid}"]`);
                    return e ? {state: e.getAttribute('data-state'), visible: e.getBoundingClientRect().height > 0} : null;
                })(),
                title: (document.querySelector('h1')?.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 160),
                version: (document.body.innerText.match(/Version[^\n]{0,60}/) || [''])[0],
            }), rid);
            out[name] = {url, status: resp && resp.status(), ...read};
            await shot(page, `public-${name}`);
            console.log(`[public] ojs ${name}: ${url} -> ${out[name].status}; tabs ${JSON.stringify(read.tabs)}; review items ${JSON.stringify(read.reviews)}; `
                + `review ${rid} ${JSON.stringify(read.target)}; h1 "${read.title}"; "${read.version}"`);
        }
    } finally {
        record('public', out);
        await close();
    }
});
