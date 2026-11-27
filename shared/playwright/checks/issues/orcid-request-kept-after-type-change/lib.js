// Helpers of walk.js here (issue report docs/issues/U04-A26-orcid-request-blocks-organization-save.md).
// Requiring this file runs nothing. ORCID on, the Contributors list, the field's state and the mail
// read: copied from ../assistant-orcid-controls-refused/lib.js, so this folder needs no other report's.
const {idle, screen, shot, sql} = require('../../../probe');

const T = 30_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (s, n = 400) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));

/** Per app, on PKP's default test dataset (docs/process/dataset.md): the submission the steps add to. */
const CASES = {
    ojs: {id: 3, title: 'The Facets Of Job Satisfaction: A Nine-Nation Comparative Study Of Construct Equivalence'},
    omp: {id: 7, title: 'Accessible Elements: Teaching Science Online and at a Distance'},
    ops: {id: 1, title: 'The influence of lactation on the quantity and quality of cashmere production'},
};

/** Settings › Users & Roles › "ORCID": enable, "Member Sandbox", dummy credentials, "Save". */
async function setOrcidMember(page, app) {
    await page.goto(app.url(`/index.php/${app.contextPath}/management/settings/access`));
    await idle(page);
    await page.getByRole('tab', {name: 'ORCID', exact: true}).click();
    const box = page.getByRole('checkbox', {name: 'Enable ORCID functionality'});
    await box.waitFor({state: 'visible', timeout: T});
    if (!(await box.isChecked())) await box.check();
    const api = page.locator('select[name="orcidApiType"]');
    await api.waitFor({state: 'visible', timeout: T});
    await api.selectOption('memberSandbox');
    await page.locator('input[name="orcidClientId"]').fill('APP-0000000000000000');
    await page.locator('input[name="orcidClientSecret"]').fill('00000000-0000-0000-0000-000000000000');
    const saved = page.waitForResponse((r) => /\/api\/v1\/contexts\/\d+/.test(r.url()) && r.request().method() !== 'GET', {timeout: T}).catch(() => null);
    await page.locator('[id="orcidSettings"]').getByRole('button', {name: 'Save', exact: true}).click();
    const r = await saved;
    return {save: r ? r.status() : null};
}

/** Open the submission's workflow, Publication › "Contributors". */
async function openContributors(page, app, c) {
    await page.goto(app.url(`/index.php/${app.contextPath}/dashboard/editorial?workflowSubmissionId=${c.id}`));
    await idle(page);
    await page.getByRole('link', {name: 'Contributors', exact: true}).first().click();
    await page.locator('.listPanel__item').first().waitFor({timeout: T});
    await idle(page);
    return flat(await page.locator('.listPanel--contributor').innerText().catch(() => ''), 600);
}

/** "Add Contributor": the side window, found by its Email box. */
async function openAdd(page) {
    await page.getByRole('button', {name: 'Add Contributor'}).click();
    const modal = page.locator('[data-cy="active-modal"]').filter({has: page.locator('input[name="email"]')});
    await modal.locator('input[name="email"]').first().waitFor({timeout: T});
    await idle(page);
    await sleep(500);
    return modal;
}

/** "Contributor Type": the radio by its label; false when the form has no such choice (3.5). */
async function setType(modal, label) {
    const radio = modal.getByRole('radio', {name: label, exact: true});
    if (!(await radio.count())) return false;
    await radio.check();
    await sleep(500);
    return true;
}

function orcidField(modal) {
    return modal.locator('.pkpFormField').filter({hasText: 'ORCID iD'}).first();
}

/** The field as the screen shows it: its buttons (none when the form shows no ORCID iD field). */
async function fieldState(modal) {
    const f = orcidField(modal);
    if (!(await f.count())) return {shown: false};
    return {shown: true, buttons: (await f.getByRole('button').allInnerTexts().catch(() => [])).map((t) => flat(t, 80))};
}

/** The field's "Request verification", the question read and answered "Yes"; the requests it sent. */
async function requestVerification(page, modal) {
    const sent = [];
    const onR = (r) => { if (/\/orcid\/|\/contributors/.test(r.url()) && r.request().method() !== 'GET') sent.push(`${r.request().method()} ${r.url().replace(/^.*\/api\/v1\//, '')}`); };
    page.on('request', onR);
    await orcidField(modal).getByRole('button', {name: 'Request verification', exact: true}).click();
    const question = page.getByRole('dialog').filter({has: page.getByRole('button', {name: 'Yes', exact: true})}).last();
    await question.waitFor({timeout: T});
    const asked = flat(await question.innerText(), 300);
    await question.getByRole('button', {name: 'Yes', exact: true}).click();
    await sleep(1200);
    page.off('request', onR);
    return {asked, sent, field: await fieldState(modal)};
}

/** The organization's boxes: "Organization Name", "Country" "Canada", "Author" when asked. */
async function fillOrganization(modal, name) {
    await modal.locator('input[name="organizationName-en"]').fill(name);
    await modal.locator('select[name="country"]').selectOption({label: 'Canada'});
    await tickAuthor(modal);
}

async function fillPerson(modal, p) {
    await modal.locator('input[name="givenName-en"]').fill(p.givenName);
    await modal.locator('input[name="familyName-en"]').fill(p.familyName);
    await modal.locator('input[name="email"]').fill(p.email);
    await modal.locator('select[name="country"]').selectOption({label: 'Canada'});
    await tickAuthor(modal);
}

async function tickAuthor(modal) {
    const author = modal.getByRole('checkbox', {name: 'Author', exact: true});
    if ((await author.count()) && !(await author.first().isChecked())) await author.first().check();
}

/** The form's errors as shown: the page notice, each field's error, the foot list. */
async function formErrors(page, modal) {
    const s = await screen(page);
    const read = await modal.evaluate((el) => {
        const t = (n) => (n ? n.innerText.replace(/\s+/g, ' ').trim() : null);
        return {
            fieldErrors: [...el.querySelectorAll('.pkpFieldError')].map(t),
            foot: (t(el).match(/Please correct[^]*?(Jump to next error)/) || [null])[0],
        };
    }).catch((e) => ({error: flat(e.message, 200)}));
    return {notices: s.notices, ...read};
}

/** "Save": the POST it sent (type and orcid as sent), its answer, whether the form stayed open and what it shows. */
async function save(page, modal) {
    const btn = modal.getByRole('button', {name: 'Save', exact: true}).last();
    if (await btn.isDisabled().catch(() => false)) return {disabled: true};
    const answered = page.waitForResponse((r) => /\/contributors(\/\d+)?(\?|$)/.test(r.url()) && r.request().method() === 'POST', {timeout: T}).catch(() => null);
    await btn.click();
    const r = await answered;
    await sleep(1800);
    await idle(page);
    const out = {};
    if (r) {
        const body = new URLSearchParams(r.request().postData() || '');
        let json = null;
        try { json = JSON.parse(r.request().postData() || ''); } catch (e) { /* form encoded */ }
        out.sent = json ? {contributorType: json.contributorType, orcid: json.orcid} : {contributorType: body.get('contributorType'), orcid: body.get('orcid')};
        out.status = r.status();
        out.body = r.status() >= 400 ? flat(await r.text().catch(() => ''), 300) : undefined;
    }
    out.formOpen = await modal.getByRole('button', {name: 'Save', exact: true}).last().isVisible().catch(() => false);
    if (out.formOpen) out.errors = await formErrors(page, modal);
    return out;
}

/** Close the side window by its "Cancel"; any window that opens on it is recorded and answered. */
async function cancel(page, modal) {
    const btn = modal.getByRole('button', {name: 'Cancel', exact: true});
    if (await btn.count()) await btn.first().click().catch(() => {});
    await sleep(900);
    const confirm = page.getByRole('dialog').filter({has: page.getByRole('button', {name: /^(Yes|OK|Leave|Discard)/})}).last();
    let asked = null;
    if (await confirm.count()) {
        asked = flat(await confirm.innerText().catch(() => ''), 200);
        await confirm.getByRole('button', {name: /^(Yes|OK|Leave|Discard)/}).first().click().catch(() => {});
        await sleep(800);
    }
    return asked;
}

/** The submission's contributors as stored: id, type, email, the ORCID request flag. */
function storedContributors(app, c) {
    const type = sql(app, `select column_name from information_schema.columns where table_name = 'authors' and column_name = 'contributor_type'`) ? 'a.contributor_type' : `'-'`;
    return sql(app, `select a.author_id, ${type}, coalesce(a.email,'<null>'), coalesce((select string_agg(s.setting_name || '=' || s.setting_value, ',') from author_settings s where s.author_id = a.author_id and s.setting_name like 'orcid%'),'') from authors a join submissions sub on sub.current_publication_id = a.publication_id where sub.submission_id = ${c.id} order by a.author_id`).split('\n').filter(Boolean);
}

/** The jobs and failed jobs tables' newest ids, and the job names and failures since `from`. */
function jobsState(app, from = {job: 0, failed: 0}) {
    const job = Number(sql(app, 'select coalesce(max(id),0) from jobs') || 0);
    const failed = Number(sql(app, 'select coalesce(max(id),0) from failed_jobs') || 0);
    const queued = sql(app, `select substring(payload from '"displayName":"([^"]+)"') from jobs where id > ${from.job} order by id`).split('\n').filter(Boolean);
    const failures = sql(app, `select substring(exception from 1 for 220) from failed_jobs where id > ${from.failed} order by id`).split('\n').filter(Boolean);
    return {job, failed, queued, failures};
}

/** Mail to `to` since `since` whose links point at this install: the subjects. */
async function mailTo(app, to, since, waitMs = 12_000) {
    const origin = new URL(app.baseURL).origin;
    const deadline = Date.now() + waitMs;
    let found = [];
    do {
        const result = await app.mail._search({to, since});
        found = [];
        for (const m of result.messages || []) {
            const full = await app.mail.fullMessage(m.ID);
            if ((full.HTML || full.Text || '').includes(origin)) found.push(full.Subject);
        }
        if (found.length) break;
        await sleep(1000);
    } while (Date.now() < deadline);
    return found;
}

module.exports = {T, sleep, flat, CASES, setOrcidMember, openContributors, openAdd, setType, orcidField, fieldState, requestVerification, fillOrganization, fillPerson, tickAuthor, formErrors, save, cancel, storedContributors, jobsState, mailTo, shot};
