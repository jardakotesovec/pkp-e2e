// U13 claim check, chunk K1: the landing page itself — access, parts, versions and notices {OJS OPS},
// with read-only controls on OMP (a scratch press's book page).
// Spec: docs/specs/U13-article-landing-page-and-reading.md — Actors (38–57), the landing page's fields
// (62–109), Rules 2–9 (192–241), Rule 14 (289–291), Rule 21 (357–359), Side effects "No email, no notice"
// (378–379), Settings bullet 12 (432–439), register A1 and OPS1; footnotes b, c, f, g, h, i, q1–q6, f-a1, f-ops1.
//
//   PROBE_FEATURE=U13 PROBE_AGENT=ccK1 node bin/probe.js all shared/playwright/checks/U13/K1/k1.js
//   PHASES=seed,vprep,v1read,v2,vread,v3,addr,levels,preview,kprep,kread,cite,settings,restrict,sweep,disabled,omp
//   (reseedv, not in the default list, seeds a fresh V on the same contexts for a re-run of vprep..v3)
//   (default: all; later phases read k1-state-<app>.json, so a phase can be re-run alone). A full run can
//   outlast the Bash cap: run one app at a time.
//
// Scratch contexts per app (OJS, OPS):
//   C  defaults, interface and submission languages en + fr_CA; categories Science > Physics, Arts;
//      OJS issues Vol. 1 No. 2 (2014) published with a cover, Vol. 2 No. 1 (2015) unpublished.
//      Users: mg manager, se sectionEditor (Moderator), as assistant (OJS copyeditor, OPS Editorial Board
//      Member), rv reviewer (OJS), au author (the submitter), rd reader.
//      M0 minimal, published, no issue · M1 (OJS) minimal in the covered issue · M2 French and English
//      texts, published · V versions: v1 backdated and published on screen, v2 (title, keywords, category
//      changed) published on screen, v3 a draft · U unpublished (Production on OJS) · S (OJS) scheduled
//      into the unpublished issue.
//   K  everything on: comments on, the bar chart, "Citation Style Language" on, OJS "Publication Facts
//      Label", both recommendation plugins; DOI prefix and a licence set on screen; F filled as far as
//      the Publication pages allow, published on screen (OJS into the covered issue).
// OMP (controls): P a scratch press, a published and an unpublished book, comments on, en + fr_CA.
// No assertions: the script records, the reader judges.
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, signOut, screen, shot, record, loc, note, idle, tag, outDir} = require('../../../probe');

const T = 30_000;
const ALL = ['seed', 'vprep', 'v1read', 'v2', 'vread', 'v3', 'addr', 'levels', 'preview', 'kprep', 'kread', 'cite', 'settings', 'restrict', 'sweep', 'disabled', 'omp'];
const PHASES = (process.env.PHASES || ALL.join(',')).split(',');
const on = (p) => PHASES.includes(p);
const log = (...a) => console.log('[k1]', ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (s, n = 1500) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));
const statePath = (app) => path.join(outDir(), `k1-state-${app.name}.json`);

// The landing page as data: breadcrumb, notices, the OPS label line, both columns' parts in order with their
// headings (screen-reader-only ones flagged), every link, the date line, the Versions entries, the cover.
const EXTRACT = () => {
    const txt = (e) => (e ? (e.innerText || '').replace(/\s+/g, ' ').trim() : null);
    const raw = (e) => (e ? (e.textContent || '').replace(/\s+/g, ' ').trim() : null);
    const sr = (e) => !!(e.classList.contains('pkp_screen_reader') || e.closest('.pkp_screen_reader'));
    const links = (scope) => (scope ? [...scope.querySelectorAll('a')].map((a) => ({t: txt(a) || a.getAttribute('aria-label') || (a.querySelector('img') ? `[img alt=${a.querySelector('img').alt}]` : ''), h: a.getAttribute('href')})) : []);
    const out = {title: document.title, lang: document.documentElement.lang};
    const b = document.querySelector('.cmp_breadcrumbs');
    out.breadcrumb = b ? {text: txt(b), links: links(b), current: txt(b.querySelector('.current'))} : null;
    out.notices = [...document.querySelectorAll('.cmp_notification')].map((n) => ({t: txt(n), links: links(n)}));
    out.h1 = [...document.querySelectorAll('h1')].map(txt);
    out.robots = document.querySelector('meta[name="robots"]')?.content || null;
    out.canonical = document.querySelector('link[rel="canonical"]')?.getAttribute('href') || null;
    const root = document.querySelector('.obj_article_details, .obj_preprint_details, .obj_monograph_full');
    if (!root) { out.root = null; return out; }
    out.root = root.className;
    const lab = root.querySelector('.preprint_label');
    if (lab) {
        let s = ''; let n = lab;
        while (n && n.tagName !== 'H1') { s += `${n.textContent} `; n = n.nextElementSibling; }
        out.labelLine = s.replace(/\s+/g, ' ').trim();
    }
    const parts = (sel) => {
        const c = root.querySelector(sel);
        if (!c) return null;
        return [...c.children].map((ch) => ({
            cls: ch.className,
            heads: [...ch.querySelectorAll('h2, h3')].map((h) => (sr(h) ? `(sr) ${raw(h)}` : raw(h))),
            text: txt(ch).slice(0, 300),
        }));
    };
    out.main = parts('.main_entry');
    out.side = parts('.entry_details');
    out.subtitle = txt(root.querySelector('.subtitle'));
    out.headings = [...root.querySelectorAll('h1, h2, h3')].map((h) => (sr(h) ? `(sr) ${raw(h)}` : raw(h)));
    out.visibleHeadings = [...root.querySelectorAll('h1, h2, h3')].filter((h) => !sr(h) && h.offsetParent !== null).map(raw);
    out.links = links(root);
    const pub = root.querySelector('.item.published > .sub_item:not(.versions)');
    out.dateLine = pub ? txt(pub) : null;
    out.versions = [...root.querySelectorAll('.item.published .versions li')].map((li) => ({t: txt(li), a: li.querySelector('a')?.getAttribute('href') || null}));
    out.keywords = txt(root.querySelector('.item.keywords'));
    out.doi = root.querySelector('.item.doi') ? {t: txt(root.querySelector('.item.doi')), a: root.querySelector('.item.doi a')?.getAttribute('href') || null} : null;
    out.categories = [...root.querySelectorAll('.categories a, .item.issue a[href*="/category/"]')].map((a) => ({t: txt(a), h: a.getAttribute('href')}));
    out.cover = [...root.querySelectorAll('.cover_image img')].map((i) => ({alt: i.getAttribute('alt'), src: i.getAttribute('src'), link: i.closest('a')?.getAttribute('href') || null}));
    out.abstract = txt(root.querySelector('.item.abstract'));
    return out;
};

forEachApp(async (app) => {
    const isOJS = app.name === 'ojs';
    const isOPS = app.name === 'ops';
    const isOMP = app.name === 'omp';
    const S = fs.existsSync(statePath(app)) ? JSON.parse(fs.readFileSync(statePath(app), 'utf8')) : {};
    const save = () => fs.writeFileSync(statePath(app), JSON.stringify(S, null, 1));
    const fact = (k, v) => { record('k1-facts', {[k]: v}, {merge: true}); log(`[${app.name} ${k}]`, JSON.stringify(v).slice(0, 2500)); };
    const PDF = isOPS ? 'preprint.pdf' : 'article.pdf';
    const view = isOPS ? 'preprint' : isOMP ? 'catalog' : 'article';
    // Reads name the interface language in the address: a visit to a fr_CA address switches the session's language.
    const pageOf = (ctx, id, rest = '', loc_ = 'en') => (isOMP ? `/index.php/${ctx}${loc_ ? `/${loc_}` : ''}/catalog/book/${id}${rest}` : `/index.php/${ctx}${loc_ ? `/${loc_}` : ''}/${view}/view/${id}${rest}`);

    // ------------------------------------------------------------------ seed
    if (on('seed') && !S.seeded) {
        const t = tag('u13k1');
        S.t = t;
        const ctxBase = (p, name, acr) => ({name: `U13 K1 ${name} ${p}`, acronym: acr, contactName: 'K1 Contact', contactEmail: `${p}c@mail.test`});
        const u = (p, k, roles, g, f) => ({username: `${p}${k}`, roles, givenName: g, familyName: f});
        if (isOMP) {
            const p = `${t}p`;
            const r = await app.api.createContext({tag: p, context: {...ctxBase(p, 'press', 'KONEP'), supportedLocales: ['en', 'fr_CA']}, enablePublicComments: true,
                users: [u(p, 'mg', ['manager'], 'Mia', 'Manager'), u(p, 'rd', ['reader'], 'Rae', 'Reader'), u(p, 'au', ['author'], 'Ari', 'Author')]});
            S.P = {path: r.path || p, u: {mg: `${p}mg`, rd: `${p}rd`, au: `${p}au`}};
            const sub = async (k, spec) => app.api.createSubmission({tag: `${p}${k}`, context: S.P.path, submitter: S.P.u.au, title: `K1 Book ${k} ${t}`, ...spec})
                .then((x) => ({id: x.submissionId, pub: x.publicationId}), (e) => ({error: String(e.message).slice(0, 500)}));
            S.B = await sub('b', {published: true});
            S.BU = await sub('bu', {});
            S.seeded = true; save(); record('seed', S);
            log('seed', JSON.stringify(S));
        } else {
            // C: defaults
            const pc = `${t}c`;
            const cUsers = [u(pc, 'mg', ['manager'], 'Mia', 'Manager'), u(pc, 'se', ['sectionEditor'], 'Sam', isOPS ? 'Moderator' : 'Section'),
                u(pc, 'as', [isOPS ? 'editorialBoardMember' : 'copyeditor'], 'Asa', 'Assistant'), u(pc, 'au', ['author'], 'Ari', 'Author'), u(pc, 'rd', ['reader'], 'Rae', 'Reader')];
            if (isOJS) cUsers.push(u(pc, 'rv', ['externalReviewer'], 'Rui', 'Reviewer'));
            const c = {tag: pc, context: {...ctxBase(pc, 'defaults', 'KONE'), supportedLocales: ['en', 'fr_CA'], supportedSubmissionLocales: ['en', 'fr_CA'], supportedFormLocales: ['en', 'fr_CA']},
                categories: [{path: 'sci', title: {en: 'Science', fr_CA: 'Sciences'}, children: [{path: 'phys', title: {en: 'Physics', fr_CA: 'Physique'}}]}, {path: 'arts', title: {en: 'Arts', fr_CA: 'Arts FR'}}],
                users: cUsers};
            if (isOJS) c.issues = [{volume: 1, number: 2, year: 2014, published: true, coverImage: {file: 'profile-image-400.png', altText: 'Issue cover alt'}}, {volume: 2, number: 1, year: 2015}];
            const rc = await app.api.createContext(c);
            S.C = {path: rc.path || pc, issues: rc.issues || null, u: Object.fromEntries(cUsers.map((x) => [x.username.slice(pc.length), x.username]))};
            // K: everything on
            const pk = `${t}k`;
            const kUsers = [u(pk, 'mg', ['manager'], 'Mia', 'Manager'), u(pk, 'se', ['sectionEditor'], 'Sam', isOPS ? 'Moderator' : 'Section'), u(pk, 'au', ['author'], 'Ari', 'Author'), u(pk, 'rd', ['reader'], 'Rae', 'Reader')];
            const plugins = {citationstylelanguageplugin: {enabled: true}};
            if (isOJS) Object.assign(plugins, {pflplugin: {enabled: true}, recommendbyauthorplugin: {enabled: true}, recommendbysimilarityplugin: {enabled: true}});
            const k = {tag: pk, context: ctxBase(pk, 'everything', 'KONEK'), users: kUsers, enablePublicComments: true, themeOptions: {displayStats: 'bar'}, plugins,
                metadata: {dataAvailability: 'request', fundingStatement: 'request', plainLanguageSummary: 'request', subjects: 'request'},
                categories: [{path: 'sci', title: 'Science', children: [{path: 'phys', title: 'Physics'}]}]};
            if (isOJS) k.issues = [{volume: 1, number: 2, year: 2014, published: true, coverImage: {file: 'profile-image-400.png', altText: 'Issue cover alt'}}];
            let rk;
            try { rk = await app.api.createContext(k); } catch (e) {
                log('K seed refused, retrying without the plugins that failed', String(e.message).slice(0, 400));
                S.kSeedError = String(e.message).slice(0, 600);
                throw e;
            }
            S.K = {path: rk.path || pk, u: Object.fromEntries(kUsers.map((x) => [x.username.slice(pk.length), x.username]))};
            save();
            const prod = isOJS ? {files: [{file: 'article.pdf'}], decisions: ['skipExternalReview', 'sendToProduction']} : {};
            const sub = async (ctx, key, spec) => {
                try {
                    const r = await app.api.createSubmission({tag: `${t}${key}`, context: ctx.path, submitter: ctx.u.au, title: `K1 ${key} ${t}`, ...spec});
                    log('seed', key, r.submissionId, r.publicationId, r.status);
                    return {id: r.submissionId, pub: r.publicationId, galleys: r.galleys, status: r.status};
                } catch (e) { log('seed FAILED', key, String(e.message).slice(0, 600)); return {error: String(e.message).slice(0, 600)}; }
            };
            const C = S.C;
            const seC = [{username: C.u.se, role: 'sectionEditor'}];
            S.s = {};
            S.s.M0 = await sub(C, 'mzero', {title: `K1 Minimal ${t}`, abstract: 'Minimal abstract.', published: true});
            if (isOJS) S.s.M1 = await sub(C, 'mone', {title: `K1 Minimal in issue ${t}`, abstract: 'Minimal abstract in an issue.', published: true, issue: {volume: 1, number: 2, year: 2014}});
            S.s.M2 = await sub(C, 'mtwo', {title: {en: `K1 Bilingual ${t}`, fr_CA: `K1 Bilingue ${t}`}, abstract: {en: 'English abstract.', fr_CA: 'Résumé français.'},
                keywords: {en: ['english'], fr_CA: ['francais']}, galleys: [{label: 'PDF', file: PDF}], published: true, ...(isOJS ? {issue: {volume: 1, number: 2, year: 2014}} : {})});
            S.s.V = await sub(C, 'ver', {...prod, title: `K1 Versions ${t}`, abstract: 'Versions abstract.', keywords: ['vone'], categories: ['arts'], participants: seC, galleys: [{label: 'PDF', file: PDF}]});
            S.s.U = await sub(C, 'unp', {...prod, title: `K1 Unpublished ${t}`, participants: seC, galleys: [{label: 'PDF', file: PDF}]});
            if (isOJS) S.s.S = await sub(C, 'sch', {title: `K1 Scheduled ${t}`, participants: seC, published: true, issue: {volume: 2, number: 1, year: 2015}});
            const K = S.K;
            S.s.F = await sub(K, 'full', {...prod, title: `K1 Full ${t}`, subtitle: 'Full subtitle', plainLanguageSummary: 'Full plain language summary',
                keywords: ['alpha', 'beta'], subjects: ['gamma'], categories: ['sci', 'phys'], coverImage: {file: 'profile-image-400.png', altText: 'Full cover alt'},
                citationsRaw: ['Reference one. 2020.'], participants: [{username: K.u.se, role: 'sectionEditor'}],
                galleys: [{label: 'PDF', file: PDF}, {label: 'Data', file: PDF, genre: 'Data Set'}], ...(isOJS ? {articleNumber: 'e42'} : {})});
            S.s.K2 = await sub(K, 'kmin', {title: `K1 K minimal ${t}`, published: true, ...(isOJS ? {issue: {volume: 1, number: 2, year: 2014}} : {})});
            S.seeded = true;
            save();
            record('seed', S);
        }
    }
    if (!S.seeded) { log('no state; run seed first'); return; }
    // reseedv: a fresh V (versions) submission, for a re-run of the version phases on the same contexts
    if (on('reseedv') && !isOMP) {
        const t = S.t; const C = S.C; const n = (S.vSeeds || 0) + 1;
        const prod = isOJS ? {files: [{file: 'article.pdf'}], decisions: ['skipExternalReview', 'sendToProduction']} : {};
        const r = await app.api.createSubmission({tag: `${t}ver${n}`, context: C.path, submitter: C.u.au, title: `K1 Versions ${n} ${t}`, abstract: 'Versions abstract.', keywords: ['vone'], categories: ['arts'],
            participants: [{username: C.u.se, role: 'sectionEditor'}], galleys: [{label: 'PDF', file: PDF}], ...prod});
        S.s.V = {id: r.submissionId, pub: r.publicationId, galleys: r.galleys, status: r.status};
        S.vSeeds = n; delete S.v1Published; delete S.v1Date; delete S.v2; delete S.v2Published; delete S.v3; save();
        log('reseedv', JSON.stringify(S.s.V));
    }
    if (PHASES.length === 1 && PHASES[0] === 'seed') return;

    // ------------------------------------------------------------------ browser and helpers
    const {page, close} = await launch(app);
    const jsDialogs = [];
    page.on('dialog', (d) => {
        jsDialogs.push({at: Date.now(), type: d.type(), message: d.message().slice(0, 300)});
        log('[browser dialog]', d.type(), flat(d.message(), 200));
        d.accept().catch(() => {});
    });
    async function snap(name, extra = {}) {
        let s;
        try { s = await screen(page); } catch (e) { s = {url: page.url(), error: String(e.message).slice(0, 200)}; }
        Object.assign(s, extra);
        record(name, s);
        await shot(page, name).catch(() => {});
        return s;
    }
    async function sect(name, fn) {
        try { return await fn(); } catch (e) {
            log(`[${name} FAILED]`, String(e.stack || e).split('\n').slice(0, 4).join(' | '));
            fact(`${name}.FAILED`, String(e.message || e).slice(0, 600));
            await snap(`zz-failed-${name.replace(/[^a-z0-9]+/gi, '-')}`).catch(() => {});
            return null;
        }
    }
    let who = 'visitor';
    const as = async (user, ctx) => { await signIn(page, user, {contextPath: ctx}); await idle(page); who = user; };
    const visitor = async () => { await signOut(page).catch(() => {}); who = 'visitor'; };
    const vis = '[role="dialog"]:visible';
    const wf = () => page.locator(vis).first();
    const wfUrl = (ctx, sid, key, author) => app.url(`/index.php/${ctx}/dashboard/${author ? 'mySubmissions' : 'editorial'}?workflowSubmissionId=${sid}${key ? `&workflowMenuKey=${key}` : ''}`);

    async function landing(url, name, extra = {}) {
        const chain = [];
        const onResp = (r) => { try { if (r.request().isNavigationRequest() && r.frame() === page.mainFrame()) chain.push({url: r.url().replace(app.baseURL, ''), status: r.status()}); } catch (e) { /* none */ } };
        page.on('response', onResp);
        const target = url.startsWith('http') ? app.url(url.replace(/^https?:\/\/[^/]+/, '')) : app.url(url);
        const resp = await page.goto(target).catch((e) => ({err: String(e.message).slice(0, 200)}));
        await idle(page).catch(() => {});
        await sleep(300);
        page.off('response', onResp);
        const data = await page.evaluate(EXTRACT).catch((e) => ({err: String(e.message).slice(0, 200)}));
        data.status = resp && typeof resp.status === 'function' ? resp.status() : (resp && resp.err) || null;
        data.finalUrl = page.url().replace(app.baseURL, '');
        data.chain = chain;
        data.who = who;
        data.bodyStart = flat(await page.locator('body').innerText().catch(() => ''), 200);
        await snap(name, {landing: data, ...extra});
        return data;
    }
    const brief = (d) => ({status: d.status, finalUrl: d.finalUrl, title: d.title, h1: d.h1, notices: d.notices, dateLine: d.dateLine, versions: d.versions, labelLine: d.labelLine, bodyStart: d.status === 200 ? undefined : d.bodyStart});

    // --- publishing and versions on the apps' own screens (as checks/sync/pkp-lib-12163/term-suggestions.js does)
    async function fillVersionDetailsIfPresent(scope) {
        for (const [sel, val] of [['select[name="versionStage"]', 'VoR'], ['select[name="versionIsMinor"]', 'false']]) {
            const el = scope.locator(sel);
            if (await el.isVisible().catch(() => false)) {
                if (!(await el.inputValue().catch(() => ''))) await el.selectOption(val).catch(() => {});
            }
        }
    }
    async function publishNow(name, {backIssue} = {}) {
        const s = {};
        const waitPublish = () => page.waitForResponse((r) => /\/publications\/\d+\/publish/.test(r.url()) && r.request().method() !== 'GET', {timeout: T}).catch(() => null);
        if (isOJS) {
            const {PublicationScreen} = require(path.join(app.suiteDir, 'pages', 'PublicationMetadataPages.js'));
            const pub = new PublicationScreen(page, null);
            // The panel can take longer than the POM's 5 s to open; a second press then hits the modal's overlay.
            const button = page.locator('[data-cy="workflow-controls-right"]').getByRole('button', {name: /^(Schedule For Publication|Publish)$/});
            await button.waitFor({state: 'visible', timeout: T});
            s.button = flat(await button.innerText().catch(() => null), 60);
            await sleep(800);
            await button.click();
            const panel = page.locator('[data-cy="active-modal"]').filter({hasText: 'Review Publishing Details'}).last();
            const confirm = page.getByRole('dialog').filter({hasText: 'Are you sure you want to publish this?'});
            // A later version's "Publish" goes straight to the confirmation (its version details were set at "Create New Version").
            const which = () => Promise.race([
                panel.locator('select[name="versionStage"]').waitFor({state: 'visible', timeout: 15_000}).then(() => 'panel'),
                confirm.waitFor({state: 'visible', timeout: 15_000}).then(() => 'confirm'),
            ]).catch(() => null);
            let opened = await which();
            if (!opened) {
                s.secondPress = true;
                await button.click({timeout: 5_000}).catch(() => {});
                opened = await which();
            }
            s.opened = opened;
            await idle(page);
            if (opened === 'confirm') {
                s.confirm = flat(await confirm.innerText().catch(() => ''), 600);
                const done = waitPublish();
                await confirm.getByRole('button', {name: 'Publish', exact: true}).click();
                const r = await done;
                s.status = r ? r.status() : null;
                await page.getByRole('button', {name: 'Unpublish', exact: true}).waitFor({state: 'visible', timeout: T}).catch(() => {});
                await idle(page);
                await snap(name, {publish: s});
                return s;
            }
            await fillVersionDetailsIfPresent(panel);
            if (backIssue) {
                const back = panel.getByRole('radio', {name: 'Assign To Current/Back Issue'});
                await back.waitFor({state: 'visible', timeout: T});
                await pub.awaitAssignmentPreselected(panel).catch(() => {});
                await back.check();
                await pub.selectIssueOption(panel, backIssue);
            } else {
                const dontAssign = panel.getByRole('radio', {name: "Don't Assign To An Issue"});
                if (await dontAssign.waitFor({state: 'visible', timeout: 5_000}).then(() => true).catch(() => false)) {
                    await pub.awaitAssignmentPreselected(panel).catch(() => {});
                    s.preselected = await panel.locator('input[name="assignment"]:checked').evaluate((e) => (e.closest('label') || e.parentElement).innerText.trim()).catch(() => null);
                    await dontAssign.check();
                }
            }
            s.panel = flat(await panel.innerText().catch(() => ''), 1200);
            await panel.getByRole('button', {name: 'Confirm', exact: true}).click();
            await confirm.waitFor({state: 'visible', timeout: T});
            s.confirm = flat(await confirm.innerText().catch(() => ''), 600);
            const done = waitPublish();
            await confirm.getByRole('button', {name: 'Publish', exact: true}).click();
            const r = await done;
            s.status = r ? r.status() : null;
            await page.getByRole('button', {name: 'Unpublish', exact: true}).waitFor({state: 'visible', timeout: T}).catch(() => {});
        } else {
            const postControl = page.getByRole('button', {name: 'Post', exact: true});
            await postControl.first().waitFor({state: 'visible', timeout: T});
            await postControl.first().click();
            const confirm = page.getByRole('dialog').filter({hasText: 'Are you sure you want to post this?'});
            await confirm.waitFor({state: 'visible', timeout: T});
            await idle(page);
            await fillVersionDetailsIfPresent(confirm);
            s.confirm = flat(await confirm.innerText().catch(() => ''), 600);
            const done = waitPublish();
            await confirm.getByRole('button', {name: 'Post', exact: true}).last().click();
            const r = await done;
            s.status = r ? r.status() : null;
            await page.getByRole('button', {name: 'Unpost', exact: true}).waitFor({state: 'visible', timeout: T}).catch(() => {});
        }
        await idle(page);
        await snap(name, {publish: s});
        return s;
    }
    async function createNewVersion(name) {
        const link = page.getByRole('link', {name: 'Create New Version', exact: true}).or(page.getByRole('button', {name: 'Create New Version', exact: true})).first();
        await link.waitFor({state: 'visible', timeout: T}).catch(() => {});
        if (!(await link.isVisible().catch(() => false))) return {offered: false};
        await sleep(1500);
        await link.click();
        const w = page.getByRole('dialog').filter({has: page.locator('select[name="versionStage"]')}).last();
        await w.locator('select[name="versionStage"]').waitFor({state: 'visible', timeout: T});
        await idle(page); await sleep(1000);
        await fillVersionDetailsIfPresent(w);
        await snap(`${name}-window`);
        const r = page.waitForResponse((x) => /\/publications\/\d+\/version/.test(x.url()) && x.request().method() === 'POST', {timeout: T}).catch(() => null);
        await w.getByRole('button', {name: 'Confirm', exact: true}).click();
        const resp = await r;
        let newPub = null;
        if (resp) { try { newPub = (await resp.json()).id; } catch (e) { /* none */ } }
        await w.waitFor({state: 'detached', timeout: T}).catch(() => {});
        await idle(page);
        return {offered: true, status: resp && resp.status(), newPub};
    }
    async function openEntry(ctx, sid, pub, name) {
        await page.goto(wfUrl(ctx, sid, `publication_${pub}_titleAbstract`)); await idle(page); await sleep(800);
        if (name !== 'Title & Abstract') {
            const l = page.getByRole('link', {name, exact: true}).last();
            await l.waitFor({state: 'visible', timeout: T});
            await l.click();
            await idle(page); await sleep(800);
        }
        const start = Date.now();
        while (Date.now() - start < 20_000 && !(await wf().getByRole('button', {name: 'Save', exact: true}).count())) await sleep(250);
        await idle(page);
    }
    async function pressSave() {
        const button = wf().getByRole('button', {name: 'Save', exact: true}).last();
        const r = page.waitForResponse((x) => /\/publications\/\d+/.test(x.url()) && ['POST', 'PUT'].includes(x.request().method()), {timeout: T}).catch(() => null);
        await button.click();
        const resp = await r;
        await page.locator('[role="status"]:has-text("Saved")').first().waitFor({state: 'visible', timeout: 15_000}).catch(() => {});
        await sleep(400);
        let body = null;
        if (resp && resp.status() >= 400) { try { body = await resp.text(); } catch (e) { /* none */ } }
        return {status: resp ? resp.status() : null, body: body ? body.slice(0, 600) : undefined, errors: await page.locator('.pkpFieldError').allInnerTexts().catch(() => [])};
    }
    async function typeRich(idPrefix, text) {
        const iframe = page.locator(`iframe[id^="${idPrefix}"]`).first();
        if (!(await iframe.count())) return {typed: false};
        const id = (await iframe.getAttribute('id')).replace(/_ifr$/, '');
        await page.waitForFunction((i) => !!(window.tinymce && window.tinymce.get(i) && window.tinymce.get(i).initialized), id, {timeout: T}).catch(() => {});
        await page.frameLocator(`#${id}_ifr`).locator('body').click();
        await page.keyboard.press('ControlOrMeta+End');
        await page.keyboard.type(text);
        await sleep(300);
        return {typed: true, id, after: await page.evaluate((i) => window.tinymce.get(i).getContent(), id).catch(() => null)};
    }
    async function mailCount(users) {
        const o = {};
        for (const x of users) o[x] = await app.mail.count({to: `${x}@mail.test`}).catch((e) => `err ${String(e.message).slice(0, 80)}`);
        return o;
    }
    async function tasksBell(user, ctx) {
        await as(user, ctx);
        await page.goto(app.url(`/index.php/${ctx}/dashboard/${user === S.K.u.au ? 'mySubmissions' : 'editorial'}`)); await idle(page);
        const b = page.getByRole('button', {name: /^Tasks/}).first();
        const name = await b.getAttribute('aria-label').catch(() => null) || await b.innerText().catch(() => null);
        return flat(name, 100);
    }

    try {
        // ============================================================ OMP: read-only controls
        if (isOMP) {
            if (on('omp')) await sect('omp', async () => {
                const P = S.P; const out = {};
                await visitor();
                out.bookVisitor = brief(await landing(pageOf(P.path, S.B.id), 'omp-01-book-visitor'));
                out.bookVisitorFr = brief(await landing(pageOf(P.path, S.B.id, '', 'fr_CA'), 'omp-02-book-visitor-fr'));
                out.unpubVisitor = brief(await landing(pageOf(P.path, S.BU.id), 'omp-03-unpublished-visitor'));
                await as(P.u.rd, P.path);
                out.bookReader = brief(await landing(pageOf(P.path, S.B.id), 'omp-04-book-reader'));
                out.unpubReader = brief(await landing(pageOf(P.path, S.BU.id), 'omp-05-unpublished-reader'));
                await as(P.u.mg, P.path);
                out.bookManager = brief(await landing(pageOf(P.path, S.B.id), 'omp-06-book-manager'));
                out.unpubManager = brief(await landing(pageOf(P.path, S.BU.id), 'omp-07-unpublished-manager'));
                fact('omp', out);
            });
            return;
        }
        const C = S.C; const K = S.K; const s = S.s;
        const V = s.V;
        const cPage = (id, rest = '', l = 'en') => pageOf(C.path, id, rest, l);
        const kPage = (id, rest = '', l = 'en') => pageOf(K.path, id, rest, l);

        // ============================================================ vprep: v1 backdated and published on screen
        if (on('vprep') && !S.v1Published) await sect('vprep', async () => {
            const out = {};
            await as(C.u.mg, C.path);
            await openEntry(C.path, V.id, V.pub, isOPS ? 'Preprint entry' : 'Publication Settings');
            const date = page.locator('input[name="datePublished"]').first();
            out.dateBox = await date.count();
            if (isOJS) {
                const dont = page.getByRole('radio', {name: "Don't Assign To An Issue"}).first();
                out.preselected = await page.locator('input[name="assignment"]:checked').evaluate((e) => (e.closest('label') || e.parentElement).innerText.trim()).catch(() => null);
                if (await dont.isVisible().catch(() => false)) await dont.check();
            }
            await snap('v-01-v1-settings-page', {dateBox: out.dateBox});
            if (out.dateBox) {
                await date.fill('2026-09-01');
                await date.press('Tab').catch(() => {});
                out.save = await pressSave();
                out.dateAfter = await date.inputValue().catch(() => null);
                await snap('v-02-v1-settings-saved', {save: out.save});
                await loc(page, 'Publication Settings / Preprint entry: "Date Published" input[name="datePublished"]', date);
            }
            await page.goto(wfUrl(C.path, V.id, `publication_${V.pub}_titleAbstract`)); await idle(page); await sleep(800);
            out.publish = await publishNow('v-03-v1-published');
            S.v1Published = true; S.v1Date = out.dateAfter || null; save();
            fact('vprep', out);
        });

        // ============================================================ v1read: the one-version page, visitor
        if (on('v1read')) await sect('v1read', async () => {
            await visitor();
            const d = await landing(cPage(V.id), 'v-04-v1-only-visitor');
            fact('v1read', brief(d));
        });

        // ============================================================ v2: new version, title/keywords/category changed, published
        if (on('v2') && !S.v2Published) await sect('v2', async () => {
            const out = {};
            await as(C.u.mg, C.path);
            if (!S.v2) {
                await page.goto(wfUrl(C.path, V.id, `publication_${V.pub}_titleAbstract`)); await idle(page); await sleep(800);
                out.version = await createNewVersion('v-05-create-v2');
                S.v2 = out.version.newPub; save();
            }
            if (!S.v2) throw new Error(`no second version: ${JSON.stringify(out.version)}`);
            // Title & Abstract: title changed
            await openEntry(C.path, V.id, S.v2, 'Title & Abstract');
            out.title = await typeRich('titleAbstract-title-control-en', ' second');
            out.titleSave = await pressSave();
            // Metadata: keywords vone -> vtwo
            await openEntry(C.path, V.id, S.v2, 'Metadata');
            const rm = page.getByRole('button', {name: 'Remove vone'}).first();
            if (await rm.isVisible().catch(() => false)) await rm.click();
            const kw = page.locator('[id="metadata-keywords-control-en"]');
            await kw.click(); await kw.pressSequentially('vtwo', {delay: 20}); await sleep(800); await kw.press('Enter');
            await page.getByRole('button', {name: 'Remove vtwo'}).first().waitFor({timeout: 10_000}).catch(() => {});
            out.kwSave = await pressSave();
            // Publication Settings: category Science added
            await openEntry(C.path, V.id, S.v2, isOPS ? 'Preprint entry' : 'Publication Settings');
            if (isOJS) {
                const dont = page.getByRole('radio', {name: "Don't Assign To An Issue"}).first();
                out.v2Preselected = await page.locator('input[name="assignment"]:checked').evaluate((e) => (e.closest('label') || e.parentElement).innerText.trim()).catch(() => null);
                if (await dont.isVisible().catch(() => false)) await dont.check();
            }
            const cat = page.locator('#issueEntry-categoryIds-control');
            await cat.waitFor({timeout: T});
            await cat.click(); await cat.pressSequentially('Science', {delay: 20}); await idle(page);
            const opt = page.getByRole('option', {name: /^Science$/}).first();
            await opt.waitFor({timeout: 15_000}).catch(() => {});
            out.catOptions = await page.getByRole('option').allInnerTexts().catch(() => []);
            await opt.click().catch((e) => { out.catErr = String(e.message).slice(0, 200); });
            await idle(page);
            out.v2DateBox = await page.locator('input[name="datePublished"]').first().inputValue().catch(() => null);
            out.catSave = await pressSave();
            await snap('v-06-v2-settings-saved', {v2: out});
            await page.goto(wfUrl(C.path, V.id, `publication_${S.v2}_titleAbstract`)); await idle(page); await sleep(800);
            out.publish = await publishNow('v-07-v2-published');
            S.v2Published = true; save();
            fact('v2', out);
        });

        // ============================================================ vread: current and older version, English and French, visitor
        if (on('vread')) await sect('vread', async () => {
            const out = {};
            await visitor();
            const cur = await landing(cPage(V.id), 'v-08-current-visitor');
            out.current = {...brief(cur), keywords: cur.keywords, categories: cur.categories, side: cur.side && cur.side.map((x) => x.cls)};
            const older = cur.versions.find((x) => x.a && /\/version\//.test(x.a));
            out.olderHref = older ? older.a : null;
            if (older) {
                const od = await landing(older.a, 'v-09-older-visitor');
                out.older = {...brief(od), keywords: od.keywords, categories: od.categories, robots: od.robots, canonical: od.canonical};
                // "most recent version" in the notice
                const recent = page.locator('.cmp_notification a').filter({hasText: 'most recent version'}).first();
                out.recentHref = await recent.getAttribute('href').catch(() => null);
                await loc(page, 'Older version page: notice link "most recent version"', recent);
                if (out.recentHref) {
                    await recent.click(); await idle(page);
                    out.recentLanded = page.url().replace(app.baseURL, '');
                    await snap('v-10-most-recent-clicked');
                }
                // the current version's link in the older page's Versions list
                const curLink = od.versions.find((x) => x.a && !/\/version\//.test(x.a));
                out.olderListCurrentLink = curLink || null;
                out.olderFr = brief(await landing(pageOf(C.path, V.id, older.a.replace(/^.*\/view\/[^/]+/, ''), 'fr_CA'), 'v-11-older-visitor-fr'));
            }
            // the current version by its own version address
            out.currentByVersionAddress = brief(await landing(cPage(V.id, `/version/${S.v2}`), 'v-12-current-by-version-address'));
            const fr = await landing(cPage(V.id, '', 'fr_CA'), 'v-13-current-visitor-fr');
            out.currentFr = {...brief(fr), headings: fr.headings, keywords: fr.keywords, categories: fr.categories, lang: fr.lang};
            await loc(page, 'Landing page: "Versions" entries (.item.published .versions li)', page.locator('.versions li'));
            await loc(page, 'Landing page: date line (.item.published > .sub_item:not(.versions))', page.locator('.item.published > .sub_item:not(.versions)'));
            if (isOPS) await loc(page, 'Preprint page: label line (span.preprint_label)', page.locator('.preprint_label'));
            fact('vread', out);
        });

        // ============================================================ v3: a draft third version; the page before/after; its address; preview
        if (on('v3') && S.v2Published) await sect('v3', async () => {
            const out = {};
            await visitor();
            out.before = brief(await landing(cPage(V.id), 'v-14-current-before-v3'));
            if (!S.v3) {
                await as(C.u.mg, C.path);
                await page.goto(wfUrl(C.path, V.id, `publication_${S.v2}_titleAbstract`)); await idle(page); await sleep(800);
                out.version = await createNewVersion('v-15-create-v3');
                S.v3 = out.version.newPub; save();
                await visitor();
            }
            out.after = brief(await landing(cPage(V.id), 'v-16-current-after-v3-visitor'));
            out.afterFr = brief(await landing(cPage(V.id, '', 'fr_CA'), 'v-16b-current-after-v3-visitor-fr'));
            out.v3AddressVisitor = brief(await landing(cPage(V.id, `/version/${S.v3}`), 'v-17-v3-address-visitor'));
            await as(C.u.rd, C.path);
            out.v3AddressReader = brief(await landing(cPage(V.id, `/version/${S.v3}`), 'v-18-v3-address-reader'));
            // Preview of the draft from its workflow version page (OPS1 and the journal control)
            await as(C.u.mg, C.path);
            await page.goto(wfUrl(C.path, V.id, `publication_${S.v3}_titleAbstract`)); await idle(page); await sleep(1200);
            const prev = page.locator('[data-cy="workflow-controls-right"]').getByRole('button', {name: 'Preview', exact: true})
                .or(page.getByRole('button', {name: 'Preview', exact: true})).first();
            out.previewOffered = await prev.isVisible().catch(() => false);
            await snap('v-19-v3-workflow', {previewOffered: out.previewOffered});
            if (out.previewOffered) {
                await loc(page, 'Workflow (a draft version): "Preview" button', prev);
                await prev.click();
                await page.waitForURL(/\/view\//, {timeout: T, waitUntil: 'commit'}).catch(() => {});
                await idle(page);
                const d = await page.evaluate(EXTRACT).catch(() => ({}));
                d.finalUrl = page.url().replace(app.baseURL, '');
                await snap('v-20-v3-preview-manager', {landing: d});
                out.preview = {finalUrl: d.finalUrl, notices: d.notices, h1: d.h1, dateLine: d.dateLine, versions: d.versions, labelLine: d.labelLine, headings: d.headings};
            }
            out.v3AddressManager = brief(await landing(cPage(V.id, `/version/${S.v3}`), 'v-21-v3-address-manager'));
            fact('v3', out);
        });

        // ============================================================ addr: version and article addresses (Rules 2, 3)
        if (on('addr')) await sect('addr', async () => {
            const out = {};
            await visitor();
            out.v999999 = brief(await landing(cPage(V.id, '/version/999999'), 'a-01-version-999999-visitor'));
            out.v1ByAddress = brief(await landing(cPage(V.id, `/version/${V.pub}`), 'a-02-v1-by-address-visitor'));
            out.otherArticlesVersion = brief(await landing(cPage(V.id, `/version/${s.M0.pub}`), 'a-03-another-articles-version-visitor'));
            out.unknownNumber = brief(await landing(cPage(99999999), 'a-04-unknown-number-visitor'));
            out.unknownPath = brief(await landing(cPage('no-such-path'), 'a-05-unknown-path-visitor'));
            out.otherContextNumber = brief(await landing(kPage(V.id), 'a-06-c-article-number-on-k-visitor'));
            fact('addr', out);
        });

        // ============================================================ levels: the published page and the unpublished addresses, each level
        if (on('levels')) await sect('levels', async () => {
            const out = {};
            const levels = [['visitor', null], ['reader', C.u.rd], ['author', C.u.au], ...(isOJS ? [['reviewer', C.u.rv]] : []), ['assistant', C.u.as], ['subeditor', C.u.se], ['manager', C.u.mg], ['admin', 'admin']];
            const ROW2_LEVELS = ['visitor', 'reader', 'author', 'reviewer', 'subeditor', 'manager', 'admin'];
            const sig = (d) => ({headings: d.headings, links: (d.links || []).map((l) => `${l.t} > ${l.h}`), notices: d.notices});
            for (const [lvl, user] of levels) {
                if (user) await as(user, C.path); else await visitor();
                const o = {};
                const cur = await landing(cPage(V.id), `l-${lvl}-01-current`);
                o.current = sig(cur);
                o.header = flat((await screen(page)).text.header, 400);
                const m2 = await landing(cPage(s.M2.id), `l-${lvl}-02-m2`);
                o.m2 = sig(m2);
                // the unpublished and scheduled addresses: the levels Actors row 2 names
                if (ROW2_LEVELS.includes(lvl)) {
                    o.unpublished = brief(await landing(cPage(s.U.id), `l-${lvl}-03-unpublished`));
                    if (isOJS) o.scheduled = brief(await landing(cPage(s.S.id), `l-${lvl}-04-scheduled`));
                }
                out[lvl] = o;
            }
            // compare each level's published page with the visitor's
            const base = JSON.stringify(out.visitor.current);
            const baseM2 = JSON.stringify(out.visitor.m2);
            out.sameAsVisitor = Object.fromEntries(Object.entries(out).filter(([k]) => k !== 'visitor').map(([k, v]) => [k, {current: JSON.stringify(v.current) === base, m2: JSON.stringify(v.m2) === baseM2}]));
            // which workflow offers "Preview" on the unpublished article: the submitting author (My Submissions), the assigned editor, the manager
            out.workflowPreview = {};
            for (const [lvl, user, author] of [['author', C.u.au, true], ['subeditor', C.u.se, false], ['manager', C.u.mg, false]]) {
                await as(user, C.path);
                await page.goto(wfUrl(C.path, s.U.id, null, author)); await idle(page); await sleep(1500);
                const prev = page.getByRole('button', {name: 'Preview', exact: true});
                const view = page.getByRole('button', {name: 'View', exact: true});
                out.workflowPreview[lvl] = {preview: await prev.count(), view: await view.count(), dialog: flat(await wf().innerText().catch(() => ''), 300)};
                await snap(`l-${lvl}-05-workflow-unpublished`, {workflowPreview: out.workflowPreview[lvl]});
                if (isOJS) {
                    await page.goto(wfUrl(C.path, s.S.id, null, author)); await idle(page); await sleep(1500);
                    out.workflowPreview[`${lvl}-scheduled`] = {preview: await prev.count(), view: await view.count()};
                    await snap(`l-${lvl}-06-workflow-scheduled`, {workflowPreview: out.workflowPreview[`${lvl}-scheduled`]});
                }
            }
            fact('levels', out);
        });

        // ============================================================ preview: "Preview" from the workflow, the notice, "View submission"
        if (on('preview')) await sect('preview', async () => {
            const out = {};
            for (const [lvl, user, author] of [['manager', C.u.mg, false], ['author', C.u.au, true]]) {
                await as(user, C.path);
                await page.goto(wfUrl(C.path, s.U.id, null, author)); await idle(page); await sleep(1500);
                const prev = page.getByRole('button', {name: 'Preview', exact: true}).first();
                if (!(await prev.isVisible().catch(() => false))) { out[lvl] = {offered: false}; continue; }
                await prev.click();
                await page.waitForURL(/\/view\//, {timeout: T, waitUntil: 'commit'}).catch(() => {});
                await idle(page);
                const d = await page.evaluate(EXTRACT).catch(() => ({}));
                d.finalUrl = page.url().replace(app.baseURL, '');
                await snap(`p-${lvl}-01-preview`, {landing: d});
                const o = {finalUrl: d.finalUrl, notices: d.notices, headings: d.headings, side: d.side && d.side.map((x) => x.cls), dateLine: d.dateLine, versions: d.versions, labelLine: d.labelLine};
                const vs = page.locator('.cmp_notification a').filter({hasText: 'View submission'}).first();
                o.viewSubmissionHref = await vs.getAttribute('href').catch(() => null);
                if (lvl === 'manager') await loc(page, 'Preview page: notice link "View submission"', vs);
                if (o.viewSubmissionHref) {
                    await vs.click(); await idle(page); await sleep(1500);
                    o.viewSubmissionLanded = page.url().replace(app.baseURL, '');
                    await snap(`p-${lvl}-02-view-submission`);
                    o.landedDialog = flat(await wf().innerText().catch(() => ''), 300);
                }
                out[lvl] = o;
            }
            // the submitting author types the unpublished article's address and follows the notice's "View submission"
            await as(C.u.au, C.path);
            const ad = await landing(cPage(s.U.id), 'p-author-03-typed-address');
            out.authorTyped = {status: ad.status, notices: ad.notices};
            const avs = page.locator('.cmp_notification a').filter({hasText: 'View submission'}).first();
            if (await avs.isVisible().catch(() => false)) {
                await avs.click(); await idle(page); await sleep(1500);
                out.authorTyped.viewSubmissionLanded = page.url().replace(app.baseURL, '');
                out.authorTyped.landedTitle = await page.title();
                out.authorTyped.landedText = flat((await snap('p-author-04-view-submission')).text.main, 400);
                out.authorTyped.landedDialog = flat(await wf().innerText().catch(() => ''), 300);
            }
            // a scheduled article's own "Preview" (OJS)
            if (isOJS) {
                await as(C.u.mg, C.path);
                out.scheduledManager = brief(await landing(cPage(s.S.id), 'p-03-scheduled-manager'));
            }
            fact('preview', out);
        });

        // ============================================================ kprep: DOIs and a licence on screen; F filled and published on screen
        if (on('kprep') && !S.fPublished) await sect('kprep', async () => {
            const out = {};
            const F = s.F;
            await as(K.u.mg, K.path);
            if (!S.kSettings) {
                await page.goto(app.url(`/index.php/${K.path}/management/settings/distribution`)); await idle(page);
                await page.getByRole('tab', {name: 'DOIs', exact: true}).first().click().catch(() => {});
                await idle(page); await sleep(800);
                const prefix = page.locator('input[name="doiPrefix"]').first();
                await prefix.fill('10.1234');
                const form = page.locator('form').filter({has: prefix}).first();
                const r1 = page.waitForResponse((x) => /\/api\/v1\/contexts/.test(x.url()) && x.request().method() !== 'GET', {timeout: T}).catch(() => null);
                await form.getByRole('button', {name: 'Save', exact: true}).click();
                out.doiSave = (await r1)?.status() ?? null;
                await snap('k-01-dois-saved', {doiSave: out.doiSave});
                await page.getByRole('tab', {name: 'License', exact: true}).first().click().catch(() => {});
                await idle(page); await sleep(800);
                const lic = page.locator('input[name="licenseUrl"]');
                out.licenseOptions = await lic.evaluateAll((els) => els.map((e) => `${e.value}`)).catch(() => []);
                await page.locator('input[name="licenseUrl"][value*="by/4.0"]').first().check({force: true}).catch((e) => { out.licErr = String(e.message).slice(0, 200); });
                await page.locator('input[name="copyrightHolderType"][value="author"]').first().check({force: true}).catch(() => {});
                const lform = page.locator('form').filter({has: page.locator('input[name="licenseUrl"]')}).first();
                const r2 = page.waitForResponse((x) => /\/api\/v1\/contexts/.test(x.url()) && x.request().method() !== 'GET', {timeout: T}).catch(() => null);
                await lform.getByRole('button', {name: 'Save', exact: true}).click();
                out.licenseSave = (await r2)?.status() ?? null;
                await snap('k-02-license-saved', {licenseSave: out.licenseSave});
                S.kSettings = true; save();
            }
            // F: Data Availability Statement and Funding Statement typed, where the pages offer them
            await openEntry(K.path, F.id, F.pub, 'Metadata');
            out.metadataRich = await page.locator('iframe[id^="metadata-"]').evaluateAll((els) => els.map((e) => e.id)).catch(() => []);
            out.funding = await typeRich('metadata-fundingStatement-control-en', 'Funded by the K1 foundation.');
            if (out.funding.typed) out.fundingSave = await pressSave();
            await snap('k-03-f-metadata', {rich: out.metadataRich});
            out.menu = await wf().getByRole('link').allInnerTexts().catch(() => []);
            const dataEntry = wf().getByRole('link', {name: /^(Data|Data Availability.*|Data Citations)$/}).last();
            if (await dataEntry.count()) {
                await dataEntry.click(); await idle(page); await sleep(1200);
                out.dataRich = await page.locator('iframe').evaluateAll((els) => els.map((e) => e.id)).catch(() => []);
                out.das = await typeRich('dataAvailability-dataAvailability-control-en', 'Data are available on request.');
                if (!out.das.typed) out.das = await typeRich('dataAvailability', 'Data are available on request.');
                if (out.das.typed) out.dasSave = await pressSave();
                await snap('k-04-f-data', {rich: out.dataRich});
            }
            await page.goto(wfUrl(K.path, F.id, `publication_${F.pub}_titleAbstract`)); await idle(page); await sleep(800);
            out.publish = await publishNow('k-05-f-published', isOJS ? {backIssue: /Vol\. 1 No\. 2/} : {});
            S.fPublished = true; save();
            fact('kprep', out);
        });

        // ============================================================ kread: F signed out, as Reader, as the manager; K's minimal; C's minimal ones
        if (on('kread')) await sect('kread', async () => {
            const out = {};
            const F = s.F;
            const full = (d) => ({...brief(d), breadcrumb: d.breadcrumb, headings: d.headings, visibleHeadings: d.visibleHeadings, main: d.main && d.main.map((x) => `${x.cls} :: ${x.heads.join(' / ')}`),
                side: d.side && d.side.map((x) => `${x.cls} :: ${x.heads.join(' / ')}`), keywords: d.keywords, doi: d.doi, categories: d.categories, cover: d.cover, subtitle: d.subtitle, links: d.links});
            await visitor();
            out.F = full(await landing(kPage(F.id), 'r-01-f-visitor'));
            await loc(page, 'Landing page: breadcrumb (.cmp_breadcrumbs)', page.locator('.cmp_breadcrumbs'));
            await loc(page, 'Landing page: main column parts (.main_entry > *)', page.locator('.main_entry > *'));
            await loc(page, 'Landing page: side column parts (.entry_details > *)', page.locator('.entry_details > *'));
            await loc(page, 'Landing page: title heading (h1.page_title)', page.locator('h1.page_title'));
            out.FFr = full(await landing(kPage(F.id, '', 'fr_CA'), 'r-02-f-visitor-fr'));
            out.K2 = full(await landing(kPage(s.K2.id), 'r-03-kmin-visitor'));
            out.M0 = full(await landing(cPage(s.M0.id), 'r-04-m0-visitor'));
            out.M0Fr = full(await landing(cPage(s.M0.id, '', 'fr_CA'), 'r-05-m0-visitor-fr'));
            if (isOJS) out.M1 = full(await landing(cPage(s.M1.id), 'r-06-m1-visitor'));
            out.M2 = full(await landing(cPage(s.M2.id), 'r-07-m2-visitor'));
            out.M2Fr = full(await landing(cPage(s.M2.id, '', 'fr_CA'), 'r-08-m2-visitor-fr'));
            await as(K.u.rd, K.path);
            out.FReader = full(await landing(kPage(F.id), 'r-09-f-reader'));
            await as(K.u.mg, K.path);
            out.FManager = full(await landing(kPage(F.id), 'r-10-f-manager'));
            const cmp = (a, b) => ({headingsSame: JSON.stringify(a.headings) === JSON.stringify(b.headings), linksSame: JSON.stringify(a.links) === JSON.stringify(b.links),
                onlyInB: (b.headings || []).filter((h) => !(a.headings || []).includes(h)), onlyInA: (a.headings || []).filter((h) => !(b.headings || []).includes(h)),
                linksOnlyInB: (b.links || []).filter((l) => !(a.links || []).some((x) => x.t === l.t && x.h === l.h)), linksOnlyInA: (a.links || []).filter((l) => !(b.links || []).some((x) => x.t === l.t && x.h === l.h))});
            out.cmpReader = cmp(out.F, out.FReader);
            out.cmpManager = cmp(out.F, out.FManager);
            fact('kread', out);
        });

        // ============================================================ cite: reading, a galley, a citation download send nothing (Side effects)
        if (on('cite')) await sect('cite', async () => {
            const out = {};
            const F = s.F;
            const watch = [K.u.mg, K.u.au, K.u.se, K.u.rd];
            out.mailBefore = await mailCount(watch);
            out.bellBefore = {mg: await tasksBell(K.u.mg, K.path), au: await tasksBell(K.u.au, K.path)};
            for (const [lvl, user] of [['visitor', null], ['reader', K.u.rd]]) {
                if (user) await as(user, K.path); else await visitor();
                await landing(kPage(F.id), `c-${lvl}-01-page`);
                // "More Citation Formats" and one format (Rule 15a is K3's; here the request is watched)
                const more = page.getByRole('button', {name: 'More Citation Formats'}).first();
                const o = {moreOffered: await more.isVisible().catch(() => false)};
                if (o.moreOffered) {
                    await more.click(); await sleep(400);
                    const mla = page.getByRole('link', {name: 'MLA', exact: true}).first();
                    if (await mla.isVisible().catch(() => false)) {
                        const r = page.waitForResponse((x) => /citationstylelanguage|cite/i.test(x.url()), {timeout: 15_000}).catch(() => null);
                        await mla.click(); const resp = await r; o.mla = resp ? {status: resp.status(), url: resp.url().replace(app.baseURL, '')} : null;
                        await sleep(600);
                        o.citation = flat(await page.locator('#citationOutput').innerText().catch(() => null), 400);
                    }
                    const bib = page.getByRole('link', {name: /BibTeX/}).first();
                    if (!(await bib.isVisible().catch(() => false))) { await more.click().catch(() => {}); await sleep(400); }
                    o.downloadLinks = await page.locator('a').filter({hasText: /BibTeX|RIS/}).allInnerTexts().catch(() => []);
                    if (await bib.isVisible().catch(() => false)) {
                        const dl = page.waitForEvent('download', {timeout: 15_000}).catch(() => null);
                        await bib.click(); const d = await dl;
                        o.bibtex = d ? {name: d.suggestedFilename(), url: d.url().replace(app.baseURL, '')} : {download: null, url: page.url().replace(app.baseURL, '')};
                        await idle(page);
                    }
                }
                await snap(`c-${lvl}-02-after-citation`, {cite: o});
                // the PDF galley: the reader page and its "Download"
                await page.goto(app.url(kPage(F.id))); await idle(page);
                const g = page.locator('a.obj_galley_link').filter({hasText: /^\s*PDF/}).first();
                if (await g.isVisible().catch(() => false)) {
                    await g.click(); await idle(page); await sleep(800);
                    o.reader = page.url().replace(app.baseURL, '');
                    await snap(`c-${lvl}-03-pdf-reader`);
                    const dlb = page.locator('a.download').first();
                    if (await dlb.isVisible().catch(() => false)) {
                        const dl = page.waitForEvent('download', {timeout: 15_000}).catch(() => null);
                        await dlb.click(); const d = await dl;
                        o.pdfDownload = d ? d.suggestedFilename() : null;
                    }
                }
                out[lvl] = o;
            }
            await sleep(3000);
            out.mailAfter = await mailCount(watch);
            out.bellAfter = {mg: await tasksBell(K.u.mg, K.path), au: await tasksBell(K.u.au, K.path)};
            fact('cite', out);
        });

        // ============================================================ settings: who reaches the plugin and chart settings; Settings bullet 12's names
        if (on('settings')) await sect('settings', async () => {
            const out = {};
            for (const [lvl, user] of [['manager', K.u.mg], ['subeditor', K.u.se], ['reader', K.u.rd]]) {
                await as(user, K.path);
                const r = await page.goto(app.url(`/index.php/${K.path}/management/settings/website`)).catch(() => null);
                await idle(page); await sleep(800);
                const o = {status: r ? r.status() : null, url: page.url().replace(app.baseURL, ''), title: await page.title()};
                o.plugins = await page.locator('#plugins-button').count();
                if (lvl === 'manager') {
                    await page.locator('#plugins-button').click(); await idle(page);
                    await page.locator('#pluginGridContainer tr.gridRow, tr.gridRow').first().waitFor({timeout: T}).catch(() => {});
                    const row = page.locator('tr.gridRow').filter({hasText: 'Citation Style Language'}).first();
                    o.cslRow = flat(await row.innerText().catch(() => null), 300);
                    o.cslEnabled = await row.getByRole('checkbox').first().isChecked().catch(() => null);
                    await snap(`s-${lvl}-01-plugins`, {settings: o});
                    // the "Comments" side tab's box (Settings bullet 12)
                    await page.goto(app.url(`/index.php/${K.path}/management/settings/website`)); await idle(page);
                    const content = page.getByRole('tab', {name: 'Content', exact: true}).first();
                    if (await content.count()) {
                        await content.click(); await idle(page); await sleep(400);
                        const ct = page.getByRole('tab', {name: 'Comments', exact: true}).first();
                        if (await ct.count()) { await ct.click(); await idle(page); await sleep(400); }
                    }
                    const box = page.getByRole('checkbox', {name: 'Enable Public Comments'});
                    o.commentsBox = {count: await box.count(), checked: await box.first().isChecked().catch(() => null)};
                    await snap(`s-${lvl}-02-comments-tab`, {settings: o});
                } else {
                    await snap(`s-${lvl}-01-website`, {settings: o});
                }
                out[lvl] = o;
            }
            fact('settings', out);
        });

        // ============================================================ restrict: "Users must be registered…" ticked on K; the visitor types F's address
        if (on('restrict')) await sect('restrict', async () => {
            const out = {};
            const F = s.F;
            await as(K.u.mg, K.path);
            await page.goto(app.url(`/index.php/${K.path}/management/settings/access`)); await idle(page);
            await page.getByRole('tab', {name: 'Site Access Options', exact: true}).click().catch(() => {});
            await idle(page); await sleep(500);
            const box = page.getByRole('checkbox', {name: /Users must be registered and log in to view the (journal|press|server) site\./}).first();
            out.label = await box.evaluate((e) => (e.closest('label') || e.parentElement).innerText.trim()).catch(() => null);
            await box.check();
            const form = page.locator('form').filter({has: page.locator('input[name="restrictSiteAccess"]')}).first();
            const r = page.waitForResponse((x) => /\/api\/v1\/contexts/.test(x.url()) && x.request().method() !== 'GET', {timeout: T}).catch(() => null);
            await form.getByRole('button', {name: 'Save', exact: true}).click();
            out.save = (await r)?.status() ?? null;
            await snap('x-01-restricted', {restrict: out});
            await visitor();
            out.visitorPage = brief(await landing(kPage(F.id), 'x-02-f-visitor-restricted'));
            out.visitorGalley = brief(await landing(kPage(F.id, `/${(F.galleys && F.galleys[0] && F.galleys[0].id) || ''}`), 'x-03-f-galley-visitor-restricted'));
            await as(K.u.rd, K.path);
            out.readerPage = brief(await landing(kPage(F.id), 'x-04-f-reader-restricted'));
            fact('restrict', out);
        });
        // ============================================================ sweep: every in-page link of F (K) and of the covered minimal article, followed as a Reader
        if (on('sweep')) await sect('sweep', async () => {
            const out = {};
            await as(K.u.rd, K.path);
            for (const [key, id] of [['F', s.F.id], ['K2', s.K2.id]]) {
                const d = await landing(kPage(id), `w-${key}-00-page`);
                const hrefs = [...new Map((d.links || []).filter((l) => l.h && l.h.startsWith('http://127.0.0.1') && !/citationstylelanguage|\/article\/view\/\d+\/\d+$|\/preprint\/view\/\d+\/\d+$/.test(l.h)).map((l) => [l.h, l])).values()];
                const bc = (d.breadcrumb && d.breadcrumb.links) || [];
                for (const l of [...bc, ...hrefs]) {
                    const r = await page.goto(app.url(l.h.replace(/^https?:\/\/[^/]+/, ''))).catch((e) => ({err: String(e.message).slice(0, 100)}));
                    await idle(page);
                    out[`${key} ${l.t}`] = {href: l.h.replace(app.baseURL, ''), status: r && typeof r.status === 'function' ? r.status() : r && r.err, landed: page.url().replace(app.baseURL, ''), title: await page.title(), h1: flat(await page.locator('h1').first().innerText().catch(() => null), 80)};
                }
                const cov = page.locator('.cover_image a').first();
                await page.goto(app.url(kPage(id))); await idle(page);
                if (await cov.count()) { await cov.click(); await idle(page); out[`${key} cover`] = {landed: page.url().replace(app.baseURL, ''), title: await page.title()}; }
            }
            fact('sweep', out);
        });

        // ============================================================ disabled: the Site Administrator un-enables C; the visitor types an article's address
        if (on('disabled')) await sect('disabled', async () => {
            const out = {};
            await as('admin', C.path);
            await page.goto(app.url('/index.php/index/admin/contexts')); await idle(page); await sleep(400);
            const row = page.locator('tr.gridRow').filter({hasText: `U13 K1 defaults ${C.path}`}).first();
            await row.locator('a.show_extras').click(); await idle(page); await sleep(300);
            await row.locator('xpath=following-sibling::tr[1]').getByRole('link', {name: 'Edit', exact: true}).click();
            const cb = page.getByRole('checkbox', {name: /appear publicly on the site/});
            await cb.waitFor({timeout: T});
            out.label = await cb.evaluate((e) => (e.closest('label') || e.parentElement).innerText.trim()).catch(() => null);
            await cb.uncheck();
            const dlg = page.locator('[role="dialog"]:visible').last();
            const country = dlg.locator('select[id^="context-country-control"]').first();
            if ((await country.count()) && !(await country.inputValue().catch(() => ''))) { await country.selectOption('CA'); out.countryPicked = 'CA'; }
            const w = page.waitForResponse((r) => /\/api\/v1\/contexts\/\d+/.test(r.url()) && r.request().method() !== 'GET', {timeout: T}).catch(() => null);
            await dlg.getByRole('button', {name: 'Save', exact: true}).click();
            out.save = (await w)?.status() ?? null;
            await sleep(1500); await idle(page);
            await snap('d-01-c-unenabled', {disabled: out});
            await visitor();
            out.visitorM0 = brief(await landing(cPage(s.M0.id), 'd-02-m0-visitor-unenabled'));
            await as(C.u.rd, C.path).catch((e) => { out.readerSignIn = String(e.message).slice(0, 200); });
            out.readerM0 = brief(await landing(cPage(s.M0.id), 'd-03-m0-reader-unenabled'));
            fact('disabled', out);
        });
    } finally {
        await close();
    }
});
