// U46 claim check, chunk I09 (housekeeping 2026-10-09): incidentals row L12 against
// docs/specs/U46-galleys.md Rule 5 and Side effects "No email, no notice" (footnotes g, q10, q18), and
// docs/specs/U35-stage-participants.md Rule 6b / A4. The twin is U09 A11
// (docs/issues/U09-A11-static-page-refusal-repeated-after-save.md): a legacy window whose refused save
// redraws the form keeps the refusal back and shows it as a red notice at the next save or page load.
//
// What the script drives, per run on a scratch context of its own (nothing on `publicknowledge`):
//   galley (OJS, OPS), as the scratch manager, on the publication's "Galleys" page:
//     G0  control: "Edit" › URL Path "ctl1" › "Save", no refusal before it
//     G1  "Edit" › URL Path "123" › "Save" (refused) › "pdf2" › "Save"; then a reload of the page
//     G1b the other end of "once per refusal": "a/b" (refused), "pdf2" (refused, already used), "html2" › "Save"
//     G2  "123" › "Save" (refused) › "Cancel"; then a reload; then the dashboard
//     G2b "123" › "Save" (refused) › the window's header "Close" (and its question); then the dashboard
//     G2c control for G2b: a path typed and not saved › the header "Close" (Rule 6a's question)
//     G3  "Add galley" › "Create New Galley": Galley Label + URL Path "123" › "Save" (refused) › "new1" ›
//         "Save" (the upload wizard opens) › the wizard's "Cancel"; then a reload
//   levels (OJS, OPS): G1 again as the assigned Section editor / Moderator, the assigned Layout Editor
//     (OJS) and the Author of an unposted preprint (OPS)
//   assign (OJS, OMP, OPS), as the scratch manager, the workflow's "Participants" › "Assign":
//     A0  control: role, "Search", a person, "OK", no refusal before it
//     A1  "OK" with nobody chosen (redrawn form) › role, "Search", a person, "OK"; then a reload
//     A2  "OK" with nobody chosen › "Cancel"; then a reload; then the dashboard
//     A3  a person chosen under the previous role › "OK" (redrawn form) › "Cancel"; then a reload
//     A4  control for A3's reload: a person chosen › "Cancel" (no "OK"); then a reload
//     A5  control for A3's reload: the role list and "Search" alone › "Cancel"; then a reload
//     and A1 again as the assigned Section editor / Series editor / Moderator
//   control (OMP): the monograph's Publication side menu (no "Galleys" entry), read only
// Every step records the screen, the page notices shown since the step began (text, colour class, place),
// the answers of the page's notification requests, and the acting user's waiting form-error notifications.
// No assertions: the script records, the reader judges.
//
//   PROBE_FEATURE=U46 PROBE_AGENT=ccI09 PROBE_RUN=r1 node bin/probe.js all shared/playwright/checks/U46/I09/i09.js
//   PHASES=galley,levels,assign,control (default: all)
const {forEachApp, launch, signIn, signOut, screen, shot, record, loc, idle, tag, sql} = require('../../../probe');

const RUN = process.env.PROBE_RUN || 'r0';
const PHASES = (process.env.PHASES || 'galley,levels,assign,control').split(',');
const on = (p) => PHASES.includes(p);
const T = 30_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (s, n = 600) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));
const log = (...a) => console.log(`[i09 ${RUN}]`, ...a);

forEachApp(async (app) => {
    const isOJS = app.name === 'ojs';
    const isOMP = app.name === 'omp';
    const isOPS = app.name === 'ops';
    const hasGalleys = !isOMP;
    const facts = {app: app.name, run: RUN, line: app.line || 'main'};
    const SUB_EDITOR = isOJS ? 'Section editor' : isOMP ? 'Series editor' : 'Moderator';

    // ------------------------------------------------------------------ seed
    const t = tag('u46i09');
    const U = {mg: `${t}mg`, se: `${t}se`, au: `${t}au`, le: isOJS ? `${t}le` : null};
    const cands = ['Cara', 'Cleo', 'Cody', 'Cyra', 'Cael'].map((given, i) => ({username: `${t}c${i + 1}`, given, family: `Cand${i + 1}`, name: `${given} Cand${i + 1}`}));
    const users = [
        {username: U.mg, roles: ['manager'], givenName: 'Mia', familyName: 'Manager'},
        {username: U.se, roles: ['sectionEditor'], givenName: 'Sam', familyName: 'Subeditor'},
        {username: U.au, roles: ['author'], givenName: 'Ari', familyName: 'Author'},
        ...cands.map((c) => ({username: c.username, roles: ['sectionEditor'], givenName: c.given, familyName: c.family})),
    ];
    if (isOJS) users.push({username: U.le, roles: ['layoutEditor'], givenName: 'Lee', familyName: 'Layout'});
    const ctx = await app.api.createContext({tag: t, context: {name: `U46 I09 ${RUN} ${t}`, acronym: 'ININE', contactName: 'I09 Contact', contactEmail: `${t}c@mail.test`}, users});
    const CTX = ctx.path || t;
    const PDFNAME = isOPS ? 'preprint.pdf' : 'article.pdf';
    const HTMLNAME = isOPS ? 'preprint.html' : 'article.html';
    const prod = isOJS ? {files: [{file: 'article.pdf'}], decisions: ['skipExternalReview', 'sendToProduction']} : {};
    const sub = async (k, spec) => {
        const r = await app.api.createSubmission({tag: `${t}${k}`, context: CTX, submitter: U.au, title: `I09 ${k} ${t}`, ...spec});
        log('seed', app.name, k, r.submissionId, r.publicationId);
        return {id: r.submissionId, pub: r.publicationId, galleys: r.galleys};
    };
    const S = {};
    const part = (...keys) => keys.filter((k) => U[k]).map((k) => ({username: U[k], role: k === 'se' ? 'sectionEditor' : 'layoutEditor'}));
    if (hasGalleys) {
        const two = [{label: 'PDF', file: PDFNAME}, {label: 'HTML', file: HTMLNAME}];
        S.g1 = await sub('g1', {...prod, galleys: two});
        S.g2 = await sub('g2', {...prod, galleys: two});
        S.g3 = await sub('g3', {...prod, participants: part('se'), galleys: [{label: 'PDF', file: PDFNAME}]});
        S.g4 = await sub('g4', {...prod, participants: part('le'), galleys: [{label: 'PDF', file: PDFNAME}]});
    }
    S.p1 = await sub('p1', {});
    S.p2 = await sub('p2', {participants: part('se')});
    facts.seed = {context: CTX, users: U, candidates: cands.map((c) => c.name), submissions: S};
    record('seed', facts.seed);

    // ------------------------------------------------------------------ browser and watchers
    const {page, close} = await launch(app);
    const jsDialogs = [];
    let dialogAnswer = 'dismiss';
    page.on('dialog', (d) => {
        jsDialogs.push({at: Date.now(), type: d.type(), message: flat(d.message(), 300), answered: d.type() === 'beforeunload' ? 'accept' : dialogAnswer});
        if (d.type() === 'beforeunload' || dialogAnswer === 'accept') d.accept().catch(() => {});
        else d.dismiss().catch(() => {});
    });
    // Every notice element as it appears: the toasts at the top right, and any legacy notification box.
    await page.context().addInitScript(() => {
        window.__i09 = [];
        const seen = new WeakSet();
        const f = (s) => (s || '').replace(/\s+/g, ' ').trim();
        const sweep = () => {
            document.querySelectorAll('.app__notifications .pkpNotification, .ui-pnotify, .pkp_notification .notifyFormError, .pkp_notification > div').forEach((e) => {
                if (seen.has(e)) return;
                const closer = e.querySelector('.pkpNotification__closeButton');
                let text = f(e.innerText || e.textContent);
                if (closer) text = f(text.replace(f(closer.innerText || closer.textContent), ''));
                if (!text) return;
                seen.add(e);
                window.__i09.push({at: Date.now(), text: text.slice(0, 300), cls: String(e.className).slice(0, 160),
                    where: e.closest('.app__notifications') ? 'top right' : e.closest('[role=dialog]') ? 'in a window' : 'in the page'});
            });
        };
        new MutationObserver(sweep).observe(document, {subtree: true, childList: true, characterData: true});
    });
    // The page's notification requests and what each answered.
    const fetches = [];
    page.on('response', async (r) => {
        if (!/notification\/fetch-?notification/i.test(r.url())) return;
        const at = Date.now();
        let general = null;
        try {
            const j = await r.json();
            const g = j && j.content && j.content.general;
            general = g ? Object.values(g).flatMap((lv) => Object.values(lv)).map((n) => flat(`${n.title || ''} :: ${n.text || ''} [${n.addclass || ''}]`, 300)) : [];
        } catch {
            general = 'unreadable';
        }
        fetches.push({at, status: r.status(), general});
    });
    const noticesSince = async (t0) => page.evaluate((s) => (window.__i09 || []).filter((n) => n.at >= s).map((n) => ({text: n.text, cls: n.cls, where: n.where})), t0).catch(() => []);
    const fetchesSince = (t0) => fetches.filter((x) => x.at >= t0).map((x) => ({status: x.status, general: x.general}));
    const dialogsSince = (t0) => jsDialogs.filter((d) => d.at >= t0).map((d) => `${d.type} (${d.answered}): ${d.message}`);
    // The acting user's waiting trivial notifications (type 7 is the form-error one), read in the database.
    const waiting = (username) => sql(app, `select n.type, count(*) from notifications n join users u on u.user_id = n.user_id where u.username = '${username}' and n.level = 1 group by n.type order by n.type`).split('\n').filter(Boolean).map((l) => l.replace('|', '×'));

    let acting = null;
    const as = async (user) => { await signIn(page, user, {contextPath: CTX}); await idle(page); acting = user; };

    /**
     * One step: drop the notices already seen, run `action`, wait until a notice shows (at most `wait` ms;
     * a shot is taken the moment one does) and two seconds more, then record the settled screen with the
     * notices, notification requests and browser dialogs of the step.
     */
    async function step(name, action, {wait = 3500, extra} = {}) {
        await screen(page).catch(() => {});
        const t0 = Date.now();
        let result = null;
        let error = null;
        try { result = await action(); } catch (e) { error = String(e.message || e).split('\n')[0].slice(0, 300); log(`[${name} action FAILED]`, error); }
        const until = Date.now() + wait;
        let early = [];
        while (Date.now() < until) {
            early = await noticesSince(t0);
            if (early.length) { await shot(page, `${name}-notice`).catch(() => {}); break; }
            await sleep(150);
        }
        await sleep(2000);
        let s;
        try { s = await screen(page); } catch (e) { s = {url: page.url(), error: String(e.message).slice(0, 200)}; }
        const out = {
            result, error,
            notices: await noticesSince(t0),
            kitNotices: s.notices || [],
            notificationRequests: fetchesSince(t0),
            browserDialogs: dialogsSince(t0),
            waitingAfter: acting ? waiting(acting) : null,
            ...(extra ? await extra() : {}),
        };
        record(name, {...s, step: out});
        await shot(page, name).catch(() => {});
        log(`[${app.name} ${name}]`, JSON.stringify(out).slice(0, 1800));
        return out;
    }
    async function sect(name, fn) {
        try { facts[name] = await fn(); } catch (e) {
            log(`[${app.name} ${name} FAILED]`, String(e.stack || e).split('\n').slice(0, 5).join(' | '));
            facts[`${name}.FAILED`] = String(e.message || e).slice(0, 600);
            await shot(page, `zz-failed-${name}`).catch(() => {});
            try { record(`zz-failed-${name}`, await screen(page)); } catch { /* the page is gone */ }
        }
    }

    // ------------------------------------------------------------------ the Galleys page and the galley window
    const vis = '[role="dialog"]:visible';
    const top = () => page.locator(vis).last();
    const gm = () => page.locator('[data-cy="galley-manager"]').first();
    const galleyForm = () => page.locator('form[id$="GalleyForm"]:visible').last();
    const wizard = () => page.getByRole('dialog').filter({has: page.locator('div[id^="fileUploadWizard"]')}).last();
    const dashUrl = (author) => app.url(`/index.php/${CTX}/dashboard/${author ? 'mySubmissions' : 'editorial'}`);
    const wfUrl = (s, key, author) => `${dashUrl(author)}?workflowSubmissionId=${s.id}${key ? `&workflowMenuKey=${key}` : ''}`;

    async function openGalleys(s, {author} = {}) {
        await page.goto('about:blank');
        await page.goto(wfUrl(s, `publication_${s.pub}_galleys`, author));
        await gm().waitFor({state: 'visible', timeout: T});
        await idle(page);
        await sleep(300);
    }
    const galleyRows = () => gm().locator('tbody tr').evaluateAll((trs) => trs.map((tr) => [...tr.querySelectorAll('td,th')].map((c) => c.innerText.replace(/\s+/g, ' ').trim()).filter(Boolean).join(' | ')));
    const rowOf = (label) => gm().locator('tbody tr').filter({has: page.locator('td').first().filter({hasText: new RegExp(`^\\s*${label}\\s*$`)})}).first();
    async function rowEdit(label) {
        const row = rowOf(label);
        await row.waitFor({timeout: T});
        await row.getByRole('button', {name: /More Actions/}).first().click();
        await page.getByRole('menuitem', {name: 'Edit', exact: true}).first().click();
        await galleyForm().locator('input[name="label"]').waitFor({state: 'visible', timeout: T});
        await idle(page);
        await sleep(400);
    }
    // The open galley window: its title, the URL Path box, the line under it, anything marked as an error.
    async function winRead() {
        const form = galleyForm();
        if (!(await form.isVisible().catch(() => false))) return {open: false};
        return top().evaluate((d) => {
            const f = (s) => (s || '').replace(/\s+/g, ' ').trim();
            const v = (e) => e && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
            const form = [...d.querySelectorAll('form[id$="GalleyForm"]')].filter(v).pop();
            const box = form && form.querySelector('input[name="urlPath"]');
            const holder = box && (box.closest('.section') || box.parentElement.parentElement);
            return {
                open: true,
                title: f((d.querySelector('h1,h2') || {}).innerText),
                tabs: [...d.querySelectorAll('[role=tab]')].filter(v).map((x) => f(x.innerText)),
                label: form && form.querySelector('input[name="label"]') ? form.querySelector('input[name="label"]').value : null,
                urlPath: box ? box.value : null,
                urlPathShown: v(box),
                underUrlPath: holder ? f(holder.innerText) : null,
                errors: [...d.querySelectorAll('label.error, .error, .pkp_form_error, .pkp_notification')].filter(v).map((e) => f(e.innerText)).filter(Boolean),
                messageBoxes: form ? form.querySelectorAll('.pkp_notification').length : null,
            };
        }).catch((e) => ({error: String(e.message).slice(0, 300)}));
    }
    async function typePath(value) {
        const el = galleyForm().locator('input[name="urlPath"]');
        await el.fill(value);
        await el.blur().catch(() => {});
    }
    // "Save" in the galley window: the save request's answer, and whether the window is still there after it.
    async function pressSave() {
        const answered = page.waitForResponse((r) => /update-galley/.test(r.url()) && r.request().method() === 'POST', {timeout: T}).catch(() => null);
        await galleyForm().getByRole('button', {name: 'Save', exact: true}).last().click();
        const r = await answered;
        let save = null;
        if (r) {
            const body = await r.text().catch(() => '');
            let j = null;
            try { j = JSON.parse(body); } catch { /* not JSON */ }
            save = {status: r.status(), jsonStatus: j ? j.status : null, answersWithForm: j ? /<form/.test(String(j.content || '')) : null, event: j && j.event ? j.event.name || true : null};
        }
        await sleep(900);
        await idle(page);
        return {save, window: await winRead()};
    }
    async function pressCancel() {
        const f = galleyForm();
        await f.getByRole('link', {name: 'Cancel', exact: true}).or(f.getByRole('button', {name: 'Cancel', exact: true})).first().click();
        await sleep(900);
        await idle(page);
        return {window: await winRead()};
    }
    const reload = async () => { await page.reload(); await gm().waitFor({state: 'visible', timeout: T}).catch(() => {}); await idle(page); return {rows: await galleyRows().catch(() => null)}; };
    const toDashboard = async (author) => { await page.goto(dashUrl(author)); await idle(page); return {url: page.url().replace(/^https?:\/\/[^/]+/, '')}; };

    // G1 for one role: refuse once, then save; then the page reloaded and the galley's window reopened.
    async function refuseThenSave(prefix, s, label, good, {author} = {}) {
        const out = {};
        await openGalleys(s, {author});
        out.rowsBefore = await galleyRows();
        await rowEdit(label);
        out.opened = await winRead();
        out.refused = await step(`${prefix}-1-refused-123`, async () => { await typePath('123'); return pressSave(); });
        out.saved = await step(`${prefix}-2-saved-${good}`, async () => { await typePath(good); return pressSave(); }, {extra: async () => ({rows: await galleyRows().catch(() => null)})});
        out.reloaded = await step(`${prefix}-3-reloaded`, reload);
        await rowEdit(label);
        out.reopened = await winRead();
        record(`${prefix}-4-reopened`, {...(await screen(page)), window: out.reopened});
        await pressCancel();
        return out;
    }

    if (hasGalleys && on('galley')) {
        await as(U.mg);
        await sect('G0-control', async () => {
            const out = {};
            await openGalleys(S.g1);
            record('g0-0-galleys-page', await screen(page));
            await shot(page, 'g0-0-galleys-page');
            await loc(page, 'Galleys page: the table\'s root', gm());
            await loc(page, 'Galleys page: row "PDF" › "More Actions"', rowOf('PDF').getByRole('button', {name: /More Actions/}));
            await rowEdit('PDF');
            out.opened = await winRead();
            record('g0-1-edit-window', {...(await screen(page)), window: out.opened});
            await shot(page, 'g0-1-edit-window');
            await loc(page, 'Galley "Edit" window: the "URL Path" box', galleyForm().locator('input[name="urlPath"]'));
            await loc(page, 'Galley "Edit" window: "Save"', galleyForm().getByRole('button', {name: 'Save', exact: true}));
            out.saved = await step('g0-2-saved-ctl1', async () => { await typePath('ctl1'); return pressSave(); });
            out.reloaded = await step('g0-3-reloaded', reload);
            return out;
        });
        await sect('G1-refuse-then-save', () => refuseThenSave('g1', S.g1, 'PDF', 'pdf2'));
        await sect('G1b-two-refusals-then-save', async () => {
            const out = {};
            await openGalleys(S.g1);
            await rowEdit('HTML');
            out.refusedChars = await step('g1b-1-refused-a-b', async () => { await typePath('a/b'); return pressSave(); });
            out.refusedUsed = await step('g1b-2-refused-pdf2-used', async () => { await typePath('pdf2'); return pressSave(); });
            out.saved = await step('g1b-3-saved-html2', async () => { await typePath('html2'); return pressSave(); }, {extra: async () => ({rows: await galleyRows().catch(() => null)})});
            out.reloaded = await step('g1b-4-reloaded', reload);
            return out;
        });
        await sect('G2-refuse-then-cancel', async () => {
            const out = {};
            await openGalleys(S.g2);
            await rowEdit('PDF');
            out.refused = await step('g2-1-refused-123', async () => { await typePath('123'); return pressSave(); });
            out.cancelled = await step('g2-2-cancel', pressCancel);
            out.reloaded = await step('g2-3-reloaded', reload);
            out.dashboard = await step('g2-4-dashboard', () => toDashboard());
            await openGalleys(S.g2);
            await rowEdit('PDF');
            out.reopened = await winRead();
            await pressCancel();
            return out;
        });
        await sect('G2b-refuse-then-close', async () => {
            const out = {};
            await openGalleys(S.g2);
            await rowEdit('HTML');
            out.refused = await step('g2b-1-refused-123', async () => { await typePath('123'); return pressSave(); });
            dialogAnswer = 'accept';
            out.closed = await step('g2b-2-header-close', async () => {
                await top().getByRole('button', {name: 'Close', exact: true}).first().click();
                await sleep(900);
                await idle(page);
                return {window: await winRead()};
            });
            dialogAnswer = 'dismiss';
            out.dashboard = await step('g2b-3-dashboard', () => toDashboard());
            out.dashboardAgain = await step('g2b-4-dashboard-reloaded', async () => { await page.reload(); await idle(page); return null; });
            return out;
        });
        // The control for G2b's close: a path typed and not saved, then the header "Close" (Rule 6a's question).
        await sect('G2c-typed-then-close', async () => {
            const out = {};
            await openGalleys(S.g2);
            await rowEdit('HTML');
            dialogAnswer = 'accept';
            out.closed = await step('g2c-1-typed-header-close', async () => {
                await typePath('typed-only');
                await top().getByRole('button', {name: 'Close', exact: true}).first().click();
                await sleep(900);
                await idle(page);
                return {window: await winRead()};
            });
            dialogAnswer = 'dismiss';
            return out;
        });
        await sect('G3-create-new-galley', async () => {
            const out = {};
            await openGalleys(S.g2);
            await page.getByRole('button', {name: 'Add galley', exact: true}).first().click();
            await galleyForm().locator('input[name="label"]').waitFor({state: 'visible', timeout: T});
            await idle(page);
            await sleep(400);
            await galleyForm().locator('input[name="label"]').fill('I09 new');
            out.opened = await winRead();
            out.refused = await step('g3-1-create-refused-123', async () => { await typePath('123'); return pressSave(); });
            out.saved = await step('g3-2-create-saved-new1', async () => {
                await typePath('new1');
                const r = await pressSave();
                await wizard().locator('input[type="file"]').waitFor({state: 'attached', timeout: 15_000}).catch(() => {});
                return {...r, wizardOpen: await wizard().isVisible().catch(() => false)};
            });
            out.wizardCancelled = await step('g3-3-wizard-cancel', async () => {
                const w = wizard();
                if (!(await w.isVisible().catch(() => false))) return {wizardOpen: false};
                await w.getByRole('link', {name: 'Cancel', exact: true}).or(w.getByRole('button', {name: 'Cancel', exact: true})).first().click();
                await w.waitFor({state: 'hidden', timeout: 15_000}).catch(() => {});
                await idle(page);
                return {wizardOpen: await w.isVisible().catch(() => false)};
            });
            out.reloaded = await step('g3-4-reloaded', reload);
            return out;
        });
        await signOut(page);
    }

    if (hasGalleys && on('levels')) {
        await sect('L-sub-editor', async () => { await as(U.se); const o = await refuseThenSave('lse', S.g3, 'PDF', 'sepath'); await signOut(page); return o; });
        if (isOJS) await sect('L-layout-editor', async () => { await as(U.le); const o = await refuseThenSave('lle', S.g4, 'PDF', 'lepath'); await signOut(page); return o; });
        if (isOPS) await sect('L-author', async () => { await as(U.au); const o = await refuseThenSave('lau', S.g4, 'PDF', 'aupath', {author: true}); await signOut(page); return o; });
    }

    // ------------------------------------------------------------------ "Assign Participant" (U35)
    if (on('assign')) {
        const {ParticipantsPanel} = require('../../../pages/StageParticipantsPages.js');
        const panel = new ParticipantsPanel(page, CTX);
        const stageKey = isOPS ? 'workflow_5' : null;
        const openWorkflow = async (s) => {
            await page.goto('about:blank');
            await page.goto(wfUrl(s, stageKey));
            await panel.heading().waitFor({timeout: 60_000});
            await idle(page);
        };
        const winState = async (win) => {
            const out = {open: await win.roleSelect().isVisible().catch(() => false)};
            if (!out.open) return out;
            out.role = await win.selectedRole();
            out.people = await win.peopleNames();
            out.chosen = await win.people().evaluateAll((rows) => rows.filter((tr) => tr.querySelector('input[name="userId"]').checked).map((tr) => (tr.querySelectorAll('td')[1]?.textContent || '').replace(/\s+/g, ' ').trim()));
            out.messages = await win.root.locator('.error:visible, label.error:visible, .pkp_form_error:visible, .pkp_notification:visible, [role="alert"]:visible').evaluateAll((els) => els.map((e) => (e.innerText || '').replace(/\s+/g, ' ').trim()).filter(Boolean));
            return out;
        };
        const pressOk = async (win) => {
            const answered = page.waitForResponse((r) => r.url().includes('save-participant'), {timeout: T}).catch(() => null);
            await win.root.getByRole('button', {name: 'OK', exact: true}).click();
            const r = await answered;
            let save = null;
            if (r) {
                const body = await r.text().catch(() => '');
                let j = null;
                try { j = JSON.parse(body); } catch { /* not JSON */ }
                save = {status: r.status(), jsonStatus: j ? j.status : null, answersWithForm: j ? /<form/.test(String(j.content || '')) : null, event: j && j.event ? j.event.name || true : null};
            }
            await sleep(900);
            await idle(page);
            return {save, window: await winState(win)};
        };
        const choose = async (win, person) => { await win.chooseRole(SUB_EDITOR); await win.search(); await win.choosePerson(person); };
        const rows = () => panel.rowLines().catch(() => null);
        const reloadWf = async () => { await page.reload(); await panel.heading().waitFor({timeout: 60_000}).catch(() => {}); await idle(page); return {rows: await rows()}; };

        // A1 for one role: "OK" with nobody chosen, then a person and "OK"; then the page reloaded.
        const nobodyThenAssign = async (prefix, s, person) => {
            const out = {};
            await openWorkflow(s);
            out.rowsBefore = await rows();
            const win = await panel.openAssign();
            await idle(page);
            out.opened = await winState(win);
            out.nobody = await step(`${prefix}-1-ok-nobody`, () => pressOk(win));
            out.assigned = await step(`${prefix}-2-ok-${person.replace(/\s+/g, '-')}`, async () => { await choose(win, person); return pressOk(win); }, {extra: async () => ({rows: await rows()})});
            out.reloaded = await step(`${prefix}-3-reloaded`, reloadWf);
            return out;
        };

        await as(U.mg);
        await sect('A0-control', async () => {
            const out = {};
            await openWorkflow(S.p1);
            record('a0-0-workflow', await screen(page));
            await shot(page, 'a0-0-workflow');
            await loc(page, 'Workflow › "Participants" › "Assign"', panel.assignButton());
            const win = await panel.openAssign();
            await idle(page);
            out.opened = await winState(win);
            out.roles = await win.roleOptions();
            record('a0-1-assign-window', {...(await screen(page)), window: out.opened, roles: out.roles});
            await shot(page, 'a0-1-assign-window');
            await loc(page, '"Assign Participant" window: the role list', win.roleSelect());
            await loc(page, '"Assign Participant" window: "OK"', win.root.getByRole('button', {name: 'OK', exact: true}));
            out.assigned = await step('a0-2-ok-control', async () => { await choose(win, cands[0].name); return pressOk(win); }, {extra: async () => ({rows: await rows()})});
            out.reloaded = await step('a0-3-reloaded', reloadWf);
            return out;
        });
        await sect('A1-nobody-then-assign', () => nobodyThenAssign('a1', S.p1, cands[1].name));
        await sect('A2-nobody-then-cancel', async () => {
            const out = {};
            await openWorkflow(S.p1);
            const win = await panel.openAssign();
            await idle(page);
            out.nobody = await step('a2-1-ok-nobody', () => pressOk(win));
            out.cancelled = await step('a2-2-cancel', async () => { await win.cancelLink().click(); await sleep(900); await idle(page); return {window: await winState(win)}; });
            out.reloaded = await step('a2-3-reloaded', reloadWf);
            out.dashboard = await step('a2-4-dashboard', () => toDashboard());
            return out;
        });
        await sect('A3-previous-role-then-cancel', async () => {
            const out = {};
            await openWorkflow(S.p1);
            const win = await panel.openAssign();
            await idle(page);
            await choose(win, cands[2].name);
            await win.chooseRole('Author');
            out.before = await winState(win);
            out.refused = await step('a3-1-ok-previous-role', () => pressOk(win));
            out.cancelled = await step('a3-2-cancel', async () => { await win.cancelLink().click(); await sleep(900); await idle(page); return {window: await winState(win)}; });
            out.reloaded = await step('a3-3-reloaded', reloadWf);
            return out;
        });
        // Controls for A3's reload (no refused "OK" before the "Cancel"): a person chosen, and the role list
        // and "Search" alone; each then "Cancel" and a reload of the page.
        await sect('A4-chosen-then-cancel', async () => {
            const out = {};
            await openWorkflow(S.p1);
            const win = await panel.openAssign();
            await idle(page);
            await choose(win, cands[2].name);
            out.before = await winState(win);
            out.cancelled = await step('a4-1-chosen-cancel', async () => { await win.cancelLink().click(); await sleep(900); await idle(page); return {window: await winState(win)}; });
            out.reloaded = await step('a4-2-reloaded', reloadWf);
            return out;
        });
        await sect('A5-searched-then-cancel', async () => {
            const out = {};
            await openWorkflow(S.p1);
            const win = await panel.openAssign();
            await idle(page);
            await win.chooseRole(SUB_EDITOR);
            await win.search();
            out.before = await winState(win);
            out.cancelled = await step('a5-1-searched-cancel', async () => { await win.cancelLink().click(); await sleep(900); await idle(page); return {window: await winState(win)}; });
            out.reloaded = await step('a5-2-reloaded', reloadWf);
            return out;
        });
        await signOut(page);
        await sect('A1-sub-editor', async () => { await as(U.se); const o = await nobodyThenAssign('ase', S.p2, cands[3].name); await signOut(page); return o; });
    }

    // ------------------------------------------------------------------ OMP: no galleys (read only)
    if (isOMP && on('control')) {
        await sect('C-omp-publication-menu', async () => {
            await as(U.mg);
            await page.goto('about:blank');
            await page.goto(wfUrl(S.p1, `publication_${S.p1.pub}_titleAbstract`));
            await idle(page);
            await sleep(1500);
            const s = await screen(page);
            const menu = await page.locator('[role="dialog"]:visible nav, [data-cy="workflow-side-menu"], [role="dialog"]:visible [role="navigation"]').first().innerText().catch(() => null);
            record('c-omp-publication-menu', {...s, menu: flat(menu, 1200)});
            await shot(page, 'c-omp-publication-menu');
            await signOut(page);
            return {menu: flat(menu, 1200), hasGalleys: /Galleys/.test(s.text.dialog || ''), hasFormats: /Publication Formats/.test(s.text.dialog || '')};
        });
    }

    record('facts', facts);
    console.log(JSON.stringify(facts, null, 1).slice(0, 200));
    await close();
});
