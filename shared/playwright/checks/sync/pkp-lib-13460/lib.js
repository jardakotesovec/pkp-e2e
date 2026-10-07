// Shared steps of the pkp/pkp-lib#13460 checks (issue pkp/pkp-lib#13447): a scratch context with
// DOIs on, the "Immediately" creation time chosen on screen, decisions recorded on screen, and the
// DOI rows of a submission read from the database.
const {signIn, idle, settled, sql} = require('../../../probe');
const {DoiSettings} = require('../../../pages/DoisPages.js');
const {WorkflowPage} = require('../../../pages/WorkflowPage.js');

const IMMEDIATELY = /^Immediately, when an item is created/;

/** Every DOI kind the app offers on the "Items with DOIs" group. */
const KINDS = {
    ojs: ['publication', 'representation'],
    omp: ['publication', 'chapter', 'representation', 'file'],
    ops: ['publication', 'representation'],
};

/** A scratch context with DOIs on (prefix 10.1234, default suffix), a manager and an author. */
async function scratchContext(app, t) {
    const stage = app.name === 'ops' ? 'production' : 'copyediting';
    await app.api.createContext({
        tag: t,
        users: [{username: `${t}mgr`, roles: ['manager']}, {username: `${t}au`, roles: ['author']}],
        enableDois: true, doiPrefix: '10.1234', enabledDoiTypes: KINDS[app.name],
        doiCreationTime: stage, doiSuffixType: 'default',
    });
    return {mgr: `${t}mgr`, au: `${t}au`};
}

/** As the signed-in manager: Settings > Distribution > DOIs > Setup, "Immediately…", Save. Returns the option read back. */
async function chooseImmediately(page, t) {
    const settings = new DoiSettings(page, t);
    await settings.goto('Setup');
    const options = await settings.creationTimeOptions();
    const label = options.find((o) => IMMEDIATELY.test(o));
    if (!label) return {options, saved: null};
    await settings.creationTimeSelect().selectOption({label});
    await settings.setup.getByRole('button', {name: 'Save', exact: true}).click();
    await idle(page);
    await page.waitForTimeout(1500);
    await settings.goto('Setup');
    return {options, saved: await settings.creationTimeShown()};
}

/** Open the submission's workflow, press the decision button and record it (emails as they arrive). */
async function recordDecision(page, t, submissionId, button) {
    await new WorkflowPage(page, t).gotoEditorial(submissionId);
    await idle(page);
    const actions = page.locator('[data-cy="workflow-action-items"]');
    if (!(await actions.getByRole('button').count())) {
        // A declined preprint opens on its publication pages: go to the stage first.
        const stage = page.getByRole('link', {name: 'Production', exact: true}).first();
        if (await stage.count()) {
            await stage.click();
            await idle(page);
        }
    }
    const offered = await actions.getByRole('button').allInnerTexts();
    const btn = actions.getByRole('button', {name: button, exact: true}).first();
    if (!(await btn.count())) return {offered, recorded: false};
    await btn.click();
    await idle(page);
    for (let i = 0; i < 8; i++) {
        const rec = page.getByRole('button', {name: 'Record Decision', exact: true});
        if (await rec.isVisible().catch(() => false)) {
            await settled(page, page.getByRole('textbox', {name: 'Subject'}).first()).catch(() => {});
            await rec.click();
            await idle(page);
            await page.waitForTimeout(2500);
            return {offered, recorded: true};
        }
        const cont = page.getByRole('button', {name: /^(Continue|Skip this email)$/}).first();
        if (await cont.isVisible().catch(() => false)) {
            await settled(page, page.getByRole('textbox', {name: 'Subject'}).first()).catch(() => {});
            await cont.click();
            await idle(page);
        } else await page.waitForTimeout(1000);
    }
    return {offered, recorded: false};
}

/** The submission's status and stage, and every publication's status, stage, DOI and its status. */
function pubRows(app, id) {
    return {
        submission: String(sql(app, `select status, stage_id from submissions where submission_id=${id}`)).trim(),
        publications: String(sql(app, `select p.publication_id, p.status, coalesce(p.version_stage,''), coalesce(d.doi,'-'), coalesce(d.status::text,'-')
            from publications p left join dois d on d.doi_id=p.doi_id where p.submission_id=${id} order by 1`)).trim().split('\n'),
    };
}

/** The submission id from a createSubmission answer. */
const sid = (r) => r.submissionId || r.id || (r.submission && r.submission.id);

module.exports = {KINDS, scratchContext, chooseImmediately, recordDecision, pubRows, sid, signIn};
