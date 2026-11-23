// PR review pkp/pkp-lib#13624, item 2 (regression reader rr13624 S1): an Organization / Anonymous contributor that already carries an ORCID (base-era data)
// edited with its type unchanged, through the form and the API, ORCID off and on.
//   PROBE_FEATURE=sync PROBE_AGENT=r13624 node bin/probe.js ojs shared/playwright/checks/sync/pkp-lib-13624/same-type.js
// Reads fixed when: apiOff.orgSameType and anonSameType answer 200 and the form saves both.
const {forEachApp, launch, signIn, idle, screen, shot, record, apiAs, sql, tag} = require('../../../probe');

const T = 30_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ORCID = 'https://sandbox.orcid.org/0000-0002-1825-0097';

function seedOrcid(app, id) {
    sql(app, `INSERT INTO author_settings (author_id, locale, setting_name, setting_value) VALUES
        (${id}, '', 'orcid', '${ORCID}'), (${id}, '', 'orcidIsVerified', '1')`);
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

forEachApp(async (app) => {
    const t = tag('rr624');
    const facts = {line: app.line};
    await app.api.createContext({tag: t,
        users: [{username: `${t}mg`, givenName: 'Mona', familyName: 'Manager', email: `${t}mg@mail.test`, roles: ['manager']},
            {username: `${t}au`, givenName: 'Ada', familyName: 'Author', email: `${t}au@mail.test`, roles: ['author']}]});
    const S = await app.api.createSubmission({tag: `${t}s`, context: t, submitter: `${t}au`, title: `Legacy ORCID ${t}`});
    const sid = S.submissionId;
    const contextId = Number(sql(app, `select ${app.contextTables.id} from ${app.contextTables.table} where path = '${t}'`));
    const pid = Number(sql(app, `select current_publication_id from submissions where submission_id = ${sid}`));
    const base = `submissions/${sid}/publications/${pid}/contributors`;
    const {page, close} = await launch(app);
    try {
        await signIn(page, `${t}mg`, {contextPath: t});
        const wf = app.url(`/index.php/${t}/en/dashboard/editorial?workflowSubmissionId=${sid}`);
        await page.goto(wf);
        await idle(page);
        const list = await (await apiAs(page, 'GET', base)).json();
        const roles = ((list.items || list)[0].contributorRoles || []).map((r) => r.id);
        const post = async (body) => {
            const res = await apiAs(page, 'POST', base, {contributorRoles: roles, ...body});
            const j = await res.json().catch(() => null);
            return {status: res.status(), id: j && j.id, body: res.status() === 200 ? undefined : j};
        };
        const put = async (id, body) => {
            const res = await apiAs(page, 'PUT', `${base}/${id}`, {contributorRoles: roles, ...body});
            const j = await res.json().catch(() => null);
            return {status: res.status(), body: res.status() === 200 ? {type: j.contributorType, name: j.organizationName, country: j.country, orcid: j.orcid} : j};
        };
        const org = await post({contributorType: 'ORGANIZATION', organizationName: {en: 'Legacy Org'}, country: 'CA', email: `${t}org@mail.test`});
        const anon = await post({contributorType: 'ANONYMOUS', country: 'CA'});
        const ctl = await post({contributorType: 'ORGANIZATION', organizationName: {en: 'Control Org'}, country: 'CA'});
        facts.created = {org, anon, ctl};
        seedOrcid(app, org.id);
        seedOrcid(app, anon.id);

        // API, ORCID off (scratch default): same type, only the name / country changes.
        facts.apiOff = {
            orgSameType: await put(org.id, {contributorType: 'ORGANIZATION', organizationName: {en: 'Legacy Org renamed'}, country: 'CA', email: `${t}org@mail.test`}),
            anonSameType: await put(anon.id, {contributorType: 'ANONYMOUS', country: 'DE'}),
            controlNoOrcid: await put(ctl.id, {contributorType: 'ORGANIZATION', organizationName: {en: 'Control Org renamed'}, country: 'CA'}),
        };

        const formEdit = async (label, rowText, change) => {
            await page.goto(wf);
            await idle(page);
            await page.getByRole('link', {name: 'Contributors', exact: true}).first().click();
            const row = page.locator('.listPanel--contributor li.listPanel__item').filter({hasText: rowText}).first();
            await row.getByRole('button', {name: 'Edit', exact: true}).click();
            const edit = page.getByRole('dialog', {name: 'Edit', exact: true});
            await edit.waitFor({timeout: T});
            await sleep(800);
            const orcidShown = await edit.getByText(/ORCID/).count();
            await change(edit);
            const ans = page.waitForResponse((x) => /\/contributors\/\d+/.test(x.url()) && x.request().method() === 'PUT', {timeout: 15_000}).catch(() => null);
            await edit.getByRole('button', {name: 'Save', exact: true}).click();
            const x = await ans;
            await sleep(1000);
            const text = (await edit.innerText().catch(() => '')).replace(/\s+/g, ' ');
            const out = {orcidShown, sentType: x && JSON.parse(x.request().postData() || '{}').contributorType,
                status: x && x.status(), body: x && await x.json().catch(() => null),
                notices: (await screen(page)).notices, shown: text.match(/[^.]*ORCID iD[^.]*\./g)};
            await shot(page, `same-type-${label}`);
            return out;
        };
        const retitle = (v) => async (edit) => edit.locator('input[name="organizationName-en"]').fill(v);
        const recountry = (label) => async (edit) => edit.locator('select[name="country"]').selectOption({label});

        facts.formOff = {org: await formEdit('form-org-orcid-off', 'Legacy Org', retitle('Legacy Org form edit'))};

        setOrcid(app, contextId, true);
        facts.formOn = {
            org: await formEdit('form-org-orcid-on', 'Legacy Org', retitle('Legacy Org form edit on')),
            anon: await formEdit('form-anon-orcid-on', 'Anonymous', recountry('France')),
            control: await formEdit('form-control-orcid-on', 'Control Org', retitle('Control Org form edit')),
        };
        facts.stored = sql(app, `select a.author_id, a.contributor_type, s.setting_value from authors a left join author_settings s on s.author_id = a.author_id and s.locale = 'en' and s.setting_name = 'organizationName' where a.publication_id = ${pid} order by 1`);
    } finally {
        record('same-type', facts);
        await close();
    }
    console.log(JSON.stringify(facts, null, 1));
});
