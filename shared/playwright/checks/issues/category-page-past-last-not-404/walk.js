// Issue report docs/issues/U16-A23-category-page-past-last-not-404.md (U16 A23): a category's page number
// typed past its last page opens an empty page instead of "404 Not Found". Takes the report's Steps on
// PKP's default test dataset (a dataset fleet), OJS, OMP and OPS:
//   1-6  dbarnes: open the published item (OJS 17, OMP 5, OPS 2), "Unpublish", "Categories":
//        "Anthropology", "Save", publish again
//   7    log out; the category "Anthropology" (its one item, the count, the paging line)
//   8    its page 2 typed: ?categoryPage=2 (on 3.5 the page links' form, /category/anthropology/2,
//        and ?categoryPage=2 for the record)
//   c    controls: OJS's issue archive past its last page, OPS's section page past its last page
// WALK=neighbour runs alone (fix in and out):
//   n1-n3  signed out, the empty "Sociology": its address, ?categoryPage=1, ?categoryPage=2
//   n4     search results past their end (the same paginator, which the fix leaves alone)
//   n5     the 3.5-style address /category/sociology/2 on main
//   OMP and OPS: dbarnes places two items in "Anthropology" (OMP 5 and 14, OPS 2 and 5), rvaca sets
//   "Items per page" to 1; signed out: n9 page 1, n10 page 2 (a real page), n11 typed page 3.
//
// Reset first:  npm run fleet-prep -- --feature issues-h21n --dataset 9 --reset
// Run (main):   PROBE_FEATURE=issues-h21n PROBE_AGENT=h21n node bin/probe.js all shared/playwright/checks/issues/category-page-past-last-not-404/walk.js
// Run (3.5):    PKP_E2E_LINE=stable-3_5_0 npm run fleet-prep -- --feature issues-h21n-3_5 --dataset 9 --reset
//               PKP_E2E_LINE=stable-3_5_0 PROBE_RUN=r35 PROBE_FEATURE=issues-h21n-3_5 PROBE_AGENT=h21n node bin/probe.js all shared/playwright/checks/issues/category-page-past-last-not-404/walk.js
const {forEachApp, launch, signIn, signOut, screen, record, idle, serverLog} = require('../../../probe');
const L = require('./lib.js');

const MODE = process.env.WALK || 'walk';

forEachApp(async (app) => {
    if (!app.dataset) throw new Error('walk.js runs on a dataset fleet (fleet-prep --dataset n --reset)');
    const line = app.line || 'main';
    const old = line !== 'main';
    const CAT = L.stepCategory(app);
    const facts = {app: app.name, line, mode: MODE, steps: {}};
    const fact = (k, v) => {
        facts.steps[k] = v;
        console.log(`[fact] ${app.name} ${k}: ${JSON.stringify(v).slice(0, 1500)}`);
    };
    const log = serverLog(app);
    const from = log.mark();
    const {page, close} = await launch(app);
    const step = async (label, action) => {
        try {
            const out = await action();
            fact(label, out === undefined ? 'done' : out);
        } catch (e) {
            fact(`${label} threw`, String(e.message).split('\n')[0]);
        }
        await idle(page).catch(() => null);
    };
    const place = async (n, sid) => {
        await step(`${n}a open submission ${sid}`, () => L.openWorkflow(page, app, sid));
        await step(`${n}b unpublish`, async () => ({status: await L.unpublish(page)}));
        await step(`${n}c the page holding "Categories"`, () => L.editableCategories(page, app, sid));
        await step(`${n}d Categories: ${CAT.name}, Save`, () => L.placeInCategory(page, CAT));
        await step(`${n}e publish again`, () => L.publish(page));
    };
    const catAddr = L.categoryPath(app, CAT.path);
    try {
        if (MODE === 'walk') {
            await step('1 sign in as dbarnes', () => signIn(page, 'dbarnes'));
            await place('2-6', L.ITEM[app.name]);
            await step('7 log out', () => signOut(page));
            await step(`7 the category "${CAT.name}"`, () => L.visitTitled(page, app, catAddr));
            record('s7-category', await screen(page));
            if (old) {
                await step('8 its page 2, typed in the page links\' form (/2)', () => L.visitTitled(page, app, `${catAddr}/2`));
                record('s8-page2-path', await screen(page));
                await step('8x ?categoryPage=2 (the main form) for the record', () => L.visitTitled(page, app, `${catAddr}?categoryPage=2`));
            } else {
                await step('8 its page 2, typed (?categoryPage=2)', () => L.visitTitled(page, app, `${catAddr}?categoryPage=2`));
                record('s8-page2', await screen(page));
            }
            if (app.name === 'ojs') {
                await step('c the issue archive past its last page', () => L.visitTitled(page, app, `/index.php/${L.CTX}/issue/archive/2`));
            }
            if (app.name === 'ops') {
                await step('c the section page past its last page', () => L.visitTitled(page, app, `/index.php/${L.CTX}/preprints/section/preprints/2`));
            }
        } else if (MODE === 'neighbour') {
            const soc = L.categoryPath(app, 'sociology');
            await step('n1 the empty "Sociology"', () => L.visitTitled(page, app, soc));
            await step('n2 "Sociology" ?categoryPage=1', () => L.visitTitled(page, app, `${soc}?categoryPage=1`));
            await step('n3 "Sociology" ?categoryPage=2', () => L.visitTitled(page, app, `${soc}?categoryPage=2`));
            await step('n4 search results past their end', async () => {
                const out = await L.visitTitled(page, app, `/index.php/${L.CTX}/search/search?query=the&searchPage=9`);
                return {status: out.status, title: out.title, mainText: L.flat(out.mainText, 400)};
            });
            await step('n5 the 3.5-style address /category/sociology/2', () => L.visitTitled(page, app, `${soc}/2`));
            if (app.name !== 'ojs') {
                await step('n6 sign in as dbarnes', () => signIn(page, 'dbarnes'));
                await place('n7', L.ITEM[app.name]);
                await place('n7s', L.SECOND[app.name]);
                await step('n7z log out', () => signOut(page));
                await step('n8 rvaca: "Items per page" 1, Save', async () => {
                    await signIn(page, 'rvaca');
                    const out = await L.setItemsPerPage(page, app, 1);
                    await signOut(page);
                    return out;
                });
                await step('n9 "Anthropology" page 1', () => L.visitTitled(page, app, catAddr));
                record('n9-page1', await screen(page));
                await step('n10 its page 2 (a real page)', async () => {
                    const next = page.locator('.cmp_pagination a.next').first();
                    if (await next.isVisible().catch(() => false)) {
                        await next.click({timeout: L.T});
                        await page.waitForLoadState('domcontentloaded');
                        return {via: 'Next', ...(await L.visitTitled(page, app, L.rel(page.url())))};
                    }
                    return {via: 'typed', ...(await L.visitTitled(page, app, `${catAddr}?categoryPage=2`))};
                });
                record('n10-page2', await screen(page));
                await step('n11 its page 3, typed (past the last)', () => L.visitTitled(page, app, `${catAddr}?categoryPage=3`));
                record('n11-page3', await screen(page));
            }
        }
    } finally {
        fact('server log since start', log.since(from));
        record(`facts-${MODE}`, facts);
        await close();
    }
});
