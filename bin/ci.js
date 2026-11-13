#!/usr/bin/env node
/**
 * @file bin/ci.js
 *
 * Full suites run on CI, not on the VM (harness.md "CI"): nine parallel
 * jobs on fresh boxes finish all three apps in 20–35 min, while one app's
 * full run on the VM takes up to an hour and holds the test lock the other
 * slots wait on. This helper starts a run or waits for one, then says what
 * failed.
 *
 *   node bin/ci.js watch [<run-id>] [--sha <commit>]
 *       the push run of HEAD (or of --sha, or that run id); waits for it
 *   node bin/ci.js dispatch [--ref <branch>] [--apps ojs,omp] [--ojs-ref <ref>]
 *                           [--ojs-repo <owner/name>] (same for omp, ops)
 *                           [--pkp-lib-ref <sha|pull/<n>/head>] [--ui-library-ref <…>]
 *                           [--php-ini-values <a=b,c=d>] [--no-wait]
 *                           [--line <branch>]   a stable version's suite, from lines/<branch>/
 *                           [--php 8.2] [--database mysql|mariadb|pgsql]   another configuration
 *       e2e.yml's workflow_dispatch from --ref (default: the current branch,
 *       which must be pushed), then waits for it
 *   node bin/ci.js summary <run-id>
 *   node bin/ci.js matrix [<run-id> ...]
 *       the daily configurations run (e2e-matrix.yml; the latest finished
 *       one, or the runs named): every test that failed, with the PHP and
 *       database combinations it failed on, set against the latest
 *       nightly on the usual configuration (MAINTENANCE "The
 *       configurations run")
 *
 * While waiting it prints one line when a job finishes; at the end the
 * failed and flaky tests per app (from the job logs) and the run's URL.
 * Exit 0 green, 1 red or cancelled, 2 when no run was found or the wait
 * timed out (--timeout <min>, default 120). Run it in the background under
 * the keepalive (RUNBOOK "Keep the thread ticking").
 */
const {execFileSync} = require('child_process');
const fs = require('fs');
const path = require('path');
const {REPO_ROOT} = require('./apps.js');

const WORKFLOW = 'e2e.yml';
const POLL_MS = 60 * 1000;
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

function gh(args, {json = false} = {}) {
    const out = execFileSync('gh', args, {cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe']});
    return json ? JSON.parse(out) : out;
}

function git(args) {
    return execFileSync('git', args, {cwd: REPO_ROOT, encoding: 'utf8'}).trim();
}

function parseArgs(argv) {
    const out = {_: []};
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (!a.startsWith('--')) out._.push(a);
        else if (a === '--no-wait') out.noWait = true;
        else out[a.slice(2)] = argv[++i];
    }
    return out;
}

// ---------------------------------------------------------------------------
// Finding the run

function findPushRun(sha) {
    const deadline = Date.now() + 5 * 60 * 1000;
    for (;;) {
        const runs = gh(['run', 'list', '--workflow', WORKFLOW, '--commit', sha, '--json', 'databaseId,event,url,createdAt'], {json: true})
            .filter((r) => r.event === 'push');
        if (runs.length) return runs[0];
        if (Date.now() > deadline) return null;
        sleep(15000);
    }
}

function dispatch(opts) {
    const ref = opts.ref || git(['rev-parse', '--abbrev-ref', 'HEAD']);
    if (ref === 'HEAD') throw new Error('detached HEAD: pass --ref <pushed branch>');
    const fields = [];
    const add = (key, value) => value && fields.push('-f', `${key}=${value}`);
    // actions/checkout fetches a shortened sha as a branch of that name and every job fails at checkout.
    for (const key of ['ojs-ref', 'omp-ref', 'ops-ref', 'pkp-lib-ref', 'ui-library-ref']) {
        if (/^[0-9a-f]{7,39}$/i.test(opts[key] || '')) throw new Error(`--${key} ${opts[key]}: a commit is named by its full 40-character sha (git rev-parse ${opts[key]})`);
    }
    for (const app of ['ojs', 'omp', 'ops']) {
        add(`${app}_ref`, opts[`${app}-ref`]);
        add(`${app}_repo`, opts[`${app}-repo`]);
    }
    add('pkp_lib_ref', opts['pkp-lib-ref']);
    add('ui_library_ref', opts['ui-library-ref']);
    add('apps', opts.apps);
    add('php_ini_values', opts['php-ini-values']);
    // A stable version's folder (lines/<line>/, docs/process/VERSIONS.md); name the app refs with it.
    add('line', opts.line);
    // One configuration of the daily e2e-matrix run (MAINTENANCE "The configurations run").
    add('php_version', opts.php);
    add('database', opts.database);
    const list = () => gh(['run', 'list', '--workflow', WORKFLOW, '--event', 'workflow_dispatch', '--branch', ref, '--limit', '20', '--json', 'databaseId,url,createdAt'], {json: true});
    const before = new Set(list().map((r) => r.databaseId));
    const out = gh(['workflow', 'run', WORKFLOW, '--ref', ref, ...fields]);
    const url = (out.match(/https:\/\/github\.com\/\S+\/actions\/runs\/(\d+)/) || [])[0];
    if (url) return {databaseId: Number(url.split('/').pop()), url};
    const deadline = Date.now() + 2 * 60 * 1000;
    while (Date.now() < deadline) {
        sleep(5000);
        const fresh = list().filter((r) => !before.has(r.databaseId)).sort((a, b) => a.databaseId - b.databaseId);
        if (fresh.length) return fresh[0];
    }
    return null;
}

// ---------------------------------------------------------------------------
// Waiting and reporting

function jobState(runId) {
    return gh(['run', 'view', String(runId), '--json', 'status,conclusion,url,jobs,displayTitle,headBranch,event'], {json: true});
}

function wait(runId, timeoutMin) {
    const deadline = Date.now() + timeoutMin * 60 * 1000;
    const seen = new Set();
    for (;;) {
        let run;
        try {
            run = jobState(runId);
        } catch (e) {
            console.log(`ci: run ${runId}: gh failed (${String(e.message).split('\n')[0]}), retrying`);
            sleep(POLL_MS);
            continue;
        }
        const jobs = (run.jobs || []).filter((j) => j.conclusion !== 'skipped'); // apps left out by --apps
        for (const job of jobs) {
            if (job.status === 'completed' && !seen.has(job.name)) {
                seen.add(job.name);
                console.log(`ci: ${job.name}: ${job.conclusion}  (${seen.size}/${jobs.length})`);
            }
        }
        if (run.status === 'completed') return run;
        if (Date.now() > deadline) return null;
        sleep(POLL_MS);
    }
}

const ANSI = /\x1b\[[0-9;]*m/g;

/** One log line's verdict, folded into the job's {failed, flaky, errors}; `mode` is the list being read. */
function readLine(line, j, mode) {
    const count = line.match(/^ {2}(\d+) (failed|flaky|passed|did not run|skipped|interrupted)\b/);
    if (count) return count[2] === 'failed' || count[2] === 'flaky' ? count[2] : null;
    const title = line.match(/^ {4}(\[\w[\w-]*\] › .+)$/);
    if (mode && title) {
        j[mode].add(title[1].trim());
        return mode;
    }
    const err = line.match(/^##\[error\](.+)$/) || line.match(/^::error::(.+)$/);
    if (err && !/Process completed with exit code/.test(err[1])) j.errors.add(err[1].trim());
    return line.startsWith('    ') ? mode : null;
}

/**
 * Failed and flaky test titles per job, from the run's logs: the whole
 * run's log in one call, or job by job when the run has too many jobs for
 * that (the configurations run's 36).
 */
function failures(runId, jobs = []) {
    const perJob = {};
    const fresh = () => ({failed: new Set(), flaky: new Set(), errors: new Set()});
    let log = null;
    try {
        log = gh(['run', 'view', String(runId), '--log']);
    } catch {
        // fall through to the jobs' own logs
    }
    if (log) {
        let mode = null;
        for (const raw of log.split('\n')) {
            const [job, , rest = ''] = raw.split('\t');
            if (!job) continue;
            const j = (perJob[job] = perJob[job] || fresh());
            mode = readLine(rest.replace(/^\S+Z /, '').replace(ANSI, ''), j, mode);
        }
        return perJob;
    }
    let read = 0;
    for (const job of jobs) {
        if (job.status !== 'completed' || job.conclusion === 'skipped') continue;
        // gh 2.103 and later refuse to print a log's escape sequences without
        // the flag; earlier versions do not know the flag.
        const endpoint = `repos/{owner}/{repo}/actions/jobs/${job.databaseId}/logs`;
        let text;
        try {
            text = gh(['api', '--allow-escape-sequences', endpoint]);
        } catch {
            try {
                text = gh(['api', endpoint]);
            } catch {
                continue;
            }
        }
        read++;
        const j = (perJob[job.name] = fresh());
        let mode = null;
        for (const raw of text.split('\n')) mode = readLine(raw.replace(/^\S+Z /, '').replace(ANSI, ''), j, mode);
    }
    return read ? perJob : null;
}

function report(run, runId) {
    console.log(`ci: run ${runId} ${run.conclusion} — ${run.url}`);
    const jobs = (run.jobs || []).filter((j) => j.conclusion !== 'skipped');
    const red = jobs.filter((j) => j.conclusion !== 'success');
    const perJob = failures(runId, jobs) || {};
    for (const job of jobs) {
        const f = perJob[job.name];
        const lines = [];
        if (f) {
            for (const t of f.failed) lines.push(`    failed  ${t}`);
            for (const t of f.flaky) lines.push(`    flaky   ${t}`);
            if (job.conclusion !== 'success') for (const e of f.errors) lines.push(`    error   ${e.slice(0, 200)}`);
        }
        if (job.conclusion !== 'success' || lines.length) {
            console.log(`  ${job.name}: ${job.conclusion}`);
            lines.forEach((l) => console.log(l));
        }
    }
    if (!red.length) console.log(`ci: all ${jobs.filter((j) => j.conclusion === 'success').length} jobs green`);
    return run.conclusion === 'success' ? 0 : 1;
}

// ---------------------------------------------------------------------------
// The configurations run

const MATRIX_WORKFLOW = 'e2e-matrix.yml';
/** "ojs / e2e (ojs, php 8.2, mysql) 2/3" → {app, config: "php 8.2 mysql", shard}; the usual configuration has no config. */
function jobConfig(name) {
    const m = name.match(/e2e \((\w+)(?:, php ([\d.]+), (\w+))?\) (\d+)\/\d+/);
    return m ? {app: m[1], config: m[2] ? `php ${m[2]} ${m[3]}` : '', shard: m[4]} : null;
}

/**
 * The rows of ci-triage "Open — red on a configuration only": each names its
 * test in the Signature cell as `U<nn> S<n>` (several when one cause reds
 * several) and its apps in the Apps cell.
 */
function knownRows() {
    const file = path.join(REPO_ROOT, 'docs', 'tracking', 'ci-triage.md');
    const text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
    const section = (text.split(/^## Open — red on a configuration only.*$/m)[1] || '').split(/^## /m)[0];
    const rows = [];
    for (const line of section.split('\n')) {
        const cells = line.split('|').map((c) => c.trim());
        if (cells.length < 5 || !/^C-/.test(cells[1])) continue;
        const tests = [...cells[2].matchAll(/\b(U\d+) (S\d+)\b/g)].map((m) => `${m[1]} ${m[2]}`);
        const issue = (cells[5] || '').match(/\[([^\]]+)\]\((https:[^)]+)\)/);
        const since = ((cells[6] || '').match(/20\d\d-\d\d-\d\d/) || [])[0] || null;
        rows.push({id: cells[1], tests, apps: cells[3].toLowerCase(), configurations: cells[4], issue: issue ? `${issue[1]} ${issue[2]}` : cells[5], since});
    }
    return rows;
}

/** The known row a failed test's title falls under, or null. */
function knownRow(title, rows) {
    const m = title.match(/^\[(\w+?)(?:-serial|-solo)?\] › .*?[\/](U\d+)-[^ ]* › .* › (S\d+)[:.]/);
    if (!m) return null;
    const app = m[1] === 'shared' ? '' : m[1];
    return rows.find((r) => r.tests.includes(`${m[2]} ${m[3]}`) && (!app || !r.apps || r.apps.includes(app))) || null;
}

function latestRun(workflow, event) {
    const runs = gh(['run', 'list', '--workflow', workflow, ...(event ? ['--event', event] : []), '--status', 'completed', '--limit', '1', '--json', 'databaseId,createdAt,conclusion,url'], {json: true});
    return runs[0] || null;
}

function matrix(ids) {
    const runIds = ids.length ? ids : [(latestRun(MATRIX_WORKFLOW) || {}).databaseId].filter(Boolean);
    if (!runIds.length) {
        console.log(`ci: no finished run of ${MATRIX_WORKFLOW}`);
        return 2;
    }
    // test title → Set of configurations; a job that died outside the tests → its errors
    const failed = new Map();
    const flaky = new Map();
    const broken = [];
    const configs = new Set();
    for (const id of runIds) {
        const run = jobState(id);
        if (run.status !== 'completed') {
            console.log(`ci: configurations run ${id} is still running (its logs come when it ends) — ${run.url}`);
            continue;
        }
        console.log(`ci: configurations run ${id} ${run.conclusion} — ${run.url}`);
        const perJob = failures(id, run.jobs || []) || {};
        for (const job of (run.jobs || []).filter((j) => j.conclusion !== 'skipped')) {
            const cfg = jobConfig(job.name);
            if (!cfg) continue;
            configs.add(cfg.config || 'php 8.3 pgsql');
            const f = perJob[job.name] || {failed: new Set(), flaky: new Set(), errors: new Set()};
            const put = (map, title) => map.set(title, (map.get(title) || new Set()).add(cfg.config || 'php 8.3 pgsql'));
            for (const t of f.failed) put(failed, t);
            for (const t of f.flaky) put(flaky, t);
            if (job.conclusion !== 'success' && !f.failed.size) {
                broken.push(`${job.name}: ${job.conclusion}${f.errors.size ? ` — ${[...f.errors].map((e) => e.slice(0, 160)).join(' | ')}` : ''}`);
            }
        }
    }
    // The usual configuration the same night: a test red there too is no configuration finding.
    const nightly = latestRun(WORKFLOW, 'schedule');
    const usual = new Set();
    if (nightly) {
        for (const f of Object.values(failures(nightly.databaseId, jobState(nightly.databaseId).jobs || []) || {})) for (const t of f.failed) usual.add(t);
        console.log(`ci: the usual configuration (php 8.3 pgsql): nightly ${nightly.databaseId} of ${nightly.createdAt.slice(0, 10)} ${nightly.conclusion}, ${usual.size} failed`);
    }
    const all = [...configs].sort();
    const show = (title, map) => {
        const on = [...map.get(title)].sort();
        console.log(`    ${title}\n        on ${on.length === all.length && all.length > 1 ? `all ${all.length} configurations` : on.join(', ')}`);
    };
    const rows = knownRows();
    const own = [...failed.keys()].filter((t) => !usual.has(t) && !knownRow(t, rows)).sort();
    const known = [...failed.keys()].filter((t) => !usual.has(t) && knownRow(t, rows)).sort();
    const shared = [...failed.keys()].filter((t) => usual.has(t)).sort();
    console.log(`ci: configurations: ${all.join(', ')}`);
    console.log(`  new: failed on a configuration, green on the usual one, no ci-triage row: ${own.length}`);
    own.forEach((t) => show(t, failed));
    if (known.length) {
        console.log(`  known (ci-triage "Open — red on a configuration only"): ${known.length}`);
        known.forEach((t) => console.log(`    ${knownRow(t, rows).id}  ${t}\n        on ${[...failed.get(t)].sort().join(', ')}`));
    }
    // The day's reminder (MAINTENANCE "The configurations run", step 6): one line per open issue.
    const open = rows.filter((r) => known.some((t) => knownRow(t, rows) === r));
    if (open.length && !ids.length) {
        const days = (d) => (d ? Math.max(0, Math.floor((Date.now() - Date.parse(`${d}T00:00:00Z`)) / 86400000)) : null);
        console.log(`  to post, tagging @beaug: the configurations run is still red, ${known.length} test${known.length > 1 ? 's' : ''} from ${open.length} open issue${open.length > 1 ? 's' : ''}`);
        open.forEach((r) => console.log(`    ${r.id}  ${r.issue}: ${r.tests.join(', ')} (${r.apps.toUpperCase()}) on ${r.configurations}`
            + (r.since ? `; red since ${r.since}, ${days(r.since)} day${days(r.since) === 1 ? '' : 's'}` : '')));
    }
    const quiet = rows.filter((r) => !known.some((t) => knownRow(t, rows) === r));
    if (quiet.length && !ids.length) {
        console.log(`  rows with no red test in this run (fixed? delete the row once a second run agrees): ${quiet.map((r) => r.id).join(', ')}`);
    }
    if (shared.length) {
        console.log(`  failed on the usual configuration too (ci-triage's, no configuration finding): ${shared.length}`);
        shared.forEach((t) => show(t, failed));
    }
    if (flaky.size) {
        console.log(`  red, then green on the retry: ${flaky.size}`);
        [...flaky.keys()].sort().forEach((t) => show(t, flaky));
    }
    if (broken.length) {
        console.log(`  jobs that failed outside the tests: ${broken.length}`);
        broken.forEach((b) => console.log(`    ${b}`));
    }
    return own.length || broken.length ? 1 : 0;
}

function main() {
    const [cmd, ...rest] = process.argv.slice(2);
    const opts = parseArgs(rest);
    const timeout = Number(opts.timeout || 120);
    let run = null;
    if (cmd === 'watch') {
        if (opts._[0]) {
            run = {databaseId: Number(opts._[0])};
        } else {
            const sha = git(['rev-parse', opts.sha || 'HEAD']);
            run = findPushRun(sha);
            if (!run) {
                console.log(`ci: no push run of ${WORKFLOW} for ${sha.slice(0, 10)} (is it pushed? a branch name with "/" runs nothing)`);
                process.exit(2);
            }
        }
    } else if (cmd === 'dispatch') {
        run = dispatch(opts);
        if (!run) {
            console.log('ci: dispatched, but the run did not show up within 2 min');
            process.exit(2);
        }
        if (opts.noWait) {
            console.log(`ci: run ${run.databaseId} ${run.url}`);
            return;
        }
    } else if (cmd === 'summary') {
        const id = Number(opts._[0]);
        process.exit(report(jobState(id), id));
    } else if (cmd === 'matrix') {
        process.exit(matrix(opts._.map(Number)));
    } else {
        console.error('usage: node bin/ci.js watch [<run-id>] [--sha <c>] | dispatch [--ref <b>] [--apps …] [--<app>-ref …] [--pkp-lib-ref …] [--no-wait] | summary <run-id> | matrix [<run-id> …]');
        process.exit(1);
    }
    console.log(`ci: waiting for run ${run.databaseId}${run.url ? ` ${run.url}` : ''}`);
    const done = wait(run.databaseId, timeout);
    if (!done) {
        console.log(`ci: run ${run.databaseId} still running after ${timeout} min`);
        process.exit(2);
    }
    process.exit(report(done, run.databaseId));
}

main();
