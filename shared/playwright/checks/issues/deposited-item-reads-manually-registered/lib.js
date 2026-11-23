// Helpers for walk.js (issue report U45 A4). Runs nothing when required.
// holdQueue and runJobTool copied from
// checks/issues/job-tool-deposit-error-no-message/lib.js.
const fs = require('fs');
const path = require('path');
const {execFileSync} = require('child_process');

const REPO = path.resolve(__dirname, '../../../../..');
const flat = (s, n = 400) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));

/**
 * The job tool's precondition, as an administrator sets it in config.inc.php:
 * `[queues] job_runner = Off`, so a queued deposit waits for the job tool
 * instead of running at the end of the next web request. The fleet's reset
 * writes the config afresh (`On`, as the dataset ships it), so every walk
 * sets it. Returns the value before and after.
 */
function holdQueue(app) {
    const file = path.isAbsolute(app.configFile) ? app.configFile : path.join(REPO, app.configFile);
    const text = fs.readFileSync(file, 'utf8');
    const m = /^job_runner\s*=\s*(\S+)/m.exec(text);
    if (!m) throw new Error(`no job_runner line in ${app.configFile}`);
    if (m[1] !== 'Off') fs.writeFileSync(file, text.replace(/^job_runner\s*=.*$/m, 'job_runner = Off'));
    return {before: m[1], after: 'Off'};
}

/**
 * The install's command-line job tool, as an administrator's cron job or
 * worker runs it: `php lib/pkp/tools/jobs.php run` in the app's directory
 * under the install's config. Returns its exit code and output.
 */
function runJobTool(app) {
    const file = path.isAbsolute(app.configFile) ? app.configFile : path.join(REPO, app.configFile);
    try {
        const out = execFileSync('php', ['lib/pkp/tools/jobs.php', 'run'], {
            cwd: app.root, env: {...process.env, PKP_CONFIG_FILE: file}, encoding: 'utf8', timeout: 180_000,
        });
        return {code: 0, output: flat(out, 1500)};
    } catch (e) {
        return {code: e.status, output: flat(`${e.stdout || ''}${e.stderr || ''}`, 1500)};
    }
}

module.exports = {flat, holdQueue, runJobTool};
