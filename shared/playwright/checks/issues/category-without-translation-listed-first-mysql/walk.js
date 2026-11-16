// U16 A26 — on MySQL 8.0 and MariaDB 10.11 a category with no name in the page's language comes
// first in every category list; PostgreSQL puts it last. Issue report:
// docs/issues/U16-A26-category-without-translation-listed-first-mysql.md (its Steps, taken here).
//
// Preconditions (seeded, as the Steps list them; no dataset exists for MySQL or MariaDB): a context
// in English and French (UI and forms), its manager, and the categories "Arts" (fr "Beaux-arts"),
// "Zoology" (fr "Animaux"), "Science" (fr "Sciences") with "Physics" (fr "Physique"), "Botany" (fr
// "Botanique") and "Topology" (English only) under it, and "Mathematics" (English only).
// Steps, on the screens: as the manager, Website › "Plugins" "Browse Block" ticked; Appearance ›
// "Setup" › "Sidebar" "Browse Block" ticked, "Save"; Settings › "Catégories" in French read. As a
// visitor in French: the "Browse" block on the "Arts" page, the "Sciences" page's "Subcategories".
//
// Modes (WALK_MODE):
//   (unset)  the Steps, in French: what A26 is about.
//   nb       the neighbour the fix must leave alone: the same three lists in English, where every
//            category has a name (alphabetical on every database). Runs alone, with its own context.
//
// Run (a reset line, then the walk; `mariadb` likewise; PostgreSQL `main` is the control, on its
// campaign fleet, under `bin/app-lock.sh shared ojs,omp,ops -- …`):
//   PKP_E2E_LINE=mysql npm run reset:ojs   (omp, ops; then `npm run fleet-prep -- --feature cfg-mysql`)
//   PKP_E2E_LINE=mysql PROBE_FEATURE=cfg-mysql PROBE_AGENT=n16k node bin/probe.js all \
//     shared/playwright/checks/issues/category-without-translation-listed-first-mysql/walk.js
//
// Reads (facts.reads): `unnamedFirst` / `unnamedSubFirst` (the fault: "Mathematics", "Topology" at
// the head); `unnamedLast` / `unnamedSubLast` (the Steps' Expected, PostgreSQL today and every
// database with fix.diff). Facts: walk[-<PROBE_RUN>]-<app>.json (nb: neighbour-…); screenshots
// browse-…, subcategories-…, settings-tab-….
const {forEachApp, launch, signIn, signOut, screen, shot, record, tag} = require('../../../probe');
const L = require('./lib');

const MODE = process.env.WALK_MODE || '';

forEachApp(async (app) => {
    const nb = MODE === 'nb';
    const t = tag(nb ? 'u16n16knb' : 'u16n16k');
    const locale = nb ? '' : 'fr_CA';
    const facts = {line: app.line, mode: nb ? 'neighbour (English)' : 'steps (French)', context: t};
    const word = app.name === 'ops' ? 'preprints' : 'catalog';
    const lang = locale ? `/${locale}` : '';
    const unnamed = 'Mathematics';
    const unnamedSub = 'Topology';
    const {page, close} = await launch(app);
    try {
        const mg = await L.seedPreconditions(app, t);
        // Steps 1-2: the manager places the "Browse" block.
        await signIn(page, mg, {contextPath: t});
        facts.browseBlock = await L.placeBrowseBlock(page, app, t);
        // Step 3: Settings › "Categories" in the page's language.
        facts.settingsTab = await L.readSettingsTab(page, t, locale);
        record(nb ? 'neighbour-settings-tab' : 'settings-tab', await screen(page));
        await shot(page, nb ? 'neighbour-settings-tab' : 'settings-tab');
        await signOut(page);

        // Step 4: the "Arts" page's "Browse" block, as a visitor.
        facts.retried = [];
        const r1 = await L.openPublic(page, `/index.php/${t}${lang}/${word}/category/arts`);
        if (r1) facts.retried.push(r1);
        const block = await L.readBrowseBlock(page, app.name);
        facts.blockPresent = block.present;
        facts.blockTop = block.tree.map((c) => c.name);
        facts.blockUnderScience = (block.tree.find((c) => /^Science/.test(c.name)) || {children: []}).children.map((c) => c.name);
        record(nb ? 'neighbour-browse' : 'browse', await screen(page));
        await shot(page, nb ? 'neighbour-browse' : 'browse');

        // Step 5: the "Sciences" page's "Subcategories".
        const r2 = await L.openPublic(page, `/index.php/${t}${lang}/${word}/category/science`);
        if (r2) facts.retried.push(r2);
        facts.subcategories = await L.readSubcategories(page);
        record(nb ? 'neighbour-subcategories' : 'subcategories', await screen(page));
        await shot(page, nb ? 'neighbour-subcategories' : 'subcategories');

        const top = facts.blockTop;
        const tab = facts.settingsTab.names;
        const subs = facts.subcategories;
        const last = (a) => a[a.length - 1];
        const named = (a) => a.filter((n) => n !== unnamed && n !== unnamedSub);
        const sorted = (a) => JSON.stringify(a) === JSON.stringify([...a].sort((x, y) => x.localeCompare(y)));
        facts.reads = nb
            ? {
                blockAlphabetical: sorted(top),
                tabAlphabetical: sorted(tab),
                subcategoriesAlphabetical: sorted(subs),
            }
            : {
                unnamedFirst: top[0] === unnamed || (app.name === 'omp' && [top[0], top[1]].includes(unnamed)),
                unnamedLast: app.name === 'omp' ? top.slice(-2).includes(unnamed) && top.slice(-2).includes(unnamedSub) : last(top) === unnamed,
                tabUnnamedFirst: tab[0] === unnamed,
                tabUnnamedLast: last(tab) === unnamed,
                unnamedSubFirst: subs[0] === unnamedSub,
                unnamedSubLast: last(subs) === unnamedSub,
                namedAlphabetical: sorted(named(top)) && sorted(named(tab)) && sorted(named(subs)),
            };
    } finally {
        record(nb ? 'neighbour' : 'walk', facts);
        console.log(JSON.stringify(facts, null, 1));
        await close();
    }
});
