// Helpers for walk.js (issue report U45 OPS8). Runs nothing when required.
// holdQueue, releaseQueue and runJobTool copied from
// checks/issues/job-tool-deposit-error-no-message/lib.js.
const fs = require('fs');
const path = require('path');
const {execFileSync, spawn} = require('child_process');

const REPO = path.resolve(__dirname, '../../../../..');
const flat = (s, n = 400) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));
const configPath = (app) => (path.isAbsolute(app.configFile) ? app.configFile : path.join(REPO, app.configFile));

function setRunner(app, value) {
    const file = configPath(app);
    const text = fs.readFileSync(file, 'utf8');
    const m = /^job_runner\s*=\s*(\S+)/m.exec(text);
    if (!m) throw new Error(`no job_runner line in ${app.configFile}`);
    if (m[1] !== value) fs.writeFileSync(file, text.replace(/^job_runner\s*=.*$/m, `job_runner = ${value}`));
    return {before: m[1], after: value};
}

/** `[queues] job_runner = Off`: a queued deposit waits for the job tool. */
const holdQueue = (app) => setRunner(app, 'Off');
/** `[queues] job_runner = On` (the install default): queued jobs run at the end of web requests. */
const releaseQueue = (app) => setRunner(app, 'On');

/** The command-line job tool, `php lib/pkp/tools/jobs.php run` in the app root under the install's config. */
function runJobTool(app) {
    try {
        const out = execFileSync('php', ['lib/pkp/tools/jobs.php', 'run'], {
            cwd: app.root, env: {...process.env, PKP_CONFIG_FILE: configPath(app)}, encoding: 'utf8', timeout: 180_000,
        });
        return {code: 0, output: flat(out, 1500)};
    } catch (e) {
        return {code: e.status, output: flat(`${e.stdout || ''}${e.stderr || ''}`, 1500)};
    }
}

/** The install's `files_dir/temp`, where the Crossref plugin writes each file it deposits or exports. */
function tempDir(app) {
    const cfg = fs.readFileSync(configPath(app), 'utf8');
    const dir = (cfg.match(/^files_dir\s*=\s*"?([^"\n]+?)"?\s*$/m) || [])[1];
    if (!dir) throw new Error(`no files_dir in ${app.configFile}`);
    return path.join(dir, 'temp');
}

/**
 * The Steps' terminal watcher: copies every non-empty `crossrefplugin-*.xml`
 * that appears in `dir` to `<prefix>-<name>` the moment it is there (a
 * deposit's file is deleted right after the send). Returns `stop()`, which
 * ends the watcher and lists the copies (`list()` lists them without stopping) with their DOIs and resources.
 */
function watchSent(dir, prefix) {
    fs.mkdirSync(path.dirname(prefix), {recursive: true});
    const child = spawn(process.execPath, ['-e', `
        const fs = require('fs'), path = require('path'); const dir = process.argv[1], pfx = process.argv[2];
        const seen = new Set();
        const grab = (f) => { if (!/^crossrefplugin-.*\\.xml$/.test(f) || seen.has(f)) return;
            try { const b = fs.readFileSync(path.join(dir, f)); if (!b.length) return; seen.add(f); fs.writeFileSync(pfx + '-' + f, b); } catch (e) {} };
        try { fs.watch(dir, (ev, f) => f && grab(f)); } catch (e) {}
        setInterval(() => { try { fs.readdirSync(dir).forEach(grab); } catch (e) {} }, 2);
        setInterval(() => { try { process.kill(Number(process.argv[3]), 0); } catch (e) { process.exit(0); } }, 1000);
    `, dir, prefix, String(process.pid)], {stdio: 'ignore'});
    const list = () => {
        const d = path.dirname(prefix), b = path.basename(prefix);
        return fs.readdirSync(d).filter((f) => f.startsWith(`${b}-crossrefplugin-`)).sort().map((f) => readCrossrefFile(path.join(d, f)));
    };
    return {
        list,
        stop() {
            child.kill();
            return list();
        },
    };
}

/** A Crossref file's DOIs and `<resource>` addresses. */
function readCrossrefFile(file) {
    const x = fs.readFileSync(file, 'utf8');
    return {file: path.basename(file), dois: (x.match(/<doi>[^<]+<\/doi>/g) || []).map((d) => d.replace(/<\/?doi>/g, '')),
        resources: (x.match(/<resource[^>]*>[^<]+<\/resource>/g) || []).map((r) => r.replace(/<[^>]+>/g, ''))};
}

/** Pre-existing `crossrefplugin-*.xml` names in `dir` (for picking the one an export leaves). */
const crossrefFiles = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /^crossrefplugin-.*\.xml$/.test(f)) : []);

module.exports = {flat, holdQueue, releaseQueue, runJobTool, tempDir, watchSent, readCrossrefFile, crossrefFiles};
