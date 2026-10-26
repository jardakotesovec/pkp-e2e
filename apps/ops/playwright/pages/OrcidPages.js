/**
 * @file playwright/pages/OrcidPages.js
 *
 * OPS-local Page Objects and helpers for the ORCID integration feature
 * (spec: docs/specs/U04-orcid-integration.md, read with the application
 * glossary: "journal" = preprint server, "Journal Manager" = Preprint
 * Server Manager).
 *
 * Surfaces:
 * - OrcidSettingsTab — the "ORCID" tab on Settings → Users & Roles
 *   (form panel #orcidSettings, OrcidSettingsForm — the shared component,
 *   identical on OPS per spec footnote a).
 * - ProfileIdentityPage — the profile's Identity tab ORCID block
 *   (identityForm.tpl + orcidProfile.tpl: connect button, About link,
 *   verified #orcid-link, the unauthenticated iD link, #deleteOrcidButton).
 * - Workflow/contributor helpers — the preprint workflow dialog (OPS lands
 *   straight on "Workflow: Production"), its Preprint → Contributors panel
 *   and the contributor add/edit modal's "ORCID iD" field (FieldOrcid) with
 *   its "Request verification" dialog.
 * - AboutOrcidPage — the public "What is ORCID?" page (`/orcid/about`) and
 *   its "How and why" section (public- or member-API wording).
 * - orcidEmailLinks — the two links of an ORCID request email (Rule 14).
 *
 * Verbatim strings and DOM anchors were live-confirmed by the U04 probes
 * (2026-08-07; every OPS spot/control leg matched OJS exactly). Retained
 * evidence: docs/specs/U04-orcid-integration.md footnotes. The
 * unauthenticated link, the request-dialog helper, the About page and the
 * email-link reader were added on the 2026-09-13 revision.
 *
 * Added on the 2026-10-26 revision: the settings tab's refused-save
 * readouts, its City box and its Users & Roles neighbours
 * (`OrcidSettingsTab.saveRefused`, `cityInput`, `openSiblingTab`); the
 * profile's "Confirm" window (`ProfileIdentityPage.deleteWindow`); the
 * ORCID icon reader (`orcidIconKinds`, `expectOrcidIcons`: solid or
 * hollow, by the icon's own drawing); the field's "Resend Verification
 * Email" (`resendVerification`); the About page's footer
 * (`AboutOrcidPage.footer`, `footerBrandLink`) and the member-API deposit
 * sentence (`DEPOSIT_SENTENCE`); `leaveUsersAndRoles` (the side menu's
 * Settings › Server, every question the page asks recorded).
 */
const {expect} = require('@playwright/test');
const {BasePage} = require('../../../../shared/playwright/pages/BasePage.js');
const {pressOrcidConnect} = require('../../../../shared/playwright/support/orcid.js');

exports.OrcidSettingsTab = class OrcidSettingsTab extends BasePage {
    /**
     * @param {import('@playwright/test').Page} page
     * @param {string} contextPath
     */
    constructor(page, contextPath) {
        super(page);
        this.contextPath = contextPath;
        this.panel = page.locator('#orcidSettings');
        this.enableCheckbox = this.panel.getByRole('checkbox', {
            name: 'Enable ORCID functionality',
            exact: true,
        });
        this.apiSelect = this.panel.locator('select[name="orcidApiType"]');
        this.clientIdInput = this.panel.locator('input[name="orcidClientId"]');
        this.clientSecretInput = this.panel.locator('input[name="orcidClientSecret"]');
        this.cityInput = this.panel.locator('input[name="orcidCity"]');
        this.saveButton = this.panel.getByRole('button', {name: 'Save', exact: true});
        // A refused save: each flagged box's own line, and the form's summary.
        this.clientIdError = this.panel
            .locator('.pkpFormField')
            .filter({has: page.locator('input[name="orcidClientId"]')})
            .locator('.pkpFieldError');
        this.clientSecretError = this.panel
            .locator('.pkpFormField')
            .filter({has: page.locator('input[name="orcidClientSecret"]')})
            .locator('.pkpFieldError');
        this.errorSummary = this.panel.getByText(/Please correct \d+ errors?\./);
    }

    /** The Users & Roles tab of that name ("Users", "Roles", "ORCID", …). */
    tab(name) {
        return this.page.getByRole('tab', {name, exact: true});
    }

    /** Settings → Users & Roles, tab "ORCID". */
    async goto() {
        await this.page.goto(this.contextUrl(this.contextPath, '/management/settings/access'));
        await this.page.getByRole('tab', {name: 'ORCID', exact: true}).click();
        await expect(this.enableCheckbox).toBeVisible();
    }

    /** Save the panel and wait for the context API write to settle. */
    async save() {
        const saved = this.page.waitForResponse(
            (response) => response.url().includes('/api/v1/contexts/') && response.ok()
        );
        await this.saveButton.click();
        await saved;
    }

    /**
     * Press "Save" on a form the browser refuses (a required box empty).
     * Returns the context-API requests the press sent, read once the
     * refusal's summary is on screen (the bound: the form answers in the
     * page, without a request, ccI28 screen note).
     *
     * @returns {Promise<string[]>}
     */
    async saveRefused() {
        const sent = [];
        const listener = (request) => {
            if (request.url().includes('/api/v1/contexts/') && request.method() !== 'GET') {
                sent.push(`${request.method()} ${request.url()}`);
            }
        };
        this.page.on('request', listener);
        try {
            await this.saveButton.click();
            await expect(this.errorSummary).toBeVisible();
        } finally {
            this.page.off('request', listener);
        }
        return sent;
    }

    /**
     * Open another tab of Users & Roles and come back to "ORCID", on the
     * same page (no navigation).
     *
     * @param {string} name the other tab's name
     */
    async openSiblingTab(name) {
        await this.tab(name).click();
        await expect(this.tab(name)).toHaveAttribute('aria-selected', 'true');
        await expect(this.enableCheckbox).toBeHidden();
        await this.tab('ORCID').click();
        await expect(this.tab('ORCID')).toHaveAttribute('aria-selected', 'true');
        await expect(this.enableCheckbox).toBeVisible();
    }
};

/**
 * Leave Users & Roles through the side menu's Settings › Server
 * (`management/settings/context`), recording every question the page
 * asks on the way (a `beforeunload` or a `confirm()`, each accepted so
 * the navigation completes). Returns the questions' messages and types;
 * the arrival on the server's settings page bounds the read.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} contextPath
 * @returns {Promise<string[]>}
 */
exports.leaveUsersAndRoles = async function leaveUsersAndRoles(page, contextPath) {
    const asked = [];
    const listener = async (dialog) => {
        asked.push(`${dialog.type()}: ${dialog.message()}`);
        await dialog.accept().catch(() => {});
    };
    page.on('dialog', listener);
    try {
        await page
            .locator(`a[href$="/${contextPath}/management/settings/context"]`)
            .filter({visible: true})
            .first()
            .click();
        await page.waitForURL(/\/management\/settings\/context/, {waitUntil: 'commit'});
        await expect(page.getByRole('tab', {name: 'Masthead', exact: true}).first()).toBeVisible({
            timeout: 30_000,
        });
    } finally {
        page.off('dialog', listener);
    }
    return asked;
};

exports.ProfileIdentityPage = class ProfileIdentityPage extends BasePage {
    /**
     * @param {import('@playwright/test').Page} page
     * @param {string} contextPath
     */
    constructor(page, contextPath) {
        super(page);
        this.contextPath = contextPath;
        this.form = page.locator('form#identityForm');
        // The whole ORCID block renders only while ORCID is enabled for the
        // context ({if $orcidEnabled} in identityForm.tpl) — its absence is
        // the Rule 4 assertion.
        this.orcidContainer = this.form.locator('.orcid_container');
        // Same id for the "Create or Connect…" and "Authorize and Connect…"
        // variants (orcidProfile.tpl).
        this.connectButton = this.form.locator('#connect-orcid-button');
        this.aboutLink = this.orcidContainer.getByRole('link', {name: 'What is ORCID?'});
        // Verified state: the bare-iD link with the solid icon.
        this.orcidLink = this.form.locator('#orcid-link');
        // Unauthenticated state: the hollow-icon link suffixed
        // "(unauthenticated)" beside the "Authorize and Connect…" button
        // (orcidProfile.tpl's `$orcid && !$orcidAuthenticated` branch).
        this.unauthenticatedLink = this.orcidContainer
            .locator('a[target="_blank"]')
            .filter({hasText: '(unauthenticated)'});
        this.deleteButton = this.form.locator('#deleteOrcidButton');
        // The window "Delete" opens (Rule 6c): titled "Confirm", its question,
        // "OK" and "Cancel".
        this.deleteWindow = page
            .getByRole('dialog', {name: 'Confirm', exact: true})
            .filter({hasText: 'Are you sure you want to remove this ORCID?'});
    }

    /** The profile page opens on the Identity tab. */
    async goto() {
        await this.page.goto(this.contextUrl(this.contextPath, '/user/profile'));
        await expect(this.form).toBeVisible({timeout: 30_000});
    }

    /**
     * Press the connect (or authorize) button and return the popup it opens.
     * ORCID's site is answered locally in this page's context first
     * (shared support/orcid.js): the popup event waits for the popup's first
     * response, which otherwise comes from the real ORCID sandbox.
     *
     * @returns {Promise<import('@playwright/test').Page>}
     */
    async pressConnect() {
        return pressOrcidConnect(this.page, this.connectButton);
    }
};

/**
 * Open a preprint's workflow dialog as an editorial user. OPS runs a
 * single-stage workflow, so a submitted preprint lands directly on
 * "Workflow: Production" (the side-modal wrapper reports visibility:hidden —
 * arrival is anchored on the inner heading, patterns.md pitfall 5).
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} contextPath
 * @param {number} submissionId
 * @returns {Promise<import('@playwright/test').Locator>} the workflow dialog
 */
exports.openEditorialWorkflow = async function openEditorialWorkflow(page, contextPath, submissionId) {
    await page.goto(
        `/index.php/${contextPath}/dashboard/editorial?workflowSubmissionId=${submissionId}`
    );
    const workflow = page.locator('[data-cy="active-modal"]');
    await expect(
        workflow.getByRole('heading', {name: /Workflow: Production/})
    ).toBeVisible({timeout: 30_000});
    return workflow;
};

/**
 * Open the workflow's Publication → Contributors panel (the workflow dialog
 * must already be open, e.g. via openEditorialWorkflow).
 *
 * @param {import('@playwright/test').Page} page
 */
exports.openContributors = async function openContributors(page) {
    await page.getByRole('link', {name: 'Contributors', exact: true}).click();
    await expect(page.getByRole('button', {name: 'Add Contributor'})).toBeVisible({
        timeout: 30_000,
    });
};

/**
 * The contributor edit side modal, anchored on the contributor form's own
 * given-name control (the workflow page is itself a dialog — pitfall 6).
 *
 * @param {import('@playwright/test').Page} page
 */
exports.contributorEditorModal = function contributorEditorModal(page) {
    return page
        .locator('[data-cy="active-modal"]')
        .filter({has: page.locator('[id^="contributor-givenName"]')});
};

/**
 * Open the contributor edit modal for the list item naming the contributor.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} name contributor display name (or a unique fragment)
 * @returns {Promise<import('@playwright/test').Locator>} the edit modal
 */
exports.openContributorEditor = async function openContributorEditor(page, name) {
    const item = page.locator('.listPanel__item').filter({hasText: name});
    await item.getByRole('button', {name: 'Edit', exact: true}).click();
    const modal = exports.contributorEditorModal(page);
    await expect(modal.locator('[id^="contributor-givenName"]')).toBeVisible({
        timeout: 30_000,
    });
    return modal;
};

/**
 * The "ORCID iD" form field wrapper inside the contributor edit modal.
 *
 * @param {import('@playwright/test').Locator} modal from openContributorEditor
 */
exports.orcidField = function orcidField(modal) {
    return modal.locator('.pkpFormField').filter({hasText: 'ORCID iD'});
};

/** The Rule 8 question every "Request verification" press asks. */
exports.REQUEST_QUESTION =
    'Would you like to send an email to this author requesting they verify their ORCID?';

/** The line the dialog adds on a contributor not yet saved (Rule 8). */
exports.REQUEST_WAITS_FOR_SAVE = 'The email will be sent once the author has been created.';

/** The requested state of the field (Rule 8): the field's text and the resend link. */
exports.REQUESTED_TEXT = 'ORCID Verification has been requested!';
exports.RESEND_LINK_TEXT = 'Resend Verification Email';

/**
 * The "Request ORCID verification" confirm dialog a contributor form's
 * "Request verification" opens (Rule 8).
 *
 * @param {import('@playwright/test').Page} page
 */
exports.orcidRequestDialog = function orcidRequestDialog(page) {
    return page.getByRole('dialog').filter({hasText: exports.REQUEST_QUESTION});
};

/**
 * Press "Request verification" on a contributor form's ORCID iD field and
 * confirm its dialog with "Yes". On a saved contributor the request leaves
 * at once (the confirm is bounded by `orcid/requestAuthorVerification/…`
 * answering OK); on the add form it is only remembered (`saved: false`),
 * so nothing is posted and only the dialog and the field are read. The
 * dialog is gone after "Yes", so its text is read before confirming.
 *
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').Locator} field from orcidField()
 * @param {{saved?: boolean}} [options]
 * @returns {Promise<string>} the dialog's text, read before it was confirmed
 */
exports.requestVerification = async function requestVerification(page, field, {saved = true} = {}) {
    await field.getByRole('button', {name: 'Request verification'}).click();
    const dialog = exports.orcidRequestDialog(page);
    await expect(dialog).toContainText('Request ORCID verification');
    const dialogText = await dialog.innerText();
    const requested = saved
        ? page.waitForResponse(
              (response) =>
                  response.url().includes('/orcid/requestAuthorVerification/') && response.ok()
          )
        : Promise.resolve();
    await dialog.getByRole('button', {name: 'Yes', exact: true}).click();
    await requested;
    await expect(dialog).toHaveCount(0);
    await expect(field).toContainText(exports.REQUESTED_TEXT);
    return dialogText;
};

/**
 * Press "Resend Verification Email" on a contributor form's ORCID iD field
 * (the requested state) and confirm its dialog with "Yes"; bounded by
 * `orcid/requestAuthorVerification/…` answering OK, as the first request.
 *
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').Locator} field from orcidField()
 * @returns {Promise<string>} the dialog's text, read before it was confirmed
 */
exports.resendVerification = async function resendVerification(page, field) {
    await field.getByRole('button', {name: exports.RESEND_LINK_TEXT, exact: true}).click();
    const dialog = exports.orcidRequestDialog(page);
    await expect(dialog).toContainText('Request ORCID verification');
    const dialogText = await dialog.innerText();
    const requested = page.waitForResponse(
        (response) =>
            response.url().includes('/orcid/requestAuthorVerification/') && response.ok()
    );
    await dialog.getByRole('button', {name: 'Yes', exact: true}).click();
    await requested;
    await expect(dialog).toHaveCount(0);
    await expect(field).toContainText(exports.REQUESTED_TEXT);
    return dialogText;
};

/**
 * The ORCID icons drawn inside an element, in DOM order, each read by its
 * own drawing: "solid" when its first shape is the filled green disc
 * (ORCID's iD mark, `#A6CE39`), "hollow" when its first shape is a white
 * disc inside a green ring (the unauthenticated mark, `#7FAA26`). Any
 * other icon (a field's help mark) is skipped. Covers the profile's
 * Smarty-drawn icons and the contributor field's Vue ones alike.
 *
 * @param {import('@playwright/test').Locator} root
 * @returns {Promise<string[]>}
 */
exports.orcidIconKinds = async function orcidIconKinds(root) {
    return root.evaluate((el) => {
        const SOLID = 'rgb(166, 206, 57)';
        const RING = 'rgb(127, 170, 38)';
        const WHITE = 'rgb(255, 255, 255)';
        return [...el.querySelectorAll('svg')]
            .map((svg) => [...svg.querySelectorAll('path')].map((p) => getComputedStyle(p).fill))
            .map((fills) => {
                if (fills[0] === SOLID) {
                    return 'solid';
                }
                if (fills[0] === WHITE && fills.slice(1).includes(RING)) {
                    return 'hollow';
                }
                return null;
            })
            .filter((kind) => kind !== null);
    });
};

/**
 * Poll `orcidIconKinds` until it reads `kinds` (the icon renders with its
 * element; a one-shot read could race a Vue re-render).
 *
 * @param {import('@playwright/test').Locator} root
 * @param {string[]} kinds
 */
exports.expectOrcidIcons = async function expectOrcidIcons(root, kinds) {
    await expect(root).toBeVisible();
    await expect.poll(() => exports.orcidIconKinds(root)).toEqual(kinds);
};

/** Rule 10: the "How and why" sentence only a member-API context's page carries. */
exports.DEPOSIT_SENTENCE = 'publication metadata will automatically be pushed to your ORCID record';

/** The "What is ORCID?" public page (Rule 10; `{server}/orcid/about`). */
exports.AboutOrcidPage = class AboutOrcidPage extends BasePage {
    /**
     * @param {import('@playwright/test').Page} page
     */
    constructor(page) {
        super(page);
        this.body = page.locator('.page_message');
        this.heading = page.getByRole('heading', {name: 'What is ORCID?'});
        this.howAndWhyHeading = page.getByRole('heading', {
            name: 'How and why we collect ORCID iDs?',
        });
        this.displayHeading = page.getByRole('heading', {name: 'Where are ORCID iDs displayed?'});
        // The context's own header (its name) and footer (the theme's
        // footer, whose brand link leads to the context's own "About this
        // Publishing System" page).
        this.header = page.getByRole('banner');
        this.footer = page.getByRole('contentinfo');
    }

    /**
     * The footer's brand link into this context's "About this Publishing
     * System" page.
     *
     * @param {string} contextPath
     */
    footerBrandLink(contextPath) {
        return this.footer.locator(`a[href*="/${contextPath}/about/aboutThisPublishingSystem"]`);
    }

    /**
     * Open the page by a server path, or by an absolute link taken from an
     * email (its host is the install's configured base URL, worker 0's
     * server, which shares the fleet's database; only the path is
     * followed, on this page's own server).
     *
     * @param {string} target
     */
    async goto(target) {
        let url = `/index.php/${target}/orcid/about`;
        if (/^https?:/.test(target)) {
            const link = new URL(target);
            url = `${link.pathname}${link.search}`;
        }
        await this.page.goto(url);
        await expect(this.heading).toBeVisible();
        await expect(this.howAndWhyHeading).toBeVisible();
        await expect(this.displayHeading).toBeVisible();
    }

    /**
     * The text of the "How and why" section: what sits between its heading
     * and the next one (the member-API wording is wrapped in a description
     * box, the public-API wording is bare, so the read is by text).
     */
    async howAndWhyText() {
        const text = await this.body.innerText();
        const start = text.indexOf('How and why we collect ORCID iDs?');
        const end = text.indexOf('Where are ORCID iDs displayed?');
        if (start < 0 || end < start) {
            throw new Error('AboutOrcidPage: the "How and why" section was not found');
        }
        return text.slice(start + 'How and why we collect ORCID iDs?'.length, end).trim();
    }
};

/**
 * The two links every ORCID request email carries (Rule 14): the personal
 * authorization link (leading to ORCID's site) and the What-is-ORCID link,
 * read by their hrefs because the two templates word the link texts
 * differently (screen-notes, tojs 2026-09-13).
 *
 * @param {string} html the message's HTML body
 * @returns {{authorization: string|null, about: string|null}}
 */
exports.orcidEmailLinks = function orcidEmailLinks(html) {
    const hrefs = [];
    const anchorRe = /<a\b[^>]*href=(["'])([^"']+)\1/gi;
    let match;
    while ((match = anchorRe.exec(html)) !== null) {
        hrefs.push(match[2].replace(/&amp;/g, '&'));
    }
    return {
        authorization: hrefs.find((href) => /orcid\.org\/oauth\/authorize/.test(href)) || null,
        about: hrefs.find((href) => /\/orcid\/about/.test(href)) || null,
    };
};
