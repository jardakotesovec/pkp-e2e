// U26 on stable-3_5_0, claim check K2, part `old` (required by k2.js, which says how to run it): Rule 17's
// old addresses and footnote o's two legacy grids, typed into the address bar by every reader. Adapted
// from `main`'s kept shared/playwright/checks/U26/UA1/ua1.js to this version's screens (the reviewer's
// recommendation list, the editor's "Read Review"), in one pass per run.
//
// OJS, OMP: a scratch context whose default review mode is "Open" (ed Journal/Press editor, au and au2
// Authors, rv1), and one on the install's anonymous default (its own ed, au, rv1). Submissions:
//   A  (au)  round 1, rv1 invited. On screen: rv1 accepts, uploads a reviewer file, submits; ed records
//            "Request Revisions" with that file attached to the letter; au uploads a revised file.
//   B  (au2) seeded: rv1 completed, requestRevisions (au2 is "an Author of another submission").
//   D  (anonymous context) round 1, rv1 invited. On screen: rv1 uploads a file and submits; au types the
//            attachments grid's address; ed records "Request Revisions" with the file attached; au again.
//   I  (OMP) seeded Internal Review with requestRevisionsInternal; au uploads a revised file.
// OPS: a scratch server (mgr, au, au2) and one preprint in Production.
// Every request the browser sends to a component, the API or authorDashboard is kept per phase; the
// typed addresses are read with the server log's lines since the address was typed.
const path = require('path');
const {launch, signIn, signOut, screen, shot, record, idle, tag, serverLog} = require('../../../probe');

const T = 30_000;
const strip = (url) => String(url).replace(/^https?:\/\/[^/]+/, '').replace(/csrfToken=[^&]*/, 'csrfToken=…');

// A legacy grid's JSON answer, its `content` read as markup.
const parseGrid = (html) => {
    const d = new DOMParser().parseFromString(html, 'text/html');
    const t = (e) => (e ? e.textContent.replace(/\s+/g, ' ').trim() : null);
    d.querySelectorAll('script').forEach((s) => s.remove());
    return {
        gridIds: [...d.querySelectorAll('.pkp_controllers_grid')].map((g) => g.id.replace(/-[0-9a-f]{10,}$/, '')),
        title: t(d.querySelector('.header h4') || d.querySelector('h4')),
        headerActions: [...d.querySelectorAll('.header a')].map(t).filter(Boolean),
        columns: [...d.querySelectorAll('thead th')].map(t),
        rows: [...d.querySelectorAll('tr.gridRow')].map((r) => t(r).slice(0, 200)),
        rowLinks: [...d.querySelectorAll('tr.gridRow a, tr.row_controls a')].map(t).filter(Boolean),
        empty: [...d.querySelectorAll('tbody.empty')].map(t),
    };
};

module.exports = async function oldPart(app, L, K) {
    const {fact, check, flat} = L;
    const {sleep, eq, has} = K;
    const isOMP = app.name === 'omp';
    const isOPS = app.name === 'ops';
    const RUN = L.RUN;
    const P = require(path.join(L.REPO, 'apps/ojs/playwright/pages/ReviewStagePages.js'));
    const t = tag('u26vk2o');
    let ct = t;
    const u = (k) => `${ct}${k}`;
    const ctx = (p) => app.url(`/index.php/${ct}${p}`);
    const slog = serverLog(app);

    const {page, close} = await launch(app);
    const nativeDialogs = [];
    page.on('dialog', async (d) => { nativeDialogs.push({type: d.type(), message: d.message()}); await d.accept().catch(() => {}); });
    const traffic = [];
    let phase = 'start';
    page.context().on('response', (r) => {
        const url = r.url();
        if (!/\$\$\$call\$\$\$|\/api\/v1\/|authorDashboard/.test(url)) return;
        traffic.push({phase, method: r.request().method(), status: r.status(), path: strip(url)});
    });
    const oldGridRequests = () => traffic.filter((x) => !x.phase.startsWith('typed:') && /author-review-(attachments|revisions)-grid|authorDashboard\/reviewRoundInfo/i.test(x.path)).map((x) => `${x.phase}: ${x.method} ${x.status} ${x.path}`);
    const snap = async (name) => {
        let s;
        try { s = await screen(page); } catch (e) { s = {url: page.url(), error: flat(e.message, 200)}; }
        record(`old-${name}`, s);
        await shot(page, `old-${name}`).catch(() => {});
        return s;
    };
    const signInAs = async (k) => { await signIn(page, u(k), {contextPath: ct}); await idle(page); };
    const openWorkflow = async (view, id, round) => {
        await page.goto('about:blank');
        await page.goto(ctx(`/dashboard/${view}?workflowSubmissionId=${id}${round ? `&workflowMenuKey=workflow_${round.stageId}_${round.id}` : ''}`));
        await page.getByRole('heading', {name: /^Workflow:/}).first().waitFor({timeout: 45000}).catch(() => {});
        await idle(page);
    };

    async function typed(label, who, address) {
        phase = `typed:${label}`;
        await page.goto('about:blank');
        const from = slog.mark();
        let resp = null; let error = null;
        try { resp = await page.goto(address, {waitUntil: 'load', timeout: 60_000}); } catch (e) { error = flat(e.message, 240); }
        await Promise.race([idle(page), sleep(30_000)]);
        const chain = [];
        for (let rq = resp && resp.request(); rq; rq = rq.redirectedFrom()) chain.unshift(strip(rq.url()));
        const s = await snap(`typed-${label}`);
        const body = await page.locator('body').innerText().catch(() => null);
        const raw = resp ? await resp.text().catch(() => null) : null;
        let json = null;
        try { json = JSON.parse(raw); } catch { /* not JSON */ }
        let grid = null;
        if (json && typeof json.content === 'string' && json.content.includes('<')) grid = await page.evaluate(parseGrid, json.content).catch((e) => ({error: flat(e.message)}));
        // The workflow window: its side-modal header, and its stage heading's source text (textContent:
        // innerText follows the heading's upper-casing). A preprint's publication pages are headed otherwise.
        const workflowOpen = await page.locator('[data-cy="sidemodal-header"]').count().catch(() => 0);
        const workflow = workflowOpen ? await page.locator('[role=dialog] h2').first().evaluate((h) => h.textContent.trim().replace(/\s+/g, ' ')).catch(() => '(open)') : null;
        const out = {
            as: who, asked: strip(address), status: resp ? resp.status() : null,
            redirects: chain.length > 1 ? chain : null, landed: strip(page.url()), title: s.title, screen: flat(body, 300),
            json: json ? {status: json.status, content: typeof json.content === 'string' && !json.content.includes('<') ? json.content.slice(0, 300) : (json.content ? '[markup]' : json.content)} : null,
            grid, workflow, workflowOpen, server: slog.since(from).slice(0, 6).map((l) => flat(l, 300)), error,
        };
        fact(`typed-${label}`, out);
        return out;
    }
    const call = (component, q) => ctx(`/$$$call$$$/${component}/fetch-grid?${q}`);
    const REVISIONS = 'grid/files/review/author-review-revisions-grid';
    const ATTACHMENTS = 'grid/files/attachment/author-review-attachments-grid';
    const gq = (sub, round) => `submissionId=${sub.id}&stageId=${round ? round.stageId : 5}${round ? `&reviewRoundId=${round.id}` : ''}`;
    const is404 = (o) => o.status === 404 && /^404 Not Found$/.test(o.screen || '') && !o.workflow;
    const grids = async (who, key, sub, round) => ({
        rev: await typed(`${who}-${key}-grid-revisions`, who, call(REVISIONS, gq(sub, round))),
        att: await typed(`${who}-${key}-grid-attachments`, who, call(ATTACHMENTS, gq(sub, round))),
    });
    const NO_STAGE = "You don't currently have access to that stage of the workflow.";
    const NO_OP = 'The current role does not have access to this operation.';

    try {
        // ---------------------------------------------------------------- OPS
        if (isOPS) {
            await app.api.createContext({tag: t, users: [
                {username: u('mgr'), roles: ['manager']}, {username: u('au'), roles: ['author'], givenName: 'Alex', familyName: 'Authorson'},
                {username: u('au2'), roles: ['author'], givenName: 'Bea', familyName: 'Otherauthor'}]});
            const s = await app.api.createSubmission({tag: `${t}p`, context: t, submitter: u('au'), title: `P preprint ${t}`});
            const Pp = {id: s.submissionId};
            fact('ops-state', {t, id: Pp.id});
            await signInAs('au');
            const sub = await typed('au-P-old-submission', 'au', ctx(`/authorDashboard/submission/${Pp.id}`));
            check('ops.submission', 'OPS: `authorDashboard/submission/{id}` lands the preprint\'s Author on My Submissions with the workflow open', {landed: sub.landed, workflow: sub.workflow},
                /\/dashboard\/mySubmissions\?/.test(sub.landed) && sub.landed.includes(`workflowSubmissionId=${Pp.id}`) && sub.workflowOpen > 0);
            const forms = {id: `/authorDashboard/reviewRoundInfo/${Pp.id}`, noid: '/authorDashboard/reviewRoundInfo', query: `/authorDashboard/reviewRoundInfo?submissionId=${Pp.id}&stageId=5`, lang: `/en/authorDashboard/reviewRoundInfo/${Pp.id}`};
            for (const [k, p] of Object.entries(forms)) {
                const o = await typed(`au-P-old-round-${k}`, 'au', ctx(p));
                check(`ops.round.${k}`, `OPS: the old tab address (${k}) answers the preprint's Author a bare "404 Not Found" page`, {status: o.status, screen: o.screen, landed: o.landed, server: o.server}, is404(o));
            }
            const g = await grids('au', 'P', Pp, null);
            check('ops.grids.au', 'OPS: the preprint\'s Author gets "Invalid review round." from both grids', {rev: g.rev.json, att: g.att.json}, g.rev.json && g.rev.json.content === 'Invalid review round.' && g.att.json && g.att.json.content === 'Invalid review round.');
            for (const who of ['au2', 'mgr', 'anon']) {
                if (who === 'anon') await signOut(page); else await signInAs(who);
                const o = await typed(`${who}-P-old-round-id`, who, ctx(forms.id));
                check(`ops.round.${who}`, `OPS: with the preprint's id, ${who} gets the same 404 page`, {status: o.status, screen: o.screen, landed: o.landed}, is404(o));
                const gg = await grids(who, 'P', Pp, null);
                const want = who === 'mgr' ? [NO_OP, 'Invalid review round.'] : [NO_STAGE, NO_STAGE];
                check(`ops.grids.${who}`, `OPS: ${who} gets ${JSON.stringify(want)} from the revisions and attachments grids`, {rev: gg.rev.json, att: gg.att.json}, gg.rev.json && gg.rev.json.content === want[0] && gg.att.json && gg.att.json.content === want[1]);
            }
            return;
        }

        // ---------------------------------------------------------------- OJS, OMP: seed
        const send = isOMP ? ['skipInternalReview'] : ['sendExternalReview'];
        const stage = isOMP ? {stage: 'external'} : {};
        const comp = isOMP ? 'Book Manuscript' : 'Article Text';
        const RV_FILE = `u26vk2-reviewer-${RUN}.txt`, REV_FILE = `u26vk2-revision-${RUN}.txt`, ANON_FILE = `u26vk2-anon-reviewer-${RUN}.txt`, INT_FILE = `u26vk2-internal-${RUN}.txt`;
        const textFile = (name) => ({name, mimeType: 'text/plain', buffer: Buffer.from(`u26vk2 ${name}`)});
        await app.api.createContext({tag: t, review: {defaultReviewMode: 'open'}, users: [
            {username: u('ed'), roles: ['editor'], givenName: 'Eda', familyName: 'Editorson'},
            {username: u('au'), roles: ['author'], givenName: 'Alex', familyName: 'Authorson'},
            {username: u('au2'), roles: ['author'], givenName: 'Bea', familyName: 'Otherauthor'},
            {username: u('rv1'), roles: ['externalReviewer'], givenName: 'Rhea', familyName: 'Oneview'}]});
        const parts = [{username: u('ed'), role: 'editor'}];
        const mk = async (key, c, submitter, body) => {
            const s = await app.api.createSubmission({tag: `${c}${key.toLowerCase()}`, context: c, submitter, title: `${key} round ${c}`, files: [{file: 'article.pdf'}], ...body});
            return {id: s.submissionId, rounds: s.reviewRounds, title: `${key} round ${c}`};
        };
        const A = await mk('A', t, u('au'), {participants: parts, decisions: send, reviewRounds: [{...stage, files: [{file: 'notes.md'}], reviewers: [{username: u('rv1'), status: 'invited'}]}]});
        const Bs = await mk('B', t, u('au2'), {participants: parts, decisions: [...send, 'requestRevisions'], reviewRounds: [{...stage, reviewers: [{username: u('rv1'), status: 'completed'}]}]});
        let I = null;
        if (isOMP) I = await mk('I', t, u('au'), {participants: parts, decisions: ['sendInternalReview', 'requestRevisionsInternal'], reviewRounds: [{stage: 'internal', reviewers: []}]}).catch((e) => { fact('seed-I-refused', flat(e.message, 400)); return null; });
        const tn = `${t}n`;
        await app.api.createContext({tag: tn, users: [
            {username: `${tn}ed`, roles: ['editor'], givenName: 'Edna', familyName: 'Anoneditor'},
            {username: `${tn}au`, roles: ['author'], givenName: 'Arno', familyName: 'Anonauthor'},
            {username: `${tn}rv1`, roles: ['externalReviewer'], givenName: 'Runa', familyName: 'Anonview'}]});
        const D = await mk('D', tn, `${tn}au`, {participants: [{username: `${tn}ed`, role: 'editor'}], decisions: send, reviewRounds: [{...stage, files: [{file: 'notes.md'}], reviewers: [{username: `${tn}rv1`, status: 'invited'}]}]});
        fact('old-state', {t, tn, A, B: Bs, I, D});
        const roundOf = (s) => s.rounds[0];

        // The editor's "Request Revisions" with the reviewer's file attached to the author's letter.
        async function requestWithAttachment(key, sub, file) {
            phase = `${key}-decision`;
            await signInAs('ed');
            await openWorkflow('editorial', sub.id, roundOf(sub));
            await snap(`${key}-ed-round-before-decision`);
            await page.getByRole('button', {name: 'Request Revisions', exact: true}).click();
            const win = page.getByRole('dialog').filter({hasText: 'Require New Review Round'});
            await win.getByRole('button', {name: 'Next', exact: true}).click();
            await page.waitForURL(/decision\/record/, {timeout: 45000});
            await page.locator('.composer__loadingTemplateMask').first().waitFor({state: 'detached', timeout: 30000}).catch(() => {});
            await idle(page);
            await page.locator('.tox-tbtn:visible').filter({hasText: /^Attach Files$/}).first().click();
            const attach = page.getByRole('dialog', {name: 'Attach Files', exact: true});
            await attach.waitFor({timeout: T});
            await attach.getByRole('button', {name: 'Attach Review Files', exact: true}).click();
            const rf = page.getByRole('dialog', {name: 'Review Files', exact: true});
            await rf.getByRole('button', {name: 'Back', exact: true}).waitFor({timeout: T});
            await sleep(800);
            await snap(`${key}-decision-attach-review-files`);
            await rf.locator('label').filter({hasText: file}).locator('input[type="checkbox"]').check({force: true});
            await rf.getByRole('button', {name: 'Attach Selected', exact: true}).click();
            await rf.waitFor({state: 'hidden', timeout: T});
            const chips = await page.locator('.composer__attachment').allInnerTexts().then((x) => x.map((y) => flat(y, 80)));
            const d = new P.DecisionPage(page);
            for (let i = 0; i < 5 && !(await d.recordButton.isVisible().catch(() => false)); i++) {
                await d.awaitComposerLoaded(); await d.continueButton.click(); await idle(page);
            }
            await d.record();
            fact(`${key}-decision`, {chips});
        }

        // ---------------------------------------------------------------- A: the review, the letter, the revised file
        await L.sect('build-A', async () => {
            await signInAs('rv1');
            phase = 'A-reviewer';
            await K.reviewerDo({page, ctx: ct}, A.id, {file: RV_FILE, comments: `u26vk2 shared remark ${t}`, label: 'old-A-reviewer-step3'});
            await requestWithAttachment('A', A, RV_FILE);
            await signInAs('au');
            phase = 'A-author-round';
            await openWorkflow('mySubmissions', A.id, roundOf(A));
            await snap('A-author-round');
            await page.getByRole('button', {name: 'Upload revisions', exact: true}).click();
            await P.uploadViaWizard(page, {genre: comp, file: textFile(REV_FILE)});
            await snap('A-author-revised');
        });
        // ---------------------------------------------------------------- D: anonymous review, before and after the letter
        await L.sect('build-D', async () => {
            ct = tn;
            await signInAs('rv1');
            phase = 'D-reviewer';
            await K.reviewerDo({page, ctx: ct}, D.id, {file: ANON_FILE, comments: `u26vk2 anonymous remark ${tn}`});
            await signInAs('au');
            const d0 = await typed('au-D0-grid-attachments', 'au', call(ATTACHMENTS, gq(D, roundOf(D))));
            check('o.anon.before', 'attachments grid before a letter: "No Files", even with the reviewer\'s file submitted', d0.grid, d0.grid && d0.grid.rows.length === 0 && has(d0.grid.empty, 'No Files'));
            await requestWithAttachment('D', D, ANON_FILE);
            await signInAs('au');
            const d1 = await typed('au-D-grid-attachments', 'au', call(ATTACHMENTS, gq(D, roundOf(D))));
            check('o.anon.after', 'anonymous review, after the letter: a row of the file\'s number, name and date, no reviewer\'s name', d1.grid,
                d1.grid && has(d1.grid.rows, ANON_FILE) && !has(d1.grid.rows, 'Anonview') && !has(d1.grid.rows, 'Runa'));
            const dr = await typed('au-D-grid-revisions', 'au', call(REVISIONS, gq(D, roundOf(D))));
            check('o.revisions.none', 'revisions grid on a round without a revised file: "No Files"', dr.grid, dr.grid && dr.grid.rows.length === 0 && has(dr.grid.empty, 'No Files'));
            const o = await typed('au-D-old-round-id', 'au', ctx(`/authorDashboard/reviewRoundInfo/${D.id}`));
            check('o.anon.404', 'the Author of a submission under anonymous review gets the same 404 page', {status: o.status, screen: o.screen}, is404(o));
            ct = t;
        });
        ct = t;
        // ---------------------------------------------------------------- I (OMP): an Internal Review round
        if (I) await L.sect('build-I', async () => {
            await signInAs('au');
            phase = 'I-author-round';
            await openWorkflow('mySubmissions', I.id, roundOf(I));
            await snap('I-author-round');
            const b = page.getByRole('button', {name: 'Upload revisions', exact: true});
            await b.click();
            await P.uploadViaWizard(page, {genre: comp, file: textFile(INT_FILE)});
            const g = await typed('au-I-grid-revisions', 'au', call(REVISIONS, gq(I, roundOf(I))));
            check('o.internal', 'a press\'s Internal Review round: the revisions grid answers like an External Review one (the revised file listed)', g.grid, g.grid && has(g.grid.rows, INT_FILE));
            const o = await typed('au-I-old-round-id', 'au', ctx(`/authorDashboard/reviewRoundInfo/${I.id}`));
            check('o.internal.404', 'the Author of a submission in Internal Review gets the 404 page', {status: o.status, screen: o.screen}, is404(o));
        });

        // ---------------------------------------------------------------- the typed addresses
        await L.sect('typed', async () => {
            const RA = roundOf(A);
            await signInAs('au');
            const sub = await typed('au-A-old-submission', 'au', ctx(`/authorDashboard/submission/${A.id}`));
            check('o.submission', '`authorDashboard/submission/{id}` lands on My Submissions with the workflow open on the review round (`workflowMenuKey=workflow_3_{round}`)',
                {landed: sub.landed, workflow: sub.workflow}, /\/dashboard\/mySubmissions\?/.test(sub.landed) && sub.landed.includes(`workflowSubmissionId=${A.id}`) && sub.landed.includes(`workflowMenuKey=workflow_3_${RA.id}`) && /Review/i.test(sub.workflow || ''));
            const forms = {id: `/authorDashboard/reviewRoundInfo/${A.id}`, noid: '/authorDashboard/reviewRoundInfo', query: `/authorDashboard/reviewRoundInfo?submissionId=${A.id}&stageId=3&reviewRoundId=${RA.id}`, lang: `/en/authorDashboard/reviewRoundInfo/${A.id}`};
            for (const [k, p] of Object.entries(forms)) {
                const o = await typed(`au-A-old-round-${k}`, 'au', ctx(p));
                check(`o.round.${k}`, `the old tab address (${k}) answers the Author a bare "404 Not Found" page${k === 'lang' ? ', the address bar without the language' : ''}`,
                    {status: o.status, screen: o.screen, title: o.title, landed: o.landed, redirects: o.redirects, server: o.server}, is404(o) && (k !== 'lang' || !o.landed.includes('/en/')));
            }
            const g = await grids('au', 'A', A, RA);
            check('o.grid.au.rev', 'Author: the "Revisions" grid with "Search", "Upload File" and the round\'s revised file, with "Edit" and "Delete"', g.rev.grid,
                g.rev.grid && g.rev.grid.title === 'Revisions' && eq(g.rev.grid.headerActions, ['Search', 'Upload File']) && has(g.rev.grid.rows, REV_FILE) && g.rev.grid.rowLinks.includes('Edit') && g.rev.grid.rowLinks.includes('Delete'));
            check('o.grid.au.att', 'Author: the "Reviewer\'s Attachments" grid with the reviewer file attached to the letter', g.att.grid, g.att.grid && has(g.att.grid.rows, RV_FILE));
            const others = [['au2', 'au2'], ['ed', 'ed'], ['rv1', 'rv1'], ['anon', null]];
            for (const [who, key] of others) {
                if (key) await signInAs(key); else await signOut(page);
                const o = await typed(`${who}-A-old-round-id`, who, ctx(forms.id));
                check(`o.round.${who}`, `with the submission's id, ${who} gets the same 404 page${who === 'anon' ? ', not Login' : ''}`, {status: o.status, screen: o.screen, landed: o.landed}, is404(o));
                const gg = await grids(who, 'A', A, RA);
                if (who === 'ed') {
                    check('o.grid.ed', 'editor: the attachments grid with the same file; the revisions grid "The current role does not have access to this operation."', {rev: gg.rev.json, att: gg.att.grid && gg.att.grid.rows},
                        gg.rev.json && gg.rev.json.content === NO_OP && gg.att.grid && has(gg.att.grid.rows, RV_FILE));
                } else {
                    check(`o.grid.${who}`, `${who}: both grids answer status false with "${NO_STAGE}" (HTTP 200)`, {rev: [g.rev.status, gg.rev.json], att: [gg.att.status, gg.att.json]},
                        gg.rev.status === 200 && gg.rev.json && gg.rev.json.status === false && gg.rev.json.content === NO_STAGE && gg.att.json && gg.att.json.content === NO_STAGE);
                }
            }
            await signInAs('au2');
            const ob = await typed('au2-B-old-submission', 'au2', ctx(`/authorDashboard/submission/${Bs.id}`));
            fact('au2-own-old-submission', {landed: ob.landed, workflow: ob.workflow});
        });
    } finally {
        const leaks = oldGridRequests();
        fact('old-grid-requests-outside-typed', leaks);
        if (!isOPS) check('o.no-screen-asks', 'no screen of the drive requested either grid or reviewRoundInfo', leaks, leaks.length === 0);
        const typedServer = Object.entries(L.state.facts).filter(([k, v]) => k.startsWith('typed-') && v && v.server && v.server.length).map(([k, v]) => [k, v.server]);
        check('o.no-log', 'none of the typed addresses wrote a server-log line', typedServer, typedServer.length === 0);
        fact('native-dialogs', nativeDialogs);
        record('old-traffic', traffic);
        await close();
    }
};
