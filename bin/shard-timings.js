#!/usr/bin/env node
/**
 * @file bin/shard-timings.js
 *
 * Refreshes shared/playwright/timings/<app>.json, the per-test durations
 * the CI shards are balanced by (shared/playwright/timed-shards.js), from
 * the `timings-<app>-<n>` artifacts of CI runs:
 *
 *   npm run shard-timings [-- <run-id> ...]
 *
 * Without run ids it takes the three latest successful e2e.yml runs on
 * main. Each test gets the median of its passing durations across the
 * runs; a test that ran without passing keeps its old time, and a test no
 * run saw is dropped (deleted or renamed). One summary line per app.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const {execFileSync} = require('child_process');
const {APPS, REPO_ROOT} = require('./apps.js');

const REPO = 'jardakotesovec/pkp-e2e';
const TIMINGS_DIR = path.join(REPO_ROOT, 'shared/playwright/timings');

function gh(args) {
    return execFileSync('gh', args, {encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit']});
}

function median(values) {
    const sorted = [...values].sort((a, b) => a - b);
    const h = sorted.length >> 1;
    return sorted.length % 2 ? sorted[h] : (sorted[h - 1] + sorted[h]) / 2;
}

let runs = process.argv.slice(2);
if (!runs.length) {
    runs = JSON.parse(
        gh(['run', 'list', '-R', REPO, '-w', 'e2e.yml', '-b', 'main', '-s', 'success', '-L', '3', '--json', 'databaseId']),
    ).map((r) => String(r.databaseId));
}

const samples = {}; // app -> key -> [seconds | null]
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'shard-timings-'));
for (const run of runs) {
    const dir = path.join(tmp, run);
    try {
        gh(['run', 'download', run, '-R', REPO, '-p', 'timings-*', '-D', dir]);
    } catch {
        console.log(`run ${run}: no timings artifacts (older than timed-shards.js, or expired); skipped`);
        continue;
    }
    for (const artifact of fs.readdirSync(dir)) {
        const app = artifact.split('-')[1];
        for (const file of fs.readdirSync(path.join(dir, artifact))) {
            const durations = JSON.parse(fs.readFileSync(path.join(dir, artifact, file), 'utf8'));
            for (const [key, seconds] of Object.entries(durations)) {
                ((samples[app] ||= {})[key] ||= []).push(seconds);
            }
        }
    }
}
fs.rmSync(tmp, {recursive: true, force: true});

for (const app of Object.keys(APPS)) {
    if (!samples[app]) {
        console.log(`${app}: no timings artifacts in runs ${runs.join(', ')}; left as is`);
        continue;
    }
    const file = path.join(TIMINGS_DIR, `${app}.json`);
    const old = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
    const out = {};
    let kept = 0;
    for (const key of Object.keys(samples[app]).sort()) {
        const passed = samples[app][key].filter((s) => typeof s === 'number');
        if (passed.length) {
            out[key] = Math.round(median(passed) * 10) / 10;
        } else if (typeof old[key] === 'number') {
            out[key] = old[key];
            kept++;
        }
    }
    const dropped = Object.keys(old).filter((k) => !(k in samples[app])).length;
    fs.writeFileSync(file, JSON.stringify(out, null, 2) + '\n');
    const minutes = Object.values(out).reduce((a, b) => a + b, 0) / 60;
    console.log(
        `${app}: ${Object.keys(out).length} tests, ${minutes.toFixed(1)} test-minutes` +
            ` (runs ${runs.join(', ')}; ${kept} kept without a pass, ${dropped} dropped)`,
    );
}
