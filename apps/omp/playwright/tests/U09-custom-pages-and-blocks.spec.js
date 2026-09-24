// @ts-check
/**
 * @file playwright/tests/U09-custom-pages-and-blocks.spec.js
 *
 * Custom pages & blocks — OMP suite, one test per canonical scenario the
 * spec runs on a press (scenarios 1–6, common, and 7, {OJS OMP}), in the
 * press's own vocabulary: Press Manager, Press editor, "About the Press",
 * the press site's Settings › Website; scenario 8 is the preprint server's
 * absence scenario (OPS suite).
 * Spec: docs/specs/U09-custom-pages-and-blocks.md
 *
 * Deliberately NOT covered (register IDs from the spec's Findings register;
 * a 🐞 is never asserted as the contract, a ❓ is parked, not a gap; the
 * spec's Coverage section is the record of everything else left out):
 * - A1 🐞: S4 finds a block's row and its "Sidebar" box by the name the
 *   first save made (the row's id, the box's value) and never reads the
 *   words the list or "Sidebar" show for it, before or after the rename.
 * - A3 🐞: S7 reads the static page's heading and text, never its
 *   breadcrumbs or the heading's level.
 * - A7 🐞: S3 asserts that no preview opens for the Reader and the
 *   signed-out visitor (the preview's empty-title tab title is absent);
 *   it never asserts the blank page or the server's answer.
 * - A4, A10, A12, A13, A14, A15, A16, A17, A18, A19 🐞: no test reaches
 *   those states (no block is deleted, named with "&" or outside the
 *   primary language, no plugin is unticked, no "." path, no refused
 *   paste, no file over the upload limit, no "Content"-only change is
 *   left unsaved).
 * - A11 🐞: S7's refused saves come after its last successful one, and no
 *   notice is read after them.
 * - A2, A5, A6, A8, A9 ❓: not driven.
 *
 * Seeding: scenario endpoints only. Every scenario runs on a scratch press
 * with a throwaway Press Manager (footnote y): S3 adds a Reader and a
 * Press editor whose role is seeded with "Permit changes to Settings"
 * unticked (`roles: {editor: {permitSettings: false}}`) and "Static Pages
 * Plugin" enabled (`plugins`); S6 seeds English and French under "UI" and
 * "Forms" (`context.supportedLocales`, `supportedFormLocales`) and "Custom
 * Block Manager" enabled (`plugins`); S4 and S7 tick their plugin on
 * screen, as the scenario does. A custom block cannot be deleted on these
 * installs (A14), so each block lives on its test's own press. S5's
 * picture files are made in the test (PNG, BMP and a text file; the big
 * ones 1000×650 random-pixel PNGs of about 1906 KB, under the servers' 2 MB
 * upload limit, seed-facts "Install defaults"); its manager is a fresh
 * account, so the whole 5000 KB allowance is free, and the stored files
 * stay on the install. Signed-out reads run in a browser context with an
 * empty storage state (patterns.md, parallel lesson 8); each actor gets
 * its own `asUser` context. Everything runs in the parallel `omp` project.
 */
const zlib = require('zlib');
const {test: base, expect} = require('../support/fixtures.js');
const {NavigationTab, PublicChrome, whole} = require('../../../../shared/playwright/pages/NavigationChromePages.js');
const {
    CustomPageWindow,
    PluginsTab,
    SidebarSetup,
    StaticPagesTab,
    PublicContent,
    notices,
    flat,
} = require('../../../../shared/playwright/pages/CustomContentPages.js');

const T = 30_000;

const ABOUT_PRESS = 'About the Press';
const REQUIRED = 'This field is required.';
const BUILT_IN_NOTE = 'Using paths that are built into the system may cause you to lose access to important functions.';
const CHANGED_QUESTION = 'The data on this form has changed. Do you wish to continue without saving?';
const DELETE_QUESTION = 'Are you sure you wish to delete this item? This action cannot be undone.';
const NO_TAGS = 'No tags are available.';
const NO_BLOCKS = 'No custom blocks have been created.';
const NO_STATIC_PAGES = 'No static pages have been created.';
const SHOW_NAME = 'Show the name of this block above the block content.';
const TAGS = [
    'Principal Contact Name ("Site Admin")',
    'Principal Contact Email ("admin@mail.test")',
    'Support Contact Name ("")',
    'Support Contact Phone ("")',
    'Support Contact Email ("")',
];
const TYPES_REFUSED = 'You can only upload the following types of files: gif, jpg, png, webp.';
const NOT_AN_IMAGE = 'The image you uploaded is not valid.';
const EXTENSION_MISMATCH =
    'The file you uploaded did not match the file extension. This can happen when a file has been renamed to an incompatible type, for example changing photo.png to photo.jpg.';
const ALLOWANCE = /^You do not have enough space in your user directory\. The file you are uploading is \d+kb and you have \d+kb remaining\.$/;
const PATH_CHARACTERS = "The path field must contain only alphanumeric characters plus '.', '/', '-', and '_'.";
const PATH_TAKEN = 'This path already exists for another static page.';

/** A visitor's page: a second browser context with no session at all (parallel lesson 8). */
const test = base.extend({
    visitor: async ({browser, baseURL}, use) => {
        const context = await browser.newContext({baseURL, storageState: {cookies: [], origins: []}, reducedMotion: 'reduce'});
        const page = await context.newPage();
        await use(page);
        await context.close();
    },
});

/** Unique per-run tag: single alphanumeric token, feature + scenario + app + worker. */
function makeTag(scenario, testInfo) {
    return `u9${scenario}omw${testInfo.parallelIndex}${Math.random().toString(36).slice(2, 8)}`;
}

/** A scratch press with a throwaway Press Manager (and any further users and keys). */
async function seedPress(ompApi, tag, extra = {}) {
    const {users = [], ...rest} = extra;
    const answer = await ompApi.createContext({
        tag,
        users: [{username: `${tag}mg`, givenName: 'Mona', familyName: 'Manager', email: `${tag}mg@mail.test`, roles: ['manager']}, ...users],
        ...rest,
    });
    return {manager: `${tag}mg`, name: `Scratch context ${tag}`, answer};
}

/** A page of an actor's own signed-in browser context. */
async function actorPage(asUser, username) {
    return (await asUser(username)).newPage();
}

/** A press-relative address. */
function address(contextPath, pathname, locale = '') {
    return `/index.php/${contextPath}${locale ? `/${locale}` : ''}${pathname}`;
}

/** A bare "404 Not Found" page: the status, the words, no press header. */
async function expectBare404(page, url) {
    const response = await page.goto(url);
    expect(response && response.status()).toBe(404);
    await expect(page.locator('body')).toHaveText(/^\s*404 Not Found\s*$/);
    await expect(page.locator('header.pkp_structure_head')).toHaveCount(0);
}

/** Wait for a notice at the top right that an action raises (armed before the action). */
async function noticeDuring(page, text, action) {
    const seen = expect(notices(page).filter({hasText: text}).first()).toBeVisible({timeout: T});
    seen.catch(() => {});
    await action();
    await seen;
}

// ---------------------------------------------------------------------------
// Picture files, made in the test
// ---------------------------------------------------------------------------

function crc32(buf) {
    let table = crc32.table;
    if (!table) {
        table = crc32.table = Array.from({length: 256}, (_, n) => {
            let c = n;
            for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
            return c >>> 0;
        });
    }
    let crc = 0xffffffff;
    for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
}

/** A w×h RGB PNG: a gradient seeded by `seed`, or random pixels (stored, not compressed). */
function png(w, h, {seed = 0, random = false} = {}) {
    const chunk = (type, data) => {
        const len = Buffer.alloc(4);
        len.writeUInt32BE(data.length);
        const td = Buffer.concat([Buffer.from(type), data]);
        const crc = Buffer.alloc(4);
        crc.writeUInt32BE(crc32(td));
        return Buffer.concat([len, td, crc]);
    };
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(w, 0);
    ihdr.writeUInt32BE(h, 4);
    ihdr[8] = 8;
    ihdr[9] = 2;
    const raw = Buffer.alloc((w * 3 + 1) * h);
    for (let y = 0; y < h; y++) {
        const o = y * (w * 3 + 1);
        for (let x = 0; x < w * 3; x++) raw[o + 1 + x] = random ? (Math.random() * 256) | 0 : (x * 7 + y * 3 + seed) & 0xff;
    }
    const idat = zlib.deflateSync(raw, {level: random ? 0 : 9});
    return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

/** A w×h 24-bit BMP picture. */
function bmp(w, h) {
    const row = Math.ceil((w * 3) / 4) * 4;
    const size = 54 + row * h;
    const b = Buffer.alloc(size);
    b.write('BM', 0);
    b.writeUInt32LE(size, 2);
    b.writeUInt32LE(54, 10);
    b.writeUInt32LE(40, 14);
    b.writeInt32LE(w, 18);
    b.writeInt32LE(h, 22);
    b.writeUInt16LE(1, 26);
    b.writeUInt16LE(24, 28);
    b.writeUInt32LE(row * h, 34);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) b[54 + y * row + x * 3] = 200;
    return b;
}

test.describe('custom pages & blocks', () => {
    test('S1: a custom page, from the item window to the visitor', {tag: '@smoke'}, async ({asUser, ompApi, visitor}, testInfo) => {
        test.slow();
        const tag = makeTag('s1', testInfo);
        const {manager, name} = await seedPress(ompApi, tag);
        const page = await actorPage(asUser, manager);
        const nav = new NavigationTab(page, tag);
        const reader = new PublicContent(visitor);
        const chrome = new PublicChrome(visitor, tag);

        // The item window: "Add item", "Custom Page", the title, the path
        // and the text with a tag's code typed as text (Rule 28).
        await nav.goto();
        await nav.addItem();
        const item = new CustomPageWindow(page);
        await item.titleInput('en').fill('Our page');
        await item.chooseType('Custom Page');
        await item.pathInput.fill('our-page');
        const content = item.content('en');
        await content.type('Welcome to our page. Write to {$contactName} at ');

        // "Insert Tag": the five contact tags with their values; the chosen
        // one sits at the end of the text as a grey label (Rule 4).
        await content.openTagMenu();
        await expect(content.menuItems()).toHaveText(TAGS);
        await content.chooseMenuItem('Principal Contact Email ("admin@mail.test")');
        await expect.poll(() => content.tags()).toHaveLength(1);
        const [chosen] = await content.tags();
        expect(chosen.text).toBe('Principal Contact Email ("admin@mail.test")');
        expect(chosen.color).toBe('rgb(119, 119, 119)');
        expect(chosen.last).toBe(true);

        // Preview: a new tab at "about:blank", the heading and the text with
        // both tags replaced, inside the press's header and footer; the
        // window still open with the typed texts, nothing saved (Rules 7, 28).
        const preview = await item.preview();
        expect(preview.url()).toBe('about:blank');
        const shown = new PublicContent(preview);
        await expect(shown.pageTitle).toHaveText('Our page');
        await expect.poll(() => shown.bodyText()).toBe('Our page Welcome to our page. Write to Site Admin at admin@mail.test');
        await expect(shown.header).toBeVisible();
        await expect(shown.footer).toBeVisible();
        await preview.close();
        await expect(item.form).toBeVisible();
        await expect(item.titleInput('en')).toHaveValue('Our page');
        await expect(item.pathInput).toHaveValue('our-page');
        expect(flat(await content.text())).toContain('Welcome to our page. Write to {$contactName} at');
        expect(await content.tags()).toHaveLength(1);
        // Nothing saved: the items table behind the window lists the
        // installed items and no "Our page".
        await expect(nav.rows('items').first()).toBeAttached();
        await expect(nav.row('items', 'Our page')).toHaveCount(0);

        // Saved, in no menu (Rule 1): the item is listed, and no menu of the
        // reloaded tab holds it.
        const saved = await item.save();
        expect(saved.body && saved.body.status).toBe(true);
        await expect(item.form).toBeHidden();
        await nav.goto();
        await expect(nav.row('items', 'Our page')).toHaveCount(1);
        await expect.poll(async () => (await nav.menus()).length).toBeGreaterThan(0);
        for (const menu of await nav.menus()) expect(menu.items).not.toContain('Our page');

        // The visitor's page: header, breadcrumbs, heading, the text with
        // the tag's value, footer; the tab's title (Rules 1, 2, 4, 28).
        await reader.goto(address(tag, '/our-page'));
        expect(await chrome.trail()).toEqual(['Home', 'Our page']);
        await expect(reader.pageTitle).toHaveText('Our page');
        expect(await reader.bodyText()).toBe('Our page Welcome to our page. Write to Site Admin at admin@mail.test');
        await expect(reader.footer).toBeVisible();
        await expect(visitor).toHaveTitle(`Our page | ${name}`);

        // Control, while the page stands: the Press Manager, signed in, sees
        // the same page with no "Edit" link, where "About the Press" offers
        // the manager one (Rule 2).
        const managerView = new PublicContent(await (await asUser(manager)).newPage());
        await managerView.goto(address(tag, '/about'));
        await expect(managerView.page.locator('a.cmp_edit_link')).not.toHaveCount(0);
        await managerView.goto(address(tag, '/our-page'));
        await expect(managerView.pageTitle).toHaveText('Our page');
        expect(await managerView.bodyText()).toBe('Our page Welcome to our page. Write to Site Admin at admin@mail.test');
        await expect(managerView.page.locator('a.cmp_edit_link')).toHaveCount(0);

        // Moved: a new "Path" moves the page; the old address answers a bare
        // "404 Not Found" (Rule 5).
        const edit = new CustomPageWindow(page);
        await nav.editItem('Our page');
        await edit.pathInput.fill('our-new-page');
        const moved = await edit.save();
        expect(moved.body && moved.body.status).toBe(true);
        await expect(edit.form).toBeHidden();
        await reader.goto(address(tag, '/our-new-page'));
        await expect(reader.pageTitle).toHaveText('Our page');
        await expectBare404(visitor, address(tag, '/our-page'));

        // Removed: its address answers a bare "404 Not Found" (Rule 5).
        await nav.openRemove('items', 'Our page');
        await nav.removeDialogButton('OK').click();
        await expect(nav.row('items', 'Our page')).toHaveCount(0);
        await expectBare404(visitor, address(tag, '/our-new-page'));
    });

    test("S2: a custom page on a built-in page's address", async ({asUser, ompApi, visitor}, testInfo) => {
        test.slow();
        const tag = makeTag('s2', testInfo);
        const {manager} = await seedPress(ompApi, tag);
        const page = await actorPage(asUser, manager);
        const nav = new NavigationTab(page, tag);
        const chrome = new PublicChrome(visitor, tag);
        const reader = new PublicContent(visitor);
        await chrome.goto();

        // The item at "about": the window's note warns of built-in paths
        // (Rule 6).
        await nav.goto();
        await nav.addItem();
        const item = new CustomPageWindow(page);
        await item.titleInput('en').fill('About us');
        await item.chooseType('Custom Page');
        await item.pathInput.fill('about');
        await item.content('en').type('About replacement.');
        expect(await item.text()).toContain(BUILT_IN_NOTE);
        const saved = await item.save();
        expect(saved.body && saved.body.status).toBe(true);
        await expect(item.form).toBeHidden();

        // The header's "About" › "About the Press" opens the custom page; so
        // does {press}/about (Rule 6).
        await chrome.reload();
        await chrome.pointAt('primary', 'About');
        await chrome.submenuLink('primary', 'About', ABOUT_PRESS).click();
        await expect(reader.pageTitle).toHaveText('About us');
        expect(await reader.bodyText()).toBe('About us About replacement.');
        await reader.goto(address(tag, '/about'));
        await expect(reader.pageTitle).toHaveText('About us');
        expect(await reader.bodyText()).toBe('About us About replacement.');

        // An address under it: the press's contact page (Rule 6a).
        await reader.goto(address(tag, '/about/contact'));
        await expect(reader.pageTitle).toHaveText('Contact');

        // Control: "Editorial Masthead" still opens (Rule 6a).
        await reader.goto(address(tag, '/about/editorialMasthead'));
        await expect(reader.pageTitle).toHaveText('Editorial Masthead');
    });

    test("S3: a preview's address typed by hand", async ({asUser, ompApi, visitor}, testInfo) => {
        test.slow();
        const tag = makeTag('s3', testInfo);
        const {manager, name} = await seedPress(ompApi, tag, {
            users: [
                {username: `${tag}rd`, givenName: 'Rita', familyName: 'Reader', email: `${tag}rd@mail.test`, roles: ['reader']},
                {username: `${tag}ed`, givenName: 'Edna', familyName: 'Editor', email: `${tag}ed@mail.test`, roles: ['editor']},
            ],
            roles: {editor: {permitSettings: false}},
            plugins: {staticpagesplugin: {enabled: true}},
        });
        const navPreview = address(tag, '/navigationMenu/preview');
        const pagesPreview = address(tag, '/pages/preview');
        // The preview page with nothing typed: its tab reads "| {press name}".
        const emptyPreviewTitle = new RegExp(`^\\s*\\|\\s*${name}\\s*$`);
        const anyEmptyPreviewTitle = /^\s*\|/;

        // Control first, the same read: the Press Manager at the typed
        // address gets the press's page with no title and no content
        // (Actors row 2).
        const mgr = new PublicContent(await actorPage(asUser, manager));
        await mgr.goto(navPreview);
        await expect(mgr.page).toHaveTitle(emptyPreviewTitle);
        await expect(mgr.pageTitle).toHaveText('');
        expect(await mgr.bodyText()).toBe('');

        // The Reader: no preview opens, at either address (Actors row 2; A7).
        const readerPage = await actorPage(asUser, `${tag}rd`);
        for (const url of [navPreview, pagesPreview]) {
            await readerPage.goto(url);
            await expect(readerPage).not.toHaveTitle(anyEmptyPreviewTitle);
        }

        // Signed out: the same (Actors row 2; A7).
        for (const url of [navPreview, pagesPreview]) {
            await visitor.goto(url);
            await expect(visitor).not.toHaveTitle(anyEmptyPreviewTitle);
        }

        // The Press editor without Settings: the press's page with no title
        // and no content, as the manager's (Actors row 2).
        const editor = new PublicContent(await actorPage(asUser, `${tag}ed`));
        await editor.goto(navPreview);
        await expect(editor.page).toHaveTitle(emptyPreviewTitle);
        await expect(editor.pageTitle).toHaveText('');
        expect(await editor.bodyText()).toBe('');
    });

    test('S4: a custom block, from the plugin to the sidebar', async ({asUser, ompApi, visitor}, testInfo) => {
        test.slow();
        const tag = makeTag('s4', testInfo);
        const {manager} = await seedPress(ompApi, tag);
        const page = await actorPage(asUser, manager);
        const plugins = new PluginsTab(page, tag);
        const sidebar = new SidebarSetup(page, tag);
        const home = new PublicContent(visitor);
        const homeUrl = address(tag, '');
        await home.goto(homeUrl);

        // The plugin: ticked, its arrow offers "Manage Custom Blocks" at once,
        // which opens the window with the empty list (Rule 17).
        await plugins.goto();
        await expect(plugins.enabledBox('customblockmanagerplugin')).not.toBeChecked();
        await noticeDuring(page, 'The plugin "Custom Block Manager" has been enabled.', () => plugins.enable('customblockmanagerplugin'));
        let blocks = await plugins.openBlockManager();
        await expect(blocks.heading).toHaveText('Custom Block Manager');
        await expect(blocks.listHeading).toHaveText('Custom Blocks');
        await expect(blocks.columnHeaders.filter({hasText: 'Block Name'})).toHaveCount(1);
        await expect(blocks.addLink).toBeVisible();
        await expect(blocks.emptyRow).toHaveText(whole(NO_BLOCKS));

        // The block window: "Block Name", "Content", "Show Name" unticked,
        // "Save" and "Cancel"; its "Insert Tag" offers no tag (Fields; Rule 28).
        let block = await blocks.addBlock();
        await expect(block.heading).toHaveText('Add Block');
        await expect(block.nameInput('en')).toBeVisible();
        await expect(block.showNameBox).not.toBeChecked();
        await expect(block.showNameLabel()).toHaveText(whole(SHOW_NAME));
        await expect(block.saveButton).toBeVisible();
        await expect(block.cancelLink).toBeVisible();
        const blockContent = block.content('en');
        await blockContent.openTagMenu();
        await expect(blockContent.menu()).toHaveText(whole(NO_TAGS));
        await blockContent.closeMenu();

        // No name: refused under the box, nothing sent (Rule 26).
        const sent = await block.saveRefused(block.nameInput('en'), REQUIRED);
        expect(sent).toBe(false);

        // Left with "Cancel": closed at once, no question, the list still
        // empty (Rule 30a).
        await block.typeName('en', 'Draft');
        const asked = [];
        const recordQuestion = (dialog) => {
            asked.push(dialog.message());
            dialog.accept().catch(() => {});
        };
        page.on('dialog', recordQuestion);
        await block.cancel();
        await expect(block.form).toBeHidden();
        page.off('dialog', recordQuestion);
        expect(asked).toEqual([]);
        await expect(blocks.emptyRow).toHaveText(whole(NO_BLOCKS));
        await expect(blocks.rows).toHaveCount(0);

        // Added: the window closes, no notice at the top right (the plugin's
        // notice, read the same way, was the control), one row; the visitor's
        // home page shows no block yet (Rules 18, 18a).
        block = await blocks.addBlock();
        await block.typeName('en', 'Our Partners');
        await block.content('en').type('Partner list. Write to {$contactName}.');
        expect(await block.save()).toBe(200);
        await expect(block.form).toBeHidden();
        await expect(blocks.rows).toHaveCount(1);
        await expect(blocks.row('our-partners')).toHaveCount(1);
        await expect(notices(page, {except: 'has been enabled'})).toHaveCount(0);
        await home.goto(homeUrl);
        await expect(home.customBlocks).toHaveCount(0);

        // Placed: "Sidebar" lists the block unticked; ticked and saved, the
        // visitor's home page shows the content with the tag's code as typed,
        // the name a heading for screen readers only; "About the Press"
        // shows it too (Rules 18, 19, 20, 28).
        await sidebar.goto();
        await expect(sidebar.box('our-partners')).toHaveCount(1);
        await expect(sidebar.box('our-partners')).not.toBeChecked();
        await sidebar.place('our-partners', true);
        await home.goto(homeUrl);
        await expect(home.block('our-partners')).toBeVisible();
        await expect(home.blockContent('our-partners')).toHaveText('Partner list. Write to {$contactName}.');
        await expect(home.blockHeading('our-partners')).toHaveText('Our Partners');
        expect(await home.screenReaderOnly(home.blockHeading('our-partners'))).toBe(true);
        await expect(home.block('our-partners').getByRole('heading', {name: 'Our Partners', level: 2})).toHaveCount(1);
        await home.goto(address(tag, '/about'));
        await expect(home.pageTitle).toHaveText(ABOUT_PRESS);
        await expect(home.blockContent('our-partners')).toHaveText('Partner list. Write to {$contactName}.');

        // Renamed, name shown: "Edit" opens a window headed "Edit"; the
        // visitor reads "Friends" above the content (Rules 20, 22).
        await plugins.goto();
        blocks = await plugins.openBlockManager();
        block = await blocks.editBlock('our-partners');
        await expect(block.heading).toHaveText('Edit');
        await block.nameInput('en').fill('Friends');
        await block.setShowName(true);
        expect(await block.save()).toBe(200);
        await expect(block.form).toBeHidden();
        await home.goto(homeUrl);
        await expect(home.blockHeading('our-partners')).toHaveText('Friends');
        await expect(home.blockHeading('our-partners')).toBeVisible();
        expect(await home.screenReaderOnly(home.blockHeading('our-partners'))).toBe(false);
        await expect(home.blockContent('our-partners')).toHaveText('Partner list. Write to {$contactName}.');

        // The same name twice: a second row, its name followed by a run of
        // letters and digits (Rule 23).
        block = await blocks.addBlock();
        await block.typeName('en', 'Our Partners');
        await block.content('en').type('Second list.');
        expect(await block.save()).toBe(200);
        await expect(block.form).toBeHidden();
        await expect(blocks.rows).toHaveCount(2);
        const names = await blocks.rowNames();
        expect(names).toContain('our-partners');
        expect(names.filter((n) => n !== 'our-partners')).toEqual([expect.stringMatching(/^our-partners[0-9a-z]+$/)]);

        // Control: unticked and saved, the visitor's home page shows no block
        // (Rule 19).
        await sidebar.goto();
        await sidebar.place('our-partners', false);
        await home.goto(homeUrl);
        await expect(home.customBlocks).toHaveCount(0);
        await expect(home.header).toBeVisible();
    });

    test('S5: pictures in a page, refused files and the allowance', async ({asUser, ompApi, visitor, baseURL}, testInfo) => {
        test.setTimeout(300_000);
        const tag = makeTag('s5', testInfo);
        const {manager} = await seedPress(ompApi, tag);
        const page = await actorPage(asUser, manager);
        const nav = new NavigationTab(page, tag);
        const reader = new PublicContent(visitor);

        const first = png(120, 80, {seed: 0});
        const second = png(90, 60, {seed: 90});
        const big = [png(1000, 650, {random: true}), png(1000, 650, {random: true}), png(1000, 650, {random: true})];
        const file = (name, buffer, mimeType = 'image/png') => ({name, mimeType, buffer});

        // The picture window: "Insert/Edit Image" with "General" and "Upload";
        // "Upload" offers "Browse for an image" and "Drop an image here"
        // (Rule 29).
        await nav.goto();
        await nav.addItem();
        const item = new CustomPageWindow(page);
        await item.titleInput('en').fill('Pictures');
        await item.chooseType('Custom Page');
        await item.pathInput.fill('pictures');
        const content = item.content('en');
        let win = await content.openImageWindow();
        await expect(win.title).toHaveText('Insert/Edit Image');
        expect(await win.tabNames()).toEqual(['General', 'Upload']);
        await win.openTab('Upload');
        await expect(win.browseButton).toBeVisible();
        await expect(win.root).toContainText('Drop an image here');

        // Uploaded: the first "Test Image_1.png" goes into "Content" (Rule 29).
        let answer = await win.upload(file('Test Image_1.png', first));
        expect(answer.status).toBe(200);
        await win.expectSourceFilled();
        await win.save();
        await expect.poll(() => content.pictures()).toHaveLength(1);
        expect((await content.pictures())[0]).toMatch(/\/public\/site\/images\/[^/]+\/test-image-1\.png$/);

        // Refused, each with its message in the small window; after "OK"
        // nothing is inserted (Rule 29).
        for (const [f, message] of [
            [file('photo.bmp', bmp(60, 40), 'image/bmp'), TYPES_REFUSED],
            [file('notes.png', Buffer.from('This is a text file, not a picture.\n')), NOT_AN_IMAGE],
            [file('photo.jpg', png(70, 50, {seed: 7}), 'image/jpeg'), EXTENSION_MISMATCH],
        ]) {
            await content.caretToEnd();
            win = await content.openImageWindow();
            answer = await win.upload(f);
            expect(answer.status).not.toBe(200);
            await expect(win.alert).toContainText(message);
            await win.dismissAlert();
            await win.cancel();
            expect(await content.pictures()).toHaveLength(1);
        }

        // The same name again, another picture: "Content" holds both
        // (Rules 29, 29b).
        await content.caretToEnd();
        win = await content.openImageWindow();
        answer = await win.upload(file('Test Image_1.png', second));
        expect(answer.status).toBe(200);
        await win.expectSourceFilled();
        await win.save();
        await expect.poll(() => content.pictures()).toHaveLength(2);

        // The allowance: "big-1.png" uploaded and left with "Cancel" is not
        // in the text; "big-2.png" goes in; "big-3.png" is refused for the
        // space left (Rule 29a; Side effects).
        await content.caretToEnd();
        win = await content.openImageWindow();
        answer = await win.upload(file('big-1.png', big[0]));
        expect(answer.status).toBe(200);
        await win.expectSourceFilled();
        await win.cancel();
        expect(await content.pictures()).toHaveLength(2);
        await content.caretToEnd();
        win = await content.openImageWindow();
        answer = await win.upload(file('big-2.png', big[1]));
        expect(answer.status).toBe(200);
        await win.expectSourceFilled();
        await win.save();
        await expect.poll(() => content.pictures()).toHaveLength(3);
        await content.caretToEnd();
        win = await content.openImageWindow();
        answer = await win.upload(file('big-3.png', big[2]));
        expect(answer.status).not.toBe(200);
        await expect(win.alert).toContainText('You do not have enough space in your user directory.');
        expect(flat(await win.alert.locator('.tox-dialog__body').innerText())).toMatch(ALLOWANCE);
        await win.dismissAlert();
        await win.cancel();
        const inText = await content.pictures();
        expect(inText).toHaveLength(3);
        expect(inText.some((src) => /big-1\.png$/.test(src))).toBe(false);

        // Saved and read: the page shows the two "Test Image_1.png" pictures
        // and "big-2.png" (Rule 29).
        const saved = await item.save();
        expect(saved.body && saved.body.status).toBe(true);
        await expect(item.form).toBeHidden();
        await reader.goto(address(tag, '/pictures'));
        await expect(reader.pictures).toHaveCount(3);
        await expect.poll(async () => (await reader.pictureStates()).every((p) => p.loaded)).toBe(true);
        const srcs = (await reader.pictureStates()).map((p) => p.src.replace(/^.*\//, ''));
        expect(srcs[0]).toBe('test-image-1.png');
        expect(srcs[1]).toMatch(/^test-image-1-[0-9a-f]{32}\.png$/);
        expect(srcs[2]).toBe('big-2.png');

        // The stored first picture, at the site's address, is the first file,
        // not the second (Rule 29b); "big-1.png", in no text, is stored too
        // (Side effects).
        const images = `${baseURL}/public/site/images/${manager}`;
        let response = await visitor.goto(`${images}/test-image-1.png`);
        expect(response && response.status()).toBe(200);
        expect(Buffer.compare(await response.body(), first)).toBe(0);
        response = await visitor.goto(`${images}/big-1.png`);
        expect(response && response.status()).toBe(200);
        expect(Buffer.compare(await response.body(), big[0])).toBe(0);

        // Control: "big-2.png", the size of the refused "big-3.png", was
        // accepted before it (Rule 29a).
        expect(big[1].length).toBe(big[2].length);
        response = await visitor.goto(`${images}/big-2.png`);
        expect(response && response.status()).toBe(200);
        expect(Buffer.compare(await response.body(), big[1])).toBe(0);
    });

    test('S6: a press in two languages', async ({asUser, ompApi, visitor}, testInfo) => {
        test.slow();
        const tag = makeTag('s6', testInfo);
        const {manager} = await seedPress(ompApi, tag, {
            context: {supportedLocales: ['en', 'fr_CA'], supportedFormLocales: ['en', 'fr_CA']},
            plugins: {customblockmanagerplugin: {enabled: true}},
        });
        const page = await actorPage(asUser, manager);
        const nav = new NavigationTab(page, tag, {locale: 'en'});
        const reader = new PublicContent(visitor);
        const french = address(tag, '/our-page', 'fr_CA');
        const english = address(tag, '/our-page', 'en');

        // The boxes: an English and a French "Title" and "Content" (Settings
        // bullet 4); the English texts alone saved.
        await nav.goto();
        await nav.addItem();
        let item = new CustomPageWindow(page);
        await item.chooseType('Custom Page');
        const langs = await item.languages();
        expect(langs.titles.sort()).toEqual(['title[en]', 'title[fr_CA]']);
        expect(langs.contents.sort()).toEqual(['content[en]', 'content[fr_CA]']);
        await item.titleInput('en').fill('Our page');
        await item.pathInput.fill('our-page');
        await item.content('en').type('Welcome.');
        await item.blur();
        let saved = await item.save();
        expect(saved.body && saved.body.status).toBe(true);
        await expect(item.form).toBeHidden();

        // French visitor, English texts (Rule 3).
        await reader.goto(french);
        await expect(reader.pageTitle).toHaveText('Our page');
        expect(await reader.bodyText()).toBe('Our page Welcome.');

        // French texts added: the French visitor reads them (Rule 3).
        await nav.editItem('Our page');
        item = new CustomPageWindow(page);
        await item.typeTitle('fr_CA', 'Notre page');
        await item.content('fr_CA').type('Bienvenue.');
        await item.blur();
        saved = await item.save();
        expect(saved.body && saved.body.status).toBe(true);
        await expect(item.form).toBeHidden();
        await reader.goto(french);
        await expect(reader.pageTitle).toHaveText('Notre page');
        expect(await reader.bodyText()).toBe('Notre page Bienvenue.');

        // The block's primary name: English and French boxes; the French
        // name alone is refused under the English box (Settings bullet 4;
        // Rule 26).
        const plugins = new PluginsTab(page, tag, {locale: 'en'});
        await plugins.goto();
        const blocks = await plugins.openBlockManager();
        const block = await blocks.addBlock();
        await expect(block.nameInput('en')).toHaveCount(1);
        await expect(block.nameInput('fr_CA')).toHaveCount(1);
        await expect(block.content('en').textarea).toHaveCount(1);
        await expect(block.content('fr_CA').textarea).toHaveCount(1);
        await block.typeName('fr_CA', 'Nos partenaires');
        expect(await block.saveRefused(block.nameInput('en'), REQUIRED)).toBe(false);

        // The block in two languages, named, placed: the French visitor reads
        // "Nos partenaires" above "Liste des partenaires" (Rules 20, 21).
        await block.nameInput('en').fill('Our Partners');
        await block.content('en').type('Partner list');
        await block.content('fr_CA').type('Liste des partenaires');
        await block.setShowName(true);
        expect(await block.save()).toBe(200);
        await expect(block.form).toBeHidden();
        const sidebar = new SidebarSetup(page, tag, {locale: 'en'});
        await sidebar.goto();
        await sidebar.place('our-partners', true);
        await reader.goto(french);
        await expect(reader.blockHeading('our-partners')).toHaveText('Nos partenaires');
        await expect(reader.blockHeading('our-partners')).toBeVisible();
        await expect(reader.blockContent('our-partners')).toHaveText('Liste des partenaires');

        // Control: the page in English, with the English block (Rules 3, 21).
        await reader.goto(english);
        await expect(reader.pageTitle).toHaveText('Our page');
        expect(await reader.bodyText()).toBe('Our page Welcome.');
        await expect(reader.blockHeading('our-partners')).toHaveText('Our Partners');
        await expect(reader.blockContent('our-partners')).toHaveText('Partner list');
    });

    test('S7: a static page, from the plugin to the visitor', async ({asUser, ompApi, visitor, baseURL}, testInfo) => {
        test.setTimeout(300_000);
        const tag = makeTag('s7', testInfo);
        const {manager, name} = await seedPress(ompApi, tag);
        const page = await actorPage(asUser, manager);
        const plugins = new PluginsTab(page, tag);
        const tab = new StaticPagesTab(page, tag);
        const reader = new PublicContent(visitor);
        const topTabs = tab.topTabs();
        const expectList = (titles) => expect.poll(() => tab.titles(), {timeout: T}).toEqual(titles);

        // Control, before the plugin: Settings › Website has no "Static Pages"
        // tab, while its "Plugins" tab is there (Settings bullet 1).
        await plugins.goto();
        await expect(topTabs.filter({hasText: 'Plugins'})).toHaveCount(1);
        await expect(topTabs.filter({hasText: 'Static Pages'})).toHaveCount(0);

        // The plugin: ticked, its arrow offers "Edit/Add Content", which opens
        // Settings › Website on "Static Pages", the last top tab (Rule 9).
        await expect(plugins.enabledBox('staticpagesplugin')).not.toBeChecked();
        await noticeDuring(page, 'The plugin "Static Pages Plugin" has been enabled.', () => plugins.enable('staticpagesplugin'));
        const controls = await plugins.openControls('staticpagesplugin');
        await plugins.controlLink(controls, 'Edit/Add Content').click();
        await tab.waitList();
        await expect(topTabs.last()).toHaveText(/^\s*Static Pages\s*$/);
        await expect(topTabs.last()).toHaveAttribute('aria-selected', 'true');

        // The empty list (Fields).
        await expect(tab.listHeading).toHaveText(/^\s*Static Pages\s*$/);
        expect((await tab.columnHeaders.allInnerTexts()).map(flat).filter(Boolean)).toEqual(['Title', 'Path']);
        await expect(tab.addLink).toBeVisible();
        await expect(tab.emptyRow).toHaveText(whole(NO_STATIC_PAGES));

        // The window: heading, "Preview" and "Save", no "Cancel", the line
        // under "Path" and "Title" (Fields), on this one-language press with
        // no language in the address (T-omp-1; the spec's line has "/en").
        let win = await tab.addPage();
        await expect(win.heading).toHaveText('Add Static Page');
        await expect(win.previewButton).toBeVisible();
        await expect(win.saveButton).toBeVisible();
        await expect(win.cancelButton).toHaveCount(0);
        const note =
            `This page will be accessible at: ${baseURL}/index.php/${tag}/%PATH% ...where %PATH% is the path entered above. ` +
            'Note: No two pages can have the same path. Using paths that are built into the system may cause you to lose access to important functions.';
        expect(await win.text()).toContain(note);

        // Preview: a new tab at "about:blank" with the typed texts inside the
        // press's header and footer; the window still open, the list still
        // empty (Rules 7, 13).
        await win.pathInput.fill('about-us');
        await win.titleInput('en').fill('About us');
        await win.content('en').type('Welcome to our journal.');
        const preview = await win.preview();
        expect(preview.url()).toBe('about:blank');
        const shown = new PublicContent(preview);
        await expect(preview.getByRole('heading', {name: 'About us'})).toBeVisible();
        await expect(shown.main).toContainText('Welcome to our journal.');
        await expect(shown.footer).toBeVisible();
        await preview.close();
        await expect(win.form).toBeVisible();
        await expect(win.pathInput).toHaveValue('about-us');
        await expect(win.titleInput('en')).toHaveValue('About us');
        expect(flat(await win.content('en').text())).toBe('Welcome to our journal.');
        await expect(tab.emptyRow).toHaveText(whole(NO_STATIC_PAGES));

        // Saved: the window closes, no notice at the top right (the plugin's
        // notice, read the same way, was the control), the row (Rule 10).
        let answer = await win.save();
        expect(answer.status).toBe(200);
        await expect(win.form).toBeHidden();
        await expect.poll(() => tab.rowCells()).toEqual([['About us', 'about-us']]);
        await expect(notices(page, {except: 'has been enabled'})).toHaveCount(0);

        // The visitor's page: header, heading, text, footer; the tab's title
        // (Rule 12).
        await reader.goto(address(tag, '/about-us'));
        await expect(visitor.getByRole('heading', {name: 'About us', exact: true})).toBeVisible();
        await expect(reader.main).toContainText('Welcome to our journal.');
        await expect(reader.footer).toBeVisible();
        await expect(visitor).toHaveTitle(`About us | ${name}`);

        // The "Path" link opens the page in a new browser tab (Rule 12).
        const [opened] = await Promise.all([page.context().waitForEvent('page', {timeout: T}), tab.pathLink('About us').click()]);
        await opened.waitForLoadState('load');
        await expect(opened.getByRole('heading', {name: 'About us', exact: true})).toBeVisible();
        expect(new URL(opened.url()).pathname).toMatch(new RegExp(`/index\\.php/${tag}(/en)?/about-us$`));
        await opened.close();

        // The order after an edit: added last; saved again through "Edit",
        // moved to the end, and so after a reload (Rule 10).
        win = await tab.addPage();
        await win.pathInput.fill('fees');
        await win.titleInput('en').fill('Fees');
        await win.content('en').type('Our fees.');
        answer = await win.save();
        expect(answer.status).toBe(200);
        await expect(win.form).toBeHidden();
        await expectList(['About us', 'Fees']);
        win = await tab.editPage('About us');
        await expect(win.heading).toHaveText('Edit');
        answer = await win.save();
        expect(answer.status).toBe(200);
        await expect(win.form).toBeHidden();
        await expectList(['Fees', 'About us']);
        await tab.goto();
        await expectList(['Fees', 'About us']);

        // Left unsaved: the back arrow asks; "Cancel" keeps the window with
        // "x"; "OK" closes it, nothing stored (Rule 30).
        win = await tab.addPage();
        await win.titleInput('en').fill('x');
        expect(await win.close({accept: false})).toBe(CHANGED_QUESTION);
        await expect(win.form).toBeVisible();
        await expect(win.titleInput('en')).toHaveValue('x');
        expect(await win.close({accept: true})).toBe(CHANGED_QUESTION);
        await expectList(['Fees', 'About us']);

        // Forty characters: the "Path" box stops at 40 (Fields).
        win = await tab.addPage();
        await win.titleInput('en').fill('Second');
        await win.pathInput.pressSequentially('abcdefghijabcdefghijabcdefghijabcdefghijk');
        await expect(win.pathInput).toHaveValue('abcdefghijabcdefghijabcdefghijabcdefghij');

        // Refusals: each message under its box, the window open, the list
        // unchanged (Fields).
        await win.pathInput.fill('');
        expect((await win.save({expectPost: false})).sent).toBe(false);
        await expect(await win.errorFor(win.pathInput)).toHaveText(REQUIRED);
        await expect(win.form).toBeVisible();
        await win.pathInput.fill('about us');
        answer = await win.save();
        expect(answer.status).toBe(200);
        await expect(await win.errorFor(win.pathInput)).toHaveText(PATH_CHARACTERS);
        await expect(win.form).toBeVisible();
        await win.pathInput.fill('about-us');
        answer = await win.save();
        expect(answer.status).toBe(200);
        await expect(await win.errorFor(win.pathInput)).toHaveText(PATH_TAKEN);
        await expect(win.form).toBeVisible();
        await win.pathInput.fill('second');
        await win.titleInput('en').fill('');
        expect((await win.save({expectPost: false})).sent).toBe(false);
        await expect(await win.errorFor(win.titleInput('en'))).toHaveText(REQUIRED);
        await expect(win.form).toBeVisible();
        await expectList(['Fees', 'About us']);
        await win.close({accept: true});
        await expect(win.form).toBeHidden();
        await expectList(['Fees', 'About us']);

        // Deleted: "Delete" asks; "OK" takes the row; the page's address
        // answers a bare "404 Not Found" (Rule 14).
        await (await tab.rowControl('Fees', 'Delete')).click();
        const dialog = tab.deleteDialog();
        await expect(dialog).toBeVisible();
        await expect(tab.deleteDialogHeading()).toHaveText(/^\s*Delete\s*$/);
        await expect(dialog).toContainText(DELETE_QUESTION);
        await expect(tab.deleteDialogButton('Cancel')).toBeVisible();
        await tab.deleteDialogButton('OK').click();
        await expectList(['About us']);
        await expectBare404(visitor, address(tag, '/fees'));
    });
});
