/**
 * @file lib/pkp/playwright/support/jobs.js
 *
 * runJobs — drain the fleet's queued jobs by invoking the app's own worker
 * (`php lib/pkp/tools/jobs.php run`, bounded: it processes until the queue is
 * empty and exits).
 *
 * The test fleets run with `[queues] job_runner = Off`, so queued-job side
 * effects (job-dispatched emails such as the ORCID mailables, deposits) never
 * happen on their own — a spec that asserts on them calls runJobs() first.
 *
 * SERIAL-PROJECT ONLY (patterns.md parallel lesson 7): the runner drains the
 * SHARED queue, so it can pop other tests' pending jobs — including inside a
 * scenario request's Mail::fake() window, committing side effects while
 * silently swallowing the message. Never call it from a parallel spec; the
 * canonical project chain (serial depends on the parallel projects) keeps
 * explicit runs safe.
 */
const {execFileSync} = require('child_process');

/**
 * Run the queue worker to completion on this fleet's app root. Failing jobs
 * (e.g. an egress-firewalled ORCID deposit left behind by a parallel spec)
 * must not abort the drain: the worker's output is returned either way and
 * callers assert on the observable outcome (Mailpit), not the exit code.
 *
 * @param {{appRoot?: string, timeoutMs?: number}} options
 * @returns {string} the worker's stdout
 */
function runJobs({appRoot = process.env.PKP_APP_ROOT, timeoutMs = 180_000} = {}) {
    if (!appRoot) {
        throw new Error('runJobs: appRoot missing (PKP_APP_ROOT unset — run through the app playwright.config.js)');
    }
    const jobs = (command) => {
        try {
            return execFileSync('php', ['lib/pkp/tools/jobs.php', command], {
                cwd: appRoot,
                env: process.env, // PKP_CONFIG_FILE points the tool at the test config
                encoding: 'utf8',
                timeout: timeoutMs,
                maxBuffer: 16 * 1024 * 1024,
            });
        } catch (error) {
            if (error && typeof error.stdout === 'string') {
                return error.stdout;
            }
            throw error;
        }
    };
    const output = jobs('run');
    // The serial project runs on several workers, and a job this test
    // dispatched may be reserved by another worker's runner at this moment:
    // "run" then returns with the job still executing. Wait until the queue
    // (reserved jobs included) is empty, so the caller's side effects exist
    // when it looks for them ("We have N queued jobs" is the total's report).
    const deadline = Date.now() + timeoutMs;
    for (;;) {
        const total = jobs('total').match(/We have (\d+) queued jobs/);
        if (!total || total[1] === '0') {
            return output;
        }
        if (Date.now() > deadline) {
            throw new Error(`runJobs: ${total[1]} jobs still queued after ${timeoutMs} ms`);
        }
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
    }
}

module.exports = {runJobs};
