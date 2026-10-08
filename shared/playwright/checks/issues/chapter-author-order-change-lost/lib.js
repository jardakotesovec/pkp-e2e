// Helpers for the U72 chapter-list walks (A7 here; A6's walk went with its report when
// pkp-e2e#415 closed). Requiring this file runs nothing.
// The "Chapters" list of OMP is a legacy category grid: a chapter is a `tbody.category_grid_body`,
// its first `tr` the chapter row, then one `tr` per chapter author.
const path = require('path');
const {idle, screen, record, shot, sql} = require('../../../probe');

const ROOT = path.resolve(__dirname, '../../../../..');
const omp = (file) => require(path.join(ROOT, 'apps/omp/playwright/pages', file));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function snap(page, name) {
    record(name, await screen(page));
    await shot(page, name).catch(() => {});
}

/** Open the book's "Chapters" (main: the side menu's "Chapters"; 3.5: "Publication" › "Chapters"). */
async function openChapters(page, app, subId) {
    const {WorkflowPage} = require(path.join(ROOT, 'shared/playwright/pages/WorkflowPage.js'));
    const {ChapterList} = omp('ChapterPages.js');
    const frame = new WorkflowPage(page, app.contextPath);
    if (app.line === 'stable-3_5_0') {
        await frame.gotoEditorial(subId, {menuKey: 'publication_chapters'});
    } else {
        await frame.gotoEditorial(subId);
        await frame.selectPage('Chapters');
    }
    const list = new ChapterList(page);
    await list.expectLoaded();
    await idle(page);
    return list;
}

/** The list as the DOM holds it: each chapter block with its title, its row classes and its authors in order. */
async function blocks(list) {
    return list.grid().evaluate((root) =>
        [...root.querySelectorAll('tbody.category_grid_body')].map((tb) => {
            const rows = [...tb.querySelectorAll(':scope > tr.gridRow')].filter((tr) => tr.getClientRects().length);
            const text = (tr) => ((tr.querySelector('td .gridCellContainer') || {}).innerText || '').replace(/\s+/g, ' ').trim();
            const first = rows.find((tr) => tr.id && tr.id.match(/-category-(\d+)-row-\1$/));
            return {
                chapter: first ? text(first) : null,
                chapterRowClass: first ? first.className : null,
                rows: rows.map((tr) => (tr === first ? `# ${text(tr)}` : text(tr))),
            };
        })
    );
}

/** The chapter titles, top to bottom as drawn. */
async function chapterOrder(list) {
    return (await blocks(list)).map((b) => b.chapter);
}

/** One chapter's authors, top to bottom as drawn. */
async function authorOrder(list, title) {
    const b = (await blocks(list)).find((x) => x.chapter === title);
    return b ? b.rows.filter((r) => !r.startsWith('# ')) : null;
}

/** What the database holds for the book's current version: chapter seq, and each chapter author link's seq beside the author's place on the Contributors list. */
function stored(app, subId) {
    return sql(
        app,
        `select c.chapter_id, c.seq,
            (select string_agg(ca.author_id || ':' || ca.seq || '/a' || a.seq, ',' order by ca.seq, ca.author_id)
               from submission_chapter_authors ca join authors a on a.author_id = ca.author_id where ca.chapter_id = c.chapter_id)
         from submissions s join submission_chapters c on c.publication_id = s.current_publication_id
         where s.submission_id = ${subId} order by c.seq`
    ).split('\n');
}

/** The id of the book's chapter with this title (the current version's). */
function chapterId(app, subId, title) {
    return Number(
        sql(
            app,
            `select c.chapter_id from submissions s join submission_chapters c on c.publication_id = s.current_publication_id
               join submission_chapter_settings cs on cs.chapter_id = c.chapter_id and cs.setting_name = 'title'
             where s.submission_id = ${subId} and cs.setting_value = '${title.replace(/'/g, "''")}' limit 1`
        )
    );
}

/**
 * How the database answers the chapter list's query for one chapter (Chapter::getAuthors():
 * APP\author\Collector with filterByChapterId() and filterByPublicationIds(), the joins below,
 * ordered by the link's seq alone). All reads:
 *   returned   `author_id:seq` in the order the query returns them, under the plan the database picks;
 *   noSeqScan  the same under another plan (`set local enable_seqscan = off` inside a
 *              transaction), to show whether the order of two authors at one seq is the plan's;
 *   plan       the scans and joins of the plan the database picks;
 *   analyzed   when the two tables' statistics were last gathered.
 */
function chapterAuthorQuery(app, chapterId) {
    const publicationId = sql(app, `select publication_id from submission_chapters where chapter_id = ${chapterId}`);
    const from = `from authors a join publications p on a.publication_id = p.publication_id
        join submissions s on p.submission_id = s.submission_id
        join submission_chapter_authors sca on a.author_id = sca.author_id and sca.chapter_id = ${chapterId}
        where a.publication_id in (${publicationId})
        order by sca.seq`;
    const rows = (text) => text.split('\n').filter((l) => /^\d+:/.test(l)).join(',');
    const plan = sql(app, `explain (costs off) select a.*, s.locale as submission_locale ${from}`)
        .split('\n')
        .map((l) => l.replace(/^[\s>-]+/, '').trim())
        .filter((l) => /Scan|Join|Loop/.test(l));
    return {
        returned: rows(sql(app, `select a.author_id || ':' || sca.seq ${from}`)),
        noSeqScan: rows(sql(app, `begin; set local enable_seqscan = off; select a.author_id || ':' || sca.seq ${from}; commit`)),
        plan: plan.join(' < '),
        analyzed: sql(app, `select string_agg(relname || ' ' || coalesce(to_char(greatest(last_analyze, last_autoanalyze), 'HH24:MI:SS'), 'never'), ', ' order by relname) from pg_stat_user_tables where relname in ('authors', 'submission_chapter_authors')`),
    };
}

/**
 * Grow the `authors` table by SQL, then gather its statistics as autovacuum would: `rows` more
 * contributors on submission 1's first version, a book no walk opens. Nothing a screen stores
 * is changed; the table's size is, and with it the plan the database picks for the chapter
 * list's query. A diagnostic, never a step: the walk that uses it says so.
 */
function padAuthors(app, rows) {
    const publicationId = sql(app, 'select min(publication_id) from publications where submission_id = 1');
    sql(
        app,
        `insert into authors (email, include_in_browse, publication_id, seq, contributor_type)
           select 'pad' || g || '@mailinator.com', 0, ${publicationId}, 1000 + g, 'PERSON' from generate_series(1, ${rows}) g;
         analyze authors; analyze submission_chapter_authors`
    );
    return {rows, authors: Number(sql(app, 'select count(*) from authors'))};
}

/** Collect the `data` the browser posts with "Done" (save-sequence), decoded. */
function watchSaveSequence(page) {
    const posts = [];
    page.on('request', (req) => {
        if (/save-sequence/i.test(req.url()) && req.method() === 'POST') {
            const data = new URLSearchParams(req.postData() || '').get('data');
            try {
                posts.push(data ? JSON.parse(data) : null);
            } catch (e) {
                posts.push(data);
            }
        }
    });
    return posts;
}

/** Press "Done"; returns the save-sequence status and the answer's opening, never throws. */
async function done(list) {
    const page = list.page;
    const saved = page.waitForResponse((r) => /save-sequence/i.test(r.url()) && r.request().method() === 'POST', {timeout: 20_000}).catch(() => null);
    await list.doneLink().click();
    const r = await saved;
    await idle(page);
    await sleep(800);
    return {status: r ? r.status() : null, body: r ? ((await r.text().catch(() => '')) || '').slice(0, 160) : null};
}

/** Drag an author row above another author row of the same chapter (the page object's drag). */
async function dragAuthor(list, title, name, aboveName) {
    await list.dragAuthorAbove(title, name, aboveName);
    await idle(list.page);
    await sleep(500);
    return authorOrder(list, title);
}

/**
 * Drag a chapter row by its title cell up above another chapter's block, as a person would:
 * press on the title, move a little, then to the top edge of the target block, release.
 */
async function dragChapterAbove(list, title, aboveTitle) {
    const page = list.page;
    const cell = list.chapterRow(title).locator('td').first();
    const target = list.chapterBlock(aboveTitle);
    await cell.scrollIntoViewIfNeeded();
    const a = await cell.boundingBox();
    const b = await target.boundingBox();
    if (!a || !b) return {noBox: true};
    const x = a.x + Math.min(a.width / 2, 200);
    await page.mouse.move(x, a.y + a.height / 2);
    await page.mouse.down();
    await page.mouse.move(x, a.y + a.height / 2 - 5, {steps: 5});
    await page.mouse.move(x, b.y + 3, {steps: 30});
    await sleep(400);
    const during = await blocks(list);
    await page.mouse.up();
    await idle(page);
    await sleep(600);
    return {during: during.map((x) => x.rows)};
}

module.exports = {sleep, snap, openChapters, blocks, chapterOrder, authorOrder, stored, chapterId, chapterAuthorQuery, padAuthors, watchSaveSequence, done, dragAuthor, dragChapterAbove};
