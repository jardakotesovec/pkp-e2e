/**
 * @file shared/playwright/timed-shards.js
 *
 * A reporter that replaces Playwright's `--shard` split with one balanced by
 * each test's recorded CI duration, and records the durations of the run it
 * reports on.
 *
 * Playwright's own split cuts a project's tests into equal COUNTS in file
 * order, so the shard holding the long review and workflow specs ran 14 min
 * while the first ran 8 (OJS, push run 35968923348, 2026-09-24). Here, in
 * `preprocess` (Playwright 1.62; the suite is the whole un-sharded corpus of
 * the invocation), the tests of the named projects are packed longest-first
 * onto the least-loaded shard by their duration in `timings/<app>.json`; a
 * test without one weighs the median of the pass. Every shard computes the
 * same packing from the same inputs (sorted, ties by key) and excludes the
 * tests that are not its own. Without `--shard`, without a timings file, or
 * with PKP_E2E_TIMED_SHARDS=0, Playwright's split stands.
 *
 * Dependency projects (setup) run in full on every shard and cannot be
 * excluded; they are told apart as the projects another project in the
 * suite depends on. Tests that must share a worker (a serial or default-mode
 * describe) move as one unit, as in Playwright's own grouping.
 *
 * Recording: every test of the named projects is written on exit to
 * `<suite>/.timings/<projects>[-<n>of<N>].json` as `{key: seconds}`, or null
 * when it never passed. CI uploads that directory per shard
 * (`timings-<app>-<n>`) and `bin/shard-timings.js` folds runs into
 * `timings/`.
 */
const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '../..');
const DEFAULT_SECONDS = 30;

/** The key a test's duration is stored under: project › file › titles. */
function testKey(test) {
    const project = test.parent.project().name;
    const file = path
        .relative(REPO_ROOT, test.location.file)
        .split(path.sep)
        .join('/');
    return [project, file, ...test.titlePath().slice(3)].join(' › ');
}

/** The project suites named on the command line (not pulled in as deps). */
function namedProjectSuites(rootSuite) {
    const deps = new Set(
        rootSuite.suites.flatMap((s) => s.project()?.dependencies || []),
    );
    return rootSuite.suites.filter((s) => !deps.has(s.project()?.name));
}

/**
 * The unit a test moves with: the outermost describe that keeps its tests on
 * one worker (Playwright's createTestGroups), else the test itself.
 */
function unitOf(test) {
    let unit = test;
    for (let s = test.parent; s; s = s.parent) {
        if (s._parallelMode === 'serial' || s._parallelMode === 'default') {
            unit = s;
        }
    }
    return unit;
}

function median(values) {
    const sorted = [...values].sort((a, b) => a - b);
    const h = sorted.length >> 1;
    return sorted.length % 2 ? sorted[h] : (sorted[h - 1] + sorted[h]) / 2;
}

class TimedShards {
    constructor() {
        this.durations = new Map();
        this.named = new Set();
    }

    printsToStdio() {
        return false;
    }

    async preprocess({config, suite, testRun}) {
        const shard = config.shard;
        const app = process.env.PKP_APP_NAME;
        const file = path.join(__dirname, 'timings', `${app}.json`);
        if (
            !shard ||
            shard.total < 2 ||
            process.env.PKP_E2E_TIMED_SHARDS === '0' ||
            !fs.existsSync(file)
        ) {
            return;
        }
        const timings = JSON.parse(fs.readFileSync(file, 'utf8'));

        const units = new Map();
        const known = [];
        for (const projectSuite of namedProjectSuites(suite)) {
            for (const test of projectSuite.allTests()) {
                const unit = unitOf(test);
                if (!units.has(unit)) {
                    units.set(unit, {key: testKey(test), tests: [], seconds: 0, unknown: 0});
                }
                const entry = units.get(unit);
                entry.tests.push(test);
                const seconds = timings[testKey(test)];
                if (typeof seconds === 'number') {
                    entry.seconds += seconds;
                    known.push(seconds);
                } else {
                    entry.unknown++;
                }
            }
        }
        const fallback = known.length ? median(known) : DEFAULT_SECONDS;
        const sorted = [...units.values()]
            .map((u) => ({...u, seconds: u.seconds + u.unknown * fallback}))
            .sort((a, b) => b.seconds - a.seconds || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));

        const load = Array(shard.total).fill(0);
        const mine = shard.current - 1;
        let tests = 0;
        let unknown = 0;
        testRun.skipSharding();
        for (const unit of sorted) {
            const target = load.indexOf(Math.min(...load));
            load[target] += unit.seconds;
            if (target === mine) {
                tests += unit.tests.length;
                unknown += unit.unknown;
            } else {
                unit.tests.forEach((t) => testRun.exclude(t));
            }
        }
        const minutes = load.map((s) => (s / 60).toFixed(1)).join(' · ');
        console.log(
            `timed shards: shard ${shard.current}/${shard.total} runs ${tests} tests` +
                (unknown ? ` (${unknown} without a recorded time)` : '') +
                `; test-minutes per shard ${minutes}`,
        );
    }

    onBegin(config, suite) {
        this.config = config;
        for (const projectSuite of namedProjectSuites(suite)) {
            this.named.add(projectSuite.project().name);
        }
    }

    onTestEnd(test, result) {
        if (!this.named.has(test.parent.project()?.name)) {
            return;
        }
        const key = testKey(test);
        if (result.status === 'passed') {
            this.durations.set(key, Math.round(result.duration / 100) / 10);
        } else if (!this.durations.has(key)) {
            this.durations.set(key, null);
        }
    }

    onEnd() {
        const suiteDir = process.env.PKP_SUITE_DIR;
        if (!suiteDir || !this.durations.size) {
            return;
        }
        const shard = this.config.shard;
        const name =
            [...this.named].sort().join('+') +
            (shard ? `-${shard.current}of${shard.total}` : '');
        const dir = path.join(suiteDir, '.timings');
        fs.mkdirSync(dir, {recursive: true});
        const out = Object.fromEntries(
            [...this.durations].sort(([a], [b]) => (a < b ? -1 : 1)),
        );
        fs.writeFileSync(path.join(dir, `${name}.json`), JSON.stringify(out, null, 2) + '\n');
    }
}

module.exports = TimedShards;
