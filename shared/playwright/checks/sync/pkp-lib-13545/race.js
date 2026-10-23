// PR review pkp/pkp-lib#13543, round 3: round 3 drops the publication row lock that made concurrent
// exports wait for each other ("Serialize concurrent exports so they cannot create duplicate galleys").
// The fleet's `php -S` answers one request at a time, so this starts a second server on the same install
// with PHP_CLI_SERVER_WORKERS=4 (as php-fpm would serve them) and sends simultaneous first exports.
// OJS's dataset fleet freshly reset to PKP's default test dataset; records absence, so it runs at the
// base too (side.sh). As `dbarnes`, on Production submissions without galleys:
//   R1 four simultaneous POST …/bodyText (HTML), then the version's galleys
//   R2 four simultaneous POST …/bodyText/pdf, then the version's galleys
// Run: PROBE_FEATURE=pr-13543 PROBE_AGENT=pr PROBE_RUN=<side> node bin/probe.js ojs <this file>
const path = require('path');
const {spawn} = require('child_process');
const {forEachApp, launch, signIn, record, sql, outDir} = require('../../../probe');
const {phpServerCommand, phpServerEnv, phpServerStatus} = require('../../../php-server.js');

const flat = (s, n = 400) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');
const N = 4;

forEachApp(async (app) => {
    if (!app.dataset) throw new Error('race.js runs on a dataset fleet (fleet-prep --dataset)');
    if (app.name !== 'ojs') return;
    const side = process.env.PROBE_RUN || 'run';
    const facts = {app: app.name, side};
    const fact = (k, v) => {
        facts[k] = v;
        console.log(`[fact] ${app.name} ${k}: ${flat(JSON.stringify(v), 1600)}`);
    };
    const port = app.port + 40;
    if (await phpServerStatus(port)) throw new Error(`race.js: port ${port} is taken`);
    const server = spawn('bash', ['-c', phpServerCommand({appRoot: app.root, port, logFile: path.join(outDir(), `race-${side}-server.log`)})], {
        env: {...process.env, ...phpServerEnv({configFile: app.configFile, testApiKey: app.testApiKey}), PHP_CLI_SERVER_WORKERS: String(N)},
        detached: true, stdio: 'ignore',
    });
    const {page, close} = await launch(app);
    try {
        for (let i = 0; i < 40 && !(await phpServerStatus(port)); i++) await new Promise((r) => setTimeout(r, 250));
        const workers = String(require('child_process').execSync(`pgrep -f -- "-S 127.0.0.1:${port}" | wc -l`)).trim();
        fact('R0 second server', {port, processes: Number(workers)});
        await signIn(page, 'dbarnes');
        await page.goto(app.url(`/index.php/${app.contextPath}/submissions`));
        const csrfToken = await page.evaluate(() => window.pkp.currentUser.csrfToken);
        const subs = String(sql(app, `select s.submission_id || ' ' || s.current_publication_id from submissions s where s.stage_id = 5 and s.status = 1
            and not exists (select 1 from publication_galleys g where g.publication_id = s.current_publication_id) order by 1 limit 2`)).split('\n').filter(Boolean).map((l) => l.split(' ').map(Number));
        fact('R0 submissions', subs);
        const galleys = (p) => String(sql(app, `select coalesce(string_agg(galley_id || ' ' || label || ' file=' || coalesce(submission_file_id::text, '-'), ' | ' order by galley_id), '(none)') from publication_galleys where publication_id = ${p}`)).trim();
        const burst = async ([sub, p], suffix, body, contentType) => {
            const url = `http://127.0.0.1:${port}/index.php/${app.contextPath}/api/v1/submissions/${sub}/publications/${p}/bodyText${suffix}`;
            const t0 = Date.now();
            const answers = await Promise.all(Array.from({length: N}, (_, i) => page.request.fetch(url, {
                method: 'POST', headers: {'X-Csrf-Token': csrfToken, 'Content-Type': contentType},
                data: typeof body === 'function' ? body(i) : body, failOnStatusCode: false,
            }).then(async (r) => {
                let j = null; try { j = await r.json(); } catch { j = flat(await r.text(), 120); }
                return {status: r.status(), id: j && j.id, error: j && j.error, ms: Date.now() - t0};
            })));
            return answers;
        };
        if (subs[0]) {
            fact('R1 four simultaneous HTML exports', await burst(subs[0], '', (i) => `<p>race ${i}</p>`, 'text/html; charset=UTF-8'));
            fact('R1 galleys', galleys(subs[0][1]));
        }
        if (subs[1]) {
            fact('R2 four simultaneous PDF exports', await burst(subs[1], '/pdf', PDF, 'application/pdf'));
            fact('R2 galleys', galleys(subs[1][1]));
        }
    } catch (e) {
        fact('error', flat(e.stack || e.message, 800));
    } finally {
        try { process.kill(-server.pid, 'SIGTERM'); } catch {}
        record(`race-${side}`, facts);
        await close();
    }
});
