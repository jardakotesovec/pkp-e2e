// PR review check — pkp/pkp-lib#13585 "Fix required plain language summary blocking publication saves" (issue
// pkp/pkp-lib#13584, report docs/issues/U21-A20-plain-summary-required-refuses-other-saves.md). The issue's walk
// (checks/issues/plain-summary-required-refuses-other-saves/walk.js) drives the screens; this check drives the API
// routes into Repo::publication()->validate() that no screen reaches with every body, on PKP's default test dataset
// as the manager `dbarnes`, with the context's plain language summary set to "require" through PUT contexts/<id>:
//
//   other      PUT …/publications/<id> {copyrightHolder} on a submitted publication with no summary (an older one)
//   version    PUT …/publications/<id>/version {versionStage: VoR (OPS AO), versionIsMinor: false}
//   set        PUT …/publications/<id> {plainLanguageSummary: {en: <text>}}
//   emptied    PUT … {plainLanguageSummary: {en: ''}}                      (the requirement: refused)
//   null       PUT … {plainLanguageSummary: null}                           then the stored summary read back
//   otherLang  (summary set again) PUT … {plainLanguageSummary: {fr_CA: <text>}} then the stored summary read back
//   addBare    POST …/publications without a summary                        (a new object: refused)
//   addWith    POST …/publications with the summary
//
// It asserts nothing, so it runs unchanged with lib/pkp at the PR's base (2ea65a9662) and head (93b094ea77).
//
//   npm run fleet-prep -- --feature <f> --dataset 3 --reset      # every run edits and adds versions
//   PROBE_FEATURE=<f> PROBE_AGENT=pr13585 [PROBE_RUN=<run>] \
//     node bin/probe.js <ojs|omp|ops|all> shared/playwright/checks/sync/pkp-lib-13585/api-edges.js
//
// Facts: api-edges-<pkp-lib sha>[-<PROBE_RUN>]-<app>.json
const path = require('path');
const {execFileSync} = require('child_process');
const {forEachApp, launch, signIn, idle, record, sql, serverLog} = require('../../../probe');

const SUBMISSION = {ojs: 4, omp: 3, ops: 1};
const STAGE = {ojs: 'VoR', omp: 'VoR', ops: 'AO'};
const SUMMARY = 'u13585 plain summary for a general reader';

forEachApp(async (app) => {
    const sha = execFileSync('git', ['-C', path.join(path.resolve(app.root), 'lib/pkp'), 'rev-parse', '--short=10', 'HEAD'], {encoding: 'utf8'}).trim();
    const facts = {app: app.name, libPkp: sha, steps: {}};
    const {table, id} = app.contextTables;
    const cid = Number(sql(app, `select ${id} from ${table} where path = 'publicknowledge'`));
    const sid = SUBMISSION[app.name];
    const log = serverLog(app);
    const stored = (pid) => sql(app, `select locale || '=' || setting_value from publication_settings where publication_id = ${pid} and setting_name = 'plainLanguageSummary' order by locale`);

    const {page, close} = await launch(app);
    try {
        await signIn(page, 'dbarnes', {contextPath: 'publicknowledge'});
        await page.goto('/index.php/publicknowledge/en/management/settings/website');
        await idle(page);
        const from = log.mark();
        const call = (method, route, body) => page.evaluate(async ([m, r, b]) => {
            const res = await fetch(pkp.context.apiBaseUrl + r, {
                method: m,
                headers: {'X-Csrf-Token': pkp.currentUser.csrfToken, 'Content-Type': 'application/json'},
                body: b === undefined ? undefined : JSON.stringify(b),
            });
            const text = await res.text();
            let json = null;
            try { json = JSON.parse(text); } catch (e) { /* keep the text */ }
            return {status: res.status, json, text: json ? undefined : text.slice(0, 400)};
        }, [method, route, body]);

        const ctx = await call('PUT', `contexts/${cid}`, {plainLanguageSummary: 'require'});
        facts.context = {status: ctx.status, plainLanguageSummary: ctx.json && ctx.json.plainLanguageSummary};
        facts.metadataLocales = ctx.json && ctx.json.supportedSubmissionMetadataLocales;
        const sub = await call('GET', `submissions/${sid}`);
        const pid = sub.json.currentPublicationId;
        facts.submission = {id: sid, publication: pid, submissionProgress: sub.json.submissionProgress, storedBefore: stored(pid)};
        const pub = `submissions/${sid}/publications/${pid}`;
        const brief = (r) => ({status: r.status, errors: r.status >= 400 ? (r.json || r.text) : undefined});
        const step = async (name, method, route, body) => {
            const r = await call(method, route, body);
            facts.steps[name] = {...brief(r), stored: stored(pid)};
            console.log(`[fact] ${app.name} ${sha} ${name}: ${JSON.stringify(facts.steps[name])}`);
            return r;
        };

        await step('other', 'PUT', pub, {copyrightHolder: {en: 'u13585 holder'}});
        await step('version', 'PUT', `${pub}/version`, {versionStage: STAGE[app.name], versionIsMinor: false});
        await step('set', 'PUT', pub, {plainLanguageSummary: {en: SUMMARY}});
        await step('emptied', 'PUT', pub, {plainLanguageSummary: {en: ''}});
        await step('null', 'PUT', pub, {plainLanguageSummary: null});
        await step('setAgain', 'PUT', pub, {plainLanguageSummary: {en: SUMMARY}});
        await step('otherLang', 'PUT', pub, {plainLanguageSummary: {fr_CA: 'u13585 résumé'}});

        const current = (await call('GET', pub)).json;
        const sectionKey = app.name === 'omp' ? 'seriesId' : 'sectionId';
        const base = {
            version: Number(current.version || 1) + 1,
            versionStage: STAGE[app.name],
            versionMajor: Number(current.versionMajor || 1) + 1,
            versionMinor: 0,
            [sectionKey]: current[sectionKey],
            title: current.title,
            abstract: current.abstract,
        };
        await step('addBare', 'POST', `submissions/${sid}/publications`, base);
        const added = await step('addWith', 'POST', `submissions/${sid}/publications`, {...base, plainLanguageSummary: {en: SUMMARY}});
        facts.addedId = added.json && added.json.id;
        facts.serverLog = log.since(from);
    } finally {
        record(`api-edges-${sha}`, facts);
        await close();
    }
});
