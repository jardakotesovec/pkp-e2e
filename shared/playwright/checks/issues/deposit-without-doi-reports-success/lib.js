// Helpers for walk.js (issue reports U45 A15 and U45 OJS5). Runs nothing when required.
// holdQueue and runJobTool copied from
// checks/issues/deposited-item-reads-manually-registered/lib.js.
const fs = require('fs');
const path = require('path');
const {execFileSync} = require('child_process');
const {expect} = require('@playwright/test');
const {DOIS_TEXT, isListFetch} = require('../../../pages/DoisPages.js');

const T = 30_000;

/**
 * Press "Deposit All" above the DOIs list and confirm its window with
 * "Deposit all DOIs"; waits for the action's request and the list's refetch.
 * Returns {status, body, window} (the window's text as shown).
 *
 * @param {import('@playwright/test').Page} page
 * @param {any} dois a DoisPage
 */
async function depositAll(page, dois) {
    await dois.depositAllButton().click();
    const dialog = dois.dialog(DOIS_TEXT.depositAllTitle);
    await expect(dialog).toBeVisible({timeout: T});
    const windowText = (await dialog.innerText()).replace(/\s+/g, ' ').trim();
    const acted = page.waitForResponse((r) => /\/api\/v1\/dois\/depositAll/.test(r.url()) && r.request().method() !== 'GET', {timeout: T});
    const refetched = page.waitForResponse((r) => isListFetch(r), {timeout: T}).catch(() => null);
    await dialog.getByRole('button', {name: DOIS_TEXT.depositAllTitle, exact: true}).click();
    const response = await acted;
    await refetched;
    await expect(dialog).toBeHidden({timeout: T});
    await dois.expectListSettled();
    return {status: response.status(), body: await response.text().catch(() => null), window: windowText};
}
exports.depositAll = depositAll;

/**
 * The export files a deposit left in the install's `files_dir`/temp (read only).
 * An agency plugin writes one XML file per object it deposits and deletes it after
 * the post; a deposit that dies in the post (an exception, an unreachable agency)
 * leaves the file of the object it was depositing, one per try of the job. The
 * file's name says which object (`datacite-<date>-<time>-articles-<submission id>-…`,
 * `…-galleys-<galley id>-…`). Returns the names without their date and time, with
 * the DOI each file's XML carries (null when it carries none), counted.
 *
 * @param {object} app the probe kit's bag
 * @returns {{file: string, doi: string|null, count: number}[]}
 */
function leftExportFiles(app) {
    const dir = tempDir(app);
    if (!dir) return [];
    const seen = new Map();
    for (const f of fs.readdirSync(dir).filter((n) => /\.xml$/.test(n)).sort()) {
        const xml = fs.readFileSync(path.join(dir, f), 'utf8');
        const doi = (xml.match(/<(?:\w+:)?identifier[^>]*>([^<]*)</) || xml.match(/<doi>([^<]*)</) || [])[1];
        const key = `${f.replace(/-\d{8}-\d{6}-/, '-')} | ${doi ? doi.trim() : ''}`;
        seen.set(key, (seen.get(key) || 0) + 1);
    }
    return [...seen].map(([key, count]) => ({file: key.split(' | ')[0], doi: key.split(' | ')[1] || null, count}));
}
exports.leftExportFiles = leftExportFiles;

/**
 * The install's `files_dir`/temp, where the agency plugins write their export
 * files (read from the fleet's config); null when it does not exist.
 *
 * @param {object} app the probe kit's bag
 * @returns {string|null}
 */
function tempDir(app) {
    const root = path.resolve(__dirname, '../../../../..');
    const config = fs.readFileSync(path.isAbsolute(app.configFile) ? app.configFile : path.join(root, app.configFile), 'utf8');
    const filesDir = (config.match(/^files_dir\s*=\s*"?([^"\n]+?)"?\s*$/m) || [])[1];
    const dir = filesDir ? path.join(filesDir, 'temp') : null;
    return dir && fs.existsSync(dir) ? dir : null;
}
exports.tempDir = tempDir;

/** The names of the DataCite export files (`dataciteplugin-*.xml`, `*.tar.gz`) in files_dir/temp now. */
function exportFileNames(app) {
    const dir = tempDir(app);
    return dir ? fs.readdirSync(dir).filter((n) => /^datacite.*\.(xml|tar\.gz)$/.test(n)).sort() : [];
}
exports.exportFileNames = exportFileNames;

/**
 * The XML records of the DataCite export files that appeared in files_dir/temp
 * since `before` (a list from exportFileNames()): "Export DOIs" writes one XML file
 * per object and packs two or more into a .tar.gz, and leaves the result there when
 * the endpoint answers an error. Read only: a tar is listed and its members read to
 * stdout. Each record: {file, member, identifier, xml}.
 *
 * @param {object} app the probe kit's bag
 * @param {string[]} before
 */
function newExportRecords(app, before) {
    const dir = tempDir(app);
    if (!dir) return [];
    const out = [];
    for (const f of exportFileNames(app).filter((n) => !before.includes(n))) {
        const full = path.join(dir, f);
        const members = f.endsWith('.tar.gz')
            ? execFileSync('tar', ['-tzf', full], {encoding: 'utf8'}).split('\n').filter(Boolean).map((m) => [m, execFileSync('tar', ['-xzOf', full, m], {encoding: 'utf8'})])
            : [[f, fs.readFileSync(full, 'utf8')]];
        for (const [member, xml] of members) {
            const id = xml.match(/<identifier[^>]*identifierType="DOI"[^>]*?(?:\/>|>([^<]*)<\/identifier>)/);
            out.push({file: f.replace(/-\d{8}-\d{6}-/, '-'), member: member.replace(/-\d{8}-\d{6}-/, '-'), identifier: id ? (id[1] || '') : null, xml});
        }
    }
    return out;
}
exports.newExportRecords = newExportRecords;

/**
 * DataCite's own schema check, run offline on one record: the same
 * DOMDocument::schemaValidate() against the same address the plugin's filter
 * declares (xml::schema(http://schema.datacite.org/meta/kernel-4/metadata.xsd),
 * lib/pkp XMLTypeDescription), in a PHP CLI outside the install, which fetches the
 * schema directly (the test installs' [proxy] is a dead port). Returns
 * {valid, errors}; a schema file that fails to load is fetched again.
 *
 * @param {string} xml
 */
function validateDatacite(xml) {
    const code = [
        'libxml_use_internal_errors(true);',
        '$d = new DOMDocument();',
        '$d->loadXML(stream_get_contents(STDIN));',
        "$ok = $d->schemaValidate('http://schema.datacite.org/meta/kernel-4/metadata.xsd');",
        "echo json_encode(['valid' => $ok, 'errors' => array_values(array_map(fn ($e) => 'line ' . $e->line . ': ' . trim($e->message), libxml_get_errors()))]);",
    ].join(' ');
    // A schema file DataCite's host fails to serve is a fetch error, not a verdict: try again, three times at most
    let result;
    for (let n = 0; n < 3; n++) {
        result = JSON.parse(execFileSync('php', ['-r', code], {input: xml, encoding: 'utf8', timeout: 120_000}));
        if (!result.errors.some((e) => /failed to load|Failed to locate/i.test(e))) break;
    }
    return result;
}
exports.validateDatacite = validateDatacite;

const REPO = path.resolve(__dirname, '../../../../..');
const flatten = (s, n = 400) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));

/**
 * The job tool's precondition, as an administrator sets it in config.inc.php:
 * `[queues] job_runner = Off`, so a queued deposit waits for the job tool
 * instead of running at the end of the next web request. The fleet's reset
 * writes the config afresh (`On`, as the dataset ships it), so every walk
 * sets it. Returns the value before and after.
 *
 * @param {object} app the probe kit's bag
 */
function holdQueue(app) {
    const file = path.isAbsolute(app.configFile) ? app.configFile : path.join(REPO, app.configFile);
    const text = fs.readFileSync(file, 'utf8');
    const m = /^job_runner\s*=\s*(\S+)/m.exec(text);
    if (!m) throw new Error(`no job_runner line in ${app.configFile}`);
    if (m[1] !== 'Off') fs.writeFileSync(file, text.replace(/^job_runner\s*=.*$/m, 'job_runner = Off'));
    return {before: m[1], after: 'Off'};
}
exports.holdQueue = holdQueue;

/**
 * The install's command-line job tool, as an administrator's cron job or
 * worker runs it: `php lib/pkp/tools/jobs.php run` in the app's directory
 * under the install's config. Returns its exit code and output.
 *
 * @param {object} app the probe kit's bag
 */
function runJobTool(app) {
    const file = path.isAbsolute(app.configFile) ? app.configFile : path.join(REPO, app.configFile);
    try {
        const out = execFileSync('php', ['lib/pkp/tools/jobs.php', 'run'], {
            cwd: app.root, env: {...process.env, PKP_CONFIG_FILE: file}, encoding: 'utf8', timeout: 180_000,
        });
        return {code: 0, output: flatten(out, 1500)};
    } catch (e) {
        return {code: e.status, output: flatten(`${e.stdout || ''}${e.stderr || ''}`, 1500)};
    }
}
exports.runJobTool = runJobTool;
