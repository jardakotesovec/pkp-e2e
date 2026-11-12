// @ts-check
/**
 * @file shared/playwright/pages/SubscriptionsPages.js
 *
 * Page objects for Subscriptions & open access control (spec:
 * docs/specs/U51-subscriptions.md). Subscriptions are a journal's alone,
 * so only the OJS suite drives these; the OMP and OPS absence suite reads
 * its screens through its own locators. The issue and article screens are
 * IssuesPages', ArticleLandingPages' and GalleysPages'; this file adds the
 * reads a restriction needs on them (the padlock, the screen-reader words,
 * the fee) as functions over their locators.
 *
 * Surfaces:
 * - AccessSettings — Settings › Distribution › "Access": "Publishing Mode"
 *   (three radios), "Delayed Open Access" (a list shown only with the
 *   second mode), "Save" and its "Saved".
 * - PaymentsPage — the "Payments" page (`/payments`, headed
 *   "Subscriptions"): its six tabs; the legacy lists of "Individual
 *   Subscriptions", "Institutional Subscriptions" and "Subscription
 *   Types" (rows, cells, "No Items", a row's arrow and its links, the
 *   in-page "Delete" / "Renew" questions); "Create New Subscription" and
 *   "Create New Subscription Type"; the "Subscription Policies" form
 *   (PoliciesForm) and the "Payment Types" form (PaymentTypesForm).
 * - SubscriptionWindow — "Create New Subscription" / "Edit Subscription":
 *   "Locate a User", "Subscription type", "Status", the dates,
 *   "Institution", "Mailing address", "Domain", "Membership", "Reference
 *   Number", the email box, "Save", the header "Close".
 * - TypeWindow — "Create New Subscription Type" / "Edit Subscription
 *   Type": "Name of Type", "Currency", "Cost", "Format", "Duration", the
 *   two kind radios, the two option boxes, "Save", "Close".
 * - EditorialSideMenu — the backend side menu's entries read by label
 *   (`#app-nav`), for the Subscription Manager and "Institutions".
 * - InstitutionsPage — Settings › "Institutions": the list's names.
 * - SubscriptionsReader — the reader's "Subscriptions" page
 *   (`about/subscriptions`): breadcrumb, heading, "Subscription
 *   Information", "Subscriptions Contact", the two type tables and their
 *   "Purchase New Subscription".
 * - MySubscriptionsPage — "My Subscriptions" (`user/subscriptions`): the
 *   status table, the individual and institutional parts, their rows and
 *   buttons, "Purchase New Subscription".
 * - PurchasePage — "Purchase Individual Subscription" and "Purchase
 *   Institutional Subscription" (`form#subscriptionForm`), and the
 *   refusals at the top of the page.
 * - ManualPaymentPage — the "Manual Fee Payment" page.
 * - SubscriptionBlock — the sidebar's "Subscription" block.
 * - The reader-side galley reads: `galleyLink`, `galleyIcon`,
 *   `expectLocked`, `expectUnlocked`, `lockWords`, `feeWords`.
 *
 * Browser dialogs (a window's "The data on this form has changed…"
 * confirm) are the caller's: register SubmissionFilesPages'
 * `recordBrowserDialogs` before a step that may ask.
 *
 * DOM shapes (U51 claim check, `.reports/U51/screen-notes.md` ccK1–ccK3,
 * the tojs probes and the default theme's templates, 2026-09-25): every
 * list on the "Payments" page is a legacy pkp grid (rows `tr.gridRow`,
 * the first cell opening with the arrow link "Settings", a row's links in
 * the next `tr.row_controls` after the arrow `a.show_extras` is pressed);
 * a window's refusal is the form's own "Errors occurred processing this
 * form" block or a `label.error` under the box, both inside the window;
 * a saved window shows the passing notice "Your changes have been
 * saved." (IssuesPages' `notice`). A reader-side galley link is
 * `a.obj_galley_link` (`a.obj_galley_link_supplementary` for an
 * additional file); a restricted one carries class `restricted`, a
 * `.pkp_screen_reader` span ("Requires Subscription") and, with a fee, a
 * `.purchase_cost` span; the padlock is the link's `::before` glyph
 * (FontAwesome U+F023; a PDF's file icon is U+F1C1).
 */
const {expect} = require('@playwright/test');
const {BasePage} = require('./BasePage.js');
const {waitForJQueryIdle} = require('../support/legacy.js');
const {pastCloseWindow, questionDialog, answerQuestion} = require('./IdentifiersPages.js');

const T = 30_000;

/** The journal's strings (OJS and lib/pkp locales). */
const TEXT = {
    saved: 'Your changes have been saved.',
    settingsSaved: 'Saved',
    noItems: 'No Items',
    fieldRequired: 'This field is required.',
    badEmail: 'Please enter a valid email address.',
    formChanged: 'The data on this form has changed. Do you wish to continue without saving?',
    modeOpen: 'The journal will provide open access to its contents.',
    modeSubscription: 'The journal will require subscriptions to access some or all of its contents.',
    modeNone: "OJS will not be used to publish the journal's contents online.",
    tabs: [
        'Individual Subscriptions',
        'Institutional Subscriptions',
        'Subscription Types',
        'Subscription Policies',
        'Payment Types',
        'Payments',
    ],
    individual: 'Individual (users are validated via login)',
    institutional: 'Institutional (users are validated via domain or IP address)',
    membershipOption:
        'Subscriptions require membership information (e.g. of an association, organization, consortium, etc.)',
    hiddenOption: 'Do not make this subscription type publicly available or visible on the website.',
    costNotNumber: 'The cost must be a positive, numeric value.',
    durationNotNumber: 'The duration must be a positive, numeric value.',
    deleteTypeQuestion:
        'Warning! All subscriptions with this subscription type will also be deleted. Are you sure you want to continue and delete this subscription type?',
    deleteQuestion: 'Are you sure you wish to delete this subscription?',
    renewQuestion: 'Are you sure you want to renew this subscription?',
    userRequired: 'A user is required.',
    userHasOne: 'This user already has a subscription for this journal.',
    typeFirst: 'A subscription type must be created before new subscriptions can be made.',
    institutionFirst: 'An institution must be created before new subscriptions can be made.',
    startRequired: 'A subscription start date is required.',
    endRequired: 'A subscription end date is required.',
    needsDomainOrIp: 'The selected subscription type requires a domain and/or an IP range for subscription authentication.',
    badDomain: 'Please enter a valid domain.',
    badIpRange: 'Please enter a valid IP range.',
    institutionNameRequired: 'An institution name is required.',
    domainHelp: 'If a domain is entered here, IP ranges are optional. Valid values are domain names (e.g. lib.sfu.ca).',
    emailBox: 'Send the user an email with their username and subscription details.',
    openAccessBox:
        'Registered readers will have the option of receiving the table of contents by email when an issue becomes open access.',
    restrictOnlyPdf: 'Only Restrict Access to PDF version of issues and articles',
    paymentBoxes: [
        'Notify Subscription Manager by email upon online purchase of an Individual subscription.',
        'Notify Subscription Manager by email upon online purchase of an Institutional subscription (recommended).',
        'Notify Subscription Manager by email upon online renewal of an Individual subscription.',
        'Notify Subscription Manager by email upon online renewal of an Institutional subscription.',
    ],
    roleDenied: 'The current role does not have access to this operation.',
    requiresSubscription: 'Requires Subscription',
    requiresSubscriptionOrFee: 'Requires Subscription or Fee',
    loginSubscription: 'Subscription required to access item. To verify subscription, log in to journal.',
    loginPurchaseArticle:
        'Subscription or article purchase required to access item. To verify subscription, access previous purchase, or purchase article, log in to journal.',
    individualDescription: 'Individual subscriptions require login to access subscription content.',
    institutionalDescription:
        "Institutional subscriptions do not require login. The user's domain and/or IP address is used to provide access to subscription content.",
    purchaseNew: 'Purchase New Subscription',
    blockTitle: 'Subscription',
    blockLogin: 'Login to access subscriber-only resources.',
    blockRequired: 'A subscription is required to access some resources.',
    learnMore: 'Learn More',
    mySubscriptions: 'My Subscriptions',
    nonExpiring: 'Non-expiring',
    expires: (date) => `Expires: ${date}`,
    expired: (date) => `Expired: ${date}`,
    providedBy: (name) => `Access provided by: ${name}`,
    accessedFrom: (ip) => `Accessed from: ${ip}`,
    awaitingManual: 'Awaiting Manual Payment',
    manualPayment: 'Manual Fee Payment',
    sendNotification: 'Send notification of payment',
    subscriptionFee: (type) => `Subscription Fee (${type})`,
    purchaseArticleFee: 'Purchase Article Fee',
    purchaseIndividualTitle: 'Purchase Individual Subscription',
    purchaseInstitutionalTitle: 'Purchase Institutional Subscription',
    purchaseLegend: 'Purchase Subscription',
    statusRows: ['Needs Information', 'Needs Approval', 'Awaiting Manual Payment', 'Awaiting Online Payment'],
};
exports.SUBSCRIPTIONS_TEXT = TEXT;

/** The requests the screens send, for `waitForResponse`. */
const REQUEST = {
    saveSubscription: /subscriptions-grid\/update-subscription(\?|$)/,
    saveType: /subscription-types-grid\/update-subscription-type/,
    deleteType: /subscription-types-grid\/delete-subscription-type/,
    deleteSubscription: /subscriptions-grid\/delete-subscription/,
    renewSubscription: /subscriptions-grid\/renew-subscription/,
    savePolicies: /saveSubscriptionPolicies/,
    savePaymentTypes: /savePaymentTypes/,
    saveContext: /\/api\/v1\/contexts\/\d+/,
};
exports.SUBSCRIPTIONS_REQUEST = REQUEST;

/** The padlock and a PDF's file icon, as the galley link's `::before` glyph. */
const GLYPH = {lock: '', pdf: ''};
exports.GLYPH = GLYPH;

function escapeRe(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Collapse runs of white space (the no-break space included) and trim. */
function flat(text) {
    return String(text || '').replace(/[\s ]+/g, ' ').trim();
}
exports.flat = flat;

/** Wait for the request whose address matches `pattern` (any method but GET). */
function sent(page, pattern) {
    return page.waitForResponse((r) => pattern.test(r.url()) && r.request().method() !== 'GET', {timeout: T});
}

// ---------------------------------------------------------------------------
// Reader-side galley links (Rules 7, 8, 10)
// ---------------------------------------------------------------------------

/**
 * A galley link by its label ("PDF"), inside `scope` (an article page's
 * side column, an issue page, an article summary). The link's text also
 * carries the screen-reader words and the fee, so the label is matched as
 * a word, not as the whole text.
 *
 * @param {import('@playwright/test').Locator} scope
 * @param {string} label
 */
function galleyLink(scope, label) {
    return scope
        .locator('a.obj_galley_link, a.obj_galley_link_supplementary')
        .filter({hasText: new RegExp(`(^|\\s)${escapeRe(label)}(\\s|$)`)});
}
exports.galleyLink = galleyLink;

/** The link's icon: its `::before` glyph without the quotes ('' when none). */
async function galleyIcon(link) {
    return link.evaluate((a) => {
        const content = getComputedStyle(a, '::before').content;
        return !content || content === 'none' || content === 'normal' ? '' : content.replace(/^["']|["']$/g, '');
    });
}
exports.galleyIcon = galleyIcon;

/** The words a screen reader hears before the label (`.pkp_screen_reader`). */
function lockWords(link) {
    return link.locator('.pkp_screen_reader');
}
exports.lockWords = lockWords;

/** The fee after the label ("(USD 5)"). */
function feeWords(link) {
    return link.locator('.purchase_cost');
}
exports.feeWords = feeWords;

/**
 * The link shows the padlock in place of its file icon (Rule 10), and a
 * screen reader hears `words` before the label.
 */
async function expectLocked(link, words = TEXT.requiresSubscription) {
    await expect(link).toBeVisible({timeout: T});
    await expect(link).toHaveClass(/(^|\s)restricted(\s|$)/);
    await expect.poll(() => galleyIcon(link)).toBe(GLYPH.lock);
    await expect(lockWords(link)).toHaveText(words);
}
exports.expectLocked = expectLocked;

/** The link shows no padlock and no screen-reader words; `icon` its glyph when given. */
async function expectUnlocked(link, icon) {
    await expect(link).toBeVisible({timeout: T});
    await expect(link).not.toHaveClass(/(^|\s)restricted(\s|$)/);
    await expect.poll(() => galleyIcon(link)).not.toBe(GLYPH.lock);
    if (icon !== undefined) {
        await expect.poll(() => galleyIcon(link)).toBe(icon);
    }
    await expect(lockWords(link)).toHaveCount(0);
}
exports.expectUnlocked = expectUnlocked;

/** The login page's message line (Rule 12). */
function loginMessage(page, text) {
    return page.locator('.pkp_structure_main').getByText(text, {exact: true});
}
exports.loginMessage = loginMessage;

// ---------------------------------------------------------------------------
// Settings › Distribution › "Access" (Rules 1–6)
// ---------------------------------------------------------------------------

class AccessSettings extends BasePage {
    /**
     * @param {import('@playwright/test').Page} page
     * @param {string} contextPath
     */
    constructor(page, contextPath) {
        super(page);
        this.contextPath = contextPath;
    }

    panel() {
        return this.page.getByRole('tabpanel', {name: 'Access', exact: true});
    }

    /** Open Settings › Distribution and its "Access" tab. */
    async goto() {
        await this.page.goto(this.contextUrl(this.contextPath, '/management/settings/distribution'));
        await this.page.getByRole('tab', {name: 'Access', exact: true}).click();
        await expect(this.modeRadio(TEXT.modeOpen)).toBeVisible({timeout: T});
    }

    /** A "Publishing Mode" radio by its label. */
    modeRadio(label) {
        return this.panel().getByRole('radio', {name: label, exact: true});
    }

    /** The three radios, in order. */
    modeRadios() {
        return this.panel().getByRole('group', {name: 'Publishing Mode'}).getByRole('radio');
    }

    /** "Delayed Open Access". */
    delayedList() {
        return this.panel().getByRole('combobox', {name: 'Delayed Open Access'});
    }

    /** "Save": bounded by the save's answer, then "Saved". */
    async save() {
        const answer = sent(this.page, REQUEST.saveContext);
        await this.panel().getByRole('button', {name: 'Save', exact: true}).click();
        const response = await answer;
        await expect(this.panel().locator('[role="status"]').filter({hasText: TEXT.settingsSaved})).toBeVisible({timeout: T});
        return response;
    }
}
exports.AccessSettings = AccessSettings;

// ---------------------------------------------------------------------------
// The "Payments" page
// ---------------------------------------------------------------------------

/**
 * Reveal a legacy grid row's controls (behind its arrow) and return their
 * row (patterns.md pitfall 10); a press the handler missed is repeated.
 *
 * @param {import('@playwright/test').Locator} row
 */
async function rowControls(row) {
    await expect(row).toBeVisible({timeout: T});
    const controls = row.locator('xpath=following-sibling::tr[contains(@class,"row_controls")][1]');
    for (let attempt = 0; attempt < 3; attempt++) {
        if (await controls.isVisible()) return controls;
        await row.locator('a.show_extras').click();
        try {
            await expect(controls).toBeVisible({timeout: 10_000});
            return controls;
        } catch (e) {
            if (attempt === 2) throw e;
        }
    }
    return controls;
}

class PaymentsPage extends BasePage {
    /**
     * @param {import('@playwright/test').Page} page
     * @param {string} contextPath
     */
    constructor(page, contextPath) {
        super(page);
        this.contextPath = contextPath;
    }

    url() {
        return this.contextUrl(this.contextPath, '/payments');
    }

    /** Open the page by its address; it opens on "Individual Subscriptions". */
    async goto() {
        await this.page.goto(this.url());
        await expect(this.heading()).toBeVisible({timeout: T});
        await expect(this.grid(TEXT.tabs[0]).locator('table')).toBeVisible({timeout: T});
        await waitForJQueryIdle(this.page);
    }

    /** Open the page and a tab. */
    async gotoTab(name) {
        await this.goto();
        if (name !== TEXT.tabs[0]) await this.showTab(name);
    }

    heading() {
        return this.page.getByRole('main').getByRole('heading', {level: 1});
    }

    /** The tabs, in order (a locator for `toHaveText`). */
    tabs() {
        return this.page.getByRole('main').getByRole('tab');
    }

    tab(name) {
        return this.page.getByRole('main').getByRole('tab', {name, exact: true});
    }

    selectedTab() {
        return this.page.getByRole('main').locator('[role="tab"][aria-selected="true"]');
    }

    panel(name) {
        return this.page.getByRole('tabpanel', {name, exact: true});
    }

    /** Press a tab and wait for its list or form. */
    async showTab(name) {
        await this.tab(name).click();
        await expect(this.tab(name)).toHaveAttribute('aria-selected', 'true', {timeout: T});
        await expect(this.panel(name).locator('table, form').filter({visible: true}).first()).toBeVisible({timeout: T});
        await waitForJQueryIdle(this.page);
    }

    /** A tab's list. */
    grid(name) {
        return this.panel(name).locator('.pkp_controllers_grid').first();
    }

    /** "No Items" in a tab's list. */
    noItems(tab) {
        return this.grid(tab).locator('tbody.empty td').filter({hasText: TEXT.noItems});
    }

    /** The rows of a tab's list (the control rows aside). */
    rows(tab) {
        return this.grid(tab).locator('tr.gridRow:not(.row_controls)').filter({visible: true});
    }

    /** A row by a text it holds (a surname, a type or institution name). */
    row(tab, text) {
        return this.rows(tab).filter({hasText: text});
    }

    /**
     * A row read as its cells' texts, the first cell's arrow label
     * ("Settings") left out.
     *
     * @returns {Promise<string[]>}
     */
    async rowCells(tab, text) {
        const row = this.row(tab, text);
        await expect(row).toHaveCount(1, {timeout: T});
        return row.locator('> td').evaluateAll((cells) =>
            cells.map((td) => {
                const clone = /** @type {HTMLElement} */ (td.cloneNode(true));
                clone.querySelectorAll('a.show_extras, a.hide_extras').forEach((a) => a.remove());
                return (clone.textContent || '').replace(/[\s ]+/g, ' ').trim();
            })
        );
    }

    /** The list's first-cell texts, in order (arrow label aside). */
    async firstCells(tab) {
        return this.rows(tab).evaluateAll((rows) =>
            rows.map((tr) => {
                const td = /** @type {HTMLElement} */ (tr.querySelector('td').cloneNode(true));
                td.querySelectorAll('a.show_extras, a.hide_extras').forEach((a) => a.remove());
                return (td.textContent || '').replace(/[\s ]+/g, ' ').trim();
            })
        );
    }

    /** Press a row's arrow; returns the row of its links. */
    async openRowControls(tab, text) {
        return rowControls(this.row(tab, text));
    }

    /** A row's visible links, in order. */
    async rowActionNames(tab, text) {
        const controls = await this.openRowControls(tab, text);
        return (await controls.locator('a').filter({visible: true}).allInnerTexts()).map((t) => t.trim());
    }

    /** Press a row's link ("Edit", "Renew", "Delete"). */
    async pressRowAction(tab, text, link) {
        const controls = await this.openRowControls(tab, text);
        await controls.getByRole('link', {name: link, exact: true}).click();
    }

    /** Press a row's link that asks a question; returns the question's dialog. */
    async openQuestion(tab, text, link, question) {
        await this.pressRowAction(tab, text, link);
        const dialog = questionDialog(this.page, question);
        await expect(dialog).toBeVisible({timeout: T});
        return dialog;
    }

    /** Answer a question "OK" (bounded by `request`) or "Cancel". */
    async answer(dialog, answer, request) {
        return answerQuestion(this.page, dialog, answer, request);
    }

    /** Press "Create New Subscription" on a subscriptions tab: the window. */
    async openCreateSubscription(tab) {
        await this.panel(tab).getByRole('link', {name: 'Create New Subscription', exact: true}).click();
        const win = new SubscriptionWindow(this.page, 'Create New Subscription');
        await win.expectOpen();
        return win;
    }

    /** A row's "Edit" on a subscriptions tab: the window. */
    async openEditSubscription(tab, text) {
        await this.pressRowAction(tab, text, 'Edit');
        const win = new SubscriptionWindow(this.page, 'Edit Subscription');
        await win.expectOpen();
        return win;
    }

    /** Press "Create New Subscription Type": the window. */
    async openCreateType() {
        const tab = 'Subscription Types';
        await this.panel(tab).getByRole('link', {name: 'Create New Subscription Type', exact: true}).click();
        const win = new TypeWindow(this.page, 'Create New Subscription Type');
        await win.expectOpen();
        return win;
    }

    /** A type row's "Edit": the window. */
    async openEditType(name) {
        await this.pressRowAction('Subscription Types', name, 'Edit');
        const win = new TypeWindow(this.page, 'Edit Subscription Type');
        await win.expectOpen();
        return win;
    }

    /** The "Subscription Policies" form (on its tab). */
    policies() {
        return new PoliciesForm(this.page, this.panel('Subscription Policies'));
    }

    /** The "Payment Types" form (on its tab). */
    paymentTypes() {
        return new PaymentTypesForm(this.page, this.panel('Payment Types'));
    }
}
exports.PaymentsPage = PaymentsPage;

// ---------------------------------------------------------------------------
// The windows
// ---------------------------------------------------------------------------

/**
 * A legacy window's refusal `message`: inside the window (its in-place
 * notification or a message under a box), or the passing notice the
 * in-place notification becomes while the window's top is out of view
 * (lib/pkp NotificationHandler, `visibleWithoutScrolling_`).
 *
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').Locator} dialog
 * @param {string} message
 */
function refusal(page, dialog, message) {
    return dialog
        .getByText(message)
        .or(page.locator('.app__notifications .pkpNotification').filter({hasText: message}))
        .first();
}
exports.refusal = refusal;

class LegacyWindow extends BasePage {
    /**
     * @param {import('@playwright/test').Page} page
     * @param {string} title
     */
    constructor(page, title) {
        super(page);
        this.title = title;
        this.dialog = page.getByRole('dialog', {name: title, exact: true});
    }

    form() {
        return this.dialog.locator('form.pkp_form').first();
    }

    /** The window is open, its form loaded. */
    async expectOpen() {
        await expect(this.form()).toBeVisible({timeout: T});
        await waitForJQueryIdle(this.page);
    }

    /** A box's message under it (`label.error`). */
    fieldError(text) {
        return this.dialog.locator('label.error').filter({hasText: text});
    }

    /** Every message under a box, in order. */
    fieldErrors() {
        return this.dialog.locator('label.error').filter({visible: true});
    }

    /** "Save". */
    saveButton() {
        return this.dialog.getByRole('button', {name: 'Save', exact: true});
    }

    /** The header "Close" (asks when a change is unsaved; the caller answers). */
    async close() {
        await this.dialog.getByRole('button', {name: 'Close', exact: true}).click();
        await expect(this.dialog).toHaveCount(0, {timeout: T});
        await waitForJQueryIdle(this.page);
        await pastCloseWindow(this.page);
    }
}

class SubscriptionWindow extends LegacyWindow {
    /**
     * The window is open and its "Locate a User" list loaded. The list
     * loads after the form (and again after every refused "Save"); a
     * "Save" pressed before it is back sends no user.
     */
    async expectOpen() {
        await super.expectOpen();
        await this.expectUsersLoaded();
    }

    async expectUsersLoaded() {
        await expect(this.dialog.locator('#subscriberSelectGridContainer .pkp_controllers_grid table')).toBeVisible({timeout: T});
        await expect(this.dialog.locator('#subscriberSelectGridContainer .item_count').first()).toBeVisible({timeout: T});
        await waitForJQueryIdle(this.page);
    }

    /** "Locate a User": the search box. */
    userSearchBox() {
        return this.dialog.locator('form#userSearchForm input[name="search"]');
    }

    /** A user's round button in "Locate a User", by the user's id. */
    userRadio(userId) {
        return this.dialog.locator(`input[type="radio"]#user_${userId}, input[type="radio"][name="userId"][value="${userId}"]`).first();
    }

    /** Find a user by username in "Locate a User" and choose them. */
    async chooseUser(username, userId) {
        await this.userSearchBox().fill(username);
        await this.userSearchBox().press('Enter');
        await expect(this.userRadio(userId)).toBeVisible({timeout: T});
        await waitForJQueryIdle(this.page);
        await this.userRadio(userId).check();
    }

    typeSelect() {
        return this.dialog.locator('select[name="typeId"]');
    }

    /** The "Subscription type" choices, as the list shows them. */
    async typeOptions() {
        return (await this.typeSelect().locator('option').allInnerTexts()).map(flat).filter(Boolean);
    }

    /** Choose a type by its name (the option reads "{name} - {duration} - {cost}"). */
    async chooseType(name) {
        const label = (await this.typeOptions()).find((o) => o === name || o.startsWith(`${name} - `));
        expect(label, `a "Subscription type" choice for ${name}`).toBeTruthy();
        await this.typeSelect().selectOption({label: /** @type {string} */ (label)});
    }

    statusSelect() {
        return this.dialog.locator('select[name="status"]');
    }

    async chooseStatus(label) {
        await this.statusSelect().selectOption({label});
    }

    /** The date box the reader types in ("dateStart" / "dateEnd"). */
    dateBox(which) {
        return this.dialog.locator(`input[name="${which}-removed"]`);
    }

    /**
     * Type a date (`YYYY-MM-DD`). The calendar reads a typed date on a key
     * release, so a Shift press follows the text; Escape then closes the
     * calendar, and is pressed only while the calendar shows: with it
     * closed, Escape closes the window itself.
     */
    async typeDate(which, value) {
        const box = this.dateBox(which);
        const calendar = this.page.locator('#ui-datepicker-div');
        await box.fill(value);
        await box.press('Shift');
        if (await calendar.isVisible()) {
            await box.press('Escape');
            await expect(calendar).toBeHidden({timeout: T});
        }
        await expect(this.dialog).toBeVisible();
    }

    institutionSelect() {
        return this.dialog.locator('select[name="institutionId"]');
    }

    async chooseInstitution(label) {
        await this.institutionSelect().selectOption({label});
    }

    mailingAddressBox() {
        return this.dialog.locator('[name="institutionMailingAddress"]');
    }

    domainBox() {
        return this.dialog.locator('input[name="domain"]');
    }

    membershipBox() {
        return this.dialog.locator('input[name="membership"]');
    }

    referenceBox() {
        return this.dialog.locator('input[name="referenceNumber"]');
    }

    notesArea() {
        return this.dialog.locator('[name^="notes"]');
    }

    /** "Send the user an email with their username and subscription details." */
    emailBox() {
        return this.dialog.locator('input[name="notifyEmail"]');
    }

    /** "Save": the save's answer (the window stays open on a refusal, its lists reloaded). */
    async save() {
        const answer = sent(this.page, REQUEST.saveSubscription);
        await this.saveButton().click();
        const response = await answer;
        await waitForJQueryIdle(this.page);
        const body = await response.text();
        if (/<form/.test(body)) await this.expectUsersLoaded();
        return response;
    }

    /** "Save" accepted: the window closes. */
    async saveAccepted() {
        const response = await this.save();
        await expect(this.dialog).toHaveCount(0, {timeout: T});
        await pastCloseWindow(this.page);
        return response;
    }

    /**
     * "Save" refused by the server: the window stays, with `message` in it
     * or, when the window's top is scrolled out of view, as a passing
     * notice (the in-place notification hands itself up then).
     */
    async saveRefused(message) {
        await this.save();
        await expect(this.form()).toBeVisible({timeout: T});
        await expect(refusal(this.page, this.dialog, message)).toBeVisible({timeout: T});
    }
}
exports.SubscriptionWindow = SubscriptionWindow;

class TypeWindow extends LegacyWindow {
    nameBox() {
        return this.dialog.locator('input[name^="name["]').first();
    }

    currencySelect() {
        return this.dialog.locator('select[name="currency"]');
    }

    costBox() {
        return this.dialog.locator('input[name="cost"]');
    }

    formatSelect() {
        return this.dialog.locator('select[name="format"]');
    }

    durationBox() {
        return this.dialog.locator('input[name="duration"]');
    }

    /** The "Individual" / "Institutional" radio. */
    kindRadio(label) {
        return this.dialog.getByRole('radio', {name: label, exact: true});
    }

    membershipBox() {
        return this.dialog.getByRole('checkbox', {name: TEXT.membershipOption, exact: true});
    }

    hiddenBox() {
        return this.dialog.getByRole('checkbox', {name: TEXT.hiddenOption, exact: true});
    }

    /** Fill the window (only the fields given). */
    async fill({name, currency, cost, format, duration} = {}) {
        if (name !== undefined) await this.nameBox().fill(name);
        if (currency !== undefined) await this.currencySelect().selectOption(currency);
        if (cost !== undefined) await this.costBox().fill(cost);
        if (format !== undefined) await this.formatSelect().selectOption({label: format});
        if (duration !== undefined) await this.durationBox().fill(duration);
    }

    /** "Save" refused in the browser: nothing is sent, the message shows under the box. */
    async saveRefusedInBrowser(message) {
        await this.saveButton().click();
        await expect(this.fieldError(message).first()).toBeVisible({timeout: T});
    }

    /** "Save" refused by the server: the window stays open; returns the answer. */
    async saveRefused() {
        const answer = sent(this.page, REQUEST.saveType);
        await this.saveButton().click();
        const response = await answer;
        await waitForJQueryIdle(this.page);
        await expect(this.form()).toBeVisible({timeout: T});
        return response;
    }

    /** "Save" accepted: the window closes. */
    async saveAccepted() {
        const answer = sent(this.page, REQUEST.saveType);
        await this.saveButton().click();
        const response = await answer;
        await expect(this.dialog).toHaveCount(0, {timeout: T});
        await waitForJQueryIdle(this.page);
        await pastCloseWindow(this.page);
        return response;
    }
}
exports.TypeWindow = TypeWindow;

// ---------------------------------------------------------------------------
// "Subscription Policies" and "Payment Types"
// ---------------------------------------------------------------------------

class PoliciesForm extends BasePage {
    /**
     * @param {import('@playwright/test').Page} page
     * @param {import('@playwright/test').Locator} panel
     */
    constructor(page, panel) {
        super(page);
        this.panel = panel;
    }

    nameBox() {
        return this.panel.locator('input[name="subscriptionName"]');
    }

    emailBox() {
        return this.panel.locator('input[name="subscriptionEmail"]');
    }

    phoneBox() {
        return this.panel.locator('input[name="subscriptionPhone"]');
    }

    addressBox() {
        return this.panel.locator('[name="subscriptionMailingAddress"]');
    }

    /** The message under a box (the validator's `label.error` for the box's id). */
    async errorUnder(box) {
        const id = await box.getAttribute('id');
        return this.panel.locator(`label.error[for="${id}"]`);
    }

    /** Type into "Subscription Information" (TinyMCE; the editor must be up first). */
    async typeInformation(text) {
        const frame = this.panel.frameLocator('iframe').first();
        const body = frame.locator('body');
        await expect(body).toBeVisible({timeout: T});
        await body.click();
        await body.fill(text);
    }

    /** "Full expiry" / "Partial expiry". */
    expiryRadio(label) {
        return this.panel.getByRole('radio', {name: label, exact: true});
    }

    /** The four "Online Payment Notifications" boxes, in order. */
    paymentBoxes() {
        return TEXT.paymentBoxes.map((label) => this.panel.getByRole('checkbox', {name: label, exact: true}));
    }

    /** "Registered readers will have the option…". */
    openAccessBox() {
        return this.panel.getByRole('checkbox', {name: TEXT.openAccessBox, exact: true});
    }

    saveButton() {
        return this.panel.getByRole('button', {name: 'Save', exact: true});
    }

    /** "Save" accepted: bounded by its answer. */
    async save() {
        const answer = sent(this.page, REQUEST.savePolicies);
        await this.saveButton().click();
        const response = await answer;
        await waitForJQueryIdle(this.page);
        return response;
    }
}
exports.PoliciesForm = PoliciesForm;

class PaymentTypesForm extends BasePage {
    /**
     * @param {import('@playwright/test').Page} page
     * @param {import('@playwright/test').Locator} panel
     */
    constructor(page, panel) {
        super(page);
        this.panel = panel;
    }

    restrictOnlyPdfBox() {
        return this.panel.getByRole('checkbox', {name: TEXT.restrictOnlyPdf, exact: true});
    }

    /** "Save": bounded by its answer. */
    async save() {
        const answer = this.page.waitForResponse(
            (r) => r.request().method() === 'POST' && /payment/i.test(r.url()) && !/fetch/.test(r.url()),
            {timeout: T}
        );
        await this.panel.getByRole('button', {name: 'Save', exact: true}).click();
        const response = await answer;
        await waitForJQueryIdle(this.page);
        return response;
    }
}
exports.PaymentTypesForm = PaymentTypesForm;

// ---------------------------------------------------------------------------
// The backend side menu and "Institutions"
// ---------------------------------------------------------------------------

class EditorialSideMenu extends BasePage {
    nav() {
        return this.page.locator('nav#app-nav');
    }

    /** Every top entry's label, in order. */
    async labels() {
        await expect(this.nav()).toBeVisible({timeout: T});
        return this.nav()
            .locator('[role="button"][aria-label], [role="treeitem"][aria-label]')
            .evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
    }

    /** An entry by its label (a group header or an item). */
    entry(label) {
        return this.nav().locator(`[aria-label="${label}"]`);
    }

    /** Every editorial side-menu entry on the page (none on a reader page). */
    anyEntry() {
        return this.page.locator('nav#app-nav [aria-label]');
    }
}
exports.EditorialSideMenu = EditorialSideMenu;

class InstitutionsPage extends BasePage {
    /**
     * @param {import('@playwright/test').Page} page
     * @param {string} contextPath
     */
    constructor(page, contextPath) {
        super(page);
        this.contextPath = contextPath;
    }

    async goto() {
        await this.page.goto(this.contextUrl(this.contextPath, '/management/settings/institutions'));
        await expect(this.page.locator('.institutionsListPanel')).toBeVisible({timeout: T});
    }

    /** The list's names (a locator for `toHaveText`). */
    names() {
        return this.page.locator('.institutionsListPanel .listPanel__itemTitle');
    }
}
exports.InstitutionsPage = InstitutionsPage;

// ---------------------------------------------------------------------------
// The reader's pages (Rules 26–33)
// ---------------------------------------------------------------------------

class ReaderPage extends BasePage {
    /**
     * @param {import('@playwright/test').Page} page
     * @param {string} contextPath
     */
    constructor(page, contextPath) {
        super(page);
        this.contextPath = contextPath;
    }

    url(tail) {
        return this.contextUrl(this.contextPath, `/${tail}`);
    }

    main() {
        return this.page.locator('.pkp_structure_main');
    }

    heading() {
        return this.main().locator('h1').first();
    }

    breadcrumb() {
        return this.page.locator('.cmp_breadcrumbs');
    }

    /** "Subscription Information" (the policies' text). */
    information() {
        return this.main().locator('.cmp_subscription_contact .description');
    }

    /** "Subscriptions Contact" and its lines. */
    contact() {
        return this.main().locator('.cmp_subscription_contact .contact');
    }

    contactLine(part) {
        return this.contact().locator(`.${part}`);
    }

    /** The journal's home page is on screen (its address, its main area). */
    async expectHome() {
        await expect(this.page).toHaveURL(new RegExp(`/index\\.php/${escapeRe(this.contextPath)}(/index)?/?$`));
        await expect(this.page.locator('.page_index_journal')).toBeAttached({timeout: T});
    }
}

class SubscriptionsReader extends ReaderPage {
    async goto() {
        return this.page.goto(this.url('about/subscriptions'));
    }

    /** The "Subscriptions" page is on screen. */
    async expectOpen() {
        await expect(this.page).toHaveURL(/\/about\/subscriptions(#.*)?$/);
        await expect(this.page.locator('.page_subscriptions')).toBeVisible({timeout: T});
        await expect(this.heading()).toHaveText('Subscriptions');
    }

    /** A part's heading ("Individual Subscriptions", "Institutional Subscriptions"). */
    partHeading(name) {
        return this.main().locator('.page_subscriptions h3').filter({hasText: new RegExp(`^\\s*${escapeRe(name)}\\s*$`)});
    }

    /** The line under a part's heading. */
    partDescription(name) {
        return this.partHeading(name).locator('xpath=following-sibling::p[1]');
    }

    /** A part's table. */
    table(name) {
        return this.partHeading(name).locator('xpath=following-sibling::table[1]');
    }

    /** A table's column headings. */
    columns(name) {
        return this.table(name).locator('th');
    }

    /** The type names a table lists, in order. */
    typeNames(name) {
        return this.table(name).locator('.subscription_name');
    }

    /** A type's row. */
    typeRow(name, type) {
        return this.table(name).locator('tr').filter({has: this.page.locator('.subscription_name', {hasText: new RegExp(`^\\s*${escapeRe(type)}\\s*$`)})});
    }

    /** "Purchase New Subscription" links on the page, in order. */
    purchaseLinks() {
        return this.main().getByRole('link', {name: TEXT.purchaseNew, exact: true});
    }
}
exports.SubscriptionsReader = SubscriptionsReader;

class MySubscriptionsPage extends ReaderPage {
    async goto() {
        return this.page.goto(this.url('user/subscriptions'));
    }

    async expectOpen() {
        await expect(this.page).toHaveURL(/\/user\/subscriptions$/);
        await expect(this.heading()).toHaveText(TEXT.mySubscriptions, {timeout: T});
    }

    /** "Subscription Status" and its table. */
    statusPart() {
        return this.main().locator('.my_subscription_payments');
    }

    /** The status table's rows as `[status, description]`. */
    async statusRows() {
        return this.statusPart()
            .locator('table tr')
            .evaluateAll((rows) => rows.map((tr) => [...tr.querySelectorAll('td, th')].map((c) => (c.textContent || '').replace(/\s+/g, ' ').trim())));
    }

    individualPart() {
        return this.main().locator('.my_subscription_individual');
    }

    institutionalPart() {
        return this.main().locator('.my_subscriptions_institutional');
    }

    /** A part's data rows (the header row aside). */
    rows(part) {
        return part.locator('table tr').filter({has: this.page.locator('td')});
    }

    /** A row read as its cells' texts. */
    async rowCells(row) {
        return row.locator('td').evaluateAll((cells) => cells.map((c) => (c.textContent || '').replace(/[\s ]+/g, ' ').trim()));
    }

    /** A row's buttons ("Renew", "Purchase"). */
    rowButtons(row) {
        return row.locator('a.cmp_button');
    }

    /** A part's "Purchase New Subscription". */
    purchaseLink(part) {
        return part.getByRole('link', {name: TEXT.purchaseNew, exact: true});
    }
}
exports.MySubscriptionsPage = MySubscriptionsPage;

class PurchasePage extends ReaderPage {
    form() {
        return this.page.locator('form#subscriptionForm');
    }

    legend() {
        return this.form().locator('legend');
    }

    typeSelect() {
        return this.form().locator('select[name="typeId"]');
    }

    async typeOptions() {
        return (await this.typeSelect().locator('option').allInnerTexts()).map(flat);
    }

    selectedType() {
        return this.typeSelect().locator('option:checked');
    }

    membershipBox() {
        return this.form().locator('input[name="membership"]');
    }

    institutionNameBox() {
        return this.form().locator('input[name="institutionName"]');
    }

    mailingAddressBox() {
        return this.form().locator('textarea[name="institutionMailingAddress"]');
    }

    domainBox() {
        return this.form().locator('input[name="domain"]');
    }

    ipRangesBox() {
        return this.form().locator('textarea[name="ipRanges"]');
    }

    /** "Save" (individual) or "Continue" (institutional). */
    submitButton() {
        return this.form().locator('button.submit');
    }

    cancelLink() {
        return this.form().getByRole('link', {name: 'Cancel', exact: true});
    }

    /** The refusals at the top of the page. */
    errors() {
        return this.page.locator('#formErrors');
    }

    /** Press "Save" / "Continue" and wait for the next page. */
    async submit() {
        await Promise.all([this.page.waitForNavigation({waitUntil: 'domcontentloaded', timeout: T}), this.submitButton().click()]);
    }
}
exports.PurchasePage = PurchasePage;

class ManualPaymentPage extends ReaderPage {
    async expectOpen() {
        await expect(this.main().locator('h1.page_title')).toHaveText(TEXT.manualPayment, {timeout: T});
    }

    /** The table's value beside a heading ("Title", "Fee"). */
    value(label) {
        return this.main().locator('.page_payment_form table tr').filter({has: this.page.locator('th', {hasText: label})}).locator('td');
    }

    /** The payment instructions paragraph. */
    instructions() {
        return this.main().locator('.page_payment_form > p').first();
    }

    notifyLink() {
        return this.main().getByRole('link', {name: TEXT.sendNotification, exact: true});
    }
}
exports.ManualPaymentPage = ManualPaymentPage;

class SubscriptionBlock extends BasePage {
    root() {
        return this.page.locator('.pkp_structure_sidebar .block_subscription');
    }

    title() {
        return this.root().locator('h2.title');
    }

    /** The block's lines (`p`), in order (a locator for `toHaveText`). */
    lines() {
        return this.root().locator('.content > p');
    }

    link(name) {
        return this.root().getByRole('link', {name, exact: true});
    }
}
exports.SubscriptionBlock = SubscriptionBlock;
