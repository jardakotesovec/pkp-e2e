// PR review of pkp/pkp-lib#13823 (stable-3_5_0) and #13822 (stable-3_4_0), issue pkp/pkp-lib#13821,
// the backport of main's pkp-lib 922f895988 (pkp/pkp-lib#13003): authors sorted by `seq` get
// `author_id` as a tie-break (`Collector::ORDERBY_SEQUENCE`), and getNextSeq() gives the next number
// after a 0 (`if ($seq !== null)`), so contributors added one after another no longer all share 0.
// On PKP's dataset (3.5 and 3.4 load every contributor at seq 0), as dbarnes for the reads:
//   new    — three contributors added through Repo::author()->add() (driver.php) to the first
//            submission's current publication: their stored seq; the first one then edited
//            (an UPDATE, which moves its row on PostgreSQL); the order the publication API answers,
//            three times.
//   legacy — the same publication's contributors all set back to seq 0 (the data a 3.4/3.5 site
//            already holds), its lowest-id contributor edited, the API order read again: with the
//            tie-break the ids decide; without it the database does.
//   version (OMP) — book 14, every contributor at 0 and Dawson edited, then "Create New Version"
//            (the button's API call): each chapter's authors in the old and the new version, by name,
//            since version() pairs old and new contributors by their place in two seq-sorted lists.
// Run on a fresh dataset fleet per side (it adds contributors and a version):
//   PKP_E2E_LINE=stable-3_5_0 npm run fleet-prep -- --feature pr-13821-35 --dataset --reset --apps ojs,omp
//   PKP_E2E_LINE=stable-3_5_0 PROBE_FEATURE=pr-13821-35 PROBE_AGENT=w PROBE_RUN=<base|head> node bin/probe.js all shared/playwright/checks/sync/pkp-lib-13821/walk.js
//   (stable-3_4_0 and its own --feature the same way)
// Reads fixed when: `new.seqs` are three increasing numbers above the publication's others,
// `new.stable` and `legacy.byId` are true, and on OMP `version.chaptersMatch` is true.
// 2026-11-17 (round 1: #13823 a636ee3eaa on 1647346e6f, #13822 d2d715909f on 2dd24cc5ae), OJS and OMP
// on 3.5 and 3.4: every base reads the bug (OMP new seqs 0,0,0 and the edited one last; legacy ties
// in heap order), every head reads fixed; version.chaptersMatch true at both sides.
const path = require('path');
const {execFileSync} = require('child_process');
const {forEachApp, launch, signIn, idle, record, sql} = require('../../../probe');

const driver = (app, ...args) => JSON.parse(execFileSync('php', [path.resolve(__dirname, 'driver.php'), ...args.map(String)], {
    cwd: app.root, env: {...process.env, PKP_CONFIG_FILE: app.configFile}, encoding: 'utf8', timeout: 120_000,
}).trim().split('\n').pop());

forEachApp(async (app) => {
    if (!app.dataset) throw new Error('walk.js runs on a dataset fleet (fleet-prep --dataset --reset)');
    const facts = {app: app.name, line: app.line || 'main', lib: execFileSync('git', ['rev-parse', '--short', 'HEAD'], {cwd: path.join(app.root, 'lib/pkp'), encoding: 'utf8'}).trim()};
    const fact = (k, v) => { facts[k] = v; console.log(`[fact] ${k}: ${JSON.stringify(v).slice(0, 2000)}`); };

    const {page, close} = await launch(app);
    try {
        await signIn(page, 'dbarnes');
        await page.goto(app.url(`/index.php/${app.contextPath}/submissions`));
        await idle(page);
        const apiOrder = async (sid, pid) => {
            const r = await page.evaluate(async ({ctx, sid, pid}) => {
                const res = await fetch(`/index.php/${ctx}/api/v1/submissions/${sid}/publications/${pid}`);
                const body = await res.json().catch(() => null);
                return {status: res.status, authors: body && body.authors ? body.authors.map((a) => ({id: a.id, seq: a.seq})) : null};
            }, {ctx: app.contextPath, sid, pid});
            if (r.status !== 200) throw new Error(`publication API ${r.status}`);
            return r.authors.map((a) => a.id);
        };
        const reads = async (sid, pid) => [await apiOrder(sid, pid), await apiOrder(sid, pid), await apiOrder(sid, pid)];
        const seqs = (pid) => sql(app, `select author_id, seq from authors where publication_id = ${pid} order by author_id`)
            .split('\n').filter(Boolean).map((l) => l.split('|').map(Number));

        // new
        const [sid, pid] = sql(app, `select s.submission_id, s.current_publication_id from submissions s where exists (select 1 from authors a where a.publication_id = s.current_publication_id) order by s.submission_id limit 1`).split('|').map(Number);
        const before = seqs(pid);
        const added = driver(app, 'add', pid, 'One', 'Two', 'Three');
        const ids = added.map((a) => a.id);
        const afterAdd = await apiOrder(sid, pid);
        driver(app, 'edit', ids[0], 'OneEdited');
        const afterEdit = await reads(sid, pid);
        const newPart = (order) => order.filter((id) => ids.includes(id));
        const maxBefore = Math.max(...before.map(([, s]) => s));
        fact('new', {
            submissionId: sid, publicationId: pid, before, added,
            seqs: added.map((a) => a.seq),
            afterAdd: newPart(afterAdd), afterEdit: afterEdit.map(newPart),
            increasing: added.every((a, i) => a.seq > maxBefore && (i === 0 || a.seq > added[i - 1].seq)),
            stable: afterEdit.every((o) => JSON.stringify(newPart(o)) === JSON.stringify(ids)),
        });

        // legacy
        sql(app, `update authors set seq = 0 where publication_id = ${pid}`);
        const all = seqs(pid).map(([id]) => id);
        driver(app, 'edit', all[0], 'LowestEdited');
        const legacy = await reads(sid, pid);
        fact('legacy', {ids: all, reads: legacy, byId: legacy.every((o) => JSON.stringify(o) === JSON.stringify(all))});

        // version (OMP)
        if (app.name === 'omp') {
            const bsid = 14;
            const bpid = Number(sql(app, `select current_publication_id from submissions where submission_id = ${bsid}`));
            sql(app, `update authors set seq = 0 where publication_id = ${bpid}`);
            const dawson = Number(sql(app, `select a.author_id from authors a join author_settings s on s.author_id = a.author_id and s.setting_name = 'familyName' where a.publication_id = ${bpid} and s.setting_value = 'Dawson' limit 1`));
            driver(app, 'edit', dawson, 'Edited');
            const chapters = (p) => sql(app, `select c.seq, string_agg(fs.setting_value, ',' order by fs.setting_value) from submission_chapters c left join submission_chapter_authors ca on ca.chapter_id = c.chapter_id left join author_settings fs on fs.author_id = ca.author_id and fs.setting_name = 'familyName' and fs.locale = 'en' where c.publication_id = ${p} group by c.chapter_id, c.seq order by c.seq, c.chapter_id`)
                .split('\n').filter(Boolean);
            const old = chapters(bpid);
            const res = await page.evaluate(async ({ctx, sid, pid}) => {
                const token = (window.pkp && pkp.currentUser && pkp.currentUser.csrfToken) || ($ && $.pkp && $.pkp.currentUser && $.pkp.currentUser.csrfToken);
                const r = await fetch(`/index.php/${ctx}/api/v1/submissions/${sid}/publications/${pid}/version`, {method: 'POST', headers: {'Content-Type': 'application/json', 'X-Csrf-Token': token}, body: '{}'});
                const text = await r.text();
                let id = null;
                try { id = JSON.parse(text).id; } catch (e) { /* not JSON */ }
                return {status: r.status, id, body: id ? undefined : text.slice(0, 600)};
            }, {ctx: app.contextPath, sid: bsid, pid: bpid});
            const copy = res.id ? chapters(res.id) : null;
            fact('version', {...res, contributorsOrder: await apiOrder(bsid, bpid), oldChapters: old, newChapters: copy, newSeqs: res.id ? seqs(res.id) : null, chaptersMatch: !!copy && JSON.stringify(old) === JSON.stringify(copy)});
        }
    } finally {
        await close();
    }
    record('pr-13821-facts', facts);
});
