#!/usr/bin/env node
/**
 * @file bin/line-range.js
 *
 * List a stable line's commits since a baseline and say how each relates to
 * `main` (MAINTENANCE.md "The stable line"):
 *
 *   node bin/line-range.js --line stable-3_5_0 --repo ojs|omp|ops|pkp-lib|ui-library <baseline> [--app ojs]
 *
 *   =main <sha>       the same patch is on main (git patch-id): the main read's verdict carries over
 *   ~main <sha,…>     main has commits with the same subject or issue number, the patch differs: an adapted backport,
 *                     read the difference (git range-diff <main>^! <stable>^!)
 *   stable-only       no counterpart on main: a full read
 *   pointer bump      the commit moves submodule pointers only: its content is the submodule's own range
 *
 * pkp-lib and ui-library are read inside one app's line checkout (--app,
 * default ojs); the range ends at that checkout's pointer. Fetches `main`
 * first; never moves a tree.
 */
const path = require('path');
const {execFileSync} = require('child_process');
const {APPS, REPO_ROOT, resolveLine} = require('./apps.js');

const SUBMODULES = {'pkp-lib': 'lib/pkp', 'ui-library': 'lib/ui-library'};
const MAIN_WINDOW = '9 months ago'; // how far back on main a counterpart is looked for

const args = process.argv.slice(2);
const opt = {line: process.env.PKP_E2E_LINE, repo: null, app: 'ojs', baseline: null};
for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--line') opt.line = args[++i];
    else if (a === '--repo') opt.repo = args[++i];
    else if (a === '--app') opt.app = args[++i];
    else opt.baseline = a;
}
const line = resolveLine(opt.line);
if (!line || !opt.baseline || !(APPS[opt.repo] || SUBMODULES[opt.repo])) {
    console.error('usage: node bin/line-range.js --line <line> --repo ojs|omp|ops|pkp-lib|ui-library <baseline> [--app ojs]');
    process.exit(1);
}

const appDir = path.join(REPO_ROOT, 'checkouts', line.name, APPS[opt.repo] ? opt.repo : opt.app);
const dir = APPS[opt.repo] ? appDir : path.join(appDir, SUBMODULES[opt.repo]);
const remote = APPS[opt.repo] ? 'upstream' : 'origin';
const git = (...a) => execFileSync('git', a, {cwd: dir, encoding: 'utf8', maxBuffer: 1 << 28}).trim();

git('fetch', '-q', remote, 'main');
const main = git('rev-parse', 'FETCH_HEAD');

/** sha → patch-id, merges skipped (they carry no patch of their own). */
function patchIds(range, extra = []) {
    const out = execFileSync('sh', ['-c',
        `git log -p --no-merges --format='commit %H' ${extra.map((e) => `'${e}'`).join(' ')} ${range} | git patch-id --stable`,
    ], {cwd: dir, encoding: 'utf8', maxBuffer: 1 << 28});
    const map = new Map();
    for (const row of out.split('\n').filter(Boolean)) {
        const [pid, sha] = row.split(' ');
        map.set(sha, pid);
    }
    return map;
}
const issuesOf = (subject) => subject.match(/#\d{3,6}/g) || [];
/** A subject without its leading issue reference: a backport often drops or gains it. */
const bare = (subject) => subject.replace(/^\S*#\d+\s+/, '');

const mainBySha = patchIds(main, [`--since=${MAIN_WINDOW}`]);
const mainByPid = new Map([...mainBySha].map(([sha, pid]) => [pid, sha]));
const mainByIssue = new Map();
const mainBySubject = new Map();
for (const row of git('log', `--since=${MAIN_WINDOW}`, '--format=%H %s', main).split('\n').filter(Boolean)) {
    const sha = row.slice(0, 40);
    mainBySubject.set(bare(row.slice(41)), sha.slice(0, 10));
    for (const issue of issuesOf(row.slice(41))) {
        if (!mainByIssue.has(issue)) mainByIssue.set(issue, []);
        mainByIssue.get(issue).push(sha.slice(0, 10));
    }
}

const range = `${opt.baseline}..HEAD`;
const stablePids = patchIds(range);
const rows = git('log', '--reverse', '--format=%H%x09%ad%x09%s', '--date=short', range).split('\n').filter(Boolean);
console.log(`${opt.repo} ${line.name} ${range} (${rows.length} commits; main at ${main.slice(0, 10)})`);
for (const row of rows) {
    const [sha, date, subject] = row.split('\t');
    const pid = stablePids.get(sha);
    let verdict;
    // Only gitlinks (mode 160000) changed: a "Submodule update".
    const changed = git('diff-tree', '--no-commit-id', '-r', sha).split('\n').filter(Boolean);
    if (!pid) {
        verdict = 'merge';
    } else if (changed.length && changed.every((entry) => entry.split(' ')[1] === '160000')) {
        verdict = 'pointer bump';
    } else if (mainByPid.has(pid)) {
        verdict = `=main ${mainByPid.get(pid).slice(0, 10)}`;
    } else {
        const twins = [...new Set([
            ...(mainBySubject.has(bare(subject)) ? [mainBySubject.get(bare(subject))] : []),
            ...issuesOf(subject).flatMap((issue) => mainByIssue.get(issue) || []),
        ])];
        verdict = twins.length ? `~main ${twins.slice(0, 6).join(',')}` : 'stable-only';
    }
    console.log(`${sha.slice(0, 10)}  ${date}  ${verdict.padEnd(28)}  ${subject}`);
}
