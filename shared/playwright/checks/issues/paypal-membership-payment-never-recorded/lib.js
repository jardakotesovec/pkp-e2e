// Helpers of walk.js (issue report docs/issues/U52-A13-paypal-membership-payment-never-recorded.md).
// Requiring this file runs nothing. The screen helpers press what a person presses or read what the
// screen shows; they are copied from ../paypal-error-page-no-heading/lib.js,
// ../paid-member-refused-restricted-galleys/lib.js and ../priced-file-link-price-twice-or-missing/lib.js,
// so this folder stands alone. paypalReturn() is the Evidence's PHP call (paypal-return.php beside
// this file), standing in for the one step only PayPal takes; the SQL reads are evidence reads.
const path = require('path');
const {execFileSync} = require('child_process');
const {idle, sql} = require('../../../probe');

const T = 30_000;
const CTX = 'publicknowledge';
const ISSUE = 'Vol. 1 No. 2 (2014)';
const SUBSCRIPTION_MODE = 'The journal will require subscriptions to access some or all of its contents.';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (s, n = 400) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));
const rel = (u) => (u == null ? u : String(u).replace(/^https?:\/\/[^/]+/, ''));

/**
 * Settings › Distribution › "Payments": "Enable", a currency, a method, "Account Name" for
 * PayPal (the box that makes it count as set up), "Save".
 */
async function setUpPaypal(page, app, {currency = 'USD', accountName}) {
    const {PaymentSettingsTab} = require('../../../pages/PaymentsPages.js');
    const tab = new PaymentSettingsTab(page, app.contextPath);
    await tab.goto();
    const before = {enabled: await tab.enableBox().isChecked()};
    await tab.enableBox().check();
    await tab.currencySelect().waitFor({state: 'visible', timeout: T});
    await tab.currencySelect().selectOption(currency);
    await tab.pluginSelect().selectOption({label: 'Paypal Fee Payment'});
    await tab.accountNameBox().fill(accountName);
    const chosen = {currency: await tab.chosenOption(tab.currencySelect()), method: await tab.chosenOption(tab.pluginSelect())};
    const response = await tab.save();
    return {before, chosen, saveStatus: response.status(), saved: flat(await tab.savedStatus().innerText().catch(() => null), 60)};
}

/** The journal's "Payments" page › "Payment Types": each box in `fees` ({label: amount}), "Save". */
async function setPaymentTypes(page, app, fees) {
    const {JournalPaymentsPage} = require('../../../pages/PaymentsPages.js');
    const payments = new JournalPaymentsPage(page, app.contextPath);
    await payments.goto();
    const tab = await payments.showPaymentTypes();
    for (const [label, amount] of Object.entries(fees)) await tab.type(label, String(amount));
    const response = await tab.save();
    await idle(page).catch(() => {});
    const out = {save: response.status()};
    for (const label of Object.keys(fees)) out[label] = await tab.box(label).inputValue();
    return out;
}

/** The journal's "Payments" page › the "Payments" tab: "No Items", or each row's cells. */
async function readPaymentsList(page, app) {
    const {JournalPaymentsPage} = require('../../../pages/PaymentsPages.js');
    const payments = new JournalPaymentsPage(page, app.contextPath);
    await payments.goto();
    await payments.showTab('Payments');
    await idle(page).catch(() => {});
    await sleep(500);
    const noItems = await payments.listNoItems().isVisible().catch(() => false);
    const rows = noItems
        ? []
        : await payments.listRows().evaluateAll((trs) =>
              trs.map((tr) => [...tr.querySelectorAll(':scope > td')].map((td) => (td.textContent || '').replace(/[\s ]+/g, ' ').trim()))
          );
    return {noItems, rows};
}

/** Settings › Distribution › "Access": the subscription choice of "Publishing Mode", "Save". */
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

/** Issues › "Back Issues" › the issue's "Edit" › "Access": "Subscription", "Save"; read back. */
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

/** A payment page as the payer meets it: the answer's status, title, `h1`s, the page's text. */
async function readPaymentPage(page, response) {
    await idle(page).catch(() => {});
    await sleep(500);
    const dom = await page.evaluate(() => {
        const t = (el) => (el ? (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim() : null);
        const main = document.querySelector('.pkp_structure_main') || document.querySelector('main') || document.body;
        return {title: document.title, h1: [...main.querySelectorAll('h1')].map((h) => t(h)), text: t(main.querySelector('.page') || main)};
    });
    return {url: rel(page.url()), status: response ? response.status() : null, ...dom, text: flat(dom.text, 500)};
}

/** A page of the journal opened by typing its address after the journal's. */
async function typeAddress(page, app, address) {
    const response = await page.goto(app.url(`/index.php/${app.contextPath}/${address}`));
    return readPaymentPage(page, response);
}

/** "Archives" › the issue › the article's galley link by its label; the page it opens. */
async function pressArticleGalley(page, app, articleStart, label) {
    await page.goto(app.url(`/index.php/${CTX}/issue/archive`));
    await idle(page).catch(() => {});
    await page.getByRole('link', {name: ISSUE}).first().click();
    await page.waitForLoadState('load').catch(() => {});
    await idle(page).catch(() => {});
    const link = page
        .locator('.obj_article_summary')
        .filter({has: page.locator('.title', {hasText: articleStart})})
        .locator('a.obj_galley_link')
        .filter({hasText: label})
        .first();
    const linkRead = flat(await link.innerText().catch(() => null), 120);
    const answered = page.waitForResponse((r) => r.request().resourceType() === 'document' && r.status() < 300, {timeout: 60_000});
    await link.click();
    return {link: linkRead, ...(await readPaymentPage(page, await answered))};
}

/** OMP: a book's workflow, "Publication" › "Publication Formats". Returns the page object. */
async function openFormats(page, app, submissionId) {
    const {WorkflowPage} = require('../../../pages/WorkflowPage.js');
    const {PublicationFormatsPage} = require(path.join(app.suiteDir, 'pages', 'PublicationFormatPages.js'));
    const frame = new WorkflowPage(page, app.contextPath, {labels: {publicationGroup: 'Publication'}});
    await frame.gotoEditorial(submissionId);
    await idle(page);
    const link = frame.menuLink('Publication Formats');
    if (!(await link.last().isVisible().catch(() => false))) await frame.latestVersionNode().click();
    await link.last().waitFor({state: 'visible', timeout: T});
    await link.last().click();
    const formats = new PublicationFormatsPage(page, app.contextPath);
    await formats.grid().locator('tr.gridRow').first().waitFor({state: 'visible', timeout: T});
    await idle(page);
    return formats;
}

/** OMP: a file's terms link, "Direct Sales", the price, "Save". */
async function setDirectSales(page, formats, format, fileName, price) {
    const win = await formats.openTerms(format, fileName);
    await win.choose('directSales');
    await win.typePrice(price);
    const response = await win.pressSave();
    await win.expectClosed();
    await idle(page);
    await sleep(600);
    return {saveStatus: response.status()};
}

/** OMP: "Catalog", the book's title. */
async function openBook(page, app, title) {
    await page.goto(app.url(`/index.php/${app.contextPath}/${app.testApi === false ? '' : 'en/'}catalog`));
    const answered = page.waitForResponse((r) => r.request().resourceType() === 'document' && /\/catalog\/book\//.test(r.url()));
    await page.getByRole('link', {name: title}).first().click();
    const r = await answered;
    await idle(page).catch(() => {});
    return {url: rel(page.url()), status: r.status()};
}

/** OMP: the book's priced file link pressed on its page; the page it opens. */
async function pressPricedLink(page, linkText) {
    const link = page.locator('.obj_monograph_full .entry_details .item.files a.cmp_download_link').filter({hasText: linkText}).first();
    const linkRead = flat(await link.innerText().catch(() => null), 120);
    const answered = page.waitForResponse((r) => r.request().resourceType() === 'document' && r.status() < 300, {timeout: 60_000});
    await link.click();
    return {link: linkRead, ...(await readPaymentPage(page, await answered))};
}

/** Evidence read: the user's queued payment ids and completed payment rows. */
function paymentRows(app, username) {
    const uid = sql(app, `SELECT user_id FROM users WHERE username = '${username}'`).trim();
    return {
        queued: sql(app, `SELECT queued_payment_id FROM queued_payments WHERE payment_data LIKE '%userId";i:${uid};%' ORDER BY 1`).split('\n').filter(Boolean),
        completed: sql(app, `SELECT payment_type, context_id, user_id, assoc_id, amount, currency_code_alpha, payment_method_plugin_name FROM completed_payments WHERE user_id = ${uid} ORDER BY completed_payment_id`)
            .split('\n')
            .filter(Boolean),
    };
}

/** The newest queued payment of a user (the one the payment page just stored). */
function lastQueued(app, username) {
    const q = paymentRows(app, username).queued;
    return q.length ? q[q.length - 1] : null;
}

/**
 * Evidence, not a step: what PaypalPaymentPlugin::handle() runs once PayPal confirms a payment
 * (fulfillQueuedPayment(), then redirectUrl() of the request's address), run from PHP on the
 * fleet's install for one queued payment (paypal-return.php beside this file).
 */
function paypalReturn(app, queuedPaymentId) {
    try {
        const out = execFileSync('php', [path.join(__dirname, 'paypal-return.php'), String(queuedPaymentId)], {
            cwd: app.root,
            env: {...process.env, PKP_CONFIG_FILE: app.configFile},
            encoding: 'utf8',
            timeout: 120_000,
        }).trim();
        const last = out.split('\n').filter(Boolean).pop();
        try {
            return JSON.parse(last);
        } catch {
            return {raw: flat(out, 1500)};
        }
    } catch (e) {
        return {failed: flat(String(e.stdout || '') + String(e.stderr || '') + e.message, 1500)};
    }
}

module.exports = {
    T, CTX, ISSUE, sleep, flat, rel,
    setUpPaypal, setPaymentTypes, readPaymentsList, requireSubscriptions, restrictIssue,
    readPaymentPage, typeAddress, pressArticleGalley,
    openFormats, setDirectSales, openBook, pressPricedLink,
    paymentRows, lastQueued, paypalReturn,
};
