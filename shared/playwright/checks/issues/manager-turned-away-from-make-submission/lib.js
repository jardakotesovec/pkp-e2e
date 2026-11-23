// Helpers of walk.js (issue report docs/issues/U21-A25-manager-turned-away-from-make-submission.md).
// Requiring this file runs nothing. Every helper drives the screens a person uses; the sql() reads
// are evidence beside the screens, never a step. Copied, not required, from
// ../section-editor-submit-as-refused/lib.js (start page), ../wizard-refused-save-hangs-saving/lib.js
// (typeRich) and ../register-no-support-contact-empty-page/lib.js (register).
const {idle, sql} = require('../../../probe');
const {waitForEditorReady} = require('../../../support/richtext.js');

const T = 30_000;
const flat = (s, n = 1500) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));
const L = (app) => (app.line && /3_[34]/.test(app.line) ? '' : '/en');

/** Per-app screen words of the dataset. */
const WORDS = {
    ojs: {manager: 'Journal manager', editor: 'Journal editor', authorGroups: ['Author'], section: 'Articles'},
    omp: {manager: 'Press manager', editor: 'Press editor', authorGroups: ['Author', 'Chapter Author', 'Volume editor'], section: null},
};

async function typeRich(page, id, text) {
    await page.locator(`#${id}_ifr`).waitFor({state: 'visible', timeout: T});
    await waitForEditorReady(page, id);
    await page.frameLocator(`#${id}_ifr`).locator('body').click();
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.press('Delete');
    await page.keyboard.type(text);
}

/** The dashboard's side menu: press "Start A New Submission". Returns where it led. */
async function startFromSideMenu(page, app) {
    await page.goto(app.url(`/index.php/${app.contextPath}${L(app)}/dashboard/editorial`));
    await idle(page);
    const entry = page.locator('#app-nav').getByRole('link', {name: 'Start A New Submission'});
    const offered = await entry.count();
    if (!offered) return {offered: 0};
    await entry.first().click();
    await page.waitForLoadState('load');
    await idle(page);
    return {offered, url: page.url().replace(/^https?:\/\/[^/]+/, '')};
}

/** Open "Make a Submission" by its address. */
async function openStart(page, app) {
    const r = await page.goto(app.url(`/index.php/${app.contextPath}${L(app)}/submission`));
    await idle(page);
    return {status: r ? r.status() : null};
}

/** What the start page shows: the form ("Begin Submission", "Submit As") or "Not Allowed" and its text. */
async function readStart(page) {
    const set = page.getByRole('group', {name: /^Submit As\b/});
    const main = page.locator('main, #main, .pkp_structure_main').first();
    return {
        url: page.url().replace(/^https?:\/\/[^/]+/, ''),
        title: await page.title(),
        h1: flat(await page.locator('h1').first().innerText({timeout: 3000}).catch(() => null), 200),
        notAllowed: await page.getByRole('heading', {name: 'Not Allowed'}).count(),
        beginSubmission: await page.getByRole('button', {name: 'Begin Submission'}).count(),
        submitAs: (await set.count()) ? flat(await set.innerText()) : null,
        text: flat(await main.innerText({timeout: 3000}).catch(() => null), 900),
    };
}

/**
 * Settings › "Users & Roles" › "Roles": on each named row the arrow, "Edit", "Allow user
 * self-registration" ticked or unticked, "OK". Reads the box back after a reload.
 */
async function setSelfRegistration(page, app, groups, on) {
    const {RolesTab} = require('../../../pages/RolesConfigurationPages.js');
    const roles = new RolesTab(page, app.contextPath, {stages: []});
    const out = [];
    for (const g of groups) {
        await roles.goto();
        const win = await roles.openEdit(g);
        const box = win.optionBox('Allow user self-registration');
        const before = await box.isChecked();
        if (on) await box.check(); else await box.uncheck();
        const resp = await win.save();
        await roles.reload();
        const w2 = await roles.openEdit(g);
        const after = await w2.optionBox('Allow user self-registration').isChecked();
        await w2.cancel();
        out.push({group: g, before, save: resp.status(), afterReload: after});
    }
    return out;
}

/** Fill the start form: title, the section when offered, English, the boxes, the first option of any radio set left empty. */
async function fillStart(page, {title, section}) {
    await typeRich(page, 'startSubmission-title-control', title);
    if (section) {
        const r = page.getByRole('radio', {name: section, exact: true});
        if (await r.count()) await r.check();
    }
    const en = page.getByRole('radio', {name: 'English', exact: true});
    if (await en.count()) await en.check();
    for (const name of [/meets all of these requirements/, /agree to have my data collected/]) {
        const b = page.getByRole('checkbox', {name});
        if (await b.count()) await b.check();
    }
    const radios = await page.locator('form input[type=radio]').evaluateAll((els) => els.map((e) => ({name: e.name, checked: e.checked})));
    const sets = {};
    for (const r of radios) (sets[r.name] ||= []).push(r);
    for (const [name, list] of Object.entries(sets)) {
        if (!list.some((r) => r.checked)) await page.locator(`form input[type=radio][name="${name}"]`).first().check();
    }
}

/** Press "Begin Submission": the POST's status and keys sent, the answer's refusal, or the wizard's id and step. */
async function pressBegin(page) {
    const posted = page.waitForResponse((r) => r.request().method() === 'POST' && /\/api\/v1\/submissions(\?|$)/.test(r.url()), {timeout: T}).catch(() => null);
    await page.getByRole('button', {name: 'Begin Submission'}).click();
    const r = await posted;
    if (!r) return {status: 'no POST'};
    const sent = (() => { try { return r.request().postDataJSON() || {}; } catch (e) { return {}; } })();
    const out = {status: r.status(), sentKeys: Object.keys(sent), userGroupIdSent: sent.userGroupId ?? null, id: null, step: null, refusal: null};
    if (r.status() >= 400) {
        out.refusal = flat(await r.text().catch(() => ''), 600);
        await idle(page);
        return out;
    }
    await page.waitForURL(/[?&]id=\d+/, {waitUntil: 'commit', timeout: 45_000}).catch(() => {});
    await page.locator('.pkpSteps__step__label--current').waitFor({timeout: T}).catch(() => {});
    await idle(page);
    out.id = Number(new URL(page.url()).searchParams.get('id')) || null;
    out.step = flat(await page.locator('.pkpSteps__step__label--current').innerText().catch(() => null), 80);
    return out;
}

/**
 * The Register page at `/index.php/<context>/user/register`, filled as a newcomer would
 * (email <username>@mailinator.com, password the username twice) and sent.
 */
async function register(page, app, {givenName, familyName, username}) {
    await page.goto(app.url(`/index.php/${app.contextPath}${L(app)}/user/register`));
    const form = page.locator('form#register');
    await form.waitFor({state: 'visible', timeout: T});
    await form.locator('input[name="givenName"]').fill(givenName);
    await form.locator('input[name="familyName"]').fill(familyName);
    await form.locator('input[name="affiliation"]').fill(familyName);
    await form.locator('select[name="country"]').selectOption({label: 'Canada'});
    await form.locator('input[name="email"]').fill(`${username}@mailinator.com`);
    await form.locator('input[name="username"]').fill(username);
    await form.locator('input[name="password"]').fill(username + username);
    await form.locator('input[name="password2"]').fill(username + username);
    const consent = form.locator('input[name="privacyConsent"]');
    if (await consent.count()) await consent.check();
    const [resp] = await Promise.all([
        page.waitForResponse((r) => r.request().method() === 'POST' && /\/user\/register/.test(r.url()), {timeout: 60_000}),
        form.locator('button.submit').click(),
    ]);
    await page.waitForLoadState('load');
    return {status: resp.status(), url: page.url().replace(/^https?:\/\/[^/]+/, ''), h1: flat(await page.locator('h1').first().innerText({timeout: 2000}).catch(() => null), 200)};
}

/** Evidence: a user's roles in the context, by their English names. */
function rolesOf(app, username) {
    return sql(app, `select string_agg(s.setting_value, ', ' order by s.setting_value) from user_user_groups uug join users u on u.user_id = uug.user_id join user_groups ug on ug.user_group_id = uug.user_group_id join user_group_settings s on s.user_group_id = ug.user_group_id and s.setting_name = 'name' and s.locale = 'en' where u.username = '${username}' and ug.context_id is not null and (uug.date_end is null or uug.date_end > now())`).trim();
}

/** Evidence: the roles a submission's participants were assigned in. */
function participantsOf(app, id) {
    return sql(app, `select string_agg(u.username || ' as ' || s.setting_value, ', ') from stage_assignments sa join users u on u.user_id = sa.user_id join user_group_settings s on s.user_group_id = sa.user_group_id and s.setting_name = 'name' and s.locale = 'en' where sa.submission_id = ${Number(id)}`).trim();
}

/** Evidence: the stage rows of the author and manager groups. */
function groupStages(app) {
    return sql(app, `select s.setting_value || ': ' || coalesce((select string_agg(stage_id::text, ',' order by stage_id) from user_group_stage x where x.user_group_id = ug.user_group_id), '(none)') || ' self-reg=' || ug.permit_self_registration::text from user_groups ug join user_group_settings s on s.user_group_id = ug.user_group_id and s.setting_name = 'name' and s.locale = 'en' where ug.context_id is not null and ug.role_id in (16, 65536) order by ug.user_group_id`).split('\n').filter(Boolean);
}

module.exports = {T, flat, L, WORDS, typeRich, startFromSideMenu, openStart, readStart, setSelfRegistration, fillStart, pressBegin, register, rolesOf, participantsOf, groupStages};
