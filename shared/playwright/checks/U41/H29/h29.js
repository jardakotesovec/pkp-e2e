// U41 claim check, chunk H29 (housekeeping 2026-10-29): one incidentals row on the contributor edit API.
//   Row: "An edit whose body has no `contributorType` empties every name field of the contributor (given, family,
//         preferred public name); the same edit with the type set keeps them." (OJS main, 2026-10-27)
// Spec: docs/specs/U41-contributors-and-affiliations.md, Rule 4a, A30, A31 (f-a31), footnote o.
//
// Runs on a DATASET fleet freshly reset to PKP's default test dataset (no scratch context: the reset is the fresh
// state, and the fleet is this agent's alone), as `dbarnes` (Journal editor, manager-level) on `publicknowledge`.
// Every request is sent from dbarnes's own signed-in workflow page with its CSRF token (as fn o's probes did).
// One unpublished contributor X per app (the latest version). Before each test edit X is "restored": a PUT naming
// the type (main) with every person field filled (given, family, preferred public name, email, country, biography,
// URL) and one affiliation (as read, or a new typed "H29 Institute"), so each test edit starts from a full record.
// Every outcome is read right after the request (the answer), by a GET, and in the stored rows; the form-read steps
// also open X's "Edit" after a reload.
//
//   S0  screens: workflow "Contributors" (list), X's "Edit" (contributor type, boxes, affiliations); given name
//       changed and left unsaved with "Close" (what asks on the way out); "Edit" again (given name on reopening).
//   R0  restore (affiliations as read).
//   C1  main only, CONTROL: PUT {contributorType: "PERSON", email}                       reads + form after reload.
//   N1  PUT {email} alone (no contributorType)                                            reads + form after reload.
//   N2  PUT {biography} alone (no contributorType)                                        reads + form after reload.
//   C2  main only, CONTROL: PUT {contributorType: "PERSON", biography}                   reads.
//   N3  main only: PUT {contributorType: null, email} (the key sent empty)               reads.
//   N4  main only: PUT {contributorType: "person", email} (a value no type has)          reads.
//   N4b main only: N4 with the affiliations as read                                       reads.
//   F0  the form's own "Save" on X (given name changed): the request it sends (keys, contributorType) and reads.
//   (an R<n> restore runs before C1, N1, N2, C2, N3, N4 and F0)
//
// Reset first (each run):
//   npm run fleet-prep -- --feature issues-cc29a --dataset 4 --reset
//   PKP_E2E_LINE=stable-3_5_0 npm run fleet-prep -- --feature issues-cc29a-3_5 --dataset 4 --reset
// Run (main, one app per call, under the app lock; PROBE_RUN=r1, r2 on main, s1, s2 on stable-3_5_0):
//   bin/app-lock.sh shared ojs -- env PROBE_FEATURE=issues-cc29a PKP_E2E_DATASET=4 PROBE_AGENT=cc29a PROBE_RUN=r1 \
//       PROBE_NOTES_FEATURE=U41 node bin/probe.js ojs shared/playwright/checks/U41/H29/h29.js
//   PKP_E2E_LINE=stable-3_5_0 PROBE_FEATURE=issues-cc29a-3_5 PKP_E2E_DATASET=4 PROBE_AGENT=cc29a PROBE_RUN=s1 \
//       node bin/probe.js ojs shared/playwright/checks/U41/H29/h29.js        (no lock on the stable line)
// Outputs: h29-facts-<run>-<app>.json and h29-<step>-{list,edit}-<run>-<app>.{json,png}. No assertions: the reader
// judges. No other script or file is read.
const {forEachApp, launch, signIn, screen, shot, record, idle, sql, serverLog} = require('../../../probe');

const T = 30_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (s, n = 1500) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));

/** Per app: an unpublished latest version's contributor with one affiliation (dataset premise, seed-facts). */
const CASES = {
    ojs: {sub: 6, given: 'Dana', family: 'Phillips'},
    omp: {sub: 1, given: 'Arthur', family: 'Clark'},
    ops: {sub: 1, given: 'Carlo', family: 'Corino'},
};
/** The fields the probe reads from the record. */
const FIELDS = ['contributorType', 'givenName', 'familyName', 'preferredPublicName', 'organizationName', 'email', 'country', 'biography', 'url', 'rorId', 'orcid', 'includeInBrowse', 'seq', 'userGroupId', 'contributorRoles', 'creditRoles'];

function resolve(app, c) {
    const q = `select a.author_id || '|' || a.publication_id from authors a join publications p on p.publication_id = a.publication_id
        join author_settings s on s.author_id = a.author_id and s.setting_name = 'givenName' and s.locale = 'en'
        where p.submission_id = ${c.sub} and s.setting_value = '${c.given}' order by p.publication_id desc limit 1`;
    const [id, pub] = sql(app, q.replace(/\s+/g, ' ')).split('|').map(Number);
    const order = sql(app, `select author_id from authors where publication_id = ${pub} order by seq, author_id`).split('\n').map(Number);
    return {...c, id, pub, index: order.indexOf(id), rel: `submissions/${c.sub}/publications/${pub}/contributors/${id}`};
}

/** The stored rows: the authors row's own columns, every non-empty setting (name:locale=value), affiliations. */
function stored(app, id) {
    const cols = sql(app, `select row_to_json(a)::text from authors a where author_id = ${id}`);
    let row = null;
    try {
        row = JSON.parse(cols);
    } catch (e) {
        row = cols;
    }
    return {
        row: row && typeof row === 'object' ? {email: row.email, contributor_type: row.contributor_type, include_in_browse: row.include_in_browse, seq: row.seq} : row,
        settings: sql(app, `select setting_name || ':' || locale || '=' || left(setting_value, 60) from author_settings where author_id = ${id} and coalesce(setting_value, '') <> '' order by 1`)
            .split('\n')
            .filter(Boolean),
        affiliations: sql(
            app,
            `select a.author_affiliation_id || ' ' || coalesce(a.ror, '-') || ' ' || coalesce((select setting_value from author_affiliation_settings s where s.author_affiliation_id = a.author_affiliation_id and s.setting_name = 'name' and s.locale = 'en'), '-') from author_affiliations a where a.author_id = ${id} order by 1`,
        )
            .split('\n')
            .filter(Boolean),
    };
}

/** One REST call from the signed-in page, with its CSRF token. */
async function api(page, method, rel, body) {
    return page.evaluate(
        async ({method, rel, body}) => {
            /* global pkp */
            const res = await fetch(`${pkp.context.apiBaseUrl}${rel}`, {
                method,
                headers: {'X-Csrf-Token': pkp.currentUser.csrfToken, 'Content-Type': 'application/json', Accept: 'application/json'},
                body: body === undefined ? undefined : JSON.stringify(body),
            });
            const t = await res.text();
            let j = null;
            try {
                j = JSON.parse(t);
            } catch (e) {
                /* not JSON */
            }
            if (j && typeof j === 'object' && j.trace) j = {...j, trace: `(${j.trace.length} frames)`};
            return {status: res.status, json: j, text: j ? undefined : t.slice(0, 800)};
        },
        {method, rel, body},
    );
}

/** A server error's kind only: its body is never kept (the exception text carries server internals). */
const kindOf = (r) => {
    const t = (r.json && r.json.error) || r.text || '';
    const m = /SQLSTATE\[(\w+)\]/.exec(t);
    return {errorKind: m ? `database error, SQLSTATE ${m[1]}${/contributor_type/.test(t) ? ' (the contributor type check)' : ''}` : 'other server error'};
};
const pick = (j) => {
    if (!j || typeof j !== 'object') return j;
    const out = {};
    for (const k of FIELDS) if (k in j) out[k] = k === 'contributorRoles' && Array.isArray(j[k]) ? j[k].map((r) => (r && r.id) || r) : j[k];
    out.affiliations = Array.isArray(j.affiliations) ? j.affiliations.map((a) => ({id: a.id, ror: a.ror, name: a.name && a.name.en})) : j.affiliations;
    return out;
};

forEachApp(async (app) => {
    if (!app.dataset) throw new Error('h29.js runs on a dataset fleet (fleet-prep --dataset)');
    const {WorkflowPage} = require('../../../pages/WorkflowPage.js');
    const run = process.env.PROBE_RUN || null;
    const facts = {app: app.name, line: app.line || 'main', run};
    const fact = (k, v) => {
        facts[k] = v;
        console.log(`[h29 ${app.name}] ${k}: ${flat(JSON.stringify(v), 1800)}`);
    };
    const log = serverLog(app);
    const {page, close} = await launch(app);
    const dialogs = [];
    page.on('dialog', async (d) => {
        dialogs.push({type: d.type(), message: d.message()});
        await d.accept().catch(() => {});
    });
    const wf = new WorkflowPage(page, app.contextPath, {labels: {publicationGroup: app.name === 'ops' ? 'Preprint' : 'Publication'}});
    const part = async (key, fn) => {
        const from = log.mark();
        try {
            await fn();
        } catch (e) {
            fact(`${key} error`, flat(e.message, 600));
            await shot(page, `h29-${key}-error`).catch(() => {});
        }
        const lines = log.since(from).filter((l) => !/^\s*(DETAIL|\[previous exception\])/.test(l)).map((l) => flat(l.replace(/\s*\(Connection:.*$/, ' (…)'), 300));
        if (lines.length) fact(`${key} server log`, lines.slice(-12));
    };

    const openContributors = async (sub) => {
        await wf.gotoEditorial(sub);
        await idle(page);
        await wf.expandLatestVersionNode().catch(() => {});
        const links = wf.menuLink('Contributors');
        for (let i = (await links.count()) - 1; i >= 0; i--) {
            if (await links.nth(i).isVisible().catch(() => false)) {
                await links.nth(i).click();
                await idle(page);
                await sleep(500);
                return true;
            }
        }
        return false;
    };
    const editDialog = () => page.getByRole('dialog', {name: 'Edit', exact: true});
    /** The X row by its family name, else by its place in the list (a row whose names were emptied). */
    const openEdit = async (c) => {
        let item = wf.dialog().locator('li.listPanel__item').filter({hasText: c.family}).first();
        if (!(await item.waitFor({timeout: 8000}).then(() => true, () => false))) {
            item = wf.dialog().locator('li.listPanel__item').nth(c.index);
            await item.waitFor({timeout: T});
        }
        await item.getByRole('button', {name: /^Edit/}).first().click();
        const dlg = editDialog();
        await dlg.waitFor({timeout: T});
        await dlg.locator('input[name="email"]').waitFor({timeout: T});
        await idle(page);
        await sleep(500);
        return dlg;
    };
    const closeEdit = async (dlg) => {
        await dlg.getByRole('button', {name: 'Close', exact: true}).first().click().catch(() => {});
        await dlg.waitFor({state: 'hidden', timeout: 10_000}).catch(() => {});
        await sleep(800);
        await idle(page);
    };
    /** X's "Edit" after a reload: list row, contributor type, the boxes, the affiliation rows; closed unsaved. */
    const readForm = async (key, c) => {
        if (!(await openContributors(c.sub))) return fact(`${key} form`, 'no Contributors entry');
        record(`h29-${key}-list`, await screen(page));
        const rows = await wf.dialog().locator('li.listPanel__item').allInnerTexts().catch(() => []);
        const dlg = await openEdit(c);
        record(`h29-${key}-edit`, await screen(page));
        await shot(page, `h29-${key}-edit`);
        const box = async (n) => dlg.locator(`[name="${n}"]`).first().inputValue({timeout: 3000}).catch(() => '(no box)');
        const out = {
            listRow: flat(rows[c.index], 300),
            contributorType: await dlg.locator('input[name="contributorType"]:checked').first().inputValue({timeout: 3000}).catch(() => '(no radio)'),
            givenName: await box('givenName-en'),
            familyName: await box('familyName-en'),
            preferredPublicName: await box('preferredPublicName-en'),
            email: await box('email'),
            url: await box('url'),
            country: await box('country'),
            biography: flat(await dlg.locator('.pkpFormField--richTextarea, .pkpFormField--richtextarea').filter({hasText: /Bio/}).first().innerText({timeout: 3000}).catch(() => '(no field)'), 300),
            affiliationRows: await dlg
                .locator('.pkpFormField--affiliations tbody tr')
                .evaluateAll((trs) => trs.map((tr) => tr.innerText.replace(/\s+/g, ' ').trim()))
                .catch(() => null),
        };
        await closeEdit(dlg);
        fact(`${key} form`, out);
        return out;
    };
    /** After a request: the answer, then a GET and the stored rows. */
    const after = async (key, c, r) => {
        fact(`${key} answer`, {status: r.status, record: r.status < 300 ? pick(r.json) : r.status >= 500 ? kindOf(r) : r.json || r.text});
        const g = await api(page, 'GET', c.rel);
        fact(`${key} GET after`, {status: g.status, record: pick(g.json)});
        fact(`${key} stored after`, stored(app, c.id));
        return g;
    };

    try {
        const X = resolve(app, CASES[app.name]);
        fact('case', X);
        fact('stored at start', stored(app, X.id));
        await signIn(page, 'dbarnes');
        await openContributors(X.sub); // a context page, so pkp.context is there
        const first = await api(page, 'GET', X.rel);
        fact('GET at start', {status: first.status, keys: first.json && Object.keys(first.json), record: pick(first.json)});
        const typed = !!(first.json && 'contributorType' in first.json); // main has contributor types, 3.5 not
        fact('record has contributorType', typed);

        let n = 0;
        const restore = async (asRead = false) => {
            const key = `R${n++}`;
            await part(key, async () => {
                const g = await api(page, 'GET', X.rel);
                const affs = g.json && Array.isArray(g.json.affiliations) && g.json.affiliations.length ? g.json.affiliations : [{authorId: X.id, name: {en: `H29 Institute ${key}`}}];
                const body = {
                    ...(typed ? {contributorType: 'PERSON'} : {}),
                    givenName: {en: X.given},
                    familyName: {en: X.family},
                    preferredPublicName: {en: `${X.given} ${X.family} (h29)`},
                    email: `h29-${app.name}@example.org`,
                    country: 'CA',
                    biography: {en: '<p>h29 biography</p>'},
                    url: 'https://example.org/h29',
                    affiliations: asRead ? g.json.affiliations : affs,
                };
                const r = await api(page, 'PUT', X.rel, body);
                fact(`${key} restore`, {status: r.status, error: r.status >= 300 ? r.json || r.text : undefined, record: r.status < 300 ? pick(r.json) : undefined});
            });
        };

        await part('S0', async () => {
            await readForm('S0', X);
            const dlg = await openEdit(X);
            const given = dlg.locator('input[name="givenName-en"]');
            await given.fill(`${X.given} h29 unsaved`);
            await given.blur();
            const d0 = dialogs.length;
            await closeEdit(dlg);
            await sleep(2000);
            fact('S0 leave changed form', {dialogs: dialogs.slice(d0), editStillOpen: await editDialog().isVisible().catch(() => false)});
            record('h29-S0-after-close', await screen(page));
            if (await editDialog().isVisible().catch(() => false)) await closeEdit(editDialog());
            const again = await openEdit(X);
            fact('S0 given name on reopening', await again.locator('input[name="givenName-en"]').inputValue());
            await closeEdit(again);
        });

        await restore(true);
        const step = async (key, body, {form = false} = {}) => {
            await part(key, async () => {
                fact(`${key} body`, body);
                await after(key, X, await api(page, 'PUT', X.rel, body));
                if (form) {
                    await page.reload();
                    await idle(page);
                    await readForm(key, X);
                }
            });
        };
        if (typed) await step('C1', {contributorType: 'PERSON', email: `h29c1-${app.name}@example.org`}, {form: true});
        await restore();
        await step('N1', {email: `h29n1-${app.name}@example.org`}, {form: true});
        await restore();
        await step('N2', {biography: {en: '<p>h29 n2 biography</p>'}}, {form: true});
        if (typed) {
            await restore();
            await step('C2', {contributorType: 'PERSON', biography: {en: '<p>h29 c2 biography</p>'}});
            await restore();
            await step('N3', {contributorType: null, email: `h29n3-${app.name}@example.org`});
            await restore();
            await step('N4', {contributorType: 'person', email: `h29n4-${app.name}@example.org`});
            await restore();
            await part('N4b', async () => {
                const g = await api(page, 'GET', X.rel);
                await step('N4b', {contributorType: 'person', email: `h29n4b-${app.name}@example.org`, affiliations: g.json && g.json.affiliations});
            });
        }
        await restore();

        await part('F0', async () => {
            await page.reload();
            await idle(page);
            await openContributors(X.sub);
            const dlg = await openEdit(X);
            await dlg.locator('input[name="givenName-en"]').fill(`${X.given} h29f0`);
            const answer = page.waitForResponse((r) => /\/contributors\/\d+/.test(r.url()) && ['POST', 'PUT'].includes(r.request().method()), {timeout: T}).catch(() => null);
            await dlg.getByRole('button', {name: 'Save', exact: true}).click();
            const r = await answer;
            let sent = null;
            try {
                const b = r && r.request().postDataJSON();
                sent = b && {keys: Object.keys(b), contributorType: b.contributorType, override: r.request().headers()['x-http-method-override'] || null};
            } catch (e) {
                sent = 'unreadable';
            }
            fact('F0 form save', {status: r && r.status(), sent});
            await dlg.waitFor({state: 'hidden', timeout: T}).catch(() => {});
            await idle(page);
            await sleep(800);
            record('h29-F0-after-save', await screen(page));
            const g = await api(page, 'GET', X.rel);
            fact('F0 GET after', {status: g.status, record: pick(g.json)});
            fact('F0 stored after', stored(app, X.id));
            await page.reload();
            await idle(page);
            await readForm('F0', X);
        });
    } finally {
        fact('dialogs', dialogs);
        record('h29-facts', facts);
        await close();
    }
});
