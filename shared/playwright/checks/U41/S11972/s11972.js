// U41 claim check S11972 (upstream sync of pkp/pkp-lib#11972 "Make author email optional for organizations and
// anonymous contributors"; pkp-lib d03b7729f6 + 73bb87216e, ui-library 72ec3278). Spec:
// docs/specs/U41-contributors-and-affiliations.md: the Fields preamble and rows Contributor Type, Email, Country,
// ORCID iD; Rule 4a ("Fields left out", "The contributor type left out", "The contributor type sent empty");
// scenario 1's empty save, bad Email, person, type switch and Anonymous bullets; scenario 12; A18; A31.
// Records; asserts nothing: the reader judges. OJS carries the change; OMP and OPS are the controls until their
// lib/pkp and ui-library pointers move past the merges.
//
// Run (scenario fleet, all three apps in one process; PROBE_RUN r1 and r2, two processes may run at once; every
// part seeds its own scratch context, tag prefix u41s, so a later build re-runs it as is; publicknowledge and the
// roster are never touched):
//   PROBE_FEATURE=sync PROBE_AGENT=ccS41 PROBE_NOTES_FEATURE=U41 PROBE_RUN=r1 \
//       node bin/probe.js all shared/playwright/checks/U41/S11972/s11972.js
//   PART=form,orcid,api narrows (default: all three).
// No other script or file is read. The kept walks of the PR review this sync folds are
// shared/playwright/checks/sync/pkp-lib-13624/walk.js and same-type.js (run them beside this one, PROBE_RUN t1, t2).
// Outputs: .reports/<feature>/<agent>/<part>-<step>-<run>-<app>.{json,png} (screen snapshots),
// facts-<part>-<run>-<app>.json (one key per step), run-<run>-<app>-*.json (the kit's run record).
//
//   form   a manager on a submitted item, ORCID off: the "*" marker and `required` attribute of Email and Country per
//          contributor type; the empty Person, Organization and Anonymous saves; an Organization without an email,
//          without a country, with a bad email; S1's empty save, bad Email and Homepage URL, person, type switch and
//          Anonymous bullets; the type switch on screen (typed values kept) and A4 (a typed ROR ID through it); A16
//          (the submitter's own row saved as is); A18 (Anonymous saved with a role only); the panel left with an
//          unsaved type change; every save read right after and after a reload.
//   orcid  the same form with ORCID on: the ORCID iD field per type, on "Add Contributor" and on a person's "Edit".
//   api    S12 walked (the edits through the contributor API in the manager's session); Rule 4a's three bullets;
//          A31 for a person, an organization and an anonymous contributor (an edit without the type), each read in
//          the answer, a GET, the stored rows and the "Contributors" page and "Edit" after a reload; a person's and
//          an organization's email sent empty with the type named.
const {forEachApp, launch, signIn, screen, shot, record, idle, tag, sql, apiAs, serverLog, note} = require('../../../probe');

const ALL = ['form', 'orcid', 'api'];
const PARTS = (process.env.PART || ALL.join(',')).split(',');
const RUN = process.env.PROBE_RUN || 'r0';
const T = 30_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (s, n = 800) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));
const FORM_DIALOG = /^(Add Contributor|Edit)$/;
const ROBIN = {givenName: 'Robin', familyName: 'Okafor', email: 'robin@example.test', country: 'CA'};

forEachApp(async (app) => {
    const A = app.name;
    const log = (...a) => console.log(`[s11972 ${RUN} ${A}]`, ...a);
    const facts = {};
    let part = '';
    const fact = (k, v) => {
        facts[part] = facts[part] || {};
        facts[part][k] = v;
        log(`${part}.${k}: ${flat(JSON.stringify(v), 1500)}`);
        record(`facts-${part}`, facts[part]);
    };
    const cu = (ctx, p = '') => `/index.php/${ctx}/en${p}`;

    // ------------------------------------------------------------------ seeding
    const mkContext = async (suffix, extra = {}) => {
        const t = tag(`u41s${suffix}`);
        const users = [
            {username: `${t}mg`, roles: ['manager'], givenName: 'Mona', familyName: 'Manager', email: `${t}mg@mail.test`},
            {username: `${t}au`, roles: ['author'], givenName: 'Ada', familyName: 'Author', email: `${t}au@mail.test`},
        ];
        const ctx = await app.api.createContext({tag: t, users, context: {name: `U41 S11972 ${suffix} ${t}`, contactName: 'Paula Principal', contactEmail: `principal${t}@mail.test`}, ...extra});
        return {t, path: ctx.path || t, mg: `${t}mg`, au: `${t}au`};
    };
    const mkSub = async (C, key, extra = {}) => {
        const s = await app.api.createSubmission({tag: `${C.t}${key}`, context: C.path, submitter: C.au, title: `S11972 ${key} ${C.t}`, ...extra});
        return {id: s.submissionId, pub: s.publicationId, contributors: s.contributors || []};
    };

    // ------------------------------------------------------------------ browser and traffic
    const {page, close} = await launch(app);
    const dialogs = [];
    page.on('dialog', async (d) => {
        dialogs.push({at: Date.now(), type: d.type(), message: flat(d.message(), 300)});
        await (d.type() === 'beforeunload' ? d.accept() : d.dismiss()).catch(() => {});
    });
    // The registry lookup answers nothing, so a typed institution is offered as itself only.
    await page.route('https://api.ror.org/**', (route) => route.fulfill({status: 200, contentType: 'application/json', headers: {'Access-Control-Allow-Origin': '*'}, body: JSON.stringify({items: []})}));
    const writes = [];
    page.on('response', async (r) => {
        const u = r.url();
        const m = r.request().method();
        if (!/\/api\/v1\//.test(u) || /_test\//.test(u) || m === 'GET') return;
        const e = {at: Date.now(), op: r.request().headers()['x-http-method-override'] || m, url: u.split('?')[0].replace(/^.*\/api\/v1\//, ''), status: r.status()};
        if (r.status() >= 400) e.answer = flat(await r.text().catch(() => ''), 600);
        if (/\/contributors/.test(u)) {
            const sent = new URLSearchParams(r.request().postData() || '');
            e.sentKeys = [...new Set([...sent.keys()].map((k) => k.replace(/\[.*$/, '')))];
            e.sentType = sent.get('contributorType');
            e.sentEmail = sent.get('email');
        }
        writes.push(e);
    });
    const since = (list, t0) => list.filter((x) => x.at >= t0).map(({at, ...x}) => x);

    let stepNo = 0;
    const snap = async (name) => {
        const n = `${part}-${String(++stepNo).padStart(2, '0')}-${name}`;
        let s;
        try {
            s = await screen(page);
        } catch (e) {
            s = {url: page.url(), error: flat(e.message, 300)};
        }
        record(n, s);
        await shot(page, n).catch(() => {});
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
            await sleep(700);
        }
        const w = since(writes, t0);
        const dl = since(dialogs, t0);
        if (w.length || dl.length) fact(`${key} traffic`, {writes: w, browserDialogs: dl});
    };

    // ------------------------------------------------------------------ readers of the screen
    const panel = () => page.locator('.listPanel--contributor, .contributorsListPanel, [data-cy="contributor-manager"]').first();
    const formDialog = () => page.getByRole('dialog', {name: FORM_DIALOG});
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
                })),
                empty: el.innerText.includes('No items found.'),
            };
        }).catch((e) => ({error: flat(e.message, 200)}));
    };
    /** The open contributor form: each field's label, required mark, controls (with the `required` attribute) and errors. */
    const readForm = async (dialog = formDialog()) =>
        dialog.evaluate((d) => {
            const vis = (n) => !!(n.offsetWidth || n.offsetHeight || n.getClientRects().length);
            const fields = [...d.querySelectorAll('.pkpFormField')].filter((f) => vis(f) && !f.parentElement.closest('.pkpFormField'));
            return {
                fields: fields.map((f) => {
                    const label = f.querySelector('legend, label, .pkpFormFieldLabel');
                    return {
                        label: label ? label.innerText.replace(/\s+/g, ' ').trim() : null,
                        star: f.querySelectorAll('.pkpFormFieldLabel__required').length,
                        controls: [...f.querySelectorAll('input, select, textarea')].filter(vis).slice(0, 4).map((c) => ({tag: c.tagName.toLowerCase(), type: c.type, name: c.name, required: c.hasAttribute('required'), ariaRequired: c.getAttribute('aria-required'), value: c.type === 'checkbox' || c.type === 'radio' ? undefined : (c.tagName === 'SELECT' ? (c.options[c.selectedIndex] || {}).text : c.value), checked: c.type === 'checkbox' || c.type === 'radio' ? c.checked : undefined, label: c.labels && c.labels[0] ? c.labels[0].innerText.replace(/\s+/g, ' ').trim() : undefined})),
                        errors: [...f.querySelectorAll('.pkpFieldError')].filter(vis).map((x) => x.innerText.replace(/\s+/g, ' ').trim()),
                    };
                }),
                foot: [...d.querySelectorAll('.pkpFormPage__footer, .pkpFormFooter, .pkpForm__footer, [class*="ormFooter"], [class*="formFooter"]')].map((x) => x.innerText.replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 2),
                errorList: [...d.querySelectorAll('button, a, li')].map((b) => (b.getAttribute('aria-label') || b.textContent || '').replace(/\s+/g, ' ').trim()).filter((s) => /^Go to |^Jump to next error$/.test(s)),
                save: (() => {
                    const b = [...d.querySelectorAll('button')].find((x) => x.innerText.trim() === 'Save');
                    return b ? {disabled: b.disabled} : null;
                })(),
            };
        }).catch((e) => ({error: flat(e.message, 200)}));
    /** Only the fields a claim reads: their label, star, required attribute, value and errors. */
    const pick = (form, re = /Contributor Type|Given Name|Family Name|Organization Name|Email|Country|ORCID|Contributor Roles|ROR ID|Homepage/) =>
        (form.fields || []).filter((f) => re.test(f.label || '')).map((f) => ({label: f.label, star: f.star, required: (f.controls[0] || {}).required, value: f.controls.filter((c) => c.type !== 'radio' && c.type !== 'checkbox').map((c) => c.value)[0], checked: f.controls.filter((c) => c.checked).map((c) => c.label), errors: f.errors.length ? f.errors : undefined}));
    const formSummary = (form) => ({fields: pick(form), foot: form.foot, errorList: form.errorList, save: form.save, labels: (form.fields || []).map((f) => f.label)});
    const openWorkflow = async (ctx, sub) => {
        await page.goto(cu(ctx, `/dashboard/editorial?workflowSubmissionId=${sub.id}&workflowMenuKey=publication_${sub.pub}_contributors`));
        await idle(page);
        await panel().waitFor({timeout: T}).catch(() => {});
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
    const openEditAt = async (r) => {
        await r.getByRole('button', {name: 'Edit', exact: true}).click();
        const d = page.getByRole('dialog', {name: 'Edit', exact: true});
        await d.locator('input[name="email"]').waitFor({timeout: T}).catch(() => {});
        await idle(page);
        await sleep(500);
        return d;
    };
    const openEdit = async (text) => openEditAt(row(text).first());
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
    const type = async (d, label) => {
        await d.getByRole('radio', {name: label, exact: true}).check();
        await sleep(500);
    };
    const fill = async (d, name, v) => d.locator(`[name="${name}"]`).first().fill(v);
    const country = async (d, label = 'Canada') => d.locator('select[name="country"]').selectOption({label});
    const tick = async (d, role, on = true) => {
        const c = d.getByRole('checkbox', {name: role, exact: true});
        if (on) await c.check();
        else await c.uncheck();
    };
    const affField = (d) => d.locator('#contributor-affiliations');
    const addTyped = async (d, text) => {
        const s = affField(d).locator('input.pkpAutosuggest__input');
        await s.click();
        await s.pressSequentially(text, {delay: 20});
        await sleep(900);
        await idle(page);
        await affField(d).locator('li.autosuggest__results-item').filter({hasText: text}).first().click();
        await sleep(300);
        await affField(d).getByRole('button', {name: 'Add', exact: true}).click();
        await sleep(500);
    };
    const readAff = async (d) => affField(d).locator('tbody tr').allInnerTexts().then((r) => r.map((x) => flat(x, 160))).catch(() => null);
    /** What "Edit" shows of one contributor: the type, the name boxes, Email, Country and the institutions. */
    const readEdit = async (d) => ({
        type: await d.locator('input[name="contributorType"]:checked').getAttribute('value').catch(() => null),
        givenName: await d.locator('input[name="givenName-en"]').inputValue().catch(() => '(absent)'),
        familyName: await d.locator('input[name="familyName-en"]').inputValue().catch(() => '(absent)'),
        organizationName: await d.locator('input[name="organizationName-en"]').inputValue({timeout: 2000}).catch(() => '(absent)'),
        email: await d.locator('input[name="email"]').inputValue().catch(() => '(absent)'),
        country: await d.locator('select[name="country"]').evaluate((s) => (s.options[s.selectedIndex] || {}).text || '').catch(() => '(absent)'),
        url: await d.locator('input[name="url"]').inputValue({timeout: 2000}).catch(() => '(absent)'),
        affiliations: await readAff(d),
    });
    const stored = (pub) => sql(app, `select a.author_id, a.seq, a.contributor_type, coalesce(a.email, '(null)'),
        coalesce((select string_agg(s.setting_name || '=' || left(coalesce(s.setting_value, ''), 40), '; ' order by s.setting_name) from author_settings s where s.author_id = a.author_id and coalesce(s.setting_value, '') <> ''), ''),
        (select count(*) from author_affiliations f where f.author_id = a.author_id)
        from authors a where a.publication_id = ${pub} order by a.seq, a.author_id`).split('\n');

    // ------------------------------------------------------------------ parts
    const parts = {};

    // ---------------------------------------------------------------- form
    parts.form = async () => {
        const C = await mkContext('f');
        const S = await mkSub(C, 's', {contributors: [ROBIN]});
        fact('seed', {C, S});
        await signIn(page, C.mg, {contextPath: C.path});
        await step('list', async () => {
            await openWorkflow(C.path, S);
            await snap('list');
            fact('list', await readList());
        });
        await step('markers', async () => {
            const d = await openAdd();
            await snap('add-open');
            const open = await readForm(d);
            const out = {typeField: open.fields.filter((f) => /Contributor Type/.test(f.label || '')).map((f) => ({label: f.label, controls: f.controls.map((c) => ({label: c.label, checked: c.checked}))}))};
            for (const t of ['Person', 'Organization or group', 'Anonymous']) {
                await type(d, t);
                await snap(`markers-${t.split(' ')[0].toLowerCase()}`);
                out[t] = formSummary(await readForm(d));
            }
            fact('markers', out);
            // Person: the empty save (S1 "An empty save").
            await type(d, 'Person');
            await press(d, 'Save');
            await snap('person-empty-save');
            fact('person-empty-save', formSummary(await readForm(d)));
            await fill(d, 'givenName-en', 'Alan');
            await sleep(400);
            fact('person-given-typed', formSummary(await readForm(d)));
            // S1 "A bad Email and Homepage URL".
            await fill(d, 'email', 'not-an-address');
            await fill(d, 'url', 'not a web address');
            await country(d);
            await tick(d, 'Author');
            await sleep(300);
            fact('person-filled-before-save', (await readForm(d)).save);
            await press(d, 'Save');
            await sleep(800);
            await snap('person-bad-email-url');
            fact('person-bad-email-url', formSummary(await readForm(d)));
            // S1 "The person".
            await fill(d, 'email', 'alan@example.test');
            await fill(d, 'url', '');
            await sleep(300);
            fact('person-saved', await save(d));
            await snap('person-saved');
            fact('list-after-person', await readList());
        });
        await step('person-no-email', async () => {
            // The other end for Email: a Person with everything but the email.
            const d = await openAdd();
            await fill(d, 'givenName-en', 'Noemail');
            await fill(d, 'familyName-en', 'Person');
            await country(d);
            await tick(d, 'Author');
            const res = await save(d);
            await snap('person-no-email');
            fact('person-no-email', {res, form: res === 'open' ? formSummary(await readForm(d)) : null});
            if (res === 'open') await closeForm(d);
        });
        await step('org-empty', async () => {
            const d = await openAdd();
            await type(d, 'Organization or group');
            await press(d, 'Save');
            await snap('org-empty-save');
            fact('org-empty-save', formSummary(await readForm(d)));
            await closeForm(d);
        });
        await step('org-no-email', async () => {
            const d = await openAdd();
            await type(d, 'Organization or group');
            await fill(d, 'organizationName-en', 'Mailless Org');
            await country(d);
            await tick(d, 'Author');
            const res = await save(d);
            await snap('org-no-email');
            fact('org-no-email', {res, form: res === 'open' ? formSummary(await readForm(d)) : null, list: await readList()});
            if (res === 'open') await closeForm(d);
        });
        await step('org-no-country', async () => {
            const d = await openAdd();
            await type(d, 'Organization or group');
            await fill(d, 'organizationName-en', 'Countryless Org');
            await fill(d, 'email', 'countryless@example.test');
            await tick(d, 'Author');
            const res = await save(d);
            await snap('org-no-country');
            fact('org-no-country', {res, form: res === 'open' ? formSummary(await readForm(d)) : null});
            if (res === 'open') await closeForm(d);
        });
        await step('org-bad-email', async () => {
            const d = await openAdd();
            await type(d, 'Organization or group');
            await fill(d, 'organizationName-en', 'Badmail Org');
            await fill(d, 'email', 'not-an-address');
            await country(d);
            await tick(d, 'Author');
            const res = await save(d);
            await snap('org-bad-email');
            fact('org-bad-email', {res, form: res === 'open' ? formSummary(await readForm(d)) : null});
            if (res === 'open') await closeForm(d);
        });
        await step('type-switch', async () => {
            // S1 "The type switch", and the row's "Switching types leaves what you typed on screen".
            const d = await openAdd();
            await fill(d, 'givenName-en', 'Casey');
            await fill(d, 'email', 'casey@example.test');
            await type(d, 'Organization or group');
            await snap('switch-to-org');
            const asOrg = formSummary(await readForm(d));
            await type(d, 'Person');
            const backToPerson = formSummary(await readForm(d));
            await type(d, 'Organization or group');
            await fill(d, 'organizationName-en', 'Probe Org');
            await fill(d, 'email', 'org@example.test');
            await country(d);
            await tick(d, 'Author');
            const res = await save(d);
            fact('type-switch', {asOrg, backToPerson, res, list: await readList()});
            const e = await openEdit('Probe Org');
            await type(e, 'Person');
            await snap('org-edit-as-person');
            const editAsPerson = formSummary(await readForm(e));
            await type(e, 'Organization or group');
            const editBack = formSummary(await readForm(e));
            fact('org-edit-switch', {editAsPerson, editBack, resaved: await save(e)});
        });
        await step('a4', async () => {
            const d = await openAdd();
            await type(d, 'Organization or group');
            await fill(d, 'organizationName-en', 'Shape Org');
            await fill(d, 'rorId', 'u41s-not-a-ror-id');
            await type(d, 'Person');
            await fill(d, 'givenName-en', 'Shape');
            await fill(d, 'familyName-en', 'Person');
            await fill(d, 'email', 'shape@example.test');
            await country(d);
            await tick(d, 'Author');
            const res = await save(d);
            const e = await openEdit('Shape Person');
            await type(e, 'Organization or group');
            await snap('a4-edit-switched-to-org');
            fact('a4', {res, stored: sql(app, `select a.contributor_type, s.setting_name, s.setting_value from authors a join author_settings s on s.author_id = a.author_id where a.publication_id = ${S.pub} and a.email = 'shape@example.test' and s.setting_name in ('givenName','organizationName','rorId') order by 2`).split('\n'), switchedBack: pick(await readForm(e), /ROR ID|Organization Name/)});
            await closeForm(e);
        });
        await step('anonymous', async () => {
            // A18: Anonymous saved with a contributor role only.
            const d = await openAdd();
            await type(d, 'Anonymous');
            await press(d, 'Save');
            await snap('anon-empty-save');
            fact('anon-empty-save', formSummary(await readForm(d)));
            await tick(d, 'Author');
            await sleep(300);
            const res = await save(d);
            await snap('anon-bare-saved');
            fact('anon-bare-saved', {res, form: res === 'open' ? formSummary(await readForm(d)) : null, list: await readList()});
            if (res === 'open') await closeForm(d);
            // S1 "An Anonymous contributor": with an email and a country.
            const d2 = await openAdd();
            await type(d2, 'Anonymous');
            await fill(d2, 'email', 'anon@example.test');
            await country(d2);
            await tick(d2, 'Author');
            fact('anon-full-saved', await save(d2));
            await panel().getByRole('button', {name: 'Preview', exact: true}).click();
            const p = page.getByRole('dialog', {name: 'List of Contributors'});
            await p.waitFor({timeout: T}).catch(() => {});
            await idle(page);
            await snap('preview');
            fact('preview', await p.locator('tr').evaluateAll((trs) => trs.map((tr) => [...tr.querySelectorAll('th, td')].map((c) => c.innerText.replace(/\s+/g, ' ').trim()))));
            await closeForm(p);
        });
        await step('a16', async () => {
            const d = await openEdit('Ada Author');
            const res = await save(d);
            await snap('a16-save');
            fact('a16', {res, form: res === 'open' ? formSummary(await readForm(d)) : null});
            if (res === 'open') await closeForm(d);
        });
        await step('leave-unsaved', async () => {
            // The panel left with a changed, unsaved type: what asks, what stays.
            const d = await openEdit('Robin Okafor');
            await type(d, 'Organization or group');
            await fill(d, 'organizationName-en', 'Unsaved Org');
            const t0 = Date.now();
            await d.getByRole('button', {name: 'Close', exact: true}).first().click();
            await sleep(2500);
            const after = await snap('after-close-unsaved');
            const before = await readList();
            const formsOpen = await formDialog().count();
            await reloadList();
            const e = await openEdit('Robin Okafor');
            fact('leave-unsaved', {notices: after.notices, browserDialogs: since(dialogs, t0), formsOpenAfterClose: formsOpen, listBefore: before, reopenedAfterReload: await readEdit(e)});
            await closeForm(e);
        });
        await step('after-reload', async () => {
            await reloadList();
            await snap('list-after-reload');
            fact('after-reload', {list: await readList(), stored: stored(S.pub)});
        });
    };

    // ---------------------------------------------------------------- orcid
    parts.orcid = async () => {
        const C = await mkContext('o', {orcid: {}});
        const S = await mkSub(C, 's', {contributors: [ROBIN]});
        fact('seed', {C, S});
        await signIn(page, C.mg, {contextPath: C.path});
        await openWorkflow(C.path, S);
        await step('orcid-on', async () => {
            const d = await openAdd();
            const out = {};
            for (const t of ['Person', 'Organization or group', 'Anonymous']) {
                await type(d, t);
                await snap(`add-${t.split(' ')[0].toLowerCase()}`);
                out[t] = {labels: formSummary(await readForm(d)).labels, orcidText: await d.getByText('ORCID iD', {exact: false}).count()};
            }
            await closeForm(d);
            const e = await openEdit('Robin Okafor');
            await snap('edit-person');
            out.editPerson = formSummary(await readForm(e)).labels;
            await type(e, 'Organization or group');
            out.editAsOrg = formSummary(await readForm(e)).labels;
            await closeForm(e);
            fact('orcid-on', out);
        });
        await step('orcid-off', async () => {
            const cid = sql(app, `select ${app.contextTables.id} from ${app.contextTables.table} where path = '${C.path}'`).trim();
            sql(app, `update ${app.contextTables.settings} set setting_value = '0' where ${app.contextTables.id} = ${cid} and setting_name = 'orcidEnabled'`);
            await reloadList();
            const e = await openEdit('Robin Okafor');
            await snap('edit-person-orcid-off');
            fact('orcid-off', {enabled: sql(app, `select setting_value from ${app.contextTables.settings} where ${app.contextTables.id} = ${cid} and setting_name = 'orcidEnabled'`), editPerson: formSummary(await readForm(e)).labels});
            await closeForm(e);
        });
    };

    // ---------------------------------------------------------------- api
    parts.api = async () => {
        const C = await mkContext('a');
        const S = await mkSub(C, 's', {contributors: [ROBIN]});
        fact('seed', {C, S});
        await signIn(page, C.mg, {contextPath: C.path});
        await openWorkflow(C.path, S);
        const base = `submissions/${S.id}/publications/${S.pub}/contributors`;
        const slog = serverLog(app);
        const call = async (method, path, body) => {
            const from = slog.mark();
            const res = await apiAs(page, method, path, body);
            const text = await res.text().catch(() => '');
            let json = null;
            try {
                json = JSON.parse(text);
            } catch (e) {
                // not JSON
            }
            await sleep(300);
            return {status: res.status(), json, kind: res.status() >= 500 ? flat(text, 160) : undefined, serverLog: slog.since(from).map((l) => flat(l.replace(/^\[[^\]]*\]\s*/, ''), 220)).slice(0, 6)};
        };
        const summary = (j) => (j && j.id ? {type: j.contributorType, givenName: j.givenName, familyName: j.familyName, organizationName: j.organizationName, preferredPublicName: j.preferredPublicName, email: j.email, country: j.country, url: j.url, biography: j.biography, affiliations: (j.affiliations || []).map((a) => a.name)} : j);
        const get = async (id) => summary((await call('GET', `${base}/${id}`)).json);
        const roles = ((await call('GET', base)).json.items || [])[0].contributorRoles.map((r) => r.id);
        /** One edit, read in the answer, a GET, the stored rows, and the list and "Edit" after a reload. */
        const edit = async (key, id, body, rowFinder) => {
            const answer = await call('PUT', `${base}/${id}`, body);
            const out = {sent: body, status: answer.status, answer: answer.status === 200 ? summary(answer.json) : answer.json || answer.kind, serverLog: answer.serverLog.length ? answer.serverLog : undefined, get: await get(id), stored: stored(S.pub).filter((l) => l.startsWith(`${id}|`))};
            await reloadList();
            const shown = await snap(`${key}-list`);
            const listed = await readList();
            // An edit can leave the workflow unable to open (an error window instead of the list): record what shows.
            out.list = listed.rows ? listed.rows.map((r) => r.text) : {error: listed.error, window: flat(shown.text && shown.text.dialog, 300), notices: shown.notices};
            const r = listed.rows ? await rowFinder() : null;
            if (r && await r.count()) {
                const d = await openEditAt(r.first());
                await snap(`${key}-edit`);
                out.edit = await readEdit(d);
                await closeForm(d);
            } else out.edit = r ? '(row not found)' : '(no list)';
            if (!listed.rows) {
                const ok = page.getByRole('dialog').filter({hasText: /^Error/}).getByRole('button', {name: 'OK', exact: true});
                if (await ok.count()) await ok.first().click().catch(() => {});
                await sleep(500);
            }
            fact(key, out);
            return out;
        };
        const robinId = S.contributors.length ? S.contributors[S.contributors.length - 1].id : null;
        const ids = (await call('GET', base)).json.items.map((c) => ({id: c.id, seq: c.seq, email: c.email}));
        const robin = robinId || ids.find((c) => c.email === ROBIN.email).id;
        // S12's given: "Probe Institute" typed through Robin's "Edit".
        await step('s12-given', async () => {
            const d = await openEdit('Robin Okafor');
            await addTyped(d, 'Probe Institute');
            fact('s12-given', {saved: await save(d), get: await get(robin)});
        });
        /** A row by its place in the list (the API's order by seq), since an edit can empty the name it shows. */
        const rowOf = (id) => async () => {
            const items = (await call('GET', base)).json.items.slice().sort((a, b) => a.seq - b.seq || a.id - b.id);
            return panel().locator('.listPanel__item').nth(Math.max(0, items.findIndex((c) => c.id === id)));
        };
        const robinRow = rowOf(robin);
        await step('s12-resend', async () => {
            const read = (await call('GET', `${base}/${robin}`)).json;
            await edit('s12-resend', robin, {contributorType: 'PERSON', givenName: {en: 'Dana'}, affiliations: read.affiliations}, robinRow);
        });
        await step('s12-given-alone', async () => edit('s12-given-alone', robin, {contributorType: 'PERSON', givenName: {en: 'Kim'}}, robinRow));
        await step('s12-type-empty', async () => edit('s12-type-empty', robin, {contributorType: null, email: 'kim@example.test'}, robinRow));
        await step('s12-control', async () => edit('s12-control', robin, {contributorType: 'PERSON', email: 'kim@example.test'}, robinRow));

        // A31 and Rule 4a "The contributor type left out", per type, each from a contributor with every field filled.
        const fillPerson = async (id, label) => call('PUT', `${base}/${id}`, {contributorType: 'PERSON', givenName: {en: `${label}Given`}, familyName: {en: `${label}Family`}, preferredPublicName: {en: `${label} Public`}, email: `${label.toLowerCase()}@example.test`, country: 'CA', url: `https://example.org/${label.toLowerCase()}`, biography: {en: `${label} biography`}, affiliations: [{authorId: id, name: {en: `${label} Institute`}}], contributorRoles: roles});
        const add = async (body) => (await call('POST', base, {contributorRoles: roles, ...body})).json;
        await step('a31-person', async () => {
            const p = await add({contributorType: 'PERSON', givenName: {en: 'Wipe'}, familyName: {en: 'Person'}, email: 'wipe@example.test', country: 'CA'});
            const r = rowOf(p.id);
            await fillPerson(p.id, 'Wipep');
            const asRead = (await call('GET', `${base}/${p.id}`)).json;
            await edit('a31-person-given', p.id, {givenName: {en: 'NoType'}}, r);
            await fillPerson(p.id, 'Wipep');
            await edit('a31-person-given-affs', p.id, {givenName: {en: 'NoType'}, affiliations: (await call('GET', `${base}/${p.id}`)).json.affiliations}, r);
            await fillPerson(p.id, 'Wipep');
            await edit('a31-person-email', p.id, {email: 'newmail@example.test'}, r);
            await fillPerson(p.id, 'Wipep');
            await edit('a31-person-bio', p.id, {biography: {en: 'NoType biography'}}, r);
            // The other end: the type named, the email sent empty and null.
            await fillPerson(p.id, 'Wipep');
            await edit('a31-person-typed-email-empty', p.id, {contributorType: 'PERSON', email: ''}, r);
            await fillPerson(p.id, 'Wipep');
            await edit('a31-person-typed-email-null', p.id, {contributorType: 'PERSON', email: null}, r);
            fact('a31-person-asRead', summary(asRead));
        });
        await step('a31-org', async () => {
            const o = await add({contributorType: 'ORGANIZATION', organizationName: {en: 'Wipe Org'}, email: 'wipeorg@example.test', country: 'CA', url: 'https://example.org/wipeorg', biography: {en: 'Org biography'}});
            fact('a31-org-added', summary(o));
            const r = rowOf(o.id);
            const fillOrg = () => call('PUT', `${base}/${o.id}`, {contributorType: 'ORGANIZATION', organizationName: {en: 'Wipe Org'}, email: 'wipeorg@example.test', country: 'CA', url: 'https://example.org/wipeorg', biography: {en: 'Org biography'}, affiliations: [{authorId: o.id, name: {en: 'Org Institute'}}]});
            await fillOrg();
            await edit('a31-org-name', o.id, {organizationName: {en: 'Renamed Org'}}, r);
            await fillOrg();
            await edit('a31-org-email', o.id, {email: 'neworg@example.test'}, r);
            await fillOrg();
            await edit('a31-org-type-empty', o.id, {contributorType: null, email: 'neworg@example.test'}, r);
            await fillOrg();
            await edit('a31-org-typed-email-empty', o.id, {contributorType: 'ORGANIZATION', email: ''}, r);
            await fillOrg();
            await edit('a31-org-typed-name', o.id, {contributorType: 'ORGANIZATION', organizationName: {en: 'Typed Org'}}, r);
        });
        await step('a31-anon', async () => {
            const n = await add({contributorType: 'ANONYMOUS', email: 'wipeanon@example.test', country: 'CA'});
            fact('a31-anon-added', summary(n));
            const r = rowOf(n.id);
            await edit('a31-anon-country', n.id, {country: 'DE'}, r);
            await call('PUT', `${base}/${n.id}`, {contributorType: 'ANONYMOUS', email: 'wipeanon@example.test', country: 'CA'});
            await edit('a31-anon-typed-country', n.id, {contributorType: 'ANONYMOUS', country: 'DE'}, r);
        });
        fact('stored-end', stored(S.pub));
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
        record('facts-all', facts);
        await close();
    }
    if (RUN === 'r1' && A === 'ojs') note('S11972: the contributor API edits read back on the list need the row by position (seq), since an edit without the type can empty the name; the ROR lookup is routed to an empty answer so a typed institution is offered as itself.');
});
