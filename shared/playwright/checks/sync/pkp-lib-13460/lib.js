// Shared steps of the pkp/pkp-lib#13460 checks (issue pkp/pkp-lib#13447): a scratch context with
// DOIs on, the "Immediately" creation time chosen on screen, decisions recorded on screen, a new
// version created and published on screen, and the DOI rows of a submission read from the database.
const {expect} = require('@playwright/test');
const {signIn, idle, settled, sql} = require('../../../probe');
const {DoiSettings} = require('../../../pages/DoisPages.js');
const {WorkflowPage} = require('../../../pages/WorkflowPage.js');

const IMMEDIATELY = /^Immediately, when an item is created/;
const T = 30_000;

/** Every DOI kind the app offers on the "Items with DOIs" group. */
const KINDS = {
    ojs: ['publication', 'representation'],
    omp: ['publication', 'chapter', 'representation', 'file'],
    ops: ['publication', 'representation'],
};

/**
 * A scratch context with DOIs on (prefix 10.1234, default suffix, "Upon reaching the copyediting
 * stage", on a server "production"), a manager and an author. `extra` adds context settings
 * (`{enabledDoiTypes, doiVersioning}`).
 */
async function scratchContext(app, t, extra = {}) {
    const stage = app.name === 'ops' ? 'production' : 'copyediting';
    await app.api.createContext({
        tag: t,
        users: [{username: `${t}mgr`, roles: ['manager']}, {username: `${t}au`, roles: ['author']}],
        enableDois: true, doiPrefix: '10.1234', enabledDoiTypes: KINDS[app.name],
        doiCreationTime: stage, doiSuffixType: 'default',
        ...extra,
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

/**
 * Every version of the submission: its stage and number, whether published, its DOI and that DOI's
 * status, and its galleys' (a press: formats') DOIs with theirs.
 */
const STATUS = {0: 'none', 1: 'Unregistered', 2: 'Submitted', 3: 'Registered', 4: 'Error', 5: 'Needs Sync'};
function versionRows(app, id) {
    const files = app.name === 'omp' ? 'publication_formats' : 'publication_galleys';
    return String(sql(app, `select p.publication_id, p.version_stage||' '||p.version_major||'.'||p.version_minor, p.status, coalesce(d.doi,'-'), coalesce(d.status,0),
        (select string_agg(coalesce(gd.doi,'-')||':'||coalesce(gd.status,0), ',') from ${files} g left join dois gd on gd.doi_id=g.doi_id where g.publication_id=p.publication_id)
        from publications p left join dois d on d.doi_id=p.doi_id where p.submission_id=${id} order by 1`))
        .split('\n').filter(Boolean).map((l) => {
            const [pid, version, st, doi, ds, g] = l.split('|');
            return {id: Number(pid), version, published: Number(st) === 3, doi, status: STATUS[ds] || ds,
                files: (g || '').replace(/:(\d)/g, (m, x) => `:${STATUS[x]}`)};
        });
}

/** "Create New Version" on the open workflow with the "Revision Significance" `significance`; {status, id, version}. */
async function createVersion(page, frame, significance) {
    const item = await frame.revealPublicationEntry('Create New Version');
    await frame.expectVersionLoaded().catch(() => {});
    await item.click();
    const dialog = page.getByRole('dialog').filter({has: page.locator('select[name="versionIsMinor"]')}).last();
    await expect(dialog.locator('select[name="versionIsMinor"]')).toBeVisible({timeout: T});
    await dialog.getByLabel('Revision Significance').selectOption({label: significance});
    const created = page.waitForResponse((r) => /\/publications\/\d+\/version/.test(r.url()) && r.request().method() === 'POST', {timeout: T});
    await dialog.getByRole('button', {name: 'Confirm', exact: true}).click();
    const r = await created;
    const out = {status: r.status()};
    if (r.ok()) {
        const j = await r.json();
        Object.assign(out, {id: j.id, version: `${j.versionStage} ${j.versionMajor}.${j.versionMinor}`});
    }
    await expect(dialog).toHaveCount(0, {timeout: T});
    return out;
}

/**
 * Open the newest version's "Title & Abstract", press "Publish" / "Post" and confirm (a journal goes
 * through "Review Publishing Details" first, `ojsScreen`). Returns the publish answer's status.
 */
async function publishLatest(page, frame, label, ojsScreen = null) {
    const pages = frame.menuLink('Title & Abstract');
    await expect(frame.latestVersionNode()).toBeVisible({timeout: T});
    if (!(await pages.last().isVisible().catch(() => false))) await frame.latestVersionNode().click();
    await expect(pages.last()).toBeVisible({timeout: T});
    await pages.last().click();
    await frame.expectVersionLoaded().catch(() => {});
    const confirm = page.getByRole('dialog').filter({hasText: /Are you sure you want to (post this|publish this|schedule this|make this catalog entry public)/}).last();
    if (ojsScreen) {
        const panel = await ojsScreen.pressPublish({or: confirm});
        if (panel) await panel.getByRole('button', {name: 'Confirm', exact: true}).click();
    } else {
        const button = page.getByRole('button', {name: label, exact: true}).first();
        await expect(button).toBeVisible({timeout: T});
        await button.click();
    }
    await expect(confirm).toBeVisible({timeout: T});
    const published = page.waitForResponse((r) => /\/publications\/\d+\/publish/.test(r.url()) && r.request().method() !== 'GET', {timeout: T});
    await confirm.getByRole('button', {name: label, exact: true}).last().click();
    const r = await published;
    await expect(page.getByRole('button', {name: label === 'Post' ? 'Unpost' : 'Unpublish', exact: true}).first()).toBeVisible({timeout: T});
    return r.status();
}

/** On the DOIs page: the "View all" window's blocks, [{heading, rows: [{type, doi, badge}]}], or null when not offered. */
async function readVersionsWindow(dois, id) {
    const row = dois.row(id);
    await dois.expand(row, id);
    if (!(await dois.viewAllButton(row).count())) return null;
    await dois.openVersionsWindow(row);
    const blocks = await dois.versionsWindow().locator('.doiListItem__versionContainer').evaluateAll((cs) => cs.map((c) => ({
        heading: (c.querySelector(':scope > a')?.textContent || '').replace(/\s+/g, ' ').trim(),
        rows: [...c.querySelectorAll('tbody tr')].map((tr) => ({
            type: (tr.querySelector('td label')?.textContent || '').replace(/\s+/g, ' ').trim(),
            doi: tr.querySelector('input[type="text"]')?.value ?? null,
            badge: (tr.querySelector('.doiListItem__itemMetadata--badge')?.textContent || '').replace(/\s+/g, ' ').trim(),
        })),
    })));
    await dois.closeVersionsWindow();
    return blocks;
}

/** The submission id from a createSubmission answer. */
const sid = (r) => r.submissionId || r.id || (r.submission && r.submission.id);

module.exports = {KINDS, scratchContext, chooseImmediately, recordDecision, pubRows, versionRows, createVersion, publishLatest, readVersionsWindow, sid, signIn};
