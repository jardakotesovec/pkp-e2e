// Helpers of walk.js (issue report docs/issues/U51-A31-uzbek-subscription-texts-placeholders-raw.md).
// Requiring this file runs nothing. Every helper presses what a person presses or types an
// address, on OJS (the one app with subscriptions). Copied from the U51 walks' libs
// (purchase-on-active-subscription-removes-access, issue-contents-lock-galleys-reader-can-open,
// oai-jats-list-refused-for-one-subscription-article, custom-block-delete-fails-postgresql,
// priced-file-link-price-twice-or-missing) so this folder stands alone.
const {idle, shot} = require('../../../probe');

const T = 30_000;
const ISSUE = 'Vol. 1 No. 2 (2014)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (s, n = 400) =>
    s == null
        ? s
        : String(s)
              .replace(/[\s ]+/g, ' ')
              .trim()
              .slice(0, n);
const rel = (u) => (u == null ? u : String(u).replace(/^https?:\/\/[^/]+/, ''));
const pages = () => require('../../../pages/SubscriptionsPages.js');

/** A journal address in a language (`issue/archive`, `user/subscriptions`). */
function journalUrl(app, locale, tail = '') {
    return app.url(`/index.php/${app.contextPath}/${locale}${tail ? `/${tail}` : ''}`);
}

/** P1: Administration › Site Settings › Site Setup › Languages › "Install Locale": the boxes, "Save". */
async function installLocale(page, codes) {
    const {SiteLanguagesList} = require('../../../pages/LanguagesPages.js');
    const list = new SiteLanguagesList(page);
    await list.goto();
    const win = await list.openInstall();
    const labels = {};
    for (const c of codes) {
        labels[c] = flat(await win.box(c).evaluate((b) => (b.closest('label') || b.parentElement).innerText));
        await win.box(c).check();
    }
    const answer = await win.save();
    await list.reload();
    const rows = {};
    for (const c of codes) rows[c] = await list.cellTexts(c).catch((e) => String(e.message));
    return {labels, status: answer.status(), rows};
}

/** P2: Settings › Website › Setup › Languages: "UI" ticked on each row. */
async function tickUi(page, app, codes) {
    const {JournalLanguagesTab} = require('../../../pages/LanguagesPages.js');
    const tab = new JournalLanguagesTab(page, app.contextPath, {locale: 'en'});
    await tab.goto();
    const out = {};
    for (const c of codes) {
        const r = await tab.pressWebsite(c, 'uiLocale');
        out[c] = {status: r.response && r.response.status(), alerts: r.alerts};
    }
    await page.reload();
    await tab.openTab();
    for (const c of codes) out[c].ui = await tab.website.cell(c, 'uiLocale').isChecked();
    return out;
}

/** P3: Settings › Distribution › "Payments": "Enable", a currency, "Manual Fee Payment", instructions, "Save". */
async function setUpPayments(page, app, {currency = 'USD', instructions = 'h21s: pay by cheque'} = {}) {
    const {PaymentSettingsTab} = require('../../../pages/PaymentsPages.js');
    const tab = new PaymentSettingsTab(page, app.contextPath);
    await tab.goto();
    await tab.enableBox().check();
    await tab.currencySelect().waitFor({state: 'visible', timeout: T});
    await tab.currencySelect().selectOption(currency);
    await tab.pluginSelect().selectOption({label: 'Manual Fee Payment'});
    await tab.instructionsBox().fill(instructions);
    const response = await tab.save();
    return {saveStatus: response.status(), saved: flat(await tab.savedStatus().innerText().catch(() => null), 60)};
}

/** P4: Settings › Distribution › "Access": the subscription choice of "Publishing Mode", "Save". */
async function requireSubscriptions(page, app) {
    const {AccessSettings, SUBSCRIPTIONS_TEXT: TEXT} = pages();
    const access = new AccessSettings(page, app.contextPath);
    await access.goto();
    const radio = access.modeRadio(TEXT.modeSubscription);
    await radio.check();
    const r = await access.save();
    return {checked: await radio.isChecked(), save: r.status()};
}

/** P5: "Payments" › "Payment Types": each fee box in `fees`, "Save". */
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

/** P6: "Payments" › "Subscription Types" › "Create New Subscription Type", filled, "Save". */
async function createType(page, app, {name, cost}) {
    const {PaymentsPage, SUBSCRIPTIONS_TEXT: TEXT} = pages();
    const pay = new PaymentsPage(page, app.contextPath);
    await pay.gotoTab('Subscription Types');
    const win = await pay.openCreateType();
    await win.fill({name, currency: 'USD', cost: String(cost), format: 'Online', duration: '12'});
    await win.kindRadio(TEXT.individual).check();
    const r = await win.saveAccepted();
    return {save: r.status(), rows: await pay.firstCells('Subscription Types')};
}

/** P7: "Payments" › "Individual Subscriptions" › "Create New Subscription": user, type, "Active", dates, "Save". */
async function createSubscription(page, app, {username, userId, type, start, end}) {
    const {PaymentsPage} = pages();
    const tab = 'Individual Subscriptions';
    const pay = new PaymentsPage(page, app.contextPath);
    await pay.gotoTab(tab);
    const win = await pay.openCreateSubscription(tab);
    await win.chooseUser(username, userId);
    await win.chooseType(type);
    await win.chooseStatus('Active');
    await win.typeDate('dateStart', start);
    await win.typeDate('dateEnd', end);
    const r = await win.saveAccepted();
    await pay.gotoTab(tab);
    return {save: r.status(), row: await pay.rowCells(tab, username).catch((e) => flat(e.message, 200))};
}

/** P8: Issues › "Back Issues" › the issue's "Edit" › "Access": "Subscription", "Save". */
async function restrictIssue(page, app, name = ISSUE) {
    const {IssuesAdmin} = require('../../../pages/IssuesPages.js');
    const issues = new IssuesAdmin(page, app.contextPath);
    await issues.goto('Back Issues');
    const win = await issues.openManagement('Back Issues', name);
    const form = await win.openAccess();
    const select = form.locator('select#accessStatus');
    const was = flat(await select.locator('option:checked').innerText());
    await select.selectOption({label: 'Subscription'});
    const saved = page.waitForResponse((r) => /update-access/.test(r.url()) && r.request().method() === 'POST', {timeout: T}).catch(() => null);
    await form.getByRole('button', {name: 'Save', exact: true}).click();
    const r = await saved;
    await idle(page).catch(() => {});
    await sleep(800);
    await win.close().catch(() => {});
    return {was, save: r ? r.status() : null};
}

/** P9: Settings › Website › "Appearance" › "Setup": tick "Subscription Block" under "Sidebar", "Save". */
async function placeSubscriptionBlock(page, app) {
    await page.goto(app.url(`/index.php/${app.contextPath}/en/management/settings/website`));
    await idle(page);
    await page.locator('#appearance-button').first().click();
    await idle(page);
    await page.locator('#appearance').getByRole('tab', {name: 'Setup', exact: true}).first().click();
    await page.locator('input[name="sidebar"]').first().waitFor({timeout: T});
    await idle(page);
    const boxes = await page.locator('input[name="sidebar"]').evaluateAll((els) =>
        els.map((e) => ({value: e.value, checked: e.checked, label: (e.closest('label') || e.parentElement).innerText.trim()}))
    );
    const box = boxes.find((b) => b.label === 'Subscription Block') || boxes.find((b) => /Subscription/.test(b.label));
    if (!box) throw new Error(`no Subscription Block under "Sidebar": ${JSON.stringify(boxes.map((b) => b.label))}`);
    await page.locator(`input[name="sidebar"][value="${box.value}"]`).first().check();
    const form = page.locator('form').filter({has: page.locator('input[name="sidebar"]')}).first();
    await form.getByRole('button', {name: 'Save', exact: true}).click();
    const saved = await page
        .locator('[role="status"]:has-text("Saved")')
        .first()
        .waitFor({timeout: T})
        .then(() => true)
        .catch(() => false);
    return {label: box.label, saved};
}

/** A select's options as the screen lists them, and the one chosen. */
async function readSelect(select) {
    await select.waitFor({state: 'attached', timeout: T});
    const options = await select.locator('option').evaluateAll((os) => os.map((o) => ({value: o.value, text: (o.textContent || '').replace(/\s+/g, ' ').trim()})));
    const chosen = await select.evaluate((s) => (s.selectedIndex >= 0 ? {value: s.value, text: s.options[s.selectedIndex].textContent.replace(/\s+/g, ' ').trim()} : null));
    const label = await select.evaluate((s) => {
        const byFor = s.id ? document.querySelector(`label[for="${s.id}"]`) : null;
        const l = byFor || s.closest('.pkpFormField, .section, fieldset')?.querySelector('label, legend');
        return l ? l.textContent.replace(/\s+/g, ' ').trim() : null;
    });
    const texts = options.map((o) => o.text);
    return {label, count: options.length, distinct: new Set(texts).size, first: texts.slice(0, 4), last: texts.slice(-2), chosen};
}

/** Settings › Distribution › "Access" in a language (`locale` in the address): the "Delayed Open Access" list. */
async function openAccessTab(page, app, locale) {
    await page.goto(journalUrl(app, locale, 'management/settings/distribution'));
    await idle(page);
    await page.locator('[id="access-button"]').first().click();
    const select = page.locator('[role="tabpanel"][id="access"] select').first();
    await select.waitFor({state: 'visible', timeout: T});
    await idle(page);
    return select;
}

/** The "Access" tab's "Save" (the Vue form's footer button), bounded by the save's answer. */
async function saveAccessTab(page) {
    const panel = page.locator('[role="tabpanel"][id="access"]');
    const answer = page.waitForResponse((r) => /\/api\/v1\/contexts\/\d+/.test(r.url()) && r.request().method() !== 'GET', {timeout: T}).catch(() => null);
    await panel.locator('.pkpFormPage__footer button, button.pkpButton').filter({visible: true}).last().click();
    const r = await answer;
    await idle(page).catch(() => {});
    return {status: r ? r.status() : null, statusText: flat(await panel.locator('[role="status"]').innerText().catch(() => null), 80)};
}

/** "Payments" › "Subscription Policies" in a language: the four reminder lists. */
async function readPolicyLists(page, app, locale) {
    await page.goto(journalUrl(app, locale, 'payments'));
    await idle(page);
    await page.locator('a[name="subscriptionPolicies"]').first().click();
    const names = ['numMonthsBeforeSubscriptionExpiryReminder', 'numWeeksBeforeSubscriptionExpiryReminder', 'numMonthsAfterSubscriptionExpiryReminder', 'numWeeksAfterSubscriptionExpiryReminder'];
    await page.locator(`select[name="${names[0]}"]`).first().waitFor({state: 'visible', timeout: T});
    await idle(page);
    const out = {tab: flat(await page.locator('a[name="subscriptionPolicies"]').first().innerText().catch(() => null), 80)};
    for (const n of names) out[n] = await readSelect(page.locator(`select[name="${n}"]`).first());
    return out;
}

/** Every galley link on the page: where it sits, its whole text, the screen-reader words, the price. */
async function readLinks(page) {
    return page.locator('a.obj_galley_link, a.obj_galley_link_supplementary').evaluateAll((as) =>
        as.map((a) => {
            const t = (el) => (el ? (el.textContent || '').replace(/\s+/g, ' ').trim() : null);
            const article = a.closest('.obj_article_summary');
            return {
                where: article ? (t(article.querySelector('.title')) || '').slice(0, 50) : a.closest('.obj_issue_toc') ? 'Full Issue' : 'article page',
                text: a.innerText.replace(/\s+/g, ' ').trim(),
                restricted: a.classList.contains('restricted'),
                screenReader: t(a.querySelector('.pkp_screen_reader')),
                price: t(a.querySelector('.purchase_cost')),
            };
        })
    );
}

/** "Archives", the issue, its links; then the article's own page and its links. */
async function readIssueAndArticle(page, app, locale, title, name) {
    await page.goto(journalUrl(app, locale, 'issue/archive'));
    await idle(page).catch(() => {});
    // The issue's title reads "Vol. 1 No. 2 (2014)" in English and differently in other languages: the year is common to all.
    const issueLink = page.locator('.obj_issue_summary a.title, .issues_archive a.title').filter({hasText: '2014'}).first();
    const issueTitle = flat(await issueLink.innerText(), 120);
    await issueLink.click();
    await page.waitForLoadState('load').catch(() => {});
    await idle(page).catch(() => {});
    const issue = {url: rel(page.url()), lang: await page.evaluate(() => document.documentElement.lang), issueTitle, links: await readLinks(page)};
    await shot(page, `${name}-issue`).catch(() => {});
    await page.locator('.obj_article_summary .title a').filter({hasText: title}).first().click();
    await page.waitForLoadState('load').catch(() => {});
    await idle(page).catch(() => {});
    const article = {url: rel(page.url()), links: await readLinks(page)};
    await shot(page, `${name}-article`).catch(() => {});
    return {issue, article};
}

/** "My Subscriptions" in a language: the individual part's rows, and the sidebar's "Subscription" block. */
async function readMySubscriptions(page, app, locale, name) {
    const resp = await page.goto(journalUrl(app, locale, 'user/subscriptions'));
    await idle(page).catch(() => {});
    const out = await page.evaluate(() => {
        const t = (el) => (el ? (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim() : null);
        const main = document.querySelector('.pkp_structure_main');
        const rows = main ? [...main.querySelectorAll('table tr')].map((tr) => t(tr)).filter(Boolean) : [];
        const block = document.querySelector('.pkp_structure_sidebar .block_subscription');
        return {
            lang: document.documentElement.lang,
            heading: t(main && main.querySelector('h1')),
            rows,
            block: block ? {title: t(block.querySelector('.title')), lines: [...block.querySelectorAll('.content > p')].map(t)} : null,
        };
    });
    await shot(page, name).catch(() => {});
    return {status: resp && resp.status(), url: rel(page.url()), ...out};
}

/** The placeholders left in a text ("{$ x}", "{$ date}"). */
const placeholders = (s) => String(s || '').match(/\{\s*\$\s*[a-zA-Z]*\s*\}/g) || [];

module.exports = {
    T,
    ISSUE,
    sleep,
    flat,
    rel,
    journalUrl,
    installLocale,
    tickUi,
    setUpPayments,
    requireSubscriptions,
    setPaymentTypes,
    createType,
    createSubscription,
    restrictIssue,
    placeSubscriptionBlock,
    readSelect,
    openAccessTab,
    saveAccessTab,
    readPolicyLists,
    readLinks,
    readIssueAndArticle,
    readMySubscriptions,
    placeholders,
};
