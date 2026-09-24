/**
 * @file shared/playwright/pages/NavigationChromePages.js
 *
 * Page objects for U08 "Navigation menus & site chrome"
 * (docs/specs/U08-navigation-menus-and-site-chrome.md), shared by the OJS,
 * OMP and OPS suites. App-neutral: every on-screen word that differs per
 * app ("Catalog" / "Archives", "About the Press", "Learning OMP") is passed
 * in by the suite; the locators here are the markup the three apps share
 * (lib/pkp templates, the default theme and the ui-library components,
 * byte-identical in the three checkouts per the spec's footnotes).
 *
 * Surfaces:
 * - NavigationTab — Settings › Website › "Setup" › "Navigation" (and the
 *   site's Administration › "Site Settings" › "Site Setup" › "Navigation"):
 *   the "Navigation" and "Navigation Menu Items" tables, a row's "Settings"
 *   arrow and its "Edit" / "Remove", the "Remove" confirmation, the notices
 *   at the top right.
 * - MenuWindow — the menu window (Vue side window): "Title", "Active Theme
 *   Navigation Areas", the two panels, the handles, the eye and warning
 *   icons with their "Notice", "Save" / "Cancel", the "Warning" question,
 *   the footer's error summary, the strip atop the window.
 * - ItemWindow — the item window (legacy AjaxModal form
 *   #navigationMenuItemsForm): "Title", "Navigation Menu Type", "URL",
 *   "Path", "Save" and its back arrow ("Close").
 * - PublicChrome — a public page's frame: the name or logo, the primary
 *   menu and its lists, "Search", the user menu, skip links, breadcrumbs,
 *   the footer's logo, page links, the sidebar's "Developed By" block.
 * - EditorialChrome — an editorial screen's frame: the dark bar (skip
 *   links, journals switcher, journal name, the "i" help link, Tasks, the
 *   initials and their menu) and the side menu.
 *
 * DOM shapes confirmed against the running apps by the U08 claim check
 * (.reports/U08/screen-notes.md, the kept scripts under
 * shared/playwright/checks/U08/) and while the OMP suite was built,
 * 2026-09-24; the OPS suite's own reads (menus, noticeDuring,
 * fieldErrorFor, focused, userMenuItems, waitSideMenu) were added when it
 * moved onto this file.
 */
const {expect} = require('@playwright/test');
const {BasePage} = require('./BasePage.js');
const {waitForJQueryIdle} = require('../support/legacy.js');

const T = 30_000;

/** Escape a string for a RegExp. */
function esc(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** A whole-text matcher that tolerates the templates' surrounding whitespace. */
function whole(text) {
    return new RegExp(`^\\s*${esc(text)}\\s*$`);
}

/** Text with runs of white space collapsed. */
function flat(text) {
    return (text || '').replace(/\s+/g, ' ').trim();
}

/** A context-relative address: '/index.php/<path>[/<locale>]<pathname>'. */
function contextAddress(contextPath, locale, pathname = '') {
    return `/index.php/${contextPath}${locale ? `/${locale}` : ''}${pathname}`;
}

// ---------------------------------------------------------------------------
// The Navigation tab
// ---------------------------------------------------------------------------

const MENUS_GRID = 'table[id^="component-grid-navigationmenus-navigationmenusgrid-"]';
const ITEMS_GRID = 'table[id^="component-grid-navigationmenus-navigationmenuitemsgrid-"]';

class NavigationTab extends BasePage {
    /**
     * @param {import('@playwright/test').Page} page
     * @param {string} contextPath the journal's path, or 'index' for the site's own tab
     * @param {{locale?: string}} [options] a locale segment for a multilingual context
     */
    constructor(page, contextPath, {locale = ''} = {}) {
        super(page);
        this.contextPath = contextPath;
        this.locale = locale;
        this.isSite = contextPath === 'index';
        this.menusTable = page.locator(`${MENUS_GRID}:visible`).first();
        this.itemsTable = page.locator(`${ITEMS_GRID}:visible`).first();
        this.addMenuLink = page.getByRole('link', {name: 'Add Menu', exact: true});
        this.addItemLink = page.getByRole('link', {name: 'Add item', exact: true});
    }

    /** The tab's address: the journal's Website settings, or the site's settings. */
    url() {
        return this.isSite
            ? contextAddress('index', this.locale, '/admin/settings')
            : contextAddress(this.contextPath, this.locale, '/management/settings/website#setup/navigationMenus');
    }

    /**
     * Open the tab and wait for both tables. The site's tab is reached
     * through "Site Setup" › "Navigation" (patterns.md, locator pitfall 2).
     */
    async goto() {
        await this.page.goto(this.url());
        if (this.isSite) {
            await this.page.locator('#setup-button').first().click();
            await this.page.locator('#nav-button').click();
        }
        await expect(this.menusTable).toBeVisible({timeout: T});
        await expect(this.itemsTable).toBeVisible({timeout: T});
        await waitForJQueryIdle(this.page);
    }

    /** The "Navigation" table's heading and the "Navigation Menu Items" one's, by their grid wrappers. */
    tableHeading(which) {
        const table = which === 'menus' ? this.menusTable : this.itemsTable;
        return table.locator('xpath=ancestor::div[contains(@class,"pkp_controllers_grid")][1]').locator('.header h4, h4').first();
    }

    /** A table's rows (menus or items). */
    rows(which) {
        return (which === 'menus' ? this.menusTable : this.itemsTable).locator('tr.gridRow');
    }

    /** A row by its title (the title cell, the arrow's hidden "Settings" word tolerated). */
    row(which, title) {
        const cell = this.page.locator('td').first().filter({hasText: new RegExp(`^\\s*(Settings\\s*)?${esc(title)}\\s*$`)});
        return this.rows(which).filter({has: cell});
    }

    /**
     * The rows' title cells as read, top to bottom (the arrow's word and any
     * inline script stripped). Read through `expect.poll`: the tables load
     * by XHR (patterns.md, parallel lesson 14).
     */
    async rowTitles(which) {
        return this.rows(which).evaluateAll((trs) =>
            trs.map((tr) => {
                const td = tr.querySelector('td');
                const clone = td.cloneNode(true);
                clone.querySelectorAll('a.show_extras, a.hide_extras, script, .pkp_screen_reader').forEach((n) => n.remove());
                return clone.textContent.replace(/\s+/g, ' ').trim();
            })
        );
    }

    /** The "Navigation Menu Items" cell of a menu's row, as read. */
    async menuItemsCell(title) {
        const row = this.row('menus', title);
        await expect(row).toHaveCount(1, {timeout: T});
        return row.locator('td').nth(1).evaluate((td) => {
            const clone = td.cloneNode(true);
            clone.querySelectorAll('script').forEach((n) => n.remove());
            return clone.textContent.replace(/\s+/g, ' ').trim();
        });
    }

    /**
     * The "Navigation" table as data, top to bottom: each row's title (read
     * as `rowTitles` reads it) and its "Navigation Menu Items" cell (read as
     * `menuItemsCell` reads it).
     */
    async menus() {
        return this.rows('menus').evaluateAll((trs) =>
            trs.map((tr) => {
                const read = (td, strip) => {
                    if (!td) return null;
                    const clone = td.cloneNode(true);
                    clone.querySelectorAll(strip).forEach((n) => n.remove());
                    return clone.textContent.replace(/\s+/g, ' ').trim();
                };
                const tds = tr.querySelectorAll('td');
                return {
                    title: read(tds[0], 'a.show_extras, a.hide_extras, script, .pkp_screen_reader'),
                    items: read(tds[1], 'script'),
                };
            })
        );
    }

    /**
     * Run `action` with a wait for the notice `text` (in the notification
     * area at the top right) already armed, so a notice raised during the
     * action is caught even when the action's own waits outlive it.
     */
    async noticeDuring(text, action, {timeout = T} = {}) {
        const toast = this.page.locator('[class*="otification"]:visible').filter({hasText: text}).first();
        const seen = expect(toast).toBeVisible({timeout});
        seen.catch(() => {});
        await action();
        await seen;
    }

    /** A menu row's title link (it opens the menu's "Edit" window). */
    menuTitleLink(title) {
        return this.row('menus', title).getByRole('link', {name: title, exact: true});
    }

    /** The "Settings" arrow at a row's left. */
    rowArrow(which, title) {
        return this.row(which, title).locator('a.show_extras');
    }

    /** The links revealed under a row by its arrow (the NEXT `tr`, patterns.md pitfall 10). */
    async rowControls(which, title) {
        const row = this.row(which, title);
        await expect(row).toHaveCount(1, {timeout: T});
        const id = await row.getAttribute('id');
        return this.page.locator(`[id="${id}-control-row"]`);
    }

    /** Press a row's arrow (once: a second press on an opened arrow hangs), then return its controls. */
    async openRowControls(which, title) {
        const controls = await this.rowControls(which, title);
        const arrow = this.rowArrow(which, title);
        if (await arrow.count()) {
            await arrow.first().click();
        }
        await expect(controls.getByRole('link', {name: 'Edit', exact: true})).toBeVisible({timeout: T});
        return controls;
    }

    /** A row's "Edit" or "Remove", arrow pressed first. */
    async rowAction(which, title, action) {
        const controls = await this.openRowControls(which, title);
        await controls.getByRole('link', {name: action, exact: true}).click();
    }

    /** The "Remove" confirmation window. */
    removeDialog() {
        return this.page
            .locator('[role="dialog"]:visible, [role="alertdialog"]:visible, [data-cy="dialog"]:visible')
            .filter({hasText: 'Are you sure you wish to delete this item?'})
            .last();
    }

    /**
     * A row's "Remove", pressed until the "Remove" window shows: right after
     * a dialog closed, the modal store still holds its slot and swallows a
     * press (patterns.md pitfall 4).
     */
    async openRemove(which, title) {
        const controls = await this.openRowControls(which, title);
        const dialog = this.removeDialog();
        await expect(async () => {
            if (!(await dialog.isVisible())) {
                await controls.getByRole('link', {name: 'Remove', exact: true}).click({timeout: 5_000});
            }
            await expect(dialog).toBeVisible({timeout: 3_000});
        }).toPass({timeout: T});
        return dialog;
    }

    /** A button ("OK", "Cancel") of the "Remove" window. */
    removeDialogButton(name) {
        const dialog = this.removeDialog();
        return dialog.getByRole('button', {name, exact: true}).or(dialog.getByRole('link', {name, exact: true})).first();
    }

    /** A notice at the top right, by its sentence. */
    notice(text) {
        return this.page.getByText(text, {exact: false}).first();
    }

    /**
     * Press a link that opens the menu window until the window shows: right
     * after a window closed, the modal store still holds its slot (patterns.md
     * pitfall 4) and swallows a press.
     */
    async openMenuWindowBy(link) {
        const win = new MenuWindow(this.page);
        await expect(async () => {
            if (!(await win.editor.isVisible())) {
                await link.click({timeout: 5_000});
            }
            await expect(win.editor).toBeVisible({timeout: 3_000});
        }).toPass({timeout: T});
        await win.waitOpen();
        return win;
    }

    /** Open a menu's "Edit" window by its title link. */
    async openMenu(title) {
        return this.openMenuWindowBy(this.menuTitleLink(title));
    }

    /** "Add Menu": the empty menu window. */
    async addMenu() {
        return this.openMenuWindowBy(this.addMenuLink);
    }

    /**
     * Press a link that opens the item window until the window shows: right
     * after a window closed, a legacy link action can still be `disabled`
     * or its table redrawing, and the press is lost.
     */
    async openItemWindowBy(link) {
        const win = new ItemWindow(this.page);
        await expect(async () => {
            if (!(await win.typeSelect.isVisible())) {
                await link.click({timeout: 5_000});
            }
            await expect(win.typeSelect).toBeVisible({timeout: 3_000});
        }).toPass({timeout: T});
        await win.waitOpen();
        return win;
    }

    /** "Add item": the item window. */
    async addItem() {
        return this.openItemWindowBy(this.addItemLink);
    }

    /** An item's "Edit": the item window. */
    async editItem(title) {
        const controls = await this.openRowControls('items', title);
        return this.openItemWindowBy(controls.getByRole('link', {name: 'Edit', exact: true}));
    }
}

// ---------------------------------------------------------------------------
// The menu window
// ---------------------------------------------------------------------------

class MenuWindow extends BasePage {
    constructor(page) {
        super(page);
        this.editor = page.locator('[data-cy="navigation-menu-editor"]:visible').first();
        this.root = page.locator('[role="dialog"]:visible').filter({has: page.locator('[data-cy="navigation-menu-editor"]')}).first();
        this.heading = this.root.locator('h1, h2').first();
        this.form = this.root.locator('form').first();
        this.titleInput = this.root.locator('input[name="title"]');
        this.areaSelect = this.root.locator('select[name="areaName"]');
        this.assignedPanel = this.editor.locator('[data-cy="panel-content-assigned"]');
        this.unassignedPanel = this.editor.locator('[data-cy="panel-content-unassigned"]');
        this.saveButton = this.root.getByRole('button', {name: 'Save', exact: true});
        this.cancelButton = this.root.getByRole('button', {name: 'Cancel', exact: true});
        this.closeButton = this.root.getByRole('button', {name: 'Close', exact: true});
        this.jumpToError = this.root.getByRole('button', {name: 'Jump to next error', exact: true});
        // The foot's summary: the sentence, a screen-reader list and "Jump to next error".
        this.errorSummary = this.root.locator('.pkpFormErrors');
        // The strip atop the window (Rule 27).
        this.stripHelpLink = this.root.locator('a[target="_blank"]').first();
        this.stripTasksButton = this.root.getByRole('button', {name: /^Tasks/});
        this.stripInitialsButton = this.root.locator('[data-cy="app-user-nav"] button').first();
        this.warningDialog = page
            .locator('[role="dialog"]:visible, [role="alertdialog"]:visible')
            .filter({hasText: 'The data on this form has changed. Do you wish to continue without saving?'})
            .last();
        this.noticeDialog = page
            .locator('[role="dialog"]:visible, [role="alertdialog"]:visible')
            .filter({has: page.getByRole('button', {name: 'OK', exact: true})})
            .filter({hasText: /^\s*Notice/})
            .last();
    }

    async waitOpen() {
        await expect(this.editor).toBeVisible({timeout: T});
        await expect(this.titleInput).toBeVisible({timeout: T});
    }

    /** A panel ('assigned' | 'unassigned'). */
    panel(which) {
        return which === 'assigned' ? this.assignedPanel : this.unassignedPanel;
    }

    /** An item of a panel by its title. */
    item(which, title) {
        return this.panel(which).locator(`[data-menu-item-title="${title}"]`).first();
    }

    /** An item's handle ("Drag to reorder"). */
    handle(which, title) {
        return this.item(which, title).locator('[title="Drag to reorder"]').first();
    }

    /** An item's crossed-out eye (a condition icon: an icon button that is not the red warning). */
    eyeIcon(which, title) {
        return this.item(which, title).locator('button[title]:not(.text-negative)').first();
    }

    /** An item's red warning icon. */
    warningIcon(which, title) {
        return this.item(which, title).locator('button.text-negative').first();
    }

    /**
     * A panel as data: each item's title, nesting level (24 px a level)
     * and icons ('eye' | 'warning'); `text` is the panel's words when it
     * holds no item. Read through `expect.poll`.
     */
    async read(which) {
        return this.panel(which).evaluate((p) => {
            const items = [...p.querySelectorAll('[data-menu-item-title]')].map((el) => ({
                title: el.getAttribute('data-menu-item-title'),
                level: Math.round(parseInt(el.style.marginInlineStart || '0', 10) / 24),
                icons: [...el.querySelectorAll('button[title]')].map((b) => (b.className.includes('text-negative') ? 'warning' : 'eye')),
            }));
            return {items, text: items.length ? null : p.innerText.replace(/\s+/g, ' ').trim()};
        });
    }

    /** A panel's items as "title" (level 0) or "  title" (level 1), top to bottom. */
    async outline(which) {
        const {items} = await this.read(which);
        return items.map((i) => `${'  '.repeat(i.level)}${i.title}`);
    }

    /** A panel's item titles, in order. */
    async titles(which) {
        return (await this.read(which)).items.map((i) => i.title);
    }

    /** The titles of the items carrying an icon of a kind ('eye' | 'warning') in a panel. */
    async titlesWithIcon(which, kind) {
        return (await this.read(which)).items.filter((i) => i.icons.includes(kind)).map((i) => i.title);
    }

    /**
     * Drag an item by its handle onto a target: an item of a panel (where
     * 'center' nests it, 'top' puts it before) or a panel ('panel' drops
     * on its body). The editor uses native drag events; the mouse moves in
     * steps so the drop target sees the pointer arrive.
     */
    async drag(fromPanel, title, {panel, item = null, where = 'center'}) {
        const handle = this.handle(fromPanel, title);
        await handle.scrollIntoViewIfNeeded();
        const target = item ? this.item(panel, item) : this.panel(panel);
        await target.scrollIntoViewIfNeeded();
        const sb = await handle.boundingBox();
        const tb = await target.boundingBox();
        if (!sb || !tb) {
            throw new Error(`drag: no box for "${title}" or its target`);
        }
        const y = where === 'top' ? tb.y + 3 : where === 'bottom' ? tb.y + tb.height - 3 : tb.y + tb.height / 2;
        await this.page.mouse.move(sb.x + sb.width / 2, sb.y + sb.height / 2);
        await this.page.mouse.down();
        await this.page.mouse.move(sb.x + sb.width / 2 + 10, sb.y + sb.height / 2 + 6, {steps: 5});
        await this.page.mouse.move(tb.x + tb.width / 2, y, {steps: 20});
        await this.page.mouse.move(tb.x + tb.width / 2 + 1, y, {steps: 5});
        await this.page.mouse.up();
    }

    /** Press "Save" and wait for the window to close. */
    async save() {
        await this.saveButton.click();
        await expect(this.editor).toBeHidden({timeout: T});
    }

    /** A message under a field of the window ("This field is required."). */
    fieldError(text) {
        return this.root.getByText(text, {exact: true});
    }

    /** The red message under a field, by the field's label ("Title", "Active Theme Navigation Areas"). */
    fieldErrorFor(label) {
        return this.form
            .locator('.pkpFormField')
            .filter({has: this.page.locator('label, legend').filter({hasText: new RegExp(`^\\s*${esc(label)}`)})})
            .first()
            .locator('.pkpFieldError');
    }
}

// ---------------------------------------------------------------------------
// The item window
// ---------------------------------------------------------------------------

class ItemWindow extends BasePage {
    constructor(page) {
        super(page);
        this.root = page.locator('[role="dialog"]:visible').filter({has: page.locator('form#navigationMenuItemsForm')}).first();
        this.form = this.root.locator('form#navigationMenuItemsForm');
        this.heading = this.root.locator('h1, h2').first();
        this.typeSelect = this.form.locator('select[name="menuItemType"]');
        this.pathInput = this.form.locator('input[name="path"]');
        this.saveButton = this.root.getByRole('button', {name: 'Save', exact: true});
        this.cancelButton = this.root.getByRole('button', {name: 'Cancel', exact: true}).or(this.root.getByRole('link', {name: 'Cancel', exact: true}));
        this.closeButton = this.root.getByRole('button', {name: 'Close', exact: true});
    }

    /** The window's form content loads by AJAX after it opens (patterns.md pitfall 4). */
    async waitOpen() {
        await expect(this.typeSelect).toBeVisible({timeout: T});
        await waitForJQueryIdle(this.page);
    }

    /** The "Title" box of a form language. */
    titleInput(locale = 'en') {
        return this.form.locator(`input[name="title[${locale}]"]`);
    }

    /** The "URL" box of a form language. */
    urlInput(locale = 'en') {
        return this.form.locator(`input[name="remoteUrl[${locale}]"]`);
    }

    /** Choose a "Navigation Menu Type" by its label. */
    async chooseType(label) {
        await this.typeSelect.selectOption({label});
    }

    /** A message in the window ("This field is required."). */
    fieldError(text) {
        return this.form.getByText(text, {exact: true});
    }

    /**
     * Press "Save" and return the save's JSON answer: `status: false` is a
     * refusal (the window stays), otherwise the window closes.
     */
    async save() {
        const response = this.page.waitForResponse((r) => /update-navigation-menu-item/.test(r.url()) && r.request().method() === 'POST', {timeout: T});
        await this.saveButton.click();
        const r = await response;
        const body = await r.json().catch(() => null);
        await waitForJQueryIdle(this.page);
        return {status: r.status(), body};
    }

    /**
     * The back arrow ("Close"). The window may ask through the browser's
     * own confirm(); the answer given is `accept` (spec A18, which the
     * suites do not assert).
     */
    async close({accept = true} = {}) {
        const handler = async (dialog) => {
            if (accept) await dialog.accept();
            else await dialog.dismiss();
        };
        this.page.once('dialog', handler);
        await this.closeButton.click();
        if (accept) {
            await expect(this.form).toBeHidden({timeout: T});
        }
        this.page.off('dialog', handler);
    }
}

// ---------------------------------------------------------------------------
// The public frame
// ---------------------------------------------------------------------------

class PublicChrome extends BasePage {
    /**
     * @param {import('@playwright/test').Page} page
     * @param {string} contextPath the journal's path, or 'index' for the site
     * @param {{locale?: string}} [options] a locale segment ('en') for a
     *   multilingual context's prefixed addresses; none on a one-language
     *   scratch context (patterns.md, parallel lesson 9)
     */
    constructor(page, contextPath, {locale = ''} = {}) {
        super(page);
        this.contextPath = contextPath;
        this.locale = locale;
        this.header = page.locator('header.pkp_structure_head');
        this.siteNameLink = page.locator('.pkp_site_name a');
        this.primaryMenu = page.locator('#navigationPrimary');
        this.primaryTopLinks = page.locator('#navigationPrimary > li > a');
        this.userMenu = page.locator('#navigationUser');
        this.userMenuWrapper = page.locator('#navigationUserWrapper');
        this.userTopLinks = page.locator('#navigationUser > li > a');
        this.searchLink = page.locator('.pkp_navigation_search_wrapper a');
        this.skipLinks = page.locator('.cmp_skip_to_content a');
        this.main = page.locator('.pkp_structure_main');
        this.heading = this.main.locator('h1').first();
        this.breadcrumbs = this.main.locator('nav.cmp_breadcrumbs');
        this.currentCrumb = this.breadcrumbs.locator('[aria-current]');
        this.footer = page.locator('.pkp_structure_footer_wrapper');
        this.footerBrandLink = page.locator('.pkp_brand_footer a');
        this.footerBrandImage = this.footerBrandLink.locator('img');
        this.pagination = page.locator('.cmp_pagination');
        this.previousLink = this.pagination.locator('a.prev');
        this.nextLink = this.pagination.locator('a.next');
        this.sidebar = page.locator('.pkp_structure_sidebar');
    }

    /** An address in this context ('' is the home page). */
    url(pathname = '') {
        return contextAddress(this.contextPath, this.locale, pathname);
    }

    /** Open a page of the context and wait for the header. */
    async goto(pathname = '') {
        const response = await this.page.goto(this.url(pathname));
        await expect(this.header).toBeVisible({timeout: T});
        return response;
    }

    /** Reload the page and wait for the header. */
    async reload() {
        await this.page.reload();
        await expect(this.header).toBeVisible({timeout: T});
    }

    /** A top-level link of the primary ('primary') or user ('user') menu by its title. */
    topLink(menu, title) {
        const top = menu === 'user' ? this.userTopLinks : this.primaryTopLinks;
        return top.filter({hasText: title instanceof RegExp ? title : whole(title)});
    }

    /** The list under a top-level item. */
    submenu(menu, title) {
        return this.topLink(menu, title).locator('xpath=following-sibling::ul[1]');
    }

    /**
     * A top-level item with a list, once the theme's script has made it a
     * toggle (it turns the served address into "#"; a press before that
     * follows the served address, screen-notes ccK3).
     */
    async toggleReady(menu, title) {
        const link = this.topLink(menu, title);
        await expect(link).toHaveAttribute('href', '#', {timeout: T});
        return link;
    }

    /** Press a top-level item that has a list (it opens or closes the list, never a page). */
    async pressTop(menu, title) {
        await (await this.toggleReady(menu, title)).click();
    }

    /** Point at a top-level item that has a list. */
    async pointAt(menu, title) {
        await (await this.toggleReady(menu, title)).hover();
    }

    /** Move the pointer off the header, to the window's bottom-left corner. */
    async pointAway() {
        const size = this.page.viewportSize() || {width: 1280, height: 720};
        await this.page.mouse.move(5, size.height - 5);
    }

    /** The links of the list under a top-level item. */
    submenuLinks(menu, title) {
        return this.submenu(menu, title).locator('> li > a');
    }

    /** A link of the list under a top-level item. */
    submenuLink(menu, title, label) {
        return this.submenuLinks(menu, title).filter({hasText: label instanceof RegExp ? label : whole(label)});
    }

    /** The top-level titles of a menu as read (a count after the username stripped off). */
    async topTitles(menu) {
        const top = menu === 'user' ? this.userTopLinks : this.primaryTopLinks;
        return top.evaluateAll((as) =>
            as.map((a) => {
                const clone = a.cloneNode(true);
                clone.querySelectorAll('.task_count').forEach((n) => n.remove());
                return clone.textContent.replace(/\s+/g, ' ').trim();
            })
        );
    }

    /** The unread count beside a user-menu link (the username, "Dashboard"). */
    taskCount(link) {
        return link.locator('.task_count');
    }

    /** The breadcrumb's steps as read, separators left out. */
    async trail() {
        await expect(this.breadcrumbs).toBeVisible({timeout: T});
        return this.breadcrumbs.locator('li').evaluateAll((lis) =>
            lis.map((li) => {
                const clone = li.cloneNode(true);
                clone.querySelectorAll('.separator').forEach((s) => s.remove());
                return clone.textContent.replace(/\s+/g, ' ').trim();
            })
        );
    }

    /** A breadcrumb step's link by its words. */
    crumbLink(label) {
        return this.breadcrumbs.getByRole('link', {name: label, exact: true});
    }

    /** The words and address of the element holding the keyboard focus, and whether it is in the footer. */
    async focused() {
        return this.page.evaluate(() => {
            const el = document.activeElement;
            return {
                text: (el?.textContent || '').replace(/\s+/g, ' ').trim(),
                href: el?.getAttribute('href') || null,
                inFooter: !!el?.closest('.pkp_structure_footer_wrapper'),
            };
        });
    }

    /** The count between the page links ("1-1 of 3"). */
    pageCount() {
        return this.pagination.locator('.current');
    }

    /** The whole page-links row, whitespace-collapsed. */
    async paginationText() {
        return flat(await this.pagination.innerText());
    }

    /** The sidebar's "Developed By" block (the plugin's block, a hidden heading and one link). */
    developedByBlock() {
        return this.sidebar.locator('.pkp_block').filter({has: this.page.locator('h2')}).filter({hasText: /Developed By/});
    }

    /** The "Developed By" block's link by the application's name. */
    developedByLink(appName) {
        return this.sidebar.getByRole('link', {name: appName, exact: true});
    }
}

// ---------------------------------------------------------------------------
// The editorial frame
// ---------------------------------------------------------------------------

class EditorialChrome extends BasePage {
    constructor(page) {
        super(page);
        this.bar = page.locator('header.app__header');
        this.skipButtons = this.bar.getByRole('button', {name: /^Skip to/});
        this.switcher = this.bar.locator('.app__contexts');
        this.switcherButton = this.switcher.locator('button').first();
        this.switcherLinks = this.switcher.locator('a');
        this.contextTitle = this.bar.locator('a.app__contextTitle');
        // The "i" icon: the one link opening a new tab (its name is spec A1's).
        this.helpLink = this.bar.locator('a[target="_blank"]').first();
        this.tasksButton = this.bar.getByRole('button', {name: /^Tasks/});
        this.initialsButton = page.locator('header.app__header [data-cy="app-user-nav"] button').first();
        this.userMenu = page.locator('nav[aria-label="User Navigation"]').first();
        this.userMenuLinks = this.userMenu.locator('a');
        this.sideNav = page.locator('nav#app-nav');
    }

    async waitReady() {
        await expect(this.bar).toBeVisible({timeout: T});
        await expect(this.initialsButton).toBeVisible({timeout: T});
    }

    /** Open the initials menu. */
    async openUserMenu() {
        await this.initialsButton.click();
        await expect(this.userMenu).toBeVisible({timeout: T});
    }

    /** The initials menu's lines, top to bottom (headings and links), whitespace-collapsed. */
    async userMenuLines() {
        const text = await this.userMenu.innerText();
        return text.split('\n').map((s) => s.trim()).filter(Boolean);
    }

    /**
     * The open initials menu's lines as data, top to bottom: each line's
     * words, whether it is a heading ("Change Language"), and for a link
     * whether it carries the tick.
     */
    async userMenuItems() {
        await expect(this.userMenu).toBeVisible({timeout: T});
        return this.userMenu.evaluate((nav) =>
            [...nav.querySelectorAll('div.text-base-bold, a')].map((e) => ({
                text: e.textContent.replace(/\s+/g, ' ').trim(),
                ticked: e.tagName === 'A' ? !!e.querySelector('svg') : null,
                heading: e.tagName !== 'A',
            }))
        );
    }

    /** An initials-menu link by its words. */
    userMenuLink(label) {
        return this.userMenu.getByRole('link', {name: label, exact: true});
    }

    /** Open the journals switcher. */
    async openSwitcher() {
        await this.switcherButton.click();
        await expect(this.switcherLinks.first()).toBeVisible({timeout: T});
    }

    /** A switcher entry by the journal's name. */
    switcherLink(name) {
        return this.switcherLinks.filter({hasText: whole(name)});
    }

    /** The switcher's entries as read. */
    async switcherNames() {
        return this.switcherLinks.evaluateAll((as) => as.map((a) => a.textContent.replace(/\s+/g, ' ').trim()));
    }

    /** Wait for the side menu and its first group to render (a read right after a page opens). */
    async waitSideMenu() {
        await expect(this.sideNav).toBeVisible({timeout: T});
        await expect(this.sideNav.locator('[data-pc-section="panel"]').first()).toBeVisible({timeout: T});
    }

    /** The side menu's group headers (entries), top to bottom, by accessible name. */
    sideEntries() {
        return this.sideNav.locator('[data-pc-section="header"]');
    }

    /** A side-menu entry's header by its label. */
    sideEntry(label) {
        return this.sideNav.locator(`[data-pc-section="header"][aria-label="${label}"]`);
    }

    /**
     * The side menu as data, top to bottom: each entry's label, whether it
     * is open, whether it is highlighted, and its lines (label, highlighted,
     * the search box's placeholder). Every group's lines are in the DOM
     * whether open or closed (patterns.md, locator pitfall 2).
     */
    async sideMenu() {
        await expect(this.sideNav).toBeVisible({timeout: T});
        return this.sideNav.evaluate((nav) => {
            const selRe = /bg-selection-dark/;
            return [...nav.querySelectorAll('[data-pc-section="panel"]')].map((p) => {
                const h = p.querySelector('[data-pc-section="header"]');
                const a = h && h.querySelector('a');
                const region = p.querySelector(':scope > [data-pc-section="contentcontainer"]');
                return {
                    label: h ? h.getAttribute('aria-label') : null,
                    open: region ? getComputedStyle(region).display !== 'none' : false,
                    selected: a ? selRe.test(a.className) : false,
                    items: [...p.querySelectorAll('[role="treeitem"]')].map((li) => {
                        const la = li.querySelector('a');
                        const input = li.querySelector('input');
                        return {
                            label: li.getAttribute('aria-label'),
                            selected: la ? selRe.test(la.className) : false,
                            input: input ? input.getAttribute('placeholder') : null,
                        };
                    }),
                };
            });
        });
    }

    /** The side menu's entry labels, top to bottom. */
    async sideLabels() {
        return (await this.sideMenu()).map((e) => e.label);
    }

    /** The lines of one side-menu group, by label. */
    async sideGroupItems(label) {
        const entry = (await this.sideMenu()).find((e) => e.label === label);
        return entry ? entry.items.map((i) => i.label) : null;
    }

    /** Press a side-menu group's header, then one of its entries. */
    async chooseSideEntry(group, label) {
        const header = this.sideEntry(group);
        if ((await header.getAttribute('aria-expanded')) !== 'true') {
            await header.click();
            await expect(header).toHaveAttribute('aria-expanded', 'true');
        }
        const region = this.page.locator(`[id="${await header.getAttribute('aria-controls')}"]`);
        await region.getByRole('treeitem', {name: label, exact: true}).getByRole('link').click();
    }
}

module.exports = {
    NavigationTab,
    MenuWindow,
    ItemWindow,
    PublicChrome,
    EditorialChrome,
    whole,
    flat,
};
