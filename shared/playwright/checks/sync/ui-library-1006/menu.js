// PR review check — pkp/pkp-lib#12647, ui-library#1006 (+ ojs#5900, omp#2498, ops#1438; `main` only):
// "the 'three dots' menu is too small and falls off-screen". DropdownActions moved from headlessui to
// reka-ui. Drives a dataset fleet (PKP's default dataset, `publicknowledge`) as `admin`:
//
//   PROBE_FEATURE=i12647 PROBE_AGENT=<side> node bin/probe.js ojs \
//     shared/playwright/checks/sync/ui-library-1006/menu.js
//
// Legs (facts to result-<app>.json, a shot each; no assertions):
//   bottom    Users & Roles, 1280×600: the last row's "…" scrolled to 30 px above the viewport's bottom
//             edge, opened with the mouse; the menu's box against the viewport, its items' size and font
//   target    the same button's box, and what the pointer hits 4, 8 and 12 px outside its icon
//   keyboard  the button focused, Enter: the menu open and where the focus is; ArrowDown; Escape: the
//             menu gone and the focus back on the button
//   select    an item chosen with the mouse ("Email", a button action): the window it opens, the menu gone
//   workflow  submission 1's workflow, Submission stage, a Participants row's "…", then a page-level Escape at once:
//             whether the menu closed and the workflow window stayed
const {forEachApp, launch, signIn, record, shot, idle} = require('../../../probe');

const MENU = '[role="menu"]';
const fold = (s) => (s || '').replace(/\s+/g, ' ').trim();

const menuFacts = (page) =>
    page.evaluate((sel) => {
        const m = [...document.querySelectorAll(sel)].find((e) => e.getClientRects().length);
        if (!m) return {open: false};
        const r = m.getBoundingClientRect();
        const items = [...m.querySelectorAll('[role="menuitem"]')].map((i) => {
            const b = i.getBoundingClientRect();
            return {label: i.innerText.replace(/\s+/g, ' ').trim(), h: Math.round(b.height), font: getComputedStyle(i).fontSize};
        });
        return {
            open: true,
            box: {top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right)},
            viewport: {w: innerWidth, h: innerHeight},
            insideViewport: r.top >= 0 && r.left >= 0 && r.bottom <= innerHeight && r.right <= innerWidth,
            items,
            focusInMenu: m.contains(document.activeElement),
            attrs: Object.fromEntries([...m.attributes].filter((a) => /^(id|data-|role)/.test(a.name)).map((a) => [a.name, a.value])),
        };
    }, MENU);

const triggerName = /management\.options|More Actions/i;

forEachApp(async (app) => {
    const {browser, page} = await launch(app);
    await page.setViewportSize({width: 1280, height: 600});
    await signIn(page, 'admin', {contextPath: 'publicknowledge'});
    const out = {};

    // bottom + target
    await page.goto('/index.php/publicknowledge/en/management/settings/access');
    await idle(page);
    const buttons = page.locator('main').getByRole('button', {name: triggerName});
    await buttons.first().waitFor({timeout: 30_000});
    const btn = buttons.last();
    out.rowButtons = await buttons.count();
    await btn.evaluate((b) => {
        const r = b.getBoundingClientRect();
        window.scrollBy(0, r.bottom - (innerHeight - 30));
    });
    await page.waitForTimeout(300);
    out.triggerBefore = await btn.evaluate((b) => {
        const r = b.getBoundingClientRect();
        const icon = b.querySelector('svg') || b;
        const ir = icon.getBoundingClientRect();
        const cx = ir.x + ir.width / 2, cy = ir.y + ir.height / 2;
        const hits = {};
        for (const d of [4, 8, 12]) {
            const off = ir.width / 2 + d;
            hits[d] = ['left', 'right', 'up', 'down'].map((dir) => {
                const [x, y] = dir === 'left' ? [cx - off, cy] : dir === 'right' ? [cx + off, cy] : dir === 'up' ? [cx, cy - off] : [cx, cy + off];
                const at = document.elementFromPoint(x, y);
                return `${dir}:${at && (at === b || b.contains(at)) ? 'button' : at ? at.tagName.toLowerCase() : 'none'}`;
            });
        }
        return {
            button: {w: Math.round(r.width), h: Math.round(r.height), bottomGap: Math.round(innerHeight - r.bottom)},
            icon: {w: Math.round(ir.width), h: Math.round(ir.height)},
            before: getComputedStyle(b, '::before').content !== 'none' ? {inset: getComputedStyle(b, '::before').top} : null,
            hits,
        };
    });
    await btn.click();
    await page.waitForTimeout(500);
    out.bottom = await menuFacts(page);
    await shot(page, 'bottom');
    await page.locator(MENU).first().press('Escape').catch(() => {});
    await page.waitForTimeout(300);
    out.bottomClosed = !(await menuFacts(page)).open;

    // keyboard
    await btn.focus();
    await page.keyboard.press('Enter');
    await page.waitForTimeout(400);
    out.keyboardOpen = await menuFacts(page);
    await page.keyboard.press('ArrowDown');
    out.afterArrow = await page.evaluate(() => ({focused: document.activeElement?.innerText?.trim().slice(0, 40), highlighted: document.querySelector('[role="menuitem"][data-highlighted]')?.innerText?.trim() || null}));
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    out.keyboardClosed = {
        menuOpen: (await menuFacts(page)).open,
        focusOnButton: await btn.evaluate((b) => document.activeElement === b),
    };

    // select
    await btn.click();
    await page.waitForTimeout(400);
    const items = page.locator(MENU).getByRole('menuitem');
    out.selectItems = (await items.allInnerTexts()).map(fold);
    const edit = page.locator(MENU).getByRole('menuitem', {name: 'Email', exact: true});
    if (await edit.count()) {
        await edit.first().click();
        await page.waitForTimeout(1500);
        out.select = {
            menuOpen: (await menuFacts(page)).open,
            dialogs: await page.evaluate(() => [...document.querySelectorAll('[role="dialog"]')].filter((d) => d.getClientRects().length).map((d) => d.innerText.replace(/\s+/g, ' ').trim().slice(0, 60))),
        };
        await shot(page, 'select');
    }

    // workflow
    await page.setViewportSize({width: 1280, height: 900});
    await page.goto('/index.php/publicknowledge/en/dashboard/editorial?workflowSubmissionId=1');
    await idle(page);
    // submission 1 is published, so the window opens on its publication; its Submission stage has the panel
    await page.getByRole('dialog').getByText('Submission', {exact: true}).first().click();
    await idle(page);
    const pbtn = page.locator('[data-cy="participant-manager"]').getByRole('button', {name: triggerName}).first();
    if (await pbtn.waitFor({timeout: 30_000}).then(() => true, () => false)) {
        await pbtn.click();
        await page.keyboard.press('Escape');
        await page.waitForTimeout(800);
        out.workflow = {
            menuOpen: (await menuFacts(page)).open,
            workflowOpen: await page.getByRole('dialog').count(),
        };
        await shot(page, 'workflow');
    } else {
        out.workflow = 'no participant menu';
        await shot(page, 'workflow-none');
    }

    record('result', out);
    console.log(JSON.stringify(out, null, 1));
    await browser.close();
});
