// Helpers for walk.js (issue report docs/issues/U56-OMP3-press-french-editorial-reminder-journal-placeholder.md).
// The Manage Emails idioms are copied from ../french-manage-emails-raw-keys/lib.js and
// ../../U56/C56/c56.js so this folder stands alone. Requiring this file runs nothing.
const {execFileSync} = require('child_process');
const {idle, loc} = require('../../../probe');

const T = 30_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (t, n = 400) => (t == null ? null : String(t).replace(/\s+/g, ' ').trim().slice(0, n));
const placeholders = (s) => (s ? [...new Set(String(s).match(/\{\$[A-Za-z]+\}/g) || [])] : []);
const around = (s, needle, n = 110) => {
    if (!s) return null;
    const i = String(s).indexOf(needle);
    return i < 0 ? null : String(s).slice(Math.max(0, i - n), i + needle.length + n).replace(/\s+/g, ' ');
};

/** Settings › Workflow › "Emails" tab › "Manage Emails", in English, as a manager does. */
async function openManageEmails(app, page) {
    await page.goto(app.url(`/index.php/${app.contextPath}/en/management/settings/workflow`));
    await idle(page);
    const tab = page.getByRole('tab', {name: /^Emails$/}).first();
    let via = 'tab';
    if (await tab.isVisible().catch(() => false)) {
        await tab.click();
        await idle(page);
    } else {
        via = 'tab not found';
    }
    const link = page.locator('a[href*="manageEmails"]:visible').first();
    if (await link.isVisible().catch(() => false)) {
        via += `, link "${flat(await link.innerText())}"`;
        await link.click();
        await page.waitForURL(/manageEmails/, {timeout: T});
    } else {
        via += '; link not found, address typed';
        await page.goto(app.url(`/index.php/${app.contextPath}/en/management/settings/manageEmails`));
    }
    await idle(page);
    await page.locator('.manageEmails__listPanel .listPanel__item').first().waitFor({timeout: T}).catch(() => {});
    await idle(page);
    return via;
}

/**
 * On the open "Manage Emails", press "Edit" on the email `name`; when it opens the email's
 * window (several templates), the first template's "Edit". In "Edit Template" press "French"
 * and read the subject and body per language (each language has its own editor in the form).
 */
async function readTemplate(page, name) {
    const out = {email: name};
    const btn = page.locator('main').getByRole('button', {name: `Edit ${name}`, exact: true});
    out.listed = await btn.count();
    if (!out.listed) return out;
    await loc(page, `Manage Emails: "Edit ${name}"`, btn);
    const respP = page.waitForResponse((r) => /api\/v1\/(mailables|emailTemplates)\//.test(r.url()) && r.request().method() === 'GET', {timeout: 20_000}).catch(() => null);
    await btn.click();
    const r = await respP;
    out.kind = r && /mailables/.test(r.url()) ? 'email window first' : 'template window';
    await idle(page);
    if (out.kind === 'email window first') {
        const win = page.getByRole('dialog', {name, exact: true}).last();
        await win.waitFor({timeout: 20_000}).catch(() => {});
        out.windowRows = await win.locator('.listPanel__item').evaluateAll((els) => els.map((e) => e.innerText.replace(/\s+/g, ' ').trim()));
        await win.locator('.listPanel__item').first().getByRole('button', {name: 'Edit', exact: true}).click();
    }
    const d = page.getByRole('dialog', {name: 'Edit Template'}).last();
    await d.waitFor({timeout: 20_000});
    await idle(page);
    // the form's language button above the fields ("French"; the current language, "English", is plain text)
    const french = d.getByRole('button', {name: 'French', exact: true});
    out.frenchButton = await french.count();
    if (out.frenchButton) {
        await loc(page, 'Edit Template: the "French" language button', french);
        await french.first().click();
        await sleep(800);
        out.pressedFrench = true;
    }
    await page.waitForFunction(() => window.tinymce && window.tinymce.get().filter((e) => /body/.test(e.id)).every((e) => e.initialized), null, {timeout: 15_000}).catch(() => {});
    await sleep(500);
    const read = await d.evaluate((el) => ({
        subjects: [...el.querySelectorAll('input')].filter((e) => /^subject-/.test(e.name)).map((e) => ({name: e.name, value: e.value})),
        bodies: (window.tinymce ? window.tinymce.get() : []).filter((e) => /body/.test(e.id) && el.contains(e.getContainer())).map((e) => ({id: e.id, html: e.getContent(), text: e.getContent({format: 'text'})})),
    }));
    out.subjects = read.subjects;
    out.bodies = read.bodies.map((b) => ({id: b.id, placeholders: placeholders(b.html), journalName: around(b.text, '{$journalName}'), contextName: around(b.text, '{$contextName}'), text: flat(b.text, 700)}));
    return out;
}

/** Close the top window by its own "Close" button. */
async function closeTop(page) {
    const d = page.locator('[role="dialog"]:visible').last();
    const c = d.getByRole('button', {name: 'Close', exact: true}).first();
    if (await c.count()) await c.click().catch(() => {});
    await sleep(800);
}

/**
 * The daily task that sends the reminder, as an administrator runs it from the command line:
 * `php lib/pkp/tools/scheduler.php test --name='PKP\task\EditorialReminders'` in the app root,
 * under the install's config. The jobs it queues run on the next page load (job_runner = On) or
 * through the app's own job runner (the kit's drainJobs).
 */
function runReminderTask(app) {
    try {
        return flat(execFileSync('php', ['lib/pkp/tools/scheduler.php', 'test', '--name=PKP\\task\\EditorialReminders'], {
            cwd: app.root,
            env: {...process.env, PKP_CONFIG_FILE: app.configFile},
            encoding: 'utf8',
            timeout: 120_000,
        }), 600);
    } catch (e) {
        return {error: flat(`${e.stdout || ''}${e.stderr || ''}${e.message}`, 800)};
    }
}

module.exports = {T, sleep, flat, placeholders, around, openManageEmails, readTemplate, closeTop, runReminderTask};
