/**
 * @file shared/playwright/checks/sync/pkp-lib-12520/walk.js
 *
 * PR review of pkp/pkp-lib#12520 (pkp-lib#13743 main, #13745
 * stable-3_5_0; pointer bumps ojs#6042/#6043, omp#2561/#2562,
 * ops#1491/#1492): a ROR-backed affiliation (and, on main, a ROR-backed
 * funder) maps the registry's names onto the publication's languages
 * through `LocaleConversion::getIso1FromLocale()`. A language with no
 * two-letter ISO 639-1 code (ckb, kab, …) gives null, `getName(null)`
 * returns the whole name array, so the API sends `name.ckb` as an object
 * and the contributor form's Save is refused. The fix maps such a language
 * to the registry's display-locale name.
 *
 * Seeds on a freshly loaded PKP dataset (SQL; the dataset already holds
 * the registry copy): `ckb` installed on the site and added to the
 * context's submission and metadata languages; the first author of the
 * first unpublished submission gets a ROR affiliation (University of
 * Padua, https://ror.org/00240q980: en display name, plus ca, de, fr, it,
 * sl names); on main the same submission gets a ROR funder. Then, as
 * admin:
 *   api      GET .../publications/<id>: the affiliation's `name` per
 *            language (each must be a string; at the base `ckb` is an
 *            object)
 *   funder   GET .../funders (main): the funder's `name` per language
 *   edit     workflow › Publication › Contributors › Edit on that author,
 *            the affiliation row's text, then Save: the contributors
 *            POST's status and whether the panel closes or shows errors
 *   reload   after a reload the affiliation is still the ROR entry
 *
 *   [PKP_E2E_LINE=stable-3_5_0] npm run fleet-prep -- --feature sync-12520 --dataset --reset --apps ojs,omp,ops
 *   [PKP_E2E_LINE=stable-3_5_0] WALK_SIDE=base|head PROBE_FEATURE=sync-12520 PROBE_AGENT=w12520 \
 *     node bin/probe.js all shared/playwright/checks/sync/pkp-lib-12520/walk.js
 */
const {forEachApp, launch, signIn, record, shot, sql, serverLog} = require('../../../probe');

const ROR = 'https://ror.org/00240q980';
const LANG = process.env.WALK_LANG || 'ckb';
const SIDE = process.env.WALK_SIDE || 'side';
const CTX = {ojs: ['journals', 'journal_id', 'journal_settings'], omp: ['presses', 'press_id', 'press_settings'], ops: ['servers', 'server_id', 'server_settings']};

/** Add a value to a JSON-array setting. */
function addToJson(app, table, where, column, value) {
    const raw = sql(app, `SELECT ${column} FROM ${table} WHERE ${where}`);
    const list = JSON.parse(raw || '[]');
    if (!list.includes(value)) {
        list.push(value);
    }
    sql(app, `UPDATE ${table} SET ${column} = '${JSON.stringify(list)}' WHERE ${where}`);
    return list;
}

const typesOf = (name) =>
    name && typeof name === 'object'
        ? Object.fromEntries(Object.entries(name).map(([k, v]) => [k, typeof v === 'string' ? v : `<${Array.isArray(v) ? 'array' : typeof v}> ${JSON.stringify(v).slice(0, 80)}`]))
        : name;

forEachApp(async (app) => {
    const [table, idCol, settings] = CTX[app.name];
    const ctx = sql(app, `SELECT ${idCol} FROM ${table} WHERE path = 'publicknowledge'`);
    const siteLocales = addToJson(app, 'site', 'TRUE', 'installed_locales', LANG);
    const ctxLocales = {};
    for (const name of ['supportedSubmissionLocales', 'supportedAddedSubmissionLocales', 'supportedSubmissionMetadataLocales']) {
        const where = `${idCol} = ${ctx} AND setting_name = '${name}'`;
        if (sql(app, `SELECT count(*) FROM ${settings} WHERE ${where}`) !== '0') {
            ctxLocales[name] = addToJson(app, settings, where, 'setting_value', LANG);
        }
    }
    const [sub, pub] = sql(
        app,
        `SELECT s.submission_id, s.current_publication_id FROM submissions s WHERE s.context_id = ${ctx} AND s.status = 1 AND s.stage_id > 1
           AND EXISTS (SELECT 1 FROM authors a WHERE a.publication_id = s.current_publication_id) ORDER BY s.submission_id LIMIT 1`
    ).split('|');
    const author = sql(app, `SELECT author_id FROM authors WHERE publication_id = ${pub} ORDER BY seq, author_id LIMIT 1`);
    const family = sql(app, `SELECT setting_value FROM author_settings WHERE author_id = ${author} AND setting_name = 'familyName' AND locale = 'en'`);
    const affiliation = sql(app, `INSERT INTO author_affiliations (author_id, ror) VALUES (${author}, '${ROR}') RETURNING author_affiliation_id`).split('\n')[0];
    const hasFunders = sql(app, `SELECT count(*) FROM information_schema.tables WHERE table_name = 'funders'`) === '1';
    if (hasFunders) {
        sql(app, `INSERT INTO funders (submission_id, ror, seq) VALUES (${sub}, '${ROR}', 0)`);
    }
    const registry = sql(app, `SELECT string_agg(s.locale || '=' || s.setting_value, ' | ' ORDER BY s.locale) FROM rors r JOIN ror_settings s USING (ror_id) WHERE r.ror = '${ROR}' AND s.setting_name = 'name'`);

    const {page, close} = await launch(app);
    const log = serverLog(app);
    const out = {line: app.line, side: SIDE, lang: LANG, siteLocales, ctxLocales, sub, pub, author, family, affiliation, registry};
    const say = (what) => console.log(`[12520] ${app.name} ${app.line} ${SIDE} ${what}`);
    try {
        await signIn(page, 'admin');
        const api = `/index.php/publicknowledge/api/v1/submissions/${sub}`;
        const from = log.mark();
        const pubRes = await page.request.get(app.url(`${api}/publications/${pub}`));
        const body = await pubRes.json();
        const a = (body.authors || []).find((x) => x.id === Number(author));
        const aff = (a?.affiliations || []).find((x) => x.ror === ROR);
        out.api = {status: pubRes.status(), name: typesOf(aff?.name)};
        say(`api ${pubRes.status()} affiliation name: ${JSON.stringify(out.api.name)}`);
        if (hasFunders) {
            const fRes = await page.request.get(app.url(`${api}/publications/${pub}/funders`));
            const fBody = await fRes.json().catch(() => null);
            const items = fBody?.items || fBody || [];
            const f = (Array.isArray(items) ? items : []).find((x) => x.ror === ROR);
            out.funder = {status: fRes.status(), name: typesOf(f?.name)};
            say(`funders ${fRes.status()} funder name: ${JSON.stringify(out.funder.name)}`);
        }

        // The workflow's Contributors page, Edit on the seeded author, Save.
        // 3.5's menu key names no publication (`publication_contributors`).
        const menuKey = app.line === 'stable-3_5_0' ? 'publication_contributors' : `publication_${pub}_contributors`;
        await page.goto(app.url(`/index.php/publicknowledge/dashboard/editorial?workflowSubmissionId=${sub}&workflowMenuKey=${menuKey}`));
        const row = page.locator('.listPanel--contributor li.listPanel__item').filter({hasText: family}).first();
        await row.waitFor({timeout: 30_000});
        await row.getByRole('button', {name: 'Edit', exact: true}).click();
        const dialog = page.getByRole('dialog', {name: 'Edit', exact: true});
        await dialog.waitFor({timeout: 30_000});
        const affField = dialog.locator('#contributor-affiliations-control, [id*="affiliations"]').first();
        await page.waitForTimeout(500);
        out.editAffiliationText = (await affField.innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 400);
        say(`edit: affiliations field reads "${out.editAffiliationText}"`);
        await shot(page, `${app.line}-${SIDE}-edit-open`);
        const saved = page.waitForResponse((r) => r.url().includes('/contributors') && r.request().method() === 'POST', {timeout: 15_000}).catch(() => null);
        await dialog.getByRole('button', {name: 'Save', exact: true}).click();
        const res = await saved;
        out.save = {status: res ? res.status() : 'no request', body: res ? (await res.text()).slice(0, 600) : ''};
        await page.waitForTimeout(1500);
        out.save.panelOpen = (await dialog.count()) > 0;
        out.save.errors = out.save.panelOpen
            ? (await dialog.locator('.pkpFieldError, .pkpFormPage__status, [class*="FormErrorSummary"], .pkpFormErrorSummary').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim()).filter(Boolean)
            : [];
        say(`save: POST ${out.save.status}, panel ${out.save.panelOpen ? 'still open' : 'closed'}${out.save.errors.length ? ', errors: ' + JSON.stringify(out.save.errors) : ''}${out.save.status !== 200 ? ' body: ' + out.save.body.slice(0, 300) : ''}`);
        await shot(page, `${app.line}-${SIDE}-after-save`);

        // After a reload the ROR entry is still there.
        out.afterRows = sql(app, `SELECT author_affiliation_id || ':' || coalesce(ror, '-') FROM author_affiliations WHERE author_id = ${author} ORDER BY 1`).split('\n');
        out.afterNames = sql(app, `SELECT locale || '=' || setting_value FROM author_affiliation_settings s JOIN author_affiliations x USING (author_affiliation_id) WHERE x.author_id = ${author} AND x.ror IS NOT NULL`);
        say(`db after save: affiliations ${JSON.stringify(out.afterRows)}, ROR entry's own names: ${JSON.stringify(out.afterNames)}`);
        out.log = log.since(from).map((l) => l.slice(0, 260));
        say(`server log: ${out.log.length ? out.log.join(' / ') : 'clean'}`);
        record(`${app.line}-${SIDE}`, out);
    } finally {
        await close();
    }
});
