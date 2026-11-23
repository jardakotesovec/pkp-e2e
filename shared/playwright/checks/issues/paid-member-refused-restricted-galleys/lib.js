// Helpers of walk.js here (issue report docs/issues/U51-A33-paid-member-refused-restricted-galleys.md).
// Requiring this file runs nothing. The screen helpers press what a person presses or read what the
// screen shows (copied from ../non-pdf-galley-shown-open-refused/lib.js,
// ../oai-jats-list-refused-for-one-subscription-article/lib.js and
// ../priced-file-link-price-twice-or-missing/lib.js, so this folder stands alone); plantMembership()
// is the Steps' one SQL precondition and paypalReturn() the Evidence's PHP call, both named as such.
const path = require('path');
const {execFileSync} = require('child_process');
const {idle, shot, sql} = require('../../../probe');

const T = 30_000;
const CTX = 'publicknowledge';
const ISSUE = 'Vol. 1 No. 2 (2014)';
const SUBSCRIPTION_MODE = 'The journal will require subscriptions to access some or all of its contents.';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (s, n = 400) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));
const rel = (u) => (u == null ? u : String(u).replace(/^https?:\/\/[^/]+/, ''));

const PDF = (name) => ({
    name,
    mimeType: 'application/pdf',
    buffer: Buffer.from(
        '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
            '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n'
    ),
});

/** a. Settings › Distribution › "Access": the subscription choice of "Publishing Mode", "Save". */
async function requireSubscriptions(page) {
    const {AccessSettings} = require('../../../pages/SubscriptionsPages.js');
    const access = new AccessSettings(page, CTX);
    await access.goto();
    const radio = access.modeRadio(SUBSCRIPTION_MODE);
    const was = await radio.isChecked();
    await radio.check();
    const r = await access.save();
    return {was, checked: await radio.isChecked(), save: r.status()};
}

/** b. Settings › Distribution › "Payments": "Enable", a currency, "Manual Fee Payment", instructions, "Save". */
async function setUpPayments(page, app, {currency = 'USD', instructions = 'u51n23m pay by cheque'} = {}) {
    const {PaymentSettingsTab} = require('../../../pages/PaymentsPages.js');
    const tab = new PaymentSettingsTab(page, app.contextPath);
    await tab.goto();
    const before = {enabled: await tab.enableBox().isChecked()};
    await tab.enableBox().check();
    await tab.currencySelect().waitFor({state: 'visible', timeout: T});
    await tab.currencySelect().selectOption(currency);
    await tab.pluginSelect().selectOption({label: 'Manual Fee Payment'});
    await tab.instructionsBox().fill(instructions);
    const chosen = {currency: await tab.chosenOption(tab.currencySelect()), method: await tab.chosenOption(tab.pluginSelect())};
    const response = await tab.save();
    return {before, chosen, saveStatus: response.status(), saved: flat(await tab.savedStatus().innerText().catch(() => null), 60)};
}

/** c. The "Payments" page › "Payment Types": each fee box in `fees` ({label: amount}), "Save". */
async function setPaymentTypes(page, app, {fees = {}} = {}) {
    const {JournalPaymentsPage} = require('../../../pages/PaymentsPages.js');
    const payments = new JournalPaymentsPage(page, app.contextPath);
    await payments.goto();
    const tab = await payments.showPaymentTypes();
    for (const [label, amount] of Object.entries(fees)) await tab.type(label, String(amount));
    const response = await tab.save();
    await idle(page).catch(() => {});
    const out = {save: response.status()};
    for (const label of ['Purchase Issue', 'Purchase Article', 'Association Membership']) out[label] = await tab.box(label).inputValue();
    return out;
}

/** d. Issues › "Back Issues" › the issue's "Edit" › "Access": "Subscription", "Save"; read back. */
async function restrictIssue(page) {
    const {IssuesAdmin} = require('../../../pages/IssuesPages.js');
    const issues = new IssuesAdmin(page, CTX);
    await issues.goto('Back Issues');
    let win = await issues.openManagement('Back Issues', ISSUE);
    const form = await win.openAccess();
    const select = form.locator('select#accessStatus');
    const out = {was: flat(await select.locator('option:checked').innerText())};
    await select.selectOption({label: 'Subscription'});
    const saved = page.waitForResponse((r) => /update-access/.test(r.url()) && r.request().method() === 'POST', {timeout: T}).catch(() => null);
    await form.getByRole('button', {name: 'Save', exact: true}).click();
    const r = await saved;
    out.save = r ? r.status() : null;
    await idle(page).catch(() => {});
    await page.waitForTimeout(800);
    await issues.goto('Back Issues');
    win = await issues.openManagement('Back Issues', ISSUE);
    const again = await win.openAccess();
    out.now = flat(await again.locator('select#accessStatus option:checked').innerText());
    await win.close();
    return out;
}

/** e. The same issue › "Issue Galleys" › "Create Issue Galley": a label, a file, "Save". */
async function createIssueGalley(page, {label, file}) {
    const {IssuesAdmin} = require('../../../pages/IssuesPages.js');
    const issues = new IssuesAdmin(page, CTX);
    await issues.goto('Back Issues');
    const win = await issues.openManagement('Back Issues', ISSUE);
    await win.openTab('Issue Galleys');
    const gw = await win.openCreateGalley();
    await gw.labelBox().fill(label);
    const up = await gw.upload(file);
    const saved = await gw.save();
    await idle(page).catch(() => {});
    const labels = (await win.galleyLabels().allInnerTexts()).map((t) => flat(t, 60));
    await win.close();
    return {upload: up.status(), save: saved.status(), galleys: labels};
}

/**
 * The Steps' SQL precondition: a membership paid through PayPal on OJS 3.3, as 3.3's
 * OJSPaymentManager::fulfillQueuedPayment() recorded it and an install upgraded from 3.3 keeps
 * it: the completed payment (OJSCompletedPaymentDAO::insertObject(): type 1, the journal, the
 * user, assoc 0, the fee, the currency, the method) and the end date a year after it as the
 * user setting dateEndMembership (updateSetting(..., 'date', 0): 'Y-m-d 23:59:59', no locale).
 * `paidAgo` is a PostgreSQL interval ('0 days' for today; '2 years' for a membership that
 * ended a year ago).
 */
function plantMembership(app, username, paidAgo) {
    const paid = `now() - interval '${paidAgo}'`;
    sql(
        app,
        `INSERT INTO completed_payments (timestamp, payment_type, context_id, user_id, assoc_id, amount, currency_code_alpha, payment_method_plugin_name) ` +
            `SELECT date_trunc('second', ${paid}), 1, j.journal_id, u.user_id, 0, 7, 'USD', 'PaypalPayment' FROM users u, journals j ` +
            `WHERE u.username = '${username}' AND j.path = '${CTX}'`
    );
    sql(
        app,
        `INSERT INTO user_settings (user_id, locale, setting_name, setting_value) ` +
            `SELECT user_id, '', 'dateEndMembership', to_char(${paid} + interval '1 year', 'YYYY-MM-DD') || ' 23:59:59' ` +
            `FROM users WHERE username = '${username}'`
    );
    return {setting: membershipRows(app, username), payments: paymentRows(app, username).completed};
}

/** What the account holds: its dateEndMembership rows (evidence read). */
function membershipRows(app, username) {
    return sql(app, `SELECT s.setting_name, s.locale, s.setting_value FROM user_settings s JOIN users u ON u.user_id = s.user_id WHERE u.username = '${username}' AND s.setting_name = 'dateEndMembership'`)
        .split('\n')
        .filter(Boolean);
}

/** The reader's payments (evidence read): queued and completed rows of the user. */
function paymentRows(app, username) {
    const uid = sql(app, `SELECT user_id FROM users WHERE username = '${username}'`).trim();
    return {
        queued: sql(app, `SELECT queued_payment_id FROM queued_payments WHERE payment_data LIKE '%userId";i:${uid};%' ORDER BY 1`).split('\n').filter(Boolean),
        completed: sql(app, `SELECT payment_type, context_id, user_id, assoc_id, amount, currency_code_alpha, payment_method_plugin_name FROM completed_payments WHERE user_id = ${uid}`)
            .split('\n')
            .filter(Boolean),
    };
}

/**
 * Evidence, not Steps: the code PaypalPaymentPlugin::handle() runs once PayPal confirms a payment,
 * OJSPaymentManager::fulfillQueuedPayment($request, $queuedPayment, 'PaypalPayment'), run from PHP
 * on the fleet's install for one queued payment (paypal-return.php beside this file).
 */
function paypalReturn(app, queuedPaymentId) {
    try {
        return execFileSync('php', [path.join(__dirname, 'paypal-return.php'), String(queuedPaymentId)], {
            cwd: app.root,
            env: {...process.env, PKP_CONFIG_FILE: app.configFile},
            encoding: 'utf8',
            timeout: 120_000,
        }).trim();
    } catch (e) {
        return `FAILED: ${flat(String(e.stdout || '') + String(e.stderr || '') + e.message, 1500)}`;
    }
}

/** Step 2: the issue's page as a reader opens it from "Archives". */
async function openIssue(page, app) {
    await page.goto(app.url(`/index.php/${CTX}/issue/archive`));
    await idle(page).catch(() => {});
    await page.getByRole('link', {name: ISSUE}).first().click();
    await page.waitForLoadState('load').catch(() => {});
    await idle(page).catch(() => {});
}

/** Every galley link on the page: where it sits, label, padlock (class `restricted`), address. */
async function readLinks(page) {
    return page.locator('a.obj_galley_link, a.obj_galley_link_supplementary').evaluateAll((as) =>
        as.map((a) => {
            const label = [...a.childNodes]
                .filter((n) => !(n.nodeType === 1 && n.classList.contains('pkp_screen_reader')))
                .map((n) => n.textContent)
                .join(' ')
                .replace(/\s+/g, ' ')
                .trim();
            const article = a.closest('.obj_article_summary');
            return {
                where: article ? (article.querySelector('.title')?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 50) : 'Full Issue',
                label,
                padlock: a.classList.contains('restricted'),
                href: a.getAttribute('href').replace(/^https?:\/\/[^/]+/, ''),
            };
        })
    );
}

/** Press one galley link (by where it sits and its label) and say where the reader landed. */
async function pressLink(page, where, label) {
    const links = await readLinks(page);
    const i = links.findIndex((l) => l.where.startsWith(where) && (l.label === label || l.label.startsWith(`${label} (`)));
    if (i < 0) return {offered: false, links};
    const navs = [];
    const onResponse = (r) => {
        if (r.request().isNavigationRequest() && r.request().frame() === page.mainFrame()) navs.push(`${r.status()} ${rel(r.url())}`);
    };
    page.on('response', onResponse);
    await page.locator('a.obj_galley_link, a.obj_galley_link_supplementary').nth(i).click();
    await page.waitForLoadState('load').catch(() => {});
    await idle(page).catch(() => {});
    await sleep(800);
    page.off('response', onResponse);
    return {offered: true, pressed: links[i], ...(await landed(page)), navigations: navs};
}

/** Where the reader is: address, title, heading, the payment table, whether a viewer shows. */
async function landed(page) {
    const main = page.locator('.pkp_structure_main').first();
    const hasMain = (await main.count()) > 0;
    return {
        url: rel(page.url()),
        title: flat(await page.title().catch(() => null), 120),
        heading: hasMain ? flat(await main.locator('h1, h2').first().innerText({timeout: 3000}).catch(() => null), 120) : null,
        paymentTable: hasMain
            ? await main.locator('.page_payment_form table tr').evaluateAll((trs) => trs.map((tr) => tr.innerText.replace(/\s+/g, ' ').trim())).catch(() => [])
            : [],
        viewer: (await page.locator('iframe, #htmlContainer, .galley_view').count()) > 0,
        text: hasMain ? flat(await main.innerText().catch(() => ''), 400) : flat(await page.locator('body').innerText().catch(() => ''), 300),
    };
}

/** Steps 2–4 for one signed-in reader: the issue, its article PDF, its "Full Issue" PDF. */
async function pressBoth(page, app, label) {
    await openIssue(page, app);
    const links = await readLinks(page);
    const article = await pressLink(page, 'Antimicrobial', 'PDF');
    await shot(page, `${label}-article-pdf`).catch(() => {});
    await openIssue(page, app);
    const full = await pressLink(page, 'Full Issue', 'PDF');
    await shot(page, `${label}-fullissue-pdf`).catch(() => {});
    return {links, article, full};
}

module.exports = {
    T, CTX, ISSUE, sleep, flat, rel, PDF,
    requireSubscriptions, setUpPayments, setPaymentTypes, restrictIssue, createIssueGalley,
    plantMembership, membershipRows, paymentRows, paypalReturn,
    openIssue, readLinks, pressLink, landed, pressBoth,
};
