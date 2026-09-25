// @ts-check
/**
 * @file playwright/tests/serial/U16-categories.spec.js
 *
 * Categories — OPS suite, serial part: the scenarios that read posted
 * preprints on a category page, S2 (a category deleted with its
 * sub-categories), S5 (a visitor browses by category) and S6 (a preprint
 * joins and leaves a category's page). S1, S3, S4 and S7 are in
 * `../U16-categories.spec.js`; scenario 8 is {OMP}.
 * Spec: docs/specs/U16-categories.md
 *
 * SERIAL PROJECT, by necessity: a category page lists what the search
 * index holds, and a posted preprint enters the index through a queued
 * job; the fleets run with `[queues] job_runner = Off`, so a preprint is
 * on its category page only after `runJobs()` has drained the queue, and
 * that drain pops the SHARED queue, which is safe in the serial project
 * alone (patterns.md parallel lesson 7). S6 asserts "not listed until the
 * jobs run", so it carries `@solo` and runs alone in the `ops-solo`
 * project: another test's drain would list its late preprint early.
 *
 * Deliberately NOT covered (register IDs from the spec's Findings
 * register; a 🐞 is never asserted as the contract, a ❓ is parked, not a
 * gap; the spec's Coverage section is the record of everything else left
 * out):
 * - A18 🐞: S2 types in the delete dialog's box by its place in the
 *   dialog, never by a name.
 * - A12 🐞: S2 never reads the "Select Categories" window's arrow column
 *   heading.
 * - A19 🐞: no count read here is "1 Items".
 * - A1 🐞, A3 ❓, A5 ❓: no page read here is empty, lists a sub-category's
 *   preprints under its parent or is a third-level category's.
 *
 * Seeding: scenario endpoints only (footnote s). Each scenario runs on its
 * own scratch preprint server (`u16s<n>opw…`) with a throwaway Preprint
 * Server Manager (`…mg`) and Author (`…au`), the username twice as
 * password; categories from `categories[]`, posted preprints from `POST
 * scenarios/submission` (`categories`, `published: true`), S5's "Items per
 * page" from `itemsPerPage`. The visitor is the fixture `page` (no user is
 * set in this file); the manager gets its own `asUser` context. Every
 * absence is a settled read paired with a positive control taken the same
 * way; S2's "no email" is bounded by a "Password Reset Confirmation" the
 * test sends each address afterwards (the addresses are the test's own).
 * Page objects: shared/playwright/pages/CategoriesPages.js (the tab, the
 * delete dialog, the picker's "Select Categories" window, the category
 * page), ArticleLandingPages (the preprint's own page), NotificationsPages
 * (the header's Tasks count) and the OPS dashboard and publication pages.
 */
const {test, expect} = require('../../support/fixtures.js');
const {runJobs} = require('../../../../../shared/playwright/support/jobs.js');
const {ArticleLandingPage} = require('../../../../../shared/playwright/pages/ArticleLandingPages.js');
const {TasksPanel} = require('../../../../../shared/playwright/pages/NotificationsPages.js');
const {EditorialDashboardPage} = require('../../pages/EditorialDashboardPage.js');
const {openWorkflow, unpostPreprint} = require('../../pages/PublicationPages.js');
const {CategoriesTab, CategoryPicker, CategoryPage} = require('../../../../../shared/playwright/pages/CategoriesPages.js');

const T = 30_000;
const WORD = {word: 'preprints'};

/** The listed preprints' titles, sorted (the page's order is not the claim here). */
async function titlesSorted(category) {
    return (await category.itemTitles().allInnerTexts()).map((t) => t.trim()).sort();
}

/** Unique per-run tag: single alphanumeric token, feature + scenario + app + worker. */
function makeTag(scenario, testInfo) {
    return `u16${scenario}opw${testInfo.parallelIndex}${Math.random().toString(36).replace(/[^a-z0-9]/g, '').slice(0, 6)}`;
}

/** A scratch preprint server with a throwaway manager and author. */
async function seedServer(opsApi, tag, extra = {}) {
    await opsApi.createContext({
        tag,
        context: {name: `U16 server ${tag}`},
        users: [
            {username: `${tag}mg`, givenName: 'Mona', familyName: 'Manager', email: `${tag}mg@mail.test`, roles: ['manager']},
            {username: `${tag}au`, givenName: 'Ada', familyName: 'Author', email: `${tag}au@mail.test`, roles: ['author']},
        ],
        ...extra,
    });
    return {manager: `${tag}mg`, author: `${tag}au`};
}

/** A posted preprint by the server's author, placed in the given categories. */
async function postPreprint(opsApi, tag, key, title, categories, extra = {}) {
    const answer = await opsApi.createSubmission({tag: `${tag}${key}`, context: tag, submitter: `${tag}au`, title, categories, published: true, ...extra});
    return answer.submissionId;
}

test.describe('categories (serial)', () => {
    test('S2: delete a category with sub-categories', async ({page, asUser, opsApi, pkpMail}, testInfo) => {
        test.slow();
        test.setTimeout(300_000);
        const tag = makeTag('s2', testInfo);
        const {manager, author} = await seedServer(opsApi, tag, {
            categories: [
                {path: 'arts', title: 'Arts'},
                {path: 'history', title: 'History', children: [{path: 'modern-history', title: 'Modern History', children: [{path: 'cold-war', title: 'Cold War'}]}]},
            ],
        });
        const empires = await postPreprint(opsApi, tag, 'e', 'Empires', ['history']);
        const posters = await postPreprint(opsApi, tag, 'w', 'Wall Posters', ['cold-war', 'arts']);
        runJobs();
        const managerPage = await (await asUser(manager)).newPage();
        const landing = new ArticleLandingPage(page, tag, {op: 'preprint'});
        const category = new CategoryPage(page, tag, WORD);
        const tab = new CategoriesTab(managerPage, tag);
        const tasks = new TasksPanel(managerPage);

        // Before the delete (the positive side of the visitor's reads):
        // "Empires" names "History", "Wall Posters" "Cold War" and "Arts".
        await landing.goto(empires);
        await expect(landing.sideValue('Categories')).toContainText('History');
        await landing.goto(posters);
        await expect(landing.sideValue('Categories')).toContainText('Arts');
        await expect(landing.sideValue('Categories')).toContainText('Cold War');

        // The dialog (Fields, the delete dialog; A18 not read).
        await tab.goto();
        const tasksBefore = await tasks.count();
        let dialog = await tab.openDelete('History');
        await expect(dialog.heading()).toHaveText('Are you absolutely sure you want to delete "History" category?');
        await expect(dialog.root()).toContainText('Warning: Deleting this category will remove all 2 sub-categories within it.');
        await expect(dialog.root()).toContainText('This action cannot be undone. Deleting the category will:');
        await expect(dialog.points()).toHaveText(['Permanently remove all nested sub-categories', 'Unassign this category from any submissions currently using it']);
        await expect(dialog.root()).toContainText('This will not delete the submissions themselves — they will simply be left without a category.');
        await expect(dialog.root()).toContainText('To confirm, please type the name of the category "History" below to proceed');
        await expect(dialog.confirmBox()).toBeVisible();
        await expect(dialog.deleteButton()).toHaveText('I understand the consequences, delete this category');
        await expect(dialog.deleteButton()).toBeDisabled();
        await expect(dialog.cancelButton()).toBeVisible();

        // "Cancel": the dialog closes, "History" stays (Rule 7).
        await dialog.cancel();
        await expect(tab.row('History')).toBeVisible();

        // The name typed: "history" leaves the button grayed out, "History"
        // makes it pressable (Rule 7). The modal store keeps a closed
        // window's slot for 450 ms and an opener pressed within it opens
        // nothing (patterns.md pitfall 4): a page timer set now with a
        // longer delay is due after the app's.
        await managerPage.evaluate(() => new Promise((resolve) => setTimeout(resolve, 500)));
        dialog = await tab.openDelete('History');
        await dialog.confirmBox().fill('history');
        await expect(dialog.deleteButton()).toBeDisabled();
        await dialog.confirmBox().fill('History');
        await expect(dialog.deleteButton()).toBeEnabled();

        // Deleted: "Category Deleted", then "Back to Categories": "Arts" alone
        // (Rule 7).
        expect((await dialog.confirm()).status()).toBe(200);
        await expect(dialog.deletedDialog()).toBeVisible({timeout: T});
        await expect(dialog.deletedDialog()).toContainText('"History" and its 2 sub-categories have been successfully deleted.');
        await expect(dialog.deletedDialog()).toContainText(
            'All submissions previously tagged under these categories are now unassigned. You can reassign them from the submission details page.'
        );
        await dialog.backButton().click();
        await expect(dialog.deletedDialog()).toHaveCount(0, {timeout: T});
        await expect(tab.row('Arts')).toBeVisible({timeout: T});
        await expect(tab.row('History')).toHaveCount(0);

        // The visitor's side (Rules 7, 13; Side effects): "Empires" opens and
        // names no category, "Wall Posters" names "Arts" alone; the three
        // addresses are the bare not-found page.
        await landing.goto(empires);
        await expect(landing.sideItem('Categories')).toHaveCount(0);
        await landing.goto(posters);
        await expect(landing.sideValue('Categories').getByRole('link')).toHaveText(['Arts']);
        for (const gone of ['history', 'modern-history', 'cold-war']) await category.expectBareNotFound(gone);

        // The submission lists' filter: "Select Categories" lists "Arts"
        // alone (Side effects; A12 not read).
        const dashboard = new EditorialDashboardPage(managerPage, tag);
        await dashboard.gotoView('active');
        const modal = await dashboard.openFilters();
        const window = await new CategoryPicker(managerPage, modal).openWindow();
        expect((await window.read()).map((r) => r.name)).toEqual(['Arts']);

        // No email, no notice (Side effects): each address's only message is
        // the password reset the test sends it afterwards; the manager's
        // Tasks count is what it was.
        for (const who of [manager, author]) {
            await page.goto(`/index.php/${tag}/login/lostPassword`);
            await page.locator('form#lostPasswordForm input#email').fill(`${who}@mail.test`);
            await page.locator('form#lostPasswordForm').getByRole('button', {name: 'Reset Password'}).click();
            await pkpMail.find({to: `${who}@mail.test`, subject: 'Password Reset Confirmation'});
            expect(await pkpMail.count({to: `${who}@mail.test`})).toBe(1);
        }
        await tab.goto();
        await tasks.expectCount(tasksBefore);

        // Control: "Arts", never deleted, still opens and lists "Wall
        // Posters" (Rule 7).
        await category.goto('arts');
        await expect(category.heading()).toHaveText('Arts');
        await expect(category.itemTitles()).toHaveText(['Wall Posters']);
    });

    test('S5: a visitor browses by category', async ({page, opsApi}, testInfo) => {
        test.slow();
        test.setTimeout(300_000);
        const tag = makeTag('s5', testInfo);
        await seedServer(opsApi, tag, {
            itemsPerPage: 2,
            categories: [{path: 'science', title: 'Science', children: [{path: 'astronomy', title: 'Astronomy'}, {path: 'physics', title: 'Physics'}]}],
        });
        for (const [key, title] of [['sun', 'Sun Study'], ['moon', 'Moon Study']]) await postPreprint(opsApi, tag, key, title, ['science']);
        for (const [key, title] of [['alpha', 'Alpha Result'], ['beta', 'Beta Result'], ['gamma', 'Gamma Result']]) await postPreprint(opsApi, tag, key, title, ['physics']);
        await opsApi.createSubmission({tag: `${tag}draft`, context: tag, submitter: `${tag}au`, title: 'Draft Theory', categories: ['physics']});
        runJobs();
        const category = new CategoryPage(page, tag, WORD);

        // A parent's page (Fields, the category's page; Rules 2, 8, 11).
        await category.goto('science');
        await expect(category.heading()).toHaveText('Science');
        expect(await category.crumbs()).toEqual(['Home', 'Science']);
        await expect(category.crumbLinks()).toHaveText(['Home']);
        await expect(category.crumbLink('Home')).toHaveAttribute('href', new RegExp(`/index\\.php/${tag}(/en)?(/index)?/?$`));
        await expect(category.currentCrumb().locator('a')).toHaveCount(0);
        await expect(category.subcategoryLinks()).toHaveText(['Astronomy', 'Physics']);
        await expect(category.itemTitles()).toHaveCount(2);
        expect(await titlesSorted(category)).toEqual(['Moon Study', 'Sun Study']);

        // A sub-category's page, over two pages (Rules 8, 9, 11).
        await category.subcategoryLinks().filter({hasText: 'Physics'}).click();
        await expect(category.heading()).toHaveText('Physics');
        expect(await category.crumbs()).toEqual(['Home', 'Science', 'Physics']);
        await expect(category.crumbLinks()).toHaveText(['Home', 'Science']);
        await expect(category.currentCrumb().locator('a')).toHaveCount(0);
        await expect(category.count()).toHaveText(/^\s*3 Items\s*$/);
        await expect(category.subcategories()).toHaveCount(0);
        await expect(category.itemTitles()).toHaveCount(2);
        const first = await titlesSorted(category);
        await expect(category.root()).toContainText('1 - 2 of 3 items');
        await expect(category.pageLink('2')).toBeVisible();
        await category.pageLink('2').click();
        await expect(category.root()).toContainText('3 - 3 of 3 items');
        await expect(category.itemTitles()).toHaveCount(1);
        const second = await titlesSorted(category);
        expect([...first, ...second].sort()).toEqual(['Alpha Result', 'Beta Result', 'Gamma Result']);

        // Back up the breadcrumb (Rule 11).
        await category.crumbLink('Science').click();
        await expect(category.heading()).toHaveText('Science');
        await expect(category.subcategories()).toBeVisible();

        // An unknown address (Rule 13).
        await category.expectBareNotFound('nowhere');

        // Control: "Draft Theory", placed in "Physics" but still in the
        // workflow, is on neither page, and "Physics" counts 3 (Rule 8).
        await category.goto('science');
        await expect(category.itemTitles()).toHaveCount(2);
        await expect(category.item('Draft Theory')).toHaveCount(0);
        await category.goto('physics');
        await expect(category.count()).toHaveText(/^\s*3 Items\s*$/);
        await expect(category.itemTitles()).toHaveCount(2);
        await expect(category.item('Draft Theory')).toHaveCount(0);
        await category.pageLink('2').click();
        await expect(category.root()).toContainText('3 - 3 of 3 items');
        await expect(category.itemTitles()).toHaveCount(1);
        await expect(category.item('Draft Theory')).toHaveCount(0);
    });

    test('S6: a preprint joins and leaves a category\'s page @solo', async ({page, asUser, opsApi}, testInfo) => {
        test.slow();
        test.setTimeout(300_000);
        const tag = makeTag('s6', testInfo);
        const {manager} = await seedServer(opsApi, tag, {categories: [{path: 'science', title: 'Science'}]});
        await postPreprint(opsApi, tag, 'sun', 'Sun Study', ['science']);
        const moon = await postPreprint(opsApi, tag, 'moon', 'Moon Study', ['science']);
        runJobs();
        const late = await postPreprint(opsApi, tag, 'late', 'Late Study', ['science']);
        const category = new CategoryPage(page, tag, WORD);
        const landing = new ArticleLandingPage(page, tag, {op: 'preprint'});

        // Before the jobs run: "2 Items", "Sun Study" and "Moon Study" alone;
        // "Late Study"'s own page already names "Science" (Rule 8a).
        await category.goto('science');
        await expect(category.count()).toHaveText(/^\s*2 Items\s*$/);
        await expect(category.itemTitles()).toHaveCount(2);
        expect(await titlesSorted(category)).toEqual(['Moon Study', 'Sun Study']);
        await landing.goto(late);
        await expect(landing.sideValue('Categories')).toContainText('Science');

        // After the jobs run: "3 Items", "Late Study" listed too (Rule 8a;
        // Side effects).
        runJobs();
        await category.goto('science');
        await expect(category.count()).toHaveText(/^\s*3 Items\s*$/);
        await expect(category.itemTitles()).toHaveCount(3);
        expect(await titlesSorted(category)).toEqual(['Late Study', 'Moon Study', 'Sun Study']);

        // Unposted (Preprint Server Manager): the page drops "Moon Study" at
        // once (Rule 8a).
        const managerPage = await (await asUser(manager)).newPage();
        await openWorkflow(managerPage, tag, moon);
        await unpostPreprint(managerPage);
        await category.goto('science');
        await expect(category.count()).toHaveText(/^\s*2 Items\s*$/);
        await expect(category.itemTitles()).toHaveCount(2);
        expect(await titlesSorted(category)).toEqual(['Late Study', 'Sun Study']);

        // Control: "Sun Study" stayed listed throughout (Rule 8).
        await expect(category.item('Sun Study')).toHaveCount(1);
    });
});
