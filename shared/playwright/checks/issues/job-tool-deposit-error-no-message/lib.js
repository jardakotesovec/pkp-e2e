// Helpers for walk.js (issue report U45 A31). Runs nothing when required.
// holdQueue, queueFacts and storedDois copied from
// checks/issues/issue-deposit-dois-stays-unregistered/lib.js.
const fs = require('fs');
const path = require('path');
const {execFileSync} = require('child_process');

const REPO = path.resolve(__dirname, '../../../../..');
const flat = (s, n = 400) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));

/**
 * The report's precondition, as an administrator sets it in config.inc.php:
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
 * The install default, `[queues] job_runner = On`: queued jobs run at the end
 * of web requests. Returns the value before and after.
 */
function releaseQueue(app) {
    const file = path.isAbsolute(app.configFile) ? app.configFile : path.join(REPO, app.configFile);
    const text = fs.readFileSync(file, 'utf8');
    const m = /^job_runner\s*=\s*(\S+)/m.exec(text);
    if (!m) throw new Error(`no job_runner line in ${app.configFile}`);
    if (m[1] !== 'On') fs.writeFileSync(file, text.replace(/^job_runner\s*=.*$/m, 'job_runner = On'));
    return {before: m[1], after: 'On'};
}

/**
 * The report's step 7: the install's command-line job tool, as an
 * administrator's cron job or worker runs it, `php lib/pkp/tools/jobs.php
 * run` in the app's directory under the install's config. Returns its exit
 * code and output.
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

/** The queue as stored: each queued job's class and each failed job's class and first exception line (read only). */
function queueFacts(sql, app) {
    const rows = (q) => sql(app, q).split('\n').filter(Boolean);
    return {
        queued: rows(`select replace(substring(payload from 'displayName":"([^"]+)'), E'\\\\\\\\', E'\\\\') from jobs order by id`),
        failed: rows(`select replace(substring(payload from 'displayName":"([^"]+)'), E'\\\\\\\\', E'\\\\') || ' | ' || left(split_part(exception, E'\\n', 1), 300) from failed_jobs order by id`),
    };
}

/** Every DOI as stored: `doi | status` (1 unregistered, 2 submitted, 3 registered, 4 error, 5 needs sync). */
function storedDois(sql, app) {
    return sql(app, 'select doi_id, doi, status from dois order by doi_id').split('\n').filter(Boolean);
}

/** Every agency message stored on a DOI (read only). */
function storedMessages(sql, app) {
    return sql(app, "select doi_id, setting_name, left(setting_value, 200) from doi_settings where setting_name ilike '%failedMsg%' or setting_name ilike '%successMsg%' or setting_name ilike '%batchId%'").split('\n').filter(Boolean);
}

module.exports = {flat, holdQueue, releaseQueue, runJobTool, queueFacts, storedDois, storedMessages};
