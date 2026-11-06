// PR review check — pkp/pkp-lib#13562: the 3.5 upgrade's I9707_WeblateUILocales migrated
// `supportedDefaultSubmissionLocale` by the value of whichever context's row the database returned
// first. PRs: stable-3_5_0 pkp-lib#13733 + ojs#6036, omp#2556, ops#1486; main pkp-lib#13742 +
// ojs#6041, omp#2560, ops#1490 (one pkp-lib patch on both lines). They (1) map the setting per row
// in I9707 (the 3.1–3.4.9.9 block) and (2) add I13562_RepairWeblateUILocales to the
// `3.5.0.0`–`3.5.0.99` block, for installs already on 3.5. Only an upgrade runs either, so the
// suites never reach them: this check loads PKP's default dataset, plants the state, runs
// `php tools/upgrade.php upgrade` with the checkout's code under the dataset fleet's config and
// records what the tool says, what the install then holds and what the submission wizard does.
// Drives a dataset fleet (it reloads the database). MODE picks the part:
//
//   MODE=fix      from the stable-3_4_0 dump: two more contexts added by SQL (copies of the first
//                 context's settings, own path and primary locale), then the upgrade; per context
//                 the default submission locale and submission locales after it. CASES:
//                 `first-en`     context 1 `en` (the dataset's), 2 `sr@latin`, 3 `fr_FR`
//                 `first-sr`     context 1 `sr@latin` (primary; its locale lists gain it), 2 `en`, 3 `fr_FR`
//   MODE=prepare  (stable-3_5_0 line only, the line's runtime code, which the PRs leave alone) from
//                 the stable-3_5_0 dump: the state a 3.5 site holds after the buggy upgrade (CASES
//                 below), the site made to look upgraded from 3.4 (a 3.4.0.9 core row dated
//                 2025-01-01, the 3.5 row dated 2025-06-01), one submitted submission moved to the
//                 broken language by SQL (its title, abstract and contributors' names with it), and
//                 a draft started through the wizard's own API call as `dbarnes` (the start form
//                 asks no language in a one-language context), whose wizard page is then opened.
//                 The database is saved to .reports/<feature>/snap/<app>-<case>.sql for MODE=repair.
//                 `left`  one submission language `sr_Latn`, default left at `sr@latin` (the issue)
//                 `over`  one submission language `en`, default overwritten with `sr_Latn` (another
//                         context's value; the second case of the issue)
//                 `bs`    one submission language `bs_Latn`, default left at `bs` (an old code that
//                         is still a valid locale in 3.5)
//                 `over` also gets a second submitted submission whose title exists in both `sr_Latn`
//                 and `en` with different text (the repair's "conflict" path).
//   MODE=repair   loads a MODE=prepare snapshot (SNAP_FEATURE names the feature that saved it,
//                 default r13562-3_5) into the fleet, on stable-3_5_0 rewrites the current core
//                 row to 3.5.0.5 (a site on 3.5.0-5 taking the next 3.5.0 release), upgrades, reads
//                 the context's settings and the planted submissions, opens the drafts' wizards and
//                 starts a new draft as `dbarnes`; then runs the repair class a second time
//                 (`lib/pkp/tools/migration.php … up`, when the checkout has it) and compares.
//
//   PKP_E2E_LINE=stable-3_5_0 PKP_E2E_DATASET_BRANCH=stable-3_5_0 npm run fleet-prep -- --feature r13562-3_5 --dataset 2 --reset
//   PKP_E2E_LINE=stable-3_5_0 MODE=prepare PROBE_FEATURE=r13562-3_5 PROBE_AGENT=<id> node bin/probe.js all <this file>
//   [PKP_E2E_LINE=stable-3_5_0] MODE=repair|fix PROBE_FEATURE=<feature> PROBE_AGENT=<id> node bin/probe.js all <this file>
//
// Facts go to result-<mode>-<pkp-lib sha>.json, the tool's output to upgrade-<mode>-<sha>-<case>.log.
// No assertions. Reads fixed when: MODE=fix gives every context its own mapped default (`sr_Latn`,
// `fr`, `en`) in both cases; MODE=repair leaves each case's default inside its submission
// languages, every planted submission and draft in a submission language, every wizard page 200
// with no "Fatal error", and the second run changes nothing.
const {execFileSync, spawnSync} = require('child_process');
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, record, outFile, outDir} = require('../../../probe');
const {datasetFleet, loadDump, dropStaleUsageLogs, campaignCredentials, contextTables, query} = require('../../../dataset');

const MODE = process.env.MODE || 'repair';
const only = (process.env.CASES || '').split(',').filter(Boolean);
const PRODUCT = {ojs: 'ojs2', omp: 'omp', ops: 'ops'};
const REPAIR_CASES = {
    left: {submissionLocales: ['sr_Latn'], def: 'sr@latin', moved: 'sr@latin'},
    over: {submissionLocales: ['en'], def: 'sr_Latn', moved: 'sr_Latn', conflict: true},
    bs: {submissionLocales: ['bs_Latn'], def: 'bs', moved: 'bs'},
};
const FIX_CASES = {
    'first-en': [null, 'sr@latin', 'fr_FR'],
    'first-sr': ['sr@latin', 'en', 'fr_FR'],
};
const AUTHOR = {ojs: 'ccorino', omp: 'aclark', ops: 'ccorino'}; // an author of the dataset's context
const q1 = (fleet, sql) => (query(fleet, sql)[0] || [null])[0];
const sqlStr = (s) => `'${String(s).replace(/'/g, "''")}'`;
const coreVersion = (fleet, app) => q1(fleet, `SELECT major||'.'||minor||'.'||revision||'.'||build FROM versions WHERE current = 1 AND product_type = 'core' AND product = '${PRODUCT[app]}'`);

const firstSection = (fleet) => (fleet.name === 'omp' ? null : Number(q1(fleet, 'SELECT section_id FROM sections ORDER BY seq, section_id LIMIT 1')));

function freshFiles(fleet, source) {
    fs.rmSync(fleet.filesDir, {recursive: true, force: true});
    fs.cpSync(path.join(source, 'files'), fleet.filesDir, {recursive: true});
    dropStaleUsageLogs(fleet);
    fs.rmSync(fleet.cacheDir, {recursive: true, force: true});
    fs.mkdirSync(fleet.cacheDir, {recursive: true});
}

function upgrade(fleet, root, label) {
    const run = spawnSync('php', ['tools/upgrade.php', 'upgrade'], {
        cwd: root,
        env: {...process.env, PKP_CONFIG_FILE: path.resolve(fleet.configFile)},
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
    });
    const output = `${run.stdout || ''}${run.stderr || ''}`;
    fs.writeFileSync(outFile(`upgrade-${label}.log`), output);
    return {
        exit: run.status,
        said: ((output.match(/^(ERROR: Upgrade failed: .*|Successfully upgraded to version .*)$/m) || [])[1] || output.trim().split('\n').pop() || '').slice(0, 300),
        repairLines: output.split('\n').filter((l) => /13562|Removed \d+ rows/.test(l)).map((l) => l.slice(0, 400)),
    };
}

function contextLocales(fleet) {
    const t = contextTables(fleet);
    return query(fleet, `SELECT c.${t.id}, c.path, c.primary_locale,
        (SELECT setting_value FROM ${t.settings} s WHERE s.${t.id} = c.${t.id} AND setting_name = 'supportedDefaultSubmissionLocale'),
        (SELECT setting_value FROM ${t.settings} s WHERE s.${t.id} = c.${t.id} AND setting_name = 'supportedSubmissionLocales')
        FROM ${t.table} c ORDER BY 1`).map(([id, p, primary, def, subm]) => ({id: Number(id), path: p, primary, def, submissionLocales: subm}));
}

function submissionFacts(fleet, ids) {
    return ids.map((id) => {
        const [locale, progress, dateSubmitted] = query(fleet, `SELECT locale, submission_progress, date_submitted FROM submissions WHERE submission_id = ${id}`)[0] || [];
        const titles = query(fleet, `SELECT ps.locale, ps.setting_value FROM publication_settings ps JOIN publications p ON p.publication_id = ps.publication_id WHERE p.submission_id = ${id} AND ps.setting_name = 'title' ORDER BY 1`).map(([l, v]) => `${l}=${v.slice(0, 40)}`);
        const authorNameLocales = query(fleet, `SELECT DISTINCT a_s.locale || '=' || a_s.setting_value FROM author_settings a_s JOIN authors a ON a.author_id = a_s.author_id JOIN publications p ON p.publication_id = a.publication_id WHERE p.submission_id = ${id} AND a_s.setting_name = 'givenName' ORDER BY 1`).map((r) => r[0]);
        return {id, locale, progress, dateSubmitted, titles, authorNameLocales};
    });
}

// The wizard's own start call (StartSubmission's action, `POST api/v1/submissions`) from a signed-in page
async function startDraft(page, app, title, fallbackSectionId) {
    await page.goto('/index.php/publicknowledge/submission');
    const html = await page.content();
    const section = (html.match(/"name":"(sectionId|seriesId)"[\s\S]{0,2000}?"options":\[\{"value":(\d+)/) || []);
    const body = {submissionRequirements: true, privacyConsent: true};
    if (section[1] === 'sectionId') body.sectionId = Number(section[2]);
    // OPS's form hides a lone section and sends its id: the context's first section
    else if (app !== 'omp') body.sectionId = fallbackSectionId;
    if (app === 'omp') body.workType = 1;
    // a one-language context's form has no locale field, so none is sent: the API takes the context's default.
    // (A string title is not stored by the API, so the drafts carry no title: the walk reads their locale.)
    return page.evaluate(async ({body, title}) => {
        const token = pkp.currentUser.csrfToken;
        body.title = title;
        const r = await fetch(`${location.origin}/index.php/publicknowledge/api/v1/submissions`, {method: 'POST', headers: {'Content-Type': 'application/json', 'X-Csrf-Token': token}, body: JSON.stringify(body)});
        const text = await r.text();
        let json = null;
        try { json = JSON.parse(text); } catch { /* not JSON */ }
        return {status: r.status, id: json && json.id, locale: json && json.locale, error: json && !json.id ? text.slice(0, 300) : undefined};
    }, {body, title});
}

async function openWizard(page, id) {
    const r = await page.goto(`/index.php/publicknowledge/submission?id=${id}`);
    const text = await page.locator('body').innerText().catch(() => '');
    const fatal = (text.match(/(Fatal error|Uncaught [^\n]{0,200}|must be of type string, null given)/) || [])[0] || null;
    // the PHP fatal itself goes to the fleet's server log (the page is a bare 500)
    return {status: r.status(), fatal, rendered: /Upload Files|Details|Contributors/.test(text)};
}

forEachApp(async (app) => {
    if (!app.dataset) throw new Error('this check drives a dataset fleet: fleet-prep --dataset (see the header)');
    const fleet0 = datasetFleet(app.name, app.dataset);
    const root = path.resolve(fleet0.root);
    const sha = execFileSync('git', ['-C', path.join(root, 'lib/pkp'), 'rev-parse', '--short=10', 'HEAD'], {encoding: 'utf8'}).trim();
    const appSha = execFileSync('git', ['-C', root, 'rev-parse', '--short=10', 'HEAD'], {encoding: 'utf8'}).trim();
    const hasRepair = fs.existsSync(path.join(root, 'classes/migration/upgrade/v3_5_0/I13562_RepairWeblateUILocales.php'));
    const line = app.line || 'main';
    const R = {app: app.name, line, mode: MODE, pkpLib: sha, appSha, hasRepair, code: (fs.readFileSync(path.join(root, 'dbscripts/xml/version.xml'), 'utf8').match(/<release>([^<]+)/) || [])[1], cases: []};

    if (MODE === 'fix') {
        const fleet = {...fleet0, source: fleet0.source.replace(/\/[^/]+\/pgsql$/, '/stable-3_4_0/pgsql')};
        for (const [name, locales] of Object.entries(FIX_CASES).filter(([n]) => !only.length || only.includes(n))) {
            const facts = {case: name};
            loadDump(fleet, campaignCredentials(fleet));
            freshFiles(fleet, fleet.source);
            const t = contextTables(fleet);
            facts.versionLoaded = coreVersion(fleet, app.name);
            const [c1] = query(fleet, `SELECT ${t.id}, path FROM ${t.table} ORDER BY 1 LIMIT 1`)[0];
            for (let i = 0; i < locales.length; i++) {
                const loc = locales[i];
                let id = Number(c1);
                if (i > 0) {
                    id = Number(q1(fleet, `INSERT INTO ${t.table} (path, seq, primary_locale, enabled) VALUES ('ctx${i + 1}', ${i + 1}, ${sqlStr(loc)}, 1) RETURNING ${t.id}`));
                    query(fleet, `INSERT INTO ${t.settings} (${t.id}, locale, setting_name, setting_value) SELECT ${id}, locale, setting_name, setting_value FROM ${t.settings} WHERE ${t.id} = ${c1}`);
                    for (const s of ['supportedLocales', 'supportedFormLocales', 'supportedSubmissionLocales']) {
                        query(fleet, `UPDATE ${t.settings} SET setting_value = ${sqlStr(JSON.stringify([loc]))} WHERE ${t.id} = ${id} AND setting_name = '${s}'`);
                    }
                } else if (loc) {
                    query(fleet, `UPDATE ${t.table} SET primary_locale = ${sqlStr(loc)} WHERE ${t.id} = ${id}`);
                    for (const s of ['supportedLocales', 'supportedFormLocales', 'supportedSubmissionLocales']) {
                        const cur = JSON.parse(q1(fleet, `SELECT setting_value FROM ${t.settings} WHERE ${t.id} = ${id} AND setting_name = '${s}'`) || '[]');
                        query(fleet, `UPDATE ${t.settings} SET setting_value = ${sqlStr(JSON.stringify([...new Set([...cur, loc])]))} WHERE ${t.id} = ${id} AND setting_name = '${s}'`);
                    }
                }
            }
            facts.before = contextLocales(fleet);
            Object.assign(facts, upgrade(fleet, root, `fix-${sha}-${name}`));
            facts.versionAfter = coreVersion(fleet, app.name);
            if (facts.exit === 0) facts.after = contextLocales(fleet);
            console.log(`[${app.name}] ${line} lib ${sha} fix ${name}: exit ${facts.exit} · ${facts.said} · ${(facts.after || []).map((c) => `${c.path}: default ${c.def} of ${c.submissionLocales} (primary ${c.primary})`).join(' | ')}`);
            R.cases.push(facts);
        }
        record(`result-fix-${sha}`, R);
        return;
    }

    if (MODE === 'prepare') {
        const snapDir = path.join(outDir(), '..', 'snap');
        fs.mkdirSync(snapDir, {recursive: true});
        for (const [name, c] of Object.entries(REPAIR_CASES).filter(([n]) => !only.length || only.includes(n))) {
            const facts = {case: name, ...c};
            loadDump(fleet0, campaignCredentials(fleet0));
            freshFiles(fleet0, fleet0.source);
            const t = contextTables(fleet0);
            const ctx = Number(q1(fleet0, `SELECT ${t.id} FROM ${t.table} ORDER BY 1 LIMIT 1`));
            const set = (n, v) => query(fleet0, `UPDATE ${t.settings} SET setting_value = ${sqlStr(v)} WHERE ${t.id} = ${ctx} AND setting_name = '${n}'`);
            set('supportedSubmissionLocales', JSON.stringify(c.submissionLocales));
            set('supportedDefaultSubmissionLocale', c.def);
            for (const n of ['supportedSubmissionMetadataLocales', 'supportedAddedSubmissionLocales']) {
                const cur = JSON.parse(q1(fleet0, `SELECT setting_value FROM ${t.settings} WHERE ${t.id} = ${ctx} AND setting_name = '${n}'`) || '[]');
                set(n, JSON.stringify([...new Set([...cur, ...c.submissionLocales])]));
            }
            // looks upgraded from 3.4: the first 3.5 row dated 2025-06-01
            const product = PRODUCT[app.name];
            query(fleet0, `UPDATE versions SET date_installed = '2025-06-01 00:00:00' WHERE product_type = 'core' AND product = '${product}' AND current = 1`);
            query(fleet0, `INSERT INTO versions (major, minor, revision, build, date_installed, current, product_type, product, product_class_name, lazy_load, sitewide) VALUES (3, 4, 0, 9, '2025-01-01 00:00:00', 0, 'core', '${product}', '', 0, 0)`);
            // submitted submissions moved to the broken language (the last two submitted ones)
            const submitted = query(fleet0, `SELECT submission_id FROM submissions WHERE context_id = ${ctx} AND date_submitted IS NOT NULL ORDER BY submission_id DESC LIMIT 2`).map((r) => Number(r[0]));
            const move = (id, keepEn) => {
                const pubs = `(SELECT publication_id FROM publications WHERE submission_id = ${id})`;
                query(fleet0, `UPDATE submissions SET locale = ${sqlStr(c.moved)} WHERE submission_id = ${id}`);
                if (keepEn) {
                    // title in both languages, different text
                    query(fleet0, `INSERT INTO publication_settings (publication_id, locale, setting_name, setting_value) SELECT publication_id, ${sqlStr(c.moved)}, setting_name, 'Naslov ' || setting_value FROM publication_settings WHERE publication_id IN ${pubs} AND locale = 'en' AND setting_name = 'title'`);
                } else {
                    query(fleet0, `UPDATE publication_settings SET locale = ${sqlStr(c.moved)} WHERE publication_id IN ${pubs} AND locale = 'en' AND setting_name IN ('title', 'abstract')`);
                    query(fleet0, `UPDATE author_settings SET locale = ${sqlStr(c.moved)} WHERE locale = 'en' AND setting_name IN ('givenName', 'familyName') AND author_id IN (SELECT author_id FROM authors WHERE publication_id IN ${pubs})`);
                }
            };
            move(submitted[0], false);
            if (c.conflict) move(submitted[1], true);
            facts.submitted = c.conflict ? submitted : [submitted[0]];
            // a draft through the wizard, as dbarnes
            const {page, close} = await launch(app);
            try {
                await signIn(page, 'dbarnes', {contextPath: 'publicknowledge'});
                facts.start = await startDraft(page, app.name, `Draft ${name}`, firstSection(fleet0));
                if (facts.start.id) facts.wizardBefore = await openWizard(page, facts.start.id);
            } catch (error) {
                facts.pageError = String(error.message).split('\n')[0];
            } finally {
                await close();
            }
            // and one as an author, whose contributor record is copied from the profile (newAuthorFromUser)
            const author = AUTHOR[app.name];
            const second = await launch(app);
            try {
                await signIn(second.page, author, {contextPath: 'publicknowledge'});
                facts.authorStart = await startDraft(second.page, app.name, `Author draft ${name}`, firstSection(fleet0));
                if (facts.authorStart.id) facts.authorWizardBefore = await openWizard(second.page, facts.authorStart.id);
            } catch (error) {
                facts.authorPageError = String(error.message).split('\n')[0];
            } finally {
                await second.close();
            }
            facts.drafts = [facts.start, facts.authorStart].filter((s) => s && s.id).map((s) => s.id);
            facts.authorDraft = facts.authorStart && facts.authorStart.id;
            facts.state = submissionFacts(fleet0, [...facts.submitted, ...facts.drafts]);
            facts.contexts = contextLocales(fleet0);
            const snap = path.join(snapDir, `${app.name}-${name}`);
            fs.mkdirSync(snap, {recursive: true});
            const cred = campaignCredentials(fleet0);
            execFileSync('pg_dump', ['--no-owner', ...(cred.host ? ['-h', cred.host] : []), ...(cred.username ? ['-U', cred.username] : []), '-f', path.join(snap, 'database.sql'), fleet0.db], {env: {...process.env, ...(cred.password ? {PGPASSWORD: cred.password} : {})}});
            fs.writeFileSync(path.join(snap, 'facts.json'), JSON.stringify(facts, null, 2));
            console.log(`[${app.name}] prepare ${name}: start ${JSON.stringify(facts.start)} · wizard ${JSON.stringify(facts.wizardBefore)} · ${facts.state.map((s) => `${s.id}:${s.locale}${s.dateSubmitted ? '' : '(draft)'}`).join(' ')}`);
            R.cases.push(facts);
        }
        record(`result-prepare-${sha}`, R);
        return;
    }

    // MODE=repair
    const snapFeature = process.env.SNAP_FEATURE || 'r13562-3_5';
    const snapRoot = path.join(outDir(), '..', '..', snapFeature, 'snap');
    for (const name of Object.keys(REPAIR_CASES).filter((n) => !only.length || only.includes(n))) {
        const snap = path.join(snapRoot, `${app.name}-${name}`);
        const prep = JSON.parse(fs.readFileSync(path.join(snap, 'facts.json'), 'utf8'));
        const fleet = {...fleet0, source: snap};
        const facts = {case: name, def: prep.def, submissionLocales: prep.submissionLocales};
        loadDump(fleet, campaignCredentials(fleet));
        freshFiles(fleet, fleet0.source.replace(/\/[^/]+\/pgsql$/, '/stable-3_5_0/pgsql'));
        const relabel = () => query(fleet, `UPDATE versions SET revision = 0, build = 5 WHERE product_type = 'core' AND product = '${PRODUCT[app.name]}' AND current = 1 AND major = 3 AND minor = 5`);
        if (line === 'stable-3_5_0') relabel();
        facts.versionLoaded = coreVersion(fleet, app.name);
        const ids = [...prep.submitted, ...prep.drafts];
        Object.assign(facts, upgrade(fleet, root, `repair-${sha}-${name}`));
        facts.versionAfter = coreVersion(fleet, app.name);
        if (facts.exit === 0) {
            facts.contexts = contextLocales(fleet);
            facts.state = submissionFacts(fleet, ids);
            const {page, close} = await launch(app);
            try {
                await signIn(page, 'dbarnes', {contextPath: 'publicknowledge'});
                facts.wizards = {};
                for (const id of prep.drafts) facts.wizards[id] = await openWizard(page, id);
                facts.newDraft = await startDraft(page, app.name, `After ${name}`, firstSection(fleet));
                if (facts.newDraft.id) facts.newDraft.wizard = await openWizard(page, facts.newDraft.id);
            } catch (error) {
                facts.pageError = String(error.message).split('\n')[0];
            } finally {
                await close();
            }
            // the repair a second time
            if (hasRepair) {
                const before = JSON.stringify([contextLocales(fleet), submissionFacts(fleet, ids)]);
                const cls = `APP\\migration\\upgrade\\v3_5_0\\I13562_RepairWeblateUILocales`;
                const rerun = spawnSync('php', ['lib/pkp/tools/migration.php', cls, 'up'], {cwd: root, env: {...process.env, PKP_CONFIG_FILE: path.resolve(fleet.configFile)}, encoding: 'utf8'});
                fs.writeFileSync(outFile(`rerun-${sha}-${name}.log`), `${rerun.stdout || ''}${rerun.stderr || ''}`);
                facts.rerun = {exit: rerun.status, unchanged: before === JSON.stringify([contextLocales(fleet), submissionFacts(fleet, ids)]), tail: `${rerun.stdout || ''}${rerun.stderr || ''}`.trim().split('\n').slice(-2).join(' / ').slice(0, 300)};
            }
        }
        console.log(`[${app.name}] ${line} lib ${sha} repair ${name}: ${facts.versionLoaded}→${facts.versionAfter} exit ${facts.exit} · default ${facts.contexts ? facts.contexts[0].def : '?'} · ${(facts.state || []).map((s) => `${s.id}:${s.locale}${s.dateSubmitted ? '' : '(draft)'} [${s.titles.join('; ')}]`).join(' ')} · wizards ${JSON.stringify(facts.wizards)} · new ${JSON.stringify(facts.newDraft)} · rerun ${JSON.stringify(facts.rerun)} · log ${facts.repairLines.length} lines`);
        R.cases.push(facts);
    }
    record(`result-repair-${sha}`, R);
});
