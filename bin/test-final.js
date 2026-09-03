#!/usr/bin/env node
/**
 * @file bin/test-final.js
 *
 * The feature's final full-suite run, the three apps one after another
 * (never overlapping: Mailpit is shared and the machine has one CPU budget):
 *
 *   npm run test:final -- --feature U03 [--apps ojs,omp] [--grep @smoke]
 *
 * Each app runs `npm run test:<app> -- --reporter=list --output
 * .reports/<feature>/pw-out-final-<app>`, with its console in
 * .reports/<feature>/final-run-<app>.log. PLAYWRIGHT_WORKERS is left to the
 * environment (the VM pins 4; unset auto-detects). One summary line per app,
 * exit 1 if any suite fails.
 *
 * A server already answering on an app's base port would be adopted by the
 * run (reuseExistingServer) and keep logging elsewhere, so it is reported
 * before the run starts; the probe servers at basePort + 50 are unaffected
 * and can stay up.
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const {spawnSync} = require('child_process');
const {APPS, REPO_ROOT, resolveApp} = require('./apps.js');

const USAGE = 'usage: node bin/test-final.js --feature <id> [--apps ojs,omp,ops] [--grep <pattern>]';

function parseArgs(argv) {
    const options = {feature: null, apps: Object.keys(APPS), grep: null};
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--feature') {
            options.feature = argv[++i];
        } else if (arg === '--apps') {
            options.apps = String(argv[++i] || '')
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean);
        } else if (arg === '--grep') {
            options.grep = argv[++i];
        } else {
            console.error(`test-final: unknown argument "${arg}"\n${USAGE}`);
            process.exit(1);
        }
    }
    if (!options.feature || !/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(options.feature)) {
        console.error(`test-final: --feature <id> is required (a plain token, e.g. U03)\n${USAGE}`);
        process.exit(1);
    }
    for (const name of options.apps) {
        if (!APPS[name]) {
            console.error(`test-final: unknown app "${name}" — one of ${Object.keys(APPS).join(', ')}`);
            process.exit(1);
        }
    }
    return options;
}

function answers(port) {
    return new Promise((resolve) => {
        const req = http.get(`http://127.0.0.1:${port}/README.md`, (res) => {
            res.resume();
            resolve(true);
        });
        req.setTimeout(1500, () => {
            req.destroy();
            resolve(false);
        });
        req.on('error', () => resolve(false));
    });
}

/** The list reporter's closing tally: "12 passed", "1 failed", "3 skipped", "2 flaky". */
function tally(text) {
    const pick = (word) => {
        const matches = [...text.matchAll(new RegExp(`^\\s*(\\d+) ${word}`, 'gm'))];
        return matches.length ? parseInt(matches[matches.length - 1][1], 10) : 0;
    };
    return {passed: pick('passed'), failed: pick('failed'), flaky: pick('flaky'), skipped: pick('skipped')};
}

(async () => {
    const {feature, apps, grep} = parseArgs(process.argv.slice(2));
    const reportDir = path.join(REPO_ROOT, '.reports', feature);
    fs.mkdirSync(reportDir, {recursive: true});
    const summary = [];
    let ok = true;

    for (const name of apps) {
        const app = resolveApp(name);
        if (await answers(app.basePort)) {
            console.log(
                `test-final: WARNING ${name}: a server already answers on ${app.basePort}; the run will adopt it ` +
                    `(kill any manual serve:${name} first — lsof -nP -iTCP:${app.basePort})`,
            );
        }
        const logFile = path.join(reportDir, `final-run-${name}.log`);
        const outDir = path.join(reportDir, `pw-out-final-${name}`);
        const args = ['run', `test:${name}`, '--', '--reporter=list', '--output', outDir];
        if (grep) {
            args.push('--grep', grep);
        }
        const started = Date.now();
        console.log(`test-final: ${name}: npm ${args.join(' ')} (workers ${process.env.PLAYWRIGHT_WORKERS || 'auto'})`);
        const result = spawnSync('npm', args, {
            cwd: REPO_ROOT,
            env: process.env,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe'],
            maxBuffer: 256 * 1024 * 1024,
        });
        const output = (result.stdout || '') + (result.stderr || '');
        fs.writeFileSync(
            logFile,
            `# ${new Date().toISOString()} npm ${args.join(' ')}\n${output}# exit ${result.status}\n`,
        );
        const seconds = ((Date.now() - started) / 1000).toFixed(0);
        const counts = tally(output);
        const code = result.status ?? 1;
        const line =
            `test-final: ${name}: ${code === 0 ? 'GREEN' : 'RED'} — ${counts.passed} passed, ${counts.failed} failed, ` +
            `${counts.flaky} flaky, ${counts.skipped} skipped in ${seconds} s (exit ${code}, log ${path.relative(REPO_ROOT, logFile)})`;
        console.log(line);
        summary.push(line);
        if (code !== 0) {
            ok = false;
        }
    }

    console.log(`test-final: ${ok ? 'all suites green' : 'FAILED'}`);
    process.exit(ok ? 0 : 1);
})().catch((error) => {
    console.error(`test-final: ${error.stack || error}`);
    process.exit(1);
});
