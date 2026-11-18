// PR review check — pkp/pkp-lib#12720, ui-library#1057 (main) / ui-library#1058 (stable-3_5_0), with the
// pointer bumps ojs#6068, ojs#6069, omp#2574, ops#1505: "the settings tabs are difficult to use and lack
// screenreader usability". Tabs.vue gains ↑/↓ on side tabs, aria-orientation on the tablist, tabindex 0
// on the selected tab and no empty aria-label. Drives a dataset fleet (`publicknowledge`) as `admin`:
//
//   PROBE_FEATURE=sync-12720 PROBE_AGENT=<before|after> node bin/probe.js ojs \
//     shared/playwright/checks/sync/ui-library-1057/tabs.js
//   (3.5: PKP_E2E_LINE=stable-3_5_0 PROBE_FEATURE=sync-12720-35 …)
//
// Legs (facts to result-<app>.json; no assertions), Settings › Workflow › Submission, 1280×500 so the page scrolls:
//   markup    every tablist's role, aria-orientation, aria-label, and its tabs' tabindex attribute
//   ax        what Chromium's accessibility tree says of the side tablist and its selected tab (orientation, focusable)
//   side      the selected side tab focused: ↓, ↓, ↑, ↑ (wraps to the last), Home, End, → — after each the
//             selected side tab, the focused element, the top tab, the URL hash and the page's scroll
//   top       the selected top tab focused: ↓ and ↑ (selection and scroll), then → (the next top tab)
//   field     an input inside the side panel focused: ↓ — the selected side tab unchanged
//   tabkey    Tab from the element before the top tablist: where the focus lands, then the next Tab
const {forEachApp, launch, signIn, record, shot, idle} = require('../../../probe');

const state = (page) =>
    page.evaluate(() => {
        const lists = [...document.querySelectorAll('[role="tablist"]')].filter((l) => l.getClientRects().length);
        const sel = (l) => l && l.querySelector('[role="tab"][aria-selected="true"]')?.innerText.replace(/\s+/g, ' ').trim();
        const a = document.activeElement;
        return {
            top: sel(lists.find((l) => !l.closest('.pkpTabs--side'))),
            side: sel(lists.find((l) => l.closest('.pkpTabs--side'))),
            focus: a ? `${a.getAttribute('role') || a.tagName.toLowerCase()} ${(a.innerText || a.name || '').replace(/\s+/g, ' ').trim().slice(0, 40)}` : null,
            hash: location.hash,
            scrollY: Math.round(window.scrollY),
        };
    });

const axOf = async (page, selector) => {
    const cdp = await page.context().newCDPSession(page);
    try {
        const {root} = await cdp.send('DOM.getDocument', {depth: 0});
        const {nodeId} = await cdp.send('DOM.querySelector', {nodeId: root.nodeId, selector});
        if (!nodeId) return null;
        const {nodes} = await cdp.send('Accessibility.getPartialAXTree', {nodeId, fetchRelatives: false});
        const n = nodes[0];
        return {
            role: n.role?.value,
            name: n.name?.value,
            props: Object.fromEntries((n.properties || []).map((p) => [p.name, p.value?.value])),
        };
    } finally {
        await cdp.detach().catch(() => {});
    }
};

forEachApp(async (app) => {
    const {page, close} = await launch(app);
    try {
        await page.setViewportSize({width: 1280, height: 500});
        await signIn(page, 'admin', {contextPath: 'publicknowledge'});
        const out = {};
        const go = async () => {
            await page.goto('/index.php/publicknowledge/en/management/settings/workflow#submission');
            await idle(page);
            await page.waitForTimeout(800);
        };
        await go();

        out.markup = await page.evaluate(() =>
            [...document.querySelectorAll('[role="tablist"]')].filter((l) => l.getClientRects().length).map((l) => ({
                side: !!l.closest('.pkpTabs--side'),
                orientation: l.getAttribute('aria-orientation'),
                ariaLabel: l.hasAttribute('aria-label') ? l.getAttribute('aria-label') : '(none)',
                tabs: [...l.querySelectorAll('[role="tab"]')].map((t) => `${t.innerText.replace(/\s+/g, ' ').trim()}|sel=${t.getAttribute('aria-selected')}|tabindex=${JSON.stringify(t.getAttribute('tabindex'))}`),
            })));

        const sideSel = '.pkpTabs--side [role="tab"][aria-selected="true"]';
        out.ax = {
            sideList: await axOf(page, '.pkpTabs--side [role="tablist"]'),
            topList: await axOf(page, '.pkpTabs:not(.pkpTabs--side) > [role="tablist"]'),
            sideSelected: await axOf(page, sideSel),
        };

        // side
        await page.evaluate(() => window.scrollTo(0, 120));
        await page.locator(sideSel).first().focus();
        out.side = [{key: '(focus)', ...(await state(page))}];
        for (const key of ['ArrowDown', 'ArrowDown', 'ArrowUp', 'ArrowUp', 'ArrowUp', 'Home', 'End', 'ArrowRight']) {
            await page.keyboard.press(key);
            await page.waitForTimeout(350);
            out.side.push({key, ...(await state(page))});
        }
        await shot(page, 'side');

        // top
        await go();
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.locator('.pkpTabs:not(.pkpTabs--side) > [role="tablist"] [role="tab"][aria-selected="true"]').first().focus();
        out.top = [{key: '(focus)', ...(await state(page))}];
        for (const key of ['ArrowDown', 'ArrowUp', 'ArrowRight']) {
            await page.keyboard.press(key);
            await page.waitForTimeout(350);
            out.top.push({key, ...(await state(page))});
        }

        // field
        await go();
        const field = page.locator('.pkpTabs--side [role="tabpanel"]:visible input:visible, .pkpTabs--side [role="tabpanel"]:visible textarea:visible').first();
        if (await field.count()) {
            await field.focus();
            out.field = [{key: '(focus)', ...(await state(page))}];
            await page.keyboard.press('ArrowDown');
            await page.waitForTimeout(350);
            out.field.push({key: 'ArrowDown', ...(await state(page))});
        } else {
            out.field = 'no visible input in the first side panel';
        }

        // tabkey
        await go();
        await page.locator('.pkpTabs:not(.pkpTabs--side) > [role="tablist"] [role="tab"]').first().evaluate((b) => {
            const all = [...document.querySelectorAll('a[href], button, input, select, textarea, [tabindex]')]
                .filter((e) => e.tabIndex >= 0 && e.getClientRects().length && !b.parentElement.contains(e));
            const before = all.filter((e) => e.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING).pop();
            before?.focus();
        });
        out.tabkey = [{key: '(before)', ...(await state(page))}];
        for (let i = 0; i < 3; i++) {
            await page.keyboard.press('Tab');
            out.tabkey.push({key: 'Tab', ...(await state(page))});
        }
        record('result', out);
    } finally {
        await close();
    }
});
