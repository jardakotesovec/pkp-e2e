// U41 drift sweep 2026-11-20, chunk SW20 (the whole spec): the body's screen claims, the scenarios as walked, and
// the register entries no kept walk reads (A2, A4, A6, A8, A11, A13, A16, A17, A18, A19, A21, A22, OMP1, OMP2, OPS1).
// Spec: docs/specs/U41-contributors-and-affiliations.md. Records; asserts nothing: the reader judges.
//
// Run (scenario fleet, one app per process; PROBE_RUN r1 then r2; every part seeds its own scratch context, tag
// prefix u41sw20, so a later build re-runs it as is; publicknowledge and the roster are never touched):
//   bin/app-lock.sh shared ojs -- env PROBE_FEATURE=U41 PROBE_AGENT=ccSW20 PROBE_RUN=r1 \
//       node bin/probe.js ojs shared/playwright/checks/U41/SW20/sw20.js
//   PART=access,form,affil,rorerr,order,primary,roles,reader,ci,french,review narrows (default: all eleven; review is
//   OJS/OMP).
//   The dataset part (PART=dataset, Rule 16's registry-backed entry on a language with no two-letter code) runs on
//   a dataset fleet reset first, and only alone:
//   npm run fleet-prep -- --feature U41-sw-d3 --dataset 3 --reset
//   PROBE_FEATURE=U41-sw-d3 PROBE_AGENT=ccSW20 PROBE_NOTES_FEATURE=U41 PROBE_RUN=r1 PART=dataset \
//       node bin/probe.js all shared/playwright/checks/U41/SW20/sw20.js
// No other script or file is read. Outputs: .reports/<feature>/ccSW20/<part>-<step>-<run>-<app>.{json,png} (screen
// snapshots), facts-<part>-<run>-<app>.json (one key per step), run-<run>-<app>-*.json (the kit's run record).
//
//   access   one scratch context; each permission level from the roster signs in and types the workflow
//            Contributors address of a submitted item (and of a published one): manager, editor (OJS, OMP),
//            assigned section editor, guest editor (OJS), assigned assistant, the submitter, a reviewer (OJS, OMP),
//            a reader, the site administrator. Read: the Publication menu, the panel's header buttons, each row's
//            badges and buttons, the published banner, the Funding page's controls (Actors; Rules 2, 3, 9; A6;
//            OPS1). The submitter's draft in the wizard: the Contributors step, a co-author added, the Review step
//            (Actors row 3; A1's Review line).
//   form     a manager on a submitted item: S1 walked (the empty save, a bad Email and Homepage URL, the person, the
//            type switch, Edit, Close and Escape, the CRediT table, Anonymous, Delete, the log and the mailbox,
//            Set Primary Contact), plus A4 (a typed ROR ID through a type switch), A8 (unpicked text), A16 (the
//            submitter's own row), A18 (Anonymous saved bare), A19 (the email label), two CRediT rows on one role.
//   affil    a manager on a context with two submission languages: S4 walked, the search box below four
//            characters, "Add" before a pick, the box disabled while picked, the order of adding, A17 (box count
//            on items whose titles differ in languages), and Change Submission Language (Side effects).
//   rorerr   the three "ROR API Error" dialogs (the browser's registry answer made 429, 503, 410) and what the search
//            does after each, after a wait, and in the panel closed and reopened (A11).
//   order    S2 walked (Preview, Save Order, Cancel, a new version, the copy edited independently), the
//            Abbreviated format led by a given-name-only person, an organization and Anonymous, a contributor added
//            after a saved order, "Save" unchanged in Edit.
//   primary  S3 walked (the badge moved, the log, deleting the primary contact, the publish window, the last
//            contributor deleted).
//   roles    S5 walked on a context with French under "Forms" (Add Role with English only: A13; Edit Role; A22;
//            the delete refusals and "Role Deleted"; A12's label), and who reaches the screen.
//   reader   S6, S7 and (OMP) S10 walked on a scratch context: landing page, listing, author biographies, the
//            five-contributor book (OMP1), the edited volume (OMP2), the publication-lists tick (A3), the citation
//            tags.
//   ci       S8 walked; OPS2's label read.
//   french   S13 walked (A21, A22's French box, Rule 15a) and the CRediT degree on the French landing page.
//   review   S11 walked (OJS, OMP): the publication the reviewer's "View All Submission Details" fetched.
//   extra    ORCID enabled (the form's fields per type), the CRediT graying with two distinct rows, an Anonymous
//            contributor on the reader pages (Rule 3). Not in the default list: PART=extra.
//   profile  the submitter's profile affiliation (users[].affiliation, English only) in the contributor record of a
//            submission in English and of one in French (Cross-feature interactions). Not in the default list.
//   upgraded (dataset fleet loaded from stable-3_5_0 and upgraded: reset with PKP_E2E_DATASET_BRANCH=stable-3_5_0
//            npm run fleet-prep -- --feature U41-sw-d3 --dataset 3 --reset, then PART=upgraded) the Contributor Roles
//            table and the contributor form's roles field after the upgrade (Rule 11, A14).
//   dataset  (dataset fleet) a registry-backed affiliation on a journal taking Central Kurdish, saved from "Edit"
//            unchanged (Rule 16).
const {forEachApp, launch, signIn, screen, shot, record, idle, tag, sql} = require('../../../probe');

const RUN = process.env.PROBE_RUN || 'r0';
const ALL = ['access', 'form', 'affil', 'rorerr', 'order', 'primary', 'roles', 'reader', 'ci', 'french', 'review'];
const PARTS = (process.env.PART || ALL.join(',')).split(',');
const T = 30_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (s, n = 800) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));
const SFU = {ror: 'https://ror.org/0213rcc28', name: 'Simon Fraser University', country: 'Canada'};
const FORM_DIALOG = /^(Add Contributor|Edit)$/;

forEachApp(async (app) => {
    const A = app.name;
    const log = (...a) => console.log(`[sw20 ${RUN} ${A}]`, ...a);
    const facts = {};
    let part = '';
    const fact = (k, v) => {
        facts[part] = facts[part] || {};
        facts[part][k] = v;
        log(`${part}.${k}: ${flat(JSON.stringify(v), 1500)}`);
        record(`facts-${part}`, facts[part]);
    };
    const cu = (ctx, p = '') => `/index.php/${ctx}/en${p}`;
    const published = A === 'omp' ? {decisions: ['skipExternalReview', 'sendToProduction'], published: true} : {published: true};
    const LANDING = {ojs: 'article/view', omp: 'catalog/book', ops: 'preprint/view'}[A];
    const GROUP = A === 'ops' ? 'Preprint' : 'Publication';

    // ------------------------------------------------------------------ seeding
    const mkContext = async (suffix, {users = ['mg', 'au'], context = {}, extra = {}} = {}) => {
        const t = tag(`u41sw20${suffix}`);
        const defs = {
            mg: ['manager', 'Mona', 'Manager'],
            ed: ['editor', 'Eddie', 'Editor'],
            se: ['sectionEditor', 'Sid', 'Subeditor'],
            ge: ['guestEditor', 'Greta', 'Guest'],
            as: [A === 'ops' ? 'editorialBoardMember' : 'copyeditor', 'Asa', 'Assistant'],
            au: ['author', 'Ada', 'Author'],
            au2: ['author', 'Bea', 'Other'],
            rv: ['externalReviewer', 'Rex', 'Reviewer'],
            rd: ['reader', 'Rae', 'Reader'],
        };
        const list = users.map((u) => ({username: `${t}${u}`, roles: [defs[u][0]], givenName: defs[u][1], familyName: defs[u][2], email: `${t}${u}@mail.test`}));
        const ctx = await app.api.createContext({tag: t, users: list, context: {name: `U41 SW20 ${suffix} ${t}`, contactName: 'Paula Principal', contactEmail: `principal${t}@mail.test`, ...context}, ...extra});
        const out = {t, path: ctx.path || t, issues: ctx.issues || []};
        for (const u of users) out[u] = `${t}${u}`;
        return out;
    };
    const mkSub = async (C, key, extra = {}) => {
        const s = await app.api.createSubmission({tag: `${C.t}${key}`, context: C.path, submitter: C.au, title: `SW20 ${key} ${C.t}`, ...extra});
        return {id: s.submissionId, pub: s.publicationId, contributors: s.contributors || []};
    };
    const ROBIN = {givenName: 'Robin', familyName: 'Okafor', email: 'robin@example.test', country: 'CA'};

    // ------------------------------------------------------------------ browser and traffic
    const {page, close} = await launch(app);
    const dialogs = [];
    page.on('dialog', async (d) => {
        dialogs.push({at: Date.now(), type: d.type(), message: flat(d.message(), 300)});
        await (d.type() === 'beforeunload' ? d.accept() : d.dismiss()).catch(() => {});
    });
    const writes = [];
    let ror = {mode: 'records', records: [SFU], hits: []};
    await page.route('https://api.ror.org/**', (route) => {
        const url = decodeURIComponent(route.request().url());
        ror.hits.push({at: Date.now(), url: flat(url, 200), mode: ror.mode});
        if (ror.mode === 'pass') return route.continue();
        if (typeof ror.mode === 'number') return route.fulfill({status: ror.mode, contentType: 'application/json', headers: {'Access-Control-Allow-Origin': '*'}, body: '{}'});
        const q = url.toLowerCase();
        const items = ror.records.filter((r) => q.includes(r.name.toLowerCase().split(' ')[0])).map((r) => ({id: r.ror, names: [{lang: 'en', types: ['ror_display', 'label'], value: r.name}], status: 'active', locations: [{geonames_details: {country_name: r.country}}]}));
        return route.fulfill({status: 200, contentType: 'application/json', headers: {'Access-Control-Allow-Origin': '*'}, body: JSON.stringify({items})});
    });
    page.on('response', async (r) => {
        const u = r.url();
        const m = r.request().method();
        if (!/\/api\/v1\//.test(u) || /_test\//.test(u) || m === 'GET') return;
        const e = {at: Date.now(), op: r.request().headers()['x-http-method-override'] || m, url: u.split('?')[0].replace(/^.*\/api\/v1\//, ''), status: r.status()};
        if (r.status() >= 400) e.answer = flat(await r.text().catch(() => ''), 600);
        if (/\/contributors/.test(u)) {
            const sent = new URLSearchParams(r.request().postData() || '');
            e.sentKeys = [...new Set([...sent.keys()].map((k) => k.replace(/\[.*$/, '')))];
        }
        writes.push(e);
    });
    const since = (list, t0) => list.filter((x) => x.at >= t0).map(({at, ...x}) => x);

    let stepNo = 0;
    const snap = async (name, p = page) => {
        const n = `${part}-${String(++stepNo).padStart(2, '0')}-${name}`;
        let s;
        try {
            s = await screen(p);
        } catch (e) {
            s = {url: p.url(), error: flat(e.message, 300)};
        }
        record(n, s);
        await shot(p, n).catch(() => {});
        return s;
    };
    const step = async (key, fn) => {
        const t0 = Date.now();
        try {
            await fn();
        } catch (e) {
            fact(`${key} ERROR`, flat(e.stack || e.message, 900));
            await snap(`${key}-error`);
            const d = page.getByRole('dialog', {name: FORM_DIALOG});
            if (await d.count().catch(() => 0)) await d.getByRole('button', {name: 'Close', exact: true}).first().click({timeout: 3000}).catch(() => {});
        }
        const w = since(writes, t0);
        const dl = since(dialogs, t0);
        if (w.length || dl.length) fact(`${key} traffic`, {writes: w, browserDialogs: dl});
    };
    const sign = async (user, ctx) => {
        await signIn(page, user, ctx ? {contextPath: ctx} : {});
    };

    // ------------------------------------------------------------------ readers of the screen
    const panel = () => page.locator('.listPanel--contributor, .contributorsListPanel, [data-cy="contributor-manager"]').first();
    const formDialog = () => page.getByRole('dialog', {name: FORM_DIALOG});
    /** The list as data: header buttons, each row's text, badges and buttons. */
    const readList = async () => {
        const root = panel();
        await root.waitFor({timeout: T}).catch(() => {});
        return root.evaluate((el) => {
            const vis = (n) => !!(n.offsetWidth || n.offsetHeight || n.getClientRects().length);
            const name = (b) => (b.getAttribute('aria-label') || b.innerText || '').replace(/\s+/g, ' ').trim();
            const items = [...el.querySelectorAll('.listPanel__item')];
            const inItem = (b) => items.some((i) => i.contains(b));
            return {
                header: [...el.querySelectorAll('button')].filter((b) => vis(b) && !inItem(b)).map(name),
                rows: items.filter(vis).map((i) => ({
                    text: i.innerText.replace(/\s+/g, ' ').trim(),
                    badges: [...i.querySelectorAll('.pkpBadge')].filter(vis).map((b) => b.innerText.trim()),
                    buttons: [...i.querySelectorAll('button')].filter(vis).map(name),
                    subtitle: [...i.querySelectorAll('.listPanel__itemSubtitle')].map((s) => s.innerText.trim()),
                })),
                empty: el.innerText.includes('No items found.'),
            };
        }).catch((e) => ({error: flat(e.message, 200)}));
    };
    /** The open contributor form as data: each field's label, required mark, description, controls and errors. */
    const readForm = async (dialog = formDialog()) =>
        dialog.evaluate((d) => {
            const vis = (n) => !!(n.offsetWidth || n.offsetHeight || n.getClientRects().length);
            const fields = [...d.querySelectorAll('.pkpFormField')].filter((f) => vis(f) && !f.parentElement.closest('.pkpFormField'));
            return {
                fields: fields.map((f) => {
                    const label = f.querySelector('legend, label, .pkpFormFieldLabel');
                    return {
                        label: label ? label.innerText.replace(/\s+/g, ' ').trim() : null,
                        description: [...f.querySelectorAll('.pkpFormField__description')].map((x) => x.innerText.replace(/\s+/g, ' ').trim()).join(' | ') || null,
                        controls: [...f.querySelectorAll('input, select, textarea')].filter((c) => vis(c) || c.type === 'hidden' ? vis(c) : false).map((c) => ({tag: c.tagName.toLowerCase(), type: c.type, name: c.name, value: c.type === 'checkbox' || c.type === 'radio' ? undefined : c.value, checked: c.type === 'checkbox' || c.type === 'radio' ? c.checked : undefined, disabled: c.disabled || undefined, label: c.labels && c.labels[0] ? c.labels[0].innerText.replace(/\s+/g, ' ').trim() : undefined, placeholder: c.placeholder || undefined})),
                        errors: [...f.querySelectorAll('.pkpFieldError')].filter(vis).map((x) => x.innerText.replace(/\s+/g, ' ').trim()),
                    };
                }),
                foot: [...d.querySelectorAll('.pkpFormPage__footer, .pkpFormFooter, .pkpForm__footer, [class*="ormFooter"], [class*="formFooter"]')].map((x) => x.innerText.replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 2),
                errorButtons: [...d.querySelectorAll('button, a')].map((b) => (b.getAttribute('aria-label') || b.innerText || '').replace(/\s+/g, ' ').trim()).filter((s) => /^Go to |Jump to next error/.test(s)),
                save: (() => {
                    const b = [...d.querySelectorAll('button')].find((x) => x.innerText.trim() === 'Save');
                    return b ? {disabled: b.disabled, ariaDisabled: b.getAttribute('aria-disabled')} : null;
                })(),
            };
        }).catch((e) => ({error: flat(e.message, 200)}));
    const openWorkflow = async (ctx, sub, {author = false, entry = 'contributors'} = {}) => {
        await page.goto(cu(ctx, `/dashboard/${author ? 'mySubmissions' : 'editorial'}?workflowSubmissionId=${sub.id}&workflowMenuKey=publication_${sub.pub}_${entry}`));
        await idle(page);
        if (entry === 'contributors') await panel().waitFor({timeout: T}).catch(() => {});
        await idle(page);
    };
    const reloadList = async () => {
        await page.reload();
        await idle(page);
        await panel().waitFor({timeout: T}).catch(() => {});
        await idle(page);
    };
    const row = (text) => panel().locator('.listPanel__item').filter({hasText: text});
    const openAdd = async () => {
        await panel().getByRole('button', {name: 'Add Contributor', exact: true}).click();
        const d = page.getByRole('dialog', {name: 'Add Contributor'});
        await d.locator('input[name="email"]').waitFor({timeout: T}).catch(() => {});
        await idle(page);
        return d;
    };
    const openEdit = async (text) => {
        await row(text).first().getByRole('button', {name: 'Edit', exact: true}).click();
        const d = page.getByRole('dialog', {name: 'Edit', exact: true});
        await d.locator('input[name="email"]').waitFor({timeout: T}).catch(() => {});
        await idle(page);
        await sleep(500);
        return d;
    };
    const press = async (d, name) => {
        await d.getByRole('button', {name, exact: true}).first().click();
        await idle(page);
        await sleep(400);
    };
    const save = async (d) => {
        await press(d, 'Save');
        await sleep(800);
        await idle(page);
        return (await d.count()) === 0 ? 'closed' : 'open';
    };
    const closeForm = async (d) => {
        if (await d.count()) await d.getByRole('button', {name: 'Close', exact: true}).first().click().catch(() => {});
        await sleep(700);
    };
    const fill = async (d, name, v) => d.locator(`[name="${name}"]`).first().fill(v);
    const country = async (d, label = 'Canada') => d.locator('select[name="country"]').selectOption({label});
    const tick = async (d, role, on = true) => {
        const c = d.getByRole('checkbox', {name: role, exact: true});
        if (on) await c.check();
        else await c.uncheck();
    };
    const typeRich = async (d, id, text) => {
        const fr = page.frameLocator(`iframe[id="${id}_ifr"]`);
        await fr.locator('body').click();
        await page.keyboard.press('ControlOrMeta+a');
        await page.keyboard.type(text);
        await page.keyboard.press('Tab').catch(() => {});
    };
    const affField = (d) => d.locator('#contributor-affiliations');
    const affSearch = (d) => affField(d).locator('input.pkpAutosuggest__input');
    const typeInstitution = async (d, text) => {
        const s = affSearch(d);
        await s.click();
        await s.pressSequentially(text, {delay: 20});
        await sleep(900);
        await idle(page);
    };
    const pickTyped = async (d, text) => {
        await affField(d).locator('li.autosuggest__results-item').filter({hasText: text}).first().click();
        await sleep(300);
    };
    const addTyped = async (d, text) => {
        await typeInstitution(d, text);
        await pickTyped(d, text);
        await affField(d).getByRole('button', {name: 'Add', exact: true}).click();
        await sleep(500);
    };
    const readAff = async (d) =>
        affField(d).evaluate((f) => {
            const vis = (n) => !!(n.offsetWidth || n.offsetHeight || n.getClientRects().length);
            const search = f.querySelector('input.pkpAutosuggest__input');
            return {
                text: f.innerText.replace(/\s+/g, ' ').trim().slice(0, 1200),
                search: search ? {disabled: search.disabled, label: search.labels && search.labels[0] ? search.labels[0].innerText.trim() : null, ariaLabel: search.getAttribute('aria-label')} : null,
                buttons: [...f.querySelectorAll('button')].filter(vis).map((b) => (b.getAttribute('aria-label') || b.innerText).replace(/\s+/g, ' ').trim()),
                rows: [...f.querySelectorAll('tbody tr')].filter(vis).map((r) => ({text: r.innerText.replace(/\s+/g, ' ').trim(), links: [...r.querySelectorAll('a')].map((a) => a.getAttribute('href')), boxes: [...r.querySelectorAll('input[name="name"]')].map((i) => ({value: i.value, label: i.labels && i.labels[0] ? i.labels[0].innerText.trim() : null})), imgs: r.querySelectorAll('img, svg').length})),
                suggestions: [...f.querySelectorAll('li.autosuggest__results-item')].filter(vis).map((li) => ({text: li.innerText.replace(/\s+/g, ' ').trim(), links: [...li.querySelectorAll('a')].map((a) => a.getAttribute('href')), marks: li.querySelectorAll('img, svg').length})),
            };
        }).catch((e) => ({error: flat(e.message, 200)}));
    const affRow = (d, text) => affField(d).locator('tbody tr').filter({hasText: text});
    const affMenu = async (r) => {
        await r.getByRole('button', {name: 'Click to edit or delete'}).click();
        await sleep(400);
        return page.getByRole('menuitem').allInnerTexts();
    };
    const modal = (re) => page.getByRole('dialog').filter({hasText: re}).last();
    const openPreview = async () => {
        await panel().getByRole('button', {name: 'Preview', exact: true}).click();
        const d = page.getByRole('dialog', {name: 'List of Contributors'});
        await d.waitFor({timeout: T}).catch(() => {});
        await idle(page);
        const rows = await d.locator('tr').evaluateAll((trs) => trs.map((tr) => [...tr.querySelectorAll('th, td')].map((c) => c.innerText.replace(/\s+/g, ' ').trim())));
        return {d, rows, text: flat(await d.innerText().catch(() => ''), 900)};
    };
    const readPreview = async (label) => {
        const p = await openPreview();
        await snap(`preview-${label}`);
        await closeForm(p.d);
        return {rows: p.rows, text: p.text};
    };
    const activityLog = async () => {
        await page.getByRole('button', {name: 'Activity Log', exact: true}).click();
        const d = page.getByRole('dialog').filter({hasText: 'Activity Log & Notes'});
        await d.locator('tr.gridRow').first().waitFor({timeout: T}).catch(() => {});
        await idle(page);
        const rows = await d.locator('tr.gridRow').allInnerTexts();
        await d.getByRole('button', {name: 'Close', exact: true}).first().click().catch(() => {});
        await sleep(700);
        return rows.map((r) => flat(r, 200));
    };
    const mailCount = async (address, t0) => {
        try {
            return await app.mail.count({to: address, since: t0});
        } catch (e) {
            return `mail read failed: ${flat(e.message, 120)}`;
        }
    };
    const menuEntries = async () =>
        page.evaluate((group) => {
            const links = [...document.querySelectorAll('a, button')].map((a) => a.innerText.replace(/\s+/g, ' ').trim());
            const i = links.indexOf(group);
            return i < 0 ? {group: null, all: links.slice(0, 60)} : {group, after: links.slice(i + 1, i + 12)};
        }, GROUP);

    // ------------------------------------------------------------------ parts
    const parts = {};

    // ---------------------------------------------------------------- access
    parts.access = async () => {
        const levels = ['mg', 'se', 'au', 'rd', ...(A !== 'ops' ? ['ed', 'as', 'rv'] : ['as']), ...(A === 'ojs' ? ['ge'] : [])];
        const C = await mkContext('x', {users: [...levels, 'au2']});
        const participants = [
            {username: C.se, role: 'sectionEditor'},
            ...(A !== 'ops' ? [{username: C.as, role: 'copyeditor'}, {username: C.ed, role: 'editor'}] : []),
            ...(A === 'ojs' ? [{username: C.ge, role: 'guestEditor'}] : []),
        ];
        const S = await mkSub(C, 's', {contributors: [ROBIN], participants});
        const P = await mkSub(C, 'p', {contributors: [ROBIN], participants, ...published});
        const D = await mkSub(C, 'd', {submitted: false});
        fact('seed', {C, S, P, D});
        for (const u of [...levels, 'admin']) {
            const user = u === 'admin' ? 'admin' : C[u];
            for (const [key, sub] of [['s', S], ['p', P]]) {
                await step(`${u}-${key}`, async () => {
                    await sign(user, C.path);
                    await openWorkflow(C.path, sub, {author: u === 'au'});
                    const s = await snap(`${u}-${key}-contributors`);
                    const out = {url: s.url, heading: flat((s.text && s.text.dialog) || '', 160), list: await readList(), menu: await menuEntries(), banner: flat(await page.locator('.pkpNotification, [class*="Notification"], [role="alert"]').allInnerTexts().catch(() => []), 400)};
                    if (u === 'au' && A === 'ops' && key === 's') {
                        // OPS1: the full controls work for the author: one edit, saved.
                        const d = await openEdit('Robin Okafor');
                        await fill(d, 'familyName-en', 'Okafor-Author');
                        out.authorEdit = await save(d);
                        out.listAfter = await readList();
                    }
                    fact(`${u}-${key}`, out);
                });
                if (u === 'au' && key === 's') {
                    // The author's address typed on the editorial dashboard, and the Funding list's controls.
                    await step(`au-${key}-editorial-address`, async () => {
                        await openWorkflow(C.path, sub);
                        const s = await snap('au-s-editorial-address');
                        fact('au-s-editorial-address', {url: s.url, text: flat((s.text && (s.text.dialog || s.text.main)) || '', 300), list: await readList()});
                    });
                }
                if (['mg', 'au'].includes(u) && key === 's') {
                    await step(`${u}-funding`, async () => {
                        await openWorkflow(C.path, sub, {author: u === 'au', entry: 'funding'});
                        const s = await snap(`${u}-funding`);
                        const buttons = await page.getByRole('dialog').last().locator('button').evaluateAll((bs) => bs.filter((b) => b.offsetWidth).map((b) => ({name: (b.getAttribute('aria-label') || b.innerText).replace(/\s+/g, ' ').trim(), disabled: b.disabled}))).catch(() => []);
                        fact(`${u}-funding`, {url: s.url, heading: flat((s.text && s.text.dialog) || '', 200), buttons: buttons.filter((b) => /Funder|Order|Edit|Delete|Add/.test(b.name))});
                    });
                }
            }
        }
        // The wizard: the submitter's draft, its Contributors step, a co-author added there, the Review step.
        await step('wizard', async () => {
            await sign(C.au, C.path);
            await page.goto(cu(C.path, `/submission?id=${D.id}`));
            await idle(page);
            for (let i = 0; i < 4 && !(await panel().isVisible().catch(() => false)); i++) {
                await page.getByRole('button', {name: 'Continue', exact: true}).click().catch(() => {});
                await idle(page);
                await sleep(800);
            }
            await snap('wizard-contributors');
            const out = {list: await readList()};
            const d = await openAdd();
            await fill(d, 'givenName-en', 'Wendy');
            await fill(d, 'familyName-en', 'Wizard');
            await fill(d, 'email', `${C.t}w@mail.test`);
            await country(d);
            await tick(d, 'Author');
            await addTyped(d, 'Wizard Institute');
            out.addSaved = await save(d);
            out.listAfterAdd = await readList();
            await snap('wizard-after-add');
            for (let i = 0; i < 6; i++) {
                const review = await page.getByRole('heading', {name: /^Review/}).count().catch(() => 0);
                const txt = await page.locator('main, body').first().innerText().catch(() => '');
                if (/Review and Submit|Submit/.test(txt) && review && txt.includes('Wendy')) break;
                await page.getByRole('button', {name: 'Continue', exact: true}).click().catch(() => {});
                await idle(page);
                await sleep(800);
            }
            const s = await snap('wizard-review');
            const t = (s.text && s.text.main) || '';
            const i = t.indexOf('Contributors');
            out.reviewContributors = flat(t.slice(i, i + 400), 400);
            fact('wizard', out);
        });
    };

    // ---------------------------------------------------------------- form (S1 and the Fields table)
    parts.form = async () => {
        const C = await mkContext('f', {users: ['mg', 'au']});
        const S = await mkSub(C, 's', {contributors: [ROBIN]});
        fact('seed', {C, S});
        await sign(C.mg, C.path);
        const t0 = new Date();
        let logBefore;
        await step('list', async () => {
            await openWorkflow(C.path, S, {entry: 'titleAbstract'});
            logBefore = await activityLog();
            await openWorkflow(C.path, S);
            await snap('list');
            fact('list', {menu: await menuEntries(), list: await readList(), log: logBefore});
        });
        await step('add-open', async () => {
            const d = await openAdd();
            await snap('add-open');
            fact('add-open', {form: await readForm(d), credit: flat(await d.locator('#contributor-creditRoles').innerText().catch(() => ''), 300)});
            await press(d, 'Save');
            await snap('add-empty-save');
            fact('add-empty-save', await readForm(d));
            await fill(d, 'givenName-en', 'Alan');
            await sleep(300);
            fact('add-given-typed', await readForm(d));
            await fill(d, 'email', 'not-an-address');
            await fill(d, 'url', 'not a web address');
            await country(d);
            await tick(d, 'Author');
            await sleep(300);
            fact('add-all-filled-before-save', (await readForm(d)).save);
            await press(d, 'Save');
            await sleep(800);
            await snap('add-bad-email-url');
            fact('add-bad-email-url', await readForm(d));
            await fill(d, 'email', 'alan@example.test');
            await fill(d, 'url', '');
            fact('add-saved', await save(d));
            await snap('add-saved');
            fact('list-after-add', await readList());
        });
        await step('type-switch', async () => {
            const d = await openAdd();
            await fill(d, 'givenName-en', 'Casey');
            await d.getByRole('radio', {name: 'Organization or group', exact: true}).check();
            await sleep(500);
            await snap('type-org');
            fact('type-org-form', await readForm(d));
            await fill(d, 'organizationName-en', 'Probe Org');
            await fill(d, 'email', 'org@example.test');
            await country(d);
            await tick(d, 'Author');
            fact('org-saved', await save(d));
            fact('list-after-org', await readList());
            const e = await openEdit('Probe Org');
            await e.getByRole('radio', {name: 'Person', exact: true}).check();
            await sleep(500);
            await snap('org-edit-as-person');
            fact('org-edit-as-person', await readForm(e));
            await e.getByRole('radio', {name: 'Organization or group', exact: true}).check();
            await sleep(500);
            fact('org-edit-back-to-org', await readForm(e));
            fact('org-resaved', await save(e));
        });
        await step('a4', async () => {
            // A4: a ROR ID typed while "Organization or group" is chosen, then the contributor saved as a Person.
            const d = await openAdd();
            await d.getByRole('radio', {name: 'Organization or group', exact: true}).check();
            await sleep(500);
            await fill(d, 'organizationName-en', 'Shape Org');
            const rorBox = d.locator('input[name="rorId"], input[name="ror"]').first();
            fact('a4-ror-box', {name: await rorBox.getAttribute('name').catch(() => null)});
            await rorBox.fill('not-a-ror-id');
            await d.getByRole('radio', {name: 'Person', exact: true}).check();
            await sleep(500);
            await fill(d, 'givenName-en', 'Shape');
            await fill(d, 'familyName-en', 'Person');
            await fill(d, 'email', 'shape@example.test');
            await country(d);
            await tick(d, 'Author');
            fact('a4-saved', await save(d));
            const stored = sql(app, `select a.author_id, s.setting_name, s.locale, s.setting_value from authors a join author_settings s on s.author_id = a.author_id where a.publication_id = ${S.pub} and a.email = 'shape@example.test' and s.setting_name in ('givenName','organizationName','rorId','ror','contributorType') order by s.setting_name`);
            const cols = sql(app, `select column_name from information_schema.columns where table_name = 'authors' order by ordinal_position`);
            fact('a4-stored', {settings: stored.split('\n'), authorsColumns: cols.split('\n').join(',')});
            const e = await openEdit('Shape Person');
            fact('a4-edit-as-person', (await readForm(e)).fields.map((f) => f.label));
            await e.getByRole('radio', {name: 'Organization or group', exact: true}).check();
            await sleep(500);
            await snap('a4-edit-switched-to-org');
            fact('a4-edit-switched-to-org', (await readForm(e)).fields.filter((f) => /ROR|Organization/.test(f.label || '')));
            await closeForm(e);
        });
        await step('edit-close-escape', async () => {
            let d = await openEdit('Alan');
            await fill(d, 'familyName-en', 'Mwandenga');
            fact('edit-saved', await save(d));
            fact('list-after-edit', await readList());
            const n0 = Date.now();
            d = await openEdit('Alan Mwandenga');
            await fill(d, 'familyName-en', 'Closed');
            await d.getByRole('button', {name: 'Close', exact: true}).first().click();
            await sleep(2500);
            const afterClose = await snap('after-close');
            d = await openEdit('Alan Mwandenga');
            await d.locator('input[name="familyName-en"]').fill('Escaped');
            await d.locator('input[name="familyName-en"]').press('Escape');
            await sleep(2500);
            const afterEsc = await snap('after-escape');
            const listBeforeReload = await readList();
            await reloadList();
            fact('close-escape', {afterCloseNotices: afterClose.notices, afterEscNotices: afterEsc.notices, browserDialogs: since(dialogs, n0), formsOpen: await formDialog().count(), listBeforeReload, listAfterReload: await readList()});
        });
        await step('credit', async () => {
            let d = await openEdit('Alan Mwandenga');
            const field = d.locator('#contributor-creditRoles');
            const before = flat(await field.innerText(), 300);
            const add = async () => {
                const n = await field.locator('tbody tr').filter({has: page.locator('select')}).count();
                await field.getByRole('button', {name: 'Add Another Role', exact: true}).click();
                await sleep(1200);
                return field.locator('tbody tr').filter({has: page.locator('select')}).nth(n);
            };
            const readRows = () => field.locator('tbody tr').filter({has: page.locator('select')}).evaluateAll((trs) => trs.map((tr) => [...tr.querySelectorAll('select')].map((s) => ({value: s.value, shown: s.options[s.selectedIndex] ? s.options[s.selectedIndex].text : null, disabled: [...s.options].filter((o) => o.disabled).map((o) => o.text), options: [...s.options].map((o) => o.text)}))));
            await add();
            const one = await readRows();
            await add();
            const two = await readRows();
            await snap('credit-two-rows');
            const labels = await field.locator('label').evaluateAll((ls) => ls.map((l) => ({text: l.innerText.trim(), for: l.htmlFor})));
            await field.locator('tbody tr').filter({has: page.locator('select')}).nth(1).getByRole('button', {name: 'Remove Role'}).click();
            await sleep(600);
            const afterRemove = await readRows();
            fact('credit', {before, one, two, labels, afterRemove, saved: await save(d)});
            d = await openEdit('Alan Mwandenga');
            fact('credit-reopened', {rows: await readRows(), text: flat(await d.locator('#contributor-creditRoles').innerText(), 300)});
            await snap('credit-reopened');
            await closeForm(d);
            // The other end: two rows on one role, saved (the spec says it was not seen).
            d = await openEdit('Robin Okafor');
            await add();
            await add();
            const twoSame = await readRows();
            const res = await save(d);
            const after = await snap('credit-two-same-saved');
            fact('credit-two-same', {rows: twoSame, saved: res, form: res === 'open' ? await readForm(d) : null, notices: after.notices});
            if (res === 'open') await closeForm(d);
            d = await openEdit('Robin Okafor');
            fact('credit-two-same-reopened', await readRows());
            await closeForm(d);
            fact('credit-two-same-stored', sql(app, `select a.author_id, c.credit_role_id, c.credit_degree from credit_contributor_roles c join authors a on a.author_id = c.contributor_id where a.publication_id = ${S.pub} and c.credit_role_id is not null`).split('\n'));
        });
        await step('anonymous', async () => {
            const d = await openAdd();
            await d.getByRole('radio', {name: 'Anonymous', exact: true}).check();
            await sleep(500);
            await snap('anon-form');
            fact('anon-form', await readForm(d));
            await press(d, 'Save');
            await snap('anon-empty-save');
            fact('anon-empty-save', await readForm(d));
            await tick(d, 'Author');
            await sleep(300);
            const res = await save(d);
            fact('anon-bare-saved (A18)', {res, form: res === 'open' ? await readForm(d) : null});
            if (res === 'open') {
                await fill(d, 'email', 'anon@example.test');
                await country(d);
                fact('anon-saved-with-email', await save(d));
            }
            fact('list-after-anon', await readList());
            fact('anon-stored', sql(app, `select a.author_id, a.contributor_type, coalesce(a.email, '(none)'), coalesce((select setting_value from author_settings s where s.author_id = a.author_id and s.setting_name = 'country' limit 1), '(none)') from authors a where a.publication_id = ${S.pub} order by a.seq, a.author_id`).split('\n'));
            fact('preview-with-anon', await readPreview('with-anon'));
        });
        await step('a8-a19-misc', async () => {
            // A8: institution text typed and never picked; A19: the email label; Homepage URL valid; ORCID absent.
            const d = await openEdit('Robin Okafor');
            fact('robin-form', (await readForm(d)).fields.map((f) => ({label: f.label, description: f.description})));
            await typeInstitution(d, 'Unpicked Institute');
            fact('a8-typed', await readAff(d));
            await fill(d, 'url', 'https://example.org/robin');
            fact('a8-saved', await save(d));
            const e = await openEdit('Robin Okafor');
            fact('a8-reopened', await readAff(e));
            fact('url-reopened', await e.locator('input[name="url"]').inputValue().catch(() => null));
            await closeForm(e);
        });
        await step('a16', async () => {
            // A16: the submitter's own auto-created contributor (a throwaway account has no country), saved as is.
            const d = await openEdit('Ada Author');
            fact('a16-form', (await readForm(d)).fields.filter((f) => /Country|Roles/.test(f.label || '')));
            const res = await save(d);
            await snap('a16-save');
            fact('a16-save', {res, form: res === 'open' ? await readForm(d) : null});
            await closeForm(d);
            fact('a16-stored-country', sql(app, `select a.author_id, coalesce((select setting_value from author_settings s where s.author_id = a.author_id and s.setting_name = 'country' limit 1), '(none)') from authors a where a.publication_id = ${S.pub} and a.email like '%${C.au}%'`));
        });
        await step('delete', async () => {
            await row('Probe Org').getByRole('button', {name: 'Delete', exact: true}).click();
            await sleep(600);
            const dlg = modal('Are you sure you want to remove');
            await snap('delete-org-dialog');
            const dialogText = flat(await dlg.innerText(), 400);
            await dlg.getByRole('button', {name: 'Cancel', exact: true}).click();
            await sleep(700);
            const afterCancel = await readList();
            await row('Probe Org').getByRole('button', {name: 'Delete', exact: true}).click();
            await sleep(600);
            await modal('Are you sure you want to remove').getByRole('button', {name: 'Delete Contributor', exact: true}).click();
            await sleep(1200);
            await idle(page);
            const afterDelete = await readList();
            await row('Anonymous').first().getByRole('button', {name: 'Delete', exact: true}).click();
            await sleep(600);
            const anonDialog = flat(await modal('Are you sure you want to remove').innerText(), 400);
            await modal('Are you sure you want to remove').getByRole('button', {name: 'Delete Contributor', exact: true}).click();
            await sleep(1200);
            await idle(page);
            fact('delete', {dialogText, afterCancel, afterDelete, anonDialog, afterAnon: await readList()});
            await reloadList();
            fact('delete-after-reload', await readList());
        });
        await step('silence-and-primary', async () => {
            await openWorkflow(C.path, S, {entry: 'titleAbstract'});
            const logMid = await activityLog();
            const mailMid = await mailCount(`${C.au}@mail.test`, t0);
            await openWorkflow(C.path, S);
            await row('Alan Mwandenga').getByRole('button', {name: 'Set Primary Contact', exact: true}).click();
            await sleep(1500);
            await idle(page);
            await snap('set-primary');
            const listAfter = await readList();
            const logAfter = await activityLog();
            fact('silence-and-primary', {logBefore, logMid, logAfter, mailToSubmitter: mailMid, mailToRobin: await mailCount('robin@example.test', t0), mailToAlan: await mailCount('alan@example.test', t0), listAfter});
        });
    };

    // ---------------------------------------------------------------- affiliations (S4 and the Affiliations rules)
    parts.affil = async () => {
        const L = ['en', 'fr_CA'];
        const C = await mkContext('b', {users: ['mg', 'au'], context: {supportedLocales: L, supportedFormLocales: L, supportedSubmissionLocales: L}});
        const S = await mkSub(C, 's', {contributors: [ROBIN]});
        const S2 = await mkSub(C, 'bi', {contributors: [ROBIN], title: {en: `SW20 bi ${C.t}`, fr_CA: `SW20 bi fr ${C.t}`}, abstract: {en: 'Abstract.', fr_CA: 'Résumé.'}});
        const E = await mkContext('e', {users: ['mg', 'au']});
        const SE = await mkSub(E, 's', {contributors: [ROBIN]});
        fact('seed', {C, S, S2, E, SE});
        await sign(C.mg, C.path);
        await openWorkflow(C.path, S);
        await step('guidance', async () => {
            const d = await openEdit('Robin Okafor');
            await snap('aff-empty');
            const f = await readForm(d);
            fact('aff-field', {field: f.fields.find((x) => /Affiliation/.test(x.label || '')), aff: await readAff(d)});
            const h0 = ror.hits.length;
            await typeInstitution(d, 'Pro');
            await sleep(1500);
            const three = {hits: ror.hits.length - h0, aff: await readAff(d)};
            await affSearch(d).pressSequentially('b', {delay: 20});
            await sleep(1500);
            await idle(page);
            const four = {hits: ror.hits.length - h0, aff: await readAff(d)};
            await snap('aff-four-chars');
            await affSearch(d).fill('');
            await affSearch(d).pressSequentially('Probe Institute', {delay: 20});
            await sleep(1500);
            const beforePick = await readAff(d);
            await pickTyped(d, 'Probe Institute');
            const picked = await readAff(d);
            await snap('aff-picked');
            await affField(d).getByRole('button', {name: 'Add', exact: true}).click();
            await sleep(600);
            const added = await readAff(d);
            await snap('aff-added');
            const menu = await affMenu(affRow(d, 'Probe Institute'));
            await page.getByRole('menuitem', {name: 'Edit institution name', exact: true}).click();
            await sleep(500);
            const boxes = await readAff(d);
            await snap('aff-boxes');
            fact('typed', {three, four, beforePick, picked, added, menu, boxes});
            // An empty primary-language name: Save refused.
            const en = affField(d).locator('input[name="name"]').first();
            await en.fill('');
            await sleep(300);
            const emptied = await readAff(d);
            const res = await save(d);
            await snap('aff-empty-name-save');
            fact('empty-name', {emptied, res, form: await readForm(d), aff: await readAff(d)});
            await affField(d).locator('input[name="name"]').first().fill('Probe Institute');
            await sleep(300);
            fact('name-typed-back', {save: (await readForm(d)).save, aff: await readAff(d)});
            // The French box filled: "All translations available".
            const boxesNow = affField(d).locator('input[name="name"]');
            if ((await boxesNow.count()) > 1) {
                await boxesNow.nth(1).fill('Institut Sonde');
                await sleep(300);
                fact('both-filled', await readAff(d));
                await boxesNow.nth(1).fill('');
                await sleep(300);
            }
            // The registry-backed institution.
            const h1 = ror.hits.length;
            await typeInstitution(d, 'Simon Fraser University');
            await sleep(1500);
            const sugg = await readAff(d);
            await snap('aff-registry-suggestion');
            await affField(d).locator('li.autosuggest__results-item').filter({has: page.locator(`a[href="${SFU.ror}"]`)}).first().click();
            await sleep(500);
            const pickedReg = await readAff(d);
            const n0 = Date.now();
            await affField(d).getByRole('button', {name: 'Add', exact: true}).click();
            await sleep(2500);
            await idle(page);
            const errDialog = await page.getByRole('dialog').filter({hasText: /error/i}).last().innerText().catch(() => null);
            await snap('aff-registry-added');
            if (errDialog) await page.getByRole('dialog').filter({hasText: /error/i}).last().getByRole('button', {name: 'OK', exact: true}).click().catch(() => {});
            await sleep(500);
            const regAdded = await readAff(d);
            const regMenu = await affMenu(affRow(d, 'Simon Fraser').or(affField(d).locator('tbody tr').filter({has: page.locator(`a[href="${SFU.ror}"]`)})).first());
            await page.keyboard.press('Escape').catch(() => {});
            await sleep(300);
            fact('registry', {hits: ror.hits.length - h1, sugg, pickedReg, errDialog: flat(errDialog, 300), writes: since(writes, n0), regAdded, regMenu, formOpen: await formDialog().count()});
            if (await formDialog().count()) fact('both-saved', await save(formDialog()));
            fact('list-after-both', await readList());
        });
        await step('reopen-refused-edit', async () => {
            let d = await openEdit('Robin Okafor');
            const reopened = await readAff(d);
            await snap('aff-reopened');
            await affMenu(affRow(d, 'Probe Institute'));
            await page.getByRole('menuitem', {name: 'Edit institution name', exact: true}).click();
            await sleep(400);
            await affField(d).locator('input[name="name"]').first().fill('');
            const res = await save(d);
            await snap('aff-refused-edit');
            const refused = {res, form: await readForm(d), aff: await readAff(d)};
            await closeForm(d);
            await reloadList();
            d = await openEdit('Robin Okafor');
            fact('refused-edit', {reopened, refused, afterReload: await readAff(d)});
            // Removing one: No, then Yes.
            await affMenu(affRow(d, 'Probe Institute'));
            await page.getByRole('menuitem', {name: 'Remove institution', exact: true}).click();
            await sleep(500);
            const conf = modal('will be deleted');
            await snap('aff-remove-dialog');
            const confText = flat(await conf.innerText().catch(() => ''), 300);
            const confButtons = await conf.getByRole('button').allInnerTexts().catch(() => []);
            await conf.getByRole('button', {name: 'No', exact: true}).click();
            await sleep(400);
            const afterNo = await readAff(d);
            await affMenu(affRow(d, 'Probe Institute'));
            await page.getByRole('menuitem', {name: 'Remove institution', exact: true}).click();
            await sleep(500);
            await modal('will be deleted').getByRole('button', {name: 'Yes', exact: true}).click();
            await sleep(500);
            const afterYes = await readAff(d);
            // Order of adding: two typed entries after the registry one.
            await addTyped(d, 'Zeta Institute');
            await addTyped(d, 'Alpha Institute');
            const order = await readAff(d);
            fact('remove-and-order', {confText, confButtons, afterNo, afterYes, order, saved: await save(d)});
            d = await openEdit('Robin Okafor');
            fact('order-reopened', await readAff(d));
            await snap('aff-order-reopened');
            await closeForm(d);
        });
        await step('a17', async () => {
            const out = {};
            for (const [key, ctx, sub] of [['b-en-title', C, S], ['b-bilingual-title', C, S2], ['e-english-only', E, SE]]) {
                if (ctx !== C) await sign(ctx.mg, ctx.path);
                await openWorkflow(ctx.path, sub);
                const d = await openEdit('Robin Okafor');
                await addTyped(d, `Count Institute ${key}`);
                const added = await readAff(d);
                await affMenu(affRow(d, `Count Institute ${key}`));
                await page.getByRole('menuitem', {name: 'Edit institution name', exact: true}).click();
                await sleep(400);
                out[key] = {added: added.rows.map((r) => r.text), boxes: (await readAff(d)).rows.map((r) => ({text: r.text, boxes: r.boxes}))};
                await snap(`a17-${key}`);
                await closeForm(d);
            }
            fact('a17', out);
            await sign(C.mg, C.path);
        });
        await step('change-language', async () => {
            // Side effects: Change Submission Language copies the names and the typed institution names.
            await openWorkflow(C.path, S2);
            let d = await openEdit('Robin Okafor');
            await addTyped(d, 'Copy Institute');
            fact('copy-saved', await save(d));
            await openWorkflow(C.path, S2, {entry: 'titleAbstract'});
            await page.getByRole('button', {name: 'Change', exact: true}).first().click();
            const cl = page.getByRole('dialog', {name: /Change Submission Language/i});
            await cl.getByRole('button', {name: 'Confirm', exact: true}).waitFor({timeout: T});
            await sleep(1500);
            await idle(page);
            await cl.getByRole('radio', {name: /French/}).first().check().catch(async () => cl.getByText(/French/).first().click());
            await sleep(1000);
            await snap('change-language-panel');
            await cl.getByRole('button', {name: 'Confirm', exact: true}).click();
            await sleep(2500);
            await idle(page);
            const after = await snap('change-language-after');
            await openWorkflow(C.path, S2);
            d = await openEdit('Robin Okafor');
            const form = await readForm(d);
            await snap('change-language-robin');
            fact('change-language', {notices: after.notices, names: form.fields.filter((f) => /Name/.test(f.label || '')).map((f) => f.controls), aff: await readAff(d), stored: sql(app, `select s.locale, s.setting_name, s.setting_value from authors a join author_settings s on s.author_id = a.author_id where a.publication_id = ${S2.pub} and a.email = 'robin@example.test' and s.setting_name in ('givenName','familyName') order by 1, 2`).split('\n'), affStored: sql(app, `select fs.locale, fs.setting_value from authors a join author_affiliations f on f.author_id = a.author_id join author_affiliation_settings fs on fs.author_affiliation_id = f.author_affiliation_id where a.publication_id = ${S2.pub} and a.email = 'robin@example.test' order by 1`).split('\n'), submissionLocale: sql(app, `select locale from submissions where submission_id = ${S2.id}`)});
            await closeForm(d);
        });
    };

    // ---------------------------------------------------------------- rorerr (A11: the three registry error dialogs)
    parts.rorerr = async () => {
        const L = ['en', 'fr_CA'];
        const C = await mkContext('k', {users: ['mg', 'au'], context: {supportedLocales: L, supportedFormLocales: L, supportedSubmissionLocales: L}});
        const S = await mkSub(C, 's', {contributors: [ROBIN]});
        fact('seed', {C, S});
        await sign(C.mg, C.path);
        await openWorkflow(C.path, S);
        await step('ror-errors', async () => {
            // A11: each error status the field names (429, 503, 410), the dialog, what the next query does, the
            // panel closed and reopened.
            const out = {};
            for (const status of [429, 503, 410]) {
                let d = await openEdit('Robin Okafor');
                ror.mode = status;
                const h0 = ror.hits.length;
                await typeInstitution(d, `Errq${status}`);
                await sleep(1500);
                const dlg = page.getByRole('dialog').filter({hasText: /ROR API Error|error/i}).last();
                const text = flat(await dlg.innerText().catch(() => null), 400);
                await snap(`ror-${status}-dialog`);
                await dlg.getByRole('button', {name: 'OK', exact: true}).click().catch(() => {});
                await sleep(500);
                const afterDialog = await readAff(d);
                ror.mode = 'records';
                // The searched text is left picked under "Selected" and the box is disabled: remove the pick first.
                await affField(d).getByRole('button', {name: `Remove Errq${status}`}).click().catch(() => {});
                await sleep(500);
                const afterRemove = await readAff(d);
                const h1 = ror.hits.length;
                await affSearch(d).fill('');
                await typeInstitution(d, 'Simon Fraser University');
                await sleep(2000);
                const retry = {hits: ror.hits.length - h1, aff: await readAff(d)};
                await sleep(4000);
                await affSearch(d).pressSequentially(' X', {delay: 20}).catch(() => {});
                await sleep(2000);
                const waited = {hits: ror.hits.length - h1, aff: await readAff(d)};
                await closeForm(d);
                d = await openEdit('Robin Okafor');
                const h2 = ror.hits.length;
                await typeInstitution(d, 'Simon Fraser University');
                await sleep(2000);
                const reopened = {hits: ror.hits.length - h2, aff: await readAff(d)};
                await closeForm(d);
                out[status] = {firstHits: h1 - h0, text, afterDialog, afterRemove, retry, waited, reopened};
            }
            ror.mode = 'records';
            fact('ror-errors', out);
        });
    };

    // ---------------------------------------------------------------- order (S2, Rule 6, Rule 7, Rule 1)
    parts.order = async () => {
        const C = await mkContext('o', {users: ['mg', 'au']});
        const S = await mkSub(C, 's', {contributors: [ROBIN, {givenName: 'Gina', email: 'gina@example.test', country: 'CA'}]});
        fact('seed', {C, S});
        await sign(C.mg, C.path);
        await openWorkflow(C.path, S);
        const lists = [];
        await step('before', async () => {
            for (let i = 0; i < 2; i++) {
                await reloadList();
                lists.push((await readList()).rows.map((r) => r.text));
            }
            fact('before-reloads', lists);
            fact('preview-before', await readPreview('before'));
        });
        await step('order-mode', async () => {
            await panel().getByRole('button', {name: 'Order', exact: true}).click();
            await sleep(600);
            await snap('order-mode');
            const arrows = await panel().locator('button').evaluateAll((bs) => bs.filter((b) => b.offsetWidth || b.getClientRects().length).map((b) => (b.getAttribute('aria-label') || b.innerText).replace(/\s+/g, ' ').trim()));
            fact('order-mode', {list: await readList(), arrows});
            await panel().getByRole('button', {name: 'Increase position of Robin Okafor'}).click();
            await sleep(500);
            await panel().getByRole('button', {name: 'Save Order', exact: true}).click();
            await sleep(1500);
            await idle(page);
            await reloadList();
            fact('after-save-order', (await readList()).rows.map((r) => r.text));
            fact('preview-after-save-order', await readPreview('after-save-order'));
            await panel().getByRole('button', {name: 'Order', exact: true}).click();
            await sleep(500);
            await panel().getByRole('button', {name: 'Decrease position of Robin Okafor'}).click();
            await sleep(400);
            const moved = (await readList()).rows.map((r) => r.text);
            await panel().getByRole('button', {name: 'Cancel', exact: true}).click();
            await sleep(600);
            fact('cancel', {moved, afterCancel: (await readList()).rows.map((r) => r.text)});
            await reloadList();
            fact('cancel-after-reload', (await readList()).rows.map((r) => r.text));
        });
        await step('abbreviated-leads', async () => {
            // Rule 7's other ends: a person with no family name, an organization, Anonymous first.
            const out = {};
            const lead = async (name) => {
                await panel().getByRole('button', {name: 'Order', exact: true}).click();
                await sleep(500);
                for (let i = 0; i < 4; i++) {
                    const first = (await readList()).rows[0];
                    if (first && first.text.startsWith(name)) break;
                    await panel().getByRole('button', {name: `Increase position of ${name}`}).click();
                    await sleep(400);
                }
                await panel().getByRole('button', {name: 'Save Order', exact: true}).click();
                await sleep(1500);
                await idle(page);
                await reloadList();
            };
            await lead('Gina');
            out.gina = {list: (await readList()).rows.map((r) => r.text), preview: await readPreview('gina-first')};
            let d = await openAdd();
            await d.getByRole('radio', {name: 'Organization or group', exact: true}).check();
            await sleep(400);
            await fill(d, 'organizationName-en', 'Lead Org');
            await fill(d, 'email', 'leadorg@example.test');
            await country(d);
            await tick(d, 'Author');
            await save(d);
            await reloadList();
            out.addedAfterSavedOrder = (await readList()).rows.map((r) => r.text);
            await lead('Lead Org');
            out.org = {list: (await readList()).rows.map((r) => r.text), preview: await readPreview('org-first')};
            d = await openAdd();
            await d.getByRole('radio', {name: 'Anonymous', exact: true}).check();
            await sleep(400);
            await fill(d, 'email', 'anonlead@example.test');
            await country(d);
            await tick(d, 'Author');
            await save(d);
            await lead('Anonymous');
            out.anon = {list: (await readList()).rows.map((r) => r.text), preview: await readPreview('anon-first')};
            fact('abbreviated-leads', out);
            // Put Robin back first for the version read.
            await lead('Robin Okafor');
        });
        await step('save-unchanged', async () => {
            const before = (await readList()).rows.map((r) => r.text);
            const d = await openEdit('Robin Okafor');
            await save(d);
            const after = (await readList()).rows.map((r) => r.text);
            await reloadList();
            fact('save-unchanged', {before, after, afterReload: (await readList()).rows.map((r) => r.text)});
        });
        await step('new-version', async () => {
            let d = await openEdit('Robin Okafor');
            await addTyped(d, 'Probe Institute');
            fact('aff-saved', await save(d));
            await openWorkflow(C.path, S, {entry: 'titleAbstract'});
            await page.getByRole('button', {name: 'Create New Version'}).or(page.getByRole('link', {name: 'Create New Version'})).first().click();
            const vd = page.getByRole('dialog').filter({hasText: 'Which version should metadata be copied from?'});
            await vd.getByRole('button', {name: 'Confirm', exact: true}).waitFor({timeout: T});
            await sleep(800);
            await snap('version-dialog');
            const created = page.waitForResponse((r) => /\/version/.test(r.url()) && r.request().method() === 'POST', {timeout: T});
            await vd.getByRole('button', {name: 'Confirm', exact: true}).click();
            const res = await created;
            const newPub = (await res.json().catch(() => ({}))).id;
            fact('version-created', {status: res.status(), newPub});
            const V = {id: S.id, pub: newPub};
            await openWorkflow(C.path, V);
            await snap('version-contributors');
            fact('version-list', await readList());
            d = await openEdit('Robin Okafor');
            fact('version-robin-aff', await readAff(d));
            await fill(d, 'givenName-en', 'Robyn');
            fact('version-edit-saved', await save(d));
            fact('version-list-after-edit', (await readList()).rows.map((r) => r.text));
            await openWorkflow(C.path, S);
            fact('old-version-list', (await readList()).rows.map((r) => r.text));
            await snap('old-version-contributors');
        });
    };

    // ---------------------------------------------------------------- primary (S3)
    parts.primary = async () => {
        const C = await mkContext('p', {users: ['mg', 'au']});
        const S = await mkSub(C, 's', {contributors: [ROBIN]});
        fact('seed', {C, S});
        const t0 = new Date();
        await sign(C.mg, C.path);
        await openWorkflow(C.path, S, {entry: 'titleAbstract'});
        const log0 = await activityLog();
        await openWorkflow(C.path, S);
        await step('move', async () => {
            const before = await readList();
            const d0 = dialogs.length;
            await row('Robin Okafor').getByRole('button', {name: 'Set Primary Contact', exact: true}).click();
            await sleep(300);
            const instant = await readList();
            const confirmOpen = await page.getByRole('dialog').filter({hasText: /Are you sure/}).count();
            await sleep(1500);
            await idle(page);
            await snap('moved');
            const after = await readList();
            await reloadList();
            fact('move', {before, instant, confirmOpen, browserDialogs: dialogs.length - d0, after, afterReload: await readList()});
            await openWorkflow(C.path, S, {entry: 'titleAbstract'});
            fact('log-after-move', {log0, log: await activityLog(), mailToSubmitter: await mailCount(`${C.au}@mail.test`, t0), mailToRobin: await mailCount('robin@example.test', t0)});
        });
        await step('delete-primary', async () => {
            await openWorkflow(C.path, S);
            await row('Robin Okafor').getByRole('button', {name: 'Delete', exact: true}).click();
            await sleep(600);
            const dlg = modal('Are you sure you want to remove');
            const text = flat(await dlg.innerText(), 300);
            await dlg.getByRole('button', {name: 'Delete Contributor', exact: true}).click();
            await sleep(1200);
            await idle(page);
            await snap('primary-deleted');
            const after = await readList();
            await reloadList();
            fact('delete-primary', {text, after, afterReload: await readList(), stored: sql(app, `select primary_contact_id from publications where publication_id = ${S.pub}`)});
            await openWorkflow(C.path, S, {entry: 'titleAbstract'});
            fact('log-after-delete', await activityLog());
        });
        await step('publish-window', async () => {
            await openWorkflow(C.path, S, {entry: 'titleAbstract'});
            const right = page.locator('[data-cy="workflow-controls-right"]');
            const label = flat(await right.innerText().catch(() => ''), 200);
            const status = flat(await page.locator('[data-cy="workflow-controls-left"]').innerText().catch(() => ''), 200);
            await right.getByRole('button', {name: /^(Schedule For Publication|Publish|Post)$/}).first().click();
            await sleep(2500);
            await idle(page);
            const first = await snap('publish-first');
            const out = {label, status, first: flat(first.text && first.text.dialog, 600)};
            const panelD = page.locator('[data-cy="active-modal"]').filter({hasText: 'Review Publishing Details'}).last();
            if (await panelD.count()) {
                await panelD.locator('select[name="versionStage"]').selectOption('VoR').catch(() => {});
                await panelD.locator('select[name="versionIsMinor"]').selectOption('false').catch(() => {});
                await panelD.getByRole('button', {name: 'Confirm', exact: true}).click();
                await sleep(2500);
                await idle(page);
            }
            const fin = page.getByRole('dialog').filter({hasText: /All publication requirements|requirements/}).last();
            const s2 = await snap('publish-final');
            out.final = flat(await fin.innerText().catch(() => null), 600);
            out.finalButtons = await fin.getByRole('button').allInnerTexts().catch(() => []);
            out.notices = s2.notices;
            await fin.getByRole('button', {name: 'Close', exact: true}).first().click().catch(() => {});
            await sleep(800);
            if (await panelD.count()) await panelD.getByRole('button', {name: 'Close', exact: true}).first().click().catch(() => {});
            await sleep(800);
            await page.reload();
            await idle(page);
            out.statusAfter = flat(await page.locator('[data-cy="workflow-controls-left"]').innerText().catch(() => ''), 200);
            out.log = await activityLog();
            out.stored = sql(app, `select status from publications where publication_id = ${S.pub}`);
            fact('publish-window', out);
        });
        await step('last-contributor', async () => {
            await openWorkflow(C.path, S);
            await row('Ada Author').getByRole('button', {name: 'Delete', exact: true}).click();
            await sleep(600);
            await modal('Are you sure you want to remove').getByRole('button', {name: 'Delete Contributor', exact: true}).click();
            await sleep(1500);
            await idle(page);
            await snap('emptied');
            const list = await readList();
            const preview = await readPreview('emptied');
            await openWorkflow(C.path, S, {entry: 'titleAbstract'});
            fact('last-contributor', {list, preview, log: await activityLog(), mailToSubmitter: await mailCount(`${C.au}@mail.test`, t0)});
        });
    };

    // ---------------------------------------------------------------- roles (S5, Rules 11-13, A12, A13, A22)
    parts.roles = async () => {
        const L = ['en', 'fr_CA'];
        const C = await mkContext('r', {users: ['mg', 'au', 'se', ...(A !== 'ops' ? ['ed'] : [])], context: {supportedLocales: L, supportedFormLocales: L}});
        const S = await mkSub(C, 's', {});
        fact('seed', {C, S});
        const rolesScreen = async () => {
            await page.goto(cu(C.path, '/management/settings/workflow'));
            await idle(page);
            const tab = page.locator('#contributorRoles-button');
            if (!(await tab.isVisible().catch(() => false))) await page.locator('#submission-button').click().catch(() => {});
            await tab.click().catch(() => {});
            await page.getByRole('table', {name: 'Contributor Roles'}).waitFor({timeout: T}).catch(() => {});
            await idle(page);
        };
        const table = async () => page.getByRole('table', {name: 'Contributor Roles'}).locator('tbody tr').allInnerTexts().then((r) => r.map((x) => flat(x, 120))).catch(() => null);
        const roleAction = async (text, action) => {
            await page.getByRole('table', {name: 'Contributor Roles'}).locator('tbody tr').filter({hasText: text}).first().getByRole('button', {name: 'More Actions'}).click();
            await sleep(300);
            await page.getByRole('menuitem', {name: action, exact: true}).click();
            await sleep(800);
            await idle(page);
        };
        const roleDialog = (name) => page.getByRole('dialog', {name});
        const readRoleDialog = async (d) => ({
            text: flat(await d.innerText().catch(() => ''), 900),
            identifier: await d.locator('select[name="contributorRoleIdentifier"] option').allInnerTexts().catch(() => null),
            boxes: await d.locator('input[name^="name-"]').evaluateAll((is) => is.map((i) => ({name: i.name, value: i.value, visible: !!(i.offsetWidth || i.getClientRects().length)}))).catch(() => null),
            completion: await d.getByText(/languages completed/).filter({visible: true}).allInnerTexts().catch(() => null),
        });
        // Who reaches the screen.
        for (const u of ['se', ...(A !== 'ops' ? ['ed'] : []), 'admin', 'mg']) {
            await step(`reach-${u}`, async () => {
                await sign(u === 'admin' ? 'admin' : C[u], C.path);
                await rolesScreen();
                const s = await snap(`reach-${u}`);
                fact(`reach-${u}`, {url: s.url, table: await table(), text: flat(s.text && s.text.main, 200)});
            });
        }
        await step('add-role', async () => {
            await page.getByRole('button', {name: 'Add Role', exact: true}).click();
            const d = roleDialog('Add Role');
            await d.locator('select[name="contributorRoleIdentifier"]').waitFor({timeout: T});
            await sleep(500);
            await snap('add-role-open');
            const open = await readRoleDialog(d);
            await d.locator('select[name="contributorRoleIdentifier"]').selectOption('EDITOR');
            await d.locator('input[name="name-en"]').fill('Handling editor');
            await d.getByRole('button', {name: 'French', exact: true}).click().catch(() => {});
            await sleep(400);
            const french = await readRoleDialog(d);
            await snap('add-role-french');
            await d.getByRole('button', {name: 'Save', exact: true}).click();
            await sleep(1500);
            await idle(page);
            const s = await snap('add-role-saved');
            fact('add-role (A13)', {open, french, notices: s.notices, open_after: await d.count(), table: await table(), stored: sql(app, `select s.locale, s.setting_value from contributor_roles r join contributor_role_settings s on s.contributor_role_id = r.contributor_role_id where r.context_id = (select ${app.contextTables.id} from ${app.contextTables.table} where path = '${C.path}') and s.setting_name = 'name' order by r.contributor_role_id, s.locale`).split('\n')});
        });
        await step('edit-role', async () => {
            await roleAction('Handling editor', 'Edit');
            const d = roleDialog('Edit Role');
            await snap('edit-role');
            const read = await readRoleDialog(d);
            // A22: a primary-language name changed and closed.
            await d.locator('input[name="name-en"]').fill('Handling editor Draft');
            await d.getByRole('button', {name: 'Close', exact: true}).first().click();
            await sleep(1500);
            const s = await snap('edit-role-closed');
            const tableAfterClose = await table();
            await roleAction('Handling editor', 'Edit');
            const reopened = await readRoleDialog(roleDialog('Edit Role'));
            await roleDialog('Edit Role').getByRole('button', {name: 'Close', exact: true}).first().click();
            await sleep(800);
            await rolesScreen();
            const tableAfterReload = await table();
            await roleAction('Handling editor', 'Edit');
            const afterReload = await readRoleDialog(roleDialog('Edit Role'));
            await roleDialog('Edit Role').getByRole('button', {name: 'Close', exact: true}).first().click();
            await sleep(800);
            fact('edit-role', {read, closeNotices: s.notices, browserDialogs: dialogs.slice(-3), tableAfterClose, reopened, tableAfterReload, afterReload});
        });
        await step('in-use', async () => {
            await sign(C.mg, C.path);
            await openWorkflow(C.path, S);
            const d = await openEdit('Ada Author');
            await country(d);
            await tick(d, 'Handling editor');
            fact('tick-saved', await save(d));
            fact('list-with-role', await readList());
            await rolesScreen();
            await roleAction('Handling editor', 'Delete Role');
            const conf = page.getByRole('dialog').filter({hasText: 'Are you absolutely sure'});
            await snap('delete-confirm');
            const confRead = {text: flat(await conf.innerText(), 700), buttons: await conf.locator('button').evaluateAll((bs) => bs.map((b) => ({text: b.innerText.trim(), disabled: b.disabled})))};
            await conf.locator('input').first().fill('EDITO');
            const partial = await conf.locator('button').evaluateAll((bs) => bs.map((b) => ({text: b.innerText.trim().slice(0, 40), disabled: b.disabled})));
            await conf.locator('input').first().fill('editor');
            const lower = await conf.locator('button').evaluateAll((bs) => bs.map((b) => ({text: b.innerText.trim().slice(0, 40), disabled: b.disabled})));
            await conf.locator('input').first().fill('EDITOR');
            const exact = await conf.locator('button').evaluateAll((bs) => bs.map((b) => ({text: b.innerText.trim().slice(0, 40), disabled: b.disabled})));
            await conf.locator('button.pkpButton').filter({hasNotText: 'Cancel'}).click();
            await sleep(1500);
            await idle(page);
            const err = page.getByRole('dialog', {name: 'Error', exact: true});
            await snap('delete-in-use');
            const errText = flat(await err.innerText().catch(() => null), 300);
            await err.getByRole('button', {name: 'OK', exact: true}).click().catch(() => {});
            await sleep(600);
            fact('in-use', {confRead, partial, lower, exact, errText, table: await table()});
        });
        await step('delete-role', async () => {
            await openWorkflow(C.path, S);
            const d = await openEdit('Ada Author');
            await tick(d, 'Handling editor', false);
            fact('untick-saved', await save(d));
            await rolesScreen();
            await roleAction('Handling editor', 'Delete Role');
            const conf = page.getByRole('dialog').filter({hasText: 'Are you absolutely sure'});
            await conf.locator('input').first().fill('EDITOR');
            await conf.locator('button.pkpButton').filter({hasNotText: 'Cancel'}).click();
            await sleep(1500);
            await idle(page);
            const ok = page.getByRole('dialog', {name: 'Role Deleted'});
            await snap('role-deleted');
            const okText = flat(await ok.innerText().catch(() => null), 300);
            await ok.getByRole('button').first().click().catch(() => {});
            await sleep(600);
            fact('delete-role', {okText, table: await table()});
        });
        await step('last-author', async () => {
            // The in-use refusal while the contributor holds Author (both refusals apply); then off the role.
            const tryDelete = async (rowText, ident, label) => {
                await rolesScreen();
                await roleAction(rowText, 'Delete Role');
                const conf = page.getByRole('dialog').filter({hasText: 'Are you absolutely sure'});
                const confText = flat(await conf.innerText().catch(() => ''), 300);
                await conf.locator('input').first().fill(ident);
                await conf.locator('button.pkpButton').filter({hasNotText: 'Cancel'}).click();
                await sleep(1500);
                await idle(page);
                await snap(`delete-${label}`);
                const err = page.getByRole('dialog', {name: 'Error', exact: true});
                const ok = page.getByRole('dialog', {name: 'Role Deleted'});
                const r = {confText, err: flat(await err.innerText().catch(() => null), 300), ok: flat(await ok.innerText().catch(() => null), 300)};
                await err.getByRole('button', {name: 'OK', exact: true}).click().catch(() => {});
                await ok.getByRole('button').first().click().catch(() => {});
                await sleep(600);
                r.table = await table();
                return r;
            };
            const out = {heldAuthor: await tryDelete('AUTHOR', 'AUTHOR', 'author-held')};
            await openWorkflow(C.path, S);
            const d = await openEdit('Ada Author');
            await tick(d, 'Translator');
            await tick(d, 'Author', false);
            out.moved = await save(d);
            if (A === 'omp') out.chapterAuthor = await tryDelete('Chapter Author', 'AUTHOR', 'chapter-author');
            out.lastAuthor = await tryDelete(/^Author/, 'AUTHOR', 'last-author');
            fact('last-author', out);
        });
    };

    // ---------------------------------------------------------------- reader (S6, S7, S10, OMP1, A3)
    parts.reader = async () => {
        const C = await mkContext('v', {users: ['mg', 'au'], extra: A === 'ojs' ? {issues: [{volume: 1, number: 1, year: 2026, published: true}]} : {}});
        const issue = A === 'ojs' ? {issue: {volume: 1, number: 1, year: 2026}} : {};
        const P = await mkSub(C, 'p', {contributors: [ROBIN], ...published, ...issue});
        const extra = {};
        if (A === 'omp') {
            extra.P5 = await mkSub(C, 'five', {contributors: [ROBIN, ...['Kim', 'Lee', 'Max', 'Ned'].map((g) => ({givenName: g, familyName: 'Five', email: `${g.toLowerCase()}@example.test`, country: 'CA'}))], ...published});
            extra.V = await mkSub(C, 'vol', {contributors: [ROBIN], workType: 'editedVolume', ...published});
        }
        fact('seed', {C, P, ...extra});
        await sign(C.mg, C.path);
        await openWorkflow(C.path, P);
        await step('equip', async () => {
            const d = await openEdit('Ada Author');
            await country(d);
            await addTyped(d, 'Reader Institute');
            await typeRich(d, 'contributor-biography-control-en', `Bio of Ada ${C.t}`);
            await tick(d, 'Translator');
            const field = d.locator('#contributor-creditRoles');
            await field.getByRole('button', {name: 'Add Another Role', exact: true}).click();
            await sleep(1200);
            await field.locator('tbody tr').filter({has: page.locator('select')}).first().locator('select').nth(1).selectOption({label: 'Lead'});
            fact('equip-saved', await save(d));
            fact('list', await readList());
            fact('preview', await readPreview('reader-item'));
        });
        const readLanding = async (label, sub = P, locale = 'en') => {
            const R = await launch(app);
            try {
                await R.page.goto(`/index.php/${C.path}/${locale}/${LANDING}/${sub.id}`);
                await idle(R.page);
                const s = await screen(R.page);
                record(`${part}-landing-${label}`, s);
                await shot(R.page, `${part}-landing-${label}`).catch(() => {});
                const authors = await R.page.locator('.item.authors li, .authors li, .item.authors .value, .item.authors').evaluateAll((ls) => ls.slice(0, 12).map((l) => l.innerText.replace(/\s+/g, ' ').trim()));
                const bios = await R.page.locator('.item.author_bios, .author_bios').allInnerTexts().catch(() => []);
                const meta = await R.page.locator('meta[name^="citation_author"], meta[name^="DC.Creator"]').evaluateAll((ms) => ms.map((m) => `${m.getAttribute('name')}=${m.getAttribute('content')}`));
                const contact = /primary contact|contact/i.test((s.text && s.text.main) || '');
                return {url: R.page.url(), authors, bios: bios.map((b) => flat(b, 400)), meta, mentionsContact: contact};
            } finally {
                await R.close();
            }
        };
        const readListing = async (label) => {
            const R = await launch(app);
            try {
                const addr = A === 'ojs' ? `/index.php/${C.path}/en/issue/current` : A === 'omp' ? `/index.php/${C.path}/en/catalog` : `/index.php/${C.path}/en/preprints`;
                await R.page.goto(addr);
                await idle(R.page);
                const s = await screen(R.page);
                record(`${part}-listing-${label}`, s);
                await shot(R.page, `${part}-listing-${label}`).catch(() => {});
                const lines = await R.page.locator('.obj_article_summary .authors, .obj_monograph_summary .author, .obj_preprint_summary .authors').allInnerTexts();
                return {url: R.page.url(), lines: lines.map((l) => flat(l, 300))};
            } finally {
                await R.close();
            }
        };
        await step('landing', async () => {
            fact('landing', await readLanding('equipped'));
            fact('listing', await readListing('equipped'));
        });
        await step('plural-bios', async () => {
            await openWorkflow(C.path, P);
            const d = await openEdit('Robin Okafor');
            await typeRich(d, 'contributor-biography-control-en', `Bio of Robin ${C.t}`);
            fact('robin-bio-saved', await save(d));
            fact('landing-two-bios', await readLanding('two-bios'));
        });
        await step('s7', async () => {
            await openWorkflow(C.path, P);
            let d = await openEdit('Ada Author');
            await save(d);
            await reloadList();
            const afterUnchanged = (await readList()).rows.map((r) => r.text);
            const landingUnchanged = await readLanding('unchanged-save');
            d = await openEdit('Robin Okafor');
            const box = d.getByRole('checkbox', {name: /Include this contributor when identifying authors/});
            const wasTicked = await box.isChecked();
            await box.uncheck();
            await save(d);
            const pv = await readPreview('robin-unticked');
            const landing = await readLanding('robin-unticked');
            const listing = await readListing('robin-unticked');
            d = await openEdit('Robin Okafor');
            await d.getByRole('checkbox', {name: /Include this contributor when identifying authors/}).check();
            await save(d);
            d = await openEdit('Ada Author');
            await d.getByRole('checkbox', {name: /Include this contributor when identifying authors/}).uncheck();
            await save(d);
            const pv2 = await readPreview('ada-unticked');
            const listing2 = await readListing('ada-unticked');
            fact('s7', {afterUnchanged, landingUnchanged: landingUnchanged.authors, wasTicked, pv, landing: landing.authors, listing, pv2, listing2});
            d = await openEdit('Ada Author');
            await d.getByRole('checkbox', {name: /Include this contributor when identifying authors/}).check();
            await save(d);
        });
        if (A === 'omp') {
            await step('five', async () => {
                await openWorkflow(C.path, extra.P5);
                const d = await openEdit('Robin Okafor');
                await addTyped(d, 'Five Institute');
                fact('five-saved', await save(d));
                fact('five-landing', await readLanding('five', extra.P5));
            });
            await step('volume', async () => {
                await openWorkflow(C.path, extra.V);
                const d = await openEdit('Robin Okafor');
                await tick(d, 'Volume editor');
                await tick(d, 'Author', false);
                fact('volume-saved', await save(d));
                fact('volume-list', await readList());
                fact('volume-landing', await readLanding('volume', extra.V));
                fact('volume-listing', await readListing('volume'));
            });
        }
    };

    // ---------------------------------------------------------------- ci (S8, OPS2)
    parts.ci = async () => {
        const C = await mkContext('c', {users: ['mg', 'au']});
        const S = await mkSub(C, 's', {contributors: [ROBIN]});
        fact('seed', {C, S});
        await sign(C.mg, C.path);
        const setting = async (on) => {
            await page.goto(cu(C.path, '/management/settings/workflow#submission/metadata'));
            await idle(page);
            await page.locator('#submission-button').click().catch(() => {});
            await page.locator('#metadata-button').click().catch(() => {});
            await idle(page);
            const box = page.getByRole('checkbox', {name: /Require submitting Authors to file a Competing Interest/});
            await box.waitFor({timeout: T});
            const section = flat(await box.locator('xpath=ancestor::fieldset[1]').innerText().catch(() => ''), 400);
            if (on) await box.check();
            else await box.uncheck();
            await page.getByRole('button', {name: 'Save', exact: true}).filter({visible: true}).first().click();
            await page.locator('[role="status"]').filter({hasText: 'Saved'}).first().waitFor({timeout: T}).catch(() => {});
            await snap(`ci-setting-${on ? 'on' : 'off'}`);
            return section;
        };
        await step('before', async () => {
            await openWorkflow(C.path, S);
            const d = await openEdit('Robin Okafor');
            fact('before', (await readForm(d)).fields.map((f) => f.label));
            await closeForm(d);
        });
        await step('on', async () => {
            fact('section', await setting(true));
            await openWorkflow(C.path, S);
            let d = await openEdit('Robin Okafor');
            await snap('ci-field');
            const f = await readForm(d);
            fact('field', f.fields.filter((x) => /ompeting/.test(`${x.label} ${x.description}`)));
            const res = await save(d);
            await snap('ci-empty-save');
            fact('empty-save', {res, form: await readForm(d)});
            await typeRich(d, 'contributor-competingInterests-control-en', 'No competing interests.');
            fact('statement-saved', await save(d));
            d = await openAdd();
            fact('add-has-field', (await readForm(d)).fields.filter((x) => /ompeting/.test(`${x.label}`)).map((x) => x.label));
            await closeForm(d);
        });
        await step('off-on', async () => {
            await setting(false);
            await openWorkflow(C.path, S);
            let d = await openEdit('Robin Okafor');
            fact('off', (await readForm(d)).fields.map((f) => f.label));
            await closeForm(d);
            await setting(true);
            await openWorkflow(C.path, S);
            d = await openEdit('Robin Okafor');
            await sleep(1500);
            const body = await page.frameLocator('iframe[id="contributor-competingInterests-control-en_ifr"]').locator('body').innerText().catch(() => null);
            await snap('ci-back');
            fact('on-again', {labels: (await readForm(d)).fields.map((f) => f.label), statement: flat(body, 200)});
            await closeForm(d);
        });
        await step('admin-reach', async () => {
            await sign('admin', C.path);
            await page.goto(cu(C.path, '/management/settings/workflow'));
            await idle(page);
            await page.locator('#submission-button').click().catch(() => {});
            await page.locator('#metadata-button').click().catch(() => {});
            await idle(page);
            fact('admin-reach', await page.getByRole('checkbox', {name: /Require submitting Authors to file a Competing Interest/}).count());
        });
    };

    // ---------------------------------------------------------------- french (S13, A21, A22's French box, Rule 15a)
    parts.french = async () => {
        const L = ['en', 'fr_CA'];
        const C = await mkContext('n', {users: ['mg', 'au'], context: {supportedLocales: L, supportedFormLocales: L}, extra: A === 'ojs' ? {issues: [{volume: 1, number: 1, year: 2026, published: true}]} : {}});
        const P = await mkSub(C, 'p', {...published, ...(A === 'ojs' ? {issue: {volume: 1, number: 1, year: 2026}} : {})});
        fact('seed', {C, P});
        const pages = async (label) => {
            const out = {};
            for (const loc of ['fr_CA', 'en']) {
                const R = await launch(app);
                try {
                    await R.page.goto(`/index.php/${C.path}/${loc}/${LANDING}/${P.id}`);
                    await idle(R.page);
                    record(`${part}-landing-${loc}-${label}`, await screen(R.page));
                    const roles = await R.page.locator('.contributor_roles, .credit_roles').allInnerTexts().catch(() => []);
                    const addr = A === 'ojs' ? `/index.php/${C.path}/${loc}/issue/current` : A === 'omp' ? `/index.php/${C.path}/${loc}/catalog` : `/index.php/${C.path}/${loc}/preprints`;
                    await R.page.goto(addr);
                    await idle(R.page);
                    record(`${part}-listing-${loc}-${label}`, await screen(R.page));
                    const lines = await R.page.locator('.obj_article_summary .authors, .obj_monograph_summary .author, .obj_preprint_summary .authors').allInnerTexts();
                    out[loc] = {roles: roles.map((r) => flat(r, 200)), lines: lines.map((l) => flat(l, 200))};
                } finally {
                    await R.close();
                }
            }
            return out;
        };
        await step('before', async () => fact('pages-before', await pages('before')));
        await sign(C.mg, C.path);
        const rolesScreen = async () => {
            await page.goto(cu(C.path, '/management/settings/workflow'));
            await idle(page);
            const tab = page.locator('#contributorRoles-button');
            if (!(await tab.isVisible().catch(() => false))) await page.locator('#submission-button').click().catch(() => {});
            await tab.click().catch(() => {});
            await page.getByRole('table', {name: 'Contributor Roles'}).waitFor({timeout: T}).catch(() => {});
            await idle(page);
        };
        const openAuthorRole = async () => {
            await page.getByRole('table', {name: 'Contributor Roles'}).locator('tbody tr').filter({hasText: 'AUTHOR'}).first().getByRole('button', {name: 'More Actions'}).click();
            await sleep(300);
            await page.getByRole('menuitem', {name: 'Edit', exact: true}).click();
            const d = page.getByRole('dialog', {name: 'Edit Role'});
            await d.locator('input[name="name-en"]').waitFor({timeout: T});
            await sleep(500);
            return d;
        };
        const read = async (d) => ({en: await d.locator('input[name="name-en"]').inputValue().catch(() => null), fr: await d.locator('input[name="name-fr_CA"]').inputValue().catch(() => null), frVisible: await d.locator('input[name="name-fr_CA"]').isVisible().catch(() => null), completion: await d.getByText(/languages completed/).filter({visible: true}).allInnerTexts().catch(() => null)});
        await step('edit-role', async () => {
            await rolesScreen();
            const table = await page.getByRole('table', {name: 'Contributor Roles'}).locator('tbody tr').allInnerTexts();
            let d = await openAuthorRole();
            const first = await read(d);
            await d.getByRole('button', {name: 'French', exact: true}).click();
            await sleep(400);
            const french = await read(d);
            await snap('edit-role-french');
            await d.locator('input[name="name-fr_CA"]').fill('Auteur-e');
            await sleep(200);
            const typed = await read(d);
            await d.getByRole('button', {name: 'Close', exact: true}).first().click();
            await sleep(1500);
            d = await openAuthorRole();
            await d.getByRole('button', {name: 'French', exact: true}).click().catch(() => {});
            await sleep(300);
            const reopenedBeforeReload = await read(d);
            await d.getByRole('button', {name: 'Close', exact: true}).first().click();
            await sleep(800);
            await rolesScreen();
            d = await openAuthorRole();
            await d.getByRole('button', {name: 'French', exact: true}).click().catch(() => {});
            await sleep(300);
            const afterReload = await read(d);
            await d.locator('input[name="name-fr_CA"]').fill('Auteur-e');
            await d.getByRole('button', {name: 'Save', exact: true}).click();
            await sleep(1500);
            await idle(page);
            const s = await snap('edit-role-saved');
            fact('edit-role', {table: table.map((r) => flat(r, 100)), first, french, typed, reopenedBeforeReload, afterReload, savedNotices: s.notices, open: await page.getByRole('dialog', {name: 'Edit Role'}).count()});
        });
        await step('credit', async () => {
            await openWorkflow(C.path, P);
            const d = await openEdit('Ada Author');
            await country(d);
            const field = d.locator('#contributor-creditRoles');
            await field.getByRole('button', {name: 'Add Another Role', exact: true}).click();
            await sleep(1200);
            await field.locator('tbody tr').filter({has: page.locator('select')}).first().locator('select').nth(1).selectOption({label: 'Lead'});
            fact('credit-saved', await save(d));
        });
        await step('after', async () => fact('pages-after', await pages('after')));
    };

    // ---------------------------------------------------------------- review (S11, Rule 17)
    parts.review = async () => {
        if (A === 'ops') return fact('skipped', 'a preprint server installs no review stage');
        const out = {};
        for (const [key, review] of [['anonymous', undefined], ['open', {defaultReviewMode: 'open'}]]) {
            const C = await mkContext(`w${key[0]}`, {users: ['mg', 'au', 'rv'], extra: review ? {review} : {}});
            const S = await app.api.createSubmission({tag: `${C.t}r`, context: C.path, submitter: C.au, title: `Review ${C.t}`, contributors: [ROBIN], decisions: [A === 'omp' ? 'sendExternalReview' : 'sendExternalReview'], reviewRounds: [{reviewers: [{username: C.rv, status: 'accepted'}]}]});
            await step(key, async () => {
                await sign(C.rv, C.path);
                await page.goto(cu(C.path, `/reviewer/submission/${S.submissionId}`));
                await idle(page);
                await snap(`review-${key}-step`);
                const fetched = page.waitForResponse((r) => r.url().includes(`/api/v1/submissions/${S.submissionId}/publications/`) && r.request().method() === 'GET', {timeout: T});
                await page.getByRole('link', {name: 'View All Submission Details'}).or(page.getByRole('button', {name: 'View All Submission Details'})).first().click();
                const r = await fetched;
                const j = await r.json().catch(() => ({}));
                await idle(page);
                await snap(`review-${key}-details`);
                out[key] = {status: r.status(), authors: (j.authors || []).map((a) => a.fullName), authorsString: j.authorsString, authorsStringShort: j.authorsStringShort, keys: Object.keys(j).filter((k) => /author|contact/i.test(k))};
            });
        }
        fact('review', out);
    };

    // ---------------------------------------------------------------- dataset (Rule 16 on Central Kurdish)
    parts.dataset = async () => {
        if (!app.dataset) return fact('skipped', 'needs a dataset fleet (PROBE_FEATURE=U41-sw-d3, reset first)');
        const ctx = app.contextPath;
        const {table, id: idCol, settings} = app.contextTables;
        const cid = sql(app, `select ${idCol} from ${table} where path = '${ctx}'`).trim();
        const PADUA = {ror: 'https://ror.org/00240q980', name: 'University of Padua'};
        ror.mode = 'pass';
        // An unpublished item on publicknowledge and its first contributor (the dataset's own, read, never chosen by id).
        const pick = sql(app, `select s.submission_id, p.publication_id, a.author_id from submissions s join publications p on p.publication_id = s.current_publication_id join authors a on a.publication_id = p.publication_id where s.context_id = ${cid} and p.status = 1 and s.submission_progress = '' order by s.submission_id, a.seq limit 1`).split('|');
        const S = {id: pick[0], pub: pick[1]};
        const authorId = pick[2];
        const name = sql(app, `select coalesce(max(case when setting_name = 'givenName' then setting_value end), '') || ' ' || coalesce(max(case when setting_name = 'familyName' then setting_value end), '') from author_settings where author_id = ${authorId} and locale = 'en'`).trim();
        fact('item', {S, authorId, name, languages: sql(app, `select setting_name, setting_value from ${settings} where ${idCol} = ${cid} and setting_name in ('supportedSubmissionLocales', 'supportedSubmissionMetadataLocales', 'supportedFormLocales')`).split('\n'), site: sql(app, 'select installed_locales from site')});
        const pubs = [];
        page.on('response', async (r) => {
            if (r.request().method() === 'GET' && new RegExp(`/submissions/${S.id}/publications/${S.pub}(\\?|$)`).test(r.url()) && r.status() === 200) {
                const j = await r.json().catch(() => null);
                if (j) pubs.push({at: Date.now(), affiliations: (j.authors || []).filter((a) => String(a.id) === String(authorId)).map((a) => (a.affiliations || []).map((f) => ({ror: f.ror, name: f.name}))), funders: (j.funders || []).map((f) => ({ror: f.ror, name: f.name}))});
            }
        });
        await sign('dbarnes', ctx);
        await step('pick', async () => {
            await openWorkflow(ctx, S);
            const d = await openEdit(name.split(' ')[0]);
            const s = affSearch(d);
            await s.click();
            await s.pressSequentially(PADUA.name, {delay: 20});
            const option = affField(d).locator('li.autosuggest__results-item').filter({has: page.locator(`a[href="${PADUA.ror}"]`)}).first();
            await option.waitFor({timeout: T});
            const sugg = await readAff(d);
            await option.click();
            await sleep(400);
            const posted = page.waitForResponse((r) => /\/api\/v1\/rors\/?(\?|$)/.test(r.url()) && r.request().method() === 'POST', {timeout: 15000}).then((r) => r.status()).catch(() => null);
            await affField(d).getByRole('button', {name: 'Add', exact: true}).click();
            const cache = await posted;
            await sleep(1500);
            const err = flat(await page.getByRole('dialog').filter({hasText: /unexpected error/}).last().innerText().catch(() => null), 200);
            fact('pick', {sugg: sugg.suggestions.slice(0, 3), cache, err, aff: await readAff(d), saved: await save(d)});
        });
        await step('funder', async () => {
            await openWorkflow(ctx, S, {entry: 'funding'});
            await page.getByRole('button', {name: 'Add Funder', exact: true}).first().click();
            const fd = page.getByRole('dialog', {name: 'Add Funder'});
            await fd.waitFor({timeout: T});
            const box = fd.locator('input.pkpAutosuggest__input').first();
            await box.click();
            await box.pressSequentially(PADUA.name, {delay: 20});
            const option = fd.locator('li.autosuggest__results-item').filter({has: page.locator(`a[href="${PADUA.ror}"]`)}).first();
            await option.waitFor({timeout: T});
            await option.click();
            await sleep(1500);
            await page.getByRole('dialog').filter({hasText: /unexpected error/}).last().getByRole('button', {name: 'OK'}).click({timeout: 2000}).catch(() => {});
            const ans = page.waitForResponse((r) => /\/funders(\/\d+)?(\?|$)/.test(r.url()) && r.request().method() === 'POST', {timeout: T}).then((r) => r.status()).catch(() => null);
            await fd.getByRole('button', {name: 'Save', exact: true}).click();
            fact('funder', {status: await ans});
            await sleep(1000);
            await snap('funder-added');
        });
        await step('kurdish', async () => {
            // Central Kurdish (ckb, no two-letter code) installed and taken as a submission and metadata language, as
            // Website › Languages stores the ticks (the drive of footnote p).
            const add = (json) => JSON.stringify([...new Set([...JSON.parse(json || '[]'), 'ckb'])]);
            const site = sql(app, 'select installed_locales from site').trim();
            sql(app, `update site set installed_locales = '${add(site)}'`);
            for (const k of ['supportedSubmissionLocales', 'supportedSubmissionMetadataLocales']) {
                const v = sql(app, `select setting_value from ${settings} where ${idCol} = ${cid} and setting_name = '${k}'`).trim();
                sql(app, `update ${settings} set setting_value = '${add(v)}' where ${idCol} = ${cid} and setting_name = '${k}'`);
            }
            fact('languages-after', sql(app, `select setting_name, setting_value from ${settings} where ${idCol} = ${cid} and setting_name in ('supportedSubmissionLocales', 'supportedSubmissionMetadataLocales')`).split('\n'));
            await page.goto(cu(ctx, '/management/settings/website'));
            await idle(page);
            await page.locator('#setup-button').click().catch(() => {});
            await page.locator('#languages-button').click().catch(() => {});
            await idle(page);
            await snap('languages-tab');
            const p0 = Date.now();
            await openWorkflow(ctx, S);
            const d = await openEdit(name.split(' ')[0]);
            const before = await readAff(d);
            await snap('kurdish-edit');
            const res = await save(d);
            const after = await snap('kurdish-saved');
            const out = {before: before.rows.map((r) => ({text: r.text, links: r.links})), res, form: res === 'open' ? await readForm(d) : null, notices: after.notices, publication: pubs.filter((x) => x.at >= p0).slice(-1)};
            if (res === 'open') await closeForm(d);
            await reloadList();
            const e = await openEdit(name.split(' ')[0]);
            out.afterReload = (await readAff(e)).rows.map((r) => ({text: r.text, links: r.links}));
            await closeForm(e);
            out.stored = sql(app, `select f.author_affiliation_id, coalesce(f.ror, '-') from author_affiliations f where f.author_id = ${authorId} order by 1`).split('\n');
            out.publicationAfter = pubs.slice(-1);
            fact('kurdish', out);
            await openWorkflow(ctx, S, {entry: 'funding'});
            await snap('kurdish-funding');
        });
        ror.mode = 'records';
    };

    // ---------------------------------------------------------------- extra (Rule 3's reader pages, ORCID's other end, CRediT graying)
    parts.extra = async () => {
        const C = await mkContext('y', {users: ['mg', 'au'], extra: {orcid: {}, ...(A === 'ojs' ? {issues: [{volume: 1, number: 1, year: 2026, published: true}]} : {})}});
        const P = await mkSub(C, 'p', {contributors: [ROBIN], ...published, ...(A === 'ojs' ? {issue: {volume: 1, number: 1, year: 2026}} : {})});
        fact('seed', {C, P});
        await sign(C.mg, C.path);
        await openWorkflow(C.path, P);
        await step('orcid-on', async () => {
            // ORCID enabled: the form's fields for a Person and for an Organization.
            const d = await openEdit('Robin Okafor');
            await snap('orcid-person');
            const person = (await readForm(d)).fields.map((f) => f.label);
            await d.getByRole('radio', {name: 'Organization or group', exact: true}).check();
            await sleep(500);
            const org = (await readForm(d)).fields.map((f) => f.label);
            await d.getByRole('radio', {name: 'Anonymous', exact: true}).check();
            await sleep(500);
            const anon = (await readForm(d)).fields.map((f) => f.label);
            fact('orcid-on', {person, org, anon});
            await closeForm(d);
        });
        await step('credit-graying', async () => {
            const d = await openEdit('Robin Okafor');
            const field = d.locator('#contributor-creditRoles');
            const rows = () => field.locator('tbody tr').filter({has: page.locator('select')});
            for (let i = 0; i < 2; i++) {
                await field.getByRole('button', {name: 'Add Another Role', exact: true}).click();
                await sleep(1200);
            }
            await rows().nth(1).locator('select').first().selectOption({label: 'Investigation'});
            await sleep(500);
            const read = await rows().evaluateAll((trs) => trs.map((tr) => {
                const s = tr.querySelector('select');
                return {shown: s.options[s.selectedIndex].text, grayed: [...s.options].filter((o) => o.disabled).map((o) => o.text)};
            }));
            fact('credit-graying', read);
            await closeForm(d);
        });
        await step('anonymous-reader', async () => {
            const d = await openAdd();
            await d.getByRole('radio', {name: 'Anonymous', exact: true}).check();
            await sleep(400);
            await fill(d, 'email', 'anonreader@example.test');
            await country(d);
            await tick(d, 'Author');
            fact('anon-saved', await save(d));
            const R = await launch(app);
            try {
                await R.page.goto(`/index.php/${C.path}/en/${LANDING}/${P.id}`);
                await idle(R.page);
                const s = await screen(R.page);
                record(`${part}-landing-anonymous`, s);
                const block = await R.page.locator('.item.authors').first().innerText().catch(() => null);
                const addr = A === 'ojs' ? `/index.php/${C.path}/en/issue/current` : A === 'omp' ? `/index.php/${C.path}/en/catalog` : `/index.php/${C.path}/en/preprints`;
                await R.page.goto(addr);
                await idle(R.page);
                record(`${part}-listing-anonymous`, await screen(R.page));
                const lines = await R.page.locator('.obj_article_summary .authors, .obj_monograph_summary .author, .obj_preprint_summary .authors').allInnerTexts();
                fact('anonymous-reader', {block: flat(block, 300), lines: lines.map((l) => flat(l, 200)), meta: await (async () => { await R.page.goto(`/index.php/${C.path}/en/${LANDING}/${P.id}`); return R.page.locator('meta[name="citation_author"]').evaluateAll((ms) => ms.map((m) => m.content)); })()});
            } finally {
                await R.close();
            }
        });
    };

    // ---------------------------------------------------------------- profile (Cross-feature: the profile affiliation copied)
    parts.profile = async () => {
        const L = ['en', 'fr_CA'];
        const t = tag('u41sw20q');
        await app.api.createContext({tag: t, users: [
            {username: `${t}mg`, roles: ['manager'], givenName: 'Mona', familyName: 'Manager', email: `${t}mg@mail.test`},
            {username: `${t}au`, roles: ['author'], givenName: 'Ada', familyName: 'Author', email: `${t}au@mail.test`, affiliation: {en: 'Profile University'}},
        ], context: {name: `U41 SW20 q ${t}`, contactName: 'Paula Principal', contactEmail: `principal${t}@mail.test`, supportedLocales: L, supportedFormLocales: L, supportedSubmissionLocales: L}});
        const C = {t, path: t, mg: `${t}mg`, au: `${t}au`};
        const SE = await mkSub(C, 'en', {});
        const SF = await mkSub(C, 'fr', {locale: 'fr_CA', title: {fr_CA: `SW20 fr ${t}`}, abstract: {fr_CA: 'Résumé.'}});
        fact('seed', {C, SE, SF});
        await sign(C.mg, C.path);
        for (const [key, sub] of [['en', SE], ['fr', SF]]) {
            await step(key, async () => {
                await openWorkflow(C.path, sub);
                const d = await openEdit('Ada');
                const aff = await readAff(d);
                const row = affField(d).locator('tbody tr').first();
                const menu = (await row.getByRole('button', {name: 'Click to edit or delete'}).count()) ? await affMenu(row) : null;
                if (menu && menu.includes('Edit institution name')) {
                    await page.getByRole('menuitem', {name: 'Edit institution name', exact: true}).click();
                    await sleep(400);
                } else await page.keyboard.press('Escape').catch(() => {});
                await snap(`profile-${key}`);
                fact(key, {rows: aff.rows.map((r) => ({text: r.text, links: r.links})), menu, boxes: (await readAff(d)).rows.map((r) => r.boxes), stored: sql(app, `select fs.locale, fs.setting_value from authors a join author_affiliations f on f.author_id = a.author_id join author_affiliation_settings fs on fs.author_affiliation_id = f.author_affiliation_id where a.publication_id = ${sub.pub} order by 1`).split('\n'), ror: sql(app, `select coalesce(f.ror, '-') from authors a join author_affiliations f on f.author_id = a.author_id where a.publication_id = ${sub.pub}`)});
                await closeForm(d);
            });
        }
    };

    // ---------------------------------------------------------------- upgraded (Rule 11: roles after an upgrade from 3.5)
    parts.upgraded = async () => {
        if (!app.dataset) return fact('skipped', 'needs a dataset fleet loaded from stable-3_5_0 (PKP_E2E_DATASET_BRANCH)');
        const ctx = app.contextPath;
        fact('versions', sql(app, "select major || '.' || minor || '.' || revision || '.' || build, date_installed from versions where current = 1 and product_type = 'core'"));
        await sign('dbarnes', ctx);
        await page.goto(cu(ctx, '/management/settings/workflow'));
        await idle(page);
        const tab = page.locator('#contributorRoles-button');
        if (!(await tab.isVisible().catch(() => false))) await page.locator('#submission-button').click().catch(() => {});
        await tab.click().catch(() => {});
        await page.getByRole('table', {name: 'Contributor Roles'}).waitFor({timeout: T}).catch(() => {});
        await idle(page);
        await snap('roles');
        fact('roles', await page.getByRole('table', {name: 'Contributor Roles'}).locator('tbody tr').allInnerTexts().then((r) => r.map((x) => flat(x, 100))).catch(() => null));
        const cid = sql(app, `select ${app.contextTables.id} from ${app.contextTables.table} where path = '${ctx}'`).trim();
        fact('roles-stored', sql(app, `select r.contributor_role_identifier, s.locale, s.setting_value from contributor_roles r left join contributor_role_settings s on s.contributor_role_id = r.contributor_role_id and s.setting_name = 'name' where r.context_id = ${cid} order by r.contributor_role_id, s.locale`).split('\n'));
        // The contributor form on the first unpublished item: the Contributor Roles field (A14 when one role).
        const pick = sql(app, `select s.submission_id, p.publication_id from submissions s join publications p on p.publication_id = s.current_publication_id where s.context_id = ${cid} and p.status = 1 and s.submission_progress = '' order by s.submission_id limit 1`).split('|');
        const S = {id: pick[0], pub: pick[1]};
        await step('form', async () => {
            await openWorkflow(ctx, S);
            const first = (await readList()).rows[0];
            const d = await openEdit(first.text.split(' ').slice(0, 2).join(' '));
            await snap('form');
            fact('form', {row: first, fields: (await readForm(d)).fields.filter((f) => /Roles/.test(f.label || '')).map((f) => ({label: f.label, controls: f.controls.map((c) => c.label)}))});
            await closeForm(d);
        });
    };

    // ------------------------------------------------------------------ run
    try {
        for (const p of PARTS) {
            if (!parts[p]) continue;
            part = p;
            stepNo = 0;
            log(`part ${p}`);
            try {
                await parts[p]();
            } catch (e) {
                fact('PART ERROR', flat(e.stack || e.message, 900));
                await snap('part-error');
            }
        }
    } finally {
        record(`facts-all`, facts);
        await close();
    }
});
