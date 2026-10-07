// PR review of pkp/pkp-lib#13453 (#11718): U50 A9 and A20, a section heading dragged in an issue's
// "Table of Contents" › "Order". On the default dataset with submission 9 ("Hansen & Pinto: Reason
// Reclaimed", section "Reviews") published into "Vol. 1 No. 2 (2014)", as the A10 issue report's walk.js
// leaves it (git history, deleted with that report): dbarnes drags the "Reviews" heading above the
// "Articles" heading, presses "Done", reopens the tab and reads the issue's page. Reads each heading
// row's classes, the blocks during the drag, the "Done" post and the orders after. `own` as the
// argument (A20): the first section's heading dragged below that section's last article instead.
//   PROBE_FEATURE=<feature> PROBE_AGENT=<id> node bin/probe.js ojs shared/playwright/checks/sync/pkp-lib-13453/sections.js
const {forEachApp, launch, signIn, record} = require('../../../probe');
const L = require('../../issues/issue-lists-version-published-outside-it/lib');

const OWN = process.argv.includes('own');
const blocks = (win) => win.tocGrid().evaluate((root) =>
    [...root.querySelectorAll('tbody.category_grid_body')].map((tb) => ({
        block: tb.id.replace(/^.*-category-/, 'section '),
        rows: [...tb.querySelectorAll('tr.gridRow')].filter((tr) => tr.getClientRects().length).map((tr) => {
            const t = ((tr.querySelector('td .gridCellContainer') || {}).textContent || '').replace(/\s+/g, ' ').trim();
            return tr.classList.contains('has_extras') ? t : `# ${t} [${tr.className}]`;
        }),
    })));

forEachApp(async (app) => {
    if (app.name !== 'ojs') return;
    const facts = {};
    const log = (k, v) => { facts[k] = v; console.log(`[fact] ${k}: ${JSON.stringify(v)}`); };
    const {page, close} = await launch(app);
    try {
        const posts = [];
        page.on('request', (req) => {
            if (/save-sequence/.test(req.url()) && req.method() === 'POST') {
                const data = new URLSearchParams(req.postData() || '').get('data');
                posts.push(data ? JSON.parse(data) : req.postData());
            }
        });
        await signIn(page, 'dbarnes');
        const toc = await L.openToc(page, app);
        log('before', await blocks(toc.win));
        const heading = (name) => toc.win.tocGrid().locator('tr.gridRow:not(.has_extras)').filter({hasText: name}).first();
        const ordering = toc.win.tocOrdering();
        await ordering.start();
        const first = (await blocks(toc.win))[0];
        const moving = OWN ? heading(first.rows[0].replace(/^# | \[.*$/g, '')) : heading('Reviews');
        const target = OWN
            ? toc.win.articleRow(first.rows[first.rows.length - 1])
            : heading('Articles');
        const from = await moving.boundingBox();
        const to = await target.boundingBox();
        const x = from.x + 40;
        await page.mouse.move(x, from.y + from.height / 2);
        await page.mouse.down();
        await page.mouse.move(x, from.y + from.height / 2 + (OWN ? 6 : -6), {steps: 4});
        await page.mouse.move(x, OWN ? to.y + to.height - 4 : to.y + 4, {steps: 20});
        await page.mouse.move(x, OWN ? to.y + to.height + 8 : to.y - 8, {steps: 6});
        await L.sleep(200);
        await page.mouse.up();
        await L.sleep(500);
        log('dropped', await blocks(toc.win));
        const r = await ordering.done();
        log('done', {status: r ? r.status() : null, posted: posts.slice(), after: await toc.win.tocOutline()});
        await toc.win.close();
        const again = await L.openToc(page, app);
        log('reopened', again.outline);
        await again.win.close();
        log('issuePage', (await L.readIssuePage(page, app, 'issue/current')).outline);
    } finally {
        record(OWN ? 'sections-own' : 'sections', facts);
        await close();
    }
});
