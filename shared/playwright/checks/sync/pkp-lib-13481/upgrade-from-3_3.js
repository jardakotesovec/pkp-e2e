// PR review check — pkp/pkp-lib#11663 on `main`: pkp-lib#13481 + submodule-only ojs#5917, omp#2500,
// ops#1441 (the `main` twin of pkp-lib#12082 on stable-3_5_0). The change is one call in the 3.4
// upgrade migration PKPI7014_DoiMigration::_migrateDoiSettingsToContext(), which only an upgrade
// from 3.3 runs, so the suites never reach it: this check upgrades PKP's 3.3 default dataset with
// the checkout's code, once per case, and records what the upgrade tool says and what the
// journal, press or server then holds. Drives the dataset fleet (it reloads the database):
//
//   npm run fetch-datasets -- --line stable-3_3_0
//   PKP_E2E_DATASET_BRANCH=stable-3_3_0 npm run fleet-prep -- --feature pr13481 --dataset --reset
//   PROBE_FEATURE=pr13481 PROBE_AGENT=<id> node bin/probe.js all \
//     shared/playwright/checks/sync/pkp-lib-13481/upgrade-from-3_3.js
//
// The fleet-prep line is the control: the dataset as PKP ships it (no DOI plugin settings)
// upgraded from 3.3. The cases then reload the 3.3 dump and plant, before the upgrade:
//   - the DOI plugin's own 3.3 settings for the one context, as 3.3's plugin form saves them
//     (plugin_settings, `doipubidplugin`: pluginRows() below, the prefix PLUGIN_PREFIX), and
//   - a DOI assigned on 3.3 (EXISTING_DOI as `pub-id::doi` on the first published submission), and
//   - `plugin-only`: nothing more;
//   - `leftover-same`: a `doiPrefix` row already in the context's settings table, same value
//     (the issue's "Duplicate entry '2--doiPrefix'");
//   - `leftover-different`: that row with LEFTOVER_PREFIX, another value.
// Facts go to result-<pkp-lib sha>-<app>.json (the tool's exit code and error line, the context's
// DOI settings after it, the 3.3 DOI as the upgrade left it, the "DOI Prefix" box of Settings ›
// Distribution › DOIs as `dbarnes`, and the DOI the DOIs page's "Assign DOIs" then gives the first
// item without one);
// the tool's whole output to upgrade-<sha>-<case>-<app>.log; no assertions.
const {execFileSync, spawnSync} = require('child_process');
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, idle, shot, record, outFile} = require('../../../probe');
const {DoiSettings, DoisPage} = require('../../../pages/DoisPages');

process.env.PKP_E2E_DATASET_BRANCH = process.env.PKP_E2E_DATASET_BRANCH || 'stable-3_3_0';
const {datasetFleet, loadDump, dropStaleUsageLogs, campaignCredentials, contextTables, query} = require('../../../dataset');

const PLUGIN_PREFIX = '10.1234';
const LEFTOVER_PREFIX = '10.9999';
const EXISTING_DOI = `${PLUGIN_PREFIX}/existing.1`;
const CASES = [
    {name: 'plugin-only', leftover: null},
    {name: 'leftover-same', leftover: PLUGIN_PREFIX},
    {name: 'leftover-different', leftover: LEFTOVER_PREFIX},
];
const only = (process.env.CASES || '').split(',').filter(Boolean);

// The rows 3.3 writes when a manager enables the "DOI" plugin and saves its settings with
// "Articles" (a press: "Monographs", a server: "Preprints") ticked, the prefix typed and "Use
// default patterns." chosen: LazyLoadPlugin::setEnabled() and DOISettingsForm::execute(), which
// stores every field of _getFormFields() (an unticked box as 0, an empty pattern as '').
function pluginRows(appName) {
    const kinds = {ojs: ['Issue', 'Publication', 'Representation'], omp: ['Publication', 'Chapter', 'Representation', 'SubmissionFile'], ops: ['Publication', 'Representation']}[appName];
    return [
        ['enabled', '1', 'bool'],
        ...kinds.map((kind) => [`enable${kind}Doi`, kind === 'Publication' ? '1' : '0', 'bool']),
        ...(appName === 'ops' ? [['enablePublicationDoiAutoAssign', '0', 'bool']] : []),
        ['doiPrefix', PLUGIN_PREFIX, 'string'],
        ['doiSuffix', 'default', 'string'],
        ...kinds.map((kind) => [`doi${kind}SuffixPattern`, '', 'string']),
    ];
}

forEachApp(async (app) => {
    if (!app.dataset) throw new Error('this check drives a dataset fleet: fleet-prep --dataset (see the header)');
    const fleet = datasetFleet(app.name, app.dataset);
    const root = path.resolve(fleet.root);
    const sha = execFileSync('git', ['-C', path.join(root, 'lib/pkp'), 'rev-parse', '--short=10', 'HEAD'], {encoding: 'utf8'}).trim();
    const migration = fs.readFileSync(path.join(root, 'lib/pkp/classes/migration/upgrade/v3_4_0/PKPI7014_DoiMigration.php'), 'utf8');
    // the call the migration makes with the plugin's settings: insert, insertOrIgnore or upsert
    const call = (migration.match(/prepareSuffixPatternsForInsert\(\$data, \$insertData\);[\s\S]{0,200}?DB::table\(\$this->getContextSettingsTable\(\)\)->(\w+)\(/) || [])[1] || '?';
    const R = {app: app.name, pkpLib: sha, call, dataset: fleet.source.replace(/^.*checkouts\//, 'checkouts/'), cases: []};

    for (const c of CASES.filter((x) => !only.length || only.includes(x.name))) {
        const facts = {case: c.name, pluginPrefix: PLUGIN_PREFIX, leftoverPrefix: c.leftover};
        // 3.3's database and files afresh
        loadDump(fleet, campaignCredentials(fleet));
        fs.rmSync(fleet.filesDir, {recursive: true, force: true});
        fs.cpSync(path.join(fleet.source, 'files'), fleet.filesDir, {recursive: true});
        dropStaleUsageLogs(fleet); // the 3.4 pre-flight check refuses the dataset's own usage event log
        fs.rmSync(fleet.cacheDir, {recursive: true, force: true});
        fs.mkdirSync(fleet.cacheDir, {recursive: true});
        const before = contextTables(fleet); // OPS 3.3 keeps its servers in `journals`
        const contextId = query(fleet, `SELECT ${before.id} FROM ${before.table} ORDER BY 1 LIMIT 1`)[0][0];
        facts.versionLoaded = query(fleet, "SELECT major || '.' || minor || '.' || revision || '.' || build FROM versions WHERE current = 1 AND product_type = 'core'")[0][0];
        for (const [name, value, type] of pluginRows(app.name)) {
            query(fleet, `INSERT INTO plugin_settings (plugin_name, context_id, setting_name, setting_value, setting_type) VALUES ('doipubidplugin', ${contextId}, '${name}', '${value}', '${type}')`);
        }
        // a DOI the journal assigned on 3.3: `pub-id::doi` on the first published submission's publication
        const [existingSubmission, existingPublication] = query(fleet, 'SELECT s.submission_id, p.publication_id FROM submissions s JOIN publications p ON p.publication_id = s.current_publication_id WHERE s.status = 3 ORDER BY s.submission_id LIMIT 1')[0];
        query(fleet, `INSERT INTO publication_settings (publication_id, locale, setting_name, setting_value) VALUES (${existingPublication}, '', 'pub-id::doi', '${EXISTING_DOI}')`);
        if (c.leftover) {
            query(fleet, `INSERT INTO ${before.settings} (${before.id}, locale, setting_name, setting_value, setting_type) VALUES (${contextId}, '', 'doiPrefix', '${c.leftover}', 'string')`);
        }

        const run = spawnSync('php', ['tools/upgrade.php', 'upgrade'], {
            cwd: root,
            env: {...process.env, PKP_CONFIG_FILE: path.resolve(fleet.configFile)},
            encoding: 'utf8',
            maxBuffer: 64 * 1024 * 1024,
        });
        const output = `${run.stdout || ''}${run.stderr || ''}`;
        fs.writeFileSync(outFile(`upgrade-${sha}-${c.name}.log`), output);
        facts.exit = run.status;
        facts.said = ((output.match(/^(ERROR: Upgrade failed: .*|Successfully upgraded to version .*)$/m) || [])[1] || output.trim().split('\n').pop() || '').slice(0, 260);
        facts.versionAfter = query(fleet, "SELECT major || '.' || minor || '.' || revision || '.' || build FROM versions WHERE current = 1 AND product_type = 'core'")[0][0];

        if (run.status === 0) {
            const after = contextTables(fleet);
            facts.contextSettings = Object.fromEntries(
                query(fleet, `SELECT setting_name, setting_value FROM ${after.settings} WHERE ${after.id} = ${contextId} AND (setting_name LIKE 'doi%' OR setting_name IN ('enableDois', 'enabledDoiTypes', 'useDefaultDoiSuffix')) ORDER BY 1`),
            );
            facts.existingDoi = {before: EXISTING_DOI, after: (query(fleet, `SELECT d.doi FROM publications p JOIN dois d ON d.doi_id = p.doi_id WHERE p.publication_id = ${existingPublication}`)[0] || [null])[0]};
            facts.pluginRowsLeft = Number(query(fleet, "SELECT count(*) FROM plugin_settings WHERE plugin_name = 'doipubidplugin'")[0][0]);
            // what the manager sees: Settings › Distribution › DOIs › Setup, the "DOI Prefix" box
            const {page, close} = await launch(app);
            try {
                await signIn(page, 'dbarnes', {contextPath: app.contextPath});
                const settings = new DoiSettings(page, app.contextPath);
                await settings.goto('Setup');
                await idle(page);
                facts.prefixBox = await settings.prefixBox().inputValue();
                facts.enableBox = await settings.enableBox().isChecked();
                await settings.prefixBox().scrollIntoViewIfNeeded();
                await shot(page, `doi-setup-${sha}-${c.name}`);
                // and what a DOI assigned from now on looks like: the DOIs page, the first item, "Assign DOIs"
                const dois = new DoisPage(page, app.contextPath);
                await dois.goto();
                const ids = await dois.rows().evaluateAll((rows) => rows.map((row) => (row.id || '').replace(/^list-item-submission-/, '')));
                const id = ids.find((x) => x && x !== String(existingSubmission)); // the first item that has no DOI yet
                const response = await dois.runBulk('Assign DOIs', [id]);
                facts.assign = {submissionId: id, status: response.status()};
                facts.assign.doi = (query(fleet, `SELECT d.doi FROM dois d JOIN publications p ON p.doi_id = d.doi_id WHERE p.submission_id = ${Number(id)} ORDER BY d.doi_id DESC LIMIT 1`)[0] || [null])[0];
                await shot(page, `dois-page-${sha}-${c.name}`);
            } catch (error) {
                facts.pageError = String(error.message).split('\n')[0];
            } finally {
                await close();
            }
        }
        console.log(`[${app.name}] pkp-lib ${sha} (${call}) ${c.name}: exit ${facts.exit} · ${facts.said}${facts.contextSettings ? ` · doiPrefix=${facts.contextSettings.doiPrefix} · box "${facts.prefixBox}" · 3.3 DOI now ${facts.existingDoi.after} · assigned ${facts.assign ? facts.assign.doi : facts.pageError}` : ''}`);
        R.cases.push(facts);
    }
    record(`result-${sha}`, R);
});
