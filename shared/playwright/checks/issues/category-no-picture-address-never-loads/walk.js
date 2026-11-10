// Issue report U16 A22: a category's picture addresses, typed for a category with no picture. Takes the report's
// Steps on PKP's default test dataset (a dataset fleet), as `rvaca` (the manager):
//   1-5  Settings › Journal (Press, Server) › "Categories", "Applied Science" › "Edit", "Cover Image" a 400 × 400
//        PNG, "Save" (3.5: the older form, "OK"). On an install loaded from the dataset dump this is what creates
//        the context's own public files folder (3.5: its private `categories/` folder), as any journal with a
//        category picture has it. (A dataset fleet's reset makes the public folder already, since 2026-10-21.)
//   6    type the small picture's address of "Computer Science", which has no picture
//        (…/catalog/thumbnail?type=category&id=<id>, OPS …/preprints/…; main redirects it to its `/en/` form);
//   7    type its full-size address (…/fullSize?type=category&id=<id>).
//   Before step 1 it types step 6's address once on the fresh dataset, and after step 7 an unknown id (999), the
//   404 control. OMP has the fault on main since pkp/omp#2553 (1ac42011ad); on 3.5 its own handler answers an
//   empty page.
//   The OPS 3.5 dataset has neither category: "Social sciences" takes the picture and "History" is the one without.
// Neighbour mode (fix in and out), alone:
//   WALK=nb  steps 1-5, then "Social Sciences" gets the picture too (the folder exists by then, so its small copy
//            is written); its small and full-size addresses and Applied Science's full-size address must still
//            answer the picture, and id 999 the 404.
//   WALK=removed  (main) steps 1-5, then Applied Science's small picture address (the picture), "Edit" ›
//            "Remove" under "Cover Image" › "Save", and the same address again: a visitor's kept address.
//
// Reset first:  npm run fleet-prep -- --feature <feature> --dataset <n> --reset
// Run (main):   PROBE_FEATURE=<feature> PROBE_AGENT=<name> node bin/probe.js all shared/playwright/checks/issues/category-no-picture-address-never-loads/walk.js
// Run (3.5):    PKP_E2E_LINE=stable-3_5_0 npm run fleet-prep -- --feature <feature>-3_5 --dataset <n> --reset
//               PKP_E2E_LINE=stable-3_5_0 PROBE_RUN=r35 PROBE_FEATURE=<feature>-3_5 PROBE_AGENT=<name> node bin/probe.js all shared/playwright/checks/issues/category-no-picture-address-never-loads/walk.js
const path = require('path');
const {forEachApp, launch, signIn, record, idle, sql, serverLog} = require('../../../probe');
const {setCategoryPicture, typeAddress, removeCategoryPicture} = require('./lib');

const MODE = process.env.WALK || 'walk';
const FILES = path.join(__dirname, '..', '..', '..', '..', '..', 'apps', 'ojs', 'playwright', 'fixtures', 'files');
const PICTURE = path.join(FILES, 'profile-image-400.png'); // a real 400 × 400 PNG

forEachApp(async (app) => {
    if (!app.dataset) throw new Error('walk.js runs on a dataset fleet (fleet-prep --dataset n --reset)');
    const line = app.line || 'main';
    const run = process.env.PROBE_RUN ? `-${process.env.PROBE_RUN}` : '';
    const name = `nopic-${MODE}${run}`;
    const facts = {app: app.name, line, mode: MODE, steps: {}};
    const fact = (k, v) => {
        facts.steps[k] = v;
        console.log(`[fact] ${app.name} ${k}: ${JSON.stringify(v).slice(0, 1500)}`);
    };
    // Notices too (the fread() one), and the request lines of the picture addresses (main redirects a typed
    // address without the language to its `/en/` form first).
    const log = serverLog(app, {match: /error|exception|fatal|warning|notice|\[\d{3}\]: GET \S*(thumbnail|fullSize)/i});
    const {page, close} = await launch(app);
    const step = async (label, action) => {
        const from = log.mark();
        try {
            const out = await action();
            const logged = log.since(from);
            fact(label, out === undefined ? 'done' : out);
            if (logged && logged.length) fact(`${label} server log`, logged.slice(0, 12));
            return out;
        } catch (e) {
            fact(`${label} threw`, String(e.message).split('\n')[0]);
            return null;
        } finally {
            await idle(page).catch(() => null);
        }
    };
    const word = app.name === 'ops' ? 'preprints' : 'catalog';
    const ctx = app.contextPath;
    const idOf = (p) => sql(app, `SELECT category_id FROM categories WHERE path = '${p}'`).trim();
    const has = (p) => !!idOf(p);
    // main keeps a category's picture in `categories.image`; 3.5 in `category_settings` (`image`).
    const imageColumn = !!sql(app, `SELECT 1 FROM information_schema.columns WHERE table_name = 'categories' AND column_name = 'image'`).trim();
    const storedPictures = () =>
        (imageColumn
            ? sql(app, `SELECT category_id, image FROM categories WHERE image IS NOT NULL`)
            : sql(app, `SELECT category_id, setting_value FROM category_settings WHERE setting_name = 'image'`)
        ).trim() || 'none';
    const pic = has('applied-science') ? {name: 'Applied Science', path: 'applied-science'} : {name: 'Social sciences', path: 'social-sciences'};
    const nopic = has('comp-sci') ? {name: 'Computer Science', path: 'comp-sci'} : {name: 'History', path: 'history'};
    pic.id = idOf(pic.path);
    nopic.id = idOf(nopic.path);
    fact('categories', {picture: pic, noPicture: nopic, storedImage: storedPictures()});
    const addr = (kind, id) => app.url(`/index.php/${ctx}/${word}/${kind}?type=category&id=${id}`);

    try {
        if (MODE === 'walk') {
            await step(`0 fresh dataset: ${nopic.name}'s small picture address`, () => typeAddress(page, addr('thumbnail', nopic.id)));
        }
        await step('1 sign in as rvaca', async () => {
            await signIn(page, 'rvaca');
            return page.url();
        });
        await step(`2-5 ${pic.name}: Cover Image, Save`, () => setCategoryPicture(page, app, pic.name, PICTURE));
        fact('stored pictures', storedPictures());

        if (MODE === 'walk') {
            await step(`6 type ${nopic.name}'s small picture address`, () => typeAddress(page, addr('thumbnail', nopic.id)));
            await step(`7 type ${nopic.name}'s full-size address`, () => typeAddress(page, addr('fullSize', nopic.id)));
            await step('control: an unknown id (999)', () => typeAddress(page, addr('thumbnail', 999)));
        }

        if (MODE === 'removed') {
            await step(`r1 ${pic.name}'s small picture address, with its picture`, () => typeAddress(page, addr('thumbnail', pic.id)));
            await step(`r2 ${pic.name}: Edit, Remove under Cover Image, Save`, () => removeCategoryPicture(page, app, pic.name));
            fact('stored pictures after removal', storedPictures());
            await step(`r3 ${pic.name}'s small picture address again`, () => typeAddress(page, addr('thumbnail', pic.id)));
            await step(`r4 ${pic.name}'s full-size address`, () => typeAddress(page, addr('fullSize', pic.id)));
        }

        if (MODE === 'nb') {
            // A top-level category (its row shows without opening a parent's), pictured once the folder exists.
            if (line === 'main' && has('social-sciences')) {
                await step('nb Social Sciences: Cover Image, Save', () => setCategoryPicture(page, app, 'Social Sciences', PICTURE));
                const soc = idOf('social-sciences');
                await step('nb Social Sciences small picture', () => typeAddress(page, addr('thumbnail', soc)));
                await step('nb Social Sciences full size', () => typeAddress(page, addr('fullSize', soc)));
            }
            await step(`nb ${pic.name} full size`, () => typeAddress(page, addr('fullSize', pic.id)));
            await step('nb unknown id (999)', () => typeAddress(page, addr('thumbnail', 999)));
        }
    } finally {
        record(name, facts);
        await close();
    }
});
