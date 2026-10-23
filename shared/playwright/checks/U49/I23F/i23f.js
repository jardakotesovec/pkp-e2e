// Claim check cc23f, housekeeping 2026-10-23, chunk I23F (.reports/hk1023/chunks/I23F.md): three
// incidental rows of docs/tracking/incidentals.md, driven on PKP's default test dataset (dataset fleet
// 6, prepared as feature `issues-cc23f` / `issues-cc23f-3_5`).
//
//   PART=u49  {OJS main + 3.5; OMP/OPS main quick} a galley's address under `version/` with the
//             galley's numeric id vs its URL Path: the redirect chain (each hop's status and Location,
//             read without following), the final page and which version's galley it serves; signed out
//             and as `dbarnes`. OJS submission 1 in three states, each read in full:
//               A  the dataset as loaded (v1 published, current; v2 "1.1" unpublished, its galley "pdf");
//               B  after `dbarnes` publishes v2 on the workflow screens;
//               C  after `dbarnes` creates v3 ("Create New Version", untouched) and publishes it.
//             OMP: book 5's format by number under version/; OPS: preprint 3 (two published versions,
//             galleys without a URL Path) and a scratch preprint seeded with a galley URL Path "pdf".
//   PART=u46  {OJS main + 3.5} an HTML galley of an article with no issue (scratch journal seeded
//             through the _test API: one unpublished at Production; on main one more published with no
//             issue), opened by its manager (and signed out for the published one); the fleet's server
//             log read before and after for "Undefined variable $issue" and deprecations.
//   PART=u12  {OJS main + 3.5; OMP/OPS main control} `rvaca` enables announcements (Settings › Website
//             › Setup › Announcements), then POST /api/v1/announcements without `sendEmail` (the API is
//             checked directly, as the Frame allows), the public announcement page signed out and as
//             rvaca, then the screen's own "Add Announcement" with its request body's keys recorded; the
//             server log before and after each; both announcements deleted after.
//
// The fleet is changed (publishes, versions, announcements): reset it before each run
//   npm run fleet-prep -- --feature issues-cc23f --dataset 6 --reset
//   PKP_E2E_LINE=stable-3_5_0 npm run fleet-prep -- --feature issues-cc23f-3_5 --dataset 6 --reset
// Runs (each app on its own, under the app lock; r1/r2 on main, s1/s2 on stable-3_5_0):
//   bin/app-lock.sh shared ojs -- env PROBE_FEATURE=issues-cc23f PKP_E2E_DATASET=6 PROBE_NOTES_FEATURE=U49 \
//       PROBE_AGENT=cc23f PROBE_RUN=r1 node bin/probe.js ojs shared/playwright/checks/U49/I23F/i23f.js
//   (omp, ops the same; PART=u49,u12 is what they run.)
//   PKP_E2E_LINE=stable-3_5_0 bin/app-lock.sh shared ojs -- env PKP_E2E_LINE=stable-3_5_0 \
//       PROBE_FEATURE=issues-cc23f-3_5 PKP_E2E_DATASET=6 PROBE_NOTES_FEATURE=U49 PROBE_AGENT=cc23f \
//       PROBE_RUN=s1 node bin/probe.js ojs shared/playwright/checks/U49/I23F/i23f.js
// Outputs: .reports/<PROBE_FEATURE>/cc23f/ (facts in i23f-<part>-<run>-<app>.json, one screen() per page).
// No other script or state file is read. No assertions: the script records, the reader judges.
const path = require('path');
const {expect} = require('@playwright/test');
const {forEachApp, launch, signIn, signOut, screen, record, idle, note, tag, sql, serverLog} = require('../../../probe');

const RUN = process.env.PROBE_RUN || 'r1';
const PARTS = (process.env.PART || 'u49,u46,u12').split(',');
const T = 30_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (s, n = 500) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));
const rel = (u) => (u == null ? u : String(u).replace(/^https?:\/\/[^/]+/, ''));
const LOGMATCH = /error|exception|fatal|warning|deprecat|notice|undefined|attempt to read|\[5\d\d\]/i;

forEachApp(async (app) => {
    const stable35 = app.line === 'stable-3_5_0';
    const ctx = app.contextPath;
    const t0 = Date.now();
    const log = (...a) => console.log(`[i23f ${RUN} ${app.name} +${Math.round((Date.now() - t0) / 1000)}s]`, ...a);
    const facts = {};
    const fact = (part, k, v) => {
        facts[part] = facts[part] || {};
        facts[part][k] = v;
        record(`i23f-${part}`, {[k]: v}, {merge: true});
        log(`[${part}.${k}]`, JSON.stringify(v).slice(0, 2500));
    };
    const srv = serverLog(app, {match: LOGMATCH});
    const logSince = (from) => srv.since(from).map((l) => flat(l, 600));
    const {page, close} = await launch(app);
    const snap = async (name) => {
        await idle(page).catch(() => {});
        const s = await screen(page);
        record(`i23f-${name}`, s);
        return s;
    };

    /** The redirect chain of one address, in the page's own session (its cookies), never followed. */
    async function chain(p) {
        const hops = [];
        let url = app.url(p.startsWith('/index.php') ? p : `/index.php/${ctx}/${p}`);
        for (let i = 0; i < 8; i++) {
            const r = await page.request.get(url, {maxRedirects: 0, failOnStatusCode: false, timeout: T});
            const h = {url: rel(url), status: r.status(), location: rel(r.headers().location || null)};
            hops.push(h);
            if (r.status() >= 300 && r.status() < 400 && r.headers().location) {
                url = new URL(r.headers().location, url).toString();
                continue;
            }
            const ct = r.headers()['content-type'] || '';
            if (/html/.test(ct)) {
                const body = await r.text();
                h.body = {
                    title: flat((body.match(/<title>([\s\S]*?)<\/title>/) || [])[1], 200),
                    galleyFrameTitle: flat((body.match(/<iframe[^>]*title="([^"]*)"/) || [])[1], 200),
                    outdatedNotice: flat((body.match(/galley_view_notice_message[^>]*>([\s\S]*?)<\/div>/) || [])[1], 300),
                    pdfUrl: rel((body.match(/const pdfUrl = "([^"]*)"/) || [])[1]?.replace(/\\\//g, '/')),
                    notFound: /404 Not Found/.test(body) && body.length < 4000 ? true : /404 Not Found/.test(body),
                    preview: /This is a preview and has not been published/.test(body),
                    galleyLinks: [...body.matchAll(/<a[^>]*class="[^"]*obj_galley_link[^"]*"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g)].map((m) => ({href: rel(m[1]), text: flat(m[2].replace(/<[^>]+>/g, ''), 80)})),
                    length: body.length,
                };
            } else {
                h.contentType = ct;
            }
            break;
        }
        return hops;
    }

    /** The address in the browser: the final URL and its screen. */
    async function visit(p, name) {
        const url = app.url(p.startsWith('/index.php') ? p : `/index.php/${ctx}/${p}`);
        const resp = await page.goto(url, {timeout: T}).catch((e) => ({error: String(e.message).slice(0, 200)}));
        await idle(page).catch(() => {});
        await sleep(400);
        const s = await snap(name);
        return {status: resp && resp.status ? resp.status() : resp, finalUrl: rel(page.url()), title: s.title,
            text: flat(s.text && s.text.main, 300),
            outdated: flat(await page.locator('.galley_view_notice_message, .cmp_notification').allInnerTexts().then((a) => a.join(' | ')).catch(() => null), 300)};
    }

    /** Every address of a set, chain first then the browser, as one role. */
    async function readSet(part, label, addrs) {
        const out = {};
        for (const [k, p] of Object.entries(addrs)) {
            out[k] = {address: p, chain: await chain(p)};
            out[k].browser = await visit(p, `${part}-${label}-${k}`);
        }
        fact(part, label, out);
        return out;
    }

    try {
        // =========================================================================================
        if (PARTS.includes('u49') && app.name === 'ojs') {
            const pubs = () => sql(app, 'select publication_id, status, url_path, issue_id from publications where submission_id=1 order by 1').split('\n');
            const galleys = () => sql(app, 'select g.galley_id, g.publication_id, g.url_path, g.label from publication_galleys g join publications p using (publication_id) where p.submission_id=1 order by 1').split('\n');
            fact('u49', 'A-db', {pubs: pubs(), galleys: galleys(), current: sql(app, 'select current_publication_id from submissions where submission_id=1')});
            const setA = {
                v1numeric: 'article/view/1/version/1/1', v2numeric: 'article/view/1/version/2/2', v2path: 'article/view/1/version/2/pdf',
                plain1: 'article/view/1/1', plain2: 'article/view/1/2', plainPdf: 'article/view/1/pdf', v2landing: 'article/view/1/version/2', v1landing: 'article/view/1/version/1',
            };
            await page.goto(app.url(`/index.php/${ctx}`));
            await readSet('u49', 'A-anon', setA);
            await signIn(page, 'dbarnes', {contextPath: ctx});
            await readSet('u49', 'A-dbarnes', setA);

            // B: dbarnes publishes v2 on the workflow screens.
            const {WorkflowPage} = require('../../../pages/WorkflowPage.js');
            const frame = new WorkflowPage(page, ctx, {labels: {publicationGroup: 'Publication'}});
            const publishShown = async (label, pubId) => {
                const out = {};
                if (!stable35) {
                    await frame.gotoEditorial(1, {menuKey: `publication_${pubId}_titleAbstract`});
                } else {
                    await frame.gotoEditorial(1);
                    await frame.menuLink('Title & Abstract').first().click();
                }
                await frame.expectVersionLoaded().catch(() => {});
                await idle(page);
                await sleep(800);
                out.before = flat((await snap(`u49-${label}-version-page`)).text.dialog, 400);
                const button = page.getByRole('button', {name: /^(Schedule For Publication|Publish)$/}).first();
                await expect(button).toBeVisible({timeout: T});
                out.button = flat(await button.innerText());
                const published = page.waitForResponse((r) => /\/publish$/.test(new URL(r.url()).pathname) && r.request().method() !== 'GET', {timeout: 90_000}).catch(() => null);
                await button.click();
                if (!stable35) {
                    // main: the "Review Publishing Details" panel, confirmed as it arrives (Rule 10), then
                    // "Publish" in the question.
                    const panel = page.locator('[data-cy="active-modal"]').filter({hasText: 'Review Publishing Details'}).last();
                    const question = page.getByRole('dialog').filter({hasText: /Are you sure you want to publish this\?|requirements/}).last();
                    try {
                        await expect(panel.locator('select[name="versionStage"]').or(question).first()).toBeVisible({timeout: 6000});
                    } catch {
                        await button.click();
                    }
                    await expect(panel.locator('select[name="versionStage"]').or(question).first()).toBeVisible({timeout: T});
                    if (await panel.locator('select[name="versionStage"]').isVisible().catch(() => false)) {
                        await idle(page);
                        await sleep(1500);
                        out.panel = flat((await snap(`u49-${label}-panel`)).text.dialog, 900);
                        out.assignment = await panel.locator('input[name="assignment"]').evaluateAll((els) => els.map((e) => ({label: (e.closest('label')?.textContent || '').trim(), checked: e.checked}))).catch(() => null);
                        await panel.getByRole('button', {name: 'Confirm', exact: true}).click();
                    }
                    await expect(question).toBeVisible({timeout: T});
                    out.question = flat(await question.innerText(), 500);
                    await snap(`u49-${label}-question`);
                    await question.getByRole('button', {name: /^(Publish|Schedule For Publication)$/}).last().click();
                } else {
                    const confirm = page.getByRole('dialog').getByRole('button', {name: /^(Publish|Schedule For Publication)$/}).last();
                    await confirm.waitFor({state: 'visible', timeout: T});
                    await sleep(800);
                    out.question = flat(await page.getByRole('dialog').last().innerText().catch(() => null), 600);
                    await snap(`u49-${label}-question`);
                    await confirm.click();
                }
                const r = await published;
                out.publish = r ? r.status() : null;
                await idle(page);
                await sleep(1500);
                out.after = flat((await snap(`u49-${label}-published`)).text.dialog, 400);
                return out;
            };
            fact('u49', 'B-publish-v2', await publishShown('B', 2));
            fact('u49', 'B-db', {pubs: pubs(), galleys: galleys(), current: sql(app, 'select current_publication_id from submissions where submission_id=1')});
            const setB = {
                v1numeric: 'article/view/1/version/1/1', v2numeric: 'article/view/1/version/2/2', v2path: 'article/view/1/version/2/pdf',
                plain1: 'article/view/1/1', plain2: 'article/view/1/2', plainPdf: 'article/view/1/pdf', v1landing: 'article/view/1/version/1', current: 'article/view/1',
            };
            await readSet('u49', 'B-dbarnes', setB);
            await signOut(page);
            await readSet('u49', 'B-anon', setB);

            // C: dbarnes creates v3 untouched and publishes it.
            await signIn(page, 'dbarnes', {contextPath: ctx});
            const c = {};
            if (!stable35) {
                await frame.gotoEditorial(1, {menuKey: 'publication_2_titleAbstract'});
                await frame.expectVersionLoaded().catch(() => {});
                await frame.revealPublicationEntry('Create New Version');
            } else {
                await frame.gotoEditorial(1);
                await frame.menuLink('Title & Abstract').first().click();
                await idle(page);
            }
            const opener = stable35
                ? page.getByRole('button', {name: 'Create New Version', exact: true}).first()
                : page.getByRole('link', {name: 'Create New Version', exact: true}).first();
            await opener.click();
            const w = stable35
                ? page.getByRole('dialog').filter({has: page.getByRole('button', {name: /^(Confirm|Yes|OK)$/})}).last()
                : page.getByRole('dialog').filter({has: page.locator('select[name="versionStage"]')}).last();
            await w.waitFor({state: 'visible', timeout: T});
            await idle(page);
            await sleep(800);
            c.window = flat((await snap('u49-C-create-window')).text.dialog, 500);
            const created = page.waitForResponse((x) => /\/publications\/\d+\/version$/.test(new URL(x.url()).pathname) && x.request().method() === 'POST', {timeout: T}).catch(() => null);
            await w.getByRole('button', {name: /^(Confirm|Yes|OK)$/}).last().click();
            const cr = await created;
            c.createStatus = cr ? cr.status() : null;
            c.v3 = cr ? (await cr.json().catch(() => ({}))).id : null;
            await w.waitFor({state: 'detached', timeout: T}).catch(() => {});
            await idle(page);
            await sleep(1000);
            fact('u49', 'C-create-v3', c);
            const v3 = c.v3 || Number(sql(app, 'select max(publication_id) from publications where submission_id=1'));
            fact('u49', 'C-publish-v3', await publishShown('C', v3));
            const g3 = sql(app, `select galley_id from publication_galleys where publication_id=${v3}`);
            fact('u49', 'C-db', {v3, g3, pubs: pubs(), galleys: galleys(), current: sql(app, 'select current_publication_id from submissions where submission_id=1')});
            const setC = {
                v2numeric: 'article/view/1/version/2/2', v2path: 'article/view/1/version/2/pdf', v1numeric: 'article/view/1/version/1/1',
                v3numeric: `article/view/1/version/${v3}/${g3}`, v3path: `article/view/1/version/${v3}/pdf`, v2landing: 'article/view/1/version/2', plainPdf: 'article/view/1/pdf', current: 'article/view/1',
            };
            await readSet('u49', 'C-dbarnes', setC);
            await signOut(page);
            await readSet('u49', 'C-anon', setC);
        }

        if (PARTS.includes('u49') && app.name === 'omp' && !stable35) {
            const f = sql(app, 'select pf.publication_format_id, pf.publication_id, pf.url_path, sf.submission_file_id from publication_formats pf join submission_files sf on sf.assoc_type=521 and sf.assoc_id=pf.publication_format_id join publications p on p.publication_id=pf.publication_id where p.submission_id=5 order by 1 limit 1').split('|');
            fact('u49', 'omp-db', f);
            const [fid, pid, , sfid] = f;
            await page.goto(app.url(`/index.php/${ctx}`));
            await readSet('u49', 'omp-anon', {
                book: 'catalog/book/5', versionBook: `catalog/book/5/version/${pid}`,
                versionFormatNumeric: `catalog/view/5/version/${pid}/${fid}/${sfid}`, formatNumeric: `catalog/view/5/${fid}/${sfid}`,
                versionFormatBogus: `catalog/view/5/version/${pid}/pdf/${sfid}`,
            });
        }

        if (PARTS.includes('u49') && app.name === 'ops' && !stable35) {
            fact('u49', 'ops-db', sql(app, 'select g.galley_id, g.publication_id, g.url_path, p.status from publication_galleys g join publications p using (publication_id) where p.submission_id=3 order by 1').split('\n'));
            const t = tag('u49i23f');
            await app.api.createContext({tag: t, users: [{username: `${t}mgr`, roles: ['manager'], givenName: 'Mia', familyName: 'Manager'}, {username: `${t}au`, roles: ['author'], givenName: 'Ava', familyName: 'Author'}]});
            const s = await app.api.createSubmission({tag: `${t}s`, context: t, submitter: `${t}au`, title: `I23F galley path ${t}`, galleys: [{label: 'PDF', file: 'preprint.pdf', urlPath: 'pdf'}], published: true});
            fact('u49', 'ops-seed', {context: t, s});
            const gid = sql(app, `select galley_id from publication_galleys where publication_id=${s.publicationId}`);
            await page.goto(app.url(`/index.php/${ctx}`));
            await readSet('u49', 'ops-anon', {
                p3v3numeric: 'preprint/view/3/version/3/3', p3v4numeric: 'preprint/view/3/version/4/4', p3plain: 'preprint/view/3/4', p3old: 'preprint/view/3/version/3',
                scratchVersionNumeric: `/index.php/${t}/preprint/view/${s.submissionId}/version/${s.publicationId}/${gid}`,
                scratchVersionPath: `/index.php/${t}/preprint/view/${s.submissionId}/version/${s.publicationId}/pdf`,
                scratchNumeric: `/index.php/${t}/preprint/view/${s.submissionId}/${gid}`, scratchPath: `/index.php/${t}/preprint/view/${s.submissionId}/pdf`,
                scratchLanding: `/index.php/${t}/preprint/view/${s.submissionId}`,
            });
        }

        // =========================================================================================
        if (PARTS.includes('u46') && app.name === 'ojs') {
            const t = tag('u49i23f');
            const users = [{username: `${t}mgr`, roles: ['manager'], givenName: 'Mia', familyName: 'Manager'}, {username: `${t}au`, roles: ['author'], givenName: 'Ava', familyName: 'Author'}];
            const cx = await app.api.createContext({tag: t, users});
            const seeds = {};
            const mk = async (k, spec, where = t, submitter = `${t}au`) => {
                try {
                    seeds[k] = await app.api.createSubmission({tag: `${t}${k}`, context: where, submitter, title: `I23F HTML ${k} ${t}`, galleys: [{label: 'HTML', file: 'article.html'}], ...spec});
                } catch (e) {
                    seeds[k] = {error: String(e.message).slice(0, 600)};
                }
                seeds[k].ctx = where;
            };
            await mk('prod', {decisions: ['skipExternalReview', 'sendToProduction']});
            if (!stable35) await mk('pub', {decisions: ['skipExternalReview', 'sendToProduction'], published: true});
            // The same in the dataset's own journal (submitted by the dataset author ddiouf, opened by dbarnes).
            await mk('pk', {decisions: ['skipExternalReview', 'sendToProduction']}, ctx, 'ddiouf');
            const cid = sql(app, `select journal_id from journals where path='${t}'`);
            fact('u46', 'seed', {context: t, cx, seeds, plugin: sql(app, `select setting_name, setting_value from plugin_settings where plugin_name='htmlarticlegalleyplugin' and context_id=${cid}`).split('\n'),
                db: Object.fromEntries(Object.entries(seeds).map(([k, v]) => [k, v.publicationId ? sql(app, `select p.publication_id, p.status, p.issue_id, g.galley_id, f.mimetype from publications p join publication_galleys g using (publication_id) left join submission_files sf on sf.submission_file_id=g.submission_file_id left join files f on f.file_id=sf.file_id where p.publication_id=${v.publicationId}`) : null]))});
            for (const [k, v] of Object.entries(seeds)) {
                if (!v.submissionId) continue;
                await signIn(page, k === 'pk' ? 'dbarnes' : `${t}mgr`, {contextPath: v.ctx});
                const gid = sql(app, `select galley_id from publication_galleys where publication_id=${v.publicationId}`);
                for (const who of k === 'pub' ? ['mgr', 'anon'] : ['mgr']) {
                    if (who === 'anon') await signOut(page);
                    const from = srv.mark();
                    const p = `/index.php/${v.ctx}/article/view/${v.submissionId}/${gid}`;
                    const out = {address: p, chain: await chain(p)};
                    out.browser = await visit(p, `u46-${k}-${who}-galley`);
                    out.frame = await page.frameLocator('iframe').first().locator('body').innerText({timeout: 10_000}).then((x) => flat(x, 200)).catch((e) => `no frame: ${flat(e.message, 100)}`);
                    await sleep(1500);
                    out.log = logSince(from);
                    // second view: "on every view"
                    const from2 = srv.mark();
                    await page.reload().catch(() => {});
                    await idle(page).catch(() => {});
                    await sleep(1500);
                    out.logReload = logSince(from2);
                    fact('u46', `${k}-${who}`, out);
                }
            }
            // Control: a PDF galley of the dataset (article 1, current version, in an issue), signed out.
            await signOut(page);
            const fromC = srv.mark();
            const ctl = {address: 'article/view/1/1', browser: await visit('article/view/1/1', 'u46-control-pdf')};
            await sleep(1000);
            ctl.log = logSince(fromC);
            fact('u46', 'control-pdf', ctl);
        }

        // =========================================================================================
        if (PARTS.includes('u12')) {
            const tagA = tag('u49i23f');
            await signIn(page, 'rvaca', {contextPath: ctx});
            // Enable announcements on Settings › Website › Setup › Announcements.
            const en = {};
            await page.goto(app.url(`/index.php/${ctx}/en/management/settings/website`));
            await idle(page);
            await page.locator('#setup-button').first().click();
            await idle(page);
            await page.getByRole('tab', {name: 'Announcements', exact: true}).first().click();
            await idle(page);
            await sleep(800);
            const box = page.locator('input[type=checkbox][name=enableAnnouncements]').first();
            await expect(box).toBeVisible({timeout: T});
            en.before = await box.isChecked();
            await snap('u12-settings-before');
            if (!en.before) await box.check();
            const form = page.locator('form').filter({has: box}).first();
            const saved = page.waitForResponse((r) => /\/contexts\/\d+/.test(r.url()) && r.request().method() !== 'GET', {timeout: T}).catch(() => null);
            await form.getByRole('button', {name: 'Save', exact: true}).click();
            const sr = await saved;
            en.save = sr ? sr.status() : null;
            await idle(page);
            await sleep(800);
            await snap('u12-settings-saved');
            en.db = sql(app, `select setting_value from ${app.contextTables.settings} where setting_name='enableAnnouncements'`);
            fact('u12', 'enable', en);

            // The API add without sendEmail, from the Announcements page's own session.
            await page.goto(app.url(`/index.php/${ctx}/en/management/settings/announcements`));
            await idle(page);
            await sleep(800);
            await snap('u12-announcements-page');
            const fromA = srv.mark();
            const api = await page.evaluate(async (title) => {
                const base = window.pkp.context.apiBaseUrl;
                const r = await fetch(`${base}announcements`, {method: 'POST', headers: {'Content-Type': 'application/json', 'X-Csrf-Token': window.pkp.currentUser.csrfToken},
                    body: JSON.stringify({title: {en: title}, descriptionShort: {en: `<p>${title} short</p>`}, description: {en: `<p>${title} body</p>`}})});
                const text = await r.text();
                return {status: r.status, base, body: text.slice(0, 1500)};
            }, `I23F API ${tagA}`);
            await sleep(1000);
            api.log = logSince(fromA);
            try { api.id = JSON.parse(api.body).id; } catch { api.id = null; }
            fact('u12', 'api-add', api);

            const readView = async (id, who) => {
                const from = srv.mark();
                const out = {chain: await chain(`announcement/view/${id}`)};
                out.browser = await visit(`announcement/view/${id}`, `u12-view-${id}-${who}`);
                await sleep(1000);
                out.log = logSince(from);
                return out;
            };
            if (api.id) {
                fact('u12', 'view-api-rvaca', await readView(api.id, 'rvaca'));
            }

            // The screen's own "Add Announcement": the request body's keys.
            const scr = {};
            try {
                await page.goto(app.url(`/index.php/${ctx}/en/management/settings/announcements`));
                await idle(page);
                const bodies = [];
                const onReq = (req) => {
                    if (/\/announcements$/.test(new URL(req.url()).pathname) && req.method() === 'POST') bodies.push(req.postData());
                };
                page.on('request', onReq);
                await page.getByRole('button', {name: 'Add Announcement', exact: true}).first().click();
                const panel = page.getByRole('dialog').filter({hasText: /Add Announcement/}).last();
                await expect(panel.locator('input[name^="title"]').first()).toBeVisible({timeout: T});
                await idle(page);
                await sleep(1500);
                await snap('u12-add-panel');
                await panel.locator('input[name="title-en"], input[name^="title"]').first().fill(`I23F screen ${tagA}`);
                const fromS = srv.mark();
                const added = page.waitForResponse((r) => /\/announcements$/.test(new URL(r.url()).pathname) && r.request().method() === 'POST', {timeout: T}).catch(() => null);
                await panel.getByRole('button', {name: 'Save', exact: true}).last().click();
                const ar = await added;
                scr.status = ar ? ar.status() : null;
                await idle(page);
                await sleep(1500);
                page.off('request', onReq);
                scr.bodyKeys = bodies.map((b) => { try { const j = JSON.parse(b); return {keys: Object.keys(j), sendEmail: j.sendEmail}; } catch { return flat(b, 300); } });
                scr.log = logSince(fromS);
                try { scr.id = ar ? (await ar.json()).id : null; } catch { scr.id = null; }
                await snap('u12-add-saved');
            } catch (e) {
                scr.error = flat(e.message, 400);
                await snap('u12-add-error').catch(() => {});
            }
            fact('u12', 'screen-add', scr);
            if (scr.id) fact('u12', 'view-screen-rvaca', await readView(scr.id, 'rvaca'));

            await signOut(page);
            if (api.id) fact('u12', 'view-api-anon', await readView(api.id, 'anon'));
            if (scr.id) fact('u12', 'view-screen-anon', await readView(scr.id, 'anon'));

            // Delete both (the request the list's "Delete" sends), as rvaca.
            await signIn(page, 'rvaca', {contextPath: ctx});
            await page.goto(app.url(`/index.php/${ctx}/en/management/settings/announcements`));
            await idle(page);
            const del = {};
            if (scr.id) {
                // The screen-made one through the list's own "Delete" › "Yes".
                const from = srv.mark();
                try {
                    const row = page.locator('li, tr, .listPanel__item').filter({hasText: `I23F screen ${tagA}`}).last();
                    await row.getByRole('button', {name: /^Delete/}).first().click();
                    const dlg = page.getByRole('dialog').filter({hasText: 'Delete Announcement'}).last();
                    await expect(dlg).toBeVisible({timeout: T});
                    await snap('u12-delete-dialog');
                    const gone = page.waitForResponse((r) => /\/announcements\/\d+$/.test(r.url()) && r.request().method() === 'POST', {timeout: T}).catch(() => null);
                    await dlg.getByRole('button', {name: 'Yes', exact: true}).click();
                    const gr = await gone;
                    del[`${scr.id}-screen`] = gr ? {status: gr.status(), override: gr.request().headers()['x-http-method-override']} : null;
                } catch (e) {
                    del[`${scr.id}-screen`] = {error: flat(e.message, 300)};
                }
                await sleep(800);
                del[`${scr.id}-screen-log`] = logSince(from);
                await snap('u12-deleted');
            }
            for (const id of [api.id, scr.id].filter(Boolean)) {
                if (Number(sql(app, `select count(*) from announcements where announcement_id=${id}`)) === 0) continue;
                const from = srv.mark();
                del[id] = await page.evaluate(async (aid) => {
                    const r = await fetch(`${window.pkp.context.apiBaseUrl}announcements/${aid}`, {method: 'POST', headers: {'X-Http-Method-Override': 'DELETE', 'X-Csrf-Token': window.pkp.currentUser.csrfToken}});
                    return r.status;
                }, id);
                await sleep(500);
                del[`${id}-log`] = logSince(from);
            }
            del.left = sql(app, 'select count(*) from announcements');
            fact('u12', 'delete', del);
        }
    } catch (e) {
        log('[FAILED]', String(e.stack || e).slice(0, 2000));
        record(`i23f-FAILED`, {error: String(e.stack || e).slice(0, 3000), url: rel(page.url())});
        await snap('failed').catch(() => {});
        process.exitCode = 1;
    } finally {
        await close();
    }
});
