// Helpers of walk.js here (U41 A30, A31, A32 issue walks; each of their folders holds its own copy so
// that each stands alone; this one widened for the A31 refresh of 2026-10-29). Requiring this file runs nothing.
const path = require('path');
const fs = require('fs');
const {execFileSync} = require('child_process');
const {sql, idle, screen, record, shot} = require('../../../probe');

const T = 30_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (s, n = 1500) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));

/**
 * Per app, on PKP's default test dataset: the submission, the contributor's names and its one typed
 * affiliation (latest version unpublished); `control` a second such contributor, for a control request.
 */
const CASES = {
    ojs: {sub: 7, given: 'Domatilia', family: 'Sokoloff', institution: 'University College Cork'},
    omp: {sub: 1, given: 'Arthur', family: 'Clark', institution: 'University of Calgary'},
    ops: {sub: 1, given: 'Carlo', family: 'Corino', institution: 'University of Bologna'},
};
const CONTROLS = {
    ojs: {sub: 6, given: 'Dana', family: 'Phillips', institution: 'University of Toronto'},
    omp: {sub: 2, given: 'Alvin', family: 'Finkel', institution: 'Athabasca University'},
    ops: {sub: 4, given: 'Diaga', family: 'Diouf', institution: 'Alexandria University'},
};

/**
 * Per app, a published item's contributor with one affiliation (the item's current, published version), and
 * the item's public page: OJS article 17, OMP book 5, OPS preprint 2.
 */
const PUBLISHED = {
    ojs: {sub: 17, given: 'Vajiheh', family: 'Karbasizaed', institution: 'University of Tehran', page: 'article/view/17'},
    omp: {sub: 5, given: 'Chantal', family: 'Allan', institution: 'University of Southern California', page: 'catalog/book/5'},
    ops: {sub: 2, given: 'Catherine', family: 'Kwantes', institution: 'University of Windsor', page: 'preprint/view/2'},
};

/** The case (or with `control`, the control's) with its stored ids: contributor id, latest publication, row index, API path. */
function resolve(app, control = false) {
    const c = (control === 'published' ? PUBLISHED : control ? CONTROLS : CASES)[app.name];
    const q = `select a.author_id || '|' || a.publication_id from authors a join publications p on p.publication_id = a.publication_id
        join author_settings s on s.author_id = a.author_id and s.setting_name = 'familyName' and s.locale = 'en'
        where p.submission_id = ${c.sub} and s.setting_value = '${c.family}' order by p.publication_id desc limit 1`;
    const [id, pub] = sql(app, q.replace(/\s+/g, ' ')).split('|').map(Number);
    const order = sql(app, `select author_id from authors where publication_id = ${pub} order by seq, author_id`).split('\n').map(Number);
    const rel = `submissions/${c.sub}/publications/${pub}/contributors/${id}`;
    return {...c, id, pub, index: order.indexOf(id), rel, url: app.url(`/index.php/${app.contextPath}/api/v1/${rel}`)};
}

/**
 * The stored rows: names, preferred public name, email, country, biography, homepage URL, contributor type (main),
 * affiliations (id and English name).
 */
function stored(app, id) {
    const setting = (n) => sql(app, `select coalesce(setting_value, '') from author_settings where author_id = ${id} and setting_name = '${n}' and locale = 'en'`);
    const hasType = sql(app, `select count(*) from information_schema.columns where table_name = 'authors' and column_name = 'contributor_type'`) !== '0';
    return {
        givenName: setting('givenName'),
        familyName: setting('familyName'),
        preferredPublicName: setting('preferredPublicName'),
        email: sql(app, `select email from authors where author_id = ${id}`),
        country: sql(app, `select coalesce(setting_value, '') from author_settings where author_id = ${id} and setting_name = 'country'`),
        biography: setting('biography'),
        url: sql(app, `select coalesce(setting_value, '') from author_settings where author_id = ${id} and setting_name = 'url'`),
        type: hasType ? sql(app, `select coalesce(contributor_type, '-') from authors where author_id = ${id}`) : '(no column)',
        affiliations: sql(
            app,
            `select a.author_affiliation_id || ' ' || coalesce((select setting_value from author_affiliation_settings s where s.author_affiliation_id = a.author_affiliation_id and s.setting_name = 'name' and s.locale = 'en'), coalesce(a.ror, '-')) from author_affiliations a where a.author_id = ${id} order by 1`,
        )
            .split('\n')
            .filter(Boolean),
    };
}

/**
 * Set `api_key_secret` in the dataset fleet's config (the dataset leaves it empty, so no API key can be
 * made); every reset rewrites the config, so call it after each reset. A team install sets it in
 * config.inc.php, section [security].
 */
function setApiKeySecret(app, secret = 'h21b-api-key-secret-for-testing') {
    const REPO = path.resolve(__dirname, '../../../../..');
    const file = path.resolve(REPO, app.configFile);
    const after = fs.readFileSync(file, 'utf8').replace(/^api_key_secret\s*=.*$/m, `api_key_secret = "${secret}"`);
    fs.writeFileSync(file, after);
    return (after.match(/^api_key_secret\s*=.*$/m) || [])[0];
}

/** Profile > "API Key" > "Create API Key" (when none exists yet), and the key the box shows. */
async function createApiKey(page, app) {
    const {ProfilePage} = require('../../../pages/ProfilePage.js');
    const prof = new ProfilePage(page, app.contextPath);
    await prof.goto('apiKey');
    if (!(await prof.apiKeyBox().inputValue().catch(() => '')).includes('.')) await prof.createApiKey();
    return prof.apiKeyBox().inputValue();
}

/** One REST API call with curl, as a developer sends it: the Bearer key, a JSON body. */
function curl(method, url, token, body) {
    const args = ['-s', '-o', '-', '-w', '\n%{http_code}', '-X', method, '-H', `Authorization: Bearer ${token}`, '-H', 'Accept: application/json'];
    if (body !== undefined) args.push('-H', 'Content-Type: application/json', '--data-binary', JSON.stringify(body));
    args.push(url);
    const out = execFileSync('curl', args, {encoding: 'utf8', timeout: 60_000});
    const i = out.lastIndexOf('\n');
    const text = out.slice(0, i);
    let json = null;
    try {
        json = JSON.parse(text);
    } catch {}
    if (json && typeof json === 'object' && json.trace) json = {...json, trace: `(${json.trace.length} frames)`};
    return {status: Number(out.slice(i + 1)), json, text: json ? null : text.slice(0, 600)};
}

/** What a PUT's answer says, short. */
const answer = (r) => ({
    status: r.status,
    body: r.status >= 300 ? r.json || r.text : '(the record)',
    givenName: r.json && r.json.givenName,
    familyName: r.json && r.json.familyName,
    affiliations: r.json && Array.isArray(r.json.affiliations) ? r.json.affiliations.map((a) => (a.name && a.name.en) || a.ror) : undefined,
});

/** The workflow's "Contributors" of the submission (the latest version's entry). */
async function openContributors(wf, page, sub) {
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
}

/** "Edit" on the contributor's row (by family name, else by its place in the list). */
async function openEdit(page, wf, c) {
    let item = wf.dialog().locator('li.listPanel__item').filter({hasText: c.family}).first();
    if (!(await item.waitFor({timeout: 8000}).then(() => true, () => false))) item = wf.dialog().locator('li.listPanel__item').nth(c.index);
    await item.waitFor({timeout: T});
    await item.getByRole('button', {name: /^Edit/}).first().click();
    const dlg = page.getByRole('dialog', {name: 'Edit', exact: true});
    await dlg.waitFor({timeout: T});
    await dlg.locator('input[name="givenName-en"]').waitFor({timeout: T});
    await idle(page);
    await sleep(500);
    return dlg;
}

async function closeEdit(page, dlg) {
    await dlg.getByRole('button', {name: 'Close', exact: true}).first().click().catch(() => {});
    await dlg.waitFor({state: 'hidden', timeout: 10_000}).catch(() => {});
    await sleep(800);
    await idle(page);
}

/** The "Affiliations" rows the open form lists. */
const affRows = (dlg) =>
    dlg
        .locator('.pkpFormField--affiliations tbody tr')
        .evaluateAll((trs) => trs.map((tr) => tr.innerText.replace(/\s+/g, ' ').trim()).filter(Boolean))
        .catch(() => null);

/**
 * Reload, "Contributors", the contributor's row and its "Edit": what the screens show, recorded under `key`;
 * the form is closed unsaved.
 */
async function readForm(page, wf, c, key, run = '') {
    await page.reload().catch(() => {});
    await idle(page);
    if (!(await openContributors(wf, page, c.sub))) return {error: 'no "Contributors" entry'};
    record(`${key}-list${run}`, await screen(page));
    const rows = await wf.dialog().locator('li.listPanel__item').allInnerTexts().catch(() => []);
    const row = flat(rows.find((t) => t.includes(c.family)) || rows[c.index] || null, 300);
    const dlg = await openEdit(page, wf, c);
    record(`${key}-edit${run}`, await screen(page));
    await shot(page, `${key}-edit${run}`);
    const box = async (n) => dlg.locator(`input[name="${n}"]`).first().inputValue({timeout: 3000}).catch(() => '(no box)');
    const out = {
        listRow: row,
        givenName: await box('givenName-en'),
        familyName: await box('familyName-en'),
        preferredPublicName: await box('preferredPublicName-en'),
        email: await box('email'),
        url: await box('url'),
        country: await dlg.locator('select[name="country"]').first().evaluate((s) => (s.selectedOptions[0] ? s.selectedOptions[0].text : '')).catch(() => '(no box)'),
        bioStatement: await bioField(dlg)
            .frameLocator('iframe')
            .first()
            .locator('body')
            .innerText({timeout: 3000})
            .then((t) => flat(t, 200))
            .catch(() => '(no box)'),
        bioProgress: flat(await bioField(dlg).locator('.pkpFormField--richTextarea__controlFooter').innerText({timeout: 3000}).catch(() => null), 100),
        affiliationRows: await affRows(dlg),
    };
    if (out.affiliationRows && !out.affiliationRows.length) {
        out.affiliationsField = flat(await dlg.locator('.pkpFormField--affiliations').first().innerText().catch(() => '(no field)'), 300);
    }
    await closeEdit(page, dlg);
    return out;
}

/** The form's "Bio Statement" field (a formatted-text box per language, English first). */
const bioField = (dlg) => dlg.locator('.pkpFormField--richTextarea').filter({hasText: 'Bio Statement'}).first();

/**
 * Step 1: "Edit" on the contributor, type `values.preferredPublicName` in "Preferred Public Name", `values.url` in
 * "Homepage URL" and `values.biography` in "Bio Statement" (English), and "Save": the save's answer.
 */
async function fillAndSave(page, wf, c, values) {
    await page.reload().catch(() => {});
    await idle(page);
    if (!(await openContributors(wf, page, c.sub))) return {error: 'no "Contributors" entry'};
    const dlg = await openEdit(page, wf, c);
    await dlg.locator('input[name="preferredPublicName-en"]').fill(values.preferredPublicName);
    await dlg.locator('input[name="url"]').fill(values.url);
    const body = bioField(dlg).frameLocator('iframe').first().locator('body');
    await body.click();
    await body.pressSequentially(values.biography);
    await sleep(300);
    return pressSave(page, dlg);
}

/** Open the Affiliations row's actions ("Click to edit or delete") and choose `item`. */
async function rowAction(page, dlg, institution, item) {
    const row = dlg.locator('.pkpFormField--affiliations tbody tr').filter({hasText: institution}).first();
    await row.getByRole('button', {name: 'Click to edit or delete'}).click();
    await page.getByRole('menuitem', {name: item}).click();
    await sleep(300);
    await idle(page);
}

/** Answer the "Are you sure?" window that "Remove institution" opens with "Yes". */
async function confirmYes(page) {
    const dlg = page.getByRole('dialog').filter({hasText: 'Are you sure?'}).last();
    await dlg.waitFor({timeout: T});
    const text = flat(await dlg.innerText(), 300);
    await dlg.getByRole('button', {name: 'Yes', exact: true}).click();
    await sleep(500);
    await idle(page);
    return text;
}

/** Press the open form's "Save": the contributor save's answer and what it sent. */
async function pressSave(page, dlg) {
    const res = page.waitForResponse((r) => /\/contributors\/\d+/.test(r.url()) && r.request().method() === 'POST', {timeout: T}).catch(() => null);
    await dlg.getByRole('button', {name: 'Save', exact: true}).click();
    const r = await res;
    await dlg.waitFor({state: 'hidden', timeout: T}).catch(() => {});
    await idle(page);
    await sleep(800);
    let sent = null;
    try {
        sent = r && flat(r.request().postData(), 600);
    } catch {}
    return {status: r ? r.status() : null, sent, body: r ? flat(await r.text().catch(() => ''), 300) : null};
}

module.exports = {
    T, sleep, flat, CASES, CONTROLS, PUBLISHED, resolve, stored, setApiKeySecret, createApiKey, curl, answer,
    openContributors, openEdit, closeEdit, affRows, readForm, rowAction, confirmYes, pressSave, bioField, fillAndSave,
};
