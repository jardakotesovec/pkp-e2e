// U45 claim check, housekeeping chunk I45 (hk-1123, 2026-11-23): the incidentals row "Tools › Crossref XML Export
// Plugin, exporting an article: on main the export fails before any XML is produced, in OJS and in OPS (two different
// faults); 3.5 exports". Spec docs/specs/U45-dois.md Rule 29 ("Export DOIs"), Rule 29b, Rule 44, Coverage "No seed"
// (the "Export DOIs" download); footnotes p r f-a13 q51 f-ojs2 q49 q52 q54 x q26.
//
// Every way main offers to export a Crossref record of an article (OJS) or a preprint (OPS), driven on a scratch
// context with Crossref configured: the DOIs page's "Bulk Actions" › "Export DOIs", and Tools › "Import/Export" ›
// "Crossref XML Export Plugin" (also opened from the Plugins list's "Import/Export Data"). OMP (no Crossref plugin):
// a read-only control on publicknowledge as manager.maya.
//
// Scratch context per app and run (tag prefix u45i), through POST scenarios/context: prefix 10.1234, Crossref enabled,
// chosen and configured (depositor fields; OJS publisher + online ISSN, issue Vol. 1 No. 1 (2025) published).
// Works, all published with a DOI (a 2 x 2 of the shapes): w1 one contributor, no galley; w2 one contributor, a PDF
// galley; w3 three contributors, no galley; w4 three contributors, a PDF galley; w5 the richer end (submitter ax with an
// affiliation and a verified ORCID iD, two references, three contributors, a galley). Users: mg (manager), ed (OJS
// editor), se (section editor / moderator), au and ax (authors).
//
// Phases (PHASES=seed,dois,files,refuse,content,vyes,jobdeposit,issue,tools,pk,leave; default all, in that order),
// state in outFile('i45-state.json'), a phase runs once per state (delete the state file, or take a new PROBE_RUN,
// for a fresh drive). On 2026-11-23 r1 and r2 seeded w5 with a bare ORCID iD; the script now seeds the stored form,
// `https://orcid.org/<iD>`. The phases:
//   seed   the context and works
//   dois   as mg: the DOIs page, "Export DOIs" per work, then all five; as ed (OJS) one work. Each: the window, the
//          API answer (status and body), the windows and notices that follow, any download, the server log since,
//          new crossref files in the install's temp folder
//   files  server-side reads, no request: each work's Crossref file built by xml-build.php (beside this script; the
//          plugin's own export, format check off) into outFile('i45-xml-<work>.xml'), checked against Crossref's 5.4.0
//          schema by shared/playwright/checks/sync/pkp-lib-13807/validate.php (fetches crossref.org); then the
//          command-line export, php tools/importExport.php CrossrefExportPlugin export outFile('i45-cli-<work>.xml') …
//   refuse as mg: "Export DOIs" with an unpublished work (u1, seeded here) ticked beside w2, and with a published work
//          whose only DOI was cleared on screen first (x1, seeded here, one contributor, no galley: expanded view ›
//          "Edit", the box emptied, "Save"); then a typed address of an import/export plugin this app lacks (the
//          control for the press's answer to Tools › …/plugin/CrossrefExportPlugin)
//   content Rule 29b's file contents. Seeded published (the boxes' stored HTML, as the "Title & Abstract" page posts
//          it): t1 "Title" `hkrb forest trees &amp; <i>shrubs</i>`, "Subtitle" `rocks &amp; sand`; t2 "Title"
//          `hkrb a &lt;b&gt; c <i>plain</i>`, no subtitle. On screen as mg: w1 "Create New Version" (minor), its
//          "Prefix" typed `L'` and saved, published (OJS into Vol. 1 No. 1 (2025)); w4 "Create New Version" (major),
//          published. Then the files of w1, w4, t1, t2 built and checked as in `files` (outFile('i45-xml2-<work>.xml'))
//   vyes   (OJS) as mg: Settings › Distribution › DOIs › "Setup" › "DOI Versioning" "Yes" › "Save"; w4's file (1.0 and 2.0
//          sharing one DOI, made under "No"); w1 "Create New Version" (major), published, given its own DOI; w1's file
//          (1.1 and 2.0); then "No" saved again (an OJS journal left on "Yes" breaks the OAI, U19 A22). Files as in
//          `content` (outFile('i45-xml3-<work>.xml'))
//   jobdeposit as mg: "Deposit DOIs" on w2 (one version, a galley), then the fleet's queue run by the job tool (the
//          kit's drainJobs: every feature's queued jobs on the fleet) while a watcher process copies each Crossref
//          file the deposit writes into the install's temp folder (deleted right after the send) to
//          outFile('i45-sent-<n>.xml'): what a deposit run by the job tool sends (its <resource> addresses)
//   issue  (OJS) a second scratch journal I (Crossref configured, kinds "Articles" and "Issues", Vol. 1 No. 1 (2025)
//          published, Vol. 1 No. 2 (2026) not): as its mg, the DOIs page's "Issues" tab, "Assign DOIs" on both issues,
//          then "Export DOIs" with the unpublished issue ticked, and with the published one alone
//   tools  as mg: Tools › Import/Export, the Crossref page and its two links, the Plugins list row's actions and its
//          "Import/Export Data"; the plugin page as ed (OJS), se, au
//   pk     read only, publicknowledge (no agency plugin enabled) as manager.maya: Tools › Import/Export's plugin
//          links, and the Plugins list's Crossref and DataCite rows (the "whether or not enabled" end of Rule 44)
//   leave  the DOIs page left with two works ticked (unsaved selection): what asks on the way out
//
// Run (one app per call, under the shared app lock; r1 and r2 are independent: each seeds its own context):
//   bin/app-lock.sh shared ojs -- env PROBE_RUN=r1 PROBE_FEATURE=U45 PROBE_AGENT=ccI45 PROBE_NOTES_FEATURE=U45 \
//       node bin/probe.js ojs shared/playwright/checks/U45/I45/i45.js        (then ops, then omp; then PROBE_RUN=r2)
// Outputs .reports/U45/ccI45/: i45-facts-<run>-<app>.json, i45-<nnn>-<step>-<run>-<app>.json/.png, run records.
// No other script or file is read. No assertions: the script records, the reader judges.
const fs = require('fs');
const path = require('path');
const {execFileSync, spawn} = require('child_process');
const {forEachApp, launch, signIn, screen, shot, record, loc, note, idle, tag, outFile, serverLog, drainJobs} = require('../../../probe');

const T = 30_000;
const T0 = Date.now();
const ALL = ['seed', 'dois', 'files', 'refuse', 'content', 'vyes', 'jobdeposit', 'issue', 'tools', 'pk', 'leave'];
const PHASES = (process.env.PHASES || ALL.join(',')).split(',');
const on = (p) => PHASES.includes(p);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (s, n = 1500) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));
const strip = (u) => String(u).replace(/^https?:\/\/[^/]+/, '');

forEachApp(async (app) => {
    const isOJS = app.name === 'ojs';
    const isOMP = app.name === 'omp';
    const log = (...a) => console.log(`[i45 ${app.name} +${Math.round((Date.now() - T0) / 1000)}s]`, ...a);
    const sf = outFile('i45-state.json');
    const S = fs.existsSync(sf) ? JSON.parse(fs.readFileSync(sf, 'utf8')) : {};
    const save = () => fs.writeFileSync(sf, JSON.stringify(S, null, 1));
    const done = (p) => (S.done || []).includes(p);
    const markDone = (p) => { S.done = [...new Set([...(S.done || []), p])]; save(); };
    const fact = (k, v) => { record('i45-facts', {[k]: v}, {merge: true}); log(k, JSON.stringify(v).slice(0, 1800)); };
    const slog = serverLog(app, {match: /./});
    const cfg = fs.readFileSync(path.isAbsolute(app.configFile) ? app.configFile : path.resolve(__dirname, '../../../../..', app.configFile), 'utf8');
    const filesDir = (cfg.match(/^files_dir\s*=\s*"?([^"\n]+?)"?\s*$/m) || [])[1];
    const tempDir = filesDir ? path.join(filesDir, 'temp') : null;
    const tempList = () => (tempDir && fs.existsSync(tempDir) ? fs.readdirSync(tempDir).filter((f) => /crossref/i.test(f)) : []);

    // ------------------------------------------------------------------ seed
    if (!isOMP && on('seed') && !done('seed')) {
        const t = tag('u45i');
        const roles = [['mg', ['manager'], 'Mona', 'Manager'], ['se', ['sectionEditor'], 'Sami', 'Section'], ['au', ['author'], 'Ada', 'Lovelace'],
            ['ax', ['author'], 'Ines', 'Moreau', {affiliation: 'I45 University'}]];
        if (isOJS) roles.push(['ed', ['editor'], 'Edda', 'Editor']);
        try {
            const res = await app.api.createContext({tag: t,
                context: {name: `U45 I45 ${t}`, acronym: 'I45', contactName: 'I45 Contact', contactEmail: `${t}c@mail.test`, country: 'CA'},
                users: roles.map(([u, r, g, f, more]) => ({username: `${t}${u}`, roles: r, givenName: g, familyName: f, ...(more || {})})),
                doiPrefix: '10.1234',
                plugins: {crossrefplugin: {enabled: true, settings: {depositorName: 'I45 Depositor', depositorEmail: `${t}dep@mail.test`}}},
                registrationAgency: 'crossrefplugin',
                ...(isOJS ? {publisherInstitution: 'I45 Press', onlineIssn: '0378-5955', issues: [{volume: 1, number: 1, year: 2025, published: true}]} : {})});
            S.C = {path: res.path || t, id: res.contextId, u: Object.fromEntries(roles.map(([u]) => [u, `${t}${u}`])), subs: {}};
        } catch (e) { S.C = {error: flat(e.message, 800)}; }
        save();
        const C = S.C;
        if (!C.error) {
            const galley = {galleys: [{label: 'PDF', file: isOJS ? 'article.pdf' : 'preprint.pdf'}]};
            const many = {contributors: [{givenName: 'Bram', familyName: 'Okafor', email: `${C.path}b@mail.test`},
                {givenName: 'Chen', familyName: 'Liang', email: `${C.path}c@mail.test`}]};
            const shapes = {w1: ['Okapi forest census', {}], w2: ['Tapir seed dispersal', galley],
                w3: ['Wombat burrow geometry', many], w4: ['Puffin burrow sharing', {...many, ...galley}],
                // the richer end: a submitter with an affiliation and a verified ORCID iD, references, three contributors, a galley
                w5: ['Heron wading depth', {...many, ...galley, submitter: C.u.ax, author: {orcid: 'https://orcid.org/0000-0002-1825-0097', orcidIsVerified: true},
                    citationsRaw: ['Alpha study 2020. https://doi.org/10.1234/abcd', 'Beta survey of wading birds. Ornis 12 (2019) 1-9.']}]};
            for (const [k, [title, extra]] of Object.entries(shapes)) {
                try {
                    const r = await app.api.createSubmission({tag: `${C.path}${k}`, context: C.path, submitter: C.u.au, title, published: true,
                        ...(isOJS ? {issue: {volume: 1, number: 1, year: 2025}} : {}), ...extra});
                    C.subs[k] = {id: r.submissionId, pub: r.publicationId, title, galleys: r.galleys || null};
                } catch (e) { C.subs[k] = {error: flat(e.message, 600), title}; }
                save();
            }
        }
        markDone('seed');
        fact('seed', S.C);
    }

    const ctxUrl = (ctx, p) => app.url(`/index.php/${ctx}${p}`);
    const {page, close} = await launch(app);
    page.setDefaultTimeout(T);
    let seq = S.seq || 0;
    const snap = async (name, extra) => {
        let s;
        try { s = await screen(page); } catch (e) { s = {url: page.url(), screenError: flat(e.message, 200)}; }
        if (extra) s.facts = extra;
        const n = `i45-${String(++seq).padStart(3, '0')}-${name}`;
        S.seq = seq; save();
        record(n, s);
        await shot(page, n).catch(() => {});
        return n;
    };
    let who = null;
    const as = async (user, ctx) => {
        if (who === `${user}@${ctx}`) return;
        await signIn(page, user, {contextPath: ctx});
        await idle(page).catch(() => {});
        who = `${user}@${ctx}`;
    };
    // every window the page opens, as it opens (a result window can close before a settled read)
    await page.addInitScript(() => {
        window.__i45d = [];
        const seen = new WeakMap();
        const scan = () => document.querySelectorAll('[role="dialog"], [role="alertdialog"]').forEach((n) => {
            const t = n.innerText.replace(/\s+/g, ' ').trim();
            if (!t || seen.get(n) === t) return;
            seen.set(n, t);
            window.__i45d.push(t.slice(0, 1500));
        });
        new MutationObserver(scan).observe(document, {childList: true, subtree: true, characterData: true});
    });
    const takeDialogs = async () => page.evaluate(() => { const n = window.__i45d || []; window.__i45d = []; return n; }).catch(() => []);
    let traffic = [];
    page.on('response', async (r) => {
        const u = r.url();
        if (!/\/api\/v1\/dois|importexport|\$\$\$call\$\$\$/.test(u)) return;
        if (r.request().method() === 'GET' && !/\/exports\/|importexport/.test(u)) return;
        const e = {method: r.request().method(), override: r.request().headers()['x-http-method-override'] || null,
            url: strip(u), status: r.status(), post: flat(r.request().postData(), 300),
            type: r.headers()['content-type'] || null, disposition: r.headers()['content-disposition'] || null};
        if (!/\/exports\//.test(u) && !/importexport/.test(u)) e.body = flat(await r.text().catch(() => null), 2500);
        traffic.push(e);
    });
    const takeTraffic = () => { const t = traffic; traffic = []; return t; };
    const downloads = [];
    page.on('download', async (d) => {
        const name = d.suggestedFilename();
        const dest = outFile(`i45-dl-${Date.now()}-${name.replace(/[^a-z0-9._-]/gi, '_')}`);
        const entry = {suggested: name, url: strip(d.url()), saved: path.basename(dest)};
        downloads.push(entry);
        try {
            await d.saveAs(dest);
            const txt = fs.readFileSync(dest, 'utf8');
            entry.bytes = txt.length;
            entry.head = flat(txt.slice(0, 600), 600);
            entry.dois = [...new Set(txt.match(/<doi>[^<]+<\/doi>/g) || [])];
            entry.records = (txt.match(/<(journal_article|posted_content)[\s>]/g) || []).length;
            entry.surnames = txt.match(/<surname>[^<]*<\/surname>/g) || [];
        } catch (e) { entry.err = flat(e.message, 200); }
    });

    // ------------------------------------------------------------------ DOIs page helpers
    const gotoDois = async (ctx) => {
        const r = await page.goto(ctxUrl(ctx, '/dois'));
        await idle(page).catch(() => {});
        await page.locator('.listPanel__item--doi:visible, .listPanel__empty:visible').first().waitFor({timeout: 15000}).catch(() => {});
        await sleep(800);
        return r ? r.status() : null;
    };
    const panel = () => page.locator('.doiListPanel:visible').first();
    const rowOf = (id) => page.locator(`[id$="-${id}"].listPanel__item--doi:visible`).first();
    const rowsText = async () => page.locator('.listPanel__item--doi:visible').evaluateAll((els) => els.map((e) => ({
        id: e.id, text: e.querySelector('.listPanel__itemSummary')?.innerText.replace(/\s+/g, ' ').trim().slice(0, 160),
    }))).catch(() => []);
    const dialogText = async () => page.getByRole('dialog').evaluateAll((els) => els.map((e) => e.innerText.replace(/\s+/g, ' ').trim().slice(0, 1500))).catch(() => []);
    const openBulk = async () => {
        if (!(await page.locator('.pkpDropdown__action:visible').count())) {
            await panel().getByRole('button', {name: 'Bulk Actions'}).click();
            await sleep(500);
        }
        return page.locator('.pkpDropdown__action:visible').allInnerTexts().then((a) => a.map((x) => flat(x, 80))).catch(() => null);
    };
    const untickAll = async () => {
        for (const cb of await page.locator('.listPanel__item--doi:visible input[type="checkbox"]:checked').all()) await cb.uncheck().catch(() => {});
    };
    const tick = async (ids) => { for (const id of ids) await rowOf(id).locator('input[type="checkbox"]').first().check(); await sleep(250); };
    const tempBefore = () => new Set(tempList());
    async function exportDois(ids, name) {
        await untickAll();
        await tick(ids);
        const menu = await openBulk();
        await page.locator('.pkpDropdown__action:visible', {hasText: 'Export DOIs'}).first().click();
        const dlg = page.getByRole('dialog').filter({hasText: 'Export DOIs'}).last();
        await dlg.waitFor({timeout: 10000}).catch(() => {});
        await page.locator('.pkpDropdown__action:visible').first().waitFor({state: 'hidden', timeout: 3000}).catch(() => {});
        await sleep(400);
        const before = {menu, dialog: await dialogText(), buttons: await dlg.getByRole('button').allInnerTexts().catch(() => [])};
        before.snap = await snap(`${name}-window`);
        await takeDialogs(); takeTraffic(); downloads.splice(0);
        const tb = tempBefore();
        const from = slog.mark();
        await dlg.getByRole('button', {name: 'Export DOIs', exact: true}).click();
        await sleep(3500);
        await idle(page).catch(() => {});
        await sleep(1000);
        const after = {traffic: takeTraffic(), dialogsSeen: await takeDialogs(), dialogOpen: await dialogText(), downloads: downloads.splice(0),
            serverLog: slog.since(from).map((l) => flat(l, 1200)).slice(0, 40), tempNew: tempList().filter((f) => !tb.has(f))};
        after.snap = await snap(`${name}-after`);
        const ok = page.getByRole('dialog').getByRole('button', {name: /^(OK|Ok|Close)$/}).first();
        if (await ok.count()) { await ok.click().catch(() => {}); await sleep(800); }
        after.windowLeft = await dialogText();
        return {ids, before, after};
    }
    async function sect(name, fn) {
        if (!on(name) || done(name)) return;
        log(`== ${name}`);
        try { await fn(); markDone(name); } catch (e) {
            fact(`${name}.FAILED`, flat(e.stack || e, 1500));
            await snap(`zz-failed-${name}`).catch(() => {});
        }
    }

    try {
        const C = S.C;
        if (isOMP) {
            // control: a press has no Crossref plugin (publicknowledge, read only)
            await sect('tools', async () => {
                await as('manager.maya', app.contextPath);
                const o = {};
                await page.goto(ctxUrl(app.contextPath, '/management/tools'));
                await idle(page).catch(() => {});
                const ie = page.getByRole('tab', {name: /Import\/Export/i}).first();
                if (await ie.count()) { await ie.click(); await idle(page).catch(() => {}); await sleep(1200); }
                o.toolsLinks = (await page.locator('main a').evaluateAll((els) => els.map((a) => `${a.innerText.trim()} -> ${a.getAttribute('href')}`)).catch(() => []))
                    .filter((x) => /importexport/.test(x)).map(strip);
                o.toolsSnap = await snap('omp-tools');
                const r = await page.goto(ctxUrl(app.contextPath, '/management/importexport/plugin/CrossrefExportPlugin')).catch((e) => ({e: e.message}));
                await idle(page).catch(() => {});
                o.pluginPage = {status: r && r.status ? r.status() : flat(r && r.e, 200), main: flat(await page.locator('main, body').first().innerText().catch(() => null), 500)};
                o.pluginSnap = await snap('omp-crossref-page');
                await page.goto(ctxUrl(app.contextPath, '/management/settings/website'));
                await idle(page).catch(() => {});
                await page.getByRole('tab', {name: 'Plugins', exact: true}).first().click().catch(() => {});
                await page.locator('tr.gridRow').first().waitFor({timeout: 20000}).catch(() => {});
                await sleep(1000);
                o.gridRows = (await page.locator('tr.gridRow').filter({hasText: /Crossref|DataCite|DOI/i}).allInnerTexts().catch(() => [])).map((x) => flat(x, 200));
                o.gridSnap = await snap('omp-plugins');
                fact('omp-control', o);
            });
            return;
        }
        if (!C || C.error) { fact('no-context', C || null); return; }
        const ids = Object.fromEntries(Object.entries(C.subs).map(([k, v]) => [k, v.id]));

        await sect('dois', async () => {
            await as(C.u.mg, C.path);
            const o = {status: await gotoDois(C.path)};
            o.rows = await rowsText();
            o.snap = await snap('dois-mg');
            await loc(page, 'DOIs page: Bulk Actions', panel().getByRole('button', {name: 'Bulk Actions'}));
            o.menu = await openBulk();
            await loc(page, 'Bulk Actions: Export DOIs', page.locator('.pkpDropdown__action:visible', {hasText: 'Export DOIs'}));
            await page.keyboard.press('Tab').catch(() => {});
            await gotoDois(C.path);
            for (const k of ['w1', 'w2', 'w3', 'w4', 'w5']) {
                if (!ids[k]) continue;
                o[k] = await exportDois([ids[k]], `export-${k}`);
                await gotoDois(C.path);
            }
            o.all = await exportDois(Object.values(ids), 'export-all');
            fact('dois-mg', o);
            if (isOJS && C.u.ed) {
                await as(C.u.ed, C.path);
                const e = {status: await gotoDois(C.path)};
                e.snap = await snap('dois-ed');
                e.w1 = await exportDois([ids.w1], 'export-ed-w1');
                fact('dois-ed', e);
            }
        });

        // the file each work's export would carry, built on the server (format check off), checked against Crossref's
        // schema outside the app; and the plugin's own command-line export (tools/importExport.php), which checks it
        await sect('files', async () => {
            const root = path.resolve(__dirname, '../../../../..', app.root);
            const env = {...process.env, PKP_CONFIG_FILE: path.isAbsolute(app.configFile) ? app.configFile : path.resolve(__dirname, '../../../../..', app.configFile)};
            const run = (cmd, args, cwd) => {
                try { return {exit: 0, out: execFileSync(cmd, args, {cwd, env, encoding: 'utf8', timeout: 180000, stdio: ['ignore', 'pipe', 'pipe']})}; } catch (e) {
                    return {exit: e.status, out: String(e.stdout || ''), err: flat(String(e.stderr || e.message), 3000)};
                }
            };
            const o = {};
            for (const [k, id] of Object.entries(ids)) {
                const xf = outFile(`i45-xml-${k}.xml`);
                const b = run('php', [path.join(__dirname, 'xml-build.php'), root, C.path, `${id}=${xf}`], root);
                o[k] = {build: flat(b.out, 1500), buildErr: b.err || null};
                if (fs.existsSync(xf)) o[k].valid = flat(run('php', [path.join(__dirname, '../../sync/pkp-lib-13807/validate.php'), xf], root).out, 1500);
                const cf = outFile(`i45-cli-${k}.xml`);
                const from = slog.mark();
                const c = run('php', ['tools/importExport.php', 'CrossrefExportPlugin', 'export', cf, C.path, 'articles', String(id)], root);
                o[k].cli = {exit: c.exit, out: flat(c.out, 2500), err: c.err || null, file: fs.existsSync(cf) ? {bytes: fs.statSync(cf).size, head: flat(fs.readFileSync(cf, 'utf8').slice(0, 300), 300)} : null};
            }
            fact('files', o);
        });

        await sect('refuse', async () => {
            const o = {};
            for (const [k, title, extra] of [['u1', 'Narwhal tusk acoustics', isOJS ? {decisions: ['skipExternalReview']} : {}], ['x1', 'Egret plume moult', {published: true,
                ...(isOJS ? {issue: {volume: 1, number: 1, year: 2025}} : {})}]]) {
                if (C.subs[k]) continue;
                try {
                    const r = await app.api.createSubmission({tag: `${C.path}${k}`, context: C.path, submitter: C.u.au, title, ...extra});
                    C.subs[k] = {id: r.submissionId, pub: r.publicationId, title};
                } catch (e) { C.subs[k] = {error: flat(e.message, 600), title}; }
                save();
            }
            o.seeded = {u1: C.subs.u1, x1: C.subs.x1};
            await as(C.u.mg, C.path);
            await gotoDois(C.path);
            o.rows = await rowsText();
            o.unpub = await exportDois([C.subs.u1.id, ids.w2], 'refuse-unpub');
            await gotoDois(C.path);
            const r = rowOf(C.subs.x1.id);
            await r.getByRole('button', {name: new RegExp(`details about ${C.subs.x1.id}$`)}).click();
            await sleep(600);
            await r.getByRole('button', {name: 'Edit', exact: true}).click();
            await sleep(300);
            await r.locator('.listPanel__itemExpanded tbody tr input').nth(0).fill('');
            await r.getByRole('button', {name: 'Save', exact: true}).click();
            await r.getByRole('button', {name: 'Edit', exact: true}).waitFor({timeout: 15000}).catch(() => {});
            await idle(page).catch(() => {});
            await sleep(800);
            o.cleared = {traffic: takeTraffic(), row: (await rowsText()).find((x) => x.id.endsWith(`-${C.subs.x1.id}`)), snap: await snap('refuse-cleared')};
            await gotoDois(C.path);
            o.clearedReload = {row: (await rowsText()).find((x) => x.id.endsWith(`-${C.subs.x1.id}`)), snap: await snap('refuse-cleared-reload')};
            o.noDoi = await exportDois([C.subs.x1.id], 'refuse-nodoi');
            // control for the press's answer to a plugin it lacks (typed address): a plugin this app lacks
            const u = await page.goto(ctxUrl(C.path, '/management/importexport/plugin/Onix30ExportPlugin')).catch((e) => ({e: e.message}));
            await idle(page).catch(() => {});
            o.unknownPlugin = {status: u && u.status ? u.status() : flat(u && u.e, 200), title: await page.title(), body: flat(await page.locator('body').innerText().catch(() => null), 400),
                snap: await snap('unknown-plugin')};
            fact('refuse', o);
        });

        // workflow helpers (content, vyes): a new version, the Prefix box, the publish
        const vis = '[role="dialog"]:visible';
        const wf = () => page.locator(vis).first();
        const controls = () => page.locator('[data-cy="workflow-controls-right"]');
        const openWf = async (sid, pub) => {
            await page.goto(ctxUrl(C.path, `/dashboard/editorial?workflowSubmissionId=${sid}${pub ? `&workflowMenuKey=publication_${pub}_titleAbstract` : ''}`));
            await idle(page).catch(() => {});
            await wf().waitFor({timeout: T}).catch(() => {});
            await page.waitForFunction(() => !document.body.innerText.includes('Loading'), null, {timeout: 15000}).catch(() => {});
            await sleep(1200);
        };
        const newVersion = async (sid, pub, minor, name) => {
            await openWf(sid, pub);
            const link = wf().getByRole('link', {name: 'Create New Version', exact: true}).or(wf().getByRole('button', {name: 'Create New Version', exact: true})).first();
            await link.waitFor({state: 'visible', timeout: T}).catch(() => {});
            if (!(await link.isVisible().catch(() => false))) return {offered: false};
            await sleep(1200);
            await link.click();
            const w = page.getByRole('dialog').filter({has: page.locator('select[name="versionStage"]')}).last();
            await w.locator('select[name="versionStage"]').waitFor({state: 'visible', timeout: T});
            await idle(page).catch(() => {}); await sleep(1000);
            const m = w.locator('select[name="versionIsMinor"]');
            if (await m.isVisible().catch(() => false)) {
                const want = await m.evaluate((sel, mi) => { const x = [...sel.options].find((op) => (mi ? /minor/i : /major/i).test(op.text)); return x ? x.value : null; }, minor);
                if (want !== null) await m.selectOption(want);
            }
            const stage = w.locator('select[name="versionStage"]');
            if (!(await stage.inputValue().catch(() => ''))) await stage.selectOption('VoR').catch(() => {});
            const dialogText = flat(await w.innerText().catch(() => ''), 500);
            const r = page.waitForResponse((x) => /\/publications\/\d+\/version/.test(x.url()) && x.request().method() === 'POST', {timeout: T}).catch(() => null);
            await w.getByRole('button', {name: 'Confirm', exact: true}).click();
            const resp = await r;
            let newPub = null;
            if (resp) { try { newPub = (await resp.json()).id; } catch { /* none */ } }
            await w.waitFor({state: 'detached', timeout: T}).catch(() => {});
            await idle(page).catch(() => {}); await sleep(800);
            return {offered: true, dialogText, status: resp && resp.status(), newPub, snap: await snap(name)};
        };
        const typePrefix = async (sid, pub, text, name) => {
            await openWf(sid, pub);
            const box = page.locator('[id="titleAbstract-prefix-control-en"]');
            await box.waitFor({timeout: T});
            await box.click();
            await page.keyboard.press('Control+A');
            await page.keyboard.type(text, {delay: 80});
            const saved = page.waitForResponse((x) => /\/submissions\/\d+\/publications\/\d+$/.test(new URL(x.url()).pathname) && x.request().method() !== 'GET', {timeout: T}).catch(() => null);
            await page.locator('[data-cy="workflow-primary-items"]').getByRole('button', {name: 'Save', exact: true}).click();
            const x = await saved;
            const body = x ? await x.json().catch(() => null) : null;
            await idle(page).catch(() => {});
            return {status: x && x.status(), stored: body && {prefix: body.prefix && body.prefix.en, title: body.title && body.title.en}, snap: await snap(name)};
        };
        const publish = async (sid, pub, name) => {
            await openWf(sid, pub);
            const out = {};
            const button = controls().getByRole('button', {name: /^(Schedule For Publication|Publish|Post)$/}).first();
            await button.waitFor({state: 'visible', timeout: T}).catch(() => {});
            if (!(await button.isVisible().catch(() => false))) { out.noButton = await controls().getByRole('button').allInnerTexts().catch(() => []); return out; }
            await sleep(800);
            await button.click();
            const pnl = page.locator('[data-cy="active-modal"]').filter({hasText: 'Review Publishing Details'}).last();
            const confirm = page.getByRole('dialog').filter({hasText: /Are you sure you want to|will not prevent publishing|following requirements|requirements have been met/}).last();
            const which = () => Promise.race([
                pnl.locator('select[name="versionStage"], input[name="assignment"], button').first().waitFor({state: 'visible', timeout: 15000}).then(() => 'panel'),
                confirm.waitFor({state: 'visible', timeout: 15000}).then(() => 'confirm'),
            ]).catch(() => null);
            out.opened = await which();
            await idle(page).catch(() => {}); await sleep(800);
            if (out.opened === 'panel') {
                out.panel = flat(await pnl.innerText().catch(() => ''), 500);
                await snap(`${name}-panel`);
                await pnl.getByRole('button', {name: 'Confirm', exact: true}).click().catch(() => {});
                await confirm.waitFor({state: 'visible', timeout: T}).catch(() => {});
            }
            await idle(page).catch(() => {}); await sleep(800);
            out.confirm = flat(await confirm.innerText().catch(() => ''), 500);
            const w = page.waitForResponse((x) => /\/publications\/\d+\/publish/.test(x.url()) && x.request().method() !== 'GET', {timeout: T}).catch(() => null);
            await confirm.getByRole('button', {name: /^(Publish|Post|Schedule For Publication)$/}).last().click().catch((e) => { out.clickErr = flat(e.message, 150); });
            const x = await w;
            out.status = x ? x.status() : null;
            if (x && x.status() >= 400) out.body = flat(await x.text().catch(() => ''), 500);
            await controls().getByRole('button', {name: /^(Unpublish|Unpost|Unschedule)$/}).first().waitFor({timeout: T}).catch(() => {});
            await idle(page).catch(() => {});
            out.snap = await snap(name);
            return out;
        };
        await sect('content', async () => {
            const o = {};
            for (const [k, title, subtitle] of [['t1', 'hkrb forest trees &amp; <i>shrubs</i>', 'rocks &amp; sand'], ['t2', 'hkrb a &lt;b&gt; c <i>plain</i>', null]]) {
                if (C.subs[k]) continue;
                try {
                    const r = await app.api.createSubmission({tag: `${C.path}${k}`, context: C.path, submitter: C.u.au, title, ...(subtitle ? {subtitle} : {}), published: true,
                        ...(isOJS ? {issue: {volume: 1, number: 1, year: 2025}} : {})});
                    C.subs[k] = {id: r.submissionId, pub: r.publicationId, title};
                } catch (e) { C.subs[k] = {error: flat(e.message, 600), title}; }
                save();
            }
            await as(C.u.mg, C.path);
            const w1 = C.subs.w1, w4 = C.subs.w4;
            o.w1v = await newVersion(w1.id, w1.pub, true, 'content-w1-version');
            if (o.w1v.newPub) {
                o.w1prefix = await typePrefix(w1.id, o.w1v.newPub, "L'", 'content-w1-prefix');
                o.w1pub = await publish(w1.id, o.w1v.newPub, 'content-w1-publish');
            }
            o.w4v = await newVersion(w4.id, w4.pub, false, 'content-w4-version');
            if (o.w4v.newPub) o.w4pub = await publish(w4.id, o.w4v.newPub, 'content-w4-publish');
            await gotoDois(C.path);
            o.rows = await rowsText();
            o.doisSnap = await snap('content-dois');
            // the files
            const root = path.resolve(__dirname, '../../../../..', app.root);
            const env = {...process.env, PKP_CONFIG_FILE: path.isAbsolute(app.configFile) ? app.configFile : path.resolve(__dirname, '../../../../..', app.configFile)};
            const run = (args) => { try { return execFileSync('php', args, {cwd: root, env, encoding: 'utf8', timeout: 180000}); } catch (e) { return `ERR ${flat(String(e.stdout || '') + String(e.stderr || e.message), 1500)}`; } };
            o.files = {};
            for (const k of ['w1', 'w4', 't1', 't2']) {
                if (!C.subs[k] || !C.subs[k].id) continue;
                const xf = outFile(`i45-xml2-${k}.xml`);
                const b = run([path.join(__dirname, 'xml-build.php'), root, C.path, `${C.subs[k].id}=${xf}`]);
                const f = {build: flat(b, 1200)};
                if (fs.existsSync(xf)) {
                    const x = fs.readFileSync(xf, 'utf8');
                    f.titles = (x.match(/<titles>[\s\S]*?<\/titles>/g) || []).map((t) => flat(t, 400));
                    f.records = (x.match(/<doi_data>[\s\S]*?<\/doi_data>/g) || []).map((d) => flat(d.replace(/<collection[\s\S]*$/, ''), 300));
                    f.valid = flat(run([path.join(__dirname, '../../sync/pkp-lib-13807/validate.php'), xf]), 800);
                }
                o.files[k] = f;
            }
            fact('content', o);
        });

        if (isOJS) await sect('vyes', async () => {
            const o = {};
            await as(C.u.mg, C.path);
            const {DoiSettings} = require('../../../pages/DoisPages.js');
            const settings = new DoiSettings(page, C.path);
            const setVersioning = async (yes, name) => {
                await settings.goto('Setup');
                await settings.versioningRadio(yes ? 'Yes' : 'No').check();
                const x = await settings.pressSave(settings.setup).catch(() => null);
                const shown = await settings.savedStatus(settings.setup).first().waitFor({timeout: 15000}).then(() => 'Saved').catch(() => null);
                return {status: x && x.status(), shown, snap: await snap(name)};
            };
            const root = path.resolve(__dirname, '../../../../..', app.root);
            const env = {...process.env, PKP_CONFIG_FILE: path.isAbsolute(app.configFile) ? app.configFile : path.resolve(__dirname, '../../../../..', app.configFile)};
            const fileOf = (k) => {
                const xf = outFile(`i45-xml3-${k}.xml`);
                let b;
                try { b = execFileSync('php', [path.join(__dirname, 'xml-build.php'), root, C.path, `${C.subs[k].id}=${xf}`], {cwd: root, env, encoding: 'utf8', timeout: 180000}); } catch (e) { b = `ERR ${flat(String(e.stdout || '') + String(e.stderr || e.message), 1200)}`; }
                const f = {build: flat(b, 600)};
                if (fs.existsSync(xf)) {
                    const x = fs.readFileSync(xf, 'utf8');
                    f.records = (x.match(/<doi_data>[\s\S]*?<\/resource>/g) || []).map((d) => flat(d, 300));
                }
                return f;
            };
            o.yes = await setVersioning(true, 'vyes-yes');
            o.w4 = fileOf('w4');
            o.w1v2 = await newVersion(C.subs.w1.id, C.subs.w1.pub, false, 'vyes-w1-version');
            if (o.w1v2.newPub) o.w1pub = await publish(C.subs.w1.id, o.w1v2.newPub, 'vyes-w1-publish');
            await gotoDois(C.path);
            o.rows = (await rowsText()).filter((r) => /Okapi|Puffin/.test(r.text));
            o.doisSnap = await snap('vyes-dois');
            o.w1 = fileOf('w1');
            o.no = await setVersioning(false, 'vyes-no');
            fact('vyes', o);
        });

        await sect('jobdeposit', async () => {
            const o = {};
            await as(C.u.mg, C.path);
            await gotoDois(C.path);
            await untickAll();
            await tick([ids.w2]);
            await openBulk();
            await page.locator('.pkpDropdown__action:visible', {hasText: 'Deposit DOIs'}).first().click();
            const dlg = page.getByRole('dialog').filter({hasText: 'Deposit DOIs'}).last();
            await dlg.waitFor({timeout: 10000}).catch(() => {});
            await sleep(500);
            o.window = await dialogText();
            takeTraffic();
            await dlg.getByRole('button', {name: 'Deposit DOIs', exact: true}).click();
            await sleep(2500); await idle(page).catch(() => {});
            o.answer = takeTraffic().filter((t) => t.method !== 'GET').map((t) => `${t.status} ${t.url} ${flat(t.body, 200)}`);
            o.after = await snap('jobdeposit-after');
            // the watcher: copies every new Crossref file of the temp folder the moment it appears
            const pfx = outFile('i45-sent.xml').replace(/\.xml$/, '');
            const watcher = spawn(process.execPath, ['-e', `
                const fs = require('fs'), path = require('path'); const dir = process.argv[1], pfx = process.argv[2]; let n = 0; const seen = new Set(fs.readdirSync(dir));
                const grab = (f) => { if (!/crossref/i.test(f) || seen.has(f)) return; try { const b = fs.readFileSync(path.join(dir, f)); if (!b.length) return; seen.add(f); fs.writeFileSync(pfx + '-' + (++n) + '.xml', b); } catch (e) {} };
                fs.watch(dir, (ev, f) => f && grab(f)); setInterval(() => fs.readdirSync(dir).forEach(grab), 2);
            `, tempDir, pfx], {stdio: 'ignore'});
            await sleep(800);
            const before = new Set(fs.readdirSync(path.dirname(pfx)));
            const from = slog.mark();
            o.drain = flat(JSON.stringify(await drainJobs(app).catch((e) => ({error: e.message}))), 1500);
            await sleep(1000);
            watcher.kill();
            o.copies = fs.readdirSync(path.dirname(pfx)).filter((f) => !before.has(f) && f.startsWith(path.basename(pfx))).map((f) => {
                const x = fs.readFileSync(path.join(path.dirname(pfx), f), 'utf8');
                return {file: f, dois: x.match(/<doi>[^<]+<\/doi>/g) || [], resources: (x.match(/<resource[^>]*>[^<]+<\/resource>/g) || []).map((r) => r.replace(/https?:\/\/[^/]+/, ''))};
            });
            o.serverLog = slog.since(from).filter((l) => /error|exception|fatal/i.test(l)).map((l) => flat(l, 300)).slice(0, 10);
            await gotoDois(C.path);
            o.row = (await rowsText()).find((x) => x.id.endsWith(`-${ids.w2}`));
            o.rowSnap = await snap('jobdeposit-dois');
            fact('jobdeposit', o);
        });

        if (isOJS) await sect('issue', async () => {
            const o = {};
            if (!S.I) {
                const t = tag('u45ii');
                try {
                    const res = await app.api.createContext({tag: t,
                        context: {name: `U45 I45 issues ${t}`, acronym: 'I45I', contactName: 'I45 Contact', contactEmail: `${t}c@mail.test`, country: 'CA'},
                        users: [{username: `${t}mg`, roles: ['manager'], givenName: 'Mona', familyName: 'Manager'}],
                        doiPrefix: '10.1234', enabledDoiTypes: ['publication', 'issue'],
                        plugins: {crossrefplugin: {enabled: true, settings: {depositorName: 'I45 Depositor', depositorEmail: `${t}dep@mail.test`}}},
                        registrationAgency: 'crossrefplugin', publisherInstitution: 'I45 Press', onlineIssn: '0378-5955',
                        issues: [{volume: 1, number: 1, year: 2025, published: true}, {volume: 1, number: 2, year: 2026}]});
                    S.I = {path: res.path || t, mg: `${t}mg`};
                } catch (e) { S.I = {error: flat(e.message, 800)}; }
                save();
            }
            o.ctx = S.I;
            if (S.I.error) { fact('issue', o); return; }
            await as(S.I.mg, S.I.path);
            await page.goto(ctxUrl(S.I.path, '/dois'));
            await idle(page).catch(() => {});
            await page.getByRole('tab', {name: 'Issues', exact: true}).click();
            await idle(page).catch(() => {});
            await sleep(1500);
            const ipanel = () => page.locator('.doiListPanel:visible').first();
            const irows = async () => page.locator('.listPanel__item--doi:visible').evaluateAll((els) => els.map((e) => ({id: e.id, text: e.querySelector('.listPanel__itemSummary')?.innerText.replace(/\s+/g, ' ').trim().slice(0, 140)})));
            o.rows = await irows();
            o.tabSnap = await snap('issue-tab');
            const tickRow = async (re) => { await page.locator('.listPanel__item--doi:visible').filter({hasText: re}).first().locator('input[type="checkbox"]').first().check(); await sleep(250); };
            const untick = async () => { for (const cb of await page.locator('.listPanel__item--doi:visible input[type="checkbox"]:checked').all()) await cb.uncheck().catch(() => {}); };
            const bulk = async (label, name) => {
                await ipanel().getByRole('button', {name: 'Bulk Actions'}).click();
                await sleep(500);
                await page.locator('.pkpDropdown__action:visible', {hasText: label}).first().click();
                const dlg = page.getByRole('dialog').filter({hasText: label}).last();
                await dlg.waitFor({timeout: 10000}).catch(() => {});
                await sleep(400);
                const before = await dialogText();
                await takeDialogs(); takeTraffic(); downloads.splice(0);
                await dlg.getByRole('button', {name: label, exact: true}).click();
                await sleep(3000); await idle(page).catch(() => {}); await sleep(800);
                const r = {before, traffic: takeTraffic().filter((t) => t.method !== 'GET').map((t) => `${t.status} ${t.url} ${flat(t.body, 300)}`), dialogsSeen: await takeDialogs(), downloads: downloads.splice(0), snap: await snap(name)};
                const ok = page.getByRole('dialog').getByRole('button', {name: /^(OK|Ok|Close)$/}).first();
                if (await ok.count()) { await ok.click().catch(() => {}); await sleep(800); }
                return r;
            };
            await tickRow(/Vol\. 1 No\. 1/); await tickRow(/Vol\. 1 No\. 2/);
            o.assign = await bulk('Assign DOIs', 'issue-assign');
            o.rowsAfterAssign = await irows();
            await untick();
            await tickRow(/Vol\. 1 No\. 2/);
            o.unpub = await bulk('Export DOIs', 'issue-export-unpub');
            await untick();
            await tickRow(/Vol\. 1 No\. 1/);
            o.pub = await bulk('Export DOIs', 'issue-export-pub');
            fact('issue', o);
        });

        await sect('tools', async () => {
            const o = {};
            await as(C.u.mg, C.path);
            await page.goto(ctxUrl(C.path, '/management/tools'));
            await idle(page).catch(() => {});
            o.tabs = await page.getByRole('tab').allInnerTexts().catch(() => []);
            const ie = page.getByRole('tab', {name: /Import\/Export/i}).first();
            if (await ie.count()) { await ie.click(); await idle(page).catch(() => {}); await sleep(1200); }
            o.toolsLinks = (await page.locator('main a').evaluateAll((els) => els.map((a) => `${a.innerText.trim()} -> ${a.getAttribute('href')}`)).catch(() => []))
                .filter((x) => /importexport/.test(x)).map(strip);
            o.toolsSnap = await snap('tools-mg');
            const xlink = page.locator('main a', {hasText: 'Crossref XML Export Plugin'}).first();
            await loc(page, 'Tools › Import/Export: Crossref XML Export Plugin link', xlink);
            takeTraffic();
            const from = slog.mark();
            if (await xlink.count()) { await xlink.click(); await page.waitForLoadState('load').catch(() => {}); await idle(page).catch(() => {}); await sleep(800); }
            o.page = {url: strip(page.url()), title: await page.title(), h1: await page.locator('main h1').first().innerText().catch(() => null),
                main: flat(await page.locator('main').innerText().catch(() => null), 800),
                controls: await page.locator('main a, main button, main input, main select, main form').evaluateAll((els) => els.map((e) => `${e.tagName} ${e.innerText?.trim() || e.getAttribute('name') || ''} -> ${e.getAttribute('href') || ''}`)).catch(() => []),
                traffic: takeTraffic(), serverLog: slog.since(from).filter((l) => /error|exception|fatal|warn|\[5\d\d\]/i.test(l)).map((l) => flat(l, 600))};
            o.pageSnap = await snap('crossref-page-mg');
            const links = page.locator('main a');
            const n = await links.count();
            o.follow = [];
            for (let i = 0; i < n; i++) {
                const text = await links.nth(i).innerText().catch(() => null);
                const href = await links.nth(i).getAttribute('href').catch(() => null);
                await links.nth(i).click().catch(() => {});
                await page.waitForLoadState('load').catch(() => {});
                await idle(page).catch(() => {});
                await sleep(800);
                o.follow.push({text, href: strip(href), landed: strip(page.url()), h1: await page.locator('main h1').first().innerText().catch(() => null),
                    selectedTabs: await page.locator('[role=tab][aria-selected=true]').allInnerTexts().catch(() => []), snap: await snap(`crossref-page-link${i}`)});
                await page.goto(ctxUrl(C.path, '/management/importexport/plugin/CrossrefExportPlugin'));
                await idle(page).catch(() => {});
            }
            // the Plugins list's row and its "Import/Export Data"
            await page.goto(ctxUrl(C.path, '/management/settings/website'));
            await idle(page).catch(() => {});
            await page.getByRole('tab', {name: 'Plugins', exact: true}).first().click().catch(() => {});
            await page.locator('tr.gridRow').first().waitFor({timeout: 20000}).catch(() => {});
            await sleep(1000);
            const rows = page.locator('tr.gridRow').filter({hasText: /Crossref/i});
            o.grid = [];
            for (let i = 0; i < await rows.count(); i++) {
                const row = rows.nth(i);
                const ex = row.locator('a.show_extras');
                if (await ex.count()) { await ex.click().catch(() => {}); await sleep(600); }
                const actions = await row.locator('xpath=following-sibling::tr[1]').locator('a').evaluateAll((els) => els.map((a) => `${a.innerText.trim()} -> ${a.getAttribute('href') || ''}`)).catch(() => []);
                o.grid.push({row: flat(await row.innerText(), 160), enabled: await row.locator('input[type=checkbox]').first().isChecked().catch(() => null), actions: actions.map(strip)});
            }
            o.gridSnap = await snap('plugins-grid-mg');
            const xrow = rows.filter({hasText: 'Crossref XML Export Plugin'}).first();
            const ied = xrow.locator('xpath=following-sibling::tr[1]').getByRole('link', {name: 'Import/Export Data', exact: true});
            await loc(page, 'Plugins: Crossref XML Export Plugin › Import/Export Data', ied);
            if (await ied.count()) {
                await ied.click().catch(() => {});
                await page.waitForLoadState('load').catch(() => {});
                await idle(page).catch(() => {});
                await sleep(800);
                o.fromGrid = {url: strip(page.url()), main: flat(await page.locator('main').innerText().catch(() => null), 400)};
                o.fromGridSnap = await snap('crossref-page-from-grid');
            }
            fact('tools-mg', o);
            // the plugin page per level
            const lv = {};
            for (const k of [isOJS ? 'ed' : null, 'se', 'au'].filter(Boolean)) {
                await as(C.u[k], C.path);
                const r = await page.goto(ctxUrl(C.path, '/management/importexport/plugin/CrossrefExportPlugin')).catch((e) => ({e: e.message}));
                await idle(page).catch(() => {});
                lv[k] = {status: r && r.status ? r.status() : flat(r && r.e, 200), url: strip(page.url()), main: flat(await page.locator('main, body').first().innerText().catch(() => null), 400)};
                lv[k].snap = await snap(`crossref-page-${k}`);
                const t = await page.goto(ctxUrl(C.path, '/management/tools')).catch((e) => ({e: e.message}));
                await idle(page).catch(() => {});
                lv[k].tools = {status: t && t.status ? t.status() : null, main: flat(await page.locator('main, body').first().innerText().catch(() => null), 300)};
                lv[k].toolsSnap = await snap(`tools-${k}`);
            }
            fact('tools-levels', lv);
        });

        await sect('pk', async () => {
            const o = {};
            await as('manager.maya', app.contextPath);
            await page.goto(ctxUrl(app.contextPath, '/management/tools'));
            await idle(page).catch(() => {});
            const ie = page.getByRole('tab', {name: /Import\/Export/i}).first();
            if (await ie.count()) { await ie.click(); await idle(page).catch(() => {}); await sleep(1200); }
            o.toolsLinks = (await page.locator('main a').evaluateAll((els) => els.map((a) => a.innerText.trim() + ' -> ' + a.getAttribute('href'))).catch(() => []))
                .filter((x) => /importexport\/plugin/.test(x)).map((x) => x.split(' -> ')[0]);
            o.toolsSnap = await snap('pk-tools');
            await page.goto(ctxUrl(app.contextPath, '/management/settings/website'));
            await idle(page).catch(() => {});
            await page.getByRole('tab', {name: 'Plugins', exact: true}).first().click().catch(() => {});
            await page.locator('tr.gridRow').first().waitFor({timeout: 20000}).catch(() => {});
            await sleep(1000);
            const rows = page.locator('tr.gridRow').filter({hasText: /Crossref|DataCite/i});
            o.grid = [];
            for (let i = 0; i < await rows.count(); i++) {
                o.grid.push({row: flat(await rows.nth(i).innerText(), 160), enabled: await rows.nth(i).locator('input[type=checkbox]').first().isChecked().catch(() => null)});
            }
            o.gridSnap = await snap('pk-plugins');
            fact('pk', o);
        });

        await sect('leave', async () => {
            await as(C.u.mg, C.path);
            await gotoDois(C.path);
            await tick([ids.w1, ids.w2]);
            const asked = [];
            const onD = async (d) => { asked.push({type: d.type(), message: d.message()}); await d.accept().catch(() => {}); };
            page.on('dialog', onD);
            const s = await snap('leave-ticked');
            await page.goto(ctxUrl(C.path, '/management/settings/distribution'));
            await idle(page).catch(() => {});
            await sleep(2000);
            page.off('dialog', onD);
            const landed = strip(page.url());
            const back = await gotoDois(C.path);
            fact('leave', {snapBefore: s, asked, landed, backStatus: back,
                tickedAfterReturn: await page.locator('.listPanel__item--doi:visible input[type="checkbox"]:checked').count()});
            await snap('leave-returned');
        });
    } finally {
        await close();
    }
});
