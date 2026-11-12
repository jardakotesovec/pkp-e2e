// @ts-check
/**
 * @file playwright/tests/serial/U57-languages-and-locales.spec.js
 *
 * Languages & locales — OMP suite, site part: scenarios 1–3 (all common),
 * in OMP vocabulary ("Hosted Presses", the Settings wizard's "Setup", "hosted
 * presses", "OMP"). Scenarios 4–9 run on scratch presses in
 * `../U57-languages-and-locales.spec.js`.
 * Spec: docs/specs/U57-languages-and-locales.md
 *
 * Serial project, alone (PRINCIPLES A7, A9): each scenario changes the
 * site's own language list, which every press of the install reads and
 * every change saves again (Rules 3a, 3c), so each test carries `@solo`
 * and runs by itself in the `omp-solo` project after the serial one
 * (harness.md "Project chain"; `omp-serial` greps `@solo` out). Each test
 * puts back what it changed in a `finally`, even when it fails midway:
 * English the site's primary language again first (scenario 3), then each
 * language a scenario installs taken off through its row's "Remove"
 * (German; in scenario 2 also whichever Uzbek and Chinese languages are
 * still there), each tried even when an earlier one fails (footnote s).
 * Each also starts from the site as installed, taking off what a failed
 * earlier run left behind (`putBack()`).
 *
 * Deliberately NOT covered (register IDs from the spec's Findings register —
 * a 🐞 is never asserted as the contract, a ❓ is parked, not a gap): A1 🐞,
 * A2 ❓, A3 🐞, A5 🐞, A6 🐞, A7 🐞, A8 🐞, A10 ❓, A11 ❓, A12 ❓, A13 ❓,
 * A14 🐞, A15 ❓. OMP1 ✅ is read as the press's line under the site's
 * list. The spec's Coverage section records everything else left out.
 *
 * Seeding (footnote s): no harness key installs a language, so scenarios 2
 * and 3 install German through "Install Locale" before their steps and
 * seed their German presses after it, scenario 2 ticking Uzbek, Uzbek
 * (Latin) and Chinese in simplified and traditional characters in the
 * same "Save" (scratch presses from
 * `POST scenarios/context`, their languages through `context.*Locales`
 * and `context.primaryLocale`); throwaway accounts come from the same
 * request (the username twice as password). The Site Administrator is
 * `admin`. Every signed-in actor is opened through `asUser`; a visitor is
 * a browser context with an empty storage state and a language of its own
 * (`Accept-Language`, footnote s). A site change re-saves every context:
 * seconds on a fresh install, minutes on a fleet after a full run (an
 * install 145 s and a removal 62 s with 457 journals on OJS), so every
 * wait across one allows `SITE_CHANGE` (eight minutes) and each test as
 * many of them as it makes changes, its `finally` included.
 */
const {test: base, expect} = require('../../support/fixtures.js');
const {AdministrationPage} = require('../../../../../shared/playwright/pages/AdminPages.js');
const {ProfilePage} = require('../../../../../shared/playwright/pages/ProfilePage.js');
const {WorkflowEmailsSettingsPage} = require('../../../../../shared/playwright/pages/EmailsPages.js');
const {
    SiteLanguagesList,
    JournalLanguagesTab,
    LanguageMenu,
    openWizardLanguages,
    noticeDuring,
    SITE_CHANGE,
} = require('../../../../../shared/playwright/pages/LanguagesPages.js');

// ---- the OMP words ----------------------------------------------------------------
const HOSTED = 'Hosted Presses';
const WIZARD_TAB = 'Setup';
const INSTALL_SENTENCE =
    'Select any additional locales to install support for in this system. Locales must be installed before they can be used by hosted presses. See the OMP documentation for information on adding support for new languages.';
const AFFECTS = 'This may affect any hosted presses currently using the locale.';
const ACK_EMAIL = 'Submission Confirmation';
/** The line under the site's list: a press's opens with an asterisk (register OMP1 ✅). */
const MAYBE_INCOMPLETE = '* Marked locales may be incomplete.';

// ---- the words the three apps share --------------------------------------------------
const INSTALLED = 'All selected locale(s) installed and activated.';
const REMOVE_Q = `Are you sure you want to uninstall this locale? ${AFFECTS}`;
const DISABLE_Q = `Are you sure you want to disable this locale? ${AFFECTS}`;
const PRIMARY_Q =
    "Are you sure you want to change the site primary locale? Users' names, which are required in the site's primary locale, will be copied from the existing primary locale where they are missing.";
const CANT_DISABLE = "This locale is the primary language of the site. You can't disable it until you choose another primary locale.";
const ENABLED = 'Locale enabled.';
const DISABLED = 'Locale disabled.';
const UNINSTALLED = 'German/Deutsch locale uninstalled.';
const PRIMARY_DEFINED = 'German/Deutsch defined as primary locale.';
const SAVED = 'Locale settings saved.';
const LEAVE = 'The data on this form has changed. Do you wish to continue without saving?';
const OUR_TEXT = 'Unser Text.';

/** The languages the scenarios install, taken off again (footnote s). */
const SCRIPTS = ['uz', 'uz_Latn', 'zh_Hans', 'zh_Hant'];
const ADDED = ['de', ...SCRIPTS];

/**
 * Put the site back as installed, as each test does before it starts and
 * in its `finally` (footnote s): English the site's primary language again
 * first, then every language of `ADDED` still there taken off through its
 * row's "Remove", each tried even when an earlier step fails; the first
 * failure is thrown once all were tried, and the list is then confirmed
 * as installed (English and French (Canada), English primary).
 */
async function putBack(page) {
    const site = new SiteLanguagesList(page);
    const failures = [];
    try {
        await site.makePrimaryIfNot('en');
    } catch (error) {
        failures.push(error);
    }
    for (const code of ADDED) {
        try {
            await site.removeIfInstalled(code);
        } catch (error) {
            failures.push(error);
        }
    }
    if (failures.length) {
        throw failures[0];
    }
    await site.restore({remove: []});
}

/** The names of the two scripts of Uzbek and of Chinese, each installed beside the other (Fields). */
const SCRIPT_NAMES = {
    uz: 'Uzbek/o‘zbek',
    uz_Latn: 'Uzbek (Latin)/o‘zbek (lotin)',
    zh_Hans: 'Chinese (Simplified)/中文（简体）',
    zh_Hant: 'Chinese (Traditional)/中文（繁體）',
};

/** A row's name on a language list (its "Locale" cell without the asterisk). */
const nameCell = (grid, code) => grid.row(code).locator(`[id="cell-${code}-locale"]`);

/** Unique per-run tag: single alphanumeric token, feature + scenario + app + worker. */
function makeTag(scenario, testInfo) {
    return `u57s${scenario}omw${testInfo.parallelIndex}${Math.random().toString(36).slice(2, 8)}`;
}

/** A throwaway account for `createContext`'s `users[]`. */
function person(username, givenName, familyName, roles) {
    return {username, givenName, familyName, roles};
}

/** A signed-in page for an actor (a fresh `asUser` context). */
async function signedIn(asUser, username) {
    return (await asUser(username)).newPage();
}

/** The page's `<html lang>`. */
async function pageLang(page) {
    return page.evaluate(() => document.documentElement.getAttribute('lang'));
}

/** The lines of the initials menu as `[text, ticked]` pairs, headings as `[text, 'heading']`. */
const menuLines = (items) => items.map((i) => [i.text, i.heading ? 'heading' : i.ticked]);

/** The codes of a list, sorted (the list's own order is not a claim here). */
const sortedCodes = async (grid) => (await grid.codes()).sort();

/** The site's home page's address, optionally after a language. */
const siteHome = (locale) => new RegExp(`/index\\.php/index/${locale}(/index)?/?$`);

/**
 * Settings › Workflow › "Emails" › "Add and edit templates", the email's
 * "Edit" and its default template's "Edit Template" window (U56 scenario
 * 5's way in); returns the Manage Emails page object with the window open.
 */
async function openDefaultTemplate(page, contextPath, email) {
    const tab = new WorkflowEmailsSettingsPage(page, contextPath);
    await tab.goto();
    const manage = await tab.openManageEmails();
    const opened = await manage.openEmail(email);
    if (opened.kind === 'several') {
        const rows = await manage.templateRowsRead(opened.window);
        const byDefault = rows.find((r) => r.badges.includes('Default')) || rows[0];
        await manage.openTemplate(opened.window, byDefault.name);
    }
    return manage;
}

/** Visitors: browser contexts with no session and a language of their own. */
const test = base.extend({
    newVisitor: async ({browser, baseURL}, use) => {
        const made = [];
        await use(async ({language}) => {
            const context = await browser.newContext({
                baseURL,
                storageState: {cookies: [], origins: []},
                reducedMotion: 'reduce',
                locale: language,
                extraHTTPHeaders: {'Accept-Language': language},
            });
            made.push(context);
            return context.newPage();
        });
        for (const context of made) {
            await context.close().catch(() => {});
        }
    },
});

test.describe('languages and locales: the site', () => {
    test('S1: installing and removing a site language @solo', async ({asUser, ompApi}, testInfo) => {
        test.setTimeout(6 * SITE_CHANGE);
        const tag = makeTag(1, testInfo);
        const manager = `${tag}mg`;
        await ompApi.createContext({tag, users: [person(manager, 'Mona', 'Manager', ['manager'])]});
        const ap = await signedIn(asUser, 'admin');
        const mp = await signedIn(asUser, manager);
        const site = new SiteLanguagesList(ap);
        const tab = new JournalLanguagesTab(mp, tag);
        await putBack(ap);
        try {
            // Administration's "Change Language": the site's languages, each
            // named in its own language, the tick beside the one being read,
            // the switch both ways (Fields; Rule 20).
            const admin = new AdministrationPage(ap);
            await admin.goto();
            const menu = new LanguageMenu(ap);
            expect(menuLines(await menu.read()).slice(0, 3)).toEqual([
                ['Change Language', 'heading'],
                ['English', true],
                ['français', false],
            ]);
            await menu.choose('français', 'fr_CA');
            await expect(ap).toHaveURL(/\/index\.php\/index\/fr_CA\/admin/);
            expect(await pageLang(ap)).toMatch(/^fr/);
            expect(menuLines(await menu.read()).slice(0, 3)).toEqual([
                ['Changer la langue', 'heading'],
                ['English', false],
                ['français', true],
            ]);
            await menu.choose('English', 'en');
            await expect(ap).toHaveURL(/\/index\.php\/index\/en\/admin/);
            await admin.expectOpen();

            // The site's list (Fields; Rules 5, 6).
            await site.gotoFromAdministration();
            await expect(site.title).toHaveText('Languages');
            expect(await site.columns()).toEqual(['Enable', 'Locale', 'Code', 'Primary locale']);
            expect(await sortedCodes(site)).toEqual(['en', 'fr_CA']);
            await expect(site.row('en')).toContainText('English/English');
            await expect(site.enableBox('en')).toBeChecked();
            await expect(site.primaryRadio('en')).toBeChecked();
            await expect(site.asterisk('en')).toHaveCount(0);
            await expect(site.row('fr_CA')).toContainText('French/français');
            expect(await site.cellTexts('fr_CA')).toContain('fr_CA');
            await expect(site.enableBox('fr_CA')).toBeChecked();
            await expect(site.primaryRadio('fr_CA')).not.toBeChecked();
            await expect(site.asterisk('fr_CA')).toHaveText('*');
            await expect(site.arrow('fr_CA')).toHaveCount(1);
            await expect(site.arrow('en')).toHaveCount(0);
            expect(await site.openRowActions('fr_CA')).toEqual(['Remove']);
            await expect(site.footLine(MAYBE_INCOMPLETE)).toBeVisible();

            // "Install Locale" left unsaved: the leave question, "Cancel"
            // keeps the window, "OK" closes it, nothing installed (Fields).
            let win = await site.openInstall();
            await expect(win.dialog).toBeVisible();
            await expect(win.group).toBeVisible();
            expect(await win.text()).toContain(`Available Locales ${INSTALL_SENTENCE}`);
            await expect(win.boxByLabel('German/Deutsch (de)')).toBeVisible();
            await expect(win.box('de')).toHaveCount(1);
            await expect(win.box('en')).toHaveCount(0);
            await expect(win.box('fr_CA')).toHaveCount(0);
            await expect(win.saveButton).toBeVisible();
            await expect(win.cancelButton).toBeVisible();
            await win.box('de').check();
            await win.box('de').blur();
            expect(await win.closeAnswering('dismiss')).toBe(LEAVE);
            await expect(win.form).toBeVisible();
            expect(await win.closeAnswering('accept')).toBe(LEAVE);
            await expect(win.form).toBeHidden();
            expect(await sortedCodes(site)).toEqual(['en', 'fr_CA']);

            // "Save" with nothing ticked: the notice, nothing added (Rule 2).
            win = await site.openInstall();
            const empty = await noticeDuring(ap, INSTALLED, () => win.save(), {timeout: SITE_CHANGE});
            expect(empty.status()).toBe(200);
            await site.reload();
            expect(await sortedCodes(site)).toEqual(['en', 'fr_CA']);

            // German installed: enabled, not primary, with the asterisk (Rules 2, 6).
            win = await site.openInstall();
            await win.box('de').check();
            const installed = await noticeDuring(ap, INSTALLED, () => win.save(), {timeout: SITE_CHANGE});
            expect(installed.status()).toBe(200);
            await expect(site.row('de')).toContainText('German/Deutsch');
            expect(await site.cellTexts('de')).toContain('de');
            await expect(site.enableBox('de')).toBeChecked();
            await expect(site.primaryRadio('de')).not.toBeChecked();
            await expect(site.asterisk('de')).toHaveText('*');

            // The press's list: a German row with nothing ticked (Rule 2).
            await tab.goto();
            await expect(tab.website.row('de')).toContainText('German/Deutsch');
            await expect(tab.website.cell('de', 'uiLocale')).not.toBeChecked();
            await expect(tab.website.cell('de', 'formLocale')).not.toBeChecked();

            // The German email texts: a "German" button once German is a
            // form language; a German body of the press's own (Side
            // effects; U56 Rule 20).
            const forms = await noticeDuring(mp, SAVED, () => tab.pressWebsite('de', 'formLocale'));
            expect(forms.response.status()).toBe(200);
            // (Its German boxes opening empty is A13's, not read.)
            let manage = await openDefaultTemplate(mp, tag, ACK_EMAIL);
            await expect(manage.languageButton('German')).toBeVisible();
            await manage.languageButton('German').click();
            await expect(manage.bodyFrame('de')).toBeVisible();
            await manage.typeBody(OUR_TEXT, {locale: 'de'});
            await expect.poll(() => manage.bodyHtml('de')).toContain(OUR_TEXT);
            await manage.saveTemplate();
            manage = await openDefaultTemplate(mp, tag, ACK_EMAIL);
            await manage.languageButton('German').click();
            await expect.poll(() => manage.bodyHtml('de')).toBe(`<p>${OUR_TEXT}</p>`);

            // "Cancel" on "Remove": the row stays (Rules 3, 5).
            await site.goto();
            await site.pressRemove('de');
            await expect(site.question('Remove')).toContainText(REMOVE_Q);
            await expect(site.questionButton('Remove', 'OK')).toBeVisible();
            await site.answer('Remove', 'Cancel');
            await expect(site.row('de')).toBeVisible();

            // German removed: the notice, the row gone, gone from the
            // press's list (Rules 3a, 5).
            await site.pressRemove('de');
            const removed = await noticeDuring(ap, UNINSTALLED, () => site.answer('Remove', 'OK'), {timeout: SITE_CHANGE});
            expect(removed.status()).toBe(200);
            await expect(site.row('de')).toHaveCount(0);
            await expect(site.row('en')).toBeVisible();
            await tab.goto();
            await expect(tab.website.row('en')).toBeVisible();
            await expect(tab.website.row('de')).toHaveCount(0);

            // German installed again: offered again, back on the press's
            // list unticked, and its German body the application's default
            // (Rules 2, 5; Side effects).
            await site.goto();
            win = await site.openInstall();
            await expect(win.boxByLabel('German/Deutsch (de)')).toBeVisible();
            await win.box('de').check();
            const again = await noticeDuring(ap, INSTALLED, () => win.save(), {timeout: SITE_CHANGE});
            expect(again.status()).toBe(200);
            await tab.goto();
            await expect(tab.website.row('de')).toContainText('German/Deutsch');
            await expect(tab.website.cell('de', 'uiLocale')).not.toBeChecked();
            await expect(tab.website.cell('de', 'formLocale')).not.toBeChecked();
            const formsAgain = await noticeDuring(mp, SAVED, () => tab.pressWebsite('de', 'formLocale'));
            expect(formsAgain.response.status()).toBe(200);
            // The press's own German text is gone (whether the box is empty
            // is A13's, not read); the English "Body" is the default text.
            manage = await openDefaultTemplate(mp, tag, ACK_EMAIL);
            await expect(manage.languageButton('German')).toBeVisible();
            await manage.languageButton('German').click();
            await expect(manage.bodyFrame('de')).toBeVisible();
            await expect(manage.bodyFrame('en')).toContainText('Thank you for your submission');
            expect(await manage.bodyHtml('de')).not.toContain(OUR_TEXT);

            // Control: German installed, "Install Locale" no longer offers it (Fields).
            await site.goto();
            win = await site.openInstall();
            await expect(win.box('es')).toHaveCount(1);
            await expect(win.box('de')).toHaveCount(0);
            await win.cancel();
        } finally {
            await putBack(ap);
        }
    });

    test('S2: disabling and enabling a site language @solo', async ({asUser, ompApi}, testInfo) => {
        // Eight site changes (an install, a disable, an enable, two removals
        // and the `finally`'s three), and the refused one.
        test.setTimeout(10 * SITE_CHANGE);
        const tagA = makeTag(2, testInfo);
        const tagB = `${tagA}de`;
        const ap = await signedIn(asUser, 'admin');
        const site = new SiteLanguagesList(ap);
        const wizardLabels = {hostedLabel: HOSTED, setupTab: WIZARD_TAB};
        await putBack(ap);
        try {
            // Given: German, Uzbek, Uzbek (Latin) and the two Chinese
            // installed and enabled in one "Save"; the first press with
            // English and German everywhere and the other four under "UI"
            // alone, the second German-primary.
            // (Five languages in one "Save" took over six minutes for four
            // on a full fleet: twice the ceiling of one change.)
            await site.goto();
            const install = await site.openInstall();
            for (const code of ADDED) {
                await install.box(code).check();
            }
            const installed = await install.save({timeout: 2 * SITE_CHANGE});
            expect(installed.status()).toBe(200);
            await ompApi.createContext({
                tag: tagA,
                context: {
                    supportedLocales: ['en', ...ADDED],
                    supportedFormLocales: ['en', 'de'],
                    supportedSubmissionLocales: ['en', 'de'],
                },
            });
            await ompApi.createContext({tag: tagB, context: {primaryLocale: 'de', supportedLocales: ['de', 'en']}});

            // The Settings wizard's "Languages" (Rule 7).
            let wizard = await openWizardLanguages(ap, tagA, wizardLabels);
            await expect(ap.getByRole('heading', {name: 'Settings Wizard', exact: true})).toBeVisible();
            await expect(wizard.website.cell('de', 'uiLocale')).toBeChecked();
            await expect(wizard.website.cell('de', 'formLocale')).toBeChecked();
            await expect(wizard.submission.cell('de', 'submissionLocale')).toBeChecked();
            await expect(wizard.submission.cell('de', 'submissionMetadataLocale')).toBeChecked();

            // "Cancel" on "Disable": German still ticked after a reload (Rule 3).
            await site.goto();
            await site.enableBox('de').click();
            await expect(site.question('Disable')).toContainText(DISABLE_Q);
            await expect(site.questionButton('Disable', 'OK')).toBeVisible();
            await site.answer('Disable', 'Cancel');
            await site.reload();
            await expect(site.enableBox('de')).toBeChecked();

            // German disabled: the notice, its radio grayed out (Fields; Rules 3, 4).
            await site.enableBox('de').click();
            await expect(site.question('Disable')).toBeVisible();
            const disabled = await noticeDuring(ap, DISABLED, () => site.answer('Disable', 'OK'), {timeout: SITE_CHANGE});
            expect(disabled.status()).toBe(200);
            await expect(site.enableBox('de')).not.toBeChecked();
            await expect(site.primaryRadio('de')).toBeDisabled();
            await expect(site.primaryRadio('fr_CA')).toBeEnabled();

            // The first press: no German row on "Website Languages"; the
            // "Submission Languages" row stays, unticked (Rule 3a).
            wizard = await openWizardLanguages(ap, tagA, wizardLabels);
            await expect(wizard.website.row('en')).toBeVisible();
            await expect(wizard.website.row('de')).toHaveCount(0);
            await expect(wizard.submission.row('de')).toBeVisible();
            await expect(wizard.submission.cell('de', 'submissionLocale')).not.toBeChecked();
            await expect(wizard.submission.cell('de', 'submissionMetadataLocale')).not.toBeChecked();

            // The German press: English its primary language now (Rule 3a).
            wizard = await openWizardLanguages(ap, tagB, wizardLabels);
            await expect(wizard.website.cell('en', 'contextPrimary')).toBeChecked();
            await expect(wizard.website.row('de')).toHaveCount(0);

            // German enabled again: no question; the first press's German
            // row back with nothing ticked (Rules 3, 3a).
            await site.goto();
            const enabled = await noticeDuring(
                ap,
                ENABLED,
                () => site.press('de', 'enable', {endpoint: /admin-language-grid\/enable-locale/, timeout: SITE_CHANGE}),
                {timeout: SITE_CHANGE}
            );
            expect(enabled.status()).toBe(200);
            await expect(site.question('Disable')).toHaveCount(0);
            await expect(site.enableBox('de')).toBeChecked();
            wizard = await openWizardLanguages(ap, tagA, wizardLabels);
            await expect(wizard.website.row('de')).toBeVisible();
            await expect(wizard.website.cell('de', 'uiLocale')).not.toBeChecked();
            await expect(wizard.website.cell('de', 'formLocale')).not.toBeChecked();

            // Two scripts of one language: each named with its script on
            // the site's list (with the asterisk) and on "Website Languages"
            // (without), and in "Change Language"; Uzbek (Latin) installed
            // alone takes the plain name, and "Install Locale" offers it by
            // its script's name again (Fields, the paragraph after "Change
            // Language"; Rule 5).
            await site.goto();
            for (const code of SCRIPTS) {
                await expect(nameCell(site, code)).toHaveText(SCRIPT_NAMES[code]);
                await expect(site.asterisk(code)).toHaveText('*');
            }
            await expect(nameCell(site, 'en')).toHaveText('English/English');
            wizard = await openWizardLanguages(ap, tagA, wizardLabels);
            for (const code of SCRIPTS) {
                await expect(nameCell(wizard.website, code)).toHaveText(SCRIPT_NAMES[code]);
                await expect(wizard.website.asterisk(code)).toHaveCount(0);
            }
            await new JournalLanguagesTab(ap, tagA).settings.goto('website');
            const links = (await new LanguageMenu(ap).read()).map((i) => [i.text, i.heading ? 'heading' : i.ticked]);
            expect(links[0]).toEqual(['Change Language', 'heading']);
            expect(links).toContainEqual(['English', true]);
            for (const name of ['o‘zbek', 'o‘zbek (lotin)', '中文（简体）', '中文（繁體）']) {
                expect(links).toContainEqual([name, false]);
            }
            await site.goto();
            await site.pressRemove('uz');
            const uzRemoved = await site.answer('Remove', 'OK');
            expect(uzRemoved.status()).toBe(200);
            await expect(site.row('uz')).toHaveCount(0);
            // The list as answered still draws the uz_Latn row with its
            // script's name; read after a reload (T-omp-1).
            await site.reload();
            await expect(site.row('uz')).toHaveCount(0);
            await expect(nameCell(site, 'uz_Latn')).toHaveText('Uzbek/o‘zbek');
            await expect(site.asterisk('uz_Latn')).toHaveText('*');
            await expect(nameCell(site, 'zh_Hans')).toHaveText(SCRIPT_NAMES.zh_Hans);
            wizard = await openWizardLanguages(ap, tagA, wizardLabels);
            await expect(wizard.website.row('uz')).toHaveCount(0);
            await expect(nameCell(wizard.website, 'uz_Latn')).toHaveText('Uzbek/o‘zbek');
            await expect(nameCell(wizard.website, 'zh_Hant')).toHaveText(SCRIPT_NAMES.zh_Hant);
            await site.goto();
            await site.pressRemove('uz_Latn');
            const uzLatnRemoved = await site.answer('Remove', 'OK');
            expect(uzLatnRemoved.status()).toBe(200);
            await expect(site.row('uz_Latn')).toHaveCount(0);
            const offered = await site.openInstall();
            await expect(offered.boxByLabel('Uzbek (Latin)/o‘zbek (lotin) (uz_Latn)')).toBeVisible();
            await expect(offered.box('uz_Latn')).toHaveCount(1);
            await offered.cancel();

            // Control: the site's primary language cannot be disabled (Rule 3b).
            await site.goto();
            await site.enableBox('en').click();
            await expect(site.question('Disable')).toContainText(DISABLE_Q);
            await noticeDuring(ap, CANT_DISABLE, () => site.answer('Disable', 'OK'), {timeout: SITE_CHANGE});
            await site.reload();
            await expect(site.enableBox('en')).toBeChecked();
            await expect(site.primaryRadio('en')).toBeChecked();
        } finally {
            await putBack(ap);
        }
    });

    test("S3: the site's primary language @solo", async ({asUser, ompApi, newVisitor}, testInfo) => {
        test.setTimeout(5 * SITE_CHANGE);
        const tag = makeTag(3, testInfo);
        const nora = `${tag}nora`;
        const ap = await signedIn(asUser, 'admin');
        const site = new SiteLanguagesList(ap);
        await putBack(ap);
        try {
            // Given: German installed and enabled; Nora with English names only.
            const installed = await site.install(['de']);
            expect(installed.status()).toBe(200);
            await ompApi.createContext({tag, users: [person(nora, 'Nora', 'Lindqvist', ['reader'])]});

            // "Cancel": English stays selected (Rules 3, 4).
            await site.goto();
            await site.primaryRadio('de').click();
            await expect(site.question('Primary locale')).toContainText(PRIMARY_Q);
            await expect(site.questionButton('Primary locale', 'OK')).toBeVisible();
            await site.answer('Primary locale', 'Cancel');
            await expect(site.primaryRadio('en')).toBeChecked();
            await expect(site.primaryRadio('de')).not.toBeChecked();

            // German made primary: the notice; German's row has no arrow,
            // English's offers "Remove" (Rules 4, 5).
            await site.primaryRadio('de').click();
            await expect(site.question('Primary locale')).toBeVisible();
            const primary = await noticeDuring(ap, PRIMARY_DEFINED, () => site.answer('Primary locale', 'OK'), {timeout: SITE_CHANGE});
            expect(primary.status()).toBe(200);
            await site.reload();
            await expect(site.primaryRadio('de')).toBeChecked();
            await expect(site.arrow('de')).toHaveCount(0);
            await expect(site.arrow('en')).toHaveCount(1);
            expect(await site.openRowActions('en')).toEqual(['Remove']);

            // The first visitor, preferring Japanese: the site's home in
            // German (Rules 4, 17, 18; A10 not read).
            const japanese = await newVisitor({language: 'ja'});
            await japanese.goto('/index.php/index');
            await expect(japanese).toHaveURL(siteHome('de'));
            expect(await pageLang(japanese)).toMatch(/^de/);

            // Nora's names copied into German (Side effects).
            const np = await signedIn(asUser, nora);
            const profile = new ProfilePage(np, null);
            await np.goto(profile.url('identity'));
            await expect(profile.form('identity')).toBeVisible({timeout: 30_000});
            await expect(profile.givenName('de')).toHaveValue('Nora');
            await expect(profile.familyName('de')).toHaveValue('Lindqvist');
            await expect(profile.givenName('en')).toHaveValue('Nora');

            // Control: the second visitor, asking for "en", reads English (Rule 18).
            const english = await newVisitor({language: 'en'});
            await english.goto('/index.php/index');
            await expect(english).toHaveURL(siteHome('en'));
            expect(await pageLang(english)).toMatch(/^en/);
        } finally {
            await putBack(ap);
        }
    });
});
