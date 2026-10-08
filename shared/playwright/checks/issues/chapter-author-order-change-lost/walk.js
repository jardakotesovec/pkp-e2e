// Issue report docs/issues/U72-A7-chapter-author-order-change-lost.md (U72 A7): "Done" on a book's
// chapter list leaves a chapter author's stored place alone when their new place in the chapter,
// counted from 1, equals their place on the book's contributor list counted from 0. The list then
// redraws in the old order, or the skipped author shares a stored place with another author and
// the list reads the two in the database's order. Each mode runs on PKP's default test dataset
// (OMP), press `publicknowledge`, freshly loaded, as `dbarnes`, and reads the list and what the
// database stores at each step (submission_chapter_authors.seq beside the author's place on the
// contributor list, authors.seq).
// No argument (the report's first group of Steps): submission 12 "Connecting ICTs to
// Development", chapter "Catalyzing Access through Social and Technical Innovation" (Frank Tulus,
// then Raymond Hyma; the book's 3rd and 4th contributors):
//   1-2  dbarnes opens the book's "Chapters" (3.5: "Publication" › "Chapters")
//   3-5  "Order", Raymond Hyma dragged above Frank Tulus, "Done"
//   6    reload, "Chapters" again
// `west` (the first group on 3.5, whose dataset lists book 12's contributors all at place 0):
// submission 2 "The West and Beyond: …", "Add Chapter" "u72a Chapter" with Peter Fortna and
// Gerald Friesen (the 3rd and 4th contributors) ticked, "Save"; then "Order", Gerald Friesen
// dragged above Peter Fortna, "Done", reload.
// `twice` (the second group): a drag the save keeps, then the drag back, which it skips. Main:
// submission 17 "Open Development: …", chapter "Introduction" (Matthew Smith, Katherine Reilly,
// the 1st and 3rd contributors): Reilly dragged above Smith and "Done", then Smith dragged above
// Reilly and "Done", reload. 3.5 (book 17's contributors are all at place 0 there): submission
// 2, "Add Chapter" "u72b Chapter" with Alvin Finkel and Peter Fortna (the 1st and 3rd
// contributors), then Fortna above Finkel and "Done", Finkel above Fortna and "Done", reload.
// `chapter` (main): a "Done" that moves only a chapter. Submission 17: "Order", the chapter
// "Introduction" dragged above "Preface", "Done", reload; "Order", "Preface" dragged above
// "Introduction", "Done", reload. Each read also records how the database answers the list's
// query for the two chapters that hold Smith and Reilly (lib.js chapterAuthorQuery(): the order
// returned under the plan it picks and under another plan, both reads); `twice` records the
// same after its second "Done". Further arguments: `first` stops after the first reload and
// `second` takes the rest on the book as `first` left it (a fix applied between the two shows
// what its first "Done" does to authors already stored at one place); `pad` adds 5000 rows to
// `authors` by SQL after the first reload (lib.js padAuthors(): contributors of submission 1,
// the size of a press with a few hundred books), so that the database plans the list's query
// as on a larger install, and reads the list again before going on; `analyze` runs ANALYZE on
// authors and submission_chapter_authors at the end (what autovacuum does by itself) and
// reads once more.
// `edit`: the way round through "Edit Chapter" on the first group's chapter: the title opens
// "Edit Chapter", "Frank Tulus" unticked, "Save"; the window opened again, "Frank Tulus"
// ticked, "Save"; the list read, then after a reload. With `done` as a further argument:
// then "Order" and "Done" with nothing dragged, the list read, and again after a reload.
// Neighbour (`neighbour`; fix in and out): on submission 12, Khaled Fourati dragged above John
// Valk under "Catalyzing Access via Telecommunications Policy", "Done", reload: kept, with the
// other chapters' author orders and the book's contributor order unchanged.
// Reset first: npm run fleet-prep -- --feature <feature> --dataset <n> --apps omp --reset
// Run: PROBE_FEATURE=<feature> PROBE_AGENT=<id> node bin/probe.js omp shared/playwright/checks/issues/chapter-author-order-change-lost/walk.js [west|twice|chapter [first|second|pad] [analyze]|edit [done]|neighbour]
//      (PKP_E2E_LINE=stable-3_5_0 PROBE_RUN=r35 in front for 3.5)
const {forEachApp, launch, signIn, record, sql} = require('../../../probe');
const L = require('./lib');

const MODE = ['neighbour', 'twice', 'west', 'edit', 'chapter'].find((m) => process.argv.includes(m)) || 'steps';
const ANALYZE = process.argv.includes('analyze');
const [FIRST, SECOND, PAD, THEN_DONE] = ['first', 'second', 'pad', 'done'].map((a) => process.argv.includes(a));
const PAD_ROWS = 5000;
const WEST = 'u72a Chapter';
const WEST2 = 'u72b Chapter';
// Book 17's two chapters that hold Matthew Smith and Katherine Reilly, by the dataset's ids.
const SMITH_REILLY = {Introduction: 67, 'The Emergence of Open Development in a Network Society': 68};
const CH1 = 'Catalyzing Access through Social and Technical Innovation';
const CH2 = 'Catalyzing Access via Telecommunications Policy';

forEachApp(async (app) => {
    if (app.name !== 'omp') return; // chapters are a press's
    if (!app.dataset) throw new Error('walk.js runs on a dataset fleet');
    const OLD = app.line === 'stable-3_5_0';
    const BOOK = MODE === 'west' || (MODE === 'twice' && OLD) ? 2 : MODE === 'twice' || MODE === 'chapter' ? 17 : 12;
    // `twice`: the chapter, the author the first drag moves up, and the one it passes.
    const TW = OLD ? {chapter: WEST2, up: 'Peter Fortna', first: 'Alvin Finkel'} : {chapter: 'Introduction', up: 'Katherine Reilly', first: 'Matthew Smith'};
    const facts = {line: app.line || 'main', mode: MODE, book: BOOK};
    const fact = (k, v) => {
        facts[k] = v;
        console.log(`[fact] ${k}: ${JSON.stringify(v).slice(0, 1500)}`);
    };
    const contributors = () =>
        sql(app, `select string_agg(a.author_id::text, ',' order by a.seq, a.author_id) from submissions s join authors a on a.publication_id = s.current_publication_id where s.submission_id = ${BOOK}`);
    const authorsOf = async (list) => (await L.blocks(list)).map((b) => `${b.chapter}: ${b.rows.filter((r) => !r.startsWith('# ')).join(', ')}`);
    const {page, close} = await launch(app);
    try {
        const posts = L.watchSaveSequence(page);
        fact('storedBefore', L.stored(app, BOOK));
        fact('contributorsBefore', contributors());
        // Steps 1-2.
        await signIn(page, 'dbarnes');
        let list = await L.openChapters(page, app, BOOK);
        fact('step2', await authorsOf(list));
        await L.snap(page, `${MODE}-step2-chapters`);
        if (MODE === 'west' || (MODE === 'twice' && OLD)) {
            await list.addChapter(MODE === 'west' ? {title: WEST, authors: ['Peter Fortna', 'Gerald Friesen']} : {title: WEST2, authors: [TW.first, TW.up]});
            await L.sleep(800);
            fact('w-added', await authorsOf(list));
            fact('w-storedAdded', L.stored(app, BOOK));
        }
        if (MODE === 'chapter') {
            // What the list shows of the two chapters, what is stored, and how the database answers the list's query.
            const read = async (label) => {
                fact(`c-${label}-chapters`, await L.chapterOrder(list));
                for (const [title, id] of Object.entries(SMITH_REILLY)) {
                    fact(`c-${label}-${id}-list`, await L.authorOrder(list, title));
                    fact(`c-${label}-${id}-query`, L.chapterAuthorQuery(app, id));
                }
                fact(`c-${label}-stored`, L.stored(app, BOOK));
                await L.snap(page, `chapter-${label}`);
            };
            if (!SECOND) {
                await read('1-before');
                await list.startOrdering();
                await L.dragChapterAbove(list, 'Introduction', 'Preface');
                fact('c-done1', await L.done(list));
                await read('2-done1');
                list = await L.openChapters(page, app, BOOK);
                await read('3-reload1');
            }
            if (PAD) {
                fact('c-pad', L.padAuthors(app, PAD_ROWS));
                list = await L.openChapters(page, app, BOOK);
                await read('3p-padded');
            }
            if (!FIRST) {
                if (SECOND) await read('3s-before-second');
                await list.startOrdering();
                await L.dragChapterAbove(list, 'Preface', 'Introduction');
                fact('c-done2', await L.done(list));
                await read('4-done2');
                list = await L.openChapters(page, app, BOOK);
                await read('5-reload2');
            }
            if (ANALYZE) {
                fact('c-analyze', sql(app, 'analyze authors; analyze submission_chapter_authors; select 1'));
                list = await L.openChapters(page, app, BOOK);
                await read('6-analyzed');
            }
        }
        if (MODE === 'chapter') {
            // walked above
        } else if (MODE === 'edit') {
            const editOnce = async (tick, label) => {
                const win = await list.openEdit(CH1);
                fact(`e-${label}-boxesBefore`, await win.boxStates('contributors'));
                const box = win.contributorBox('Frank Tulus');
                if (tick) await box.check();
                else await box.uncheck();
                await win.save();
                await L.sleep(800);
                fact(`e-${label}-after`, await authorsOf(list));
                fact(`e-${label}-stored`, L.stored(app, BOOK));
                await L.snap(page, `edit-${label}`);
            };
            await editOnce(false, 'untick');
            await editOnce(true, 'tick');
        } else {
            await list.startOrdering();
        }
        if (MODE === 'edit' || MODE === 'chapter') {
            // nothing more before the reload
        } else if (MODE === 'steps') {
            // Steps 3-4.
            fact('step3-dragged', await L.dragAuthor(list, CH1, 'Raymond Hyma', 'Frank Tulus'));
            await L.snap(page, 'steps-step3-dragged');
            fact('step4-done', await L.done(list));
            fact('step4-afterDone', await authorsOf(list));
            await L.snap(page, 'steps-step4-done');
        } else if (MODE === 'west') {
            fact('w-dragged', await L.dragAuthor(list, WEST, 'Gerald Friesen', 'Peter Fortna'));
            fact('w-done', await L.done(list));
            fact('w-afterDone', await authorsOf(list));
            await L.snap(page, 'west-done');
        } else if (MODE === 'neighbour') {
            fact('n-dragged', await L.dragAuthor(list, CH2, 'Khaled Fourati', 'John Valk'));
            fact('n-done', await L.done(list));
            fact('n-afterDone', await authorsOf(list));
            await L.snap(page, 'neighbour-done');
        } else {
            fact('t-dragged1', await L.dragAuthor(list, TW.chapter, TW.up, TW.first));
            fact('t-done1', await L.done(list));
            fact('t-afterDone1', await authorsOf(list));
            fact('t-stored1', L.stored(app, BOOK));
            await L.snap(page, 'twice-done1');
            await list.startOrdering();
            fact('t-dragged2', await L.dragAuthor(list, TW.chapter, TW.first, TW.up));
            fact('t-done2', await L.done(list));
            fact('t-afterDone2', await authorsOf(list));
            fact('t-query2', L.chapterAuthorQuery(app, L.chapterId(app, BOOK, TW.chapter)));
            await L.snap(page, 'twice-done2');
        }
        fact('storedAfterDone', L.stored(app, BOOK));
        // Step 5.
        list = await L.openChapters(page, app, BOOK);
        fact('step5-afterReload', await authorsOf(list));
        await L.snap(page, `${MODE}-step5-reloaded`);
        fact('contributorsAfter', contributors());
        if (MODE === 'edit' && THEN_DONE) {
            // Does the way round last? The next "Done" on the book, nothing dragged.
            await list.startOrdering();
            fact('e-done', await L.done(list));
            fact('e-afterDone', await authorsOf(list));
            fact('e-storedAfterDone', L.stored(app, BOOK));
            fact('e-query', L.chapterAuthorQuery(app, L.chapterId(app, BOOK, CH1)));
            await L.snap(page, 'edit-then-done');
            list = await L.openChapters(page, app, BOOK);
            fact('e-afterDoneReload', await authorsOf(list));
        }
        fact('posted', posts);
    } finally {
        record(`${MODE}-facts`, facts);
        await close();
    }
});
