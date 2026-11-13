// Regression check — pkp/pkp-lib#13788 (issue pkp/pkp-lib#13459), `tools/repairRorAffiliations.php`,
// finding 1 of docs/reports/2026-11-13-pkp-lib-13788.md: the tool reads an organization contributor's
// own "ROR ID" (main's `rorId` author property) as the old ROR plugin's value and, with --commit,
// gives the organization an affiliation pointing at its own ROR.
//
// Steps: in a submission's workflow, Publication › "Contributors" › "Add Contributor", "Organization
// or group", "Organization Name" NSERC, "ROR ID" https://ror.org/01h531d29, "Save"; then the tool's
// dry run and `--commit`, as an administrator runs them from the app root; then the contributor as
// the REST API and the "Edit" panel show it. A dry run before the add is the control.
//
// Two kinds of fleet, each freshly reset:
//   - a dataset fleet (the report's Steps): as `dbarnes` on OJS submission 7 "Developing efficacy
//     beliefs in the classroom" (OMP/OPS: `rvaca` on submission 1). The dataset's registry copy is
//     complete; nothing is written by SQL.
//       npm run fleet-prep -- --feature <f> --dataset <n> --reset --apps ojs
//   - a campaign fleet: a scratch journal with its own manager and submission; NSERC is seeded
//     through the test API and the registry filled to the tool's 100000-row floor by SQL (lib.js),
//     deleted again at the end.
//   PROBE_FEATURE=<f> PROBE_AGENT=<id> node bin/probe.js ojs shared/playwright/checks/sync/pkp-lib-13788/org-ror.js
// `--commit` runs with `--exclude=` every other author the dry run lists as "repair", so on a shared
// fleet it changes only the organization this run added.
//
// Main only: 3.5 has no contributor types and no `rorId` author property. OMP and OPS once their
// lib/pkp pointer carries the tool.
//
// Reads fixed when: the dry run after the add lists no line for the organization (no "repair"), and
// `--commit` leaves its affiliations []. At c09ff30833: "To repair: 1" with the organization's line
// `repair,<id>,…,{},https://ror.org/01h531d29,[],[{"ror":"https://ror.org/01h531d29","name":{}}]`,
// and after --commit its affiliations hold that ROR, named "Natural Sciences and Engineering
// Research Council of Canada".
//
// Facts: org-ror-<app>.json; screenshots org-ror-added-<app>.png, org-ror-edit-after-<app>.png.
const {forEachApp, launch, signIn, idle, screen, shot, record, apiAs, sql, tag} = require('../../../probe');
const L = require('./lib');

const T = 30_000;
const DATASET = {ojs: ['dbarnes', 7], omp: ['rvaca', 1], ops: ['rvaca', 1]};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

forEachApp(async (app) => {
    const t = tag('r13788');
    const facts = {line: app.line, dataset: app.dataset};
    let username;
    let submissionId;
    if (app.dataset) {
        [username, submissionId] = DATASET[app.name];
    } else {
        await app.api.createContext({tag: t,
            users: [{username: `${t}mg`, givenName: 'Mona', familyName: 'Manager', email: `${t}mg@mail.test`, roles: ['manager']},
                {username: `${t}au`, givenName: 'Ada', familyName: 'Author', email: `${t}au@mail.test`, roles: ['author']}]});
        const S = await app.api.createSubmission({tag: `${t}s`, context: t, submitter: `${t}au`, title: `Org ROR ${t}`});
        username = `${t}mg`;
        submissionId = S.submissionId;
    }
    const contextPath = app.dataset ? app.contextPath : t;
    const reg = await L.registry(app, t);
    facts.registry = {seeded: reg.seeded, fillers: reg.fillers, rors: Number(sql(app, 'select count(*) from rors'))};
    const {page, close} = await launch(app);
    try {
        facts.dryBefore = L.runTool(app);

        await signIn(page, username, app.dataset ? {password: `${username}${username}`, contextPath} : {contextPath});
        await page.goto(app.url(`/index.php/${contextPath}/en/dashboard/editorial?workflowSubmissionId=${submissionId}`));
        await idle(page);
        await page.getByRole('link', {name: 'Contributors', exact: true}).first().click();
        await page.getByRole('button', {name: 'Add Contributor'}).first().click();
        const dlg = page.getByRole('dialog', {name: 'Add Contributor', exact: true});
        await dlg.getByRole('radio', {name: 'Organization or group', exact: true}).check();
        await sleep(300);
        await dlg.locator('input[name="organizationName-en"]').fill('NSERC');
        await dlg.locator('input[name="email"]').fill(`${t}-nserc@mailinator.com`);
        await dlg.locator('select[name="country"]').selectOption({label: 'Canada'});
        await dlg.locator('input[name="rorId"]').fill(L.ROR);
        const role = dlg.getByRole('checkbox', {name: 'Author', exact: true});
        if ((await role.count()) && !(await role.isChecked())) await role.check();
        const answer = page.waitForResponse((r) => /\/contributors(\?|$)/.test(r.url()) && r.request().method() === 'POST', {timeout: T});
        await dlg.getByRole('button', {name: 'Save', exact: true}).click();
        const r = await answer;
        const added = await r.json();
        await sleep(1500);
        await idle(page);
        facts.add = {status: r.status(), id: added.id, contributorType: added.contributorType, rorId: added.rorId, affiliations: added.affiliations};
        await shot(page, 'org-ror-added');
        const orgId = Number(added.id);
        const publicationId = Number(sql(app, `select publication_id from authors where author_id = ${orgId}`));
        const read = async () => {
            const a = await (await apiAs(page, 'GET', `submissions/${submissionId}/publications/${publicationId}/contributors/${orgId}`)).json();
            return {contributorType: a.contributorType, rorId: a.rorId, affiliations: (a.affiliations || []).map((x) => ({ror: x.ror, name: x.name}))};
        };
        facts.before = {api: await read(), settings: sql(app, `select setting_name, coalesce(locale, ''), setting_value from author_settings where author_id = ${orgId} and setting_name in ('rorId', 'affiliation')`), stored: L.affiliations(app, orgId)};

        const dry = L.runTool(app);
        facts.dry = {code: dry.code, out: dry.out, csvFile: dry.csvFile, mine: dry.rows.filter((x) => Number(x.author_id) === orgId), others: dry.rows.filter((x) => Number(x.author_id) !== orgId).map((x) => `${x.action}:${x.author_id}`)};
        const exclude = dry.rows.filter((x) => x.action === 'repair' && Number(x.author_id) !== orgId).map((x) => x.author_id);
        const commit = L.runTool(app, ['--commit', ...(exclude.length ? [`--exclude=${exclude.join(',')}`] : [])]);
        facts.commit = {args: commit.args, code: commit.code, out: commit.out, mine: commit.rows.filter((x) => Number(x.author_id) === orgId)};
        facts.after = {api: await read(), stored: L.affiliations(app, orgId)};

        // The contributor's "Edit" panel after the repair.
        await page.goto(app.url(`/index.php/${contextPath}/en/dashboard/editorial?workflowSubmissionId=${submissionId}`));
        await idle(page);
        await page.getByRole('link', {name: 'Contributors', exact: true}).first().click();
        const row = page.locator('.listPanel--contributor li.listPanel__item').filter({hasText: 'NSERC'}).first();
        await row.getByRole('button', {name: 'Edit', exact: true}).click();
        const edit = page.getByRole('dialog', {name: 'Edit', exact: true});
        await edit.waitFor({timeout: T});
        await sleep(1000);
        const text = (await edit.innerText()).replace(/\s+/g, ' ');
        const at = text.indexOf('Affiliations');
        facts.editPanel = {affiliations: at < 0 ? null : text.slice(at, at + 400)};
        await edit.getByText('Affiliations', {exact: true}).first().scrollIntoViewIfNeeded().catch(() => {});
        await shot(page, 'org-ror-edit-after');
        facts.editScreen = (await screen(page)).notices;
    } finally {
        facts.fillersDeleted = reg.cleanup();
        record('org-ror', facts);
        await close();
    }
    console.log(JSON.stringify({dryBefore: facts.dryBefore && facts.dryBefore.out, add: facts.add, before: facts.before, dry: facts.dry, commit: facts.commit && facts.commit.out, after: facts.after, editPanel: facts.editPanel, fillersDeleted: facts.fillersDeleted}, null, 1));
});
