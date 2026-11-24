// U63 claim check S11972 (upstream sync of pkp/pkp-lib#11972, merged 2026-11-23): the Native XML Plugin's import
// and what the file carries. Spec docs/specs/U63-import-export.md at pkp-e2e 68b3cb36: Rules 10-12a (198-252),
// Rule 20 and 20a (326-345), Rule 20b (346-364); A8, A9, A20, A26, OMP3, OMP5, OMP6 and their notes.
// The change: a contributor of type Person needs an <email> on import, an Organization or Anonymous one does not,
// and an <orcid> is kept for a Person only. OJS main has it; OMP and OPS main (lib/pkp 3ea73a1a7e) are the controls
// until their pointers move.
//
// Per app, one scratch tag (u63s…), contexts:
//   A  the source: Kestrel (submitted, files; OMP in series "birds"), Axolotl (a review round with a file; OJS OMP),
//      Heron (published: OJS in Vol. 7 No. 1 (2026) with a PDF galley, OMP a "PDF" format, OPS a galley),
//      Plover (title prefix "The", seeded as a publication_settings row), Puffin (the submitter with an ORCID iD,
//      plus an Organization with no email and an Anonymous contributor added through the contributors API as the
//      manager, the request the "Add Contributor" form sends)
//   B  clean screen import of A's screen export (all five)
//   N  screen imports of the contributor-type variants (built from Kestrel's CLI export) and Puffin's round trip
//   C  failed and problem imports (invalid file, part-way failure, the 3.5 file, unknown issue/section/series)
//   D  CLI import target (Heron's CLI export)
//   O  {OMP} a press with the four ONIX details and a published book with a format (the CLI export's failing end)
//
// Phases (PHASES=seed,export,import,types,failed,problems,brokenview,sweep,cli; default all in order). State: outFile
// 's11972-state.json' (per run and app), delete it for a fresh seed.
//   PROBE_FEATURE=sync PROBE_AGENT=ccS63 PROBE_RUN=r1 PROBE_NOTES_FEATURE=U63 \
//       node bin/probe.js all shared/playwright/checks/U63/S11972/s11972.js      (then PROBE_RUN=r2)
// The 3.5 file of Rule 11: F35_DIR, a folder holding a Native XML export made on a stable-3_5_0 install, named
// a26-file-export-f35-out-<app>.xml (default .reports/issues-h21f/h21f/, the files of the 2026-10-21 A26 walk);
// the phase records "no 3.5 file" without it.
// The PR review's CLI variants of the same change are the kept scripts beside the sync log:
//   shared/playwright/checks/sync/pkp-lib-13624/import.js (CLI import of the five variants, all three apps) and
//   jats.js (OJS only); run them with the same PROBE_FEATURE/PROBE_AGENT and PROBE_RUN=t1, t2.
// Facts: s11972-<run>-<app>.json (merged per phase), snapshots s11972-<phase>-*-<run>-<app>.json/.png, the XML
// files beside them. No assertions: the script records, the reader judges.
const fs = require('fs');
const path = require('path');
const {execFileSync} = require('child_process');
const {forEachApp, launch, signIn, signOut, record, screen, shot, idle, tag, outFile, sql, apiAs, serverLog, note, loc} =
    require('../../../probe');

const REPO = path.resolve(__dirname, '../../../../..');
const ALL = ['seed', 'export', 'import', 'types', 'failed', 'problems', 'brokenview', 'sweep', 'cli'];
const PHASES = (process.env.PHASES || ALL.join(',')).split(',');
const on = (p) => PHASES.includes(p);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (t, n = 400) => (t == null ? t : String(t).replace(/\s+/g, ' ').trim().slice(0, n));
const rel = (u) => (u ? String(u).replace(/^https?:\/\/[^/]+/, '') : u);
const ORCID = 'https://orcid.org/0000-0002-1825-0097';
const log = (...a) => console.log('[s11972]', new Date().toISOString().slice(11, 19), ...a);

function cli(app, args) {
    const root = path.resolve(REPO, app.root);
    const env = {...process.env, PKP_CONFIG_FILE: path.resolve(REPO, app.configFile)};
    try {
        const out = execFileSync('php', ['tools/importExport.php', 'NativeImportExportPlugin', ...args], {cwd: root, env, encoding: 'utf8', timeout: 300_000, stdio: ['ignore', 'pipe', 'pipe']});
        return {code: 0, out: out.split('\n').filter((l) => l.trim()).slice(0, 40)};
    } catch (e) {
        return {code: e.status, out: `${e.stdout || ''}${e.stderr || ''}`.split('\n').filter((l) => l.trim()).slice(0, 40)};
    }
}

forEachApp(async (app) => {
    const isOJS = app.name === 'ojs';
    const isOMP = app.name === 'omp';
    const isOPS = app.name === 'ops';
    const statePath = outFile('s11972-state.json');
    const S = fs.existsSync(statePath) ? JSON.parse(fs.readFileSync(statePath, 'utf8')) : {};
    const save = () => fs.writeFileSync(statePath, JSON.stringify(S, null, 1));
    const fact = (k, v) => { record('s11972', {[k]: v}, {merge: true}); log(`[${app.name} ${k}]`, JSON.stringify(v).slice(0, 1500)); };
    const {page, close} = await launch(app);
    page.setDefaultTimeout(15_000);
    const dialogs = [];
    page.on('dialog', (d) => { dialogs.push({type: d.type(), message: flat(d.message(), 300)}); (d.type() === 'beforeunload' ? d.accept() : d.dismiss()).catch(() => {}); });
    const srv = serverLog(app);
    const snap = async (name, extra = {}) => {
        const s = await screen(page).catch((e) => ({url: page.url(), screenError: flat(e.message, 300)}));
        record(`s11972-${name}`, {...s, ...extra});
        await shot(page, `s11972-${name}`).catch(() => {});
        return s;
    };
    const go = async (u) => { let r = null; try { r = await page.goto(app.url(u)); } catch (e) { r = null; } await idle(page).catch(() => {}); return r ? r.status() : 'no response'; };
    const cu = (ctx, p) => `/index.php/${ctx}${p}`;
    const as = async (user, ctx) => { await signIn(page, user, {contextPath: ctx}); await idle(page).catch(() => {}); };
    const NATIVE = '/management/importexport/plugin/NativeImportExportPlugin';
    const exportTabName = isOJS ? 'Export Articles' : isOMP ? 'Export' : 'Export Preprints';
    const exportBtnName = isOJS ? 'Export Articles' : isOMP ? 'Export Submissions' : 'Export Preprints';
    const entity = isOJS ? 'article' : isOMP ? 'monograph' : 'preprint';
    const ctxId = (p) => Number(sql(app, `select ${app.contextTables.id} from ${app.contextTables.table} where path = '${p}'`));
    const subCount = (p) => Number(sql(app, `select count(*) from submissions where context_id = ${ctxId(p)}`));
    // ctx narrows to one context's authors: other slots' agents add authors on the same fleet at the same time
    const authorsAfter = (id, ctx = null) => sql(app, `select a.author_id, a.contributor_type, coalesce(a.email,'<null>'),
            coalesce((select setting_value from author_settings s where s.author_id=a.author_id and s.setting_name='orcid'),'<no orcid>'),
            coalesce((select setting_value from author_settings s where s.author_id=a.author_id and s.setting_name in ('givenName','organizationName') and setting_value <> '' limit 1),''),
            coalesce((select setting_value from author_settings s where s.author_id=a.author_id and s.setting_name='country'),'<no country>')
            from authors a where a.author_id > ${id}${ctx ? ` and a.publication_id in (select p.publication_id from publications p join submissions s on s.submission_id = p.submission_id where s.context_id = ${ctxId(ctx)})` : ''} order by 1`).split('\n').filter(Boolean);
    const maxAuthor = () => Number(sql(app, 'select coalesce(max(author_id),0) from authors'));

    const tabsNow = async () => page.locator('#importExportTabs [role="tab"]').evaluateAll((ts) => ts.map((t) => ({text: t.innerText.trim(), selected: t.getAttribute('aria-selected') === 'true'}))).catch(() => []);
    const panelText = async () => flat(await page.locator('#importExportTabs [role="tabpanel"]:visible').first().innerText().catch(() => null), 4000);
    const openNative = async (ctx) => {
        const st = await go(cu(ctx, NATIVE));
        await page.locator('#importExportTabs').waitFor({timeout: 15_000}).catch(() => {});
        return {status: st, tabs: (await tabsNow()).map((t) => `${t.text}${t.selected ? '*' : ''}`)};
    };
    const upload = async (file) => {
        const o = {};
        const r0 = page.waitForResponse((r) => r.url().includes('uploadImportXML'), {timeout: 30_000}).catch(() => null);
        await page.locator('#importXmlForm input[type=file]').first().setInputFiles(file);
        const r = await r0;
        o.uploadStatus = r ? r.status() : 'no request';
        await idle(page).catch(() => {}); await sleep(400);
        o.temporaryFileId = await page.locator('#importXmlForm input[name=temporaryFileId]').first().inputValue().catch(() => null);
        o.box = flat(await page.locator('#importXmlForm').innerText().catch(() => null), 300);
        return o;
    };
    const pressImport = async () => {
        const o = {};
        const before = await tabsNow();
        const resps = [];
        const onResp = (r) => { if (/NativeImportExportPlugin\/(importBounce|import)/.test(r.url())) resps.push({url: rel(r.url()).replace(/csrfToken=[^&]+/, 'csrf').slice(0, 160), status: r.status()}); };
        page.on('response', onResp);
        await page.locator('#importXmlForm').getByRole('button', {name: 'Import', exact: true}).click();
        for (let i = 0; i < 90; i++) {
            await sleep(500);
            const now = await tabsNow();
            if (now.length > before.length) {
                const txt = await panelText();
                if (txt && /completed|failed/i.test(txt)) break;
                if (i > 40) break;
            }
            if (i === 12 && (await tabsNow()).length === before.length) break;
        }
        await idle(page).catch(() => {}); await sleep(600);
        page.off('response', onResp);
        o.responses = resps;
        o.tabsAfter = (await tabsNow()).map((t) => `${t.text}${t.selected ? '*' : ''}`);
        o.added = o.tabsAfter.length - before.length;
        o.panel = await panelText();
        o.ids = [...(o.panel || '').matchAll(/"(\d+)" - "([^"]*)"/g)].map((x) => ({id: Number(x[1]), title: x[2]}));
        return o;
    };
    const importFile = async (ctx, file, name) => {
        const o = {file: path.basename(file)};
        const logFrom = srv.mark();
        const a0 = maxAuthor();
        const n0 = subCount(ctx);
        o.open = await openNative(ctx);
        o.up = await upload(file);
        o.press = await pressImport();
        await snap(`${name}-results`, {facts: o.press});
        o.submissionsAdded = subCount(ctx) - n0;
        o.authors = authorsAfter(a0, ctx);
        // the fleet's log is shared with other slots' agents: lines naming another context's address are left out
        o.serverLog = srv.since(logFrom).filter((l) => !/\/index\.php\//.test(l) || l.includes(S.t)).slice(0, 8);
        return o;
    };
    const dashboardSearch = async (ctx, text) => {
        const r = {};
        await go(cu(ctx, '/dashboard/editorial'));
        await sleep(800); await idle(page).catch(() => {});
        const nav = page.getByRole('navigation', {name: 'Site Navigation'});
        const gs = nav.getByRole('searchbox').or(nav.locator('input[type=search]')).first();
        r.searchBox = await gs.count();
        if (r.searchBox) { await gs.fill(text); await gs.press('Enter'); await sleep(1500); await idle(page).catch(() => {}); }
        r.url = rel(page.url());
        r.rows = await page.locator('main table tbody tr').allInnerTexts().then((a) => a.map((x) => flat(x, 300))).catch(() => []);
        return r;
    };
    const dashboardView = async (ctx, view) => {
        await go(cu(ctx, `/dashboard/editorial?currentViewId=${view}`));
        await sleep(1200); await idle(page).catch(() => {});
        return {url: rel(page.url()), rows: await page.locator('main table tbody tr').allInnerTexts().then((a) => a.map((x) => flat(x, 300))).catch(() => [])};
    };
    const openWorkflow = async (ctx, id) => {
        await go(cu(ctx, `/dashboard/editorial?workflowSubmissionId=${id}`));
        await sleep(2000); await idle(page).catch(() => {});
    };
    const newCtx = async (k, users, extra = {}) => {
        const p = `${S.t}${k}`;
        await app.api.createContext({tag: p, context: {name: `U63 S11972 ${k.toUpperCase()} ${S.t}`, acronym: `S${k.toUpperCase()}`, contactName: 'S Contact', contactEmail: `${p}c@mail.test`, country: 'CA'}, users, ...extra});
        return p;
    };

    try {
        // ------------------------------------------------------------------ seed
        if (on('seed') && !S.A) {
            const t = (S.t = tag('u63s'));
            const U = (u, roles, g, f) => ({username: u, roles, givenName: g, familyName: f});
            const aExtra = {};
            if (isOJS) aExtra.issues = [{volume: 7, number: 1, year: 2026, published: true}];
            if (isOMP) aExtra.series = [{path: 'birds', title: 'Bird Series'}];
            S.A = await newCtx('a', [U(`${t}am`, ['manager'], 'Kara', 'Manager'), U(`${t}aau`, ['author'], 'Ada', 'Lovelace')], aExtra);
            const sub = async (k, title, extra) => {
                const r = await app.api.createSubmission({tag: `${S.A}${k}`, context: S.A, submitter: `${t}aau`, title, ...extra});
                return {id: r.submissionId || r.id, title};
            };
            const file = isOPS ? {} : {files: [{file: 'article.pdf'}]};
            const series = isOMP ? {series: 'birds'} : {};
            S.subs = {};
            S.subs.kestrel = await sub('k', `Kestrel submitted ${t}`, {...file, ...series});
            if (!isOPS) {
                try { S.subs.axolotl = await sub('x', `Axolotl review ${t}`, {...file, reviewRounds: [{files: [{file: 'article.pdf'}]}]}); } catch (e) { S.axolotlError = flat(e.message, 300); }
            }
            const pub = isOJS ? {decisions: ['skipExternalReview', 'sendToProduction'], galleys: [{label: 'PDF', file: 'article.pdf'}], published: true, issue: {volume: 7, number: 1, year: 2026}}
                : isOMP ? {decisions: ['skipExternalReview', 'sendToProduction'], publicationFormats: [{name: 'PDF', file: 'article.pdf'}], published: true, series: 'birds'}
                    : {galleys: [{label: 'PDF', file: 'preprint.pdf'}], published: true};
            S.subs.heron = await sub('h', `Heron published ${t}`, {...file, ...pub});
            S.subs.plover = await sub('p', `Plover prefix ${t}`, {...file});
            const ppid = Number(sql(app, `select current_publication_id from submissions where submission_id = ${S.subs.plover.id}`));
            sql(app, `delete from publication_settings where publication_id = ${ppid} and setting_name = 'prefix'`);
            sql(app, `insert into publication_settings (publication_id, locale, setting_name, setting_value) values (${ppid}, 'en', 'prefix', 'The')`);
            S.subs.puffin = await sub('f', `Puffin contributors ${t}`, {...file, author: {orcid: ORCID, orcidIsVerified: false}});
            S.B = await newCtx('b', [U(`${t}bm`, ['manager'], 'Bea', 'Manager')]);
            S.N = await newCtx('n', [U(`${t}nm`, ['manager'], 'Nell', 'Manager')]);
            S.C = await newCtx('c', [U(`${t}cm`, ['manager'], 'Cy', 'Manager')]);
            S.D = await newCtx('d', [U(`${t}dm`, ['manager'], 'Dee', 'Manager')]);
            if (isOMP) {
                S.O = await newCtx('o', [U(`${t}om`, ['manager'], 'Oona', 'Manager'), U(`${t}oau`, ['author'], 'Otto', 'Author')], {publisher: 'S Press', location: 'Vancouver', codeType: 'Proprietary (01)', codeValue: 'S11972'});
                const r = await app.api.createSubmission({tag: `${S.O}w`, context: S.O, submitter: `${t}oau`, title: `Wren formatted ${t}`, files: [{file: 'article.pdf'}], decisions: ['skipExternalReview', 'sendToProduction'], publicationFormats: [{name: 'PDF', file: 'article.pdf'}], published: true});
                S.wren = r.submissionId || r.id;
            }
            save();
            // Puffin's other contributors, as the manager through the form's request
            await as(`${t}am`, S.A);
            const sid = S.subs.puffin.id;
            const pid = Number(sql(app, `select current_publication_id from submissions where submission_id = ${sid}`));
            await openWorkflow(S.A, sid);
            const base = `submissions/${sid}/publications/${pid}/contributors`;
            const list = await (await apiAs(page, 'GET', base)).json();
            const roles = ((list.items || list)[0].contributorRoles || []).map((r) => r.id);
            S.puffinAdd = {};
            for (const body of [{contributorType: 'ORGANIZATION', organizationName: {en: 'Org Without Email'}, country: 'CA'}, {contributorType: 'ANONYMOUS'}]) {
                const r = await apiAs(page, 'POST', base, {contributorRoles: roles, ...body});
                S.puffinAdd[body.contributorType] = r.status();
            }
            S.puffinAuthors = sql(app, `select author_id, contributor_type, coalesce(email,'<null>') from authors where publication_id = ${pid} order by seq, author_id`).split('\n');
            await signOut(page).catch(() => {});
            save();
            fact('seed', {t, A: S.A, subs: S.subs, axolotlError: S.axolotlError || null, puffinAdd: S.puffinAdd, puffinAuthors: S.puffinAuthors, B: S.B, N: S.N, C: S.C, D: S.D, O: S.O || null, wren: S.wren || null});
            note(`ccS63 S11972 [${app.name}]: scratch tag ${t}: A ${S.A} (source: Kestrel, ${isOPS ? '' : 'Axolotl, '}Heron published, Plover prefix "The", Puffin person+org+anonymous), B ${S.B} (screen import), N ${S.N} (contributor-type variants), C ${S.C} (failed/problems), D ${S.D} (CLI import)${S.O ? `, O ${S.O} (ONIX filled, Wren published with a format)` : ''}; managers {ctx}m`);
        }
        const t = S.t;

        // ------------------------------------------------------------------ export: CLI single files, screen export of all of A
        if (on('export')) {
            const o = {cli: {}};
            S.files = S.files || {};
            for (const [k, s] of Object.entries(S.subs)) {
                const f = outFile(`s11972-cli-${k}.xml`);
                if (fs.existsSync(f)) fs.unlinkSync(f);
                o.cli[k] = cli(app, ['export', f, S.A, entity, String(s.id)]);
                o.cli[k].written = fs.existsSync(f) ? fs.statSync(f).size : 0;
                if (o.cli[k].written) S.files[k] = f;
            }
            if (isOMP && S.O) {
                const f = outFile('s11972-cli-wren-onix.xml');
                if (fs.existsSync(f)) fs.unlinkSync(f);
                o.cli.wrenOnix = cli(app, ['export', f, S.O, entity, String(S.wren)]);
                o.cli.wrenOnix.written = fs.existsSync(f) ? fs.statSync(f).size : 0;
            }
            // the screen export of A, every line ticked
            await as(`${t}am`, S.A);
            o.open = await openNative(S.A);
            await page.getByRole('tab', {name: exportTabName, exact: true}).first().click();
            const tab = page.locator('#exportSubmissions-tab');
            await tab.locator('.listPanel__item').first().waitFor({timeout: 20_000}).catch(() => {});
            await idle(page).catch(() => {}); await sleep(800);
            const items = tab.locator('.listPanel__item');
            o.listCount = await items.count();
            for (let i = 0; i < o.listCount; i++) await items.nth(i).locator('input[type=checkbox]').check().catch(() => {});
            await snap('export-list', {facts: {count: o.listCount}});
            const before = (await tabsNow()).length;
            await tab.getByRole('button', {name: exportBtnName, exact: true}).click();
            for (let i = 0; i < 60; i++) { await sleep(500); if ((await tabsNow()).length > before && /Download|completed|failed/.test((await panelText()) || '')) break; }
            await idle(page).catch(() => {});
            o.exportPanel = await panelText();
            await snap('export-results', {facts: {panel: o.exportPanel}});
            const btn = page.locator('#importExportTabs [role="tabpanel"]:visible').first().getByRole('button', {name: 'Download Exported File'});
            if (await btn.count()) {
                const dl = page.waitForEvent('download', {timeout: 30_000}).catch(() => null);
                await btn.first().click();
                const d = await dl;
                if (d) {
                    const f = outFile('s11972-screen-all.xml');
                    await d.saveAs(f);
                    S.files.all = f;
                    o.download = {name: d.suggestedFilename(), bytes: fs.statSync(f).size};
                }
            }
            await signOut(page).catch(() => {});
            // what the file carries: Puffin's and Plover's parts
            if (S.files.all) {
                const xml = fs.readFileSync(S.files.all, 'utf8');
                const blocks = [...xml.matchAll(new RegExp(`<${entity}\\s[\\s\\S]*?</${entity}>`, 'g'))].map((x) => x[0]);
                o.fileRoot = (xml.match(/<(\w+)[^>]*xmlns="http:\/\/pkp\.sfu\.ca"/) || [])[1];
                o.fileItems = blocks.length;
                const puffin = blocks.find((b) => b.includes('Puffin contributors')) || '';
                o.puffinAuthors = (puffin.match(/<author [\s\S]*?<\/author>/g) || []).map((a) => flat(a.replace(/<contributor_roles>[\s\S]*?<\/contributor_roles>/, '<contributor_roles/>'), 600));
                const plover = blocks.find((b) => b.includes('Plover prefix')) || '';
                o.ploverPrefix = (plover.match(/<prefix[^>]*>[^<]*<\/prefix>/g) || []);
                o.ploverTitle = (plover.match(/<title[^>]*>[^<]*<\/title>/g) || []).slice(0, 2);
                const heron = blocks.find((b) => b.includes('Heron published')) || '';
                o.heron = {publicationStatus: (heron.match(/<publication [^>]*status="(\d+)"/) || [])[1] || null, formats: (heron.match(/<publication_format\b/g) || []).length, galleys: (heron.match(/<article_galley\b|<preprint_galley\b/g) || []).length, issueId: /<issue_identification>/.test(heron)};
                o.kestrelSeries = isOMP ? ((blocks.find((b) => b.includes('Kestrel')) || '').match(/series[^>]*>/g) || []).slice(0, 3) : null;
            }
            save();
            fact('export', o);
        }

        // ------------------------------------------------------------------ import: Rule 10, 10a, 20, A20, A26, OMP5
        if (on('import') && S.files && S.files.all) {
            const o = {};
            const mailFrom = new Date();
            await as(`${t}bm`, S.B);
            o.imp = await importFile(S.B, S.files.all, 'import-all');
            // Native page reloaded: the results tab still there?
            o.reload = await openNative(S.B);
            await snap('import-after-reload', {facts: o.reload});
            const id = (w) => (o.imp.press.ids.find((x) => x.title.includes(w)) || {}).id;
            o.ids = {kestrel: id('Kestrel'), heron: id('Heron'), plover: id('Plover'), puffin: id('Puffin'), axolotl: id('Axolotl')};
            // the copies on the Dashboard: Kestrel's stage, contributors and files
            if (o.ids.kestrel) {
                await openWorkflow(S.B, o.ids.kestrel);
                const s = await snap('import-kestrel-workflow');
                o.kestrelWorkflow = flat(s.text && (s.text.dialog || s.text.main), 2000);
                const c = page.getByRole('link', {name: 'Contributors', exact: true}).first();
                if (await c.count()) { await c.click(); await sleep(1500); await idle(page).catch(() => {}); const s2 = await snap('import-kestrel-contributors'); o.kestrelContributors = flat(s2.text && (s2.text.dialog || s2.text.main), 1200); }
            }
            o.stages = sql(app, `select submission_id, stage_id, status, (select count(*) from submission_files f where f.submission_id = s.submission_id) from submissions s where context_id = ${ctxId(S.B)} order by 1`).split('\n');
            // the published copy: Dashboard views and the search box; its public page
            o.heronSearch = await dashboardSearch(S.B, 'Heron');
            await snap('import-dashboard-search-heron', {facts: o.heronSearch});
            o.published = await dashboardView(S.B, 'published');
            await snap('import-dashboard-published', {facts: o.published});
            o.active = await dashboardView(S.B, 'active');
            await snap('import-dashboard-active', {facts: o.active});
            if (o.ids.heron) {
                const pubPath = isOJS ? `/article/view/${o.ids.heron}` : isOMP ? `/catalog/book/${o.ids.heron}` : `/preprint/view/${o.ids.heron}`;
                o.heronPublic = {path: pubPath, status: await go(cu(S.B, pubPath))};
                const s = await snap('import-heron-public');
                o.heronPublic.title = await page.title();
                o.heronPublic.h1 = flat(await page.locator('h1').first().innerText().catch(() => null), 200);
            }
            // the prefix copy's workflow header
            if (o.ids.plover) {
                await openWorkflow(S.B, o.ids.plover);
                const s = await snap('import-plover-workflow');
                o.ploverHeader = flat(s.text && (s.text.dialog || s.text.main), 300);
                o.ploverRows = sql(app, `select setting_name, setting_value from publication_settings where publication_id = (select current_publication_id from submissions where submission_id = ${o.ids.plover}) and setting_name in ('prefix','title') order by 1`).split('\n');
            }
            if (isOMP) o.seriesOfCopies = sql(app, `select s.submission_id, coalesce(p.series_id::text,'<none>'), coalesce((select path from series where series_id = p.series_id),'') from submissions s join publications p on p.publication_id = s.current_publication_id where s.context_id = ${ctxId(S.B)} order by 1`).split('\n');
            await signOut(page).catch(() => {});
            await sleep(3000);
            o.mail = await app.mail.count({to: t, since: mailFrom}).catch((e) => flat(e.message, 100));
            save();
            fact('import', o);
        }

        // ------------------------------------------------------------------ types: the contributor-type variants on the screen
        if (on('types') && S.files && S.files.kestrel) {
            const o = {};
            const xml = fs.readFileSync(S.files.kestrel, 'utf8');
            const author = xml.match(/<author [\s\S]*?<\/author>/)[0];
            o.exportedAuthor = flat(author, 600);
            const noEmail = author.replace(/\s*<email>[^<]*<\/email>/, '');
            const withOrcid = (a) => a.replace(/<contributor_roles>/, `<orcid>${ORCID}</orcid><contributor_roles>`);
            const org = noEmail.replace('contributor_type="PERSON"', 'contributor_type="ORGANIZATION"').replace(/(<givenname[^>]*>)[^<]*/, '$1Imported Org').replace(/\s*<familyname[\s\S]*?<\/familyname>/g, '');
            const anon = withOrcid(author).replace('contributor_type="PERSON"', 'contributor_type="ANONYMOUS"');
            const variants = {
                'person-noemail': noEmail,
                'person-emptyemail': author.replace(/<email>[^<]*<\/email>/, '<email></email>'),
                'org-noemail': org,
                'org-orcid': withOrcid(org),
                'anon-email-orcid': anon,
                'person-orcid': withOrcid(author),
            };
            await as(`${t}nm`, S.N);
            o.variants = {};
            for (const [name, a] of Object.entries(variants)) {
                const f = outFile(`s11972-type-${name}.xml`);
                fs.writeFileSync(f, xml.replace(/<author [\s\S]*?<\/author>/, a).replace(/(<title locale="en">)([^<]*)(<\/title>)/, `$1$2 ${name}$3`));
                o.variants[name] = await importFile(S.N, f, `types-${name}`);
            }
            if (S.files.puffin) o.variants.puffinRoundTrip = await importFile(S.N, S.files.puffin, 'types-puffin');
            // the imported person with no email: the contributor's Edit form, Save pressed, left unsaved
            const pn = (o.variants['person-noemail'].press.ids[0] || {}).id;
            if (pn) {
                await openWorkflow(S.N, pn);
                await page.getByRole('link', {name: 'Contributors', exact: true}).first().click().catch(() => {});
                await sleep(1500); await idle(page).catch(() => {});
                const s = await snap('types-person-noemail-contributors');
                o.pnList = flat(s.text && (s.text.dialog || s.text.main), 800);
                const row = page.locator('.listPanel--contributor li.listPanel__item').first();
                await loc(page, 'Workflow › Contributors: a row', page.locator('.listPanel--contributor li.listPanel__item'));
                if (await row.count()) {
                    await row.getByRole('button', {name: 'Edit', exact: true}).click().catch(() => {});
                    const edit = page.getByRole('dialog', {name: 'Edit', exact: true});
                    await edit.waitFor({timeout: 15_000}).catch(() => {});
                    await sleep(800);
                    await snap('types-person-noemail-edit');
                    o.pnEmail = await edit.locator('input[name="email"]').inputValue().catch(() => null);
                    o.pnEmailRequired = await edit.locator('input[name="email"]').getAttribute('required').catch(() => null);
                    const ans = page.waitForResponse((x) => /\/contributors\/\d+/.test(x.url()) && ['PUT', 'POST'].includes(x.request().method()), {timeout: 8000}).catch(() => null);
                    await edit.getByRole('button', {name: 'Save', exact: true}).click().catch(() => {});
                    const x = await ans;
                    await sleep(1000);
                    o.pnSave = {request: x ? x.status() : 'no request sent', errors: await edit.locator('.pkpFieldError').allInnerTexts().catch(() => null)};
                    await snap('types-person-noemail-save', {facts: o.pnSave});
                    // leave with a change typed and unsaved
                    await edit.locator('input[name="email"]').fill(`${t}typed@mail.test`).catch(() => {});
                    await edit.getByRole('button', {name: 'Close', exact: true}).first().click().catch(() => {});
                    await sleep(1000);
                    const s3 = await snap('types-person-noemail-leave');
                    o.pnLeave = {dialogs: dialogs.slice(-2), dialogOpen: !!(s3.text && s3.text.dialog && /Edit/.test(s3.text.dialog.slice(0, 40)))};
                    o.pnAfter = authorsAfter(0).filter((r) => r.startsWith(String(sql(app, `select author_id from authors where publication_id = (select current_publication_id from submissions where submission_id = ${pn}) order by 1 limit 1`)) + '|'));
                }
            }
            await signOut(page).catch(() => {});
            save();
            fact('types', o);
        }

        // ------------------------------------------------------------------ failed: Rule 11
        if (on('failed') && S.files && S.files.kestrel) {
            const o = {};
            await as(`${t}cm`, S.C);
            const xml = fs.readFileSync(S.files.kestrel, 'utf8');
            const fa = outFile('s11972-invalid.xml');
            fs.writeFileSync(fa, xml.replace(new RegExp(`(<${entity}\\s[^>]*>)`), '$1<bogus_element>x</bogus_element>'));
            o.invalid = await importFile(S.C, fa, 'failed-invalid');
            if (S.files.all) {
                const all = fs.readFileSync(S.files.all, 'utf8');
                const blocks = [...all.matchAll(new RegExp(`<${entity}\\s[\\s\\S]*?</${entity}>`, 'g'))].map((x) => x[0]);
                const k = blocks.find((b) => b.includes('Kestrel submitted'));
                if (k && blocks.length > 1) {
                    const first = k.replace(/Kestrel submitted/g, 'Ibis before failure');
                    const second = k.replace(/Kestrel submitted/g, 'Jackal failing').replace(new RegExp(`(<${entity}\\s[^>]*?)\\slocale="[^"]*"`), `$1 locale="en_${'X'.repeat(40)}"`);
                    const two = all.slice(0, all.indexOf(blocks[0])) + first + '\n' + second + all.slice(all.indexOf(blocks[blocks.length - 1]) + blocks[blocks.length - 1].length);
                    const fb = outFile('s11972-partway.xml');
                    fs.writeFileSync(fb, two);
                    o.partway = await importFile(S.C, fb, 'failed-partway');
                    o.ibisSearch = await dashboardSearch(S.C, 'Ibis');
                    await snap('failed-dashboard-ibis', {facts: o.ibisSearch});
                }
            }
            const f35 = path.resolve(REPO, process.env.F35_DIR || '.reports/issues-h21f/h21f', `a26-file-export-f35-out-${app.name}.xml`);
            if (fs.existsSync(f35)) {
                o.f35 = await importFile(S.C, f35, 'failed-f35');
                o.f35.panel = flat(o.f35.press.panel, 1500);
            } else o.f35 = 'no 3.5 file';
            await signOut(page).catch(() => {});
            fact('failed', o);
        }

        // ------------------------------------------------------------------ problems: Rule 12, 12a
        if (on('problems') && S.files && S.files.kestrel) {
            const o = {};
            await as(`${t}cm`, S.C);
            const xml = fs.readFileSync(S.files.kestrel, 'utf8');
            if (isOJS) {
                let x = xml.replace(/Kestrel submitted/g, 'Lynx issue problem');
                x = x.replace(/(<publication\s[^>]*?)(\s*>)/, (all, a, b) => (/date_published=/.test(a) ? a : `${a} date_published="2026-01-02"`) + b);
                x = x.replace(/(\s*)<\/publication>/, '$1  <issue_identification><volume>99</volume><number>9</number><year>2099</year></issue_identification>$1</publication>');
                const f = outFile('s11972-issue99.xml'); fs.writeFileSync(f, x);
                o.issue = await importFile(S.C, f, 'problems-issue');
                o.issues = sql(app, `select i.issue_id, i.volume, i.number, i.year, i.published, (select count(*) from publications p where p.issue_id = i.issue_id) from issues i where journal_id = ${ctxId(S.C)}`).split('\n');
                await go(cu(S.C, '/manageIssues')); await sleep(1500); await idle(page).catch(() => {});
                await snap('problems-future-issues');
            }
            if (!isOMP) {
                const x = xml.replace(/Kestrel submitted/g, 'Mink section problem').replace(/section_ref="[^"]*"/g, 'section_ref="ZZZ"');
                const f = outFile('s11972-sectionzzz.xml'); fs.writeFileSync(f, x);
                o.section = await importFile(S.C, f, 'problems-section');
                o.minkRows = sql(app, `select s.submission_id, s.stage_id, coalesce(s.current_publication_id::text,'<null>'), (select count(*) from publications p where p.submission_id = s.submission_id) from submissions s where context_id = ${ctxId(S.C)} order by 1 desc limit 1`).split('\n');
                o.active = await dashboardView(S.C, 'active');
                await snap('problems-dashboard-active', {facts: o.active});
                await openNative(S.C);
                await page.getByRole('tab', {name: exportTabName, exact: true}).first().click().catch(() => {});
                await sleep(2500); await idle(page).catch(() => {});
                o.exportListAfter = {items: await page.locator('#exportSubmissions-tab .listPanel__item').count().catch(() => null), text: flat(await page.locator('#exportSubmissions-tab').innerText().catch(() => null), 600)};
                await snap('problems-export-list-after-section', {facts: o.exportListAfter});
            } else {
                const x = xml.replace(/Kestrel submitted/g, 'Mink series problem').replace(/(<series[\s\S]*?<path>)[^<]*(<\/path>)/, '$1zzz$2');
                o.srcSeries = flat((xml.match(/<series[\s\S]*?<\/series>/) || [null])[0], 400);
                const f = outFile('s11972-serieszzz.xml'); fs.writeFileSync(f, x);
                o.series = await importFile(S.C, f, 'problems-series');
                o.seriesRows = sql(app, `select series_id, path, seq, (select setting_value from series_settings ss where ss.series_id = s.series_id and setting_name = 'title' limit 1) from series s where press_id = ${ctxId(S.C)}`).split('\n');
            }
            await signOut(page).catch(() => {});
            fact('problems', o);
        }

        // ------------------------------------------------------------------ sweep: a file up and not imported, left; the results tab's "Close"
        if (on('sweep') && S.files && S.files.kestrel) {
            const o = {};
            const f = outFile('s11972-type-person-noemail.xml');
            await as(`${t}nm`, S.N);
            const n0 = subCount(S.N);
            o.open = await openNative(S.N);
            o.up = await upload(fs.existsSync(f) ? f : S.files.kestrel);
            await page.getByRole('tab', {name: exportTabName, exact: true}).first().click().catch(() => {});
            await sleep(1500);
            await page.getByRole('tab', {name: 'Import', exact: true}).first().click().catch(() => {});
            await sleep(800);
            o.boxAfterTabSwitch = flat(await page.locator('#importXmlForm').innerText().catch(() => null), 300);
            await snap('sweep-file-up');
            const d0 = dialogs.length;
            o.leave = await go(cu(S.N, '/dashboard/editorial'));
            o.leaveDialogs = dialogs.slice(d0);
            o.leaveUrl = rel(page.url());
            o.addedByLeaving = subCount(S.N) - n0;
            // an import, then the results tab's "Close"
            o.open2 = await openNative(S.N);
            o.up2 = await upload(fs.existsSync(f) ? f : S.files.kestrel);
            o.press = await pressImport();
            const closeBtn = page.locator('#importExportTabs [role="tab"][aria-selected="true"]').getByText('Close');
            await loc(page, 'Native XML Plugin › results tab: its "Close"', page.locator('#importExportTabs [role="tab"]').getByText('Close'));
            o.closeCount = await closeBtn.count();
            if (o.closeCount) { await closeBtn.first().click().catch(() => {}); await sleep(1000); }
            o.tabsAfterClose = (await tabsNow()).map((x) => `${x.text}${x.selected ? '*' : ''}`);
            await snap('sweep-after-close', {facts: {tabs: o.tabsAfterClose}});
            o.addedTotal = subCount(S.N) - n0;
            await signOut(page).catch(() => {});
            fact('sweep', o);
        }

        // ------------------------------------------------------------------ brokenview {OJS OPS}: Rule 12a, the kept submission's "View"
        if (on('brokenview') && !isOMP && S.C) {
            const o = {};
            await as(`${t}cm`, S.C);
            o.active = await dashboardView(S.C, 'active');
            const row = page.locator('main table tbody tr').filter({hasNotText: /Lynx|Kestrel|Ibis|Jackal/}).first();
            o.rowText = flat(await row.innerText().catch(() => null), 200);
            const view = row.getByRole('button', {name: /View/}).or(row.getByRole('link', {name: /View/})).first();
            o.viewCount = await view.count();
            if (o.viewCount) {
                const u0 = page.url();
                await view.click().catch((e) => { o.clickError = flat(e.message, 200); });
                await sleep(2500); await idle(page).catch(() => {});
                const s = await snap('brokenview-after-view');
                o.urlChanged = rel(page.url()) !== rel(u0);
                o.url = rel(page.url());
                o.dialog = flat(s.text && s.text.dialog, 400);
            }
            await signOut(page).catch(() => {});
            fact('brokenview', o);
        }

        // ------------------------------------------------------------------ cli: Rule 20b, OMP6
        if (on('cli') && S.files) {
            const o = {};
            if (S.files.heron) {
                const n0 = subCount(S.D);
                o.importHeron = cli(app, ['import', S.files.heron, S.D, `${t}dm`]);
                o.importHeron.added = subCount(S.D) - n0;
                o.dRows = sql(app, `select submission_id, stage_id, status from submissions where context_id = ${ctxId(S.D)} order by 1`).split('\n');
            }
            if (S.files.kestrel) {
                const n0 = subCount(S.D);
                o.importKestrel = cli(app, ['import', S.files.kestrel, S.D, `${t}dm`]);
                o.importKestrel.added = subCount(S.D) - n0;
            }
            fact('cli', o);
        }
    } catch (e) {
        fact('error', flat(e.stack, 1500));
        await snap('error').catch(() => {});
    } finally {
        fact('dialogs', dialogs);
        await close();
    }
});
