const {dbName} = require('../../../../../bin/apps.js'); // the slot's and line's own test DB (harness.md "Slots")
// PR review of pkp-lib#12899 (pkp-lib#13751 main, #13752 stable-3_5_0), the upgrade half: the
// 3.5.0 step I7135 reads the old ROR plugin's free-text `rorId` and keeps it as the affiliation's
// ROR only when normalizeRor() accepts it (and, with the registry cache complete, the cache holds
// it). The PR lowercases the value first and checks the new character class. The fleets never
// upgrade, so migrateAffiliations() is driven directly with the pkp-lib-13317 kit's driver, on
// one author row per case, every case with an affiliation text, once with the cache marked
// complete and once marked failed. Run (OJS, the campaign fleet; the code is shared lib/pkp):
//   npm run fleet-prep -- --feature pr12899m --reset --apps ojs
//   PROBE_FEATURE=pr12899m PROBE_AGENT=mig PROBE_RUN=<base|head> node bin/probe.js ojs shared/playwright/checks/sync/pkp-lib-13751/migration.js
// Records `migration-<run>-<app>-{complete,failed}.json`; one line per case on stdout, with the
// result the PR head should give (`head`) and the base's (`base`).
const {execFileSync} = require('child_process');
const path = require('path');
const fs = require('fs');
const {forEachApp, record, tag} = require('../../../probe');

const CACHED = 'https://ror.org/0cached12';
const NAME = {rows: 1, ror: null, name: true};
const ROR = (ror) => ({rows: 1, ror, name: false});
// with the cache failed an id the cache cannot confirm is kept beside the text (pkp-lib-13317's table)
const KEPT = (ror) => ({rows: 1, ror, name: true});
// [rorId as the old plugin stored it, {complete, failed} at the head, {complete, failed} at the base]
const CASES = [
    ['https://ror.org/0cached12', {c: ROR(CACHED), f: ROR(CACHED)}, {c: ROR(CACHED), f: ROR(CACHED)}],
    ['https://ror.org/0CACHED12', {c: ROR(CACHED), f: ROR(CACHED)}, {c: NAME, f: KEPT('https://ror.org/0CACHED12')}],
    ['0CACHED12', {c: ROR(CACHED), f: ROR(CACHED)}, {c: NAME, f: KEPT('https://ror.org/0CACHED12')}],
    ['HTTPS://ROR.ORG/0cached12', {c: ROR(CACHED), f: ROR(CACHED)}, {c: NAME, f: NAME}],
    ['http://ror.org/0cached12/', {c: ROR(CACHED), f: ROR(CACHED)}, {c: ROR(CACHED), f: ROR(CACHED)}],
    ['https://ror.org/0a/b-c.12', {c: NAME, f: NAME}, {c: NAME, f: KEPT('https://ror.org/0a/b-c.12')}],
    ['https://ror.org/0cachi012', {c: NAME, f: NAME}, {c: NAME, f: KEPT('https://ror.org/0cachi012')}],
    ['https://ror.org/0typq0099', {c: NAME, f: KEPT('https://ror.org/0typq0099')}, {c: NAME, f: KEPT('https://ror.org/0typq0099')}],
];

function psql(app, sql) {
    return execFileSync('psql', ['-h', '127.0.0.1', '-U', 'e2e', `${dbName(app.name)}`, '-Atqc', sql], {
        env: {...process.env, PGPASSWORD: 'e2e'}, encoding: 'utf8',
    }).trim();
}

forEachApp(async (app) => {
    const run = process.env.PROBE_RUN || 'run';
    const scratch = tag('mig12899');
    const author = `${scratch}au`;
    await app.api.createContext({tag: scratch, users: [{username: author, roles: ['author']}]});
    const authorIds = [];
    for (let i = 0; i < CASES.length; i++) {
        const sub = await app.api.createSubmission({tag: `${scratch}s${i}`, context: scratch, submitter: author, submitted: false});
        const submissionId = sub.submissionId || sub.id || (sub.submission && sub.submission.id);
        authorIds.push(Number(psql(app, `select a.author_id from authors a join publications p on p.publication_id=a.publication_id where p.submission_id=${submissionId} order by a.author_id limit 1`)));
    }
    const cases = CASES.map(([rorId, head, base], i) => ({authorId: authorIds[i], affiliation: {en: `Legacy University ${scratch}`}, rorId, head, base}));
    let mismatches = 0;
    for (const complete of [true, false]) {
        const caseFile = path.join(process.cwd(), '.reports', 'sync', `pr12899-cases-${app.name}.json`);
        fs.mkdirSync(path.dirname(caseFile), {recursive: true});
        fs.writeFileSync(caseFile, JSON.stringify({complete, cases, cache: [CACHED]}));
        const out = execFileSync('php', [path.resolve(__dirname, '../pkp-lib-13317/migrate-driver.php'), caseFile], {
            cwd: path.resolve(app.root),
            env: {...process.env, PKP_CONFIG_FILE: path.resolve(app.root, 'config.test.inc.php')},
            encoding: 'utf8',
        });
        const parsed = JSON.parse(out);
        for (const r of parsed.results) {
            const got = r.rows.length === 1 ? {rows: 1, ror: r.rows[0].ror, name: Object.keys(r.rows[0].names).length > 0} : {rows: r.rows.length};
            const want = (side) => r.case[side][complete ? 'c' : 'f'];
            const same = (e) => e.rows === got.rows && (e.rows === 0 || (e.ror === got.ror && e.name === got.name));
            r.got = got;
            r.verdict = same(want('head')) ? 'as the head should' : same(want('base')) ? 'as the base did' : 'NEITHER';
            if (run === 'head' && r.verdict !== 'as the head should') mismatches++;
            console.log(`[${app.name} ${run}] cache ${complete ? 'complete' : 'failed  '} rorId=${JSON.stringify(r.case.rorId).padEnd(30)} → ror ${JSON.stringify(got.ror)} name ${got.name} · ${r.verdict}`);
        }
        record(`migration-${run}-${app.name}-${complete ? 'complete' : 'failed'}`, parsed);
    }
    if (run === 'head') console.log(`[${app.name} head] ${mismatches} case(s) off the head's expectation`);
});
