// U40 claim check, chunk K1 (sync accommodation of pkp/pkp-lib#13109): the
// Author's edit gate around publishing, on all three apps.
// Spec: docs/specs/U40-publication-metadata.md — Actors & permissions rows
// (45–50), Rule 2 (136–150), Rule 9 (207–217), scenario 3 (492–506), register
// entry A4 (693–705); footnotes b, c, j, s3, f-a4, f-ops1.
//
// Seeds its own scratch context (a scratch Author who is the submitter, a
// scratch manager, a scratch section editor and, on OJS/OMP, a scratch
// copyeditor assigned as participants), signs in from the roster and records
// every screen with screen(). Drives, per app: the Author's Title & Abstract
// before publishing (default permission, then ticked), after the manager
// publishes, on a new version and on the published one, after the unpublish
// (no re-tick), with the permission unticked (control), the "Edit Assignment"
// window's checkbox at every step, the Roles settings' "Permit submission
// metadata edit." boxes, the read-only controls of the Actors rows (levels:
// admin, section editor, assistant, author), and on OJS the scheduled leg.
//
//   PROBE_FEATURE=U40 PROBE_AGENT=ccK1 node bin/probe.js omp shared/playwright/checks/U40/K1/k1.js
//   PHASES=seed,roles,before,tick,publish,published,version,unpublish,untick,levels,settings,scheduled
//   (default: all; later phases reuse k1-state-<app>.json from the seed phase)
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, screen, shot, record, loc, note, idle, tag, outDir} =
    require('../../../probe');

const ALL_PHASES = ['seed', 'roles', 'before', 'tick', 'publish', 'published', 'version', 'unpublish', 'untick', 'levels', 'settings', 'scheduled'];
const PHASES = process.env.PHASES ? process.env.PHASES.split(',') : ALL_PHASES;
const on = (p) => PHASES.includes(p);
const log = (...a) => console.log('[k1]', ...a);
const stateFile = (app) => path.join(outDir(), `k1-state-${app.name}.json`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const T = 30_000;

// ---------------------------------------------------------------------------
// Reading helpers

async function buttonState(locator) {
    const count = await locator.count().catch(() => 0);
    if (!count) return {count};
    const el = locator.first();
    return {
        count,
        visible: await el.isVisible().catch(() => null),
        enabled: await el.isEnabled().catch(() => null),
        disabledAttr: await el.getAttribute('disabled').catch(() => null),
        ariaDisabled: await el.getAttribute('aria-disabled').catch(() => null),
        text: (await el.innerText().catch(() => '')).trim(),
    };
}

async function dialogTexts(page) {
    const out = [];
    for (const d of await page.locator('[role="dialog"]:visible').all()) out.push(await d.innerText().catch(() => null));
    return out;
}

/** The workflow dialog: the first visible dialog (the page itself is a dialog over the dashboard). */
const wf = (page) => page.locator('[role="dialog"]:visible').first();

/** The side menu's links and the header controls, as names. */
async function menuAndControls(page) {
    const dialog = wf(page);
    const links = await dialog.locator('nav a, nav button, [role="navigation"] a, [role="navigation"] button').evaluateAll((els) =>
        els.filter((e) => e.offsetParent !== null).map((e) => e.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean),
    ).catch(() => []);
    const treeitems = await dialog.getByRole('treeitem').evaluateAll((els) => els.map((e) => (e.getAttribute('aria-label') || e.textContent).replace(/\s+/g, ' ').trim())).catch(() => []);
    const controls = await dialog.locator('[data-cy="workflow-controls-right"] button, [data-cy="workflow-controls-left"] button').evaluateAll((els) =>
        els.map((e) => ({text: e.textContent.replace(/\s+/g, ' ').trim(), disabled: e.disabled})),
    ).catch(() => []);
    const headerButtons = await dialog.locator('header button, .pkpWorkflow__header button, [class*="header"] button').evaluateAll((els) =>
        els.filter((e) => e.offsetParent !== null).map((e) => (e.getAttribute('aria-label') || e.textContent).replace(/\s+/g, ' ').trim()).filter(Boolean),
    ).catch(() => []);
    return {links: [...new Set(links)], treeitems, controls, headerButtons: [...new Set(headerButtons)]};
}

/** Lines of the workflow dialog's text that carry a published-state banner or warning. */
async function bannerLines(page) {
    const text = (await wf(page).innerText().catch(() => '')) || '';
    return text.split('\n').map((l) => l.trim()).filter((l) => /can not be edited|cannot be edited|Warning:|has been (published|posted|scheduled)/i.test(l));
}

/** The Title field's TinyMCE editor id (the locale suffix is the context's). */
async function titleEditorId(page) {
    const iframe = page.locator('iframe[id^="titleAbstract-title-control"]');
    if (!(await iframe.count().catch(() => 0))) return null;
    // The form can re-render while the id is read (the editor is replaced): read it bounded, null when gone.
    const id = await iframe.first().getAttribute('id', {timeout: 5_000}).catch(() => null);
    return id ? id.replace(/_ifr$/, '') : null;
}

async function editorReady(page, id) {
    await page.waitForFunction((i) => !!(window.tinymce && window.tinymce.get(i) && window.tinymce.get(i).initialized), id, {timeout: T}).catch(() => {});
}

async function titleContent(page) {
    const id = await titleEditorId(page);
    if (!id) return null;
    await editorReady(page, id);
    return page.evaluate((i) => window.tinymce.get(i).getContent(), id).catch(() => null);
}

/** Type at the end of the Title editor through the keyboard (the field is a real editor, never disabled — A8). */
async function typeIntoTitle(page, suffix) {
    const id = await titleEditorId(page);
    if (!id) return {typed: false, reason: 'no title editor'};
    await editorReady(page, id);
    const body = page.frameLocator(`#${id}_ifr`).locator('body');
    await body.click();
    await page.keyboard.press('End');
    await page.keyboard.type(suffix);
    await sleep(300);
    const after = await page.evaluate((i) => window.tinymce.get(i).getContent(), id).catch(() => null);
    return {typed: true, after};
}

const saveButton = (page) => wf(page).getByRole('button', {name: 'Save', exact: true});

/** The Publication form renders after its own fetch: wait (bounded) for its Save button or a title editor. */
async function formReady(page) {
    const start = Date.now();
    while (Date.now() - start < 20_000) {
        if (await saveButton(page).count()) break;
        if (await page.locator('iframe[id^="titleAbstract-title-control"]').count()) break;
        await sleep(250);
    }
    await idle(page);
    const id = await titleEditorId(page);
    if (id) await editorReady(page, id);
}

/** What the form and page say after a save: footer statuses, field errors, notifications. */
async function afterSaveMessages(page) {
    const dialog = wf(page);
    return {
        status: await dialog.locator('[role="status"]').allInnerTexts().catch(() => []),
        fieldErrors: await dialog.locator('.pkpFieldError, .pkpFormPage__errors, [class*="error"]').evaluateAll((els) => els.filter((e) => e.offsetParent !== null).map((e) => e.innerText.replace(/\s+/g, ' ').trim()).filter(Boolean)).catch(() => []),
        alerts: await page.locator('[role="alert"], .pkpNotification, .app__notifications *').evaluateAll((els) => els.filter((e) => e.offsetParent !== null).map((e) => e.innerText.replace(/\s+/g, ' ').trim()).filter(Boolean)).catch(() => []),
        dialogs: await dialogTexts(page),
    };
}

/** Press Save; returns the API answer (status) and the footer status text, or notes that the button is unavailable. */
async function pressSave(page) {
    await formReady(page);
    const button = saveButton(page);
    const state = await buttonState(button);
    if (!state.count || !state.enabled) return {pressed: false, state};
    const responsePromise = page.waitForResponse((r) => /\/publications\/\d+/.test(r.url()) && r.request().method() === 'POST', {timeout: T}).catch(() => null);
    await button.click();
    const response = await responsePromise;
    let status = null;
    if (response) status = response.status();
    await page.locator('[role="status"]:has-text("Saved")').first().waitFor({state: 'visible', timeout: 15_000}).catch(() => {});
    await sleep(500);
    const footer = await wf(page).locator('[role="status"]').allInnerTexts().catch(() => []);
    const messages = await afterSaveMessages(page);
    return {pressed: true, state, apiStatus: status, footer, messages};
}

/** A Title & Abstract page's evidence: screen(), Save state, banner lines, the menu and controls, the title. */
async function captureTA(page, name, extra = {}) {
    await formReady(page);
    const s = await screen(page);
    s.dialogText = await dialogTexts(page);
    s.save = await buttonState(saveButton(page));
    s.banner = await bannerLines(page);
    s.menu = await menuAndControls(page);
    s.title = await titleContent(page);
    s.heading = await wf(page).getByRole('heading', {name: /^(Publication|Preprint): /i}).first().innerText().catch(() => null);
    s.statusLine = (s.dialogText[0] || '').split('\n').find((l) => /^Status:|^Published|^Scheduled|^Unpublished|^Posted/i.test(l.trim())) || null;
    Object.assign(s, extra);
    record(name, s);
    await shot(page, name).catch(() => {});
    log(name, 'save:', JSON.stringify(s.save), 'banner:', JSON.stringify(s.banner));
    return s;
}

// ---------------------------------------------------------------------------
// Navigation

async function gotoWorkflow(page, app, ctx, id, {author = false} = {}) {
    const dashboard = author ? 'mySubmissions' : 'editorial';
    await page.goto(app.url(`/index.php/${ctx}/dashboard/${dashboard}?workflowSubmissionId=${id}`));
    await idle(page);
    const anyEntry = wf(page).getByRole('link', {name: /^(Title & Abstract|Publication|Preprint|Submission|Production)$/}).first();
    await anyEntry.waitFor({state: 'visible', timeout: T}).catch(() => {});
    await idle(page);
}

/** Open a Publication entry, under a version treeitem when given. */
async function openEntry(page, name, versionLabel) {
    const dialog = wf(page);
    let scope = dialog;
    if (versionLabel) {
        const item = dialog.getByRole('treeitem', {name: versionLabel, exact: true});
        if (await item.count()) {
            scope = item;
            const entry = item.getByRole('link', {name, exact: true});
            if (!(await entry.isVisible().catch(() => false))) {
                await item.getByRole('link', {name: versionLabel, exact: true}).first().click();
                await idle(page);
            }
        } else {
            const versionLink = dialog.getByRole('link', {name: versionLabel, exact: true});
            if (await versionLink.count()) {
                await versionLink.first().click();
                await idle(page);
            }
        }
    }
    let entry = scope.getByRole('link', {name, exact: true});
    if (!(await entry.count())) entry = dialog.getByRole('link', {name, exact: true});
    if (!(await entry.count())) return false;
    if (!(await entry.first().isVisible().catch(() => false))) {
        const group = dialog.getByRole('link', {name: /^(Publication|Preprint)$/, exact: true}).first();
        if (await group.count()) await group.click();
        await idle(page);
    }
    if (!(await entry.first().isVisible().catch(() => false))) return false;
    await entry.first().click();
    await dialog.getByRole('heading', {name: new RegExp(`^(Publication|Preprint): ${name}$`, 'i')}).first().waitFor({state: 'visible', timeout: T}).catch(() => {});
    await idle(page);
    if (name === 'Title & Abstract') await formReady(page);
    return true;
}

/** Open a stage view so the Participants panel is on screen. */
async function openStage(page) {
    const dialog = wf(page);
    for (const name of ['Submission', 'Production', 'Workflow']) {
        const link = dialog.getByRole('link', {name, exact: true}).first();
        if (await link.count()) {
            await link.click();
            await idle(page);
            break;
        }
    }
    await dialog.getByText('Participants', {exact: true}).first().waitFor({state: 'visible', timeout: T}).catch(() => {});
    await idle(page);
}

/**
 * The Participants panel's "Edit Assignment" window for a participant: record
 * the "Permissions" checkbox, set it when `want` is a boolean, press OK
 * (or Cancel when only reading). Returns what was seen.
 */
async function editAssignment(page, displayName, want, name) {
    const dialog = wf(page);
    const more = dialog.getByRole('button', {name: `${displayName} More Actions`}).first();
    await more.waitFor({state: 'visible', timeout: T});
    await more.click();
    const edit = page.getByRole('menuitem', {name: 'Edit', exact: true}).first();
    await edit.waitFor({state: 'visible', timeout: T});
    await edit.click();
    const window = page.getByRole('dialog').filter({hasText: 'Edit Assignment'}).last();
    const checkbox = window.locator('input[name="canChangeMetadata"]');
    await checkbox.waitFor({state: 'visible', timeout: T});
    const label = await window.locator('label').filter({has: checkbox}).innerText().catch(() => null);
    const labelByFor = label || (await window.locator(`label[for="${await checkbox.getAttribute('id')}"]`).innerText().catch(() => null));
    const before = await checkbox.isChecked();
    const s = await screen(page);
    s.editAssignment = {displayName, checkedBefore: before, label: labelByFor, text: await window.innerText().catch(() => null)};
    if (typeof want === 'boolean' && want !== before) {
        if (want) await checkbox.check();
        else await checkbox.uncheck();
        s.editAssignment.set = want;
        await window.getByRole('button', {name: 'OK', exact: true}).click();
        await checkbox.waitFor({state: 'detached', timeout: T}).catch(() => {});
        await idle(page);
    } else {
        s.editAssignment.set = null;
        const cancel = window.getByRole('link', {name: 'Cancel', exact: true}).or(window.getByRole('button', {name: 'Cancel', exact: true})).first();
        await cancel.click().catch(() => {});
        await checkbox.waitFor({state: 'detached', timeout: 10_000}).catch(() => {});
        await idle(page);
    }
    if (name) record(name, s);
    log(name || 'editAssignment', displayName, 'checkedBefore:', before, 'set:', s.editAssignment.set);
    return s.editAssignment;
}

async function versionLabels(page) {
    const dialog = wf(page);
    const names = await dialog.getByRole('treeitem').evaluateAll((els) => els.map((e) => (e.getAttribute('aria-label') || e.textContent).replace(/\s+/g, ' ').trim()));
    const links = await dialog.getByRole('link').evaluateAll((els) => els.map((e) => e.textContent.replace(/\s+/g, ' ').trim()));
    return [...new Set([...names, ...links])].filter((n) => /Version of Record|Author (Original|Accepted|Manuscript)|Version|^\d+\.\d+$/.test(n) && !/Create New Version/.test(n));
}

/** "Create New Version" from the side menu; returns the labels seen after. */
async function createNewVersion(page, name) {
    const dialog = wf(page);
    let link = dialog.getByRole('link', {name: 'Create New Version', exact: true}).first();
    if (!(await link.isVisible().catch(() => false))) {
        const group = dialog.getByRole('link', {name: /^(Publication|Preprint)$/, exact: true}).first();
        if (await group.count()) await group.click();
        await idle(page);
    }
    const offered = await link.isVisible().catch(() => false);
    if (!offered) return {offered: false};
    await link.click();
    const window = page.getByRole('dialog').filter({has: page.locator('select[name="versionStage"]')}).last();
    await window.locator('select[name="versionStage"]').waitFor({state: 'visible', timeout: T});
    await idle(page);
    const s = await screen(page);
    s.versionDialog = {
        text: await window.innerText().catch(() => null),
        versionStage: await window.locator('select[name="versionStage"] option:checked').innerText().catch(() => null),
        versionIsMinor: await window.locator('select[name="versionIsMinor"] option:checked').innerText().catch(() => null),
        versionSource: await window.locator('select[name="versionSource"] option:checked').innerText().catch(() => null),
    };
    record(name, s);
    const created = page.waitForResponse((r) => /\/publications\/\d+\/version/.test(r.url()) && r.request().method() === 'POST', {timeout: T}).catch(() => null);
    await window.getByRole('button', {name: 'Confirm', exact: true}).click();
    const response = await created;
    const status = response ? response.status() : null;
    await window.waitFor({state: 'detached', timeout: T}).catch(() => {});
    await idle(page);
    const labels = await versionLabels(page);
    log(name, 'version POST', status, 'labels:', labels.join(' | '));
    return {offered: true, status, labels, dialog: s.versionDialog};
}

/** Select a version in the side menu (the version's own link), if there is more than one. */
async function selectVersion(page, label) {
    const dialog = wf(page);
    const item = dialog.getByRole('treeitem', {name: label, exact: true});
    const link = (await item.count()) ? item.getByRole('link', {name: label, exact: true}).first() : dialog.getByRole('link', {name: label, exact: true}).first();
    if (await link.count()) {
        await link.click();
        await idle(page);
        return true;
    }
    return false;
}

// ---------------------------------------------------------------------------
// Publishing per app (the apps' own screens)

async function fillVersionDetailsIfPresent(scope) {
    const stage = scope.locator('select[name="versionStage"]');
    if (await stage.isVisible().catch(() => false)) {
        const current = await stage.inputValue().catch(() => '');
        if (!current) await stage.selectOption('VoR').catch(() => {});
    }
    const minor = scope.locator('select[name="versionIsMinor"]');
    if (await minor.isVisible().catch(() => false)) {
        const current = await minor.inputValue().catch(() => '');
        if (!current) await minor.selectOption('false').catch(() => {});
    }
}

async function publishNow(page, app, ctx, name) {
    const s = {};
    if (app.name === 'ojs') {
        const {PublicationScreen} = require(path.join(app.suiteDir, 'pages', 'PublicationMetadataPages.js'));
        const pub = new PublicationScreen(page, ctx);
        const panel = await pub.openPublishPanel();
        await pub.fillVersionDetails(panel);
        s.panel = await screen(page);
        const dontAssign = panel.getByRole('radio', {name: "Don't Assign To An Issue"});
        const hasGroup = await dontAssign.waitFor({state: 'visible', timeout: 5_000}).then(() => true).catch(() => false);
        if (hasGroup) {
            await pub.awaitAssignmentPreselected(panel).catch(() => {});
            await dontAssign.check();
        }
        await panel.getByRole('button', {name: 'Confirm', exact: true}).click();
        const confirm = page.getByRole('dialog').filter({hasText: 'Are you sure you want to publish this?'});
        await confirm.waitFor({state: 'visible', timeout: T});
        s.confirm = await confirm.innerText().catch(() => null);
        const published = page.waitForResponse((r) => r.url().includes('/publish') && r.request().method() !== 'GET', {timeout: T}).catch(() => null);
        await confirm.getByRole('button', {name: 'Publish', exact: true}).click();
        const r = await published;
        s.status = r ? r.status() : null;
        await page.getByRole('button', {name: 'Unpublish', exact: true}).waitFor({state: 'visible', timeout: T}).catch(() => {});
    } else if (app.name === 'omp') {
        await page.getByRole('button', {name: 'Publish', exact: true}).first().click();
        const modal = page.getByRole('dialog', {name: /Schedule For Publication/});
        await modal.waitFor({state: 'visible', timeout: T});
        await idle(page);
        await fillVersionDetailsIfPresent(modal);
        s.panel = await screen(page);
        const published = page.waitForResponse((r) => r.url().includes('/publish') && r.request().method() !== 'GET', {timeout: T}).catch(() => null);
        await modal.getByRole('button', {name: 'Publish', exact: true}).click();
        const r = await published;
        s.status = r ? r.status() : null;
        await page.getByRole('button', {name: 'Unpublish', exact: true}).waitFor({state: 'visible', timeout: T}).catch(() => {});
    } else {
        const stageAction = page.getByRole('button', {name: 'Post the preprint', exact: true});
        const postControl = page.getByRole('button', {name: 'Post', exact: true});
        await stageAction.or(postControl).first().waitFor({state: 'visible', timeout: T});
        if (await stageAction.isVisible()) await stageAction.click();
        await postControl.waitFor({state: 'visible', timeout: T});
        await postControl.click();
        const confirm = page.getByRole('dialog').filter({hasText: 'Are you sure you want to post this?'});
        await confirm.waitFor({state: 'visible', timeout: T});
        await idle(page);
        await fillVersionDetailsIfPresent(confirm);
        s.panel = await screen(page);
        const posted = page.waitForResponse((r) => /\/publications\/\d+\/publish/.test(r.url()) && r.request().method() !== 'GET', {timeout: T}).catch(() => null);
        await confirm.getByRole('button', {name: 'Post', exact: true}).last().click();
        const r = await posted;
        s.status = r ? r.status() : null;
        await page.getByRole('button', {name: 'Unpost', exact: true}).waitFor({state: 'visible', timeout: T}).catch(() => {});
    }
    await idle(page);
    s.after = await screen(page);
    s.after.menu = await menuAndControls(page);
    record(name, s);
    log(name, 'publish status', s.status);
    return s;
}

async function unpublishNow(page, app, name) {
    const s = {};
    const isOps = app.name === 'ops';
    const button = page.getByRole('button', {name: isOps ? 'Unpost' : 'Unpublish', exact: true}).first();
    await button.waitFor({state: 'visible', timeout: T});
    await button.click();
    const dialog = page.getByRole('dialog').filter({hasText: isOps ? "Are you sure you don't want this to be posted?" : "Are you sure you don't want this to be published?"}).last();
    await dialog.waitFor({state: 'visible', timeout: T});
    s.confirm = await dialog.innerText().catch(() => null);
    const done = page.waitForResponse((r) => r.url().includes('/unpublish') && r.request().method() !== 'GET', {timeout: T}).catch(() => null);
    await dialog.getByRole('button', {name: isOps ? 'Unpost' : 'Unpublish', exact: true}).last().click();
    const r = await done;
    s.status = r ? r.status() : null;
    await dialog.waitFor({state: 'detached', timeout: T}).catch(() => {});
    await idle(page);
    s.after = await screen(page);
    s.after.menu = await menuAndControls(page);
    record(name, s);
    log(name, 'unpublish status', s.status);
    return s;
}

// ---------------------------------------------------------------------------
// The author's full read of one gate state: Title & Abstract (Save, banner,
// type, save, reload, persistence), then the Contributors page as a sweep.

async function authorRead(page, app, ctx, id, name, {versionLabel, suffix, expectMenu = true} = {}) {
    await gotoWorkflow(page, app, ctx, id, {author: true});
    const opened = await openEntry(page, 'Title & Abstract', versionLabel);
    const s = await captureTA(page, `${name}-ta`, {opened, versionLabel: versionLabel || null});
    if (!opened) return s;
    const before = s.title;
    const typed = await typeIntoTitle(page, suffix);
    const save = await pressSave(page);
    s.typed = typed;
    s.saveAttempt = save;
    if (save.pressed && save.apiStatus >= 400) {
        // A refused save is read twice: reload, retype, save again.
        await captureTA(page, `${name}-ta-refused`, {refused: save});
        await gotoWorkflow(page, app, ctx, id, {author: true});
        await openEntry(page, 'Title & Abstract', versionLabel);
        const typed2 = await typeIntoTitle(page, `${suffix}2`);
        const save2 = await pressSave(page);
        s.retry = {typed: typed2, save: save2};
        log(name, 'retry after refused save:', JSON.stringify(save2.apiStatus));
    }
    // Leave the page with the edit unsaved (when Save was unavailable it stays unsaved) — what appears on the way out.
    const dialogsOnLeave = [];
    const handler = (d) => {
        dialogsOnLeave.push({type: d.type(), message: d.message()});
        d.dismiss().catch(() => {});
    };
    page.on('dialog', handler);
    const opened2 = await openEntry(page, 'Metadata');
    s.leaveToMetadata = {opened: opened2, dialogs: await dialogTexts(page), browserDialogs: [...dialogsOnLeave]};
    await captureTA(page, `${name}-metadata`, {sweep: 'Metadata page, same gate'});
    await gotoWorkflow(page, app, ctx, id, {author: true});
    page.off('dialog', handler);
    s.leaveByUrl = {browserDialogs: [...dialogsOnLeave]};
    // Reload: what persisted.
    await openEntry(page, 'Title & Abstract', versionLabel);
    const after = await titleContent(page);
    s.titleBefore = before;
    s.titleAfterReload = after;
    s.persisted = typeof after === 'string' && after.includes(suffix.trim());
    // Sweep: Contributors on the same gate (its rules are U41's).
    const contributors = await openEntry(page, 'Contributors', versionLabel);
    if (contributors) {
        const c = await screen(page);
        c.dialogText = await dialogTexts(page);
        c.buttons = await wf(page).getByRole('button').evaluateAll((els) => els.filter((e) => e.offsetParent !== null).map((e) => ({text: (e.getAttribute('aria-label') || e.textContent).replace(/\s+/g, ' ').trim(), disabled: e.disabled})));
        record(`${name}-contributors`, c);
    }
    record(`${name}-summary`, {
        opened, versionLabel: versionLabel || null, save: s.save, banner: s.banner, typed: s.typed, saveAttempt: s.saveAttempt,
        persisted: s.persisted, titleBefore: before, titleAfterReload: after, leaveToMetadata: s.leaveToMetadata, leaveByUrl: s.leaveByUrl, retry: s.retry || null,
        menu: s.menu, statusLine: s.statusLine, contributorsOpened: contributors,
    });
    log(name, 'persisted:', s.persisted, 'saveAttempt:', JSON.stringify(save));
    return s;
}

// ---------------------------------------------------------------------------

forEachApp(async (app) => {
    const isOjs = app.name === 'ojs';
    const isOmp = app.name === 'omp';
    const isOps = app.name === 'ops';
    let state = fs.existsSync(stateFile(app)) ? JSON.parse(fs.readFileSync(stateFile(app), 'utf8')) : null;
    const saveState = () => fs.writeFileSync(stateFile(app), JSON.stringify(state, null, 2));

    if (on('seed')) {
        const ctx = tag('u40k1');
        const users = [
            {username: `${ctx}au`, roles: ['author'], givenName: 'Ada', familyName: 'Author'},
            {username: `${ctx}mgr`, roles: ['manager'], givenName: 'Mona', familyName: 'Manager'},
            {username: `${ctx}se`, roles: ['sectionEditor'], givenName: 'Sam', familyName: 'Subeditor', ...(isOmp ? {} : {sections: ['ART']})},
        ];
        if (!isOps) users.push({username: `${ctx}ce`, roles: ['copyeditor'], givenName: 'Cleo', familyName: 'Copyeditor'});
        const contextSpec = {tag: ctx, context: {name: `Scratch ${ctx}`}, users};
        if (!isOmp) contextSpec.sections = [{abbrev: 'ART', title: 'Articles'}];
        const created = await app.api.createContext(contextSpec);
        const participants = [{username: `${ctx}se`, role: 'sectionEditor'}];
        if (!isOps) participants.push({username: `${ctx}ce`, role: 'copyeditor'});
        const s1 = await app.api.createSubmission({tag: `${ctx}s1`, context: ctx, submitter: `${ctx}au`, title: `K1 main ${ctx}`, participants});
        const s2 = await app.api.createSubmission({tag: `${ctx}s2`, context: ctx, submitter: `${ctx}au`, title: `K1 second ${ctx}`});
        state = {ctx, contextId: created.contextId, users: created.users, s1, s2, versions: {}};
        saveState();
        log('seeded', ctx, 's1', s1.submissionId, 's2', s2.submissionId);
    }
    if (!state) throw new Error('no state: run the seed phase first');
    const {ctx, s1, s2} = state;
    const AU = `${ctx}au`;
    const MGR = `${ctx}mgr`;
    const AUTHOR_NAME = 'Ada Author';

    const mgr = await launch(app);
    const au = await launch(app);
    try {
        await signIn(mgr.page, MGR);
        await signIn(au.page, AU);

        // Rule 2 (142–145): Settings › Users & Roles › Roles › "Permit submission metadata edit." per role.
        if (on('roles')) {
            const page = mgr.page;
            await page.goto(app.url(`/index.php/${ctx}/management/settings/access`));
            await idle(page);
            const rolesTab = page.getByRole('tab', {name: 'Roles', exact: true}).or(page.locator('#roles-button')).first();
            if (await rolesTab.count()) await rolesTab.click();
            await idle(page);
            const s = await screen(page);
            s.rows = await page.locator('tr.gridRow').evaluateAll((els) => els.map((e) => e.innerText.replace(/\s+/g, ' ').trim()));
            record('roles-grid', s);
            await shot(page, 'roles-grid').catch(() => {});
            const wanted = isOjs
                ? ['Journal editor', 'Section editor', 'Copyeditor', 'Author']
                : isOmp
                    ? ['Press editor', 'Series editor', 'Copyeditor', 'Author']
                    : ['Moderator', 'Editorial board member', 'Author'];
            const seen = [];
            for (const roleName of wanted) {
                // The row's first cell reads "Settings <role name>" (a hidden label of the show_extras arrow precedes the name);
                // the arrow opens the controls row, whose "Edit" link opens form#userGroupForm (U21's openGridRowEdit idiom).
                const cellRe = new RegExp(`^\\s*(Settings\\s+)?${roleName}\\s*$`, 'i');
                const row = page.locator('tr.gridRow').filter({has: page.locator('td').filter({hasText: cellRe})}).first();
                if (!(await row.count())) { seen.push({role: roleName, row: 'absent'}); continue; }
                const rowText = (await row.innerText()).replace(/\s+/g, ' ').trim();
                await row.locator('a.show_extras').click();
                await idle(page);
                await page.getByRole('link', {name: 'Edit', exact: true}).last().click();
                const form = page.locator('form#userGroupForm');
                await form.waitFor({state: 'visible', timeout: T}).catch(() => {});
                const box = form.locator('input[name="permitMetadataEdit"]');
                await box.waitFor({state: 'visible', timeout: 10_000}).catch(() => {});
                const found = await box.count();
                const label = found ? await page.locator(`label[for="${await box.getAttribute('id')}"]`).innerText().catch(() => null) : null;
                const entry = {role: rowText, permitMetadataEdit: found ? await box.isChecked() : 'no box', label};
                entry.formText = await form.innerText().catch(() => null);
                entry.stages = await form.locator('input[name="assignedStages[]"]').evaluateAll((els) => els.map((e) => ({value: e.value, checked: e.checked, label: (e.labels && e.labels[0] ? e.labels[0].innerText : '').trim()}))).catch(() => []);
                seen.push(entry);
                log('roles', JSON.stringify({role: entry.role, permitMetadataEdit: entry.permitMetadataEdit}));
                await loc(page, 'Roles › Edit › "Permit submission metadata edit." box', box);
                if (roleName === 'Author') { record('roles-author-form', await screen(page)); await shot(page, 'roles-author-form').catch(() => {}); }
                const cancel = form.getByRole('link', {name: 'Cancel', exact: true}).or(form.getByRole('button', {name: 'Cancel', exact: true})).first();
                await cancel.click().catch(() => {});
                await box.waitFor({state: 'detached', timeout: 10_000}).catch(() => {});
                await idle(page);
                await page.goto(app.url(`/index.php/${ctx}/management/settings/access`));
                await idle(page);
                if (await rolesTab.count()) await rolesTab.click();
                await idle(page);
            }
            record('roles-permit-metadata-edit', seen);
        }

        // Scenario 3 / Rule 9 / row 47: the Author before publishing, default permission.
        if (on('before')) {
            await gotoWorkflow(mgr.page, app, ctx, s1.submissionId);
            await openStage(mgr.page);
            const stage = await screen(mgr.page);
            stage.dialogText = await dialogTexts(mgr.page);
            record('mgr-stage-before', stage);
            await editAssignment(mgr.page, AUTHOR_NAME, null, 'mgr-edit-assignment-default');
            await authorRead(au.page, app, ctx, s1.submissionId, 'au-before-default', {suffix: ' K1a'});
            // The author's whole workflow: what the menu offers (rows 45–46: pages present; Permissions & Disclosure absent).
            await gotoWorkflow(au.page, app, ctx, s1.submissionId, {author: true});
            const s = await screen(au.page);
            s.dialogText = await dialogTexts(au.page);
            s.menu = await menuAndControls(au.page);
            s.permissionsDisclosure = await wf(au.page).getByRole('link', {name: 'Permissions & Disclosure', exact: true}).count();
            s.changeButton = await buttonState(wf(au.page).getByRole('button', {name: 'Change', exact: true}));
            s.languageReadout = (s.dialogText[0] || '').split('\n').find((l) => /Submission Language/i.test(l)) || null;
            record('au-workflow-before', s);
            await shot(au.page, 'au-workflow-before').catch(() => {});
        }

        // Rule 2 bullet 2: the manager ticks the Author's permission; the Author saves before publishing.
        if (on('tick')) {
            await gotoWorkflow(mgr.page, app, ctx, s1.submissionId);
            await openStage(mgr.page);
            await editAssignment(mgr.page, AUTHOR_NAME, true, 'mgr-edit-assignment-tick');
            await authorRead(au.page, app, ctx, s1.submissionId, 'au-before-ticked', {suffix: ' K1b'});
        }

        // Rule 9 / scenario 3: the manager publishes; the Author's published version.
        if (on('publish')) {
            await gotoWorkflow(mgr.page, app, ctx, s1.submissionId);
            if (!isOps) await openEntry(mgr.page, 'Title & Abstract');
            else await openStage(mgr.page);
            await publishNow(mgr.page, app, ctx, 'mgr-publish');
            // The manager's own view of the published version (Rule 8 control, fn-j's editor banner).
            await gotoWorkflow(mgr.page, app, ctx, s1.submissionId);
            await openEntry(mgr.page, 'Title & Abstract');
            await captureTA(mgr.page, 'mgr-published-ta');
        }
        if (on('published')) {
            await authorRead(au.page, app, ctx, s1.submissionId, 'au-published', {suffix: ' K1c'});
            await gotoWorkflow(mgr.page, app, ctx, s1.submissionId);
            await openStage(mgr.page);
            await editAssignment(mgr.page, AUTHOR_NAME, null, 'mgr-edit-assignment-after-publish');
            state.versions.v1 = (await (async () => { await gotoWorkflow(mgr.page, app, ctx, s1.submissionId); return versionLabels(mgr.page); })())[0] || 'Version of Record 1.0';
            saveState();
        }

        // The new version: the Author on the new version and on the published one, the switch between them.
        if (on('version')) {
            await gotoWorkflow(mgr.page, app, ctx, s1.submissionId);
            // Sweep: does the Author's view offer "Create New Version"?
            await gotoWorkflow(au.page, app, ctx, s1.submissionId, {author: true});
            const auOffer = await wf(au.page).getByRole('link', {name: 'Create New Version', exact: true}).count();
            record('au-create-new-version-offered', {count: auOffer, menu: await menuAndControls(au.page)});
            const created = await createNewVersion(mgr.page, 'mgr-create-new-version');
            record('mgr-create-new-version-result', created);
            const labels = created.labels || (await versionLabels(mgr.page));
            const v1 = state.versions.v1 || labels[0];
            const v2 = labels.find((l) => l !== v1) || null;
            state.versions.v2 = v2;
            saveState();
            log('versions', v1, '|', v2);
            // The manager's new-version page (control) and the version switch.
            await openEntry(mgr.page, 'Title & Abstract', v2);
            await captureTA(mgr.page, 'mgr-v2-ta');
            // The Author: new version, then the published version, the switch recorded on each.
            await authorRead(au.page, app, ctx, s1.submissionId, 'au-v2', {versionLabel: v2, suffix: ' K1d'});
            await authorRead(au.page, app, ctx, s1.submissionId, 'au-v1-published', {versionLabel: v1, suffix: ' K1e'});
            // The author's default landing (which version opens) and the versions offered.
            await gotoWorkflow(au.page, app, ctx, s1.submissionId, {author: true});
            const landing = await screen(au.page);
            landing.menu = await menuAndControls(au.page);
            landing.versions = await versionLabels(au.page);
            record('au-two-versions-landing', landing);
            await shot(au.page, 'au-two-versions-landing').catch(() => {});
        }

        // The unpublish: does the Author save again at once, without any re-tick (A4)?
        if (on('unpublish')) {
            const v1 = state.versions.v1 || 'Version of Record 1.0';
            const v2 = state.versions.v2;
            await gotoWorkflow(mgr.page, app, ctx, s1.submissionId);
            await selectVersion(mgr.page, v1);
            await openEntry(mgr.page, 'Title & Abstract', v1);
            await unpublishNow(mgr.page, app, 'mgr-unpublish');
            await authorRead(au.page, app, ctx, s1.submissionId, 'au-after-unpublish-v1', {versionLabel: v1, suffix: ' K1f'});
            if (v2) await authorRead(au.page, app, ctx, s1.submissionId, 'au-after-unpublish-v2', {versionLabel: v2, suffix: ' K1g'});
            await gotoWorkflow(mgr.page, app, ctx, s1.submissionId);
            await openStage(mgr.page);
            await editAssignment(mgr.page, AUTHOR_NAME, null, 'mgr-edit-assignment-after-unpublish');
        }

        // Rule 2's control: an Author WITHOUT the permission on the new version (and on v1) is read-only.
        if (on('untick')) {
            const v1 = state.versions.v1 || 'Version of Record 1.0';
            const v2 = state.versions.v2;
            await gotoWorkflow(mgr.page, app, ctx, s1.submissionId);
            await openStage(mgr.page);
            await editAssignment(mgr.page, AUTHOR_NAME, false, 'mgr-edit-assignment-untick');
            await authorRead(au.page, app, ctx, s1.submissionId, 'au-unticked-v2', {versionLabel: v2, suffix: ' K1h'});
            await authorRead(au.page, app, ctx, s1.submissionId, 'au-unticked-v1', {versionLabel: v1, suffix: ' K1i'});
        }

        // Rows 45–48 at the other levels: the manager (unassigned), the site admin, the section editor, the assistant.
        if (on('levels')) {
            const v1 = state.versions.v1;
            const readLevel = async (page, who, name) => {
                await gotoWorkflow(page, app, ctx, s1.submissionId);
                const s = await screen(page);
                s.dialogText = await dialogTexts(page);
                s.menu = await menuAndControls(page);
                s.permissionsDisclosure = await wf(page).getByRole('link', {name: 'Permissions & Disclosure', exact: true}).count();
                s.publicationEntries = {};
                for (const entry of ['Title & Abstract', 'Metadata', 'Data', 'Permissions & Disclosure', 'Contributors']) {
                    s.publicationEntries[entry] = await wf(page).getByRole('link', {name: entry, exact: true}).count();
                }
                record(`${name}-workflow`, s);
                await shot(page, `${name}-workflow`).catch(() => {});
                const opened = await openEntry(page, 'Title & Abstract', v1);
                const ta = await captureTA(page, `${name}-ta`, {opened, who});
                ta.changeButton = await buttonState(wf(page).getByRole('button', {name: 'Change', exact: true}));
                ta.languageReadout = (ta.dialogText[0] || '').split('\n').find((l) => /Submission Language/i.test(l)) || null;
                record(`${name}-ta`, ta);
                if (opened) {
                    const typed = await typeIntoTitle(page, ` ${name}`);
                    const save = await pressSave(page);
                    await gotoWorkflow(page, app, ctx, s1.submissionId);
                    await openEntry(page, 'Title & Abstract', v1);
                    record(`${name}-save`, {typed, save, titleAfterReload: await titleContent(page)});
                    log(name, 'save', JSON.stringify(save));
                }
            };
            // The manager, not a participant: Participants panel recorded to prove it.
            await gotoWorkflow(mgr.page, app, ctx, s1.submissionId);
            await openStage(mgr.page);
            const participants = await screen(mgr.page);
            participants.dialogText = await dialogTexts(mgr.page);
            record('mgr-participants-panel', participants);
            await readLevel(mgr.page, 'manager (unassigned)', 'lvl-manager');
            const other = await launch(app);
            try {
                await signIn(other.page, 'admin');
                await readLevel(other.page, 'site admin', 'lvl-admin');
                await signIn(other.page, `${ctx}se`);
                await readLevel(other.page, 'section editor (participant, default permission)', 'lvl-sectioneditor');
                if (!isOps) {
                    await signIn(other.page, `${ctx}ce`);
                    await readLevel(other.page, 'copyeditor (participant, default permission)', 'lvl-copyeditor');
                }
            } finally {
                await other.close();
            }
        }

        // Rows 49–50: Settings › Distribution › License and Tools › Permissions, as the manager and by URL as the Author.
        if (on('settings')) {
            const page = mgr.page;
            await page.goto(app.url(`/index.php/${ctx}/management/settings/distribution`));
            await idle(page);
            const licenseTab = page.getByRole('tab', {name: 'License', exact: true}).or(page.locator('#license-button')).first();
            if (await licenseTab.count()) await licenseTab.click();
            await idle(page);
            record('mgr-distribution-license', await screen(page));
            await shot(page, 'mgr-distribution-license').catch(() => {});
            await page.goto(app.url(`/index.php/${ctx}/management/tools`));
            await idle(page);
            const permTab = page.getByRole('tab', {name: 'Permissions', exact: true}).or(page.locator('#permissions-button')).first();
            if (await permTab.count()) await permTab.click();
            await idle(page);
            const tools = await screen(page);
            tools.buttons = await page.getByRole('button').evaluateAll((els) => els.filter((e) => e.offsetParent !== null).map((e) => e.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean));
            record('mgr-tools-permissions', tools);
            await shot(page, 'mgr-tools-permissions').catch(() => {});
            // Row 48's positive control: an editorial role on a single-version, unpublished submission sees the
            // "Current Submission Language" readout with its "Change" button (the Author never does).
            if (!state.s3) {
                state.s3 = await app.api.createSubmission({tag: `${ctx}s3`, context: ctx, submitter: AU, title: `K1 third ${ctx}`});
                saveState();
            }
            await gotoWorkflow(page, app, ctx, state.s3.submissionId);
            await openEntry(page, 'Title & Abstract');
            const s3 = await captureTA(page, 'mgr-s3-ta');
            s3.changeButton = await buttonState(wf(page).getByRole('button', {name: 'Change', exact: true}));
            s3.languageReadout = (s3.dialogText[0] || '').split('\n').find((l) => /Submission Language/i.test(l)) || null;
            record('mgr-s3-ta', s3);
            log('mgr-s3-ta change:', JSON.stringify(s3.changeButton), s3.languageReadout);
            await gotoWorkflow(au.page, app, ctx, state.s3.submissionId, {author: true});
            await openEntry(au.page, 'Title & Abstract');
            const s3au = await captureTA(au.page, 'au-s3-ta');
            s3au.changeButton = await buttonState(wf(au.page).getByRole('button', {name: 'Change', exact: true}));
            s3au.languageReadout = (s3au.dialogText[0] || '').split('\n').find((l) => /Submission Language/i.test(l)) || null;
            record('au-s3-ta', s3au);
            log('au-s3-ta change:', JSON.stringify(s3au.changeButton), s3au.languageReadout);
            for (const [name, url] of [['au-url-distribution', 'management/settings/distribution'], ['au-url-tools', 'management/tools'], ['au-url-access', 'management/settings/access']]) {
                const response = await au.page.goto(app.url(`/index.php/${ctx}/${url}`)).catch(() => null);
                await idle(au.page);
                const s = await screen(au.page);
                s.httpStatus = response ? response.status() : null;
                record(name, s);
                log(name, s.httpStatus, s.url, (s.text.main || '').slice(0, 80).replace(/\n/g, ' / '));
            }
        }

        // {OJS} Rule 9's scheduled leg: a second submission of the same Author, permission ticked, scheduled to a future issue.
        if (on('scheduled') && isOjs) {
            const {PublicationScreen, createIssue} = require(path.join(app.suiteDir, 'pages', 'PublicationMetadataPages.js'));
            const page = mgr.page;
            await gotoWorkflow(page, app, ctx, s2.submissionId);
            await openStage(page);
            await editAssignment(page, AUTHOR_NAME, true, 'mgr-s2-edit-assignment-tick');
            await authorRead(au.page, app, ctx, s2.submissionId, 'au-s2-before', {suffix: ' K1j'});
            await createIssue(page, ctx, {volume: '9', number: '9', year: '2099', title: 'Future issue 2099'});
            record('mgr-issues', await screen(page));
            const pub = new PublicationScreen(page, ctx);
            await pub.gotoWorkflow(s2.submissionId);
            await pub.scheduleToFutureIssue(/Vol\. 9 No\. 9 \(2099\)/);
            await idle(page);
            const sched = await screen(page);
            sched.menu = await menuAndControls(page);
            record('mgr-s2-scheduled', sched);
            await shot(page, 'mgr-s2-scheduled').catch(() => {});
            await authorRead(au.page, app, ctx, s2.submissionId, 'au-s2-scheduled', {suffix: ' K1k'});
            // Is "Create New Version" offered on a scheduled item? If so, the Author on the new version.
            await gotoWorkflow(page, app, ctx, s2.submissionId);
            const created = await createNewVersion(page, 'mgr-s2-create-new-version');
            record('mgr-s2-create-new-version-result', created);
            if (created.offered && created.status && created.status < 400) {
                const labels = created.labels;
                const v2 = labels.find((l) => !/1\.0$/.test(l)) || labels[labels.length - 1];
                await authorRead(au.page, app, ctx, s2.submissionId, 'au-s2-v2', {versionLabel: v2, suffix: ' K1l'});
                await authorRead(au.page, app, ctx, s2.submissionId, 'au-s2-v1-scheduled', {versionLabel: labels.find((l) => /1\.0$/.test(l)) || labels[0], suffix: ' K1m'});
            }
            await gotoWorkflow(page, app, ctx, s2.submissionId);
            await openStage(page);
            await editAssignment(page, AUTHOR_NAME, null, 'mgr-s2-edit-assignment-after-schedule');
        }
    } finally {
        await mgr.close();
        await au.close();
    }
});
