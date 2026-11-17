// Helpers of the walk for issue report U19 A26 (OAI-PMH datestamp of an article published in no
// issue, on MySQL and MariaDB). Requiring this file runs nothing.
const path = require('path');
const {idle, screen, shot} = require('../../../probe');

const T = 30_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (s, n = 400) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));
const utcNow = () => new Date().toISOString().replace(/\.\d+Z$/, 'Z');
const today = () => new Date().toISOString().slice(0, 10);

/**
 * From the submission's Publication › "Title & Abstract": "Publish", the "Review Publishing
 * Details" panel (version "Version of Record", major; `choice` "Don't Assign To An Issue" or
 * "Assign To Current/Back Issue" plus the issue matching `issue`), "Confirm", then the window's
 * "Publish". Records each screen through `rec(name, data)`; never throws on the publish's
 * outcome. (After shared/playwright/checks/issues/publish-without-issue-orcid-contributor-error.)
 */
async function publishFromWorkflow(page, app, contextPath, submissionId, {choice, issue} = {}, rec) {
    const {PublicationScreen} = require(path.join(app.suiteDir, 'pages', 'PublicationMetadataPages.js'));
    const pub = new PublicationScreen(page, contextPath);
    const out = {};
    await pub.gotoWorkflow(submissionId);
    await idle(page);
    await pub.openEntry('Title & Abstract');
    await idle(page);
    await sleep(800);
    const panel = await pub.openPublishPanel();
    await pub.fillVersionDetails(panel);
    await pub.awaitAssignmentPreselected(panel);
    out.choices = (await panel.getByRole('radio').evaluateAll((els) => els.map((e) => (e.closest('label') || e.parentElement).innerText))).map((t) => flat(t, 80));
    await panel.getByRole('radio', {name: choice}).check();
    if (issue) await pub.selectIssueOption(panel, issue);
    await sleep(500);
    rec('panel', await screen(page));
    await shot(page, `${rec.prefix}panel`).catch(() => {});
    await panel.getByRole('button', {name: 'Confirm', exact: true}).click();
    const confirm = page.getByRole('dialog').filter({hasText: /Are you sure you want to/}).last();
    await confirm.waitFor({state: 'visible', timeout: T});
    out.question = flat(await confirm.innerText(), 300);
    const answered = page.waitForResponse((r) => /\/publications\/\d+\/publish/.test(r.url()) && r.request().method() !== 'GET', {timeout: T}).catch(() => null);
    await confirm.getByRole('button', {name: 'Publish', exact: true}).last().click();
    const r = await answered;
    out.publish = r ? {status: r.status(), at: utcNow()} : null;
    await page.getByRole('button', {name: 'Unpublish', exact: true}).first().waitFor({timeout: 15_000}).catch(() => {});
    await idle(page);
    const after = await screen(page);
    rec('after-publish', after);
    out.status = flat(await pub.leftControls().innerText().catch(() => null), 120);
    out.notices = after.notices;
    return out;
}

/**
 * The way round for an article already published in no issue: on its Publication › "Title &
 * Abstract", "Unpublish" (answering its question), then "Publish" again choosing "Assign To
 * Current/Back Issue" and the issue matching `issue`. The version selects are filled only when
 * empty. Records what each screen shows; never throws on the outcome.
 */
async function unpublishAndRepublishInIssue(page, app, contextPath, submissionId, issue, rec) {
    const {PublicationScreen} = require(path.join(app.suiteDir, 'pages', 'PublicationMetadataPages.js'));
    const pub = new PublicationScreen(page, contextPath);
    const out = {};
    await pub.gotoWorkflow(submissionId);
    await idle(page);
    await pub.openEntry('Title & Abstract');
    await idle(page);
    await sleep(800);
    try {
        await pub.unpublish();
        out.unpublished = true;
    } catch (e) {
        out.unpublished = `failed: ${flat(e.message, 200)}`;
    }
    await idle(page);
    out.afterUnpublish = flat(await pub.leftControls().innerText().catch(() => null), 120);
    rec('after-unpublish', await screen(page));
    await pub.openEntry('Title & Abstract').catch(() => {});
    await idle(page);
    const confirm = page.getByRole('dialog').filter({hasText: /Are you sure you want to/}).last();
    const panel = await pub.pressPublish({or: confirm}).catch((e) => ({error: flat(e.message, 200)}));
    if (!panel || panel.error) {
        out.panel = panel ? panel.error : 'no panel: the confirmation opened directly';
        rec('no-panel', await screen(page));
        return out;
    }
    for (const [name, value] of [['versionStage', 'VoR'], ['versionIsMinor', 'false']]) {
        const sel = panel.locator(`select[name="${name}"]`);
        if ((await sel.isVisible().catch(() => false)) && (await sel.isEnabled().catch(() => false)) && !(await sel.inputValue())) await sel.selectOption(value);
    }
    out.choices = (await panel.getByRole('radio').evaluateAll((els) => els.map((e) => (e.closest('label') || e.parentElement).innerText))).map((t) => flat(t, 80));
    await panel.getByRole('radio', {name: 'Assign To Current/Back Issue'}).check();
    await pub.selectIssueOption(panel, issue);
    rec('panel', await screen(page));
    await panel.getByRole('button', {name: 'Confirm', exact: true}).click();
    await confirm.waitFor({state: 'visible', timeout: T});
    out.question = flat(await confirm.innerText(), 300);
    const answered = page.waitForResponse((r) => /\/publications\/\d+\/publish/.test(r.url()) && r.request().method() !== 'GET', {timeout: T}).catch(() => null);
    await confirm.getByRole('button', {name: 'Publish', exact: true}).last().click();
    const r = await answered;
    out.publish = r ? {status: r.status(), at: utcNow()} : null;
    await page.getByRole('button', {name: 'Unpublish', exact: true}).first().waitFor({timeout: 15_000}).catch(() => {});
    await idle(page);
    out.status = flat(await pub.leftControls().innerText().catch(() => null), 120);
    rec('after-republish', await screen(page));
    return out;
}

/**
 * Opens a journal's OAI address in the browser, as a person does: the browser shows the answer
 * through the repository's own XSLT ("OAI 2.0 Request Results"). Reads the page as shown: each
 * "OAI Identifier" with its "Datestamp", the error line, Identify's "Earliest Datestamp".
 */
async function openOai(page, app, contextPath, query) {
    const url = app.url(`/index.php/${contextPath}/oai?${new URLSearchParams(query)}`);
    const res = await page.goto(url);
    await page.waitForLoadState('load').catch(() => {});
    await page.getByText('OAI 2.0 Request Results').first().waitFor({timeout: T}).catch(() => {});
    const text = await page.locator('body').innerText().catch(() => '');
    const headers = [...text.matchAll(/OAI Identifier\s+(\S+)[\s\S]*?\nDatestamp\s+(\S+)/g)]
        .map((m) => ({identifier: m[1], datestamp: m[2]}));
    return {
        url: url.replace(/^https?:\/\/[^/]+/, ''),
        status: res ? res.status() : null,
        at: utcNow(),
        headers,
        responseDate: (text.match(/Datestamp of response\s+(\S+)/) || [])[1] || null,
        error: (text.match(/(noRecordsMatch|badArgument|cannotDisseminateFormat|idDoesNotExist)/) || [])[1] || null,
        earliest: (text.match(/Earliest Datestamp\s+(\S+)/) || [])[1] || null,
        screen: flat(text, 900),
    };
}

/** The header of `answer` whose identifier ends with the submission's ID, or null. */
function pick(answer, submissionId) {
    const re = new RegExp(`/${submissionId}$`);
    return answer.headers.find((h) => re.test(h.identifier)) || null;
}

/**
 * Issues › "Back Issues" › the issue's "Edit" › "Issue Data" › "Save", changing nothing: the
 * issue's own last change becomes now (IssueForm saves through Repo::issue()->edit()).
 */
async function saveIssueData(page, contextPath, issueName) {
    const {IssuesAdmin} = require('../../../pages/IssuesPages.js');
    const admin = new IssuesAdmin(page, contextPath);
    await admin.goto('Back Issues');
    const win = await admin.openManagement('Back Issues', issueName);
    const form = await win.openData();
    const before = utcNow();
    const response = await form.save();
    return {before, after: utcNow(), status: response ? response.status() : null};
}

module.exports = {sleep, flat, utcNow, today, publishFromWorkflow, unpublishAndRepublishInIssue, openOai, pick, saveIssueData};
