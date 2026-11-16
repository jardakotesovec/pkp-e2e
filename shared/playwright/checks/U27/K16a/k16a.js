// U27 "Reviewer assignment & management", claim check K16a (housekeeping incidental, 2026-11-16), on `main`:
// the Actors row "Add a reviewer" (search & select, "Add Reviewer": review managers and assistant-level
// participants, any round, including past rounds) read for the one assistant-level group with review-stage
// access on the default groups (Funding Coordinator: OJS stages 1,3; OMP 1,2,3), with a manager-level
// account (Journal/Press editor) and a sub-editor (Section/Series editor) as the positive controls; and
// register entry A31's refusal ("Modify Review" › "Save Changes") re-read for the same account. OPS is the
// read-only control (no review stage, no `funding` key).
//
// Run (the slot's campaign fleet up, `.reports/U27/fleet.json`), twice, each run its own scratch contexts:
//
//   PROBE_RUN=r1 PROBE_FEATURE=U27 PROBE_AGENT=ccK16a PROBE_NOTES_FEATURE=U27 \
//     bin/app-lock.sh shared ojs,omp,ops -- node bin/probe.js all shared/playwright/checks/U27/K16a/k16a.js
//   (PROBE_RUN=r2 for the second, independent run; ONLY=ojs|omp|ops narrows)
//
// PARTS picks parts (comma list; default every part; OPS runs `ops` only):
//   add    the current round's "Add Reviewer" per actor (fc, se, ed): the window as it opens, "Show more
//          details", "Filters" (one filter on, then off), a name typed without Enter, Enter, the error
//          dialog's "OK", "Clear search phrase", then a reviewer selected (from the searched list where the
//          search answered, from the list as it opened where it did not) and added; same page and reload
//   past   a submission on round 2: round 1's "Add Reviewer" per actor (fc, ed), search, a reviewer
//          selected and the window left by its "Close" (unsaved), reopened, added; same page and reload
//   page   a context with 31 spare reviewers: the list's "View additional pages" bar, "Next" (fc, ed)
//   int    OMP only: the Internal Review round's "Add Reviewer" (fc, ed), search, add
//   a31    the Funding Coordinator's "Read Review" › "Modify Review" › "Save Changes" on a seeded review
//   ops    OPS: a manager's workflow of a scratch preprint (no review entry, no "Add Reviewer"), and the
//          test API's answer to a `funding` user (the roster)
//
// No other script, env part or file is read. Outputs: .reports/U27/ccK16a/<part>-<label>-<run>-<app>.json
// (+ .png), per part `<part>-checks-<run>-<app>.json` (one row per claim, the screen's answer and the
// reviewers-API requests the screen sent), and the kit's run record `run-<run>-<app>-*.json`.
const {forEachApp, launch, signIn, screen, shot, record, loc, idle, tag} = require('../../../probe');

const RUN = process.env.PROBE_RUN || 'r0';
const ALL = ['add', 'past', 'page', 'int', 'a31', 'ops'];
const PARTS = process.env.PARTS && process.env.PARTS !== 'all' ? process.env.PARTS.split(',') : ALL;
const log = (...a) => console.log(`[k16a ${RUN}]`, ...a);
const flat = (s, n) => (s == null ? null : String(s).replace(/\s+/g, ' ').trim().slice(0, n || 400));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const T = 30000;

forEachApp(async (app) => {
    const isOPS = app.name === 'ops';
    const isOMP = app.name === 'omp';
    const parts = isOPS ? PARTS.filter((p) => p === 'ops') : PARTS.filter((p) => p !== 'ops' && (p !== 'int' || isOMP));
    const SEND = isOMP ? ['skipInternalReview'] : ['sendExternalReview'];
    const R = (o = {}) => (isOMP ? {stage: 'external', ...o} : o);

    // ---- bookkeeping --------------------------------------------------------------------------------
    let part = 'x'; let checks = []; let facts = {};
    const fact = (k, v) => { facts[k] = v; log(part, k, typeof v === 'string' ? v : JSON.stringify(v).slice(0, 1200)); };
    const check = (id, claim, got, same) => { checks.push({id: `${part}.${id}`, claim, got, same: same === null ? null : !!same}); log(same === null ? 'NOTE ' : same ? 'SAME ' : 'DIFF ', `${part}.${id}`, '|', flat(JSON.stringify(got), 400)); };
    async function runPart(name, fn) {
        part = name; checks = []; facts = {};
        try { await fn(); } catch (e) { const m = String(e.stack || e).split('\n').slice(0, 6).join(' | '); log(`[${name} FAILED]`, m); checks.push({id: `${name}.FAILED`, claim: 'the part runs', got: m, same: false}); }
        record(`${name}-checks`, {part: name, run: RUN, checks, facts});
        log(`== ${name}: ${checks.length} checks, ${checks.filter((c) => c.same === false).length} differ`);
    }

    // ---- one browser per actor, with the reviewers-API traffic it sends ------------------------------
    const browsers = [];
    async function actor(username, ctx) {
        const b = await launch(app);
        const api = []; const legacy = []; const native = [];
        b.page.on('dialog', async (d) => { native.push({type: d.type(), message: d.message()}); await d.accept().catch(() => {}); });
        b.page.on('response', (r) => {
            const u = r.url();
            if (/\/api\/v1\/users\/reviewers/.test(u)) {
                const q = new URL(u).searchParams; const keep = {};
                for (const [k, v] of q) if (k !== '_') keep[k] = v;
                api.push({at: Date.now(), status: r.status(), method: r.request().method(), query: keep});
            } else if (/\$\$\$call\$\$\$\/grid\/users\/reviewer/.test(u) || /\/reviewAssignments\//.test(u)) {
                legacy.push({at: Date.now(), status: r.status(), method: r.request().method(), url: u.replace(/^https?:\/\/[^/]+/, '').split('?')[0]});
            }
        });
        await signIn(b.page, username, {contextPath: ctx});
        await idle(b.page);
        const a = {...b, username, ctx, api, legacy, native, since: (t0) => ({api: api.filter((x) => x.at >= t0).map(({at, ...r}) => r), legacy: legacy.filter((x) => x.at >= t0).map(({at, ...r}) => r), native: native.slice()})};
        browsers.push(a);
        return a;
    }
    async function closeAll() { while (browsers.length) await browsers.pop().close().catch(() => {}); }
    async function snap(page, label) {
        let s;
        try { s = await screen(page); } catch (e) { s = {url: page.url(), error: String(e.message).slice(0, 200)}; }
        record(`${part}-${label}`, s);
        await shot(page, `${part}-${label}`).catch(() => {});
        return s;
    }

    // ---- scratch data ------------------------------------------------------------------------------
    async function context(prefix, people) {
        const J = tag(`u27k16a${prefix}`);
        const u = {}; const n = {};
        for (const [k, g, f] of people) { u[k] = `${J}${k}`; n[k] = `${g} ${f}`; }
        await app.api.createContext({tag: J, context: {contactName: `Contact ${J}`, contactEmail: `${J}c@mail.test`},
            users: people.map(([k, g, f, role]) => ({username: u[k], givenName: g, familyName: f, roles: [role]}))});
        fact(`context-${prefix}`, J);
        return {J, u, n};
    }
    async function seed(c, suffix, spec) {
        const t = `${c.J}${suffix}`;
        const r = await app.api.createSubmission({tag: t, context: c.J, submitter: c.u.au, title: `Submission ${t}`, ...spec});
        fact(`seed-${suffix}`, {id: r.submissionId, rounds: r.reviewRounds});
        return {id: r.submissionId, rounds: r.reviewRounds || [], ctx: c.J};
    }
    const wfUrl = (s, round) => `/index.php/${s.ctx}/dashboard/editorial?workflowSubmissionId=${s.id}${round ? `&workflowMenuKey=workflow_${round.stageId}_${round.id}` : ''}`;
    const MAIN = [['ed', 'Edda', 'Editorly', 'editor'], ['se', 'Sena', 'Sectionly', 'sectionEditor'], ['fc', 'Fern', 'Fundly', 'funding'],
        ['au', 'Avery', 'Authorly', 'author'], ['rv1', 'Rhea', 'Revone', 'externalReviewer'], ['rv2', 'Robin', 'Revtwo', 'externalReviewer'],
        ['rv3', 'Remy', 'Revthree', 'externalReviewer'], ['rv4', 'Rosa', 'Revfour', 'externalReviewer'], ['rv5', 'Rudi', 'Revfive', 'externalReviewer'],
        ['rv6', 'Raya', 'Revsix', 'externalReviewer']];
    const PEOPLE = (c) => [{username: c.u.ed, role: 'editor'}, {username: c.u.se, role: 'sectionEditor'}, {username: c.u.fc, role: 'funding'}];
    let main = null;
    async function mainContext() {
        if (main) return main;
        const people = MAIN.slice();
        if (isOMP) people.push(['iv1', 'Ivo', 'Intone', 'internalReviewer'], ['iv2', 'Ines', 'Inttwo', 'internalReviewer']);
        main = await context('m', people);
        return main;
    }

    // ---- the Add Reviewer window ---------------------------------------------------------------------
    const modalOf = (page) => page.getByRole('dialog').filter({has: page.locator('.listPanel--selectReviewer')}).last();
    const errorDlg = (page) => page.locator('[data-cy="dialog"]').filter({hasText: 'does not have access'});
    const openDialogs = (page) => page.evaluate(() => [...document.querySelectorAll('[data-cy="dialog"]')].filter((d) => d.getClientRects().length).map((d) => d.innerText.replace(/\s+/g, ' ').trim().slice(0, 300)));
    async function listRead(page) {
        return modalOf(page).evaluate((m) => {
            const panels = [...m.querySelectorAll('.listPanel--selectReviewer')];
            const p = panels[panels.length - 1];
            if (!p) return null;
            const items = [...p.querySelectorAll('.listPanel__item')].filter((x) => x.getClientRects().length);
            const nav = p.querySelector('nav');
            const input = p.querySelector('input.pkpSearch__input');
            return {
                items: items.map((x) => x.innerText.replace(/\s+/g, ' ').trim().slice(0, 160)),
                selects: [...p.querySelectorAll('button')].filter((b) => b.getClientRects().length).map((b) => (b.innerText || '').replace(/\s+/g, ' ').trim()).filter((t) => /^Select /.test(t) || /^Select Reviewer/.test(t)),
                empty: (p.querySelector('.listPanel__empty') || {}).innerText || null,
                search: input ? input.value : null,
                nav: nav ? {label: nav.getAttribute('aria-label'), buttons: [...nav.querySelectorAll('button')].map((b) => ({t: b.innerText.trim(), aria: b.getAttribute('aria-label'), current: b.getAttribute('aria-current'), disabled: b.disabled}))} : null,
                sidebar: !!p.querySelector('.pkpListPanel__sidebar, .listPanel__sidebar') && !!(p.querySelector('.pkpListPanel__sidebar, .listPanel__sidebar') || {}).getClientRects().length,
                headerButtons: [...p.querySelectorAll('.pkpHeader button')].filter((b) => b.getClientRects().length).map((b) => (b.innerText || b.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim()),
                createLinks: [...m.querySelectorAll('a, button')].filter((b) => b.getClientRects().length).map((b) => (b.innerText || '').trim()).filter((t) => /^(Create New Reviewer|Enroll Existing User)$/.test(t)),
            };
        }).catch((e) => ({error: flat(e.message, 200)}));
    }
    async function dismissError(page) {
        const d = errorDlg(page);
        if (await d.count()) { await d.getByRole('button', {name: 'OK', exact: true}).first().click().catch(() => {}); await sleep(500); return true; }
        return false;
    }
    /** One step on the open window: act, settle, snapshot, read the list, the dialogs and the API calls it sent. */
    async function step(a, label, act) {
        const t0 = Date.now();
        if (act) await act();
        await idle(a.page); await sleep(1500);
        const s = await snap(a.page, label);
        const out = {snap: `${part}-${label}-${RUN}-${app.name}`, dialogs: await openDialogs(a.page), list: await listRead(a.page), notices: s.notices, ...a.since(t0)};
        out.error = out.dialogs.find((d) => /does not have access/.test(d)) || null;
        return out;
    }
    async function openWindow(a, s, round, label) {
        await a.page.goto(wfUrl(s, round));
        await idle(a.page);
        const add = a.page.getByRole('button', {name: 'Add Reviewer', exact: true}).first();
        await add.waitFor({timeout: T}).catch(() => {});
        await idle(a.page);
        const before = await snap(a.page, `${label}-round`);
        const offered = await add.isVisible().catch(() => false);
        const heading = flat(await a.page.getByRole('heading', {name: /^Workflow:/}).first().innerText().catch(() => null), 120);
        if (!offered) return {offered, heading, text: flat(before.text && (before.text.dialog || before.text.main), 600)};
        await loc(a.page, 'Reviewers panel: "Add Reviewer" button', add);
        const r = await step(a, `${label}-opened`, async () => {
            await add.click();
            await modalOf(a.page).locator('input.pkpSearch__input').waitFor({timeout: T});
        });
        return {offered, heading, opened: r};
    }
    async function pickAndAdd(a, name, label, {leaveFirst = false} = {}) {
        const m = modalOf(a.page);
        const pick = m.getByRole('button', {name: `Select ${name}`, exact: true}).first();
        const visible = await pick.isVisible().catch(() => false);
        if (!visible) return {pickVisible: false};
        await loc(a.page, `Add Reviewer: "Select ${name}"`, pick);
        await pick.click();
        const submit = m.getByRole('button', {name: 'Add Reviewer', exact: true});
        await submit.waitFor({timeout: T}).catch(() => {});
        await m.frameLocator('iframe[id^="personalMessage"]').locator('body').filter({hasText: /\S/}).waitFor({timeout: T}).catch(() => {});
        await idle(a.page); await sleep(800);
        const form = await step(a, `${label}-form`);
        const out = {pickVisible: true, formShown: await submit.isVisible().catch(() => false), form: {dialogs: form.dialogs, api: form.api, error: form.error}};
        if (leaveFirst) {
            // Leave the window with a reviewer selected and the form unsent: its top "Close".
            const t0 = Date.now();
            await m.getByRole('button', {name: 'Close', exact: true}).first().click();
            await sleep(1500); await idle(a.page);
            const s = await snap(a.page, `${label}-left`);
            out.left = {windowOpen: await m.isVisible().catch(() => false), dialogs: await openDialogs(a.page), notices: s.notices, ...a.since(t0)};
            out.left.native = a.native.slice(-3);
            await sleep(600);
            return out;
        }
        if (!out.formShown) return out;
        const t0 = Date.now();
        await submit.click();
        await m.waitFor({state: 'hidden', timeout: T}).catch(() => {});
        await idle(a.page); await sleep(1000);
        const s1 = await snap(a.page, `${label}-added`);
        out.added = {notices: s1.notices, windowOpen: await m.isVisible().catch(() => false), dialogs: await openDialogs(a.page), ...a.since(t0)};
        out.added.rows = await reviewerRows(a.page);
        return out;
    }
    const reviewerRows = (page) => page.getByRole('table', {name: 'Reviewers', exact: true}).getByRole('row').allInnerTexts().then((x) => x.map((r) => flat(r, 140))).catch(() => null);
    async function reloadRows(a, s, round, label) {
        await a.page.goto(wfUrl(s, round)); await idle(a.page);
        await a.page.getByRole('table', {name: 'Reviewers', exact: true}).waitFor({timeout: T}).catch(() => {});
        await idle(a.page);
        await snap(a.page, label);
        return reviewerRows(a.page);
    }
    const searchBox = (page) => modalOf(page).locator('input.pkpSearch__input');
    async function search(a, phrase, label) {
        const box = searchBox(a.page);
        await box.fill(phrase);
        return step(a, label, () => box.press('Enter'));
    }

    // =================================================================================================
    const P = {};
    P.add = async () => {
        const c = await mainContext();
        const s = await seed(c, 'a', {decisions: SEND, participants: PEOPLE(c), reviewRounds: [R({reviewers: [{username: c.u.rv1, status: 'completed'}]})]});
        const round = s.rounds[0];
        const picks = {fc: 'rv2', se: 'rv3', ed: 'rv4'};
        for (const k of ['fc', 'se', 'ed']) {
            const a = await actor(c.u[k], c.J);
            const w = await openWindow(a, s, round, k);
            const got = {offered: w.offered, heading: w.heading};
            if (w.offered) {
                const o = w.opened;
                got.opened = {selects: o.list && o.list.selects, items: o.list && o.list.items, headerButtons: o.list && o.list.headerButtons, createLinks: o.list && o.list.createLinks, error: o.error, api: o.api};
                await loc(a.page, 'Add Reviewer: search box', searchBox(a.page));
                // Sweep: an entry's "Show more details about {name}" (client side).
                const more = modalOf(a.page).getByRole('button', {name: `Show more details about ${c.n[picks[k]]}`, exact: true}).first();
                if (await more.isVisible().catch(() => false)) {
                    const d = await step(a, `${k}-details`, () => more.click());
                    got.details = {api: d.api, error: d.error, item: d.list && d.list.items && d.list.items.find((x) => x.includes(c.n[picks[k]]))};
                    await more.click().catch(() => {}); await sleep(400);
                } else got.details = 'no "Show more details" for the pick';
                // Sweep: "Filters", one filter enabled, then removed.
                const filters = modalOf(a.page).getByRole('button', {name: 'Filters', exact: true}).first();
                if (await filters.isVisible().catch(() => false)) {
                    await loc(a.page, 'Add Reviewer: "Filters" button', filters);
                    const f0 = await step(a, `${k}-filters`, () => filters.click());
                    const addF = modalOf(a.page).locator('button.pkpFilter__add').first();
                    const addName = flat(await addF.innerText().catch(() => null), 80);
                    const f1 = await step(a, `${k}-filter-on`, () => addF.click());
                    await dismissError(a.page);
                    const remF = modalOf(a.page).locator('button.pkpFilter__remove').first();
                    const remName = flat(await remF.innerText().catch(() => null), 80);
                    const f2 = await step(a, `${k}-filter-off`, () => remF.click({timeout: 5000}).catch(() => {}));
                    await dismissError(a.page);
                    got.filters = {sidebarText: flat(f0.list && f0.list.headerButtons, 200), add: addName, on: {api: f1.api, error: f1.error, selects: f1.list && f1.list.selects, empty: f1.list && f1.list.empty}, remove: remName,
                        off: {api: f2.api, error: f2.error, selects: f2.list && f2.list.selects}};
                    await filters.click().catch(() => {}); await sleep(400);
                } else got.filters = 'no "Filters" button';
                // A name typed without Enter.
                const box = searchBox(a.page);
                const typed = await step(a, `${k}-typed`, () => box.fill(c.n[picks[k]]));
                got.typed = {api: typed.api, error: typed.error, selects: typed.list && typed.list.selects};
                // Enter.
                const sr = await step(a, `${k}-searched`, () => box.press('Enter'));
                got.searched = {api: sr.api, error: sr.error, dialogs: sr.dialogs, selects: sr.list && sr.list.selects, search: sr.list && sr.list.search};
                if (sr.error) {
                    const okd = await step(a, `${k}-after-ok`, () => dismissError(a.page));
                    got.afterOk = {dialogs: okd.dialogs, selects: okd.list && okd.list.selects, items: okd.list && okd.list.items, search: okd.list && okd.list.search, empty: okd.list && okd.list.empty};
                }
                // "Clear search phrase".
                const clear = modalOf(a.page).getByRole('button', {name: 'Clear search phrase', exact: true}).first();
                if (await clear.isVisible().catch(() => false)) {
                    await loc(a.page, 'Add Reviewer: "Clear search phrase"', clear);
                    const cl = await step(a, `${k}-cleared`, () => clear.click());
                    got.cleared = {api: cl.api, error: cl.error, selects: cl.list && cl.list.selects, search: cl.list && cl.list.search};
                    await dismissError(a.page);
                } else got.cleared = 'no "Clear search phrase" button';
                // The positive controls search again and pick from the searched list; the Coordinator picks
                // from the list as it stands.
                if (!sr.error) {
                    const again = await search(a, c.n[picks[k]], `${k}-searched2`);
                    got.searched2 = {api: again.api, error: again.error, selects: again.list && again.list.selects};
                }
                got.add = await pickAndAdd(a, c.n[picks[k]], `${k}-pick`);
                got.reloaded = await reloadRows(a, s, round, `${k}-reloaded`);
            }
            fact(`add-${k}`, got);
            const searchedOk = got.searched && !got.searched.error && got.searched.api.some((x) => x.status === 200 && x.query.searchPhrase);
            const addedOk = got.add && got.add.added && (got.add.added.notices || []).some((n) => n.includes('was assigned to review this submission')) && (got.reloaded || []).some((r) => r.includes(c.n[picks[k]]));
            check(`${k}.search`, `Actors "Add a reviewer": the ${k} account's typed search (Enter) lists matching reviewers`, got.searched, searchedOk);
            check(`${k}.add`, `Actors "Add a reviewer": the ${k} account selects and adds a reviewer (notice, row after reload)`, {add: got.add, reloaded: got.reloaded}, addedOk);
            await closeAll();
        }
    };

    P.past = async () => {
        const c = await mainContext();
        const s = await seed(c, 'p', {decisions: SEND, participants: PEOPLE(c), reviewRounds: [R({reviewers: [{username: c.u.rv1, status: 'completed'}]}), R({reviewers: []})]});
        const r1 = s.rounds.find((x) => x.round === 1) || s.rounds[0];
        const picks = {fc: 'rv5', ed: 'rv6'};
        for (const k of ['fc', 'ed']) {
            const a = await actor(c.u[k], c.J);
            const w = await openWindow(a, s, r1, `${k}-r1`);
            const got = {offered: w.offered, heading: w.heading};
            if (w.offered) {
                got.opened = {selects: w.opened.list && w.opened.list.selects, error: w.opened.error, api: w.opened.api};
                const sr = await search(a, c.n[picks[k]], `${k}-r1-searched`);
                got.searched = {api: sr.api, error: sr.error, dialogs: sr.dialogs, selects: sr.list && sr.list.selects};
                await dismissError(a.page);
                got.leave = await pickAndAdd(a, c.n[picks[k]], `${k}-r1-pick`, {leaveFirst: true});
                const w2 = await openWindow(a, s, r1, `${k}-r1-again`);
                got.reopened = {selects: w2.opened && w2.opened.list && w2.opened.list.selects};
                if (!sr.error) await search(a, c.n[picks[k]], `${k}-r1-searched2`);
                got.add = await pickAndAdd(a, c.n[picks[k]], `${k}-r1-pick2`);
                got.reloaded = await reloadRows(a, s, r1, `${k}-r1-reloaded`);
            }
            fact(`past-${k}`, got);
            const addedOk = got.add && got.add.added && (got.add.added.notices || []).some((n) => n.includes('was assigned to review this submission')) && (got.reloaded || []).some((r) => r.includes(c.n[picks[k]]));
            check(`${k}.offered`, `Actors "Add a reviewer" (past rounds): round 1's "Add Reviewer" offered to ${k} with round 2 open`, {offered: got.offered, heading: got.heading}, got.offered);
            check(`${k}.search`, `Actors "Add a reviewer" (past rounds): ${k}'s typed search on round 1`, got.searched, got.searched && !got.searched.error);
            check(`${k}.add`, `Actors "Add a reviewer" (past rounds): ${k} adds a reviewer to round 1 (notice, row after reload)`, {add: got.add, reloaded: got.reloaded}, addedOk);
            await closeAll();
        }
    };

    P.page = async () => {
        const people = [['ed', 'Edda', 'Editorly', 'editor'], ['fc', 'Fern', 'Fundly', 'funding'], ['au', 'Avery', 'Authorly', 'author']];
        for (let i = 1; i <= 31; i++) people.push([`p${String(i).padStart(2, '0')}`, `Pat${String(i).padStart(2, '0')}`, `Pagerly`, 'externalReviewer']);
        const c = await context('g', people);
        const s = await seed(c, 'g', {decisions: SEND, participants: [{username: c.u.ed, role: 'editor'}, {username: c.u.fc, role: 'funding'}], reviewRounds: [R({reviewers: []})]});
        for (const k of ['fc', 'ed']) {
            const a = await actor(c.u[k], c.J);
            const w = await openWindow(a, s, s.rounds[0], `${k}`);
            const got = {offered: w.offered};
            if (w.offered) {
                const l = w.opened.list || {};
                got.opened = {count: (l.selects || []).length, first: (l.selects || [])[0], last: (l.selects || []).slice(-1)[0], nav: l.nav, error: w.opened.error, api: w.opened.api};
                const next = modalOf(a.page).getByRole('navigation').getByRole('button', {name: /Next/}).first();
                if (await next.isVisible().catch(() => false)) {
                    await loc(a.page, 'Add Reviewer: pagination "Next"', next);
                    const n = await step(a, `${k}-next`, () => next.click());
                    got.next = {api: n.api, error: n.error, dialogs: n.dialogs, count: ((n.list || {}).selects || []).length, selects: (n.list || {}).selects, nav: (n.list || {}).nav};
                    if (n.error) {
                        const ok = await step(a, `${k}-next-ok`, () => dismissError(a.page));
                        got.nextOk = {count: ((ok.list || {}).selects || []).length, first: ((ok.list || {}).selects || [])[0], nav: (ok.list || {}).nav};
                    }
                } else got.next = 'no "Next" in the window';
            }
            fact(`page-${k}`, got);
            check(`${k}.next`, `Rule 5 "View additional pages": ${k}'s "Next" shows the 31st reviewer`, got.next, got.next && !got.next.error && got.next.count >= 1);
            await closeAll();
        }
    };

    P.int = async () => {
        const c = await mainContext();
        const s = await seed(c, 'i', {decisions: ['sendInternalReview'], participants: PEOPLE(c), reviewRounds: [{stage: 'internal', reviewers: []}]});
        const round = s.rounds[0];
        const picks = {fc: 'iv1', ed: 'iv2'};
        for (const k of ['fc', 'ed']) {
            const a = await actor(c.u[k], c.J);
            const w = await openWindow(a, s, round, `${k}-int`);
            const got = {offered: w.offered, heading: w.heading};
            if (w.offered) {
                got.opened = {selects: w.opened.list && w.opened.list.selects, error: w.opened.error, api: w.opened.api};
                const sr = await search(a, c.n[picks[k]], `${k}-int-searched`);
                got.searched = {api: sr.api, error: sr.error, dialogs: sr.dialogs, selects: sr.list && sr.list.selects};
                await dismissError(a.page);
                got.add = await pickAndAdd(a, c.n[picks[k]], `${k}-int-pick`);
                got.reloaded = await reloadRows(a, s, round, `${k}-int-reloaded`);
            }
            fact(`int-${k}`, got);
            const addedOk = got.add && got.add.added && (got.add.added.notices || []).some((n) => n.includes('was assigned to review this submission')) && (got.reloaded || []).some((r) => r.includes(c.n[picks[k]]));
            check(`${k}.search`, `Actors "Add a reviewer" (Internal Review): ${k}'s typed search`, got.searched, got.searched && !got.searched.error);
            check(`${k}.add`, `Actors "Add a reviewer" (Internal Review): ${k} adds a reviewer`, {add: got.add, reloaded: got.reloaded}, addedOk);
            await closeAll();
        }
    };

    P.a31 = async () => {
        const c = await mainContext();
        const s = await seed(c, 'r', {decisions: SEND, participants: PEOPLE(c), reviewRounds: [R({reviewers: [{username: c.u.rv1, status: 'completed'}]})]});
        const round = s.rounds[0];
        const a = await actor(c.u.fc, c.J);
        await a.page.goto(wfUrl(s, round)); await idle(a.page);
        const row = a.page.getByRole('table', {name: 'Reviewers', exact: true}).getByRole('row').filter({hasText: c.n.rv1}).first();
        await row.waitFor({timeout: T});
        await snap(a.page, 'fc-round');
        const got = {};
        await row.getByRole('button', {name: 'Read Review', exact: true}).click();
        const rd = a.page.getByRole('dialog', {name: /^Review Details:/}).last();
        await rd.waitFor({timeout: T});
        await rd.getByRole('button', {name: 'Modify Review', exact: true}).and(a.page.locator(':enabled')).waitFor({timeout: T}).catch(() => {});
        await idle(a.page);
        const v = await snap(a.page, 'fc-details');
        got.details = {buttons: (await rd.getByRole('button').allInnerTexts().catch(() => [])).map((x) => x.trim()).filter(Boolean), text: flat(v.text && v.text.dialog, 300)};
        await rd.getByRole('button', {name: 'Modify Review', exact: true}).click();
        const conf = a.page.locator('[data-cy="dialog"]').filter({hasText: 'Modify this review?'}).last();
        await conf.waitFor({timeout: T});
        got.confirm = flat(await conf.innerText(), 300);
        await snap(a.page, 'fc-modify-confirm');
        await conf.getByRole('button', {name: 'Modify Review', exact: true}).click();
        const mr = a.page.getByRole('dialog', {name: 'Modify Review'}).last();
        await mr.getByRole('button', {name: 'Save Changes', exact: true}).waitFor({timeout: T});
        await idle(a.page); await sleep(1500);
        // An entry in the comments box (the editor frame), typed.
        const frame = mr.locator('iframe[id*="comments"]').first();
        if (await frame.count()) {
            const id = await frame.getAttribute('id');
            const body = a.page.frameLocator(`iframe[id="${id}"]`).locator('body');
            await body.click(); await a.page.keyboard.press('End'); await body.pressSequentially(' K16a edit', {delay: 10});
            got.typed = true;
        } else got.typed = false;
        await snap(a.page, 'fc-modify');
        const t0 = Date.now();
        await mr.getByRole('button', {name: 'Save Changes', exact: true}).click();
        await idle(a.page); await sleep(2000);
        const sv = await snap(a.page, 'fc-saved');
        got.save = {dialogs: await openDialogs(a.page), notices: sv.notices, ...a.since(t0)};
        await dismissError(a.page);
        fact('a31-fc', got);
        check('fc.save', 'A31: the Funding Coordinator\'s "Save Changes" in "Modify Review" answers "Error" / "The current role does not have access to this operation." / "OK"', got.save,
            got.save.dialogs.some((d) => d.includes('The current role does not have access to this operation.')));
        await closeAll();
    };

    P.ops = async () => {
        const c = await context('o', [['mgr', 'Mona', 'Managerly', 'manager'], ['au', 'Avery', 'Authorly', 'author']]);
        let roster = null;
        try { await app.api.createContext({tag: tag('u27k16aof'), users: [{username: `${tag('u27k16aou')}fc`, roles: ['funding']}]}); roster = 'accepted'; } catch (e) { roster = flat(e.message, 600); }
        fact('ops-funding-key', roster);
        const s = await seed(c, 'o', {});
        const a = await actor(c.u.mgr, c.J);
        await a.page.goto(wfUrl(s)); await idle(a.page);
        await a.page.getByRole('heading', {name: /^Workflow:/}).first().waitFor({timeout: T}).catch(() => {});
        await idle(a.page);
        const v = await snap(a.page, 'mgr-workflow');
        const menu = (await a.page.getByRole('dialog').last().locator('nav a, nav button').allInnerTexts().catch(() => [])).map((x) => x.trim()).filter(Boolean);
        const addCount = await a.page.getByRole('button', {name: 'Add Reviewer', exact: true}).count();
        fact('ops-workflow', {menu, addCount, title: flat(v.text && v.text.dialog, 200)});
        check('control', 'OPS control: no review entry in the workflow menu and no "Add Reviewer"', {menu, addCount, roster}, addCount === 0 && !menu.some((m) => /Review/.test(m)));
        await closeAll();
    };

    for (const p of parts) await runPart(p, P[p]);
    await closeAll();
});
