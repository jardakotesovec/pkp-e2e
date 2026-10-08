// U72 claim check, chunk I08 (housekeeping 2026-10-08): the chapter move "Order" makes since pkp/pkp-lib#13453,
// on the two screens that draw the chapter list, and what the wizard's Review panel "Chapters" shows of it.
// Spec: docs/specs/U72-chapters-work-type.md — Rule 8 (the handles, "Done", "Cancel ordering"), Rule 8a (a chapter
// move, the unreordered order, the table of contents), Rule 16 (the wizard's Review panel), the retired A6,
// footnotes l, td11, f-a6, h, td18. OMP only: a journal and a preprint server install no chapters.
//
// Run (twice, each run seeds a scratch press of its own):
//   PROBE_RUN=r1 PROBE_FEATURE=U72 PROBE_AGENT=ccI08 bin/app-lock.sh shared omp -- node bin/probe.js omp shared/playwright/checks/U72/I08/i08.js
// PHASES=wizard,workflow narrows the run to some sections; RESEED=1 seeds afresh under the same PROBE_RUN.
//
// Sections (each on a book of its own):
//   wizard       draft Edited Volume, three chapters, as its Author: "Order" (the handles), a chapter moved up by its
//                title and down by its handle, each "Done" read on Details at once, on Review without a reload, and
//                after a reload; "Cancel ordering" after a chapter move; an author move; a chapter and an author
//                moved under one "Done"; the wizard left with a move not yet "Done"; then an edit, an addition and a
//                deletion read on Review at once (Rule 16).
//   wizardTwo    draft Monograph, two chapters: the second moved above the first.
//   wizardAdd    draft Monograph, no chapter: three chapters added on screen (the unreordered order), one moved, a
//                fourth added after the move.
//   wizardEmpty  draft Edited Volume and draft Monograph with no chapter: the Review panel, "Submit".
//   workflow     submitted Monograph, four chapters, as the Press manager on the Chapters page: the same moves, a
//                move in the middle, "Add Chapter" pressed while ordering, the page left with a move not yet "Done";
//                then the Author's plain-text list.
//   published    published Monograph, three chapters: the book page's table of contents before and after a move.
//   ordering     the header links pressed while ordering with a move not yet "Done" ("Add Chapter", then "Order"),
//                on the workflow's book as the Press manager and on the two-chapter draft as its Author, with
//                "Add Chapter" outside ordering as the control.
//   orderingWizard  on the two-chapter draft as its Author, while ordering with nothing moved: "Order", "Add Chapter"
//                and a chapter title each pressed twice, alone, with the wizard's step and address read after each;
//                then the Review panel's "Edit" beside the "Details" panel's.
//   authorCancel "Cancel ordering" after an author move (Rule 8b's last sentence), on the workflow's book as the Press
//                manager and on the three-chapter draft as its Author.
//   tie          TIE_BOOKS (default 4) fresh submitted Monographs, as the Press manager: three chapter-only moves
//                each, the authors of the chapter "Tides" read after every "Done" and every reopening (a "Done"
//                stores its two authors at one place, register A7, and the list may then show them swapped).
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, screen, shot, record, loc, idle, tag, sql, outFile} = require('../../../probe');

const ROOT = path.resolve(__dirname, '../../../../..');
const ALL = ['wizard', 'wizardTwo', 'wizardAdd', 'wizardEmpty', 'workflow', 'published', 'ordering', 'orderingWizard', 'authorCancel', 'tie'];
const PHASES = (process.env.PHASES || ALL.join(',')).split(',');
const on = (p) => PHASES.includes(p);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (s, n = 400) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, n);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const T0 = Date.now();
const T = 30_000;

forEachApp(async (app) => {
    if (app.name !== 'omp') return;
    // Suite page objects are required inside fn (patterns.md "Probe kit").
    const {ChapterList} = require(path.join(ROOT, 'apps/omp/playwright/pages/ChapterPages.js'));
    const log = (...a) => console.log(`[i08 ${app.name} +${Math.round((Date.now() - T0) / 1000)}s]`, ...a);
    const sf = outFile('i08-state.json');
    let S = !process.env.RESEED && fs.existsSync(sf) ? JSON.parse(fs.readFileSync(sf, 'utf8')) : {};
    const save = () => fs.writeFileSync(sf, JSON.stringify(S, null, 1));
    const strip = (u) => String(u || '').replace(/^https?:\/\/[^/]+/, '').replace(/^\/index\.php\//, '');
    const cu = (p = '') => app.url(`/index.php/${S.P.path}${p}`);
    const bookPub = (sid) => (sql(app, `select current_publication_id from submissions where submission_id=${sid}`) || '').trim();
    /** What the database holds: chapter id, seq, title, and each author link's seq beside the author's place on the Contributors list. */
    const stored = (sid) =>
        sql(
            app,
            `select c.chapter_id || ' seq ' || c.seq || ' "' ||
                coalesce((select setting_value from submission_chapter_settings cs where cs.chapter_id = c.chapter_id and cs.setting_name = 'title' and cs.locale = 'en'), '') || '" authors ' ||
                coalesce((select string_agg(ca.author_id || ':' || ca.seq || '/list' || a.seq, ',' order by ca.seq, ca.author_id)
                   from submission_chapter_authors ca join authors a on a.author_id = ca.author_id where ca.chapter_id = c.chapter_id), '-')
             from submissions s join submission_chapters c on c.publication_id = s.current_publication_id
             where s.submission_id = ${sid} order by c.seq, c.chapter_id`
        ).split('\n');

    await app.api.bootstrapProbe(app.contextPath);

    // ================================================================== seed
    if (!S.seeded) {
        const t = tag('u72i08');
        S = {t, errs: {}};
        const ctx = await app.api.createContext({
            tag: t,
            context: {name: `U72 I08 press ${t}`, contactName: 'Paula Principal', contactEmail: `principal${t}@mail.test`},
            users: [
                {username: `${t}mg`, roles: ['manager'], givenName: 'Mona', familyName: 'Manager'},
                {username: `${t}au`, roles: ['author'], givenName: 'Alma', familyName: 'Author'},
            ],
        });
        S.P = {path: ctx.path, mg: `${t}mg`, au: `${t}au`};
        save();
        const au = `${t}au`;
        const ada = {givenName: 'Ada', familyName: 'Lovel', email: `${t}ada@mail.test`};
        const ben = {givenName: 'Ben', familyName: 'Barrow', email: `${t}ben@mail.test`};
        const cy = {givenName: 'Cy', familyName: 'Marsh', email: `${t}cy@mail.test`};
        const file = [{file: 'article.pdf'}];
        const books = {
            // Contributors list: Alma Author, Ada Lovel, Ben Barrow, Cy Marsh.
            W1: {title: 'I08 Wizard Volume', workType: 'editedVolume', submitted: false, contributors: [ada, ben, cy], files: file,
                chapters: [{title: 'Tides', subtitle: 'A Study', authors: [au, ben.email]}, {title: 'Harbours'}, {title: 'Estuaries', subtitle: 'Mouths', authors: [ada.email, cy.email]}]},
            W2: {title: 'I08 Wizard Monograph', submitted: false, contributors: [ada], files: file,
                chapters: [{title: 'Alpha', authors: [au]}, {title: 'Beta', authors: [ada.email]}]},
            W3: {title: 'I08 Empty Volume', workType: 'editedVolume', submitted: false, files: file},
            W4: {title: 'I08 Empty Monograph', submitted: false, files: file},
            W5: {title: 'I08 Added Monograph', submitted: false, files: file},
            WF: {title: 'I08 Workflow Monograph', contributors: [ada, ben, cy],
                chapters: [{title: 'Tides', subtitle: 'A Study', authors: [au, ben.email]}, {title: 'Harbours', authors: [ada.email]}, {title: 'Estuaries'}, {title: 'Deltas', authors: [ada.email, cy.email]}]},
            PUB: {title: 'I08 Published Monograph', decisions: ['accept', 'sendToProduction'], published: true, contributors: [ada],
                chapters: [{title: 'Tides', page: true, authors: [au]}, {title: 'Harbours', authors: [ada.email]}, {title: 'Estuaries'}]},
        };
        S.B = {};
        for (const [k, b] of Object.entries(books)) {
            try {
                const r = await app.api.createSubmission({tag: `${t}${k.toLowerCase()}`, context: t, submitter: au, ...b});
                S.B[k] = {id: r.submissionId, chapters: r.chapters || null, contributors: r.contributors || null};
            } catch (e) {
                S.errs[k] = flat(e.message, 400);
            }
            save();
        }
        S.seeded = true;
        save();
        log('seeded', JSON.stringify(S));
    }
    const F = {};
    const fact = (k, v) => {
        F[k] = v;
        record('i08-facts', {[k]: v}, {merge: true});
        log(k, JSON.stringify(v).slice(0, 3000));
    };
    fact('seed', S);

    // ------------------------------------------------------------------ browser, recorders
    const {page, close} = await launch(app);
    const bad = [], pageErrors = [], dialogs = [], seq = [];
    page.on('response', (r) => {
        if (r.status() >= 400) bad.push({at: Date.now(), status: r.status(), m: r.request().method(), url: strip(r.url()).slice(0, 200)});
        if (/save-sequence/i.test(r.url())) {
            let data = new URLSearchParams(r.request().postData() || '').get('data');
            try { data = JSON.parse(data); } catch { /* kept as posted */ }
            r.text().then((b) => seq.push({at: Date.now(), status: r.status(), answer: flat(b, 120), data})).catch(() => seq.push({at: Date.now(), status: r.status(), data}));
        }
    });
    page.on('pageerror', (e) => pageErrors.push({at: Date.now(), text: flat(e.message, 300), url: strip(page.url())}));
    // The script's own listener decides alone: every question is recorded and accepted, a page-leave one included.
    page.on('dialog', async (d) => {
        dialogs.push({at: Date.now(), type: d.type(), message: d.message().slice(0, 200), url: strip(page.url()).slice(0, 80)});
        await d.accept().catch(() => {});
    });
    const since = (arr, t0) => arr.filter((e) => e.at >= t0).map(({at, ...x}) => x);
    let snapN = 0;
    async function snap(name, facts, {png = true} = {}) {
        let s;
        try { s = await screen(page); } catch (e) { s = {url: page.url(), screenError: flat(e.message, 200)}; }
        if (facts) s.facts = facts;
        const n = `i08-${String(++snapN).padStart(3, '0')}-${name}`;
        record(n, s);
        if (png) await shot(page, n).catch(() => {});
        return {file: n, notices: s.notices || null};
    }
    async function sect(name, fn) {
        if (!on(name)) return;
        const t0 = Date.now();
        log(`== ${name}`);
        try { await fn(); } catch (e) {
            fact(`${name}.FAILED`, flat(e.stack || e, 1500));
            await snap(`zz-failed-${name}`).catch(() => {});
        }
        fact(`${name}.http4xx5xx`, since(bad, t0));
        fact(`${name}.pageErrors`, since(pageErrors, t0));
        fact(`${name}.dialogs`, since(dialogs, t0));
    }
    const as = async (u) => { await signIn(page, u, {contextPath: S.P.path}); await idle(page).catch(() => {}); };
    const go = async (url) => { const r = await page.goto(url).catch((e) => ({err: flat(e.message, 200)})); await idle(page).catch(() => {}); return r; };
    const list = new ChapterList(page);

    // ================================================================== the chapter list
    /** The list as drawn: header links, the ordering controls, and per chapter its title, row classes, handle, link and author rows. */
    async function readList() {
        const g = list.grid();
        if (!(await g.count())) return {grid: false};
        return g.evaluate((root) => {
            const vis = (e) => !!(e && e.getClientRects().length);
            const t = (e) => (e ? (e.innerText || '').replace(/\s+/g, ' ').trim() : null);
            const blocks = [...root.querySelectorAll('tbody.category_grid_body')].filter((tb) => !tb.classList.contains('ui-sortable-placeholder')).map((tb) => {
                const rows = [...tb.querySelectorAll(':scope > tr.gridRow')].filter(vis);
                const first = rows[0];
                const cell = first && first.querySelector('td .gridCellContainer');
                return {
                    title: t(cell),
                    rowClass: first ? first.className : null,
                    blockClass: tb.className,
                    link: !!(first && vis(first.querySelector('a.pkp_linkaction_editChapter'))),
                    arrow: !!(first && vis(first.querySelector('a.show_extras, a.hide_extras'))),
                    handle: !!(first && vis(first.querySelector('a.pkp_linkaction_moveItem'))),
                    authors: rows.slice(1).map((tr) => t(tr.querySelector('td .gridCellContainer'))),
                    authorHandles: rows.slice(1).map((tr) => vis(tr.querySelector('a.pkp_linkaction_moveItem'))),
                    authorRowClass: rows.slice(1).map((tr) => tr.className),
                };
            });
            return {
                heading: t(root.querySelector('.header h4')),
                headerLinks: [...root.querySelectorAll('.header a')].filter(vis).map(t),
                finish: [...root.querySelectorAll('.order_finish_controls a, .order_finish_controls button')].filter(vis).map(t),
                handles: [...root.querySelectorAll('a.pkp_linkaction_moveItem')].filter(vis).length,
                order: blocks.map((b) => b.title),
                authors: Object.fromEntries(blocks.map((b) => [b.title, b.authors])),
                blocks,
                text: t(root).slice(0, 900),
            };
        });
    }
    const brief = (l) => (l && l.order ? {order: l.order, authors: l.authors, headerLinks: l.headerLinks, finish: l.finish, handles: l.handles} : l);
    async function centre() {
        await list.grid().evaluate((e) => e.scrollIntoView({block: 'center'})).catch(() => {});
        await sleep(200);
    }
    async function startOrder() {
        await centre();
        await list.orderLink().click();
        await list.doneLink().waitFor({timeout: T});
        await sleep(500);
    }
    const ensureOrder = async () => { if (!(await list.doneLink().count())) await startOrder(); };
    /** While ordering, press a chapter's title and its handle with no drag: does a window open, does ordering end? */
    async function pressTitleWhileOrdering(title) {
        const o = {title};
        const link = list.titleLink(title);
        o.titleLinks = await link.count();
        o.cellHtml = await list.chapterRow(title).locator('td .gridCellContainer').first().evaluate((e) => e.innerHTML.replace(/\s+/g, ' ').slice(0, 400)).catch(() => null);
        if (o.titleLinks) await link.first().click({timeout: 5000}).catch((e) => { o.clickErr = flat(e.message, 150); });
        else await list.chapterRow(title).locator('td').first().click({timeout: 5000}).catch((e) => { o.clickErr = flat(e.message, 150); });
        await sleep(1500);
        await idle(page);
        const form = page.locator('form#editChapterForm:visible');
        o.windowOpened = await form.count();
        if (o.windowOpened) {
            o.snap = (await snap('ordering-title-pressed-window')).file;
            await form.locator('a:visible').filter({hasText: /^\s*Cancel\s*$/}).first().click().catch(() => {});
            await sleep(1500);
            await idle(page);
        }
        o.stillOrdering = await list.doneLink().count();
        o.orderAfter = (await readList()).order;
        return o;
    }
    /**
     * Drag a chapter as a person would: press on its title cell (or its handle), move a little, then to the top
     * edge of the target chapter's block ("above") or its bottom edge ("below"), release.
     */
    async function dragChapter(title, target, where, by = 'title') {
        await centre();
        const row = list.chapterRow(title);
        let grip = row.locator('td').first();
        let used = 'title';
        if (by === 'handle') {
            const h = row.locator('a.pkp_linkaction_moveItem:visible').first();
            if (await h.count()) { grip = h; used = 'handle'; } else used = 'title (no handle found)';
        }
        const a = await grip.boundingBox();
        if (!a) return {noBox: 'grip'};
        const x = used === 'handle' ? a.x + a.width / 2 : a.x + Math.min(a.width / 2, 200);
        const y = a.y + a.height / 2;
        const d = where === 'above' ? -1 : 1;
        await page.mouse.move(x, y);
        await page.mouse.down();
        await page.mouse.move(x, y + 5 * d, {steps: 5});
        const b = await list.chapterBlock(target).boundingBox();
        if (!b) { await page.mouse.up(); return {noBox: 'target'}; }
        const ty = where === 'above' ? b.y + 3 : b.y + b.height - 3;
        await page.mouse.move(x, ty - 4 * d, {steps: 30});
        await page.mouse.move(x, ty, {steps: 4});
        await sleep(400);
        const during = (await readList()).blocks.map((k) => [k.title, ...k.authors]);
        await page.mouse.up();
        await idle(page);
        await sleep(600);
        return {used, during};
    }
    async function dragAuthor(title, name, aboveName) {
        await centre();
        await list.dragAuthorAbove(title, name, aboveName);
        await idle(page);
        await sleep(500);
    }
    /** Press "Done"; the save-sequence answer and what the browser posted. */
    async function done() {
        const t0 = Date.now();
        const saved = page.waitForResponse((r) => /save-sequence/i.test(r.url()) && r.request().method() === 'POST', {timeout: 20_000}).catch(() => null);
        await list.doneLink().click();
        const r = await saved;
        await idle(page);
        await sleep(900);
        return {status: r ? r.status() : null, posts: since(seq, t0)};
    }
    async function cancelOrder() {
        const t0 = Date.now();
        await list.cancelOrderingLink().click();
        await idle(page);
        await sleep(900);
        return {posts: since(seq, t0), stillOrdering: await list.doneLink().count()};
    }
    const moved = (order, title, target, where) => {
        const o = order.filter((x) => x !== title);
        const i = o.indexOf(target) + (where === 'above' ? 0 : 1);
        o.splice(i, 0, title);
        return o;
    };

    // ================================================================== wizard helpers
    const current = () => page.locator('.pkpSteps__step__label--current');
    const currentStep = async () => flat(await current().innerText().catch(() => ''), 60);
    async function wizardTo(name) {
        for (let i = 0; i < 7; i++) {
            const c = await currentStep();
            if (new RegExp(`${name}$`).test(c)) return c;
            const railBtn = page.locator('button.pkpSteps__step__label').filter({hasText: new RegExp(`${name}$`)});
            if (i === 0 && (await railBtn.count())) {
                if (await page.locator('.pkpSteps--collapsed').count()) await page.locator('.pkpSteps__controls button').click().catch(() => {});
                await railBtn.first().click().catch(() => {});
            } else {
                await page.locator('.submissionWizard__footer').getByRole('button', {name: 'Continue', exact: true}).click().catch(() => {});
            }
            await sleep(1200);
            await idle(page);
            await page.locator('.submissionWizard__loadingReview').waitFor({state: 'detached', timeout: 20000}).catch(() => {});
        }
        return currentStep();
    }
    const wurl = (id) => cu(`/submission?id=${id}`);
    async function openWizard(id) {
        await go(wurl(id));
        await sleep(800);
    }
    async function toDetails() {
        const c = await wizardTo('Details');
        await list.grid().waitFor({timeout: T}).catch(() => {});
        await idle(page);
        await sleep(400);
        return c;
    }
    const chaptersPanel = () =>
        page.locator('.submissionWizard__reviewPanel').filter({has: page.locator('h2, h3, h4, .submissionWizard__reviewPanel__header').filter({hasText: /^\s*Chapters\s*$/})}).first();
    /** The Review step's "Chapters" panel: its items as "title | authors", its buttons, and the step's panel headings. */
    async function readReview() {
        const c = await wizardTo('Review');
        await page.locator('.submissionWizard__loadingReview').waitFor({state: 'detached', timeout: 20000}).catch(() => {});
        await idle(page);
        await sleep(600);
        const out = {step: c, panels: await page.locator('.submissionWizard__reviewPanel').evaluateAll((els) => els.filter((e) => e.offsetParent !== null).map((e) => { const h = e.querySelector('h2, h3'); return h ? h.innerText.replace(/\s+/g, ' ').trim() : '?'; })).catch(() => []),
            banner: flat(await page.locator('.submissionWizard__review_errors').innerText().catch(() => ''), 600), panel: null, order: null};
        const p = chaptersPanel();
        if (await p.count()) {
            out.panel = await p.evaluate((e) => ({
                buttons: [...e.querySelectorAll('button, a')].map((b) => b.innerText.trim()),
                items: [...e.querySelectorAll('.submissionWizard__reviewPanel__item')].map((i) => ({
                    title: ((i.querySelector('.submissionWizard__reviewPanel__item__header') || {}).innerText || '').replace(/\s+/g, ' ').trim(),
                    authors: ((i.querySelector('.submissionWizard__reviewPanel__item__value') || {}).innerText || '').replace(/\s+/g, ' ').trim() || null,
                })),
                text: e.innerText.replace(/[ \t]+/g, ' ').trim().slice(0, 600),
            }));
            out.order = out.panel.items.map((i) => i.title);
            out.authors = Object.fromEntries(out.panel.items.map((i) => [i.title, i.authors]));
        }
        return out;
    }
    const bare = (titles) => (titles || []).map((x) => x.split(':')[0]);
    const briefR = (r) => (r ? {step: r.step, order: r.order, authors: r.authors, buttons: r.panel && r.panel.buttons} : r);
    /** Read Details, then Review without a reload, then both again after a reload; `label` names the snapshots. */
    async function readBoth(id, label, expected) {
        const o = {expected};
        const d1 = await readList();
        o.detailsAtOnce = brief(d1);
        o.snapDetailsAtOnce = (await snap(`${label}-details-at-once`, {list: d1, expected})).file;
        const r1 = await readReview();
        o.reviewAtOnce = briefR(r1);
        o.snapReviewAtOnce = (await snap(`${label}-review-no-reload`, {review: r1, expected})).file;
        await toDetails();
        o.detailsBack = brief(await readList());
        await page.reload();
        await idle(page);
        await sleep(1200);
        o.stepAfterReload = await currentStep();
        await toDetails();
        const d2 = await readList();
        o.detailsAfterReload = brief(d2);
        o.snapDetailsAfterReload = (await snap(`${label}-details-after-reload`, {list: d2, expected})).file;
        const r2 = await readReview();
        o.reviewAfterReload = briefR(r2);
        o.snapReviewAfterReload = (await snap(`${label}-review-after-reload`, {review: r2, expected})).file;
        o.stored = stored(id);
        if (expected) {
            o.verdict = {
                detailsAtOnce: same(d1.order, expected), reviewNoReload: same(bare(r1.order), expected),
                detailsAfterReload: same(d2.order, expected), reviewAfterReload: same(bare(r2.order), expected),
            };
        }
        await toDetails();
        return o;
    }
    async function submitWizard() {
        const r = {};
        const box = page.getByRole('checkbox', {name: /agree to the copyright statement/});
        if (await box.count()) { await box.check().catch(() => {}); r.copyrightTicked = true; }
        const submit = page.locator('.submissionWizard__footer').getByRole('button', {name: 'Submit', exact: true});
        r.submitEnabled = await submit.isEnabled().catch(() => null);
        await submit.click().catch((e) => { r.clickErr = flat(e.message, 150); });
        const dlg = page.getByRole('dialog').filter({hasText: 'Are you sure you want to complete this submission?'});
        await dlg.waitFor({timeout: 10000}).catch(() => {});
        r.dialog = flat(await dlg.innerText().catch(() => ''), 300);
        const sr = page.waitForResponse((x) => /\/submit$/.test(x.url().split('?')[0]) && x.request().method() !== 'GET', {timeout: T}).catch(() => null);
        await dlg.getByRole('button', {name: 'Submit', exact: true}).click().catch((e) => { r.dlgErr = flat(e.message, 150); });
        const resp = await sr;
        r.submitStatus = resp ? resp.status() : null;
        await page.getByRole('heading', {name: 'Submission complete'}).waitFor({timeout: T}).catch(() => {});
        await idle(page);
        r.completeHeading = await page.getByRole('heading', {name: 'Submission complete'}).count();
        return r;
    }

    // ================================================================== wizard: W1, the Author (Rules 8, 8a, 16)
    await sect('wizard', async () => {
        const id = S.B.W1.id;
        const r = {};
        const put = () => fact('wizard', r);
        await as(S.P.au);
        await openWizard(id);
        r.rail = (await page.locator('.pkpSteps__step__label').allInnerTexts().catch(() => [])).map((x) => flat(x, 40));
        await toDetails();
        const l0 = await readList();
        r.seeded = {list: l0, snap: (await snap('wizard-details-seeded', {list: l0})).file, stored: stored(id)};
        await loc(page, 'Wizard Details: the "Chapters" list (legacy category grid)', list.grid());
        await loc(page, 'Wizard Details "Chapters": the header link "Order"', list.orderLink());
        const rv0 = await readReview();
        r.seeded.review = rv0;
        r.seeded.reviewSnap = (await snap('wizard-review-seeded', {review: rv0})).file;
        await loc(page, 'Wizard Review: the "Chapters" panel', chaptersPanel());
        await loc(page, 'Wizard Review "Chapters": one item per chapter', chaptersPanel().locator('.submissionWizard__reviewPanel__item'));
        put();

        // --- "Order": the handles and the two buttons (Rule 8)
        await toDetails();
        await startOrder();
        const lo = await readList();
        r.orderMode = {list: lo, snap: (await snap('wizard-details-order-mode', {list: lo})).file};
        await loc(page, 'Chapter list while ordering: the move handles', list.orderHandles());
        await loc(page, 'Chapter list while ordering: "Done"', list.doneLink());
        await loc(page, 'Chapter list while ordering: "Cancel ordering"', list.cancelOrderingLink());
        r.orderMode.titlePressed = await pressTitleWhileOrdering(lo.order[0]);
        put();

        // --- move 1: the last chapter above the first, by its title; "Done"
        {
            await ensureOrder();
            const o = (await readList()).order;
            const [title, target] = [o[o.length - 1], o[0]];
            const m = {drag: `${title} above ${target}, by its title`, before: lo.authors};
            m.dragged = await dragChapter(title, target, 'above', 'title');
            const ld = await readList();
            m.afterDrop = brief(ld);
            m.snapDrop = (await snap('wizard-move1-dropped-before-done', {list: ld})).file;
            m.done = await done();
            const s = await snap('wizard-move1-after-done');
            m.noticesAfterDone = s.notices;
            Object.assign(m, await readBoth(id, 'wizard-move1', moved(o, title, target, 'above')));
            r.move1 = m;
            put();
        }
        // --- move 2: the first chapter below the last, by its handle; "Done"
        {
            await startOrder();
            const o = (await readList()).order;
            const [title, target] = [o[0], o[o.length - 1]];
            const m = {drag: `${title} below ${target}, by its handle`};
            m.dragged = await dragChapter(title, target, 'below', 'handle');
            m.afterDrop = brief(await readList());
            m.done = await done();
            Object.assign(m, await readBoth(id, 'wizard-move2', moved(o, title, target, 'below')));
            r.move2 = m;
            put();
        }
        // --- "Cancel ordering" after a chapter move
        {
            await startOrder();
            const o = (await readList()).order;
            const [title, target] = [o[o.length - 1], o[0]];
            const m = {drag: `${title} above ${target}, then "Cancel ordering"`, orderBefore: o};
            m.dragged = await dragChapter(title, target, 'above', 'title');
            m.afterDrop = brief(await readList());
            m.cancel = await cancelOrder();
            Object.assign(m, await readBoth(id, 'wizard-cancel', o));
            r.cancel = m;
            put();
        }
        // --- an author move: Ben Barrow above Alma Author under "Tides" (Rule 16's sentence on the author order)
        {
            await startOrder();
            const l = await readList();
            const m = {drag: 'Ben Barrow above Alma Author under "Tides"', authorsBefore: l.authors.Tides, reviewBefore: r.seeded.review.authors};
            await dragAuthor('Tides', 'Ben Barrow', 'Alma Author');
            m.afterDrop = (await readList()).authors.Tides;
            m.done = await done();
            Object.assign(m, await readBoth(id, 'wizard-authors', l.order));
            r.authors = m;
            put();
        }
        // --- a chapter and an author moved under one "Done"
        {
            await startOrder();
            const l = await readList();
            const o = l.order;
            const [title, target] = [o[o.length - 1], o[0]];
            const tides = l.authors.Tides || [];
            const m = {drag: `${title} above ${target}, and "${tides[1]}" above "${tides[0]}" under "Tides", one "Done"`, authorsBefore: l.authors};
            m.dragged = await dragChapter(title, target, 'above', 'handle');
            if (tides.length > 1) await dragAuthor('Tides', tides[1], tides[0]);
            m.afterDrop = brief(await readList());
            m.done = await done();
            Object.assign(m, await readBoth(id, 'wizard-both', moved(o, title, target, 'above')));
            r.both = m;
            put();
        }
        // --- the wizard left with a move not yet "Done": the rail's "Review", then another address
        {
            await startOrder();
            const o = (await readList()).order;
            const [title, target] = [o[o.length - 1], o[0]];
            const m = {drag: `${title} above ${target}, no "Done"`, orderBefore: o};
            m.dragged = await dragChapter(title, target, 'above', 'title');
            m.afterDrop = brief(await readList());
            const t1 = Date.now();
            const rv = await readReview();
            m.review = briefR(rv);
            m.snapReview = (await snap('wizard-unsaved-move-review', {review: rv, orderBefore: o})).file;
            m.dialogsToReview = since(dialogs, t1);
            await toDetails();
            const lb = await readList();
            m.detailsBack = brief(lb);
            m.snapBack = (await snap('wizard-unsaved-move-back-on-details', {list: lb})).file;
            const t2 = Date.now();
            await go(cu('/dashboard/mySubmissions'));
            await sleep(800);
            m.leave = {url: strip(page.url()), dialogs: since(dialogs, t2)};
            await openWizard(id);
            await toDetails();
            const la = await readList();
            m.afterReturn = brief(la);
            m.snapReturn = (await snap('wizard-unsaved-move-after-return', {list: la, orderBefore: o})).file;
            m.posts = since(seq, t1);
            r.unsaved = m;
            put();
        }
        // --- Rule 16: an edit, an addition and a deletion read on Review at once
        {
            const m = {};
            await toDetails();
            m.orderBefore = (await readList()).order;
            let win = await list.openEdit('Harbours');
            await win.fill({subtitle: 'Ports'});
            await win.save();
            await idle(page);
            await sleep(600);
            const r1 = await readReview();
            m.afterEdit = briefR(r1);
            m.snapEdit = (await snap('wizard-rule16-review-after-edit', {review: r1})).file;
            await toDetails();
            win = await list.openAdd();
            m.addBoxes = await win.boxStates('contributors').catch((e) => flat(e.message, 200));
            await win.fill({title: 'Deltas', subtitle: 'Fans'});
            await win.contributorBox('Ada Lovel').check().catch((e) => { m.tickErr = flat(e.message, 200); });
            await win.save();
            await idle(page);
            await sleep(600);
            const la = await readList();
            m.listAfterAdd = brief(la);
            m.snapAddDetails = (await snap('wizard-rule16-details-after-add', {list: la})).file;
            const r2 = await readReview();
            m.afterAdd = briefR(r2);
            m.snapAdd = (await snap('wizard-rule16-review-after-add', {review: r2})).file;
            await page.reload();
            await idle(page);
            await sleep(1200);
            await toDetails();
            m.listAfterAddReload = brief(await readList());
            const r2b = await readReview();
            m.afterAddReload = briefR(r2b);
            m.snapAddReload = (await snap('wizard-rule16-review-after-add-reload', {review: r2b})).file;
            await toDetails();
            const dlg = await list.openDelete('Deltas');
            await list.confirmDelete(dlg);
            await idle(page);
            await sleep(600);
            m.listAfterDelete = brief(await readList());
            const r3 = await readReview();
            m.afterDelete = briefR(r3);
            m.snapDelete = (await snap('wizard-rule16-review-after-delete', {review: r3})).file;
            m.stored = stored(id);
            r.rule16 = m;
            put();
        }
    });

    // ================================================================== wizardTwo: W2, a Monograph with two chapters
    await sect('wizardTwo', async () => {
        const id = S.B.W2.id;
        const r = {};
        await as(S.P.au);
        await openWizard(id);
        await toDetails();
        const l0 = await readList();
        r.seeded = {list: brief(l0), snap: (await snap('two-details-seeded', {list: l0})).file};
        const rv0 = await readReview();
        r.seeded.review = briefR(rv0);
        r.seeded.reviewSnap = (await snap('two-review-seeded', {review: rv0})).file;
        await toDetails();
        await startOrder();
        const lo = await readList();
        r.orderMode = {list: brief(lo), blocks: lo.blocks, snap: (await snap('two-details-order-mode', {list: lo})).file};
        const o = lo.order;
        r.drag = `${o[1]} above ${o[0]}, by its title`;
        r.dragged = await dragChapter(o[1], o[0], 'above', 'title');
        r.afterDrop = brief(await readList());
        r.done = await done();
        Object.assign(r, await readBoth(id, 'two-move', [o[1], o[0]]));
        fact('wizardTwo', r);
    });

    // ================================================================== wizardAdd: W5, chapters added on screen
    await sect('wizardAdd', async () => {
        const id = S.B.W5.id;
        const r = {};
        const put = () => fact('wizardAdd', r);
        await as(S.P.au);
        await openWizard(id);
        await toDetails();
        const l0 = await readList();
        r.empty = {list: brief(l0), text: l0.text, snap: (await snap('add-details-empty', {list: l0})).file};
        r.afterEach = [];
        for (const title of ['Zeta', 'Alpha', 'Mid']) {
            await list.addChapter({title});
            await idle(page);
            await sleep(500);
            const l = await readList();
            r.afterEach.push({added: title, order: l.order, headerLinks: l.headerLinks});
        }
        r.added = await readBoth(id, 'add-three-added', ['Zeta', 'Alpha', 'Mid']);
        put();
        await startOrder();
        r.drag = 'Mid above Zeta, by its title';
        r.dragged = await dragChapter('Mid', 'Zeta', 'above', 'title');
        r.done = await done();
        r.afterMove = brief(await readList());
        await list.addChapter({title: 'Last'});
        await idle(page);
        await sleep(500);
        r.afterMoveAndAdd = await readBoth(id, 'add-after-move-and-add', ['Mid', 'Zeta', 'Alpha', 'Last']);
        put();
    });

    // ================================================================== wizardEmpty: W3 (Edited Volume), W4 (Monograph)
    await sect('wizardEmpty', async () => {
        const r = {};
        await as(S.P.au);
        for (const k of ['W3', 'W4']) {
            const o = {};
            await openWizard(S.B[k].id);
            await toDetails();
            const l = await readList();
            o.details = {text: l.text, headerLinks: l.headerLinks, order: l.order};
            o.snapDetails = (await snap(`empty-${k.toLowerCase()}-details`, {list: l})).file;
            const rv = await readReview();
            o.review = rv;
            o.snapReview = (await snap(`empty-${k.toLowerCase()}-review`, {review: rv})).file;
            o.submit = await submitWizard();
            o.snapSubmit = (await snap(`empty-${k.toLowerCase()}-after-submit`, {submit: o.submit})).file;
            r[k] = o;
            fact('wizardEmpty', r);
        }
    });

    // ================================================================== workflow: WF, the Press manager (Rules 8, 8a)
    const wfUrl = (sid, pub) => cu(`/dashboard/editorial?workflowSubmissionId=${sid}&workflowMenuKey=publication_${pub}_chapters`);
    const auUrl = (sid, pub) => cu(`/dashboard/mySubmissions?workflowSubmissionId=${sid}&workflowMenuKey=publication_${pub}_chapters`);
    async function openChapters(url) {
        await go(url);
        await list.grid().waitFor({timeout: T}).catch(() => {});
        await list.expectLoaded().catch(() => {});
        await idle(page);
        await sleep(600);
    }
    /** Read the list at once and again after a reload. */
    async function readTwice(url, id, label, expected) {
        const o = {expected};
        const l1 = await readList();
        o.atOnce = brief(l1);
        o.snapAtOnce = (await snap(`${label}-at-once`, {list: l1, expected})).file;
        await openChapters(url);
        const l2 = await readList();
        o.afterReload = brief(l2);
        o.snapAfterReload = (await snap(`${label}-after-reload`, {list: l2, expected})).file;
        o.stored = stored(id);
        if (expected) o.verdict = {atOnce: same(l1.order, expected), afterReload: same(l2.order, expected)};
        return o;
    }
    await sect('workflow', async () => {
        const id = S.B.WF.id;
        const url = wfUrl(id, bookPub(id));
        const r = {url: strip(url)};
        const put = () => fact('workflow', r);
        await as(S.P.mg);
        await openChapters(url);
        const l0 = await readList();
        r.seeded = {list: l0, snap: (await snap('workflow-chapters-seeded', {list: l0})).file, stored: stored(id)};
        await loc(page, 'Workflow Chapters page: the "Chapters" list', list.grid());
        await startOrder();
        const lo = await readList();
        r.orderMode = {list: lo, snap: (await snap('workflow-chapters-order-mode', {list: lo})).file};
        r.orderMode.titlePressed = await pressTitleWhileOrdering(lo.order[0]);
        put();
        const cycle = async (key, pick, where, by) => {
            await ensureOrder();
            const l = await readList();
            const o = l.order;
            const [title, target] = pick(o);
            const m = {drag: `${title} ${where} ${target}, by its ${by}`, authorsBefore: l.authors};
            m.dragged = await dragChapter(title, target, where, by);
            const ld = await readList();
            m.afterDrop = brief(ld);
            m.snapDrop = (await snap(`workflow-${key}-dropped-before-done`, {list: ld})).file;
            m.done = await done();
            const s = await snap(`workflow-${key}-after-done`);
            m.noticesAfterDone = s.notices;
            Object.assign(m, await readTwice(url, id, `workflow-${key}`, moved(o, title, target, where)));
            r[key] = m;
            put();
        };
        await cycle('move1', (o) => [o[o.length - 1], o[0]], 'above', 'handle');
        await cycle('move2', (o) => [o[0], o[o.length - 1]], 'below', 'title');
        await cycle('move3', (o) => [o[2], o[1]], 'above', 'title');
        // --- "Cancel ordering" after a chapter move
        {
            await startOrder();
            const o = (await readList()).order;
            const m = {drag: `${o[1]} above ${o[0]}, then "Cancel ordering"`, orderBefore: o};
            m.dragged = await dragChapter(o[1], o[0], 'above', 'title');
            m.afterDrop = brief(await readList());
            m.cancel = await cancelOrder();
            Object.assign(m, await readTwice(url, id, 'workflow-cancel', o));
            r.cancel = m;
            put();
        }
        // --- while ordering, a move not yet "Done": "Add Chapter" pressed, then another page of the workflow
        {
            await startOrder();
            const o = (await readList()).order;
            const m = {drag: `${o[1]} above ${o[0]}, no "Done"`, orderBefore: o};
            m.dragged = await dragChapter(o[1], o[0], 'above', 'title');
            const ld = await readList();
            m.afterDrop = brief(ld);
            const t1 = Date.now();
            const add = list.addChapterLink();
            m.addChapterShown = await add.count();
            if (m.addChapterShown) {
                await add.click().catch((e) => { m.addClickErr = flat(e.message, 150); });
                await sleep(1500);
                await idle(page);
                const form = page.locator('form#editChapterForm:visible');
                m.addWindowOpened = await form.count();
                m.snapAdd = (await snap('workflow-ordering-add-chapter-pressed')).file;
                if (m.addWindowOpened) {
                    await form.locator('a:visible').filter({hasText: /^\s*Cancel\s*$/}).first().click().catch(() => {});
                    await sleep(1200);
                    await idle(page);
                }
                const lb = await readList();
                m.afterAddCancel = brief(lb);
                m.snapAfterAddCancel = (await snap('workflow-ordering-after-add-cancel', {list: lb})).file;
            }
            // another page of the workflow and back, by the side menu
            const menu = (name) => page.locator('[role="dialog"]:visible nav, [role="dialog"]:visible [data-cy="workflow-secondary-items"], [role="dialog"]:visible').first().getByText(name, {exact: true}).first();
            const t2 = Date.now();
            await menu('Title & Abstract').click().catch((e) => { m.menuErr = flat(e.message, 150); });
            await sleep(1500);
            await idle(page);
            m.leftTo = {heading: flat(await page.locator('[role="dialog"]:visible .pkp-modal-scroll-container h2').first().innerText().catch(() => ''), 80), dialogs: since(dialogs, t2)};
            m.snapLeft = (await snap('workflow-ordering-left-to-title-abstract')).file;
            await menu('Chapters').click().catch((e) => { m.menuBackErr = flat(e.message, 150); });
            await list.grid().waitFor({timeout: T}).catch(() => {});
            await idle(page);
            await sleep(800);
            const lr = await readList();
            m.back = brief(lr);
            m.snapBack = (await snap('workflow-ordering-back-on-chapters', {list: lr, orderBefore: o})).file;
            m.posts = since(seq, t1);
            await openChapters(url);
            m.afterReload = brief(await readList());
            r.unsaved = m;
            put();
        }
        // --- the Author's plain-text list reads the same order
        {
            const mgOrder = (await readList()).order;
            await as(S.P.au);
            await openChapters(auUrl(id, bookPub(id)));
            const la = await readList();
            r.author = {managerOrder: mgOrder, list: brief(la), blocks: la.blocks, snap: (await snap('workflow-author-view-chapters', {list: la, managerOrder: mgOrder})).file, same: same(la.order, mgOrder)};
            put();
        }
    });

    // ================================================================== published: PUB, the table of contents
    async function readToc(sid) {
        const {page: v, close: vclose} = await launch(app);
        try {
            const resp = await v.goto(cu(`/catalog/book/${sid}`));
            await idle(v);
            const s = await screen(v);
            const toc = await v.locator('.item.chapters, .chapters').first().evaluate((e) => ({
                heading: ((e.querySelector('h2, h3') || {}).innerText || '').trim(),
                items: [...e.querySelectorAll('li')].map((li) => li.innerText.replace(/\s+/g, ' ').trim()),
                titles: [...e.querySelectorAll('li .title')].map((x) => x.innerText.replace(/\s+/g, ' ').trim()),
            })).catch((e) => ({err: String(e.message).slice(0, 200)}));
            return {status: resp && resp.status(), toc, screen: s};
        } finally {
            await vclose();
        }
    }
    await sect('published', async () => {
        const id = S.B.PUB.id;
        const url = wfUrl(id, bookPub(id));
        const r = {};
        const t0 = await readToc(id);
        r.tocBefore = {status: t0.status, toc: t0.toc};
        record(`i08-${String(++snapN).padStart(3, '0')}-published-book-page-before`, t0.screen);
        await as(S.P.mg);
        await openChapters(url);
        const l0 = await readList();
        r.seeded = {list: brief(l0), text: l0.text, snap: (await snap('published-chapters-seeded', {list: l0})).file};
        r.warning = flat(await page.locator('[role="dialog"]:visible').first().getByText(/This version has been published/).first().innerText().catch(() => ''), 200);
        await startOrder();
        const o = (await readList()).order;
        const [title, target] = [o[o.length - 1], o[0]];
        r.drag = `${title} above ${target}, by its title`;
        r.dragged = await dragChapter(title, target, 'above', 'title');
        r.done = await done();
        Object.assign(r, await readTwice(url, id, 'published-move', moved(o, title, target, 'above')));
        const t1 = await readToc(id);
        r.tocAfter = {status: t1.status, toc: t1.toc};
        record(`i08-${String(++snapN).padStart(3, '0')}-published-book-page-after`, t1.screen);
        fact('published', r);
    });

    /** While ordering with a move not yet "Done": press the header's "Add Chapter", then "Order"; then "Add Chapter" outside ordering as the control. */
    async function headerWhileOrdering(label, reopen) {
        const o = {};
        const form = page.locator('form#editChapterForm:visible');
        const closeForm = async () => {
            await form.locator('a:visible').filter({hasText: /^\s*Cancel\s*$/}).first().click().catch(() => {});
            await sleep(1500);
            await idle(page);
        };
        const attrs = (l) => l.first().evaluate((e) => ({disabled: e.getAttribute('disabled'), cls: e.className})).catch(() => null);
        const before = await readList();
        o.orderBefore = before.order;
        await startOrder();
        const [title, target] = [before.order[1], before.order[0]];
        o.drag = `${title} above ${target}, no "Done"`;
        o.dragged = (await dragChapter(title, target, 'above', 'title')).used;
        o.afterDrop = brief(await readList());
        const add = list.addChapterLink();
        o.addChapterShown = await add.count();
        if (o.addChapterShown) {
            o.addAttrs = await attrs(add);
            await add.first().click({timeout: 5000}).catch((e) => { o.addClickErr = flat(e.message, 150); });
            await form.first().waitFor({timeout: 6000}).catch(() => {});
            await idle(page);
            o.addWindowOpened = await form.count();
            o.snapAdd = (await snap(`${label}-add-chapter-pressed`)).file;
            if (o.addWindowOpened) await closeForm();
            o.afterAdd = brief(await readList());
        }
        const ord = list.orderLink();
        o.orderShown = await ord.count();
        if (o.orderShown) {
            o.orderAttrs = await attrs(ord);
            const t1 = Date.now();
            await ord.first().click({timeout: 5000}).catch((e) => { o.orderClickErr = flat(e.message, 150); });
            await sleep(1500);
            await idle(page);
            const l = await readList();
            o.afterOrderPressed = brief(l);
            o.snapOrder = (await snap(`${label}-order-pressed-again`, {list: l})).file;
            o.postsOnOrder = since(seq, t1);
        }
        if (await list.doneLink().count()) o.cancel = await cancelOrder();
        o.afterCancel = brief(await readList());
        await reopen();
        o.afterReopen = brief(await readList());
        await centre();
        o.controlAddAttrs = await attrs(list.addChapterLink());
        await list.addChapterLink().first().click({timeout: 5000}).catch((e) => { o.controlClickErr = flat(e.message, 150); });
        await form.first().waitFor({timeout: 6000}).catch(() => {});
        await idle(page);
        o.controlAddWindowOpened = await form.count();
        o.snapControl = (await snap(`${label}-add-chapter-outside-ordering`)).file;
        if (o.controlAddWindowOpened) await closeForm();
        return o;
    }
    await sect('ordering', async () => {
        const r = {};
        const id = S.B.WF.id;
        const url = wfUrl(id, bookPub(id));
        await as(S.P.mg);
        await openChapters(url);
        r.workflow = await headerWhileOrdering('ordering-workflow', () => openChapters(url));
        fact('ordering', r);
        await as(S.P.au);
        await openWizard(S.B.W2.id);
        await toDetails();
        r.wizard = await headerWhileOrdering('ordering-wizard', async () => {
            await page.reload();
            await idle(page);
            await sleep(1200);
            await toDetails();
        });
        fact('ordering', r);
    });

    await sect('orderingWizard', async () => {
        const r = {};
        await as(S.P.au);
        const where = async () => ({step: await currentStep(), url: strip(page.url()), ordering: await list.doneLink().count(), listShown: await list.grid().isVisible().catch(() => false)});
        const links = {order: () => list.orderLink(), addChapter: () => list.addChapterLink(), title: () => list.titleLinks()};
        for (const [key, link] of Object.entries(links)) {
            await openWizard(S.B.W2.id);
            await toDetails();
            const o = {before: await where()};
            await startOrder();
            o.link = await link().first().evaluate((e) => ({text: e.innerText.trim(), disabled: e.getAttribute('disabled'), href: e.getAttribute('href')})).catch(() => null);
            o.presses = [];
            for (let i = 0; i < 2; i++) {
                if (!(await link().first().isVisible().catch(() => false))) break;
                const p = {};
                await link().first().click({timeout: 5000}).catch((e) => { p.clickErr = flat(e.message, 150); });
                await sleep(1500);
                await idle(page);
                Object.assign(p, await where(), {window: await page.locator('form#editChapterForm:visible').count()});
                p.snap = (await snap(`ordering-wizard-${key}-pressed-${i + 1}`, p)).file;
                o.presses.push(p);
            }
            await toDetails();
            o.backOnDetails = {...(await where()), list: brief(await readList())};
            if (await list.doneLink().count()) o.cancel = await cancelOrder();
            r[key] = o;
            fact('orderingWizard', r);
        }
        // The Review panel's "Edit" (note td18), with the "Details" panel's "Edit" as the control.
        {
            const o = {};
            const rv = await readReview();
            o.review = briefR(rv);
            await chaptersPanel().getByRole('button', {name: /Edit/}).first().click();
            await sleep(1500);
            await idle(page);
            o.afterChaptersEdit = await where();
            o.snapChaptersEdit = (await snap('review-chapters-edit-pressed', o.afterChaptersEdit)).file;
            await wizardTo('Review');
            const details = page.locator('.submissionWizard__reviewPanel').filter({has: page.locator('h2, h3').filter({hasText: /^\s*Details\s*$/})}).first();
            await details.getByRole('button', {name: /Edit/}).first().click();
            await sleep(1500);
            await idle(page);
            o.afterDetailsEdit = await where();
            o.snapDetailsEdit = (await snap('review-details-edit-pressed', o.afterDetailsEdit)).file;
            r.reviewEdit = o;
            fact('orderingWizard', r);
        }
    });

    await sect('authorCancel', async () => {
        const r = {};
        const run = async (label, reopen) => {
            const l = await readList();
            const title = l.order.find((x) => (l.authors[x] || []).length > 1);
            const [first, second] = l.authors[title];
            const o = {drag: `${second} above ${first} under "${title}", then "Cancel ordering"`, before: l.authors[title]};
            await startOrder();
            await dragAuthor(title, second, first);
            const ld = await readList();
            o.afterDrop = ld.authors[title];
            o.snapDrop = (await snap(`${label}-author-dropped`, {list: ld})).file;
            o.cancel = await cancelOrder();
            const lc = await readList();
            o.atOnce = lc.authors[title];
            o.snapAtOnce = (await snap(`${label}-author-cancel-at-once`, {list: lc, before: o.before})).file;
            await reopen();
            const lr = await readList();
            o.afterReload = lr.authors[title];
            o.snapAfterReload = (await snap(`${label}-author-cancel-after-reload`, {list: lr, before: o.before})).file;
            return o;
        };
        const id = S.B.WF.id;
        const url = wfUrl(id, bookPub(id));
        await as(S.P.mg);
        await openChapters(url);
        r.workflow = await run('authorcancel-workflow', () => openChapters(url));
        fact('authorCancel', r);
        await as(S.P.au);
        await openWizard(S.B.W1.id);
        await toDetails();
        r.wizard = await run('authorcancel-wizard', async () => {
            await page.reload();
            await idle(page);
            await sleep(1200);
            await toDetails();
        });
        fact('authorCancel', r);
    });

    await sect('tie', async () => {
        const n = Number(process.env.TIE_BOOKS || 4);
        const r = {books: []};
        const t = S.t;
        await as(S.P.mg);
        for (let i = 0; i < n; i++) {
            const b = await app.api.createSubmission({
                tag: `${t}tie${i}${Math.random().toString(36).slice(2, 6)}`, context: t, submitter: S.P.au, title: `I08 Tie Monograph ${i + 1}`,
                contributors: [{givenName: 'Ada', familyName: 'Lovel', email: `${t}ada@mail.test`}, {givenName: 'Ben', familyName: 'Barrow', email: `${t}ben@mail.test`}],
                chapters: [{title: 'Tides', authors: [S.P.au, `${t}ben@mail.test`]}, {title: 'Harbours', authors: [`${t}ada@mail.test`]}, {title: 'Estuaries'}],
            });
            const id = b.submissionId;
            const url = wfUrl(id, bookPub(id));
            await openChapters(url);
            const o = {id, seeded: (await readList()).authors.Tides, moves: []};
            for (let k = 0; k < 3; k++) {
                await startOrder();
                const ord = (await readList()).order;
                await dragChapter(ord[ord.length - 1], ord[0], 'above', 'title');
                const d = await done();
                const at = await readList();
                await openChapters(url);
                const re = await readList();
                const m = {done: d.status, order: re.order, atOnce: at.authors.Tides, afterReload: re.authors.Tides, stored: stored(id).find((x) => /"Tides"/.test(x))};
                if (!same(re.authors.Tides, o.seeded) || !same(at.authors.Tides, o.seeded)) m.snap = (await snap(`tie-book${i + 1}-move${k + 1}-authors-swapped`, {list: re, atOnce: at.authors, seeded: o.seeded})).file;
                o.moves.push(m);
            }
            o.snap = (await snap(`tie-book${i + 1}-after-three-moves`, {list: await readList(), seeded: o.seeded})).file;
            r.books.push(o);
            fact('tie', r);
        }
    });

    fact('all.http4xx5xx', since(bad, 0));
    fact('all.pageErrors', since(pageErrors, 0));
    fact('all.dialogs', since(dialogs, 0));
    await close();
});
