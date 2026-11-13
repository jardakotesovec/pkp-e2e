// Configurations run — category lists on MySQL 8.0 / MariaDB 10.11: read in a language a category has
// no name in, that category comes first, where PostgreSQL puts it last (U16 A41; ci-triage C-U16-1;
// the red tests OJS and OPS U16 S7).
//
// `PKP\category\Collector::getQueryBuilder()` joins the category's `title` in the reader's language
// only and orders by `COALESCE(category_settings.setting_value) ASC`, a COALESCE of one argument: no
// fallback to the name the page shows (the primary language's), so a category with no name in that
// language sorts as NULL, first on MySQL and MariaDB, last on PostgreSQL. Every list the Collector
// orders shows it: the "Browse" block, a category page's "Subcategories", the Categories settings
// tab, the submission's category picker.
//
// Steps (screens; the context and its categories are seeded through the campaign's API the way
// Settings › "Categories" › "Add Category" › "Save" makes them, with the forms in English and French):
// "Arts" (fr "Beaux-arts"), "Zoology" (fr "Animaux"), "Science" (fr "Sciences") with the subcategories
// "Physics" (fr "Physique"), "Botany" (fr "Botanique") and "Topology" (English only), and "Mathematics"
// (English only). As the manager: Website › Plugins, "Browse Block" ticked; Appearance › Setup,
// "Sidebar" › "Browse Block" ticked, "Save". As a visitor, in French: the "Browse" block on the
// "Beaux-arts" page, and the "Sciences" page's "Subcategories".
//
//   PKP_E2E_LINE=mysql npm run reset:<app> && PKP_E2E_LINE=mysql npm run fleet-prep -- --feature cfgrun --apps ojs,ops
//   PKP_E2E_LINE=mysql npm run probe-servers -- --start --app ojs (and --app ops)
//   PKP_E2E_LINE=mysql PROBE_FEATURE=cfgrun PROBE_AGENT=cfgcat node bin/probe.js ojs,ops shared/playwright/checks/sync/cfg-category-order/walk.js
// (`mariadb` likewise; on the usual PostgreSQL fleet it is the control.)
//
// Reads fixed when: MySQL and MariaDB read as PostgreSQL does. With `fix.diff` (no name in the
// language: last) the French block reads "Animaux", "Beaux-arts", "Sciences", "Mathematics" and the
// subcategories "Botanique", "Physique", "Topology" (`reads.unnamedLast`); with
// `fix-shown-name.diff` (sorted by the name shown) "Animaux", "Beaux-arts", "Mathematics",
// "Sciences" (`reads.byShownName`) on every database, PostgreSQL included. At OJS 3c99722dc8 /
// OPS c74e5bf190 (pkp-lib ad75b174f0) on MySQL 8.0.46 and MariaDB 10.11.19: "Mathematics" first
// and "Topology" first (`reads.unnamedFirst`); on PostgreSQL both last.
//
// Facts: walk-<app>.json; screenshot walk-browse-<app>.png.
const {forEachApp, launch, signIn, shot, record, tag} = require('../../../probe');
const {CategoryPage, BrowseBlock} = require('../../../pages/CategoriesPages.js');
const {PluginsTab} = require('../../../pages/CustomContentPages.js');
const {WebsiteSettings} = require('../../../pages/AppearancePages.js');

forEachApp(async (app) => {
    const t = tag('cfgcat');
    const mg = `${t}mg`;
    await app.api.createContext({
        tag: t,
        context: {supportedLocales: ['en', 'fr_CA'], supportedFormLocales: ['en', 'fr_CA']},
        users: [{username: mg, givenName: 'Mona', familyName: 'Manager', email: `${mg}@mail.test`, roles: ['manager']}],
        categories: [
            {path: 'arts', title: {en: 'Arts', fr_CA: 'Beaux-arts'}},
            {path: 'zoology', title: {en: 'Zoology', fr_CA: 'Animaux'}},
            {
                path: 'science',
                title: {en: 'Science', fr_CA: 'Sciences'},
                children: [
                    {path: 'physics', title: {en: 'Physics', fr_CA: 'Physique'}},
                    {path: 'botany', title: {en: 'Botany', fr_CA: 'Botanique'}},
                    {path: 'topology', title: {en: 'Topology'}},
                ],
            },
            {path: 'mathematics', title: {en: 'Mathematics'}},
        ],
    });
    const facts = {line: app.line, context: t};
    const word = app.name === 'ops' ? 'preprints' : 'catalog';
    const {page, close} = await launch(app);
    const visitor = await launch(app);
    try {
        await signIn(page, mg, {contextPath: t});
        const plugins = new PluginsTab(page, t);
        await plugins.goto();
        facts.pluginEnable = await plugins.enable('browseblockplugin');
        const settings = new WebsiteSettings(page, t, app.name === 'ops' ? {thumbnailField: 'serverThumbnail'} : {});
        await settings.goto();
        const setup = await settings.open('appearance-setup');
        await setup.sidebar.box('Browse Block').check();
        await setup.save();

        const cat = new CategoryPage(visitor.page, t, {word});
        const block = new BrowseBlock(visitor.page);
        await cat.goto('arts', {locale: 'en'});
        facts.englishTop = (await block.tree()).map((c) => c.name);
        await cat.goto('arts', {locale: 'fr_CA'});
        const french = await block.tree();
        facts.frenchTop = french.map((c) => c.name);
        facts.frenchUnderSciences = (french.find((c) => c.name === 'Sciences') || {children: []}).children.map((c) => c.name);
        await shot(visitor.page, 'walk-browse');
        await cat.goto('science', {locale: 'fr_CA'});
        facts.frenchSubcategories = (await cat.subcategoryLinks().allInnerTexts()).map((s) => s.trim());

        facts.reads = {
            unnamedFirst: facts.frenchTop[0] === 'Mathematics',
            unnamedLast: facts.frenchTop[facts.frenchTop.length - 1] === 'Mathematics',
            unnamedSubFirst: facts.frenchSubcategories[0] === 'Topology',
            byShownName: JSON.stringify(facts.frenchTop) === JSON.stringify(['Animaux', 'Beaux-arts', 'Mathematics', 'Sciences']),
        };
    } finally {
        record('walk', facts);
        console.log(JSON.stringify(facts, null, 1));
        await visitor.close();
        await close();
    }
});
