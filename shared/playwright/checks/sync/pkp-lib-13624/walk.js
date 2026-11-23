// PR review — pkp/pkp-lib#13624 + pkp/ui-library#1055 (+ ojs#5986, jatsTemplate#128) for issue
// pkp/pkp-lib#11972 "Make author email optional for organizations and anonymous contributors".
//
// What it drives, on a scratch journal (campaign fleet) with ORCID switched on through the
// context's settings rows:
//   form  Publication › Contributors › "Add Contributor": per type (Person, Organization or
//         group, Anonymous) whether Email and Country carry the "*" marker and the HTML
//         `required` attribute; an Organization saved with no email; a Person refused.
//   api   POST/PUT …/contributors and the ORCID endpoints: organization/anonymous/person
//         without an email; `orcid: shouldRequestVerification` for an organization;
//         requestAuthorVerification for an organization and for a person with no email;
//         a person with an ORCID switched to Organization, before and after deleteForAuthor.
//   off   the same switch with ORCID functionality OFF for the journal: the person keeps an
//         ORCID (as one imported or verified while ORCID was on), the type switch is refused,
//         and deleteForAuthor answers 403, so the form and the API offer no way out.
//
//   npm run fleet-prep -- --feature sync --apps ojs
//   PROBE_FEATURE=sync PROBE_AGENT=r13624 node bin/probe.js ojs shared/playwright/checks/sync/pkp-lib-13624/walk.js
//
// Facts: walk-<app>.json; screenshots walk-*-<app>.png.
const {forEachApp, launch, signIn, idle, screen, shot, record, apiAs, sql, tag} = require('../../../probe');

const T = 30_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ORCID = 'https://sandbox.orcid.org/0000-0002-1825-0097';

function seedOrcid(app, authorId) {
    sql(app, `INSERT INTO author_settings (author_id, locale, setting_name, setting_value) VALUES
        (${authorId}, '', 'orcid', '${ORCID}'), (${authorId}, '', 'orcidIsVerified', '1'),
        (${authorId}, '', 'orcidAccessToken', '00000000-1111-2222-3333-444444444444'),
        (${authorId}, '', 'orcidAccessScope', '/activities/update'),
        (${authorId}, '', 'orcidAccessExpiresOn', '2046-10-01 00:00:00')`);
}

function setOrcid(app, contextId, on) {
    const {settings, id} = app.contextTables;
    sql(app, `DELETE FROM ${settings} WHERE ${id} = ${contextId} AND setting_name IN ('orcidEnabled','orcidApiType','orcidClientId','orcidClientSecret')`);
    if (on) {
        sql(app, `INSERT INTO ${settings} (${id}, locale, setting_name, setting_value) VALUES
            (${contextId}, '', 'orcidEnabled', '1'), (${contextId}, '', 'orcidApiType', 'memberSandbox'),
            (${contextId}, '', 'orcidClientId', 'APP-0000000000000000'),
            (${contextId}, '', 'orcidClientSecret', '00000000-0000-0000-0000-000000000000')`);
    }
}

async function markers(dialog) {
    const out = {};
    for (const name of ['email', 'country']) {
        const field = dialog.locator(`[name="${name}"]`).first();
        out[name] = {
            star: await field.evaluate((el) => {
                let n = el;
                while (n && !n.querySelector('.pkpFormFieldLabel')) n = n.parentElement;
                return n ? n.querySelectorAll('.pkpFormFieldLabel__required').length : -1;
            }),
            required: await field.getAttribute('required'),
        };
    }
    out.orcidField = await dialog.getByText('ORCID iD', {exact: false}).count();
    return out;
}

forEachApp(async (app) => {
    const t = tag('r13624');
    const facts = {line: app.line};
    await app.api.createContext({tag: t,
        users: [{username: `${t}mg`, givenName: 'Mona', familyName: 'Manager', email: `${t}mg@mail.test`, roles: ['manager']},
            {username: `${t}au`, givenName: 'Ada', familyName: 'Author', email: `${t}au@mail.test`, roles: ['author']}]});
    const S = await app.api.createSubmission({tag: `${t}s`, context: t, submitter: `${t}au`, title: `Email optional ${t}`});
    const sid = S.submissionId;
    const contextId = Number(sql(app, `select ${app.contextTables.id} from ${app.contextTables.table} where path = '${t}'`));
    const pid = Number(sql(app, `select current_publication_id from submissions where submission_id = ${sid}`));
    setOrcid(app, contextId, true);
    const base = `submissions/${sid}/publications/${pid}/contributors`;
    const {page, close} = await launch(app);
    try {
        await signIn(page, `${t}mg`, {contextPath: t});
        await page.goto(app.url(`/index.php/${t}/en/dashboard/editorial?workflowSubmissionId=${sid}`));
        await idle(page);
        const list = await (await apiAs(page, 'GET', base)).json();
        const first = (list.items || list)[0];
        const roles = (first.contributorRoles || []).map((r) => r.id);
        facts.roles = roles;

        // ---- form
        await page.getByRole('link', {name: 'Contributors', exact: true}).first().click();
        await page.getByRole('button', {name: 'Add Contributor'}).first().click();
        const dlg = page.getByRole('dialog', {name: 'Add Contributor', exact: true});
        await dlg.waitFor({timeout: T});
        facts.form = {};
        for (const type of ['Person', 'Organization or group', 'Anonymous']) {
            await dlg.getByRole('radio', {name: type, exact: true}).check();
            await sleep(400);
            facts.form[type] = await markers(dlg);
            await shot(page, `walk-form-${type.split(' ')[0].toLowerCase()}`);
        }
        await dlg.getByRole('radio', {name: 'Organization or group', exact: true}).check();
        await sleep(300);
        await dlg.locator('input[name="organizationName-en"]').fill('Org Without Email');
        await dlg.locator('select[name="country"]').selectOption({label: 'Canada'});
        const role = dlg.getByRole('checkbox', {name: 'Author', exact: true});
        if ((await role.count()) && !(await role.isChecked())) await role.check();
        const answer = page.waitForResponse((r) => /\/contributors(\?|$)/.test(r.url()) && r.request().method() === 'POST', {timeout: T});
        await dlg.getByRole('button', {name: 'Save', exact: true}).click();
        const r = await answer;
        const added = await r.json().catch(() => null);
        facts.form.orgSave = {status: r.status(), email: added && added.email, type: added && added.contributorType};
        await sleep(1000);
        facts.form.orgSaveScreen = (await screen(page)).notices;

        // ---- api
        const post = async (body) => {
            const res = await apiAs(page, 'POST', base, {contributorRoles: roles, ...body});
            const j = await res.json().catch(() => null);
            return {status: res.status(), body: res.status() === 200 ? {id: j.id, email: j.email, type: j.contributorType, orcid: j.orcid} : j};
        };
        facts.api = {};
        facts.api.orgNoEmail = await post({contributorType: 'ORGANIZATION', organizationName: {en: 'Org API'}, country: 'CA'});
        facts.api.anonNoEmail = await post({contributorType: 'ANONYMOUS'});
        facts.api.personNoEmail = await post({contributorType: 'PERSON', givenName: {en: 'Pat'}, familyName: {en: 'NoMail'}, country: 'CA'});
        facts.api.orgOrcidRequest = await post({contributorType: 'ORGANIZATION', organizationName: {en: 'Org ORCID'}, country: 'CA', email: `${t}org@mail.test`, orcid: 'shouldRequestVerification'});
        facts.api.personOrcidRequest = await post({contributorType: 'PERSON', givenName: {en: 'Pia'}, familyName: {en: 'Request'}, country: 'CA', email: `${t}pia@mail.test`, orcid: 'shouldRequestVerification'});
        const orcidReq = async (id) => {
            const res = await apiAs(page, 'POST', `orcid/requestAuthorVerification/${id}`);
            return {status: res.status(), body: await res.json().catch(() => null)};
        };
        facts.api.verifyOrg = await orcidReq(facts.api.orgNoEmail.body.id);
        // A person with no email can exist only through data that skipped the checks.
        const person = await post({contributorType: 'PERSON', givenName: {en: 'Pol'}, familyName: {en: 'Later'}, country: 'CA', email: `${t}pol@mail.test`});
        sql(app, `update authors set email = null where author_id = ${person.body.id}`);
        facts.api.verifyPersonNoEmail = await orcidReq(person.body.id);

        // Person with ORCID → Organization.
        const pers = await post({contributorType: 'PERSON', givenName: {en: 'Oli'}, familyName: {en: 'Orcid'}, country: 'CA', email: `${t}oli@mail.test`});
        seedOrcid(app, pers.body.id);
        const toOrg = {contributorType: 'ORGANIZATION', organizationName: {en: 'Oli Org'}, country: 'CA', email: `${t}oli@mail.test`, contributorRoles: roles};
        const put = async (id, body) => {
            const res = await apiAs(page, 'PUT', `${base}/${id}`, body);
            const j = await res.json().catch(() => null);
            return {status: res.status(), body: res.status() === 200 ? {type: j.contributorType, orcid: j.orcid} : j};
        };
        facts.api.switchWithOrcid = await put(pers.body.id, toOrg);
        const del = await apiAs(page, 'POST', `orcid/deleteForAuthor/${pers.body.id}`);
        facts.api.deleteOrcid = {status: del.status(), body: await del.json().catch(() => null)};
        facts.api.switchAfterDelete = await put(pers.body.id, toOrg);

        // Same in the form, ORCID on: Edit the person, pick Organization, Save.
        const pers2 = await post({contributorType: 'PERSON', givenName: {en: 'Ona'}, familyName: {en: 'Formorcid'}, country: 'CA', email: `${t}ona@mail.test`});
        seedOrcid(app, pers2.body.id);
        const formSwitch = async (label, name) => {
            await page.goto(app.url(`/index.php/${t}/en/dashboard/editorial?workflowSubmissionId=${sid}`));
            await idle(page);
            await page.getByRole('link', {name: 'Contributors', exact: true}).first().click();
            const row = page.locator('.listPanel--contributor li.listPanel__item').filter({hasText: name}).first();
            await row.getByRole('button', {name: 'Edit', exact: true}).click();
            const edit = page.getByRole('dialog', {name: 'Edit', exact: true});
            await edit.waitFor({timeout: T});
            await sleep(800);
            const before = {orcidField: await edit.getByText(/ORCID/).count(), text: (await edit.innerText()).replace(/\s+/g, ' ').match(/ORCID[^.]{0,120}/g)};
            await edit.getByRole('radio', {name: 'Organization or group', exact: true}).check();
            await sleep(300);
            await edit.locator('input[name="organizationName-en"]').fill(`${name} Org`);
            const ans = page.waitForResponse((x) => /\/contributors\/\d+/.test(x.url()) && ['PUT', 'POST'].includes(x.request().method()), {timeout: 15_000}).catch(() => null);
            await edit.getByRole('button', {name: 'Save', exact: true}).click();
            const x = await ans;
            await sleep(1000);
            const text = (await edit.innerText().catch(() => '')).replace(/\s+/g, ' ');
            const out = {before, status: x && x.status(), body: x && await x.json().catch(() => null), notices: (await screen(page)).notices,
                tail: text.slice(-600),
                shown: text.match(/[^.]*ORCID iD[^.]*\./g), errorsShown: text.match(/Please correct[^.]*\./g)};
            await shot(page, `walk-${label}`);
            return out;
        };
        facts.formSwitchOrcidOn = await formSwitch('switch-orcid-on', 'Formorcid');

        // ---- ORCID off for the journal: the person keeps the iD.
        const pers3 = await post({contributorType: 'PERSON', givenName: {en: 'Ida'}, familyName: {en: 'Offorcid'}, country: 'CA', email: `${t}ida@mail.test`});
        seedOrcid(app, pers3.body.id);
        setOrcid(app, contextId, false);
        facts.off = {};
        facts.off.formSwitch = await formSwitch('switch-orcid-off', 'Offorcid');
        facts.off.apiSwitch = await put(pers3.body.id, {...toOrg, organizationName: {en: 'Ida Org'}, email: `${t}ida@mail.test`});
        const del3 = await apiAs(page, 'POST', `orcid/deleteForAuthor/${pers3.body.id}`);
        facts.off.deleteOrcid = {status: del3.status(), body: await del3.json().catch(() => null)};
        facts.off.stored = sql(app, `select setting_name, setting_value from author_settings where author_id = ${pers3.body.id} and setting_name like 'orcid%' order by 1`);
        facts.off.publicOrcidShown = null;
    } finally {
        record('walk', facts);
        await close();
    }
    console.log(JSON.stringify(facts, null, 1));
});
