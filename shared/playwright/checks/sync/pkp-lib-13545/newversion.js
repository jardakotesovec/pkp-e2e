// PR review pkp/pkp-lib#13543, round 2: the regression reader's S2 (a new version shares its galley
// files with the published one, U46 A4) and S5 (the layout editor and the Body Text's "Export"), on OJS's
// dataset fleet freshly reset to PKP's default test dataset. Runs unchanged at the base and the head (side.sh).
//   S2, as `dbarnes`: submission 17 (published, publication 18): POST …/bodyText (HTML "version one") and
//       …/bodyText/pdf; "Create New Version" (POST …/publications/18/version); POST …/bodyText (HTML
//       "version two") and …/pdf on the new version; then each version's galleys, their files' text (database
//       and files folder), and what a signed-out reader downloads for version 1's HTML galley
//   S5, as `gcox` (Layout Editor on submission 5, Production): POST …/bodyText on submission 5
// Run: PROBE_FEATURE=pr-13543 PROBE_AGENT=pr PROBE_RUN=<side> node bin/probe.js ojs <this file>
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, signOut, record, sql} = require('../../../probe');

const flat = (s, n = 400) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));
const pdf = (tag) => Buffer.from(`%PDF-1.4\n% ${tag}\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n`);

forEachApp(async (app) => {
    if (!app.dataset) throw new Error('newversion.js runs on a dataset fleet (fleet-prep --dataset)');
    if (app.name !== 'ojs') return;
    const side = process.env.PROBE_RUN || 'run';
    const facts = {app: app.name, side};
    const fact = (k, v) => {
        facts[k] = v;
        console.log(`[fact] ${app.name} ${k}: ${flat(JSON.stringify(v), 1600)}`);
    };
    const configFile = path.isAbsolute(app.configFile) ? app.configFile : path.resolve(__dirname, '../../../../..', app.configFile);
    const filesDir = (fs.readFileSync(configFile, 'utf8').match(/^files_dir\s*=\s*"?([^"\n]+?)"?\s*$/m) || [])[1];
    const galleys = (publicationId) => String(sql(app, `select g.galley_id, g.label, g.submission_file_id, f.path
        from publication_galleys g left join submission_files sf on sf.submission_file_id = g.submission_file_id
        left join files f on f.file_id = sf.file_id where g.publication_id = ${publicationId} order by g.galley_id`)).split('\n').filter(Boolean)
        .map((l) => {
            const [id, label, sfid, rel] = l.split('|');
            let text = null;
            if (rel) {
                const b = fs.readFileSync(path.join(filesDir, rel));
                text = label === 'HTML' ? flat(b.toString('utf8').replace(/<[^>]+>/g, ' '), 60) : flat(b.toString('latin1').split('\n')[1], 30);
            }
            return {id: Number(id), label, submissionFileId: Number(sfid) || null, text};
        });
    const {page, close} = await launch(app);
    const base = `/index.php/${app.contextPath}/api/v1/submissions`;
    const call = async (method, url, body, contentType) => {
        const csrfToken = await page.evaluate(() => window.pkp.currentUser.csrfToken);
        const headers = {'X-Csrf-Token': csrfToken};
        if (contentType) headers['Content-Type'] = contentType;
        const r = await page.request.fetch(app.url(url), {method, headers, data: body, failOnStatusCode: false});
        let json = null;
        try { json = await r.json(); } catch { json = flat(await r.text(), 160); }
        return {status: r.status(), json};
    };
    const pick = (r) => ({status: r.status, id: r.json && r.json.id, label: r.json && r.json.label, error: r.json && r.json.error});
    const home = () => page.goto(app.url(`/index.php/${app.contextPath}/submissions`));
    try {
        await signIn(page, 'dbarnes');
        await home();
        const v1 = Number(String(sql(app, 'select current_publication_id from submissions where submission_id = 17')).trim());
        fact('S2 v1', {publication: v1, status: String(sql(app, `select status from publications where publication_id = ${v1}`)).trim()});
        fact('S2 v1 POST html', pick(await call('POST', `${base}/17/publications/${v1}/bodyText`, '<p>version one</p>', 'text/html; charset=UTF-8')));
        fact('S2 v1 POST pdf', pick(await call('POST', `${base}/17/publications/${v1}/bodyText/pdf`, pdf('version one'), 'application/pdf')));
        fact('S2 v1 galleys', galleys(v1));
        const created = await call('POST', `${base}/17/publications/${v1}/version`, '{}', 'application/json');
        const v2 = created.json && created.json.id;
        fact('S2 Create New Version', {status: created.status, publication: v2});
        if (v2) {
            fact('S2 v2 galleys (copied)', galleys(v2));
            fact('S2 v2 POST html', pick(await call('POST', `${base}/17/publications/${v2}/bodyText`, '<p>version two</p>', 'text/html; charset=UTF-8')));
            fact('S2 v2 POST pdf', pick(await call('POST', `${base}/17/publications/${v2}/bodyText/pdf`, pdf('version two'), 'application/pdf')));
            fact('S2 v2 galleys after', galleys(v2));
            fact('S2 v1 galleys after', galleys(v1));
            const ctx = await page.context().browser().newContext({storageState: {cookies: [], origins: []}});
            for (const g of galleys(v1)) {
                const r = await ctx.request.get(app.url(`/index.php/${app.contextPath}/article/download/17/${g.id}`), {failOnStatusCode: false});
                const b = await r.body();
                fact(`S2 reader downloads v1 ${g.label} (galley ${g.id})`, {status: r.status(), text: g.label === 'HTML' ? flat(b.toString('utf8').replace(/<[^>]+>/g, ' '), 60) : flat(b.toString('latin1').split('\n')[1], 30)});
            }
            await ctx.close();
        }
        // S5
        await signOut(page, {origin: app.url('')});
        await signIn(page, 'gcox');
        await home();
        const p5 = Number(String(sql(app, 'select current_publication_id from submissions where submission_id = 5')).trim());
        fact('S5 gcox POST html on 5', pick(await call('POST', `${base}/5/publications/${p5}/bodyText`, '<p>layout</p>', 'text/html; charset=UTF-8')));
        fact('S5 gcox PUT bodyText on 5 (Save)', pick(await call('PUT', `${base}/5/publications/${p5}/bodyText`, JSON.stringify({}), 'application/json')));
    } catch (e) {
        fact('error', flat(e.stack || e.message, 800));
    } finally {
        record(`newversion-${side}`, facts);
        await close();
    }
});
