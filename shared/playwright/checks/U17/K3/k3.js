// U17 claim check, chunk K3: what the section window's other fields change.
// Spec: docs/specs/U17-sections.md — Rules 8–11 (192–218), Settings 2–13 (313–373), register A2, A3 (544–569),
// OMP4 (631–639); footnotes d, e, j, k, l, m, td3 (author half), td4, td16, f-a2, f-a3, f-omp4.
//
//   PROBE_FEATURE=U17 PROBE_AGENT=ccK3 node bin/probe.js <ojs|omp|ops> shared/playwright/checks/U17/K3/k3.js
//   One app per process and a few phases per process: a whole app does not fit the Bash tool's 600 s cap. Order used:
//     all apps: PHASES=seed; OJS/OPS: window,pkread; OMP: series,pkread,seed2,intake; OJS/OPS: seed2,intake;
//     OJS/OPS: words, wds, ta, nab (nab unticks "K3 NoAbstract" on screen, so it runs after words);
//     OJS: toc,reviewer, pfl, oai, pksearch, oai2, endrole,assign,export; OPS: oai, pksearch, oai2, endrole, export, assign;
//     OMP: endrole, omptick, ENDCTX=D endrole, assign, omp4. Follow-up after the jobs: each app PHASES=jobs; OMP PHASES=omp4jobs.
//   Phases: seed window pkread series seed2 intake words wds ta nab toc pfl oai pksearch oai2 reviewer endrole omptick assign
//   omp4 export (state in k3-state-<app>.json under the output folder: a phase re-runs alone; delete it for a fresh seed).
//   KEYS=dNEG,dNAB narrows the words phase's drafts; ENDCTX=D runs endrole on the OMP omptick press.
// Scratch contexts (tag prefix u17k3):
//   OJS  A  sections ART "Articles" (policy), PLN "K3 Plain" (no policy), RST "K3 Restricted" (policy; editor-only
//           ticked on screen), WDS "K3 Words" (Word Count 5 on screen), NEG "K3 Negative" (-5 on screen), NAB
//           "K3 NoAbstract" ("Do not require abstracts" on screen), FRM "K3 Form" (Review Form on screen), HTT
//           "K3 HideTitle", HAU "K3 HideAuthor", NPR "K3 NotReviewed", NIX "K3 NotIndexed", IDT "K3 Identify"
//           ("Identify items…" typed on screen); one published issue; review forms "K3 Form One", "K3 Form Two";
//           users mg, ed, se, s2, ge, fc, pe, ce, rv, rv2, au, rd.
//        B  a new journal's own first section; user mg.   C  endrole: mg and tw (Section editor + Author).
//   OPS  A  sections PRE "Preprints" (path preprints, policy), PLN, RST, WDS, NEG, NAB, NIX, IDT; users mg, se
//           (Moderator), eb (Editorial Board Member), au, rd.   B, C  as OJS.
//   OMP  A  categories "K3 Cat", "K3 Other"; users mg, ed, se, fc, au, rd; series made on screen: "Monographs"
//           (prefix "The", subtitle "K3 Subtitle", path k3mono), "K3 Closed" (path k3closed, authors may not
//           submit); books published into k3mono (one with "K3 Other" on its own publication).   C  endrole ("K3 End").
//        D  omptick: mg, tw (Series editor + Author), se (Series editor); series "K3 Tick" with both ticked on screen.
// publicknowledge is read only (the "Sections"/"Series" table and its "Edit" windows opened and closed unchanged).
// No assertions: the script records, the reader judges.
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, signOut, screen, shot, record, loc, note, idle, tag, outDir} = require('../../../probe');

const REPO = path.resolve(__dirname, '../../../../..');
const T = 30_000;
const ALL = ['seed', 'window', 'pkread', 'series', 'seed2', 'intake', 'words', 'wds', 'ta', 'nab', 'toc', 'pfl', 'oai', 'pksearch', 'jobs', 'omp4jobs', 'oai2', 'reviewer', 'endrole', 'omptick', 'assign', 'omp4', 'export'];
const PHASES = (process.env.PHASES || ALL.join(',')).split(',');
const on = (p) => PHASES.includes(p);
const T0 = Date.now();
const log = (...a) => console.log(`[k3 +${Math.round((Date.now() - T0) / 1000)}s]`, ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (s, n = 1500) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));
const statePath = (app) => path.join(outDir(), `k3-state-${app.name}.json`);

// A legacy grid as data (K1's reader): header actions, column heads, rows, the empty line.
const GRID = (sel) => {
    const g = document.querySelector(sel);
    if (!g) return null;
    const t = (s) => (s || '').replace(/\s+/g, ' ').trim();
    const vis = (e) => !!(e.offsetWidth || e.offsetHeight || e.getClientRects().length);
    return {
        th: [...g.querySelectorAll('thead th')].filter(vis).map((h) => t(h.innerText)),
        rows: [...g.querySelectorAll('tbody:not(.empty) tr.gridRow')].filter(vis).map((tr) => ({
            id: tr.id,
            cells: [...tr.querySelectorAll('td')].map((td) => {
                const b = td.querySelector('input[type=checkbox]');
                return b ? {text: t(td.innerText), box: b.checked} : t(td.innerText);
            }),
        })),
        empty: [...g.querySelectorAll('tbody.empty')].filter(vis).map((b) => t(b.innerText)),
    };
};

// A legacy form as data: every field (name, type, label, value, checked, the select's options), visible messages.
const FORM = (sel) => {
    const f = document.querySelector(sel);
    if (!f) return null;
    const t = (s) => (s || '').replace(/\s+/g, ' ').trim();
    const vis = (e) => !!(e.offsetWidth || e.offsetHeight || e.getClientRects().length);
    const labelOf = (e) => {
        let l = e.id ? f.querySelector(`label[for="${CSS.escape(e.id)}"]`) : null;
        if (!l) l = e.closest('label');
        return l ? t(l.innerText) : null;
    };
    return {
        text: f.innerText,
        fields: [...f.querySelectorAll('input, select, textarea')].filter((e) => e.type !== 'hidden').map((e) => {
            const o = {tag: e.tagName.toLowerCase(), type: e.type, name: e.name, visible: vis(e), label: labelOf(e)};
            if (e.type === 'checkbox' || e.type === 'radio') o.checked = e.checked;
            else if (e.tagName === 'SELECT') { o.selected = e.options[e.selectedIndex] ? t(e.options[e.selectedIndex].text) : null; o.options = [...e.options].map((x) => t(x.text)); }
            else o.value = (e.value || '').slice(0, 300);
            if (e.tagName === 'TEXTAREA' && window.tinymce && window.tinymce.get(e.id)) o.rich = t(window.tinymce.get(e.id).getContent()).slice(0, 300);
            return o;
        }),
        messages: [...f.querySelectorAll('label.error, .pkp_form_error, [class*="error"]')].filter(vis).map((e) => t(e.innerText).slice(0, 300)).filter(Boolean),
    };
};

// The OAI answer as data. The browser shows the app's own XSLT view of the XML (the answer carries its stylesheet), so the
// records are read from that view's text: each record's identifier, set, title and "Resource Type" lines; every set.
const parseOai = (htmlText) => {
    const t = htmlText.replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ');
    const records = t.split('OAI Record: ').slice(1).map((b) => ({
        identifier: b.split(' ')[0],
        setSpec: (b.match(/setSpec (\S+)/) || [])[1] || null,
        title: ((b.match(/ Title (.*?) Author or Creator/) || [])[1] || '').trim(),
        types: [...b.matchAll(/Resource Type (.*?)(?= Resource | Source | Language | Format )/g)].map((m) => m[1]),
    }));
    const sets = [...t.matchAll(/Set setName (.*?) setSpec (\S+)/g)].map((m) => ({spec: m[2], name: m[1].trim()}));
    const error = (t.match(/Error Code (.*?) /) || [])[1] || null;
    return {records, sets, error, text: t.slice(0, 400)};
};
// The same from the raw XML, when the browser hands the response over untransformed.
const parseOaiXml = (xml) => {
    const grab = (x, tg) => [...x.matchAll(new RegExp(`<${tg}[^>]*>([\\s\\S]*?)</${tg}>`, 'g'))].map((m) => m[1].trim());
    const records = [...xml.matchAll(/<record>([\s\S]*?)<\/record>/g)].map((m) => ({identifier: grab(m[1], 'identifier')[0], setSpec: grab(m[1], 'setSpec')[0] || null,
        title: grab(m[1], 'dc:title')[0] || '', types: grab(m[1], 'dc:type')}));
    const sets = [...xml.matchAll(/<set>\s*<setSpec>([^<]*)<\/setSpec>\s*<setName>([^<]*)<\/setName>/g)].map((m) => ({spec: m[1], name: m[2]}));
    return {records, sets, error: (xml.match(/<error[^>]*>([^<]*)<\/error>/) || [])[1] || null};
};

forEachApp(async (app) => {
    const isOJS = app.name === 'ojs';
    const isOPS = app.name === 'ops';
    const isOMP = app.name === 'omp';
    const S = fs.existsSync(statePath(app)) ? JSON.parse(fs.readFileSync(statePath(app), 'utf8')) : {};
    const save = () => fs.writeFileSync(statePath(app), JSON.stringify(S, null, 1));
    const fact = (k, v) => { record('k3-facts', {[k]: v}, {merge: true}); log(`[${app.name} ${k}]`, JSON.stringify(v).slice(0, 4000)); };
    const strip = (u) => (u || '').replace(app.baseURL, '').replace(/^https?:\/\/127\.0\.0\.1:\d+/, '');
    const GRIDSEL = isOMP ? '#seriesGridContainer' : '#sectionsGridContainer';
    const FORMSEL = isOMP ? 'form#seriesForm' : 'form#sectionForm';
    const TAB = isOMP ? 'Series' : 'Sections';
    const RESTRICT = isOPS ? 'editorRestriction' : 'editorRestricted';

    const seedSub = async (key, spec) => {
        if (S.subs && S.subs[key]) return;
        if (S.subErr) delete S.subErr[key];
        try {
            const r = await app.api.createSubmission({tag: `${S.t}${key}`.slice(0, 32), context: S.A.path, submitter: `${S.A.path}au`, ...spec});
            S.subs = S.subs || {}; S.subs[key] = r.submissionId; S.pubs = S.pubs || {}; S.pubs[key] = r.publicationId; log('sub', key, r.submissionId);
        } catch (e) { S.subErr = S.subErr || {}; S.subErr[key] = String(e.message).slice(0, 900); log('sub FAILED', key, S.subErr[key]); }
        save();
    };

    // ------------------------------------------------------------------ seed
    if (on('seed')) {
        const t = S.t || tag('u17k3');
        S.t = t;
        const u = (p, k, roles, g, fam) => ({username: `${p}${k}`, roles, givenName: g, familyName: fam});
        const mk = async (key, spec) => {
            const p = `${t}${key}`;
            const had = S[key.toUpperCase()];
            if (had && !had.error) return had;
            try {
                await app.api.createContext({tag: p, ...spec});
                log('seed', p, 'ok');
                return {path: p};
            } catch (e) { log('seed FAILED', p, String(e.message).slice(0, 1200)); return {path: p, error: String(e.message).slice(0, 1200)}; }
        };
        const sec = (abbrev, title, extra = {}) => ({abbrev, title, ...(isOPS ? {path: abbrev === 'PRE' ? 'preprints' : abbrev.toLowerCase()} : {}), ...extra});
        const p = `${t}a`;
        if (isOJS) {
            const users = [u(p, 'mg', ['manager'], 'Mia', 'Manager'), u(p, 'ed', ['editor'], 'Eddie', 'Editor'), u(p, 'se', ['sectionEditor'], 'Sam', 'Section'),
                u(p, 's2', ['sectionEditor'], 'Sid', 'Second'), u(p, 'ge', ['guestEditor'], 'Gia', 'Guest'), u(p, 'fc', ['funding'], 'Fay', 'Funding'),
                u(p, 'pe', ['productionEditor'], 'Pat', 'Production'), u(p, 'ce', ['copyeditor'], 'Cole', 'Copy'), u(p, 'rv', ['externalReviewer'], 'Rex', 'Reviewer'),
                u(p, 'rv2', ['externalReviewer'], 'Rob', 'Spare'), u(p, 'au', ['author'], 'Amy', 'Author'), u(p, 'rd', ['reader'], 'Rae', 'Reader')];
            S.A = await mk('a', {context: {name: `U17 K3 journal ${t}`, acronym: 'KTHREE'},
                sections: [sec('ART', 'Articles', {policy: 'K3 Articles policy'}), sec('PLN', 'K3 Plain'), sec('RST', 'K3 Restricted', {policy: 'K3 Restricted policy'}),
                    sec('WDS', 'K3 Words', {policy: 'K3 Words policy'}), sec('NEG', 'K3 Negative'), sec('NAB', 'K3 NoAbstract'), sec('FRM', 'K3 Form'),
                    sec('HTT', 'K3 HideTitle'), sec('HAU', 'K3 HideAuthor'), sec('NPR', 'K3 NotReviewed'), sec('NIX', 'K3 NotIndexed'), sec('IDT', 'K3 Identify')],
                issues: [{volume: 1, number: 1, year: 2026, published: true}],
                reviewForms: [{title: 'K3 Form One', elements: [{question: 'K3 question one', type: 'textarea'}]}, {title: 'K3 Form Two', elements: [{question: 'K3 question two', type: 'textarea'}]}],
                metadata: {plainLanguageSummary: 'request'}, users});
        } else if (isOPS) {
            const users = [u(p, 'mg', ['manager'], 'Mia', 'Manager'), u(p, 'se', ['sectionEditor'], 'Sam', 'Section'), u(p, 'eb', ['editorialBoardMember'], 'Eli', 'Board'),
                u(p, 'au', ['author'], 'Amy', 'Author'), u(p, 'rd', ['reader'], 'Rae', 'Reader')];
            S.A = await mk('a', {context: {name: `U17 K3 server ${t}`, acronym: 'KTHREE'},
                sections: [sec('PRE', 'Preprints', {policy: 'K3 Preprints policy'}), sec('PLN', 'K3 Plain'), sec('RST', 'K3 Restricted', {policy: 'K3 Restricted policy'}),
                    sec('WDS', 'K3 Words', {policy: 'K3 Words policy'}), sec('NEG', 'K3 Negative'), sec('NAB', 'K3 NoAbstract'), sec('NIX', 'K3 NotIndexed'), sec('IDT', 'K3 Identify')],
                metadata: {plainLanguageSummary: 'request'}, users});
        } else {
            const users = [u(p, 'mg', ['manager'], 'Mia', 'Manager'), u(p, 'ed', ['editor'], 'Eddie', 'Editor'), u(p, 'se', ['sectionEditor'], 'Sam', 'Section'),
                u(p, 'fc', ['funding'], 'Fay', 'Funding'), u(p, 'au', ['author'], 'Amy', 'Author'), u(p, 'rd', ['reader'], 'Rae', 'Reader')];
            S.A = await mk('a', {context: {name: `U17 K3 press ${t}`, acronym: 'KTHREE'},
                categories: [{path: 'k3cat', title: 'K3 Cat'}, {path: 'k3other', title: 'K3 Other'}], users});
        }
        if (!isOMP) S.B = await mk('b', {context: {name: `U17 K3 ${app.name} B ${t}`}, users: [u(`${t}b`, 'mg', ['manager'], 'Bea', 'Manager')]});
        S.C = await mk('c', {context: {name: `U17 K3 ${app.name} C ${t}`},
            users: [u(`${t}c`, 'mg', ['manager'], 'Cai', 'Manager'), u(`${t}c`, 'tw', ['sectionEditor', 'author'], 'Tia', 'Twin')]});
        // submissions that do not depend on the on-screen settings (made before the boxes are ticked)
        const A = S.A.path;
        const sub = async (key, spec) => {
            if (S.subs && S.subs[key]) return;
            if (S.subErr) delete S.subErr[key];
            try {
                const r = await app.api.createSubmission({tag: `${t}${key}`, context: A, submitter: `${A}au`, ...spec});
                S.subs = S.subs || {}; S.subs[key] = r.submissionId; S.pubs = S.pubs || {}; S.pubs[key] = r.publicationId; log('sub', key, r.submissionId);
            } catch (e) { S.subErr = S.subErr || {}; S.subErr[key] = String(e.message).slice(0, 900); log('sub FAILED', key, S.subErr[key]); }
        };
        const words6 = 'one two three four five six';
        if (isOJS) {
            const issue = {volume: 1, number: 1, year: 2026};
            const pub = (sec2, title, extra = {}) => ({section: sec2, title, published: true, issue, files: [{file: 'article.pdf'}], ...extra});
            await sub('pART', pub('ART', 'K3 Control Paper'));
            await sub('pHTT', pub('HTT', 'K3 Hidden Heading Paper'));
            await sub('pHAU', pub('HAU', 'K3 Hidden Authors Paper'));
            await sub('pNPR', pub('NPR', 'K3 Not Reviewed Paper'));
            await sub('pNIX', pub('NIX', 'K3 Not Indexed Paper'));
            await sub('pIDT', pub('IDT', 'K3 Identify Paper'));
            await sub('rFRM', {section: 'FRM', title: 'K3 Form Review Paper', decisions: ['sendExternalReview'], files: [{file: 'article.pdf'}], participants: [{username: `${A}se`, role: 'sectionEditor'}]});
            await sub('rART', {section: 'ART', title: 'K3 Articles Review Paper', decisions: ['sendExternalReview'], files: [{file: 'article.pdf'}]});
            await sub('dWDS', {section: 'WDS', title: 'K3 Words Draft', abstract: words6, submitted: false, files: [{file: 'article.pdf'}]});
            await sub('dNEG', {section: 'NEG', title: 'K3 Negative Draft', abstract: 'Three word abstract', submitted: false, files: [{file: 'article.pdf'}]});
            await sub('dNEG1', {section: 'NEG', title: 'K3 Negative One Word', abstract: 'Single', submitted: false, files: [{file: 'article.pdf'}]});
            await sub('dNAB', {section: 'NAB', title: 'K3 NoAbstract Draft', abstract: '', submitted: false, files: [{file: 'article.pdf'}]});
            await sub('sWDS', {section: 'WDS', title: 'K3 Words Submitted', abstract: words6, plainLanguageSummary: words6});
            await sub('sNEG', {section: 'NEG', title: 'K3 Negative Submitted', abstract: 'Three word abstract'});
            await sub('sNAB', {section: 'NAB', title: 'K3 NoAbstract Production', abstract: '', decisions: ['skipExternalReview', 'sendToProduction'], galleys: [{label: 'PDF', file: 'article.pdf'}]});
            await sub('sNAB2', {section: 'NAB', title: 'K3 NoAbstract Production Two', abstract: '', decisions: ['skipExternalReview', 'sendToProduction'], galleys: [{label: 'PDF', file: 'article.pdf'}]});
        } else if (isOPS) {
            const pub = (sec2, title, extra = {}) => ({section: sec2, title, published: true, galleys: [{label: 'PDF', file: 'preprint.pdf'}], ...extra});
            await sub('pPRE', pub('PRE', 'K3 Control Preprint'));
            await sub('pNIX', pub('NIX', 'K3 Not Indexed Preprint'));
            await sub('pIDT', pub('IDT', 'K3 Identify Preprint'));
            await sub('dWDS', {section: 'WDS', title: 'K3 Words Draft', abstract: words6, submitted: false});
            await sub('dNEG', {section: 'NEG', title: 'K3 Negative Draft', abstract: 'Three word abstract', submitted: false});
            await sub('dNEG1', {section: 'NEG', title: 'K3 Negative One Word', abstract: 'Single', submitted: false});
            await sub('dNAB', {section: 'NAB', title: 'K3 NoAbstract Draft', abstract: '', submitted: false});
            await sub('sWDS', {section: 'WDS', title: 'K3 Words Submitted', abstract: words6, plainLanguageSummary: words6});
            await sub('sNEG', {section: 'NEG', title: 'K3 Negative Submitted', abstract: 'Three word abstract'});
            await sub('sNAB', {section: 'NAB', title: 'K3 NoAbstract Production', abstract: '', galleys: [{label: 'PDF', file: 'preprint.pdf'}]});
            await sub('sNAB2', {section: 'NAB', title: 'K3 NoAbstract Production Two', abstract: '', galleys: [{label: 'PDF', file: 'preprint.pdf'}]});
        }
        // drafts in the section that is restricted on screen afterwards (made while it is open): one per level
        if (!isOMP) {
            for (const k of (isOJS ? ['au', 'fc', 'se', 'rd'] : ['au', 'eb', 'se', 'rd'])) {
                await sub(`dRST${k}`, {section: 'RST', title: `K3 Restricted Draft ${k}`, submitter: `${A}${k}`, submitted: false, ...(isOJS ? {files: [{file: 'article.pdf'}]} : {})});
            }
        }
        S.seeded = true; save();
        record('seed', S);
    }
    if (!S.seeded) { log('no state; run seed first'); return; }
    if (PHASES.length === 1 && PHASES[0] === 'seed') return;
    const A = S.A.path;
    const au = (k, ctx = A) => `${ctx}${k}`;

    // ------------------------------------------------------------------ browser and helpers
    const {page, close} = await launch(app);
    const jsDialogs = [];
    page.on('dialog', (d) => {
        jsDialogs.push({at: Date.now(), type: d.type(), message: flat(d.message(), 300), url: strip(page.url())});
        log('[browser dialog]', d.type(), flat(d.message(), 160));
        d.accept().catch(() => {});
    });
    const dialogsSince = (s) => jsDialogs.filter((d) => d.at >= s);
    const consoleMsgs = [];
    page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) consoleMsgs.push({at: Date.now(), type: m.type(), t: flat(m.text(), 300)}); });
    page.on('pageerror', (e) => consoleMsgs.push({at: Date.now(), type: 'pageerror', t: flat(e.message, 300)}));
    const bad = [];
    page.on('response', async (r) => {
        if (r.status() < 400) return;
        const o = {at: Date.now(), status: r.status(), m: r.request().method(), url: strip(r.url()).slice(0, 200)};
        if (/\/api\/v1\//.test(r.url())) { try { o.body = (await r.text()).slice(0, 500); } catch (e) { /* none */ } }
        bad.push(o);
    });
    const since = (arr, s) => arr.filter((x) => x.at >= s);
    await page.context().addInitScript(() => {
        window.__notices = [];
        const seen = new WeakSet();
        const sweep = () => {
            document.querySelectorAll('[role="alert"], [role="status"], .pkpNotification, .pkp_notification, .ui-pnotify, [class*="toast"], [class*="Toast"]').forEach((e) => {
                const tx = (e.innerText || '').trim();
                if (tx && !seen.has(e)) { seen.add(e); window.__notices.push({t: tx.slice(0, 300), at: Date.now()}); }
            });
        };
        new MutationObserver(sweep).observe(document, {subtree: true, childList: true, characterData: true});
    });
    const noticesSince = async (s) => page.evaluate((x) => (window.__notices || []).filter((n) => n.at >= x).map((n) => n.t), s).catch(() => []);

    async function snap(name, extra = {}, {png = false} = {}) {
        let s;
        try { s = await screen(page); } catch (e) { s = {url: page.url(), error: String(e.message).slice(0, 200)}; }
        Object.assign(s, extra);
        record(name, s);
        if (png) await shot(page, name).catch(() => {});
        return s;
    }
    async function sect(name, fn) {
        try { return await fn(); } catch (e) {
            log(`[${name} FAILED]`, String(e.stack || e).split('\n').slice(0, 4).join(' | '));
            fact(`${name}.FAILED`, String(e.message || e).slice(0, 600));
            await snap(`zz-failed-${name.replace(/[^a-z0-9]+/gi, '-')}`, {}, {png: true}).catch(() => {});
            return null;
        }
    }
    const as = async (user, ctx) => { await signIn(page, user, {contextPath: ctx}); await idle(page).catch(() => {}); };
    const visitor = async () => { await signOut(page).catch(() => {}); };
    const cu = (ctx, p, l = 'en') => app.url(`/index.php/${ctx}${l ? `/${l}` : ''}${p}`);
    const go = async (url) => {
        const r = await page.goto(url, {waitUntil: 'domcontentloaded'}).catch((e) => ({err: String(e.message).slice(0, 200)}));
        await idle(page).catch(() => {});
        return r && r.status ? r.status() : r;
    };
    const grid = () => page.locator(GRIDSEL).first();
    const readGrid = async () => page.evaluate(GRID, GRIDSEL);
    const form = () => page.locator(FORMSEL).first();
    const readForm = async () => page.evaluate(FORM, FORMSEL);
    const top = () => page.locator('[role="dialog"]:visible').last();
    const mainText = async (n = 3000) => flat(await page.locator('main, .pkp_structure_main, body').first().innerText().catch(() => ''), n);

    async function openTab(ctx) {
        const status = await go(cu(ctx, '/management/settings/context'));
        const tab = page.getByRole('tab', {name: TAB, exact: true}).first();
        if (!(await tab.count())) return {status, tab: false};
        await tab.click(); await idle(page);
        await grid().waitFor({timeout: T});
        await grid().locator('tr.gridRow, tbody.empty').first().waitFor({state: 'attached', timeout: T}).catch(() => {});
        await sleep(400);
        return {status, tab: true};
    }
    const rowOf = (title) => grid().locator('tr.gridRow').filter({hasText: title}).first();
    async function openEdit(title) {
        const row = rowOf(title);
        const tog = row.locator('a.show_extras');
        if (await tog.count()) { await tog.first().click(); await sleep(400); }
        const id = await row.getAttribute('id');
        await page.locator(`tr#${id} + tr`).getByRole('link', {name: 'Edit', exact: true}).first().click();
        await form().locator('input[name^="title"]').first().waitFor({timeout: T});
        await idle(page); await sleep(800);
    }
    async function openCreate() {
        await grid().getByRole('link', {name: isOMP ? /Add Series/ : /Create Section/}).first().click();
        await form().locator('input[name^="title"]').first().waitFor({timeout: T});
        await idle(page); await sleep(800);
    }
    async function pressSave(label) {
        const t0 = Date.now();
        const w = page.waitForResponse((r) => r.request().method() === 'POST' && /(update|save)-?(section|series)/i.test(r.url()), {timeout: T}).catch(() => null);
        await form().getByRole('button', {name: 'Save', exact: true}).click();
        const r = await w;
        await sleep(1200); await idle(page).catch(() => {});
        const open = await form().isVisible().catch(() => false);
        const out = {label, post: r ? {status: r.status(), url: strip(r.url()).slice(0, 160)} : null, windowOpen: open,
            form: open ? await readForm() : null, notices: await noticesSince(t0), dialogs: dialogsSince(t0), failed: since(bad, t0), console: since(consoleMsgs, t0)};
        await snap(label, {save: {post: out.post, windowOpen: open, notices: out.notices, dialogs: out.dialogs, failed: out.failed}});
        return out;
    }
    async function closeWindow() {
        const c = form().getByRole('link', {name: 'Cancel', exact: true}).first();
        if (await c.count()) await c.click().catch(() => {});
        else await top().getByRole('button', {name: 'Close'}).first().click().catch(() => {});
        await sleep(900);
    }
    // One section window: open, change, save; read the table's row, then reopen after a reload.
    async function setSection(title, label, fn, {reopen = true} = {}) {
        await openTab(A);
        await openEdit(title);
        const before = await readForm();
        await fn();
        const res = await pressSave(`${label}-save`);
        if (res.windowOpen) await closeWindow();
        const row = (await readGrid()).rows.find((r) => JSON.stringify(r.cells).includes(title));
        let after = null;
        if (reopen) {
            await page.reload(); await idle(page);
            await openTab(A);
            await openEdit(title);
            after = await readForm();
            await snap(`${label}-reopened`, {form: after});
            await closeWindow();
        }
        const pick = (f) => (f ? f.fields.filter((x) => !/^title|^abbrev|^policy|^description/.test(x.name)).map((x) => [x.name, x.checked ?? x.selected ?? x.value]) : null);
        return {before: pick(before), post: res.post, notices: res.notices, dialogs: res.dialogs, failed: res.failed, windowOpen: res.windowOpen, row, after: pick(after)};
    }
    const box = (name) => form().locator(`input[name="${name}"]`).first();

    // ================================================================== window: the new section's defaults; each field set on screen (OJS, OPS)
    if (on('window') && !isOMP) await sect('window', async () => {
        const out = {};
        await as(au('mg'), A);
        await openTab(A);
        out.grid0 = await readGrid();
        await snap('w-00-grid', {grid: out.grid0}, {png: true});
        // the new section's window as it opens (Settings 2–13 defaults), left by "Cancel"
        await openCreate();
        out.create = await readForm();
        await snap('w-01-create-window', {form: out.create}, {png: true});
        await loc(page, 'Section window: "Word Count" input[name="wordCount"]', box('wordCount'));
        await loc(page, `Section window: editor-only box input[name="${RESTRICT}"]`, box(RESTRICT));
        await loc(page, 'Section window: "Will not be included in the indexing" input[name="metaIndexed"]', box('metaIndexed'));
        if (isOJS) {
            await loc(page, 'Section window: "Review Form" select[name="reviewFormId"]', form().locator('select[name="reviewFormId"]'));
            await loc(page, 'Section window: "Omit the title…" input[name="hideTitle"]', box('hideTitle'));
            await loc(page, 'Section window: "Omit author names…" input[name="hideAuthor"]', box('hideAuthor'));
            await loc(page, 'Section window: "Will not be peer-reviewed" input[name="metaReviewed"]', box('metaReviewed'));
        }
        await closeWindow();
        // the seeded (scenario) sections' windows before any change: the boxes as the scenario leaves them
        await openEdit('K3 NotIndexed');
        out.nixBefore = await readForm();
        await snap('w-02-nix-window-before', {form: out.nixBefore});
        await closeWindow();
        // Settings 2: the editor-only box
        out.restrict = await setSection('K3 Restricted', 'w-03-restrict', async () => { await box(RESTRICT).check(); });
        // Settings 4: Word Count 5; A2: -5
        out.words = await setSection('K3 Words', 'w-04-words', async () => { await box('wordCount').fill('5'); });
        out.negative = await setSection('K3 Negative', 'w-05-negative', async () => { await box('wordCount').fill('-5'); });
        // Settings 5
        out.noAbstract = await setSection('K3 NoAbstract', 'w-06-noabstract', async () => { await box('abstractsNotRequired').check(); });
        // Settings 8
        out.notIndexed = await setSection('K3 NotIndexed', 'w-07-notindexed', async () => { await box('metaIndexed').check(); });
        // Settings 11
        out.identify = await setSection('K3 Identify', 'w-08-identify', async () => { await form().locator('input[name="identifyType[en]"]').fill('K3 Kind Words'); });
        if (isOJS) {
            out.formSel = await setSection('K3 Form', 'w-09-reviewform', async () => { await form().locator('select[name="reviewFormId"]').selectOption({label: 'K3 Form Two'}); });
            out.hideTitle = await setSection('K3 HideTitle', 'w-10-hidetitle', async () => { await box('hideTitle').check(); });
            out.hideAuthor = await setSection('K3 HideAuthor', 'w-11-hideauthor', async () => { await box('hideAuthor').check(); });
            out.notReviewed = await setSection('K3 NotReviewed', 'w-12-notreviewed', async () => { await box('metaReviewed').check(); });
        }
        // Rule 8 / Settings 13: the "Editorial Assignments" boxes on "Articles" (Preprints), two ticked
        const first = isOJS ? 'Articles' : 'Preprints';
        out.assign = await setSection(first, 'w-13-assign', async () => {
            const boxes = await form().locator('input[name^="subEditors"]').evaluateAll((els) => els.map((e) => (e.closest('label') || e.parentElement).innerText.trim()));
            out.assignBoxes = boxes;
            await form().getByRole('checkbox', {name: /Sam Section/}).first().check();
            if (isOJS) await form().getByRole('checkbox', {name: /Gia Guest/}).first().check();
            if (isOJS) await form().getByRole('checkbox', {name: /Eddie Editor/}).first().check();
        });
        await loc(page, 'Sections table: the "Editors" cell (column 2 of tr.gridRow)', rowOf(first).locator('td').nth(1));
        out.gridAfter = await readGrid();
        await snap('w-14-grid-after', {grid: out.gridAfter}, {png: true});
        // leaving a changed window by "×": the confirm, and the change dropped
        await openEdit('K3 Plain');
        await box('wordCount').fill('77'); await box('wordCount').blur();
        const t0 = Date.now();
        await top().getByRole('button', {name: 'Close'}).first().click(); await sleep(1200);
        out.leaveByClose = {dialogs: dialogsSince(t0), windowOpen: await form().isVisible().catch(() => false)};
        await openEdit('K3 Plain');
        out.leaveByClose.reopenedWordCount = await box('wordCount').inputValue();
        await snap('w-15-left-by-close-reopened', {facts: out.leaveByClose});
        await closeWindow();
        // B: a new journal's (server's) own first section
        await as(au('mg', S.B.path), S.B.path);
        await openTab(S.B.path);
        out.bGrid = await readGrid();
        const bFirst = out.bGrid.rows[0] ? String(typeof out.bGrid.rows[0].cells[0] === 'string' ? out.bGrid.rows[0].cells[0] : out.bGrid.rows[0].cells[0].text).replace(/^Settings\s+/, '') : null;
        if (bFirst) {
            const g = grid().locator('tr.gridRow').first();
            await g.locator('a.show_extras').first().click(); await sleep(400);
            const id = await g.getAttribute('id');
            await page.locator(`tr#${id} + tr`).getByRole('link', {name: 'Edit', exact: true}).first().click();
            await form().locator('input[name^="title"]').first().waitFor({timeout: T}); await idle(page); await sleep(1200);
            out.bFirst = await readForm();
            await snap('w-16-b-first-section', {form: out.bFirst}, {png: true});
            await closeWindow();
        }
        await visitor();
        fact('window', out);
    });

    // ================================================================== pkread: publicknowledge's table and "Edit" windows, read only (Settings 4, 11, 13)
    if (on('pkread')) await sect('pkread', async () => {
        const out = {};
        await as('manager.maya', 'publicknowledge');
        await openTab('publicknowledge');
        out.grid = await readGrid();
        await snap('k-01-pk-grid', {grid: out.grid}, {png: true});
        for (const r of out.grid.rows) {
            const name = String(typeof r.cells[0] === 'string' ? r.cells[0] : r.cells[0].text).replace(/^Settings\s+/, '');
            await openEdit(name);
            const f = await readForm();
            out[name] = f.fields.filter((x) => !/^title|^abbrev/.test(x.name) || /\[en\]/.test(x.name)).map((x) => [x.name, x.label, x.checked ?? x.selected ?? x.value ?? x.rich]);
            await snap(`k-02-pk-edit-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, {form: f});
            await closeWindow();
        }
        await visitor();
        fact('pkread', out);
    });


    // ------------------------------------------------------------------ shared helpers for the workflow and wizard
    const wf = () => page.locator('[role="dialog"]:visible').first();
    const wfUrl = (sid, key, author) => cu(A, `/dashboard/${author ? 'mySubmissions' : 'editorial'}?workflowSubmissionId=${sid}${key ? `&workflowMenuKey=${key}` : ''}`);
    async function waitRich(prefix) {
        const iframe = page.locator(`iframe[id^="${prefix}"]`).first();
        await iframe.waitFor({state: 'attached', timeout: T}).catch(() => {});
        const id = (await iframe.getAttribute('id').catch(() => '') || '').replace(/_ifr$/, '');
        if (id) await page.waitForFunction((i) => !!(window.tinymce && window.tinymce.get(i) && window.tinymce.get(i).initialized), id, {timeout: T}).catch(() => {});
        return id;
    }
    async function typeRich(prefix, text) {
        const id = await waitRich(prefix);
        if (!id) return {typed: false};
        await page.frameLocator(`#${id}_ifr`).locator('body').click();
        await page.keyboard.press('Control+End');
        await page.keyboard.type(text);
        await sleep(300);
        return {typed: true, id, content: await page.evaluate((i) => window.tinymce.get(i).getContent(), id).catch(() => null)};
    }
    async function gotoWizard(sid) {
        const st = await go(cu(A, `/submission?id=${sid}`));
        await page.locator('.pkpSteps, h1').first().waitFor({timeout: T}).catch(() => {});
        await idle(page); await sleep(900);
        return st;
    }
    async function toReview(sid) {
        const out = {steps: []};
        const tR = Date.now();
        const cur = () => page.locator('.pkpSteps__step--current, [aria-current="step"]').first();
        const cont = page.locator('.submissionWizard__footer').getByRole('button', {name: 'Continue', exact: true});
        const validated = page.waitForResponse((r) => r.url().includes(`/submissions/${sid}/submit`) && r.request().method() === 'POST', {timeout: 60000}).catch(() => null);
        for (let i = 0; i < 7; i++) {
            const c = flat(await cur().innerText({timeout: 3000}).catch(() => ''), 60);
            out.steps.push(c);
            log('step', sid, i, c);
            if (/Review$/.test(c)) break;
            if (!(await cont.count())) { await sleep(3000); if (!(await cont.count())) { out.noContinueAt = flat(await page.locator('h1').first().innerText().catch(() => ''), 80); break; } }
            await cont.click(); await sleep(1500); await idle(page);
        }
        await validated;
        await page.locator('.submissionWizard__loadingReview').waitFor({state: 'hidden', timeout: 20000}).catch(() => {});
        await sleep(1500);
        out.review = flat(await page.locator('.submissionWizard, main').first().innerText().catch(() => ''), 3000);
        out.messages = await page.evaluate(() => [...document.querySelectorAll('.submissionWizard__reviewPanel__item__value .pkpNotification, [class*="Notification"], .pkpFieldError, [role="alert"]')]
            .filter((e) => e.offsetParent !== null).map((e) => e.innerText.replace(/\s+/g, ' ').trim()).filter(Boolean)).catch(() => []);
        out.abstractLines = (out.review.match(/[^.]*(abstract|summary|words)[^.]*\./gi) || []).slice(0, 12);
        const submit = page.locator('.submissionWizard__footer').getByRole('button', {name: 'Submit', exact: true});
        out.submit = {count: await submit.count(), enabled: (await submit.count()) ? await submit.isEnabled() : null};
        out.failed = since(bad, tR).filter((x) => !/\/submit$/.test(x.url));
        out.pageErrors = since(consoleMsgs, tR).filter((x) => x.type === 'pageerror');
        return out;
    }
    async function openTA(sid, pubKey) {
        const pub = S.pubs && S.pubs[pubKey];
        if (pub) await go(wfUrl(sid, `publication_${pub}_titleAbstract`));
        else {
            await go(wfUrl(sid));
            const l = wf().getByRole('link', {name: 'Title & Abstract', exact: true}).first();
            await l.waitFor({state: 'visible', timeout: T}).catch(() => {});
            if (!(await l.isVisible().catch(() => false))) {
                const g = wf().getByRole('link', {name: /^(Publication|Preprint)$/}).first();
                if (await g.count()) { await g.click(); await idle(page); }
            }
            await l.click().catch(() => {});
        }
        await idle(page);
        const start = Date.now();
        while (Date.now() - start < 20_000 && !(await wf().getByRole('button', {name: 'Save', exact: true}).count())) await sleep(250);
        await waitRich('titleAbstract-abstract-control');
        await idle(page); await sleep(600);
    }
    const taRead = async () => {
        const txt = await wf().innerText().catch(() => '');
        return {counters: (txt.match(/Word Count:?\s*[^\n]*/g) || []), errors: await wf().locator('.pkpFieldError').allInnerTexts().catch(() => []),
            status: await wf().locator('[role="status"]').allInnerTexts().catch(() => []), text: flat(txt, 2500)};
    };
    async function taSave() {
        const t0 = Date.now();
        const button = wf().getByRole('button', {name: 'Save', exact: true}).last();
        const r = page.waitForResponse((x) => /\/publications\/\d+/.test(x.url()) && ['POST', 'PUT'].includes(x.request().method()), {timeout: T}).catch(() => null);
        await button.click();
        const resp = await r;
        await page.locator('[role="status"]:has-text("Saved")').first().waitFor({state: 'visible', timeout: 8_000}).catch(() => {});
        await sleep(600);
        let body = null;
        if (resp && resp.status() >= 400) { try { body = await resp.text(); } catch (e) { /* none */ } }
        return {status: resp ? resp.status() : null, body: body ? body.slice(0, 600) : undefined, notices: await noticesSince(t0), failed: since(bad, t0), ...(await taRead())};
    }

    // ================================================================== series (OMP): two series made on screen; the table's name, the window's fields
    if (on('series') && isOMP) await sect('series', async () => {
        const out = {};
        await as(au('mg'), A);
        await openTab(A);
        out.grid0 = await readGrid();
        await snap('s-00-grid', {grid: out.grid0});
        if (!S.seriesMade) {
            await openCreate();
            out.create = await readForm();
            await snap('s-01-add-window', {form: out.create}, {png: true});
            await form().locator('input[name="prefix[en]"]').fill('The');
            await form().locator('input[name="title[en]"]').fill('Monographs');
            await form().locator('input[name="subtitle[en]"]').fill('K3 Subtitle');
            out.desc = await typeRich('seriesForm-description', 'K3 series description');
            if (!out.desc.typed) {
                const ta = await form().locator('textarea[name="description[en]"]').getAttribute('id');
                out.desc = await typeRich(ta, 'K3 series description');
            }
            await form().getByRole('checkbox', {name: /Sam Section/}).first().check();
            await form().locator('input[name="path"]').fill('k3mono');
            out.save1 = await pressSave('s-02-save-monographs');
            if (out.save1.windowOpen) await closeWindow();
            await openCreate();
            await form().locator('input[name="title[en]"]').fill('K3 Closed');
            await box('editorRestricted').check();
            await form().locator('input[name="path"]').fill('k3closed');
            out.save2 = await pressSave('s-03-save-closed');
            if (out.save2.windowOpen) await closeWindow();
            S.seriesMade = true; save();
        }
        await page.reload(); await idle(page); await openTab(A);
        out.grid1 = await readGrid();
        await snap('s-04-grid', {grid: out.grid1}, {png: true});
        await openEdit('Monographs');
        out.mono = await readForm();
        await snap('s-05-monographs-reopened', {form: out.mono});
        await closeWindow();
        await visitor();
        fact('series', out);
    });

    // ================================================================== seed2: what needs the on-screen series (OMP), and the arriving drafts (all)
    if (on('seed2')) await sect('seed2', async () => {
        if (isOMP) {
            await seedSub('pBook', {series: 'k3mono', title: 'K3 Series Book', published: true, files: [{file: 'article.pdf'}]});
            await seedSub('pCtl', {title: 'K3 Category Control Book', published: true, categories: ['k3other'], files: [{file: 'article.pdf'}]});
            for (const k of ['mg', 'ed', 'se', 'fc', 'au', 'rd']) await seedSub(`dSer${k}`, {submitter: au(k), title: `K3 Series Draft ${k}`, submitted: false, files: [{file: 'article.pdf'}]});
            await seedSub('dASN', {series: 'k3mono', title: 'K3 Arriving Book', submitted: false, files: [{file: 'article.pdf'}]});
        } else if (isOJS) {
            await seedSub('dASN', {section: 'ART', title: 'K3 Arriving Paper', submitted: false, files: [{file: 'article.pdf'}]});
        } else {
            await seedSub('dASN', {section: 'PRE', title: 'K3 Arriving Preprint', submitted: false});
        }
        fact('seed2', {subs: S.subs, subErr: S.subErr});
    });

    // ================================================================== intake: the start form's "Section" choice and policy, the "Submissions" page,
    // per level; the drafts in the section restricted after they were started (Settings 2, 3; Rule 11)
    if (on('intake') && !isOMP) await sect('intake', async () => {
        const out = {};
        const levels = isOJS ? ['admin', 'mg', 'ed', 'se', 'ge', 'fc', 'ce', 'pe', 'rv', 'au', 'rd'] : ['admin', 'mg', 'se', 'eb', 'au', 'rd'];
        const readAbout = async (k) => {
            const st = await go(cu(A, '/about/submissions'));
            const o = {status: st, blocks: await page.locator('.section_policy').evaluateAll((els) => els.map((e) => ({h2: (e.querySelector('h2') || {}).innerText, text: e.innerText.replace(/\s+/g, ' ').trim().slice(0, 200)}))).catch(() => null),
                notice: flat(await page.locator('.page_submissions .cmp_notification').first().innerText().catch(() => null), 300)};
            await snap(`i-${k}-about`, {facts: o});
            return o;
        };
        await visitor();
        out.visitor = {about: await readAbout('visitor')};
        for (const k of levels) {
            const o = {};
            await as(k === 'admin' ? 'admin' : au(k), A);
            o.startStatus = await go(cu(A, '/submission'));
            await page.locator('input[type=radio][name="sectionId"], h1').first().waitFor({timeout: T}).catch(() => {});
            await idle(page); await sleep(1000);
            o.h1 = flat(await page.locator('h1').first().innerText().catch(() => null), 120);
            o.radios = await page.locator('input[type=radio][name="sectionId"]').evaluateAll((els) => els.map((e) => (e.closest('label') || e.parentElement).innerText.replace(/\s+/g, ' ').trim()));
            o.policyBeforePick = await page.locator('.pkpFormField--html:visible').allInnerTexts().catch(() => []);
            o.policies = {};
            for (const r of o.radios) {
                await page.getByRole('radio', {name: r, exact: true}).first().check().catch(() => {});
                await sleep(400);
                o.policies[r] = (await page.locator('.pkpFormField--html:visible').allInnerTexts().catch(() => [])).map((x) => flat(x, 200));
            }
            await snap(`i-${k}-start`, {facts: o});
            if (k === 'au') await loc(page, 'Start form: a section\'s policy under the choice .pkpFormField--html:visible', page.locator('.pkpFormField--html:visible'));
            o.about = await readAbout(k);
            out[k] = o;
            log(k, JSON.stringify({radios: o.radios, about: (o.about.blocks || []).map((b) => b.h2)}));
        }
        // drafts started in "K3 Restricted" before it was restricted: each level reopens its own
        for (const k of (isOJS ? ['au', 'fc', 'se', 'rd'] : ['au', 'eb', 'se', 'rd'])) {
            const sid = S.subs[`dRST${k}`];
            if (!sid) continue;
            await as(au(k), A);
            const st = await gotoWizard(sid);
            const o = {status: st, url: strip(page.url()), h1: flat(await page.locator('h1').first().innerText().catch(() => null), 120), main: await mainText(800),
                rail: (await page.locator('.pkpSteps button').allInnerTexts().catch(() => [])).map((x) => flat(x, 40))};
            await snap(`i-${k}-restricted-draft`, {facts: o}, {png: k === 'au'});
            if (/pkpSteps/.test(await page.content()) && o.rail.length) {
                o.toReview = await toReview(sid);
                await snap(`i-${k}-restricted-draft-review`, {facts: o.toReview});
            }
            out[`draft-${k}`] = o;
        }
        await visitor();
        fact('intake', out);
    });

    // OMP: the wizard's "Series" choice per level (Settings 2 for a press, Rule 10's subtitle)
    if (on('intake') && isOMP) await sect('intake', async () => {
        const out = {};
        for (const k of ['mg', 'ed', 'se', 'fc', 'au', 'rd']) {
            const sid = S.subs[`dSer${k}`];
            if (!sid) continue;
            await as(au(k), A);
            await gotoWizard(sid);
            const ed = page.locator('.pkpSteps').getByRole('button', {name: /For the Editors$/}).first();
            if (await ed.count()) { await ed.click(); await sleep(1500); await idle(page); }
            const o = {radios: await page.locator('input[type=radio]').evaluateAll((els) => els.map((e) => ({name: e.name, label: (e.closest('label') || e.parentElement).innerText.replace(/\s+/g, ' ').trim(), checked: e.checked}))),
                step: flat(await page.locator('.pkpSteps__step--current, [aria-current="step"]').first().innerText().catch(() => ''), 60)};
            await snap(`i-${k}-wizard-series`, {facts: o}, {png: k === 'au'});
            out[k] = o;
            log(k, JSON.stringify(o.radios.filter((x) => /series/i.test(x.name)).map((x) => x.label)));
        }
        await visitor();
        fact('intake', out);
    });

    // ================================================================== words: the wizard's Review step (Settings 4, 5, A2) and the "Title & Abstract" counter
    if (on('words') && !isOMP) await sect('words', async () => {
        const out = {};
        await as(au('au'), A);
        // on the Details step: a six-word plain language summary (dWDS), the abstract emptied (dNAB)
        const replaceRich = async (id, text) => {
            await page.locator(`#${id}_ifr`).waitFor({state: 'visible', timeout: 10000}).catch(() => {});
            if (!(await page.locator(`#${id}_ifr`).isVisible().catch(() => false))) return {found: false, visible: false};
            await page.waitForFunction((i) => !!(window.tinymce && window.tinymce.get(i) && window.tinymce.get(i).initialized), id, {timeout: T}).catch(() => {});
            if (!(await page.locator(`#${id}_ifr`).count())) return {found: false};
            const body = page.frameLocator(`#${id}_ifr`).locator('body');
            await body.click();
            await page.keyboard.press('Control+A'); await page.keyboard.press('Delete');
            if (text) await page.keyboard.type(text);
            await sleep(500);
            await page.locator('.submissionWizard, main').first().click({position: {x: 5, y: 5}}).catch(() => {});
            await sleep(1500); await idle(page);
            return {found: true, content: await page.evaluate((i) => window.tinymce.get(i).getContent(), id).catch(() => null)};
        };
        const toDetails = async () => {
            for (let i = 0; i < 3 && !(await page.locator('#titleAbstract-abstract-control-en_ifr').isVisible().catch(() => false)); i++) {
                await page.locator('.submissionWizard__footer').getByRole('button', {name: 'Continue', exact: true}).click().catch(() => {});
                await sleep(1500); await idle(page);
            }
        };
        for (const key of (process.env.KEYS || 'dWDS,dNEG,dNEG1,dNAB').split(',')) {
            const sid = S.subs[key];
            if (!sid) continue;
            await gotoWizard(sid);
            if (key === 'dNAB') { await toDetails(); out.abstractCleared = await replaceRich('titleAbstract-abstract-control-en', ''); await snap('d-dNAB-details-cleared', {facts: out.abstractCleared}); }
            out[key] = await toReview(sid);
            await snap(`d-${key}-review`, {facts: {abstractLines: out[key].abstractLines, messages: out[key].messages, submit: out[key].submit}}, {png: true});
            log(key, JSON.stringify({lines: out[key].abstractLines, submit: out[key].submit}));
        }
        await visitor();
        fact('words', out);
    });
    if (on('ta') && !isOMP) await sect('ta', async () => {
        const out = {};
        await as(au('mg'), A);
        for (const key of ['sWDS', 'sNEG', 'sNAB']) {
            const sid = S.subs[key];
            if (!sid) continue;
            await openTA(sid, key);
            const o = {open: await taRead()};
            await snap(`t-${key}-title-abstract`, {facts: {counters: o.open.counters}}, {png: key === 'sWDS'});
            o.save = await taSave();
            await snap(`t-${key}-after-save`, {facts: {status: o.save.status, counters: o.save.counters, errors: o.save.errors, notices: o.save.notices}});
            await openTA(sid, key);
            o.reloaded = await taRead();
            out[key] = o;
            log(key, JSON.stringify({counters: o.open.counters, save: o.save.status, errors: o.save.errors}));
        }
        // leaving "Title & Abstract" with an unsaved change: to "Metadata", then back
        if (S.subs.sWDS) {
            await openTA(S.subs.sWDS, 'sWDS');
            const t0 = Date.now();
            out.typed = await typeRich('titleAbstract-abstract-control', ' seven');
            out.counterTyped = (await taRead()).counters;
            await wf().getByRole('link', {name: 'Metadata', exact: true}).first().click().catch(() => {});
            await sleep(1500); await idle(page);
            out.leave = {dialogs: dialogsSince(t0), vueDialog: flat(await page.locator('[role="dialog"]:visible').last().innerText().catch(() => null), 400), heading: flat(await wf().locator('h1, h2').first().innerText().catch(() => null), 100)};
            await snap('t-leave-unsaved', {facts: out.leave});
            await openTA(S.subs.sWDS, 'sWDS');
            out.leave.backCounters = (await taRead()).counters;
        }
        await visitor();
        fact('ta', out);
    });

    // ================================================================== wds: "Word Count" 5 on the wizard's Details step: the abstract and the plain
    // language summary typed over and at the limit, each followed by "Continue" (Settings 4)
    if (on('wds') && !isOMP) await sect('wds', async () => {
        const out = {};
        const sid = S.subs.dWDS;
        await as(au('au'), A);
        const replaceRich = async (id, text) => {
            await page.locator(`#${id}_ifr`).waitFor({state: 'visible', timeout: 15000}).catch(() => {});
            if (!(await page.locator(`#${id}_ifr`).isVisible().catch(() => false))) return {found: false};
            await page.waitForFunction((i) => !!(window.tinymce && window.tinymce.get(i) && window.tinymce.get(i).initialized), id, {timeout: T}).catch(() => {});
            await page.frameLocator(`#${id}_ifr`).locator('body').click();
            await page.keyboard.press('Control+A'); await page.keyboard.press('Delete');
            if (text) await page.keyboard.type(text);
            await sleep(500);
            return {found: true};
        };
        const toDetails = async () => {
            await gotoWizard(sid);
            for (let i = 0; i < 3 && !(await page.locator('#titleAbstract-abstract-control-en_ifr').isVisible().catch(() => false)); i++) {
                await page.locator('.submissionWizard__footer').getByRole('button', {name: 'Continue', exact: true}).click().catch(() => {});
                await sleep(1500); await idle(page);
            }
        };
        const continueOnce = async (label) => {
            const t0 = Date.now();
            await page.locator('.submissionWizard__footer').getByRole('button', {name: 'Continue', exact: true}).click().catch(() => {});
            await sleep(4000); await idle(page);
            const o = {h1: flat(await page.locator('h1').first().innerText().catch(() => ''), 100),
                footer: flat(await page.locator('.submissionWizard__footer').first().innerText().catch(() => ''), 160),
                errors: await page.locator('.pkpFieldError:visible, [role="alert"]:visible').allInnerTexts().catch(() => []),
                notices: await noticesSince(t0), failed: since(bad, t0), pageErrors: since(consoleMsgs, t0).filter((x) => x.type === 'pageerror')};
            await snap(label, {facts: o}, {png: true});
            return o;
        };
        const cases = [
            ['w-01-abstract7', 'one two three four five six seven', null],
            ['w-02-abstract5-pls6', 'one two three four five', 'one two three four five six'],
            ['w-03-abstract5-pls5', 'one two three four five', 'one two three four five'],
        ];
        for (const [label, abs, pls] of cases) {
            await toDetails();
            const o = {abstract: await replaceRich('titleAbstract-abstract-control-en', abs)};
            if (pls !== null) o.pls = await replaceRich('titleAbstract-plainLanguageSummary-control-en', pls);
            o.onDetails = {errors: await page.locator('.pkpFieldError:visible').allInnerTexts().catch(() => []), counters: ((await page.locator('.submissionWizard, main').first().innerText().catch(() => '')).match(/Word Count[^\n]*/g) || [])};
            o.after = await continueOnce(label);
            out[label] = o;
            log(label, JSON.stringify(o).slice(0, 1500));
        }
        await gotoWizard(sid);
        out.review = await toReview(sid);
        await snap('w-04-review', {facts: {lines: out.review.abstractLines, messages: out.review.messages, submit: out.review.submit, failed: out.review.failed}}, {png: true});
        await visitor();
        fact('wds', out);
    });

    // ================================================================== nab: "Do not require abstracts" at both ends: the wizard and the publish window
    if (on('nab') && !isOMP) await sect('nab', async () => {
        const out = {};
        const {PublicationScreen} = isOJS ? require(path.join(REPO, 'apps/ojs/playwright/pages/PublicationMetadataPages.js')) : {};
        const fillVersion = async (scope) => {
            for (const [sel, val] of [['select[name="versionStage"]', 'VoR'], ['select[name="versionIsMinor"]', 'false']]) {
                const el = scope.locator(sel);
                if (await el.isVisible().catch(() => false)) { if (!(await el.inputValue().catch(() => ''))) await el.selectOption(val).catch(() => {}); }
            }
        };
        async function publishTry(key, label) {
            const sid = S.subs[key];
            const o = {};
            await go(wfUrl(sid));
            await sleep(1000);
            const t0 = Date.now();
            if (isOJS) {
                const pub = new PublicationScreen(page, null);
                const button = wf().getByRole('button', {name: /^(Schedule For Publication|Publish)$/}).first();
                await button.waitFor({state: 'visible', timeout: T});
                await sleep(800);
                await button.click();
                const panel = page.locator('[data-cy="active-modal"]').filter({hasText: 'Review Publishing Details'}).last();
                const confirm = page.getByRole('dialog').filter({hasText: /Are you sure you want to publish this|problems|cannot be published|not been/i}).last();
                let opened = await Promise.race([panel.locator('select[name="versionStage"]').waitFor({state: 'visible', timeout: 15000}).then(() => 'panel'),
                    confirm.waitFor({state: 'visible', timeout: 15000}).then(() => 'confirm')]).catch(() => null);
                if (!opened) { await button.click({timeout: 5000}).catch(() => {}); opened = await Promise.race([panel.locator('select[name="versionStage"]').waitFor({state: 'visible', timeout: 15000}).then(() => 'panel'), confirm.waitFor({state: 'visible', timeout: 15000}).then(() => 'confirm')]).catch(() => null); }
                o.opened = opened;
                if (opened === 'panel') {
                    await fillVersion(panel);
                    const dontAssign = panel.getByRole('radio', {name: "Don't Assign To An Issue"});
                    if (await dontAssign.waitFor({state: 'visible', timeout: 5000}).then(() => true).catch(() => false)) { await pub.awaitAssignmentPreselected(panel).catch(() => {}); await dontAssign.check(); }
                    o.panel = flat(await panel.innerText().catch(() => ''), 1200);
                    await panel.getByRole('button', {name: 'Confirm', exact: true}).click();
                    await sleep(1500);
                }
                const last = page.getByRole('dialog').last();
                await last.waitFor({state: 'visible', timeout: T}).catch(() => {});
                await idle(page);
                o.confirm = flat(await last.innerText().catch(() => ''), 900);
                await snap(`${label}-confirm`, {facts: o}, {png: true});
                const go2 = last.getByRole('button', {name: 'Publish', exact: true});
                o.publishOffered = await go2.count();
                if (o.publishOffered) {
                    const r = page.waitForResponse((x) => /\/publications\/\d+\/publish/.test(x.url()) && x.request().method() !== 'GET', {timeout: T}).catch(() => null);
                    await go2.click();
                    const resp = await r;
                    o.status = resp ? resp.status() : null;
                    await sleep(2000); await idle(page);
                } else {
                    const c = last.getByRole('button', {name: /^(Cancel|Close|OK)$/}).first();
                    if (await c.count()) await c.click().catch(() => {});
                }
            } else {
                const post = page.getByRole('button', {name: 'Post', exact: true});
                const stage = wf().getByRole('button', {name: 'Post the preprint', exact: true}).first();
                await post.first().or(stage).first().waitFor({state: 'visible', timeout: T}).catch(() => {});
                if (await stage.isVisible().catch(() => false)) { await stage.click(); await sleep(1500); await idle(page); }
                await post.first().waitFor({state: 'visible', timeout: T});
                await sleep(800);
                await post.first().click();
                const last = page.getByRole('dialog').last();
                await last.waitFor({state: 'visible', timeout: T});
                await idle(page); await sleep(800);
                await fillVersion(last);
                o.confirm = flat(await last.innerText().catch(() => ''), 900);
                await snap(`${label}-confirm`, {facts: o}, {png: true});
                const go2 = last.getByRole('button', {name: 'Post', exact: true});
                o.publishOffered = await go2.count();
                if (o.publishOffered) {
                    const r = page.waitForResponse((x) => /\/publications\/\d+\/publish/.test(x.url()) && x.request().method() !== 'GET', {timeout: T}).catch(() => null);
                    await go2.last().click();
                    const resp = await r;
                    o.status = resp ? resp.status() : null;
                    await sleep(2000); await idle(page);
                } else {
                    const c = last.getByRole('button', {name: /^(Cancel|Close|OK)$/}).first();
                    if (await c.count()) await c.click().catch(() => {});
                }
            }
            o.after = {failed: since(bad, t0), notices: await noticesSince(t0), controls: await page.locator('[data-cy="workflow-controls-right"] button').allInnerTexts().catch(() => []),
                statusLine: flat((await wf().innerText().catch(() => '')).split('\n').find((l) => /^Status|Published|Posted|Unpublished|Scheduled/.test(l.trim())), 120)};
            await snap(`${label}-after`, {facts: o.after});
            return o;
        }
        // the abstract emptied on "Title & Abstract" and saved, then read after a reload
        const clearAbstract = async (key, label) => {
            await openTA(S.subs[key], key);
            const id = await waitRich('titleAbstract-abstract-control');
            const o = {id};
            if (id) {
                await page.frameLocator(`#${id}_ifr`).locator('body').click();
                await page.keyboard.press('Control+A'); await page.keyboard.press('Delete');
                await sleep(500);
                o.save = await taSave();
                await snap(`${label}-abstract-cleared-save`, {facts: {status: o.save.status, body: o.save.body, errors: o.save.errors, statusLine: o.save.status}}, {png: true});
                await openTA(S.subs[key], key);
                const id2 = await waitRich('titleAbstract-abstract-control');
                o.reloaded = id2 ? await page.evaluate((i) => window.tinymce.get(i).getContent(), id2).catch(() => null) : null;
            }
            return o;
        };
        // ticked (set on screen in the window phase)
        await as(au('mg'), A);
        out.tickedClear = await clearAbstract('sNAB', 'n-00-ticked');
        out.tickedPublish = await publishTry('sNAB', 'n-01-ticked');
        // unticked: the same section, the box cleared on screen
        out.untick = await setSection('K3 NoAbstract', 'n-02-untick', async () => { await box('abstractsNotRequired').uncheck(); });
        await as(au('au'), A);
        if (S.subs.dNAB) { await gotoWizard(S.subs.dNAB); out.untickedReview = await toReview(S.subs.dNAB); await snap('n-03-unticked-review', {facts: {lines: out.untickedReview.abstractLines, messages: out.untickedReview.messages, submit: out.untickedReview.submit}}, {png: true}); }
        await as(au('mg'), A);
        out.untickedClear = await clearAbstract('sNAB2', 'n-04-unticked');
        out.untickedPublish = await publishTry('sNAB2', 'n-05-unticked');
        await visitor();
        fact('nab', out);
    });

    // ================================================================== toc (OJS): the issue page, the home page's "Current Issue", article pages (Settings 7, 9, 10)
    const TOC = () => {
        const t = (s) => (s || '').replace(/\s+/g, ' ').trim();
        const root = document.querySelector('.obj_issue_toc, .current_issue') || document.body;
        const secs = [...root.querySelectorAll('.sections > .section')];
        return secs.map((s) => ({heading: t((s.querySelector(':scope > h2, :scope > h3') || {}).innerText) || null,
            articles: [...s.querySelectorAll('.obj_article_summary')].map((a) => ({title: t((a.querySelector('.title') || {}).innerText), authors: t((a.querySelector('.authors') || {}).innerText) || null, meta: t((a.querySelector('.meta') || {}).innerText)}))}));
    };
    if (on('toc') && isOJS) await sect('toc', async () => {
        const out = {};
        await visitor();
        out.issueStatus = await go(cu(A, '/issue/current'));
        out.issue = await page.evaluate(TOC);
        out.issueUrl = strip(page.url());
        await snap('c-01-issue-page', {toc: out.issue}, {png: true});
        await loc(page, 'Issue page: a section block .obj_issue_toc .sections > .section (heading h2)', page.locator('.obj_issue_toc .sections > .section'));
        out.homeStatus = await go(cu(A, '/'));
        out.home = await page.evaluate(TOC);
        await snap('c-02-home-current-issue', {toc: out.home}, {png: true});
        out.articles = {};
        for (const key of ['pART', 'pHAU', 'pNPR', 'pHTT']) {
            const sid = S.subs[key];
            const st = await go(cu(A, `/article/view/${sid}`));
            out.articles[key] = {status: st, authors: flat(await page.locator('.item.authors, .authors').first().innerText().catch(() => null), 200),
                pfl: await page.locator('[class*="pfl"], [id*="pfl"]').count(), pflText: /Publication Facts/i.test(await page.locator('body').innerText().catch(() => '')),
                sectionLine: flat(await page.locator('.item.issue, .sections, .section').first().innerText().catch(() => null), 200)};
            await snap(`c-03-article-${key}`, {facts: out.articles[key]});
        }
        // the Publication Facts Label plugin's state on this journal (read only)
        await as(au('mg'), A);
        await go(cu(A, '/management/settings/website'));
        const pt = page.getByRole('tab', {name: 'Plugins', exact: true}).first();
        if (await pt.count()) {
            await pt.click(); await idle(page); await sleep(1200);
            out.pflPlugin = await page.locator('tr').filter({hasText: /Publication Facts/i}).evaluateAll((trs) => trs.map((tr) => ({text: tr.innerText.replace(/\s+/g, ' ').trim().slice(0, 160), enabled: (tr.querySelector('input[type=checkbox]') || {}).checked}))).catch(() => null);
            await snap('c-04-plugins-pfl', {facts: out.pflPlugin});
        }
        await visitor();
        fact('toc', out);
    });

    // ================================================================== pfl (OJS): "Will not be peer-reviewed" with the Publication Facts Label plugin on
    if (on('pfl') && isOJS) await sect('pfl', async () => {
        const out = {};
        await as(au('mg'), A);
        await go(cu(A, '/management/settings/website'));
        await page.locator('#plugins-button').first().click();
        await page.locator('#pluginGridContainer tr.gridRow').first().waitFor({timeout: T});
        await idle(page); await sleep(400);
        const box = page.locator('#pluginGridContainer tr.gridRow[id$="-row-pflplugin"]').getByRole('checkbox').first();
        out.before = await box.isChecked();
        if (!out.before) {
            const w = page.waitForResponse((r) => /settings-plugin-grid\/(enable|disable)/.test(r.url()), {timeout: T}).catch(() => null);
            await box.click({noWaitAfter: true}); await sleep(700);
            const dlg = page.locator('[role="dialog"]:visible');
            if (await dlg.count()) { const ok = dlg.last().getByRole('button', {name: /^(OK|Yes)$/}).first(); if (await ok.count()) await ok.click(); }
            const r = await w; out.enable = r ? r.status() : null;
            await sleep(1000);
        }
        await page.reload(); await idle(page);
        await page.locator('#plugins-button').first().click();
        await page.locator('#pluginGridContainer tr.gridRow').first().waitFor({timeout: T}); await sleep(400);
        out.after = await box.isChecked();
        await snap('c-05-pfl-on', {facts: out});
        await visitor();
        out.pages = {};
        for (const key of ['pART', 'pNPR']) {
            const t0 = Date.now();
            const st = await go(cu(A, `/article/view/${S.subs[key]}`));
            out.pages[key] = {status: st, pflBlock: await page.locator('.pflPlugin').count(), pflText: /Publication Facts/i.test(await page.locator('body').innerText().catch(() => '')),
                failed: since(bad, t0), pageErrors: since(consoleMsgs, t0).filter((x) => x.type === 'pageerror')};
            await snap(`c-06-pfl-article-${key}`, {facts: out.pages[key]}, {png: key === 'pART'});
        }
        fact('pfl', out);
    });

    // ================================================================== oai: the harvesters' records, the search, the article's head data (Settings 8, 11, 12; A3)
    if (on('oai') && !isOMP) await sect('oai', async () => {
        const out = {};
        await visitor();
        const oaiGet = async (q, name) => {
            const resp = await page.goto(app.url(`/index.php/${A}/oai?${q}`), {waitUntil: 'domcontentloaded'}).catch(() => null);
            await idle(page).catch(() => {});
            const raw = resp ? await resp.text().catch(() => '') : '';
            const view = await page.content().catch(() => '');
            fs.writeFileSync(path.join(outDir(), `${name}-${app.name}.txt`), /<OAI-PMH/.test(raw) ? raw : view);
            const parsed = /<OAI-PMH/.test(raw) ? parseOaiXml(raw) : parseOai(view);
            await snap(name, {status: resp && resp.status(), parsed: {records: parsed.records.length, sets: parsed.sets, error: parsed.error}});
            return {status: resp && resp.status(), ...parsed};
        };
        out.sets = await oaiGet('verb=ListSets', 'o-01-oai-listsets');
        out.records = await oaiGet('verb=ListRecords&metadataPrefix=oai_dc', 'o-02-oai-listrecords');
        const titles = isOJS ? ['K3 Control Paper', 'K3 Not Indexed Paper', 'K3 Identify Paper'] : ['K3 Control Preprint', 'K3 Not Indexed Preprint', 'K3 Identify Preprint'];
        out.byTitle = Object.fromEntries(titles.map((ti) => [ti, out.records.records.filter((r) => r.title.includes(ti))]));
        titles.push(isOJS ? 'K3 NoAbstract Production' : 'K3 NoAbstract Production');
        // the reader's search, typed as a visitor would
        out.search = {};
        for (const ti of [titles[0], titles[1], titles[3]]) {
            await go(cu(A, '/search/search'));
            const q = page.locator('input[name="query"]').first();
            await q.fill(ti); await q.press('Enter');
            await page.waitForLoadState('domcontentloaded').catch(() => {}); await idle(page); await sleep(800);
            out.search[ti] = {url: strip(page.url()), results: await page.locator('.search_results .obj_article_summary .title, .search_results li .title, .cmp_article_list .title').allInnerTexts().catch(() => []),
                text: flat(await page.locator('.page_search, main, body').first().innerText().catch(() => ''), 600)};
            await snap(`o-03-search-${ti.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`, {facts: out.search[ti]});
        }
        // each article page: the head's metadata (what search engines read) and whether the page shows the type words or the abbreviation
        out.pages = {};
        const keys = isOJS ? ['pART', 'pNIX', 'pIDT'] : ['pPRE', 'pNIX', 'pIDT'];
        for (const key of keys) {
            const st = await go(cu(A, `/${isOJS ? 'article' : 'preprint'}/view/${S.subs[key]}`));
            const meta = await page.locator('head meta[name]').evaluateAll((els) => els.map((e) => [e.getAttribute('name'), (e.getAttribute('content') || '').slice(0, 80)]));
            const body = await page.locator('body').innerText().catch(() => '');
            out.pages[key] = {status: st, metaCount: meta.length, meta: meta.filter((m) => /citation_|DC\.|robots|description/i.test(m[0])),
                showsTypeWords: body.includes('K3 Kind Words'), showsAbbrev: /\b(NIX|IDT|ART|PRE)\b/.test(body), robots: meta.filter((m) => /robots/i.test(m[0]))};
            await snap(`o-04-page-${key}`, {facts: {status: st, metaCount: meta.length, showsTypeWords: out.pages[key].showsTypeWords, showsAbbrev: out.pages[key].showsAbbrev}});
        }
        if (isOJS) {
            await go(cu(A, '/issue/current'));
            const body = await page.locator('body').innerText().catch(() => '');
            out.issuePage = {showsTypeWords: body.includes('K3 Kind Words'), showsAbbrev: /\b(NIX|IDT|ART|HTT|HAU|NPR)\b/.test(body)};
        } else {
            await go(cu(A, '/preprints'));
            const body = await page.locator('body').innerText().catch(() => '');
            out.archivePage = {showsTypeWords: body.includes('K3 Kind Words'), showsAbbrev: /\b(NIX|IDT|PRE)\b/.test(body), lists: await page.locator('.cmp_preprint_list .title, .obj_preprint_summary .title').allInnerTexts().catch(() => [])};
            await snap('o-05-archives', {facts: out.archivePage});
        }
        fact('oai', out);
    });

    // ================================================================== pksearch: does the reader's search answer anything on this install (read only)
    if (on('pksearch') && !isOMP) await sect('pksearch', async () => {
        const out = {};
        await visitor();
        for (const [ctx, q] of [['publicknowledge', 'the'], [A, 'K3'], [A, 'Paper'], [A, 'Seeded']]) {
            await go(cu(ctx, '/search/search'));
            const box = page.locator('input[name="query"]').first();
            await box.fill(q); await box.press('Enter');
            await page.waitForLoadState('domcontentloaded').catch(() => {}); await idle(page); await sleep(600);
            const k = `${ctx === A ? 'scratch' : ctx}:${q}`;
            out[k] = {results: (await page.locator('.search_results .title, .cmp_article_list .title, .obj_article_summary .title, .obj_preprint_summary .title').allInnerTexts().catch(() => [])).map((x) => flat(x, 80)),
                line: flat(((await page.locator('main, .pkp_structure_main, body').first().innerText().catch(() => '')) || '').split('\n').find((l) => /result|No /i.test(l)), 160)};
            await snap(`o-08-search-${k.replace(/[^a-z0-9]+/gi, '-')}`, {facts: out[k]});
        }
        fact('pksearch', out);
    });

    // ================================================================== jobs: the site's background jobs run (support/jobs.js), then the reader's search
    // for the ticked ("K3 NotIndexed") and unticked sections' items (Settings 8, A3); OMP as the control (a press has no such box)
    const drain = () => {
        const {runJobs} = require('../../../support/jobs');
        process.env.PKP_CONFIG_FILE = app.configFile || path.join(app.root, 'config.test.inc.php');
        process.env.TEST_API_KEY = app.testApiKey || process.env.TEST_API_KEY || '';
        const keep = process.env.PLAYWRIGHT_BASE_PORT;
        process.env.PLAYWRIGHT_BASE_PORT = String(app.port);
        try { return runJobs({appRoot: app.root}).split('\n').filter((l) => l.trim()).slice(-6).join(' | '); } catch (e) { return `error: ${String(e.message).slice(0, 300)}`; } finally { process.env.PLAYWRIGHT_BASE_PORT = keep; }
    };
    const searchFor = async (q, label) => {
        await go(cu(A, '/search/search'));
        const box = page.locator('input[name="query"]').first();
        await box.fill(q); await box.press('Enter');
        await page.waitForLoadState('domcontentloaded').catch(() => {}); await idle(page); await sleep(600);
        const o = {q, results: (await page.locator('.search_results .title, .cmp_article_list .title, .obj_article_summary .title, .obj_preprint_summary .title, .obj_monograph_summary .title, .cmp_monographs_list .title').allInnerTexts().catch(() => [])).map((x) => flat(x, 80)),
            line: flat(((await page.locator('main, .pkp_structure_main, body').first().innerText().catch(() => '')) || '').split('\n').find((l) => /result|No |titles were found/i.test(l)), 160)};
        await snap(label, {facts: o});
        return o;
    };
    if (on('jobs')) await sect('jobs', async () => {
        const out = {};
        out.drain = drain();
        log('drain', out.drain);
        await visitor();
        const qs = isOJS ? ['K3 Not Indexed Paper', 'K3 Control Paper', 'K3 Identify Paper', 'Seeded']
            : isOPS ? ['K3 Not Indexed Preprint', 'K3 Control Preprint', 'K3 Identify Preprint', 'Seeded'] : ['K3 Series Book', 'K3 Category Control Book', 'Seeded'];
        out.search = {};
        for (const q of qs) out.search[q] = await searchFor(q, `j-01-search-${q.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`);
        fact('jobs', out);
    });
    // OMP4 at both ends after the jobs: the series with "K3 Cat" ticked, then unticked
    if (on('omp4jobs') && isOMP) await sect('omp4jobs', async () => {
        const out = {};
        const readCats = async (label) => {
            await visitor();
            const o = {};
            for (const [k, p] of [['cat', '/catalog/category/k3cat'], ['other', '/catalog/category/k3other'], ['series', '/catalog/series/k3mono']]) {
                await go(cu(A, p));
                o[k] = {books: await page.locator('.obj_monograph_summary .title, .cmp_monographs_list .title').allInnerTexts().catch(() => []),
                    count: flat(await page.locator('.monograph_count, .count').first().innerText().catch(() => null), 60)};
                await snap(`g-${label}-${k}`, {facts: o[k]});
            }
            o.search = await searchFor('K3 Series Book', `g-${label}-search`);
            return o;
        };
        const setCat = async (want, label) => {
            await as(au('mg'), A);
            await openTab(A);
            await openEdit('Monographs');
            const b = form().getByRole('checkbox', {name: 'K3 Cat', exact: true}).first();
            if (want) await b.check(); else await b.uncheck();
            const r = await pressSave(`g-${label}-save`);
            await page.reload(); await idle(page); await openTab(A);
            return {post: r.post, grid: (await readGrid()).rows.map((x) => x.cells.slice(0, 3))};
        };
        out.withTick = {state: await setCat(true, '10-ticked')};
        out.withTick.drain = drain();
        out.withTick.pages = await readCats('11-ticked-after-jobs');
        out.without = {state: await setCat(false, '12-unticked')};
        out.without.drain = drain();
        out.without.pages = await readCats('13-unticked-after-jobs');
        fact('omp4jobs', out);
    });

    // ================================================================== oai2: each set's "Records" link pressed on the OAI view's set list (the view's own
    // links), per section: which set's record list answers and which fails
    if (on('oai2') && !isOMP) await sect('oai2', async () => {
        const out = {};
        await visitor();
        const t0 = Date.now();
        await go(app.url(`/index.php/${A}/oai?verb=ListSets`));
        await snap('o-06-oai-set-list');
        const hrefs = await page.locator('a.link').evaluateAll((els) => els.filter((e) => e.textContent.trim() === 'Records').map((e) => e.getAttribute('href')));
        for (const h of hrefs) {
            const set = (h.match(/set=([^&]+)/) || [])[1];
            await go(app.url(`/index.php/${A}/oai?verb=ListSets`));
            const link = page.locator(`a.link[href="${h}"]`).first();
            const w = page.waitForResponse((r) => r.url().includes('verb=ListRecords'), {timeout: T}).catch(() => null);
            await link.click().catch(() => {});
            const r = await w;
            await idle(page).catch(() => {});
            const txt = (await page.locator('body').innerText().catch(() => '')) || '';
            out[set] = {status: r ? r.status() : null, records: (txt.match(/OAI Record: /g) || []).length, error: flat((txt.match(/Error Code[^\n]*\n?[^\n]*/) || [])[0], 160), body: r && r.status() >= 500 ? flat(txt, 200) : undefined};
            log(set, JSON.stringify(out[set]));
        }
        out.failed = since(bad, t0).map((x) => [x.status, x.url.replace(/.*oai/, 'oai')]);
        await snap('o-07-oai-set-records', {facts: out});
        fact('oai2', out);
    });

    // ================================================================== reviewer (OJS): "Add Reviewer" in a section with a review form, per level (Settings 6)
    if (on('reviewer') && isOJS) await sect('reviewer', async () => {
        const out = {};
        const addReviewer = async (sid, label) => {
            await go(wfUrl(sid));
            await page.getByRole('link', {name: /Review Round 1|Round 1/}).first().click({timeout: 10000}).catch(() => {});
            await idle(page); await sleep(800);
            await page.getByRole('button', {name: 'Add Reviewer', exact: true}).click();
            const d = page.getByRole('dialog').filter({hasText: 'Add Reviewer'}).last(); await d.waitFor({timeout: T});
            const entry = d.locator('.listPanel__item').filter({hasText: 'Rob Spare'}).first(); await entry.waitFor({timeout: T});
            await page.waitForFunction(() => { const ta = document.querySelector('textarea[name="personalMessage"]'); const mce = window.tinyMCE || window.tinymce; return !!(ta && mce?.get(ta.id)?.initialized); }, null, {timeout: T}).catch(() => {});
            await entry.getByRole('button', {name: /Select/}).first().click(); await idle(page);
            await d.locator('#regularReviewerForm').waitFor({state: 'visible', timeout: T});
            await sleep(600);
            const f = await d.locator('#regularReviewerForm').evaluate((x) => { const sel = x.querySelector('select[name="reviewFormId"]'); return sel ? {selected: sel.options[sel.selectedIndex].text, options: [...sel.options].map((o) => o.text)} : null; });
            await snap(label, {facts: f}, {png: true});
            await d.getByRole('button', {name: 'Close'}).first().click().catch(() => {});
            await sleep(1200);
            return f;
        };
        await as(au('mg'), A);
        out.mgForm = await addReviewer(S.subs.rFRM, 'v-01-mg-add-reviewer-form-section');
        out.mgArt = await addReviewer(S.subs.rART, 'v-02-mg-add-reviewer-articles');
        await loc(page, 'Add Reviewer window: "Review Form" list #regularReviewerForm select[name="reviewFormId"]', page.locator('#regularReviewerForm select[name="reviewFormId"]'));
        await as(au('se'), A);
        out.seForm = await addReviewer(S.subs.rFRM, 'v-03-se-add-reviewer-form-section');
        await visitor();
        fact('reviewer', out);
    });

    // ================================================================== endrole (td4, all apps): the ticked user's role ended on Users & Roles
    if (on('endrole')) await sect('endrole', async () => {
        const out = {};
        // ENDCTX=D (OMP): the omptick press, whose "K3 Tick" series already ticks Tod Twin (Series editor + Author)
        const useD = process.env.ENDCTX === 'D' && S.D;
        const C = useD ? S.D.path : S.C.path;
        const who = useD ? 'Tod Twin' : 'Tia Twin';
        const F = useD ? 'endD' : 'end';
        const roleName = isOJS ? 'Section editor' : isOMP ? 'Series editor' : 'Moderator';
        await as(au('mg', C), C);
        await go(cu(C, '/management/settings/context'));
        await page.getByRole('tab', {name: TAB, exact: true}).first().click(); await idle(page);
        await grid().waitFor({timeout: T}); await sleep(500);
        let first = useD ? 'K3 Tick' : isOJS ? 'Articles' : 'Preprints';
        if (isOMP && !useD) {
            first = 'K3 End';
            if (!S.endSeries) {
                await openCreate();
                await form().locator('input[name="title[en]"]').fill('K3 End');
                await form().locator('input[name="path"]').fill('k3end');
                await pressSave(`${useD ? 'ed' : 'e'}-00-omp-add-series`);
                S.endSeries = true; save();
            }
        }
        if (!S[`${F}Ticked`] && !useD) {
            await openEdit(first);
            out.boxesBefore = (await readForm()).fields.filter((x) => /^subEditors/.test(x.name)).map((x) => [x.label, x.checked]);
            await form().getByRole('checkbox', {name: new RegExp(who)}).first().check();
            out.tick = (await pressSave(`${useD ? 'ed' : 'e'}-01-tick-tia`)).post;
            S[`${F}Ticked`] = true; save();
        }
        out.gridTicked = (await readGrid()).rows.map((r) => r.cells.slice(0, isOMP ? 3 : 2));
        await snap(`${useD ? 'ed' : 'e'}-02-grid-ticked`, {grid: out.gridTicked});
        if (!S[`${F}Removed`]) {
            await go(cu(C, '/management/settings/access'));
            await sleep(1500);
            const row = page.locator('tr').filter({hasText: who}).first();
            await row.waitFor({timeout: T});
            await row.getByRole('button').last().click(); await sleep(500);
            await page.getByRole('menuitem', {name: 'Edit'}).first().click();
            await page.waitForURL(/settings\/user\/\d+/, {timeout: T}).catch(() => {});
            await idle(page); await sleep(1000);
            await snap(`${useD ? 'ed' : 'e'}-03-user-page`, {}, {png: true});
            const t0 = Date.now();
            const rm = page.locator('tr, [role=row], .pkpTable__row, li, div').filter({hasText: new RegExp(`^\\s*${roleName}`)}).getByRole('button', {name: /Remove Role/}).first();
            await rm.click(); await sleep(1000);
            out.ask = flat(await top().innerText().catch(() => null), 400);
            const yes = top().getByRole('button', {name: /^(Remove|Remove Role|OK|Yes|Confirm)$/}).first();
            if (await yes.count()) await yes.click();
            await sleep(1500); await idle(page);
            out.removed = {notices: await noticesSince(t0), failed: since(bad, t0), main: await mainText(900)};
            await snap(`${useD ? 'ed' : 'e'}-04-role-removed`, {facts: out.removed}, {png: true});
            S[`${F}Removed`] = true; save();
        }
        await go(cu(C, '/management/settings/context'));
        await page.getByRole('tab', {name: TAB, exact: true}).first().click(); await idle(page);
        await grid().waitFor({timeout: T}); await sleep(500);
        out.gridAfterEnd = (await readGrid()).rows.map((r) => r.cells.slice(0, isOMP ? 3 : 2));
        await openEdit(first);
        out.boxesAfterEnd = (await readForm()).fields.filter((x) => /^subEditors/.test(x.name)).map((x) => [x.label, x.checked]);
        await snap(`${useD ? 'ed' : 'e'}-05-window-after-end`, {facts: {grid: out.gridAfterEnd, boxes: out.boxesAfterEnd}});
        out.resave = (await pressSave(`${useD ? 'ed' : 'e'}-06-resave`)).post;
        out.gridAfterSave = (await readGrid()).rows.map((r) => r.cells.slice(0, isOMP ? 3 : 2));
        await page.reload(); await idle(page);
        await page.getByRole('tab', {name: TAB, exact: true}).first().click(); await idle(page);
        await grid().waitFor({timeout: T}); await sleep(500);
        out.gridAfterReload = (await readGrid()).rows.map((r) => r.cells.slice(0, isOMP ? 3 : 2));
        await snap(`${useD ? 'ed' : 'e'}-07-grid-after-resave-reload`, {grid: out.gridAfterReload});
        await visitor();
        fact(useD ? 'endroleD' : 'endrole', out);
    });

    // ================================================================== omptick (OMP): who a series' "Editorial Assignments" keeps: a Series editor who
    // also holds the Author role, beside one who holds only the Series editor role (the endrole run's "None" re-read)
    if (on('omptick') && isOMP) await sect('omptick', async () => {
        const out = {};
        if (!S.D) {
            const p = `${S.t}d`;
            await app.api.createContext({tag: p, context: {name: `U17 K3 omp D ${S.t}`},
                users: [{username: `${p}mg`, roles: ['manager'], givenName: 'Dan', familyName: 'Manager'}, {username: `${p}tw`, roles: ['sectionEditor', 'author'], givenName: 'Tod', familyName: 'Twin'},
                    {username: `${p}se`, roles: ['sectionEditor'], givenName: 'Sol', familyName: 'Single'}]});
            S.D = {path: p}; save();
        }
        const D = S.D.path;
        await as(`${D}mg`, D);
        await openTab(D);
        if (!S.dSeries) {
            await openCreate();
            await form().locator('input[name="title[en]"]').fill('K3 Tick');
            await form().locator('input[name="path"]').fill('k3tick');
            out.addBoxes = (await readForm()).fields.filter((x) => /^subEditors/.test(x.name)).map((x) => x.label);
            await form().getByRole('checkbox', {name: /Tod Twin/}).first().check();
            await form().getByRole('checkbox', {name: /Sol Single/}).first().check();
            out.addSave = (await pressSave('m-01-add-both-ticked')).post;
            S.dSeries = true; save();
        }
        out.gridAfterAdd = (await readGrid()).rows.map((r) => r.cells.slice(0, 3));
        await page.reload(); await idle(page); await openTab(D);
        out.gridReload = (await readGrid()).rows.map((r) => r.cells.slice(0, 3));
        await openEdit('K3 Tick');
        out.editBoxes = (await readForm()).fields.filter((x) => /^subEditors/.test(x.name)).map((x) => [x.label, x.checked]);
        await snap('m-02-edit-window', {facts: out});
        await closeWindow();
        await visitor();
        fact('omptick', out);
    });

    // ================================================================== assign (Rule 8): a submission arriving through the wizard in a section with ticked editors
    if (on('assign')) await sect('assign', async () => {
        const out = {};
        const sid = S.subs.dASN;
        if (!sid) { fact('assign', {skipped: 'no draft'}); return; }
        if (!S.asnSubmitted) {
            await as(au('au'), A);
            await gotoWizard(sid);
            if (isOPS && !S.asnGalley) {
                const W = require(path.join(REPO, 'apps/ops/playwright/pages/SubmissionWizardPages.js'));
                await W.addGalleyFile(page, {file: path.join(REPO, 'apps/ops/playwright/fixtures/files/preprint.pdf')});
                S.asnGalley = true; save();
            }
            out.review = await toReview(sid);
            await snap('a-01-arriving-review', {facts: {lines: out.review.abstractLines, submit: out.review.submit}});
            const submit = page.locator('.submissionWizard__footer').getByRole('button', {name: 'Submit', exact: true});
            if (await submit.isEnabled().catch(() => false)) {
                await submit.click();
                const d = page.getByRole('dialog').last();
                await d.waitFor({timeout: T});
                out.confirm = flat(await d.innerText().catch(() => ''), 400);
                await d.getByRole('button', {name: 'Submit', exact: true}).click();
                await page.getByRole('heading', {name: /Submission complete/}).waitFor({timeout: 45000}).catch(() => {});
                await snap('a-02-complete');
                S.asnSubmitted = true; save();
            }
        }
        await as(au('mg'), A);
        await go(wfUrl(sid)); await sleep(2500); await idle(page);
        out.participants = await page.evaluate(() => {
            const vis = (e) => e.getClientRects().length > 0;
            const dlg = [...document.querySelectorAll('[role=dialog]')].filter(vis)[0] || document.body;
            const h = [...dlg.querySelectorAll('h1,h2,h3,h4')].filter(vis).find((x) => /^participants$/i.test(x.textContent.trim()));
            if (!h) return {present: false};
            let b = h.parentElement;
            for (let i = 0; i < 4 && b && !b.querySelector('ul, [role=list]'); i++) b = b.parentElement;
            return {present: true, items: b ? [...b.querySelectorAll('li')].filter(vis).map((li) => li.innerText.split('\n').map((x) => x.trim()).filter(Boolean).join('/')) : []};
        });
        await snap('a-03-participants', {participants: out.participants}, {png: true});
        await visitor();
        fact('assign', out);
    });

    // ================================================================== omp4 (OMP): the series' "Categories" boxes, before and after
    if (on('omp4') && isOMP) await sect('omp4', async () => {
        const out = {};
        const readPublic = async (label) => {
            await visitor();
            const o = {};
            for (const [k, p] of [['cat', '/catalog/category/k3cat'], ['other', '/catalog/category/k3other'], ['catalog', '/catalog'], ['series', '/catalog/series/k3mono'], ['book', `/catalog/book/${S.subs.pBook}`]]) {
                const st = await go(cu(A, p));
                o[k] = {status: st, h1: flat(await page.locator('h1').first().innerText().catch(() => null), 120),
                    books: await page.locator('.obj_monograph_summary .title, .cmp_monographs_list .title').allInnerTexts().catch(() => []),
                    count: flat(await page.locator('.monograph_count, .count').first().innerText().catch(() => null), 60),
                    categories: flat(await page.locator('.item.categories, .categories').first().innerText().catch(() => null), 200),
                    text: flat(await page.locator('.pkp_structure_main, main, body').first().innerText().catch(() => ''), 500)};
                await snap(`g-${label}-${k}`, {facts: o[k]});
            }
            return o;
        };
        out.before = await readPublic('01-before');
        await as(au('mg'), A);
        await openTab(A);
        if (!S.catTicked) {
            await openEdit('Monographs');
            out.boxes = (await readForm()).fields.filter((x) => x.name === 'categories[]').map((x) => [x.label, x.checked]);
            await form().getByRole('checkbox', {name: 'K3 Cat', exact: true}).first().check();
            out.save = (await pressSave('g-02-tick-category')).post;
            S.catTicked = true; save();
        }
        await page.reload(); await idle(page); await openTab(A);
        out.grid = await readGrid();
        await snap('g-03-grid-categories', {grid: out.grid}, {png: true});
        await openEdit('Monographs');
        out.boxesAfter = (await readForm()).fields.filter((x) => x.name === 'categories[]').map((x) => [x.label, x.checked]);
        await closeWindow();
        // the book's own "Catalog Entry" categories (read only)
        await go(cu(A, `/dashboard/editorial?workflowSubmissionId=${S.subs.pBook}`)); await sleep(2000);
        const ce = wf().getByRole('link', {name: 'Catalog Entry', exact: true}).first();
        if (await ce.count()) { await ce.click(); await idle(page); await sleep(1500); }
        out.bookCatalogEntry = flat(await wf().innerText().catch(() => ''), 1500);
        await snap('g-04-book-catalog-entry', {facts: {text: out.bookCatalogEntry}});
        out.after = await readPublic('05-after');
        fact('omp4', out);
    });

    // ================================================================== export (OJS): the journal's own export file (A3's last clause)
    if (on('export') && !isOMP) await sect('export', async () => {
        const out = {};
        await as(au('mg'), A);
        await go(cu(A, '/management/tools'));
        await sleep(800);
        out.tabs = await page.getByRole('tab').allInnerTexts().catch(() => []);
        const ie = page.getByRole('tab', {name: /Import\/Export/i}).first();
        if (await ie.count()) { await ie.click(); await idle(page); await sleep(1200); }
        out.links = (await page.locator('main a:visible, [role=tabpanel] a:visible').allInnerTexts().catch(() => [])).map((x) => flat(x, 60)).slice(0, 40);
        await snap('x-01-importexport', {facts: {tabs: out.tabs, links: out.links}});
        const link = page.getByRole('link', {name: /Native XML/i}).first();
        out.linkCount = await link.count();
        if (out.linkCount) {
            await link.click(); await idle(page); await sleep(1200);
            await snap('x-02-native', {}, {png: true});
            out.nativeTabs = await page.getByRole('tab').allInnerTexts().catch(() => []);
            const tab = page.getByRole('tab', {name: isOJS ? /Export Issues/i : /^Export/i}).first();
            out.tabCount = await tab.count();
            if (out.tabCount) {
                await tab.click(); await idle(page); await sleep(1500);
                await snap('x-03-export-issues-tab', {}, {png: true});
                const boxes = page.locator('input[type=checkbox]:visible');
                out.boxes = await boxes.count();
                if (out.boxes) await boxes.last().check();
                if (!isOJS) {
                    // the preprint list: every row's box ticked, then the list's export button
                    const rows = page.locator('input[type=checkbox]:visible');
                    for (let i = 0; i < await rows.count(); i++) await rows.nth(i).check().catch(() => {});
                    out.buttons = await page.getByRole('button').allInnerTexts().catch(() => []);
                }
                const btn = page.getByRole('button', {name: isOJS ? /Export Issues/i : /^Export/i}).last();
                await btn.click().catch(() => {});
                const dlBtn = page.getByRole('button', {name: 'Download Exported File'}).or(page.getByRole('link', {name: 'Download Exported File'})).first();
                await dlBtn.waitFor({state: 'visible', timeout: 60000}).catch(() => {});
                await snap('x-03b-export-results', {}, {png: true});
                const dl = page.waitForEvent('download', {timeout: 60000}).catch(() => null);
                await dlBtn.click().catch(() => {});
                const d = await dl;
                if (d) {
                    const fp = path.join(outDir(), `x-04-issue-export-${app.name}.xml`);
                    await d.saveAs(fp);
                    const xml = fs.readFileSync(fp, 'utf8');
                    out.sections = [...xml.matchAll(/<section [^>]*>/g)].map((m) => m[0].slice(0, 300));
                    out.sectionRefs = [...new Set([...xml.matchAll(/section_ref="([^"]*)"/g)].map((m) => m[1]))];
                    out.metaIndexedAnywhere = /meta_indexed/.test(xml);
                    out.size = xml.length;
                } else {
                    await sleep(3000);
                    out.noDownload = await mainText(800);
                    await snap('x-04-no-download', {}, {png: true});
                }
            }
        }
        await visitor();
        fact('export', out);
    });

    await close();
});
