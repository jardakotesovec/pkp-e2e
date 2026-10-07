// U41 claim check, housekeeping chunk I07b (2026-10-07): three rows of docs/tracking/incidentals.md.
// Spec: docs/specs/U41-contributors-and-affiliations.md.
//
//   l42   Scenario 4 "An empty primary-language name", Fields "Affiliations", A7, A14: "Add Contributor" with a
//         hand-entered institution whose English name is cleared in "Edit institution name" before "Save".
//           mg      the scratch journal's manager on the workflow's Contributors page (two submission languages):
//                   "Save" refused, the name typed back, "Save" again; the contributors after each "Save" (the
//                   page's own list, the stored rows) and after a reload; "Edit" on each row the walk left
//           edit    the control: "Edit" on a saved contributor, Given Name changed and the institution's English
//                   name cleared, "Save" refused, "Close"; after a reload the name as it was
//           en      the other end of the languages: the same add on a journal with English alone
//           wizard  the other level and screen: the author on a draft's wizard "Contributors" step; after the
//                   refusal the window is left by "Close" (no second "Save"), then the list after a reload
//   l43   Rules 14, 16, Fields "Affiliations": the order of a contributor's affiliations after a second one is
//         added in "Edit" on a published item. As the manager, on two published scratch items:
//           registry  one hand-entered affiliation saved, then "University of Ljubljana" picked from the registry
//           typed     one hand-entered affiliation saved, then a second hand-entered one (the other end)
//           pair      the registry walk on an item that already has a second contributor (added first)
//         Read each time: the form's list before "Save", the form's list after a reload, the published page's
//         author block (a signed-out reader), the publication as the page's own fetch gave it; then "Edit" ›
//         "Save" with nothing changed three times, and a second contributor added to the item (the reads again).
//         Beside them, database reads (never steps): the rows in the order the affiliations query returns them,
//         their places in the table, and the query's plan.
//         Precondition: a registry-picked institution has a name only where the install's registry copy holds
//         it, and a test install's copy is empty (Coverage "No seed"), so the run puts this one institution's
//         record into the copy before the pick and takes it out at the end (REGISTRY=0 leaves the copy alone:
//         the pick then ends as A5 describes, nameless).
//   l12   Fields "CRediT roles and the degrees of contribution", A10: two rows in the CRediT table. Each row's
//         two selects as the browser builds them (id, how many elements carry it, the label and what its `for`
//         points at) and as Chromium's accessibility tree names them; where the cursor lands after a click on
//         each row's labels; a key pressed after the click on row 2's label. On "Add Contributor" and on
//         "Edit" (manager, workflow) and on the author's wizard step; nothing is saved (each window is left with
//         the rows added: by "Close", and "Edit" by the Escape key). The Country select is read the same way as
//         the control. What each press of "Add Another Role" draws is recorded step by step.
//
//   .reports/hk07b/applock.sh shared ojs,omp,ops -- env PROBE_FEATURE=U41 PROBE_AGENT=ccI07b PROBE_RUN=r1 \
//       node bin/probe.js all shared/playwright/checks/U41/I07b/i07b.js
//   PHASES narrows (l12,l42,l43). Each run seeds two scratch contexts of its own (tag prefix u41i07b);
//   publicknowledge is never touched. Facts: .reports/U41/<agent>/facts-<run>-<app>.json. Records; asserts nothing.
const {forEachApp, launch, signIn, signOut, screen, shot, record, loc, note, idle, tag, sql} = require('../../../probe');

const PHASES = (process.env.PHASES || 'l12,l42,l43').split(',');
const REGISTRY = process.env.REGISTRY !== '0';
const RUN = process.env.PROBE_RUN || 'r0';
const T = 30_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (s, n = 600) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));
const ORG = {ror: 'https://ror.org/05njb9z20', name: 'University of Ljubljana', other: {locale: 'sl', name: 'Univerza v Ljubljani'}};
const PUBLIC = {ojs: 'article/view', omp: 'catalog/book', ops: 'preprint/view'};
const PRIMARY_MESSAGE = 'Please provide affiliation name in the submission primary locale.';

forEachApp(async (app) => {
    const log = (...a) => console.log(`[i07b ${RUN} ${app.name}]`, ...a);
    const facts = {app: app.name, run: RUN, startedAt: new Date().toISOString()};
    const fact = (k, v) => {
        facts[k] = v;
        log(`fact ${k}: ${flat(JSON.stringify(v), 1200)}`);
        record('facts', facts);
    };
    const cu = (ctx, p = '') => app.url(`/index.php/${ctx}/en${p}`);

    // ------------------------------------------------------------------ seed
    const t = tag('u41i07b');
    const mk = async (suffix, locales, withPublished) => {
        const c = `${t}${suffix}`;
        const users = [
            {username: `${c}mg`, roles: ['manager'], givenName: 'Mona', familyName: 'Manager'},
            {username: `${c}au`, roles: ['author'], givenName: 'Alma', familyName: 'Author'},
        ];
        const ctx = await app.api.createContext({
            tag: c,
            users,
            context: {name: `U41 I07b ${suffix} ${t}`, supportedLocales: locales, supportedFormLocales: locales, supportedSubmissionLocales: locales},
        });
        const out = {path: ctx.path || c, mg: `${c}mg`, au: `${c}au`};
        const sub = async (key, extra) => {
            const s = await app.api.createSubmission({tag: `${c}${key}`, context: out.path, submitter: out.au, title: `I07b ${suffix} ${key} ${t}`, ...extra});
            out[key] = {id: s.submissionId, pub: s.publicationId};
        };
        await sub('s', {});
        if (withPublished) {
            const published = app.name === 'omp' ? {decisions: ['skipExternalReview', 'sendToProduction'], published: true} : {published: true};
            await sub('d', {submitted: false});
            await sub('p1', published);
            await sub('p2', published);
            await sub('p3', published);
        }
        return out;
    };
    const A = await mk('a', ['en', 'fr_CA'], true);
    const E = await mk('e', ['en'], false);
    fact('seed', {A, E});

    const {page, close} = await launch(app);
    const R = await launch(app); // the signed-out reader
    const reader = R.page;
    let stubRegistry = true;
    const registryTraffic = [];
    await page.route('https://api.ror.org/**', (route) =>
        stubRegistry
            ? route.fulfill({status: 200, contentType: 'application/json', headers: {'Access-Control-Allow-Origin': '*'}, body: JSON.stringify({items: []})})
            : route.continue()
    );
    const dialogs = [];
    page.on('dialog', async (d) => {
        dialogs.push({at: Date.now(), type: d.type(), message: flat(d.message(), 300)});
        await (d.type() === 'beforeunload' ? d.accept() : d.dismiss()).catch(() => {});
    });
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push({at: Date.now(), message: flat(e.message, 300)}));
    /** The page's own contributor and registry-copy writes with what the server answered, and each publication it fetched. */
    const writes = [];
    const lastPublication = {};
    const contributorFetches = [];
    page.on('response', async (r) => {
        const u = r.url();
        const m = r.request().method();
        if (/api\.ror\.org/.test(u)) {
            registryTraffic.push({at: Date.now(), status: r.status(), stubbed: stubRegistry, url: flat(u, 160)});
            return;
        }
        if (!/\/api\/v1\//.test(u) || /_test\//.test(u)) return;
        const pubGet = u.match(/\/submissions\/\d+\/publications\/(\d+)(\?|$)/);
        if (m === 'GET' && pubGet && r.status() === 200) {
            const j = await r.json().catch(() => null);
            if (j && Array.isArray(j.authors)) {
                lastPublication[pubGet[1]] = j.authors.map((a) => ({
                    id: a.id,
                    name: a.fullName,
                    affiliations: (a.affiliations || []).map((f) => (f.name && f.name.en) || f.ror || '(nameless)'),
                }));
            }
            return;
        }
        if (m === 'GET' && /\/contributors(\/\d+)?(\?|$)/.test(u) && r.status() === 200) {
            const j = await r.json().catch(() => null);
            const list = j && Array.isArray(j.items) ? j.items : j && j.id ? [j] : [];
            contributorFetches.push({at: Date.now(), url: u.split('?')[0].replace(/^.*\/api\/v1\//, ''), authors: list.map((a) => `${a.fullName} [${(a.affiliations || []).map((f) => (f.name && f.name.en) || f.ror || '(nameless)').join(' | ')}]`)});
            return;
        }
        if (m === 'GET' || !/\/(contributors|rors)(\/|\?|$)/.test(u)) return;
        const e = {at: Date.now(), op: r.request().headers()['x-http-method-override'] || m, url: u.split('?')[0].replace(/^.*\/api\/v1\//, ''), status: r.status()};
        const body = await r.text().catch(() => '');
        try {
            const j = JSON.parse(body);
            if (r.status() >= 400) e.answer = j;
            else if (j && typeof j === 'object') e.answer = {id: j.id, fullName: j.fullName, affiliations: (j.affiliations || []).map((f) => (f.name && f.name.en) || f.ror || '(nameless)'), ror: j.ror};
        } catch (err) {
            e.answer = flat(body, 300);
        }
        if (/\/contributors/.test(u)) {
            // The form posts its boxes URL-encoded: the given name and each affiliation (id, ROR, English name) in the order sent.
            const sent = new URLSearchParams(r.request().postData() || '');
            const affiliations = [];
            for (const [k, v] of sent) {
                const m = k.match(/^affiliations\[(\d+)\]\[(id|ror)\]$/) || k.match(/^affiliations\[(\d+)\]\[(name)\]\[en\]$/);
                if (m) (affiliations[Number(m[1])] = affiliations[Number(m[1])] || {})[m[2]] = v;
            }
            e.sent = {givenName: sent.get('givenName[en]'), affiliations};
        }
        writes.push(e);
    });
    const since = (list, t0) => list.filter((x) => x.at >= t0).map(({at, ...x}) => x);

    const snap = async (name, p = page) => {
        let s;
        try {
            s = await screen(p);
        } catch (e) {
            s = {url: p.url(), error: flat(e.message, 300)};
        }
        record(name, s);
        await shot(p, name).catch(() => {});
        return s;
    };
    const part = async (key, fn) => {
        log(`part ${key}`);
        try {
            await fn();
        } catch (e) {
            fact(`${key} ERROR`, flat(e.stack || e.message, 900));
            await snap(`${key}-error`);
            // Leave any window the part left open, so the next part starts from the page.
            await page.keyboard.press('Escape').catch(() => {});
            await sleep(500);
        }
    };

    // ------------------------------------------------------------------ database reads (never steps)
    const json = (query) => JSON.parse(sql(app, query) || 'null');
    /** The contributors of a publication as stored, each with its affiliations (id, place in the table, name or ROR). */
    const stored = (pub) =>
        json(
            `select coalesce(json_agg(json_build_object('id', a.author_id, 'given', (select setting_value from author_settings s where s.author_id = a.author_id and s.setting_name = 'givenName' and s.locale = 'en'), 'affiliations', (select coalesce(json_agg(json_build_object('id', f.author_affiliation_id, 'place', f.ctid::text, 'is', coalesce((select setting_value from author_affiliation_settings fs where fs.author_affiliation_id = f.author_affiliation_id and fs.setting_name = 'name' and fs.locale = 'en'), f.ror)) order by f.author_affiliation_id), '[]'::json) from author_affiliations f where f.author_id = a.author_id)) order by a.seq, a.author_id), '[]'::json) from authors a where a.publication_id = ${pub}`
        );
    const count = (pub) => Number(sql(app, `select count(*) from authors where publication_id = ${pub}`));
    /** The affiliations in the order the app's own query returns them (affiliation Collector: no ordering), with its plan. */
    const queryOrder = (pub, authorId) => {
        const q = (ids) =>
            `select a.author_affiliation_id from author_affiliations as a inner join authors as au on a.author_id = au.author_id inner join publications as p on au.publication_id = p.publication_id inner join submissions as s on p.submission_id = s.submission_id where a.author_id in (${ids.join(', ')})`;
        const all = sql(app, `select author_id from authors where publication_id = ${pub} order by author_id`).split('\n').filter(Boolean);
        const names = Object.fromEntries(stored(pub).flatMap((a) => a.affiliations.map((f) => [String(f.id), f.is])));
        const run = (ids) => ({
            returned: sql(app, q(ids)).split('\n').filter(Boolean).map((id) => `${id} ${names[id] ?? ''}`.trim()),
            plan: sql(app, `explain (costs off) ${q(ids)}`).split('\n').map((l) => l.trim()),
        });
        return {authorsOfThePublication: all.length, forThePublicationsAuthors: run(all), forThisAuthorAlone: run([authorId])};
    };

    // ------------------------------------------------------------------ screens
    const panel = () => page.locator('.listPanel--contributor').first();
    const rowItems = () => panel().locator('li.listPanel__item');
    const rowTexts = async () => (await rowItems().allInnerTexts().catch(() => [])).map((x) => flat(x, 160));
    const formDialog = () => page.getByRole('dialog', {name: /^(Add Contributor|Edit)$/}).last();
    const affField = (d) => d.locator('#contributor-affiliations');
    const creditField = (d) => d.locator('#contributor-creditRoles');
    const openList = async (url) => {
        await page.goto(url);
        await idle(page).catch(() => {});
        await panel().waitFor({timeout: 15_000}).catch(() => {});
        if (!(await panel().isVisible().catch(() => false))) {
            const link = page.locator('[role="dialog"]:visible').first().getByRole('link', {name: 'Contributors', exact: true});
            if (await link.count()) {
                await link.last().click();
                await idle(page).catch(() => {});
            }
            await panel().waitFor({timeout: T});
        }
        await idle(page).catch(() => {});
        await sleep(500);
    };
    const workflow = (ctx, sub) => () => openList(cu(ctx, `/dashboard/editorial?workflowSubmissionId=${sub.id}&workflowMenuKey=publication_${sub.pub}_contributors`));
    const wizard = (ctx, sub) => async () => {
        await page.goto(cu(ctx, `/submission?id=${sub.id}`));
        await idle(page).catch(() => {});
        for (let i = 0; i < 5 && !(await panel().isVisible().catch(() => false)); i++) {
            const next = page.getByRole('button', {name: 'Continue', exact: true});
            if (!(await next.count())) break;
            await next.first().click();
            await idle(page).catch(() => {});
            await sleep(800);
        }
        await panel().waitFor({timeout: T});
        await idle(page).catch(() => {});
    };
    const openAdd = async () => {
        await panel().getByRole('button', {name: 'Add Contributor', exact: true}).click();
        const d = formDialog();
        await d.waitFor({timeout: T});
        await d.locator('input[name="email"]').waitFor({timeout: T});
        await idle(page).catch(() => {});
        await sleep(500);
        return d;
    };
    const openEdit = async (rowText, nth = 0) => {
        await rowItems().filter({hasText: rowText}).nth(nth).getByRole('button', {name: 'Edit', exact: true}).click();
        const d = formDialog();
        await d.waitFor({timeout: T});
        await d.locator('input[name="email"]').waitFor({timeout: T});
        await idle(page).catch(() => {});
        await sleep(700);
        return d;
    };
    /** Leave an open window by its own "Close"; what asked on the way out. */
    const closeForm = async (d, {by = 'Close'} = {}) => {
        const t0 = Date.now();
        if (by === 'Escape') await page.keyboard.press('Escape');
        else await d.getByRole('button', {name: 'Close', exact: true}).first().click({timeout: 10_000});
        await sleep(2000);
        const windows = await page
            .locator('[role="dialog"]:visible, [role="alertdialog"]:visible')
            .evaluateAll((els) => els.map((e) => (e.getAttribute('aria-label') || (e.querySelector('h1, h2, [class*="title"]') || {}).innerText || '').replace(/\s+/g, ' ').trim().slice(0, 80)));
        const out = {formStillOpen: (await page.getByRole('dialog', {name: /^(Add Contributor|Edit)$/}).count()) > 0, windowsOpen: windows, browserDialogs: since(dialogs, t0)};
        await idle(page).catch(() => {});
        return out;
    };
    const fillPerson = async (d, {given, family, email}) => {
        if (given !== undefined) await d.locator('input[name="givenName-en"]').fill(given);
        if (family !== undefined) await d.locator('input[name="familyName-en"]').fill(family);
        if (email !== undefined) await d.locator('input[name="email"]').fill(email);
        await d.locator('select[name="country"]').selectOption({label: 'Canada'});
        const author = d.getByRole('checkbox', {name: 'Author', exact: true});
        if ((await author.count()) && !(await author.isChecked())) await author.check();
    };
    /** The open form as data: the messages under its fields, its foot, the foot's "Go to …" buttons, "Save". */
    const formInfo = async () => {
        const d = formDialog();
        if (!(await d.count())) return {open: false};
        const info = await d.evaluate((root) => {
            const vis = (e) => e.getClientRects().length > 0;
            const f = (s) => (s || '').replace(/\s+/g, ' ').trim();
            return {
                open: true,
                fieldMessages: [...root.querySelectorAll('.pkpFieldError')].filter(vis).map((e) => f(e.innerText)),
                foot: [...root.querySelectorAll('.pkpFormPage__footer, .pkpFormPage__status, [role="status"], [role="alert"]')].filter(vis).map((e) => f(e.innerText).slice(0, 300)),
                save: [...root.querySelectorAll('button')].filter((b) => vis(b) && f(b.innerText) === 'Save').map((b) => (b.disabled ? 'disabled' : 'enabled')),
            };
        });
        info.goTo = (await d.getByRole('button', {name: /^Go to /}).allInnerTexts().catch(() => [])).map((x) => flat(x, 160));
        return info;
    };
    /** The Affiliations table of an open form, row by row: the text, the registry links, the name boxes. */
    const affRows = (d) =>
        affField(d)
            .locator('tbody tr')
            .evaluateAll((trs) =>
                trs.map((tr) => ({
                    text: tr.innerText.replace(/\s+/g, ' ').trim().slice(0, 200),
                    registryLinks: [...new Set([...tr.querySelectorAll('a[href^="https://ror.org/"]')].map((a) => a.getAttribute('href')))],
                    nameBoxes: [...tr.querySelectorAll('input[name="name"]')].map((i) => i.value),
                }))
            );
    /** Type an institution, pick the typed text itself, "Add" (the registry search answered empty, as the suites do). */
    const addTyped = async (d, name) => {
        stubRegistry = true;
        const f = affField(d);
        const search = f.locator('input.pkpAutosuggest__input');
        await search.click();
        await search.pressSequentially(name, {delay: 15});
        const option = f.locator('li.autosuggest__results-item').filter({hasText: name}).first();
        await option.waitFor({timeout: T});
        await option.click();
        const add = f.getByRole('button', {name: 'Add', exact: true});
        await add.waitFor({timeout: T});
        await add.click();
        await f.locator('tbody tr').filter({hasText: name}).first().waitFor({timeout: T});
    };
    /** Type the organisation's name, pick the public registry's own suggestion for it (live), "Add". */
    const addRegistry = async (d, org) => {
        stubRegistry = false;
        const t0 = Date.now();
        const out = {};
        try {
            const f = affField(d);
            const search = f.locator('input.pkpAutosuggest__input');
            await search.click();
            await search.pressSequentially(org.name, {delay: 25});
            const option = f.locator('li.autosuggest__results-item').filter({has: page.locator(`a[href="${org.ror}"]`)}).first();
            await option.waitFor({timeout: T});
            out.suggestions = (await f.locator('li.autosuggest__results-item').allInnerTexts()).map((x) => flat(x, 100)).slice(0, 6);
            await option.click();
            const add = f.getByRole('button', {name: 'Add', exact: true});
            await add.waitFor({timeout: T});
            const copy = page.waitForResponse((r) => /\/api\/v1\/rors\/?(\?|$)/.test(r.url()) && r.request().method() === 'POST', {timeout: 12_000}).catch(() => null);
            await add.click();
            await copy;
            await sleep(600);
            const w = page.locator('[role="dialog"]:visible, [role="alertdialog"]:visible').filter({hasText: 'An unexpected error has occurred'}).last();
            if (await w.count()) {
                out.errorWindow = flat(await w.innerText().catch(() => ''), 300);
                await w.getByRole('button', {name: /^(OK|Ok|Close)$/}).first().click().catch(() => {});
                await sleep(600);
            } else {
                out.errorWindow = null;
            }
        } finally {
            stubRegistry = true;
            out.registryTraffic = since(registryTraffic, t0);
            out.sent = since(writes, t0);
        }
        return out;
    };
    /** "Save"; the contributor write it sent (none within 12 s: refused in the browser), and whether the window stays. */
    const save = async (d) => {
        const t0 = Date.now();
        const answered = page.waitForResponse((r) => /\/contributors(\/\d+)?(\?|$)/.test(r.url()) && r.request().method() !== 'GET', {timeout: 12_000}).catch(() => null);
        await d.getByRole('button', {name: 'Save', exact: true}).click();
        const r = await answered;
        if (r && r.status() < 400) await page.getByRole('dialog', {name: /^(Add Contributor|Edit)$/}).first().waitFor({state: 'detached', timeout: T}).catch(() => {});
        await idle(page).catch(() => {});
        await sleep(900);
        return {status: r ? r.status() : 'no request', sent: since(writes, t0), windowStaysOpen: (await page.getByRole('dialog', {name: /^(Add Contributor|Edit)$/}).count()) > 0};
    };
    /** In an open form: "Edit institution name" on the named row, the English box emptied. */
    const clearEnglishName = async (d, inst) => {
        const row = affField(d).locator('tbody tr').filter({hasText: inst}).first();
        await row.getByRole('button', {name: 'Click to edit or delete'}).click();
        await page.getByRole('menuitem', {name: 'Edit institution name', exact: true}).click();
        const boxes = affField(d).locator('input[name="name"]');
        await boxes.first().waitFor({timeout: T});
        const n = await boxes.count();
        await boxes.first().fill('');
        await sleep(400);
        return n;
    };

    /** Role, name and description of a locator's first element as Chromium's accessibility tree computes them. */
    const axOf = async (locator) => {
        const cdp = await page.context().newCDPSession(page);
        try {
            const handle = await locator.first().elementHandle();
            await handle.evaluate((el) => {
                window.__axProbe = el;
            });
            const {result} = await cdp.send('Runtime.evaluate', {expression: 'window.__axProbe'});
            const {nodes} = await cdp.send('Accessibility.getPartialAXTree', {objectId: result.objectId, fetchRelatives: false});
            const node = nodes[0] || {};
            return {role: node.role ? node.role.value : null, name: node.name ? node.name.value : null, description: node.description ? node.description.value : null};
        } finally {
            await cdp.detach().catch(() => {});
        }
    };
    /** A select as the browser builds it: its id, how many elements carry that id, the labels whose `for` names it. */
    const selectFacts = async (locator) => {
        const dom = await locator.first().evaluate((el) => {
            const f = (s) => (s || '').replace(/\s+/g, ' ').trim();
            return {
                name: el.getAttribute('name'),
                id: el.id,
                elementsWithId: el.id ? document.querySelectorAll(`[id="${CSS.escape(el.id)}"]`).length : 0,
                labelsPointingAtThisId: el.id ? document.querySelectorAll(`label[for="${CSS.escape(el.id)}"]`).length : 0,
                shown: f(el.selectedOptions[0] && el.selectedOptions[0].innerText),
                ariaLabel: el.getAttribute('aria-label'),
                ariaLabelledby: el.getAttribute('aria-labelledby'),
                ariaDescribedby: el.getAttribute('aria-describedby'),
            };
        });
        return {...dom, ax: await axOf(locator)};
    };
    const cursor = () =>
        page.evaluate(() => {
            const el = document.activeElement;
            if (!el || el === document.body) return null;
            const tr = el.closest('#contributor-creditRoles tbody tr');
            return {element: el.tagName.toLowerCase(), name: el.getAttribute('name'), id: el.id || null, creditRow: tr ? [...tr.parentElement.children].indexOf(tr) + 1 : null};
        });
    /**
     * The CRediT table of an open form with two rows: every select and label read, each label clicked (where the
     * cursor lands), a key pressed after the click on row 2's "Role" label. Nothing is saved.
     */
    const creditRead = async (d, key) => {
        const out = {};
        const f = creditField(d);
        await f.scrollIntoViewIfNeeded().catch(() => {});
        out.fieldOnOpen = flat(await f.innerText().catch(() => null), 300);
        const addRow = f.getByRole('button', {name: 'Add Another Role', exact: true});
        const rows = f.locator('tbody tr');
        const values = () => rows.evaluateAll((trs) => trs.map((tr) => [...tr.querySelectorAll('select')].map((s) => (s.selectedOptions[0] ? s.selectedOptions[0].innerText.trim() : null))));
        // What each press and pick does, row by row, until two rows show.
        out.steps = [];
        const step = async (did, fn) => {
            await fn();
            await sleep(900);
            const shown = await values();
            out.steps.push({did, rowsShown: shown});
            return shown.length;
        };
        await step('"Add Another Role"', () => addRow.click());
        await snap(`${key}-credit-one-row`);
        let n = await step('"Add Another Role" again, row 1 untouched', () => addRow.click());
        if (n < 2) n = await step('three seconds on, nothing pressed', () => sleep(3000));
        if (n < 2) n = await step('row 1: a "Degree" picked', () => rows.first().locator('select').nth(1).selectOption({index: 1}, {timeout: 5000}).catch(() => {}));
        if (n < 2) n = await step('"Add Another Role" after the degree pick', () => addRow.click());
        if (n < 2) n = await step('row 1: another role picked', () => rows.first().locator('select').first().selectOption({index: 3}, {timeout: 5000}).catch(() => {}));
        if (n < 2) n = await step('"Add Another Role" after the role pick', () => addRow.click());
        if (n < 2) {
            await snap(`${key}-credit-no-second-row`);
            out.noSecondRow = true;
            return out;
        }
        out.rowsAfterTwoAdds = await values();
        // Row 2 moved onto a role and a degree of its own, so the two rows differ in both columns.
        const row2 = rows.nth(1);
        const free = await row2.locator('select').first().evaluate((sel) => [...sel.options].findIndex((o, i) => i > 3 && !o.disabled && !o.selected));
        await row2.locator('select').first().selectOption({index: free}, {timeout: 5000}).catch((e) => (out.row2RoleError = flat(e.message, 200)));
        await row2.locator('select').nth(1).selectOption({index: 3}, {timeout: 5000}).catch((e) => (out.row2DegreeError = flat(e.message, 200)));
        await sleep(300);
        out.rowsAfterPickInRow2 = await values();
        await snap(`${key}-credit-two-rows`);
        await loc(page, 'contributor form: the CRediT table\'s rows', rows);
        await loc(page, 'contributor form: a CRediT row\'s selects', rows.first().locator('select'));
        out.rows = [];
        for (let i = 0; i < (await rows.count()); i++) {
            const row = rows.nth(i);
            const labels = await row.locator('label').evaluateAll((ls) =>
                ls.map((l) => {
                    const target = l.htmlFor ? document.getElementById(l.htmlFor) : null;
                    const tr = target && target.closest('#contributor-creditRoles tbody tr');
                    const box = l.getBoundingClientRect();
                    return {
                        text: l.innerText.replace(/\s+/g, ' ').trim(),
                        for: l.htmlFor || null,
                        forPointsAt: target ? `${target.tagName.toLowerCase()}[name="${target.getAttribute('name')}"] in row ${tr ? [...tr.parentElement.children].indexOf(tr) + 1 : '(outside the table)'}` : null,
                        size: `${Math.round(box.width)}x${Math.round(box.height)}`,
                        classes: l.className,
                    };
                })
            );
            const selects = [];
            for (let j = 0; j < (await row.locator('select').count()); j++) selects.push(await selectFacts(row.locator('select').nth(j)));
            out.rows.push({row: i + 1, labels, selects});
        }
        out.countrySelectForComparison = await selectFacts(d.locator('select[name="country"]'));
        out.countryLabel = await d
            .locator('select[name="country"]')
            .first()
            .evaluate((el) => [...document.querySelectorAll(`label[for="${CSS.escape(el.id)}"]`)].map((l) => l.innerText.replace(/\s+/g, ' ').trim()));
        // A click on each label: where the cursor lands.
        out.labelClicks = [];
        for (let i = 0; i < (await rows.count()); i++) {
            const labels = rows.nth(i).locator('label');
            for (let j = 0; j < (await labels.count()); j++) {
                const label = labels.nth(j);
                const entry = {row: i + 1, label: flat(await label.innerText().catch(() => ''), 60)};
                await d.locator('input[name="email"]').focus();
                try {
                    await label.click({position: {x: 4, y: 4}, timeout: 4000});
                    entry.how = 'mouse click';
                } catch (e) {
                    entry.how = `not clickable with the mouse (${flat(e.message, 120)})`;
                }
                await sleep(250);
                entry.cursorLandsIn = await cursor();
                out.labelClicks.push(entry);
            }
        }
        // The consequence: after a click on row 2's "Role" label, a pick made from the keyboard.
        const role2 = rows.nth(1).locator('label').first();
        if (await role2.count()) {
            await d.locator('input[name="email"]').focus();
            const clicked = await role2.click({position: {x: 4, y: 4}, timeout: 4000}).then(() => true).catch(() => false);
            await sleep(250);
            const landed = await cursor();
            const beforeKey = await values();
            if (clicked && landed && landed.element === 'select') {
                await page.keyboard.press('End');
                await sleep(300);
            }
            out.keyAfterClickOnRow2RoleLabel = {clicked, cursorLandsIn: landed, key: 'End', rowsBefore: beforeKey, rowsAfter: await values()};
        }
        await snap(`${key}-credit-after-clicks`);
        return out;
    };

    // ------------------------------------------------------------------ l42
    /** The row's walk on an "Add Contributor" window: add refused, then the name typed back and saved, or the window closed. */
    const refusedAdd = async (key, {open, pub, retry}) => {
        const out = {};
        const stamp = `${key.replace(/[^a-z]/g, '')}${String(Date.now()).slice(-5)}`;
        const given = `Lea${stamp}`;
        const inst = `Probe Institute ${stamp}`;
        await open();
        await snap(`${key}-0-list`);
        out.before = {listOnThePage: await rowTexts(), stored: stored(pub).map((a) => `${a.given} [${a.affiliations.map((f) => f.is).join(' | ')}]`)};
        const d = await openAdd();
        await fillPerson(d, {given, family: 'Refused', email: `${stamp}@mail.test`});
        await addTyped(d, inst);
        out.nameBoxes = await clearEnglishName(d, inst);
        out.affiliationsBeforeSave = await affRows(d);
        await snap(`${key}-1-name-cleared`);
        const s1 = await save(d);
        const refused = await snap(`${key}-2-first-save`);
        out.firstSave = {
            ...s1,
            notices: refused.notices,
            form: await formInfo(),
            affiliations: s1.windowStaysOpen ? await affRows(d) : null,
            contributorsStored: count(pub),
            listOnThePageBehindTheWindow: await rowTexts(),
            stored: stored(pub).map((a) => `${a.given} [${a.affiliations.map((f) => f.is).join(' | ')}]`),
        };
        if (s1.windowStaysOpen && retry) {
            const box = affField(d).locator('input[name="name"]').first();
            await box.fill(inst);
            await sleep(400);
            out.afterTypingTheNameBack = await formInfo();
            const s2 = await save(d);
            const saved = await snap(`${key}-3-second-save`);
            out.secondSave = {...s2, notices: saved.notices, contributorsStored: count(pub), listOnTheSamePage: await rowTexts()};
        } else if (s1.windowStaysOpen) {
            out.closed = await closeForm(d);
            const closed = await snap(`${key}-3-closed`);
            out.afterClose = {notices: closed.notices, contributorsStored: count(pub), listOnTheSamePage: await rowTexts()};
        }
        await open();
        await snap(`${key}-4-reload`);
        out.afterReload = {listOnThePage: await rowTexts(), contributorsStored: count(pub), stored: stored(pub).map((a) => `${a.given} [${a.affiliations.map((f) => f.is).join(' | ')}]`)};
        // "Edit" on each row the walk left: what each one holds.
        out.editOnEachRowLeft = [];
        const n = await rowItems().filter({hasText: given}).count();
        for (let i = 0; i < n; i++) {
            const e = await openEdit(given, i);
            out.editOnEachRowLeft.push({row: i + 1, givenName: await e.locator('input[name="givenName-en"]').inputValue(), affiliations: await affRows(e)});
            if (i === 0) await snap(`${key}-5-edit-first-row-left`);
            out.editOnEachRowLeft[i].closed = await closeForm(e);
        }
        out.pageErrors = pageErrors.map(({at, ...x}) => x);
        fact(key, out);
        return {given, inst, rowsLeft: n};
    };
    /** The control: an "Edit" refused for the same reason saves nothing of the window. */
    const refusedEdit = async (key, {open, pub, given, inst, nth}) => {
        const out = {};
        await open();
        const d = await openEdit(given, nth);
        out.affiliationsOnOpen = await affRows(d);
        await d.locator('input[name="givenName-en"]').fill(`Changed${given}`);
        out.nameBoxes = await clearEnglishName(d, inst);
        await snap(`${key}-1-changed`);
        const s = await save(d);
        const refused = await snap(`${key}-2-save`);
        out.save = {...s, notices: refused.notices, form: await formInfo(), contributorsStored: count(pub)};
        if (s.windowStaysOpen) out.closed = await closeForm(d);
        await open();
        await snap(`${key}-3-reload`);
        out.afterReload = {listOnThePage: await rowTexts(), stored: stored(pub).map((a) => `${a.given} [${a.affiliations.map((f) => f.is).join(' | ')}]`)};
        fact(key, out);
    };

    // ------------------------------------------------------------------ l43
    const publicRead = async (key, ctx, sub) => {
        const r = await reader.goto(cu(ctx, `/${PUBLIC[app.name]}/${sub.id}`));
        await idle(reader).catch(() => {});
        const block = reader.locator('.item.authors').first();
        const out = {
            status: r ? r.status() : null,
            authorsBlock: flat(await block.innerText().catch(() => null), 500),
            affiliations: await reader.locator('.item.authors .affiliation').evaluateAll((els) =>
                els.map((e) => ({
                    text: e.innerText.replace(/\s+/g, ' ').trim(),
                    // The parts in page order: a name, or a registry link.
                    parts: [...e.querySelectorAll('span, a[href^="https://ror.org/"]')].map((x) => (x.tagName === 'A' ? `link ${x.getAttribute('href')}` : x.innerText.replace(/\s+/g, ' ').trim())).filter(Boolean),
                }))
            ),
            biographies: flat(await reader.locator('.item.author_bios').first().innerText().catch(() => null), 300),
        };
        await snap(key, reader);
        return out;
    };
    const secondAffiliation = async (key, sub, variant, {pairFirst = false} = {}) => {
        const out = {variant, secondContributorAddedFirst: pairFirst};
        const addSecondContributor = async () => {
            await open();
            const add = await openAdd();
            await fillPerson(add, {given: 'Noa', family: 'Second', email: `noa${String(Date.now()).slice(-6)}@mail.test`});
            return (await save(add)).status;
        };
        const open = workflow(A.path, sub);
        const first = `First Univ ${variant} ${String(Date.now()).slice(-5)}`;
        const second = variant === 'registry' ? ORG.name : `Second Univ ${variant} ${String(Date.now()).slice(-5)}`;
        const formRead = async (snapName) => {
            const e = await openEdit('Alma');
            const rows = await affRows(e);
            if (snapName) await snap(snapName);
            const closed = await closeForm(e);
            return {rows: rows.map((r) => r.text), askedOnClose: closed.browserDialogs.length || closed.windowsOpen.length > 1 ? closed : null};
        };
        const reads = async (label, snapName) => {
            const t0 = Date.now();
            await open();
            const authorId = stored(sub.pub).find((a) => a.given === 'Alma').id;
            const form = await formRead(snapName ? `${key}-${snapName}-form` : null);
            return {
                formAfterReload: form.rows,
                contributorFetchesOfThePage: since(contributorFetches, t0),
                askedOnClose: form.askedOnClose,
                publicationAsThePageFetchedIt: (lastPublication[String(sub.pub)] || []).map((a) => `${a.name} [${a.affiliations.join(' | ')}]`),
                publishedPage: await publicRead(snapName ? `${key}-${snapName}-public` : `${key}-${label}-public`, A.path, sub),
                stored: stored(sub.pub).map((a) => `${a.given} [${a.affiliations.map((f) => `${f.id}@${f.place} ${f.is}`).join(' | ')}]`),
                query: queryOrder(sub.pub, authorId),
            };
        };

        await open();
        const list = await snap(`${key}-0-list`);
        out.pageOnOpen = {list: await rowTexts(), bannerText: flat((list.text && (list.text.dialog || list.text.main)) || '', 2000).match(/Warning:[^.]*\.[^.]*\./)?.[0] ?? null};
        if (pairFirst) {
            out.secondContributorSave = await addSecondContributor();
            await open();
        }
        // The row's state: one affiliation, saved on its own.
        let d = await openEdit('Alma');
        await d.locator('select[name="country"]').selectOption({label: 'Canada'});
        await addTyped(d, first);
        out.firstSave = await save(d);
        out.oneAffiliation = await reads('one', '1-one');

        // The second one, added in "Edit".
        await open();
        d = await openEdit('Alma');
        out.added = variant === 'registry' ? await addRegistry(d, ORG) : (await addTyped(d, second), {typed: second});
        out.formBeforeSave = (await affRows(d)).map((r) => r.text);
        await snap(`${key}-2-second-added`);
        out.secondSave = await save(d);
        // The same page right after the save.
        const same = await openEdit('Alma');
        out.formOnTheSamePageAfterSave = (await affRows(same)).map((r) => r.text);
        await closeForm(same);
        out.two = await reads('two', '3-two');

        // "Edit" › "Save" with nothing changed, three times.
        out.resaves = [];
        for (let i = 1; i <= 3; i++) {
            await open();
            d = await openEdit('Alma');
            const s = await save(d);
            if (s.windowStaysOpen) await closeForm(d);
            out.resaves.push({save: {status: s.status, sentAffiliations: s.sent.map((w) => w.sent && w.sent.affiliations && w.sent.affiliations.map((f) => f.name || f.ror))}, ...(await reads(`resave${i}`, i === 3 ? '4-resaved' : null))});
        }

        // A second contributor added to the item; the first one's affiliations read again.
        if (!pairFirst) {
            out.secondContributorSave = await addSecondContributor();
            out.withASecondContributor = await reads('two-contributors', '5-two-contributors');
        }
        fact(key, out);
    };

    try {
        await signIn(page, A.mg, {contextPath: A.path});
        await idle(page).catch(() => {});

        if (PHASES.includes('l12')) {
            await part('l12-mg-add', async () => {
                await workflow(A.path, A.s)();
                const d = await openAdd();
                await loc(page, 'contributor form: the CRediT field', creditField(d));
                const out = await creditRead(d, 'l12-mg-add');
                fact('l12 manager, "Add Contributor"', out);
                out.closedWithTheRowsAdded = await closeForm(d);
                const s = await snap('l12-mg-add-closed');
                out.noticesAfterClose = s.notices;
                fact('l12 manager, "Add Contributor"', out);
            });
            await part('l12-mg-edit', async () => {
                await workflow(A.path, A.s)();
                const d = await openEdit('Alma');
                const out = await creditRead(d, 'l12-mg-edit');
                fact('l12 manager, "Edit"', out);
                // Left from the keyboard this time: Escape with the rows added.
                out.leftByEscapeWithTheRowsAdded = await closeForm(d, {by: 'Escape'});
                const s = await snap('l12-mg-edit-escaped');
                out.noticesAfterEscape = s.notices;
                await workflow(A.path, A.s)();
                out.storedCreditRowsAfterClose = Number(sql(app, `select count(*) from credit_contributor_roles c join authors a on a.author_id = c.contributor_id where c.credit_role_id is not null and a.publication_id = ${A.s.pub}`));
                fact('l12 manager, "Edit"', out);
            });
        }

        let left = null;
        if (PHASES.includes('l42')) {
            await part('l42-mg', async () => {
                left = await refusedAdd('l42-mg', {open: workflow(A.path, A.s), pub: A.s.pub, retry: true});
            });
            await part('l42-edit', async () => {
                if (!left || !left.rowsLeft) throw new Error('no contributor left by l42-mg to edit');
                await refusedEdit('l42-edit', {open: workflow(A.path, A.s), pub: A.s.pub, given: left.given, inst: left.inst, nth: left.rowsLeft - 1});
            });
        }

        if (PHASES.includes('l43')) {
            let put = false;
            if (REGISTRY) {
                const had = Number(sql(app, `select count(*) from rors where ror = '${ORG.ror}'`));
                if (!had) {
                    sql(
                        app,
                        `with r as (insert into rors (ror, display_locale, is_active, search_phrase) values ('${ORG.ror}', 'en', 1, '${ORG.ror} ${ORG.name} ${ORG.other.name}') returning ror_id) insert into ror_settings (ror_id, locale, setting_name, setting_value) select ror_id, 'en', 'name', '${ORG.name}' from r union all select ror_id, '${ORG.other.locale}', 'name', '${ORG.other.name}' from r`
                    );
                    put = true;
                }
                fact('l43 registry copy', {heldTheInstitutionBefore: !!had, putByThisRun: put, rowsInTheCopy: Number(sql(app, 'select count(*) from rors'))});
            }
            try {
                await part('l43-registry', () => secondAffiliation('l43-registry', A.p1, 'registry'));
                await part('l43-typed', () => secondAffiliation('l43-typed', A.p2, 'typed'));
                await part('l43-pair', () => secondAffiliation('l43-pair', A.p3, 'registry', {pairFirst: true}));
            } finally {
                if (put) {
                    sql(app, `delete from rors where ror = '${ORG.ror}'`);
                    fact('l43 registry copy at the end', {takenOut: true, rowsInTheCopy: Number(sql(app, 'select count(*) from rors'))});
                }
            }
        }
        await signOut(page).catch(() => {});

        if (PHASES.includes('l42')) {
            await signIn(page, E.mg, {contextPath: E.path});
            await idle(page).catch(() => {});
            await part('l42-en', () => refusedAdd('l42-en', {open: workflow(E.path, E.s), pub: E.s.pub, retry: true}));
            await signOut(page).catch(() => {});
        }

        await signIn(page, A.au, {contextPath: A.path});
        await idle(page).catch(() => {});
        if (PHASES.includes('l12')) {
            await part('l12-au-wizard', async () => {
                await wizard(A.path, A.d)();
                await snap('l12-au-wizard-step');
                const d = await openAdd();
                const out = await creditRead(d, 'l12-au-wizard');
                fact('l12 author, the wizard\'s "Add Contributor"', out);
                out.closedWithTheRowsAdded = await closeForm(d);
                fact('l12 author, the wizard\'s "Add Contributor"', out);
            });
        }
        if (PHASES.includes('l42')) {
            await part('l42-wizard', () => refusedAdd('l42-wizard', {open: wizard(A.path, A.d), pub: A.d.pub, retry: false}));
        }
        await signOut(page).catch(() => {});
    } finally {
        fact('dialogs of the run', dialogs.map(({at, ...d}) => d));
        fact('page errors of the run', pageErrors.map(({at, ...e}) => e));
        fact('endedAt', new Date().toISOString());
        await R.close().catch(() => {});
        await close();
    }
    if (RUN === 'r1') {
        note(
            `ccI07b: the contributor form's CRediT table is #contributor-creditRoles (rows tbody tr, two selects per row, "Add Another Role"); the Affiliations table is #contributor-affiliations (rows tbody tr, a registry-backed row carries a[href^="https://ror.org/"], an edited typed row input[name="name"] per language); a registry suggestion is li.autosuggest__results-item holding a[href="<the ROR address>"]; the published page's affiliations are .item.authors .affiliation on the three apps; a script's own response listener reads the contributor writes' bodies (the kit keeps none).`
        );
    }
});
