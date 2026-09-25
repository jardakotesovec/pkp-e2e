// U48 claim check, chunk K3: the "Body Text" page and the import. Spec docs/specs/U48-jats-and-body-text.md:
// Purpose absence 24–28; Actors rows 52–53; Rules 14–23 (190–254); Side effects 255–269; Settings bullet 3 (287–294);
// Cross-feature interactions 295–324; Canonical preamble and Coverage 325–385; register A2, A3, A5, OMP1.
// Footnotes b, c, g, n, o, p, q, r, s, t, v, d3, d16–d24, d28, f-a2, f-a3, f-a5, f-omp1.
//
//   PROBE_FEATURE=U48 PROBE_AGENT=ccK3 node bin/probe.js ojs shared/playwright/checks/U48/K3/k3.js
//   PROBE_FEATURE=U48 PROBE_AGENT=ccK3 ONLY=omp,ops node bin/probe.js all shared/playwright/checks/U48/K3/k3.js
//   PHASES=seed,explore,basics,panel,leave,refs,drag,roles,author,settings3,import,importfig,published,screenpub,where,figures,log,xfeat,absence
//   (s3check is a rerun-only read; default all, run in code order; state in k3-state-<app>.json in the output folder; delete it for a fresh seed). Phases mutate their
//   own submissions; rerun from a fresh seed. The OJS run outlasts the Bash cap: run it detached (nohup … & echo $! > pid).
//
// Scratch contexts (OJS; OMP and OPS one press / server each for the absence reads and OMP1):
//   J  users mgr (manager), ed (editor), pe (productionEditor), se (sectionEditor), ge (guestEditor), le, lp, lx (layoutEditor),
//      pr (proofreader), fc (funding), au (author), rd (reader)
//      a   Production, no references                      → Rules 14, 15, 16, 18, 19; "No references yet."
//      r   Production, two references                     → Rule 17
//      g   Production, participants se, ge, le, lp (permitted), pr, JATS file → Actors row 5, A2, Settings bullet 3
//      g2  Production, participant lx (default)            → Settings bullet 3 on screen: the assignment's box ticked by the manager
//      rv  Review, participant fc                          → no "Body Text" without Production access
//      i   Production, notes.md on "Submission Files"      → Rule 20, Actors row 6 (menu per level), Rule 14 per version
//      i2  Production                                      → Rule 20 with images and the failure (files uploaded on screen)
//      p   published, box ticked, no galley, participant le → Rule 21, A3, Rule 23/A5 (no galley end)
//      h   published, box ticked, HTML galley               → Rule 23/A5 (galley end)
//      f   Production                                      → Rule 22 (never saved end), f2 Production (saved end)
//      l   Production                                      → Side effects (History lines), no email
// No assertions: the script records, the reader judges.
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, signOut, screen, shot, record, loc, note, idle, tag, outDir} = require('../../../probe');

const T = 30_000;
const HERE = __dirname;
const REPO = path.resolve(HERE, '../../../../..');
const ALL = ['seed', 'explore', 'basics', 'panel', 'leave', 'refs', 'drag', 'roles', 'author', 'settings3', 'import', 'importfig', 'published', 'screenpub', 'where', 'figures', 'log', 'xfeat', 'absence'];
const PHASES = (process.env.PHASES || ALL.join(',')).split(',');
const on = (p) => PHASES.includes(p);
const log = (...a) => console.log('[k3]', ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (s, n = 1500) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));
const statePath = (app) => path.join(outDir(), `k3-state-${app.name}.json`);
const rel = (u) => (u ? String(u).replace(/^https?:\/\/[^/]+/, '') : u);

forEachApp(async (app) => {
    const isOJS = app.name === 'ojs';
    const isOMP = app.name === 'omp';
    const S = fs.existsSync(statePath(app)) ? JSON.parse(fs.readFileSync(statePath(app), 'utf8')) : {};
    const save = () => fs.writeFileSync(statePath(app), JSON.stringify(S, null, 1));
    const fact = (k, v) => { record('k3-facts', {[k]: v}, {merge: true}); log(`[${app.name} ${k}]`, JSON.stringify(v).slice(0, 4000)); };
    const FIX = (f) => path.join(app.suiteDir, 'fixtures', 'files', f);

    // ------------------------------------------------------------------ seed
    if (on('seed') && !S.seeded) {
        const t = tag('u48k3');
        S.t = t;
        const U = (p, k, role, g, f) => ({username: `${p}${k}`, roles: [role], givenName: g, familyName: f});
        const sub = async (ctx, k, spec) => {
            try {
                const r = await app.api.createSubmission({tag: `${t}${k}`, context: ctx.path, submitter: ctx.u.au, title: `K3 ${k} Wombat ${t}`, ...spec});
                log('seed', k, r.submissionId, r.publicationId, r.stageId, JSON.stringify(r.jats));
                return {id: r.submissionId, pub: r.publicationId, title: `K3 ${k} Wombat ${t}`, jats: r.jats || null, files: r.files || null};
            } catch (e) { log('seed FAILED', k, String(e.message).slice(0, 700)); return {error: String(e.message).slice(0, 700)}; }
        };
        S.s = {};
        const p = `${t}j`;
        if (isOJS) {
            const keys = [['mgr', 'manager', 'Mira', 'Manager'], ['ed', 'editor', 'Eda', 'Editor'], ['pe', 'productionEditor', 'Pat', 'Production'],
                ['se', 'sectionEditor', 'Sid', 'Section'], ['ge', 'guestEditor', 'Gus', 'Guest'], ['le', 'layoutEditor', 'Lea', 'Layout'],
                ['lp', 'layoutEditor', 'Lou', 'Permitted'], ['lx', 'layoutEditor', 'Lex', 'Layoutx'], ['pr', 'proofreader', 'Pia', 'Proof'],
                ['fc', 'funding', 'Fay', 'Funding'], ['au', 'author', 'Ava', 'Author'], ['rd', 'reader', 'Rae', 'Reader']];
            const r1 = await app.api.createContext({tag: p, context: {name: `U48 K3 journal ${p}`, acronym: 'KTHR', contactName: 'K3 Contact', contactEmail: `${p}c@mail.test`},
                users: keys.map(([k, r, g, f]) => U(p, k, r, g, f))});
            S.J = {path: r1.path || p, u: Object.fromEntries(keys.map(([k]) => [k, `${p}${k}`])), names: Object.fromEntries(keys.map(([k, , g, f]) => [k, `${g} ${f}`]))};
            save();
            const J = S.J;
            const prod = {decisions: ['skipExternalReview', 'sendToProduction']};
            const part = (k, role, extra = {}) => ({username: J.u[k], role, ...extra});
            S.s.a = await sub(J, 'a', {...prod});
            S.s.r = await sub(J, 'r', {...prod, citationsRaw: ['Alpha, A. (2020). First K3 reference title. Journal of Tests, 1(1), 1-2.', 'Beta, B. (2021). Second K3 reference title. Journal of Tests, 2(2), 3-4.']});
            S.s.g = await sub(J, 'g', {...prod, jats: {file: 'article.xml'},
                participants: [part('se', 'sectionEditor'), part('ge', 'guestEditor'), part('le', 'layoutEditor'), part('lp', 'layoutEditor', {canChangeMetadata: true}), part('pr', 'proofreader')]});
            S.s.g2 = await sub(J, 'g2', {...prod, participants: [part('lx', 'layoutEditor')]});
            S.s.rv = await sub(J, 'rv', {decisions: ['sendExternalReview'], participants: [part('fc', 'funding')]});
            S.s.i = await sub(J, 'i', {...prod, files: [{file: 'notes.md'}], participants: [part('se', 'sectionEditor'), part('le', 'layoutEditor'), part('pe', 'productionEditor')]});
            S.s.i2 = await sub(J, 'i2', {...prod});
            S.s.p = await sub(J, 'p', {...prod, jats: {makePublic: true}, participants: [part('le', 'layoutEditor')], published: true});
            S.s.h = await sub(J, 'h', {...prod, galleys: [{label: 'HTML', file: 'article.html'}], mediaFiles: [{file: 'figure.png'}], jats: {makePublic: true}, published: true});
            S.s.f = await sub(J, 'f', {...prod});
            S.s.f2 = await sub(J, 'f2', {...prod});
            S.s.l = await sub(J, 'l', {...prod});
        } else if (isOMP) {
            const keys = [['mgr', 'manager', 'Mira', 'Manager'], ['ed', 'editor', 'Eda', 'Editor'], ['se', 'sectionEditor', 'Sid', 'Series'],
                ['le', 'layoutEditor', 'Lea', 'Layout'], ['au', 'author', 'Ava', 'Author']];
            const r1 = await app.api.createContext({tag: p, context: {name: `U48 K3 press ${p}`, acronym: 'KTHR', contactName: 'K3 Contact', contactEmail: `${p}c@mail.test`},
                users: keys.map(([k, r, g, f]) => U(p, k, r, g, f))});
            S.J = {path: r1.path || p, u: Object.fromEntries(keys.map(([k]) => [k, `${p}${k}`]))};
            save();
            const J = S.J;
            S.s.m1 = await sub(J, 'm1', {files: [{file: 'notes.md'}], participants: [{username: J.u.se, role: 'sectionEditor'}]});
            S.s.m2 = await sub(J, 'm2', {files: [{file: 'notes.md'}]});
            S.s.m3 = await sub(J, 'm3', {decisions: ['skipExternalReview', 'sendToProduction'], published: true});
            if (S.s.m3.error) S.s.m3 = await sub(J, 'm3', {published: true});
            try { await app.api.createSubmission({tag: `${t}mj`, context: J.path, submitter: J.u.au, jats: {makePublic: true}}); S.jatsKey = 'accepted'; } catch (e) { S.jatsKey = String(e.message).slice(0, 300); }
        } else {
            const keys = [['mgr', 'manager', 'Mira', 'Manager'], ['se', 'sectionEditor', 'Sid', 'Moderator'], ['au', 'author', 'Ava', 'Author']];
            const r1 = await app.api.createContext({tag: p, context: {name: `U48 K3 server ${p}`, acronym: 'KTHR', contactName: 'K3 Contact', contactEmail: `${p}c@mail.test`},
                users: keys.map(([k, r, g, f]) => U(p, k, r, g, f))});
            S.J = {path: r1.path || p, u: Object.fromEntries(keys.map(([k]) => [k, `${p}${k}`]))};
            save();
            S.s.x1 = await sub(S.J, 'x1', {galleys: [{label: 'PDF', file: 'preprint.pdf'}], published: true});
            S.s.x2 = await sub(S.J, 'x2', {});
        }
        S.seeded = true;
        save();
        fact('seed', {t: S.t, J: S.J, s: S.s, jatsKey: S.jatsKey});
    }
    const s = S.s || {};
    const J = S.J;

    const {page, close} = await launch(app);
    const jsDialogs = [];
    let dialogAnswer = 'dismiss';
    page.on('dialog', async (d) => {
        jsDialogs.push({at: Date.now(), type: d.type(), message: d.message().slice(0, 300), answered: d.type() === 'beforeunload' ? 'accept' : dialogAnswer});
        try { if (d.type() === 'beforeunload' || dialogAnswer === 'accept') await d.accept(); else await d.dismiss(); } catch (e) { /* gone */ }
    });
    const resps = [];
    page.on('response', (r) => {
        const u = r.url();
        if (/\.(js|css|png|svg|woff2?|wasm|ico)(\?|$)/.test(u) && r.status() < 400) return;
        if (r.request().method() !== 'GET' || r.status() >= 400 || /\/api\//.test(u)) resps.push({at: Date.now(), m: r.request().method(), s: r.status(), url: rel(u).slice(0, 220)});
    });
    const respsSince = (t0) => resps.filter((x) => x.at >= t0).map((x) => `${x.m} ${x.s} ${x.url}`);
    const dialogsSince = (t0) => jsDialogs.filter((d) => d.at >= t0).map((d) => `${d.type}: ${d.message} [${d.answered}]`);

    async function snap(name, extra = {}, pg = page) {
        let sc;
        try { sc = await screen(pg); } catch (e) { sc = {url: pg.url(), error: String(e.message).slice(0, 200)}; }
        Object.assign(sc, extra);
        record(name, sc);
        await shot(pg, name).catch(() => {});
        return sc;
    }
    async function sect(name, fn) {
        try { return await fn(); } catch (e) {
            log(`[${name} FAILED]`, String(e.stack || e).split('\n').slice(0, 4).join(' | '));
            fact(`${name}.FAILED`, String(e.message || e).slice(0, 600));
            await snap(`zz-failed-${name.replace(/[^a-z0-9]+/gi, '-')}`).catch(() => {});
            return null;
        }
    }
    const as = async (user, ctx = J.path) => { await signIn(page, user, {contextPath: ctx}); await idle(page).catch(() => {}); };
    const out = async () => { await signOut(page).catch(() => {}); };
    const vis = '[role="dialog"]:visible';
    const wfUrl = (sid, key, author) => app.url(`/index.php/${J.path}/dashboard/${author ? 'mySubmissions' : 'editorial'}?workflowSubmissionId=${sid}${key ? `&workflowMenuKey=${key}` : ''}`);
    const btKey = (pid) => `publication_${pid}_bodyText`;
    const P = () => { const {PublishScreen} = require(path.join(app.suiteDir, 'pages', 'PublishSchedulePages.js')); return new PublishScreen(page, J.path); };

    // ---- the side menu as a list of entries (level markers as K1 reads them)
    async function menu() {
        return page.evaluate(() => {
            const v = (e) => e && e.getClientRects().length > 0;
            const f = (x) => (x || '').replace(/\s+/g, ' ').trim();
            const dlg = [...document.querySelectorAll('[role=dialog]')].filter(v)[0] || document.body;
            const nav = dlg.querySelector('nav') || dlg;
            return [...nav.querySelectorAll('a')].map((a) => `${f(a.textContent)}${a.getAttribute('aria-current') ? '*' : ''}${v(a) ? '' : '(hidden)'}`).filter((x) => x.replace(/[*()]|hidden/g, ''));
        }).catch((e) => [`error ${e.message}`]);
    }
    async function unfoldVersions() {
        const nodes = page.locator(`${vis} nav a`).filter({hasText: /^\s*(Version|Unassigned version)\b/});
        const n = await nodes.count().catch(() => 0);
        for (let i = 0; i < n; i++) {
            const a = nodes.nth(i);
            const exp = await a.getAttribute('aria-expanded').catch(() => null);
            if (exp === 'false') { await a.click().catch(() => {}); await sleep(300); }
        }
    }

    // ---- the "Body Text" page as data
    const ed = () => page.locator('sciflow-editor [contenteditable]').first();
    const saveBtn = () => page.locator('.sciflow-body-text__save-row button').first();
    async function btInfo() {
        const i = await page.evaluate(() => {
            const v = (e) => e && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden' && getComputedStyle(e).display !== 'none';
            const f = (x) => (x || '').replace(/\s+/g, ' ').trim();
            const root = document.querySelector('.sciflow-body-text');
            const dlg = [...document.querySelectorAll('[role=dialog]')].filter(v)[0] || document.body;
            const heads = [...dlg.querySelectorAll('h1,h2')].filter(v).map((h) => f(h.textContent)).slice(0, 4);
            if (!root) return {present: false, heads, text: f(dlg.innerText).slice(-600)};
            const ce = root.querySelector('sciflow-editor [contenteditable]') || (root.querySelector('sciflow-editor')?.shadowRoot?.querySelector('[contenteditable]'));
            const badge = root.querySelector('.sciflow-body-text__unsaved');
            const saveB = root.querySelector('.sciflow-body-text__save-row button');
            const fsB = [...root.querySelectorAll('.sciflow-body-text__document-bar > button')].pop();
            const status = document.querySelector('.sciflow-body-text__main [role=status]');
            const secs = [...root.querySelectorAll('details.sciflow-body-text__sidebar-section')].map((d) => `${f(d.querySelector('summary')?.innerText)}${d.open ? '[open]' : ''}`);
            const imgs = ce ? [...ce.querySelectorAll('img')].map((im) => (im.getAttribute('src') || '').replace(/^.*\/index\.php/, '').slice(0, 160)) : [];
            return {
                present: true, heads,
                editorText: ce ? f(ce.innerText).slice(0, 900) : null,
                editorHtml: ce ? ce.innerHTML.replace(/\s+/g, ' ').slice(0, 1500) : null,
                editable: ce ? ce.getAttribute('contenteditable') : null,
                imgs,
                badge: badge ? v(badge) : null,
                save: saveB ? {text: f(saveB.innerText), disabled: saveB.disabled} : null,
                fullscreen: fsB ? {text: f(fsB.innerText), pressed: fsB.getAttribute('aria-pressed')} : null,
                fullscreenClass: root.classList.contains('sciflow-body-text--fullscreen'),
                status: status ? f(status.innerText) : null,
                sections: secs,
                panelTitle: f(root.querySelector('.sciflow-body-text__panel-title')?.innerText),
            };
        }).catch((e) => ({error: String(e.message)}));
        return i;
    }
    async function openBody(sid, pid, name, {author = false, extra = {}, wait = true} = {}) {
        const t0 = Date.now();
        await page.goto(wfUrl(sid, btKey(pid), author));
        await idle(page).catch(() => {});
        if (wait) {
            await page.locator('sciflow-editor').first().waitFor({state: 'attached', timeout: 20000}).catch(() => {});
            await ed().waitFor({state: 'visible', timeout: 15000}).catch(() => {});
            // the editor fills from the GET; wait for the page's bodyText GET to have answered
            await page.waitForFunction(() => !!document.querySelector('.sciflow-body-text__save-row'), null, {timeout: 10000}).catch(() => {});
            await idle(page).catch(() => {}); await sleep(1500);
        }
        const info = await btInfo();
        await unfoldVersions();
        info.menu = await menu();
        info.resps = respsSince(t0).filter((x) => !/^GET 200/.test(x) || /bodyText/.test(x)).slice(0, 12);
        info.dialogs = dialogsSince(t0);
        if (name) await snap(name, {bt: info, ...extra});
        log(`[${name}]`, JSON.stringify({heads: info.heads, text: info.editorText, badge: info.badge, save: info.save, sections: info.sections, status: info.status, present: info.present}));
        return info;
    }
    async function typeAtEnd(text) {
        await ed().click();
        await page.keyboard.press('Meta+ArrowDown').catch(() => {});
        await page.keyboard.press('Control+End').catch(() => {});
        await page.keyboard.type(text, {delay: 15});
        await sleep(500);
    }
    async function pressSave(name) {
        const t0 = Date.now();
        const respP = page.waitForResponse((r) => /\/bodyText/.test(r.url()) && r.request().method() !== 'GET', {timeout: T}).catch(() => null);
        await saveBtn().click();
        const r = await respP;
        const labelAt = [];
        let last = 0;
        for (const ms of [100, 700, 1300, 2000, 2600]) { await sleep(ms - last); last = ms; labelAt.push(`${ms}:${flat(await saveBtn().innerText().catch(() => null), 30)}`); }
        await idle(page).catch(() => {});
        const errWin = page.getByRole('dialog').filter({hasText: /^\s*Error/}).last();
        const err = await errWin.isVisible().catch(() => false) ? flat(await errWin.innerText(), 300) : null;
        const notices = flat(await page.locator('.pkpNotification, .pkp_notification, [role=alert]').allInnerTexts().catch(() => []).then((a) => a.join(' | ')), 400);
        const info = await btInfo();
        const o = {status: r ? r.status() : null, method: r ? r.request().method() : null, labelAt, errWin: err, notices, badge: info.badge, text: info.editorText, resps: respsSince(t0).slice(0, 8), dialogs: dialogsSince(t0)};
        if (name) await snap(name, {save: o, bt: info});
        if (err) { await errWin.getByRole('button', {name: 'OK', exact: true}).click().catch(() => {}); await sleep(500); }
        log(`[${name}]`, JSON.stringify(o));
        return o;
    }

    try {
        // ============================================================ explore: the page's controls, shadow parts (first run only)
        if (on('explore') && isOJS) await sect('explore', async () => {
            await as(J.u.mgr);
            const i = await openBody(s.r.id, s.r.pub, 'ex-01-r-bodytext');
            const dump = await page.evaluate(() => {
                const f = (x) => (x || '').replace(/\s+/g, ' ').trim();
                const walk = (el) => (el ? (el.shadowRoot ? el.shadowRoot.innerHTML : el.innerHTML) : null);
                const q = (sel) => document.querySelector(sel);
                return {
                    formatbar: (walk(q('sciflow-formatbar')) || '').replace(/\s+/g, ' ').slice(0, 6000),
                    reflist: (walk(q('sciflow-reference-list')) || '').replace(/\s+/g, ' ').slice(0, 5000),
                    editorShadow: !!q('sciflow-editor')?.shadowRoot,
                    editorInner: (walk(q('sciflow-editor')) || '').replace(/\s+/g, ' ').slice(0, 2500),
                    selection: (walk(q('sciflow-selection-editor')) || '').replace(/\s+/g, ' ').slice(0, 1500),
                    outline: (walk(q('sciflow-outline')) || '').replace(/\s+/g, ' ').slice(0, 1500),
                    aside: f(q('.sciflow-body-text__sidebar')?.innerText).slice(0, 1500),
                };
            });
            fact('explore', {info: i, dump});
            const bar = await page.locator('sciflow-formatbar').getByRole('button').evaluateAll((bs) => bs.map((b) => `${(b.innerText || '').trim()}|${b.getAttribute('title') || ''}|${b.getAttribute('aria-label') || ''}`)).catch((e) => [String(e.message)]);
            fact('explore.bar', bar);
        });

        // ---- helpers used by the phases below (defined here so the explore phase stays first)
        const refItems = () => page.locator('sciflow-reference-list li.reference-item');
        const refState = () => page.evaluate(() => {
            const rl = document.querySelector('sciflow-reference-list');
            const root = rl && (rl.shadowRoot || rl);
            if (!root) return null;
            const f = (x) => (x || '').replace(/\s+/g, ' ').trim();
            const items = [...root.querySelectorAll('li')].map((li) => ({id: li.getAttribute('data-reference-id'), cls: f(li.className), text: f(li.querySelector('.reference-text')?.innerText || li.innerText).slice(0, 80),
                cite: li.querySelector('.reference-cite-btn') ? (li.querySelector('.reference-cite-btn').disabled ? 'Cite[disabled]' : 'Cite') : null}));
            return {items, text: f(root.textContent).slice(0, 400)};
        }).catch((e) => ({error: String(e.message)}));
        const sectionSummary = (key) => page.locator(`details[data-sidebar-section="${key}"] > summary`).first();
        const sectionsNow = async () => (await btInfo()).sections;
        const jp = () => page.locator('.jatsPanel');
        async function jatsRead(sid, pid, name) {
            const t0 = Date.now();
            await page.goto(wfUrl(sid, `publication_${pid}_jats`));
            await idle(page).catch(() => {});
            await jp().locator('.filePanel__ready').waitFor({state: 'visible', timeout: 20000}).catch(() => {});
            await idle(page).catch(() => {}); await sleep(500);
            const r = await page.evaluate(() => {
                const v = (e) => e && e.getClientRects().length > 0;
                const f = (x) => (x || '').replace(/\s+/g, ' ').trim();
                const p = document.querySelector('.jatsPanel');
                if (!p || !v(p)) return {present: false};
                const code = p.querySelector('.filePanel__fileContent');
                const cb = p.querySelector('input[type=checkbox]');
                const foot = p.querySelector('.filePanel__defaultContentFooter, .filePanel__fileContentFooter');
                return {present: true, buttons: [...p.querySelectorAll('.filePanel__header button')].filter(v).map((b) => `${f(b.innerText)}${b.disabled ? '[disabled]' : ''}`),
                    box: cb ? {checked: cb.checked, disabled: cb.disabled} : null, footer: foot ? f(foot.innerText) : null, xml: code ? code.innerText : ''};
            }).catch((e) => ({error: String(e.message)}));
            const xml = r.xml || '';
            delete r.xml;
            const bodyM = xml.match(/<body[^>]*>([\s\S]*?)<\/body>/);
            r.xmlFacts = {len: xml.length, body: bodyM ? flat(bodyM[1], 400) : null, refs: (xml.match(/<ref[ >]/g) || []).length, mixed: (xml.match(/<mixed-citation/g) || []).length,
                title: flat((xml.match(/<article-title[^>]*>([\s\S]*?)<\/article-title>/) || [])[1], 120), hasBodyTextSentence: /Only in the body text/.test(xml)};
            r.headerButtons = (await page.locator('[data-cy="workflow-controls-right"] button, [data-cy="workflow-controls-right"] a').allInnerTexts().catch(() => [])).map((x) => flat(x, 60));
            r.resps = respsSince(t0).filter((x) => !/^GET 200/.test(x) || /jats/.test(x)).slice(0, 10);
            if (name) await snap(name, {jats: r});
            log(`[${name}]`, JSON.stringify(r));
            return r;
        }
        async function closeError() {
            const err = page.getByRole('dialog').filter({hasText: /^\s*Error/}).last();
            if (!(await err.isVisible().catch(() => false))) return null;
            const txt = flat(await err.innerText(), 300);
            await err.getByRole('button', {name: 'OK', exact: true}).click().catch(() => {});
            await err.waitFor({state: 'hidden', timeout: 10000}).catch(() => {});
            await sleep(500);
            return txt;
        }
        async function jatsUpload(file) {
            const t0 = Date.now();
            const [chooser] = await Promise.all([page.waitForEvent('filechooser', {timeout: 15000}), jp().getByRole('button', {name: 'Upload', exact: true}).click()]);
            const resp = page.waitForResponse((r) => /\/jats(\?|$)/.test(r.url()) && r.request().method() === 'POST', {timeout: T}).catch(() => null);
            await chooser.setFiles(file);
            const r = await resp;
            await idle(page).catch(() => {}); await sleep(1500);
            return {post: r ? r.status() : null, resps: respsSince(t0).slice(0, 6), err: await closeError()};
        }
        async function jatsDelete() {
            const t0 = Date.now();
            await jp().getByRole('button', {name: 'Delete', exact: true}).click();
            const dlg = page.getByRole('dialog').filter({hasText: 'Confirm deleting JATS XML'}).last();
            await dlg.waitFor({timeout: 15000});
            const txt = flat(await dlg.innerText(), 400);
            await dlg.getByRole('button', {name: 'Delete JATS File', exact: true}).click();
            await sleep(1500); await idle(page).catch(() => {});
            return {dialog: txt, resps: respsSince(t0).filter((x) => !/^GET/.test(x)), err: await closeError()};
        }
        async function jatsTick(want) {
            const t0 = Date.now();
            await jp().getByText('Make available with publication', {exact: true}).first().click();
            const dlg = page.getByRole('dialog').filter({hasText: want ? 'Enable JATS XML Download' : 'Disable JATS XML Download'}).last();
            const shown = await dlg.waitFor({timeout: 10000}).then(() => true).catch(() => false);
            if (shown) await dlg.getByRole('button', {name: 'Confirm', exact: true}).click();
            await sleep(1500); await idle(page).catch(() => {});
            const err = await closeError();
            const checked = await jp().locator('input[type=checkbox]').first().isChecked().catch(() => null);
            return {dialog: shown, err, checkedAfter: checked, resps: respsSince(t0).filter((x) => !/^GET/.test(x))};
        }
        // A file list's row menu (headlessui items at the document root), optionally pressing one item.
        async function rowMenu(tableName, rowText, press) {
            const t = page.locator(vis).first().getByRole('table', {name: tableName, exact: true}).first();
            const present = await t.waitFor({timeout: 15000}).then(() => true).catch(() => false);
            if (!present) return {table: false};
            const row = t.locator('tbody tr').filter({hasText: rowText}).first();
            if (!(await row.waitFor({timeout: 15000}).then(() => true).catch(() => false))) return {table: true, row: false, rows: await t.locator('tbody tr').allInnerTexts().catch(() => [])};
            const btn = row.getByRole('button', {name: /More Actions/}).first();
            if (!(await btn.count())) return {table: true, row: true, menuButton: false};
            await btn.click(); await sleep(400);
            const items = (await page.getByRole('menuitem').allInnerTexts().catch(() => [])).map((x) => flat(x, 60));
            if (press && items.includes(press)) {
                await page.getByRole('menuitem', {name: press, exact: true}).first().click();
                await idle(page).catch(() => {}); await sleep(600);
                return {items, pressed: press};
            }
            await page.keyboard.press('Escape').catch(() => {}); await sleep(300);
            return {items};
        }
        const openWf = async (sid, key, name, {author = false} = {}) => {
            await page.goto(wfUrl(sid, key, author)); await idle(page).catch(() => {}); await sleep(1200); await idle(page).catch(() => {});
            await unfoldVersions();
            const o = {url: rel(page.url()).replace(/^.*\?/, ''), menu: await menu(), heads: await page.locator(`${vis} h1, ${vis} h2`).allInnerTexts().catch(() => [])};
            if (name) await snap(name, {wf: o});
            return o;
        };
        // The "Send File to Text Editor" window: its text and choices; choose one option (by index) and Confirm, watching the import box.
        async function sendToEditor(tableName, rowText, optionIndex, name) {
            const m = await rowMenu(tableName, rowText, 'Send to Text Editor');
            const o = {menu: m.items || m};
            if (!m.pressed) { o.notOffered = true; return o; }
            const dlg = page.getByRole('dialog', {name: 'Send File to Text Editor'});
            await dlg.locator('select[name="sendToVersion"]').waitFor({timeout: T}).catch(() => {});
            o.window = {text: flat(await dlg.innerText().catch(() => ''), 600), options: await dlg.locator('select[name="sendToVersion"] option').allInnerTexts().catch(() => []),
                buttons: (await dlg.getByRole('button').allInnerTexts().catch(() => [])).map((x) => flat(x, 40))};
            await snap(`${name}-window`, {send: o.window});
            const opts = await dlg.locator('select[name="sendToVersion"] option').evaluateAll((os) => os.map((x) => x.value)).catch(() => []);
            o.window.values = opts;
            // optionIndex: a number (position), or {pub} to pick the version whose value is that publication id
            let idx = typeof optionIndex === 'number' ? optionIndex : opts.findIndex((v) => String(v) === String(optionIndex.pub));
            if (idx < 0) idx = 1;
            if (opts[idx] != null) await dlg.locator('select[name="sendToVersion"]').selectOption(opts[idx]);
            o.chosen = `${o.window.options[idx]} (${opts[idx]})`;
            await page.evaluate(() => {
                window.__k3s = []; clearInterval(window.__k3t);
                window.__k3t = setInterval(() => {
                    const el = document.querySelector('.sciflow-body-text__main [role=status]');
                    const t = el ? el.innerText.replace(/\s+/g, ' ').trim() : '(none)';
                    const a = window.__k3s; if (!a.length || a[a.length - 1] !== t) a.push(t);
                }, 25);
            });
            const t0 = Date.now();
            await dlg.getByRole('button', {name: 'Confirm', exact: true}).click();
            // wait for the box to come and go (or fail), bounded
            let seen = false;
            for (let i = 0; i < 240; i++) {
                const st = await page.evaluate(() => window.__k3s || []).catch(() => []);
                if (st.some((x) => /Importing|Import failed/.test(x))) seen = true;
                const last = st[st.length - 1];
                if (seen && (last === '(none)' || /Import failed/.test(last || ''))) break;
                if (!seen && i > 60) break;
                await sleep(250);
            }
            await idle(page).catch(() => {}); await sleep(1000);
            o.statusSeq = await page.evaluate(() => { clearInterval(window.__k3t); return window.__k3s; }).catch(() => null);
            o.url = rel(page.url()).replace(/^.*\?/, '');
            o.bt = await btInfo();
            await unfoldVersions();
            o.menu2 = await menu();
            o.resps = respsSince(t0).filter((x) => !/^GET 200 .*\.(js|css)/.test(x)).slice(0, 25);
            o.dialogs = dialogsSince(t0);
            await snap(name, {send: o});
            log(`[${name}]`, JSON.stringify({chosen: o.chosen, statusSeq: o.statusSeq, url: o.url, text: o.bt.editorText, badge: o.bt.badge, status: o.bt.status}));
            return o;
        }
        async function mailCount() {
            const o = {};
            for (const [k, u] of Object.entries(J.u || {})) { try { o[k] = await app.mail.count({to: `${u}@mail.test`}); } catch (e) { o[k] = `err ${flat(e.message, 60)}`; } }
            return o;
        }

        // ============================================================ basics: Rules 14, 15, 18, 19 on a never-saved version (a)
        if (on('basics') && isOJS) await sect('basics', async () => {
            const o = {};
            await as(J.u.mgr);
            o.arrive = await openBody(s.a.id, s.a.pub, 'b-01-a-arrive');
            o.refsEmpty = await refState();
            await loc(page, 'Body Text: "Save" button', saveBtn());
            await loc(page, 'Body Text: "Unsaved Changes" badge', page.locator('.sciflow-body-text__unsaved'));
            await loc(page, 'Body Text: editor editable area (shadow)', ed());
            // the toolbar's menus (sweep)
            const bar = page.locator('sciflow-formatbar');
            await ed().click(); await sleep(300);
            o.toolbar = await bar.getByRole('button').evaluateAll((bs) => bs.map((b) => `${(b.getAttribute('aria-label') || b.innerText || '').trim()}${b.disabled ? '[disabled]' : ''}`)).catch((e) => [String(e.message)]);
            await bar.getByRole('button', {name: 'Insert', exact: true}).click().catch(() => {}); await sleep(400);
            o.insertMenu = await bar.locator('[role=menuitem], [role=menu] button, .insert-dropdown li, .insert-dropdown button').evaluateAll((bs) => bs.map((b) => (b.innerText || b.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim()).filter(Boolean)).catch(() => []);
            await snap('b-01b-insert-menu', {insertMenu: o.insertMenu});
            await bar.getByRole('button', {name: 'Insert', exact: true}).click().catch(() => {}); await sleep(300);
            await bar.getByRole('button', {name: 'Text style', exact: true}).click().catch(() => {}); await sleep(400);
            o.styleMenu = await bar.locator('[role=option], [role=listbox] button, .style-dropdown li').evaluateAll((bs) => bs.map((b) => (b.innerText || '').replace(/\s+/g, ' ').trim()).filter(Boolean)).catch(() => []);
            await bar.getByRole('button', {name: 'Text style', exact: true}).click().catch(() => {}); await sleep(300);
            o.afterMenus = {url: rel(page.url()).replace(/^.*\?/, ''), present: (await btInfo()).present};
            // Rule 15: type, the badge, Save and its label, reload
            await typeAtEnd('First sentence');
            o.typed = await btInfo(); await snap('b-02-a-typed', {bt: o.typed});
            o.save1 = await pressSave('b-03-a-saved');
            o.reload1 = await openBody(s.a.id, s.a.pub, 'b-04-a-reload');
            // change then remove it again: the badge
            await typeAtEnd(' extra');
            o.changed = (await btInfo()).badge;
            for (let i = 0; i < 6; i++) await page.keyboard.press('Backspace');
            await sleep(500);
            o.revertedByBackspace = await btInfo(); await snap('b-05-a-backspaced', {bt: o.revertedByBackspace});
            // change then the toolbar's Undo
            await typeAtEnd('Z');
            o.changed2 = (await btInfo()).badge;
            await bar.getByRole('button', {name: 'Undo', exact: true}).click().catch(() => {}); await sleep(600);
            o.revertedByUndo = await btInfo(); await snap('b-06-a-undone', {bt: o.revertedByUndo});
            // "Save" with nothing changed
            o.save2 = await pressSave('b-07-a-save-unchanged');
            // Rule 18: Fullscreen, Escape, Exit fullscreen
            const fsBtn = page.locator('.sciflow-body-text__document-bar > button').last();
            const geo = () => page.evaluate(() => { const r = document.querySelector('.sciflow-body-text').getBoundingClientRect(); return {x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), vw: innerWidth, vh: innerHeight, wfOpen: !!document.querySelector('[role=dialog]')}; }).catch(() => null);
            o.geoBefore = await geo();
            await fsBtn.click(); await sleep(700);
            o.fs1 = {bt: await btInfo(), geo: await geo()}; await snap('b-08-a-fullscreen', {fs: o.fs1});
            await loc(page, 'Body Text: "Fullscreen" / "Exit fullscreen" button', fsBtn);
            await page.keyboard.press('Escape'); await sleep(700);
            o.fsEsc = {bt: await btInfo(), geo: await geo(), url: rel(page.url()).replace(/^.*\?/, '')}; await snap('b-09-a-fullscreen-escape', {fs: o.fsEsc});
            if (!(o.fsEsc.bt && o.fsEsc.bt.present)) o.reopen = await openBody(s.a.id, s.a.pub, 'b-09b-a-reopen');
            await page.locator('.sciflow-body-text__document-bar > button').last().click(); await sleep(700);
            o.fs2 = {bt: await btInfo(), geo: await geo()};
            await page.getByRole('button', {name: 'Exit fullscreen', exact: true}).click().catch((e) => { o.fs2.exitErr = flat(e.message, 100); }); await sleep(700);
            o.fsExit = {bt: await btInfo(), geo: await geo()}; await snap('b-10-a-exit-fullscreen', {fs: o.fsExit});
            // Rule 19: one section at a time; a selection opens "Selected Element"
            o.sec0 = await sectionsNow();
            await sectionSummary('outline').click(); await sleep(500);
            o.secOutline = await sectionsNow();
            await sectionSummary('selected-element').click(); await sleep(500);
            o.secSelected = await sectionsNow();
            await sectionSummary('references').click(); await sleep(500);
            o.secRefs = await sectionsNow();
            await sectionSummary('references').click(); await sleep(500);
            o.secNone = await sectionsNow();
            await sectionSummary('references').click(); await sleep(500);
            await snap('b-11-a-sections', {sections: {sec0: o.sec0, secOutline: o.secOutline, secSelected: o.secSelected, secRefs: o.secRefs, secNone: o.secNone}});
            // select a word: double-click the text
            const p1 = page.locator('sciflow-editor [contenteditable] p').first();
            await p1.dblclick().catch(() => {}); await sleep(700);
            o.secAfterSelect = await sectionsNow();
            o.selectionPanel = flat(await page.locator('sciflow-selection-editor').innerText().catch(() => null), 300);
            await snap('b-12-a-selected-word', {sections: o.secAfterSelect, selectionPanel: o.selectionPanel});
            // a collapsed cursor: does the panel stay?
            await typeAtEnd(''); await page.keyboard.press('End').catch(() => {}); await sleep(500);
            o.secAfterCollapse = await sectionsNow();
            o.editorTextEnd = (await btInfo()).editorText;
            fact('basics', o);
        });

        // ============================================================ panel: Rule 19 re-driven with settled waits (a, saved text)
        if (on('panel') && isOJS) await sect('panel', async () => {
            const o = {};
            await as(J.u.mgr);
            await openBody(s.a.id, s.a.pub, 'pn-01-arrive');
            const selText = () => page.evaluate(() => { const e = document.querySelector('sciflow-selection-editor'); const r = e && (e.shadowRoot || e); return r ? r.textContent.replace(/\s+/g, ' ').trim().slice(0, 200) : null; }).catch(() => null);
            const step = async (label, fn) => { await fn(); await sleep(1500); o[label] = {sections: await sectionsNow(), sel: await selText()}; log(`[panel ${label}]`, JSON.stringify(o[label])); };
            o.start = await sectionsNow();
            await step('A-outline-from-refs', () => sectionSummary('outline').click());
            await step('B-outline-again', () => sectionSummary('outline').click());
            await step('C-selected-from-outline', () => sectionSummary('selected-element').click());
            await step('D-selected-again', () => sectionSummary('selected-element').click());
            await snap('pn-02-sections', {panel: o});
            // close whatever is open, so none is
            for (const k of ['references', 'selected-element', 'outline']) {
                const open = await page.locator(`details[data-sidebar-section="${k}"]`).evaluate((d) => d.open).catch(() => false);
                if (open) { await sectionSummary(k).click(); await sleep(1200); }
            }
            o.allClosed = await sectionsNow();
            await step('E-keyboard-select-none-open', async () => { await ed().click(); await page.keyboard.press('Home'); await page.keyboard.press('Shift+End'); });
            await snap('pn-03-select-none-open', {panel: o['E-keyboard-select-none-open']});
            await ed().click(); await page.keyboard.press('End'); await sleep(800);
            // References open, then a selection
            const refsOpen = await page.locator('details[data-sidebar-section="references"]').evaluate((d) => d.open).catch(() => false);
            if (!refsOpen) { await sectionSummary('references').click(); await sleep(1200); if (!(await page.locator('details[data-sidebar-section="references"]').evaluate((d) => d.open).catch(() => false))) { await sectionSummary('references').click(); await sleep(1200); } }
            o.refsOpenBefore = await sectionsNow();
            await step('F-keyboard-select-refs-open', async () => { await ed().click(); await page.keyboard.press('Home'); await page.keyboard.press('Shift+End'); });
            await snap('pn-04-select-refs-open', {panel: o['F-keyboard-select-refs-open']});
            await ed().click(); await page.keyboard.press('End'); await sleep(800);
            o.beforeDbl = await sectionsNow();
            await step('G-dblclick-word', () => page.locator('sciflow-editor [contenteditable] p').first().dblclick({position: {x: 20, y: 8}}));
            await snap('pn-05-dblclick', {panel: o['G-dblclick-word']});
            for (const k of ['references', 'selected-element', 'outline']) {
                const open = await page.locator(`details[data-sidebar-section="${k}"]`).evaluate((d) => d.open).catch(() => false);
                if (open) { await sectionSummary(k).click(); await sleep(1200); }
            }
            await ed().click(); await page.keyboard.press('End'); await sleep(800);
            o.beforeDbl2 = await sectionsNow();
            await step('H-dblclick-none-open', () => page.locator('sciflow-editor [contenteditable] p').first().dblclick({position: {x: 20, y: 8}}));
            await snap('pn-06-dblclick-none-open', {panel: o['H-dblclick-none-open']});
            await step('I-mouse-drag-select', async () => { const b = await page.locator('sciflow-editor [contenteditable] p').first().boundingBox(); await page.mouse.move(b.x + 2, b.y + b.height / 2); await page.mouse.down(); await page.mouse.move(b.x + 60, b.y + b.height / 2, {steps: 5}); await page.mouse.up(); });
            fact('panel', o);
        });

        // ============================================================ leave: Rule 16 (a after basics; f2 never-saved end, K2-5)
        if (on('leave') && isOJS) await sect('leave', async () => {
            const o = {};
            await as(J.u.mgr);
            // never saved, untouched: the badge on arrival, then another side-menu entry
            o.fresh = await openBody(s.f2.id, s.f2.pub, 'l-01-f2-arrive');
            let t0 = Date.now();
            dialogAnswer = 'dismiss';
            await page.getByRole('link', {name: 'Galleys', exact: true}).first().click(); await sleep(1500); await idle(page).catch(() => {});
            o.freshLeave = {dialogs: dialogsSince(t0), url: rel(page.url()).replace(/^.*workflowMenuKey=/, '')};
            await snap('l-02-f2-left', {leave: o.freshLeave});
            // never saved, typed text
            o.fresh2 = await openBody(s.f2.id, s.f2.pub, null);
            await typeAtEnd('Typed on a never-saved page');
            t0 = Date.now();
            await page.getByRole('link', {name: 'Galleys', exact: true}).first().click(); await sleep(1500); await idle(page).catch(() => {});
            o.freshTypedLeave = {dialogs: dialogsSince(t0), url: rel(page.url()).replace(/^.*workflowMenuKey=/, '')};
            await snap('l-03-f2-typed-left', {leave: o.freshTypedLeave});
            await page.getByRole('link', {name: 'Body Text', exact: true}).first().click(); await sleep(2500); await idle(page).catch(() => {});
            o.freshBack = await btInfo(); await snap('l-04-f2-back', {bt: o.freshBack});
            // saved page (a): typed text, then "Galleys" (Cancel branch first)
            o.saved = await openBody(s.a.id, s.a.pub, 'l-05-a-arrive');
            await typeAtEnd(' Unsaved one');
            o.badgeTyped = (await btInfo()).badge;
            t0 = Date.now();
            dialogAnswer = 'dismiss';
            await page.getByRole('link', {name: 'Galleys', exact: true}).first().click(); await sleep(1500); await idle(page).catch(() => {});
            o.cancel = {dialogs: dialogsSince(t0), url: rel(page.url()).replace(/^.*workflowMenuKey=/, ''), bt: await btInfo()};
            await snap('l-06-a-galleys-cancel', {leave: o.cancel});
            if (o.cancel.dialogs.length) {
                dialogAnswer = 'accept';
                t0 = Date.now();
                await page.getByRole('link', {name: 'Galleys', exact: true}).first().click(); await sleep(1500); await idle(page).catch(() => {});
                o.ok = {dialogs: dialogsSince(t0), url: rel(page.url()).replace(/^.*workflowMenuKey=/, '')};
                await snap('l-07-a-galleys-ok', {leave: o.ok});
                dialogAnswer = 'dismiss';
            }
            await page.getByRole('link', {name: 'Body Text', exact: true}).first().click(); await sleep(2500); await idle(page).catch(() => {});
            o.back = await btInfo(); await snap('l-08-a-back', {bt: o.back});
            // "Body Text" itself with unsaved text
            await typeAtEnd(' Unsaved two');
            t0 = Date.now();
            await page.getByRole('link', {name: 'Body Text', exact: true}).first().click(); await sleep(1500); await idle(page).catch(() => {});
            o.self = {dialogs: dialogsSince(t0), bt: await btInfo()}; await snap('l-09-a-self', {leave: o.self});
            // reload with unsaved text
            await typeAtEnd(' Unsaved three');
            t0 = Date.now();
            await page.reload().catch((e) => { o.reloadErr = flat(e.message, 120); });
            await idle(page).catch(() => {}); await sleep(2500);
            o.reload = {dialogs: dialogsSince(t0), bt: await btInfo()}; await snap('l-10-a-reloaded', {leave: o.reload});
            // the workflow window's own close with unsaved text (sweep)
            o.pre = await openBody(s.a.id, s.a.pub, null);
            await typeAtEnd(' Unsaved four');
            t0 = Date.now();
            const closeB = page.locator(vis).first().getByRole('button', {name: /^Close/}).first();
            o.closeButton = await closeB.count();
            if (o.closeButton) { await closeB.click().catch(() => {}); await sleep(1500); await idle(page).catch(() => {}); }
            o.closeWf = {dialogs: dialogsSince(t0), url: rel(page.url()).replace(/^.*\/index\.php/, ''), wfOpen: await page.locator('.sciflow-body-text').count()};
            await snap('l-11-a-closed-workflow', {leave: o.closeWf});
            // closing the tab with unsaved text (a second tab)
            const p2 = await page.context().newPage();
            const d2 = [];
            p2.on('dialog', async (d) => { d2.push(`${d.type()}: ${d.message().slice(0, 200)}`); try { await d.accept(); } catch (e) { /* gone */ } });
            await p2.goto(wfUrl(s.a.id, btKey(s.a.pub))); await idle(p2).catch(() => {});
            await p2.locator('sciflow-editor [contenteditable]').first().waitFor({state: 'visible', timeout: 20000}).catch(() => {});
            await sleep(2000);
            await p2.locator('sciflow-editor [contenteditable]').first().click();
            await p2.keyboard.press('Control+End').catch(() => {});
            await p2.keyboard.type(' Unsaved five', {delay: 15}); await sleep(500);
            const badge2 = await p2.locator('.sciflow-body-text__unsaved').first().isVisible().catch(() => null);
            await p2.close({runBeforeUnload: true}).catch(() => {});
            await sleep(1500);
            o.closeTab = {badge: badge2, dialogs: d2, closed: p2.isClosed()};
            if (!p2.isClosed()) await p2.close().catch(() => {});
            o.after = await openBody(s.a.id, s.a.pub, 'l-12-a-after-all');
            fact('leave', o);
        });

        // ============================================================ refs: Rule 17 (r, two references)
        if (on('refs') && isOJS) await sect('refs', async () => {
            const o = {};
            await as(J.u.mgr);
            o.arrive = await openBody(s.r.id, s.r.pub, 'r-01-arrive');
            o.list0 = await refState();
            await loc(page, 'Body Text: a reference row in "References"', refItems().first());
            await loc(page, 'Body Text: a reference\'s "Cite" button', refItems().first().locator('.reference-cite-btn'));
            await typeAtEnd('A sentence citing the first reference');
            o.listFocused = await refState();
            // the Cite button's state with a mouse-placed cursor and with a word selected
            const para = page.locator('sciflow-editor [contenteditable] p').first();
            await para.click({position: {x: 40, y: 8}}).catch(() => {}); await sleep(600);
            o.citeAfterMouse = (await refState()).items.map((x) => x.cite);
            await para.dblclick({position: {x: 40, y: 8}}).catch(() => {}); await sleep(600);
            o.citeAfterWord = (await refState()).items.map((x) => x.cite);
            await snap('r-01b-cite-state', {cite: {focused: o.listFocused.items.map((x) => x.cite), mouse: o.citeAfterMouse, word: o.citeAfterWord}});
            await typeAtEnd('');
            await refItems().first().locator('.reference-cite-btn').click({timeout: 5000}).catch((e) => { o.citeErr = flat(e.message, 150); });
            await sleep(800);
            o.afterCite = {bt: await btInfo(), list: await refState()};
            await snap('r-02-cite-first', {refs: o.afterCite});
            // drag the second into the text (after the sentence)
            await page.keyboard.press('Enter'); await page.keyboard.type('Second paragraph for the drag', {delay: 10}); await sleep(300);
            const target = page.locator('sciflow-editor [contenteditable] p').last();
            await refItems().nth(1).dragTo(target, {targetPosition: {x: 5, y: 5}}).catch((e) => { o.dragErr = flat(e.message, 150); });
            await sleep(1000);
            o.afterDrag = {bt: await btInfo(), list: await refState()};
            await snap('r-03-drag-second', {refs: o.afterDrag});
            // a third paragraph with no citation, selected: the highlight follows the selection
            await typeAtEnd(''); await page.keyboard.press('Enter'); await page.keyboard.type('Plain words only', {delay: 10}); await sleep(300);
            await page.keyboard.press('Shift+Home'); await sleep(700);
            o.selPlain = {list: await refState(), sections: await sectionsNow()};
            await snap('r-04-select-plain', {refs: o.selPlain});
            await page.keyboard.press('End'); await sleep(500);
            o.collapsed = {list: await refState()};
            // select the first paragraph only (double click the first word, then shift+End)
            const first = page.locator('sciflow-editor [contenteditable] p').first();
            await first.click({position: {x: 3, y: 5}}).catch(() => {}); await page.keyboard.press('Home'); await page.keyboard.press('Shift+End'); await sleep(700);
            o.selFirst = {list: await refState()};
            await snap('r-05-select-first', {refs: o.selFirst});
            // mouse selections: a paragraph without a citation, then the one with it
            const mouseSelect = async (loc2) => { const b = await loc2.boundingBox(); if (!b) return false; await page.mouse.move(b.x + 2, b.y + b.height / 2); await page.mouse.down(); await page.mouse.move(b.x + Math.min(b.width - 2, 200), b.y + b.height / 2, {steps: 6}); await page.mouse.up(); await sleep(800); return true; };
            await mouseSelect(page.locator('sciflow-editor [contenteditable] p').first());
            o.mouseSelPlain = {list: await refState(), sections: await sectionsNow()};
            await snap('r-05b-mouse-select-plain', {refs: o.mouseSelPlain});
            const citedP = page.locator('sciflow-editor [contenteditable] p').filter({has: page.locator('cite')});
            o.citedParagraphs = await citedP.count();
            if (o.citedParagraphs) await mouseSelect(citedP.first());
            o.mouseSelCited = {list: await refState(), sections: await sectionsNow()};
            await snap('r-05c-mouse-select-cited', {refs: o.mouseSelCited});
            o.save = await pressSave('r-06-saved');
            o.reload = await openBody(s.r.id, s.r.pub, 'r-07-reload');
            o.listReload = await refState();
            fact('refs', o);
        });

        // ============================================================ drag: Rule 17's drag and the highlight, with a slow hand-made mouse drag (r, after refs)
        if (on('drag') && isOJS) await sect('drag', async () => {
            const o = {};
            await as(J.u.mgr);
            await openBody(s.r.id, s.r.pub, 'dr-01-arrive');
            const c = async () => ((await refState()) || {items: []}).items.map((i) => `${i.id}:${i.cls.replace('reference-item', '').trim() || '-'}`);
            o.before = await c();
            for (let attempt = 0; attempt < 3 && !o.inserted; attempt++) {
                const src = await refItems().nth(attempt % 2).boundingBox();
                const tgt = await page.locator('sciflow-editor [contenteditable] p').nth(1).boundingBox();
                await page.mouse.move(src.x + 20, src.y + src.height / 2);
                await page.mouse.down();
                await page.mouse.move(src.x + 30, src.y + src.height / 2, {steps: 3});
                await page.mouse.move(tgt.x + 10, tgt.y + tgt.height / 2, {steps: 15});
                await sleep(200);
                await page.mouse.up();
                await sleep(1000);
                const html = (await btInfo()).editorHtml || '';
                o[`try${attempt}`] = {cite: (html.match(/<cite[^>]*>[^<]*<\/cite>/g) || []), list: await c()};
                if (/<cite/.test(html)) o.inserted = attempt + 1;
            }
            await snap('dr-02-after-drag', {drag: o});
            const mouseSelect = async (loc2) => { const b = await loc2.boundingBox(); if (!b) return false; await page.mouse.move(b.x + 2, b.y + b.height / 2); await page.mouse.down(); await page.mouse.move(b.x + Math.min(b.width - 2, 200), b.y + b.height / 2, {steps: 6}); await page.mouse.up(); await sleep(800); return true; };
            await mouseSelect(page.locator('sciflow-editor [contenteditable] p').first());
            o.selPlain = await c();
            const citedP = page.locator('sciflow-editor [contenteditable] p').filter({has: page.locator('cite')});
            if (await citedP.count()) { await mouseSelect(citedP.first()); o.selCited = await c(); }
            await page.locator('sciflow-editor [contenteditable] p').last().click({position: {x: 3, y: 5}}).catch(() => {}); await sleep(800);
            o.collapsed = await c();
            await snap('dr-03-selections', {drag: o});
            fact('drag', o);
        });

        // ============================================================ roles: Actors row 5 / A2, one account per level (g)
        if (on('roles') && isOJS) await sect('roles', async () => {
            const o = {};
            for (const k of ['admin', 'mgr', 'ed', 'pe', 'se', 'ge', 'le', 'lp', 'pr']) {
                const user = k === 'admin' ? 'admin' : J.u[k];
                await as(user);
                const a = await openBody(s.g.id, s.g.pub, `ro-${k}-arrive`);
                const r = {arrive: {present: a.present, text: a.editorText, editable: a.editable, save: a.save, badge: a.badge, heads: a.heads, bodyTextInMenu: (a.menu || []).some((x) => /^Body Text/.test(x)), menu: a.menu}};
                if (a.present) {
                    await typeAtEnd(` ${k} test`);
                    r.save = await pressSave(`ro-${k}-save`);
                    const back = await openBody(s.g.id, s.g.pub, `ro-${k}-reload`);
                    r.afterReload = back.editorText;
                }
                o[k] = r;
                log(`[roles ${k}]`, JSON.stringify(r).slice(0, 600));
            }
            fact('roles', o);
        });

        // ============================================================ author: the author view and a typed address; Funding Coordinator in Review
        if (on('author') && isOJS) await sect('author', async () => {
            const o = {};
            await as(J.u.au);
            o.auMenu = await openWf(s.g.id, null, 'au-01-author-view', {author: true});
            o.auTypedMine = await openBody(s.g.id, s.g.pub, 'au-02-author-typed-mysubmissions', {author: true});
            o.auTypedEditorial = await openBody(s.g.id, s.g.pub, 'au-03-author-typed-editorial');
            await as(J.u.fc);
            o.fcMenu = await openWf(s.rv.id, null, 'au-04-fc-review');
            o.fcTyped = await openBody(s.rv.id, s.rv.pub, 'au-05-fc-typed-bodytext');
            await as(J.u.le);
            o.leMenu = await openWf(s.g.id, null, 'au-06-le-production');
            fact('author', o);
        });

        // ============================================================ settings3: "Permit submission metadata edit." (Settings bullet 3) on g2 with lx, and le/lp on "JATS XML"
        if (on('settings3') && isOJS) await sect('settings3', async () => {
            const o = {};
            // the JATS page's offer for the two layout editors on g (seeded file)
            await as(J.u.le);
            o.leJats = await jatsRead(s.g.id, s.g.pub, 's3-01-le-jats');
            o.leTick = await jatsTick(true); await snap('s3-02-le-tick', {tick: o.leTick});
            o.leJatsReload = await jatsRead(s.g.id, s.g.pub, null);
            await as(J.u.lp);
            o.lpJats = await jatsRead(s.g.id, s.g.pub, 's3-03-lp-jats');
            o.lpTick = await jatsTick(true); await snap('s3-04-lp-tick', {tick: o.lpTick});
            o.lpJatsReload = await jatsRead(s.g.id, s.g.pub, 's3-05-lp-jats-reload');
            // lx on g2 at the default
            await as(J.u.lx);
            await openBody(s.g2.id, s.g2.pub, 's3-06-lx-arrive');
            await typeAtEnd('lx default test');
            o.lxDefault = await pressSave('s3-07-lx-save-default');
            // the role-level box (Roles › Layout Editor › Edit), read, ticked, lx again
            await as(J.u.mgr);
            const land = async () => {
                await page.goto(app.url(`/index.php/${J.path}/management/settings/access`)); await idle(page).catch(() => {});
                const tab = page.locator('#roles-button').first();
                if (await tab.count()) await tab.click();
                await idle(page).catch(() => {});
                await page.locator('tr.gridRow').first().waitFor({timeout: T}).catch(() => {});
                await sleep(500);
            };
            const roleForm = async (roleName, setTo, name) => {
                await land();
                const row = page.locator('tr.gridRow').filter({hasText: roleName}).first();
                await row.locator('a.show_extras').click(); await idle(page).catch(() => {});
                await page.getByRole('link', {name: 'Edit', exact: true}).last().click();
                const form = page.locator('form#userGroupForm');
                await form.locator('input[name="permitMetadataEdit"]').waitFor({timeout: T});
                await sleep(400);
                const pm = form.locator('input[name="permitMetadataEdit"]');
                const r = {checked: await pm.isChecked(), disabled: await pm.isDisabled(), label: flat(await form.locator('label').filter({has: pm}).first().innerText().catch(() => null) || await pm.evaluate((i) => (document.querySelector(`label[for="${i.id}"]`) || {}).innerText || null).catch(() => null), 200)};
                await snap(name, {roleForm: r});
                if (setTo != null && r.checked !== setTo) {
                    await pm.setChecked(setTo);
                    await form.getByRole('button', {name: 'OK', exact: true}).click();
                    await form.waitFor({state: 'hidden', timeout: T}).catch(() => {});
                    await idle(page).catch(() => {}); await sleep(800);
                    r.set = setTo;
                } else {
                    await form.getByRole('link', {name: 'Cancel', exact: true}).click().catch(() => {});
                    await sleep(600);
                }
                return r;
            };
            o.roleLE = await roleForm('Layout Editor', true, 's3-08-role-layout-editor');
            o.roleLE2 = await roleForm('Layout Editor', null, 's3-09-role-layout-editor-after');
            // the assignment's own box, as the manager reads it after the role change
            const Pn = P();
            await Pn.gotoWorkflow(s.g2.id);
            await Pn.openStage('Production');
            o.lxAssignmentAfterRole = await Pn.participantMetadataEditAllowed(J.names.lx).catch((e) => `err ${flat(e.message, 120)}`);
            await as(J.u.lx);
            await openBody(s.g2.id, s.g2.pub, null);
            await typeAtEnd(' after role tick');
            o.lxAfterRole = await pressSave('s3-10-lx-save-after-role');
            // restore the role, then tick lx's own assignment
            await as(J.u.mgr);
            o.roleRestore = await roleForm('Layout Editor', false, 's3-11-role-restore');
            await Pn.gotoWorkflow(s.g2.id);
            await Pn.openStage('Production');
            // the Edit Assignment window's text (the box's label)
            await page.getByRole('button', {name: `${J.names.lx} More Actions`}).first().click();
            await page.getByRole('menuitem', {name: 'Edit', exact: true}).click();
            const dlg = page.getByRole('dialog').filter({hasText: 'Edit Assignment'});
            await dlg.locator('input[name="canChangeMetadata"]').waitFor({timeout: T});
            o.assignWindow = {text: flat(await dlg.innerText(), 900), checked: await dlg.locator('input[name="canChangeMetadata"]').isChecked()};
            await snap('s3-12-assignment-window', {assign: o.assignWindow});
            await dlg.getByRole('link', {name: 'Cancel', exact: true}).click(); await sleep(1000);
            await sleep(600);
            o.lxAssignArrived = await Pn.setParticipantMetadataEdit(J.names.lx, true).catch((e) => `err ${flat(e.message, 120)}`);
            await as(J.u.lx);
            await openBody(s.g2.id, s.g2.pub, null);
            await typeAtEnd(' after assignment tick');
            o.lxAfterAssign = await pressSave('s3-13-lx-save-after-assignment');
            o.lxReload = (await openBody(s.g2.id, s.g2.pub, 's3-14-lx-reload')).editorText;
            // lp's own assignment tick (seeded) after the role box went on and off again
            await as(J.u.lp);
            o.lpAfterRestore = await jatsRead(s.g.id, s.g.pub, 's3-15-lp-jats-after-role-restore');
            await openBody(s.g.id, s.g.pub, null);
            await typeAtEnd(' lp after restore');
            o.lpSaveAfterRestore = await pressSave('s3-16-lp-save-after-role-restore');
            fact('settings3', o);
        });

        if (on('s3check') && isOJS) await sect('s3check', async () => {
            const o = {};
            await as(J.u.lp);
            o.lpAfterRestore = await jatsRead(s.g.id, s.g.pub, 's3c-01-lp-jats');
            await openBody(s.g.id, s.g.pub, null);
            await typeAtEnd(' lp check');
            o.lpSave = await pressSave('s3c-02-lp-save');
            fact('s3check', o);
        });

        // ============================================================ import: Rule 20 with notes.md, Actors row 6 per level, Rule 14 per version (i)
        if (on('import') && isOJS) await sect('import', async () => {
            const o = {};
            // the row menu per level on "Submission Files" (stage 1)
            for (const k of ['admin', 'mgr', 'ed', 'pe', 'se']) {
                await as(k === 'admin' ? 'admin' : J.u[k]);
                await openWf(s.i.id, 'workflow_1', null);
                o[`menu-${k}`] = await rowMenu('Submission Files', 'notes.md');
            }
            await as(J.u.au);
            await openWf(s.i.id, null, 'i-00-au-view', {author: true});
            o['menu-au'] = await rowMenu('Submission Files', 'notes.md');
            fact('import.menus', o);
            await as(J.u.mgr);
            o.v1arrive = await openBody(s.i.id, s.i.pub, 'i-01-v1-arrive');
            await openWf(s.i.id, 'workflow_1', 'i-02-submission-stage');
            o.send1 = await sendToEditor('Submission Files', 'notes.md', {pub: s.i.pub}, 'i-03-send-existing');
            await page.reload(); await idle(page).catch(() => {}); await sleep(4000);
            o.afterReload = {bt: await btInfo(), url: rel(page.url()).replace(/^.*\?/, '')};
            await snap('i-04-after-reload', {bt: o.afterReload});
            // saved text first, then a second send into the same version
            await openBody(s.i.id, s.i.pub, null);
            await typeAtEnd('Saved first line K3');
            o.saveV1 = await pressSave('i-05-v1-saved');
            await openWf(s.i.id, 'workflow_1', null);
            o.send2 = await sendToEditor('Submission Files', 'notes.md', {pub: s.i.pub}, 'i-06-send-into-saved');
            // "Create New Version" in the window
            await openWf(s.i.id, 'workflow_1', null);
            o.send3 = await sendToEditor('Submission Files', 'notes.md', 0, 'i-07-send-new-version');
            const m = (o.send3.url || '').match(/publication_(\d+)_bodyText/);
            o.newPub = m ? Number(m[1]) : null;
            S.iNew = o.newPub; save();
            o.v1after = await openBody(s.i.id, s.i.pub, 'i-08-v1-after-new-version');
            if (o.newPub) o.v2reopen = await openBody(s.i.id, o.newPub, 'i-09-v2-reopen');
            fact('import', o);
        });

        // ============================================================ importfig: a Word file with an image, a broken one (uploaded to "Production Ready Files" of i)
        if (on('importfig') && isOJS) await sect('importfig', async () => {
            const o = {};
            await as(J.u.mgr);
            const Pn = P();
            await openWf(s.i.id, 'workflow_5', 'if-01-production');
            if (!S.ifUploaded) {
                await Pn.uploadProductionReadyFile(path.join(HERE, 'k3-figure.docx'), 'k3-figure.docx');
                await Pn.uploadProductionReadyFile(path.join(HERE, 'k3-broken.docx'), 'k3-broken.docx');
                S.ifUploaded = true; save();
            }
            for (const k of ['admin', 'mgr', 'ed', 'pe', 'se', 'le']) {
                await as(k === 'admin' ? 'admin' : J.u[k]);
                await openWf(s.i.id, 'workflow_5', k === 'le' ? 'if-02-le-production' : null);
                o[`menu-${k}`] = await rowMenu('Production Ready Files', 'k3-figure.docx');
            }
            fact('importfig.menus', o);
            await as(J.u.mgr);
            o.before = await openBody(s.i.id, s.i.pub, 'if-03-v1-before');
            await openWf(s.i.id, 'workflow_5', null);
            o.fig = await sendToEditor('Production Ready Files', 'k3-figure.docx', {pub: s.i.pub}, 'if-04-send-figure-docx');
            o.figMedia = await openWf(s.i.id, `publication_${s.i.pub}_media`, 'if-05-v1-media');
            o.figMediaText = flat(await page.locator(vis).first().innerText().catch(() => ''), 1200);
            await openWf(s.i.id, 'workflow_5', null);
            if (S.iNew) {
                await openWf(s.i.id, 'workflow_5', null);
                o.figNew = await sendToEditor('Production Ready Files', 'k3-figure.docx', {pub: S.iNew}, 'if-05b-send-figure-docx-never-saved');
                o.figNewReload = await openBody(s.i.id, S.iNew, 'if-05c-never-saved-reload');
                o.figNewMedia = await openWf(s.i.id, `publication_${S.iNew}_media`, 'if-05d-never-saved-media');
                o.figNewMediaText = flat(await page.locator(vis).first().innerText().catch(() => ''), 600).slice(-300);
            }
            const pre = await openBody(s.i.id, s.i.pub, null);
            await openWf(s.i.id, 'workflow_5', null);
            o.broken = await sendToEditor('Production Ready Files', 'k3-broken.docx', {pub: s.i.pub}, 'if-06-send-broken-docx');
            o.brokenPre = pre.editorText;
            const dismiss = page.getByRole('button', {name: 'Dismiss', exact: true});
            o.dismissOffered = await dismiss.count();
            if (o.dismissOffered) { await dismiss.first().click(); await sleep(600); o.afterDismiss = await btInfo(); await snap('if-07-after-dismiss', {bt: o.afterDismiss}); }
            fact('importfig', o);
        });

        // ============================================================ published: Rule 21 / A3 (p), le on the published version
        if (on('published') && isOJS) await sect('published', async () => {
            const o = {};
            await as(J.u.mgr);
            o.jats = await jatsRead(s.p.id, s.p.pub, 'pb-01-p-jats');
            o.arrive = await openBody(s.p.id, s.p.pub, 'pb-02-p-arrive');
            o.status = flat(await page.locator('[data-cy="workflow-controls-left"]').innerText().catch(() => null), 120);
            await typeAtEnd('After publication');
            o.save = await pressSave('pb-03-p-save');
            o.reload = (await openBody(s.p.id, s.p.pub, 'pb-04-p-reload')).editorText;
            await as(J.u.le);
            o.le = await openBody(s.p.id, s.p.pub, 'pb-05-le-arrive');
            await typeAtEnd(' le on published');
            o.leSave = await pressSave('pb-06-le-save');
            o.leReload = (await openBody(s.p.id, s.p.pub, null)).editorText;
            fact('published', o);
        });

        // ============================================================ screenpub: A3 and Rule 21 on a version published on screen (a, with a JATS file uploaded first)
        if (on('screenpub') && isOJS) await sect('screenpub', async () => {
            const o = {};
            await as(J.u.mgr);
            await jatsRead(s.a.id, s.a.pub, null);
            if (!S.aPublished) {
                o.up = await jatsUpload(FIX('article.xml'));
                const Pn = P();
                await Pn.gotoVersionPage(s.a.id, s.a.pub, 'titleAbstract', 'Title & Abstract');
                await Pn.publish();
                S.aPublished = true; save();
            }
            o.jats = await jatsRead(s.a.id, s.a.pub, 'sp-01-a-jats-after-screen-publish');
            o.arrive = await openBody(s.a.id, s.a.pub, 'sp-02-a-bodytext-published');
            o.status = flat(await page.locator('[data-cy="workflow-controls-left"]').innerText().catch(() => null), 120);
            await typeAtEnd(' after screen publish');
            o.save = await pressSave('sp-03-a-save');
            o.reload = (await openBody(s.a.id, s.a.pub, 'sp-04-a-reload')).editorText;
            fact('screenpub', o);
        });

        // ============================================================ where: Rule 23 / A5 (p without a galley, h with an HTML galley)
        if (on('where') && isOJS) await sect('where', async () => {
            const o = {};
            await as(J.u.mgr);
            for (const k of ['p', 'h']) {
                await openBody(s[k].id, s[k].pub, null);
                await typeAtEnd(` Only in the body text ${k}`);
                o[`${k}Save`] = await pressSave(`w-${k}-01-save`);
                o[`${k}Jats`] = await jatsRead(s[k].id, s[k].pub, `w-${k}-02-jats`);
            }
            await out();
            for (const k of ['p', 'h']) {
                await page.goto(app.url(`/index.php/${J.path}/article/view/${s[k].id}`)); await idle(page).catch(() => {});
                const txt = await page.locator('body').innerText().catch(() => '');
                const links = await page.evaluate(() => [...document.querySelectorAll('a.obj_galley_link')].map((a) => `${a.innerText.trim()}|${a.className}|${a.getAttribute('href').replace(/^.*\/index\.php/, '')}`)).catch(() => []);
                o[`${k}Article`] = {has: /Only in the body text/.test(txt), links};
                await snap(`w-${k}-03-article`, {article: o[`${k}Article`]});
                // the published JATS XML
                const jl = page.locator('a.obj_galley_link.xml').first();
                if (await jl.count()) {
                    const dlP = page.waitForEvent('download', {timeout: 20000}).catch(() => null);
                    await jl.click().catch(() => {});
                    const dl = await dlP;
                    const pth = dl ? await dl.path().catch(() => null) : null;
                    const x = pth ? fs.readFileSync(pth, 'utf8') : '';
                    o[`${k}PublicXml`] = {name: dl && dl.suggestedFilename(), hasSentence: /Only in the body text/.test(x), body: flat((x.match(/<body[^>]*>([\s\S]*?)<\/body>/) || [])[1], 300)};
                }
                // the galley view (h)
                const gl = page.locator('a.obj_galley_link:not(.xml)').first();
                if (await gl.count()) {
                    await gl.click().catch(() => {}); await idle(page).catch(() => {}); await sleep(1500);
                    let t = await page.locator('body').innerText().catch(() => '');
                    for (const fr of page.frames()) t += await fr.locator('body').innerText().catch(() => '');
                    o[`${k}Galley`] = {url: rel(page.url()), has: /Only in the body text/.test(t), sample: flat(t, 300)};
                    await snap(`w-${k}-04-galley`, {galley: o[`${k}Galley`]});
                }
            }
            fact('where', o);
        });

        // ============================================================ figures: Rule 22 (f never saved, f2 saved)
        if (on('figures') && isOJS) await sect('figures', async () => {
            const o = {};
            await as(J.u.mgr);
            const bar = page.locator('sciflow-formatbar');
            const insertFigure = async (name) => {
                const t0 = Date.now();
                await ed().click(); await sleep(200);
                await page.keyboard.press('Control+End').catch(() => {});
                await bar.getByRole('button', {name: 'Insert', exact: true}).click(); await sleep(400);
                const item = bar.getByText(/Insert figure|Figure/i).first();
                const r = {itemCount: await item.count()};
                if (!r.itemCount) { r.menuText = flat(await bar.innerText().catch(() => ''), 300); return r; }
                const chooserP = page.waitForEvent('filechooser', {timeout: 10000}).catch(() => null);
                await item.click();
                const chooser = await chooserP;
                r.chooser = !!chooser;
                if (chooser) { r.accept = await chooser.element().getAttribute('accept').catch(() => null); await chooser.setFiles(FIX('figure.png')); }
                else {
                    const dlgTxt = flat(await page.locator(vis).last().innerText().catch(() => ''), 400);
                    r.afterItem = dlgTxt;
                    const fin = page.locator('input[type=file]').last();
                    if (await fin.count()) { await fin.setInputFiles(FIX('figure.png')).catch(() => {}); r.viaInput = true; }
                }
                await sleep(3000); await idle(page).catch(() => {});
                r.bt = await btInfo();
                r.resps = respsSince(t0).filter((x) => !/^GET 200 .*\.(png|js)/.test(x)).slice(0, 12);
                r.dialogs = dialogsSince(t0);
                await snap(name, {fig: r});
                // any window the insert left open (a caption form, say)
                r.openWindows = await page.locator(vis).count();
                log(`[${name}]`, JSON.stringify(r).slice(0, 1500));
                return r;
            };
            o.fArrive = await openBody(s.f.id, s.f.pub, 'fg-01-f-arrive');
            await typeAtEnd('Text before figure K3');
            o.fInsert = await insertFigure('fg-02-f-insert');
            o.fReload = await openBody(s.f.id, s.f.pub, 'fg-03-f-reload-unsaved');
            o.fMedia = await openWf(s.f.id, `publication_${s.f.pub}_media`, 'fg-04-f-media');
            o.fMediaText = flat(await page.locator(vis).first().innerText().catch(() => ''), 1500);
            // saved end
            await openBody(s.f2.id, s.f2.pub, null);
            await typeAtEnd('Saved text f2');
            o.f2Save = await pressSave('fg-05-f2-saved');
            await typeAtEnd(' more before figure');
            o.f2Insert = await insertFigure('fg-06-f2-insert');
            o.f2Reload = await openBody(s.f2.id, s.f2.pub, 'fg-07-f2-reload-unsaved');
            fact('figures', o);
        });

        // ============================================================ log: Side effects (l): History lines, no email
        if (on('log') && isOJS) await sect('log', async () => {
            const o = {};
            o.mail0 = await mailCount();
            await as(J.u.mgr);
            o.header0 = flat(await page.locator('header').first().innerText().catch(() => ''), 300);
            await jatsRead(s.l.id, s.l.pub, 'lg-01-jats');
            o.up1 = await jatsUpload(FIX('article.xml'));
            o.up2 = await jatsUpload(path.join(HERE, 'k3-second.xml'));
            o.after2 = await jatsRead(s.l.id, s.l.pub, 'lg-02-jats-two-uploads');
            // "More Information": the window's title (Cross-feature line)
            await jp().getByRole('button', {name: 'More Information', exact: true}).click().catch(() => {});
            const mi = page.getByRole('dialog').filter({hasText: /Information Center/}).last();
            o.moreInfo = await mi.waitFor({timeout: 20000}).then(async () => { await idle(page).catch(() => {}); await sleep(800); return flat(await mi.innerText(), 300); }).catch(() => null);
            await snap('lg-03-more-information', {moreInfo: o.moreInfo});
            await mi.getByRole('button', {name: 'Close', exact: true}).first().click().catch(() => {}); await sleep(1500);
            await jatsRead(s.l.id, s.l.pub, null);
            o.del = await jatsDelete();
            await openBody(s.l.id, s.l.pub, null);
            await typeAtEnd('Log one');
            o.s1 = await pressSave('lg-04-save-1');
            await typeAtEnd(' two');
            o.s2 = await pressSave('lg-05-save-2');
            o.s3 = await pressSave('lg-06-save-3-unchanged');
            // Activity Log › History
            await page.getByRole('button', {name: 'Activity Log', exact: true}).first().click();
            const al = page.getByRole('dialog').filter({hasText: 'Activity Log'}).last();
            await al.locator('table tbody tr td').first().waitFor({timeout: T}).catch(() => {});
            await idle(page).catch(() => {}); await sleep(800);
            o.alTabs = await al.getByRole('tab').allInnerTexts().catch(() => []);
            o.alRows = await al.locator('table tbody tr').evaluateAll((els) => els.map((tr) => tr.innerText.trim().replace(/\s+/g, ' ').slice(0, 260))).catch(() => []);
            await snap('lg-07-activity-log', {al: {tabs: o.alTabs, rows: o.alRows}});
            await sleep(3000);
            o.mail1 = await mailCount();
            o.header1 = flat(await page.locator('header').first().innerText().catch(() => ''), 300);
            fact('log', o);
        });

        // ============================================================ xfeat: pointer checks (the XML's reference list on r; plugin row and "JATS" column)
        if (on('xfeat') && isOJS) await sect('xfeat', async () => {
            const o = {};
            await as(J.u.mgr);
            o.rJats = await jatsRead(s.r.id, s.r.pub, 'x-01-r-jats');
            await page.goto(app.url(`/index.php/${J.path}/management/settings/website`)); await idle(page).catch(() => {});
            await page.locator('#plugins-button').first().click().catch(() => {}); await idle(page).catch(() => {}); await sleep(1500);
            const row = page.locator('tr.gridRow[id$="-row-jatstemplateplugin"]').first();
            o.pluginRow = {count: await row.count(), text: flat(await row.innerText().catch(() => null), 300), checked: await row.locator('input[type=checkbox]').first().isChecked().catch(() => null)};
            await snap('x-02-plugins', {plugin: o.pluginRow});
            await page.goto(app.url(`/index.php/${J.path}/stats/publications/publications`)); await idle(page).catch(() => {}); await sleep(1500);
            o.statsCols = (await page.locator('table th').allInnerTexts().catch(() => [])).map((x) => flat(x, 40));
            await snap('x-03-stats', {cols: o.statsCols});
            fact('xfeat', o);
        });

        // ============================================================ absence: OMP (OMP1, d28) and OPS reads
        if (on('absence') && !isOJS) await sect('absence', async () => {
            const o = {};
            const pubOf = (k) => s[k] && s[k].pub;
            await as(J.u.mgr);
            if (isOMP) {
                for (const k of ['mgr', 'ed', 'se']) {
                    await as(J.u[k]);
                    await openWf(s.m1.id, 'workflow_1', k === 'mgr' ? 'ab-01-m1-submission' : null);
                    o[`menu-${k}`] = await rowMenu('Submission Files', 'notes.md');
                }
                await as(J.u.au);
                await openWf(s.m1.id, null, 'ab-02-m1-author', {author: true});
                o['menu-au'] = await rowMenu('Submission Files', 'notes.md');
                await as(J.u.mgr);
                o.pubMenu = await openWf(s.m1.id, `publication_${pubOf('m1')}_titleAbstract`, 'ab-03-m1-publication');
                o.typed = await openBody(s.m1.id, pubOf('m1'), 'ab-04-m1-typed-bodytext', {wait: false});
                await openWf(s.m1.id, 'workflow_1', null);
                o.sendExisting = await sendToEditor('Submission Files', 'notes.md', 1, 'ab-05-m1-send-existing');
                o.sendExistingHeads = await page.locator(`${vis} h1, ${vis} h2`).allInnerTexts().catch(() => []);
                await openWf(s.m2.id, `publication_${pubOf('m2')}_titleAbstract`, 'ab-06-m2-before');
                o.m2Before = (await menu()).filter((x) => /version/i.test(x));
                await openWf(s.m2.id, 'workflow_1', null);
                o.sendNew = await sendToEditor('Submission Files', 'notes.md', 0, 'ab-07-m2-send-new-version');
                o.sendNewHeads = await page.locator(`${vis} h1, ${vis} h2`).allInnerTexts().catch(() => []);
                await openWf(s.m2.id, `publication_${pubOf('m2')}_titleAbstract`, 'ab-08-m2-after');
                o.m2After = (await menu()).filter((x) => /version/i.test(x));
                await out();
                await page.goto(app.url(`/index.php/${J.path}/catalog/book/${s.m3.id}`)); await idle(page).catch(() => {});
                o.bookPage = {jats: await page.getByText(/JATS/).count(), links: (await page.locator('a').allInnerTexts().catch(() => [])).filter((x) => /xml|jats/i.test(x))};
                await snap('ab-09-m3-book-page', {page: o.bookPage});
            } else {
                o.pubMenu = await openWf(s.x2.id, null, 'ab-01-x2-workflow');
                o.tables = await page.locator(vis).first().getByRole('table').evaluateAll((ts) => ts.map((t) => t.getAttribute('aria-label') || (t.querySelector('caption') || {}).innerText || t.getAttribute('aria-labelledby'))).catch(() => []);
                o.typed = await openBody(s.x2.id, pubOf('x2'), 'ab-02-x2-typed-bodytext', {wait: false});
                o.pubMenu1 = await openWf(s.x1.id, null, 'ab-03-x1-workflow');
                await out();
                await page.goto(app.url(`/index.php/${J.path}/preprint/view/${s.x1.id}`)); await idle(page).catch(() => {});
                o.preprintPage = {jats: await page.getByText(/JATS/).count(), links: await page.evaluate(() => [...document.querySelectorAll('a.obj_galley_link')].map((a) => `${a.innerText.trim()}|${a.className}`)).catch(() => [])};
                await snap('ab-04-x1-preprint-page', {page: o.preprintPage});
            }
            await as(J.u.mgr);
            await page.goto(app.url(`/index.php/${J.path}/management/settings/website`)); await idle(page).catch(() => {});
            await page.locator('#plugins-button').first().click().catch(() => {}); await idle(page).catch(() => {}); await sleep(1500);
            o.pluginRows = (await page.locator('tr.gridRow').allInnerTexts().catch(() => [])).map((x) => flat(x, 80)).filter((x) => /jats/i.test(x));
            o.pluginRowCount = await page.locator('tr.gridRow').count();
            await snap('ab-10-plugins', {rows: o.pluginRows, count: o.pluginRowCount});
            fact('absence', o);
        });
    } finally {
        await close();
    }
});
