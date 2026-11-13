// Helpers of walk.js (issue report docs/issues/U54-A15-role-save-stops-editing-published-submissions.md).
// Requiring this file runs nothing. Every helper drives a screen a person uses; `stored()` only reads
// the database, for Evidence.
const {idle, sql, screen} = require('../../../probe');

const T = 30_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (s, n = 400) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));
const ABSTRACT = 'titleAbstract-abstract-control-en';

/**
 * Per app, on PKP's default test dataset: the published (Done) submission, the editor-level role
 * assigned to it and who holds it, the author whose edit is walked (OJS: its latest version, 1.1, is
 * unpublished; an author cannot edit a published version), and whether the steps first assign the
 * editor (OMP, where no series editor is assigned to a published book).
 */
const CASES = {
    ojs: {id: 1, editorRole: 'Section editor', editor: 'dbuskins', author: 'amwandenga', assign: null},
    omp: {id: 14, editorRole: 'Series editor', editor: 'dbuskins', author: null, assign: {role: 'Series editor', name: 'David Buskins'}},
    ops: {id: 2, editorRole: 'Moderator', editor: 'dbuskins', author: null, assign: null},
};

/** A role's stored stages (`user_group_stage`), by its English name. */
function stored(app, name) {
    return sql(
        app,
        `select coalesce(string_agg(us.stage_id::text, ',' order by us.stage_id), '') from user_groups ug join user_group_settings s on s.user_group_id = ug.user_group_id and s.setting_name = 'name' and s.locale = 'en' left join user_group_stage us on us.user_group_id = ug.user_group_id where s.setting_value = '${name.replace(/'/g, "''")}' group by ug.user_group_id`
    ).trim();
}

/** Settings › Users & Roles › "Roles", opened, its stage columns read from the list's headings. */
async function rolesTab(page, app) {
    const {RolesTab} = require('../../../pages/RolesConfigurationPages.js');
    const tab = new RolesTab(page, app.contextPath, {stages: []});
    await tab.goto();
    tab.stages = (await tab.columns()).slice(2);
    return tab;
}

/** A row's stage boxes: the stages ticked, and whether every box is greyed. */
async function row(tab, name) {
    const states = await tab.boxStates(name);
    return {
        ticked: Object.entries(states).filter(([, s]) => s && s.checked).map(([stage]) => stage),
        allGreyed: Object.values(states).every((s) => s && s.disabled),
    };
}

/**
 * A role's "Edit", optionally changing it (`change(win)`), then "OK". Returns the window's
 * "Stage Assignment" labels, the stage fields the post carried, the answer and the notices.
 */
async function saveRole(page, tab, name, change = null) {
    const win = await tab.openEdit(name);
    const out = {stageSectionShown: await win.stageSection.isVisible(), stageLabels: await win.stageLabels().catch(() => [])};
    if (change) await change(win);
    const asked = page.waitForRequest((r) => r.url().includes('update-user-group'), {timeout: T});
    const response = await win.save();
    const post = new URLSearchParams((await asked).postData() || '');
    out.status = response.status();
    out.postedStages = post.getAll('assignedStages[]');
    out.notices = (await screen(page)).notices;
    return out;
}

/** The submission's workflow by the address the dashboard's "View" opens (editorial or My Submissions). */
async function openWorkflow(page, app, id, {author = false} = {}) {
    const {WorkflowPage} = require('../../../pages/WorkflowPage.js');
    const frame = new WorkflowPage(page, app.contextPath);
    await page.goto('about:blank');
    if (author) await frame.gotoAuthor(id);
    else await frame.gotoEditorial(id);
    await idle(page);
    return frame;
}

/**
 * OMP: the workflow's "Production", "Participants" › "Assign", the role, "Search", the person, "OK".
 */
async function assignParticipant(page, app, id, {role, name}) {
    const {ParticipantsPanel} = require('../../../pages/StageParticipantsPages.js');
    const panel = new ParticipantsPanel(page, app.contextPath);
    await page.goto('about:blank');
    await panel.goto(id, {menuKey: 'workflow_5'});
    await idle(page);
    const win = await panel.openAssign();
    await idle(page);
    await win.chooseRole(role);
    await win.search();
    await win.choosePerson(name);
    const answered = page.waitForResponse((r) => r.url().includes('save-participant'), {timeout: T});
    await win.root.getByRole('button', {name: 'OK', exact: true}).click();
    const r = await answered;
    await win.expectClosed();
    await idle(page);
    return {status: r.status(), rows: await panel.rowLines().catch(() => null)};
}

/**
 * On the open workflow (it opens on the latest version's "Title & Abstract"): `suffix` typed at the
 * end of the "Abstract", then "Save". Records the save's answer (and its error text), what the form
 * shows beside "Save", the notices, and never throws on a refused save.
 */
async function editAbstract(page, suffix) {
    const out = {};
    const ready = (timeout) => page.waitForFunction((id) => !!window.tinymce?.get(id)?.initialized, ABSTRACT, {timeout});
    try {
        // main opens a published submission on its latest version's "Title & Abstract"; 3.5 on its
        // workflow, where the latest version's "Title & Abstract" is the menu's last such entry
        await ready(15_000).catch(async () => {
            out.openedVia = 'menu "Title & Abstract"';
            await page.getByRole('dialog').getByRole('navigation').getByRole('link', {name: 'Title & Abstract', exact: true}).last().click();
            await idle(page);
            await ready(T);
        });
    } catch {
        out.editor = 'no Abstract editor on screen';
        out.screen = flat((await screen(page)).text.dialog, 1200);
        return out;
    }
    out.heading = flat(await page.locator('[data-cy="workflow-primary-items"]').locator('h2, h3').first().innerText().catch(() => null), 120);
    out.versionLine = flat(await page.getByText(/This version has been (published|posted)|Version of Record|Unassigned version/).first().innerText({timeout: 2000}).catch(() => null), 200);
    const read = () => page.evaluate((id) => window.tinymce.get(id).getContent({format: 'text'}).trim(), ABSTRACT);
    await page.evaluate((id) => {
        const ed = window.tinymce.get(id);
        ed.focus();
        ed.selection.select(ed.getBody(), true);
        ed.selection.collapse(false);
    }, ABSTRACT);
    await page.keyboard.type(suffix, {delay: 10});
    await sleep(500);
    out.abstractEnd = (await read()).slice(-40);
    const saved = page
        .waitForResponse((r) => /\/submissions\/\d+\/publications\/\d+$/.test(new URL(r.url()).pathname) && r.request().method() !== 'GET', {timeout: T})
        .catch(() => null);
    const primary = page.locator('[data-cy="workflow-primary-items"]');
    await primary.getByRole('button', {name: 'Save', exact: true}).click();
    const r = await saved;
    out.save = r ? r.status() : null;
    if (r) {
        out.request = `${r.request().headers()['x-http-method-override'] || r.request().method()} ${new URL(r.url()).pathname.replace(/^.*\/api\//, '/api/')}`;
        if (!r.ok()) out.answer = await r.json().catch(async () => flat(await r.text().catch(() => ''), 300));
    }
    out.shown = await page.locator('.pkpFormPage__status', {hasText: 'Saved'}).waitFor({state: 'visible', timeout: 8000}).then(() => 'Saved').catch(() => null);
    await idle(page);
    out.formErrors = flat(await primary.locator('.pkpFormError, .pkpFormPage__error, .pkpFormField__error, [role="alert"]').allInnerTexts().then((a) => a.join(' | ')).catch(() => null), 400);
    out.notices = (await screen(page)).notices;
    return out;
}

/** The version's abstract as stored, for the Evidence read: does it end with `suffix`? */
function abstractEnds(app, id, suffix) {
    const v = sql(app, `select ps.setting_value from submissions s join publications p on p.submission_id = s.submission_id join publication_settings ps on ps.publication_id = p.publication_id and ps.setting_name = 'abstract' and ps.locale = 'en' where s.submission_id = ${Number(id)} order by p.publication_id desc limit 1`);
    return v.replace(/<[^>]+>/g, '').trim().endsWith(suffix.trim());
}

module.exports = {CASES, T, flat, stored, rolesTab, row, saveRole, openWorkflow, assignParticipant, editAbstract, abstractEnds};
