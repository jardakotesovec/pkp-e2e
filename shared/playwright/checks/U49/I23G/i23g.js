// Claim check cc23g, housekeeping 2026-10-23, chunk I23G (.reports/hk1023/chunks/I23G.md): two incidental rows of
// docs/tracking/incidentals.md, driven on PKP's default test dataset (dataset fleet 7, prepared as feature
// `issues-cc23g` / `issues-cc23g-3_5`). No scratch context: everything is the dataset's.
//
//   PART=api     (U49 Rule 11c / A14's API passages) as `dbarnes`, from the workflow of a published submission
//                (OJS 17, OMP 14, OPS 2), with that page's `pkp.context.apiBaseUrl` and CSRF token (the API is
//                checked directly, as the Frame allows):
//                  A0  GET the submission and its current publication: does the publication carry `version`?
//                  A1  POST …/publications/{current}/version with an empty body (no `version` key)
//                  A2  POST …/publications/{current}/version with {"version": 2}
//                  B1  POST …/publications copying title, abstract, section/series, no `version` key
//                  B2  the same with "version" (main: 2; 3.5: the highest stored + 1)
//                  each answer's status and body, the server log lines it wrote, then GET of each new
//                  publication (has it a `version` property?); the workflow side menu before and after.
//                Static reads (no screen): `schemas/publication.json` (its `required` list, whether a `version`
//                property exists) and the API reference built by `lib/pkp/tools/buildSwagger.php` under the fleet's
//                config (PKP_CONFIG_FILE), its PublicationEditable definition and both POST routes.
//   PART=invite  (U06 A14, "For other specs") as `rvaca`: Settings › Users & Roles › "Invite to a role", three
//                invitations sent, each to its own new address: `none` (no names), `both` (Given + Family Name),
//                `family` (Family Name only); then for each its Invitations row › Edit › "Edit Invitation",
//                opened twice; the fleet's PHP log marked around every opening (the create page too). The second
//                `none` opening types a Given Name and leaves by the address bar (the way-out sweep).
// Default: both parts.
//
// The fleet is changed (versions, invitations): reset before each run, and when done
//   npm run fleet-prep -- --feature issues-cc23g --dataset 7 --reset
//   PKP_E2E_LINE=stable-3_5_0 npm run fleet-prep -- --feature issues-cc23g-3_5 --dataset 7 --reset
// Runs (one app per call, under the app lock; r1/r2 on main, s1/s2 on stable-3_5_0):
//   bin/app-lock.sh shared ojs -- env PROBE_FEATURE=issues-cc23g PKP_E2E_DATASET=7 PROBE_NOTES_FEATURE=U49 \
//       PROBE_AGENT=cc23g PROBE_RUN=r1 node bin/probe.js ojs shared/playwright/checks/U49/I23G/i23g.js
//   PKP_E2E_LINE=stable-3_5_0 bin/app-lock.sh shared ojs -- env PKP_E2E_LINE=stable-3_5_0 \
//       PROBE_FEATURE=issues-cc23g-3_5 PKP_E2E_DATASET=7 PROBE_NOTES_FEATURE=U49 PROBE_AGENT=cc23g \
//       PROBE_RUN=s1 node bin/probe.js ojs shared/playwright/checks/U49/I23G/i23g.js
// Outputs: .reports/<PROBE_FEATURE>/cc23g/ (facts i23g-<part>-<run>-<app>.json, one screen() per page as
// i23g-<part>-<step>-<run>-<app>.json; the built API reference as outFile('i23g-swagger.json')).
// No other script or state file is read. No assertions: the script records, the reader judges.
const fs = require('fs');
const path = require('path');
const {execFileSync} = require('child_process');
const {forEachApp, launch, signIn, screen, shot, record, idle, serverLog, outFile, loc} = require('../../../probe');

const RUN = process.env.PROBE_RUN || 'r1';
const PARTS = (process.env.PART || 'api,invite').split(',');
const REPO = path.resolve(__dirname, '../../../../..');
const T = 30_000;
const flat = (s, n = 600) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));
const SUB = {ojs: 17, omp: 14, ops: 2};
const ROLE = {ojs: 'Copyeditor', omp: 'Copyeditor', ops: 'Moderator'};

/** A log line kept short, the absolute path cut to lib/pkp/… */
const logLine = (l) => flat(String(l).replace(/\/[\w./-]*?\/(lib\/pkp\/|classes\/|pages\/)/g, '$1'), 300);

forEachApp(async (app) => {
    if (!app.dataset) throw new Error('i23g.js runs on a dataset fleet (fleet-prep --dataset 7 --reset)');
    const line = app.line || 'main';
    const log = serverLog(app);
    const name = (s) => `i23g-${s}-${RUN}`;

    if (PARTS.includes('api')) {
        const facts = {app: app.name, line, run: RUN, submission: SUB[app.name]};
        const fact = (k, v) => {
            facts[k] = v;
            console.log(`[fact] ${app.name} ${line} ${k}: ${flat(JSON.stringify(v), 1200)}`);
            record(name('api'), facts);
        };
        // static reads: the schema as the app merges it (lib/pkp's file, the app's own file)
        const schemaRead = (file) => {
            try {
                const j = JSON.parse(fs.readFileSync(file, 'utf8'));
                return {file: path.relative(REPO, file), required: j.required || null, versionProp: j.properties && j.properties.version ? j.properties.version : null};
            } catch (e) {
                return {file: path.relative(REPO, file), error: flat(e.message, 200)};
            }
        };
        const root = path.resolve(REPO, app.root);
        fact('schema lib/pkp', schemaRead(path.join(root, 'lib/pkp/schemas/publication.json')));
        fact('schema app', schemaRead(path.join(root, 'schemas/publication.json')));
        const source = path.join(root, 'docs/dev/swagger-source.json');
        if (!fs.existsSync(source)) fact('API reference', {source: path.relative(REPO, source), exists: false, note: 'the app carries no API reference source; buildSwagger.php refuses ("Unable to find source files")'});
        else try {
            const out = outFile('i23g-swagger.json');
            execFileSync('php', ['lib/pkp/tools/buildSwagger.php', out], {
                cwd: root,
                env: {...process.env, PKP_CONFIG_FILE: path.resolve(REPO, app.configFile)},
                encoding: 'utf8',
                timeout: 120_000,
            });
            const sw = JSON.parse(fs.readFileSync(out, 'utf8'));
            const ed = sw.definitions && sw.definitions.PublicationEditable;
            const p = sw.paths || {};
            const post = p['/submissions/{submissionId}/publications'] && p['/submissions/{submissionId}/publications'].post;
            const ver = p['/submissions/{submissionId}/publications/{publicationId}/version'];
            fact('API reference', {
                file: path.relative(REPO, out),
                publicationEditableHasVersion: !!(ed && ed.properties && ed.properties.version),
                publicationEditableVersion: ed && ed.properties && ed.properties.version ? ed.properties.version : null,
                publicationEditableRequired: ed ? ed.required || null : 'no PublicationEditable',
                postPublications: post ? {summary: post.summary, body: (post.parameters || []).filter((x) => x.in === 'body').map((x) => x.schema)} : null,
                postVersion: ver && ver.post ? {summary: ver.post.summary, description: flat(ver.post.description, 400), body: (ver.post.parameters || []).filter((x) => x.in === 'body').map((x) => x.schema)} : null,
            });
        } catch (e) {
            fact('API reference error', flat(e.message, 400));
        }

        const {page, close} = await launch(app);
        try {
            await signIn(page, 'dbarnes', {contextPath: app.contextPath});
            const sid = SUB[app.name];
            const openWorkflow = async (step) => {
                await page.goto(app.url(`/index.php/${app.contextPath}/en/dashboard/editorial?workflowSubmissionId=${sid}`));
                await idle(page);
                await page.getByRole('dialog').first().waitFor({timeout: T}).catch(() => {});
                await page.waitForTimeout(1500);
                const s = await screen(page);
                record(name(`api-${step}`), s);
                await shot(page, name(`api-${step}`));
                return flat(await page.locator('[role="dialog"] nav').first().innerText({timeout: 5000}).catch(() => null), 1500);
            };
            fact('workflow side menu before', await openWorkflow('workflow-before'));
            const ctx = await page.evaluate(() => ({api: window.pkp && pkp.context && pkp.context.apiBaseUrl, csrf: window.pkp && pkp.currentUser && pkp.currentUser.csrfToken}));
            fact('context', {apiBaseUrl: ctx.api ? ctx.api.replace(/^https?:\/\/[^/]+/, '') : null, csrf: ctx.csrf ? 'present' : null});
            const call = async (key, method, rel, body) => {
                const from = log.mark();
                const r = await page.evaluate(
                    async ({url, method, body, csrf}) => {
                        const res = await fetch(url, {method, headers: {'Content-Type': 'application/json', Accept: 'application/json', 'X-Csrf-Token': csrf}, body: body ? JSON.stringify(body) : undefined});
                        const text = await res.text();
                        let json = null;
                        try {
                            json = JSON.parse(text);
                        } catch {}
                        return {status: res.status, json, text: json ? null : text.slice(0, 400)};
                    },
                    {url: ctx.api.replace(/\/$/, '') + rel, method, body, csrf: ctx.csrf},
                );
                const j = r.json;
                const short =
                    j && typeof j === 'object' && 'id' in j
                        ? {id: j.id, hasVersionKey: Object.prototype.hasOwnProperty.call(j, 'version'), version: j.version, versionStage: j.versionStage, versionMajor: j.versionMajor, versionMinor: j.versionMinor, versionString: j.versionString, status: j.status}
                        : j || flat(r.text, 300);
                fact(key, {request: `${method} …${rel}`, sent: body ? Object.keys(body) : null, sentVersion: body && 'version' in body ? body.version : '(no key)', status: r.status, body: short, serverLog: log.since(from).map(logLine)});
                return r;
            };
            const sub = await call('A0 GET submission', 'GET', `/submissions/${sid}`);
            const pid = sub.json && sub.json.currentPublicationId;
            const cur = await call('A0 GET current publication', 'GET', `/submissions/${sid}/publications/${pid}`);
            const current = cur.json || {};
            const created = [];
            const a1 = await call('A1 POST …/version, no version key', 'POST', `/submissions/${sid}/publications/${pid}/version`, {});
            if (a1.json && a1.json.id) created.push(['A1', a1.json.id]);
            const a2 = await call('A2 POST …/version, "version": 2', 'POST', `/submissions/${sid}/publications/${pid}/version`, {version: 2});
            if (a2.json && a2.json.id) created.push(['A2', a2.json.id]);
            const sectionKey = app.name === 'omp' ? 'seriesId' : 'sectionId';
            const base = () => {
                const b = {title: current.title, abstract: current.abstract};
                if (current[sectionKey]) b[sectionKey] = current[sectionKey];
                return b;
            };
            const b1 = await call('B1 POST …/publications, no version key', 'POST', `/submissions/${sid}/publications`, base());
            if (b1.json && b1.json.id) created.push(['B1', b1.json.id]);
            let next = 2;
            if (line !== 'main') {
                const list = await call('B2 pre GET publications', 'GET', `/submissions/${sid}/publications`);
                const items = (list.json && list.json.items) || [];
                next = Math.max(0, ...items.map((x) => Number(x.version) || 0)) + 1;
            }
            const b2 = await call(`B2 POST …/publications, "version": ${next}`, 'POST', `/submissions/${sid}/publications`, {...base(), version: next});
            if (b2.json && b2.json.id) created.push(['B2', b2.json.id]);
            for (const [k, id] of created) await call(`C GET ${k}'s publication ${id}`, 'GET', `/submissions/${sid}/publications/${id}`);
            fact('workflow side menu after', await openWorkflow('workflow-after'));
            await loc(page, 'workflow side menu (versions)', page.locator('[role="dialog"] nav').first());
        } catch (e) {
            fact('api error', flat(e.message, 600));
        } finally {
            record(name('api'), facts);
            await close();
        }
    }

    if (PARTS.includes('invite')) {
        const facts = {app: app.name, line, run: RUN, role: ROLE[app.name]};
        const fact = (k, v) => {
            facts[k] = v;
            console.log(`[fact] ${app.name} ${line} ${k}: ${flat(JSON.stringify(v), 1200)}`);
            record(name('invite'), facts);
        };
        const {page, close} = await launch(app);
        const dialogs = [];
        page.on('dialog', (d) => {
            dialogs.push({type: d.type(), message: d.message()});
            d.accept().catch(() => {});
        });
        const today = () => new Date().toISOString().slice(0, 10);
        const newRow = () => page.getByRole('row').filter({has: page.getByLabel(/^Select a new role/)}).last();
        const access = async () => {
            await page.goto(app.url(`/index.php/${app.contextPath}/en/management/settings/access`));
            await idle(page);
        };
        const sinceLines = (from) => log.since(from).map(logLine);
        const groups = (lines) => {
            const g = {};
            for (const l of lines) {
                const m = l.match(/PHP (Warning|Notice|Deprecated|Fatal error):\s+(.*?) in (\S+) on line (\d+)/);
                const k = m ? `${m[1]}: ${m[2]} @ ${m[3].replace(/^.*\//, '')}:${m[4]}` : flat(l, 160);
                g[k] = (g[k] || 0) + 1;
            }
            return g;
        };
        const send = async (key, {given, family}) => {
            const address = `u49i23g-${key}-${RUN}-${app.name}@example.com`;
            await access();
            const from = log.mark();
            await page.getByRole('button', {name: 'Invite to a role'}).click();
            await page.getByRole('heading', {name: /Search User/}).waitFor({timeout: T});
            await idle(page);
            const openLines = sinceLines(from);
            if (key === 'none') {
                record(name('invite-create'), await screen(page));
                await shot(page, name('invite-create'));
            }
            await page.getByLabel(/Search for a user by email address/).fill(address);
            await page.getByRole('button', {name: 'Search User', exact: true}).click();
            await page.getByRole('heading', {name: /Enter details/}).waitFor({timeout: T});
            await idle(page);
            if (given) await page.getByLabel(/^Given Name/).first().fill(given);
            if (family) await page.getByLabel(/^Family Name/).first().fill(family);
            await newRow().getByLabel(/^Select a new role/).selectOption({label: ROLE[app.name]});
            await newRow().getByRole('textbox').fill(today());
            await newRow().getByRole('combobox').last().selectOption({label: 'Does not appear on the masthead'});
            const d0 = log.mark();
            await page.getByRole('button', {name: 'Save And Continue'}).click();
            const subject = page.getByLabel(/^Subject/);
            const ok = await subject.waitFor({timeout: 15_000}).then(() => true).catch(() => false);
            if (!ok) {
                const s = await screen(page);
                record(name(`invite-${key}-refused`), s);
                return {address, openLines: groups(openLines), saved: false, screen: flat(s.text && s.text.main, 800), detailsLog: groups(sinceLines(d0))};
            }
            for (let i = 0; i < 60 && !(await subject.inputValue()); i++) await page.waitForTimeout(500);
            await idle(page);
            await page.getByRole('button', {name: 'Invite user to the role'}).click();
            const dlg = page.getByRole('dialog').filter({hasText: 'Invitation Sent'});
            await dlg.waitFor({timeout: T});
            await dlg.getByRole('button', {name: 'View All Users'}).click();
            await page.waitForURL(/management\/settings\/access/, {timeout: T});
            await idle(page);
            return {address, saved: true, createOpening: groups(openLines), detailsAndSend: groups(sinceLines(d0))};
        };
        const openEdit = async (key, address, n, leave) => {
            await access();
            const table = page.getByRole('table', {name: /^Invitations \(/});
            await table.waitFor({timeout: T});
            const row = table.locator('tbody tr').filter({hasText: address}).first();
            const rowText = flat(await row.innerText().catch(() => null), 300);
            await row.getByRole('button', {name: /management.options|^More Actions$/i}).click();
            await page.getByRole('menuitem', {name: /^Edit/}).click();
            const warn = page.getByRole('dialog').last();
            await warn.waitFor({timeout: T});
            const warnText = flat(await warn.innerText(), 300);
            const from = log.mark();
            await warn.getByRole('button', {name: 'Edit Invitation', exact: true}).click();
            await page.waitForURL(/\/invitation\/edit\/\d+/, {timeout: T});
            await page.getByRole('heading', {name: /Enter details/}).waitFor({timeout: T});
            await idle(page);
            const s = await screen(page);
            const lines = sinceLines(from);
            record(name(`invite-edit-${key}-${n}`), s);
            if (n === 1) await shot(page, name(`invite-edit-${key}`));
            const out = {
                rowText,
                warnDialog: warnText,
                url: page.url().replace(/^https?:\/\/[^/]+/, ''),
                header: flat(s.text && s.text.header, 300),
                mainHead: flat(s.text && s.text.main, 400),
                given: await page.getByLabel(/^Given Name/).first().inputValue({timeout: 5000}).catch(() => null),
                family: await page.getByLabel(/^Family Name/).first().inputValue({timeout: 5000}).catch(() => null),
                logGroups: groups(lines),
                logLines: lines.slice(0, 12),
            };
            if (leave) {
                // way-out sweep: a Given Name typed, unsaved, then the address bar to Users & Roles
                const d = dialogs.length;
                await page.getByLabel(/^Given Name/).first().fill('Unsaved');
                await page.getByLabel(/^Given Name/).first().blur();
                await access();
                out.leave = {dialogs: dialogs.slice(d), landed: page.url().replace(/^https?:\/\/[^/]+/, '')};
                const t = page.getByRole('table', {name: /^Invitations \(/});
                out.leave.rowAfter = flat(await t.locator('tbody tr').filter({hasText: address}).first().innerText().catch(() => null), 300);
            }
            return out;
        };
        try {
            await signIn(page, 'rvaca', {contextPath: app.contextPath});
            const cases = {none: {}, both: {given: 'Ines', family: 'Both'}, family: {family: 'Onlyfamily'}};
            const sent = {};
            for (const [key, names] of Object.entries(cases)) {
                try {
                    sent[key] = await send(key, names);
                } catch (e) {
                    sent[key] = {error: flat(e.message, 500)};
                    record(name(`invite-${key}-error`), await screen(page).catch(() => null));
                }
                fact(`send ${key}`, sent[key]);
            }
            for (const [key, s] of Object.entries(sent)) {
                if (!s.saved) continue;
                for (const n of [1, 2]) {
                    try {
                        fact(`edit ${key} #${n}`, await openEdit(key, s.address, n, key === 'none' && n === 2));
                    } catch (e) {
                        fact(`edit ${key} #${n} error`, flat(e.message, 500));
                    }
                }
            }
            fact('dialogs', dialogs);
        } finally {
            record(name('invite'), facts);
            await close();
        }
    }
});
