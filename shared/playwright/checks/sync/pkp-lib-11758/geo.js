// PR review check — pkp/pkp-lib#11758 "Fix 2": pkp-lib#13601 (3.4), #13670 (3.5), #13671 (main), with the
// app PRs that bump lib/pkp and add I11758_RedispatchRegionCodesFixingJobs to upgrade.xml.
//
// The change is in the 3.4 upgrade's background jobs (I8866_DispatchRegionCodesFixingJobs, which an
// upgrade from 3.3 runs, then RegionMappingTmpInsert and FixRegionCodes), so the suites never reach
// it. This drives the job on PKP's 3.3 default dataset with FIPS region codes planted in 3.3's
// `metrics` table, which I6782_MetricsGeo moves into the geo tables during the upgrade. The planted
// rows include the collisions the issue names (VN 01 → 44 and 44 → HN, CY 01 ↔ 04, MA 70 and
// 57 → 01, TH 22 → 40 → 10), KH 09 → 10 from the issue's steps, and one large submission (12,600
// rows per table, over BATCH_SIZE) so that the conversion goes country by country across several
// jobs.
//
// Precondition: the dataset fleet's config exists, written by one reset with the 3.3 dump:
//   PKP_E2E_LINE=<line> PKP_E2E_DATASET_BRANCH=stable-3_3_0 npm run reset:<app> -- --dataset 7
// No server is started, so no web request runs a job behind the check's back.
//
//   PKP_E2E_LINE=<line> node shared/playwright/checks/sync/pkp-lib-11758/geo.js <app> <n> <label> <step> [<step> …]
//
// Steps, in the order given:
//   load            reload the 3.3 dump and plant the FIPS rows in `metrics`
//   upgrade         php tools/upgrade.php upgrade
//   post            add rows as the stats job writes them after the upgrade (needs_review takes its default 0)
//   jobs            run every queued job (jobs.php run); jobs:once runs one
//   drop-pending    delete the queued FixRegionCodes job, as when a run failed and left its data behind
//   redispatch      php lib/pkp/tools/migration.php I11758_RedispatchRegionCodesFixingJobs up
//   clone-from:<db> replace this fleet's database with a copy of <db> (a site upgraded on another line)
//   version:<v>     make <v> the current core version (a site on that release, before `upgrade`)
//   state           the temporary tables, column and indexes, and the queued and failed jobs
//   check           compare both geo tables with the expected result: each planted row converted once
//                   (regionMapping.php), rows with the same key merged by summing, the post rows kept;
//                   check:nopost leaves the post rows out (3.4, whose upgrade runs the jobs itself)
// SEED_COUNTRIES=1 adds 2 × 676 rows (every two-letter country code) for the nesting stress; set it for load and check alike.
// Facts go to .reports/pr-11758/<line>-<app>-<label>.json; each step prints one line.
const {execFileSync, spawnSync} = require('child_process');
const fs = require('fs');
const path = require('path');

process.env.PKP_E2E_DATASET_BRANCH = process.env.PKP_E2E_DATASET_BRANCH || 'stable-3_3_0';
const {datasetFleet, loadDump, dropStaleUsageLogs, campaignCredentials, dropDatabase, query} = require('../../../dataset');

const [appName, nArg, label, ...steps] = process.argv.slice(2);
if (!appName || !nArg || !label || !steps.length) {
    console.error('usage: node geo.js <app> <n> <label> <step> [<step> …]');
    process.exit(2);
}
const fleet = datasetFleet(appName, Number(nArg));
const root = path.resolve(fleet.root);
const env = {...process.env, PKP_CONFIG_FILE: path.resolve(fleet.configFile)};
const LOAD = 'geo11758';
const METRIC_TYPE = {ojs: 'ojs::counter', omp: 'omp::counter', ops: 'ops::counter'}[appName];
const ASSOC_TYPE_SUBMISSION = 1048585;
const q = (sql) => query(fleet, sql);
const one = (sql) => (q(sql)[0] || [null])[0];
const sha = (dir) => execFileSync('git', ['-C', path.join(root, dir), 'rev-parse', '--short=10', 'HEAD'], {encoding: 'utf8'}).trim();
const outDir = path.resolve(__dirname, '../../../../../.reports/pr-11758');
fs.mkdirSync(outDir, {recursive: true});
const outFile = path.join(outDir, `${fleet.line}-${appName}-${label}.json`);
const facts = fs.existsSync(outFile) ? JSON.parse(fs.readFileSync(outFile, 'utf8')) : {app: appName, line: fleet.line, label, db: fleet.db, steps: []};
const say = (step, fact) => {
    facts.steps.push({step, app: sha('.'), pkpLib: sha('lib/pkp'), ...fact});
    fs.writeFileSync(outFile, JSON.stringify(facts, null, 1));
    console.log(`[${fleet.line} ${appName} ${label}] ${step}: ${JSON.stringify(fact).slice(0, 700)}`);
};

// The planted 3.3 rows: [submission, country, region, city, day, metric].
function plantedRows(submissionIds) {
    const rows = [];
    const small = [
        ['VN', '01', 'Hanoi', 3], ['VN', '44', 'Hanoi', 5], // 01 → 44 and 44 → HN: 44 is taken while 01 converts
        ['CY', '01', 'Nicosia', 2], ['CY', '04', 'Nicosia', 7], // 01 ↔ 04, a cycle
        ['MA', '70', 'Rabat', 4], ['MA', '57', 'Rabat', 6], // both → 01: merged
        ['TH', '22', 'Bangkok', 2], ['TH', '40', 'Bangkok', 3], // 22 → 40, 40 → 10
        ['KH', '09', 'Phnom Penh', 1], // the issue's steps: 09 → 10, never 11
        ['US', 'CA', 'Los Angeles', 1], // no mapping: kept
        ['DE', null, null, 1], // no region: kept
    ];
    const [s1, s2, s3, ...rest] = submissionIds;
    for (const day of ['20220115', '20220120']) for (const [c, r, city, m] of small) rows.push([s1, c, r, city, day, m]);
    for (const [c, r, city, m] of small.slice(0, 2).concat([small[8]])) rows.push([s2, c, r, city, '20220201', m]);
    // the large submission: 16 German regions × 250 cities × 3 months, plus 100 cities with the VN collision
    for (const day of ['20220110', '20220210', '20220310']) {
        for (let r = 1; r <= 16; r++) for (let i = 1; i <= 250; i++) rows.push([s3, 'DE', String(r).padStart(2, '0'), `City ${i}`, day, 1 + ((r + i) % 5)]);
        for (let i = 1; i <= 100; i++) {
            rows.push([s3, 'VN', '01', `City ${i}`, day, 2]);
            rows.push([s3, 'VN', '44', `City ${i}`, day, 3]);
        }
    }
    for (const s of rest) rows.push([s, 'KH', '09', 'Siem Reap', '20220301', 1]);
    // SEED_COUNTRIES=1: two more submissions with one row in each of the 676 two-letter country codes, so that a
    // small BATCH_SIZE gives one job per submission and country (the depth of nested dispatches on a sync queue)
    if (process.env.SEED_COUNTRIES) {
        const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        for (const s of rest.slice(0, 2)) for (const a of letters) for (const b of letters) if (!['AP', 'EU'].includes(a + b)) rows.push([s, a + b, '01', 'Capital', '20220401', 1]); // I6782 drops AP and EU
    }
    return rows;
}

// Rows the usage stats job writes after the upgrade, before the conversion has run (needs_review defaults to 0).
const POST = {
    monthly: [
        // collides with the converted VN 44 → HN row of January: the metrics are added to it
        {country: 'VN', region: 'HN', city: 'Hanoi', month: 202201, metric: 100, metric_unique: 10},
        // already an ISO code, which is also a FIPS code (KH 10 → 11): must stay 10
        {country: 'KH', region: '10', city: 'Battambang', month: 202201, metric: 7, metric_unique: 7},
    ],
    daily: [{load_id: 'usage_events_20260101.log', country: 'VN', region: '44', city: 'Hanoi', date: '2026-01-01', metric: 9, metric_unique: 9}],
};

function mapping() {
    const out = execFileSync('php', ['-r', 'echo json_encode(include "lib/pkp/lib/regionMapping.php");'], {cwd: root, encoding: 'utf8'});
    return JSON.parse(out);
}

function expected(submissionIds, contextId, withPost = true) {
    const map = mapping();
    const iso = (c, r) => (r && map[c] && map[c][r] !== undefined && String(map[c][r]) !== r ? String(map[c][r]) : r || '');
    const daily = new Map();
    const monthly = new Map();
    const add = (m, key, metric, unique) => {
        const v = m.get(key) || [0, 0];
        m.set(key, [v[0] + metric, v[1] + unique]);
    };
    for (const [s, c, r, city, day, metric] of plantedRows(submissionIds)) {
        const region = iso(c, r);
        const date = `${day.slice(0, 4)}-${day.slice(4, 6)}-${day.slice(6, 8)}`;
        add(daily, [LOAD, contextId, s, c, region, city || '', date].join('|'), metric, 0);
        add(monthly, [contextId, s, c, region, city || '', day.slice(0, 6)].join('|'), metric, 0);
    }
    const s1 = submissionIds[0];
    if (!withPost) return {daily, monthly};
    for (const p of POST.monthly) add(monthly, [contextId, s1, p.country, p.region, p.city, p.month].join('|'), p.metric, p.metric_unique);
    for (const p of POST.daily) add(daily, [p.load_id, contextId, s1, p.country, p.region, p.city, p.date].join('|'), p.metric, p.metric_unique);
    return {daily, monthly};
}

function actual() {
    const daily = new Map();
    const monthly = new Map();
    for (const [l, ctx, s, c, r, city, d, m, u] of q(
        "SELECT load_id, context_id, submission_id, country, region, city, to_char(date, 'YYYY-MM-DD'), metric, metric_unique FROM metrics_submission_geo_daily",
    )) {
        daily.set([l, ctx, s, c, r, city, d].join('|'), [Number(m), Number(u)]);
    }
    for (const [ctx, s, c, r, city, month, m, u] of q('SELECT context_id, submission_id, country, region, city, month, metric, metric_unique FROM metrics_submission_geo_monthly')) {
        monthly.set([ctx, s, c, r, city, month].join('|'), [Number(m), Number(u)]);
    }
    return {daily, monthly};
}

function compare(exp, act) {
    const missing = [];
    const wrong = [];
    const extra = [];
    for (const [k, v] of exp) {
        if (!act.has(k)) missing.push(`${k} ${v}`);
        else if (act.get(k).join() !== v.join()) wrong.push(`${k} expected ${v} got ${act.get(k)}`);
    }
    for (const [k, v] of act) if (!exp.has(k)) extra.push(`${k} ${v}`);
    const sum = (m) => [...m.values()].reduce((a, v) => a + v[0], 0);
    return {rows: act.size, expectedRows: exp.size, metricSum: sum(act), expectedMetricSum: sum(exp), missing: missing.slice(0, 6), missingCount: missing.length, wrong: wrong.slice(0, 6), wrongCount: wrong.length, extra: extra.slice(0, 6), extraCount: extra.length};
}

function contextAndSubmissions() {
    const table = ['journals', 'presses', 'servers'].find((t) => one(`SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name='${t}'`) === '1');
    const idCol = {journals: 'journal_id', presses: 'press_id', servers: 'server_id'}[table];
    const contextId = one(`SELECT min(${idCol}) FROM ${table}`);
    const ids = q(`SELECT submission_id FROM submissions WHERE context_id = ${contextId} ORDER BY submission_id`).map((r) => r[0]);
    return {contextId, submissionIds: ids};
}

function state() {
    const has = (t) => one(`SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name='${t}'`) === '1';
    const col = (t) => one(`SELECT count(*) FROM information_schema.columns WHERE table_name='${t}' AND column_name='needs_review'`) === '1';
    const idx = (t) => q(`SELECT indexname FROM pg_indexes WHERE tablename='${t}' AND indexname LIKE '%tmp%' ORDER BY 1`).map((r) => r[0]);
    const job = (t) => !has(t) ? 'absent' : q(`SELECT substring(payload from '"displayName":"([^"]+)"') FROM ${t} ORDER BY 1`).map((r) => r[0].replace(/^.*\\\\/, ''));
    const failed = !has('failed_jobs') ? 'absent' : q("SELECT substring(payload from '\"displayName\":\"([^\"]+)\"'), left(exception, 220) FROM failed_jobs ORDER BY id").map(([n, e]) => `${n.replace(/^.*\\\\/, '')}: ${e.replace(/\s+/g, ' ')}`);
    const pending = (t) => (col(t) ? Number(one(`SELECT count(*) FROM ${t} WHERE needs_review IS NULL`)) : null);
    return {
        version: one("SELECT major||'.'||minor||'.'||revision||'.'||build FROM versions WHERE current=1 AND product_type='core'"),
        regionMappingTmp: has('region_mapping_tmp') ? Number(one('SELECT count(*) FROM region_mapping_tmp')) : 'absent',
        regionFixTmp: has('region_fix_tmp') ? Number(one('SELECT count(*) FROM region_fix_tmp')) : 'absent',
        needsReviewNull: {daily: pending('metrics_submission_geo_daily'), monthly: pending('metrics_submission_geo_monthly')},
        tmpIndexes: {daily: idx('metrics_submission_geo_daily'), monthly: idx('metrics_submission_geo_monthly')},
        regionWidth: one("SELECT character_maximum_length FROM information_schema.columns WHERE table_name='metrics_submission_geo_daily' AND column_name='region'"),
        queued: job('jobs'),
        failed,
    };
}

const php = (args) => {
    const t = Date.now();
    const run = spawnSync('php', args, {cwd: root, env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024});
    const output = `${run.stdout || ''}${run.stderr || ''}`;
    return {exit: run.status, seconds: Math.round((Date.now() - t) / 100) / 10, output};
};

for (const step of steps) {
    if (step !== 'load' && !facts.submissionIds) Object.assign(facts, contextAndSubmissions());
    if (step === 'load') {
        loadDump(fleet, campaignCredentials(fleet));
        fs.rmSync(fleet.filesDir, {recursive: true, force: true});
        fs.cpSync(path.join(fleet.source, 'files'), fleet.filesDir, {recursive: true});
        dropStaleUsageLogs(fleet);
        fs.rmSync(fleet.cacheDir, {recursive: true, force: true});
        fs.mkdirSync(fleet.cacheDir, {recursive: true});
        const {contextId, submissionIds} = contextAndSubmissions();
        const rows = plantedRows(submissionIds);
        const values = rows.map(
            ([s, c, r, city, day, m]) => `('${LOAD}', ${contextId}, ${s}, ${ASSOC_TYPE_SUBMISSION}, ${s}, '${day}', '${day.slice(0, 6)}', '${c}', ${r ? `'${r}'` : 'NULL'}, ${city ? `'${city}'` : 'NULL'}, '${METRIC_TYPE}', ${m})`,
        );
        for (let i = 0; i < values.length; i += 500) {
            q(`INSERT INTO metrics (load_id, context_id, submission_id, assoc_type, assoc_id, day, month, country_id, region, city, metric_type, metric) VALUES ${values.slice(i, i + 500).join(', ')}`);
        }
        facts.contextId = contextId;
        facts.submissionIds = submissionIds;
        say('load', {version: one("SELECT major||'.'||minor||'.'||revision||'.'||build FROM versions WHERE current=1 AND product_type='core'"), planted: rows.length, inMetrics: Number(one(`SELECT count(*) FROM metrics WHERE load_id = '${LOAD}'`)), submissions: submissionIds.length});
    } else if (step === 'upgrade') {
        const r = php(['tools/upgrade.php', 'upgrade']);
        fs.writeFileSync(outFile.replace(/\.json$/, `-upgrade-${facts.steps.length}.log`), r.output);
        const said = (r.output.match(/^(ERROR: .*|Successfully upgraded to version .*)$/m) || [])[1] || r.output.trim().split('\n').pop();
        say('upgrade', {exit: r.exit, seconds: r.seconds, said: (said || '').slice(0, 300), mentions11758: /I11758/.test(r.output), mentions8866: /I8866/.test(r.output), state: state()});
    } else if (step === 'post') {
        const ctx = facts.contextId;
        const s1 = facts.submissionIds[0];
        for (const p of POST.monthly) q(`INSERT INTO metrics_submission_geo_monthly (context_id, submission_id, country, region, city, month, metric, metric_unique) VALUES (${ctx}, ${s1}, '${p.country}', '${p.region}', '${p.city}', ${p.month}, ${p.metric}, ${p.metric_unique})`);
        for (const p of POST.daily) q(`INSERT INTO metrics_submission_geo_daily (load_id, context_id, submission_id, country, region, city, date, metric, metric_unique) VALUES ('${p.load_id}', ${ctx}, ${s1}, '${p.country}', '${p.region}', '${p.city}', '${p.date}', ${p.metric}, ${p.metric_unique})`);
        say('post', {inserted: POST.monthly.length + POST.daily.length, needsReviewOfPost: q(`SELECT needs_review FROM metrics_submission_geo_monthly WHERE metric_unique > 0 UNION ALL SELECT needs_review FROM metrics_submission_geo_daily WHERE metric_unique > 0`).map((r) => r[0])});
    } else if (step === 'jobs' || step === 'jobs:once') {
        const r = php(['lib/pkp/tools/jobs.php', 'run', ...(step === 'jobs:once' ? ['--once'] : [])]);
        fs.writeFileSync(outFile.replace(/\.json$/, `-jobs-${facts.steps.length}.log`), r.output);
        const lines = r.output.split('\n').filter((l) => /RUNNING|DONE|FAIL|Exception|Error/i.test(l));
        say(step, {exit: r.exit, seconds: r.seconds, ran: lines.filter((l) => /DONE|FAIL/.test(l)).length, fails: lines.filter((l) => /FAIL/.test(l)).slice(0, 3), state: state()});
    } else if (step === 'drain') {
        // run jobs until none is queued (each job dispatches the next one), at most 60 rounds
        let rounds = 0;
        let output = '';
        const t = Date.now();
        while (rounds < 60 && one('SELECT count(*) FROM jobs') !== '0') {
            // a released job waits out its backoff (5 s) before it is available again
            const wait = Number(one('SELECT GREATEST(0, min(available_at) - extract(epoch from now())::int) FROM jobs'));
            if (wait > 0) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, Math.min(wait + 1, 10) * 1000);
            const r = php(['lib/pkp/tools/jobs.php', 'run']);
            output += r.output;
            rounds++;
        }
        fs.writeFileSync(outFile.replace(/\.json$/, `-drain-${facts.steps.length}.log`), output);
        const processed = (output.match(/Processed: +\S+/g) || []).map((l) => l.replace(/^.*\\/, ''));
        const failedRuns = (output.match(/Failed: +\S+/g) || []).length;
        say('drain', {uniqueViolations: (output.match(/Unique violation/g) || []).length, rounds, seconds: Math.round((Date.now() - t) / 100) / 10, processed: processed.length, fixJobs: processed.filter((n) => n === 'FixRegionCodes').length, failedRuns, state: state()});
    } else if (step.startsWith('clone-from:')) {
        // this fleet's database becomes a copy of another (e.g. a 3.5 fleet's), to upgrade it with this checkout
        const source = step.slice(11);
        const creds = campaignCredentials(fleet);
        const pgEnv = {...process.env, ...(creds.password ? {PGPASSWORD: creds.password} : {})};
        const conn = [...(creds.host ? ['-h', creds.host] : []), ...(creds.username ? ['-U', creds.username] : [])];
        dropDatabase(fleet.db, creds);
        execFileSync('createdb', [...conn, '-T', source, fleet.db], {env: pgEnv});
        delete facts.submissionIds;
        Object.assign(facts, contextAndSubmissions());
        say(step, {state: state()});
    } else if (step === 'region-jobs-only') {
        // the upgrade also queues other jobs (e.g. the search index on main): drop them, so that jobs:once runs the region jobs
        const n = one("WITH d AS (DELETE FROM jobs WHERE payload NOT LIKE '%RegionMappingTmpInsert%' AND payload NOT LIKE '%FixRegionCodes%' RETURNING 1) SELECT count(*) FROM d");
        say(step, {deleted: Number(n), queued: state().queued});
    } else if (step === 'drop-pending') {
        const n = one("WITH d AS (DELETE FROM jobs WHERE payload LIKE '%FixRegionCodes%' RETURNING 1) SELECT count(*) FROM d");
        say('drop-pending', {deleted: Number(n), state: state()});
    } else if (step === 'redispatch') {
        const r = php(['lib/pkp/tools/migration.php', 'PKP\\migration\\upgrade\\v3_4_0\\I11758_RedispatchRegionCodesFixingJobs', 'up']);
        say('redispatch', {exit: r.exit, output: r.output.trim().slice(0, 300), state: state()});
    } else if (step.startsWith('version:')) {
        const [major, minor, revision, build] = step.slice(8).split('.');
        q(`UPDATE versions SET major=${major}, minor=${minor}, revision=${revision}, build=${build} WHERE current=1 AND product_type='core'`);
        say(step, {version: state().version});
    } else if (step === 'state') {
        say('state', state());
    } else if (step === 'check' || step === 'check:nopost') {
        const exp = expected(facts.submissionIds, facts.contextId, step === 'check');
        const act = actual();
        const daily = compare(exp.daily, act.daily);
        const monthly = compare(exp.monthly, act.monthly);
        const sample = q(
            `SELECT country, region, city, month, metric, metric_unique FROM metrics_submission_geo_monthly WHERE submission_id = ${facts.submissionIds[0]} AND month = 202201 ORDER BY country, region, city`,
        ).map((r) => r.join(' '));
        const pass = [daily, monthly].every((c) => !c.missingCount && !c.wrongCount && !c.extraCount);
        say(step, {pass, daily, monthly, sample, state: state()});
    } else {
        throw new Error(`unknown step ${step}`);
    }
}
