// U04 housekeeping 2026-10-21, chunk H21 (claim checker cc21d): incidentals row "a publish
// depositing a contributor's work twice". How many work deposits one on-screen publish sends to
// ORCID for a contributor with a verified iD on a member-API journal / preprint server, and
// whether the second arrives as a new work (POST) or as an update of the first (PUT).
// Runs on PKP's default test dataset (a dataset fleet, reset before each run; OJS submission 5
// "Genetic transformation of forest trees", contributor Diaga Diouf; OPS submission 1 "The
// influence of lactation …", contributor Carlo Corino).
//
// Per app (OJS, OPS; main and stable-3_5_0):
//   1. rvaca: Settings › Users & Roles › ORCID: "Enable ORCID functionality", "Member Sandbox",
//      a Client ID and Secret, "ORCID request log" "All", Save (screen).
//   2. The contributor's verified iD and member-scope token, as SQL writing exactly what
//      PKP\orcid\actions\VerifyIdentityWithOrcid::setIdentityData()/saveIdentityData() store
//      (ORCID's sign-in is the outside service that makes this state).
//   3. The fleet config's [proxy] lines at the work stand-in (work-stub.js, its own process),
//      and per MODE the job runner:
//        web     job_runner On as the dataset ships it: the fleet's web requests run the queue;
//                their PHP does not trust the stand-in's CA, so each attempt fails (cURL 60),
//                and orcid.log says what each deposit chose (POST / PUT …/work/<put-code>).
//        worker  job_runner Off; drainJobs(app) runs the queue from this process, trusting the
//                stand-in (on 3.5 the search-index and metadata jobs fail there: no context).
//        hybrid  job_runner Off for the publish; the first deposit alone by the CLI worker
//                (trusted: ORCID's answer reaches the app), every other queued job held aside,
//                then handed back to the web runner (job_runner On), as on a team install.
//      Config put back in a finally.
//   4. dbarnes publishes on screen: OJS "Vol. 1 No. 2 (2014)" (ISSUE=back, published at once)
//      or "Vol. 2 No. 1 (2015)" (ISSUE=future, scheduled); OPS "Post".
//   5. The work requests the stand-in got, the put-code stored, the jobs, orcid.log.
//   6. The publication page again (reload read).
//
// Run (main under the app lock, one app per call; a fleet reset before each run):
//   STUB_DIR=.reports/U04/cc21d/orcid-stub
//   node shared/playwright/checks/sync/pkp-lib-13493/orcid-token-stub.js --init --dir $STUB_DIR
//   PHP_INI_SCAN_DIR=:$PWD/$STUB_DIR/php PROBE_FEATURE=<dataset fleet feature> PKP_E2E_DATASET=<n> \
//     PROBE_AGENT=cc21d PROBE_RUN=r1 [MODE=hybrid|web|worker] [WORK_ANSWER=created|notfound] [LOCATION_HEADER=location|Location] \
//     [ISSUE=back|future] [STUB_PORT=8791] node bin/probe.js <ojs|ops> shared/playwright/checks/U04/H21/deposits.js
// Facts: .reports/<feature>/cc21d/cc21d-dep-<mode>-<answer>[-LH][-<issue>]-<run>-<app>.json
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, signOut, screen, shot, record, idle, sql, serverLog, drainJobs} = require('../../../probe');
const {spawn, execFileSync} = require('child_process');

const REPO = path.resolve(__dirname, '../../../..', '..');
const T = 30_000;
const RUN = process.env.PROBE_RUN || 'r1';
const ANSWER = process.env.WORK_ANSWER || 'created';
const LOCATION_HEADER = process.env.LOCATION_HEADER || 'location';
const ISSUE = process.env.ISSUE || 'back';
// worker: job_runner Off, the queue run by drainJobs() from this process (trusting the stand-in);
// web: job_runner On as the dataset ships it, the queue run by the fleet's own web requests
// (whose PHP does not trust the stand-in's CA: each deposit attempt shows as a CONNECT and a
// failed TLS handshake, and the app's log lines say what it sent).
const MODE = process.env.MODE || 'worker';
const STUB_DIR = path.resolve(REPO, process.env.STUB_DIR || '.reports/U04/cc21d/orcid-stub');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (s, n = 400) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));

const SUBJECT = {
    ojs: {sid: 5, email: 'ddiouf@mailinator.com', name: 'Diaga Diouf'},
    ops: {sid: 1, email: 'ccorino@mailinator.com', name: 'Carlo Corino'},
};
const ISSUES = {back: /Vol\. 1 No\. 2 \(2014\)/, future: /Vol\. 2 No\. 1 \(2015\)/};

/** Settings › Users & Roles › ORCID on the member sandbox, request log "All". */
async function setOrcidMember(page, app, rec) {
    await page.goto(app.url(`/index.php/${app.contextPath}/management/settings/access`));
    await idle(page);
    await page.getByRole('tab', {name: 'ORCID', exact: true}).click();
    const box = page.getByRole('checkbox', {name: 'Enable ORCID functionality'});
    await box.waitFor({state: 'visible', timeout: T});
    if (!(await box.isChecked())) await box.check();
    const api = page.locator('select[name="orcidApiType"]');
    await api.waitFor({state: 'visible', timeout: T});
    await api.selectOption('memberSandbox');
    await page.locator('input[name="orcidClientId"]').fill('APP-0000000000000000');
    await page.locator('input[name="orcidClientSecret"]').fill('00000000-0000-0000-0000-000000000000');
    const level = page.locator('select[name="orcidLogLevel"]');
    const out = {};
    if (await level.isVisible().catch(() => false)) {
        out.logLevelOptions = await level.locator('option').allInnerTexts();
        await level.selectOption({label: 'All'});
    }
    rec('01-orcid-tab', await screen(page));
    const saved = page.waitForResponse((r) => /\/api\/v1\/contexts\/\d+/.test(r.url()) && r.request().method() !== 'GET', {timeout: T}).catch(() => null);
    await page.locator('[id="orcidSettings"]').getByRole('button', {name: 'Save', exact: true}).click();
    const r = await saved;
    out.save = r ? r.status() : null;
    await sleep(1000);
    rec('01-orcid-saved', await screen(page));
    await shot(page, `${rec.prefix}01-orcid-saved`).catch(() => {});
    out.stored = sql(app, `select setting_name, setting_value from ${app.contextTables.settings} where setting_name in ('orcidEnabled','orcidApiType','orcidClientId','orcidLogLevel') order by 1`).split('\n');
    return out;
}

/** What VerifyIdentityWithOrcid::setIdentityData()/saveIdentityData() store after a member-API sign-in. */
function seedVerifiedOrcid(app, sid, email) {
    sql(app, `INSERT INTO author_settings (author_id, locale, setting_name, setting_value)
SELECT a.author_id, '', v.setting_name, v.setting_value
FROM authors a JOIN submissions s ON s.current_publication_id = a.publication_id
CROSS JOIN (
  SELECT 'orcid' AS setting_name, 'https://sandbox.orcid.org/0000-0002-1825-0097' AS setting_value
  UNION ALL SELECT 'orcidIsVerified', '1'
  UNION ALL SELECT 'orcidAccessToken', '00000000-1111-2222-3333-444444444444'
  UNION ALL SELECT 'orcidAccessScope', '/activities/update'
  UNION ALL SELECT 'orcidRefreshToken', '55555555-6666-7777-8888-999999999999'
  UNION ALL SELECT 'orcidAccessExpiresOn', '2046-10-01 00:00:00'
) v WHERE s.submission_id = ${sid} AND a.email = '${email}';`);
    return orcidRows(app, sid, email);
}
function orcidRows(app, sid, email) {
    return sql(app, `select s.setting_name, s.setting_value from authors a join author_settings s on s.author_id=a.author_id where a.email='${email}' and a.publication_id=(select current_publication_id from submissions where submission_id=${sid}) and s.setting_name like 'orcid%' order by 1`).split('\n');
}

/** Publish (OJS, into the chosen issue) or post (OPS) through the workflow, as the signed-in editor. */
async function publishOnScreen(page, app, sid, rec) {
    const out = {};
    const issue = ISSUES[ISSUE];
    const answered = [];
    const onResp = (r) => { if (/\/publications\/\d+\/publish/.test(r.url()) && r.request().method() !== 'GET') answered.push({status: r.status(), url: r.url().replace(/^https?:\/\/[^/]+/, '')}); };
    page.on('response', onResp);
    try {
        await page.goto(app.url(`/index.php/${app.contextPath}/dashboard/editorial?workflowSubmissionId=${sid}`));
        await idle(page);
        if (app.line !== 'stable-3_5_0' && app.name === 'ojs') {
            const {PublicationScreen} = require(path.join(app.suiteDir, 'pages', 'PublicationMetadataPages.js'));
            const pub = new PublicationScreen(page, app.contextPath);
            await pub.openEntry('Title & Abstract');
            await idle(page);
            rec('02-before-publish', await screen(page));
            if (ISSUE === 'future') await pub.scheduleToFutureIssue(issue);
            else await pub.publish({backIssueLabel: issue});
        } else if (app.line !== 'stable-3_5_0' && app.name === 'ops') {
            const {postPreprint} = require(path.join(app.suiteDir, 'pages', 'PublicationPages.js'));
            rec('02-before-publish', await screen(page));
            await postPreprint(page);
        } else {
            const tabs = page.getByRole('link', {name: 'Title & Abstract', exact: true});
            await tabs.first().waitFor({state: 'visible', timeout: T}).catch(() => {});
            if (await tabs.first().isVisible().catch(() => false)) await tabs.first().click();
            await idle(page);
            rec('02-before-publish', await screen(page));
            const label = app.name === 'ops' ? 'Post' : 'Schedule For Publication';
            const button = page.getByRole('button', {name: label, exact: true}).first();
            await button.waitFor({state: 'visible', timeout: T});
            await button.click();
            await sleep(1500);
            await idle(page);
            const issueSelect = page.locator('select[name="issueId"]').last();
            if (await issueSelect.isVisible().catch(() => false)) {
                rec('02-select-issue', await screen(page));
                const opt = issueSelect.locator('option').filter({hasText: issue});
                await issueSelect.selectOption((await opt.first().getAttribute('value')) || '');
                const form = page.locator('form').filter({has: issueSelect}).last();
                await form.getByRole('button', {name: 'Save', exact: true}).click();
                await sleep(2000);
                await idle(page);
            }
            // OJS: "Publish" into a published issue, "Schedule For Publication" into a future one.
            const confirmLabel = app.name === 'ops' ? /^Post$/ : /^(Publish|Schedule For Publication)$/;
            const dlg = page.getByRole('dialog').filter({hasText: /Are you sure you want to/}).filter({has: page.getByRole('button', {name: confirmLabel})}).last();
            await dlg.waitFor({state: 'visible', timeout: T});
            await sleep(800);
            out.window = flat(await dlg.innerText().catch(() => null), 400);
            rec('02-confirm', await screen(page));
            await dlg.getByRole('button', {name: confirmLabel}).last().click();
            await page.getByRole('button', {name: app.name === 'ops' ? 'Unpost' : 'Unpublish', exact: true}).first().waitFor({timeout: T}).catch(() => {});
        }
    } catch (e) {
        out.error = flat(e.message, 500);
    } finally {
        page.off('response', onResp);
    }
    await idle(page).catch(() => {});
    await sleep(1000);
    out.publishAnswers = answered;
    const after = await screen(page);
    rec('03-published', after);
    await shot(page, `${rec.prefix}03-published`).catch(() => {});
    out.notices = after.notices;
    out.status = flat((after.text && after.text.main) || '', 200);
    return out;
}

/**
 * The app's ORCID log (<files_dir>/orcid.log): the lines written since a mark, without the
 * request headers (only the method, address, request-body and outcome lines are kept).
 */
function orcidLogFile(configFile) {
    const filesDir = (fs.readFileSync(configFile, 'utf8').match(/^files_dir\s*=\s*"?([^"\n]+?)"?\s*$/m) || [])[1];
    const file = path.join(filesDir || '', 'orcid.log');
    const mark = () => (fs.existsSync(file) ? fs.statSync(file).size : 0);
    const since = (from) => (fs.existsSync(file) ? fs.readFileSync(file).subarray(from).toString('utf8').split('\n') : [])
        .filter((l) => /^\d{4}-\d\d-\d\d /.test(l) && !/Header:/.test(l))
        .map((l) => flat(l.replace(/(Request body \(without put-code\): ).*/, (m, a) => `${a}<work JSON, ${m.length - a.length} chars>`), 300));
    return {file, mark, since};
}

/** One queued job of the default queue, by the CLI worker, trusting the stand-in. */
function runOnce(app) {
    try {
        return flat(execFileSync('php', ['lib/pkp/tools/jobs.php', 'run', '--queue=queue', '--once'], {
            cwd: app.root, env: {...process.env, PKP_CONFIG_FILE: app.configFile}, encoding: 'utf8', timeout: 120_000,
        }), 800);
    } catch (e) {
        return flat(`${e.stdout || ''}${e.stderr || ''} [exit ${e.status}]`, 800);
    }
}

/** The work stand-in as its own process (drainJobs() blocks this one's event loop). */
async function startStubProcess({port, tagName}) {
    const jsonFile = path.join(STUB_DIR, `requests-${tagName}.jsonl`);
    fs.rmSync(jsonFile, {force: true});
    const child = spawn(process.execPath, [path.join(__dirname, 'work-stub.js'), '--dir', STUB_DIR, '--port', String(port), '--answer', ANSWER,
        '--location-header', LOCATION_HEADER, '--json', jsonFile, '--log', path.join(STUB_DIR, `stub-${tagName}.log`)], {stdio: ['ignore', 'pipe', 'pipe']});
    await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('work stand-in did not start')), 15_000);
        child.stdout.on('data', (d) => { if (/listening/.test(String(d))) { clearTimeout(timer); resolve(); } });
        child.stderr.on('data', (d) => { clearTimeout(timer); reject(new Error(String(d))); });
    });
    const requests = () => (fs.existsSync(jsonFile) ? fs.readFileSync(jsonFile, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
    return {proxyUrl: `http://127.0.0.1:${port}`, requests, close: async () => { child.kill(); }};
}

const jobsAbove = (app, m) => ({
    jobs: sql(app, `select id, attempts, substring(payload from '"displayName":"([^"]+)"') from jobs where id > ${m.jobs} order by id`).split('\n').filter(Boolean),
    failed: sql(app, `select id, substring(payload from '"displayName":"([^"]+)"'), left(regexp_replace(exception, '\\s+', ' ', 'g'), 300) from failed_jobs where id > ${m.failed} order by id`).split('\n').filter(Boolean),
});

forEachApp(async (app) => {
    const subject = SUBJECT[app.name];
    const name = `cc21d-dep-${MODE}-${ANSWER}${LOCATION_HEADER === 'location' ? '' : '-LH'}${app.name === 'ojs' ? `-${ISSUE}` : ''}`;
    const facts = {line: app.line || 'main', app: app.name, run: RUN, mode: MODE, answer: ANSWER, locationHeader: LOCATION_HEADER, issue: app.name === 'ojs' ? ISSUE : null, dataset: app.dataset};
    const fact = (k, v) => { facts[k] = v; record(name, facts); console.log(`[${name} ${app.name} ${facts.line}] ${k}:`, JSON.stringify(v).slice(0, 1800)); };
    const rec = (n, data) => record(`${name}-${n}`, data);
    rec.prefix = `${name}-`;
    if (!subject) { fact('skipped', 'a press deposits nothing (canDepositSubmission() false); not driven here'); return; }
    if (!String(process.env.PHP_INI_SCAN_DIR || '').includes(path.join(STUB_DIR, 'php'))) {
        fact('error', `run with PHP_INI_SCAN_DIR=:${path.join(STUB_DIR, 'php')} so drainJobs trusts the stand-in`);
        return;
    }
    const {sid, email, name: contributor} = subject;
    const configFile = path.isAbsolute(app.configFile) ? app.configFile : path.join(REPO, app.configFile);
    const original = fs.readFileSync(configFile, 'utf8');
    const restore = () => fs.writeFileSync(configFile, original);
    process.on('exit', restore);
    const port = Number(process.env.STUB_PORT || ((app.line === 'stable-3_5_0' ? 8795 : 8791) + (app.name === 'ops' ? 1 : 0)));
    const orcidLog = serverLog(app, {match: /Request body \(without put-code\)|(POST|PUT) https:\/\/api\.|Work added|Work updated|Publication fail|Unexpected status|putCode|orcid/i});
    const errLog = serverLog(app);
    const orcidFile = orcidLogFile(configFile);
    const marks = {
        jobs: Number(sql(app, 'select coalesce(max(id),0) from jobs')) || 0,
        failed: Number(sql(app, 'select coalesce(max(id),0) from failed_jobs')) || 0,
    };
    fact('subject', {sid, contributor, publications: sql(app, `select publication_id, status${app.name === 'ojs' ? ", coalesce(issue_id::text,'-')" : ''} from publications where submission_id=${sid} order by 1`).split('\n')});
    const stub = await startStubProcess({port, tagName: `${RUN}-${MODE}-${facts.line}-${app.name}`});
    const {page, close} = await launch(app);
    try {
        await signIn(page, 'rvaca');
        fact('settings', await setOrcidMember(page, app, rec));
        await signOut(page);
        fact('seeded', seedVerifiedOrcid(app, sid, email));
        fs.writeFileSync(configFile, (() => {
            const pointed = original.replace(/^(https?_proxy)\s*=.*$/gm, `$1 = "${stub.proxyUrl}"`);
            return MODE === 'web' ? pointed : pointed.replace(/^job_runner = On$/m, 'job_runner = Off');
        })());
        fact('config', {mode: MODE, jobRunner: (fs.readFileSync(configFile, 'utf8').match(/^job_runner = (\w+)$/m) || [])[1], proxy: stub.proxyUrl});
        await sleep(1500);
        await signIn(page, 'dbarnes');
        const fromLog = orcidLog.mark();
        const fromOrcidFile = orcidFile.mark();
        const fromErr = errLog.mark();
        fact('publish', await publishOnScreen(page, app, sid, rec));
        fact('publication', sql(app, `select publication_id, status${app.name === 'ojs' ? ", coalesce(issue_id::text,'-')" : ''} from publications where submission_id=${sid} order by 1`).split('\n'));
        fact('queuedAfterPublish', jobsAbove(app, marks));
        fact('stubBeforeDrain', stub.requests());
        if (MODE === 'worker') {
            const drains = [];
            for (let i = 0; i < 2; i++) {
                const d = await drainJobs(app, {passes: 3, timeoutMs: 120_000});
                drains.push({passes: d.passes, counts: d.counts, lines: String(d.output || '').split('\n').filter((l) => /Processing|Processed|Failed|message/i.test(l)).map((l) => flat(l, 200)).slice(0, 40)});
            }
            fact('drains', drains);
        } else {
            if (MODE === 'hybrid') {
                // The first deposit alone, by the CLI worker trusting the stand-in (so ORCID's
                // answer reaches the app); every other queued job held aside meanwhile, then
                // handed back to the web job runner, which runs them with the journal's request
                // context, as on a team install. The order matches the web runner's own: there
                // the publish request's runner sends the deposit before the second build of the
                // work (orcid.log, MODE=web).
                fact('heldAside', sql(app, `update jobs set queue='cc21d-hold' where id > ${marks.jobs} and payload not like '%DepositOrcidSubmission%' returning id, substring(payload from '"displayName":"([^"]+)"')`).split('\n').filter(Boolean));
                fact('firstDeposit', runOnce(app));
                fact('putCodeAfterFirst', orcidRows(app, sid, email).filter((l) => /PutCode/i.test(l)));
                fact('stubAfterFirst', stub.requests());
                fact('orcidLogAfterFirst', orcidFile.since(fromOrcidFile));
                fs.writeFileSync(configFile, fs.readFileSync(configFile, 'utf8').replace(/^job_runner = Off$/m, 'job_runner = On'));
                fact('released', sql(app, `update jobs set queue='queue' where queue='cc21d-hold' returning id`).split('\n').filter(Boolean));
            }
            // The web job runner: front-page loads until no queued job is left (or two minutes).
            const loads = [];
            const until = Date.now() + 120_000;
            while (Date.now() < until) {
                await page.goto(app.url(`/index.php/${app.contextPath}`)).catch(() => {});
                await sleep(4000);
                const left = Number(sql(app, `select count(*) from jobs where id > ${marks.jobs}`));
                loads.push(left);
                if (left === 0) break;
            }
            fact('webLoads', loads);
        }
        fact('afterDrain', jobsAbove(app, marks));
        const got = stub.requests();
        fact('stubRequests', got);
        fact('workDeposits', {
            connects: got.filter((r) => r.method === 'CONNECT').length,
            tlsFailed: got.filter((r) => r.method === 'TLS-FAILED').length,
            posts: got.filter((r) => r.method === 'POST' && /\/work$/.test(r.path)).length,
            puts: got.filter((r) => r.method === 'PUT').length,
        });
        fact('putCodeStored', orcidRows(app, sid, email).filter((l) => /PutCode/i.test(l)));
        fact('serverOrcidLines', orcidLog.since(fromLog).filter((l) => !/^#\d/.test(l)).map((l) => flat(l, 300)));
        fact('orcidLog', orcidFile.since(fromOrcidFile));
        fact('serverErrors', errLog.since(fromErr).map((l) => flat(l, 300)));
        // Reload read: the publication page afresh.
        await page.goto(app.url(`/index.php/${app.contextPath}/dashboard/editorial?workflowSubmissionId=${sid}`));
        await idle(page);
        await sleep(1000);
        const again = await screen(page);
        rec('04-reloaded', again);
        await shot(page, `${rec.prefix}04-reloaded`).catch(() => {});
        fact('reloaded', flat((again.text && again.text.main) || '', 200));
    } catch (e) {
        fact('error', flat(e.stack || e.message, 800));
    } finally {
        restore();
        fact('configRestored', fs.readFileSync(configFile, 'utf8') === original);
        await stub.close().catch(() => {});
        await close();
    }
});
