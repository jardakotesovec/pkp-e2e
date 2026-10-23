// Issue report docs/issues/U72-A14-cancel-ordering-hides-no-items-line.md (U72 A14): "Cancel
// ordering" on a book's chapter list takes away the "No Items" line of a chapter with no authors
// that was not itself dragged, until the page is loaded again.
// Runs on PKP's default test dataset (OMP), press `publicknowledge`, freshly loaded, as `dbarnes`.
// No argument (the report's Steps), submission 3 "The Political Economy of Workplace Injury in
// Canada":
//   1-3  dbarnes opens the book's "Chapters" (3.5: "Publication" › "Chapters")
//   4    "Add Chapter", Title "Appendix hkq23f", no contributor ticked, "Save" (read)
//   5-6  "Order", "Cancel ordering" (read)
//   7    the Chapters page opened again (read)
//   8-10 "Order", the last dataset chapter dragged above "Introduction" (read), "Cancel ordering" (read)
// `neighbour` (fix in and out; runs alone): submission 3, "Add Chapter" "Appendix hkq23f" as
// above, "Order", "Appendix hkq23f" itself dragged above "Introduction", read, "Cancel ordering",
// read; then submission 12 "Connecting ICTs to Development", "Order", Raymond Hyma dragged above
// Frank Tulus under "Catalyzing Access through Social and Technical Innovation", read, "Cancel
// ordering", read.
// Each read records the list top to bottom and, per visible "No Items" line, the chapter it
// belongs to and the chapter whose rows it stands under. Nothing throws on a state a fix brings:
// each step is recorded.
// Reset first: npm run fleet-prep -- --feature <feature> --dataset <n> --apps omp --reset
// Run: PROBE_FEATURE=<feature> PROBE_AGENT=<id> node bin/probe.js omp shared/playwright/checks/issues/cancel-ordering-hides-no-items-line/walk.js [neighbour]
//      (PKP_E2E_LINE=stable-3_5_0 PROBE_RUN=r35 in front for 3.5)
const {forEachApp, launch, signIn, record} = require('../../../probe');
const L = require('./lib');

const MODE = process.argv.includes('neighbour') ? 'neighbour' : 'steps';
const EMPTY = 'Appendix hkq23f';
const CH1 = 'Catalyzing Access through Social and Technical Innovation';

forEachApp(async (app) => {
    if (app.name !== 'omp') return; // chapters are a press's
    if (!app.dataset) throw new Error('walk.js runs on a dataset fleet');
    const facts = {line: app.line || 'main', mode: MODE};
    const fact = (k, v) => {
        facts[k] = v;
        console.log(`[fact] ${k}: ${JSON.stringify(v).slice(0, 1500)}`);
    };
    const step = async (k, fn) => {
        try {
            return await fn();
        } catch (e) {
            fact(`${k}.FAILED`, String(e.message || e).slice(0, 600));
            return null;
        }
    };
    const {page, close} = await launch(app);
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(String(e.message).slice(0, 300)));
    const requests = [];
    page.on('request', (r) => {
        if (/\$\$\$call\$\$\$|\/api\//.test(r.url())) requests.push(`${r.method()} ${r.url().replace(/^.*index\.php/, '')}`);
    });
    const mark = () => requests.length;
    const sent = (from) => requests.slice(from);
    const tagName = MODE === 'steps' ? 'walk' : 'nb';
    try {
        await signIn(page, 'dbarnes');
        let list = await L.openChapters(page, app, 3);
        fact('s3-chapters', await L.layout(list));
        await L.snap(page, `${tagName}-s3-chapters`);
        await step('s4-add', () => list.addChapter({title: EMPTY}));
        await L.sleep(800);
        const added = await L.layout(list);
        fact('s4-added', added);
        await L.snap(page, `${tagName}-s4-added`);
        const titles = added.lines.filter((l) => l.startsWith('# ')).map((l) => l.slice(2));
        const first = titles[0];
        const lastDataset = titles.filter((t) => t !== EMPTY).slice(-1)[0];
        fact('titles', {first, lastDataset});
        if (MODE === 'steps') {
            await step('s5-order', () => list.startOrdering());
            fact('s5-ordering', await L.layout(list));
            let from = mark();
            fact('s6-cancel', await step('s6-cancel', () => L.cancel(list)));
            fact('s6-requests', sent(from));
            fact('s6-after-cancel', await L.layout(list));
            await L.snap(page, 'walk-s6-after-cancel');
            list = await L.openChapters(page, app, 3);
            fact('s7-reopened', await L.layout(list));
            await L.snap(page, 'walk-s7-reopened');
            await step('s8-order', () => list.startOrdering());
            fact('s9-drag', await step('s9-drag', () => L.dragChapterAbove(list, lastDataset, first)));
            fact('s9-after-drag', await L.layout(list));
            await L.snap(page, 'walk-s9-after-drag');
            from = mark();
            fact('s10-cancel', await step('s10-cancel', () => L.cancel(list)));
            fact('s10-requests', sent(from));
            fact('s10-after-cancel', await L.layout(list));
            await L.snap(page, 'walk-s10-after-cancel');
        } else {
            await step('nb1-order', () => list.startOrdering());
            fact('nb1-drag', await step('nb1-drag', () => L.dragChapterAbove(list, EMPTY, first)));
            fact('nb1-after-drag', await L.layout(list));
            await L.snap(page, 'nb-1-after-drag');
            fact('nb1-cancel', await step('nb1-cancel', () => L.cancel(list)));
            fact('nb1-after-cancel', await L.layout(list));
            await L.snap(page, 'nb-1-after-cancel');
            list = await L.openChapters(page, app, 12);
            fact('nb2-before', await L.layout(list));
            await step('nb2-order', () => list.startOrdering());
            await step('nb2-drag', () => list.dragAuthorAbove(CH1, 'Raymond Hyma', 'Frank Tulus'));
            await L.sleep(800);
            fact('nb2-after-drag', await L.layout(list));
            await L.snap(page, 'nb-2-after-drag');
            fact('nb2-cancel', await step('nb2-cancel', () => L.cancel(list)));
            fact('nb2-after-cancel', await L.layout(list));
            await L.snap(page, 'nb-2-after-cancel');
        }
    } finally {
        fact('pageErrors', pageErrors);
        record(`${tagName}-facts`, facts);
        await close();
    }
});
