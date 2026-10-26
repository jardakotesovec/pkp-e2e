// PR review of pkp/omp#2523 (main), #2522 (stable-3_5_0) and #2521 (stable-3_4_0), issue
// pkp/pkp-lib#10570: "Create New Version" gave the new version's chapter authors their place on
// the book's Contributors list instead of their place in the chapter, and the native export wrote
// that same Contributors-list number as each <chapterAuthor seq="…">, which the import then reads
// as the chapter order. With the fix both take the chapter's own order.
// On PKP's default dataset, book 14 (published; contributors Dawson, Dupuis, Wilson in that order,
// Dawson the primary contact). Its chapter "Chapter 2: Classical Music…" holds Dupuis; the walk
// adds Dawson after Dupuis, the state "Edit Chapter" saves when Dawson is ticked on that chapter
// (the window lists the chapter's authors first, ticked, then the others), or a drag under "Order".
// Then, as dbarnes:
//   1. the native export of book 14 (CLI): the <chapterAuthor> seq values of that chapter;
//   2. that export imported back (CLI, as admin, its publication formats removed, which OMP's CLI
//      import cannot take): the imported chapter's author order;
//   3. "Create New Version" (the button's own API call): the new version's copy of the chapter,
//      its authors' order and stored seq/primary_contact.
// VAR=sorted (default) first gives the contributors the places 0, 1, 2, as main's dataset has them
// and as 3.5 and 3.4 have them once the Contributors list is reordered; VAR=ties leaves 3.5's and
// 3.4's dataset as loaded (every contributor at 0) and sets main the same way.
// Run on a fresh dataset fleet per variant (it changes book 14 and adds a book):
//   npm run fleet-prep -- --feature pr-10570 --dataset --reset --apps omp
//   PROBE_FEATURE=pr-10570 PROBE_AGENT=w PROBE_RUN=<base|head>-sorted node bin/probe.js omp shared/playwright/checks/sync/pkp-lib-10570/walk.js
//   (PKP_E2E_LINE=stable-3_5_0 / stable-3_4_0 and their own --feature in front for the lines)
// 2026-10-23 (round 1, each PR head on its base) and 2026-10-26 (round 2, each line's tip with the
// PR merged: #2523 93c01ade7b, #2522 efd0156176, #2521 62a58b8fc8), both variants on main, 3.5, 3.4:
// every base verdict false (the Contributors order, the primary contact flagged), every head true;
// round 2's copies carry no primary_contact flag (round 1 copied the old chapter row's).
const fs = require('fs');
const path = require('path');
const {execFileSync} = require('child_process');
const {forEachApp, launch, signIn, record, idle, sql, outFile} = require('../../../probe');

const SUBMISSION = 14;
const CHAPTER_TITLE = 'Chapter 2: Classical Music and the Classical Mind';
const VAR = process.env.VAR || 'sorted';

const nameOf = (app, id) => sql(app, `select setting_value from author_settings where author_id = ${id} and setting_name = 'familyName' order by locale limit 1`);
const chapterRows = (app, chapterId) => sql(app, `select sca.author_id, sca.seq, sca.primary_contact, a.seq from submission_chapter_authors sca join authors a on a.author_id = sca.author_id where sca.chapter_id = ${chapterId} order by sca.seq, sca.author_id`)
    .split('\n').filter(Boolean).map((l) => {
        const [authorId, seq, primary, pubSeq] = l.split('|');
        return {author: nameOf(app, authorId), authorId: Number(authorId), chapterSeq: Number(seq), primaryContact: Number(primary), contributorsSeq: Number(pubSeq)};
    });
const chapterOf = (app, publicationId) => Number(sql(app, `select c.chapter_id from submission_chapters c join submission_chapter_settings s on s.chapter_id = c.chapter_id and s.setting_name = 'title' where c.publication_id = ${publicationId} and s.setting_value = '${CHAPTER_TITLE}' limit 1`)) || null;
const cli = (app, args) => {
    try {
        return {ok: true, out: execFileSync('php', ['tools/importExport.php', 'NativeImportExportPlugin', ...args], {cwd: app.root, env: {...process.env, PKP_CONFIG_FILE: app.configFile}, encoding: 'utf8', timeout: 180_000, stdio: ['ignore', 'pipe', 'pipe']}).slice(-1500)};
    } catch (e) {
        return {ok: false, out: String((e.stdout || '') + (e.stderr || '') || e.message).slice(-1500)};
    }
};
// Order as a reader sees it: by stored seq; tied numbers are flagged, since the database then decides.
const reading = (rows) => ({order: rows.map((r) => r.author), tie: new Set(rows.map((r) => r.chapterSeq)).size < rows.length});

forEachApp(async (app) => {
    if (!app.dataset) throw new Error('walk.js runs on a dataset fleet (fleet-prep --dataset --reset)');
    const facts = {app: app.name, line: app.line || 'main', variant: VAR, head: execFileSync('git', ['rev-parse', '--short', 'HEAD'], {cwd: app.root, encoding: 'utf8'}).trim()};
    const fact = (k, v) => { facts[k] = v; console.log(`[fact] ${k}: ${JSON.stringify(v).slice(0, 1500)}`); };

    const publicationId = Number(sql(app, `select current_publication_id from submissions where submission_id = ${SUBMISSION}`));
    const chapterId = chapterOf(app, publicationId);
    const [dawson, dupuis] = ['Dawson', 'Dupuis'].map((n) => Number(sql(app, `select a.author_id from authors a join author_settings s on s.author_id = a.author_id and s.setting_name = 'familyName' where a.publication_id = ${publicationId} and s.setting_value = '${n}' limit 1`)));

    // Setup: the contributors' places, then Dawson added to the chapter after Dupuis.
    if (VAR === 'sorted') {
        sql(app, `update authors set seq = case when author_id = ${dawson} then 0 when author_id = ${dupuis} then 1 else 2 end where publication_id = ${publicationId}`);
    } else {
        sql(app, `update authors set seq = 0 where publication_id = ${publicationId}`);
    }
    sql(app, `delete from submission_chapter_authors where chapter_id = ${chapterId} and author_id = ${dawson}`);
    sql(app, `insert into submission_chapter_authors (author_id, chapter_id, primary_contact, seq) values (${dawson}, ${chapterId}, 0, 1)`);
    fact('setup', {publicationId, chapterId, primaryContactId: Number(sql(app, `select primary_contact_id from publications where publication_id = ${publicationId}`)), chapter: chapterRows(app, chapterId)});
    const expected = chapterRows(app, chapterId).map((r) => r.author);

    // 1. Native export.
    const xmlPath = outFile('book14-export.xml');
    const exp = cli(app, ['export', xmlPath, app.contextPath, 'monograph', String(SUBMISSION)]);
    let exported = null;
    if (fs.existsSync(xmlPath)) {
        const xml = fs.readFileSync(xmlPath, 'utf8');
        const m = xml.match(new RegExp(`<chapter\\b[^>]*>(?:(?!</chapter>)[\\s\\S])*?${CHAPTER_TITLE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?</chapter>`));
        const nodes = m ? [...m[0].matchAll(/<chapterAuthor\b[^>]*author_id="(\d+)"[^>]*seq="(-?\d+)"/g)].map((x) => ({authorId: Number(x[1]), seq: Number(x[2])})) : [];
        // author_id in the file is the database id on export.
        exported = nodes.map((n) => ({author: nameOf(app, n.authorId), seq: n.seq}));
        const bySeq = [...exported].sort((a, b) => a.seq - b.seq);
        fact('export', {ok: exp.ok, nodes: exported, orderBySeq: bySeq.map((n) => n.author), tie: new Set(exported.map((n) => n.seq)).size < exported.length});
    } else {
        fact('export', {ok: false, out: exp.out});
    }

    // 2. Import the export back (formats removed).
    if (fs.existsSync(xmlPath)) {
        const stripped = fs.readFileSync(xmlPath, 'utf8').replace(/<publication_format\b[\s\S]*?<\/publication_format>/g, '');
        const inPath = outFile('book14-import.xml');
        fs.writeFileSync(inPath, stripped);
        const before = Number(sql(app, 'select coalesce(max(submission_id), 0) from submissions'));
        const imp = cli(app, ['import', inPath, app.contextPath, 'admin']);
        const newSub = Number(sql(app, `select coalesce(max(submission_id), 0) from submissions where submission_id > ${before}`)) || null;
        const newPub = newSub ? Number(sql(app, `select publication_id from publications where submission_id = ${newSub} order by publication_id limit 1`)) : null;
        const newChapter = newPub ? chapterOf(app, newPub) : null;
        const rows = newChapter ? chapterRows(app, newChapter) : null;
        fact('import', {ok: imp.ok && !!newChapter, submissionId: newSub, chapterId: newChapter, rows, ...(rows ? reading(rows) : {}), out: newChapter ? undefined : imp.out});
    }

    // 3. "Create New Version", as dbarnes, through the API call the button makes.
    const {page, close} = await launch(app);
    try {
        await signIn(page, 'dbarnes');
        await page.goto(app.url(`/index.php/${app.contextPath}/management/settings/context`));
        await idle(page);
        const res = await page.evaluate(async ({ctx, sid, pid}) => {
            const token = (window.pkp && pkp.currentUser && pkp.currentUser.csrfToken) || ($ && $.pkp && $.pkp.currentUser && $.pkp.currentUser.csrfToken);
            const r = await fetch(`/index.php/${ctx}/api/v1/submissions/${sid}/publications/${pid}/version`, {method: 'POST', headers: {'Content-Type': 'application/json', 'X-Csrf-Token': token}, body: '{}'});
            const text = await r.text();
            let id = null;
            try { id = JSON.parse(text).id; } catch (e) { /* not JSON */ }
            return {status: r.status, id, body: id ? undefined : text.slice(0, 600)};
        }, {ctx: app.contextPath, sid: SUBMISSION, pid: publicationId});
        const newChapter = res.id ? chapterOf(app, res.id) : null;
        const rows = newChapter ? chapterRows(app, newChapter) : null;
        fact('version', {...res, chapterId: newChapter, rows, ...(rows ? reading(rows) : {})});
    } finally {
        await close();
    }

    const v = facts.version || {};
    const sameOrder = (o) => !!o && JSON.stringify(o) === JSON.stringify(expected);
    fact('verdict', {
        expected,
        versionKeepsOrder: sameOrder(v.order) && !v.tie,
        versionPrimaryContactCopied: v.rows ? v.rows.map((r) => `${r.author}:${r.primaryContact}`) : null,
        exportSeqIsChapterOrder: facts.export && facts.export.orderBySeq ? sameOrder(facts.export.orderBySeq) && !facts.export.tie : null,
        importKeepsOrder: facts.import && facts.import.order ? sameOrder(facts.import.order) && !facts.import.tie : null,
    });
    record('pr-10570-facts', facts);
});
