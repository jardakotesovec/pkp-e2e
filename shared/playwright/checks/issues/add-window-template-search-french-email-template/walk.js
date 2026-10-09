// U37 A15 walk (issue report docs/issues/U37-A15-add-window-template-search-french-email-template.md).
// On PKP's default test dataset, as dbarnes: the user menu's "Français" (French (Canada)); the submission's workflow
// at Production (OJS 5, OMP 4, OPS 1); the Tasks & Discussions panel's add button; the search box over the window's
// template list (its placeholder and its name), then "Production" typed and Enter. Then the same box in English.
//   PROBE_FEATURE=<feature> PROBE_AGENT=<agent> node bin/probe.js all shared/playwright/checks/issues/add-window-template-search-french-email-template/walk.js
// With `neighbour` after the script's path it runs the neighbour check alone (what a fix must leave right): the
// template search of a decision's email composer in French (Canada) and in English, with a search typed into it,
// and the "Add" window's box in English.
// On stable-3_5_0 (PKP_E2E_LINE=stable-3_5_0 PROBE_RUN=r35 in front) the stage has the legacy discussions grid, whose
// add form has no template search: the script records the French stage, that form and the email composer's box.
const {forEachApp, launch, signIn, switchLanguage, screen, record, idle} = require('../../../probe');
const L = require('./lib.js');

const NEIGHBOUR = process.argv.includes('neighbour');

forEachApp(async (app) => {
    const facts = {app: app.name, line: app.line || 'main', mode: NEIGHBOUR ? 'neighbour' : 'steps'};
    const step = async (name, fn) => {
        try {
            facts[name] = await fn();
        } catch (e) {
            facts[name] = {failed: String(e.stack || e).split('\n').slice(0, 4).join(' | ')};
        }
        console.log(`[${app.name}]`, name, JSON.stringify(facts[name]));
    };
    const dashboard = (locale) => app.url(`/index.php/${app.contextPath}/${locale}/dashboard/editorial`);
    const {page, close} = await launch(app);
    try {
        await signIn(page, 'dbarnes', {contextPath: app.contextPath});
        await page.goto(dashboard('en'));
        await idle(page);

        if (facts.line !== 'main') {
            await step('french', async () => {
                await switchLanguage(page, 'fr_CA');
                await page.goto(app.url(`/index.php/${app.contextPath}/fr_CA/dashboard/editorial?workflowSubmissionId=${L.SUBMISSION[app.name]}&workflowMenuKey=${L.MENU_KEY}`));
                await idle(page);
                await L.sleep(1500);
                const vuePanel = await page.locator('[data-cy="discussion-manager"]').count();
                const grid = page.locator('[id^="component-grid-queries"]').first();
                const add = grid.locator('a[id*="addQuery"]').first();
                const addText = L.flat(await add.innerText().catch(() => null));
                await add.click();
                const form = page.locator('form#queryForm').last();
                await form.waitFor({state: 'visible', timeout: 30_000});
                await idle(page);
                await L.sleep(1500);
                const s = await screen(page);
                record('a15-stage', s);
                return {vuePanel, legacyGrid: await page.locator('[id^="component-grid-queries"]').count(), addText, templateWords: (await form.innerText()).match(/[^\n]*mod[eè]le[^\n]*/gi) || [], placeholders: await form.locator('input[placeholder]').evaluateAll((els) => els.map((el) => el.placeholder).filter(Boolean)), form: L.flat(await form.innerText(), 700)};
            });
            await step('composerFrench', async () => {
                const c = await L.openComposer(page, app, 'fr_CA');
                record('a15-composer', await screen(page));
                return {title: c.title, heading: c.heading, ...(await L.readSearch(c.box))};
            });
            record('a15-facts', facts);
            return;
        }

        if (!NEIGHBOUR) {
            // Step 1
            await step('french', async () => {
                await switchLanguage(page, 'fr_CA');
                return {address: page.url().replace(/^https?:\/\/[^/]+/, '')};
            });
            // Steps 2-4
            let win;
            await step('addWindowFrench', async () => {
                const w = await L.openAddWindow(page, app, 'fr_CA');
                win = w.win;
                record('a15-add-window-fr', await screen(page));
                return {panel: w.heading, add: w.addText, search: await L.readSearch(win.locator('input[type="search"]')), over: L.flat(await win.locator('input[type="search"]').evaluate((el) => el.closest('.pkpSearch').previousElementSibling.innerText)), templates: await L.templateNames(win)};
            });
            // Step 5
            await step('searchFrench', async () => {
                const r = await L.searchTemplates(page, win, 'Production');
                record('a15-search-fr', await screen(page));
                return r;
            });
            // The control: the same box in English.
            await step('addWindowEnglish', async () => {
                await page.goto(dashboard('fr_CA'));
                await idle(page);
                await switchLanguage(page, 'en');
                const w = await L.openAddWindow(page, app, 'en');
                record('a15-add-window-en', await screen(page));
                return {panel: w.heading, add: w.addText, search: await L.readSearch(w.win.locator('input[type="search"]'))};
            });
            record('a15-facts', facts);
            return;
        }

        // The neighbour check.
        await step('composerEnglish', async () => {
            const c = await L.openComposer(page, app, 'en');
            return {title: c.title, heading: c.heading, ...(await L.readSearch(c.box))};
        });
        await step('addWindowEnglish', async () => {
            const w = await L.openAddWindow(page, app, 'en');
            return {panel: w.heading, search: await L.readSearch(w.win.locator('input[type="search"]'))};
        });
        await step('composerFrench', async () => {
            await page.goto(dashboard('en'));
            await idle(page);
            await switchLanguage(page, 'fr_CA');
            const c = await L.openComposer(page, app, 'fr_CA');
            const search = await L.readSearch(c.box);
            const before = await page.locator('.composer__templates__list button').count();
            await c.box.fill('a');
            await c.box.press('Enter');
            await idle(page);
            await L.sleep(1500);
            record('a15-nb-composer-fr', await screen(page));
            return {title: c.title, heading: c.heading, ...search, listed: before, listedAfterSearch: await page.locator('.composer__templates__list button').count()};
        });
        record('a15-neighbour', facts);
    } finally {
        await close();
    }
});
